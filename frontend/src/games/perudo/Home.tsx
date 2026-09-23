"use client";

import GameHome from "@/components/GameHome";
import Wordmark from "./Wordmark";
import { preloadAssets } from "./assets";
import { GAME } from "./meta";

export default function Home() {
  return <GameHome game={GAME} header={<Wordmark />} preload={preloadAssets} />;
}
