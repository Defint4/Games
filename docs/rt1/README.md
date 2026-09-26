# RT1

Jeu de course contre la montre sur téléphone, à la Trackmania, sur les routes de la
Nouvelle-Calédonie. Le nom vient de la route territoriale 1, de Nouméa à Poum.

Slug : `rt1` · Production : https://games.matthieuguiot.dev/rt1

État (26 sept 2026) : étape 2 faite, prototype jouable sur `/rt1`. Le jeu est « en
développement » (`available: "dev"`) : ouvert au seul compte admin, « Bientôt » pour les
autres. Ce document fait foi pour la suite.

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
Ordre de déblocage :

1. **Nouméa** : stade d'entraînement (apprentissage), front de mer, la ville la nuit
   (ambiance néon).
2. **Grand Sud** : terre rouge, lacs, maquis minier.
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
- **Contre les bots** : jusqu'à 7 bots, plusieurs niveaux.
- **En ligne** : courses en direct et classement par circuit.

## Circuits

- Construits en **blocs** : droites, virages plats et relevés, sauts, boucles, murs,
  boosts, changements de surface (asphalte, terre, sable, herbe, mouillé), chacune avec
  son adhérence.
- Départ, checkpoints obligatoires, arrivée ; circuits en boucle (n tours) ou d'un point
  à un autre.
- Médailles : bronze, argent, or, auteur (le temps de référence).

## Missions

Chaque mission rapporte de l'argent et fait avancer la campagne. Types : décrocher une
médaille, finir dans les N premiers contre des bots, relier deux points, épreuve imposée
(véhicule, type ou niveau d'amélioration maximum), défi de glisse ou de saut.

## Véhicules

Chaque famille a sa physique et son son. Premier véhicule : une petite voiture de départ.

- Voitures : citadine, sportive, rallye, pick-up de broussard, supercar.
- Motos : trail, sportive, motocross.
- Monoplaces : kart, F1.
- Tout-terrain : buggy, 4x4.
- Poids lourds : camion de mine.

Déblocage par la campagne, ou achat avec l'argent gagné.

## Conduite et caméras

- Physique arcade maison : précise, lisible, pardonnante en sortie de virage, jamais
  aléatoire.
- Commandes au choix : boutons (gauche, droite, accélérer, freiner), inclinaison du
  téléphone, accélération automatique. Vibrations sur Android (Safari iOS n'y donne pas
  accès).
- Caméras : 3e personne (proche ou loin) et 1re personne (cockpit), bascule en un tap,
  choix mémorisé par véhicule.
- **Aucune collision entre véhicules**, ni en ligne ni contre les bots : les autres sont
  des fantômes qu'on traverse.
- Deux sortes de circuits. **Avec murs** (Nouméa) : infranchissables ; passé par-dessus
  (saut), remise en piste au bout de 3 s. **Sans murs** (régions nature, à venir) : sortie
  de route libre, 5 s pour revenir. La voiture est reposée là où elle a quitté la route,
  chrono qui continue. Retournée ou dans le lagon : même remise en piste.
  Générateur : `level.py --walls 0`.

## Argent et atelier

- Monnaie : le franc Pacifique (F). Gains : missions, médailles, courses contre bots,
  courses en ligne selon la place.
- Améliorations par pièce, niveaux 1 à 5 : moteur, turbo, boîte, transmission, pneus,
  suspensions, freins, aéro, allègement. Au niveau max d'une pièce, réglages fins
  (étagement, hauteur, raideur, appui, répartition de freinage).
- Un indice de performance résume le véhicule ; certaines missions l'imposent.
- En ligne, un véhicule amélioré va plus vite : c'est voulu, jouer beaucoup rend plus fort.

## Personnalisation

- Peinture : couleur libre, deux tons, finitions mate, brillante, métallisée, nacrée,
  chromée.
- Jantes (modèle et couleur), vitres teintées, numéro de course.
- Stickers en calques : formes, texte et logos libres de droit, à assembler pour créer
  son propre logo, posés par zones de carrosserie. **Pas d'import d'image.**

## En ligne

- Salons comme les autres jeux (créer, rejoindre, liste en direct), jusqu'à 8 joueurs,
  départ synchronisé, positions relayées par le serveur, autres pilotes en fantômes.
- Classement par circuit : meilleur temps de chacun, fantôme du meilleur à défier.
- Pas d'anti-triche pour l'instant : les temps envoyés par le téléphone sont crus
  (voir Plus tard).

## Sons

Moteur qui suit le régime (boucles repitchées, une voix par famille), passage de
vitesse, crissement selon la surface, boost, checkpoint, « top » de départ, arrivée.
Musique discrète, qu'on peut couper.

## Technique et optimisation

L'optimisation est un point d'honneur : le jeu doit être fluide sur un téléphone moyen.

- three.js + @react-three/fiber (déjà dans le projet pour le Perudo).
- Cible : 60 i/s sur un téléphone de milieu de gamme, 30 minimum sur un ancien ;
  qualité adaptée automatiquement à la cadence mesurée (définition de rendu, ombres,
  densité de végétation), réglable à la main.
- Objets répétés instanciés, niveaux de détail à distance, découpage du décor par zones,
  lumière précalculée plutôt que dynamique, une seule ombre temps réel.
- Modèles glTF compressés (meshopt), textures WebP (KTX2 si la mémoire vidéo devient
  juste), atlas partagés ; chargement par
  région, écran de chargement tant que tout n'est pas prêt.
- Physique en pas fixe, découplée de l'affichage.
- Modèles : packs libres de droit (Quaternius, Poly Haven, Kenney) retouchés à la
  palette, et modèles générés par script.

## Où est le code

Jeu solo, sans serveur pour l'instant (meilleur temps dans le `localStorage`,
`games:rt1:best:<circuit>`).

```
frontend/assets/rt1/         sources des modèles (Blender 4.5 en script, sans interface)
  build.sh                     régénère tout dans public/rt1/ (Blender + gltf-transform)
  level.py                     circuit : tracé, terrain, route, ville, flore, lumière cuite
  car.py                       voiture de départ, roue, ombre de contact cuite
  common.py                    outils partagés (maillage coloré, cuisson, GPU)
frontend/public/rt1/         fichiers servis (cache 1 semaine, version dans assetVersion.ts)
frontend/src/games/rt1/
  sim/                         physique et règles, sans rendu
    car.ts                       voiture arcade : caisse Rapier + 4 rayons de suspension,
                                 pneus, moteur, freins, appui, anti-roulis
    game.ts                      monde Rapier (champ de hauteurs + route + murs), pas fixe
                                 120 Hz, pose interpolée, reprise au checkpoint
    race.ts                      décompte, checkpoints dans l'ordre, arrivée, écarts
    autopilot.ts                 pilote qui suit la ligne (tests, base des bots)
    input.ts, level.ts           commandes (tactile, clavier), données du circuit
  three/                       rendu
    kit.ts                       objets three : circuit cuit, lagon, flore instanciée par
                                 cases de 320 m, voiture, caméra (poursuite / cockpit)
    materials.ts                 asphalte marqué, grain du sol, ciel, lagon, vent
    RaceScene.tsx                Canvas R3F, lumières, résolution adaptée à la cadence
  menu/                        écrans hors course : Shell (bandeau, onglets Course,
                               Carrière, Garage, En ligne, Profil), pages des onglets
  Home.tsx                     onglet Course (circuit du moment, modes)
  Race.tsx                     chrono, commandes tactiles, décompte, arrivée, pause ;
                               rendu tourné de 90° quand l'écran reste en portrait
  PlayPage.tsx, Loader.tsx     chargement (avancement réel, phrases), écran allumé
  engineSound.ts               moteur, pneus et vent synthétisés, bips de course
```

**Rendu.** Le décor fixe est dessiné sans lumière temps réel : couleur de sommet ×
carte de lumière cuite par Cycles (`lm_*.webp`, éclairement / `lmScale`). Seuls la
voiture et la flore sont éclairées en direct, avec le même soleil et le même ciel que la
cuisson. L'ombre de la voiture est une texture cuite, pas une ombre portée.

**Régénérer les modèles.** `frontend/assets/rt1/build.sh` (Blender portable dans
`~/.local/opt/`, ou `BLENDER=…`). `SAMPLES=128` pour aller vite, `SKIP_BLENDER=1` pour ne
refaire que l'optimisation. La couverture (`cover.webp`) est une capture du jeu.

**Tests.** `/rt1/play?debug` affiche cadence, appels de dessin, triangles et résolution.
`&autopilot` fait rouler le pilote automatique, `&speedup=n` accélère le temps,
`&photo` masque l'interface.

## Arbitrages retenus

Validés par Matthieu le 26 sept 2026 :

- Direction A « l'île », ancrée en Nouvelle-Calédonie.
- Pas de classes de performance pour équilibrer l'en ligne.
- Aucune collision entre véhicules, bots compris.
- Pas d'anti-triche au départ (trop de calcul serveur).
- Pas de logo importé : formes, texte et logos libres de droit.

## Plan de construction

Chaque étape se joue sur téléphone avant la suivante.

1. Nom, direction artistique, ce document (fait).
2. Prototype de conduite : un circuit de Nouméa, une voiture, physique, commandes,
   caméras, chrono, redémarrage (fait ; mesures de perf sur téléphone à faire).
3. Circuits et entraînement : blocs, médailles, fantôme, première région complète.
4. Progression : profil serveur, argent, garage, missions, classements par circuit.
5. Bots.
6. Autres véhicules : motos, monoplaces, tout-terrain, camion.
7. Atelier : améliorations et réglages.
8. Personnalisation.
9. En ligne en direct.
10. Régions suivantes.

## Points ouverts

- Classement du hub : trié sur quoi (étoiles de campagne, victoires en ligne) ?
- Transport des courses en direct : le WebSocket des tables est taillé pour le tour par
  tour, il faudra un relais de positions à 10-20 Hz.

## Plus tard (non validé)

- Anti-triche : rejeu serveur des commandes, donc physique déterministe.
- Éditeur de circuits au doigt, partage, circuits de la communauté.
- Modes : défi du jour, championnats, élimination, cascades à moto, glisse.
- Progression : permis, niveau pilote et succès, aides à la conduite qui rapportent plus
  coupées, location avant achat, saisons.
- Social : fantômes des amis, écuries, replays avec caméras TV, mode photo, spectateur.
- Monde : météo et heure variables, dégâts cosmétiques, ligne idéale pour débuter.
