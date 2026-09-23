"use client";

import { useEffect, useState } from "react";
import Brand from "@/components/Brand";
import { APP_NAME } from "@/lib/games";
import { dict, useT } from "@/lib/i18n";

const T = dict({
  fr: {
    intro:
      "On joue dans l’application, pas dans le navigateur. Installe-la sur ton écran d’accueil, c’est fait en dix secondes.",
    installed: (app: string) => `C’est installé ! Ouvre ${app} depuis ton écran d’accueil.`,
    iosMenu: "Touche le menu",
    iosShare: "Puis Partager",
    iosAdd: "Choisis « Sur l’écran d’accueil »",
    iosLaunch: "Lance l’app depuis la nouvelle icône",
    install: "Installer l’application",
    otherBrowser:
      "Dans le menu du navigateur (⋮), choisis « Ajouter à l’écran d’accueil », puis lance l’app depuis la nouvelle icône.",
  },
  en: {
    intro:
      "We play in the app, not in the browser. Add it to your home screen, it takes ten seconds.",
    installed: (app: string) => `Installed! Open ${app} from your home screen.`,
    iosMenu: "Tap the menu",
    iosShare: "Then Share",
    iosAdd: "Pick “Add to Home Screen”",
    iosLaunch: "Open the app from the new icon",
    install: "Install the app",
    otherBrowser:
      "In the browser menu (⋮), pick “Add to Home screen”, then open the app from the new icon.",
  },
});

/* Sur téléphone, on joue dans l'app installée (PWA), pas dans le navigateur.
   Ce composant bloque le navigateur mobile et guide l'installation.
   Sur ordinateur, le navigateur reste libre. */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type GateState = "checking" | "open" | "install";

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [ios, setIos] = useState(false);
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
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const gated = mobile && !standalone && process.env.NODE_ENV === "production";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
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
  if (state === "checking") return null;

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 overflow-y-auto px-6 text-center">
      <div>
        <h1>
          <Brand size="lg" />
        </h1>
        <p className="mt-4 text-ivory-dim/90">{t.intro}</p>
      </div>

      {installed ? (
        <p className="rounded-2xl bg-gold/15 px-4 py-3 font-bold text-gold ring-1 ring-gold/40">
          {t.installed(APP_NAME)}
        </p>
      ) : ios ? (
        <ol className="flex flex-col gap-3 text-left">
          <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <span className="text-2xl">1️⃣</span> {t.iosMenu}
            <MoreIcon />
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <span className="text-2xl">2️⃣</span> {t.iosShare}
            <ShareIcon />
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <span className="text-2xl">3️⃣</span> {t.iosAdd}
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
            <span className="text-2xl">4️⃣</span> {t.iosLaunch}
          </li>
        </ol>
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

/* Les trois points verticaux du menu de Safari iOS. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 fill-gold">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
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
