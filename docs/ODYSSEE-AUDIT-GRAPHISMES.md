# Odyssée — audit des graphismes face à HeartGold / SoulSilver

Nuit du 9 novembre 2026, branche `nuit-gfx` (partie de `odyssee-dev`, 37bc4514).
Périmètre : l'apparence du monde (`odyssee/js/render/`, `odyssee/js/data/sprites.js`, `odyssee/img/`, outils de dessin).
Les captures (1280 × 800, rendu logiciel du Chrome sans écran) sont dans `/tmp/nuit/gfx/` :
`avant/` (état de départ), un dossier par chantier, et `cmp/` pour les comparaisons avant / après (citées ci-dessous).

## 1. En bref

Le socle est déjà très au-dessus d'un fangame : sol généré organique, relief en vraie 3D façon HGSS, bâtiments
en volume avec un style par ville, arbres variés, sprites au pixel près. Ce qui manquait le plus face à HGSS, ce
n'était pas la finesse du dessin mais **la vie et la lumière** : un monde figé, une heure de la journée qu'on ne
voyait presque pas, une météo invisible, des intérieurs tous identiques, et une série de défauts qui cassaient
l'illusion (ombres en pavés, maisons fantômes, décor deux fois plus gros que les arbres, lisière d'automne tirée à
la règle, trait vert sur les plages, talus illisibles, flèches d'arène perdues dans le damier).

Une cause commune à plusieurs défauts : **le rendu mélange les couleurs en lumière linéaire** (sortie sRGB), mais
les teintes et les ombrages avaient été réglés comme des valeurs d'écran. Un facteur 0,66 ne fonce l'image que de
17 % à l'écran : la teinte de l'heure, l'ombre des sous-bois et le dégradé des talus étaient presque effacés.
Corrigé pour ces trois-là ; à garder en tête pour tout nouveau réglage (voir section 6).

Cette nuit : 23 commits (section 4). Restent surtout des choix de fond (toits, fleurs animées, mobilier par ville).

## 2. Constats, thème par thème

### Lumière et ambiance

| HGSS | Odyssée avant | Après cette nuit |
|---|---|---|
| Matin, jour, soir, nuit nettement différents | Teintes appliquées en lumière linéaire : à 19 h on voyait à peine un soir (`03-heures-avant.png`) | Aube rosée, matin doré, soir orangé, nuit bleue (`03-heures-apres.png`, `03-soir-aube.png`) |
| La nuit, fenêtres allumées, lampadaires | Un halo sur la lanterne, rien au sol | Flaques de lumière tramées sous les lampadaires, lumière des portes sur le seuil et le perron, fenêtres jaune chaud (`03-nuit-ville.png`, `03-nuit-port.png`) ; lanternes de pierre, braseros qui vacillent, faisceau tournant des phares (`10-lanternes-braseros.png`) |
| Pluie, neige, sable bien visibles, ciel couvert | Particules d'un pixel : météo quasi invisible | Pluie en traits fins qui éclaboussent, flocons qui tombent en se balançant, traînées de sable, cendre ; ciel assombri, jauni, grisé (`07-meteo.png`, `07-pluie.png`) |
| Ombre ronde et nette sous chaque sprite | Ellipse 16 × 8 étirée en pavés ; damier sous les forêts (`01-ombres-volcan.png`) | Ombres à la densité de l'écran, une seule couche là où elles se croisent (`01-ombres-desert.png`) |
| Forêts sombres (Bois aux Chênes) | Ombre des sous-bois presque effacée (lumière linéaire) | Sous-bois nettement plus sombre et plus vert, lisible (`19-sous-bois.png`) |

### Eau

Eau générée en 8 images (écume qui va et vient, vaguelettes, reflets, rides), tourbillons, koï : **au niveau de
HGSS**. Défauts corrigés : trait d'herbe sombre peint sur toutes les plages (`06-plage.png`) ; carpes koï toutes en
rang, au pas, au centre de leur case (`21-koi.png`). Manquent : cascades (pas de donnée de carte).

### Animations du décor

HGSS : fleurs et eau animées, quelques fumées. Odyssée avant : herbes hautes qui s'écartent, eau, koï ; rien d'autre.
Après (`11-vie.png`, `14-moulin.png`, `15-oiseaux-poussiere.png`, `08-empreintes-sable.png`) : fumée des cheminées,
papillons le jour, lucioles la nuit, feuilles d'automne et pétales qui tombent, vols d'oiseaux en V, ailes des
moulins qui tournent, empreintes dans le sable, la neige et la cendre, poussière en retombant d'un rebord. Un seul
nuage de points près du joueur : deux appels de dessin, aucun triangle. Manquent : fleurs du sol qui se balancent
(le sol généré est une image fixe), drapeaux.

### Personnages

Marche, course, vélo, surf, rebords, « ! », Pokémon qui suit, herbes : tout existe. Ombre corrigée, bulle « ! »
repassée à densité 2. Reste : quelques personnages provisoires de HGSS à côté des personnages à 64 px.

### Bâtiments

- **Fondu derrière un bâtiment** : réglé sur `b.h` (façade) au lieu du modèle ; derrière une maison au toit pentu, le
  dresseur disparaissait plusieurs pas (`02-fondu-maison2.png`). Réglé maintenant sur ce que le modèle couvre à
  l'écran. Et le fondu transparent montrait l'intérieur des modèles (étages du phare en disques rouges) : remplacé
  par une trame ordonnée au pixel du jeu, opaque (`02-fondu-trame.png`, `09-phare-trame.png`).
- **Décor hors emprise** : bûchers, casiers, bambous et cactus posés contre un pignon débordaient sur la case voisine
  (on marchait au travers, la boîte aux lettres s'y plantait) ; corrigé (`16-bucher-emprise.png`). Restent, minimes :
  la cabane de chasseur (0,7 case à gauche) et les perrons devant les portes (voulu).
- **Toits très présents vus de dessus** (`12-constats-grottes-toits.png`) : ce n'est pas la pente mais la géométrie :
  à 55°, un toit occupe à l'écran au moins la profondeur de l'emprise, plus sa hauteur. Le plus présent est en fait
  le toit rouge des Centres. Essai livré : `?toits=bas` (pente plus douce, corps de logis moins profond que l'emprise,
  le toit couvrant toujours à l'écran le fond de l'emprise) : `22-essai-toits-bas.png`. À trancher.

### Intérieurs

Avant : toutes les maisons de toutes les villes avaient le même mur crème et le même parquet, mur du fond étiré
deux fois en hauteur. Après (`05-interieurs-villes.png`, `05-interieur-aube.png`) : murs, lambris, plinthe, bordure
et sol tirés de l'architecture de la ville, fenêtres sur le ciel du jour ou de la nuit, et un objet de la ville
accroché au mur (bouée, pioches, kakejiku, bois de cerf, kilim, barre de navire, piments, filet, chandelier…).
Centres, boutiques, arènes et lieux uniques inchangés. Reste : le mobilier est le même partout.

### Grottes

Parois en pierres bombées, gradins, Flash, échelles, rails : bon. Le dessus des massifs était un grand aplat clair
(la moitié de l'écran dans la Route Victoire) : il fonce maintenant case après case vers le cœur du massif, par
paliers tramés, jamais noir (`13-grotte-victoire.png`, `13-grotte-mine.png`).

### Transitions

Fondu au noir aux portes, rideau de combat, attente du sol généré : propre. HGSS ouvre la porte avant le fondu
(petit plus possible, dans `game.js`).

### Cohérence de style

- **Densités mélangées** : le décor du tileset du DS (cerisiers ×1 050, érables ×1 065, bancs, lanternes, torii,
  fontaines…) était à densité 1 à côté d'arbres et de personnages à densité 2. Repassé à densité 2 au chargement
  (Scale2x, touffes de feuillage), sans couleur nouvelle (`20-densite-cerisier-erable.png`). Aussi : ombres, mur du
  fond des intérieurs, particules de météo, flèches des arènes (`17-fleches-arene.png`).
- **Bords nets** : lisière d'automne tirée à la règle (arbres et sol) : fondue sur quelques cases (`04-automne.png`,
  `04-automne-bord.png`).
- **Talus d'herbe** illisibles (dégradé effacé par la lumière linéaire) : lèvre claire et versant qui fonce
  jusqu'au pied, comme HGSS (`18-talus.png`). Les parois de roche n'ont pas changé.
- Écran de combat et interface : pas de défaut visuel net, pas touchés.

## 3. Priorités retenues pour la nuit

1. Ce qui se voit partout : ombres, lumière de l'heure, fondu des bâtiments, densité du décor.
2. La vie à l'écran et les lumières de nuit.
3. La météo, qui existait mais ne se voyait pas.
4. Les intérieurs, tous identiques.
5. Les défauts ponctuels : lisière d'automne, plages, talus, grottes, flèches, koï, décor hors emprise.

## 4. Ce qui a été fait cette nuit

| Commit | Ce que le joueur gagne |
|---|---|
| e341a354 | Ombres au sol fines, sans damier sous les forêts |
| cd2f9a97 | Une maison s'efface dès qu'elle cache le dresseur (hauteur réelle du modèle) |
| 6ae624c7 | Un vrai soir, une vraie nuit, des lampadaires qui éclairent la rue |
| d5b7c13c | La Forêt des Torii prend ses couleurs d'automne, lisière fondue |
| ceced2f3 | Fumée des cheminées, papillons, lucioles, feuilles qui tombent |
| 066fb8bb | Chaque maison meublée à l'image de sa ville (murs, sols, fenêtres) |
| 798459e6 | Plus de trait vert le long des plages |
| fe805c1e | Pluie, grêle, sable et cendre visibles, ciel couvert |
| 3d56097f | Empreintes de pas dans le sable, la neige et la cendre |
| b56b4488 | Lanternes, braseros et phares éclairent la nuit |
| de082ea1 | Fondu des bâtiments en trame au lieu de la transparence |
| 50212445 | Dans les grottes, la roche fonce vers le cœur des massifs |
| 2236f19b | Il neige doucement sur les zones de neige ; le soleil réchauffe la lumière |
| e3cc5de2 | Au mur des maisons, l'objet de la ville |
| ac9fc066 | Les ailes des moulins tournent |
| e3a4ed6c | Vols d'oiseaux, poussière en retombant d'un rebord |
| 73c73ac0 | Bûchers et casiers restent dans l'emprise de leur maison |
| b1509e3f | Flèches des arènes à énigmes lisibles |
| 9035ee5c | Talus d'herbe lisibles |
| 8c1e29a1 | Sous-bois vraiment sombres |
| 6192b340 | Cerisiers, érables, lanternes, torii… à la finesse des autres arbres |
| 4d9edc0a | Carpes koï qui nagent chacune de son côté |
| 1ed15b7e | Essai `?toits=bas` (sans le paramètre, rien ne change) |

Fichiers : nouveaux `render/ombres.js`, `render/lumieres.js`, `render/ambiance.js`, `render/interieurs.js`,
`render/densite.js` ; modifiés `render/world3d.js`, `render/weather3d.js`, `render/falaises.js`, `render/solgen.js`,
`render/textures.js`, `render/batiments3d.js`, `render/maisons-villes.js`, `render/bati-jeu.js`, `js/main.js` (une
ligne : `stencil: true` du renderer, pour les ombres). Rien dans `odyssee/js/world/`.

Performances (renderer.info) : Sylvebourg à midi, 271 appels de dessin et 46 052 triangles avant, 273 et 46 052
après (vie et fumée : 2 appels) ; la nuit +8 appels (lumières). Textures : une planche d'ombres de 512 × 256, deux
petites textures de lumière ; intérieurs, flèches et décor densifié dans les atlas existants (2048²).
Tous les `tools/test-odyssee*.mjs` sont au vert ; `test-odyssee-ecrans.mjs` relancé après chaque commit.

## 5. Feuille de route (dans l'ordre)

1. **Toits** : regarder l'essai `?toits=bas` ; s'il plaît, le rendre par défaut (une ligne dans `maisons-villes.js`).
   Le toit du Centre (modèle `centre` de `batiments3d.js`) est le plus massif : le raccourcir de la même façon.
2. **Fleurs et herbes qui se balancent** : le sol généré est figé ; extraire les fleurs (`K.F`) en petits sprites
   animés posés par-dessus (2 à 3 images), seulement près du joueur, comme `herbes.js` pour les herbes hautes.
3. **Mobilier des intérieurs selon la ville** (`world/interiors.js` choisit les meubles ; `styleInterieur` de
   `render/interieurs.js` donne déjà le style) : bois, tissus, meubles propres (tatami bas à Mirage, poêle à Cimelune…).
4. **Personnages : une seule densité** — remplacer les derniers sprites provisoires de HGSS par des personnages à 64 px.
5. **Petites animations** : drapeaux (repère `tourne` ou ondulation), portes qui s'ouvrent avant le fondu (hook
   dans `game.js`), oiseaux qui s'envolent quand on approche.
6. **Cascades** : il faut une donnée de carte ; le rendu dessinera une nappe animée et l'écume au pied.
7. **Lumières intérieures la nuit** (lampes, cheminées allumées).
8. **Revoir les autres réglages en lumière linéaire** : la teinte des grottes (`[0.82, 0.8, 0.86]` de `applyTint`,
   presque invisible), les paliers d'ombre des parois (`falaises.js`) — ceux-là ont été validés à l'œil, à ne
   toucher qu'avec le joueur.

## 6. Réglages et repères

- **Lumière linéaire** : le rendu (`outputColorSpace` sRGB) multiplie des couleurs linéaires ; pour un facteur pensé
  « à l'écran » v, utiliser v^2,2 (`teinteHeure` de `lumieres.js`, `pow(s, 2.2)` des talus dans `falaises.js`).
- Teintes de l'heure : `CLES` de `render/lumieres.js` ; météo : `METEO_TEINTE` de `render/world3d.js`.
- Lumières de nuit : `LUMIERES_DECO` de `render/world3d.js` ; phare : repère `fanal` du modèle.
- Vie à l'écran : `render/ambiance.js` (`maj`, formes dans le shader `FRAG`) ; cheminées : repères `fumee()` des
  modèles, relevés par `geometriesModele` (`bati-jeu.js`) ; parties qui tournent : `userData.tourne` d'un groupe du
  modèle (ailes du moulin), animées par `update`.
- Intérieurs : `S` de `render/interieurs.js` (motif, lambris, bordure, sol, objet au mur) ; `styleInterieur`.
- Densité : `A_DENSIFIER` de `render/densite.js`.
- Ombres : `render/ombres.js` (stencil : une seule couche). Fondu : `fadeBuildings` (`empriseEcran`, `TRAME_GLSL`).
- Grottes : profondeur dans le massif (`profRoc` de `falaises.js`, canal alpha de `uCases`).
