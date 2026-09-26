"use client";

/* La scène de course : le circuit cuit, le lagon, la végétation, la voiture et la
   caméra (construits dans kit.ts). La simulation avance dans le même useFrame que le
   rendu. */

import { Environment, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Color, type Mesh, type PerspectiveCamera, SphereGeometry, Vector3 } from "three";
import type { RaceAssets } from "../assets";
import type { Game } from "../sim/game";
import { buildFlora, buildLevel, buildWater, type CamMode, CarView, Rig } from "./kit";
import { clock, FOG, skyMaterial } from "./materials";

export type { CamMode };

/* Mesures de rendu de la dernière image (affichées en mode ?debug). */
export const renderStats = { calls: 0, triangles: 0, dpr: 1 };

type Props = {
  game: Game;
  assets: RaceAssets;
  camMode: CamMode;
  paint: string;
  paused: boolean;
  onFrame: (dt: number) => void;
  onReady: () => void;
};

export default function RaceScene(props: Props) {
  const maxDpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(() => Math.min(1.5, maxDpr));
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 62, near: 0.1, far: 3200, position: [0, 5, -10] }}
    >
      <PerformanceMonitor
        flipflops={4}
        onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
        onFallback={() => setDpr(0.75)}
      />
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <Contents {...props} />
    </Canvas>
  );
}

function Contents({ game, assets, camMode, paint, paused, onFrame, onReady }: Props) {
  const { camera, gl, scene } = useThree();
  const sun = useMemo(() => new Vector3(...assets.level.meta.sun).normalize(), [assets]);
  const level = useMemo(() => buildLevel(assets, gl.capabilities.getMaxAnisotropy()), [assets, gl]);
  const water = useMemo(() => buildWater(assets, sun), [assets, sun]);
  const flora = useMemo(() => buildFlora(assets), [assets]);
  const car = useMemo(() => new CarView(assets, paint), [assets, paint]);
  const rig = useMemo(() => new Rig(), []);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    rig.snap(game);
    car.update(game);
    rig.update(game, camera as PerspectiveCamera, 0);
    // shaders compilés avant la première image : pas d'à-coup au départ
    gl.compile(scene, camera);
    onReady();
    const restored = () => rig.snap(game);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => gl.domElement.removeEventListener("webglcontextrestored", restored);
  }, [game, gl, scene, camera, car, rig, onReady]);

  useEffect(() => {
    rig.setMode(camMode);
    car.setCockpit(camMode === "cockpit");
  }, [camMode, car, rig]);

  useFrame((_, dt) => {
    if (!pausedRef.current) game.update(dt);
    clock.value += Math.min(dt, 0.1);
    car.update(game);
    rig.update(game, camera as PerspectiveCamera, dt);
    renderStats.calls = gl.info.render.calls;
    renderStats.triangles = gl.info.render.triangles;
    renderStats.dpr = gl.getPixelRatio();
    onFrame(dt);
  });

  return (
    <>
      <Sky sun={sun} />
      <Environment resolution={64} frames={1}>
        <EnvSky sun={sun} />
      </Environment>
      <hemisphereLight args={[new Color(0.42, 0.62, 0.95), new Color(0.35, 0.3, 0.22), 1.7]} />
      <directionalLight position={sun.clone().multiplyScalar(200)} intensity={3.2} color="#FFEDD1" />
      <primitive object={level} />
      <primitive object={water} />
      <primitive object={flora} />
      <primitive object={car.root} />
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
