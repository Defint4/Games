"use client";

import Lobby, { type BotChoice } from "@/components/Lobby";
import PlayingCard, { CardBackLabel } from "@/components/PlayingCard";
import TableFrame from "@/components/TableFrame";
import { useLang, useT } from "@/lib/i18n";
import Table from "./Table";
import { preloadAssets } from "./assets";
import { T } from "./i18n";
import { GAME, MAX_SEATS } from "./meta";
import { useGoulagSocket, type GoulagSocket } from "./socket";
import type { RoomView } from "./types";

export default function TablePage() {
  const t = useT(T).lobby;
  const botChoices: BotChoice[] = [
    { id: "easy", hint: t.botEasy },
    { id: "normal", hint: t.botNormal },
  ];
  return (
    <CardBackLabel.Provider value="G">
      <TableFrame<RoomView, GoulagSocket>
        game={GAME}
        useSocket={useGoulagSocket}
        rules={<Rules />}
        preload={preloadAssets}
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
    </CardBackLabel.Provider>
  );
}

function Rules() {
  return useLang() === "en" ? <RulesEn /> : <RulesFr />;
}

function RulesFr() {
  return (
    <>
      <h2 className="mb-3 text-center text-lg font-extrabold">
        Les règles en bref
      </h2>
      <p className="mb-3 text-sm text-ivory-dim/85">
        Deux cartes de vie (leur somme), une carte de défense devant. À ton
        tour, annonce avant de piocher : Défense, Charge ou Attaque. Une attaque
        passe si elle dépasse la défense de la cible, et l&rsquo;écart lui coûte
        des vies. À zéro, on choisit une couleur : bonne carte, on revit ; sinon
        une dernière chance au milieu du paquet.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 12, suit: "hearts" }} size="sm" />
          <span>
            Défense : la carte remplace un bouclier, le tien ou celui d&rsquo;un
            autre.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard faceDown size="sm" />
          <span>
            Charge : posée face cachée, elle s&rsquo;ajoutera à ta prochaine
            attaque. Deux maximum.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 10, suit: "spades" }} size="sm" />
          <span>
            Attaque : carte + charges contre une défense. Touché, on perd ses
            charges.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 14, suit: "diamonds" }} size="sm" />
          <span>
            Un seul As de vie : œil de faucon, tu vois la carte avant
            d&rsquo;annoncer.
          </span>
        </li>
      </ul>
    </>
  );
}

function RulesEn() {
  return (
    <>
      <h2 className="mb-3 text-center text-lg font-extrabold">
        The rules, quickly
      </h2>
      <p className="mb-3 text-sm text-ivory-dim/85">
        Two life cards (add them up), one defense card in front. On your turn,
        call it before you draw: Defense, Charge or Attack. An attack gets
        through if it beats the target&rsquo;s defense, and the difference comes
        off their life. At zero, you pick a suit: right card, you&rsquo;re back;
        if not, one last shot from the middle of the deck.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 12, suit: "hearts" }} size="sm" />
          <span>
            Defense: the card replaces a shield, yours or someone else&rsquo;s.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard faceDown size="sm" />
          <span>
            Charge: laid face down, it adds to your next attack. Two max.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 10, suit: "spades" }} size="sm" />
          <span>
            Attack: card + charges against a defense. Get hit and you lose your
            charges.
          </span>
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-black/25 p-2">
          <PlayingCard card={{ value: 14, suit: "diamonds" }} size="sm" />
          <span>
            Exactly one Ace in your life: Hawk Eye, you see the card before you
            call it.
          </span>
        </li>
      </ul>
    </>
  );
}
