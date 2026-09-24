"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { memo, useContext, useState } from "react";
import { BACK_CSS, CardBackLabel } from "@/components/PlayingCard";
import { usePrefs } from "@/lib/prefs";
import { isRed, rank, suit } from "./engine";
import { BLACK_INK, RED_INK, SUIT_PATHS, rankLabel } from "./suits";

/* Une carte du Solitaire. Faces dessinées pour le jeu en cascade : on ne voit souvent
   que le haut d'une carte, l'index (rang et couleur) y est donc grand. Les figures
   n'ont pas de personnage (les SVG du deck Fomin ont de trop petits index pour ça) :
   leur couleur est posée dans un cadre, qui les distingue des cartes à points. */

export type CardMotion = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  z: MotionValue<number>;
  /* 0 posée, 1 soulevée (glissée, ou en vol) : ombre portée et léger grossissement. */
  lift: MotionValue<number>;
  /* Inclinaison (deg) prise en glissant, selon la vitesse du doigt. */
  rot: MotionValue<number>;
};

export function SuitIcon({
  s,
  className,
  style,
}: {
  s: keyof typeof SUIT_PATHS;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={style}>
      <path d={SUIT_PATHS[s]} fill="currentColor" />
    </svg>
  );
}

const SHADOW = "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.12)";

export function Face({ card, w, flat = false }: { card: string; w: number; flat?: boolean }) {
  const ink = isRed(card) ? RED_INK : BLACK_INK;
  const court = rank(card) > 10;
  const ten = card[0] === "T";
  return (
    <span
      className="absolute inset-0 block"
      style={{
        borderRadius: w * 0.1,
        color: ink,
        background: "linear-gradient(165deg, #fffdf8 0%, #f7f3e8 100%)",
        boxShadow: flat ? undefined : SHADOW,
      }}
    >
      <span
        className="absolute font-extrabold leading-none"
        style={{
          left: w * (ten ? 0.04 : 0.08),
          top: w * 0.06,
          fontSize: w * 0.36,
          letterSpacing: ten ? "-0.09em" : "-0.02em",
        }}
      >
        {rankLabel(card)}
      </span>
      <SuitIcon
        s={suit(card)}
        className="absolute"
        style={{ right: w * 0.07, top: w * 0.08, width: w * 0.28, height: w * 0.28 }}
      />
      {court ? (
        <span
          className="absolute flex items-center justify-center"
          style={{
            left: w * 0.1,
            right: w * 0.1,
            top: w * 0.52,
            bottom: w * 0.1,
            borderRadius: w * 0.06,
            border: `${Math.max(1, w * 0.025)}px solid ${ink}59`,
            background: `${ink}0f`,
          }}
        >
          <SuitIcon s={suit(card)} style={{ width: w * 0.44, height: w * 0.44 }} />
        </span>
      ) : (
        <SuitIcon
          s={suit(card)}
          className="absolute"
          style={{
            left: "50%",
            bottom: w * 0.14,
            width: w * 0.56,
            height: w * 0.56,
            transform: "translateX(-50%)",
          }}
        />
      )}
    </span>
  );
}

export function Back({ w, flat = false }: { w: number; flat?: boolean }) {
  const { back } = usePrefs();
  const label = useContext(CardBackLabel);
  return (
    <span
      className="absolute inset-0 block border border-black/40"
      style={{
        ...BACK_CSS[back],
        borderRadius: w * 0.1,
        boxShadow: flat ? undefined : SHADOW,
      }}
    >
      <span
        className="absolute flex items-center justify-center border border-gold/40 font-bold text-gold/75"
        style={{ inset: w * 0.08, borderRadius: w * 0.06, fontSize: w * 0.2 }}
      >
        {label}
      </span>
    </span>
  );
}

/* Retournement en deux temps, en 2D : la carte se referme sur sa tranche, change de côté,
   se rouvre. Pas de vraie 3D (rotateY, preserve-3d) : sur iOS, une carte tournée en 3D
   traverse les cartes voisines quel que soit son z-index et passe à moitié dessous. */
function Flip({ card, up, w, flat }: { card: string; up: boolean; w: number; flat: boolean }) {
  // Le côté dessiné : il ne change qu'à mi-retournement, carte vue par la tranche.
  const [side, setSide] = useState(up);
  const [phase, setPhase] = useState<null | "close" | "open">(null);
  if (phase === null && up !== side) setPhase("close");
  if (phase === null) return side ? <Face card={card} w={w} flat={flat} /> : <Back w={w} flat={flat} />;
  const drawn = side ? <Face card={card} w={w} /> : <Back w={w} />;
  return phase === "close" ? (
    <motion.span
      key="close"
      className="absolute inset-0 block"
      initial={{ scaleX: 1, scaleY: 1 }}
      animate={{ scaleX: 0, scaleY: 1.1 }}
      transition={{ duration: 0.17, ease: [0.4, 0, 1, 1] }}
      onAnimationComplete={() => {
        setSide((s) => !s);
        setPhase("open");
      }}
    >
      {drawn}
    </motion.span>
  ) : (
    <motion.span
      key="open"
      className="absolute inset-0 block"
      initial={{ scaleX: 0, scaleY: 1.1 }}
      animate={{ scaleX: 1, scaleY: 1 }}
      transition={{ duration: 0.17, ease: [0, 0, 0.2, 1] }}
      onAnimationComplete={() => setPhase(null)}
    >
      {drawn}
    </motion.span>
  );
}

/* Une carte sur la table : sa position vient de ses valeurs animées (voir Board), sa
   face de l'état du jeu. */
export const CardView = memo(function CardView({
  card,
  motion: mv,
  up,
  flat,
  w,
  h,
  onPointerDown,
}: {
  card: string;
  motion: CardMotion;
  up: boolean;
  flat: boolean;
  w: number;
  h: number;
  onPointerDown: (card: string, e: React.PointerEvent) => void;
}) {
  const scale = useTransform(mv.lift, [0, 1], [1, 1.07]);
  return (
    <motion.div
      data-card={card}
      className="absolute left-0 top-0 touch-none select-none"
      style={{ x: mv.x, y: mv.y, zIndex: mv.z, rotate: mv.rot, scale, width: w, height: h }}
      onPointerDown={(e) => onPointerDown(card, e)}
    >
      {/* Ombre portée d'une carte soulevée : un calque à part dont seule l'opacité
          varie, moins coûteux qu'une ombre animée. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 block"
        style={{
          opacity: mv.lift,
          borderRadius: w * 0.1,
          boxShadow: "0 16px 26px rgba(0,0,0,0.45), 0 6px 10px rgba(0,0,0,0.25)",
        }}
      />
      <Flip card={card} up={up} w={w} flat={flat} />
    </motion.div>
  );
});
