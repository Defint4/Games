/* Construction impérative des objets three de la course (hors React) : circuit cuit,
   lagon, végétation instanciée, voiture, caméra. La scène React ne fait que les poser. */

import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Vector4,
} from "three";
import type { RaceAssets } from "../assets";
import type { Game } from "../sim/game";
import { clock, detailTexture, roadTexture, waterMaterial, withGroundDetail, withWind } from "./materials";

export type CamMode = "chase" | "cockpit";

function topName(o: Object3D): string {
  let n: Object3D = o;
  while (n.parent && n.parent.parent) n = n.parent;
  return n.name;
}

/* Le circuit : matières cuites (couleur de sommet × carte de lumière), collisions cachées. */
export function buildLevel(assets: RaceAssets, anisotropy: number): Object3D {
  const s = assets.levelGltf.scene;
  if (s.userData.rt1) return s;
  s.userData.rt1 = true;
  const k = assets.level.meta.lmScale * Math.PI;
  const { terrain, road, props } = assets.lightmaps;
  road.channel = 1;
  const asphalt = roadTexture(anisotropy);
  const hide: Object3D[] = [];
  s.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    const top = topName(o);
    if (top.startsWith("col_")) {
      hide.push(o);
      return;
    }
    const name = (m.material as { name?: string }).name ?? "";
    if (top === "terrain") {
      const mat = new MeshBasicMaterial({ vertexColors: true, lightMap: terrain, lightMapIntensity: k });
      withGroundDetail(mat, detailTexture());
      m.material = mat;
    } else if (top === "road") {
      m.material =
        name === "asphalt"
          ? new MeshBasicMaterial({ map: asphalt, lightMap: road, lightMapIntensity: k })
          : new MeshBasicMaterial({ vertexColors: true, lightMap: road, lightMapIntensity: k, side: DoubleSide });
    } else if (top === "props") {
      m.material = new MeshBasicMaterial({ vertexColors: true, lightMap: props, lightMapIntensity: k, side: DoubleSide });
    } else if (top === "backdrop") {
      m.material = new MeshBasicMaterial({ vertexColors: true });
    } else if (top === "clouds") {
      m.material = new MeshBasicMaterial({ vertexColors: true, fog: false, color: new Color(1.3, 1.3, 1.3) });
    }
  });
  for (const o of hide) o.visible = false;
  return s;
}

export function buildWater(assets: RaceAssets, sun: Vector3): Mesh {
  const t = assets.level.meta.terrain;
  const mat = waterMaterial(assets.water, new Vector4(t.x0, t.y0, t.x1, t.y1), sun);
  mat.uniforms.uTime = clock;
  const mesh = new Mesh(new PlaneGeometry(7000, 7000, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.set((t.x0 + t.x1) / 2, 0, -(t.y0 + t.y1) / 2);
  return mesh;
}

/* ------------------------------------------------------------------ végétation */

/* amplitude du vent, hauteur où il commence */
const WIND: Record<string, [number, number]> = {
  palm: [0.0045, 2.5],
  pine: [0.0007, 3],
  niaouli: [0.004, 2.2],
};

/* Cases de 320 m : chaque case est un InstancedMesh, écarté hors du champ de vue. */
const CELL = 320;

export function buildFlora(assets: RaceAssets): Group {
  const root = new Group();
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const p = new Vector3();
  const sc = new Vector3();
  assets.flora.scene.updateMatrixWorld(true);
  for (const [kind, list] of Object.entries(assets.level.meta.instances)) {
    const node = assets.flora.scene.getObjectByName(kind);
    if (!node || !list.length) continue;
    const meshes: Mesh[] = [];
    node.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    const [amp, start] = WIND[kind] ?? [0, 0];
    const cells = new Map<string, typeof list>();
    for (const it of list) {
      const key = `${Math.floor(it[0] / CELL)}:${Math.floor(it[2] / CELL)}`;
      const cell = cells.get(key);
      if (cell) cell.push(it);
      else cells.set(key, [it]);
    }
    for (const mesh of meshes) {
      const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
      if (amp > 0) withWind(mat, amp, start);
      for (const items of cells.values()) {
        const im = new InstancedMesh(mesh.geometry, mat, items.length);
        items.forEach((it, i) => {
          q.setFromAxisAngle(up, it[3]);
          m.compose(p.set(it[0], it[1], it[2]), q, sc.setScalar(it[4])).multiply(mesh.matrixWorld);
          im.setMatrixAt(i, m);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        root.add(im);
      }
    }
  }
  return root;
}

/* ------------------------------------------------------------------ voiture */

/* Le sol du modèle sous l'origine de la caisse, suspension au repos. */
const GROUND = -0.585;

function carMaterials(paint: string): Record<string, MeshStandardMaterial | MeshBasicMaterial> {
  const std = (color: string, roughness: number, metalness = 0, extra: object = {}) =>
    new MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    paint: new MeshPhysicalMaterial({
      color: paint,
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.85,
    }),
    trim: std("#1E2126", 0.65),
    glass: std("#0D161D", 0.04, 0, { transparent: true, opacity: 0.9, envMapIntensity: 1.6, side: DoubleSide }),
    chrome: std("#E3E6EA", 0.12, 1),
    light_front: new MeshBasicMaterial({ color: "#FFF4DA" }),
    light_rear: new MeshBasicMaterial({ color: "#5A0A0E" }),
    interior: std("#3A3D42", 0.85, 0, { side: DoubleSide }),
    plate: std("#F1F1EB", 0.5),
    tire: std("#18191C", 0.9),
    rim: std("#CDD1D6", 0.28, 1),
    caliper: std("#D8392B", 0.4),
    disc: std("#6E7076", 0.35, 1),
  };
}

const BRAKE_OFF = new Color("#5A0A0E");
const BRAKE_ON = new Color("#FF2A2A");

export class CarView {
  readonly root = new Group();
  private wheels: { steer: Object3D; spin: Object3D; left: boolean }[] = [];
  private glass: MeshStandardMaterial[] = [];
  private rear: MeshBasicMaterial | null = null;
  private shadow: MeshBasicMaterial;

  constructor(assets: RaceAssets, paint: string) {
    const mats = carMaterials(paint);
    const apply = (o: Object3D) =>
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        const name = (m.material as { name?: string }).name ?? "";
        const mat = mats[name] ?? mats.trim;
        m.material = mat;
        if (name === "glass" && !this.glass.includes(mat as MeshStandardMaterial)) this.glass.push(mat as MeshStandardMaterial);
        if (name === "light_rear") this.rear = mat as MeshBasicMaterial;
      });
    // Les nœuds gardent leur transformation (déquantification glTF) : on décale un parent.
    const body = new Group();
    body.position.y = GROUND;
    body.add(assets.car.scene.getObjectByName("body")!.clone(true));
    apply(body);
    this.root.add(body);
    const wheelSrc = assets.car.scene.getObjectByName("wheel")!;
    for (let i = 0; i < 4; i++) {
      const steer = new Group();
      const mirror = new Group();
      const spin = new Group();
      const w = wheelSrc.clone(true);
      apply(w);
      const left = i % 2 === 0;
      mirror.rotation.y = left ? 0 : Math.PI;
      spin.add(w);
      mirror.add(spin);
      steer.add(mirror);
      this.root.add(steer);
      this.wheels.push({ steer, spin, left });
    }
    this.shadow = new MeshBasicMaterial({
      color: 0x000000,
      alphaMap: assets.shadow,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const blob = new Mesh(new PlaneGeometry(2.6, 5).rotateX(-Math.PI / 2), this.shadow);
    blob.position.y = GROUND + 0.02;
    blob.renderOrder = 1;
    this.root.add(blob);
  }

  update(g: Game) {
    this.root.position.copy(g.pos);
    this.root.quaternion.copy(g.quat);
    const car = g.car;
    car.wheels.forEach((w, i) => {
      const v = this.wheels[i];
      v.steer.position.set(w.attach.x, w.attach.y - w.offset, w.attach.z);
      v.steer.rotation.y = w.front ? -car.steer : 0;
      v.spin.rotation.x = v.left ? w.spin : -w.spin;
    });
    this.rear?.color.copy(car.brakeInput > 0 ? BRAKE_ON : BRAKE_OFF);
    this.shadow.opacity = 0.8 * Math.min(1, car.grounded / 3 + (car.airTime < 0.3 ? 0.4 : 0));
  }

  setCockpit(on: boolean) {
    for (const m of this.glass) m.opacity = on ? 0.18 : 0.9;
  }
}

/* ------------------------------------------------------------------ caméra */

/* Une caméra regarde vers -Z ; la voiture avance vers +Z : demi-tour, léger piqué. */
const COCKPIT_Q = new Quaternion()
  .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
  .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.06));

export class Rig {
  private mode: CamMode = "chase";
  private blend = 0;
  private pos = new Vector3();
  private look = new Vector3();
  private fwd = new Vector3(0, 0, 1);
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private q = new Quaternion();
  private eye = new Vector3(0.34, 0.66, 0.0);

  setMode(mode: CamMode) {
    this.mode = mode;
  }

  snap(g: Game) {
    this.fwd.set(0, 0, 1).applyQuaternion(g.quat).setY(0).normalize();
    this.pos.copy(g.pos).addScaledVector(this.fwd, -6.4).add(this.tmp.set(0, 2.3, 0));
    this.look.copy(g.pos).addScaledVector(this.fwd, 4);
    this.blend = this.mode === "cockpit" ? 1 : 0;
  }

  update(g: Game, cam: PerspectiveCamera, dt: number) {
    const d = Math.min(dt, 0.1);
    const f = this.tmp.set(0, 0, 1).applyQuaternion(g.quat);
    f.y *= 0.35;
    f.normalize();
    this.fwd.lerp(f, 1 - Math.exp(-d * 5)).normalize();
    const speed = Math.max(0, g.car.forwardSpeed);
    const back = 6.3 + speed * 0.018;
    const target = this.tmp2.copy(g.pos).addScaledVector(this.fwd, -back);
    target.y += 2.15 + speed * 0.004;
    this.pos.lerp(target, 1 - Math.exp(-d * 7));
    const aim = this.tmp.copy(g.pos).addScaledVector(this.fwd, 4.2);
    aim.y += 0.75;
    this.look.lerp(aim, 1 - Math.exp(-d * 12));

    const want = this.mode === "cockpit" ? 1 : 0;
    this.blend += (want - this.blend) * (1 - Math.exp(-d * 12));
    if (Math.abs(this.blend - want) < 0.002) this.blend = want;
    const b = this.blend;

    const eye = this.tmp.copy(this.eye).applyQuaternion(g.quat).add(g.pos);
    cam.position.copy(this.pos).lerp(eye, b);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (b > 0) {
      this.q.copy(g.quat).multiply(COCKPIT_Q);
      cam.quaternion.slerp(this.q, b);
    }
    const s = speed / 54;
    cam.fov = (1 - b) * (60 + s * 12) + b * (72 + s * 8);
    cam.near = b > 0.5 ? 0.05 : 0.1;
    cam.updateProjectionMatrix();
  }
}
