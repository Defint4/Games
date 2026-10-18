"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { GAMES } from "@/lib/games";
import { fetchIncidents, type AppEvent, type IncidentsFilter, type Level } from "./api";
import { retry, useAdminQuery, useToken } from "./hooks";
import {
  Badge,
  GameSwatch,
  Icon,
  Panel,
  Spinner,
  agoShort,
  errorText,
  formatDateTime,
  gameName,
  plural,
  useNow,
} from "./ui";

/* Le journal de l'app, du plus récent au plus ancien : ce qui s'est mal passé (erreurs,
   avertissements) et, sur demande, tout ce qui s'est passé. Une ligne par événement,
   le détail au tap. C'est ici qu'on vient quand un joueur dit « ça a planté ». */

const LEVELS: { id: Level; label: string }[] = [
  { id: "error", label: "Erreurs" },
  { id: "warning", label: "Alertes" },
  { id: "info", label: "Tout" },
];

const LEVEL_LABEL: Record<Level, string> = {
  error: "erreur",
  warning: "alerte",
  info: "info",
};

const DOT: Record<Level, string> = {
  error: "bg-card-red",
  warning: "bg-gold",
  info: "bg-ivory-dim/35",
};

export default function Incidents() {
  const token = useToken();
  const [level, setLevel] = useState<Level>("warning");
  const [game, setGame] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // La recherche part quand on s'arrête de taper, pas à chaque lettre.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const filter: IncidentsFilter = { level, game, q: query };
  const incidents = useInfiniteQuery({
    queryKey: ["admin", "incidents", filter],
    queryFn: ({ pageParam }) => fetchIncidents(token, filter, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next ?? undefined,
    // Ce qui vient d'arriver monte tout seul tant que l'onglet est à l'écran.
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
    retry,
  });
  const rows = incidents.data?.pages.flatMap((p) => p.entries) ?? [];
  const counts = incidents.data?.pages[0]?.counts;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-felt-800/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div
          role="radiogroup"
          aria-label="Niveau"
          className="grid grid-cols-3 rounded-xl bg-felt-900/90 p-1 ring-1 ring-white/10"
        >
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={level === l.id}
              onClick={() => setLevel(l.id)}
              className={`relative rounded-lg py-1.5 text-sm font-bold transition-colors ${
                level === l.id ? "text-ink" : "text-ivory-dim/70"
              }`}
            >
              {level === l.id && (
                <motion.span
                  layoutId="admin-level"
                  className="absolute inset-0 rounded-lg bg-ivory"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{l.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative block grow">
            <span className="sr-only">Chercher dans le journal</span>
            <Icon.search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ivory-dim/50" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={40}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Pseudo, table, message"
              className="w-full rounded-2xl bg-felt-900/90 py-3 pl-12 pr-4 font-bold text-ivory ring-1 ring-white/15 placeholder:font-normal placeholder:text-ivory-dim/45 focus:outline-2 focus:outline-gold [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <GamePicker value={game} onChange={setGame} />
        </div>
      </div>

      <Counts counts={counts} fetching={incidents.isFetching && !incidents.isFetchingNextPage} />

      {incidents.isPending ? (
        <Spinner className="mt-10 size-7 text-ivory-dim/60" />
      ) : incidents.isError && rows.length === 0 ? (
        <p className="mt-10 text-center text-ivory-dim/80">{errorText(incidents.error)}</p>
      ) : rows.length === 0 ? (
        <Quiet level={level} filtered={!!(game || query)} />
      ) : (
        <IncidentList rows={rows} />
      )}

      {incidents.hasNextPage && (
        <button
          type="button"
          onClick={() => void incidents.fetchNextPage()}
          disabled={incidents.isFetchingNextPage}
          className="flex h-12 items-center justify-center rounded-2xl font-bold text-gold ring-1 ring-gold/35 active:translate-y-0.5"
        >
          {incidents.isFetchingNextPage ? <Spinner /> : "Plus ancien"}
        </button>
      )}
    </div>
  );
}

/* Les dernières 24 h en une phrase : ce que le serveur a vu passer, tous filtres
   confondus, pour savoir d'un coup d'œil si la nuit a été calme. */
function Counts({
  counts,
  fetching,
}: {
  counts: Record<Level, number> | undefined;
  fetching: boolean;
}) {
  if (!counts) return <p className="-mt-2 px-1 text-sm text-ivory-dim/70"> </p>;
  const parts = [
    counts.error ? plural(counts.error, "erreur") : null,
    counts.warning ? plural(counts.warning, "alerte") : null,
    counts.info ? plural(counts.info, "info") : null,
  ].filter(Boolean);
  return (
    <p className="-mt-2 flex items-center gap-2 px-1 text-sm text-ivory-dim/70">
      <span>
        <span className="font-bold text-ivory-dim">Dernières 24 h :</span>{" "}
        {parts.length ? parts.join(", ") : "rien du tout"}.
      </span>
      {fetching && <Spinner className="!mx-0 size-3.5" />}
    </p>
  );
}

function Quiet({ level, filtered }: { level: Level; filtered: boolean }) {
  const what = level === "error" ? "Aucune erreur" : level === "warning" ? "Rien à signaler" : "Rien";
  return (
    <div className="mt-12 flex flex-col items-center gap-3 text-center text-ivory-dim/70">
      <span className="flex size-12 items-center justify-center rounded-full bg-[#5fd49a]/15 text-[#8be8b8] ring-1 ring-[#5fd49a]/35">
        <Icon.check className="size-6" />
      </span>
      <p className="font-bold text-ivory-dim">
        {what}
        {filtered ? " avec ces filtres" : " ces 30 derniers jours"}.
      </p>
    </div>
  );
}

/* Le filtre par jeu : un menu natif, compact, qui tient à côté de la recherche. */
function GamePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (game: string | null) => void;
}) {
  return (
    <label className="relative block shrink-0">
      <span className="sr-only">Jeu</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`h-full appearance-none rounded-2xl bg-felt-900/90 py-3 pl-4 pr-9 text-sm font-bold ring-1 focus:outline-2 focus:outline-gold ${
          value ? "text-gold ring-gold/40" : "text-ivory-dim/80 ring-white/15"
        }`}
      >
        <option value="">Tous les jeux</option>
        {GAMES.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.name.fr}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 fill-none stroke-current stroke-2 text-ivory-dim/60"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

/* ---------------------------------------------------------------------------
   La liste, partagée avec la fiche d'un joueur : une ligne par événement, dépliable.
   --------------------------------------------------------------------------- */

export function IncidentList({ rows, compact = false }: { rows: AppEvent[]; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const now = useNow();
  return (
    <Panel className="divide-y divide-white/10">
      {rows.map((e) => (
        <IncidentRow
          key={e.id}
          event={e}
          now={now}
          compact={compact}
          open={open === e.id}
          onToggle={() => setOpen(open === e.id ? null : e.id)}
        />
      ))}
    </Panel>
  );
}

function IncidentRow({
  event: e,
  now,
  compact,
  open,
  onToggle,
}: {
  event: AppEvent;
  now: number;
  compact: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const where = [
    e.game ? gameName(e.game) : null,
    e.room ? `table ${e.room}` : null,
    !compact && e.pseudo ? e.pseudo : null,
  ].filter(Boolean);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-white/5"
      >
        {e.game && !compact ? (
          <span className="relative mt-0.5 shrink-0">
            <GameSwatch slug={e.game} className="size-8" />
            <span
              aria-hidden
              className={`absolute -right-1 -top-1 size-3 rounded-full ring-2 ring-felt-900 ${DOT[e.level]}`}
            />
          </span>
        ) : (
          <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${DOT[e.level]}`} />
        )}
        <span className="min-w-0 grow">
          <span
            className={`block font-bold leading-snug ${open ? "" : "line-clamp-2"} ${
              e.level === "error" ? "text-[#ff9a88]" : ""
            }`}
          >
            {e.message}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ivory-dim/60">
            <span className="font-mono text-ivory-dim/50">{e.kind}</span>
            {where.length > 0 && <span>· {where.join(", ")}</span>}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs leading-snug text-ivory-dim/60">
          {agoShort(e.at, now)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <Details event={e} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Tout ce qu'on sait de l'événement : quand, qui, d'où, quel navigateur, et le détail
   brut (trace, corps du message) tel que le serveur l'a gardé. */
function Details({ event: e }: { event: AppEvent }) {
  const detail = e.detail ? { ...e.detail } : null;
  const trace =
    detail && typeof detail.traceback === "string"
      ? detail.traceback
      : detail && typeof detail.stack === "string"
        ? detail.stack
        : null;
  if (detail) {
    delete detail.traceback;
    delete detail.stack;
  }
  const facts = [
    ["Quand", formatDateTime(e.at)],
    ["Niveau", LEVEL_LABEL[e.level]],
    ["Joueur", e.pseudo],
    ["Chemin", e.path],
    ["Adresse", e.ip],
    ["Navigateur", e.user_agent],
  ].filter((f): f is [string, string] => !!f[1]);
  const rest = detail && Object.keys(detail).length ? detail : null;
  return (
    <div className="mx-4 mb-3 flex flex-col gap-2 rounded-xl bg-black/30 p-3 text-xs ring-1 ring-white/10">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ivory-dim/55">{label}</dt>
            <dd className="min-w-0 break-words text-ivory-dim/90">{value}</dd>
          </div>
        ))}
      </dl>
      {rest && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[0.7rem] leading-snug text-ivory-dim/80">
          {JSON.stringify(rest, null, 2)}
        </pre>
      )}
      {trace && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 font-mono text-[0.68rem] leading-snug text-[#ff9a88]/90">
          {trace}
        </pre>
      )}
      <p className="flex items-center gap-2">
        <Badge tone={e.level === "error" ? "red" : e.level === "warning" ? "gold" : "dim"}>
          {LEVEL_LABEL[e.level]}
        </Badge>
        <span className="text-ivory-dim/45">#{e.id}</span>
      </p>
    </div>
  );
}

/* Les incidents des dernières 24 h, pour l'aperçu : un compte et un raccourci. */
export function useIncidentCounts() {
  const token = useToken();
  return useAdminQuery({
    queryKey: ["admin", "incidents", "counts"],
    queryFn: () =>
      fetchIncidents(token, { level: "error", game: null, q: "" }, null).then((r) => r.counts),
    refetchInterval: 30_000,
  });
}
