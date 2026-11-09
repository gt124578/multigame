# Odyssée — audit technique (nuit du 9 novembre 2026)

Branche `nuit-tech`, partie de `odyssee-dev` (37bc4514). But : un jeu techniquement irréprochable avant le level design et
le scénario. Rien n'a été touché à l'histoire ni aux quêtes ; deux bugs nets de la carte ont été corrigés et sont signalés
plus bas (§ 5) pour l'agent du level design.

## 1. Méthode, et ce que valent les chiffres

- **Parcours automatique** dans un vrai Chrome : `node tools/odyssee-parcours.mjs [--court] [--captures]`. Il lance une
  partie, saute d'un bout à l'autre de la région, marche jusqu'à des portes en tenant les touches comme un joueur (chemin le
  plus court), entre et ressort, combat, ouvre les menus, fait dix allers-retours dans le labo, sauvegarde, recharge la page
  et reprend. Il relève : étapes du démarrage (`window.__odyBoot`), durée des transitions, coût de calcul d'une image
  (`game.tick`), appels de dessin et triangles (`renderer.info`), géométries et textures de three.js, tas JavaScript après
  ramasse-miettes, part de l'écran où l'on voit le fond de la scène (le vide), joueur bloqué, erreurs de la console. Il
  compare aussi l'empreinte de la carte construite dans Chrome à celle de Node.
- **Profils CPU** (Node `--cpu-prof`, Chrome par le protocole DevTools) et petits bancs ciblés (fuites de textures tracées
  jusqu'à leur ligne de création, à-coups par fonction pendant une marche de 24 s dans Métropole).
- **Limites.** La machine (2 cœurs, 8 Go) était partagée avec deux autres agents : charge de 6 à 8 toute la nuit, la même
  construction de la carte a pris de 7,6 s à 33 s de temps réel (11 s de CPU). Le Chrome sans écran dessine en logiciel
  (SwiftShader, 4 à 6 images par seconde) : les durées d'image n'ont aucun sens absolu. On a donc comparé avant / après
  dans les mêmes conditions, en privilégiant ce qui ne dépend pas de la charge : nombres de textures, géométries, matériaux,
  appels de dessin, temps CPU, et la médiane de plusieurs essais. **À vérifier sur un vrai GPU** : § 7.

## 2. Les constats, par gravité

| # | Constat | Mesure | Gravité | État |
|---|---------|--------|---------|------|
| 1 | Démarrage long : la carte entière est construite d'un seul tenant au lancement | `buildWorld` 7,6 s CPU dans Node (machine libre), 8,3 s dans Chrome ; titre à ~11,6 s ; sur téléphone, 2 à 4 fois plus | **haute** | en partie (–1,1 s) ; reste la construction (§ 6.1) |
| 2 | Fuites de mémoire GPU à chaque changement de carte et en voyageant | +25 textures par aller-retour dans une maison ; matériaux teintés 572 → 6 887 ; textures 19 → 459 en un parcours court ; images de sol des blocs lointains (≤ 1 Mo chacune) jamais libérées | **haute** | **corrigé** |
| 3 | Injouable sur téléphone, manette ignorée en jeu | aucune commande tactile ni lecture de manette ; le menu-manette du Hub pouvait cliquer pendant la partie | **haute** | **corrigé** |
| 4 | Une exception dans une image arrête le jeu pour de bon ; toute promesse rejetée couvre l'écran du message « Oups » | boucle sans `try`, `unhandledrejection` → écran d'erreur ; carte, quêtes, trophées, amis, menu sans `finally` (joueur figé si l'écran échoue) | **haute** | **corrigé** |
| 5 | Bâtiments traversables | une avenue de ville creusait sa chaussée à travers le Centre Pokémon de Pierrefort (2 colonnes), une maison et 27 cases de la Ligue | **haute** | **corrigé** (carte, § 5) |
| 6 | Sauvegarde sur une carte disparue ou dans une poche refermée | joueur posé dans un coin du monde avec des coordonnées d'intérieur, ou coincé à vie ; les intérieurs sont numérotés (`cime:bighouse13`) : une nouvelle génération les renumérote | moyenne | **corrigé** |
| 7 | À-coups en franchissant un bloc de 16 cases | une rangée de 5 blocs + leurs bâtiments construits dans la même image : pire image dans `ensureChunks` 568 / 329 ms | moyenne | **amélioré** (126 / 209 ms) |
| 8 | Musique en arrière-plan, rafale de notes au retour | contexte audio jamais suspendu ; séquenceur à minuteur qui rattrape tous les pas manqués | moyenne | **corrigé** |
| 9 | Échelle de la mine qui dépose le joueur sur un filon (case bloquée) | `mine2 (5,4) → mine1 (35,21)` | basse | **corrigé** (carte, § 5) |
| 10 | Images téléchargées seulement après la construction de la carte | carte → images prêtes : 1,6 s (local) ; 4,5 Mo et 250 fichiers sur un vrai réseau | moyenne | **corrigé** |
| 11 | Mémoire au repos élevée | tas 101 Mo au titre, ~320 Mo après un voyage (cache du sol : 96 Mo par conception) ; textures de départ : atlas sol 2048² (16 Mo), sprites 2048² (16 Mo), personnages 1536 × 3776 (22 Mo) | moyenne | reste (§ 6.4) |
| 12 | Appels de dessin dehors | 150 à 220 par image (25 blocs de 16 cases dessinés, `frustumCulled = false`), 8 à 10 dedans ; 30 k à 90 k triangles | basse | reste (§ 6.3) |
| 13 | Fonctions de `Math` dont le résultat peut varier d'un moteur à l'autre dans `world/` | `Math.hypot` ×27, `Math.atan2` ×1, `Math.pow` ×1 (Pic Céleste) ; carte identique Node / Chrome vérifiée, pas Firefox / Safari | basse | signalé par un test (§ 6.6) |
| 14 | Le jeu ralentit sous 20 images par seconde | le pas de temps est plafonné à 0,05 s : à 10 i/s, tout va deux fois moins vite | basse | choix assumé (DS) ; à décider |
| 15 | Avertissements de la console | « Canvas2D: Multiple readback operations… willReadFrequently » (×3 à 5, lectures de l'atlas et des personnages), « GPU stall due to ReadPixels » | basse | reste |

Aucune erreur JavaScript pendant les parcours ; aucun vide à l'écran (0,0 % sur toutes les arrivées mesurées) ; la carte
construite dans Chrome a la même empreinte que dans Node ; deux constructions de suite dans Node sont identiques.

## 3. Le détail, thème par thème

### 3.1 Démarrage
Étapes mesurées dans Chrome (`window.__odyBoot`, ms depuis l'ouverture) : module chargé ~0,5–0,8 s ; écran de chargement
peint vers 0,1–0,2 s (premier rendu) ; **carte construite : +8,3 s** sur machine libre (11 à 31 s sous la charge de la nuit) ;
images : +1,6 s avant correction, +0,23 s après ; rendu prêt (atlas, arbres variés) : +0,7 à 1,8 s ; titre aussitôt.
Puis, en lançant une partie : le sol généré des blocs à l'écran (workers) avant d'ouvrir l'écran, 2 à 4 s ici.

Où passe le temps de `buildWorld` (profil Node, 7,6 s) : villes et quartiers (`grandeVille` 2,2 s), écrans de verdure
(`ecrans` 1,7 à 2,3 s, dont `vues` 1 s à elle seule), Terres du Sud (1,6 s), routes (`grandeRoute` 0,9 à 1,2 s), anciennes
villes (`buildTown` 0,7 s), énigmes d'arène vérifiées par leur solveur (0,5 s), lieux à découvrir (0,5 à 0,7 s), ramasse-
miettes 0,7 s. `GameMap.get` seul prend 0,5 s dans Chrome : ses appels sont mégamorphes (1 035 cartes aux propriétés
toutes différentes).

Pourquoi on ne peut pas simplement la mettre en cache (IndexedDB) ou la construire dans un worker : la carte contient
**182 fonctions** (scripts `talk`, `use`, `when`, `onWin`, `gate.open`, `cond`… des quêtes et des habitants), dont
beaucoup sont des fermetures sur des variables de la construction : elles ne se sérialisent pas (`structuredClone` échoue
sur la première). Voir § 6.1.

### 3.2 Fluidité
- Coût de calcul d'une image (hors dessin) : médiane 10 à 20 ms sur cette machine chargée, dont `renderer.render`
  (préparation des appels) ~60 %, `updateMatrixWorld` ~0,6 ms pour ~3 900 objets (mesuré à part : négligeable).
  Bourg-Aube compte ~3 850 objets dans la scène (les modèles de bâtiments sont faits de nombreuses pièces).
- À-coups : construction d'un bloc 15 à 25 ms en médiane, jusqu'à 300 ms ; pose des bâtiments d'un bloc jusqu'à 120 ms
  (premier modèle d'un type) ; image du sol posée 1 à 2 ms. Corrigé en partie (§ 4).
- Transitions (porte, Vol) : 2 à 7 s ici, surtout l'attente du sol généré (un seul worker sur 2 cœurs ; trois sur une
  machine courante) ; dix allers-retours dans le labo : 1,9 s en moyenne (le dehors revient du cache).
- Combat : rien de particulier côté rendu (la carte n'est plus redessinée pendant le combat).

### 3.3 Mémoire
Fuites trouvées en traçant chaque texture jusqu'à sa création : le sol généré (`Sol.poser`) et la texture des cases du
relief (`ReliefHGSS.geoSol`) n'étaient libérés ni en quittant une carte ni quand un bloc lointain était défait ; les
textures des façades et des fenêtres de nuit de la carte quittée restaient ; tous les matériaux des bâtiments restaient
dans `view.tinted` (parcourue à chaque changement d'heure ou d'ombre) ; les halos des lampadaires se dupliquaient à chaque
reconstruction de bloc ; les bâtiments de la grande carte, une fois posés, n'étaient jamais retirés.
Après correction : dix allers-retours dans le labo, textures 150 → 151 (avant : 461 → 714) ; fin du parcours court :
146 textures (avant 459), 588 matériaux teintés (avant 6 887), mêmes 28 bâtiments en scène au retour à Bourg-Aube.
Les textures qui restent sont les caches voulus (modèles de bâtiments par sorte, 96 Mo de sol généré côté CPU).

### 3.4 Robustesse
- Console : aucune erreur JavaScript sur tout le parcours (portes, grottes, mine, combat, menus, Vol, rechargement) ; les
  seules erreurs sont réseau (sauvegarde en ligne coupée exprès par le banc).
- Sauvegarde et reprise : reprise au même endroit vérifiée par le parcours ; migration d'avant la grande région testée
  (`test-odyssee-migration`) ; ajouté : carte disparue, case devenue un mur, poche refermée, champs manquants (§ 4).
- Joueur bloqué : aucun blocage réel ; deux arrêts du parcours venaient d'habitants plantés sur le chemin (le parcours
  recalcule maintenant son chemin, comme un joueur ferait un pas de côté).
- Collisions et rendu : nouveau test `test-odyssee-coherence` (§ 4). Il reste ~320 cases `BLOCK` sans décor posé sur
  la case même ; vérifiées à la main pour un échantillon : meubles de deux cases (canapés, bancs, comptoir de
  l'infirmière, fontaine, torii), murs des énigmes d'arène dessinés par l'atlas. Trois à revoir de visu :
  `monde 1005–1007,354`, `sanctuaire 12,4` (rien autour).
- Portes : chaque porte du dehors mène à un intérieur dont la sortie ramène devant elle (vérifié pour toutes).
- Caméra : aucun vide mesuré (la région se prolonge hors des bords, `vueCarte`).

### 3.5 Commandes et confort
- Clavier : complet. Manette et tactile : absents → ajoutés (§ 4).
- Taille de l'écran : rendu à l'échelle entière la plus proche de 400 px de haut. Un téléphone en paysage (844 × 390)
  voit 26 × 12 cases, très bien ; **en portrait** (390 × 844) le rendu fait 195 × 422 : 6 cases de large seulement.
  À décider : forcer le paysage (message « tourne ton téléphone ») ou une échelle propre au portrait.
- Arrière-plan : la partie est sauvegardée en passant en arrière-plan (déjà le cas) ; le son s'arrête maintenant.

### 3.6 Cohérence Node / navigateur
Empreinte de chaque carte (`tools/odyssee-empreinte.mjs`) : identique entre Node et Chrome, et entre deux constructions de
suite. Le test de cohérence refuse `Math.random`, `Math.sin`, `Math.cos` et les tris au hasard dans `world/`, et signale
les autres fonctions de `Math` dont le résultat n'est pas fixé au bit près par la norme (`hypot`, `atan2`, `pow`) : sans
risque dans Chrome / Node (même moteur), à surveiller pour Firefox et Safari (§ 6.6).

### 3.7 Tests
Tous les `tools/test-odyssee*.mjs` passent. Ce qui n'était pas couvert et cassait facilement : la mémoire (aucune mesure),
les commandes autres que le clavier, la reprise sur une carte qui a changé, la cohérence collisions / rendu, l'identité de
la carte d'une construction à l'autre. Ajouts : `test-odyssee-reprise`, `test-odyssee-commandes`, `test-odyssee-coherence`,
et le parcours `odyssee-parcours` (pas un test au sens strict : il échoue sur erreur JavaScript, carte différente, joueur
bloqué, fuite ou reprise ailleurs, mais il est long : ~15 min en `--court` sur cette machine).
`test-odyssee-schema` a été tué une fois par manque de mémoire (les trois agents en même temps) ; relancé seul, il passe.
`test-odyssee-ecrans` a échoué une fois sur une machine à charge 10 : `page.goto` attend l'évènement `load`, qui vient
après la construction de la carte (30 s ce jour-là, pour un délai de 30 s) ; relancé, il passe. Donner à `goto` un délai
plus long (comme le parcours : 300 s) éviterait ces faux échecs.

## 4. Corrigé cette nuit (un commit par correction)

1. **Parcours automatique et empreinte de la carte** — `tools/odyssee-parcours.mjs`, `tools/odyssee-empreinte.mjs`, étapes
   du démarrage dans `main.js`.
2. **Fuites de mémoire** (`render/world3d.js` : `defaireCarte`, `defaireBloc`, halos par bloc, bâtiments reposés au retour)
   — textures sur 10 allers-retours : +253 → +1 ; matériaux teintés en fin de parcours : 6 887 → 588.
3. **Une erreur passagère ne fige plus le jeu** (`main.js`, `game.js`) — la boucle continue, l'incident est noté (console,
   journal du Hub), l'écran d'erreur reste pour le démarrage ou une panne qui dure 3 s ; `try / finally` sur les écrans
   ouverts au clavier et le menu principal.
4. **Reprise sûre** (`core/reprise.js`, `game.js`) — carte disparue → dernier Centre de soins ; case devenue un mur → case
   libre la plus proche qu'on peut quitter ; poche refermée → dernier Centre ; sauvegarde incomplète complétée.
   Test : aucune fausse alerte sur les 2 103 arrivées de portes et téléporteurs.
5. **Démarrage** (`main.js`, `index.html`, `css/00-base.css`) — images téléchargées pendant la construction de la carte :
   carte → images 1 594 → 232 ms, carte → titre 3 217 → 2 118 ms (médianes de 3) ; barre de chargement animée par le
   compositeur (elle bouge pendant le calcul).
6. **Manette et tactile** (`js/manette.js`, `js/tactile.js`, `input.js`, `shared/padnav.js`) — mêmes touches que le
   clavier ; le menu-manette commun du Hub se tait quand un jeu lit lui-même la manette (`data-manette`).
7. **Bâtiments traversables et échelle de la mine** (`world/quartiers.js`, `world/mine.js`) + `test-odyssee-coherence`.
8. **À-coups entre les blocs** (`render/world3d.js`, `ensureChunks`) — blocs d'avance construits sur les images suivantes
   (6 ms par image) ; 9 blocs au lieu de 25 avant de rouvrir l'écran après une porte.
9. **Son en arrière-plan** (`audio.js`) — contexte audio suspendu quand la page est cachée, pas manqués sautés.
10. **Cache du sol sur les petits appareils** (`render/sol.js`) — 48 Mo au lieu de 96 si l'appareil annonce ≤ 4 Go.

Essayé et retiré : figer les matrices des blocs et bâtiments (`matrixAutoUpdate = false`) — gain non mesurable
(0,57 ms par image dans les deux cas pour 3 970 objets).

## 5. À l'attention du level design (changements de la carte)

- `world/quartiers.js`, `posRue` : une avenue ne repeint plus une case `BUILD` ou `DOOR`. Avant, les avenues qui partent
  des portes d'une ville filaient droit à travers les bâtiments de l'ancienne ville (Pierrefort, Plateau de la Ligue).
  437 cases du monde changent (les colonnes de bâtiments rendues), un habitant de moins ailleurs ; `test-odyssee`,
  `test-odyssee-villes`, `test-odyssee-story` au vert. Si l'avenue doit rester large, la faire contourner le bâtiment.
- `world/mine.js` : l'échelle qui remonte des galeries profondes dépose sous l'échelle (35, 23) au lieu du filon (35, 21).
- `tools/test-odyssee-coherence.mjs` attrapera la prochaine fois un bâtiment traversable, une porte qui dépose dans un
  mur, un intérieur qui ne ramène pas devant sa porte, deux constructions différentes.

## 6. Ce qui reste, et ce que je propose (par ordre d'importance)

### 6.1 Le temps de construction de la carte (le plus important)
Il fait l'essentiel du démarrage et grandira avec la carte. Trois étapes, de la moins à la plus profonde :
1. **Les points chauds sans rien changer au résultat** (vérifié par l'empreinte) : `ecrans.vues` (1 à 2 s : recherche par
   case dans une fenêtre de 27 × 19, `parEau` qui retrace une ligne pour chaque paire), `GameMap.get` mégamorphe (lire
   `m.t` directement dans les boucles chaudes), les solveurs d'arènes (0,5 s, dont le résultat ne dépend que de la graine :
   le garder dans une table). Gain attendu : 2 à 3 s. À faire avec l'agent du level design, qui travaille dans ces fichiers.
2. **Séparer le terrain des scripts** : `buildWorld` = un terrain pur (cases, hauteurs, bâtiments, positions, données) puis
   une passe courte qui attache les fonctions (quêtes, habitants, portes à condition) par identifiant. Le terrain devient
   sérialisable.
3. **Puis le mettre en cache** : construit dans un worker au premier lancement (l'écran titre reste vivant), gardé dans
   IndexedDB sous une clé = `CARTE_VERSION` + empreinte du code de `world/` ; les lancements suivants lisent le terrain
   (≈ 10 Mo de tableaux, quelques centaines de ms) et ne refont que la passe des scripts. Le démarrage passerait de ~11 s
   à ~2 s.

### 6.2 Les à-coups qui restent
Un bloc reste construit d'une traite (jusqu'à ~300 ms ici) : construire le relief d'un bloc par morceaux, ou dans un
worker comme le sol généré. Les premiers bâtiments d'un modèle (`geometriesModele`) coûtent jusqu'à 120 ms : préparer les
modèles de la ville pendant la transition d'arrivée.

### 6.3 Appels de dessin
Les 25 blocs autour du joueur sont tous dessinés (`frustumCulled = false` sur leurs maillages, pour les sprites dessinés
depuis leurs pieds). Un test de visibilité par bloc (boîte du bloc élargie de 3 cases et de la hauteur du relief) n'en
garderait que 6 à 9 : de l'ordre de 40 % d'appels en moins dehors.

### 6.4 Mémoire sur téléphone
Cache du sol généré : 96 Mo, réduit à 48 Mo cette nuit quand `navigator.deviceMemory ≤ 4` (Chrome, Android ; inconnu
sur iOS, où il reste à 96 Mo : à mesurer sur un iPhone). Planche des personnages en
1536 × 3776 : au-dessus de 2048, la limite de certains vieux GPU mobiles ; la répartir sur deux textures ou la passer en
4096 × 2048. Libérer les géométries partagées des modèles en quittant une ville est déjà fait (elles sont renvoyées au
GPU au retour).

### 6.5 Confort
Portrait sur téléphone (§ 3.5). Vitesse sous 20 i/s (§ 2, n° 14) : passer à un pas de temps fixe avec rattrapage si
l'on veut la même vitesse partout. Remplacer les lectures `getImageData` répétées par un canvas `willReadFrequently`.

### 6.6 Cohérence entre navigateurs
Remplacer `Math.hypot` par `Math.sqrt(dx * dx + dy * dy)` (exact au bit près, comme toute racine carrée IEEE) et, au Pic
Céleste, `Math.atan2` / `Math.pow` par des versions maison (comme `sin` / `cos` de `mapgen.js`) ; puis faire tourner
l'empreinte dans Firefox (Playwright sait l'installer) au parcours.

## 7. À vérifier sur un vrai GPU et un vrai téléphone
- Images par seconde dehors (Bourg-Aube, Métropole, Chaîne Céleste) et dans les grottes : le relief HGSS est un shader
  par pixel assez lourd ; le Chrome sans écran ne dit rien de sa vraie charge.
- Les à-coups en marchant (§ 6.2) : le parcours donne le coût CPU, pas l'effet ressenti.
- Le tactile : taille des boutons, croix sous le pouce, dialogues ; Safari iOS (zones sûres, son débloqué au premier
  appui).
- Mémoire GPU réelle sur un téléphone d'entrée de gamme après une heure de voyage.

## 8. Outils
- `node tools/odyssee-parcours.mjs [--court] [--captures] [--accel K] [--ecran LxH] [--sortie dossier]`
- `node tools/odyssee-empreinte.mjs [--deux]`
- `node tools/test-odyssee-coherence.mjs [--vite]`, `node tools/test-odyssee-reprise.mjs`,
  `node tools/test-odyssee-commandes.mjs`
