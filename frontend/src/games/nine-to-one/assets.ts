import { preloadCards } from "@/lib/preloadCards";
import { preloadSounds } from "@/lib/sound";

/* Ce que la table de Nine to One doit avoir en cache : les 52 cartes et leurs sons. */
export function preloadAssets(): Promise<unknown> {
  return Promise.all([preloadCards(), preloadSounds("cards")]);
}
