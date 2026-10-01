"""Un circuit de RT1 : terrain, route, décor, végétation, lumière cuite.

blender -b -P level.py -- --circuit <slug> --out <dossier> [--samples 128] [--lm 2048]
(tracés et blocs dans circuits.py ; relief, couleurs, décor et végétation de la région dans
world_<région>.py, qui reçoit ce module en `L`)

Sorties (dans --out) :
  level.glb          terrain (en tuiles), route, décor, collision de la route (col_road)
  flora.glb          prototypes des objets instanciés (palmier, pin, niaouli…)
  lm_terrain.png, lm_road.png, lm_props.png   cartes de lumière (éclairement / LM_SCALE),
                     encodées en KTX2 par build.sh
  heights.bin        hauteurs du terrain (int16, cm), grille nx × ny
  water.png          profondeur d'eau (R) sur l'emprise du terrain
  probe.bin          éclairement au sol (u8, 128 × 96 sur l'emprise) : sonde de lumière
  level.json         départ, portes, murs (tronçons), soleil, emprise, instances

Repère Blender : Z en haut, la mer au sud (-Y). Le glTF passe en Y en haut :
(x, y, z) Blender → (x, z, -y) three.
"""

import importlib
import json
import math
import os
import random
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(__file__))
from circuits import CIRCUITS  # noqa: E402
from common import (Builder, args, bake_material, finalize_colors, mix, reset, shade,  # noqa: E402
                    smoothstep, srgb, use_gpu)
from palette import C  # noqa: E402

A = args()
OUT = os.path.abspath(A.get("out", "out"))
SAMPLES = int(A.get("samples", "128"))
LM = int(A.get("lm", "2048"))
LM_SCALE = 2.0
SLUG = A.get("circuit", "noumea")
CIRCUIT = CIRCUITS[SLUG]
REGION = CIRCUIT.get("region", "noumea")
# la région : relief, couleurs du sol, décor, végétation, lumière (world_<région>.py)
WORLD = importlib.import_module("world_" + REGION.replace("-", "_"))
# ce module, passé à la région pour qu'elle pose son décor avec les outils d'ici
L = sys.modules[__name__]
# murs ou non (--walls 0/1 force, pour essayer une variante)
WALLS = CIRCUIT["walls"] if "walls" not in A else A["walls"] != "0"
os.makedirs(OUT, exist_ok=True)
rng = random.Random(1853)

# ---------------------------------------------------------------- emprise du terrain
X0, X1, Y0, Y1, STEP = -640.0, 640.0, -420.0, 520.0, 4.0


# ---------------------------------------------------------------- tracé
CTRL = CIRCUIT["ctrl"]


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
z = [WORLD.natural(p.x, p.y) for p in XY]
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
# Sauts : rampe de 22 m jusqu'à +h, puis la route plonge sur 7 m (à vive allure, on vole)
for frac, h in CIRCUIT["jumps"]:
    i0 = int(frac * N)
    up, down = int(22 / DS), int(7 / DS)
    for k in range(-up, down + 1):
        t = (k + up) / up if k <= 0 else 1 - k / down
        z[(i0 + k) % N] += h * (t ** 1.6 if k <= 0 else t * t)
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
# Emprise de la route (jupe comprise) : le terrain reste au moins 0,45 m dessous. Avec le
# dévers, la hauteur visée est continue de l'axe à 40 m (une maille de 4 m interpolait
# sinon entre un sommet abaissé et un sommet trop haut : le terrain perçait l'accotement).
ROAD_HALF = 9.4
ROAD_CLEAR = 0.45
H = np.zeros((ny, nx), dtype=np.float64)
NAT = np.zeros((ny, nx), dtype=np.float64)
for j in range(ny):
    y = Y0 + j * STEP
    for i in range(nx):
        x = X0 + i * STEP
        h = WORLD.natural(x, y)
        NAT[j, i] = h
        ti, dist, lat = track_info(x, y)
        if dist < 40:
            road_z = Z[ti] - max(-ROAD_HALF, min(ROAD_HALF, lat)) * math.sin(BANK[ti])
            w = 1 - smoothstep(9.5, 32, dist)
            h = h * (1 - w) + (road_z - ROAD_CLEAR) * w
            # toute maille qui touche l'emprise a ses quatre coins sous la route
            if dist < ROAD_HALF + STEP * 1.5:
                h = min(h, road_z - ROAD_CLEAR)
        H[j, i] = h


def height_at(x, y):
    fx, fy = (x - X0) / STEP, (y - Y0) / STEP
    i, j = int(max(0, min(nx - 2, math.floor(fx)))), int(max(0, min(ny - 2, math.floor(fy))))
    tx, ty = fx - i, fy - j
    return (H[j, i] * (1 - tx) * (1 - ty) + H[j, i + 1] * tx * (1 - ty)
            + H[j + 1, i] * (1 - tx) * ty + H[j + 1, i + 1] * tx * ty)


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
            c = WORLD.terrain_color(x, y, h, slope)
            _, dist, _ = track_info(x, y)
            c = mix(c, C["earth"], 0.7 * (1 - smoothstep(8, 14, dist)))
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
    # jupe sur le pourtour : du bord du terrain jusque sous la mer, couleur du relief
    skirt = [(j, i) for i in range(nx) for j in (0, ny - 1)] + [(j, i) for j in range(ny) for i in (0, nx - 1)]
    edges = (
        [((0, i), (0, i + 1)) for i in range(nx - 1)]
        + [((ny - 1, i + 1), (ny - 1, i)) for i in range(nx - 1)]
        + [((j + 1, 0), (j, 0)) for j in range(ny - 1)]
        + [((j, nx - 1), (j + 1, nx - 1)) for j in range(ny - 1)]
    )
    low = {}
    for (j, i) in skirt:
        if (j, i) in low:
            continue
        low[(j, i)] = len(verts)
        verts.append((X0 + i * STEP, Y0 + j * STEP, -12.0))
        cols.extend(shade(WORLD.terrain_color(X0 + i * STEP, Y0 + j * STEP, H[j, i], 0.6), 0.8))
        lms.append(((i * STEP) / (X1 - X0), (j * STEP) / (Y1 - Y0)))
    for (a, b) in edges:
        if max(H[a], H[b]) < -2.6:
            continue
        # face tournée vers l'extérieur de la carte
        faces.append((b[0] * nx + b[1], a[0] * nx + a[1], low[a], low[b]))
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
            border = WALL if WALLS else [(8.2, -0.05), (7.4, 0.0)]
            pts = [(side * 9.4, -1.1)] + [(side * l, dz) for l, dz in border] + [(side * 7.0, 0.0), (side * 6.0, 0.0)]
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
                    up = Vector((0, 0, 0.05))
                    # flancs du vibreur : sans eux, une fente laissait voir le terrain dessous
                    b.face((a, bb, bb + up, a + up), col, None, lms, flip=True)
                    b.face((d + up, c + up, c, d), col, None, lms, flip=True)
                    a, bb, c, d = (v + up for v in (a, bb, c, d))
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


# Face intérieure du mur visible (WALL) : les pavés de collision commencent là.
WALL_FACE = 7.55


def build_road_collider():
    """Le collider de la route, tourné vers le haut (Rapier ne garde que les contacts de
    face avant) : chaussée, accotements, puis la jupe qui descend sous le terrain, pour
    qu'une roue ne tombe pas d'une marche au bord."""
    b = Builder()
    step = 2
    prof = [(9.4, -1.1), (7.4, 0.0), (-7.4, 0.0), (-9.4, -1.1)]
    for i in range(0, N, step):
        j = i + step
        for (l0, d0), (l1, d1) in zip(prof, prof[1:]):
            a, bb = road_point(i, l0, d0), road_point(j, l0, d0)
            c, d = road_point(j, l1, d1), road_point(i, l1, d1)
            b.face((a, bb, c, d), C["black"], flip=True)
    return b.to_object("col_road")


def wall_segments():
    """Les murs pour la physique : un tronçon par 3 échantillons et par côté, de a à b le
    long de la face intérieure du mur visible (repère three), avec le côté (+1 à gauche).
    Le client en fait des pavés épais et hauts (sim/game.ts)."""
    if not WALLS:
        return []
    out = []
    step = 3
    for i in range(0, N, step):
        j = i + step
        for side in (1, -1):
            a, bb = road_point(i, side * WALL_FACE), road_point(j, side * WALL_FACE)
            out.append([*g(a), *g(bb), side])
    return out


# ---------------------------------------------------------------- décor cuit
props = Builder()


def heading(i):
    t = TAN[i % N]
    return math.atan2(t.y, t.x)


def gate(i, start=False):
    rz = heading(i) + math.pi / 2  # l'axe x local traverse la route
    base = XY[i]
    zc = Z[i]
    post = 9.2 if WALLS else 11.5
    for side in (1, -1):
        p = base + SIDE[i] * (side * post)
        props.box((p.x, p.y, zc + 3.6), (1.1, 1.1, 7.6), C["gate_dark"], rz)
    top_c = zc + 7.6
    span = 2 * post + 1.6
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


BOOST_LEN = 10.0


def boost_pads():
    """Chevrons orange sur la chaussée ; le client les éclaire lui-même (pas de cuisson)."""
    b = Builder()
    orange, light = srgb("#FF7A2F"), srgb("#FFD7B5")
    for frac in CIRCUIT["boosts"]:
        i0 = int(frac * N)
        n = int(BOOST_LEN / DS)
        for c in range(3):
            a = i0 + int(c * n / 3)
            for k in range(int(n / 3) - 1):
                i, j = a + k, a + k + 1
                t0, t1 = k / (n / 3), (k + 1) / (n / 3)
                for side in (1, -1):
                    # bras du chevron : de l'extérieur (arrière) vers l'axe (avant)
                    o0, o1 = side * 3.6 * (1 - t0), side * 3.6 * (1 - t1)
                    col = orange if (c + k) % 2 == 0 else light
                    p = (road_point(i, o0, 0.045), road_point(j, o1, 0.045),
                         road_point(j, o1 - side * 0.9, 0.045), road_point(i, o0 - side * 0.9, 0.045))
                    b.face(p, col, flip=side > 0)
    if not CIRCUIT["boosts"]:
        return None
    ob = b.to_object("boosts")
    finalize_colors(ob)
    return ob


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
        col = mix(srgb(WORLD.BACKDROP[0]), srgb(WORLD.BACKDROP[1]), r.random())
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


# ---------------------------------------------------------------- flore
# collection des prototypes (flora.py), instanciés par la région
PROTO = None


# ---------------------------------------------------------------- placement
INST: dict[str, list] = {k: [] for k in WORLD.KINDS}


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


# ---------------------------------------------------------------- éclairage et cuisson
SUN = WORLD.SUN


def lights():
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.color = WORLD.SUN_COLOR
    sun.angle = math.radians(2.5)
    ob = bpy.data.objects.new("sun", sun)
    ob.rotation_euler = SUN.to_track_quat("Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(ob)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = WORLD.SKY[0]
    bg.inputs["Strength"].default_value = WORLD.SKY[1]
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


def bake(ob, name, size, margin=6, hidden=()):
    """Cuit l'éclairement de `ob` dans une carte de lumière. `hidden` : objets écartés le
    temps de la cuisson (le terrain est cuit sans la route par-dessus, sinon il est noir
    sous la chaussée et ce noir bave sur les bords par le filtrage)."""
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
    sc.render.bake.margin = margin
    sc.render.bake.use_pass_color = False
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    for o in hidden:
        o.hide_render = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=margin, use_clear=True)
    for o in hidden:
        o.hide_render = False
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    rgb = px[:, :, :3]
    print(f"[{name}] p50={np.percentile(rgb, 50):.3f} p99={np.percentile(rgb, 99):.3f} max={rgb.max():.3f}")
    rgb = np.clip(rgb / LM_SCALE, 0, 1)
    if name == "lm_terrain":
        # sonde de lumière : l'éclairement au sol sur une grille grossière, pour que la
        # voiture et la flore passent à l'ombre des immeubles et du relief (probe.bin, u8)
        PX, PY = 128, 96
        lum = rgb.mean(axis=2)
        blocks = lum[: (size // PY) * PY, : (size // PX) * PX].reshape(PY, size // PY, PX, size // PX).mean(axis=(1, 3))
        with open(os.path.join(OUT, "probe.bin"), "wb") as f:
            f.write(np.clip(blocks * 255, 0, 255).astype(np.uint8).tobytes())
    # sRGB pour garder de la précision dans les ombres (le client la déclare en sRGB)
    rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(name + "_out", size, size, alpha=False)
    flat = np.concatenate([rgb, np.ones((size, size, 1), dtype=np.float32)], axis=2).ravel()
    out.pixels.foreach_set(flat)
    # PNG sans perte : build.sh l'encode en KTX2 (compressé sur le GPU du téléphone)
    out.filepath_raw = os.path.join(OUT, f"{name}.png")
    out.file_format = "PNG"
    out.save()
    # matières d'export : noms lisibles par le client
    for k, label in enumerate(["asphalt", "painted"] if name == "lm_road" else ["painted"]):
        ob.data.materials[k] = export_material(label)


def preview(protos, statics, path):
    """Rendu Cycles d'un point de vue (contrôle du décor sans passer par le client)."""
    vc = bake_material("preview")
    # la chaussée est blanche en couleur de sommet (texturée par le client) : un gris ici
    grey = bpy.data.materials.new("preview_asphalt")
    grey.use_nodes = True
    grey.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.09, 0.1, 1)
    grey.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
    for o in list(statics) + list(protos.values()):
        o.data.materials.clear()
        if o.name == "road":
            o.data.materials.append(grey)
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
    if "look" in A:
        # --look x,y : regarder un point du décor plutôt que la route
        lx, ly = (float(v) for v in A["look"].split(","))
        target = Vector((lx, ly, height_at(lx, ly) + 4))
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


def split_tiles(ob, cols, rows):
    """Découpe un maillage (déjà cuit, UV et couleurs gardés) en cols × rows objets selon la
    position x, y des faces : terrain_<c>_<r>."""
    import bmesh
    src = bmesh.new()
    src.from_mesh(ob.data)
    src.faces.ensure_lookup_table()
    tiles = []
    for c in range(cols):
        for r in range(rows):
            x0, x1 = X0 + (X1 - X0) * c / cols, X0 + (X1 - X0) * (c + 1) / cols
            y0, y1 = Y0 + (Y1 - Y0) * r / rows, Y0 + (Y1 - Y0) * (r + 1) / rows
            bm = src.copy()
            drop = []
            for f in bm.faces:
                cx = sum(v.co.x for v in f.verts) / len(f.verts)
                cy = sum(v.co.y for v in f.verts) / len(f.verts)
                if not (x0 <= cx < x1 and y0 <= cy < y1):
                    drop.append(f)
            bmesh.ops.delete(bm, geom=drop, context="FACES")
            if not bm.faces:
                bm.free()
                continue
            me = bpy.data.meshes.new(f"terrain_{c}_{r}")
            bm.to_mesh(me)
            bm.free()
            for m in ob.data.materials:
                me.materials.append(m)
            for p in me.polygons:
                p.use_smooth = True
            t = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(t)
            finalize_colors(t)
            if "Col" not in me.color_attributes:
                raise RuntimeError(f"{me.name} : couleurs de sommet perdues au découpage")
            tiles.append(t)
    src.free()
    ob.hide_render = True
    return tiles


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
    col_road = build_road_collider()
    START, CPS = int(40 / DS), [int(N * f) for f in (0.26, 0.52, 0.76)]
    gate(START, start=True)
    for i in CPS:
        gate(i)
    WORLD.dress(L)
    props_ob = props.to_object("props", weld=True)
    finalize_colors(props_ob)
    props_ob.data.uv_layers.new(name="Lightmap") if "Lightmap" not in props_ob.data.uv_layers else None
    bpy.ops.object.select_all(action="DESELECT")
    props_ob.select_set(True)
    bpy.context.view_layer.objects.active = props_ob
    props_ob.data.uv_layers.active = props_ob.data.uv_layers["Lightmap"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # marge d'îlot au-dessus de la marge de cuisson (16 px sur 2048), sinon les îlots
    # voisins se mélangent dès les premières mips
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.009, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    back = backdrop()
    sky = clouds()
    pads = boost_pads()
    WORLD.plant(L)
    protos = WORLD.protos(L)
    for o in protos.values():
        finalize_colors(o)
        o.hide_render = True
    for o in (col_road, back, sky, pads):
        if o:
            o.hide_render = True
    lights()
    inst = instances_for_bake(protos)
    if "preview" in A:
        preview(protos, [terrain, road, props_ob], A["preview"])
        return
    bake(road, "lm_road", LM)
    bake(terrain, "lm_terrain", LM, hidden=(road,))
    bake(props_ob, "lm_props", LM, margin=16)
    water_texture()
    # terrain en tuiles : chacune est écartée du dessin quand elle sort du champ
    tiles = split_tiles(terrain, 4, 4)
    bpy.data.collections.remove(inst)

    # hauteurs pour la physique
    with open(os.path.join(OUT, "heights.bin"), "wb") as f:
        f.write(np.round(H * 100).astype("<i2").tobytes())

    # métadonnées
    def gate_info(i):
        return {"pos": g(road_point(i, 0)), "dir": g(Vector((TAN[i].x, TAN[i].y, 0))), "half": 7.4}

    spawn = int(18 / DS)
    meta = {
        "name": SLUG,
        "region": REGION,
        "laps": CIRCUIT["laps"],
        "boosts": [{**gate_info(int(f * N)), "half": 4.2, "len": BOOST_LEN} for f in CIRCUIT["boosts"]],
        "length": round(LENGTH, 1),
        "sun": g(SUN),
        "lmScale": LM_SCALE,
        "walls": WALLS,
        "wallSegments": wall_segments(),
        "lineStep": round(DS * max(1, int(4 / DS)), 3),
        "probe": {"nx": 128, "ny": 96, "lit": 0.42},
        "terrain": {"x0": X0, "y0": Y0, "x1": X1, "y1": Y1, "nx": nx, "ny": ny, "step": STEP},
        "spawn": {"pos": g(road_point(spawn, 0, 0.6)), "dir": g(Vector((TAN[spawn].x, TAN[spawn].y, 0)))},
        "start": gate_info(START),
        "checkpoints": [gate_info(i) for i in CPS],
        "line": [g(road_point(i, 0)) for i in range(0, N, max(1, int(4 / DS)))],
        "instances": {k: [[round(x, 2), round(zz, 2), round(-y, 2), round(r, 3), round(s, 3)] for (x, y, zz, r, s) in v]
                      for k, v in INST.items()},
    }
    if WORLD.PALETTE:
        # ciel, brouillard et eau propres à la région (three/materials.ts)
        meta["palette"] = WORLD.PALETTE
    with open(os.path.join(OUT, "level.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    export([o for o in (*tiles, road, props_ob, back, sky, pads, col_road) if o], os.path.join(OUT, "level.glb"))
    export(list(protos.values()), os.path.join(OUT, "flora.glb"))
    print("counts", {k: len(v) for k, v in INST.items()}, "length", LENGTH, "N", N)


main()
