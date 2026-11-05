// Objets d'un classeur OpenDocument (.ods) : graphiques (objets « Object N » de LibreOffice), images (Pictures/)
// et formes (draw:custom-shape, draw:line). Écriture pour que LibreOffice les affiche, lecture des fichiers de LibreOffice.

import { colVersLettres, parsePlage } from './formules.js';
import { preparerDonnees, PALETTES, normaliser } from './graphiques.js';
import { feuilleEtPlage, matriceGraphique } from './graphiques-xlsx.js';

const ech = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom.replace(':', '\\:') + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const pouces = (px) => (px / 96).toFixed(4) + 'in';
const PX = (v) => { const m = /^(-?[\d.]+)(in|cm|mm|pt|px)?$/.exec(v || ''); if (!m) return null; const n = +m[1]; return m[2] === 'cm' ? n / 2.54 * 96 : m[2] === 'mm' ? n / 25.4 * 96 : m[2] === 'pt' ? n * 96 / 72 : m[2] === 'px' ? n : n * 96; };
export const LARGEUR = 84, HAUTEUR = 24;

const nomOds = (n) => (/^[\p{L}_][\p{L}\d_]*$/u.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");
const adr = (feuille, r1, c1, r2 = r1, c2 = c1) => nomOds(feuille) + '.' + colVersLettres(c1) + (r1 + 1) + ':' + nomOds(feuille) + '.' + colVersLettres(c2) + (r2 + 1);

/** Position en pixels du coin d'une cellule (repère de la feuille). */
export function geometrie(f) {
  const X = (c) => { let s = 0; for (let i = 0; i < c; i++) s += f.largeurs[i] ?? LARGEUR; return s; };
  const Y = (r) => { let s = 0; for (let i = 0; i < r; i++) s += f.hauteurs[i] ?? HAUTEUR; return s; };
  // Cellule sous un point (pour ancrer ce qu'on relit)
  const cellule = (x, y) => {
    let c = 0, sx = 0; while (c < 16383 && sx + (f.largeurs[c] ?? LARGEUR) <= x) { sx += f.largeurs[c] ?? LARGEUR; c++; }
    let r = 0, sy = 0; while (r < 1048575 && sy + (f.hauteurs[r] ?? HAUTEUR) <= y) { sy += f.hauteurs[r] ?? HAUTEUR; r++; }
    return { c, dx: Math.round(x - sx), r, dy: Math.round(y - sy) };
  };
  return { X, Y, cellule };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
const TYPES_ODS = { texte: 'rectangle', rect: 'rectangle', arrondi: 'round-rectangle', ellipse: 'ellipse', triangle: 'isosceles-triangle', losange: 'diamond', fleche: 'right-arrow', etoile: 'star5', bulle: 'round-rectangular-callout' };
const DEPUIS_TYPE_ODS = { rectangle: 'rect', 'round-rectangle': 'arrondi', ellipse: 'ellipse', circle: 'ellipse', 'isosceles-triangle': 'triangle', diamond: 'losange', 'right-arrow': 'fleche', star5: 'etoile', 'round-rectangular-callout': 'bulle', 'rectangular-callout': 'bulle', 'flowchart-process': 'rect' };
const CLASSES = { colonnes: 'bar', barres: 'bar', lignes: 'line', aires: 'area', secteurs: 'circle', nuage: 'scatter', radar: 'radar', combine: 'bar' };
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp' };

function octetsDataUrl(src) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src || '');
  if (!m) return null;
  const brut = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const u = new Uint8Array(brut.length); for (let i = 0; i < brut.length; i++) u[i] = brut.charCodeAt(i);
  return { mime: m[1].toLowerCase(), octets: u };
}

/** Contenu d'un objet graphique de LibreOffice (Object N/content.xml) pour un graphique du Tableur. */
function graphiqueOds(classeur, f, g0, NS) {
  const g = normaliser({ ...g0 });
  const fp = feuilleEtPlage(classeur, f, g.plage);
  if (!fp) return null;
  const nomF = classeur.feuilles[fp.fi].nom, p = fp.p;
  const m = matriceGraphique(classeur, f, g.plage);
  const d = preparerDonnees(m, g.type, !!g.enLignes);
  if (!d.series.length) return null;
  const r2 = p.r1 + m.length - 1, c2 = p.c1 + (m[0] || []).length - 1;
  const hl = d.enteteLigne ? 1 : 0, hc = d.enteteCol ? 1 : 0;
  const palette = PALETTES[g.palette] || PALETTES.arcadia;
  let styles = '', nSt = 0;
  const style = (props) => { const n = 'ch' + (++nSt); styles += '<style:style style:name="' + n + '" style:family="chart">' + props + '</style:style>'; return n; };
  const anneau = g.type === 'secteurs' && g.variante === 'anneau';
  const classe = anneau ? 'ring' : g.type === 'radar' && g.variante === 'rempli' ? 'filled-radar' : CLASSES[g.type] || 'bar';
  const plot = style('<style:chart-properties' + (g.type === 'barres' ? ' chart:vertical="true"' : '') + (g.variante === 'empile' ? ' chart:stacked="true"' : g.variante === 'empile100' ? ' chart:percentage="true"' : '')
    + (g.type === 'lignes' && g.lisse ? ' chart:interpolation="cubic-spline"' : '') + (g.type === 'lignes' && g.marqueurs === false ? ' chart:symbol-type="none"' : g.type === 'lignes' ? ' chart:symbol-type="automatic"' : '')
    + (g.type === 'nuage' && g.variante === 'points' ? ' chart:symbol-type="automatic"' : '') + '/>');
  const serieXml = (k, nom, couleur) => {
    // Séries en colonnes (ou en lignes si enLignes) : valeurs sous l'en-tête, nom dans l'en-tête
    const vals = g.enLignes ? adr(nomF, p.r1 + hl + k, p.c1 + hc, p.r1 + hl + k, c2) : adr(nomF, p.r1 + hl, p.c1 + hc + k, r2, p.c1 + hc + k);
    const lab = d.enteteLigne || (g.enLignes && d.enteteCol) ? (g.enLignes ? adr(nomF, p.r1 + hl + k, p.c1) : adr(nomF, p.r1, p.c1 + hc + k)) : null;
    const sec = g.type === 'combine' && (g.secondaire[k] || k > 0);
    const st = style('<style:graphic-properties draw:fill-color="' + couleur + '" svg:stroke-color="' + couleur + '"' + (g.type === 'lignes' || g.type === 'nuage' || sec ? ' svg:stroke-width="0.07cm"' : '') + '/>');
    return '<chart:series chart:style-name="' + st + '" chart:values-cell-range-address="' + ech(vals) + '"' + (lab ? ' chart:label-cell-address="' + ech(lab) + '"' : '') + (sec ? ' chart:class="chart:line"' : '') + '>'
      + (g.type === 'nuage' && d.xDepuis !== 'index' ? '<chart:domain table:cell-range-address="' + ech(g.enLignes ? adr(nomF, p.r1, p.c1 + hc, p.r1, c2) : adr(nomF, p.r1 + hl, p.c1, r2, p.c1)) + '"/>' : '')
      + (g.type === 'secteurs' ? (d.categories || []).map((_, i) => '<chart:data-point chart:style-name="' + style('<style:graphic-properties draw:fill-color="' + (g.couleurs[i] || palette[i % palette.length]) + '"/>') + '"/>').join('') : '')
      + '</chart:series>';
  };
  const series = d.series.map((s, k) => serieXml(k + (g.type === 'nuage' && d.xDepuis === 'serie' ? 1 : 0), s.nom, g.couleurs[k] || palette[k % palette.length])).join('');
  const cats = d.enteteCol && g.type !== 'nuage' ? '<chart:categories table:cell-range-address="' + ech(g.enLignes ? adr(nomF, p.r1, p.c1 + hc, p.r1, c2) : adr(nomF, p.r1 + hl, p.c1, r2, p.c1)) + '"/>' : '';
  // Axes (aussi pour les secteurs : c'est l'axe des X qui porte les noms des parts)
  const stAxe = style('<style:chart-properties chart:display-label="' + (g.type !== 'secteurs') + '" chart:visible="' + (g.type !== 'secteurs') + '"/><style:graphic-properties svg:stroke-color="#b3b3b3"/><style:text-properties fo:font-size="9pt" fo:color="#595959"/>');
  const stGrille = style('<style:graphic-properties svg:stroke-color="#d9d9d9"/>');
  const axes = '<chart:axis chart:dimension="x" chart:name="primary-x" chart:style-name="' + stAxe + '">' + (g.titreX ? '<chart:title><text:p>' + ech(g.titreX) + '</text:p></chart:title>' : '') + cats + '</chart:axis>'
    + '<chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="' + stAxe + '">' + (g.titreY ? '<chart:title><text:p>' + ech(g.titreY) + '</text:p></chart:title>' : '') + (g.quadrillage !== false && g.type !== 'secteurs' ? '<chart:grid chart:style-name="' + stGrille + '" chart:class="major"/>' : '') + '</chart:axis>';
  const mur = '<chart:wall chart:style-name="' + style('<style:graphic-properties draw:fill="none" draw:stroke="none"/>') + '"/>';
  const leg = { droite: 'end', gauche: 'start', haut: 'top', bas: 'bottom' }[g.legende];
  const fondCh = style('<style:graphic-properties draw:fill="solid" draw:fill-color="#ffffff" draw:stroke="none"/>');
  const corps = '<chart:chart svg:width="' + pouces(g.w || 480) + '" svg:height="' + pouces(g.h || 288) + '" chart:class="chart:' + classe + '" chart:style-name="' + fondCh + '">'
    + (g.titre ? '<chart:title><text:p>' + ech(g.titre) + '</text:p></chart:title>' : '')
    + (leg ? '<chart:legend chart:legend-position="' + leg + '"/>' : '')
    + '<chart:plot-area chart:style-name="' + plot + '" table:cell-range-address="' + ech(adr(nomF, p.r1, p.c1, r2, c2)) + '" chart:data-source-has-labels="' + (hl && hc ? 'both' : hl ? 'row' : hc ? 'column' : 'none') + '">' + axes + series + mur + '</chart:plot-area></chart:chart>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + NS + ' xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" office:version="1.3"><office:automatic-styles>' + styles + '</office:automatic-styles><office:body><office:chart>' + corps + '</office:chart></office:body></office:document-content>';
}

/**
 * Graphiques, images et formes d'une feuille pour le .ods : renvoie le contenu de <table:shapes>, les styles
 * automatiques à ajouter, et les fichiers à mettre dans l'archive ({ chemin, octets | texte, type }).
 * compteur : { objet, image, style } partagé entre les feuilles ; styleTexte(s) : style de texte (gras, couleur…).
 */
export function objetsOds(classeur, f, compteur, styleTexte, NS) {
  const { X, Y } = geometrie(f);
  let shapes = '', styles = '';
  const fichiers = [];
  const styleGraphique = (props) => { const n = 'gr' + (++compteur.style); styles += '<style:style style:name="' + n + '" style:family="graphic"><style:graphic-properties' + props + '/></style:style>'; return n; };
  const styleParagraphe = (align) => { const n = 'P' + (++compteur.style); styles += '<style:style style:name="' + n + '" style:family="paragraph"><style:paragraph-properties fo:text-align="' + ({ left: 'start', center: 'center', right: 'end' }[align] || 'center') + '"/></style:style>'; return n; };
  let z = 0;
  for (const g of f.graphiques || []) {
    const xml = graphiqueOds(classeur, f, g, NS);
    if (!xml) continue;
    const n = ++compteur.objet;
    fichiers.push({ chemin: 'Object ' + n + '/content.xml', texte: xml, type: 'text/xml' }, { chemin: 'Object ' + n + '/', type: 'application/vnd.oasis.opendocument.chart', dossier: true });
    shapes += '<draw:frame draw:z-index="' + (z++) + '" draw:name="Graphique ' + n + '" svg:x="' + pouces(g.x || 0) + '" svg:y="' + pouces(g.y || 0) + '" svg:width="' + pouces(g.w || 480) + '" svg:height="' + pouces(g.h || 288) + '"><draw:object xlink:href="./Object ' + n + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:desc>tableur:' + ech(g.id) + '</svg:desc></draw:frame>';
  }
  for (const o of f.images || []) {
    if (!o.de) continue;
    const x = X(o.de.c) + (o.de.dx || 0), y = Y(o.de.r) + (o.de.dy || 0);
    const w = o.a ? Math.max(1, X(o.a.c) + (o.a.dx || 0) - x) : o.w ?? 80, h = o.a ? Math.max(0, Y(o.a.r) + (o.a.dy || 0) - y) : o.h ?? 24;
    const pos = ' svg:x="' + pouces(x) + '" svg:y="' + pouces(y) + '"';
    const desc = '<svg:desc>tableur:' + ech(o.id) + '</svg:desc>';
    if (!o.forme) {
      const img = octetsDataUrl(o.src), ext = img && MIME_EXT[img.mime];
      if (!ext) continue;
      const chemin = 'Pictures/image' + (++compteur.image) + '.' + ext;
      fichiers.push({ chemin, octets: img.octets, type: img.mime });
      shapes += '<draw:frame draw:z-index="' + (z++) + '" draw:name="' + ech(o.titre || 'Image ' + compteur.image) + '"' + pos + ' svg:width="' + pouces(w) + '" svg:height="' + pouces(h) + '"><draw:image xlink:href="' + chemin + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' + desc + '</draw:frame>';
      continue;
    }
    const trait = o.trait === 'aucun' ? ' draw:stroke="none"' : ' draw:stroke="solid" svg:stroke-color="' + (o.trait || '#000000') + '" svg:stroke-width="' + ((+o.epaisseur || 1) * 0.0265).toFixed(4) + 'cm"';
    if (o.forme === 'ligne') {
      const [y1, y2] = o.inverse ? [y + h, y] : [y, y + h];
      shapes += '<draw:line draw:z-index="' + (z++) + '" draw:style-name="' + styleGraphique(trait) + '" svg:x1="' + pouces(x) + '" svg:y1="' + pouces(y1) + '" svg:x2="' + pouces(x + w) + '" svg:y2="' + pouces(y2) + '">' + desc + '<text:p/></draw:line>';
      continue;
    }
    const fond = !o.fond || o.fond === 'aucun' ? ' draw:fill="none"' : ' draw:fill="solid" draw:fill-color="' + o.fond + '"';
    const st = styleGraphique(fond + trait + ' draw:textarea-horizontal-align="justify" draw:textarea-vertical-align="' + ({ top: 'top', middle: 'middle', bottom: 'bottom' }[o.valign || 'middle']) + '" fo:wrap-option="wrap" draw:auto-grow-height="false" fo:padding-top="0.1cm" fo:padding-bottom="0.1cm" fo:padding-left="0.1cm" fo:padding-right="0.1cm"');
    const ts = styleTexte({ couleur: o.couleurTexte || '#000000', taille: o.taille || 15, gras: !!o.gras, italique: !!o.italique, souligne: o.souligne, police: o.police });
    const ps = styleParagraphe(o.align || 'center');
    const texte = String(o.texte || '').split('\n').map((l) => '<text:p text:style-name="' + ps + '">' + (l ? (ts ? '<text:span text:style-name="' + ts + '">' + ech(l) + '</text:span>' : ech(l)) : '') + '</text:p>').join('');
    shapes += '<draw:custom-shape draw:z-index="' + (z++) + '" draw:name="' + (o.forme === 'texte' ? 'Zone de texte' : 'Forme') + '" draw:style-name="' + st + '"' + pos + ' svg:width="' + pouces(w) + '" svg:height="' + pouces(h) + '">' + desc + texte
      + '<draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:type="' + (TYPES_ODS[o.forme] || 'rectangle') + '"/></draw:custom-shape>';
  }
  return { shapes: shapes ? '<table:shapes>' + shapes + '</table:shapes>' : '', styles, fichiers };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
const DEPUIS_CLASSE = { bar: 'colonnes', line: 'lignes', area: 'aires', circle: 'secteurs', ring: 'secteurs', scatter: 'nuage', radar: 'radar', 'filled-radar': 'radar', bubble: 'nuage', stock: 'lignes' };
const plageDe = (a) => { // « Feuille.B4:Feuille.B13 » → { feuille, r1, c1, r2, c2 }
  const t = String(a || '').trim().split(/\s+/)[0]; if (!t) return null;
  const parts = t.split(':').map((x) => { const k = x.lastIndexOf('.'); return { f: k > 0 ? x.slice(0, k).replace(/^\$/, '').replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : null, a: x.slice(k + 1).replace(/\$/g, '') }; });
  const p = parsePlage(parts.map((x) => x.a).join(':'));
  return p ? { feuille: parts[0].f, ...p } : null;
};

/** Spécification du Tableur pour un graphique de LibreOffice (Object N/content.xml) ; null si illisible. */
export function graphiqueDepuisOds(xml, nomFeuille) {
  const ch = /<chart:chart\b[^>]*>/.exec(xml);
  if (!ch) return null;
  const classe = (attr(ch[0], 'chart:class') || 'chart:bar').replace(/^chart:/, '');
  const type = DEPUIS_CLASSE[classe];
  if (!type) return null;
  const pa = /<chart:plot-area\b[^>]*>/.exec(xml);
  const stylesCh = new Map();
  for (const m of xml.matchAll(/<style:style\b[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)<\/style:style>/g)) stylesCh.set(m[1], m[2]);
  const stPlot = (pa && stylesCh.get(attr(pa[0], 'chart:style-name'))) || '';
  const g = { v: 2, type, palette: 'office' };
  if (/chart:vertical="true"/.test(stPlot) && type === 'colonnes') g.type = 'barres';
  if (classe === 'ring') g.variante = 'anneau';
  else if (classe === 'filled-radar') g.variante = 'rempli';
  else if (/chart:percentage="true"/.test(stPlot)) g.variante = 'empile100';
  else if (/chart:stacked="true"/.test(stPlot)) g.variante = 'empile';
  if (type === 'lignes') { if (/chart:interpolation="(cubic-spline|b-spline)"/.test(stPlot)) g.lisse = true; g.marqueurs = !/chart:symbol-type="none"/.test(stPlot); }
  // Plage : celle de la zone de traçage, sinon l'union des séries, des noms et des catégories
  const zones = [];
  const ajouter = (a) => { const p = plageDe(a); if (p) zones.push(p); };
  for (const s of xml.matchAll(/<chart:series\b[^>]*>/g)) { ajouter(attr(s[0], 'chart:values-cell-range-address')); ajouter(attr(s[0], 'chart:label-cell-address')); }
  for (const c of xml.matchAll(/<chart:(?:categories|domain)\b[^>]*>/g)) ajouter(attr(c[0], 'table:cell-range-address'));
  let p = pa && plageDe(attr(pa[0], 'table:cell-range-address'));
  if (zones.length) {
    const u = zones.reduce((a, b) => ({ feuille: a.feuille || b.feuille, r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) }));
    if (!p || (u.r2 - u.r1 + 1) * (u.c2 - u.c1 + 1) < (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1)) p = u;
  }
  if (!p) return null;
  const plage = colVersLettres(p.c1) + (p.r1 + 1) + ':' + colVersLettres(p.c2) + (p.r2 + 1);
  g.plage = p.feuille && p.feuille !== nomFeuille ? (/^[A-Za-z_][\w.]*$/.test(p.feuille) ? p.feuille : "'" + p.feuille.replace(/'/g, "''") + "'") + '!' + plage : plage;
  // Séries en lignes : les valeurs d'une série tiennent sur une ligne
  const s0 = /<chart:series\b[^>]*chart:values-cell-range-address="([^"]+)"/.exec(xml), v0 = s0 && plageDe(entites(s0[1]));
  if (v0 && v0.r1 === v0.r2 && v0.c2 > v0.c1) g.enLignes = true;
  const texte = (x) => [...x.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map((t) => entites(t[1].replace(/<[^>]+>/g, ''))).join(' ').trim();
  const t = /<chart:title\b[^>]*>([\s\S]*?)<\/chart:title>/.exec(xml.slice(0, pa ? pa.index : xml.length));
  if (t) g.titre = texte(t[1]);
  const lg = /<chart:legend\b[^>]*>/.exec(xml);
  g.legende = lg ? ({ end: 'droite', start: 'gauche', top: 'haut', bottom: 'bas' }[attr(lg[0], 'chart:legend-position')] || 'droite') : 'aucune';
  for (const ax of xml.matchAll(/<chart:axis\b([^>]*)>([\s\S]*?)<\/chart:axis>/g)) {
    const tt = /<chart:title\b[^>]*>([\s\S]*?)<\/chart:title>/.exec(ax[2]);
    if (tt) g[/dimension="x"/.test(ax[1]) ? 'titreX' : 'titreY'] = texte(tt[1]);
    if (/dimension="y"/.test(ax[1]) && !/<chart:grid\b[^>]*class="major"/.test(ax[2])) g.quadrillage = false;
  }
  // Couleurs des séries
  const couleurs = {};
  [...xml.matchAll(/<chart:series\b[^>]*chart:style-name="([^"]+)"/g)].forEach((m, i) => { const c = /draw:fill-color="(#[0-9a-fA-F]{6})"/.exec(stylesCh.get(m[1]) || ''); if (c && type !== 'secteurs') couleurs[i] = c[1].toLowerCase(); });
  if (Object.keys(couleurs).length) g.couleurs = couleurs;
  return normaliser(g);
}

/**
 * Objets d'une feuille lue : cadres (draw:frame, draw:custom-shape, draw:line…) trouvés dans les cellules
 * ([{ r, c, xml }]) ou dans <table:shapes> ([{ xml }], position absolue). lireFichier(chemin) → octets ou null.
 */
export function lireObjetsOds(cadres, f, nomFeuille, lireFichier, stylesGraphiques, stylesTexte) {
  const { X, Y, cellule } = geometrie(f);
  const graphiques = [], images = [];
  const enBase64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const dec = (u) => new TextDecoder('utf-8').decode(u);
  let n = 0;
  const nouvelId = (p) => p + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);
  for (const { r, c, xml } of cadres) {
    const tete = /^<draw:([a-z-]+)\b[^>]*>/.exec(xml);
    if (!tete) continue;
    const el = tete[1];
    const desc = /<svg:desc>([\s\S]*?)<\/svg:desc>/.exec(xml), id0 = desc && entites(desc[1]).startsWith('tableur:') ? entites(desc[1]).slice(8) : null;
    const base = r === undefined ? { x: 0, y: 0 } : { x: X(c), y: Y(r) };
    if (el === 'line') {
      const x1 = PX(attr(tete[0], 'svg:x1')) || 0, y1 = PX(attr(tete[0], 'svg:y1')) || 0, x2 = PX(attr(tete[0], 'svg:x2')) || 0, y2 = PX(attr(tete[0], 'svg:y2')) || 0;
      const gp = stylesGraphiques.get(attr(tete[0], 'draw:style-name')) || '';
      const o = { id: id0 || nouvelId('f'), forme: 'ligne', fond: 'aucun', trait: /draw:stroke="none"/.test(gp) ? 'aucun' : (/svg:stroke-color="(#[0-9a-fA-F]{6})"/.exec(gp) || [, '#000000'])[1].toLowerCase(), epaisseur: Math.max(0.75, Math.round((PX((/svg:stroke-width="([^"]+)"/.exec(gp) || [, '0.0265cm'])[1]) || 1) * 4) / 4) };
      const xa = base.x + Math.min(x1, x2), ya = base.y + Math.min(y1, y2);
      if ((x2 - x1) * (y2 - y1) < 0) o.inverse = true;
      Object.assign(o, { de: cellule(xa, ya), w: Math.round(Math.abs(x2 - x1)), h: Math.round(Math.abs(y2 - y1)) });
      images.push(o); continue;
    }
    const x = base.x + (PX(attr(tete[0], 'svg:x')) || 0), y = base.y + (PX(attr(tete[0], 'svg:y')) || 0);
    const w = Math.round(PX(attr(tete[0], 'svg:width')) || 120), h = Math.round(PX(attr(tete[0], 'svg:height')) || 80);
    if (el === 'frame') {
      const obj = /<draw:object\b[^>]*xlink:href="([^"]+)"/.exec(xml);
      if (obj) {
        const chemin = entites(obj[1]).replace(/^\.\//, '').replace(/\/$/, '') + '/content.xml';
        const octets = lireFichier(chemin);
        const g = octets && graphiqueDepuisOds(dec(octets), nomFeuille);
        if (g) { g.id = id0 || nouvelId('g'); Object.assign(g, { x: Math.round(x), y: Math.round(y), w: Math.max(160, w), h: Math.max(110, h) }); graphiques.push(g); }
        continue;
      }
      const img = /<draw:image\b[^>]*xlink:href="([^"]+)"/.exec(xml);
      if (img) {
        const chemin = entites(img[1]).replace(/^\.\//, ''), octets = lireFichier(chemin);
        if (!octets) continue;
        const ext = (/\.(\w+)$/.exec(chemin) || [, 'png'])[1].toLowerCase();
        const mime = attr(xml, 'draw:mime-type') || { jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }[ext] || 'image/png';
        images.push({ id: id0 || nouvelId('i'), src: 'data:' + mime + ';base64,' + enBase64(octets), titre: attr(tete[0], 'draw:name') || undefined, de: cellule(x, y), w, h });
      }
      continue;
    }
    // Formes : draw:custom-shape (et les anciennes draw:rect, draw:ellipse)
    const geo = /<draw:enhanced-geometry\b[^>]*>/.exec(xml);
    const forme = el === 'rect' ? 'rect' : el === 'ellipse' || el === 'circle' ? 'ellipse' : el === 'custom-shape' ? DEPUIS_TYPE_ODS[(geo && attr(geo[0], 'draw:type')) || 'rectangle'] : null;
    if (!forme) continue;
    const gp = stylesGraphiques.get(attr(tete[0], 'draw:style-name')) || '';
    const paras = [...xml.matchAll(/<text:p\b([^>]*)>([\s\S]*?)<\/text:p>|<text:p\b([^>]*)\/>/g)];
    const texte = paras.map((p) => entites((p[2] || '').replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<text:line-break\/>/g, '\n').replace(/<[^>]+>/g, ''))).join('\n').replace(/\n+$/, '');
    const span = /<text:span\b[^>]*text:style-name="([^"]+)"/.exec(xml), ts = span ? stylesTexte.get(span[1]) || {} : {};
    const al = paras[0] && stylesTexte.get('§' + attr(paras[0][1] || paras[0][3] || '', 'text:style-name'));
    const o = { id: id0 || nouvelId('f'), forme: forme === 'rect' && /Zone de texte/.test(attr(tete[0], 'draw:name') || '') ? 'texte' : forme,
      fond: /draw:fill="none"/.test(gp) ? 'aucun' : (/draw:fill-color="(#[0-9a-fA-F]{6})"/.exec(gp) || [, '#729fcf'])[1].toLowerCase(),
      trait: /draw:stroke="none"/.test(gp) ? 'aucun' : (/svg:stroke-color="(#[0-9a-fA-F]{6})"/.exec(gp) || [, '#3465a4'])[1].toLowerCase(),
      epaisseur: Math.max(0.75, Math.round((PX((/svg:stroke-width="([^"]+)"/.exec(gp) || [, '0.0265cm'])[1]) || 1) * 4) / 4),
      texte, couleurTexte: ts.couleur || '#000000', taille: ts.taille || 15, align: al || 'center',
      valign: { top: 'top', bottom: 'bottom' }[(/draw:textarea-vertical-align="(\w+)"/.exec(gp) || [])[1]] || 'middle', de: cellule(x, y), w, h };
    if (ts.gras) o.gras = true; if (ts.italique) o.italique = true; if (ts.souligne) o.souligne = true; if (ts.police) o.police = ts.police;
    images.push(o);
  }
  return { graphiques, images };
}
