"use client";

/* La scène de course : le circuit cuit, le lagon, la végétation, la voiture et la
   caméra (construits dans kit.ts). La simulation avance dans le même useFrame que le
   rendu. */

import { Environment, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Color, type DirectionalLight, type Mesh, NeutralToneMapping, type PerspectiveCamera, SphereGeometry, Vector3 } from "three";
import { groundLight } from "../sim/level";
import type { CarModel, RaceAssets } from "../assets";
import { type Vehicle, vehicleById } from "../sim/vehicles";
import type { Livery } from "../livery";
import { bungee } from "../meta";
import type { Game } from "../sim/game";
import { BotsView, buildFlora, buildLevel, buildWater, type CamMode, CarView, GhostView, Rig } from "./kit";
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
};

export default function RaceScene(props: Props) {
  // Résolution : nette d'entrée (2× sur les écrans 3×), montée jusqu'à la densité de
  // l'écran si la cadence tient, baissée par paliers sinon, jamais sous 1.
  const device = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const maxDpr = Math.min(3, device);
  const [dpr, setDpr] = useState(() => Math.min(2, device));
  return (
    <Canvas
      dpr={dpr}
      // tailles de mise en page (offset) : justes même quand le rendu est tourné de 90°
      resize={{ offsetSize: true }}
      // tone mapping neutre (Khronos) : garde les teintes de la palette, et le brouillard
      // (mélangé après) retrouve la couleur de l'horizon ; ACES délavait le lagon et faisait
      // une bande à l'horizon
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false, toneMapping: NeutralToneMapping }}
      // near large (la voiture est à plus de 6 m en poursuite, kit.ts l'ajuste en cockpit)
      // et far ramené à la fin du brouillard : profondeur précise au loin
      camera={{ fov: 62, near: 0.4, far: 2400, position: [0, 5, -10] }}
    >
      <PerformanceMonitor
        flipflops={4}
        onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
        onFallback={() => setDpr((d) => Math.max(1, Math.min(d, 1.5)))}
      />
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <Contents {...props} />
    </Canvas>
  );
}

function Contents({ game, assets, camMode, livery, paused, ghost, ghostCar, rivalCars, onFrame, onReady, onContextLost }: Props) {
  const { camera, gl, scene } = useThree();
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
    // shaders compilés avant la première image : pas d'à-coup au départ
    gl.compile(scene, camera);
    onReadyRef.current();
    const lost = () => onLostRef.current?.();
    const restored = () => {
      rig.snap(game);
      setEnvKey((k) => k + 1);
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
    };
  }, [game, gl, scene, camera, car, rig]);

  useEffect(() => {
    rig.setMode(camMode);
    car.setCockpit(camMode === "cockpit");
  }, [camMode, car, rig]);

  useFrame((_, dt) => {
    // en direct, le menu ne suspend rien : le chrono est celui de tous
    if (!pausedRef.current || (game.live && game.race.phase === "racing")) game.update(dt);
    clock.value += Math.min(dt, 0.1);
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
