// Interface des tableaux croisés dynamiques : création (source, emplacement), liste des champs à ranger
// en Lignes / Colonnes / Valeurs / Filtres (des listes, pas du glisser-déposer : ça marche aussi au doigt),
// fonctions et affichage des valeurs, filtres du rapport, totaux, actualisation.

import { champsSource, ecrireTCD, calculerTCD, tcdA, actualiserTout, valeursChamp, FONCTIONS_TCD, AFFICHAGES_TCD, libelleValeur, resoudreSource } from './tcd.js';
import { zoneContigue } from './donnees.js';
import { adresse, parseAdresse, formater } from './formules.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ZONES = [['lignes', 'Lignes'], ['colonnes', 'Colonnes'], ['valeurs', 'Valeurs'], ['filtres', 'Filtres']];

/**
 * api : { classeur(), fi(), feuille(), selection(), curseur(), selectionner(p), activerFeuille(i), nouvelleFeuille(nom) → index,
 *         rendre(), sauvegarder(), memoriser(), toast(), ouvrirPanneau(nom), panneauOuvert(nom) }
 */
export function installerTCD(api) {
  const $ = (id) => document.getElementById(id);
  let courant = null; // { fi, spec } du tableau affiché dans le panneau
  let creation = null; // { source, ou: 'nouvelle'|'ici', cellule }
  let filtreOuvert = null;

  function plageTexte(p) { return adresse(p.r1, p.c1, true, true) + ':' + adresse(p.r2, p.c2, true, true); }
  const nomFeuille = (n) => (/^[A-Za-z_][\w.]*$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");

  function actualiser(silencieux = false) {
    if (!courant) return;
    try {
      const res = ecrireTCD(api.classeur(), courant.fi, courant.spec);
      api.sauvegarder(); api.rendre();
      if (!silencieux) api.toast('Tableau croisé actualisé (' + res.enregistrements + ' ligne(s) de données)');
      return res;
    } catch (e) { api.toast(e.message, true); return null; }
  }

  function construire() {
    const panneau = $('panneau-tcd');
    const C = api.classeur();
    // Le tableau sous le curseur (ou celui qu'on vient de créer) ; sinon le formulaire de création
    const cur = api.curseur();
    const ici = tcdA(api.feuille(), cur.r, cur.c);
    if (ici) courant = { fi: api.fi(), spec: ici };
    if (courant && !(C.feuilles[courant.fi] && C.feuilles[courant.fi].tcd.includes(courant.spec))) courant = null;
    if (!courant) return construireCreation(panneau);
    const { spec } = courant;
    let champs;
    try { champs = champsSource(C, spec.source, courant.fi); } catch (e) { panneau.innerHTML = `<div class="outil"><p class="outil-statut">⚠ ${ech(e.message)}</p><label>Source <input id="tcd-source" value="${ech(spec.source)}"></label><div class="outil-actions"><button id="tcd-source-ok" class="principal">Changer la source</button><button id="tcd-suppr" class="danger">Supprimer le tableau</button></div></div>`; brancherSource(); brancherSuppr(); return; }
    const zoneDe = (ch) => ZONES.find(([z]) => (spec[z] || []).some((x) => (typeof x === 'string' ? x : x.champ) === ch))?.[0] || '';
    const opt = (liste, val) => liste.map(([k, t]) => `<option value="${ech(k)}"${String(val ?? '') === String(k) ? ' selected' : ''}>${ech(t)}</option>`).join('');
    const element = (z, x, i, n) => {
      const nom = typeof x === 'string' ? x : x.champ;
      const fleches = `<button class="petit" data-z="${z}" data-i="${i}" data-act="haut"${i ? '' : ' disabled'}>▲</button><button class="petit" data-z="${z}" data-i="${i}" data-act="bas"${i < n - 1 ? '' : ' disabled'}>▼</button><button class="petit" data-z="${z}" data-i="${i}" data-act="retirer" title="Retirer">✕</button>`;
      if (z === 'valeurs') return `<div class="tcd-el"><span class="tcd-nom">${ech(nom)}</span><select data-z="valeurs" data-i="${i}" data-prop="fn">${opt(FONCTIONS_TCD, x.fn || 'somme')}</select><select data-z="valeurs" data-i="${i}" data-prop="affichage">${opt(AFFICHAGES_TCD, x.affichage || 'normal')}</select>${fleches}</div>`;
      if (z === 'filtres') return `<div class="tcd-el"><span class="tcd-nom">${ech(nom)}</span><button class="petit" data-filtre="${i}">${x.visibles ? (x.visibles.length === 1 ? ech(x.visibles[0]) : x.visibles.length + ' choisis') : '(Tous)'} ▾</button>${fleches}</div>
        ${filtreOuvert === i ? `<div class="tcd-filtre">${valeursChamp(C, spec, nom, courant.fi).map((v) => `<label class="case"><input type="checkbox" data-fv="${ech(v.texte)}"${!x.visibles || x.visibles.includes(v.texte) ? ' checked' : ''}> ${ech(v.texte)}</label>`).join('')}<div class="outil-actions"><button class="petit" id="tcd-fv-tous">Tous</button><button class="petit principal" id="tcd-fv-ok">OK</button></div></div>` : ''}`;
      return `<div class="tcd-el"><span class="tcd-nom">${ech(nom)}</span>${fleches}</div>`;
    };
    const zoneF = C.feuilles[courant.fi];
    // Aperçu du résultat (affiché sur téléphone, où le panneau couvre la feuille)
    let apercu = '';
    try {
      const res = calculerTCD(C, spec, courant.fi);
      apercu = '<table>' + res.cellules.slice(0, 14).map((l) => '<tr>' + Array.from({ length: Math.min(res.largeur, 6) }, (_, j) => { const x = l[j]; const t = x && x.v !== null && x.v !== undefined ? (typeof x.v === 'number' ? formater(x.v, x.z) : String(x.v)) : ''; return `<td class="${x && x.s ? 'e' : ''}${typeof (x && x.v) === 'number' ? ' n' : ''}">${ech(t)}</td>`; }).join('') + '</tr>').join('') + '</table>' + (res.hauteur > 14 || res.largeur > 6 ? '<div class="aide-petite">… aperçu partiel</div>' : '');
    } catch { /* erreur montrée par l'actualisation */ }
    panneau.innerHTML = `
      <div class="tcd-apercu">${apercu}</div>
      <div class="outil">
        <div class="tcd-tete">📊 ${ech(zoneF.nom)}!${spec.zone ? adresse(spec.zone.r1, spec.zone.c1) + ':' + adresse(spec.zone.r2, spec.zone.c2) : ''}</div>
        <label>Source <input id="tcd-source" value="${ech(spec.source)}" spellcheck="false"></label>
        <div class="outil-titre">Champs</div>
        <p class="aide-petite">Choisissez où va chaque champ ; les valeurs sont calculées pour chaque croisement de lignes et de colonnes.</p>
        <div class="tcd-champs">${champs.map((ch) => `<label><span>${ech(ch)}</span><select data-champ="${ech(ch)}">${opt([['', '—'], ...ZONES], zoneDe(ch))}</select></label>`).join('')}</div>
        ${ZONES.map(([z, t]) => `<div class="outil-titre">${t}</div>${(spec[z] || []).length ? (spec[z] || []).map((x, i, a) => element(z, x, i, a.length)).join('') : '<p class="aide-petite">—</p>'}`).join('')}
        <div class="outil-titre">Options</div>
        <label class="case"><input type="checkbox" id="tcd-tl"${spec.totauxLignes !== false ? ' checked' : ''}> Total général des lignes</label>
        <label class="case"><input type="checkbox" id="tcd-tc"${spec.totauxColonnes !== false ? ' checked' : ''}> Total général des colonnes</label>
        <label class="case"><input type="checkbox" id="tcd-st"${spec.sousTotaux !== false ? ' checked' : ''}> Sous-totaux</label>
        <label class="case"><input type="checkbox" id="tcd-if"${spec.ignorerFiltrees ? ' checked' : ''}> Ignorer les lignes masquées par le filtre de la source</label>
        <div class="outil-actions"><button id="tcd-actualiser" class="principal">↻ Actualiser</button><button id="tcd-tout">↻ Tout actualiser</button><button id="tcd-nouveau">+ Nouveau</button><button id="tcd-suppr" class="danger">Supprimer</button></div>
        <div id="tcd-statut" class="outil-statut"></div>
      </div>`;
    const changer = (fn) => { api.memoriser(); fn(); filtreOuvert = typeof filtreOuvert === 'number' && spec.filtres && spec.filtres[filtreOuvert] ? filtreOuvert : null; const res = actualiser(true); construire(); if (res && res.avertissement) $('tcd-statut').textContent = res.avertissement; };
    panneau.querySelectorAll('select[data-champ]').forEach((sel) => sel.addEventListener('change', () => changer(() => {
      const ch = sel.dataset.champ;
      for (const [z] of ZONES) spec[z] = (spec[z] || []).filter((x) => (typeof x === 'string' ? x : x.champ) !== ch);
      const z = sel.value;
      if (z === 'valeurs') spec.valeurs.push({ champ: ch, fn: estNumerique(ch) ? 'somme' : 'nbval', affichage: 'normal' });
      else if (z === 'filtres') spec.filtres.push({ champ: ch, visibles: null });
      else if (z) spec[z].push(ch);
    })));
    panneau.querySelectorAll('select[data-prop]').forEach((sel) => sel.addEventListener('change', () => changer(() => { spec.valeurs[+sel.dataset.i][sel.dataset.prop] = sel.value; })));
    panneau.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => changer(() => {
      const t = spec[b.dataset.z], i = +b.dataset.i;
      if (b.dataset.act === 'retirer') t.splice(i, 1);
      else { const j = b.dataset.act === 'haut' ? i - 1 : i + 1; [t[i], t[j]] = [t[j], t[i]]; }
    })));
    panneau.querySelectorAll('button[data-filtre]').forEach((b) => b.addEventListener('click', () => { filtreOuvert = filtreOuvert === +b.dataset.filtre ? null : +b.dataset.filtre; construire(); }));
    if ($('tcd-fv-ok')) {
      $('tcd-fv-tous').addEventListener('click', () => panneau.querySelectorAll('[data-fv]').forEach((x) => { x.checked = true; }));
      $('tcd-fv-ok').addEventListener('click', () => { const cases = [...panneau.querySelectorAll('[data-fv]')]; const coches = cases.filter((x) => x.checked).map((x) => x.dataset.fv); const i = filtreOuvert; filtreOuvert = null; changer(() => { spec.filtres[i].visibles = coches.length === cases.length ? null : coches; }); });
    }
    for (const [id, prop] of [['tcd-tl', 'totauxLignes'], ['tcd-tc', 'totauxColonnes'], ['tcd-st', 'sousTotaux']]) $(id).addEventListener('change', (e) => changer(() => { spec[prop] = e.target.checked ? undefined : false; }));
    $('tcd-if').addEventListener('change', (e) => changer(() => { spec.ignorerFiltrees = e.target.checked || undefined; }));
    $('tcd-actualiser').addEventListener('click', () => { api.memoriser(); actualiser(); });
    $('tcd-tout').addEventListener('click', toutActualiser);
    $('tcd-nouveau').addEventListener('click', () => { courant = null; creation = null; construireCreation(panneau, true); });
    brancherSource(); brancherSuppr();
  }
  function estNumerique(champ) {
    try {
      const C = api.classeur(), { fi, p } = resoudreSource(C, courant.spec.source, courant.fi);
      const k = champsSource(C, courant.spec.source, courant.fi).indexOf(champ);
      let n = 0, t = 0;
      for (let r = p.r1 + 1; r <= Math.min(p.r2, p.r1 + 50); r++) { const v = C.valeur(fi, r, p.c1 + k); if (typeof v === 'number') n++; else if (v !== null && v !== '') t++; }
      return n > t;
    } catch { return true; }
  }
  function brancherSource() {
    const el = $('tcd-source'); if (!el || !courant) return;
    const appliquer = () => { const ancienne = courant.spec.source; api.memoriser(); courant.spec.source = el.value.trim(); if (!actualiser(true)) { courant.spec.source = ancienne; } construire(); };
    el.addEventListener('change', appliquer);
    if ($('tcd-source-ok')) $('tcd-source-ok').addEventListener('click', appliquer);
  }
  function brancherSuppr() {
    $('tcd-suppr').addEventListener('click', () => {
      if (!courant) return;
      api.memoriser();
      const f = api.classeur().feuilles[courant.fi], z = courant.spec.zone;
      if (z) for (let r = z.r1; r <= z.r2; r++) for (let c = z.c1; c <= z.c2; c++) f.set(r, c, null);
      f.tcd = f.tcd.filter((t) => t !== courant.spec);
      f.recalculerZone(); api.classeur().modifie();
      courant = null; api.sauvegarder(); api.rendre(); construire();
      api.toast('Tableau croisé supprimé');
    });
  }

  function construireCreation(panneau, force = false) {
    const C = api.classeur(), f = api.feuille(), cur = api.curseur(), s = api.selection();
    if (!creation || force) {
      const p = s.r1 === s.r2 && s.c1 === s.c2 ? zoneContigue(f, cur.r, cur.c) : { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, f.zone.r2), c2: Math.min(s.c2, f.zone.c2) };
      creation = { source: nomFeuille(f.nom) + '!' + plageTexte(p), ou: 'nouvelle', cellule: adresse(0, Math.max(f.zone.c2 + 2, 0)) };
    }
    let champs = [];
    try { champs = champsSource(C, creation.source, api.fi()); } catch { /* source invalide : affiché plus bas */ }
    panneau.innerHTML = `
      <div class="outil">
        <p class="aide-petite">Résume un tableau de données (une ligne d'en-têtes, une ligne par enregistrement) : sommes, moyennes, nombres… par catégories en lignes et en colonnes.</p>
        <label>Source <input id="tcd-c-source" value="${ech(creation.source)}" spellcheck="false"></label>
        <button id="tcd-c-sel" class="petit">← sélection</button>
        <p class="aide-petite">${champs.length ? 'Champs : ' + champs.map(ech).join(', ') : '⚠ Source invalide ou vide'}</p>
        <div class="outil-titre">Emplacement</div>
        <label class="case"><input type="radio" name="tcd-ou" value="nouvelle"${creation.ou === 'nouvelle' ? ' checked' : ''}> Nouvelle feuille</label>
        <label class="case"><input type="radio" name="tcd-ou" value="ici"${creation.ou === 'ici' ? ' checked' : ''}> Cette feuille, à partir de <input id="tcd-c-cel" value="${ech(creation.cellule)}" style="width:70px" spellcheck="false"></label>
        <div class="outil-actions"><button id="tcd-c-ok" class="principal"${champs.length ? '' : ' disabled'}>Créer le tableau croisé</button>${(api.classeur().feuilles.some((x) => x.tcd && x.tcd.length)) ? '<button id="tcd-tout">↻ Tout actualiser</button>' : ''}</div>
      </div>`;
    $('tcd-c-source').addEventListener('change', (e) => { creation.source = e.target.value.trim(); construireCreation(panneau); });
    $('tcd-c-sel').addEventListener('click', () => { creation = null; construireCreation(panneau, true); });
    panneau.querySelectorAll('input[name="tcd-ou"]').forEach((r) => r.addEventListener('change', () => { creation.ou = r.value; }));
    $('tcd-c-cel').addEventListener('input', (e) => { creation.cellule = e.target.value.trim(); creation.ou = 'ici'; panneau.querySelector('input[value="ici"]').checked = true; });
    if ($('tcd-tout')) $('tcd-tout').addEventListener('click', toutActualiser);
    $('tcd-c-ok').addEventListener('click', creer);
  }
  function creer() {
    const C = api.classeur();
    let fi, dest;
    try { resoudreSource(C, creation.source, api.fi()); } catch (e) { return api.toast(e.message, true); }
    // La source est toujours écrite avec sa feuille : le tableau peut vivre ailleurs
    const source = creation.source.includes('!') ? creation.source : nomFeuille(api.feuille().nom) + '!' + creation.source;
    api.memoriser();
    if (creation.ou === 'ici') {
      const a = parseAdresse(creation.cellule.replace(/\$/g, '').toUpperCase());
      if (!a) return api.toast('Cellule d\'emplacement invalide', true);
      fi = api.fi(); dest = { r: a.r, c: a.c };
    } else { fi = api.nouvelleFeuille('TCD'); dest = { r: 2, c: 0 }; }
    const spec = { id: 'tcd' + Date.now().toString(36), source, dest, lignes: [], colonnes: [], valeurs: [], filtres: [] };
    C.feuilles[fi].tcd.push(spec);
    courant = { fi, spec };
    try { ecrireTCD(C, fi, spec); }
    catch (e) { C.feuilles[fi].tcd.pop(); courant = null; return api.toast(e.message, true); }
    if (fi !== api.fi()) api.activerFeuille(fi);
    api.selectionner({ r1: dest.r, c1: dest.c, r2: dest.r, c2: dest.c });
    api.sauvegarder(); api.rendre();
    construire();
    api.toast('Tableau croisé créé : rangez les champs dans le panneau');
  }
  function toutActualiser() {
    api.memoriser();
    const { n, erreurs } = actualiserTout(api.classeur());
    api.sauvegarder(); api.rendre();
    api.toast(erreurs.length ? erreurs.join(' · ') : n + ' tableau(x) croisé(s) actualisé(s)', !!erreurs.length);
    if (api.panneauOuvert('tcd')) construire();
  }
  function ouvrir() { creation = null; if (!api.panneauOuvert('tcd')) api.ouvrirPanneau('tcd'); else construire(); }

  return {
    construire, ouvrir, toutActualiser,
    sousCurseur: () => tcdA(api.feuille(), api.curseur().r, api.curseur().c),
    curseurChange() { if (!api.panneauOuvert('tcd')) return; const t = tcdA(api.feuille(), api.curseur().r, api.curseur().c); if (t && (!courant || courant.spec !== t)) { courant = { fi: api.fi(), spec: t }; filtreOuvert = null; construire(); } },
  };
}

export { libelleValeur };
