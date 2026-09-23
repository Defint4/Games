"""Fabriques d'états de jeu pour les tests du moteur du Perudo."""

from __future__ import annotations

import random

from app.games.perudo.engine import Bid, GameState, GameStatus, Phase, PlayerState


def playing_state(
    dice: list[list[int]],
    turn: int = 0,
    bid: tuple[int, int, int] | None = None,
    palifico: bool = False,
    seed: int = 0,
) -> GameState:
    """Manche en cours : `dice` les dés de chaque siège, `bid` = (quantité, face, siège)."""
    return GameState(
        players=[
            PlayerState(name=f"J{i}", dice=list(d), ready=True, palifico_used=len(d) == 1)
            for i, d in enumerate(dice)
        ],
        status=GameStatus.PLAYING,
        phase=Phase.BIDDING,
        turn_index=turn,
        round_number=1,
        bid=Bid(*bid) if bid else None,
        palifico=palifico,
        rng=random.Random(seed),
    )
