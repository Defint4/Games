/* Le catalogue des jeux. Ajouter un jeu = une entrée ici, un dossier src/games/<slug>/
   et ses routes src/app/<slug>/. Le slug est celui de la GameSpec côté serveur. */

import type { Dict } from "@/lib/i18n";

export const APP_NAME = "Le spot 3.0";
/* Sous l'icône de l'écran d'accueil : la place y est comptée. */
export const APP_SHORT_NAME = "Le spot";

/* La page de sélection, où l'on arrive une fois identifié. */
export const HUB_PATH = "/games";

export type GameMeta = {
  slug: string;
  name: Dict<string>;
  tagline: Dict<string>;
  players: Dict<string>;
  /* Page d'accueil du jeu (créer / rejoindre une table). */
  path: string;
  /* Le « tapis » du jeu sur la page de sélection : chaque jeu a sa matière. */
  mat: string;
  /* Faux tant que le jeu n'est pas jouable : sa tuile est visible mais inerte.
     "dev" : en développement, ouvert au seul compte admin, « Bientôt » pour les autres. */
  available: boolean | "dev";
  /* Un mot pour quelqu'un, écrit à la main sur la tuile. */
  dedication?: Dict<string>;
  /* Jeu chronométré : le meilleur temps s'affiche à côté des victoires (hors tri). */
  timed?: boolean;
  /* Jeu classé à l'Elo : son classement se trie à la cote, affichée à la place des
     victoires. */
  rated?: boolean;
};

export const GAMES: GameMeta[] = [
  {
    slug: "nine-to-one",
    name: { fr: "Nine to One", en: "Nine to One" },
    tagline: {
      fr: "Pose plus fort ou ramasse tout. Le dernier avec des cartes perd.",
      en: "Beat the pile or pick it all up. Last one holding cards loses.",
    },
    players: { fr: "2 à 5 joueurs", en: "2 to 5 players" },
    path: "/nine-to-one",
    mat: "radial-gradient(130% 110% at 85% 15%, #2a7a62 0%, #1b5443 45%, #0f3529 100%)",
    available: true,
  },
  {
    slug: "goulag",
    name: { fr: "Goulag", en: "Goulag" },
    tagline: {
      fr: "Deux cartes de vie, une de défense. Attaque, charge ou blinde-toi.",
      en: "Two life cards, one shield. Attack, charge up or dig in.",
    },
    players: { fr: "2 à 6 joueurs", en: "2 to 6 players" },
    path: "/goulag",
    mat: "radial-gradient(130% 110% at 85% 15%, #4a5a6c 0%, #2b3644 45%, #171e28 100%)",
    available: true,
  },
  {
    slug: "perudo",
    name: { fr: "Perudo", en: "Perudo" },
    tagline: {
      fr: "Des dés sous le gobelet, des enchères et du bluff. Dudo !",
      en: "Dice under the cup, bids and bluffing. Dudo!",
    },
    players: { fr: "2 à 6 joueurs", en: "2 to 6 players" },
    path: "/perudo",
    mat: "radial-gradient(130% 110% at 85% 15%, #8e3b28 0%, #5e2218 45%, #30110c 100%)",
    available: true,
  },
  {
    slug: "solitaire",
    name: { fr: "Solitaire", en: "Solitaire" },
    tagline: {
      fr: "Du roi à l’as, rien que toi et le paquet.",
      en: "King down to ace, just you and the deck.",
    },
    players: { fr: "1 joueur", en: "1 player" },
    path: "/solitaire",
    // Le lagon d'Ouvéa.
    mat: "radial-gradient(130% 110% at 85% 15%, #2fa39b 0%, #17706c 45%, #0a3a3b 100%)",
    available: true,
    dedication: { fr: "Pour Ouvéa", en: "For Ouvéa" },
    timed: true,
  },
  {
    slug: "chess",
    name: { fr: "Échecs", en: "Chess" },
    tagline: {
      fr: "Le roi tombe, la partie aussi. Un contre un.",
      en: "Topple the king, win the game. One on one.",
    },
    players: { fr: "2 joueurs", en: "2 players" },
    path: "/chess",
    mat: "radial-gradient(130% 110% at 85% 15%, #8a6a45 0%, #5e4529 45%, #33251a 100%)",
    available: true,
    rated: true,
  },
  {
    slug: "rt1",
    name: { fr: "RT1", en: "RT1" },
    tagline: {
      fr: "De Nouméa à Poum, au centième.",
      en: "Nouméa to Poum, down to the hundredth.",
    },
    players: { fr: "1 joueur", en: "1 player" },
    path: "/rt1",
    // Le lagon qui tourne à la terre rouge.
    mat: "radial-gradient(130% 110% at 85% 15%, #2ec4c6 0%, #0f6f8f 50%, #5a2414 100%)",
    available: "dev",
  },
];

/* La tuile du jeu s'ouvre-t-elle pour ce compte ? */
export function isOpen(game: GameMeta, admin: boolean): boolean {
  return game.available === true || (game.available === "dev" && admin);
}

export function gameBySlug(slug: string): GameMeta | undefined {
  return GAMES.find((g) => g.slug === slug);
}

/* Route de la table d'un jeu. */
export function tablePath(game: string, code: string): string {
  return `/${game}/table/${code}`;
}
