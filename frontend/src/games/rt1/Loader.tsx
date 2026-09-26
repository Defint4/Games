"use client";

/* L'écran de chargement de RT1 : une route qui se remplit, une petite voiture qui
   avance dessus, des phrases pour patienter. Le bouton « Recharger » n'apparaît que si
   le chargement ne bouge plus depuis un bon moment (le circuit pèse quelques Mo). */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { T } from "./i18n";
import { bungee } from "./meta";

const STALL_MS = 30000;

export default function Loader({ progress, portrait, failed }: { progress: number; portrait: boolean; failed?: boolean }) {
  const t = useT(T).loader;
  const [shown, setShown] = useState(0);
  const [line, setLine] = useState(0);
  const [stalled, setStalled] = useState(false);
  const target = useRef(progress);

  // La barre rattrape la progression réelle en douceur, sans jamais reculer.
  useEffect(() => {
    target.current = progress;
  }, [progress]);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setShown((v) => {
        const goal = target.current;
        return goal <= v ? v : v + Math.max(0.002, (goal - v) * 0.08);
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setLine((l) => l + 1), 2800);
    return () => clearInterval(timer);
  }, []);

  // Bloqué : plus aucun progrès depuis STALL_MS
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [progress]);

  const pct = Math.min(100, Math.round(shown * 100));
  const phrase = t.lines[line % t.lines.length];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#12505f_0%,#0a2f3a_45%,#061a21_100%)] px-8 text-white">
      <div
        className={`${bungee.className} rounded-[14px] border-[3px] border-white bg-[#C8232C] px-6 pb-1 pt-2 text-5xl leading-none shadow-[0_10px_30px_rgba(0,0,0,0.35)]`}
      >
        RT1
      </div>

      <div className="w-full max-w-sm">
        {/* la route : bitume, pointillés, remplissage turquoise → balise, la voiture en tête */}
        <div className="relative h-5 overflow-hidden rounded-full bg-[#2b2e33] ring-1 ring-black/40">
          <div
            className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#2ec4c6,#8ce6d2_70%,#ff7a2f)]"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.75)_0_10px,transparent_10px_20px)]" />
        </div>
        <div className="relative mt-1 h-7">
          <svg
            viewBox="0 0 40 20"
            className="absolute top-0 h-6 w-12 -translate-x-1/2 transition-[left] duration-100"
            style={{ left: `${pct}%` }}
            aria-hidden
          >
            <path d="M4 13h32l-1-4-7-1-4-4H13L8 8H5z" fill="#E8552B" />
            <path d="M14 5h9l3 3H12z" fill="#1A2630" />
            <circle cx="11" cy="14" r="3" fill="#17181B" />
            <circle cx="29" cy="14" r="3" fill="#17181B" />
          </svg>
        </div>
        <div className={`${bungee.className} flex items-baseline justify-between text-sm`}>
          <span key={line} className="text-white/80 [animation:rt1-fade_2.8s_ease-in-out]">
            {failed ? t.failed : phrase}
          </span>
          <span className="tabular-nums text-[#8CE6D2]">{pct}%</span>
        </div>
      </div>

      {portrait && <p className="max-w-xs text-center text-sm text-white/70">{t.sideways}</p>}

      {(stalled || failed) && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${bungee.className} rounded-xl bg-white/10 px-5 py-3 text-sm ring-1 ring-white/20 active:translate-y-0.5`}
        >
          {t.reload}
        </button>
      )}
      <style>{`
        @keyframes rt1-fade { 0% { opacity: 0; transform: translateY(4px) } 15%, 85% { opacity: 1; transform: none } 100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { [class*="rt1-fade"] { animation: none !important } }
      `}</style>
    </div>
  );
}
