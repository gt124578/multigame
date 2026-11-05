// Gestionnaire de scénarios (Données > Analyse de scénarios), comme Excel : un scénario donne des valeurs à des cellules
// variables ; on l'affiche, et la synthèse compare les cellules résultantes d'un scénario à l'autre. Sans DOM.
//
// f.scenarios = [{ nom, cellules: 'B2:B4;D2', valeurs: ['5%', '1000', …], commentaire }]

import { parsePlage, adresse } from './formules.js';

/** Cellules d'une liste d'adresses « B2:B4;D2 » (ordre de lecture, lignes puis colonnes). */
export function cellulesDe(texte) {
  const out = [];
  for (const t of String(texte || '').split(/[;\s]+/).filter(Boolean)) {
    const p = parsePlage(t.replace(/\$/g, '').replace(/^.*!/, ''));
    if (!p) throw new Error('Adresse illisible : ' + t);
    for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) out.push({ r, c });
  }
  if (out.length > 32) throw new Error('32 cellules variables au plus par scénario (comme Excel)');
  return out;
}
/** Saisies actuelles des cellules variables (ce qui serait tapé au clavier). */
export function valeursActuelles(classeur, fi, cellules) {
  return cellulesDe(cellules).map(({ r, c }) => classeur.saisie(fi, r, c) ?? '');
}
export function appliquer(classeur, fi, sc) {
  const cs = cellulesDe(sc.cellules);
  cs.forEach(({ r, c }, i) => classeur.saisir(fi, r, c, sc.valeurs[i] ?? ''));
}
/**
 * Synthèse : matrice prête à écrire dans une feuille. resultats : adresses des cellules résultantes.
 * Les saisies de départ sont remises à la fin.
 */
export function synthese(classeur, fi, scenarios, resultats) {
  const toutes = new Map();
  for (const sc of scenarios) for (const x of cellulesDe(sc.cellules)) toutes.set(x.r + ',' + x.c, x);
  const vars = [...toutes.values()], res = resultats ? cellulesDe(resultats) : [];
  const depart = vars.map(({ r, c }) => classeur.saisie(fi, r, c) ?? '');
  const colonne = (lire) => [...vars.map(({ r, c }) => lire(r, c)), ...res.map(({ r, c }) => classeur.valeur(fi, r, c))];
  const actuelles = colonne((r, c) => classeur.valeur(fi, r, c));
  const cols = [];
  try {
    for (const sc of scenarios) {
      appliquer(classeur, fi, sc);
      classeur.evaluateur.invalider();
      cols.push(colonne((r, c) => classeur.valeur(fi, r, c)));
    }
  } finally {
    vars.forEach(({ r, c }, i) => classeur.saisir(fi, r, c, depart[i]));
    classeur.evaluateur.invalider();
  }
  const lignes = [['Synthèse de scénarios', '', 'Valeurs actuelles :', ...scenarios.map((s) => s.nom)]];
  lignes.push(['Cellules variables :', '', '', ...scenarios.map(() => '')]);
  vars.forEach((x, i) => lignes.push(['', adresse(x.r, x.c, true, true), actuelles[i], ...cols.map((k) => k[i])]));
  if (res.length) {
    lignes.push(['Cellules résultantes :', '', '', ...scenarios.map(() => '')]);
    res.forEach((x, j) => lignes.push(['', adresse(x.r, x.c, true, true), actuelles[vars.length + j], ...cols.map((k) => k[vars.length + j])]));
  }
  // Formats des cellules d'origine (7 % reste 7 %, les montants gardent leurs décimales)
  const formats = {}, fe = classeur.feuilles[fi];
  const poser = (i, x) => { const z = (fe.get(x.r, x.c) || {}).z; if (z) for (let j = 2; j < 3 + scenarios.length; j++) formats[i + ',' + j] = z; };
  vars.forEach((x, i) => poser(2 + i, x));
  res.forEach((x, j) => poser(3 + vars.length + j, x));
  return { lignes, formats, nbVariables: vars.length, nbResultats: res.length };
}
