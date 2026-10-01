/* Construction impérative des objets three de la course (hors React) : circuit cuit,
   lagon, végétation instanciée, voiture, caméra. La scène React ne fait que les poser. */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Vector4,
} from "three";
import type { CarModel, RaceAssets } from "../assets";
import { type CarSpec, GRAVITY } from "../sim/car";
import type { BotState, Game } from "../sim/game";
import { groundLight } from "../sim/level";
import { groundY, type Vehicle } from "../sim/vehicles";
import type { Livery } from "../livery";
import { carSpace, decals, glassTint, paintMaterial, rimColor } from "./livery";
import { clock, detailTexture, roadTexture, waterMaterial, withFlora, withGroundDetail } from "./materials";

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
  // filtrage anisotrope : sans lui, sol et route deviennent flous en vue rasante
  for (const tex of [terrain, road, props, detailTexture()]) {
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }
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
    if (top.startsWith("terrain")) {
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
    } else if (top === "boosts") {
      // plaques de boost : vives, sans lumière cuite
      m.material = new MeshBasicMaterial({ vertexColors: true, color: new Color(1.25, 1.25, 1.25), side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
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
      withFlora(mat, amp, start);
      for (const items of cells.values()) {
        const im = new InstancedMesh(mesh.geometry, mat, items.length);
        // à l'ombre du relief ou d'un immeuble (sonde de lumière), l'arbre l'est aussi
        const shade = new Float32Array(items.length);
        items.forEach((it, i) => {
          q.setFromAxisAngle(up, it[3]);
          m.compose(p.set(it[0], it[1], it[2]), q, sc.setScalar(it[4])).multiply(mesh.matrixWorld);
          im.setMatrixAt(i, m);
          shade[i] = 0.45 + 0.55 * groundLight(assets.level, it[0], it[2]);
        });
        im.geometry = mesh.geometry.clone();
        im.geometry.setAttribute("instanceShade", new InstancedBufferAttribute(shade, 1));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        // centre de la case : le rendu écarte la case au-delà de la portée de sa sorte
        const cx = items.reduce((a, it) => a + it[0], 0) / items.length, cz = items.reduce((a, it) => a + it[2], 0) / items.length;
        im.userData = { kind, cx, cz };
        root.add(im);
      }
    }
  }
  return root;
}

/* Une case n'est dessinée qu'à portée de sa sorte (plus la demi-diagonale de la case). */
export function cullFlora(root: Group, from: Vector3, range: Record<string, number>) {
  for (const im of root.children) {
    const u = im.userData as { kind: string; cx: number; cz: number };
    const r = (range[u.kind] ?? 400) + CELL * 0.71;
    im.visible = (from.x - u.cx) ** 2 + (from.z - u.cz) ** 2 < r * r;
  }
}

/* ------------------------------------------------------------------ voiture */

/* Ombre de contact : un peu plus grande que la caisse (même taille qu'à la cuisson). */
function blobSize(s: CarSpec): [number, number] {
  return [2 * s.half[0] + 1.0, 2 * s.half[2] + 1.16];
}

/* Inclinaison d'une moto dans le virage, autour de son point de contact au sol :
   matrice locale à multiplier après la pose (rotation autour de l'axe avant). */
const LEAN_M = { a: new Matrix4(), b: new Matrix4(), c: new Matrix4() };

function leanMatrix(lean: number, ground: number, out: Matrix4): Matrix4 {
  LEAN_M.a.makeTranslation(0, ground, 0);
  LEAN_M.b.makeRotationZ(-lean);
  LEAN_M.c.makeTranslation(0, -ground, 0);
  return out.copy(LEAN_M.a).multiply(LEAN_M.b).multiply(LEAN_M.c);
}

/* Inclinaison déduite d'un mouvement enregistré (fantôme, bots) : tan = v × lacet / g. */
export class LeanTracker {
  lean = 0;
  private heading = 0;
  private pos = new Vector3();
  private t = -1;
  private f = new Vector3();

  update(t: number, pos: Vector3, quat: Quaternion): number {
    const heading = Math.atan2(this.f.set(0, 0, 1).applyQuaternion(quat).x, this.f.z);
    const dt = t - this.t;
    if (this.t >= 0 && dt > 1e-3 && dt < 0.5) {
      let d = heading - this.heading;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      const want = Math.max(-0.85, Math.min(0.85, Math.atan(((pos.distanceTo(this.pos) / dt) * (d / dt)) / GRAVITY)));
      this.lean += (want - this.lean) * Math.min(1, dt * 9);
    } else if (dt <= 0 || dt >= 0.5) {
      this.lean = 0;
    }
    this.t = t;
    this.heading = heading;
    this.pos.copy(pos);
    return this.lean;
  }
}

/* Caisse et quatre roues au repos, à fondre en un maillage (fantôme, bots) : chaque
   morceau avec sa matrice monde et le nom de sa matière. */
function carPieces(model: CarModel, s: CarSpec): { mesh: Mesh; name: string }[] {
  const ground = groundY(s);
  const parts = new Group();
  const body = new Group();
  body.position.y = ground;
  body.add(model.gltf.scene.getObjectByName("body")!.clone(true));
  parts.add(body);
  const wheelSrc = model.gltf.scene.getObjectByName("wheel")!;
  const axles = s.bike ? [[0, s.frontZ], [0, s.rearZ]] : [[s.track, s.frontZ], [-s.track, s.frontZ], [s.track, s.rearZ], [-s.track, s.rearZ]];
  for (const [x, z] of axles) {
    const holder = new Group();
    holder.position.set(x, ground + s.wheelRadius, z);
    holder.rotation.y = x >= 0 ? 0 : Math.PI;
    holder.add(wheelSrc.clone(true));
    parts.add(holder);
  }
  parts.updateMatrixWorld(true);
  const out: { mesh: Mesh; name: string }[] = [];
  parts.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) out.push({ mesh: m, name: (m.material as { name?: string }).name ?? "" });
  });
  return out;
}

/* Matières du véhicule, peinture exceptée (voir livery.ts). */
function carMaterials(): Record<string, MeshStandardMaterial | MeshBasicMaterial> {
  const std = (color: string, roughness: number, metalness = 0, extra: object = {}) =>
    new MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
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
    helmet: std("#F2F2EC", 0.3),
    suit: std("#1F3A5F", 0.85),
    livery: std("#F4F4F0", 0.35),
    beacon: new MeshBasicMaterial({ color: "#FFA238" }),
    dirt: std("#B5482A", 0.95),
  };
}

const BRAKE_OFF = new Color("#5A0A0E");
const BRAKE_ON = new Color("#FF2A2A");
const SHADOW_OPACITY = 0.6;
const SH = { p: new Vector3(), n: new Vector3(), fwd: new Vector3(), side: new Vector3(), pos: new Vector3(), m: new Matrix4() };

export class CarView {
  readonly root = new Group();
  private wheels: { steer: Object3D; spin: Object3D; left: boolean }[] = [];
  private glass: MeshStandardMaterial[] = [];
  private rear: MeshBasicMaterial | null = null;
  private shadow: MeshBasicMaterial;
  private blob: Mesh;
  /* dernier sol connu sous la voiture : l'ombre y reste quand elle décolle */
  private groundPos = new Vector3();
  private groundNormal = new Vector3(0, 1, 0);
  private groundOk = false;
  /* vers le soleil, à plat : l'ombre se décale un peu à l'opposé */
  private sun = new Vector3(0, 0, 1);
  /* moto : tout sauf l'ombre penche autour du point de contact */
  private tilt = new Group();
  private bike: boolean;
  private release: (() => void)[] = [];
  /* sol sous l'origine de la caisse (vitrine : on l'y pose) */
  readonly ground: number;

  constructor(model: CarModel, spec: CarSpec, livery: Livery, font: string) {
    this.bike = !!spec.bike;
    this.ground = groundY(spec);
    const mats = carMaterials();
    const painted: Mesh[] = [];
    const apply = (o: Object3D) =>
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        const name = (m.material as { name?: string }).name ?? "";
        if (name === "paint") {
          painted.push(m);
          return;
        }
        const mat = mats[name] ?? mats.trim;
        m.material = mat;
        if (name === "glass" && !this.glass.includes(mat as MeshStandardMaterial)) this.glass.push(mat as MeshStandardMaterial);
        if (name === "light_rear") this.rear = mat as MeshBasicMaterial;
      });
    // Les nœuds gardent leur transformation (déquantification glTF) : on décale un parent.
    const ground = groundY(spec);
    this.tilt.position.y = ground;
    const inner = new Group();
    inner.position.y = -ground;
    this.tilt.add(inner);
    this.root.add(this.tilt);
    const body = new Group();
    body.position.y = ground;
    body.add(model.gltf.scene.getObjectByName("body")!.clone(true));
    apply(body);
    inner.add(body);
    const wheelSrc = model.gltf.scene.getObjectByName("wheel")!;
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
      // moto : une roue par essieu (les rayons de gauche), dans l'axe
      if (!this.bike || left) inner.add(steer);
      // au repos (vitrine) ; en course, update() les suit
      steer.position.set(this.bike ? 0 : left ? spec.track : -spec.track, ground + spec.wheelRadius, i < 2 ? spec.frontZ : spec.rearZ);
      this.wheels.push({ steer, spin, left });
    }
    this.shadow = new MeshBasicMaterial({
      color: 0x000000,
      alphaMap: model.shadow,
      transparent: true,
      opacity: SHADOW_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    // Posée sur le sol (points de contact des roues), pas sous la caisse : elle ne suit ni
    // le roulis ni le tangage, et ne passe plus sous la route quand la suspension travaille.
    this.blob = new Mesh(new PlaneGeometry(...blobSize(spec)).rotateX(-Math.PI / 2), this.shadow);
    this.blob.renderOrder = 1;
    this.blob.matrixAutoUpdate = false;
    this.blob.matrixWorldAutoUpdate = false;
    this.blob.frustumCulled = false;
    this.root.add(this.blob);

    // Livrée : repère de la caisse (véhicule à l'origine), peinture, jantes, vitres, décalques
    this.root.updateMatrixWorld(true);
    const bounds = carSpace(painted);
    const paint = paintMaterial(livery, bounds);
    for (const m of painted) m.material = paint;
    rimColor(mats.rim as MeshStandardMaterial, livery);
    glassTint(mats.glass as MeshStandardMaterial, livery);
    const d = decals(painted, bounds, livery, font);
    for (const m of d.meshes) inner.add(m);
    this.release.push(d.dispose, () => paint.dispose(), () => Object.values(mats).forEach((m) => m.dispose()));
    this.release.push(() => this.shadow.dispose(), () => this.blob.geometry.dispose());
  }

  dispose() {
    for (const f of this.release) f();
  }

  setSun(sun: Vector3) {
    this.sun.copy(sun).setY(0).normalize();
  }

  update(g: Game) {
    this.root.position.copy(g.pos);
    this.root.quaternion.copy(g.quat);
    const car = g.car;
    car.wheels.forEach((w, i) => {
      const v = this.wheels[i];
      v.steer.position.set(this.bike ? 0 : w.attach.x, w.attach.y - w.offset, w.attach.z);
      v.steer.rotation.y = w.front ? -car.steer : 0;
      v.spin.rotation.x = v.left ? w.spin : -w.spin;
    });
    this.tilt.rotation.z = this.bike ? -car.lean : 0;
    this.rear?.color.copy(car.brakeInput > 0 ? BRAKE_ON : BRAKE_OFF);
    this.placeShadow(g);
  }

  /* L'ombre : au sol sous la voiture (moyenne des contacts de roue), alignée sur le cap,
     légèrement décalée à l'opposé du soleil, estompée avec la hauteur quand elle vole. */
  private placeShadow(g: Game) {
    const car = g.car;
    if (car.grounded > 0) {
      SH.p.set(0, 0, 0);
      SH.n.set(0, 0, 0);
      for (const w of car.wheels) {
        if (!w.grounded) continue;
        SH.p.add(w.contact);
        SH.n.add(w.normal);
      }
      SH.p.divideScalar(car.grounded);
      SH.n.normalize();
      // le centre des contacts n'est pas celui de la caisse quand une roue est en l'air :
      // on reste sous l'origine, à la hauteur des contacts
      SH.p.x = g.pos.x;
      SH.p.z = g.pos.z;
      this.groundPos.copy(SH.p);
      this.groundNormal.copy(SH.n);
      this.groundOk = true;
    } else if (this.groundOk) {
      this.groundPos.x = g.pos.x;
      this.groundPos.z = g.pos.z;
    }
    // hauteur de la caisse au-dessus de sa position de repos sur ce sol
    const height = Math.max(0, g.pos.y + this.ground - this.groundPos.y);
    this.shadow.opacity = SHADOW_OPACITY * (this.groundOk ? Math.max(0, 1 - height / 4) : 0);
    // repère : haut = normale du sol, avant = cap de la voiture projeté sur le sol
    SH.fwd.set(0, 0, 1).applyQuaternion(g.quat);
    SH.fwd.addScaledVector(this.groundNormal, -SH.fwd.dot(this.groundNormal)).normalize();
    SH.side.crossVectors(this.groundNormal, SH.fwd);
    SH.m.makeBasis(SH.side, this.groundNormal, SH.fwd);
    SH.pos.copy(this.groundPos).addScaledVector(this.groundNormal, 0.03).addScaledVector(this.sun, -0.5 - height * 0.5);
    SH.m.setPosition(SH.pos);
    // le blob est enfant de la caisse : on écrit sa matrice monde directement
    this.blob.matrixWorld.copy(SH.m);
  }

  /* Vitrine : l'ombre sous la voiture posée, qui tourne avec elle. */
  restShadow() {
    this.shadow.opacity = SHADOW_OPACITY;
    SH.m.makeTranslation(0, this.ground + 0.03, 0);
    this.blob.matrixWorld.multiplyMatrices(this.root.matrixWorld, SH.m);
  }

  setCockpit(on: boolean) {
    for (const m of this.glass) m.opacity = on ? 0.18 : 0.9;
  }
}

/* ------------------------------------------------------------------ fantôme */

const GHOST_MAT = new MeshBasicMaterial({ color: "#8CE6D2", transparent: true, opacity: 0.32, depthWrite: false });
/* profondeur seule, dessinée d'abord : la translucidité ne laisse voir que les surfaces
   de devant, pas les roues et l'intérieur à travers la caisse */
const GHOST_DEPTH = new MeshBasicMaterial({ colorWrite: false });

/* La voiture du meilleur tour, translucide ; on la traverse. Un seul maillage (caisse et
   roues fusionnées), deux appels de dessin (profondeur, puis couleur). */
export class GhostView {
  readonly root = new Group();
  private mesh: Mesh;
  private q2 = new Quaternion();
  private p = new Vector3();
  private q = new Quaternion();
  private one = new Vector3(1, 1, 1);
  private tilt = new Matrix4();
  private leanTrack = new LeanTracker();
  private bike: boolean;
  private ground: number;

  constructor(model: CarModel, spec: CarSpec) {
    const pos: number[] = [];
    const idx: number[] = [];
    const v = new Vector3();
    for (const { mesh: m } of carPieces(model, spec)) {
      const p = m.geometry.getAttribute("position");
      const base = pos.length / 3;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        pos.push(v.x, v.y, v.z);
      }
      const index = m.geometry.getIndex();
      if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const depth = new Mesh(geo, GHOST_DEPTH);
    depth.renderOrder = 2;
    this.mesh = new Mesh(geo, GHOST_MAT);
    this.mesh.renderOrder = 3;
    this.root.add(depth, this.mesh);
    this.root.matrixAutoUpdate = false;
    this.bike = !!spec.bike;
    this.ground = groundY(spec);
    this.root.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }

  update(g: Game, enabled: boolean) {
    const r = g.race;
    const t = r.phase === "countdown" ? 0 : r.time;
    this.root.visible = enabled && g.ghostAt(t, this.p, this.q, this.q2);
    if (!this.root.visible) return;
    this.root.matrix.compose(this.p, this.q, this.one);
    if (this.bike) this.root.matrix.multiply(leanMatrix(this.leanTrack.update(t, this.p, this.q), this.ground, this.tilt));
  }
}

/* ------------------------------------------------------------------ bots */

/* Couleurs des pièces de la voiture pour les bots (la peinture est celle de chaque bot). */
const BOT_PARTS: Record<string, string> = {
  trim: "#1E2126",
  glass: "#16222B",
  chrome: "#C9CDD2",
  light_front: "#FFF4DA",
  light_rear: "#7A1016",
  interior: "#3A3D42",
  plate: "#F1F1EB",
  tire: "#18191C",
  rim: "#B9BEC4",
  caliper: "#D8392B",
  disc: "#6E7076",
  helmet: "#F2F2EC",
  suit: "#1F3A5F",
  livery: "#F4F4F0",
  beacon: "#FF9A1F",
  dirt: "#B5482A",
};

/* Les bots : la voiture fondue en un seul maillage (caisse et roues, couleurs par
   sommet), instanciée ; 7 bots = un appel de dessin, plus un pour leurs ombres. Un bot
   s'efface dans la voiture du joueur et entre elle et la caméra : on les traverse, et
   ils ne cachent jamais la route. */
export class BotsView {
  readonly root = new Group();
  private cars: InstancedMesh;
  private shadows: InstancedMesh;
  private m = new Matrix4();
  private one = new Vector3(1, 1, 1);
  private zero = new Matrix4().makeScale(0, 0, 0);
  private tilt = new Matrix4();
  private tilted = new Matrix4();
  private leans: LeanTracker[];
  private bike: boolean;
  private ground: number;

  constructor(model: CarModel, spec: CarSpec, colors: string[]) {
    this.bike = !!spec.bike;
    this.ground = groundY(spec);
    this.leans = colors.map(() => new LeanTracker());
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const mask: number[] = [];
    const idx: number[] = [];
    const v = new Vector3();
    const c = new Color();
    for (const { mesh, name } of carPieces(model, spec)) {
      const paint = name === "paint";
      c.set(paint ? "#FFFFFF" : (BOT_PARTS[name] ?? BOT_PARTS.trim));
      const p = mesh.geometry.getAttribute("position");
      const n = mesh.geometry.getAttribute("normal");
      const base = pos.length / 3;
      const normalMatrix = new Matrix4().extractRotation(mesh.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix4(normalMatrix).normalize();
        nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
        mask.push(paint ? 1 : 0);
      }
      const index = mesh.geometry.getIndex();
      if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.setAttribute("paintMask", new Float32BufferAttribute(mask, 1));
    geo.setIndex(idx);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.08, envMapIntensity: 0.85 });
    // Seule la peinture prend la couleur du bot ; pneus, vitres et chromes restent.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float paintMask;")
        .replace(
          "#include <color_vertex>",
          "vColor = vec4(1.0);\nvColor.rgb *= color;\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor, paintMask);\n#endif",
        );
    };
    this.cars = new InstancedMesh(geo, mat, colors.length);
    colors.forEach((hex, i) => this.cars.setColorAt(i, c.set(hex)));
    this.cars.frustumCulled = false;

    const shadowMat = new MeshBasicMaterial({
      color: 0x000000,
      alphaMap: model.shadow,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    const blob = new PlaneGeometry(...blobSize(spec)).rotateX(-Math.PI / 2).translate(0, groundY(spec) + 0.02, 0);
    this.shadows = new InstancedMesh(blob, shadowMat, colors.length);
    this.shadows.renderOrder = 1;
    this.shadows.frustumCulled = false;
    this.root.add(this.cars, this.shadows);
  }

  dispose() {
    for (const im of [this.cars, this.shadows]) {
      im.geometry.dispose();
      (im.material as Material).dispose();
      im.dispose();
    }
  }

  /* `states` : les bots par défaut, ou les pilotes en direct d'un même véhicule. */
  update(g: Game, camera: PerspectiveCamera, states: BotState[] = g.botStates) {
    const near = Math.max(2.5, camera.position.distanceTo(g.pos) - 0.5);
    const t = g.race.phase === "countdown" ? 0 : g.race.time;
    states.forEach((s, i) => {
      const inside = s.pos.distanceToSquared(g.pos) < 3.2 * 3.2 || s.pos.distanceToSquared(camera.position) < near * near;
      const m = s.visible && !inside ? this.m.compose(s.pos, s.quat, this.one) : this.zero;
      this.shadows.setMatrixAt(i, m);
      if (this.bike && m !== this.zero) {
        const lean = this.leans[i].update(t, s.pos, s.quat);
        this.cars.setMatrixAt(i, this.tilted.copy(m).multiply(leanMatrix(lean, this.ground, this.tilt)));
      } else {
        this.cars.setMatrixAt(i, m);
      }
    });
    this.cars.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
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
  private back = 6.3;
  private up = 2.15;
  private top = 54;
  private bike = false;
  private ground = 0;
  private leanQ = new Quaternion();
  private zAxis = new Vector3(0, 0, 1);
  /* élargissement du champ pendant un boost */
  private kick = 0;

  setMode(mode: CamMode) {
    this.mode = mode;
  }

  /* Recul, hauteur et œil du pilote propres au véhicule. */
  setVehicle(v: Vehicle) {
    this.back = v.cam.back;
    this.up = v.cam.up;
    this.eye.set(...v.cam.eye);
    this.top = v.spec.topSpeed;
    this.bike = !!v.spec.bike;
    this.ground = groundY(v.spec);
  }

  snap(g: Game) {
    this.fwd.set(0, 0, 1).applyQuaternion(g.quat).setY(0).normalize();
    this.pos.copy(g.pos).addScaledVector(this.fwd, -this.back - 0.1).add(this.tmp.set(0, this.up + 0.15, 0));
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
    const back = this.back + speed * 0.018;
    const target = this.tmp2.copy(g.pos).addScaledVector(this.fwd, -back);
    target.y += this.up + speed * 0.004;
    this.pos.lerp(target, 1 - Math.exp(-d * 7));
    const aim = this.tmp.copy(g.pos).addScaledVector(this.fwd, 4.2);
    aim.y += this.up * 0.35;
    this.look.lerp(aim, 1 - Math.exp(-d * 12));

    const want = this.mode === "cockpit" ? 1 : 0;
    this.blend += (want - this.blend) * (1 - Math.exp(-d * 12));
    if (Math.abs(this.blend - want) < 0.002) this.blend = want;
    const b = this.blend;

    // moto : l'œil tourne avec l'inclinaison (adoucie : 60 %, sinon l'horizon donne le
    // tournis), autour du point de contact
    this.leanQ.setFromAxisAngle(this.zAxis, this.bike ? -g.car.lean * 0.6 : 0);
    const eye = this.tmp.copy(this.eye);
    eye.y -= this.ground;
    eye.applyQuaternion(this.leanQ);
    eye.y += this.ground;
    eye.applyQuaternion(g.quat).add(g.pos);
    cam.position.copy(this.pos).lerp(eye, b);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (b > 0) {
      this.q.copy(g.quat).multiply(this.leanQ).multiply(COCKPIT_Q);
      cam.quaternion.slerp(this.q, b);
    }
    const s = speed / this.top;
    this.kick += ((g.car.boostTime > 0 ? 1 : 0) - this.kick) * (1 - Math.exp(-d * 4));
    cam.fov = (1 - b) * (60 + s * 12) + b * (72 + s * 8) + this.kick * 7;
    // en poursuite la voiture est à plus de 6 m : near large = profondeur précise au loin
    // (boosts, rivage et décalques ne scintillent plus)
    cam.near = b > 0.5 ? 0.08 : 0.4;
    cam.updateProjectionMatrix();
  }
}
