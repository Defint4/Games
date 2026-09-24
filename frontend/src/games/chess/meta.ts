import { gameBySlug } from "@/lib/games";

export const GAME = gameBySlug("chess")!;

/* La partie en cours contre l'ordinateur. */
export const BOT_PATH = "/chess/bot";

/* Relecture d'une partie terminée (bilan). */
export function reviewPath(id: string): string {
  return `/chess/game/${id}`;
}

export type Category = "bullet" | "blitz" | "rapid" | "unlimited";

export type TimeControl = { id: string; base: number; increment: number; category: Category };

/* Les cadences de chess.com, dans l'ordre de leur grille (même liste que le serveur,
   backend/app/games/chess/engine.py). */
export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", base: 60, increment: 0, category: "bullet" },
  { id: "1+1", base: 60, increment: 1, category: "bullet" },
  { id: "2+1", base: 120, increment: 1, category: "bullet" },
  { id: "3+0", base: 180, increment: 0, category: "blitz" },
  { id: "3+2", base: 180, increment: 2, category: "blitz" },
  { id: "5+0", base: 300, increment: 0, category: "blitz" },
  { id: "10+0", base: 600, increment: 0, category: "rapid" },
  { id: "15+10", base: 900, increment: 10, category: "rapid" },
  { id: "30+0", base: 1800, increment: 0, category: "rapid" },
  { id: "unlimited", base: 0, increment: 0, category: "unlimited" },
];

export const DEFAULT_TIME_CONTROL = "10+0";

export function timeControl(id: string): TimeControl {
  return TIME_CONTROLS.find((tc) => tc.id === id) ?? TIME_CONTROLS[6];
}
