"use client";

/* En ligne : les courses en direct (salons), le classement de chaque circuit (meilleur
   temps de chacun) et le défi d'un pilote, dont le fantôme roule avec soi. */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { TransitionOverlay } from "@/components/Loading";
import { tr, useLang, useT } from "@/lib/i18n";
import { type BoardEntry, boardKey, fetchBoard, useProfile } from "../api";
import { CIRCUITS, circuitBySlug, medalFor, readCircuit } from "../circuits";
import { T } from "../i18n";
import { enterImmersive } from "../immersive";
import MedalIcon from "../MedalIcon";
import { bungee, PLAY_PATH } from "../meta";
import { formatTime } from "../sim/race";
import LiveRooms from "./LiveRooms";
import { card, Title } from "./Shell";

export default function Online() {
  const t = useT(T).online;
  const lang = useLang();
  const router = useRouter();
  const profile = useProfile();
  const [slug, setSlug] = useState(CIRCUITS[0].slug);
  const [leaving, setLeaving] = useState<string | null>(null);
  const me = profile?.pseudo ?? null;

  useEffect(() => {
    // circuit du moment, lu après montage (localStorage)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlug(circuitBySlug(readCircuit()).slug);
  }, []);

  const board = useQuery({
    queryKey: [...boardKey(slug), me],
    queryFn: () => fetchBoard(slug, me),
    enabled: profile !== null,
    refetchInterval: 30_000,
  });
  const data = board.data;
  const outside = data?.me && !data.entries.some((e) => e.rank === data.me!.rank) ? data.me : null;

  const challenge = (e: BoardEntry) => {
    enterImmersive();
    setLeaving(tr(T).online.leaving);
    router.push(`${PLAY_PATH}?c=${slug}&ghost=${encodeURIComponent(e.pseudo)}`);
  };

  return (
    <>
      <TransitionOverlay label={leaving} />
      <Title sub={t.sub}>{t.title}</Title>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {CIRCUITS.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setSlug(c.slug)}
            aria-pressed={c.slug === slug}
            className={`${bungee.className} shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors ${
              c.slug === slug ? "bg-[#2EC4C6] text-[#061920]" : "bg-black/30 text-white/75 ring-1 ring-white/10"
            }`}
          >
            {c.name[lang]}
          </button>
        ))}
      </div>

      {profile && <LiveRooms profile={profile} circuit={slug} />}

      <section className={`${card} mb-5 overflow-hidden`}>
        <div className="flex items-baseline justify-between border-b border-white/10 px-4 py-2.5">
          <h2 className={`${bungee.className} text-sm`}>{circuitBySlug(slug).name[lang]}</h2>
          {data && <span className="text-xs text-white/55">{t.drivers(data.total)}</span>}
        </div>
        {board.isPending ? (
          <ul className="flex flex-col gap-1 p-2">
            {Array.from({ length: 6 }, (_, k) => (
              <li key={k} className="h-11 animate-pulse rounded-xl bg-white/5" />
            ))}
          </ul>
        ) : board.isError ? (
          <div className="flex flex-col items-center gap-2 p-6 text-sm text-white/70">
            {t.failed}
            <button type="button" onClick={() => void board.refetch()} className="rounded-xl bg-white/10 px-4 py-2 font-bold ring-1 ring-white/15">
              {t.retry}
            </button>
          </div>
        ) : data!.entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-white/65">{t.empty}</p>
        ) : (
          <ol className="flex flex-col p-1.5">
            {data!.entries.map((e) => (
              <Row key={e.rank} entry={e} slug={slug} mine={e.pseudo.toLowerCase() === me?.toLowerCase()} onChallenge={challenge} />
            ))}
            {outside && (
              <>
                <li aria-hidden className="py-1 text-center text-white/30">⋯</li>
                <Row entry={outside} slug={slug} mine onChallenge={challenge} />
              </>
            )}
          </ol>
        )}
      </section>
    </>
  );
}

function Row({
  entry: e,
  slug,
  mine,
  onChallenge,
}: {
  entry: BoardEntry;
  slug: string;
  mine: boolean;
  onChallenge: (e: BoardEntry) => void;
}) {
  const t = useT(T).online;
  const vehicles = useT(T).vehicles;
  const medal = medalFor(circuitBySlug(slug), e.time_ms / 1000, e.vehicle);
  return (
    <li className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${mine ? "bg-[#2EC4C6]/12 ring-1 ring-[#2EC4C6]/40" : ""}`}>
      <span className={`${bungee.className} w-7 shrink-0 text-center text-sm tabular-nums ${e.rank <= 3 ? "text-[#FFE08A]" : "text-white/55"}`}>
        {e.rank}
      </span>
      <Avatar id={e.avatar} size="sm" />
      <span className="min-w-0 grow leading-tight">
        <span className={`block truncate text-sm font-bold ${mine ? "text-[#8CE6D2]" : ""}`}>{e.pseudo}</span>
        <span className="block truncate text-[10px] text-white/50">{vehicles[e.vehicle]?.name}</span>
      </span>
      {medal && <MedalIcon medal={medal} className="size-5 shrink-0" />}
      <span className={`${bungee.className} shrink-0 text-sm tabular-nums`}>{formatTime(e.time_ms / 1000)}</span>
      {!mine && e.has_ghost ? (
        <button
          type="button"
          onClick={() => onChallenge(e)}
          className={`${bungee.className} shrink-0 rounded-lg bg-[#FF7A2F] px-2.5 py-1.5 text-[11px] text-[#1b0d05] active:translate-y-0.5`}
        >
          {t.challenge}
        </button>
      ) : (
        <span className="w-[4.1rem] shrink-0" />
      )}
    </li>
  );
}
