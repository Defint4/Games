"use client";

/* Onglet Course : les circuits de la région en contre-la-montre, leurs médailles, et les
   modes à venir. Le circuit choisi est retenu et préchargé (décor et fantôme). */

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TransitionOverlay } from "@/components/Loading";
import { tr, useLang, useT } from "@/lib/i18n";
import { fetchRival, readVehicle, useProfile, useRt1State } from "./api";
import { preloadAssets } from "./assets";
import { type Circuit, CIRCUITS, circuitBySlug, MEDALS, medalFor, medalsFor, readCircuit, saveCircuit } from "./circuits";
import { T } from "./i18n";
import { enterImmersive } from "./immersive";
import MedalIcon from "./MedalIcon";
import { LockIcon } from "./menu/icons";
import BotsSheet from "./menu/BotsSheet";
import { card, Pending, Title } from "./menu/Shell";
import { bungee, PLAY_PATH } from "./meta";
import { asset } from "./sim/level";
import { formatTime } from "./sim/race";

export default function Home() {
  const router = useRouter();
  const t = useT(T).home;
  const lang = useLang();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const state = useRt1State(profile);
  const records = state.data?.records;
  const bests: Record<string, number> = {};
  for (const [c, r] of Object.entries(records ?? {})) bests[c] = r.time_ms / 1000;
  // Temps pas encore arrivés : ni tiret ni record, un chargement.
  const pending = !records && !state.isError;
  const [slug, setSlug] = useState(CIRCUITS[0].slug);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [botsOpen, setBotsOpen] = useState(false);
  const circuit = circuitBySlug(slug);
  const best = bests[slug];
  // les médailles affichées sont celles du véhicule qui roule ; le record garde le sien
  const vehicle = state.data?.vehicle ?? readVehicle();
  const medals = medalsFor(circuit, vehicle);
  const recordMedals = medalsFor(circuit, records?.[slug]?.vehicle ?? vehicle);

  useEffect(() => {
    // Lecture localStorage impossible côté serveur : elle arrive après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlug(circuitBySlug(readCircuit()).slug);
  }, []);

  // Le fantôme du record se télécharge avec le décor : la course part sans attente.
  const mine = records?.[slug];
  useEffect(() => {
    if (profile && mine) void fetchRival(queryClient, slug, profile.pseudo, mine.time_ms).catch(() => {});
  }, [queryClient, profile, slug, mine]);

  const drive = (query = "") => {
    enterImmersive();
    setLeaving(tr(T).home.leaving);
    router.push(`${PLAY_PATH}?c=${slug}${query}`);
  };

  // le circuit choisi se précharge, mais seulement une fois le doigt posé sur lui (pas à
  // chaque tap d'une série : chaque préchargement est un décor entier à décoder)
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choose = (c: Circuit) => {
    setSlug(c.slug);
    saveCircuit(c.slug);
    if (preloadTimer.current) clearTimeout(preloadTimer.current);
    preloadTimer.current = setTimeout(() => {
      void preloadAssets(c.slug, state.data?.vehicle ?? readVehicle()).catch(() => {});
    }, 700);
  };
  useEffect(() => () => {
    if (preloadTimer.current) clearTimeout(preloadTimer.current);
  }, []);

  return (
    <>
      <TransitionOverlay label={leaving} />
      <Title sub={t.sub}>{t.title}</Title>

      <section className={`${card} mb-5 overflow-hidden`}>
        <div className="relative">
          <Image
            key={slug}
            src={asset(`${slug}/cover.webp`)}
            alt=""
            width={960}
            height={400}
            priority
            unoptimized
            className="aspect-[12/5] w-full bg-[#8fd0ea] object-cover"
          />
          <span className={`${bungee.className} absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-xs backdrop-blur`}>
            {t.mode}
          </span>
        </div>
        <div className="p-4">
          <p className={`${bungee.className} text-lg`}>{circuit.name[lang]}</p>
          <p className="mt-1 text-sm text-white/70">{circuit.note[lang]}</p>
          <div className="mt-3 flex gap-3">
            {MEDALS.map((m) => (
              <span key={m} className="flex items-center gap-1 text-[11px] tabular-nums text-white/70">
                <MedalIcon medal={m} earned={best != null && Math.round(best * 1000) <= Math.round(recordMedals[m] * 1000)} className="size-5" />
                {formatTime(medals[m]).replace(/^0:/, "")}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">{t.record}</p>
              <p className={`${bungee.className} text-xl tabular-nums text-[#8CE6D2]`}>
                {pending ? <Pending /> : best != null ? formatTime(best) : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => drive()}
              disabled={leaving !== null}
              className={`${bungee.className} rounded-xl bg-[#FF7A2F] px-7 py-3.5 text-xl text-[#1b0d05] shadow-[0_6px_0_#b24c14] transition-transform enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_#b24c14] disabled:opacity-50`}
            >
              {t.drive}
            </button>
          </div>
        </div>
      </section>

      <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.circuits}</h2>
      <div className="mb-5 flex flex-col gap-2">
        {CIRCUITS.map((c) => {
          const medal = medalFor(c, bests[c.slug], records?.[c.slug]?.vehicle ?? vehicle);
          const active = c.slug === slug;
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => choose(c)}
              className={`${card} flex items-center gap-3 p-3 text-left transition-colors ${active ? "ring-2 ring-[#2EC4C6]" : ""}`}
            >
              <MedalIcon medal={medal ?? "bronze"} earned={medal !== null} className="size-8 shrink-0" />
              <span className="min-w-0 grow">
                <span className={`${bungee.className} block truncate text-sm`}>{c.name[lang]}</span>
                <span className="block truncate text-xs text-white/60">{c.note[lang]}</span>
              </span>
              <span className={`${bungee.className} shrink-0 text-sm tabular-nums ${bests[c.slug] != null ? "text-[#8CE6D2]" : "text-white/35"}`}>
                {pending ? <Pending /> : bests[c.slug] != null ? formatTime(bests[c.slug]) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.modes}</h2>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setBotsOpen(true)}
          disabled={leaving !== null}
          className={`${card} p-3.5 text-left ring-[#FF7A2F]/50 transition-transform active:scale-[0.98]`}
        >
          <p className={`${bungee.className} flex items-center gap-1.5 text-sm text-[#FFB47F]`}>
            <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19l4-6 4 3 4-8 4 5" />
            </svg>
            {t.bots.name}
          </p>
          <p className="mt-1 text-xs text-white/65">{t.bots.note}</p>
        </button>
        {t.soonModes.map((m) => (
          <div key={m.name} className={`${card} p-3.5 opacity-75`}>
            <p className={`${bungee.className} flex items-center gap-1.5 text-sm`}>
              <LockIcon className="size-4 text-white/50" />
              {m.name}
            </p>
            <p className="mt-1 text-xs text-white/60">{m.note}</p>
          </div>
        ))}
      </div>
      {botsOpen && (
        <BotsSheet
          circuit={circuit.name[lang]}
          onClose={() => setBotsOpen(false)}
          onGo={(level, count) => {
            setBotsOpen(false);
            drive(`&bots=${count}&level=${level}`);
          }}
        />
      )}
    </>
  );
}
