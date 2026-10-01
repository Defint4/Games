"""Les constantes de RT1 recopiées entre le serveur (rules.py) et le client (circuits.ts,
sim/vehicles.ts, sim/tuning.ts, sim/bots.ts, online/Lobby.tsx) doivent rester identiques :
on relit les sources TypeScript par expression régulière."""

import math
import re
from pathlib import Path

import pytest

from app.games.rt1 import rules

FRONT = Path(__file__).resolve().parents[5] / "frontend" / "src" / "games" / "rt1"


def source(name: str) -> str:
    return (FRONT / name).read_text(encoding="utf8")


def test_medals_match_circuits_ts():
    src = source("circuits.ts")
    found = {}
    for m in re.finditer(
        r'slug:\s*"([^"]+)".*?medals:\s*\{\s*author:\s*([\d.]+),\s*gold:\s*([\d.]+),'
        r"\s*silver:\s*([\d.]+),\s*bronze:\s*([\d.]+)\s*\}",
        src,
        re.S,
    ):
        slug, *times = m.groups()
        ms = (round(float(t) * 1000) for t in times)
        found[slug] = dict(zip(("author", "gold", "silver", "bronze"), ms, strict=True))
    assert found == rules.CIRCUITS


def test_vehicle_prices_and_levels_match_vehicles_ts():
    src = source("sim/vehicles.ts")
    found = {
        m.group(1): (int(m.group(2)), int(m.group(3)))
        for m in re.finditer(r'id:\s*"([^"]+)".*?price:\s*(\d+),\s*level:\s*(\d+)', src, re.S)
    }
    assert found == rules.VEHICLES


def test_upgrade_steps_match_tuning_ts():
    src = source("sim/tuning.ts")
    steps = re.search(r"const STEP = \[([^\]]+)\]", src)
    assert steps is not None
    assert tuple(float(s) for s in steps.group(1).split(",")) == rules.UPGRADE_STEP
    assert re.search(r"MAX_LEVEL = (\d+)", src).group(1) == str(rules.MAX_LEVEL)


@pytest.mark.parametrize("vehicle", list(rules.VEHICLES))
def test_upgrade_cost_rounds_like_javascript(vehicle: str):
    # Math.round arrondit les x,5 vers le haut, round() de Python au pair : les deux
    # doivent tomber d'accord pour tous les prix existants.
    ref = max(rules.VEHICLES[vehicle][0], 6000)
    for level in range(1, rules.MAX_LEVEL):
        js = math.floor(ref * rules.UPGRADE_STEP[level] / 50 + 0.5) * 50
        assert rules.upgrade_cost(vehicle, level) == js


def test_bot_money_matches_bots_ts():
    src = source("sim/bots.ts")
    m = re.search(r"BOT_MONEY[^=]*=\s*\{([^}]+)\}", src)
    assert m is not None
    found = {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", m.group(1))}
    assert found == rules.BOT_MONEY
    assert re.search(r"MAX_BOTS = (\d+)", src).group(1) == str(rules.MAX_BOTS)


def test_max_pilots_matches_lobby():
    src = source("online/Lobby.tsx")
    assert re.search(r"MAX_PILOTS = (\d+)", src).group(1) == str(rules.MAX_PILOTS)
