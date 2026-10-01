/* Dimensions des véhicules pour les modèles Blender (vehicles.py) : une seule source,
   src/games/rt1/sim/vehicles.ts. Lancé par build.sh. */

import { VEHICLES } from "../../src/games/rt1/sim/vehicles";

console.log(JSON.stringify(Object.fromEntries(VEHICLES.map((v) => [v.id, v.spec]))));
