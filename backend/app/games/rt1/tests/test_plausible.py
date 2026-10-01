"""Les bornes de plausibilité d'une arrivée (rules.py) : temps, passages, fantôme."""

import math
import struct

from app.games.rt1 import rules


def ghost(times: list[float], x: float = 0.0) -> bytes:
    return b"".join(struct.pack("<8f", t, x, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0) for t in times)


def test_time_floor_lets_the_f1_pass_but_not_a_fake():
    assert rules.plausible_time("noumea", 29_000)  # F1 au pilote automatique : 30,7 s
    assert not rules.plausible_time("noumea", 20_000)
    assert not rules.plausible_time("noumea", 1)


def test_splits_one_per_gate_increasing_ending_at_the_finish():
    assert rules.plausible_splits("noumea", 50_000, [12_000, 25_000, 38_000, 50_000])
    assert rules.plausible_splits(
        "centre-ville", 80_000, [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000]
    )
    assert not rules.plausible_splits("noumea", 50_000, [12_000, 25_000, 50_000])
    assert not rules.plausible_splits("noumea", 50_000, [12_000, 11_000, 38_000, 50_000])
    assert not rules.plausible_splits("noumea", 50_000, [12_000, 25_000, 38_000, 49_000])
    assert not rules.plausible_splits("noumea", 50_000, [-5, 25_000, 38_000, 50_000])


def test_ghost_shape_and_values():
    good = ghost([k / 20 for k in range(0, 20 * 50 + 1)])
    assert rules.plausible_ghost(50_000, good)
    assert not rules.plausible_ghost(50_000, good[:-3])  # pose incomplète
    assert not rules.plausible_ghost(50_000, ghost([0.0]))  # une seule pose
    assert not rules.plausible_ghost(2_000, good)  # trop de poses pour 2 s
    assert not rules.plausible_ghost(50_000, ghost([0.0, 1.0, 0.5]))  # temps qui recule
    assert not rules.plausible_ghost(50_000, ghost([0.0, 1.0], x=math.nan))
    assert not rules.plausible_ghost(50_000, ghost([0.0, 1.0], x=1e30))
    assert not rules.plausible_ghost(50_000, ghost([5.0, 6.0]))  # ne part pas du départ
    assert not rules.plausible_ghost(50_000, ghost([0.0, 80.0]))  # finit après l'arrivée


def test_rounding_matches_math_round():
    assert rules.online_money(3, 1) == 230  # 600 × 3 / 8 = 225 → 230 (Math.round), pas 220
    assert rules.bots_money("normal", 7, 1) == 400
