/* Lecture d'un circuit publié (public/rt1/<circuit>/) sous Node, pour les scripts qui
   rejouent la physique du jeu sans rendu : bots, banc des murs, contrôles du build. */

import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { trimesh } from "../../src/games/rt1/sim/colliders";
import type { LevelMeta } from "../../src/games/rt1/sim/level";

export const PUBLIC = new URL("../../public/rt1/", import.meta.url);

export const CIRCUITS = ["noumea", "centre-ville", "le-col", "la-corniche", "plaine-des-lacs", "yate", "prony", "la-madeleine"];

export type Circuit = {
  slug: string;
  meta: LevelMeta;
  heights: Int16Array;
  gltf: GLTF;
  road: ReturnType<typeof trimesh>;
};

export async function loadCircuit(slug: string): Promise<Circuit> {
  const meta = JSON.parse(readFileSync(new URL(`${slug}/level.json`, PUBLIC), "utf8")) as LevelMeta;
  const hb = readFileSync(new URL(`${slug}/heights.bin`, PUBLIC));
  const heights = new Int16Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength));
  const glb = readFileSync(new URL(`${slug}/level.glb`, PUBLIC));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
  return { slug, meta, heights, gltf, road: trimesh(gltf, "col_road") };
}

/* Hauteur du terrain (m) en un point three (x, z), interpolée dans heights.bin. */
export function terrainHeight(c: Circuit, x: number, z: number): number {
  const t = c.meta.terrain;
  const fx = (x - t.x0) / t.step, fy = (-z - t.y0) / t.step;
  const i = Math.max(0, Math.min(t.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(t.ny - 2, Math.floor(fy)));
  const tx = fx - i, ty = fy - j;
  const h = (a: number, b: number) => c.heights[b * t.nx + a] / 100;
  return h(i, j) * (1 - tx) * (1 - ty) + h(i + 1, j) * tx * (1 - ty) + h(i, j + 1) * (1 - tx) * ty + h(i + 1, j + 1) * tx * ty;
}
