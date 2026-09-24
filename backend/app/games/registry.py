"""Registre des jeux. Ajouter un jeu = un dossier `app/games/<slug>/` et une ligne ici."""

from __future__ import annotations

from app.games.base import GameSpec
from app.games.chess.spec import Chess
from app.games.goulag import Goulag
from app.games.nine_to_one import NineToOne
from app.games.perudo import Perudo
from app.games.solitaire import SLUG as SOLITAIRE

GAMES: dict[str, GameSpec] = {
    spec.slug: spec for spec in (NineToOne(), Goulag(), Perudo(), Chess())
}

# Jeux solo, sans table : ils ont leurs propres routes et pas de GameSpec, mais des
# stats et un classement comme les autres.
SOLO_GAMES = frozenset({SOLITAIRE})


def get_game(slug: str) -> GameSpec | None:
    return GAMES.get(slug)


def is_game(slug: str) -> bool:
    return slug in GAMES or slug in SOLO_GAMES
