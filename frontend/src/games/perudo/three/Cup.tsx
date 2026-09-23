"use client";

import { forwardRef, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cupGeometry, stitchRows } from "./geometry";
import { leatherMaterial } from "./materials";
import { leatherMaps } from "./textures";

const LEATHER = "#3f2314";

/* Surpiqûre sellier : des points de fil ciré, un par 2,2 mm, penchés sur le rang. */
const STITCH_GAP = 0.22;
const STITCH_TILT = 0.45;

function useInside() {
  return useMemo(() => {
    const { normal } = leatherMaps();
    return new THREE.MeshStandardMaterial({
      color: "#2b1b11",
      roughness: 1,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      side: THREE.BackSide,
    });
  }, []);
}

/* Tous les points de surpiqûre du gobelet en un seul appel de dessin (instances). */
function Stitches() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const rows = stitchRows();
  const counts = rows.map((row) => Math.round((2 * Math.PI * row.radius) / STITCH_GAP));
  const total = counts.reduce((a, b) => a + b, 0);
  const geometry = useMemo(() => new THREE.CapsuleGeometry(0.026, 0.1, 2, 6), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8d6ae", roughness: 0.75 }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    rows.forEach((row, r) => {
      for (let i = 0; i < counts[r]; i++) {
        const a = (i / counts[r]) * Math.PI * 2;
        const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        if (row.flat) {
          // Sur le fond : le point suit le cercle, penché vers le centre.
          const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
          dir.copy(tangent).multiplyScalar(Math.cos(STITCH_TILT)).addScaledVector(inward, Math.sin(STITCH_TILT));
          pos.set(Math.cos(a) * row.radius, row.y + 0.004, Math.sin(a) * row.radius);
        } else {
          dir.copy(tangent).multiplyScalar(Math.cos(STITCH_TILT)).addScaledVector(Y, Math.sin(STITCH_TILT));
          pos.set(Math.cos(a) * row.radius, row.y, Math.sin(a) * row.radius);
        }
        q.setFromUnitVectors(Y, dir.normalize());
        m.compose(pos, q, one);
        mesh.setMatrixAt(k++, m);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, total]} castShadow />;
}

/* Le gobelet de cuir, ouverture en bas. L'origine est au centre de la lèvre, au ras
   du tapis : poser le gobelet, c'est le mettre à y = 0. */
const Cup = forwardRef<THREE.Group, { band: string }>(function Cup({ band }, ref) {
  const { outer, inner, cap, band: bandGeometry } = cupGeometry();
  const inside = useInside();
  return (
    <group ref={ref}>
      <mesh geometry={outer} material={leatherMaterial(LEATHER)} castShadow receiveShadow />
      <mesh geometry={cap} material={leatherMaterial(LEATHER)} castShadow receiveShadow />
      <mesh geometry={inner} material={inside} castShadow />
      <mesh geometry={bandGeometry} material={leatherMaterial(band)} castShadow receiveShadow />
      <Stitches />
    </group>
  );
});

export default Cup;
