"use client";

import Lobby, { type BotChoice } from "@/components/Lobby";
import TableFrame from "@/components/TableFrame";
import { useLang, useT } from "@/lib/i18n";
import { preloadAssets } from "./assets";
import DieFace from "./DieFace";
import { T } from "./i18n";
import { GAME, MAX_SEATS } from "./meta";
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

function Rules() {
  return useLang() === "en" ? <RulesEn /> : <RulesFr />;
}

function Rule({ face, children }: { face: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
      <DieFace value={face} className="size-9 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function RulesFr() {
  return (
    <>
      <h2 className="mb-3 text-center text-lg font-extrabold">Les règles en bref</h2>
      <p className="mb-3 text-sm text-ivory-dim/85">
        Chacun a 5 dés sous son gobelet et ne voit que les siens. À ton tour, annonce combien de
        dés montrent une face sur toute la table (« sept 4 »), en montant toujours : plus de dés,
        ou autant sur une face plus haute. Tu n&rsquo;y crois pas ? Dudo : on lève les gobelets,
        celui qui s&rsquo;est trompé perd un dé. Plus de dés, tu es éliminé ; le dernier en jeu
        gagne.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <Rule face={1}>
          Les Pacos (les 1) sont jokers. Passer aux Pacos : la moitié de la quantité suffit ; en
          revenir : le double plus un. On n&rsquo;ouvre pas sur les Pacos.
        </Rule>
        <Rule face={6}>
          Calza : n&rsquo;importe qui sauf l&rsquo;enchérisseur annonce que le compte est exact.
          Juste, il regagne un dé ; faux, il en perd un.
        </Rule>
        <Rule face={3}>
          Palifico : la première fois qu&rsquo;un joueur tombe à un dé, les Pacos ne comptent plus
          et la face annoncée ne change plus, seule la quantité monte.
        </Rule>
      </ul>
    </>
  );
}

function RulesEn() {
  return (
    <>
      <h2 className="mb-3 text-center text-lg font-extrabold">The rules, quickly</h2>
      <p className="mb-3 text-sm text-ivory-dim/85">
        Everyone has 5 dice under their cup and only sees their own. On your turn, bid how many
        dice on the whole table show a face (&ldquo;seven 4s&rdquo;), always going up: more dice,
        or the same number on a higher face. Don&rsquo;t buy it? Dudo: cups come up, and whoever
        got it wrong loses a die. No dice left and you&rsquo;re out; last one standing wins.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <Rule face={1}>
          Pacos (the 1s) are wild. Switching to Pacos: half the quantity is enough; switching back:
          double plus one. You can&rsquo;t open on Pacos.
        </Rule>
        <Rule face={6}>
          Calza: anyone but the bidder claims the count is exact. Right, they get a die back;
          wrong, they lose one.
        </Rule>
        <Rule face={3}>
          Palifico: the first time a player drops to one die, Pacos stop being wild and the face
          is locked, only the quantity goes up.
        </Rule>
      </ul>
    </>
  );
}
