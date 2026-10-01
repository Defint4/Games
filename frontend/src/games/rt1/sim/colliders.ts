/* Maillages de collision du circuit (nœuds col_road, col_wall du glTF), mis à plat dans le
   repère du monde pour Rapier. Servent à la course et au générateur de bots. */

import { type Mesh, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { TriMesh } from "./game";

export function trimesh(gltf: GLTF, name: string): TriMesh {
  const root = gltf.scene.getObjectByName(name);
  const verts: number[] = [];
  const idx: number[] = [];
  if (!root) return { vertices: new Float32Array(), indices: new Uint32Array() };
  root.updateWorldMatrix(true, true);
  const v = new Vector3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute("position");
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      verts.push(v.x, v.y, v.z);
    }
    const index = m.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
  });
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}
