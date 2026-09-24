"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { isPromotion } from "./game";
import { useChessPrefs, type BoardTheme } from "./prefs";
import { BOARDS, pieceUrl } from "./themes";

/* L'échiquier, à la manière de chess.com : on joue en glissant la pièce ou en tapant la
   pièce puis sa case ; dernier coup surligné, points des coups possibles, roi en échec
   rougi, prémoves en rouge, choix de la pièce à la promotion. Les pièces glissent d'une
   case à l'autre (celle qu'on vient de lâcher se pose sans rejouer le trajet).
   Le composant n'arbitre rien : il propose des coups parmi `dests`. */

const FILES = "abcdefgh";

type Piece = { color: Color; type: PieceSymbol };
type Tracked = Piece & { id: number; square: Square };

export type Arrow = { from: Square; to: Square; color: string };
export type Mark = { square: Square; node: React.ReactNode };

type Props = {
  fen: string;
  orientation: Color;
  lastMove?: { from: Square; to: Square } | null;
  /* Teinte du dernier coup à la place du jaune (bilan : la couleur de sa catégorie). */
  lastMoveColor?: string;
  check?: Square | null;
  /* "move" : c'est à nous ; "premove" : on prépare le coup suivant ; null : lecture seule. */
  mode?: "move" | "premove" | null;
  /* Cases d'arrivée possibles, par case de départ (coups légaux ou prémoves). */
  dests?: Map<Square, Square[]>;
  onMove?: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  premove?: { from: Square; to: Square } | null;
  onPremove?: (premove: { from: Square; to: Square } | null) => void;
  arrows?: Arrow[];
  marks?: Mark[];
};

function xy(square: Square, orientation: Color): [number, number] {
  const f = FILES.indexOf(square[0]);
  const r = Number(square[1]) - 1;
  return orientation === "w" ? [f, 7 - r] : [7 - f, r];
}

function squareAt(col: number, row: number, orientation: Color): Square | null {
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const f = orientation === "w" ? col : 7 - col;
  const r = orientation === "w" ? 7 - row : row;
  return `${FILES[f]}${r + 1}` as Square;
}

function parseFen(fen: string): Map<Square, Piece> {
  const pieces = new Map<Square, Piece>();
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          f += Number(ch);
          continue;
        }
        const type = ch.toLowerCase() as PieceSymbol;
        pieces.set(`${FILES[f]}${8 - i}` as Square, { color: ch === type ? "b" : "w", type });
        f += 1;
      }
    });
  return pieces;
}

function distance(a: Square, b: Square): number {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));
}

let nextId = 1;

/* Les pièces gardent leur identité d'une position à l'autre : celle qui a quitté une
   case pour une autre est la même, et glisse ; la prise disparaît. */
function track(prev: Tracked[], board: Map<Square, Piece>): Tracked[] {
  const next: Tracked[] = [];
  const left = [...prev];
  const appeared: [Square, Piece][] = [];
  for (const [square, piece] of board) {
    const i = left.findIndex(
      (p) => p.square === square && p.color === piece.color && p.type === piece.type,
    );
    if (i >= 0) next.push(left.splice(i, 1)[0]);
    else appeared.push([square, piece]);
  }
  for (const [square, piece] of appeared) {
    // Même pièce venue d'ailleurs, ou pion promu.
    const candidates = left
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.color === piece.color && (p.type === piece.type || p.type === "p"))
      .sort(
        (a, b) =>
          Number(b.p.type === piece.type) - Number(a.p.type === piece.type) ||
          distance(a.p.square, square) - distance(b.p.square, square),
      );
    if (candidates.length) {
      const { p, i } = candidates[0];
      left.splice(i, 1);
      next.push({ ...piece, id: p.id, square });
    } else {
      next.push({ ...piece, id: nextId++, square });
    }
  }
  return next;
}

type Drag = {
  from: Square;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  wasSelected: boolean;
  touch: boolean;
};

export default function Board({
  fen,
  orientation,
  lastMove,
  lastMoveColor,
  check,
  mode = null,
  dests,
  onMove,
  premove,
  onPremove,
  arrows,
  marks,
}: Props) {
  const prefs = useChessPrefs();
  const ref = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragging, setDragging] = useState<{ square: Square; touch: boolean } | null>(null);
  const [hover, setHover] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  // Case où l'on vient de lâcher une pièce : elle s'y pose sans rejouer le trajet.
  const [dropped, setDropped] = useState<Square | null>(null);
  const [shown, setShown] = useState(() => ({
    fen,
    pieces: track([], parseFen(fen)),
    instant: null as Square | null,
  }));

  const board = parseFen(fen);
  const toMove = fen.split(" ")[1] as Color;
  const player: Color | null =
    mode === "move" ? toMove : mode === "premove" ? (toMove === "w" ? "b" : "w") : null;

  let pieces = shown.pieces;
  let instant = shown.instant;
  if (shown.fen !== fen) {
    // Nouvelle position : les pièces glissent, la sélection ne survit que si la pièce
    // choisie est toujours là et toujours à nous.
    pieces = track(shown.pieces, board);
    instant = dropped;
    setShown({ fen, pieces, instant });
    setDropped(null);
    if (!dragging && selected && board.get(selected)?.color !== player) setSelected(null);
  }
  if (mode === null && (selected || promotion)) {
    setSelected(null);
    setPromotion(null);
  }

  const targets = selected && dests ? (dests.get(selected) ?? []) : [];

  function squareFromEvent(e: { clientX: number; clientY: number }): Square | null {
    const rect = ref.current!.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    return squareAt(col, row, orientation);
  }

  function play(from: Square, to: Square) {
    setSelected(null);
    if (mode === "premove") {
      onPremove?.({ from, to });
      return;
    }
    if (isPromotion(fen, from, to) && !prefs.autoQueen) {
      setPromotion({ from, to });
      return;
    }
    onMove?.(from, to, isPromotion(fen, from, to) ? "q" : undefined);
  }

  function moveGhost(x: number, y: number) {
    const ghost = ghostRef.current;
    const rect = ref.current?.getBoundingClientRect();
    if (!ghost || !rect) return;
    const size = rect.width / 8;
    // Au doigt, la pièce monte au-dessus du pouce pour rester visible.
    const lift = dragRef.current?.touch ? size * 0.55 : 0;
    ghost.style.transform = `translate(${x - rect.left - size / 2}px, ${y - rect.top - size / 2 - lift}px)`;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!player || promotion || e.button > 0) return;
    const square = squareFromEvent(e);
    if (!square) return;
    if (selected && targets.includes(square)) {
      play(selected, square);
      return;
    }
    const piece = board.get(square);
    if (piece?.color === player) {
      if (mode === "premove" && premove) onPremove?.(null);
      dragRef.current = {
        from: square,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        wasSelected: selected === square,
        touch: e.pointerType === "touch",
      };
      ref.current?.setPointerCapture(e.pointerId);
      setSelected(square);
      return;
    }
    setSelected(null);
    if (premove) onPremove?.(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
      drag.moved = true;
      setDragging({ square: drag.from, touch: drag.touch });
    }
    moveGhost(e.clientX, e.clientY);
    const square = squareFromEvent(e);
    setHover((h) => (h === square ? h : square));
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(null);
    setHover(null);
    if (!drag.moved) {
      // Tap sur la pièce déjà choisie : on la repose.
      if (drag.wasSelected) setSelected(null);
      return;
    }
    const to = squareFromEvent(e);
    const allowed = to && (dests?.get(drag.from) ?? []).includes(to);
    if (to && allowed) {
      setDropped(to);
      play(drag.from, to);
    } else if (to !== drag.from) {
      setSelected(null);
    }
  }

  function onPointerCancel() {
    dragRef.current = null;
    setDragging(null);
    setHover(null);
  }

  // Le fantôme apparaît sous le doigt dès le début du glissé.
  useEffect(() => {
    if (!dragging) return;
    const drag = dragRef.current;
    if (drag) moveGhost(drag.startX, drag.startY);
  });

  const style = BOARDS[prefs.board];
  const cell = (square: Square) => {
    const [col, row] = xy(square, orientation);
    return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
  };
  const draggedPiece = dragging ? board.get(dragging.square) : undefined;
  const lifted = dragging?.square;

  return (
    <div
      ref={ref}
      className="relative aspect-square w-full touch-none select-none overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Squares theme={prefs.board} orientation={orientation} coords={prefs.coords} />

      {/* Surlignages : dernier coup, pièce choisie, prémove, case survolée, échec. */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((s) => (
          <span
            key={`last-${s}`}
            className="absolute size-[12.5%]"
            style={{ ...cell(s), background: lastMoveColor ?? style.highlight }}
          />
        ))}
      {selected && (
        <span className="absolute size-[12.5%]" style={{ ...cell(selected), background: style.highlight }} />
      )}
      {premove &&
        [premove.from, premove.to].map((s) => (
          <span key={`pre-${s}`} className="absolute size-[12.5%] bg-[rgba(214,48,49,0.55)]" style={cell(s)} />
        ))}
      {check && (
        <span
          className="absolute size-[12.5%]"
          style={{
            ...cell(check),
            background:
              "radial-gradient(ellipse at center, #ff0000 0%, #e70000 25%, rgba(169,0,0,0) 89%, rgba(158,0,0,0) 100%)",
          }}
        />
      )}
      {hover && dragging && (
        <span
          className="absolute size-[12.5%] shadow-[inset_0_0_0_0.3rem_rgba(255,255,255,0.65)]"
          style={cell(hover)}
        />
      )}

      {/* Les pièces. */}
      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence initial={false}>
          {pieces.map((p) => {
            const [col, row] = xy(p.square, orientation);
            return (
              <motion.div
                key={p.id}
                className="absolute left-0 top-0 size-[12.5%] bg-cover will-change-transform"
                style={{
                  backgroundImage: `url(${pieceUrl(prefs.pieces, p.color, p.type)})`,
                  opacity: lifted === p.square ? 0.35 : 1,
                  zIndex: selected === p.square ? 2 : 1,
                }}
                initial={{ x: `${col * 100}%`, y: `${row * 100}%`, opacity: 0 }}
                animate={{
                  x: `${col * 100}%`,
                  y: `${row * 100}%`,
                  opacity: lifted === p.square ? 0.35 : 1,
                }}
                exit={{ opacity: 0, transition: { duration: 0.1, delay: 0.12 } }}
                transition={
                  instant === p.square
                    ? { duration: 0 }
                    : { duration: 0.2, ease: [0.25, 0.8, 0.35, 1] }
                }
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Coups possibles de la pièce choisie : un point, ou un anneau sur une prise. */}
      {prefs.legal &&
        targets.map((s) => (
          <span
            key={`dest-${s}`}
            className="pointer-events-none absolute z-10 size-[12.5%]"
            style={{
              ...cell(s),
              background: board.has(s)
                ? "radial-gradient(transparent 0%, transparent 79%, rgba(20,20,20,0.16) 80%)"
                : "radial-gradient(rgba(20,20,20,0.16) 19%, transparent 20%)",
            }}
          />
        ))}

      {marks?.map((m) => (
        <span
          key={`mark-${m.square}`}
          className="pointer-events-none absolute z-20 size-[12.5%]"
          style={cell(m.square)}
        >
          {m.node}
        </span>
      ))}

      {arrows && arrows.length > 0 && <Arrows arrows={arrows} orientation={orientation} />}

      {draggedPiece && (
        <div
          ref={ghostRef}
          className="pointer-events-none absolute left-0 top-0 z-30 size-[12.5%] bg-cover"
          style={{
            backgroundImage: `url(${pieceUrl(prefs.pieces, draggedPiece.color, draggedPiece.type)})`,
            scale: dragging?.touch ? 1.3 : 1.08,
            filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.35))",
          }}
        />
      )}

      {promotion && (
        <PromotionPicker
          color={board.get(promotion.from)?.color ?? "w"}
          square={promotion.to}
          orientation={orientation}
          onPick={(type) => {
            const { from, to } = promotion;
            setPromotion(null);
            onMove?.(from, to, type);
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  );
}

/* Les cases, la texture (bois, marbre) qui court sur tout le plateau, les coordonnées
   dans les coins comme sur chess.com. Dessin SVG sur une grille de 800 × 800. */
function Squares({
  theme,
  orientation,
  coords,
}: {
  theme: BoardTheme;
  orientation: Color;
  coords: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const style = BOARDS[theme];
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={col * 100}
          y={row * 100}
          width={100}
          height={100}
          fill={dark ? style.dark : style.light}
        />,
      );
    }
  }
  return (
    <svg viewBox="0 0 800 800" className="absolute inset-0 size-full" aria-hidden>
      {cells}
      {style.texture && (
        <>
          <filter id={`tex-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={style.texture.frequency}
              numOctaves={style.texture.octaves}
              seed={style.texture.seed}
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect
            width="800"
            height="800"
            filter={`url(#tex-${id})`}
            opacity={style.texture.opacity}
            style={{ mixBlendMode: "multiply" }}
          />
        </>
      )}
      {coords &&
        Array.from({ length: 8 }, (_, i) => {
          const rank = orientation === "w" ? 8 - i : i + 1;
          const file = orientation === "w" ? FILES[i] : FILES[7 - i];
          return (
            <g key={i} fontSize="20" fontWeight="700" fontFamily="system-ui, sans-serif">
              <text x={5} y={22 + i * 100} fill={i % 2 === 0 ? style.dark : style.light}>
                {rank}
              </text>
              <text
                x={i * 100 + 95}
                y={793}
                textAnchor="end"
                fill={i % 2 === 0 ? style.light : style.dark}
              >
                {file}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

function PromotionPicker({
  color,
  square,
  orientation,
  onPick,
  onCancel,
}: {
  color: Color;
  square: Square;
  orientation: Color;
  onPick: (type: PieceSymbol) => void;
  onCancel: () => void;
}) {
  const { pieces } = useChessPrefs();
  const [col, row] = xy(square, orientation);
  // La colonne part de la case de promotion vers le centre de l'échiquier.
  const down = row === 0;
  const choices: PieceSymbol[] = ["q", "n", "r", "b"];
  return (
    <div
      className="absolute inset-0 z-40 bg-black/45"
      onPointerDown={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute flex w-[12.5%] overflow-hidden rounded-md bg-ivory shadow-card"
        style={{
          left: `${col * 12.5}%`,
          top: down ? `${row * 12.5}%` : undefined,
          bottom: down ? undefined : `${(7 - row) * 12.5}%`,
          flexDirection: down ? "column" : "column-reverse",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {choices.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className="aspect-square w-full bg-cover active:bg-black/10"
            style={{ backgroundImage: `url(${pieceUrl(pieces, color, type)})` }}
            aria-label={type}
          />
        ))}
        <button
          type="button"
          onClick={onCancel}
          className="h-8 w-full text-lg font-bold text-ink/60"
          aria-label="×"
        >
          ×
        </button>
      </motion.div>
    </div>
  );
}

/* Flèches (meilleur coup au bilan). */
function Arrows({ arrows, orientation }: { arrows: Arrow[]; orientation: Color }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 800 800" className="pointer-events-none absolute inset-0 z-20 size-full" aria-hidden>
      {arrows.map((a, i) => {
        const [c1, r1] = xy(a.from, orientation);
        const [c2, r2] = xy(a.to, orientation);
        const x1 = c1 * 100 + 50;
        const y1 = r1 * 100 + 50;
        const x2 = c2 * 100 + 50;
        const y2 = r2 * 100 + 50;
        const len = Math.hypot(x2 - x1, y2 - y1);
        // La pointe s'arrête avant le centre de la case d'arrivée.
        const k = (len - 32) / len;
        return (
          <g key={i} opacity={0.82}>
            <defs>
              <marker
                id={`head-${id}-${i}`}
                markerWidth="4"
                markerHeight="4"
                refX="2.2"
                refY="2"
                orient="auto"
              >
                <path d="M0,0 L4,2 L0,4 z" fill={a.color} />
              </marker>
            </defs>
            <line
              x1={x1}
              y1={y1}
              x2={x1 + (x2 - x1) * k}
              y2={y1 + (y2 - y1) * k}
              stroke={a.color}
              strokeWidth={17}
              strokeLinecap="round"
              markerEnd={`url(#head-${id}-${i})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
