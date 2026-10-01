/* Le garage, dans l'ordre des prix : chaque véhicule, sa physique (CarSpec), la vitesse de référence du pilote
   automatique (bots, tests), sa caméra, sa voix, son prix. Les prix et niveaux sont le
   miroir de backend/app/games/rt1/rules.py (VEHICLES). Modèles : assets/rt1/vehicles.py,
   servis en public/rt1/cars/<id>.glb. */

import type { AutopilotTuning } from "./autopilot";
import { type CarSpec, GRAVITY, STARTER } from "./car";

export type Family =
  | "city" | "sport" | "rally" | "bush" | "super" | "kart" | "f1" | "buggy" | "suv" | "truck"
  | "trail" | "mx" | "sportbike";

export type Vehicle = {
  id: string;
  family: Family;
  spec: CarSpec;
  /* pilote automatique : vitesse visée en ligne droite et perte par virage (m/s) */
  ap: AutopilotTuning;
  /* caméra de poursuite (recul, hauteur) et œil du pilote dans la caisse */
  cam: { back: number; up: number; eye: [number, number, number] };
  price: number;
  level: number;
};

export const VEHICLES: Vehicle[] = [
  {
    id: "starter",
    family: "city",
    spec: STARTER,
    ap: { top: 52, corner: 38 },
    cam: { back: 6.3, up: 2.15, eye: [0.34, 0.66, 0] },
    price: 0,
    level: 1,
  },
  {
    id: "kart",
    family: "kart",
    spec: {
      mass: 170, half: [0.62, 0.2, 0.95], bodyY: 0.12, comY: -0.08, wheelRadius: 0.17, track: 0.6,
      attachY: 0.02, frontZ: 0.55, rearZ: -0.5, rest: 0.09, spring: 26000, bump: 1100, rebound: 1400,
      antiRoll: 4000, engine: 2150, topSpeed: 41, reverse: 700, brake: 2900, gripFront: 1.9, gripRear: 1.85,
      driveFront: 0, drag: 0.05, downforce: 0.12, steerLow: 0.62, steerHigh: 0.2, gears: 1,
    },
    ap: { top: 40, corner: 20, decel: 12.8 },
    cam: { back: 4.4, up: 1.5, eye: [0, 0.6, 0.1] },
    price: 4000,
    level: 2,
  },
  {
    id: "trail",
    family: "trail",
    spec: {
      mass: 215, half: [0.34, 0.32, 1.0], bodyY: 0.38, comY: -0.05, wheelRadius: 0.34, track: 0.14,
      attachY: 0.12, frontZ: 0.76, rearZ: -0.7, rest: 0.3, spring: 16000, bump: 950, rebound: 1250,
      antiRoll: 6000, engine: 3500, topSpeed: 51, reverse: 600, brake: 3600, gripFront: 1.45, gripRear: 1.4,
      driveFront: 0, drag: 0.09, downforce: 0.12, steerLow: 0.7, steerHigh: 0.16, gears: 5, bike: true,
    },
    ap: { top: 50, corner: 36, decel: 12 },
    cam: { back: 4.0, up: 1.55, eye: [0, 1.25, -0.05] },
    price: 5000,
    level: 2,
  },
  {
    id: "truck",
    family: "truck",
    spec: {
      mass: 9000, half: [1.3, 0.85, 3.7], bodyY: 0.75, comY: 0.1, wheelRadius: 0.62, track: 1.08,
      attachY: 0.2, frontZ: 2.5, rearZ: -2.3, rest: 0.45, spring: 260000, bump: 26000, rebound: 33000,
      antiRoll: 130000, engine: 80000, topSpeed: 48, reverse: 22000, brake: 120000, gripFront: 1.48, gripRear: 1.44,
      driveFront: 0, drag: 3.0, downforce: 5, steerLow: 0.5, steerHigh: 0.11, gears: 6,
    },
    ap: { top: 46, corner: 31, decel: 10.0 },
    cam: { back: 11.5, up: 4.6, eye: [0.55, 1.58, 3.1] },
    price: 6000,
    level: 3,
  },
  {
    id: "pickup",
    family: "bush",
    spec: {
      mass: 1900, half: [0.95, 0.42, 2.55], bodyY: 0.34, comY: -0.08, wheelRadius: 0.42, track: 0.88,
      attachY: 0.06, frontZ: 1.66, rearZ: -1.56, rest: 0.4, spring: 52000, bump: 5500, rebound: 7000,
      antiRoll: 24000, engine: 18500, topSpeed: 54, reverse: 6000, brake: 27000, gripFront: 1.52, gripRear: 1.48,
      driveFront: 0.3, drag: 0.72, downforce: 1.2, steerLow: 0.55, steerHigh: 0.12, gears: 5,
    },
    ap: { top: 52, corner: 35, decel: 10.7 },
    cam: { back: 7.4, up: 2.7, eye: [0.36, 0.97, 0.42] },
    price: 7000,
    level: 3,
  },
  {
    id: "suv",
    family: "suv",
    spec: {
      mass: 1800, half: [0.92, 0.45, 2.15], bodyY: 0.38, comY: -0.06, wheelRadius: 0.41, track: 0.86,
      attachY: 0.08, frontZ: 1.4, rearZ: -1.36, rest: 0.4, spring: 50000, bump: 5200, rebound: 6600,
      antiRoll: 24000, engine: 19000, topSpeed: 56, reverse: 6000, brake: 26000, gripFront: 1.6, gripRear: 1.57,
      driveFront: 0.5, drag: 0.7, downforce: 1.2, steerLow: 0.56, steerHigh: 0.12, gears: 5,
    },
    ap: { top: 54, corner: 36, decel: 10.8 },
    cam: { back: 7.0, up: 2.6, eye: [0.36, 1.0, 0.22] },
    price: 9000,
    level: 4,
  },
  {
    id: "sport",
    family: "sport",
    spec: {
      mass: 1250, half: [0.88, 0.27, 2.08], bodyY: 0.1, comY: -0.2, wheelRadius: 0.34, track: 0.82,
      attachY: -0.06, frontZ: 1.36, rearZ: -1.3, rest: 0.26, spring: 48000, bump: 3800, rebound: 4800,
      antiRoll: 22000, engine: 14000, topSpeed: 63, reverse: 4200, brake: 21000, gripFront: 1.72, gripRear: 1.68,
      driveFront: 0, drag: 0.4, downforce: 1.5, steerLow: 0.55, steerHigh: 0.12, gears: 6,
    },
    ap: { top: 61, corner: 45, decel: 12.6 },
    cam: { back: 6.5, up: 2.0, eye: [0.36, 0.34, 0] },
    price: 11000,
    level: 4,
  },
  {
    id: "mx",
    family: "mx",
    spec: {
      mass: 185, half: [0.34, 0.32, 0.98], bodyY: 0.42, comY: -0.05, wheelRadius: 0.35, track: 0.14,
      attachY: 0.16, frontZ: 0.76, rearZ: -0.7, rest: 0.38, spring: 12500, bump: 800, rebound: 1050,
      antiRoll: 5000, engine: 3500, topSpeed: 54, reverse: 520, brake: 3200, gripFront: 1.55, gripRear: 1.5,
      driveFront: 0, drag: 0.08, downforce: 0.1, steerLow: 0.72, steerHigh: 0.17, gears: 5, bike: true,
    },
    ap: { top: 53, corner: 38, decel: 12 },
    cam: { back: 4.0, up: 1.55, eye: [0, 1.3, -0.05] },
    price: 12000,
    level: 5,
  },
  {
    id: "rally",
    family: "rally",
    spec: {
      mass: 1200, half: [0.84, 0.31, 1.95], bodyY: 0.17, comY: -0.16, wheelRadius: 0.34, track: 0.8,
      attachY: -0.02, frontZ: 1.25, rearZ: -1.22, rest: 0.36, spring: 38000, bump: 3300, rebound: 4300,
      antiRoll: 17000, engine: 15000, topSpeed: 60, reverse: 4200, brake: 19500, gripFront: 1.8, gripRear: 1.76,
      driveFront: 0.5, drag: 0.42, downforce: 1.35, steerLow: 0.62, steerHigh: 0.14, gears: 6,
    },
    ap: { top: 58, corner: 40, decel: 12.2 },
    cam: { back: 6.3, up: 2.2, eye: [0.32, 0.64, 0] },
    price: 14000,
    level: 5,
  },
  {
    id: "buggy",
    family: "buggy",
    spec: {
      mass: 720, half: [0.82, 0.3, 1.55], bodyY: 0.3, comY: -0.12, wheelRadius: 0.38, track: 0.86,
      attachY: 0.02, frontZ: 1.12, rearZ: -1.08, rest: 0.44, spring: 21000, bump: 2100, rebound: 2700,
      antiRoll: 7500, engine: 9100, topSpeed: 61, reverse: 2600, brake: 12000, gripFront: 1.78, gripRear: 1.74,
      driveFront: 0, drag: 0.26, downforce: 0.7, steerLow: 0.64, steerHigh: 0.15, gears: 5,
    },
    ap: { top: 59, corner: 41, decel: 12.5 },
    cam: { back: 6.0, up: 2.3, eye: [0.3, 0.45, 0.12] },
    price: 16000,
    level: 5,
  },
  {
    id: "sportbike",
    family: "sportbike",
    spec: {
      mass: 245, half: [0.34, 0.28, 1.05], bodyY: 0.3, comY: -0.1, wheelRadius: 0.31, track: 0.14,
      attachY: 0.06, frontZ: 0.72, rearZ: -0.72, rest: 0.2, spring: 22000, bump: 1200, rebound: 1500,
      antiRoll: 7000, engine: 4900, topSpeed: 68, reverse: 600, brake: 4600, gripFront: 1.68, gripRear: 1.64,
      driveFront: 0, drag: 0.1, downforce: 0.3, steerLow: 0.6, steerHigh: 0.11, gears: 6, bike: true,
    },
    ap: { top: 63, corner: 46, decel: 14, jump: 30 },
    cam: { back: 4.0, up: 1.55, eye: [0, 1.0, 0.05] },
    price: 30000,
    level: 7,
  },
  {
    id: "super",
    family: "super",
    spec: {
      mass: 1350, half: [0.98, 0.25, 2.2], bodyY: 0.06, comY: -0.22, wheelRadius: 0.35, track: 0.88,
      attachY: -0.08, frontZ: 1.42, rearZ: -1.36, rest: 0.22, spring: 62000, bump: 4800, rebound: 6200,
      antiRoll: 30000, engine: 18800, topSpeed: 71, reverse: 4600, brake: 26000, gripFront: 1.88, gripRear: 1.84,
      driveFront: 0.3, drag: 0.38, downforce: 2.4, steerLow: 0.52, steerHigh: 0.1, gears: 7,
    },
    ap: { top: 67, corner: 46, decel: 14.4, jump: 30 },
    cam: { back: 6.8, up: 1.95, eye: [0.38, 0.26, -0.08] },
    price: 45000,
    level: 8,
  },
  {
    id: "f1",
    family: "f1",
    spec: {
      mass: 760, half: [0.85, 0.2, 2.4], bodyY: 0.04, comY: -0.12, wheelRadius: 0.33, track: 0.85,
      attachY: -0.02, frontZ: 1.66, rearZ: -1.56, rest: 0.15, spring: 60000, bump: 3000, rebound: 3800,
      antiRoll: 26000, engine: 15800, topSpeed: 82, reverse: 2800, brake: 20500, gripFront: 2.2, gripRear: 2.15,
      driveFront: 0, drag: 0.25, downforce: 2.5, steerLow: 0.5, steerHigh: 0.09, gears: 8,
    },
    ap: { top: 78, corner: 50, decel: 20.2, jump: 26 },
    cam: { back: 5.4, up: 1.6, eye: [0, 0.4, 0.18] },
    price: 70000,
    level: 10,
  },
];

export const DEFAULT_VEHICLE = "starter";

export function vehicleById(id: string | null | undefined): Vehicle {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}

/* Hauteur du sol sous l'origine de la caisse, suspension tassée par le poids : c'est là
   que les modèles posent leurs roues (sol du modèle à y = 0). */
export function groundY(s: CarSpec): number {
  const sag = (s.mass * GRAVITY) / 4 / s.spring;
  return s.attachY - (s.rest - sag) - s.wheelRadius;
}

/* Notes du garage, de 0 à 1 : vitesse de pointe, accélération, adhérence. */
export function ratings(s: CarSpec): { speed: number; accel: number; grip: number } {
  const clamp = (x: number) => Math.max(0.05, Math.min(1, x));
  return {
    speed: clamp((s.topSpeed - 30) / 52),
    accel: clamp((s.engine / s.mass - 5) / 17),
    grip: clamp(((s.gripFront + s.gripRear) / 2 - 1.2) / 0.95),
  };
}
