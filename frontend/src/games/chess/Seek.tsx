"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { forgetTable } from "@/lib/identity";
import { useT } from "@/lib/i18n";
import { useChessPrefs } from "./prefs";
import { T } from "./i18n";
import { GAME, timeControl } from "./meta";
import type { ChessSocket } from "./socket";
import { pieceUrl } from "./themes";
import type { RoomView } from "./types";
import { SECONDARY } from "./ui";
import CategoryIcon from "./CategoryIcon";

/* La table ouverte, en attendant l'adversaire : elle est au salon avec son Elo et sa
   cadence. La partie démarre dès que quelqu'un la rejoint. */
export default function Seek({ socket, view }: { socket: ChessSocket; view: RoomView }) {
  const all = useT(T);
  const t = all.wait;
  const router = useRouter();
  const { pieces } = useChessPrefs();
  const tc = timeControl(view.time_control);
  const me = view.players[view.your_seat];

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 text-center">
      <div className="relative size-32">
        {/* Un cavalier qui piaffe, et l'onde du salon autour. */}
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-[#81b64c]/60"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2, delay: i, ease: "easeOut" }}
          />
        ))}
        <motion.span
          className="absolute inset-4 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${pieceUrl(pieces, "w", "n")})` }}
          animate={{ rotate: [-6, 6, -6], y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        />
      </div>

      <div>
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <p className="mt-1 max-w-xs text-sm text-ivory-dim/75">{t.hint}</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-[#262522] px-4 py-3 ring-1 ring-white/10">
        <Avatar id={me.avatar} />
        <div className="text-left">
          <p className="font-bold">
            {me.pseudo} {me.rating !== null && <span className="text-ivory-dim/60">({me.rating})</span>}
          </p>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ivory-dim/80">
            <CategoryIcon category={tc.category} className="size-4" />
            {all.timeControl(tc.base, tc.increment)}
          </p>
        </div>
      </div>

      <p className="text-xs text-ivory-dim/50">{t.table(view.code)}</p>

      <button
        type="button"
        onClick={() => {
          socket.leave();
          forgetTable(GAME.slug);
          router.push(GAME.path);
        }}
        className={`w-full max-w-xs py-3.5 ${SECONDARY}`}
      >
        {t.cancel}
      </button>
    </div>
  );
}
