/* Le cerveau des bots : Stockfish (dans le navigateur) et un niveau choisi de 800 à 2500.

   À partir de 1320, Stockfish sait jouer à un Elo donné (UCI_LimitStrength, calibré par
   ses auteurs). En dessous, il ne sait pas faire plus faible : on lui demande ses
   meilleurs coups (MultiPV) à faible profondeur et on joue comme un humain de ce niveau :
   le plus souvent un coup correct tiré au sort parmi les bons (d'autant plus loin du
   meilleur que le niveau est bas), et parfois une vraie gaffe, un coup quelconque, avec
   un faible pour les prises et les échecs. Les réglages sont calibrés par des matchs
   entre niveaux voisins et contre le 1320 de Stockfish.

   Ce module ne dépend pas du navigateur : les matchs de calibrage (ml/chess/match.mts) le
   font tourner sous Node avec le même moteur. */

import { Chess } from "chess.js";

export const BOT_MIN = 800;
export const BOT_MAX = 2500;
export const BOT_STEP = 50;
/* En dessous, Stockfish refuse UCI_Elo. */
const UCI_ELO_MIN = 1320;

/* Le moteur, vu d'ici : on lui envoie des commandes UCI, il répond ligne à ligne. */
export interface Uci {
  send(command: string): void;
  listen(onLine: (line: string) => void): () => void;
}

export type Line = {
  move: string;
  /* Du point de vue du camp au trait, en centipions ; un mat vaut ±(100000 − coups). */
  score: number;
  pv: string[];
  depth: number;
};

export const MATE = 100000;

function parseScore(tokens: string[]): number | null {
  const i = tokens.indexOf("score");
  if (i < 0) return null;
  const value = Number(tokens[i + 2]);
  if (tokens[i + 1] === "mate") return value > 0 ? MATE - value : -MATE - value;
  return value;
}

/* Une recherche : `go` est la fin de la commande (« depth 8 », « movetime 500 »).
   Renvoie les lignes MultiPV de la dernière profondeur complète, meilleure d'abord. */
export function search(uci: Uci, fen: string, go: string, multipv = 1): Promise<Line[]> {
  return new Promise((resolve) => {
    const lines = new Map<number, Line>();
    const stop = uci.listen((raw) => {
      const tokens = raw.trim().split(/\s+/);
      if (tokens[0] === "info" && tokens.includes("pv") && tokens.includes("score")) {
        const score = parseScore(tokens);
        if (score === null || tokens.includes("lowerbound") || tokens.includes("upperbound"))
          return;
        const k = Number(tokens[tokens.indexOf("multipv") + 1] ?? 1) || 1;
        const pv = tokens.slice(tokens.indexOf("pv") + 1);
        const depth = Number(tokens[tokens.indexOf("depth") + 1]);
        lines.set(k, { move: pv[0], score, pv, depth });
      } else if (tokens[0] === "bestmove") {
        stop();
        const found = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
        if (!found.length && tokens[1] && tokens[1] !== "(none)") {
          found.push({ move: tokens[1], score: 0, pv: [tokens[1]], depth: 0 });
        }
        resolve(found);
      }
    });
    uci.send(`setoption name MultiPV value ${multipv}`);
    uci.send(`position fen ${fen}`);
    uci.send(`go ${go}`);
  });
}

/* Réglages d'un niveau sous 1320 selon sa force t (vers 0 le plus faible, vers 1 le plus
   fort) : profondeur de recherche, fréquence des gaffes, tolérance aux coups moins bons. */
export function weakSettings(t: number) {
  const k = Math.max(-0.1, Math.min(1, t));
  return {
    depth: Math.round(4 + 6 * k),
    /* Probabilité d'une vraie gaffe (un coup quelconque). */
    blunder: 0.2 - 0.17 * k,
    /* Écart toléré au meilleur coup, en centipions (température du tirage). */
    temperature: 260 - 190 * k,
  };
}

/* La force t qui donne un niveau, mesurée par des matchs de calibrage de 60 parties
   ancrés sur Stockfish UCI_Elo 1320 à 600 ms par coup (le 1300 d'ici fait jeu égal avec
   lui). Les écarts se mesurent de niveau à niveau réel : additionner des petits écarts
   les sous-estime (un bot plus solide profite plus des gaffes). Entre deux points, on
   interpole. */
const CALIBRATION: [elo: number, t: number][] = [
  [800, 0.04],
  [1060, 0.5],
  [1320, 0.75],
];

export function strengthOf(elo: number): number {
  const points = CALIBRATION;
  if (elo <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [e1, t1] = points[i];
    const [e0, t0] = points[i - 1];
    if (elo <= e1) return t0 + ((elo - e0) / (e1 - e0)) * (t1 - t0);
  }
  return points[points.length - 1][1];
}

type Rng = () => number;

function pickWeighted<T>(items: T[], weight: (item: T) => number, rng: Rng): T {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* Le coup du bot dans cette position. `movetime` : temps de recherche des niveaux forts. */
export async function botMove(
  uci: Uci,
  fen: string,
  elo: number,
  {
    movetime = 600,
    rng = Math.random,
    strength,
  }: { movetime?: number; rng?: Rng; strength?: number } = {},
): Promise<string> {
  if (strength === undefined && elo >= UCI_ELO_MIN) {
    uci.send("setoption name UCI_LimitStrength value true");
    uci.send(`setoption name UCI_Elo value ${Math.min(elo, 3190)}`);
    const [best] = await search(uci, fen, `movetime ${movetime}`, 1);
    return best.move;
  }

  uci.send("setoption name UCI_LimitStrength value false");
  const { depth, blunder, temperature } = weakSettings(strength ?? strengthOf(elo));
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (legal.length === 1) return legal[0].lan;

  if (rng() < blunder) {
    // La gaffe : un coup au hasard, avec un faible pour ce qui prend et ce qui met échec.
    const move = pickWeighted(
      legal,
      (m) => (m.captured ? 3 : 1) * (m.san.includes("+") ? 2 : 1),
      rng,
    );
    return move.lan;
  }

  const lines = await search(uci, fen, `depth ${depth}`, Math.min(6, legal.length));
  if (!lines.length) return legal[0].lan;
  const best = lines[0].score;
  const line = pickWeighted(
    lines,
    (l) => Math.exp(-Math.min(best - l.score, 2000) / temperature),
    rng,
  );
  return line.move;
}

/* Le nom du niveau, comme sur la réglette. */
export function levelOf(elo: number): number {
  return elo < 1000 ? 0 : elo < 1300 ? 1 : elo < 1600 ? 2 : elo < 1900 ? 3 : elo < 2200 ? 4 : 5;
}
