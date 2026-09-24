"use client";

/* La maintenance vue de l'app (panneau admin, backend app/rooms/manager.py) :
   - « off » : tout est ouvert ;
   - « draining » : plus de nouvelle partie, celles en cours se terminent ; tenter d'en
     lancer une ouvre le popup (MaintenanceNotice) ;
   - « locked » : plus aucune partie en cours, l'app entière laisse place à l'écran de
     maintenance (MaintenanceGate), jusqu'à la réouverture.
   L'état arrive à l'instant par les WebSockets (tables, accueils de jeu) et, partout
   ailleurs, par /api/status (voir MaintenanceGate). */

import { useSyncExternalStore } from "react";
import { API_URL, ApiError } from "./api";
import { serverText } from "./serverMessages";

export type Phase = "off" | "draining" | "locked";

/* Le refus du serveur (backend app/rooms/router.py, MAINTENANCE), tel qu'il l'envoie. */
export const MAINTENANCE_DETAIL =
  "Mise à jour imminente : les nouvelles parties reviennent dans quelques minutes.";

const PHASES: Phase[] = ["off", "draining", "locked"];

let phase: Phase = "off";
let notice = false;
// Compteur des annonces reçues en direct (WebSocket) : une lecture de /api/status partie
// avant l'une d'elles ne doit pas la contredire (voir pollPhase).
let announced = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhase(): Phase {
  return phase;
}

function apply(next: unknown) {
  if (PHASES.includes(next as Phase) && next !== phase) {
    phase = next as Phase;
    emit();
  }
}

/* Annonce du serveur par WebSocket (tables, accueils de jeu) : fait foi à l'instant. */
export function setPhase(next: unknown) {
  announced += 1;
  apply(next);
}

export function usePhase(): Phase {
  return useSyncExternalStore(subscribe, getPhase, () => "off");
}

export function useNoticeOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => notice,
    () => false,
  );
}

export function closeNotice() {
  notice = false;
  emit();
}

/* Le popup « Maintenance en cours ». Appelé sur un refus du serveur : l'app sait alors
   au passage que la maintenance a commencé, sans attendre la prochaine lecture. */
export function showMaintenanceNotice() {
  if (phase === "off") phase = "draining";
  notice = true;
  emit();
}

/* Garde des boutons qui lancent une partie : en maintenance, le popup plutôt que la
   requête (le serveur refuserait de toute façon). */
export function maintenanceBlocks(): boolean {
  if (phase === "off") return false;
  showMaintenanceNotice();
  return true;
}

export function isMaintenanceError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503 && e.message === serverText(MAINTENANCE_DETAIL);
}

/* Lecture de /api/status. Sans réponse (redémarrage en cours), l'état connu reste :
   l'écran de maintenance ne disparaît pas pendant le déploiement. */
export async function pollPhase() {
  const before = announced;
  const next = await fetchPhase();
  if (next !== null && announced === before) apply(next);
}

async function fetchPhase(): Promise<Phase | null> {
  try {
    const res = await fetch(`${API_URL}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { maintenance?: unknown };
    return PHASES.includes(body.maintenance as Phase) ? (body.maintenance as Phase) : null;
  } catch {
    return null;
  }
}
