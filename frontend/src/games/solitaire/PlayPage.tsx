"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/Loading";
import { CardBackLabel } from "@/components/PlayingCard";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { currentProfile, signOut, type StoredProfile } from "@/lib/identity";
import { applyFelt } from "@/lib/prefs";
import { settle } from "@/lib/settle";
import { currentKey, fetchCurrent, savedMoves } from "./api";
import { preloadAssets } from "./assets";
import Game from "./Game";
import { T } from "./i18n";
import { GAME } from "./meta";

/* La page de jeu : identité, partie ouverte (déjà en cache si l'on vient de l'accueil),
   cartes et sons chargés avant tout affichage. Sans partie ouverte, retour à l'accueil. */
export default function PlayPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const t = useT(T);

  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // Lecture localStorage impossible côté serveur : l'identité arrive après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
  }, [router]);

  useEffect(() => {
    applyFelt();
    let cancelled = false;
    // Une ressource bloquée ne retient pas l'écran plus de 20 s.
    settle(preloadAssets(), 20000).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // L'écran ne doit pas s'éteindre en pleine partie.
    let lock: { release: () => Promise<void> } | null = null;
    async function acquire() {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* non supporté ou refusé : sans gravité */
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const current = useQuery({
    queryKey: currentKey(profile?.pseudo ?? ""),
    queryFn: () => fetchCurrent(profile!.token),
    enabled: profile !== null,
    // Déposée par l'accueil juste avant d'arriver ici : pas de second aller-retour.
    staleTime: Infinity,
  });

  const revoked = current.error instanceof ApiError && current.error.status === 401;
  const gone = current.data === null;
  useEffect(() => {
    if (revoked && profile) {
      signOut();
      router.replace(`/?pin=${encodeURIComponent(profile.pseudo)}`);
    } else if (gone) router.replace(GAME.path);
  }, [revoked, gone, profile, router]);

  if (current.isError && !revoked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-bold">{t.play.failed}</p>
        <button
          type="button"
          onClick={() => current.refetch()}
          className="rounded-2xl bg-gold px-6 py-3 font-extrabold text-ink"
        >
          {t.play.retry}
        </button>
      </div>
    );
  }
  const deal = current.data;
  if (!profile || !deal || !assetsReady) return <LoadingScreen label={t.loading} />;

  return (
    <CardBackLabel.Provider value="✦">
      <Game key={deal.id} deal={deal} initialMoves={savedMoves(deal.id)} profile={profile} />
    </CardBackLabel.Provider>
  );
}
