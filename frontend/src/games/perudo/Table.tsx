"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { ShufflingCards } from "@/components/Loading";
import TableReactions from "@/components/TableReactions";
import { EMOTES } from "@/lib/emotes";
import { useT } from "@/lib/i18n";
import { sfx, vibrate } from "@/lib/sound";
import type { GameEvent } from "@/lib/types";
import { DICE_COLORS } from "./colors";
import DieFace from "./DieFace";
import { T } from "./i18n";
import { GAME } from "./meta";
import { isLegalBid, minQuantity, suggestedBid } from "./rules";
import type { PerudoSocket } from "./socket";
import type { SceneHandle } from "./three/TableScene";
import type { Bid, PlayerView, Reveal, RoomView } from "./types";

/* La table du Perudo. La 3D (gobelets, dés) rejoue les événements du serveur l'un
   après l'autre ; l'interface par-dessus (enchère en cours, sélecteur, Dudo, Calza)
   suit la vue affichée, qui ne bascule qu'une fois l'animation du coup jouée.
   three.js n'est chargé qu'ici, en différé. */

const TableScene = dynamic(() => import("./three/TableScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <ShufflingCards />
    </div>
  ),
});

const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
const anyDice = (n: number) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));

type Callout =
  | { kind: "call"; text: string; tone: "dudo" | "calza" }
  | { kind: "outcome"; text: string; good: boolean };

export default function Table({ socket, view: live }: { socket: PerudoSocket; view: RoomView }) {
  const t = useT(T);
  const [shown, setShown] = useState(live);
  const shownRef = useRef(live);
  const scene = useRef<SceneHandle | null>(null);
  const [peek, setPeek] = useState(true);
  const peekRef = useRef(true);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [lastBid, setLastBid] = useState<Bid | null>(live.bid);
  // Révélation en cours : les dés de chacun, pour le tableau récapitulatif.
  const [tally, setTally] = useState<{ reveal: Reveal; wild: boolean } | null>(null);
  const queue = useRef<{ events: GameEvent[]; next: RoomView }[]>([]);
  const busy = useRef(false);
  const drainRef = useRef<() => void>(() => {});
  // Ton gobelet est en pleine animation (lancer, révélation) : un tap ne le soulève pas.
  const cupLocked = useRef(false);
  const calloutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = shown.your_seat;

  const commit = useCallback((next: RoomView) => {
    shownRef.current = next;
    setShown(next);
    setLastBid(next.bid);
  }, []);

  /* Pose la table telle que la vue la décrit, sans animation. */
  const sync = useCallback((v: RoomView) => {
    const s = scene.current;
    if (!s) return;
    for (const p of v.players) {
      const seat = s.seat(p.seat);
      if (!seat) continue;
      if (!p.alive) seat.place([], "out");
      else if (v.phase === "reveal" && v.reveal) seat.place(v.reveal.dice[p.seat] ?? [], "open");
      else if (p.seat === v.your_seat) seat.place(v.your_dice, peekRef.current ? "peek" : "closed");
      else seat.place(anyDice(p.dice_count), "closed");
    }
  }, []);

  const onSceneReady = useCallback(
    (handle: SceneHandle) => {
      scene.current = handle;
      const v = shownRef.current;
      // Des événements attendaient la scène (le premier lancer, gardé depuis le lobby) :
      // on les joue maintenant qu'elle est là.
      if (queue.current.length) {
        sync(v);
        if (!busy.current) drainRef.current();
        return;
      }
      // Arrivée en début de manche sans son histoire (rechargement de la page) : on joue
      // quand même le lancer plutôt que de poser des dés déjà tirés.
      if (v.status === "playing" && v.phase === "bidding" && v.history.length === 0) {
        const intro = {
          type: "round_started",
          dice_counts: v.players.map((p) => (p.alive ? p.dice_count : 0)),
        };
        queue.current.unshift({ events: [intro], next: v });
        if (!busy.current) drainRef.current();
        return;
      }
      sync(v);
    },
    [sync],
  );

  const togglePeek = useCallback(() => {
    const v = shownRef.current;
    if (cupLocked.current || v.phase !== "bidding" || !v.you_alive) return;
    const open = !peekRef.current;
    peekRef.current = open;
    setPeek(open);
    void scene.current?.seat(v.your_seat)?.peek(open);
  }, []);

  /* Rejoue un lot d'événements sur la scène, puis bascule la vue affichée. */
  const play = useCallback(
    async (events: GameEvent[], before: RoomView, next: RoomView) => {
      const s = scene.current;
      const seatOf = (i: number) => s?.seat(i) ?? null;
      const name = (i: number) => next.players[i]?.pseudo ?? "?";
      const alive = (v: RoomView) => v.players.filter((p) => p.alive);
      let handled = false;
      for (const e of events) {
        switch (e.type) {
          case "round_started": {
            handled = true;
            cupLocked.current = true;
            const counts = e.dice_counts as number[];
            // Gobelets encore levés de la révélation : on les repose d'abord.
            if (before.phase === "reveal") {
              await Promise.all(alive(before).map((p) => seatOf(p.seat)?.cover()));
            } else if (peekRef.current) {
              await seatOf(me)?.peek(false);
            }
            setCallout(null);
            setTally(null);
            sfx.diceShake();
            const shaking = next.players.filter((p) => counts[p.seat] > 0);
            await Promise.all(shaking.map((p) => seatOf(p.seat)?.shake()));
            sfx.diceThrow();
            await Promise.all(
              shaking.map((p) =>
                seatOf(p.seat)?.slam(p.seat === me ? next.your_dice : anyDice(counts[p.seat])),
              ),
            );
            if (counts[me] > 0) {
              peekRef.current = true;
              setPeek(true);
              await seatOf(me)?.peek(true);
            }
            cupLocked.current = false;
            break;
          }
          case "bid":
            setLastBid({
              quantity: e.quantity as number,
              face: e.face as number,
              player: e.player as number,
            });
            setCallout(null);
            sfx.chip();
            await wait(0.45);
            break;
          case "turn":
            if (e.player === me && next.status === "playing") {
              sfx.yourTurn();
              vibrate(40);
            }
            break;
          case "dudo":
          case "calza": {
            handled = true;
            cupLocked.current = true;
            const reveal = e as unknown as Reveal;
            const tone = e.type;
            setCallout({ kind: "call", text: t.reveal[tone](name(reveal.caller)), tone });
            sfx.thud();
            vibrate(tone === "dudo" ? [60, 40, 60] : 50);
            if (peekRef.current) {
              peekRef.current = false;
              setPeek(false);
            }
            await wait(0.9);
            sfx.diceGrab();
            const wild = !before.palifico;
            await Promise.all(
              before.players
                .filter((p) => p.alive)
                .map((p) =>
                  seatOf(p.seat)?.reveal(reveal.dice[p.seat] ?? [], reveal.bid.face, wild),
                ),
            );
            setCallout(null);
            setTally({ reveal, wild });
            await wait(1.6);
            break;
          }
          case "die_lost": {
            const who = e.player as number;
            setCallout({
              kind: "outcome",
              text: who === me ? t.reveal.youLose : t.reveal.loses(name(who)),
              good: false,
            });
            sfx.dieRoll();
            await seatOf(who)?.loseDie();
            await wait(0.8);
            break;
          }
          case "die_gained": {
            const who = e.player as number;
            setCallout({
              kind: "outcome",
              text: who === me ? t.reveal.youGain : t.reveal.gains(name(who)),
              good: true,
            });
            sfx.dieRoll();
            await seatOf(who)?.gainDie();
            await wait(0.8);
            break;
          }
          case "eliminated": {
            const who = e.player as number;
            setCallout({
              kind: "outcome",
              text: who === me ? t.reveal.youOut : t.reveal.eliminated(name(who)),
              good: false,
            });
            sfx.thud();
            await seatOf(who)?.knockOver();
            await wait(0.8);
            break;
          }
          case "game_over":
            if (e.winner === me) sfx.win();
            else sfx.lose();
            break;
          case "auto_played": {
            const text = t.reveal.timeout(name(e.player as number));
            setCallout({ kind: "outcome", text, good: false });
            // Un simple avis : il s'efface de lui-même et rend la place à l'enchère.
            if (calloutTimer.current) clearTimeout(calloutTimer.current);
            calloutTimer.current = setTimeout(
              () => setCallout((c) => (c?.kind === "outcome" && c.text === text ? null : c)),
              2200,
            );
            break;
          }
        }
      }
      // Vue arrivée sans son histoire (reconnexion) : on repose la table telle quelle.
      if (!handled && (next.round !== before.round || next.phase !== before.phase)) sync(next);
    },
    [me, sync, t],
  );

  const { onEvents } = socket;
  useEffect(() => {
    onEvents((events, next) => {
      queue.current.push({ events, next });
      if (!busy.current) void drain();
    });
    drainRef.current = () => void drain();
    async function drain() {
      // La scène 3D se charge en différé : on attend qu'elle soit prête (onSceneReady
      // relance la file) plutôt que de faire défiler les coups sans les montrer.
      if (!scene.current) return;
      busy.current = true;
      try {
        while (queue.current.length) {
          // Retour d'arrière-plan : les coups se sont empilés. On ne les rejoue pas un
          // par un pendant que la partie continue, on pose directement la dernière vue.
          if (queue.current.length > 2) {
            const last = queue.current[queue.current.length - 1].next;
            queue.current = [];
            setCallout(null);
            setTally(null);
            cupLocked.current = last.phase !== "bidding";
            sync(last);
            commit(last);
            break;
          }
          const { events, next } = queue.current.shift()!;
          await play(events, shownRef.current, next);
          commit(next);
        }
      } finally {
        busy.current = false;
      }
    }
  }, [onEvents, play, commit, sync]);

  // Une vue sans événement (reconnexion, sync) arrivée hors séquence.
  useEffect(() => {
    if (!busy.current && !queue.current.length && live !== shownRef.current) {
      const before = shownRef.current;
      if (live.round !== before.round || live.phase !== before.phase) sync(live);
      commit(live);
    }
  }, [live, commit, sync]);

  const liveTurn = live.turn === me && live.status === "playing" && live.phase === "bidding";
  const myTurn = liveTurn && shown.turn === me && shown.phase === "bidding";
  const bidder = lastBid ? shown.players[lastBid.player] : null;

  return (
    <div className="relative h-full">
      <div className="absolute inset-0">
        <TableScene
          players={shown.players}
          me={me}
          onMyCupTap={togglePeek}
          onReady={onSceneReady}
        />
      </div>

      <Banner view={shown} myTurn={myTurn} />
      <OpponentStrip view={shown} lastBid={lastBid} emotes={socket.emotes} />
      {shown.palifico && shown.phase === "bidding" && (
        <p className="pointer-events-none absolute inset-x-0 top-[29%] z-10 mx-auto w-max max-w-[90%] rounded-full bg-card-red/90 px-3 py-1 text-center text-xs font-bold text-ivory shadow-card">
          {t.banner.palifico}
        </p>
      )}
      {tally && <RevealTally tally={tally} view={shown} />}

      {/* L'enchère en cours, au centre du tapis. */}
      <div
        className={`pointer-events-none absolute inset-x-0 flex justify-center ${
          tally ? "top-[62%]" : "top-[36%]"
        }`}
      >
        <AnimatePresence mode="wait">
          {callout ? (
            <CalloutCard key={JSON.stringify(callout)} callout={callout} />
          ) : lastBid && bidder ? (
            <BidPlate key={`${lastBid.player}-${lastBid.quantity}-${lastBid.face}`} bid={lastBid} bidder={bidder} you={lastBid.player === me} />
          ) : shown.phase === "bidding" ? (
            <motion.p
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="whitespace-nowrap rounded-full bg-felt-900/70 px-3 py-1 text-xs font-semibold text-ivory-dim/80"
            >
              {t.bid.none} · {t.bid.inPlay(shown.total_dice)}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <BottomPanel socket={socket} view={shown} live={live} myTurn={myTurn} peek={peek} />
      {shown.status === "playing" && (
        <TableReactions
          socket={socket}
          view={shown}
          className={myTurn ? "bottom-[15.5rem]" : "bottom-24"}
        />
      )}

      {shown.status === "finished" && <Results view={shown} socket={socket} />}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Bandeau, enchère, annonces                                               */
/* ----------------------------------------------------------------------- */

function Banner({ view, myTurn }: { view: RoomView; myTurn: boolean }) {
  const t = useT(T).banner;
  let text = "";
  if (view.status === "playing") {
    if (!view.you_alive) text = t.out;
    else if (view.phase === "reveal") text = t.reveal;
    else if (myTurn) text = view.bid ? t.yourTurn : t.yourOpening;
    else if (view.turn !== null) text = t.turnOf(view.players[view.turn].pseudo);
  }
  const timerKey = `${view.round}-${view.history.length}-${view.turn}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pl-4 pr-14 pt-3">
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18 }}
          className={`truncate rounded-full px-3 py-1 text-sm font-bold shadow-card ${
            myTurn ? "bg-gold text-ink" : "bg-felt-900/80 text-ivory-dim"
          }`}
        >
          {text}
        </motion.p>
      </AnimatePresence>
      {view.phase === "bidding" && view.turn_remaining !== null && (
        <TimerBar key={timerKey} remaining={view.turn_remaining} total={view.turn_seconds} />
      )}
    </div>
  );
}

function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGone(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const start = Math.max(0, remaining) / Math.max(total, 1);
  return (
    <div className="h-1 w-28 overflow-hidden rounded-full bg-black/40">
      <div
        className="h-full rounded-full bg-gold"
        style={{
          width: `${(gone ? 0 : start) * 100}%`,
          transition: gone ? `width ${remaining}s linear` : undefined,
        }}
      />
    </div>
  );
}

/* Les adversaires en haut de l'écran, dans l'ordre des tours (de gauche à droite comme
   leurs gobelets) : avatar, pseudo, dés restants, et sous la fiche sa dernière enchère. */
function OpponentStrip({
  view,
  lastBid,
  emotes,
}: {
  view: RoomView;
  lastBid: Bid | null;
  emotes: PerudoSocket["emotes"];
}) {
  const t = useT(T).seat;
  const n = view.players.length;
  const me = view.your_seat;
  const opponents = Array.from({ length: n - 1 }, (_, i) => view.players[(me + 1 + i) % n]);
  const lastBids = new Map(view.history.map((b) => [b.player, b]));
  if (lastBid) lastBids.set(lastBid.player, lastBid);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center gap-1.5 px-2">
      {opponents.map((p, i) => {
        const color = DICE_COLORS[(i + 1) % DICE_COLORS.length];
        const active = view.phase === "bidding" && view.turn === p.seat;
        const bid = view.phase === "bidding" ? lastBids.get(p.seat) : undefined;
        const emote = emotes.findLast((e) => e.seat === p.seat);
        return (
          <div key={p.seat} className="relative flex w-[4.4rem] flex-col items-center gap-1">
            <AnimatePresence>
              {emote && (
                <motion.span
                  key={emote.id}
                  initial={{ opacity: 0, scale: 0.4, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute -top-3 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xl"
                >
                  {EMOTES[emote.emote] ?? emote.emote}
                </motion.span>
              )}
            </AnimatePresence>
            <div
              className={`flex w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-1 text-[0.68rem] font-bold leading-tight shadow-card transition-all duration-300 ${
                active ? "scale-105 bg-gold text-ink" : "bg-felt-900/80 text-ivory ring-1 ring-white/10"
              } ${p.alive ? "" : "opacity-45"}`}
            >
              <span className="rounded-full p-0.5" style={{ background: color.band }}>
                <Avatar id={p.avatar} size="sm" dimmed={!p.connected} />
              </span>
              <span className="w-full truncate text-center">{p.pseudo.replace(/ bot$/, "")}</span>
              {p.alive ? (
                <span className="flex h-2 items-center gap-0.5">
                  {Array.from({ length: p.dice_count }, (_, k) => (
                    <span
                      key={k}
                      className="block size-2 rounded-[3px] ring-1 ring-black/30"
                      style={{ background: color.body }}
                    />
                  ))}
                </span>
              ) : (
                <span className="h-2 text-[0.6rem] leading-none">{t.out}</span>
              )}
            </div>
            <AnimatePresence>
              {bid && (
                <motion.span
                  key={`${bid.quantity}-${bid.face}`}
                  initial={{ opacity: 0, y: -6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-extrabold shadow-card ${
                    lastBid?.player === p.seat ? "bg-ivory text-ink" : "bg-black/40 text-ivory-dim/70"
                  }`}
                >
                  {bid.quantity}×<DieFace value={bid.face} className="size-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* Gobelets levés : les dés de chacun sur une ligne, ceux qui comptent entourés d'or,
   et le compte. Plus lisible sur un téléphone que les dés lointains de la 3D. */
function RevealTally({ tally, view }: { tally: { reveal: Reveal; wild: boolean }; view: RoomView }) {
  const t = useT(T);
  const { reveal, wild } = tally;
  const n = view.players.length;
  const me = view.your_seat;
  const order = Array.from({ length: n }, (_, i) => view.players[(me + 1 + i) % n]).filter(
    (p) => (reveal.dice[p.seat] ?? []).length > 0,
  );
  const counts = (v: number) => v === reveal.bid.face || (wild && v === 1 && reveal.bid.face !== 1);
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="pointer-events-none absolute inset-x-3 top-[24%] z-10 mx-auto flex max-w-sm flex-col gap-1.5 rounded-3xl bg-felt-900/90 p-3 shadow-card ring-1 ring-gold/40 backdrop-blur-sm"
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm font-semibold text-ivory-dim">
          {reveal.bid.quantity} × <DieFace value={reveal.bid.face} className="inline size-5 align-[-4px]" />
        </span>
        <span className="text-ivory-dim/50">→</span>
        <span className="text-lg font-extrabold text-gold">{t.reveal.count(reveal.count)}</span>
      </div>
      {order.map((p, row) => {
        const rel = (p.seat - me + n) % n;
        const color = DICE_COLORS[rel % DICE_COLORS.length];
        return (
          <div key={p.seat} className="flex items-center gap-2">
            <Avatar id={p.avatar} size="sm" />
            <span className="w-14 truncate text-xs font-bold">
              {p.seat === me ? t.seat.you : p.pseudo.replace(/ bot$/, "")}
            </span>
            <span className="flex gap-1">
              {(reveal.dice[p.seat] ?? []).map((v, k) => (
                <motion.span
                  key={k}
                  initial={{ opacity: 0, scale: 0.4, rotate: -40 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ delay: 0.05 * (row * 5 + k), type: "spring", stiffness: 400, damping: 20 }}
                  className={`rounded-lg ${counts(v) ? "ring-2 ring-gold" : "opacity-60"}`}
                >
                  <DieFace value={v} color={color} className="size-6" />
                </motion.span>
              ))}
            </span>
          </div>
        );
      })}
    </motion.div>
  );
}

function BidPlate({ bid, bidder, you }: { bid: Bid; bidder: PlayerView; you: boolean }) {
  const t = useT(T).bid;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, y: -30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
      className="flex flex-col items-center gap-1"
    >
      <div className="flex items-center gap-2 rounded-2xl bg-felt-900/85 px-4 py-2 shadow-card ring-1 ring-gold/40 backdrop-blur-sm">
        <span className="text-4xl font-extrabold tabular-nums leading-none text-ivory">
          {bid.quantity}
        </span>
        <span className="text-xl font-bold text-ivory-dim/70">×</span>
        <DieFace value={bid.face} className="size-10" />
      </div>
      <p className="flex items-center gap-1 whitespace-nowrap rounded-full bg-felt-900/70 py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ivory-dim">
        <Avatar id={bidder.avatar} size="sm" />
        {you ? t.you : t.by(bidder.pseudo)}
      </p>
    </motion.div>
  );
}

function CalloutCard({ callout }: { callout: Callout }) {
  if (callout.kind === "call") {
    return (
      <motion.p
        initial={{ opacity: 0, scale: 1.8, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: -3 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className={`whitespace-nowrap rounded-2xl px-5 py-2 text-3xl font-extrabold shadow-card ${
          callout.tone === "dudo" ? "bg-card-red text-ivory" : "bg-gold text-ink"
        }`}
      >
        {callout.text}
      </motion.p>
    );
  }
  return (
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-base font-extrabold shadow-card ${
        callout.good ? "bg-gold text-ink" : "bg-felt-900/90 text-ivory ring-1 ring-card-red/60"
      }`}
    >
      {callout.text}
    </motion.p>
  );
}

/* ----------------------------------------------------------------------- */
/* Ta place : tes dés et tes enchères                                       */
/* ----------------------------------------------------------------------- */

function BottomPanel({
  socket,
  view,
  live,
  myTurn,
  peek,
}: {
  socket: PerudoSocket;
  view: RoomView;
  live: RoomView;
  myTurn: boolean;
  peek: boolean;
}) {
  const t = useT(T).controls;
  if (view.status !== "playing" || !view.you_alive) return null;
  // Calza : n'importe quand pendant les enchères, sauf sur sa propre enchère — et
  // seulement sur l'enchère affichée (le serveur peut avoir une annonce d'avance).
  const sameBid =
    !!view.bid &&
    !!live.bid &&
    view.bid.player === live.bid.player &&
    view.bid.quantity === live.bid.quantity &&
    view.bid.face === live.bid.face;
  const calza = live.can_calza && view.phase === "bidding" && sameBid;
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-felt-900 via-felt-900/85 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
      {view.phase === "bidding" && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-semibold text-ivory-dim/70">{t.yourDice}</span>
          {view.your_dice.map((d, i) => (
            <DieFace key={i} value={d} className="size-7" />
          ))}
          {!peek && <span className="text-[0.65rem] text-ivory-dim/50">· {t.peek}</span>}
        </div>
      )}
      {myTurn ? (
        <BidPicker key={`${view.round}-${view.history.length}`} socket={socket} view={view} calza={calza} />
      ) : (
        calza && <CalzaButton key={`${view.round}-${view.history.length}`} socket={socket} />
      )}
    </div>
  );
}

/* Calza hors de ton tour : un seul envoi par enchère (le serveur tranche au premier). */
function CalzaButton({ socket }: { socket: PerudoSocket }) {
  const t = useT(T).controls;
  const [sent, setSent] = useState(false);
  const [seenError, setSeenError] = useState(socket.error);
  if (socket.error !== seenError) {
    setSeenError(socket.error);
    if (socket.error) setSent(false);
  }
  return (
    <button
      type="button"
      disabled={sent}
      onClick={() => {
        setSent(true);
        socket.calza();
      }}
      className="mx-auto rounded-2xl bg-black/40 px-5 py-2.5 text-sm font-extrabold text-gold ring-1 ring-gold/50 active:scale-95 disabled:opacity-50"
    >
      {t.calza} · <span className="font-semibold text-ivory-dim">{t.calzaHint}</span>
    </button>
  );
}

function BidPicker({ socket, view, calza }: { socket: PerudoSocket; view: RoomView; calza: boolean }) {
  const t = useT(T).controls;
  const initial = suggestedBid(view);
  const [face, setFace] = useState(initial?.face ?? 2);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [sent, setSent] = useState(false);
  // Coup refusé par le serveur : les boutons reviennent (sinon tu resterais bloqué).
  const [seenError, setSeenError] = useState(socket.error);
  if (socket.error !== seenError) {
    setSeenError(socket.error);
    if (socket.error) setSent(false);
  }
  const legal = isLegalBid(view, quantity, face);
  const color = DICE_COLORS[0];

  const pickFace = (f: number) => {
    const min = minQuantity(view, f);
    if (min === null) return;
    setFace(f);
    setQuantity((q) => (isLegalBid(view, q, f) ? q : min));
  };
  const act = (fn: () => void) => {
    if (sent) return;
    setSent(true);
    fn();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="flex flex-col gap-2 rounded-3xl bg-felt-800/95 p-3 shadow-card ring-1 ring-white/10"
    >
      <div className="flex items-center justify-between gap-1">
        {[2, 3, 4, 5, 6, 1].map((f) => {
          const possible = minQuantity(view, f) !== null;
          return (
            <button
              key={f}
              type="button"
              disabled={!possible}
              aria-label={`${f}`}
              aria-pressed={face === f}
              onClick={() => pickFace(f)}
              className={`rounded-xl p-1 transition-transform ${
                face === f ? "scale-110 bg-gold/25 ring-2 ring-gold" : "active:scale-90"
              }`}
            >
              <DieFace value={f} color={color} className="size-10" dim={!possible} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t.less}
          disabled={!isLegalBid(view, quantity - 1, face)}
          onClick={() => setQuantity((q) => q - 1)}
          className="size-11 rounded-xl bg-black/30 text-2xl font-bold ring-1 ring-white/15 active:scale-90 disabled:opacity-30"
        >
          −
        </button>
        <span className="w-10 text-center text-3xl font-extrabold tabular-nums">{quantity}</span>
        <button
          type="button"
          aria-label={t.more}
          disabled={quantity >= view.total_dice}
          onClick={() => setQuantity((q) => q + 1)}
          className="size-11 rounded-xl bg-black/30 text-2xl font-bold ring-1 ring-white/15 active:scale-90 disabled:opacity-30"
        >
          +
        </button>
        <button
          type="button"
          disabled={!legal || sent}
          onClick={() => act(() => socket.bid(quantity, face))}
          className="flex grow items-center justify-center gap-2 rounded-2xl bg-gold py-3 text-base font-extrabold text-ink shadow-card active:translate-y-0.5 disabled:opacity-40"
        >
          {t.bid(quantity)} <DieFace value={face} className="size-6" />
        </button>
      </div>
      {view.bid && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={sent}
            onClick={() => act(() => socket.dudo())}
            className="grow rounded-2xl bg-card-red py-3 text-lg font-extrabold text-ivory shadow-card active:translate-y-0.5 disabled:opacity-40"
          >
            {t.dudo}
          </button>
          {calza && (
            <button
              type="button"
              disabled={sent}
              onClick={() => act(() => socket.calza())}
              className="rounded-2xl bg-black/35 px-4 py-3 font-extrabold text-gold ring-1 ring-gold/50 active:translate-y-0.5 disabled:opacity-40"
            >
              {t.calza}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/* Fin de partie                                                            */
/* ----------------------------------------------------------------------- */

function Results({ view, socket }: { view: RoomView; socket: PerudoSocket }) {
  const t = useT(T).results;
  const ranked = [...view.players].sort((a, b) => (a.finish_rank ?? 99) - (b.finish_rank ?? 99));
  const winner = ranked[0];
  const won = winner.seat === view.your_seat;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 1.2 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-felt-900/75 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.86, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22, delay: 1.35 }}
        className="flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-felt-800 p-5 ring-1 ring-white/10"
      >
        <h2 className="text-center text-2xl font-extrabold">
          {won ? t.youWon : t.wins(winner.pseudo)}
        </h2>
        <ol className="flex flex-col gap-1">
          {ranked.map((p, i) => (
            <motion.li
              key={p.seat}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5 + i * 0.08 }}
              className="flex items-center gap-2 rounded-xl bg-black/25 p-2"
            >
              <span className="w-5 text-center text-sm font-extrabold text-gold">{p.finish_rank}</span>
              <Avatar id={p.avatar} size="sm" />
              <span className="font-bold">{p.pseudo}</span>
            </motion.li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => socket.rematch()}
          className="rounded-2xl bg-gold py-3 text-center font-extrabold text-ink active:translate-y-0.5"
        >
          {t.rematch}
        </button>
        <Link
          href={GAME.path}
          className="rounded-2xl bg-black/25 py-3 text-center font-bold text-ivory-dim ring-1 ring-white/15"
        >
          {t.back}
        </Link>
      </motion.div>
    </motion.div>
  );
}
