"use client";

import { useCallback } from "react";
import { useRoomSocket, type RoomSocket } from "@/lib/useRoomSocket";
import type { RoomView } from "./types";

/* Le socket de table, enrichi des actions du Perudo. */

export type PerudoSocket = RoomSocket<RoomView> & {
  setReady: (ready: boolean) => void;
  bid: (quantity: number, face: number) => void;
  dudo: () => void;
  calza: () => void;
};

export function usePerudoSocket(code: string, token: string | null): PerudoSocket {
  const socket = useRoomSocket<RoomView>(code, token);
  const { send } = socket;
  return {
    ...socket,
    setReady: useCallback((ready) => send({ action: "ready", ready }), [send]),
    bid: useCallback((quantity, face) => send({ action: "bid", quantity, face }), [send]),
    dudo: useCallback(() => send({ action: "dudo" }), [send]),
    calza: useCallback(() => send({ action: "calza" }), [send]),
  };
}
