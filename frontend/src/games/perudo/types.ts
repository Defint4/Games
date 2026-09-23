import type { BasePlayerView, BaseRoomView } from "@/lib/types";

/* Vue d'une table de Perudo (backend/app/games/perudo/views.py). */

export type Phase = "bidding" | "reveal";

export type Bid = { quantity: number; face: number; player: number };

export type Reveal = {
  kind: "dudo" | "calza";
  caller: number;
  bid: Bid;
  /* Dés de chaque siège au moment de la révélation. */
  dice: number[][];
  count: number;
  /* Siège qui perd (delta −1) ou regagne (delta +1) un dé. */
  target: number;
  delta: number;
};

export type PlayerView = BasePlayerView & {
  ready: boolean;
  finish_rank: number | null;
  alive: boolean;
  dice_count: number;
  palifico_used: boolean;
};

export type RoomView = Omit<BaseRoomView, "players"> & {
  players: PlayerView[];
  phase: Phase | null;
  round: number;
  palifico: boolean;
  bid: Bid | null;
  history: Bid[];
  total_dice: number;
  your_dice: number[];
  reveal: Reveal | null;
  can_calza: boolean;
  can_dudo: boolean;
  you_alive: boolean;
};
