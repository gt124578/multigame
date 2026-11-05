// Plan (grouper des lignes ou des colonnes, les replier avec + / −, niveaux 1, 2, 3…) et sous-totaux automatiques,
// comme Données > Plan dans Excel. Sans DOM.
//
// f.plan = { L: { r: niveau }, C: { c: niveau }, H: { r: hauteur avant repli }, W: { c: largeur avant repli } }
// Le résumé d'un groupe est la ligne juste dessous (la colonne juste à droite), comme le réglage par défaut d'Excel.

import { colVersLettres } from './formules.js';

const MAX = 7;
const cle = (axe) => (axe === 'L' ? 'L' : 'C');
const tailles = (f, axe) => (axe === 'L' ? f.hauteurs : f.largeurs);
const sauvees = (f, axe) => { f.plan = f.plan || {}; const k = axe === 'L' ? 'H' : 'W'; return (f.plan[k] = f.plan[k] || {}); };
export const niveaux = (f, axe) => (f.plan && f.plan[cle(axe)]) || {};
export const aUnPlan = (f) => !!(f.plan && ((f.plan.L && Object.keys(f.plan.L).length) || (f.plan.C && Object.keys(f.plan.C).length)));
export function niveauMax(f, axe) { let m = 0; for (const v of Object.values(niveaux(f, axe))) m = Math.max(m, v); return m; }

function cacher(f, axe, i) {
  const t = tailles(f, axe), s = sauvees(f, axe);
  if (t[i] === 0) return;
  s[i] = t[i] === undefined ? null : t[i];
  t[i] = 0;
}
function montrer(f, axe, i) {
  const t = tailles(f, axe), s = sauvees(f, axe);
  if (i in s) { if (s[i] === null) delete t[i]; else t[i] = s[i]; delete s[i]; }
  else if (t[i] === 0) delete t[i];
}
const estCache = (f, axe, i) => tailles(f, axe)[i] === 0;

/** Ajoute un niveau aux lignes (ou colonnes) a..b. */
export function grouper(f, axe, a, b) {
  f.plan = f.plan || {};
  const n = (f.plan[cle(axe)] = f.plan[cle(axe)] || {});
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) n[i] = Math.min(MAX, (n[i] || 0) + 1);
}
/** Retire un niveau aux lignes (ou colonnes) a..b ; celles qui n'ont plus de niveau réapparaissent. */
export function dissocier(f, axe, a, b) {
  const n = niveaux(f, axe);
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
    if (!n[i]) continue;
    if (--n[i] <= 0) { delete n[i]; montrer(f, axe, i); }
  }
}
export function effacerPlan(f) {
  for (const axe of ['L', 'C']) for (const i of Object.keys(niveaux(f, axe))) montrer(f, axe, +i);
  delete f.plan;
}

/** Groupes du plan : [{ niveau, debut, fin, resume, replie }] du plus extérieur au plus intérieur. */
export function groupes(f, axe) {
  const n = niveaux(f, axe), idx = Object.keys(n).map(Number).sort((x, y) => x - y), out = [];
  const max = niveauMax(f, axe);
  for (let k = 1; k <= max; k++) {
    let debut = null, prec = null;
    const clore = () => { if (debut === null) return; const g = { niveau: k, debut, fin: prec, resume: prec + 1 }; g.replie = (() => { for (let i = g.debut; i <= g.fin; i++) if (!estCache(f, axe, i)) return false; return true; })(); out.push(g); debut = null; };
    for (const i of idx) {
      if (n[i] >= k) { if (debut !== null && i !== prec + 1) clore(); if (debut === null) debut = i; prec = i; }
      else clore();
    }
    clore();
  }
  return out;
}
export function replier(f, axe, g) { for (let i = g.debut; i <= g.fin; i++) cacher(f, axe, i); }
export function deplier(f, axe, g) {
  // Les groupes intérieurs déjà repliés le restent (comme Excel)
  const interieurs = groupes(f, axe).filter((x) => x.niveau > g.niveau && x.debut >= g.debut && x.fin <= g.fin && x.replie);
  for (let i = g.debut; i <= g.fin; i++) if (!interieurs.some((x) => i >= x.debut && i <= x.fin)) montrer(f, axe, i);
}
/** Bouton de niveau n : ne garde visibles que les lignes de niveau inférieur à n. */
export function afficherNiveau(f, axe, niv) {
  const n = niveaux(f, axe);
  for (const [i, v] of Object.entries(n)) { if (v >= niv) cacher(f, axe, +i); else montrer(f, axe, +i); }
}
/** Groupe le plus intérieur qui contient i (ou dont i est la ligne de résumé). */
export function groupeEn(f, axe, i) {
  const gs = groupes(f, axe).filter((g) => (i >= g.debut && i <= g.fin) || i === g.resume);
  return gs.sort((x, y) => y.niveau - x.niveau)[0] || null;
}

// ---------------------------------------------------------------------------
// Sous-totaux (Données > Sous-total)
// ---------------------------------------------------------------------------
export const FONCTIONS_SOUS_TOTAL = [[9, 'Somme'], [3, 'Nombre'], [1, 'Moyenne'], [4, 'Max'], [5, 'Min'], [6, 'Produit'], [2, 'Nb (chiffres)'], [7, 'Écart type'], [10, 'Variance']];
const estSousTotal = (cel) => cel && cel.f != null && /\b(SUBTOTAL|SOUS\.TOTAL)\s*\(/i.test(cel.f);

/** Retire les lignes de sous-total d'une liste (et le plan des lignes) ; renvoie la nouvelle dernière ligne. */
export function supprimerSousTotaux(classeur, fi, p) {
  const f = classeur.feuilles[fi];
  let r2 = p.r2;
  for (let r = p.r2; r > p.r1; r--) {
    let st = false;
    for (let c = p.c1; c <= p.c2 && !st; c++) if (estSousTotal(f.get(r, c))) st = true;
    if (st) { classeur.supprimerLignes(fi, r, 1); r2--; }
  }
  if (f.plan && f.plan.L) for (let r = p.r1; r <= p.r2; r++) { if (f.plan.L[r]) { delete f.plan.L[r]; montrer(f, 'L', r); } }
  return r2;
}

/**
 * Sous-totaux à chaque changement de valeur dans la colonne cle (index absolu), pour les colonnes demandées.
 * p : la liste, ligne d'en-têtes comprise. Renvoie le nombre de groupes.
 */
export function sousTotaux(classeur, fi, p, { cle: col, fonction = 9, colonnes = [], remplacer = true } = {}) {
  const f = classeur.feuilles[fi];
  let r2 = remplacer ? supprimerSousTotaux(classeur, fi, p) : p.r2;
  const val = (r) => { const v = classeur.valeur(fi, r, col); return v == null ? '' : String(v); };
  // Groupes de lignes consécutives à la même valeur
  const grs = [];
  let debut = p.r1 + 1;
  for (let r = p.r1 + 2; r <= r2 + 1; r++) if (r > r2 || val(r) !== val(debut)) { grs.push({ a: debut, b: r - 1, t: classeur.texte(fi, debut, col) }); debut = r; }
  if (!grs.length) return 0;
  const L = (c) => colVersLettres(c);
  // On insère depuis le bas pour garder les numéros des groupes du haut
  for (let i = grs.length - 1; i >= 0; i--) {
    const g = grs[i], r = g.b + 1;
    classeur.insererLignes(fi, r, 1);
    classeur.saisir(fi, r, col, 'Total ' + g.t);
    classeur.style(fi, r, col, { gras: true });
    for (const c of colonnes) { classeur.saisir(fi, r, c, '=SOUS.TOTAL(' + fonction + ';' + L(c) + (g.a + 1) + ':' + L(c) + (g.b + 1) + ')'); classeur.style(fi, r, c, { gras: true }); }
    // Décalage des groupes du dessous déjà traités : rien à faire, ils sont plus bas
  }
  // Positions finales : chaque groupe i est décalé de i lignes (une ligne de total par groupe au-dessus)
  const fin = grs[grs.length - 1].b + grs.length; // dernière ligne de total de groupe
  const rg = fin + 1;
  classeur.insererLignes(fi, rg, 1);
  classeur.saisir(fi, rg, col, 'Total général');
  classeur.style(fi, rg, col, { gras: true });
  for (const c of colonnes) { classeur.saisir(fi, rg, c, '=SOUS.TOTAL(' + fonction + ';' + L(c) + (p.r1 + 2) + ':' + L(c) + (fin + 1) + ')'); classeur.style(fi, rg, c, { gras: true }); }
  // Plan : détail au niveau 2, totaux de groupe au niveau 1, total général au niveau 0
  f.plan = f.plan || {}; f.plan.L = f.plan.L || {};
  grs.forEach((g, i) => { const a = g.a + i, b = g.b + i; for (let r = a; r <= b; r++) f.plan.L[r] = 2; f.plan.L[b + 1] = 1; });
  classeur.modifie();
  return grs.length;
}
