"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, refreshSession } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import { currentProfile, saveProfile } from "@/lib/identity";
import { installClickSound } from "@/lib/sound";

/* La session vit 30 jours sans venir : chaque ouverture (ou retour dans l'app restée en
   mémoire, au plus une fois par heure) la renouvelle. Un jeton expiré ou révoqué est
   traité par les pages (401 → code PIN redemandé). */
const REFRESH_EVERY_MS = 60 * 60 * 1000;
let lastRefresh = 0;

function renewSession() {
  const session = currentProfile();
  if (!session || Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  lastRefresh = Date.now();
  refreshSession(session.token)
    .then(({ player, token }) => {
      // Déconnecté ou changé de compte entre-temps : ce jeton ne sert plus.
      if (currentProfile()?.token !== session.token) return;
      saveProfile({ pseudo: player.pseudo, avatar: player.avatar, token });
    })
    .catch(() => {
      /* hors ligne ou jeton refusé : la page affichera ce qu'il faut */
    });
}

/* Réglages de react-query pour tout le site :
   - networkMode "always" : par défaut, un téléphone qui se croit hors ligne met requêtes
     et mutations en pause, sans erreur, et l'écran attend sans fin. On tente quand même,
     le délai de `request` tranche.
   - Pas de nouvel essai sur un refus du serveur (401, 404…) : la session expirée renvoie
     tout de suite au code PIN au lieu de patienter trois essais. */
function retry(count: number, error: Error) {
  return !(error instanceof ApiError && error.status < 500) && count < 2;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry },
      mutations: { networkMode: "always" },
    },
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  useEffect(() => {
    // Le HTML part en français (rendu serveur) : on aligne sur la langue choisie.
    document.documentElement.lang = getLang();
    renewSession();
    const onVisible = () => {
      if (document.visibilityState === "visible") renewSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    const uninstallClick = installClickSound();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      uninstallClick();
    };
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
