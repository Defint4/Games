"use client";

/* La progression de RT1 est sur le serveur (backend/app/games/rt1) : argent, niveau,
   missions, meilleur temps et fantôme par circuit. La course, elle, se joue sur
   l'appareil ; son arrivée est envoyée à la fin, et gardée pour plus tard si le réseau
   manque. */

import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, authed, request } from "@/lib/api";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { CIRCUITS } from "./circuits";
import type { BotLevel } from "./sim/bots";
import type { RaceSetup } from "./sim/game";
import type { Livery } from "./livery";
import type { Part, Tune, Workshop } from "./sim/tuning";
import { DEFAULT_VEHICLE } from "./sim/vehicles";
import { decodeGhost } from "./sim/ghost";
import type { Best } from "./sim/race";

export type Standing = { time_ms: number; splits: number[]; rank: number; vehicle: string };

export type Mission = { id: string; reward: number; progress: number; target: number; done: boolean };

export type Rt1State = {
  money: number;
  xp: number;
  level: number;
  level_xp: number;
  next_level_xp: number;
  finishes: number;
  records: Record<string, Standing>;
  missions: Mission[];
  /* véhicules achetés, et celui qui roule */
  vehicles: string[];
  vehicle: string;
  /* atelier par véhicule */
  workshop: Record<string, Workshop>;
};

export type Gain = { kind: "finish" | "medal" | "mission" | "bots" | "online"; money: number; id: string | null };

export type Arrival = { record: boolean; best_ms: number; gains: Gain[]; level_before: number; state: Rt1State };

export type BoardEntry = { rank: number; pseudo: string; avatar: string; time_ms: number; has_ghost: boolean; vehicle: string };

export type Board = { total: number; entries: BoardEntry[]; me: BoardEntry | null };

/* Un ticket de départ, demandé au lancement de la course : le serveur date la course et
   n'en compte l'arrivée qu'une fois. Sans ticket (hors ligne au départ), la course ne
   compte pas. */
export type StartBody = { circuit: string; vehicle: string; bots?: { level: BotLevel; count: number } };

export type FinishBody = {
  race_id: string;
  time_ms: number;
  splits: number[];
  ghost?: string;
  /* contre les bots : la place obtenue */
  place?: number;
  /* indice de performance, atelier compris (missions plafonnées) */
  pi: number;
};

/* Un fantôme à suivre : le sien ou celui d'un autre pilote, avec son véhicule. */
export type Rival = { pseudo: string; best: Best; ghost: Float32Array; vehicle: string };

/* « 12 500 F » : le franc Pacifique, sans décimales. */
export function formatMoney(n: number, lang: string): string {
  return `${n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} F`;
}

export const stateKey = (pseudo: string) => ["rt1", "me", pseudo] as const;
export const boardKey = (circuit: string) => ["rt1", "board", circuit] as const;
const ghostKey = (circuit: string, pseudo: string, timeMs: number) =>
  ["rt1", "ghost", circuit, pseudo.toLowerCase(), timeMs] as const;

/* Le pilote connecté, lu après montage (localStorage). */
export function useProfile(): StoredProfile | null {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(currentProfile());
  }, []);
  return profile;
}

export async function startRace(token: string, body: StartBody): Promise<string> {
  const out = await request<{ race_id: string }>("/api/rt1/start", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(body),
  });
  return out.race_id;
}

export async function fetchState(token: string): Promise<Rt1State> {
  await flushPending(token);
  const state = await request<Rt1State>("/api/rt1/me", { headers: authed(token) });
  rememberVehicle(state.vehicle);
  return state;
}

/* Le véhicule qui roule, gardé aussi dans le téléphone : les menus préchargent le bon
   modèle sans attendre le serveur. */
const VEHICLE_KEY = "games:rt1:vehicle";

export function readVehicle(): string {
  try {
    return localStorage.getItem(VEHICLE_KEY) ?? DEFAULT_VEHICLE;
  } catch {
    return DEFAULT_VEHICLE;
  }
}

function rememberVehicle(id: string) {
  try {
    localStorage.setItem(VEHICLE_KEY, id);
  } catch {
    /* stockage indisponible */
  }
}

export async function buyVehicle(token: string, vehicle: string): Promise<Rt1State> {
  const state = await request<Rt1State>("/api/rt1/garage/buy", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ vehicle }),
  });
  rememberVehicle(state.vehicle);
  return state;
}

export async function upgradePart(token: string, vehicle: string, part: Part): Promise<Rt1State> {
  return request<Rt1State>("/api/rt1/workshop/upgrade", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ vehicle, part }),
  });
}

export async function tunePart(token: string, vehicle: string, key: Tune, value: number): Promise<Rt1State> {
  return request<Rt1State>("/api/rt1/workshop/tune", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ vehicle, key, value }),
  });
}

export async function saveLivery(token: string, vehicle: string, livery: Livery): Promise<Rt1State> {
  return request<Rt1State>("/api/rt1/workshop/livery", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ vehicle, livery }),
  });
}

export async function selectVehicle(token: string, vehicle: string): Promise<Rt1State> {
  const state = await request<Rt1State>("/api/rt1/garage/select", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ vehicle }),
  });
  rememberVehicle(state.vehicle);
  return state;
}

export function useRt1State(profile: StoredProfile | null) {
  return useQuery({
    queryKey: stateKey(profile?.pseudo ?? ""),
    queryFn: () => fetchState(profile!.token),
    enabled: profile !== null,
    staleTime: 30_000,
  });
}

export function fetchBoard(circuit: string, me: string | null) {
  const q = me ? `?me=${encodeURIComponent(me)}` : "";
  return request<Board>(`/api/rt1/leaderboard/${circuit}${q}`);
}

type GhostOut = { pseudo: string; time_ms: number; splits: number[]; ghost: string; vehicle: string };

/* Le fantôme d'un pilote : gardé en cache tant que son temps ne change pas. */
export function fetchRival(qc: QueryClient, circuit: string, pseudo: string, timeMs: number): Promise<Rival | null> {
  return qc.fetchQuery({
    queryKey: ghostKey(circuit, pseudo, timeMs),
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const g = await request<GhostOut>(`/api/rt1/ghost/${circuit}/${encodeURIComponent(pseudo)}`);
        return {
          pseudo: g.pseudo,
          best: { time: g.time_ms / 1000, splits: g.splits.map((s) => s / 1000) },
          ghost: decodeGhost(g.ghost),
          vehicle: g.vehicle,
        };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

/* Ce qu'il faut pour lancer une course : son véhicule, son record et le fantôme à suivre
   (le sien, ou celui de `rival` pris au classement). Sans réseau, la course part quand
   même, à vide, avec le dernier véhicule connu. */
export type Setup = Omit<RaceSetup, "vehicle"> & {
  vehicle: string;
  /* atelier du véhicule qui roule */
  workshop: Workshop | undefined;
  ghostVehicle: string | null;
};

export async function loadRaceSetup(
  qc: QueryClient,
  profile: StoredProfile,
  circuit: string,
  rival: string | null,
): Promise<Setup> {
  try {
    const state = await qc.fetchQuery({
      queryKey: stateKey(profile.pseudo),
      queryFn: () => fetchState(profile.token),
      staleTime: 30_000,
    });
    const mine = state.records[circuit];
    const best = mine ? { time: mine.time_ms / 1000, splits: mine.splits.map((s) => s / 1000) } : null;
    if (rival && rival.toLowerCase() !== profile.pseudo.toLowerCase()) {
      const board = await fetchBoard(circuit, rival);
      const them = board.me;
      const r = them ? await fetchRival(qc, circuit, them.pseudo, them.time_ms) : null;
      return { best, ghost: null, rival: r, bots: [], vehicle: state.vehicle, workshop: state.workshop[state.vehicle], ghostVehicle: r?.vehicle ?? null };
    }
    const own = mine ? await fetchRival(qc, circuit, profile.pseudo, mine.time_ms) : null;
    return { best, ghost: own?.ghost ?? null, rival: null, bots: [], vehicle: state.vehicle, workshop: state.workshop[state.vehicle], ghostVehicle: own?.vehicle ?? null };
  } catch {
    return { best: null, ghost: null, rival: null, bots: [], vehicle: readVehicle(), workshop: undefined, ghostVehicle: null };
  }
}

/* Arrivées pas encore reçues par le serveur (réseau coupé, serveur en redéploiement,
   session à renouveler) : renvoyées au prochain chargement de la progression. Le ticket
   de départ rend l'envoi rejouable sans double paiement. */
const PENDING_KEY = "games:rt1:pending";

/* Une erreur qui vaut la peine de réessayer plus tard : réseau, serveur indisponible,
   trop de requêtes, session à renouveler. Un refus franc (422…) n'est pas gardé. */
function retryLater(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  return e.status === 401 || e.status === 429 || e.status >= 500;
}

function readPending(): { pseudo: string; body: FinishBody }[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writePending(list: { pseudo: string; body: FinishBody }[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* stockage plein ou indisponible : l'arrivée est perdue */
  }
}

function postFinish(token: string, body: FinishBody) {
  return request<Arrival>("/api/rt1/finish", { method: "POST", headers: authed(token), body: JSON.stringify(body) });
}

/* Envoie une arrivée. Serveur injoignable : elle est gardée pour plus tard (null). */
export async function sendFinish(profile: StoredProfile, body: FinishBody): Promise<Arrival | null> {
  try {
    return await postFinish(profile.token, body);
  } catch (e) {
    if (!retryLater(e)) throw e;
    writePending([...readPending().filter((p) => p.body.race_id !== body.race_id), { pseudo: profile.pseudo, body }]);
    return null;
  }
}

/* Vide la file, une arrivée après l'autre ; celles qui échouent encore restent. La file
   est relue avant d'écrire : une arrivée ajoutée pendant l'envoi n'est pas perdue. */
async function flushPending(token: string) {
  const profile = currentProfile();
  if (!profile || profile.token !== token) return;
  const sent = new Set<string>();
  for (const p of readPending()) {
    if (p.pseudo !== profile.pseudo) continue;
    try {
      await postFinish(token, p.body);
      sent.add(p.body.race_id);
    } catch (e) {
      // Refusée par le serveur : inutile d'insister. Sinon on réessaiera.
      if (!retryLater(e)) sent.add(p.body.race_id);
    }
  }
  if (sent.size) writePending(readPending().filter((p) => !sent.has(p.body.race_id)));
  forgetLocalRecords();
}

/* Les records d'avant la progression en ligne, gardés dans le téléphone : sans ticket de
   départ, le serveur ne peut plus les prendre ; on les efface une fois. */
function forgetLocalRecords() {
  try {
    for (const c of CIRCUITS) {
      localStorage.removeItem(`games:rt1:best:${c.slug}`);
      localStorage.removeItem(`games:rt1:ghost:${c.slug}`);
    }
  } catch {
    /* stockage indisponible */
  }
}
