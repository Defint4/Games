"use client";

import type { Color, PieceSymbol } from "chess.js";
import { useEffect, useRef } from "react";
import type { Ply } from "./game";
import { useChessPrefs } from "./prefs";
import { pieceUrl } from "./themes";

/* La notation d'un coup avec la pièce dessinée à la place de sa lettre (figurine), comme
   sur chess.com : « ♘f3 » plutôt que « Nf3 ». */
export function San({ san, color }: { san: string; color: Color }) {
  const { pieces } = useChessPrefs();
  const letter = san[0];
  if (!"KQRBN".includes(letter)) {
    // Pion, roque, ou promotion (« e8=Q ») : la pièce promue en figurine.
    const promo = san.match(/=([QRBN])/);
    if (!promo) return <>{san}</>;
    const [before, after] = san.split(promo[0]);
    return (
      <>
        {before}=<Figurine set={pieces} color={color} type={promo[1].toLowerCase() as PieceSymbol} />
        {after}
      </>
    );
  }
  return (
    <>
      <Figurine set={pieces} color={color} type={letter.toLowerCase() as PieceSymbol} />
      {san.slice(1)}
    </>
  );
}

function Figurine({
  set,
  color,
  type,
}: {
  set: Parameters<typeof pieceUrl>[0];
  color: Color;
  type: PieceSymbol;
}) {
  return (
    <span
      className="inline-block size-[1.15em] bg-cover align-[-0.22em]"
      style={{ backgroundImage: `url(${pieceUrl(set, color, type)})` }}
      aria-label={type.toUpperCase()}
    />
  );
}

/* Les coups de la partie en bandeau horizontal (mobile chess.com) : le coup affiché est
   mis en avant, un tap y revient. Le bandeau suit le dernier coup. */
export default function MoveStrip({
  plies,
  current,
  onSelect,
}: {
  plies: Ply[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-current]");
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current, plies.length]);

  return (
    <div
      ref={ref}
      className="flex h-9 items-center gap-0.5 overflow-x-auto whitespace-nowrap px-2 text-sm [scrollbar-width:none]"
    >
      {plies.map((p, i) => {
        const ply = i + 1;
        const active = ply === current;
        return (
          <span key={i} className="flex items-center">
            {p.color === "w" && (
              <span className="ml-1.5 mr-0.5 text-ivory-dim/45">{Math.ceil(ply / 2)}.</span>
            )}
            <button
              type="button"
              data-current={active ? "" : undefined}
              onClick={() => onSelect(ply)}
              className={`rounded px-1.5 py-0.5 font-semibold ${
                active ? "bg-white/20 text-ivory" : "text-ivory-dim/75"
              }`}
            >
              <San san={p.san} color={p.color} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
