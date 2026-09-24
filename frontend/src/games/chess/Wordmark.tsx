"use client";

import { useLang, useT } from "@/lib/i18n";
import { T } from "./i18n";
import { GAME } from "./meta";
import { useChessPrefs } from "./prefs";
import { pieceUrl } from "./themes";

/* Le logo des échecs : le roi blanc et la dame noire posés sur un coin d'échiquier. */
export default function Wordmark() {
  const t = useT(T);
  const lang = useLang();
  const { pieces } = useChessPrefs();
  return (
    <header className="mb-6 flex flex-col items-center">
      <div className="relative mb-2 h-16 w-24">
        <span className="absolute inset-x-2 bottom-0 grid h-5 grid-cols-4 overflow-hidden rounded-sm opacity-90">
          {["#ebecd0", "#739552", "#ebecd0", "#739552"].map((c, i) => (
            <span key={i} style={{ background: c }} />
          ))}
        </span>
        <span
          className="absolute bottom-2 left-2 size-14 -rotate-6 bg-cover drop-shadow-lg"
          style={{ backgroundImage: `url(${pieceUrl(pieces, "w", "k")})` }}
        />
        <span
          className="absolute bottom-2 right-1 size-12 rotate-6 bg-cover drop-shadow-lg"
          style={{ backgroundImage: `url(${pieceUrl(pieces, "b", "q")})` }}
        />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">{GAME.name[lang]}</h1>
      <p className="mt-1 text-sm text-ivory-dim/80">{t.tagline}</p>
    </header>
  );
}
