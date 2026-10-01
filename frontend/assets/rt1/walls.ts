/* Banc des murs : la voiture du jeu, dans la vraie physique (Game + Car + Rapier), lancée
   contre les murs des circuits qui en ont. Compte ce qui passe à travers, ce qui passe
   par-dessus le collider, les tonneaux et la hauteur d'envol. À relancer après tout
   changement de collider, de physique ou de circuit : l'audit du 1er octobre 2026 partait
   de 46 % de traversées.

   pnpm rt1:walls [circuit…]            tous les circuits à murs, les 13 véhicules
   RT1_VEHICLES=starter,f1 pnpm rt1:walls
   RT1_QUICK=1 pnpm rt1:walls           8 points du tracé au lieu de 16 */

import { Vector3 } from "three";
import { Game, initPhysics } from "../../src/games/rt1/sim/game";
import { TrackLocator } from "../../src/games/rt1/sim/track";
import { VEHICLES } from "../../src/games/rt1/sim/vehicles";
import { CIRCUITS, loadCircuit } from "./load";

const H = 1 / 120;
/* au-delà de cet écart à l'axe, la voiture est sortie (mur à 7,75 m, caisse de 0,8 m) */
const OUT = 9.2;
/* angle d'attaque (rad) par rapport à l'axe, et départ lancé à la vitesse de pointe ou arrêté */
const SCENARIOS: [number, boolean][] = [[0.2, false], [0.6, false], [1.2, false], [0.12, true], [0.35, true]];

type Result = { essais: number; travers: number; dessus: number; tonneaux: number; hmax: number };

function add(a: Result, b: Result) {
  a.essais += b.essais;
  a.travers += b.travers;
  a.dessus += b.dessus;
  a.tonneaux += b.tonneaux;
  a.hmax = Math.max(a.hmax, b.hmax);
}

function fmt(r: Result): string {
  const pct = (n: number) => `${n} (${((100 * n) / Math.max(1, r.essais)).toFixed(1)} %)`;
  return `${r.essais} essais | à travers ${pct(r.travers)} | par-dessus ${pct(r.dessus)} | tonneaux ${pct(r.tonneaux)} | envol max ${r.hmax.toFixed(1)} m`;
}

await initPhysics();
const only = process.env.RT1_VEHICLES?.split(",");
const points = process.env.RT1_QUICK ? 8 : 16;
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : CIRCUITS;
const total: Result = { essais: 0, travers: 0, dessus: 0, tonneaux: 0, hmax: 0 };

for (const slug of wanted) {
  const c = await loadCircuit(slug);
  if (c.meta.walls === false || !c.meta.wallSegments?.length) continue;
  const line = c.meta.line.map((p) => new Vector3(...p));
  const n = line.length;
  for (const vehicle of VEHICLES) {
    if (only && !only.includes(vehicle.id)) continue;
    const game = new Game({ meta: c.meta, heights: c.heights, probe: null }, c.road, { best: null, ghost: null, rival: null, bots: [], vehicle });
    const loc = new TrackLocator(c.meta.line);
    const r: Result = { essais: 0, travers: 0, dessus: 0, tonneaux: 0, hmax: 0 };
    for (let k = 0; k < points; k++) {
      const i = Math.floor((k * n) / points);
      for (const sgn of [1, -1]) {
        for (const [ang, launched] of SCENARIOS) {
          const p = line[i], q = line[(i + 2) % n];
          const slope = q.clone().sub(p).normalize();
          const t = q.clone().sub(p).setY(0).normalize();
          const left = new Vector3(0, 1, 0).cross(t).normalize();
          const dir = t.clone().multiplyScalar(Math.cos(ang)).addScaledVector(left, sgn * Math.sin(ang)).normalize();
          game.car.place(p.clone().add(new Vector3(0, 0.7, 0)), dir);
          // la suspension se pose
          for (let s = 0; s < 40; s++) {
            game.car.update(H, { steer: 0, throttle: 0, brake: 0, hold: true });
            game.world.step();
          }
          if (launched) {
            const v = vehicle.spec.topSpeed;
            game.car.body.setLinvel({ x: dir.x * v, y: slope.y * v, z: dir.z * v }, true);
          }
          r.essais++;
          loc.reset(i);
          const pos = new Vector3();
          let prevRel = 0, hmax = 0, flipped = false;
          for (let s = 0; s < 120 * 4; s++) {
            game.car.update(H, { steer: 0, throttle: 1, brake: 0 });
            game.world.step();
            const tr = game.car.body.translation();
            pos.set(tr.x, tr.y, tr.z);
            const { i: bi, lateral } = loc.locate(pos);
            const rel = tr.y - line[bi].y;
            if (game.car.upsideDown()) flipped = true;
            if (lateral > OUT) {
              if (prevRel > 2) r.dessus++;
              else r.travers++;
              break;
            }
            hmax = Math.max(hmax, rel);
            prevRel = rel;
          }
          r.hmax = Math.max(r.hmax, hmax);
          if (flipped) r.tonneaux++;
        }
      }
    }
    console.log(`${slug.padEnd(13)} ${vehicle.id.padEnd(10)} ${fmt(r)}`);
    add(total, r);
    game.dispose();
  }
}
console.log(`\nTotal : ${fmt(total)}`);
