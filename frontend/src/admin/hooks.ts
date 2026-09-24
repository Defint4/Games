"use client";

import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { ApiError } from "@/lib/api";
import { fetchOverview } from "./api";

export type Tab = "overview" | "tables" | "players" | "maintenance";

export const SESSION_KEY = ["admin", "session"];

/* Ni 401 (mot de passe à saisir), ni 404 (pas admin), ni une requête refusée : seules
   les pannes réseau et serveur méritent un nouvel essai. */
export function retry(count: number, error: Error) {
  return !(error instanceof ApiError && error.status < 500) && count < 2;
}

export const TokenContext = createContext("");

export function useToken() {
  return useContext(TokenContext);
}

/* Une requête du panneau. Un 401 en cours de route (session admin révoquée ailleurs,
   code PIN changé) renvoie à la porte : on revérifie la session, qui répondra 401. */
export function useAdminQuery<T>(options: UseQueryOptions<T, Error>) {
  const queryClient = useQueryClient();
  const query = useQuery({ retry, ...options });
  const denied = query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (denied) void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  }, [denied, queryClient]);
  return query;
}

/* Toute la salle en direct : chiffres, tables, maintenance. Partagée par trois onglets,
   rafraîchie en silence toutes les 4 s tant que le panneau est à l'écran. */
export function useOverview() {
  const token = useToken();
  return useAdminQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchOverview(token),
    refetchInterval: 4000,
  });
}
