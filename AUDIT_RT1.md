# Audit RT1 (1er octobre 2026)

Audit complet en lecture seule du jeu RT1, cible iPhone (WebKit, modèles anciens compris).
Aucun fichier du jeu n'a été modifié. Méthode : cartographie du projet, six audits par axe
(physique, graphismes, sécurité, optimisation, logique et réseau, axes ajoutés), relecture par
mes soins du code de chaque constat critique ou majeur, et mesures sous Node avec la vraie
physique du jeu (`Game` + `Car` + Rapier 0.21, colliders extraits des glb publiés).

Stack relevée : Next 16.3.4, React 19.2.8, three 0.186, @react-three/fiber 9.8, drei 10.7,
`@dimforge/rapier3d-compat` 0.21.0 (WASM inclus en base64), FastAPI + SQLAlchemy async +
Postgres. Assets générés par Blender 4.5 (`frontend/assets/rt1/*.py`) puis gltf-transform
(meshopt). 4 circuits, 13 véhicules, 18 Mo servis depuis `frontend/public/rt1/`.

Statut de chaque constat : **confirmé** = relu dans le code par moi (et mesuré quand c'est
indiqué) ; **hypothèse** = déduit du code, à vérifier sur appareil. Effort : S (heures),
M (jours), L (semaine et plus).

---

## 1. Synthèse

### État général

Le socle est sain. Le pas de simulation est fixe (1/120 s) et découplé de l'affichage, il
coûte 0,2 à 0,4 ms par image sur PC ; les barèmes (médailles, prix, coûts de l'atelier) sont
identiques entre `rules.py` et le front ; il n'y a ni injection SQL ni XSS ; les achats et
l'atelier sont verrouillés en base ; `tsc`, `eslint` et `ruff` ne remontent rien sur RT1.

Quatre faiblesses dominent :

1. **Les colliders générés par `level.py` sont faux.** Le mur droit regarde vers l'extérieur
   et le collider de route vers le bas, alors que Rapier ne garde que les contacts de face avant
   avec le drapeau utilisé. Et les rayons de suspension prennent les murs pour du sol. C'est
   l'origine des murs traversés.
2. **Le mode en ligne n'est pas robuste.** Une arrivée envoyée pendant une reconnexion est
   perdue, recharger la page relance un chrono neuf, ouvrir la pause fige son propre chrono.
3. **Le serveur croit tout ce que le téléphone envoie.** Argent, niveaux, missions,
   classements et stats du hub sont falsifiables avec un `curl`, et le verrou « en
   développement » n'existe que dans l'interface.
4. **Rien n'est réglé pour un vieil iPhone.** Environ 100 à 135 Mo de GPU à 2×, définition
   qui monte à 3× avec MSAA, aucun palier de qualité ni réglage manuel, terrain et flore jamais
   simplifiés.

S'y ajoute un risque de projet : les étapes 4 à 9 ne sont pas dans git, et RT1 n'a aucun test
alors que les quatre autres jeux en ont.

### Les 10 problèmes les plus importants

1. **PHY-1. Le mur de droite ne bloque rien**, sur les trois circuits à murs. Mesuré : 46 %
   des chocs traversent, 100 % côté droit.
2. **PHY-2. La voiture grimpe le mur** : les rayons de suspension le prennent pour du sol.
   Mesuré : 12 % de passages par-dessus le collider une fois le point 1 corrigé, 0,6 % quand les
   rayons ignorent les murs.
3. **BLD-1. Tout le travail récent est hors git** et un commit partiel casse le backend.
4. **SEC-1 et SEC-2. Économie et classements falsifiables** avec un `curl` ; verrou « dev »
   côté interface seulement ; `?speedup=0.25` suffit pour rouler au ralenti (SEC-5).
5. **NET-1, NET-2, NET-3. Courses en direct** : arrivée perdue pendant une reconnexion,
   rechargement = chrono neuf, pause = chrono figé.
6. **GFX-1 et GFX-2. Le terrain perce la route** à l'intérieur des virages relevés, sur les
   quatre circuits, aggravé par un depth buffer réglé à near 0,1 / far 3200 : c'est le
   scintillement observé.
7. **GFX-6, GFX-7, GFX-8. Ombre des véhicules** : dalle noire collée au châssis, sans
   direction du soleil ; la voiture n'est jamais dans l'ombre du décor ; pas d'ombre dynamique.
8. **OPT-1, OPT-2, OPT-3. Budget iPhone** : mémoire GPU, définition, MSAA, absence de paliers.
9. **SAV-1 et VIE-2. Records perdus** : sur un 5xx ou un 401, et par rechargement
   automatique de version en pleine course.
10. **PHY-5, CTL-1, CTL-2. Conduite** : pneu tout-ou-rien, tonneaux et envols au choc,
    direction tout-ou-rien, impossible de glisser du gaz au frein.

---

## 2. Mesures

Toutes faites sous Node depuis `frontend/`, sans rien écrire, avec les classes du jeu
(`sim/game.ts`, `sim/car.ts`, `sim/colliders.ts`, `sim/track.ts`) et les fichiers publiés
(`public/rt1/<circuit>/level.glb`, `level.json`, `heights.bin`). À verser au dépôt en phase 0.

### Chocs contre les murs

13 véhicules × 3 circuits à murs × 16 points du tracé × 2 côtés × 5 scénarios (départ arrêté
à 0,2 / 0,6 / 1,2 rad de l'axe, lancé à la vitesse de pointe à 0,12 / 0,35 rad), 4 s plein
gaz sans braquer : 6 240 essais par configuration.

| Configuration | À travers le mur | Par-dessus (> 2,4 m) |
|---|---|---|
| Actuelle (`TriMeshFlags.FIX_INTERNAL_EDGES`) | 2 872 (46 %) | 589 (9,4 %) |
| Trimesh à deux faces (`FIX_INTERNAL_EDGES_TWO_SIDED`) | 6 (0,1 %) | 735 (11,8 %) |
| Deux faces + rayons de suspension qui ignorent les murs | 23 (0,4 %) | 38 (0,6 %) |
| Murs épais (pavés de 1 m, 6 m de haut) + rayons qui ignorent les murs | 0 | 2 (0,03 %) |

- Essai isolé : un trimesh plan avec `FIX_INTERNAL_EDGES` bloque un cuboïde d'un côté et le
  laisse passer de l'autre, à 5, 20 et 60 m/s ; sans drapeau, il bloque des deux côtés.
- Normales de `col_wall` dans les glb publiés : mur gauche 100 % vers la route, mur droit
  100 % vers l'extérieur (noumea 1602/1602, centre-ville 802/802, la-corniche 802/802).
  `col_road` : 100 % vers le bas.
- Départ arrêté, 5 s plein gaz vers le mur : gauche traversé 0/24, droit 18 à 24/24, sur
  les trois circuits et quatre véhicules.
- Trace d'un passage par-dessus (citadine, noumea) : roues côté mur « au sol » avec une normale
  horizontale, charges de 20 à 264 kN, vitesse verticale de 2 à 4 m/s, caisse qui monte de
  1,1 m à 2,4 m en une seconde puis franchit.
- Murs corrigés, il reste au choc des envols de 3 à 9 m (14 m une fois) et 5 à 25 % de
  tonneaux, quel que soit le sens du collider de route (deux faces, retourné, sans drapeau) :
  c'est la réponse au choc du modèle de voiture, pas le mur.

### Terrain et route

Sommets plats de la route (normale y > 0,97, à moins de 7,4 m de l'axe) situés sous le
terrain interpolé depuis `heights.bin` : noumea 186 (max 15 cm), centre-ville 74 (14 cm),
le-col 212 (15 cm), la-corniche 106 (16 cm). Sur le maillage triangulé du terrain, le
sous-agent graphismes mesure 79 à 456 sommets et jusqu'à 53 cm.

### Coût de la physique et des données

- Course complète au pilote automatique : 200 à 400 µs par image de 1/60 s (deux pas), p99
  0,8 à 1,4 ms, sur PC avec d'autres tâches en parallèle. Monde Rapier (champ de hauteurs
  321 × 236 + trimesh) construit en 10 à 36 ms ; glb décodé en 11 à 24 ms.
- Meilleur tour du pilote automatique, lu dans les en-têtes des `bots-*.bin`, à noumea :
  citadine 48,4 s, sportive 42,1 s, supercar 36,8 s, F1 30,7 s, pour un temps auteur de 47 s.

---

## 3. Constats par axe

### 3.1 Physique et collisions

#### PHY-1. Le mur de droite est traversable

- **Gravité** : critique.
- **Preuve** :
  - `frontend/src/games/rt1/sim/game.ts:146-148`
    ```ts
    for (const m of hasWalls ? [road, walls] : [road]) {
      const desc = RAPIER.ColliderDesc.trimesh(m.vertices, m.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
      this.world.createCollider(desc.setFriction(m === walls ? 0.02 : 0.8).setCollisionGroups(0x0001_ffff), body);
    ```
  - `frontend/assets/rt1/level.py:430-436` : les deux murs sont émis avec le même ordre de
    sommets, seul le signe de `l` change, donc leurs normales pointent dans la même direction
    absolue (tangente × haut = vers la droite).
    ```python
    for side in (1, -1):
        l = side * 7.75
        a, bb = road_point(i, l, -1.0), road_point(j, l, -1.0)
        c, d = road_point(j, l, 2.4), road_point(i, l, 2.4)
        b.face((a, bb, c, d), C["black"])
    ```
  - Rapier documente `FIX_INTERNAL_EDGES_TWO_SIDED` comme « idem, mais un contact venant de
    l'arrière d'un triangle est conservé » : avec `FIX_INTERNAL_EDGES`, il est jeté.
- **Cause racine** : collider de mur = feuille d'épaisseur nulle à sens unique, dont le côté
  droit regarde hors de la piste.
- **Impact** : on traverse librement le mur droit à toute vitesse ; une fois dehors, sa face
  active empêche de revenir, puis remise en piste à vitesse nulle après 3 s. Sur le front de mer,
  c'est le mur côté lagon. La règle de la doc « passé par-dessus, on ne peut pas revenir »
  décrit ce bug.
- **Correction** : immédiate, `FIX_INTERNAL_EDGES_TWO_SIDED` dans `game.ts` (S, sans
  régénérer). Durable, en phase 4 : pavés épais par tronçon (`ColliderDesc.cuboid`, environ
  800 par côté, coût négligeable), orientés, hauts, produits par `level.py` ou construits au
  chargement depuis `level.json` (M). Puis `pnpm rt1:bots`.
- **Statut** : confirmé dans le code, mesuré.

#### PHY-2. Les rayons de suspension prennent le mur pour du sol : la voiture grimpe

- **Gravité** : critique.
- **Preuve** :
  - `sim/car.ts:253` : `this.world.castRayAndGetNormal(this.ray, maxLen, true, undefined, 0xffff_0001, undefined, b)`
    (filtre `0xffff_0001` : tout ce qui est dans le groupe 1, c'est-à-dire terrain, route, murs
    et obstacles).
  - `sim/car.ts:262-263` : `w.load = Math.max(0, s.spring * w.compression + (rateC > 0 ? s.bump : s.rebound) * rateC);`
    (amortisseur non borné).
  - `sim/car.ts:291-296` : l'impulsion du ressort est appliquée selon l'axe haut de la caisse,
    quelle que soit la normale touchée.
  - Trace mesurée : roues côté mur « au sol » avec une normale horizontale et des charges de 20
    à 264 kN ; vy de 2 à 4 m/s soutenue.
- **Cause racine** : un rayon qui touche la face du mur (roue à 0,76 m de l'axe pour une caisse
  de 0,80, un peu de roulis ou de dévers suffit) produit une compression, donc une poussée
  vers le haut ; plus la voiture monte, plus elle roule, plus le rayon touche le mur.
- **Impact** : le long d'un mur bien orienté, la voiture grimpe et passe par-dessus les 2,4 m
  du collider (12 % des essais).
- **Correction** (S) : groupe de collision propre aux murs et obstacles (par exemple 0x0004),
  exclu du filtre des rayons mais pas de la caisse ; en plus, ignorer tout contact de roue dont
  la normale a y < 0,5. Effet mesuré : de 735 à 38 passages par-dessus.
- **Statut** : confirmé dans le code, mesuré.

#### PHY-3. Le collider de route est tourné vers le bas

- **Gravité** : majeur.
- **Preuve** : `level.py:421-425` émet le quad `(a, bb, c, d)` sans `flip`, alors que la
  route visible utilise `flip=True` (`level.py:388, 405`). Mesuré : 100 % des triangles de
  `col_road` ont une normale vers le bas sur les 4 circuits. Avec le drapeau à sens unique de
  `game.ts:147`, la caisse ne voit la route que par dessous.
- **Cause racine** : même défaut de sens que PHY-1.
- **Impact** : quand la suspension talonne (réception, bosse, retournement), la caisse traverse
  l'asphalte et s'arrête sur le champ de hauteurs 0,43 à 0,47 m plus bas ; la face active de la
  route repousse alors vers le bas. Les rayons, eux, ne sont pas affectés (`castRayAndGetNormal`
  touche les deux faces). Mon banc ne montre pas de différence d'envols entre route retournée
  et route actuelle : le défaut est réel mais ne cause pas les passages par-dessus.
- **Correction** (S, avec régénération) : `flip=True` sur `col_road`, et prolonger le collider
  en jupe jusqu'au terrain pour supprimer la marche de 0,45 m (voir PHY-6).
- **Statut** : confirmé dans les données ; effet « voiture enfoncée » en jeu : hypothèse.

#### PHY-4. Mur de collision en feuille de 2,4 m, mur visible de 0,82 m, sauts qui passent au-dessus

- **Gravité** : majeur.
- **Preuve** :
  - `level.py:345` : `WALL = [(8.2, 0.0), (8.05, 0.2), (7.88, 0.82), (7.72, 0.82), (7.55, 0.2), (7.4, 0.0)]`
    (mur visible de 0,82 m entre 7,55 et 8,05 m de l'axe).
  - `level.py:433-435` : collider à 7,75 m, de −1,0 à +2,4 m par rapport au bord de route.
  - `assets/rt1/circuits.py`, la-corniche : `"jumps": [(0.8, 2.2)]` ; après le tremplin, la
    route redescend de 6 m et l'axe s'écarte de la trajectoire rectiligne de 13 m à 120 m.
  - `sim/vehicles.ts` : les bots plafonnent leur vitesse avant les sauts (`jump: 26/30`), pas
    le joueur.
- **Cause racine** : en l'air, aucune force de pneu ; balistique à 77 m/s (F1) avec g = 13,24 :
  6 m de haut, retombée vers 115 à 120 m, là où la route a tourné. Le collider n'est que 1,6 m
  plus haut que le mur visible.
- **Impact** : sortie quasi garantie à pleine vitesse en F1, supercar ou sportive ; la
  carrosserie (±0,97 m pour une caisse de 0,80) entre de 0,2 à 0,4 m dans le mur visible.
- **Correction** (S à M) : collider de mur haut (8 m et plus) sur ±150 m autour des sauts, ou
  sauts placés sur des lignes droites plus longues que le vol maximal ; caler le plan de
  collision sur la face visible (7,55 m) et la caisse sur la largeur réelle du modèle.
- **Statut** : dimensions confirmées ; vol réel : hypothèse.

#### PHY-5. Réponse au choc : pneu tout-ou-rien, tonneaux et envols

- **Gravité** : majeur (ressenti et crédibilité).
- **Preuve** :
  - `sim/car.ts:314-322`
    ```ts
    let fy = (-vLat * mEff) / h;
    const mu = (w.front ? s.gripFront : s.gripRear) * w.load;
    const mag = Math.hypot(fx, fy);
    if (mag > mu && mag > 0) { ... fx *= mu / mag; fy *= mu / mag; }
    ```
  - Mesuré, murs corrigés : 5 à 25 % de tonneaux au choc selon le véhicule, envols de 3 à 9 m
    (14 m une fois), sursauts du solveur de plus de 3 m/s en un pas (30 à 60 par 160 essais).
- **Cause racine** : l'effort latéral demandé annule tout le glissement en un pas (citadine :
  34 500 N par m/s), puis est plafonné : frottement sec, aucune zone progressive. Contre un mur,
  le pneu s'oppose au rebond pendant que le mur pousse à mi-hauteur : la voiture bascule, et la
  caisse retournée sur la route déclenche des corrections violentes du solveur.
- **Impact** : conduite « sur rail » puis décrochage sec ; au moindre frôlement de mur à haute
  vitesse, tonneau ou envol, remise en piste.
- **Correction** (M) : courbe de glissement saturée (`mu·load·tanh(k·slip)`), adhérence
  latérale réduite pendant un contact mur, aide anti-tonneau (comme le stabilisateur des motos,
  `car.ts:373-379`), plafond de vitesse verticale gagnée au contact, frottement du mur ajusté.
  Même coût CPU.
- **Statut** : confirmé dans le code, mesuré.

#### PHY-6. Marche de 0,45 m au bord du collider de route et amortisseur non borné

- **Gravité** : mineur (majeur au Col, sans murs).
- **Preuve** : `level.py:250` (`h = h * (1 - w) + (road_z - 0.45) * w`) ; `col_road` s'arrête à
  ±7,4 m (`level.py:423-424`) ; `car.ts:262-263` (`rateC` non borné). Une compression de 0,45 m
  en un pas donne 54 m/s, soit 162 kN sur la citadine.
- **Impact** : secousses ou petit envol en revenant sur la route au Col.
- **Correction** (S) : borner `rateC` (±5 m/s) et `w.load` (4 × poids par roue) ; jupe du
  collider de route jusqu'au terrain.
- **Statut** : confirmé dans le code ; effet : hypothèse.

#### PHY-7. Lagon : on roule sous l'eau

- **Gravité** : mineur.
- **Preuve** : `game.ts:358` : `this.curPos.y < -2.5`, alors que l'eau est à y = 0 (`kit.ts:94`).
- **Correction** (S) : seuil vers −0,8 (origine de caisse sous la surface).
- **Statut** : confirmé.

#### PHY-8. Chute hors du monde en direct hors phase de course

- **Gravité** : mineur.
- **Preuve** : `game.ts:315-318` appelle `restart()`, qui en direct ne fait rien hors phase
  `racing` (`game.ts:241-243`).
- **Correction** (S) : `place(spawn)` direct dans ce cas.
- **Statut** : confirmé.

#### PHY-9. Obstacles et caisse approximatifs

- **Gravité** : mineur.
- **Preuve** : `game.ts:160-162` : rocher = boule de rayon 1,1 × échelle centrée à +0,2 m,
  alors que le modèle est un ellipsoïde 1,56 × 1,2 × 0,84 tourné ; troncs = cylindres de 3 m.
  Caisse de collision plus basse que le toit du modèle (citadine : +0,44 m contre +0,86 m).
- **Impact** : rocher qui sert de tremplin, toit qui s'enfonce dans le sol sur le dos.
- **Correction** (S) : formes orientées par `rot` et `scale`, second pavé « toit ».
- **Statut** : confirmé.

#### PHY-10. Allocations dans la boucle physique

- **Gravité** : mineur.
- **Preuve** : `game.ts:330` (`this.curPos.clone()` par plaque de boost et par pas),
  `race.ts:93-94` (`from.clone()`, `to.clone()`), littéraux `{x, y, z}` dans `car.ts`,
  closure et tableau dans `track.ts:30-54`, environ 25 allocations WASM par pas dans le
  wrapper de Rapier. Environ 7 000 objets par seconde à 120 Hz.
- **Impact** : micro-pauses possibles du ramasse-miettes sur un vieux WebKit.
- **Correction** (S à M) : temporaires réutilisés, `locate(pos, out)`.
- **Statut** : confirmé.

#### PHY-11. Le rejeu serveur promis par la doc n'est pas possible en l'état

- **Gravité** : majeur pour l'objectif affiché.
- **Preuve** : `game.ts:323` n'enregistre que des poses ; `car.ts:233` (`Math.pow`),
  `:316` (`Math.hypot`), `:299` (sin/cos) ; `race.ts:81` lit `Date.now()` ; paquet
  `rapier3d-compat` sans build déterministe.
- **Impact** : un rejeu Node (V8) des commandes d'un iPhone (JavaScriptCore) peut diverger.
- **Correction** : voir section 5.
- **Statut** : confirmé.

#### PHY-12. Pilote automatique calé sur des points d'axe tous les 4 m

- **Gravité** : mineur.
- **Preuve** : `autopilot.ts:58` (`// points de 4 m`) ; `level.py:1121`
  (`range(0, N, max(1, int(4 / DS)))`) donne 3,01 m sur noumea et le-col, 3,98 m ailleurs.
- **Impact** : distances de freinage et de visée fausses de 25 % sur deux circuits.
- **Correction** (S) : exporter l'espacement dans `level.json`.
- **Statut** : confirmé, mesuré.

#### PHY-13. Pas de plafond de sous-pas

- **Gravité** : mineur.
- **Preuve** : `game.ts:302-303` : `this.acc += Math.min(dt, 0.1) * this.speedup; while (this.acc >= H)`,
  jusqu'à 12 pas après une image de 100 ms.
- **Correction** (S) : 6 pas au plus, reste abandonné.
- **Statut** : confirmé.

Vérifié et sain : CCD active (`car.ts:139`), 120 Hz réel avec interpolation, aucun trou aux
jonctions de murs, `world.free()` appelé, stabilité numérique correcte jusqu'à 60 Hz, cohérence
entre le jeu et la simulation Node des bots.

### 3.2 Graphismes

#### GFX-1. Le terrain perce accotement et gravier à l'intérieur des virages relevés (4 circuits)

- **Gravité** : critique.
- **Preuve** :
  - `level.py:246-250`
    ```python
    if dist < 40:
        road_z = Z[ti] - lat * math.sin(BANK[ti]) if abs(lat) < 9 else Z[ti]
        w = 1 - smoothstep(9.5, 32, dist)
        h = h * (1 - w) + (road_z - 0.45) * w
    ```
    avec `BANK` jusqu'à 0,12 rad (`level.py:208`) et une maille de 4 m (`STEP = 4.0`).
  - Mesuré : 74 à 212 sommets de route sous le terrain par circuit (bilinéaire), jusqu'à 53 cm
    sur le maillage triangulé ; tous côté bas du dévers, aucun côté haut.
  - Le terrain sous la route est cuit en noir (lightmap moyenne 0 à 34 sur 255 entre 0 et 8 m
    de l'axe).
- **Cause racine** : hauteur visée discontinue à |lat| = 9 m (jusqu'à 1,08 m d'écart), maille
  de 4 m qui interpole entre un sommet intérieur abaissé et un sommet extérieur trop haut ;
  marge de 0,45 m insuffisante.
- **Impact** : taches noires qui scintillent sur l'accotement et le gravier à l'intérieur des
  virages, sur les 4 circuits ; là où l'écart est de 0 à 5 cm (69 à 285 sommets), z-fighting.
  C'est la meilleure explication du « textures qui se superposent ».
- **Correction** (S, régénération) : dévers pris en compte jusqu'à 40 m avec `lat` borné à
  ±9,4 ; après calcul de `H`, abaisser les 4 coins de toute maille sous l'emprise à « route −
  0,3 m » ; assertion au build : 0 sommet percé.
- **Statut** : confirmé dans le code, mesuré.

#### GFX-2. Précision du depth buffer

- **Gravité** : majeur.
- **Preuve** : `three/RaceScene.tsx:51` : `camera={{ fov: 62, near: 0.1, far: 3200, ... }}` ;
  `three/kit.ts:627` : `cam.near = b > 0.5 ? 0.05 : 0.1;` ; `polygonOffsetFactor` sans
  `polygonOffsetUnits` (`kit.ts:80, 320, 512`, `three/livery.ts:103`). Plaques de boost à 3,3
  à 5,5 cm de la route, ombre à +2 cm, rivage coupé par l'eau sous une pente de 7,5 %.
- **Cause racine** : rapport far/near de 32 000 (64 000 en cockpit) ; en 24 bits, erreur
  d'environ z²/(near·2²⁴) : 2,4 cm à 200 m, 9,5 cm à 400 m, 38 cm à 800 m.
- **Impact** : boosts qui clignotent au-delà de ~230 m, rivage qui grouille au loin, décalques
  qui peuvent scintiller de face.
- **Correction** (S) : near 0,3 à 0,5 en poursuite (la voiture est à plus de 6 m), 0,08 en
  cockpit ; far ~2400 (le ciel reste au fond via `xyww`) ; `polygonOffsetUnits` −2 à −4. Pas
  de `logarithmicDepthBuffer` : il écrit `gl_FragDepth` et désactive la suppression des
  surfaces cachées des GPU Apple.
- **Statut** : confirmé ; nombre de bits réel sous WebKit : hypothèse (`gl.getParameter(gl.DEPTH_BITS)`).

#### GFX-3. Vibreurs, murs et damier en couleurs de sommet : moiré

- **Gravité** : majeur.
- **Preuve** : `level.py:394` (vibreur rouge/blanc par tronçon de 1,5 m), `:401` (mur rouge et
  blanc tous les 3 m), `:465-466` (damier du portique).
- **Cause racine** : motif porté par la géométrie, aucun filtrage de texture possible ; en vue
  rasante, l'alternance dépasse la fréquence d'un pixel.
- **Correction** (M) : texture rayée mipmappée avec UV le long de la route et anisotropie, ou
  fondu des couleurs vers le gris moyen avec la distance dans le shader.
- **Statut** : confirmé ; intensité : hypothèse.

#### GFX-4. Carte de lumière du décor : îlots minuscules et marges trop faibles

- **Gravité** : majeur.
- **Preuve** : `level.py:1076` (`smart_project(angle_limit=66°, island_margin=0.002, ...)`),
  `:944-948` (marge de cuisson 6 px), `:962` (WebP qualité 88). Mesuré : couverture UV de
  10,7 à 19,1 %, 2 à 3,5 texels/m, 48 à 58 % de pixels noirs.
- **Cause racine** : îlots séparés de 0,002 × 2048 ≈ 4 px pour une marge de cuisson de 6 ; dès
  la mip 2, les îlots se mélangent ; le WebP avec pertes sous-échantillonne la chrominance.
- **Impact** : bâtiments, portiques et parasols tachés, franges qui changent de mip en mouvement.
- **Correction** (M) : lumière du décor cuite dans les couleurs de sommet (économise ~22 Mo de
  GPU, supprime le saignement, perd les ombres nettes des arbres sur les façades), ou marges de
  16 px, empaquetage par surface, WebP sans perte.
- **Statut** : confirmé, mesuré.

#### GFX-5. Liseré sombre au bord de route

- **Gravité** : majeur.
- **Preuve** : `level.py:353-354` (1 m de marge avant le profil dans `lm_road`) ; `lm_terrain`
  mesurée en fonction de la distance à l'axe (noumea) : 8 m → 19, 9 m → 133, 10 m → 167 sur 255.
- **Cause racine** : texel du terrain de 0,63 × 0,46 m, filtrage bilinéaire et mips qui
  mélangent le noir « sous la route » au terrain visible sur 1 à 2,5 m.
- **Correction** (S) : dilater les texels visibles sur la zone sous la route avant encodage ;
  marge de 3 à 4 m côté route (place disponible).
- **Statut** : confirmé, mesuré ; visibilité : hypothèse.

#### GFX-6. Ombre des véhicules : dalle noire collée au châssis

- **Gravité** : critique (qualité).
- **Preuve** :
  - `kit.ts:313-325` : `opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2`,
    `blob.position.y = ground + 0.02`, ajouté à `this.root` qui suit position et rotation de la
    caisse (`:344-345`) ; `:355` ne module que l'opacité en l'air.
  - `assets/rt1/vehicles.py:664-675` : `shadow = np.clip((1 - ao) * 1.25, 0, 1)` ; profil
    mesuré de la citadine : `0 81 207 255 255 ... 255 211 76`.
- **Cause racine** : occlusion multipliée par 1,25 puis bornée (saturée) et affichée à 80 % ;
  aucune direction de soleil ; plan qui suit tangage et roulis avec 2 cm de marge.
- **Impact** : tache rectangulaire plate plus sombre que toute ombre cuite du décor, qui passe
  sous la route dès que la suspension travaille (freinage, réception, roulis) ou reste accrochée
  sous la caisse en saut ; ne se décale pas du côté de l'inclinaison des motos.
- **Correction** (S à M) : poser l'ombre au sol d'après les points de contact des roues (la
  simulation les connaît), découplée du tangage et du roulis, opacité 0,5 à 0,6, courbe douce,
  décalage vers le soleil, estompée avec la hauteur.
- **Statut** : confirmé (code et PNG) ; coupure en course : hypothèse.

#### GFX-7. Pas d'ombre dynamique

- **Gravité** : majeur.
- **Preuve** : aucune occurrence de `castShadow`/`shadowMap` dans `src/games/rt1` ; la doc
  promet « une ombre dynamique pour les véhicules ». Le sol est en `MeshBasicMaterial`, qui ne
  reçoit pas les ombres de three.
- **Correction** (M) : ombre silhouette : rendre la voiture seule, vue depuis le soleil, dans
  une cible 256² à 512² (une image sur deux en palier moyen), plaquée sur le quad d'ombre décalé
  à l'opposé du soleil. Fonctionne pour les motos inclinées et les sauts, sans toucher aux
  shaders du décor. Palier bas : ombre de contact seule.
- **Statut** : confirmé (absence).

#### GFX-8. Voiture et flore jamais dans l'ombre cuite ; ambiante comptée deux fois

- **Gravité** : majeur.
- **Preuve** : `RaceScene.tsx:138-142` : `<Environment>` (éclaire les matériaux Standard en
  diffus) + `hemisphereLight` à 1,7 + `directionalLight` à 3,2, sans occlusion ; flore en
  `MeshLambertMaterial` (`kit.ts:134`).
- **Impact** : sous un immeuble ou un arbre cuit dans la route, la voiture reste en plein
  soleil ; arbres à l'ombre des reliefs éclairés.
- **Correction** (S à M) : sonde de lumière (copie réduite 256² de `lm_road` et `lm_terrain`
  lue sous la voiture chaque image pour moduler soleil et environnement), attribut par instance
  pour la flore lu au chargement ; retirer l'hémisphère ou baisser `environmentIntensity`.
- **Statut** : absence d'occlusion confirmée ; double ambiante : hypothèse.

#### GFX-9. Falaises d'un seul quad, bords de carte ouverts, raccord rectangulaire de la mer

- **Gravité** : majeur (critique pour la corniche, à 40 m du bord ouest).
- **Preuve** : `level.py:95-104` : le terme `side = smoothstep(390, 620, abs(x)) * (26 + 10 * n)`
  n'existe que pour `d >= 0` (côté terre) : à x = −640, la hauteur passe de −0,3 à +26,6 m
  entre deux lignes de 4 m (91 arêtes de plus de 6 m de dénivelé). `build_terrain()` ne ferme
  rien et le matériau est face avant seule (`kit.ts:66`), bords nord, est, ouest à 39 à 66 m
  de haut. `materials.ts:270-272` : `inside` binaire, `dm = mix(40.0, tex.r * 8.0, inside)`.
- **Impact** : paroi verticale étirée (6 à 9 texels pour 27 m, grain strié, couleurs en
  dégradé), collines qui s'arrêtent net vues de biais, saut de couleur de la mer le long de
  x = ±640 et y = −420.
- **Correction** (S à M) : `side` continu (× `smoothstep(-15, 25, d)`) ou maillage de falaise
  dédié ; île qui redescend vers la mer sur les 60 derniers mètres ou jupe ; fondu de `inside`
  sur 80 m et profondeur encodée sur 30 m.
- **Statut** : confirmé, mesuré ; visibilité : hypothèse.

#### GFX-10. Tone mapping ACES contre brouillard non tone-mappé

- **Gravité** : majeur.
- **Preuve** : R3F impose `ACESFilmicToneMapping` par défaut (aucun `flat` ni `toneMapping`
  dans `RaceScene.tsx:46-52`) ; ciel et eau incluent `<tonemapping_fragment>`
  (`materials.ts:217, 300`) ; le brouillard `FOG.color = #CFE4EE` (`materials.ts:31`) est
  mélangé après tone mapping avec la couleur brute. Calcul : horizon `#CFE4EE` → `#D2D9DD`
  après ACES, lagon `#2EC4C6` → `#66CACA`. Les aperçus Blender sont en AgX.
- **Impact** : bande à l'horizon là où le terrain dans le brouillard rejoint le ciel ; palette
  plus terne que la direction artistique.
- **Correction** (S) : `NeutralToneMapping` ou `AgXToneMapping` ; ou ciel non tone-mappé et
  brouillard égal à l'horizon tone-mappé.
- **Statut** : confirmé (code et calcul).

#### GFX-11. Défauts mineurs du décor

- **Gravité** : mineur.
- **Preuve** : vibreurs surélevés de 5 cm sans face latérale (`level.py:395`) ; parasols à
  faces doublées coplanaires en `DoubleSide` (`:643-644`, `kit.ts:75`) ; acrotère flottant à
  h + 0,2 (`:531`) ; bande de terre au seuil net `dist < 10` (`:303`) en dents de scie sur une
  maille de 4 m ; jupe de route sans le grain du sol (`kit.ts:66-67`) ; quantification meshopt
  « high » (`build.sh:31`) : positions 14 bits (pas de 7,8 cm sur le terrain), normales 8 bits
  sous un clearcoat, couleurs 8 bits linéaires ; flore posée en bilinéaire sur un terrain
  triangulé, enfoncée de 10 cm seulement (`:821-822`) ; `water.png` 512² pour 1280 × 940 m.
- **Correction** (S) : faces latérales ou biseau, une seule face, centre à h + 0,1,
  `smoothstep(8, 14, dist)`, grain sur la jupe, positions 16 bits et normales 10 bits.
- **Statut** : confirmé ; visibilité : hypothèse.

#### GFX-12. Modèles de véhicules

- **Gravité** : mineur.
- **Preuve** : pilotes = boîte `suit` + sphère (`vehicles.py:163, 557`), contraire à « jamais
  des boîtes nues » ; 3 000 à 7 100 triangles par véhicule, chaque roue clonée = 6 appels de
  dessin ; passages de roue par booléen lissés à 40° (`car.py:178-185`) ; fantôme translucide
  sans prépasse de profondeur (`kit.ts:365`), intérieur et roues visibles à travers ; pendant la
  cuisson de l'ombre, la roue d'origine reste à l'origine (`vehicles.py:747-749`).
- **Correction** (S à M) : pilotes en sections, roues instanciées par primitive, prépasse de
  profondeur pour le fantôme, lissage à 30° autour des arches.
- **Statut** : confirmé ; paliers dans les reflets et artefacts d'arches : hypothèse.

Ce que la doc promet et qui n'existe pas dans le rendu : lagon transparent (eau opaque,
`materials.ts:225-227`), poussière, embruns, traces de pneus dynamiques, ombre dynamique,
qualité adaptative des ombres et de la végétation, LOD, découpage par zones (seule la flore
l'est), atlas partagés, KTX2.

### 3.3 Sécurité

#### SEC-1. Argent, niveaux et missions sans limite par `/finish`

- **Gravité** : critique.
- **Preuve** :
  - `backend/app/games/rt1/router.py:123-139`
    ```python
    class BotsRequest(BaseModel):
        level: str = Field(pattern="^(easy|normal|hard|expert)$")
        count: int = Field(ge=1, le=rules.MAX_BOTS)
        place: int = Field(ge=1, le=rules.MAX_BOTS + 1)
    class FinishRequest(BaseModel):
        time_ms: int = Field(gt=0, le=MAX_TIME_MS)
        ...
        pi: int | None = Field(default=None, ge=0, le=5000)
    ```
  - `router.py:157` : `@limiter.limit("60/minute")`, par IP.
  - `service.py:130-143` : `FINISH_MONEY`, `finishes += 1` et la prime des bots payés à chaque
    appel, sans identifiant de course.
  - `rules.py:78-80` : expert, 7 bots, 1re place = 1 500 F ; `rules.py:152-159` : `beaten_by`
    ne vérifie que ce que le client déclare, `pi` compris.
- **Cause racine** : temps, place, niveau des bots et indice de performance sont déclarés par
  le client ; rien ne relie un appel à une course réellement lancée.
- **Impact** : 1 550 F et 160 XP par appel, 93 000 F par minute depuis une IP ; niveau 10 en
  29 appels ; premier appel `bots={expert,7,1}, pi=0` valide cinq missions (10 300 F) ; quatre
  appels à `time_ms=1` donnent toutes les médailles ; F1 et atelier complet dans la minute. La
  colonne `money` est un entier 32 bits : au-delà de 2³¹, les arrivées de ce joueur finissent en
  500.
- **Correction** (M) : `POST /api/rt1/start` renvoie un ticket à usage unique et l'heure du
  serveur ; `/finish` exige ce ticket, le consomme (idempotence) et vérifie
  `serveur − départ ≥ time_ms` ; plancher de temps par circuit (par exemple 0,85 × auteur) ;
  plafond quotidien des primes ; indice recalculé côté serveur depuis l'atelier stocké.
- **Statut** : confirmé.

#### SEC-2. Le verrou « en développement » n'existe que dans l'interface

- **Gravité** : majeur.
- **Preuve** : `frontend/src/lib/games.ts:110-116` (`available: "dev"`, `isOpen(...)`),
  utilisé seulement par `app/games/page.tsx:150` ; aucun contrôle dans `app/rt1/**` ; côté
  serveur, `rooms/router.py:78-84` crée une table pour tout jeu du registre et `/api/rt1/*` ne
  demande que `get_current_player` ; aucune trace de `dev`/`available` dans `backend/app`.
- **Impact** : `/rt1` accessible en tapant l'URL, API accessible en `curl`. Le backend RT1
  n'étant pas commité, ce n'est pas encore en production, mais ça le sera au premier déploiement.
- **Correction** (S) : liste de jeux en dev côté serveur, dépendance « admin requis » sur le
  routeur RT1, refus dans `create_room`/`join_room` pour les non-admins.
- **Statut** : confirmé.

#### SEC-3. Records et fantômes sans plausibilité

- **Gravité** : majeur.
- **Preuve** : `router.py:131` (`gt=0` accepte 1 ms) ; `service.py:329`
  `order = (Rt1Record.time_ms.asc(), Rt1Record.set_at.asc())` ; `router.py:132-134` : `splits`
  non bornés, fantôme jusqu'à 520 000 caractères base64 servi tel quel par
  `GET /ghost/{circuit}/{pseudo}` ; `sim/ghost.ts:52-57` décode sans contrôle.
- **Impact** : un record à 1 ms reste premier pour toujours (antériorité) ; fantôme arbitraire
  (NaN, 1e38) envoyé à qui clique « Défier » ; réponses de 520 Ko pour une requête minuscule,
  60 par minute et par IP.
- **Correction** (S) : plancher par circuit ; `splits` de longueur égale au nombre de portes,
  strictement croissants, dernier = `time_ms` ; fantôme multiple de 32 octets, taille
  ≤ `ceil(time·20 + 2)·32`, `t` croissants, aucun NaN ; outil admin de purge.
- **Statut** : confirmé.

#### SEC-4. En direct : temps non borné par l'horloge du serveur, stats du hub gonflables

- **Gravité** : majeur.
- **Preuve** : `spec.py:167-176` : `finish` reçoit `now` mais ne s'en sert que pour
  `first_finish` ; une arrivée est acceptée pendant le compte à rebours. `spec.py:419-428` :
  `record_game_results(...)` écrit dans `player_game_stats`, sommé par le classement « Tous les
  jeux » (`players/service.py:215-233`, `components/Leaderboard.tsx:105`). La revanche
  (`rooms/router.py:488-552`) n'a pas de limite de débit.
- **Impact** : deux comptes en boucle prêt / `finish{time_ms:1}` / `dnf` / revanche gonflent
  les victoires du hub sans plafond ; un tricheur seul gagne toutes les courses publiques et ne
  laisse que 30 s aux autres.
- **Correction** (S) : refuser une arrivée avant `start_mono` ; temps officiel = `now −
  start_mono` avec tolérance ; pas de `record_game_results` tant que le jeu est en dev ; plafond
  quotidien des primes en ligne.
- **Statut** : confirmé.

#### SEC-5. Paramètres de test ouverts : `?speedup=0.25` et `?autopilot` en direct

- **Gravité** : majeur.
- **Preuve** : `Race.tsx:193` : `game.testMode(q.has("autopilot"), Math.min(8, Number(q.get("speedup")) || 1))`
  accepte 0,25 (ralenti ×4) ; `game.ts:231-238` : `testing` ne regarde que l'autopilot, le
  ralenti n'empêche donc pas l'envoi du temps ; `Race.tsx:332-335` : en direct, `online.finish`
  part avant le test `game.testing`.
- **Impact** : triche sans aucun outil, depuis l'URL, avec un temps envoyé au classement.
- **Correction** (S) : borner `speedup` à [1, 8], marquer la course `testing` dès qu'un
  paramètre de test est présent, réserver ces paramètres à l'admin.
- **Statut** : confirmé.

#### SEC-6. Codes de table : boucle infinie une fois les 10 000 codes pris

- **Gravité** : majeur (plateforme).
- **Preuve** : `rooms/manager.py:182-186`
  ```python
  def _unique_code(self) -> str:
      while True:
          code = f"{random.randint(0, 9999):04d}"
          if code not in self.rooms:
              return code
  ```
  Tables vides gardées 15 min ; création limitée à 10/min par IP en REST mais pas par revanche.
- **Impact** : boucle synchrone qui bloque l'unique worker uvicorn : tous les jeux s'arrêtent,
  toutes les tables en RAM sont perdues.
- **Correction** (S) : nombre d'essais borné puis 503 ; plafond de tables par joueur et au total.
- **Statut** : boucle confirmée ; saturation effective : hypothèse.

#### SEC-7. WebSocket sans limite de débit ni de taille

- **Gravité** : majeur (plateforme).
- **Preuve** : `rooms/router.py:206-209` (`receive_json()` en boucle sans limite) ;
  `deploy/games-backend.service:19` sans `--ws-max-size` (défaut 16 Mio) ; `spec.py:176` :
  `splits = [int(s) for s in message.get("splits", [])][:64]` convertit avant de couper ; relais
  des poses = une tâche par destinataire et par pose.
- **Impact** : un seul compte assis à une table peut saturer CPU et mémoire du worker.
- **Correction** (S) : `--ws-max-size` (~600 Ko si le fantôme reste sur le socket, sinon
  64 Ko et fantôme par REST), seau à jetons par socket (30 messages/s) avec fermeture 1008,
  couper avant de convertir.
- **Statut** : confirmé ; chiffres mémoire : hypothèse.

#### SEC-8. NaN, Infinity et exceptions non attrapées sur le relais

- **Gravité** : mineur.
- **Preuve** : `spec.py:374-375` (`float(x)` accepte `NaN`/`inf`, `json.dumps` produit du JSON
  invalide) ; `int(inf)` lève `OverflowError`, absente de l'`except` de `rooms/router.py:280` ;
  `lib/useRoomSocket.ts:113` : `JSON.parse(raw.data)` sans `try`.
- **Impact** : trame perdue chez les récepteurs, exception à chaque trame, socket de l'émetteur
  fermé en 1011 ; `t = 1e300` fige ce rival chez les autres (`online.ts:41`), `gate` énorme le
  place premier.
- **Correction** (S) : `math.isfinite`, bornes (position, quaternion, `t`, `gate`),
  `OverflowError` attrapée, `try` autour de `JSON.parse`.
- **Statut** : confirmé (comportement Python vérifié par le sous-agent).

#### SEC-9. PIN à 4 chiffres, blocage non progressif

- **Gravité** : majeur (plateforme).
- **Preuve** : `players/service.py:15-16` : `PIN_MAX_FAILURES = 5`, `PIN_LOCK = timedelta(minutes=15)` ;
  compteur remis à zéro à chaque blocage.
- **Impact** : ~480 essais par jour et par compte, ~10 jours en moyenne pour un compte ciblé.
- **Correction** (S) : blocage exponentiel (15 min, 1 h, 4 h, 24 h), limite globale par IP.
- **Statut** : confirmé.

#### SEC-10. Hygiène

- **Gravité** : mineur.
- **Preuve** : jeton dans l'URL du WebSocket (`lib/api.ts:14`), donc dans les journaux nginx et
  Cloudflare ; jeton en `localStorage` 30 jours sans CSP ; `deploy/nginx-games.conf` sans
  CSP/HSTS/`X-Frame-Options`/`X-Content-Type-Options` ; `next.config.ts:31`
  `allowedDevOrigins: ["192.168.1.105"]` et `next dev -H 0.0.0.0` ; `build.sh:31`
  `npx -y @gltf-transform/cli@4.5.0` hors lockfile ; `deploy.sh:11` `uv sync` sans `--locked` ;
  UUID de tous les joueurs exposés par les routes publiques de classement.
- **Correction** (S) : jeton dans le premier message ou `Sec-WebSocket-Protocol`, journal
  nginx qui masque `token`, en-têtes de sécurité (CSP avec `wasm-unsafe-eval`), outil en
  devDependency, `uv sync --locked`, IP de dev par variable d'environnement.
- **Statut** : confirmé.

Sain : usurpation impossible (records indexés par le `player_id` du jeton, WS exige jeton,
`token_version` et siège), pas de CSRF (Bearer), garage et atelier sous `FOR UPDATE`, livrée
validée (texte dessiné par `fillText`, non interprété), PIN jamais stocké, dépendances figées
(fastapi 0.141.1, starlette 1.6.0, uvicorn 0.52.4, pydantic 2.13.5, next 16.3.4). `pnpm audit`
non lancé pour ne rien écrire.

### 3.4 Optimisation

#### OPT-1. Mémoire GPU et images décodées

- **Gravité** : majeur (critique possible sur iPhone à 2 Go).
- **Preuve** : 3 lightmaps 2048² WebP (`assets.ts:128-130`) décodées en RGBA8 avec mips ≈
  67 Mo de GPU, asphalte 1024² 5,6 Mo, eau 512² ; `assets.ts:26` (`let warm`) garde les
  `Texture` et leurs `HTMLImageElement` après la course (~48 Mo d'images décodées) ; 37 % de
  `lm_terrain` est sous l'eau donc noir ; `RaceScene.tsx:109` `gl.compile` ne pousse pas les
  textures au GPU (envoi pendant la première image). Estimation : 100 à 135 Mo de GPU à 2×,
  150 à 230 Mo à 3× sur un Pro, plus 80 à 110 Mo de mémoire processus.
- **Impact** : WebKit tue l'onglet au-delà de quelques centaines de Mo sur les modèles à 2 ou
  3 Go ; décodage et mips de trois images 2048² pendant la première image.
- **Correction** (S à M) : `ImageBitmapLoader` puis `bitmap.close()` et `texture.source.data
  = null` après `gl.initTexture` ; `initTexture` avant `onReady` ; KTX2/ASTC (≈ 5,6 Mo par carte
  au lieu de 22) ; lightmaps 1024 en palier bas ; retirer les `NORMAL` des maillages en
  `MeshBasicMaterial` (`build.sh:31` `--prune-attributes false`, ~0,8 Mo).
- **Statut** : confirmé ; mémoire réelle : hypothèse.

#### OPT-2. Réglages du renderer

- **Gravité** : majeur.
- **Preuve** : `RaceScene.tsx:43-44` (`maxDpr = Math.min(3, device)`, départ à 2×) ; `:50`
  `gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}` ; R3F ajoute
  `alpha: true` par défaut ; aucun `frameloop`, aucun plafond de cadence.
- **Impact** : MSAA 4× sur 3 Mpx à 3× sur un Pro ; canvas transparent composé par le système ;
  si rAF tourne à 120 Hz sur ProMotion, coût doublé et chauffe.
- **Correction** (S) : `alpha: false` + `setClearColor` ; plafond 2× (1,5× en palier bas) ;
  MSAA coupé au-delà de 1,5× ; plafond 60 i/s (`frameloop="never"` et `advance()` depuis un
  rAF maison qui saute une image sur deux si l'intervalle est inférieur à 12 ms).
- **Statut** : confirmé ; cadence ProMotion : hypothèse.

#### OPT-3. Qualité adaptative mal réglée, aucun palier ni réglage manuel

- **Gravité** : majeur.
- **Preuve** : `RaceScene.tsx:53-58`
  ```tsx
  <PerformanceMonitor flipflops={4}
    onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
    onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
    onFallback={() => setDpr((d) => Math.max(1, Math.min(d, 1.5)))} />
  ```
  Défauts de drei : décision toutes les 2,5 s, montée si ≥ 60 i/s, descente sous 40, bornes
  [60, 100] sur un écran 120 Hz, fallback après 4 bascules, mesure dès le montage, rien de
  mémorisé.
- **Impact** : en mode économie d'énergie (rAF à 30), descente jusqu'à 1× puis blocage sans
  rien gagner ; appareil capable qui oscille figé à 1,5× pour la session ; sur 120 Hz aucune
  montée sous 100 i/s ; chaque course refait l'apprentissage ; chaque changement de définition
  réalloue le tampon MSAA.
- **Correction** (M) : gouverneur maison : mesurer intervalle et temps de travail, ne pas
  descendre si la cadence est stable à 30 ± 1 avec moins de 20 ms de travail (plafond système),
  hystérésis asymétrique, palier mémorisé en `localStorage`, mesure après le « GO », réglage
  manuel Auto / Économie / Standard / Élevée dans le menu pause. Proposition de paliers :

  | | Économie (A10-A11, ou plafond à 30 détecté) | Standard (A12-A14) | Élevée (A15+) |
  |---|---|---|---|
  | Définition | 1,25×, plafond 1,5× | 1,5 à 2× | 2×, jamais 3× |
  | MSAA | non | non au-delà de 1,5× | oui |
  | Cadence | 30 i/s plafonnés et stables | 60 | 60, même en 120 Hz |
  | Lightmaps | 1024² ou KTX2 | 2048² KTX2 | 2048² KTX2 |
  | Flore | arbres jusqu'à 350 m, buissons 120 m, sans vent | 600 m / 200 m | tout |
  | Eau | 1 octave, sans caustiques | complète | complète |
  | Peinture | Standard sans clearcoat ni iridescence | clearcoat | tout |
  | Ombre voiture | contact décalée vers le soleil | silhouette 256², 1 image sur 2 | silhouette 512² |

  Mon avis : un 30 i/s stable en Économie vaut mieux qu'un 40-50 irrégulier ; baisser la
  définition avant tout le reste ; garder le MSAA seulement à 2×.
- **Statut** : confirmé ; comportements sur appareil : hypothèse.

#### OPT-4. Rapier dans le JS initial de tous les menus RT1

- **Gravité** : majeur.
- **Preuve** : `assets.ts:7` `import { initPhysics } from "./sim/game";` → `sim/game.ts:4`
  `import RAPIER from "@dimforge/rapier3d-compat";`, importés par `menu/Shell.tsx:14`,
  `Home.tsx:13`, `menu/Garage.tsx:13`, `menu/Paint.tsx:16`. Mesuré dans `.next` : le HTML de
  `rt1`, `rt1/play` et `rt1/garage` référence `static/chunks/3qianh8wlz9sz.js` (4 359 772 o,
  1 663 728 o gzip : Rapier « compat » avec le WASM en base64). JS d'une page menu RT1 :
  5 606 196 o bruts, 2 041 408 o gzip ; hub : 860 727 o, 272 037 o gzip.
- **Cause racine** : import statique ; le préchargement du circuit depuis les menus est voulu
  (`Shell.tsx:43-46`), mais il entraîne l'analyse de 4,4 Mo de JS et le décodage base64 sur le
  fil principal avant tout menu.
- **Correction** (S à M) : `import()` dynamique de Rapier dans `initPhysics` (`Car` reçoit déjà
  `RAPIER` en paramètre) ; à terme `@dimforge/rapier3d` avec `.wasm` séparé, compilé en
  streaming et compressé en brotli (~1,2 Mo).
- **Statut** : confirmé, mesuré.

#### OPT-5. Rendu continu hors course et flous plein écran

- **Gravité** : majeur (batterie, chauffe).
- **Preuve** : `RaceScene.tsx:121-122` (`useFrame` sans `frameloop`, seule la simulation est
  conditionnée par `paused`) ; `Race.tsx:164` `const paused = menu || !ready;` (la fin de course
  ne met rien en pause, la physique continue à 120 Hz) ; overlays `backdrop-blur-[2px]` sur
  tout l'écran (`Race.tsx:518, 565`) ; 4 `HudButton` en `backdrop-blur-sm` (`:818`), pastille de
  place (`:445`), 4 pads (`:871`) ; `Showroom.tsx:22-26` sans `frameloop`, rotation permanente.
- **Impact** : le compositeur recalcule ~9 flous par image au-dessus d'un calque WebGL qui
  change à chaque image ; image fixe rendue à pleine cadence en pause, à l'arrivée et dans
  l'éditeur de peinture.
- **Correction** (S) : `setFrameloop("demand")` en pause, à l'arrivée et dans la vitrine
  (rotation quelques secondes après une interaction) ; retirer `backdrop-blur*` du HUD de course.
- **Statut** : confirmé ; coût : hypothèse.

#### OPT-6. Ni LOD ni coupure de distance ; `far` incohérent avec le brouillard

- **Gravité** : majeur.
- **Preuve** : `RaceScene.tsx:51` far 3200 ; `materials.ts:31` brouillard plein à 1500 ;
  `kit.ts:107-151` cases de flore de 320 m sans critère de distance : 15 cases, jusqu'à 54
  `InstancedMesh`, 1 395 à 1 472 instances, 189 000 à 218 000 triangles ; terrain d'un seul
  maillage de 96 806 triangles (pas de frustum culling possible) ; 290 000 à 460 000 triangles
  par image estimés.
- **Correction** (S) : `im.visible = dist < D[kind]` recalculé 4 fois par seconde ; `far`
  ~2000 ; (M) terrain en 16 tuiles dans `level.py` avec version simplifiée au loin.
- **Statut** : confirmé, mesuré ; part visible : hypothèse.

#### OPT-7. Cache et compression

- **Gravité** : majeur.
- **Preuve** : `next.config.ts:42` : `paths = [..., "/rt1/noumea/:path*", "/rt1/cars/:path*"]`
  (centre-ville, le-col, la-corniche et leurs `bots-*.bin` revalidés à chaque visite) ; `.bin`
  (`application/octet-stream`) non compressés par Next : `heights.bin` 151 512 o → 94 735 gzip
  → 73 670 brotli ; `level.glb` noumea 1 846 700 o → 539 491 gzip → 467 529 brotli (Next ne fait
  que du gzip, nginx n'a ni `gzip` ni `brotli` ni `http2`) ; `build.sh:47`
  `V=$(cat "$PUB"/*/* | sha1sum ...)` : un seul hash pour 18 Mo, non recalculé par `bots.ts` ;
  `public/sw.js` intercepte `fetch` sans rien cacher.
- **Impact** : ~9 requêtes conditionnelles par course sur 3 circuits sur 4 ; toute retouche
  d'un modèle invalide tout ; un `bots-*.bin` régénéré peut rester périmé une semaine sur
  noumea ; service worker réveillé à chaque requête pour rien ; app installée blanche hors
  ligne.
- **Correction** (S) : `/rt1/:path*` en `public, max-age=31536000, immutable` (URL déjà
  versionnée), hash par fichier, `/rt1/` servi par nginx avec fichiers précompressés
  (`gzip_static`/`brotli_static`) et `http2`, service worker vide ou vrai cache (M).
- **Statut** : confirmé, mesuré ; Cloudflare : hypothèse.

#### OPT-8. Barre de chargement inexacte

- **Gravité** : majeur (ressenti).
- **Preuve** : `assets.ts:107-131` poids fixes (`tracker(52)`, `glb(17, level.glb)`) ;
  `:112-113` `frac(e.loaded / e.total)` avec `e.total = 0` quand Next compresse (il retire
  `Content-Length`) ; non suivis : `loadCar`, `loadRaceSetup`, `loadBotRuns`, `trimesh()`
  (`Race.tsx:111-114`), `new Game`, `buildLevel`/`buildFlora`/`CarView`, `gl.compile`, envoi
  des textures ; `Loader.tsx:26-35` relance un rendu React à chaque image.
- **Impact** : barre figée puis saut à 100 %, puis une à plusieurs secondes de blocage à 100 %
  sur un vieil iPhone, animation du Loader gelée.
- **Correction** (S) : poids réels (taille connue au build), étape « préparation »,
  `gl.compileAsync` puis `gl.initTexture` avant `onReady`, transition CSS au lieu du rAF ; (M)
  asphalte généré au build en WebP.
- **Statut** : confirmé ; durées : hypothèse.

#### OPT-9. Divers dans la boucle

- **Gravité** : mineur.
- **Preuve** : préchargement lancé à chaque tap de circuit sans annulation ni anti-rebond
  (`Home.tsx:61-65`), progression globale remise à zéro (`assets.ts:105`) ; `Environment` de
  drei recapturé à chaque rendu de `Contents` (`RaceScene.tsx:138-140`, `children` neuf) ;
  écritures `textContent` par image sans comparaison et `game.position` qui alloue
  (`Race.tsx:386-395`, `game.ts:420-421`) ; `getBoundingClientRect` ×2 à chaque `pointermove`
  (`Race.tsx:845-852`) ; shader de l'eau à 10 `vnoise` (40 `sin`) par pixel sur un plan de
  7 km (`materials.ts:268-299`) ; `b.splits.filter(...)` par bot et par image (`game.ts:391`).
- **Correction** (S) : anti-rebond et `AbortController`, PMREM calculé une fois, écritures
  conditionnelles, rectangles en cache, eau simplifiée en palier bas.
- **Statut** : confirmé.

#### OPT-10. Véhicule et vitrine

- **Gravité** : mineur.
- **Preuve** : 24 appels de dessin pour 4 roues (6 primitives chacune), jusqu'à 7 décalques
  transparents en `MeshStandardMaterial` (`three/livery.ts:157-165`) ; `gltf.parser` (tampon
  glb + vues décodées, ~7,6 Mo) et colliders seulement masqués (`kit.ts:85`) ;
  `Showroom.tsx:29, 33` recréent `skyMaterial` et les couleurs à chaque rendu ; `CarView.dispose()`
  ne libère ni l'ombre ni sa géométrie (`kit.ts:336-341`) ; canvas procéduraux gardés au niveau
  du module (`materials.ts:66, 117`).
- **Correction** (S à M) : roues instanciées, atlas de décalques, `delete gltf.parser`,
  `dispose` des colliders, `useMemo`.
- **Statut** : confirmé.

Budget estimé par circuit à 2× : 70 à 110 appels de dessin, 290 000 à 460 000 triangles,
~77 Mo de textures + 5 à 6 Mo de géométrie + 8 à 50 Mo de tampons d'image, 4,1 à 4,3 Mo
transférés pour une première course (dont 2 Mo de JS gzip pour le menu).

### 3.5 Logique de jeu, bugs, réseau des courses en direct

#### NET-1. Une arrivée en direct envoyée sur un socket non ouvert est perdue

- **Gravité** : critique.
- **Preuve** : `lib/useRoomSocket.ts:224-227`
  ```ts
  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  ```
  `Race.tsx:332-334` appelle `online.finish(...)` une seule fois ; `spec.py:204-207` ne clôt la
  course que quand tous sont `done()`. Aucun battement de cœur : des pongs manquants ne
  déclenchent pas de reconnexion.
- **Cause racine** : message « tire et oublie », sans accusé, sans file pendant la reconnexion,
  sans renvoi au `onopen`.
- **Impact** : le pilote voit son temps, le serveur le classe abandon 30 s après le premier
  arrivé : ni gain ni record, « non compté ». Reproduction : basculer du Wi-Fi à la 4G 1 à 2 s
  avant la ligne.
- **Correction** (M) : garder le dernier `finish` dans une ref, le renvoyer à chaque `onopen` et
  à chaque vue tant que `players[mySeat].time_ms === null` ; `finish` idempotent côté serveur ;
  reconnexion après deux pongs manqués.
- **Statut** : confirmé ; socket « zombie » iOS : hypothèse.

#### NET-2. Recharger ou « Reprendre » en course relance une course neuve, chrono à 0

- **Gravité** : critique.
- **Preuve** : `online/TablePage.tsx:211-220` monte la course dès `view.status === "playing"`
  avec `startAt = clock.current.local(view.start_at)` ; `sim/race.ts:83-86` : si ce moment est
  passé, `phase = "racing"; time = 0`. `sim/online.ts:41` : `if (d.length < 9 || d[0] <= this.last) return;`
  les nouvelles poses (t repart de 0) sont rejetées par les autres. Le retour navigateur
  n'envoie pas `dnf` ni `forgetTable`, donc « Reprendre » mène au même cas.
- **Impact** : « Recommencer » gratuit en direct malgré la doc ; pilote invisible pour les
  autres ; Safari qui décharge un onglet WebGL en arrière-plan produit ce rechargement.
- **Correction** (M) : au montage tardif, `race.time = (Date.now() − startAt)/1000` ; ou
  remontage refusé avec « Abandonner » seul ; `dnf` au `pagehide` si la course n'est pas finie.
- **Statut** : confirmé ; déchargement d'onglet iOS : hypothèse.

#### NET-3. En direct, le temps classé est le temps simulé local

- **Gravité** : majeur (équité).
- **Preuve** : `RaceScene.tsx:122` `if (!pausedRef.current) game.update(dt);` avec
  `Race.tsx:164` `paused = menu || !ready` (le menu pause reste disponible en direct,
  `:564-585`) ; `game.ts:302` plafonne le pas à 0,1 s ; `game.ts:285` `this.acc = 0` à chaque
  remise en piste ; `spec.py:166-186` ne compare pas `time_ms` à l'heure du serveur ; rivaux
  dessinés au temps local avec 6 s de tampon (`online.ts:16, 57`).
- **Impact** : ouvrir le menu, passer en arrière-plan ou tourner à moins de 10 i/s gèle son
  chrono ; après une pause de plus de 6 s, un rival reste figé et la place affichée est fausse.
- **Correction** (M) : en direct, ne pas figer la simulation (le menu n'est qu'un calque) et
  compter `time = (Date.now() − startAt)/1000` ; serveur : `time_ms ≥ (now − start)·1000 −
  tolérance`. Règle aussi le retardataire au départ décrit par la doc.
- **Statut** : confirmé.

#### NET-4. En direct, l'effet d'initialisation de la scène est rejoué à chaque vue reçue

- **Gravité** : majeur.
- **Preuve** : `TablePage.tsx:275` `onReady={() => setSceneReady(true)}` (fonction recréée à
  chaque rendu) → `Race.tsx:373-380` (`useCallback` dépendant de `onSceneReady`) →
  `RaceScene.tsx:104-114` : `rig.snap(game); ... gl.compile(scene, camera); onReady();` avec
  `onReady` dans les dépendances.
- **Impact** : à chaque diffusion d'état (arrivée, déconnexion, abandon, voiture adverse
  chargée), caméra recalée d'un coup et recompilation en pleine course. En solo, `PlayPage`
  passe un `useCallback` stable, donc pas d'effet.
- **Correction** (S) : `useCallback` dans `TablePage`, `onReady` appelé via une ref.
- **Statut** : confirmé ; à-coup visible : hypothèse.

#### NET-5. Course close côté serveur sans signal, décompte figé

- **Gravité** : majeur.
- **Preuve** : `spec.py:168-169` refuse `finish` hors `PLAYING` ; `socket.error` n'est affiché
  que par `Lobby.tsx:150` ; `Race.tsx:734` affiche `view.finish_deadline` calculé à l'envoi de
  la vue (`spec.py:329`) sans décompte local.
- **Impact** : le dernier pilote roule dans une course close et ne l'apprend qu'à la ligne
  (« non compté ») ; le « 30 s » ne bouge pas.
- **Correction** (S) : bandeau « course terminée » et arrêt quand `view.status === "finished"`,
  échéance absolue (heure serveur) décomptée localement.
- **Statut** : confirmé.

#### LOG-1. File hors ligne : double paiement

- **Gravité** : majeur.
- **Preuve** : `rt1/api.ts:258-268` : sur erreur réseau, l'arrivée est gardée puis renvoyée
  (`:271-290`) ; `lib/api.ts:35` `AbortSignal.timeout(15000)` ; `service.py:130-143` paie à
  chaque appel sans identifiant.
- **Impact** : requête écrite côté serveur mais réponse perdue (courant en 4G) : « gardé pour
  plus tard », puis renvoi et second paiement (50 F, prime des bots, +1 course finie).
- **Correction** (M) : identifiant de course unique (le ticket de SEC-1), contrainte unique.
- **Statut** : confirmé.

#### LOG-2. Médailles communes à tous les véhicules

- **Gravité** : majeur (règle mal conçue).
- **Preuve** : `circuits.ts:23` (`author: 47`), `rules.py:12-17` ; en-têtes des
  `bots-*.bin` : à noumea, sportive 42,1 s (×0,87), supercar 36,8 s (×0,76), F1 30,7 s (×0,64) ;
  F1 à ×0,61 au Col ; l'atelier ajoute 5 à 9 %. Missions `author`, `three-golds`, `all-gold`
  (`rules.py:176-178`).
- **Impact** : dès la sportive (11 000 F, niveau 4), l'auteur est à la portée d'un pilotage de
  pilote automatique ; 18 400 F de médailles et 9 000 F de missions deviennent automatiques ; le
  classement se résume au prix du véhicule.
- **Correction** (M) : seuils par véhicule (× le `ratio` déjà présent dans chaque
  `bots-*.bin`), ou par classe d'indice ; à défaut, missions « médaille avec IP ≤ X ».
- **Statut** : confirmé, mesuré.

#### LOG-3. Un record envoyé sans fantôme efface l'ancien

- **Gravité** : majeur.
- **Preuve** : `service.py:161-162` (`rec.ghost = ghost`) ; `Race.tsx:236`
  (`ghost: best && game.lastLap ? ... : undefined`) ; `race.ts:111` met à jour le record local
  même si l'envoi a échoué.
- **Impact** : record serveur 55 s ; tour en 50 s dont l'envoi échoue (record local 50 s) ; tour
  en 52 s envoyé sans fantôme (pas un record local) : le serveur l'enregistre avec
  `ghost = None`. « Défier » disparaît, le joueur ne revoit plus son fantôme.
- **Correction** (S) : envoyer le fantôme dès que `t < record serveur connu` (ou toujours) ;
  côté serveur, garder l'ancien fantôme plutôt que rien.
- **Statut** : confirmé.

#### LOG-4. Bugs mineurs de course

- **Gravité** : mineur.
- **Preuve et impact** :
  - `Race.tsx:329` compare en secondes flottantes, le serveur en ms (`rules.py:98`) : à
    49,5004 s, écran « argent », gains « or ».
  - `game.ts:220` : après un record contre les bots, un fantôme apparaît au « Recommencer »
    (doc : « sans fantôme »).
  - `PlayPage.tsx:69-73` : `ghostCar` fixé au chargement, un nouveau record en F1 est dessiné
    avec le modèle du kart précédent.
  - `race.ts:97` ne teste que la porte suivante, `game.ts:378` fait tomber la place à la
    dernière : checkpoint manqué sans aucun signal, ligne d'arrivée inerte.
  - `Race.tsx:246-249` : sons d'argent et de niveau qui tombent dans le décompte suivant après
    un « Recommencer » pendant l'envoi.
  - `ghost.ts:33-34` suppose 20 Hz, les bots sont à 10 Hz (index de départ doublé puis reculé,
    coût faible) ; `decodeGhost` coupe à 4 octets, pas à 32 : NaN possibles.
- **Correction** (S) : comparaison en ms, test `!this.bots.length`, `ghostCar` recalculé,
  bandeau « checkpoint manqué » quand `lineIdx` dépasse `gateIdx[next]`, vérifier `id`,
  cadence en paramètre, coupe à 32 octets.
- **Statut** : confirmé.

#### LOG-5. Salon et classement en direct

- **Gravité** : mineur.
- **Preuve et impact** :
  - `spec.py:113-119, 159-164` : « prêt » et changement de circuit se croisent, départ possible
    avant chargement.
  - `TablePage.tsx:155` : `setup` non envoyé si `/me` est lent (`flushPending`), donc départ
    sans atelier, record étiqueté « starter » (`spec.py:58`).
  - `spec.py:237-243` : égalité départagée au numéro de siège, alors que le classement général
    départage au premier signé.
  - `rules.py:91` : arrondi bancaire de Python (3 pilotes : 220 F au lieu de 230).
  - `rooms/router.py:692-702` : `relay_busy` reste vrai jusqu'à 5 s sur l'ancien socket d'un
    siège reconnecté, qui ne reçoit aucune pose pendant ce temps.
  - `Garage.tsx:164-179` affiche encore atelier et peinture « Arrive ensuite » avec un cadenas.
  - L'indice de performance ignore traînée et freins ; le réglage appui −1 baisse l'IP et la
    traînée, ce qui contourne « Petit budget » (`tuning.ts:227-231`).
- **Correction** (S) : `ready` porteur du circuit, « Prêt » bloqué tant que `setup` n'est pas
  accusé, départage à l'heure d'arrivée serveur, `round` explicite, `relay_busy` remis à zéro
  au remplacement du socket, texte du garage, indice avec traînée.
- **Statut** : confirmé.

#### LOG-6. Coupes de circuit

- **Gravité** : hypothèse.
- **Preuve** : sur le-col (sans murs, 5 s pour revenir), la ligne droite entre portes fait 219
  à 269 m contre 268 à 323 m par la route ; sur centre-ville, cp0 → cp1 fait 107 m en ligne
  droite contre 207 m. Avec le mur droit traversable, une coupe de moins de 3 s ne déclenche pas
  la remise en piste. Relief et bâtiments non vérifiés.
- **Correction** : rejouer après correction des murs ; si besoin, portes intermédiaires ou
  distance minimale parcourue.
- **Statut** : hypothèse.

Sain : départ 22 m avant la ligne sur les 4 circuits ; `place()` recopie la position dans
`prevPos`, donc une téléportation ne franchit pas de porte ; aucun tracé ne revient près de
lui-même (fenêtre idx−8..idx+20 sûre) ; paiement en direct unique (`stats_recorded` sous
verrou) ; fourchettes des bots, coûts de l'atelier, paliers de niveau et 16 missions cohérents
avec la doc et les textes.

### 3.6 Axes ajoutés

Pourquoi ces axes : le mode en direct existe et n'a jamais été joué à deux téléphones alors
qu'iOS coupe le WebSocket en arrière-plan ; sur iPhone, appel, verrouillage et manque de
mémoire sont la norme ; un record perdu est le pire bug d'un jeu de chrono ; les contrôles sont
la moitié du ressenti de la physique ; certains écrans n'ont jamais été vus sur un SE en
paysage ; le pipeline d'assets masque ses erreurs et le travail n'est pas sauvegardé.

#### BLD-1. Travail non commité : un commit partiel casse la production

- **Gravité** : critique.
- **Preuve** : `git status` : 44 fichiers modifiés (+2 323 / −462) et une soixantaine de
  chemins non suivis, dont `backend/app/games/rt1/` et les migrations 0007 à 0009 ;
  `git diff backend/app/games/registry.py` ajoute `from app.games.rt1.spec import Rt1Race`
  alors que `backend/app/games/rt1/` n'est pas suivi ; `Race.tsx` (suivi) importe `./api` et
  `./circuits` (non suivis) ; `deploy.sh:7` fait `git pull`.
- **Impact** : `git commit -a` fait planter le backend au déploiement ; un disque perdu efface
  des semaines de travail.
- **Correction** (S) : commits par lots cohérents sur une branche, tout de suite.
- **Statut** : confirmé.

#### BLD-2. Aucun test RT1, pas de CI

- **Gravité** : majeur.
- **Preuve** : `git ls-files backend/app/games` : tests pour chess, goulag, perudo,
  nine_to_one ; rien pour rt1 ; pas de lanceur de tests front ; pas de `.github/`. Résultats des
  outils (lancés sans écrire) : `tsc --noEmit --incremental false` 0 erreur ; `eslint` 64
  problèmes, tous dans `public/stockfish/stockfish-19-lite-single.js` (fichier tiers à ignorer),
  0 dans RT1 ; `ruff check --no-cache` OK.
- **Correction** (M) : parité `rules.py` ↔ `circuits.ts`/`vehicles.ts`/`tuning.ts` via un JSON
  exporté ; `ghost` encode/decode ; `race.ts` (portes, tours, écarts, décompte) ; `spec.py`
  (prêt, départ, arrivée, échéance, abandon) ; `service.finish` (gains, missions) ; file hors
  ligne. À noter : `Math.round` (JS) et `round` (Python, bancaire) diffèrent sur les x,5 ; aucun
  prix actuel ne tombe dessus.
- **Statut** : confirmé.

#### BLD-3. Pipeline d'assets non reproductible

- **Gravité** : majeur.
- **Preuve** : `build.sh:12` : `... | grep -E "..." || true` masque tout échec de Blender puis
  copie l'ancien `.out` (40 Mo, ignoré par git) ; `:7` Blender dans `$HOME/.local/opt` ; `:31`
  `npx -y @gltf-transform/cli@4.5.0` téléchargé à chaque lancement ; `:47` version globale.
- **Correction** (S à M) : statut de sortie vérifié, outil en devDependency lancé par
  `pnpm exec`, hash par fichier, copie de ce qui a changé seulement.
- **Statut** : confirmé.

#### BLD-4. Ordre du déploiement, pas de retour arrière

- **Gravité** : majeur.
- **Preuve** : `deploy.sh:11-12` (`uv run alembic upgrade head`) avant le build du front et le
  redémarrage (`:44`) : l'ancien backend tourne plusieurs minutes sur le nouveau schéma ;
  `.next-old` conservé mais jamais remis en place ; pas de `downgrade`.
- **Correction** (S) : migrations compatibles ou appliquées juste avant le redémarrage ;
  `rollback.sh` (`mv .next-old .next`, `git checkout` du commit précédent).
- **Statut** : confirmé.

#### VIE-1. Pas de pause en arrière-plan

- **Gravité** : majeur.
- **Preuve** : `PlayPage.tsx:104-107` ne réagit à `visibilitychange` que pour le wake lock ;
  `Race.tsx` n'écoute ni `visibilitychange`, ni `pagehide`, ni `freeze` ; au retour, rAF repart
  et `game.update` reprend aussitôt.
- **Impact** : après un appel, Siri ou le centre de contrôle, la voiture repart seule.
- **Correction** (S) : `setMenu(true)` quand la page est cachée en solo ; en direct, voir NET-3.
- **Statut** : confirmé.

#### VIE-2. Rechargement automatique de version en pleine course solo

- **Gravité** : majeur.
- **Preuve** : `components/MaintenanceGate.tsx:55` `const isTablePath = (pathname) => pathname.includes("/table/");`
  et `:121-128` : `reloadForUpdate()` pour toute autre page, dont `/rt1/play` et
  `/rt1/garage/peinture` ; état interrogé toutes les 20 s.
- **Impact** : page rechargée en plein tour, record en cours et peinture non enregistrée perdus.
- **Correction** (S) : exempter `/rt1/play` et la peinture avec modifications ; recharger au
  changement de page.
- **Statut** : confirmé.

#### VIE-3. Perte du contexte WebGL

- **Gravité** : majeur.
- **Preuve** : `RaceScene.tsx:111-113` n'écoute que `webglcontextrestored` (pour `rig.snap`) ;
  rien sur `webglcontextlost` ; `Environment frames={1}` (`:138`) calculé une fois. Three gère
  le `preventDefault` et la restauration de son état, pas la scène.
- **Impact** : la simulation continue pendant l'écran noir ; à la restauration, reflets noirs.
- **Correction** (M) : pause et message à la perte ; scène remontée à la restauration (`key`
  sur le Canvas).
- **Statut** : absence de gestion confirmée ; rendu restauré : hypothèse.

#### VIE-4. Divers

- **Gravité** : mineur.
- **Preuve** : pas de `app/rt1/**/error.tsx` (écran générique `Crash.tsx` avec « Recharger »,
  boucle possible sur un iPhone sans mémoire) ; wake lock gardé sans limite en pause et à
  l'arrivée (`PlayPage.tsx:94-119`, `TablePage.tsx:99-122`) ; sur iOS avant 18.4 en app
  installée, le wake lock peut ne pas fonctionner.
- **Correction** (S) : écran d'erreur RT1, relâcher le wake lock après 60 s d'inactivité.
- **Statut** : confirmé ; wake lock iOS : hypothèse.

#### SAV-1. Records perdus pendant un déploiement ou quand la session expire

- **Gravité** : majeur.
- **Preuve** : `lib/api.ts:39-47` : tout statut non-2xx devient `ApiError` (502/504 de nginx,
  503 de maintenance, 401 compris) ; `rt1/api.ts:262` `if (e instanceof ApiError || !body.ghost) throw e;`
  (file seulement sur erreur réseau) ; `:285-286` `if (!(e instanceof ApiError)) left.push(p);`
  (file purgée sur toute `ApiError`).
- **Cause racine** : « serveur indisponible » et « jeton expiré » confondus avec « refusé ».
- **Impact** : record avec fantôme fait pendant un redémarrage du serveur définitivement perdu.
- **Correction** (S) : garder en file sur 401, 429 et 5xx ; ne supprimer que sur les autres 4xx.
- **Statut** : confirmé.

#### SAV-2. Divers sauvegarde

- **Gravité** : mineur.
- **Preuve** : arrivées sans record jamais mises en file (`api.ts:262`, `!body.ghost`), donc 50 F
  et progression « 25 courses » perdus avec un message d'échec ; anciens records supprimés du
  téléphone avant `writePending` qui peut échouer (`:313-316`), et attribués au premier profil
  chargé ; vidange concurrente qui écrase un ajout (`:275-289`) ; caméra mémorisée globalement
  (`Race.tsx:43`) alors que la doc promet « par véhicule », et pas de vue « proche/loin ».
- **Correction** (S) : file pour toute arrivée, ordre inversé, relecture avant écriture, clé par
  véhicule.
- **Statut** : confirmé.

#### CTL-1. Impossible de glisser du gaz au frein

- **Gravité** : majeur.
- **Preuve** : `Race.tsx:855-869` : chaque pédale fait `setPointerCapture` sur `pointerdown` ;
  un pouce qui glisse reste attaché au gaz.
- **Impact** : pour freiner il faut lever puis reposer le pouce, contre le geste naturel.
- **Correction** (S) : une seule zone à droite qui choisit la pédale la plus proche, comme la
  zone de direction (`:836-853`).
- **Statut** : confirmé.

#### CTL-2. Direction tout-ou-rien, ni inclinaison ni accélération automatique

- **Gravité** : majeur.
- **Preuve** : `sim/input.ts:20` : `steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: gas ? 1 : 0` ;
  `menu/Profile.tsx:80` affiche « Boutons (inclinaison bientôt) » ; aucune occurrence de
  `DeviceOrientation`. La physique accepte déjà une direction continue (`car.ts:218-221`).
- **Impact** : pas de dosage, aucune option pour jouer d'une main.
- **Correction** (M) : curseur de direction (position du doigt dans la zone gauche) ;
  accélération automatique en option ; inclinaison ensuite (`requestPermission()` au tap sur
  « Rouler », axes adaptés au rendu tourné).
- **Statut** : confirmé.

#### CTL-3. Divers contrôles

- **Gravité** : mineur.
- **Preuve** : deux doigts dans la zone de direction, lever l'un coupe tout (`Race.tsx:839-843,
  883`) ; état visuel des pédales jamais remis à zéro après `input.clear()` (`:368-371`,
  `input.ts:50`) ; boutons du HUD ~40 px (`:818`) avec « Recommencer » collé à « Menu » sans
  confirmation (`:436-443`) ; pas d'Échap, pas de manette ; `lib/sound.ts:301-307` `vibrate()`
  jamais appelé par RT1 (promesse Android). Latence correcte : `input.read()` à chaque pas.
- **Correction** (S) : suivi par `pointerId`, signal de remise à zéro, cibles de 44 px, Échap,
  vibrations aux checkpoints et boosts.
- **Statut** : confirmé.

#### CTL-4. Gestes système d'iOS près des pédales

- **Gravité** : hypothèse.
- **Preuve** : pédales collées aux coins bas (`Race.tsx:875, 893`), zone de direction au bord
  gauche ; `touch-action: none` n'empêche ni le retour par balayage depuis le bord ni la barre
  d'accueil.
- **Correction** (S) : décaler les pédales, confirmer la sortie de course.
- **Statut** : hypothèse.

#### UI-1. « Réduire les animations » laisse le « Top ! » à l'écran

- **Gravité** : majeur.
- **Preuve** : `Race.tsx:511` `onAnimationEnd={() => setBanner(null)}` ; `:664`
  `@media (prefers-reduced-motion: reduce) { [class*="rt1-pop"] { animation: none !important } ...`.
- **Cause racine** : avec `animation: none`, `animationend` n'arrive jamais.
- **Correction** (S) : minuteur de secours, ou animation d'opacité très courte.
- **Statut** : confirmé.

#### UI-2. Le manifest force le portrait

- **Gravité** : majeur.
- **Preuve** : `app/manifest.ts:11` `orientation: "portrait"`.
- **Impact** : sur Android, l'app installée reste en portrait et la course tourne son rendu ;
  sur iPhone, respect à vérifier.
- **Correction** (S) : `"any"` (touche toute la plateforme ; les menus s'adaptent).
- **Statut** : confirmé pour Android ; iOS : hypothèse.

#### UI-3. Éditeur de peinture en paysage sur petit écran

- **Gravité** : majeur.
- **Preuve** : `menu/Paint.tsx:114` `h-[30vh] min-h-44` dans un bandeau collé en haut avec
  retour et onglets ; `:191` barre fixe en bas. À ~320 px de haut, la zone défilante du Shell
  fait ~200 px pour un bandeau de ~270.
- **Correction** (M) : vitrine à gauche et réglages à droite en paysage.
- **Statut** : tailles confirmées ; rendu : hypothèse.

#### UI-4. Divers interface

- **Gravité** : mineur.
- **Preuve** : panneau d'arrivée ~576 px (`Race.tsx:519-521` : `min-w-[13rem]`, `pr-6`,
  `gap-6`, `min-w-[16rem]`, `px-8`) pour 568 px sur un SE en paysage ; menu pause sans
  défilement (`:566`) ; cibles de 26 à 32 px (`Online.tsx:143`, `Workshop.tsx:86`,
  `Paint.tsx:250`, `BotsSheet.tsx:79`), libellés d'onglets en 10 px (`Shell.tsx:84`) ; ligne du
  classement ~276 px pour ~256 disponibles à 320 px (`Online.tsx:128-149`) ; panneau des bots
  sans défilement (`BotsSheet.tsx:39`) ; sens du rendu tourné choisi à la main dans le menu pause
  (`Race.tsx:631-648`), une chance sur deux d'être à l'envers ; pas d'écran « tourne ton
  téléphone », une phrase sur le Loader (`Loader.tsx:93`) ; rotation physique en course non mise
  en pause (`:209-213`) ; contraste des écarts ~3,8 sur `#2F7BFF`/`#F2433A`, libellé du
  checkpoint en 11 px sans fond (`:457, 465`). Note positive : la rotation à 90° et ses zones
  sûres sont justes (`:50-58`), les doigts en coordonnées écran aussi.
- **Correction** (S) : largeurs revues, défilement, cibles de 44 px, sens déduit de
  l'accéléromètre ou choisi sur le Loader, pause à la rotation.
- **Statut** : hypothèse pour le rendu, confirmé pour les tailles.

#### AUD-1. Audio

- **Gravité** : mineur.
- **Preuve** : `engineSound.ts:115-137` crée deux sources en boucle infinie (pneus, vent) que
  `stop()` (`:170-180`) n'arrête jamais ; `:84-85` `const ctx = audio(); if (!ctx) return;` :
  si la course démarre son coupé, le moteur reste muet jusqu'à la course suivante (`Race.tsx:358-367`
  ne le crée qu'une fois) ; `Race.tsx:164` : le moteur tourne sur l'écran d'arrivée ; aucun
  `visibilitychange` (bourdonnement onglet caché sur ordinateur, état « interrupted » iOS géré
  seulement au geste suivant, `lib/sound.ts:136-143`) ; 9 `setTargetAtTime` par image ; ni
  musique, ni son de passage de vitesse, ni crissement par surface ; aucun `navigator.audioSession`
  (muet avec le bouton silencieux, non documenté) ; `SoundToggle` sans `aria-pressed`.
- **Correction** (S ; musique M) : arrêter les sources, nœuds créés même son coupé (gain 0),
  `hush` à l'arrivée et en arrière-plan, mise à jour à 30 Hz par seuil, choix explicite
  `audioSession`, réglages séparés musique/effets.
- **Statut** : confirmé ; iOS : hypothèse.

#### A11Y-1. Accessibilité

- **Gravité** : mineur.
- **Preuve** : pédales `div aria-label` sans rôle (`Race.tsx:886-897`) ; menu pause, écran
  d'arrivée et panneau des bots sans `role="dialog"`, focus ni Échap (`:564`,
  `BotsSheet.tsx:32`) ; écart nul affiché « +0.000 » en bleu (`e.delta <= 0`) ; pastilles de
  couleur annoncées par leur hexa (`Paint.tsx:255`) ; `MedalIcon` en `aria-hidden` sans texte
  (`Home.tsx:130`) ; élargissement du champ au boost (`kit.ts:625-626`) et inclinaison en moto
  (`:611`) ignorent la réduction des animations ; `motion` sans `reducedMotion="user"`. Point
  positif : signe et son doublent la couleur de l'écart.
- **Correction** (S) : rôles, focus, labels, respect de `prefers-reduced-motion`.
- **Statut** : confirmé.

#### I18N-1. Internationalisation

- **Gravité** : mineur.
- **Preuve** : `Garage.tsx:45`, `Workshop.tsx:38`, `Paint.tsx:99` affichent
  `tr(T).online.failed` (« Classement indisponible. ») pour un achat qui échoue ; ligne
  technique en français en dur (`Race.tsx:402`) ; guillemets français en anglais
  (`Paint.tsx:344`) ; `v.toFixed(1)` donne « 0.5 » en français (`Workshop.tsx:143`) ; « 0
  driver » en anglais (`i18n.ts:469, 514`) ; `missions` et `vehicles` typés `Record<string, …>`,
  ce qui annule le contrôle des clés.
- **Correction** (S).
- **Statut** : confirmé.

#### CODE-1. Qualité du code

- **Gravité** : mineur.
- **Preuve** : `Race.tsx` 911 lignes (rotation, préférences, envoi serveur, événements, HUD,
  arrivée, classements, gains, pédales) ; constantes recopiées front/back sans test de parité
  (médailles, prix, coûts, `MAX_PILOTS = 8` en dur dans `Lobby.tsx:21`) ; ~12 assertions non
  nulles, 11 `eslint-disable react-hooks/set-state-in-effect`, propriétés ajoutées à la main sur
  des nœuds audio ; `GhostView`, `BotsView`, `rivalViews` sans `dispose` (`RaceScene.tsx:78-95`) ;
  `Wordmark`, `Soon`, `Tabs` de RT1 supprimés mais `vibrate()` mort.
- **Correction** (M) : découpage `useRacePrefs`, `useFrameOrientation`, `FinishPanel`, `Pads` ;
  test de parité ; `dispose`.
- **Statut** : confirmé.

---

## 4. Désaccords avec `docs/rt1/README.md`

Choix que je conteste :

- **« Pas d'anti-triche au départ, les temps sont crus. »** Acceptable seulement si le jeu est
  fermé côté serveur, n'écrit pas dans les stats communes et si les classements sont remis à
  zéro à l'ouverture. Aucune des trois conditions n'est remplie (SEC-2, SEC-4, SEC-3). Un ticket
  de départ et des planchers coûtent quelques heures et ne demandent aucun rejeu.
- **« Anti-triche plus tard par rejeu serveur des commandes, donc physique déterministe. »**
  Irréaliste avec cette physique : V8 contre JavaScriptCore, `Math.pow`/`hypot`, build Rapier non
  déterministe, commandes non enregistrées (PHY-11). Je propose des bornes serveur (ticket,
  plancher, cohérence des passages, vitesse moyenne) et une validation statistique plutôt qu'un
  rejeu au bit près.
- **« KTX2 si la mémoire vidéo devient juste. »** Elle l'est déjà sur un iPhone à 2 ou 3 Go
  (OPT-1).
- **« Médailles calées sur la citadine ; pas de classes de performance. »** Pas de classes en
  ligne, soit ; mais des médailles communes vident la campagne de son sens dès le 7e véhicule
  (LOG-2). Des seuils par véhicule ne sont pas des classes.
- **« Avec murs : infranchissables ; passé par-dessus (saut), remise en piste au bout de 3 s. »**
  Cette règle décrit le bug (PHY-1). Un mur de jeu de course doit guider, pas trier.
- **« Physique en pas fixe, découplée de l'affichage »** et **décor sans lumière temps réel** :
  bons choix, à garder. Le second impose une sonde de lumière pour les objets mobiles (GFX-8).
- **« Sans murs (régions nature, à venir) »** : le-col, à Nouméa, l'est déjà.

Promesses non tenues, à faire ou à retirer de la doc : inclinaison du téléphone, accélération
automatique, vibrations Android, caméra proche/loin mémorisée par véhicule, musique, passage de
vitesse, crissement selon la surface, une ombre dynamique, qualité réglable à la main, ombres et
végétation adaptatives, LOD, découpage du décor par zones, chargement par région, atlas
partagés, poussière, embruns, traces de pneus, lagon transparent, écran « tourne ton
téléphone », « ~1 s en l'air » aux sauts (1,6 s en F1), boost « +30 % » (+19 à +24 % réels
sur 1,4 s), classement du hub « caché tant que le jeu est en développement » (le total « Tous
les jeux » compte RT1), « bots sans fantôme » (un fantôme apparaît après un record), « pas de
Recommencer en direct » (contourné par un rechargement), circuits « débloqués » (tous ouverts).

---

## 5. Plan de correction par phases

Chaque phase attend ton feu vert. Dépendances : toute modification de `level.py` impose une
régénération Blender des 4 circuits puis `pnpm rt1:bots` ; les changements de générateur sont
regroupés en une seule phase. Tout changement de physique invalide bots et médailles : la
calibration vient en dernier. `lib/useRoomSocket.ts`, `components/MaintenanceGate.tsx`,
`rooms/*` et `manifest.ts` sont partagés avec les autres jeux.

### Phase 0. Sécuriser (S, aucun changement de comportement)

- BLD-1 : commits par lots cohérents sur une branche. BLD-3 : `build.sh` qui échoue vraiment.
- Banc de mesure des murs et contrôle « terrain sous la route » versés au dépôt
  (`frontend/assets/rt1/`, scripts `pnpm`) ; premiers tests de parité `rules.py` ↔ front.
- Fichiers : `build.sh`, `package.json`, nouveaux scripts et tests.
- Risque : nul.
- Vérification : clone neuf qui démarre, `uv run pytest`, banc qui reproduit 46 % de traversées.

### Phase 1. Murs, sans régénérer les circuits (S)

- PHY-1 (drapeau deux faces), PHY-2 (groupes de collision, normale des rayons), PHY-7, PHY-8,
  PHY-13.
- Fichiers : `sim/game.ts`, `sim/car.ts`.
- Risque : comportement près des murs modifié, tours des bots à régénérer.
- Vérification : banc sous 1 % de sorties, temps du pilote automatique inchangés à 0,5 % près,
  essai sur iPhone le long des deux murs.

### Phase 2. Serveur, avant toute ouverture (M)

- SEC-2, puis SEC-1, SEC-3, SEC-4, LOG-1 (ticket de départ, planchers, bornes, idempotence),
  SEC-5 à SEC-8, LOG-3, LOG-5 (partie serveur).
- Fichiers : `backend/app/games/rt1/*`, `rooms/manager.py`, `rooms/router.py`,
  `frontend/src/games/rt1/api.ts`, `Race.tsx`. Une migration (tickets) : soumise avant.
- Risque : refuser des arrivées honnêtes (tolérances), `rooms/*` partagé.
- Vérification : tests pytest nouveaux ; scénarios `curl` de l'audit qui échouent désormais.

### Phase 3. Courses en direct, cycle de vie, sauvegarde (M)

- NET-1 à NET-5, VIE-1 à VIE-3, SAV-1, SAV-2, OPT-7 (cache), UI-2.
- Fichiers : `lib/useRoomSocket.ts`, `components/MaintenanceGate.tsx`, `online/TablePage.tsx`,
  `Race.tsx`, `three/RaceScene.tsx`, `sim/race.ts`, `sim/game.ts`, `spec.py`, `next.config.ts`,
  `manifest.ts`, `public/sw.js`.
- Risque : régression sur les autres jeux via le socket et la porte de maintenance.
- Vérification : scénarios à deux téléphones de la section 6.

### Phase 4. Générateur de circuits, une seule régénération (M à L)

- PHY-1 durable (murs épais, hauts, orientés), PHY-3, PHY-4, PHY-6, PHY-12, GFX-1, GFX-3,
  GFX-4, GFX-5, GFX-9, GFX-11 ; en option OPT-6 (terrain en tuiles) et OPT-1 (KTX2).
- Fichiers : `assets/rt1/level.py`, `common.py`, `circuits.py`, `build.sh`, `sim/level.ts`,
  `sim/game.ts`, `sim/colliders.ts`, `three/kit.ts`, les 4 dossiers de `public/rt1/`.
- Risque : le plus élevé (cuisson complète, aspect des lightmaps, hauteurs modifiées).
- Vérification : assertions du build (0 sommet percé, normales des colliders), banc des murs à
  0, captures `?photo` avant/après aux mêmes points, `pnpm rt1:bots` qui passe.

### Phase 5. Rendu des véhicules et étalonnage (M)

- GFX-2, GFX-6, GFX-7, GFX-8, GFX-10, GFX-12.
- Fichiers : `three/kit.ts`, `three/RaceScene.tsx`, `three/materials.ts`, `three/livery.ts`,
  `assets/rt1/vehicles.py`, `car.py`.
- Risque : moyen (aspect général).
- Vérification : captures comparées, `?debug` sur iPhone.

### Phase 6. Performance et mémoire iPhone (M)

- OPT-1 à OPT-6, OPT-8 à OPT-10 : paliers de qualité, gouverneur, réglage manuel, import
  dynamique de Rapier, rendu à la demande hors course, coupure de la flore, `ImageBitmap`.
- Fichiers : `three/RaceScene.tsx`, `three/kit.ts`, `three/Showroom.tsx`, `assets.ts`,
  `sim/game.ts`, `Race.tsx`, `Loader.tsx`, `menu/*`.
- Risque : moyen.
- Vérification : mesures de la section 6 sur au moins deux iPhone.

### Phase 7. Conduite et contrôles, puis calibration (M à L)

- PHY-5, PHY-9, PHY-10, CTL-1 à CTL-3, puis `pnpm rt1:bots`, LOG-2 (médailles par véhicule),
  LOG-4, LOG-6, remise à zéro des records de dev.
- Fichiers : `sim/car.ts`, `sim/game.ts`, `sim/input.ts`, `Race.tsx`, `circuits.ts`,
  `rules.py`, `sim/bots.ts`.
- Risque : élevé sur le ressenti ; à régler avec toi, véhicule par véhicule.
- Vérification : banc (0 tonneau au frôlement, envol max < 1 m hors sauts), essais sur iPhone.

### Phase 8. Finitions (S à M)

- UI-1, UI-3, UI-4, AUD-1, A11Y-1, I18N-1, CODE-1, BLD-2 (suite des tests), BLD-4, SEC-9,
  SEC-10, VIE-4, mise à jour de `docs/rt1/README.md`.

---

## 6. Ce que je n'ai pas pu vérifier sans appareil, et tes tests sur iPhone

Non vérifiable ici : tout rendu à l'image (Playwright n'a pas pu se connecter), le nombre de
bits du depth buffer sous WebKit, la mémoire réelle, la cadence, le coût des flous, le
comportement du socket et de l'audio en arrière-plan, les gestes système, la configuration
Cloudflare et nginx en production, les vulnérabilités connues des dépendances.

À faire toi-même, avec `/rt1/play?debug` (cadence, appels de dessin, triangles, définition),
idéalement sur un modèle ancien (A10-A11), un moyen (A12-A14) et un Pro ProMotion :

1. **Murs** : longer le mur droit puis le gauche à 50 et 150 km/h sur les 3 circuits ; saut de
   la corniche en sportive et en F1.
2. **Scintillement** : intérieur des virages relevés de chaque circuit (taches noires sur
   l'accotement), rivage au loin, plaques de boost à plus de 200 m.
3. **Ombre** : freinage fort, réception de saut, moto en virage ; passage sous un immeuble.
4. **Cadence** : au départ, en ville, face au lagon, avec 7 bots, en pause, à l'arrivée, en
   cockpit. Si un Pro affiche plus de 60 i/s, le plafond de OPT-2 est obligatoire.
5. **Mode économie d'énergie** : définition affichée après 15 s (1× attendu).
6. **Mémoire** : 5 allers-retours menu → course en changeant de circuit ; l'app se
   recharge-t-elle d'elle-même ? Web Inspector, Timeline « Memory ».
7. **Arrière-plan en course solo** : verrouillage 10 s, appel entrant, Siri ; la voiture
   repart-elle seule, le moteur revient-il, les bips du décompte sonnent-ils ?
8. **Deux téléphones** : pause de 5 s sur l'un et comparer les temps ; arrière-plan juste avant
   la ligne ; rechargement en course ; coupure Wi-Fi vers 4G à l'arrivée ; caméra quand l'autre
   franchit la ligne.
9. **Records** : en mode avion (message « gardé pour plus tard », puis renvoi au retour du
   réseau) ; pendant `systemctl restart games-backend` (perdu ?).
10. **Pédales** : glisser du gaz au frein, deux doigts à gauche, appui long (loupe, menu
    contextuel), balayage depuis le bord gauche et depuis la barre d'accueil, double tap et
    pincement sur le chrono.
11. **Réduire les animations** (Réglages > Accessibilité) : le « Top ! » reste-t-il ?
12. **iPhone SE en paysage** : écran d'arrivée avec 7 bots, menu pause, éditeur de peinture,
    panneau des bots ; en portrait à 320 px : ligne du classement, atelier, pastilles.
13. **Son** : bouton silencieux activé puis désactivé ; couper puis remettre le son en course ;
    moteur sur l'écran d'arrivée.
14. **Contexte WebGL** : ouvrir dix onglets lourds ou l'appareil photo, revenir : écran noir,
    reflets noirs, voiture qui a continué seule ?
15. **Chauffe** : 10 min de course au réglage actuel puis 10 min à 1,5× sans MSAA ni flou,
    plafonné à 60 : cadence en fin de session et batterie.
16. **Réseau** (Web Inspector, Network) : deux visites de suite sur les 4 circuits, `304` ou
    cache mémoire, `content-encoding` de `level.glb` et `heights.bin`, `cf-cache-status`.

---

## 7. Questions ouvertes

1. Quel est le plus vieil iPhone à tenir (A10 avec 2 Go, ou A12 et plus) ? Cela fixe le
   palier bas.
2. Le jeu se joue-t-il toujours en app installée (MobileGate), ou aussi dans un onglet Safari ?
3. Murs : mur invisible haut au-dessus du muret, ou décor rehaussé (glissière, grillage) ? Et
   au choc : glisser le long du mur en perdant de la vitesse (Trackmania), ou vraie pénalité ?
4. Palier bas à 30 i/s plafonnés et stables : acceptable ?
5. Anti-triche : ticket de départ et planchers maintenant, et remise à zéro des records à
   l'ouverture ?
6. Médailles par véhicule : d'accord, ou un seul jeu de seuils ?
7. En direct : temps officiel sur l'horloge du serveur, donc pause sans effet sur le chrono ?
8. Ombre des véhicules : silhouette projetée par paliers, ou ombre de contact améliorée partout ?
9. KTX2 et terrain en tuiles alourdissent le pipeline d'assets : en phase 4 ou plus tard ?
10. Phase 0 : je peux créer une branche et commiter le travail en cours par lots ?

### Réponses (1er octobre 2026)

1. Pas de modèle minimum connu : rester réaliste pour les vieux iPhone sans se tordre pour
   les trop anciens. 2. App installée uniquement. 3. Mur invisible au-dessus du muret, et
   ralentissement au contact. 4. 30 i/s plafonnés acceptés en palier bas. 5. Anti-triche
   maintenant. 6. Un seul jeu de seuils de médailles (celui qui a beaucoup joué doit être plus
   fort, ça pousse à faire la campagne). 7. Temps officiel sur l'horloge du serveur, pause
   sans effet. 8. Ombre de contact améliorée partout. 9. KTX2 et tuiles en phase 4.
   10. Commits sur `main`, sans branche.

Phase 1 faite le même jour : banc des murs de 46 % de traversées et 9 % de passages
par-dessus à 0,1 % et 0,6 % ; tonneaux au choc toujours à 15 % (phase 7).
