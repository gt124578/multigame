// Graphiques au format d'Excel (DrawingML) : écrits dans le .xlsx pour qu'Excel les affiche, et lus depuis
// les fichiers Excel pour que leurs graphiques apparaissent ici.
//   écriture : xl/charts/chartN.xml, xl/drawings/drawingN.xml (ancrage), relations, [Content_Types].xml
//   lecture  : spécification de graphique du Tableur (type, variante, plage, titres, légende, couleurs…)

import { preparerDonnees, PALETTES, normaliser } from './graphiques.js';
import { colVersLettres, parsePlage, ErreurFormule } from './formules.js';
import { PRST } from './formes.js';

const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const ech = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const val = (xml, balise) => { const m = new RegExp('<c:' + balise + '\\b[^>]*\\sval="([^"]*)"').exec(xml); return m ? m[1] : null; };

export const LARGEUR_DEFAUT = 84, HAUTEUR_DEFAUT = 24; // mêmes valeurs que la grille (app.js)
const EMU = 9525;
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_DESSIN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const REL_GRAPHIQUE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/** Feuille et plage désignées par la plage d'un graphique (« Données!A1:C9 » ou « A1:C9 »). */
export function feuilleEtPlage(classeur, f, plage) {
  let txt = String(plage || '').trim(), fi = classeur.feuilles.indexOf(f);
  const bang = txt.lastIndexOf('!');
  if (bang > 0) {
    const nom = txt.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
    const i = classeur.indexFeuille(nom);
    if (i >= 0) fi = i;
    txt = txt.slice(bang + 1);
  }
  const p = parsePlage(txt.replace(/\$/g, ''));
  return p ? { fi, p } : null;
}

/** Valeurs de la plage d'un graphique (matrice), bornées à la zone utilisée. */
export function matriceGraphique(classeur, f, plage) {
  const fp = feuilleEtPlage(classeur, f, plage);
  if (!fp) return [];
  const F = classeur.feuilles[fp.fi], p = fp.p;
  const r2 = Math.min(p.r2, F.zone.r2, p.r1 + 2000), c2 = Math.min(p.c2, F.zone.c2, p.c1 + 50);
  const m = [];
  for (let r = p.r1; r <= r2; r++) { const l = []; for (let c = p.c1; c <= c2; c++) { const v = classeur.valeur(fp.fi, r, c); l.push(v instanceof ErreurFormule ? null : v); } m.push(l); }
  return m;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

const refFeuille = (nom) => (/^[A-Za-z_][\w.]*$/.test(nom) ? nom : "'" + nom.replace(/'/g, "''") + "'");
const absolu = (r, c) => '$' + colVersLettres(c) + '$' + (r + 1);
const plageAbs = (nom, r1, c1, r2, c2) => refFeuille(nom) + '!' + absolu(r1, c1) + (r1 === r2 && c1 === c2 ? '' : ':' + absolu(r2, c2));
const hex = (c) => String(c || '#4472c4').replace('#', '').toUpperCase().padStart(6, '0').slice(-6);

function texteRiche(t) { return '<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:t>' + ech(t) + '</a:t></a:r></a:p></c:rich></c:tx>'; }
const titreXml = (t) => (t ? '<c:title>' + texteRiche(t) + '<c:overlay val="0"/></c:title>' : '');
function strCache(vals) { return '<c:strCache><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + ech(v) + '</c:v></c:pt>').join('') + '</c:strCache>'; }
function numCache(vals) { return '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => (v === null || v === undefined ? '' : '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>')).join('') + '</c:numCache>'; }

/** Construit les références de chaque série (dans la feuille source) à partir de la mise en page détectée. */
function references(classeur, f, g) {
  const fp = feuilleEtPlage(classeur, f, g.plage);
  if (!fp) return null;
  const F = classeur.feuilles[fp.fi];
  const m = matriceGraphique(classeur, f, g.plage);
  if (!m.length) return null;
  const d = preparerDonnees(m, g.type, g.enLignes);
  if (!d.series.length) return null;
  const p = { r1: fp.p.r1, c1: fp.p.c1, r2: fp.p.r1 + m.length - 1, c2: fp.p.c1 + m[0].length - 1 };
  const dl = d.enteteLigne ? 1 : 0, dc = d.enteteCol ? 1 : 0;
  // Dans le repère « après transposition » : ligne i, colonne j → cellule de la feuille
  const cellule = (i, j) => (g.enLignes ? { r: p.r1 + j, c: p.c1 + i } : { r: p.r1 + i, c: p.c1 + j });
  const nLignes = g.enLignes ? p.c2 - p.c1 + 1 : p.r2 - p.r1 + 1;
  const plageDe = (i1, j1, i2, j2) => { const a = cellule(i1, j1), b = cellule(i2, j2); return plageAbs(F.nom, Math.min(a.r, b.r), Math.min(a.c, b.c), Math.max(a.r, b.r), Math.max(a.c, b.c)); };
  const debutSeries = dc + (d.nuage && d.xDepuis === 'serie' ? 1 : 0);
  const series = d.series.map((s, k) => ({
    nom: s.nom, nomRef: d.enteteLigne ? plageDe(0, debutSeries + k, 0, debutSeries + k) : null,
    valRef: plageDe(dl, debutSeries + k, nLignes - 1, debutSeries + k), valeurs: s.valeurs,
  }));
  const catRef = d.enteteCol ? plageDe(dl, 0, nLignes - 1, 0) : null;
  const xRef = d.nuage ? (d.xDepuis === 'categories' ? catRef : d.xDepuis === 'serie' ? plageDe(dl, dc, nLignes - 1, dc) : null) : null;
  return { d, series, catRef, xRef };
}

function serieXml(g, ref, s, k, couleur, genre) {
  let x = '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>';
  const nom = (g.noms && g.noms[k]) || s.nom;
  if (s.nomRef && !(g.noms && g.noms[k])) x += '<c:tx><c:strRef><c:f>' + ech(s.nomRef) + '</c:f>' + strCache([nom]) + '</c:strRef></c:tx>';
  else x += '<c:tx><c:v>' + ech(nom) + '</c:v></c:tx>';
  const ep = Math.round((+g.epaisseur || 2) * 12700);
  const marqueur = genre === 'nuage' ? (g.variante === 'points' || g.marqueurs !== false) : g.marqueurs;
  if (genre === 'ligne' || genre === 'nuage' || (genre === 'radar' && g.variante !== 'rempli')) {
    x += genre === 'nuage' && g.variante === 'points' ? '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>' : '<c:spPr><a:ln w="' + ep + '" cap="rnd"><a:solidFill><a:srgbClr val="' + hex(couleur) + '"/></a:solidFill><a:round/></a:ln></c:spPr>';
    x += marqueur ? '<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="' + hex(couleur) + '"/></a:solidFill></c:spPr></c:marker>' : '<c:marker><c:symbol val="none"/></c:marker>';
  } else if (genre === 'secteur') {
    x += '<c:spPr><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>';
    if (g.variante === 'eclate') x += '<c:explosion val="12"/>';
    const palette = PALETTES[g.palette] || PALETTES.arcadia;
    s.valeurs.forEach((_, i) => { x += '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="' + hex(g.couleurs[i] || palette[i % palette.length]) + '"/></a:solidFill></c:spPr></c:dPt>'; });
  } else {
    x += '<c:spPr><a:solidFill><a:srgbClr val="' + hex(couleur) + '"/></a:solidFill></c:spPr>';
    if (genre === 'barre') x += '<c:invertIfNegative val="0"/>';
  }
  if (g.etiquettes && g.etiquettes !== 'aucune') {
    x += '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="' + (g.etiquettes === 'valeur' ? 1 : 0) + '"/><c:showCatName val="' + (g.etiquettes === 'categorie' ? 1 : 0) + '"/><c:showSerName val="0"/><c:showPercent val="' + (g.etiquettes === 'pourcentage' ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>';
  }
  const t = g.tendances && g.tendances[k];
  if (t && t.type && genre !== 'secteur' && genre !== 'radar') {
    const type = { lineaire: 'linear', exponentielle: 'exp', logarithmique: 'log', polynomiale: 'poly', puissance: 'power', moyenne: 'movingAvg' }[t.type] || 'linear';
    x += '<c:trendline><c:spPr><a:ln w="19050" cap="rnd"><a:solidFill><a:srgbClr val="' + hex(couleur) + '"/></a:solidFill><a:prstDash val="sysDash"/></a:ln></c:spPr><c:trendlineType val="' + type + '"/>'
      + (type === 'poly' ? '<c:order val="' + Math.max(2, Math.min(6, +t.ordre || 2)) + '"/>' : '') + (type === 'movingAvg' ? '<c:period val="' + Math.max(2, +t.periode || 2) + '"/>' : '')
      + (type === 'movingAvg' ? '' : '<c:dispRSqr val="' + (t.r2 ? 1 : 0) + '"/><c:dispEq val="' + (t.equation ? 1 : 0) + '"/>') + '</c:trendline>';
  }
  const cats = ref.d.categories;
  if (genre === 'nuage') {
    if (ref.xRef) x += '<c:xVal><c:numRef><c:f>' + ech(ref.xRef) + '</c:f>' + numCache(ref.d.xs) + '</c:numRef></c:xVal>';
    x += '<c:yVal><c:numRef><c:f>' + ech(s.valRef) + '</c:f>' + numCache(s.valeurs) + '</c:numRef></c:yVal><c:smooth val="' + (g.variante === 'lisse' ? 1 : 0) + '"/>';
  } else {
    if (ref.catRef) x += '<c:cat><c:strRef><c:f>' + ech(ref.catRef) + '</c:f>' + strCache(cats) + '</c:strRef></c:cat>';
    x += '<c:val><c:numRef><c:f>' + ech(s.valRef) + '</c:f>' + numCache(s.valeurs) + '</c:numRef></c:val>';
    if (genre === 'ligne') x += '<c:smooth val="' + (g.lisse ? 1 : 0) + '"/>';
  }
  return x + '</c:ser>';
}

function axesXml(g, idCat, idVal, { horizontal = false, nuage = false } = {}) {
  const pos = horizontal ? ['l', 'b'] : ['b', 'l'];
  const echelle = '<c:scaling><c:orientation val="minMax"/>' + (g.yMax !== undefined && g.yMax !== '' && g.yMax !== null ? '<c:max val="' + +g.yMax + '"/>' : '') + (g.yMin !== undefined && g.yMin !== '' && g.yMin !== null ? '<c:min val="' + +g.yMin + '"/>' : '') + '</c:scaling>';
  const graduations = '<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>';
  const premier = nuage
    ? '<c:valAx><c:axId val="' + idCat + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' + (g.quadrillageX ? '<c:majorGridlines/>' : '') + titreXml(g.titreX) + '<c:numFmt formatCode="General" sourceLinked="1"/>' + graduations + '<c:crossAx val="' + idVal + '"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>'
    : '<c:catAx><c:axId val="' + idCat + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + pos[0] + '"/>' + (g.quadrillageX ? '<c:majorGridlines/>' : '') + titreXml(g.titreX) + '<c:numFmt formatCode="General" sourceLinked="1"/>' + graduations + '<c:crossAx val="' + idVal + '"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
  return premier + '<c:valAx><c:axId val="' + idVal + '"/>' + echelle + '<c:delete val="0"/><c:axPos val="' + (nuage ? 'l' : pos[1]) + '"/>' + (g.quadrillage !== false ? '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : '')
    + titreXml(g.titreY) + '<c:numFmt formatCode="' + ech(g.formatY || 'General') + '" sourceLinked="' + (g.formatY ? 0 : 1) + '"/>' + graduations + '<c:crossAx val="' + idCat + '"/><c:crosses val="autoZero"/><c:crossBetween val="' + (nuage ? 'midCat' : 'between') + '"/></c:valAx>';
}

/** XML d'un graphique (chartN.xml) ; null si les données ne permettent pas de le décrire. */
export function chartXml(classeur, f, g0) {
  const g = normaliser(JSON.parse(JSON.stringify(g0)));
  const ref = references(classeur, f, g);
  if (!ref) return null;
  const palette = PALETTES[g.palette] || PALETTES.arcadia;
  const couleur = (k) => g.couleurs[k] || palette[k % palette.length];
  const idA = 50010001, idB = 50010002;
  const grouping = { groupe: 'clustered', empile: 'stacked', empile100: 'percentStacked' }[g.variante] || 'clustered';
  // Séries de l'axe secondaire : à part, dans une courbe sur ses propres axes (C, D)
  const estSec = (k) => !!(g.secondaire && g.secondaire[k]) && ref.series.length > 1 && ['colonnes', 'lignes', 'aires', 'combine'].includes(g.type);
  const ser = (genre, debut = 0, fin = ref.series.length) => ref.series.slice(debut, fin).map((s, i) => (estSec(debut + i) ? '' : serieXml(g, ref, s, debut + i, couleur(debut + i), genre))).join('');
  const idC = 50010003, idD = 50010004;
  const secs = ref.series.map((s, k) => (estSec(k) ? serieXml(g, ref, s, k, couleur(k), 'ligne') : '')).join('');
  const groupeSec = secs ? '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + secs + '<c:marker val="1"/><c:axId val="' + idC + '"/><c:axId val="' + idD + '"/></c:lineChart>' : '';
  const axesSec = secs ? '<c:catAx><c:axId val="' + idC + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + idD + '"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
    + '<c:valAx><c:axId val="' + idD + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="r"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + idC + '"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>' : '';
  let corps;
  switch (g.type) {
    case 'cascade': // Excel : histogramme (la cascade complète est gardée par ce tableur dans sa feuille masquée)
    case 'colonnes': case 'barres':
      corps = '<c:barChart><c:barDir val="' + (g.type === 'barres' ? 'bar' : 'col') + '"/><c:grouping val="' + grouping + '"/><c:varyColors val="0"/>' + ser('barre') + '<c:gapWidth val="80"/>' + (grouping !== 'clustered' ? '<c:overlap val="100"/>' : '') + '<c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:barChart>' + groupeSec + axesXml(g, idA, idB, { horizontal: g.type === 'barres' }) + axesSec;
      break;
    case 'lignes':
      corps = '<c:lineChart><c:grouping val="' + (g.variante === 'empile' ? 'stacked' : 'standard') + '"/><c:varyColors val="0"/>' + ser('ligne') + '<c:marker val="1"/><c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:lineChart>' + groupeSec + axesXml(g, idA, idB) + axesSec;
      break;
    case 'aires':
      corps = '<c:areaChart><c:grouping val="' + (g.variante === 'empile' ? 'stacked' : g.variante === 'empile100' ? 'percentStacked' : 'standard') + '"/><c:varyColors val="0"/>' + ser('aire') + '<c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:areaChart>' + groupeSec + axesXml(g, idA, idB) + axesSec;
      break;
    case 'secteurs':
      corps = g.variante === 'anneau'
        ? '<c:doughnutChart><c:varyColors val="1"/>' + ser('secteur', 0, 1) + '<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>'
        : '<c:pieChart><c:varyColors val="1"/>' + ser('secteur', 0, 1) + '<c:firstSliceAng val="0"/></c:pieChart>';
      break;
    case 'nuage':
      corps = '<c:scatterChart><c:scatterStyle val="' + (g.variante === 'lisse' ? 'smoothMarker' : 'lineMarker') + '"/><c:varyColors val="0"/>' + ser('nuage') + '<c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:scatterChart>' + axesXml(g, idA, idB, { nuage: true });
      break;
    case 'radar':
      corps = '<c:radarChart><c:radarStyle val="' + (g.variante === 'rempli' ? 'filled' : 'marker') + '"/><c:varyColors val="0"/>' + ser(g.variante === 'rempli' ? 'aire' : 'radar') + '<c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:radarChart>' + axesXml(g, idA, idB);
      break;
    case 'combine':
      corps = '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + ser('barre', 0, 1) + '<c:gapWidth val="80"/><c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:barChart>'
        + (ref.series.slice(1).some((_, i) => !estSec(i + 1)) ? '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + ser('ligne', 1) + '<c:marker val="1"/><c:axId val="' + idA + '"/><c:axId val="' + idB + '"/></c:lineChart>' : '') + groupeSec + axesXml(g, idA, idB) + axesSec;
      break;
    default: return null;
  }
  const leg = { droite: 'r', bas: 'b', haut: 't', gauche: 'l' }[g.legende];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/><c:chart>'
    + (g.titre ? titreXml(g.titre) + '<c:autoTitleDeleted val="0"/>' : '<c:autoTitleDeleted val="1"/>')
    + '<c:plotArea><c:layout/>' + corps + '</c:plotArea>'
    + (leg ? '<c:legend><c:legendPos val="' + leg + '"/><c:overlay val="0"/></c:legend>' : '')
    + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
    + (g.fond && g.fond !== 'transparent' ? '<c:spPr><a:solidFill><a:srgbClr val="' + hex(g.fond) + '"/></a:solidFill></c:spPr>' : '')
    + '</c:chartSpace>';
}

// Pixels de la feuille → cellule + décalage (EMU)
function versCellule(px, tailles, defaut) {
  let i = 0, pos = 0;
  for (;;) { const t = tailles[i] ?? defaut; if (pos + t > px || i > 20000) break; pos += t; i++; }
  return { i, off: Math.max(0, Math.round((px - pos) * EMU)) };
}
function ancreXml(f, g) {
  const a = versCellule(g.x, f.largeurs, LARGEUR_DEFAUT), b = versCellule(g.y, f.hauteurs, HAUTEUR_DEFAUT);
  const c = versCellule(g.x + g.w, f.largeurs, LARGEUR_DEFAUT), d = versCellule(g.y + g.h, f.hauteurs, HAUTEUR_DEFAUT);
  const coin = (nom, col, lig) => '<xdr:' + nom + '><xdr:col>' + col.i + '</xdr:col><xdr:colOff>' + col.off + '</xdr:colOff><xdr:row>' + lig.i + '</xdr:row><xdr:rowOff>' + lig.off + '</xdr:rowOff></xdr:' + nom + '>';
  return coin('from', a, b) + coin('to', c, d);
}

// Rectangle en pixels d'un objet ancré { de, a } ou { de, w, h } (images et formes)
function rectAncre(f, o) {
  const x = (c, dx) => { let s = 0; for (let i = 0; i < c; i++) s += f.largeurs[i] ?? LARGEUR_DEFAUT; return s + (dx || 0); };
  const y = (r, dy) => { let s = 0; for (let i = 0; i < r; i++) s += f.hauteurs[i] ?? HAUTEUR_DEFAUT; return s + (dy || 0); };
  const x1 = x(o.de.c, o.de.dx), y1 = y(o.de.r, o.de.dy);
  if (o.a) return { x: x1, y: y1, w: Math.max(1, x(o.a.c, o.a.dx) - x1), h: Math.max(0, y(o.a.r, o.a.dy) - y1) };
  return { x: x1, y: y1, w: o.w ?? 80, h: o.h ?? 24 };
}
const remplissage = (c) => (!c || c === 'aucun' ? '<a:noFill/>' : '<a:solidFill><a:srgbClr val="' + hex(c) + '"/></a:solidFill>');
/** Forme ou zone de texte en DrawingML (xdr:sp), retrouvée à la relecture grâce à descr="tableur:id". */
function formeXml(o, id, r) {
  const ligne = o.forme === 'ligne';
  const trait = o.trait === 'aucun' ? '<a:ln><a:noFill/></a:ln>' : '<a:ln w="' + Math.round((+o.epaisseur || 1) * EMU) + '">' + remplissage(o.trait || '#000000') + '</a:ln>';
  const xfrm = '<a:xfrm' + (ligne && o.inverse ? ' flipV="1"' : '') + '><a:off x="' + Math.round(r.x * EMU) + '" y="' + Math.round(r.y * EMU) + '"/><a:ext cx="' + Math.round(r.w * EMU) + '" cy="' + Math.round(r.h * EMU) + '"/></a:xfrm>';
  const sz = Math.round((o.taille || 15) * 0.75 * 100);
  const rPr = '<a:rPr lang="fr-FR" sz="' + sz + '"' + (o.gras ? ' b="1"' : '') + (o.italique ? ' i="1"' : '') + (o.souligne ? ' u="sng"' : '') + '>' + remplissage(o.couleurTexte || '#000000') + '<a:latin typeface="' + ech(o.police || 'Calibri') + '"/></a:rPr>';
  const algn = { left: 'l', center: 'ctr', right: 'r' }[o.align || 'center'];
  const paras = String(o.texte || '').split('\n').map((l) => '<a:p><a:pPr algn="' + algn + '"/>' + (l ? '<a:r>' + rPr + '<a:t>' + ech(l) + '</a:t></a:r>' : '<a:endParaRPr lang="fr-FR" sz="' + sz + '"/>') + '</a:p>').join('');
  const corps = ligne ? '' : '<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square" lIns="45720" tIns="45720" rIns="45720" bIns="45720" rtlCol="0" anchor="' + ({ top: 't', middle: 'ctr', bottom: 'b' }[o.valign || 'middle']) + '"/><a:lstStyle/>' + paras + '</xdr:txBody>';
  return '<xdr:sp macro="' + ech(o.macro || '') + '" textlink=""><xdr:nvSpPr><xdr:cNvPr id="' + id + '" name="' + (o.forme === 'texte' ? 'Zone de texte ' : 'Forme ') + id + '" descr="tableur:' + ech(o.id) + '"/><xdr:cNvSpPr' + (o.forme === 'texte' ? ' txBox="1"' : '') + '/></xdr:nvSpPr>'
    + '<xdr:spPr>' + xfrm + '<a:prstGeom prst="' + (PRST[o.forme] || 'rect') + '"><a:avLst/></a:prstGeom>' + (ligne ? '<a:noFill/>' : remplissage(o.fond)) + trait + '</xdr:spPr>' + corps + '</xdr:sp>';
}
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp' };
function octetsDataUrl(src) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src || '');
  if (!m) return null;
  const brut = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const u = new Uint8Array(brut.length); for (let i = 0; i < brut.length; i++) u[i] = brut.charCodeAt(i);
  return { mime: m[1].toLowerCase(), octets: u };
}

/** Ajoute les graphiques, images et formes au .xlsx écrit par SheetJS (les feuilles sont xl/worksheets/sheetK.xml dans l'ordre du classeur). */
export function ecrireGraphiquesXlsx(XLSX, octets, classeur) {
  if (!classeur.feuilles.some((f) => (f.graphiques && f.graphiques.length) || (f.images && f.images.length))) return octets;
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const index = (chemin) => cfb.FullPaths.findIndex((p) => p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase() === chemin.toLowerCase());
  const lire = (chemin) => { const i = index(chemin); return i < 0 ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); };
  const ecrire = (chemin, texte) => { const brut = typeof texte === 'string' ? enc(texte) : texte; const i = index(chemin); if (i >= 0) cfb.FileIndex[i].content = brut; else XLSX.CFB.utils.cfb_add(cfb, '/' + chemin, brut); };
  let types = lire('[Content_Types].xml');
  if (!types) return octets;
  let nGraph = 0, nDessin = 0, nImage = 0;
  const extensions = new Set();
  while (index('xl/drawings/drawing' + (nDessin + 1) + '.xml') >= 0) nDessin++;
  while (index('xl/charts/chart' + (nGraph + 1) + '.xml') >= 0) nGraph++;
  classeur.feuilles.forEach((f, k) => {
    if ((!f.graphiques || !f.graphiques.length) && (!f.images || !f.images.length)) return;
    const cheminFeuille = 'xl/worksheets/sheet' + (k + 1) + '.xml';
    let xml = lire(cheminFeuille);
    if (!xml || xml.includes('<drawing ')) return;
    const ancres = [], relsDessin = [];
    f.graphiques.forEach((g, i) => {
      const c = chartXml(classeur, f, g);
      if (!c) return;
      nGraph++;
      ecrire('xl/charts/chart' + nGraph + '.xml', c);
      types = types.replace('</Types>', '<Override PartName="/xl/charts/chart' + nGraph + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
      relsDessin.push('<Relationship Id="rId' + (i + 1) + '" Type="' + REL_GRAPHIQUE + '" Target="../charts/chart' + nGraph + '.xml"/>');
      ancres.push('<xdr:twoCellAnchor editAs="oneCell">' + ancreXml(f, g) + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="Graphique ' + (i + 1) + '" descr="tableur:' + ech(g.id) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>'
        + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="rId' + (i + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>');
    });
    // Images (vraies images d'Excel) et formes, dans l'ordre de la feuille (le dernier passe devant)
    let idObjet = 1000;
    for (const o of f.images || []) {
      if (!o.de) continue;
      const r = rectAncre(f, o), ancre = ancreXml(f, r);
      idObjet++;
      if (o.forme) { ancres.push('<xdr:twoCellAnchor editAs="oneCell">' + ancre + formeXml(o, idObjet, r) + '<xdr:clientData/></xdr:twoCellAnchor>'); continue; }
      const img = octetsDataUrl(o.src), ext = img && MIME_EXT[img.mime];
      if (!ext) continue;
      nImage++;
      ecrire('xl/media/image' + nImage + '.' + ext, img.octets);
      extensions.add(ext + '|' + img.mime);
      const rid = 'rIdImg' + nImage;
      relsDessin.push('<Relationship Id="' + rid + '" Type="' + REL_IMAGE + '" Target="../media/image' + nImage + '.' + ext + '"/>');
      const transparent = o.transparentBlanc ? '<a:clrChange><a:clrFrom><a:srgbClr val="FFFFFF"/></a:clrFrom><a:clrTo><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:clrTo></a:clrChange>' : '';
      ancres.push('<xdr:twoCellAnchor editAs="oneCell">' + ancre + '<xdr:pic macro="' + ech(o.macro || '') + '"><xdr:nvPicPr><xdr:cNvPr id="' + idObjet + '" name="Image ' + idObjet + '" descr="tableur:' + ech(o.id) + '"' + (o.titre ? ' title="' + ech(o.titre) + '"' : '') + '/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
        + '<xdr:blipFill><a:blip xmlns:r="' + NS_R + '" r:embed="' + rid + '">' + transparent + '</a:blip><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
        + '<xdr:spPr><a:xfrm><a:off x="' + Math.round(r.x * EMU) + '" y="' + Math.round(r.y * EMU) + '"/><a:ext cx="' + Math.round(r.w * EMU) + '" cy="' + Math.round(r.h * EMU) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>');
    }
    if (!ancres.length) return;
    nDessin++;
    const dessin = 'xl/drawings/drawing' + nDessin + '.xml';
    ecrire(dessin, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '">' + ancres.join('') + '</xdr:wsDr>');
    ecrire('xl/drawings/_rels/drawing' + nDessin + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relsDessin.join('') + '</Relationships>');
    types = types.replace('</Types>', '<Override PartName="/' + dessin + '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    // Relation feuille → dessin
    const cheminRels = 'xl/worksheets/_rels/sheet' + (k + 1) + '.xml.rels';
    let rels = lire(cheminRels) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let id = 'rIdDessin1'; while (rels.includes('Id="' + id + '"')) id += 'b';
    rels = rels.replace('</Relationships>', '<Relationship Id="' + id + '" Type="' + REL_DESSIN + '" Target="../drawings/drawing' + nDessin + '.xml"/></Relationships>');
    ecrire(cheminRels, rels);
    // <drawing> se place avant legacyDrawing (commentaires), tableParts, extLst… (l'ordre compte pour Excel)
    const el = '<drawing r:id="' + id + '"/>';
    if (!/xmlns:r=/.test(xml.slice(0, 600))) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="' + NS_R + '" ');
    const suivant = xml.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[\s/>]/);
    xml = suivant >= 0 ? xml.slice(0, suivant) + el + xml.slice(suivant) : xml.replace('</worksheet>', el + '</worksheet>');
    ecrire(cheminFeuille, xml);
  });
  for (const e of extensions) { const [ext, mime] = e.split('|'); if (!new RegExp('Extension="' + ext + '"', 'i').test(types)) types = types.replace('</Types>', '<Default Extension="' + ext + '" ContentType="' + mime + '"/></Types>'); }
  ecrire('[Content_Types].xml', types);
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

function texteDe(xml) { return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => entites(m[1])).join('') || ([...xml.matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => entites(m[1]))[0] || ''); }
function parseRef(f) {
  const t = entites(f).trim().replace(/^\(|\)$/g, '');
  const bang = t.lastIndexOf('!');
  if (bang < 0) return null;
  const nom = t.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'").replace(/^\[\d+\]/, '');
  const p = parsePlage(t.slice(bang + 1).replace(/\$/g, ''));
  return p ? { nom, p } : null;
}
const COULEUR = (xml) => { const m = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml || ''); return m ? '#' + m[1].toLowerCase() : null; };

/**
 * Spécification du Tableur pour un graphique Excel (chartN.xml) ; null si le type n'est pas géré
 * ou si les séries ne viennent pas de cellules. La position est ajoutée par l'appelant.
 */
export function specDepuisChartXml(xml, nomFeuille) {
  const plot = /<c:plotArea>([\s\S]*?)<\/c:plotArea>/.exec(xml);
  if (!plot) return null;
  const P = plot[1];
  const types = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart', 'scatterChart', 'radarChart'];
  const presents = types.map((t) => ({ t, m: new RegExp('<c:' + t + '>([\\s\\S]*?)</c:' + t + '>').exec(P) })).filter((x) => x.m);
  if (!presents.length) return null;
  const g = { id: 'g' + Math.random().toString(36).slice(2, 9), v: 2, couleurs: {}, noms: {}, tendances: {}, secondaire: {} };
  const premier = presents[0], corps = premier.m[1];
  const grouping = val(corps, 'grouping');
  const variante = { clustered: 'groupe', standard: 'groupe', stacked: 'empile', percentStacked: 'empile100' }[grouping] || 'groupe';
  const bar = presents.find((x) => /^bar/.test(x.t)), ligne = presents.find((x) => /^line/.test(x.t));
  if (bar && ligne) { g.type = 'combine'; g.variante = 'groupe'; }
  else if (/^bar/.test(premier.t)) { g.type = val(corps, 'barDir') === 'bar' ? 'barres' : 'colonnes'; g.variante = variante; }
  else if (/^line/.test(premier.t)) { g.type = 'lignes'; g.variante = variante === 'empile100' ? 'empile' : variante; g.marqueurs = !/<c:symbol val="none"\/>/.test(corps); if (/<c:smooth val="1"/.test(corps)) g.lisse = true; }
  else if (/^area/.test(premier.t)) { g.type = 'aires'; g.variante = variante; }
  else if (premier.t === 'doughnutChart') { g.type = 'secteurs'; g.variante = 'anneau'; }
  else if (/[pP]ie/.test(premier.t)) { g.type = 'secteurs'; g.variante = /<c:explosion val="[1-9]/.test(corps) ? 'eclate' : 'plein'; }
  else if (premier.t === 'scatterChart') { g.type = 'nuage'; const st = val(corps, 'scatterStyle'); g.variante = /smooth/.test(st || '') || /<c:smooth val="1"/.test(corps) ? 'lisse' : /<a:ln[^>]*>\s*<a:noFill\/>/.test(corps) || st === 'marker' ? 'points' : 'lignes'; }
  else if (premier.t === 'radarChart') { g.type = 'radar'; g.variante = val(corps, 'radarStyle') === 'filled' ? 'rempli' : 'lignes'; }
  // Séries : références des cellules
  const refs = [];
  let horizontal = null, k = 0;
  // Axe secondaire : le groupe dont l'axe des valeurs est à droite
  const axesValeurs = new Map([...P.matchAll(/<c:valAx>([\s\S]*?)<\/c:valAx>/g)].map((a) => [val(a[1], 'axId'), val(a[1], 'axPos')]));
  for (const { m } of presents) for (const sm of m[1].matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
    const S = sm[1];
    const ids = [...m[1].matchAll(/<c:axId val="(\d+)"/g)].map((x) => x[1]);
    if (presents.length > 1 && ids.some((id) => axesValeurs.get(id) === 'r')) g.secondaire[k] = true;
    const tl = /<c:trendline>([\s\S]*?)<\/c:trendline>/.exec(S);
    if (tl) {
      const ty = { linear: 'lineaire', exp: 'exponentielle', log: 'logarithmique', poly: 'polynomiale', power: 'puissance', movingAvg: 'moyenne' }[val(tl[1], 'trendlineType')];
      if (ty) g.tendances[k] = { type: ty, ...(val(tl[1], 'order') ? { ordre: +val(tl[1], 'order') } : {}), ...(val(tl[1], 'period') ? { periode: +val(tl[1], 'period') } : {}), equation: val(tl[1], 'dispEq') === '1', r2: val(tl[1], 'dispRSqr') === '1' };
    }
    const fval = /<c:(?:val|yVal)>[\s\S]*?<c:f>([\s\S]*?)<\/c:f>/.exec(S);
    if (!fval) return null;
    const rv = parseRef(fval[1]); if (!rv) return null;
    refs.push(rv);
    if (horizontal === null) horizontal = rv.p.r1 === rv.p.r2 && rv.p.c2 > rv.p.c1;
    for (const b of ['cat', 'xVal']) { const fc = new RegExp('<c:' + b + '>[\\s\\S]*?<c:f>([\\s\\S]*?)</c:f>').exec(S); if (fc) { const r = parseRef(fc[1]); if (r) refs.push(r); } }
    const ft = /<c:tx>[\s\S]*?<c:f>([\s\S]*?)<\/c:f>/.exec(S); if (ft) { const r = parseRef(ft[1]); if (r) refs.push(r); }
    const sp = /<c:spPr>([\s\S]*?)<\/c:spPr>/.exec(S.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, '').replace(/<c:marker>[\s\S]*?<\/c:marker>/g, ''));
    const col = sp && COULEUR(sp[1]); if (col && g.type !== 'secteurs') g.couleurs[k] = col;
    if (g.type === 'secteurs') for (const dp of S.matchAll(/<c:dPt>([\s\S]*?)<\/c:dPt>/g)) { const i = val(dp[1], 'idx'), c2 = COULEUR(dp[1]); if (i !== null && c2) g.couleurs[+i] = c2; }
    k++;
  }
  if (!refs.length) return null;
  const nom = refs[0].nom;
  if (refs.some((r) => r.nom.toLowerCase() !== nom.toLowerCase())) return null;
  const r1 = Math.min(...refs.map((r) => r.p.r1)), c1 = Math.min(...refs.map((r) => r.p.c1)), r2 = Math.max(...refs.map((r) => r.p.r2)), c2 = Math.max(...refs.map((r) => r.p.c2));
  const plage = colVersLettres(c1) + (r1 + 1) + ':' + colVersLettres(c2) + (r2 + 1);
  g.plage = nom.toLowerCase() === String(nomFeuille || '').toLowerCase() ? plage : refFeuille(nom) + '!' + plage;
  if (horizontal) g.enLignes = true;
  // Titres, légende, axes
  const avant = xml.slice(0, xml.indexOf('<c:plotArea>'));
  const t = /<c:title>([\s\S]*?)<\/c:title>/.exec(avant);
  if (t) g.titre = texteDe(t[1]);
  const axes = [...P.matchAll(/<c:(catAx|valAx|dateAx)>([\s\S]*?)<\/c:\1>/g)];
  const axeCat = axes.find((a) => a[1] !== 'valAx') || (g.type === 'nuage' ? axes[0] : null);
  const axeVal = axes.filter((a) => a[1] === 'valAx' && val(a[2], 'axPos') !== 'r').pop() || axes.filter((a) => a[1] === 'valAx').pop();
  // Histogramme dont les courbes sont toutes sur l'axe secondaire : il reste un histogramme
  if (g.type === 'combine') {
    const enLigne = presents.filter((x) => /^line/.test(x.t)).flatMap((x) => [...x.m[1].matchAll(/<c:ser>[\s\S]*?<c:idx val="(\d+)"/g)].map((y) => +y[1]));
    const enBarre = presents.filter((x) => /^bar/.test(x.t)).reduce((n, x) => n + [...x.m[1].matchAll(/<c:ser>/g)].length, 0);
    if (enBarre > 1 || enLigne.every((i) => g.secondaire[i])) { g.type = 'colonnes'; g.variante = 'groupe'; }
  }
  if (axeCat) { const ti = /<c:title>([\s\S]*?)<\/c:title>/.exec(axeCat[2]); if (ti) g.titreX = texteDe(ti[1]); if (/<c:majorGridlines/.test(axeCat[2])) g.quadrillageX = true; }
  if (axeVal && axeVal !== axeCat) {
    const ti = /<c:title>([\s\S]*?)<\/c:title>/.exec(axeVal[2]); if (ti) g.titreY = texteDe(ti[1]);
    g.quadrillage = /<c:majorGridlines/.test(axeVal[2]);
    const mx = val(axeVal[2], 'max'), mn = val(axeVal[2], 'min'); if (mx !== null) g.yMax = +mx; if (mn !== null) g.yMin = +mn;
    const nf = /<c:numFmt formatCode="([^"]*)" sourceLinked="0"/.exec(axeVal[2]); if (nf && nf[1] !== 'General') g.formatY = entites(nf[1]);
  }
  const leg = /<c:legend>([\s\S]*?)<\/c:legend>/.exec(xml);
  g.legende = leg ? { r: 'droite', b: 'bas', t: 'haut', l: 'gauche', tr: 'droite' }[val(leg[1], 'legendPos') || 'r'] || 'droite' : 'aucune';
  const dl = /<c:dLbls>([\s\S]*?)<\/c:dLbls>/.exec(P);
  if (dl && !/<c:delete val="1"/.test(dl[1])) g.etiquettes = /<c:showPercent val="1"/.test(dl[1]) ? 'pourcentage' : /<c:showVal val="1"/.test(dl[1]) ? 'valeur' : /<c:showCatName val="1"/.test(dl[1]) ? 'categorie' : 'aucune';
  g.palette = 'office';
  return normaliser(g);
}

/** Position en pixels (repère de la grille) d'un ancrage { de, a } ou { de, w, h }. */
export function positionAncre(f, anc) {
  const x = (c, dx) => { let s = 0; for (let i = 0; i < c; i++) s += f.largeurs[i] ?? LARGEUR_DEFAUT; return s + (dx || 0); };
  const y = (r, dy) => { let s = 0; for (let i = 0; i < r; i++) s += f.hauteurs[i] ?? HAUTEUR_DEFAUT; return s + (dy || 0); };
  const x1 = x(anc.de.c, anc.de.dx), y1 = y(anc.de.r, anc.de.dy);
  if (anc.a) return { x: x1, y: y1, w: Math.max(120, x(anc.a.c, anc.a.dx) - x1), h: Math.max(90, y(anc.a.r, anc.a.dy) - y1) };
  return { x: x1, y: y1, w: anc.w || 480, h: anc.h || 288 };
}
