/* Calibrage du bilan : la précision moyenne des bots d'un niveau (parties entre bots
   égaux, analysées comme dans l'app), qui donne la table ELO_BY_ACCURACY de
   frontend/src/games/chess/analysis.ts.

   node --experimental-strip-types --import ./ts-register.mjs accuracy.mts ELO [parties] [profondeur]
   node --experimental-strip-types --import ./ts-register.mjs accuracy.mts timing
     (temps d'analyse par position à plusieurs profondeurs, sur une partie de bots 1500) */

import fs from "node:fs";
import path from "node:path";
import { Chess, FRONT, startEngine } from "./engine.mts";

const { botMove } = await import(path.join(FRONT, "src/games/chess/bot.ts"));
const { analyseGame, ANALYSIS_DEPTH } = await import(path.join(FRONT, "src/games/chess/analysis.ts"));
const book = JSON.parse(fs.readFileSync(path.join(FRONT, "public/chess/openings.json"), "utf8"));
const uci = await startEngine();

async function playGame(elo: number): Promise<string[]> {
  uci.send("ucinewgame");
  const chess = new Chess();
  while (!chess.isGameOver() && chess.history().length < 200) {
    const move = await botMove(uci, chess.fen(), elo, { movetime: 300 });
    chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  }
  return chess.history({ verbose: true }).map((m: { lan: string }) => m.lan);
}

if (process.argv[2] === "timing") {
  const moves = await playGame(1500);
  for (const depth of [10, 12, 14]) {
    const start = Date.now();
    const review = await analyseGame(uci, moves, book, () => {}, depth);
    const per = (Date.now() - start) / (moves.length + 1);
    console.log(`profondeur ${depth} : ${per.toFixed(0)} ms par position, précision ${JSON.stringify(review.accuracy)}`);
  }
} else {
  const elo = Number(process.argv[2]);
  const games = Number(process.argv[3] ?? 12);
  const depth = Number(process.argv[4] ?? ANALYSIS_DEPTH);
  const accuracies: number[] = [];
  for (let g = 0; g < games; g++) {
    const moves = await playGame(elo);
    if (moves.length < 20) continue;
    const review = await analyseGame(uci, moves, book, () => {}, depth);
    accuracies.push(review.accuracy.w, review.accuracy.b);
  }
  const mean = accuracies.reduce((x, y) => x + y, 0) / accuracies.length;
  console.log(`${elo} : précision moyenne ${mean.toFixed(1)} (${accuracies.length} camps)`);
}
process.exit(0);
