"use client";

/* Profil : le pilote (niveau, argent, courses), ses temps et ses places, les réglages. */

import Avatar from "@/components/Avatar";
import LangSwitch from "@/components/LangSwitch";
import SoundToggle from "@/components/SoundToggle";
import { useLang, useT } from "@/lib/i18n";
import { formatMoney, useProfile, useRt1State } from "../api";
import { CIRCUITS, medalFor } from "../circuits";
import { T } from "../i18n";
import { bungee } from "../meta";
import MedalIcon from "../MedalIcon";
import { formatTime } from "../sim/race";
import { CoinIcon } from "./icons";
import { card, Pending, Title } from "./Shell";

export default function Profile() {
  const t = useT(T).profile;
  const lang = useLang();
  const profile = useProfile();
  const state = useRt1State(profile).data;
  const span = state ? state.next_level_xp - state.level_xp : 1;
  const into = state ? state.xp - state.level_xp : 0;

  return (
    <>
      <Title>{t.title}</Title>
      <section className={`${card} mb-4 p-4`}>
        <div className="flex items-center gap-3">
          {profile && <Avatar id={profile.avatar} size="lg" />}
          <div className="min-w-0 grow">
            <p className="truncate text-lg font-bold">{profile?.pseudo}</p>
            <p className={`${bungee.className} text-sm text-[#8CE6D2]`}>{state ? t.level(state.level) : <Pending />}</p>
          </div>
          <p className={`${bungee.className} flex shrink-0 items-center gap-1.5 text-base`}>
            <CoinIcon className="size-5 text-[#F4B942]" />
            {state ? formatMoney(state.money, lang) : <Pending />}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#1E8C84,#2EC4C6)] transition-[width] duration-700"
            style={{ width: `${Math.round((into / span) * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-white/55">
          <span className="tabular-nums">{state && t.xp(into, span)}</span>
          <span>{state && t.finishes(state.finishes)}</span>
        </div>
      </section>

      <section className={`${card} mb-4 p-4`}>
        <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.times}</h2>
        <ul className="flex flex-col gap-2">
          {CIRCUITS.map((c) => {
            const rec = state?.records[c.slug];
            const time = rec ? rec.time_ms / 1000 : null;
            const medal = medalFor(c, time, rec?.vehicle ?? "starter");
            return (
              <li key={c.slug} className="flex items-center gap-2 text-sm">
                <MedalIcon medal={medal ?? "bronze"} earned={medal !== null} className="size-5" />
                <span className="grow text-white/80">{c.name[lang]}</span>
                {rec && <span className="text-xs text-white/50">{t.place(rec.rank)}</span>}
                <span className={`${bungee.className} tabular-nums`}>
                  {!state ? <Pending /> : time != null ? formatTime(time) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.settings}</h2>
      <div className="flex flex-col gap-3">
        <LangSwitch />
        <SoundToggle />
        <div className="flex items-center justify-between rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
          <span className="font-bold">{t.controls}</span>
          <span className="text-sm text-white/55">{t.controlsSoon}</span>
        </div>
      </div>
    </>
  );
}
