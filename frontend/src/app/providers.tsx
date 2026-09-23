"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { refreshSession } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import { currentProfile, saveProfile } from "@/lib/identity";

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

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    // Le HTML part en français (rendu serveur) : on aligne sur la langue choisie.
    document.documentElement.lang = getLang();
    renewSession();
    const onVisible = () => {
      if (document.visibilityState === "visible") renewSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
