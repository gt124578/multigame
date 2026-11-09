# Odyssée — audit du level design de la carte, face à HeartGold / SoulSilver

Audit de la grande région (1200 × 1392 cases, `odyssee/js/world/`), mené la nuit du 9 novembre 2026 sur la branche
`nuit-level`. Les chiffres viennent du monde construit sous Node (`buildWorld`), zone par zone ; les comparaisons avec
HGSS sont faites de mémoire (ordres de grandeur, pas un relevé exact).

Périmètre : le level design de la carte. L'histoire, les dialogues et les quêtes n'ont pas été touchés ; tous les
identifiants existants (PNJ, dresseurs, objets, portes, `lieu:…`) sont gardés : les 4 880 identifiants de la carte
d'avant sont tous là, au même contenu ; les ajouts ont les leurs (`col:…`, `mesas:…`, `ocre:…`, `<route>:eN`,
`<route>:cN`, `<route>:iN`, `<ville>:cN`).

## 1. En bref

| | avant | après cette nuit | HGSS (ordre de grandeur) |
|---|---|---|---|
| Rebords à sauter (cases, toutes routes) | 34, sur 2 routes | 553, sur 24 routes | sur presque chaque route de Johto |
| Raccourcis à sens unique | 0 | 6 (rebord dans une lisière) | 1 ou 2 par route en pente (route 45, 36, 33…) |
| Raccourcis à capacité (Coupe, Éclate-Roc, Surf) | 7 routes | 7 routes + la Grotte du Col (Surf) | partout : on rouvre l'ancien |
| Récompenses à venir chercher avec une capacité | 0 | 7 clairières derrière un arbuste (Coupe), 3 îlots d'étang (Surf) | îlots, recoins à Coupe, rochers |
| Objets cachés | 0 (le jeu ne savait pas) | 77 (35 sur les routes, 37 en ville, 1 dans les canyons, 4 en grotte) | plus d'une centaine (Cherch'Objet) |
| Panneaux sur les routes et les sentiers | 43 | 81 (bouts de route, sentiers des lieux habités) + 4 aux entrées de grottes et des canyons | à chaque entrée de route, aux carrefours |
| Dresseurs des grandes routes | 257 | 293 (+36 aux passages étroits), +3 dans les canyons, +11 en grotte | un pour 8 à 10 cases sur une route chargée |
| Grottes et donjons (cartes) | 9 | 16 (Grotte du Col, Grotte des Sables et Grotte des Crêtes sur 2 niveaux, Grotte des Mesas) | une quinzaine de grottes pour deux régions |
| Grottes qui traversent la Chaîne Céleste | 1 (Victoire) | 2 | — |
| Volcan à Cendrelune | non | oui (cratère et lave) | — |
| Sol praticable jamais atteint (nature sauvage) | 15 770 cases | 11 809 (les canyons des Hauts d'Ocre ouverts) | — |
| Clairières des lieux et des impasses | disques au bout d'un bâton | formes étirées, lobes, bouquets, sentier évasé | — |
| Décor posé hors d'atteinte (outil d'accès) | 3 problèmes | 0, « aucun problème » | — |
| Vues sur une autre zone (`test-odyssee-villes`) | 703 cases | 647 | — |

## 2. Constats chiffrés

### Les routes

22 grandes routes taillées par `grandeRoute` (chemins.js), plus 6 routes d'îles faites main. Longueur du sentier :
80 (route 1) à 450 cases (route 5) — trois à six fois une route de Johto ; 3 à 18 blocs de 24 cases.

| route | sentier | dresseurs | herbes hautes | herbes sombres | rebords avant → après | objets | cachés |
|---|---|---|---|---|---|---|---|
| r1 | 79 | 4 | 174 | 0 | 8 → 27 | 4 | 1 |
| r2 | 389 | 14 | 653 | 2 | 0 → 31 | 13 | 2 |
| Bois Murmure | 189 | 11 | 0 | 523 | 0 → 14 | 8 | 1 |
| r3 / r3e | 182 / 176 | 6 / 6 | 381 / 328 | 0 | 0 → 17 / 15 | 4 / 5 | 1 / 1 |
| r4 | 302 | 13 | 441 | 0 | 0 → 35 | 15 | 2 |
| r5 | 453 | 19 | 977 | 90 | 26 → 68 | 25 | 3 |
| r6 | 280 | 9 | 779 | 0 | 0 → 38 | 10 | 2 |
| r7 | 175 | 8 | 407 | 0 | 0 → 13 | 13 | 1 |
| r9 (Victoire) / r9b | 357 / 145 | 5 / 2 | 825 / 146 | 0 | 0 → 10 / 21 | 5 / 1 | 2 / 1 |
| r10 | 375 | 15 | 885 | 0 | 0 → 27 | 19 | 2 |
| r11 / r12 | 162 / 187 | 5 / 8 | 171 / 0 | 0 / 582 | 0 → 13 / 17 | 8 / 9 | 1 / 1 |
| r13 à r20 (Sud) | 82 à 372 | 3 à 17 | 0 à 1019 | jusqu'à 1456 | 0 → 15 à 39 | 3 à 17 | 1 à 2 |

- **Rythme.** Dresseurs : un pour 20 à 30 cases de sentier, contre un pour 8 à 10 sur une route chargée de Johto
  (route 34, route 45). Les routes sont plus longues mais pas plus denses : de longs passages sans rencontre. Les
  herbes hautes sont en carrés (bien, comme sur DS), les paysages changent par tronçons (prairie, étang, rochers,
  rivière, butte), les impasses sont récompensées (94 clairières au bout d'un sentier latéral).
- **Rebords.** C'était le plus gros manque : 34 cases de rebord sur deux routes. Dans HGSS, le rebord est l'outil de
  base du rythme : il fait descendre vite (vers la ville suivante ou de retour), il oblige à contourner en montant,
  il cache des recoins. Corrigé cette nuit (voir 4).
- **Objets cachés.** Aucun : le moteur ne connaissait que les Poké Balls posées. Dans HGSS, fouiller est un réflexe
  (souches, rochers, bouts d'impasse, poubelles en ville). Corrigé cette nuit pour les routes, les villes et les
  grottes, sans toucher au moteur (un objet caché est un `W.object` qu'on fouille, drapeau `I:<id>` des objets posés).
- **Obstacles à capacité.** Coupe : 13 cases (dont la porte de Floralia), Éclate-Roc : 20 (dont la passe de la route
  11), Force dehors : 5 rochers, Surf : 2 raccourcis. Peu, et toujours dans le sens « on rouvre un raccourci de la
  même route ». HGSS s'en sert surtout pour rouvrir d'anciennes zones avec une récompense (île du lac de Colère,
  îlots de la route 40, Tourbillon…).
- **Points de repère.** Bons sur les routes (cabanes habitées, ruines, belvédère, verger, campement, étangs) ;
  manquent les gros repères visibles de loin : une maison au bord de la route, une tour, un pont spectaculaire.
- **Variété des rencontres.** Herbe partout ; herbes sombres sur le Bois Murmure et les routes du marais (r12, r15,
  r19) ; Surf en mer (archipel, mer de l'Est) et sur les lacs des lieux faits main. Pas de pêche, pas de
  coup d'boule dans les arbres. Les lacs et rivières des grandes routes n'ont pas de rencontres en surfant.

### Lisibilité

- **Panneaux.** 43 panneaux sur les routes avant cette nuit : les routes d'avant 8 badges en avaient à un bout, celles
  du Sud presque jamais. Aucun panneau aux départs des 84 sentiers de lieux. Corrigé : un panneau à chaque bout de
  route qui n'en avait pas (14) et au départ des sentiers des lieux habités (23 : hameaux, fermes, vergers) ; les
  lieux secrets (lac, ruines, source) restent à découvrir.
- **Chemins qui s'arrêtent dans le vide.** L'outil d'accès ne trouve aucun chemin coupé ni rien d'aménagé hors
  d'atteinte ; il restait trois décors posés derrière des arbres (caisses, rocher, barque), corrigés.
- **On ne voit pas où va le sentier** (lisière entre deux morceaux d'une route) : très bien, c'est le « on ne voit pas
  tout » de HGSS. Revers : on ne voit jamais non plus l'objectif au loin (la ville, la montagne qu'on va traverser).
  Les contreforts ajoutés cette nuit montrent enfin la Chaîne Céleste depuis les routes voisines.
- **Vues sur une autre zone** : 703 cases avant (outil `test-odyssee-villes`), surtout en montagne et dans les
  lieux faits main (Route 14 → Hauts d'Ocre : 101, Forêt des Torii → Kagura : 83, Route 5 → Route 4 : 74).

### Raccourcis et retours

- Aucune boucle qui ramène à une ville par un autre chemin, à part les raccourcis à capacité internes à une route.
  Dans HGSS, presque chaque ville a deux sorties, et les routes se rejoignent (routes 36-37, 42-43-44, 26-27…).
- Sept routes ont un raccourci à capacité (r2 Coupe, r4 Coupe, r5 Éclate-Roc, r10 Surf, r14 Coupe, r15 Surf, r18
  Coupe), mais toujours entre deux morceaux de la même route : on gagne du temps, on ne découvre rien de neuf.
- Aucune récompense ne demandait de revenir avec une capacité (îlot, recoin derrière un arbuste) : dans HGSS, c'est le
  moteur du retour en arrière.

### Grottes et donjons

| carte | taille | sol praticable | dresseurs | objets | énigme |
|---|---|---|---|---|---|
| Grotte Lunaire | 46 × 32 | 862 | 6 | 5 | noire (Flash) |
| Route Victoire (grotte) | 60 × 40 | 1 180 | 5 | 6 | rochers fissurés |
| Grotte des Tourbillons | 44 × 30 | 610 | 2 | 3 | — |
| Grotte des Marées / Sanctuaire | 42 × 32 / 25 × 34 | 371 / 268 | 2 / 5 | 4 / 2 | Surf |
| Caverne du Magma | 48 × 34 | 777 | 0 | 5 | — |
| Mine de Pierrefort (3 niveaux) | 42 × 30 à 34 × 24 | 958 | 4 | 7 | échelles, Force, noir |
| **Grotte du Col (nouvelle, 2 niveaux)** | 60 × 38 + 44 × 30 | 1 645 | 5 | 7 + 1 caché | lac (Surf), noir, Force |
| **Grotte des Mesas (nouvelle)** | 46 × 32 | 806 | 2 | 3 + 1 caché | — (cul-de-sac des canyons) |
| **Grotte des Sables (nouvelle, 2 niveaux)** | 48 × 32 + 40 × 28 | ~1 500 | 2 | 4 + 1 caché | noir, Force (route 16) |
| **Grotte des Crêtes (nouvelle, 2 niveaux)** | 48 × 32 + 40 × 28 | ~1 500 | 2 | 4 + 1 caché | noir, Force (route 3, dès 1 badge) |

- 9 cartes de grotte avant cette nuit pour une région de la taille de plusieurs HGSS ; une quinzaine dans HGSS
  (Caverne Union, Puits Ramoloss, Mont Creuset, Route de Glace, Antre Noir, Tourbitoile, Antre du Dragon, Chutes
  Tohjo, Route Victoire, Mont Argenté, Grotte Taupiqueur, Mont Sélénite, Grotte, Îles Écume, Caverne Azurée…).
- Les grottes générées (`caveMap`) sont un seul niveau d'automate cellulaire : pas de rebords intérieurs, pas
  d'échelles, pas de Force sauf dans la mine. Les grottes de HGSS jouent sur plusieurs étages, des rebords, des
  rochers à pousser dans des trous, de l'eau et des cascades.
- Aucune grotte ne traversait la Chaîne Céleste à part la Route Victoire.

### Villes

22 villes (dont 3 villages d'île). Les grandes villes sont vivantes (marché, parc, port, quartiers à thème, repères
comme la gare ou la chapelle, 140 bâtiments à Sylvebourg, 146 à Métropole). Défauts :

- vue de dessus, toutes restent rectangulaires (le noyau de chaque ville prend ¾ de son territoire, la forêt autour) ;
  les rues sont en grille ;
- dans les petites villes (Cendrelune, Port-Granit, Cimelune : 19 à 26 bâtiments), l'ancien centre fait main domine ;
- peu de PNJ « utiles » à la HGSS par ville (échangeur, donneur d'objet, maison du Déménageur, Nommeur…) : la plupart
  des maisons ont un habitant qui donne un conseil ;
- le Plateau Céleste est un rectangle posé dans la roche.

### Géographie

- La Chaîne Céleste couvrait un rectangle de blocs (9 × 17), au bord droit ou en dents de scie, petite à l'échelle
  de la carte ; le Plateau Céleste y est un replat rectangulaire.
- Les Hauts d'Ocre et le désert sont de grandes taches uniformes (65 000 cases de fond dont 8 200 praticables).
- Pas de rivière qui descende de la montagne à la mer : les rivières sont des tronçons de route (pont de planches)
  et quelques bras de ville.
- Cendrelune, « l'île où dort le volcan », n'avait pas de volcan.
- Transitions de climat : nettes aux frontières de zones (désert, neige, cendre) ; la forêt de fond est la même
  partout (pins et feuillus en grandes taches).

## 3. Priorités (avant cette nuit)

1. Rebords et raccourcis à sens unique sur les routes (le rythme de base de HGSS, absent).
2. Objets cachés (la récompense de l'exploration, absente).
3. Panneaux aux bouts des routes et aux départs des lieux.
4. Grottes : au moins une traversée de la Chaîne Céleste, plusieurs niveaux, des énigmes simples.
5. Volcan de Cendrelune.
6. Chaîne Céleste plus ample, sans cadre.
7. Lieux moins ronds (effet « sucette »).
8. Villes moins rectangulaires (le plus gros chantier : touche `quartiers.js` en profondeur).
9. Boucles qui ramènent aux villes, routes qui se rejoignent.

## 4. Fait cette nuit

Chaque changement est dans le générateur, posé en une passe, vérifié par l'outil d'accès et toute la suite
`tools/test-odyssee*.mjs` (au vert), et regardé en jeu et vue de dessus (images dans `/tmp/nuit/level/`).

1. **Rebords et raccourcis à sens unique** (`world/rythme.js`). Des rebords en travers des prairies, du bord du
   sentier jusqu'aux arbres (34 lignes, 1 à 3 par route) ; là où deux morceaux d'une route se frôlent derrière une
   lisière, une trouée de trois cases et un rebord ramènent de l'un à l'autre (6 raccourcis, 87 à 210 cases de
   chemin épargnées). Chaque rebord est vérifié dans un graphe des pas du joueur : rien de ce qu'on atteignait n'est
   perdu, aucun piège (une case atteinte d'où l'on ne revient pas), et un raccourci n'ouvre rien qu'on n'atteignait
   déjà à pied.
2. **Objets cachés** (`world/rythme.js`, `cacher()`). 35 sur les routes (1 à 3 par route selon sa longueur), au bout
   d'une impasse, dans un rocher ou l'arbre qui ferme un recoin, loin du sentier ; tirés dans la liste du rang de la
   route (`bareme.js`). Identifiants `<route>:cN`. Et 37 en ville (deux par ville au plus), dans un tonneau, des
   caisses, un pot ou une fontaine au bord d'une rue, comme les poubelles de HeartGold (`<ville>:cN`, au barème de
   l'endroit ; une fois l'objet trouvé, le décor retrouve sa description). L'outil d'accès vérifie qu'on peut tous
   les fouiller ; essayé en vrai dans Chrome (le joueur face à la case, touche A : l'objet passe dans le sac, le
   drapeau `I:<id>` est posé, il ne revient pas).
3. **Panneaux** : 14 aux bouts des routes qui n'en avaient pas (nom, où l'on va, d'où l'on vient) ; aux départs des
   sentiers des hameaux, fermes et vergers (23, `lieux.js`, posés après les écrans de verdure et seulement là où ils
   ne coupent aucun passage).
4. **Plus de décor hors d'atteinte** (`acces.js`, `oterDecorIsole`) : l'outil d'accès repasse au vert.
5. **Clairières naturelles** (`lieux.js`, `faconner`, `faconnerImpasses`). Les 84 lieux et 94 impasses n'ouvrent plus
   un disque : forme étirée vers le sentier, anses, deux lobes, bouquets d'arbres au bord, sentier qui s'évase. Fait
   après la pose du contenu, sans toucher au tirage : même contenu, mêmes identifiants qu'avant.
6. **Grotte du Col** (`world/grottes.js`). Sous le coin sud-ouest de la Chaîne Céleste, du Bois Murmure (1 badge) à la
   route 10 (5 badges). Un lac souterrain coupe la grotte : il faut Surf pour traverser (le raccourci n'ouvre rien
   avant l'heure). Une échelle descend dans une galerie noire (Flash) où un éboulement à pousser (Force) garde une
   salle et son trésor ; un îlot sur le lac ; un objet caché. Bouches creusées dans la falaise au bout d'un sentier
   tout droit, panneaux.
7. **Volcan de Cendrelune** (`world/volcan.js`). Un cône de roche cendrée au sud de la ville, épaulements et ravines,
   lèvre du cratère au niveau 11, lac de lave ; la forêt entre la ville et lui devient celle de l'île.
8. **Contreforts de la Chaîne Céleste** (`world/contreforts.js`). La roche déborde du plan rectangulaire en longues
   avancées dans la forêt de fond (23 000 cases, gradins de 1 à 6 niveaux, vallées de pins entre elles), toujours à
   cinq cases de ce qu'on foule ; la bande de forêt du pied, à l'intérieur du plan, est prise aussi (plus de douve
   rectangulaire). Depuis la route 10, le Bois Murmure ou la route 3, la montagne se dresse derrière les arbres. Les
   bords libres du Plateau Céleste deviennent falaise (coins arrondis) — peu de cases : la ville occupe tout son
   rectangle.
9. **Canyons des Hauts d'Ocre** (`world/ocre.js`). Le plus grand réseau de vallées de sable entre les mesas
   (4 000 cases, oasis et palmiers) n'était relié à rien : on le voyait depuis la route 14 (101 cases de « vue sur une
   autre zone ») sans pouvoir y descendre. Une gorge le relie au sentier de la route 14 ; trois randonneurs, trois
   objets, un objet caché dans la roche, un panneau. Cul-de-sac du rang de la route 14 (9 badges) : il ne touche
   aucune autre route. Au fond des vallées, la **Grotte des Mesas** s'ouvre dans la falaise d'une mesa (un niveau,
   deux montagnards, trois objets dont une Pierre Soleil, un objet caché).
10. **Dresseurs aux passages étroits** (`world/rythme.js`). Là où la prairie se resserre autour du sentier (5 à 12
   cases de large), un dresseur se tient sur le côté et son regard traverse le passage ; la densité vise un
   dresseur pour 16 cases de sentier (22 sur les routes du début), cinq de plus au plus par route : 36 dresseurs
   (`<route>:eN`), équipes tirées de la table de la route. Pas sur la route 1 ni sur la Route Victoire.
11. **Récompenses à venir chercher plus tard** (`world/rythme.js`). Sur les routes du début (rangs 0 à 3), une petite
   clairière fermée par un arbuste à couper, un objet au milieu (7, `<route>:i1`) ; au milieu d'un étang de route
   qu'on rejoint à pied, un îlot de sable et son objet, qu'on atteint en surfant (3, `<route>:i0`). Comme les îlots du
   lac de Colère ou les recoins de la route 32 : on revient avec Coupe ou Surf. Le barème (`bareme.js`) garde ces
   objets au niveau de la route.
12. **Grottes des Sables et des Crêtes** (`world/grottes.js`, `grotteDansFalaise`). Sur la route 16 (le désert), une
   bouche dans la falaise d'une mesa : galeries hautes (deux dresseurs, deux objets), échelle vers une galerie
   profonde dans le noir, salle fermée par un rocher à pousser (Force) avec une Pierre Feu et un Max Élixir, un objet
   caché. La fonction est générique : une route, un nom, des dresseurs, des objets, et la grotte trouve seule sa
   falaise — ou, faute de falaise, perce un sentier tout droit jusqu'à la roche comme pour le Col. Ainsi la
   **Grotte des Crêtes**, au nord de la route 3 sous les contreforts de la Chaîne Céleste : une grotte du début
   (rang 1, Pokémon de la Grotte Lunaire), même plan à deux niveaux. Le barème ramène ses objets au niveau du début
   (la Pierre Lune prévue derrière le rocher devient une Super Ball : trois pierres au plus avant le quatrième badge).

Coût à la construction du monde : rythme ~0,7 s (jusqu'à 1,9 s sur la machine chargée de cette nuit), contreforts
~0,3 s, le reste négligeable.

## 5. Feuille de route

Dans l'ordre :

1. **Villes à silhouette organique.** Essayé cette nuit sans le garder : ronger après coup les bords libres des villes
   ne prend que 342 cases (les villes remplissent leur rectangle jusqu'au bord). Il faut le faire dans `quartiers.js`
   : un noyau au contour bruité et aux coins arrondis (`marge` de `grandeVille`, amplitude 4 aujourd'hui pour les villes
   dans la forêt), des rues qui suivent le relief et la rivière plutôt qu'une grille ; pour les petites villes, des
   quartiers neufs autour de l'ancien centre. Attention aux identifiants : les maisons générées (`<ville>:qN`) sont
   numérotées dans l'ordre de pose ; garder leur ordre, ou façonner le contour après coup comme pour les lieux.
2. **Boucles.** Deux sorties par ville quand c'est possible, des routes qui se rejoignent, d'autres raccourcis à
   capacité qui rouvrent une ancienne zone (grotte derrière une cascade, rochers fissurés vers un belvédère, Force
   sur un éboulement de route).
3. **Grottes.** Une par grande montagne (Mont Givré, Canyon d'Ocre de la route 17, Hauts d'Ocre côté sud),
   plusieurs niveaux, rebords intérieurs, Force dans des trous, cascades ; un générateur de grotte à étages (le
   schéma de `grottes.js` est réutilisable : deux niveaux, une échelle, un lac, une salle derrière un rocher) ;
   `caveMap` fait des grottes très ouvertes, sans goulet où poser un rocher fissuré (la Grotte des Mesas n'en a pas).
4. **Rythme des routes.** Encore plus de dresseurs sur les longues routes (le plafond de cinq par route laisse la
   route 16 à un pour 25 cases), des duos de dresseurs ; des rebords aussi dans les montagnes et les canyons (le
   relief à gradins s'y prête) ; des objets cachés dans les lieux ; un Cherch'Objet (les objets cachés sont des
   `W.objects` marqués `cache`, faciles à retrouver).
5. **Géographie.** Une vraie rivière de la Chaîne Céleste à la mer, qui traverse une ville et une route ; des transitions
   de climat (forêt de pins avant la neige, savane avant le désert) ; les autres vallées des Hauts d'Ocre (2 000
   cases encore fermées) et le désert de la route 16.
6. **Rencontres par terrain.** Surf sur les lacs et rivières des routes (aujourd'hui, on y rencontre les Pokémon des
   herbes hautes ; donner une table d'eau douce aux zones de route demande d'abord de séparer, dans `getMapWeather` de
   `game.js`, la pluie des zones qui ont une table de surf), pêche, arbres à secouer (Coup d'Boule).
7. **Vues sur une autre zone** (647 cases, surtout en montagne et dans les lieux faits main : Forêt des Torii →
   Kagura 83, Route 5 → Route 4 74, Mont Givré) : les reprendre zone par zone dans l'éditeur.

## 6. Images

Dans `/tmp/nuit/level/` :

- avant : `avant/rebord-r1.png`, `avant/rebord-r5.png` (les deux seuls endroits à rebords), `acces-avant-demi.png`
  (toute la carte, vue de l'outil d'accès), `schema-avant/` ;
- après, en jeu : `apres/rebord-r1.png` (rebord en travers de la prairie), `apres/raccourci-r2.png`,
  `apres/raccourci-bois.png`, `apres/col-entree-ouest.png`, `apres/col-entree-sud.png`, `apres/col-lac.png`,
  `apres/col2-force.png`, `apres/volcan-cratere.png`, `apres/volcan-depuis-ville.png`, `apres/contreforts-r10.png`,
  `apres/contreforts-bois.png`, `apres/contreforts-r3.png`, `apres/panneau-ferme.png`, `apres/ocre-entree.png`,
  `apres/ocre-vallees.png`, `apres/mesas-entree.png`, `apres/mesas-grotte.png`, `apres/dresseur-passage-r2.png`,
  `apres/coupe-clairiere-r2.png`, `apres/ilot-r5.png`, `apres/sables-entree.png`, `apres/cretes-entree.png` ;
- après, vue de dessus (schéma 1 pixel = 1 case, avant au-dessus ou à gauche) : `lz3-final.png`, `lz2-final.png`
  (clairières), `chaine-cmp.png` (Chaîne Céleste et contreforts), `carte-avant-apres.png` (toute la carte).
