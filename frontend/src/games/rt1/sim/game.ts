/* La partie : monde physique, voiture, chrono. Pas fixe de 120 Hz découplé de
   l'affichage, avec interpolation de la pose pour un rendu fluide à toute cadence. */

import type RapierModule from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { Autopilot, type DriveStyle } from "./autopilot";
import { type Bot, type BotLevel, botPose } from "./bots";
import { Car, GRAVITY, GROUND_GROUP, WALL_GROUP } from "./car";
import { Input } from "./input";
import type { LevelData } from "./level";
import { GhostRecorder, ghostPose } from "./ghost";
import { POSE_HZ, type Rival } from "./online";
import { type Best, Race, type RaceEvent } from "./race";
import { TrackLocator } from "./track";
import type { Vehicle } from "./vehicles";

const H = 1 / 120;
const MAX_STEPS = 6;

/* Hors piste, selon le circuit. Avec murs (infranchissables, à 7,75 m de l'axe) : passé
   par-dessus, on ne peut pas revenir, remise en piste au bout de 3 s. Sans murs : la
   sortie de route est libre, 5 s pour revenir. La voiture est reposée là où elle a
   quitté la route, le chrono continue. */
const RULES = {
  walls: { out: 8.6, back: 7.2, time: 3 },
  open: { out: 8.2, back: 7.0, time: 5 },
};

/* Rapier (4 Mo de JS, WASM compris) n'est chargé qu'à la première course, pas avec les
   menus : le module est importé à la demande et gardé ici. */
type Rapier = typeof RapierModule;
let RAPIER: Rapier;
let init: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  init ??= import("@dimforge/rapier3d-compat")
    .then(async (m) => {
      await m.default.init();
      RAPIER = m.default;
    })
    .catch((e) => {
      init = null;
      throw e;
    });
  return init;
}

export type TriMesh = { vertices: Float32Array; indices: Uint32Array };

/* Murs : pavés pleins le long de la face intérieure du muret visible, épais vers
   l'extérieur et bien plus hauts que lui (mur invisible : un saut ne fait pas sortir).
   Pleins, ils ne se traversent pas, quel que soit le sens des faces. */
const WALL_THICKNESS = 1.0;
const WALL_TOP = 8.0;
const WALL_BOTTOM = 1.0;

/* Course en direct : le top départ (Date.now() local), les autres pilotes, et l'envoi
   de sa propre pose. */
export type OnlineSetup = { startAt: number; rivals: Rival[]; sendPose: (d: number[]) => void };

/* Au départ : son record et son fantôme, ou le pilote défié (écarts et fantôme), ou des
   bots (sans fantôme), ou une course en direct (sans fantôme non plus). */
export type RaceSetup = {
  best: Best | null;
  ghost: Float32Array | null;
  rival: { pseudo: string; best: Best; ghost: Float32Array } | null;
  bots: Bot[];
  level?: BotLevel;
  vehicle: Vehicle;
  online?: OnlineSetup;
};

/* Un bot (ou un pilote en direct) à l'image affichée : pose, visible ou non, avancement
   dans la course. */
export type BotState = { pos: Vector3; quat: Quaternion; visible: boolean; progress: number; locator: TrackLocator };

export type GameEvent = RaceEvent | { type: "respawn" } | { type: "restart" } | { type: "boost" } | { type: "closed" };

/* Troncs et rochers près de la route : de vrais obstacles (rayon au sol, à l'échelle 1). */
const OBSTACLES: Record<string, number> = { palm: 0.3, pine: 0.4, niaouli: 0.32, lamp: 0.15, rock: 1.2 };

/* Les tronçons de level.json (3 m) bout à bout tant qu'ils restent alignés : chaque pavé
   coûte à chaque pas de physique, une ligne droite n'en demande qu'un. En virage, l'écart
   entre un pavé droit et le muret courbe reste sous quelques centimètres. */
function mergeWalls(segments: number[][]): number[][] {
  const out: number[][] = [];
  const MAX_LEN = 40, MAX_TURN = 0.03, MAX_RISE = 0.6;
  let cur: number[] | null = null;
  const dir = (s: number[]) => Math.atan2(s[3] - s[0], s[5] - s[2]);
  // les tronçons alternent les côtés : un côté après l'autre
  const ordered = [...segments.filter((s) => s[6] > 0), ...segments.filter((s) => s[6] < 0)];
  for (const s of ordered) {
    if (cur && cur[6] === s[6] && Math.abs(cur[3] - s[0]) < 0.05 && Math.abs(cur[5] - s[2]) < 0.05) {
      const dx = s[3] - cur[0], dz = s[5] - cur[2];
      const len = Math.hypot(dx, dz);
      let turn = dir(s) - dir(cur);
      turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
      // le pavé est droit entre ses deux bouts : l'écart au muret vaut ≈ len·turn/8
      const sag = (len * Math.abs(turn)) / 8;
      const rise = Math.abs(s[4] - cur[1]);
      if (len <= MAX_LEN && sag < 0.08 && Math.abs(turn) < MAX_TURN * 3 && rise < MAX_RISE) {
        cur[3] = s[3];
        cur[4] = s[4];
        cur[5] = s[5];
        continue;
      }
    }
    cur = [...s];
    out.push(cur);
  }
  return out;
}

let ids = 0;

export class Game {
  readonly id = ++ids;
  readonly world: RapierModule.World;
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
  private listeners = new Set<(e: GameEvent) => void>();
  private flipped = 0;
  /* pilote automatique à l'arrêt (coincé contre un mur) depuis… */
  private stuck = 0;
  readonly level: LevelData;
  private track: TrackLocator;
  private lastOnRoad = 0;
  private rules: (typeof RULES)["walls"];
  /* circuit bordé de murs infranchissables */
  readonly walls: boolean;
  /* secondes restantes avant la remise en piste, null sur la route */
  offTrack: number | null = null;
  private boosts: { pos: Vector3; dir: Vector3; side: Vector3; half: number; len: number }[];
  private recorder = new GhostRecorder();
  /* fantôme suivi : le pilote défié, sinon son record (remplacé à chaque nouveau) */
  ghost: Float32Array | null;
  readonly rival: string | null;
  /* poses du dernier tour fini, envoyées avec un record */
  lastLap: Float32Array | null = null;
  readonly vehicle: Vehicle;
  readonly bots: Bot[];
  readonly botLevel: BotLevel | null;
  readonly botStates: BotState[];
  /* course en direct : les autres pilotes et l'envoi de sa pose */
  readonly rivals: Rival[];
  readonly rivalStates: BotState[];
  private online: OnlineSetup | null;
  private nextPose = 0;
  /* point d'axe le plus proche de la voiture, et de chaque porte d'un tour */
  private lineIdx = 0;
  private gateIdx: number[];
  private q2 = new Quaternion();
  private tmpV = new Vector3();
  /* vitesse avant le pas, normale du mur touché, contact au pas précédent */
  private before = new Vector3();
  private wallN = new Vector3();
  private touching = false;

  constructor(level: LevelData, road: TriMesh, setup: RaceSetup) {
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
        .setCollisionGroups(GROUND_GROUP),
      body,
    );
    const segments = meta.wallSegments ?? [];
    const hasWalls = meta.walls !== false && segments.length > 0;
    this.walls = hasWalls;
    this.rules = hasWalls ? RULES.walls : RULES.open;
    // La route : un maillage tourné vers le haut (level.py) ; à deux faces quand même, un
    // contact venu de dessous (caisse retournée) vaut mieux qu'une traversée.
    const roadDesc = RAPIER.ColliderDesc.trimesh(road.vertices, road.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED);
    this.world.createCollider(roadDesc.setFriction(0.8).setCollisionGroups(GROUND_GROUP), body);
    if (hasWalls) {
      const a = new Vector3(), b = new Vector3(), u = new Vector3(), c = new Vector3();
      const q = new Quaternion(), up = new Vector3(0, 1, 0);
      for (const [ax, ay, az, bx, by, bz, side] of mergeWalls(segments)) {
        a.set(ax, ay, az);
        b.set(bx, by, bz);
        u.copy(b).sub(a).setY(0);
        const len = u.length();
        if (len < 0.01) continue;
        u.divideScalar(len);
        // à gauche du sens de marche : haut × tangente ; dehors = ce côté-ci ou l'autre
        const out = new Vector3(u.z, 0, -u.x).multiplyScalar(side);
        const bottom = Math.min(ay, by) - WALL_BOTTOM, top = Math.max(ay, by) + WALL_TOP;
        c.copy(a).add(b).multiplyScalar(0.5).addScaledVector(out, WALL_THICKNESS / 2);
        c.y = (bottom + top) / 2;
        q.setFromAxisAngle(up, Math.atan2(u.x, u.z));
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(WALL_THICKNESS / 2, (top - bottom) / 2, len / 2 + 0.2)
            .setTranslation(c.x, c.y, c.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setFriction(0.02)
            .setCollisionGroups(WALL_GROUP),
          body,
        );
      }
    }

    this.track = new TrackLocator(meta.line);
    // obstacles : troncs (cylindres) et rochers (boules) à moins de 30 m de la route
    for (const [kind, list] of Object.entries(meta.instances)) {
      const r = OBSTACLES[kind];
      if (!r) continue;
      const rq = new Quaternion(), yAxis = new Vector3(0, 1, 0);
      for (const [x, y, z, rot, sc] of list) {
        this.track.reset();
        if (this.track.locate(new Vector3(x, y, z)).lateral > 30) continue;
        let desc: RapierModule.ColliderDesc;
        if (kind === "rock") {
          // le rocher du modèle : un ellipsoïde 1,3 × 0,7 × 1,0 (× 1,2 × échelle), tourné ;
          // un pavé un peu plus petit, qu'on heurte au lieu d'y grimper comme sur une boule
          rq.setFromAxisAngle(yAxis, rot);
          desc = RAPIER.ColliderDesc.cuboid(1.3 * r * sc * 0.8, 0.7 * r * sc, 1.0 * r * sc * 0.8)
            .setTranslation(x, y + 0.3 * sc, z)
            .setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w });
        } else desc = RAPIER.ColliderDesc.cylinder(3, r * sc).setTranslation(x, y + 3, z);
        this.world.createCollider(desc.setFriction(0.4).setCollisionGroups(WALL_GROUP), body);
      }
    }
    this.track.reset();
    this.vehicle = setup.vehicle;
    this.car = new Car(RAPIER, this.world, setup.vehicle.spec);
    this.boosts = (meta.boosts ?? []).map((b) => {
      const dir = new Vector3(...b.dir).normalize();
      return { pos: new Vector3(...b.pos), dir, side: new Vector3(-dir.z, 0, dir.x), half: b.half, len: b.len };
    });
    this.ghost = setup.rival?.ghost ?? setup.ghost;
    this.rival = setup.rival?.pseudo ?? null;
    this.bots = setup.bots;
    this.botLevel = setup.bots.length ? (setup.level ?? "normal") : null;
    const state = () => ({
      pos: new Vector3(),
      quat: new Quaternion(),
      visible: false,
      progress: 0,
      locator: new TrackLocator(meta.line),
    });
    this.botStates = setup.bots.map(state);
    this.online = setup.online ?? null;
    this.rivals = setup.online?.rivals ?? [];
    this.rivalStates = this.rivals.map(state);
    const probe = new TrackLocator(meta.line);
    this.gateIdx = [...meta.checkpoints, meta.start].map((g) => probe.locate(new Vector3(...g.pos)).i);
    const s = meta.spawn;
    this.spawn = { pos: new Vector3(...s.pos), dir: new Vector3(...s.dir) };
    this.race = new Race(meta.checkpoints, meta.start, meta.laps ?? 1, setup.best, setup.rival?.best ?? null);
    if (setup.online) this.race.startAt = setup.online.startAt;
    this.restart(false);
  }

  /* Contre un mur ou un obstacle : la normale du contact (horizontale, vers la voiture),
     passée à la voiture qui décide de ce que le contact coûte (frôler ou taper). */
  private wallContact() {
    const n = this.wallN.set(0, 0, 0);
    let found = false;
    this.world.contactPairsWith(this.car.collider, (other) => {
      if (found || other.collisionGroups() !== WALL_GROUP) return;
      this.world.contactPair(this.car.collider, other, (m) => {
        if (found || m.numContacts() === 0) return;
        const mn = m.normal();
        n.set(mn.x, 0, mn.z);
        found = n.lengthSq() > 1e-4;
      });
    });
    const fresh = found && !this.touching;
    this.touching = found;
    if (!found) return;
    n.normalize();
    // orientée vers la voiture : contre la vitesse d'approche, sinon vers l'axe de la route
    const approach = this.before.x * n.x + this.before.z * n.z;
    if (Math.abs(approach) > 0.5) {
      if (approach > 0) n.negate();
    } else {
      const p = this.level.meta.line[this.lineIdx];
      if ((p[0] - this.curPos.x) * n.x + (p[2] - this.curPos.z) * n.z < 0) n.negate();
    }
    this.car.wall(n, this.before, H, fresh);
  }

  /* Course en direct : pas de « Recommencer », le chrono est celui de tous. */
  get live(): boolean {
    return this.online !== null;
  }

  /* Adversaires à l'écran, bots ou pilotes en direct. */
  get opponents(): number {
    return this.bots.length + this.rivals.length;
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit = (e: GameEvent) => {
    for (const fn of this.listeners) fn(e);
  };

  /* Événements du chrono : un record devient le fantôme suivi (hors défi). */
  private onRace = (e: RaceEvent) => {
    if (e.type === "finish") {
      this.lastLap = this.recorder.finish();
      if (e.best && !this.rival) this.ghost = this.lastLap;
    }
    this.emit(e);
  };

  /* En direct : la table a clos la course (30 s après le premier arrivé, 10 min) avant
     qu'on passe la ligne. On s'arrête là, la course n'est pas comptée. */
  closeLive() {
    if (!this.live || this.race.phase !== "racing") return;
    this.race.phase = "finished";
    this.input.clear();
    this.emit({ type: "closed" });
  }

  /* Pose du fantôme au temps de course t (faux s'il n'y en a pas). */
  ghostAt(t: number, p: Vector3, q: Quaternion, q2: Quaternion): boolean {
    return this.ghost !== null && ghostPose(this.ghost, t, p, q, q2);
  }

  /* pilote automatique ou temps accéléré : ses temps ne partent pas au serveur */
  get testing(): boolean {
    return this.autopilot !== null || this.speedup !== 1;
  }

  testMode(autopilot: boolean, speedup: number, style?: DriveStyle) {
    this.autopilot = autopilot ? new Autopilot(this.level.meta.line, style, this.vehicle.ap, this.level.meta.lineStep) : null;
    this.speedup = speedup;
  }

  restart(notify = true) {
    if (this.live && notify) {
      // En direct, on ne repart pas à zéro : retour au départ, le chrono continue.
      if (this.race.phase !== "racing") return;
      this.place(this.spawn.pos, this.spawn.dir);
      this.emit({ type: "respawn" });
      return;
    }
    this.race.reset();
    this.autopilot?.reset();
    this.track.reset();
    this.lastOnRoad = 0;
    this.lineIdx = 0;
    this.nextPose = 0;
    for (const b of [...this.botStates, ...this.rivalStates]) b.locator.reset();
    this.recorder.reset();
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
    // Après une image très longue, au plus six pas : le temps en trop est perdu (ralenti),
    // plutôt qu'une image suivante encore plus longue.
    if (this.acc > MAX_STEPS * H) this.acc = MAX_STEPS * H;
    while (this.acc >= H) {
      this.acc -= H;
      this.prevPos.copy(this.curPos);
      this.prevQuat.copy(this.curQuat);
      const racing = this.race.phase === "racing";
      const c = racing
        ? (this.autopilot ? this.autopilot.drive(this.car) : this.input.read())
        : { steer: 0, throttle: 0, brake: 0, hold: true };
      this.car.update(H, c);
      const v0 = this.car.body.linvel();
      this.before.set(v0.x, v0.y, v0.z);
      this.world.step();
      this.readPose(this.curPos, this.curQuat);
      this.wallContact();
      this.race.step(H, this.prevPos, this.curPos, this.onRace);
      if (this.curPos.y < -30) {
        // tombée hors du monde : on repart du départ (en direct, même hors course)
        if (this.live) {
          this.place(this.spawn.pos, this.spawn.dir);
          this.emit({ type: "respawn" });
        } else this.restart();
        continue;
      }
      const { i, lateral } = this.track.locate(this.curPos);
      this.lineIdx = i;
      if (racing) {
        this.recorder.sample(this.race.time, this.curPos, this.curQuat);
        if (this.online && this.race.time >= this.nextPose) {
          this.nextPose = this.race.time + 1 / POSE_HZ;
          const p = this.curPos, q = this.curQuat;
          this.online.sendPose([this.race.time, p.x, p.y, p.z, q.x, q.y, q.z, q.w, this.race.next]);
        }
        for (const b of this.boosts) {
          const d = this.tmpV.copy(this.curPos).sub(b.pos);
          const along = d.dot(b.dir);
          if (along > -1 && along < b.len + 1 && Math.abs(d.dot(b.side)) < b.half && Math.abs(d.y) < 3) {
            if (this.car.boostTime <= 0.2) this.emit({ type: "boost" });
            this.car.boostTime = 1.4;
          }
        }
        if (lateral < this.rules.back) {
          this.offTrack = null;
          this.lastOnRoad = i;
        } else if (lateral > this.rules.out && this.offTrack === null) {
          this.offTrack = this.rules.time;
        }
        if (this.offTrack !== null) {
          this.offTrack -= H;
          if (this.offTrack <= 0) {
            this.recover();
            continue;
          }
        }
        // pilote automatique coincé : reprise au dernier checkpoint, comme le ferait un joueur
        this.stuck = this.autopilot && Math.abs(this.car.forwardSpeed) < 1 ? this.stuck + H : 0;
        if (this.stuck > 2) {
          this.stuck = 0;
          this.respawn();
          continue;
        }
        // retournée ou dans le lagon (l'eau est à y = 0, la route jamais sous 2 m) : remise en piste
        const inWater = this.curPos.y < -0.8;
        this.flipped = this.car.upsideDown() || inWater ? this.flipped + H : 0;
        if (this.flipped > (inWater ? 0.6 : 1.4)) this.recover();
      }
    }
    const a = this.acc / H;
    this.pos.lerpVectors(this.prevPos, this.curPos, a);
    this.quat.slerpQuaternions(this.prevQuat, this.curQuat, a);
    if (this.bots.length) this.updateBots();
    if (this.rivals.length) this.updateRivals();
  }

  /* Avancement dans la course : portes passées, plus la part faite vers la suivante le
     long de l'axe (0 tant qu'on est derrière la dernière porte, au départ). */
  private progress(passed: number, lineIdx: number): number {
    const n = this.track.length;
    const lap = this.gateIdx;
    const prev = passed === 0 ? lap[lap.length - 1] : lap[(passed - 1) % lap.length];
    const next = lap[passed % lap.length];
    const seg = ((next - prev + n) % n) || n;
    const f = ((lineIdx - prev + n) % n) / seg;
    return passed + (f > 1 ? 0 : f);
  }

  private updateBots() {
    const r = this.race;
    const t = r.phase === "countdown" ? 0 : r.time;
    this.bots.forEach((b, k) => {
      const s = this.botStates[k];
      s.visible = botPose(b, t, s.pos, s.quat, this.q2);
      if (t >= b.time) {
        s.progress = Infinity;
        return;
      }
      const passed = b.splits.filter((x) => x <= t).length;
      s.progress = this.progress(passed, s.locator.locate(s.pos).i);
    });
  }

  /* Les pilotes en direct : leur dernière pose relayée, interpolée ; arrivés, ils sont
     devant tout le monde, partis, derrière. */
  private updateRivals() {
    const r = this.race;
    const t = r.phase === "countdown" ? 0 : r.time;
    this.rivals.forEach((rv, k) => {
      const s = this.rivalStates[k];
      s.visible = rv.pose(t, s.pos, s.quat, this.q2);
      if (rv.out) s.progress = -Infinity;
      else if (rv.finished) s.progress = Infinity;
      else if (s.visible) s.progress = this.progress(rv.gate, s.locator.locate(s.pos).i);
    });
  }

  /* Place du pilote parmi les autres (1 = en tête). Arrivé, c'est son temps qui compte. */
  get position(): number {
    const r = this.race;
    if (r.phase === "finished") {
      return (
        1 +
        this.bots.filter((b) => b.time < r.time).length +
        this.rivals.filter((rv) => rv.time !== null && rv.time < r.time).length
      );
    }
    const mine = this.progress(r.next, this.lineIdx);
    return 1 + [...this.botStates, ...this.rivalStates].filter((s) => s.progress > mine).length;
  }

  dispose() {
    this.listeners.clear();
    this.world.free();
  }
}
