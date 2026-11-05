// Interface des outils de finance et d'analyse : sous-totaux, calcul itératif, gestionnaire de scénarios,
// fenêtre espion, utilitaire d'analyse. Les calculs sont dans plan.js, scenarios.js et utilitaire.js.

import { adresse, parsePlage, formater, ErreurFormule, colVersLettres } from './formules.js';
import { zoneContigue, aUnEntete } from './donnees.js';
import { sousTotaux, supprimerSousTotaux, FONCTIONS_SOUS_TOTAL } from './plan.js';
import { appliquer, valeursActuelles, synthese, cellulesDe } from './scenarios.js';
import * as U from './utilitaire.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (liste, val) => liste.map(([k, t]) => `<option value="${ech(k)}"${String(val ?? '') === String(k) ? ' selected' : ''}>${ech(t)}</option>`).join('');
const nombre = (t, d) => { const n = +String(t ?? '').replace(/\s/g, '').replace(',', '.'); return Number.isFinite(n) ? n : d; };

/**
 * api : { classeur(), fi(), feuille(), selection(), curseur(), memoriser(perm), rendre(), sauvegarder(), toast(m, err),
 *   dialogue(titre, html, ok, opts), nouvelleFeuille(base) → index, activerFeuille(i), panneauOuvert(nom), ouvrirPanneau(nom) }
 */
export function installerFinance(api) {
  const $ = (id) => document.getElementById(id);
  const plageDe = (t) => { const p = parsePlage(String(t || '').replace(/\$/g, '').replace(/^.*!/, '').trim()); if (!p) throw new Error('Plage illisible : ' + t); return p; };
  const matriceDe = (p) => { const C = api.classeur(), fi = api.fi(), m = []; for (let r = p.r1; r <= p.r2; r++) { const l = []; for (let c = p.c1; c <= p.c2; c++) { const v = C.valeur(fi, r, c); l.push(v instanceof ErreurFormule ? null : v); } m.push(l); } return m; };
  const texteSel = () => { const s = api.selection(); return adresse(s.r1, s.c1) + (s.r1 !== s.r2 || s.c1 !== s.c2 ? ':' + adresse(s.r2, s.c2) : ''); };

  // ---------------------------------------------------------------------------
  // Sous-totaux
  // ---------------------------------------------------------------------------
  function ouvrirSousTotaux() {
    const C = api.classeur(), fi = api.fi(), f = api.feuille(), cur = api.curseur();
    const s = api.selection();
    const p = s.r1 !== s.r2 ? { r1: Math.min(s.r1, s.r2), c1: Math.min(s.c1, s.c2), r2: Math.max(s.r1, s.r2), c2: Math.max(s.c1, s.c2) } : zoneContigue(f, cur.r, cur.c);
    if (!p || p.r2 <= p.r1) return api.toast('Placez-vous dans une liste avec une ligne d\'en-têtes', true);
    const noms = []; for (let c = p.c1; c <= p.c2; c++) noms.push([c, C.texte(fi, p.r1, c) || 'Colonne ' + colVersLettres(c)]);
    const numeriques = noms.filter(([c]) => { for (let r = p.r1 + 1; r <= Math.min(p.r2, p.r1 + 30); r++) if (typeof C.valeur(fi, r, c) === 'number') return true; return false; }).map(([c]) => c);
    const html = `<p class="aide-petite">Liste ${adresse(p.r1, p.c1)}:${adresse(p.r2, p.c2)} — triez-la d'abord sur la colonne de regroupement. Un total est ajouté à chaque changement de valeur, avec un plan (1 2 3) pour replier le détail.</p>
      <div class="fc-grille deux"><label>À chaque changement de <select id="st-cle">${opt(noms, p.c1)}</select></label>
      <label>Fonction <select id="st-fn">${opt(FONCTIONS_SOUS_TOTAL, 9)}</select></label></div>
      <div class="outil-titre">Ajouter un sous-total à</div>
      <div class="st-cols">${noms.map(([c, t]) => `<label class="case"><input type="checkbox" data-st-col="${c}"${numeriques.includes(c) && c !== p.c1 ? ' checked' : ''}> ${ech(t)}</label>`).join('')}</div>
      <label class="case"><input type="checkbox" id="st-rempl" checked> Remplacer les sous-totaux existants</label>`;
    const boite = api.dialogue('Sous-totaux', html, () => {
      const colonnes = [...boite.querySelectorAll('[data-st-col]')].filter((x) => x.checked).map((x) => +x.dataset.stCol);
      if (!colonnes.length) { api.toast('Cochez au moins une colonne à totaliser', true); return false; }
      api.memoriser('insererLignes');
      const n = sousTotaux(C, fi, p, { cle: +$('st-cle').value, fonction: +$('st-fn').value, colonnes, remplacer: $('st-rempl').checked });
      api.sauvegarder(); api.rendre();
      api.toast(n + ' groupe' + (n > 1 ? 's' : '') + ' : boutons 1 2 3 en haut à gauche pour replier le détail');
      return true;
    }, { texteOk: 'Ajouter' });
    const pied = boite.querySelector('.boite-pied');
    const suppr = document.createElement('button'); suppr.textContent = 'Supprimer tout';
    suppr.addEventListener('click', () => { api.memoriser('insererLignes'); supprimerSousTotaux(C, fi, p); api.sauvegarder(); api.rendre(); boite.querySelector('.boite-x').click(); api.toast('Sous-totaux supprimés'); });
    pied.insertBefore(suppr, pied.firstChild);
  }

  // ---------------------------------------------------------------------------
  // Calcul itératif (références circulaires voulues)
  // ---------------------------------------------------------------------------
  function ouvrirIteration() {
    const C = api.classeur(), it = C.iteration || { actif: false, max: 100, ecart: 0.001 };
    api.dialogue('Calcul itératif', `<p class="aide-petite">Permet les références circulaires voulues (intérêts calculés sur un solde moyen, frais qui dépendent du résultat…) : le calcul est répété jusqu'à ce que les valeurs ne changent presque plus.</p>
      <label class="case"><input type="checkbox" id="it-actif"${it.actif ? ' checked' : ''}> Activer le calcul itératif</label>
      <div class="fc-grille deux"><label>Nombre maximal d'itérations <input type="number" id="it-max" min="1" max="32767" value="${it.max ?? 100}"></label>
      <label>Écart maximal <input id="it-ecart" value="${String(it.ecart ?? 0.001).replace('.', ',')}"></label></div>`, () => {
      C.iteration = { actif: $('it-actif').checked, max: Math.max(1, Math.min(32767, Math.round(nombre($('it-max').value, 100)))), ecart: Math.max(0, nombre($('it-ecart').value, 0.001)) };
      if (!C.iteration.actif) delete C.iteration;
      C.evaluateur.recalculerTout(); C.modifie();
      api.sauvegarder(); api.rendre();
      api.toast(C.iteration ? 'Calcul itératif activé' : 'Calcul itératif désactivé : les références circulaires affichent #CYCLE!');
    });
  }

  // ---------------------------------------------------------------------------
  // Gestionnaire de scénarios
  // ---------------------------------------------------------------------------
  let scChoisi = 0, scResultats = '';
  function construireScenarios() {
    const f = api.feuille(), C = api.classeur(), fi = api.fi();
    const liste = f.scenarios || [];
    if (scChoisi >= liste.length) scChoisi = Math.max(0, liste.length - 1);
    const sc = liste[scChoisi];
    let lignes = '';
    if (sc) { try { lignes = cellulesDe(sc.cellules).map(({ r, c }, i) => `<label class="sc-val"><span>${adresse(r, c)}</span><input data-sc-val="${i}" value="${ech(sc.valeurs[i] ?? '')}"></label>`).join(''); } catch (e) { lignes = `<p class="outil-statut">⚠ ${ech(e.message)}</p>`; } }
    $('panneau-scenarios').innerHTML = `<div class="outil">
      <p class="aide-petite">Un scénario donne des valeurs aux cellules variables (taux, volumes, hypothèses). « Afficher » les met dans la feuille ; la synthèse compare les résultats d'un scénario à l'autre.</p>
      <div class="sc-liste">${liste.length ? liste.map((x, i) => `<button class="sc-item${i === scChoisi ? ' choisi' : ''}" data-sc="${i}">${ech(x.nom)}</button>`).join('') : '<div class="vide">Aucun scénario</div>'}</div>
      <div class="outil-actions"><button id="sc-ajout">+ Ajouter (cellules choisies)</button>${sc ? '<button id="sc-voir" class="principal">Afficher</button><button id="sc-suppr" class="danger">Supprimer</button>' : ''}</div>
      ${sc ? `<div class="outil-titre">« ${ech(sc.nom)} »</div>
        <label>Nom <input id="sc-nom" value="${ech(sc.nom)}"></label>
        <label>Cellules variables <input class="champ-ref" data-plage="1" id="sc-cel" value="${ech(sc.cellules)}" spellcheck="false"></label>
        <div class="sc-vals">${lignes}</div>
        <div class="outil-actions"><button id="sc-prendre">Prendre les valeurs actuelles</button></div>
        <label>Commentaire <input id="sc-com" value="${ech(sc.commentaire || '')}"></label>` : ''}
      ${liste.length ? `<div class="outil-titre">Synthèse</div>
        <label>Cellules résultantes <input class="champ-ref" data-plage="1" id="sc-res" value="${ech(scResultats)}" placeholder="B12;B15" spellcheck="false"></label>
        <div class="outil-actions"><button id="sc-synth">Créer la synthèse</button></div>` : ''}
      <div id="sc-statut" class="outil-statut"></div></div>`;
    const memo = () => { try { api.memoriser('objets'); } catch { /* feuille protégée : on garde quand même le modèle */ } };
    $('panneau-scenarios').querySelectorAll('[data-sc]').forEach((b) => b.addEventListener('click', () => { scChoisi = +b.dataset.sc; construireScenarios(); }));
    $('sc-ajout').addEventListener('click', () => {
      const nom = prompt('Nom du scénario :', 'Scénario ' + (liste.length + 1));
      if (!nom) return;
      const cellules = (sc && sc.cellules) || texteSel();
      try { memo(); f.scenarios = [...liste, { nom, cellules, valeurs: valeursActuelles(C, fi, cellules), commentaire: '' }]; scChoisi = f.scenarios.length - 1; C.modifie(); api.sauvegarder(); construireScenarios(); } catch (e) { api.toast(e.message, true); }
    });
    if (!sc) return;
    const enregistrer = () => { memo(); C.modifie(); api.sauvegarder(); };
    $('sc-nom').addEventListener('change', (e) => { sc.nom = e.target.value || sc.nom; enregistrer(); construireScenarios(); });
    $('sc-cel').addEventListener('change', (e) => { try { cellulesDe(e.target.value); sc.cellules = e.target.value; sc.valeurs = valeursActuelles(C, fi, sc.cellules); enregistrer(); construireScenarios(); } catch (err) { $('sc-statut').textContent = '⚠ ' + err.message; } });
    $('panneau-scenarios').querySelectorAll('[data-sc-val]').forEach((x) => x.addEventListener('change', () => { sc.valeurs[+x.dataset.scVal] = x.value; enregistrer(); }));
    $('sc-com').addEventListener('change', (e) => { sc.commentaire = e.target.value; enregistrer(); });
    $('sc-prendre').addEventListener('click', () => { sc.valeurs = valeursActuelles(C, fi, sc.cellules); enregistrer(); construireScenarios(); });
    $('sc-voir').addEventListener('click', () => { try { api.memoriser(); appliquer(C, fi, sc); api.sauvegarder(); api.rendre(); $('sc-statut').textContent = '« ' + sc.nom + ' » affiché (Ctrl+Z pour revenir)'; } catch (e) { api.toast(e.message, true); } });
    $('sc-suppr').addEventListener('click', () => { memo(); f.scenarios = liste.filter((x) => x !== sc); if (!f.scenarios.length) delete f.scenarios; C.modifie(); api.sauvegarder(); construireScenarios(); });
    if ($('sc-synth')) {
      $('sc-res').addEventListener('change', (e) => { scResultats = e.target.value; });
      $('sc-synth').addEventListener('click', () => {
        scResultats = $('sc-res').value;
        try {
          const nomF = f.nom, res = synthese(C, fi, f.scenarios, scResultats);
          const i = api.nouvelleFeuille('Synthèse de scénarios');
          ecrire(i, res.lignes, { titres: [0, 1, 2 + res.nbVariables], formats: res.formats });
          C.feuilles[i].largeurs[0] = 150; C.feuilles[i].largeurs[1] = 70; for (let k = 2; k < 3 + f.scenarios.length; k++) C.feuilles[i].largeurs[k] = 120;
          api.activerFeuille(i); api.sauvegarder(); api.rendre();
          api.toast('Synthèse des scénarios de « ' + nomF + ' »');
        } catch (e) { $('sc-statut').textContent = '⚠ ' + e.message; }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Fenêtre espion : suivre des cellules (de toutes les feuilles) pendant qu'on travaille ailleurs
  // ---------------------------------------------------------------------------
  function construireEspion() {
    const C = api.classeur();
    const lignes = [];
    C.feuilles.forEach((f, fi) => (f.espions || []).forEach((a, k) => {
      const p = parsePlage(String(a).replace(/\$/g, ''));
      if (!p) return;
      const v = C.valeur(fi, p.r1, p.c1), cel = f.get(p.r1, p.c1) || {};
      lignes.push(`<tr><td>${ech(f.nom)}</td><td><button class="lien" data-esp-aller="${fi},${p.r1},${p.c1}">${ech(a)}</button></td><td class="n">${ech(v instanceof ErreurFormule ? v.code : v == null ? '' : typeof v === 'number' ? formater(v, cel.z) : String(v))}</td><td class="f">${ech(cel.f || '')}</td><td><button class="petit" data-esp-suppr="${fi},${k}" title="Retirer">✕</button></td></tr>`);
    }));
    $('panneau-espion').innerHTML = `<div class="outil">
      <p class="aide-petite">Les cellules suivies restent sous les yeux, même depuis une autre feuille : pratique pour voir un résultat bouger quand on change une hypothèse.</p>
      <div class="outil-actions"><button id="esp-ajout" class="principal">+ Suivre les cellules choisies</button></div>
      ${lignes.length ? `<table class="espion"><tr><th>Feuille</th><th>Cellule</th><th>Valeur</th><th>Formule</th><th></th></tr>${lignes.join('')}</table>` : '<div class="vide">Aucune cellule suivie</div>'}</div>`;
    $('esp-ajout').addEventListener('click', () => {
      const f = api.feuille(), s = api.selection();
      const r1 = Math.min(s.r1, s.r2), r2 = Math.min(Math.max(s.r1, s.r2), r1 + 49), c1 = Math.min(s.c1, s.c2), c2 = Math.min(Math.max(s.c1, s.c2), c1 + 19);
      f.espions = f.espions || [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const a = adresse(r, c); if (!f.espions.includes(a)) f.espions.push(a); }
      api.classeur().modifie(); api.sauvegarder(); construireEspion();
    });
    $('panneau-espion').querySelectorAll('[data-esp-suppr]').forEach((b) => b.addEventListener('click', () => { const [fi, k] = b.dataset.espSuppr.split(',').map(Number); const f = C.feuilles[fi]; f.espions.splice(k, 1); if (!f.espions.length) delete f.espions; C.modifie(); api.sauvegarder(); construireEspion(); }));
    $('panneau-espion').querySelectorAll('[data-esp-aller]').forEach((b) => b.addEventListener('click', () => { const [fi, r, c] = b.dataset.espAller.split(',').map(Number); api.allerA(fi, r, c); }));
  }

  // ---------------------------------------------------------------------------
  // Utilitaire d'analyse
  // ---------------------------------------------------------------------------
  const etatU = { outil: 'descriptives', entree: '', etiquettes: true, sortie: 'feuille', cellule: '', confiance: '95', classes: '', yPlage: '', xPlage: '', intervalle: '3', amortissement: '0,3', loi: 'normale', a: '0', b: '1', nbVar: '1', nbNb: '100', graine: '', type: 'egales', difference: '0', alpha: '0,05', entree2: '', residus: false, cumul: true, pareto: false, kieme: '' };
  function construireUtilitaire() {
    const e = etatU;
    if (!e.entree) e.entree = texteSel();
    const champ = (id, lib, val, ph = '') => `<label>${lib} <input class="champ-ref" data-plage="1" id="${id}" value="${ech(val)}" placeholder="${ph}" spellcheck="false"></label>`;
    const nb = (id, lib, val) => `<label>${lib} <input id="${id}" value="${ech(val)}" style="width:90px"></label>`;
    const cas = (id, lib, val) => `<label class="case"><input type="checkbox" id="${id}"${val ? ' checked' : ''}> ${lib}</label>`;
    let corps = '';
    switch (e.outil) {
      case 'descriptives': corps = champ('ua-in', 'Plage d\'entrée', e.entree, 'B1:D50') + cas('ua-et', 'Intitulés en première ligne', e.etiquettes) + nb('ua-conf', 'Niveau de confiance (%)', e.confiance) + nb('ua-k', 'K-ième (facultatif)', e.kieme); break;
      case 'histogramme': corps = champ('ua-in', 'Plage d\'entrée', e.entree) + champ('ua-cl', 'Plage des classes (facultatif)', e.classes) + cas('ua-et', 'Intitulé en première ligne', e.etiquettes) + cas('ua-cum', '% cumulé', e.cumul) + cas('ua-par', 'Pareto (classes triées)', e.pareto) + '<p class="aide-petite">Un histogramme est aussi tracé.</p>'; break;
      case 'regression': corps = champ('ua-y', 'Plage Y (à expliquer)', e.yPlage, 'C1:C50') + champ('ua-x', 'Plage X (une ou plusieurs colonnes)', e.xPlage, 'A1:B50') + cas('ua-et', 'Intitulés en première ligne', e.etiquettes) + nb('ua-conf', 'Niveau de confiance (%)', e.confiance) + cas('ua-res', 'Résidus', e.residus); break;
      case 'correlation': case 'covariance': corps = champ('ua-in', 'Plage d\'entrée (une colonne par variable)', e.entree) + cas('ua-et', 'Intitulés en première ligne', e.etiquettes); break;
      case 'moyenneMobile': corps = champ('ua-in', 'Plage d\'entrée (une colonne)', e.entree) + cas('ua-et', 'Intitulé en première ligne', e.etiquettes) + nb('ua-int', 'Intervalle', e.intervalle) + '<p class="aide-petite">La courbe des données et de la moyenne mobile est tracée.</p>'; break;
      case 'lissage': corps = champ('ua-in', 'Plage d\'entrée (une colonne)', e.entree) + cas('ua-et', 'Intitulé en première ligne', e.etiquettes) + nb('ua-am', 'Facteur d\'amortissement', e.amortissement); break;
      case 'aleatoire': corps = nb('ua-nv', 'Nombre de variables', e.nbVar) + nb('ua-nn', 'Nombre de valeurs', e.nbNb) + `<label>Loi <select id="ua-loi">${opt(U.LOIS_ALEA, e.loi)}</select></label>` + nb('ua-a', 'Paramètre 1 (a, moyenne, p, λ, μ)', e.a) + nb('ua-b', 'Paramètre 2 (b, écart-type, n, σ)', e.b) + nb('ua-g', 'Graine (facultatif : mêmes tirages)', e.graine); break;
      case 'testT': corps = champ('ua-in', 'Plage de la variable 1', e.entree) + champ('ua-in2', 'Plage de la variable 2', e.entree2) + `<label>Type <select id="ua-type">${opt(U.TYPES_TEST_T, e.type)}</select></label>` + nb('ua-diff', 'Différence hypothétique des moyennes', e.difference) + cas('ua-et', 'Intitulés en première ligne', e.etiquettes) + nb('ua-al', 'Seuil α', e.alpha); break;
      case 'testF': corps = champ('ua-in', 'Plage de la variable 1', e.entree) + champ('ua-in2', 'Plage de la variable 2', e.entree2) + cas('ua-et', 'Intitulés en première ligne', e.etiquettes) + nb('ua-al', 'Seuil α', e.alpha); break;
      case 'anova': corps = champ('ua-in', 'Plage d\'entrée (une colonne par groupe)', e.entree) + cas('ua-et', 'Intitulés en première ligne', e.etiquettes) + nb('ua-al', 'Seuil α', e.alpha); break;
      case 'rang': corps = champ('ua-in', 'Plage d\'entrée (une colonne)', e.entree) + cas('ua-et', 'Intitulé en première ligne', e.etiquettes); break;
    }
    $('panneau-utilitaire').innerHTML = `<div class="outil">
      <label>Outil <select id="ua-outil">${opt(U.OUTILS, e.outil)}</select></label>
      ${corps}
      <div class="outil-titre">Résultats</div>
      <label>Où <select id="ua-sortie">${opt([['feuille', 'Dans une nouvelle feuille'], ['cellule', 'À partir d\'une cellule']], e.sortie)}</select></label>
      ${e.sortie === 'cellule' ? `<label>Cellule <input class="champ-ref" id="ua-cellule" value="${ech(e.cellule)}" placeholder="H1" spellcheck="false"></label>` : ''}
      <div class="outil-actions"><button id="ua-ok" class="principal">Calculer</button></div>
      <div id="ua-statut" class="outil-statut"></div></div>`;
    const lire = () => {
      const v = (id) => ($(id) ? $(id).value : undefined), c = (id) => ($(id) ? $(id).checked : undefined);
      Object.assign(e, Object.fromEntries(Object.entries({ entree: v('ua-in'), entree2: v('ua-in2'), classes: v('ua-cl'), yPlage: v('ua-y'), xPlage: v('ua-x'), confiance: v('ua-conf'), kieme: v('ua-k'), intervalle: v('ua-int'), amortissement: v('ua-am'), nbVar: v('ua-nv'), nbNb: v('ua-nn'), loi: v('ua-loi'), a: v('ua-a'), b: v('ua-b'), graine: v('ua-g'), type: v('ua-type'), difference: v('ua-diff'), alpha: v('ua-al'), cellule: v('ua-cellule'),
        etiquettes: c('ua-et'), residus: c('ua-res'), cumul: c('ua-cum'), pareto: c('ua-par') }).filter(([, x]) => x !== undefined)));
      const avant = e.sortie;
      e.sortie = v('ua-sortie') || 'feuille';
      if (avant !== e.sortie) setTimeout(construireUtilitaire, 0);
    };
    $('panneau-utilitaire').addEventListener('input', lire);
    $('panneau-utilitaire').addEventListener('change', lire);
    $('ua-outil').addEventListener('change', (x) => { lire(); e.outil = x.target.value; construireUtilitaire(); });
    $('ua-ok').addEventListener('click', () => { lire(); try { calculerUtilitaire(); } catch (err) { $('ua-statut').textContent = '⚠ ' + err.message; } });
  }
  function calculerUtilitaire() {
    const e = etatU, C = api.classeur(), fiSrc = api.fi();
    const cols = (t) => U.colonnesDe(matriceDe(plageDe(t)), e.etiquettes);
    const conf = nombre(e.confiance, 95) / 100, alpha = nombre(e.alpha, 0.05);
    let res, graphique = null;
    switch (e.outil) {
      case 'descriptives': res = U.descriptives(cols(e.entree), { confiance: conf, kieme: Math.round(nombre(e.kieme, 0)) }); break;
      case 'histogramme': { const v = cols(e.entree)[0].valeurs, cl = e.classes ? U.colonnesDe(matriceDe(plageDe(e.classes)), false)[0].valeurs : null; res = U.histogramme(v, cl, { cumul: e.cumul, pareto: e.pareto }); graphique = { type: 'colonnes', colonnes: 2, titre: 'Histogramme' }; break; }
      case 'regression': {
        const py = plageDe(e.yPlage), px = plageDe(e.xPlage), my = matriceDe(py), mx = matriceDe(px);
        const debut = e.etiquettes ? 1 : 0, noms = mx[0].map((x, j) => (e.etiquettes ? String(x ?? 'X' + (j + 1)) : 'Variable X ' + (j + 1)));
        const y = [], X = [];
        for (let i = debut; i < my.length; i++) { const yy = my[i][0], xx = mx[i] || []; if (typeof yy === 'number' && xx.every((v) => typeof v === 'number')) { y.push(yy); X.push(xx); } }
        res = U.regressionLineaire(y, X, noms, { confiance: conf, residus: e.residus });
        break;
      }
      case 'correlation': res = U.matrice(cols(e.entree), false); break;
      case 'covariance': res = U.matrice(cols(e.entree), true); break;
      case 'moyenneMobile': { const col = cols(e.entree)[0]; res = U.moyenneMobile(col.valeurs, Math.max(2, Math.round(nombre(e.intervalle, 3)))); res.lignes = res.lignes.map((l, i) => [i ? col.valeurs[i - 1] : col.nom, ...l]); graphique = { type: 'lignes', colonnes: 2, titre: 'Moyenne mobile' }; break; }
      case 'lissage': { const col = cols(e.entree)[0]; res = U.lissage(col.valeurs, nombre(e.amortissement, 0.3)); res.lignes = res.lignes.map((l, i) => [i ? col.valeurs[i - 1] : col.nom, ...l]); graphique = { type: 'lignes', colonnes: 2, titre: 'Lissage exponentiel' }; break; }
      case 'aleatoire': res = U.aleatoire(Math.max(1, Math.round(nombre(e.nbVar, 1))), Math.max(1, Math.min(100000, Math.round(nombre(e.nbNb, 100)))), e.loi, nombre(e.a, 0), nombre(e.b, 1), Math.round(nombre(e.graine, 0))); break;
      case 'testT': { const a = cols(e.entree)[0], b = cols(e.entree2)[0]; res = U.testT(a.valeurs, b.valeurs, e.type, { difference: nombre(e.difference, 0), alpha, noms: [a.nom, b.nom] }); break; }
      case 'testF': { const a = cols(e.entree)[0], b = cols(e.entree2)[0]; res = U.testF(a.valeurs, b.valeurs, { alpha, noms: [a.nom, b.nom] }); break; }
      case 'anova': res = U.anova(cols(e.entree), { alpha }); break;
      case 'rang': res = U.rangCentile(cols(e.entree)[0]); break;
    }
    // Où écrire : une nouvelle feuille ou à partir d'une cellule de la feuille active
    let fi = fiSrc, r0 = 0, c0 = 0;
    if (e.sortie === 'cellule') { const p = plageDe(e.cellule || 'A1'); r0 = p.r1; c0 = p.c1; api.memoriser(); }
    else fi = api.nouvelleFeuille((U.OUTILS.find((x) => x[0] === e.outil) || [, 'Analyse'])[1].replace(/\s*\(.*\)/, '').slice(0, 28));
    ecrire(fi, res.lignes, { r0, c0, titres: res.titres, formats: res.formats });
    const f = C.feuilles[fi];
    if (e.sortie !== 'cellule') { f.largeurs[0] = Math.max(f.largeurs[0] || 0, Math.min(330, 8 * Math.max(...res.lignes.map((l) => String(l[0] ?? '').length)) + 16)); for (let c = 1; c < 8; c++) f.largeurs[c] = Math.max(f.largeurs[c] || 0, 110); }
    if (graphique) {
      const n = res.lignes.length;
      const plage = colVersLettres(c0) + (r0 + 1) + ':' + colVersLettres(c0 + graphique.colonnes - 1) + (r0 + n);
      f.graphiques.push({ id: 'g' + Date.now().toString(36), v: 2, type: graphique.type, plage, titre: graphique.titre, x: 520, y: 20, w: 460, h: 280, palette: 'office' });
    }
    if (fi !== fiSrc) api.activerFeuille(fi);
    api.sauvegarder(); api.rendre();
    api.toast('Résultats : ' + (fi !== fiSrc ? 'feuille « ' + f.nom + ' »' : adresse(r0, c0)));
  }
  // Écrit une matrice de résultats (nombres en valeurs, textes, #N/A), titres en gras
  function ecrire(fi, lignes, { r0 = 0, c0 = 0, titres = [], formats = {} } = {}) {
    const C = api.classeur(), f = C.feuilles[fi];
    lignes.forEach((l, i) => l.forEach((v, j) => {
      if (v === '' || v === null || v === undefined) return;
      const r = r0 + i, c = c0 + j;
      if (typeof v === 'number') f.set(r, c, { v: Number.isFinite(v) ? v : null, ...(formats[i + ',' + j] ? { z: formats[i + ',' + j] } : Math.abs(v) < 1e5 && !Number.isInteger(v) ? { z: '0.0000' } : {}) });
      else C.saisir(fi, r, c, String(v).startsWith('#') ? String(v) : "'" + String(v).replace(/^'/, ''));
      if (titres.includes(i)) C.style(fi, r, c, { gras: true });
    }));
    f.recalculerZone(); C.modifie();
  }

  return {
    panneaux: { scenarios: construireScenarios, espion: construireEspion, utilitaire: construireUtilitaire },
    titres: { scenarios: 'Gestionnaire de scénarios', espion: 'Fenêtre espion', utilitaire: 'Utilitaire d\'analyse' },
    ouvrirSousTotaux, ouvrirIteration,
    rafraichir() { if (api.panneauOuvert('espion')) construireEspion(); },
  };
}
