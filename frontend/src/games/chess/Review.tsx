"use client";

import { useQuery } from "@tanstack/react-query";
import { Chess, type Color } from "chess.js";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { LoadingScreen } from "@/components/Loading";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { applyFelt } from "@/lib/prefs";
import { settle } from "@/lib/settle";
import { COMMON } from "@/lib/texts";
import { CLASSIFICATIONS, type Classification, type GameReview } from "./analysis";
import { fetchGame } from "./api";
import { preloadAssets } from "./assets";
import Board, { type Arrow } from "./Board";
import { capturedBy, fenAt, kingInCheck, materialBalance, parseUci, replay, type Replay } from "./game";
import { T } from "./i18n";
import Look from "./Look";
import { GAME, timeControl } from "./meta";
import { San } from "./MoveList";
import PlayerBar, { Clock } from "./PlayerBar";
import { ClassIcon, CLASS_COLORS, EvalBar, EvalGraph, formatEval } from "./ReviewParts";
import { playSound } from "./sounds";
import type { SavedGame, Side } from "./types";
import { PRIMARY } from "./ui";
import { useGameReview } from "./useReview";

/* Le bilan d'une partie terminée, comme le « Game Review » de chess.com : d'abord le
   résumé (courbe, précision, coups par catégorie, Elo de la partie), puis la relecture
   coup par coup avec la barre d'évaluation, le verdict de chaque coup, le meilleur coup
   en flèche. Le calcul se fait sur l'appareil la première fois, le serveur le garde. */
export default function Review() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const t = useT(T).review;

  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
  }, [router]);

  useEffect(() => {
    document.documentElement.dataset.felt = "chess";
    let cancelled = false;
    // Une ressource bloquée ne retient pas l'écran plus de 20 s.
    settle(preloadAssets(), 20000).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
      applyFelt();
    };
  }, []);

  const game = useQuery({
    queryKey: ["chess-game", id],
    queryFn: () => fetchGame(profile!.token, id),
    enabled: profile !== null,
    staleTime: Infinity,
  });

  if (game.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-bold">{t.failed}</p>
        <Link href={GAME.path} className="rounded-xl bg-[#81b64c] px-6 py-3 font-extrabold text-white">
          {t.back}
        </Link>
      </div>
    );
  }
  if (!profile || !assetsReady || !game.data) return <LoadingScreen label={t.loading} />;
  return <ReviewScreen game={game.data} profile={profile} />;
}

function ReviewScreen({ game, profile }: { game: SavedGame; profile: StoredProfile }) {
  const all = useT(T);
  const t = all.review;
  const common = useT(COMMON);
  const replayed = useMemo(() => replay(game.moves), [game.moves]);
  const total = replayed.plies.length;
  const { review, progress, failed, retry } = useGameReview(game, profile.token);
  const [mode, setMode] = useState<"summary" | "moves">("summary");
  const [ply, setPly] = useState(total);
  const [lookOpen, setLookOpen] = useState(false);
  const blackIsMe = game.black.pseudo.toLowerCase() === profile.pseudo.toLowerCase();
  const [orientation, setOrientation] = useState<Color>(blackIsMe ? "b" : "w");

  const go = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(total, next));
      // En avançant d'un coup, on l'entend comme à la table.
      if (target === ply + 1) playSound(replayed.plies[target - 1]);
      setPly(target);
    },
    [ply, total, replayed],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(ply - 1);
      else if (e.key === "ArrowRight") go(ply + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") go(0);
      else if (e.key === "ArrowDown" || e.key === "End") go(total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, ply, total]);

  const showSummary = mode === "summary" && review !== null;

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Link href={GAME.path} className="rounded-xl py-2 pr-2 text-sm font-semibold text-ivory-dim/75">
          ‹ {t.back}
        </Link>
        <h1 className="grow text-center font-extrabold">{t.title}</h1>
        <button
          type="button"
          onClick={() => setLookOpen(true)}
          className="rounded-xl py-2 pl-2 text-sm font-semibold text-ivory-dim/75"
        >
          {common.settings}
        </button>
      </header>

      {!review && (
        <div className="mx-3 mb-2 rounded-xl bg-[#262522] p-3 ring-1 ring-white/10">
          {failed ? (
            <div className="flex items-center gap-3">
              <p className="grow text-sm font-bold">{t.analysisFailed}</p>
              <button type="button" onClick={retry} className={`px-4 py-2 text-sm ${PRIMARY}`}>
                {t.retry}
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm font-bold">{t.analysing(Math.round(progress * 100))}</p>
              <div className="h-2 overflow-hidden rounded-full bg-[#3c3a36]">
                <motion.div
                  className="h-full rounded-full bg-[#81b64c]"
                  initial={false}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {showSummary ? (
        <Summary
          game={game}
          review={review}
          onStart={() => {
            setMode("moves");
            setPly(0);
          }}
          onSelect={(p) => {
            setMode("moves");
            setPly(p);
          }}
        />
      ) : (
        <Moves
          game={game}
          replayed={replayed}
          review={review}
          ply={ply}
          orientation={orientation}
          onSelect={setPly}
        />
      )}

      <nav className="flex gap-1.5 px-3 pb-3 pt-2">
        {review && (
          <NavButton
            label={mode === "summary" ? t.startReview : t.summary}
            onClick={() => setMode(mode === "summary" ? "moves" : "summary")}
          >
            {mode === "summary" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m5 14V10m5 9V7m5 12v-5" />
            )}
          </NavButton>
        )}
        <NavButton label={t.flip} onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
        </NavButton>
        <NavButton
          label={t.previous}
          onClick={() => {
            setMode("moves");
            go(ply - 1);
          }}
          disabled={ply === 0 && mode === "moves"}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
        </NavButton>
        <NavButton
          label={t.next}
          onClick={() => {
            setMode("moves");
            go(ply + 1);
          }}
          disabled={ply === total && mode === "moves"}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </NavButton>
      </nav>

      {lookOpen && (
        <Sheet onClose={() => setLookOpen(false)}>
          <Look />
        </Sheet>
      )}
    </main>
  );
}

/* Le résumé : la courbe, les deux joueurs avec leur précision, les coups par catégorie,
   l'Elo de la partie, l'ouverture. */
function Summary({
  game,
  review,
  onStart,
  onSelect,
}: {
  game: SavedGame;
  review: GameReview;
  onStart: () => void;
  onSelect: (ply: number) => void;
}) {
  const all = useT(T);
  const t = all.review;
  const counts = useMemo(() => {
    const zero = () =>
      Object.fromEntries(CLASSIFICATIONS.map((k) => [k, 0])) as Record<Classification, number>;
    const c: Record<Color, Record<Classification, number>> = { w: zero(), b: zero() };
    review.plies.forEach((p, i) => (c[i % 2 === 0 ? "w" : "b"][p.cls] += 1));
    return c;
  }, [review]);
  const name = (side: Side) =>
    game.bot_elo !== null && side.id === null ? all.bot.computer : side.pseudo;

  return (
    <div className="min-h-0 grow overflow-y-auto px-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3"
      >
        <EvalGraph review={review} ply={-1} onSelect={onSelect} />

        <div className="rounded-xl bg-[#262522] p-3 ring-1 ring-white/10">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
            <span />
            <PlayerHead side={game.white} name={name(game.white)} />
            <PlayerHead side={game.black} name={name(game.black)} />

            <span className="text-sm font-bold text-ivory-dim/80">{t.accuracy}</span>
            <Score value={review.accuracy.w} light />
            <Score value={review.accuracy.b} />

            {CLASSIFICATIONS.map((cls, i) => (
              <motion.div
                key={cls}
                className="contents"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.04 }}
              >
                <span
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: CLASS_COLORS[cls] }}
                >
                  <ClassIcon cls={cls} className="size-5" />
                  {t.classes[cls]}
                </span>
                <Count value={counts.w[cls]} color={CLASS_COLORS[cls]} />
                <Count value={counts.b[cls]} color={CLASS_COLORS[cls]} />
              </motion.div>
            ))}

            <span className="mt-1 border-t border-white/10 pt-2 text-sm font-bold text-ivory-dim/80">
              {t.gameRating}
            </span>
            <span className="mt-1 border-t border-white/10 pt-2 text-center text-lg font-extrabold tabular-nums">
              {review.elo.w}
            </span>
            <span className="mt-1 border-t border-white/10 pt-2 text-center text-lg font-extrabold tabular-nums">
              {review.elo.b}
            </span>
          </div>
          {review.opening && (
            <p className="mt-3 border-t border-white/10 pt-2 text-center text-sm text-ivory-dim/75">
              <span className="font-bold text-[#a88865]">{review.opening.eco}</span>{" "}
              {review.opening.name}
            </p>
          )}
        </div>

        <button type="button" onClick={onStart} className={`py-3.5 text-lg ${PRIMARY}`}>
          {t.startReview}
        </button>
        <p className="pb-2 text-center text-xs text-ivory-dim/45">{t.engineNote}</p>
      </motion.div>
    </div>
  );
}

function PlayerHead({ side, name }: { side: Side; name: string }) {
  return (
    <span className="flex w-20 flex-col items-center gap-1 text-center">
      <Avatar id={side.avatar} size="md" />
      <span className="w-full truncate text-xs font-bold">{name}</span>
    </span>
  );
}

function Score({ value, light = false }: { value: number; light?: boolean }) {
  return (
    <span
      className={`justify-self-center rounded-md px-2.5 py-1 text-lg font-extrabold tabular-nums ${
        light ? "bg-[#f0efea] text-[#262522]" : "bg-[#1f1e1b] text-ivory ring-1 ring-white/15"
      }`}
    >
      {value.toFixed(1)}
    </span>
  );
}

function Count({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="text-center text-sm font-extrabold tabular-nums"
      style={{ color: value ? color : "rgba(232,226,210,0.3)" }}
    >
      {value}
    </span>
  );
}

/* Les catégories où le coup joué n'appelle pas de « meilleur coup » en flèche. */
const QUIET = new Set<Classification>(["best", "book", "brilliant", "great"]);

/* La relecture coup par coup. */
function Moves({
  game,
  replayed,
  review,
  ply,
  orientation,
  onSelect,
}: {
  game: SavedGame;
  replayed: Replay;
  review: GameReview | null;
  ply: number;
  orientation: Color;
  onSelect: (ply: number) => void;
}) {
  const all = useT(T);
  const t = all.review;
  const total = replayed.plies.length;
  const fen = fenAt(replayed, ply);
  const last = ply > 0 ? replayed.plies[ply - 1] : null;
  const verdict = review && ply > 0 ? review.plies[ply - 1] : null;
  const captured = capturedBy(replayed, ply);
  const balance = materialBalance(fen);
  const tc = timeControl(game.time_control);
  const score = review ? (ply === 0 ? review.start : review.plies[ply - 1].eval) : null;

  // Le meilleur coup de la position d'avant, quand le coup joué n'en était pas un bon.
  let bestSan: string | null = null;
  if (verdict && !QUIET.has(verdict.cls)) {
    try {
      bestSan = new Chess(fenAt(replayed, ply - 1)).move(parseUci(verdict.best)).san;
    } catch {
      bestSan = null;
    }
  }
  const arrows: Arrow[] =
    verdict && bestSan ? [{ ...parseUci(verdict.best), color: "rgba(129, 182, 76, 0.85)" }] : [];

  const clockOf = (color: Color): number | null => {
    if (!game.clocks) return null;
    for (let i = ply - 1; i >= 0; i--) {
      if (replayed.plies[i].color === color) return game.clocks[i] / 1000;
    }
    return tc.base;
  };
  const bar = (color: Color) => {
    const side: Side = color === "w" ? game.white : game.black;
    const isBot = game.bot_elo !== null && side.id === null;
    const seconds = clockOf(color);
    return (
      <PlayerBar
        pseudo={isBot ? all.bot.computer : side.pseudo}
        avatar={side.avatar}
        rating={isBot ? game.bot_elo : side.rating}
        delta={ply === total ? side.delta : null}
        color={color}
        captured={captured[color]}
        advantage={Math.max(0, color === "w" ? balance : -balance)}
        clock={
          seconds !== null ? (
            <Clock key={`${ply}-${color}`} seconds={seconds} running={false} color={color} />
          ) : undefined
        }
      />
    );
  };

  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-current]")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [ply]);

  const top: Color = orientation === "w" ? "b" : "w";
  const rows: number[] = [];
  for (let i = 0; i < total; i += 2) rows.push(i);
  const result = game.result === "1/2-1/2" ? "½-½" : game.result;

  return (
    <>
      <div className="mx-auto w-full" style={{ maxWidth: "min(100%, calc(100dvh - 21rem))" }}>
        {bar(top)}
        <div className="flex gap-1">
          {score !== null && <EvalBar score={score} orientation={orientation} />}
          <div className="min-w-0 grow">
            <Board
              fen={fen}
              orientation={orientation}
              lastMove={last ? { from: last.from, to: last.to } : null}
              lastMoveColor={verdict ? `${CLASS_COLORS[verdict.cls]}99` : undefined}
              check={kingInCheck(fen)}
              arrows={arrows}
              marks={
                verdict && last
                  ? [
                      {
                        square: last.to,
                        node: (
                          <motion.span
                            key={ply}
                            initial={{ scale: 0.3, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 18 }}
                            className="absolute -right-[18%] -top-[18%] block size-[52%]"
                          >
                            <ClassIcon cls={verdict.cls} className="size-full" />
                          </motion.span>
                        ),
                      },
                    ]
                  : undefined
              }
            />
          </div>
        </div>
        {bar(orientation)}
      </div>

      {/* Le verdict du coup affiché. */}
      <div className="mx-3 mt-1 min-h-[3.25rem] rounded-xl bg-[#262522] px-3 py-2 ring-1 ring-white/10">
        <AnimatePresence mode="wait">
          <motion.div
            key={ply}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2"
          >
            {verdict && last ? (
              <>
                <ClassIcon cls={verdict.cls} className="size-6" />
                <div className="min-w-0 grow">
                  <p className="text-sm font-extrabold" style={{ color: CLASS_COLORS[verdict.cls] }}>
                    {t.verdict[verdict.cls](last.san)}
                  </p>
                  {bestSan && (
                    <p className="text-xs text-ivory-dim/75">
                      {t.bestWas} <span className="font-bold text-[#81b64c]">{bestSan}</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="grow text-sm text-ivory-dim/75">{ply === 0 ? t.startPosition : ""}</p>
            )}
            {score !== null && (
              <span
                className={`rounded-md px-2 py-0.5 text-sm font-extrabold tabular-nums ${
                  score >= 0
                    ? "bg-[#f0efea] text-[#262522]"
                    : "bg-[#1f1e1b] text-ivory ring-1 ring-white/15"
                }`}
              >
                {formatEval(score)}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ol
        ref={listRef}
        className="mx-3 mt-2 min-h-0 grow overflow-y-auto rounded-xl bg-[#262522] py-1 text-sm ring-1 ring-white/10"
      >
        {rows.map((i) => (
          <li
            key={i}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center px-2 even:bg-white/[0.03]"
          >
            <span className="text-ivory-dim/45">{i / 2 + 1}.</span>
            {[i, i + 1].map((j) =>
              j < total ? (
                <button
                  key={j}
                  type="button"
                  data-current={ply === j + 1 ? "" : undefined}
                  onClick={() => onSelect(j + 1)}
                  className={`my-0.5 flex items-center gap-1 justify-self-start rounded px-1.5 py-0.5 font-semibold ${
                    ply === j + 1 ? "bg-white/20 text-ivory" : "text-ivory-dim/80"
                  }`}
                >
                  {review && <ClassIcon cls={review.plies[j].cls} className="size-3.5" />}
                  <San san={replayed.plies[j].san} color={replayed.plies[j].color} />
                </button>
              ) : (
                <span key={j} />
              ),
            )}
          </li>
        ))}
        <li className="px-3 py-2 text-center text-sm font-extrabold text-ivory-dim/80">
          {result} · {all.over.by[game.termination]}
        </li>
      </ol>
    </>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-12 flex-1 place-items-center rounded-xl bg-[#262522] text-ivory-dim/85 active:bg-[#3c3a36] disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
