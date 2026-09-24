"use client";

/* Stockfish dans un Web Worker (public/stockfish, build léger d'1,8 Mo) : tout le calcul
   des bots et de l'analyse se fait sur l'appareil du joueur, jamais sur le serveur.
   Un seul moteur par onglet, partagé ; une recherche à la fois (les demandes attendent
   leur tour). */

import type { Uci } from "./bot";

const WORKER = "/stockfish/stockfish-19-lite-single.js";

/* Le build utilise les instructions SIMD de WebAssembly. Sonde : le plus petit module
   qui en contient une (celui de wasm-feature-detect). */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
  253, 15, 253, 98, 11,
]);

function wasmSimd(): boolean {
  try {
    return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

export class Engine implements Uci {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(WORKER);
    this.worker.onmessage = (e: MessageEvent<string>) => {
      for (const listener of [...this.listeners]) listener(String(e.data));
    };
    this.ready = new Promise((resolve, reject) => {
      // Moteur qui ne démarre pas : WebAssembly absent ou sans SIMD (iOS avant 16.4, mode
      // Isolement), wasm qui n'arrive pas. Stockfish garde ces échecs dans son worker,
      // sans rien signaler : sans « readyok » au bout d'une minute, on abandonne.
      const fail = () => {
        clearTimeout(timer);
        this.worker.terminate();
        reject(new Error("engine"));
      };
      const timer = setTimeout(fail, 60_000);
      this.worker.onerror = fail;
      const stop = this.listen((line) => {
        if (line === "readyok") {
          stop();
          clearTimeout(timer);
          this.worker.onerror = null;
          resolve();
        }
      });
      if (!wasmSimd()) fail();
    });
    this.send("uci");
    this.send("isready");
  }

  send(command: string) {
    this.worker.postMessage(command);
  }

  listen(onLine: (line: string) => void): () => void {
    this.listeners.add(onLine);
    return () => this.listeners.delete(onLine);
  }

  /* Une tâche sur le moteur, après celles déjà demandées. */
  run<T>(task: (uci: Uci) => Promise<T>): Promise<T> {
    const next = this.queue.then(() => this.ready).then(() => task(this));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /* Nouvelle partie : on oublie la table de hachage de la précédente. */
  newGame() {
    this.send("ucinewgame");
  }
}

let shared: Engine | null = null;

export function engine(): Engine {
  if (!shared) {
    const created = new Engine();
    shared = created;
    // Échec au démarrage : la prochaine demande (réessayer) relance un worker neuf.
    created.ready.catch(() => {
      if (shared === created) shared = null;
    });
  }
  return shared;
}

/* À appeler avant d'afficher un écran qui en a besoin : le moteur démarre (téléchargement
   et compilation du wasm) pendant l'écran de chargement. */
export function preloadEngine(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return engine().ready;
}

/* Depuis l'accueil : les fichiers du moteur rejoignent le cache du navigateur, sans le
   démarrer (compiler le wasm coûte, on ne le fait qu'en partie). */
export function prefetchEngine() {
  if (typeof window === "undefined") return;
  for (const file of [WORKER, WORKER.replace(/\.js$/, ".wasm")]) {
    void fetch(file, { priority: "low" } as RequestInit).catch(() => {});
  }
}
