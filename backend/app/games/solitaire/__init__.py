"""Solitaire (Klondike, pioche une carte) : jeu solo, hors tables.

Pas de GameSpec : ni sièges, ni WebSocket, ni bots. Le joueur joue en local, le serveur
tire la donne, garde l'heure de départ et rejoue la partie à la fin pour la valider.

engine.py   règles pures, miroir de frontend/src/games/solitaire/engine.ts
models.py   une ligne par donne servie
service.py  donner, abandonner, valider une victoire
router.py   /api/solitaire
"""

SLUG = "solitaire"
