"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import { Sheet } from "@/components/Sheet";
import { EMOTES } from "@/lib/emotes";
import { dict, useT } from "@/lib/i18n";
import type { BaseRoomView } from "@/lib/types";
import type { RoomSocket } from "@/lib/useRoomSocket";

const T = dict({
  fr: {
    reactions: "Réactions et chat",
    sendEmote: (emoji: string) => `Envoyer ${emoji}`,
    openChat: "Ouvrir le chat",
  },
  en: {
    reactions: "Reactions and chat",
    sendEmote: (emoji: string) => `Send ${emoji}`,
    openChat: "Open the chat",
  },
});

/* Réactions : un bouton en bas à gauche ouvre les emotes et le chat. Ton emote s'affiche
   au-dessus du bouton, celles des autres au-dessus de leur fiche. */
export default function TableReactions({
  socket,
  view,
  className,
}: {
  socket: RoomSocket;
  view: BaseRoomView;
  /* Position verticale (classe Tailwind `bottom-…`), selon ce qui occupe le bas. */
  className: string;
}) {
  const t = useT(T);
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(socket.chat.length);
  const unread = chatOpen ? 0 : socket.chat.length - seen;
  const mine = socket.emotes.findLast((e) => e.seat === view.your_seat);
  return (
    <>
      <div
        className={`absolute left-3 z-20 flex items-center gap-1 transition-[bottom] duration-300 ${className}`}
      >
        <div className="relative">
          <AnimatePresence>
            {mine && (
              <motion.span
                key={mine.id}
                initial={{ opacity: 0, scale: 0.4, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute -top-9 left-1 rounded-full bg-black/60 px-2 py-0.5 text-xl"
              >
                {EMOTES[mine.emote] ?? mine.emote}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="button"
            aria-label={t.reactions}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="relative grid size-10 place-items-center rounded-full bg-black/45 text-lg ring-1 ring-white/15 backdrop-blur-sm active:scale-90"
          >
            😀
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-card-red text-[0.6rem] font-bold text-ivory">
                {Math.min(unread, 9)}
              </span>
            )}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="flex gap-1 rounded-full bg-black/55 p-1 ring-1 ring-white/15 backdrop-blur-sm"
            >
              {Object.entries(EMOTES).map(([id, emoji]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t.sendEmote(emoji)}
                  onClick={() => {
                    socket.sendEmote(id);
                    setOpen(false);
                  }}
                  className="grid size-8 place-items-center rounded-full text-lg active:scale-90"
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                aria-label={t.openChat}
                onClick={() => {
                  setOpen(false);
                  setChatOpen(true);
                }}
                className="grid size-8 place-items-center rounded-full text-lg active:scale-90"
              >
                💬
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {chatOpen && (
        <Sheet
          onClose={() => {
            setChatOpen(false);
            setSeen(socket.chat.length);
          }}
        >
          <ChatPanel socket={socket} view={view} />
        </Sheet>
      )}
    </>
  );
}
