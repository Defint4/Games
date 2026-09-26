"use client";

/* Carrière : la RT1 de Nouméa à Poum, une étape par région. Rien n'est encore jouable
   en carrière (étape 4 du plan) : la carte montre ce qui arrive. */

import { useT } from "@/lib/i18n";
import { T } from "../i18n";
import { bungee } from "../meta";
import { LockIcon } from "./icons";
import { card, Title } from "./Shell";

export default function Career() {
  const t = useT(T).career;
  return (
    <>
      <Title sub={t.sub}>{t.title}</Title>
      <p className={`${bungee.className} mb-5 inline-flex items-center gap-2 rounded-full bg-[#FF7A2F]/15 px-3 py-1 text-xs text-[#FFB47F]`}>
        <LockIcon className="size-4" />
        {t.step}
      </p>
      <ol className="relative flex flex-col gap-3 pl-9">
        {/* la route : bitume et pointillés, du haut (Nouméa) vers le bas (les îles) */}
        <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-2.5 rounded-full bg-[#2b2e33]">
          <span className="absolute inset-x-[4px] inset-y-2 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.7)_0_6px,transparent_6px_12px)]" />
        </span>
        {t.regions.map((r, i) => (
          <li key={r.name} className={`${card} relative p-3.5 ${i === 0 ? "ring-[#2EC4C6]/60" : "opacity-75"}`}>
            <span
              aria-hidden
              className={`absolute -left-[26px] top-1/2 size-4 -translate-y-1/2 rounded-full border-[3px] ${
                i === 0 ? "border-[#2EC4C6] bg-[#061920]" : "border-white/40 bg-[#061920]"
              }`}
            />
            <div className="flex items-baseline justify-between gap-2">
              <h2 className={`${bungee.className} text-base`}>{r.name}</h2>
              <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">
                {t.region(i + 1)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-white/70">{r.note}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
