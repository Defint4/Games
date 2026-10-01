"""Règles de progression de RT1 : médailles, gains, niveaux, missions.

Les médailles sont le miroir de frontend/src/games/rt1/circuits.ts (en millisecondes) ;
les textes des missions sont côté client (i18n.ts), rangés par identifiant.
"""

from dataclasses import dataclass

MEDALS = ("bronze", "silver", "gold", "author")

# Temps à battre (ms, bornes incluses), par circuit.
CIRCUITS: dict[str, dict[str, int]] = {
    "noumea": {"author": 47_000, "gold": 49_500, "silver": 54_500, "bronze": 62_000},
    "centre-ville": {"author": 73_500, "gold": 77_500, "silver": 85_000, "bronze": 97_000},
    "le-col": {"author": 50_000, "gold": 52_500, "silver": 58_000, "bronze": 66_000},
    "la-corniche": {"author": 51_000, "gold": 53_500, "silver": 59_000, "bronze": 67_000},
}

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
    "engine", "turbo", "gearbox", "drivetrain", "tyres", "suspension", "brakes", "aero", "weight",
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


def bots_money(level: str, count: int, place: int) -> int:
    share = PLACE_SHARE[place - 1] if place <= len(PLACE_SHARE) else OTHER_SHARE
    return round(BOT_MONEY[level] * share * count / MAX_BOTS / 10) * 10


# En ligne : prime du vainqueur d'une course à 8 pilotes ; mêmes parts pour les suivants
# que contre les bots, au prorata du nombre de pilotes au départ.
MAX_PILOTS = 8
ONLINE_MONEY = 600


def online_money(count: int, place: int) -> int:
    share = PLACE_SHARE[place - 1] if place <= len(PLACE_SHARE) else OTHER_SHARE
    return round(ONLINE_MONEY * share * count / MAX_PILOTS / 10) * 10


def medals_for(circuit: str, time_ms: int | None) -> list[str]:
    """Médailles obtenues avec ce temps, de la bronze à la meilleure."""
    if time_ms is None:
        return []
    return [m for m in MEDALS if time_ms <= CIRCUITS[circuit][m]]


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

    @property
    def xp(self) -> int:
        return self.reward // 10

    def progress(self, bests: dict[str, int], finishes: int, workshop: dict | None = None) -> int:
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
            return int(self.medal in medals_for(self.circuit, bests.get(self.circuit)))
        return min(self.count, sum(self.medal in medals_for(c, t) for c, t in bests.items()))

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
)
