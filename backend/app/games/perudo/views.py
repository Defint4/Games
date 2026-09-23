"""Vue filtrée du Perudo : chaque joueur ne voit que ses propres dés.

Publics : nombre de dés de chacun, enchère en cours, manche Palifico ou non.
Privés : les dés du joueur. Tous les dés deviennent publics à la révélation
(`reveal`), figés tels qu'ils étaient au moment du Dudo ou du Calza.
"""

from __future__ import annotations

from app.games.perudo.engine import GameStatus, Phase, can_calza
from app.rooms.manager import Room


def game_view(room: Room, seat_index: int) -> dict:
    state = room.state
    playing = state.status is GameStatus.PLAYING
    you = state.players[seat_index]

    players = [
        {
            "ready": p.ready,
            "finish_rank": p.finish_rank,
            "alive": p.alive,
            "dice_count": len(p.dice) if p.alive else 0,
            "palifico_used": p.palifico_used,
        }
        for p in state.players
    ]

    return {
        "phase": state.phase.value if state.status is not GameStatus.LOBBY else None,
        "round": state.round_number,
        "palifico": state.palifico,
        "bid": state.bid.to_dict() if state.bid else None,
        "history": [b.to_dict() for b in state.history],
        "total_dice": state.total_dice,
        "your_dice": list(you.dice) if you.alive else [],
        "reveal": state.reveal.to_dict() if state.reveal else None,
        "players": players,
        "can_calza": can_calza(state, seat_index),
        "can_dudo": playing
        and state.phase is Phase.BIDDING
        and state.turn_index == seat_index
        and state.bid is not None,
        "you_alive": you.alive,
    }
