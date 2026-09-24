"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import Avatar from "@/components/Avatar";
import { ApiError } from "@/lib/api";
import { gameBySlug } from "@/lib/games";
import { tr } from "@/lib/i18n";
import { COMMON } from "@/lib/texts";
import type { Room, Seat } from "./api";

/* ---------------------------------------------------------------------------
   Temps : une horloge commune qui avance toutes les 15 s, pour que « il y a 3 min »
   reste juste sans que chaque ligne ait son minuteur.
   --------------------------------------------------------------------------- */

let now = Date.now();
const clock = new Set<() => void>();
let ticking: ReturnType<typeof setInterval> | null = null;

export function useNow(): number {
  return useSyncExternalStore(
    (cb) => {
      clock.add(cb);
      if (!ticking) {
        ticking = setInterval(() => {
          now = Date.now();
          for (const listener of clock) listener();
        }, 15_000);
      }
      return () => {
        clock.delete(cb);
        if (clock.size === 0 && ticking) {
          clearInterval(ticking);
          ticking = null;
        }
      };
    },
    () => now,
    () => 0,
  );
}

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const dayMonth = new Intl.DateTimeFormat("fr", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("fr", { day: "numeric", month: "long", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("fr", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/* « à l'instant », « il y a 5 minutes », « hier », puis la date. */
export function ago(iso: string | null, at: number): string {
  if (!iso) return "jamais";
  const s = Math.max(0, (at - Date.parse(iso)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return relative.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return relative.format(-Math.floor(s / 3600), "hour");
  if (s < 7 * 86400) return relative.format(-Math.floor(s / 86400), "day");
  return `le ${dayMonth.format(new Date(iso))}`;
}

/* La même chose en court, pour les listes : « il y a 3 min », « il y a 2 h ». */
export function agoShort(iso: string, at: number): string {
  const s = Math.max(0, (at - Date.parse(iso)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 7 * 86400) return `il y a ${span(s)}`;
  return `le ${dayMonth.format(new Date(iso))}`;
}

/* Une durée écoulée, courte : « 4 min », « 2 h 10 », « 3 j ». */
export function span(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) {
    const m = Math.floor((s % 3600) / 60);
    return `${Math.floor(s / 3600)} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
  }
  return `${Math.floor(s / 86400)} j`;
}

export const formatDate = (iso: string) => fullDate.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n.toLocaleString("fr")} ${n > 1 ? many : one}`;
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : tr(COMMON).unreachable;
}

export function gameName(slug: string): string {
  return gameBySlug(slug)?.name.fr ?? slug;
}

export const STATUS_LABEL: Record<Room["status"], string> = {
  lobby: "En attente",
  playing: "En jeu",
  finished: "Terminée",
};

/* ---------------------------------------------------------------------------
   La table vue d'en haut : le tapis du jeu, le rebord en bois, les joueurs autour.
   C'est la pièce maîtresse du panneau — la salle telle qu'un chef de salle la voit.
   --------------------------------------------------------------------------- */

export function MiniTable({ room, size = "md" }: { room: Room; size?: "md" | "lg" }) {
  const mat = gameBySlug(room.game)?.mat ?? "var(--color-felt-700)";
  const box = size === "lg" ? "size-44" : "size-32";
  const radius = size === "lg" ? 43 : 42; // % du côté : les jetons chevauchent le rebord
  const n = room.seats.length;
  return (
    <div className={`relative ${box} shrink-0`}>
      <div
        className="absolute inset-[14%] rounded-full shadow-[inset_0_0_0_5px_#3b2616,inset_0_0_0_6px_rgba(255,255,255,0.08),inset_0_10px_24px_rgba(0,0,0,0.45),0_10px_22px_rgba(0,0,0,0.4)]"
        style={{ background: mat }}
      >
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span
            className={`font-extrabold tabular-nums tracking-wider ${
              size === "lg" ? "text-2xl" : "text-lg"
            } ${room.status === "finished" ? "text-ivory-dim/50" : "text-ivory"}`}
          >
            {room.code}
          </span>
        </span>
      </div>
      {room.seats.map((seat, i) => {
        const angle = ((-90 + (i * 360) / Math.max(n, 1)) * Math.PI) / 180;
        return (
          <span
            key={`${seat.pseudo}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${50 + radius * Math.cos(angle)}%`,
              top: `${50 + radius * Math.sin(angle)}%`,
            }}
          >
            <SeatCoin seat={seat} turn={room.turn === i} size={size === "lg" ? "md" : "sm"} />
          </span>
        );
      })}
    </div>
  );
}

/* Un joueur à sa place : plein s'il est là, éteint s'il est parti, un petit robot pour
   un bot. Celui dont c'est le tour porte le halo d'or de la table. */
export function SeatCoin({
  seat,
  turn = false,
  size = "sm",
}: {
  seat: Seat;
  turn?: boolean;
  size?: "sm" | "md";
}) {
  const present = seat.connected || (seat.bot !== null && !seat.replaced);
  return (
    <span className={`relative block rounded-full ${turn ? "animate-halo" : ""}`}>
      <Avatar id={seat.avatar} size={size} dimmed={!present} />
      {seat.bot && (
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ink text-[0.6rem] ring-1 ring-white/20">
          <BotIcon />
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Petits éléments
   --------------------------------------------------------------------------- */

export function GameSwatch({ slug, className = "size-9" }: { slug: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} shrink-0 rounded-xl ring-1 ring-white/15`}
      style={{ background: gameBySlug(slug)?.mat ?? "var(--color-felt-700)" }}
    />
  );
}

type Tone = "red" | "gold" | "dim" | "mint";

const TONES: Record<Tone, string> = {
  red: "bg-card-red/20 text-[#ff9a88] ring-card-red/40",
  gold: "bg-gold/15 text-gold ring-gold/40",
  dim: "bg-white/8 text-ivory-dim/80 ring-white/15",
  mint: "bg-[#5fd49a]/15 text-[#8be8b8] ring-[#5fd49a]/35",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold leading-4 ring-1 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* Point « en ligne » posé sur un avatar. */
export function OnlineDot() {
  return (
    <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-[#5fd49a] ring-[3px] ring-felt-900" />
  );
}

/* Titre de section : une phrase courte, pas d'étiquette en capitales. */
export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-lg font-extrabold">{children}</h2>
      {aside && <span className="text-sm text-ivory-dim/65">{aside}</span>}
    </div>
  );
}

/* Action à confirmer : le premier tap déplie la question, le second agit. Même geste
   que « Se déconnecter » dans le compte. */
export function ConfirmAction({
  label,
  question,
  confirm,
  danger = false,
  pending,
  onConfirm,
  icon,
}: {
  label: string;
  question: React.ReactNode;
  confirm: string;
  danger?: boolean;
  pending: boolean;
  onConfirm: () => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // L'action terminée, la question se replie d'elle-même.
  const [wasPending, setWasPending] = useState(pending);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) setOpen(false);
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left font-bold transition-colors active:bg-white/5 ${
          danger ? "text-[#ff9a88]" : ""
        }`}
      >
        {icon && <span className="shrink-0 opacity-80">{icon}</span>}
        <span className="grow">{label}</span>
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
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-sm leading-snug text-ivory-dim/85">{question}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grow rounded-xl bg-black/25 py-2.5 font-bold ring-1 ring-white/10 active:translate-y-0.5"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onConfirm}
                  className={`grow rounded-xl py-2.5 font-extrabold active:translate-y-0.5 disabled:opacity-60 ${
                    danger ? "bg-card-red text-ivory" : "bg-gold text-ink"
                  }`}
                >
                  {pending ? <Spinner /> : confirm}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Chargement"
      className={`${className} mx-auto animate-spin`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        className="fill-none stroke-current opacity-25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        className="fill-none stroke-current"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Un panneau : le fond sombre des groupes du compte, pour que le bureau parle la même
   langue que le reste de l'app. */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/10 ${className}`}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Icônes (trait, 24 px)
   --------------------------------------------------------------------------- */

function Stroke({
  children,
  className = "size-5",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${className} fill-none stroke-current stroke-2`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  overview: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M4 19V11M10 19V5M16 19v-6M22 19H2" />
    </Stroke>
  ),
  tables: (p: { className?: string }) => (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="3.5" r="1.5" />
      <circle cx="12" cy="20.5" r="1.5" />
      <circle cx="3.5" cy="12" r="1.5" />
      <circle cx="20.5" cy="12" r="1.5" />
    </Stroke>
  ),
  players: (p: { className?: string }) => (
    <Stroke {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
    </Stroke>
  ),
  maintenance: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 1.3-1.3M14.7 6.3 13 4.6a4 4 0 0 0-5.6 5.6l1.3 1.3L3 17.2V21h3.8l5.7-5.7" />
    </Stroke>
  ),
  back: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="m15 6-6 6 6 6" />
    </Stroke>
  ),
  lock: (p: { className?: string }) => (
    <Stroke {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Stroke>
  ),
  key: (p: { className?: string }) => (
    <Stroke {...p}>
      <circle cx="8" cy="15" r="4.5" />
      <path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2" />
    </Stroke>
  ),
  search: (p: { className?: string }) => (
    <Stroke {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Stroke>
  ),
  eye: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  ),
  eyeOff: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
    </Stroke>
  ),
  pin: (p: { className?: string }) => (
    <Stroke {...p}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="3" />
    </Stroke>
  ),
  unlock: (p: { className?: string }) => (
    <Stroke {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5" />
    </Stroke>
  ),
  signOut: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </Stroke>
  ),
  pause: (p: { className?: string }) => (
    <Stroke {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </Stroke>
  ),
  trash: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
    </Stroke>
  ),
  pencil: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
    </Stroke>
  ),
  check: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Stroke>
  ),
  close: (p: { className?: string }) => (
    <Stroke {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Stroke>
  ),
};

function BotIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-2.5 fill-ivory">
      <rect x="3" y="5" width="10" height="8" rx="2.5" />
      <rect x="7.25" y="1.5" width="1.5" height="3.5" rx="0.75" />
      <circle cx="6" cy="9" r="1.2" className="fill-ink" />
      <circle cx="10" cy="9" r="1.2" className="fill-ink" />
    </svg>
  );
}
