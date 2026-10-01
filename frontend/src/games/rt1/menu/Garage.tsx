"use client";

/* Garage : les véhicules dans l'ordre des prix. En haut, celui qu'on regarde (vignette,
   caractéristiques, action : rouler avec, acheter, ou ce qui manque) ; en dessous, la
   grille. L'achat se confirme d'un second tap. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { tr, useLang, useT } from "@/lib/i18n";
import { buyVehicle, formatMoney, type Rt1State, selectVehicle, stateKey, useProfile, useRt1State } from "../api";
import { loadCar } from "../assets";
import { raceSfx } from "../engineSound";
import { T } from "../i18n";
import { bungee } from "../meta";
import type { CarSpec } from "../sim/car";
import { asset } from "../sim/level";
import { performanceIndex, tunedSpec } from "../sim/tuning";
import { ratings, type Vehicle, VEHICLES, vehicleById } from "../sim/vehicles";
import Workshop from "./Workshop";
import { CoinIcon, LockIcon } from "./icons";
import { card, Pending, Title } from "./Shell";

export default function Garage() {
  const t = useT(T).garage;
  const tw = useT(T).workshop;
  const names = useT(T).vehicles;
  const lang = useLang();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const state = useRt1State(profile).data;
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = vehicleById(picked ?? state?.vehicle);
  // caractéristiques et indice avec l'atelier
  const spec = tunedSpec(shown, state?.workshop[shown.id]);

  const done = (next: Rt1State) => {
    queryClient.setQueryData(stateKey(profile!.pseudo), next);
    // le modèle se charge dès maintenant : la prochaine course part sans attente
    void loadCar(next.vehicle).catch(() => {});
  };
  const fail = (e: Error) => setError(e instanceof ApiError ? e.message : tr(T).online.failed);
  const buy = useMutation({
    mutationFn: (id: string) => buyVehicle(profile!.token, id),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      done(next);
      setConfirm(false);
      raceSfx.cash(3);
    },
    onError: fail,
  });
  const select = useMutation({
    mutationFn: (id: string) => selectVehicle(profile!.token, id),
    onMutate: () => setError(null),
    onSuccess: done,
    onError: fail,
  });
  const busy = buy.isPending || select.isPending;

  const pick = (v: Vehicle) => {
    setPicked(v.id);
    setConfirm(false);
    setError(null);
  };

  return (
    <>
      <Title sub={t.sub}>{t.title}</Title>

      <section className={`${card} mb-4 overflow-hidden`}>
        <div className="relative bg-[radial-gradient(90%_80%_at_50%_70%,#1b5566_0%,#0c2b36_75%)]">
          <Image
            key={shown.id}
            src={asset(`cars/${shown.id}.webp`)}
            alt=""
            width={640}
            height={400}
            unoptimized
            priority
            className="aspect-[16/10] w-full object-contain [animation:rt1-in_0.25s_ease-out]"
          />
          <span
            title={tw.piNote}
            className={`${bungee.className} absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-xs tabular-nums text-[#FFE08A] backdrop-blur`}
          >
            {tw.pi(performanceIndex(spec))}
          </span>
          {state?.vehicle === shown.id && (
            <span className={`${bungee.className} absolute left-3 top-3 rounded-full bg-[#2EC4C6] px-3 py-1 text-xs text-[#061920]`}>
              {t.driving}
            </span>
          )}
        </div>
        <div className="p-4">
          <p className={`${bungee.className} text-lg`}>{names[shown.id]?.name}</p>
          <p className="mt-0.5 text-sm text-white/70">{names[shown.id]?.note}</p>
          <Stats spec={spec} />
          <div className="mt-4">
            <Action
              vehicle={shown}
              state={state}
              confirm={confirm}
              busy={busy}
              onDrive={() => select.mutate(shown.id)}
              onBuy={() => (confirm ? buy.mutate(shown.id) : setConfirm(true))}
            />
          </div>
          {error && <p className="mt-2 text-center text-sm text-[#FF8A80]">{error}</p>}
          {state && profile && state.vehicles.includes(shown.id) && <Workshop vehicle={shown} state={state} profile={profile} />}
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-2.5">
        {VEHICLES.map((v) => {
          const owned = state?.vehicles.includes(v.id);
          const locked = state ? state.level < v.level && !owned : false;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => pick(v)}
              aria-pressed={shown.id === v.id}
              className={`${card} relative overflow-hidden p-2 text-left transition-transform active:scale-[0.98] ${
                shown.id === v.id ? "ring-2 ring-[#2EC4C6]" : ""
              }`}
            >
              <Image
                src={asset(`cars/${v.id}.webp`)}
                alt=""
                width={320}
                height={200}
                unoptimized
                className={`aspect-[16/10] w-full object-contain ${locked ? "opacity-40 grayscale" : ""}`}
              />
              <p className={`${bungee.className} truncate text-xs`}>{names[v.id]?.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/60">
                {!state ? (
                  <Pending />
                ) : state.vehicle === v.id ? (
                  <span className="font-bold text-[#2EC4C6]">{t.driving}</span>
                ) : owned ? (
                  <span className="font-bold text-[#8CE6D2]">{t.owned}</span>
                ) : locked ? (
                  <>
                    <LockIcon className="size-3.5" />
                    {t.needLevel(v.level)}
                  </>
                ) : (
                  <>
                    <CoinIcon className="size-3.5 text-[#F4B942]" />
                    <span className="tabular-nums">{formatMoney(v.price, lang)}</span>
                  </>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.soon}</h2>
      <div className="flex flex-col gap-3">
        {t.groups.map((g) => (
          <section key={g.title} className={`${card} p-4 opacity-80`}>
            <h3 className={`${bungee.className} mb-1.5 flex items-center gap-1.5 text-sm`}>
              <LockIcon className="size-4 text-white/50" />
              {g.title}
            </h3>
            <ul className="flex flex-col gap-1 text-sm text-white/70">
              {g.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function Stats({ spec }: { spec: CarSpec }) {
  const t = useT(T).garage.stats;
  const r = ratings(spec);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {(["speed", "accel", "grip"] as const).map((k) => (
        <div key={k} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 text-white/60">{t[k]}</span>
          <span className="h-2 grow overflow-hidden rounded-full bg-black/35">
            <span
              className="block h-full rounded-full bg-[linear-gradient(90deg,#FF7A2F,#F4B942)] transition-[width] duration-500"
              style={{ width: `${Math.round(r[k] * 100)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function Action({
  vehicle: v,
  state,
  confirm,
  busy,
  onDrive,
  onBuy,
}: {
  vehicle: Vehicle;
  state: Rt1State | undefined;
  confirm: boolean;
  busy: boolean;
  onDrive: () => void;
  onBuy: () => void;
}) {
  const t = useT(T).garage;
  const lang = useLang();
  const base = `${bungee.className} flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base transition-transform`;
  if (!state) return <div className="h-12 animate-pulse rounded-xl bg-white/5" />;
  if (state.vehicle === v.id) {
    return <p className={`${base} bg-[#2EC4C6]/15 text-[#8CE6D2]`}>{t.driving}</p>;
  }
  if (state.vehicles.includes(v.id)) {
    return (
      <button type="button" disabled={busy} onClick={onDrive} className={`${base} bg-[#2EC4C6] text-[#061920] enabled:active:translate-y-0.5 disabled:opacity-60`}>
        {busy && <Spinner />}
        {t.drive}
      </button>
    );
  }
  if (state.level < v.level) {
    return (
      <p className={`${base} bg-black/25 text-white/55`}>
        <LockIcon className="size-4" />
        {t.needLevel(v.level)}
      </p>
    );
  }
  if (state.money < v.price) {
    return <p className={`${base} bg-black/25 text-white/55`}>{t.needMoney(formatMoney(v.price - state.money, lang))}</p>;
  }
  const price = formatMoney(v.price, lang);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onBuy}
      className={`${base} ${confirm ? "bg-[#F4B942]" : "bg-[#FF7A2F]"} text-[#1b0d05] shadow-[0_5px_0_#b24c14] enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_#b24c14] disabled:opacity-60`}
    >
      {busy && <Spinner />}
      {confirm ? t.confirm(price) : t.buy(price)}
    </button>
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-black/25 border-t-black/70" />;
}
