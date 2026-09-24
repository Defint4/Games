"use client";

import { animate, motionValue } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { sfx, vibrate } from "@/lib/sound";
import { CardView, type CardMotion } from "./Card";
import {
  COLUMNS,
  FOUNDATIONS,
  grabCount,
  locate,
  moveString,
  parseDeck,
  tapMove,
  type Card,
  type State,
} from "./engine";
import {
  dropRect,
  foundationX,
  geometry,
  place,
  stockX,
  type Geometry,
  type Placement,
} from "./layout";
import { T } from "./i18n";

/* Le plateau. Chaque carte a ses propres valeurs animées (x, y, profondeur, élévation) :
   quand l'état du jeu change, on calcule la nouvelle place de chaque carte et celles qui
   ont bougé y volent depuis là où elles sont — y compris sous le doigt après un
   glisser. Un seul mécanisme pour les coups, l'annulation, la distribution et la fin
   automatique. */

type Props = {
  deck: string;
  state: State;
  /* Donne neuve : les cartes partent du talon vers les colonnes, une à une. */
  dealing: boolean;
  interactive: boolean;
  /* Joue un coup ; faux s'il est illégal (rien n'a changé). */
  onMove: (move: string) => boolean;
  onDealt: () => void;
  onGeometry?: (g: Geometry, board: DOMRect) => void;
};

type Drag = {
  pointerId: number;
  cards: Card[];
  src: string;
  n: number;
  startX: number;
  startY: number;
  moved: boolean;
  base: { x: number; y: number }[];
  lastX: number;
  lastT: number;
  tilt: number;
};

const EASE = [0.25, 0.8, 0.25, 1] as const;
const DEAL_INTERVAL = 55;

export default function Board({
  deck,
  state,
  dealing,
  interactive,
  onMove,
  onDealt,
  onGeometry,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT(T).play;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () =>
      setSize((prev) => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return prev && prev.w === w && prev.h === h ? prev : { w, h };
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(() => (size ? geometry(size.w, size.h) : null), [size]);

  useEffect(() => {
    if (geo && ref.current) onGeometry?.(geo, ref.current.getBoundingClientRect());
  }, [geo, onGeometry]);

  // La distribution : une carte toutes les DEAL_INTERVAL ms, dès que la table est mesurée.
  const [dealt, setDealt] = useState(dealing ? 0 : 28);
  const measured = geo !== null;
  useEffect(() => {
    if (!dealing || !measured) return;
    sfx.shuffle();
    let k = 0;
    const timer = setInterval(() => {
      k += 1;
      setDealt(k);
      if (k % 4 === 1) sfx.flip();
      if (k >= 28) clearInterval(timer);
    }, DEAL_INTERVAL);
    return () => clearInterval(timer);
  }, [dealing, measured]);

  const onDealtRef = useRef(onDealt);
  useLayoutEffect(() => {
    onDealtRef.current = onDealt;
  });
  useEffect(() => {
    if (!dealing || dealt < 28) return;
    // Le temps que les dernières cartes se posent et se retournent.
    const timer = setTimeout(() => onDealtRef.current(), 420);
    return () => clearTimeout(timer);
  }, [dealing, dealt]);

  const cards = useMemo(() => parseDeck(deck), [deck]);
  const [motions] = useState(
    () =>
      new Map<Card, CardMotion>(
        cards.map((card) => [
          card,
          {
            x: motionValue(0),
            y: motionValue(0),
            z: motionValue(0),
            lift: motionValue(0),
            rot: motionValue(0),
          },
        ]),
      ),
  );

  const placements = useMemo(
    () => (geo ? place(state, geo, dealt) : null),
    [state, geo, dealt],
  );

  // Dernières valeurs, pour les gestionnaires d'événements (stables).
  const latest = useRef({ state, geo, placements, interactive, onMove });
  useLayoutEffect(() => {
    latest.current = { state, geo, placements, interactive, onMove };
  });

  // --- Vols ------------------------------------------------------------------

  const shown = useRef<Map<Card, Placement> | null>(null);
  const shownGeo = useRef<Geometry | null>(null);
  // Vol en cours par carte : seul le dernier vol lancé la repose à sa profondeur.
  const flights = useRef(new Map<Card, number>());
  const flightSeq = useRef(0);

  const fly = useCallback(
    (card: Card, to: Placement) => {
      const mv = motions.get(card)!;
      const id = ++flightSeq.current;
      flights.current.set(card, id);
      // En vol, au-dessus de tout ; une pile qui bouge garde son ordre.
      mv.z.set(1000 + to.z);
      const dist = Math.hypot(to.x - mv.x.get(), to.y - mv.y.get());
      const duration = Math.min(0.42, 0.2 + dist / 2400);
      animate(mv.x, to.x, { duration, ease: EASE });
      if (mv.lift.get() > 0.01) animate(mv.lift, 0, { duration });
      else if (dist > 60) animate(mv.lift, [0, 0.55, 0], { duration, ease: "easeInOut" });
      animate(mv.rot, 0, { duration: 0.2 });
      animate(mv.y, to.y, { duration, ease: EASE }).then(() => {
        if (flights.current.get(card) !== id) return;
        flights.current.delete(card);
        mv.z.set(shown.current?.get(card)?.z ?? to.z);
      });
    },
    [motions],
  );

  useLayoutEffect(() => {
    if (!placements || !geo) return;
    // Premier affichage ou taille changée : chacun à sa place, sans vol.
    const instant = shownGeo.current !== geo;
    const before = shown.current;
    shown.current = placements;
    shownGeo.current = geo;
    for (const [card, to] of placements) {
      const mv = motions.get(card)!;
      const from = before?.get(card);
      if (instant || !from) {
        mv.x.set(to.x);
        mv.y.set(to.y);
        mv.z.set(to.z);
      } else if (from.x !== to.x || from.y !== to.y) {
        fly(card, to);
      } else if (!flights.current.has(card)) {
        mv.z.set(to.z);
      }
    }
  }, [placements, geo, motions, fly]);

  // --- Gestes ------------------------------------------------------------------

  const drag = useRef<Drag | null>(null);
  const untilt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nope = useCallback(
    (moved: Card[]) => {
      sfx.nope();
      vibrate(25);
      const placed = latest.current.placements;
      for (const card of moved) {
        const x = placed?.get(card)?.x;
        if (x === undefined) continue;
        animate(motions.get(card)!.x, [x, x - 6, x + 6, x - 3, x + 3, x], { duration: 0.32 });
      }
    },
    [motions],
  );

  const onCardDown = useCallback(
    (card: Card, e: React.PointerEvent) => {
      const { state: st, placements: placed, interactive: live } = latest.current;
      if (!live || drag.current || e.button > 0 || !placed) return;
      const where = locate(st, card);
      if (!where) return;
      if (where.pile === "s") {
        latest.current.onMove("d");
        return;
      }
      const n = grabCount(st, where);
      if (!n) return;
      const pile =
        where.pile === "w"
          ? st.waste
          : where.pile[0] === "f"
            ? st.foundations[Number(where.pile[1])]
            : st.tableau[Number(where.pile[1])].map((s) => s.card);
      const grabbed = pile.slice(where.index, where.index + n);
      drag.current = {
        pointerId: e.pointerId,
        cards: grabbed,
        src: where.pile,
        n,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        base: grabbed.map((c) => ({ x: placed.get(c)!.x, y: placed.get(c)!.y })),
        lastX: e.clientX,
        lastT: e.timeStamp,
        tilt: 0,
      };
      ref.current?.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      d.cards.forEach((card, i) => {
        const mv = motions.get(card)!;
        mv.x.stop();
        mv.y.stop();
        flights.current.delete(card);
        mv.z.set(2000 + i);
        animate(mv.lift, 1, { duration: 0.14 });
      });
    }
    d.cards.forEach((card, i) => {
      const mv = motions.get(card)!;
      mv.x.set(d.base[i].x + dx);
      mv.y.set(d.base[i].y + dy);
    });
    // Une carte seule s'incline selon la vitesse du doigt, puis se redresse à l'arrêt.
    if (d.n === 1) {
      const speed = (e.clientX - d.lastX) / Math.max(1, e.timeStamp - d.lastT);
      d.tilt = d.tilt * 0.7 + Math.max(-10, Math.min(10, speed * 10)) * 0.3;
      const rot = motions.get(d.cards[0])!.rot;
      rot.set(d.tilt);
      if (untilt.current) clearTimeout(untilt.current);
      untilt.current = setTimeout(() => {
        if (drag.current === d) {
          d.tilt = 0;
          animate(rot, 0, { type: "spring", stiffness: 300, damping: 18 });
        }
      }, 90);
    }
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
  };

  const release = (e: React.PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    const { state: st, geo: g, onMove: play } = latest.current;

    if (!d.moved) {
      if (cancelled) return;
      const where = locate(st, d.cards[0]);
      const move = where && tapMove(st, where);
      if (!move || !play(move)) nope(d.cards);
      return;
    }

    let landed = false;
    if (!cancelled && g) {
      // La pile sous la carte lâchée : celle qu'elle recouvre le plus.
      const x = d.base[0].x + (e.clientX - d.startX);
      const y = d.base[0].y + (e.clientY - d.startY);
      const piles = [
        ...(d.n === 1 ? Array.from({ length: FOUNDATIONS }, (_, f) => `f${f}`) : []),
        ...Array.from({ length: COLUMNS }, (_, c) => `t${c}`),
      ].filter((p) => p !== d.src);
      const overlaps = piles
        .map((pile) => {
          const r = dropRect(st, g, pile);
          const w = Math.min(x + g.cardW, r.x + g.cardW) - Math.max(x, r.x);
          const h = Math.min(y + g.cardH, r.y + g.cardH) - Math.max(y, r.y);
          return { pile, area: w > 0 && h > 0 ? w * h : 0 };
        })
        .filter((o) => o.area > 0)
        .sort((a, b) => b.area - a.area);
      for (const { pile } of overlaps) {
        if (play(moveString(d.src, pile, d.n))) {
          landed = true;
          break;
        }
      }
    }
    if (!landed) {
      // Retour à la case départ.
      const placed = latest.current.placements;
      for (const card of d.cards) {
        const to = placed?.get(card);
        if (to) fly(card, to);
      }
      sfx.pickup();
    }
  };

  const stockEmpty = state.stock.length === 0;
  const canRecycle = stockEmpty && state.waste.length > 0;

  return (
    <div
      ref={ref}
      className="relative h-full w-full touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
    >
      {geo && placements && (
        <>
          {Array.from({ length: FOUNDATIONS }, (_, f) => (
            <Slot key={`f${f}`} g={geo} x={foundationX(geo, f)} y={geo.topY} mark="A" />
          ))}
          {Array.from({ length: COLUMNS }, (_, c) => (
            <Slot key={`t${c}`} g={geo} x={geo.colX[c]} y={geo.tableauY} mark="K" />
          ))}
          <button
            type="button"
            aria-label={t.recycle}
            disabled={!interactive || !canRecycle}
            data-silent
            onPointerDown={() => {
              if (interactive && canRecycle) onMove("d");
            }}
            className="absolute rounded-[10%] border border-white/15 bg-black/10"
            style={{ left: stockX(geo), top: geo.topY, width: geo.cardW, height: geo.cardH }}
          >
            {stockEmpty && (
              <RecycleIcon
                className={`mx-auto ${canRecycle ? "text-ivory-dim/60" : "text-ivory-dim/15"}`}
                size={geo.cardW * 0.5}
              />
            )}
          </button>
          {cards.map((card) => (
            <CardView
              key={card}
              card={card}
              motion={motions.get(card)!}
              up={placements.get(card)!.up}
              flat={placements.get(card)!.flat ?? false}
              w={geo.cardW}
              h={geo.cardH}
              onPointerDown={onCardDown}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* Emplacement vide : un liseré sur le tapis, la carte attendue en filigrane. */
function Slot({ g, x, y, mark }: { g: Geometry; x: number; y: number; mark: string }) {
  return (
    <span
      aria-hidden
      className="absolute flex items-center justify-center border border-white/15 bg-black/10 font-extrabold text-white/10"
      style={{
        left: x,
        top: y,
        width: g.cardW,
        height: g.cardH,
        borderRadius: g.cardW * 0.1,
        fontSize: g.cardW * 0.45,
      }}
    >
      {mark}
    </span>
  );
}

function RecycleIcon({ className, size }: { className: string; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={`fill-none stroke-current stroke-[2.4] ${className}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
    </svg>
  );
}
