/* Contrôles des circuits publiés, lancés en fin de build.sh (pnpm rt1:check [circuit…]) :
   - aucun sommet plat de la route sous le terrain (sinon le terrain, cuit en noir à cet
     endroit, perce l'accotement et scintille) ;
   - collider de route tourné vers le haut, murs tournés vers la route (Rapier ne garde que
     les contacts de face avant avec le drapeau FIX_INTERNAL_EDGES).
   Sort en erreur au premier circuit fautif. */

import { type Mesh, Vector3 } from "three";
import { TrackLocator } from "../../src/games/rt1/sim/track";
import { type Circuit, CIRCUITS, loadCircuit, terrainHeight } from "./load";

function topName(o: { name: string; parent: { parent: unknown } | null }): string {
  let n = o;
  while (n.parent && n.parent.parent) n = n.parent as typeof n;
  return n.name;
}

/* Sommets de route (normale presque verticale, à moins de 7,4 m de l'axe) sous le terrain. */
function piercing(c: Circuit): { count: number; max: number } {
  c.gltf.scene.updateMatrixWorld(true);
  const loc = new TrackLocator(c.meta.line);
  const v = new Vector3(), nrm = new Vector3();
  let count = 0, max = 0;
  c.gltf.scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || topName(m) !== "road") return;
    const pos = m.geometry.getAttribute("position"), no = m.geometry.getAttribute("normal");
    for (let k = 0; k < pos.count; k++) {
      nrm.fromBufferAttribute(no, k).normalize();
      if (nrm.y < 0.97) continue;
      v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
      loc.reset();
      if (loc.locate(v).lateral > 7.45) continue;
      const d = terrainHeight(c, v.x, v.z) - v.y;
      if (d > 0) {
        count++;
        max = Math.max(max, d);
      }
    }
  });
  return { count, max };
}

/* Part des triangles d'un collider dont la normale regarde vers le haut (route) ou vers
   l'axe (murs). */
function facing(c: Circuit, mesh: Circuit["road"], towardAxis: boolean): { ok: number; total: number } {
  const line = c.meta.line.map((p) => new Vector3(...p));
  const probe = new TrackLocator(c.meta.line);
  const a = new Vector3(), b = new Vector3(), d = new Vector3(), n = new Vector3(), ctr = new Vector3();
  let ok = 0;
  const total = mesh.indices.length / 3;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    a.fromArray(mesh.vertices, mesh.indices[t] * 3);
    b.fromArray(mesh.vertices, mesh.indices[t + 1] * 3);
    d.fromArray(mesh.vertices, mesh.indices[t + 2] * 3);
    n.copy(b).sub(a).cross(ctr.copy(d).sub(a)).normalize();
    ctr.copy(a).add(b).add(d).multiplyScalar(1 / 3);
    if (!towardAxis) {
      if (n.y > 0) ok++;
      continue;
    }
    probe.reset();
    const p = line[probe.locate(ctr).i];
    if ((p.x - ctr.x) * n.x + (p.z - ctr.z) * n.z > 0) ok++;
  }
  return { ok, total };
}

let failed = false;
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : CIRCUITS;
for (const slug of wanted) {
  const c = await loadCircuit(slug);
  const p = piercing(c);
  const road = facing(c, c.road, false);
  const walls = c.walls.indices.length ? facing(c, c.walls, true) : null;
  const bad = p.count > 0 || road.ok !== road.total || (walls !== null && walls.ok !== walls.total);
  failed ||= bad;
  console.log(
    `${bad ? "ÉCHEC" : "ok   "} ${slug.padEnd(13)} route sous le terrain : ${p.count} sommets (max ${(p.max * 100).toFixed(0)} cm) | ` +
      `col_road vers le haut : ${road.ok}/${road.total}` +
      (walls ? ` | col_wall vers la route : ${walls.ok}/${walls.total}` : " | sans murs"),
  );
}
process.exit(failed ? 1 : 0);
