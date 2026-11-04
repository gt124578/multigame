// Tableaux croisés dynamiques, sans DOM (testés par tools/test-tableur.mjs).
//
// Spécification (rangée dans feuille.tcd de la feuille où le tableau est posé) :
//   { id, source: 'Données!A1:F500', dest: { r, c },
//     lignes: ['Région', 'Produit'], colonnes: ['Année'],
//     valeurs: [{ champ: 'Prime', fn: 'somme', affichage: 'normal' }],
//     filtres: [{ champ: 'Sexe', visibles: ['F'] }],     // visibles : null = tout
//     totauxLignes: true, totauxColonnes: true, sousTotaux: true,
//     zone: { r1, c1, r2, c2 } }                          // cellules écrites la dernière fois
// Les champs sont désignés par le texte de leur en-tête : le tableau suit la source si ses colonnes bougent.
// Le résultat est écrit en valeurs dans la feuille (comme le tableau d'Excel, qu'on « actualise »).

import { ErreurFormule, formater, parsePlage } from './formules.js';
import { comparerTri } from './donnees.js';

export const FONCTIONS_TCD = [['somme', 'Somme'], ['nbval', 'Nombre'], ['moyenne', 'Moyenne'], ['max', 'Max'], ['min', 'Min'], ['produit', 'Produit'], ['nb', 'Nb (nombres)'], ['ecartype', 'Écart type'], ['var', 'Variance']];
export const AFFICHAGES_TCD = [['normal', 'Valeur'], ['pctTotal', '% du total général'], ['pctColonne', '% du total de la colonne'], ['pctLigne', '% du total de la ligne']];
const NOM_FN = Object.fromEntries(FONCTIONS_TCD);
export const libelleValeur = (v) => (NOM_FN[v.fn] || 'Somme') + ' de ' + v.champ;

const VIDE = '(vide)';
const STYLE_ENTETE = { gras: true, fond: '#dbe5f1' };
const STYLE_TOTAL = { gras: true, fond: '#eef3fa' };
const STYLE_GENERAL = { gras: true, fond: '#dbe5f1', bordures: { h: 'thin' } };

/** Feuille et plage de la source : { fi, p } ou une erreur. */
export function resoudreSource(classeur, source, fiParDefaut = 0) {
  let txt = String(source || '').trim().replace(/^=/, '');
  let fi = fiParDefaut;
  const bang = txt.lastIndexOf('!');
  if (bang > 0) {
    const nom = txt.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
    fi = classeur.indexFeuille(nom);
    if (fi < 0) throw new Error('Feuille « ' + nom + ' » introuvable');
    txt = txt.slice(bang + 1);
  } else if (classeur.nom && classeur.nom(txt, fi)) return resoudreSource(classeur, classeur.nom(txt, fi), fi);
  const p = parsePlage(txt.replace(/\$/g, ''));
  if (!p) throw new Error('Plage source invalide : ' + source);
  // Colonnes entières (A:D) : on s'arrête à la zone utilisée
  const f = classeur.feuilles[fi];
  return { fi, p: { r1: p.r1, c1: p.c1, r2: Math.min(p.r2, f.zone.r2), c2: Math.min(p.c2, f.zone.c2) } };
}

/** Champs de la source : les en-têtes de sa première ligne (« Colonne B » si vide). */
export function champsSource(classeur, source, fi = 0) {
  const { fi: F, p } = resoudreSource(classeur, source, fi);
  const out = [];
  for (let c = p.c1; c <= p.c2; c++) {
    const v = classeur.valeur(F, p.r1, c);
    let nom = v === null || v === undefined || v === '' ? 'Colonne ' + (c - p.c1 + 1) : String(v instanceof ErreurFormule ? v.code : typeof v === 'number' ? formater(v) : v);
    while (out.includes(nom)) nom += ' ';
    out.push(nom);
  }
  return out;
}

const cleDe = (v) => (v === null || v === undefined || v === '' ? '\u0000' : v instanceof ErreurFormule ? 'e' + v.code : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + ':' + v);
const libelleDe = (v, z) => (v === null || v === undefined || v === '' ? VIDE : v instanceof ErreurFormule ? v.code : typeof v === 'number' ? formater(v, z) : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(v));

/** Valeurs distinctes d'un champ (pour la liste des filtres). */
export function valeursChamp(classeur, spec, champ, fi = 0) {
  const { fi: F, p } = resoudreSource(classeur, spec.source, fi);
  const champs = champsSource(classeur, spec.source, fi);
  const k = champs.indexOf(champ);
  if (k < 0) return [];
  const vus = new Map();
  for (let r = p.r1 + 1; r <= p.r2; r++) {
    const v = classeur.valeur(F, r, p.c1 + k), cle = cleDe(v);
    if (!vus.has(cle)) vus.set(cle, { cle, v, texte: libelleDe(v, (classeur.feuilles[F].get(r, p.c1 + k) || {}).z) });
  }
  return [...vus.values()].sort((a, b) => comparerTri(a.v, b.v));
}

function agreger(fn, vals) {
  const nums = vals.filter((x) => typeof x === 'number');
  switch (fn) {
    case 'nbval': return vals.filter((x) => x !== null && x !== undefined && x !== '').length;
    case 'nb': return nums.length;
    case 'moyenne': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case 'max': return nums.length ? Math.max(...nums) : null;
    case 'min': return nums.length ? Math.min(...nums) : null;
    case 'produit': return nums.length ? nums.reduce((a, b) => a * b, 1) : null;
    case 'ecartype': case 'var': {
      if (nums.length < 2) return null;
      const m = nums.reduce((a, b) => a + b, 0) / nums.length;
      const v = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1);
      return fn === 'var' ? v : Math.sqrt(v);
    }
    default: return nums.reduce((a, b) => a + b, 0);
  }
}

/**
 * Calcule le tableau : renvoie { cellules: [[{ v, s, z }]], largeur, hauteur, avertissement }.
 * cellules[i][j] : cellule à (dest.r + i, dest.c + j) ; null = vide.
 */
export function calculerTCD(classeur, spec, fiDefaut = 0) {
  const { fi: F, p } = resoudreSource(classeur, spec.source, fiDefaut);
  if (p.r2 <= p.r1) throw new Error('La source doit avoir une ligne d\'en-têtes et au moins une ligne de données');
  const champs = champsSource(classeur, spec.source, fiDefaut);
  const idx = (nom) => { const k = champs.indexOf(nom); if (k < 0) throw new Error('Champ « ' + nom + ' » absent de la source'); return k; };
  const lignes = (spec.lignes || []).map(idx), colonnes = (spec.colonnes || []).map(idx);
  const valeurs = (spec.valeurs || []).map((v) => ({ ...v, k: idx(v.champ) }));
  const filtres = (spec.filtres || []).map((x) => ({ ...x, k: idx(x.champ) }));
  const fSrc = classeur.feuilles[F];
  const formatDe = (k) => { for (let r = p.r1 + 1; r <= Math.min(p.r2, p.r1 + 20); r++) { const cel = fSrc.get(r, p.c1 + k); if (cel && cel.z) return cel.z; } return undefined; };
  // 1. Lignes de la source qui passent les filtres
  const enregistrements = [];
  for (let r = p.r1 + 1; r <= p.r2; r++) {
    if (fSrc.filtrees && fSrc.filtrees.has(r) && spec.ignorerFiltrees) continue;
    let vide = true;
    const ligne = [];
    for (let k = 0; k < champs.length; k++) { const v = classeur.valeur(F, r, p.c1 + k); ligne.push(v); if (v !== null && v !== undefined && v !== '') vide = false; }
    if (vide) continue;
    if (filtres.some((x) => x.visibles && !x.visibles.includes(libelleDe(ligne[x.k], (fSrc.get(r, p.c1 + x.k) || {}).z)))) continue;
    enregistrements.push(ligne);
  }
  // 2. Clés des lignes et des colonnes (combinaisons de valeurs), triées
  const combinaisons = (ks) => {
    const m = new Map();
    for (const e of enregistrements) { const cle = ks.map((k) => cleDe(e[k])).join('\u0001'); if (!m.has(cle)) m.set(cle, ks.map((k) => e[k])); }
    return [...m.entries()].map(([cle, vals]) => ({ cle, vals })).sort((a, b) => { for (let i = 0; i < a.vals.length; i++) { const d = comparerTri(a.vals[i], b.vals[i]); if (d) return d; } return 0; });
  };
  const clesL = lignes.length ? combinaisons(lignes) : [{ cle: '', vals: [] }];
  const clesC = colonnes.length ? combinaisons(colonnes) : [{ cle: '', vals: [] }];
  const nv = Math.max(1, valeurs.length);
  // 3. Regroupement : cellule (préfixe de ligne, préfixe de colonne) → listes de valeurs par champ de valeur
  const groupes = new Map();
  const ajouter = (cle, e) => { let g = groupes.get(cle); if (!g) { g = valeurs.map(() => []); groupes.set(cle, g); } valeurs.forEach((v, i) => g[i].push(e[v.k])); };
  for (const e of enregistrements) {
    const cl = lignes.map((k) => cleDe(e[k])), cc = colonnes.map((k) => cleDe(e[k]));
    // Toutes les profondeurs de ligne (sous-totaux) × colonne complète ou total
    for (let i = 0; i <= cl.length; i++) {
      const pl = cl.slice(0, i).join('\u0001');
      ajouter(i + '|' + pl + '||' + cc.join('\u0001'), e);
      ajouter(i + '|' + pl + '||*', e);
    }
  }
  const val = (profL, cleL, cleC, i) => { const g = groupes.get(profL + '|' + cleL + '||' + cleC); return g ? agreger(valeurs[i].fn, g[i]) : null; };
  // 4. Mise en page (forme tabulaire)
  const out = [];
  const poser = (i, j, cel) => { while (out.length <= i) out.push([]); out[i][j] = cel; };
  let ligne = 0;
  // Filtres du rapport, au-dessus
  for (const x of filtres) {
    poser(ligne, 0, { v: x.champ, s: { gras: true } });
    poser(ligne, 1, { v: !x.visibles ? '(Tous)' : x.visibles.length === 1 ? x.visibles[0] : '(Plusieurs éléments)' });
    ligne++;
  }
  if (filtres.length) ligne++;
  const nl = Math.max(1, lignes.length);
  const colonnesDonnees = []; // { cleC, i (valeur), total }
  for (const kc of clesC) for (let i = 0; i < nv; i++) colonnesDonnees.push({ cleC: kc.cle, valsC: kc.vals, i });
  if (colonnes.length && spec.totauxColonnes !== false) for (let i = 0; i < nv; i++) colonnesDonnees.push({ cleC: '*', valsC: null, i, total: true });
  // En-têtes de colonnes : une ligne par champ de colonne (+ une pour les valeurs s'il y en a plusieurs)
  const lignesEntete = colonnes.length + (colonnes.length && nv > 1 ? 1 : 0);
  if (colonnes.length) {
    poser(ligne, 0, { v: valeurs.length === 1 ? libelleValeur(valeurs[0]) : 'Valeurs', s: STYLE_ENTETE });
    for (let j = 1; j < nl; j++) poser(ligne, j, { v: null, s: STYLE_ENTETE });
    for (let h = 0; h < lignesEntete; h++) {
      if (h > 0) for (let j = 0; j < nl; j++) poser(ligne + h, j, { v: null, s: STYLE_ENTETE });
      colonnesDonnees.forEach((cd, j) => {
        let t;
        if (h < colonnes.length) {
          if (cd.total) t = h === 0 && cd.i === 0 ? 'Total général' : null;
          else { const prec = colonnesDonnees[j - 1]; const memeGroupe = prec && !prec.total && prec.valsC && colonnes.slice(0, h + 1).every((_, q) => cleDe(prec.valsC[q]) === cleDe(cd.valsC[q])); t = memeGroupe ? null : libelleDe(cd.valsC[h], formatDe(colonnes[h])); }
          if (h === colonnes.length - 1 && cd.total && nv > 1) t = 'Total ' + libelleValeur(valeurs[cd.i]);
        } else t = libelleValeur(valeurs[cd.i]);
        poser(ligne + h, nl + j, { v: t, s: STYLE_ENTETE });
      });
    }
    ligne += lignesEntete;
  }
  // Ligne des noms de champs de ligne (et des valeurs quand il n'y a pas de colonnes)
  lignes.forEach((k, j) => poser(ligne, j, { v: champs[k], s: STYLE_ENTETE }));
  if (!lignes.length) poser(ligne, 0, { v: null, s: STYLE_ENTETE });
  if (!colonnes.length) valeurs.forEach((v, i) => poser(ligne, nl + i, { v: libelleValeur(v), s: STYLE_ENTETE }));
  else colonnesDonnees.forEach((_, j) => poser(ligne, nl + j, { v: null, s: STYLE_ENTETE }));
  ligne++;
  const premiereDonnee = ligne;
  // Totaux de référence pour les pourcentages
  const totalGeneral = (i) => val(0, '', '*', i);
  const formatValeur = (v) => (v.affichage && v.affichage !== 'normal' ? '0.00%' : ['nbval', 'nb'].includes(v.fn) ? '0' : formatDe(v.k));
  const ecrireValeurs = (r, prof, cleL, style) => {
    colonnesDonnees.forEach((cd, j) => {
      const v = valeurs[cd.i];
      if (!v) return;
      let x = val(prof, cleL, cd.cleC, cd.i);
      if (x !== null && v.affichage && v.affichage !== 'normal') {
        const den = v.affichage === 'pctTotal' ? totalGeneral(cd.i) : v.affichage === 'pctColonne' ? val(0, '', cd.cleC, cd.i) : val(prof, cleL, '*', cd.i);
        x = den ? x / den : null;
      }
      poser(r, nl + j, { v: x, z: formatValeur(v), s: style });
    });
  };
  // Lignes de données, avec sous-totaux à chaque changement d'un champ de niveau supérieur
  const sousTotaux = spec.sousTotaux !== false && lignes.length > 1;
  for (let n = 0; n < clesL.length; n++) {
    const kl = clesL[n], prec = clesL[n - 1];
    if (lignes.length) {
      // libellés : seulement là où la valeur change (comme Excel sans « répéter les étiquettes »)
      let change = !prec;
      lignes.forEach((k, j) => { if (!change && cleDe(prec.vals[j]) !== cleDe(kl.vals[j])) change = true; poser(ligne, j, change ? { v: libelleDe(kl.vals[j], formatDe(k)) } : null); });
      ecrireValeurs(ligne, lignes.length, kl.vals.map(cleDe).join('\u0001'), undefined);
      ligne++;
      if (sousTotaux) {
        const suiv = clesL[n + 1];
        for (let niv = lignes.length - 2; niv >= 0; niv--) {
          const fini = !suiv || kl.vals.slice(0, niv + 1).some((x, q) => cleDe(x) !== cleDe(suiv.vals[q]));
          if (!fini) continue;
          for (let j = 0; j < nl; j++) poser(ligne, j, { v: j === niv ? 'Total ' + libelleDe(kl.vals[niv], formatDe(lignes[niv])) : null, s: STYLE_TOTAL });
          ecrireValeurs(ligne, niv + 1, kl.vals.slice(0, niv + 1).map(cleDe).join('\u0001'), STYLE_TOTAL);
          ligne++;
        }
      }
    }
  }
  if (!lignes.length || spec.totauxLignes !== false) {
    poser(ligne, 0, { v: 'Total général', s: STYLE_GENERAL });
    for (let j = 1; j < nl; j++) poser(ligne, j, { v: null, s: STYLE_GENERAL });
    ecrireValeurs(ligne, 0, '', STYLE_GENERAL);
    ligne++;
  }
  const largeur = nl + colonnesDonnees.length;
  return { cellules: out, hauteur: out.length, largeur, premiereDonnee, enregistrements: enregistrements.length,
    avertissement: valeurs.length ? '' : 'Ajoutez un champ dans « Valeurs » pour voir des résultats' };
}

/** Écrit (ou réécrit) le tableau dans sa feuille : efface l'ancienne zone, pose les nouvelles valeurs. */
export function ecrireTCD(classeur, fi, spec) {
  const f = classeur.feuilles[fi];
  const res = calculerTCD(classeur, spec, fi);
  const { r, c } = spec.dest;
  // Le tableau ne doit pas écraser sa propre source
  const src = resoudreSource(classeur, spec.source, fi);
  if (src.fi === fi && r <= src.p.r2 && r + res.hauteur - 1 >= src.p.r1 && c <= src.p.c2 && c + res.largeur - 1 >= src.p.c1) throw new Error('Le tableau croisé recouvrirait ses données : choisissez un autre emplacement');
  // Ni un autre tableau croisé
  for (const t of f.tcd || []) if (t !== spec && t.zone && r <= t.zone.r2 && r + res.hauteur - 1 >= t.zone.r1 && c <= t.zone.c2 && c + res.largeur - 1 >= t.zone.c1) throw new Error('Un autre tableau croisé occupe cet emplacement');
  if (spec.zone) for (let i = spec.zone.r1; i <= spec.zone.r2; i++) for (let j = spec.zone.c1; j <= spec.zone.c2; j++) f.set(i, j, null);
  res.cellules.forEach((ligne, i) => { for (let j = 0; j < res.largeur; j++) { const x = ligne[j]; if (!x) continue; const cel = { v: x.v ?? null }; if (x.z) cel.z = x.z; if (x.s) cel.s = { ...x.s, bordures: x.s.bordures ? { ...x.s.bordures } : undefined }; if (cel.s && !cel.s.bordures) delete cel.s.bordures; f.set(r + i, c + j, cel); } });
  spec.zone = { r1: r, c1: c, r2: r + Math.max(1, res.hauteur) - 1, c2: c + Math.max(1, res.largeur) - 1 };
  // Colonnes élargies pour lire les libellés (jamais rétrécies)
  for (let j = 0; j < res.largeur; j++) {
    let n = 0;
    for (const ligne of res.cellules) { const x = ligne[j]; if (x && x.v !== null && x.v !== undefined) n = Math.max(n, (typeof x.v === 'number' ? formater(x.v, x.z) : String(x.v)).length + (x.s && x.s.gras ? 2 : 0)); }
    const w = Math.min(260, Math.round(n * 7.2 + 14));
    if (w > (f.largeurs[c + j] ?? 90)) f.largeurs[c + j] = w;
  }
  f.recalculerZone();
  classeur.modifie();
  return res;
}

/** Le tableau croisé qui contient une cellule (ou null). */
export function tcdA(f, r, c) {
  return (f.tcd || []).find((t) => t.zone && r >= t.zone.r1 && r <= t.zone.r2 && c >= t.zone.c1 && c <= t.zone.c2) || null;
}

/** Actualise tous les tableaux croisés du classeur. Renvoie le nombre actualisé et les erreurs. */
export function actualiserTout(classeur) {
  let n = 0; const erreurs = [];
  classeur.feuilles.forEach((f, fi) => { for (const t of f.tcd || []) { try { ecrireTCD(classeur, fi, t); n++; } catch (e) { erreurs.push(f.nom + ' : ' + e.message); } } });
  return { n, erreurs };
}
