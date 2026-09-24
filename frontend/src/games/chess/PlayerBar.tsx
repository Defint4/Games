"use client";

import type { Color, PieceSymbol } from "chess.js";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { sfx } from "@/lib/sound";
import { useChessPrefs } from "./prefs";
import { pieceUrl } from "./themes";
import { signed } from "./ui";

/* La fiche d'un joueur au-dessus ou au-dessous de l'échiquier, comme sur chess.com :
   avatar, pseudo, Elo, pièces prises avec l'avance matérielle, pendule à droite. */

export default function PlayerBar({
  pseudo,
  avatar,
  rating,
  delta,
  color,
  captured,
  advantage,
  clock,
  connected = true,
  badge,
}: {
  pseudo: string;
  avatar: string;
  rating: number | null;
  delta?: number | null;
  color: Color;
  /* Pièces adverses prises par ce joueur. */
  captured: PieceSymbol[];
  /* Avance matérielle de ce joueur (0 s'il ne mène pas). */
  advantage: number;
  clock?: React.ReactNode;
  connected?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex h-12 items-center gap-2 px-2">
      <Avatar id={avatar} size="md" dimmed={!connected} />
      <div className="min-w-0 grow">
        <p className="flex items-baseline gap-1.5 truncate text-sm font-bold leading-tight">
          <span className="truncate">{pseudo}</span>
          {rating !== null && (
            <span className="shrink-0 font-semibold text-ivory-dim/60">({rating})</span>
          )}
          {delta != null && (
            <span
              className={`shrink-0 text-xs font-extrabold ${
                delta > 0 ? "text-[#81b64c]" : delta < 0 ? "text-card-red" : "text-ivory-dim/60"
              }`}
            >
              {signed(delta)}
            </span>
          )}
          {badge}
        </p>
        <Captured pieces={captured} color={color === "w" ? "b" : "w"} advantage={advantage} />
      </div>
      {clock}
    </div>
  );
}

/* Pièces prises, groupées par type et serrées comme sur chess.com, puis « +N ». */
function Captured({
  pieces,
  color,
  advantage,
}: {
  pieces: PieceSymbol[];
  color: Color;
  advantage: number;
}) {
  const { pieces: set } = useChessPrefs();
  const groups: PieceSymbol[][] = [];
  for (const p of pieces) {
    const last = groups[groups.length - 1];
    if (last && last[0] === p) last.push(p);
    else groups.push([p]);
  }
  return (
    <div className="flex h-4 items-center gap-1">
      {groups.map((group, i) => (
        <span key={i} className="flex">
          {group.map((p, j) => (
            <span
              key={j}
              className="-mr-2 size-4 bg-cover last:mr-0"
              style={{ backgroundImage: `url(${pieceUrl(set, color, p)})` }}
            />
          ))}
        </span>
      ))}
      {advantage > 0 && (
        <span className="text-xs font-semibold text-ivory-dim/70">+{advantage}</span>
      )}
    </div>
  );
}

function format(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return `0:0${s.toFixed(1)}`;
  if (s < 20) return `0:${s.toFixed(1)}`;
  const whole = Math.ceil(s);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/* La pendule, comme sur chess.com : claire pour les blancs, sombre pour les noirs, pleine
   quand elle tourne, rouge sous les vingt dernières secondes, un tic à dix secondes.
   `seconds` est le temps restant à la réception de la vue : le parent remonte la pendule
   (clé) à chaque nouvelle vue, le décompte part de son montage. */
export function Clock({
  seconds,
  running,
  color,
}: {
  seconds: number;
  running: boolean;
  color: Color;
}) {
  const [start] = useState(() => performance.now());
  const [now, setNow] = useState(start);
  const ticked = useRef(seconds < 10);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const loop = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const left = running ? seconds - (now - start) / 1000 : seconds;
  const low = left < 20;

  useEffect(() => {
    if (running && left < 10 && !ticked.current) {
      ticked.current = true;
      sfx.tick();
    }
  }, [running, left]);

  const face =
    low && running
      ? "bg-[#d64541] text-ivory"
      : color === "w"
        ? "bg-[#f0efea] text-[#262522]"
        : "bg-[#1f1e1b] text-ivory ring-1 ring-white/10";
  return (
    <div
      className={`flex h-10 min-w-[6.5rem] items-center justify-end gap-2 rounded-md px-3 text-2xl font-bold tabular-nums transition-[opacity,background-color] ${face} ${
        running ? "opacity-100 shadow-card" : "opacity-70"
      }`}
    >
      {running && (
        <svg
          viewBox="0 0 24 24"
          className="size-4 animate-spin fill-none stroke-current stroke-[2.5] [animation-duration:4s]"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" opacity="0.35" />
          <path strokeLinecap="round" d="M12 12V6" />
        </svg>
      )}
      {format(left)}
    </div>
  );
}
