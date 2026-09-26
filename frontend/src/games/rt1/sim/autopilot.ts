/* Pilote automatique : suit la ligne du circuit en visant un point devant lui et
   freine avant les virages serrés. Sert aux tests (?autopilot) et servira de base aux
   bots. */

import { Quaternion, Vector3 } from "three";
import type { Car } from "./car";
import type { Controls } from "./input";
import type { V3 } from "./level";

export class Autopilot {
  private line: Vector3[];
  private idx = 0;
  private q = new Quaternion();
  private fwd = new Vector3();
  private to = new Vector3();

  constructor(line: V3[]) {
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
    const target = this.line[(best + ahead) % n];
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
    const limit = 52 - turn * 38;
    return { steer, throttle: speed < limit ? 1 : 0, brake: speed > limit + 4 ? 1 : 0 };
  }
}
