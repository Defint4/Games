/* Le panneau d'administration côté client. Chaque appel porte deux verrous : le jeton
   joueur (en-tête, comme partout) et la session admin, un cookie httpOnly que le
   navigateur joint tout seul (`credentials: "include"`) et que ce code ne voit jamais.
   Le panneau n'existe que pour le compte admin : c'est un outil personnel, en français
   seulement. */

import { authed, request } from "@/lib/api";
import type { GameStats } from "@/lib/types";

function admin<T>(token: string, path: string, init?: RequestInit) {
  return request<T>(`/api/admin${path}`, {
    ...init,
    credentials: "include",
    headers: authed(token),
  });
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export type Seat = {
  player_id: string | null;
  pseudo: string;
  avatar: string;
  bot: string | null;
  /* Bot qui joue à la place d'un joueur parti. */
  replaced: boolean;
  connected: boolean;
  rating: number | null;
};

export type Room = {
  code: string;
  game: string;
  status: "lobby" | "playing" | "finished";
  created_at: string;
  last_activity: string;
  turn: number | null;
  turn_seconds: number;
  options: Record<string, string>;
  chat_count: number;
  seats: Seat[];
};

export type RoomDetail = Room & {
  chat: { seat: number; pseudo: string | null; text: string }[];
};

export type Overview = {
  players: {
    total: number;
    new_day: number;
    new_week: number;
    active_week: number;
    default_pin: number;
    locked: number;
    suspended: number;
  };
  games: Record<string, { players: number; played: number }>;
  online: number;
  watchers: number;
  rooms: Room[];
  maintenance: boolean;
  /* « draining » : les parties en cours se finissent ; « locked » : l'app est fermée aux
     joueurs (écran de maintenance), le serveur peut redémarrer. */
  maintenance_phase: "off" | "draining" | "locked";
  server: { version: string | null; uptime_s: number; memory_mb: number | null };
};

export type PlayerRow = {
  id: string;
  pseudo: string;
  avatar: string;
  created_at: string;
  last_seen_at: string | null;
  played: number;
  won: number;
  default_pin: boolean;
  locked: boolean;
  suspended: boolean;
  online: boolean;
};

export type PlayerSort = "recent" | "seen" | "played" | "name";

export type PlayerDetail = {
  id: string;
  pseudo: string;
  avatar: string;
  created_at: string;
  last_seen_at: string | null;
  default_pin: boolean;
  locked_until: string | null;
  pin_failures: number;
  suspended_at: string | null;
  admin: boolean;
  online: boolean;
  tables: { code: string; game: string; status: Room["status"]; connected: boolean }[];
  stats: Record<string, GameStats>;
};

export type AdminEvent = {
  id: number;
  at: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
};

export type Page<T> = { total: number; entries: T[] };

export const PLAYERS_PAGE = 50;
export const EVENTS_PAGE = 50;

/* 204 : session valide (et prolongée de 30 jours) ; 401 : mot de passe à saisir ;
   404 : ce compte n'est pas admin. */
export const checkSession = (token: string) => admin<void>(token, "/session");

export const openSession = (token: string, password: string) =>
  admin<void>(token, "/session", json("POST", { password }));

export const closeSession = (token: string) => admin<void>(token, "/session", { method: "DELETE" });

export const fetchOverview = (token: string) => admin<Overview>(token, "/overview");

export const setMaintenance = (token: string, enabled: boolean) =>
  admin<void>(token, "/maintenance", json("PUT", { enabled }));

export const fetchRoom = (token: string, code: string) =>
  admin<RoomDetail>(token, `/rooms/${code}`);

export const closeRoom = (token: string, code: string) =>
  admin<void>(token, `/rooms/${code}`, { method: "DELETE" });

export function fetchPlayers(token: string, q: string, sort: PlayerSort, offset: number) {
  const params = new URLSearchParams({ sort, offset: String(offset), limit: String(PLAYERS_PAGE) });
  if (q) params.set("q", q);
  return admin<Page<PlayerRow>>(token, `/players?${params}`);
}

export const fetchPlayer = (token: string, id: string) =>
  admin<PlayerDetail>(token, `/players/${id}`);

export type PlayerAction = "reset-pin" | "unlock" | "sign-out";

export const playerAction = (token: string, id: string, action: PlayerAction) =>
  admin<PlayerDetail>(token, `/players/${id}/${action}`, { method: "POST" });

export const suspendPlayer = (token: string, id: string, suspended: boolean) =>
  admin<PlayerDetail>(token, `/players/${id}/suspended`, json("PUT", { suspended }));

export const renamePlayer = (token: string, id: string, pseudo: string) =>
  admin<PlayerDetail>(token, `/players/${id}`, json("PATCH", { pseudo }));

export const deletePlayer = (token: string, id: string, confirm: string) =>
  admin<void>(token, `/players/${id}`, json("DELETE", { confirm }));

export const fetchEvents = (token: string, offset: number) =>
  admin<Page<AdminEvent>>(token, `/events?offset=${offset}&limit=${EVENTS_PAGE}`);
