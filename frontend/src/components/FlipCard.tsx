"use client";

import { motion } from "motion/react";
import PlayingCard from "@/components/PlayingCard";
import type { CardT } from "@/lib/types";

/* Une carte qui se retourne : le dos se referme sur sa tranche, la face s'ouvre à sa
   place. En 2D (scaleX), pas en vraie 3D : sur iOS, une carte tournée en rotateY
   traverse les éléments voisins quel que soit leur z-index et passe à moitié dessous.
   Utilisée dans les vols (révélation d'une carte piochée) et au centre de la table. */
export default function FlipCard({
  card,
  size = "md",
  delay = 0,
  duration = 0.5,
}: {
  card: CardT;
  size?: "sm" | "ms" | "md" | "lg";
  delay?: number;
  duration?: number;
}) {
  return (
    <span className="relative block">
      <motion.span
        className="block"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: [0, 0, 1] }}
        transition={{ delay, duration, times: [0, 0.5, 1], ease: ["linear", [0, 0, 0.2, 1]] }}
      >
        <PlayingCard card={card} size={size} />
      </motion.span>
      <motion.span
        className="absolute inset-0 block"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: [1, 0, 0] }}
        transition={{ delay, duration, times: [0, 0.5, 1], ease: [[0.4, 0, 1, 1], "linear"] }}
      >
        <PlayingCard faceDown size={size} />
      </motion.span>
    </span>
  );
}
