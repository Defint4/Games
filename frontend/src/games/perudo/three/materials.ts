/* Matériaux partagés : un jeu de six faces par couleur de dés, un cuir par gobelet. */

import * as THREE from "three";
import { FACE_VALUES } from "./geometry";
import { dieFaceMap, dieFaceNormal, leatherMaps, type DiceColor } from "./textures";

const dice = new Map<string, THREE.Material[]>();

/* Résine polie : un vernis (clearcoat) qui accroche les reflets des lampes. */
export function diceMaterials(color: DiceColor): THREE.Material[] {
  let set = dice.get(color.body);
  if (!set) {
    set = FACE_VALUES.map(
      (value) =>
        new THREE.MeshPhysicalMaterial({
          map: dieFaceMap(value, color),
          normalMap: dieFaceNormal(value),
          normalScale: new THREE.Vector2(0.9, 0.9),
          roughness: 0.32,
          clearcoat: 0.8,
          clearcoatRoughness: 0.18,
        }),
    );
    dice.set(color.body, set);
  }
  return set;
}

const leathers = new Map<string, THREE.MeshPhysicalMaterial>();

/* Cuir ciré : la teinte vient de `base`, le grain des cartes partagées ; un léger
   voile (sheen) comme sur un cuir patiné, un vernis presque mat par-dessus. Les ombres
   de creux arrivent par les couleurs de sommets de la géométrie. */
export function leatherMaterial(base: string): THREE.MeshPhysicalMaterial {
  let material = leathers.get(base);
  if (!material) {
    const { map, normal, roughness } = leatherMaps();
    material = new THREE.MeshPhysicalMaterial({
      color: base,
      map,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: roughness,
      roughness: 1,
      sheen: 0.35,
      sheenColor: new THREE.Color("#ffd8b0"),
      sheenRoughness: 0.5,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      vertexColors: true,
      // Le gobelet est une coque ouverte : par défaut three.js ne projette que les faces
      // arrière dans l'ombre, et la paroi y laissait des trous autour des surpiqûres.
      shadowSide: THREE.DoubleSide,
    });
    leathers.set(base, material);
  }
  return material;
}
