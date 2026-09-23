/* Textures de la scène, dessinées au canvas au premier usage puis gardées en cache :
   aucune image à télécharger, et la netteté s'adapte sans perte.
   Chaque matière a sa carte de couleur et sa carte de relief (normal map) : les points
   des dés sont creusés, le cuir a son grain, le feutre ses fibres. */

import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let texture = cache.get(key);
  if (!texture) {
    texture = make();
    cache.set(key, texture);
  }
  return texture;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

function colorTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

/* Relief → normal map : dérivées de la hauteur (canvas en niveaux de gris, blanc = haut). */
function normalFromHeight(height: HTMLCanvasElement, strength: number, repeat = 1) {
  const size = height.width;
  const src = height.getContext("2d")!.getImageData(0, 0, size, size).data;
  const [out, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) =>
    src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.anisotropy = 4;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

/* ------------------------------------------------------------------------ */
/* Dés                                                                      */
/* ------------------------------------------------------------------------ */

import { type DiceColor } from "../colors";

export { DICE_COLORS, type DiceColor } from "../colors";

const FACE = 256;

/* Points d'une face, sur une grille 3×3 (0,25 / 0,5 / 0,75). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
};

const PIP_R = 0.085;

/* Le Paco (face 1) : une étoile à cinq branches, comme sur les dés de Perudo. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? outer * 0.45 : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

export function dieFaceMap(value: number, color: DiceColor): THREE.Texture {
  return memo(`die:${value}:${color.body}`, () => {
    const [c, ctx] = canvas(FACE);
    // Un léger dégradé : la résine prend la lumière au centre de la face.
    const bg = ctx.createRadialGradient(FACE / 2, FACE / 2, FACE * 0.1, FACE / 2, FACE / 2, FACE * 0.75);
    bg.addColorStop(0, color.body);
    bg.addColorStop(1, shade(color.body, -0.08));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, FACE, FACE);
    if (value === 1) {
      ctx.fillStyle = color.paco;
      star(ctx, FACE / 2, FACE / 2, FACE * 0.22);
      ctx.fill();
      return colorTexture(c);
    }
    for (const [x, y] of PIPS[value]) {
      const px = x * FACE;
      const py = y * FACE;
      const r = PIP_R * FACE;
      // Creux : le bord haut-gauche dans l'ombre, le fond un peu plus clair.
      const g = ctx.createRadialGradient(px + r * 0.25, py + r * 0.25, r * 0.1, px, py, r);
      g.addColorStop(0, shade(color.pip, 0.12));
      g.addColorStop(1, shade(color.pip, -0.15));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return colorTexture(c);
  });
}

export function dieFaceNormal(value: number): THREE.Texture {
  return memo(`die-n:${value}`, () => {
    const [c, ctx] = canvas(FACE);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, FACE, FACE);
    const hole = (px: number, py: number, r: number) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "#555");
      g.addColorStop(0.75, "#7a7a7a");
      g.addColorStop(1, "#fff");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (value === 1) {
      ctx.fillStyle = "#8a8a8a";
      star(ctx, FACE / 2, FACE / 2, FACE * 0.22);
      ctx.fill();
    } else {
      for (const [x, y] of PIPS[value]) hole(x * FACE, y * FACE, PIP_R * FACE * 1.15);
    }
    return normalFromHeight(c, 3);
  });
}

/* ------------------------------------------------------------------------ */
/* Feutre et cuir                                                           */
/* ------------------------------------------------------------------------ */

/* Bruit pseudo-aléatoire rejouable : les textures sont identiques d'une visite à l'autre. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function feltMaps(base: string): { map: THREE.Texture; normal: THREE.Texture } {
  const map = memo(`felt:${base}`, () => {
    const [c, ctx] = canvas(512);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const rand = rng(7);
    // Des milliers de fibres courtes, un peu plus claires ou plus sombres que le fond.
    for (let i = 0; i < 9000; i++) {
      const x = rand() * 512;
      const y = rand() * 512;
      const a = rand() * Math.PI;
      const l = 2 + rand() * 5;
      ctx.strokeStyle = rand() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    return colorTexture(c, 10);
  });
  const normal = memo("felt-n", () => {
    const [c, ctx] = canvas(256);
    const rand = rng(11);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const v = Math.floor(90 + rand() * 90);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
    }
    return normalFromHeight(c, 1.2, 20);
  });
  return { map, normal };
}

/* Cuir pleine fleur, texture neutre partagée par tous les gobelets (la teinte vient
   de la couleur du matériau) : un grain de petites cellules bombées séparées par des
   sillons (bruit cellulaire de Worley), une patine lente par-dessus. Tout est calculé
   en raccord parfait : aucune couture visible quand la texture se répète. */
export function leatherMaps(): {
  map: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
} {
  const height = leatherHeight();
  const map = memo("leather", () => {
    const size = height.size;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      // Sillons plus sombres, bosses un peu plus claires, patine en larges nappes.
      const v = 0.66 + 0.24 * height.grain[i] + 0.12 * height.patina[i];
      const g = Math.round(255 * Math.min(1, v));
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = Math.round(g * 0.97);
      img.data[i * 4 + 2] = Math.round(g * 0.93);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = colorTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
  const roughness = memo("leather-r", () => {
    const size = height.size;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      // Les bosses, polies par les mains, brillent ; les sillons restent mats.
      const r = 0.78 - 0.3 * height.grain[i] - 0.12 * height.patina[i];
      const g = Math.round(255 * Math.max(0, Math.min(1, r)));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
  const normal = memo("leather-n", () => {
    const size = height.size;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const g = Math.round(255 * (0.85 * height.grain[i] + 0.15 * height.patina[i]));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = normalFromHeight(c, 2.4);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
  return { map, normal, roughness };
}

let heightField: { size: number; grain: Float32Array; patina: Float32Array } | null = null;

function leatherHeight() {
  if (heightField) return heightField;
  const size = 512;
  const cells = 34;
  const cell = size / cells;
  const rand = rng(41);
  // Un point par cellule, la grille se referme sur elle-même (raccord parfait).
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    px[i] = rand();
    py[i] = rand();
  }
  const grain = new Float32Array(size * size);
  const patina = new Float32Array(size * size);
  const waves = Array.from({ length: 6 }, () => ({
    kx: 1 + Math.floor(rand() * 3),
    ky: Math.floor(rand() * 3),
    phase: rand() * Math.PI * 2,
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          const k = ((ny + cells) % cells) * cells + ((nx + cells) % cells);
          const fx = (nx + px[k]) * cell;
          const fy = (ny + py[k]) * cell;
          const d = Math.hypot(fx - x, fy - y);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      // Distance au bord de cellule → sillon à 0, plateau bombé vers 1.
      const edge = Math.min(1, (f2 - f1) / (cell * 0.55));
      const i = y * size + x;
      grain[i] = 1 - (1 - edge) ** 3;
      let p = 0;
      for (const w of waves) {
        p += Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.phase);
      }
      patina[i] = 0.5 + p / (waves.length * 2);
    }
  }
  heightField = { size, grain, patina };
  return heightField;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
