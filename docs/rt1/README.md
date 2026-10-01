# RT1

Jeu de course contre la montre sur téléphone, à la Trackmania, sur les routes de la
Nouvelle-Calédonie. Le nom vient de la route territoriale 1, de Nouméa à Poum.

Slug : `rt1` · Production : https://games.matthieuguiot.dev/rt1

État (1er oct 2026, après l'audit `AUDIT_RT1.md`) : étapes 2 à 10 faites, 8 circuits jouables sur `/rt1`
dans deux régions (Nouméa, Grand Sud), progression
sur le serveur, courses contre les bots, garage de 13 véhicules (dont 3 motos), atelier,
peinture, courses en direct jusqu'à 8 pilotes (à tester sur téléphone). Le jeu
est « en développement » (`available: "dev"`) : ouvert au seul compte admin, « Bientôt »
pour les autres. Ce document fait foi pour la suite.

## Principe

Des circuits courts (30 s à 2 min) à boucler le plus vite possible, au centième. On
recommence à l'infini, instantanément. Autour de ce cœur : une campagne qui fait le tour
de l'île, des missions, de l'argent, un garage de véhicules à acheter, améliorer et
décorer, des courses contre des bots et en ligne.

## Direction artistique

L'île en low-poly stylisé mais riche, au niveau d'Art of Rally ou de Lonely Mountains:
Downhill : formes simples, matières et lumière soignées. Jamais des boîtes nues.

- Palette : lagon `#3CCFC6`, récif `#0F6F8F`, latérite `#C2502B`, niaouli `#77A34B`,
  sable `#F0D7A3`, balise `#FF7A2F`.
- Lumière : grand jour et fin d'après-midi dorée ; ombres de contact précalculées,
  une ombre dynamique pour les véhicules ; étalonnage chaud.
- Vie du décor : lagon transparent avec écume sur le récif, végétation qui bouge au
  vent, poussière rouge sur les pistes, embruns, traces de pneus.
- Véhicules aux proportions un peu exagérées (roues, ailerons) pour se lire en petit ;
  carrosserie avec reflets.
- HUD : typo Bungee (signalétique routière), chiffres à chasse fixe. Chrono en haut au
  centre, écart au checkpoint en bleu (avance) ou rouge (retard), vitesse en bas, rien
  sous les pouces.
- Jeu en paysage. Android : orientation verrouillée pendant la course. iOS ne permet pas
  de la forcer : écran « tourne ton téléphone ».

## Le monde : la campagne de Nouméa à Poum

Une région = un environnement (décor, surfaces, ambiance) et une série de circuits.
Une région s'ouvre avec le bronze sur tous les circuits de la précédente (contrôlé au
ticket de départ, `rules.unlocked_regions`) ; en ligne, tous les circuits restent
ouverts. Ordre de déblocage :

1. **Nouméa** (fait) : stade d'entraînement (apprentissage), front de mer, la ville la nuit
   (ambiance néon).
2. **Grand Sud** (fait) : terre rouge, lacs, maquis minier.
3. **Côte Ouest** : savane à niaoulis, stations d'élevage, longues lignes droites de la RT1.
4. **La mine** : gradins, pistes, camions, poussière.
5. **La Chaîne** : cols en lacets, forêt humide, brouillard.
6. **Côte Est** : pluie, cascades, falaises.
7. **Le Nord** : jusqu'à Poum, la fin de la RT1.
8. **Îles Loyauté** : sable, falaises, le lagon d'Ouvéa.

## Modes

- **Campagne** : missions par région, déblocages, argent.
- **Entraînement** : seul sur n'importe quel circuit débloqué, fantôme de son meilleur
  temps, redémarrage instantané (au départ ou au dernier checkpoint).
- **Contre les bots** (fait) : 1 à 7 bots, 4 niveaux, sur le circuit choisi. Les bots
  sont des fantômes : tours réels du pilote automatique enregistrés d'avance dans chaque
  véhicule (rythmes et trajectoires variés, `pnpm rt1:bots`), rejoués et recalés sur un
  temps cible. Fourchettes
  par niveau, d'après les médailles du circuit : Facile de l'argent au bronze + 8 %,
  Normal de l'or au bronze, Difficile de l'auteur à l'argent, Expert de l'auteur − 2 % à
  l'or, un peu de hasard à chaque course. Position en direct, classement final complet
  (les temps des bots sont connus d'avance). Départ commun, comme en fantômes ; un bot
  s'efface dans la voiture du joueur et entre elle et la caméra. Le temps compte aussi
  comme record du circuit.
- **En ligne** (fait) : courses en direct dans des salons, et classement par circuit.

## Circuits

- Tracés par points de contrôle sur l'île commune (`assets/rt1/circuits.py`), avec
  murs ou non, nombre de tours et **blocs** : boosts (chevrons orange, poussée 1,4 s,
  plafond moteur +30 %, soit +19 à +24 % de vitesse réelle) et sauts (rampe de 22 m,
  ~1 s en l'air à vitesse moyenne, 1,6 s en F1). À venir : boucles,
  surfaces (terre, sable, herbe, mouillé) avec leur adhérence, circuits point à point.
- Départ, 3 checkpoints obligatoires par tour, arrivée sous le portique de départ.
- Médailles bronze, argent, or, auteur **par véhicule** : meilleur tour du pilote
  automatique dans ce véhicule × 0,985 (auteur), 1,03 (or), 1,13 (argent), 1,28 (bronze).
  Les rythmes sont dans `pace.json` (écrit par `pnpm rt1:bots`, lu par le client et le
  serveur). L'en ligne, lui, reste sans classes.
- Fantôme du meilleur tour (20 poses/s, gardé sur le serveur avec le record), désactivable
  en course.
- Troncs, lampadaires et rochers à moins de 30 m de la route sont de vrais obstacles.
- Région de Nouméa : **Front de mer** (1 tour), **Centre-ville** (2 tours, virages
  serrés, boosts), **Le col** (sans murs, lacets, saut), **La corniche** (2 tours,
  rapide, boosts, saut).
- Région du Grand Sud (toute sans murs, fin d'après-midi dorée, ciel voilé) : **Plaine
  des Lacs** (2 tours, rapide, boosts, autour du Grand Lac), **Yaté** (1 tour, le lac et
  son barrage, montée sur la cuirasse, saut sur la crête), **Baie de Prony** (1 tour, le
  tour de la baie par la côte, les ruines du bagne, saut), **La Madeleine** (2 tours, court
  et technique entre deux lacs, une épingle). Un saut se place sur une ligne droite avec
  de la marge avant le virage suivant, sinon les motos du pilote automatique retombent
  trop vite et sortent (`pnpm rt1:bots` refuse alors le circuit). Décor : terre rouge, gravier de fer, cuirasses
  tabulaires, lacs (l'eau est à 0 partout), ligne haute tension du barrage, cases, farés,
  belvédère ; flore : pins colonnaires, niaoulis, kaoris, maquis, blocs de cuirasse,
  fougères arborescentes.

## Missions

Chaque mission rapporte de l'argent et fait avancer la campagne. Types : décrocher une
médaille, finir dans les N premiers contre des bots, relier deux points, épreuve imposée
(véhicule, type ou niveau d'amélioration maximum), défi de glisse ou de saut.

Accomplies d'elles-mêmes à l'arrivée d'une course, payées une fois, sans bouton à
réclamer. Chaque mission appartient à une région ; les missions « médailles sur N
circuits » ne comptent que les circuits de leur région. Le Grand Sud en a 8 (bronze sur
Plaine des Lacs, bronze partout, argent à Yaté, gagner face à 5 bots Difficile, or à
Prony, 60 courses, auteur à La Madeleine, or partout). Nouméa en a 16 (`rules.py`, textes dans `i18n.ts`) : finir 1 puis 25 courses,
médailles sur un circuit donné, bronze partout, trois ors, temps de l'auteur, or partout ;
contre les bots : gagner face à 3 (Facile ou plus), podium face à 7 Normal, gagner face à
7 Difficile, puis 7 Expert, et « Petit budget » (gagner face à 5 Normal avec un indice de
performance de 400 au plus) ; à l'atelier : une pièce au niveau 5, puis les 9 d'un même
véhicule. Types existants : courses finies, médailles, bots (indice plafonné ou non),
pièces au maximum.

## Véhicules

Chaque famille a sa physique et son son. Premier véhicule : une petite voiture de départ.

- Voitures : citadine, sportive, rallye, pick-up de broussard, supercar.
- Motos : trail, motocross, sportive.
- Monoplaces : kart, F1.
- Tout-terrain : buggy, 4x4.
- Poids lourds : camion de mine.

Achat avec l'argent gagné, à partir d'un niveau de pilote. Plus cher va plus vite (pas de
classes, comme voulu) ; les médailles restent celles de la citadine. Écart moyen au
pilote automatique par rapport à la citadine, prix et niveau :

| Véhicule | Prix | Niveau | Écart |
|---|---|---|---|
| Citadine | offerte | 1 | 0 % |
| Kart | 4 000 F | 2 | −2 % |
| Trail | 5 000 F | 2 | 0 % |
| Camion de mine | 6 000 F | 3 | +6 % (pour le plaisir) |
| Pick-up de broussard | 7 000 F | 3 | −1 % |
| 4x4 | 9 000 F | 4 | −4 % |
| Sportive | 11 000 F | 4 | −6 % |
| Motocross | 12 000 F | 5 | −6 % |
| Rallye | 14 000 F | 5 | −8 % |
| Buggy | 16 000 F | 5 | −10 % |
| Moto sportive | 30 000 F | 7 | −15 % |
| Supercar | 45 000 F | 8 | −18 % |
| F1 | 70 000 F | 10 | −33 % |

Motos : physique arcade assumée. Le moteur physique garde quatre rayons très rapprochés
et un stabilisateur qui tient la moto droite ; elle penche seulement à l'image, d'après
l'accélération latérale (jusqu'à 48°), fantôme et bots compris (inclinaison déduite de
leur trajectoire), et la vue intérieure bascule à 60 % de l'inclinaison. Une vraie moto
en équilibre serait injouable au doigt.

Le record garde son véhicule : le fantôme et le classement le montrent. Les bots roulent
dans le véhicule du joueur, leurs fourchettes ramenées au rythme de ce véhicule.

## Conduite et caméras

- Physique arcade maison : précise, lisible, pardonnante en sortie de virage, jamais
  aléatoire.
- Commandes : direction dosée par la position du doigt entre les deux flèches, frein et
  accélérateur dans une même zone (on glisse de l'un à l'autre), accélération automatique
  en option. Pas encore : inclinaison du téléphone, vibrations.
- Caméras : 3e personne (proche ou loin) et 1re personne (cockpit), bascule en un tap,
  choix mémorisé par véhicule.
- Pilote automatique (tests, bots) : vitesse visée par véhicule ; les véhicules rapides
  anticipent les virages lointains d'après leur distance de freinage, ne comptent pas le
  vol d'un saut dans cette distance et, pour la supercar et la F1, abordent les sauts à
  vitesse plafonnée. La citadine garde le pilotage d'origine (médailles calées dessus).
- **Aucune collision entre véhicules**, ni en ligne ni contre les bots : les autres sont
  des fantômes qu'on traverse.
- Deux sortes de circuits. **Avec murs** (front de mer, centre-ville, corniche) : des pavés
  pleins de 1 m le long du muret et 9 m de haut (mur invisible au-dessus), on ne les
  franchit pas ; au contact la voiture glisse et ralentit, sans décoller ni basculer.
  **Sans murs** (le col) : sortie de route libre, 5 s pour revenir. La voiture est
  reposée là où elle a quitté la route, chrono qui continue. Retournée ou dans le lagon :
  même remise en piste. Générateur : `level.py --walls 0`. Banc : `pnpm rt1:walls`.

## Argent et atelier

- Monnaie : le franc Pacifique (F). Gains : missions, médailles, courses contre bots,
  courses en ligne selon la place.
- Barème actuel : 50 F par course finie ; médaille nouvelle sur un circuit 300 (bronze),
  600 (argent), 1 200 (or), 2 500 F (auteur), chacune payée une fois, cumulées si on
  en saute ; missions 200 à 5 000 F. Contre les bots, le vainqueur face à 7 touche
  200 / 400 / 800 / 1 500 F selon le niveau, le 2e 60 %, le 3e 40 %, les autres 15 %,
  au prorata du nombre de bots. En direct, mêmes parts sur une prime de 600 F pour 8
  pilotes, au prorata du nombre au départ (`online_money`) ; l'arrivée compte aussi
  comme une course solo (record, médailles, missions).
- Niveau du pilote : expérience gagnée avec les courses (10), les médailles (40 à 300)
  et les missions (un dixième de la prime) ; paliers 100, 300, 600, 1 000… (50 × n × (n−1)).
- Améliorations par pièce, niveaux 1 à 5 (fait, onglet Garage) : moteur, turbo, boîte,
  transmission, pneus, suspensions, freins, aéro, allègement. Au niveau max d'une pièce,
  réglages fins de −1 à +1, chacun un compromis : étagement (reprises / pointe), hauteur,
  raideur, appui (adhérence / traînée), répartition du freinage.
- Prix d'un niveau : 2, 3, 5 puis 7 % du prix du véhicule (6 000 F au moins) ; tout
  améliorer coûte environ une fois et demie le véhicule. Gain mesuré au pilote
  automatique, tout au maximum : 5 à 9 % par tour. Effets : `sim/tuning.ts`.
- Un indice de performance (IP) résume le véhicule préparé : ~335 (camion d'origine) à
  ~890 (F1 d'origine), plus avec l'atelier ; certaines missions le plafonnent. Les bots,
  eux, roulent en véhicule d'origine.
- En ligne, un véhicule amélioré va plus vite : c'est voulu, jouer beaucoup rend plus fort.

## Personnalisation

Faite (Garage → Peinture, gratuite, par véhicule acheté) :

- Peinture : couleur libre (palette de l'île ou nuancier), deux tons (bas de caisse,
  bandes, avant, diagonale), finitions brillante, mate, métallisée, nacrée, chromée.
- Couleur des jantes, vitres teintées (curseur), numéro de course (0 à 99) sur les flancs.
  Modèles de jantes : pas encore (il faudra des variantes de géométrie).
- Logo en calques (8 au plus) : 12 formes, 8 motifs de l'île dessinés pour le jeu (vague,
  soleil, cocotier, pin colonnaire, poisson, tortue, fleur, oiseau), texte en Bungee ;
  couleur, position, taille, rotation, ordre ; posé sur capot, toit, portières, arrière.
  **Pas d'import d'image.**
- Technique : les modèles n'ont pas de coordonnées de texture. Le deuxième ton est choisi
  dans le shader d'après la position sur la caisse (attribut `carPos`), logo et numéro
  sont dessinés dans un canevas et projetés en décalques là où un rayon touche la
  peinture : aucune donnée à placer à la main par véhicule.
- Seul le véhicule du joueur porte sa livrée ; fantômes et bots restent comme avant.

## En ligne

- **Courses en direct** (fait, onglet En ligne → salons, page `/rt1/table/<code>`) :
  salons comme les autres jeux (créer sur le circuit du moment, rejoindre par code,
  reprendre le sien, liste en direct), 2 à 8 pilotes, sans bots. Le créateur choisit
  le circuit (tout le monde se redit prêt) ; chacun annonce son véhicule, la couleur de
  sa livrée et son indice ; le bouton « Prêt » attend que le circuit soit chargé. La
  course part 5 s après le dernier prêt, sur une heure du serveur : chaque appareil se
  cale par pings (aller-retour le plus court) et compte 3, 2, 1 sur cette horloge.
- Pendant la course, chaque pilote envoie sa pose 10 fois par seconde (temps de
  course, position, rotation, porte suivante) ; le serveur la relaie telle quelle aux
  autres sièges (`GameSpec.relay`, chemin court hors verrou, une trame sautée si le
  client n'a pas fini de recevoir la précédente). Les autres sont des fantômes
  interpolés avec 180 ms de retard, rendus instanciés par modèle de véhicule aux
  couleurs de leur livrée ; on les traverse. Place en direct comme contre les bots.
  Pas de « Recommencer » ; « Quitter » avant la ligne, c'est abandonner.
- Fin de course quand tout le monde est arrivé, 30 s après le premier, ou au bout de
  10 min. Le serveur paie alors chacun (`record_results` → `service.finish` avec la
  prime de place) et la victoire compte dans les stats du hub (`player_game_stats`,
  1er gagnant, dernier perdant). L'écran d'arrivée montre le classement qui se remplit,
  puis les gains ; « Nouvelle course » ouvre un salon de revanche (même circuit) où
  tous les connectés sont emmenés.
- Classement par circuit (fait) : meilleur temps de chacun, à temps
  égal le premier à l'avoir signé ; « Défier » lance le circuit avec le fantôme de ce
  pilote et les écarts calculés sur ses passages.
- Anti-triche (1er oct 2026) : chaque course solo demande un ticket de départ
  (`POST /api/rt1/start`) ; l'arrivée doit tenir dans le temps que le serveur a vu passer,
  dépasser la moitié du meilleur tour de la citadine, avoir un passage par porte et un
  fantôme lisible ; renvoyée, elle rend le même résultat sans repayer. En direct, le temps
  mesuré par le serveur depuis le top départ fait foi (celui du téléphone gardé à ±1,5 s) :
  pause, arrière-plan et rechargement coûtent du temps réel. Jeux en développement fermés
  côté serveur (`DEV_GAMES`, `OPEN_DEV_GAMES=1` sur une machine de dev).

## Sons

Moteur qui suit le régime (boucles repitchées, une voix par famille), passage de
vitesse, crissement selon la surface, boost, checkpoint, « top » de départ, arrivée.
Musique discrète, qu'on peut couper.

## Technique et optimisation

L'optimisation est un point d'honneur : le jeu doit être fluide sur un téléphone moyen.

- three.js + @react-three/fiber (déjà dans le projet pour le Perudo).
- Cible : 60 i/s sur un téléphone de milieu de gamme, 30 stables sur un ancien. Trois
  paliers (`quality.ts`) : Éco (30 i/s plafonnés, sans MSAA, végétation proche), Standard,
  Élevée ; palier appris en course et gardé, réglable dans le menu pause. La définition
  suit la cadence dans la fourchette du palier.
- Objets répétés instanciés, niveaux de détail à distance, découpage du décor par zones,
  lumière précalculée plutôt que dynamique, une seule ombre temps réel.
- Modèles glTF compressés (meshopt, positions 16 bits), cartes de lumière en KTX2 ETC1S
  (`toktx`, transcodées en ASTC sur iPhone), terrain en 16 tuiles, végétation coupée par
  distance, Rapier chargé à la première course ; écran de chargement jusqu'à la première
  image (shaders compilés, textures envoyées au GPU).
- Physique en pas fixe, découplée de l'affichage.
- Modèles : packs libres de droit (Quaternius, Poly Haven, Kenney) retouchés à la
  palette, et modèles générés par script.

## Où est le code

Course jouée sur l'appareil ; le serveur garde la progression, le garage, le meilleur
temps, ses passages, son véhicule et son fantôme par circuit (tables `rt1_profiles`,
`rt1_records`, migrations 0007 à 0009). Arrivée sans réseau : un record est gardé dans `games:rt1:pending` et renvoyé au
prochain chargement de la progression. Les records d'avant le serveur
(`games:rt1:best:*`, `games:rt1:ghost:*`) y sont versés une fois.

```
backend/app/games/rt1/       routes solo /api/rt1, et la GameSpec des courses en direct
  rules.py                     médailles (miroir de circuits.ts), barème, niveaux, missions
  service.py, router.py        arrivée d'une course (place contre les bots ou en ligne),
                               état du pilote, classements, fantômes
  spec.py                      Rt1Race(GameSpec) : salon, prêt, top départ, relais des
                               poses, arrivées, échéance, paiement (dans GAMES du registre)
backend/app/rooms/router.py  action `ping` (horloge) et chemin court GameSpec.relay,
                               communs à tous les jeux
frontend/assets/rt1/         sources des modèles (Blender 4.5 en script, sans interface)
  build.sh                     régénère tout dans public/rt1/ (Blender + gltf-transform)
  level.py                     circuit : tracé, route, cuisson, export ; le relief, les
                               couleurs, le décor et la végétation viennent de la région
  world_noumea.py              région 1 : baie, ville, îlot du phare
  world_grand_sud.py           région 2 : terre rouge, lacs, barrage, pylônes, ruines
  circuits.py                  tracés, murs, tours, blocs, région de chaque circuit
  palette.py, flora.py         couleurs communes ; prototypes de flore et de mobilier
  car.py                       voiture de départ, roue, ombre de contact cuite
  vehicles.py                  les 12 autres véhicules (sections, tubes), motos et
                               pilotes compris, leurs roues, ombres et vignettes du
                               garage (<id>.webp)
  specs.ts                     dimensions des véhicules pour Blender, tirées de
                               sim/vehicles.ts (lancé par build.sh)
  bots.ts                      tours des bots (pnpm rt1:bots) : pilote automatique dans la
                               vraie physique, sans rendu, sous Node, pour chaque
                               véhicule → <circuit>/bots-<véhicule>.bin (10 poses/s)
  common.py                    outils partagés (maillage coloré, cuisson, GPU)
frontend/public/rt1/         fichiers servis (cache 1 semaine, version dans assetVersion.ts)
frontend/src/games/rt1/
  api.ts                       état du pilote (react-query), arrivée, file hors ligne,
                               classements, fantômes à suivre
  sim/                         physique et règles, sans rendu
    car.ts                       voiture arcade : caisse Rapier + 4 rayons de suspension,
                                 pneus, moteur, freins, appui, anti-roulis
    game.ts                      monde Rapier (champ de hauteurs + route + murs), pas fixe
                                 120 Hz, pose interpolée, reprise au checkpoint
    race.ts                      décompte, checkpoints dans l'ordre, arrivée, écarts (sur
                                 son record ou le pilote défié)
    ghost.ts                     enregistrement du tour (20 poses/s), lecture interpolée
    vehicles.ts                  le garage : physique, pilote automatique, caméra, prix
    tuning.ts                    l'atelier : effets des pièces et réglages, indice, coûts
  livery.ts                    livrée : types, défauts, formes et motifs, dessin du logo
    autopilot.ts                 pilote qui suit la ligne, avec un style (rythme, décalage)
    bots.ts                      lecture des tours enregistrés, choix des bots, pose
    online.ts                    course en direct : poses des autres (Rival, tampon
                                 interpolé) et calage d'horloge (ClockSync)
    colliders.ts                 maillages de collision du glTF pour Rapier
    input.ts, level.ts           commandes (tactile, clavier), données du circuit
  online/                      salon et page de table (/rt1/table/<code>) : socket
                               (ready, setup, circuit, finish, dnf, pose), Lobby,
                               TablePage (chargement, pings, montage de la course)
  three/                       rendu
    kit.ts                       objets three : circuit cuit, lagon, flore instanciée par
                                 cases de 320 m, voiture, bots instanciés (2 appels de
                                 dessin pour 7), caméra (poursuite / cockpit)
    materials.ts                 asphalte marqué, grain du sol, ciel, lagon, vent
    livery.ts                    livrée sur le modèle : peinture et deux tons, jantes,
                                 vitres, décalques (logo, numéro)
    Showroom.tsx                 vitrine 3D de l'éditeur de peinture
    RaceScene.tsx                Canvas R3F, lumières, résolution adaptée à la cadence
  menu/                        écrans hors course : Shell (bandeau argent et niveau,
                               onglets), Carrière (missions), Garage (achat, choix,
                               Workshop : atelier, Paint : éditeur de livrée), En ligne
                               (LiveRooms : salons, puis classements), Profil
  Home.tsx                     onglet Course (circuit du moment, modes)
  Race.tsx                     chrono, commandes tactiles, décompte, arrivée, pause ;
                               rendu tourné de 90° quand l'écran reste en portrait
  PlayPage.tsx, Loader.tsx     chargement (avancement réel, phrases), écran allumé
  engineSound.ts               moteur (une voix par famille), pneus et vent synthétisés,
                               bips de course
```

**Rendu.** Le décor fixe est dessiné sans lumière temps réel : couleur de sommet ×
carte de lumière cuite par Cycles (`lm_*.ktx2`, éclairement / `lmScale`). Seuls la
voiture et la flore sont éclairées en direct, avec le même soleil et le même ciel que la
cuisson ; une sonde de lumière (`probe.bin`) les met à l'ombre des immeubles et du relief.
L'ombre de la voiture est une ombre de contact cuite, posée au sol d'après les roues et
décalée à l'opposé du soleil. Tone mapping neutre (Khronos).

**Régénérer les bots.** Après tout changement de circuit, de véhicule, de physique ou de
pilote automatique : `pnpm rt1:bots` (tous les circuits, ou `pnpm rt1:bots le-col` ;
environ une minute par circuit). Il faut au moins 7 tours sans sortie par véhicule.

**Ajouter un véhicule.** Sa physique, son pilote automatique, sa caméra et son prix dans
`sim/vehicles.ts` (prix et niveau aussi dans `rules.py`), son modèle dans `vehicles.py`,
sa voix dans `engineSound.ts`, ses textes dans `i18n.ts`, puis `build.sh` et
`pnpm rt1:bots`.

**Régénérer les modèles.** `frontend/assets/rt1/build.sh` (Blender 4.5 et KTX-Software
4.4 portables dans `~/.local/opt/`, ou `BLENDER=…`, `TOKTX=…`). `SAMPLES=128` pour aller
vite, `SKIP_CARS=1` pour ne refaire que les circuits, `CIRCUITS="yate prony"` pour une
partie, `SKIP_BLENDER=1` pour ne refaire que l'optimisation. Le build s'arrête si Blender
échoue et finit par `pnpm rt1:check` (route sous le terrain, sens du collider ; un tracé
qui repasse sur lui-même se voit là). Aperçu sans cuisson : `blender -b -P level.py --
--circuit yate --preview out.png --at 200 [--look x,y] [--cover 1]` ; les couvertures
du Grand Sud (`cover.webp`) sont ces rendus Cycles (`--cover 1`), celles de Nouméa des
captures du jeu.

**Ajouter une région.** Un `world_<slug>.py` sur le modèle de `world_grand_sud.py`
(relief `natural`, `terrain_color`, `dress`, `plant`, `protos`, `KINDS`, soleil, ciel,
`PALETTE` du client), ses circuits dans `circuits.py` avec `"region"`, la liste dans
`load.ts`, `REGIONS` et les circuits dans `circuits.ts`, `GATES`, `REGIONS` et les
missions dans `rules.py`, les textes dans `i18n.ts`, puis `build.sh` et `pnpm rt1:bots`.

**Tests.** `/rt1/play?debug` affiche cadence, appels de dessin, triangles et résolution.
`&autopilot` fait rouler le pilote automatique, `&speedup=n` accélère le temps,
`&photo` masque l'interface.

## Arbitrages retenus

Validés par Matthieu le 26 sept 2026 :

- Direction A « l'île », ancrée en Nouvelle-Calédonie.
- Pas de classes de performance pour équilibrer l'en ligne.
- Aucune collision entre véhicules, bots compris.
- Pas d'anti-triche au départ (trop de calcul serveur). Revu le 1er oct 2026 : bornes
  serveur sans rejeu (voir En ligne).
- Médailles par véhicule en campagne (1er oct 2026).
- Pas de logo importé : formes, texte et logos libres de droit.

## Plan de construction

Chaque étape se joue sur téléphone avant la suivante.

1. Nom, direction artistique, ce document (fait).
2. Prototype de conduite : un circuit de Nouméa, une voiture, physique, commandes,
   caméras, chrono, redémarrage (fait ; mesures de perf sur téléphone à faire).
3. Circuits et entraînement : blocs, médailles, fantôme, première région (fait :
   4 circuits ; Nouméa la nuit et le stade restent à faire).
4. Progression : profil serveur, argent, garage, missions, classements par circuit (fait ;
   garage réduit à la voiture de départ tant qu'il n'y a qu'elle).
5. Bots (fait).
6. Autres véhicules : monoplaces, tout-terrain, camion, voitures, motos (fait).
7. Atelier : améliorations et réglages (fait).
8. Personnalisation (faite ; modèles de jantes plus tard).
9. En ligne en direct (fait ; à jouer à deux téléphones avant l'étape suivante).
10. Régions suivantes (Grand Sud fait le 1er oct 2026 ; Côte Ouest ensuite).

## Points ouverts

- Classement du hub : RT1 alimente `player_game_stats` aux victoires en direct (1er
  gagnant, dernier perdant), caché tant que le jeu est en développement. Trier plutôt
  sur les étoiles de campagne ?
- Barème de l'argent et des niveaux : à régler quand les véhicules auront un prix.
- Salon : ni chat ni emotes pour l'instant (la plateforme les fournit, l'écran ne les
  affiche pas).

## Plus tard (non validé)

- Anti-triche plus poussé : contrôle statistique des passages et des fantômes. Un rejeu
  serveur au bit près n'est pas réaliste (V8 contre JavaScriptCore, Rapier non
  déterministe).
- Éditeur de circuits au doigt, partage, circuits de la communauté.
- Modes : défi du jour, championnats, élimination, cascades à moto, glisse.
- Progression : permis, niveau pilote et succès, aides à la conduite qui rapportent plus
  coupées, location avant achat, saisons.
- Social : fantômes des amis, écuries, replays avec caméras TV, mode photo, spectateur.
- Monde : météo et heure variables, dégâts cosmétiques, ligne idéale pour débuter.
