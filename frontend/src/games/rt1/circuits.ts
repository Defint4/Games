/* Les circuits jouables (tracés dans assets/rt1/circuits.py) et leurs médailles.

   Les médailles dépendent du véhicule : le meilleur tour du pilote automatique dans ce
   véhicule (pace.json, écrit par assets/rt1/bots.ts : `base` pour la citadine, `ratio` par
   véhicule) × un facteur par médaille. Miroir de backend/app/games/rt1/rules.py. */

import type { Dict } from "@/lib/i18n";
import PACE from "./pace.json";

export type Medal = "author" | "gold" | "silver" | "bronze";

export const MEDALS: Medal[] = ["author", "gold", "silver", "bronze"];

/* part du meilleur tour du pilote automatique : l'auteur le bat un peu, l'or vaut un tour
   soigné, l'argent et le bronze laissent de la marge */
export const MEDAL_FACTORS: Record<Medal, number> = { author: 0.985, gold: 1.03, silver: 1.13, bronze: 1.28 };

export type Circuit = {
  slug: string;
  region: string;
  name: Dict<string>;
  note: Dict<string>;
};

/* Une région de la campagne : une île (world_<région>.py), ses circuits. Dans l'ordre de
   déblocage ; la première est ouverte, chaque suivante s'ouvre avec le bronze sur tous les
   circuits de la précédente (rules.unlocked_regions, renvoyé dans l'état du pilote). */
export type Region = { slug: string; name: Dict<string>; note: Dict<string> };

export const REGIONS: Region[] = [
  { slug: "noumea", name: { fr: "Nouméa", en: "Nouméa" }, note: { fr: "Le front de mer, la ville, les collines.", en: "The seafront, the city, the hills." } },
  { slug: "grand-sud", name: { fr: "Grand Sud", en: "Deep South" }, note: { fr: "Terre rouge, lacs, maquis minier.", en: "Red dirt, lakes, mining scrubland." } },
];

export function circuitsOf(region: string): Circuit[] {
  return CIRCUITS.filter((c) => c.region === region);
}

/* Région précédente dans la campagne, celle dont il faut le bronze partout. */
export function regionBefore(region: string): Region | null {
  const i = REGIONS.findIndex((r) => r.slug === region);
  return i > 0 ? REGIONS[i - 1] : null;
}

type Pace = Record<string, { base: number; ratio: Record<string, number> }>;

/* Temps à battre (s) sur un circuit, pour un véhicule (la citadine à défaut). */
export function medalsFor(circuit: Circuit | string, vehicle: string): Record<Medal, number> {
  const slug = typeof circuit === "string" ? circuit : circuit.slug;
  const p = (PACE as Pace)[slug];
  const ref = p.base * (p.ratio[vehicle] ?? 1);
  return {
    author: Math.round(ref * MEDAL_FACTORS.author * 100) / 100,
    gold: Math.round(ref * MEDAL_FACTORS.gold * 100) / 100,
    silver: Math.round(ref * MEDAL_FACTORS.silver * 100) / 100,
    bronze: Math.round(ref * MEDAL_FACTORS.bronze * 100) / 100,
  };
}

export const CIRCUITS: Circuit[] = [
  {
    slug: "noumea",
    region: "noumea",
    name: { fr: "Front de mer", en: "Seafront" },
    note: { fr: "La baie, puis les collines. Un tour.", en: "The bay, then the hills. One lap." },
  },
  {
    slug: "centre-ville",
    region: "noumea",
    name: { fr: "Centre-ville", en: "Downtown" },
    note: { fr: "Entre les immeubles, virages serrés. Deux tours.", en: "Between the buildings, tight turns. Two laps." },
  },
  {
    slug: "le-col",
    region: "noumea",
    name: { fr: "Le col", en: "The pass" },
    note: { fr: "Lacets dans les collines, sans murs, un saut sur la crête.", en: "Hairpins in the hills, no walls, a jump on the ridge." },
  },
  {
    slug: "la-corniche",
    region: "noumea",
    name: { fr: "La corniche", en: "The cliff road" },
    note: { fr: "Falaises sur le lagon, rapide. Deux tours.", en: "Cliffs over the lagoon, fast. Two laps." },
  },
  {
    slug: "plaine-des-lacs",
    region: "grand-sud",
    name: { fr: "Plaine des Lacs", en: "Plain of Lakes" },
    note: { fr: "Grande boucle rapide sur la terre rouge, sans murs. Deux tours.", en: "Big fast loop over red dirt, no walls. Two laps." },
  },
  {
    slug: "yate",
    region: "grand-sud",
    name: { fr: "Yaté", en: "Yaté" },
    note: { fr: "Le lac et son barrage, montée sur la cuirasse, un saut sur la crête.", en: "The lake and its dam, up onto the plateau, a jump on the ridge." },
  },
  {
    slug: "prony",
    region: "grand-sud",
    name: { fr: "Baie de Prony", en: "Prony Bay" },
    note: { fr: "Le tour de la baie par la côte, les ruines du bagne, un saut.", en: "Round the bay along the coast, the penal colony ruins, a jump." },
  },
  {
    slug: "la-madeleine",
    region: "grand-sud",
    name: { fr: "La Madeleine", en: "La Madeleine" },
    note: { fr: "Court et technique entre deux lacs, une épingle. Deux tours.", en: "Short and technical between two lakes, a hairpin. Two laps." },
  },
];

export const DEFAULT_CIRCUIT = "noumea";

export function circuitBySlug(slug: string | null | undefined): Circuit {
  return CIRCUITS.find((c) => c.slug === slug) ?? CIRCUITS[0];
}

/* Meilleure médaille obtenue pour un temps (s) dans un véhicule ; comparée en ms, comme le
   serveur (rules.medals_for), pour que l'écran et les gains disent la même chose. */
export function medalFor(c: Circuit | string, time: number | null | undefined, vehicle: string): Medal | null {
  if (time == null) return null;
  const ms = Math.round(time * 1000);
  const limits = medalsFor(c, vehicle);
  return MEDALS.find((m) => ms <= Math.round(limits[m] * 1000)) ?? null;
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
