# Sprezz

**Sprezz** est un tableur dans le navigateur (dossier `tableur/`, adresse `…/tableur/`), sans étape de build ni serveur : `tableur/index.html`.
Il s'ouvre vide, lit et écrit des fichiers Excel, calcule les formules (noms français et anglais)
et exécute des macros écrites dans un sous-ensemble de VBA. Pensé pour des calculs d'actuariat
(plusieurs feuilles, fonctions financières, lois statistiques).

Principes : une interface simple (peu de boutons, des menus courts, des panneaux plutôt que des boîtes en cascade),
utilisable au doigt comme à la souris, et **les mêmes raccourcis qu'Excel** pour ne rien réapprendre.

Essai local : `node tools/serve.mjs 8000` puis http://localhost:8000/tableur/

## Ce qu'il fait

- **Plusieurs classeurs** : chaque fichier ouvert ou nouveau a son onglet en haut (renommer, dupliquer, fermer, ● si non
  enregistré) ; copier-coller d'un classeur à l'autre (formules gardées, collées en valeur si elles citent une feuille ou un nom
  absent du classeur d'arrivée) ; annuler/rétablir propre à chaque classeur ; tous gardés dans le navigateur.
- **Feuilles** : onglets, ajout, renommage, duplication, masquage, déplacement ; références entre feuilles (`=Hypothèses!B2`).
- **Saisie** : nombres (`12,5` ou `12.5`), pourcentages, dates (`12/03/2024`), heures, booléens, texte ; formules avec `;` ou `,`.
- **Formules** : ~390 fonctions (logique, maths, statistiques et lois, finance, recherche, texte, dates, matrices,
  bases de données), plages, noms définis, constantes matricielles, formules matricielles simples
  (`=SOMME(SI(A1:A9>0;A1:A9))`), tableaux dynamiques (`TRIERPAR`, `PRENDRE`, `ASSEMB.V`, `ORGA.LIGNES`…), `LET` et
  `LAMBDA` (avec `MAP`, `REDUCE`, `SCAN`, `BYROW`, `BYCOL`, `MAKEARRAY`, et des noms définis comme `=LAMBDA(x;x*2)`),
  erreurs Excel (`#DIV/0!`, `#N/A`…), détection des références circulaires ou calcul itératif (Formules ▸ Calcul itératif).
- **Finance, comptabilité, actuariat** : obligations et coupons (`PRIX.TITRE`, `RENDEMENT.TITRE`, `DUREE`,
  `DUREE.MODIFIEE`, `INTERET.ACC`, `NB.JOURS.COUPON…`, bons du Trésor, titres escomptés), amortissements (`VDB`,
  `AMORLINC`, `AMORDEGRC`), `TRI.PAIEMENTS`, `TRI.MODIFIE`, `NB.JOURS.OUVRES.INTL` ; lois et leurs inverses (Student,
  Fisher, khi², gamma, bêta, binomiale négative, hypergéométrique), tests (`T.TEST`, `F.TEST`, `Z.TEST`, `CHISQ.TEST`),
  régression (`DROITEREG`, `LOGREG`, `TENDANCE`, `CROISSANCE`), `BDSOMME` et les autres fonctions de base de données,
  `CONVERT`. Formats comptables (`_-* # ##0,00 €_-`, zéro en « - »), en milliers ou millions (`#,##0,"k€"`), négatifs
  entre parenthèses, sections conditionnelles (`[<1000]`), durées `[h]:mm`.
  **Plan** : grouper des lignes ou des colonnes (`Alt+Maj+→`, `Alt+Maj+←`), boutons + / − et niveaux 1, 2, 3 ;
  **sous-totaux** automatiques par groupe (Données ▸ Sous-totaux…). **Gestionnaire de scénarios** avec synthèse,
  **fenêtre espion**, **utilitaire d'analyse** (statistiques descriptives, histogramme, régression, corrélation,
  covariance, moyenne mobile, lissage exponentiel, tests t et F, ANOVA, rang et centile, nombres aléatoires),
  graphique en **cascade**, **champs calculés** dans les tableaux croisés. Modèles : tableau d'emprunt, rentabilité
  d'un projet (VAN, TRI, délai de récupération), compte de résultat N / N-1, table de mortalité et commutations,
  provisions par Chain Ladder. Le plan, les scénarios, les espions et le calcul itératif sont gardés dans le `.xlsx`.
- **Édition** : sélection à la souris et au clavier, copier/couper/coller avec décalage des références relatives, poignée de recopie
  (séries), `Ctrl+D` / `Ctrl+R`, annuler/rétablir, insertion et suppression de lignes et colonnes (références ajustées), fusion,
  largeurs et hauteurs, gras/italique/souligné, couleurs, alignement, formats de nombre, `F4` pour les `$`.
- **Mise en forme** : gras, italique, souligné, couleur du texte et du fond, alignement, bordures (fines, épaisses, contour),
  formats de nombre — lus et écrits dans le `.xlsx` (`js/styles-xlsx.js` complète le fichier produit par SheetJS).
- **Raccourcis d'Excel** : Ctrl+1 (format de cellule), Ctrl+Alt+V (collage spécial), Ctrl++ / Ctrl+- (insérer, supprimer
  des cellules), Ctrl+Maj+1…6 (formats rapides), Ctrl+5 (barré), Ctrl+9 / Ctrl+0 (masquer), Ctrl+Espace / Maj+Espace,
  Ctrl+Entrée (remplir la sélection), Ctrl+' , Ctrl+`, Ctrl+K (lien), Maj+F2 (note), Ctrl+G / F5 (atteindre), Ctrl+L
  (tableau), Alt+F1 / F11 (graphique), Ctrl+PgSuiv / PgPréc, Maj+F10, F4 (refaire la mise en forme), F12… (liste dans l'aide).
- **Édition comme Excel** : glisser le bord de la sélection pour déplacer (Ctrl : copier), double-clic sur la poignée
  (recopie jusqu'au bout des données), double-clic sur un bord d'en-tête (ajustement automatique), Entrée qui reste dans la
  sélection, saisie semi-automatique du texte de la colonne, pinceau (reproduire la mise en forme), fusionner et centrer,
  barré, retrait, couleurs des formats de nombre (`[Rouge]`), fractions, AM/PM, notes, liens hypertexte (Ctrl+clic),
  couleur des onglets, duplication complète d'une feuille, menus courts avec sous-menus.
- **Boîtes simples** : Format de cellule (nombre, alignement, police, bordure, remplissage, avec aperçu), Collage spécial
  (valeurs, formules, formats, notes, transposé, opérations), Insérer / supprimer des cellules (décalage vers le bas, la
  droite…), Atteindre, Lien, Note, Supprimer les doublons, Convertir en colonnes, Mettre sous forme de tableau, Insérer une image.
- **Graphiques** : galerie d'insertion avec un aperçu de chaque catégorie tiré des données choisies — histogramme, barres,
  lignes, aires, secteurs, nuage, radar, combiné — et leurs variantes (groupé, empilé, 100 %, marqueurs, lissé, anneau,
  éclaté…). Panneau de réglages : type, plage, séries en lignes ou en colonnes, titres du graphique et des axes, légende,
  étiquettes de données, bornes et format de l'axe, quadrillage, palette, police, fond, couleur et nom de chaque série ;
  export PNG / SVG. Déplaçables et redimensionnables, recalculés avec les données. Écrits dans le `.xlsx` comme de vrais
  graphiques Excel (`js/graphiques-xlsx.js` : histogrammes, barres, courbes, aires, secteurs, anneaux, nuages, radars,
  combinés, avec titres, axes, légende, étiquettes et couleurs) ; les graphiques d'un fichier Excel s'affichent ici.
- **Données** : tri rapide (A→Z, Z→A, en-têtes détectés, la zone autour de la cellule) et tri personnalisé sur plusieurs
  colonnes (les formules suivent leur ligne) ; filtre automatique (▾ dans les en-têtes : cases à cocher, recherche,
  condition « supérieur à », « contient »…, tri) ; rechercher / remplacer (`Ctrl+F`, `Ctrl+H`, jokers `*` `?`, dans les
  valeurs ou les formules, une feuille ou tout le classeur) ; somme automatique Σ (`Alt+=`, et moyenne, nb, max, min) ;
  valeur cible (trouver le taux qui donne une valeur actuelle, par exemple).
- **Tableaux croisés dynamiques** : champs en lignes, colonnes, valeurs (somme, nombre, moyenne, max, min, produit,
  écart type, variance ; affichage en % du total général, de la ligne ou de la colonne) et filtres du rapport ; sous-totaux
  et totaux généraux ; regroupement des dates (années, trimestres, mois, jours) et des nombres par tranches (âges par 10 ans…) ; sur une nouvelle feuille ou à une cellule choisie ; actualisation d'un tableau ou de tous. Le
  résultat est écrit en valeurs (Excel le voit comme un tableau ordinaire) et sa définition est gardée dans le `.xlsx`.
- **Validation des données** : listes déroulantes (éléments ou plage), nombres entiers ou décimaux, dates, heures, longueur
  du texte, formule personnalisée ; message de saisie, alertes arrêt / avertissement / information, cellules non valides
  entourées ; lue et écrite au format d'Excel (listes prises sur une autre feuille comprises).
- **Fichier** : menu ▾ à côté d'Enregistrer (Enregistrer sous, télécharger une copie, **enregistrement automatique** à
  cocher : avec Chrome ou Edge sur ordinateur, le fichier lié est réécrit quelques secondes après chaque modification) ;
  `*` après le nom (onglet du classeur et onglet du navigateur) tant que les modifications ne sont pas enregistrées, et le
  navigateur demande confirmation avant de fermer la page dans ce cas.
- **Formules matricielles** : `Ctrl+Maj+Entrée` sur une plage met la formule dans sa première cellule et le résultat
  remplit la plage ; la raison d'un `#SPILL!` (cellule qui bloque) ou d'un `#CYCLE!` s'affiche. La barre de formule écrit
  en direct dans la cellule. Sur tablette, la barre d'outils passe à la ligne (tout reste visible) ; double appui sur la
  poignée de recopie = double-clic d'Excel.
- **Coller d'un PDF** : texte sans tabulations collé dans une colonne puis « Séparer en colonnes… » (espaces multiples,
  espace, tabulation, `;`, `,`, autre ; aperçu ; nombres « 1 234,56 » gardés entiers, « (2 000) » négatif) ; Collage spécial
  d'un texte venu d'ailleurs ouvre ce choix.
- **Presse-papiers** : copier-coller avec Excel, LibreOffice et les pages web dans les deux sens (texte tabulé, cellules
  sur plusieurs lignes entre guillemets), sans demande d'autorisation au clavier.
- **Saisie des formules** : proposition des fonctions (françaises et anglaises) et des noms définis pendant la frappe,
  bulle d'aide sur les arguments des fonctions courantes.
- **Mise en forme conditionnelle** : valeur de la cellule, texte, premiers / derniers (nombre ou %), moyenne, doublons,
  valeurs uniques, cellules vides, formule personnalisée, échelles de 2 ou 3 couleurs, barres de données ; règles ordonnées,
  lues et écrites dans le `.xlsx` au format d'Excel.
- **Affichage** : volets figés (à la cellule, première ligne, première colonne ; boutons et images des volets restent à
  l'écran), lignes et colonnes masquées, renvoi à la ligne, taille de police, impression / PDF de la feuille ou de la sélection.
  Volets, filtre, lignes masquées et mise en forme conditionnelle sont lus et écrits dans le `.xlsx` (`js/vues-xlsx.js`).
- **Fichiers** : ouverture de `.xlsx` / `.xlsm` / `.xls` / `.ods` / `.csv` (feuilles, formules, formats, styles, largeurs, noms,
  feuilles masquées), de `.docx` (chaque tableau Word devient une feuille) et de modules VBA `.bas` / `.cls` / `.frm` ;
  enregistrement en `.xlsx` / `.xlsm` / `.ods` / `.csv`. Avec Chrome ou Edge, **Ctrl+S réécrit le fichier ouvert sur le disque**
  (`F12` : enregistrer sous ; ▾ d'Ouvrir : fichiers récents) ; ailleurs, le fichier est téléchargé. Les classeurs ouverts sont
  aussi gardés dans le navigateur (IndexedDB, sans limite de taille pratique) ; une alerte prévient avant de fermer l'onglet
  si un classeur modifié n'a été gardé nulle part.
- **LibreOffice (`.ods`, `js/ods.js`, `js/ods-objets.js`)** : écriture complète — valeurs, formules (OpenFormula, références de
  tableau converties en plages), formats de nombre (durées `[h]:mm`, négatifs en rouge), styles, polices, texte riche, fusions,
  validation des données, mise en forme conditionnelle (valeur, texte, formule, doublons, premiers, moyenne, échelles, barres,
  icônes), volets figés, mise en page (orientation, papier, ajuster, marges, zone d'impression, titres répétés), graphiques
  (objets de LibreOffice), images, formes et zones de texte ; et la même chose relue dans un `.ods` fait par LibreOffice.
- **CSV** (`js/csv.js`) : à l'ouverture, une boîte montre l'aperçu et laisse choisir le séparateur, l'encodage (UTF-8,
  Windows, UTF-16), la virgule ou le point décimal et la première ligne ; enregistrement à la française (`;`, virgule, BOM).
- **Polices et texte riche** : police par cellule (Calibri, Arial, Times New Roman… avec leurs équivalents libres), plusieurs
  styles dans une même cellule (choisir un mot pendant la saisie puis Ctrl+B, Ctrl+I, couleur) ; bordures doubles,
  pointillées, tirets et de couleur ; tout est lu et écrit dans le `.xlsx` et le `.ods`.
- **Modèles** (`js/modeles.js`, Nouveau ▾) : budget mensuel, facture, relevé de notes (moyennes pondérées, rang,
  appréciation), planning de la semaine, liste de présence, feuille d'heures, liste de tâches — prêts à remplir.
- **Formes et zones de texte** (`js/formes.js`, bouton ◇ Formes) : zone de texte, rectangle, rectangle arrondi, ellipse,
  triangle, losange, flèche, trait, étoile, bulle ; double-clic (ou second appui) pour écrire dedans, poignée pour
  redimensionner, clic droit pour le remplissage, le contour, le texte et l'ordre ; G, I, S, couleurs et alignement de la
  barre s'appliquent à la forme choisie. Écrites comme de vraies formes d'Excel (et de LibreOffice).
- **Macros** : projet VBA comme dans l'éditeur d'Excel (`Alt+F11`) — un module de code par feuille (`Feuil1 (Hypothèses)`),
  `ThisWorkbook` et des modules standard nommés (créer, renommer, supprimer, exporter en `.bas`), avec la liste des procédures de
  chaque module ; boîte **Macros** (`Alt+F8`) pour exécuter, modifier, créer (en la nommant), renommer ou supprimer une macro
  (renommer une macro, une fonction ou un module met à jour les appels, les boutons et les formules) ; recherche dans tout le
  projet (modules, macros, texte du code) ; module illisible signalé avec sa ligne ; `Type … End Type`, `Enum` (aussi
  `Scen.Haut`), `Application.Caller`, `CVErr(xlErrNA)`, `Application.<fonction de feuille>` qui rend l'erreur au lieu
  d'arrêter (comme `Application.VLookup`). Une Function VBA au nom anglais d'une fonction d'Excel (`Duration`) passe avant
  celle-ci, comme dans Excel en français ; exécution
  (`F5`, la macro sous le curseur), journal `Debug.Print`, `MsgBox` / `InputBox`. Dans un module de feuille, `Range`, `Cells` et `Me`
  désignent la feuille ; `Feuil1.Range("A1")` (nom de code) et `Module1.MaMacro` (appel qualifié) sont compris.
- **Tableaux structurés** (`Ctrl+L`) : `Tableau1[Prime]`, `[@Prix]`, `[#Tout]`, `[#En-têtes]`, `[#Totaux]` dans les formules
  (colonnes proposées en tapant `[`) ; agrandissement automatique, colonnes calculées, ligne de total (`Ctrl+Maj+T`), 21 styles
  d'Excel, renommer, redimensionner, convertir en plage ; lus et écrits dans le `.xlsx` (`js/tableaux-xlsx.js`).
- **Formules qui débordent** : `TRIER`, `UNIQUE`, `FILTRE`, `SEQUENCE`… remplissent les cellules voisines (cadre pointillé,
  formule grisée dans la barre), référence `A1#`, `#SPILL!`, intersection `@` ; enregistrées en formules matricielles.
- **Analyse** (`js/analyse.js`) : Solveur (simplexe exact pour les modèles linéaires, entiers et binaires par séparation et
  évaluation ; méthode non linéaire sinon ; modèle gardé dans le fichier en noms `solver_*` comme Excel), table de données à
  une ou deux entrées (formule `TABLE` dans le `.xlsx`), remplissage instantané (`Ctrl+E`).
- **Audit des formules** : flèches des antécédents et des dépendants, `Ctrl+[` / `Ctrl+]`, évaluer la formule pas à pas,
  vérification des erreurs, calcul manuel (`F9`).
- **Imprimer** (`Ctrl+P`, `js/impression.js`) : aperçu et réglages ensemble — orientation, papier, ajuster à N pages, marges,
  en-têtes et pieds de page, zone d'impression, titres répétés, quadrillage, en-têtes de ligne et de colonne, sauts de page,
  graphiques, images et sparklines compris ; tout est lu et écrit dans le `.xlsx` (`js/page-xlsx.js`).
- **Protection de feuille** : mot de passe (hachage d'Excel, SHA-512 relu), droits laissés (format, insertion, tri, filtre…),
  cellules déverrouillées et formules masquées ; lue et écrite comme Excel.
- **Graphiques, suite** : courbes de tendance (linéaire, exponentielle, logarithmique, polynomiale, puissance, moyenne
  mobile) avec équation et R², axe secondaire ; sparklines (courbe, histogramme, gain/perte) dans les cellules.
- **Affichage, suite** : zoom par feuille (barre d'état, `Ctrl`+molette, pincement au doigt), thème sombre.
- **Fichiers protégés** : les classeurs chiffrés par mot de passe (méthode « Agile » d'Excel 2010+ et « Standard »
  d'Excel 2007 / LibreOffice, AES) s'ouvrent après saisie du mot de passe ; déchiffrement en JavaScript dans le navigateur
  (`js/chiffrement.js` : AES, SHA-1/256/384/512). Projets VBA verrouillés : ouverts sans mot de passe.
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
- Graphiques : la description complète (palette, police…) n'est relue que par ce tableur ; un graphique d'Excel dont les
  séries viennent de plusieurs feuilles, ou de type non géré (boursier, bulles, surface, 3D), n'est pas affiché.
- Tableaux croisés : écrits en valeurs (pas de cache de tableau croisé d'Excel) ; ceux d'un fichier Excel s'ouvrent comme
  de simples cellules ; les champs calculés ne sont relus que par ce tableur.
- Les boutons de macro sont réécrits dans une feuille masquée que seul ce tableur relit ; graphiques, images et formes sont
  écrits à la fois comme de vrais objets d'Excel ou de LibreOffice et dans cette feuille (pour garder tous leurs réglages).
- `.xls` (Excel 97-2003) : valeurs, formules, formats et fusions seulement (pas de mise en forme conditionnelle, de validation,
  de graphiques ni d'images) ; l'enregistrer en `.xlsx` garde le reste du travail.
- `.ods` : formats de nombre rares approchés ; pas de tableaux structurés (écrits comme des plages) ; le plan, les scénarios et
  les espions ne sont gardés que dans le `.xlsx`.
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
| `js/graphiques-xlsx.js` | Graphiques au format d'Excel (DrawingML) : écriture et lecture |
| `js/ui-graphiques.js` | Galerie d'insertion avec aperçus, panneau de réglages, export PNG / SVG |
| `js/donnees.js` | Tri, filtre, rechercher / remplacer, mise en forme conditionnelle, valeur cible, somme automatique (sans DOM) |
| `js/ui-donnees.js` | Leur interface : menus, menu ▾ du filtre, panneaux, impression |
| `js/tcd.js` | Tableaux croisés dynamiques : calcul et écriture dans la feuille (sans DOM) |
| `js/ui-dialogues.js` | Boîtes : format de cellule, collage spécial, insertion de cellules, atteindre, lien, note, doublons, colonnes |
| `js/ui-tcd.js` | Panneau des tableaux croisés (champs, valeurs, filtres, aperçu sur téléphone) |
| `js/aide-fonctions.js` | Arguments et description des fonctions courantes (saisie semi-automatique) |
| `js/vues-xlsx.js` | Volets figés, filtre automatique, mise en forme conditionnelle et validation des données dans le zip `.xlsx` |
| `js/chiffrement.js` | Ouverture des fichiers protégés par mot de passe (MS-OFFCRYPTO) |
| `js/objets-xlsx.js` | Boutons de macro, formes et images d'un `.xlsx` |
| `js/ods.js` | Classeurs OpenDocument : écriture (content, styles, settings), lecture des styles, validations, mises en forme conditionnelles, mise en page |
| `js/ods-objets.js` | Graphiques, images et formes d'un `.ods` (écriture et lecture) |
| `js/csv.js` | CSV : décodage (UTF-8, Windows, UTF-16), séparateur et virgule décimale devinés, écriture à la française |
| `js/stockage.js` | IndexedDB : classeurs ouverts, fichiers récents et leurs accès disque |
| `js/modeles.js` | Modèles prêts à l'emploi (au quotidien ; finance, comptabilité et actuariat) |
| `js/plan.js` | Plan (groupes de lignes et de colonnes, niveaux) et sous-totaux automatiques (sans DOM) |
| `js/scenarios.js` | Scénarios : application et synthèse (sans DOM) |
| `js/utilitaire.js` | Utilitaire d'analyse : statistiques, régression, tests, ANOVA, lissages (sans DOM) |
| `js/ui-finance.js` | Boîtes Sous-totaux et Calcul itératif, panneaux Scénarios, Fenêtre espion et Utilitaire d'analyse |
| `js/formes.js` | Formes et zones de texte : dessin SVG, correspondance avec les formes d'Excel |
| `js/tableaux.js`, `js/tableaux-xlsx.js` | Styles des tableaux structurés ; tableaux et tables de données dans le `.xlsx` |
| `js/analyse.js`, `js/ui-analyse.js` | Solveur, table de données, remplissage instantané, audit des formules (sans DOM) et leurs panneaux |
| `js/impression.js`, `js/ui-impression.js` | Découpage en pages et HTML des pages (sans DOM) ; boîte Imprimer avec aperçu |
| `js/page-xlsx.js` | Mise en page, protection de feuille et sparklines dans le `.xlsx` |
| `js/app.js` | Interface : grille virtualisée, barre de formule, onglets, presse-papiers, panneaux |
| `lib/xlsx.full.min.js` | SheetJS 0.18.5 (Apache-2.0, `lib/LICENSE-sheetjs.txt`) |

Tests : `node tools/test-tableur.mjs` (formules, VBA, aller-retour xlsx, décompression OVBA).
