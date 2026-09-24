"use client";

import { useEffect } from "react";
import { HUB_PATH } from "@/lib/games";
import { dict, useT } from "@/lib/i18n";

const T = dict({
  fr: {
    title: "Oups, quelque chose a coincé.",
    hint: "Un rechargement règle presque toujours le problème.",
    retry: "Recharger",
    home: "Retour aux jeux",
  },
  en: {
    title: "Oops, something got stuck.",
    hint: "A reload almost always fixes it.",
    retry: "Reload",
    home: "Back to the games",
  },
});

/* L'écran d'une erreur de rendu (error.tsx, global-error.tsx). Le plus souvent un
   fichier de l'ancienne version demandé juste après un déploiement : un rechargement
   complet, pas un simple nouveau rendu, remet tout d'aplomb. Liens en dur : le routeur
   est peut-être justement ce qui a planté. */
export default function Crash({ error }: { error: Error }) {
  const t = useT(T);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex h-full grow flex-col items-center justify-center gap-4 px-6 text-center text-ivory-dim">
      <p className="text-lg font-extrabold text-ivory">{t.title}</p>
      <p className="-mt-2 text-sm">{t.hint}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded-2xl bg-gold px-6 py-3 font-extrabold text-ink active:translate-y-0.5"
      >
        {t.retry}
      </button>
      <a href={HUB_PATH} className="rounded-2xl px-6 py-2 font-bold text-ivory-dim/80">
        {t.home}
      </a>
    </main>
  );
}
