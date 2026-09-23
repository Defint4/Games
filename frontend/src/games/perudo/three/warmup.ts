/* Calcule d'avance les textures de la scène (grain du cuir, feutre, faces des dés) :
   quelques dizaines de millisecondes de calcul qu'on préfère payer pendant l'écran
   d'attente plutôt qu'à l'apparition de la table. */

import { DICE_COLORS, FELT_COLORS } from "../colors";
import { dieFaceMap, dieFaceNormal, feltMaps, leatherMaps } from "./textures";

export function warmup(): Promise<void> {
  return new Promise((resolve) => {
    // Hors du fil de l'affichage en cours : on laisse le navigateur peindre d'abord.
    setTimeout(() => {
      leatherMaps();
      Object.values(FELT_COLORS).forEach(feltMaps);
      for (let face = 1; face <= 6; face++) {
        dieFaceNormal(face);
        DICE_COLORS.forEach((color) => dieFaceMap(face, color));
      }
      resolve();
    }, 0);
  });
}
