"use client";

import { useCallback } from "react";
import { useRoomSocket, type RoomSocket } from "@/lib/useRoomSocket";
import type { RoomView } from "./types";

/* Le socket de table, enrichi des actions des échecs. `thinkMs` : le temps de réflexion
   mesuré ici, que le serveur décompte plutôt que le trajet réseau. */

export type ChessSocket = RoomSocket<RoomView> & {
  move: (uci: string, thinkMs: number) => void;
  resign: () => void;
  abort: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
};

export function useChessSocket(code: string, token: string | null): ChessSocket {
  const socket = useRoomSocket<RoomView>(code, token);
  const { send } = socket;
  return {
    ...socket,
    move: useCallback(
      (uci, thinkMs) => send({ action: "move", uci, think_ms: Math.round(thinkMs) }),
      [send],
    ),
    resign: useCallback(() => send({ action: "resign" }), [send]),
    abort: useCallback(() => send({ action: "abort" }), [send]),
    offerDraw: useCallback(() => send({ action: "offer_draw" }), [send]),
    acceptDraw: useCallback(() => send({ action: "accept_draw" }), [send]),
    declineDraw: useCallback(() => send({ action: "decline_draw" }), [send]),
  };
}
