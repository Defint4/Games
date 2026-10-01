"use client";

/* L'atelier d'un véhicule acheté : les neuf pièces (niveau 1 à 5, le suivant contre de
   l'argent), puis au niveau 5 d'une pièce ses réglages fins (curseur de -1 à +1, envoyé
   au lâcher). Une mission accomplie en chemin s'affiche et sonne. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import type { StoredProfile } from "@/lib/identity";
import { tr, useLang, useT } from "@/lib/i18n";
import { formatMoney, type Rt1State, stateKey, tunePart, upgradePart } from "../api";
import { raceSfx } from "../engineSound";
import { T } from "../i18n";
import { bungee } from "../meta";
import { MAX_LEVEL, type Part, PARTS, type Tune, TUNES, upgradeCost } from "../sim/tuning";
import type { Vehicle } from "../sim/vehicles";

export default function Workshop({ vehicle, state, profile }: { vehicle: Vehicle; state: Rt1State; profile: StoredProfile }) {
  const t = useT(T).workshop;
  const tp = useT(T).paint;
  const lang = useLang();
  const queryClient = useQueryClient();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const w = state.workshop[vehicle.id];
  const level = (p: Part) => w?.levels[p] ?? 1;

  const apply = (next: Rt1State) => {
    const before = new Set(state.missions.filter((m) => m.done).map((m) => m.id));
    const won = next.missions.filter((m) => m.done && !before.has(m.id));
    queryClient.setQueryData(stateKey(profile.pseudo), next);
    if (won.length) {
      raceSfx.cash(won.length + 1);
      setNote({ ok: true, text: won.map((m) => `${tr(T).race.gainMission(tr(T).missions[m.id]?.name ?? m.id)} +${formatMoney(m.reward, lang)}`).join(" · ") });
    }
  };
  const fail = (e: Error) => setNote({ ok: false, text: e instanceof ApiError ? e.message : tr(T).online.failed });
  const upgrade = useMutation({
    mutationFn: (p: Part) => upgradePart(profile.token, vehicle.id, p),
    onMutate: () => setNote(null),
    onSuccess: (next) => {
      raceSfx.checkpoint(true);
      apply(next);
    },
    onError: fail,
  });
  const tune = useMutation({
    mutationFn: ({ key, value }: { key: Tune; value: number }) => tunePart(profile.token, vehicle.id, key, value),
    onSuccess: apply,
    onError: fail,
  });

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <Link
        href={`/rt1/garage/peinture?v=${vehicle.id}`}
        className={`${bungee.className} mb-5 flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#E8552B,#F4B942,#3CCFC6,#2F7BFF)] p-[2px] text-sm`}
      >
        <span className="w-full rounded-[10px] bg-[#0c2b36] py-2.5 text-center">{tp.open}</span>
      </Link>
      <h3 className={`${bungee.className} mb-3 text-sm text-[#8CE6D2]`}>{t.title}</h3>
      <ul className="flex flex-col gap-2">
        {PARTS.map((p) => {
          const lv = level(p);
          const cost = lv < MAX_LEVEL ? upgradeCost(vehicle, lv) : null;
          const busy = upgrade.isPending && upgrade.variables === p;
          return (
            <li key={p} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-white/80">{t.parts[p]}</span>
              <span className="flex grow gap-1" aria-label={t.level(lv)}>
                {Array.from({ length: MAX_LEVEL }, (_, k) => (
                  <span
                    key={k}
                    className={`h-2 grow rounded-full transition-colors duration-300 ${k < lv ? "bg-[linear-gradient(90deg,#FF7A2F,#F4B942)]" : "bg-black/35"}`}
                  />
                ))}
              </span>
              {cost === null ? (
                <span className={`${bungee.className} w-24 shrink-0 text-center text-[11px] text-[#8CE6D2]`}>{t.max}</span>
              ) : (
                <button
                  type="button"
                  disabled={upgrade.isPending || state.money < cost}
                  onClick={() => upgrade.mutate(p)}
                  className={`${bungee.className} flex w-24 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#FF7A2F] py-1.5 text-[11px] tabular-nums text-[#1b0d05] enabled:active:translate-y-0.5 disabled:bg-white/10 disabled:text-white/40`}
                >
                  {busy && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-black/25 border-t-black/70" />}+{formatMoney(cost, lang)}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className={`${bungee.className} mb-2 mt-5 text-sm text-[#8CE6D2]`}>{t.tuningTitle}</h3>
      <ul className="flex flex-col gap-3">
        {TUNES.map(({ key, part }) => (
          <TuneRow
            key={key}
            label={t.tunes[key]}
            ends={t.ends[key]}
            locked={level(part) < MAX_LEVEL}
            lockedText={t.unlock(t.parts[part])}
            value={w?.tune[key] ?? 0}
            onCommit={(value) => tune.mutate({ key, value })}
          />
        ))}
      </ul>

      {note && (
        <p className={`mt-3 text-center text-sm ${note.ok ? "font-bold text-[#FFE08A]" : "text-[#FF8A80]"} [animation:rt1-in_0.25s_ease-out]`}>{note.text}</p>
      )}
    </div>
  );
}

function TuneRow({
  label,
  ends,
  locked,
  lockedText,
  value,
  onCommit,
}: {
  label: string;
  ends: [string, string];
  locked: boolean;
  lockedText: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  // valeur du serveur quand elle change (autre appareil, réponse)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(value);
  }, [value]);
  return (
    <li className={locked ? "opacity-50" : ""}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="text-[11px] text-white/50">{locked ? lockedText : v === 0 ? "0" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-white/45">
        <span className="w-14 shrink-0">{ends[0]}</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.1}
          value={v}
          disabled={locked}
          onChange={(e) => setV(Number(e.target.value))}
          onPointerUp={() => v !== value && onCommit(v)}
          onKeyUp={() => v !== value && onCommit(v)}
          className="h-2 grow accent-[#2EC4C6]"
        />
        <span className="w-14 shrink-0 text-right">{ends[1]}</span>
      </div>
    </li>
  );
}
