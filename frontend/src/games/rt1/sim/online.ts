/* Course en direct : les adversaires sont des fantômes nourris au fil de l'eau. Chaque
   pilote envoie sa pose dix fois par seconde (t de course, position, rotation, porte
   suivante) ; le serveur la relaie telle quelle. Ici on garde les dernières poses de
   chacun et on les interpole comme un fantôme, avec un léger retard pour lisser le
   réseau. Le départ est commun : une heure du serveur, traduite en heure locale grâce à
   des pings. */

import type { Quaternion, Vector3 } from "three";
import { ghostPose } from "./ghost";

export const POSE_HZ = 10;
/* On affiche les autres avec ce retard sur leur dernière pose reçue : entre deux poses
   on interpole au lieu d'extrapoler, et une pose en retard d'un paquet passe inaperçue. */
const LAG = 0.18;
/* Poses gardées par adversaire (6 s). */
const KEEP = 60;
const STRIDE = 8;

export class Rival {
  readonly seat: number;
  readonly name: string;
  readonly color: string;
  readonly vehicle: string;
  /* porte suivante annoncée avec la dernière pose (progression) */
  gate = 0;
  /* arrivé (temps en s) ou abandon : il s'efface */
  time: number | null = null;
  out = false;
  private data = new Float32Array(0);
  private last = -Infinity;

  constructor(seat: number, name: string, color: string, vehicle: string) {
    this.seat = seat;
    this.name = name;
    this.color = color;
    this.vehicle = vehicle;
  }

  /* Une pose relayée : t, x, y, z, qx, qy, qz, qw, porte. */
  push(d: number[]) {
    if (d.length < 9 || d[0] <= this.last) return;
    this.last = d[0];
    this.gate = d[8];
    const n = this.data.length / STRIDE;
    const keep = Math.min(n, KEEP - 1);
    const next = new Float32Array((keep + 1) * STRIDE);
    next.set(this.data.subarray((n - keep) * STRIDE), 0);
    next.set(d.slice(0, STRIDE), keep * STRIDE);
    this.data = next;
  }

  /* Pose au temps de course t ; faux tant qu'il n'y a rien à montrer, ou une fois arrivé. */
  pose(t: number, p: Vector3, q: Quaternion, q2: Quaternion): boolean {
    if (this.out || (this.time !== null && t > this.time + 0.6)) return false;
    // plus de 3 s sans nouvelle : figé quelque part, on le cache (déconnecté, en pause)
    if (t - LAG > this.last + 3) return false;
    return ghostPose(this.data, t - LAG, p, q, q2);
  }

  get finished(): boolean {
    return this.time !== null;
  }
}

/* Décalage entre l'horloge du serveur et celle de l'appareil, estimé au ping le plus
   court : offset = serveur − local (ms). */
export class ClockSync {
  private best = Infinity;
  offset = 0;
  samples = 0;

  /* `sent` : Date.now() à l'envoi ; `now` : heure du serveur (s) à la réception. */
  pong(sent: number, now: number) {
    const received = Date.now();
    const rtt = received - sent;
    this.samples++;
    if (rtt < this.best) {
      this.best = rtt;
      this.offset = now * 1000 - (sent + rtt / 2);
    }
  }

  /* Sans pong encore : l'heure du serveur lue dans un message, à l'aller simple près. */
  coarse(serverNow: number) {
    if (this.samples === 0) this.offset = serverNow * 1000 - Date.now();
  }

  /* Une heure du serveur (s) en Date.now() local (ms). */
  local(serverSeconds: number): number {
    return serverSeconds * 1000 - this.offset;
  }
}
