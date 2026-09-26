"use client";

import { useT } from "@/lib/i18n";
import { T } from "./i18n";
import { bungee } from "./meta";

/* Le logo de RT1 : le cartouche rouge des routes, comme sur les bornes. */
export default function Wordmark() {
  const t = useT(T);
  return (
    <header className="mb-6 flex flex-col items-center">
      <div
        className={`${bungee.className} rounded-[14px] border-[3px] border-white bg-[#C8232C] px-6 pb-1 pt-2 text-5xl leading-none text-white shadow-card`}
      >
        RT1
      </div>
      <p className="mt-3 text-center text-sm text-ivory-dim/80">{t.tagline}</p>
    </header>
  );
}
