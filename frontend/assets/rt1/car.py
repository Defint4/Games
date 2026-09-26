"""Voiture de départ : petite citadine à hayon, modélisée par sections.

blender -b -P car.py -- --out <dossier> [--preview image.png]

Sorties : starter.glb (objets `body` et `wheel`, matières nommées que le client
remplace), starter_shadow.png (ombre de contact cuite, vue de dessus).
Repère Blender : l'avant vers -Y, la gauche vers +X, le sol à z = 0.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import args, reset, srgb, use_gpu  # noqa: E402

A = args()
OUT = os.path.abspath(A.get("out", "out"))
os.makedirs(OUT, exist_ok=True)

WHEEL_R = 0.33
WHEEL_W = 0.23
TRACK = 0.76
FRONT_Y = -1.24
REAR_Y = 1.20

MATS = {
    "paint": ("#E8552B", 0.35, 0.0),
    "trim": ("#1E2126", 0.6, 0.0),
    "glass": ("#1A2630", 0.08, 0.0),
    "chrome": ("#D9DDE2", 0.15, 1.0),
    "light_front": ("#FFF6DE", 0.1, 0.0),
    "light_rear": ("#C8161E", 0.2, 0.0),
    "interior": ("#3A3D42", 0.8, 0.0),
    "plate": ("#F2F2EC", 0.5, 0.0),
    "tire": ("#17181B", 0.85, 0.0),
    "rim": ("#C9CDD3", 0.3, 1.0),
    "caliper": ("#D8392B", 0.4, 0.0),
    "disc": ("#6E7076", 0.4, 1.0),
}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    hexc, rough, metal = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(hexc)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if name.startswith("light"):
        bsdf.inputs["Emission Color"].default_value = srgb(hexc)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return m


class Mesh:
    """bmesh avec une matière par face, par noms."""

    def __init__(self):
        self.bm = bmesh.new()
        self.names: list[str] = []

    def mat(self, name):
        if name not in self.names:
            self.names.append(name)
        return self.names.index(name)

    def face(self, pts, name):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.mat(name)
        return f

    def box(self, c, s, name, rx=0.0, rz=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        for v in tmp.verts:
            p = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
            if rx:
                p.rotate(__import__("mathutils").Euler((rx, 0, 0)))
            if rz:
                p.rotate(__import__("mathutils").Euler((0, 0, rz)))
            v.co = p + Vector(c)
        self._merge(tmp, name)

    def cyl(self, c, r, depth, name, axis="X", segs=16, r2=None):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
        from mathutils import Euler
        for v in tmp.verts:
            p = v.co.copy()
            p.rotate(Euler(rot))
            v.co = p + Vector(c)
        self._merge(tmp, name)

    def _merge(self, tmp, name):
        idx = self.mat(name)
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(v.co)
        for f in tmp.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = idx
        tmp.free()

    def obj(self, name, smooth_angle=35):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for n in self.names:
            me.materials.append(material(n))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        return ob


def loft(sections, name_fn, mesh):
    """Relie des sections (listes de points de même taille) ; ferme les bouts."""
    rings = [[mesh.bm.verts.new(p) for p in s] for s in sections]
    n = len(sections[0])
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = mesh.bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            f.material_index = mesh.mat(name_fn(k, i))
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        f = mesh.bm.faces.new(list(reversed(ring)) if rev else ring)
        f.material_index = mesh.mat(name_fn(-1, -1))


def body_section(y, w, zb, zt, crown=0.03):
    H = zt - zb
    half = [
        (0.0, zb),
        (0.78 * w, zb),
        (0.93 * w, zb + 0.06),
        (1.0 * w, zb + 0.24 * H),
        (1.0 * w, zb + 0.6 * H),
        (0.975 * w, zb + 0.86 * H),
        (0.9 * w, zt),
        (0.45 * w, zt + crown * 0.8),
    ]
    right = [(-x, z) for x, z in reversed(half[1:])]
    pts = half + [(0.0, zt + crown)] + right
    return [Vector((x, y, z)) for x, z in pts]


def build_body():
    m = Mesh()
    # (y, demi-largeur, bas, ligne de caisse)
    prof = [(-1.96, 0.70, 0.30, 0.60), (-1.93, 0.79, 0.24, 0.70), (-1.84, 0.84, 0.21, 0.78),
            (-1.6, 0.86, 0.2, 0.83), (-1.2, 0.865, 0.2, 0.87), (-0.85, 0.865, 0.2, 0.92),
            (-0.3, 0.865, 0.2, 0.935), (0.4, 0.865, 0.2, 0.945), (1.1, 0.86, 0.2, 0.95),
            (1.6, 0.85, 0.21, 0.95), (1.86, 0.82, 0.25, 0.93), (1.95, 0.77, 0.31, 0.89)]
    sections = [body_section(*p) for p in prof]
    loft(sections, lambda k, i: "paint", m)
    body = m.obj("body_shell", smooth_angle=40)

    # passages de roue : soustraction de cylindres
    cm = Mesh()
    for y in (FRONT_Y, REAR_Y):
        cm.cyl((0, y, WHEEL_R), 0.405, 2.2, "trim", axis="X", segs=28)
    cutter = cm.obj("cutter")
    mod = body.modifiers.new("arches", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="arches")
    bpy.data.objects.remove(cutter)

    # habitacle vitré
    g = Mesh()
    gprof = [(-0.9, 0.84, 0.70, 0.93, 0.95), (-0.55, 0.83, 0.70, 0.93, 1.18), (-0.25, 0.82, 0.69, 0.935, 1.39),
             (0.2, 0.82, 0.68, 0.945, 1.43), (0.9, 0.82, 0.68, 0.95, 1.42), (1.2, 0.81, 0.68, 0.95, 1.36),
             (1.4, 0.8, 0.66, 0.95, 1.2), (1.55, 0.79, 0.64, 0.95, 0.99)]
    gsec = []
    for y, wb, wt, zb, zt in gprof:
        gsec.append([Vector(p) for p in (
            (0, y, zb), (wb, y, zb), (wb * 0.99, y, zb + (zt - zb) * 0.5), (wt, y, zt - 0.03), (wt * 0.6, y, zt),
            (0, y, zt + 0.01), (-wt * 0.6, y, zt), (-wt, y, zt - 0.03), (-wb * 0.99, y, zb + (zt - zb) * 0.5), (-wb, y, zb))])
    # le toit (faces du haut entre les sections 2 et 6) est peint, le reste vitré
    loft(gsec, lambda k, i: "paint" if (2 <= k <= 5 and i in (3, 4, 5, 6)) else ("glass" if k >= 0 else "glass"), g)
    # garnitures et détails
    for s in (1, -1):
        # optiques avant, cerclage
        g.box((s * 0.47, -1.935, 0.635), (0.28, 0.06, 0.13), "light_front")
        g.box((s * 0.47, -1.925, 0.635), (0.31, 0.05, 0.16), "chrome")
        # feux arrière
        g.box((s * 0.66, 1.935, 0.78), (0.26, 0.05, 0.2), "light_rear")
        # rétroviseurs
        g.box((s * 0.925, -0.74, 1.0), (0.09, 0.15, 0.085), "paint")
        g.box((s * 0.875, -0.74, 0.97), (0.06, 0.05, 0.03), "trim")
        # bas de caisse, joints de portière, poignées
        g.box((s * 0.862, 0.05, 0.27), (0.02, 1.5, 0.1), "trim")
        g.box((s * 0.87, -0.52, 0.62), (0.012, 0.012, 0.55), "trim")
        g.box((s * 0.868, 0.58, 0.62), (0.012, 0.012, 0.55), "trim")
        g.box((s * 0.875, 0.42, 0.8), (0.02, 0.14, 0.035), "chrome")
        # antibrouillards
        g.box((s * 0.55, -1.95, 0.36), (0.14, 0.04, 0.06), "light_front")
    # calandre
    g.box((0, -1.93, 0.6), (0.62, 0.06, 0.16), "trim")
    for z in (0.56, 0.6, 0.64):
        g.box((0, -1.955, z), (0.58, 0.02, 0.012), "chrome")
    # boucliers
    g.box((0, -1.94, 0.34), (1.4, 0.1, 0.16), "trim")
    g.box((0, 1.93, 0.4), (1.5, 0.1, 0.2), "trim")
    # plaques
    g.box((0, -1.99, 0.42), (0.5, 0.02, 0.11), "plate")
    g.box((0, 1.985, 0.6), (0.5, 0.02, 0.11), "plate")
    # becquet de hayon
    g.box((0, 1.22, 1.37), (1.25, 0.28, 0.045), "paint", rx=-0.1)
    # échappement
    g.cyl((-0.45, 1.93, 0.28), 0.045, 0.2, "chrome", axis="Y", segs=10)
    # intérieur (vu en 1re personne) : planche de bord, volant, sièges, pavillon
    g.box((0, -0.62, 0.9), (1.56, 0.4, 0.14), "interior", rx=0.25)
    g.box((0, -0.5, 0.78), (1.5, 0.3, 0.3), "interior")
    g.box((0, 0.35, 1.34), (1.3, 1.0, 0.02), "interior")
    for s in (1, -1):
        g.box((s * 0.36, 0.32, 0.72), (0.5, 0.5, 0.14), "interior")
        g.box((s * 0.36, 0.55, 1.0), (0.5, 0.12, 0.6), "interior", rx=-0.15)
    wheel = bmesh.new()
    bmesh.ops.create_circle(wheel, segments=20, radius=0.17)
    from mathutils import Euler
    for v in wheel.verts:
        p = v.co.copy()
        p.rotate(Euler((math.radians(-62), 0, 0)))
        v.co = p + Vector((0.36, -0.44, 0.88))
    ring = list(wheel.verts)
    geom = bmesh.ops.extrude_edge_only(wheel, edges=list(wheel.edges))
    for v in [e for e in geom["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co = v.co + (v.co - Vector((0.36, -0.44, 0.88))) * 0.18
    del ring
    for f in wheel.faces:
        f.material_index = 0
    g._merge(wheel, "trim")
    g.box((0.36, -0.48, 0.82), (0.06, 0.2, 0.14), "trim", rx=math.radians(-62))
    glass = g.obj("body_details", smooth_angle=30)

    # tout dans un seul objet
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    glass.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "body"
    return body


def build_wheel():
    """Une roue à l'origine, axe le long de X, face extérieure vers +X."""
    m = Mesh()
    segs = 28
    # pneu : profil tourné (rayon, x)
    prof = [(0.21, -WHEEL_W / 2), (0.3, -WHEEL_W / 2 - 0.004), (0.325, -WHEEL_W / 2 + 0.025), (WHEEL_R, -WHEEL_W / 2 + 0.05),
            (WHEEL_R, WHEEL_W / 2 - 0.05), (0.325, WHEEL_W / 2 - 0.025), (0.3, WHEEL_W / 2 + 0.004), (0.21, WHEEL_W / 2)]
    rings = []
    for r, x in prof:
        rings.append([m.bm.verts.new((x, r * math.cos(a / segs * math.tau), r * math.sin(a / segs * math.tau))) for a in range(segs)])
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            f = m.bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            f.material_index = m.mat("tire")
    # jante : voile creusé + 5 branches + moyeu
    m.cyl((-0.01, 0, 0), 0.212, 0.14, "rim", axis="X", segs=segs)
    m.cyl((0.062, 0, 0), 0.2, 0.01, "trim", axis="X", segs=segs)
    for k in range(5):
        a = k / 5 * math.tau
        c = Vector((0.085, 0.105 * math.cos(a), 0.105 * math.sin(a)))
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        from mathutils import Euler
        for v in tmp.verts:
            p = Vector((v.co.x * 0.03, v.co.y * 0.19, v.co.z * 0.055))
            p.rotate(Euler((a, 0, 0)))
            v.co = p + c
        m._merge(tmp, "rim")
    m.cyl((0.1, 0, 0), 0.05, 0.03, "chrome", axis="X", segs=12)
    # disque et étrier (derrière la jante)
    m.cyl((-0.03, 0, 0), 0.17, 0.02, "disc", axis="X", segs=24)
    m.box((-0.0, 0.0, 0.15), (0.05, 0.1, 0.07), "caliper")
    return m.obj("wheel", smooth_angle=30)


def bake_shadow(body, wheels):
    """Occlusion ambiante sur un plan sous la voiture → ombre de contact."""
    use_gpu()
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.001))
    plane = bpy.context.active_object
    plane.scale = (2.6, 5.0, 1)
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
    sc.cycles.samples = 256
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.light_settings.distance = 1.6
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type="AO", margin=2)
    px = np.empty(size_x * size_y * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size_y, size_x, 4)
    ao = px[:, :, 0]
    # bords du plan : fondu vers 1 pour ne pas voir le rectangle
    yy, xx = np.mgrid[0:size_y, 0:size_x]
    edge = np.minimum(np.minimum(xx, size_x - 1 - xx) / (size_x * 0.12), np.minimum(yy, size_y - 1 - yy) / (size_y * 0.08))
    ao = 1 - (1 - ao) * np.clip(edge, 0, 1)
    shadow = np.clip((1 - ao) * 1.25, 0, 1)
    out = bpy.data.images.new("shadow_out", size_x, size_y, alpha=False)
    rgba = np.stack([shadow, shadow, shadow, np.ones_like(shadow)], axis=2).astype(np.float32)
    out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = os.path.join(OUT, "starter_shadow.png")
    out.file_format = "PNG"
    out.save()
    bpy.data.objects.remove(plane)
    for w in wheels:
        bpy.data.objects.remove(w)


def preview(body, wheel, path):
    use_gpu()
    sc = bpy.context.scene
    for y in (FRONT_Y, REAR_Y):
        for s in (1, -1):
            w = wheel.copy()
            w.location = (s * TRACK, y, WHEEL_R)
            w.rotation_euler = (0, 0, 0 if s > 0 else math.pi)
            sc.collection.objects.link(w)
    bpy.ops.mesh.primitive_plane_add(size=40)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(40), 0, math.radians(150))
    sc.collection.objects.link(so)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.65, 0.9, 1)
    sc.world = world
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    co = bpy.data.objects.new("cam", cam)
    co.location = (4.6, -5.2, 2.2)
    co.rotation_euler = (Vector((0, 0, 0.6)) - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 900, 600
    sc.cycles.samples = 64
    sc.view_settings.view_transform = "AgX"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    reset()
    body = build_body()
    wheel = build_wheel()
    if "preview" in A:
        preview(body, wheel, A["preview"])
        return
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    wheel.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, "starter.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_normals=True, export_materials="EXPORT", export_yup=True,
        export_texcoords=False, export_vertex_color="NONE")
    # ombre : quatre roues posées pour la cuisson
    ws = []
    for y in (FRONT_Y, REAR_Y):
        for s in (1, -1):
            w = wheel.copy()
            w.location = (s * TRACK, y, WHEEL_R)
            bpy.context.scene.collection.objects.link(w)
            ws.append(w)
    bake_shadow(body, ws)


main()
