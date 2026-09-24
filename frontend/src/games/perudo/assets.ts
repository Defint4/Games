import { preloadSounds } from "@/lib/sound";

/* Ce que la table du Perudo doit avoir en cache : les sons de dés, le code de la scène
   3D (three.js, chargé seulement ici) et ses textures, calculées d'avance pour que la
   scène apparaisse sans à-coup. Aucune image de carte. */
let warm: Promise<unknown> | null = null;

export function preloadAssets(): Promise<unknown> {
  // Un échec (réseau, fichier disparu après un déploiement) n'est pas gardé : la
  // prochaine entrée à table retente.
  warm ??= Promise.all([
    preloadSounds("dice"),
    import("./three/TableScene"),
    import("./three/warmup").then((m) => m.warmup()),
  ]).catch((e) => {
    warm = null;
    throw e;
  });
  return warm;
}
