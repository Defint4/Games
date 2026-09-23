"use client";

import { useT } from "@/lib/i18n";
import { DICE_COLORS } from "./colors";
import DieFace from "./DieFace";
import { T } from "./i18n";

/* Le logo du Perudo : trois dés jetés, le Paco au milieu. */
export default function Wordmark() {
  const t = useT(T);
  return (
    <header className="mb-6 flex flex-col items-center">
      <div className="relative mb-2 h-16 w-28">
        <DieFace value={5} color={DICE_COLORS[1]} className="absolute left-1 top-4 size-11 -rotate-12" />
        <DieFace value={1} className="absolute left-8 top-0 size-12 rotate-6" />
        <DieFace value={3} color={DICE_COLORS[2]} className="absolute left-16 top-5 size-10 rotate-[18deg]" />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">Perudo</h1>
      <p className="mt-1 text-sm text-ivory-dim/80">{t.tagline}</p>
    </header>
  );
}
