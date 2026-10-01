/* Tout ce qu'une course doit avoir avant le premier affichage : physique (wasm),
   circuit, modèles, cartes de lumière, textures calculées, code de la scène, et le
   véhicule (chargé à part : on en change sans recharger le circuit). */

import type { Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { initPhysics } from "./sim/game";
import { asset, type LevelData, loadLevel } from "./sim/level";
import { type Vehicle, vehicleById } from "./sim/vehicles";

/* Un véhicule : modèle (objets body et wheel) et ombre de contact cuite. */
export type CarModel = { gltf: GLTF; shadow: Texture };

type LevelAssets = {
  slug: string;
  level: LevelData;
  levelGltf: GLTF;
  flora: GLTF;
  lightmaps: { terrain: Texture; road: Texture; props: Texture };
  water: Texture;
};

export type RaceAssets = LevelAssets & { vehicle: Vehicle; car: CarModel };

/* Un seul circuit gardé en mémoire : en changer libère le précédent. */
let warm: { slug: string; promise: Promise<LevelAssets> } | null = null;

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

let loading: ReturnType<typeof makeLoaders> | null = null;

function loaders() {
  loading ??= makeLoaders();
  return loading;
}

async function makeLoaders() {
  const [{ GLTFLoader }, { MeshoptDecoder }, { TextureLoader }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    import("three"),
  ]);
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return { gltf, tex: new TextureLoader() };
}

const cars = new Map<string, Promise<CarModel>>();

/* Le modèle d'un véhicule, gardé une fois chargé (quelques dizaines de ko). */
export function loadCar(id: string): Promise<CarModel> {
  let p = cars.get(id);
  if (!p) {
    p = loaders().then(async ({ gltf, tex }) => {
      const [model, shadow] = await Promise.all([gltf.loadAsync(asset(`cars/${id}.glb`)), tex.loadAsync(asset(`cars/${id}_shadow.png`))]);
      return { gltf: model, shadow };
    });
    p.catch(() => cars.delete(id));
    cars.set(id, p);
  }
  return p;
}

export function preloadAssets(slug: string, vehicleId: string): Promise<RaceAssets> {
  const vehicle = vehicleById(vehicleId);
  return Promise.all([levelAssets(slug), loadCar(vehicle.id)]).then(([level, car]) => ({ ...level, vehicle, car }));
}

function levelAssets(slug: string): Promise<LevelAssets> {
  if (warm?.slug === slug) return warm.promise;
  const promise = (async () => {
    progress = 0;
    const LEVEL = slug;
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
    const [level, levelGltf, flora, terrain, road, props, water] = await Promise.all([
      track(2, () => loadLevel(LEVEL)),
      glb(17, `${LEVEL}/level.glb`),
      glb(2, `${LEVEL}/flora.glb`),
      img(2, `${LEVEL}/lm_terrain.webp`, true),
      img(2, `${LEVEL}/lm_road.webp`, true),
      img(8, `${LEVEL}/lm_props.webp`, true),
      img(2, `${LEVEL}/water.png`),
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
    return { slug, level, levelGltf, flora, lightmaps: { terrain, road, props }, water };
  })();
  promise.catch(() => {
    if (warm?.promise === promise) warm = null;
  });
  warm = { slug, promise };
  return promise;
}
