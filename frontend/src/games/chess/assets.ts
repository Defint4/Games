import { preloadSounds } from "@/lib/sound";
import { getChessPrefs } from "./prefs";
import { preloadPieces } from "./themes";

/* Ce que l'échiquier doit avoir en cache : les pièces du jeu choisi et les bruits de
   bois. Les autres jeux de pièces se chargent au moment où on les choisit. */
export function preloadAssets(): Promise<unknown> {
  return Promise.all([preloadSounds("chess"), preloadPieces(getChessPrefs().pieces)]);
}
