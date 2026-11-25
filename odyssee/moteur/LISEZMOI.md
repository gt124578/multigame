# Moteur de terrain façon HeartGold / SoulSilver

Branche `moteur-hgss`. Banc d'essai : `odyssee/moteur.html` (à côté du jeu, pour que les écrans d'Odyssée y trouvent
leurs images ; `odyssee/moteur/index.html` y renvoie). `?nouveau` pour repartir de zéro, `?debug`, `?zone=VIOLET&x=…&y=…`
pour partir ailleurs (identifiants de `map_headers.h`), `?zoom=2.5` pour voir une ville entière, `?demo` pour la petite zone d'essai, `?pack=odyssee` pour les
images d'Odyssée au lieu des textures et bâtiments HGSS. Tests : `node tools/test-moteur-hgss.mjs`.

## Combats, équipe, sac, son : ceux d'Odyssée (`odyssee.js`)

Le terrain crée et soigne ses POKéMON par `T.pokemon` (le pont y branche `createMon` et `healFull`), émet
`{ type: 'combat' }` et attend `terminerCombat(victoire)` : le pont joue le combat avec `Battle` et `BattleView`
(sauvages, dresseurs, champion, capture, expérience, évolution, K.O.). Menu sur Tab / M : l'équipe et le sac
d'Odyssée (objets de soin). Musique et bruitages : `Sound` d'Odyssée. Les objets du terrain portent les identifiants
d'Odyssée (`poke-ball`, `oran-berry`…) : le sac est le même partout.

## Le jeu, lu dans la décompilation (`donnees/hgss.js`, `donnees/evenements-hg.js`, `donnees/jeu-hg.js`)

La décompilation de HeartGold / SoulSilver (pret/pokeheartgold, commit épinglé `PRET_HG`) publie les données du jeu
lui-même. La page les lit **à la volée** dans ce dépôt public (gardées ensuite par le navigateur, cache `moteur-hgss-pret`) ;
**rien n'est copié ici**. On joue donc le vrai début du jeu, en anglais, dans un seul monde comme sur la console :
- `hgss.js` : les cartes (`land_data`, 676 cartes : permissions, accessoires, modèle, relief BDHC), la matrice du dehors
  (`map_matrix_0000_EVERYWHERE`, 47 × 17 blocs : Johto et Kanto d'un seul tenant, sans chargement), les en-têtes
  (`map_headers.h` : événements, messages, scripts, musique, type, vélo, lieu, rencontres) ; `comportementHG` traduit
  les comportements de case (herbes, eau, rebords, portes, tapis, escaliers, glace, comptoirs `0x80`…).
- `evenements-hg.js` : les événements de chaque carte (personnages et leur drapeau, dresseurs et leurs équipes de
  `trainers.json`, objets, panneaux, déclencheurs, téléporteurs) et **la traduction de ses scripts** (`scr_seq/*.s`)
  dans le langage du moteur : conditions, drapeaux, variables, menus, mouvements, cadeaux, combats, tampons de texte
  (`{STRVAR_1 …, k}` → `{Tk}`, rempli par `tampon k joueur|rival|equipe|espece|objet|nombre|poche`), commandes des arènes
  (`AzaleaGymSpinarak` → `chariot`…). Toutes les cartes se compilent ; un personnage qu'un script nomme mais qui n'est
  pas posé est ignoré (`objetsFantomes`).
- `jeu-hg.js` : `jeuHG(lire)` rend les données de départ (toutes les cartes connues par leur nom anglais — New Bark
  Town, Route 29, Azalea Town… — et le dehors entier) et `chargerCarte(id)`, qui apporte en route les événements, les
  scripts (et les scripts de niveau, `_hdr.s`) et, pour un intérieur, ses blocs. Le moteur attend dans le noir qu'une
  carte arrive (`T.chargeur`, `ajouterDonnees`) ; la page charge en avance celles d'à côté. Nouvelle partie :
  drapeaux et variables de `scr_seq_0149` ; noms anglais des espèces, attaques et objets (`msg_0237`, `msg_0750`,
  `msg_0222`), repris aussi par les écrans d'Odyssée ; POKéMON sauvages de `gs_enc_data.json` (version HeartGold,
  selon l'heure : matin, jour, nuit ; poids des emplacements du jeu). `AJOUTS` : ce qu'on pose en plus (les chariots
  de l'arène d'Azalea, la dresseuse de Sinnoh). Les scripts du jeu traversent (`scriptsTraversent`) : dans HGSS, un
  mouvement de script ne teste pas les collisions.
- `gymmicks.js` : les mécanismes que le jeu code en C (`src/field/gymmick/`) : les 12 stations, routes et aiguillages
  des chariots Spinarak de l'arène d'Azalea.
- Rendu (`render/hgss3d.js`) : le vrai modèle 3D de chaque carte (NSBMD avec le jeu de textures de sa zone) et ses
  accessoires (`bm_field` dehors, `bm_room` dedans) ; personnages du jeu (`mm:NOM`, modèles `mmodel` décodés en
  planches à la demande, `planche`). Tout est lu à la volée.
- Carte de la région (touche C, `render/carte-region.js`) : tirée du monde chargé (une case = un point : eau, herbes,
  arbres et murs, chemins, villes en rouge), le joueur clignote à sa place (à la porte de son bâtiment s'il est
  dedans), les flèches promènent le curseur et donnent le nom du lieu.
- Caméra : celle d'Odyssée et de HGSS (inclinaison 55°, champ 13°, cases carrées à l'écran).
- Captures sans réseau : `PRET=<clone de pokeheartgold> PDSMS=<clone de Pokemon-DS-Map-Studio> node tools/capture-moteur-hgss.mjs …`.
- Tests (`node tools/test-moteur-hgss.mjs`, `PRET=<clone>`) : toutes les cartes compilées, audit du jeu entier depuis
  la chambre (avec et sans capacités), les capacités sur de vraies cartes, le français, puis le jeu joué avec ses vrais
  scripts jusqu'au premier badge : la mère d'ETHAN, le Prof. Elm et la machine aux Poké Balls, le Pokégear, la passante
  de la sortie ouest, la Route 29 et ses sauvages, le vieil homme de Cherrygrove et ses Running Shoes, M. Pokémon et le
  Prof. Oak (Pokédex), le rival, la police au labo (le nom du rival), le poste de garde de Violet City, la Tour
  Chétiflor (zigzag des échelles, Sage Li et sa CT Flash), l'arène de Falkner et le BADGE ZÉPHYR ; les chariots d'Azalea.
- Capacités de terrain (badge du jeu, `src/field_move.c`, et CS dans le sac ; `capacites` des données, `Terrain.capacite`,
  `?tout` les donne toutes) : COUPE, SURF, ÉCLATE-ROC (rochers `SPRITE_BREAKROCK`, ils reviennent en changeant de carte),
  FORCE (rochers `SPRITE_ROCK` poussés d'une case ; dans un trou, un rocher tombe à l'étage du dessous : drapeaux
  `…_INIT` → `…_FALLEN`, Route de Glace), CASCADE, SIPHON, ESCALADE (cases `MB.CHUTE`, `TOURBILLON`, `ESCALADE_NS/EO`,
  franchies d'un trait par `franchir` après A devant elles). Blocs de glace de l'arène de Mahogany (`SPRITE_ICE`) poussés
  jusqu'au premier obstacle. Mouvements de script : ils traversent (comme le jeu) et déplacent aussi les personnages
  cachés ; `VAR_TEMP_…` et `FLAG_MAPTEMP_…` repartent de zéro sur chaque carte ; le script « à l'entrée » d'une carte
  joue pendant le noir (`transitionAvant`). Entrées dans un sens (`0x62`-`0x65`, `0x6c`-`0x6f`) : tapis de sortie dedans,
  portes dehors avec leur sens de sortie (`sortieWarp`) ; une porte d'intérieur ne s'ouvre que là où il y a un
  téléporteur ; ascenseurs (`warp_dynamique`, téléporteur 4095). Données réelles un peu bancales (PNJ posé sur la
  carte voisine…) : signalées, pas refusées (`tolerant`).
- Français (touche L, ou `?langue=fr` / `?langue=en`, retenu par le navigateur ; français par défaut) : lieux, classes
  de dresseurs et personnages de la version française (`donnees/fr.js` : Bourg Geon, Mauville, Prof. Orme, Célesta,
  « Gamin Joey », LUTH), espèces, attaques et objets d'Odyssée. Les dialogues ne sont publiés qu'en anglais : la page
  les traduit sur place (`render/traduction.js`) avec le traducteur intégré du navigateur (API Translator de Chrome),
  sinon un petit modèle (opus-mt-en-fr par Transformers.js, chargé à la demande) ; les noms propres sont remis à la
  française avant, les répliques d'une carte sont traduites dès qu'elle arrive, et gardées par le navigateur. Rien de
  traduit n'est écrit dans le dépôt. Sans traducteur disponible, les dialogues restent en anglais (dit dans l'aide).
- Couverture : `PRET=<clone> node tools/moteur-hgss-couverture.mjs [--tout]` dit les commandes des scripts du jeu pas
  encore jouées (les sons, attentes et fondus sont sautés exprès), les cartes atteintes à pied depuis la chambre avec
  toutes les capacités, et les arènes. Aujourd'hui : les 16 arènes, toute la région (Johto et Kanto, Route de Glace,
  Îles Tourbillon, Mont Argenté). Pas encore : l'Aquaria (le bateau), la Tour Carillon, le Parc Safari, le Train
  Magnétique, la ligue au-delà de l'entrée dans l'audit (les salles du Conseil 4 s'ouvrent par des scripts que l'audit
  ne suit pas), les mini-jeux (Casino, Pokéathlon, Zone de Combat), le téléphone, les échanges et les surnoms.
- Pour l'instant à côté : les écrans propres au jeu (Pokégear, boîte de choix du starter dessinée, surnom ; le nom du
  rival se demande par une simple question), les combats doubles.

## Arène de Frimapic, Pokémon Platine (`donnees/platine.js`, `render/platine3d.js`)

À l'identique : la décompilation de Platine (pret/pokeplatinum) publie les fichiers de carte eux-mêmes. Au chargement
de la page, `frimapic()` lit dans son dépôt (commit épinglé, rien n'est copié ici) :
- la carte `map_data_234` : grille de collisions et de comportements (glace, cases bloquées dans un axe, sortie) et
  relief BDHC (plaques et pentes à 45° ; hauteur et sens de la pente au centre de chaque case, en demi-cases) ;
- les événements de la salle (Candice, guide, 6 Topdresseurs avec leur portée et leur regard, 19 boules de neige,
  statues, sortie) ;
- pour le rendu : le modèle 3D de la salle avec son jeu de textures (`map_texture_set_027.nsbtx`, lu par `lireNsbtx`),
  les accessoires posés par la carte (statues, tapis) et le modèle de la boule de neige.
Règles de la glace à pentes reprises du code du jeu (`player_move.c`) : `glissePente` d'`engine/terrain.js` — vitesse
de 0 à 3, +1 par case de descente, −1 par case de montée ; sans vitesse on recule d'une case et on s'arrête ; une boule
de neige se brise si on la heurte avec de la vitesse (au moins 1), elle revient quand on ressort. Un monde peut déclarer
`pentes` (pas de mur entre deux hauteurs) et `niv` (hauteur d'un niveau en cases). Accès : une dresseuse de Sinnoh au
Centre de Mahogany Town (`MAHOGANY_POKECENTER_1F`). Le test lit un clone local (`PLAT=<clone>`, sinon `/tmp/ext/plat`), cherche le chemin jusqu'à Candice
avec les règles du moteur (34 coups, 8 boules brisées) et le rejoue dans une vraie partie.

Le but n'est pas l'image mais la charpente : une organisation aussi stricte que celle du jeu DS, où l'on ajoute
une ville, un PNJ ou une quête **en écrivant des données et des scripts**, sans toucher au code du moteur.
L'architecture s'inspire de ce qui est documenté publiquement sur HGSS (matrices, en-têtes, permissions,
événements, scripts) ; aucun code de la décompilation n'a été repris.

## Les trois couches

```
engine/      le moteur, sans DOM (tourne dans Node pour les tests)
  const.js     directions, vitesses (en pas de 1/60 s), comportements de case (MB) et leurs propriétés
  carte.js     format des cartes : monde (matrice de blocs), bloc 32 × 32, zone (en-tête + événements), validation
  objets.js    objets du terrain (joueur, PNJ, dresseurs, objets au sol) et règle commune d'un pas (testerPas)
  script.js    langage de scripts : compilateur (erreurs à la ligne) et machine qui les exécute
  commandes.js les commandes des scripts
  commun.js    scripts communs (défi des dresseurs, objets au sol, surf, vélo, sauvegarde)
  terrain.js   le « field system » : le pas de 1/60 s, le joueur, les PNJ, les déclencheurs, la caméra, la sauvegarde
donnees/     les données
  auteur.js    écrire un bloc en texte (légende → permission, comportement, sol, décor ; bâtiments → emprise + porte)
  demo.js      zone d'essai : bourg, route en deux blocs, maison sur deux étages, labo, maison voisine, grotte de glace
  hgss.js, evenements-hg.js, jeu-hg.js, gymmicks.js   le jeu HGSS lu dans la décompilation (ci-dessus)
  fr.js        les noms de la version française
  platine.js   l'Arène de Frimapic (Platine)
render/      le rendu three.js : il LIT le moteur, ne décide de rien
main.js      la page : touches, boucle à pas fixe, boîte de texte, écran de combat factice
```

## Format des cartes

- **Monde** (la « matrice » de HGSS) : une grille de blocs. Chaque case de la grille dit quel bloc s'y trouve,
  à quelle zone elle appartient, et son altitude. Tout le dehors est un seul monde : on y circule sans chargement,
  seule la zone change (nom annoncé, musique, caméra, rencontres, règles).
- **Bloc** : 32 × 32 cases. Pour chaque case : `col` (bloquée ou non), `mb` (comportement), `h` (hauteur en
  niveaux), `sol` (pour le rendu) ; plus le décor et les bâtiments.
- **Zone** (l'« en-tête ») : `nom`, `musique`, `camera` (`dehors`, `ville`, `interieur`, `grotte`, `haut` : toutes
  celle de la DS, relevée dans `field_camera.c` de la décompilation de Platine — distance 666,92 unités soit 41,68
  cases, inclinaison 59,05°, champ vertical 2 × 8,09°, 16 cases de large à l'écran ; `proche` : celle des endroits
  resserrés), `velo`, `course`, `rencontres` (`herbe`, `eau`, `sol` pour tout le sol d'une grotte : taux et espèces
  pondérées), `scripts` (source), `niveau` (scripts de niveau), `rails` (chariots de l'arène d'Azalea) et les événements :
  - `objets` : PNJ (`sprite`, `dir`, `mouvement` : `fixe`, `regard_alea`, `regard_hb`, `regard_gd`, `tourne`, `errance`,
    `errance_hb`, `errance_gd`, `route` ; `rayon` ; `script`), dresseurs (`dresseur: { portee, script, apres, equipe }`),
    objets au sol (`type: 'objet'`, `objet`, `drapeau`). `drapeau` : caché tant que ce drapeau est levé ;
    `siDrapeau` : visible seulement quand il l'est.
  - `panneaux` : case + script, `depuis` (direction où doit regarder le joueur, ex. `HAUT` pour un panneau lu d'en bas).
  - `warps` : case + `vers` (zone) + `n` (numéro du téléporteur d'arrivée dans cette zone) + `sortie` (pas fait en
    arrivant). Comme dans HGSS, une porte renvoie à **un numéro**, jamais à des coordonnées.
  - `declencheurs` : rectangle + `var`/`val` (le script part quand la variable a cette valeur) + `script`.
- Le chargement **refuse** des données incohérentes (`valider`) : bloc ou zone inconnus, téléporteur vers un numéro
  absent ou une case bloquée, porte sans comportement de porte, PNJ dans un mur ou hors de sa zone, script appelé
  qui n'existe pas, identifiants en double.

### Comportements de case (`MB`, `engine/const.js`)

`HERBE`, `HERBE_DENSE`, `EAU`, `FLAQUE`, `CASCADE`, `GLACE`, `SABLE`, `REBORD_BAS/HAUT/GAUCHE/DROITE`, `PORTE`,
`TAPIS_BAS/HAUT/GAUCHE/DROITE` (tapis de sortie), `ESCALIER`, `MARCHES` (entre deux hauteurs, franchies dans
l'axe), `TAPIS_ROULANT_*`, `COMPTOIR`, `TROU`, `NEIGE`. Ce que fait une case ne dépend **que** de `PROPS[mb]`.

## Scripts

```
script Maman                          # point d'entrée
  regarder_joueur
  si drapeau CHAUSSURES aller Deja    # si [non] drapeau X / si var X <op> n / si resultat <op> n … aller|appeler
  message "Prends ces CHAUSSURES !"
  drapeau CHAUSSURES
  liberer
  fin
Deja:
  message "Sois prudent !"
  fin

mouvement Recule                      # joué par : mouvement joueur Recule
  droite
fin
```

Commandes : `fin aller appeler retour attendre verrouiller liberer message fermer_message oui_non choix drapeau effacer
var ajouter regarder_joueur joueur_regarde regarder mouvement attendre_mouvements cacher montrer placer exclamation
teleporter teleporter_xy fondu_noir fondu_retour secouer son musique musique_zone donner_objet compter_objet
donner_pokemon compter_equipe soigner point_de_soin ramasser combat_dresseur combat_sauvage velo
tourner_joueur_vers dos_au_joueur placer_relatif marcher_vers rails_depart aiguillage chariot` (+ celles du défi des dresseurs). Pas de mouvement : `haut bas gauche droite [n]`,
`vite_*`, `lent_*`, `regard_*`, `saut_*`, `sur_place_*`, `attente n`, `exclamation`, `cacher`, `montrer`,
`regard_joueur`, `dos_joueur`.

- Un script tourne d'une commande à l'autre dans le même pas tant qu'aucune n'attend ; une boucle sans attente est
  arrêtée par une erreur au lieu de figer le jeu. À la fin d'un script, le verrou est levé et la boîte fermée même si
  le script a oublié `liberer`.
- Scripts de niveau : `niveau: { chargement, transition, image: [{ var, val, script }] }` (le script `image` part
  quand la variable a la valeur, une fois le joueur arrêté et rien d'autre en cours).
- Drapeaux `TMP_…` : effacés à chaque changement de carte.

## Déplacements (pas fixe de 1/60 s)

Marche 16 pas par case, course 8 (deux fois plus vite, avec le drapeau `CHAUSSURES` : dans le jeu, les Running Shoes
du vieil homme de Cherrygrove City ; Maj, B tenu ou CapsLock pour courir tout le temps), vélo comme dans HGSS : il prend de l'élan (12, 8, 6 puis
4 pas par case, `ELAN_VELO`), l'élan retombe à l'arrêt, contre un mur ou en changeant de sens, on tourne sans
s'arrêter, interdit en intérieur, sa musique et sa planche de sprites (`player_m_velo`). Surf 8, glace et tapis
roulants 4, saut d'un rebord 32 pas pour deux cases. Appui bref depuis l'arrêt : demi-tour sur place (8 pas) ; en marchant, on change de
sens sans s'arrêter. Mur : pas sur place et son de heurt. Un objet qui bouge tient sa case de départ **et** sa case
d'arrivée : deux personnages ne se croisent jamais. À la fin de chaque pas du joueur, dans l'ordre : porte / escalier
/ trou, changement de zone, déclencheurs au sol, glace et tapis roulants, regard des dresseurs, rencontres.
Vélo : la touche V (avec le Bicycle du jeu, ou `?tout`). Les PNJ ne bougent seuls qu'à moins de 24 cases du joueur et jamais pendant un script.

## Ce qui reste à brancher

- Le noir de Dark Cave sans Flash ; les combats doubles ; les commandes de script encore inconnues du traducteur.
- Le Pokédex et le Pokégear dans le menu, le sprite de surf.
- Un éditeur qui écrive ce format (l'éditeur d'Odyssée Test peut exporter des blocs) et la conversion de la carte
  actuelle d'Odyssée en blocs et en zones.
- Les ponts et passerelles à deux étages (une case praticable dessus et dessous), à ajouter comme comportement.
