"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Brand from "@/components/Brand";
import { APP_NAME } from "@/lib/games";
import { dict, useT } from "@/lib/i18n";

const T = dict({
  fr: {
    intro:
      "On joue dans l’application, pas dans le navigateur. Installe-la sur ton écran d’accueil, c’est fait en dix secondes.",
    installed: (app: string) => `C’est installé ! Ouvre ${app} depuis ton écran d’accueil.`,
    install: "Installer l’application",
    otherBrowser:
      "Dans le menu du navigateur (⋮), choisis « Ajouter à l’écran d’accueil », puis lance l’app depuis la nouvelle icône.",
    inAppTitle: (browser: string) => `Ouvre le jeu dans ${browser}`,
    inAppWhy: (app: string | null) =>
      `Le lien s’est ouvert dans ${app ? `le navigateur de ${app}` : "le navigateur d’une autre app"} : on ne peut pas installer le jeu d’ici.`,
    openIn: (browser: string) => `Ouvrir dans ${browser}`,
    copy: "Copier le lien",
    copied: (browser: string) => `Lien copié ! Colle-le dans la barre d’adresse de ${browser}.`,
    inAppManual: (browser: string) =>
      `Rien ne s’ouvre ? Touche le menu de l’app (⋯ ou ↗, souvent en haut à droite) et choisis « Ouvrir dans ${browser} » ou « Ouvrir dans le navigateur ».`,
    otherIosTitle: "Ouvre le jeu dans Safari",
    otherIosWhy: "Sur iPhone, c’est depuis Safari qu’on installe le jeu le plus facilement.",
    here: "ici",
    safariMore: "Touche ⋯ en bas à droite",
    safariShare: "Touche Partager",
    safariShareBar: "Touche Partager, en bas de l’écran",
    safariShareIpad: "Touche Partager, en haut à droite",
    safariAdd: "Choisis « Sur l’écran d’accueil » (fais défiler la liste si besoin)",
    safariConfirm: "Touche Ajouter, puis ouvre l’app depuis la nouvelle icône",
    chromeShare: "Touche Partager, dans la barre d’adresse en haut à droite",
    chromeAdd: "Choisis « Ajouter à l’écran d’accueil » (dans « Plus » si tu ne le vois pas)",
    chromeConfirm: "Touche Ajouter, puis ouvre l’app depuis la nouvelle icône",
  },
  en: {
    intro:
      "We play in the app, not in the browser. Add it to your home screen, it takes ten seconds.",
    installed: (app: string) => `Installed! Open ${app} from your home screen.`,
    install: "Install the app",
    otherBrowser:
      "In the browser menu (⋮), pick “Add to Home screen”, then open the app from the new icon.",
    inAppTitle: (browser: string) => `Open the game in ${browser}`,
    inAppWhy: (app: string | null) =>
      `The link opened inside ${app ? `${app}'s browser` : "another app's browser"}: the game can't be installed from there.`,
    openIn: (browser: string) => `Open in ${browser}`,
    copy: "Copy the link",
    copied: (browser: string) => `Link copied! Paste it in ${browser}'s address bar.`,
    inAppManual: (browser: string) =>
      `Nothing opens? Tap the app's menu (⋯ or ↗, often top right) and pick “Open in ${browser}” or “Open in browser”.`,
    otherIosTitle: "Open the game in Safari",
    otherIosWhy: "On iPhone, Safari is the easiest way to install the game.",
    here: "here",
    safariMore: "Tap ⋯ at the bottom right",
    safariShare: "Tap Share",
    safariShareBar: "Tap Share, at the bottom of the screen",
    safariShareIpad: "Tap Share, at the top right",
    safariAdd: "Pick “Add to Home Screen” (scroll the list if needed)",
    safariConfirm: "Tap Add, then open the app from the new icon",
    chromeShare: "Tap Share, in the address bar at the top right",
    chromeAdd: "Pick “Add to Home Screen” (under “More” if you don't see it)",
    chromeConfirm: "Tap Add, then open the app from the new icon",
  },
});

/* Sur téléphone, on joue dans l'app installée (PWA), pas dans le navigateur.
   Ce composant bloque le navigateur mobile et guide l'installation.
   Sur ordinateur, le navigateur reste libre.

   Sur iPhone, aucun site ne peut déclencher l'installation : il faut passer par le
   menu Partager, dont la place change selon le navigateur et la version d'iOS. On
   détecte donc où l'on est pour montrer les bonnes étapes, flèche à l'appui. Le cas
   qui bloque le plus : un lien ouvert depuis Snapchat, Instagram, Messenger… Leur
   navigateur intégré ne sait pas installer ; il faut d'abord en sortir. */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform =
  | { kind: "in-app"; os: "ios" | "android"; app: string | null }
  | { kind: "safari"; bar: "more" | "share" | "top" }
  | { kind: "ios-chrome" }
  | { kind: "ios-other" }
  | { kind: "android" };

/* Les apps dont le navigateur intégré se reconnaît à l'agent utilisateur. */
const IN_APP: [RegExp, string][] = [
  [/Snapchat/i, "Snapchat"],
  [/Instagram/i, "Instagram"],
  [/FBAN\/Messenger|MessengerForiOS|MessengerLite/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/musical_ly|TikTok|BytedanceWebview/i, "TikTok"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Twitter/i, "X"],
  [/Pinterest/i, "Pinterest"],
  [/\bLine\//i, "LINE"],
  [/GSA\//i, "Google"],
];

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const ios = /iPhone|iPod/.test(ua) || ipad;
  const app = IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
  if (ios) {
    // Safari, Chrome, Firefox… portent tous « Safari/ » ; une vue web intégrée non.
    if (app || !/Safari\//.test(ua)) return { kind: "in-app", os: "ios", app };
    if (/CriOS/.test(ua)) return { kind: "ios-chrome" };
    if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/.test(ua)) return { kind: "ios-other" };
    if (ipad) return { kind: "safari", bar: "top" };
    // Safari 26 : Partager est rangé dans le menu ⋯ en bas à droite.
    const version = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return { kind: "safari", bar: version >= 26 ? "more" : "share" };
  }
  if (app || /; wv\)/.test(ua)) return { kind: "in-app", os: "android", app };
  return { kind: "android" };
}

/* Sortir d'un navigateur intégré : iOS 17+ ouvre Safari sur les liens x-safari-https,
   Android passe les liens intent:// à Chrome. */
function openOutside(os: "ios" | "android") {
  const { href, host, pathname, search } = window.location;
  window.location.href =
    os === "ios"
      ? `x-safari-${href}`
      : `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

type GateState = "checking" | "open" | "install";

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const t = useT(T);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* l'installation restera possible via le manifest seul */
      });
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    const mobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const gated = mobile && !standalone && process.env.NODE_ENV === "production";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform());
    setState(gated ? "install" : "open");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "open") return <>{children}</>;
  if (state === "checking" || !platform) return null;

  const inApp = platform.kind === "in-app" || platform.kind === "ios-other";

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 overflow-y-auto px-6 pb-24 pt-10 text-center">
      <div>
        <h1>
          <Brand size="lg" />
        </h1>
        {!inApp && <p className="mt-4 text-ivory-dim/90">{t.intro}</p>}
      </div>

      {installed ? (
        <p className="rounded-2xl bg-gold/15 px-4 py-3 font-bold text-gold ring-1 ring-gold/40">
          {t.installed(APP_NAME)}
        </p>
      ) : platform.kind === "in-app" ? (
        <EscapeInApp os={platform.os} app={platform.app} />
      ) : platform.kind === "ios-other" ? (
        <EscapeInApp os="ios" app={null} title={t.otherIosTitle} why={t.otherIosWhy} />
      ) : platform.kind === "safari" ? (
        <>
          <Steps
            steps={
              platform.bar === "more"
                ? [
                    { text: t.safariMore, icon: <MoreIcon /> },
                    { text: t.safariShare, icon: <ShareIcon /> },
                    { text: t.safariAdd, icon: <AddIcon /> },
                    { text: t.safariConfirm },
                  ]
                : [
                    {
                      text: platform.bar === "top" ? t.safariShareIpad : t.safariShareBar,
                      icon: <ShareIcon />,
                    },
                    { text: t.safariAdd, icon: <AddIcon /> },
                    { text: t.safariConfirm },
                  ]
            }
          />
          <Pointer
            at={
              platform.bar === "more"
                ? "bottom-right"
                : platform.bar === "top"
                  ? "top-right"
                  : "bottom-center"
            }
          />
        </>
      ) : platform.kind === "ios-chrome" ? (
        <>
          <Steps
            steps={[
              { text: t.chromeShare, icon: <ShareIcon /> },
              { text: t.chromeAdd, icon: <AddIcon /> },
              { text: t.chromeConfirm },
            ]}
          />
          <Pointer at="top-right" />
        </>
      ) : installEvent ? (
        <button
          type="button"
          onClick={() => installEvent.prompt()}
          className="rounded-2xl bg-gold px-8 py-4 text-lg font-extrabold text-ink shadow-card active:translate-y-0.5"
        >
          {t.install}
        </button>
      ) : (
        <p className="rounded-2xl bg-black/25 p-4 text-left ring-1 ring-white/10">
          {t.otherBrowser}
        </p>
      )}
    </main>
  );
}

function EscapeInApp({
  os,
  app,
  title,
  why,
}: {
  os: "ios" | "android";
  app: string | null;
  title?: string;
  why?: string;
}) {
  const t = useT(T);
  const [copied, setCopied] = useState<boolean | null>(null);
  const browser = os === "ios" ? "Safari" : "Chrome";

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Presse-papiers refusé par la vue intégrée : on affiche le lien à copier à la main.
      setCopied(false);
    }
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold">{title ?? t.inAppTitle(browser)}</h2>
        <p className="mt-2 text-ivory-dim/85">{why ?? t.inAppWhy(app)}</p>
      </div>
      <button
        type="button"
        onClick={() => openOutside(os)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-4 text-lg font-extrabold text-ink shadow-card active:translate-y-0.5"
      >
        <ExternalIcon />
        {t.openIn(browser)}
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded-2xl bg-black/25 px-6 py-3.5 font-bold ring-1 ring-white/15 active:translate-y-0.5"
      >
        {t.copy}
      </button>
      {copied === true && (
        <p className="rounded-2xl bg-gold/15 px-4 py-3 text-sm font-bold text-gold ring-1 ring-gold/40">
          {t.copied(browser)}
        </p>
      )}
      {copied === false && (
        <p className="select-all break-all rounded-2xl bg-black/30 px-4 py-3 font-mono text-sm ring-1 ring-white/15">
          {window.location.href}
        </p>
      )}
      <p className="text-sm text-ivory-dim/70">{t.inAppManual(browser)}</p>
    </section>
  );
}

function Steps({ steps }: { steps: { text: string; icon?: React.ReactNode }[] }) {
  return (
    <ol className="flex w-full flex-col gap-3 text-left">
      {steps.map((step, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.12 }}
          className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold font-extrabold text-ink">
            {i + 1}
          </span>
          <span className="grow">{step.text}</span>
          {step.icon}
        </motion.li>
      ))}
    </ol>
  );
}

/* Flèche qui rebondit vers le bouton à toucher dans la barre du navigateur. */
function Pointer({ at }: { at: "bottom-right" | "bottom-center" | "top-right" }) {
  const t = useT(T);
  const up = at === "top-right";
  const place = {
    "bottom-right": "right-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]",
    "bottom-center": "left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]",
    "top-right": "right-3 top-[calc(env(safe-area-inset-top)+0.5rem)]",
  }[at];
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed z-50 flex items-center gap-1 ${up ? "flex-col-reverse" : "flex-col"} ${place}`}
    >
      <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-extrabold text-ink shadow-card">
        {t.here}
      </span>
      <motion.svg
        viewBox="0 0 24 24"
        className="size-10 fill-none stroke-gold stroke-[3] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        animate={{ y: up ? [0, -8, 0] : [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
        style={{ rotate: up ? 180 : 0 }}
      >
        <path d="M12 3v16M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
    </div>
  );
}

/* Le bouton ⋯ de Safari (iOS 26) : trois points dans un rond. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0">
      <circle cx="12" cy="12" r="11" className="fill-white/10 stroke-gold" strokeWidth="1.5" />
      <circle cx="7" cy="12" r="1.6" className="fill-gold" />
      <circle cx="12" cy="12" r="1.6" className="fill-gold" />
      <circle cx="17" cy="12" r="1.6" className="fill-gold" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 fill-none stroke-gold stroke-2">
      <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" strokeLinecap="round" />
    </svg>
  );
}

/* Le carré « + » de « Sur l'écran d'accueil ». */
function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 fill-none stroke-gold stroke-2">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-none stroke-current stroke-[2.5]">
      <path d="M14 4h6v6M20 4l-9 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" strokeLinecap="round" />
    </svg>
  );
}
