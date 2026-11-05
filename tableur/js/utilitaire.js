// Utilitaire d'analyse (comme le complément d'Excel) : statistiques descriptives, histogramme, régression,
// corrélation et covariance, moyenne mobile, lissage exponentiel, génération de nombres aléatoires, tests t,
// test F, ANOVA à un facteur, rang et centile. Sans DOM : chaque outil renvoie un tableau de résultats
// { lignes: [[valeur]], titres: [indices des lignes de titre], formats: { 'r,c': '0.00%' } }.

import { STATS } from './formules.js';

const { tInv, tCdf, fCdf, normSInv, regression, quantile, variance } = STATS;
const somme = (v) => v.reduce((a, b) => a + b, 0);
const moyenne = (v) => somme(v) / v.length;
const fInv = (p, d1, d2) => { let a = 0, b = 10; while (fCdf(b, d1, d2) < p && b < 1e12) b *= 2; for (let i = 0; i < 200; i++) { const m = (a + b) / 2; if (fCdf(m, d1, d2) < p) a = m; else b = m; } return (a + b) / 2; };

export const OUTILS = [
  ['descriptives', 'Statistiques descriptives'], ['histogramme', 'Histogramme'], ['regression', 'Régression linéaire'],
  ['correlation', 'Matrice de corrélation'], ['covariance', 'Matrice de covariance'], ['moyenneMobile', 'Moyenne mobile'],
  ['lissage', 'Lissage exponentiel'], ['aleatoire', 'Génération de nombres aléatoires'], ['testT', 'Test t (deux échantillons)'],
  ['testF', 'Test F (deux variances)'], ['anova', 'ANOVA à un facteur'], ['rang', 'Rang et centile'],
];

/** Colonnes de la plage d'entrée : [{ nom, valeurs }] (la première ligne donne les noms si demandé). */
export function colonnesDe(m, etiquettes, parLignes = false) {
  if (parLignes) m = m[0].map((_, j) => m.map((l) => l[j]));
  const n = m[0] ? m[0].length : 0, out = [];
  for (let j = 0; j < n; j++) {
    const nom = etiquettes ? String(m[0][j] ?? 'Colonne ' + (j + 1)) : 'Colonne ' + (j + 1);
    const valeurs = m.slice(etiquettes ? 1 : 0).map((l) => l[j]).filter((v) => typeof v === 'number');
    out.push({ nom, valeurs });
  }
  return out;
}

export function descriptives(cols, { confiance = 0.95, kieme = 0 } = {}) {
  const lignes = [['', ...cols.map((c) => c.nom)]];
  const stat = (nom, fn) => lignes.push([nom, ...cols.map((c) => { try { const v = fn(c.valeurs); return Number.isFinite(v) ? v : '#N/A'; } catch { return '#N/A'; } })]);
  stat('Moyenne', moyenne);
  stat('Erreur-type', (v) => Math.sqrt(variance(v, false) / v.length));
  stat('Médiane', (v) => quantile(v, 0.5, false));
  stat('Mode', (v) => { const n = new Map(); let best = null, max = 1; for (const x of v) { const k = (n.get(x) || 0) + 1; n.set(x, k); if (k > max) { max = k; best = x; } } if (best === null) throw new Error(); return best; });
  stat('Écart-type', (v) => Math.sqrt(variance(v, false)));
  stat('Variance de l\'échantillon', (v) => variance(v, false));
  stat('Kurtosis (aplatissement)', (v) => { const n = v.length, m = moyenne(v), s = Math.sqrt(variance(v, false)); const k = somme(v.map((x) => ((x - m) / s) ** 4)); return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * k - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)); });
  stat('Coefficient d\'asymétrie', (v) => { const n = v.length, m = moyenne(v), s = Math.sqrt(variance(v, false)); return n / ((n - 1) * (n - 2)) * somme(v.map((x) => ((x - m) / s) ** 3)); });
  stat('Plage', (v) => Math.max(...v) - Math.min(...v));
  stat('Minimum', (v) => Math.min(...v));
  stat('Maximum', (v) => Math.max(...v));
  stat('Somme', somme);
  stat('Nombre d\'échantillons', (v) => v.length);
  if (kieme > 0) { stat(kieme + '-ième plus grande valeur', (v) => [...v].sort((a, b) => b - a)[kieme - 1]); stat(kieme + '-ième plus petite valeur', (v) => [...v].sort((a, b) => a - b)[kieme - 1]); }
  stat('Niveau de confiance (' + String(Math.round(confiance * 1000) / 10).replace('.', ',') + ' %)', (v) => Math.abs(tInv((1 - confiance) / 2, v.length - 1)) * Math.sqrt(variance(v, false) / v.length));
  return { lignes, titres: [0] };
}

export function histogramme(valeurs, classes, { cumul = true, pareto = false } = {}) {
  let bornes = classes && classes.length ? [...classes].sort((a, b) => a - b) : null;
  if (!bornes) {
    // Comme Excel : environ √n classes de même largeur entre le minimum et le maximum
    const n = valeurs.length, k = Math.max(1, Math.round(Math.sqrt(n))), mi = Math.min(...valeurs), ma = Math.max(...valeurs), pas = (ma - mi) / k || 1;
    bornes = Array.from({ length: k }, (_, i) => mi + pas * (i + 1));
  }
  const freq = Array(bornes.length + 1).fill(0);
  for (const x of valeurs) { let i = 0; while (i < bornes.length && x > bornes[i]) i++; freq[i]++; }
  let lignes = bornes.map((b, i) => [b, freq[i]]);
  lignes.push(['Autres', freq[bornes.length]]);
  if (pareto) lignes.sort((a, b) => b[1] - a[1]);
  let c = 0;
  const total = valeurs.length || 1;
  if (cumul) lignes = lignes.map((l) => { c += l[1]; return [...l, c / total]; });
  const formats = {};
  if (cumul) lignes.forEach((_, i) => { formats[(i + 1) + ',2'] = '0.00%'; });
  return { lignes: [['Classes', 'Fréquence', ...(cumul ? ['% cumulé'] : [])], ...lignes], titres: [0], formats };
}

export function regressionLineaire(y, X, noms, { constante = true, confiance = 0.95, residus = false } = {}) {
  const n = y.length;
  if (X.some((l) => l.length !== X[0].length) || X.length !== n) throw new Error('Les plages X et Y doivent avoir le même nombre de lignes');
  if (n < X[0].length + 2) throw new Error('Pas assez d\'observations');
  const r = regression(y.map((v) => [v]), X, constante);
  const k = r.k, dfReg = k, dfRes = r.df, dfTot = dfReg + dfRes;
  const cmReg = r.ssreg / dfReg, cmRes = r.ssres / dfRes, F = cmReg / cmRes;
  const t95 = Math.abs(tInv((1 - confiance) / 2, dfRes));
  const coef = constante ? [r.b[k], ...r.b.slice(0, k)] : [0, ...r.b.slice(0, k)];
  const se = constante ? [r.se[k], ...r.se.slice(0, k)] : ['#N/A', ...r.se.slice(0, k)];
  const pc = String(Math.round(confiance * 1000) / 10).replace('.', ',');
  const lignes = [
    ['RAPPORT DÉTAILLÉ'], [],
    ['Statistiques de la régression'],
    ['Coefficient de détermination multiple', Math.sqrt(Math.max(0, r.r2))],
    ['Coefficient de détermination R^2', r.r2],
    ['Coefficient de détermination R^2 ajusté', 1 - (1 - r.r2) * (n - (constante ? 1 : 0)) / dfRes],
    ['Erreur-type', r.sey],
    ['Observations', n], [],
    ['ANALYSE DE VARIANCE'],
    ['', 'Degré de liberté', 'Somme des carrés', 'Moyenne des carrés', 'F', 'Valeur critique de F'],
    ['Régression', dfReg, r.ssreg, cmReg, F, 1 - fCdf(F, dfReg, dfRes)],
    ['Résidus', dfRes, r.ssres, cmRes],
    ['Total', dfTot, r.ssreg + r.ssres], [],
    ['', 'Coefficients', 'Erreur-type', 'Statistique t', 'Probabilité', 'Limite inférieure pour seuil de confiance = ' + pc + ' %', 'Limite supérieure pour seuil de confiance = ' + pc + ' %'],
  ];
  ['Constante', ...noms].forEach((nom, i) => {
    if (i === 0 && !constante) { lignes.push([nom, 0, '#N/A', '#N/A', '#N/A', '#N/A', '#N/A']); return; }
    const t = coef[i] / se[i];
    lignes.push([nom, coef[i], se[i], t, 2 * (1 - tCdf(Math.abs(t), dfRes)), coef[i] - t95 * se[i], coef[i] + t95 * se[i]]);
  });
  const titres = [0, 2, 9, 10, 15];
  if (residus) {
    lignes.push([], ['ANALYSE DES RÉSIDUS'], ['Observation', 'Prévisions', 'Résidus', 'Résidus normalisés']);
    titres.push(lignes.length - 2, lignes.length - 1);
    const sres = Math.sqrt(r.ssres / (n - 1));
    X.forEach((l, i) => { let p = constante ? r.b[k] : 0; for (let j = 0; j < k; j++) p += l[j] * r.b[j]; lignes.push([i + 1, p, y[i] - p, (y[i] - p) / sres]); });
  }
  return { lignes, titres };
}

export function matrice(cols, covariance) {
  const n = cols.length, lignes = [['', ...cols.map((c) => c.nom)]];
  for (let i = 0; i < n; i++) {
    const l = [cols[i].nom];
    for (let j = 0; j < n; j++) {
      if (j > i) { l.push(''); continue; }
      const a = cols[i].valeurs, b = cols[j].valeurs, m = Math.min(a.length, b.length), ma = moyenne(a.slice(0, m)), mb = moyenne(b.slice(0, m));
      let sab = 0, saa = 0, sbb = 0;
      for (let q = 0; q < m; q++) { sab += (a[q] - ma) * (b[q] - mb); saa += (a[q] - ma) ** 2; sbb += (b[q] - mb) ** 2; }
      l.push(covariance ? sab / m : sab / Math.sqrt(saa * sbb));
    }
    lignes.push(l);
  }
  return { lignes, titres: [0] };
}

export function moyenneMobile(valeurs, intervalle = 3, { erreurs = false } = {}) {
  const lignes = [['Moyenne mobile (' + intervalle + ')', ...(erreurs ? ['Erreur-type'] : [])]];
  valeurs.forEach((_, i) => {
    if (i < intervalle - 1) { lignes.push(['#N/A', ...(erreurs ? ['#N/A'] : [])]); return; }
    const f = valeurs.slice(i - intervalle + 1, i + 1), m = moyenne(f);
    let e = '#N/A';
    if (erreurs && i >= 2 * intervalle - 2) { let s = 0; for (let k = i - intervalle + 1; k <= i; k++) { const mm = moyenne(valeurs.slice(k - intervalle + 1, k + 1)); s += (valeurs[k] - mm) ** 2; } e = Math.sqrt(s / intervalle); }
    lignes.push([m, ...(erreurs ? [e] : [])]);
  });
  return { lignes, titres: [0] };
}

export function lissage(valeurs, amortissement = 0.3) {
  const a = 1 - amortissement, lignes = [['Lissage exponentiel (α = ' + String(Math.round(a * 1000) / 1000).replace('.', ',') + ')'], ['#N/A']];
  let p = valeurs[0];
  for (let i = 1; i < valeurs.length; i++) { lignes.push([p]); p = a * valeurs[i] + amortissement * p; }
  return { lignes, titres: [0] };
}

/** Générateur pseudo-aléatoire à graine (mulberry32) : la même graine redonne les mêmes tirages. */
function generateur(graine) {
  if (!graine) return Math.random;
  let t = graine >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
export const LOIS_ALEA = [['uniforme', 'Uniforme (entre a et b)'], ['normale', 'Normale (moyenne, écart-type)'], ['bernoulli', 'Bernoulli (p)'], ['binomiale', 'Binomiale (p, n)'], ['poisson', 'Poisson (λ)'], ['exponentielle', 'Exponentielle (λ)'], ['lognormale', 'Lognormale (μ, σ)']];
export function aleatoire(nbVariables, nbNombres, loi, a, b, graine) {
  const u = generateur(graine);
  const normale = () => normSInv(Math.min(1 - 1e-16, Math.max(1e-16, u())));
  const tirer = () => {
    switch (loi) {
      case 'normale': return a + b * normale();
      case 'lognormale': return Math.exp(a + b * normale());
      case 'bernoulli': return u() < a ? 1 : 0;
      case 'binomiale': { let k = 0; for (let i = 0; i < b; i++) if (u() < a) k++; return k; }
      case 'poisson': { const L = Math.exp(-a); let k = 0, p = 1; do { k++; p *= u(); } while (p > L); return k - 1; }
      case 'exponentielle': return -Math.log(1 - u()) / a;
      default: return a + (b - a) * u();
    }
  };
  const lignes = [Array.from({ length: nbVariables }, (_, j) => 'Variable ' + (j + 1))];
  for (let i = 0; i < nbNombres; i++) lignes.push(Array.from({ length: nbVariables }, tirer));
  return { lignes, titres: [0] };
}

export const TYPES_TEST_T = [['apparies', 'Observations appariées'], ['egales', 'Variances égales'], ['inegales', 'Variances inégales (Welch)']];
export function testT(x, y, type = 'egales', { difference = 0, alpha = 0.05, noms = ['Variable 1', 'Variable 2'] } = {}) {
  const n1 = x.length, n2 = y.length, m1 = moyenne(x), m2 = moyenne(y), v1 = variance(x, false), v2 = variance(y, false);
  let t, df, extra = [];
  if (type === 'apparies') {
    if (n1 !== n2) throw new Error('Les deux échantillons doivent avoir le même nombre de valeurs');
    const d = x.map((v, i) => v - y[i]), md = moyenne(d), sd = Math.sqrt(variance(d, false));
    const mx = moyenne(x), my = moyenne(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n1; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    extra = [['Coefficient de corrélation de Pearson', sxy / Math.sqrt(sxx * syy)]];
    t = (md - difference) / (sd / Math.sqrt(n1)); df = n1 - 1;
  } else if (type === 'egales') {
    const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    extra = [['Variance pondérée', sp]];
    t = (m1 - m2 - difference) / Math.sqrt(sp * (1 / n1 + 1 / n2)); df = n1 + n2 - 2;
  } else {
    const q1 = v1 / n1, q2 = v2 / n2;
    t = (m1 - m2 - difference) / Math.sqrt(q1 + q2); df = Math.round((q1 + q2) ** 2 / (q1 * q1 / (n1 - 1) + q2 * q2 / (n2 - 1)));
  }
  const p1 = 1 - tCdf(Math.abs(t), df);
  const titre = { apparies: 'Test d\'égalité des espérances : observations pairées', egales: 'Test d\'égalité des espérances : deux observations de variances égales', inegales: 'Test d\'égalité des espérances : deux observations de variances différentes' }[type];
  const lignes = [[titre], [], ['', ...noms], ['Moyenne', m1, m2], ['Variance', v1, v2], ['Observations', n1, n2], ...extra,
    ['Différence hypothétique des moyennes', difference], ['Degré de liberté', df], ['Statistique t', t],
    ['P(T<=t) unilatéral', p1], ['Valeur critique de t (unilatéral)', Math.abs(tInv(alpha, df))],
    ['P(T<=t) bilatéral', 2 * p1], ['Valeur critique de t (bilatéral)', Math.abs(tInv(alpha / 2, df))]];
  return { lignes, titres: [0, 2] };
}

export function testF(x, y, { alpha = 0.05, noms = ['Variable 1', 'Variable 2'] } = {}) {
  const v1 = variance(x, false), v2 = variance(y, false), F = v1 / v2, d1 = x.length - 1, d2 = y.length - 1;
  const c = fCdf(F, d1, d2), p = F >= 1 ? 1 - c : c;
  const lignes = [['Test d\'égalité des variances (F)'], [], ['', ...noms], ['Moyenne', moyenne(x), moyenne(y)], ['Variance', v1, v2], ['Observations', x.length, y.length],
    ['Degré de liberté', d1, d2], ['F', F], ['P(F<=f) unilatéral', p], ['Valeur critique pour F (unilatéral)', F >= 1 ? fInv(1 - alpha, d1, d2) : fInv(alpha, d1, d2)]];
  return { lignes, titres: [0, 2] };
}

export function anova(cols, { alpha = 0.05 } = {}) {
  const k = cols.length, tous = cols.flatMap((c) => c.valeurs), N = tous.length, mg = moyenne(tous);
  let sce = 0, scr = 0;
  for (const c of cols) { const m = moyenne(c.valeurs); sce += c.valeurs.length * (m - mg) ** 2; scr += somme(c.valeurs.map((x) => (x - m) ** 2)); }
  const d1 = k - 1, d2 = N - k, F = (sce / d1) / (scr / d2);
  const lignes = [['Analyse de variance : un facteur'], [], ['RAPPORT DÉTAILLÉ'], ['Groupes', 'Nombre d\'échantillons', 'Somme', 'Moyenne', 'Variance'],
    ...cols.map((c) => [c.nom, c.valeurs.length, somme(c.valeurs), moyenne(c.valeurs), c.valeurs.length > 1 ? variance(c.valeurs, false) : '#N/A']), [],
    ['ANALYSE DE VARIANCE'], ['Source des variations', 'Somme des carrés', 'Degré de liberté', 'Moyenne des carrés', 'F', 'Probabilité', 'Valeur critique pour F'],
    ['Entre groupes', sce, d1, sce / d1, F, 1 - fCdf(F, d1, d2), fInv(1 - alpha, d1, d2)], ['À l\'intérieur des groupes', scr, d2, scr / d2], [], ['Total', sce + scr, N - 1]];
  return { lignes, titres: [0, 2, 3, 5 + k, 6 + k] };
}

export function rangCentile(col) {
  const v = col.valeurs.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x);
  const n = v.length, lignes = [['Point', col.nom, 'Rang', 'Pourcentage']], formats = {};
  v.forEach((e, k) => {
    const rang = v.findIndex((o) => o.x === e.x) + 1, nbInf = v.filter((o) => o.x < e.x).length;
    lignes.push([e.i + 1, e.x, rang, n > 1 ? nbInf / (n - 1) : 1]);
    formats[(k + 1) + ',3'] = '0.00%';
  });
  return { lignes, titres: [0], formats };
}
