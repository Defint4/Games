/* Pilote automatique : suit la ligne du circuit en visant un point devant lui et
   freine avant les virages serrés. Sert aux tests (?autopilot) et enregistre les tours
   des bots (assets/rt1/bots.ts), chacun avec son style. */

import { Quaternion, Vector3 } from "three";
import type { Car } from "./car";
import type { Controls } from "./input";
import type { V3 } from "./level";

/* `pace` : part de la vitesse de référence (1 = le pilote des tests) ; `offset` : décalage
   latéral de la trajectoire visée (m, d'un côté ou de l'autre selon le signe). */
export type DriveStyle = { pace: number; offset: number };

/* Vitesse visée : `top` en ligne droite, moins `corner` par radian de virage à venir.
   `decel` (m/s²) : les véhicules rapides anticipent les virages lointains d'après leur
   distance de freinage (la citadine, sur laquelle les médailles sont calées, s'en passe),
   et arrivent aux sauts à `jump` m/s au plus : en l'air on ne tourne pas, trop vite on
   retombe dans le virage d'après. */
export type AutopilotTuning = { top: number; corner: number; decel?: number; jump?: number };

export class Autopilot {
  private line: Vector3[];
  private idx = 0;
  private q = new Quaternion();
  private fwd = new Vector3();
  private to = new Vector3();
  private side = new Vector3();

  constructor(
    line: V3[],
    private style: DriveStyle = { pace: 1, offset: 0 },
    private ap: AutopilotTuning = { top: 52, corner: 38 },
  ) {
    this.line = line.map((p) => new Vector3(...p));
  }

  reset() {
    this.idx = 0;
  }

  drive(car: Car): Controls {
    const t = car.body.translation();
    const pos = new Vector3(t.x, t.y, t.z);
    const n = this.line.length;
    // point de la ligne le plus proche, cherché en avant de l'ancien
    let best = this.idx;
    let bd = Infinity;
    for (let k = -3; k < 40; k++) {
      const i = (this.idx + k + n) % n;
      const d = this.line[i].distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.idx = best;
    const speed = Math.max(0, car.forwardSpeed);
    const ahead = Math.round(3 + speed * 0.14); // points de 4 m
    const target = this.line[(best + ahead) % n].clone();
    if (this.style.offset) {
      const dir = this.line[(best + ahead + 1) % n].clone().sub(this.line[(best + ahead) % n]).setY(0).normalize();
      target.addScaledVector(this.side.set(-dir.z, 0, dir.x), this.style.offset);
    }
    const r = car.body.rotation();
    this.q.set(r.x, r.y, r.z, r.w);
    this.fwd.set(0, 0, 1).applyQuaternion(this.q).setY(0).normalize();
    this.to.copy(target).sub(pos).setY(0).normalize();
    // angle signé (positif = cible à droite ; la gauche de la voiture est +X)
    const cross = this.fwd.x * this.to.z - this.fwd.z * this.to.x;
    const angle = Math.atan2(cross, this.fwd.dot(this.to));
    const steer = Math.max(-1, Math.min(1, angle * 3.5));
    // virage à venir : écart de cap sur 60 m
    const a = this.line[(best + 4) % n].clone().sub(this.line[best]).setY(0).normalize();
    const b = this.line[(best + 18) % n].clone().sub(this.line[(best + 14) % n]).setY(0).normalize();
    const turn = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    let limit = Math.max(10, this.ap.top - turn * this.ap.corner) * this.style.pace;
    const decel = this.ap.decel;
    if (decel) {
      // Premier saut à venir (la route plonge) : en l'air on ne freine pas, le vol (~1,1 s)
      // ne compte pas dans la distance de freinage des virages qui le suivent.
      const reach = Math.ceil((speed * speed) / (2 * decel) / 4) + 18;
      let drop = Infinity;
      for (let k = 0; k < reach; k++) {
        if (this.line[(best + k + 2) % n].y - this.line[(best + k) % n].y < -1.5) {
          drop = k;
          break;
        }
      }
      if (this.ap.jump && drop < Infinity) limit = Math.min(limit, Math.sqrt(this.ap.jump ** 2 + 2 * decel * drop * 4));
      // virages plus loin, jusqu'à la distance d'arrêt : vitesse encore permise ici (au-delà
      // de la fenêtre de 60 m ci-dessus, qui règle déjà les virages proches)
      for (let k = 18; k < reach; k += 3) {
        const c = this.line[(best + k) % n].clone().sub(this.line[(best + k - 4) % n]).setY(0).normalize();
        const e = this.line[(best + k + 14) % n].clone().sub(this.line[(best + k + 10) % n]).setY(0).normalize();
        const tk = Math.acos(Math.max(-1, Math.min(1, c.dot(e))));
        const vk = Math.max(10, this.ap.top - tk * this.ap.corner) * this.style.pace;
        const room = Math.max(0, (k - 4) * 4 - (k > drop ? speed * 1.1 : 0));
        limit = Math.min(limit, Math.sqrt(vk * vk + 2 * decel * room));
      }
    }
    // les véhicules rapides freinent au plus juste
    const slack = decel ? 1.5 : 4;
    return { steer, throttle: speed < limit ? 1 : 0, brake: speed > limit + slack ? 1 : 0 };
  }
}
