"use client";

/* Stockfish dans un Web Worker (public/stockfish, build léger d'1,8 Mo) : tout le calcul
   des bots et de l'analyse se fait sur l'appareil du joueur, jamais sur le serveur.
   Un seul moteur par onglet, partagé ; une recherche à la fois (les demandes attendent
   leur tour). */

import type { Uci } from "./bot";

const WORKER = "/stockfish/stockfish-19-lite-single.js";

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
    this.ready = new Promise((resolve) => {
      const stop = this.listen((line) => {
        if (line === "readyok") {
          stop();
          resolve();
        }
      });
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
  shared ??= new Engine();
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
