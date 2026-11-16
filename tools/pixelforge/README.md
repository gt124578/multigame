# PixelForge — pixel art écrit par le code

Outils de l'atelier graphique d'Odyssée : du pixel art exact (1 pixel = 1 vrai pixel, palette fixe, transparence réelle),
sans générateur extérieur.

## Sol généré du jeu

Le sol des routes, villes et grottes est calculé par le jeu lui-même : `odyssee/js/render/solgen.js` (générateur, sans DOM),
`solgen-worker.js` (calcul hors du fil principal) et `sol.js` (pose des blocs de 16 × 16 cases au-dessus du sol d'origine,
eau animée). Herbe, hautes herbes, chemins, pavés, eau, pontons, rebords façon HeartGold / SoulSilver, sols de grotte par biome.
Arbres, barrières, rochers, bâtiments, plateaux de roche des grottes et ombres restent ceux du jeu.
`?sol=0` dans l'adresse (ou `localStorage['odyssee-sol'] = '0'`) remet l'ancien sol pour comparer.

```
node tools/pixelforge/solgen-apercu.mjs monde 1 12 3 2 0 /tmp/route1.png     # carte, bloc x, bloc y, nb x, nb y, image
```

## Prototypes Python (source du générateur)

- `terrain2.py` : version validée (port JS dans solgen.js), `terrain.py` / `terrain3.py` : essais précédents.
- `bake.py`, `essai-jeu.cjs`, `dump-carte.mjs` : cuisson d'une carte en PNG et essai dans le jeu lancé en local.
- `render.py` / `scene.py` / `tiles/*.pf` : tuiles écrites en texte (un caractère = un pixel) et scènes par couches.
- `panneaux.py` : panneaux en bois dessinés au pixel (`panneaux/sign_plat.png`) ; le panneau du jeu en vue 3/4
  (`odyssee/img/nature/sign.png`) en est la retouche PixelLab (`panneaux/sign_pixellab_brut.png`), nettoyée à la main
  (ombre verte retirée : le moteur ajoute la sienne).

Prérequis Python : `pip install pillow numpy scipy`.

## Atelier 3D (voir et faire tourner un objet)

`atelier3d.html` : un objet seul (sculpture ou bâtiment du jeu), vu avec la caméra du jeu (55°, une case = 32, 64 ou
128 px, hauteurs étirées comme en jeu) ou en orbite libre (glisser pour tourner, molette ou pincer pour zoomer), sur de
l'herbe, des dalles, le sol généré du jeu ou un fond transparent, avec un dresseur à côté pour l'échelle. Réglages :
palette réduite de l'objet (pixels isolés nettoyés), contour pixel art (silhouette, et creux par la profondeur), ombrage
en paliers / doux / fil de fer, finesse de la sculpture. L'état tient dans l'adresse (`#m=sculpt:komainu&vue=orbite…`).

```
python3 -m http.server 8766          # à la racine du dépôt, puis http://localhost:8766/tools/pixelforge/atelier3d.html
node tools/pixelforge/atelier3d-capture.cjs /tmp/a3d 8766 '[{"nom":"k","m":"sculpt:komainu","D":64,"sol":"aucun"}]'
```

La capture pilote la page (`window.atelier.regler({…})`, `window.atelier.image()`) et écrit un PNG par état :
c'est ainsi que Claude regarde ce qu'il sculpte (vue du jeu, orbite à plusieurs angles) avant de le montrer.

## Sculptures (petits objets détaillés)

Les boîtes et cylindres à 8 faces rendent les petits objets « cubiques ». `sculpt/sculpt3d.js` les décrit plutôt comme
des formes arrondies fondues les unes dans les autres (champs de distance, union douce de rayon `k`) : sphères,
ellipsoïdes, capsules et cônes arrondis, boîtes arrondies, tores, profils tournés (`tour`, `pans: 6` pour un hexagone),
profils extrudés (`plaque`) ; `creuser` (yeux, plis, rainures), `peindre` (bandes dorées, plaques), `miroirX`, `autour`.
Le maillage (surface nets) prend les normales du champ (aucune facette) et cuit dans les couleurs l'occlusion des creux,
le grain de la matière et sa patine (vert-de-gris du bronze, mousse de la pierre) ; `brillance` donne un reflet net du
soleil en deux crans (métal), `lueur` un éclairage intérieur (lanterne). C'est la méthode des modèles de Noir & Blanc :
peu de géométrie à l'écran, mais une silhouette organique, et le détail porté par les couleurs et l'ombrage en paliers.

Modèles dans `sculpt/modeles.js` (`dresseur`, `komainu`, `toro`, `jarre`) : une fonction `(S, o) => …` par objet.
Pensé pour la caméra du jeu : vu d'en haut à 55°, un visage droit disparaît sous une visière ; la statue de dresseur
lève la tête vers la balle (et donc vers la caméra), `o.regard` règle l'angle.

## Outils 2D : volume, rampes teintées, finitions (pixel.py)

- `rampe_teintee(base, n)` : rampe du sombre au clair qui glisse en teinte (ombres vers le bleu-violet, lumières vers le
  jaune), au lieu de seulement assombrir.
- `hauteur_bombee(masque)` + `ombrer_relief(masque, h, rampe)` : dessiner en relief — une silhouette devient un volume
  (carte des hauteurs, bruit, blocs, fissures creusées), éclairé en haut à gauche comme le jeu, creux assombris.
- `selout(a)` : contour sélectif, teinté de la couleur voisine, plus sombre côté ombre ; `nettoyer(a)` : pixels orphelins ;
  `reduire_palette(a, n)`, `contraste(a)`.
- `depuis_3d(png)` : un rendu de l'Atelier 3D (fond transparent) devient un sprite du jeu (ombre portée retirée, valeurs
  écartées, palette réduite, nettoyé, contour).
- `apercu_jeu([sprites], densites=[…])` : les sprites posés sur le vrai sol du jeu avec le dresseur, pour juger
  l'intégration (densité 1 = 32 px par case comme les décors, 2 = 64 px comme les personnages).

`python3 tools/pixelforge/demo2d.py <rendus de l'atelier> <sortie>` : rocher en aplats / en relief / celui du jeu, et
les sculptures en sprites à côté des statues du jeu.
