/* Une partie contre l'ordinateur, jouée entièrement sur l'appareil : l'état tient dans
   le localStorage (on la reprend après avoir fermé l'app, pendule comprise) et part au
   serveur une fois finie, pour l'historique et le bilan. Non classée.

   Mêmes pendules qu'en ligne : elles tournent à partir du deuxième coup des blancs,
   incrément ajouté à chaque coup, temps dépassé perdu (nulle si l'adversaire n'a plus
   de quoi mater). Fonctions pures : chaque coup rend une nouvelle partie. */

import { Chess, type Color, type PieceSymbol } from "chess.js";
import { parseUci } from "./game";
import { timeControl } from "./meta";
import type { Termination } from "./types";

export type ColorChoice = Color | "random";

export type BotGame = {
  elo: number;
  /* Couleur du joueur, et ce qu'il avait choisi (« Rejouer » le reprend). */
  color: Color;
  colorChoice: ColorChoice;
  timeControl: string;
  moves: string[];
  /* Temps restant (s) des blancs et des noirs au début du tour en cours ; null sans
     pendule. */
  clocks: [number, number] | null;
  /* Temps restant (ms) du joueur qui vient de jouer, coup après coup (pour le bilan). */
  moveClocks: number[];
  /* Date.now() du début du tour en cours : l'app fermée, la pendule tourne quand même. */
  turnStartedAt: number;
  over: { result: string; termination: Termination } | null;
  /* Identifiant côté serveur une fois la partie enregistrée. */
  savedId: string | null;
};

const KEY = "games:chess:bot-game";

export function loadBotGame(): BotGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BotGame) : null;
  } catch {
    return null;
  }
}

export function storeBotGame(game: BotGame | null) {
  try {
    if (game) localStorage.setItem(KEY, JSON.stringify(game));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : la partie ne se reprendra pas */
  }
}

export function newBotGame(elo: number, colorChoice: ColorChoice, tcId: string): BotGame {
  const tc = timeControl(tcId);
  const color = colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
  return {
    elo,
    color,
    colorChoice,
    timeControl: tc.id,
    moves: [],
    clocks: tc.base ? [tc.base, tc.base] : null,
    moveClocks: [],
    turnStartedAt: Date.now(),
    over: null,
    savedId: null,
  };
}

const index = (color: Color) => (color === "w" ? 0 : 1);

export function toMove(game: BotGame): Color {
  return game.moves.length % 2 === 0 ? "w" : "b";
}

export function clocksRunning(game: BotGame): boolean {
  return game.clocks !== null && game.moves.length >= 2 && game.over === null;
}

/* Temps restant d'un camp à l'instant `now` (null sans pendule). */
export function remaining(game: BotGame, color: Color, now: number): number | null {
  if (!game.clocks) return null;
  const left = game.clocks[index(color)];
  if (clocksRunning(game) && color === toMove(game)) {
    return left - (now - game.turnStartedAt) / 1000;
  }
  return left;
}

function board(moves: string[]): Chess {
  const chess = new Chess();
  for (const uci of moves) chess.move(parseUci(uci));
  return chess;
}

function pgnResult(winner: Color | null): string {
  return winner === null ? "1/2-1/2" : winner === "w" ? "1-0" : "0-1";
}

function outcome(chess: Chess): BotGame["over"] {
  if (chess.isCheckmate()) {
    return { result: pgnResult(chess.turn() === "w" ? "b" : "w"), termination: "checkmate" };
  }
  if (chess.isStalemate()) return { result: "1/2-1/2", termination: "stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", termination: "insufficient" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", termination: "repetition" };
  if (chess.isDrawByFiftyMoves()) return { result: "1/2-1/2", termination: "fifty" };
  return null;
}

/* Le coup `uci` joué par le camp au trait à l'instant `now`. */
export function playMove(game: BotGame, uci: string, now: number): BotGame {
  const mover = toMove(game);
  let clocks = game.clocks;
  if (clocks && clocksRunning(game)) {
    const i = index(mover);
    const left = clocks[i] - (now - game.turnStartedAt) / 1000;
    if (left <= 0) return timeout(game, now) ?? game;
    const next: [number, number] = [...clocks];
    next[i] = left + timeControl(game.timeControl).increment;
    clocks = next;
  }
  const moves = [...game.moves, uci];
  const chess = board(moves);
  const left = clocks ? clocks[index(mover)] : 0;
  return {
    ...game,
    moves,
    clocks,
    moveClocks: [...game.moveClocks, Math.round(left * 1000)],
    turnStartedAt: now,
    over: outcome(chess),
  };
}

/* Un camp à qui il ne reste que le roi, ou le roi et une pièce mineure, ne peut pas
   mater. */
function cannotMate(chess: Chess, color: Color): boolean {
  const pieces: PieceSymbol[] = [];
  for (const row of chess.board()) {
    for (const cell of row) if (cell && cell.color === color && cell.type !== "k") pieces.push(cell.type);
  }
  return pieces.length === 0 || (pieces.length === 1 && (pieces[0] === "n" || pieces[0] === "b"));
}

/* Pendule tombée ? Renvoie la partie terminée, ou null si le temps n'est pas écoulé. */
export function timeout(game: BotGame, now: number): BotGame | null {
  if (!clocksRunning(game)) return null;
  const loser = toMove(game);
  const left = remaining(game, loser, now);
  if (left === null || left > 0) return null;
  const clocks: [number, number] = [...game.clocks!];
  clocks[index(loser)] = 0;
  const winner: Color = loser === "w" ? "b" : "w";
  const over: BotGame["over"] = cannotMate(board(game.moves), winner)
    ? { result: "1/2-1/2", termination: "timeout_insufficient" }
    : { result: pgnResult(winner), termination: "timeout" };
  return { ...game, clocks, over };
}

export function resign(game: BotGame, now: number): BotGame {
  const clocks = game.clocks ? freeze(game, now) : null;
  return {
    ...game,
    clocks,
    over: { result: pgnResult(game.color === "w" ? "b" : "w"), termination: "resign" },
  };
}

function freeze(game: BotGame, now: number): [number, number] {
  const clocks: [number, number] = [...game.clocks!];
  if (clocksRunning(game)) {
    const i = index(toMove(game));
    clocks[i] = Math.max(0, clocks[i] - (now - game.turnStartedAt) / 1000);
  }
  return clocks;
}

/* Reprendre son dernier coup (et la réponse de l'ordinateur) : à son tour seulement. La
   pendule ne revient pas en arrière. */
export function canTakeBack(game: BotGame): boolean {
  if (game.over || toMove(game) !== game.color) return false;
  return game.moves.length >= 2;
}

export function takeBack(game: BotGame, now: number): BotGame {
  if (!canTakeBack(game)) return game;
  const clocks = game.clocks ? freeze(game, now) : null;
  return {
    ...game,
    moves: game.moves.slice(0, -2),
    moveClocks: game.moveClocks.slice(0, -2),
    clocks,
    turnStartedAt: now,
  };
}

/* Temps de réflexion de l'ordinateur : assez pour paraître humain, jamais de quoi
   perdre au temps. Plus la cadence est rapide, plus il joue vite (en bullet, un
   quart de seconde à peine). `searchMs` : temps accordé au moteur pour les niveaux
   forts ; `delayMs` : temps minimum avant de poser la pièce. */
export function botTiming(game: BotGame, now: number): { searchMs: number; delayMs: number } {
  const { base } = timeControl(game.timeControl);
  const [searchMax, humanMin, humanMax] =
    base === 0 || base > 300 ? [1000, 600, 1700] : base > 120 ? [700, 400, 1200] : [350, 250, 700];
  const human = humanMin + Math.random() * (humanMax - humanMin);
  const left = remaining(game, toMove(game), now);
  // Sur une pendule, jamais plus d'un quarantième du temps qui reste.
  const budget = left === null ? Infinity : (left * 1000) / 40;
  return {
    searchMs: Math.max(60, Math.min(searchMax, budget)),
    delayMs: Math.max(100, Math.min(human, budget)),
  };
}
