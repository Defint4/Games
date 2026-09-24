"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/Loading";
import SettingsSheet from "@/components/SettingsSheet";
import { GearIcon } from "@/components/TableFrame";
import { useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { applyFelt } from "@/lib/prefs";
import { COMMON } from "@/lib/texts";
import { preloadAssets } from "./assets";
import { loadBotGame, type BotGame } from "./botGame";
import BotTable from "./BotTable";
import { preloadEngine } from "./engine";
import { T } from "./i18n";
import Look from "./Look";
import { GAME } from "./meta";
import Rules from "./Rules";

/* La page de la partie contre l'ordinateur : identité, partie en cours (lue sur
   l'appareil), pièces, sons et moteur prêts avant d'afficher quoi que ce soit. Sans
   partie en cours, retour à l'accueil. */
export default function BotPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [game, setGame] = useState<BotGame | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useT(T).bot;
  const common = useT(COMMON);

  useEffect(() => {
    const current = currentProfile();
    const saved = loadBotGame();
    if (!current || !saved) {
      router.replace(current ? GAME.path : "/");
      return;
    }
    // Lecture localStorage impossible côté serveur : tout arrive après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
    setGame(saved);
  }, [router]);

  useEffect(() => {
    document.documentElement.dataset.felt = "chess";
    let cancelled = false;
    Promise.all([preloadAssets(), preloadEngine()])
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      applyFelt();
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

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-bold">{t.engineFailed}</p>
        <Link href={GAME.path} className="rounded-xl bg-[#81b64c] px-6 py-3 font-extrabold text-white">
          {common.allGames}
        </Link>
      </div>
    );
  }
  // Le moteur d'échecs pèse 1,8 Mo : sur réseau lent, le recharger ne ferait que
  // reprendre son téléchargement à zéro.
  if (!profile || !game || !ready) return <LoadingScreen label={t.waking} patient />;

  return (
    <main className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={common.settings}
        className="absolute right-3 top-3 z-30 rounded-full bg-black/30 p-2.5 text-ivory-dim ring-1 ring-white/15 backdrop-blur-sm active:scale-90"
      >
        <GearIcon />
      </button>
      <div className="min-h-0 flex-1">
        <BotTable initial={game} profile={profile} />
      </div>
      {settingsOpen && (
        <SettingsSheet
          game={GAME}
          code=""
          heading={t.title}
          inLobby={false}
          rules={<Rules />}
          look={<Look />}
          onLeave={() => {}}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}
