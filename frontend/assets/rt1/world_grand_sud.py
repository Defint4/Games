"""Région 2, le Grand Sud : la plaine des Lacs sur la terre rouge, le maquis minier, les
cuirasses tabulaires au nord, la baie de Prony qui s'enfonce dans la côte, le lac de Yaté
et son barrage, la ligne haute tension, les ruines du bagne de Prony, des cases. Fin
d'après-midi dorée. Même contrat que world_noumea.py."""

import math

from mathutils import Vector

import flora
from common import fbm, mix, shade, smoothstep, srgb
from palette import C

C.update({k: srgb(v) for k, v in {
    # terre rouge au bord des routes (remplace la terre brune de Nouméa)
    "earth": "#9A4A2E",
    "mud": "#6E3B2A", "lake_bed": "#8A5A3E", "coast_rock": "#5C3F38",
    "iron": "#5A3C34", "iron2": "#3E2A26", "crust": "#4E3431", "maquis_ground": "#7F8A5A",
    "maquis_a": "#7C8F6A", "maquis_b": "#98A07A", "maquis_stem": "#8E4A3A",
    "kaori": "#4E7A4A", "kaori2": "#5E8A50", "kaori_bark": "#8A8070",
    "fern": "#6AA04C", "fern2": "#4F8A3E", "fern_stem": "#5A4A3A",
    "concrete": "#B8B4A8", "concrete_dark": "#8C8880", "rust": "#8A4A2A", "rust2": "#5E3320",
    "steel": "#6E737A", "stone": "#9A9388", "stone_dark": "#6E675E", "case_wall": "#7A5A3E",
}.items()})

# Lumière : fin d'après-midi, soleil bas à l'ouest, chaud ; ciel un peu voilé.
SUN = Vector((-0.62, 0.38, 0.50)).normalized()
SUN_COLOR = (1.0, 0.86, 0.68)
SKY = ((0.46, 0.60, 0.90, 1), 0.5)
BACKDROP = ("#5E6358", "#7E8591")
# Ciel voilé et chaud, lacs vert sombre, baie profonde (three/materials.ts)
PALETTE = {"zenith": "#3F86CF", "horizon": "#D8DCD4", "sun": "#FFE9C8",
           "shallow": "#9CCDB8", "lagoon": "#2F9C93", "deep": "#14616A", "ocean": "#0B4659"}

KINDS = ("pine", "niaouli", "kaori", "maquis", "boulder", "fern")

# Les lacs : centre, demi-axes, rotation. Yaté au nord-est (et son barrage au sud), le lac
# en Huit (deux lobes), le Grand Lac au milieu de la plaine, le lac des Fougères à l'ouest.
LAKES = (
    (330.0, 300.0, 170.0, 110.0, -0.25),
    (-80.0, 250.0, 60.0, 56.0, 0.0),
    (-20.0, 300.0, 50.0, 46.0, 0.0),
    (120.0, 150.0, 70.0, 62.0, 0.4),
    (-300.0, 330.0, 45.0, 40.0, 0.0),
)
DAM = (330.0, 190.0)


def protos(L):
    return {"pine": flora.proto_pine(L.PROTO), "niaouli": flora.proto_niaouli(L.PROTO), "kaori": flora.proto_kaori(L.PROTO),
            "maquis": flora.proto_maquis(L.PROTO), "boulder": flora.proto_boulder(L.PROTO), "fern": flora.proto_fern(L.PROTO)}


# ---------------------------------------------------------------- relief
def shore_y(x):
    """Côte découpée : la baie de Prony remonte à y ≈ 110 autour de x = −150, la baie de
    Port-Boisé un peu à l'est."""
    base = -40 + 8 * math.sin(x / 83) + 4 * math.sin(x / 31 + 0.7)
    prony = 150 * math.exp(-((x + 150) / 90) ** 2)
    boise = 55 * math.exp(-((x - 380) / 55) ** 2)
    return base + prony + boise


def lake_e(x, y):
    """Distance normalisée au lac le plus proche (1 = la rive théorique)."""
    best = 9.0
    for cx, cy, rx, ry, rot in LAKES:
        dx, dy = x - cx, y - cy
        c, s = math.cos(rot), math.sin(rot)
        u, v = dx * c + dy * s, -dx * s + dy * c
        best = min(best, math.hypot(u / rx, v / ry))
    return best


def natural(x, y):
    d = y - shore_y(x)
    n = fbm(x * 0.006 + 21, y * 0.006 - 4)
    if d < 0:
        # baies profondes, sans récif
        return max(d * 0.13, -11 + 2 * n)
    coast = min(d * 0.16, 5.5)
    plain = 3.5 + 3.0 * fbm(x * 0.005 + 7, y * 0.005 + 2)
    # cuirasses tabulaires au nord : paliers nets (le lissage sature)
    big = fbm(x * 0.0028 - 2, y * 0.0028 + 1)
    mesa = smoothstep(190, 420, y) * (30 * smoothstep(0.05, 0.55, big) + 10 * smoothstep(-0.4, 0.1, big))
    side = smoothstep(430, 640, abs(x)) * (34 + 14 * n) * smoothstep(0, 60, d)
    gullies = 2.2 * fbm(x * 0.028 + 3, y * 0.028) * smoothstep(12, 60, d)
    creases = 1.6 * abs(fbm(x * 0.016 + 9, y * 0.016 - 7)) * smoothstep(100, 300, y)
    h = coast + plain + mesa + side + gullies + creases
    # cuvette en aval du barrage : le mur se voit des deux côtés
    bowl = 1 - smoothstep(30, 70, math.hypot(x - DAM[0], y - (DAM[1] - 45)))
    if bowl > 0:
        h = h * (1 - bowl) + (2.0 + 0.5 * n) * bowl
    # les lacs : rive irrégulière, fond à −3 m
    e = lake_e(x, y) + 0.06 * fbm(x * 0.02 + 5, y * 0.02 - 3)
    w = 1 - smoothstep(0.72, 1.12, e)
    if w > 0:
        h = h * (1 - w) + (-3.2 + 1.2 * n) * w
    return h


def terrain_color(x, y, h, slope):
    n = fbm(x * 0.03 + 11, y * 0.03)
    n2 = fbm(x * 0.009 - 5, y * 0.009 + 2)
    n3 = fbm(x * 0.05 - 17, y * 0.05 + 9)
    d = y - shore_y(x)
    if h < 0:
        return mix(C["mud"], C["lake_bed"], min(1, -h / 3))
    if d < 30 and h < 5.5:
        c = mix(C["coast_rock"], C["laterite2"], smoothstep(1, 5, h))
        return shade(c, 1 + 0.06 * n)
    lat = mix(C["laterite"], C["laterite2"], smoothstep(-0.3, 0.4, n2))
    c = shade(lat, 1 + 0.12 * n)
    # gravier de fer en taches sombres, plaques de gravillons clairs, maquis en plaques vert-gris
    c = mix(c, C["iron"], smoothstep(0.25, 0.6, n3) * 0.75)
    c = mix(c, C["gravel"], smoothstep(0.35, 0.7, fbm(x * 0.012 + 31, y * 0.012 - 13)) * 0.45)
    c = mix(c, C["maquis_ground"], smoothstep(-0.1, 0.45, n2 + 0.4 * n) * 0.7)
    # autour des lacs : joncs et herbes, puis boue rouge sombre sur la rive
    e = lake_e(x, y)
    if e < 1.7:
        c = mix(c, C["maquis_ground"], (1 - smoothstep(1.0, 4.5, h)) * (1 - smoothstep(1.3, 1.7, e)) * 0.6)
    if e < 1.4:
        c = mix(c, C["mud"], (1 - smoothstep(0.5, 2.5, h)) * (1 - smoothstep(1.1, 1.4, e)))
    # sommets des cuirasses : croûte brune ; pentes : latérite vive
    c = mix(c, C["crust"], smoothstep(28, 42, h) * 0.7)
    c = mix(c, C["laterite"], smoothstep(0.4, 0.8, slope) * 0.5)
    return c


# ---------------------------------------------------------------- décor cuit
def dam(L):
    """Le barrage de Yaté : voûte en béton bombée vers le lac, parapet, évacuateurs,
    local technique à l'est."""
    props = L.props
    cx, cy = DAM
    segs = 9
    half = 62.0
    bulge = 14.0
    z0, z1 = -5.0, 9.5
    pts = []
    for k in range(segs + 1):
        t = k / segs
        x = cx - half + 2 * half * t
        y = cy + bulge * math.sin(math.pi * t)
        pts.append((x, y))
    for k in range(segs):
        (xa, ya), (xb, yb) = pts[k], pts[k + 1]
        mx, my = (xa + xb) / 2, (ya + yb) / 2
        ln = math.hypot(xb - xa, yb - ya) + 0.3
        rz = math.atan2(yb - ya, xb - xa)
        props.box((mx, my, (z0 + z1) / 2), (ln, 5.0, z1 - z0), C["concrete"], rz)
        props.box((mx, my, z1 + 0.5), (ln, 0.5, 1.0), C["concrete_dark"], rz)
        if k in (4, 5):
            # évacuateurs : baies sombres côté aval
            props.box((mx - 1.8 * math.sin(rz), my + 1.8 * math.cos(rz) * -1, z1 - 3.0), (ln * 0.6, 1.8, 3.0), C["gate_dark"], rz)
    # local technique et pylône de départ
    ex, ey = pts[-1]
    props.box((ex + 6, ey - 2, z1 + 2.2), (9, 7, 4.4), C["concrete"])
    props.box((ex + 6, ey - 2, z1 + 4.6), (9.6, 7.6, 0.4), C["concrete_dark"])


def pylon(L, x, y, rz, hgt=32.0):
    """Pylône treillis : quatre pieds qui se resserrent, trois niveaux de traverses,
    deux consoles. Retourne les extrémités des consoles (points d'attache des câbles)."""
    props = L.props
    zg = L.height_at(x, y) - 0.4
    base, top = 4.2, 1.1
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return Vector((x + lx * ca - ly * sa, y + lx * sa + ly * ca, zg + lz))

    for sx in (-1, 1):
        for sy in (-1, 1):
            props.cylinder(P(sx * base, sy * base, 0), P(sx * top, sy * top, hgt), 0.22, 0.14, 4, C["steel"], cap=False)
    for lz in (8.0, 17.0, 25.0):
        w = base + (top - base) * lz / hgt
        for sx in (-1, 1):
            props.box(tuple(P(sx * w, 0, lz)), (0.16, 2 * w, 0.16), C["steel"], rz)
            props.box(tuple(P(0, sx * w, lz)), (2 * w, 0.16, 0.16), C["steel"], rz)
    tips = []
    for lz, arm in ((24.0, 5.5), (30.0, 4.2)):
        props.box(tuple(P(0, 0, lz)), (0.5, 2 * arm, 0.5), C["steel"], rz)
        for sy in (-1, 1):
            tips.append(P(0, sy * (arm - 0.3), lz - 0.4))
    props.cylinder(P(0, 0, hgt), P(0, 0, hgt + 2.4), 0.12, 0.05, 4, C["steel"])
    return tips


def power_line(L):
    """Du barrage vers l'ouest, par la plaine ; un pylône trop près de la route recule."""
    props = L.props
    route = [(300, 176), (215, 150), (130, 120), (45, 95), (-40, 120), (-120, 165), (-200, 190),
             (-280, 205), (-360, 215), (-440, 230), (-520, 250), (-600, 270)]
    prev = None
    for k, (x, y) in enumerate(route):
        nx_, ny_ = route[min(k + 1, len(route) - 1)]
        px, py = route[max(k - 1, 0)]
        rz = math.atan2(ny_ - py, nx_ - px)
        for _ in range(6):
            _, dist, _ = L.track_info(x, y)
            if dist > 15:
                break
            x, y = x - 9 * math.sin(rz), y + 9 * math.cos(rz)
        tips = pylon(L, x, y, rz)
        if prev:
            for a, b in zip(prev, tips):
                # câble en quatre tronçons, flèche de 5 m
                pts = []
                for s in range(5):
                    t = s / 4
                    p = a + (b - a) * t
                    p.z -= 5.0 * 4 * t * (1 - t)
                    pts.append(p)
                for s in range(4):
                    props.cylinder(pts[s], pts[s + 1], 0.07, 0.07, 3, C["gate_dark"], cap=False)
        prev = tips


def ruin_wall(L, x, y, w, d, h, rz, gaps=()):
    """Murs de pierre d'une bâtisse sans toit, avec des brèches."""
    props = L.props
    zg = L.height_at(x, y) - 0.3
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return (x + lx * ca - ly * sa, y + lx * sa + ly * ca, zg + lz)

    th = 0.6
    sides = [((0, -d / 2), (w, th), 0), ((0, d / 2), (w, th), 1), ((-w / 2, 0), (th, d), 2), ((w / 2, 0), (th, d), 3)]
    for (lx, ly), (sw, sd), idx in sides:
        hh = h * (0.55 if idx in gaps else 1.0)
        col = C["stone"] if idx % 2 else C["stone_dark"]
        props.box(P(lx, ly, hh / 2), (sw, sd, hh), col, rz)
        props.box(P(lx, ly, hh + 0.1), (sw * 0.9, sd * 0.9, 0.2), shade(col, 0.8), rz)


def prony_ruins(L):
    """Le village pénitentiaire de Prony : bâtisses en ruine, cheminée, chaudière rouillée."""
    props, rng = L.props, L.rng
    cx, cy = -245.0, 48.0
    ruin_wall(L, cx, cy, 12, 8, 4.5, 0.3, gaps=(1,))
    ruin_wall(L, cx - 18, cy + 6, 9, 7, 2.6, 0.3, gaps=(0, 3))
    ruin_wall(L, cx + 14, cy + 10, 7, 6, 2.2, 0.35, gaps=(2,))
    ruin_wall(L, cx - 6, cy - 14, 10, 6, 3.0, 0.3, gaps=(1, 2))
    zg = L.height_at(cx + 6, cy - 4)
    props.cylinder((cx + 6, cy - 4, zg), (cx + 6, cy - 4, zg + 11), 1.1, 0.8, 8, C["stone_dark"])
    props.cylinder((cx + 6, cy - 4, zg + 11), (cx + 6, cy - 4, zg + 11.6), 1.1, 1.1, 8, C["stone"])
    # chaudière couchée et cuve
    zb = L.height_at(cx - 4, cy + 18)
    props.cylinder((cx - 8, cy + 18, zb + 1.2), (cx, cy + 19, zb + 1.2), 1.2, 1.2, 9, C["rust"])
    props.cylinder((cx + 10, cy + 20, L.height_at(cx + 10, cy + 20)), (cx + 10, cy + 20, zb + 3.2), 1.6, 1.6, 9, C["rust2"])
    for _ in range(5):
        px, py = cx + rng.uniform(-22, 22), cy + rng.uniform(-18, 22)
        props.box((px, py, L.height_at(px, py) + 0.3), (rng.uniform(1.5, 3), rng.uniform(1, 2), 0.6), C["stone_dark"], rng.uniform(0, math.pi))


def case(L, x, y, r=3.2):
    """Case ronde : mur de bois, toit de paille conique, flèche faîtière."""
    props = L.props
    zg = L.height_at(x, y) - 0.2
    props.cylinder((x, y, zg), (x, y, zg + 2.2), r, r, 10, C["case_wall"])
    props.cylinder((x, y, zg + 2.0), (x, y, zg + 8.6), r + 1.1, 0.18, 10, shade(C["thatch"], 0.92))
    props.cylinder((x, y, zg + 8.6), (x, y, zg + 10.2), 0.14, 0.06, 4, C["wood_dark"])
    props.box((x, y, zg + 10.3), (0.6, 0.6, 0.5), C["wood_dark"])
    # porte basse
    props.box((x, y - r, zg + 0.8), (1.0, 0.3, 1.6), C["wood_dark"])


def fare(L, x, y, rz):
    """Faré de pique-nique : quatre poteaux, toit plat de paille."""
    props = L.props
    zg = L.height_at(x, y) - 0.1
    ca, sa = math.cos(rz), math.sin(rz)
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = x + (sx * 2.2) * ca - (sy * 1.6) * sa, y + (sx * 2.2) * sa + (sy * 1.6) * ca
            props.cylinder((px, py, zg), (px, py, zg + 2.6), 0.1, 0.1, 5, C["wood_dark"], cap=False)
    props.box((x, y, zg + 2.8), (5.6, 4.4, 0.45), C["thatch"], rz)
    props.box((x, y, zg + 0.5), (2.4, 1.0, 0.1), C["wood"], rz)


def tribu(L, x, y, n):
    """Quelques cases en arc autour d'une allée."""
    rng = L.rng
    for k in range(n):
        a = -0.6 + 1.2 * k / max(1, n - 1)
        px, py = x + 16 * math.sin(a) + rng.uniform(-2, 2), y + 14 * math.cos(a) + rng.uniform(-2, 2)
        _, dist, _ = L.track_info(px, py)
        if dist > 16 and L.height_at(px, py) > 1.0:
            case(L, px, py, rng.uniform(2.6, 3.4))


def lookout(L, x, y):
    """Belvédère de bois sur la cuirasse."""
    props = L.props
    zg = L.height_at(x, y) - 0.1
    for sx in (-1, 1):
        for sy in (-1, 1):
            props.cylinder((x + sx * 2.6, y + sy * 1.8, zg), (x + sx * 2.6, y + sy * 1.8, zg + 1.4), 0.12, 0.12, 5, C["wood_dark"], cap=False)
    props.box((x, y, zg + 1.5), (6.0, 4.4, 0.2), C["wood"])
    for sx in (-1, 1):
        props.box((x + sx * 2.9, y, zg + 2.5), (0.1, 4.4, 0.1), C["wood_dark"])
        props.box((x, y + sx * 2.1, zg + 2.5), (6.0, 0.1, 0.1), C["wood_dark"])


def dress(L):
    rng = L.rng
    dam(L)
    power_line(L)
    prony_ruins(L)
    tribu(L, 470.0, 18.0, 5)
    tribu(L, -135.0, 310.0, 3)
    for x, y in ((-175.0, 360.0), (60.0, 300.0), (-330.0, 270.0)):
        _, dist, _ = L.track_info(x, y)
        if dist > 16:
            fare(L, x, y, rng.uniform(0, math.pi))
    lookout(L, 330.0, 482.0)


# ---------------------------------------------------------------- végétation
def plant(L):
    scatter, height_at = L.scatter, L.height_at
    land = lambda x, y, h: h > 1.2  # noqa: E731
    near_lake = lambda x, y: lake_e(x, y) < 1.4  # noqa: E731
    scatter("pine", 150, lambda x, y, h: h > 20 or (3 < h and y - shore_y(x) < 60), 13)
    scatter("kaori", 70, lambda x, y, h: 5 < h < 30 and fbm(x * 0.01 + 2, y * 0.01) > 0.15, 14)
    scatter("niaouli", 220, lambda x, y, h: 2 < h < 25, 11)
    scatter("niaouli", 120, lambda x, y, h: 0.6 < h < 3 and near_lake(x, y), 11)
    scatter("maquis", 900, land, 9.0)
    scatter("boulder", 160, lambda x, y, h: h > 1 and fbm(x * 0.02 - 4, y * 0.02 + 6) > 0.1, 10)
    scatter("boulder", 60, lambda x, y, h: h > 30, 12)
    scatter("fern", 160, lambda x, y, h: 0.5 < h < 4 and near_lake(x, y), 10)
    del height_at
