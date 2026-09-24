"""Elo des échecs : une seule cote par joueur, toutes cadences confondues.

Tout le monde part de INITIAL_RATING. K vaut 40 pendant les NEW_PLAYER_GAMES premières
parties (la cote trouve vite son niveau), 20 ensuite. Plancher à FLOOR, comme chess.com.
"""

from __future__ import annotations

INITIAL_RATING = 300
FLOOR = 100
NEW_PLAYER_GAMES = 30


def k_factor(played: int) -> int:
    return 40 if played < NEW_PLAYER_GAMES else 20


def expected(rating: int, opponent: int) -> float:
    return 1 / (1 + 10 ** ((opponent - rating) / 400))


def delta(rating: int, opponent: int, score: float, played: int) -> int:
    """Variation de cote pour un résultat `score` (1 gagné, 0.5 nulle, 0 perdu), plancher
    compris. `played` : parties classées déjà jouées."""
    change = round(k_factor(played) * (score - expected(rating, opponent)))
    return max(FLOOR, rating + change) - rating
