"use client";

/* Carrière : la RT1 de Nouméa à Poum, une étape par région. Nouméa est ouverte, avec ses
   missions (accomplies d'elles-mêmes à l'arrivée d'une course, payées une fois) ; les
   régions suivantes arrivent avec leurs circuits. */

import { useLang, useT } from "@/lib/i18n";
import { formatMoney, type Mission, useProfile, useRt1State } from "../api";
import { T } from "../i18n";
import { bungee } from "../meta";
import { LockIcon } from "./icons";
import { card, Title } from "./Shell";

export default function Career() {
  const t = useT(T).career;
  const state = useRt1State(useProfile());
  const missions = state.data?.missions;
  const done = missions?.filter((m) => m.done).length ?? 0;
  return (
    <>
      <Title sub={t.sub}>{t.title}</Title>
      <ol className="relative flex flex-col gap-3 pl-9">
        {/* la route : bitume et pointillés, du haut (Nouméa) vers le bas (les îles) */}
        <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-2.5 rounded-full bg-[#2b2e33]">
          <span className="absolute inset-x-[4px] inset-y-2 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.7)_0_6px,transparent_6px_12px)]" />
        </span>
        {t.regions.map((r, i) => (
          <li key={r.name} className={`${card} relative p-3.5 ${i === 0 ? "ring-[#2EC4C6]/60" : "opacity-75"}`}>
            <span
              aria-hidden
              className={`absolute -left-[26px] top-5 size-4 rounded-full border-[3px] ${
                i === 0 ? "border-[#2EC4C6] bg-[#061920]" : "border-white/40 bg-[#061920]"
              }`}
            />
            <div className="flex items-baseline justify-between gap-2">
              <h2 className={`${bungee.className} text-base`}>{r.name}</h2>
              <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t.region(i + 1)}</span>
            </div>
            <p className="mt-0.5 text-sm text-white/70">{r.note}</p>
            {i === 0 ? (
              <>
                <div className="mb-2 mt-3 flex items-baseline justify-between">
                  <h3 className={`${bungee.className} text-sm text-[#8CE6D2]`}>{t.missions}</h3>
                  {missions && (
                    <span className="text-xs tabular-nums text-white/55">
                      {done}/{missions.length}
                    </span>
                  )}
                </div>
                {missions ? (
                  <ul className="flex flex-col gap-2">
                    {missions.map((m) => (
                      <MissionRow key={m.id} mission={m} />
                    ))}
                  </ul>
                ) : state.isError ? null : (
                  <ul className="flex flex-col gap-2">
                    {Array.from({ length: 5 }, (_, k) => (
                      <li key={k} className="h-12 animate-pulse rounded-xl bg-white/5" />
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className={`${bungee.className} mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/60`}>
                <LockIcon className="size-3.5" />
                {t.soon}
              </p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function MissionRow({ mission: m }: { mission: Mission }) {
  const t = useT(T).career;
  const text = useT(T).missions[m.id];
  const lang = useLang();
  return (
    <li className={`flex items-center gap-3 rounded-xl p-2.5 ${m.done ? "bg-[#2EC4C6]/10" : "bg-black/20"}`}>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
          m.done ? "bg-[#2EC4C6] text-[#061920]" : "bg-white/10 text-white/75"
        }`}
        aria-label={m.done ? t.done : undefined}
      >
        {m.done ? (
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          `${m.progress}/${m.target}`
        )}
      </span>
      <span className="min-w-0 grow">
        <span className="block truncate text-sm font-bold">{text?.name ?? m.id}</span>
        <span className="block truncate text-xs text-white/60">{text?.note}</span>
      </span>
      <span className={`${bungee.className} shrink-0 text-xs tabular-nums ${m.done ? "text-white/40 line-through" : "text-[#F4B942]"}`}>
        {formatMoney(m.reward, lang)}
      </span>
    </li>
  );
}
