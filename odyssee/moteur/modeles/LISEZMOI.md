# Modèles faits à la main (Blender → glTF)

Le moteur peut remplacer n'importe quel modèle du jeu par un modèle fait dans Blender, à la résolution qu'on veut
(autant de polygones et des textures aussi grandes qu'on veut). Les fichiers vont dans ce dossier (`.glb`), et la liste
de ce qu'ils remplacent dans `remplacements.json`. Rien à recompiler : on recharge la page.

```json
{
  "cartes":      { "NEW_BARK": "new_bark.glb", "412": { "fichier": "route29_est.glb", "garderBatiments": true } },
  "batiments":   { "38": "maison_jaune.glb", "meuble:12": "lit.glb" },
  "personnages": { "player_m": "luth.glb", "mm:ROCK": "rocher_force.glb" },
  "objets":      { "objet": "poke_ball.glb", "arbre_coupe": "arbuste.glb" }
}
```

- **Une carte** (32 × 32 cases, le sol, le relief, l'eau, les arbres et, sauf `garderBatiments`, les bâtiments) se
  désigne par son lieu (`NEW_BARK`, la zone au milieu de la carte) ou par son numéro. Le labo (`moteur.html?labo`)
  affiche en haut à gauche le lieu, le numéro de la carte où l'on est et le numéro du bâtiment le plus proche.
- **Un bâtiment** : son numéro dans l'archive des bâtiments du jeu (dehors), `meuble:<numéro>` dans une pièce. Il est
  posé là où le jeu pose le sien, sur toutes les cartes qui l'utilisent.
- **Un personnage** : le nom de sa planche (`player_m`, `player_f`, ou `mm:NOM` pour ceux du jeu, visible dans
  `donnees/evenements-hg.js`). **Un objet du terrain** : sa sorte (`objet` pour les objets au sol, `rocher`,
  `rocher_force`, `arbre_coupe`, `bloc_glace`).
- Options d'une entrée : `"echelle": 2`, `"decalage": [x, y, z]` (en cases, axes de Blender), `"rotation": 90` (degrés
  autour de la verticale), `"eclairage": true` (garder les matériaux de Blender avec la lumière ; par défaut le modèle
  est rendu sans lumière, comme sur DS : seule compte la couleur de base et sa texture).
- `moteur.html?sansmodeles` montre le jeu sans les remplacements (pour comparer).

## Conventions dans Blender

- **1 m = 1 case** (16 unités de la DS). Z vers le haut, **Y vers le nord**, X vers l'est.
- **Une carte** : origine au milieu de ses 32 × 32 cases (de −16 à +16 en X et en Y), le sol de niveau 0 à Z = 0.
  Le plus simple : dans le labo, bouton **📐 Gabarit (.obj)** à l'endroit voulu, puis dans Blender *File → Import →
  Wavefront (.obj)* avec les réglages par défaut : on a les formes de la carte du jeu (sol et bâtiments, sans
  textures), au bon endroit et à la bonne échelle, pour modeler par-dessus. Le gabarit est un repère de travail : il
  ne va pas dans le dépôt.
- **Un bâtiment** : origine à son point de pose dans le jeu (le gabarit le montre : objet `batiment_<numéro>`).
- **Un personnage, un objet** : origine au milieu de sa case, à ses pieds ; **tourné vers le sud (−Y)**, c'est-à-dire
  vers la caméra. Le moteur le fait tourner selon sa direction.
- **Animations** (personnages) : des actions nommées `repos`, `marche`, `course`, `velo`, `surf` (ou `idle`, `walk`,
  `run`, `bike`, `swim`). Sans `course` ni `velo`, c'est `marche` qui sert. Une marche dure le temps d'un pas : 16
  images à 60 i/s pour une case (8 en courant) ; une boucle de deux pas = 32 images.
- **Textures** : de la taille qu'on veut. Pour garder des pixels nets (look DS), mettre l'interpolation de la texture
  sur *Closest* dans Blender ; *Linear* pour une texture lissée. La transparence : *Alpha Clip* (feuillages, grilles)
  ou *Alpha Blend*.
- **La caméra** est celle du jeu (55°) et, comme sur DS, l'image est resserrée en largeur : un modèle aux vraies
  proportions s'y voit comme ceux du jeu.

## Exporter

*File → Export → glTF 2.0*, format **glTF Binary (.glb)**, *Include : Selected Objects* si la scène contient autre
chose, *Transform : +Y Up* (coché, c'est le réglage par défaut), *Data → Mesh : Apply Modifiers*, *Animation* coché
pour un personnage. Copier le `.glb` ici et l'ajouter à `remplacements.json`.

Un modèle qui ne se charge pas est signalé dans la console du navigateur (F12) et le jeu garde celui d'origine.
