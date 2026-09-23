import pytest

from app.games.perudo.engine import IllegalMove, NotYourTurn, bid, is_legal_bid

from .helpers import playing_state

FIVE = [2, 3, 4, 5, 6]


def test_opening_on_pacos_is_forbidden():
    state = playing_state([FIVE, FIVE])
    with pytest.raises(IllegalMove, match="Pacos"):
        bid(state, 0, 2, 1)


def test_opening_then_turn_passes_clockwise():
    state = playing_state([FIVE, FIVE, FIVE])
    events = bid(state, 0, 3, 4)
    assert state.bid.quantity == 3 and state.bid.face == 4 and state.bid.player == 0
    assert state.turn_index == 1
    assert events[-1] == {"type": "turn", "player": 1}


@pytest.mark.parametrize(
    ("quantity", "face", "legal"),
    [
        (5, 4, True),  # même quantité, face plus haute
        (5, 3, False),  # même quantité, face égale
        (5, 2, False),  # même quantité, face plus basse
        (6, 2, True),  # plus de dés, n'importe quelle face
        (3, 1, True),  # vers les Pacos : 5 / 2 arrondi au supérieur
        (2, 1, False),
    ],
)
def test_raises_from_a_normal_face(quantity, face, legal):
    state = playing_state([FIVE, FIVE], turn=1, bid=(5, 3, 0))
    assert is_legal_bid(state, 1, quantity, face) is legal


@pytest.mark.parametrize(
    ("quantity", "face", "legal"),
    [
        (4, 1, True),  # plus de Pacos
        (3, 1, False),
        (7, 5, True),  # depuis les Pacos : double + 1
        (6, 6, False),
    ],
)
def test_raises_from_pacos(quantity, face, legal):
    state = playing_state([FIVE, FIVE], turn=1, bid=(3, 1, 0))
    assert is_legal_bid(state, 1, quantity, face) is legal


def test_a_bid_never_exceeds_the_dice_on_the_table():
    state = playing_state([FIVE, FIVE], turn=1, bid=(10, 5, 0))
    assert not is_legal_bid(state, 1, 11, 2)
    assert is_legal_bid(state, 1, 10, 6)


def test_illegal_raise_is_refused():
    state = playing_state([FIVE, FIVE], turn=1, bid=(5, 3, 0))
    with pytest.raises(IllegalMove, match="surenchérir"):
        bid(state, 1, 4, 6)


def test_only_the_player_to_act_bids():
    state = playing_state([FIVE, FIVE, FIVE])
    with pytest.raises(NotYourTurn):
        bid(state, 2, 3, 4)


def test_palifico_opening_may_be_on_pacos():
    state = playing_state([[3], FIVE], palifico=True)
    assert is_legal_bid(state, 0, 1, 1)


def test_palifico_face_is_locked_for_players_with_several_dice():
    state = playing_state([[3], FIVE, FIVE], turn=1, bid=(2, 4, 0), palifico=True)
    assert is_legal_bid(state, 1, 3, 4)
    assert not is_legal_bid(state, 1, 3, 5)
    assert not is_legal_bid(state, 1, 2, 5)
    with pytest.raises(IllegalMove, match="Palifico"):
        bid(state, 1, 3, 5)


def test_palifico_players_with_one_die_may_change_face():
    state = playing_state([FIVE, [6], FIVE], turn=1, bid=(2, 4, 0), palifico=True)
    assert is_legal_bid(state, 1, 2, 5)
    assert is_legal_bid(state, 1, 3, 2)
    assert not is_legal_bid(state, 1, 2, 3)
