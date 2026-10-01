/* Fantôme d'un tour : la pose de la voiture 20 fois par seconde (t, position, rotation).
   Gardé sur le serveur avec le record (backend/app/games/rt1), en base64. */

import type { Quaternion, Vector3 } from "three";

export const GHOST_HZ = 20;
const STRIDE = 8;

export class GhostRecorder {
  private data: number[] = [];
  private next = 0;

  reset() {
    this.data = [];
    this.next = 0;
  }

  sample(t: number, p: Vector3, q: Quaternion) {
    if (t < this.next) return;
    this.next = t + 1 / GHOST_HZ;
    this.data.push(t, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  }

  finish(): Float32Array {
    return Float32Array.from(this.data);
  }
}

/* Pose du fantôme au temps t (interpolée) ; faux si pas de données. */
export function ghostPose(g: Float32Array, t: number, p: Vector3, q: Quaternion, q2: Quaternion): boolean {
  const n = g.length / STRIDE;
  if (n < 2) return false;
  let i = Math.min(n - 2, Math.max(0, Math.floor(t * GHOST_HZ)));
  while (i > 0 && g[i * STRIDE] > t) i--;
  while (i < n - 2 && g[(i + 1) * STRIDE] < t) i++;
  const a = i * STRIDE, b = (i + 1) * STRIDE;
  const k = Math.max(0, Math.min(1, (t - g[a]) / Math.max(1e-6, g[b] - g[a])));
  p.set(g[a + 1] + (g[b + 1] - g[a + 1]) * k, g[a + 2] + (g[b + 2] - g[a + 2]) * k, g[a + 3] + (g[b + 3] - g[a + 3]) * k);
  q.set(g[a + 4], g[a + 5], g[a + 6], g[a + 7]);
  q2.set(g[b + 4], g[b + 5], g[b + 6], g[b + 7]);
  q.slerp(q2, k);
  return true;
}

export function encodeGhost(g: Float32Array): string {
  const bytes = new Uint8Array(g.buffer, g.byteOffset, g.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeGhost(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length - (bin.length % 4));
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
