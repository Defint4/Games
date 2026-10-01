/* Chrono d'une course contre la montre : décompte, checkpoints dans l'ordre, arrivée
   sous le portique de départ. Le record du pilote (temps et passages) vient du serveur ;
   les écarts se comptent sur lui, ou sur le pilote défié. */

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
/* En ligne, le décompte suit l'horloge : une seconde par temps. */
const ONLINE_BEAT = 1;

export class Race {
  phase: Phase = "countdown";
  time = 0;
  countdown = 3 * BEAT;
  /* Course en direct : top départ commun, en Date.now() local ; le décompte le suit. */
  startAt: number | null = null;
  next = 0;
  splits: number[] = [];
  lastCheckpoint = -1;
  best: Best | null;
  /* référence des écarts : le pilote défié, sinon son propre record */
  private ref: Best | null;
  private rival: boolean;
  private gates: { pos: Vector3; dir: Vector3; side: Vector3; half: number }[];

  /* portes par tour (checkpoints + ligne), nombre de tours */
  readonly perLap: number;
  readonly laps: number;

  constructor(checkpoints: Gate[], finish: Gate, laps: number, best: Best | null, rival: Best | null) {
    this.perLap = checkpoints.length + 1;
    this.laps = laps;
    const lap = [...checkpoints, finish];
    this.gates = Array.from({ length: laps }, () => lap).flat().map((g) => {
      const dir = new Vector3(...g.dir).normalize();
      return { pos: new Vector3(...g.pos), dir, side: new Vector3(-dir.z, 0, dir.x), half: g.half };
    });
    this.best = best;
    this.rival = rival !== null;
    this.ref = rival ?? best;
  }

  get checkpointCount(): number {
    return this.gates.length - 1;
  }

  /* Tour en cours (1…laps) et checkpoints déjà passés dans ce tour. */
  get lap(): number {
    return Math.min(this.laps, Math.floor(this.next / this.perLap) + 1);
  }

  get lapCheckpoints(): number {
    return this.next % this.perLap;
  }

  reset() {
    this.phase = "countdown";
    this.time = 0;
    this.countdown = this.startAt === null ? 3 * BEAT : Infinity;
    this.next = 0;
    this.splits = [];
    this.lastCheckpoint = -1;
  }

  /* Avance le chrono d'un pas ; `from` → `to` est le déplacement de la voiture. En direct,
     le chrono est l'horloge commune (top départ du serveur) : une pause, un passage en
     arrière-plan ou un rechargement ne le suspendent pas, ils coûtent du temps. */
  step(h: number, from: Vector3, to: Vector3, emit: (e: RaceEvent) => void) {
    if (this.phase === "countdown") {
      const beat = this.startAt === null ? BEAT : ONLINE_BEAT;
      const before = Math.ceil(this.countdown / beat);
      this.countdown = this.startAt === null ? this.countdown - h : (this.startAt - Date.now()) / 1000;
      const after = Math.ceil(this.countdown / beat);
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.time = this.startAt === null ? 0 : -this.countdown;
        emit({ type: "go" });
      } else if (after !== before && after <= 3) emit({ type: "beat", n: after });
      return;
    }
    if (this.phase !== "racing") return;
    const before = this.time;
    this.time = this.startAt === null ? this.time + h : Math.max(this.time, (Date.now() - this.startAt) / 1000);
    const g = this.gates[this.next];
    const a = from.clone().sub(g.pos);
    const b = to.clone().sub(g.pos);
    const da = a.dot(g.dir);
    const db = b.dot(g.dir);
    if (da < 0 && db >= 0 && Math.abs(b.dot(g.side)) < g.half + 1.5 && Math.abs(b.y) < 9) {
      // instant exact du passage, interpolé dans le pas
      const t = before + ((this.time - before) * -da) / (db - da);
      const index = this.next;
      this.splits[index] = t;
      const ref = this.ref?.splits[index];
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
          if (!this.rival) this.ref = this.best;
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
