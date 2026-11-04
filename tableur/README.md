# Tableur

Un tableur dans le navigateur, sans étape de build ni serveur : `tableur/index.html`.
Il s'ouvre vide, lit et écrit des fichiers Excel, calcule les formules (noms français et anglais)
et exécute des macros écrites dans un sous-ensemble de VBA. Pensé pour des calculs d'actuariat
(plusieurs feuilles, fonctions financières, lois statistiques).

Essai local : `node tools/serve.mjs 8000` puis http://localhost:8000/tableur/

## Ce qu'il fait

- **Plusieurs classeurs** : chaque fichier ouvert ou nouveau a son onglet en haut (renommer, dupliquer, fermer, ● si non
  enregistré) ; copier-coller d'un classeur à l'autre (formules gardées, collées en valeur si elles citent une feuille ou un nom
  absent du classeur d'arrivée) ; annuler/rétablir propre à chaque classeur ; tous gardés dans le navigateur.
- **Feuilles** : onglets, ajout, renommage, duplication, masquage, déplacement ; références entre feuilles (`=Hypothèses!B2`).
- **Saisie** : nombres (`12,5` ou `12.5`), pourcentages, dates (`12/03/2024`), heures, booléens, texte ; formules avec `;` ou `,`.
- **Formules** : ~280 fonctions (logique, maths, statistiques et lois, finance, recherche, texte, dates, matrices),
  plages, noms définis, constantes matricielles, formules matricielles simples (`=SOMME(SI(A1:A9>0;A1:A9))`), erreurs Excel
  (`#DIV/0!`, `#N/A`…), détection des références circulaires.
- **Édition** : sélection à la souris et au clavier, copier/couper/coller avec décalage des références relatives, poignée de recopie
  (séries), `Ctrl+D` / `Ctrl+R`, annuler/rétablir, insertion et suppression de lignes et colonnes (références ajustées), fusion,
  largeurs et hauteurs, gras/italique/souligné, couleurs, alignement, formats de nombre, `F4` pour les `$`.
- **Mise en forme** : gras, italique, souligné, couleur du texte et du fond, alignement, bordures (fines, épaisses, contour),
  formats de nombre — lus et écrits dans le `.xlsx` (`js/styles-xlsx.js` complète le fichier produit par SheetJS).
- **Graphiques** : galerie d'insertion avec un aperçu de chaque catégorie tiré des données choisies — histogramme, barres,
  lignes, aires, secteurs, nuage, radar, combiné — et leurs variantes (groupé, empilé, 100 %, marqueurs, lissé, anneau,
  éclaté…). Panneau de réglages : type, plage, séries en lignes ou en colonnes, titres du graphique et des axes, légende,
  étiquettes de données, bornes et format de l'axe, quadrillage, palette, police, fond, couleur et nom de chaque série ;
  export PNG / SVG. Déplaçables et redimensionnables, recalculés avec les données ; gardés dans une feuille masquée du `.xlsx`.
- **Données** : tri rapide (A→Z, Z→A, en-têtes détectés, la zone autour de la cellule) et tri personnalisé sur plusieurs
  colonnes (les formules suivent leur ligne) ; filtre automatique (▾ dans les en-têtes : cases à cocher, recherche,
  condition « supérieur à », « contient »…, tri) ; rechercher / remplacer (`Ctrl+F`, `Ctrl+H`, jokers `*` `?`, dans les
  valeurs ou les formules, une feuille ou tout le classeur) ; somme automatique Σ (`Alt+=`, et moyenne, nb, max, min) ;
  valeur cible (trouver le taux qui donne une valeur actuelle, par exemple).
- **Tableaux croisés dynamiques** : champs en lignes, colonnes, valeurs (somme, nombre, moyenne, max, min, produit,
  écart type, variance ; affichage en % du total général, de la ligne ou de la colonne) et filtres du rapport ; sous-totaux
  et totaux généraux ; sur une nouvelle feuille ou à une cellule choisie ; actualisation d'un tableau ou de tous. Le
  résultat est écrit en valeurs (Excel le voit comme un tableau ordinaire) et sa définition est gardée dans le `.xlsx`.
- **Validation des données** : listes déroulantes (éléments ou plage), nombres entiers ou décimaux, dates, heures, longueur
  du texte, formule personnalisée ; message de saisie, alertes arrêt / avertissement / information, cellules non valides
  entourées ; lue et écrite au format d'Excel (listes prises sur une autre feuille comprises).
- **Saisie des formules** : proposition des fonctions (françaises et anglaises) et des noms définis pendant la frappe,
  bulle d'aide sur les arguments des fonctions courantes.
- **Mise en forme conditionnelle** : valeur de la cellule, texte, premiers / derniers (nombre ou %), moyenne, doublons,
  valeurs uniques, cellules vides, formule personnalisée, échelles de 2 ou 3 couleurs, barres de données ; règles ordonnées,
  lues et écrites dans le `.xlsx` au format d'Excel.
- **Affichage** : volets figés (à la cellule, première ligne, première colonne ; boutons et images des volets restent à
  l'écran), lignes et colonnes masquées, renvoi à la ligne, taille de police, impression / PDF de la feuille ou de la sélection.
  Volets, filtre, lignes masquées et mise en forme conditionnelle sont lus et écrits dans le `.xlsx` (`js/vues-xlsx.js`).
- **Fichiers** : ouverture de `.xlsx` / `.xlsm` / `.csv` (feuilles, formules, formats, styles, largeurs, noms, feuilles masquées),
  de `.docx` (chaque tableau Word devient une feuille) et de modules VBA `.bas` / `.cls` / `.frm` (ajoutés à l'éditeur) ;
  enregistrement en `.xlsx` / `.xlsm` / `.csv`. Le classeur est aussi gardé dans le navigateur (`localStorage`).
- **Macros** : projet VBA comme dans l'éditeur d'Excel (`Alt+F11`) — un module de code par feuille (`Feuil1 (Hypothèses)`),
  `ThisWorkbook` et des modules standard nommés (créer, renommer, supprimer, exporter en `.bas`), avec la liste des procédures de
  chaque module ; boîte **Macros** (`Alt+F8`) pour exécuter, modifier, créer (en la nommant) ou supprimer une macro ; exécution
  (`F5`, la macro sous le curseur), journal `Debug.Print`, `MsgBox` / `InputBox`. Dans un module de feuille, `Range`, `Cells` et `Me`
  désignent la feuille ; `Feuil1.Range("A1")` (nom de code) et `Module1.MaMacro` (appel qualifié) sont compris.
- **Fichiers protégés** : les classeurs chiffrés par mot de passe (méthode « Agile » d'Excel 2010+ et « Standard »
  d'Excel 2007 / LibreOffice, AES) s'ouvrent après saisie du mot de passe ; déchiffrement en JavaScript dans le navigateur
  (`js/chiffrement.js` : AES, SHA-1/256/384/512). Protections de feuille et projets VBA verrouillés : ouverts sans mot de passe.
- **Boutons et images** : les boutons de formulaire (et formes) reliés à une macro, les images et les commentaires d'un `.xlsx`
  sont affichés (`js/objets-xlsx.js`) ; un clic sur un bouton lance sa macro. Bouton « 🔘 Bouton » pour en créer.
  Le code VBA d'un `.xlsm` est extrait du `vbaProject.bin` (décompression MS-OVBA) et affiché.
  Les `Function` du code sont utilisables dans les cellules comme des fonctions personnalisées : `=MaFonction(A1;B1)`
  (une plage arrive en `Range`, un tableau renvoyé s'affiche par sa première valeur ou s'utilise dans `SOMME(...)`).
  Un seul interpréteur par classeur : les variables `Public` remplies par une macro (table chargée par un bouton) servent
  ensuite aux fonctions des cellules. Tant qu'une fonction VBA ne peut pas répondre, la cellule garde la valeur enregistrée
  par Excel (comme à l'ouverture dans Excel) ; `Ctrl+Alt+F9` recalcule tout.

## Limites connues

- Les macros écrites ici sont enregistrées dans une feuille masquée `_MacrosTableur`, un en-tête par module (et relues par ce tableur) : Excel ne peut pas
  les exécuter, car le tableur ne compile pas de projet VBA. Le projet VBA d'origine d'un `.xlsm` est réécrit tel quel.
- Les graphiques ne sont pas écrits au format graphique d'Excel (seulement dans la feuille masquée). Couleurs de bordure :
  noir seulement. Mise en forme conditionnelle : pas de jeux d'icônes.
- Tableaux croisés : écrits en valeurs (pas de cache de tableau croisé d'Excel) ; ceux d'un fichier Excel s'ouvrent comme
  de simples cellules ; pas de regroupement des dates par mois ou par année ni de champs calculés.
- Les formules matricielles dynamiques ne « débordent » pas : une formule qui renvoie un tableau affiche sa première valeur
  (sauf dans une fonction qui attend un tableau).
- Boutons, graphiques et images sont réécrits dans une feuille masquée que seul ce tableur relit : Excel ne les affiche pas.
- Pas de références externes entre classeurs (`=[Autre.xlsx]Feuil1!A1`) ; une macro VBA ne voit que son propre classeur.
- VBA : pas de formulaires, d'événements, de classes, de `Property`, de fichiers ni d'API Windows.

## Code

| Fichier | Rôle |
|---|---|
| `js/formules.js` | Analyse et évaluation des formules, bibliothèque de fonctions (EN + alias FR), formats de nombre et de date, conversion FR ↔ EN des formules |
| `js/classeur.js` | Modèle : feuilles, cellules `{ v, f, z, s }`, noms, saisie, copie, insertion/suppression |
| `js/vba.js` | Interpréteur VBA : lexique, syntaxe, exécution, modèle objet Excel (`Application`, `Workbook`, `Worksheet`, `Range`, `WorksheetFunction`, `Collection`, `Dictionary`) |
| `js/projetvba.js` | Projet VBA : modules de feuille, `ThisWorkbook`, modules nommés ; format texte avec en-têtes (`' ===== Module X =====`), liste tolérante des procédures |
| `js/vbaextract.js` | Lecture du `vbaProject.bin` (CFB via SheetJS, décompression MS-OVBA) |
| `js/xlsxio.js` | Lecture / écriture `.xlsx` / `.xlsm` / `.csv` avec SheetJS, import `.docx` et `.bas` |
| `js/styles-xlsx.js` | Styles de cellules dans le zip `.xlsx` (styles.xml, sheetN.xml) |
| `js/graphiques.js` | Rendu SVG des graphiques (catégories, variantes, réglages) |
| `js/ui-graphiques.js` | Galerie d'insertion avec aperçus, panneau de réglages, export PNG / SVG |
| `js/donnees.js` | Tri, filtre, rechercher / remplacer, mise en forme conditionnelle, valeur cible, somme automatique (sans DOM) |
| `js/ui-donnees.js` | Leur interface : menus, menu ▾ du filtre, panneaux, impression |
| `js/tcd.js` | Tableaux croisés dynamiques : calcul et écriture dans la feuille (sans DOM) |
| `js/ui-tcd.js` | Panneau des tableaux croisés (champs, valeurs, filtres, aperçu sur téléphone) |
| `js/aide-fonctions.js` | Arguments et description des fonctions courantes (saisie semi-automatique) |
| `js/vues-xlsx.js` | Volets figés, filtre automatique, mise en forme conditionnelle et validation des données dans le zip `.xlsx` |
| `js/chiffrement.js` | Ouverture des fichiers protégés par mot de passe (MS-OFFCRYPTO) |
| `js/objets-xlsx.js` | Boutons de macro, formes et images d'un `.xlsx` |
| `js/app.js` | Interface : grille virtualisée, barre de formule, onglets, presse-papiers, panneaux |
| `lib/xlsx.full.min.js` | SheetJS 0.18.5 (Apache-2.0, `lib/LICENSE-sheetjs.txt`) |

Tests : `node tools/test-tableur.mjs` (formules, VBA, aller-retour xlsx, décompression OVBA).
