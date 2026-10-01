/* Données d'un circuit produites par assets/rt1/level.py (repère three : Y en haut). */

import { ASSET_VERSION } from "../assetVersion";

export type V3 = [number, number, number];

export type Gate = { pos: V3; dir: V3; half: number };

/* x, y, z, rotation autour de Y, échelle */
export type Placement = [number, number, number, number, number];

export type LevelMeta = {
  name: string;
  length: number;
  sun: V3;
  lmScale: number;
  /* faux : circuit sans murs, la sortie de route est libre */
  walls?: boolean;
  /* tronçons de mur [ax, ay, az, bx, by, bz, côté (+1 à gauche)] le long de la face
     intérieure du muret ; le jeu en fait des pavés épais et hauts */
  wallSegments?: number[][];
  /* distance entre deux points de `line` (m) */
  lineStep?: number;
  /* sonde de lumière (probe.bin) : grille sur l'emprise, `lit` = valeur d'un sol en plein soleil */
  probe?: { nx: number; ny: number; lit: number };
  laps?: number;
  /* plaques de boost : centre du début, direction, demi-largeur, longueur */
  boosts?: (Gate & { len: number })[];
  /* Emprise du terrain en coordonnées Blender : x vers l'est, y vers le nord (z three = -y). */
  terrain: { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; step: number };
  spawn: { pos: V3; dir: V3 };
  start: Gate;
  checkpoints: Gate[];
  line: V3[];
  instances: Record<string, Placement[]>;
};

export type LevelData = { meta: LevelMeta; heights: Int16Array; probe: Uint8Array | null };

/* Éclairement du sol en (x, z), de 0 (ombre) à 1 (plein soleil), lu dans la sonde. */
export function groundLight(level: LevelData, x: number, z: number): number {
  const { meta, probe } = level;
  const p = meta.probe;
  if (!probe || !p) return 1;
  const t = meta.terrain;
  const fx = ((x - t.x0) / (t.x1 - t.x0)) * p.nx - 0.5, fy = ((-z - t.y0) / (t.y1 - t.y0)) * p.ny - 0.5;
  const i = Math.max(0, Math.min(p.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(p.ny - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
  const v = (a: number, b: number) => probe[b * p.nx + a] / 255;
  const lum = v(i, j) * (1 - tx) * (1 - ty) + v(i + 1, j) * tx * (1 - ty) + v(i, j + 1) * (1 - tx) * ty + v(i + 1, j + 1) * tx * ty;
  // sous 40 % du plein soleil, c'est l'ombre (le ciel seul) ; au-dessus, le soleil revient
  return Math.max(0, Math.min(1, (lum / p.lit - 0.4) / 0.6));
}

export function asset(name: string): string {
  return `/rt1/${name}?v=${ASSET_VERSION}`;
}

const cache = new Map<string, Promise<LevelData>>();

export function loadLevel(name: string): Promise<LevelData> {
  let p = cache.get(name);
  if (!p) {
    p = Promise.all([
      fetch(asset(`${name}/level.json`)).then((r) => {
        if (!r.ok) throw new Error(`level.json ${r.status}`);
        return r.json() as Promise<LevelMeta>;
      }),
      fetch(asset(`${name}/heights.bin`)).then((r) => {
        if (!r.ok) throw new Error(`heights.bin ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(asset(`${name}/probe.bin`)).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]).then(([meta, buf, probe]) => ({ meta, heights: new Int16Array(buf), probe: probe ? new Uint8Array(probe) : null }));
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
