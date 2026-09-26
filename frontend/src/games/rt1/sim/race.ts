/* Chrono d'une course contre la montre : décompte, checkpoints dans l'ordre, arrivée
   sous le portique de départ. Le meilleur temps et ses temps intermédiaires restent dans
   le téléphone (pas encore de serveur). */

import { Vector3 } from "three";
import type { Gate } from "./level";

export type Phase = "countdown" | "racing" | "finished";

export type RaceEvent =
  | { type: "beat"; n: number }
  | { type: "go" }
  | { type: "checkpoint"; index: number; count: number; time: number; delta: number | null }
  | { type: "finish"; time: number; delta: number | null; best: boolean };

export type Best = { time: number; splits: number[] };

const BEAT = 0.6;

export class Race {
  phase: Phase = "countdown";
  time = 0;
  countdown = 3 * BEAT;
  next = 0;
  splits: number[] = [];
  lastCheckpoint = -1;
  best: Best | null;
  private gates: { pos: Vector3; dir: Vector3; side: Vector3; half: number }[];
  private storeKey: string;

  constructor(level: string, checkpoints: Gate[], finish: Gate) {
    this.storeKey = `games:rt1:best:${level}`;
    this.gates = [...checkpoints, finish].map((g) => {
      const dir = new Vector3(...g.dir).normalize();
      return { pos: new Vector3(...g.pos), dir, side: new Vector3(-dir.z, 0, dir.x), half: g.half };
    });
    this.best = readBest(this.storeKey);
  }

  get checkpointCount(): number {
    return this.gates.length - 1;
  }

  reset() {
    this.phase = "countdown";
    this.time = 0;
    this.countdown = 3 * BEAT;
    this.next = 0;
    this.splits = [];
    this.lastCheckpoint = -1;
  }

  /* Avance le chrono d'un pas ; `from` → `to` est le déplacement de la voiture. */
  step(h: number, from: Vector3, to: Vector3, emit: (e: RaceEvent) => void) {
    if (this.phase === "countdown") {
      const before = Math.ceil(this.countdown / BEAT);
      this.countdown -= h;
      const after = Math.ceil(this.countdown / BEAT);
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.time = 0;
        emit({ type: "go" });
      } else if (after !== before) emit({ type: "beat", n: after });
      return;
    }
    if (this.phase !== "racing") return;
    this.time += h;
    const g = this.gates[this.next];
    const a = from.clone().sub(g.pos);
    const b = to.clone().sub(g.pos);
    const da = a.dot(g.dir);
    const db = b.dot(g.dir);
    if (da < 0 && db >= 0 && Math.abs(b.dot(g.side)) < g.half + 1.5 && Math.abs(b.y) < 9) {
      // instant exact du passage, interpolé dans le pas
      const t = this.time - h + (h * -da) / (db - da);
      const index = this.next;
      this.splits[index] = t;
      const ref = this.best?.splits[index];
      const delta = ref != null ? t - ref : null;
      if (index < this.checkpointCount) {
        this.lastCheckpoint = index;
        this.next++;
        emit({ type: "checkpoint", index, count: this.checkpointCount, time: t, delta });
      } else {
        this.phase = "finished";
        this.time = t;
        const isBest = !this.best || t < this.best.time;
        if (isBest) {
          this.best = { time: t, splits: [...this.splits] };
          writeBest(this.storeKey, this.best);
        }
        emit({ type: "finish", time: t, delta, best: isBest });
      }
    }
  }

  /* Où reprendre après une sortie : le dernier checkpoint franchi, sinon le départ. */
  respawnGate(): { pos: Vector3; dir: Vector3 } | null {
    if (this.lastCheckpoint < 0) return null;
    const g = this.gates[this.lastCheckpoint];
    return { pos: g.pos, dir: g.dir };
  }
}

function readBest(key: string): Best | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Best) : null;
  } catch {
    return null;
  }
}

function writeBest(key: string, best: Best) {
  try {
    localStorage.setItem(key, JSON.stringify(best));
  } catch {
    /* stockage indisponible */
  }
}

export function formatTime(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

export function formatDelta(d: number): string {
  return `${d < 0 ? "-" : "+"}${Math.abs(d).toFixed(3)}`;
}
