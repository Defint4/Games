/* Géométries de la scène, construites une fois et partagées par tous les dés et gobelets. */

import * as THREE from "three";

/* Dimensions en centimètres « de table » : un dé de 16 mm, un gobelet de 12 cm. */
export const DIE = 1.6;
export const CUP = { mouth: 3.6, top: 2.5, height: 7.6, wall: 0.16 };

let dieGeometry: THREE.BufferGeometry | null = null;

/* Cube aux arêtes arrondies : on part d'une boîte finement découpée et on « gonfle »
   chaque sommet vers une sphère de rayon `radius` autour du cube intérieur. Les six
   groupes de faces de BoxGeometry restent intacts : un matériau par face du dé. */
export function roundedDie(): THREE.BufferGeometry {
  if (dieGeometry) return dieGeometry;
  const size = DIE;
  const radius = 0.24;
  const g = new THREE.BoxGeometry(size, size, size, 10, 10, 10);
  const pos = g.attributes.position;
  const inner = size / 2 - radius;
  const v = new THREE.Vector3();
  const core = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    core.set(
      THREE.MathUtils.clamp(v.x, -inner, inner),
      THREE.MathUtils.clamp(v.y, -inner, inner),
      THREE.MathUtils.clamp(v.z, -inner, inner),
    );
    v.sub(core).normalize().multiplyScalar(radius).add(core);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  dieGeometry = g;
  return g;
}

/* Valeur portée par chaque groupe de BoxGeometry (+x, −x, +y, −y, +z, −z) : faces
   opposées de somme 7, comme sur un vrai dé. */
export const FACE_VALUES = [3, 4, 1, 6, 2, 5];

const TOP = new THREE.Vector3(0, 1, 0);
const NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

/* Orientation qui pose `value` sur le dessus, tournée de `yaw` autour de la verticale. */
export function dieQuaternion(value: number, yaw: number): THREE.Quaternion {
  const face = NORMALS[FACE_VALUES.indexOf(value)];
  const up = new THREE.Quaternion().setFromUnitVectors(face, TOP);
  return new THREE.Quaternion().setFromAxisAngle(TOP, yaw).multiply(up);
}

/* ------------------------------------------------------------------------ */
/* Gobelet                                                                  */
/* ------------------------------------------------------------------------ */

/* Profil (rayon, hauteur) du gobelet posé ouverture en bas : une lèvre roulée au ras du
   tapis, un pli, la paroi qui monte en se resserrant, une épaule arrondie vers le fond.
   Chaque point porte une ombre de creux (1 = pleine lumière) : sous l'épaule, dans le
   pli au-dessus de la lèvre. */

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
}

const SIDE_FROM = 0.46; // bas de la paroi droite, au-dessus de la lèvre
const SIDE_TO = CUP.height - 0.34; // haut de la paroi, sous l'épaule
const SHOULDER = 0.36;
export const CAP_RADIUS = CUP.top + 0.05 - SHOULDER;

/* Rayon de la paroi à la hauteur y (pour poser bandeau et surpiqûres dessus). */
export function cupRadiusAt(y: number): number {
  const t = THREE.MathUtils.clamp((y - SIDE_FROM) / (SIDE_TO - SIDE_FROM), 0, 1);
  return THREE.MathUtils.lerp(CUP.mouth - 0.01, CUP.top + 0.05, t);
}

function profile(): { points: THREE.Vector2[]; shade: number[] } {
  const { mouth, wall } = CUP;
  const pts: [number, number, number][] = [];
  const push = (list: [number, number][], shade: (i: number) => number) =>
    list.forEach(([x, y], i) => pts.push([x, y, shade(i)]));
  pts.push([mouth - wall, 0, 0.55]);
  // Lèvre roulée : demi-cercle par l'extérieur.
  push(arc(mouth + 0.02, 0.15, 0.15, -Math.PI / 2, Math.PI / 2, 10), (i) => 0.75 + 0.02 * i);
  // Le pli juste au-dessus : ombre marquée.
  pts.push([mouth - 0.03, 0.36, 0.6]);
  pts.push([cupRadiusAt(SIDE_FROM), SIDE_FROM, 0.82]);
  // La paroi, en plusieurs points pour une ombre qui varie doucement.
  for (let k = 1; k <= 8; k++) {
    const y = SIDE_FROM + ((SIDE_TO - SIDE_FROM) * k) / 8;
    pts.push([cupRadiusAt(y), y, k === 8 ? 0.95 : 1]);
  }
  // Épaule arrondie jusqu'au fond, qui reprend la lumière de la lampe.
  push(
    arc(CAP_RADIUS, SIDE_TO, SHOULDER, 0, Math.PI / 2, 10).slice(1),
    () => 1,
  );
  return {
    points: pts.map(([x, y]) => new THREE.Vector2(x, y)),
    shade: pts.map(([, , a]) => a),
  };
}

const SEGMENTS = 128;
/* Taille d'un carreau de texture de cuir, en unités de table (grain ~1 mm). */
const LEATHER_TILE = 2.3;

/* Tour de lathe avec des UV à l'échelle réelle : u fait un nombre entier de carreaux
   (pas de couture), v suit la longueur du profil (le grain ne s'étire pas dans les
   courbes). Ombres de creux en couleurs de sommets. */
function turned(points: THREE.Vector2[], shade: number[] | null, segments = SEGMENTS) {
  const g = new THREE.LatheGeometry(points, segments);
  const n = points.length;
  const lengths = [0];
  for (let j = 1; j < n; j++) lengths.push(lengths[j - 1] + points[j].distanceTo(points[j - 1]));
  const meanRadius = points.reduce((sum, p) => sum + p.x, 0) / n;
  const uTiles = Math.max(1, Math.round((2 * Math.PI * meanRadius) / LEATHER_TILE));
  const uv = g.attributes.uv;
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      uv.setXY(k, (i / segments) * uTiles, lengths[j] / LEATHER_TILE);
      const a = shade ? shade[j] : 1;
      colors.set([a, a, a], k * 3);
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/* Bandeau teinté, légèrement en relief, bords arrondis. */
export const BAND = { from: 1.1, to: 2.0 };

let cupGeometries: {
  outer: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
} | null = null;

export function cupGeometry() {
  if (cupGeometries) return cupGeometries;
  const { mouth, top, height, wall } = CUP;
  const outer = profile();
  const innerPoints = [
    [mouth - wall, 0],
    [top - wall - 0.1, height - wall * 2],
    [0, height - wall * 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const { from, to } = BAND;
  const r = cupRadiusAt;
  const bandPoints = [
    [r(from) + 0.004, from],
    [r(from) + 0.035, from + 0.03],
    [r(from + 0.09) + 0.05, from + 0.09],
    [r(to - 0.09) + 0.05, to - 0.09],
    [r(to) + 0.035, to - 0.03],
    [r(to) + 0.004, to],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cap = new THREE.CircleGeometry(CAP_RADIUS + 0.005, SEGMENTS);
  // UV du fond à la même échelle de grain que la paroi.
  const uv = cap.attributes.uv;
  const pos = cap.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) / LEATHER_TILE, pos.getY(i) / LEATHER_TILE);
  }
  cap.rotateX(-Math.PI / 2).translate(0, height + 0.02, 0);
  // Le matériau lit les ombres de creux en couleurs de sommets : le fond en pleine lumière.
  cap.setAttribute("color", new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
  cupGeometries = {
    outer: turned(outer.points, outer.shade),
    inner: turned(innerPoints, null, 64),
    cap,
    band: turned(bandPoints, [0.7, 0.9, 1, 1, 0.9, 0.7]),
  };
  return cupGeometries;
}

/* Surpiqûres : où passent les rangs de points (hauteur, rayon, sur la paroi ou sur le fond). */
export function stitchRows(): { y: number; radius: number; flat: boolean }[] {
  return [
    { y: BAND.from + 0.14, radius: cupRadiusAt(BAND.from + 0.14) + 0.05, flat: false },
    { y: BAND.to - 0.14, radius: cupRadiusAt(BAND.to - 0.14) + 0.05, flat: false },
    { y: 0.52, radius: cupRadiusAt(0.52) + 0.005, flat: false },
    { y: CUP.height + 0.02, radius: CAP_RADIUS - 0.18, flat: true },
  ];
}
