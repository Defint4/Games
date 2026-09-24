"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { leaderboardPath } from "@/components/Leaderboard";
import { TransitionOverlay } from "@/components/Loading";
import { Sheet } from "@/components/Sheet";
import { ApiError, fetchMe } from "@/lib/api";
import { formatDuration } from "@/lib/duration";
import { HUB_PATH } from "@/lib/games";
import { tr, useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { isMaintenanceError, maintenanceBlocks, showMaintenanceNotice } from "@/lib/maintenance";
import { COMMON } from "@/lib/texts";
import { NO_STATS } from "@/lib/types";
import { currentKey, fetchCurrent, forgetMoves, newDeal, type Deal } from "./api";
import { preloadAssets } from "./assets";
import { T } from "./i18n";
import { GAME, PLAY_PATH } from "./meta";
import Rules from "./Rules";
import Wordmark from "./Wordmark";

/* L'accueil du Solitaire : pas de tables ici, une partie à soi. Reprendre celle qui
   est ouverte, ou une nouvelle donne (l'ouverte comptant alors perdue). */
export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const common = useT(COMMON);

  useEffect(() => {
    // Les cartes et les sons se chargent dès l'accueil : la table s'ouvre sans attente.
    void preloadAssets();
  }, []);

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

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md grow flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={HUB_PATH}
          className="rounded-xl py-2 pr-3 text-sm font-semibold text-ivory-dim/75 hover:text-ivory"
        >
          ‹ {common.allGames}
        </Link>
        <Link
          href={leaderboardPath(GAME.slug)}
          className="rounded-xl py-2 pl-3 text-sm font-semibold text-gold/90 hover:text-gold"
        >
          {common.leaderboard} ›
        </Link>
      </div>
      <Wordmark />
      {profile && <Desk profile={profile} />}
    </main>
  );
}

function Desk({ profile }: { profile: StoredProfile }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useT(T).home;
  const confirm = useT(T).confirm;
  const [leaving, setLeaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "confirm" | "rules">(null);

  const me = useQuery({ queryKey: ["me", profile.pseudo], queryFn: () => fetchMe(profile.token) });
  const stats = me.data?.stats[GAME.slug] ?? NO_STATS;
  // Toujours relue au serveur en arrivant : une partie gagnée ou abandonnée ailleurs ne
  // doit pas rester proposée.
  const current = useQuery({
    queryKey: currentKey(profile.pseudo),
    queryFn: () => fetchCurrent(profile.token),
    refetchOnMount: "always",
  });
  const open = current.isFetchedAfterMount ? current.data : undefined;

  const deal = useMutation({
    mutationFn: () => newDeal(profile.token),
    onMutate: () => {
      setSheet(null);
      setError(null);
      setLeaving(tr(T).home.dealing);
    },
    onSuccess: (next: Deal) => {
      forgetMoves();
      queryClient.setQueryData(currentKey(profile.pseudo), next);
      void queryClient.invalidateQueries({ queryKey: ["me", profile.pseudo] });
      router.push(PLAY_PATH);
    },
    onError: (e) => {
      setLeaving(null);
      if (isMaintenanceError(e)) showMaintenanceNotice();
      else setError(e instanceof ApiError ? e.message : tr(T).home.unreachable);
    },
  });
  const busy = leaving !== null;

  return (
    <section className="flex grow flex-col gap-5">
      <TransitionOverlay label={leaving} />
      <div className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
        <Avatar id={profile.avatar} size="lg" />
        <div className="grow">
          <p className="text-lg font-bold">{profile.pseudo}</p>
          {me.data && (
            <>
              <p className="text-sm text-ivory-dim/80">
                {t.record(stats.played, stats.won, stats.lost)}
              </p>
              <p className="text-sm font-semibold text-gold/90">
                {stats.best_ms ? t.best(formatDuration(stats.best_ms, true)) : t.noBest}
              </p>
            </>
          )}
        </div>
      </div>

      {open && (
        <button
          type="button"
          onClick={() => {
            setLeaving(tr(T).home.resuming);
            router.push(PLAY_PATH);
          }}
          disabled={busy}
          className="flex items-center justify-between rounded-2xl bg-felt-600 px-5 py-4 text-left ring-1 ring-gold/50 enabled:active:translate-y-0.5"
        >
          <span>
            <span className="block font-extrabold">{t.resume}</span>
            <RunningClock deal={open} label={t.running} />
          </span>
          <span className="text-gold">→</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (maintenanceBlocks()) return;
          if (open) setSheet("confirm");
          else deal.mutate();
        }}
        disabled={busy || !current.isFetchedAfterMount}
        className="rounded-2xl bg-gold py-5 text-xl font-extrabold text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40"
      >
        {t.newDeal}
      </button>

      <button
        type="button"
        onClick={() => setSheet("rules")}
        className="rounded-2xl bg-black/25 p-4 font-bold ring-1 ring-white/10 active:translate-y-0.5"
      >
        {t.rules}
      </button>

      {error && <p className="text-sm text-card-red">{error}</p>}

      <p className="text-center text-sm leading-relaxed text-ivory-dim/65">{t.ranking}</p>

      {sheet === "rules" && (
        <Sheet onClose={() => setSheet(null)}>
          <Rules />
        </Sheet>
      )}
      {sheet === "confirm" && (
        <Sheet onClose={() => setSheet(null)}>
          <h2 className="text-center text-lg font-extrabold">{confirm.dealTitle}</h2>
          <p className="mt-2 text-center text-sm text-ivory-dim/80">{confirm.dealBody}</p>
          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                if (maintenanceBlocks()) setSheet(null);
                else deal.mutate();
              }}
              className="rounded-2xl bg-gold p-4 font-extrabold text-ink active:translate-y-0.5"
            >
              {confirm.deal}
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                setLeaving(tr(T).home.resuming);
                router.push(PLAY_PATH);
              }}
              className="rounded-2xl bg-black/25 p-4 font-bold ring-1 ring-white/10 active:translate-y-0.5"
            >
              {confirm.keep}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/* Le chrono de la partie ouverte, qui tourne sous le bouton « Reprendre ». */
function RunningClock({ deal, label }: { deal: Deal; label: (time: string) => string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="block text-sm tabular-nums text-ivory-dim/75">
      {label(formatDuration(now - deal.receivedAt + deal.elapsed_ms))}
    </span>
  );
}
