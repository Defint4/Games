"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { LoadingScreen, ShufflingCards } from "@/components/Loading";
import { fetchLeaderboard } from "@/lib/api";
import { formatDuration } from "@/lib/duration";
import { GAMES, HUB_PATH, type GameMeta } from "@/lib/games";
import { dict, useLang, useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { COMMON } from "@/lib/texts";
import type { LeaderboardEntry } from "@/lib/types";

const T = dict({
  fr: {
    byGame: "Classement par jeu",
    all: "Tous",
    counting: "On compte les points…",
    failed: "Le classement n’est pas arrivé.",
    retry: "Réessayer",
    nobody: (game: string | null) => `Personne n’est encore classé${game ? ` au ${game}` : ""}.`,
    firstGame: "La première partie ouvre le bal.",
    ranked: (n: number) => `${n} ${n > 1 ? "joueurs classés" : "joueur classé"}`,
    topThree: "Les trois premiers",
    wins: (n: number): string => (n > 1 ? "victoires" : "victoire"),
    games: (n: number) => `${n} ${n > 1 ? "parties" : "partie"}`,
    free: "Libre",
    upForGrabs: "à prendre",
    notYou: (game: string | null) =>
      `Tu n’es pas encore classé${game ? ` au ${game}` : ""}. Une partie suffit.`,
    yourPlace: "Ta place",
    lastPlace: "Le nullos",
    winRate: (pct: number) => `${pct} % de victoires`,
    played: (n: number) => `${n} ${n > 1 ? "parties jouées" : "partie jouée"}`,
    best: (time: string) => `record ${time}`,
    elo: "Elo",
  },
  en: {
    byGame: "Leaderboard by game",
    all: "All",
    counting: "Counting the points…",
    failed: "The leaderboard didn't load.",
    retry: "Try again",
    nobody: (game: string | null) => `Nobody's ranked${game ? ` at ${game}` : ""} yet.`,
    firstGame: "The first game gets things going.",
    ranked: (n: number) => `${n} ranked ${n > 1 ? "players" : "player"}`,
    topThree: "Top three",
    wins: (n: number) => (n > 1 ? "wins" : "win"),
    games: (n: number) => `${n} ${n > 1 ? "games" : "game"}`,
    free: "Open",
    upForGrabs: "up for grabs",
    notYou: (game: string | null) =>
      `You're not ranked${game ? ` at ${game}` : ""} yet. One game is all it takes.`,
    yourPlace: "Your rank",
    lastPlace: "The loser",
    winRate: (pct: number) => `${pct}% wins`,
    played: (n: number) => `${n} ${n > 1 ? "games played" : "game played"}`,
    best: (time: string) => `best ${time}`,
    elo: "rating",
  },
});

/* Le classement, d'un jeu ou de tous les jeux cumulés. Les trois premiers montent
   sur le podium, les autres suivent en liste, page après page, jusqu'à la lanterne
   rouge. La place du joueur est rappelée en tête, quelle que soit sa profondeur. */

export function leaderboardPath(game: string | null): string {
  return game ? `/${game}/leaderboard` : `${HUB_PATH}/leaderboard`;
}

export default function Leaderboard({ game }: { game: GameMeta | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const t = useT(T);
  const common = useT(COMMON);
  const lang = useLang();

  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
  }, [router]);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md grow flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
      <Link
        href={game ? game.path : HUB_PATH}
        className="mb-4 self-start rounded-xl py-2 pr-3 text-sm font-semibold text-ivory-dim/75 hover:text-ivory"
      >
        ‹ {game ? game.name[lang] : common.allGames}
      </Link>

      <nav
        aria-label={t.byGame}
        className="mb-6 flex overflow-x-auto rounded-full bg-black/30 p-1 ring-1 ring-white/10 [scrollbar-width:none]"
      >
        <Tab href={leaderboardPath(null)} active={game === null}>
          {t.all}
        </Tab>
        {GAMES.filter((g) => g.available).map((g) => (
          <Tab key={g.slug} href={leaderboardPath(g.slug)} active={game?.slug === g.slug}>
            {g.name[lang]}
          </Tab>
        ))}
      </nav>

      {profile && <Ranking game={game} profile={profile} />}
    </main>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  // Six jeux ne tiennent plus sur la largeur : l'onglet du jeu ouvert vient se montrer.
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);
  return (
    <Link
      ref={ref}
      href={href}
      replace
      aria-current={active ? "page" : undefined}
      className={`flex-1 whitespace-nowrap rounded-full px-1.5 py-2 text-center text-[13px] font-bold transition-colors ${
        active ? "bg-gold text-ink shadow-card" : "text-ivory-dim/75 active:text-ivory"
      }`}
    >
      {children}
    </Link>
  );
}

function Ranking({ game, profile }: { game: GameMeta | null; profile: StoredProfile }) {
  const slug = game?.slug ?? null;
  const t = useT(T);
  const lang = useLang();
  const pages = useInfiniteQuery({
    queryKey: ["leaderboard", slug, profile.pseudo],
    queryFn: ({ pageParam }) => fetchLeaderboard(slug, pageParam, profile.pseudo),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.entries.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  // Le bas de liste réclame la page suivante dès qu'il approche de l'écran.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "240px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (pages.isPending) return <LoadingScreen label={t.counting} />;
  if (pages.isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-card-red">{t.failed}</p>
        <button
          type="button"
          onClick={() => pages.refetch()}
          className="rounded-xl bg-felt-600 px-5 py-3 font-bold ring-1 ring-white/15 active:translate-y-0.5"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const first = pages.data.pages[0];
  const entries = pages.data.pages.flatMap((p) => p.entries);
  const me = first.me;
  const total = first.total;

  if (total === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-ivory-dim/30 p-5 text-center text-sm leading-relaxed text-ivory-dim/70">
        {t.nobody(game?.name[lang] ?? null)}
        <br />
        {t.firstGame}
      </p>
    );
  }

  const podium = entries.slice(0, 3);
  // Jeu chronométré : le meilleur temps de chacun, à côté (le tri reste aux victoires).
  const timed = game?.timed ?? false;
  // Jeu classé à l'Elo : la cote remplace les victoires (le serveur trie à la cote).
  const rated = game?.rated ?? false;
  const rest = entries.slice(3);
  const complete = !hasNextPage;

  return (
    <section className="flex flex-col gap-5">
      <Podium entries={podium} me={me} timed={timed} rated={rated} />

      <MyPlace me={me} total={total} game={game} timed={timed} rated={rated} />

      {rest.length > 0 && (
        <ol className="flex flex-col gap-2">
          {rest.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              mine={me?.id === entry.id}
              last={complete && entry.rank === total}
              timed={timed}
              rated={rated}
            />
          ))}
        </ol>
      )}

      <div ref={sentinel} className="flex min-h-12 flex-col items-center justify-center gap-2">
        {isFetchingNextPage ? (
          <>
            <ShufflingCards />
            <p className="text-sm text-ivory-dim/70">{t.counting}</p>
          </>
        ) : complete ? (
          <p className="text-sm text-ivory-dim/55">
            {t.ranked(total)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/* Podium                                                                  */
/* ----------------------------------------------------------------------- */

const MEDALS = ["#e5b54a", "#cfd3d8", "#c98552"] as const;

function Podium({
  entries,
  me,
  timed,
  rated,
}: {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  timed: boolean;
  rated: boolean;
}) {
  const reduced = useReducedMotion();
  const t = useT(T);
  // Le premier au centre, plus haut ; le deuxième à sa gauche, le troisième à sa droite.
  const order = [1, 0, 2];
  const heights = ["h-24", "h-16", "h-11"];
  return (
    <ol className="flex items-end gap-2" aria-label={t.topThree}>
      {order.map((i) => {
        const entry = entries[i];
        const medal = MEDALS[i];
        return (
          <motion.li
            key={i}
            className="flex flex-1 flex-col items-center"
            initial={reduced ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 22,
              delay: 0.1 + [0.25, 0, 0.4][i],
            }}
          >
            {entry ? (
              <>
                <span
                  className={`rounded-full ${i === 0 ? "p-1" : "p-0.5"}`}
                  style={{
                    background: medal,
                    boxShadow: i === 0 ? `0 0 24px 4px ${medal}66` : undefined,
                  }}
                >
                  <Avatar id={entry.avatar} size={i === 0 ? "xl" : "lg"} />
                </span>
                <p
                  className={`mt-2 w-full truncate text-center font-extrabold ${
                    i === 0 ? "text-base" : "text-sm"
                  } ${me?.id === entry.id ? "text-gold" : ""}`}
                >
                  {entry.pseudo}
                </p>
                <p className="text-xs text-ivory-dim/70">
                  <span className="font-bold text-ivory">{rated ? entry.rating : entry.won}</span>{" "}
                  {rated ? t.elo : t.wins(entry.won)}
                </p>
                <p className="text-xs text-ivory-dim/55">{t.games(entry.played)}</p>
                {timed && entry.best_ms && (
                  <p className="text-xs font-semibold tabular-nums text-gold/85">
                    {t.best(formatDuration(entry.best_ms, true))}
                  </p>
                )}
              </>
            ) : (
              <>
                <span className="size-16 rounded-full border-2 border-dashed border-ivory-dim/25" />
                <p className="mt-2 text-sm font-bold text-ivory-dim/45">{t.free}</p>
                <p className="text-xs text-ivory-dim/40">{t.upForGrabs}</p>
              </>
            )}
            <div
              className={`mt-2 flex w-full ${heights[i]} items-start justify-center rounded-t-2xl pt-2 ring-1 ring-white/10`}
              style={{
                background: `linear-gradient(180deg, ${medal}33, ${medal}0d)`,
                boxShadow: `inset 0 2px 0 ${medal}80`,
              }}
            >
              <span
                className="text-2xl font-extrabold leading-none tabular-nums"
                style={{ color: medal }}
              >
                {i + 1}
              </span>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------------- */
/* Ma place                                                                */
/* ----------------------------------------------------------------------- */

function MyPlace({
  me,
  total,
  game,
  timed,
  rated,
}: {
  me: LeaderboardEntry | null;
  total: number;
  game: GameMeta | null;
  timed: boolean;
  rated: boolean;
}) {
  const t = useT(T);
  const lang = useLang();
  if (!me) {
    return (
      <p className="rounded-2xl bg-black/25 px-4 py-3 text-sm text-ivory-dim/75 ring-1 ring-white/10">
        {t.notYou(game?.name[lang] ?? null)}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-felt-600/60 px-4 py-3 ring-1 ring-gold/60">
      <span className="text-2xl font-extrabold tabular-nums text-gold">{me.rank}</span>
      <span className="text-sm text-ivory-dim/60">/ {total}</span>
      <div className="min-w-0 grow">
        <p className="truncate text-sm font-bold">{t.yourPlace}</p>
        <WinBar entry={me} />
      </div>
      <Score entry={me} timed={timed} rated={rated} />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Lignes du classement                                                    */
/* ----------------------------------------------------------------------- */

function Row({
  entry,
  mine,
  last,
  timed,
  rated,
}: {
  entry: LeaderboardEntry;
  mine: boolean;
  last: boolean;
  timed: boolean;
  rated: boolean;
}) {
  const t = useT(T);
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${
        mine ? "bg-felt-600/60 ring-gold/60" : "bg-black/25 ring-white/10"
      }`}
    >
      <span className="w-7 shrink-0 text-right text-base font-extrabold tabular-nums text-ivory-dim/55">
        {entry.rank}
      </span>
      <Avatar id={entry.avatar} />
      <div className="min-w-0 grow">
        <p className={`truncate font-bold ${mine ? "text-gold" : ""}`}>{entry.pseudo}</p>
        {last && (
          <span className="mt-1 inline-block rounded-full bg-card-red/20 px-2 py-0.5 text-[0.65rem] font-bold text-card-red ring-1 ring-card-red/40">
            {t.lastPlace}
          </span>
        )}
        <WinBar entry={entry} />
      </div>
      <Score entry={entry} timed={timed} rated={rated} />
    </li>
  );
}

/* Part de victoires sur les parties jouées : un trait, pas un pourcentage à lire. */
function WinBar({ entry }: { entry: LeaderboardEntry }) {
  const ratio = entry.played ? entry.won / entry.played : 0;
  const t = useT(T);
  return (
    <span
      className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-white/10"
      role="img"
      aria-label={t.winRate(Math.round(ratio * 100))}
    >
      <span
        className="block h-full rounded-full bg-gold"
        style={{ width: `${Math.max(ratio * 100, entry.won ? 4 : 0)}%` }}
      />
    </span>
  );
}

function Score({
  entry,
  timed,
  rated,
}: {
  entry: LeaderboardEntry;
  timed: boolean;
  rated: boolean;
}) {
  const t = useT(T);
  return (
    <div className="shrink-0 text-right">
      <p className="text-xl font-extrabold leading-none tabular-nums">
        {rated ? entry.rating : entry.won}{" "}
        <span className="text-xs font-semibold text-ivory-dim/70">
          {rated ? t.elo : t.wins(entry.won)}
        </span>
      </p>
      <p className="mt-1 text-xs text-ivory-dim/60 tabular-nums">
        {t.played(entry.played)}
      </p>
      {timed && entry.best_ms && (
        <p className="mt-0.5 text-xs font-semibold tabular-nums text-gold/85">
          {t.best(formatDuration(entry.best_ms, true))}
        </p>
      )}
    </div>
  );
}
