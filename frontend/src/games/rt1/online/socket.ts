"use client";

import { useCallback } from "react";
import { type RoomSocket, useRoomSocket } from "@/lib/useRoomSocket";
import type { RaceRoomView } from "./types";

/* Le socket de table, enrichi des actions d'une course en direct. La pose part par
   `pose` (relais serveur, hors état) dix fois par seconde. */

export type RaceSocket = RoomSocket<RaceRoomView> & {
  setReady: (ready: boolean) => void;
  setup: (vehicle: string, color: string, pi: number) => void;
  setCircuit: (circuit: string) => void;
  finish: (timeMs: number, splits: number[], ghost?: string) => void;
  giveUp: () => void;
  pose: (d: number[]) => void;
  ping: () => void;
};

export function useRaceSocket(code: string, token: string | null): RaceSocket {
  const socket = useRoomSocket<RaceRoomView>(code, token);
  const { send } = socket;
  return {
    ...socket,
    setReady: useCallback((ready) => send({ action: "ready", ready }), [send]),
    setup: useCallback((vehicle, color, pi) => send({ action: "setup", vehicle, color, pi }), [send]),
    setCircuit: useCallback((circuit) => send({ action: "circuit", circuit }), [send]),
    finish: useCallback((time_ms, splits, ghost) => send({ action: "finish", time_ms, splits, ghost }), [send]),
    giveUp: useCallback(() => send({ action: "dnf" }), [send]),
    pose: useCallback((d) => send({ action: "pose", d }), [send]),
    ping: useCallback(() => send({ action: "ping", t: Date.now() }), [send]),
  };
}
