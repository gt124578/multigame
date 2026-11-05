// tools/odyssee-schema.mjs — exporte le schéma des cartes d'Odyssée (dehors et grottes) en images à dessiner par-dessus :
//   node tools/odyssee-schema.mjs [tout|monde|grottes|<carte>] [dossier]      (par défaut : tout, dans /tmp/schema)
// Pour chaque carte :
//   <carte>_schema.png       1 pixel = 1 case, une couleur unie par type de case (legende.png) : l'image à corriger
//   <carte>_schema_x8.png    la même agrandie ×8, grille toutes les 8 cases, coordonnées, noms, PNJ et objets : à regarder
//   <carte>_hauteurs.png     hauteur de chaque case en gris (32 + 16 × hauteur, ravin = 0) : l'image à corriger pour le relief
//   <carte>_hauteurs_x8.png  teintes hypsométriques, ombrage, courbes de niveau : à regarder
//   <carte>_normales.png     normal map tirée des hauteurs (1 pixel = 1 case), et <carte>_normales_x8.png (lissée)
// plus legende.png et legende.md (palette, échelle des gris, règles). Les corrections reviennent par
// odyssee-schema-import.mjs.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildWorld } from '../odyssee/js/world/region.js';
import {
  PALETTE, choisirCartes, nomFichier, schema1, schema8, hauteurs1, hauteurs8, normales, hauteursCarte, ecrirePNG,
  image, rect, ecrire, grisDe, teinteNiveau, HMAX, estGrotte, ECHELLE,
} from './odyssee-schema-commun.mjs';

const args = process.argv.slice(2);
const quoi = args[0] || 'tout', dossier = args[1] || '/tmp/schema';
mkdirSync(dossier, { recursive: true });

const world = buildWorld();
const cartes = choisirCartes(world, quoi);
const faits = [];
const sortie = (nom, img) => { ecrirePNG(join(dossier, nom), img); faits.push([nom, img.w, img.h]); };

for (const m of cartes) {
  const f = nomFichier(m.id), H = hauteursCarte(m);
  sortie(`${f}_schema.png`, schema1(m));
  sortie(`${f}_schema_x8.png`, schema8(m, world));
  sortie(`${f}_hauteurs.png`, hauteurs1(m, H));
  sortie(`${f}_hauteurs_x8.png`, hauteurs8(m, world, ECHELLE, H));
  sortie(`${f}_normales.png`, normales(m, 1, H));
  sortie(`${f}_normales_x8.png`, normales(m, ECHELLE, H));
  console.log(`${m.id} (${m.name}) : ${m.w} × ${m.h} cases`);
}
legende();
for (const [n, w, h] of faits) console.log(`  ${join(dossier, n)}${w ? `  ${w} × ${h}` : ''}`);

/* ---------------------------------------------------------------------------------------------------------------- */
function legende() {
  const W = 1500, ligne = 22, img = image(W, 1700), fond = [24, 26, 32], clair = [235, 235, 235], gris = [160, 160, 170], jaune = [255, 230, 120];
  rect(img, 0, 0, W, img.h, fond);
  let y = 16;
  ecrire(img, 'ODYSSEE - SCHEMA DES CARTES : LEGENDE', 20, y, jaune, { e: 3 }); y += 40;
  ecrire(img, 'TYPES DE CASE (SCHEMA : 1 PIXEL = 1 CASE, COULEUR EXACTE)', 20, y, clair, { e: 2 }); y += 30;
  const col = Math.ceil(PALETTE.length / 2), y0 = y;
  PALETTE.forEach((p, i) => {
    const x = i < col ? 20 : 760, yy = y0 + (i % col) * ligne;
    rect(img, x, yy, 34, 18, [0, 0, 0]); rect(img, x + 1, yy + 1, 32, 16, p.rgb);
    ecrire(img, `${p.hex.toUpperCase()}  ${p.nom}`, x + 44, yy + 2, p.fixe ? [255, 140, 140] : p.interieur ? gris : clair, { e: 2 });
    if (p.fixe) ecrire(img, 'FIXE', x + 660, yy + 2, [255, 110, 110], { e: 2 });
    else if (p.interieur) ecrire(img, 'MAISONS', x + 620, yy + 2, gris, { e: 2 });
  });
  y = y0 + col * ligne + 16;
  ecrire(img, 'FIXE : NE CHANGE PAS PAR L\'IMAGE (BATIMENT, PORTE, PANNEAU, DECOR, ENTREE DE GROTTE, TAPIS).', 20, y, [255, 140, 140], { e: 2 }); y += ligne;
  ecrire(img, 'SCHEMA X8 : CARRE BLANC CERCLE DE NOIR = PNJ, LOSANGE ORANGE = OBJET (NON MODIFIABLES PAR L\'IMAGE).', 20, y, clair, { e: 2 }); y += 34;
  ecrire(img, 'HAUTEURS (GRIS = 32 + 16 X NIVEAU ; RAVIN = NOIR)', 20, y, clair, { e: 2 }); y += 28;
  for (let h = -1; h <= HMAX; h++) {
    const x = 20 + (h + 1) * 92, g = h < 0 ? grisDe(0, true) : grisDe(h);
    rect(img, x, y, 84, 30, [90, 90, 90]); rect(img, x + 1, y + 1, 82, 28, [g, g, g]);
    if (h >= 0) { rect(img, x, y + 32, 84, 10, teinteNiveau(h)); }
    ecrire(img, h < 0 ? 'RAVIN' : `NIV ${h}`, x + 42, y + 48, clair, { e: 1, a: 'c' });
    ecrire(img, `GRIS ${g}`, x + 42, y + 60, gris, { e: 1, a: 'c' });
  }
  y += 84;
  const regles = [
    'POUR CORRIGER :',
    '- DESSINE SUR <CARTE>_SCHEMA.PNG (1 PIXEL = 1 CASE) AVEC LES COULEURS CI-DESSUS (PIPETTE), PINCEAU DUR DE PREFERENCE.',
    '  LA VERSION X8 PEUT AUSSI REVENIR (MEME TAILLE EXACTE) : GRILLE, NOMS ET REPERES SONT IGNORES.',
    '- POUR LE RELIEF, DESSINE SUR <CARTE>_HAUTEURS.PNG EN GRIS (LES PALIERS CI-DESSUS).',
    '  LA CARTE DES HAUTEURS FAIT FOI : LA NORMAL MAP EN EST TIREE, ELLE SE REGENERE. NE PAS LA RETOUCHER.',
    '  LA VERSION X8 COLOREE DES HAUTEURS SERT A LIRE LE RELIEF : ELLE NE REVIENT PAS (DESSINER SUR LE GRIS).',
    '- UN PLATEAU PLUS HAUT RECOIT SA FALAISE SOUS SON BORD SUD (AUTOMATIQUE) ; POUR Y MONTER, DESSINE DES MARCHES',
    '  (UN SEUL NIVEAU D\'ECART PAR MARCHE) LA OU UN CHEMIN FRANCHIT LE BORD.',
    '- PNG DE PREFERENCE, A LA TAILLE D\'ORIGINE (NE PAS RECADRER NI REDIMENSIONNER). JPEG : RENVOYER LA VERSION X8.',
    '- TRANSPARENT = INCHANGE : ON PEUT RENVOYER SEULEMENT LE CALQUE DES CORRECTIONS SUR FOND TRANSPARENT.',
    '- GROTTES : LEUR RELIEF SUIT LA ROCHE DU SCHEMA (GRADINS 1 A 3 CALCULES AU RENDU), SA CARTE DES HAUTEURS NE REVIENT PAS.',
    'NORMAL MAP : CONVENTION OPENGL (ROUGE = EST, VERT = NORD, BLEU = HAUT), UNE PENTE D\'UN ETAGE PAR CASE.',
  ];
  for (const r of regles) { ecrire(img, r, 20, y, r.endsWith(':') ? jaune : clair, { e: 2 }); y += ligne; }
  const out = image(W, y + 16); out.d.set(img.d.subarray(0, out.d.length));
  ecrirePNG(join(dossier, 'legende.png'), out); faits.push(['legende.png', out.w, out.h]);

  const md = [];
  md.push('# Odyssée — schéma des cartes : légende', '');
  md.push('Images produites par `node tools/odyssee-schema.mjs`, à corriger puis à renvoyer à `node tools/odyssee-schema-import.mjs`.', '');
  md.push('## Fichiers', '', '| Carte | Identifiant | Taille (cases) | Fichiers |', '|---|---|---|---|');
  for (const m of cartes) md.push(`| ${m.name} | \`${m.id}\` | ${m.w} × ${m.h} | \`${nomFichier(m.id)}_schema.png\`, \`_schema_x8\`, \`_hauteurs\`, \`_hauteurs_x8\`, \`_normales\`, \`_normales_x8\` |`);
  md.push('', 'Pour chaque carte :', '',
    '- `_schema.png` : 1 pixel = 1 case, la couleur exacte du type de case. **C\'est l\'image à corriger.**',
    '- `_schema_x8.png` : la même agrandie ×8 (sans lissage), grille fine toutes les 8 cases et marquée toutes les 32, coordonnées (bords tous les 16, croisements tous les 32), noms des villes, des routes et des zones, entrées des grottes ; carré blanc cerclé de noir = PNJ, losange orange = objet. C\'est l\'image à regarder ; elle peut aussi revenir corrigée (même taille exacte : la grille, les écritures et les repères sont ignorés).',
    '- `_hauteurs.png` : la hauteur de chaque case en gris (voir l\'échelle). **C\'est l\'image à corriger pour le relief.**',
    '- `_hauteurs_x8.png` : lecture du relief : teintes hypsométriques (vert bas → brun → blanc), ombrage, courbes de niveau à chaque changement d\'étage (trait double au-delà d\'un étage), eau en bleu, ravins en violet sombre, « NIV n » sur les grands replats. Elle ne revient pas.',
    '- `_normales.png` (1 pixel = 1 case) et `_normales_x8.png` (lissée) : la normal map tirée des hauteurs, convention OpenGL (rouge = est, vert = nord, bleu = vers le haut), une pente d\'un étage par case. **Elle est dérivée : c\'est la carte des hauteurs qui fait foi.** Une normal map retouchée ne peut pas être relue ; elle se régénère à chaque export.',
    '');
  md.push('## Types de case', '', '| Couleur | Type | Code (`T` de `tiles.js`) | Modifiable par l\'image |', '|---|---|---|---|');
  for (const p of PALETTE) md.push(`| \`${p.hex}\` | ${p.nom} | \`T.${p.cle}\` = ${p.t} | ${p.fixe ? '**non** (fixe)' : p.interieur ? 'oui (n\'existe que dans les maisons et les arènes)' : 'oui'} |`);
  md.push('', '## Échelle des hauteurs', '', 'Gris = 32 + 16 × niveau (un étage = un palier de 16) ; ravin (fond d\'un gouffre de montagne) = 0 (noir).',
    'La consigne de départ (128 + 16 × niveau) ne tenait pas : les sommets des montagnes montent au niveau 12 (128 + 192 > 255).', '',
    '| Niveau | Gris |', '|---|---|', '| ravin | 0 |');
  for (let h = 0; h <= HMAX; h++) md.push(`| ${h} | ${grisDe(h)} |`);
  md.push('', 'Grottes : leur carte des hauteurs montre les gradins de roche que le rendu calcule (1 à 3 selon la distance au sol) ; ils suivent la roche du schéma : pour changer le relief d\'une grotte, on dessine la roche sur le schéma. Leur carte des hauteurs n\'est pas relue.', '');
  md.push('## Règles d\'édition', '',
    '- Dessiner avec les couleurs exactes de la palette (pipette sur `legende.png` ou sur l\'image elle-même). Un pinceau doux et une compression JPEG sont tolérés : chaque pixel prend la couleur de palette la plus proche, les pixels mélangés au bord d\'un trait prennent la couleur d\'un voisin, les pixels presque transparents sont ignorés.',
    '- Le mieux : PNG à la taille d\'origine (1 pixel = 1 case). En JPEG, renvoyer la version ×8 (un bloc de 8 × 8 pixels = une case : la grille, les écritures et le pourtour de chaque bloc ne votent pas, la case change si plus de la moitié du bloc a pris franchement une autre couleur). Un schéma 1 pixel = 1 case en JPEG est refusé (le JPEG y moyenne les couleurs sur 2 × 2 cases). La carte des hauteurs, elle, passe en JPEG.',
    '- Ne pas recadrer ni redimensionner (sinon l\'image est refusée, avec la taille attendue). Une image agrandie d\'un facteur entier (×2, ×4, ×8…) est acceptée.',
    '- On peut renvoyer seulement un calque de corrections sur fond transparent : le transparent ne change rien.',
    '- Les cases **fixes** (bâtiments, portes, panneaux, décor bloquant, entrées de grotte, tapis) ne changent pas : les recouvrir ou en dessiner de nouvelles est signalé et ignoré. Les PNJ et les objets ne bougent pas non plus ; une case qui les porte (ou un téléporteur) ne peut pas devenir infranchissable.',
    '- Relief (carte des hauteurs, en gris) : une zone rehaussée reçoit automatiquement sa falaise (`T.CLIFF`) sous son bord sud, une case par étage d\'écart, comme `plateau()` dans le jeu ; à l\'est, à l\'ouest et au nord, la différence de hauteur suffit (talus dessiné par le jeu). Pour y monter, dessiner des marches (`T.STAIRS`) sur le schéma, là où un chemin franchit le bord (un seul étage d\'écart par marche). Les gris exacts des paliers (pinceau dur, PNG) sont pris tels quels ; un gris intermédiaire (pinceau doux, JPEG) n\'est gardé que s\'il fait partie d\'une zone d\'au moins 2 × 2 cases changées au même niveau. Une carte des hauteurs agrandie d\'un facteur entier (en gris) est acceptée : chaque bloc vote.',
    '- Les ravins (gouffres des montagnes) ne se créent ni ne se comblent par l\'image.',
    '- Après un import appliqué, réexporter avant de dessiner de nouvelles corrections (ou passer `--base <dossier de l\'ancien export>` à l\'import).',
    '');
  writeFileSync(join(dossier, 'legende.md'), md.join('\n'));
  faits.push(['legende.md', 0, 0]);
}
