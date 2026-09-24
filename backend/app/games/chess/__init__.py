"""Échecs : parties en ligne classées à l'Elo, bots et bilan de partie côté appareil.

engine.py   règles (python-chess), pendules, nulle, abandon, annulation
rating.py   Elo unique, départ à 300
clock.py    surveillance des pendules
views.py    ce que voit chaque siège
models.py   les parties terminées (historique, bilan)
service.py  Elo et archivage en fin de partie, parties récentes
router.py   /api/chess (parties récentes, relecture)
spec.py     branchement sur la plateforme (GameSpec)
"""

SLUG = "chess"
