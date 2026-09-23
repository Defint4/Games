import { dict } from "@/lib/i18n";
import type { SuitName } from "./types";

/* Les textes du Goulag. Les règles détaillées, en JSX, restent dans TablePage.tsx. */

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export const T = dict({
  fr: {
    lobby: {
      intro:
        "Trois cartes chacun à l’ouverture : les deux plus fortes sont tes vies, la plus faible ta défense. Le dernier survivant gagne.",
      botEasy: "Attaque, défend et charge au hasard. Pour apprendre.",
      botNormal: "Répare sa défense, charge un peu, puis vise qui il peut tuer.",
    },
    banner: {
      youAreDown: "Tu es à terre. Choisis ta couleur.",
      reviving: (name: string) => `${name} joue sa peau…`,
      pickTarget: "Désigne ta cible.",
      yourTurn: "À toi de jouer.",
      choosingTarget: (name: string) => `${name} choisit sa cible…`,
      turnOf: (name: string) => `Au tour de ${name}.`,
    },
    seat: {
      aim: (name: string) => `Viser ${name}`,
      hawkEye: "Œil de faucon",
      ghost: "Carte hors jeu : elle disparaît quand elle est cassée",
      charges: (n: number) => plural(n, "charge"),
      keepDefense: "Garder cette défense pour toi",
      yourMat: "Ton tapis",
    },
    actions: {
      peekTop: "Tu",
      peekBottom: "vois",
      defend: "Défense",
      charge: "Charge",
      attack: "Attaque",
      attacking: (charges: number) =>
        `Tu attaques${charges ? ` avec ${plural(charges, "charge")}` : ""}. Touche un adversaire, la carte sera retournée ensuite.`,
      defending:
        "Cette défense : pour toi, ou pour quelqu'un d'autre ? La carte sera retournée ensuite.",
      eliminated: "Tu es éliminé. La partie continue sans toi.",
    },
    suitPicker: {
      title: "Tu es à terre.",
      body: "Choisis une couleur : si la prochaine carte est de cette couleur, tu revis avec.",
    },
    suits: {
      hearts: "Cœur",
      diamonds: "Carreau",
      clubs: "Trèfle",
      spades: "Pique",
    } as Record<SuitName, string>,
    results: {
      youWon: "Dernier debout.",
      survives: (name: string) => `${name} survit.`,
      rematch: "Revanche !",
      home: "Retour à l’accueil",
    },
    fx: {
      attack: "Attaque !",
      defend: "Défense",
      charge: "Charge",
      versus: (total: number, defense: number, name: string) =>
        `${total} contre ${defense} — ${name}`,
      on: (name: string) => `Sur ${name}`,
      newShield: "Nouveau bouclier",
      shieldFor: (name: string) => `Bouclier pour ${name}`,
      blocked: "Bloqué",
      chargesLost: "Charges perdues",
      lives: (total: number) => `Vies : ${total}`,
      shield: (value: number) => `Bouclier ${value}`,
      down: "À terre",
      lastChance: (name: string) => `Dernière chance — ${name}`,
      revival: (name: string) => `${name} joue sa peau`,
      rightSuit: "Bonne couleur !",
      out: "Éliminé.",
      missed: "Raté…",
      revived: "Revient !",
      eliminated: "Éliminé",
    },
  },
  en: {
    lobby: {
      intro:
        "Everyone starts with three cards: your two highest are your life, the lowest is your shield. Last one alive wins.",
      botEasy: "Attacks, defends and charges at random. Good for learning.",
      botNormal:
        "Patches up its shield, charges a bit, then goes after whoever it can kill.",
    },
    banner: {
      youAreDown: "You’re down. Pick your suit.",
      reviving: (name: string) => `${name} is playing for their life…`,
      pickTarget: "Pick your target.",
      yourTurn: "Your turn.",
      choosingTarget: (name: string) => `${name} is picking a target…`,
      turnOf: (name: string) => `${name}’s turn.`,
    },
    seat: {
      aim: (name: string) => `Target ${name}`,
      hawkEye: "Hawk Eye",
      ghost: "Off-deck card: it vanishes once broken",
      charges: (n: number) => plural(n, "charge"),
      keepDefense: "Keep this shield for yourself",
      yourMat: "Your mat",
    },
    actions: {
      peekTop: "Top",
      peekBottom: "card",
      defend: "Defense",
      charge: "Charge",
      attack: "Attack",
      attacking: (charges: number) =>
        `You’re attacking${charges ? ` with ${plural(charges, "charge")}` : ""}. Tap an opponent, the card gets flipped after.`,
      defending:
        "This shield: yours, or someone else’s? The card gets flipped after.",
      eliminated: "You’re out. The game goes on without you.",
    },
    suitPicker: {
      title: "You’re down.",
      body: "Pick a suit: if the next card matches it, you come back with that card.",
    },
    suits: {
      hearts: "Hearts",
      diamonds: "Diamonds",
      clubs: "Clubs",
      spades: "Spades",
    },
    results: {
      youWon: "Last one standing.",
      survives: (name: string) => `${name} survives.`,
      rematch: "Rematch!",
      home: "Back to home",
    },
    fx: {
      attack: "Attack!",
      defend: "Defense",
      charge: "Charge",
      versus: (total: number, defense: number, name: string) =>
        `${total} vs ${defense} — ${name}`,
      on: (name: string) => `At ${name}`,
      newShield: "New shield",
      shieldFor: (name: string) => `Shield for ${name}`,
      blocked: "Blocked",
      chargesLost: "Charges lost",
      lives: (total: number) => `Life: ${total}`,
      shield: (value: number) => `Shield ${value}`,
      down: "Down",
      lastChance: (name: string) => `Last chance — ${name}`,
      revival: (name: string) => `${name} plays for their life`,
      rightSuit: "Right suit!",
      out: "Out.",
      missed: "Missed…",
      revived: "Back in!",
      eliminated: "Out",
    },
  },
});
