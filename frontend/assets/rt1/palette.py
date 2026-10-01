"""Palette commune des circuits (couleurs linéaires) : route, murs, portiques, flore,
décor. Chaque région (world_*.py) y ajoute ou remplace ce qui lui est propre."""

from common import srgb

C = {k: srgb(v) for k, v in {
    "sand": "#DDC48F", "wet": "#BFA374", "grass": "#6F9444", "dry": "#A39A5B",
    "maquis": "#56693F", "laterite": "#B5532F", "laterite2": "#93432A", "urban": "#BDB5A3",
    "earth": "#8B6A4F", "seabed": "#D8C79A",
    "asphalt": "#FFFFFF", "shoulder": "#5C5D62", "gravel": "#B9AC92",
    "wall": "#ECEAE4", "wall_red": "#D8392B", "curb_red": "#D8392B", "curb_white": "#F3F1EC",
    "gate_dark": "#23272E", "gate_orange": "#FF7A2F", "white": "#F4F2EC", "black": "#1B1D22",
    "promenade": "#D9D2C3", "wood": "#9A7552", "wood_dark": "#6E5238",
    "glass": "#34424D", "roof_red": "#B5452C", "roof_green": "#3E7C59", "roof_zinc": "#9AA3A6",
    "shutter": "#2E86AB", "thatch": "#C8A96A", "hull": "#F6F6F2", "boat_blue": "#1F5F8B",
    "trunk": "#8C7355", "trunk2": "#76614A", "frond": "#5E9E3A", "frond2": "#437F2E",
    "pine": "#35664A", "pine2": "#3F744D", "bark_pine": "#5E4A38", "niaouli_bark": "#D6CCBA",
    "niaouli": "#7E9460", "niaouli2": "#6A8452", "bush": "#55803A", "bush2": "#6C8F45",
    "rock": "#8D8A84", "rock2": "#6F6C67", "lamp": "#3A3F47", "lamp_glass": "#FFF3D1",
    "coconut": "#6B4F2A",
}.items()}
