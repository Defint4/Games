"use client";

import { useEffect, useState } from "react";
import { dict, useT } from "@/lib/i18n";
import { isMuted, setMuted } from "@/lib/sound";

const T = dict({
  fr: { sounds: "Sons", off: "Coupés", on: "Activés" },
  en: { sounds: "Sound", off: "Off", on: "On" },
});

/* Sons activés / coupés : dans les réglages du hub comme dans ceux d'une table. */
export default function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  const t = useT(T);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMutedState(isMuted());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        setMuted(!muted);
        setMutedState(!muted);
      }}
      className="flex items-center justify-between rounded-2xl bg-black/25 p-4 ring-1 ring-white/10"
    >
      <span className="font-bold">{t.sounds}</span>
      <span
        className={`rounded-full px-3 py-1 text-sm font-bold ${
          muted ? "bg-white/10 text-ivory-dim/70" : "bg-gold text-ink"
        }`}
      >
        {muted ? t.off : t.on}
      </span>
    </button>
  );
}
