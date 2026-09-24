"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TableReactions from "@/components/TableReactions";
import { Sheet } from "@/components/Sheet";
import { EMOTES } from "@/lib/emotes";
import { useT } from "@/lib/i18n";
import { sfx, vibrate } from "@/lib/sound";
import Board from "./Board";
import {
  capturedBy,
  fenAt,
  kingInCheck,
  legalDests,
  materialBalance,
  premoveDests,
  premoveUci,
  replay,
} from "./game";
import GameOver from "./GameOver";
import { T } from "./i18n";
import MoveStrip from "./MoveList";
import PlayerBar, { Clock } from "./PlayerBar";
import type { ChessSocket } from "./socket";
import { playSound } from "./sounds";
import type { RoomView } from "./types";
import { SECONDARY } from "./ui";
import ActionButton from "./ActionButton";

/* Une partie en ligne, disposée comme sur chess.com mobile : les coups en bandeau, la
   fiche de l'adversaire, l'échiquier, la sienne, puis la barre d'actions. Le coup joué
   s'affiche tout de suite (le serveur le confirme dans la foulée, ou le refuse et la
   position revient) ; un prémove part dès que l'adversaire a joué. */

type Premove = { from: Square; to: Square };

export default function Table({ socket, view }: { socket: ChessSocket; view: RoomView }) {
  const t = useT(T).table;
  const me = view.your_seat;
  const opp = 1 - me;
  const myColor: Color = view.white === me ? "w" : "b";
  const playing = view.status === "playing";

  // Coup joué ici, en attente de la confirmation du serveur.
  const [pending, setPending] = useState<{ uci: string; base: number } | null>(null);
  const moves =
    pending && view.moves.length === pending.base ? [...view.moves, pending.uci] : view.moves;
  const key = moves.join(" ");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const game = useMemo(() => replay(moves), [key]);
  const total = game.plies.length;

  // Relecture d'un coup passé pendant la partie (null = position en cours).
  const [cursor, setCursor] = useState<number | null>(null);
  const shownPly = cursor ?? total;
  const fen = fenAt(game, shownPly);
  const live = cursor === null;
  const toMove = fen.split(" ")[1] as Color;
  const myTurn = playing && live && toMove === myColor;
  const mode = !playing || !live ? null : myTurn ? "move" : "premove";
  const [premove, setPremove] = useState<Premove | null>(null);

  const dests = useMemo(
    () =>
      mode === "move" ? legalDests(fen) : mode === "premove" ? premoveDests(fen, myColor) : undefined,
    [mode, fen, myColor],
  );
  const lastPly = shownPly > 0 ? game.plies[shownPly - 1] : null;

  // Le serveur a répondu : coup confirmé (la liste s'est allongée) ou refusé (erreur).
  const confirmed = pending !== null && view.moves.length > pending.base;
  if (confirmed) setPending(null);
  const refused = socket.error;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (refused) setPending(null);
  }, [refused]);

  // Sons : un coup de plus (le sien est déjà sonné au moment où on le joue).
  const sounded = useRef(total);
  useEffect(() => {
    if (total > sounded.current && total - sounded.current <= 2) {
      const ply = game.plies[total - 1];
      if (ply.color !== myColor) {
        playSound(ply);
        if (ply.check) vibrate(40);
      }
    }
    sounded.current = total;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
  }, [total, game, myColor]);

  // Temps de réflexion mesuré ici, envoyé avec le coup.
  const turnStart = useRef(0);
  useEffect(() => {
    if (myTurn) turnStart.current = performance.now();
  }, [myTurn]);

  const send = useCallback(
    (uci: string) => {
      const next = replay([...view.moves, uci]).plies.at(-1);
      if (next) playSound(next);
      setPending({ uci, base: view.moves.length });
      socket.move(uci, performance.now() - turnStart.current);
    },
    [socket, view.moves],
  );

  // Au tour suivant, le prémove part s'il est légal ; sinon il s'efface.
  useEffect(() => {
    if (!myTurn || !premove || pending) return;
    const uci = premoveUci(fen, premove.from, premove.to);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPremove(null);
    if (uci) send(uci);
  }, [myTurn, premove, pending, fen, send]);

  const onEvents = socket.onEvents;
  useEffect(() => {
    onEvents((events, next) => {
      for (const e of events) {
        if (e.type === "game_started") sfx.gameStart();
        if (e.type === "draw_offered" && e.seat !== next.your_seat) sfx.pop();
        if (e.type === "rematch_asked" && e.seat !== next.your_seat) sfx.pop();
        if (e.type === "game_over") {
          if (e.termination === "aborted") sfx.nope();
          else if (e.winner === null) sfx.draw();
          else if (e.winner === next.your_seat) sfx.win();
          else sfx.lose();
        }
      }
    });
  }, [onEvents]);

  const [confirmResign, setConfirmResign] = useState(false);
  const [overClosed, setOverClosed] = useState(false);

  const captured = capturedBy(game, shownPly);
  const balance = materialBalance(fen) * (myColor === "w" ? 1 : -1);
  const colorOf = (seat: number): Color => (seat === view.white ? "w" : "b");
  const player = (seat: number) => {
    const p = view.players[seat];
    const color = colorOf(seat);
    const seconds = view.clocks[seat];
    const running = playing && view.clock_running && view.turn === seat;
    return (
      <PlayerBar
        pseudo={p.pseudo}
        avatar={p.avatar}
        rating={p.rating}
        delta={p.rating_delta}
        color={color}
        captured={captured[color]}
        advantage={Math.max(0, seat === me ? balance : -balance)}
        connected={p.connected}
        badge={<EmoteBubble socket={socket} seat={seat} />}
        clock={
          seconds !== null && seconds !== undefined ? (
            <Clock
              key={`${view.moves.length}-${seconds}-${view.status}`}
              seconds={seconds}
              running={running}
              color={color}
            />
          ) : undefined
        }
      />
    );
  };

  const offer = view.draw_offer;
  const opponent = view.players[opp];

  return (
    <div className="relative flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="pr-14 pt-2">
        <MoveStrip plies={game.plies} current={shownPly} onSelect={(p) => setCursor(p === total ? null : p)} />
      </div>

      <div className="flex min-h-0 grow flex-col items-center justify-center">
        <div className="relative w-full" style={{ maxWidth: "min(100%, calc(100dvh - 15.5rem))" }}>
          <FirstMoveBanner view={view} myTurn={myTurn} />
          {player(opp)}
          {playing && !opponent.connected && (
            <p className="px-2 pb-1 text-xs font-semibold text-card-red">
              {t.disconnected(opponent.pseudo)}
            </p>
          )}
          <div className="relative">
            <Board
              fen={fen}
              orientation={myColor}
              lastMove={lastPly ? { from: lastPly.from, to: lastPly.to } : null}
              check={kingInCheck(fen)}
              mode={mode}
              dests={dests}
              onMove={(from: Square, to: Square, promotion?: PieceSymbol) =>
                send(`${from}${to}${promotion ?? ""}`)
              }
              premove={premove}
              onPremove={setPremove}
            />
          </div>
          {player(me)}
        </div>
      </div>

      {/* Par-dessus le bas de l'écran, sans pousser l'échiquier. */}
      <AnimatePresence>
        {playing && offer === opp && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-xl bg-[#3c3a36] p-2 pl-3 shadow-card ring-1 ring-white/10"
          >
            <span className="grow text-sm font-bold">½ {t.drawOffered(opponent.pseudo)}</span>
            <button
              type="button"
              onClick={() => socket.declineDraw()}
              className="rounded-lg bg-black/30 px-3 py-1.5 text-sm font-bold"
            >
              {t.decline}
            </button>
            <button
              type="button"
              onClick={() => socket.acceptDraw()}
              className="rounded-lg bg-[#81b64c] px-3 py-1.5 text-sm font-extrabold text-white"
            >
              {t.accept}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="flex items-stretch gap-1.5 px-3 pb-3 pt-1">
        {playing ? (
          view.can_abort ? (
            <ActionButton onClick={() => socket.abort()} label={t.abort}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </ActionButton>
          ) : (
            <ActionButton onClick={() => setConfirmResign(true)} label={t.resign}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 21V4m0 0h11l-2.5 4L17 12H6" />
            </ActionButton>
          )
        ) : (
          <ActionButton onClick={() => setOverClosed(false)} label={t.result}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          </ActionButton>
        )}
        <ActionButton
          onClick={() => socket.offerDraw()}
          label={offer === me ? t.drawSent : t.draw}
          disabled={!playing || view.can_abort || offer === me}
        >
          <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="800" className="fill-current stroke-none">
            ½
          </text>
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

      {playing && offer !== opp && (
        <TableReactions socket={socket} view={view} className="bottom-20" />
      )}

      {confirmResign && (
        <Sheet onClose={() => setConfirmResign(false)}>
          <h2 className="mb-4 text-center text-lg font-extrabold">{t.confirmResign}</h2>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmResign(false);
                socket.resign();
              }}
              className="rounded-xl bg-card-red py-3.5 font-extrabold text-ivory"
            >
              {t.confirmResignYes}
            </button>
            <button type="button" onClick={() => setConfirmResign(false)} className={`py-3.5 ${SECONDARY}`}>
              {t.keepPlaying}
            </button>
          </div>
        </Sheet>
      )}

      {view.status === "finished" && !overClosed && (
        <GameOver socket={socket} view={view} onClose={() => setOverClosed(true)} />
      )}
    </div>
  );
}

/* Avant les pendules : le temps laissé pour jouer le premier coup, sinon la partie est
   annulée. Remonté à chaque vue, il décompte depuis la valeur du serveur. */
function FirstMoveBanner({ view, myTurn }: { view: RoomView; myTurn: boolean }) {
  const t = useT(T).table;
  const seconds = view.first_move_remaining;
  if (seconds === null || view.status !== "playing") return null;
  return (
    <Countdown key={`${view.moves.length}-${seconds}`} seconds={seconds}>
      {(left) => (
        <p
          className={`pointer-events-none absolute inset-x-3 bottom-full z-30 mb-3 rounded-xl px-3 py-2 text-center text-sm font-bold shadow-card ${
            myTurn ? "bg-[#81b64c] text-white" : "bg-black/70 text-ivory"
          }`}
        >
          {myTurn ? t.yourFirstMove(left) : t.theirFirstMove(left)}
        </p>
      )}
    </Countdown>
  );
}

function Countdown({
  seconds,
  children,
}: {
  seconds: number;
  children: (left: number) => React.ReactNode;
}) {
  const [left, setLeft] = useState(Math.ceil(seconds));
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      setLeft(Math.max(0, Math.ceil(seconds - (performance.now() - start) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return <>{children(left)}</>;
}

/* L'emote d'un joueur, un instant à côté de son nom. */
function EmoteBubble({ socket, seat }: { socket: ChessSocket; seat: number }) {
  const emote = socket.emotes.findLast((e) => e.seat === seat);
  return (
    <AnimatePresence>
      {emote && (
        <motion.span
          key={emote.id}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-base leading-none"
        >
          {EMOTES[emote.emote] ?? emote.emote}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
