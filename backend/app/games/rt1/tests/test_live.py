"""Courses en direct (spec.py) : départ, temps mesuré par le serveur, arrivée renvoyée,
poses relayées, ordre d'arrivée."""

import math

import pytest

from app.games.base import GameError, GameStatus
from app.games.rt1 import rules, spec


def started(n: int = 2, circuit: str = "noumea") -> spec.RaceState:
    state = spec.create_game("a")
    state.circuit = circuit
    for k in range(1, n):
        spec.add_player(state, f"p{k}")
    for seat in range(n):
        spec.set_ready(state, seat, True, circuit)
    assert state.status is GameStatus.PLAYING
    return state


def splits_for(time_ms: int, gates: int = 4) -> list[int]:
    return [round(time_ms * (k + 1) / gates) for k in range(gates)]


def test_ready_for_another_circuit_does_not_count():
    state = spec.create_game("a")
    spec.add_player(state, "b")
    spec.set_ready(state, 0, True, "noumea")
    spec.set_ready(state, 1, True, "le-col")
    assert state.status is GameStatus.LOBBY


def test_server_clock_wins_when_the_phone_is_far_off():
    state = started()
    t = 60_000
    now = state.start_mono + t / 1000
    # le téléphone annonce 20 s de moins (pause, arrière-plan) : le temps du serveur fait foi
    spec.finish(state, 0, {"time_ms": t - 20_000, "splits": splits_for(t - 20_000)}, now)
    assert state.players[0].time_ms == t
    assert state.players[0].splits[-1] == t
    # dans la tolérance, le temps du téléphone (plus précis) est gardé
    spec.finish(state, 1, {"time_ms": t + 800, "splits": splits_for(t + 800)}, now)
    assert state.players[1].time_ms == t + 800


def test_finish_before_the_start_is_refused():
    state = started()
    with pytest.raises(GameError):
        spec.finish(
            state, 0, {"time_ms": 50_000, "splits": splits_for(50_000)}, state.start_mono - 1
        )


def test_resent_finish_is_accepted_once():
    state = started(3)
    now = state.start_mono + 50
    msg = {"time_ms": 50_000, "splits": splits_for(50_000)}
    spec.finish(state, 0, msg, now)
    assert spec.finish(state, 0, msg, now + 1) == []
    with pytest.raises(GameError):
        spec.finish(state, 0, {"time_ms": 49_000, "splits": splits_for(49_000)}, now + 1)


def test_impossible_time_is_refused():
    state = started()
    t = round(rules.PACE["noumea"]["base"] * 1000 * 0.3)
    with pytest.raises(ValueError):
        spec.finish(state, 0, {"time_ms": t, "splits": splits_for(t)}, state.start_mono + t / 1000)


def test_ties_go_to_the_first_across_the_line():
    state = started()
    msg = {"time_ms": 50_000, "splits": splits_for(50_000)}
    spec.finish(state, 1, msg, state.start_mono + 50.0)
    spec.finish(state, 0, msg, state.start_mono + 50.2)
    assert spec.places(state)[0] == 1


@pytest.mark.parametrize(
    "pose",
    [
        [math.nan, 0, 0, 0, 0, 0, 0, 1, 0],
        [1, 1e9, 0, 0, 0, 0, 0, 1, 0],
        [1, 0, 0, 0, 0.5, 0.5, 0.5, 0.9, 0],
        [1, 0, 0, 0, 0, 0, 0, 1, 1000],
    ],
)
def test_bad_poses_are_not_relayed(pose):
    race = spec.Rt1Race()
    room = type("R", (), {"state": started()})()
    with pytest.raises(ValueError):
        race.relay(room, 0, "pose", {"d": pose})


def test_good_pose_is_relayed():
    race = spec.Rt1Race()
    room = type("R", (), {"state": started()})()
    out = race.relay(room, 0, "pose", {"d": [1.5, 10, 2, -30, 0, 0, 0, 1, 2]})
    assert out == {"d": [1.5, 10.0, 2.0, -30.0, 0.0, 0.0, 0.0, 1.0, 2]}
