"""Branchement de RT1 sur la plateforme : les courses en direct.

Une table = un circuit et jusqu'à 8 pilotes. Chacun roule sur son appareil ; le serveur
donne le top départ (une heure commune à tous), relaie les poses dix fois par seconde
(GameSpec.relay, sans passer par l'état) et reçoit les arrivées. La course finit quand
tout le monde est arrivé, 30 s après le premier, ou au bout de 10 min. Chacun est alors
payé comme pour une course solo (record, médailles, missions) plus une prime selon la
place, et la victoire compte dans les stats du hub.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import math
import re
import time
import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.games.base import DEV_GAMES, AfterMove, Event, GameError, GameSpec, GameStatus
from app.games.rt1 import rules, service
from app.players import service as players_service
from app.rooms.manager import Room, manager

logger = logging.getLogger(__name__)

SLUG = "rt1"
MIN_PILOTS = 2
# Le top départ, quelques secondes après le dernier « prêt » : le temps que chaque
# appareil finisse de se caler sur l'horloge du serveur.
START_DELAY = 5.0
# Après le premier arrivé, ce qu'on laisse aux autres avant de clore la course.
WAIT_AFTER_FIRST = 30.0
# Une course dure de 30 s à 2 min ; au-delà, personne n'arrivera plus.
MAX_RACE = 600.0
MAX_TIME_MS = 600_000
MAX_GHOST_CHARS = 520_000
# Le temps mesuré par le serveur fait foi ; celui du téléphone est gardé s'il en est
# proche (il est plus précis, au centième), sinon c'est celui du serveur.
TIME_TOLERANCE_MS = 1500
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

ALREADY_STARTED = "La partie a déjà commencé."
NOT_RACING = "La course n'est pas en cours."
NOT_CREATOR = "Seul le créateur de la table choisit le circuit."
ALREADY_FINISHED = "Tu as déjà passé la ligne."
UNKNOWN_CIRCUIT = "Circuit inconnu."
UNKNOWN_VEHICLE = "Véhicule inconnu."


@dataclass
class Pilot:
    pseudo: str
    ready: bool = False
    # Ce que le client annonce en lobby : son véhicule, la couleur de sa livrée, son
    # indice de performance (véhicule vérifié au paiement, comme une course solo).
    vehicle: str = rules.STARTER
    color: str = "#E8552B"
    pi: int | None = None
    # L'arrivée, ou l'abandon.
    time_ms: int | None = None
    splits: list[int] = field(default_factory=list)
    ghost: bytes | None = None
    dnf: bool = False
    # Heure (monotone) de l'arrivée vue par le serveur : départage les temps égaux.
    finished_at: float | None = None
    # Après la course : ce que le serveur a payé (service.Arrival), pour l'écran de fin.
    gains: list[dict] | None = None
    record: bool = False
    level_before: int | None = None
    level: int | None = None

    def done(self) -> bool:
        return self.time_ms is not None or self.dnf

    def reset_race(self) -> None:
        self.time_ms = None
        self.splits = []
        self.ghost = None
        self.dnf = False
        self.finished_at = None
        self.gains = None
        self.record = False
        self.level_before = None
        self.level = None


@dataclass
class RaceState:
    circuit: str = "noumea"
    status: GameStatus = GameStatus.LOBBY
    players: list[Pilot] = field(default_factory=list)
    # Top départ : heure du serveur (time.time(), envoyée aux clients) et horloge
    # monotone (échéances).
    start_at: float | None = None
    start_mono: float | None = None
    first_finish: float | None = None


# --- Règles ------------------------------------------------------------------------


def create_game(creator: str) -> RaceState:
    return RaceState(players=[Pilot(creator)])


def add_player(state: RaceState, pseudo: str) -> None:
    if state.status is not GameStatus.LOBBY:
        raise GameError(ALREADY_STARTED)
    if len(state.players) >= rules.MAX_PILOTS:
        raise GameError("La partie est pleine.")
    state.players.append(Pilot(pseudo))


def set_ready(state: RaceState, seat: int, ready: bool, circuit: str | None = None) -> list[Event]:
    if state.status is not GameStatus.LOBBY:
        raise GameError(ALREADY_STARTED)
    # Un « prêt » parti pour un autre circuit (le créateur vient d'en changer) ne compte pas :
    # ce pilote n'a pas encore chargé le bon décor.
    if ready and circuit is not None and circuit != state.circuit:
        return []
    state.players[seat].ready = ready
    if len(state.players) >= MIN_PILOTS and all(p.ready for p in state.players):
        return _start(state)
    return []


def _start(state: RaceState) -> list[Event]:
    for p in state.players:
        p.reset_race()
    state.status = GameStatus.PLAYING
    state.start_at = time.time() + START_DELAY
    state.start_mono = time.monotonic() + START_DELAY
    state.first_finish = None
    return [{"type": "game_started"}]


def setup(state: RaceState, seat: int, message: dict) -> list[Event]:
    """Le pilote annonce son véhicule, sa couleur et son indice (en lobby)."""
    if state.status is not GameStatus.LOBBY:
        raise GameError(ALREADY_STARTED)
    pilot = state.players[seat]
    vehicle = str(message.get("vehicle", pilot.vehicle))
    if vehicle not in rules.VEHICLES:
        raise GameError(UNKNOWN_VEHICLE)
    color = str(message.get("color", pilot.color))
    if not HEX.fullmatch(color):
        raise ValueError(color)
    pi = message.get("pi")
    pilot.vehicle = vehicle
    pilot.color = color
    pilot.pi = None if pi is None else max(0, min(5000, int(pi)))
    return []


def choose_circuit(state: RaceState, seat: int, circuit: str) -> list[Event]:
    """Le créateur change de circuit : tout le monde doit se redire prêt (le décor est à
    recharger)."""
    if state.status is not GameStatus.LOBBY:
        raise GameError(ALREADY_STARTED)
    if seat != 0:
        raise GameError(NOT_CREATOR)
    if circuit not in rules.CIRCUITS:
        raise GameError(UNKNOWN_CIRCUIT)
    if circuit == state.circuit:
        return []
    state.circuit = circuit
    for p in state.players:
        p.ready = False
    return [{"type": "circuit_changed", "circuit": circuit}]


def finish(state: RaceState, seat: int, message: dict, now: float) -> list[Event]:
    if state.status is not GameStatus.PLAYING or state.start_mono is None:
        raise GameError(NOT_RACING)
    pilot = state.players[seat]
    claimed = int(message["time_ms"])
    if pilot.done():
        # Arrivée renvoyée (reconnexion) : la même, sans erreur ; une autre, refusée.
        if pilot.time_ms == claimed:
            return []
        raise GameError(ALREADY_FINISHED)
    if not 0 < claimed <= MAX_TIME_MS:
        raise ValueError(claimed)
    elapsed_ms = round((now - state.start_mono) * 1000)
    if elapsed_ms <= 0:
        raise GameError(NOT_RACING)
    # Le serveur a vu s'écouler elapsed_ms depuis le top départ (moins le trajet du
    # message) : le temps du téléphone est gardé s'il en est proche, sinon remplacé.
    time_ms = claimed if abs(claimed - elapsed_ms) <= TIME_TOLERANCE_MS else elapsed_ms
    if not rules.plausible_time(state.circuit, time_ms):
        raise ValueError(time_ms)
    raw_splits = message.get("splits", [])
    if not isinstance(raw_splits, list):
        raise ValueError("splits")
    splits = [int(s) for s in raw_splits[:64]]
    if time_ms != claimed:
        # Les passages datés par le téléphone sont recalés sur le temps retenu.
        splits = [s + (time_ms - claimed) for s in splits]
    if not rules.plausible_splits(state.circuit, time_ms, splits):
        raise ValueError("splits")
    ghost = message.get("ghost")
    if ghost is not None:
        ghost = str(ghost)
        if len(ghost) > MAX_GHOST_CHARS:
            raise ValueError("ghost")
        try:
            ghost = base64.b64decode(ghost, validate=True)
        except binascii.Error:
            raise ValueError("ghost") from None
        if not rules.plausible_ghost(claimed, ghost):
            ghost = None
    pilot.time_ms = time_ms
    pilot.splits = splits
    pilot.ghost = ghost
    pilot.finished_at = now
    if state.first_finish is None:
        state.first_finish = now
    return [{"type": "pilot_finished", "seat": seat, "time_ms": time_ms}, *_maybe_end(state)]


def give_up(state: RaceState, seat: int) -> list[Event]:
    if state.status is not GameStatus.PLAYING:
        raise GameError(NOT_RACING)
    pilot = state.players[seat]
    if pilot.done():
        return []
    pilot.dnf = True
    return [{"type": "pilot_out", "seat": seat}, *_maybe_end(state)]


def _maybe_end(state: RaceState) -> list[Event]:
    if not all(p.done() for p in state.players):
        return []
    return _end(state)


def _end(state: RaceState) -> list[Event]:
    for p in state.players:
        if not p.done():
            p.dnf = True
    state.status = GameStatus.FINISHED
    return [{"type": "race_over", "places": places(state)}]


def next_deadline(state: RaceState, now: float) -> float | None:
    """Dans combien de temps clore la course d'office, None hors course."""
    if state.status is not GameStatus.PLAYING or state.start_mono is None:
        return None
    deadline = state.start_mono + MAX_RACE
    if state.first_finish is not None:
        deadline = min(deadline, state.first_finish + WAIT_AFTER_FIRST)
    return max(0.0, deadline - now)


def check_time(state: RaceState, now: float) -> list[Event]:
    delay = next_deadline(state, now)
    if delay is None or delay > 0:
        return []
    return _end(state)


def places(state: RaceState) -> list[int]:
    """Les sièges dans l'ordre d'arrivée : les arrivés au temps, puis les autres."""
    order = sorted(
        range(len(state.players)),
        key=lambda i: (
            state.players[i].time_ms is None,
            state.players[i].time_ms or 0,
            state.players[i].finished_at or 0.0,
            i,
        ),
    )
    return order


# --- Échéance : une tâche par table, comme la pendule des échecs --------------------


def schedule(room: Room, after_move: AfterMove) -> None:
    room.bot_token += 1
    delay = next_deadline(room.state, time.monotonic())
    if delay is None:
        return
    asyncio.get_running_loop().create_task(_watch(room, room.bot_token, delay, after_move))


async def _watch(room: Room, token: int, delay: float, after_move: AfterMove) -> None:
    await asyncio.sleep(delay)
    async with room.lock:
        if manager.get(room.code) is not room or room.bot_token != token:
            return
        events = check_time(room.state, time.monotonic())
        if events:
            await after_move(room, events)
        else:
            schedule(room, after_move)


# --- La GameSpec ---------------------------------------------------------------------


class Rt1Race(GameSpec):
    slug = SLUG
    name = "RT1"
    min_players = MIN_PILOTS
    max_players = rules.MAX_PILOTS

    # --- État ----------------------------------------------------------------

    def create_state(self, creator_pseudo: str) -> RaceState:
        return create_game(creator_pseudo)

    def configure(self, state: RaceState, options: dict) -> None:
        circuit = options.get("circuit")
        if circuit is None:
            return
        if circuit not in rules.CIRCUITS:
            raise GameError(UNKNOWN_CIRCUIT)
        state.circuit = circuit

    def rematch_options(self, room: Room) -> dict:
        return {"circuit": room.state.circuit}

    def add_player(self, state: RaceState, pseudo: str) -> None:
        add_player(state, pseudo)

    def remove_player(self, state: RaceState, seat: int) -> None:
        del state.players[seat]

    def rotate_players(self, state: RaceState, k: int) -> None:
        state.players[:] = state.players[k:] + state.players[:k]

    def lobby_changed(self, state: RaceState) -> list[Event]:
        return set_ready(state, 0, state.players[0].ready) if state.players else []

    def status(self, state: RaceState) -> GameStatus:
        return state.status

    def current_turn(self, state: RaceState) -> int | None:
        return None

    def summary(self, room: Room) -> dict:
        return {"circuit": room.state.circuit}

    # --- Vue et actions --------------------------------------------------------

    def view(self, room: Room, seat: int) -> dict:
        state: RaceState = room.state
        delay = next_deadline(state, time.monotonic())
        waiting = delay is not None and state.first_finish is not None
        return {
            "circuit": state.circuit,
            "start_at": state.start_at,
            # L'heure du serveur à l'envoi : un premier calage, affiné par ping.
            "server_time": time.time(),
            # Premier arrivé : secondes laissées aux autres avant la clôture.
            "finish_deadline": round(delay, 1) if waiting else None,
            "places": places(state),
            "players": [
                {
                    "ready": p.ready,
                    "vehicle": p.vehicle,
                    "color": p.color,
                    "time_ms": p.time_ms,
                    "splits": p.splits,
                    "dnf": p.dnf,
                    "gains": p.gains,
                    "record": p.record,
                    "level_before": p.level_before,
                    "level": p.level,
                }
                for p in state.players
            ],
        }

    def handle_action(
        self, room: Room, seat: int, action: str, message: dict
    ) -> list[Event] | None:
        state: RaceState = room.state
        if action == "ready":
            circuit = message.get("circuit")
            return set_ready(
                state,
                seat,
                bool(message.get("ready", True)),
                None if circuit is None else str(circuit),
            )
        if action == "setup":
            return setup(state, seat, message)
        if action == "circuit":
            return choose_circuit(state, seat, str(message["circuit"]))
        if action == "finish":
            return finish(state, seat, message, time.monotonic())
        if action == "dnf":
            return give_up(state, seat)
        return None

    def relay(self, room: Room, seat: int, action: str, message: dict) -> dict | None:
        if action != "pose":
            return None
        state: RaceState = room.state
        if state.status is not GameStatus.PLAYING:
            raise ValueError("pas en course")  # hors course : rien à transmettre
        # t, x, y, z, qx, qy, qz, qw, porte suivante : neuf nombres, arrondis court.
        d = message["d"]
        if not isinstance(d, list) or len(d) != 9:
            raise ValueError("pose")
        nums = [float(x) for x in d]
        if not all(math.isfinite(x) for x in nums):
            raise ValueError("pose")
        t, x, y, z, qx, qy, qz, qw, gate = nums
        if not (0 <= t <= MAX_RACE and abs(x) < 5000 and abs(y) < 500 and abs(z) < 5000):
            raise ValueError("pose")
        if abs(qx * qx + qy * qy + qz * qz + qw * qw - 1) > 0.05 or not 0 <= gate <= 64:
            raise ValueError("pose")
        return {"d": [round(v, 3) for v in nums[:8]] + [int(gate)]}

    def auto_play(self, room: Room, seat: int) -> list[Event]:
        return []

    # --- Fin de course -----------------------------------------------------------

    def results(self, room: Room) -> tuple[int, int] | None:
        state: RaceState = room.state
        order = places(state)
        if state.players[order[0]].time_ms is None:
            return None
        return order[0], order[-1]

    async def record_results(self, room: Room, db: AsyncSession) -> bool:
        """Chaque arrivé est payé comme pour une course solo, plus la prime de sa place ;
        le vainqueur et le dernier comptent dans les stats du hub."""
        state: RaceState = room.state
        order = places(state)
        count = len(state.players)
        for place, seat_index in enumerate(order, 1):
            pilot = state.players[seat_index]
            if pilot.time_ms is None:
                continue
            player_id: uuid.UUID = room.seats[seat_index].player_id
            try:
                arrival = await service.finish(
                    db,
                    player_id,
                    state.circuit,
                    pilot.time_ms,
                    pilot.splits,
                    pilot.ghost,
                    vehicle=pilot.vehicle,
                    pi=pilot.pi,
                    online=service.OnlineResult(count, place),
                )
            except service.NotOwned:
                logger.warning("Course %s : véhicule %s pas au garage", room.code, pilot.vehicle)
                continue
            pilot.gains = [{"kind": g.kind, "money": g.money, "id": g.id} for g in arrival.gains]
            pilot.record = arrival.record
            pilot.level_before = arrival.level_before
            pilot.level = rules.level_for(arrival.state.xp)
        results = self.results(room)
        # Tant que le jeu est en développement, rien dans les stats du hub (ses essais ne
        # doivent pas peser dans le classement général).
        if results is not None and self.slug not in DEV_GAMES:
            winner, loser = results
            await players_service.record_game_results(
                db,
                self.slug,
                [s.player_id for s in room.seats],
                winner_id=room.seats[winner].player_id,
                loser_id=room.seats[loser].player_id,
            )
        return True

    def schedule_bots(self, room: Room, after_move: AfterMove) -> None:
        # Pas de bot serveur : le crochet surveille l'échéance de la course.
        schedule(room, after_move)
