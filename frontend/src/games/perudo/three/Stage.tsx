"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { feltMaps } from "./textures";

/* Le décor commun : le tapis de feutre, la lampe de bar au-dessus de la table, et un
   environnement de reflets tout en lumières procédurales (rien à télécharger). */

export function Felt({ color = "#1b5443" }: { color?: string }) {
  const material = useMemo(() => {
    const { map, normal } = feltMaps(color);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.96,
    });
  }, [color]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <planeGeometry args={[90, 90]} />
    </mesh>
  );
}

export function Lights() {
  // iOS peut retirer le contexte WebGL à une app passée en arrière-plan. three le
  // restaure, mais les reflets (calculés une seule fois) sont perdus et, en rendu à la
  // demande, rien ne redessine la table : on recrée l'environnement puis on redessine.
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const onRestored = () => setRestored((n) => n + 1);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => canvas.removeEventListener("webglcontextrestored", onRestored);
  }, [gl]);
  useEffect(() => {
    if (restored) invalidate();
  }, [restored, invalidate]);
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#0b241c", 0.35]} />
      {/* La lampe de bar : chaude, juste au-dessus, un cône net qui laisse les bords
          du tapis dans la pénombre. */}
      <spotLight
        position={[1.5, 26, 5]}
        angle={0.78}
        penumbra={0.7}
        intensity={1900}
        decay={2}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-8, 6, 10]} intensity={0.25} color="#b8d4ff" />
      <Environment key={restored} resolution={64}>
        <Lightformer form="rect" intensity={3} color="#ffe6c4" position={[0, 8, 3]} scale={[8, 3, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.2} color="#9fc9ff" position={[-6, 3, 4]} scale={[4, 2, 1]} rotation-y={Math.PI / 3} />
        <Lightformer form="ring" intensity={1} color="#ffffff" position={[5, 4, -3]} scale={2} />
      </Environment>
    </>
  );
}

/* Cadrage téléphone : le champ horizontal reste le même quelle que soit la forme de
   l'écran, pour que le gobelet et ses dés tiennent toujours en largeur. */
export function PortraitCamera({
  position,
  target,
  width,
}: {
  position: [number, number, number];
  target: [number, number, number];
  width: number;
}) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    camera.position.set(...position);
    camera.lookAt(...target);
    const distance = camera.position.distanceTo(new THREE.Vector3(...target));
    const aspect = size.width / size.height;
    const hfov = 2 * Math.atan(width / 2 / distance);
    camera.fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect)),
      30,
      75,
    );
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    get().invalidate();
  }, [get, size, position, target, width]);
  return null;
}
