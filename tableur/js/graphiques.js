// Graphiques du Tableur : rendu SVG (sans DOM) d'une plage de données.
//
// Spécification d'un graphique (enregistrée avec la feuille) :
//   type      colonnes | barres | lignes | aires | secteurs | anneau | nuage | radar | combine
//   variante  colonnes/barres/lignes/aires : groupe | empile | empile100
//             secteurs : plein | eclate · nuage : points | lignes | lisse · radar : lignes | rempli
//   plage, enLignes (séries en lignes plutôt qu'en colonnes), noms { i: nom }, couleurs { i: '#rrggbb' }
//   titre, titreX, titreY, legende (droite | bas | haut | gauche | aucune), etiquettes (aucune | valeur | pourcentage | categorie)
//   quadrillage, quadrillageX, yMin, yMax, formatY, marqueurs, lisse, epaisseur, palette, police, fond
//
// Les données : une matrice de valeurs déjà calculées. La première ligne donne les noms des séries si ce
// sont des textes, la première colonne les catégories (ou les X d'un nuage de points).

import { formater } from './formules.js';

export const PALETTES = {
  arcadia: ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4b5563'],
  office: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300'],
  pastel: ['#8ecae6', '#ffb4a2', '#b5e48c', '#ffd166', '#cdb4db', '#f4a261', '#a8dadc', '#e5989b', '#90be6d', '#bdb2ff'],
  vif: ['#ff006e', '#3a86ff', '#ffbe0b', '#8338ec', '#fb5607', '#06d6a0', '#118ab2', '#ef476f', '#073b4c', '#7209b7'],
  monochrome: ['#1e3a8a', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#172554', '#2563eb', '#bfdbfe', '#1e40af', '#dbeafe'],
  gris: ['#111827', '#4b5563', '#9ca3af', '#374151', '#6b7280', '#d1d5db', '#1f2937', '#e5e7eb', '#030712', '#f3f4f6'],
};
export const NOMS_PALETTES = { arcadia: 'Arcadia', office: 'Office', pastel: 'Pastel', vif: 'Vif', monochrome: 'Bleus', gris: 'Gris' };

/** Catégories et variantes proposées dans la galerie d'insertion. */
export const CATEGORIES = [
  { type: 'colonnes', nom: 'Histogramme', variantes: [['groupe', 'Groupé'], ['empile', 'Empilé'], ['empile100', 'Empilé 100 %']] },
  { type: 'barres', nom: 'Barres', variantes: [['groupe', 'Groupées'], ['empile', 'Empilées'], ['empile100', 'Empilées 100 %']] },
  { type: 'lignes', nom: 'Courbes', variantes: [['groupe', 'Courbes'], ['marqueurs', 'Avec marqueurs'], ['lisse', 'Lissées'], ['empile', 'Empilées']] },
  { type: 'aires', nom: 'Aires', variantes: [['groupe', 'Aires'], ['empile', 'Empilées'], ['empile100', 'Empilées 100 %']] },
  { type: 'secteurs', nom: 'Secteurs', variantes: [['plein', 'Secteurs'], ['eclate', 'Éclatés'], ['anneau', 'Anneau']] },
  { type: 'nuage', nom: 'Nuage de points', variantes: [['points', 'Points'], ['lignes', 'Points reliés'], ['lisse', 'Courbes lissées']] },
  { type: 'radar', nom: 'Radar', variantes: [['lignes', 'Radar'], ['rempli', 'Radar rempli']] },
  { type: 'combine', nom: 'Combiné', variantes: [['groupe', 'Histogramme + courbe']] },
];

/** Libellé lisible d'un graphique (type et variante). */
export function nomType(g) {
  const cat = CATEGORIES.find((c) => c.type === g.type || (g.type === 'anneau' && c.type === 'secteurs'));
  if (!cat) return g.type;
  const v = cat.variantes.find((x) => x[0] === (g.type === 'anneau' ? 'anneau' : g.variante));
  return cat.nom + (v && cat.variantes.length > 1 ? ' — ' + v[1].toLowerCase() : '');
}

/** Met à jour une spécification ancienne (barres = histogramme, courbes…) et complète les valeurs par défaut. */
export function normaliser(g) {
  if (!g.v) {
    if (g.type === 'barres') { g.type = 'colonnes'; g.variante = 'groupe'; }
    else if (g.type === 'barres-empilees') { g.type = 'colonnes'; g.variante = 'empile'; }
    else if (g.type === 'courbes') { g.type = 'lignes'; g.variante = 'groupe'; g.marqueurs = true; }
    g.v = 2;
  }
  if (g.type === 'anneau') { g.type = 'secteurs'; g.variante = 'anneau'; }
  if (g.type === 'lignes' && g.variante === 'marqueurs') { g.variante = 'groupe'; g.marqueurs = true; }
  if (g.type === 'lignes' && g.variante === 'lisse') { g.variante = 'groupe'; g.lisse = true; g.marqueurs = false; }
  const defaut = { colonnes: 'groupe', barres: 'groupe', lignes: 'groupe', aires: 'groupe', secteurs: 'plein', nuage: 'points', radar: 'lignes', combine: 'groupe' };
  if (!defaut[g.type]) g.type = 'colonnes';
  if (!g.variante) g.variante = defaut[g.type];
  if (g.legende === undefined || g.legende === true) g.legende = 'droite';
  if (g.legende === false) g.legende = 'aucune';
  if (g.quadrillage === undefined) g.quadrillage = true;
  if (!g.palette) g.palette = 'arcadia';
  if (!g.etiquettes) g.etiquettes = 'aucune';
  if (!g.noms) g.noms = {};
  if (!g.couleurs) g.couleurs = {};
  return g;
}

const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tronquer = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

/** Sépare en-têtes, catégories et séries numériques. */
export function preparerDonnees(m, type, enLignes = false) {
  m = (m || []).map((l) => [...l]);
  if (enLignes && m.length) m = m[0].map((_, c) => m.map((l) => l[c]));
  if (!m.length || !m[0].length) return { series: [], categories: [] };
  const estTexte = (v) => typeof v === 'string' && v !== '';
  const nb = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? +v : null);
  let enteteLigne = m[0].slice(m[0].length > 1 ? 1 : 0).some(estTexte) && m.length > 1;
  // Ligne d'en-tête faite d'années (coin texte puis entiers croissants), par exemple après « séries en lignes »
  if (!enteteLigne && m.length > 1 && m[0].length > 2 && estTexte(m[0][0])) {
    const l = m[0].slice(1);
    if (l.every((v) => typeof v === 'number' && Number.isInteger(v)) && l.every((v, i) => i === 0 || v > l[i - 1]) && m.slice(1).some((r) => estTexte(r[0]))) enteteLigne = true;
  }
  let enteteCol = m.length > (enteteLigne ? 1 : 0) && m.slice(enteteLigne ? 1 : 0).some((l) => estTexte(l[0])) && m[0].length > 1;
  // Première colonne d'entiers strictement croissants sous un en-tête (années, âges) : des catégories, pas une série
  if (!enteteCol && enteteLigne && m[0].length > 1 && type !== 'nuage') {
    const col = m.slice(1).map((l) => l[0]);
    if (col.length >= 2 && col.every((v) => typeof v === 'number' && Number.isInteger(v)) && col.every((v, i) => i === 0 || v > col[i - 1])) enteteCol = true;
  }
  const corps = m.slice(enteteLigne ? 1 : 0);
  const categories = corps.map((l, i) => (enteteCol ? String(l[0] ?? '') : String(i + 1)));
  const debut = enteteCol ? 1 : 0;
  const noms = [];
  for (let c = debut; c < m[0].length; c++) noms.push(enteteLigne ? String(m[0][c] ?? '') : 'Série ' + (c - debut + 1));
  let series = noms.map((nom, k) => ({ nom, valeurs: corps.map((l) => nb(l[debut + k])) }));
  if (type === 'nuage') {
    // Première colonne = X ; sans en-tête de colonne, la première série numérique sert de X
    let xs;
    if (enteteCol) { xs = corps.map((l) => nb(l[0])); if (xs.every((x) => x === null)) xs = corps.map((_, i) => i + 1); }
    else if (series.length >= 2) { xs = series[0].valeurs; series = series.slice(1); }
    else xs = corps.map((_, i) => i + 1);
    return { series, categories, xs, nuage: true };
  }
  return { series, categories };
}

/** Graduations « rondes » entre min et max. */
export function echelle(min, max, zero = true) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { max = min + (min === 0 ? 1 : Math.abs(min) * 0.5); min = min - (min === 0 ? 0 : Math.abs(min) * 0.5); }
  if (zero) { if (min > 0) min = 0; if (max < 0) max = 0; }
  const brut = (max - min) / 6;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= brut - 1e-12) || p * 10;
  return { min: Math.floor(min / pas + 1e-9) * pas, max: Math.ceil(max / pas - 1e-9) * pas, pas };
}

function formatAuto(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' G';
  if (a >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e4) return (v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k';
  return v.toLocaleString('fr-FR', { maximumFractionDigits: a < 1 ? 4 : 2 });
}

/** Chemin lissé (Catmull-Rom → courbes de Bézier) passant par les points. */
function cheminLisse(pts) {
  if (pts.length < 3) return 'M' + pts.map((p) => p[0] + ',' + p[1]).join(' L');
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}
const cheminDroit = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');

/**
 * Rend le graphique en SVG (chaîne).
 * options.mini : vignette (sans titre, légende ni étiquettes) pour la galerie.
 */
export function rendreGraphiqueSVG(specBrute, matrice, largeur = 420, hauteur = 260, options = {}) {
  const g = normaliser({ ...specBrute, noms: { ...(specBrute.noms || {}) }, couleurs: { ...(specBrute.couleurs || {}) } });
  const mini = !!options.mini;
  const W = Math.max(60, Math.round(largeur)), H = Math.max(40, Math.round(hauteur));
  const police = mini ? 8 : g.police || 11;
  const palette = PALETTES[g.palette] || PALETTES.arcadia;
  const couleur = (i) => g.couleurs[i] || palette[i % palette.length];
  const d = preparerDonnees(matrice, g.type, g.enLignes);
  d.series.forEach((s, i) => { if (g.noms[i]) s.nom = g.noms[i]; });
  const fmtVal = (v, cent) => (cent ? formater(v, '0%') : g.formatY ? formater(v, g.formatY) : formatAuto(v));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, system-ui, Arial, sans-serif" font-size="${police}">`;
  svg += `<rect width="${W}" height="${H}" fill="${g.fond || '#ffffff'}"/>`;
  const texte = (x, y, t, attrs = '') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${ech(t)}</text>`;
  if (!d.series.length || !d.series.some((s) => s.valeurs.some((v) => v !== null))) {
    return svg + texte(W / 2, H / 2, mini ? '—' : 'Aucune donnée numérique dans la plage', 'text-anchor="middle" fill="#6b7280"') + '</svg>';
  }
  // Zones : titre, légende, titres d'axes, tracé
  let haut = mini ? 4 : 8, bas = mini ? 4 : 6, gauche = mini ? 4 : 6, droite = mini ? 4 : 8;
  if (g.titre && !mini) { svg += texte(W / 2, 6 + police * 1.35, g.titre, `text-anchor="middle" font-size="${Math.round(police * 1.3)}" font-weight="600" fill="#111827"`); haut += police * 1.6 + 4; }
  const circulaire = g.type === 'secteurs';
  const legendeItems = circulaire ? d.categories.map((c, i) => [c, couleur(i)]) : d.series.map((s, i) => [s.nom, couleur(i)]);
  const pos = mini || g.legende === 'aucune' || (!circulaire && d.series.length < 2 && g.legende === 'droite' && !g.legendeForcee) ? 'aucune' : g.legende;
  if (pos !== 'aucune') {
    const items = legendeItems.slice(0, 24);
    if (pos === 'droite' || pos === 'gauche') {
      const lw = Math.min(W * 0.32, Math.max(...items.map(([t]) => t.length)) * police * 0.6 + 24);
      const x0 = pos === 'droite' ? W - lw - 4 : 6;
      const hTot = items.length * (police + 6);
      let y = Math.max(haut + 4, (H - hTot) / 2);
      for (const [t, c] of items) { if (y + police > H - 4) break; svg += `<rect x="${x0}" y="${y}" width="${police - 1}" height="${police - 1}" rx="2" fill="${c}"/>` + texte(x0 + police + 4, y + police - 2, tronquer(t, Math.max(4, Math.floor((lw - police - 8) / (police * 0.55)))), 'fill="#374151"'); y += police + 6; }
      if (pos === 'droite') droite += lw + 4; else gauche += lw + 4;
    } else {
      // En haut ou en bas, sur une ou plusieurs lignes centrées
      const lignes = [[]]; let largeurLigne = 0;
      for (const [t, c] of items) { const lt = police + 8 + Math.min(t.length, 24) * police * 0.56; if (largeurLigne + lt > W - 16 && lignes[lignes.length - 1].length) { lignes.push([]); largeurLigne = 0; } lignes[lignes.length - 1].push([tronquer(t, 24), c, lt]); largeurLigne += lt; }
      const hL = lignes.length * (police + 6);
      let y = pos === 'haut' ? haut + 2 : H - hL - 2;
      for (const l of lignes) {
        let x = (W - l.reduce((s, it) => s + it[2], 0)) / 2;
        for (const [t, c, lt] of l) { svg += `<rect x="${x}" y="${y}" width="${police - 1}" height="${police - 1}" rx="2" fill="${c}"/>` + texte(x + police + 3, y + police - 2, t, 'fill="#374151"'); x += lt; }
        y += police + 6;
      }
      if (pos === 'haut') haut += hL + 4; else bas += hL + 4;
    }
  }

  if (circulaire) return svg + secteurs(g, d, couleur, { x: gauche, y: haut, w: W - gauche - droite, h: H - haut - bas }, police, mini, fmtVal) + '</svg>';
  if (g.type === 'radar') return svg + radar(g, d, couleur, { x: gauche, y: haut, w: W - gauche - droite, h: H - haut - bas }, police, mini, fmtVal) + '</svg>';

  // ----- Graphiques à axes -----
  const horizontal = g.type === 'barres';
  const empile = g.variante === 'empile' || g.variante === 'empile100';
  const cent = g.variante === 'empile100';
  const nbCat = d.series[0].valeurs.length;
  // Valeurs affichées (empilées : cumuls ; 100 % : parts)
  const totaux = new Array(nbCat).fill(0).map((_, i) => d.series.reduce((s, se) => s + Math.abs(se.valeurs[i] || 0), 0));
  const bornes = (s, i, base) => { const v = s.valeurs[i]; if (v === null) return null; const val = cent ? (totaux[i] ? v / totaux[i] : 0) : v; return [base, base + val]; };
  let min = Infinity, max = -Infinity;
  const emp = g.type === 'combine' ? false : empile;
  const piles = d.series.map(() => new Array(nbCat));
  if (emp) {
    for (let i = 0; i < nbCat; i++) {
      let pos = 0, neg = 0;
      if (g.type === 'colonnes' || g.type === 'barres') {
        // Barres : les positives s'empilent au-dessus de zéro, les négatives en dessous
        d.series.forEach((s, k) => { const b = bornes(s, i, 0); if (!b) return; const v = b[1]; if (v >= 0) { piles[k][i] = [pos, pos + v]; pos += v; } else { piles[k][i] = [neg, neg + v]; neg += v; } });
        min = Math.min(min, neg); max = Math.max(max, pos);
      } else {
        // Courbes et aires : somme cumulée, comme Excel
        let cumul = 0;
        d.series.forEach((s, k) => { const b = bornes(s, i, 0); if (!b) return; piles[k][i] = [cumul, cumul + b[1]]; cumul += b[1]; min = Math.min(min, cumul, 0); max = Math.max(max, cumul); });
      }
    }
  } else {
    d.series.forEach((s, k) => s.valeurs.forEach((v, i) => { if (v === null) return; piles[k][i] = [0, v]; min = Math.min(min, v); max = Math.max(max, v); }));
  }
  const nuage = d.nuage;
  let ex = null;
  if (nuage) {
    const xs = d.xs.filter((x) => x !== null);
    ex = echelle(Math.min(...xs), Math.max(...xs), false);
    if (Math.min(...xs) >= 0 && ex.min < 0) ex.min = 0;
  }
  const lignesSeules = g.type === 'lignes' || nuage;
  const ey = echelle(g.yMin != null && g.yMin !== '' ? +g.yMin : min, g.yMax != null && g.yMax !== '' ? +g.yMax : max, !lignesSeules || min <= 0);
  if (g.yMin != null && g.yMin !== '') ey.min = +g.yMin;
  if (g.yMax != null && g.yMax !== '') ey.max = +g.yMax;
  if (cent) { ey.min = Math.min(0, ey.min); ey.max = 1; ey.pas = 0.2; }
  if (ey.max <= ey.min) ey.max = ey.min + 1;
  // Marges pour les graduations et titres d'axes
  const etiquettesVal = []; for (let v = ey.min; v <= ey.max + ey.pas * 1e-6; v += ey.pas) etiquettesVal.push(+v.toPrecision(12));
  const largeurGrad = mini ? 0 : Math.max(...etiquettesVal.map((v) => fmtVal(v, cent).length)) * police * 0.58 + 6;
  if (g.titreY && !mini) { if (horizontal) bas += police + 6; else { gauche += police + 6; svg += texte(gauche - police + 2, (haut + H - bas) / 2, g.titreY, `text-anchor="middle" fill="#374151" transform="rotate(-90 ${gauche - police + 2} ${(haut + H - bas) / 2})"`); } }
  if (g.titreX && !mini) { if (horizontal) { gauche += police + 6; svg += texte(gauche - police + 2, (haut + H - bas) / 2, g.titreX, `text-anchor="middle" fill="#374151" transform="rotate(-90 ${gauche - police + 2} ${(haut + H - bas) / 2})"`); } else bas += police + 6; }
  const largeurCat = mini ? 0 : horizontal ? Math.min(W * 0.3, Math.max(...d.categories.map((c) => Math.min(c.length, 16))) * police * 0.58 + 8) : 0;
  const zone = { x: gauche + (horizontal ? largeurCat : largeurGrad), y: haut + police * 0.5, w: 0, h: 0 };
  zone.w = Math.max(20, W - droite - zone.x - (mini ? 0 : 4));
  zone.h = Math.max(20, H - bas - zone.y - (mini ? 2 : police + 6));
  if (g.titreX && !mini && !horizontal) svg += texte(zone.x + zone.w / 2, H - bas + police + 2, g.titreX, 'text-anchor="middle" fill="#374151"');
  if (g.titreY && !mini && horizontal) svg += texte(zone.x + zone.w / 2, H - bas + police + 2, g.titreY, 'text-anchor="middle" fill="#374151"');
  // Conversions valeur → pixel
  const pv = (v) => (horizontal ? zone.x + ((v - ey.min) / (ey.max - ey.min)) * zone.w : zone.y + zone.h - ((v - ey.min) / (ey.max - ey.min)) * zone.h);
  const pc = (i) => (horizontal ? zone.y + ((i + 0.5) / nbCat) * zone.h : zone.x + ((i + 0.5) / nbCat) * zone.w);
  const px = (x) => zone.x + ((x - ex.min) / (ex.max - ex.min)) * zone.w;
  // Quadrillage et graduations de valeurs
  const grad = mini ? 'none' : '#6b7280';
  for (const v of etiquettesVal) {
    const p = pv(v);
    const trait = Math.abs(v) < 1e-12 ? '#9ca3af' : '#e5e7eb';
    if (g.quadrillage || Math.abs(v) < 1e-12) svg += horizontal ? `<line x1="${p}" y1="${zone.y}" x2="${p}" y2="${zone.y + zone.h}" stroke="${trait}"/>` : `<line x1="${zone.x}" y1="${p}" x2="${zone.x + zone.w}" y2="${p}" stroke="${trait}"/>`;
    if (!mini) svg += horizontal ? texte(p, zone.y + zone.h + police + 3, fmtVal(v, cent), `text-anchor="middle" fill="${grad}"`) : texte(zone.x - 4, p + police * 0.35, fmtVal(v, cent), `text-anchor="end" fill="${grad}"`);
  }
  // Graduations de catégories / X
  if (nuage) {
    for (let v = ex.min; v <= ex.max + ex.pas * 1e-6; v += ex.pas) {
      const x = px(v);
      if (g.quadrillageX) svg += `<line x1="${x}" y1="${zone.y}" x2="${x}" y2="${zone.y + zone.h}" stroke="#f3f4f6"/>`;
      if (!mini) svg += texte(x, zone.y + zone.h + police + 3, formatAuto(+v.toPrecision(12)), `text-anchor="middle" fill="${grad}"`);
    }
  } else if (!mini) {
    const place = horizontal ? zone.h / nbCat / (police + 2) : zone.w / nbCat / (police * 0.6 * Math.min(10, Math.max(...d.categories.map((c) => c.length))) + 4);
    const pas = Math.max(1, Math.ceil(1 / Math.max(place, 1e-9)));
    d.categories.forEach((c, i) => {
      if (i % pas) return;
      if (g.quadrillageX) svg += horizontal ? `<line x1="${zone.x}" y1="${pc(i)}" x2="${zone.x + zone.w}" y2="${pc(i)}" stroke="#f3f4f6"/>` : `<line x1="${pc(i)}" y1="${zone.y}" x2="${pc(i)}" y2="${zone.y + zone.h}" stroke="#f3f4f6"/>`;
      svg += horizontal ? texte(zone.x - 4, pc(i) + police * 0.35, tronquer(c, 16), `text-anchor="end" fill="${grad}"`) : texte(pc(i), zone.y + zone.h + police + 3, tronquer(c, 12), `text-anchor="middle" fill="${grad}"`);
    });
  }
  svg += horizontal ? `<line x1="${zone.x}" y1="${zone.y}" x2="${zone.x}" y2="${zone.y + zone.h}" stroke="#9ca3af"/>` : `<line x1="${zone.x}" y1="${zone.y + zone.h}" x2="${zone.x + zone.w}" y2="${zone.y + zone.h}" stroke="#9ca3af"/>`;
  const etiquette = (x, y, v, i, k, attrs) => {
    if (mini || g.etiquettes === 'aucune') return '';
    const t = g.etiquettes === 'pourcentage' ? formater(totaux[i] ? Math.abs(v) / totaux[i] : 0, '0%') : g.etiquettes === 'categorie' ? d.categories[i] : fmtVal(v, false);
    return texte(x, y, t, `font-size="${police - 1}" fill="#111827" ${attrs || 'text-anchor="middle"'}`);
  };
  const titre = (s, i, v) => `<title>${ech(s.nom)} — ${ech(nuage ? formatAuto(d.xs[i]) : d.categories[i])} : ${ech(fmtVal(v, false))}</title>`;

  // Séries en barres (histogramme, barres, combiné : la première série)
  const enBarres = (k) => g.type === 'colonnes' || g.type === 'barres' || (g.type === 'combine' && k === 0);
  const seriesBarres = d.series.map((_, k) => k).filter(enBarres);
  if (seriesBarres.length) {
    const groupe = (horizontal ? zone.h : zone.w) / nbCat * (mini ? 0.8 : 0.72);
    const n = emp ? 1 : seriesBarres.length;
    const lb = groupe / n;
    seriesBarres.forEach((k, rang) => {
      const s = d.series[k];
      s.valeurs.forEach((v, i) => {
        const b = piles[k][i]; if (!b) return;
        const a1 = pv(Math.min(b[0], b[1])), a2 = pv(Math.max(b[0], b[1]));
        const o = pc(i) - groupe / 2 + (emp ? 0 : rang * lb);
        const ep = Math.max(1, lb - (n > 1 ? 1 : 0));
        if (horizontal) {
          svg += `<rect x="${Math.min(a1, a2).toFixed(1)}" y="${o.toFixed(1)}" width="${Math.max(0.5, Math.abs(a2 - a1)).toFixed(1)}" height="${ep.toFixed(1)}" fill="${couleur(k)}" rx="1">${titre(s, i, v)}</rect>`;
          svg += etiquette(emp ? (a1 + a2) / 2 : Math.max(a1, a2) + 3, o + ep / 2 + police * 0.35, v, i, k, emp ? 'text-anchor="middle"' : 'text-anchor="start"');
        } else {
          svg += `<rect x="${o.toFixed(1)}" y="${Math.min(a1, a2).toFixed(1)}" width="${ep.toFixed(1)}" height="${Math.max(0.5, Math.abs(a2 - a1)).toFixed(1)}" fill="${couleur(k)}" rx="1">${titre(s, i, v)}</rect>`;
          svg += etiquette(o + ep / 2, emp ? (a1 + a2) / 2 + police * 0.35 : Math.min(a1, a2) - 3, v, i, k);
        }
      });
    });
  }
  // Séries en courbes / aires / nuage
  const lisse = g.lisse || (nuage && g.variante === 'lisse');
  const ep = g.epaisseur || (mini ? 1.5 : 2);
  const aires = g.type === 'aires';
  const ordre = d.series.map((_, k) => k).filter((k) => !enBarres(k));
  // Aires : les dernières séries d'abord pour que les premières restent devant (non empilé)
  if (aires && !emp) ordre.reverse();
  for (const k of ordre) {
    const s = d.series[k];
    const pts = [];
    s.valeurs.forEach((v, i) => {
      if (v === null) return;
      if (nuage && d.xs[i] === null) return;
      const b = piles[k][i]; if (!b) return;
      pts.push([nuage ? px(d.xs[i]) : pc(i), pv(b[1]), v, i, b[0]]);
    });
    if (!pts.length) continue;
    if (nuage) pts.sort((a, b) => a[0] - b[0]);
    const c = couleur(k);
    if (aires) {
      const haut2 = pts.map((p) => [p[0], p[1]]);
      const bas2 = pts.map((p) => [p[0], pv(p[4])]).reverse();
      svg += `<path d="${cheminDroit(haut2)} L${bas2.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')} Z" fill="${c}" fill-opacity="${emp ? 0.85 : 0.45}" stroke="${c}" stroke-width="1"/>`;
    } else if (!nuage || g.variante !== 'points') {
      svg += `<path d="${lisse ? cheminLisse(pts) : cheminDroit(pts)}" fill="none" stroke="${c}" stroke-width="${ep}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    const marqueurs = nuage || g.marqueurs || (g.type === 'combine' && !mini);
    for (const p of pts) {
      if (marqueurs) svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${nuage ? (mini ? 2 : 3.5) : mini ? 1.5 : 3}" fill="${nuage ? c : '#fff'}" stroke="${c}" stroke-width="${nuage ? 0 : 1.5}">${titre(s, p[3], p[2])}</circle>`;
      svg += etiquette(p[0], p[1] - 6, p[2], p[3], k);
    }
  }
  return svg + '</svg>';
}

function secteurs(g, d, couleur, zone, police, mini, fmtVal) {
  const s = d.series[0];
  const total = s.valeurs.reduce((a, v) => a + Math.max(0, v || 0), 0);
  let out = '';
  const cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2;
  const R = Math.max(8, Math.min(zone.w, zone.h) / 2 - (mini ? 2 : 6));
  const r0 = g.variante === 'anneau' ? R * 0.55 : 0;
  const eclat = g.variante === 'eclate' ? R * 0.08 : 0;
  let a = -Math.PI / 2;
  s.valeurs.forEach((v, i) => {
    const part = total ? Math.max(0, v || 0) / total : 0;
    if (!part) return;
    const a2 = a + part * 2 * Math.PI, am = (a + a2) / 2;
    const dx = eclat * Math.cos(am), dy = eclat * Math.sin(am);
    const p = (ang, r) => `${(cx + dx + r * Math.cos(ang)).toFixed(2)},${(cy + dy + r * Math.sin(ang)).toFixed(2)}`;
    const grand = part > 0.5 ? 1 : 0;
    const chemin = part >= 0.9999
      ? `M ${p(a, R)} A ${R} ${R} 0 1 1 ${p(a + Math.PI, R)} A ${R} ${R} 0 1 1 ${p(a, R)}` + (r0 ? ` M ${p(a, r0)} A ${r0} ${r0} 0 1 0 ${p(a + Math.PI, r0)} A ${r0} ${r0} 0 1 0 ${p(a, r0)}` : '') + ' Z'
      : `M ${p(a, r0)} L ${p(a, R)} A ${R} ${R} 0 ${grand} 1 ${p(a2, R)} L ${p(a2, r0)}` + (r0 ? ` A ${r0} ${r0} 0 ${grand} 0 ${p(a, r0)}` : '') + ' Z';
    out += `<path d="${chemin}" fill="${couleur(i)}" stroke="#fff" stroke-width="${mini ? 0.8 : 1.5}" fill-rule="evenodd"><title>${ech(d.categories[i])} : ${ech(fmtVal(v, false))} (${(part * 100).toFixed(1)} %)</title></path>`;
    if (!mini && part > 0.035) {
      const mode = g.etiquettes === 'aucune' ? 'pourcentage' : g.etiquettes;
      const t = mode === 'valeur' ? fmtVal(v, false) : mode === 'categorie' ? d.categories[i] : (part * 100).toFixed(part < 0.1 ? 1 : 0).replace('.', ',') + ' %';
      const rl = r0 ? (R + r0) / 2 : R * 0.64;
      out += `<text x="${(cx + dx + rl * Math.cos(am)).toFixed(1)}" y="${(cy + dy + rl * Math.sin(am) + police * 0.35).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="${police - 1}" font-weight="600">${ech(tronquer(t, 14))}</text>`;
    }
    a = a2;
  });
  return out;
}

function radar(g, d, couleur, zone, police, mini, fmtVal) {
  const n = d.categories.length;
  if (n < 3) return `<text x="${zone.x + zone.w / 2}" y="${zone.y + zone.h / 2}" text-anchor="middle" fill="#6b7280">Il faut au moins 3 catégories</text>`;
  const cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2 + (mini ? 0 : police * 0.3);
  const R = Math.max(10, Math.min(zone.w, zone.h) / 2 - (mini ? 2 : police * 2));
  let max = 0; for (const s of d.series) for (const v of s.valeurs) if (v !== null) max = Math.max(max, v);
  const ey = echelle(0, max || 1);
  const ang = (i) => -Math.PI / 2 + (i / n) * 2 * Math.PI;
  let out = '';
  for (let v = ey.pas; v <= ey.max + 1e-9; v += ey.pas) {
    const r = (v / ey.max) * R;
    out += `<polygon points="${d.categories.map((_, i) => (cx + r * Math.cos(ang(i))).toFixed(1) + ',' + (cy + r * Math.sin(ang(i))).toFixed(1)).join(' ')}" fill="none" stroke="#e5e7eb"/>`;
    if (!mini) out += `<text x="${cx + 3}" y="${(cy - r + police * 0.35).toFixed(1)}" fill="#9ca3af" font-size="${police - 2}">${ech(fmtVal(+v.toPrecision(12), false))}</text>`;
  }
  d.categories.forEach((c, i) => {
    out += `<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(ang(i))).toFixed(1)}" y2="${(cy + R * Math.sin(ang(i))).toFixed(1)}" stroke="#e5e7eb"/>`;
    if (!mini) { const x = cx + (R + police) * Math.cos(ang(i)), y = cy + (R + police) * Math.sin(ang(i)); out += `<text x="${x.toFixed(1)}" y="${(y + police * 0.35).toFixed(1)}" text-anchor="${Math.abs(Math.cos(ang(i))) < 0.2 ? 'middle' : Math.cos(ang(i)) > 0 ? 'start' : 'end'}" fill="#6b7280">${ech(tronquer(c, 14))}</text>`; }
  });
  d.series.forEach((s, k) => {
    const pts = s.valeurs.map((v, i) => { const r = ((v || 0) / ey.max) * R; return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]; });
    out += `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${couleur(k)}" fill-opacity="${g.variante === 'rempli' ? 0.35 : 0}" stroke="${couleur(k)}" stroke-width="${mini ? 1.2 : g.epaisseur || 2}"><title>${ech(s.nom)}</title></polygon>`;
    if (g.marqueurs && !mini) for (const p of pts) out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${couleur(k)}"/>`;
  });
  return out;
}
