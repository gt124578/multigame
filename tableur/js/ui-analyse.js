// Interface des outils d'analyse : Solveur, Table de données, Vérification des erreurs, Évaluer la formule,
// Remplissage instantané (Ctrl+E). Les champs de cellule (classe « champ-ref ») se remplissent d'un clic
// ou d'un glissé sur la feuille.

import { solveur, lireContrainte, ecrireContrainte, calculerTableDonnees, remplissageInstantane, etapesEvaluation, verifierErreurs } from './analyse.js';
import { adresse, parsePlage, parseAdresse, formater, ErreurFormule } from './formules.js';
import { zoneContigue } from './donnees.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plageTexte = (p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2));
const lirePlage = (t) => parsePlage(String(t || '').replace(/\$/g, '').trim().toUpperCase());
const lireCellule = (t) => parseAdresse(String(t || '').replace(/\$/g, '').trim().toUpperCase());

/**
 * api : { classeur(), fi(), feuille(), selection(), selectionBornee(), curseur(), selectionner(p, cur), allerA(fi, r, c),
 *   rendre(), sauvegarder(), memoriser(), toast(), ouvrirPanneau(nom), panneauOuvert(nom), dialogue(titre, html, ok, opts) }
 */
export function installerAnalyse(api) {
  const $ = (id) => document.getElementById(id);
  const finir = () => { api.sauvegarder(); api.rendre(); };

  // ---------------------------------------------------------------------------
  // Solveur
  // ---------------------------------------------------------------------------
  let avantSolveur = null; // valeurs des cellules variables avant la résolution (pour les rétablir)
  const modeleDe = (f) => { if (!f.solveur) f.solveur = { objectif: '', but: 'max', valeur: '0', variables: '', contraintes: [], positives: true, methode: 'auto' }; return f.solveur; };
  const OPS = [['<=', '≤'], ['=', '='], ['>=', '≥'], ['ent', 'entier'], ['bin', 'binaire']];
  function construireSolveur() {
    const f = api.feuille(), m = modeleDe(f);
    if (!m.objectif) m.objectif = adresse(api.curseur().r, api.curseur().c);
    $('panneau-solveur').innerHTML = `<div class="outil">
      <p class="aide-petite">Cherche les valeurs des cellules variables qui donnent le meilleur résultat, en respectant les contraintes (tarification, allocation, ajustement de paramètres…). Cliquez dans un champ puis sur la feuille pour le remplir.</p>
      <label>Objectif <input class="champ-ref" id="sv-obj" value="${ech(m.objectif)}" spellcheck="false" placeholder="B10 (une formule)"></label>
      <div class="sv-but">${[['max', 'Max'], ['min', 'Min'], ['valeur', 'Valeur :']].map(([k, t]) => `<label class="case"><input type="radio" name="sv-but" value="${k}"${m.but === k ? ' checked' : ''}> ${t}</label>`).join('')}<input id="sv-val" value="${ech(m.valeur)}" style="width:80px"${m.but === 'valeur' ? '' : ' disabled'}></div>
      <label>Cellules variables <input class="champ-ref" data-plage="1" id="sv-var" value="${ech(m.variables)}" spellcheck="false" placeholder="B2:B5"></label>
      <div class="outil-titre">Contraintes</div>
      <div id="sv-contraintes">${m.contraintes.map((k, i) => ligneContrainte(k, i)).join('') || '<div class="vide">Aucune contrainte</div>'}</div>
      <div class="outil-actions"><button id="sv-ajouter">+ Contrainte</button></div>
      <label class="case"><input type="checkbox" id="sv-pos"${m.positives ? ' checked' : ''}> Variables sans contrainte positives (≥ 0)</label>
      <label>Méthode <select id="sv-meth">${[['auto', 'Automatique'], ['simplexe', 'Simplexe (linéaire)'], ['gr', 'Non linéaire']].map(([k, t]) => `<option value="${k}"${m.methode === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="outil-actions"><button id="sv-ok" class="principal">Résoudre</button><button id="sv-raz">Réinitialiser</button></div>
      <div id="sv-statut" class="outil-statut"></div>
    </div>`;
    const lire = () => {
      m.objectif = $('sv-obj').value.trim(); m.variables = $('sv-var').value.trim(); m.valeur = $('sv-val').value;
      m.but = (document.querySelector('input[name="sv-but"]:checked') || {}).value || 'max';
      m.positives = $('sv-pos').checked; m.methode = $('sv-meth').value;
      m.contraintes = [...document.querySelectorAll('.sv-ligne')].map((l) => ({ g: l.querySelector('.sv-g').value.trim(), op: l.querySelector('.sv-op').value, d: l.querySelector('.sv-d').value.trim() }));
    };
    $('panneau-solveur').addEventListener('input', lire);
    $('panneau-solveur').addEventListener('change', (e) => { lire(); if (e.target.name === 'sv-but') $('sv-val').disabled = m.but !== 'valeur'; if (e.target.classList.contains('sv-op')) construireSolveur(); });
    $('sv-ajouter').addEventListener('click', () => { lire(); m.contraintes.push({ g: '', op: '<=', d: '' }); construireSolveur(); const l = document.querySelectorAll('.sv-g'); if (l.length) l[l.length - 1].focus(); });
    document.querySelectorAll('[data-sv-suppr]').forEach((b) => b.addEventListener('click', () => { lire(); m.contraintes.splice(+b.dataset.svSuppr, 1); construireSolveur(); }));
    $('sv-raz').addEventListener('click', () => { delete f.solveur; avantSolveur = null; construireSolveur(); });
    $('sv-ok').addEventListener('click', () => { lire(); resoudre(); });
  }
  function ligneContrainte(k, i) {
    const simple = k.op === 'ent' || k.op === 'bin';
    return `<div class="sv-ligne"><input class="champ-ref sv-g" data-plage="1" value="${ech(k.g)}" placeholder="B2:B5" spellcheck="false">
      <select class="sv-op">${OPS.map(([v, t]) => `<option value="${v}"${k.op === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <input class="champ-ref sv-d" data-plage="1" value="${ech(simple ? '' : k.d)}" placeholder="${simple ? '' : '100 ou C2'}" spellcheck="false"${simple ? ' disabled' : ''}>
      <button data-sv-suppr="${i}" title="Retirer">✕</button></div>`;
  }
  function resoudre() {
    const C = api.classeur(), fi = api.fi(), f = api.feuille(), m = modeleDe(f);
    const obj = lireCellule(m.objectif);
    if (!obj) return api.toast('Objectif : indiquez une cellule (ex. B10)', true);
    const vars = m.variables.split(/[;,]/).map(lirePlage).filter(Boolean);
    if (!vars.length) return api.toast('Cellules variables : indiquez une plage (ex. B2:B5)', true);
    const cellules = vars.flatMap((p) => { const o = []; for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) o.push({ r, c }); return o; });
    const contraintes = [];
    for (const k of m.contraintes) {
      if (!k.g) continue;
      const x = lireContrainte(k.op === 'ent' || k.op === 'bin' ? k.g + ' ' + k.op : k.g + ' ' + k.op + ' ' + k.d);
      if (!x) return api.toast('Contrainte illisible : ' + k.g + ' ' + k.op + ' ' + k.d, true);
      contraintes.push(x);
    }
    api.memoriser();
    avantSolveur = cellules.map(({ r, c }) => ({ r, c, cel: f.get(r, c) ? { ...f.get(r, c) } : null }));
    $('sv-statut').textContent = 'Calcul en cours…';
    setTimeout(() => {
      let res;
      try { res = solveur(C, fi, { objectif: obj, but: m.but, valeur: +String(m.valeur).replace(',', '.'), variables: cellules, contraintes, positives: m.positives, methode: m.methode }); }
      catch (e) { $('sv-statut').textContent = ''; return api.toast(e.message, true); }
      const fx = (i) => formater(res.x[i], (f.get(cellules[i].r, cellules[i].c) || {}).z);
      $('sv-statut').innerHTML = `${res.ok ? '✔' : '⚠'} ${ech(res.message)}<br><b>${adresse(obj.r, obj.c)} = ${ech(res.y instanceof ErreurFormule ? res.y.code : formater(res.y, (f.get(obj.r, obj.c) || {}).z))}</b>
        <div class="sv-sol">${cellules.slice(0, 12).map(({ r, c }, i) => `${adresse(r, c)} = ${ech(fx(i))}`).join('<br>')}${cellules.length > 12 ? '<br>…' : ''}</div>
        <small>${ech(res.methode)} · ${res.evaluations} calculs de la feuille</small>
        <div class="outil-actions"><button id="sv-garder" class="principal">Garder la solution</button><button id="sv-retablir">Rétablir les valeurs d'origine</button></div>`;
      $('sv-garder').addEventListener('click', () => { avantSolveur = null; $('sv-statut').innerHTML = '✔ Solution gardée'; });
      $('sv-retablir').addEventListener('click', () => { if (avantSolveur) for (const x of avantSolveur) f.set(x.r, x.c, x.cel); avantSolveur = null; C.modifie(); $('sv-statut').innerHTML = 'Valeurs d\'origine rétablies'; finir(); });
      C.modifie(); finir();
    }, 20);
  }
  function ouvrirSolveur() { if (!api.panneauOuvert('solveur')) api.ouvrirPanneau('solveur'); else construireSolveur(); }

  // ---------------------------------------------------------------------------
  // Table de données
  // ---------------------------------------------------------------------------
  const td = { plage: '', ligne: '', colonne: '' };
  function construireTable() {
    const s = api.selectionBornee();
    if (!td.plage && (s.r2 > s.r1 || s.c2 > s.c1)) td.plage = plageTexte(s);
    $('panneau-tabledonnees').innerHTML = `<div class="outil">
      <p class="aide-petite">Calcule une formule pour plusieurs valeurs d'une ou deux cellules d'entrée (sensibilité d'une prime au taux, d'une annuité à la durée…).</p>
      <details class="aide-petite"><summary>Disposition</summary>
        <b>Une entrée en colonne :</b> les valeurs à essayer dans la 1<sup>re</sup> colonne de la plage, la ou les formules sur la 1<sup>re</sup> ligne (à partir de la 2<sup>e</sup> colonne).<br>
        <b>Une entrée en ligne :</b> les valeurs sur la 1<sup>re</sup> ligne, les formules dans la 1<sup>re</sup> colonne.<br>
        <b>Deux entrées :</b> la formule dans le coin en haut à gauche, les valeurs de la cellule « ligne » sur la 1<sup>re</sup> ligne et celles de la cellule « colonne » dans la 1<sup>re</sup> colonne.</details>
      <label>Plage de la table <input class="champ-ref" data-plage="1" id="td-plage" value="${ech(td.plage)}" spellcheck="false" placeholder="D2:G12"></label>
      <label>Cellule d'entrée en ligne <input class="champ-ref" id="td-ligne" value="${ech(td.ligne)}" spellcheck="false" placeholder="(facultatif)"></label>
      <label>Cellule d'entrée en colonne <input class="champ-ref" id="td-col" value="${ech(td.colonne)}" spellcheck="false" placeholder="(facultatif)"></label>
      <div class="outil-actions"><button id="td-ok" class="principal">Calculer la table</button></div>
      <div id="td-statut" class="outil-statut"></div>
      ${(api.feuille().tablesDonnees || []).length ? `<div class="outil-titre">Tables de cette feuille</div>${api.feuille().tablesDonnees.map((t, i) => `<div class="td-ligne"><span>${plageTexte(t.plage)}</span><button data-td-voir="${i}">Voir</button><button data-td-suppr="${i}" title="Garder les valeurs, ne plus recalculer">Figer</button></div>`).join('')}` : ''}
    </div>`;
    const lire = () => { td.plage = $('td-plage').value; td.ligne = $('td-ligne').value; td.colonne = $('td-col').value; };
    $('panneau-tabledonnees').addEventListener('input', lire);
    $('td-ok').addEventListener('click', () => {
      lire();
      const p = lirePlage(td.plage), l = td.ligne.trim() ? lireCellule(td.ligne) : null, c = td.colonne.trim() ? lireCellule(td.colonne) : null;
      if (!p) return api.toast('Plage de la table invalide', true);
      if ((td.ligne.trim() && !l) || (td.colonne.trim() && !c)) return api.toast('Cellule d\'entrée invalide', true);
      const C = api.classeur(), fi = api.fi(), f = api.feuille();
      api.memoriser();
      const def = { plage: p, ligne: l, colonne: c };
      let n;
      try { n = calculerTableDonnees(C, fi, def); } catch (e) { return api.toast(e.message, true); }
      f.tablesDonnees = (f.tablesDonnees || []).filter((t) => !(t.plage.r1 === p.r1 && t.plage.c1 === p.c1));
      f.tablesDonnees.push(def);
      $('td-statut').textContent = '✔ ' + n + ' valeur(s) calculée(s) ; la table se recalcule quand le modèle change.';
      api.selectionner(p); finir(); construireTable();
    });
    document.querySelectorAll('[data-td-voir]').forEach((b) => b.addEventListener('click', () => { const t = api.feuille().tablesDonnees[+b.dataset.tdVoir]; api.selectionner(t.plage); api.rendre(); }));
    document.querySelectorAll('[data-td-suppr]').forEach((b) => b.addEventListener('click', () => { api.memoriser(); api.feuille().tablesDonnees.splice(+b.dataset.tdSuppr, 1); finir(); construireTable(); }));
  }
  function ouvrirTableDonnees() { td.plage = ''; if (!api.panneauOuvert('tabledonnees')) api.ouvrirPanneau('tabledonnees'); else construireTable(); }

  // ---------------------------------------------------------------------------
  // Vérification des erreurs
  // ---------------------------------------------------------------------------
  const ignorees = new Set();
  function construireErreurs() {
    const C = api.classeur(), fi = api.fi();
    const liste = verifierErreurs(C, fi).filter((e) => !ignorees.has(fi + ',' + e.r + ',' + e.c + ',' + e.type));
    $('panneau-erreurs').innerHTML = `<div class="outil">
      ${liste.length ? `<p class="aide-petite">${liste.length} point(s) à vérifier sur cette feuille.</p>` : '<p class="vide">✔ Aucune erreur trouvée sur cette feuille.</p>'}
      <div class="erreurs-liste">${liste.map((e, i) => `<div class="err-ligne" data-i="${i}"><b>${adresse(e.r, e.c)}</b> <span>${ech(e.message)}</span>
        <div class="outil-actions"><button data-aller="${i}">Aller</button>${e.proposition !== undefined ? `<button data-corriger="${i}">${e.type === 'texte' ? 'Convertir en nombre' : 'Copier la formule voisine'}</button>` : ''}${e.type === 'erreur' ? `<button data-evaluer="${i}">Évaluer…</button>` : ''}<button data-ignorer="${i}">Ignorer</button></div></div>`).join('')}</div>
      <div class="outil-actions"><button id="err-actualiser">Vérifier de nouveau</button></div></div>`;
    const prend = (b, k) => liste[+b.dataset[k]];
    document.querySelectorAll('[data-aller]').forEach((b) => b.addEventListener('click', () => { const e = prend(b, 'aller'); api.allerA(fi, e.r, e.c); }));
    document.querySelectorAll('[data-evaluer]').forEach((b) => b.addEventListener('click', () => { const e = prend(b, 'evaluer'); api.allerA(fi, e.r, e.c); evaluerFormule(); }));
    document.querySelectorAll('[data-ignorer]').forEach((b) => b.addEventListener('click', () => { const e = prend(b, 'ignorer'); ignorees.add(fi + ',' + e.r + ',' + e.c + ',' + e.type); construireErreurs(); }));
    document.querySelectorAll('[data-corriger]').forEach((b) => b.addEventListener('click', () => {
      const e = prend(b, 'corriger'), f = api.feuille(), cel = f.get(e.r, e.c) || {};
      api.memoriser();
      f.set(e.r, e.c, e.type === 'texte' ? { ...cel, v: e.proposition } : { ...cel, f: e.proposition, cache: undefined });
      C.modifie(); finir(); construireErreurs();
    }));
    $('err-actualiser').addEventListener('click', construireErreurs);
  }
  function ouvrirErreurs() { if (!api.panneauOuvert('erreurs')) api.ouvrirPanneau('erreurs'); else construireErreurs(); }

  // ---------------------------------------------------------------------------
  // Évaluer la formule (pas à pas)
  // ---------------------------------------------------------------------------
  function evaluerFormule() {
    const C = api.classeur(), fi = api.fi(), { r, c } = api.curseur();
    const etapes = etapesEvaluation(C, fi, r, c);
    if (!etapes.length) return api.toast('La cellule active ne contient pas de formule', true);
    let i = 0;
    const html = (t) => ech(t).replace(/⟦/g, '<u>').replace(/⟧/g, '</u>');
    const boite = api.dialogue('Évaluer la formule — ' + adresse(r, c), `<p class="aide-petite">La partie soulignée est calculée à l'étape suivante.</p><div id="ev-etapes" class="ev-etapes"></div>
      <div class="outil-actions"><button id="ev-suivant" class="principal">Évaluer</button><button id="ev-tout">Tout évaluer</button><button id="ev-debut">Recommencer</button></div>`, null, { large: true });
    const dessiner = () => {
      boite.querySelector('#ev-etapes').innerHTML = etapes.slice(0, i + 1).map((e, k) => `<div class="${k === i ? 'courante' : ''}">${html(e.texte)}${e.fin ? ` <b>→ ${ech(e.resultat)}</b>` : ''}${e.erreur ? ' <span class="erreur">' + ech(e.erreur) + '</span>' : ''}</div>`).join('');
      boite.querySelector('#ev-suivant').disabled = i >= etapes.length - 1;
      const el = boite.querySelector('.courante'); if (el) el.scrollIntoView({ block: 'nearest' });
    };
    boite.querySelector('#ev-suivant').addEventListener('click', () => { if (i < etapes.length - 1) i++; dessiner(); });
    boite.querySelector('#ev-tout').addEventListener('click', () => { i = etapes.length - 1; dessiner(); });
    boite.querySelector('#ev-debut').addEventListener('click', () => { i = 0; dessiner(); });
    dessiner();
    setTimeout(() => boite.querySelector('#ev-suivant').focus(), 0);
  }

  // ---------------------------------------------------------------------------
  // Remplissage instantané (Ctrl+E)
  // ---------------------------------------------------------------------------
  function remplissage() {
    const C = api.classeur(), fi = api.fi(), f = api.feuille(), { r, c } = api.curseur();
    // Zone de données autour : la colonne de gauche (ou de droite) donne les lignes
    const voisin = c > 0 && f.get(r, c - 1) ? c - 1 : f.get(r, c + 1) ? c + 1 : c - 1;
    if (voisin < 0) return api.toast('Écrivez un ou deux exemples à côté des données, puis Ctrl+E', true);
    const z = zoneContigue(f, r, Math.max(0, voisin));
    const c1 = Math.min(z.c1, c), c2 = Math.max(z.c2, c);
    const sources = []; for (let k = c1; k <= c2; k++) if (k !== c) sources.push(k);
    const texte = (rr, k) => { const v = C.valeur(fi, rr, k); return v == null ? '' : v instanceof ErreurFormule ? '' : typeof v === 'number' ? formater(v, (f.get(rr, k) || {}).z) : String(v); };
    const exemples = [], cibles = [];
    // Ligne d'en-tête : sautée si la cellule de la colonne cible y contient du texte et qu'aucun exemple ne la suit pas
    for (let rr = z.r1; rr <= z.r2; rr++) {
      const cel = f.get(rr, c);
      if (cel && cel.v != null && cel.v !== '' && cel.f == null) exemples.push({ r: rr, sources: sources.map((k) => texte(rr, k)), sortie: String(cel.v) });
      else if (!cel || (cel.v == null && cel.f == null)) cibles.push(rr);
    }
    // L'en-tête (1re ligne, au-dessus des exemples) n'est pas un exemple
    if (exemples.length > 1 && exemples[0].r === z.r1 && aEnTete(C, fi, z, c)) exemples.shift();
    if (!exemples.length) return api.toast('Écrivez d\'abord un exemple du résultat voulu dans cette colonne', true);
    const srcCibles = cibles.map((rr) => sources.map((k) => texte(rr, k)));
    let props = remplissageInstantane(exemples, srcCibles);
    // La première ligne était peut-être un en-tête : on essaie sans elle
    if (!props && exemples.length > 1 && exemples[0].r === z.r1) { exemples.shift(); props = remplissageInstantane(exemples, srcCibles); }
    if (!props) return api.toast('Aucune règle trouvée : ajoutez un deuxième exemple', true);
    api.memoriser();
    let n = 0;
    cibles.forEach((rr, i) => { if (props[i] != null) { C.saisir(fi, rr, c, "'" + props[i]); const cel = f.get(rr, c); if (cel && /^-?\d+([.,]\d+)?$/.test(props[i]) && !/^0\d/.test(props[i])) C.saisir(fi, rr, c, props[i]); n++; } });
    api.selectionner({ r1: Math.min(...exemples.map((e) => e.r), ...cibles), c1: c, r2: Math.max(...exemples.map((e) => e.r), ...cibles), c2: c }, { r, c });
    finir();
    api.toast(n ? 'Remplissage instantané : ' + n + ' cellule(s) — Ctrl+Z pour annuler' : 'Rien à remplir');
  }
  // Première ligne d'en-tête : texte au-dessus de données et colonne cible avec un texte qui n'est pas un résultat
  function aEnTete(C, fi, z, c) {
    const f = C.feuilles[fi];
    for (let k = z.c1; k <= z.c2; k++) { if (k === c) continue; const a = C.valeur(fi, z.r1, k), b = C.valeur(fi, z.r1 + 1, k); if (typeof a === 'string' && typeof b === 'number') return true; }
    const h = f.get(z.r1, c);
    return !!(h && h.s && h.s.gras);
  }

  return {
    panneaux: { solveur: construireSolveur, tabledonnees: construireTable, erreurs: construireErreurs },
    titres: { solveur: 'Solveur', tabledonnees: 'Table de données', erreurs: 'Vérification des erreurs' },
    ouvrirSolveur, ouvrirTableDonnees, ouvrirErreurs, evaluerFormule, remplissage,
    rafraichir() { if (api.panneauOuvert('erreurs')) construireErreurs(); },
  };
}

export { ecrireContrainte };
