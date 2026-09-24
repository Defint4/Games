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

SEND_TIMEOUT = 5.0


def _payload(game: str) -> dict:
    return {"type": "rooms", "rooms": [open_room_summary(r) for r in manager.open_rooms(game)]}


async def watch(websocket: WebSocket, game: str) -> None:
    """Tient la connexion d'un accueil de jeu ouverte jusqu'à son départ."""
    await websocket.accept()
    _watchers[game].add(websocket)
    try:
        await websocket.send_json(_payload(game))
        while True:
            # Le client n'a rien à dire ; on attend juste sa déconnexion.
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _watchers[game].discard(websocket)


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

    Souvent appelé sous le verrou d'une table : tous les écrans en même temps, et un
    écran dont la connexion ne suit plus est lâché au bout de SEND_TIMEOUT au lieu de
    retenir la table."""
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
