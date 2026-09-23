"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { usePrefs } from "@/lib/prefs";
import { DICE_COLORS, FELT_COLORS } from "../colors";
import type { PlayerView } from "../types";
import Seat, { type SeatHandle } from "./Seat";
import { Felt, Lights, PortraitCamera } from "./Stage";

/* La table vue de ta place : ton gobelet au premier plan, les adversaires en arc de
   l'autre côté du tapis, dans l'ordre réel des tours (ton voisin de gauche joue après
   toi), de gauche à droite comme leurs fiches en haut de l'écran. */

export type SceneHandle = { seat: (seat: number) => SeatHandle | null };

const CENTER_Z = -3.5;

/* Position et orientation d'une place, `rel` = rang après toi (0 = toi). Le +z local
   de la place pointe vers son joueur, à l'opposé du centre. */
export function placement(
  rel: number,
  n: number,
): { x: number; z: number; yaw: number; scale: number } {
  if (rel === 0) return { x: 0, z: 8, yaw: 0, scale: 1 };
  const others = n - 1;
  const spread = others === 1 ? 0 : Math.min(150, 60 + others * 20);
  const angle = others === 1 ? 0 : -spread / 2 + (spread * (rel - 1)) / (others - 1);
  const a = (angle * Math.PI) / 180;
  const x = Math.sin(a) * 11;
  const z = CENTER_Z - Math.cos(a) * 8;
  // Les gobelets d'en face, plus petits : ils tiennent tous sur la largeur d'un téléphone.
  return { x, z, yaw: Math.atan2(x, z - CENTER_Z), scale: others > 3 ? 0.58 : 0.66 };
}

export function colorOf(rel: number) {
  return DICE_COLORS[rel % DICE_COLORS.length];
}

/* Signale la scène prête une fois les places montées dans le Canvas (le rendu 3D
   est asynchrone : les places n'existent pas encore au montage du composant). */
function Ready({ onReady }: { onReady: () => void }) {
  const once = useRef(onReady);
  useEffect(() => {
    once.current();
  }, []);
  return null;
}

export default function TableScene({
  players,
  me,
  onMyCupTap,
  onReady,
}: {
  players: PlayerView[];
  me: number;
  onMyCupTap: () => void;
  onReady: (handle: SceneHandle) => void;
}) {
  const seats = useRef<(SeatHandle | null)[]>([]);
  const felt = FELT_COLORS[usePrefs().felt];
  const n = players.length;
  const handle = useRef<SceneHandle>({ seat: (s) => seats.current[s] ?? null });
  const layout = useMemo(
    () =>
      players.map((p) => ({ seat: p.seat, rel: (p.seat - me + n) % n, ...placement((p.seat - me + n) % n, n) })),
    // La disposition ne dépend que du nombre de places et de la tienne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, me],
  );

  return (
    <Canvas shadows="percentage" dpr={[1, 2]} frameloop="demand" gl={{ antialias: true }}>
      <color attach="background" args={["#08201a"]} />
      <fog attach="fog" args={["#08201a", 55, 95]} />
      <PortraitCamera position={[0, 40, 22]} target={[0, 0, -0.5]} width={26} />
      <Lights />
      <Felt color={felt} />
      {layout.map(({ seat, rel, x, z, yaw, scale }) => (
        <group key={seat} position={[x, 0, z]} rotation={[0, yaw, 0]} scale={scale}>
          <Seat
            ref={(h) => {
              seats.current[seat] = h;
            }}
            color={colorOf(rel)}
            aside={rel === 0 ? "right" : "back"}
            onCupTap={rel === 0 ? onMyCupTap : undefined}
          />
        </group>
      ))}
      <Ready onReady={() => onReady(handle.current)} />
    </Canvas>
  );
}
