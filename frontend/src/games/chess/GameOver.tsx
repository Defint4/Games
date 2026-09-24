"use client";

import { motion } from "motion/react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useT } from "@/lib/i18n";
import { T } from "./i18n";
import { GAME, reviewPath } from "./meta";
import type { ChessSocket } from "./socket";
import type { PlayerView, RoomView } from "./types";
import { PRIMARY, SECONDARY, signed } from "./ui";

/* La fin de partie, comme la fenêtre de chess.com : le verdict et sa raison, les deux
   joueurs avec leur nouvel Elo, puis le bilan, la revanche (d'un commun accord) ou une
   nouvelle partie. On la ferme pour regarder l'échiquier. */
export default function GameOver({
  socket,
  view,
  onClose,
}: {
  socket: ChessSocket;
  view: RoomView;
  onClose: () => void;
}) {
  const t = useT(T).over;
  const me = view.your_seat;
  const opp = 1 - me;
  const aborted = view.termination === "aborted";
  const won = view.winner === me;
  const title = aborted ? t.aborted : view.winner === null ? t.draw : won ? t.youWon : t.youLost;
  const opponent = view.players[opp];
  const asked = view.rematch_votes.includes(me);
  const theyAsked = view.rematch_votes.includes(opp);
  const saving = !aborted && view.game_id === null;
  const seat = (p: PlayerView, seatIndex: number) => (
    <SeatCard
      avatar={p.avatar}
      pseudo={p.pseudo}
      rating={p.rating}
      delta={p.rating_delta}
      winner={view.winner === seatIndex}
    />
  );

  return (
    <OverCard
      title={title}
      subtitle={view.termination ? t.by[view.termination] : null}
      won={won}
      left={seat(view.players[me], me)}
      right={seat(opponent, opp)}
      onClose={onClose}
    >
      {!aborted && <ReviewLink gameId={view.game_id} saving={saving} />}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => socket.rematch()}
          disabled={asked || !opponent.connected}
          className={`flex-1 py-3 ${theyAsked && !asked ? PRIMARY : SECONDARY}`}
        >
          {asked ? t.rematchSent : theyAsked ? t.acceptRematch : t.rematch}
        </button>
        <Link href={GAME.path} className={`flex-1 py-3 text-center ${SECONDARY}`}>
          {t.newGame}
        </Link>
      </div>
      {theyAsked && !asked && (
        <p className="text-center text-sm font-bold text-[#81b64c]">
          {t.rematchAsked(opponent.pseudo)}
        </p>
      )}
    </OverCard>
  );
}

/* Le bouton du bilan : actif dès que la partie est enregistrée. */
export function ReviewLink({ gameId, saving }: { gameId: string | null; saving: boolean }) {
  const t = useT(T).over;
  return (
    <Link
      href={gameId ? reviewPath(gameId) : "#"}
      aria-disabled={saving}
      className={`py-3.5 text-center text-lg ${PRIMARY} ${saving ? "pointer-events-none opacity-50" : "active:translate-y-0.5"}`}
    >
      {saving ? t.saving : t.review}
    </Link>
  );
}

/* La fenêtre de fin, commune aux parties en ligne et contre l'ordinateur. */
export function OverCard({
  title,
  subtitle,
  won,
  left,
  right,
  onClose,
  children,
}: {
  title: string;
  subtitle: string | null;
  won: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT(T).over;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.5 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.6 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[#262522] shadow-card ring-1 ring-white/10"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full text-ivory-dim/70 active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[2.5]" aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <header
          className={`px-5 pb-4 pt-5 text-center ${
            won ? "bg-gradient-to-b from-[#81b64c]/35 to-transparent" : ""
          }`}
        >
          <h2 className="text-2xl font-extrabold">{title}</h2>
          {subtitle && <p className="text-sm text-ivory-dim/70">{subtitle}</p>}
        </header>

        <div className="flex items-start justify-center gap-6 px-5 pb-5">
          {left}
          <span className="mt-6 text-sm font-bold text-ivory-dim/50">vs</span>
          {right}
        </div>

        <div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export function SeatCard({
  avatar,
  pseudo,
  rating,
  delta = null,
  winner,
}: {
  avatar: string;
  pseudo: string;
  rating: number | null;
  delta?: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center">
      <span className={`rounded-full p-0.5 ${winner ? "bg-[#81b64c]" : "bg-transparent"}`}>
        <Avatar id={avatar} size="lg" />
      </span>
      <p className="w-full truncate text-sm font-bold">{pseudo}</p>
      {rating !== null && (
        <p className="text-xs tabular-nums text-ivory-dim/70">
          {rating}
          {delta !== null && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`ml-1 font-extrabold ${
                delta > 0 ? "text-[#81b64c]" : delta < 0 ? "text-card-red" : ""
              }`}
            >
              {signed(delta)}
            </motion.span>
          )}
        </p>
      )}
    </div>
  );
}
