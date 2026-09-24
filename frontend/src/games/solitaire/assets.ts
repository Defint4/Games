import { preloadSounds } from "@/lib/sound";

/* Ce que le Solitaire doit avoir en cache avant d'ouvrir la table : les sons de cartes.
   Aucune image, toutes les faces sont dessinées. */
let warm: Promise<unknown> | null = null;

export function preloadAssets(): Promise<unknown> {
  warm ??= preloadSounds("cards");
  return warm;
}
