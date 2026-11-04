// Outils d'analyse, sans DOM : Solveur (simplexe pour les modèles linéaires, avec nombres entiers ;
// Nelder-Mead avec pénalités sinon), Table de données (à une ou deux entrées), Remplissage instantané (Ctrl+E),
// audit des formules (antécédents, dépendants, évaluation pas à pas, vérification des erreurs).

import { analyser, Plage, ErreurFormule, adresse, parsePlage, decalerFormule, formater, ALIAS, versTexte } from './formules.js';

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
function recalc(C) { C.version++; C.evaluateur.recalculerTout(); }
function poser(C, fi, r, c, v) { const f = C.feuilles[fi], o = f.get(r, c) || {}; f.set(r, c, { ...o, f: undefined, v, cache: undefined }); }

// ===========================================================================
// Solveur
// ===========================================================================

/** Lit une contrainte écrite comme dans Excel : « B5 <= 100 », « B2:B4 >= 0 », « C1 = D1 », « B2:B4 = ent », « B6 bin ». */
export function lireContrainte(texte) {
  const t = String(texte).trim().replace(/\$/g, '');
  let m = /^([A-Za-z]{1,3}\d+(?::[A-Za-z]{1,3}\d+)?)\s*(?:=\s*)?(ent|int|entier|bin|binaire)$/i.exec(t);
  if (m) return { g: parsePlage(m[1].toUpperCase()), op: /^b/i.test(m[2]) ? 'bin' : 'ent' };
  m = /^([A-Za-z]{1,3}\d+(?::[A-Za-z]{1,3}\d+)?)\s*(<=|>=|=|≤|≥)\s*(.+)$/.exec(t);
  if (!m) return null;
  const g = parsePlage(m[1].toUpperCase()); if (!g) return null;
  const op = { '≤': '<=', '≥': '>=' }[m[2]] || m[2];
  const d = m[3].trim(), n = +d.replace(/\s/g, '').replace(',', '.');
  if (d !== '' && !isNaN(n)) return { g, op, d: n };
  const p = parsePlage(d.toUpperCase());
  return p ? { g, op, d: p } : null;
}
export function ecrireContrainte(k) {
  const pl = (p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2));
  if (k.op === 'ent' || k.op === 'bin') return pl(k.g) + ' = ' + (k.op === 'ent' ? 'ent' : 'bin');
  return pl(k.g) + ' ' + k.op + ' ' + (typeof k.d === 'number' ? String(k.d).replace('.', ',') : pl(k.d));
}
const cellulesDe = (p) => { const out = []; for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) out.push({ r, c }); return out; };

/**
 * Résout un modèle.
 * modele : { objectif: {r,c}, but: 'max'|'min'|'valeur', valeur, variables: [{r,c}] ou plage, contraintes: [lireContrainte(...)],
 *            positives: true (variables ≥ 0), methode: 'auto'|'simplexe'|'gr' }
 * → { ok, x, y, message, methode, evaluations } ; les cellules variables gardent la solution (l'appelant peut rétablir).
 */
export function solveur(C, fi, modele, { maxEval = 4000 } = {}) {
  const f = C.feuilles[fi];
  const vars = Array.isArray(modele.variables) ? modele.variables : cellulesDe(modele.variables);
  if (!vars.length) throw new Error('Indiquez les cellules variables');
  if (vars.length > 200) throw new Error('200 cellules variables au plus');
  for (const v of vars) { const cel = f.get(v.r, v.c); if (cel && cel.f != null) throw new Error('La cellule variable ' + adresse(v.r, v.c) + ' contient une formule'); }
  const o = modele.objectif;
  const celO = o && f.get(o.r, o.c);
  if (!celO || celO.f == null) throw new Error('La cellule objectif doit contenir une formule');
  const but = modele.but || 'max', cible = +modele.valeur || 0;
  const contraintes = (modele.contraintes || []).filter(Boolean);
  const entiers = new Set(), binaires = new Set();
  const lignes = []; // contraintes « g op d » cellule par cellule
  for (const k of contraintes) {
    const gs = cellulesDe(k.g);
    if (k.op === 'ent' || k.op === 'bin') {
      for (const g of gs) { const i = vars.findIndex((v) => v.r === g.r && v.c === g.c); if (i < 0) throw new Error('« ' + ecrireContrainte(k) + ' » : seules les cellules variables peuvent être entières'); (k.op === 'bin' ? binaires : entiers).add(i); }
      continue;
    }
    const ds = typeof k.d === 'number' ? null : cellulesDe(k.d);
    if (ds && ds.length !== 1 && ds.length !== gs.length) throw new Error('« ' + ecrireContrainte(k) + ' » : les deux plages doivent avoir la même taille');
    gs.forEach((g, i) => lignes.push({ g, op: k.op, d: ds ? ds[ds.length === 1 ? 0 : i] : k.d }));
  }
  for (const i of binaires) entiers.add(i);
  const depart = vars.map((v) => { const x = C.valeur(fi, v.r, v.c); return estNombre(x) ? x : 0; });
  let evaluations = 0;
  // Pose x, recalcule, renvoie { obj, g: [lhs - rhs] }
  const essai = (x) => {
    evaluations++;
    vars.forEach((v, i) => poser(C, fi, v.r, v.c, x[i]));
    recalc(C);
    const lire = (q) => (typeof q === 'number' ? q : C.valeur(fi, q.r, q.c));
    const y = C.valeur(fi, o.r, o.c);
    return { obj: estNombre(y) ? y : NaN, ecarts: lignes.map((l) => { const a = lire(l.g), b = lire(l.d); return estNombre(a) && estNombre(b) ? a - b : NaN; }) };
  };
  const methode = modele.methode || 'auto';
  let res = null;
  if (methode !== 'gr') {
    const lin = lineariser(essai, depart);
    if (lin) res = simplexeModele(lin, lignes, but, cible, modele.positives !== false, entiers, binaires, vars.length);
    else if (methode === 'simplexe') return { ok: false, x: depart, message: 'Le modèle n\'est pas linéaire : choisissez la méthode « non linéaire »', methode: 'simplexe', evaluations };
    if (res) res.methode = 'simplexe';
  }
  if (!res) {
    res = neldermead(essai, depart, lignes, but, cible, modele.positives !== false, entiers, binaires, maxEval);
    res.methode = 'non linéaire';
  }
  // Pose la solution trouvée (ou le départ)
  const x = res.x || depart;
  const fin = essai(x);
  res.x = x; res.y = fin.obj; res.evaluations = evaluations;
  const viol = fin.ecarts.reduce((s, e, i) => s + violation(e, lignes[i].op), 0);
  if (res.ok && viol > 1e-6 * (1 + Math.abs(fin.obj))) { res.ok = false; res.message = 'Le Solveur n\'a pas trouvé de solution qui respecte toutes les contraintes'; }
  return res;
}
function violation(e, op) { if (!Number.isFinite(e)) return 1e12; return op === '<=' ? Math.max(0, e) : op === '>=' ? Math.max(0, -e) : Math.abs(e); }

// Repère un modèle linéaire : objectif et contraintes affines en x (vérifié sur deux points au hasard).
function lineariser(essai, x0) {
  const n = x0.length;
  const base = essai(x0);
  if (!Number.isFinite(base.obj) || base.ecarts.some((e) => !Number.isFinite(e))) return null;
  const grad = [], gradG = base.ecarts.map(() => []);
  for (let i = 0; i < n; i++) {
    const x = x0.slice(); x[i] += 1;
    const p = essai(x);
    if (!Number.isFinite(p.obj)) return null;
    grad.push(p.obj - base.obj);
    p.ecarts.forEach((e, k) => gradG[k].push(e - base.ecarts[k]));
  }
  // Vérification sur deux points éloignés
  for (let essaiN = 0; essaiN < 2; essaiN++) {
    const x = x0.map((v) => v + (Math.random() * 2 - 1) * (Math.abs(v) + 3) * 2);
    const p = essai(x);
    const pred = (g, b) => b + g.reduce((s, gi, i) => s + gi * (x[i] - x0[i]), 0);
    const proche = (a, b) => Math.abs(a - b) <= 1e-7 * (1 + Math.abs(a) + Math.abs(b));
    if (!proche(p.obj, pred(grad, base.obj))) return null;
    for (let k = 0; k < gradG.length; k++) if (!proche(p.ecarts[k], pred(gradG[k], base.ecarts[k]))) return null;
  }
  // obj(x) = c·x + c0 ; contrainte k : a_k·x + b_k  (op)  0
  const c0 = base.obj - grad.reduce((s, g, i) => s + g * x0[i], 0);
  return { c: grad, c0, A: gradG, b: base.ecarts.map((e, k) => e - gradG[k].reduce((s, g, i) => s + g * x0[i], 0)) };
}

/**
 * Simplexe en deux phases (règle de Bland) : max c·x, A x (<=|>=|=) b, x ≥ 0.
 * → { statut: 'optimal'|'impossible'|'non borne', x, z }
 */
export function simplexe(c, A, ops, b) {
  const m = A.length, n = c.length;
  // Normalise b ≥ 0
  A = A.map((l) => l.slice()); b = b.slice(); ops = ops.slice();
  for (let i = 0; i < m; i++) if (b[i] < 0) { A[i] = A[i].map((x) => -x); b[i] = -b[i]; ops[i] = ops[i] === '<=' ? '>=' : ops[i] === '>=' ? '<=' : '='; }
  // Colonnes : x (n), écarts (un par <= ou >=), artificielles (un par >= ou =)
  const nE = ops.filter((o) => o !== '=').length, nA = ops.filter((o) => o !== '<=').length;
  const N = n + nE + nA;
  const T = [], base = [];
  let ie = n, ia = n + nE;
  for (let i = 0; i < m; i++) {
    const l = new Array(N + 1).fill(0);
    for (let j = 0; j < n; j++) l[j] = A[i][j];
    if (ops[i] === '<=') { l[ie] = 1; base.push(ie++); }
    else if (ops[i] === '>=') { l[ie++] = -1; l[ia] = 1; base.push(ia++); }
    else { l[ia] = 1; base.push(ia++); }
    l[N] = b[i];
    T.push(l);
  }
  const pivoter = (r, k) => {
    const p = T[r][k];
    for (let j = 0; j <= N; j++) T[r][j] /= p;
    for (let i = 0; i < m; i++) if (i !== r && T[i][k] !== 0) { const f = T[i][k]; for (let j = 0; j <= N; j++) T[i][j] -= f * T[r][j]; }
    base[r] = k;
  };
  const EPS = 1e-9;
  // Maximise obj (vecteur sur les N colonnes) ; colonnes interdites exclues
  const optimiser = (obj, interdites) => {
    for (let iter = 0; iter < 5000; iter++) {
      // Coûts réduits
      let k = -1;
      for (let j = 0; j < N; j++) {
        if (interdites(j) || base.includes(j)) continue;
        let rc = obj[j];
        for (let i = 0; i < m; i++) rc -= obj[base[i]] * T[i][j];
        if (rc > EPS) { k = j; break; } // Bland : la première colonne qui améliore
      }
      if (k < 0) return 'optimal';
      let r = -1, meilleur = Infinity;
      for (let i = 0; i < m; i++) if (T[i][k] > EPS) { const q = T[i][N] / T[i][k]; if (q < meilleur - EPS || (Math.abs(q - meilleur) <= EPS && base[i] < base[r])) { meilleur = q; r = i; } }
      if (r < 0) return 'non borne';
      pivoter(r, k);
    }
    return 'optimal';
  };
  const estArt = (j) => j >= n + nE;
  if (nA) {
    const obj1 = new Array(N).fill(0); for (let j = n + nE; j < N; j++) obj1[j] = -1;
    optimiser(obj1, () => false);
    const somme = base.reduce((s, j, i) => s + (estArt(j) ? T[i][N] : 0), 0);
    if (somme > 1e-7 * (1 + b.reduce((s, x) => s + Math.abs(x), 0))) return { statut: 'impossible' };
    // Sort les artificielles restées dans la base (à zéro)
    for (let i = 0; i < m; i++) if (estArt(base[i])) { const k = T[i].findIndex((x, j) => j < n + nE && Math.abs(x) > EPS); if (k >= 0) pivoter(i, k); }
  }
  const obj2 = new Array(N).fill(0); for (let j = 0; j < n; j++) obj2[j] = c[j];
  const st = optimiser(obj2, estArt);
  if (st === 'non borne') return { statut: 'non borne' };
  const x = new Array(n).fill(0);
  base.forEach((j, i) => { if (j < n) x[j] = T[i][N]; });
  return { statut: 'optimal', x, z: c.reduce((s, ci, j) => s + ci * x[j], 0) };
}

function simplexeModele(lin, lignes, but, cible, positives, entiers, binaires, n) {
  // Variables libres : x = x⁺ − x⁻
  const libres = !positives;
  const nn = libres ? 2 * n : n;
  const etendre = (v) => (libres ? [...v, ...v.map((x) => -x)] : v.slice());
  const sens = but === 'min' ? -1 : 1;
  const c = but === 'valeur' ? new Array(nn).fill(0) : etendre(lin.c.map((x) => sens * x));
  const A0 = [], ops0 = [], b0 = [];
  lin.A.forEach((a, k) => { A0.push(etendre(a)); ops0.push(lignes[k].op); b0.push(-lin.b[k]); });
  if (but === 'valeur') { A0.push(etendre(lin.c)); ops0.push('='); b0.push(cible - lin.c0); }
  for (const i of binaires) { const l = new Array(nn).fill(0); l[i] = 1; if (libres) l[n + i] = -1; A0.push(l); ops0.push('<='); b0.push(1); if (libres) { const l2 = l.map((x) => -x); A0.push(l2); ops0.push('<='); b0.push(0); } }
  const valeurX = (x) => (libres ? x.slice(0, n).map((v, i) => v - x[n + i]) : x);
  // Séparation et évaluation pour les entiers
  let meilleur = null, noeuds = 0;
  const pile = [{ A: [], ops: [], b: [] }];
  while (pile.length && noeuds < 3000) {
    const nd = pile.pop(); noeuds++;
    const r = simplexe(c, [...A0, ...nd.A], [...ops0, ...nd.ops], [...b0, ...nd.b]);
    if (r.statut === 'non borne') return { ok: false, x: null, message: 'L\'objectif n\'a pas de limite : ajoutez des contraintes' };
    if (r.statut !== 'optimal') continue;
    if (meilleur && r.z <= meilleur.z + 1e-9) continue;
    const x = valeurX(r.x);
    const frac = [...entiers].find((i) => Math.abs(x[i] - Math.round(x[i])) > 1e-6);
    if (frac === undefined) { meilleur = { z: r.z, x: x.map((v, i) => (entiers.has(i) ? Math.round(v) : Math.abs(v) < 1e-12 ? 0 : v)) }; continue; }
    const l = new Array(nn).fill(0); l[frac] = 1; if (libres) l[n + frac] = -1;
    pile.push({ A: [...nd.A, l], ops: [...nd.ops, '>='], b: [...nd.b, Math.ceil(x[frac])] });
    pile.push({ A: [...nd.A, l], ops: [...nd.ops, '<='], b: [...nd.b, Math.floor(x[frac])] });
  }
  if (!meilleur) return { ok: false, x: null, message: 'Aucune solution ne respecte toutes les contraintes' };
  return { ok: true, x: meilleur.x, message: 'Solution optimale trouvée (modèle linéaire, méthode du simplexe)' + (entiers.size ? ' en nombres entiers' : '') };
}

// Nelder-Mead sur l'objectif pénalisé ; variables bornées à 0 si « positives » ; entiers arrondis à la fin.
function neldermead(essai, x0, lignes, but, cible, positives, entiers, binaires, maxEval) {
  const n = x0.length;
  let evals = 0;
  const proj = (x) => x.map((v, i) => { let w = positives && v < 0 ? 0 : v; if (binaires.has(i)) w = Math.min(1, Math.max(0, w)); return w; });
  const brut = (x) => {
    evals++;
    const p = essai(x);
    const v = p.ecarts.reduce((s, e, i) => s + violation(e, lignes[i].op) ** 2, 0);
    const o = !Number.isFinite(p.obj) ? 1e30 : but === 'max' ? -p.obj : but === 'min' ? p.obj : (p.obj - cible) ** 2;
    return { o, v };
  };
  let x = proj(x0.slice()), mu = 10;
  const pen = (r) => r.o + mu * r.v;
  let echelle = Math.max(1, ...x.map((v) => Math.abs(v)));
  for (let tour = 0; tour < 8 && evals < maxEval; tour++) {
    // Simplexe initial
    let pts = [x];
    for (let i = 0; i < n; i++) { const y = x.slice(); const pas = Math.abs(y[i]) > 1e-9 ? Math.abs(y[i]) * 0.25 : 0.25 * Math.min(1, echelle); y[i] += pas; pts.push(proj(y)); }
    let vals = pts.map((p) => pen(brut(p)));
    for (let it = 0; it < 400 * n && evals < maxEval; it++) {
      const ordre = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      pts = ordre.map((i) => pts[i]); vals = ordre.map((i) => vals[i]);
      const etendue = Math.abs(vals[n] - vals[0]), taille = Math.max(...pts.map((p) => Math.max(...p.map((v, i) => Math.abs(v - pts[0][i])))));
      if (etendue < 1e-12 * (1 + Math.abs(vals[0])) && taille < 1e-9 * (1 + Math.max(...pts[0].map(Math.abs)))) break;
      const cent = new Array(n).fill(0);
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) cent[i] += pts[k][i] / n;
      const vers = (t) => proj(cent.map((cv, i) => cv + t * (pts[n][i] - cv)));
      const xr = vers(-1), fr = pen(brut(xr));
      if (fr < vals[0]) { const xe = vers(-2), fe = pen(brut(xe)); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
      else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
      else {
        const xc = fr < vals[n] ? vers(-0.5) : vers(0.5), fc = pen(brut(xc));
        if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
        else for (let k = 1; k <= n; k++) { pts[k] = proj(pts[k].map((v, i) => pts[0][i] + 0.5 * (v - pts[0][i]))); vals[k] = pen(brut(pts[k])); }
      }
    }
    const ordre = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    x = pts[ordre[0]];
    const r = brut(x);
    echelle = Math.max(1e-6, ...x.map((v) => Math.abs(v)));
    if (r.v < 1e-14 && tour >= 1) break;
    mu *= 100;
  }
  // Entiers : arrondi, puis petits pas autour
  if (entiers.size) {
    x = x.map((v, i) => (entiers.has(i) ? Math.round(v) : v));
    let cour = brut(x), score = cour.o + 1e9 * cour.v;
    for (let passe = 0; passe < 3; passe++) {
      let mieux = false;
      for (const i of entiers) for (const d of [-1, 1]) {
        const y = proj(x.map((v, k) => (k === i ? v + d : v)));
        const r = brut(y), s = r.o + 1e9 * r.v;
        if (s < score - 1e-12) { x = y; score = s; mieux = true; }
      }
      if (!mieux) break;
    }
  }
  const fin = brut(x);
  const ok = fin.v < 1e-10 && (but !== 'valeur' || fin.o < 1e-12 * (1 + cible * cible));
  return { ok, x, message: ok ? 'Le Solveur a trouvé une solution (méthode non linéaire : optimum local, essayez un autre point de départ si besoin)' : 'Le Solveur n\'a pas trouvé de solution satisfaisante' };
}

// ===========================================================================
// Table de données
// ===========================================================================

/**
 * Calcule une table de données (Données > Analyse de scénarios > Table de données).
 * td : { plage: {r1,c1,r2,c2}, ligne: {r,c}|null (cellule d'entrée en ligne), colonne: {r,c}|null }
 * Écrit les résultats dans la plage et renvoie le nombre de cellules calculées.
 */
export function calculerTableDonnees(C, fi, td) {
  const f = C.feuilles[fi], p = td.plage;
  if (!td.ligne && !td.colonne) throw new Error('Indiquez au moins une cellule d\'entrée');
  if (p.r2 <= p.r1 || p.c2 <= p.c1) throw new Error('La plage doit contenir les valeurs à essayer et la formule');
  const entrees = [td.ligne, td.colonne].filter(Boolean);
  for (const e of entrees) { const cel = f.get(e.r, e.c); if (cel && cel.f != null) throw new Error('La cellule d\'entrée ' + adresse(e.r, e.c) + ' doit contenir une valeur, pas une formule'); if (e.r >= p.r1 && e.r <= p.r2 && e.c >= p.c1 && e.c <= p.c2) throw new Error('La cellule d\'entrée doit être hors de la table'); }
  const sauve = entrees.map((e) => { const cel = f.get(e.r, e.c); return cel ? { ...cel } : null; });
  const resultats = [];
  const essayer = (vals, formules) => {
    vals.forEach(([e, v]) => poser(C, fi, e.r, e.c, v));
    recalc(C);
    return formules.map(([r, c]) => C.evaluateur.valeur(fi, r, c));
  };
  // Les cellules résultats sont vidées d'abord (elles ne doivent pas entrer dans le calcul)
  const lire = (r, c) => C.valeur(fi, r, c);
  if (td.ligne && td.colonne) {
    const formule = [p.r1, p.c1];
    const vl = [], vc = [];
    for (let c = p.c1 + 1; c <= p.c2; c++) vl.push(lire(p.r1, c));
    for (let r = p.r1 + 1; r <= p.r2; r++) vc.push(lire(r, p.c1));
    for (let r = p.r1 + 1; r <= p.r2; r++) for (let c = p.c1 + 1; c <= p.c2; c++) f.set(r, c, { s: (f.get(r, c) || {}).s, z: (f.get(r, c) || {}).z });
    vc.forEach((y, i) => vl.forEach((x, j) => { resultats.push([p.r1 + 1 + i, p.c1 + 1 + j, essayer([[td.ligne, x], [td.colonne, y]], [formule])[0]]); }));
  } else if (td.colonne) {
    // Valeurs en colonne (à gauche), formules sur la ligne du haut
    const formules = []; for (let c = p.c1 + 1; c <= p.c2; c++) formules.push([p.r1, c]);
    const vals = []; for (let r = p.r1 + 1; r <= p.r2; r++) vals.push(lire(r, p.c1));
    for (let r = p.r1 + 1; r <= p.r2; r++) for (let c = p.c1 + 1; c <= p.c2; c++) f.set(r, c, { s: (f.get(r, c) || {}).s, z: (f.get(r, c) || {}).z });
    vals.forEach((v, i) => essayer([[td.colonne, v]], formules).forEach((y, j) => resultats.push([p.r1 + 1 + i, p.c1 + 1 + j, y])));
  } else {
    // Valeurs en ligne (en haut), formules dans la colonne de gauche
    const formules = []; for (let r = p.r1 + 1; r <= p.r2; r++) formules.push([r, p.c1]);
    const vals = []; for (let c = p.c1 + 1; c <= p.c2; c++) vals.push(lire(p.r1, c));
    for (let r = p.r1 + 1; r <= p.r2; r++) for (let c = p.c1 + 1; c <= p.c2; c++) f.set(r, c, { s: (f.get(r, c) || {}).s, z: (f.get(r, c) || {}).z });
    vals.forEach((v, j) => essayer([[td.ligne, v]], formules).forEach((y, i) => resultats.push([p.r1 + 1 + i, p.c1 + 1 + j, y])));
  }
  // Remet les cellules d'entrée
  entrees.forEach((e, i) => f.set(e.r, e.c, sauve[i]));
  // Format : celui de la formule calculée
  for (const [r, c, v] of resultats) {
    const o = f.get(r, c) || {};
    const fr = td.ligne && td.colonne ? [p.r1, p.c1] : td.colonne ? [p.r1, c] : [r, p.c1];
    const z = o.z || (f.get(fr[0], fr[1]) || {}).z;
    f.set(r, c, { s: o.s, z, v: v instanceof ErreurFormule ? v : v ?? null, tableDonnees: true });
  }
  recalc(C);
  return resultats.length;
}
/** Recalcule toutes les tables de données du classeur ; renvoie vrai si une valeur a changé. */
export function actualiserTablesDonnees(C) {
  let change = false;
  C.feuilles.forEach((f, fi) => {
    for (const td of f.tablesDonnees || []) {
      const avant = [];
      for (let r = td.plage.r1 + 1; r <= td.plage.r2; r++) for (let c = td.plage.c1 + 1; c <= td.plage.c2; c++) { const x = f.get(r, c); avant.push(x ? x.v : null); }
      try { calculerTableDonnees(C, fi, td); } catch { continue; }
      let k = 0;
      for (let r = td.plage.r1 + 1; r <= td.plage.r2; r++) for (let c = td.plage.c1 + 1; c <= td.plage.c2; c++) { const x = f.get(r, c); const a = avant[k++], b = x ? x.v : null; if (a !== b && !(a instanceof ErreurFormule && b instanceof ErreurFormule && a.code === b.code)) change = true; }
    }
  });
  return change;
}

// ===========================================================================
// Remplissage instantané (Ctrl+E)
// ===========================================================================

const SEP_MOTS = /[\s,;.\-_/@()|:]+/;
const CASSES = [['', (s) => s], ['maj', (s) => s.toUpperCase()], ['min', (s) => s.toLowerCase()], ['nom', (s) => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())]];
function morceaux(source, j) {
  const s = source == null ? '' : String(source);
  const out = [];
  const add = (nom, v, f) => { if (v) for (const [k, cf] of CASSES) out.push({ nom: nom + (k ? ':' + k : ''), v: cf(v), f: (t) => { const x = f(t); return x == null ? null : cf(x); } }); };
  add('c' + j, s, (t) => t);
  const mots = s.split(SEP_MOTS).filter(Boolean);
  const motsDe = (t) => String(t ?? '').split(SEP_MOTS).filter(Boolean);
  mots.forEach((m, i) => {
    add('c' + j + 'm' + i, m, (t) => motsDe(t)[i] ?? null);
    add('c' + j + 'm-' + (mots.length - i), m, (t) => { const w = motsDe(t); return w[w.length - (mots.length - i)] ?? null; });
    add('c' + j + 'i' + i, m[0], (t) => { const w = motsDe(t)[i]; return w ? w[0] : null; });
  });
  // Chiffres seuls (numéros de téléphone, codes…)
  const chiffres = s.replace(/\D/g, '');
  if (chiffres && chiffres !== s) add('c' + j + 'n', chiffres, (t) => String(t ?? '').replace(/\D/g, '') || null);
  return out;
}
/**
 * Devine la transformation qui donne les exemples, puis l'applique aux autres lignes.
 * exemples : [{ sources: [textes], sortie }] ; cibles : [[textes]] → sorties proposées (null si rien).
 */
export function remplissageInstantane(exemples, cibles) {
  if (!exemples.length) return null;
  const e0 = exemples[0], out0 = String(e0.sortie);
  const pieces = e0.sources.flatMap((s, j) => morceaux(s, j));
  // Pour chaque position de la sortie : morceaux qui s'y placent
  const L = out0.length;
  const depuis = Array.from({ length: L + 1 }, () => []);
  for (let p = 0; p < L; p++) for (const m of pieces) if (m.v.length && out0.startsWith(m.v, p)) depuis[p].push(m);
  // Programmes : suites de morceaux et de textes fixes (on préfère peu d'éléments et peu de texte fixe)
  const programmes = [];
  const chercher = (p, prog, fixe) => {
    if (programmes.length > 4000) return;
    if (p === L) { programmes.push(prog); return; }
    const opts = depuis[p].slice().sort((a, b) => b.v.length - a.v.length);
    for (const m of opts) chercher(p + m.v.length, [...prog, m], fixe);
    // Texte fixe : jusqu'au prochain endroit où un morceau peut commencer (ou un seul caractère)
    let q = p + 1;
    while (q < L && !depuis[q].length) q++;
    const dernier = prog[prog.length - 1];
    if (dernier && dernier.fixe != null) return; // pas deux textes fixes de suite
    chercher(q, [...prog, { fixe: out0.slice(p, q) }], fixe + q - p);
  };
  chercher(0, [], 0);
  const appliquer = (prog, sources) => {
    let s = '';
    for (const m of prog) {
      if (m.fixe != null) { s += m.fixe; continue; }
      const j = +/^c(\d+)/.exec(m.nom)[1];
      const x = m.f(sources[j]);
      if (x == null) return null;
      s += x;
    }
    return s;
  };
  const cout = (prog) => prog.reduce((s, m) => s + (m.fixe != null ? 2 + m.fixe.length : 1), 0);
  programmes.sort((a, b) => cout(a) - cout(b));
  const bon = programmes.find((prog) => prog.some((m) => m.fixe == null) && exemples.every((e) => appliquer(prog, e.sources) === String(e.sortie)));
  if (!bon) return null;
  return cibles.map((src) => (src.every((x) => x == null || x === '') ? null : appliquer(bon, src)));
}

// ===========================================================================
// Audit des formules
// ===========================================================================

/** Plages lues par la formule d'une cellule : [{ fi, r1, c1, r2, c2 }]. */
export function antecedents(C, fi, r, c) {
  const cel = C.cellule(fi, r, c);
  if (!cel || cel.f == null) return [];
  const E = C.evaluateur, out = [];
  const sauve = E.courant;
  E.courant = { feuille: fi, r, c };
  const vus = new Set();
  const visiter = (n, prof = 0) => {
    if (!n || typeof n !== 'object' || prof > 20) return;
    try {
      if (n.k === 'ref') { const p = E.plageDepuisToken({ feuille: n.feuille, v: n.plage, debord: n.debord }); out.push({ fi: p.feuille, r1: p.r1, c1: p.c1, r2: Math.min(p.r2, p.r1 + 1048575), c2: p.c2 }); return; }
      if (n.k === 'tref') { const p = E.plageTableau(n.table, n.spec); out.push({ fi: p.feuille, r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2 }); return; }
      if (n.k === 'nom') {
        const def = C.nom(n.v, fi);
        if (def !== undefined && typeof def === 'string' && !vus.has(n.v.toUpperCase())) { vus.add(n.v.toUpperCase()); visiter(analyser('=' + def.replace(/^=/, '')), prof + 1); }
        else if (def === undefined && C.tableau && C.tableau(n.v)) { const p = E.plageTableau(n.v, '[#Données]'); out.push({ fi: p.feuille, r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2 }); }
        return;
      }
    } catch { return; }
    for (const k of ['a', 'b']) if (n[k]) visiter(n[k], prof);
    if (n.args) n.args.forEach((x) => visiter(x, prof));
    if (n.lignes) n.lignes.forEach((l) => l.forEach((x) => visiter(x, prof)));
  };
  try { visiter(analyser(cel.f)); } catch { /* formule illisible */ }
  E.courant = sauve;
  return out;
}
/** Cellules dont la formule lit cette cellule : [{ fi, r, c }]. */
export function dependants(C, fi, r, c) {
  const out = [];
  C.feuilles.forEach((f, k) => f.chaque((rr, cc, cel) => {
    if (cel.f == null || out.length > 5000) return;
    if (antecedents(C, k, rr, cc).some((p) => p.fi === fi && r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2)) out.push({ fi: k, r: rr, c: cc });
  }));
  return out;
}

// Réécriture d'un arbre en texte (noms français, « ; »)
const FR = {}; for (const [fr, en] of Object.entries(ALIAS)) if (!FR[en] || fr.length < FR[en].length) FR[en] = fr;
function texteValeur(v) {
  if (v instanceof ErreurFormule) return v.code;
  if (v instanceof Plage) { if (v.taille === 1) return texteValeur(v.valeur(0, 0)); const m = v.taille <= 12 ? v.matrice() : null; return m ? '{' + m.map((l) => l.map(texteValeur).join(';')).join('|') + '}' : adresse(v.r1, v.c1) + ':' + adresse(v.r2, v.c2); }
  if (Array.isArray(v)) return '{' + v.slice(0, 6).map((l) => l.slice(0, 6).map(texteValeur).join(';')).join('|') + (v.length > 6 ? '…' : '') + '}';
  if (typeof v === 'string') return '"' + v.replace(/"/g, '""') + '"';
  if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
  if (v == null) return '0';
  if (typeof v === 'number') return versTexte(v);
  return String(v);
}
function imprimer(n, remplace, prochain) {
  const P = (x) => imprimer(x, remplace, prochain);
  let t;
  if (remplace.has(n)) t = remplace.get(n);
  else switch (n.k) {
    case 'num': t = versTexte(n.v); break;
    case 'str': t = '"' + n.v.replace(/"/g, '""') + '"'; break;
    case 'bool': t = n.v ? 'VRAI' : 'FAUX'; break;
    case 'err': t = n.v; break;
    case 'vide': t = ''; break;
    case 'ref': t = (n.feuille ? (/^[A-Za-z_][\w.]*$/.test(n.feuille) ? n.feuille : "'" + n.feuille + "'") + '!' : '') + n.plage + (n.debord ? '#' : ''); break;
    case 'tref': t = (n.table || '') + n.spec; break;
    case 'nom': t = n.v; break;
    case 'fn': t = (FR[n.nom] || n.nom) + '(' + n.args.map(P).join(';') + ')'; break;
    case 'bin': t = P(n.a) + (n.op === ':' ? ':' : ' ' + n.op + ' ') + P(n.b); break;
    case 'un': t = '-' + P(n.a); break;
    case 'pct': t = P(n.a) + '%'; break;
    case 'inter': t = '@' + P(n.a); break;
    case 'tab': t = '{' + n.lignes.map((l) => l.map(P).join(';')).join('|') + '}'; break;
    default: t = '?';
  }
  return n === prochain ? '⟦' + t + '⟧' : t;
}
/**
 * Évaluation pas à pas (comme « Évaluer la formule » d'Excel) : liste des étapes, chacune avec
 * le texte de la formule où la partie qui va être calculée est entre ⟦ ⟧.
 */
export function etapesEvaluation(C, fi, r, c) {
  const cel = C.cellule(fi, r, c);
  if (!cel || cel.f == null) return [];
  let arbre;
  try { arbre = analyser(cel.f); } catch (e) { return [{ texte: cel.f, erreur: e.message }]; }
  // Ordre : enfants avant parents (références, fonctions et opérations)
  const ordre = [];
  const visiter = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.k === 'bin' && n.op === ':') { ordre.push(n); return; }
    for (const k of ['a', 'b']) if (n[k]) visiter(n[k]);
    if (n.args) n.args.forEach(visiter);
    if (['ref', 'tref', 'nom', 'fn', 'bin', 'un', 'pct', 'inter'].includes(n.k)) ordre.push(n);
  };
  visiter(arbre);
  const E = C.evaluateur, sauve = E.courant, remplace = new Map(), etapes = [];
  E.courant = { feuille: fi, r, c };
  try {
    for (const n of ordre) {
      etapes.push({ texte: '=' + imprimer(arbre, remplace, n) });
      let v;
      try { v = E.evaluer(n); } catch (e) { v = e instanceof ErreurFormule ? e : new ErreurFormule('#VALUE!'); }
      remplace.set(n, texteValeur(v));
    }
  } finally { E.courant = sauve; }
  etapes.push({ texte: '=' + imprimer(arbre, remplace, null), fin: true, resultat: formater(C.valeur(fi, r, c), cel.z) });
  return etapes;
}

/** Vérification des erreurs : [{ fi, r, c, type, message }] */
export function verifierErreurs(C, fi) {
  const f = C.feuilles[fi], out = [];
  f.chaque((r, c, cel) => {
    if (out.length > 500) return;
    if (cel.f != null) {
      const v = C.valeur(fi, r, c);
      if (v instanceof ErreurFormule) {
        // Seulement là où l'erreur naît : aucun antécédent n'est lui-même en erreur
        const vient = antecedents(C, fi, r, c).some((p) => { if ((p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1) > 2000) return false; for (let i = p.r1; i <= p.r2; i++) for (let j = p.c1; j <= p.c2; j++) if (C.valeur(p.fi, i, j) instanceof ErreurFormule) return true; return false; });
        if (!vient) out.push({ fi, r, c, type: 'erreur', message: v.code + ' : ' + ({ '#DIV/0!': 'division par zéro', '#VALUE!': 'type de valeur incorrect (texte au lieu d\'un nombre ?)', '#REF!': 'référence à une cellule supprimée', '#NAME?': 'nom ou fonction inconnu', '#N/A': 'valeur introuvable', '#NUM!': 'nombre impossible', '#SPILL!': 'le résultat ne peut pas déborder : cellules occupées', '#CYCLE!': 'référence circulaire' }[v.code] || 'erreur') });
      }
      // Formule différente de ses voisines du dessus et du dessous (qui, elles, se ressemblent)
      const h = f.get(r - 1, c), b = f.get(r + 1, c);
      if (h && b && h.f != null && b.f != null && decalerFormule(h.f, 2, 0) === b.f && decalerFormule(h.f, 1, 0) !== cel.f)
        out.push({ fi, r, c, type: 'incoherente', message: 'Formule différente de celles qui l\'entourent (' + decalerFormule(h.f, 1, 0) + ')', proposition: decalerFormule(h.f, 1, 0) });
    } else if (typeof cel.v === 'string' && /^\s*[-+]?\d+([.,]\d+)?\s*$/.test(cel.v) && cel.z !== '@') {
      out.push({ fi, r, c, type: 'texte', message: 'Nombre stocké sous forme de texte', proposition: +cel.v.trim().replace(',', '.') });
    }
  });
  return out.sort((a, b) => a.r - b.r || a.c - b.c);
}
