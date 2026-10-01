"""Les circuits de RT1. Tous partagent l'île (terrain, ville, lagon) de level.py ; chacun a
son tracé (points de contrôle, repère Blender : x vers l'est, y vers le nord, la mer au
sud), ses murs ou non, son nombre de tours et ses blocs (boosts, sauts), placés en
fraction de la longueur du tour."""

CIRCUITS = {
    # Le premier circuit : la baie puis les collines, un tour.
    "noumea": {
        "ctrl": [(-300, 0), (-100, 6), (100, -4), (220, 12), (285, 80), (270, 170), (190, 215), (110, 190),
                 (40, 235), (-50, 250), (-130, 195), (-215, 215), (-300, 175), (-370, 100), (-372, 30)],
        "walls": True,
        "laps": 1,
        "boosts": [],
        "jumps": [],
    },
    # Entre les immeubles du front de mer : virages serrés, deux tours.
    "centre-ville": {
        "ctrl": [(-20, 2), (-150, 4), (-235, 6), (-262, 32), (-258, 78), (-225, 98), (-170, 96), (-148, 72),
                 (-128, 48), (-70, 44), (-40, 66), (-8, 96), (42, 92), (60, 60), (44, 26), (12, 8)],
        "walls": True,
        "laps": 2,
        "boosts": [0.06, 0.52],
        "jumps": [],
    },
    # Dans les collines, sans murs : lacets, un saut sur la crête.
    "le-col": {
        "ctrl": [(0, 150), (120, 165), (200, 210), (230, 290), (170, 330), (110, 300), (60, 340), (0, 400),
                 (-90, 390), (-150, 330), (-120, 280), (-180, 240), (-200, 180), (-110, 150)],
        "walls": False,
        "laps": 1,
        "boosts": [0.02],
        "jumps": [(0.47, 2.6)],
    },
    # La corniche de l'ouest : falaises sur le lagon, rapide, deux tours.
    "la-corniche": {
        "ctrl": [(-300, 20), (-380, 2), (-480, -4), (-560, 22), (-600, 82), (-570, 150), (-500, 190),
                 (-420, 172), (-360, 130), (-300, 80)],
        "walls": True,
        "laps": 2,
        "boosts": [0.1, 0.58],
        "jumps": [(0.8, 2.2)],
    },
}
