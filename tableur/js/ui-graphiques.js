// Interface des graphiques : galerie d'insertion (aperçus de chaque catégorie avec les vraies données),
// panneau « Graphique » (type, données, titres, légende, axes, style, séries) et export en image.

import { rendreGraphiqueSVG, CATEGORIES, PALETTES, NOMS_PALETTES, normaliser, nomType, preparerDonnees, TYPES_TENDANCE } from './graphiques.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FORMATS = [['', 'Automatique'], ['0', '0'], ['0.0', '0,0'], ['0.00', '0,00'], ['#,##0', '1 000'], ['#,##0.00', '1 000,00'], ['0%', '0 %'], ['0.0%', '0,0 %'], ['0.00%', '0,00 %'], ['#,##0 €', '1 000 €'], ['0.00E+00', 'Scientifique']];

/**
 * api : {
 *   feuille(), donnees(feuille, plage) → matrice, selection() → { r1, c1, r2, c2 }, adresse(r, c),
 *   plageValide(texte), position(sel) → { x, y }, rendre(), sauvegarder(), toast(msg, erreur),
 *   ouvrirPanneau(nom), panneauOuvert(nom), actif() / activer(id)
 * }
 */
export function installerGraphiques(api) {
  // ---------------------------------------------------------------------------
  // Galerie d'insertion
  // ---------------------------------------------------------------------------
  const fond = document.createElement('div');
  fond.id = 'galerie-graphiques';
  fond.className = 'dialogue-fond';
  fond.hidden = true;
  fond.innerHTML = `
    <div class="dialogue galerie" role="dialog" aria-labelledby="galerie-titre">
      <div class="dialogue-titre" id="galerie-titre">Insérer un graphique</div>
      <div class="galerie-corps">
        <div class="galerie-categories" id="galerie-categories"></div>
        <div class="galerie-droite">
          <div class="galerie-variantes" id="galerie-variantes"></div>
          <div class="galerie-nom" id="galerie-nom"></div>
          <div class="galerie-apercu" id="galerie-apercu"></div>
          <div class="galerie-options">
            <label><input type="checkbox" id="galerie-lignes"> Séries en lignes</label>
            <span class="galerie-plage">Données : <b id="galerie-plage"></b></span>
          </div>
        </div>
      </div>
      <div class="galerie-boutons"><button id="galerie-annuler">Annuler</button><button id="galerie-ok" class="principal">Insérer</button></div>
    </div>`;
  document.body.appendChild(fond);
  const $ = (id) => document.getElementById(id);
  let choix = { type: 'colonnes', variante: 'groupe' }, matrice = [], plage = '', enLignes = false;

  function specGalerie(type, variante) {
    const g = { type, variante, v: 2, enLignes, plage };
    if (type === 'lignes' && variante === 'marqueurs') { g.variante = 'groupe'; g.marqueurs = true; }
    if (type === 'lignes' && variante === 'lisse') { g.variante = 'groupe'; g.lisse = true; }
    return g;
  }
  function rendreGalerie() {
    $('galerie-categories').innerHTML = CATEGORIES.map((c) => `<button data-type="${c.type}" class="${c.type === choix.type ? 'choisi' : ''}"><span class="vignette">${rendreGraphiqueSVG(specGalerie(c.type, c.variantes[0][0]), matrice, 46, 32, { mini: true })}</span>${ech(c.nom)}</button>`).join('');
    const cat = CATEGORIES.find((c) => c.type === choix.type);
    $('galerie-variantes').innerHTML = cat.variantes.map(([v, nom]) => `<button data-variante="${v}" class="${v === choix.variante ? 'choisi' : ''}" title="${ech(nom)}">${rendreGraphiqueSVG(specGalerie(cat.type, v), matrice, 112, 74, { mini: true })}<span>${ech(nom)}</span></button>`).join('');
    const v = cat.variantes.find((x) => x[0] === choix.variante) || cat.variantes[0];
    $('galerie-nom').textContent = cat.nom + (cat.variantes.length > 1 ? ' — ' + v[1] : '');
    const boite = $('galerie-apercu').getBoundingClientRect();
    $('galerie-apercu').innerHTML = rendreGraphiqueSVG({ ...specGalerie(choix.type, choix.variante), legende: 'bas', legendeForcee: false }, matrice, Math.max(240, boite.width || 460), Math.max(160, boite.height || 280));
  }
  function ouvrirGalerie() {
    const s = api.selection();
    if (s.r1 === s.r2 && s.c1 === s.c2 && !api.feuille().get(s.r1, s.c1)) { api.toast('Sélectionnez d\'abord les données (en-têtes compris), puis Graphique', true); return; }
    plage = api.adresse(s.r1, s.c1) + ':' + api.adresse(s.r2, s.c2);
    matrice = api.donnees(api.feuille(), plage);
    enLignes = false;
    $('galerie-lignes').checked = false;
    $('galerie-plage').textContent = plage;
    // Proposition comme Excel : nuage si deux colonnes de nombres, courbes pour une longue série, sinon histogramme
    const d = preparerDonnees(matrice, 'colonnes');
    const longue = d.categories.length > 12;
    choix = { type: longue ? 'lignes' : 'colonnes', variante: 'groupe' };
    if (matrice.length > 2 && matrice[0].length === 2 && matrice.slice(1).every((l) => typeof l[0] === 'number' && typeof l[1] === 'number') && !(d.categories.length && d.categories[0] !== '1')) choix = { type: 'nuage', variante: 'points' };
    fond.hidden = false;
    requestAnimationFrame(rendreGalerie);
  }
  $('galerie-categories').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const cat = CATEGORIES.find((c) => c.type === b.dataset.type); choix = { type: cat.type, variante: cat.variantes[0][0] }; rendreGalerie(); });
  $('galerie-variantes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; choix.variante = b.dataset.variante; rendreGalerie(); });
  $('galerie-variantes').addEventListener('dblclick', (e) => { if (e.target.closest('button')) inserer(); });
  $('galerie-lignes').addEventListener('change', (e) => { enLignes = e.target.checked; rendreGalerie(); });
  $('galerie-annuler').addEventListener('click', () => { fond.hidden = true; });
  fond.addEventListener('mousedown', (e) => { if (e.target === fond) fond.hidden = true; });
  fond.addEventListener('keydown', (e) => { if (e.key === 'Escape') fond.hidden = true; if (e.key === 'Enter') inserer(); });
  $('galerie-ok').addEventListener('click', () => inserer(true));
  window.addEventListener('resize', () => { if (!fond.hidden) rendreGalerie(); });

  // Alt+F1 / F11 (comme Excel) : le graphique proposé, sans passer par la galerie
  function insererDirect() {
    ouvrirGalerie();
    if (fond.hidden) return;
    inserer(false);
  }
  function inserer(reglages = true) {
    fond.hidden = true;
    const s = api.selection();
    const { x, y } = api.position(s);
    const g = normaliser({ ...specGalerie(choix.type, choix.variante), id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titre: '', x, y, w: 460, h: 290 });
    if (g.type === 'secteurs') g.legende = 'droite';
    api.feuille().graphiques.push(g);
    api.activer(g.id);
    api.sauvegarder(); api.rendre();
    if (reglages) ouvrirParametres(g);
  }

  // ---------------------------------------------------------------------------
  // Panneau « Graphique »
  // ---------------------------------------------------------------------------
  let courant = null; // graphique réglé dans le panneau
  const panneau = $('panneau-graphique');

  function ouvrirParametres(g) {
    courant = g;
    api.activer(g.id);
    if (!api.panneauOuvert('graphique')) api.ouvrirPanneau('graphique');
    construirePanneau();
  }

  function construirePanneau() {
    const g = courant;
    if (!g || !api.feuille().graphiques.includes(g)) { panneau.innerHTML = '<p class="vide">Choisissez un graphique (⚙ sur le graphique, ou double-clic).</p>'; return; }
    normaliser(g);
    const d = preparerDonnees(api.donnees(api.feuille(), g.plage), g.type, g.enLignes);
    const cat = CATEGORIES.find((c) => c.type === g.type) || CATEGORIES[0];
    const varCourante = g.type === 'lignes' ? (g.lisse ? 'lisse' : g.marqueurs ? 'marqueurs' : g.variante) : g.variante;
    const opt = (liste, val) => liste.map(([v, t]) => `<option value="${ech(v)}"${String(val ?? '') === String(v) ? ' selected' : ''}>${ech(t)}</option>`).join('');
    const axes = !['secteurs', 'radar'].includes(g.type);
    const circulaire = g.type === 'secteurs';
    const nomsSeries = circulaire ? d.categories : d.series.map((s) => s.nom);
    const palette = PALETTES[g.palette] || PALETTES.arcadia;
    panneau.innerHTML = `
      <div class="graph-apercu" id="graph-apercu"></div>
      <details open><summary>Type</summary>
        <div class="graph-types">${CATEGORIES.map((c) => `<button data-type="${c.type}" class="${c.type === g.type ? 'choisi' : ''}" title="${ech(c.nom)}">${rendreGraphiqueSVG({ ...g, type: c.type, variante: c.variantes[0][0], lisse: false, marqueurs: false }, api.donnees(api.feuille(), g.plage), 44, 30, { mini: true })}</button>`).join('')}</div>
        <div class="graph-variantes">${cat.variantes.map(([v, nom]) => `<button data-variante="${v}" class="${v === varCourante ? 'choisi' : ''}">${ech(nom)}</button>`).join('')}</div>
      </details>
      <details open><summary>Données</summary>
        <label>Plage <input id="gp-plage" value="${ech(g.plage)}" spellcheck="false"></label>
        <button id="gp-plage-sel" class="petit" title="Prendre la sélection de la feuille">← sélection</button>
        <label class="case"><input type="checkbox" id="gp-lignes"${g.enLignes ? ' checked' : ''}> Séries en lignes (intervertir lignes et colonnes)</label>
      </details>
      <details open><summary>Titres</summary>
        <label>Titre <input id="gp-titre" value="${ech(g.titre || '')}" placeholder="(aucun)"></label>
        ${axes ? `<label>${g.type === 'barres' ? 'Axe des catégories (vertical)' : 'Abscisse — axe horizontal (X)'} <input id="gp-titreX" value="${ech(g.titreX || '')}" placeholder="(aucun titre)"></label>
        <label>${g.type === 'barres' ? 'Axe des valeurs (horizontal)' : 'Ordonnée — axe vertical (Y)'} <input id="gp-titreY" value="${ech(g.titreY || '')}" placeholder="(aucun titre)"></label>
        ${['nuage', 'colonnes', 'barres'].includes(g.type) ? `<button id="gp-inverser" class="petit" title="${g.type === 'nuage' ? 'Échanger X et Y (et leurs titres)' : 'Histogramme ↔ barres horizontales'}">⇄ Intervertir abscisse et ordonnée</button>` : ''}` : ''}
      </details>
      <details open><summary>Légende et étiquettes</summary>
        <label>Légende <select id="gp-legende">${opt([['droite', 'À droite'], ['bas', 'En bas'], ['haut', 'En haut'], ['gauche', 'À gauche'], ['aucune', 'Aucune']], g.legende)}</select></label>
        <label>Étiquettes <select id="gp-etiquettes">${opt(circulaire ? [['aucune', 'Pourcentage (défaut)'], ['valeur', 'Valeur'], ['categorie', 'Catégorie']] : [['aucune', 'Aucune'], ['valeur', 'Valeur'], ['pourcentage', 'Pourcentage'], ['categorie', 'Catégorie']], g.etiquettes)}</select></label>
      </details>
      ${axes ? `<details open><summary>${g.type === 'barres' ? 'Axe des valeurs (horizontal)' : 'Axe vertical (Y)'}</summary>
        <div class="graph-ligne"><label>Minimum <input id="gp-ymin" type="number" step="any" value="${g.yMin ?? ''}" placeholder="auto"></label>
        <label>Maximum <input id="gp-ymax" type="number" step="any" value="${g.yMax ?? ''}" placeholder="auto"></label></div>
        <div class="graph-ligne"><label>Échelle <select id="gp-logy">${opt([['', 'Linéaire'], ['log', 'Logarithmique']], g.logY ? 'log' : '')}</select></label>
        <label class="case"><input type="checkbox" id="gp-invy"${g.inverseY ? ' checked' : ''}> Ordre inversé</label></div>
        <label>Format <select id="gp-format">${opt(FORMATS.some(([f]) => f === (g.formatY || '')) ? FORMATS : [...FORMATS, [g.formatY, g.formatY]], g.formatY || '')}</select></label>
        <label class="case"><input type="checkbox" id="gp-quad"${g.quadrillage ? ' checked' : ''}> Quadrillage horizontal</label>
        <label class="case"><input type="checkbox" id="gp-quadx"${g.quadrillageX ? ' checked' : ''}> Quadrillage vertical</label>
      </details>
      <details open><summary>${g.type === 'barres' ? 'Axe des catégories (vertical)' : 'Axe horizontal (X)'}</summary>
        ${g.type === 'nuage' ? `<div class="graph-ligne"><label>Minimum <input id="gp-xmin" type="number" step="any" value="${g.xMin ?? ''}" placeholder="auto"></label>
        <label>Maximum <input id="gp-xmax" type="number" step="any" value="${g.xMax ?? ''}" placeholder="auto"></label></div>
        <div class="graph-ligne"><label>Échelle <select id="gp-logx">${opt([['', 'Linéaire'], ['log', 'Logarithmique']], g.logX ? 'log' : '')}</select></label>` : '<div class="graph-ligne">'}
        <label class="case"><input type="checkbox" id="gp-invx"${g.inverseX ? ' checked' : ''}> Ordre inversé${g.type === 'nuage' ? '' : ' (dernière catégorie en premier)'}</label></div>
      </details>` : ''}
      <details open><summary>Style</summary>
        <div class="graph-palettes">${Object.entries(PALETTES).map(([k, p]) => `<button data-palette="${k}" class="${k === g.palette ? 'choisi' : ''}" title="${ech(NOMS_PALETTES[k])}">${p.slice(0, 5).map((c) => `<i style="background:${c}"></i>`).join('')}</button>`).join('')}</div>
        <div class="graph-ligne"><label>Police <input id="gp-police" type="number" min="7" max="24" value="${g.police || 11}"></label>
        <label>Fond <input id="gp-fond" type="color" value="${g.fond || '#ffffff'}"></label></div>
        ${['lignes', 'nuage', 'radar', 'combine'].includes(g.type) ? `<div class="graph-ligne"><label>Épaisseur <input id="gp-epaisseur" type="number" min="1" max="8" step="0.5" value="${g.epaisseur || 2}"></label></div>
        <label class="case"><input type="checkbox" id="gp-marqueurs"${g.marqueurs ? ' checked' : ''}> Marqueurs</label>
        ${g.type !== 'radar' ? `<label class="case"><input type="checkbox" id="gp-lisse"${g.lisse ? ' checked' : ''}> Courbes lissées</label>` : ''}` : ''}
      </details>
      <details open><summary>${circulaire ? 'Parts' : 'Séries'}</summary>
        ${nomsSeries.map((nom, i) => `<div class="graph-serie"><input type="color" data-couleur="${i}" value="${g.couleurs[i] || palette[i % palette.length]}">
          ${circulaire ? `<span>${ech(nom)}</span>` : `<input data-nom="${i}" value="${ech(g.noms[i] || nom)}" title="Nom de la série">`}
          ${g.couleurs[i] ? `<button class="petit" data-raz="${i}" title="Couleur de la palette">↺</button>` : ''}</div>
          ${axes && g.type !== 'barres' ? optionsSerie(g, i, nomsSeries.length) : ''}`).join('')}
      </details>
      <div class="graph-actions">
        <button id="gp-png">Image PNG</button><button id="gp-svg">SVG</button><button id="gp-dupliquer">Dupliquer</button><button id="gp-suppr" class="danger">Supprimer</button>
      </div>`;
    majApercu();
  }

  // Tendance et axe secondaire d'une série
  function optionsSerie(g, i, nb) {
    const t = g.tendances[i] || {};
    const opt = (liste, val) => liste.map(([v, x]) => `<option value="${v}"${String(val ?? '') === String(v) ? ' selected' : ''}>${x}</option>`).join('');
    return `<div class="graph-serie-opts">
      <label>Tendance <select data-tendance="${i}">${opt([['', 'Aucune'], ...TYPES_TENDANCE], t.type || '')}</select></label>
      ${t.type === 'polynomiale' ? `<label>Ordre <input type="number" min="2" max="6" data-ordre="${i}" value="${t.ordre || 2}"></label>` : ''}
      ${t.type === 'moyenne' ? `<label>Période <input type="number" min="2" max="50" data-periode="${i}" value="${t.periode || 2}"></label>` : ''}
      ${t.type && t.type !== 'moyenne' ? `<label class="case"><input type="checkbox" data-eq="${i}"${t.equation ? ' checked' : ''}> Équation</label><label class="case"><input type="checkbox" data-r2="${i}"${t.r2 ? ' checked' : ''}> R²</label>` : ''}
      ${nb > 1 && g.type !== 'nuage' ? `<label class="case" title="Échelle à droite ; la série est dessinée en courbe"><input type="checkbox" data-secondaire="${i}"${g.secondaire[i] ? ' checked' : ''}> Axe secondaire</label>` : ''}
    </div>`;
  }

  function majApercu() {
    const g = courant;
    const zone = document.getElementById('graph-apercu');
    if (!g || !zone) return;
    // Panneau plein écran (tablette, téléphone) : l'aperçu reste assez bas pour laisser voir les réglages
    const l = Math.max(220, Math.min(zone.clientWidth || 300, 560));
    const h = Math.min(Math.round(l * Math.min(0.75, g.h / g.w)), Math.round(innerHeight * 0.32), 320);
    zone.innerHTML = rendreGraphiqueSVG(g, api.donnees(api.feuille(), g.plage), l, h);
  }

  function changer(f, reconstruire = false) {
    if (!courant) return;
    f(courant);
    normaliser(courant);
    api.sauvegarder(); api.rendre();
    if (reconstruire) construirePanneau(); else majApercu();
  }

  panneau.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !courant) return;
    if (b.dataset.type) changer((g) => { const cat = CATEGORIES.find((c) => c.type === b.dataset.type); g.type = cat.type; g.variante = cat.variantes[0][0]; g.lisse = false; if (g.type !== 'lignes') g.marqueurs = false; if (g.type === 'secteurs') g.legende = 'droite'; }, true);
    else if (b.dataset.variante) changer((g) => { const v = b.dataset.variante; if (g.type === 'lignes') { g.lisse = v === 'lisse'; g.marqueurs = v === 'marqueurs'; g.variante = v === 'empile' ? 'empile' : 'groupe'; } else g.variante = v; }, true);
    else if (b.dataset.palette) changer((g) => { g.palette = b.dataset.palette; g.couleurs = {}; }, true);
    else if (b.dataset.raz !== undefined) changer((g) => { delete g.couleurs[b.dataset.raz]; }, true);
    else if (b.id === 'gp-plage-sel') { const s = api.selection(); changer((g) => { g.plage = api.adresse(s.r1, s.c1) + ':' + api.adresse(s.r2, s.c2); g.noms = {}; g.couleurs = {}; }, true); }
    else if (b.id === 'gp-inverser') changer((g) => {
      // Nuage : X et Y échangés ; histogramme ↔ barres horizontales ; les titres suivent
      if (g.type === 'nuage') g.xyInverses = !g.xyInverses; else g.type = g.type === 'barres' ? 'colonnes' : 'barres';
      if (g.type === 'nuage') { const t = g.titreX; g.titreX = g.titreY; g.titreY = t; const a = [g.xMin, g.xMax, g.logX]; [g.xMin, g.xMax, g.logX] = [g.yMin, g.yMax, g.logY]; [g.yMin, g.yMax, g.logY] = a; }
    }, true);
    else if (b.id === 'gp-png') exporter(courant, 'png');
    else if (b.id === 'gp-svg') exporter(courant, 'svg');
    else if (b.id === 'gp-dupliquer') { const copie = JSON.parse(JSON.stringify(courant)); copie.id = 'g' + Date.now().toString(36); copie.x += 24; copie.y += 24; api.feuille().graphiques.push(copie); courant = copie; api.activer(copie.id); api.sauvegarder(); api.rendre(); construirePanneau(); }
    else if (b.id === 'gp-suppr') supprimer(courant);
  });
  panneau.addEventListener('input', (e) => {
    const t = e.target; if (!courant) return;
    const val = t.value;
    const num = (x) => (x === '' ? null : +x);
    switch (t.id) {
      case 'gp-titre': return changer((g) => { g.titre = val; });
      case 'gp-titreX': return changer((g) => { g.titreX = val; });
      case 'gp-titreY': return changer((g) => { g.titreY = val; });
      case 'gp-ymin': return changer((g) => { g.yMin = num(val); });
      case 'gp-ymax': return changer((g) => { g.yMax = num(val); });
      case 'gp-xmin': return changer((g) => { g.xMin = num(val); });
      case 'gp-xmax': return changer((g) => { g.xMax = num(val); });
      case 'gp-police': return changer((g) => { g.police = Math.max(7, Math.min(24, +val || 11)); });
      case 'gp-epaisseur': return changer((g) => { g.epaisseur = Math.max(0.5, Math.min(8, +val || 2)); });
      case 'gp-fond': return changer((g) => { g.fond = val; });
    }
    if (t.dataset.couleur !== undefined) changer((g) => { g.couleurs[t.dataset.couleur] = val; });
    if (t.dataset.ordre !== undefined) changer((g) => { g.tendances[t.dataset.ordre] = { ...g.tendances[t.dataset.ordre], ordre: Math.max(2, Math.min(6, +val || 2)) }; });
    if (t.dataset.periode !== undefined) changer((g) => { g.tendances[t.dataset.periode] = { ...g.tendances[t.dataset.periode], periode: Math.max(2, Math.min(50, +val || 2)) }; });
    if (t.dataset.nom !== undefined) changer((g) => { g.noms[t.dataset.nom] = val; });
  });
  panneau.addEventListener('change', (e) => {
    const t = e.target; if (!courant) return;
    switch (t.id) {
      case 'gp-plage': if (api.plageValide(t.value)) changer((g) => { g.plage = t.value.toUpperCase().replace(/\s/g, ''); g.noms = {}; g.couleurs = {}; }, true); else { api.toast('Plage invalide (ex. A1:C12)', true); t.value = courant.plage; } return;
      case 'gp-lignes': return changer((g) => { g.enLignes = t.checked; g.noms = {}; g.couleurs = {}; }, true);
      case 'gp-logy': return changer((g) => { g.logY = t.value === 'log'; });
      case 'gp-logx': return changer((g) => { g.logX = t.value === 'log'; });
      case 'gp-invy': return changer((g) => { g.inverseY = t.checked; });
      case 'gp-invx': return changer((g) => { g.inverseX = t.checked; });
      case 'gp-legende': return changer((g) => { g.legende = t.value; g.legendeForcee = t.value !== 'aucune'; });
      case 'gp-etiquettes': return changer((g) => { g.etiquettes = t.value; });
      case 'gp-format': return changer((g) => { g.formatY = t.value; });
      case 'gp-quad': return changer((g) => { g.quadrillage = t.checked; });
      case 'gp-quadx': return changer((g) => { g.quadrillageX = t.checked; });
      case 'gp-marqueurs': return changer((g) => { g.marqueurs = t.checked; }, true);
      case 'gp-lisse': return changer((g) => { g.lisse = t.checked; }, true);
    }
    if (t.dataset.tendance !== undefined) return changer((g) => { const i = t.dataset.tendance; if (t.value) g.tendances[i] = { ...(g.tendances[i] || {}), type: t.value }; else delete g.tendances[i]; }, true);
    if (t.dataset.eq !== undefined) return changer((g) => { g.tendances[t.dataset.eq].equation = t.checked; });
    if (t.dataset.r2 !== undefined) return changer((g) => { g.tendances[t.dataset.r2].r2 = t.checked; });
    if (t.dataset.secondaire !== undefined) return changer((g) => { if (t.checked) g.secondaire[t.dataset.secondaire] = true; else delete g.secondaire[t.dataset.secondaire]; });
  });

  function supprimer(g) {
    const f = api.feuille();
    f.graphiques = f.graphiques.filter((x) => x !== g);
    if (courant === g) { courant = null; construirePanneau(); }
    api.activer(null); api.sauvegarder(); api.rendre();
  }

  // ---------------------------------------------------------------------------
  // Export en image
  // ---------------------------------------------------------------------------
  function telecharger(blob, nom) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exporter(g, format) {
    const w = Math.max(400, g.w * 1.5), h = Math.max(260, (g.h - 26) * 1.5);
    const svg = rendreGraphiqueSVG(g, api.donnees(api.feuille(), g.plage), w, h);
    const nom = (g.titre || nomType(g) || 'graphique').replace(/[\\/:*?"<>|]/g, '_');
    if (format === 'svg') { telecharger(new Blob([svg], { type: 'image/svg+xml' }), nom + '.svg'); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => { telecharger(b, nom + '.png'); api.toast('Image « ' + nom + '.png » téléchargée'); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------------------
  // Dessin sur la feuille
  // ---------------------------------------------------------------------------
  function rendreSurFeuille(f, garder = null, z = 1) {
    let html = '';
    for (const g of f.graphiques || []) {
      if (garder && !garder(g)) continue;
      normaliser(g);
      const svg = rendreGraphiqueSVG(g, api.donnees(f, g.plage), g.w - 2, g.h - 26, { edition: g.id === api.actif() });
      html += `<div class="graphique${g.id === api.actif() ? ' actif' : ''}" data-id="${g.id}" style="left:${g.x * z}px;top:${g.y * z}px;width:${g.w}px;height:${g.h}px${z !== 1 ? `;transform:scale(${z});transform-origin:0 0` : ''}">
        <div class="graphique-barre"><span class="graphique-titre" title="${ech(nomType(g))} — glisser pour déplacer, double-clic pour régler">${ech(g.titre || nomType(g))}</span><button class="graphique-reglages" title="Paramètres du graphique">⚙</button><button class="graphique-suppr" title="Supprimer">✕</button></div>
        <div class="graphique-corps">${svg}</div><div class="graphique-redim"></div></div>`;
    }
    return html;
  }

  return {
    ouvrirGalerie, insererDirect, ouvrirParametres, supprimer, exporter, rendreSurFeuille,
    rafraichir() { if (api.panneauOuvert('graphique')) { if (courant && !api.feuille().graphiques.includes(courant)) courant = null; if (document.activeElement && panneau.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), select')) majApercu(); else construirePanneau(); } },
    courant: () => courant,
  };
}
