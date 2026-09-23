import pytest

from app.games.perudo.engine import (
    GameStatus,
    InvalidAction,
    NotYourTurn,
    Phase,
    add_player,
    calza,
    count_matching,
    create_game,
    dudo,
    next_round,
    set_ready,
)

from .helpers import playing_state


def test_pacos_are_wild_except_when_counting_pacos():
    hands = [[1, 1, 4], [4, 6]]
    assert count_matching(hands, 4, wild=True) == 4
    assert count_matching(hands, 1, wild=True) == 2
    assert count_matching(hands, 4, wild=False) == 2


def test_game_starts_with_five_dice_each_when_everyone_is_ready():
    state = create_game("A", seed=1)
    add_player(state, "B")
    set_ready(state, 0)
    events = set_ready(state, 1)
    assert state.status is GameStatus.PLAYING
    assert [len(p.dice) for p in state.players] == [5, 5]
    assert all(1 <= d <= 6 for p in state.players for d in p.dice)
    assert events[0]["type"] == "game_started"
    assert events[1]["type"] == "round_started"


def test_dudo_on_a_true_bid_costs_the_doubter_a_die():
    # Quatre 4 : 4, 4, et deux Pacos jokers.
    state = playing_state([[4, 1, 2], [4, 1, 6]], turn=1, bid=(4, 4, 0))
    events = dudo(state, 1)
    assert [len(p.dice) for p in state.players] == [3, 2]
    assert state.phase is Phase.REVEAL
    assert state.reveal.count == 4 and state.reveal.target == 1
    assert events[0]["type"] == "dudo" and events[0]["dice"] == [[4, 1, 2], [4, 1, 6]]
    assert state.next_starter == 1


def test_dudo_on_a_false_bid_costs_the_bidder_a_die():
    state = playing_state([[4, 2, 2], [3, 5, 6]], turn=1, bid=(3, 4, 0))
    dudo(state, 1)
    assert [len(p.dice) for p in state.players] == [2, 3]
    assert state.next_starter == 0


def test_dudo_needs_a_bid_and_the_turn():
    state = playing_state([[2], [3], [4]])
    with pytest.raises(InvalidAction):
        dudo(state, 0)
    state = playing_state([[2], [3], [4]], turn=1, bid=(1, 2, 0))
    with pytest.raises(NotYourTurn):
        dudo(state, 2)


def test_exact_calza_gives_a_die_back_even_out_of_turn():
    state = playing_state([[4, 4, 2], [3, 5], [6, 6, 1]], turn=1, bid=(3, 4, 0))
    calza(state, 2)  # siège 2 n'a pas la main
    assert len(state.players[2].dice) == 4
    assert state.reveal.delta == 1
    assert state.next_starter == 2


def test_calza_never_goes_above_five_dice():
    state = playing_state([[4, 4, 2], [3, 5, 6, 6, 1]], turn=1, bid=(3, 4, 0))
    events = calza(state, 1)
    assert len(state.players[1].dice) == 5
    assert not any(e["type"] == "die_gained" for e in events)


def test_wrong_calza_costs_the_caller_a_die():
    state = playing_state([[4, 4, 2], [3, 5, 6]], turn=1, bid=(2, 6, 0))
    calza(state, 1)
    assert len(state.players[1].dice) == 2
    assert state.reveal.delta == -1


def test_the_bidder_cannot_call_calza_on_their_own_bid():
    state = playing_state([[4], [3]], turn=1, bid=(1, 4, 0))
    with pytest.raises(InvalidAction):
        calza(state, 0)


def test_eliminated_player_hands_the_opening_to_the_next_one():
    state = playing_state([[2, 2], [3], [5, 5]], turn=2, bid=(1, 3, 1))
    events = dudo(state, 2)  # un 3 : l'enchère tient, le siège 2 perd un dé
    assert state.next_starter == 2
    state = playing_state([[2, 2], [3], [5, 5]], turn=2, bid=(2, 3, 1))
    events = dudo(state, 2)  # un seul 3 : le siège 1 perd son dernier dé
    assert state.players[1].finish_rank == 3
    assert any(e["type"] == "eliminated" for e in events)
    assert state.next_starter == 2


def test_last_player_standing_wins():
    state = playing_state([[2], [3, 3]], turn=1, bid=(2, 2, 0))
    events = dudo(state, 1)
    assert state.status is GameStatus.FINISHED
    assert state.players[1].finish_rank == 1 and state.players[0].finish_rank == 2
    assert events[-1] == {"type": "game_over", "winner": 1}


def test_next_round_rolls_again_and_the_loser_opens():
    state = playing_state([[4, 2, 2], [3, 5, 6]], turn=1, bid=(3, 4, 0))
    dudo(state, 1)
    events = next_round(state)
    assert state.phase is Phase.BIDDING and state.bid is None and state.reveal is None
    assert state.turn_index == 0
    assert events[0]["type"] == "round_started" and events[0]["dice_counts"] == [2, 3]


def test_next_round_only_after_a_reveal():
    state = playing_state([[2], [3]])
    with pytest.raises(InvalidAction):
        next_round(state)


def test_first_drop_to_one_die_starts_a_palifico_round_once():
    state = playing_state([[4, 2], [3, 5, 6]], turn=1, bid=(2, 4, 0))
    state.players[0].palifico_used = False
    dudo(state, 1)  # un seul 4 : le siège 0 tombe à 1 dé
    events = next_round(state)
    assert state.palifico and events[0]["palifico"]
    assert state.players[0].palifico_used
    # Plus tard, il ouvre à nouveau avec 1 dé : plus de Palifico.
    state.phase = Phase.REVEAL
    state.next_starter = 0
    next_round(state)
    assert not state.palifico


def test_pacos_are_not_wild_during_palifico():
    state = playing_state([[1], [4, 1, 3]], turn=1, bid=(2, 4, 0), palifico=True)
    dudo(state, 1)  # un seul vrai 4 : l'enchère tombe
    assert state.reveal.count == 1 and state.reveal.target == 0
