/* La livrée sur le modèle 3D. Les modèles n'ont pas de coordonnées de texture : le
   deuxième ton est choisi dans le shader d'après la position sur la carrosserie
   (attribut carPos, repère du véhicule), et logo et numéro sont des décalques projetés
   là où un rayon touche la peinture (capot, toit, portières, arrière). */

import {
  CanvasTexture,
  Color,
  type BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Raycaster,
  SRGBColorSpace,
  Vector3,
  Euler,
} from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { drawLogo, drawNumber, type Finish, type Livery, type Tone, type Zone } from "../livery";

const TONE_ID: Record<Tone, number> = { none: 0, lower: 1, stripes: 2, front: 3, split: 4 };

const FINISH: Record<Finish, Partial<ConstructorParameters<typeof MeshPhysicalMaterial>[0]>> = {
  gloss: { roughness: 0.42, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 },
  matte: { roughness: 0.78, metalness: 0, clearcoat: 0 },
  metal: { roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 },
  pearl: { roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.35 },
  chrome: { roughness: 0.06, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.02 },
};

/* Boîte de la peinture dans le repère du véhicule. */
export type Bounds = { min: Vector3; max: Vector3 };

/* Peinture : finition, et deuxième ton selon la position (limites de la caisse). */
export function paintMaterial(l: Livery, b: Bounds): MeshPhysicalMaterial {
  const mat = new MeshPhysicalMaterial({ color: l.color, envMapIntensity: 0.85, ...FINISH[l.finish] });
  const uniforms = {
    uColor2: { value: new Color(l.color2) },
    uTone: { value: TONE_ID[l.tone] },
    uMin: { value: b.min.clone() },
    uMax: { value: b.max.clone() },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 carPos;\nvarying vec3 vCar;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCar = carPos;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCar;\nuniform vec3 uColor2;\nuniform int uTone;\nuniform vec3 uMin;\nuniform vec3 uMax;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 k = (vCar - uMin) / max(uMax - uMin, vec3(1e-3));
        float t = 0.0;
        if (uTone == 1) t = step(k.y, 0.4);
        else if (uTone == 2) t = step(0.55, k.y) * step(abs(abs(k.x - 0.5) - 0.12), 0.05);
        else if (uTone == 3) t = step(0.62, k.z);
        else if (uTone == 4) t = step(0.0, (k.z - 0.5) + (k.y - 0.5) * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, uColor2, t);`,
      );
  };
  // un programme par combinaison : le cache de three les distingue par cette clé
  mat.customProgramCacheKey = () => "rt1-paint";
  return mat;
}

/* Positions de la peinture dans le repère du véhicule (attribut carPos), et sa boîte.
   `meshes` : les morceaux peints, matrices monde à jour, véhicule à l'origine. */
export function carSpace(meshes: Mesh[]): Bounds {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (const m of meshes) {
    const g = m.geometry as BufferGeometry;
    const p = g.getAttribute("position");
    const out = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      out.set([v.x, v.y, v.z], i * 3);
      min.min(v);
      max.max(v);
    }
    // géométrie partagée entre les copies du modèle : même repère pour toutes
    if (!g.getAttribute("carPos")) g.setAttribute("carPos", new Float32BufferAttribute(out, 3));
  }
  return { min, max };
}

export function rimColor(mat: MeshStandardMaterial, l: Livery) {
  mat.color.set(l.rims);
}

/* Vitres : de claires (0) à fumées (1). */
export function glassTint(mat: MeshStandardMaterial, l: Livery) {
  mat.color.set("#3a5566").lerp(new Color("#05080a"), l.tint);
}

const DECAL_BASE = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.45 };

function texture(draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  // la typo arrive peut-être après : on redessine une fois chargée
  void document.fonts?.ready.then(() => {
    draw(ctx);
    tex.needsUpdate = true;
  });
  return tex;
}

/* Logo et numéro projetés sur la peinture. Renvoie les maillages à ajouter au véhicule
   (même repère) et de quoi les libérer. */
export function decals(paint: Mesh[], b: Bounds, l: Livery, font: string): { meshes: Mesh[]; dispose: () => void } {
  const meshes: Mesh[] = [];
  const disposables: { dispose: () => void }[] = [];
  const ray = new Raycaster();
  const size = new Vector3().subVectors(b.max, b.min);
  const at = (kx: number, ky: number, kz: number) =>
    new Vector3(b.min.x + size.x * kx, b.min.y + size.y * ky, b.min.z + size.z * kz);
  const up = new Vector3(0, 1, 0);
  const fwd = new Vector3(0, 0, 1);

  const stick = (origin: Vector3, dir: Vector3, s: number, map: CanvasTexture) => {
    ray.set(origin, dir);
    const hit = ray.intersectObjects(paint, false)[0];
    if (!hit?.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    // haut du motif : vers le haut sur les flancs, vers l'avant sur le dessus
    const y = Math.abs(n.y) > 0.7 ? fwd.clone() : up.clone();
    y.addScaledVector(n, -y.dot(n)).normalize();
    const x = new Vector3().crossVectors(y, n);
    const rot = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, n));
    const geo = new DecalGeometry(hit.object as Mesh, hit.point, rot, new Vector3(s, s, Math.max(0.4, s)));
    const mat = new MeshStandardMaterial({ ...DECAL_BASE, map });
    disposables.push(geo, mat);
    meshes.push(new Mesh(geo, mat));
  };

  const logo = l.layers.length && l.zones.length ? texture((ctx) => drawLogo(ctx, 256, l.layers, font)) : null;
  const num = l.number !== null ? texture((ctx) => drawNumber(ctx, 256, l.number!, font)) : null;
  if (logo) disposables.push(logo);
  if (num) disposables.push(num);
  const w = size.x;
  const len = size.z;
  const zones = new Set<Zone>(l.zones);
  const doorZ = num && logo && zones.has("doors") ? 0.62 : 0.5;
  if (logo && zones.has("hood")) stick(at(0.5, 1, 0.8).setY(b.max.y + 1), new Vector3(0, -1, 0), Math.min(w * 0.7, 1.1), logo);
  if (logo && zones.has("roof")) stick(at(0.5, 1, 0.42).setY(b.max.y + 1), new Vector3(0, -1, 0), Math.min(w * 0.6, 0.9), logo);
  if (logo && zones.has("rear")) stick(at(0.5, 0.55, 0).setZ(b.min.z - 1), new Vector3(0, 0, 1), Math.min(w * 0.45, 0.6), logo);
  for (const side of [1, -1]) {
    const o = at(0.5, 0.45, doorZ).setX(side > 0 ? b.max.x + 1 : b.min.x - 1);
    const d = new Vector3(-side, 0, 0);
    if (logo && zones.has("doors")) stick(o, d, Math.min(len * 0.2, 0.75), logo);
    if (num) stick(at(0.5, 0.45, logo && zones.has("doors") ? 0.36 : 0.5).setX(o.x), d, Math.min(len * 0.14, 0.55), num);
  }
  return { meshes, dispose: () => disposables.forEach((x) => x.dispose()) };
}
