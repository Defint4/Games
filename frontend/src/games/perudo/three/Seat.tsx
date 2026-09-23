"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Cup from "./Cup";
import { CUP, DIE, dieQuaternion, roundedDie } from "./geometry";
import { diceMaterials } from "./materials";
import type { DiceColor } from "./textures";
import { ease, useTween, wait } from "./tween";

/* La place d'un joueur : son gobelet et ses dés, dans son propre repère (+z pointe vers
   le joueur, à l'opposé du centre de la table). Toute la chorégraphie passe par les
   méthodes exposées ; chacune renvoie une promesse résolue à la fin de son animation.
   Les dés des adversaires ne sont connus qu'à la révélation : avant, le gobelet fermé
   cache des dés quelconques, remplacés par les vrais au moment de lever. */

export type SeatHandle = {
  /* Pose sans animation (arrivée à la table, reconnexion). */
  place: (values: number[], state: "closed" | "peek" | "open" | "out") => void;
  shake: () => Promise<void>;
  /* Claque le gobelet ; `values` = les dés tirés (des dés quelconques pour un adversaire). */
  slam: (values: number[]) => Promise<void>;
  peek: (open: boolean) => Promise<void>;
  reveal: (values: number[], face: number, wild: boolean) => Promise<void>;
  cover: () => Promise<void>;
  loseDie: () => Promise<void>;
  gainDie: () => Promise<void>;
  knockOver: () => Promise<void>;
};

type DieSpot = { value: number; x: number; z: number; yaw: number };

/* Dispositions de base selon le nombre de dés (centre, paire, triangle, carré,
   pentagone), tournées au hasard, chaque dé légèrement décalé et orienté librement. */
const LAYOUTS: [number, number][][] = [
  [],
  [[0, 0]],
  [
    [-1.25, 0],
    [1.25, 0],
  ],
  [0, 1, 2].map((k) => polar(1.4, (k * 2 * Math.PI) / 3)),
  [0, 1, 2, 3].map((k) => polar(1.65, (k * Math.PI) / 2)),
  [0, 1, 2, 3, 4].map((k) => polar(2.0, (k * 2 * Math.PI) / 5)),
];

function polar(r: number, a: number): [number, number] {
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function scatter(values: number[]): DieSpot[] {
  const layout = LAYOUTS[values.length] ?? LAYOUTS[5];
  const turn = Math.random() * Math.PI * 2;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return values.map((value, i) => {
    const [x, z] = layout[i];
    const jitter = () => (Math.random() - 0.5) * 0.24;
    return {
      value,
      x: x * c - z * s + jitter(),
      z: x * s + z * c + jitter(),
      yaw: Math.random() * Math.PI * 2,
    };
  });
}

/* Garde l'emplacement des dés déjà posés, ne change que leurs faces (révélation). */
function reface(spots: DieSpot[], values: number[]): DieSpot[] {
  if (spots.length !== values.length) return scatter(values);
  return spots.map((s, i) => ({ ...s, value: values[i] }));
}

/* Pose du gobelet, recomposée à chaque image d'animation. */
type CupPose = {
  lift: number;
  tilt: number;
  wobbleX: number;
  wobbleZ: number;
  dx: number;
  dz: number;
  away: number;
  fall: number;
};
const REST: CupPose = { lift: 0, tilt: 0, wobbleX: 0, wobbleZ: 0, dx: 0, dz: 0, away: 0, fall: 0 };
const PEEK: Partial<CupPose> = { tilt: 1.0, lift: 0.25 };
/* Gobelet levé : reposé à côté des dés, comme à la main. Ta place le pose à droite
   (il ne cache rien depuis ta vue), celles d'en face derrière leurs dés. */
const ASIDE = {
  right: { lift: 0, dx: 6.3, away: 0, tilt: 0 },
  back: { lift: 0, dx: 0, away: 6.5, tilt: 0 },
} satisfies Record<string, Partial<CupPose>>;
const OUT: Partial<CupPose> = { lift: 1.9, fall: Math.PI / 2 };

const Seat = forwardRef<
  SeatHandle,
  { color: DiceColor; aside: keyof typeof ASIDE; onCupTap?: () => void }
>(function Seat({ color, aside, onCupTap }, ref) {
  const tween = useTween();
  const [dice, setDice] = useState<DieSpot[]>([]);
  const [highlight, setHighlight] = useState<boolean[]>([]);
  const diceRef = useRef<DieSpot[]>([]);
  const pivot = useRef<THREE.Group>(null);
  const diceGroup = useRef<THREE.Group>(null);
  const dieRefs = useRef<(THREE.Mesh | null)[]>([]);
  const pose = useRef<CupPose>({ ...REST });
  const materials = diceMaterials(color);
  const geometry = roundedDie();

  const setSpots = (spots: DieSpot[]) => {
    diceRef.current = spots;
    setDice(spots);
  };

  // Le pivot du gobelet est sur son bord arrière : lever le bord avant pour regarder
  // ses dés, c'est une rotation autour de ce bord, comme à la main. `fall` couche le
  // gobelet sur le flanc (joueur éliminé).
  const apply = () => {
    const g = pivot.current;
    if (!g) return;
    const p = pose.current;
    g.position.set(p.dx, p.lift, -CUP.mouth + p.dz - p.away);
    g.rotation.set(-p.tilt + p.wobbleX, 0, p.wobbleZ + p.fall);
  };

  useLayoutEffect(apply, []);

  const to = (seconds: number, target: Partial<CupPose>, easing = ease.inOut) => {
    const from = { ...pose.current };
    return tween(
      seconds,
      (t) => {
        for (const key of Object.keys(target) as (keyof CupPose)[]) {
          pose.current[key] = from[key] + (target[key]! - from[key]) * t;
        }
        apply();
      },
      easing,
    );
  };

  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#f2c65a",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  useImperativeHandle(ref, () => ({
    place(values, state) {
      setSpots(state === "out" ? [] : scatter(values));
      setHighlight([]);
      ringMaterial.opacity = 0;
      const extra = { peek: PEEK, open: ASIDE[aside], out: OUT, closed: {} }[state];
      pose.current = { ...REST, ...extra };
      if (diceGroup.current) diceGroup.current.visible = true;
      apply();
    },
    async shake() {
      // Le gobelet se soulève (les dés sont dedans) et se secoue.
      await to(0.28, { lift: 2.2, tilt: 0, away: 0, dx: 0, dz: 0 }, ease.out);
      if (diceGroup.current) diceGroup.current.visible = false;
      const phase = Math.random() * Math.PI * 2;
      await tween(
        1.15,
        (t) => {
          const k = Math.sin(t * Math.PI); // l'amplitude monte puis retombe
          const w = t * Math.PI * 2 * 7 + phase;
          pose.current.dx = Math.sin(w) * 0.45 * k;
          pose.current.dz = Math.cos(w * 1.3) * 0.25 * k;
          pose.current.wobbleZ = Math.sin(w + 0.6) * 0.14 * k;
          pose.current.wobbleX = Math.cos(w * 0.9) * 0.08 * k;
          pose.current.lift = 2.2 + Math.abs(Math.sin(w * 0.5)) * 0.5 * k;
          apply();
        },
        ease.linear,
      );
    },
    async slam(values) {
      setSpots(scatter(values));
      setHighlight([]);
      ringMaterial.opacity = 0;
      await to(0.14, { lift: 0, dx: 0, dz: 0, wobbleX: 0, wobbleZ: 0 }, ease.in);
      if (diceGroup.current) diceGroup.current.visible = true;
      // Le gobelet rebondit à peine en touchant le tapis.
      await to(0.08, { lift: 0.12 }, ease.out);
      await to(0.12, { lift: 0 }, ease.in);
    },
    async peek(open) {
      await to(open ? 0.5 : 0.35, open ? PEEK : { tilt: 0, lift: 0 }, open ? ease.out : ease.inOut);
    },
    async reveal(values, face, wild) {
      // Les vrais dés prennent la place des dés quelconques, gobelet encore fermé.
      setSpots(reface(diceRef.current, values));
      await wait(0.03);
      // Soulevé bien droit, déplacé, reposé : les dés apparaissent.
      await to(0.3, { lift: 2.6, tilt: 0, dz: 0 }, ease.out);
      await to(0.4, { ...ASIDE[aside], lift: 2.6 }, ease.inOut);
      await to(0.2, { lift: 0 }, ease.in);
      const hits = values.map((v) => v === face || (wild && v === 1 && face !== 1));
      setHighlight(hits);
      await wait(0.03);
      await tween(0.35, (t) => {
        ringMaterial.opacity = 0.9 * t;
        dieRefs.current.forEach((mesh, i) => {
          if (mesh && hits[i]) mesh.position.y = DIE / 2 + 0.35 * Math.sin(t * Math.PI);
        });
      });
    },
    async cover() {
      await tween(0.2, (t) => {
        ringMaterial.opacity = 0.9 * (1 - t);
      });
      setHighlight([]);
      await to(0.25, { lift: 2.6 }, ease.out);
      await to(0.4, { dx: 0, away: 0, tilt: 0 }, ease.inOut);
      await to(0.18, { lift: 0 }, ease.in);
    },
    async loseDie() {
      const i = diceRef.current.length - 1;
      const mesh = dieRefs.current[i];
      if (!mesh) return;
      const start = mesh.position.clone();
      const spin = new THREE.Quaternion().copy(mesh.quaternion);
      const axis = new THREE.Vector3(1, 0.4, 0.2).normalize();
      await tween(
        0.7,
        (t) => {
          mesh.position.set(start.x + t * 9, DIE / 2 + Math.sin(t * Math.PI) * 3.2, start.z + t * 3);
          mesh.quaternion.copy(spin).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, t * 9));
          mesh.scale.setScalar(1 - t * 0.6);
        },
        ease.in,
      );
      setSpots(diceRef.current.slice(0, -1));
    },
    async gainDie() {
      // Un dé revient en roulant se ranger avec les autres.
      const spots = scatter([
        ...diceRef.current.map((d) => d.value),
        1 + Math.floor(Math.random() * 6),
      ]);
      setSpots(spots);
      await wait(0.03);
      const mesh = dieRefs.current[spots.length - 1];
      if (!mesh) return;
      const end = mesh.position.clone();
      await tween(
        0.6,
        (t) => {
          mesh.position.set(end.x + (1 - t) * 8, DIE / 2 + Math.sin(t * Math.PI) * 2, end.z + (1 - t) * 3);
          mesh.scale.setScalar(0.4 + 0.6 * t);
        },
        ease.out,
      );
    },
    async knockOver() {
      setSpots([]);
      await to(0.7, { ...OUT, away: 0, tilt: 0 }, ease.back);
    },
  }));

  return (
    <group>
      <group ref={diceGroup}>
        {dice.map((d, i) => (
          <group key={`${i}-${d.x}`}>
            <mesh
              ref={(m) => {
                dieRefs.current[i] = m;
              }}
              geometry={geometry}
              material={materials}
              position={[d.x, DIE / 2, d.z]}
              quaternion={dieQuaternion(d.value, d.yaw)}
              castShadow
              receiveShadow
            />
            {highlight[i] && (
              <mesh position={[d.x, 0.012, d.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMaterial}>
                <ringGeometry args={[DIE * 0.72, DIE * 0.86, 48]} />
              </mesh>
            )}
          </group>
        ))}
      </group>
      <group
        ref={pivot}
        onClick={
          onCupTap
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onCupTap();
              }
            : undefined
        }
      >
        <group position={[0, 0, CUP.mouth]}>
          <Cup band={color.band} />
        </group>
      </group>
    </group>
  );
});

export default Seat;
