"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { isRed, rank, suit, type Card, type State } from "./engine";
import { foundationX, type Geometry } from "./layout";
import { BLACK_INK, RED_INK, SUIT_PATHS, rankLabel } from "./suits";

/* La victoire : les cartes quittent les fondations une à une, des rois aux as, et
   rebondissent jusqu'au bord de l'écran en laissant leur trace — la cascade du
   Solitaire d'autrefois. Dessinée dans un canvas qu'on n'efface jamais, c'est ce qui
   fait la traînée. */

const GRAVITY = 2000; // px/s²
const BOUNCE = 0.74;
const LAUNCH_EVERY = 0.24; // s

type Flying = { sprite: HTMLCanvasElement; x: number; y: number; vx: number; vy: number };

export default function WinCascade({
  state,
  g,
  board,
}: {
  state: State;
  g: Geometry;
  board: DOMRect;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const font = getComputedStyle(document.body).fontFamily;
    const { cardW: w, cardH: h } = g;

    // Les rois d'abord, fondation après fondation, jusqu'aux as.
    const queue: { card: Card; f: number }[] = [];
    for (let r = 13; r >= 1; r--) {
      state.foundations.forEach((pile, f) => {
        if (pile[r - 1]) queue.push({ card: pile[r - 1], f });
      });
    }

    const flying: Flying[] = [];
    let launched = 0;
    let start: number | null = null;
    let last = 0;
    let frame = 0;

    const tick = (time: number) => {
      start ??= time;
      const t = (time - start) / 1000;
      const dt = Math.min(0.033, last ? (time - last) / 1000 : 0);
      last = time;

      while (launched < queue.length && t >= 0.5 + launched * LAUNCH_EVERY) {
        const { card, f } = queue[launched];
        const x = board.left + foundationX(g, f);
        const y = board.top + g.topY;
        // La carte d'en dessous réapparaît sur la fondation.
        const under = state.foundations[f][rank(card) - 2];
        if (under) ctx.drawImage(sprite(under, w, h, dpr, font), x, y, w, h);
        const direction = f < 2 && Math.random() < 0.7 ? -1 : Math.random() < 0.5 ? -1 : 1;
        flying.push({
          sprite: sprite(card, w, h, dpr, font),
          x,
          y,
          vx: direction * (110 + Math.random() * 230),
          vy: -Math.random() * 520,
        });
        launched++;
      }

      for (const c of flying) {
        c.vy += GRAVITY * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.y + h > height) {
          c.y = height - h;
          c.vy = -c.vy * BOUNCE;
        }
        ctx.drawImage(c.sprite, c.x, c.y, w, h);
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        if (flying[i].x > width || flying[i].x + w < 0) flying.splice(i, 1);
      }
      if (launched < queue.length || flying.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, state, g, board]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />;
}

/* Une face de carte dessinée comme dans le DOM (voir Card.tsx), mise en cache. */
const sprites = new Map<string, HTMLCanvasElement>();

function sprite(card: Card, w: number, h: number, dpr: number, font: string) {
  const key = `${card}:${w}:${dpr}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const x = canvas.getContext("2d")!;
  x.scale(dpr, dpr);
  x.beginPath();
  x.roundRect(0.5, 0.5, w - 1, h - 1, w * 0.1);
  x.fillStyle = "#fbf8ef";
  x.fill();
  // Un liseré : c'est lui qui dessine chaque copie de la traînée.
  x.strokeStyle = "rgba(32,36,31,0.35)";
  x.lineWidth = 1;
  x.stroke();

  const ink = isRed(card) ? RED_INK : BLACK_INK;
  x.fillStyle = ink;
  const ten = card[0] === "T";
  x.font = `800 ${w * 0.36}px ${font}`;
  x.textBaseline = "top";
  x.fillText(rankLabel(card), w * (ten ? 0.04 : 0.08), w * 0.07);

  const path = new Path2D(SUIT_PATHS[suit(card)]);
  const icon = (left: number, top: number, size: number) => {
    x.save();
    x.translate(left, top);
    x.scale(size / 24, size / 24);
    x.fill(path);
    x.restore();
  };
  icon(w - w * 0.07 - w * 0.28, w * 0.08, w * 0.28);

  if (rank(card) > 10) {
    // Le cadre des figures (voir Face) : liseré et fond à l'encre de la couleur.
    const frameH = h - w * 0.62;
    x.beginPath();
    x.roundRect(w * 0.1, w * 0.52, w * 0.8, frameH, w * 0.06);
    x.fillStyle = `${ink}0f`;
    x.fill();
    x.strokeStyle = `${ink}59`;
    x.lineWidth = Math.max(1, w * 0.025);
    x.stroke();
    x.fillStyle = ink;
    icon((w - w * 0.44) / 2, w * 0.52 + (frameH - w * 0.44) / 2, w * 0.44);
  } else {
    icon((w - w * 0.56) / 2, h - w * 0.14 - w * 0.56, w * 0.56);
  }
  sprites.set(key, canvas);
  return canvas;
}
