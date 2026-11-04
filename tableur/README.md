# Tableur

Un tableur dans le navigateur, sans étape de build ni serveur : `tableur/index.html`.
Il s'ouvre vide, lit et écrit des fichiers Excel, calcule les formules (noms français et anglais)
et exécute des macros écrites dans un sous-ensemble de VBA. Pensé pour des calculs d'actuariat
(plusieurs feuilles, fonctions financières, lois statistiques).

Essai local : `node tools/serve.mjs 8000` puis http://localhost:8000/tableur/

## Ce qu'il fait

- **Feuilles** : onglets, ajout, renommage, duplication, masquage, déplacement ; références entre feuilles (`=Hypothèses!B2`).
- **Saisie** : nombres (`12,5` ou `12.5`), pourcentages, dates (`12/03/2024`), heures, booléens, texte ; formules avec `;` ou `,`.
- **Formules** : ~280 fonctions (logique, maths, statistiques et lois, finance, recherche, texte, dates, matrices),
  plages, noms définis, constantes matricielles, formules matricielles simples (`=SOMME(SI(A1:A9>0;A1:A9))`), erreurs Excel
  (`#DIV/0!`, `#N/A`…), détection des références circulaires.
- **Édition** : sélection à la souris et au clavier, copier/couper/coller avec décalage des références relatives, poignée de recopie
  (séries), `Ctrl+D` / `Ctrl+R`, annuler/rétablir, insertion et suppression de lignes et colonnes (références ajustées), fusion,
  largeurs et hauteurs, gras/italique/souligné, couleurs, alignement, formats de nombre, `F4` pour les `$`.
- **Fichiers** : ouverture de `.xlsx` / `.xlsm` / `.csv` (feuilles, formules, formats, largeurs, noms, feuilles masquées),
  enregistrement en `.xlsx` / `.xlsm` / `.csv`. Le classeur est aussi gardé dans le navigateur (`localStorage`).
- **Macros** : éditeur VBA, liste des procédures, exécution (`F5`), journal `Debug.Print`, `MsgBox` / `InputBox`.
  Le code VBA d'un `.xlsm` est extrait du `vbaProject.bin` (décompression MS-OVBA) et affiché.

## Limites connues

- Les macros écrites ici sont enregistrées dans une feuille masquée `_MacrosTableur` (et relues par ce tableur) : Excel ne peut pas
  les exécuter, car le tableur ne compile pas de projet VBA. Le projet VBA d'origine d'un `.xlsm` est réécrit tel quel.
- Styles : gras, italique, souligné, couleurs et alignement ne sont pas écrits dans le `.xlsx` (SheetJS communautaire) ; les formats
  de nombre, largeurs, fusions et noms le sont.
- Pas de graphiques, de tableaux croisés, de validation de données ni de mise en forme conditionnelle.
- Les formules matricielles dynamiques ne « débordent » pas : une formule qui renvoie un tableau affiche sa première valeur
  (sauf dans une fonction qui attend un tableau).
- VBA : pas de formulaires, d'événements, de classes, de `Property`, de fichiers ni d'API Windows.

## Code

| Fichier | Rôle |
|---|---|
| `js/formules.js` | Analyse et évaluation des formules, bibliothèque de fonctions (EN + alias FR), formats de nombre et de date, conversion FR ↔ EN des formules |
| `js/classeur.js` | Modèle : feuilles, cellules `{ v, f, z, s }`, noms, saisie, copie, insertion/suppression |
| `js/vba.js` | Interpréteur VBA : lexique, syntaxe, exécution, modèle objet Excel (`Application`, `Workbook`, `Worksheet`, `Range`, `WorksheetFunction`, `Collection`, `Dictionary`) |
| `js/vbaextract.js` | Lecture du `vbaProject.bin` (CFB via SheetJS, décompression MS-OVBA) |
| `js/xlsxio.js` | Lecture / écriture `.xlsx` / `.xlsm` / `.csv` avec SheetJS |
| `js/app.js` | Interface : grille virtualisée, barre de formule, onglets, presse-papiers, panneaux |
| `lib/xlsx.full.min.js` | SheetJS 0.18.5 (Apache-2.0, `lib/LICENSE-sheetjs.txt`) |

Tests : `node tools/test-tableur.mjs` (formules, VBA, aller-retour xlsx, décompression OVBA).
