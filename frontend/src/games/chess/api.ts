import { authed, request } from "@/lib/api";
import type { GameReview } from "./analysis";
import type { BotGame } from "./botGame";
import type { GameSummary, SavedGame } from "./types";

/* Les parties terminées : les 10 dernières du joueur, et une partie à relire. */

export function fetchRecentGames(token: string) {
  return request<GameSummary[]>("/api/chess/games", { headers: authed(token) });
}

export function fetchGame(token: string, id: string) {
  return request<SavedGame>(`/api/chess/games/${id}`, { headers: authed(token) });
}

/* Une partie contre l'ordinateur terminée : le serveur la rejoue puis la garde. */
export function saveBotGame(token: string, game: BotGame) {
  return request<GameSummary>("/api/chess/bot-games", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({
      bot_elo: game.elo,
      color: game.color,
      time_control: game.timeControl,
      moves: game.moves,
      clocks: game.clocks ? game.moveClocks : null,
      result: game.over?.result,
      termination: game.over?.termination,
    }),
  });
}

/* Le bilan calculé ici, gardé par le serveur pour les prochains qui l'ouvriront. */
export function saveAnalysis(token: string, id: string, review: GameReview) {
  return request<SavedGame>(`/api/chess/games/${id}/analysis`, {
    method: "PUT",
    headers: authed(token),
    body: JSON.stringify(review),
  });
}
