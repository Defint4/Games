"""Les circuits de RT1. Chaque région (world_<région>.py) a son île : terrain, décor,
lumière ; chaque circuit a son tracé (points de contrôle, repère Blender : x vers l'est,
y vers le nord, la mer au sud), ses murs ou non, son nombre de tours et ses blocs (boosts,
sauts), placés en fraction de la longueur du tour. Sans `region`, c'est Nouméa."""

CIRCUITS = {
    # ---- Région 1 : Nouméa
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
    # ---- Région 2 : Grand Sud (sans murs : sortie de route libre)
    # La plaine des Lacs : grande boucle rapide autour du Grand Lac, deux tours.
    "plaine-des-lacs": {
        "region": "grand-sud",
        "ctrl": [(0, 40), (130, 30), (240, 80), (260, 160), (170, 215), (60, 250), (-10, 230), (-90, 185),
                 (-60, 120), (-20, 80)],
        "walls": False,
        "laps": 2,
        "boosts": [0.15, 0.6],
        "jumps": [],
    },
    # Yaté : le long du lac et du barrage, montée sur la cuirasse, saut sur la crête, un tour.
    "yate": {
        "region": "grand-sud",
        "ctrl": [(300, 120), (420, 110), (520, 170), (560, 280), (520, 420), (400, 470), (260, 440), (150, 380),
                 (120, 260), (200, 170)],
        "walls": False,
        "laps": 1,
        "boosts": [0.05, 0.78],
        # le saut sur la descente de la cuirasse, dans une ligne droite : après le saut du
        # sommet, les motos sortaient dans le virage qui suivait
        "jumps": [(0.62, 2.2)],
    },
    # Prony : le tour de la baie par la côte rocheuse, les ruines du bagne, un tour.
    "prony": {
        "region": "grand-sud",
        "ctrl": [(-30, 60), (-110, 110), (-170, 150), (-230, 130), (-280, 70), (-330, 30), (-380, 70), (-360, 150),
                 (-270, 210), (-160, 235), (-60, 190), (10, 120)],
        "walls": False,
        "laps": 1,
        "boosts": [0.12, 0.62],
        "jumps": [(0.3, 2.2)],
    },
    # La Madeleine : court et technique entre le lac des Fougères et le lac en Huit, deux tours.
    "la-madeleine": {
        "region": "grand-sud",
        "ctrl": [(-180, 300), (-230, 380), (-320, 420), (-400, 380), (-410, 290), (-360, 240), (-260, 230),
                 (-200, 260)],
        "walls": False,
        "laps": 2,
        "boosts": [0.2],
        # pas de saut : les virages qui suivent sont trop serrés pour y retomber à moto
        "jumps": [],
    },
}
