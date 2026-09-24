"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ApiError } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { BOT_LABELS } from "@/lib/types";
import { closeRoom, fetchRoom, type Room, type Seat } from "./api";
import { useAdminQuery, useOverview, useToken } from "./hooks";
import {
  ConfirmAction,
  Icon,
  MiniTable,
  Panel,
  SeatCoin,
  SectionTitle,
  Spinner,
  STATUS_LABEL,
  ago,
  errorText,
  gameName,
  plural,
  span,
  useNow,
} from "./ui";

const GROUPS: { status: Room["status"]; title: string }[] = [
  { status: "playing", title: "En jeu" },
  { status: "lobby", title: "En attente de joueurs" },
  { status: "finished", title: "Terminées" },
];

/* La salle : chaque table vue d'en haut, ses joueurs autour. Les tables arrivent et
   s'en vont en direct. */
export default function Tables() {
  const overview = useOverview();
  const [open, setOpen] = useState<string | null>(null);
  if (overview.isPending) return <Spinner className="mt-16 size-7 text-ivory-dim/60" />;
  if (!overview.data)
    return <p className="mt-16 text-center text-ivory-dim/80">{errorText(overview.error)}</p>;
  const rooms = overview.data.rooms;

  return (
    <div className="flex flex-col gap-7 pt-3">
      <div className="px-1">
        <h2 className="text-[2.1rem] font-extrabold leading-tight tracking-tight">
          {rooms.length
            ? plural(rooms.length, "table ouverte", "tables ouvertes")
            : "La salle est vide"}
        </h2>
        <p className="mt-1 text-ivory-dim/75">
          {rooms.length
            ? "Touche une table pour voir ses joueurs, son chat, ou la fermer."
            : "Les tables apparaîtront ici dès qu’un joueur en ouvre une."}
        </p>
      </div>

      {rooms.length === 0 && <EmptyFloor />}

      {GROUPS.map(({ status, title }) => {
        const group = rooms.filter((r) => r.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <SectionTitle aside={group.length}>{title}</SectionTitle>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <AnimatePresence initial={false}>
                {group.map((room) => (
                  <motion.li
                    key={room.code}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  >
                    <TableCard room={room} onOpen={() => setOpen(room.code)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}

      {open && <RoomSheet code={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TableCard({ room, onOpen }: { room: Room; onOpen: () => void }) {
  const now = useNow();
  const age = (now - Date.parse(room.created_at)) / 1000;
  const idle = (now - Date.parse(room.last_activity)) / 1000;
  const note =
    room.status === "playing"
      ? `depuis ${span(age)}`
      : room.status === "lobby"
        ? `ouverte il y a ${span(age)}`
        : `inactive depuis ${span(idle)}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col items-center rounded-3xl bg-black/20 px-2 pb-3 pt-2 ring-1 ring-white/10 transition-transform active:scale-[0.97]"
    >
      <MiniTable room={room} />
      <span className="mt-1 font-bold">{gameName(room.game)}</span>
      <span className="text-xs text-ivory-dim/60">{note}</span>
    </button>
  );
}

function EmptyFloor() {
  return (
    <div aria-hidden className="flex justify-center py-6">
      <span className="size-40 rounded-full border-2 border-dashed border-white/12 bg-black/10" />
    </div>
  );
}

function seatState(seat: Seat): string {
  if (seat.replaced) return seat.connected ? "de retour" : "absent, un bot joue à sa place";
  if (seat.bot) return `bot ${BOT_LABELS.fr[seat.bot as keyof typeof BOT_LABELS.fr] ?? seat.bot}`;
  return seat.connected ? "connecté" : "déconnecté";
}

function RoomSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const token = useToken();
  const queryClient = useQueryClient();
  const now = useNow();
  const room = useAdminQuery({
    queryKey: ["admin", "room", code],
    queryFn: () => fetchRoom(token, code),
    refetchInterval: 4000,
  });
  const close = useMutation({
    mutationFn: () => closeRoom(token, code),
    onSuccess: () => {
      sfx.thud();
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      onClose();
    },
  });
  const gone = room.error instanceof ApiError && room.error.status === 404;
  const data = room.data;

  return (
    <Sheet onClose={onClose}>
      {!data ? (
        <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-center text-ivory-dim/80">
          {room.isPending ? (
            <Spinner className="size-7" />
          ) : (
            <p>{gone ? "Cette table n’existe plus." : errorText(room.error)}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center pt-2 text-center">
            <MiniTable room={data} size="lg" />
            <h2 className="mt-2 text-2xl font-extrabold">{gameName(data.game)}</h2>
            <p className="text-sm text-ivory-dim/70">
              Table {data.code}, {STATUS_LABEL[data.status].toLowerCase()}
              {gone && " (fermée entre-temps)"}
            </p>
          </div>

          <Panel className="divide-y divide-white/10">
            {data.seats.map((seat, i) => (
              <div key={`${seat.pseudo}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <SeatCoin seat={seat} turn={data.turn === i} size="md" />
                <div className="min-w-0 grow">
                  <p className="truncate font-bold">{seat.pseudo}</p>
                  <p className="text-sm text-ivory-dim/65">
                    {seatState(seat)}
                    {data.turn === i && ", c’est son tour"}
                  </p>
                </div>
                {seat.rating !== null && (
                  <span className="shrink-0 text-sm font-bold tabular-nums text-ivory-dim/80">
                    {seat.rating}
                  </span>
                )}
              </div>
            ))}
          </Panel>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-1 text-sm">
            <Fact label="Ouverte">{ago(data.created_at, now)}</Fact>
            <Fact label="Dernier mouvement">{ago(data.last_activity, now)}</Fact>
            <Fact label="Temps par tour">
              {data.turn_seconds ? `${data.turn_seconds} s` : "sans limite"}
            </Fact>
            {data.options.time_control && <Fact label="Cadence">{data.options.time_control}</Fact>}
          </dl>

          <section>
            <SectionTitle aside={data.chat.length || null}>Chat de la table</SectionTitle>
            {data.chat.length === 0 ? (
              <p className="px-1 text-sm text-ivory-dim/60">Personne n’a encore écrit.</p>
            ) : (
              <Panel className="max-h-64 overflow-y-auto">
                <ul className="flex flex-col gap-2 p-4 text-sm">
                  {data.chat.map((m, i) => (
                    <li key={i} className="leading-snug">
                      <span className="font-bold text-gold/90">{m.pseudo ?? "?"}</span>{" "}
                      <span className="text-ivory-dim/90">{m.text}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </section>

          {!gone && (
            <Panel>
              <ConfirmAction
                label="Fermer la table"
                icon={<Icon.close />}
                danger
                question={
                  data.status === "playing"
                    ? "La partie s’arrête pour tout le monde, sans résultat enregistré. Les joueurs verront « Cette table n’existe plus »."
                    : "Les joueurs assis verront « Cette table n’existe plus »."
                }
                confirm="Fermer pour tous"
                pending={close.isPending}
                onConfirm={() => close.mutate()}
              />
              {close.error && (
                <p className="px-4 pb-3 text-sm text-[#ff9a88]">{errorText(close.error)}</p>
              )}
            </Panel>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ivory-dim/55">{label}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}
