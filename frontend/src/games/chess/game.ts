/* Ce que le client tire lui-même de la liste des coups (UCI) : positions successives,
   notation, pièces prises, matériel, coups possibles et prémoves. Le serveur reste seul
   juge ; chess.js ne sert ici qu'à afficher. */

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export type Ply = {
  uci: string;
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  castle: boolean;
  check: boolean;
  mate: boolean;
  /* Position après le coup. */
  fen: string;
};

export type Replay = { start: string; plies: Ply[] };

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parseUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol | undefined) || undefined,
  };
}

export function replay(moves: string[]): Replay {
  const chess = new Chess();
  const plies: Ply[] = [];
  for (const uci of moves) {
    const move = chess.move(parseUci(uci));
    plies.push({
      uci,
      san: move.san,
      from: move.from,
      to: move.to,
      color: move.color,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      castle: move.isKingsideCastle() || move.isQueensideCastle(),
      check: chess.inCheck(),
      mate: chess.isCheckmate(),
      fen: chess.fen(),
    });
  }
  return { start: START_FEN, plies };
}

/* Position affichée après `ply` demi-coups (0 = position de départ). */
export function fenAt(game: Replay, ply: number): string {
  return ply === 0 ? game.start : game.plies[ply - 1].fen;
}

export const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: PieceSymbol[] = ["p", "n", "b", "r", "q"];

/* Pièces prises par chaque camp jusqu'au demi-coup `ply`, rangées comme sur chess.com
   (pions, cavaliers, fous, tours, dame). */
export function capturedBy(game: Replay, ply: number): Record<Color, PieceSymbol[]> {
  const taken: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const p of game.plies.slice(0, ply)) {
    if (p.captured) taken[p.color].push(p.captured);
  }
  for (const color of ["w", "b"] as Color[]) {
    taken[color].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }
  return taken;
}

/* Avance matérielle des blancs (négative : les noirs mènent), promotions comprises. */
export function materialBalance(fen: string): number {
  let balance = 0;
  for (const ch of fen.split(" ")[0]) {
    const type = ch.toLowerCase() as PieceSymbol;
    if (!(type in VALUES)) continue;
    balance += ch === type ? -VALUES[type] : VALUES[type];
  }
  return balance;
}

/* Coups légaux de la position, par case de départ. */
export function legalDests(fen: string): Map<Square, Square[]> {
  const chess = new Chess(fen);
  const dests = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true })) {
    dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  }
  return dests;
}

export function kingInCheck(fen: string): Square | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  return chess.findPiece({ type: "k", color: chess.turn() })[0] ?? null;
}

export function isPromotion(fen: string, from: Square, to: Square): boolean {
  const piece = new Chess(fen).get(from);
  return piece?.type === "p" && (to[1] === "8" || to[1] === "1");
}

const FILES = "abcdefgh";

function square(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

/* Prémoves : les cases qu'une pièce atteint par sa géométrie, sans tenir compte des
   pièces qui barrent la route (la position aura changé quand le coup partira). Le coup
   n'est joué que s'il est légal au moment venu, sinon il s'efface. */
export function premoveDests(fen: string, color: Color): Map<Square, Square[]> {
  const chess = new Chess(fen);
  const dests = new Map<Square, Square[]>();
  const rays: Record<string, [number, number][]> = {
    r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  };
  rays.q = [...rays.r, ...rays.b];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue;
      const f = FILES.indexOf(cell.square[0]);
      const r = Number(cell.square[1]) - 1;
      const out: Square[] = [];
      const add = (df: number, dr: number) => {
        const s = square(f + df, r + dr);
        if (s) out.push(s);
      };
      if (cell.type === "n") {
        for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]])
          add(df, dr);
      } else if (cell.type === "k") {
        for (const [df, dr] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]])
          add(df, dr);
        const home = color === "w" ? 0 : 7;
        if (f === 4 && r === home) {
          add(2, 0);
          add(-2, 0);
        }
      } else if (cell.type === "p") {
        const dir = color === "w" ? 1 : -1;
        add(0, dir);
        if (r === (color === "w" ? 1 : 6)) add(0, 2 * dir);
        add(1, dir);
        add(-1, dir);
      } else {
        for (const [df, dr] of rays[cell.type]) {
          for (let k = 1; k < 8; k++) add(df * k, dr * k);
        }
      }
      dests.set(cell.square, out);
    }
  }
  return dests;
}

/* Le prémove est-il jouable dans cette position ? Renvoie son UCI, dame par défaut. */
export function premoveUci(
  fen: string,
  from: Square,
  to: Square,
  promotion: PieceSymbol = "q",
): string | null {
  const chess = new Chess(fen);
  const move = chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to);
  if (!move) return null;
  return `${from}${to}${move.isPromotion() ? promotion : ""}`;
}
