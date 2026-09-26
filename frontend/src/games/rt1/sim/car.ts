/* Voiture arcade : un corps rigide Rapier (la caisse, qui heurte les murs) porté par
   quatre rayons de suspension. Les forces de pneu sont calculées ici : on garde la main
   sur le comportement (précis, pardonnant) plutôt que de subir un modèle de simulation.

   Repère de la caisse : +Z vers l'avant, +Y en haut, +X à gauche. */

import type RAPIER from "@dimforge/rapier3d-compat";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { Controls } from "./input";

export type CarSpec = {
  mass: number;
  /* demi-dimensions de la caisse (collision) et son décalage vertical */
  half: [number, number, number];
  bodyY: number;
  comY: number;
  wheelRadius: number;
  /* points d'attache des roues : x (demi-voie), y, z avant et arrière */
  track: number;
  attachY: number;
  frontZ: number;
  rearZ: number;
  rest: number;
  spring: number;
  bump: number;
  rebound: number;
  antiRoll: number;
  engine: number;
  topSpeed: number;
  reverse: number;
  brake: number;
  gripFront: number;
  gripRear: number;
  /* part motrice avant / arrière */
  driveFront: number;
  drag: number;
  downforce: number;
  steerLow: number;
  steerHigh: number;
  gears: number;
};

export const STARTER: CarSpec = {
  mass: 1150,
  half: [0.8, 0.3, 1.92],
  bodyY: 0.14,
  comY: -0.16,
  wheelRadius: 0.33,
  track: 0.76,
  attachY: -0.04,
  frontZ: 1.24,
  rearZ: -1.2,
  rest: 0.32,
  spring: 34000,
  bump: 3000,
  rebound: 3900,
  antiRoll: 14000,
  engine: 9800,
  topSpeed: 54,
  reverse: 4200,
  brake: 17000,
  gripFront: 1.55,
  gripRear: 1.5,
  driveFront: 0.4,
  drag: 0.42,
  downforce: 1.1,
  steerLow: 0.58,
  steerHigh: 0.13,
  gears: 5,
};

export const GRAVITY = 9.81 * 1.35;

type Wheel = {
  attach: Vector3;
  front: boolean;
  left: boolean;
  /* distance attache → centre de roue (le long du bas de la caisse) */
  offset: number;
  compression: number;
  grounded: boolean;
  contact: Vector3;
  normal: Vector3;
  load: number;
  spin: number;
  slip: number;
};

const tmp = {
  down: new Vector3(),
  up: new Vector3(),
  fwd: new Vector3(),
  side: new Vector3(),
  wfwd: new Vector3(),
  origin: new Vector3(),
  pos: new Vector3(),
  p: new Vector3(),
  v: new Vector3(),
  f: new Vector3(),
  q: new Quaternion(),
  steerQ: new Quaternion(),
};

export class Car {
  readonly spec: CarSpec;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly wheels: Wheel[];
  private R: typeof RAPIER;
  private world: RAPIER.World;
  private ray: RAPIER.Ray;
  steer = 0;
  throttle = 0;
  brakeInput = 0;
  speed = 0;
  forwardSpeed = 0;
  rpm = 0.2;
  gear = 1;
  grounded = 0;
  slip = 0;
  airTime = 0;

  constructor(R: typeof RAPIER, world: RAPIER.World, spec: CarSpec) {
    this.R = R;
    this.world = world;
    this.spec = spec;
    const s = spec;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setLinearDamping(0.02).setAngularDamping(0.35).setCcdEnabled(true).setCanSleep(false),
    );
    const [hx, hy, hz] = s.half;
    this.collider = world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(0, s.bodyY, 0)
        .setDensity(0)
        .setFriction(0.05)
        .setRestitution(0.1)
        .setCollisionGroups(0x0002_0001)
        .setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.body,
    );
    const m = s.mass;
    const w = hx * 2, h = hy * 2 + 0.3, l = hz * 2;
    this.body.setAdditionalMassProperties(
      m,
      { x: 0, y: s.comY, z: 0 },
      { x: (m / 12) * (h * h + l * l), y: (m / 12) * (w * w + l * l) * 1.25, z: (m / 12) * (w * w + h * h) },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    const mk = (x: number, z: number, front: boolean): Wheel => ({
      attach: new Vector3(x, s.attachY, z),
      front,
      left: x > 0,
      offset: s.rest,
      compression: 0,
      grounded: false,
      contact: new Vector3(),
      normal: new Vector3(0, 1, 0),
      load: 0,
      spin: 0,
      slip: 0,
    });
    this.wheels = [mk(s.track, s.frontZ, true), mk(-s.track, s.frontZ, true), mk(s.track, s.rearZ, false), mk(-s.track, s.rearZ, false)];
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  /* Place la voiture à l'arrêt, posée au-dessus de `pos`, tournée vers `dir`. */
  place(pos: Vector3, dir: Vector3) {
    const yaw = Math.atan2(dir.x, dir.z);
    tmp.q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: tmp.q.x, y: tmp.q.y, z: tmp.q.z, w: tmp.q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.speed = 0;
    this.forwardSpeed = 0;
    this.rpm = 0.2;
    this.gear = 1;
    this.airTime = 0;
    for (const w of this.wheels) {
      w.offset = this.spec.rest;
      w.compression = 0;
      w.grounded = false;
      w.slip = 0;
    }
  }

  /* Un pas fixe de simulation (avant world.step). */
  update(h: number, c: Controls) {
    const s = this.spec;
    const b = this.body;
    const t = b.translation();
    const r = b.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    const up = tmp.up.set(0, 1, 0).applyQuaternion(tmp.q);
    const down = tmp.down.copy(up).negate();
    const fwd = tmp.fwd.set(0, 0, 1).applyQuaternion(tmp.q);
    const lv = b.linvel();
    const vel = tmp.v.set(lv.x, lv.y, lv.z);
    this.speed = vel.length();
    this.forwardSpeed = vel.dot(fwd);

    // Direction : plus fermée à haute vitesse, retour au centre plus vif que l'attaque.
    const v = Math.abs(this.forwardSpeed);
    const maxSteer = MathUtils.lerp(s.steerLow, s.steerHigh, MathUtils.smoothstep(v, 0, 42));
    const target = c.steer * maxSteer;
    const rate = (Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer) ? 6 : 3.4) * h;
    this.steer += MathUtils.clamp(target - this.steer, -rate, rate);

    // Accélérateur / frein / marche arrière
    let drive = 0;
    let brake = 0;
    if (c.hold) {
      brake = s.brake;
    } else if (c.brake > 0 && this.forwardSpeed < 0.8 && c.throttle === 0) {
      drive = this.forwardSpeed > -9 ? -s.reverse : 0;
    } else {
      if (c.throttle > 0) {
        const k = Math.max(0, this.forwardSpeed) / s.topSpeed;
        drive = c.throttle * s.engine * Math.max(0, 1 - Math.pow(k, 1.6));
      }
      if (c.brake > 0) brake = s.brake * c.brake;
    }
    this.throttle = MathUtils.lerp(this.throttle, c.throttle, 1 - Math.exp(-h * 12));
    this.brakeInput = c.brake;

    const mEff = s.mass / 4;
    const com = tmp.p.set(t.x, t.y, t.z).addScaledVector(up, s.comY);
    const comX = com.x, comYw = com.y, comZ = com.z;
    const maxLen = s.rest + s.wheelRadius;
    const pos = tmp.pos.set(t.x, t.y, t.z);
    let grounded = 0;
    let slipSum = 0;

    // Rayons de suspension
    for (const w of this.wheels) {
      const o = tmp.origin.copy(w.attach).applyQuaternion(tmp.q).add(pos);
      this.ray.origin = { x: o.x, y: o.y, z: o.z };
      this.ray.dir = { x: down.x, y: down.y, z: down.z };
      const hit = this.world.castRayAndGetNormal(this.ray, maxLen, true, undefined, 0xffff_0001, undefined, b);
      if (hit) {
        const toi = hit.timeOfImpact;
        w.grounded = true;
        w.contact.copy(o).addScaledVector(down, toi);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        const prev = w.compression;
        w.compression = maxLen - toi;
        w.offset = toi - s.wheelRadius;
        const rateC = (w.compression - prev) / h;
        w.load = Math.max(0, s.spring * w.compression + (rateC > 0 ? s.bump : s.rebound) * rateC);
        grounded++;
      } else {
        w.grounded = false;
        w.compression = 0;
        w.load = 0;
        w.offset = Math.min(s.rest, w.offset + h * 3);
      }
    }
    // Barres anti-roulis
    for (const [a, bw] of [[0, 1], [2, 3]] as const) {
      const wa = this.wheels[a], wb = this.wheels[bw];
      if (!wa.grounded || !wb.grounded) continue;
      const f = s.antiRoll * (wa.compression - wb.compression);
      wa.load = Math.max(0, wa.load + f);
      wb.load = Math.max(0, wb.load - f);
    }

    const driveShare = [s.driveFront / 2, s.driveFront / 2, (1 - s.driveFront) / 2, (1 - s.driveFront) / 2];
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.grounded) {
        w.slip = 0;
        w.spin += ((this.forwardSpeed + (drive > 0 && !w.front ? 6 : 0)) / s.wheelRadius) * h;
        continue;
      }
      const n = w.normal;
      // Ressort : le long de l'axe haut de la caisse, appliqué au centre de roue.
      const wc = tmp.f.copy(w.contact).addScaledVector(n, s.wheelRadius);
      b.applyImpulseAtPoint(
        { x: up.x * w.load * h, y: up.y * w.load * h, z: up.z * w.load * h },
        { x: wc.x, y: wc.y, z: wc.z },
        true,
      );
      // Axes du pneu dans le plan du sol
      const wf = tmp.wfwd.copy(fwd);
      if (w.front) wf.applyQuaternion(tmp.steerQ.setFromAxisAngle(up, -this.steer));
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const side = tmp.side.crossVectors(n, wf).normalize();
      const pv = b.velocityAtPoint({ x: w.contact.x, y: w.contact.y, z: w.contact.z });
      const vLong = pv.x * wf.x + pv.y * wf.y + pv.z * wf.z;
      const vLat = pv.x * side.x + pv.y * side.y + pv.z * side.z;

      let fx = drive * driveShare[i];
      if (brake > 0) {
        const bshare = w.front ? 0.3 : 0.2;
        fx -= Math.sign(vLong) * Math.min(brake * bshare, (Math.abs(vLong) * mEff) / h);
      } else if (drive === 0) {
        fx -= Math.sign(vLong) * Math.min(260, (Math.abs(vLong) * mEff) / h);
      }
      let fy = (-vLat * mEff) / h;
      const mu = (w.front ? s.gripFront : s.gripRear) * w.load;
      const mag = Math.hypot(fx, fy);
      let slip = 0;
      if (mag > mu && mag > 0) {
        slip = Math.min(1, (mag - mu) / (mu + 1));
        fx *= mu / mag;
        fy *= mu / mag;
      }
      w.slip = Math.max(slip, Math.min(1, Math.abs(vLat) / 9));
      slipSum += w.slip;
      // Appliqué à mi-hauteur entre le sol et le centre de gravité : moins de roulis.
      const px = MathUtils.lerp(w.contact.x, comX, 0.55);
      const py = MathUtils.lerp(w.contact.y, comYw, 0.55);
      const pz = MathUtils.lerp(w.contact.z, comZ, 0.55);
      b.applyImpulseAtPoint(
        { x: (wf.x * fx + side.x * fy) * h, y: (wf.y * fx + side.y * fy) * h, z: (wf.z * fx + side.z * fy) * h },
        { x: px, y: py, z: pz },
        true,
      );
      w.spin += (vLong / s.wheelRadius) * h;
    }

    // Aérodynamique : traînée et appui
    const sp = this.speed;
    if (sp > 0.1) {
      const d = s.drag * sp * h;
      b.applyImpulse({ x: -vel.x * d, y: -vel.y * d, z: -vel.z * d }, true);
    }
    if (grounded > 0) {
      const df = s.downforce * this.forwardSpeed * this.forwardSpeed * h;
      b.applyImpulse({ x: down.x * df, y: down.y * df, z: down.z * df }, true);
    }
    // En l'air : la caisse se stabilise
    this.grounded = grounded;
    this.airTime = grounded === 0 ? this.airTime + h : 0;
    b.setAngularDamping(grounded === 0 ? 1.6 : 0.35);
    // Un peu d'amortissement du lacet sans direction : la voiture ne se dandine pas.
    if (grounded > 1 && Math.abs(c.steer) < 0.01) {
      const av = b.angvel();
      const yawRate = av.x * up.x + av.y * up.y + av.z * up.z;
      const k = -yawRate * 900 * h;
      b.applyTorqueImpulse({ x: up.x * k, y: up.y * k, z: up.z * k }, true);
    }
    this.slip = grounded ? slipSum / grounded : 0;

    // Régime et rapport (pour le son et le compte-tours)
    const ratio = MathUtils.clamp(Math.abs(this.forwardSpeed) / s.topSpeed, 0, 1);
    const gearF = ratio * s.gears;
    let gear = Math.min(s.gears, Math.floor(gearF) + 1);
    if (this.forwardSpeed < -0.5) gear = 0;
    const within = gear === 0 ? Math.min(1, Math.abs(this.forwardSpeed) / 9) : gearF - (gear - 1);
    const target2 = grounded === 0 && this.throttle > 0.5 ? 1 : 0.22 + 0.74 * within * (gear === 1 ? 1 : 0.62) + (gear > 1 ? 0.3 : 0);
    const free = this.throttle > 0.5 && Math.abs(this.forwardSpeed) < 1 ? 0.55 : 0;
    this.rpm = MathUtils.lerp(this.rpm, Math.max(target2, free, 0.18), 1 - Math.exp(-h * (gear !== this.gear ? 6 : 14)));
    this.gear = gear;
  }

  /* Retournée ou coincée : à remettre au dernier checkpoint. */
  upsideDown(): boolean {
    const r = this.body.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    return tmp.up.set(0, 1, 0).applyQuaternion(tmp.q).y < 0.15;
  }
}
