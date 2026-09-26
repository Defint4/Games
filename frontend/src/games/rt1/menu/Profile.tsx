"use client";

/* Profil : le pilote, ses temps, les réglages du jeu. */

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import LangSwitch from "@/components/LangSwitch";
import SoundToggle from "@/components/SoundToggle";
import { useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { LEVEL } from "../assets";
import { T } from "../i18n";
import { bungee } from "../meta";
import { type Best, formatTime } from "../sim/race";
import { card, Title } from "./Shell";

export default function Profile() {
  const t = useT(T).profile;
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [best, setBest] = useState<Best | null>(null);

  useEffect(() => {
    // Profil et temps lus après montage (localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(currentProfile());
    try {
      const raw = localStorage.getItem(`games:rt1:best:${LEVEL}`);
      if (raw) setBest(JSON.parse(raw) as Best);
    } catch {
      /* stockage indisponible */
    }
  }, []);

  return (
    <>
      <Title>{t.title}</Title>
      <section className={`${card} mb-4 flex items-center gap-3 p-4`}>
        {profile && <Avatar id={profile.avatar} size="lg" />}
        <div>
          <p className="text-lg font-bold">{profile?.pseudo}</p>
          <p className="text-sm text-white/65">{t.rookie}</p>
        </div>
      </section>

      <section className={`${card} mb-4 p-4`}>
        <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{t.times}</h2>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/80">{t.noumea}</span>
          <span className={`${bungee.className} tabular-nums`}>{best ? formatTime(best.time) : "—"}</span>
        </div>
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
