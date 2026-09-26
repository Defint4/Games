"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/Loading";
import { useT } from "@/lib/i18n";
import { currentProfile } from "@/lib/identity";
import { preloadAssets, type RaceAssets } from "./assets";
import { T } from "./i18n";

const Race = dynamic(() => import("./Race"), { ssr: false, loading: () => null });

/* La page de course : attend que tout soit chargé, garde l'écran allumé, bascule en
   paysage là où le navigateur le permet (Android ; iOS demande de tourner le téléphone). */
export default function PlayPage() {
  const router = useRouter();
  const t = useT(T);
  const [assets, setAssets] = useState<RaceAssets | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (failed) return <LoadingScreen label={t.loading} />;
  if (!assets) return <LoadingScreen label={t.loading} patient />;
  return <Race assets={assets} />;
}
