"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ANALYSIS_DEPTH, ANALYSIS_VERSION, analyseGame, type GameReview, type OpeningBook } from "./analysis";
import { saveAnalysis } from "./api";
import { engine, preloadEngine } from "./engine";
import type { SavedGame } from "./types";

let book: Promise<OpeningBook> | null = null;

/* Les ouvertures (public/chess/openings.json, 60 Ko compressés) : chargées une fois,
   seulement pour le bilan. */
function loadBook(): Promise<OpeningBook> {
  book ??= fetch("/chess/openings.json", { signal: AbortSignal.timeout(20000) })
    .then((res) => res.json() as Promise<OpeningBook>)
    .catch(() => {
      book = null;
      return {};
    });
  return book;
}

/* Le bilan d'une partie : celui du serveur s'il est à jour, sinon calculé ici (Stockfish
   dans le navigateur), puis envoyé au serveur pour les suivants. `progress` de 0 à 1
   pendant le calcul. */
export function useGameReview(game: SavedGame, token: string) {
  const queryClient = useQueryClient();
  const stored =
    game.analysis && game.analysis.v >= ANALYSIS_VERSION && game.analysis.plies.length === game.moves.length
      ? game.analysis
      : null;
  const [computed, setComputed] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const review = stored ?? computed;

  useEffect(() => {
    if (stored) return;
    const controller = new AbortController();
    Promise.all([loadBook(), preloadEngine()])
      .then(([openings]) =>
        engine().run((uci) =>
          analyseGame(
            uci,
            game.moves,
            openings,
            (done, total) => setProgress(done / total),
            ANALYSIS_DEPTH,
            controller.signal,
          ),
        ),
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        setComputed(result);
        saveAnalysis(token, game.id, result)
          .then((saved) => queryClient.setQueryData(["chess-game", game.id], saved))
          .catch(() => {
            /* le bilan reste affiché ; il sera recalculé à la prochaine ouverture */
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [stored, game.id, game.moves, token, queryClient, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setProgress(0);
    setAttempt((n) => n + 1);
  }, []);

  return { review, progress, failed, retry };
}
