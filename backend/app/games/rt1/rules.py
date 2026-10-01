"""Règles de progression de RT1 : médailles, gains, niveaux, missions.

Les médailles sont le miroir de frontend/src/games/rt1/circuits.ts (en millisecondes) ;
les textes des missions sont côté client (i18n.ts), rangés par identifiant.
"""

import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

MEDALS = ("bronze", "silver", "gold", "author")

# Le rythme du pilote automatique par circuit et par véhicule (pace.json, écrit par
# frontend/assets/rt1/bots.ts avec les tours des bots) : `base` = meilleur tour de la
# citadine (s), `ratio` par véhicule. Les médailles en découlent : chaque véhicule a les
# siennes (la F1 va 40 % plus vite que la citadine), miroir de frontend circuits.ts.
PACE: dict[str, dict] = json.loads((Path(__file__).parent / "pace.json").read_text("utf8"))
CIRCUITS = frozenset(PACE)
MEDAL_FACTORS = {"author": 0.985, "gold": 1.03, "silver": 1.13, "bronze": 1.28}


def medal_times(circuit: str, vehicle: str) -> dict[str, int]:
    """Temps à battre (ms, bornes incluses) sur un circuit, pour un véhicule."""
    p = PACE[circuit]
    ref = p["base"] * p["ratio"].get(vehicle, 1.0)
    return {m: round(round(ref * f, 2) * 1000) for m, f in MEDAL_FACTORS.items()}


# Portes par course (checkpoints et ligne, par tour) : la longueur des temps de passage.
GATES: dict[str, int] = {
    "noumea": 4,
    "centre-ville": 8,
    "le-col": 4,
    "la-corniche": 8,
    "plaine-des-lacs": 8,
    "yate": 4,
    "prony": 4,
    "la-madeleine": 8,
}

# Les régions de la campagne, dans l'ordre, avec leurs circuits (miroir de circuits.ts).
# La première est ouverte ; chacune des suivantes s'ouvre avec le bronze sur tous les
# circuits de la précédente. En ligne, tous les circuits restent ouverts.
REGIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("noumea", ("noumea", "centre-ville", "le-col", "la-corniche")),
    ("grand-sud", ("plaine-des-lacs", "yate", "prony", "la-madeleine")),
)
REGION_OF: dict[str, str] = {c: r for r, circuits in REGIONS for c in circuits}

# En deçà de cette part du temps auteur, aucun véhicule ne passe (la F1 est à 0,61 au
# pilote automatique) : un temps plus bas est inventé.
MIN_TIME_RATIO = 0.5


def plausible_time(circuit: str, time_ms: int) -> bool:
    return time_ms >= PACE[circuit]["base"] * 1000 * MIN_TIME_RATIO


def plausible_splits(circuit: str, time_ms: int, splits: list[int]) -> bool:
    """Un passage par porte, dans l'ordre, le dernier à l'arrivée."""
    if len(splits) != GATES[circuit]:
        return False
    if any(b <= a for a, b in zip(splits, splits[1:], strict=False)):
        return False
    return 0 < splits[0] and abs(splits[-1] - time_ms) <= 1


GHOST_HZ = 20
GHOST_STRIDE = 32  # 8 flottants de 4 octets : t, x, y, z, qx, qy, qz, qw


def plausible_ghost(time_ms: int, ghost: bytes) -> bool:
    """Des poses complètes, finies, dans l'ordre, qui couvrent le tour sans le dépasser,
    et pas plus que la cadence d'enregistrement n'en produit."""
    if len(ghost) % GHOST_STRIDE != 0 or len(ghost) < 2 * GHOST_STRIDE:
        return False
    if len(ghost) > (time_ms / 1000 * GHOST_HZ + 3) * GHOST_STRIDE:
        return False
    last_t = -1.0
    for pose in struct.iter_unpack("<8f", ghost):
        if not all(math.isfinite(v) for v in pose):
            return False
        t = pose[0]
        if t < last_t or abs(pose[1]) > 5000 or abs(pose[2]) > 500 or abs(pose[3]) > 5000:
            return False
        last_t = t
    first_t = struct.unpack_from("<f", ghost, 0)[0]
    return first_t <= 0.2 and last_t <= time_ms / 1000 + 0.1


# Le garage : prix (F) et niveau de pilote requis, miroir de
# frontend/src/games/rt1/sim/vehicles.ts. La citadine est offerte.
VEHICLES: dict[str, tuple[int, int]] = {
    "starter": (0, 1),
    "kart": (4000, 2),
    "trail": (5000, 2),
    "truck": (6000, 3),
    "pickup": (7000, 3),
    "suv": (9000, 4),
    "sport": (11000, 4),
    "mx": (12000, 5),
    "rally": (14000, 5),
    "buggy": (16000, 5),
    "sportbike": (30000, 7),
    "super": (45000, 8),
    "f1": (70000, 10),
}
STARTER = "starter"

# L'atelier : neuf pièces du niveau 1 (d'origine) au niveau 5 ; au niveau 5 d'une pièce,
# ses réglages fins (-1 à +1). Effets sur la physique : frontend sim/tuning.ts.
PARTS = (
    "engine",
    "turbo",
    "gearbox",
    "drivetrain",
    "tyres",
    "suspension",
    "brakes",
    "aero",
    "weight",
)
MAX_LEVEL = 5
TUNES = {
    "gearing": "gearbox",
    "height": "suspension",
    "stiffness": "suspension",
    "downforce": "aero",
    "brakeBias": "brakes",
}
# Part du prix du véhicule (6 000 F au moins) pour passer au niveau 2, 3, 4, 5 : tout
# améliorer coûte environ une fois et demie le véhicule.
UPGRADE_STEP = (0, 0.02, 0.03, 0.05, 0.07)


def upgrade_cost(vehicle: str, level: int) -> int:
    """Prix pour passer du niveau `level` au suivant."""
    ref = max(VEHICLES[vehicle][0], 6000)
    return round(ref * UPGRADE_STEP[level] / 50) * 50


# Chaque course finie rapporte un peu : jouer beaucoup rend plus fort (voulu).
FINISH_MONEY = 50
FINISH_XP = 10
# Une médaille ne paie qu'une fois par circuit ; passer de rien à l'or paie les trois.
MEDAL_MONEY = {"bronze": 300, "silver": 600, "gold": 1200, "author": 2500}
MEDAL_XP = {"bronze": 40, "silver": 80, "gold": 160, "author": 300}


# Contre les bots : prime du vainqueur face à 7 bots, selon leur niveau ; les suivants
# en touchent une part, et moins de bots paient au prorata.
BOT_LEVELS = ("easy", "normal", "hard", "expert")
MAX_BOTS = 7
BOT_MONEY = {"easy": 200, "normal": 400, "hard": 800, "expert": 1500}
PLACE_SHARE = (1.0, 0.6, 0.4)
OTHER_SHARE = 0.15


def _round10(x: float) -> int:
    """Arrondi à la dizaine, les 5 vers le haut (comme Math.round côté client, alors que
    round() de Python arrondit au pair)."""
    return int(x / 10 + 0.5) * 10


def bots_money(level: str, count: int, place: int) -> int:
    share = PLACE_SHARE[place - 1] if place <= len(PLACE_SHARE) else OTHER_SHARE
    return _round10(BOT_MONEY[level] * share * count / MAX_BOTS)


# En ligne : prime du vainqueur d'une course à 8 pilotes ; mêmes parts pour les suivants
# que contre les bots, au prorata du nombre de pilotes au départ.
MAX_PILOTS = 8
ONLINE_MONEY = 600


def online_money(count: int, place: int) -> int:
    share = PLACE_SHARE[place - 1] if place <= len(PLACE_SHARE) else OTHER_SHARE
    return _round10(ONLINE_MONEY * share * count / MAX_PILOTS)


def medals_for(circuit: str, time_ms: int | None, vehicle: str = STARTER) -> list[str]:
    """Médailles obtenues avec ce temps dans ce véhicule, de la bronze à la meilleure."""
    if time_ms is None:
        return []
    limits = medal_times(circuit, vehicle)
    return [m for m in MEDALS if time_ms <= limits[m]]


def unlocked_regions(bests: dict[str, tuple[int, str]]) -> list[str]:
    """Les régions ouvertes au pilote, d'après ses records (ms, véhicule) par circuit."""
    out = [REGIONS[0][0]]
    for (_, circuits), (region, _) in zip(REGIONS, REGIONS[1:], strict=False):
        if not all(c in bests and "bronze" in medals_for(c, *bests[c]) for c in circuits):
            break
        out.append(region)
    return out


def level_floor(level: int) -> int:
    """Expérience qu'il faut pour atteindre ce niveau : 0, 100, 300, 600, 1000…"""
    return 50 * level * (level - 1)


def level_for(xp: int) -> int:
    level = 1
    while xp >= level_floor(level + 1):
        level += 1
    return level


@dataclass(frozen=True)
class Mission:
    id: str
    reward: int
    # "finishes" : courses finies ; "medal" : une médaille sur un circuit donné ;
    # "medals" : une médaille (ou mieux) sur `count` circuits ; "bots" : finir à la place
    # `place` ou mieux contre `rivals` bots (ou plus) du niveau `level` (ou plus), avec un
    # indice de performance d'au plus `pi_max` s'il est donné ; "maxed" : `count` pièces
    # au niveau 5 sur un même véhicule.
    kind: str
    count: int = 1
    medal: str | None = None
    circuit: str | None = None
    level: str | None = None
    rivals: int = 0
    place: int = 1
    pi_max: int | None = None
    # La région de la campagne qui propose la mission ; les médailles comptées
    # ("medals") sont celles de ses circuits.
    region: str = "noumea"

    @property
    def xp(self) -> int:
        return self.reward // 10

    def progress(
        self, bests: dict[str, tuple[int, str]], finishes: int, workshop: dict | None = None
    ) -> int:
        """`bests` : par circuit, le record (ms) et le véhicule qui l'a fait."""
        if self.kind == "finishes":
            return min(finishes, self.count)
        if self.kind == "maxed":
            maxed = (
                sum(lv >= MAX_LEVEL for lv in w.get("levels", {}).values())
                for w in (workshop or {}).values()
            )
            best = max(maxed, default=0)
            return min(best, self.count)
        if self.kind == "bots":
            # Accomplie sur l'instant (voir `beaten_by`), rien à cumuler.
            return 0
        if self.kind == "medal":
            best = bests.get(self.circuit)
            return int(best is not None and self.medal in medals_for(self.circuit, *best))
        return min(
            self.count,
            sum(
                self.medal in medals_for(c, t, v)
                for c, (t, v) in bests.items()
                if REGION_OF.get(c) == self.region
            ),
        )

    def beaten_by(self, level: str, count: int, place: int, pi: int | None) -> bool:
        return (
            self.kind == "bots"
            and BOT_LEVELS.index(level) >= BOT_LEVELS.index(self.level)
            and count >= self.rivals
            and place <= self.place
            and (self.pi_max is None or (pi is not None and pi <= self.pi_max))
        )


# Région 1 : Nouméa. Dans l'ordre d'affichage.
MISSIONS: tuple[Mission, ...] = (
    Mission("first-lap", 200, "finishes"),
    Mission("seafront-bronze", 300, "medal", medal="bronze", circuit="noumea"),
    Mission("all-bronze", 800, "medals", count=4, medal="bronze"),
    Mission("pass-silver", 800, "medal", medal="silver", circuit="le-col"),
    Mission("cliff-gold", 1200, "medal", medal="gold", circuit="la-corniche"),
    Mission("first-win", 500, "bots", level="easy", rivals=3),
    Mission("mechanic", 600, "maxed"),
    Mission("regular", 1000, "finishes", count=25),
    Mission("normal-podium", 800, "bots", level="normal", rivals=7, place=3),
    Mission("small-budget", 1500, "bots", level="normal", rivals=5, pi_max=400),
    Mission("three-golds", 2000, "medals", count=3, medal="gold"),
    Mission("hard-win", 2500, "bots", level="hard", rivals=7),
    Mission("author", 3000, "medals", count=1, medal="author"),
    Mission("full-tune", 3000, "maxed", count=9),
    Mission("all-gold", 4000, "medals", count=4, medal="gold"),
    Mission("expert-win", 5000, "bots", level="expert", rivals=7),
    # Région 2 : le Grand Sud.
    Mission(
        "lakes-bronze", 400, "medal", medal="bronze", circuit="plaine-des-lacs", region="grand-sud"
    ),
    Mission("south-bronze", 1000, "medals", count=4, medal="bronze", region="grand-sud"),
    Mission("yate-silver", 1000, "medal", medal="silver", circuit="yate", region="grand-sud"),
    Mission("red-dirt-win", 2000, "bots", level="hard", rivals=5, region="grand-sud"),
    Mission("prony-gold", 1500, "medal", medal="gold", circuit="prony", region="grand-sud"),
    Mission("south-regular", 1500, "finishes", count=60, region="grand-sud"),
    Mission(
        "madeleine-author",
        3500,
        "medal",
        medal="author",
        circuit="la-madeleine",
        region="grand-sud",
    ),
    Mission("south-gold", 5000, "medals", count=4, medal="gold", region="grand-sud"),
)
