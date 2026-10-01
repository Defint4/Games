/* Le rythme de chaque véhicule sur chaque circuit, lu dans les tours des bots
   (public/rt1/<circuit>/bots-<véhicule>.bin) : `base` = meilleur tour de la citadine (s),
   `ratio` = meilleur tour du véhicule / base. Écrit dans src/games/rt1/pace.json et
   backend/app/games/rt1/pace.json : les médailles de chaque véhicule en découlent, des
   deux côtés. Lancé en fin de bots.ts, ou seul : pnpm rt1:pace */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VEHICLES } from "../../src/games/rt1/sim/vehicles";
import { CIRCUITS, PUBLIC } from "./load";

const OUTS = [
  new URL("../../src/games/rt1/pace.json", import.meta.url),
  new URL("../../../backend/app/games/rt1/pace.json", import.meta.url),
];

export type Pace = Record<string, { base: number; ratio: Record<string, number> }>;

/* En-tête d'un .bin : u16 tours, u8 cadence, f32 rythme, puis par tour f32 temps, u16 n
   passages, f32[n], u32 poses, i16[7 × poses]. */
function bestTime(buf: Buffer): number {
  const n = buf.readUInt16LE(0);
  let o = 7, best = Infinity;
  for (let r = 0; r < n; r++) {
    const t = buf.readFloatLE(o);
    o += 4;
    const ns = buf.readUInt16LE(o);
    o += 2 + ns * 4;
    const poses = buf.readUInt32LE(o);
    o += 4 + poses * 14;
    best = Math.min(best, t);
  }
  return best;
}

export function writePace(): Pace {
  const pace: Pace = {};
  for (const slug of CIRCUITS) {
    const base = bestTime(readFileSync(new URL(`${slug}/bots-starter.bin`, PUBLIC)));
    const ratio: Record<string, number> = {};
    for (const v of VEHICLES) {
      const best = bestTime(readFileSync(new URL(`${slug}/bots-${v.id}.bin`, PUBLIC)));
      ratio[v.id] = Math.round((best / base) * 1000) / 1000;
    }
    pace[slug] = { base: Math.round(base * 100) / 100, ratio };
  }
  const text = JSON.stringify(pace, null, 2) + "\n";
  for (const out of OUTS) writeFileSync(out, text);
  return pace;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(writePace()));
