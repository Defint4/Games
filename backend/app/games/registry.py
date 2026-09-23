"""Registre des jeux. Ajouter un jeu = un dossier `app/games/<slug>/` et une ligne ici."""

from __future__ import annotations

from app.games.base import GameSpec
from app.games.goulag import Goulag
from app.games.nine_to_one import NineToOne
from app.games.perudo import Perudo

GAMES: dict[str, GameSpec] = {spec.slug: spec for spec in (NineToOne(), Goulag(), Perudo())}


def get_game(slug: str) -> GameSpec | None:
    return GAMES.get(slug)
