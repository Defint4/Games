"""Le panneau d'administration : mot de passe, journal, vue d'ensemble, joueurs, tables.

Les tables vivent en mémoire (RoomManager) : ce module les lit et les ferme sous leur
verrou, comme le routeur des tables. Tout le reste est en base.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import WebSocket
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import AdminCredential, AdminEvent
from app.core.security import hash_password, verify_password
from app.core.version import VERSION
from app.games.base import GameStatus
from app.players import service as players_service
from app.players.models import Player, PlayerGameStats
from app.rooms import lobby
from app.rooms.manager import Room, manager

MAX_FAILURES = 5
LOCK = timedelta(hours=1)
PASSWORD_MIN_LENGTH = 12

_STARTED = time.monotonic()


class WrongPassword(Exception):
    pass


class Locked(Exception):
    pass


# ---------------------------------------------------------------------------
# Identité et mot de passe
# ---------------------------------------------------------------------------


async def is_admin(db: AsyncSession, player_id: uuid.UUID) -> bool:
    found = await db.scalar(
        select(AdminCredential.player_id).where(AdminCredential.player_id == player_id)
    )
    return found is not None


async def get_credential(db: AsyncSession, player_id: uuid.UUID) -> AdminCredential | None:
    return await db.get(AdminCredential, player_id)


async def check_password(db: AsyncSession, player_id: uuid.UUID, password: str) -> AdminCredential:
    """Ligne verrouillée (FOR UPDATE) : les essais passent un par un et le compteur ne se
    contourne pas en rafale. Après MAX_FAILURES échecs d'affilée, bloqué LOCK."""
    cred = await db.get(AdminCredential, player_id, with_for_update=True, populate_existing=True)
    now = datetime.now(UTC)
    if cred.locked_until is not None and cred.locked_until > now:
        raise Locked
    # scrypt admin occupe ~100 ms de processeur : hors de la boucle des tables.
    if await asyncio.to_thread(verify_password, password, cred.password_hash):
        cred.failures = 0
        cred.locked_until = None
        await db.commit()
        return cred
    cred.failures += 1
    if cred.failures >= MAX_FAILURES:
        cred.failures = 0
        cred.locked_until = now + LOCK
    await db.commit()
    raise WrongPassword


async def set_password(db: AsyncSession, player: Player, password: str) -> None:
    """Pose (ou change) le mot de passe admin de ce compte ; les sessions admin ouvertes
    tombent. Un seul administrateur : un autre compte admin est refusé par l'appelant."""
    password_hash = await asyncio.to_thread(hash_password, password)
    cred = await db.get(AdminCredential, player.id)
    if cred is None:
        db.add(AdminCredential(player_id=player.id, password_hash=password_hash, session_version=0))
    else:
        cred.password_hash = password_hash
        cred.session_version += 1
        cred.failures = 0
        cred.locked_until = None
    await db.commit()


async def record(
    db: AsyncSession,
    action: str,
    ip: str | None,
    target: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(AdminEvent(action=action, target=target, detail=detail, ip=ip))
    await db.commit()


async def events(db: AsyncSession, offset: int, limit: int) -> tuple[int, list[AdminEvent]]:
    total = await db.scalar(select(func.count()).select_from(AdminEvent))
    rows = await db.scalars(
        select(AdminEvent).order_by(AdminEvent.id.desc()).offset(offset).limit(limit)
    )
    return total or 0, list(rows)


# ---------------------------------------------------------------------------
# Vue d'ensemble
# ---------------------------------------------------------------------------


def _rss_mb() -> float | None:
    """Mémoire occupée par l'API (Linux)."""
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        return None
    return None


def online_ids() -> set[uuid.UUID]:
    """Joueurs connectés à une table en ce moment."""
    return {
        seat.player_id
        for room in manager.rooms.values()
        for seat in room.seats
        if seat.socket is not None
    }


async def overview(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    week = now - timedelta(days=7)
    counts = (
        await db.execute(
            select(
                func.count().label("total"),
                func.count().filter(Player.created_at >= now - timedelta(days=1)).label("new_day"),
                func.count().filter(Player.created_at >= week).label("new_week"),
                func.count().filter(Player.last_seen_at >= week).label("active_week"),
                func.count().filter(Player.pin_hash.is_(None)).label("default_pin"),
                func.count().filter(Player.pin_locked_until > now).label("locked"),
                func.count().filter(Player.suspended_at.is_not(None)).label("suspended"),
            )
        )
    ).one()
    per_game = await db.execute(
        select(
            PlayerGameStats.game,
            func.count().label("players"),
            func.sum(PlayerGameStats.played).label("played"),
        ).group_by(PlayerGameStats.game)
    )
    rooms = sorted(manager.rooms.values(), key=_room_order)
    return {
        "players": counts._asdict(),
        "games": {row.game: {"players": row.players, "played": row.played} for row in per_game},
        "online": len(online_ids()),
        "watchers": lobby.watcher_count(),
        "rooms": [room_summary(r) for r in rooms],
        "maintenance": manager.maintenance,
        "maintenance_phase": manager.maintenance_phase(),
        "server": {
            "version": VERSION,
            "uptime_s": int(time.monotonic() - _STARTED),
            "memory_mb": _rss_mb(),
        },
    }


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

_STATUS_ORDER = {GameStatus.PLAYING: 0, GameStatus.LOBBY: 1, GameStatus.FINISHED: 2}


def _room_order(room: Room) -> tuple:
    return (_STATUS_ORDER[room.status], -room.last_activity.timestamp())


def room_summary(room: Room) -> dict:
    status = room.status
    return {
        "code": room.code,
        "game": room.game,
        "status": status.value,
        "created_at": room.created_at,
        "last_activity": room.last_activity,
        "turn": room.spec.current_turn(room.state) if status is GameStatus.PLAYING else None,
        "turn_seconds": room.turn_seconds,
        "options": room.options,
        "chat_count": len(room.chat),
        "seats": [
            {
                "player_id": seat.player_id if seat.bot is None or seat.replaced else None,
                "pseudo": seat.pseudo,
                "avatar": seat.avatar,
                "bot": seat.bot,
                "replaced": seat.replaced,
                "connected": seat.socket is not None,
                "rating": seat.rating,
            }
            for seat in room.seats
        ],
    }


def room_detail(room: Room) -> dict:
    names = [seat.pseudo for seat in room.seats]
    return {
        **room_summary(room),
        # L'index de siège d'un message peut avoir glissé si quelqu'un a quitté le lobby.
        "chat": [
            {
                "seat": entry["seat"],
                "pseudo": names[entry["seat"]] if entry["seat"] < len(names) else None,
                "text": entry["text"],
            }
            for entry in room.chat
        ],
    }


async def close_room(room: Room) -> None:
    """Ferme la table pour tout le monde : les écrans affichent « Cette table n'existe
    plus ». Les sockets sont détachés avant fermeture, la déconnexion n'a rien à faire."""
    async with room.lock:
        sockets = [seat.socket for seat in room.seats if seat.socket is not None]
        for seat in room.seats:
            seat.socket = None
        manager.delete(room.code)
        room.turn_token += 1  # timers de tour et d'absence en attente : caducs
        room.bot_token += 1
        for socket in sockets:
            await _close(socket, 4404)
    await lobby.notify(room.game)


async def kick(player_id: uuid.UUID) -> None:
    """Coupe les connexions du joueur à ses tables (code 4401 : session expirée). Le
    départ suit le chemin normal d'une déconnexion (délai de grâce en lobby, coup
    d'office puis bot en partie)."""
    for room in list(manager.rooms.values()):
        for seat in room.seats:
            if seat.player_id == player_id and seat.socket is not None:
                await _close(seat.socket, 4401)


async def _close(socket: WebSocket, code: int) -> None:
    try:
        await socket.close(code=code)
    except Exception:
        pass  # déjà fermé côté client


# ---------------------------------------------------------------------------
# Joueurs
# ---------------------------------------------------------------------------

SORTS = ("recent", "seen", "played", "name")


@dataclass
class PlayerRow:
    id: uuid.UUID
    pseudo: str
    avatar: str
    created_at: datetime
    last_seen_at: datetime | None
    played: int
    won: int
    default_pin: bool
    locked: bool
    suspended: bool
    online: bool


async def list_players(
    db: AsyncSession, query: str | None, sort: str, offset: int, limit: int
) -> tuple[int, list[PlayerRow]]:
    totals = (
        select(
            PlayerGameStats.player_id,
            func.sum(PlayerGameStats.played).label("played"),
            func.sum(PlayerGameStats.won).label("won"),
        )
        .group_by(PlayerGameStats.player_id)
        .subquery()
    )
    played = func.coalesce(totals.c.played, 0)
    won = func.coalesce(totals.c.won, 0)
    stmt = select(
        Player.id,
        Player.pseudo,
        Player.avatar,
        Player.created_at,
        Player.last_seen_at,
        Player.pin_hash.is_(None).label("default_pin"),
        Player.pin_locked_until,
        Player.suspended_at,
        played.label("played"),
        won.label("won"),
    ).outerjoin(totals, totals.c.player_id == Player.id)
    count = select(func.count()).select_from(Player)
    if query:
        match = Player.pseudo_key.contains(query.lower(), autoescape=True)
        stmt = stmt.where(match)
        count = count.where(match)
    order = {
        "recent": (Player.created_at.desc(),),
        "seen": (Player.last_seen_at.desc().nulls_last(),),
        "played": (played.desc(),),
        "name": (),
    }[sort]
    rows = await db.execute(stmt.order_by(*order, Player.pseudo_key).offset(offset).limit(limit))
    now = datetime.now(UTC)
    online = online_ids()
    return (await db.scalar(count)) or 0, [
        PlayerRow(
            id=r.id,
            pseudo=r.pseudo,
            avatar=r.avatar,
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            played=r.played,
            won=r.won,
            default_pin=r.default_pin,
            locked=r.pin_locked_until is not None and r.pin_locked_until > now,
            suspended=r.suspended_at is not None,
            online=r.id in online,
        )
        for r in rows
    ]


async def player_detail(db: AsyncSession, player: Player) -> dict:
    now = datetime.now(UTC)
    tables = [
        {
            "code": room.code,
            "game": room.game,
            "status": room.status.value,
            "connected": room.seats[i].socket is not None,
        }
        for room in manager.rooms.values()
        if (i := room.seat_of(player.id)) is not None
    ]
    return {
        "id": player.id,
        "pseudo": player.pseudo,
        "avatar": player.avatar,
        "created_at": player.created_at,
        "last_seen_at": player.last_seen_at,
        "default_pin": player.pin_hash is None,
        "locked_until": (
            player.pin_locked_until
            if player.pin_locked_until is not None and player.pin_locked_until > now
            else None
        ),
        "pin_failures": player.pin_failures,
        "suspended_at": player.suspended_at,
        "admin": await is_admin(db, player.id),
        "online": any(t["connected"] for t in tables),
        "tables": tables,
        "stats": {
            s.game: {
                "played": s.played,
                "won": s.won,
                "lost": s.lost,
                "best_ms": s.best_ms,
                "rating": s.rating,
            }
            for s in player.stats
        },
    }


async def reset_pin(db: AsyncSession, player: Player) -> None:
    """Code remis à 0000 (le joueur qui a oublié le sien) : tous ses appareils sont
    déconnectés, l'invite « Sécurise ton compte » l'attend à son retour."""
    player.pin_hash = None
    player.pin_failures = 0
    player.pin_locked_until = None
    player.token_version += 1
    await db.commit()
    await kick(player.id)


async def unlock(db: AsyncSession, player: Player) -> None:
    player.pin_failures = 0
    player.pin_locked_until = None
    await db.commit()


async def sign_out(db: AsyncSession, player: Player) -> None:
    player.token_version += 1
    await db.commit()
    await kick(player.id)


async def set_suspended(db: AsyncSession, player: Player, suspended: bool) -> None:
    if suspended:
        player.suspended_at = datetime.now(UTC)
        player.token_version += 1
    else:
        player.suspended_at = None
    await db.commit()
    if suspended:
        await kick(player.id)


async def rename(db: AsyncSession, player: Player, pseudo: str) -> None:
    """PseudoTaken si le pseudo appartient à un autre."""
    await players_service.update_profile(db, player, pseudo, None)


async def delete(db: AsyncSession, player: Player) -> None:
    """Profil, stats et donnes de Solitaire supprimés ; ses parties d'échecs restent,
    sous son pseudo d'alors, pour ses adversaires."""
    await kick(player.id)
    await db.delete(player)
    await db.commit()
