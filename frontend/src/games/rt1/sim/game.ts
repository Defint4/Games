/* La partie : monde physique, voiture, chrono. Pas fixe de 120 Hz découplé de
   l'affichage, avec interpolation de la pose pour un rendu fluide à toute cadence. */

import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { Autopilot } from "./autopilot";
import { Car, GRAVITY, STARTER } from "./car";
import { Input } from "./input";
import type { LevelData } from "./level";
import { Race, type RaceEvent } from "./race";
import { TrackLocator } from "./track";

const H = 1 / 120;

/* Hors piste : au-delà de OUT m de l'axe (les murs sont à 7,75 m), on a OFF_TIME s pour
   revenir, sinon la voiture est reposée là où elle a quitté la route. */
const OUT = 8.6;
const BACK = 7.2;
const OFF_TIME = 5;
/* Murs : traversables depuis l'extérieur (on peut revenir), actifs de nouveau une fois
   la voiture entièrement rentrée (hystérésis : pas de voiture coincée dans un mur). */
const WALLS_OFF = 8.3;
const WALLS_ON = 6.2;

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
  private track: TrackLocator;
  private lastOnRoad = 0;
  private wallsOff = false;
  private wallHandle = -1;
  private hooks: RAPIER.PhysicsHooks;
  /* secondes restantes avant la remise en piste, null sur la route */
  offTrack: number | null = null;

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
      const col = this.world.createCollider(desc.setFriction(m === walls ? 0.02 : 0.8).setCollisionGroups(0x0001_ffff), body);
      if (m === walls) this.wallHandle = col.handle;
    }

    this.car = new Car(RAPIER, this.world, STARTER);
    this.track = new TrackLocator(meta.line);
    const carHandle = this.car.collider.handle;
    this.hooks = {
      filterContactPair: (c1, c2) => {
        const wall = (c1 === carHandle && c2 === this.wallHandle) || (c2 === carHandle && c1 === this.wallHandle);
        return wall && this.wallsOff ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair: () => true,
    };
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
    this.track.reset();
    this.lastOnRoad = 0;
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

  /* Remise en piste là où la voiture a quitté la route (le chrono continue). */
  recover() {
    if (this.race.phase !== "racing") return;
    const { pos, dir } = this.track.pose(this.lastOnRoad);
    this.track.reset(this.lastOnRoad);
    this.place(pos.add(new Vector3(0, 0.7, 0)), dir);
    this.emit({ type: "respawn" });
  }

  private place(pos: Vector3, dir: Vector3) {
    this.car.place(pos, dir);
    this.flipped = 0;
    this.offTrack = null;
    this.wallsOff = false;
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
      this.world.step(undefined, this.hooks);
      this.readPose(this.curPos, this.curQuat);
      this.race.step(H, this.prevPos, this.curPos, this.emit);
      if (this.curPos.y < -30) {
        // tombée hors du monde : on repart du départ
        this.restart();
        continue;
      }
      const { i, lateral } = this.track.locate(this.curPos);
      if (lateral > WALLS_OFF) this.wallsOff = true;
      else if (lateral < WALLS_ON) this.wallsOff = false;
      if (racing) {
        if (lateral < BACK) {
          this.offTrack = null;
          this.lastOnRoad = i;
        } else if (lateral > OUT && this.offTrack === null) {
          this.offTrack = OFF_TIME;
        }
        if (this.offTrack !== null) {
          this.offTrack -= H;
          if (this.offTrack <= 0) {
            this.recover();
            continue;
          }
        }
        // retournée ou dans le lagon : remise en piste
        this.flipped = this.car.upsideDown() || this.curPos.y < -2.5 ? this.flipped + H : 0;
        if (this.flipped > (this.curPos.y < -2.5 ? 0.6 : 1.4)) this.recover();
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
