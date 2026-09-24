"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { T } from "./i18n";
import {
  BOARD_THEMES,
  PIECE_SETS,
  setChessPref,
  useChessPrefs,
  type BoardTheme,
  type ChessPrefs,
  type PieceSet,
} from "./prefs";
import { BOARDS, pieceUrl, preloadPieces } from "./themes";

/* Réglages d'apparence des échecs (menu ⚙️ de la table, accueil) : jeu de pièces,
   échiquier, et le confort de jeu. Un jeu de pièces se charge avant d'être appliqué. */
export default function Look() {
  const t = useT(T).look;
  const prefs = useChessPrefs();
  const pieceLabels = useT(PIECE_SETS);
  const boardLabels = useT(BOARD_THEMES);
  const [loading, setLoading] = useState<PieceSet | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
      <div>
        <p className="mb-2 font-bold">{t.pieces}</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(pieceLabels) as PieceSet[]).map((set) => (
            <button
              key={set}
              type="button"
              aria-label={pieceLabels[set]}
              onClick={() => {
                setLoading(set);
                preloadPieces(set).then(() => {
                  setChessPref("pieces", set);
                  setLoading(null);
                });
              }}
              className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-[0.7rem] font-semibold ${
                prefs.pieces === set ? "bg-white/10 ring-2 ring-[#81b64c]" : "ring-1 ring-white/10"
              } ${loading === set ? "animate-pulse" : ""}`}
            >
              <span className="flex">
                <span className="size-7 bg-cover" style={{ backgroundImage: `url(${pieceUrl(set, "w", "n")})` }} />
                <span className="size-7 bg-cover" style={{ backgroundImage: `url(${pieceUrl(set, "b", "q")})` }} />
              </span>
              {pieceLabels[set]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-bold">{t.board}</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(boardLabels) as BoardTheme[]).map((theme) => (
            <button
              key={theme}
              type="button"
              aria-label={boardLabels[theme]}
              onClick={() => setChessPref("board", theme)}
              className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-[0.7rem] font-semibold ${
                prefs.board === theme ? "bg-white/10 ring-2 ring-[#81b64c]" : "ring-1 ring-white/10"
              }`}
            >
              <BoardSwatch theme={theme} />
              {boardLabels[theme]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Toggle field="legal" label={t.legal} />
        <Toggle field="coords" label={t.coords} />
        <Toggle field="autoQueen" label={t.autoQueen} />
      </div>
    </div>
  );
}

function BoardSwatch({ theme }: { theme: BoardTheme }) {
  const { light, dark } = BOARDS[theme];
  return (
    <span className="grid size-10 grid-cols-2 overflow-hidden rounded-md">
      <span style={{ background: light }} />
      <span style={{ background: dark }} />
      <span style={{ background: dark }} />
      <span style={{ background: light }} />
    </span>
  );
}

type Flag = { [K in keyof ChessPrefs]: ChessPrefs[K] extends boolean ? K : never }[keyof ChessPrefs];

function Toggle({ field, label }: { field: Flag; label: string }) {
  const prefs = useChessPrefs();
  const on = prefs[field];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setChessPref(field, !on)}
      className="flex items-center justify-between gap-3 py-1.5 text-left text-sm font-semibold"
    >
      {label}
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[#81b64c]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[1.375rem]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
