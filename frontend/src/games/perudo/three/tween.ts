/* Animations de la scène 3D : de petites interpolations pilotées par la boucle de rendu.
   La scène ne se redessine que pendant qu'une animation tourne (frameloop="demand") :
   au repos, zéro image calculée, la batterie est épargnée. */

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  /* Dépassement léger puis retour : un objet posé qui se tasse. */
  back: (t: number) => {
    const c = 1.7;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};

type Tween = {
  start: number;
  duration: number;
  ease: Ease;
  update: (t: number) => void;
  resolve: () => void;
};

/* `tween(secondes, (t) => …)` : appelle la fonction à chaque image avec t de 0 à 1,
   et renvoie une promesse résolue à la fin. À utiliser dans un composant du Canvas. */
export function useTween() {
  const running = useRef<Tween[]>([]);
  const invalidate = useThree((s) => s.invalidate);

  useFrame(() => {
    if (!running.current.length) return;
    const now = performance.now();
    running.current = running.current.filter((tw) => {
      const t = Math.min(1, (now - tw.start) / tw.duration);
      tw.update(tw.ease(t));
      if (t >= 1) {
        tw.resolve();
        return false;
      }
      return true;
    });
    invalidate();
  });

  return useCallback(
    (seconds: number, update: (t: number) => void, easing: Ease = ease.inOut) =>
      new Promise<void>((resolve) => {
        running.current.push({
          start: performance.now(),
          duration: seconds * 1000,
          ease: easing,
          update,
          resolve,
        });
        invalidate();
      }),
    [invalidate],
  );
}

export const wait = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
