/* Stockfish sous Node, le même build que dans le navigateur
   (frontend/public/stockfish/stockfish-19-lite-single.{js,wasm}), vu à travers
   l'interface Uci du front (frontend/src/games/chess/bot.ts). */

import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
export const FRONT = path.resolve(import.meta.dirname, "../../frontend");
const ENGINE = path.join(FRONT, "public/stockfish/stockfish-19-lite-single.js");

export type Uci = {
  send(command: string): void;
  listen(onLine: (line: string) => void): () => void;
};

export async function startEngine(): Promise<Uci> {
  const listeners = new Set<(line: string) => void>();
  const module: Record<string, any> = {
    locateFile: (file: string) => (file.endsWith(".wasm") ? ENGINE.replace(/\.js$/, ".wasm") : ENGINE),
    listener: (line: string) => listeners.forEach((f) => f(line)),
  };
  await require(ENGINE)()(module);
  const uci: Uci = {
    send: (command) =>
      setImmediate(() =>
        module.ccall("command", null, ["string"], [command], { async: /^go\b/.test(command) }),
      ),
    listen: (onLine) => {
      listeners.add(onLine);
      return () => listeners.delete(onLine);
    },
  };
  uci.send("uci");
  return uci;
}

/* chess.js du front, pour jouer les parties. */
export const { Chess } = require(path.join(FRONT, "node_modules/chess.js"));
