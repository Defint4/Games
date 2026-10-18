from __future__ import annotations

import asyncio
import logging
import time
import traceback
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.database import async_session_maker
from app.journal.models import AppEvent

Level = Literal["info", "warning", "error"]
LEVELS: tuple[Level, ...] = ("info", "warning", "error")
_LEVEL_NUM = {"info": logging.INFO, "warning": logging.WARNING, "error": logging.ERROR}

RETENTION = timedelta(days=30)
PURGE_EVERY_S = 3600
# La file : au-delà, les entrées les plus récentes sont perdues (comptées) plutôt que de
# gonfler la mémoire si la base ne répond plus.
QUEUE_SIZE = 2000
BATCH_SIZE = 100
FLUSH_EVERY_S = 1.0
# Requête HTTP jugée lente (le client abandonne à 15 s ; à 2 s il attend déjà trop).
SLOW_REQUEST_S = 2.0
MESSAGE_MAX = 300
TRACEBACK_MAX = 4000

# Ce logger est celui du journal lui-même : chaque entrée sort aussi ici (journalctl), et
# le handler ci-dessous l'ignore, sinon chaque ligne se recréerait elle-même.
_log = logging.getLogger("app.journal")


# ---------------------------------------------------------------------------
# Contexte de requête : qui appelle, d'où, pour que `record` n'ait pas à le redire
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class RequestInfo:
    ip: str | None = None
    user_agent: str | None = None
    path: str | None = None
    player_id: uuid.UUID | None = None
    pseudo: str | None = None


_request: ContextVar[RequestInfo | None] = ContextVar("journal_request", default=None)


def bind_player(player: Any) -> None:
    """Le joueur authentifié de la requête en cours (players.dependencies, WebSocket)."""
    info = _request.get()
    if info is not None:
        info.player_id = player.id
        info.pseudo = player.pseudo


# Jeu déduit du chemin d'une API solo (les tables disent le leur elles-mêmes).
_GAME_PREFIXES = {"/api/solitaire": "solitaire", "/api/chess": "chess", "/api/rt1": "rt1"}


def _game_of(path: str | None) -> str | None:
    if not path:
        return None
    for prefix, slug in _GAME_PREFIXES.items():
        if path.startswith(prefix):
            return slug
    return None


# ---------------------------------------------------------------------------
# record : une entrée, sans attendre
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class Entry:
    level: Level
    kind: str
    message: str
    game: str | None = None
    player_id: uuid.UUID | None = None
    pseudo: str | None = None
    room: str | None = None
    detail: dict | None = None
    path: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    at: datetime = field(default_factory=lambda: datetime.now(UTC))


_queue: asyncio.Queue[Entry] = asyncio.Queue(QUEUE_SIZE)
_dropped = 0


def record(
    level: Level,
    kind: str,
    message: str,
    *,
    game: str | None = None,
    player: Any = None,
    pseudo: str | None = None,
    room: str | None = None,
    detail: dict | None = None,
    path: str | None = None,
) -> None:
    """Dépose une entrée dans le journal. `player` : un Player, un id, ou rien (le joueur
    de la requête en cours est repris) ; `path` remplace le chemin de la requête (la page
    d'une erreur remontée par un navigateur). Jamais bloquant, jamais d'exception : le
    journal ne doit pas faire tomber ce qu'il observe."""
    global _dropped
    info = _request.get()
    player_id = getattr(player, "id", player) if player is not None else None
    if player_id is None and info is not None:
        player_id = info.player_id
    if pseudo is None:
        pseudo = getattr(player, "pseudo", None) or (info.pseudo if info else None)
    entry = Entry(
        level=level,
        kind=kind,
        message=message[:MESSAGE_MAX],
        game=game or _game_of(info.path if info else None),
        player_id=player_id,
        pseudo=pseudo,
        room=room,
        detail=detail,
        path=path or (info.path if info else None),
        ip=info.ip if info else None,
        user_agent=info.user_agent if info else None,
    )
    _log.log(
        _LEVEL_NUM[level],
        "%s%s%s %s%s",
        kind,
        f" [{entry.game}]" if entry.game else "",
        f" {entry.pseudo}" if entry.pseudo else "",
        entry.message,
        f" {detail}" if detail else "",
    )
    try:
        _queue.put_nowait(entry)
    except asyncio.QueueFull:
        _dropped += 1


# ---------------------------------------------------------------------------
# Écriture en base, par lots, et purge
# ---------------------------------------------------------------------------


async def _flush(entries: list[Entry]) -> None:
    async with async_session_maker() as db:
        db.add_all(
            AppEvent(
                at=e.at,
                level=e.level,
                kind=e.kind,
                game=e.game,
                player_id=e.player_id,
                pseudo=e.pseudo,
                room=e.room,
                message=e.message,
                detail=e.detail,
                path=e.path,
                ip=e.ip,
                user_agent=e.user_agent,
            )
            for e in entries
        )
        await db.commit()


async def writer_loop() -> None:
    """Vide la file vers la base, par lots d'au plus BATCH_SIZE ou toutes les
    FLUSH_EVERY_S ; purge les entrées de plus de RETENTION une fois par heure. Une erreur
    d'écriture perd le lot et se dit dans journalctl, jamais dans le journal lui-même."""
    global _dropped
    last_purge = 0.0
    while True:
        entries = [await _queue.get()]
        deadline = time.monotonic() + FLUSH_EVERY_S
        while len(entries) < BATCH_SIZE:
            try:
                entries.append(
                    await asyncio.wait_for(_queue.get(), max(0.0, deadline - time.monotonic()))
                )
            except TimeoutError:
                break
        try:
            await _flush(entries)
        except Exception:
            _log.exception(
                "journal : %d entrée(s) perdue(s), la base n'a pas répondu", len(entries)
            )
        if _dropped:
            _log.warning("journal : %d entrée(s) perdue(s), file pleine", _dropped)
            _dropped = 0
        if time.monotonic() - last_purge > PURGE_EVERY_S:
            last_purge = time.monotonic()
            try:
                async with async_session_maker() as db:
                    await db.execute(
                        delete(AppEvent).where(AppEvent.at < datetime.now(UTC) - RETENTION)
                    )
                    await db.commit()
            except Exception:
                _log.exception("journal : purge impossible")


# ---------------------------------------------------------------------------
# Handler logging : les warnings et exceptions déjà écrits partout dans l'app
# ---------------------------------------------------------------------------


class JournalHandler(logging.Handler):
    """Tout `logger.warning` / `logger.exception` de l'app devient une entrée, traceback
    compris : « Échec de l'enregistrement de la partie 1234 » n'est plus perdu dans
    journalctl."""

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith(_log.name):
            return
        detail: dict[str, Any] = {"logger": record.name}
        if record.exc_info and record.exc_info[0] is not None:
            detail["traceback"] = "".join(traceback.format_exception(*record.exc_info))[
                -TRACEBACK_MAX:
            ]
        try:
            message = record.getMessage()
        except Exception:
            message = str(record.msg)
        globals()["record"](
            "error" if record.levelno >= logging.ERROR else "warning",
            "log",
            message,
            detail=detail,
        )


def install_logging() -> None:
    handler = JournalHandler(level=logging.WARNING)
    logging.getLogger("app").addHandler(handler)


# ---------------------------------------------------------------------------
# Middleware ASGI : contexte de requête, exceptions, 5xx, 429, 403, lenteurs
# ---------------------------------------------------------------------------


class JournalMiddleware:
    """Pose le contexte (adresse, navigateur, chemin) que `record` reprend, et consigne
    ce que l'app elle-même ne dit pas : une exception non rattrapée (avec sa trace), un
    5xx, un 429, un 403 ou 423 (code PIN, compte suspendu, blocages), une requête lente.
    ASGI pur, pas BaseHTTPMiddleware : rien n'est mis en tampon, les WebSockets passent."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        client = scope.get("client")
        info = RequestInfo(
            ip=client[0] if client else None,
            user_agent=headers.get("user-agent", "")[:200] or None,
            path=scope.get("path"),
        )
        token = _request.set(info)
        method = scope.get("method", "WS")
        started = time.perf_counter()
        status = 0

        async def send_logged(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_logged)
        except Exception as exc:
            record(
                "error",
                "exception",
                f"{method} {info.path} : {type(exc).__name__}: {exc}",
                detail={"traceback": traceback.format_exc()[-TRACEBACK_MAX:]},
            )
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            if scope["type"] == "http":
                where = f"{method} {info.path} → {status}"
                if status >= 500 and status != 503:
                    record("error", "http_5xx", where, detail={"duration_ms": elapsed_ms})
                elif status == 503:
                    # Maintenance ou solveur sans donne : voulu, mais bon à savoir.
                    record("info", "unavailable", where)
                elif status == 429:
                    record("warning", "rate_limited", where)
                elif status in (403, 423):
                    record("warning", "forbidden", where)
                if elapsed_ms > SLOW_REQUEST_S * 1000:
                    record("warning", "slow_request", where, detail={"duration_ms": elapsed_ms})
            _request.reset(token)


# ---------------------------------------------------------------------------
# Lecture (panneau admin)
# ---------------------------------------------------------------------------


def _at_least(level: Level):
    return AppEvent.level.in_(LEVELS[LEVELS.index(level) :])


async def list_events(
    db: AsyncSession,
    *,
    level: Level = "warning",
    game: str | None = None,
    query: str | None = None,
    before: int | None = None,
    limit: int = 50,
) -> list[AppEvent]:
    """Les entrées d'au moins `level`, les plus récentes d'abord ; `before` (un id)
    continue la liste. `query` cherche dans le pseudo, le message et le type."""
    stmt = select(AppEvent).where(_at_least(level))
    if game:
        stmt = stmt.where(AppEvent.game == game)
    if query:
        like = f"%{query}%"
        stmt = stmt.where(
            AppEvent.pseudo.ilike(like, autoescape=True)
            | AppEvent.message.ilike(like, autoescape=True)
            | AppEvent.kind.ilike(like, autoescape=True)
            | (AppEvent.room == query)
        )
    if before is not None:
        stmt = stmt.where(AppEvent.id < before)
    rows = await db.scalars(stmt.order_by(AppEvent.id.desc()).limit(limit))
    return list(rows)


async def counts_since(db: AsyncSession, since: datetime) -> dict[str, int]:
    rows = await db.execute(
        select(AppEvent.level, func.count()).where(AppEvent.at >= since).group_by(AppEvent.level)
    )
    counts = {level: 0 for level in LEVELS}
    for level, n in rows:
        counts[level] = n
    return counts


async def player_events(db: AsyncSession, player_id: uuid.UUID, limit: int = 15) -> list[AppEvent]:
    """Les derniers incidents (warning et plus) d'un joueur, pour sa fiche."""
    rows = await db.scalars(
        select(AppEvent)
        .where(AppEvent.player_id == player_id, _at_least("warning"))
        .order_by(AppEvent.id.desc())
        .limit(limit)
    )
    return list(rows)
