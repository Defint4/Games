/* L'atelier : neuf pièces à améliorer du niveau 1 (d'origine) au niveau 5, et au niveau 5
   d'une pièce ses réglages fins (de -1 à +1). Tout revient à modifier la physique du
   véhicule (CarSpec). Coûts : miroir de backend/app/games/rt1/rules.py (upgrade_cost). */

import type { Livery } from "../livery";
import type { CarSpec } from "./car";
import type { Vehicle } from "./vehicles";

export type Part = "engine" | "turbo" | "gearbox" | "drivetrain" | "tyres" | "suspension" | "brakes" | "aero" | "weight";
export const PARTS: Part[] = ["engine", "turbo", "gearbox", "drivetrain", "tyres", "suspension", "brakes", "aero", "weight"];
export const MAX_LEVEL = 5;

export type Tune = "gearing" | "height" | "stiffness" | "downforce" | "brakeBias";
/* chaque réglage s'ouvre avec le niveau 5 d'une pièce */
export const TUNES: { key: Tune; part: Part }[] = [
  { key: "gearing", part: "gearbox" },
  { key: "height", part: "suspension" },
  { key: "stiffness", part: "suspension" },
  { key: "downforce", part: "aero" },
  { key: "brakeBias", part: "brakes" },
];

/* État de l'atelier d'un véhicule, tel que le serveur le garde (livrée comprise). */
export type Workshop = {
  levels: Partial<Record<Part, number>>;
  tune: Partial<Record<Tune, number>>;
  livery?: Livery;
};

/* Gain par niveau au-delà du premier (4 niveaux au plus). */
const PER_LEVEL: Record<Part, (s: CarSpec, k: number) => void> = {
  engine: (s, k) => {
    s.engine *= 1 + 0.04 * k;
    s.topSpeed *= 1 + 0.012 * k;
  },
  turbo: (s, k) => {
    s.engine *= 1 + 0.03 * k;
  },
  gearbox: (s, k) => {
    s.engine *= 1 + 0.012 * k;
    s.topSpeed *= 1 + 0.01 * k;
  },
  drivetrain: (s, k) => {
    s.engine *= 1 + 0.02 * k;
  },
  tyres: (s, k) => {
    s.gripFront *= 1 + 0.022 * k;
    s.gripRear *= 1 + 0.022 * k;
  },
  suspension: (s, k) => {
    s.antiRoll *= 1 + 0.08 * k;
    s.gripFront *= 1 + 0.006 * k;
    s.gripRear *= 1 + 0.006 * k;
  },
  brakes: (s, k) => {
    s.brake *= 1 + 0.07 * k;
  },
  aero: (s, k) => {
    s.downforce *= 1 + 0.12 * k;
    s.drag *= 1 - 0.02 * k;
  },
  weight: (s, k) => {
    // moins de masse : même moteur, mêmes pneus, plus vif ; la suspension suit
    const m = 1 - 0.03 * k;
    s.mass *= m;
    s.spring *= m;
    s.bump *= m;
    s.rebound *= m;
  },
};

/* Réglages fins, x de -1 à +1 : chacun est un compromis. */
const TUNE_EFFECT: Record<Tune, (s: CarSpec, x: number) => void> = {
  // court (-) : reprises plus fortes, pointe plus basse ; long (+) : l'inverse
  gearing: (s, x) => {
    s.engine *= 1 - 0.06 * x;
    s.topSpeed *= 1 + 0.04 * x;
  },
  // bas (-) : centre de gravité plus bas, moins de débattement
  height: (s, x) => {
    s.rest *= 1 + 0.18 * x;
    s.comY += 0.05 * x;
  },
  stiffness: (s, x) => {
    s.spring *= 1 + 0.2 * x;
    s.antiRoll *= 1 + 0.25 * x;
    s.bump *= 1 + 0.2 * x;
    s.rebound *= 1 + 0.2 * x;
  },
  // plus d'appui : plus d'adhérence en courbe, plus de traînée
  downforce: (s, x) => {
    s.downforce *= 1 + 0.35 * x;
    s.drag *= 1 + 0.1 * x;
  },
  // part du freinage sur l'avant, autour de 60 %
  brakeBias: (s, x) => {
    s.brakeFront = 0.6 + 0.1 * x;
  },
};

/* La physique d'un véhicule avec son atelier. */
export function tunedSpec(v: Vehicle, w: Workshop | undefined): CarSpec {
  const s: CarSpec = { ...v.spec, half: [...v.spec.half] as CarSpec["half"] };
  if (!w) return s;
  for (const p of PARTS) {
    const k = Math.max(0, Math.min(MAX_LEVEL, w.levels[p] ?? 1) - 1);
    if (k) PER_LEVEL[p](s, k);
  }
  for (const { key, part } of TUNES) {
    const x = w.tune[key];
    if (x && (w.levels[part] ?? 1) >= MAX_LEVEL) TUNE_EFFECT[key](s, Math.max(-1, Math.min(1, x)));
  }
  return s;
}

export function tunedVehicle(v: Vehicle, w: Workshop | undefined): Vehicle {
  return w ? { ...v, spec: tunedSpec(v, w) } : v;
}

/* Indice de performance : pointe, accélération, adhérence (appui compris), de ~300
   (camion d'origine) à ~900 (F1). Certaines missions le plafonnent. */
export function performanceIndex(s: CarSpec): number {
  const grip = (s.gripFront + s.gripRear) / 2 + (s.downforce * 400) / s.mass / 100;
  const f = (0.45 * (s.topSpeed - 30)) / 52 + (0.3 * (s.engine / s.mass - 5)) / 17 + (0.25 * (grip - 1.2)) / 0.95;
  return Math.round(100 + 800 * f);
}

/* Prix du niveau suivant d'une pièce (miroir de rules.upgrade_cost). */
const STEP = [0, 0.02, 0.03, 0.05, 0.07];

export function upgradeCost(v: Vehicle, level: number): number {
  const ref = Math.max(v.price, 6000);
  return Math.round((ref * STEP[level]) / 50) * 50;
}
