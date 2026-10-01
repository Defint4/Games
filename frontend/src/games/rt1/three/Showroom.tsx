"use client";

/* La vitrine de l'éditeur de peinture : le véhicule seul sur un disque, qu'on fait
   tourner au doigt (il tourne seul au repos), sous le même ciel qu'en course. */

import { Environment } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, Color, type Group, NeutralToneMapping, Vector3 } from "three";
import type { CarModel } from "../assets";
import type { Livery } from "../livery";
import { bungee } from "../meta";
import type { Vehicle } from "../sim/vehicles";
import { CarView } from "./kit";
import { skyMaterial } from "./materials";

const SUN = new Vector3(0.5, 0.8, 0.35).normalize();

export default function Showroom({ model, vehicle, livery }: { model: CarModel; vehicle: Vehicle; livery: Livery }) {
  const size = Math.max(2 * vehicle.spec.half[2], 2.6);
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
      camera={{ fov: 32, position: [size * 1.35, size * 0.5, size * 1.35], near: 0.1, far: 100 }}
      className="touch-none"
    >
      <Environment resolution={64} frames={1}>
        <mesh material={skyMaterial(SUN, BackSide)}>
          <sphereGeometry args={[50, 32, 16]} />
        </mesh>
      </Environment>
      <hemisphereLight args={[new Color(0.42, 0.62, 0.95), new Color(0.35, 0.3, 0.22), 1.6]} />
      <directionalLight position={SUN.clone().multiplyScalar(20)} intensity={3} color="#FFEDD1" />
      <Turntable model={model} vehicle={vehicle} livery={livery} size={size} />
    </Canvas>
  );
}

function Turntable({ model, vehicle, livery, size }: { model: CarModel; vehicle: Vehicle; livery: Livery; size: number }) {
  const gl = useThree((s) => s.gl);
  const drag = useRef({ active: false, x: 0, speed: 0.35, angle: -0.6 });
  // glisser du doigt : tourne la vitrine, l'élan retombe ensuite vers la rotation lente
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      drag.current.active = true;
      drag.current.x = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;
      d.angle += (e.clientX - d.x) * 0.012;
      d.speed = (e.clientX - d.x) * 0.4;
      d.x = e.clientX;
    };
    const up = () => {
      drag.current.active = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);
  const car = useMemo(() => new CarView(model, vehicle.spec, livery, bungee.style.fontFamily), [model, vehicle, livery]);
  useEffect(() => () => car.dispose(), [car]);
  const spin = useRef<Group>(null);
  useFrame(({ camera }, dt) => {
    const d = drag.current;
    if (!d.active) {
      d.speed += (0.35 - d.speed) * Math.min(1, dt * 2);
      d.angle += d.speed * dt;
    }
    if (spin.current) spin.current.rotation.y = d.angle;
    camera.lookAt(0, size * 0.08, 0);
  });
  return (
    <group ref={spin}>
      {/* la caisse posée : son sol à y = 0 */}
      <group position={[0, -car.ground, 0]}>
        <primitive object={car.root} />
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[size * 0.62, 48]} />
        <meshStandardMaterial color="#0e3440" roughness={0.9} />
      </mesh>
    </group>
  );
}
