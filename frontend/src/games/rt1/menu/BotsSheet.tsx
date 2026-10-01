"use client";

/* Réglage d'une course contre les bots : niveau et nombre d'adversaires, retenus d'une
   fois à l'autre, puis départ sur le circuit choisi. */

import { motion } from "motion/react";
import { useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { formatMoney } from "../api";
import { T } from "../i18n";
import { bungee } from "../meta";
import { BOT_LEVELS, type BotLevel, botsPrize, MAX_BOTS, readBotsPref, saveBotsPref } from "../sim/bots";

export default function BotsSheet({
  circuit,
  onClose,
  onGo,
}: {
  circuit: string;
  onClose: () => void;
  onGo: (level: BotLevel, count: number) => void;
}) {
  const t = useT(T).home.bots;
  const lang = useLang();
  const [pref, setPref] = useState(readBotsPref);
  const set = (next: { level: BotLevel; count: number }) => {
    setPref(next);
    saveBotsPref(next);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-t-3xl bg-[#0c2b36] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 ring-white/15"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className={`${bungee.className} text-xl`}>{t.name}</h2>
            <p className="text-sm text-white/65">{circuit}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-full p-1.5 text-white/60 active:scale-95">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/50">{t.level}</p>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {BOT_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={pref.level === l}
              onClick={() => set({ ...pref, level: l })}
              className={`rounded-xl p-3 text-left ring-1 transition-colors ${
                pref.level === l ? "bg-[#2EC4C6]/15 ring-[#2EC4C6]" : "bg-black/25 ring-white/10"
              }`}
            >
              <span className={`${bungee.className} block text-sm`}>{t.levels[l]}</span>
              <span className="block text-xs text-white/60">{t.levelNotes[l]}</span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/50">{t.count}</p>
        <div className="mb-5 flex items-center gap-1.5">
          {Array.from({ length: MAX_BOTS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={pref.count === n}
              onClick={() => set({ ...pref, count: n })}
              className={`${bungee.className} h-11 grow rounded-xl text-base tabular-nums ring-1 transition-colors ${
                pref.count === n ? "bg-[#2EC4C6] text-[#061920] ring-[#2EC4C6]" : "bg-black/25 ring-white/10"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className={`${bungee.className} text-sm text-[#F4B942]`}>{t.prize(formatMoney(botsPrize(pref.level, pref.count), lang))}</p>
          <button
            type="button"
            onClick={() => onGo(pref.level, pref.count)}
            className={`${bungee.className} rounded-xl bg-[#FF7A2F] px-6 py-3 text-lg text-[#1b0d05] shadow-[0_5px_0_#b24c14] active:translate-y-1 active:shadow-[0_2px_0_#b24c14]`}
          >
            {t.go}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
