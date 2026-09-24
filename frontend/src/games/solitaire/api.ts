import { authed, request } from "@/lib/api";

/* Le Solitaire se joue en local : le serveur tire la donne, tient le chrono et rejoue
   les coups à la fin pour valider la victoire (backend/app/games/solitaire). */

export type Deal = {
  id: string;
  /* 52 cartes de deux caractères (rang + couleur), dans l'ordre de distribution. */
  deck: string;
  /* Temps déjà écoulé côté serveur au moment de la réponse. */
  elapsed_ms: number;
  /* Heure locale de la réponse : le chrono part de receivedAt - elapsed_ms, quelle que
     soit l'heure de l'appareil. Ajouté ici, pas envoyé par le serveur. */
  receivedAt: number;
};

export type Victory = { duration_ms: number; best_ms: number; record: boolean };

const stamp = (deal: Omit<Deal, "receivedAt">): Deal => ({ ...deal, receivedAt: Date.now() });

export function currentKey(pseudo: string) {
  return ["solitaire", "current", pseudo] as const;
}

export async function fetchCurrent(token: string): Promise<Deal | null> {
  const deal = await request<Omit<Deal, "receivedAt"> | null>("/api/solitaire/current", {
    headers: authed(token),
  });
  return deal && stamp(deal);
}

/* Donne neuve ; la partie ouverte, s'il y en a une, est comptée perdue. */
export async function newDeal(token: string): Promise<Deal> {
  return stamp(
    await request<Omit<Deal, "receivedAt">>("/api/solitaire/deal", {
      method: "POST",
      headers: authed(token),
    }),
  );
}

export function abandonGame(token: string, id: string) {
  return request<void>(`/api/solitaire/${id}/abandon`, { method: "POST", headers: authed(token) });
}

export function finishGame(token: string, id: string, moves: string[]) {
  return request<Victory>(`/api/solitaire/${id}/finish`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ moves }),
  });
}

/* Les coups de la partie en cours, gardés sur l'appareil : fermer l'app ou recharger
   la page ne fait rien perdre (le chrono, lui, continue côté serveur). */
const MOVES_KEY = "games:solitaire:moves";

export function savedMoves(id: string): string[] {
  try {
    const raw = localStorage.getItem(MOVES_KEY);
    const saved = raw ? (JSON.parse(raw) as { id: string; moves: string[] }) : null;
    return saved?.id === id ? saved.moves : [];
  } catch {
    return [];
  }
}

export function saveMoves(id: string, moves: string[]) {
  try {
    localStorage.setItem(MOVES_KEY, JSON.stringify({ id, moves }));
  } catch {
    /* stockage indisponible : la partie ne se reprendra qu'au début */
  }
}

export function forgetMoves() {
  try {
    localStorage.removeItem(MOVES_KEY);
  } catch {
    /* idem */
  }
}
