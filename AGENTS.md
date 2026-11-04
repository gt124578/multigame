# Consignes pour les assistants de code (Claude, Codex, Copilot, Cursor, Gemini…) et les contributeurs

Ce dépôt est **Arcadia** (anciennement « Game Hub »), le salon de jeux d'Amiel : un site statique (GitHub Pages, sans étape de build) qui réunit plusieurs
jeux multijoueurs dans le navigateur — Duo Drift, DavidSimulator, Tête de Calcul, Bastion Clash, Outbreak, Fil Rouge, Cyber Kart GP, Convoy Storm, Birdie Party, Mini-Golf Party, Island Rush, Odyssée, Mollo !, Site Noir et Mystère Mystère.
jeux multijoueurs dans le navigateur — Duo Drift, DavidSimulator, Tête de Calcul, Bastion Clash, Outbreak, Fil Rouge, Cyber Kart GP, Convoy Storm, Birdie Party, Mini-Golf Party, Island Rush, Odyssée, Mollo ! et Dogfight 3D.

## À chaque modification poussée sur `main` : journal + version

Les joueurs voient les nouveautés dans le Hub (bouton « ✨ Nouveautés »), qui lit `CHANGELOG.md`.
**Toute modification visible par les joueurs doit donc :**

1. **Monter la version** dans `hub/hub.js` : `const VERSION = '3.0';` → `'3.1'` (le Hub est en 3.x depuis le 27 octobre 2026,
   +1 sur le second nombre).
2. **Ajouter une entrée en haut de `CHANGELOG.md`**, juste sous le titre, au format :

   ```markdown
   ## 3.1 — 28 octobre 2026
   - **Nom du jeu** — ce qui change, écrit pour les joueurs (pas pour les développeurs).
     - détail éventuel (sous-liste indentée de deux espaces)
   ```

   - En français, phrases courtes, du point de vue du joueur (« Les échanges se proposent pendant son tour »),
     pas de noms de fichiers ni de fonctions.
   - Une ligne par nouveauté ou correction ; regrouper ce qui concerne le même jeu.
   - La date est celle du jour, en toutes lettres (`28 octobre 2026`).
3. **Mettre le même numéro dans les `?v=` de `index.html` et `apropos.html`** (liens vers `hub/` et `shared/`) : sinon les navigateurs gardent l'ancienne version en cache.
4. **Faire tout ça dans le même commit** que le changement (ou le même push).

Filet de sécurité : si un push sur `main` ne touche pas `CHANGELOG.md`, l'action GitHub
`.github/workflows/changelog.yml` rédige elle-même une entrée à partir des messages de commit
(`tools/changelog-auto.mjs`) et monte la version. Elle est moins bien écrite qu'une entrée faite à la main :
préférer l'écrire soi-même. Pour qu'elle soit lisible, écrire des messages de commit clairs, par exemple
`feat(calcul): mode Éclair` ou `fix(david): la caméra qui suit ne se désactive plus`
(portées reconnues : `drift`, `david`, `calcul`, `bastion`, `outbreak`, `filrouge`, `kart`, `convoy`, `golf`, `minigolf`, `royale`, `odyssee`, `mollo`, `sitenoir`, `mystery`, `hub`, `server`).
Ajouter `[skip changelog]` dans le message d'un commit purement technique pour qu'il n'apparaisse pas.

## Repères

- Chaque jeu vit dans son dossier (`drift/`, `david/`, `calcul/`, `bastion/`, `outbreak/`, `filrouge/`, `kart/`, `convoy/`, `golf/`, `minigolf/`, `royale/`, `odyssee/`, `mollo/`, `sitenoir/`, `mystery/`) et tourne dans une iframe du Hub ;
  le Hub (`index.html`, `hub/`) gère le salon, le classement entre potes et le pont `shared/bridge.js`.
- Multijoueur : relais WebSocket (`shared/net.js`, serveur dans `server/`). `?local` dans l'adresse simule le réseau
  entre onglets du même navigateur pour tester à plusieurs.
- Registre des jeux et de leurs réglages : `hub/games.js` ; fiche de chaque jeu (catégorie, durée, commandes, astuces) dans `HUB_GAME_INFO`, au même endroit : à remplir pour tout nouveau jeu.
- Accueil : `hub/home.js` (vitrine, filtres, étiquettes tirées du journal). Autour du jeu : `hub/ingame.js` (écran de chargement commun, menu Arcadia).
  L'écran de chargement s'en va quand le pont envoie « shown » : automatique dès que le jeu est prêt et que `#loading`, `#app.loading` ou `#load`
  ont disparu ; un jeu peut l'annoncer lui-même avec `HubBridge.shown()`. Sons d'interface : `shared/uisfx.js` (Kenney, CC0, `assets/sfx/`). Ajouter un jeu : `docs/NOUVEAU-JEU.md`.
- Tests à lancer avant de pousser quand on touche à DavidSimulator, Tête de Calcul, Fil Rouge, Outbreak, Convoy Storm ou Birdie Party :
  `node tools/test-rules.mjs`, `node tools/check-board.mjs`, `node tools/test-calcul.mjs`, `node tools/test-filrouge.mjs`,
  `node tools/test-outbreak.mjs`, `node tools/test-convoy.mjs`, `node tools/test-golf.mjs`.
- Poké Duel, tournoi (`pokemon/engine/tournament.js`, `pokemon/net/`) : `node tools/test-pokemon-tournament.mjs` (draft, tableau, exemptions,
  forfaits, finale en 2 manches) et `node tools/test-pokemon-net.mjs` (tournoi joué en réseau simulé, départ d'un joueur, départ de l'hôte).
  Objets tenus (`pokemon/engine/items.js`) et Méga-Évolutions (`pokemon/engine/megas.js`) : `node tools/test-pokemon-items.mjs`.
  Roster : 61 Pokémon faits main (`pokemon/engine/data.js`) + toutes les évolutions finales des Gens 1 à 6, leurs attaques, talents et Méga-Évolutions
  générés depuis PokeAPI dans `pokemon/engine/roster-gen.js` par `node tools/pokemon-roster.mjs` (ne pas modifier ce fichier à la main).
  Format VGC (combat en double) : moteur commun dans `battle.js` (emplacements A et C contre B et D, `resolveActions`, attaques de zone, Abri),
  bots `chooseDoublesAction`, écran `pokemon/view/doubles.js` : `node tools/test-pokemon-vgc.mjs` (le tournoi VGC en réseau est dans `test-pokemon-net.mjs`).
  Format « 2 joueurs contre 2 » (`format: 'multi'`) : même moteur en double, un emplacement par joueur (`battle.owners`) avec ses propres Pokémon (`battle.pools`), équipes tirées au sort (`match.aIds` / `bIds`).
  Talents (`pokemon/engine/abilities.js` : un talent par Pokémon, le meilleur que le moteur sait jouer ; météo dans `battle.js`) : `node tools/test-pokemon-abilities.mjs`. Le mode aventure Kalos-Sud a été retiré
  (l'aventure Pokémon du Hub, c'est Odyssée).
- Odyssée (`odyssee/`) : jeu à plusieurs par le Hub (`odyssee/js/net/` : positions, invitations, échanges, combats entre joueurs calculés
  à l'identique des deux côtés avec une graine commune, `odyssee/js/core/pvp.js`) et code de sauvegarde (`odyssee/js/core/savecode.js`) :
  `node tools/test-odyssee-link.mjs`, à lancer quand on touche au moteur de combat d'Odyssée (`odyssee/js/core/battle.js`).
- Mini-Golf Party, robustesse : `node tools/fuzz-minigolf.mjs [coups par trou]` tire au hasard sur chaque trou et compte les balles qui traversent un mur ou restent suspendues (doit afficher 0 et 0).
  Textures photo : celles de `kart/tex/` (Poly Haven, CC0), chargées par `dressPhoto` dans `minigolf/js/textures.js`.
- Site Noir (`sitenoir/`, moteur sans DOM dans `sitenoir/engine/`) : horreur asymétrique à la première personne, l'hôte fait autorité. `node tools/test-sitenoir.mjs` teste la carte, le déplacement, les clés, les fusibles, le générateur, l'ascenseur, les coups, l'extraction, les copies des invités et le relais d'hôte, et des parties entières entre bots ; `node tools/bench-sitenoir.mjs [parties] [niveau|all] [enquêteurs]` mesure la durée des parties, les victoires et le coût d'un pas. `sitenoir/plan.html` montre une partie de bots vue de dessus. L'image passe par `sitenoir/view/post.js` (grain VHS côté enquêteurs seulement).
- Mollo ! (`mollo/`, moteur sans DOM dans `mollo/engine/`) : pantins physiques à sept points (Verlet et contraintes), muscles qui mollissent sous les coups. `node tools/test-mollo.mjs` teste les six arènes et leurs pièges, les objets (tirage à chaque manche, poêle, pétard, parapluie, banane), les collisions, le combat (visée, série de poings, garde, saisie, coup de tête), tenir debout, la marche, le saut,
  les coups, le KO, saisir / soulever / jeter, s'accrocher et se hisser, la fatigue des bras, la chute, des parties entières entre bots, l'instantané et la reprise par un nouvel hôte : à lancer quand on touche au moteur. Personnages et décors dessinés dans le code, aucun modèle externe.
- Mystère Mystère (`mystery/`, moteur sans DOM dans `mystery/engine/`) : murder mystery façon Murder Mystery 2, à la première personne, l'hôte fait autorité.
  Le manoir (`map.js`) tient sur une grille de cases de 1 m et trois niveaux (cave y = -4, rez-de-chaussée, étage y = 4) ; un escalier appartient à deux niveaux,
  on n'y entre que par le haut ou le bas. Règles, armes et réseau dans `sim.js` (les rôles ne partent jamais dans l'état public : chacun reçoit sa fiche,
  `sheet`), chemins des bots dans `nav.js` (A* entre niveaux, passages secrets compris), bots dans `bots.js`. `node tools/test-mystery.mjs` teste le manoir,
  le déplacement, les escaliers, les passages secrets, le couteau, le lancer, le revolver, la bavure, le héros, les pièces, la coupure, le secret des rôles,
  la prédiction des invités et des manches entières entre bots (à lancer quand on touche au moteur). Modèles CC0 (Quaternius, Kenney, KayKit) : `mystery/models/LICENSE.txt`.
  `?debug` expose `__mystery` (`ff(sec)` avance le moteur sans dessiner, `to(x, z, niveau)`, `start()`) ; `?autostart`, `?seed`, `?role=m|s|i`, `?mode=explore`, `?bots=4`, `?lag=150`, `?q=bas`.
- Sauvegardes en ligne (`server/saves.js`, client `odyssee/js/net/cloud.js`) : le relais range les parties dans le dépôt GitHub,
  branche `saves`, sous le code ami du compte Hub. Mise en route sur Render : `docs/SAUVEGARDES.md`. Test : `node tools/test-saves.mjs`.
  Comptes Arcadia (identifiant + mot de passe, profil chiffré dans le navigateur avant de partir) : client `hub/account.js`, serveur `server/accounts.js`
  (même branche, dossier `accounts/`). Test : `node tools/test-accounts.mjs`. Le relais doit être redéployé sur Render pour qu'ils marchent.
- Mini-Golf Party : `node tools/test-minigolf.mjs` construit les 72 trous (dont les 18 du Marathon, ~2 min) et vérifie qu'un bot expert les termine (à lancer quand on touche aux trous ou à la physique).
- Odyssée (aventure solo façon DS, `odyssee/`) : `node tools/test-odyssee.mjs` joue 600 combats aléatoires et vérifie que toute la région
  (portes, grottes, PNJ, objets, arènes) est accessible depuis Bourg-Aube sans qu'un PNJ ne bloque le passage, et que la progression
  tient (avec k badges et les capacités de terrain qu'ils débloquent, l'arène k+1 est ouverte mais pas la suivante ; Ligue à 8 badges ;
  depuis chaque quai du bateau, les légendaires de l'île sont accessibles avec les bons badges et leurs quêtes) :
  à lancer quand on touche au moteur (`odyssee/js/core/`) ou à la carte (`odyssee/js/world/`). Les données des Pokémon (`odyssee/js/data/`)
  sont générées par `tools/odyssee-donnees.mjs` à partir des tables de PokeAPI (leurs sprites viennent de PokeAPI : des remplaçants) ;
  les créatures originales sont dans `odyssee/js/data/creatures.js`. Les dessins d'origine (1024 px) sont dans `assets/graphics/`
  (portraits : `portrait_nom.png`) ; `python3 tools/odyssee-sprites.py [chars portraits crea items nature mobilier sol facades title]`
  les découpe et les réduit dans `odyssee/img/` et met à jour `odyssee/js/data/sprites.js`. Les planches « version 2 » (pixel art agrandi ×4
  ou ×8, personnages en 3 × 4 cases carrées, `nature_arbres.png`, `nature_petits.png`) sont ramenées à leur vraie résolution
  (grille retrouvée automatiquement, même au pas fractionnaire ; profils des personnages triés gauche / droite). Une case du décor
  fait 32 pixels à l'écran : tuiles (16 px) agrandies ×2, sprites « version 2 » à densité 2 (personnages en cases de 64 × 64).
  Le tileset global assemblé à la main (`assets/graphics/tileset.png` : sols, eau, rebords, hautes herbes en 4 × 4 pièces,
  kits de façade) est découpé par `python3 tools/odyssee-tileset.py [sol herbes kits]` en tuiles de 32 px (`odyssee/img/sol32/`,
  `odyssee/img/herbes/`, `odyssee/img/facades/`) ; chaque tuile y est repérée par un point de son dessin (tables `SOL`, `HERBES`, `KITS`).
  Personnages provisoires de HeartGold / SoulSilver : `python3 tools/odyssee-hgss.py [clone pret/pokeheartgold] [clone smogon/sprites]`
  (images brutes gardées dans `assets/graphics/hgss/`). Les créatures originales sont remplacées par des Pokémon
  (`odyssee/js/data/remplacants.js`, `ORIGINALES = true` pour les remettre).
  Histoire principale (la Team Éclipse, Lugia Obscur au Sanctuaire des Marées, l'Éclipse, le Conseil 4 avant Célestine, les CS Flash et Force
  et leurs recoins cachés, les quêtes annexes) : `odyssee/js/world/story.js` (PNJ et lieux) et `odyssee/js/story.js` (scènes) ;
  `node tools/test-odyssee-story.mjs` rejoue toute l'aventure dans l'ordre et vérifie que chaque étape est atteignable au bon moment.
  Histoire secondaire (la Brume) et nouveaux lieux (Lac Miroir, Grotte des Marées, Jardin des Songes, Forêt des Torii et Temple Kagura,
  Île du Magma) : `odyssee/js/world/quetes.js`. Une quête = des étapes dans `flags['Q:id']`, des PNJ qui apparaissent selon l'étape
  (`when`), des scripts (`talk`, `use`, `onWin`, `after`) qui reçoivent les outils de `game.api()`. `node tools/test-odyssee-quetes.mjs`
  joue toutes les quêtes de bout en bout (à lancer quand on touche aux quêtes). Animations de terrain HGSS (mer, rivages, fleurs) :
  `odyssee/img/hgss/`, extraites par `tools/odyssee-hgss.py`, qui découpe aussi les icônes de la carte de la région (style Pokégear,
  `assets/graphics/hgss/carte_guide.png` → `odyssee/img/carte/`).
  Rencontres : chaque zone reçoit aussi tous les Pokémon des lieux équivalents des jeux officiels (Rouge à X / Y), générés
  par `node tools/odyssee-rencontres.mjs <csv PokeAPI>` dans `odyssee/js/data/rencontres.js` (avec les points d'effort EV) ;
  le mélange avec les tables faites main se fait dans `odyssee/js/world/rencontres.js` (aussi : équipes à thème des arènes).
  Natures, EV et IV : `odyssee/js/core/mon.js` ; dégâts prévus en % : `Battle.damagePreview` (ne touche pas au générateur
  aléatoire, pour les combats en réseau). Partenaires de départ (3 par capsule) : `STARTER_CHOICES` de `world/region.js`.
  Pokémon qui suit le dresseur : `followTick` / `drawFollower` de `game.js`, sprites `odyssee/img/suiveurs.png`
  (`python3 tools/odyssee-suiveurs.py [clone pret/pokeheartgold]`, empilés sous `chars.png` au chargement).
  Journal des quêtes (`odyssee/js/core/questsData.js`) : un carnet de phrases de rappel, sans indice ni destination ;
  chaque quête y est un `started` / `done` / `notes` lu sur les drapeaux. Requêtes des habitants : `odyssee/js/world/habitants.js`
  (`show`, `bring`, `check`, `relay`, `duel`, jouées par `mission()` de `js/story.js`, acceptées = drapeau `A:id`) ;
  `node tools/test-odyssee-habitants.mjs` les joue toutes, `node tools/test-odyssee-journal-quetes.mjs` teste le journal.
  Odyssée Test (`odyssee/test/`, jeu `odysseetest` du Hub) : le vrai jeu avec `window.ODYSSEE_TEST`, un labo pour choisir
  lieu et équipe (`odyssee/js/labo/labo.js`, rien n'est sauvegardé) et un éditeur de carte (`odyssee/js/labo/editeur.js`) ;
  ses retouches exportées se collent dans `odyssee/js/world/retouches.js`, appliquées à la fin de `buildWorld`.
  Les outils de dessin (atelier graphique, vitrine, sources PixelLab, scripts de découpe des sols, kits, personnages
  et créatures à 16 px) vivent sur la branche `atelier` du fork ; `main` ne garde que le jeu.
  Personnages à 64 px (PixelLab, d'après les anciens modèles) : planches de marche dans `assets/graphics/persos64/`,
  importées dans `odyssee/img/chars.png` par `python3 tools/odyssee-persos64.py [noms]` ; portraits de combat 64 × 80 dans
  `odyssee/img/dresseurs/` (sources dans `assets/graphics/portraits-combat/`). Grottes en relief (gradins calculés au rendu,
  `caveTiers` de `world3d.js`) : roches et sols par biome dans `odyssee/img/relief.png`, faits par `python3 tools/odyssee-relief.py`.
  Terres du Sud (`odyssee/js/world/sud.js`, sous la mer du Sud, Pont de l'Austral à 8 badges) : sept villes à arène dont Métropole ; 15 badges en tout.
  Arènes à énigmes (`odyssee/js/world/arenes.js`) : chaque énigme est tirée d'une graine et vérifiée par un solveur
  (aller jusqu'au Champion et revenir) ; `node tools/test-odyssee-arenes.mjs [type]` les résout toutes (le type affiché en caractères).
  Quêtes du vélo et du permis bateau (`odyssee/js/world/vehicules.js`) : `node tools/test-odyssee-vehicules.mjs`.
  Relief du dehors (`odyssee/js/world/relief.js`) : chaque case a une hauteur (`GameMap.hg`) ; `plateau()` élève une zone,
  pose une paroi (`T.CLIFF`) sous son bord sud et des marches (`T.STAIRS`, un niveau d'écart) là où un chemin franchit un bord ;
  `massif()` fait une montagne en gradins (roche), `tourbillons()` une ceinture de tourbillons (`T.WHIRL`, infranchissable à la nage),
  `boucher()` referme les recoins isolés, `sinueuse()` lisse le tracé d'une route. Rendu à plat façon HeartGold :
  `reliefDehors` de `world3d.js`, pièces dessinées par `odyssee/js/render/relief-tex.js` ; sols générés : feuilles mortes (zone
  `theme: 'automne'`), gravier ratissé, mousse, désert, sol ocre des canyons ; zone `ombre` : sous-bois plus sombre.
  L'archipel et les îles de l'Est ne s'atteignent qu'en bateau (passeur du Cap Mirage, quais `docks`) ; les tests suivent le bateau.
  Forêt des Torii agrandie et Tour Cendrée (pagode brûlée, modèle `tourCendree` de `batiments3d.js` ; rez-de-chaussée en ruine et sous-sol
  où se joue l'évènement des trois bêtes, `m.betes` lu par `reveilBetes` de `game.js`) : `odyssee/js/world/cendree.js` ; son décor
  (souches, piliers, poutres, gravats) : `python3 tools/odyssee-cendree.py`.
  Tour Dorée (l'ancienne Tour de la Grue, modèle `pagode`, toits dorés ; Sages, Grand Sage et Plume Arc-en-ciel, Ho-Oh sur le toit) :
  `odyssee/js/world/tourdoree.js`, posée dans le parc du Temple Kagura (`quetes.js`, le temple est dans un `pavillon`) ; ses cartes
  et ses dresseurs gardent leurs anciens identifiants (`grue:tour…`, `mapId` de `buildTown`) : un bâtiment déplacé garde ainsi son intérieur.
  Mine de Pierrefort (trois niveaux, échelles, rails) : `odyssee/js/world/mine.js`. Villes agrandies : `fermer`, emprises `GRAND`,
  `lotir: { n }` pose des maisons habitées dans l'herbe libre sans couper de passage ; un garde se tient dans le couloir de sortie.
  Décor ajouté hors planches (`odyssee/js/data/decor-plus.js`) : `python3 tools/odyssee-automne.py` (arbres d'automne),
  `tools/odyssee-mine.py` (étais, wagonnets…), `tools/odyssee-desert.py` (cactus).
  Métropole : Bourse (`odyssee/js/core/bourse.js`, pricers et entretien de Pierre) et Casino (`odyssee/js/core/casino.js` ;
  Texas Hold'em, abattage sur 7 cartes, pots annexes et ordinateurs dans `odyssee/js/core/holdem.js`), comptoir dans `odyssee/js/ui/metropole.js`,
  une table dessinée par jeu dans `odyssee/js/ui/casino/` (scène en pixel art 400 × 240 et police 5 × 7 : `odyssee/js/ui/pixel.js`) :
  `node tools/test-odyssee-casino.mjs`. Salle d'arcade du Casino : quatre bornes (Tétra-Chute, Invasion, Casse-Briques, Abo le Serpent),
  moteurs sans DOM dans `odyssee/js/core/arcade.js`, meuble et écran dans `odyssee/js/ui/arcade.js`, meilleurs scores dans `state.arcade` :
  `node tools/test-odyssee-arcade.mjs`. Sprites des bornes et des machines à sous : `odyssee/img/mobilier/borne_*.png`, `machine_sous.png`.
  Rendu : les sprites sont dessinés à l'écran pixel pour pixel, ancrés à leurs pieds
  (shader `screenSprite` de `odyssee/js/render/world3d.js`), les bâtiments prennent la profondeur de leur façade.
- Island Rush (battle royale, `royale/`) : l'île vient d'une graine (`royale/engine/map.js`, île officielle `ILE`), `royale/carte.html`
  la montre en 2D. `node tools/test-royale.mjs` vérifie l'île sur plusieurs graines, le déplacement (portes, escaliers, murs, nage),
  une partie (butin, combat, construction), les copies des invités et le relais d'hôte, la prédiction : à lancer quand on touche
  au moteur (`royale/engine/`). `node tools/bench-royale.mjs [joueurs] [niveau] [graine] [minutes]` fait jouer une partie entière
  entre bots (`WATCH=bot3` suit un bot) : coût d'un pas, éliminations, bots coincés, durée de la partie.
  Parties jouées : l'hôte tient un journal local (`royale/journal.js`), lu par `royale/stats.html` ; guide des soirées de
  test dans `docs/ISLAND-RUSH-TESTS.md`.
- Dogfight 3D (`dogfight/`) : le moteur (`dogfight/engine/`, sans DOM) survole la vraie île d'Island Rush. `node tools/test-dogfight.mjs` vérifie le vol, les armes, l'IA, les règles et le réseau : à lancer quand on touche au moteur.
  `node tools/bench-dogfight.mjs [joueurs] [niveau] [éliminations] [parties]` fait jouer des bots hors navigateur. `python3 tools/glb-webp.py modele.glb` allège un modèle. Licences des modèles : `dogfight/LICENSE.txt` (F-22 à confirmer).
- Réseau (`shared/net.js`, `shared/room.js`, `server/`) : `node tools/test-relay.mjs` et `node tools/test-net.mjs`
  (prérequis : `cd server && npm install`). Le serveur relais doit être redéployé quand `server/server.js` change.
- Bastion Clash : le moteur (`bastion/engine/`, sans DOM) est testé par `node tools/test-bastion.mjs` ;
  `node tools/bench-bastion.mjs [minutes] [graine] [mode] [carte]` fait jouer 4 bots hors navigateur et mesure
  le coût d'un pas de simulation (doit rester sous 33 ms), les éliminations, les cibles des bots et les unités bloquées.
- Commits : auteur et messages en français, un message qui décrit ce que le joueur gagne.
