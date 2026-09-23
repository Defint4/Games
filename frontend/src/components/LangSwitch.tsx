"use client";

import { LANGS, dict, setLang, useLang, useT, type Lang } from "@/lib/i18n";

const T = dict({ fr: { label: "Langue" }, en: { label: "Language" } });

/* Français / English : dans les réglages du hub comme dans ceux d'une table. */
export default function LangSwitch() {
  const lang = useLang();
  const t = useT(T);
  return (
    <div className="flex items-center justify-between rounded-2xl bg-black/25 p-4 ring-1 ring-white/10">
      <span className="font-bold">{t.label}</span>
      <div role="radiogroup" aria-label={t.label} className="flex rounded-full bg-black/30 p-1">
        {(Object.keys(LANGS) as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l}
            onClick={() => setLang(l)}
            className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${
              lang === l ? "bg-gold text-ink" : "text-ivory-dim/75"
            }`}
          >
            {LANGS[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
