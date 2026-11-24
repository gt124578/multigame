# Moteur de terrain façon HeartGold / SoulSilver

Branche `moteur-hgss`. Banc d'essai : `odyssee/moteur/index.html` (`?nouveau` pour repartir de zéro, `?debug`,
`?zone=ROUTE_30&x=79&y=46` pour partir ailleurs, `?demo` pour la petite zone d'essai, `?pack=odyssee` pour les images
d'Odyssée au lieu des textures HGSS). Tests : `node tools/test-moteur-hgss.mjs`.

## Le début de HeartGold / SoulSilver (`donnees/johto.js`)

Bourg Geon → Route 29 (et le poste de la Route 46) → Ville Griotte → Route 30 (M. POKéMON) → Route 31 (Antre Noir) →
Mauville (Tour Chétiflor sur trois étages, arène d'Albert, école, Centre, boutique, maisons) : 8 blocs de dehors dans
une matrice de 6 × 3, 21 cartes d'intérieur (un même bloc sert à plusieurs zones : Centres, boutiques, maisons).
Les plans sont **redessinés à la main** d'après la disposition des lieux ; rien n'est extrait de la ROM.

- `engine/audit.js` parcourt tout ce qu'un joueur peut atteindre et vérifie que chaque porte, PNJ et panneau est
  atteignable et qu'on revient toujours au départ (aucun piège sans retour). Les tests le font sur toute la région,
  puis jouent le parcours complet : POKéMON du labo, dresseurs en chemin, soins, achats, baies qui repoussent, ŒUF de
  M. POKéMON, CS COUPE, arbre coupé qui repousse, trois étages de la Tour, BADGE ZÉPHYR, K.O. et reprise au Centre.
- Textures HGSS : celles que **Pokémon DS Map Studio** publie sur son dépôt GitHub (Trifindo), lues **à la volée**
  par le navigateur au chargement (`PACK_HGSS` de `render/textures.js`, commit épinglé) ; aucune n'est copiée dans
  ce dépôt. Les images de 16 px sont agrandies en 32 px ; une texture de 32 px couvre 2 × 2 cases (16 texels par case,
  la densité des personnages HGSS). Sans réseau, chaque image manquante est remplacée par celle d'Odyssée.
  Captures sans réseau : `PDSMS=<clone de Pokemon-DS-Map-Studio> node tools/capture-moteur-hgss.mjs …`.

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
render/      le rendu three.js : il LIT le moteur, ne décide de rien
main.js      la page : touches, boucle à pas fixe, boîte de texte, écran de combat factice
```

## Format des cartes

- **Monde** (la « matrice » de HGSS) : une grille de blocs. Chaque case de la grille dit quel bloc s'y trouve,
  à quelle zone elle appartient, et son altitude. Tout le dehors est un seul monde : on y circule sans chargement,
  seule la zone change (nom annoncé, musique, caméra, rencontres, règles).
- **Bloc** : 32 × 32 cases. Pour chaque case : `col` (bloquée ou non), `mb` (comportement), `h` (hauteur en
  niveaux), `sol` (pour le rendu) ; plus le décor et les bâtiments.
- **Zone** (l'« en-tête ») : `nom`, `musique`, `camera` (`dehors`, `ville`, `interieur`, `grotte`, `haut`), `velo`,
  `course`, `rencontres` (`herbe`, `eau` : taux et espèces pondérées), `scripts` (source), `niveau` (scripts de niveau)
  et les événements :
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
tourner_joueur_vers dos_au_joueur` (+ celles du défi des dresseurs). Pas de mouvement : `haut bas gauche droite [n]`,
`vite_*`, `lent_*`, `regard_*`, `saut_*`, `sur_place_*`, `attente n`, `exclamation`, `cacher`, `montrer`,
`regard_joueur`, `dos_joueur`.

- Un script tourne d'une commande à l'autre dans le même pas tant qu'aucune n'attend ; une boucle sans attente est
  arrêtée par une erreur au lieu de figer le jeu. À la fin d'un script, le verrou est levé et la boîte fermée même si
  le script a oublié `liberer`.
- Scripts de niveau : `niveau: { chargement, transition, image: [{ var, val, script }] }` (le script `image` part
  quand la variable a la valeur, une fois le joueur arrêté et rien d'autre en cours).
- Drapeaux `TMP_…` : effacés à chaque changement de carte.

## Déplacements (pas fixe de 1/60 s)

Marche 16 pas par case, course 8 (avec le drapeau `CHAUSSURES`), vélo 4, surf 8, glace et tapis roulants 4, saut d'un
rebord 32 pas pour deux cases. Appui bref depuis l'arrêt : demi-tour sur place (8 pas) ; en marchant, on change de
sens sans s'arrêter. Mur : pas sur place et son de heurt. Un objet qui bouge tient sa case de départ **et** sa case
d'arrivée : deux personnages ne se croisent jamais. À la fin de chaque pas du joueur, dans l'ordre : porte / escalier
/ trou, changement de zone, déclencheurs au sol, glace et tapis roulants, regard des dresseurs, rencontres.
Les PNJ ne bougent seuls qu'à moins de 24 cases du joueur et jamais pendant un script.

## Ce qui reste à brancher

- Les rencontres en grotte (tout le sol de l'Antre Noir), le noir de l'Antre Noir sans FLASH.

- Le combat : le terrain émet `{ type: 'combat', … }` et attend `terrain.terminerCombat(victoire)` ; il suffit d'y
  brancher le moteur de combat d'Odyssée (`odyssee/js/core/battle.js`).
- Les menus (sac, équipe, Pokédex, carte), le son et la musique, les sprites de vélo et de surf.
- Un éditeur qui écrive ce format (l'éditeur d'Odyssée Test peut exporter des blocs) et la conversion de la carte
  actuelle d'Odyssée en blocs et en zones.
- Les ponts et passerelles à deux étages (une case praticable dessus et dessous), à ajouter comme comportement.
