"use client";

import { motion } from "motion/react";
import { GAMES } from "@/lib/games";
import type { Overview as OverviewData } from "./api";
import { useOverview, type Tab } from "./hooks";
import { GameSwatch, Icon, Panel, SectionTitle, Spinner, errorText, plural, span } from "./ui";

export default function Overview({ onOpen }: { onOpen: (tab: Tab) => void }) {
  const overview = useOverview();
  if (overview.isPending) return <Spinner className="mt-16 size-7 text-ivory-dim/60" />;
  if (!overview.data)
    return <p className="mt-16 text-center text-ivory-dim/80">{errorText(overview.error)}</p>;
  const data = overview.data;

  return (
    <div className="flex flex-col gap-7 pt-3">
      {data.maintenance && (
        <button
          type="button"
          onClick={() => onOpen("maintenance")}
          className="flex items-center gap-3 rounded-2xl bg-gold/12 px-4 py-3 text-left ring-1 ring-gold/45 active:translate-y-0.5"
        >
          <Icon.pause className="size-6 shrink-0 text-gold" />
          <span className="text-sm leading-snug">
            <span className="font-extrabold text-gold">Maintenance en cours.</span> Plus personne ne
            peut lancer de partie.
          </span>
        </button>
      )}

      <Live data={data} onOpen={onOpen} />
      <Ledger data={data} onOpen={onOpen} />
      <Games data={data} />
      <Server data={data} />
    </div>
  );
}

/* L'ouverture de l'écran : qui est là, maintenant. */
function Live({ data, onOpen }: { data: OverviewData; onOpen: (tab: Tab) => void }) {
  const playing = data.rooms.filter((r) => r.status === "playing").length;
  const waiting = data.rooms.filter((r) => r.status === "lobby").length;
  const parts = [
    playing ? plural(playing, "partie en cours", "parties en cours") : "aucune partie en cours",
    waiting ? plural(waiting, "table en attente", "tables en attente") : null,
  ].filter(Boolean);
  return (
    <section className="px-1">
      <p className="flex items-center gap-2 text-sm font-bold text-[#8be8b8]">
        <span className="relative flex size-2.5">
          <motion.span
            className="absolute inset-0 rounded-full bg-[#5fd49a]"
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
          />
          <span className="relative size-2.5 rounded-full bg-[#5fd49a]" />
        </span>
        En direct
      </p>
      <h2 className="mt-2 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight">
        {data.online === 0 ? "Personne à table" : `${plural(data.online, "joueur")} à table`}
      </h2>
      <p className="mt-2 text-ivory-dim/80">
        {parts.join(", ")}.
        {data.watchers > 0 &&
          ` ${plural(data.watchers, "écran")} ouvert${data.watchers > 1 ? "s" : ""} sur la liste des tables.`}
      </p>
      {data.rooms.length > 0 && (
        <button
          type="button"
          onClick={() => onOpen("tables")}
          className="mt-3 text-sm font-bold text-gold underline decoration-gold/40 underline-offset-4 active:opacity-70"
        >
          Voir la salle
        </button>
      )}
    </section>
  );
}

/* Le registre des inscrits : quatre chiffres, et les comptes qui demandent un geste. */
function Ledger({ data, onOpen }: { data: OverviewData; onOpen: (tab: Tab) => void }) {
  const p = data.players;
  const cells = [
    {
      value: p.total,
      label: "inscrits",
      note: p.new_week ? `+${p.new_week} en 7 jours` : "personne de nouveau cette semaine",
    },
    {
      value: p.active_week,
      label: "venus ces 7 jours",
      note: p.total ? `${Math.round((p.active_week / p.total) * 100)} % des inscrits` : "",
    },
    { value: p.new_day, label: "nouveaux aujourd’hui", note: "dernières 24 h" },
    { value: p.default_pin, label: "encore en 0000", note: "code jamais changé" },
  ];
  const alerts = [
    p.locked ? plural(p.locked, "compte bloqué", "comptes bloqués") + " après trop d’essais" : null,
    p.suspended ? plural(p.suspended, "compte suspendu", "comptes suspendus") : null,
  ].filter(Boolean);
  return (
    <section>
      <SectionTitle>Les inscrits</SectionTitle>
      <Panel>
        <div className="grid grid-cols-2">
          {cells.map((c, i) => (
            <div
              key={c.label}
              className={`px-4 py-4 ${i % 2 ? "border-l border-white/10" : ""} ${i > 1 ? "border-t border-white/10" : ""}`}
            >
              <p className="text-3xl font-extrabold tabular-nums leading-none">
                {c.value.toLocaleString("fr")}
              </p>
              <p className="mt-1.5 text-sm font-bold leading-tight">{c.label}</p>
              <p className="mt-0.5 text-xs leading-tight text-ivory-dim/60">{c.note}</p>
            </div>
          ))}
        </div>
        {alerts.length > 0 && (
          <button
            type="button"
            onClick={() => onOpen("players")}
            className="flex w-full items-center gap-2 border-t border-white/10 bg-card-red/10 px-4 py-3 text-left text-sm font-bold text-[#ff9a88] active:bg-card-red/15"
          >
            <span className="grow">{alerts.join(", ")}.</span>
            <span className="text-xs font-semibold underline underline-offset-4">Voir</span>
          </button>
        )}
      </Panel>
    </section>
  );
}

function Games({ data }: { data: OverviewData }) {
  const live = (slug: string) =>
    data.rooms.filter((r) => r.game === slug && r.status !== "finished").length;
  return (
    <section>
      <SectionTitle>Les jeux</SectionTitle>
      <Panel className="divide-y divide-white/10">
        {GAMES.map((game) => {
          const totals = data.games[game.slug];
          const now = live(game.slug);
          return (
            <div key={game.slug} className="flex items-center gap-3 px-4 py-3">
              <GameSwatch slug={game.slug} />
              <div className="min-w-0 grow">
                <p className="flex items-center gap-2 font-bold">
                  {game.name.fr}
                  {now > 0 && (
                    <span className="rounded-full bg-[#5fd49a]/15 px-2 py-0.5 text-[0.7rem] font-bold text-[#8be8b8] ring-1 ring-[#5fd49a]/35">
                      {now > 1 ? `${now} tables` : "1 table"}
                    </span>
                  )}
                </p>
                <p className="text-sm text-ivory-dim/65">
                  {totals
                    ? `${plural(totals.players, "joueur")} ${totals.players > 1 ? "l’ont" : "l’a"} essayé`
                    : "Pas encore joué"}
                </p>
              </div>
              <p className="text-right leading-tight">
                <span className="block text-xl font-extrabold tabular-nums">
                  {(totals?.played ?? 0).toLocaleString("fr")}
                </span>
                <span className="text-xs text-ivory-dim/60">
                  {game.slug === "solitaire" ? "parties" : "participations"}
                </span>
              </p>
            </div>
          );
        })}
      </Panel>
      <p className="mt-2 px-1 text-xs leading-snug text-ivory-dim/55">
        Aux jeux à plusieurs, une partie à quatre compte quatre participations.
      </p>
    </section>
  );
}

function Server({ data }: { data: OverviewData }) {
  const { version, uptime_s, memory_mb } = data.server;
  const [hash, date] = version?.split(" ") ?? [];
  const rows = [
    {
      label: "Version en ligne",
      value: hash ?? "inconnue",
      note: date
        ? `commit du ${new Date(date).toLocaleString("fr", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
        : null,
    },
    { label: "Démarré il y a", value: span(uptime_s), note: "chaque redémarrage vide les tables" },
    {
      label: "Mémoire de l’API",
      value: memory_mb === null ? "?" : `${Math.round(memory_mb)} Mo`,
      note: null,
    },
  ];
  return (
    <section>
      <SectionTitle>Le serveur</SectionTitle>
      <Panel className="divide-y divide-white/10">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <div>
              <p className="font-bold">{r.label}</p>
              {r.note && <p className="text-xs text-ivory-dim/55">{r.note}</p>}
            </div>
            <p className="shrink-0 font-extrabold tabular-nums">{r.value}</p>
          </div>
        ))}
      </Panel>
    </section>
  );
}
