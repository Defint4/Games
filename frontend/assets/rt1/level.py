"""Circuit de Nouméa (front de mer) : terrain, route, ville, végétation, lumière cuite.

blender -b -P level.py -- --out <dossier> [--samples 128] [--lm 2048]

Sorties (dans --out) :
  level.glb          terrain, route, décor, collisions (col_road, col_wall)
  flora.glb          prototypes des objets instanciés (palmier, pin, niaouli…)
  lm_terrain.webp, lm_road.webp, lm_props.webp   cartes de lumière (éclairement / LM_SCALE)
  heights.bin        hauteurs du terrain (int16, cm), grille nx × ny
  water.png          profondeur d'eau (R) sur l'emprise du terrain
  level.json         départ, portes, soleil, emprise, instances

Repère Blender : Z en haut, la mer au sud (-Y). Le glTF passe en Y en haut :
(x, y, z) Blender → (x, z, -y) three.
"""

import json
import math
import os
import random
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector, kdtree, noise

sys.path.insert(0, os.path.dirname(__file__))
from common import (Builder, args, bake_material, finalize_colors, mix, reset, shade,  # noqa: E402
                    smoothstep, srgb, use_gpu)

A = args()
OUT = os.path.abspath(A.get("out", "out"))
SAMPLES = int(A.get("samples", "128"))
LM = int(A.get("lm", "2048"))
LM_SCALE = 2.0
os.makedirs(OUT, exist_ok=True)
rng = random.Random(1853)

# ---------------------------------------------------------------- palette
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
FACADES = [srgb(h) for h in ("#F2EDE4", "#F4E1C1", "#CFE7E3", "#F2C9B0", "#E4E6EE", "#FFF3D6", "#DDEBD3")]
AWNINGS = [srgb(h) for h in ("#FF7A2F", "#2E86AB", "#E63946", "#2A9D8F", "#F4B942")]


def fbm(x, y, octaves=4):
    s, a, f = 0.0, 1.0, 1.0
    for _ in range(octaves):
        s += a * noise.noise(Vector((x * f, y * f, 0.37 * f)))
        a *= 0.5
        f *= 2.03
    return s / 1.875


# ---------------------------------------------------------------- terrain naturel
X0, X1, Y0, Y1, STEP = -640.0, 640.0, -420.0, 520.0, 4.0
ISLET = Vector((150.0, -250.0))
CITY = (-310.0, 200.0, 22.0, 116.0)


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
        side = smoothstep(390, 620, abs(x)) * (26 + 10 * n)
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


# ---------------------------------------------------------------- tracé
CTRL = [(-300, 0), (-100, 6), (100, -4), (220, 12), (285, 80), (270, 170), (190, 215), (110, 190),
        (40, 235), (-50, 250), (-130, 195), (-215, 215), (-300, 175), (-370, 100), (-372, 30)]


def catmull_closed(pts, per=60):
    out = []
    n = len(pts)
    P = [Vector((p[0], p[1])) for p in pts]
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]

        def tj(ti, a, b):
            return ti + max((b - a).length, 1e-6) ** 0.5
        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        for k in range(per):
            t = t1 + (t2 - t1) * k / per
            a1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            a2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            a3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            b1 = a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
            b2 = a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
            out.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
    return out


dense = catmull_closed(CTRL)
cum = [0.0]
for i in range(1, len(dense) + 1):
    cum.append(cum[-1] + (dense[i % len(dense)] - dense[i - 1]).length)
LENGTH = cum[-1]

# Lignes de la carte de lumière de la route : n rangées, échantillons alignés dessus
ROWS = 9
PER_ROW = int(round(LENGTH / ROWS))
N = ROWS * PER_ROW
DS = LENGTH / N


def at_dist(s):
    s %= LENGTH
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= s:
            lo = mid
        else:
            hi = mid
    t = (s - cum[lo]) / max(cum[lo + 1] - cum[lo], 1e-9)
    a, b = dense[lo % len(dense)], dense[(lo + 1) % len(dense)]
    return a + (b - a) * t


XY = [at_dist(i * DS) for i in range(N)]
TAN = []
for i in range(N):
    t = XY[(i + 1) % N] - XY[i - 1]
    TAN.append(t.normalized())
SIDE = [Vector((-t.y, t.x)) for t in TAN]  # à gauche

# Hauteur : terrain lissé le long du tracé, pente bornée
z = [natural(p.x, p.y) for p in XY]
for _ in range(3):
    w = int(70 / DS)
    z = [sum(z[(i + k) % N] for k in range(-w, w + 1)) / (2 * w + 1) for i in range(N)]
z = [max(v, 2.0) for v in z]
for _ in range(40):
    for i in range(N):
        j = (i + 1) % N
        lim = 0.09 * DS
        if z[j] - z[i] > lim:
            z[j] = z[i] + lim
        elif z[i] - z[j] > lim:
            z[j] = z[i] - lim
    w = 6
    z = [sum(z[(i + k) % N] for k in range(-w, w + 1)) / (2 * w + 1) for i in range(N)]
Z = z

# Courbure signée et dévers
KAPPA = []
for i in range(N):
    a, b = TAN[i - 8], TAN[(i + 8) % N]
    ang = math.atan2(a.x * b.y - a.y * b.x, a.dot(b))
    KAPPA.append(ang / (16 * DS))
BANK = [max(-0.12, min(0.12, k * 22)) for k in KAPPA]
for _ in range(3):
    BANK = [sum(BANK[(i + k) % N] for k in range(-12, 13)) / 25 for i in range(N)]
CURB = [abs(k) > 0.006 for k in KAPPA]
CURB = [any(CURB[(i + k) % N] for k in range(-10, 11)) for i in range(N)]


def road_point(i, lat, dz=0.0):
    """Point de la section i à `lat` mètres à gauche de l'axe, dévers compris."""
    i %= N
    b = BANK[i]
    p = XY[i] + SIDE[i] * (lat * math.cos(b))
    return Vector((p.x, p.y, Z[i] - lat * math.sin(b) + dz))


kd = kdtree.KDTree(N)
for i, p in enumerate(XY):
    kd.insert(Vector((p.x, p.y, 0)), i)
kd.balance()


def track_info(x, y):
    co, i, dist = kd.find(Vector((x, y, 0)))
    lat = (Vector((x, y)) - XY[i]).dot(SIDE[i])
    return i, dist, lat


# ---------------------------------------------------------------- terrain final
nx = int((X1 - X0) / STEP) + 1
ny = int((Y1 - Y0) / STEP) + 1
H = np.zeros((ny, nx), dtype=np.float64)
NAT = np.zeros((ny, nx), dtype=np.float64)
for j in range(ny):
    y = Y0 + j * STEP
    for i in range(nx):
        x = X0 + i * STEP
        h = natural(x, y)
        NAT[j, i] = h
        ti, dist, lat = track_info(x, y)
        if dist < 40:
            road_z = Z[ti] - lat * math.sin(BANK[ti]) if abs(lat) < 9 else Z[ti]
            w = 1 - smoothstep(9.5, 32, dist)
            h = h * (1 - w) + (road_z - 0.45) * w
        H[j, i] = h


def height_at(x, y):
    fx, fy = (x - X0) / STEP, (y - Y0) / STEP
    i, j = int(max(0, min(nx - 2, math.floor(fx)))), int(max(0, min(ny - 2, math.floor(fy))))
    tx, ty = fx - i, fy - j
    return (H[j, i] * (1 - tx) * (1 - ty) + H[j, i + 1] * tx * (1 - ty)
            + H[j + 1, i] * (1 - tx) * ty + H[j + 1, i + 1] * tx * ty)


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


def build_terrain():
    verts = []
    cols = []
    lms = []
    for j in range(ny):
        for i in range(nx):
            x, y = X0 + i * STEP, Y0 + j * STEP
            h = H[j, i]
            hx = H[j, min(nx - 1, i + 1)] - H[j, max(0, i - 1)]
            hy = H[min(ny - 1, j + 1), i] - H[max(0, j - 1), i]
            slope = math.hypot(hx, hy) / (2 * STEP)
            verts.append((x, y, h))
            c = terrain_color(x, y, h, slope)
            _, dist, _ = track_info(x, y)
            if dist < 10:
                c = mix(c, C["earth"], 0.7)
            cols.extend(c)
            lms.append(((x - X0) / (X1 - X0), (y - Y0) / (Y1 - Y0)))
    faces = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            q = (a, a + 1, a + 1 + nx, a + nx)
            if max(H[j, i], H[j, i + 1], H[j + 1, i], H[j + 1, i + 1]) < -2.6:
                continue
            faces.append(q)
    me = bpy.data.meshes.new("terrain")
    me.from_pydata(verts, [], faces)
    me.update()
    used = set(v for f in faces for v in f)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", cols)
    me.color_attributes.active_color = ca
    uv = me.uv_layers.new(name="Lightmap")
    vi = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", vi)
    lm = np.array(lms, dtype=np.float32)[vi]
    uv.data.foreach_set("uv", lm.ravel())
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("terrain", me)
    bpy.context.scene.collection.objects.link(ob)
    # sommets orphelins (sous l'eau profonde) retirés
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    del used
    return ob


# ---------------------------------------------------------------- route
# Profil en travers (de gauche à droite) : jupe, mur, accotement, vibreur, chaussée…
W = 6.0
WALL = [(8.2, 0.0), (8.05, 0.2), (7.88, 0.82), (7.72, 0.82), (7.55, 0.2), (7.4, 0.0)]


def build_road():
    b = Builder()
    rowh = 26.0  # mètres de profil par rangée (≥ développé du profil + marge)
    lm_h = ROWS * rowh

    def lmuv(i_local, p, row):
        return (i_local / PER_ROW, (row * rowh + 1.0 + p) / lm_h)

    asphalt_faces = []
    for i in range(N):
        row = i // PER_ROW
        il = i - row * PER_ROW
        j = i + 1
        s0, s1 = i * DS, (i + 1) * DS
        # profil : liste de (lat, dz, couleur) ; on relie les points consécutifs
        segs = []
        for side in (1, -1):
            pts = [(side * 9.4, -1.1)] + [(side * l, dz) for l, dz in WALL] + [(side * 7.0, 0.0), (side * 6.0, 0.0)]
            if side == -1:
                pts = list(reversed(pts))
            segs.append(pts)
        left, right = segs
        profile = left + right  # left: 9.4 … 6.0 ; right: -6.0 … -9.4
        # développé du profil (coordonnée p de la carte de lumière)
        pc = [0.0]
        for k in range(1, len(profile)):
            a, c = profile[k - 1], profile[k]
            pc.append(pc[-1] + math.hypot(a[0] - c[0], a[1] - c[1]))
        # la chaussée est entre profile[7] (6.0) et profile[8] (-6.0)
        for k in range(len(profile) - 1):
            (l0, d0), (l1, d1) = profile[k], profile[k + 1]
            a = road_point(i, l0, d0)
            bb = road_point(j, l0, d0)
            c = road_point(j, l1, d1)
            d = road_point(i, l1, d1)
            lms = [lmuv(il, pc[k], row), lmuv(il + 1, pc[k], row), lmuv(il + 1, pc[k + 1], row), lmuv(il, pc[k + 1], row)]
            mid = 0.5 * (l0 + l1)
            if abs(l0) == 6.0 and abs(l1) == 6.0:
                uvs = [((6 - l0) / 12, s0 / 12), ((6 - l0) / 12, s1 / 12), ((6 - l1) / 12, s1 / 12), ((6 - l1) / 12, s0 / 12)]
                f = b.face((a, bb, c, d), C["asphalt"], uvs, lms, flip=True)
                if f:
                    asphalt_faces.append(f)
                continue
            if 6.0 <= abs(mid) <= 7.0:
                if CURB[i]:
                    col = C["curb_red"] if (i // max(1, int(1.5 / DS))) % 2 else C["curb_white"]
                    a, bb, c, d = (v + Vector((0, 0, 0.05)) for v in (a, bb, c, d))
                else:
                    col = C["shoulder"]
            elif abs(mid) < 7.4:
                col = C["gravel"]
            elif abs(mid) < 8.2 and max(d0, d1) > 0.0:
                red = CURB[i] and (i // max(1, int(3 / DS))) % 2 and abs(mid) < 7.8
                col = C["wall_red"] if red else C["wall"]
            else:
                col = C["earth"]
            b.face((a, bb, c, d), col, None, lms, flip=True)
    # les faces de chaussée prennent la matière 0, le reste la matière 1
    for f in b.bm.faces:
        f.material_index = 1
    for f in asphalt_faces:
        f.material_index = 0
    ob = b.to_object("road", keep_uv=True)
    finalize_colors(ob)
    ob.data.materials.append(bpy.data.materials.new("asphalt"))
    ob.data.materials.append(bpy.data.materials.new("painted"))
    return ob


def build_road_colliders():
    b = Builder()
    step = 2
    for i in range(0, N, step):
        j = i + step
        a, bb = road_point(i, 7.4), road_point(j, 7.4)
        c, d = road_point(j, -7.4), road_point(i, -7.4)
        b.face((a, bb, c, d), C["black"])
    road = b.to_object("col_road")
    b = Builder()
    for i in range(0, N, step):
        j = i + step
        for side in (1, -1):
            l = side * 7.75
            a, bb = road_point(i, l, -1.0), road_point(j, l, -1.0)
            c, d = road_point(j, l, 2.4), road_point(i, l, 2.4)
            b.face((a, bb, c, d), C["black"])
    wall = b.to_object("col_wall")
    return road, wall


# ---------------------------------------------------------------- décor cuit
props = Builder()


def heading(i):
    t = TAN[i % N]
    return math.atan2(t.y, t.x)


def gate(i, start=False):
    rz = heading(i) + math.pi / 2  # l'axe x local traverse la route
    base = XY[i]
    zc = Z[i]
    for side in (1, -1):
        p = base + SIDE[i] * (side * 9.2)
        props.box((p.x, p.y, zc + 3.6), (1.1, 1.1, 7.6), C["gate_dark"], rz)
    top_c = zc + 7.6
    span = 20.0
    cells = 16
    for k in range(cells):
        l = -span / 2 + (k + 0.5) * span / cells
        p = base + SIDE[i] * (-l)
        if start:
            col_hi = C["white"] if k % 2 else C["black"]
            col_lo = C["black"] if k % 2 else C["white"]
            props.box((p.x, p.y, top_c + 0.45), (span / cells, 0.6, 0.9), col_hi, rz)
            props.box((p.x, p.y, top_c - 0.45), (span / cells, 0.6, 0.9), col_lo, rz)
        else:
            col = C["white"] if k in (0, cells - 1) else C["gate_orange"]
            props.box((p.x, p.y, top_c), (span / cells, 0.6, 1.8), col, rz)


def building(x, y, w, d, floors, facade, rz=0.0):
    fh = 3.1
    h = floors * fh + 0.6
    zg = height_at(x, y) - 0.3
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
    props.box(P(0, 0, h + 0.3), (w + 0.3, d + 0.3, 0.2), shade(facade, 0.9), rz)
    for _ in range(rng.randint(1, 3)):
        props.box(P(rng.uniform(-w / 3, w / 3), rng.uniform(-d / 3, d / 3), h + 0.7), (1.2, 0.8, 0.8), C["roof_zinc"], rz)
    if rng.random() < 0.7:
        cx, cy = rng.uniform(-w / 3, w / 3), rng.uniform(0, d / 3)
        props.cylinder(P(cx, cy, h + 0.4), P(cx, cy, h + 1.6), 0.5, 0.5, 8, C["white"])


def colonial(x, y, rz=0.0):
    w, d = rng.uniform(9, 12), rng.uniform(8, 10)
    zg = height_at(x, y) - 0.2
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


def city():
    x0, x1, y0, y1 = CITY
    rows = [(40.0, (3, 6), 24), (70.0, (2, 4), 22), (99.0, None, 16)]
    for yrow, floors, pitch in rows:
        x = x0 + 10
        while x < x1 - 8:
            y = yrow + rng.uniform(-2, 2)
            _, dist, _ = track_info(x, y)
            if dist > 24:
                if floors:
                    w = rng.uniform(14, pitch - 3)
                    building(x, y, w, rng.uniform(12, 16), rng.randint(*floors), rng.choice(FACADES))
                else:
                    colonial(x, y)
            x += pitch + rng.uniform(0, 6)


def promenade():
    """Trottoir côté mer le long du front de mer (échantillons au sud de y=30)."""
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


def pier(x, y_start, length):
    zd = 1.6
    props.box((x, y_start - length / 2, zd), (3.2, length, 0.25), C["wood"])
    for k in range(int(length / 6) + 1):
        yy = y_start - k * 6
        for sx in (-1.4, 1.4):
            props.cylinder((x + sx, yy, -3), (x + sx, yy, zd), 0.16, 0.16, 6, C["wood_dark"])
            props.box((x + sx, yy, zd + 0.55), (0.12, 0.12, 1.0), C["wood_dark"])
    for sx in (-1.45, 1.45):
        props.box((x + sx, y_start - length / 2, zd + 1.0), (0.08, length, 0.08), C["wood_dark"])


def boat(x, y, rz, col):
    ca, sa = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return Vector((x + lx * ca - ly * sa, y + lx * sa + ly * ca, lz))

    L, Wb = 7.0, 2.4
    top = [P(-L / 2, -Wb / 2, 0.9), P(L / 2 - 1.2, -Wb / 2, 0.9), P(L / 2 + 0.6, 0, 1.1), P(L / 2 - 1.2, Wb / 2, 0.9), P(-L / 2, Wb / 2, 0.9)]
    bot = [P(-L / 2 + 0.3, -Wb / 2 + 0.5, -0.3), P(L / 2 - 1.4, -Wb / 2 + 0.5, -0.3), P(L / 2 - 0.2, 0, 0.2), P(L / 2 - 1.4, Wb / 2 - 0.5, -0.3), P(-L / 2 + 0.3, Wb / 2 - 0.5, -0.3)]
    for k in range(5):
        k2 = (k + 1) % 5
        props.face((bot[k], bot[k2], top[k2], top[k]), C["hull"] if k != 4 else shade(C["hull"], 0.9))
    props.face(list(reversed(top)), shade(C["hull"], 0.95))
    props.face((top[0], top[1], P(L / 2 - 1.2, -Wb / 2, 1.1), P(-L / 2, -Wb / 2, 1.1)), col)
    props.face((P(-L / 2, Wb / 2, 1.1), P(L / 2 - 1.2, Wb / 2, 1.1), top[3], top[4]), col)
    props.box(tuple(P(-0.6, 0, 1.8)), (2.4, 1.7, 1.4), C["white"], rz)
    props.box(tuple(P(0.62, 0, 1.9)), (0.05, 1.5, 0.7), C["glass"], rz)


def parasol(x, y, col):
    zg = height_at(x, y)
    props.cylinder((x, y, zg), (x, y, zg + 2.3), 0.04, 0.04, 5, C["white"], cap=False)
    segs = 8
    top = Vector((x, y, zg + 2.7))
    for k in range(segs):
        a0, a1 = k / segs * math.tau, (k + 1) / segs * math.tau
        p0 = Vector((x + 1.4 * math.cos(a0), y + 1.4 * math.sin(a0), zg + 2.1))
        p1 = Vector((x + 1.4 * math.cos(a1), y + 1.4 * math.sin(a1), zg + 2.1))
        props.face((p0, p1, top), col if k % 2 else C["white"])
        props.face((top, p1, p0), col if k % 2 else C["white"])


def paillote(x, y):
    zg = height_at(x, y)
    for a in range(6):
        ang = a / 6 * math.tau
        props.cylinder((x + 2.2 * math.cos(ang), y + 2.2 * math.sin(ang), zg), (x + 2.2 * math.cos(ang), y + 2.2 * math.sin(ang), zg + 2.4), 0.1, 0.1, 5, C["wood_dark"], cap=False)
    props.cylinder((x, y, zg + 2.2), (x, y, zg + 5.0), 3.4, 0.05, 10, C["thatch"])
    props.cylinder((x, y, zg), (x, y, zg + 0.9), 0.5, 0.5, 8, C["wood"])


def lighthouse(x, y):
    zg = height_at(x, y)
    props.cylinder((x, y, zg), (x, y, zg + 30), 2.6, 1.7, 12, C["white"])
    props.cylinder((x, y, zg + 30), (x, y, zg + 30.6), 2.4, 2.4, 12, C["gate_dark"])
    props.cylinder((x, y, zg + 30.6), (x, y, zg + 32.6), 1.4, 1.4, 10, C["lamp_glass"])
    props.cylinder((x, y, zg + 32.6), (x, y, zg + 34.0), 1.7, 0.2, 10, C["gate_dark"])
    props.box((x + 5, y, zg + 1.8), (7, 5, 3.6), C["white"])
    props.box((x + 5, y, zg + 3.9), (7.6, 5.6, 0.5), C["roof_red"])


def backdrop():
    """La Chaîne au loin : silhouettes derrière l'emprise, non cuites."""
    b = Builder()
    r = random.Random(4)
    for k in range(34):
        a = math.radians(r.uniform(-20, 200))
        dist = r.uniform(900, 1400)
        x, y = math.cos(a) * dist, 120 + math.sin(a) * dist
        if y < -150:
            continue
        rad, hgt = r.uniform(140, 260), r.uniform(90, 220)
        col = mix(srgb("#4F6B5B"), srgb("#6D8497"), r.random())
        b.cylinder((x, y, -5), (x + r.uniform(-30, 30), y + r.uniform(-30, 30), hgt), rad, r.uniform(8, 30), 7, col)
    ob = b.to_object("backdrop")
    finalize_colors(ob)
    return ob


def clouds():
    """Cumulus bas sur l'horizon, non cuits (le client les rend sans brouillard)."""
    b = Builder()
    r = random.Random(21)
    for k in range(26):
        a = r.uniform(0, math.tau)
        dist = r.uniform(750, 1500)
        cx, cy, cz = math.cos(a) * dist, 120 + math.sin(a) * dist, r.uniform(170, 330)
        size = r.uniform(40, 90)
        for j in range(r.randint(4, 7)):
            ox, oy = r.uniform(-1.4, 1.4) * size, r.uniform(-0.6, 0.6) * size
            rad = size * r.uniform(0.45, 0.8)
            tmp = Builder()
            tmp.icosphere((0, 0, 0), rad, (1, 1, 1, 1), scale=(1, 1, 0.55), subdiv=1, jitter=0.12, rng=r)
            for f in tmp.bm.faces:
                pts = [v.co.copy() + Vector((cx + ox, cy + oy, cz)) for v in f.verts]
                zc = sum(p.z for p in pts) / len(pts) - cz
                shadec = 0.78 + 0.22 * smoothstep(-rad * 0.4, rad * 0.4, zc)
                b.face(pts, (shadec * 1.0, shadec * 1.0, shadec * 1.02, 1.0))
            tmp.bm.free()
    ob = b.to_object("clouds")
    finalize_colors(ob)
    return ob


# ---------------------------------------------------------------- flore (prototypes)
PROTO = None


def proto_palm():
    b = Builder()
    Hh, lean = 9.0, 1.3
    segs, sides = 7, 6
    rings = []
    for k in range(segs + 1):
        t = k / segs
        c = Vector((lean * t * t, 0, Hh * t))
        r = 0.24 - 0.09 * t
        rings.append([c + Vector((r * math.cos(a / sides * math.tau), r * math.sin(a / sides * math.tau), 0)) for a in range(sides)])
    for k in range(segs):
        col = C["trunk"] if k % 2 else C["trunk2"]
        for a in range(sides):
            a2 = (a + 1) % sides
            b.quad(rings[k][a], rings[k][a2], rings[k + 1][a2], rings[k + 1][a], col)
    top = Vector((lean, 0, Hh))
    fr = random.Random(7)
    for f in range(10):
        ang = f / 10 * math.tau + fr.uniform(-0.15, 0.15)
        dirh = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-dirh.y, dirh.x, 0))
        L = fr.uniform(3.6, 4.4)
        rise = fr.uniform(0.6, 1.2)
        n = 7
        spine = []
        for k in range(n + 1):
            t = k / n
            spine.append(top + dirh * (L * t) + Vector((0, 0, rise * math.sin(t * math.pi * 0.6) - 1.9 * t * t)))
        for k in range(n):
            t = (k + 0.5) / n
            wdt = 0.95 * math.sin(math.pi * min(1, t * 1.15)) + 0.1
            droop = Vector((0, 0, -0.35 * wdt))
            col = mix(C["frond"], C["frond2"], t)
            for s in (1, -1):
                a0, a1 = spine[k], spine[k + 1]
                e0 = a0 + side * (s * wdt) + droop
                e1 = a1 + side * (s * wdt * 0.8) + droop + dirh * 0.15
                b.quad(a0, a1, e1, e0, col)
    for k in range(4):
        ang = k / 4 * math.tau
        b.icosphere(top + Vector((0.3 * math.cos(ang), 0.3 * math.sin(ang), -0.35)), 0.2, C["coconut"], subdiv=1)
    return b.to_object("palm", PROTO, weld=True)


def proto_pine():
    b = Builder()
    Hh = 19.0
    b.cylinder((0, 0, 0), (0, 0, Hh), 0.28, 0.08, 6, C["bark_pine"])
    levels = 18
    r = random.Random(3)
    for k in range(levels):
        t = k / (levels - 1)
        zc = 2.2 + t * (Hh - 2.6)
        rad = (1.85 - 1.05 * t) * r.uniform(0.85, 1.1)
        col = C["pine"] if k % 2 else C["pine2"]
        segs = 6
        rot = r.uniform(0, math.tau)
        ring_lo = [Vector((rad * math.cos(rot + a / segs * math.tau), rad * math.sin(rot + a / segs * math.tau), zc - 0.35)) for a in range(segs)]
        ring_hi = [Vector((rad * 0.55 * math.cos(rot + (a + 0.5) / segs * math.tau), rad * 0.55 * math.sin(rot + (a + 0.5) / segs * math.tau), zc + 0.3)) for a in range(segs)]
        for a in range(segs):
            a2 = (a + 1) % segs
            b.face((ring_lo[a], ring_lo[a2], ring_hi[a]), col)
            b.face((ring_lo[a2], ring_hi[a2], ring_hi[a]), shade(col, 0.95))
        b.face(list(reversed(ring_lo)), shade(col, 0.7))
        b.face(ring_hi, shade(col, 1.08))
    b.icosphere((0, 0, Hh + 0.2), 0.5, C["pine2"], scale=(1, 1, 1.6), subdiv=0)
    return b.to_object("pine", PROTO, weld=True)


def proto_niaouli():
    b = Builder()
    r = random.Random(11)
    b.cylinder((0, 0, 0), (0.3, 0.2, 2.6), 0.26, 0.18, 6, C["niaouli_bark"])
    b.cylinder((0.3, 0.2, 2.6), (1.3, 0.6, 4.2), 0.16, 0.1, 5, C["niaouli_bark"])
    b.cylinder((0.3, 0.2, 2.6), (-0.8, -0.3, 4.0), 0.15, 0.1, 5, C["niaouli_bark"])
    for cx, cy, cz, s in ((1.3, 0.6, 4.6, 1.6), (-0.8, -0.3, 4.4, 1.5), (0.2, 0.1, 5.3, 1.8), (0.6, -0.9, 4.2, 1.1)):
        b.icosphere((cx, cy, cz), s, C["niaouli"] if r.random() < 0.5 else C["niaouli2"], scale=(1.1, 1.1, 0.72), subdiv=0, jitter=0.18, rng=r)
    return b.to_object("niaouli", PROTO, weld=True)


def proto_bush():
    b = Builder()
    r = random.Random(5)
    b.icosphere((0, 0, 0.5), 1.0, C["bush"], scale=(1.2, 1.0, 0.75), subdiv=0, jitter=0.2, rng=r)
    b.icosphere((0.7, 0.3, 0.4), 0.7, C["bush2"], scale=(1, 1, 0.8), subdiv=0, jitter=0.2, rng=r)
    return b.to_object("bush", PROTO, weld=True)


def proto_rock():
    b = Builder()
    r = random.Random(9)
    b.icosphere((0, 0, 0.3), 1.2, C["rock"], scale=(1.3, 1.0, 0.7), subdiv=1, jitter=0.16, rng=r)
    return b.to_object("rock", PROTO, weld=True)


def proto_lamp():
    b = Builder()
    b.cylinder((0, 0, 0), (0, 0, 6.5), 0.1, 0.07, 6, C["lamp"])
    b.cylinder((0, 0, 6.5), (1.2, 0, 6.9), 0.06, 0.05, 5, C["lamp"])
    b.box((1.35, 0, 6.8), (0.7, 0.3, 0.18), C["lamp"])
    b.box((1.35, 0, 6.68), (0.55, 0.22, 0.06), C["lamp_glass"])
    return b.to_object("lamp", PROTO, weld=True)


# ---------------------------------------------------------------- placement
INST: dict[str, list] = {k: [] for k in ("palm", "pine", "niaouli", "bush", "rock", "lamp")}


def place(kind, x, y, rot=None, scale=None, sink=0.1):
    zg = height_at(x, y) - sink
    INST[kind].append((x, y, zg, rng.uniform(0, math.tau) if rot is None else rot,
                       rng.uniform(0.85, 1.15) if scale is None else scale))


def scatter(kind, count, cond, clear, tries=40):
    n = 0
    for _ in range(count * tries):
        if n >= count:
            break
        x, y = rng.uniform(X0 + 20, X1 - 20), rng.uniform(Y0 + 20, Y1 - 20)
        h = height_at(x, y)
        _, dist, _ = track_info(x, y)
        if dist < clear or not cond(x, y, h):
            continue
        place(kind, x, y)
        n += 1


def plant():
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
        place("lamp", p.x, p.y, rot=heading(i) + math.pi / 2, scale=1.0, sink=0.0)
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
        rr = rng.uniform(14, 30)
        x, y = ISLET.x + rr * math.cos(a), ISLET.y + rr * math.sin(a)
        if height_at(x, y) > 0.5:
            place("palm", x, y)


def dress():
    city()
    promenade()
    pier(-120.0, shore_y(-120.0) + 4, 90.0)
    for k in range(6):
        x = rng.uniform(-420, 350)
        y = rng.uniform(-200, -80)
        boat(x, y, rng.uniform(0, math.tau), rng.choice([C["boat_blue"], srgb("#E63946"), srgb("#2A9D8F")]))
    for k in range(24):
        x = rng.uniform(-330, 200)
        y = shore_y(x) + rng.uniform(5, 16)
        _, dist, _ = track_info(x, y)
        if dist > 17:
            parasol(x, y, rng.choice(AWNINGS))
    for x in (-230.0, -30.0, 140.0):
        y = shore_y(x) + 12
        _, dist, _ = track_info(x, y)
        if dist > 17:
            paillote(x, y)
    lighthouse(ISLET.x - 6, ISLET.y + 4)


# ---------------------------------------------------------------- éclairage et cuisson
SUN = Vector((-0.557, 0.557, 0.616)).normalized()


def lights():
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.color = (1.0, 0.93, 0.82)
    sun.angle = math.radians(2.5)
    ob = bpy.data.objects.new("sun", sun)
    ob.rotation_euler = SUN.to_track_quat("Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(ob)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.42, 0.62, 0.95, 1)
    bg.inputs["Strength"].default_value = 0.55
    bpy.context.scene.world = world


def instances_for_bake(protos):
    coll = bpy.data.collections.new("inst")
    bpy.context.scene.collection.children.link(coll)
    for kind, items in INST.items():
        me = protos[kind].data
        for (x, y, zg, rot, sc) in items:
            ob = bpy.data.objects.new(f"{kind}_i", me)
            ob.location = (x, y, zg)
            ob.rotation_euler = (0, 0, rot)
            ob.scale = (sc, sc, sc)
            coll.objects.link(ob)
    return coll


def bake(ob, name, size):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    n = max(1, len(ob.data.materials))
    mats = [bake_material(f"bake_{name}_{k}", img) for k in range(n)]
    if not ob.data.materials:
        ob.data.materials.append(mats[0])
    for k in range(n):
        ob.data.materials[k] = mats[k]
    ob.data.uv_layers.active = ob.data.uv_layers["Lightmap"]
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    sc.render.bake.margin = 6
    sc.render.bake.use_pass_color = False
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6, use_clear=True)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    rgb = px[:, :, :3]
    print(f"[{name}] p50={np.percentile(rgb, 50):.3f} p99={np.percentile(rgb, 99):.3f} max={rgb.max():.3f}")
    rgb = np.clip(rgb / LM_SCALE, 0, 1)
    # sRGB pour garder de la précision dans les ombres (le client la déclare en sRGB)
    rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(name + "_out", size, size, alpha=False)
    flat = np.concatenate([rgb, np.ones((size, size, 1), dtype=np.float32)], axis=2).ravel()
    out.pixels.foreach_set(flat)
    out.filepath_raw = os.path.join(OUT, f"{name}.webp")
    out.file_format = "WEBP"
    sc.render.image_settings.quality = 88
    out.save()
    # matières d'export : noms lisibles par le client
    for k, label in enumerate(["asphalt", "painted"] if name == "lm_road" else ["painted"]):
        ob.data.materials[k] = export_material(label)


def preview(protos, statics, path):
    """Rendu Cycles d'un point de vue (contrôle du décor sans passer par le client)."""
    vc = bake_material("preview")
    for o in list(statics) + list(protos.values()):
        o.data.materials.clear()
        o.data.materials.append(vc)
    # le lagon (dans le jeu c'est un shader) : un plan turquoise suffit ici
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, 0))
    sea = bpy.context.active_object
    wm = bpy.data.materials.new("sea")
    wm.use_nodes = True
    wb = wm.node_tree.nodes["Principled BSDF"]
    wb.inputs["Base Color"].default_value = srgb("#1FA9B4")
    wb.inputs["Roughness"].default_value = 0.08
    sea.data.materials.append(wm)
    i = int(A.get("at", "10"))
    p = road_point(i, 0, 0)
    t = TAN[i]
    back, up, lens = (16, 8.5, 22) if "cover" in A else (9, 3.4, 18)
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    ob = bpy.data.objects.new("cam", cam)
    ob.location = (p.x - t.x * back, p.y - t.y * back, p.z + up)
    target = Vector((p.x + t.x * 40, p.y + t.y * 40, p.z + 0.8))
    ob.rotation_euler = (target - ob.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(ob)
    sc = bpy.context.scene
    sc.camera = ob
    sc.render.resolution_x, sc.render.resolution_y = (960, 400) if "cover" in A else (1200, 554)
    sc.cycles.samples = 64
    if path.endswith(".webp"):
        sc.render.image_settings.file_format = "WEBP"
        sc.render.image_settings.quality = 82
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "AgX"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def export_material(label):
    """Matière d'export nommée ; couleurs distinctes pour que gltf-transform ne les
    fusionne pas (le client choisit sa matière d'après ce nom)."""
    m = bpy.data.materials.get(label) or bpy.data.materials.new(label)
    m.diffuse_color = {"asphalt": (0.2, 0.2, 0.2, 1), "painted": (1, 1, 1, 1)}.get(label, (0.5, 0.5, 0.5, 1))
    m.use_nodes = False
    return m


def water_texture():
    size = 512
    px = np.zeros((size, size, 4), dtype=np.float32)
    for j in range(size):
        y = Y0 + (j + 0.5) / size * (Y1 - Y0)
        for i in range(size):
            x = X0 + (i + 0.5) / size * (X1 - X0)
            h = NAT[min(ny - 1, int((y - Y0) / STEP)), min(nx - 1, int((x - X0) / STEP))]
            h = min(h, height_at(x, y))
            depth = max(0.0, -h)
            px[j, i] = (min(1.0, depth / 8.0), 1.0 if h > 0 else 0.0, 0, 1)
    img = bpy.data.images.new("water", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.join(OUT, "water.png")
    img.file_format = "PNG"
    img.save()


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_vertex_color="ACTIVE",
        export_all_vertex_colors=False, export_materials="EXPORT", export_yup=True,
        export_cameras=False, export_lights=False, export_extras=False)


def g(v):
    """Blender → three."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def main():
    global PROTO
    reset()
    PROTO = bpy.data.collections.new("proto")
    bpy.context.scene.collection.children.link(PROTO)
    print("GPU:", use_gpu())
    terrain = build_terrain()
    road = build_road()
    col_road, col_wall = build_road_colliders()
    START, CPS = int(40 / DS), [int(N * f) for f in (0.26, 0.52, 0.76)]
    gate(START, start=True)
    for i in CPS:
        gate(i)
    dress()
    props_ob = props.to_object("props", weld=True)
    finalize_colors(props_ob)
    props_ob.data.uv_layers.new(name="Lightmap") if "Lightmap" not in props_ob.data.uv_layers else None
    bpy.ops.object.select_all(action="DESELECT")
    props_ob.select_set(True)
    bpy.context.view_layer.objects.active = props_ob
    props_ob.data.uv_layers.active = props_ob.data.uv_layers["Lightmap"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    back = backdrop()
    sky = clouds()
    plant()
    protos = {"palm": proto_palm(), "pine": proto_pine(), "niaouli": proto_niaouli(),
              "bush": proto_bush(), "rock": proto_rock(), "lamp": proto_lamp()}
    for o in protos.values():
        finalize_colors(o)
        o.hide_render = True
    for o in (col_road, col_wall, back, sky):
        o.hide_render = True
    lights()
    inst = instances_for_bake(protos)
    if "preview" in A:
        preview(protos, [terrain, road, props_ob], A["preview"])
        return
    for ob, name, size in ((road, "lm_road", LM), (terrain, "lm_terrain", LM), (props_ob, "lm_props", LM)):
        bake(ob, name, size)
    water_texture()
    bpy.data.collections.remove(inst)

    # hauteurs pour la physique
    with open(os.path.join(OUT, "heights.bin"), "wb") as f:
        f.write(np.round(H * 100).astype("<i2").tobytes())

    # métadonnées
    def gate_info(i):
        return {"pos": g(road_point(i, 0)), "dir": g(Vector((TAN[i].x, TAN[i].y, 0))), "half": 7.4}

    spawn = int(18 / DS)
    meta = {
        "name": "noumea",
        "length": round(LENGTH, 1),
        "sun": g(SUN),
        "lmScale": LM_SCALE,
        "terrain": {"x0": X0, "y0": Y0, "x1": X1, "y1": Y1, "nx": nx, "ny": ny, "step": STEP},
        "spawn": {"pos": g(road_point(spawn, 0, 0.6)), "dir": g(Vector((TAN[spawn].x, TAN[spawn].y, 0)))},
        "start": gate_info(START),
        "checkpoints": [gate_info(i) for i in CPS],
        "line": [g(road_point(i, 0)) for i in range(0, N, max(1, int(4 / DS)))],
        "instances": {k: [[round(x, 2), round(zz, 2), round(-y, 2), round(r, 3), round(s, 3)] for (x, y, zz, r, s) in v]
                      for k, v in INST.items()},
    }
    with open(os.path.join(OUT, "level.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    export([terrain, road, props_ob, back, sky, col_road, col_wall], os.path.join(OUT, "level.glb"))
    export(list(protos.values()), os.path.join(OUT, "flora.glb"))
    print("counts", {k: len(v) for k, v in INST.items()}, "length", LENGTH, "N", N)


main()
