"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TransitionOverlay } from "@/components/Loading";
import { HUB_PATH } from "@/lib/games";
import { tr, useT } from "@/lib/i18n";
import { currentProfile } from "@/lib/identity";
import { COMMON } from "@/lib/texts";
import { LEVEL, preloadAssets } from "./assets";
import { T } from "./i18n";
import { bungee, PLAY_PATH } from "./meta";
import { asset } from "./sim/level";
import { type Best, formatTime } from "./sim/race";
import Wordmark from "./Wordmark";

/* L'accueil de RT1 : pour l'instant un seul circuit, en contre-la-montre. */
export default function Home() {
  const router = useRouter();
  const common = useT(COMMON);
  const t = useT(T).home;
  const [best, setBest] = useState<Best | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    // Le circuit et la voiture se chargent dès l'accueil : la course démarre sans attente.
    void preloadAssets().catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentProfile()) {
      router.replace("/");
      return;
    }
    try {
      const raw = localStorage.getItem(`games:rt1:best:${LEVEL}`);
      // Lecture localStorage impossible côté serveur : elle arrive après montage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setBest(JSON.parse(raw) as Best);
    } catch {
      /* stockage indisponible */
    }
  }, [router]);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md grow flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
      <TransitionOverlay label={leaving} />
      <div className="mb-4 flex items-center justify-between">
        <Link href={HUB_PATH} className="rounded-xl py-2 pr-3 text-sm font-semibold text-ivory-dim/75 hover:text-ivory">
          ‹ {common.allGames}
        </Link>
      </div>
      <Wordmark />
      <section className="flex grow flex-col gap-5">
        <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
          <Image
            src={asset(`${LEVEL}/cover.webp`)}
            alt=""
            width={960}
            height={400}
            priority
            unoptimized
            className="aspect-[12/5] w-full bg-[#8fd0ea] object-cover"
          />
          <div className="bg-black/30 p-4">
            <p className={`${bungee.className} text-lg`}>{t.track}</p>
            <p className="mt-1 text-sm text-ivory-dim/80">{t.trackNote}</p>
            <p className="mt-3 text-sm font-semibold tabular-nums text-gold/90">
              {best ? t.best(formatTime(best.time)) : t.noBest}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setLeaving(tr(T).home.leaving);
            router.push(PLAY_PATH);
          }}
          disabled={leaving !== null}
          className={`${bungee.className} rounded-2xl bg-gold py-5 text-2xl text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40`}
        >
          {t.drive}
        </button>
        <p className="text-center text-sm text-ivory-dim/70">{t.landscape}</p>
        <p className="mt-auto text-center text-xs text-ivory-dim/50">{t.preview}</p>
      </section>
    </main>
  );
}
