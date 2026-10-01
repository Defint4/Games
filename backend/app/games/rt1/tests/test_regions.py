"""Les régions de la campagne (rules.py) : ouverture au bronze partout dans la précédente,
missions comptées dans leur région."""

from app.games.rt1 import rules

NOUMEA = ("noumea", "centre-ville", "le-col", "la-corniche")


def bronze(circuit: str, vehicle: str = "starter") -> tuple[int, str]:
    return (rules.medal_times(circuit, vehicle)["bronze"], vehicle)


def test_regions_cover_every_circuit_once():
    seen = [c for _, circuits in rules.REGIONS for c in circuits]
    assert len(seen) == len(set(seen))
    assert set(rules.GATES) == set(seen)
    assert rules.REGIONS[0][0] == "noumea"


def test_first_region_only_until_bronze_everywhere():
    assert rules.unlocked_regions({}) == ["noumea"]
    almost = {c: bronze(c) for c in NOUMEA[:-1]}
    assert rules.unlocked_regions(almost) == ["noumea"]
    # un temps au-dessus du bronze sur le dernier circuit ne suffit pas
    almost["la-corniche"] = (bronze("la-corniche")[0] + 1, "starter")
    assert rules.unlocked_regions(almost) == ["noumea"]


def test_bronze_everywhere_opens_the_south_whatever_the_vehicle():
    bests = {c: bronze(c, "f1" if c == "le-col" else "starter") for c in NOUMEA}
    assert rules.unlocked_regions(bests) == ["noumea", "grand-sud"]


def test_missions_count_medals_in_their_own_region():
    all_bronze = next(m for m in rules.MISSIONS if m.id == "all-bronze")
    south_bronze = next(m for m in rules.MISSIONS if m.id == "south-bronze")
    bests = {c: bronze(c) for c in NOUMEA}
    assert all_bronze.progress(bests, 0) == 4
    assert south_bronze.progress(bests, 0) == 0
    assert all(m.region in dict(rules.REGIONS) for m in rules.MISSIONS)
