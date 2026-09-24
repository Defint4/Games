"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import LangSwitch from "@/components/LangSwitch";
import { Sheet } from "@/components/Sheet";
import SoundToggle from "@/components/SoundToggle";
import type { GameMeta } from "@/lib/games";
import { dict, useT } from "@/lib/i18n";
import { forgetTable } from "@/lib/identity";
import {
  BACK_STYLES,
  FELT_STYLES,
  setPref,
  usePrefs,
  type BackStyle,
  type FeltStyle,
} from "@/lib/prefs";

const T = dict({
  fr: {
    table: "Table",
    backs: "Dos des cartes",
    felt: "Tapis",
    rules: "Règles du jeu",
    leave: (inLobby: boolean) => `Quitter la ${inLobby ? "table" : "partie"}`,
    seatKept: "Ta place reste réservée : tu pourras revenir depuis l’accueil.",
  },
  en: {
    table: "Table",
    backs: "Card backs",
    felt: "Felt",
    rules: "Game rules",
    leave: (inLobby: boolean) => (inLobby ? "Leave the table" : "Leave the game"),
    seatKept: "Your seat stays saved: you can come back from the game screen.",
  },
});

/* Le menu ⚙️ d'une table, commun à tous les jeux : sons, dos des cartes, tapis,
   règles (fournies par le jeu), quitter. */

export default function SettingsSheet({
  game,
  code,
  inLobby,
  rules,
  cardBacks = true,
  onLeave,
  onClose,
}: {
  game: GameMeta;
  code: string;
  inLobby: boolean;
  rules: React.ReactNode;
  /* Faux pour un jeu sans cartes (Perudo) : pas de choix de dos. */
  cardBacks?: boolean;
  onLeave: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useT(T);
  const [showRules, setShowRules] = useState(false);

  if (showRules) return <Sheet onClose={() => setShowRules(false)}>{rules}</Sheet>;

  return (
    <Sheet onClose={onClose}>
      <h2 className="mb-4 text-center text-lg font-extrabold">
        {t.table} <span className="tracking-widest text-gold">{code}</span>
      </h2>
      <div className="flex flex-col gap-3">
        <LangSwitch />
        <SoundToggle />

        <LookPrefs cardBacks={cardBacks} />

        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="rounded-2xl bg-black/25 p-4 text-left font-bold ring-1 ring-white/10"
        >
          {t.rules}
        </button>

        <button
          type="button"
          onClick={() => {
            onLeave();
            if (inLobby) forgetTable(game.slug);
            router.push(game.path);
          }}
          className="rounded-2xl bg-card-red/90 p-4 font-extrabold text-ivory ring-1 ring-white/10 active:translate-y-0.5"
        >
          {t.leave(inLobby)}
        </button>
        {!inLobby && (
          <p className="text-center text-sm text-ivory-dim/70">
            {t.seatKept}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* Dos des cartes (jeux de cartes seulement) et couleur du tapis : dans le menu de
   chaque table. */
export function LookPrefs({ cardBacks = true }: { cardBacks?: boolean }) {
  const prefs = usePrefs();
  const t = useT(T);
  const backLabels = useT(BACK_STYLES);
  const feltLabels = useT(FELT_STYLES);
  return (
    <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
      {cardBacks && (
        <>
          <p className="mb-2 font-bold">{t.backs}</p>
          <div className="mb-4 flex gap-3">
            {(Object.keys(backLabels) as BackStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                aria-label={backLabels[style]}
                onClick={() => setPref("back", style)}
                className={`rounded-lg p-1 ${prefs.back === style ? "ring-2 ring-gold" : ""}`}
              >
                <BackPreview style={style} />
              </button>
            ))}
          </div>
        </>
      )}
      <p className="mb-2 font-bold">{t.felt}</p>
      <div className="flex gap-3">
        {(Object.keys(feltLabels) as FeltStyle[]).map((style) => (
          <button
            key={style}
            type="button"
            aria-label={feltLabels[style]}
            onClick={() => setPref("felt", style)}
            className={`size-10 rounded-full ring-2 ${
              prefs.felt === style ? "ring-gold" : "ring-white/20"
            }`}
            style={{
              background: { green: "#1b5443", navy: "#1a3354", wine: "#541a25" }[style],
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BackPreview({ style }: { style: BackStyle }) {
  const css: Record<BackStyle, React.CSSProperties> = {
    classic: {
      background:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 9px), #1b5443",
    },
    crimson: {
      background:
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.09) 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.09) 0 2px, transparent 2px 8px), #6e1f26",
    },
    royal: {
      background:
        "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1.5px) 0 0 / 8px 8px, #1c2f55",
    },
  };
  return <span className="block h-16 w-11 rounded-md border border-white/25" style={css[style]} />;
}
