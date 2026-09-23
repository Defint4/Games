"""Parties complètes jouées par les bots : la partie se termine toujours, proprement."""

import random

import pytest

from app.games.perudo import bots
from app.games.perudo.engine import (
    GameStatus,
    Phase,
    add_player,
    bid,
    calza,
    create_game,
    dudo,
    legal_bids,
    next_round,
    set_ready,
)


def _view(state, seat):
    return {
        "your_seat": seat,
        "history": [b.to_dict() for b in state.history],
        "your_dice": list(state.players[seat].dice),
        "total_dice": state.total_dice,
        "palifico": state.palifico,
        "bid": state.bid.to_dict() if state.bid else None,
    }


@pytest.mark.parametrize("seed", range(40))
def test_bots_finish_a_game(seed):
    random.seed(seed)
    n = 2 + seed % 5
    difficulties = ["easy", "normal", "hard"]
    state = create_game("J0", seed=seed)
    for i in range(1, n):
        add_player(state, f"J{i}")
    for i in range(n):
        set_ready(state, i)
    for _ in range(5000):
        if state.status is GameStatus.FINISHED:
            break
        if state.phase is Phase.REVEAL:
            next_round(state)
            # Un Calza réussi rend un dé : le total peut remonter, jamais au-delà de 5 chacun.
            assert all(1 <= len(p.dice) <= 5 for p in state.players if p.alive)
            continue
        seat = state.turn_index
        assert state.players[seat].alive
        action, q, f = bots.decide(
            _view(state, seat), legal_bids(state, seat), difficulties[seat % 3]
        )
        if action == "bid":
            bid(state, seat, q, f)
        elif action == "dudo":
            dudo(state, seat)
        else:
            calza(state, seat)
    assert state.status is GameStatus.FINISHED
    ranks = sorted(p.finish_rank for p in state.players)
    assert ranks == list(range(1, n + 1))
