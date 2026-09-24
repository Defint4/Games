"""REST (créer / rejoindre / lister) + WebSocket temps réel d'une table, tous jeux.

Flux : POST /api/rooms (jeu choisi) ou /api/rooms/{code}/join (authentifié) pour
s'asseoir, puis WS /api/rooms/{code}/ws?token=... pour jouer. Le serveur est seul
juge des règles : le client n'envoie que des intentions, jamais d'état.

La plateforme traite les actions communes (chat, emotes, bots, timer, revanche,
départ) ; tout le reste est confié à la GameSpec de la table.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import async_session_maker
from app.core.rate_limit import limiter
from app.core.security import decode_player_token
from app.games.base import GameError, GameSpec, GameStatus
from app.games.registry import get_game
from app.players import service as players_service
from app.players.dependencies import get_current_player
from app.players.models import Player
from app.rooms import lobby
from app.rooms.manager import Room, Seat, manager
from app.rooms.schemas import CreateRoomRequest, RoomOut, RoomStatusOut, open_room_summary
from app.rooms.views import room_view

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

CHAT_MAX_LENGTH = 200
EMOTE_PATTERN = re.compile(r"^[a-z0-9_\-]{1,30}$")
TURN_SECONDS_CHOICES = {0, 30, 60}
LOBBY_SEAT_GRACE_SECONDS = 10
# Revanche : le temps d'arriver sur la nouvelle table (chargement des ressources du jeu
# sur un réseau lent compris) avant d'être considéré comme parti.
REMATCH_SEAT_GRACE_SECONDS = 45
# Joueur déconnecté à son tour : coup joué d'office au bout de GameSpec.absent_seconds
# (même sur une table sans timer), et un bot prend sa place après ABSENT_STRIKES coups
# d'affilée.
ABSENT_STRIKES = 3
REPLACEMENT_BOT = "normal"
MAINTENANCE = "Mise à jour imminente : les nouvelles parties reviennent dans quelques minutes."
# Ce qu'on peut encore faire à une table en attente pendant la maintenance.
LOBBY_ACTIONS_IN_MAINTENANCE = {"sync", "leave", "chat", "emote"}
# Délai maximum d'un envoi WebSocket (voir send_bounded).
SEND_TIMEOUT = 5.0


# ---------------------------------------------------------------------------
# REST : créer, rejoindre, lister
# ---------------------------------------------------------------------------


def _seat(player: Player, spec: GameSpec) -> Seat:
    """Le joueur tel qu'il s'assoit, avec sa cote si le jeu est classé."""
    rating = None
    if spec.initial_rating is not None:
        stats = next((s for s in player.stats if s.game == spec.slug), None)
        rating = stats.rating if stats and stats.rating is not None else spec.initial_rating
    return Seat(player_id=player.id, pseudo=player.pseudo, avatar=player.avatar, rating=rating)


@router.post("", response_model=RoomOut)
@limiter.limit("10/minute")
async def create_room(
    request: Request, payload: CreateRoomRequest, player: Player = Depends(get_current_player)
) -> RoomOut:
    spec = get_game(payload.game)
    if spec is None:
        raise HTTPException(status_code=404, detail="Jeu inconnu.")
    if manager.maintenance:
        raise HTTPException(status_code=503, detail=MAINTENANCE)
    try:
        room = manager.create(spec, _seat(player, spec), payload.options)
    except GameError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    await lobby.notify(room.game)
    return RoomOut(code=room.code, game=room.game)


@router.post("/{code}/join", response_model=RoomOut)
@limiter.limit("30/minute")
async def join_room(
    request: Request, code: str, player: Player = Depends(get_current_player)
) -> RoomOut:
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    async with room.lock:
        if room.seat_of(player.id) is not None:
            return RoomOut(code=room.code, game=room.game)  # déjà assis : reconnexion
        if room.status is not GameStatus.LOBBY:
            raise HTTPException(status_code=403, detail="La partie a déjà commencé.")
        if manager.maintenance:
            # S'asseoir à une table en attente, c'est entrer dans une nouvelle partie
            # (aux échecs, la partie démarre même dès le deuxième joueur).
            raise HTTPException(status_code=503, detail=MAINTENANCE)
        try:
            room.spec.add_player(room.state, player.pseudo)
        except GameError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from None
        room.seats.append(_seat(player, room.spec))
        joined = {"type": "player_joined", "pseudo": player.pseudo}
        if room.status is GameStatus.PLAYING:
            # Jeu qui démarre dès que la table est pleine (échecs) : pendules, liste des
            # tables et diffusion passent par le chemin d'un coup joué.
            await _after_move(room, [joined, {"type": "game_started"}])
        else:
            room.touch()
            await _broadcast_state(room, [joined])
            await lobby.notify(room.game)
    return RoomOut(code=room.code, game=room.game)


@router.get("/{code}", response_model=RoomStatusOut)
async def room_status(code: str, player: Player = Depends(get_current_player)) -> RoomStatusOut:
    """Une table existe-t-elle encore, et le joueur y a-t-il sa place ? L'accueil s'en
    sert avant de proposer « Reprendre » : une table fantôme supprimée ne doit pas
    rester en bouton."""
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Partie introuvable.")
    return RoomStatusOut(
        code=room.code,
        game=room.game,
        status=room.status.value,
        seated=room.seat_of(player.id) is not None,
    )


@router.get("")
async def list_open_rooms(game: str | None = None) -> list[dict]:
    return [open_room_summary(room) for room in manager.open_rooms(game)]


@router.websocket("/live")
async def live_rooms(websocket: WebSocket, game: str) -> None:
    """Liste des tables ouvertes d'un jeu, poussée à chaque changement."""
    if get_game(game) is None:
        await websocket.close(code=4404)
        return
    await lobby.watch(websocket, game)


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@router.websocket("/{code}/ws")
async def room_ws(websocket: WebSocket, code: str) -> None:
    try:
        player_id, version = decode_player_token(websocket.query_params.get("token") or "")
    except jwt.InvalidTokenError:
        await websocket.close(code=4401)
        return
    # Jeton d'avant un changement de code PIN : cet appareil a été déconnecté.
    async with async_session_maker() as db:
        current = await db.scalar(select(Player.token_version).where(Player.id == player_id))
    if current != version:
        await websocket.close(code=4401)
        return
    room = manager.get(code)
    if room is None:
        await websocket.close(code=4404)
        return
    if room.seat_of(player_id) is None:
        await websocket.close(code=4403)  # s'asseoir d'abord via REST join
        return

    await websocket.accept()
    async with room.lock:
        seat_index = room.seat_of(player_id)
        if seat_index is None:
            await websocket.close(code=4403)
            return
        seat = room.seats[seat_index]
        if seat.socket is not None:
            # Nouvelle connexion (autre onglet / retour d'app) : elle remplace l'ancienne.
            try:
                await seat.socket.close(code=4000)
            except Exception:
                pass
        seat.socket = websocket
        seat.missed = 0
        room.touch()
        if seat.replaced:
            # De retour : il reprend sa place au bot qui jouait pour lui.
            seat.bot = None
            seat.replaced = False
            _schedule_turn_timer(room)
            room.spec.schedule_bots(room, _after_move)
        await _send_view(room, seat_index)
        await _broadcast_state(room, [])

    try:
        while True:
            message = await websocket.receive_json()
            await _handle_message(room, player_id, websocket, message)
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        pass  # socket déjà fermé (remplacé par une connexion plus récente)
    finally:
        await _handle_disconnect(room, player_id, websocket)


async def _handle_disconnect(room: Room, player_id: uuid.UUID, websocket: WebSocket) -> None:
    async with room.lock:
        seat_index = room.seat_of(player_id)
        if seat_index is None or room.seats[seat_index].socket is not websocket:
            return  # déjà remplacé par une connexion plus récente
        room.seats[seat_index].socket = None
        room.touch()
        if room.status is GameStatus.LOBBY:
            # En lobby, le siège n'est libéré qu'après un délai de grâce : un refresh
            # de page ne doit pas éjecter le joueur. En partie, le siège attend
            # la reconnexion sans limite.
            asyncio.get_running_loop().create_task(_expire_lobby_seat(room, player_id))
        elif room.status is GameStatus.PLAYING and room.spec.current_turn(room.state) == seat_index:
            _schedule_absence(room, seat_index)
        await _broadcast_state(room, [])


async def _expire_lobby_seat(
    room: Room, player_id: uuid.UUID, delay: float = LOBBY_SEAT_GRACE_SECONDS
) -> None:
    await asyncio.sleep(delay)
    async with room.lock:
        if manager.get(room.code) is not room or room.status is not GameStatus.LOBBY:
            return
        seat_index = room.seat_of(player_id)
        if seat_index is None or room.seats[seat_index].socket is not None:
            return  # parti autrement, ou revenu entre-temps
        await _free_seat(room, seat_index)


async def _free_seat(room: Room, seat_index: int) -> None:
    """Libère un siège de lobby ; supprime la table s'il n'y reste aucun humain."""
    room.spec.remove_player(room.state, seat_index)
    room.seats.pop(seat_index)
    if room.human_count() == 0:
        manager.delete(room.code)
        await lobby.notify(room.game)
        return
    room.humans_first()
    # Le partant était peut-être le seul pas prêt : la partie démarre sans lui (sauf en
    # maintenance : elle démarrera à la réouverture, voir set_maintenance). Et les
    # coups de bots programmés visaient d'anciens indices de sièges : on replanifie
    # (_after_move diffuse, met à jour la liste des tables et relance les bots).
    events = [] if manager.maintenance else room.spec.lobby_changed(room.state)
    await _after_move(room, [{"type": "player_left", "seat": seat_index}, *events])


async def _handle_message(
    room: Room, player_id: uuid.UUID, websocket: WebSocket, message: dict
) -> None:
    if not isinstance(message, dict):
        return
    action = str(message.get("action", ""))
    async with room.lock:
        seat_index = room.seat_of(player_id)
        if seat_index is None:
            return
        if (
            manager.maintenance
            and room.status is GameStatus.LOBBY
            and action not in LOBBY_ACTIONS_IN_MAINTENANCE
        ):
            # Se déclarer prêt, régler la table, ajouter un bot : tout ce qui prépare une
            # partie qui ne pourra pas démarrer.
            await _send_error(websocket, MAINTENANCE)
            return
        try:
            if action == "sync":
                # Retour d'arrière-plan sur mobile : le client redemande sa vue.
                await _send_view(room, seat_index)
            elif action == "leave":
                # Départ volontaire : en lobby le siège est libéré tout de suite
                # (pas de délai de grâce) ; en partie il attend un éventuel retour.
                if room.status is GameStatus.LOBBY:
                    room.seats[seat_index].socket = None
                    await _free_seat(room, seat_index)
                await websocket.close(code=1000)
            elif action == "add_bot":
                # Seul le créateur (siège 0) gère les bots, uniquement en lobby.
                difficulty = str(message.get("difficulty", ""))
                if room.status is not GameStatus.LOBBY:
                    await _send_error(websocket, "La partie a déjà commencé.")
                elif seat_index != 0:
                    await _send_error(websocket, "Seul le créateur de la table ajoute des bots.")
                elif difficulty not in room.spec.bot_difficulties:
                    await _send_error(websocket, "Difficulté inconnue.")
                else:
                    seat = room.spec.add_bot(room, difficulty)
                    await _after_move(room, [{"type": "player_joined", "pseudo": seat.pseudo}])
            elif action == "remove_bot":
                target = int(message["seat"])
                if room.status is not GameStatus.LOBBY:
                    await _send_error(websocket, "La partie a déjà commencé.")
                elif seat_index != 0:
                    await _send_error(websocket, "Seul le créateur de la table retire des bots.")
                elif not (0 <= target < len(room.seats)) or room.seats[target].bot is None:
                    await _send_error(websocket, "Ce siège n'est pas un bot.")
                else:
                    room.spec.remove_player(room.state, target)
                    room.seats.pop(target)
                    await _after_move(room, [{"type": "player_left", "seat": target}])
            elif action == "chat":
                text = str(message.get("text", "")).strip()[:CHAT_MAX_LENGTH]
                if text:
                    entry = {"type": "chat", "seat": seat_index, "text": text}
                    room.add_chat(entry)
                    room.touch()
                    await _broadcast(room, entry)
            elif action == "emote":
                emote = str(message.get("emote", ""))
                target = message.get("target")
                if target is not None:
                    target = int(target)
                    if not (0 <= target < len(room.seats)):
                        target = None
                if EMOTE_PATTERN.fullmatch(emote):
                    room.touch()
                    await _broadcast(
                        room,
                        {"type": "emote", "seat": seat_index, "emote": emote, "target": target},
                    )
            elif action == "config":
                # Seul le créateur (siège 0) règle la table, et uniquement en lobby.
                seconds = int(message.get("turn_seconds", 0))
                if room.status is not GameStatus.LOBBY:
                    await _send_error(websocket, "La partie a déjà commencé.")
                elif seat_index != 0:
                    await _send_error(websocket, "Seul le créateur de la table règle le temps.")
                elif seconds not in TURN_SECONDS_CHOICES:
                    await _send_error(websocket, "Durée de tour invalide.")
                else:
                    room.turn_seconds = seconds
                    room.touch()
                    await _broadcast_state(room, [])
            elif action == "rematch":
                await _handle_rematch(room, websocket)
            else:
                events = room.spec.handle_action(room, seat_index, action, message)
                if events is None:
                    await _send_error(websocket, "Action inconnue.")
                else:
                    room.seats[seat_index].missed = 0
                    await _after_move(room, events)
        except GameError as exc:
            await _send_error(websocket, str(exc))
        except (KeyError, TypeError, ValueError):
            await _send_error(websocket, "Message mal formé.")


async def _after_move(room: Room, events: list[dict]) -> None:
    """Après tout changement d'état de jeu : compteurs, stats, timer, diffusion, bots."""
    room.touch()
    room.spec.on_events(room, events)
    finished = room.status is GameStatus.FINISHED and not room.stats_recorded
    if finished:
        room.stats_recorded = True
        # Le délai de grâce de la maintenance couvre l'enregistrement des stats, puis
        # repart de sa fin : un redémarrage ne doit pas les couper en pleine écriture.
        manager.last_game_end = time.monotonic()
        await _record_stats(room)
        manager.last_game_end = time.monotonic()
        room.spec.on_game_over(room)
    _schedule_turn_timer(room)
    await _broadcast_state(room, events)
    # La liste des tables ouvertes bouge tant qu'on est en lobby, et au démarrage.
    if room.status is GameStatus.LOBBY or any(e["type"] == "game_started" for e in events):
        await lobby.notify(room.game)
    # En maintenance, les bots d'une table en attente ne se déclarent plus prêts.
    if not (manager.maintenance and room.status is GameStatus.LOBBY):
        room.spec.schedule_bots(room, _after_move)
    if finished and manager.maintenance:
        # Peut-être la dernière partie en cours : la fermeture approche.
        await announce_maintenance()


def _schedule_turn_timer(room: Room) -> None:
    """(Re)programme l'échéance du tour courant ; invalide le timer précédent."""
    room.turn_token += 1
    if room.status is not GameStatus.PLAYING:
        room.turn_deadline = None
        return
    seat = room.spec.current_turn(room.state)
    if seat is not None and room.seats[seat].bot is None and room.seats[seat].socket is None:
        _schedule_absence(room, seat)
    if room.turn_seconds <= 0:
        room.turn_deadline = None
        return
    room.turn_deadline = time.monotonic() + room.turn_seconds
    asyncio.get_running_loop().create_task(_turn_timeout(room, room.turn_token, room.turn_seconds))


def _schedule_absence(room: Room, seat_index: int) -> None:
    """Le joueur au trait est déconnecté : son coup partira d'office au bout de
    GameSpec.absent_seconds, sauf s'il revient ou si le tour change (turn_token)."""
    asyncio.get_running_loop().create_task(_absence_timeout(room, room.turn_token, seat_index))


async def _absence_timeout(room: Room, token: int, seat_index: int) -> None:
    await asyncio.sleep(room.spec.absent_seconds)
    async with room.lock:
        if (
            manager.get(room.code) is not room
            or room.turn_token != token
            or room.status is not GameStatus.PLAYING
            or room.spec.current_turn(room.state) != seat_index
        ):
            return
        seat = room.seats[seat_index]
        if seat.socket is not None or seat.bot is not None:
            return
        try:
            events = room.spec.auto_play(room, seat_index)
        except Exception:
            logger.exception("Coup d'office impossible sur la table %s", room.code)
            return
        events = [{"type": "auto_played", "player": seat_index}, *events]
        await _after_move(room, events + _strike(room, seat_index))


def _strike(room: Room, seat_index: int) -> list[dict]:
    """Un coup joué d'office pour un joueur déconnecté ; au troisième d'affilée, un bot
    prend sa place (il la reprendra en se reconnectant)."""
    seat = room.seats[seat_index]
    if seat.bot is not None or seat.socket is not None:
        return []
    seat.missed += 1
    if seat.missed < ABSENT_STRIKES or REPLACEMENT_BOT not in room.spec.bot_difficulties:
        return []
    seat.bot = REPLACEMENT_BOT
    seat.replaced = True
    return [{"type": "replaced_by_bot", "seat": seat_index}]


async def _turn_timeout(room: Room, token: int, delay: float) -> None:
    await asyncio.sleep(delay)
    async with room.lock:
        if (
            manager.get(room.code) is not room
            or room.turn_token != token
            or room.status is not GameStatus.PLAYING
        ):
            return
        seat = room.spec.current_turn(room.state)
        if seat is None:
            return
        try:
            events = room.spec.auto_play(room, seat)
        except Exception:
            logger.exception("Coup automatique impossible sur la table %s", room.code)
            return
        events = [{"type": "auto_played", "player": seat}, *events]
        await _after_move(room, events + _strike(room, seat))


async def _handle_rematch(room: Room, websocket: WebSocket) -> None:
    """Crée une table de revanche avec les joueurs encore connectés et les y emmène."""
    if room.status is not GameStatus.FINISHED:
        await _send_error(websocket, "La revanche se lance en fin de partie.")
        return
    if room.rematch_code and manager.get(room.rematch_code):
        await _broadcast(room, {"type": "rematch", "code": room.rematch_code})
        return
    if manager.maintenance:
        await _send_error(websocket, MAINTENANCE)
        return
    if room.spec.rematch_consent:
        # Revanche d'un commun accord : on attend que chaque humain l'ait demandée.
        seat_index = next(i for i, s in enumerate(room.seats) if s.socket is websocket)
        room.rematch_votes.add(seat_index)
        humans = {i for i, s in enumerate(room.seats) if s.bot is None}
        if not humans <= room.rematch_votes:
            room.touch()
            await _broadcast_state(room, [{"type": "rematch_asked", "seat": seat_index}])
            return
    # Les humains connectés d'abord (le siège 0 doit rester un humain), puis les bots.
    # Un bot qui remplaçait un absent ne suit pas : la place revient à l'absent, pas au bot.
    connected = [s for s in room.seats if s.socket is not None] + [
        s for s in room.seats if s.bot and not s.replaced
    ]
    if len(connected) < room.spec.min_players:
        await _send_error(websocket, "Il faut au moins deux joueurs connectés pour une revanche.")
        return
    first = connected[0]
    new_room = manager.create(
        room.spec,
        Seat(
            player_id=first.player_id, pseudo=first.pseudo, avatar=first.avatar, rating=first.rating
        ),
        {**room.options, **room.spec.rematch_options(room)},
    )
    for seat in connected[1:]:
        # Les sièges d'abord : un jeu qui démarre dès que la table est pleine (échecs)
        # doit trouver tout le monde assis.
        new_room.seats.append(
            Seat(
                player_id=seat.player_id,
                pseudo=seat.pseudo,
                avatar=seat.avatar,
                bot=seat.bot,
                rating=seat.rating,
            )
        )
        room.spec.add_player(new_room.state, seat.pseudo)
    new_room.turn_seconds = room.turn_seconds
    # Un joueur qui ne rejoindra jamais la revanche (téléphone verrouillé sur l'écran de
    # fin) ne doit pas bloquer le lobby : même délai de grâce qu'une déconnexion.
    loop = asyncio.get_running_loop()
    for seat in new_room.seats:
        if seat.bot is None:
            loop.create_task(
                _expire_lobby_seat(new_room, seat.player_id, REMATCH_SEAT_GRACE_SECONDS)
            )
    room.rematch_code = new_room.code
    room.touch()
    await _broadcast(room, {"type": "rematch", "code": new_room.code})
    await lobby.notify(room.game)
    # Maintenance lancée pendant les envois ci-dessus : ses bots attendront la réouverture.
    if not manager.maintenance:
        room.spec.schedule_bots(new_room, _after_move)


async def _record_stats(room: Room) -> None:
    try:
        async with async_session_maker() as db:
            if await room.spec.record_results(room, db):
                return
    except Exception:
        logger.exception("Échec de l'enregistrement de la partie %s", room.code)
        return
    results = room.spec.results(room)
    humans = [seat.player_id for seat in room.seats if seat.bot is None]
    if results is None or not humans:
        return
    winner_seat, loser_seat = results
    try:
        async with async_session_maker() as db:
            # Seuls les humains ont un profil ; un bot gagnant ou perdant n'apparaît nulle part.
            await players_service.record_game_results(
                db,
                room.game,
                humans,
                winner_id=room.seats[winner_seat].player_id,
                loser_id=room.seats[loser_seat].player_id,
            )
    except Exception:
        logger.exception("Échec de l'enregistrement des stats de la partie %s", room.code)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------


async def set_maintenance(enabled: bool) -> None:
    """Interrupteur du panneau admin : ferme (ou rouvre) l'arrivée de nouvelles parties."""
    manager.maintenance = enabled
    if enabled:
        # Un bot allait se déclarer prêt et lancer la partie : son coup est annulé, pour
        # toutes les tables d'un coup, avant de céder la main (le jeton est relu sous le
        # verrou au moment d'agir).
        for room in manager.rooms.values():
            if room.status is GameStatus.LOBBY:
                room.bot_token += 1
    else:
        for room in list(manager.rooms.values()):
            if room.status is not GameStatus.LOBBY:
                continue
            async with room.lock:
                if manager.get(room.code) is not room or room.status is not GameStatus.LOBBY:
                    continue
                # Réouverture : une table dont tout le monde était prêt démarre enfin, et
                # ses bots reprennent (_after_move replanifie).
                await _after_move(room, room.spec.lobby_changed(room.state))
    await announce_maintenance()


async def announce_maintenance() -> None:
    """Prévient à l'instant tous les écrans reliés au serveur (tables, accueils de jeu)
    quand l'état de maintenance change ; les autres pages le lisent sur /api/status."""
    phase = manager.maintenance_phase()
    if phase != manager.announced_phase:
        manager.announced_phase = phase
        message = {"type": "maintenance", "phase": phase}
        await asyncio.gather(
            *(
                send_bounded(seat.socket, message)
                for room in list(manager.rooms.values())
                for seat in list(room.seats)
                if seat.socket is not None
            ),
            lobby.broadcast_all(message),
        )
    if phase == "draining" and manager.grace_left() > 0:
        # Plus de partie en cours, seul le délai de grâce retient la fermeture : on
        # annoncera « locked » à son terme.
        asyncio.get_running_loop().create_task(_announce_later(manager.grace_left() + 0.2))


async def _announce_later(delay: float) -> None:
    await asyncio.sleep(delay)
    await announce_maintenance()


async def send_bounded(socket: WebSocket, message: dict) -> None:
    """Envoi qui ne peut pas figer la table : l'envoi attend que le client ait vidé son
    tampon, et un téléphone sur un réseau qui cale le retiendrait sous room.lock. Au-delà
    de SEND_TIMEOUT, rien n'est parti (uvicorn attend avant d'écrire) : on coupe ce
    client, qui se reconnecte et reçoit à nouveau sa vue et le chat."""
    try:
        await asyncio.wait_for(socket.send_json(message), SEND_TIMEOUT)
    except TimeoutError:
        asyncio.get_running_loop().create_task(drop_socket(socket))
    except Exception:
        pass


async def drop_socket(socket: WebSocket) -> None:
    """Ferme un client qui ne suit plus (1013 : « réessaie plus tard », le client se
    reconnecte). Hors du verrou de la table : la fermeture peut elle aussi attendre."""
    try:
        await asyncio.wait_for(socket.close(code=1013), 2)
    except Exception:
        pass


async def _send_view(room: Room, seat_index: int) -> None:
    socket = room.seats[seat_index].socket
    if socket is None:
        return
    view = room_view(room, seat_index)
    await send_bounded(socket, {"type": "state", "events": [], "view": view, "chat": room.chat})


async def _broadcast_state(room: Room, events: list[dict]) -> None:
    # Tous les sièges en même temps : un client lent ne retarde pas les autres.
    await asyncio.gather(
        *(
            send_bounded(
                seat.socket, {"type": "state", "events": events, "view": room_view(room, i)}
            )
            for i, seat in enumerate(list(room.seats))
            if seat.socket is not None
        )
    )


async def _broadcast(room: Room, message: dict) -> None:
    await asyncio.gather(
        *(send_bounded(s.socket, message) for s in list(room.seats) if s.socket is not None)
    )


async def _send_error(websocket: WebSocket, detail: str) -> None:
    await send_bounded(websocket, {"type": "error", "detail": detail})
