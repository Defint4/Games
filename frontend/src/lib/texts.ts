import { dict } from "@/lib/i18n";

/* Textes repris par plusieurs écrans. Ceux d'un seul écran vivent dans son fichier. */
export const COMMON = dict({
  fr: {
    wait: "Un instant…",
    connecting: "Connexion à la table…",
    unreachable: "Le serveur est injoignable. Réessaie dans un instant.",
    cantJoin: "Impossible de rejoindre.",
    allGames: "Tous les jeux",
    leaderboard: "Classement",
    overallLeaderboard: "Classement général",
    settings: "Réglages",
  },
  en: {
    wait: "One moment…",
    connecting: "Joining the table…",
    unreachable: "Can't reach the server. Try again in a moment.",
    cantJoin: "Couldn't join.",
    allGames: "All games",
    leaderboard: "Leaderboard",
    overallLeaderboard: "Overall leaderboard",
    settings: "Settings",
  },
});
