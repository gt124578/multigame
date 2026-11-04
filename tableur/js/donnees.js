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
  ['echelle', 'Échelle de couleurs'], ['barres', 'Barres de données'],
];

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
