/* Où est la voiture par rapport à la route : point de l'axe le plus proche et écart
   latéral. Sert au hors-piste et à la remise en piste. */

import { Vector3 } from "three";
import type { V3 } from "./level";

export class TrackLocator {
  private pts: Vector3[];
  private idx = -1;
  private a = new Vector3();
  private b = new Vector3();

  constructor(line: V3[]) {
    this.pts = line.map((p) => new Vector3(...p));
  }

  get length(): number {
    return this.pts.length;
  }

  reset(i = -1) {
    this.idx = i;
  }

  /* Index du point d'axe le plus proche et distance horizontale à l'axe (m). */
  locate(pos: Vector3): { i: number; lateral: number } {
    const n = this.pts.length;
    let best = -1;
    let bd = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % n) + n) % n;
        const p = this.pts[i];
        const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + ((p.y - pos.y) * 2) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    };
    if (this.idx >= 0) scan(this.idx - 8, this.idx + 20);
    if (best < 0 || bd > 30 * 30) scan(0, n - 1);
    this.idx = best;
    // distance au segment le plus proche (avant ou après le point)
    let lateral = Infinity;
    for (const j of [best - 1, best]) {
      const p = this.pts[((j % n) + n) % n];
      const q = this.pts[(((j + 1) % n) + n) % n];
      this.a.set(q.x - p.x, 0, q.z - p.z);
      this.b.set(pos.x - p.x, 0, pos.z - p.z);
      const t = Math.max(0, Math.min(1, this.b.dot(this.a) / Math.max(1e-6, this.a.lengthSq())));
      lateral = Math.min(lateral, this.b.addScaledVector(this.a, -t).length());
    }
    return { i: best, lateral };
  }

  /* Position et direction de l'axe au point i (pour y reposer la voiture). */
  pose(i: number): { pos: Vector3; dir: Vector3 } {
    const n = this.pts.length;
    const p = this.pts[((i % n) + n) % n];
    const q = this.pts[(((i + 2) % n) + n) % n];
    return { pos: p.clone(), dir: q.clone().sub(p).setY(0).normalize() };
  }
}
