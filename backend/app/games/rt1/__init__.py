"""RT1 : course contre la montre, jeu solo hors tables, et courses en direct.

La course se joue sur l'appareil, le serveur garde la progression (argent, niveau,
missions), le meilleur temps et le fantôme de chacun par circuit. Pas d'anti-triche pour
l'instant : les temps envoyés sont crus (docs/rt1/README.md).

rules.py    circuits et médailles, gains, niveaux, missions
models.py   profil du pilote, records par circuit
service.py  arrivée d'une course, classements, fantômes
router.py   /api/rt1
spec.py     GameSpec des courses en direct (tables, top départ commun, relais des poses)
"""

SLUG = "rt1"
