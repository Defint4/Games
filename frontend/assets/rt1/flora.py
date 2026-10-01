"""Prototypes de la flore et du petit mobilier, instanciés par le client (flora.glb).
Chaque fonction construit un objet dans la collection `coll` ; les régions choisissent
les leurs (world_*.py, `protos`)."""

import math
import random

from mathutils import Vector

from common import Builder, mix, shade
from palette import C


def proto_palm(coll):
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
    return b.to_object("palm", coll, weld=True)


def proto_pine(coll):
    """Pin colonnaire."""
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
    return b.to_object("pine", coll, weld=True)


def proto_niaouli(coll):
    b = Builder()
    r = random.Random(11)
    b.cylinder((0, 0, 0), (0.3, 0.2, 2.6), 0.26, 0.18, 6, C["niaouli_bark"])
    b.cylinder((0.3, 0.2, 2.6), (1.3, 0.6, 4.2), 0.16, 0.1, 5, C["niaouli_bark"])
    b.cylinder((0.3, 0.2, 2.6), (-0.8, -0.3, 4.0), 0.15, 0.1, 5, C["niaouli_bark"])
    for cx, cy, cz, s in ((1.3, 0.6, 4.6, 1.6), (-0.8, -0.3, 4.4, 1.5), (0.2, 0.1, 5.3, 1.8), (0.6, -0.9, 4.2, 1.1)):
        b.icosphere((cx, cy, cz), s, C["niaouli"] if r.random() < 0.5 else C["niaouli2"], scale=(1.1, 1.1, 0.72), subdiv=0, jitter=0.18, rng=r)
    return b.to_object("niaouli", coll, weld=True)


def proto_bush(coll):
    b = Builder()
    r = random.Random(5)
    b.icosphere((0, 0, 0.5), 1.0, C["bush"], scale=(1.2, 1.0, 0.75), subdiv=0, jitter=0.2, rng=r)
    b.icosphere((0.7, 0.3, 0.4), 0.7, C["bush2"], scale=(1, 1, 0.8), subdiv=0, jitter=0.2, rng=r)
    return b.to_object("bush", coll, weld=True)


def proto_rock(coll):
    b = Builder()
    r = random.Random(9)
    b.icosphere((0, 0, 0.3), 1.2, C["rock"], scale=(1.3, 1.0, 0.7), subdiv=1, jitter=0.16, rng=r)
    return b.to_object("rock", coll, weld=True)


def proto_lamp(coll):
    b = Builder()
    b.cylinder((0, 0, 0), (0, 0, 6.5), 0.1, 0.07, 6, C["lamp"])
    b.cylinder((0, 0, 6.5), (1.2, 0, 6.9), 0.06, 0.05, 5, C["lamp"])
    b.box((1.35, 0, 6.8), (0.7, 0.3, 0.18), C["lamp"])
    b.box((1.35, 0, 6.68), (0.55, 0.22, 0.06), C["lamp_glass"])
    return b.to_object("lamp", coll, weld=True)


# ---------------------------------------------------------------- Grand Sud

def proto_maquis(coll):
    """Maquis minier : touffes basses gris-vert sur tiges rouges, par groupes de trois."""
    b = Builder()
    r = random.Random(23)
    for cx, cy, s in ((0, 0, 0.9), (1.1, 0.4, 0.65), (-0.8, 0.7, 0.55)):
        b.cylinder((cx, cy, 0), (cx + 0.1, cy, 0.5 * s), 0.05, 0.04, 4, C["maquis_stem"], cap=False)
        b.icosphere((cx, cy, 0.55 * s), s, C["maquis_a"] if r.random() < 0.6 else C["maquis_b"], scale=(1.15, 1.0, 0.7), subdiv=0, jitter=0.22, rng=r)
    return b.to_object("maquis", coll, weld=True)


def proto_boulder(coll):
    """Bloc de cuirasse ferrugineuse : anguleux, brun-rouge, croûte sombre dessus."""
    b = Builder()
    r = random.Random(31)
    b.icosphere((0, 0, 0.35), 1.3, C["iron"], scale=(1.4, 1.05, 0.75), subdiv=1, jitter=0.2, rng=r)
    b.icosphere((0.5, -0.3, 0.6), 0.7, C["iron2"], scale=(1.2, 1.0, 0.8), subdiv=0, jitter=0.25, rng=r)
    return b.to_object("boulder", coll, weld=True)


def proto_kaori(coll):
    """Kaori : fût droit et haut, houppier large et plat en plusieurs masses."""
    b = Builder()
    r = random.Random(37)
    Hh = 16.0
    b.cylinder((0, 0, 0), (0, 0, Hh * 0.72), 0.5, 0.32, 7, C["kaori_bark"])
    for k in range(3):
        a = k / 3 * math.tau + 0.4
        tip = (2.6 * math.cos(a), 2.6 * math.sin(a), Hh * 0.72 + 2.2)
        b.cylinder((0, 0, Hh * 0.66), tip, 0.22, 0.1, 5, C["kaori_bark"], cap=False)
        b.icosphere((tip[0] * 1.3, tip[1] * 1.3, tip[2] + 0.6), 3.0, C["kaori"] if k % 2 else C["kaori2"], scale=(1.3, 1.3, 0.55), subdiv=1, jitter=0.16, rng=r)
    b.icosphere((0, 0, Hh), 3.6, C["kaori"], scale=(1.25, 1.25, 0.6), subdiv=1, jitter=0.14, rng=r)
    return b.to_object("kaori", coll, weld=True)


def proto_fern(coll):
    """Fougère arborescente des creeks : stipe fin, frondes rayonnantes."""
    b = Builder()
    r = random.Random(41)
    b.cylinder((0, 0, 0), (0.1, 0, 3.2), 0.14, 0.1, 5, C["fern_stem"], cap=False)
    top = Vector((0.1, 0, 3.2))
    for f in range(9):
        ang = f / 9 * math.tau + r.uniform(-0.2, 0.2)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-d.y, d.x, 0))
        L = r.uniform(2.0, 2.6)
        p0, p1, p2 = top, top + d * (L * 0.5) + Vector((0, 0, 0.5)), top + d * L + Vector((0, 0, -0.4))
        for a, c, w in ((p0, p1, 0.35), (p1, p2, 0.55)):
            col = C["fern"] if f % 2 else C["fern2"]
            b.quad(a - side * (w * 0.5), c - side * w, c + side * w, a + side * (w * 0.5), col)
    return b.to_object("fern", coll, weld=True)
