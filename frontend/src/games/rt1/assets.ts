/* Tout ce qu'une course doit avoir avant le premier affichage : physique (wasm),
   circuit, modèles, cartes de lumière, textures calculées, code de la scène. */

import type { Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { initPhysics } from "./sim/game";
import { asset, type LevelData, loadLevel } from "./sim/level";

export type RaceAssets = {
  level: LevelData;
  levelGltf: GLTF;
  flora: GLTF;
  car: GLTF;
  lightmaps: { terrain: Texture; road: Texture; props: Texture };
  water: Texture;
  shadow: Texture;
};

export const LEVEL = "noumea";

let warm: Promise<RaceAssets> | null = null;

async function loaders() {
  const [{ GLTFLoader }, { MeshoptDecoder }, { TextureLoader }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    import("three"),
  ]);
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return { gltf, tex: new TextureLoader() };
}

export function preloadAssets(): Promise<RaceAssets> {
  warm ??= (async () => {
    const { gltf, tex } = await loaders();
    const { SRGBColorSpace } = await import("three");
    const lm = (name: string) =>
      tex.loadAsync(asset(`${LEVEL}/${name}`)).then((t) => {
        t.colorSpace = SRGBColorSpace;
        t.flipY = false;
        return t;
      });
    const [level, levelGltf, flora, car, terrain, road, props, water, shadow] = await Promise.all([
      loadLevel(LEVEL),
      gltf.loadAsync(asset(`${LEVEL}/level.glb`)),
      gltf.loadAsync(asset(`${LEVEL}/flora.glb`)),
      gltf.loadAsync(asset("cars/starter.glb")),
      lm("lm_terrain.webp"),
      lm("lm_road.webp"),
      lm("lm_props.webp"),
      tex.loadAsync(asset(`${LEVEL}/water.png`)),
      tex.loadAsync(asset("cars/starter_shadow.png")),
      initPhysics(),
      import("./three/RaceScene"),
      import("./three/materials").then(
        (m) =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              m.roadTexture(8);
              m.detailTexture();
              resolve();
            }, 0),
          ),
      ),
    ]);
    return { level, levelGltf, flora, car, lightmaps: { terrain, road, props }, water, shadow };
  })().catch((e) => {
    warm = null;
    throw e;
  });
  return warm;
}
