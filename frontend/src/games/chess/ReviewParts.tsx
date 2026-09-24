"use client";

import type { Color } from "chess.js";
import { motion } from "motion/react";
import { MATE } from "./bot";
import { winChance, type Classification, type GameReview } from "./analysis";

/* Les pièces du bilan : pictos de coups aux couleurs de chess.com, barre d'évaluation,
   courbe de la partie. */

export const CLASS_COLORS: Record<Classification, string> = {
  brilliant: "#1baca6",
  great: "#5c8bb0",
  best: "#98bc4b",
  excellent: "#98bc4b",
  good: "#97af8b",
  book: "#a88865",
  inaccuracy: "#f0c15c",
  mistake: "#e6912c",
  miss: "#ee6b55",
  blunder: "#ca3431",
};

const GLYPHS: Partial<Record<Classification, string>> = {
  brilliant: "!!",
  great: "!",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/* Le picto d'un coup : un jeton coloré avec son signe. */
export function ClassIcon({ cls, className = "size-5" }: { cls: Classification; className?: string }) {
  const glyph = GLYPHS[cls];
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0 drop-shadow`} aria-hidden>
      <circle cx="12" cy="12" r="11" fill={CLASS_COLORS[cls]} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      {glyph ? (
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize={glyph.length > 1 ? 11.5 : 14}
          fontWeight="900"
          fill="white"
          fontFamily="system-ui, sans-serif"
        >
          {glyph}
        </text>
      ) : cls === "best" ? (
        <path fill="white" d="m12 5.2 2 4.3 4.6.5-3.4 3.2.9 4.6-4.1-2.3-4.1 2.3.9-4.6-3.4-3.2 4.6-.5z" />
      ) : cls === "excellent" ? (
        <path
          fill="white"
          d="M7 11h2.2v6.5H7zm3.2 6.5V11l2.5-4.2c.4-.6 1.4-.4 1.4.4V10h3c.8 0 1.3.7 1.1 1.4l-1.2 5c-.1.6-.7 1.1-1.3 1.1z"
        />
      ) : cls === "good" ? (
        <path fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="m7.5 12.5 3 3 6-6.5" />
      ) : cls === "book" ? (
        <path
          fill="white"
          d="M6.5 7.5c1.8-.6 3.6-.4 5 .6v9c-1.4-1-3.2-1.2-5-.6zm11 0c-1.8-.6-3.6-.4-5 .6v9c1.4-1 3.2-1.2 5-.6z"
        />
      ) : cls === "miss" ? (
        <path fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" d="m8.5 8.5 7 7m0-7-7 7" />
      ) : null}
    </svg>
  );
}

/* « +1.3 », « −0.4 », « M3 » : l'évaluation vue des blancs. */
export function formatEval(score: number): string {
  if (Math.abs(score) > MATE / 2) {
    const n = MATE - Math.abs(score);
    return `${score > 0 ? "" : "−"}M${n}`;
  }
  const pawns = Math.abs(score) / 100;
  return `${score >= 0 ? "+" : "−"}${pawns.toFixed(1)}`;
}

/* La barre d'évaluation à gauche de l'échiquier : la part des blancs monte avec leurs
   chances. Elle suit l'orientation (le camp du bas est en bas). */
export function EvalBar({ score, orientation }: { score: number; orientation: Color }) {
  const white = score > MATE / 2 ? 1 : score < -MATE / 2 ? 0 : winChance(score);
  const share = Math.max(0.04, Math.min(0.96, white));
  const whiteAhead = score >= 0;
  return (
    <div
      className={`relative w-3.5 shrink-0 overflow-hidden rounded-sm bg-[#403d39] ${
        orientation === "w" ? "" : "rotate-180"
      }`}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 bg-[#f0efea]"
        initial={false}
        animate={{ height: `${share * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      <span
        className={`absolute inset-x-0 text-center text-[0.5rem] font-extrabold leading-none ${
          orientation === "w" ? "" : "rotate-180"
        } ${whiteAhead ? "bottom-1" : "top-1"} ${
          whiteAhead ? "text-[#403d39]" : "text-ivory"
        }`}
      >
        {formatEval(score).replace(/^[+−]/, "")}
      </span>
    </div>
  );
}

/* La courbe de la partie (chances des blancs, coup après coup), comme en tête du bilan
   chess.com : les grosses fautes et les coups brillants y sont pointés. Un tap y mène. */
export function EvalGraph({
  review,
  ply,
  onSelect,
}: {
  review: GameReview;
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const scores = [review.start, ...review.plies.map((p) => p.eval)];
  const n = Math.max(1, scores.length - 1);
  const W = 400;
  const H = 80;
  const x = (i: number) => (i / n) * W;
  const y = (s: number) => {
    const w = s > MATE / 2 ? 1 : s < -MATE / 2 ? 0 : winChance(s);
    return H - w * H;
  };
  const line = scores.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  const flagged = new Set<Classification>(["brilliant", "great", "mistake", "miss", "blunder"]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-20 w-full cursor-pointer touch-none rounded-lg bg-[#403d39]"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - rect.left) / rect.width) * n));
      }}
      aria-hidden
    >
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="#f0efea" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(128,128,128,0.45)" strokeWidth="1" />
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#81b64c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {review.plies.map((p, i) =>
        flagged.has(p.cls) ? (
          <circle
            key={i}
            cx={x(i + 1)}
            cy={y(p.eval)}
            r="3.2"
            fill={CLASS_COLORS[p.cls]}
            stroke="white"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </svg>
  );
}
