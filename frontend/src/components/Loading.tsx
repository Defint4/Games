"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import PlayingCard from "@/components/PlayingCard";
import { dict, useT } from "@/lib/i18n";
import { COMMON } from "@/lib/texts";

const T = dict({
  fr: { slow: "Ça prend plus de temps que prévu.", reload: "Recharger" },
  en: { slow: "This is taking longer than expected.", reload: "Reload" },
});

/* Les écrans d'attente de la plateforme. Un seul motif partout — deux cartes qui se
   battent — pour que passer d'un écran à l'autre ne casse jamais le mouvement :
   l'accueil affiche le voile pendant la création, la table reprend la même animation
   jusqu'à ce que tout soit prêt. */

export function ShufflingCards({ size = "sm" }: { size?: "sm" | "md" }) {
  const box = size === "md" ? "h-24 w-24" : "h-16 w-16";
  return (
    <div className={`relative ${box}`} aria-hidden>
      <span className="animate-shuffle-left absolute left-1 top-0">
        <PlayingCard faceDown size={size} />
      </span>
      <span
        className={`animate-shuffle-right absolute top-1 ${size === "md" ? "left-9" : "left-6"}`}
      >
        <PlayingCard faceDown size={size} />
      </span>
    </div>
  );
}

/* Écran d'attente plein cadre (connexion à une table, chargement des cartes).
   Sans libellé : « Un instant… ». `patient` : attente longue par nature (gros fichier
   sur réseau lent), pas de rechargement automatique, seulement le lien. */
export function LoadingScreen({ label, patient = false }: { label?: string; patient?: boolean }) {
  const common = useT(COMMON);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-ivory-dim">
      <ShufflingCards />
      <p>{label ?? common.wait}</p>
      <StuckHint auto={!patient} />
    </div>
  );
}

/* Au-delà de 25 s d'attente, un rechargement automatique ; au plus un toutes les deux
   minutes, pour ne pas boucler si le serveur est vraiment tombé. */
const AUTO_RELOAD_MS = 25000;
const RELOAD_KEY = "games:auto-reload";

function autoReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 120000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

/* Filet de sécurité d'une attente qui s'éternise (réseau bloqué, page restée sur une
   ancienne version après un déploiement) : en PWA il n'y a pas de bouton recharger.
   Le lien apparaît au bout de 8 s par la seule CSS (.stuck-hint) : il marche même si
   le JS de la page n'a jamais démarré, d'où un vrai href. */
export function StuckHint({ auto = true }: { auto?: boolean }) {
  const t = useT(T);
  const pathname = usePathname();
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(autoReload, AUTO_RELOAD_MS);
    return () => clearTimeout(timer);
  }, [auto]);
  return (
    <p className="stuck-hint flex flex-col items-center gap-3 text-sm text-ivory-dim/75">
      {t.slow}
      <a
        href={pathname}
        onClick={(e) => {
          // Page démarrée : on recharge l'adresse exacte, paramètres compris.
          e.preventDefault();
          window.location.reload();
        }}
        className="rounded-2xl px-5 py-2.5 font-bold text-ivory ring-1 ring-white/20 active:translate-y-0.5"
      >
        {t.reload}
      </a>
    </p>
  );
}

/* Voile de transition posé par-dessus l'écran courant, le temps d'une requête qui mène
   ailleurs (créer ou rejoindre une table) : le bouton a réagi, personne ne recliquera. */
export function TransitionOverlay({ label }: { label: string | null }) {
  return (
    <AnimatePresence>
      {label && (
        <motion.div
          key="overlay"
          role="status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-felt-900/85 text-ivory-dim backdrop-blur-sm"
        >
          <ShufflingCards />
          <p className="font-semibold">{label}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
