/* Les messages d'erreur du serveur arrivent en français (backend/app). En anglais, on
   les traduit ici, clé = texte exact envoyé par le serveur. Un message absent de la
   table s'affiche tel quel : à ajouter ici quand on en crée un côté serveur. */

import { getLang } from "@/lib/i18n";

const EN: Record<string, string> = {
  "Action inconnue.": "Unknown action.",
  "Aucun joueur actif.": "No active player.",
  "Ce jeu n'a pas de bots.": "This game has no bots.",
  "Ce n'est pas le moment.": "Not now.",
  "Ce n'est pas ton tour.": "It's not your turn.",
  "Ce n'est pas votre tour.": "It's not your turn.",
  "Ce n'est pas à toi de choisir.": "It's not your call.",
  "Ce pseudo est déjà pris dans cette partie.": "That name is already taken at this table.",
  "Ce pseudo est déjà pris.": "That name is already taken.",
  "Ce siège n'est pas un bot.": "That seat isn't a bot.",
  "Cette carte ne peut pas être posée maintenant.": "That card can't be played right now.",
  "Choisis un avatar.": "Pick an avatar.",
  "Cible invalide.": "Invalid target.",
  "Code PIN actuel incorrect.": "Your current PIN is wrong.",
  "Code PIN incorrect.": "Wrong PIN.",
  "Deux charges maximum.": "Two charges at most.",
  "Difficulté inconnue.": "Unknown difficulty.",
  "Durée de tour invalide.": "Invalid turn length.",
  "En Palifico, la face ne change pas.": "In a Palifico round, the face stays the same.",
  "Il faut au moins deux joueurs connectés pour une revanche.":
    "A rematch needs at least two connected players.",
  "Il faut poser au moins une carte.": "You have to play at least one card.",
  "Il faut surenchérir.": "You have to raise the bid.",
  "Il reste des cartes jouables : impossible de retourner une cachée.":
    "You still have playable cards: you can't flip a hidden one.",
  "Impossible d'échanger après s'être déclaré prêt.": "You can't swap after saying you're ready.",
  "Impossible de dire Calza sur sa propre enchère.": "You can't call Calza on your own bid.",
  "Impossible de quitter une partie en cours.": "You can't leave a game in progress.",
  "Impossible de retirer un joueur d'une partie commencée.":
    "You can't remove a player once the game has started.",
  "Indice d'échange invalide.": "Invalid swap.",
  "Indice de carte cachée invalide.": "Invalid hidden card.",
  "Jeton invalide ou expiré.": "Your session has expired. Pick your player again.",
  "Jeton manquant.": "Your session has expired. Pick your player again.",
  "Jeu inconnu.": "Unknown game.",
  "Joueur inconnu.": "Unknown player.",
  "La partie a déjà commencé.": "The game has already started.",
  "La partie est pleine.": "The table is full.",
  "La partie n'est pas en cours.": "The game isn't running.",
  "La revanche se lance en fin de partie.": "A rematch starts once the game is over.",
  "Les échanges ne sont possibles qu'avant le début de la partie.":
    "Swaps are only allowed before the game starts.",
  "Message mal formé.": "Malformed message.",
  "On n'ouvre pas sur les Pacos.": "You can't open on Pacos.",
  "On ne s'attaque pas soi-même.": "You can't attack yourself.",
  "Partie introuvable.": "Table not found.",
  "Pas d'enchère à contester.": "There's no bid to challenge.",
  "Personne n'a de couleur à choisir.": "Nobody has a colour to pick.",
  "Poser un 7 impose de choisir : au-dessus ou en dessous.":
    "Playing a 7 means choosing: higher or lower.",
  "Profil introuvable.": "Player not found. Pick your player again.",
  "Pseudo invalide : lettres, chiffres, espaces, - et _ uniquement.":
    "Invalid name: letters, digits, spaces, - and _ only.",
  "Session fermée : le code PIN de ce compte a changé.":
    "Signed out: this account's PIN was changed.",
  "Seul le créateur de la table ajoute des bots.": "Only the table's creator can add bots.",
  "Seul le créateur de la table retire des bots.": "Only the table's creator can remove bots.",
  "Seul le créateur de la table règle le temps.": "Only the table's creator sets the timer.",
  "Trop d'essais : ce compte est bloqué quelques minutes.":
    "Too many tries: this account is locked for a few minutes.",
  "Trop tard : le coup ne peut plus être enchaîné.": "Too late: that move can't be chained anymore.",
  "Vous n'avez pas assez de cartes de cette valeur.": "You don't have enough cards of that value.",
};

export function serverText(message: string): string {
  return getLang() === "en" ? (EN[message] ?? message) : message;
}
