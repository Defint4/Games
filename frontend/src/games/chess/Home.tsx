"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { leaderboardPath } from "@/components/Leaderboard";
import { TransitionOverlay } from "@/components/Loading";
import { Sheet } from "@/components/Sheet";
import { ApiError, createRoom, fetchMe, fetchRoom, joinRoom } from "@/lib/api";
import { HUB_PATH, tablePath } from "@/lib/games";
import { tr, useLang, useT } from "@/lib/i18n";
import { currentProfile, forgetTable, lastTable, type StoredProfile } from "@/lib/identity";
import { isMaintenanceError, maintenanceBlocks, showMaintenanceNotice } from "@/lib/maintenance";
import { applyFelt } from "@/lib/prefs";
import { COMMON } from "@/lib/texts";
import { NO_STATS, type OpenRoom } from "@/lib/types";
import { useOpenRooms } from "@/lib/useOpenRooms";
import { fetchRecentGames } from "./api";
import { preloadAssets } from "./assets";
import { BOT_MAX, BOT_MIN, BOT_STEP, levelOf } from "./bot";
import { loadBotGame, newBotGame, storeBotGame, type BotGame, type ColorChoice } from "./botGame";
import { prefetchEngine } from "./engine";
import CategoryIcon from "./CategoryIcon";
import { T } from "./i18n";
import Look from "./Look";
import {
  BOT_PATH,
  DEFAULT_TIME_CONTROL,
  GAME,
  reviewPath,
  TIME_CONTROLS,
  timeControl,
  type Category,
} from "./meta";
import Rules from "./Rules";
import type { GameSummary } from "./types";
import { pieceUrl } from "./themes";
import { PRIMARY, SECONDARY, signed } from "./ui";
import { useChessPrefs } from "./prefs";
import Wordmark from "./Wordmark";

const TC_KEY = "games:chess:time-control";
const BOT_KEY = "games:chess:bot-settings";

function storedTimeControl(): string {
  try {
    const id = localStorage.getItem(TC_KEY);
    return id && TIME_CONTROLS.some((tc) => tc.id === id) ? id : DEFAULT_TIME_CONTROL;
  } catch {
    return DEFAULT_TIME_CONTROL;
  }
}

/* L'accueil des échecs, à la manière du panneau « Jouer » de chess.com : sa cote, la
   cadence, « Jouer en ligne », le salon des parties en attente, les dernières parties
   jouées (on les rouvre pour le bilan). Le fond anthracite est celui de chess.com. */
export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const common = useT(COMMON);

  useEffect(() => {
    // Les pièces et les sons se chargent dès l'accueil : la table s'ouvre sans attente.
    // Le moteur de l'ordinateur rejoint le cache, sans démarrer.
    void preloadAssets();
    prefetchEngine();
    document.documentElement.dataset.felt = "chess";
    return () => applyFelt();
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
          className="rounded-xl py-2 pl-3 text-sm font-semibold text-[#81b64c] hover:text-[#9bd060]"
        >
          {common.leaderboard} ›
        </Link>
      </div>
      <Wordmark />
      {profile && <Lobby profile={profile} />}
    </main>
  );
}

function Lobby({ profile }: { profile: StoredProfile }) {
  const router = useRouter();
  const all = useT(T);
  const t = all.home;
  const [tcId, setTcId] = useState(DEFAULT_TIME_CONTROL);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "rules" | "look">(null);
  const [resumeCode, setResumeCode] = useState<string | null>(null);

  useEffect(() => {
    // Cadence et partie mémorisées sur l'appareil : lues après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTcId(storedTimeControl());
    setResumeCode(lastTable(GAME.slug));
  }, []);

  const me = useQuery({ queryKey: ["me", profile.pseudo], queryFn: () => fetchMe(profile.token) });
  const stats = me.data?.stats[GAME.slug] ?? NO_STATS;
  const rooms = useOpenRooms(GAME.slug);
  const recent = useQuery({
    queryKey: ["chess-games", profile.pseudo],
    queryFn: () => fetchRecentGames(profile.token),
    refetchOnMount: "always",
  });

  // Une partie en cours à reprendre ? Seulement si le serveur la connaît encore.
  const remembered = useQuery({
    queryKey: ["room", resumeCode, profile.pseudo],
    queryFn: () => fetchRoom(profile.token, resumeCode!),
    enabled: resumeCode !== null,
    retry: false,
    staleTime: 0,
  });
  const resumable =
    remembered.data !== undefined &&
    remembered.data.status !== "finished" &&
    remembered.data.seated;
  useEffect(() => {
    if (resumeCode === null) return;
    const gone =
      (remembered.error instanceof ApiError && remembered.error.status === 404) ||
      (remembered.data !== undefined && !resumable);
    if (gone) {
      forgetTable(GAME.slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResumeCode(null);
    }
  }, [resumeCode, remembered.error, remembered.data, resumable]);

  const goToTable = ({ code }: { code: string }) => router.push(tablePath(GAME.slug, code));
  const fail = (e: unknown) => {
    setLeaving(null);
    if (isMaintenanceError(e)) showMaintenanceNotice();
    else setError(e instanceof ApiError ? e.message : tr(T).home.unreachable);
  };
  const create = useMutation({
    mutationFn: () => createRoom(profile.token, GAME.slug, { time_control: tcId }),
    onMutate: () => {
      setError(null);
      setLeaving(tr(T).home.opening);
    },
    onSuccess: goToTable,
    onError: fail,
  });
  const join = useMutation({
    mutationFn: (room: OpenRoom) => joinRoom(profile.token, room.code),
    onMutate: (room) => {
      setError(null);
      setLeaving(tr(T).home.joining(room.players[0]?.pseudo ?? ""));
    },
    onSuccess: goToTable,
    onError: fail,
  });
  const busy = leaving !== null;

  function pick(id: string) {
    setTcId(id);
    try {
      localStorage.setItem(TC_KEY, id);
    } catch {
      /* stockage indisponible */
    }
  }

  const seeks = rooms.rooms.filter(
    (r) => r.players[0]?.pseudo.toLowerCase() !== profile.pseudo.toLowerCase(),
  );
  const categories: Category[] = ["bullet", "blitz", "rapid"];

  return (
    <section className="flex grow flex-col gap-5">
      <TransitionOverlay label={leaving} />

      <div className="flex items-center gap-3 rounded-2xl bg-[#262522] p-3 ring-1 ring-white/10">
        <Avatar id={profile.avatar} size="lg" />
        <div className="min-w-0 grow">
          <p className="truncate text-lg font-bold">{profile.pseudo}</p>
          {me.data && (
            <p className="text-sm text-ivory-dim/75">{t.record(stats.played, stats.won, stats.lost)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-ivory-dim/60">{t.rating}</p>
          <p className="text-2xl font-extrabold tabular-nums">
            {me.data ? (stats.rating ?? 300) : "…"}
          </p>
        </div>
      </div>

      {resumeCode && resumable && (
        <button
          type="button"
          onClick={() => {
            setLeaving(tr(T).home.resuming);
            router.push(tablePath(GAME.slug, resumeCode));
          }}
          disabled={busy}
          className="flex items-center justify-between rounded-2xl bg-[#3c3a36] px-5 py-4 ring-1 ring-[#81b64c]/60"
        >
          <span className="font-extrabold">{t.resume}</span>
          <span className="text-[#81b64c]">→</span>
        </button>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-[#262522] p-3 ring-1 ring-white/10">
        <p className="text-sm font-bold text-ivory-dim/80">{t.cadence}</p>
        {categories.map((category) => (
          <div key={category}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ivory-dim/60">
              <CategoryIcon category={category} className="size-4" />
              {all.categories[category]}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_CONTROLS.filter((tc) => tc.category === category).map((tc) => (
                <TcButton key={tc.id} id={tc.id} selected={tcId === tc.id} onPick={pick} />
              ))}
            </div>
          </div>
        ))}
        <TcButton id="unlimited" selected={tcId === "unlimited"} onPick={pick} icon />
      </div>

      <button
        type="button"
        onClick={() => {
          if (!maintenanceBlocks()) create.mutate();
        }}
        disabled={busy}
        className={`flex items-center justify-center gap-2 py-5 text-xl ${PRIMARY}`}
      >
        <CategoryIcon category={timeControl(tcId).category} className="size-6" />
        {t.playOnline}
      </button>

      {error && <p className="text-sm text-card-red">{error}</p>}

      <div className="flex flex-col gap-2">
        <h2 className="font-bold">{t.seeks}</h2>
        {seeks.length ? (
          seeks.map((room) => (
            <SeekRow
              key={room.code}
              room={room}
              disabled={busy}
              onJoin={() => {
                if (!maintenanceBlocks()) join.mutate(room);
              }}
            />
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-ivory-dim/25 p-4 text-sm text-ivory-dim/65">
            {rooms.ready ? t.noSeeks : t.lookingSeeks}
          </p>
        )}
      </div>

      <BotCorner tcId={tcId} disabled={busy} onStart={() => setLeaving(tr(T).bot.waking)} />

      <div className="flex flex-col gap-2">
        <h2 className="font-bold">{t.recent}</h2>
        {recent.isPending ? (
          <p className="p-2 text-sm text-ivory-dim/55">…</p>
        ) : recent.isError ? (
          <p className="p-2 text-sm text-card-red">{t.recentFailed}</p>
        ) : recent.data.length ? (
          <ul className="flex flex-col overflow-hidden rounded-2xl bg-[#262522] ring-1 ring-white/10">
            {recent.data.map((game) => (
              <RecentRow key={game.id} game={game} myId={me.data?.id} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-ivory-dim/25 p-4 text-sm text-ivory-dim/65">
            {t.noRecent}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSheet("look")}
          className="rounded-2xl bg-[#262522] p-4 font-bold ring-1 ring-white/10 active:translate-y-0.5"
        >
          {tr(COMMON).settings}
        </button>
        <button
          type="button"
          onClick={() => setSheet("rules")}
          className="rounded-2xl bg-[#262522] p-4 font-bold ring-1 ring-white/10 active:translate-y-0.5"
        >
          {t.rules}
        </button>
      </div>

      {sheet && (
        <Sheet onClose={() => setSheet(null)}>{sheet === "rules" ? <Rules /> : <Look />}</Sheet>
      )}
    </section>
  );
}

type BotSettings = { elo: number; color: ColorChoice };

function storedBotSettings(): BotSettings {
  try {
    const raw = localStorage.getItem(BOT_KEY);
    if (raw) return { elo: 1200, color: "random", ...(JSON.parse(raw) as Partial<BotSettings>) };
  } catch {
    /* stockage illisible */
  }
  return { elo: 1200, color: "random" };
}

/* Jouer contre l'ordinateur : la réglette de niveau (800 à 2500), la couleur, et la
   cadence choisie plus haut. La partie en cours se reprend. */
function BotCorner({
  tcId,
  disabled,
  onStart,
}: {
  tcId: string;
  disabled: boolean;
  onStart: () => void;
}) {
  const router = useRouter();
  const all = useT(T);
  const t = all.bot;
  const { pieces } = useChessPrefs();
  const [settings, setSettings] = useState<BotSettings>({ elo: 1200, color: "random" });
  const [current, setCurrent] = useState<BotGame | null>(null);
  useEffect(() => {
    // Réglages et partie en cours mémorisés sur l'appareil : lus après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(storedBotSettings());
    const saved = loadBotGame();
    setCurrent(saved && !saved.over ? saved : null);
  }, []);

  function change(next: BotSettings) {
    setSettings(next);
    try {
      localStorage.setItem(BOT_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible */
    }
  }

  function start() {
    // Partie jouée sur l'appareil : seule l'app peut la refuser pendant la maintenance.
    if (maintenanceBlocks()) return;
    onStart();
    storeBotGame(newBotGame(settings.elo, settings.color, tcId));
    router.push(BOT_PATH);
  }

  const tc = timeControl(tcId);
  const choices: { id: ColorChoice; label: string }[] = [
    { id: "w", label: t.white },
    { id: "random", label: t.random },
    { id: "b", label: t.black },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#262522] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-[#3c3a36] text-xl" aria-hidden>
          🤖
        </span>
        <h2 className="grow font-bold">{t.title}</h2>
        <span className="text-right">
          <span className="block text-2xl font-extrabold leading-none tabular-nums">{settings.elo}</span>
          <span className="text-xs font-semibold text-[#81b64c]">{t.levels[levelOf(settings.elo)]}</span>
        </span>
      </div>

      <input
        type="range"
        min={BOT_MIN}
        max={BOT_MAX}
        step={BOT_STEP}
        value={settings.elo}
        aria-label={t.strength}
        onChange={(e) => change({ ...settings, elo: Number(e.target.value) })}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#3c3a36] accent-[#81b64c]"
        style={{
          background: `linear-gradient(90deg, #81b64c ${((settings.elo - BOT_MIN) / (BOT_MAX - BOT_MIN)) * 100}%, #3c3a36 0)`,
        }}
      />
      <div className="-mt-1 flex justify-between text-[0.7rem] font-semibold text-ivory-dim/50">
        <span>{BOT_MIN}</span>
        <span>{BOT_MAX}</span>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ivory-dim/60">{t.color}</p>
        <div className="grid grid-cols-3 gap-2">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={settings.color === choice.id}
              onClick={() => change({ ...settings, color: choice.id })}
              className={`flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-bold ${
                settings.color === choice.id
                  ? "bg-[#3c3a36] text-ivory ring-2 ring-[#81b64c]"
                  : "bg-[#312e2b] text-ivory-dim/80"
              }`}
            >
              {choice.id === "random" ? (
                <span className="relative size-6">
                  <span
                    className="absolute inset-0 bg-cover [clip-path:inset(0_50%_0_0)]"
                    style={{ backgroundImage: `url(${pieceUrl(pieces, "w", "k")})` }}
                  />
                  <span
                    className="absolute inset-0 bg-cover [clip-path:inset(0_0_0_50%)]"
                    style={{ backgroundImage: `url(${pieceUrl(pieces, "b", "k")})` }}
                  />
                </span>
              ) : (
                <span
                  className="size-6 bg-cover"
                  style={{ backgroundImage: `url(${pieceUrl(pieces, choice.id, "k")})` }}
                />
              )}
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onStart();
            router.push(BOT_PATH);
          }}
          className="flex items-center justify-between rounded-xl bg-[#3c3a36] px-4 py-3 text-left ring-1 ring-[#81b64c]/60"
        >
          <span className="text-sm font-extrabold">{t.resume}</span>
          <span className="text-[#81b64c]">→</span>
        </button>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={start}
        className={`flex items-center justify-center gap-2 py-3.5 ${SECONDARY}`}
      >
        <CategoryIcon category={tc.category} className="size-5" />
        {t.play}
      </button>
      <p className="text-center text-xs text-ivory-dim/50">{t.unrated}</p>
    </div>
  );
}

function TcButton({
  id,
  selected,
  onPick,
  icon = false,
}: {
  id: string;
  selected: boolean;
  onPick: (id: string) => void;
  icon?: boolean;
}) {
  const all = useT(T);
  const tc = timeControl(id);
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={selected}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition-colors ${
        selected
          ? "bg-[#3c3a36] text-ivory ring-2 ring-[#81b64c]"
          : "bg-[#312e2b] text-ivory-dim/80 active:bg-[#3c3a36]"
      }`}
    >
      {icon && <CategoryIcon category={tc.category} className="size-4" />}
      {all.timeControl(tc.base, tc.increment)}
    </button>
  );
}

function SeekRow({
  room,
  disabled,
  onJoin,
}: {
  room: OpenRoom;
  disabled: boolean;
  onJoin: () => void;
}) {
  const all = useT(T);
  const host = room.players[0];
  const tc = timeControl(room.time_control ?? DEFAULT_TIME_CONTROL);
  if (!host) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onJoin}
      className="flex items-center gap-3 rounded-2xl bg-[#262522] p-3 text-left ring-1 ring-white/10 active:translate-y-0.5"
    >
      <Avatar id={host.avatar} />
      <span className="min-w-0 grow">
        <span className="block truncate font-bold">{host.pseudo}</span>
        <span className="text-sm text-ivory-dim/65">{host.rating ?? 300}</span>
      </span>
      <span className="flex items-center gap-1.5 rounded-lg bg-[#312e2b] px-2.5 py-1.5 text-sm font-bold">
        <CategoryIcon category={tc.category} className="size-4" />
        {all.timeControl(tc.base, tc.increment)}
      </span>
      <span className="text-[#81b64c]">→</span>
    </button>
  );
}

function RecentRow({ game, myId }: { game: GameSummary; myId: string | undefined }) {
  const all = useT(T);
  const t = all.home;
  const lang = useLang();
  const mineWhite = game.white.id === myId;
  const mine = mineWhite ? game.white : game.black;
  const theirs = mineWhite ? game.black : game.white;
  const score = game.result === "1/2-1/2" ? 0.5 : (game.result === "1-0") === mineWhite ? 1 : 0;
  const badge =
    score === 1
      ? { text: "+", className: "bg-[#81b64c]" }
      : score === 0
        ? { text: "−", className: "bg-card-red" }
        : { text: "=", className: "bg-[#8b8987]" };
  const tc = timeControl(game.time_control);
  const date = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
    new Date(game.ended_at),
  );
  return (
    <li className="border-b border-white/5 last:border-0">
      <Link href={reviewPath(game.id)} className="flex items-center gap-3 px-3 py-2.5 active:bg-white/5">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-md text-sm font-extrabold text-white ${badge.className}`}
        >
          {badge.text}
        </span>
        <span
          className={`size-3 shrink-0 rounded-sm ring-1 ring-black/40 ${mineWhite ? "bg-[#f0efea]" : "bg-[#1f1e1b]"}`}
        />
        <Avatar id={theirs.avatar} size="sm" />
        <span className="min-w-0 grow">
          <span className="block truncate text-sm font-bold">
            {game.bot_elo !== null ? t.vsBot(game.bot_elo) : theirs.pseudo}
            {game.bot_elo === null && theirs.rating !== null && (
              <span className="font-semibold text-ivory-dim/55"> ({theirs.rating})</span>
            )}
          </span>
          <span className="flex items-center gap-1 truncate whitespace-nowrap text-xs text-ivory-dim/60">
            <CategoryIcon category={tc.category} className="size-3.5 shrink-0" />
            {all.timeControl(tc.base, tc.increment)} · {t.plies(game.plies)} · {date}
          </span>
        </span>
        {game.accuracy && (
          <span className="shrink-0 rounded-md bg-[#312e2b] px-1.5 py-0.5 text-xs font-bold tabular-nums text-ivory-dim/80">
            {game.accuracy[mineWhite ? "w" : "b"].toFixed(1)}
          </span>
        )}
        {mine.delta !== null && (
          <span
            className={`text-sm font-extrabold tabular-nums ${
              mine.delta > 0 ? "text-[#81b64c]" : mine.delta < 0 ? "text-card-red" : "text-ivory-dim/60"
            }`}
          >
            {signed(mine.delta)}
          </span>
        )}
      </Link>
    </li>
  );
}
