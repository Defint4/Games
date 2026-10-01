/* Les bots : des tours du pilote automatique enregistrés d'avance (assets/rt1/bots.ts,
   public/rt1/<circuit>/bots-<véhicule>.bin), rejoués comme des fantômes. Ils roulent dans
   le véhicule du joueur. Chaque bot prend l'enregistrement le plus proche de son temps
   cible et le rejoue un peu plus vite ou plus lentement pour tomber pile dessus. Aucun
   calcul de physique en course : 7 bots ne coûtent que 7 interpolations par image. */

import type { Quaternion, Vector3 } from "three";
import { ghostPose } from "./ghost";
import { asset } from "./level";

export type BotLevel = "easy" | "normal" | "hard" | "expert";
export const BOT_LEVELS: BotLevel[] = ["easy", "normal", "hard", "expert"];
export const MAX_BOTS = 7;

/* Prime du vainqueur, miroir de backend/app/games/rt1/rules.py (bots_money). */
const BOT_MONEY: Record<BotLevel, number> = { easy: 200, normal: 400, hard: 800, expert: 1500 };

export function botsPrize(level: BotLevel, count: number): number {
  return Math.round((BOT_MONEY[level] * count) / MAX_BOTS / 10) * 10;
}

/* Réglage retenu d'une course à l'autre. */
const PREF_KEY = "games:rt1:bots";

export function readBotsPref(): { level: BotLevel; count: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
    if (p && BOT_LEVELS.includes(p.level) && p.count >= 1 && p.count <= MAX_BOTS) return p;
  } catch {
    /* stockage indisponible ou illisible */
  }
  return { level: "normal", count: MAX_BOTS };
}

export function saveBotsPref(pref: { level: BotLevel; count: number }) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* stockage indisponible */
  }
}

/* Un tour enregistré : temps, passages, poses au format du fantôme (t, x, y, z, q). */
export type BotRun = { time: number; splits: number[]; ghost: Float32Array };

/* Les tours d'un véhicule sur un circuit, et son rythme rapporté à la citadine (sur
   laquelle les médailles, donc les fourchettes des niveaux, sont calées). */
export type BotRuns = { ratio: number; runs: BotRun[] };

/* Des animaux du pays, et une couleur chacun. */
const NAMES = ["Cagou", "Notou", "Roussette", "Tricot rayé", "Dugong", "Frégate", "Bulime"];
const COLORS = ["#3CCFC6", "#F4B942", "#77A34B", "#2F7BFF", "#F2F2F2", "#C8232C", "#7B5BD6"];

/* Fourchette des temps des bots, d'après les médailles du circuit : les plus rapides
   d'un niveau valent la médaille indiquée. */
type Medals = { author: number; gold: number; silver: number; bronze: number };
function window(level: BotLevel, m: Medals): [number, number] {
  switch (level) {
    case "easy":
      return [m.silver, m.bronze * 1.08];
    case "normal":
      return [m.gold, m.bronze];
    case "hard":
      return [m.author, m.silver];
    case "expert":
      return [m.author * 0.98, m.gold];
  }
}

/* Écrit par assets/rt1/bots.ts : u16 nombre de tours, u8 poses par seconde, f32 rythme
   rapporté à la citadine, puis pour chaque tour f32 temps, u16 + f32[] passages,
   u32 + i16[7 × n] poses (position au 1/20 m, rotation × 32767). Petit-boutiste. */
export function decodeRuns(buf: ArrayBuffer): BotRuns {
  const v = new DataView(buf);
  let o = 0;
  const runs: BotRun[] = [];
  const count = v.getUint16(o, true);
  const hz = v.getUint8(o + 2);
  const ratio = v.getFloat32(o + 3, true);
  o += 7;
  for (let r = 0; r < count; r++) {
    const time = v.getFloat32(o, true);
    o += 4;
    const ns = v.getUint16(o, true);
    o += 2;
    const splits: number[] = [];
    for (let k = 0; k < ns; k++, o += 4) splits.push(v.getFloat32(o, true));
    const n = v.getUint32(o, true);
    o += 4;
    const ghost = new Float32Array(n * 8);
    for (let k = 0; k < n; k++) {
      ghost[k * 8] = k / hz;
      for (let c = 0; c < 7; c++, o += 2) {
        const x = v.getInt16(o, true);
        ghost[k * 8 + 1 + c] = c < 3 ? x / 20 : x / 32767;
      }
    }
    runs.push({ time, splits, ghost });
  }
  return { ratio, runs };
}

const cache = new Map<string, Promise<BotRuns>>();

export function loadBotRuns(slug: string, vehicle: string): Promise<BotRuns> {
  const key = `${slug}/bots-${vehicle}.bin`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(asset(key)).then((r) => {
      if (!r.ok) throw new Error(`bots ${r.status}`);
      return r.arrayBuffer().then(decodeRuns);
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export type Bot = {
  name: string;
  color: string;
  /* temps final et passages, une fois l'enregistrement recalé */
  time: number;
  splits: number[];
  ghost: Float32Array;
  /* durée réelle / durée enregistrée */
  scale: number;
};

/* Les bots d'une course : `count` pilotes du niveau, étalés dans sa fourchette (ramenée
   au rythme du véhicule), avec un peu de hasard d'une course à l'autre. */
export function pickBots(set: BotRuns, medals: Medals, level: BotLevel, count: number): Bot[] {
  const [lo, hi] = window(level, medals).map((t) => t * set.ratio);
  const free = [...set.runs];
  const bots: Bot[] = [];
  for (let k = 0; k < count && free.length; k++) {
    const target = (lo + ((hi - lo) * (k + 0.5)) / count) * (1 + (Math.random() - 0.5) * 0.016);
    let best = 0;
    for (let i = 1; i < free.length; i++) {
      if (Math.abs(Math.log(target / free[i].time)) < Math.abs(Math.log(target / free[best].time))) best = i;
    }
    const run = free.splice(best, 1)[0];
    const scale = target / run.time;
    bots.push({
      name: NAMES[k],
      color: COLORS[k],
      time: target,
      splits: run.splits.map((s) => s * scale),
      ghost: run.ghost,
      scale,
    });
  }
  return bots;
}

/* Pose d'un bot au temps de course t ; faux une fois arrivé (il s'efface). */
export function botPose(b: Bot, t: number, p: Vector3, q: Quaternion, q2: Quaternion): boolean {
  if (t > b.time + 0.6) return false;
  return ghostPose(b.ghost, Math.max(0, t) / b.scale, p, q, q2);
}
