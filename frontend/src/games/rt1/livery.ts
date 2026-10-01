/* La livrée d'un véhicule : peinture (deux tons, finition), jantes, vitres, numéro de
   course et logo en calques (formes, motifs dessinés ici, texte). Pas d'image importée.
   Gardée par le serveur dans l'atelier du véhicule (router.Livery en est le schéma). */

import { PAINT } from "./meta";

export type Tone = "none" | "lower" | "stripes" | "front" | "split";
export type Finish = "matte" | "gloss" | "metal" | "pearl" | "chrome";
export type Zone = "hood" | "roof" | "doors" | "rear";
export type Layer = {
  kind: "shape" | "motif" | "text";
  /* identifiant de forme ou de motif, ou le texte */
  name: string;
  color: string;
  /* dans le carré du logo, de -1 à 1 ; y vers le bas */
  x: number;
  y: number;
  size: number;
  rot: number;
};
export type Livery = {
  color: string;
  color2: string;
  tone: Tone;
  finish: Finish;
  rims: string;
  tint: number;
  number: number | null;
  layers: Layer[];
  zones: Zone[];
};

export const TONES: Tone[] = ["none", "lower", "stripes", "front", "split"];
export const FINISHES: Finish[] = ["gloss", "matte", "metal", "pearl", "chrome"];
export const ZONES: Zone[] = ["hood", "roof", "doors", "rear"];
export const MAX_LAYERS = 8;

/* Palette de l'île, en plus de la couleur libre. */
export const SWATCHES = [
  "#E8552B", "#C8232C", "#FF7A2F", "#F4B942", "#F0D7A3", "#77A34B", "#1E8C84", "#3CCFC6",
  "#0F6F8F", "#2F7BFF", "#1F3A5F", "#7B5BD6", "#F4F4F0", "#9AA3AB", "#2B2E33", "#0B0D10",
];

export const DEFAULT_LIVERY: Livery = {
  color: PAINT,
  color2: "#F4F4F0",
  tone: "none",
  finish: "gloss",
  rims: "#CDD1D6",
  tint: 0.35,
  number: null,
  layers: [],
  zones: [],
};

export function liveryOf(saved: Partial<Livery> | undefined): Livery {
  return { ...DEFAULT_LIVERY, ...saved, layers: saved?.layers ?? [], zones: saved?.zones ?? [] };
}

/* Formes simples, dans un carré de -1 à 1 (tracés SVG). */
export const SHAPES: Record<string, string> = {
  circle: "M0 -1A1 1 0 1 1 0 1A1 1 0 1 1 0 -1Z",
  ring: "M0 -1A1 1 0 1 1 0 1A1 1 0 1 1 0 -1ZM0 -0.7A0.7 0.7 0 1 0 0 0.7A0.7 0.7 0 1 0 0 -0.7Z",
  square: "M-0.85 -0.85H0.85V0.85H-0.85Z",
  diamond: "M0 -1L1 0L0 1L-1 0Z",
  triangle: "M0 -0.95L1 0.8H-1Z",
  hexagon: "M-0.5 -0.87H0.5L1 0L0.5 0.87H-0.5L-1 0Z",
  star: "M0 -1L0.24 -0.33L0.95 -0.31L0.38 0.12L0.59 0.81L0 0.4L-0.59 0.81L-0.38 0.12L-0.95 -0.31L-0.24 -0.33Z",
  chevron: "M-1 -0.6L0 0.2L1 -0.6V0L0 0.8L-1 0Z",
  bolt: "M0.25 -1L-0.6 0.15H-0.05L-0.3 1L0.6 -0.2H0.05Z",
  stripe: "M-1 -0.18H1V0.18H-1Z",
  shield: "M0 -1L0.85 -0.7V0.05C0.85 0.55 0.45 0.85 0 1C-0.45 0.85 -0.85 0.55 -0.85 0.05V-0.7Z",
  arrow: "M-1 -0.25H0.2V-0.65L1 0L0.2 0.65V0.25H-1Z",
};

/* Motifs de l'île, dessinés pour RT1 (libres de droit). */
export const MOTIFS: Record<string, string> = {
  wave:
    "M-1 0.2C-0.75 -0.35 -0.35 -0.45 -0.05 -0.2C0.15 -0.02 0.1 0.25 -0.15 0.22C0.2 0.55 0.75 0.35 1 -0.15V0.7H-1Z",
  sun:
    "M0 -0.45A0.45 0.45 0 1 1 0 0.45A0.45 0.45 0 1 1 0 -0.45ZM-0.08 -1H0.08L0.05 -0.6H-0.05ZM-0.08 1H0.08L0.05 0.6H-0.05ZM-1 -0.08V0.08L-0.6 0.05V-0.05ZM1 -0.08V0.08L0.6 0.05V-0.05ZM-0.76 -0.65L-0.65 -0.76L-0.4 -0.47L-0.47 -0.4ZM0.76 0.65L0.65 0.76L0.4 0.47L0.47 0.4ZM0.65 -0.76L0.76 -0.65L0.47 -0.4L0.4 -0.47ZM-0.65 0.76L-0.76 0.65L-0.47 0.4L-0.4 0.47Z",
  palm:
    "M-0.06 1L0.02 -0.2L0.1 -0.2L0.1 1ZM0.05 -0.3C-0.2 -0.6 -0.6 -0.65 -0.95 -0.45C-0.6 -0.5 -0.3 -0.4 0.05 -0.2ZM0.05 -0.3C0.3 -0.65 0.7 -0.7 0.98 -0.5C0.65 -0.52 0.35 -0.42 0.05 -0.2ZM0.05 -0.3C-0.05 -0.7 -0.35 -0.95 -0.6 -0.98C-0.35 -0.85 -0.15 -0.6 0.02 -0.22ZM0.05 -0.3C0.2 -0.72 0.45 -0.95 0.7 -0.97C0.48 -0.82 0.28 -0.58 0.08 -0.22ZM0.05 -0.3C-0.3 -0.35 -0.6 -0.1 -0.72 0.2C-0.5 -0.05 -0.25 -0.2 0.04 -0.22Z",
  pine:
    "M-0.05 1H0.05V-1H-0.05ZM-0.4 -0.6H0.4L0.25 -0.5H-0.25ZM-0.45 -0.3H0.45L0.28 -0.2H-0.28ZM-0.5 0H0.5L0.3 0.1H-0.3ZM-0.55 0.3H0.55L0.32 0.4H-0.32ZM-0.28 -0.85H0.28L0.18 -0.77H-0.18Z",
  fish:
    "M-0.75 0C-0.45 -0.45 0.2 -0.5 0.55 0L1 -0.4V0.4L0.55 0C0.2 0.5 -0.45 0.45 -0.75 0ZM-0.45 -0.12A0.07 0.07 0 1 0 -0.45 0.02A0.07 0.07 0 1 0 -0.45 -0.12Z",
  turtle:
    "M0 -0.55C0.45 -0.55 0.6 -0.1 0.6 0.15C0.6 0.5 0.3 0.62 0 0.62C-0.3 0.62 -0.6 0.5 -0.6 0.15C-0.6 -0.1 -0.45 -0.55 0 -0.55ZM0 -0.95A0.2 0.2 0 1 1 0 -0.55A0.2 0.2 0 1 1 0 -0.95ZM0.5 -0.35L0.95 -0.55L0.9 -0.25L0.58 -0.12ZM-0.5 -0.35L-0.95 -0.55L-0.9 -0.25L-0.58 -0.12ZM0.5 0.45L0.85 0.75L0.55 0.8L0.35 0.6ZM-0.5 0.45L-0.85 0.75L-0.55 0.8L-0.35 0.6Z",
  flower:
    "M0 -0.2A0.45 0.45 0 1 1 0 -1A0.45 0.45 0 1 1 0 -0.2ZM0.19 -0.06A0.45 0.45 0 1 1 0.95 -0.31A0.45 0.45 0 1 1 0.19 -0.06ZM0.12 0.16A0.45 0.45 0 1 1 0.59 0.81A0.45 0.45 0 1 1 0.12 0.16ZM-0.12 0.16A0.45 0.45 0 1 1 -0.59 0.81A0.45 0.45 0 1 1 -0.12 0.16ZM-0.19 -0.06A0.45 0.45 0 1 1 -0.95 -0.31A0.45 0.45 0 1 1 -0.19 -0.06Z",
  bird:
    "M-0.9 0.35C-0.5 0.1 -0.2 -0.05 0.15 -0.1C0.2 -0.35 0.35 -0.5 0.55 -0.5C0.7 -0.5 0.8 -0.4 0.85 -0.3L1 -0.25L0.83 -0.18C0.8 0 0.65 0.2 0.35 0.35L0.2 0.8H0.1L0.18 0.4C-0.2 0.5 -0.6 0.45 -0.9 0.35ZM0.35 -0.52L0.1 -0.85L0.45 -0.6L0.3 -0.95L0.58 -0.55Z",
};

const paths = new Map<string, Path2D>();

function path(d: string): Path2D {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}

/* Dessine le logo dans un carré de `size` px (fond transparent). */
export function drawLogo(ctx: CanvasRenderingContext2D, size: number, layers: Layer[], font: string) {
  ctx.clearRect(0, 0, size, size);
  const half = size / 2;
  for (const l of layers) {
    ctx.save();
    ctx.translate(half + l.x * half, half + l.y * half);
    ctx.rotate((l.rot * Math.PI) / 180);
    ctx.fillStyle = l.color;
    if (l.kind === "text") {
      const px = half * l.size * 0.6;
      ctx.font = `${Math.round(px)}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.name, 0, px * 0.06);
    } else {
      const d = (l.kind === "shape" ? SHAPES : MOTIFS)[l.name];
      if (d) {
        const s = half * l.size * 0.5;
        ctx.scale(s, s);
        ctx.fill(path(d), "evenodd");
      }
    }
    ctx.restore();
  }
}

/* Numéro de course : rond blanc cerclé, chiffres noirs. */
export function drawNumber(ctx: CanvasRenderingContext2D, size: number, n: number, font: string) {
  ctx.clearRect(0, 0, size, size);
  const h = size / 2;
  ctx.beginPath();
  ctx.arc(h, h, h * 0.94, 0, Math.PI * 2);
  ctx.fillStyle = "#F4F4F0";
  ctx.fill();
  ctx.lineWidth = h * 0.08;
  ctx.strokeStyle = "#0B0D10";
  ctx.stroke();
  ctx.fillStyle = "#0B0D10";
  ctx.font = `${Math.round(h * (n > 9 ? 0.95 : 1.15))}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), h, h * 1.06);
}
