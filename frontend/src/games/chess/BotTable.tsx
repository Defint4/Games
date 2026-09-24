"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Color, PieceSymbol, Square } from "chess.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";
import type { StoredProfile } from "@/lib/identity";
import { sfx, vibrate } from "@/lib/sound";
import ActionButton from "./ActionButton";
import { saveBotGame } from "./api";
import Board, { type Arrow } from "./Board";
import { botMove, levelOf, search } from "./bot";
import {
  botTiming,
  canTakeBack,
  clocksRunning,
  newBotGame,
  playMove,
  remaining,
  resign,
  storeBotGame,
  takeBack,
  timeout,
  toMove,
  type BotGame,
} from "./botGame";
import { engine } from "./engine";
import {
  capturedBy,
  fenAt,
  kingInCheck,
  legalDests,
  materialBalance,
  parseUci,
  premoveDests,
  premoveUci,
  replay,
} from "./game";
import { OverCard, ReviewLink, SeatCard } from "./GameOver";
import { T } from "./i18n";
import { GAME } from "./meta";
import MoveStrip from "./MoveList";
import PlayerBar, { Clock } from "./PlayerBar";
import { playSound } from "./sounds";
import { PRIMARY, SECONDARY } from "./ui";

/* Une partie contre l'ordinateur, disposée comme en ligne. L'ordinateur réfléchit dans
   le navigateur (Stockfish) et prend un temps de réflexion humain ; on peut lui
   demander un indice ou reprendre son coup, comme contre les bots de chess.com. */

const BOT_AVATAR = "robot-0";
const HINT_COLOR = "rgba(129, 182, 76, 0.9)";

type Premove = { from: Square; to: Square };

export default function BotTable({
  initial,
  profile,
}: {
  initial: BotGame;
  profile: StoredProfile;
}) {
  const all = useT(T);
  const t = { ...all.table, ...all.bot };
  const queryClient = useQueryClient();
  const [game, setGame] = useState(initial);
  const gameRef = useRef(initial);
  // L'heure de la dernière mise à jour : les pendules décomptent à partir de là.
  const [stamp, setStamp] = useState(() => Date.now());
  const update = useCallback((next: BotGame) => {
    gameRef.current = next;
    storeBotGame(next);
    setGame(next);
    setStamp(Date.now());
  }, []);

  const myColor = game.color;
  const botColor: Color = myColor === "w" ? "b" : "w";
  const over = game.over !== null;
  const replayed = useMemo(() => replay(game.moves), [game.moves]);
  const total = replayed.plies.length;
  const [cursor, setCursor] = useState<number | null>(null);
  const shownPly = cursor ?? total;
  const fen = fenAt(replayed, shownPly);
  const live = cursor === null;
  const myTurn = !over && live && toMove(game) === myColor;
  const mode = over || !live ? null : myTurn ? "move" : "premove";
  const [premove, setPremove] = useState<Premove | null>(null);
  const [hint, setHint] = useState<Arrow | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [overClosed, setOverClosed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const dests = useMemo(
    () =>
      mode === "move" ? legalDests(fen) : mode === "premove" ? premoveDests(fen, myColor) : undefined,
    [mode, fen, myColor],
  );
  const lastPly = shownPly > 0 ? replayed.plies[shownPly - 1] : null;

  // Chaque nouveau coup ramène à la position en cours et efface l'indice.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    setHint(null);
  }, [total]);

  // Début de partie : le gong, et une table de hachage neuve pour le moteur.
  useEffect(() => {
    if (initial.moves.length === 0) {
      engine().newGame();
      sfx.gameStart();
    }
  }, [initial]);

  const play = useCallback(
    (uci: string) => {
      const current = gameRef.current;
      if (current.over) return;
      const next = playMove(current, uci, Date.now());
      const ply = replay(next.moves).plies.at(-1);
      if (ply && next.moves.length > current.moves.length) playSound(ply);
      update(next);
    },
    [update],
  );

  // L'ordinateur joue quand c'est son tour. `generation` écarte un coup calculé pour une
  // position qui n'existe plus (coup repris, partie relancée, écran quitté).
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    const current = gameRef.current;
    if (current.over || toMove(current) !== botColor) return;
    const token = generation.current;
    const expected = current.moves.length;
    const { searchMs, delayMs } = botTiming(current, Date.now());
    const started = performance.now();
    const position = fenAt(replay(current.moves), expected);
    void engine()
      .run((uci) => botMove(uci, position, current.elo, { movetime: searchMs }))
      .then(async (uci) => {
        const wait = delayMs - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const now = gameRef.current;
        if (generation.current !== token || now.over || now.moves.length !== expected) return;
        play(uci);
        if (replay([...now.moves, uci]).plies.at(-1)?.check) vibrate(40);
      });
    return () => {
      generation.current += 1;
    };
  }, [game.moves.length, game.over, botColor, play]);

  // Le prémove part dès que l'ordinateur a joué, s'il est encore légal.
  useEffect(() => {
    if (!myTurn || !premove) return;
    const uci = premoveUci(fen, premove.from, premove.to);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPremove(null);
    if (uci) play(uci);
  }, [myTurn, premove, fen, play]);

  // Pendules : on guette la chute du drapeau, des deux côtés.
  useEffect(() => {
    if (!clocksRunning(game)) return;
    const timer = setInterval(() => {
      const flagged = timeout(gameRef.current, Date.now());
      if (flagged) update(flagged);
    }, 200);
    return () => clearInterval(timer);
  }, [game, update]);

  // Fin de partie : le son, puis l'enregistrement pour l'historique et le bilan.
  const wasOver = useRef(over);
  useEffect(() => {
    if (!game.over || wasOver.current) return;
    wasOver.current = true;
    const { result } = game.over;
    if (result === "1/2-1/2") sfx.draw();
    else if ((result === "1-0") === (game.color === "w")) sfx.win();
    else sfx.lose();
  }, [game.over, game.color]);

  // Un seul envoi à la fois : la partie ne doit pas finir deux fois dans l'historique.
  const saving = useRef(false);
  const save = useCallback(() => {
    const current = gameRef.current;
    if (!current.over || current.savedId || current.moves.length < 2 || saving.current) return;
    saving.current = true;
    setSaveFailed(false);
    saveBotGame(profile.token, current)
      .then((saved) => {
        update({ ...gameRef.current, savedId: saved.id });
        void queryClient.invalidateQueries({ queryKey: ["chess-games", profile.pseudo] });
      })
      .catch(() => setSaveFailed(true))
      .finally(() => {
        saving.current = false;
      });
  }, [profile, update, queryClient]);
  useEffect(() => {
    if (game.over && !game.savedId) save();
  }, [game.over, game.savedId, save]);

  function askHint() {
    const position = fen;
    void engine()
      .run((uci) => {
        // Le conseil vient du moteur à pleine force, pas du niveau du bot.
        uci.send("setoption name UCI_LimitStrength value false");
        return search(uci, position, "depth 12", 1);
      })
      .then(([best]) => {
        if (!best || gameRef.current.moves.length !== total) return;
        const { from, to } = parseUci(best.move);
        setHint({ from, to, color: HINT_COLOR });
      });
  }

  function restart() {
    const next = newBotGame(game.elo, game.colorChoice, game.timeControl);
    engine().newGame();
    wasOver.current = false;
    setOverClosed(false);
    setPremove(null);
    setSaveFailed(false);
    update(next);
    sfx.gameStart();
  }

  const captured = capturedBy(replayed, shownPly);
  const balance = materialBalance(fen) * (myColor === "w" ? 1 : -1);
  const clockFor = (color: Color) => {
    const seconds = remaining(game, color, stamp);
    if (seconds === null) return undefined;
    return (
      <Clock
        key={`${stamp}-${color}`}
        seconds={Math.max(0, seconds)}
        running={clocksRunning(game) && toMove(game) === color}
        color={color}
      />
    );
  };
  const level = all.bot.levels[levelOf(game.elo)];

  return (
    <div className="relative flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="pr-14 pt-2">
        <MoveStrip
          plies={replayed.plies}
          current={shownPly}
          onSelect={(p) => setCursor(p === total ? null : p)}
        />
      </div>

      <div className="flex min-h-0 grow flex-col items-center justify-center">
        <div className="relative w-full" style={{ maxWidth: "min(100%, calc(100dvh - 15.5rem))" }}>
          <PlayerBar
            pseudo={`${t.computer} · ${level}`}
            avatar={BOT_AVATAR}
            rating={game.elo}
            color={botColor}
            captured={captured[botColor]}
            advantage={Math.max(0, -balance)}
            clock={clockFor(botColor)}
          />
          <Board
            fen={fen}
            orientation={myColor}
            lastMove={lastPly ? { from: lastPly.from, to: lastPly.to } : null}
            check={kingInCheck(fen)}
            mode={mode}
            dests={dests}
            onMove={(from: Square, to: Square, promotion?: PieceSymbol) =>
              play(`${from}${to}${promotion ?? ""}`)
            }
            premove={premove}
            onPremove={setPremove}
            arrows={hint && live ? [hint] : undefined}
          />
          <PlayerBar
            pseudo={profile.pseudo}
            avatar={profile.avatar}
            rating={null}
            color={myColor}
            captured={captured[myColor]}
            advantage={Math.max(0, balance)}
            clock={clockFor(myColor)}
          />
        </div>
      </div>

      <nav className="flex items-stretch gap-1.5 px-3 pb-3 pt-1">
        {over ? (
          <ActionButton onClick={() => setOverClosed(false)} label={t.result}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          </ActionButton>
        ) : game.moves.length < 2 ? (
          <AbortButton label={t.abort} />
        ) : (
          <ActionButton onClick={() => setConfirmResign(true)} label={t.resign}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 21V4m0 0h11l-2.5 4L17 12H6" />
          </ActionButton>
        )}
        <ActionButton onClick={askHint} label={t.hint} disabled={!myTurn}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
        </ActionButton>
        <ActionButton
          onClick={() => {
            setPremove(null);
            update(takeBack(game, Date.now()));
          }}
          label={t.takeBack}
          disabled={!canTakeBack(game)}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </ActionButton>
        <ActionButton
          onClick={() => setCursor(Math.max(0, shownPly - 1))}
          label={t.previous}
          disabled={shownPly === 0}
          iconOnly
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
        </ActionButton>
        <ActionButton
          onClick={() => setCursor(shownPly + 1 >= total ? null : shownPly + 1)}
          label={t.next}
          disabled={live}
          iconOnly
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </ActionButton>
      </nav>

      {confirmResign && (
        <Sheet onClose={() => setConfirmResign(false)}>
          <h2 className="mb-4 text-center text-lg font-extrabold">{t.confirmResign}</h2>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmResign(false);
                update(resign(gameRef.current, Date.now()));
              }}
              className="rounded-xl bg-card-red py-3.5 font-extrabold text-ivory"
            >
              {t.confirmResignYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirmResign(false)}
              className={`py-3.5 ${SECONDARY}`}
            >
              {t.keepPlaying}
            </button>
          </div>
        </Sheet>
      )}

      {game.over && !overClosed && (
        <BotOver
          game={game}
          profile={profile}
          saveFailed={saveFailed}
          onRetry={save}
          onReplay={restart}
          onClose={() => setOverClosed(true)}
        />
      )}
    </div>
  );
}

/* Avant les deux premiers coups, on laisse tomber sans rien enregistrer. */
function AbortButton({ label }: { label: string }) {
  return (
    <Link
      href={GAME.path}
      onClick={() => storeBotGame(null)}
      aria-label={label}
      className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#262522] text-[0.7rem] font-bold text-ivory-dim/85 active:bg-[#3c3a36]"
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" aria-hidden>
        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
      </svg>
      {label}
    </Link>
  );
}

function BotOver({
  game,
  profile,
  saveFailed,
  onRetry,
  onReplay,
  onClose,
}: {
  game: BotGame;
  profile: StoredProfile;
  saveFailed: boolean;
  onRetry: () => void;
  onReplay: () => void;
  onClose: () => void;
}) {
  const all = useT(T);
  const t = all.over;
  const { result, termination } = game.over!;
  const draw = result === "1/2-1/2";
  const won = !draw && (result === "1-0") === (game.color === "w");
  return (
    <OverCard
      title={draw ? t.draw : won ? t.youWon : t.youLost}
      subtitle={t.by[termination]}
      won={won}
      left={<SeatCard avatar={profile.avatar} pseudo={profile.pseudo} rating={null} winner={won} />}
      right={
        <SeatCard
          avatar={BOT_AVATAR}
          pseudo={all.bot.computer}
          rating={game.elo}
          winner={!draw && !won}
        />
      }
      onClose={onClose}
    >
      {saveFailed ? (
        <button type="button" onClick={onRetry} className={`py-3.5 text-lg ${PRIMARY}`}>
          {all.bot.saveFailed} {all.bot.retry}
        </button>
      ) : (
        <ReviewLink gameId={game.savedId} saving={game.savedId === null} />
      )}
      <div className="flex gap-3">
        <button type="button" onClick={onReplay} className={`flex-1 py-3 ${SECONDARY}`}>
          {all.bot.replay}
        </button>
        <Link
          href={GAME.path}
          onClick={() => storeBotGame(null)}
          className={`flex-1 py-3 text-center ${SECONDARY}`}
        >
          {t.newGame}
        </Link>
      </div>
      <p className="text-center text-xs text-ivory-dim/55">{all.bot.unrated}</p>
    </OverCard>
  );
}
