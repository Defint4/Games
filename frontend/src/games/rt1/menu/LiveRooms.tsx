"use client";

/* Courses en direct : ouvrir un salon sur le circuit choisi, rejoindre par code,
   reprendre le sien, et les salons ouverts en direct (WebSocket /live). Même mécanique
   que GameHome, dans le style de RT1. */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { TransitionOverlay } from "@/components/Loading";
import { ApiError, createRoom, fetchRoom, joinRoom } from "@/lib/api";
import { tablePath } from "@/lib/games";
import { tr, useLang, useT } from "@/lib/i18n";
import { forgetTable, lastTable, type StoredProfile } from "@/lib/identity";
import { isMaintenanceError, maintenanceBlocks, showMaintenanceNotice } from "@/lib/maintenance";
import { COMMON } from "@/lib/texts";
import { useOpenRooms } from "@/lib/useOpenRooms";
import { circuitBySlug } from "../circuits";
import { T } from "../i18n";
import { bungee, GAME } from "../meta";
import { card } from "./Shell";

export default function LiveRooms({ profile, circuit }: { profile: StoredProfile; circuit: string }) {
  const t = useT(T).online;
  const lang = useLang();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resumeCode, setResumeCode] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const rooms = useOpenRooms(GAME.slug);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumeCode(lastTable(GAME.slug));
  }, []);

  // Le salon mémorisé existe-t-il encore ? Sinon on l'oublie sans bruit.
  const remembered = useQuery({
    queryKey: ["room", resumeCode, profile.pseudo],
    queryFn: () => fetchRoom(profile.token, resumeCode!),
    enabled: resumeCode !== null,
    retry: false,
    staleTime: 0,
  });
  const resumable =
    remembered.data !== undefined &&
    remembered.data.status !== "finished" &&
    (remembered.data.seated || remembered.data.status === "lobby");
  useEffect(() => {
    if (resumeCode === null) return;
    const gone =
      (remembered.error instanceof ApiError && remembered.error.status === 404) ||
      (remembered.data !== undefined && !resumable);
    if (gone) {
      forgetTable(GAME.slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResumeCode(null);
    }
  }, [resumeCode, remembered.error, remembered.data, resumable]);

  const goToTable = ({ code }: { code: string }) => router.push(tablePath(GAME.slug, code));
  const fail = (e: unknown) => {
    setLeaving(null);
    if (isMaintenanceError(e)) showMaintenanceNotice();
    else setError(e instanceof ApiError ? e.message : tr(COMMON).unreachable);
  };
  const create = useMutation({
    mutationFn: () => createRoom(profile.token, GAME.slug, { circuit }),
    onMutate: () => {
      setError(null);
      setLeaving(tr(T).online.opening);
    },
    onSuccess: goToTable,
    onError: fail,
  });
  const join = useMutation({
    mutationFn: (code: string) => joinRoom(profile.token, code),
    onMutate: (code) => {
      setError(null);
      setLeaving(tr(T).online.joining(code));
    },
    onSuccess: goToTable,
    onError: (e, code) => {
      if (code === resumeCode && e instanceof ApiError && e.status < 500) {
        setLeaving(null);
        forgetTable(GAME.slug);
        setResumeCode(null);
      } else fail(e);
    },
  });
  const busy = leaving !== null;
  const input = "rounded-xl bg-black/30 px-4 py-3 text-center text-lg font-bold tracking-[0.4em] ring-1 ring-white/15 placeholder:font-normal placeholder:tracking-normal placeholder:text-white/40 focus:outline-2 focus:outline-[#2EC4C6]";

  return (
    <section className={`${card} mb-5 p-4`}>
      <TransitionOverlay label={leaving} />
      <h2 className={`${bungee.className} flex items-center gap-1.5 text-sm text-[#FFB47F]`}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        {t.live}
      </h2>
      <p className="mt-1 text-xs text-white/65">{t.liveNote}</p>

      {resumeCode && resumable && (
        <button
          type="button"
          onClick={() => join.mutate(resumeCode)}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#2EC4C6]/15 px-4 py-3 text-sm font-bold ring-1 ring-[#2EC4C6]/50 enabled:active:translate-y-0.5"
        >
          <span>{t.resume(resumeCode)}</span>
          <span className="text-[#8CE6D2]">→</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (!maintenanceBlocks()) create.mutate();
        }}
        disabled={busy}
        className={`${bungee.className} mt-3 w-full rounded-xl bg-[#FF7A2F] py-3.5 text-lg text-[#1b0d05] shadow-[0_5px_0_#b24c14] transition-transform enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_#b24c14] disabled:opacity-50`}
      >
        {t.create} · {circuitBySlug(circuit).name[lang]}
      </button>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (joinCode.length === 4 && !maintenanceBlocks()) join.mutate(joinCode);
        }}
      >
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder={t.codePlaceholder}
          className={`grow ${input}`}
        />
        <button
          type="submit"
          disabled={joinCode.length !== 4 || busy}
          className="rounded-xl bg-white/10 px-5 font-bold ring-1 ring-white/15 enabled:active:translate-y-0.5 disabled:opacity-40"
        >
          {t.join}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-[#FF8A80]">{error}</p>}

      <h3 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-white/50">{t.openRooms}</h3>
      {rooms.rooms.length ? (
        <ul className="flex flex-col gap-2">
          {rooms.rooms.map((room) => (
            <li key={room.code}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!maintenanceBlocks()) join.mutate(room.code);
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-black/25 p-3 text-left ring-1 ring-white/10 active:translate-y-0.5"
              >
                <span className={`${bungee.className} text-lg tracking-widest`}>{room.code}</span>
                <span className="min-w-0 grow truncate text-xs text-white/60">{room.circuit ? circuitBySlug(room.circuit).name[lang] : ""}</span>
                <span className="flex -space-x-2">
                  {room.players.map((p) => (
                    <Avatar key={p.pseudo} id={p.avatar} size="sm" />
                  ))}
                </span>
                <span className="text-xs tabular-nums text-white/60">{t.pilots(room.seats_taken, room.seats_max)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/20 p-3 text-sm text-white/55">{rooms.ready ? t.noRooms : t.looking}</p>
      )}
    </section>
  );
}
