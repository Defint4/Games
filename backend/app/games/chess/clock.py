"""Surveillance des pendules : une tâche par table, reprogrammée après chaque coup.

Elle se réveille à l'échéance du camp au trait (pendule tombée, ou premier coup pas joué
à temps) et termine la partie si rien n'est arrivé entre-temps. room.bot_token invalide
la tâche précédente dès qu'un coup survient, comme pour les bots des autres jeux.
"""

from __future__ import annotations

import asyncio
import logging
import time

from app.games.base import AfterMove
from app.games.chess.engine import check_time, next_deadline
from app.rooms.manager import Room, manager

logger = logging.getLogger(__name__)


def schedule(room: Room, after_move: AfterMove) -> None:
    """À appeler sous room.lock après tout changement d'état de la table."""
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
            # Réveil un rien trop tôt (arrondis de l'horloge) : on se rendort.
            schedule(room, after_move)
