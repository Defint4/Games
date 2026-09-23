"use client";

import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import Lobby, { type BotChoice } from "@/components/Lobby";
import PlayingCard, { CardBackLabel } from "@/components/PlayingCard";
import TableFrame from "@/components/TableFrame";
import { useT } from "@/lib/i18n";
import type { CardT } from "@/lib/types";
import GameTable from "./GameTable";
import { preloadAssets } from "./assets";
import { T } from "./i18n";
import { GAME } from "./meta";
import { useNineToOneSocket, type NineToOneSocket } from "./socket";
import type { RoomView } from "./types";

const BOT_IDS: BotChoice["id"][] = ["easy", "normal", "hard"];

export default function TablePage() {
  const t = useT(T);
  return (
    <CardBackLabel.Provider value="9→1">
      <TableFrame<RoomView, NineToOneSocket>
        game={GAME}
        useSocket={useNineToOneSocket}
        rules={<Rules />}
        preload={preloadAssets}
        lobby={(socket, view) => (
          <Lobby
            socket={socket}
            view={view}
            maxSeats={5}
            botChoices={BOT_IDS.map((id) => ({ id, hint: t.lobby.bots[id] }))}
            onReady={(ready) => socket.setReady(ready)}
          >
            <SwapSection socket={socket} view={view} />
          </Lobby>
        )}
        table={(socket, view) => <GameTable socket={socket} view={view} />}
      />
    </CardBackLabel.Provider>
  );
}

/* ----------------------------------------------------------------------- */
/* Lobby : l'échange initial main <-> cartes visibles                        */
/* ----------------------------------------------------------------------- */

function SwapSection({
  socket,
  view,
}: {
  socket: NineToOneSocket;
  view: RoomView;
}) {
  const you = view.players[view.your_seat];
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const canSwap = !you.ready;
  const t = useT(T);

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm text-ivory-dim/80">
        {canSwap ? t.lobby.swapHint : t.lobby.swapLocked}
      </p>
      <LayoutGroup id="swap">
        <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
          <p className="mb-1 text-xs text-ivory-dim/70">
            {t.lobby.faceUp}
          </p>
          <div className="flex gap-2">
            {you.face_up.map((card, i) => (
              <SwapCard key={`${card.value}-${card.suit}`} card={card}>
                <PlayingCard
                  card={card}
                  size="md"
                  disabled={!canSwap}
                  highlighted={canSwap && selectedHand !== null}
                  onClick={
                    canSwap
                      ? () => {
                          if (selectedHand !== null) {
                            socket.swap(selectedHand, i);
                            setSelectedHand(null);
                          }
                        }
                      : undefined
                  }
                />
              </SwapCard>
            ))}
          </div>
          <p className="mb-1 mt-3 text-xs text-ivory-dim/70">{t.lobby.hand}</p>
          <div className="flex gap-2">
            {(you.hand ?? []).map((card, i) => (
              <SwapCard key={`${card.value}-${card.suit}`} card={card}>
                <PlayingCard
                  card={card}
                  size="md"
                  disabled={!canSwap}
                  selected={selectedHand === i}
                  onClick={
                    canSwap
                      ? () => setSelectedHand(selectedHand === i ? null : i)
                      : undefined
                  }
                />
              </SwapCard>
            ))}
          </div>
        </div>
      </LayoutGroup>
    </section>
  );
}

/* Une carte de l'échange initial : même `layoutId` dans les deux rangées, donc quand
   le serveur renvoie la main et les visibles échangées, chaque carte glisse de son
   ancienne place à la nouvelle (et la main re-triée se réordonne en douceur). */
function SwapCard({
  card,
  children,
}: {
  card: CardT;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      layoutId={`swap-${card.value}-${card.suit}`}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}

/* Rappel des règles, surtout les pouvoirs des cartes spéciales. */
function Rules() {
  const t = useT(T);
  const powers: { card: CardT; text: string }[] = [
    {
      card: { value: 2, suit: "spades" },
      text: t.rules.two,
    },
    {
      card: { value: 7, suit: "diamonds" },
      text: t.rules.seven,
    },
    {
      card: { value: 9, suit: "clubs" },
      text: t.rules.nine,
    },
    {
      card: { value: 10, suit: "hearts" },
      text: t.rules.ten,
    },
  ];
  return (
    <>
      <h2 className="mb-3 text-center text-lg font-extrabold">
        {t.rules.title}
      </h2>
      <p className="mb-3 text-sm text-ivory-dim/85">
        {t.rules.summary}
      </p>
      <ul className="flex flex-col gap-2">
        {powers.map(({ card, text }) => (
          <li
            key={card.value}
            className="flex items-center gap-3 rounded-2xl bg-black/25 p-2"
          >
            <PlayingCard card={card} size="sm" />
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
