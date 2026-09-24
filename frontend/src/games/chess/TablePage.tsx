"use client";

import TableFrame from "@/components/TableFrame";
import { useT } from "@/lib/i18n";
import { preloadAssets } from "./assets";
import { T } from "./i18n";
import Look from "./Look";
import { GAME } from "./meta";
import Rules from "./Rules";
import Seek from "./Seek";
import { useChessSocket, type ChessSocket } from "./socket";
import Table from "./Table";
import type { RoomView } from "./types";

export default function TablePage() {
  const t = useT(T);
  return (
    <TableFrame<RoomView, ChessSocket>
      game={GAME}
      useSocket={useChessSocket}
      rules={<Rules />}
      look={<Look />}
      felt="chess"
      preload={preloadAssets}
      loadingLabel={t.loading}
      lobby={(socket, view) => <Seek socket={socket} view={view} />}
      table={(socket, view) => <Table socket={socket} view={view} />}
    />
  );
}
