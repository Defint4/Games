"""Perudo : jeu de dés et de bluff (2 à 6 joueurs), bots Facile, Normal et Difficile.

engine/    règles pures (aucune I/O), testées dans tests/
views.py   ce que chaque siège a le droit de voir
bots.py    Facile / Normal / Difficile (probabilités), cadencement des manches
spec.py    branchement sur la plateforme (GameSpec)
"""

from app.games.perudo.spec import Perudo

__all__ = ["Perudo"]
