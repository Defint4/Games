/* Les circuits jouables (tracés dans assets/rt1/circuits.py) et leurs médailles.
   Temps en secondes, calibrés au pilote automatique (sim/autopilot.ts) : or ≈ son temps,
   auteur ≈ 5 % de mieux, argent + 10 %, bronze + 25 %. */

import type { Dict } from "@/lib/i18n";

export type Medal = "author" | "gold" | "silver" | "bronze";

export const MEDALS: Medal[] = ["author", "gold", "silver", "bronze"];

export type Circuit = {
  slug: string;
  name: Dict<string>;
  note: Dict<string>;
  medals: Record<Medal, number>;
};

export const CIRCUITS: Circuit[] = [
  {
    slug: "noumea",
    name: { fr: "Front de mer", en: "Seafront" },
    note: { fr: "La baie, puis les collines. Un tour.", en: "The bay, then the hills. One lap." },
    medals: { author: 47, gold: 49.5, silver: 54.5, bronze: 62 },
  },
  {
    slug: "centre-ville",
    name: { fr: "Centre-ville", en: "Downtown" },
    note: { fr: "Entre les immeubles, virages serrés. Deux tours.", en: "Between the buildings, tight turns. Two laps." },
    medals: { author: 73.5, gold: 77.5, silver: 85, bronze: 97 },
  },
  {
    slug: "le-col",
    name: { fr: "Le col", en: "The pass" },
    note: { fr: "Lacets dans les collines, sans murs, un saut sur la crête.", en: "Hairpins in the hills, no walls, a jump on the ridge." },
    medals: { author: 50, gold: 52.5, silver: 58, bronze: 66 },
  },
  {
    slug: "la-corniche",
    name: { fr: "La corniche", en: "The cliff road" },
    note: { fr: "Falaises sur le lagon, rapide. Deux tours.", en: "Cliffs over the lagoon, fast. Two laps." },
    medals: { author: 51, gold: 53.5, silver: 59, bronze: 67 },
  },
];

export const DEFAULT_CIRCUIT = "noumea";

export function circuitBySlug(slug: string | null | undefined): Circuit {
  return CIRCUITS.find((c) => c.slug === slug) ?? CIRCUITS[0];
}

/* Meilleure médaille obtenue pour un temps. */
export function medalFor(c: Circuit, time: number | null | undefined): Medal | null {
  if (time == null) return null;
  return MEDALS.find((m) => time <= c.medals[m]) ?? null;
}

export const MEDAL_COLORS: Record<Medal, [string, string]> = {
  author: ["#8CE6D2", "#1E8C84"],
  gold: ["#FFE08A", "#C99A1E"],
  silver: ["#E8EDF2", "#8C98A5"],
  bronze: ["#F2B48A", "#A3592B"],
};

/* Circuit choisi (retenu d'une visite à l'autre). */
const KEY = "games:rt1:circuit";

export function readCircuit(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_CIRCUIT;
  } catch {
    return DEFAULT_CIRCUIT;
  }
}

export function saveCircuit(slug: string) {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* stockage indisponible */
  }
}
