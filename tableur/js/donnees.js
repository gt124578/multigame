// Outils de données du Tableur, sans DOM (testés par tools/test-tableur.mjs) :
// tri, filtre automatique, rechercher / remplacer, mise en forme conditionnelle, valeur cible, somme automatique.

import { ErreurFormule, decalerFormule, formater, parsePlage, adresse, colVersLettres, dateVersSerie } from './formules.js';

// ---------------------------------------------------------------------------
// Tri
// ---------------------------------------------------------------------------

// Ordre d'Excel : nombres, puis textes (sans tenir compte de la casse), puis booléens, puis erreurs ;
// les cellules vides restent toujours à la fin, en ordre croissant comme décroissant.
const rang = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
const collator = typeof Intl !== 'undefined' ? new Intl.Collator('fr', { sensitivity: 'base', numeric: false }) : null;
export function comparerTri(a, b, desc = false) {
  const va = a === null || a === undefined || a === '', vb = b === null || b === undefined || b === '';
  if (va || vb) return va === vb ? 0 : va ? 1 : -1;
  const ra = rang(a), rb = rang(b);
  let d;
  if (ra !== rb) d = ra - rb;
  else if (ra === 0) d = a - b;
  else if (ra === 1) d = collator ? collator.compare(a, b) : a.toLowerCase().localeCompare(b.toLowerCase());
  else if (ra === 2) d = (a ? 1 : 0) - (b ? 1 : 0);
  else d = 0;
  return desc ? -d : d;
}

/**
 * Trie les lignes d'une plage. cles : [{ c (colonne absolue), desc }]. entete : la première ligne ne bouge pas.
 * Les formules déplacées gardent leurs références relatives (comme Excel). Renvoie le nombre de lignes triées.
 */
export function trierPlage(classeur, fi, plage, cles, { entete = false } = {}) {
  const f = classeur.feuilles[fi];
  const r1 = plage.r1 + (entete ? 1 : 0), { r2, c1, c2 } = plage;
  if (r2 <= r1) return 0;
  if (f.fusions.some((m) => m.r2 >= r1 && m.r1 <= r2 && m.c2 >= c1 && m.c1 <= c2 && (m.r1 !== m.r2))) throw new Error('Impossible de trier des cellules fusionnées sur plusieurs lignes');
  const lignes = [];
  for (let r = r1; r <= r2; r++) {
    const vals = cles.map((k) => { const v = classeur.valeur(fi, r, k.c); return v instanceof ErreurFormule ? { erreur: v.code } : v; });
    const cells = [];
    for (let c = c1; c <= c2; c++) { const cel = f.get(r, c); cells.push(cel ? { ...cel } : null); }
    lignes.push({ r, vals, cells, h: f.hauteurs[r] });
  }
  const cmp = (a, b) => {
    for (let i = 0; i < cles.length; i++) {
      const x = a.vals[i], y = b.vals[i];
      const d = comparerTri(x && x.erreur ? null : x, y && y.erreur ? null : y, cles[i].desc);
      if (d) return d;
    }
    return a.r - b.r; // tri stable
  };
  lignes.sort(cmp);
  lignes.forEach((l, i) => {
    const r = r1 + i, dr = r - l.r;
    for (let c = c1; c <= c2; c++) {
      const cel = l.cells[c - c1];
      if (cel && cel.f != null && dr) { cel.f = decalerFormule(cel.f, dr, 0); delete cel.cache; }
      f.set(r, c, cel);
    }
  });
  // Les hauteurs suivent les lignes seulement si la plage couvre toute la largeur utilisée
  if (c1 === 0 && c2 >= f.zone.c2) lignes.forEach((l, i) => { const r = r1 + i; if (l.h === undefined) delete f.hauteurs[r]; else f.hauteurs[r] = l.h; });
  f.recalculerZone();
  classeur.modifie();
  return lignes.length;
}

/** Étend une cellule à la zone de données contiguë autour d'elle (comme Ctrl+A / le tri d'Excel). */
export function zoneContigue(f, r, c) {
  const plein = (rr, cc) => { const cel = f.get(rr, cc); return !!cel && (cel.f != null || (cel.v !== null && cel.v !== undefined && cel.v !== '')); };
  let r1 = r, r2 = r, c1 = c, c2 = c, change = true;
  while (change) {
    change = false;
    const ligneA = (rr) => { for (let cc = Math.max(0, c1 - 1); cc <= c2 + 1; cc++) if (plein(rr, cc)) return true; return false; };
    const colA = (cc) => { for (let rr = Math.max(0, r1 - 1); rr <= r2 + 1; rr++) if (plein(rr, cc)) return true; return false; };
    if (r1 > 0 && ligneA(r1 - 1)) { r1--; change = true; }
    if (ligneA(r2 + 1)) { r2++; change = true; }
    if (c1 > 0 && colA(c1 - 1)) { c1--; change = true; }
    if (colA(c2 + 1)) { c2++; change = true; }
    if (r2 - r1 > 100000) break;
  }
  return { r1, c1, r2, c2 };
}

/** La première ligne ressemble-t-elle à des en-têtes (textes au-dessus de nombres) ? */
export function aUnEntete(classeur, fi, p) {
  if (p.r2 <= p.r1) return false;
  let textes = 0, vides = 0, texteSurNombre = false, nombreEnTete = false;
  for (let c = p.c1; c <= p.c2; c++) {
    const a = classeur.valeur(fi, p.r1, c), b = classeur.valeur(fi, p.r1 + 1, c);
    if (typeof a === 'number' || typeof a === 'boolean') nombreEnTete = true;
    else if (typeof a === 'string' && a !== '') { textes++; if (typeof b === 'number') texteSurNombre = true; }
    else vides++;
  }
  return !nombreEnTete && textes > 0 && (texteSurNombre || textes + vides === p.c2 - p.c1 + 1 && vides === 0);
}

// ---------------------------------------------------------------------------
// Filtre automatique
// ---------------------------------------------------------------------------

/** Texte affiché d'une cellule, clé des listes de filtre (« » pour une cellule vide). */
export function texteFiltre(classeur, fi, r, c) {
  const cel = classeur.feuilles[fi].get(r, c);
  if (!cel) return '';
  const v = classeur.valeur(fi, r, c);
  if (v === null || v === undefined) return '';
  return v instanceof ErreurFormule ? v.code : formater(v, cel.z);
}

/** Valeurs distinctes d'une colonne du filtre, triées, avec leur nombre. */
export function valeursFiltre(classeur, fi, filtre, c) {
  const vus = new Map();
  for (let r = filtre.r1 + 1; r <= filtre.r2; r++) {
    // Seules les lignes que les AUTRES colonnes laissent passer (comme Excel)
    if (!ligneVisible(classeur, fi, filtre, r, c)) continue;
    const t = texteFiltre(classeur, fi, r, c);
    if (!vus.has(t)) vus.set(t, { texte: t, valeur: classeur.valeur(fi, r, c), n: 0 });
    vus.get(t).n++;
  }
  return [...vus.values()].sort((a, b) => comparerTri(a.texte === '' ? null : a.valeur instanceof ErreurFormule ? a.texte : a.valeur, b.texte === '' ? null : b.valeur instanceof ErreurFormule ? b.texte : b.valeur));
}

function testerCondition(cond, v, t) {
  const x = typeof cond.valeur === 'string' && cond.valeur.trim() !== '' && !isNaN(+cond.valeur.replace(',', '.')) ? +cond.valeur.replace(',', '.') : cond.valeur;
  const tl = t.toLowerCase(), xl = String(x ?? '').toLowerCase();
  switch (cond.op) {
    case '=': return typeof x === 'number' ? v === x : tl === xl;
    case '<>': return typeof x === 'number' ? v !== x : tl !== xl;
    case '>': return typeof v === 'number' && v > x;
    case '>=': return typeof v === 'number' && v >= x;
    case '<': return typeof v === 'number' && v < x;
    case '<=': return typeof v === 'number' && v <= x;
    case 'contient': return tl.includes(xl);
    case 'necontientpas': return !tl.includes(xl);
    case 'commence': return tl.startsWith(xl);
    case 'termine': return tl.endsWith(xl);
    default: return true;
  }
}

function ligneVisible(classeur, fi, filtre, r, sauf = -1) {
  for (const [k, crit] of Object.entries(filtre.criteres || {})) {
    const c = +k;
    if (c === sauf || !crit) continue;
    const t = texteFiltre(classeur, fi, r, c);
    if (crit.visibles && !crit.visibles.includes(t)) return false;
    if (crit.condition) { const v = classeur.valeur(fi, r, c); if (!testerCondition(crit.condition, v, t)) return false; }
  }
  return true;
}

/** Recalcule les lignes masquées par le filtre de la feuille : f.filtrees (Set de lignes). */
export function appliquerFiltre(classeur, fi) {
  const f = classeur.feuilles[fi];
  f.filtrees = new Set();
  const flt = f.filtre;
  if (!flt) return f.filtrees;
  for (let r = flt.r1 + 1; r <= flt.r2; r++) if (!ligneVisible(classeur, fi, flt, r)) f.filtrees.add(r);
  return f.filtrees;
}

/** Plage du filtre : la zone contiguë autour de la sélection (ou la sélection si elle couvre plusieurs lignes). */
export function plageFiltre(f, sel) {
  if (sel.r2 > sel.r1) return { ...sel, r2: Math.min(sel.r2, Math.max(f.zone.r2, sel.r1 + 1)), c2: Math.min(sel.c2, Math.max(f.zone.c2, sel.c1)) };
  return zoneContigue(f, sel.r1, sel.c1);
}

// ---------------------------------------------------------------------------
// Rechercher / remplacer
// ---------------------------------------------------------------------------

function motif(texte, { casse = false, entier = false } = {}) {
  // Jokers d'Excel : * (n'importe quoi), ? (un caractère), ~* ~? (le caractère lui-même)
  let re = '';
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (ch === '~' && i + 1 < texte.length && '*?~'.includes(texte[i + 1])) { re += '\\' + texte[++i]; continue; }
    if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(entier ? '^' + re + '$' : re, casse ? 'g' : 'gi');
}

/**
 * Cherche un texte. options : { casse, entier, dans: 'valeurs'|'formules', feuilles: 'active'|'toutes', fi, plage }.
 * Renvoie [{ fi, r, c, texte }] dans l'ordre ligne par ligne.
 */
export function rechercher(classeur, texte, options = {}) {
  if (!texte) return [];
  const re = motif(texte, options);
  const out = [];
  const indices = options.feuilles === 'toutes' ? classeur.feuilles.map((_, i) => i) : [options.fi ?? classeur.active];
  for (const fi of indices) {
    const f = classeur.feuilles[fi];
    const trouves = [];
    f.chaque((r, c, cel) => {
      const p = options.plage;
      if (p && fi === (options.fi ?? classeur.active) && (r < p.r1 || r > p.r2 || c < p.c1 || c > p.c2)) return;
      const t = options.dans === 'formules' ? classeur.saisie(fi, r, c) : texteFiltre(classeur, fi, r, c);
      re.lastIndex = 0;
      if (t !== '' && re.test(t)) trouves.push({ fi, r, c, texte: t });
    });
    trouves.sort((a, b) => a.r - b.r || a.c - b.c);
    out.push(...trouves);
  }
  return out;
}

/** Remplace dans la saisie des cellules trouvées (formules comprises). Renvoie le nombre de cellules modifiées. */
export function remplacer(classeur, texte, par, options = {}, cibles = null) {
  const re = motif(texte, options);
  let n = 0;
  for (const t of cibles || rechercher(classeur, texte, { ...options, dans: 'formules' })) {
    const avant = classeur.saisie(t.fi, t.r, t.c);
    re.lastIndex = 0;
    if (!re.test(avant)) continue;
    re.lastIndex = 0;
    const apres = options.entier ? par : avant.replace(re, () => par);
    if (apres === avant) continue;
    const cel = classeur.feuilles[t.fi].get(t.r, t.c);
    if (cel) delete cel.cache;
    classeur.saisir(t.fi, t.r, t.c, apres);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Mise en forme conditionnelle
// ---------------------------------------------------------------------------
//
// Règle : { id, plage: 'B2:B20', type, ..., style: { fond, couleur, gras, italique } }
//   valeur  : op ('>', '<', '>=', '<=', '=', '<>', 'entre', 'hors'), v1, v2 (nombre, texte ou =formule)
//   texte   : op ('contient', 'necontientpas', 'commence', 'termine'), texte
//   formule : formule (=…, références relatives à la première cellule de la plage)
//   doublons / uniques
//   top     : n, bas (les plus petites), pct (n est un pourcentage)
//   moyenne : dessous (au-dessous de la moyenne)
//   vides / nonvides
//   echelle : couleurs ([min, max] ou [min, milieu, max])
//   barres  : couleur
// La première règle de la liste l'emporte (comme l'ordre de priorité d'Excel).

export const TYPES_MFC = [
  ['valeur', 'Valeur de la cellule'], ['texte', 'Texte qui contient'], ['top', 'Premiers / derniers'], ['moyenne', 'Au-dessus / au-dessous de la moyenne'],
  ['doublons', 'Valeurs en double'], ['uniques', 'Valeurs uniques'], ['vides', 'Cellules vides'], ['formule', 'Formule personnalisée'],
  ['echelle', 'Échelle de couleurs'], ['barres', 'Barres de données'], ['icones', 'Jeu d\'icônes'],
];

// Jeux d'icônes (noms d'Excel), de la valeur la plus basse à la plus haute
const R = '#e8463a', J = '#f5b800', V = '#2e9e4f', G = '#8c8c8c';
export const JEUX_ICONES = {
  '3Arrows': { nom: '3 flèches', icones: [['fleche', R, 180], ['fleche', J, 90], ['fleche', V, 0]] },
  '3ArrowsGray': { nom: '3 flèches grises', icones: [['fleche', G, 180], ['fleche', G, 90], ['fleche', G, 0]] },
  '3TrafficLights1': { nom: '3 feux', icones: [['rond', R], ['rond', J], ['rond', V]] },
  '3Flags': { nom: '3 drapeaux', icones: [['drapeau', R], ['drapeau', J], ['drapeau', V]] },
  '3Symbols': { nom: '3 symboles', icones: [['croix', R], ['exclam', J], ['coche', V]] },
  '3Stars': { nom: '3 étoiles', icones: [['etoile', '#d9d9d9'], ['demi', J], ['etoile', J]] },
  '4Arrows': { nom: '4 flèches', icones: [['fleche', R, 180], ['fleche', J, 135], ['fleche', J, 45], ['fleche', V, 0]] },
  '5Arrows': { nom: '5 flèches', icones: [['fleche', R, 180], ['fleche', J, 135], ['fleche', J, 90], ['fleche', J, 45], ['fleche', V, 0]] },
  '4Rating': { nom: '4 barres', icones: [['barres', '#1f6fb5', 1], ['barres', '#1f6fb5', 2], ['barres', '#1f6fb5', 3], ['barres', '#1f6fb5', 4]] },
  '5Quarters': { nom: '5 quartiers', icones: [['quart', '#555', 0], ['quart', '#555', 1], ['quart', '#555', 2], ['quart', '#555', 3], ['quart', '#555', 4]] },
};
/** Petite icône SVG (14 px) d'un jeu. */
export function iconeSVG(jeu, i) {
  const d = (JEUX_ICONES[jeu] || JEUX_ICONES['3Arrows']).icones[i];
  if (!d) return '';
  const [forme, c, x] = d;
  let corps = '';
  if (forme === 'fleche') corps = `<g transform="rotate(${x} 7 7)"><path d="M7 1.5 L12 7 H8.8 V12.5 H5.2 V7 H2 Z" fill="${c}"/></g>`;
  else if (forme === 'rond') corps = `<circle cx="7" cy="7" r="5.5" fill="${c}" stroke="#0003"/>`;
  else if (forme === 'drapeau') corps = `<path d="M3 1.5 V13" stroke="#555" stroke-width="1.4"/><path d="M3.7 2 H12 L10 5 L12 8 H3.7 Z" fill="${c}"/>`;
  else if (forme === 'croix') corps = `<circle cx="7" cy="7" r="6" fill="${c}"/><path d="M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5" stroke="#fff" stroke-width="1.8"/>`;
  else if (forme === 'exclam') corps = `<path d="M7 1 L13 12.5 H1 Z" fill="${c}"/><path d="M7 5 V9" stroke="#fff" stroke-width="1.6"/><circle cx="7" cy="10.7" r=".9" fill="#fff"/>`;
  else if (forme === 'coche') corps = `<circle cx="7" cy="7" r="6" fill="${c}"/><path d="M4 7.2 L6.2 9.4 L10.2 4.8" stroke="#fff" stroke-width="1.8" fill="none"/>`;
  else if (forme === 'etoile' || forme === 'demi') { const p = 'M7 1 L8.8 5 L13 5.3 L9.8 8.1 L10.8 12.5 L7 10.2 L3.2 12.5 L4.2 8.1 L1 5.3 L5.2 5 Z'; corps = forme === 'demi' ? `<path d="${p}" fill="#d9d9d9"/><clipPath id="dm"><rect width="7" height="14"/></clipPath><path d="${p}" fill="${c}" clip-path="url(#dm)"/>` : `<path d="${p}" fill="${c}"/>`; }
  else if (forme === 'barres') for (let k = 0; k < 4; k++) corps += `<rect x="${1 + k * 3.2}" y="${10 - k * 2.5}" width="2.4" height="${3 + k * 2.5}" fill="${k < x ? c : '#d9d9d9'}"/>`;
  else if (forme === 'quart') corps = `<circle cx="7" cy="7" r="5.5" fill="#fff" stroke="${c}"/>` + (x === 4 ? `<circle cx="7" cy="7" r="5.5" fill="${c}"/>` : x ? `<path d="M7 7 V1.5 A5.5 5.5 0 ${x > 2 ? 1 : 0} 1 ${(7 + 5.5 * Math.sin(x * Math.PI / 2)).toFixed(2)} ${(7 - 5.5 * Math.cos(x * Math.PI / 2)).toFixed(2)} Z" fill="${c}"/>` : '');
  return `<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">${corps}</svg>`;
}

export const STYLES_MFC = [
  ['Rouge clair, texte rouge foncé', { fond: '#ffc7ce', couleur: '#9c0006' }],
  ['Jaune, texte jaune foncé', { fond: '#ffeb9c', couleur: '#9c5700' }],
  ['Vert, texte vert foncé', { fond: '#c6efce', couleur: '#006100' }],
  ['Remplissage rouge clair', { fond: '#ffc7ce' }],
  ['Texte rouge', { couleur: '#9c0006' }],
  ['Bleu, texte gras', { fond: '#dbeafe', couleur: '#1e3a8a', gras: true }],
];

function hexVersRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function melanger(a, b, t) { const x = hexVersRgb(a), y = hexVersRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

function nombreOuTexte(classeur, fi, x, r0, c0, r, c) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (s.startsWith('=')) { const v = classeur.evaluateur.evaluerFormule(decalerFormule(s, r - r0, c - c0).slice(1), fi, r, c); return v instanceof ErreurFormule ? null : Array.isArray(v) ? v[0][0] : v; }
  const n = +s.replace(',', '.');
  return s !== '' && !isNaN(n) ? n : s;
}

// Statistiques d'une règle sur sa plage (seuils du top, moyenne, min / max, doublons) : calculées une fois par version du classeur.
function statsRegle(classeur, fi, regle, p) {
  const vals = [], compte = new Map();
  for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) {
    const v = classeur.valeur(fi, r, c);
    if (typeof v === 'number') vals.push(v);
    if (v !== null && v !== undefined && v !== '' && !(v instanceof ErreurFormule)) { const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; compte.set(k, (compte.get(k) || 0) + 1); }
  }
  const tri = [...vals].sort((a, b) => a - b);
  const st = { compte, min: tri[0], max: tri[tri.length - 1], moyenne: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
  if (regle.type === 'top' && tri.length) {
    const n = Math.max(1, regle.pct ? Math.floor(tri.length * (+regle.n || 10) / 100) : (+regle.n || 10));
    st.seuil = regle.bas ? tri[Math.min(n, tri.length) - 1] : tri[Math.max(0, tri.length - n)];
  }
  if (regle.type === 'echelle' && tri.length) st.milieu = tri.length % 2 ? tri[(tri.length - 1) / 2] : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2;
  if (regle.type === 'barres') { st.bas = Math.min(0, st.min); st.haut = Math.max(0, st.max); }
  return st;
}

/** Plages d'une règle (« A1:B5 C2:C9 » ou « A1:B5;C2:C9 »). */
export function plagesMfc(regle) {
  return String(regle.plage || '').split(/[\s;]+/).filter(Boolean).map((t) => parsePlage(t.replace(/\$/g, ''))).filter(Boolean);
}

/** Style conditionnel d'une cellule : { fond, couleur, gras, italique, barre: { pct, couleur, negatif } } ou null. */
export function styleConditionnel(classeur, fi, r, c) {
  const f = classeur.feuilles[fi];
  if (!f.mfc || !f.mfc.length) return null;
  if (!f._mfcCache || f._mfcCache.version !== classeur.version) f._mfcCache = { version: classeur.version, stats: new Map(), res: new Map() };
  const cache = f._mfcCache;
  const k = r + ',' + c;
  if (cache.res.has(k)) return cache.res.get(k);
  let out = null;
  const poser = (s) => { out = out || {}; for (const [p, v] of Object.entries(s || {})) if (v !== undefined && v !== '' && v !== false && out[p] === undefined) out[p] = v; };
  for (const regle of f.mfc) {
    const p = plagesMfc(regle).find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
    if (!p) continue;
    const v = classeur.valeur(fi, r, c);
    if (v instanceof ErreurFormule && regle.type !== 'formule') continue;
    const vide = v === null || v === undefined || v === '';
    const cleStats = regle.id + '|' + p.r1 + ',' + p.c1;
    const st = () => { if (!cache.stats.has(cleStats)) cache.stats.set(cleStats, statsRegle(classeur, fi, regle, p)); return cache.stats.get(cleStats); };
    let ok = false;
    switch (regle.type) {
      case 'valeur': {
        if (vide) break;
        const a = nombreOuTexte(classeur, fi, regle.v1, p.r1, p.c1, r, c), b = nombreOuTexte(classeur, fi, regle.v2, p.r1, p.c1, r, c);
        const cmp = (x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).toLowerCase().localeCompare(String(y).toLowerCase()));
        if (a === null || (typeof a === 'number') !== (typeof v === 'number') && !['=', '<>'].includes(regle.op)) break;
        const d = cmp(v, a);
        switch (regle.op) {
          case '>': ok = d > 0; break; case '<': ok = d < 0; break; case '>=': ok = d >= 0; break; case '<=': ok = d <= 0; break;
          case '=': ok = d === 0 && typeof a === typeof v; break; case '<>': ok = !(d === 0 && typeof a === typeof v); break;
          case 'entre': case 'hors': { if (b === null) break; const lo = cmp(a, b) <= 0 ? a : b, hi = lo === a ? b : a; const dedans = cmp(v, lo) >= 0 && cmp(v, hi) <= 0; ok = regle.op === 'entre' ? dedans : !dedans; break; }
        }
        break;
      }
      case 'texte': {
        const t = texteFiltre(classeur, fi, r, c).toLowerCase(), x = String(regle.texte || '').toLowerCase();
        if (!x) break;
        ok = { contient: t.includes(x), necontientpas: !t.includes(x), commence: t.startsWith(x), termine: t.endsWith(x) }[regle.op || 'contient'];
        break;
      }
      case 'formule': {
        const fo = String(regle.formule || '').trim();
        if (!fo) break;
        let res = classeur.evaluateur.evaluerFormule(decalerFormule(fo.startsWith('=') ? fo : '=' + fo, r - p.r1, c - p.c1).slice(1), fi, r, c);
        if (Array.isArray(res)) res = res[0][0];
        ok = res === true || (typeof res === 'number' && res !== 0);
        break;
      }
      case 'doublons': case 'uniques': {
        if (vide) break;
        const kk = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v;
        const n = st().compte.get(kk) || 0;
        ok = regle.type === 'doublons' ? n > 1 : n === 1;
        break;
      }
      case 'top': if (typeof v === 'number' && st().seuil !== undefined) ok = regle.bas ? v <= st().seuil : v >= st().seuil; break;
      case 'moyenne': if (typeof v === 'number') ok = regle.dessous ? v < st().moyenne : v > st().moyenne; break;
      case 'vides': ok = vide; break;
      case 'nonvides': ok = !vide; break;
      case 'echelle': {
        if (typeof v !== 'number') break;
        const s = st(), cols = regle.couleurs && regle.couleurs.length >= 2 ? regle.couleurs : ['#f8696b', '#ffeb84', '#63be7b'];
        let fond;
        if (s.max === s.min) fond = cols[cols.length > 2 ? 1 : 0];
        else if (cols.length > 2) fond = v <= s.milieu ? melanger(cols[0], cols[1], s.milieu === s.min ? 1 : (v - s.min) / (s.milieu - s.min)) : melanger(cols[1], cols[2], s.max === s.milieu ? 1 : (v - s.milieu) / (s.max - s.milieu));
        else fond = melanger(cols[0], cols[1], (v - s.min) / (s.max - s.min));
        poser({ fond });
        continue;
      }
      case 'icones': {
        if (typeof v !== 'number') break;
        const s = st(), jeu = JEUX_ICONES[regle.jeu] ? regle.jeu : '3Arrows', n = JEUX_ICONES[jeu].icones.length;
        // Seuils en % de l'étendue (comme Excel par défaut : 33 et 67 pour 3 icônes)
        const seuils = regle.seuils && regle.seuils.length === n - 1 ? regle.seuils.map(Number) : Array.from({ length: n - 1 }, (_, k) => Math.round((100 * (k + 1)) / n));
        const pct = s.max === s.min ? 100 : ((v - s.min) / (s.max - s.min)) * 100;
        let i = seuils.filter((x) => pct >= x).length;
        if (regle.inverse) i = n - 1 - i;
        if (out && out.icone) continue;
        poser({ icone: { jeu, i, seule: !!regle.iconeSeule } });
        continue;
      }
      case 'barres': {
        if (typeof v !== 'number') break;
        const s = st(), etendue = s.haut - s.bas || 1;
        const zero = (0 - s.bas) / etendue;
        poser({ barre: { debut: Math.min(zero, (v - s.bas) / etendue) * 100, fin: Math.max(zero, (v - s.bas) / etendue) * 100, couleur: regle.couleur || '#638ec6', negatif: v < 0 } });
        continue;
      }
    }
    if (ok) { poser(regle.style); if (regle.arreter) break; }
  }
  cache.res.set(k, out);
  return out;
}

/** Décale les plages des règles quand on insère / supprime des lignes ou des colonnes. */
export function decalerMfc(f, axe, idx, n, cle = 'mfc') {
  if (!f[cle] || !f[cle].length) return;
  f[cle] = f[cle].map((regle) => {
    const ps = plagesMfc(regle).map((p) => {
      const q = { ...p };
      const [a, b] = axe === 'r' ? ['r1', 'r2'] : ['c1', 'c2'];
      if (n > 0) { if (q[a] >= idx) q[a] += n; if (q[b] >= idx) q[b] += n; }
      else { const fin = idx - n; const ajuste = (x) => (x >= fin ? x + n : x >= idx ? idx : x); q[a] = ajuste(q[a]); q[b] = q[b] >= idx && q[b] < fin ? idx - 1 : ajuste(q[b]); if (q[b] < q[a]) return null; }
      return q;
    }).filter(Boolean);
    if (!ps.length) return null;
    return { ...regle, plage: ps.map((p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2))).join(' ') };
  }).filter(Boolean);
}


// ---------------------------------------------------------------------------
// Validation des données
// ---------------------------------------------------------------------------
//
// Règle : { id, plage: 'B2:B50', type, op, v1, v2, liste, vides, fleche, message: { titre, texte }, erreur: { style, titre, texte } }
//   type  : 'liste' (liste : « Oui;Non » ou « =$H$2:$H$9 »), 'entier', 'decimal', 'date', 'heure', 'longueur' (du texte), 'formule'
//   op    : 'entre', 'hors', '=', '<>', '>', '<', '>=', '<=' (sauf liste et formule)
//   v1/v2 : nombre, date (jj/mm/aaaa), heure (hh:mm) ou =formule ; formule : =… vraie pour une saisie valide
//   vides : les cellules vides sont acceptées (vrai par défaut) ; fleche : liste déroulante proposée (vrai par défaut)
//   erreur.style : 'stop' (saisie refusée), 'avertissement' (on demande), 'information' (on prévient)

export const TYPES_VALIDATION = [['liste', 'Liste'], ['entier', 'Nombre entier'], ['decimal', 'Décimal'], ['date', 'Date'], ['heure', 'Heure'], ['longueur', 'Longueur du texte'], ['formule', 'Personnalisée (formule)']];
export const OPS_VALIDATION = [['entre', 'comprise entre'], ['hors', 'non comprise entre'], ['=', 'égale à'], ['<>', 'différente de'], ['>', 'supérieure à'], ['<', 'inférieure à'], ['>=', 'supérieure ou égale à'], ['<=', 'inférieure ou égale à']];

/** Règle de validation d'une cellule (la première qui la couvre) ou null. */
export function validationDe(f, r, c) {
  if (!f.validations || !f.validations.length) return null;
  for (const v of f.validations) if (plagesMfc(v).some((p) => r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2)) return v;
  return null;
}

// Borne d'une règle : =formule (relative à la première cellule), date, heure ou nombre
function borne(classeur, fi, x, p, r, c) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (s === '') return null;
  if (s.startsWith('=')) { let v = classeur.evaluateur.evaluerFormule(decalerFormule(s, r - p.r1, c - p.c1).slice(1), fi, r, c); if (Array.isArray(v)) v = v[0][0]; return typeof v === 'number' ? v : null; }
  let m;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) { let an = +m[3]; if (an < 100) an += an < 30 ? 2000 : 1900; return dateVersSerie(new Date(Date.UTC(an, +m[2] - 1, +m[1]))); }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) return (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400;
  const n = +s.replace(/[\s ]/g, '').replace(',', '.');
  return isNaN(n) ? null : n;
}

/** Éléments d'une liste de validation (textes affichés), pour la liste déroulante. */
export function elementsListe(classeur, fi, regle, r = 0, c = 0) {
  const src = String(regle.liste || '').trim();
  if (!src) return [];
  if (src.startsWith('=')) {
    const p = plagesMfc(regle)[0] || { r1: r, c1: c };
    let v = classeur.evaluateur.evaluerFormule(decalerFormule(src, r - p.r1, c - p.c1).slice(1), fi, r, c);
    if (!Array.isArray(v)) v = [[v]];
    const out = [];
    for (const ligne of v) for (const x of ligne) if (x !== null && x !== undefined && x !== '' && !(x instanceof ErreurFormule)) { const t = typeof x === 'number' ? formater(x) : typeof x === 'boolean' ? (x ? 'VRAI' : 'FAUX') : String(x); if (!out.includes(t)) out.push(t); }
    return out;
  }
  return src.split(/[;\n]/).map((x) => x.trim()).filter((x) => x !== '');
}

/** La valeur actuelle de la cellule respecte-t-elle sa règle ? */
export function valeurValide(classeur, fi, regle, r, c) {
  const p = plagesMfc(regle).find((q) => r >= q.r1 && r <= q.r2 && c >= q.c1 && c <= q.c2) || plagesMfc(regle)[0] || { r1: r, c1: c };
  const v = classeur.valeur(fi, r, c);
  if (v === null || v === undefined || v === '') return regle.vides !== false;
  if (v instanceof ErreurFormule) return false;
  const comparer = (x) => {
    const a = borne(classeur, fi, regle.v1, p, r, c), b = borne(classeur, fi, regle.v2, p, r, c);
    if (a === null) return true;
    switch (regle.op || 'entre') {
      case 'entre': return b === null ? x >= a : x >= Math.min(a, b) && x <= Math.max(a, b);
      case 'hors': return b === null ? x < a : x < Math.min(a, b) || x > Math.max(a, b);
      case '=': return Math.abs(x - a) < 1e-12; case '<>': return Math.abs(x - a) >= 1e-12;
      case '>': return x > a; case '<': return x < a; case '>=': return x >= a; case '<=': return x <= a;
      default: return true;
    }
  };
  switch (regle.type) {
    case 'liste': {
      const t = (typeof v === 'number' ? formater(v, (classeur.feuilles[fi].get(r, c) || {}).z) : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(v)).toLowerCase();
      const brut = typeof v === 'number' ? formater(v).toLowerCase() : t;
      return elementsListe(classeur, fi, regle, r, c).some((x) => { const xl = x.toLowerCase(); return xl === t || xl === brut || (typeof v === 'number' && +x.replace(/[\s ]/g, '').replace(',', '.') === v); });
    }
    case 'entier': return typeof v === 'number' && Number.isInteger(Math.round(v * 1e9) / 1e9) && comparer(v);
    case 'decimal': case 'date': case 'heure': return typeof v === 'number' && comparer(v);
    case 'longueur': return comparer(String(typeof v === 'number' ? formater(v, (classeur.feuilles[fi].get(r, c) || {}).z) : v).length);
    case 'formule': {
      const fo = String(regle.v1 || '').trim();
      if (!fo) return true;
      let res = classeur.evaluateur.evaluerFormule(decalerFormule(fo.startsWith('=') ? fo : '=' + fo, r - p.r1, c - p.c1).slice(1), fi, r, c);
      if (Array.isArray(res)) res = res[0][0];
      return res === true || (typeof res === 'number' && res !== 0);
    }
    default: return true;
  }
}

/** Texte qui décrit la règle (message d'erreur par défaut). */
export function decrireValidation(regle) {
  const op = Object.fromEntries(OPS_VALIDATION)[regle.op || 'entre'] || '';
  const bornes = (regle.op || 'entre') === 'entre' || regle.op === 'hors' ? (regle.v1 ?? '') + ' et ' + (regle.v2 ?? '') : (regle.v1 ?? '');
  switch (regle.type) {
    case 'liste': return 'La valeur doit être choisie dans la liste' + (String(regle.liste || '').startsWith('=') ? ' ' + regle.liste.slice(1) : ' : ' + elementsListeTexte(regle));
    case 'entier': return 'Nombre entier ' + op + ' ' + bornes;
    case 'decimal': return 'Nombre ' + op + ' ' + bornes;
    case 'date': return 'Date ' + op + ' ' + bornes;
    case 'heure': return 'Heure ' + op + ' ' + bornes;
    case 'longueur': return 'Texte dont la longueur est ' + op + ' ' + bornes;
    case 'formule': return 'La formule ' + (regle.v1 || '') + ' doit être vraie';
    default: return '';
  }
}
const elementsListeTexte = (regle) => String(regle.liste || '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean).join(', ');

/** Toutes les cellules non valides de la feuille (pour « Entourer les données non valides »). */
export function cellulesInvalides(classeur, fi) {
  const f = classeur.feuilles[fi], out = [];
  for (const regle of f.validations || []) for (const p of plagesMfc(regle)) {
    const r2 = Math.min(p.r2, f.zone.r2), c2 = Math.min(p.c2, f.zone.c2);
    for (let r = p.r1; r <= r2; r++) for (let c = p.c1; c <= c2; c++) if (validationDe(f, r, c) === regle && !valeurValide(classeur, fi, regle, r, c)) out.push({ r, c });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Valeur cible
// ---------------------------------------------------------------------------

/**
 * Cherche la valeur de la cellule « variable » qui donne « cible » dans la cellule « formule » (comme Excel :
 * Données > Analyse de scénarios > Valeur cible). Sécante, puis dichotomie si un changement de signe est trouvé.
 * Renvoie { ok, x, y, iterations }. La cellule variable garde la meilleure valeur trouvée.
 */
export function valeurCible(classeur, fi, formule, cible, variable, { maxIter = 200, tolerance = 1e-7 } = {}) {
  const f = classeur.feuilles[fi];
  const celF = f.get(formule.r, formule.c);
  if (!celF || celF.f == null) throw new Error('La cellule à définir doit contenir une formule');
  const celV = f.get(variable.r, variable.c);
  if (celV && celV.f != null) throw new Error('La cellule à modifier doit contenir une valeur, pas une formule');
  const ancienne = celV && typeof celV.v === 'number' ? celV.v : 0;
  const essai = (x) => {
    const cel = f.get(variable.r, variable.c) || {};
    f.set(variable.r, variable.c, { ...cel, v: x });
    // Les formules qui dépendaient de l'ancienne valeur ne doivent plus lire la valeur enregistrée du fichier
    classeur.modifie();
    const y = classeur.valeur(fi, formule.r, formule.c);
    return typeof y === 'number' && isFinite(y) ? y - cible : NaN;
  };
  const echelle = Math.max(1, Math.abs(cible));
  let x0 = ancienne, g0 = essai(x0), it = 0;
  let meilleur = { x: x0, g: Math.abs(g0) };
  const garder = (x, g) => { if (!isNaN(g) && (isNaN(meilleur.g) || Math.abs(g) < meilleur.g)) meilleur = { x, g: Math.abs(g) }; };
  if (!isNaN(g0) && Math.abs(g0) <= tolerance * echelle) return { ok: true, x: x0, y: g0 + cible, iterations: 0 };
  let x1 = x0 === 0 ? 0.01 : x0 * 1.01, g1 = essai(x1);
  garder(x1, g1);
  let bracket = null;
  while (it++ < maxIter) {
    if (isNaN(g0) || isNaN(g1)) { x1 = x1 === 0 ? 1 : x1 * (it % 2 ? -2 : 0.5); g1 = essai(x1); garder(x1, g1); continue; }
    if (Math.sign(g0) !== Math.sign(g1)) { bracket = x0 < x1 ? [x0, g0, x1, g1] : [x1, g1, x0, g0]; break; }
    const pente = (g1 - g0) / (x1 - x0);
    let x2 = pente === 0 || !isFinite(pente) ? x1 + (x1 - x0) * 2 : x1 - g1 / pente;
    if (!isFinite(x2)) x2 = x1 * 2 + 1;
    // Pas trop grand : on limite l'extrapolation
    const pas = x2 - x1, lim = Math.max(10, Math.abs(x1) * 10);
    if (Math.abs(pas) > lim) x2 = x1 + Math.sign(pas) * lim;
    const g2 = essai(x2);
    garder(x2, g2);
    if (!isNaN(g2) && Math.abs(g2) <= tolerance * echelle) return { ok: true, x: x2, y: g2 + cible, iterations: it };
    x0 = x1; g0 = g1; x1 = x2; g1 = g2;
  }
  if (bracket) {
    let [a, ga, b] = bracket;
    for (let k = 0; k < 200; k++) {
      const m = (a + b) / 2, gm = essai(m);
      garder(m, gm);
      if (isNaN(gm)) break;
      if (Math.abs(gm) <= tolerance * echelle || Math.abs(b - a) < 1e-14 * Math.max(1, Math.abs(m))) return { ok: Math.abs(gm) <= tolerance * echelle * 10, x: m, y: gm + cible, iterations: it + k };
      if (Math.sign(gm) === Math.sign(ga)) { a = m; ga = gm; } else b = m;
    }
  }
  essai(meilleur.x);
  const y = classeur.valeur(fi, formule.r, formule.c);
  return { ok: false, x: meilleur.x, y, iterations: it };
}

// ---------------------------------------------------------------------------
// Somme automatique
// ---------------------------------------------------------------------------

/**
 * Formule de somme automatique pour une cellule : la colonne de nombres au-dessus, sinon la ligne à gauche.
 * fonction : 'SOMME', 'MOYENNE', 'NB', 'MAX', 'MIN'. Renvoie '=SOMME(B2:B9)' (ou '=SOMME()' si rien n'est trouvé).
 */
export function formuleAutomatique(classeur, fi, r, c, fonction = 'SOMME') {
  const estNombre = (rr, cc) => typeof classeur.valeur(fi, rr, cc) === 'number';
  if (r > 0 && estNombre(r - 1, c)) {
    let a = r - 1;
    while (a - 1 >= 0 && estNombre(a - 1, c)) a--;
    return '=' + fonction + '(' + adresse(a, c) + ':' + adresse(r - 1, c) + ')';
  }
  if (c > 0 && estNombre(r, c - 1)) {
    let a = c - 1;
    while (a - 1 >= 0 && estNombre(r, a - 1)) a--;
    return '=' + fonction + '(' + adresse(r, a) + ':' + adresse(r, c - 1) + ')';
  }
  return '=' + fonction + '()';
}

/** Lettres de colonne pour l'interface (réexport pratique). */
export { colVersLettres };

// ---------------------------------------------------------------------------
// Collage spécial, décalage de cellules, doublons, conversion en colonnes
// ---------------------------------------------------------------------------

/**
 * Collage spécial. src : { classeur, fi, r1, c1, r2, c2 } ; dest : { r, c } dans la feuille destFi du classeur.
 * options : quoi ('tout' | 'formules' | 'valeurs' | 'formats' | 'valeursFormats' | 'notes'), operation ('aucune' | 'addition' |
 * 'soustraction' | 'multiplication' | 'division'), ignorerVides, transposer. Renvoie la plage collée.
 */
export function collerSpecial(classeur, src, destFi, dest, options = {}) {
  const { quoi = 'tout', operation = 'aucune', ignorerVides = false, transposer = false } = options;
  const sc = src.classeur || classeur, sf = sc.feuilles[src.fi], f = classeur.feuilles[destFi];
  const bloc = [];
  for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) {
    const cel = sf.get(r, c);
    bloc.push({ dr: r - src.r1, dc: c - src.c1, cel: cel ? JSON.parse(JSON.stringify({ ...cel, v: cel.v instanceof ErreurFormule ? null : cel.v })) : null, v: cel ? sc.valeur(src.fi, r, c) : null, err: cel && cel.v instanceof ErreurFormule ? cel.v : null });
  }
  const op = (a, b) => {
    if (typeof b !== 'number') return a;
    const x = typeof a === 'number' ? a : (a === null || a === undefined || a === '' ? 0 : null);
    if (x === null) return a;
    switch (operation) { case 'addition': return x + b; case 'soustraction': return x - b; case 'multiplication': return x * b; case 'division': return b === 0 ? new ErreurFormule('#DIV/0!') : x / b; default: return b; }
  };
  let r2 = dest.r, c2 = dest.c;
  for (const b of bloc) {
    const dr = transposer ? b.dc : b.dr, dc = transposer ? b.dr : b.dc;
    const r = dest.r + dr, c = dest.c + dc;
    r2 = Math.max(r2, r); c2 = Math.max(c2, c);
    const vide = !b.cel || (b.cel.f == null && (b.cel.v === null || b.cel.v === undefined || b.cel.v === ''));
    if (ignorerVides && vide) continue;
    const ancien = f.get(r, c) || {};
    const nouveau = { ...ancien };
    if (quoi === 'formats') { if (b.cel && b.cel.s) nouveau.s = b.cel.s; else delete nouveau.s; if (b.cel && b.cel.z) nouveau.z = b.cel.z; else delete nouveau.z; f.set(r, c, Object.keys(nouveau).length ? nouveau : null); continue; }
    if (quoi === 'notes') { if (b.cel && b.cel.note) nouveau.note = b.cel.note; f.set(r, c, nouveau); continue; }
    let contenu;
    if (quoi === 'valeurs' || quoi === 'valeursFormats' || (operation !== 'aucune' && quoi !== 'formules')) {
      const v = b.err ? b.err : b.v instanceof ErreurFormule ? b.v : b.v;
      contenu = { v: operation !== 'aucune' ? op(ancien.f != null ? classeur.valeur(destFi, r, c) : ancien.v, v) : v };
    } else if (b.cel && b.cel.f != null) contenu = { f: decalerFormule(b.cel.f, r - (src.r1 + b.dr), c - (src.c1 + b.dc)) };
    else contenu = { v: operation !== 'aucune' ? op(ancien.v, b.cel ? b.cel.v : null) : (b.cel ? b.cel.v : null) };
    delete nouveau.f; delete nouveau.v; delete nouveau.cache;
    Object.assign(nouveau, contenu);
    if (quoi === 'tout' || quoi === 'valeursFormats') { if (b.cel && b.cel.s) nouveau.s = b.cel.s; else if (quoi === 'tout') delete nouveau.s; if (b.cel && b.cel.z) nouveau.z = b.cel.z; else if (quoi === 'tout') delete nouveau.z; }
    if (quoi === 'tout' && b.cel && b.cel.note) nouveau.note = b.cel.note;
    if (nouveau.v === null && nouveau.f == null && !nouveau.s && !nouveau.z && !nouveau.note) f.set(r, c, null); else f.set(r, c, nouveau);
  }
  f.recalculerZone();
  classeur.modifie();
  return { r1: dest.r, c1: dest.c, r2, c2 };
}

/**
 * Insère (n > 0) ou supprime (n < 0) des cellules en décalant les voisines : sens 'lignes' (vers le bas / le haut)
 * dans les colonnes c1..c2, ou 'colonnes' (vers la droite / la gauche) dans les lignes r1..r2.
 * Les références des formules vers les cellules déplacées suivent (cellule seule ou plage entièrement déplacée).
 */
export function decalerCellules(classeur, fi, p, sens) {
  const f = classeur.feuilles[fi];
  const lignes = sens === 'bas' || sens === 'haut';
  const n = lignes ? (p.r2 - p.r1 + 1) * (sens === 'bas' ? 1 : -1) : (p.c2 - p.c1 + 1) * (sens === 'droite' ? 1 : -1);
  const dans = (r, c) => (lignes ? c >= p.c1 && c <= p.c2 && r >= p.r1 : r >= p.r1 && r <= p.r2 && c >= p.c1);
  const supprime = (r, c) => n < 0 && (lignes ? c >= p.c1 && c <= p.c2 && r >= p.r1 && r <= p.r2 : r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2);
  const deplacer = (r, c) => (lignes ? { r: r + n, c } : { r, c: c + n });
  // 1. Les cellules
  const nouvelles = new Map();
  f.chaque((r, c, cel) => {
    if (supprime(r, c)) return;
    const q = dans(r, c) ? deplacer(r, c) : { r, c };
    nouvelles.set(q.r + ',' + q.c, cel);
  });
  f.cellules = nouvelles;
  f.recalculerZone();
  // 2. Les références (dans tout le classeur) vers les cellules de cette feuille
  const re = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?(?![\w(])/g;
  classeur.feuilles.forEach((g, i) => g.chaque((r, c, cel) => {
    if (cel.f == null) return;
    const morceaux = cel.f.split(/("(?:[^"]|"")*")/);
    cel.f = morceaux.map((m, k) => (k % 2 ? m : m.replace(re, (tout, pref, a1, col1, a2, lig1, b1, col2, b2, lig2) => {
      const nom = pref ? pref.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : null;
      if (nom ? nom.toLowerCase() !== f.nom.toLowerCase() : i !== fi) return tout;
      const c1 = lettresVersCol(col1), r1 = +lig1 - 1;
      const c2b = col2 ? lettresVersCol(col2) : c1, r2b = lig2 ? +lig2 - 1 : r1;
      const d1 = dans(r1, c1), d2 = dans(r2b, c2b);
      if (!col2) { if (supprime(r1, c1)) return (pref || '') + '#REF!'; if (!d1) return tout; const q = deplacer(r1, c1); return (pref || '') + a1 + colVersLettres(q.c) + a2 + (q.r + 1); }
      if (!(d1 && d2) || supprime(r1, c1) || supprime(r2b, c2b)) return tout;
      const q1 = deplacer(r1, c1), q2 = deplacer(r2b, c2b);
      return (pref || '') + a1 + colVersLettres(q1.c) + a2 + (q1.r + 1) + ':' + b1 + colVersLettres(q2.c) + b2 + (q2.r + 1);
    }))).join('');
    delete cel.cache;
  }));
  classeur.modifie();
}
function lettresVersCol(l) { let c = 0; for (const ch of l.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }

/** Supprime les lignes en double d'une plage (sur les colonnes indiquées) ; les suivantes remontent. Renvoie le nombre supprimé. */
export function supprimerDoublons(classeur, fi, p, colonnes, { entete = true } = {}) {
  const f = classeur.feuilles[fi];
  const cols = colonnes && colonnes.length ? colonnes : Array.from({ length: p.c2 - p.c1 + 1 }, (_, i) => p.c1 + i);
  const vus = new Set(), garder = [];
  const r0 = p.r1 + (entete ? 1 : 0);
  for (let r = r0; r <= p.r2; r++) {
    const cle = cols.map((c) => { const v = classeur.valeur(fi, r, c); return typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + ':' + (v instanceof ErreurFormule ? v.code : v); }).join('\u0001');
    if (vus.has(cle)) continue;
    vus.add(cle); garder.push(r);
  }
  const n = p.r2 - r0 + 1 - garder.length;
  if (!n) return 0;
  const lignes = garder.map((r) => { const l = []; for (let c = p.c1; c <= p.c2; c++) { const cel = f.get(r, c); l.push(cel ? { ...cel } : null); } return { r, l }; });
  for (let r = r0; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) f.set(r, c, null);
  lignes.forEach(({ r, l }, i) => l.forEach((cel, k) => { if (cel && cel.f != null && r !== r0 + i) { cel.f = decalerFormule(cel.f, r0 + i - r, 0); delete cel.cache; } f.set(r0 + i, p.c1 + k, cel); }));
  f.recalculerZone(); classeur.modifie();
  return n;
}

/** Convertit une colonne de textes en plusieurs colonnes (séparateur ; , tabulation, espace ou autre). Renvoie le nombre de colonnes. */
/**
 * Découpe une ligne de texte en morceaux (Convertir en colonnes, texte collé d'un PDF ou d'une page).
 * seps : liste parmi 'tab', 'espace', ';', ',', ou tout autre caractère ; regrouper : plusieurs séparateurs
 * qui se suivent n'en font qu'un ; milliers : « 1 234 567,89 » reste un seul nombre quand on coupe aux espaces ;
 * guillemets : "un texte; avec séparateur" reste entier.
 */
export function decouperLigne(ligne, { seps = ['tab'], regrouper = true, milliers = false, guillemets = true } = {}) {
  const S = new Set(seps.map((x) => (x === 'tab' ? '\t' : x === 'espace' ? ' ' : x === 'espaces2' ? '\u0001' : x)));
  if (S.has(' ')) { S.add('\u00a0'); S.add('\u202f'); } // espaces insécables des PDF
  let t = String(ligne).replace(/\r$/, '');
  // « Espaces multiples » : les colonnes d'un PDF sont alignées par plusieurs espaces, un nom peut en contenir un seul
  if (S.has('\u0001')) t = t.replace(/[ \u00a0\u202f]{2,}/g, '\u0001');
  const morceaux = [];
  let cour = '', dansGuill = false, aGuill = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guillemets && ch === '"' && (cour === '' || dansGuill)) {
      if (dansGuill && t[i + 1] === '"') { cour += '"'; i++; continue; }
      dansGuill = !dansGuill; aGuill = true; continue;
    }
    if (!dansGuill && S.has(ch)) { morceaux.push({ v: cour, g: aGuill }); cour = ''; aGuill = false; continue; }
    cour += ch;
  }
  morceaux.push({ v: cour, g: aGuill });
  let out = morceaux.map((m) => (m.g ? m.v : m.v.trim()));
  if (regrouper) {
    // Séparateurs qui se suivent (et espaces en début ou fin de ligne) : pas de colonne vide
    out = out.filter((m, i) => m !== '' || morceaux[i].g);
  }
  if (milliers && (S.has(' ') || S.has('\u0001'))) {
    // « 1 234 567,89 » : un groupe de 1 à 3 chiffres suivi de groupes de 3 chiffres (le dernier peut porter les décimales)
    const fus = [];
    for (let i = 0; i < out.length; i++) {
      let x = out[i];
      if (/^[-+(]?\d{1,3}$/.test(x)) {
        let j = i + 1;
        while (j < out.length && /^\d{3}([.,]\d+)?\)?%?$/.test(out[j])) { x += ' ' + out[j]; j++; if (!/^\d{3}$/.test(out[j - 1])) break; }
        i = j - 1;
      }
      fus.push(x);
    }
    out = fus;
  }
  return out;
}
/** Séparateurs probables d'un texte collé : tabulation, puis point-virgule, puis espaces (texte d'un PDF). */
export function devinerSeparateurs(lignes) {
  const l = lignes.filter((x) => x.trim() !== '').slice(0, 50);
  if (!l.length) return ['tab'];
  const part = (re) => l.filter((x) => re.test(x)).length / l.length;
  if (part(/\t/) >= 0.5) return ['tab'];
  if (part(/;/) >= 0.6) return [';'];
  if (part(/\S[ \u00a0\u202f]{2,}\S/) >= 0.6) return ['espaces2'];
  if (part(/\S[ \u00a0\u202f]+\S/) >= 0.5) return ['espace'];
  if (part(/,/) >= 0.8 && !l.some((x) => /\d,\d/.test(x))) return [','];
  return ['tab'];
}
export function convertirEnColonnes(classeur, fi, p, separateur = ';', options = {}) {
  const f = classeur.feuilles[fi];
  const seps = Array.isArray(separateur) ? separateur : [separateur];
  const opts = { regrouper: false, ...options, seps };
  let max = 1;
  for (let r = p.r1; r <= p.r2; r++) {
    const cel = f.get(r, p.c1);
    if (!cel || cel.f != null || cel.v == null) continue;
    const texte = typeof cel.v === 'string' ? cel.v : String(cel.v);
    if (typeof cel.v !== 'string') continue;
    const morceaux = decouperLigne(texte, opts);
    max = Math.max(max, morceaux.length);
    morceaux.forEach((m, k) => classeur.saisir(fi, r, p.c1 + k, m));
  }
  return max;
}
