import { Bungee } from "next/font/google";
import { gameBySlug } from "@/lib/games";

export const GAME = gameBySlug("rt1")!;
export const PLAY_PATH = "/rt1/play";

/* La typo de RT1, dessinée d'après la signalétique routière. */
export const bungee = Bungee({ weight: "400", subsets: ["latin"], display: "swap" });

/* Couleur de la voiture de départ (avant la peinture au choix). */
export const PAINT = "#E8552B";
