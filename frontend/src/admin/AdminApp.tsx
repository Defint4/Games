"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/Loading";
import { ApiError } from "@/lib/api";
import { HUB_PATH } from "@/lib/games";
import { currentProfile, type StoredProfile } from "@/lib/identity";
import { checkSession, closeSession } from "./api";
import Gate from "./Gate";
import { SESSION_KEY, TokenContext, retry, useOverview, type Tab } from "./hooks";
import Maintenance from "./Maintenance";
import Overview from "./Overview";
import Players from "./Players";
import Tables from "./Tables";
import { Icon, Spinner, errorText } from "./ui";

const TABS: { id: Tab; label: string; icon: keyof typeof Icon }[] = [
  { id: "overview", label: "Aperçu", icon: "overview" },
  { id: "tables", label: "Tables", icon: "tables" },
  { id: "players", label: "Joueurs", icon: "players" },
  { id: "maintenance", label: "Maintenance", icon: "maintenance" },
];

export default function AdminApp() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
  }, [router]);

  const session = useQuery({
    queryKey: [...SESSION_KEY, profile?.pseudo],
    queryFn: () => checkSession(profile!.token).then(() => true),
    enabled: profile !== null,
    retry,
    staleTime: Infinity,
  });
  const status = session.error instanceof ApiError ? session.error.status : null;

  // Pas le compte admin (ou session joueur expirée) : le panneau n'existe pas.
  useEffect(() => {
    if (status === 404) router.replace(HUB_PATH);
  }, [status, router]);

  if (!profile || session.isPending || status === 404) return <LoadingScreen />;
  if (status === 401) {
    return (
      <Gate
        token={profile.token}
        onOpen={() => void queryClient.invalidateQueries({ queryKey: SESSION_KEY })}
      />
    );
  }
  if (session.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ivory-dim/85">{errorText(session.error)}</p>
        <button
          type="button"
          onClick={() => void session.refetch()}
          className="rounded-2xl bg-gold px-6 py-3 font-extrabold text-ink active:translate-y-0.5"
        >
          {session.isFetching ? <Spinner /> : "Réessayer"}
        </button>
      </div>
    );
  }

  return (
    <TokenContext.Provider value={profile.token}>
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        <Header
          onLock={async () => {
            await closeSession(profile.token).catch(() => undefined);
            queryClient.removeQueries({ queryKey: ["admin"] });
            router.replace(HUB_PATH);
          }}
        />
        <main className="min-h-0 grow overflow-y-auto overscroll-contain px-4 pb-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {tab === "overview" && <Overview onOpen={setTab} />}
              {tab === "tables" && <Tables />}
              {tab === "players" && <Players />}
              {tab === "maintenance" && <Maintenance />}
            </motion.div>
          </AnimatePresence>
        </main>
        <TabBar tab={tab} onChange={setTab} />
      </div>
    </TokenContext.Provider>
  );
}

function Header({ onLock }: { onLock: () => Promise<void> }) {
  const router = useRouter();
  const [locking, setLocking] = useState(false);
  return (
    <header className="grid shrink-0 grid-cols-[2.75rem_1fr_2.75rem] items-center px-4 pb-2 pt-4">
      <button
        type="button"
        onClick={() => router.push(HUB_PATH)}
        aria-label="Retour aux jeux"
        className="flex size-11 items-center justify-center rounded-full bg-black/25 text-ivory-dim ring-1 ring-white/10 active:scale-90"
      >
        <Icon.back />
      </button>
      <h1 className="-rotate-2 text-center font-script text-[2.6rem] leading-none text-gold drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">
        Le bureau
      </h1>
      <button
        type="button"
        disabled={locking}
        onClick={() => {
          setLocking(true);
          void onLock();
        }}
        aria-label="Fermer le bureau à clé"
        title="Fermer le bureau à clé : le mot de passe sera redemandé"
        className="flex size-11 items-center justify-center rounded-full bg-black/25 text-ivory-dim ring-1 ring-white/10 active:scale-90"
      >
        {locking ? <Spinner /> : <Icon.lock />}
      </button>
    </header>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const overview = useOverview();
  const maintenance = overview.data?.maintenance ?? false;
  return (
    <nav className="shrink-0 border-t border-white/10 bg-felt-900/80 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur">
      <ul className="grid grid-cols-4">
        {TABS.map(({ id, label, icon }) => {
          const Glyph = Icon[icon];
          const active = id === tab;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? "page" : undefined}
                className={`relative flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.7rem] font-bold transition-colors ${
                  active ? "text-gold" : "text-ivory-dim/60"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="admin-tab"
                    className="absolute inset-x-3 inset-y-0 rounded-xl bg-gold/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">
                  <Glyph className="size-6" />
                  {id === "maintenance" && maintenance && (
                    <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-gold ring-2 ring-felt-900" />
                  )}
                </span>
                <span className="relative">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
