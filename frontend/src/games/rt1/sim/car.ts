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
  /* Moto : quatre rayons très rapprochés et un stabilisateur qui la garde droite ; elle
     ne penche qu'à l'image (lean), d'après l'accélération latérale. Arcade assumé : une
     vraie moto en équilibre serait injouable au doigt. */
  bike?: boolean;
  /* part du freinage sur l'avant (0,6 par défaut ; réglage fin de l'atelier) */
  brakeFront?: number;
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

/* Groupes de collision Rapier (appartenance << 16 | filtre). Le sol (terrain, route) porte
   les rayons de suspension ; murs et obstacles ne les portent pas : un rayon qui touchait un
   mur le prenait pour du sol et faisait grimper la voiture par-dessus. La caisse heurte tout. */
export const GROUND_GROUP = 0x0001_ffff;
export const WALL_GROUP = 0x0004_ffff;
const CAR_GROUP = 0x0002_0005;
const RAY_GROUPS = 0xffff_0001;

/* angle de dérive (rad) au pic d'adhérence du pneu */
const SLIP_PEAK = 0.13;
/* Contre un mur, tout dépend de la vitesse d'approche perpendiculaire au mur (vn, m/s) :
   sous SCRAPE_VN on frôle (on glisse le long en perdant un peu de vitesse, la voiture se
   remet dans l'axe), au-dessus de HIT_VN on tape (grosse perte, rebond, la voiture est
   secouée), entre les deux on passe progressivement de l'un à l'autre. */
const SCRAPE_VN = 4;
const HIT_VN = 11;
/* frottement en glissade (part de la vitesse perdue par seconde) : de base, et par m/s
   d'approche */
const SCRAPE_DRAG = 0.25;
const SCRAPE_DRAG_VN = 0.08;
/* choc : vitesse perdue par m/s d'approche (au plus HIT_LOSS_MAX), rebond, adhérence
   gardée et durée de la secousse */
const HIT_LOSS = 0.03;
const HIT_LOSS_MAX = 0.6;
const HIT_BOUNCE = 0.3;
const HIT_GRIP = 0.55;
const HIT_TIME = 0.35;
/* remise dans l'axe du mur en glissade (rad/s par rad d'écart) */
const ALIGN = 3;
const WALL_MAX_VY = 1.0;

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
  /* secondes de boost restantes */
  boostTime = 0;
  /* secondes restantes de l'état « contre un mur » (nourri par wall() après chaque pas) */
  wallTime = 0;
  /* secondes restantes après un choc franc : adhérence réduite, la voiture est secouée */
  hitTime = 0;
  /* inclinaison dans le virage (rad, positive vers la gauche), lissée : l'image des motos */
  lean = 0;

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
        .setCollisionGroups(CAR_GROUP),
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
    this.boostTime = 0;
    this.wallTime = 0;
    this.hitTime = 0;
    this.lean = 0;
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
        const k = Math.max(0, this.forwardSpeed) / (s.topSpeed * (this.boostTime > 0 ? 1.3 : 1));
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
      const hit = this.world.castRayAndGetNormal(this.ray, maxLen, true, undefined, RAY_GROUPS, undefined, b);
      // une paroi (normale presque horizontale) n'est pas un sol : la roue est en l'air
      if (hit && hit.normal.y > 0.5) {
        const toi = hit.timeOfImpact;
        w.grounded = true;
        w.contact.copy(o).addScaledVector(down, toi);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        const prev = w.compression;
        w.compression = maxLen - toi;
        w.offset = toi - s.wheelRadius;
        // vitesse de compression bornée : une marche (bord de route, réception) donnait
        // un coup de bélier de l'amortisseur ; la charge est plafonnée à 4 fois le poids
        const rateC = MathUtils.clamp((w.compression - prev) / h, -6, 6);
        w.load = MathUtils.clamp(s.spring * w.compression + (rateC > 0 ? s.bump : s.rebound) * rateC, 0, s.mass * GRAVITY);
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
        const bf = s.brakeFront ?? 0.6;
        const bshare = w.front ? bf / 2 : (1 - bf) / 2;
        fx -= Math.sign(vLong) * Math.min(brake * bshare, (Math.abs(vLong) * mEff) / h);
      } else if (drive === 0) {
        fx -= Math.sign(vLong) * Math.min(260 * (s.mass / 1150), (Math.abs(vLong) * mEff) / h);
      }
      // Pneu latéral progressif : l'effort monte avec l'angle de dérive jusqu'au pic
      // (SLIP_PEAK), puis plafonne, au lieu d'annuler toute dérive en un pas puis de
      // décrocher d'un coup. Sous 3 m/s, l'ancienne règle : la voiture s'arrête net.
      const mu = (w.front ? s.gripFront : s.gripRear) * w.load * (this.hitTime > 0 ? HIT_GRIP : 1);
      const kill = (-vLat * mEff) / h;
      const sa = Math.atan2(Math.abs(vLat), Math.max(Math.abs(vLong), 3));
      const progressive = -Math.sign(vLat) * mu * Math.tanh(sa / SLIP_PEAK);
      const low = MathUtils.smoothstep(this.speed, 2, 4);
      let fy = MathUtils.lerp(Math.abs(kill) < Math.abs(progressive) ? kill : progressive, progressive, low);
      const mag = Math.hypot(fx, fy);
      let slip = 0;
      if (mag > mu && mag > 0) {
        slip = Math.min(1, (mag - mu) / (mu + 1));
        fx *= mu / mag;
        fy *= mu / mag;
      }
      w.slip = Math.max(slip, Math.min(1, sa / 0.5), Math.min(1, Math.abs(vLat) / 9));
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

    // Contre un mur (voir wall()) : ni décollage ni tonneau, vitesse verticale bornée et
    // roulis ramené.
    if (this.hitTime > 0) this.hitTime -= h;
    if (this.wallTime > 0) {
      this.wallTime -= h;
      const m = s.mass;
      if (lv.y > WALL_MAX_VY) b.applyImpulse({ x: 0, y: -(lv.y - WALL_MAX_VY) * m, z: 0 }, true);
      const side = tmp.side.set(1, 0, 0).applyQuaternion(tmp.q);
      const av0 = b.angvel();
      const roll = av0.x * fwd.x + av0.y * fwd.y + av0.z * fwd.z;
      const k = (-side.y * 25 - roll * 6) * m * h;
      b.applyTorqueImpulse({ x: fwd.x * k, y: fwd.y * k, z: fwd.z * k }, true);
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
    // Boost : poussée vers l'avant, même sans accélérer
    if (this.boostTime > 0) {
      this.boostTime -= h;
      if (grounded > 0) {
        const f = 7500 * (s.mass / 1150) * h;
        b.applyImpulse({ x: fwd.x * f, y: fwd.y * f, z: fwd.z * f }, true);
      }
    }
    // En l'air : la caisse se stabilise
    this.grounded = grounded;
    this.airTime = grounded === 0 ? this.airTime + h : 0;
    b.setAngularDamping(grounded === 0 ? 1.6 : 0.35);
    // Un peu d'amortissement du lacet sans direction : la voiture ne se dandine pas.
    if (grounded > 1 && Math.abs(c.steer) < 0.01) {
      const av = b.angvel();
      const yawRate = av.x * up.x + av.y * up.y + av.z * up.z;
      const k = -yawRate * 900 * (s.mass / 1150) * h;
      b.applyTorqueImpulse({ x: up.x * k, y: up.y * k, z: up.z * k }, true);
    }
    this.slip = grounded ? slipSum / grounded : 0;

    // Inclinaison d'équilibre : tan(angle) = accélération latérale / g.
    const av = b.angvel();
    const yaw = av.x * up.x + av.y * up.y + av.z * up.z;
    const want = grounded > 0 ? MathUtils.clamp(Math.atan((this.forwardSpeed * yaw) / GRAVITY), -0.85, 0.85) : this.lean * 0.98;
    this.lean += (want - this.lean) * (1 - Math.exp(-h * 9));
    if (s.bike) {
      // Moto : la caisse est tenue droite (roulis ramené à zéro, amorti).
      const side = tmp.side.set(1, 0, 0).applyQuaternion(tmp.q);
      const roll = av.x * fwd.x + av.y * fwd.y + av.z * fwd.z;
      const k = (-side.y * 60 - roll * 9) * s.mass * h;
      b.applyTorqueImpulse({ x: fwd.x * k, y: fwd.y * k, z: fwd.z * k }, true);
    }

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

  /* Contact avec un mur, après le pas de physique. `n` : normale horizontale du mur, vers
     la voiture ; `before` : vitesse avant le pas (celle d'approche) ; `fresh` : premier
     pas du contact. Le solveur a déjà empêché la traversée ; ici on décide de ce que le
     contact coûte. */
  wall(n: Vector3, before: Vector3, h: number, fresh: boolean) {
    const b = this.body;
    const lv = b.linvel();
    const vn = Math.max(0, -(before.x * n.x + before.z * n.z));
    // vitesse actuelle : composante le long du mur, et vers l'extérieur du mur
    const dn = lv.x * n.x + lv.z * n.z;
    let tx = lv.x - dn * n.x, tz = lv.z - dn * n.z;
    const hit = MathUtils.clamp((vn - SCRAPE_VN) / (HIT_VN - SCRAPE_VN), 0, 1);
    let out: number;
    if (fresh && hit > 0) {
      // choc : perte de vitesse et rebond selon la violence de l'approche
      const loss = Math.min(HIT_LOSS_MAX, HIT_LOSS * vn) * hit;
      tx *= 1 - loss;
      tz *= 1 - loss;
      out = Math.max(dn, HIT_BOUNCE * vn * hit, 0.3);
      if (hit >= 1) this.hitTime = HIT_TIME;
    } else {
      // glissade : on frotte, un peu plus si on appuie contre le mur
      const k = Math.min(1, (SCRAPE_DRAG + SCRAPE_DRAG_VN * vn) * h);
      tx *= 1 - k;
      tz *= 1 - k;
      out = MathUtils.clamp(dn, 0.2, 1.2);
    }
    b.setLinvel({ x: tx + out * n.x, y: lv.y, z: tz + out * n.z }, true);
    // en glissade, la voiture se remet dans l'axe du mur au lieu de partir en travers
    if (this.hitTime <= 0) {
      const r = b.rotation();
      tmp.q.set(r.x, r.y, r.z, r.w);
      const f = tmp.fwd.set(0, 0, 1).applyQuaternion(tmp.q).setY(0).normalize();
      const along = Math.sign(f.x * tx + f.z * tz) || 1;
      const len = Math.hypot(tx, tz);
      if (len > 1) {
        const dx = (tx / len) * along, dz = (tz / len) * along;
        const err = Math.atan2(f.z * dx - f.x * dz, f.x * dx + f.z * dz);
        const av = b.angvel();
        const want = MathUtils.clamp(err * ALIGN, -2, 2);
        b.setAngvel({ x: av.x, y: av.y + (want - av.y) * Math.min(1, h * 20), z: av.z }, true);
      }
    }
    this.wallTime = 0.25;
  }

  /* Retournée ou coincée : à remettre au dernier checkpoint. */
  upsideDown(): boolean {
    const r = this.body.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    return tmp.up.set(0, 1, 0).applyQuaternion(tmp.q).y < 0.15;
  }
}
