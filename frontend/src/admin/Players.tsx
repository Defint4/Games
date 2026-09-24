"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { PLAYERS_PAGE, fetchPlayers, type PlayerRow, type PlayerSort } from "./api";
import { ApiError } from "@/lib/api";
import { SESSION_KEY, retry, useToken } from "./hooks";
import PlayerSheet from "./PlayerSheet";
import { Badge, Icon, OnlineDot, Panel, Spinner, agoShort, errorText, plural, useNow } from "./ui";

const SORTS: { id: PlayerSort; label: string }[] = [
  { id: "recent", label: "Inscription" },
  { id: "seen", label: "Visite" },
  { id: "played", label: "Parties" },
  { id: "name", label: "A → Z" },
];

export default function Players() {
  const token = useToken();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlayerSort>("recent");
  const [open, setOpen] = useState<string | null>(null);

  // La recherche part quand on s'arrête de taper, pas à chaque lettre.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const players = useInfiniteQuery({
    queryKey: ["admin", "players", query, sort],
    queryFn: ({ pageParam }) => fetchPlayers(token, query, sort, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * PLAYERS_PAGE;
      return loaded < last.total ? loaded : undefined;
    },
    // Les points « en ligne » bougent : la liste se remet à jour en silence.
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
    retry,
  });
  const queryClient = useQueryClient();
  const denied = players.error instanceof ApiError && players.error.status === 401;
  useEffect(() => {
    if (denied) void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  }, [denied, queryClient]);
  const rows = players.data?.pages.flatMap((p) => p.entries) ?? [];
  const total = players.data?.pages[0]?.total;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-felt-800/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <label className="relative block">
          <span className="sr-only">Chercher un joueur</span>
          <Icon.search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ivory-dim/50" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={20}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Chercher un pseudo"
            className="w-full rounded-2xl bg-felt-900/90 py-3 pl-12 pr-4 font-bold [&::-webkit-search-cancel-button]:hidden text-ivory ring-1 ring-white/15 placeholder:font-normal placeholder:text-ivory-dim/45 focus:outline-2 focus:outline-gold"
          />
        </label>
        <div
          role="radiogroup"
          aria-label="Trier par"
          className="grid grid-cols-4 rounded-xl bg-felt-900/90 p-1 ring-1 ring-white/10"
        >
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sort === s.id}
              onClick={() => setSort(s.id)}
              className={`relative rounded-lg py-1.5 text-sm font-bold transition-colors ${
                sort === s.id ? "text-ink" : "text-ivory-dim/70"
              }`}
            >
              {sort === s.id && (
                <motion.span
                  layoutId="admin-sort"
                  className="absolute inset-0 rounded-lg bg-ivory"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="-mt-2 flex items-center gap-2 px-1 text-sm text-ivory-dim/70">
        {total === undefined ? " " : query ? plural(total, "résultat") : plural(total, "inscrit")}
        {players.isFetching && !players.isFetchingNextPage && (
          <Spinner className="!mx-0 size-3.5" />
        )}
      </p>

      {players.isPending ? (
        <Spinner className="mt-10 size-7 text-ivory-dim/60" />
      ) : players.isError && rows.length === 0 ? (
        <p className="mt-10 text-center text-ivory-dim/80">{errorText(players.error)}</p>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-ivory-dim/70">Aucun pseudo ne contient « {query} ».</p>
      ) : (
        <Panel className="divide-y divide-white/10">
          {rows.map((row) => (
            <PlayerLine key={row.id} row={row} sort={sort} onOpen={() => setOpen(row.id)} />
          ))}
        </Panel>
      )}

      {players.hasNextPage && (
        <button
          type="button"
          onClick={() => void players.fetchNextPage()}
          disabled={players.isFetchingNextPage}
          className="flex h-12 items-center justify-center rounded-2xl font-bold text-gold ring-1 ring-gold/35 active:translate-y-0.5"
        >
          {players.isFetchingNextPage ? (
            <Spinner />
          ) : (
            `Afficher les ${Math.min(PLAYERS_PAGE, (total ?? 0) - rows.length)} suivants`
          )}
        </button>
      )}

      {open && <PlayerSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PlayerLine({
  row,
  sort,
  onOpen,
}: {
  row: PlayerRow;
  sort: PlayerSort;
  onOpen: () => void;
}) {
  const now = useNow();
  const joined = agoShort(row.created_at, now);
  const seen = row.last_seen_at ? `vu ${agoShort(row.last_seen_at, now)}` : "aucune visite notée";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/5"
    >
      <span className="relative shrink-0">
        <Avatar id={row.avatar} size="md" dimmed={row.suspended} />
        {row.online && <OnlineDot />}
      </span>
      <span className="min-w-0 grow">
        <span className="flex items-center gap-1.5">
          <span
            className={`truncate font-bold ${row.suspended ? "text-ivory-dim/60 line-through" : ""}`}
          >
            {row.pseudo}
          </span>
          {row.suspended && <Badge tone="red">suspendu</Badge>}
          {row.locked && <Badge tone="red">bloqué</Badge>}
          {row.default_pin && !row.suspended && <Badge tone="dim">0000</Badge>}
        </span>
        <span className="block truncate text-sm text-ivory-dim/60">
          {sort === "seen" ? `${seen}, inscrit ${joined}` : `inscrit ${joined}, ${seen}`}
        </span>
      </span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block text-lg font-extrabold tabular-nums">{row.played}</span>
        <span className="text-[0.7rem] text-ivory-dim/55">
          {row.played > 1 ? "parties" : "partie"}
        </span>
      </span>
    </button>
  );
}
