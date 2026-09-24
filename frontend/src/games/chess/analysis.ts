/* Le bilan d'une partie, à la manière du « Game Review » de chess.com, calculé sur
   l'appareil par Stockfish (à pleine force) puis gardé par le serveur.

   Chaque position est analysée (deux meilleures lignes). Un coup se juge à ce qu'il coûte
   en points attendus : la chance de gain du camp qui joue avec le meilleur coup, moins
   celle avec le coup joué. Seuils publiés par chess.com : meilleur (le coup du moteur),
   excellent (≤ 2 %), bon (≤ 5 %), imprécision (≤ 10 %), erreur (≤ 20 %), gaffe (au-delà).
   Le reste vient de règles, l'algorithme de chess.com n'étant pas public :
   - théorie : le coup reste dans une ouverture répertoriée ;
   - super coup : le seul bon coup (le deuxième coûte au moins 15 %), hors évidences :
     reprendre une pièce, parer un échec, ou une position déjà gagnée ;
   - brillant : un bon coup qui sacrifie du matériel (la ligne du moteur laisse au moins
     deux points de moins, sans les reprendre) dans une position qui reste bonne sans
     être déjà gagnée, ou qui force le mat ;
   - manqué : une erreur qui rend le cadeau que l'adversaire venait de faire.
   La précision suit la formule publique de lichess (moyenne pondérée par la volatilité
   de la partie et moyenne harmonique). L'Elo de la partie se lit sur une table établie
   en analysant des parties entre bots de niveau connu.

   Aucune dépendance au navigateur : le calibrage (ml/chess/accuracy.mts) le fait tourner
   sous Node. */

import { Chess, type Color, type PieceSymbol } from "chess.js";
import { MATE, search, type Uci } from "./bot";

export const ANALYSIS_VERSION = 1;
/* Profondeur fixe : le même bilan quel que soit l'appareil, seul le temps change. */
export const ANALYSIS_DEPTH = 12;

export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export const CLASSIFICATIONS: Classification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

export type PlyReview = {
  /* Évaluation après le coup, du point de vue des blancs (centipions ; mat ±(100000 − n)). */
  eval: number;
  /* Le meilleur coup de la position d'avant, et l'évaluation qu'il aurait donnée. */
  best: string;
  bestEval: number;
  cls: Classification;
  /* Précision du coup, de 0 à 100. */
  acc: number;
};

export type GameReview = {
  v: number;
  depth: number;
  /* Évaluation de la position de départ (blancs). */
  start: number;
  plies: PlyReview[];
  accuracy: Record<Color, number>;
  elo: Record<Color, number>;
  opening: { eco: string; name: string } | null;
};

/* Ouvertures répertoriées : position (FEN sans les compteurs) → code ECO et nom. */
export type OpeningBook = Record<string, [eco: string, name: string]>;

export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/* Chance de gain du camp au trait, de 0 à 1, selon l'évaluation (formule de lichess). */
export function winChance(score: number): number {
  if (Math.abs(score) > MATE / 2) return score > 0 ? 1 : 0;
  const cp = Math.max(-1000, Math.min(1000, score));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(chess: Chess, color: Color): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) total += (cell.color === color ? 1 : -1) * VALUES[cell.type];
    }
  }
  return total;
}

/* Le coup laisse-t-il du matériel sur la ligne du moteur ? `pv` part de la position
   d'après le coup (l'adversaire au trait). */
function isSacrifice(before: Chess, after: Chess, pv: string[], mover: Color): boolean {
  const start = material(before, mover);
  const line = new Chess(after.fen());
  let lowest = material(line, mover);
  for (const uci of pv.slice(0, 6)) {
    try {
      line.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    lowest = Math.min(lowest, material(line, mover));
  }
  return lowest <= start - 2 && material(line, mover) <= start - 1;
}

/* Reprendre sur la case où l'adversaire vient de prendre : le seul coup, mais évident. */
function isRecapture(moves: string[], i: number): boolean {
  return i > 0 && moves[i].slice(2, 4) === moves[i - 1].slice(2, 4);
}

/* Précision d'un coup selon la chance de gain perdue (en points de pourcentage). */
function moveAccuracy(before: number, after: number): number {
  const loss = Math.max(0, (before - after) * 100);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

function stdev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

/* Précision d'un camp : la moyenne pondérée par la volatilité (un coup compte plus quand
   la partie bascule) et la moyenne harmonique (une gaffe pèse lourd), comme lichess. */
function gameAccuracy(accs: number[], weights: number[]): number {
  if (!accs.length) return 100;
  const weighted =
    accs.reduce((a, acc, i) => a + acc * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  const harmonic = accs.length / accs.reduce((a, acc) => a + 1 / Math.max(acc, 1), 0);
  return (weighted + harmonic) / 2;
}

/* L'Elo de la partie selon la précision : précision moyenne de nos bots de niveau connu
   (12 parties par niveau entre bots égaux, même analyse, même profondeur), prolongée
   aux deux bouts. Entre deux points, on interpole. */
const ELO_BY_ACCURACY: [accuracy: number, elo: number][] = [
  [40, 250],
  [69.8, 800],
  [76.5, 1100],
  [84.3, 1400],
  [86.2, 1700],
  [89, 2000],
  [91.5, 2500],
  [96, 3000],
];

export function eloFromAccuracy(accuracy: number): number {
  const table = ELO_BY_ACCURACY;
  if (accuracy <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [a1, e1] = table[i];
    const [a0, e0] = table[i - 1];
    if (accuracy <= a1) return Math.round((e0 + ((accuracy - a0) / (a1 - a0)) * (e1 - e0)) / 50) * 50;
  }
  return table[table.length - 1][1];
}

/* L'évaluation d'une position vue du camp qui y mène : l'opposée, et un mat compte un
   coup de plus pour celui qui mate (« mat en 1 » à subir devient « mat en 2 » à donner). */
function parentScore(child: number): number {
  if (child < -MATE / 2) return MATE - (MATE + child + 1);
  if (child > MATE / 2) return -MATE + (MATE - child);
  return -child;
}

type Position = { fen: string; score: number; lines: { move: string; score: number; pv: string[] }[] };

/* Analyse la partie coup par coup. `onProgress(fait, total)` à chaque position ; un
   `signal` interrompt l'analyse entre deux positions (écran quitté). */
export async function analyseGame(
  uci: Uci,
  moves: string[],
  book: OpeningBook,
  onProgress: (done: number, total: number) => void = () => {},
  depth = ANALYSIS_DEPTH,
  signal?: AbortSignal,
): Promise<GameReview> {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const m of moves) {
    chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    fens.push(chess.fen());
  }

  // Le bilan se fait à pleine force, quel que soit le réglage du dernier bot.
  uci.send("setoption name UCI_LimitStrength value false");
  uci.send("ucinewgame");
  const positions: Position[] = [];
  for (let i = 0; i < fens.length; i++) {
    signal?.throwIfAborted();
    const board = new Chess(fens[i]);
    if (board.isCheckmate()) {
      positions.push({ fen: fens[i], score: -MATE, lines: [] });
    } else if (board.isDraw() || board.isStalemate()) {
      positions.push({ fen: fens[i], score: 0, lines: [] });
    } else {
      const lines = await search(uci, fens[i], `depth ${depth}`, 2);
      positions.push({ fen: fens[i], score: lines[0]?.score ?? 0, lines });
    }
    onProgress(i + 1, fens.length);
  }

  // Quand le coup joué est celui du moteur, la position d'après en est une vue plus
  // profonde : son évaluation remplace celle d'avant, en remontant la partie (un mat que
  // la profondeur fixe ne voyait pas d'un coup plus tôt se propage ainsi).
  for (let i = moves.length - 1; i >= 0; i--) {
    const best = positions[i].lines[0];
    if (best?.move === moves[i]) {
      positions[i].score = parentScore(positions[i + 1].score);
      best.score = positions[i].score;
    }
  }

  // Évaluations du point de vue des blancs, pour la courbe et la volatilité.
  const white = positions.map((p, i) => (i % 2 === 0 ? p.score : -p.score));
  const winWhite = white.map((s) => winChance(s) * 100);
  const window = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));

  const plies: PlyReview[] = [];
  const accs: Record<Color, number[]> = { w: [], b: [] };
  const weights: Record<Color, number[]> = { w: [], b: [] };
  let inBook = true;
  let opening: GameReview["opening"] = null;
  let lastCls: Classification | null = null;

  for (let i = 0; i < moves.length; i++) {
    const mover: Color = i % 2 === 0 ? "w" : "b";
    const sign = mover === "w" ? 1 : -1;
    const before = positions[i];
    const after = positions[i + 1];
    const best = before.lines[0];
    const second = before.lines[1];
    const played = moves[i];
    const isBest = best?.move === played;
    const wBest = winChance(before.score);
    const wPlayed = isBest ? wBest : winChance(-after.score);
    const loss = Math.max(0, wBest - wPlayed);

    const entry = book[positionKey(after.fen)];
    if (inBook && entry) opening = { eco: entry[0], name: entry[1] };
    else inBook = false;

    let cls: Classification;
    if (inBook && entry) cls = "book";
    else if (isBest || !best) cls = "best";
    else if (loss <= 0.02) cls = "excellent";
    else if (loss <= 0.05) cls = "good";
    else if (loss <= 0.1) cls = "inaccuracy";
    else if (loss <= 0.2) cls = "mistake";
    else cls = "blunder";

    if (cls === "mistake" || cls === "blunder") {
      // L'adversaire venait de se tromper, et le coup rend le cadeau sans rien gâcher de
      // plus que la position d'avant : une occasion manquée.
      const prev = i > 0 ? positions[i - 1] : null;
      const wBeforeGift = prev ? 1 - winChance(prev.score) : null;
      const gift = lastCls === "mistake" || lastCls === "blunder" || lastCls === "miss";
      if (gift && wBeforeGift !== null && wPlayed >= wBeforeGift - 0.03) cls = "miss";
    }
    if ((cls === "best" || cls === "excellent") && best) {
      const beforeBoard = new Chess(before.fen);
      const pv = after.lines[0]?.pv ?? [];
      // Un sacrifice brillant se joue dans une position pas encore gagnée, ou force le mat.
      const forcesMate = -after.score > MATE / 2;
      if (
        wPlayed >= 0.5 &&
        (wBest <= 0.9 || (forcesMate && isBest)) &&
        isSacrifice(beforeBoard, new Chess(after.fen), pv, mover)
      ) {
        cls = "brilliant";
      } else if (
        cls === "best" &&
        second &&
        wBest - winChance(second.score) >= 0.15 &&
        wBest >= 0.35 &&
        wBest <= 0.8 &&
        !beforeBoard.inCheck() &&
        !isRecapture(moves, i)
      ) {
        cls = "great";
      }
    }

    const acc = moveAccuracy(wBest, wPlayed);
    accs[mover].push(acc);
    const from = Math.max(0, i + 1 - window);
    weights[mover].push(Math.max(0.5, Math.min(12, stdev(winWhite.slice(from, i + 2)))));
    lastCls = cls;
    plies.push({
      eval: white[i + 1],
      best: best?.move ?? played,
      bestEval: sign * (best?.score ?? 0),
      cls,
      acc: Math.round(acc * 10) / 10,
    });
  }

  const accuracy = {
    w: Math.round(gameAccuracy(accs.w, weights.w) * 10) / 10,
    b: Math.round(gameAccuracy(accs.b, weights.b) * 10) / 10,
  };
  return {
    v: ANALYSIS_VERSION,
    depth,
    start: white[0],
    plies,
    accuracy,
    elo: { w: eloFromAccuracy(accuracy.w), b: eloFromAccuracy(accuracy.b) },
    opening,
  };
}
