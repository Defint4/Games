"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import { TransitionOverlay } from "@/components/Loading";
import { LookPrefs } from "@/components/SettingsSheet";
import { Sheet } from "@/components/Sheet";
import SoundToggle from "@/components/SoundToggle";
import { GearIcon } from "@/components/TableFrame";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/duration";
import { tr, useLang, useT } from "@/lib/i18n";
import type { StoredProfile } from "@/lib/identity";
import { isMaintenanceError, maintenanceBlocks, showMaintenanceNotice } from "@/lib/maintenance";
import { sfx, vibrate } from "@/lib/sound";
import { COMMON } from "@/lib/texts";
import {
  abandonGame,
  currentKey,
  finishGame,
  forgetMoves,
  newDeal,
  saveMoves,
  type Deal,
  type Victory,
} from "./api";
import Board from "./Board";
import {
  allRevealed,
  apply,
  deal as dealState,
  finishingMoves,
  isWon,
  rank,
  type State,
} from "./engine";
import { T } from "./i18n";
import type { Geometry } from "./layout";
import { GAME } from "./meta";
import Rules from "./Rules";
import WinCascade from "./WinCascade";

/* Une partie de Solitaire : le plateau, le chrono (celui du serveur), l'annulation, la
   fin automatique et la victoire. Les coups sont gardés sur l'appareil à chaque geste ;
   à la victoire, ils partent au serveur qui les rejoue avant de compter la partie. */

type Played = { history: State[]; moves: string[] };

/* idle : on joue ; auto : la partie est gagnée d'avance, les cartes montent seules ;
   won : toutes les cartes sont sur les fondations. */
type Phase = "idle" | "auto" | "won";

const AUTO_STEP = 95;

function replayMoves(deck: string, moves: string[]): Played {
  let state = dealState(deck);
  const history = [state];
  const kept: string[] = [];
  for (const move of moves) {
    const next = apply(state, move);
    if (!next) break;
    state = next;
    history.push(next);
    kept.push(move);
  }
  return { history, moves: kept };
}

export default function Game({
  deal,
  initialMoves,
  profile,
}: {
  deal: Deal;
  initialMoves: string[];
  profile: StoredProfile;
}) {
  const t = useT(T);
  const common = useT(COMMON);
  const lang = useLang();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [played, setPlayed] = useState<Played>(() => replayMoves(deal.deck, initialMoves));
  const state = played.history[played.history.length - 1];
  const [dealing, setDealing] = useState(initialMoves.length === 0);
  const [phase, setPhase] = useState<Phase>(() => (isWon(state) ? "won" : "idle"));
  const [geo, setGeo] = useState<{ g: Geometry; board: DOMRect } | null>(null);
  const [sheet, setSheet] = useState<null | "menu" | "rules" | "deal" | "abandon">(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le chrono part de l'heure du serveur, recalée sur l'horloge de l'appareil.
  const startedAt = deal.receivedAt - deal.elapsed_ms;
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);

  useEffect(() => {
    saveMoves(deal.id, played.moves);
  }, [deal.id, played.moves]);

  // --- Coups -------------------------------------------------------------------

  const play = useCallback(
    (move: string): boolean => {
      const next = apply(state, move);
      if (!next) return false;
      setPlayed((p) => ({ history: [...p.history, next], moves: [...p.moves, move] }));
      playSound(state, next, move);
      return true;
    },
    [state],
  );

  const undo = () => {
    if (played.moves.length === 0 || phase !== "idle") return;
    sfx.pickup();
    setPlayed((p) => ({ history: p.history.slice(0, -1), moves: p.moves.slice(0, -1) }));
  };

  // --- Victoire ----------------------------------------------------------------

  const finish = useMutation({
    mutationFn: (moves: string[]) => finishGame(profile.token, deal.id, moves),
    // La donne reste en cache pour cette page (le panneau de victoire l'affiche encore) ;
    // l'accueil la relit au serveur, qui la sait fermée.
    onSuccess: () => {
      forgetMoves();
      void queryClient.invalidateQueries({ queryKey: ["me", profile.pseudo] });
    },
  });
  const submit = finish.mutate;

  // Plus aucune carte cachée : la partie est gagnée d'avance, le chrono s'arrête et les
  // cartes montent seules.
  useEffect(() => {
    if (phase !== "idle" || dealing || !allRevealed(state)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoppedAt(Date.now());
    setPhase(isWon(state) ? "won" : "auto");
  }, [phase, dealing, state]);

  useEffect(() => {
    if (phase !== "auto") return;
    // Tous les coups de la fin partent au serveur tout de suite : l'animation ne compte
    // pas dans le temps.
    const rest = finishingMoves(state);
    submit([...played.moves, ...rest]);
    const states: State[] = [];
    rest.reduce((current, move) => {
      const next = apply(current, move)!;
      states.push(next);
      return next;
    }, state);
    const timers = rest.map((move, i) =>
      setTimeout(() => {
        playSound(i ? states[i - 1] : state, states[i], move);
        setPlayed((p) => ({ history: [...p.history, states[i]], moves: [...p.moves, move] }));
      }, i * AUTO_STEP),
    );
    timers.push(setTimeout(() => setPhase("won"), rest.length * AUTO_STEP + 350));
    return () => timers.forEach(clearTimeout);
    // Lancé une fois, à l'entrée en phase auto : l'état qui avance ensuite est le sien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "won") return;
    sfx.win();
    vibrate([30, 60, 30]);
    // Partie reprise déjà gagnée (envoi précédent perdu en route) : on renvoie.
    if (finish.isIdle) submit(played.moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // --- Donne, abandon ------------------------------------------------------------

  const fail = (e: unknown) => {
    setLeaving(null);
    if (isMaintenanceError(e)) showMaintenanceNotice();
    else setError(e instanceof ApiError ? e.message : tr(T).home.unreachable);
  };
  // Nouvelle donne = nouvelle partie : refusée pendant une maintenance (la donne en
  // cours, elle, reste jouable).
  const dealAgain = () => {
    if (maintenanceBlocks()) setSheet(null);
    else redeal.mutate();
  };

  const redeal = useMutation({
    mutationFn: () => newDeal(profile.token),
    onMutate: () => {
      setSheet(null);
      setError(null);
      setLeaving(tr(T).home.dealing);
    },
    onSuccess: (next) => {
      forgetMoves();
      void queryClient.invalidateQueries({ queryKey: ["me", profile.pseudo] });
      // La page remonte une nouvelle partie (clé = id de la donne).
      queryClient.setQueryData(currentKey(profile.pseudo), next);
    },
    onError: fail,
  });

  const abandon = useMutation({
    mutationFn: () => abandonGame(profile.token, deal.id),
    onMutate: () => {
      setSheet(null);
      setLeaving(common.wait);
    },
    onSuccess: () => {
      forgetMoves();
      void queryClient.invalidateQueries({ queryKey: ["me", profile.pseudo] });
      router.push(GAME.path);
    },
    onError: fail,
  });

  const newGame = () => {
    // Partie gagnée : rien à perdre, on redonne directement.
    if (phase === "won" || phase === "auto") dealAgain();
    else if (!maintenanceBlocks()) setSheet("deal");
  };

  const onDealt = useCallback(() => setDealing(false), []);
  const onGeometry = useCallback((g: Geometry, board: DOMRect) => setGeo({ g, board }), []);

  const busy = leaving !== null;

  return (
    <main className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden">
      <header className="flex items-center justify-between px-3 pb-1 pt-2">
        <Link
          href={GAME.path}
          aria-label={t.play.back}
          className="rounded-full bg-black/25 p-2.5 text-ivory-dim ring-1 ring-white/10 active:scale-90"
        >
          <BackIcon />
        </Link>
        <div className="text-center">
          <p className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">
            <Timer
              startedAt={startedAt}
              stoppedAt={stoppedAt}
              finalMs={finish.data?.duration_ms ?? null}
              tenths={finish.isSuccess}
            />
          </p>
          <p className="mt-1 text-xs text-ivory-dim/60 tabular-nums">
            {t.play.moves(played.moves.length)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet("menu")}
          aria-label={common.settings}
          className="rounded-full bg-black/25 p-2.5 text-ivory-dim ring-1 ring-white/10 active:scale-90"
        >
          <GearIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        <Board
          deck={deal.deck}
          state={state}
          dealing={dealing}
          interactive={!dealing && phase === "idle" && !busy}
          onMove={play}
          onDealt={onDealt}
          onGeometry={onGeometry}
        />
      </div>

      <footer className="flex items-center justify-between gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={newGame}
          disabled={busy || dealing}
          className="flex items-center gap-2 rounded-2xl bg-black/25 px-4 py-3 text-sm font-bold text-ivory-dim ring-1 ring-white/10 enabled:active:translate-y-0.5 disabled:opacity-40"
        >
          <DealIcon />
          {t.play.newDeal}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={played.moves.length === 0 || phase !== "idle" || dealing || busy}
          className="flex items-center gap-2 rounded-2xl bg-felt-600 px-5 py-3 font-extrabold ring-1 ring-white/15 enabled:active:translate-y-0.5 disabled:opacity-40"
        >
          <UndoIcon />
          {t.play.undo}
        </button>
      </footer>

      {phase === "won" && geo && <WinCascade state={state} g={geo.g} board={geo.board} />}

      <AnimatePresence>
        {phase === "won" && (
          <WinPanel
            key="win"
            victory={finish.data ?? null}
            pending={finish.isPending}
            failed={finish.isError ? errorText(finish.error) : null}
            moves={played.moves.length}
            onRetry={() => finish.mutate(played.moves)}
            onAgain={dealAgain}
            busy={busy}
          />
        )}
      </AnimatePresence>

      {sheet === "menu" && (
        <Sheet onClose={() => setSheet(null)}>
          <h2 className="mb-4 text-center text-lg font-extrabold">{GAME.name[lang]}</h2>
          <div className="flex flex-col gap-3">
            <LangSwitch />
            <SoundToggle />
            <LookPrefs />
            <button
              type="button"
              onClick={() => setSheet("rules")}
              className="rounded-2xl bg-black/25 p-4 text-left font-bold ring-1 ring-white/10"
            >
              {t.play.rules}
            </button>
            {phase === "idle" && (
              <button
                type="button"
                onClick={() => setSheet("abandon")}
                className="rounded-2xl bg-card-red/90 p-4 font-extrabold text-ivory ring-1 ring-white/10 active:translate-y-0.5"
              >
                {t.play.abandon}
              </button>
            )}
            <p className="text-center text-sm text-ivory-dim/70">{t.play.openNote}</p>
          </div>
        </Sheet>
      )}
      {sheet === "rules" && (
        <Sheet onClose={() => setSheet(null)}>
          <Rules />
        </Sheet>
      )}
      {sheet === "deal" && (
        <Confirm
          title={t.confirm.dealTitle}
          body={t.confirm.dealBody}
          action={t.confirm.deal}
          keep={t.confirm.keep}
          onConfirm={dealAgain}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "abandon" && (
        <Confirm
          title={t.confirm.abandonTitle}
          body={t.confirm.abandonBody}
          action={t.confirm.abandon}
          keep={t.confirm.keep}
          danger
          onConfirm={() => abandon.mutate()}
          onClose={() => setSheet(null)}
        />
      )}

      {error && (
        <p
          role="alert"
          onClick={() => setError(null)}
          className="fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-50 rounded-xl bg-card-red px-4 py-3 text-center font-bold text-ivory shadow-card"
        >
          {error}
        </p>
      )}
      <TransitionOverlay label={leaving} />
    </main>
  );
}

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : tr(T).win.failed;
}

/* Le bruit d'un coup : carte posée, note montante sur les fondations, carte retournée
   au talon ou découverte dans une colonne. */
function playSound(before: State, after: State, move: string) {
  if (move === "d") {
    if (before.stock.length) sfx.flip();
    else sfx.pickup();
    return;
  }
  const [src, rest] = move.split(">");
  const dst = rest.split(":")[0];
  sfx.play();
  if (dst[0] === "f") {
    const pile = after.foundations[Number(dst[1])];
    sfx.chime(rank(pile[pile.length - 1]) - 1);
  }
  if (src[0] === "t") {
    const column = after.tableau[Number(src[1])];
    const top = column[column.length - 1];
    const was = before.tableau[Number(src[1])][column.length - 1];
    if (top && was && !was.up) setTimeout(() => sfx.flip(), 140);
  }
}

function Confirm({
  title,
  body,
  action,
  keep,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  action: string;
  keep: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-center text-lg font-extrabold">{title}</h2>
      <p className="mt-2 text-center text-sm text-ivory-dim/80">{body}</p>
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-2xl p-4 font-extrabold active:translate-y-0.5 ${
            danger ? "bg-card-red/90 text-ivory" : "bg-gold text-ink"
          }`}
        >
          {action}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl bg-black/25 p-4 font-bold ring-1 ring-white/10 active:translate-y-0.5"
        >
          {keep}
        </button>
      </div>
    </Sheet>
  );
}

function WinPanel({
  victory,
  pending,
  failed,
  moves,
  onRetry,
  onAgain,
  busy,
}: {
  victory: Victory | null;
  pending: boolean;
  failed: string | null;
  moves: number;
  onRetry: () => void;
  onAgain: () => void;
  busy: boolean;
}) {
  const t = useT(T).win;
  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.9 }}
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-3xl bg-felt-800/95 p-5 text-center shadow-card ring-1 ring-gold/50 backdrop-blur">
        <p className="font-script text-4xl leading-none text-gold">{t.title}</p>
        {victory ? (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-ivory-dim/60">
              {t.time}
            </p>
            <p className="text-4xl font-extrabold tabular-nums">
              {formatDuration(victory.duration_ms, true)}
            </p>
            <p className="mt-1 text-sm text-ivory-dim/70">{t.moves(moves)}</p>
            {victory.record ? (
              <motion.p
                className="mt-2 inline-block rounded-full bg-gold px-3 py-1 text-sm font-extrabold text-ink"
                initial={{ scale: 0.4, rotate: -8 }}
                animate={{ scale: 1, rotate: -2 }}
                transition={{ type: "spring", stiffness: 380, damping: 14, delay: 1.3 }}
              >
                {t.record}
              </motion.p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-gold/90">
                {t.best(formatDuration(victory.best_ms, true))}
              </p>
            )}
          </>
        ) : failed ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <p className="text-sm text-card-red">{failed}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-felt-600 px-5 py-2 font-bold ring-1 ring-white/15 active:translate-y-0.5"
            >
              {t.retry}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ivory-dim/75">{pending ? t.checking : ""}</p>
        )}
        <div className="mt-5 flex gap-3">
          <Link
            href={GAME.path}
            className="flex-1 rounded-2xl bg-black/25 py-3 font-bold ring-1 ring-white/10 active:translate-y-0.5"
          >
            {t.home}
          </Link>
          <button
            type="button"
            onClick={onAgain}
            disabled={busy || pending}
            className="flex-[1.4] rounded-2xl bg-gold py-3 font-extrabold text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40"
          >
            {t.again}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-[2.5]" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-[2.5]" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function DealIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2" aria-hidden>
      <rect x="3" y="6" width="10" height="14" rx="1.5" transform="rotate(-8 8 13)" />
      <rect x="10" y="4" width="10" height="14" rx="1.5" transform="rotate(8 15 11)" />
    </svg>
  );
}

/* Le chrono, qui se redessine seul 4 fois par seconde : à l'intérieur de Game, il
   redessinait toute la table (et le glisser-déposer en cours) à chaque tic. */
function Timer({
  startedAt,
  stoppedAt,
  finalMs,
  tenths,
}: {
  startedAt: number;
  stoppedAt: number | null;
  /* Le temps retenu par le serveur, une fois la victoire validée. */
  finalMs: number | null;
  tenths: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stoppedAt !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [stoppedAt]);
  return <>{formatDuration(finalMs ?? (stoppedAt ?? now) - startedAt, tenths)}</>;
}
