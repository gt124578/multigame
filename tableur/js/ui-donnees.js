// Interface des outils de données : tri (rapide et personnalisé), filtre automatique (menu ▾ des en-têtes),
// rechercher / remplacer, mise en forme conditionnelle, valeur cible, somme automatique, impression.

import { trierPlage, zoneContigue, aUnEntete, valeursFiltre, appliquerFiltre, plageFiltre, rechercher, remplacer,
  TYPES_MFC, STYLES_MFC, plagesMfc, JEUX_ICONES, iconeSVG, valeurCible, formuleAutomatique,
  TYPES_VALIDATION, OPS_VALIDATION, validationDe, elementsListe, valeurValide, decrireValidation, cellulesInvalides } from './donnees.js';
import { adresse, parsePlage, parseAdresse, colVersLettres, formater, ErreurFormule } from './formules.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const texteColonne = (classeur, fi, r, c, entete) => { const v = entete ? classeur.valeur(fi, r, c) : null; return v !== null && v !== undefined && v !== '' ? 'Colonne ' + colVersLettres(c) + ' — ' + String(v) : 'Colonne ' + colVersLettres(c); };
const ECHELLES = [['#f8696b', '#ffeb84', '#63be7b'], ['#63be7b', '#ffeb84', '#f8696b'], ['#ffffff', '#63be7b'], ['#ffffff', '#5a8ac6'], ['#f8696b', '#ffffff', '#5a8ac6']];
const plageTexte = (p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2));

/**
 * api : {
 *   classeur(), fi(), feuille(), selection() → { r1, c1, r2, c2 } (normalisée), curseur(), selectionner(plage, curseur),
 *   allerA(fi, r, c), rendre(), sauvegarder(), memoriser(), toast(msg, erreur), ouvrirMenu(x, y, items),
 *   ouvrirPanneau(nom), panneauOuvert(nom), commencerEdition(texte), focusGrille()
 * }
 */
export function installerDonnees(api) {
  const $ = (id) => document.getElementById(id);
  const bornee = () => { const s = api.selection(), f = api.feuille(); return { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(f.zone.r2, s.r1)), c2: Math.min(s.c2, Math.max(f.zone.c2, s.c1)) }; };
  const finir = () => { api.sauvegarder(); api.rendre(); };

  // ---------------------------------------------------------------------------
  // Tri
  // ---------------------------------------------------------------------------
  // Plage à trier : la sélection si elle couvre plusieurs cellules, sinon la zone de données autour de la cellule active
  function plageTri() {
    const s = bornee();
    if (s.r1 === s.r2 && s.c1 === s.c2) return zoneContigue(api.feuille(), s.r1, s.c1);
    if (s.c1 === s.c2 && s.r2 > s.r1) {
      // Une seule colonne choisie dans un tableau : comme Excel, on trie toutes les colonnes voisines avec elle
      const z = zoneContigue(api.feuille(), s.r1, s.c1);
      if (z.c2 > z.c1 && z.r1 <= s.r1 && z.r2 >= s.r2) return { ...z, r1: s.r1, r2: s.r2 };
    }
    return s;
  }
  function trierRapide(desc) {
    const C = api.classeur(), fi = api.fi(), f = api.feuille();
    let p = plageTri(), entete;
    if (f.filtre && api.curseur().r >= f.filtre.r1 && api.curseur().r <= f.filtre.r2 && api.curseur().c >= f.filtre.c1 && api.curseur().c <= f.filtre.c2) { p = { ...f.filtre }; entete = true; }
    else entete = aUnEntete(C, fi, p);
    if (p.r2 - p.r1 < (entete ? 2 : 1)) return api.toast('Rien à trier : choisissez une plage de plusieurs lignes', true);
    api.memoriser('trier');
    try { trierPlage(C, fi, p, [{ c: Math.max(p.c1, Math.min(p.c2, api.curseur().c)), desc }], { entete }); } catch (e) { return api.toast(e.message, true); }
    if (f.filtre) appliquerFiltre(C, fi);
    api.selectionner(p);
    finir();
    api.toast('Trié ' + (desc ? 'de Z à A' : 'de A à Z') + ' (' + plageTexte(p) + (entete ? ', en-têtes gardés' : '') + ')');
  }

  let tri = null; // { plage, entete, cles }
  function construireTri() {
    const C = api.classeur(), fi = api.fi();
    if (!tri) { const p = plageTri(); tri = { plage: plageTexte(p), entete: aUnEntete(C, fi, p), cles: [{ c: p.c1, desc: false }] }; }
    const p = parsePlage(tri.plage);
    const colonnes = p ? Array.from({ length: p.c2 - p.c1 + 1 }, (_, i) => p.c1 + i) : [];
    const panneau = $('panneau-tri');
    panneau.innerHTML = `
      <div class="outil">
        <label>Plage <input id="tri-plage" value="${ech(tri.plage)}" spellcheck="false"></label>
        <button id="tri-plage-sel" class="petit">← sélection</button>
        <label class="case"><input type="checkbox" id="tri-entete"${tri.entete ? ' checked' : ''}> Mes données ont des en-têtes</label>
        <div class="outil-titre">Trier par</div>
        ${tri.cles.map((k, i) => `<div class="tri-cle" data-i="${i}">
          <span class="tri-rang">${i ? 'puis' : ''}</span>
          <select class="tri-col">${colonnes.map((c) => `<option value="${c}"${c === k.c ? ' selected' : ''}>${ech(texteColonne(C, fi, p.r1, c, tri.entete))}</option>`).join('')}</select>
          <select class="tri-ordre"><option value="0"${!k.desc ? ' selected' : ''}>A → Z, 0 → 9</option><option value="1"${k.desc ? ' selected' : ''}>Z → A, 9 → 0</option></select>
          ${tri.cles.length > 1 ? '<button class="petit tri-suppr" title="Retirer ce niveau">✕</button>' : ''}
        </div>`).join('')}
        <button id="tri-ajouter" class="petit">+ Ajouter un niveau</button>
        <div class="outil-actions"><button id="tri-ok" class="principal">Trier</button></div>
      </div>`;
    $('tri-plage').addEventListener('change', (e) => { const q = parsePlage(e.target.value.replace(/\$/g, '')); if (!q) return api.toast('Plage invalide', true); tri.plage = plageTexte(q); tri.cles = tri.cles.map((k) => ({ ...k, c: Math.max(q.c1, Math.min(q.c2, k.c)) })); construireTri(); });
    $('tri-plage-sel').addEventListener('click', () => { const q = plageTri(); tri.plage = plageTexte(q); tri.entete = aUnEntete(C, fi, q); tri.cles = [{ c: q.c1, desc: false }]; construireTri(); });
    $('tri-entete').addEventListener('change', (e) => { tri.entete = e.target.checked; construireTri(); });
    panneau.querySelectorAll('.tri-cle').forEach((el) => {
      const i = +el.dataset.i;
      el.querySelector('.tri-col').addEventListener('change', (e) => { tri.cles[i].c = +e.target.value; });
      el.querySelector('.tri-ordre').addEventListener('change', (e) => { tri.cles[i].desc = e.target.value === '1'; });
      const s = el.querySelector('.tri-suppr'); if (s) s.addEventListener('click', () => { tri.cles.splice(i, 1); construireTri(); });
    });
    $('tri-ajouter').addEventListener('click', () => { const pris = new Set(tri.cles.map((k) => k.c)); tri.cles.push({ c: colonnes.find((c) => !pris.has(c)) ?? colonnes[0], desc: false }); construireTri(); });
    $('tri-ok').addEventListener('click', () => {
      const q = parsePlage(tri.plage); if (!q) return api.toast('Plage invalide', true);
      api.memoriser('trier');
      try { trierPlage(C, fi, q, tri.cles, { entete: tri.entete }); } catch (e) { return api.toast(e.message, true); }
      if (api.feuille().filtre) appliquerFiltre(C, fi);
      api.selectionner(q); finir(); api.toast('Trié sur ' + tri.cles.length + ' niveau' + (tri.cles.length > 1 ? 'x' : ''));
    });
  }
  function ouvrirTri() { tri = null; if (!api.panneauOuvert('tri')) api.ouvrirPanneau('tri'); else construireTri(); }

  // ---------------------------------------------------------------------------
  // Filtre automatique
  // ---------------------------------------------------------------------------
  function basculerFiltre() {
    const C = api.classeur(), fi = api.fi(), f = api.feuille();
    api.memoriser('filtrer');
    if (f.filtre) { f.filtre = null; f.filtrees = new Set(); C.modifie(); finir(); return api.toast('Filtre retiré'); }
    const p = plageFiltre(f, bornee());
    if (p.r2 <= p.r1) return api.toast('Choisissez un tableau avec une ligne d\'en-têtes et des données', true);
    f.filtre = { r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2, criteres: {} };
    f.filtrees = new Set();
    C.modifie(); finir();
    api.toast('Filtre posé sur ' + plageTexte(p) + ' : ▾ dans les en-têtes');
  }

  const popup = document.createElement('div');
  popup.id = 'popup-filtre'; popup.hidden = true;
  document.body.appendChild(popup);
  let colFiltre = null;
  function fermerPopup() { popup.hidden = true; colFiltre = null; }
  document.addEventListener('mousedown', (e) => { if (!popup.hidden && !popup.contains(e.target) && !e.target.closest('[data-filtre-col]')) fermerPopup(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popup.hidden) fermerPopup(); });

  function ouvrirFiltre(c, ancre) {
    const C = api.classeur(), fi = api.fi(), f = api.feuille(), flt = f.filtre;
    if (!flt) return;
    colFiltre = c;
    const crit = flt.criteres[c] || {};
    const valeurs = valeursFiltre(C, fi, flt, c);
    const coches = new Set(crit.visibles || valeurs.map((v) => v.texte));
    const cond = crit.condition || { op: '', valeur: '' };
    popup.innerHTML = `
      <div class="pf-titre">${ech(texteColonne(C, fi, flt.r1, c, true))}</div>
      <div class="pf-tri"><button data-tri="0">↑ Trier de A à Z</button><button data-tri="1">↓ Trier de Z à A</button></div>
      <div class="pf-cond"><select id="pf-op">
        ${[['', 'Condition…'], ['=', 'est égal à'], ['<>', 'est différent de'], ['>', 'supérieur à'], ['>=', 'supérieur ou égal à'], ['<', 'inférieur à'], ['<=', 'inférieur ou égal à'], ['contient', 'contient'], ['necontientpas', 'ne contient pas'], ['commence', 'commence par'], ['termine', 'se termine par']].map(([v, t]) => `<option value="${v}"${cond.op === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select><input id="pf-val" value="${ech(cond.valeur)}" placeholder="valeur"></div>
      <input id="pf-cherche" placeholder="Rechercher" spellcheck="false">
      <div class="pf-liste" id="pf-liste">
        <label class="pf-tout"><input type="checkbox" id="pf-tout"${coches.size === valeurs.length ? ' checked' : ''}> (Tout sélectionner)</label>
        ${valeurs.map((v, i) => `<label data-t="${ech(v.texte.toLowerCase())}"><input type="checkbox" data-i="${i}"${coches.has(v.texte) ? ' checked' : ''}> <span>${v.texte === '' ? '<i>(Vides)</i>' : ech(v.texte)}</span><small>${v.n}</small></label>`).join('')}
      </div>
      <div class="pf-boutons"><button id="pf-effacer"${flt.criteres[c] ? '' : ' disabled'}>Effacer</button><span></span><button id="pf-annuler">Annuler</button><button id="pf-ok" class="principal">OK</button></div>`;
    popup.hidden = false;
    const r = ancre.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    popup.style.width = w + 'px';
    popup.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    const haut = Math.min(popup.offsetHeight, window.innerHeight - 16);
    popup.style.top = Math.max(8, r.bottom + haut + 8 > window.innerHeight ? window.innerHeight - haut - 8 : r.bottom + 2) + 'px';
    const cases = [...popup.querySelectorAll('#pf-liste input[data-i]')];
    $('pf-tout').addEventListener('change', (e) => { for (const x of cases) if (!x.closest('label').hidden) x.checked = e.target.checked; });
    $('pf-cherche').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      for (const x of cases) { const l = x.closest('label'); l.hidden = !!q && !l.dataset.t.includes(q); x.checked = !l.hidden && (q ? true : coches.has(valeurs[+x.dataset.i].texte)); }
    });
    popup.querySelectorAll('[data-tri]').forEach((b) => b.addEventListener('click', () => {
      api.memoriser('trier');
      try { trierPlage(C, fi, { ...flt }, [{ c, desc: b.dataset.tri === '1' }], { entete: true }); } catch (e) { return api.toast(e.message, true); }
      appliquerFiltre(C, fi); fermerPopup(); finir();
    }));
    $('pf-annuler').addEventListener('click', fermerPopup);
    $('pf-effacer').addEventListener('click', () => { api.memoriser('filtrer'); delete flt.criteres[c]; appliquerFiltre(C, fi); C.modifie(); fermerPopup(); finir(); });
    $('pf-ok').addEventListener('click', () => {
      api.memoriser('filtrer');
      const choisies = cases.filter((x) => x.checked && !x.closest('label').hidden).map((x) => valeurs[+x.dataset.i].texte);
      const op = $('pf-op').value, val = $('pf-val').value;
      const nouveau = {};
      if (choisies.length < valeurs.length) nouveau.visibles = choisies;
      if (op && val !== '') nouveau.condition = { op, valeur: val };
      if (Object.keys(nouveau).length) flt.criteres[c] = nouveau; else delete flt.criteres[c];
      const caches = appliquerFiltre(C, fi);
      C.modifie(); fermerPopup(); finir();
      api.toast(caches.size ? (flt.r2 - flt.r1 - caches.size) + ' ligne(s) sur ' + (flt.r2 - flt.r1) + ' affichée(s)' : 'Toutes les lignes sont affichées');
    });
    // Sur téléphone, pas de clavier qui surgit : on ne met le focus dans la recherche qu'avec une souris
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => $('pf-cherche').focus({ preventScroll: true }), 0);
  }
  function reappliquerFiltre() { const f = api.feuille(); if (!f.filtre) return; api.memoriser('filtrer'); appliquerFiltre(api.classeur(), api.fi()); api.classeur().modifie(); finir(); }
  function effacerFiltres() { const f = api.feuille(); if (!f.filtre) return; api.memoriser('filtrer'); f.filtre.criteres = {}; f.filtrees = new Set(); api.classeur().modifie(); finir(); }

  // ---------------------------------------------------------------------------
  // Rechercher / remplacer
  // ---------------------------------------------------------------------------
  const rech = { texte: '', par: '', casse: false, entier: false, dans: 'valeurs', feuilles: 'active', resultats: [], i: -1 };
  function optionsRech() {
    const sel = rech.feuilles === 'selection' ? api.selectionBornee() : null;
    return { casse: rech.casse, entier: rech.entier, dans: rech.dans, feuilles: sel ? 'active' : rech.feuilles, fi: api.fi(), plage: sel || undefined };
  }
  function construireRech(remplacerAussi = false) {
    // Comme Excel : plusieurs cellules choisies, la recherche (et le remplacement) se limite à elles
    { const b = api.selectionBornee(); if (b.r1 !== b.r2 || b.c1 !== b.c2) rech.feuilles = 'selection'; else if (rech.feuilles === 'selection') rech.feuilles = 'active'; }
    const panneau = $('panneau-rechercher');
    panneau.innerHTML = `
      <div class="outil">
        <label>Rechercher <input id="rr-texte" value="${ech(rech.texte)}" spellcheck="false" placeholder="texte, nombre, * ?"></label>
        <label>Remplacer par <input id="rr-par" value="${ech(rech.par)}" spellcheck="false"></label>
        <label class="case"><input type="checkbox" id="rr-casse"${rech.casse ? ' checked' : ''}> Respecter la casse</label>
        <label class="case"><input type="checkbox" id="rr-entier"${rech.entier ? ' checked' : ''}> Cellule entière</label>
        <label>Dans <select id="rr-dans"><option value="valeurs"${rech.dans === 'valeurs' ? ' selected' : ''}>les valeurs</option><option value="formules"${rech.dans === 'formules' ? ' selected' : ''}>les formules</option></select></label>
        <label>Où <select id="rr-ou"><option value="selection"${rech.feuilles === 'selection' ? ' selected' : ''}>les cellules choisies</option><option value="active"${rech.feuilles === 'active' ? ' selected' : ''}>cette feuille</option><option value="toutes"${rech.feuilles === 'toutes' ? ' selected' : ''}>tout le classeur</option></select></label>
        <div class="outil-actions">
          <button id="rr-prec" title="Précédent (Maj+Entrée)">◀</button><button id="rr-suiv" class="principal" title="Suivant (Entrée)">Suivant ▶</button><button id="rr-tous">Tout rechercher</button>
        </div>
        <div class="outil-actions"><button id="rr-remp">Remplacer</button><button id="rr-remp-tout">Remplacer tout</button></div>
        <div id="rr-statut" class="outil-statut"></div>
        <div id="rr-liste" class="rr-liste"></div>
      </div>`;
    const lire = () => { rech.texte = $('rr-texte').value; rech.par = $('rr-par').value; rech.casse = $('rr-casse').checked; rech.entier = $('rr-entier').checked; rech.dans = $('rr-dans').value; rech.feuilles = $('rr-ou').value; };
    for (const id of ['rr-texte', 'rr-casse', 'rr-entier', 'rr-dans', 'rr-ou']) $(id).addEventListener(id === 'rr-texte' ? 'input' : 'change', () => { lire(); rech.resultats = []; rech.i = -1; $('rr-liste').innerHTML = ''; $('rr-statut').textContent = ''; });
    $('rr-par').addEventListener('input', lire);
    $('rr-texte').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); suivant(e.shiftKey ? -1 : 1); } });
    $('rr-par').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); remplacerCourant(); } });
    $('rr-suiv').addEventListener('click', () => suivant(1));
    $('rr-prec').addEventListener('click', () => suivant(-1));
    $('rr-tous').addEventListener('click', () => { chercher(); listerResultats(); });
    $('rr-remp').addEventListener('click', remplacerCourant);
    $('rr-remp-tout').addEventListener('click', () => {
      if (!rech.texte) return;
      api.memoriser();
      const n = remplacer(api.classeur(), rech.texte, rech.par, optionsRech());
      rech.resultats = []; rech.i = -1; $('rr-liste').innerHTML = '';
      $('rr-statut').textContent = n ? n + ' remplacement(s) effectué(s).' : 'Aucune cellule trouvée.';
      finir();
    });
    setTimeout(() => { const el = $(remplacerAussi ? 'rr-par' : 'rr-texte'); el.focus(); el.select(); }, 0);
  }
  function chercher() {
    rech.resultats = rechercher(api.classeur(), rech.texte, optionsRech());
    const cur = api.curseur(), fi = api.fi();
    // On repart de la cellule active (le résultat suivant est le premier après elle)
    rech.i = rech.resultats.findIndex((t) => t.fi > fi || (t.fi === fi && (t.r > cur.r || (t.r === cur.r && t.c >= cur.c)))) - 1;
    if (rech.i < -1) rech.i = -1;
    $('rr-statut').textContent = rech.resultats.length ? rech.resultats.length + ' cellule(s) trouvée(s).' : (rech.texte ? 'Introuvable.' : '');
  }
  function suivant(sens) {
    if (!rech.texte) return;
    if (!rech.resultats.length) chercher();
    if (!rech.resultats.length) return;
    rech.i = (rech.i + sens + rech.resultats.length) % rech.resultats.length;
    const t = rech.resultats[rech.i];
    api.allerA(t.fi, t.r, t.c);
    $('rr-statut').textContent = (rech.i + 1) + ' sur ' + rech.resultats.length;
    for (const el of document.querySelectorAll('#rr-liste .choisi')) el.classList.remove('choisi');
    const el = document.querySelector('#rr-liste [data-i="' + rech.i + '"]'); if (el) { el.classList.add('choisi'); el.scrollIntoView({ block: 'nearest' }); }
  }
  function listerResultats() {
    const C = api.classeur();
    $('rr-liste').innerHTML = rech.resultats.slice(0, 500).map((t, i) => `<div data-i="${i}"><b>${ech(C.feuilles[t.fi].nom)}!${adresse(t.r, t.c)}</b> <span>${ech(t.texte.length > 60 ? t.texte.slice(0, 60) + '…' : t.texte)}</span></div>`).join('') + (rech.resultats.length > 500 ? '<div class="vide">… ' + (rech.resultats.length - 500) + ' de plus</div>' : '');
    $('rr-liste').querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => { rech.i = +el.dataset.i - 1; suivant(1); }));
  }
  function remplacerCourant() {
    if (!rech.texte) return;
    if (!rech.resultats.length || rech.i < 0) return suivant(1);
    const t = rech.resultats[rech.i];
    api.memoriser();
    remplacer(api.classeur(), rech.texte, rech.par, optionsRech(), [t]);
    rech.resultats.splice(rech.i, 1); rech.i--;
    finir();
    suivant(1);
  }
  function ouvrirRecherche(remplacerAussi = false) {
    if (!api.panneauOuvert('rechercher')) api.ouvrirPanneau('rechercher');
    construireRech(remplacerAussi);
  }

  // ---------------------------------------------------------------------------
  // Mise en forme conditionnelle
  // ---------------------------------------------------------------------------
  let regleEditee = null; // copie en cours d'édition (null : liste)
  function decrire(r) {
    const t = Object.fromEntries(TYPES_MFC)[r.type] || r.type;
    switch (r.type) {
      case 'valeur': return 'Valeur ' + ({ '>': '>', '<': '<', '>=': '≥', '<=': '≤', '=': '=', '<>': '≠', entre: 'entre', hors: 'hors de' }[r.op] || r.op) + ' ' + (r.v1 ?? '') + (r.op === 'entre' || r.op === 'hors' ? ' et ' + (r.v2 ?? '') : '');
      case 'texte': return 'Texte ' + ({ contient: 'contient', necontientpas: 'ne contient pas', commence: 'commence par', termine: 'finit par' }[r.op || 'contient']) + ' « ' + (r.texte || '') + ' »';
      case 'top': return (r.bas ? 'Les ' : 'Les ') + (r.n || 10) + (r.pct ? ' %' : '') + (r.bas ? ' plus petites' : ' plus grandes');
      case 'moyenne': return r.dessous ? 'Au-dessous de la moyenne' : 'Au-dessus de la moyenne';
      case 'formule': return 'Formule ' + (r.formule || '');
      default: return t;
    }
  }
  function apercuStyle(r) {
    if (r.type === 'echelle') { const c = r.couleurs && r.couleurs.length ? r.couleurs : ['#f8696b', '#ffeb84', '#63be7b']; return `background:linear-gradient(90deg,${c.join(',')})`; }
    if (r.type === 'barres') return `background:linear-gradient(90deg,${r.couleur || '#638ec6'} 60%,transparent 60%)`;
    if (r.type === 'icones') return '';
    const s = r.style || {};
    return (s.fond ? 'background:' + s.fond + ';' : '') + (s.couleur ? 'color:' + s.couleur + ';' : '') + (s.gras ? 'font-weight:700;' : '') + (s.italique ? 'font-style:italic;' : '');
  }
  function construireMfc() {
    const f = api.feuille(), panneau = $('panneau-mfc');
    if (!regleEditee) {
      panneau.innerHTML = `
        <div class="outil">
          <div class="outil-actions"><button id="mfc-nouvelle" class="principal">+ Nouvelle règle</button><button id="mfc-effacer-sel" title="Retirer les règles qui touchent la sélection">Effacer (sélection)</button></div>
          <div class="outil-titre">Règles de la feuille « ${ech(f.nom)} »${f.mfc.length > 1 ? ' — la première l\'emporte' : ''}</div>
          ${f.mfc.length ? f.mfc.map((r, i) => `<div class="mfc-regle" data-i="${i}">
            <span class="mfc-apercu" style="${apercuStyle(r)}">AaBb</span>
            <span class="mfc-texte"><b>${ech(decrire(r))}</b><small>${ech(r.plage)}</small></span>
            <span class="mfc-boutons"><button class="petit" data-act="haut" title="Monter"${i ? '' : ' disabled'}>▲</button><button class="petit" data-act="bas" title="Descendre"${i < f.mfc.length - 1 ? '' : ' disabled'}>▼</button><button class="petit" data-act="modif" title="Modifier">✎</button><button class="petit danger" data-act="suppr" title="Supprimer">✕</button></span>
          </div>`).join('') : '<p class="vide">Aucune règle. Choisissez une plage puis « Nouvelle règle ».</p>'}
        </div>`;
      $('mfc-nouvelle').addEventListener('click', () => { regleEditee = { id: 'mfc' + Date.now().toString(36), plage: plageTexte(bornee()), type: 'valeur', op: '>', v1: '0', v2: '', style: { ...STYLES_MFC[0][1] }, _i: -1 }; construireMfc(); });
      $('mfc-effacer-sel').addEventListener('click', () => {
        const s = bornee(); api.memoriser();
        f.mfc = f.mfc.filter((r) => !plagesMfc(r).some((p) => p.r2 >= s.r1 && p.r1 <= s.r2 && p.c2 >= s.c1 && p.c1 <= s.c2));
        api.classeur().modifie(); finir(); construireMfc();
      });
      panneau.querySelectorAll('.mfc-regle').forEach((el) => {
        const i = +el.dataset.i;
        el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'modif') { regleEditee = { ...JSON.parse(JSON.stringify(f.mfc[i])), _i: i }; return construireMfc(); }
          api.memoriser();
          if (act === 'suppr') f.mfc.splice(i, 1);
          if (act === 'haut' && i > 0) [f.mfc[i - 1], f.mfc[i]] = [f.mfc[i], f.mfc[i - 1]];
          if (act === 'bas' && i < f.mfc.length - 1) [f.mfc[i + 1], f.mfc[i]] = [f.mfc[i], f.mfc[i + 1]];
          api.classeur().modifie(); finir(); construireMfc();
        }));
        el.querySelector('.mfc-texte').addEventListener('click', () => { const p = plagesMfc(f.mfc[i])[0]; if (p) api.selectionner(p); api.rendre(); });
      });
      return;
    }
    const r = regleEditee;
    const opt = (liste, val) => liste.map(([v, t]) => `<option value="${ech(v)}"${String(val ?? '') === String(v) ? ' selected' : ''}>${ech(t)}</option>`).join('');
    let champs = '';
    if (r.type === 'valeur') champs = `<label>Opérateur <select id="mf-op">${opt([['>', 'supérieure à'], ['>=', 'supérieure ou égale à'], ['<', 'inférieure à'], ['<=', 'inférieure ou égale à'], ['=', 'égale à'], ['<>', 'différente de'], ['entre', 'comprise entre'], ['hors', 'non comprise entre']], r.op)}</select></label>
      <label>Valeur <input id="mf-v1" value="${ech(r.v1)}" placeholder="nombre, texte ou =formule"></label>${r.op === 'entre' || r.op === 'hors' ? `<label>et <input id="mf-v2" value="${ech(r.v2)}"></label>` : ''}`;
    if (r.type === 'texte') champs = `<label>Le texte <select id="mf-op">${opt([['contient', 'contient'], ['necontientpas', 'ne contient pas'], ['commence', 'commence par'], ['termine', 'se termine par']], r.op || 'contient')}</select></label><label>Texte <input id="mf-texte" value="${ech(r.texte || '')}"></label>`;
    if (r.type === 'formule') champs = `<label>Formule <input id="mf-formule" value="${ech(r.formule || '=')}" spellcheck="false" placeholder="=$C2>100"></label><p class="aide-petite">La formule est écrite pour la première cellule de la plage (${ech((r.plage || '').split(/[\s:;]/)[0])}) ; les références sans $ suivent chaque cellule.</p>`;
    if (r.type === 'top') champs = `<label>Les <select id="mf-bas">${opt([['0', 'plus grandes'], ['1', 'plus petites']], r.bas ? '1' : '0')}</select></label><label>Nombre <input id="mf-n" type="number" min="1" value="${ech(r.n || 10)}"></label><label class="case"><input type="checkbox" id="mf-pct"${r.pct ? ' checked' : ''}> en pourcentage</label>`;
    if (r.type === 'moyenne') champs = `<label>Valeurs <select id="mf-dessous">${opt([['0', 'au-dessus de la moyenne'], ['1', 'au-dessous de la moyenne']], r.dessous ? '1' : '0')}</select></label>`;
    if (r.type === 'echelle') { const c = r.couleurs && r.couleurs.length ? r.couleurs : ['#f8696b', '#ffeb84', '#63be7b']; champs = `<label>Couleurs <select id="mf-nb">${opt([['2', '2 couleurs'], ['3', '3 couleurs']], String(c.length))}</select></label><div class="mf-couleurs">${c.map((x, i) => `<input type="color" data-k="${i}" value="${x}" title="${['Minimum', c.length > 2 ? 'Milieu' : 'Maximum', 'Maximum'][i]}">`).join('')}</div>
      <div class="mf-presets">${ECHELLES.map((p, i) => `<button class="petit" data-preset="${i}" style="background:linear-gradient(90deg,${p.join(',')})">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</button>`).join('')}</div>`; }
    if (r.type === 'barres') champs = `<label>Couleur <input type="color" id="mf-barre" value="${r.couleur || '#638ec6'}"></label>`;
    if (r.type === 'icones') {
      const jeu = JEUX_ICONES[r.jeu] ? r.jeu : '3Arrows', n = JEUX_ICONES[jeu].icones.length;
      const seuils = r.seuils && r.seuils.length === n - 1 ? r.seuils : Array.from({ length: n - 1 }, (_, k) => Math.round((100 * (k + 1)) / n));
      champs = `<div class="mf-jeux">${Object.entries(JEUX_ICONES).map(([k, j]) => `<button class="petit${k === jeu ? ' choisi' : ''}" data-jeu="${k}" title="${ech(j.nom)}">${j.icones.map((_, i) => iconeSVG(k, i)).join('')}</button>`).join('')}</div>
        <label>Seuils (% de l'étendue) <input id="mf-seuils" value="${seuils.join(' ; ')}" placeholder="33 ; 67"></label>
        <label class="case"><input type="checkbox" id="mf-inverse"${r.inverse ? ' checked' : ''}> Ordre inverse</label>
        <label class="case"><input type="checkbox" id="mf-seule"${r.iconeSeule ? ' checked' : ''}> Afficher l'icône seulement</label>`;
    }
    const avecStyle = !['echelle', 'barres', 'icones'].includes(r.type);
    const s = r.style || {};
    panneau.innerHTML = `
      <div class="outil">
        <div class="outil-titre">${r._i >= 0 ? 'Modifier la règle' : 'Nouvelle règle'}</div>
        <label>S'applique à <input id="mf-plage" value="${ech(r.plage)}" spellcheck="false"></label>
        <button id="mf-plage-sel" class="petit">← sélection</button>
        <label>Type <select id="mf-type">${opt(TYPES_MFC, r.type)}</select></label>
        ${champs}
        ${avecStyle ? `<div class="outil-titre">Mise en forme</div>
          <label>Style <select id="mf-preset"><option value="">Personnalisé…</option>${STYLES_MFC.map(([n, st], i) => `<option value="${i}"${JSON.stringify(st) === JSON.stringify({ ...(s.fond ? { fond: s.fond } : {}), ...(s.couleur ? { couleur: s.couleur } : {}), ...(s.gras ? { gras: true } : {}) }) ? ' selected' : ''}>${ech(n)}</option>`).join('')}</select></label>
          <div class="mf-perso">
            <label class="case"><input type="checkbox" id="mf-a-fond"${s.fond ? ' checked' : ''}> Fond <input type="color" id="mf-fond" value="${s.fond || '#ffc7ce'}"></label>
            <label class="case"><input type="checkbox" id="mf-a-coul"${s.couleur ? ' checked' : ''}> Texte <input type="color" id="mf-coul" value="${s.couleur || '#9c0006'}"></label>
            <label class="case"><input type="checkbox" id="mf-gras"${s.gras ? ' checked' : ''}> Gras</label>
            <label class="case"><input type="checkbox" id="mf-ital"${s.italique ? ' checked' : ''}> Italique</label>
          </div>` : ''}
        <label class="case"><input type="checkbox" id="mf-stop"${r.arreter ? ' checked' : ''}> Arrêter si vrai (les règles suivantes ne s'appliquent pas)</label>
        <div class="mf-apercu"><span style="${apercuStyle(r)}">Aperçu 123</span></div>
        <div class="outil-actions"><button id="mf-annuler">Annuler</button><button id="mf-ok" class="principal">${r._i >= 0 ? 'Enregistrer' : 'Ajouter'}</button></div>
      </div>`;
    const lire = () => {
      r.plage = $('mf-plage').value.trim();
      const g = (id) => $(id) && $(id).value;
      if ($('mf-op')) r.op = g('mf-op');
      if ($('mf-v1')) r.v1 = g('mf-v1'); if ($('mf-v2')) r.v2 = g('mf-v2');
      if ($('mf-texte')) r.texte = g('mf-texte');
      if ($('mf-formule')) r.formule = g('mf-formule');
      if ($('mf-n')) r.n = +g('mf-n') || 10; if ($('mf-bas')) r.bas = g('mf-bas') === '1'; if ($('mf-pct')) r.pct = $('mf-pct').checked;
      if ($('mf-dessous')) r.dessous = g('mf-dessous') === '1';
      if ($('mf-barre')) r.couleur = g('mf-barre');
      if (r.type === 'echelle') r.couleurs = [...panneau.querySelectorAll('.mf-couleurs input')].map((x) => x.value);
      if (r.type === 'icones') { const n = JEUX_ICONES[r.jeu || '3Arrows'].icones.length; const sv = String($('mf-seuils').value).split(/[;\s]+/).filter(Boolean).map((x) => +x.replace(',', '.')); r.seuils = sv.length === n - 1 && sv.every((x) => !isNaN(x)) ? sv : undefined; r.inverse = $('mf-inverse').checked || undefined; r.iconeSeule = $('mf-seule').checked || undefined; delete r.style; }
      if ($('mf-a-fond')) r.style = { fond: $('mf-a-fond').checked ? g('mf-fond') : undefined, couleur: $('mf-a-coul').checked ? g('mf-coul') : undefined, gras: $('mf-gras').checked || undefined, italique: $('mf-ital').checked || undefined };
      if (r.style) for (const k of Object.keys(r.style)) if (r.style[k] === undefined) delete r.style[k];
      r.arreter = $('mf-stop').checked || undefined;
      const ap = panneau.querySelector('.mf-apercu span'); if (ap) ap.setAttribute('style', apercuStyle(r));
    };
    panneau.querySelectorAll('input, select').forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color' ? 'change' : 'input', () => lire()));
    $('mf-plage-sel').addEventListener('click', () => { $('mf-plage').value = plageTexte(bornee()); lire(); });
    $('mf-type').addEventListener('change', (e) => { lire(); r.type = e.target.value; if (r.type === 'texte') r.op = 'contient'; if (r.type === 'valeur') r.op = '>'; if (r.type === 'icones' && !r.jeu) r.jeu = '3Arrows'; if (!r.style && !['echelle', 'barres', 'icones'].includes(r.type)) r.style = { ...STYLES_MFC[0][1] }; construireMfc(); });
    panneau.querySelectorAll('[data-jeu]').forEach((b) => b.addEventListener('click', () => { lire(); r.jeu = b.dataset.jeu; r.seuils = undefined; construireMfc(); }));
    if ($('mf-op')) $('mf-op').addEventListener('change', () => { lire(); if (r.type === 'valeur') construireMfc(); });
    if ($('mf-nb')) $('mf-nb').addEventListener('change', (e) => { lire(); const c = r.couleurs; r.couleurs = e.target.value === '3' ? [c[0], '#ffeb84', c[c.length - 1]] : [c[0], c[c.length - 1]]; construireMfc(); });
    panneau.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { r.couleurs = ECHELLES[+b.dataset.preset].slice(); construireMfc(); }));
    if ($('mf-preset')) $('mf-preset').addEventListener('change', (e) => { if (e.target.value === '') return; r.style = { ...STYLES_MFC[+e.target.value][1] }; construireMfc(); });
    $('mf-annuler').addEventListener('click', () => { regleEditee = null; construireMfc(); });
    $('mf-ok').addEventListener('click', () => {
      lire();
      const plages = String(r.plage).split(/[\s;,]+/).filter(Boolean);
      if (!plages.length || plages.some((p) => !parsePlage(p.replace(/\$/g, '')))) return api.toast('Plage invalide', true);
      r.plage = plages.map((p) => p.replace(/\$/g, '').toUpperCase()).join(' ');
      if (r.type === 'formule' && !/^=./.test(r.formule || '')) return api.toast('Écrivez une formule qui commence par =', true);
      api.memoriser();
      const i = r._i; const regle = { ...r }; delete regle._i;
      if (i >= 0) f.mfc[i] = regle; else f.mfc.push(regle);
      regleEditee = null;
      api.classeur().modifie(); finir(); construireMfc();
    });
  }
  function ouvrirMfc() { regleEditee = null; if (!api.panneauOuvert('mfc')) api.ouvrirPanneau('mfc'); else construireMfc(); }
  // Raccourci « Règles rapides » depuis le menu
  function mfcRapide(type, extra = {}) {
    const f = api.feuille(); api.memoriser();
    f.mfc.push({ id: 'mfc' + Date.now().toString(36), plage: plageTexte(bornee()), type, style: { ...STYLES_MFC[0][1] }, ...extra });
    api.classeur().modifie(); finir();
    if (api.panneauOuvert('mfc')) construireMfc();
  }

  // ---------------------------------------------------------------------------
  // Valeur cible
  // ---------------------------------------------------------------------------
  const cible = { formule: '', valeur: '', variable: '' };
  function construireCible() {
    if (!cible.formule) cible.formule = adresse(api.curseur().r, api.curseur().c);
    $('panneau-cible').innerHTML = `
      <div class="outil">
        <p class="aide-petite">Trouve la valeur d'une cellule qui donne le résultat voulu dans une formule (taux actuariel, prime pure, annuité…).</p>
        <label>Cellule à définir <input id="vc-formule" value="${ech(cible.formule)}" spellcheck="false" placeholder="B10 (une formule)"></label>
        <label>Valeur à atteindre <input id="vc-valeur" value="${ech(cible.valeur)}" placeholder="0"></label>
        <label>Cellule à modifier <input id="vc-variable" value="${ech(cible.variable)}" spellcheck="false" placeholder="B2 (une valeur)"></label>
        <div class="outil-actions"><button id="vc-ok" class="principal">Résoudre</button></div>
        <div id="vc-statut" class="outil-statut"></div>
      </div>`;
    for (const k of ['formule', 'valeur', 'variable']) $('vc-' + k).addEventListener('input', (e) => { cible[k] = e.target.value; });
    for (const k of ['formule', 'variable']) $('vc-' + k).addEventListener('focus', (e) => { e.target.dataset.prendre = '1'; });
    $('vc-ok').addEventListener('click', () => {
      const a = parseAdresse(cible.formule.replace(/\$/g, '').toUpperCase()), b = parseAdresse(cible.variable.replace(/\$/g, '').toUpperCase());
      const v = +String(cible.valeur).replace(/[\s ]/g, '').replace(',', '.');
      if (!a || !b) return api.toast('Indiquez deux cellules (ex. B10 et B2)', true);
      if (String(cible.valeur).trim() === '' || isNaN(v)) return api.toast('La valeur à atteindre doit être un nombre', true);
      api.memoriser();
      let res;
      try { res = valeurCible(api.classeur(), api.fi(), a, v, b); } catch (e) { return api.toast(e.message, true); }
      const C = api.classeur(), fi = api.fi();
      const fx = (x) => formater(x, (C.feuilles[fi].get(b.r, b.c) || {}).z);
      $('vc-statut').innerHTML = res.ok
        ? `✔ Solution trouvée en ${res.iterations} itération(s) : <b>${adresse(b.r, b.c)} = ${ech(fx(res.x))}</b><br>${adresse(a.r, a.c)} = ${ech(formater(res.y, (C.feuilles[fi].get(a.r, a.c) || {}).z))}`
        : `⚠ Pas de solution exacte trouvée. Meilleure valeur : ${adresse(b.r, b.c)} = ${ech(fx(res.x))} (${adresse(a.r, a.c)} = ${ech(res.y instanceof ErreurFormule ? res.y.code : formater(res.y))}).`;
      api.selectionner({ r1: b.r, c1: b.c, r2: b.r, c2: b.c });
      finir();
    });
  }
  function ouvrirCible() { cible.formule = ''; if (!api.panneauOuvert('cible')) api.ouvrirPanneau('cible'); else construireCible(); }
  // Un clic sur la feuille remplit le champ de cellule actif du panneau Valeur cible
  function celluleChoisie(r, c) {
    const el = document.activeElement;
    if (!el || !['vc-formule', 'vc-variable'].includes(el.id) || !api.panneauOuvert('cible')) return false;
    el.value = adresse(r, c); cible[el.id === 'vc-formule' ? 'formule' : 'variable'] = el.value;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Somme automatique
  // ---------------------------------------------------------------------------
  function sommeAuto(fonction = 'SOMME') {
    const C = api.classeur(), fi = api.fi(), s = bornee();
    if (s.r1 === s.r2 && s.c1 === s.c2) return api.commencerEdition(formuleAutomatique(C, fi, s.r1, s.c1, fonction));
    // Plage choisie : une formule sous chaque colonne (ou à droite de chaque ligne si la plage est une seule colonne… de lignes)
    api.memoriser();
    const versBas = s.r2 > s.r1;
    if (versBas) for (let c = s.c1; c <= s.c2; c++) C.saisir(fi, s.r2 + 1, c, '=' + fonction + '(' + adresse(s.r1, c) + ':' + adresse(s.r2, c) + ')');
    else for (let r = s.r1; r <= s.r2; r++) C.saisir(fi, r, s.c2 + 1, '=' + fonction + '(' + adresse(r, s.c1) + ':' + adresse(r, s.c2) + ')');
    finir();
  }
  function menuSomme(x, y) {
    api.ouvrirMenu(x, y, [['Σ Somme', () => sommeAuto('SOMME')], ['Moyenne', () => sommeAuto('MOYENNE')], ['Nombre (NB)', () => sommeAuto('NB')], ['Max', () => sommeAuto('MAX')], ['Min', () => sommeAuto('MIN')]]);
  }

  // ---------------------------------------------------------------------------
  // Impression / PDF
  // ---------------------------------------------------------------------------
  function imprimer({ selectionSeule = false } = {}) {
    const C = api.classeur(), fi = api.fi(), f = api.feuille();
    const s = selectionSeule ? bornee() : { r1: 0, c1: 0, r2: Math.max(0, f.zone.r2), c2: Math.max(0, f.zone.c2) };
    let zone = $('impression');
    if (!zone) { zone = document.createElement('div'); zone.id = 'impression'; document.body.appendChild(zone); }
    const cache = new Set();
    let html = `<h1>${ech(C.nomFichier || '')} — ${ech(f.nom)}</h1><table><colgroup>${Array.from({ length: s.c2 - s.c1 + 1 }, (_, i) => { const w = f.largeurs[s.c1 + i]; return `<col style="width:${w === undefined ? 90 : w}px">`; }).join('')}</colgroup>`;
    for (let r = s.r1; r <= s.r2; r++) {
      if (f.hauteurs[r] === 0 || (f.filtrees && f.filtrees.has(r))) continue;
      html += `<tr style="height:${f.hauteurs[r] || 20}px">`;
      for (let c = s.c1; c <= s.c2; c++) {
        if (f.largeurs[c] === 0 || cache.has(r + ',' + c)) continue;
        const fus = f.fusions.find((m) => m.r1 === r && m.c1 === c);
        if (fus) for (let rr = fus.r1; rr <= fus.r2; rr++) for (let cc = fus.c1; cc <= fus.c2; cc++) if (rr !== r || cc !== c) cache.add(rr + ',' + cc);
        const cel = f.get(r, c), st = (cel && cel.s) || {};
        const v = cel ? C.valeur(fi, r, c) : null;
        const t = cel && v !== null && v !== undefined ? (v instanceof ErreurFormule ? v.code : formater(v, cel.z)) : '';
        let css = '';
        if (st.gras) css += 'font-weight:700;'; if (st.italique) css += 'font-style:italic;'; if (st.souligne) css += 'text-decoration:underline;';
        if (st.couleur) css += 'color:' + st.couleur + ';'; if (st.fond) css += 'background:' + st.fond + ';'; if (st.taille) css += 'font-size:' + Math.round(st.taille * 0.75) + 'pt;';
        css += 'text-align:' + (st.align || (typeof v === 'number' ? 'right' : 'left')) + ';';
        if (st.renvoi) css += 'white-space:pre-wrap;';
        const b = st.bordures; if (b) for (const [k, p] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) if (b[k]) css += `border-${p}:${{ thin: 1, medium: 2, thick: 3 }[b[k]]}px solid #000;`;
        html += `<td${fus ? ` rowspan="${fus.r2 - fus.r1 + 1}" colspan="${fus.c2 - fus.c1 + 1}"` : ''} style="${css}">${ech(t)}</td>`;
      }
      html += '</tr>';
    }
    zone.innerHTML = html + '</table>';
    document.body.classList.add('impression');
    const fin = () => { document.body.classList.remove('impression'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); setTimeout(fin, 1000); }, 50);
  }

  // ---------------------------------------------------------------------------
  // Masquer / afficher lignes et colonnes
  // ---------------------------------------------------------------------------
  function masquer(axe, montrer) {
    const f = api.feuille(), s = api.selection();
    const [a, b] = axe === 'r' ? [s.r1, Math.min(s.r2, Math.max(f.zone.r2 + 50, s.r1))] : [s.c1, Math.min(s.c2, Math.max(f.zone.c2 + 20, s.c1))];
    const tailles = axe === 'r' ? f.hauteurs : f.largeurs;
    api.memoriser();
    let n = 0;
    if (!montrer) { for (let i = a; i <= b; i++) { tailles[i] = 0; n++; } }
    else {
      for (let i = a; i <= b; i++) if (tailles[i] === 0) { delete tailles[i]; n++; }
      if (!n) { // rien de masqué dans la sélection : on affiche ce qui est caché juste à côté
        for (let i = a - 1; i >= 0 && tailles[i] === 0; i--) { delete tailles[i]; n++; }
        for (let i = b + 1; tailles[i] === 0; i++) { delete tailles[i]; n++; }
      }
      if (axe === 'r' && f.filtrees && f.filtrees.size) for (let i = a; i <= b; i++) if (f.filtrees.delete(i)) n++;
    }
    api.classeur().modifie(); finir();
    if (montrer && !n) api.toast('Aucune ' + (axe === 'r' ? 'ligne' : 'colonne') + ' masquée ici');
  }

  // ---------------------------------------------------------------------------
  // Volets
  // ---------------------------------------------------------------------------
  function figer(quoi) {
    const f = api.feuille(), cur = api.curseur();
    api.memoriser('affichage');
    if (quoi === 'aucun') f.figer = null;
    else if (quoi === 'ligne') f.figer = { r: 1, c: 0 };
    else if (quoi === 'colonne') f.figer = { r: 0, c: 1 };
    else f.figer = cur.r || cur.c ? { r: cur.r, c: cur.c } : null;
    api.classeur().modifie(); finir();
    api.toast(f.figer ? 'Volets figés' + (f.figer.r ? ' : ' + f.figer.r + ' ligne(s)' : '') + (f.figer.c ? (f.figer.r ? ' et ' : ' : ') + f.figer.c + ' colonne(s)' : '') : 'Volets libérés');
  }
  function menuFiger(x, y) {
    const f = api.feuille();
    api.ouvrirMenu(x, y, [
      ['Figer les volets (au-dessus et à gauche de ' + adresse(api.curseur().r, api.curseur().c) + ')', () => figer('cellule')],
      ['Figer la ligne supérieure', () => figer('ligne')], ['Figer la première colonne', () => figer('colonne')],
      f.figer ? ['Libérer les volets', () => figer('aucun')] : null,
      null,
      ['Masquer les lignes', () => masquer('r', false)], ['Afficher les lignes masquées', () => masquer('r', true)],
      ['Masquer les colonnes', () => masquer('c', false)], ['Afficher les colonnes masquées', () => masquer('c', true)],
    ].filter((x, i, t) => x !== null || (i > 0 && t[i - 1] !== null)));
  }
  function menuTri(x, y) {
    const f = api.feuille();
    api.ouvrirMenu(x, y, [
      ['↑ Trier de A à Z', () => trierRapide(false)], ['↓ Trier de Z à A', () => trierRapide(true)], ['Tri personnalisé…', ouvrirTri], null,
      [f.filtre ? 'Retirer le filtre' : 'Filtrer (▾ dans les en-têtes)', basculerFiltre],
      ...(f.filtre ? [['Effacer les critères du filtre', effacerFiltres], ['Réappliquer le filtre', reappliquerFiltre]] : []),
      null, ['Validation des données…', ouvrirValidation],
    ]);
  }
  function menuMfc(x, y) {
    api.ouvrirMenu(x, y, [
      ['Gérer les règles…', ouvrirMfc], null,
      ['Valeurs en double', () => mfcRapide('doublons')], ['10 plus grandes valeurs', () => mfcRapide('top', { n: 10, style: { ...STYLES_MFC[2][1] } })],
      ['Au-dessus de la moyenne', () => mfcRapide('moyenne', { style: { ...STYLES_MFC[2][1] } })], ['Valeurs négatives en rouge', () => mfcRapide('valeur', { op: '<', v1: '0', style: { couleur: '#c00000' } })],
      ['Échelle vert – jaune – rouge', () => mfcRapide('echelle', { couleurs: ['#f8696b', '#ffeb84', '#63be7b'], style: undefined })],
      ['Barres de données', () => mfcRapide('barres', { couleur: '#638ec6', style: undefined })],
      ['Jeu d\'icônes', Object.entries(JEUX_ICONES).slice(0, 7).map(([k, j]) => [j.nom, () => mfcRapide('icones', { jeu: k, style: undefined })])], null,
      ['Effacer les règles de la sélection', () => { const f = api.feuille(), s = bornee(); api.memoriser(); f.mfc = f.mfc.filter((r) => !plagesMfc(r).some((p) => p.r2 >= s.r1 && p.r1 <= s.r2 && p.c2 >= s.c1 && p.c1 <= s.c2)); api.classeur().modifie(); finir(); }],
      ['Effacer les règles de la feuille', () => { api.memoriser(); api.feuille().mfc = []; api.classeur().modifie(); finir(); }],
    ]);
  }


  // ---------------------------------------------------------------------------
  // Validation des données
  // ---------------------------------------------------------------------------
  let valEditee = null;
  let entourer = false;
  function construireValidation() {
    const f = api.feuille(), cur = api.curseur();
    if (!valEditee) {
      const existante = validationDe(f, cur.r, cur.c);
      valEditee = existante ? { ...JSON.parse(JSON.stringify(existante)), _ref: existante } : { id: 'dv' + Date.now().toString(36), plage: plageTexte(bornee()), type: 'liste', liste: '', op: 'entre', v1: '', v2: '', erreur: { style: 'stop' } };
    }
    const v = valEditee;
    const opt = (liste, val) => liste.map(([k, t]) => `<option value="${ech(k)}"${String(val ?? '') === String(k) ? ' selected' : ''}>${ech(t)}</option>`).join('');
    const e = v.erreur || { style: 'stop' }, m = v.message || {};
    const indice = { date: 'jj/mm/aaaa ou =formule', heure: 'hh:mm ou =formule', longueur: 'nombre de caractères' }[v.type] || 'nombre ou =formule';
    let champs = '';
    if (v.type === 'liste') champs = `<label>Source <input id="dv-liste" value="${ech(v.liste || '')}" spellcheck="false" placeholder="Oui;Non;Peut-être  ou  =$H$2:$H$9"></label>
      <button id="dv-liste-sel" class="petit">← sélection comme source</button>
      <label class="case"><input type="checkbox" id="dv-fleche"${v.fleche !== false ? ' checked' : ''}> Liste déroulante dans la cellule</label>`;
    else if (v.type === 'formule') champs = `<label>Formule <input id="dv-v1" value="${ech(v.v1 || '=')}" spellcheck="false" placeholder="=ET(B2>0;B2<C2)"></label><p class="aide-petite">Vraie pour une saisie valide, écrite pour la première cellule de la plage.</p>`;
    else champs = `<label>Données <select id="dv-op">${opt(OPS_VALIDATION, v.op || 'entre')}</select></label>
      <label>${v.op === 'entre' || v.op === 'hors' || !v.op ? 'Minimum' : 'Valeur'} <input id="dv-v1" value="${ech(v.v1 ?? '')}" placeholder="${indice}"></label>
      ${!v.op || v.op === 'entre' || v.op === 'hors' ? `<label>Maximum <input id="dv-v2" value="${ech(v.v2 ?? '')}" placeholder="${indice}"></label>` : ''}`;
    $('panneau-validation').innerHTML = `
      <div class="outil">
        <label>S'applique à <input id="dv-plage" value="${ech(v.plage)}" spellcheck="false"></label>
        <button id="dv-plage-sel" class="petit">← sélection</button>
        <label>Autoriser <select id="dv-type">${opt(TYPES_VALIDATION, v.type)}</select></label>
        ${champs}
        <label class="case"><input type="checkbox" id="dv-vides"${v.vides !== false ? ' checked' : ''}> Ignorer si vide</label>
        <div class="outil-titre">Message de saisie (quand la cellule est choisie)</div>
        <label>Titre <input id="dv-mt" value="${ech(m.titre || '')}"></label>
        <label>Message <input id="dv-mx" value="${ech(m.texte || '')}"></label>
        <div class="outil-titre">Alerte d'erreur</div>
        <label>Style <select id="dv-style">${opt([['stop', '⛔ Arrêt (saisie refusée)'], ['avertissement', '⚠ Avertissement (on demande)'], ['information', 'ℹ Information'], ['aucune', 'Aucune alerte']], e.style || 'stop')}</select></label>
        <label>Titre <input id="dv-et" value="${ech(e.titre || '')}"></label>
        <label>Message <input id="dv-ex" value="${ech(e.texte || '')}" placeholder="${ech(decrireValidation(v))}"></label>
        <div class="outil-actions"><button id="dv-ok" class="principal">Appliquer</button><button id="dv-effacer" class="danger">Effacer la validation</button></div>
        <div class="outil-actions"><button id="dv-entourer" class="${entourer ? 'actif' : ''}">⭕ Entourer les données non valides</button></div>
        <div id="dv-statut" class="outil-statut"></div>
        ${f.validations.length ? `<div class="outil-titre">Règles de la feuille</div>${f.validations.map((x, i) => `<div class="mfc-regle" data-i="${i}"><span class="mfc-texte"><b>${ech(decrireValidation(x))}</b><small>${ech(x.plage)}</small></span></div>`).join('')}` : ''}
      </div>`;
    const lire = () => {
      v.plage = $('dv-plage').value.trim(); v.type = $('dv-type').value;
      if ($('dv-liste')) { v.liste = $('dv-liste').value; v.fleche = $('dv-fleche').checked ? undefined : false; }
      if ($('dv-op')) v.op = $('dv-op').value;
      if ($('dv-v1')) v.v1 = $('dv-v1').value; if ($('dv-v2')) v.v2 = $('dv-v2').value;
      v.vides = $('dv-vides').checked ? undefined : false;
      const mt = $('dv-mt').value.trim(), mx = $('dv-mx').value.trim();
      v.message = mt || mx ? { titre: mt, texte: mx } : undefined;
      v.erreur = { style: $('dv-style').value, titre: $('dv-et').value.trim(), texte: $('dv-ex').value.trim() };
    };
    $('dv-type').addEventListener('change', () => { lire(); if (v.type === 'formule' && !String(v.v1 || '').startsWith('=')) v.v1 = '='; construireValidation(); });
    if ($('dv-op')) $('dv-op').addEventListener('change', () => { lire(); construireValidation(); });
    $('dv-plage-sel').addEventListener('click', () => { $('dv-plage').value = plageTexte(bornee()); });
    if ($('dv-liste-sel')) $('dv-liste-sel').addEventListener('click', () => { const s = bornee(); $('dv-liste').value = '=$' + colVersLettres(s.c1) + '$' + (s.r1 + 1) + (s.r1 === s.r2 && s.c1 === s.c2 ? '' : ':$' + colVersLettres(s.c2) + '$' + (s.r2 + 1)); });
    $('dv-ok').addEventListener('click', () => {
      lire();
      const plages = String(v.plage).split(/[\s;,]+/).filter(Boolean).map((t) => parsePlage(t.replace(/\$/g, '')));
      if (!plages.length || plages.some((x) => !x)) return api.toast('Plage invalide', true);
      if (v.type === 'liste' && !String(v.liste || '').trim()) return api.toast('Indiquez les éléments de la liste (séparés par ;) ou une plage =$H$2:$H$9', true);
      if (v.type === 'formule' && !/^=./.test(v.v1 || '')) return api.toast('Écrivez une formule qui commence par =', true);
      api.memoriser();
      const regle = JSON.parse(JSON.stringify({ ...v, _ref: undefined }));
      regle.plage = plages.map(plageTexte).join(' ');
      // Une cellule n'a qu'une règle : les règles entièrement recouvertes par la nouvelle disparaissent
      f.validations = f.validations.filter((x) => x !== v._ref && !plagesMfc(x).every((q) => plages.some((P) => q.r1 >= P.r1 && q.r2 <= P.r2 && q.c1 >= P.c1 && q.c2 <= P.c2)));
      f.validations.unshift(regle);
      valEditee = null;
      api.classeur().modifie(); finir();
      const inv = cellulesInvalides(api.classeur(), api.fi()).length;
      construireValidation();
      $('dv-statut').textContent = '✔ Validation appliquée à ' + regle.plage + (inv ? ' — ' + inv + ' cellule(s) déjà remplie(s) ne la respectent pas' : '');
    });
    $('dv-effacer').addEventListener('click', () => {
      const sel = bornee(); api.memoriser();
      f.validations = f.validations.filter((x) => !plagesMfc(x).some((q) => q.r2 >= sel.r1 && q.r1 <= sel.r2 && q.c2 >= sel.c1 && q.c1 <= sel.c2));
      valEditee = null; api.classeur().modifie(); finir(); construireValidation();
    });
    $('dv-entourer').addEventListener('click', () => {
      entourer = !entourer; api.rendre();
      const n = cellulesInvalides(api.classeur(), api.fi()).length;
      construireValidation();
      $('dv-statut').textContent = entourer ? (n ? '⭕ ' + n + ' cellule(s) non valide(s) entourée(s)' : 'Toutes les cellules sont valides') : '';
    });
    $('panneau-validation').querySelectorAll('.mfc-regle').forEach((el) => el.addEventListener('click', () => { const x = f.validations[+el.dataset.i]; valEditee = { ...JSON.parse(JSON.stringify(x)), _ref: x }; const p = plagesMfc(x)[0]; if (p) api.selectionner(p); api.rendre(); construireValidation(); }));
  }
  function ouvrirValidation() { valEditee = null; if (!api.panneauOuvert('validation')) api.ouvrirPanneau('validation'); else construireValidation(); }

  // Liste déroulante d'une cellule à validation « liste »
  const listeDV = document.createElement('div');
  listeDV.id = 'liste-validation'; listeDV.hidden = true; listeDV.setAttribute('role', 'listbox');
  document.body.appendChild(listeDV);
  let listeCible = null;
  function fermerListe() { listeDV.hidden = true; listeCible = null; }
  document.addEventListener('mousedown', (e) => { if (!listeDV.hidden && !listeDV.contains(e.target) && e.target.id !== 'fleche-liste') fermerListe(); });
  function ouvrirListe(r, c, rect) {
    const C = api.classeur(), fi = api.fi(), regle = validationDe(api.feuille(), r, c);
    if (!regle || regle.type !== 'liste') return;
    const items = elementsListe(C, fi, regle, r, c);
    const actuel = String(C.texte(fi, r, c));
    listeCible = { r, c, items, i: Math.max(0, items.indexOf(actuel)) };
    listeDV.innerHTML = items.length ? items.map((t, i) => `<div data-i="${i}" class="${t === actuel ? 'choisi' : ''}">${ech(t) || '&nbsp;'}</div>`).join('') : '<div class="vide">(liste vide)</div>';
    listeDV.hidden = false;
    listeDV.style.minWidth = Math.max(120, rect.width) + 'px';
    listeDV.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - listeDV.offsetWidth - 4)) + 'px';
    const h = listeDV.offsetHeight;
    listeDV.style.top = (rect.bottom + h + 4 > window.innerHeight ? Math.max(4, rect.top - h - 2) : rect.bottom + 1) + 'px';
    listeDV.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => choisirListe(+el.dataset.i)));
    const sel = listeDV.querySelector('.choisi'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function choisirListe(i) {
    if (!listeCible) return;
    const { r, c, items } = listeCible;
    fermerListe();
    if (items[i] === undefined) return;
    api.memoriser(api.verrouillee && api.verrouillee(r, c) ? null : 'cellules');
    api.classeur().saisir(api.fi(), r, c, items[i].startsWith('=') ? "'" + items[i] : items[i]);
    finir();
  }
  // Clavier dans la liste ouverte (renvoie vrai si la touche a été prise)
  function toucheListe(e) {
    if (listeDV.hidden || !listeCible) return false;
    const n = listeCible.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { listeCible.i = (listeCible.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(1, n); listeDV.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('choisi', +el.dataset.i === listeCible.i)); const el = listeDV.querySelector('.choisi'); if (el) el.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' || e.key === 'Tab') choisirListe(listeCible.i);
    else if (e.key === 'Escape') fermerListe();
    else return false;
    e.preventDefault(); e.stopPropagation();
    return true;
  }
  /** Après une saisie : refuse, demande ou prévient selon la règle de la cellule. Renvoie vrai si la saisie est gardée. */
  function controlerSaisie(r, c) {
    const C = api.classeur(), fi = api.fi(), regle = validationDe(api.feuille(), r, c);
    if (!regle || valeurValide(C, fi, regle, r, c)) return true;
    const e = regle.erreur || { style: 'stop' };
    if (e.style === 'aucune') return true;
    const msg = (e.titre ? e.titre + '\n\n' : '') + (e.texte || 'Cette valeur ne correspond pas aux restrictions de validation des données de cette cellule.\n' + decrireValidation(regle));
    if (e.style === 'avertissement') return confirm(msg + '\n\nGarder cette valeur ?');
    alert(msg);
    return e.style === 'information';
  }

  return {
    zone: (sel) => zoneContigue(api.feuille(), sel.r1, sel.c1),
    validation: { ouvrir: ouvrirValidation, ouvrirListe, fermerListe, toucheListe, controlerSaisie, entourer: () => entourer },
    panneaux: { validation: construireValidation, tri: construireTri, rechercher: () => construireRech(false), mfc: construireMfc, cible: construireCible },
    trierRapide, ouvrirTri, basculerFiltre, ouvrirFiltre, fermerPopup, reappliquerFiltre, effacerFiltres, ouvrirRecherche, rechercherSuivant: suivant,
    ouvrirMfc, ouvrirCible, celluleChoisie, sommeAuto, menuSomme, imprimer, masquer, figer, menuFiger, menuTri, menuMfc,
    rafraichir() { if (api.panneauOuvert('mfc') && !regleEditee) construireMfc(); },
    curseurChange() { if (api.panneauOuvert('validation')) { const cur = api.curseur(), x = validationDe(api.feuille(), cur.r, cur.c); if (x && (!valEditee || valEditee._ref !== x)) { valEditee = null; construireValidation(); } } },
  };
}
