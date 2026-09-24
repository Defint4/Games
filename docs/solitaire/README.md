# Solitaire

Le Klondike, seul contre le paquet et contre la montre. Dédié à Ouvéa.

Slug : `solitaire` · Production : https://games.matthieuguiot.dev/solitaire

## Règles

**Mise en place.** Sept colonnes : la première a 1 carte, la dernière 7, seule celle du
dessus visible. Les 24 cartes restantes font le talon (en haut à droite), les quatre
fondations sont en haut à gauche.

**Colonnes.** On descend en alternant les couleurs (un 7 rouge sur un 8 noir). Une suite
bien rangée se déplace d'un bloc ; la carte cachée découverte se retourne seule. Une
colonne vide ne reçoit qu'un roi.

**Talon.** Pioche d'une carte à la fois sur la défausse ; talon vide, la défausse repasse
en talon, sans limite de tours. Seule la dernière carte de la défausse se joue.

**Fondations.** De l'as au roi, une couleur par fondation. Une carte peut en redescendre
vers une colonne.

**Fin.** Plus aucune carte cachée dans les colonnes : la partie est gagnée d'avance, le
chrono s'arrête et les cartes montent seules.

## Arbitrages retenus

- Donnes 100 % aléatoires (`secrets`), sans solveur ni filtre : certaines sont perdues
  d'avance.
- Classement comme les autres jeux (victoires, puis moins de parties jouées), Solitaire
  compris dans le classement général. Le meilleur temps est affiché, jamais trié.
- Une partie ouverte à la fois par joueur. Nouvelle donne ou abandon : la partie ouverte
  compte perdue. Quitter l'écran ne l'abandonne pas.
- Le chrono est celui du serveur (donne servie → victoire reçue) : il tourne application
  fermée. L'animation de fin automatique n'y compte pas (les coups partent avant).
- Tap : la carte va d'elle-même en fondation si elle peut, sinon dans la première colonne
  qui l'accepte ; un roi ne quitte pas le fond d'une colonne pour une autre vide.
- Annuler sans limite, gratuit (le temps continue).

## Où est le code

Pas de GameSpec ni de table : le Solitaire est un jeu solo, déclaré dans
`SOLO_GAMES` (`backend/app/games/registry.py`) pour les stats et le classement.

- `backend/app/games/solitaire/engine.py` : règles pures, rejeu d'une liste de coups.
- `backend/app/games/solitaire/service.py`, `router.py` : `/api/solitaire` (partie
  courante, donne, abandon, fin).
- `backend/app/games/solitaire/models.py` : table `solitaire_games` (une ligne par donne
  servie : paquet, départ, fin, victoire, durée, nombre de coups).
- `player_game_stats.best_ms` : meilleur temps (migration 0003).
- `frontend/src/games/solitaire/engine.ts` : le même moteur côté client. **Les deux
  moteurs doivent accepter exactement les mêmes coups** : le serveur refuse une victoire
  qu'il ne sait pas rejouer.
- `layout.ts` (géométrie), `Board.tsx` (cartes animées, gestes), `Game.tsx` (partie,
  chrono, fin), `WinCascade.tsx` (cascade de victoire en canvas).

## Format des coups

Cartes : rang `A23456789TJQK` + couleur `hdcs` (`Th` = dix de cœur). La donne est la
suite des 52 codes (104 caractères), distribuée rangée par rangée : colonne i = i+1
cartes, le reste en talon (dessus = fin de liste).

- `d` : piocher, ou retourner la défausse en talon si le talon est vide.
- `src>dst` ou `src>dst:n` : déplacer la carte du dessus (ou les n du dessus d'une
  colonne). Piles : `w` défausse, `t0`…`t6` colonnes, `f0`…`f3` fondations.

Les coups de la partie en cours sont gardés dans le `localStorage` (`games:solitaire:moves`) :
recharger ne fait rien perdre ; changer d'appareil reprend la même donne depuis le début.

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/solitaire/current` | partie ouverte (`null` sinon) : `id`, `deck`, `elapsed_ms` |
| POST | `/api/solitaire/deal` | donne neuve ; l'ouverte compte perdue |
| POST | `/api/solitaire/{id}/abandon` | partie perdue (204) |
| POST | `/api/solitaire/{id}/finish` | `{moves}` rejoués ; 422 si coup illégal ou pas gagné |
