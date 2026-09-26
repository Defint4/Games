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
  /* Emprise du terrain en coordonnées Blender : x vers l'est, y vers le nord (z three = -y). */
  terrain: { x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; step: number };
  spawn: { pos: V3; dir: V3 };
  start: Gate;
  checkpoints: Gate[];
  line: V3[];
  instances: Record<string, Placement[]>;
};

export type LevelData = { meta: LevelMeta; heights: Int16Array };

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
    ]).then(([meta, buf]) => ({ meta, heights: new Int16Array(buf) }));
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
