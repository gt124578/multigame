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

## Personnages (essai)

`persos.py` : dresseurs et habitants à la façon des jeux DS (cases de 32 × 32, gabarits en texte pour la tête et le corps,
de face, de dos et de profil ; une fiche par personnage : coiffure, couleurs, sac, jupe ; contour teinté par la matière
voisine). `python3 tools/pixelforge/persos.py out/ --jeu` écrit aussi `chars_essai.png`, la planche du jeu où six rangées
sont remplacées (agrandies ×2), à servir à la place de `odyssee/img/chars.png` pour un essai. Rien n'est branché dans le jeu.

