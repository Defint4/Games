"use client";

import { useLang, useT } from "@/lib/i18n";
import { Face } from "./Card";
import { T } from "./i18n";
import { GAME } from "./meta";

/* Le logo du Solitaire : une suite du roi au valet, en cascade comme sur la table. */
export default function Wordmark() {
  const t = useT(T);
  const lang = useLang();
  const w = 44;
  const cards = ["Ks", "Qh", "Jc"];
  return (
    <header className="mb-6 flex flex-col items-center">
      <div className="relative mb-2" style={{ width: w + 20, height: w * 1.5 + 2 * 16 }}>
        {cards.map((card, i) => (
          <span
            key={card}
            className="absolute block"
            style={{
              left: i * 10,
              top: i * 16,
              width: w,
              height: w * 1.5,
              transform: `rotate(${(i - 1) * 4}deg)`,
            }}
          >
            <Face card={card} w={w} />
          </span>
        ))}
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">{GAME.name[lang]}</h1>
      <p className="mt-1 text-sm text-ivory-dim/80">{t.tagline}</p>
      {GAME.dedication && (
        <p className="mt-2 -rotate-2 font-script text-2xl leading-none text-gold">
          {GAME.dedication[lang]}
        </p>
      )}
    </header>
  );
}
