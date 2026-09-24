"""Moteur des échecs : démarrage, coups, pendules, fins de partie."""

import chess
import pytest

from app.games.base import GameError, GameStatus
from app.games.chess.engine import (
    FIRST_MOVE_SECONDS,
    MAX_LAG,
    abort,
    accept_draw,
    add_player,
    can_abort,
    check_time,
    configure,
    create_game,
    decline_draw,
    next_deadline,
    offer_draw,
    play_move,
    remaining,
    resign,
)


def started(time_control: str = "3+2", white: str | None = "alice"):
    """Partie lancée à t=0, alice aux blancs (siège 0) sauf mention contraire."""
    state = create_game("alice")
    configure(state, {"time_control": time_control, **({"white": white} if white else {})})
    add_player(state, "bob", now=0.0)
    return state


def play(state, moves: str, start: float = 0.0, step: float = 1.0) -> float:
    """Joue une suite de coups UCI, un par `step` secondes ; renvoie l'heure finale."""
    now = start
    for uci in moves.split():
        now += step
        play_move(state, state.to_move(), uci, now)
    return now


def test_second_player_starts_the_game():
    state = started()
    assert state.status is GameStatus.PLAYING
    assert state.white == 0
    assert state.clocks == [180.0, 180.0]
    with pytest.raises(GameError):
        add_player(state, "carol", now=0.0)


def test_rematch_colours_follow_the_preference():
    state = started(white="bob")
    assert state.white == 1
    assert state.to_move() == 1


def test_unknown_time_control_is_refused():
    with pytest.raises(GameError):
        configure(create_game("alice"), {"time_control": "7+7"})


def test_illegal_and_out_of_turn_moves():
    state = started()
    with pytest.raises(GameError):
        play_move(state, 1, "e7e5", 1.0)
    with pytest.raises(GameError):
        play_move(state, 0, "e2e5", 1.0)
    with pytest.raises(GameError):
        play_move(state, 0, "zz", 1.0)


def test_clocks_start_after_both_first_moves_then_take_increment():
    state = started()
    play(state, "e2e4 e7e5", step=10.0)  # t=20 : pendules pas encore lancées
    assert state.clocks == [180.0, 180.0]
    assert remaining(state, 0, 25.0) == pytest.approx(175.0)
    play_move(state, 0, "g1f3", 25.0)
    assert state.clocks[0] == pytest.approx(180.0 - 5.0 + 2.0)
    assert remaining(state, 1, 30.0) == pytest.approx(175.0)


def test_think_time_from_the_device_is_charged_within_the_lag_allowance():
    state = started("3+0")
    play(state, "e2e4 e7e5")
    now = 2.0 + 4.0  # 4 s côté serveur, dont une partie de réseau
    play_move(state, 0, "g1f3", now, think=3.8)
    assert state.clocks[0] == pytest.approx(180.0 - 3.8)
    # Un appareil qui prétend n'avoir rien pensé ne gagne jamais plus que MAX_LAG.
    play_move(state, 1, "b8c6", now + 4.0, think=0.0)
    assert state.clocks[1] == pytest.approx(180.0 - (4.0 - MAX_LAG))


def test_flag_falls_after_the_lag_allowance():
    state = started("1+0")
    play(state, "e2e4 e7e5")
    assert next_deadline(state, 2.0) == pytest.approx(60.0 + MAX_LAG)
    assert check_time(state, 62.0) == []
    events = check_time(state, 62.0 + MAX_LAG)
    assert events[-1] == {"type": "game_over", "winner": 1, "termination": "timeout", "by": None}
    assert state.result == "0-1"


def test_late_move_loses_on_time():
    state = started("1+0")
    play(state, "e2e4 e7e5")
    events = play_move(state, 0, "g1f3", 2.0 + 61.0)
    assert events[-1]["termination"] == "timeout"
    assert state.board.fullmove_number == 2  # le coup n'a pas été joué


def position(fen: str, moves: str):
    """Partie 1+0 reprise sur une position, pendules lancées à t=0."""
    state = started("1+0")
    state.board = chess.Board(fen)
    for uci in moves.split():
        state.board.push_uci(uci)
    state.first_move_deadline = None
    return state


def test_timeout_against_a_lone_king_is_a_draw():
    # Les noirs laissent tomber leur pendule : face à une dame, c'est perdu...
    state = position("7k/8/8/8/8/8/8/K6Q w - - 0 1", "a1a2 h8g8 h1h2")
    assert check_time(state, 61.0)[-1]["termination"] == "timeout"
    # ... face à un roi seul, qui n'a pas de quoi mater : nulle.
    state = position("7k/8/8/8/8/8/8/K6q w - - 0 1", "a1a2 h8g8 a2a3")
    assert check_time(state, 61.0)[-1]["termination"] == "timeout_insufficient"
    assert state.result == "1/2-1/2"


def test_first_move_not_played_aborts_the_game():
    state = started()
    assert check_time(state, FIRST_MOVE_SECONDS - 1) == []
    events = check_time(state, FIRST_MOVE_SECONDS)
    assert events[-1]["termination"] == "aborted"
    assert state.result is None


def test_abort_only_before_your_first_move():
    state = started()
    assert can_abort(state, 0) and can_abort(state, 1)
    play(state, "e2e4")
    assert not can_abort(state, 0)
    with pytest.raises(GameError):
        abort(state, 0)
    abort(state, 1)
    assert state.termination == "aborted"


def test_fools_mate():
    state = started()
    play(state, "f2f3 e7e5 g2g4")
    events = play_move(state, 1, "d8h4", 10.0)
    assert events[-1]["termination"] == "checkmate"
    assert state.winner == 1
    assert state.result == "0-1"


def test_threefold_repetition_is_drawn_automatically():
    state = started()
    play(state, "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1")
    assert state.status is GameStatus.PLAYING  # deux fois seulement
    play(state, "f6g8", start=7.0)
    assert state.termination == "repetition"
    assert state.result == "1/2-1/2"


def test_draw_offer_accept_decline_and_implicit_decline():
    state = started()
    play(state, "e2e4")
    offer_draw(state, 0, 2.0)
    with pytest.raises(GameError):
        offer_draw(state, 0, 2.0)
    decline_draw(state, 1)
    assert state.draw_offer is None
    play(state, "e7e5 g1f3", start=2.0)
    offer_draw(state, 0, 5.0)
    play_move(state, 1, "b8c6", 6.0)  # répondre par un coup décline
    assert state.draw_offer is None
    offer_draw(state, 1, 7.0)
    accept_draw(state, 0, 8.0)
    assert state.termination == "agreement"


def test_resign_freezes_the_clock():
    state = started("3+0")
    play(state, "e2e4 e7e5")
    resign(state, 0, 12.0)
    assert state.winner == 1
    assert state.clocks[0] == pytest.approx(170.0)


def test_bot_game_result_comes_from_the_board():
    from app.games.chess.engine import replay_bot_game

    fools = ["f2f3", "e7e5", "g2g4", "d8h4"]
    # L'appareil prétend avoir gagné aux blancs : l'échiquier dit mat pour les noirs.
    assert replay_bot_game(fools, "1-0", "resign") == ("0-1", "checkmate")
    assert replay_bot_game(["e2e4", "e7e5"], "0-1", "resign") == ("0-1", "resign")
    with pytest.raises(GameError):
        replay_bot_game(["e2e4", "e7e5"], "1-0", "checkmate")  # pas mat
    with pytest.raises(GameError):
        replay_bot_game(["e2e4", "e2e4"], "1-0", "resign")  # coup illégal
    with pytest.raises(GameError):
        replay_bot_game(["e2e4"], "0-1", "resign")  # trop court
