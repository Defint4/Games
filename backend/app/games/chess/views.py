"""Vue d'une table d'échecs : rien n'est caché, les deux joueurs voient la même chose.

Les pendules sont calculées à l'envoi (temps restant à cet instant) : le client les fait
tourner à partir de là, quelle que soit l'heure de l'appareil. Les coups partent en UCI,
le client en tire lui-même la notation, les pièces prises et le matériel.
"""

from __future__ import annotations

import time

from app.games.base import GameStatus
from app.games.chess.engine import ChessState, can_abort, clocks_running, remaining
from app.rooms.manager import Room


def game_view(room: Room, seat_index: int) -> dict:
    state: ChessState = room.state
    now = time.monotonic()
    started = state.status is not GameStatus.LOBBY
    clocks = [remaining(state, i, now) for i in range(len(state.players))] if started else []
    return {
        "time_control": state.time_control,
        "white": state.white if started else None,
        "moves": [m.uci() for m in state.board.move_stack],
        "clocks": [None if c is None else round(max(c, 0.0), 2) for c in clocks],
        "clock_running": clocks_running(state),
        "first_move_remaining": (
            round(max(0.0, state.first_move_deadline - now), 1)
            if state.first_move_deadline is not None
            else None
        ),
        "winner": state.winner,
        "result": state.result,
        "termination": state.termination,
        "draw_offer": state.draw_offer,
        "can_abort": can_abort(state, seat_index),
        "game_id": state.game_id,
        "players": [
            {"rating_delta": state.rating_deltas[i] if state.rating_deltas else None}
            for i in range(len(state.players))
        ],
    }
