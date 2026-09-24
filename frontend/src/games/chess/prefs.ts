"use client";

/* Apparence et confort de jeu aux échecs, propres à l'appareil : jeu de pièces,
   échiquier, coups possibles, coordonnées, dame automatique. */

import { useSyncExternalStore } from "react";
import { dict } from "@/lib/i18n";

export type PieceSet = "staunty" | "cburnett" | "maestro" | "merida";
export type BoardTheme = "green" | "wood" | "ice" | "marble";

export const PIECE_SETS = dict<Record<PieceSet, string>>({
  fr: { staunty: "Staunty", cburnett: "Classique", maestro: "Maestro", merida: "Merida" },
  en: { staunty: "Staunty", cburnett: "Classic", maestro: "Maestro", merida: "Merida" },
});

export const BOARD_THEMES = dict<Record<BoardTheme, string>>({
  fr: { green: "Vert", wood: "Bois", ice: "Glacier", marble: "Marbre" },
  en: { green: "Green", wood: "Wood", ice: "Ice", marble: "Marble" },
});

export type ChessPrefs = {
  pieces: PieceSet;
  board: BoardTheme;
  /* Points sur les cases où la pièce choisie peut aller. */
  legal: boolean;
  coords: boolean;
  /* Promotion directe en dame, sans le choix de la pièce. */
  autoQueen: boolean;
};

const KEY = "games:chess";
const DEFAULTS: ChessPrefs = {
  pieces: "staunty",
  board: "green",
  legal: true,
  coords: true,
  autoQueen: false,
};

let cache: ChessPrefs | null = null;
const listeners = new Set<() => void>();

function read(): ChessPrefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ChessPrefs>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache ?? DEFAULTS;
}

export function getChessPrefs(): ChessPrefs {
  return typeof window === "undefined" ? DEFAULTS : read();
}

export function setChessPref<K extends keyof ChessPrefs>(key: K, value: ChessPrefs[K]) {
  cache = { ...read(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* stockage indisponible */
  }
  for (const listener of listeners) listener();
}

export function useChessPrefs(): ChessPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getChessPrefs,
    () => DEFAULTS,
  );
}
