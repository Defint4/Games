from app.games.chess.rating import FLOOR, delta


def test_even_game_moves_half_the_k_factor():
    assert delta(300, 300, 1.0, played=0) == 20
    assert delta(300, 300, 0.0, played=0) == -20
    assert delta(300, 300, 0.5, played=0) == 0


def test_established_players_move_less():
    assert delta(1200, 1200, 1.0, played=50) == 10


def test_upset_pays_more_than_expected_win():
    assert delta(300, 700, 1.0, played=0) > delta(700, 300, 1.0, played=0)


def test_floor():
    assert FLOOR + delta(FLOOR, 900, 0.0, played=0) == FLOOR
