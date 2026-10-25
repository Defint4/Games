"use client";

import { useEffect, useRef, useState } from "react";
import { LOGO_SCENE } from "@/components/logo-scene";
import { audio, preloadSounds, sfx } from "@/lib/sound";

/* L'animation de lancement : la table se dresse (le feutre, l'anneau d'or qu'un éclat
   dessine, les chaises une à une, la carte qui glisse, le dé qui tombe), puis le nom
   s'allume et la pastille 3.0 claque. Une fois par session, sans la passer : elle couvre
   l'écran le temps que l'accueil se charge derrière, et pour finir le logo rejoint sa
   place en haut de l'accueil. Les instants de chaque morceau sont dans globals.css
   (règles .sp-*), les sons sont calés ici sur les mêmes. */

const SEEN_KEY = "games:splash";
/* Début de la sortie et durée totale : suivent les délais des règles .sp-* de globals.css. */
const EXIT_MS = 3550;
const TOTAL_MS = 4200;

/* Les sons, au moment où chaque morceau touche la table. Rien tant que le navigateur
   n'a pas autorisé l'audio (iOS avant le premier geste, Chrome sur un site jamais
   visité) : un son lancé sur un contexte suspendu partirait d'un coup au premier tap. */
const CUES: [number, () => void][] = [
  [50, sfx.splashShuffle],
  [1750, sfx.cardLand],
  [1950, sfx.dieLand],
  [2000, sfx.chord],
  [2600, sfx.pill],
];

type Phase = "idle" | "play" | "exit" | "done";

/* Le logo de l'accueil (Brand lg : la table de 176 px dans un h1), cible de la sortie.
   Absent ou réduit (en-tête compact, hub), la scène se soulève simplement. */
function homeLogo(): HTMLImageElement | null {
  const img = document.querySelector<HTMLImageElement>('h1 img[src="/logo.svg"]');
  return img && img.getBoundingClientRect().width > 100 ? img : null;
}

export default function Splash() {
  const [phase, setPhase] = useState<Phase>("idle");
  const sceneRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* stockage indisponible : l'animation joue */
    }
    if (seen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("done");
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // La scène est le logo de l'accueil grossi ; elle le rejoint d'une translation et
    // d'un retour à l'échelle 1, mesurés à l'instant de la sortie.
    const exit = () => {
      const scene = sceneRef.current;
      const table = tableRef.current;
      const target = homeLogo();
      if (scene && table && target) {
        const s = scene.getBoundingClientRect();
        const b = table.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        const zoom = s.width / scene.offsetWidth;
        const cx = s.left + s.width / 2;
        const cy = s.top + s.height / 2;
        const ox = (b.left + b.width / 2 - cx) / zoom;
        const oy = (b.top + b.height / 2 - cy) / zoom;
        scene.style.setProperty("--sp-dx", `${t.left + t.width / 2 - cx - ox}px`);
        scene.style.setProperty("--sp-dy", `${t.top + t.height / 2 - cy - oy}px`);
        scene.style.setProperty("--sp-to", "1");
      }
      setPhase("exit");
    };

    // Les sons d'abord, mais pas plus de 250 ms : au-delà, l'animation part sans eux
    // (le mélange arrivera un peu en retard, les suivants seront là).
    void Promise.race([preloadSounds("splash"), new Promise((r) => setTimeout(r, 250))]).then(
      () => {
        if (cancelled) return;
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* on la reverra au prochain chargement, tant pis */
        }
        setPhase("play");
        for (const [at, play] of CUES) {
          timers.push(
            setTimeout(() => {
              if (audio()?.state === "running") play();
            }, at),
          );
        }
        timers.push(setTimeout(exit, EXIT_MS));
        timers.push(setTimeout(() => setPhase("done"), TOTAL_MS));
      },
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  if (phase === "done") return null;

  const playing = phase === "play" || phase === "exit";

  return (
    <div
      data-play={playing ? "" : undefined}
      data-exit={phase === "exit" ? "" : undefined}
      aria-hidden
      className="sp-root fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
    >
      {/* Mêmes dimensions et mêmes classes que Brand lg : la scène est ce logo, grossi. */}
      <div ref={sceneRef} className="sp-scene flex flex-col items-center">
        <div ref={tableRef} className="sp-table relative size-44">
          <div className="sp-wave" />
          <div className="sp-glow" />
          <div
            className="sp-turn relative size-full"
            dangerouslySetInnerHTML={{ __html: LOGO_SCENE }}
          />
        </div>
        <div className="sp-name -mt-8 flex -rotate-[5deg] items-start font-script text-[4.25rem] leading-none text-ivory [text-shadow:3px_3px_0_var(--color-gold-deep),0_6px_14px_rgba(0,0,0,0.45)]">
          <span className="sp-word">Le spot</span>
          <span className="sp-pill ml-1 mt-2 rounded-full bg-[linear-gradient(180deg,#f6d98a,#d6a241)] px-2 py-1 font-sans text-[0.95rem] font-extrabold tracking-tight text-ink shadow-card [text-shadow:none]">
            3.0
          </span>
        </div>
      </div>
    </div>
  );
}
