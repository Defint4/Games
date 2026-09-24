import type { Color, PieceSymbol } from "chess.js";
import { settle } from "@/lib/settle";
import type { BoardTheme, PieceSet } from "./prefs";

/* Les échiquiers : couleurs des cases, texture éventuelle (grain du bois, veines du
   marbre, dessinées en SVG sur tout le plateau pour qu'elles courent d'une case à
   l'autre) et teinte des surlignages. Le vert est celui de chess.com. */

export type BoardStyle = {
  light: string;
  dark: string;
  /* Filtre SVG de texture, posé en multiplication sur les cases. */
  texture?: { frequency: string; octaves: number; opacity: number; seed: number };
  /* Dernier coup joué, case choisie. */
  highlight: string;
};

export const BOARDS: Record<BoardTheme, BoardStyle> = {
  green: { light: "#ebecd0", dark: "#739552", highlight: "rgba(255, 255, 51, 0.5)" },
  wood: {
    light: "#e9cc9c",
    dark: "#b0784a",
    texture: { frequency: "0.012 0.22", octaves: 3, opacity: 0.32, seed: 7 },
    highlight: "rgba(255, 235, 59, 0.45)",
  },
  ice: { light: "#dee3e6", dark: "#8ca2ad", highlight: "rgba(155, 199, 0, 0.45)" },
  marble: {
    light: "#e6e2dc",
    dark: "#8e8a86",
    texture: { frequency: "0.02", octaves: 5, opacity: 0.28, seed: 3 },
    highlight: "rgba(255, 213, 79, 0.5)",
  },
};

export function pieceUrl(set: PieceSet, color: Color, type: PieceSymbol): string {
  return `/chess/pieces/${set}/${color}${type.toUpperCase()}.svg`;
}

const TYPES: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

/* Les 12 pièces d'un jeu, chargées et décodées avant d'être montrées (sur un réseau
   lent, jamais un échiquier à trous). */
const retained: HTMLImageElement[] = [];
const loading = new Map<PieceSet, Promise<void>>();

export function preloadPieces(set: PieceSet): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  let pending = loading.get(set);
  if (!pending) {
    const loads = (["w", "b"] as Color[]).flatMap((color) =>
      TYPES.map((type) => {
        const img = new Image();
        retained.push(img);
        return new Promise<void>((resolve) => {
          img.onload = () => {
            img.decode?.().catch(() => {}).finally(resolve);
          };
          img.onerror = () => resolve();
          img.src = pieceUrl(set, color, type);
        });
      }),
    );
    pending = settle(Promise.all(loads), 15000);
    loading.set(set, pending);
  }
  return pending;
}
