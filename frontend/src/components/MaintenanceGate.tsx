"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { ShufflingCards } from "@/components/Loading";
import { fetchMe } from "@/lib/api";
import { dict, useT } from "@/lib/i18n";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { closeNotice, getPhase, pollPhase, useNoticeOpen, usePhase } from "@/lib/maintenance";
import { sfx } from "@/lib/sound";

const T = dict({
  fr: {
    title: "Maintenance en cours",
    body: "On améliore l’app. Elle revient dans quelques minutes.",
    auto: "Cette page se rouvrira toute seule.",
    admin: "Administration",
    noticeTitle: "Maintenance en cours",
    noticeBody:
      "Une courte maintenance arrive : aucune nouvelle partie ne peut être lancée pour le moment. Les parties en cours se terminent normalement.",
    ok: "Compris",
    adminBanner: "Maintenance : l’app est fermée aux joueurs.",
  },
  en: {
    title: "Under maintenance",
    body: "We’re improving the app. It’ll be back in a few minutes.",
    auto: "This page will reopen by itself.",
    admin: "Admin",
    noticeTitle: "Maintenance under way",
    noticeBody:
      "A short maintenance is coming: no new game can be started for now. Games in progress finish as usual.",
    ok: "Got it",
    adminBanner: "Maintenance: the app is closed to players.",
  },
});

/* Lecture de l'état : toutes les 20 s app ouverte, toutes les 5 s pendant une
   maintenance (pour fermer puis rouvrir sans délai), et au retour au premier plan. */
const POLL_OPEN_MS = 20000;
const POLL_MAINTENANCE_MS = 5000;

/* Parties solo en cours : leur chrono (Solitaire, mesuré par le serveur) ou leur pendule
   (échecs contre l'ordinateur) continue de tourner ; les couper les fausserait. Elles
   se finissent, l'écran de maintenance vient en quittant la page. */
const SOLO_GAME_PATHS = ["/solitaire/play", "/chess/bot"];

/* Le passage de l'app en maintenance, autour de toutes les pages. Fermée (« locked »),
   l'app laisse place à l'écran de maintenance, sauf pour l'admin (qui doit pouvoir la
   rouvrir), sur le panneau lui-même et pendant une partie solo. À la réouverture — après un déploiement, le
   serveur redémarre ouvert —, la page se recharge sur la nouvelle version. */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const phase = usePhase();
  const pathname = usePathname();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [adminEntry, setAdminEntry] = useState(false);
  const blockedRef = useRef(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await pollPhase();
      if (!stopped) {
        timer = setTimeout(loop, getPhase() === "off" ? POLL_OPEN_MS : POLL_MAINTENANCE_MS);
      }
    };
    void loop();
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollPhase();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    // Profil et adresse lus après montage (localStorage, ?admin) ; relus à chaque page
    // (connexion, déconnexion).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(currentProfile());
    setAdminEntry(new URLSearchParams(window.location.search).has("admin"));
  }, [pathname]);

  // Le compte admin passe : même requête (et même cache) que l'accueil.
  const me = useQuery({
    queryKey: ["me", profile?.pseudo],
    queryFn: () => fetchMe(profile!.token),
    enabled: phase === "locked" && profile !== null,
  });
  const isAdmin = me.data?.admin === true;
  const exempt =
    isAdmin ||
    pathname.startsWith("/admin") ||
    (pathname === "/" && adminEntry) ||
    SOLO_GAME_PATHS.includes(pathname);
  const blocked = phase === "locked" && !exempt;
  // Le temps de savoir si le compte est celui de l'admin, l'écran de maintenance
  // s'affiche sans compter comme vu (pas de rechargement de l'admin à la réouverture).
  const deciding = profile !== null && me.isPending;

  useEffect(() => {
    if (exempt) blockedRef.current = false;
    else if (blocked && !deciding) blockedRef.current = true;
    // Réouverture vue depuis l'écran de maintenance : la nouvelle version, en entier.
    else if (blockedRef.current && phase === "off") window.location.reload();
  }, [blocked, deciding, exempt, phase]);

  return (
    <>
      {blocked ? <MaintenanceScreen /> : children}
      {!blocked && phase === "locked" && isAdmin && <AdminBanner />}
      <MaintenanceNotice />
    </>
  );
}

function MaintenanceScreen() {
  const t = useT(T);
  return (
    <main className="relative mx-auto flex h-full w-full max-w-md grow flex-col items-center justify-center gap-7 overflow-y-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center gap-7"
      >
        <h1>
          <Brand size="lg" />
        </h1>
        <ShufflingCards />
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-extrabold">{t.title}</h2>
          <p className="text-ivory-dim/85">{t.body}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-ivory-dim/65">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/70" />
            <span className="relative inline-flex size-2 rounded-full bg-gold" />
          </span>
          {t.auto}
        </p>
      </motion.div>
      {/* Pour l'admin, qui doit pouvoir rouvrir l'app depuis la PWA (pas de barre
          d'adresse). Le panneau n'existe que pour son compte. */}
      <a
        href="/admin"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-xs text-ivory-dim/30"
      >
        {t.admin}
      </a>
    </main>
  );
}

/* Le popup d'une partie refusée pendant la maintenance. */
function MaintenanceNotice() {
  const open = useNoticeOpen();
  const t = useT(T);
  useEffect(() => {
    if (!open) return;
    sfx.nope();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNotice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="notice"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="maintenance-notice-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={closeNotice}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-felt-800 p-6 text-center shadow-card ring-1 ring-white/15"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-gold text-ink">
              <WrenchIcon />
            </span>
            <h2 id="maintenance-notice-title" className="text-xl font-extrabold">
              {t.noticeTitle}
            </h2>
            <p className="text-sm leading-relaxed text-ivory-dim/85">{t.noticeBody}</p>
            <button
              type="button"
              autoFocus
              onClick={closeNotice}
              className="mt-2 w-full rounded-2xl bg-gold py-3.5 text-lg font-extrabold text-ink shadow-card active:translate-y-0.5"
            >
              {t.ok}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AdminBanner() {
  const t = useT(T);
  return (
    <p className="pointer-events-none fixed inset-x-0 top-0 z-[55] bg-gold px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] text-center text-xs font-bold text-ink">
      {t.adminBanner}
    </p>
  );
}

/* Une clé à molette (tracé Lucide, licence ISC). */
function WrenchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-7 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
