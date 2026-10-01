/* La vue d'une table de course en direct (backend/app/games/rt1/spec.py). */

import type { BasePlayerView, BaseRoomView } from "@/lib/types";
import type { Gain } from "../api";

export type PilotView = BasePlayerView & {
  ready: boolean;
  vehicle: string;
  color: string;
  time_ms: number | null;
  splits: number[];
  dnf: boolean;
  /* après la course : ce que le serveur a payé */
  gains: Gain[] | null;
  record: boolean;
  level_before: number | null;
  level: number | null;
};

export type RaceRoomView = Omit<BaseRoomView, "players"> & {
  circuit: string;
  /* top départ, heure du serveur (s) ; null en lobby */
  start_at: number | null;
  server_time: number;
  /* premier arrivé : secondes laissées aux autres */
  finish_deadline: number | null;
  /* sièges dans l'ordre d'arrivée (les arrivés d'abord) */
  places: number[];
  players: PilotView[];
};
