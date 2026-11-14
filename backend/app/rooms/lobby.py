"""Liste des tables ouvertes en direct : un WebSocket par écran d'accueil de jeu.

Sur téléphone en PWA, personne ne rafraîchit : une table créée doit apparaître chez
les autres à l'instant. Chaque accueil de jeu ouvre `WS /api/rooms/live?game=<slug>`
et reçoit la liste complète à chaque changement (création, arrivée, départ, démarrage,
suppression). Aucune authentification : la liste est déjà publique en REST.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect

from app.rooms.manager import manager
from app.rooms.schemas import open_room_summary

logger = logging.getLogger(__name__)

_watchers: dict[str, set[WebSocket]] = defaultdict(set)
_per_ip: dict[str, int] = defaultdict(int)
# Jeux dont la liste a changé et n'a pas encore été poussée (voir notify).
_pending: set[str] = set()
_tasks: set[asyncio.Task] = set()

SEND_TIMEOUT = 5.0
# Connexions anonymes, tenues ouvertes des heures : sans plafond, quelques centaines
# suffiraient à épuiser les descripteurs du service ou les connexions de nginx, que les
# trois sites du serveur partagent. Le plafond par adresse reste large : derrière un
# opérateur mobile, beaucoup de joueurs sortent par la même.
MAX_WATCHERS = 500
MAX_WATCHERS_PER_IP = 20
# Les changements d'une table arrivent par rafales (bots ajoutés puis retirés) : la liste
# part au plus une fois par NOTIFY_DELAY, avec l'état du moment.
NOTIFY_DELAY = 0.3


def _payload(game: str) -> dict:
    return {"type": "rooms", "rooms": [open_room_summary(r) for r in manager.open_rooms(game)]}


async def watch(websocket: WebSocket, game: str) -> None:
    """Tient la connexion d'un accueil de jeu ouverte jusqu'à son départ."""
    ip = websocket.client.host if websocket.client else ""
    await websocket.accept()
    if watcher_count() >= MAX_WATCHERS or _per_ip[ip] >= MAX_WATCHERS_PER_IP:
        # 1013 : « réessaie plus tard ». La liste reste disponible en REST.
        await websocket.close(code=1013)
        return
    _watchers[game].add(websocket)
    _per_ip[ip] += 1
    try:
        await websocket.send_json(_payload(game))
        while True:
            # Le client n'a rien à dire ; on attend juste sa déconnexion.
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _watchers[game].discard(websocket)
        _per_ip[ip] -= 1
        if _per_ip[ip] <= 0:
            del _per_ip[ip]


def watcher_count() -> int:
    """Écrans d'accueil de jeu ouverts en ce moment (panneau admin)."""
    return sum(len(sockets) for sockets in _watchers.values())


def _drop(socket: WebSocket) -> None:
    """Écran qui ne suit plus : on le ferme (il se reconnecte et reçoit la liste à jour)
    plutôt que de le garder ouvert et muet."""

    async def close() -> None:
        try:
            await asyncio.wait_for(socket.close(code=1013), 2)
        except Exception:
            pass

    asyncio.get_running_loop().create_task(close())


async def broadcast_all(message: dict) -> None:
    """Un message à tous les accueils de jeu ouverts (annonce de maintenance)."""
    text = json.dumps(message, separators=(",", ":"), ensure_ascii=False)

    async def send(sockets: set[WebSocket], socket: WebSocket) -> None:
        try:
            await asyncio.wait_for(socket.send_text(text), SEND_TIMEOUT)
        except Exception:
            sockets.discard(socket)
            _drop(socket)

    await asyncio.gather(
        *(send(sockets, socket) for sockets in _watchers.values() for socket in list(sockets))
    )


async def notify(game: str) -> None:
    """À appeler après tout changement d'une table en lobby de ce jeu.

    Souvent appelé sous le verrou d'une table : l'envoi part donc à part, sans retenir la
    table, et plusieurs changements rapprochés ne donnent qu'un envoi."""
    if game in _pending or not _watchers.get(game):
        return
    _pending.add(game)
    task = asyncio.get_running_loop().create_task(_push(game))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _push(game: str) -> None:
    """Tous les écrans en même temps ; un écran dont la connexion ne suit plus est lâché
    au bout de SEND_TIMEOUT."""
    await asyncio.sleep(NOTIFY_DELAY)
    _pending.discard(game)
    sockets = _watchers.get(game)
    if not sockets:
        return
    text = json.dumps(_payload(game), separators=(",", ":"), ensure_ascii=False)

    async def send(socket: WebSocket) -> None:
        try:
            await asyncio.wait_for(socket.send_text(text), SEND_TIMEOUT)
        except Exception:
            sockets.discard(socket)
            _drop(socket)

    await asyncio.gather(*(send(socket) for socket in list(sockets)))
