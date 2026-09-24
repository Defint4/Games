"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, joinRoom, wsUrl } from "./api";
import { dict, tr } from "./i18n";
import {
  isMaintenanceError,
  MAINTENANCE_DETAIL,
  setPhase,
  showMaintenanceNotice,
} from "./maintenance";
import { serverText } from "./serverMessages";
import { sfx } from "./sound";
import type { BaseRoomView, BotDifficulty, ChatEntry, GameEvent, ServerMessage } from "./types";

/* Connexion WebSocket à une table, commune à tous les jeux : vue, chat, emotes, bots,
   timer, revanche, reconnexion. Les actions propres à un jeu passent par `send`
   (voir src/games/<slug>/socket.ts). */

export type EmoteEvent = { id: number; seat: number; emote: string; target: number | null };

export type RoomSocket<V extends BaseRoomView = BaseRoomView> = {
  view: V | null;
  chat: ChatEntry[];
  emotes: EmoteEvent[];
  error: string | null;
  closedReason: string | null;
  rematchCode: string | null;
  send: (payload: Record<string, unknown>) => void;
  sendChat: (text: string) => void;
  sendEmote: (emote: string, target?: number) => void;
  setTurnSeconds: (seconds: number) => void;
  addBot: (difficulty: BotDifficulty) => void;
  removeBot: (seat: number) => void;
  rematch: () => void;
  leave: () => void;
  onEvents: (handler: (events: GameEvent[], nextView: V) => void) => void;
};

const CLOSE_REASONS = dict<Record<number, string>>({
  fr: {
    4000: "Cette table est ouverte sur un autre écran.",
    4401: "Session expirée : reviens à l'accueil pour entrer à nouveau.",
    4403: "Tu n'es pas assis à cette table.",
    4404: "Cette table n'existe plus.",
  },
  en: {
    4000: "This table is open on another screen.",
    4401: "Session expired: go back to the start screen and come in again.",
    4403: "You don't have a seat at this table.",
    4404: "This table no longer exists.",
  },
});

let emoteId = 0;

export function useRoomSocket<V extends BaseRoomView>(
  code: string,
  token: string | null
): RoomSocket<V> {
  const [view, setView] = useState<V | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [rematchCode, setRematchCode] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const eventsHandlerRef = useRef<((events: GameEvent[], nextView: V) => void) | null>(null);
  // Événements arrivés sans personne pour les jouer (le lobby est encore affiché au
  // démarrage de la partie) : gardés pour la table, qui les rejoue en s'abonnant.
  const pendingEventsRef = useRef<{ events: GameEvent[]; view: V }[]>([]);
  const retryRef = useRef(0);
  const rejoinRef = useRef(0);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let probeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout>;

    // Coupure réseau ou serveur : on retente avec un léger backoff.
    function retryLater() {
      const delay = Math.min(500 * 2 ** retryRef.current, 8000);
      retryRef.current += 1;
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      const socket = new WebSocket(wsUrl(code, token!));
      socketRef.current = socket;
      // Réseau mobile bloqué : le socket peut rester des minutes « en connexion » sans
      // échouer. On l'abandonne (onclose relance) plutôt que de laisser l'écran attendre.
      clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) socket.close();
      }, 10000);
      socket.onopen = () => clearTimeout(openTimer);

      socket.onmessage = (raw) => {
        clearTimeout(probeTimer);
        const msg = JSON.parse(raw.data) as ServerMessage<V>;
        if (msg.type === "state") {
          retryRef.current = 0;
          setView(msg.view);
          if (msg.chat) setChat(msg.chat);
          if (msg.events.length) {
            if (eventsHandlerRef.current) eventsHandlerRef.current(msg.events, msg.view);
            else {
              const batch = { events: msg.events, view: msg.view };
              pendingEventsRef.current = [...pendingEventsRef.current, batch].slice(-4);
            }
          }
        } else if (msg.type === "chat") {
          setChat((prev) => [...prev.slice(-99), msg]);
          sfx.pop();
        } else if (msg.type === "emote") {
          const id = ++emoteId;
          setEmotes((prev) => [
            ...prev,
            { id, seat: msg.seat, emote: msg.emote, target: msg.target ?? null },
          ]);
          setTimeout(() => setEmotes((prev) => prev.filter((e) => e.id !== id)), 2600);
        } else if (msg.type === "rematch") {
          setRematchCode(msg.code);
        } else if (msg.type === "error") {
          // Revanche ou table en attente refusées pendant la maintenance : le popup.
          if (msg.detail === MAINTENANCE_DETAIL) showMaintenanceNotice();
          else {
            setError(serverText(msg.detail));
            setTimeout(() => setError(null), 3500);
          }
        } else if (msg.type === "maintenance") {
          setPhase(msg.phase);
        }
      };

      socket.onclose = (event) => {
        if (disposed || socketRef.current !== socket) return;
        // Départ volontaire (« Quitter ») : surtout ne pas se reconnecter, on serait
        // rassis à la table qu'on vient de quitter.
        if (event.code === 1000) return;
        if (event.code === 4403 && rejoinRef.current < 2) {
          // Siège expiré (délai de grâce dépassé) : on se rassoit puis on se reconnecte.
          rejoinRef.current += 1;
          joinRoom(token!, code)
            .then(() => {
              if (!disposed) connect();
            })
            .catch((e) => {
              if (disposed) return;
              // Refus du serveur (4xx, maintenance) : c'est fini. Réseau ou serveur qui
              // redémarre (5xx) : on retentera.
              if (isMaintenanceError(e) || (e instanceof ApiError && e.status < 500)) {
                setClosedReason(e.message);
              } else {
                // Réseau coupé pendant la reprise : l'essai ne compte pas, on retentera.
                rejoinRef.current -= 1;
                retryLater();
              }
            });
          return;
        }
        const terminal = tr(CLOSE_REASONS)[event.code];
        if (terminal) {
          setClosedReason(terminal);
          return;
        }
        retryLater();
      };
    }

    connect();

    // Retour au premier plan sur mobile : le navigateur a pu suspendre ou tuer
    // la connexion sans événement de fermeture. On resynchronise ou on reconnecte.
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: "sync" }));
        // iOS laisse souvent pour ouvert un socket mort pendant la veille : le serveur
        // répond toujours au sync, sans réponse on reconnecte.
        clearTimeout(probeTimer);
        probeTimer = setTimeout(() => {
          if (disposed || socketRef.current !== socket) return;
          socketRef.current = null;
          socket.close();
          connect();
        }, 5000);
      } else if (!socket || socket.readyState === WebSocket.CLOSED) {
        // Un nouvel essai attendait peut-être déjà : une seule connexion, sinon la
        // seconde ferme la première (4000, « ouverte sur un autre écran »).
        clearTimeout(retryTimer);
        connect();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(probeTimer);
      clearTimeout(openTimer);
      document.removeEventListener("visibilitychange", onVisible);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [code, token]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }, []);

  return {
    view,
    chat,
    emotes,
    error,
    closedReason,
    rematchCode,
    send,
    sendChat: useCallback((text) => send({ action: "chat", text }), [send]),
    sendEmote: useCallback((emote, target) => send({ action: "emote", emote, target }), [send]),
    setTurnSeconds: useCallback(
      (seconds) => send({ action: "config", turn_seconds: seconds }),
      [send]
    ),
    addBot: useCallback((difficulty) => send({ action: "add_bot", difficulty }), [send]),
    removeBot: useCallback((seat) => send({ action: "remove_bot", seat }), [send]),
    rematch: useCallback(() => send({ action: "rematch" }), [send]),
    leave: useCallback(() => send({ action: "leave" }), [send]),
    onEvents: useCallback((handler) => {
      eventsHandlerRef.current = handler;
      const pending = pendingEventsRef.current;
      pendingEventsRef.current = [];
      for (const { events, view } of pending) handler(events, view);
    }, []),
  };
}
