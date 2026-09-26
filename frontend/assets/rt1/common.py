"""Outils partagés par les scripts Blender de RT1 (lancés par build.sh, Blender 4.5)."""

import math
import sys

import bmesh
import bpy
from mathutils import Vector


def args() -> dict[str, str]:
    """Arguments passés après `--` : --cle valeur."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out: dict[str, str] = {}
    for i in range(0, len(argv) - 1, 2):
        out[argv[i].lstrip("-")] = argv[i + 1]
    return out


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hex_color: str) -> tuple[float, float, float, float]:
    """Couleur hexadécimale sRGB → linéaire (les attributs de couleur flottants sont linéaires)."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def shade(color: tuple, k: float) -> tuple:
    return (color[0] * k, color[1] * k, color[2] * k, 1.0)


def mix(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)


def smoothstep(e0: float, e1: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Builder:
    """Accumule des faces colorées (couleur par face, sommets non partagés entre couleurs)
    puis produit un objet maillé. Deux jeux d'UV optionnels : `uv` (matière) et `lm`
    (carte de lumière)."""

    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.lm = self.bm.loops.layers.uv.new("Lightmap")

    def face(self, pts, color, uvs=None, lms=None, flip=False):
        pts = list(pts)
        if flip:
            pts.reverse()
            uvs = list(reversed(uvs)) if uvs else None
            lms = list(reversed(lms)) if lms else None
        verts = [self.bm.verts.new(p) for p in pts]
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        for i, loop in enumerate(f.loops):
            loop[self.col] = color
            if uvs:
                loop[self.uv].uv = uvs[i]
            if lms:
                loop[self.lm].uv = lms[i]
        return f

    def quad(self, a, b, c, d, color, uvs=None, lms=None):
        return self.face((a, b, c, d), color, uvs, lms)

    def box(self, center, size, color, rot_z=0.0, colors=None):
        """Boîte alignée (rotation autour de Z). `colors` : dict face→couleur
        (top, bottom, front(-y), back(+y), left(-x), right(+x))."""
        cx, cy, cz = center
        sx, sy, sz = (s / 2 for s in size)
        c, s = math.cos(rot_z), math.sin(rot_z)

        def P(x, y, z):
            return Vector((cx + x * c - y * s, cy + x * s + y * c, cz + z))

        v = [P(-sx, -sy, -sz), P(sx, -sy, -sz), P(sx, sy, -sz), P(-sx, sy, -sz),
             P(-sx, -sy, sz), P(sx, -sy, sz), P(sx, sy, sz), P(-sx, sy, sz)]
        cols = colors or {}
        self.quad(v[4], v[5], v[6], v[7], cols.get("top", color))
        self.quad(v[3], v[2], v[1], v[0], cols.get("bottom", color))
        self.quad(v[0], v[1], v[5], v[4], cols.get("front", color))
        self.quad(v[2], v[3], v[7], v[6], cols.get("back", color))
        self.quad(v[3], v[0], v[4], v[7], cols.get("left", color))
        self.quad(v[1], v[2], v[6], v[5], cols.get("right", color))

    def cylinder(self, base, top_center, r0, r1, segs, color, cap=True):
        axis = (Vector(top_center) - Vector(base))
        ln = axis.length
        z = axis.normalized()
        x = z.orthogonal().normalized()
        y = z.cross(x)
        ring0, ring1 = [], []
        for i in range(segs):
            a = i / segs * math.tau
            d = x * math.cos(a) + y * math.sin(a)
            ring0.append(Vector(base) + d * r0)
            ring1.append(Vector(base) + z * ln + d * r1)
        for i in range(segs):
            j = (i + 1) % segs
            self.quad(ring0[i], ring0[j], ring1[j], ring1[i], color)
        if cap:
            self.face(list(reversed(ring0)), color)
            if r1 > 0.001:
                self.face(ring1, color)

    def icosphere(self, center, radius, color, scale=(1, 1, 1), subdiv=1, jitter=0.0, rng=None):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=radius)
        for v in tmp.verts:
            k = 1 + (rng.uniform(-jitter, jitter) if rng and jitter else 0)
            v.co = Vector((v.co.x * scale[0] * k, v.co.y * scale[1] * k, v.co.z * scale[2] * k)) + Vector(center)
        for f in tmp.faces:
            self.face([v.co.copy() for v in f.verts], color)
        tmp.free()

    def to_object(self, name, collection=None, smooth=False, weld=False, keep_uv=False):
        me = bpy.data.meshes.new(name)
        if weld:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.001)
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        if not keep_uv:
            self.bm.loops.layers.uv.remove(self.uv)
        self.bm.to_mesh(me)
        self.bm.free()
        me.color_attributes.active_color = me.color_attributes[0] if me.color_attributes else None
        for p in me.polygons:
            p.use_smooth = smooth
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


def finalize_colors(ob):
    """Les couleurs de coin (bmesh) deviennent l'attribut exporté en COLOR_0."""
    me = ob.data
    if "Col" in me.color_attributes:
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = me.color_attributes.find("Col")


def bake_material(name, image=None, uv_name="Lightmap"):
    """Matière de cuisson : couleur de base = couleur de sommet (pour des rebonds teintés),
    nœud image actif sur la carte de lumière."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    if image is not None:
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = uv_name
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        nt.nodes.active = tex
        tex.select = True
    return mat


def use_gpu() -> str:
    """Cycles sur le GPU si possible (OptiX, puis CUDA), sinon CPU."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devices = [d for d in prefs.devices if d.type == kind]
            if devices:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                return kind
        except TypeError:
            continue
    scene.cycles.device = "CPU"
    return "CPU"
