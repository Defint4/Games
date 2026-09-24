/* Calibrage des bots : un match entre deux niveaux, avec le code même de l'app
   (frontend/src/games/chess/bot.ts), et l'écart d'Elo mesuré.

   node --experimental-strip-types --import ./ts-register.mjs match.mts A B [parties] [ms]

   A, B : « s1060 » = le bot de l'app réglé à 1060 (Stockfish UCI_Elo à partir de 1320,
   notre modèle de gaffes en dessous) ; « c0.5 » = le modèle de gaffes à la force t = 0.5
   (pour établir la table CALIBRATION de bot.ts). `ms` : temps de recherche des niveaux
   Stockfish (600 = comme dans l'app). Les écarts se mesurent entre niveaux réels : en
   additionner de petits sous-estime les grands. 60 parties : ±80 Elo environ. */

import path from "node:path";
import { Chess, FRONT, startEngine } from "./engine.mts";

const { botMove } = await import(path.join(FRONT, "src/games/chess/bot.ts"));

const [a, b] = process.argv.slice(2, 4);
const games = Number(process.argv[4] ?? 60);
const sfTime = Number(process.argv[5] ?? 600);
const uci = await startEngine();
const play = (who: string, fen: string): Promise<string> =>
  who[0] === "c"
    ? botMove(uci, fen, 800, { strength: Number(who.slice(1)) })
    : botMove(uci, fen, Number(who.slice(1)), { movetime: sfTime });

let score = 0;
let draws = 0;
for (let g = 0; g < games; g++) {
  uci.send("ucinewgame");
  const chess = new Chess();
  const aWhite = g % 2 === 0;
  while (!chess.isGameOver() && chess.history().length < 300) {
    const move = await play((chess.turn() === "w") === aWhite ? a : b, chess.fen());
    chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  }
  if (chess.isCheckmate()) score += (chess.turn() === "w") === aWhite ? 0 : 1;
  else {
    score += 0.5;
    draws += 1;
  }
}
const ratio = score / games;
const gap = ratio <= 0 || ratio >= 1 ? NaN : -400 * Math.log10(1 / ratio - 1);
console.log(`${a} contre ${b} : ${score}/${games} (${draws} nulles), écart mesuré ${gap.toFixed(0)}`);
process.exit(0);
