"""Région 1, Nouméa : la baie et son lagon au sud, la ville sur le front de mer, les
collines derrière, l'îlot du phare. Relief, couleurs du sol, décor cuit et végétation ;
level.py fait le reste (route, cuisson, export) et passe son module en `L`."""

import math

from mathutils import Vector

import flora
from common import fbm, mix, shade, smoothstep, srgb
from palette import C

FACADES = [srgb(h) for h in ("#F2EDE4", "#F4E1C1", "#CFE7E3", "#F2C9B0", "#E4E6EE", "#FFF3D6", "#DDEBD3")]
AWNINGS = [srgb(h) for h in ("#FF7A2F", "#2E86AB", "#E63946", "#2A9D8F", "#F4B942")]

ISLET = Vector((150.0, -250.0))
CITY = (-310.0, 200.0, 22.0, 116.0)

# Lumière : grand jour, soleil haut au nord-ouest ; ciel bleu franc.
SUN = Vector((-0.557, 0.557, 0.616)).normalized()
SUN_COLOR = (1.0, 0.93, 0.82)
SKY = ((0.42, 0.62, 0.95, 1), 0.55)
# La Chaîne au loin
BACKDROP = ("#4F6B5B", "#6D8497")
# Ciel, brouillard et eau du client : ceux par défaut (three/materials.ts)
PALETTE = None

KINDS = ("palm", "pine", "niaouli", "bush", "rock", "lamp")


def protos(L):
    return {"palm": flora.proto_palm(L.PROTO), "pine": flora.proto_pine(L.PROTO), "niaouli": flora.proto_niaouli(L.PROTO),
            "bush": flora.proto_bush(L.PROTO), "rock": flora.proto_rock(L.PROTO), "lamp": flora.proto_lamp(L.PROTO)}


# ---------------------------------------------------------------- relief
def shore_y(x):
    return -26 + 5 * math.sin(x / 61) + 3 * math.sin(x / 23 + 1.3)


def city_weight(x, y):
    x0, x1, y0, y1 = CITY
    return (smoothstep(x0 - 30, x0, x) * (1 - smoothstep(x1, x1 + 30, x))
            * smoothstep(y0 - 12, y0, y) * (1 - smoothstep(y1, y1 + 25, y)))


def natural(x, y):
    d = y - shore_y(x)
    n = fbm(x * 0.006, y * 0.006)
    if d < 0:
        h = max(d * 0.09, -7.5 + 1.5 * n)
        reef = math.exp(-((y + 360 + 8 * math.sin(x / 90)) / 12) ** 2)
        h = h * (1 - reef) + (-0.5 + 0.3 * n) * reef
    else:
        beach = min(d * 0.075, 2.3)
        inland = smoothstep(110, 380, y) * (32 + 24 * fbm(x * 0.004 + 3, y * 0.004))
        # falaises des extrémités : montent depuis la plage sur 60 m, pas d'un seul coup
        side = smoothstep(390, 620, abs(x)) * (26 + 10 * n) * smoothstep(0, 60, d)
        bumps = 3.2 * fbm(x * 0.021, y * 0.021) * smoothstep(20, 90, d)
        h = beach + inland + side + bumps
        cw = city_weight(x, y)
        if cw > 0:
            h = h * (1 - cw) + (2.4 + (y - 22) * 0.025) * cw
    di = (Vector((x, y)) - ISLET).length
    if di < 60:
        isl = max(0.0, 1 - (di / 46) ** 2)
        h = max(h, -2.5 + 5.0 * isl ** 0.5 + 0.4 * n)
    return h


def terrain_color(x, y, h, slope):
    n = fbm(x * 0.03 + 11, y * 0.03)
    n2 = fbm(x * 0.009 - 5, y * 0.009 + 2)
    d = y - shore_y(x)
    if h < 0:
        return mix(C["wet"], C["seabed"], min(1, -h / 3))
    if d < 34 and h < 3.2:
        c = mix(C["wet"], C["sand"], smoothstep(0.1, 0.9, h))
        return shade(c, 1 + 0.04 * n)
    grass = mix(C["grass"], C["dry"], smoothstep(-0.2, 0.5, n2))
    grass = shade(grass, 1 + 0.14 * n)
    n3 = fbm(x * 0.05 - 17, y * 0.05 + 9)
    grass = mix(grass, shade(C["maquis"], 1.1), smoothstep(0.25, 0.6, n3) * 0.5)
    hill = smoothstep(10, 26, h)
    c = mix(grass, C["maquis"], hill * 0.8)
    lat = smoothstep(0.25, 0.55, n2 + 0.3 * n) * hill
    c = mix(c, C["laterite"], lat)
    c = mix(c, mix(C["laterite"], C["laterite2"], 0.5 + 0.5 * n), smoothstep(0.45, 0.8, slope))
    cw = city_weight(x, y)
    if cw > 0:
        urb = mix(C["urban"], C["grass"], smoothstep(0.2, 0.6, n))
        c = mix(c, urb, cw)
    if d < 50:
        c = mix(C["sand"], c, smoothstep(34, 50, d))
    return c


# ---------------------------------------------------------------- décor cuit
def building(L, x, y, w, d, floors, facade, rz=0.0):
    props, rng = L.props, L.rng
    fh = 3.1
    h = floors * fh + 0.6
    zg = L.height_at(x, y) - 0.3
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return (x + lx * ca - ly * sa, y + lx * sa + ly * ca, zg + lz)

    props.box(P(0, 0, h / 2), (w, d, h), facade, rz)
    # rez-de-chaussée : vitrines et auvent
    aw = rng.choice(AWNINGS)
    props.box(P(0, -d / 2 - 0.02, 1.5), (w * 0.86, 0.1, 2.4), C["glass"], rz)
    props.box(P(0, -d / 2 - 1.0, 3.0), (w * 0.9, 2.0, 0.12), aw, rz)
    # étages : fenêtres et balcons côté mer
    nwin = max(2, int(w / 3.2))
    for f in range(1, floors):
        zf = f * fh
        for k in range(nwin):
            lx = -w / 2 + (k + 0.5) * w / nwin
            props.box(P(lx, -d / 2 - 0.03, zf + 1.5), (1.7, 0.08, 1.6), C["glass"], rz)
        if f % 1 == 0:
            props.box(P(0, -d / 2 - 0.7, zf + 0.1), (w * 0.84, 1.4, 0.18), shade(facade, 0.96), rz)
            props.box(P(0, -d / 2 - 1.35, zf + 0.6), (w * 0.84, 0.06, 0.9), C["white"], rz)
        # côtés
        for side in (-1, 1):
            props.box(P(side * (w / 2 + 0.03), 0, zf + 1.5), (0.08, 1.6, 1.5), C["glass"], rz)
    # toit : acrotère, clim, chauffe-eau
    props.box(P(0, 0, h + 0.1), (w + 0.3, d + 0.3, 0.2), shade(facade, 0.9), rz)
    for _ in range(rng.randint(1, 3)):
        props.box(P(rng.uniform(-w / 3, w / 3), rng.uniform(-d / 3, d / 3), h + 0.7), (1.2, 0.8, 0.8), C["roof_zinc"], rz)
    if rng.random() < 0.7:
        cx, cy = rng.uniform(-w / 3, w / 3), rng.uniform(0, d / 3)
        props.cylinder(P(cx, cy, h + 0.4), P(cx, cy, h + 1.6), 0.5, 0.5, 8, C["white"])


def colonial(L, x, y, rz=0.0):
    props, rng = L.props, L.rng
    w, d = rng.uniform(9, 12), rng.uniform(8, 10)
    zg = L.height_at(x, y) - 0.2
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return (x + lx * ca - ly * sa, y + lx * sa + ly * ca, zg + lz)

    wall = rng.choice(FACADES)
    roof = rng.choice([C["roof_red"], C["roof_green"], C["roof_zinc"]])
    props.box(P(0, 0, 0.4), (w + 0.4, d + 3.2, 0.8), shade(wall, 0.8), rz)
    props.box(P(0, 0.8, 2.3), (w, d - 1.6, 3.0), wall, rz)
    for k in range(4):
        lx = -w / 2 + 1 + k * (w - 2) / 3
        props.box(P(lx, -d / 2 + 0.2, 0.8 + 0.3), (0.35, 0.35 * 0 + 1.0, 0.6), C["wood"], rz)
        props.box(P(lx - 0.9, 0.8 - (d - 1.6) / 2 - 0.05, 2.3), (0.6, 0.08, 1.5), C["shutter"], rz)
    for k in range(5):
        lx = -w / 2 + 0.3 + k * (w - 0.6) / 4
        props.box(P(lx, -d / 2 - 0.9, 2.3), (0.18, 0.18, 3.0), C["white"], rz)
    props.box(P(0, -d / 2 - 0.9, 1.25), (w - 0.4, 0.06, 0.8), C["white"], rz)
    # toit à quatre pans
    hw, hd, rh = w / 2 + 1.0, (d + 1.6) / 2 + 1.0, 2.6
    cy = -0.1
    corners = [P(-hw, cy - hd, 3.8), P(hw, cy - hd, 3.8), P(hw, cy + hd, 3.8), P(-hw, cy + hd, 3.8)]
    ridge = [P(-hw * 0.35, cy, 3.8 + rh), P(hw * 0.35, cy, 3.8 + rh)]
    V = [Vector(v) for v in corners + ridge]
    props.face((V[0], V[1], V[5], V[4]), roof)
    props.face((V[2], V[3], V[4], V[5]), shade(roof, 0.92))
    props.face((V[1], V[2], V[5]), shade(roof, 0.96))
    props.face((V[3], V[0], V[4]), shade(roof, 0.96))
    props.face((V[3], V[2], V[1], V[0]), shade(roof, 0.6))


def city(L):
    rng = L.rng
    x0, x1, y0, y1 = CITY
    rows = [(40.0, (3, 6), 24), (70.0, (2, 4), 22), (99.0, None, 16)]
    for yrow, floors, pitch in rows:
        x = x0 + 10
        while x < x1 - 8:
            y = yrow + rng.uniform(-2, 2)
            _, dist, _ = L.track_info(x, y)
            if dist > 24:
                if floors:
                    w = rng.uniform(14, pitch - 3)
                    building(L, x, y, w, rng.uniform(12, 16), rng.randint(*floors), rng.choice(FACADES))
                else:
                    colonial(L, x, y)
            x += pitch + rng.uniform(0, 6)


def promenade(L):
    """Trottoir côté mer le long du front de mer (échantillons au sud de y=30)."""
    props, XY, N, road_point = L.props, L.XY, L.N, L.road_point
    for i in range(N):
        if XY[i].y > 30 or not (-330 < XY[i].x < 215):
            continue
        j = (i + 1) % N
        a, bb = road_point(i, -9.6, -0.05), road_point(j, -9.6, -0.05)
        c, d = road_point(j, -15.0, -0.05), road_point(i, -15.0, -0.05)
        props.face((a, bb, c, d), C["promenade"], flip=True)
        a2, b2 = road_point(i, -15.0, -0.05), road_point(j, -15.0, -0.05)
        c2, d2 = road_point(j, -15.3, -0.9), road_point(i, -15.3, -0.9)
        props.face((a2, b2, c2, d2), shade(C["promenade"], 0.85), flip=True)


def pier(L, x, y_start, length):
    props = L.props
    zd = 1.6
    props.box((x, y_start - length / 2, zd), (3.2, length, 0.25), C["wood"])
    for k in range(int(length / 6) + 1):
        yy = y_start - k * 6
        for sx in (-1.4, 1.4):
            props.cylinder((x + sx, yy, -3), (x + sx, yy, zd), 0.16, 0.16, 6, C["wood_dark"])
            props.box((x + sx, yy, zd + 0.55), (0.12, 0.12, 1.0), C["wood_dark"])
    for sx in (-1.45, 1.45):
        props.box((x + sx, y_start - length / 2, zd + 1.0), (0.08, length, 0.08), C["wood_dark"])


def boat(L, x, y, rz, col):
    props = L.props
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return Vector((x + lx * ca - ly * sa, y + lx * sa + ly * ca, lz))

    Lb, Wb = 7.0, 2.4
    top = [P(-Lb / 2, -Wb / 2, 0.9), P(Lb / 2 - 1.2, -Wb / 2, 0.9), P(Lb / 2 + 0.6, 0, 1.1), P(Lb / 2 - 1.2, Wb / 2, 0.9), P(-Lb / 2, Wb / 2, 0.9)]
    bot = [P(-Lb / 2 + 0.3, -Wb / 2 + 0.5, -0.3), P(Lb / 2 - 1.4, -Wb / 2 + 0.5, -0.3), P(Lb / 2 - 0.2, 0, 0.2), P(Lb / 2 - 1.4, Wb / 2 - 0.5, -0.3), P(-Lb / 2 + 0.3, Wb / 2 - 0.5, -0.3)]
    for k in range(5):
        k2 = (k + 1) % 5
        props.face((bot[k], bot[k2], top[k2], top[k]), C["hull"] if k != 4 else shade(C["hull"], 0.9))
    props.face(list(reversed(top)), shade(C["hull"], 0.95))
    props.face((top[0], top[1], P(Lb / 2 - 1.2, -Wb / 2, 1.1), P(-Lb / 2, -Wb / 2, 1.1)), col)
    props.face((P(-Lb / 2, Wb / 2, 1.1), P(Lb / 2 - 1.2, Wb / 2, 1.1), top[3], top[4]), col)
    props.box(tuple(P(-0.6, 0, 1.8)), (2.4, 1.7, 1.4), C["white"], rz)
    props.box(tuple(P(0.62, 0, 1.9)), (0.05, 1.5, 0.7), C["glass"], rz)


def parasol(L, x, y, col):
    props = L.props
    zg = L.height_at(x, y)
    props.cylinder((x, y, zg), (x, y, zg + 2.3), 0.04, 0.04, 5, C["white"], cap=False)
    segs = 8
    top = Vector((x, y, zg + 2.7))
    for k in range(segs):
        a0, a1 = k / segs * math.tau, (k + 1) / segs * math.tau
        p0 = Vector((x + 1.4 * math.cos(a0), y + 1.4 * math.sin(a0), zg + 2.1))
        p1 = Vector((x + 1.4 * math.cos(a1), y + 1.4 * math.sin(a1), zg + 2.1))
        props.face((p0, p1, top), col if k % 2 else C["white"])


def paillote(L, x, y):
    props = L.props
    zg = L.height_at(x, y)
    for a in range(6):
        ang = a / 6 * math.tau
        props.cylinder((x + 2.2 * math.cos(ang), y + 2.2 * math.sin(ang), zg), (x + 2.2 * math.cos(ang), y + 2.2 * math.sin(ang), zg + 2.4), 0.1, 0.1, 5, C["wood_dark"], cap=False)
    props.cylinder((x, y, zg + 2.2), (x, y, zg + 5.0), 3.4, 0.05, 10, C["thatch"])
    props.cylinder((x, y, zg), (x, y, zg + 0.9), 0.5, 0.5, 8, C["wood"])


def lighthouse(L, x, y):
    props = L.props
    zg = L.height_at(x, y)
    props.cylinder((x, y, zg), (x, y, zg + 30), 2.6, 1.7, 12, C["white"])
    props.cylinder((x, y, zg + 30), (x, y, zg + 30.6), 2.4, 2.4, 12, C["gate_dark"])
    props.cylinder((x, y, zg + 30.6), (x, y, zg + 32.6), 1.4, 1.4, 10, C["lamp_glass"])
    props.cylinder((x, y, zg + 32.6), (x, y, zg + 34.0), 1.7, 0.2, 10, C["gate_dark"])
    props.box((x + 5, y, zg + 1.8), (7, 5, 3.6), C["white"])
    props.box((x + 5, y, zg + 3.9), (7.6, 5.6, 0.5), C["roof_red"])


def dress(L):
    rng = L.rng
    city(L)
    promenade(L)
    pier(L, -120.0, shore_y(-120.0) + 4, 90.0)
    for k in range(6):
        x = rng.uniform(-420, 350)
        y = rng.uniform(-200, -80)
        boat(L, x, y, rng.uniform(0, math.tau), rng.choice([C["boat_blue"], srgb("#E63946"), srgb("#2A9D8F")]))
    for k in range(24):
        x = rng.uniform(-330, 200)
        y = shore_y(x) + rng.uniform(5, 16)
        _, dist, _ = L.track_info(x, y)
        if dist > 17:
            parasol(L, x, y, rng.choice(AWNINGS))
    for x in (-230.0, -30.0, 140.0):
        y = shore_y(x) + 12
        _, dist, _ = L.track_info(x, y)
        if dist > 17:
            paillote(L, x, y)
    lighthouse(L, ISLET.x - 6, ISLET.y + 4)


# ---------------------------------------------------------------- végétation
def plant(L):
    XY, N, DS, road_point, place, scatter = L.XY, L.N, L.DS, L.road_point, L.place, L.scatter
    # front de mer : palmiers et lampadaires alternés, des deux côtés
    for i in range(0, N, max(1, int(16 / DS))):
        if XY[i].y > 30 or not (-320 < XY[i].x < 205):
            continue
        p = road_point(i, -12.3)
        place("palm", p.x, p.y, sink=0.05)
        q = road_point(i + int(8 / DS), 11.5)
        if city_weight(q.x, q.y) > 0.3 or q.y > 8:
            place("palm", q.x, q.y, sink=0.05)
    for i in range(0, N, max(1, int(30 / DS))):
        if XY[i].y > 30 or not (-320 < XY[i].x < 205):
            continue
        p = road_point(i + int(4 / DS), -9.9)
        place("lamp", p.x, p.y, rot=L.heading(i) + math.pi / 2, scale=1.0, sink=0.0)
    beach = lambda x, y, h: 0.4 < h < 2.6 and y - shore_y(x) < 30  # noqa: E731
    land = lambda x, y, h: h > 1.0 and city_weight(x, y) < 0.2  # noqa: E731
    scatter("palm", 60, beach, 11)
    scatter("palm", 40, lambda x, y, h: city_weight(x, y) > 0.6, 14)
    scatter("pine", 170, lambda x, y, h: h > 3 and (abs(x) > 330 or h > 18 or y - shore_y(x) < 45) and city_weight(x, y) < 0.1, 13)
    scatter("niaouli", 380, lambda x, y, h: land(x, y, h) and 3 < h < 34, 11)
    scatter("bush", 650, land, 9.5)
    scatter("rock", 90, lambda x, y, h: -0.8 < h < 1.2 and abs(x) > 280, 10)
    scatter("rock", 50, lambda x, y, h: h > 12, 12)
    # îlot du phare
    for k in range(14):
        a = k / 14 * math.tau
        rr = L.rng.uniform(14, 30)
        x, y = ISLET.x + rr * math.cos(a), ISLET.y + rr * math.sin(a)
        if L.height_at(x, y) > 0.5:
            place("palm", x, y)
