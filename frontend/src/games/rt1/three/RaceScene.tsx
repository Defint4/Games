"use client";

/* La scène de course : le circuit cuit, le lagon, la végétation, la voiture et la
   caméra (construits dans kit.ts). La simulation avance dans le même useFrame que le
   rendu. */

import { Environment } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Governor, type QualityPref, startTier, type Tier, TIERS } from "../quality";
import { BackSide, Color, type DirectionalLight, type Mesh, NeutralToneMapping, type PerspectiveCamera, SphereGeometry, Vector3 } from "three";
import { groundLight } from "../sim/level";
import type { CarModel, RaceAssets } from "../assets";
import { type Vehicle, vehicleById } from "../sim/vehicles";
import type { Livery } from "../livery";
import { bungee } from "../meta";
import type { Game } from "../sim/game";
import { BotsView, buildFlora, buildLevel, buildWater, type CamMode, CarView, cullFlora, GhostView, Rig } from "./kit";
import { clock, FOG, skyMaterial } from "./materials";

export type { CamMode };

/* Mesures de rendu de la dernière image (affichées en mode ?debug). */
export const renderStats = { calls: 0, triangles: 0, dpr: 1 };

type Props = {
  game: Game;
  assets: RaceAssets;
  camMode: CamMode;
  livery: Livery;
  paused: boolean;
  ghost: boolean;
  /* véhicule du fantôme suivi, s'il n'est pas celui du joueur */
  ghostCar?: { model: CarModel; vehicle: Vehicle } | null;
  /* course en direct : le modèle de chaque véhicule des autres pilotes */
  rivalCars?: Record<string, CarModel>;
  onFrame: (dt: number) => void;
  onReady: () => void;
  /* contexte WebGL perdu (mémoire, retour d'arrière-plan) : la course se met en pause */
  onContextLost?: () => void;
  /* réglage de qualité choisi dans le menu pause (la définition suit tout de suite) */
  quality: QualityPref;
};

export default function RaceScene(props: Props) {
  // Palier de qualité de cette course (préférence, palier appris, ou estimation) : MSAA et
  // cadence sont fixés à la création du rendu ; la définition se règle en direct.
  const [tier] = useState<Tier>(startTier);
  const spec = TIERS[tier];
  const device = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const [dpr, setDpr] = useState(() => Math.min(device, spec.dpr[0]));
  return (
    <Canvas
      dpr={dpr}
      frameloop="never"
      // tailles de mise en page (offset) : justes même quand le rendu est tourné de 90°
      resize={{ offsetSize: true }}
      // tone mapping neutre (Khronos) : garde les teintes de la palette, et le brouillard
      // (mélangé après) retrouve la couleur de l'horizon ; ACES délavait le lagon et faisait
      // une bande à l'horizon. Canvas opaque : rien à composer avec la page.
      gl={{ antialias: spec.msaa, alpha: false, powerPreference: "high-performance", stencil: false, toneMapping: NeutralToneMapping }}
      // near large (la voiture est à plus de 6 m en poursuite, kit.ts l'ajuste en cockpit)
      // et far ramené à la fin du brouillard : profondeur précise au loin
      camera={{ fov: 62, near: 0.4, far: 2400, position: [0, 5, -10] }}
    >
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <Contents {...props} tier={tier} dpr={dpr} setDpr={setDpr} />
    </Canvas>
  );
}

function Contents({
  game,
  assets,
  camMode,
  livery,
  paused,
  ghost,
  ghostCar,
  rivalCars,
  onFrame,
  onReady,
  onContextLost,
  quality,
  tier,
  dpr,
  setDpr,
}: Props & { tier: Tier; dpr: number; setDpr: (d: number) => void }) {
  const { camera, gl, scene, advance } = useThree();
  /* la carte des reflets est refaite après une perte de contexte (sinon noire) */
  const [envKey, setEnvKey] = useState(0);
  const sun = useMemo(() => new Vector3(...assets.level.meta.sun).normalize(), [assets]);
  const level = useMemo(() => buildLevel(assets, gl.capabilities.getMaxAnisotropy()), [assets, gl]);
  const water = useMemo(() => buildWater(assets, sun), [assets, sun]);
  const flora = useMemo(() => buildFlora(assets), [assets]);
  const car = useMemo(() => {
    const v = new CarView(assets.car, assets.vehicle.spec, livery, bungee.style.fontFamily);
    v.setSun(sun);
    return v;
  }, [assets, livery, sun]);
  useEffect(() => () => car.dispose(), [car]);
  /* le soleil sur la voiture suit la sonde de lumière : à l'ombre d'un immeuble, il s'éteint */
  const sunLight = useRef<DirectionalLight>(null);
  const sunK = useRef(1);
  const rig = useMemo(() => {
    const r = new Rig();
    r.setVehicle(assets.vehicle);
    return r;
  }, [assets]);
  const ghostView = useMemo(
    () => (ghostCar ? new GhostView(ghostCar.model, ghostCar.vehicle.spec) : new GhostView(assets.car, assets.vehicle.spec)),
    [assets, ghostCar],
  );
  useEffect(() => () => ghostView.dispose(), [ghostView]);
  const botsView = useMemo(
    () => (game.bots.length ? new BotsView(assets.car, assets.vehicle.spec, game.bots.map((b) => b.color)) : null),
    [assets, game],
  );
  useEffect(() => () => botsView?.dispose(), [botsView]);
  // Pilotes en direct : une vue instanciée par modèle de véhicule, aux couleurs de leur livrée.
  const rivalViews = useMemo(() => {
    const groups = new Map<string, number[]>();
    game.rivals.forEach((r, i) => groups.set(r.vehicle, [...(groups.get(r.vehicle) ?? []), i]));
    return [...groups].map(([id, idx]) => {
      const model = rivalCars?.[id] ?? (id === assets.vehicle.id ? assets.car : null) ?? assets.car;
      const spec = vehicleById(id).spec;
      return { view: new BotsView(model, spec, idx.map((i) => game.rivals[i].color)), states: idx.map((i) => game.rivalStates[i]) };
    });
  }, [assets, game, rivalCars]);
  useEffect(() => () => rivalViews.forEach((r) => r.view.dispose()), [rivalViews]);
  const pausedRef = useRef(paused);
  const ghostRef = useRef(ghost);
  // callbacks lus par les effets et la boucle sans en être des dépendances : un parent qui
  // se redessine (vue de table reçue) ne doit pas relancer l'initialisation de la scène
  const onReadyRef = useRef(onReady);
  const onLostRef = useRef(onContextLost);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    pausedRef.current = paused;
    ghostRef.current = ghost;
    onReadyRef.current = onReady;
    onLostRef.current = onContextLost;
    onFrameRef.current = onFrame;
  }, [paused, ghost, onReady, onContextLost, onFrame]);

  useEffect(() => {
    rig.snap(game);
    car.update(game);
    rig.update(game, camera as PerspectiveCamera, 0);
    let cancelled = false;
    // shaders compilés et textures envoyées au GPU avant la première image : pas d'à-coup
    // au départ (le Loader reste affiché pendant ce temps)
    const lm = assets.lightmaps;
    for (const t of [lm.terrain, lm.road, lm.props, assets.water]) gl.initTexture(t);
    void gl.compileAsync(scene, camera).then(() => {
      if (!cancelled) onReadyRef.current();
    });
    const lost = () => onLostRef.current?.();
    const restored = () => {
      rig.snap(game);
      setEnvKey((k) => k + 1);
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => {
      cancelled = true;
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
    };
  }, [game, gl, scene, camera, car, rig, assets]);

  // La boucle d'images est à nous : plafonnée à la cadence du palier (60, ou 30 en
  // économie : une image sur deux à 60 Hz, une sur quatre à 120), et à l'arrêt en pause ou
  // sur l'écran d'arrivée (l'image reste, rien à redessiner).
  const liveRef = useRef(false);
  useEffect(() => {
    const minInterval = 1000 / TIERS[tier].fps - 2.5;
    let raf = 0, last = -1e9, idle = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < minInterval) return;
      const running = !pausedRef.current || liveRef.current;
      // à l'arrêt, encore quelques images pour laisser l'interface se poser
      if (!running && ++idle > 3) return;
      if (running) idle = 0;
      last = t;
      // en secondes : R3F calcule le delta des images (useFrame) à partir de cette heure
      advance(t / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tier, advance]);

  // Gouverneur : la définition suit la cadence mesurée, dans la fourchette du palier.
  const gov = useRef<Governor | null>(null);
  gov.current ??= new Governor(tier, dpr);
  useEffect(() => {
    const g = gov.current!;
    const spec = TIERS[quality === "auto" ? tier : quality];
    g.dpr = Math.min(spec.dpr[2], Math.max(spec.dpr[1], g.dpr));
    setDpr(g.dpr);
  }, [quality, tier, setDpr]);
  // Végétation : une case n'est dessinée qu'à portée (par sorte), revu quatre fois par seconde.
  const floraTimer = useRef(0);

  useEffect(() => {
    rig.setMode(camMode);
    car.setCockpit(camMode === "cockpit");
  }, [camMode, car, rig]);

  useFrame(({ clock: c }, dt) => {
    // en direct, le menu ne suspend rien : le chrono est celui de tous
    liveRef.current = game.live && game.race.phase === "racing";
    if (!pausedRef.current || liveRef.current) game.update(dt);
    clock.value += Math.min(dt, 0.1);
    const g = gov.current!;
    if (game.race.phase === "racing" && quality === "auto" && g.frame(dt, c.elapsedTime)) setDpr(g.dpr);
    floraTimer.current -= dt;
    if (floraTimer.current <= 0) {
      floraTimer.current = 0.25;
      cullFlora(flora, camera.position, TIERS[tier].flora);
    }
    car.update(game);
    if (sunLight.current) {
      const k = groundLight(assets.level, game.pos.x, game.pos.z);
      sunK.current += (k - sunK.current) * Math.min(1, dt * 8);
      sunLight.current.intensity = 3.2 * (0.12 + 0.88 * sunK.current);
    }
    ghostView.update(game, ghostRef.current);
    rig.update(game, camera as PerspectiveCamera, dt);
    botsView?.update(game, camera as PerspectiveCamera);
    for (const r of rivalViews) r.view.update(game, camera as PerspectiveCamera, r.states);
    renderStats.calls = gl.info.render.calls;
    renderStats.triangles = gl.info.render.triangles;
    renderStats.dpr = gl.getPixelRatio();
    onFrameRef.current(dt);
  });

  return (
    <>
      <Sky sun={sun} />
      <Environment key={envKey} resolution={64} frames={1}>
        <EnvSky sun={sun} />
      </Environment>
      <hemisphereLight args={[new Color(0.42, 0.62, 0.95), new Color(0.35, 0.3, 0.22), 1.7]} />
      <directionalLight ref={sunLight} position={sun.clone().multiplyScalar(200)} intensity={3.2} color="#FFEDD1" />
      <primitive object={level} />
      <primitive object={water} />
      <primitive object={flora} />
      <primitive object={car.root} />
      <primitive object={ghostView.root} />
      {botsView && <primitive object={botsView.root} />}
      {rivalViews.map((r, i) => (
        <primitive key={i} object={r.view.root} />
      ))}
    </>
  );
}

function Sky({ sun }: { sun: Vector3 }) {
  const mat = useMemo(() => skyMaterial(sun, BackSide), [sun]);
  const geo = useMemo(() => new SphereGeometry(2800, 32, 16), []);
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} />;
}

/* Reflets de la carrosserie : le ciel, un sol chaud, le soleil. */
function EnvSky({ sun }: { sun: Vector3 }) {
  const mat = useMemo(() => skyMaterial(sun, BackSide), [sun]);
  const ground = useMemo(() => new Color("#8C8B6A").multiplyScalar(0.55), []);
  return (
    <>
      <mesh material={mat}>
        <sphereGeometry args={[50, 32, 16]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-2}>
        <circleGeometry args={[48, 32]} />
        <meshBasicMaterial color={ground} />
      </mesh>
    </>
  );
}
