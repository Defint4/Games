"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { currentProfile } from "@/lib/identity";
import { onLoadProgress, preloadAssets, type RaceAssets } from "./assets";
import Loader from "./Loader";

const Race = dynamic(() => import("./Race"), { ssr: false, loading: () => null });

/* La page de course : écran de chargement jusqu'à la première image de la course, écran
   gardé allumé, paysage demandé au navigateur (Android) ; sinon la course tourne son
   rendu elle-même. */
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
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.("landscape").catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* rien à rendre */
      }
    };
  }, []);

  return (
    <>
      {assets && <Race assets={assets} onReady={onReady} />}
      {!ready && <Loader progress={progress} portrait={portrait} failed={failed} />}
    </>
  );
}
