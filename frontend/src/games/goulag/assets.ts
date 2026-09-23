import { preloadCards } from "@/lib/preloadCards";
import { preloadSounds } from "@/lib/sound";

/* Ce que la table du Goulag doit avoir en cache : les cartes, leurs sons et ceux des coups. */
export function preloadAssets(): Promise<unknown> {
  return Promise.all([preloadCards(), preloadSounds("cards", "combat")]);
}
