"""« Bonne pioche » : enchaînements hors tour et complétion avec les cartes visibles."""

import pytest

from app.games.nine_to_one.engine import (
    Card,
    IllegalMove,
    Suit,
    chase_flip,
    chase_play,
    chase_value,
    flip_face_down,
    play_cards,
)
from app.games.nine_to_one.tests.helpers import cards, playing_state


def test_chase_freshly_drawn_card():
    # P0 pose un 4, en repioche un : il peut l'enchaîner tant que P1 n'a pas joué.
    state = playing_state([cards(4, 9, 11), cards(5, 6, 7)], draw=[Card(4, Suit.SPADES)])
    play_cards(state, 0, 4)
    assert state.turn_index == 1
    assert chase_value(state, 0) == 4
    chase_play(state, 0, 1)
    assert [c.value for c in state.pile] == [4, 4]
    assert state.turn_index == 1  # le tour n'a pas bougé


def test_chase_too_late_after_next_player_moved():
    state = playing_state([cards(4, 9, 11), cards(5, 6, 7)], draw=[Card(4, Suit.SPADES)])
    play_cards(state, 0, 4)
    play_cards(state, 1, 5)
    assert chase_value(state, 0) is None
    with pytest.raises(IllegalMove):
        chase_play(state, 0, 1)


def test_chase_completes_four_and_cuts():
    state = playing_state(
        [[Card(6, Suit.SPADES), Card(9, Suit.HEARTS)], cards(12, 13, 14)],
        pile=cards(6, 6, 6),
        turn=1,
        last_play=0,
        chase_armed=True,
    )
    chase_play(state, 0, 1)
    assert state.pile == []
    assert state.turn_index == 0  # la coupe fait rejouer l'enchaîneur


def test_no_chase_with_card_already_held():
    # P0 avait déjà un second 4 en main : pas de « bonne pioche », il fallait
    # les poser ensemble. La pioche ne fournit pas de 4.
    state = playing_state(
        [[Card(4, Suit.HEARTS), Card(4, Suit.SPADES), Card(9, Suit.HEARTS)], cards(5, 6, 7)],
        draw=[Card(12, Suit.SPADES)],
    )
    play_cards(state, 0, 4)
    assert chase_value(state, 0) is None
    with pytest.raises(IllegalMove):
        chase_play(state, 0, 1)


def test_chase_flip_matching_card_plays_it():
    state = playing_state(
        [[], cards(12, 13, 14)],
        face_down=[[Card(8, Suit.SPADES)], []],
        pile=cards(8),
        turn=1,
        last_play=0,
    )
    chase_flip(state, 0, 0)
    assert [c.value for c in state.pile] == [8, 8]
    assert state.turn_index == 1


def test_chase_flip_miss_keeps_card_in_hand():
    state = playing_state(
        [[], cards(12, 13, 14)],
        face_down=[[Card(3, Suit.SPADES)], []],
        pile=cards(8),
        turn=1,
        last_play=0,
    )
    chase_flip(state, 0, 0)
    assert [c.value for c in state.pile] == [8]
    assert [c.value for c in state.players[0].hand] == [3]
    assert state.turn_index == 1


def test_last_hand_card_completed_by_face_up():
    # Dernière carte en main (un 2) + un 2 visible : les deux partent ensemble.
    state = playing_state(
        [[Card(2, Suit.SPADES)], cards(12, 13, 14)],
        face_up=[[Card(2, Suit.HEARTS), Card(9, Suit.HEARTS)], []],
        pile=cards(11),
    )
    play_cards(state, 0, 2, count=2)
    assert [c.value for c in state.pile] == [11, 2, 2]
    assert [c.value for c in state.players[0].hand] == [9]  # les visibles restantes en main


def test_face_up_completion_requires_empty_hand():
    state = playing_state(
        [[Card(2, Suit.SPADES), Card(5, Suit.SPADES)], cards(12, 13, 14)],
        face_up=[[Card(2, Suit.HEARTS)], []],
        pile=cards(11),
    )
    with pytest.raises(IllegalMove):
        play_cards(state, 0, 2, count=2)


def test_drawn_copy_opens_the_chase_for_kept_copies_too():
    # P0 garde un 4 et en pose un seul ; la pioche lui donne un autre 4 : il peut
    # enchaîner les deux, celui gardé en main compris.
    state = playing_state(
        [[Card(4, Suit.HEARTS), Card(4, Suit.SPADES), Card(9, Suit.HEARTS)], cards(5, 6, 7)],
        draw=[Card(4, Suit.CLUBS)],
    )
    play_cards(state, 0, 4, count=1)
    assert chase_value(state, 0) == 4
    chase_play(state, 0, 2)
    assert [c.value for c in state.pile] == [4, 4, 4]


def test_blind_chase_closes_once_the_next_player_flips():
    # P0 vient de poser sa dernière carte ; P1 retourne une cachée à son tour : trop
    # tard pour la bonne pioche à l'aveugle de P0.
    state = playing_state(
        [[], []],
        face_down=[[Card(8, Suit.SPADES)], [Card(12, Suit.HEARTS)]],
        pile=cards(8),
        turn=1,
        last_play=0,
    )
    assert chase_value(state, 0) == 8
    flip_face_down(state, 1, 0)
    assert chase_value(state, 0) is None
    with pytest.raises(IllegalMove):
        chase_flip(state, 0, 0)
