/* Langue de l'interface, français ou anglais. Choisie dans les réglages, mémorisée sur
   l'appareil ; au premier lancement, celle du téléphone.
   Les textes vivent dans des dictionnaires à côté de leur module (`i18n.ts` du dossier) :
   la version française fait foi, l'anglaise doit avoir exactement la même forme. */

import { useSyncExternalStore } from "react";

export type Lang = "fr" | "en";

export const LANGS: Record<Lang, string> = { fr: "Français", en: "English" };

export type Dict<T> = { fr: T; en: T };

/* Déclare un dictionnaire : la forme se déduit du français, l'anglais est vérifié contre. */
export function dict<T>(d: { fr: T; en: NoInfer<T> }): Dict<T> {
  return d;
}

const KEY = "games:lang";

let cache: Lang | null = null;
const listeners = new Set<() => void>();

function detect(): Lang {
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function getLang(): Lang {
  if (typeof window === "undefined") return "fr";
  if (cache) return cache;
  try {
    const stored = localStorage.getItem(KEY);
    cache = stored === "fr" || stored === "en" ? stored : detect();
  } catch {
    cache = detect();
  }
  return cache;
}

export function setLang(lang: Lang) {
  cache = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* stockage indisponible */
  }
  document.documentElement.lang = lang;
  for (const listener of listeners) listener();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLang,
    () => "fr",
  );
}

/* Les textes d'un dictionnaire dans la langue courante ; le composant se met à jour
   quand on change de langue. */
export function useT<T>(d: Dict<T>): T {
  return d[useLang()];
}

/* Hors composant : message construit dans un callback, erreur réseau. */
export function tr<T>(d: Dict<T>): T {
  return d[getLang()];
}
