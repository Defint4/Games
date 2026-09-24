/* Types communs à la plateforme : identité, tables, messages WebSocket.
   Chaque jeu étend BaseRoomView / BasePlayerView dans src/games/<slug>/types.ts. */

import { dict } from "./i18n";

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

/* `ghost` : carte « hors jeu » du Goulag, créée quand le paquet ne permet pas de
   recomposer des vies exactes (elle disparaît quand elle est cassée). */
export type CardT = { value: number; suit: Suit; ghost?: boolean };

export type BotDifficulty = "easy" | "normal" | "hard";

export const BOT_LABELS = dict<Record<BotDifficulty, string>>({
  fr: { easy: "Facile", normal: "Normal", hard: "Difficile" },
  en: { easy: "Easy", normal: "Normal", hard: "Hard" },
});

/* Fiche d'un siège, telle que la plateforme la décrit (le jeu y ajoute ses champs). */
export type BasePlayerView = {
  seat: number;
  pseudo: string;
  avatar: string;
  connected: boolean;
  bot: BotDifficulty | null;
  /* Cote Elo (jeux classés seulement). */
  rating: number | null;
};

export type BaseRoomView = {
  code: string;
  game: string;
  status: "lobby" | "playing" | "finished";
  your_seat: number;
  turn: number | null;
  players: BasePlayerView[];
  turn_seconds: number;
  turn_remaining: number | null;
  /* Sièges qui ont demandé la revanche (jeux où elle se fait d'un commun accord). */
  rematch_votes: number[];
};

export type GameEvent = { type: string; [key: string]: unknown };

export type ChatEntry = { type: "chat"; seat: number; text: string };

export type ServerMessage<V extends BaseRoomView = BaseRoomView> =
  | { type: "state"; events: GameEvent[]; view: V; chat?: ChatEntry[] }
  | ChatEntry
  | { type: "emote"; seat: number; emote: string; target: number | null }
  | { type: "rematch"; code: string }
  | { type: "error"; detail: string };

/* `best_ms` : jeux chronométrés (Solitaire), victoire la plus rapide ; affiché, hors
   classement. */
/* `rating` : cote Elo des jeux classés (échecs). */
export type GameStats = {
  played: number;
  won: number;
  lost: number;
  best_ms?: number | null;
  rating?: number | null;
};

export type PlayerProfile = {
  id: string;
  pseudo: string;
  avatar: string;
  /* Par jeu (clé = slug) ; absent si jamais joué. */
  stats: Record<string, GameStats>;
};

/* Son propre profil : `default_pin` si le compte s'ouvre encore avec 0000 ; `admin`
   affiche l'entrée du panneau d'administration (le serveur vérifie chaque appel). */
export type MyProfile = PlayerProfile & { default_pin: boolean; admin: boolean };

export const NO_STATS: GameStats = { played: 0, won: 0, lost: 0 };

export type LeaderboardEntry = GameStats & {
  rank: number;
  id: string;
  pseudo: string;
  avatar: string;
};

export type LeaderboardPage = {
  total: number;
  entries: LeaderboardEntry[];
  /* La place du joueur demandé, null s'il n'a jamais joué. */
  me: LeaderboardEntry | null;
};

export type OpenRoom = {
  code: string;
  game: string;
  players: { pseudo: string; avatar: string; rating: number | null }[];
  seats_taken: number;
  seats_max: number;
  /* Échecs : la cadence choisie par le créateur. */
  time_control?: string;
};
