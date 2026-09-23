# Perudo

Jeu de dés et de bluff (2 à 6 joueurs) : chacun cache ses dés sous un gobelet et l'on
enchérit sur ce que montrent tous les dés de la table. Le dernier à garder des dés gagne.

Slug : `perudo` · Production : https://games.matthieuguiot.dev/perudo

## Règles

**Mise en place.** Chacun a 5 dés et un gobelet. À chaque manche, tout le monde lance en
même temps et ne regarde que ses propres dés. Le premier joueur de la partie est tiré au
sort ; on joue ensuite dans le sens horaire.

**Enchérir.** Le joueur au trait annonce une quantité et une face sur l'ensemble des dés
en jeu : « sept 4 » veut dire qu'il y a au moins sept dés montrant 4 sur toute la table.
Le suivant doit soit surenchérir, soit contester.

- Surenchère : plus de dés sur n'importe quelle face, ou autant de dés sur une face plus
  haute. Une enchère ne dépasse jamais le nombre de dés en jeu.
- Les 1, les **Pacos**, sont jokers : ils comptent pour la face annoncée.
- Enchérir sur les Pacos eux-mêmes : la moitié de la quantité suffit, arrondie au
  supérieur (après « sept 4 », « quatre Pacos »). En revenir : le double plus un (après
  « quatre Pacos », au moins « neuf » d'une face). On n'ouvre pas une manche sur les Pacos.

**Dudo.** Le joueur au trait peut dire « Dudo » s'il pense l'enchère fausse. On lève les
gobelets et on compte (Pacos compris) : si l'enchère tient, le douteur perd un dé ; sinon,
c'est l'enchérisseur.

**Calza.** Au lieu de surenchérir ou de contester, n'importe quel joueur encore en jeu,
sauf l'auteur de l'enchère, peut dire « Calza » : le compte est exact. On lève les
gobelets ; s'il a raison, il regagne un dé (5 au plus), sinon il en perd un.

**Manche suivante.** Celui qui a perdu un dé ouvre la manche suivante ; après un Calza,
celui qui l'a dit. Un joueur qui perd son dernier dé est éliminé et son voisin de gauche
ouvre à sa place.

**Palifico.** La première fois qu'un joueur tombe à un seul dé, la manche qu'il ouvre est
Palifico : les Pacos ne sont plus jokers, il peut ouvrir sur n'importe quelle face (Pacos
compris), puis la face ne change plus, seule la quantité monte.

## Arbitrages retenus

Le cœur du jeu est le Perudo standard ; le Calza et le Palifico varient selon les éditions,
les versions les plus répandues ont été retenues (validées par Matthieu le 23 sept 2026) :

- Calza : tout joueur en jeu sauf l'enchérisseur, même hors de son tour ; le premier
  arrivé au serveur l'emporte.
- Palifico : une seule fois par joueur. Pendant la manche, les joueurs qui n'ont eux-mêmes
  qu'un dé peuvent changer de face (plus de dés, ou autant sur une face plus haute ; le 1
  est la face la plus basse puisqu'il n'est plus joker).
- Six joueurs maximum.
- Après un Dudo ou un Calza, la table reste gobelets levés 12 secondes (phase `reveal`, pas
  de timer de tour), puis la manche suivante part d'elle-même. L'animation de révélation
  dure environ 5 s côté client : la marge laisse lire le récapitulatif.
- Temps de tour écoulé : la plus petite surenchère sur sa face la plus fréquente, Dudo si
  plus rien n'est permis.

## Où est le code

```
backend/app/games/perudo/
  engine/        règles pures (aucune I/O) : state, game
  spec.py        GameSpec : traduit les messages WebSocket en appels au moteur
  views.py       ce que chaque siège a le droit de voir
  bots.py        Facile / Normal / Difficile (probabilités), cadencement des manches
  tests/         tests du moteur, dont 40 parties complètes jouées par les bots
frontend/src/games/perudo/
  Home.tsx, TablePage.tsx   accueil, cadre de table (GameHome, TableFrame, Lobby), règles
  Table.tsx                 chorégraphie des événements, adversaires, enchère, sélecteur, révélation
  rules.ts                  règles d'enchère en miroir du moteur (le sélecteur n'offre que du légal)
  DieFace.tsx, colors.ts    dés en 2D et couleurs des joueurs, sans three.js
  three/                    la scène 3D, chargée seulement sur la table :
    TableScene.tsx            places autour du tapis, cadrage téléphone
    Seat.tsx                  un gobelet et ses dés : secouer, claquer, regarder, lever, perdre un dé
    Cup.tsx, geometry.ts      gobelet de cuir tourné, surpiqûres en instances, dé aux arêtes arrondies
    textures.ts, materials.ts textures procédurales (points creusés, grain de cuir, feutre)
    Stage.tsx, tween.ts       lampe, reflets, caméra ; animations (rendu à la demande)
frontend/src/app/perudo/        routes : /perudo, /perudo/table/[code], /perudo/leaderboard
```

La 3D est en three.js avec React Three Fiber et drei, chargés en différé sur la seule page
de table. La scène ne calcule d'image que pendant une animation (`frameloop="demand"`).
Sons : pack Casino de Kenney (CC0), chargés seulement par ce jeu (`preloadDiceSounds`).

## Actions WebSocket du jeu

En plus des actions communes de la plateforme (chat, emote, config, add_bot, remove_bot,
rematch, leave, sync) :

| action | champs | qui, quand |
|---|---|---|
| `ready` | `ready` (bool) | lobby |
| `bid` | `quantity`, `face` (1 à 6) | `bidding`, à son tour |
| `dudo` | | `bidding`, à son tour, s'il y a une enchère |
| `calza` | | `bidding`, tout joueur en jeu sauf l'enchérisseur |

## Ce que voit un siège

Public : nombre de dés de chacun, enchère en cours et enchères de la manche (`history`),
total des dés en jeu, manche Palifico ou non. Privé : ses propres dés (`your_dice`). À la
révélation (`reveal`) : tous les dés tels qu'ils étaient au Dudo ou au Calza, le compte,
et qui perd ou gagne un dé.

Événements diffusés pour les animations : `game_started`, `round_started` (manche, qui
ouvre, Palifico, dés de chacun), `turn`, `bid`, `dudo` et `calza` (révélation complète),
`die_lost`, `die_gained`, `eliminated`, `game_over`.

## Les bots

| Niveau | Politique |
|---|---|
| Facile | surenchérit au plus bas sur sa face la plus fréquente, conteste au jugé |
| Normal | probabilité binomiale qu'une enchère tienne (un dé inconnu vaut la face 1 fois sur 3 avec les Pacos), avec du bruit dans l'estimation |
| Difficile | même calcul, corrigé par la dernière enchère de chaque adversaire (elle trahit un dé de cette face) ; conteste seulement si c'est moins risqué que de surenchérir ; Calza quand le compte exact est nettement le plus probable |

En simulation, Difficile bat Normal environ 2 fois sur 3, et Normal bat Facile. Les bots
décident depuis la vue de leur siège : ils ne voient que leurs dés.
