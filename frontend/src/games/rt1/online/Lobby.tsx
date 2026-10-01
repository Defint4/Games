"use client";

/* Le salon d'une course en direct : le code à partager, le circuit (que le créateur peut
   changer), les pilotes avec leur véhicule et leur couleur, le bouton « Prêt » une fois
   le circuit chargé. Une fois la course finie (quand on arrive après coup), le
   classement et la revanche. */

import Image from "next/image";
import Avatar from "@/components/Avatar";
import { useLang, useT } from "@/lib/i18n";
import { CIRCUITS, circuitBySlug, MEDALS, medalsFor } from "../circuits";
import { T } from "../i18n";
import MedalIcon from "../MedalIcon";
import { BackIcon } from "../menu/icons";
import { card } from "../menu/Shell";
import { bungee } from "../meta";
import { asset } from "../sim/level";
import { formatTime } from "../sim/race";
import type { RaceRoomView } from "./types";

const MAX_PILOTS = 8;

export default function Lobby({
  view,
  canReady,
  progress,
  loadFailed,
  error,
  rematching,
  onReady,
  onCircuit,
  onLeave,
  onRematch,
}: {
  view: RaceRoomView;
  /* circuit et véhicule chargés : on peut se dire prêt */
  canReady: boolean;
  progress: number;
  loadFailed: boolean;
  error: string | null;
  rematching: boolean;
  onReady: (ready: boolean) => void;
  onCircuit: (slug: string) => void;
  onLeave: () => void;
  onRematch: () => void;
}) {
  const all = useT(T);
  const t = all.lobby;
  const vehicles = all.vehicles;
  const lang = useLang();
  const circuit = circuitBySlug(view.circuit);
  const me = view.players[view.your_seat];
  const creator = view.your_seat === 0;
  const lobby = view.status === "lobby";
  const finished = view.status === "finished";
  const free = MAX_PILOTS - view.players.length;
  const pct = Math.round(progress * 100);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[radial-gradient(130%_70%_at_50%_0%,#0f4a59_0%,#0a2e39_45%,#061920_100%)] text-white">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onLeave} aria-label={t.leave} className="-ml-1 rounded-full p-1.5 text-white/70 active:scale-95">
          <BackIcon className="size-6" />
        </button>
        <span className={`${bungee.className} rounded-[8px] border-2 border-white bg-[#C8232C] px-2 pb-0.5 pt-1 text-lg leading-none`}>RT1</span>
        <span className={`${bungee.className} ml-auto rounded-full bg-black/30 px-3 py-1 text-sm tracking-[0.2em] ring-1 ring-white/10`}>
          {t.code(view.code)}
        </span>
      </header>

      <main className="min-h-0 grow overflow-y-auto px-4 pb-4 pt-1">
        {lobby && <p className="mb-3 text-center text-xs text-white/55">{t.share}</p>}

        <section className={`${card} mb-4 overflow-hidden`}>
          <div className="relative">
            <Image key={view.circuit} src={asset(`${view.circuit}/cover.webp`)} alt="" width={960} height={400} priority unoptimized className="aspect-[12/5] w-full bg-[#8fd0ea] object-cover" />
            <span className={`${bungee.className} absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-xs backdrop-blur`}>{t.circuit}</span>
          </div>
          <div className="p-4">
            <p className={`${bungee.className} text-lg`}>{circuit.name[lang]}</p>
            <p className="mt-1 text-sm text-white/70">{circuit.note[lang]}</p>
            <div className="mt-3 flex gap-3">
              {MEDALS.map((m) => (
                <span key={m} className="flex items-center gap-1 text-[11px] tabular-nums text-white/70">
                  <MedalIcon medal={m} earned className="size-5" />
                  {formatTime(medalsFor(circuit, view.players[view.your_seat]?.vehicle ?? "starter")[m]).replace(/^0:/, "")}
                </span>
              ))}
            </div>
            {lobby && creator && (
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {CIRCUITS.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onCircuit(c.slug)}
                    aria-pressed={c.slug === view.circuit}
                    className={`${bungee.className} shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                      c.slug === view.circuit ? "bg-[#2EC4C6] text-[#061920]" : "bg-black/30 text-white/75 ring-1 ring-white/10"
                    }`}
                  >
                    {c.name[lang]}
                  </button>
                ))}
              </div>
            )}
            {lobby && !creator && <p className="mt-3 text-xs text-white/50">{t.creatorPicks}</p>}
          </div>
        </section>

        <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{finished ? t.finished : t.pilots}</h2>
        <ol className="flex flex-col gap-2">
          {(finished ? view.places : view.players.map((p) => p.seat)).map((seat, i) => {
            const p = view.players[seat];
            if (!p) return null;
            const mine = seat === view.your_seat;
            return (
              <li key={seat} className={`${card} flex items-center gap-3 p-3 ${mine ? "ring-2 ring-[#2EC4C6]" : ""} ${p.connected ? "" : "opacity-60"}`}>
                {finished ? (
                  <span className={`${bungee.className} w-6 text-center text-sm tabular-nums ${p.time_ms !== null && i < 3 ? "text-[#FFE08A]" : "text-white/55"}`}>{p.time_ms !== null ? i + 1 : "–"}</span>
                ) : null}
                <Avatar id={p.avatar} size="sm" />
                <span className="min-w-0 grow leading-tight">
                  <span className="block truncate text-sm font-bold">{p.pseudo}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: p.color }} />
                    <span className="truncate">{vehicles[p.vehicle]?.name ?? p.vehicle}</span>
                  </span>
                </span>
                {finished ? (
                  <span className={`${bungee.className} shrink-0 text-sm tabular-nums ${p.time_ms !== null ? "" : "text-white/40"}`}>
                    {p.time_ms !== null ? formatTime(p.time_ms / 1000) : "–"}
                  </span>
                ) : (
                  <span
                    className={`${bungee.className} shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                      !p.connected ? "bg-white/10 text-white/60" : p.ready ? "bg-[#2EC4C6] text-[#061920]" : "bg-black/30 text-white/60 ring-1 ring-white/10"
                    }`}
                  >
                    {!p.connected ? t.disconnected : p.ready ? t.ready : t.waiting}
                  </span>
                )}
              </li>
            );
          })}
          {lobby && free > 0 && (
            <li className="rounded-2xl border border-dashed border-white/20 p-3 text-center text-xs text-white/50">{t.free(free)}</li>
          )}
        </ol>
        {error && <p className="mt-3 text-sm text-[#FF8A80]">{error}</p>}
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-[#061a21]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {lobby && (
          <>
            {!canReady ? (
              <div className="mb-3">
                <div className="relative h-2 overflow-hidden rounded-full bg-black/40">
                  <div className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#2ec4c6,#8ce6d2_70%,#ff7a2f)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <p className={`mt-1.5 text-center text-xs ${loadFailed ? "text-[#FF8A80]" : "text-white/60"}`}>{loadFailed ? all.loader.failed : t.loading(pct)}</p>
              </div>
            ) : (
              <p className="mb-3 text-center text-xs text-white/60">{view.players.length < 2 ? t.need : t.start}</p>
            )}
            <button
              type="button"
              disabled={!canReady}
              aria-pressed={me?.ready ?? false}
              onClick={() => onReady(!me?.ready)}
              className={`${bungee.className} w-full rounded-xl py-4 text-xl transition-transform enabled:active:translate-y-1 disabled:opacity-40 ${
                me?.ready
                  ? "bg-[#2EC4C6] text-[#061920] shadow-[0_5px_0_#178a8c] enabled:active:shadow-[0_2px_0_#178a8c]"
                  : "bg-[#FF7A2F] text-[#1b0d05] shadow-[0_6px_0_#b24c14] enabled:active:shadow-[0_2px_0_#b24c14]"
              }`}
            >
              {me?.ready ? t.ready + " ✓" : t.ready}
            </button>
          </>
        )}
        {view.status === "playing" && <p className={`${bungee.className} py-3 text-center text-lg text-[#8CE6D2]`}>{t.starting}</p>}
        {finished && (
          <div className="flex gap-3">
            <button type="button" onClick={onLeave} className="rounded-xl bg-white/10 px-5 py-3.5 font-bold ring-1 ring-white/15 active:translate-y-0.5">
              {t.leave}
            </button>
            <button
              type="button"
              onClick={onRematch}
              disabled={rematching}
              className={`${bungee.className} grow rounded-xl bg-[#FF7A2F] py-3.5 text-lg text-[#1b0d05] shadow-[0_5px_0_#b24c14] enabled:active:translate-y-1 disabled:opacity-50`}
            >
              {rematching ? t.rematching : t.again}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
