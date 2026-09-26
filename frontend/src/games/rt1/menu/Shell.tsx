"use client";

/* Le cadre des écrans de RT1 hors course : un bandeau en haut (retour au hub, argent,
   niveau), les onglets en bas. Style propre au jeu : bleu nuit du lagon, typo de la
   signalétique routière, rouge des cartouches. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { HUB_PATH } from "@/lib/games";
import { useT } from "@/lib/i18n";
import { currentProfile } from "@/lib/identity";
import { preloadAssets } from "../assets";
import { T } from "../i18n";
import { bungee } from "../meta";
import { BackIcon, CoinIcon, FlagIcon, GlobeIcon, HelmetIcon, RouteIcon, WrenchIcon } from "./icons";

const TABS = [
  { href: "/rt1", key: "race", Icon: FlagIcon },
  { href: "/rt1/carriere", key: "career", Icon: RouteIcon },
  { href: "/rt1/garage", key: "garage", Icon: WrenchIcon },
  { href: "/rt1/en-ligne", key: "online", Icon: GlobeIcon },
  { href: "/rt1/profil", key: "profile", Icon: HelmetIcon },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT(T).menu;

  useEffect(() => {
    if (!currentProfile()) router.replace("/");
  }, [router]);

  useEffect(() => {
    // Le circuit se charge dès les menus : la course démarre sans attente.
    void preloadAssets().catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[radial-gradient(130%_70%_at_50%_0%,#0f4a59_0%,#0a2e39_45%,#061920_100%)] text-white">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href={HUB_PATH} aria-label={t.hub} className="-ml-1 rounded-full p-1.5 text-white/70 active:scale-95">
          <BackIcon className="size-6" />
        </Link>
        <span
          className={`${bungee.className} rounded-[8px] border-2 border-white bg-[#C8232C] px-2 pb-0.5 pt-1 text-lg leading-none`}
        >
          RT1
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Chip>
            <CoinIcon className="size-4 text-[#F4B942]" />
            <span className="tabular-nums">0 F</span>
          </Chip>
          <Chip>
            <span className="text-[#8CE6D2]">{t.level}</span>
            <span className="tabular-nums">1</span>
          </Chip>
        </div>
      </header>

      <main key={pathname} className="min-h-0 grow overflow-y-auto px-4 pb-6 pt-2 [animation:rt1-in_0.22s_ease-out]">
        {children}
      </main>

      <nav className="shrink-0 border-t border-white/10 bg-[#061a21]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur">
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, key, Icon }) => {
            const active = href === "/rt1" ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    active ? "text-[#2EC4C6]" : "text-white/55"
                  }`}
                >
                  <span className={`rounded-full px-3.5 py-1 transition-colors ${active ? "bg-[#2EC4C6]/15" : ""}`}>
                    <Icon className="size-6" />
                  </span>
                  {t.tabs[key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <style>{`
        @keyframes rt1-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { [class*="rt1-in"] { animation: none !important } }
      `}</style>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${bungee.className} flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-xs ring-1 ring-white/10`}>
      {children}
    </span>
  );
}

/* Titre de section des écrans RT1. */
export function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4 mt-2">
      <h1 className={`${bungee.className} text-2xl leading-tight`}>{children}</h1>
      {sub && <p className="mt-1 text-sm text-white/65">{sub}</p>}
    </div>
  );
}

export const card = "rounded-2xl bg-[#0c2b36]/85 ring-1 ring-white/10";
