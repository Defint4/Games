/* Enregistre les tours des bots : le pilote automatique roule sur chaque circuit, dans
   chaque véhicule, avec plusieurs styles (rythme, trajectoire), dans la vraie physique du
   jeu, sans rendu. Les tours sans sortie ni remise en piste sont gardés dans
   public/rt1/<circuit>/bots-<véhicule>.bin (format : src/games/rt1/sim/bots.ts), 10 poses
   par seconde, avec le rythme du véhicule rapporté à la citadine.

   pnpm rt1:bots [circuit…]      (depuis frontend/, une à deux minutes par circuit)
   RT1_VEHICLES=trail,mx pnpm rt1:bots   seulement ces véhicules (la citadine, référence du
                                         rythme, roule toujours)
   À relancer quand un circuit, un véhicule ou le pilote automatique change. */

import { readFileSync, writeFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { DriveStyle } from "../../src/games/rt1/sim/autopilot";
import { trimesh } from "../../src/games/rt1/sim/colliders";
import { Game } from "../../src/games/rt1/sim/game";
import { ghostPose } from "../../src/games/rt1/sim/ghost";
import type { LevelMeta } from "../../src/games/rt1/sim/level";
import { type Vehicle, VEHICLES } from "../../src/games/rt1/sim/vehicles";

const HZ = 10;

const CIRCUITS = ["noumea", "centre-ville", "le-col", "la-corniche"];

/* Du plus rapide au plus lent ; les trajectoires décalées évitent que les bots se
   superposent. */
const STYLES: DriveStyle[] = [
  { pace: 1.04, offset: 0 },
  { pace: 1.0, offset: 0 },
  { pace: 0.98, offset: 1.4 },
  { pace: 0.96, offset: -1.4 },
  { pace: 0.93, offset: 0.7 },
  { pace: 0.9, offset: -2 },
  { pace: 0.87, offset: 2 },
  { pace: 0.84, offset: -0.7 },
  { pace: 0.81, offset: 1.2 },
  { pace: 0.78, offset: -1.2 },
  { pace: 0.75, offset: 0 },
  { pace: 0.71, offset: 1.6 },
  { pace: 0.67, offset: -1.6 },
];

const PUBLIC = new URL("../../public/rt1/", import.meta.url);

type Run = { time: number; splits: number[]; ghost: Float32Array };

type Circuit = { meta: LevelMeta; heights: Int16Array; road: ReturnType<typeof trimesh>; walls: ReturnType<typeof trimesh> };

async function load(slug: string): Promise<Circuit> {
  const meta = JSON.parse(readFileSync(new URL(`${slug}/level.json`, PUBLIC), "utf8")) as LevelMeta;
  const hb = readFileSync(new URL(`${slug}/heights.bin`, PUBLIC));
  const heights = new Int16Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength));
  const glb = readFileSync(new URL(`${slug}/level.glb`, PUBLIC));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
  return { meta, heights, road: trimesh(gltf, "col_road"), walls: trimesh(gltf, "col_wall") };
}

function record(slug: string, c: Circuit, vehicle: Vehicle): Run[] {
  const runs: Run[] = [];
  for (const style of STYLES) {
    const game = new Game({ meta: c.meta, heights: c.heights }, c.road, c.walls, { best: null, ghost: null, rival: null, bots: [], vehicle });
    game.testMode(true, 8, style);
    let clean = true;
    game.on((e) => {
      if (e.type === "respawn" || e.type === "restart") clean = false;
    });
    while (game.race.phase !== "finished" && game.race.time < 300 && clean) game.update(0.1);
    const done = game.race.phase === "finished" && clean && game.lastLap;
    if (!done) console.log(`  ${slug} ${vehicle.id} rythme ${style.pace} décalage ${style.offset} : écarté`);
    if (done) runs.push({ time: game.race.time, splits: [...game.race.splits], ghost: game.lastLap! });
    game.dispose();
  }
  return runs;
}

/* Poses rééchantillonnées à HZ exactement (le temps devient implicite) et quantifiées
   sur 16 bits. */
function encode(runs: Run[], ratio: number): Buffer {
  const parts: Buffer[] = [];
  const head = Buffer.alloc(7);
  head.writeUInt16LE(runs.length, 0);
  head.writeUInt8(HZ, 2);
  head.writeFloatLE(ratio, 3);
  parts.push(head);
  const p = new Vector3();
  const q = new Quaternion();
  const q2 = new Quaternion();
  for (const r of runs) {
    const n = Math.floor(r.time * HZ) + 2;
    const b = Buffer.alloc(4 + 2 + r.splits.length * 4 + 4 + n * 14);
    let o = b.writeFloatLE(r.time, 0);
    o = b.writeUInt16LE(r.splits.length, o);
    for (const s of r.splits) o = b.writeFloatLE(s, o);
    o = b.writeUInt32LE(n, o);
    for (let k = 0; k < n; k++) {
      ghostPose(r.ghost, k / HZ, p, q, q2);
      for (const x of [p.x, p.y, p.z]) o = b.writeInt16LE(Math.round(x * 20), o);
      for (const x of [q.x, q.y, q.z, q.w]) o = b.writeInt16LE(Math.round(x * 32767), o);
    }
    parts.push(b);
  }
  return Buffer.concat(parts);
}

await RAPIER.init();
for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : CIRCUITS) {
  const circuit = await load(slug);
  let base = 0;
  const sizes: string[] = [];
  // la citadine d'abord : les autres se mesurent à elle
  const only = process.env.RT1_VEHICLES?.split(",");
  for (const vehicle of VEHICLES) {
    if (only && vehicle.id !== "starter" && !only.includes(vehicle.id)) continue;
    const runs = record(slug, circuit, vehicle);
    if (runs.length < 7) throw new Error(`${slug} ${vehicle.id} : ${runs.length} tours propres seulement, il en faut 7`);
    const best = Math.min(...runs.map((r) => r.time));
    base ||= best;
    if (only && !only.includes(vehicle.id)) continue;
    const out = encode(runs, best / base);
    writeFileSync(new URL(`${slug}/bots-${vehicle.id}.bin`, PUBLIC), out);
    sizes.push(`${vehicle.id} ${runs.length} tours ×${(best / base).toFixed(2)} ${Math.round(out.length / 1024)} ko`);
  }
  console.log(`${slug} : ${sizes.join(", ")}`);
}
