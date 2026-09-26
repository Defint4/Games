"use client";

/* Onglet Course : le circuit du moment en contre-la-montre, et les modes à venir. */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TransitionOverlay } from "@/components/Loading";
import { tr, useT } from "@/lib/i18n";
import { LEVEL } from "./assets";
import { T } from "./i18n";
import { enterImmersive } from "./immersive";
import { LockIcon } from "./menu/icons";
import { card, Title } from "./menu/Shell";
import { bungee, PLAY_PATH } from "./meta";
import { asset } from "./sim/level";
import { type Best, formatTime } from "./sim/race";

export default function Home() {
  const router = useRouter();
  const t = useT(T).home;
  const [best, setBest] = useState<Best | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`games:rt1:best:${LEVEL}`);
      // Lecture localStorage impossible côté serveur : elle arrive après montage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setBest(JSON.parse(raw) as Best);
    } catch {
      /* stockage indisponible */
    }
  }, []);

  return (
    <>
      <TransitionOverlay label={leaving} />
      <Title sub={t.sub}>{t.title}</Title>

      <section className={`${card} mb-4 overflow-hidden`}>
        <div className="relative">
          <Image
            src={asset(`${LEVEL}/cover.webp`)}
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
          <p className={`${bungee.className} text-lg`}>{t.track}</p>
          <p className="mt-1 text-sm text-white/70">{t.trackNote}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">{t.record}</p>
              <p className={`${bungee.className} text-xl tabular-nums text-[#8CE6D2]`}>
                {best ? formatTime(best.time) : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                enterImmersive();
                setLeaving(tr(T).home.leaving);
                router.push(PLAY_PATH);
              }}
              disabled={leaving !== null}
              className={`${bungee.className} rounded-xl bg-[#FF7A2F] px-7 py-3.5 text-xl text-[#1b0d05] shadow-[0_6px_0_#b24c14] transition-transform enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_#b24c14] disabled:opacity-50`}
            >
              {t.drive}
            </button>
          </div>
        </div>
      </section>

      <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.modes}</h2>
      <div className="grid grid-cols-2 gap-3">
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
      <p className="mt-5 text-center text-xs text-white/45">{t.preview}</p>
    </>
  );
}
