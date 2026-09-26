"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { currentProfile } from "@/lib/identity";
import { onLoadProgress, preloadAssets, type RaceAssets } from "./assets";
import { exitImmersive, setThemeColor } from "./immersive";
import Loader from "./Loader";
import { PLAY_PATH } from "./meta";

const Race = dynamic(() => import("./Race"), { ssr: false, loading: () => null });

/* La page de course : écran de chargement jusqu'à la première image de la course, écran
   gardé allumé, barre d'état noire. Le plein écran et le paysage sont demandés par le
   bouton « Rouler » (il faut un geste) ; sans eux, la course tourne son rendu. */
export default function PlayPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<RaceAssets | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => onLoadProgress(setProgress), []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!currentProfile()) router.replace("/");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    preloadAssets().then(
      (a) => {
        if (!cancelled) setAssets(a);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    async function acquire() {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* refusé : l'écran pourra s'éteindre */
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    const restoreTheme = setThemeColor("#000000");
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      restoreTheme();
      // Sortie du plein écran seulement si on a vraiment quitté la course (le double
      // montage du mode strict ne doit pas l'annuler).
      setTimeout(() => {
        if (!window.location.pathname.startsWith(PLAY_PATH)) exitImmersive();
      }, 0);
    };
  }, []);

  return (
    <>
      {assets && <Race assets={assets} onReady={onReady} />}
      {!ready && <Loader progress={progress} portrait={portrait} failed={failed} />}
    </>
  );
}
