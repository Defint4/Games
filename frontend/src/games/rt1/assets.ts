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

/* Avancement du chargement (0 → 1), pondéré par la taille des fichiers. */
let progress = 0;
const listeners = new Set<(p: number) => void>();

export function onLoadProgress(fn: (p: number) => void): () => void {
  fn(progress);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* `total` : somme des poids annoncée d'avance, pour que la barre ne recule jamais. */
function tracker(total: number) {
  const parts: { weight: number; done: number }[] = [];
  const emit = () => {
    progress = parts.reduce((a, p) => a + p.weight * p.done, 0) / total;
    for (const fn of listeners) fn(progress);
  };
  /* `weight` ~ poids en centaines de ko ; `run` reçoit de quoi signaler une fraction. */
  return function track<T>(weight: number, run: (frac: (f: number) => void) => Promise<T>): Promise<T> {
    const part = { weight, done: 0 };
    parts.push(part);
    const frac = (f: number) => {
      part.done = Math.max(part.done, Math.min(0.99, f));
      emit();
    };
    return run(frac).then((v) => {
      part.done = 1;
      emit();
      return v;
    });
  };
}

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
    progress = 0;
    const track = tracker(52);
    const code = track(8, () => Promise.all([loaders(), import("./three/RaceScene")]));
    const physics = track(6, () => initPhysics());
    const [{ gltf, tex }] = await code;
    const { SRGBColorSpace } = await import("three");
    const glb = (weight: number, path: string) =>
      track(weight, (frac) => gltf.loadAsync(asset(path), (e) => e.total && frac(e.loaded / e.total)));
    const img = (weight: number, path: string, lightmap = false) =>
      track(weight, () =>
        tex.loadAsync(asset(path)).then((t) => {
          if (lightmap) {
            t.colorSpace = SRGBColorSpace;
            t.flipY = false;
          }
          return t;
        }),
      );
    const [level, levelGltf, flora, car, terrain, road, props, water, shadow] = await Promise.all([
      track(2, () => loadLevel(LEVEL)),
      glb(17, `${LEVEL}/level.glb`),
      glb(1, `${LEVEL}/flora.glb`),
      glb(1, "cars/starter.glb"),
      img(2, `${LEVEL}/lm_terrain.webp`, true),
      img(2, `${LEVEL}/lm_road.webp`, true),
      img(8, `${LEVEL}/lm_props.webp`, true),
      img(1, `${LEVEL}/water.png`),
      img(1, "cars/starter_shadow.png"),
      physics,
      track(3, () =>
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
      ),
    ]);
    return { level, levelGltf, flora, car, lightmaps: { terrain, road, props }, water, shadow };
  })().catch((e) => {
    warm = null;
    throw e;
  });
  return warm;
}
