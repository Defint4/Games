"""Les véhicules du garage, sauf la citadine (car.py), modélisés par sections et tubes.

blender -b -P vehicles.py -- --out <dossier> --specs specs.json [--only kart,f1] [--thumbs 1]

Sorties par véhicule : <id>.glb (objets `body` et `wheel`, matières nommées que le client
remplace), <id>_shadow.png (ombre de contact cuite), et avec --thumbs <id>.webp (vignette
du garage, fond transparent ; la citadine comprise). Dimensions (voies, empattement, roues,
caisse) lues dans specs.json, tiré de src/games/rt1/sim/vehicles.ts.
Repère Blender : l'avant vers -Y, la gauche vers +X, le sol à z = 0.
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(__file__))
import car  # noqa: E402
from car import MATS, Mesh, body_section, loft  # noqa: E402
from common import args, reset, use_gpu  # noqa: E402

A = args()
OUT = os.path.abspath(A.get("out", "out"))
os.makedirs(OUT, exist_ok=True)
SPECS = json.load(open(A["specs"]))

MATS.update({
    "helmet": ("#F2F2EC", 0.3, 0.0),
    "suit": ("#1F3A5F", 0.85, 0.0),
    "livery": ("#F4F4F0", 0.35, 0.0),
    "beacon": ("#FF9A1F", 0.2, 0.0),
    "dirt": ("#B5482A", 0.95, 0.0),
})


class G:
    """Géométrie d'un véhicule d'après sa physique (repère Blender)."""

    def __init__(self, vid):
        s = SPECS[vid]
        self.R = s["wheelRadius"]
        self.T = s["track"]
        self.fy = -s["frontZ"]
        self.ry = -s["rearZ"]
        self.hx = s["half"][0]
        self.hz = s["half"][2]
        # moto : une roue par essieu, dans l'axe
        self.bike = bool(s.get("bike"))


# ------------------------------------------------------------------ outils

def tube(m, a, b, r, name, segs=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    mid = (a + b) / 2
    for v in tmp.verts:
        p = v.co.copy()
        p.rotate(q)
        v.co = p + mid
    m._merge(tmp, name)


def sphere(m, c, r, name, scale=(1, 1, 1), segs=14):
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
    for v in tmp.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(c)
    m._merge(tmp, name)


def flare(m, x, y0, zc, r_in, r_out, width, name, a0=0.15, a1=math.pi - 0.15, segs=10):
    """Élargisseur d'aile : bande en arc au-dessus d'une roue (centre y0, zc)."""
    x0, x1 = (x, x + width) if x > 0 else (x - width, x)
    rings = []
    for k in range(segs + 1):
        a = a0 + (a1 - a0) * k / segs
        c, s = math.cos(a), math.sin(a)
        rings.append([(x0, y0 + r_in * c, zc + r_in * s), (x1, y0 + r_in * c, zc + r_in * s),
                      (x1, y0 + r_out * c, zc + r_out * s), (x0, y0 + r_out * c, zc + r_out * s)])
    loft([[Vector(p) for p in r] for r in rings], lambda k, i: name, m)


def arches(body, g, radius, depth=2.4):
    cm = Mesh()
    for y in (g.fy, g.ry):
        cm.cyl((0, y, g.R), radius, depth, "trim", axis="X", segs=28)
    cutter = cm.obj("cutter")
    mod = body.modifiers.new("arches", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="arches")
    bpy.data.objects.remove(cutter)


def greenhouse(m, gprof, roof):
    """Habitacle vitré par sections (y, largeur bas, largeur haut, bas, haut) ; toit peint
    entre les sections `roof`."""
    gsec = []
    for y, wb, wt, zb, zt in gprof:
        gsec.append([Vector(p) for p in (
            (0, y, zb), (wb, y, zb), (wb * 0.99, y, zb + (zt - zb) * 0.5), (wt, y, zt - 0.03), (wt * 0.6, y, zt),
            (0, y, zt + 0.01), (-wt * 0.6, y, zt), (-wt, y, zt - 0.03), (-wb * 0.99, y, zb + (zt - zb) * 0.5), (-wb, y, zb))])
    loft(gsec, lambda k, i: "paint" if (roof[0] <= k <= roof[1] and i in (3, 4, 5, 6)) else "glass", m)


def shell(prof, gprof, roof):
    """Caisse fermée lissée (sections y, demi-largeur, bas, ligne de caisse) + habitacle."""
    m = Mesh()
    loft([body_section(*p) for p in prof], lambda k, i: "paint", m)
    body = m.obj("body_shell", smooth_angle=40)
    d = Mesh()
    greenhouse(d, gprof, roof)
    return body, d


def finish(parts):
    """Joint les objets et maillages en un seul objet `body`."""
    objs = [p if isinstance(p, bpy.types.Object) else p.obj(f"part{i}", smooth_angle=30) for i, p in enumerate(parts)]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = "body"
    return objs[0]


def interior(m, y, z, w=0.36, steer_y=None, steer_z=None):
    """Sièges, planche de bord, volant (vus en 1re personne)."""
    for s in (1, -1):
        m.box((s * w, y, z), (0.48, 0.5, 0.14), "interior")
        m.box((s * w, y + 0.24, z + 0.28), (0.48, 0.12, 0.58), "interior", rx=-0.15)
    sy = steer_y if steer_y is not None else y - 0.8
    sz = steer_z if steer_z is not None else z + 0.2
    m.box((0, sy - 0.12, sz - 0.08), (1.5, 0.3, 0.26), "interior")
    ring(m, (w, sy + 0.06, sz + 0.02), 0.17, "trim", tilt=math.radians(-62))


def ring(m, c, r, name, tilt=0.0, segs=18, thick=0.025):
    for k in range(segs):
        a0, a1 = k / segs * math.tau, (k + 1) / segs * math.tau
        p0 = Vector((r * math.cos(a0), r * math.sin(a0), 0))
        p1 = Vector((r * math.cos(a1), r * math.sin(a1), 0))
        p0.rotate(Euler((tilt, 0, 0)))
        p1.rotate(Euler((tilt, 0, 0)))
        tube(m, Vector(c) + p0, Vector(c) + p1, thick, name, segs=5)


def driver(m, y, z, lean=0.35, hands=None, x=0.0):
    """Pilote assis : combinaison, bras vers le volant, casque et visière."""
    m.box((x, y, z + 0.22), (0.4, 0.24, 0.46), "suit", rx=lean)
    head = Vector((x, y - 0.1, z + 0.62))
    sphere(m, head, 0.15, "helmet")
    m.box((0, head.y - 0.12, head.z + 0.01), (0.2, 0.04, 0.07), "glass", rx=-0.2)
    if hands:
        for s in (1, -1):
            sh = Vector((x + s * 0.2, y - 0.05, z + 0.38))
            hd = Vector((x + s * 0.15, hands[0], hands[1]))
            tube(m, sh, hd, 0.045, "suit", segs=6)


def lights_round(m, xs, y, z, r, name="light_front"):
    for x in xs:
        m.cyl((x, y, z), r, 0.05, name, axis="Y", segs=14)
        m.cyl((x, y + 0.02, z), r * 1.15, 0.05, "chrome", axis="Y", segs=14)


# ------------------------------------------------------------------ véhicules

def build_sport(g):
    prof = [(-2.12, 0.72, 0.26, 0.5), (-2.06, 0.84, 0.2, 0.58), (-1.9, 0.9, 0.18, 0.64), (-1.5, 0.92, 0.18, 0.68),
            (-1.0, 0.92, 0.18, 0.72), (-0.4, 0.9, 0.18, 0.77), (0.3, 0.9, 0.18, 0.8), (1.0, 0.94, 0.18, 0.82),
            (1.5, 0.95, 0.19, 0.84), (1.9, 0.92, 0.21, 0.84), (2.08, 0.84, 0.26, 0.8), (2.14, 0.74, 0.32, 0.76)]
    gprof = [(-0.55, 0.86, 0.72, 0.78, 0.8), (-0.3, 0.85, 0.7, 0.79, 1.02), (0.0, 0.84, 0.66, 0.8, 1.16),
             (0.45, 0.83, 0.64, 0.81, 1.18), (0.9, 0.84, 0.62, 0.82, 1.1), (1.35, 0.86, 0.64, 0.83, 0.96),
             (1.75, 0.88, 0.72, 0.84, 0.86)]
    body, d = shell(prof, gprof, (1, 4))
    arches(body, g, g.R * 1.2)
    for s in (1, -1):
        d.box((s * 0.6, -2.07, 0.56), (0.4, 0.05, 0.07), "light_front", rz=s * 0.12)
        d.box((s * 0.9, -0.42, 0.86), (0.08, 0.14, 0.07), "paint")
        d.box((s * 0.925, 0.1, 0.24), (0.03, 2.3, 0.08), "trim")
        d.box((s * 0.925, 0.75, 0.5), (0.02, 0.5, 0.16), "trim")
        d.cyl((s * 0.32, 2.14, 0.3), 0.055, 0.2, "chrome", axis="Y", segs=12)
    d.box((0, 2.12, 0.74), (1.55, 0.04, 0.06), "light_rear")
    d.box((0, -2.02, 0.2), (1.7, 0.3, 0.04), "trim")
    d.box((0, -2.1, 0.36), (0.9, 0.04, 0.12), "trim")
    d.box((0, 2.08, 0.28), (1.5, 0.12, 0.14), "trim")
    d.box((0, 1.98, 0.88), (1.5, 0.26, 0.04), "paint", rx=0.18)
    d.box((0, -2.14, 0.4), (0.46, 0.02, 0.1), "plate")
    d.box((0, 2.15, 0.55), (0.46, 0.02, 0.1), "plate")
    interior(d, 0.35, 0.36, steer_y=-0.3, steer_z=0.62)
    return finish([body, d])


def build_rally(g):
    prof = [(-1.96, 0.74, 0.3, 0.6), (-1.93, 0.83, 0.24, 0.7), (-1.84, 0.88, 0.21, 0.78), (-1.6, 0.9, 0.2, 0.83),
            (-1.2, 0.905, 0.2, 0.87), (-0.85, 0.905, 0.2, 0.92), (-0.3, 0.905, 0.2, 0.935), (0.4, 0.905, 0.2, 0.945),
            (1.1, 0.9, 0.2, 0.95), (1.6, 0.89, 0.21, 0.95), (1.86, 0.86, 0.25, 0.93), (1.95, 0.81, 0.31, 0.89)]
    gprof = [(-0.9, 0.88, 0.74, 0.93, 0.95), (-0.55, 0.87, 0.73, 0.93, 1.18), (-0.25, 0.86, 0.72, 0.935, 1.39),
             (0.2, 0.86, 0.72, 0.945, 1.43), (0.9, 0.86, 0.72, 0.95, 1.42), (1.2, 0.85, 0.71, 0.95, 1.36),
             (1.4, 0.84, 0.7, 0.95, 1.2), (1.55, 0.83, 0.68, 0.95, 0.99)]
    body, d = shell(prof, gprof, (2, 5))
    arches(body, g, g.R * 1.24)
    for y in (g.fy, g.ry):
        for s in (1, -1):
            flare(d, s * 0.88, y, g.R, g.R * 1.24, g.R * 1.42, 0.1, "trim")
            d.box((s * 0.82, y + 0.46, 0.2), (0.28, 0.02, 0.3), "trim")
    for s in (1, -1):
        d.box((s * 0.47, -1.935, 0.635), (0.28, 0.06, 0.13), "light_front")
        d.box((s * 0.68, 1.935, 0.78), (0.26, 0.05, 0.2), "light_rear")
        d.box((s * 0.965, -0.74, 1.0), (0.09, 0.15, 0.085), "paint")
        d.cyl((s * 0.912, 0.1, 0.62), 0.24, 0.02, "livery", axis="X", segs=20)
    lights_round(d, (-0.54, -0.18, 0.18, 0.54), -1.98, 0.78, 0.085)
    d.box((0, -1.93, 0.78), (1.2, 0.04, 0.04), "trim")
    d.box((0, -0.35, 1.47), (0.36, 0.5, 0.08), "trim")
    d.box((0, 1.5, 1.4), (1.4, 0.3, 0.04), "paint", rx=-0.12)
    for s in (1, -1):
        d.box((s * 0.62, 1.52, 1.3), (0.03, 0.2, 0.18), "trim")
    d.box((0, -1.94, 0.34), (1.5, 0.1, 0.16), "trim")
    d.box((0, 1.93, 0.4), (1.6, 0.1, 0.2), "trim")
    d.box((0, 0.1, 1.44), (0.5, 1.4, 0.005), "livery")
    d.box((0, -1.99, 0.42), (0.5, 0.02, 0.11), "plate")
    d.cyl((-0.45, 1.95, 0.28), 0.06, 0.24, "chrome", axis="Y", segs=10)
    interior(d, 0.32, 0.72, steer_y=-0.44, steer_z=0.88)
    return finish([body, d])


def build_pickup(g):
    prof = [(-2.62, 0.84, 0.46, 0.92), (-2.56, 0.93, 0.4, 1.02), (-2.4, 0.96, 0.38, 1.08), (-1.9, 0.97, 0.38, 1.12),
            (-1.2, 0.97, 0.38, 1.14), (-0.3, 0.97, 0.38, 1.15), (0.5, 0.97, 0.38, 1.15), (1.5, 0.97, 0.38, 1.15),
            (2.4, 0.96, 0.4, 1.14), (2.58, 0.92, 0.44, 1.12)]
    gprof = [(-1.1, 0.92, 0.8, 1.14, 1.16), (-0.8, 0.91, 0.79, 1.15, 1.68), (-0.5, 0.9, 0.78, 1.15, 1.82),
             (0.0, 0.9, 0.78, 1.15, 1.84), (0.3, 0.9, 0.78, 1.15, 1.82), (0.42, 0.9, 0.79, 1.15, 1.16)]
    body, d = shell(prof, gprof, (1, 4))
    arches(body, g, g.R * 1.2, depth=2.6)
    for y in (g.fy, g.ry):
        for s in (1, -1):
            flare(d, s * 0.96, y, g.R, g.R * 1.2, g.R * 1.36, 0.1, "trim")
    for s in (1, -1):
        d.box((s * 0.94, 1.5, 1.33), (0.08, 2.1, 0.36), "paint")
        d.box((s * 0.62, -2.6, 0.9), (0.32, 0.05, 0.16), "light_front")
        d.box((s * 0.8, 2.6, 1.0), (0.2, 0.04, 0.28), "light_rear")
        d.box((s * 1.0, -0.2, 0.36), (0.14, 1.4, 0.04), "trim")
        d.box((s * 1.0, -0.62, 1.42), (0.1, 0.16, 0.12), "trim")
        tube(d, (s * 0.52, -2.78, 0.46), (s * 0.52, -2.78, 1.12), 0.04, "chrome")
        tube(d, (s * 0.52, -2.78, 1.12), (s * 0.3, -2.6, 1.14), 0.04, "chrome")
    tube(d, (-0.52, -2.78, 1.1), (0.52, -2.78, 1.1), 0.04, "chrome")
    tube(d, (-0.7, -2.72, 0.62), (0.7, -2.72, 0.62), 0.045, "chrome")
    d.box((0, 2.55, 1.33), (1.8, 0.08, 0.36), "paint")
    d.box((0, 0.48, 1.36), (1.8, 0.08, 0.42), "paint")
    d.box((0, 1.5, 1.16), (1.78, 2.1, 0.02), "trim")
    d.box((0, -2.6, 0.9), (0.9, 0.05, 0.3), "trim")
    for z in (0.8, 0.9, 1.0):
        d.box((0, -2.63, z), (0.86, 0.02, 0.02), "chrome")
    tube(d, (-0.94, -1.0, 1.2), (-0.94, -0.95, 1.95), 0.055, "trim")
    d.box((0, -0.3, 1.88), (1.2, 0.12, 0.08), "trim")
    for x in (-0.42, -0.14, 0.14, 0.42):
        d.cyl((x, -0.37, 1.88), 0.06, 0.04, "light_front", axis="Y", segs=12)
    d.box((0, -2.66, 0.48), (1.9, 0.14, 0.18), "trim")
    d.box((0, 2.64, 0.5), (1.9, 0.12, 0.16), "chrome")
    d.box((0, -2.7, 0.66), (0.5, 0.02, 0.11), "plate")
    interior(d, -0.1, 1.08, steer_y=-0.7, steer_z=1.3)
    return finish([body, d])


def build_suv(g):
    prof = [(-2.2, 0.84, 0.46, 0.96), (-2.15, 0.92, 0.42, 1.06), (-2.0, 0.95, 0.4, 1.12), (-1.5, 0.96, 0.4, 1.16),
            (-0.8, 0.96, 0.4, 1.18), (0.0, 0.96, 0.4, 1.2), (0.9, 0.96, 0.4, 1.2), (1.7, 0.95, 0.42, 1.2),
            (2.1, 0.93, 0.44, 1.18), (2.2, 0.9, 0.48, 1.16)]
    gprof = [(-1.0, 0.93, 0.83, 1.18, 1.2), (-0.7, 0.92, 0.82, 1.19, 1.86), (-0.3, 0.92, 0.82, 1.2, 1.94),
             (0.6, 0.92, 0.82, 1.2, 1.95), (1.5, 0.92, 0.82, 1.2, 1.95), (2.1, 0.92, 0.82, 1.2, 1.92),
             (2.18, 0.91, 0.82, 1.18, 1.2)]
    body, d = shell(prof, gprof, (1, 5))
    arches(body, g, g.R * 1.2, depth=2.6)
    for y in (g.fy, g.ry):
        for s in (1, -1):
            flare(d, s * 0.95, y, g.R, g.R * 1.2, g.R * 1.4, 0.12, "trim")
    for s in (1, -1):
        d.cyl((s * 0.62, -2.21, 0.92), 0.12, 0.05, "light_front", axis="Y", segs=16)
        d.box((s * 0.84, 2.2, 1.0), (0.14, 0.04, 0.3), "light_rear")
        d.box((s * 0.98, -0.66, 1.48), (0.1, 0.16, 0.12), "trim")
        tube(d, (s * 0.72, -0.5, 2.0), (s * 0.72, 1.9, 2.0), 0.03, "trim")
        d.box((s * 0.99, 0.3, 0.42), (0.14, 1.6, 0.05), "trim")
        tube(d, (s * 0.45, -2.34, 0.5), (s * 0.45, -2.34, 1.02), 0.04, "trim")
    for y in (-0.3, 0.6, 1.5):
        tube(d, (-0.72, y, 2.0), (0.72, y, 2.0), 0.025, "trim")
    tube(d, (-0.45, -2.34, 1.0), (0.45, -2.34, 1.0), 0.04, "trim")
    d.box((0, -2.22, 0.95), (0.8, 0.04, 0.26), "trim")
    d.box((0, -2.28, 0.5), (1.8, 0.12, 0.2), "trim")
    d.box((0, 2.24, 0.52), (1.8, 0.1, 0.18), "trim")
    d.cyl((0, 2.36, 1.1), 0.38, 0.24, "tire", axis="Y", segs=20)
    d.cyl((0, 2.49, 1.1), 0.22, 0.04, "rim", axis="Y", segs=16)
    d.box((0, -2.24, 0.68), (0.5, 0.02, 0.11), "plate")
    interior(d, 0.1, 1.08, steer_y=-0.6, steer_z=1.32)
    return finish([body, d])


def build_super(g):
    prof = [(-2.22, 0.76, 0.22, 0.4), (-2.16, 0.9, 0.16, 0.46), (-1.95, 0.97, 0.15, 0.5), (-1.5, 1.0, 0.15, 0.56),
            (-0.9, 1.0, 0.15, 0.62), (-0.3, 0.97, 0.15, 0.66), (0.4, 0.97, 0.15, 0.7), (1.0, 1.02, 0.15, 0.74),
            (1.6, 1.03, 0.16, 0.76), (2.0, 0.98, 0.2, 0.74), (2.2, 0.88, 0.26, 0.7)]
    gprof = [(-0.9, 0.9, 0.74, 0.62, 0.64), (-0.6, 0.88, 0.7, 0.64, 0.92), (-0.2, 0.86, 0.66, 0.66, 1.06),
             (0.3, 0.85, 0.62, 0.68, 1.08), (0.8, 0.87, 0.6, 0.71, 1.0), (1.3, 0.9, 0.6, 0.73, 0.86),
             (1.7, 0.93, 0.64, 0.75, 0.77)]
    body, d = shell(prof, gprof, (1, 4))
    arches(body, g, g.R * 1.18)
    for s in (1, -1):
        d.box((s * 0.66, -2.15, 0.44), (0.42, 0.05, 0.05), "light_front", rz=s * 0.25)
        d.box((s * 1.0, 0.55, 0.45), (0.04, 0.6, 0.26), "trim")
        d.box((s * 0.95, -0.52, 0.78), (0.08, 0.14, 0.06), "paint")
        d.box((s * 0.66, 2.0, 1.02), (0.05, 0.12, 0.28), "trim")
        d.box((s * 0.98, 2.0, 1.12), (0.02, 0.4, 0.2), "paint")
        for x in (0.22, 0.36):
            d.cyl((s * x, 2.22, 0.3), 0.045, 0.16, "chrome", axis="Y", segs=10)
        d.box((s * 0.98, 0.1, 0.2), (0.04, 2.4, 0.08), "trim")
    d.box((0, 2.2, 0.66), (1.7, 0.04, 0.04), "light_rear")
    d.box((0, 2.0, 1.16), (2.0, 0.42, 0.04), "paint", rx=-0.1)
    d.box((0, -2.18, 0.18), (1.8, 0.3, 0.03), "trim")
    d.box((0, 2.16, 0.24), (1.7, 0.2, 0.12), "trim")
    d.box((0, -2.2, 0.3), (0.8, 0.04, 0.1), "trim")
    d.box((0, 1.2, 0.82), (0.9, 0.9, 0.02), "trim")
    interior(d, 0.4, 0.3, steer_y=-0.25, steer_z=0.56)
    return finish([body, d])


def build_truck(g):
    d = Mesh()
    W = 1.3
    for s in (1, -1):
        d.box((s * 0.55, 0.0, 0.95), (0.14, 7.2, 0.3), "trim")
    # cabine avancée
    cab = [(-3.72, 1.12, 0.95, 2.2), (-3.66, 1.2, 0.9, 2.5), (-3.5, 1.24, 0.9, 2.7), (-2.4, 1.24, 0.9, 2.78),
           (-1.7, 1.24, 0.9, 2.78), (-1.6, 1.2, 0.95, 2.74)]
    m = Mesh()
    loft([body_section(*p, crown=0.02) for p in cab], lambda k, i: "paint", m)
    d.box((0, -3.72, 2.25), (2.1, 0.04, 0.6), "glass")
    for s in (1, -1):
        d.box((s * 1.25, -2.9, 2.25), (0.02, 0.9, 0.55), "glass")
        d.box((s * 0.85, -3.75, 1.22), (0.34, 0.05, 0.18), "light_front")
        d.box((s * 1.34, -3.62, 2.3), (0.06, 0.08, 0.5), "trim")
        d.box((s * 0.9, 3.72, 1.2), (0.3, 0.04, 0.16), "light_rear")
        for y in (g.fy, g.ry):
            d.box((s * 1.1, y, g.R * 2 + 0.12), (0.62, 1.6, 0.06), "trim")
            d.box((s * 1.1, y + 0.8, g.R * 1.3), (0.62, 0.05, 0.9), "trim")
        tube(d, (s * 1.28, -2.2, 0.5), (s * 1.28, -2.3, 1.55), 0.03, "trim")
        tube(d, (s * 1.28, -1.98, 0.5), (s * 1.28, -2.08, 1.55), 0.03, "trim")
    for z in (0.7, 0.95, 1.2, 1.45):
        d.box((1.28, -2.14, z), (0.04, 0.26, 0.03), "trim")
        d.box((-1.28, -2.14, z), (0.04, 0.26, 0.03), "trim")
    d.box((0, -3.86, 0.9), (2.5, 0.24, 0.36), "trim")
    d.box((0, -3.74, 1.55), (1.3, 0.04, 0.5), "trim")
    for z in (1.4, 1.55, 1.7):
        d.box((0, -3.77, z), (1.25, 0.02, 0.04), "chrome")
    d.cyl((0.7, -2.72, 2.86), 0.1, 0.16, "beacon", axis="Z", segs=12)
    d.cyl((-0.7, -2.72, 2.86), 0.1, 0.16, "beacon", axis="Z", segs=12)
    tube(d, (-1.1, -1.5, 1.0), (-1.1, -1.5, 3.1), 0.09, "chrome", segs=12)
    # benne
    x0, y0, y1, zf = W, -1.35, 3.72, 1.3
    d.box((0, (y0 + y1) / 2, zf), (2 * x0, y1 - y0, 0.12), "paint")
    for s in (1, -1):
        d.box((s * (x0 - 0.04), (y0 + y1) / 2, zf + 0.7), (0.1, y1 - y0, 1.4), "paint")
        for y in (-0.6, 0.6, 1.8, 3.0):
            d.box((s * x0, y, zf + 0.7), (0.06, 0.12, 1.4), "trim")
    d.box((0, y0, zf + 1.0), (2 * x0, 0.12, 2.0), "paint")
    d.box((0, y0 - 0.9, zf + 1.95), (2 * x0, 1.9, 0.1), "paint", rx=-0.08)
    d.box((0, y1 - 0.05, zf + 0.6), (2 * x0, 0.1, 1.2), "paint", rx=0.25)
    # chargement de latérite
    heap = bmesh.new()
    top = [Vector((x, y, zf + 1.05 + 0.45 * math.cos(x / 1.3 * 1.4) * math.cos((y - 1.2) / 2.6 * 1.4)))
           for y in np.linspace(y0 + 0.15, y1 - 0.4, 7) for x in np.linspace(-x0 + 0.12, x0 - 0.12, 5)]
    vs = [heap.verts.new(p) for p in top]
    for r in range(6):
        for c in range(4):
            a, b = r * 5 + c, r * 5 + c + 1
            heap.faces.new((vs[a], vs[b], vs[b + 5], vs[a + 5]))
    d._merge(heap, "dirt")
    d.box((0, 3.8, 0.65), (0.5, 0.02, 0.11), "plate")
    interior(d, -2.8, 1.8, w=0.55, steer_y=-3.35, steer_z=2.05)
    return finish([m, d])


def build_kart(g):
    d = Mesh()
    d.box((0, 0, 0.07), (0.86, 1.5, 0.03), "trim")
    for s in (1, -1):
        d.box((s * 0.5, 0.02, 0.15), (0.2, 0.62, 0.14), "paint")
        tube(d, (s * 0.25, -0.75, 0.1), (s * 0.4, -0.35, 0.12), 0.02, "chrome")
    nose = [(-1.02, 0.28, 0.06, 0.16), (-0.96, 0.4, 0.05, 0.22), (-0.8, 0.44, 0.05, 0.25), (-0.62, 0.4, 0.06, 0.24)]
    loft([body_section(*p, crown=0.05) for p in nose], lambda k, i: "paint", d)
    d.box((0, -0.62, 0.28), (0.34, 0.04, 0.24), "plate", rx=0.3)
    d.box((0, 0.78, 0.14), (1.2, 0.1, 0.1), "trim")
    d.box((0, 0.22, 0.24), (0.4, 0.42, 0.06), "interior", rx=0.1)
    d.box((0, 0.44, 0.44), (0.4, 0.08, 0.42), "interior", rx=-0.35)
    d.box((-0.3, 0.42, 0.26), (0.22, 0.26, 0.24), "chrome")
    d.cyl((-0.3, 0.42, 0.42), 0.07, 0.1, "trim", axis="Z", segs=10)
    tube(d, (-0.3, 0.55, 0.22), (-0.42, 0.85, 0.2), 0.03, "chrome")
    tube(d, (0, -0.55, 0.12), (0, -0.3, 0.44), 0.02, "trim")
    ring(d, (0, -0.3, 0.46), 0.14, "trim", tilt=math.radians(-50), thick=0.02)
    driver(d, 0.2, 0.18, lean=0.5, hands=(-0.32, 0.5))
    for s in (1, -1):
        tube(d, (s * 0.12, 0.1, 0.24), (s * 0.13, -0.5, 0.18), 0.06, "suit", segs=6)
    return finish([d])


def build_f1(g):
    d = Mesh()
    mono = [(-2.46, 0.07, 0.13, 0.19), (-2.2, 0.12, 0.11, 0.26), (-1.7, 0.18, 0.1, 0.34), (-1.2, 0.26, 0.08, 0.44),
            (-0.7, 0.32, 0.08, 0.55), (-0.2, 0.36, 0.08, 0.6), (0.3, 0.5, 0.08, 0.62), (0.8, 0.55, 0.08, 0.66),
            (1.3, 0.42, 0.08, 0.62), (1.8, 0.3, 0.1, 0.5), (2.25, 0.2, 0.12, 0.36)]
    loft([body_section(*p, crown=0.04) for p in mono], lambda k, i: "paint", d)
    for s in (1, -1):
        pods = [(-0.2, 0.2, 0.1, 0.36), (0.1, 0.24, 0.09, 0.44), (0.9, 0.22, 0.09, 0.4), (1.5, 0.12, 0.1, 0.26)]
        sec = []
        for y, w, zb, zt in pods:
            sec.append([Vector((s * 0.45 + p.x, p.y, p.z)) for p in body_section(y, w, zb, zt, crown=0.02)])
        loft(sec, lambda k, i: "paint", d)
        d.box((s * 0.45, -0.22, 0.25), (0.3, 0.04, 0.22), "trim")
        d.box((s * 0.95, -2.3, 0.18), (0.03, 0.42, 0.22), "paint")
        d.box((s * 0.57, 2.28, 0.82), (0.03, 0.5, 0.5), "paint")
        d.box((s * 0.36, -0.32, 0.64), (0.1, 0.06, 0.05), "trim")
        for y, wy in ((g.fy, -0.05), (g.ry, 0.05)):
            tube(d, (s * 0.25, y + wy - 0.18, 0.18), (s * (g.T - 0.12), y, g.R - 0.02), 0.022, "trim", segs=6)
            tube(d, (s * 0.25, y + wy + 0.18, 0.32), (s * (g.T - 0.12), y, g.R + 0.08), 0.022, "trim", segs=6)
    d.box((0, -2.35, 0.1), (1.94, 0.36, 0.03), "trim")
    d.box((0, -2.2, 0.17), (1.86, 0.2, 0.03), "paint", rx=0.25)
    d.box((0, 2.28, 0.95), (1.12, 0.34, 0.04), "trim")
    d.box((0, 2.2, 1.05), (1.1, 0.2, 0.03), "paint", rx=-0.3)
    d.box((0, 2.2, 0.72), (0.06, 0.14, 0.5), "trim")
    d.box((0, 1.0, 0.76), (0.03, 1.3, 0.3), "paint")
    d.box((0, 2.3, 0.2), (1.0, 0.3, 0.1), "trim")
    d.box((0, 2.42, 0.28), (0.1, 0.04, 0.08), "light_rear")
    tube(d, (0, -0.62, 0.6), (0, -0.48, 0.86), 0.025, "trim")
    for s in (1, -1):
        tube(d, (0, -0.48, 0.86), (s * 0.28, -0.2, 0.84), 0.025, "trim")
        tube(d, (s * 0.28, -0.2, 0.84), (s * 0.3, 0.3, 0.66), 0.025, "trim")
    driver(d, 0.1, 0.18, lean=0.7, hands=(-0.35, 0.48))
    d.box((0, -0.4, 0.62), (0.3, 0.1, 0.06), "trim")
    return finish([d])


def build_buggy(g):
    d = Mesh()
    d.box((0, 0.05, 0.36), (1.3, 2.3, 0.05), "trim")
    nose = [(-1.6, 0.5, 0.42, 0.55), (-1.4, 0.62, 0.38, 0.66), (-1.0, 0.66, 0.36, 0.7), (-0.7, 0.66, 0.36, 0.64)]
    loft([body_section(*p, crown=0.04) for p in nose], lambda k, i: "paint", d)
    r = 0.035
    fl, fr = (0.6, -0.6, 0.4), (-0.6, -0.6, 0.4)
    rl, rr = (0.6, 0.8, 0.4), (-0.6, 0.8, 0.4)
    tl, tr = (0.52, -0.3, 1.48), (-0.52, -0.3, 1.48)
    bl, br = (0.52, 0.72, 1.44), (-0.52, 0.72, 1.44)
    for a, b in ((fl, tl), (fr, tr), (rl, bl), (rr, br), (tl, tr), (bl, br), (tl, bl), (tr, br),
                 (fl, (0.42, -1.55, 0.55)), (fr, (-0.42, -1.55, 0.55)), ((0.42, -1.55, 0.55), (-0.42, -1.55, 0.55)),
                 (tl, (0.44, -1.0, 0.72)), (tr, (-0.44, -1.0, 0.72)), (rl, (0.4, 1.4, 0.55)), (rr, (-0.4, 1.4, 0.55)),
                 (bl, (0.4, 1.4, 0.55)), (br, (-0.4, 1.4, 0.55)), ((0.4, 1.4, 0.55), (-0.4, 1.4, 0.55)),
                 (fl, rl), (fr, rr), (tl, br)):
        tube(d, a, b, r, "paint")
    for s in (1, -1):
        tube(d, (s * 0.55, -0.4, 1.1), (s * (g.T - 0.1), g.fy, g.R + 0.1), 0.03, "chrome")
        tube(d, (s * 0.5, 0.75, 1.1), (s * (g.T - 0.1), g.ry, g.R + 0.1), 0.03, "chrome")
        tube(d, (s * 0.7, -0.5, 0.45), (s * 0.7, 0.6, 0.45), 0.03, "trim")
    d.box((0, 0.2, 1.5), (1.0, 0.9, 0.03), "trim")
    d.box((0, -0.34, 1.52), (0.9, 0.08, 0.08), "trim")
    for x in (-0.33, -0.11, 0.11, 0.33):
        d.cyl((x, -0.39, 1.52), 0.05, 0.04, "light_front", axis="Y", segs=12)
    lights_round(d, (-0.36, 0.36), -1.62, 0.56, 0.08)
    d.box((0, 1.05, 0.62), (0.7, 0.55, 0.42), "trim")
    for s in (1, -1):
        tube(d, (s * 0.2, 1.3, 0.62), (s * 0.24, 1.62, 0.8), 0.04, "chrome")
        d.box((s * 0.3, 0.1, 0.52), (0.44, 0.46, 0.14), "interior")
        d.box((s * 0.3, 0.34, 0.85), (0.44, 0.1, 0.6), "interior", rx=-0.15)
    d.cyl((0, 1.55, 0.95), 0.34, 0.22, "tire", axis="Y", segs=18)
    d.cyl((0, 1.67, 0.95), 0.2, 0.04, "rim", axis="Y", segs=14)
    d.box((0, -1.64, 0.44), (0.4, 0.02, 0.1), "plate")
    tube(d, (0.3, -0.7, 0.45), (0.3, -0.4, 0.82), 0.02, "trim")
    ring(d, (0.3, -0.38, 0.84), 0.15, "trim", tilt=math.radians(-60), thick=0.02)
    driver(d, 0.08, 0.5, lean=0.25, hands=(-0.4, 0.82), x=0.3)
    return finish([d])


def build_bike(g, kind):
    """Moto : cadre, fourche, réservoir, selle, moteur, échappement, pilote. `kind` :
    trail (route et piste, phare rond), mx (motocross, plaques de course, garde-boue
    haut), sport (carénage intégral, bulle, pilote couché)."""
    d = Mesh()
    R, fy, ry = g.R, g.fy, g.ry
    head = Vector((0, fy + (0.3 if kind == "sport" else 0.26), R + (0.62 if kind == "sport" else 0.72)))
    # fourche et guidon
    for s in (1, -1):
        tube(d, (s * 0.085, fy, R), (s * 0.075, head.y, head.z), 0.028, "chrome")
    bar_z = head.z + (0.02 if kind == "sport" else 0.14)
    bar_y = head.y + (0.12 if kind == "sport" else 0.04)
    bar_w = 0.3 if kind == "sport" else 0.4
    tube(d, (-bar_w, bar_y, bar_z), (bar_w, bar_y, bar_z), 0.018, "trim")
    for s in (1, -1):
        d.cyl((s * (bar_w + 0.02), bar_y, bar_z), 0.024, 0.1, "tire", axis="X", segs=8)
    # cadre, bras oscillant, moteur
    tube(d, head, (0, 0.05, R + 0.3), 0.04, "trim")
    tube(d, (0, 0.05, R + 0.3), (0, 0.25, R - 0.05), 0.035, "trim")
    for s in (1, -1):
        tube(d, (s * 0.09, 0.2, R - 0.02), (s * 0.09, ry, R), 0.03, "trim", segs=6)
        tube(d, (s * 0.06, 0.2, R + 0.34), (s * 0.08, ry - 0.2, R + 0.38), 0.02, "trim", segs=6)
    d.box((0, -0.12, R * 0.82), (0.26, 0.44, 0.34), "trim")
    for s in (1, -1):
        d.cyl((s * 0.16, -0.2, R * 0.82 + 0.08), 0.1, 0.1, "chrome", axis="X", segs=12)
    d.box((0, -0.12, R * 0.82 + 0.2), (0.22, 0.3, 0.08), "chrome")
    # échappement
    tube(d, (-0.1, -0.3, R * 0.6), (-0.16, 0.25, R * 0.55), 0.035, "chrome")
    tube(d, (-0.16, 0.25, R * 0.55), (-0.17, ry - 0.1, R + (0.35 if kind == "mx" else 0.12)), 0.05, "chrome")
    # réservoir, selle, arrière
    tank = [(head.y + 0.08, 0.13, R + 0.36, R + 0.58), (-0.2, 0.16, R + 0.34, R + 0.6), (0.05, 0.14, R + 0.36, R + 0.54)]
    loft([body_section(*p, crown=0.04) for p in tank], lambda k, i: "paint", d)
    seat_z = R + (0.5 if kind == "sport" else 0.56)
    d.box((0, 0.3, seat_z), (0.24, 0.6, 0.08), "interior")
    tail = [(0.1, 0.14, seat_z - 0.14, seat_z - 0.02), (0.5, 0.13, seat_z - 0.1, seat_z), (ry - 0.05, 0.08, seat_z, seat_z + 0.06)]
    loft([body_section(*p, crown=0.03) for p in tail], lambda k, i: "paint", d)
    d.box((0, ry - 0.02, seat_z + 0.02), (0.12, 0.04, 0.05), "light_rear")
    # garde-boue
    if kind == "mx":
        fender = [(fy - 0.34, 0.06, R + 0.5, R + 0.53), (fy - 0.1, 0.1, R + 0.56, R + 0.6), (fy + 0.12, 0.09, R + 0.6, R + 0.64)]
        loft([body_section(*p, crown=0.01) for p in fender], lambda k, i: "paint", d)
        d.box((0, ry + 0.1, seat_z + 0.02), (0.16, 0.55, 0.03), "paint", rx=0.3)
        d.box((0, head.y - 0.1, head.z - 0.05), (0.28, 0.03, 0.22), "livery", rx=-0.3)
        for s in (1, -1):
            d.box((s * 0.15, 0.35, seat_z - 0.14), (0.02, 0.36, 0.22), "livery")
    else:
        flare(d, 0.06, fy, R, R * 1.08, R * 1.2, 0.12, "paint", a0=0.3, a1=math.pi - 0.9)
        flare(d, 0.06, ry, R, R * 1.1, R * 1.22, 0.12, "paint", a0=0.9, a1=math.pi - 0.3)
    if kind == "trail":
        lights_round(d, (0,), head.y - 0.14, head.z - 0.04, 0.08)
        for s in (1, -1):
            d.box((s * 0.36, bar_y - 0.08, bar_z), (0.08, 0.14, 0.1), "trim")
        d.box((0, head.y - 0.1, head.z + 0.14), (0.26, 0.04, 0.2), "glass", rx=-0.4)
    if kind == "sport":
        fair = [(fy - 0.22, 0.08, R + 0.28, R + 0.42), (fy - 0.05, 0.2, R + 0.12, R + 0.58), (fy + 0.3, 0.24, R - 0.02, R + 0.62),
                (fy + 0.6, 0.22, R - 0.06, R + 0.5), (-0.05, 0.18, R - 0.08, R + 0.32)]
        loft([body_section(*p, crown=0.05) for p in fair], lambda k, i: "paint", d)
        d.box((0, fy + 0.02, R + 0.66), (0.3, 0.26, 0.03), "glass", rx=-0.6)
        for s in (1, -1):
            d.box((s * 0.09, fy - 0.2, R + 0.36), (0.08, 0.03, 0.05), "light_front")
    # pilote
    lean = {"trail": 0.45, "mx": 0.55, "sport": 1.05}[kind]
    hip = Vector((0, 0.32, seat_z + 0.1))
    shoulder = hip + Vector((0, -0.5 * math.sin(lean), 0.5 * math.cos(lean)))
    d.box(((hip + shoulder) / 2), (0.36, 0.22, 0.56), "suit", rx=lean)
    helmet = shoulder + Vector((0, -0.12, 0.16))
    sphere(d, helmet, 0.14, "helmet")
    d.box((0, helmet.y - 0.12, helmet.z), (0.18, 0.04, 0.07), "glass", rx=-0.3)
    for s in (1, -1):
        tube(d, shoulder + Vector((s * 0.18, 0, -0.04)), (s * (bar_w - 0.05), bar_y, bar_z), 0.045, "suit", segs=6)
        knee = Vector((s * 0.2, hip.y - 0.36, seat_z - 0.05))
        foot = Vector((s * 0.17, hip.y - 0.1, R * 0.7))
        tube(d, hip + Vector((s * 0.12, 0, 0)), knee, 0.065, "suit", segs=6)
        tube(d, knee, foot, 0.055, "suit", segs=6)
        d.box(foot + Vector((0, -0.08, -0.02)), (0.1, 0.22, 0.08), "trim")
    return finish([d])


BUILDERS = {
    "sport": build_sport, "rally": build_rally, "pickup": build_pickup, "suv": build_suv,
    "super": build_super, "truck": build_truck, "kart": build_kart, "f1": build_f1, "buggy": build_buggy,
    "trail": lambda g: build_bike(g, "trail"), "mx": lambda g: build_bike(g, "mx"),
    "sportbike": lambda g: build_bike(g, "sport"),
}

# roues : largeur (m), jante (part du rayon), crampons
WHEELS = {
    "sport": (0.26, 0.68, False), "rally": (0.24, 0.62, False), "pickup": (0.3, 0.55, True),
    "suv": (0.28, 0.56, True), "super": (0.3, 0.7, False), "truck": (0.5, 0.52, True),
    "kart": (0.2, 0.55, False), "f1": (0.36, 0.55, False), "buggy": (0.3, 0.52, True),
    "trail": (0.13, 0.62, True), "mx": (0.12, 0.66, True), "sportbike": (0.18, 0.62, False),
    "starter": (0.23, 0.64, False),
}


def build_wheel(R, W, rim_k, knobs):
    """Une roue à l'origine, axe le long de X, face extérieure vers +X."""
    m = Mesh()
    segs = 28
    rim = R * rim_k
    prof = [(rim, -W / 2), (R * 0.9, -W / 2 - 0.004), (R * 0.985, -W / 2 + W * 0.1), (R, -W / 2 + W * 0.22),
            (R, W / 2 - W * 0.22), (R * 0.985, W / 2 - W * 0.1), (R * 0.9, W / 2 + 0.004), (rim, W / 2)]
    rings = [[m.bm.verts.new((x, r * math.cos(a / segs * math.tau), r * math.sin(a / segs * math.tau)))
              for a in range(segs)] for r, x in prof]
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            f = m.bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            f.material_index = m.mat("tire")
    if knobs:
        for i in range(18):
            a = i / 18 * math.tau
            for x in (-W * 0.24, W * 0.24):
                c = Vector((x + (0.03 if i % 2 else -0.03), R * math.cos(a), R * math.sin(a)))
                tmp = bmesh.new()
                bmesh.ops.create_cube(tmp, size=1.0)
                for v in tmp.verts:
                    p = Vector((v.co.x * W * 0.38, v.co.y * R * 0.16, v.co.z * R * 0.1))
                    p.rotate(Euler((a + math.pi / 2, 0, 0)))
                    v.co = p + c
                m._merge(tmp, "tire")
    m.cyl((-0.01, 0, 0), rim * 1.01, W * 0.6, "rim", axis="X", segs=segs)
    m.cyl((W * 0.28, 0, 0), rim * 0.94, 0.01, "trim", axis="X", segs=segs)
    for k in range(5 if not knobs else 6):
        a = k / (5 if not knobs else 6) * math.tau
        c = Vector((W * 0.33, rim * 0.5 * math.cos(a), rim * 0.5 * math.sin(a)))
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        for v in tmp.verts:
            p = Vector((v.co.x * 0.03, v.co.y * rim * 0.9, v.co.z * rim * 0.26))
            p.rotate(Euler((a, 0, 0)))
            v.co = p + c
        m._merge(tmp, "rim")
    m.cyl((W * 0.4, 0, 0), rim * 0.24, 0.03, "chrome", axis="X", segs=12)
    m.cyl((-W * 0.12, 0, 0), rim * 0.8, 0.02, "disc", axis="X", segs=24)
    m.box((-W * 0.05, 0.0, rim * 0.7), (0.05, rim * 0.5, rim * 0.33), "caliper")
    return m.obj("wheel", smooth_angle=30)


def place_wheels(g, wheel):
    ws = []
    for y in (g.fy, g.ry):
        for s in ((0,) if g.bike else (1, -1)):
            w = wheel.copy()
            w.location = (s * g.T if s else 0, y, g.R)
            w.rotation_euler = (0, 0, 0 if s > 0 else math.pi)
            bpy.context.scene.collection.objects.link(w)
            ws.append(w)
    return ws


def bake_shadow(vid, g, wheels):
    """Occlusion ambiante sous le véhicule, plan de la taille de l'ombre du client."""
    use_gpu()
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.001))
    plane = bpy.context.active_object
    plane.scale = (2 * g.hx + 1.0, 2 * g.hz + 1.16, 1)
    bpy.ops.object.transform_apply(scale=True)
    size_x, size_y = 128, 256
    img = bpy.data.images.new("shadow", size_x, size_y, alpha=False, float_buffer=True)
    mat = bpy.data.materials.new("shadow_bake")
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.nodes.active = tex
    plane.data.materials.append(mat)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 256
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.light_settings.distance = 1.6 * max(1.0, g.R / 0.33)
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type="AO", margin=2)
    px = np.empty(size_x * size_y * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    ao = px.reshape(size_y, size_x, 4)[:, :, 0]
    yy, xx = np.mgrid[0:size_y, 0:size_x]
    edge = np.minimum(np.minimum(xx, size_x - 1 - xx) / (size_x * 0.12), np.minimum(yy, size_y - 1 - yy) / (size_y * 0.08))
    ao = 1 - (1 - ao) * np.clip(edge, 0, 1)
    # pas de renforcement : l'occlusion telle quelle, son bord doux compris (le client
    # l'affiche à 55 %, posée au sol)
    shadow = np.clip(1 - ao, 0, 1)
    out = bpy.data.images.new("shadow_out", size_x, size_y, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(np.stack([shadow, shadow, shadow, np.ones_like(shadow)], axis=2).astype(np.float32).ravel())
    out.filepath_raw = os.path.join(OUT, f"{vid}_shadow.png")
    out.file_format = "PNG"
    out.save()
    bpy.data.objects.remove(plane)


def thumbnail(vid, g, body):
    """Vignette du garage : trois quarts avant, fond transparent, peinture de départ,
    cadrée sur l'encombrement du modèle."""
    use_gpu()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(42), 0, math.radians(140))
    sc.collection.objects.link(so)
    world = bpy.data.worlds.new("wt")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.7, 0.95, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sc.world = world
    corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
    top = max(max(c.z for c in corners), g.R * 2)
    size = max(2 * g.hz, 2.6, top * 1.8)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    co = bpy.data.objects.new("cam", cam)
    aim = Vector((0, 0, top * 0.42))
    co.location = aim + Vector((size * 1.05, -size * 1.2, size * 0.42))
    co.rotation_euler = (aim - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 640, 400
    sc.cycles.samples = 64
    sc.view_settings.view_transform = "AgX"
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.quality = 88
    sc.render.filepath = os.path.join(OUT, f"{vid}.webp")
    bpy.ops.render.render(write_still=True)


def export(vid, body, wheel):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    wheel.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{vid}.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_normals=True, export_materials="EXPORT", export_yup=True,
        export_texcoords=False, export_vertex_color="NONE")


def main():
    only = A["only"].split(",") if "only" in A else list(BUILDERS)
    thumbs = A.get("thumbs") == "1"
    for vid in only:
        reset()
        g = G(vid)
        if vid == "starter":
            body = car.build_body()
            wheel = car.build_wheel()
        else:
            body = BUILDERS[vid](g)
            wheel = build_wheel(g.R, *WHEELS[vid])
        if vid != "starter":
            export(vid, body, wheel)
        ws = place_wheels(g, wheel)
        if vid != "starter":
            bake_shadow(vid, g, ws)
        if thumbs:
            bpy.data.objects.remove(wheel)
            thumbnail(vid, g, body)
        print(f"[veh] {vid} ok")


main()
