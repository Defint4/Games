import { dict } from "@/lib/i18n";
import { BOT_LABELS, type BotDifficulty } from "@/lib/types";

/* Textes de Nine to One. `label` : la valeur telle qu'affichée sur la carte (9, J, A…). */

// Article anglais devant une valeur de carte : « an 8 », « an A ».
const an = (label: string) => (label === "8" || label === "A" ? "an" : "a");
// Pluriel anglais d'une valeur de carte : « 9s », « jacks ».
const plural = (label: string) =>
  ({ J: "jacks", Q: "queens", K: "kings", A: "aces" })[label] ?? `${label}s`;
const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
};

export const T = dict({
  fr: {
    tagline: "La table est ouverte.",
    lobby: {
      bots: {
        easy: "Joue au hasard, une carte à la fois. Pour apprendre.",
        normal: "Économe : garde ses 2 et ses 10, pose ses multiples.",
        hard: "Réseau entraîné par auto-jeu : compte les cartes, enchaîne.",
      } as Record<BotDifficulty, string>,
      swapHint: "Avant de te déclarer prêt, échange librement ta main avec tes cartes visibles.",
      swapLocked: "Tes cartes sont verrouillées, on attend les autres.",
      faceUp: "Cartes visibles sur la table",
      hand: "Ta main",
    },
    rules: {
      title: "Les règles en bref",
      summary:
        "Chacun pose une carte égale ou plus forte que la précédente, et repioche à 3 cartes tant que la pioche dure. Bloqué ? Tu ramasses tout le tas. 4 cartes identiques d’affilée coupent le tas. Main vidée : tu joues tes cartes visibles, puis tes cachées à l’aveugle. Le dernier avec des cartes perd.",
      two: "Se pose sur tout. Le joueur suivant est libre.",
      seven: "Tu choisis : le suivant joue au-dessus ou en dessous de 7.",
      nine: "Le suivant doit jouer 9 ou moins.",
      ten: "Coupe le tas : tout part à la défausse et tu rejoues. Interdit quand il faut jouer en dessous.",
    },
    table: {
      played: (who: string | null, chase: boolean, count: number, label: string) =>
        `${who === null ? "Tu as" : `${who} a`} ${chase ? "enchaîné" : "posé"} ${
          count > 1 ? `${count}×` : "le "
        }${label}`,
      pickedUp: (who: string | null) => `${who === null ? "Tu as" : `${who} a`} ramassé le tas`,
      cut: "Coupé !",
      youPickUp: "Tu ne peux pas jouer : tu ramasses le tas.",
      picksUp: (pseudo: string) => `${pseudo} ramasse le tas.`,
      timeoutYou: "Temps écoulé : le serveur a joué pour toi.",
      timeoutOther: (pseudo: string) => `Temps écoulé pour ${pseudo}.`,
      howMany: (copies: number, label: string) =>
        `Tu as ${copies} ${label}. Combien en poses-tu ?`,
      sevenAsk: "Ton 7 impose quoi au joueur suivant ?",
      sevenBelow: "En dessous de 7",
      sevenAbove: "Au-dessus de 7",
      emptyPile: "tas vide",
      yourTurn: "À toi de jouer",
      turnOf: (pseudo: string) => `Au tour de ${pseudo}`,
      playOrLess: (label: string) => `Jouer ${label} ou moins`,
      playOrMore: (label: string) => `Jouer ${label} ou plus`,
      afterTwo: "Après un 2 : tout est permis",
      mustFlip: "Choisis une carte cachée à retourner.",
      chase: (label: string) => `Vite ! Enchaîne le ${label}`,
      blindChase: (label: string) => `Vite ! Retourne une carte : un ${label} s’enchaîne !`,
      emptyHand: "Main vide…",
      youFinished: (rank: string) => `Tu as fini ${rank} !`,
      sendEmote: (emoji: string) => `Envoyer ${emoji}`,
      openChat: "Ouvrir le chat",
      bot: (difficulty: BotDifficulty) => `Bot ${BOT_LABELS.fr[difficulty].toLowerCase()}`,
      offline: "Hors ligne · ",
      loadingStats: "Chargement des stats…",
      throwEmote: "Lui lancer une emote",
      throwEmoteLabel: (emoji: string) => `Lancer ${emoji}`,
      stats: (played: number, won: number, rate: number) =>
        `${played} parties · ${won} gagnées · ${rate}% de victoires`,
      lost: "Perdu…",
      gameOver: "Fin de partie",
      pickups: (n: number) => `${n} ramassage${n > 1 ? "s" : ""}`,
      losesGame: "perd la partie",
      moves: (n: number) => `${n} coups joués cette manche`,
      rematch: "Revanche !",
      backHome: "Retour à l’accueil",
      rank: (rank: number) => (rank === 1 ? "1er" : `${rank}e`),
    },
  },
  en: {
    tagline: "The table's open.",
    lobby: {
      bots: {
        easy: "Plays at random, one card at a time. Good for learning.",
        normal: "Stingy: hangs on to its 2s and 10s, dumps its doubles.",
        hard: "Trained by playing itself: counts cards, chains moves.",
      },
      swapHint: "Before you hit ready, swap whatever you like between your hand and your face-up cards.",
      swapLocked: "Your cards are locked in. Waiting on the others.",
      faceUp: "Face-up cards on the table",
      hand: "Your hand",
    },
    rules: {
      title: "The rules, quickly",
      summary:
        "Play a card equal to or higher than the last one, and draw back up to 3 while the deck lasts. Stuck? You pick up the whole pile. Four of the same in a row burns the pile. Hand empty? Play your face-up cards, then your face-down ones blind. Last one holding cards loses.",
      two: "Goes on anything. The next player can play whatever.",
      seven: "Your call: the next player goes over or under 7.",
      nine: "Next player has to play 9 or lower.",
      ten: "Burns the pile: it all goes to the discard and you go again. Not allowed when you have to go lower.",
    },
    table: {
      played: (who, chase, count, label) =>
        `${who ?? "You"} ${chase ? "chained" : "played"} ${
          count > 1 ? `${count}× ${label}` : `${an(label)} ${label}`
        }`,
      pickedUp: (who) => `${who ?? "You"} picked up the pile`,
      cut: "Burned!",
      youPickUp: "Can't play: you pick up the pile.",
      picksUp: (pseudo) => `${pseudo} picks up the pile.`,
      timeoutYou: "Time's up: the server played for you.",
      timeoutOther: (pseudo) => `Time's up for ${pseudo}.`,
      howMany: (copies, label) => `You've got ${copies} ${plural(label)}. How many are you playing?`,
      sevenAsk: "Your 7: what does the next player have to play?",
      sevenBelow: "7 or under",
      sevenAbove: "7 or over",
      emptyPile: "empty pile",
      yourTurn: "Your turn",
      turnOf: (pseudo) => `${pseudo}'s turn`,
      playOrLess: (label) => `Play ${label} or lower`,
      playOrMore: (label) => `Play ${label} or higher`,
      afterTwo: "After a 2: anything goes",
      mustFlip: "Pick a face-down card to flip.",
      chase: (label) => `Quick! Chain your ${label}`,
      blindChase: (label) => `Quick! Flip a card: ${an(label)} ${label} chains on!`,
      emptyHand: "Empty hand…",
      youFinished: (rank) => `You finished ${rank}!`,
      sendEmote: (emoji) => `Send ${emoji}`,
      openChat: "Open chat",
      bot: (difficulty) => `${BOT_LABELS.en[difficulty]} bot`,
      offline: "Offline · ",
      loadingStats: "Loading stats…",
      throwEmote: "Throw them an emote",
      throwEmoteLabel: (emoji) => `Throw ${emoji}`,
      stats: (played, won, rate) => `${played} games · ${won} won · ${rate}% win rate`,
      lost: "You lost…",
      gameOver: "Game over",
      pickups: (n) => `${n} pickup${n > 1 ? "s" : ""}`,
      losesGame: "loses",
      moves: (n) => `${n} move${n > 1 ? "s" : ""} this round`,
      rematch: "Rematch!",
      backHome: "Back to home",
      rank: ordinal,
    },
  },
});
