# Fief Maudit — conception

Survie en coopération en 3D (Three.js), vue à la troisième personne, de 1 à 6 joueurs, avec des bots pour compléter.
Dossier : `fief/`. Ce document décrit le jeu visé, les assets retenus et l'ordre de développement.
Où on en est : **étapes 6 et 7 faites**, le jeu est complet ; étape 8 : un début plus vif (voir la section 8).

## 1. L'idée

Une malédiction a vidé la vallée. Les joueurs sont les derniers habitants d'un village en ruine, au pied d'un château
effondré. Le jour, ils récoltent et rebâtissent le village. La nuit, la brume monte et les morts sortent de la crypte du
château pour tout raser. S'ils tiennent jusqu'à la **lune rouge** (fin du jour 10), ils descendent dans la crypte
et brisent la malédiction en battant le **Roi-Squelette**.

Ce qui le distingue des autres jeux d'Arcadia :

| Jeu | Différence |
|---|---|
| Bastion Clash | pas de vue de stratège : chacun a un corps, une hache, une épée |
| Outbreak | le jour compte autant que la nuit, et c'est là qu'on construit |
| Convoy Storm | la base ne bouge pas, elle grandit |
| Island Rush | personne ne s'affronte, la construction se fait avec de vrais bâtiments médiévaux et pas des murs génériques |

## 2. Une partie

- **10 jours** en mode Expédition. Un jour dure environ 4 min 30 et une nuit 2 min 30, donc une partie complète prend entre 70 et 80 minutes.
  On peut **sauvegarder entre deux jours** (l'hôte garde l'état ; il pourra plus tard aller sur le serveur de sauvegardes).
- L'aube compte les dégâts, les blessés et la nourriture mangée, puis on repart.
- Le jour 5 et le jour 10 sont des **nuits de siège** (plus longues, boss). Après la nuit 10, le portail de la crypte s'ouvre.

### Le jour : récolter et bâtir

Ressources, toutes communes au village sauf ce qu'on a dans les mains :

| Ressource | Où | Geste |
|---|---|---|
| Bois | arbres autour du village | hache (animation `1H_Melee_Attack_Chop`) |
| Pierre | carrière, ruines du château | pioche |
| Fer | mine, armures des squelettes tombés | pioche, ramasser |
| Nourriture | champs (semer, attendre deux jours, récolter), gibier, poissons de la rivière | faux, arc, canne |
| Os maudits | squelettes tués la nuit | ramasser (`PickUp`) |

On porte une ressource à la main jusqu'à l'entrepôt (une bûche, un bloc, un sac). Les **grosses poutres** se portent à
deux. C'est le premier geste coop du jeu, et il ralentit volontairement le joueur seul.

Bâtiments, posés sur des emplacements prévus du village (des fondations en ruine qu'on relève) :

| Bâtiment | Coût | Effet |
|---|---|---|
| Entrepôt | déjà là | stock commun ; s'il tombe, on perd la moitié du stock |
| Feu de camp | déjà là | soigne lentement, réchauffe ; point de réapparition |
| Maison | bois, pierre | +1 lit (on récupère à l'aube) ; un bot villageois en plus |
| Forge | pierre, fer | épées, haches, armures ; répare les portes |
| Moulin + champ | bois | pain (rassasie plus longtemps que la viande) |
| Puits | pierre | eau ; éteint un incendie |
| Chapelle | pierre, os maudits | ressusciter un fantôme ; eau bénite (dégâts ×2 sur les morts) |
| Palissade puis rempart | bois puis pierre | murs avec portes, sur la grille |
| Tour de guet | bois, fer | arbalète fixe à 1 joueur, voit à travers la brume |
| Braseros | bois, fer | repoussent la brume (voir plus bas) |

Le village gagne un niveau tous les trois bâtiments (hameau, village, bourg). Chaque niveau débloque de nouveaux plans à la forge.

### La nuit : tenir

- La **brume** avance depuis la forêt. Dans la brume, les squelettes tombés se **relèvent** au bout de quelques secondes
  (animation `Death_C_Skeletons_Resurrect`) ; il faut les finir à l'eau bénite ou les traîner dans la lumière.
- Les **braseros et torches** dessinent des cercles de lumière que la brume ne traverse pas. Ils brûlent du bois et il
  faut les recharger pendant la nuit. Quelqu'un doit s'en occuper.
- Les squelettes sortent du sol (`Skeletons_Awaken_Floor`) à la lisière, visent d'abord le bâtiment le plus faible,
  puis les joueurs qui les gênent.
- La **cloche** du village : un joueur qui la sonne montre à tous, sur la boussole, d'où vient la prochaine vague.

| Ennemi | Modèle KayKit | Comportement |
|---|---|---|
| Squelette | Skeleton_Minion + lame | en groupe, frappe les portes |
| Guerrier | Skeleton_Warrior + bouclier | bloque de face, il faut le contourner |
| Archer | Skeleton_Rogue + arbalète | reste en retrait, vise les gens sur les remparts |
| Mage | Skeleton_Mage + bâton | relève les morts autour de lui, éteint les torches |
| Chevalier noir (siège du jour 5) | Skeleton_Warrior agrandi, hache à deux mains | enfonce une porte en trois coups |
| Roi-Squelette (crypte) | Skeleton_Mage agrandi, couronne | boss en trois phases |

### Survie

- **Faim** (baisse lentement, on mange au stock commun) et **froid** la nuit, loin du feu ou des braseros.
- À 0 PV on tombe à terre. Un coéquipier relève en restant 4 s à côté (`Interact`). Si personne ne vient, on devient un
  **fantôme** : on voit tout, on peut montrer des choses du doigt, mais il faut une chapelle pour revenir.
- Si tous les joueurs sont fantômes, ou si l'entrepôt **et** le feu de camp tombent la même nuit, la partie est perdue.

### Le final : la crypte

Un donjon court sous le château (KayKit Dungeon Remastered) : trois salles, un levier à tenir à deux, une salle qui
s'inonde de brume, puis le Roi-Squelette. Tous les joueurs vivants descendent ensemble, les fantômes reviennent pour
l'occasion. Le village continue d'exister au-dessus : les bots villageois tiennent les braseros.

## 3. Métiers et personnages

Un métier par joueur, choisi sur l'écran d'accueil (deux joueurs peuvent prendre le même). Les personnages sont les
cinq de KayKit Adventurers, qui partagent le squelette et les animations des squelettes ennemis.

| Métier | Modèle | Bonus | Capacité (touche F) |
|---|---|---|---|
| Bûcheron | Barbarian | récolte du bois ×1,5, porte une poutre seul | **Grand coup** : renverse tout ce qui est devant |
| Chevalier | Knight | +30 % de PV, bloque au bouclier | **Rempart** : provoque les squelettes proches pendant 6 s |
| Chasseuse | Rogue | arc, voit le gibier et les archers à travers la brume | **Fusée** : éclaire une zone et fait fuir la brume 10 s |
| Prêtre | Mage | soigne en zone, l'eau bénite lui coûte moitié moins | **Bénédiction** : un brasero brûle sans bois jusqu'à l'aube |
| Forgeronne | Rogue_Hooded | construit et répare deux fois plus vite | **Barricade** : pose un chevalet de bois instantané |

Couleur de cape ou de bouclier par joueur, comme les pions des autres jeux.

## 4. Modes et réglages

- **Expédition** : 10 jours puis la crypte.
- **Sans fin** : pas de crypte, les nuits durcissent à l'infini ; score = nuits tenues.
- **Difficulté** : Paisible (pas de brume qui relève les morts), Normale, Peste noire (nourriture qui pourrit, nuits plus longues).
- **Bots** : coéquipiers IA pour compléter (récoltent, défendent, relèvent) et bots villageois sans arme qui portent les ressources.

## 5. Commandes

| Clavier / souris | Manette | Action |
|---|---|---|
| ZQSD (lues par position) | stick gauche | se déplacer |
| Souris | stick droit | caméra |
| Clic gauche | RT | frapper / récolter / tirer |
| Clic droit | LT | bloquer / viser |
| E | A | interagir (porter, déposer, relever, sonner, recharger) |
| B | Y | plans de construction |
| F | RB | capacité du métier |
| 1 à 4, molette | croix | changer d'outil |
| Maj | L3 | courir |
| Tab | Vue | carte du village et stock |

## 6. Assets retenus

Tout est en **CC0** (domaine public). Les quatre premiers packs se récupèrent sur GitHub, sans passer par itch.io.

| Pack | Auteur | Ce qu'on prend | Source |
|---|---|---|---|
| Medieval Village MegaKit (Standard, 176 glTF) | Quaternius | murs plâtre et brique, colombages, portes, fenêtres, volets, toits en tuiles, escaliers, clôtures, charrette, cheminées | github.com/J-Ponzo/gltf-medieval-village-megakit (copie de l'archive itch.io, licence d'origine incluse) |
| Character Pack : Adventurers | Kay Lousberg | les 5 personnages, épées, haches, arbalètes, boucliers, bâton, chope | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| Character Pack : Skeletons | Kay Lousberg | 4 squelettes, leurs armes ; animations de réveil et de résurrection | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 |
| Dungeon Remastered | Kay Lousberg | la crypte (murs, sols, portes, coffres, torches, leviers) | github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 |
| Nature Kit, Survival Kit | Kenney | arbres, rochers, tonneaux, feu de camp | déjà dans `royale/models/` |
| Fantasy Props MegaKit (optionnel) | Quaternius | étals, nourriture, outils, potions, meubles de la forge | quaternius.itch.io (à télécharger à la main : itch.io n'est pas joignable depuis l'environnement de Claude) |

Notes de mise en forme, vérifiées sur les fichiers :

- Un pan de mur du MegaKit fait **2 m de large et 3,12 m de haut**, un sol 2 × 2 m. Island Rush construit sur une
  grille de 4 m avec des étages de 3,2 m (`royale/engine/build.js`) : un emplacement de rempart = deux pans, et les
  hauteurs tombent presque juste. On reprend la logique de `slotFor` et de l'effondrement, avec une grille de 2 m.
- Les personnages KayKit font environ 4 Mo chacun parce que chaque fichier contient ses 76 à 95 animations. On garde
  une vingtaine de clips communs dans un seul fichier (`fief/models/anims.glb`), on retire les animations des
  personnages, et on compresse (gltf-transform : meshopt, textures en 512 px). Objectif : moins de 6 Mo pour tout le jeu.
- Clips utiles déjà présents : `Idle`, `Walking_A`, `Running_A`, `Running_Strafe_Left/Right`, `Jump_*`,
  `1H_Melee_Attack_Chop` (hache), `2H_Melee_Attack_Chop` (pioche), `1H_Melee_Attack_Slice_*`, `Block`, `Blocking`,
  `2H_Ranged_Aiming/Shoot/Reload`, `Spellcast_Raise` (soin), `Interact`, `PickUp`, `Use_Item`, `Throw`, `Hit_A/B`,
  `Death_A/B`, `Lie_Idle` (à terre), `Lie_StandUp` (relevé), `Cheer`, et pour les squelettes
  `Skeletons_Awaken_Floor`, `Death_C_Skeletons`, `Death_C_Skeletons_Resurrect`, `Spellcast_Summon`.
- Porter une bûche : pas de clip dédié. On utilise `Walking_A` en bloquant les bras (os des bras figés en pose `Use_Item`).
- Crédits dans `fief/models/LICENSE.txt`, sur le modèle de `mystery/models/LICENSE.txt`.

## 7. Technique

Même découpage que Site Noir et Mystère Mystère :

```
fief/
├── index.html, fief.css, app.js     rôle hôte / invité / solo, migration d'hôte, écrans
├── input.js                         clavier, souris, manette (shared/padplay.js)
├── engine/                          moteur PUR, sans DOM, testable sous Node
│   ├── rng.js                       aléa reproductible
│   ├── map.js                       vallée : relief, rivière, forêt, emplacements du village, château
│   ├── build.js                     plans, coûts, grille de 2 m, points de vie, effondrement
│   ├── sim.js                       jour/nuit, ressources, faim, froid, combat, brume, à terre, fantômes
│   ├── enemies.js                   vagues, cibles, résurrection dans la brume, boss
│   ├── bots.js                      coéquipiers et villageois (récolte, défense, relever)
│   ├── nav.js                       chemins sur la grille (A*), recalculés quand un mur est posé
│   └── crypt.js                     le donjon final
├── view/                            Three.js : scene, village (assemblage du MegaKit), persos (AnimationMixer),
│                                    brume (shader de hauteur), lumières des braseros, HUD, sons
└── models/                          glTF compressés + LICENSE.txt
```

- **Réseau** : l'hôte simule à 30 Hz et envoie 15 instantanés par seconde (positions, PV, ennemis proches) ; le monde
  (bâtiments, stock, braseros) part seulement quand il change. L'invité prédit son propre déplacement, comme dans
  Island Rush et Site Noir. Relais d'hôte si l'hôte quitte.
- **Sauvegarde** entre deux jours : `sim.snapshot()` sérialise tout l'état ; un invité qui devient hôte repart de là.
- **Performances** : instancier les pans de mur identiques (InstancedMesh), 40 squelettes au plus en même temps,
  les effets baissent seuls si la machine peine (comme Convoy et Birdie Party).
- **Sons** : synthétisés (WebAudio) au départ, puis enregistrements CC0 si besoin.
- **Tests** : `node tools/test-fief.mjs` (construction et effondrement, cycle jour/nuit, une nuit jouée entre bots,
  résurrection dans la brume, relever un joueur, instantané et reprise par un nouvel hôte, une partie complète de bots
  en accéléré).
- **Hub** : entrée dans `hub/games.js` et fiche dans `HUB_GAME_INFO` ; portée de commit `fief` à ajouter à
  `tools/changelog-auto.mjs` ; ligne dans `AGENTS.md` et section dans le README.

## 8. Étapes

Chaque étape se termine par une version jouable, poussée, et validée avant de passer à la suivante.

1. **Conception** (ce document). ✔
2. **Le village vide** : récupérer et compresser les assets, la vallée, le village en ruine assemblé avec le MegaKit,
   un personnage animé qui court, coupe un arbre et porte une bûche à l'entrepôt. Seul, sans réseau. ✔ (version 4.51)
   - Assets : 5,6 Mo en tout (`tools/fief-assets.mjs`). La porte en planches est `Door_8_Round` ; les ruines n'ont pas de
     pièces cassées dans le kit, on pose des pans entiers, des pans rabaissés et des trous, avec lierre et briques tombées.
   - La caméra s'arrête avant les murs et les toits, et le feuillage entre elle et le joueur devient ajouré (tramé)
     dans un cercle autour du personnage : sinon, en forêt, on ne voit plus rien.
   - Pour porter, les jambes jouent `Walking_A` et les bras `2H_Melee_Idle` (pistes séparées par os).
   - Lancé depuis un salon, chacun joue dans sa propre vallée jusqu'à l'étape 4.
3. **Une nuit** : brume, braseros, squelettes qui se réveillent et attaquent, combat, à terre / relevé. Toujours seul, avec un bot. ✔ (version 4.52)
   - Réglages actuels : jour 270 s dont 25 s de crépuscule, nuit 150 s ; 6 squelettes la première nuit (+3 par nuit, un tiers
     de guerriers) ; braseros : 70 s au départ, +50 s par bûche, 150 s au plus, 0,6 s brûlée par seconde ; entrepôt 600 PV.
   - Le bois rangé peut ressortir de l'entrepôt (E devant la porte) : c'est lui qui nourrit les braseros.
   - Seuls les soldats (Skeleton_Minion) et les guerriers (Skeleton_Warrior) sont là ; archers, mages et chevalier noir viendront avec les sièges.
   - Défaite : on rejoue depuis le crépuscule (instantané pris à la cloche) ou depuis le début.
4. **À plusieurs** : branchement au Hub, hôte qui fait autorité, prédiction, poutres à deux, métiers. ✔ (version 4.54)
   - Réseau : état compact (~400 octets) 15 fois par seconde, monde à chaque changement et toutes les 2 s, instantané complet toutes les 4 s
     (il sert au relais d'hôte). L'invité prédit seulement son déplacement ; ses gestes (hache, E) passent par l'hôte.
   - Métiers : bonus passifs pour l'instant (vie, dégâts, vitesse, portée, soin, relève, bûches, réparation). Les capacités sur F viendront plus tard.
   - Poutres : un chêne donne une bûche et une poutre (3,4 m). Seul, on ne peut que tenir son bout ; le bûcheron la porte seul, plus lentement.
     Elles s'empilent à l'entrepôt (stock « poutre ») pour la construction de l'étape 5.
   - Banc d'essai : `tools/fief-duo.html` (deux ou trois jeux dans une page, messages relayés comme par le salon).
5. **La boucle complète** : construction des bâtiments, faim, froid, nourriture, 10 jours, sauvegarde, sièges des jours 5 et 10. ✔ (version 4.55)
   - Chantiers : E devant une ruine (le stock de l'entrepôt paie), puis des coups de marteau (clic). Maisons 8 bois + 1 poutre, forge et moulin
     10 + 2, chapelle 14 + 3. Pas encore de pierre : la carrière et la pioche viendront avec d'autres bâtiments (puits, remparts, tours).
   - Effets : maison +15 PV et abri (soin la nuit), forge +30 % de dégâts, moulin faim ×0,5 et +4 vivres à l'aube, chapelle : pas de résurrection
     à moins de 24 m, et les tombés y reviennent au bout de 20 s.
   - Faim : 100 → 0 en ~520 s ; baies (2 vivres le panier, repoussent en 300 s) ; manger rend 55. Froid : 0,5 PV/s après 3 s dans le noir.
   - Sièges : nuits 5 et 10 de 200 s, +30 % de squelettes, chevalier noir (420 PV, frappe l'entrepôt ×3), deux à la dixième nuit.
   - Le nombre de squelettes suit la taille de l'équipe (×0,75 seul, ×1,6 à six). Sans bâtiment, trois bots tiennent 5 à 10 nuits en Normale
     et gagnent en Paisible : avec la forge, les maisons et la chapelle, l'équipe a de quoi faire mieux.
   - Sauvegarde : `localStorage` de l'hôte (jour, stock, bâtiments, arbres abattus, braseros) à chaque aube et à chaque bâtiment relevé ;
     les joueurs repartent du feu de camp, vie pleine. Pas encore de sauvegarde en ligne (`server/saves.js`).
6. **La crypte** et le Roi-Squelette, écran de fin, `H.report`. ✔ (version 4.56)
   - La crypte (`engine/crypt.js`) est une zone à part, loin au nord (z ≈ -330), dessinée sur une grille de cases de 2 m : entrée, salle des leviers,
     herse, couloir de brume, salle du trône. On y descend par la porte du donjon (E), à l'aube du onzième jour ; l'horloge s'arrête, la faim aussi.
   - Leviers : tenir E près de chacun ; les deux ensemble pendant 1,2 s lèvent la herse (un seul suffit s'il ne reste qu'un joueur debout).
   - Couloir de brume : 1 + 2 squelettes par joueur debout, qui s'y relèvent. Torches : 10, rayon 5,5 m, les morts tombés près d'elles restent
     à terre, et on y reprend 4 PV/s loin des squelettes.
   - Le Roi : 1 400 PV × (0,45 + 0,25 par joueur), 22 dégâts (×0,8 à deux ou moins). Phase 1 : appelle 1 à 2 morts toutes les 14 s ; sous 60 % toutes les 11 s ;
     sous 30 % toutes les 9 s, souffle les quatre torches du trône et frappe 30 % plus fort. Sa mort brise la malédiction (victoire).
   - Défaite dans la crypte : « Retenter la crypte » repart de l'instantané pris à la première descente.
   - `H.report` : une ligne par partie, score = 10 par nuit tenue + squelettes abattus + 100 si le Roi tombe.
   - Trois bots seuls battent le Roi à peu près une fois sur deux en Normale ; des joueurs qui esquivent et rallument les torches font mieux.
7. **Finitions** : sons, musique, écran d'accueil, réglages graphiques, mode Sans fin, manette et tactile. ✔ (version 4.56)
   - Capacités (F, manette Y, bouton tactile) : Grand coup (bûcheron, 45 dégâts en arc, sonne et repousse, 18 s), Rempart (chevalier, attire les morts à 10 m
     et divise ses dégâts par deux pendant 6 s, 25 s), Fusée (chasseuse, éclaire 7,5 m pendant 14 s à 9 m devant elle, 22 s), Prière (prêtre, +35 PV à 9 m
     et aide à relever, 28 s), Barricade (forgeronne, 150 PV, 45 s, les morts doivent la casser, 25 s). Les bots s'en servent.
   - Musique synthétisée (`view/music.js`) : jour, nuit, crypte, Roi, en fondu. Le son passe par le panneau Réglages commun (`shared/volume.js`).
   - Qualité basse / moyenne / haute : finesse de l'image, ombres, forêt lointaine, nappes de brume (`scene.setQuality`).
   - Le mode Sans fin et la manette existaient déjà ; l'écran d'accueil prend la vallée en fond.
8. **Un début plus vif** (retour de partie : « on s'ennuie au début »). ✔ (version 4.58)
   - Premier jour de 150 s (`CYCLE.first`, `dayLen`), les suivants 220 s.
   - Jusqu'à trois bûches portées (`LOAD_MAX`, `p.load`) : on fait trois fois moins d'allers-retours.
   - Coffres gardés (`placeChests`, `LOOT`, `CHEST`) : 2 + un par paire de joueurs, dans des clairières à 28-95 m du feu ; gardes endormis
     (`state: 'sleep'`, `guard`) réveillés à 11 m, qui ne s'éloignent pas à plus de 22 m et retournent dormir. Le premier coffre est le plus proche,
     un seul garde, 5 bûches : on se bat dès la première minute. De nouveaux coffres à chaque aube.
   - Cloche au feu de camp (`canRing`, `ring`) : passer directement au crépuscule.
