"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { EVENTS_PAGE, fetchEvents, setMaintenance, type AdminEvent } from "./api";
import { retry, useOverview, useToken } from "./hooks";
import {
  GameSwatch,
  Icon,
  Panel,
  SectionTitle,
  Spinner,
  ago,
  errorText,
  formatDateTime,
  gameName,
  plural,
  span,
  useNow,
} from "./ui";

/* Avant un déploiement : fermer l'arrivée de nouvelles parties, regarder les parties en
   cours se terminer ; à la dernière, l'app se ferme d'elle-même aux joueurs (écran de
   maintenance) et le serveur peut redémarrer. Un redémarrage vide la mémoire du serveur,
   donc toutes les tables, et rouvre l'app. */
export default function Maintenance() {
  return (
    <div className="flex flex-col gap-8 pt-3">
      <Switch />
      <Journal />
    </div>
  );
}

function Switch() {
  const token = useToken();
  const queryClient = useQueryClient();
  const overview = useOverview();
  const now = useNow();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setMaintenance(token, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "events"] });
    },
  });

  if (!overview.data) {
    return overview.isPending ? (
      <Spinner className="mt-16 size-7 text-ivory-dim/60" />
    ) : (
      <p className="mt-16 text-center text-ivory-dim/80">{errorText(overview.error)}</p>
    );
  }

  // Tant que la requête part, l'interrupteur montre déjà le nouvel état.
  const on = toggle.isPending ? toggle.variables : overview.data.maintenance;
  const playing = overview.data.rooms.filter((r) => r.status === "playing");
  const locked = overview.data.maintenance_phase === "locked";
  const waiting = overview.data.rooms.filter((r) => r.status === "lobby").length;

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!on)}
        className={`flex items-center gap-4 rounded-3xl p-5 text-left ring-1 transition-colors ${
          on ? "bg-gold/12 ring-gold/50" : "bg-black/25 ring-white/10"
        }`}
      >
        <span className="min-w-0 grow">
          <span className="block text-xl font-extrabold leading-tight">
            {on ? "Maintenance lancée" : "App ouverte"}
          </span>
          <span className="mt-1 block text-sm leading-snug text-ivory-dim/75">
            {on
              ? "Plus personne ne peut lancer de partie. Dès la dernière partie en cours terminée, l’app se ferme aux joueurs. Rouvre-la ici, ou le redémarrage du déploiement le fera."
              : "Avant un déploiement : plus de nouvelle partie, puis l’app se ferme aux joueurs quand celles en cours sont finies."}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-gold" : "bg-white/15"}`}
        >
          <motion.span
            className="absolute top-1 size-6 rounded-full bg-ivory shadow-card"
            animate={{ left: on ? 28 : 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          />
        </span>
      </button>
      {toggle.error && <p className="px-1 text-sm text-[#ff9a88]">{errorText(toggle.error)}</p>}

      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="-m-1 overflow-hidden p-1"
          >
            {playing.length === 0 && !locked ? (
              <div className="flex items-center gap-4 rounded-3xl bg-black/25 p-5 ring-1 ring-white/10">
                <Spinner className="size-7 shrink-0 text-ivory-dim/70" />
                <span className="text-sm text-ivory-dim/80">
                  Dernière partie terminée : l’app se ferme aux joueurs dans quelques secondes.
                </span>
              </div>
            ) : playing.length === 0 ? (
              <div className="flex items-center gap-4 rounded-3xl bg-[#5fd49a]/10 p-5 ring-1 ring-[#5fd49a]/35">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#5fd49a] text-ink">
                  <Icon.check className="size-7" />
                </span>
                <span>
                  <span className="block text-lg font-extrabold leading-tight">
                    Tu peux déployer
                  </span>
                  <span className="block text-sm text-ivory-dim/75">
                    Plus aucune partie en cours, les joueurs voient l’écran de maintenance.
                    {waiting > 0 &&
                      ` ${plural(waiting, "table en attente sera fermée", "tables en attente seront fermées")} par le redémarrage.`}
                  </span>
                </span>
              </div>
            ) : (
              <div className="rounded-3xl bg-black/25 p-5 ring-1 ring-white/10">
                <p className="text-lg font-extrabold leading-tight">
                  {plural(playing.length, "partie encore en cours", "parties encore en cours")}
                </p>
                <p className="mt-1 text-sm text-ivory-dim/70">
                  Attends qu’elles se terminent : l’app se fermera aux joueurs à la dernière. Cet
                  écran se met à jour tout seul.
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {playing.map((r) => (
                    <li key={r.code} className="flex items-center gap-3">
                      <GameSwatch slug={r.game} className="size-7" />
                      <span className="grow font-bold">
                        {gameName(r.game)}{" "}
                        <span className="font-normal text-ivory-dim/60">table {r.code}</span>
                      </span>
                      <span className="text-sm tabular-nums text-ivory-dim/70">
                        {span((now - Date.parse(r.created_at)) / 1000)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Journal : chaque connexion au bureau et chaque geste, du plus récent au plus ancien.
   --------------------------------------------------------------------------- */

function describe(e: AdminEvent): { text: string; alert?: boolean } {
  const who = e.target ?? "?";
  const detail = e.detail ?? {};
  switch (e.action) {
    case "login":
      return { text: "Bureau ouvert" };
    case "login_failed":
      return { text: "Mot de passe incorrect", alert: true };
    case "login_locked":
      return { text: "Essai refusé : bureau bloqué", alert: true };
    case "logout":
      return { text: "Bureau fermé à clé" };
    case "reset_pin":
      return { text: `Code de ${who} remis à 0000` };
    case "unlock":
      return { text: `${who} débloqué` };
    case "sign_out":
      return { text: `${who} déconnecté de ses appareils` };
    case "suspend":
      return { text: `${who} suspendu` };
    case "unsuspend":
      return { text: `${who} réactivé` };
    case "rename":
      return { text: `${who} renommé en ${String(detail.pseudo ?? "?")}` };
    case "delete":
      return { text: `Compte ${who} supprimé` };
    case "close_room":
      return { text: `Table ${who} fermée (${gameName(String(detail.game ?? ""))})` };
    case "maintenance_on":
      return { text: "Maintenance lancée" };
    case "maintenance_off":
      return { text: "App rouverte" };
    default:
      return { text: e.action };
  }
}

function Journal() {
  const token = useToken();
  const now = useNow();
  const events = useInfiniteQuery({
    queryKey: ["admin", "events"],
    queryFn: ({ pageParam }) => fetchEvents(token, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * EVENTS_PAGE;
      return loaded < last.total ? loaded : undefined;
    },
    retry,
  });
  const rows = events.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <section>
      <SectionTitle aside={events.data ? plural(events.data.pages[0].total, "entrée") : null}>
        Journal du bureau
      </SectionTitle>
      {events.isPending ? (
        <Spinner className="mt-6 size-6 text-ivory-dim/60" />
      ) : events.isError ? (
        <p className="px-1 text-sm text-ivory-dim/75">{errorText(events.error)}</p>
      ) : (
        <Panel className="divide-y divide-white/10">
          {rows.map((e) => {
            const { text, alert } = describe(e);
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${alert ? "bg-card-red" : "bg-ivory-dim/35"}`}
                />
                <div className="min-w-0 grow">
                  <p className={`font-bold leading-snug ${alert ? "text-[#ff9a88]" : ""}`}>
                    {text}
                  </p>
                  <p className="text-xs text-ivory-dim/50">
                    {formatDateTime(e.at)}
                    {e.ip && <span className="tabular-nums">, depuis {e.ip}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ivory-dim/60">{ago(e.at, now)}</span>
              </div>
            );
          })}
        </Panel>
      )}
      {events.hasNextPage && (
        <button
          type="button"
          onClick={() => void events.fetchNextPage()}
          disabled={events.isFetchingNextPage}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl font-bold text-gold ring-1 ring-gold/35"
        >
          {events.isFetchingNextPage ? <Spinner /> : "Plus ancien"}
        </button>
      )}
    </section>
  );
}
