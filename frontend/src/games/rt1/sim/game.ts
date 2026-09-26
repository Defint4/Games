/* La partie : monde physique, voiture, chrono. Pas fixe de 120 Hz découplé de
   l'affichage, avec interpolation de la pose pour un rendu fluide à toute cadence. */

import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { Autopilot } from "./autopilot";
import { Car, GRAVITY, STARTER } from "./car";
import { Input } from "./input";
import type { LevelData } from "./level";
import { Race, type RaceEvent } from "./race";

const H = 1 / 120;

let init: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  init ??= RAPIER.init().catch((e) => {
    init = null;
    throw e;
  });
  return init;
}

export type TriMesh = { vertices: Float32Array; indices: Uint32Array };

let ids = 0;

export class Game {
  readonly id = ++ids;
  readonly world: RAPIER.World;
  readonly car: Car;
  readonly race: Race;
  readonly input = new Input();
  /* pose affichée (interpolée) */
  readonly pos = new Vector3();
  readonly quat = new Quaternion();
  private prevPos = new Vector3();
  private prevQuat = new Quaternion();
  private curPos = new Vector3();
  private curQuat = new Quaternion();
  private acc = 0;
  /* tests : pilote automatique et temps accéléré (?autopilot, ?speedup=n) */
  private autopilot: Autopilot | null = null;
  private speedup = 1;
  private spawn: { pos: Vector3; dir: Vector3 };
  private listeners = new Set<(e: RaceEvent | { type: "respawn" } | { type: "restart" }) => void>();
  private flipped = 0;
  readonly level: LevelData;

  constructor(level: LevelData, road: TriMesh, walls: TriMesh) {
    this.level = level;
    const { meta, heights } = level;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = H;

    // Terrain : champ de hauteurs (lignes le long de z, colonnes le long de x)
    const tr = meta.terrain;
    const nr = tr.ny - 1;
    const nc = tr.nx - 1;
    const hf = new Float32Array((nr + 1) * (nc + 1));
    for (let c = 0; c <= nc; c++) {
      for (let r = 0; r <= nr; r++) {
        const j = nr - r; // ligne Blender (y croissant) → z three croissant
        hf[r + c * (nr + 1)] = heights[j * tr.nx + c] / 100;
      }
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(nr, nc, hf, { x: tr.x1 - tr.x0, y: 1, z: tr.y1 - tr.y0 })
        .setTranslation((tr.x0 + tr.x1) / 2, 0, -(tr.y0 + tr.y1) / 2)
        .setFriction(0.8)
        .setCollisionGroups(0x0001_ffff),
      body,
    );
    for (const m of [road, walls]) {
      const desc = RAPIER.ColliderDesc.trimesh(m.vertices, m.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
      this.world.createCollider(desc.setFriction(m === walls ? 0.02 : 0.8).setCollisionGroups(0x0001_ffff), body);
    }

    this.car = new Car(RAPIER, this.world, STARTER);
    const s = meta.spawn;
    this.spawn = { pos: new Vector3(...s.pos), dir: new Vector3(...s.dir) };
    this.race = new Race(meta.name, meta.checkpoints, meta.start);
    this.restart(false);
  }

  on(fn: (e: RaceEvent | { type: "respawn" } | { type: "restart" }) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit = (e: RaceEvent | { type: "respawn" } | { type: "restart" }) => {
    for (const fn of this.listeners) fn(e);
  };

  testMode(autopilot: boolean, speedup: number) {
    this.autopilot = autopilot ? new Autopilot(this.level.meta.line) : null;
    this.speedup = speedup;
  }

  restart(notify = true) {
    this.race.reset();
    this.autopilot?.reset();
    this.place(this.spawn.pos, this.spawn.dir);
    if (notify) this.emit({ type: "restart" });
  }

  /* Reprise au dernier checkpoint (le chrono continue), au départ sinon. */
  respawn() {
    if (this.race.phase !== "racing") return;
    const g = this.race.respawnGate();
    if (!g) {
      this.restart();
      return;
    }
    this.place(g.pos.clone().add(new Vector3(0, 0.7, 0)), g.dir);
    this.emit({ type: "respawn" });
  }

  private place(pos: Vector3, dir: Vector3) {
    this.car.place(pos, dir);
    this.flipped = 0;
    this.acc = 0;
    this.readPose(this.curPos, this.curQuat);
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    this.pos.copy(this.curPos);
    this.quat.copy(this.curQuat);
  }

  private readPose(p: Vector3, q: Quaternion) {
    const t = this.car.body.translation();
    const r = this.car.body.rotation();
    p.set(t.x, t.y, t.z);
    q.set(r.x, r.y, r.z, r.w);
  }

  /* Appelé à chaque image avec le temps écoulé. */
  update(dt: number) {
    this.acc += Math.min(dt, 0.1) * this.speedup;
    while (this.acc >= H) {
      this.acc -= H;
      this.prevPos.copy(this.curPos);
      this.prevQuat.copy(this.curQuat);
      const racing = this.race.phase === "racing";
      const c = racing
        ? (this.autopilot ? this.autopilot.drive(this.car) : this.input.read())
        : { steer: 0, throttle: 0, brake: 0, hold: true };
      this.car.update(H, c);
      this.world.step();
      this.readPose(this.curPos, this.curQuat);
      this.race.step(H, this.prevPos, this.curPos, this.emit);
      if (this.curPos.y < -30) {
        // tombée hors du monde : on repart du départ
        this.restart();
        continue;
      }
      if (racing) {
        this.flipped = this.car.upsideDown() || this.curPos.y < -2.5 ? this.flipped + H : 0;
        if (this.flipped > (this.curPos.y < -2.5 ? 0.3 : 1.4)) this.respawn();
      }
    }
    const a = this.acc / H;
    this.pos.lerpVectors(this.prevPos, this.curPos, a);
    this.quat.slerpQuaternions(this.prevQuat, this.curQuat, a);
  }

  dispose() {
    this.listeners.clear();
    this.world.free();
  }
}
