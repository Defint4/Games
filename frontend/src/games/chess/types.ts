import type { BasePlayerView, BaseRoomView } from "@/lib/types";
import type { GameReview } from "./analysis";

/* Vue d'une table d'échecs (backend/app/games/chess/views.py). */

export type PlayerView = BasePlayerView & {
  /* Variation d'Elo une fois la partie enregistrée. */
  rating_delta: number | null;
};

export type Termination =
  | "checkmate"
  | "resign"
  | "timeout"
  | "timeout_insufficient"
  | "stalemate"
  | "insufficient"
  | "fifty"
  | "repetition"
  | "agreement"
  | "abandon"
  | "aborted";

export type RoomView = Omit<BaseRoomView, "players"> & {
  players: PlayerView[];
  time_control: string;
  /* Siège des blancs (null en attente d'adversaire). */
  white: number | null;
  moves: string[];
  /* Temps restant de chaque siège à l'envoi (s) ; null sans pendule. */
  clocks: (number | null)[];
  clock_running: boolean;
  /* Temps laissé au camp au trait pour jouer son premier coup. */
  first_move_remaining: number | null;
  winner: number | null;
  result: string | null;
  termination: Termination | null;
  draw_offer: number | null;
  can_abort: boolean;
  game_id: string | null;
};

/* Une partie terminée (backend/app/games/chess/router.py). */
export type Side = {
  id: string | null;
  pseudo: string;
  avatar: string;
  rating: number | null;
  delta: number | null;
};

export type GameSummary = {
  id: string;
  white: Side;
  black: Side;
  bot_elo: number | null;
  time_control: string;
  result: string;
  termination: Termination;
  plies: number;
  ended_at: string;
  /* Précision de chaque camp, une fois le bilan calculé. */
  accuracy: { w: number; b: number } | null;
};

export type SavedGame = GameSummary & {
  moves: string[];
  clocks: number[] | null;
  /* Le bilan, s'il a déjà été calculé (par n'importe quel appareil). */
  analysis: GameReview | null;
};
