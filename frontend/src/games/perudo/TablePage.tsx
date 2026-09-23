"use client";

import Lobby, { type BotChoice } from "@/components/Lobby";
import TableFrame from "@/components/TableFrame";
import { useT } from "@/lib/i18n";
import { preloadAssets } from "./assets";
import { T } from "./i18n";
import { GAME, MAX_SEATS } from "./meta";
import Rules from "./Rules";
import { usePerudoSocket, type PerudoSocket } from "./socket";
import Table from "./Table";
import type { RoomView } from "./types";

export default function TablePage() {
  const all = useT(T);
  const t = { ...all.lobby, loading: all.loading };
  const botChoices: BotChoice[] = [
    { id: "easy", hint: t.botEasy },
    { id: "normal", hint: t.botNormal },
    { id: "hard", hint: t.botHard },
  ];
  return (
    <TableFrame<RoomView, PerudoSocket>
      game={GAME}
      useSocket={usePerudoSocket}
      rules={<Rules />}
      preload={preloadAssets}
      loadingLabel={t.loading}
      lobby={(socket, view) => (
        <Lobby
          socket={socket}
          view={view}
          maxSeats={MAX_SEATS}
          botChoices={botChoices}
          onReady={(ready) => socket.setReady(ready)}
        >
          <p className="text-sm text-ivory-dim/80">{t.intro}</p>
        </Lobby>
      )}
      table={(socket, view) => <Table socket={socket} view={view} />}
    />
  );
}
