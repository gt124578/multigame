// Boîtes de dialogue de Sprezz, volontairement courtes : Format de cellule (Ctrl+1), Collage spécial (Ctrl+Alt+V),
// Insérer / Supprimer des cellules (Ctrl++ / Ctrl+-), Atteindre (Ctrl+G, F5), Lien hypertexte (Ctrl+K), Note (Maj+F2),
// Supprimer les doublons, Convertir en colonnes.

import { formater, colVersLettres, adresse, parsePlage } from './formules.js';
import { STYLES_TABLEAU, apercuStyle } from './tableaux.js';
import { collerSpecial, decalerCellules, supprimerDoublons, convertirEnColonnes, zoneContigue, aUnEntete } from './donnees.js';

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (liste, val) => liste.map(([k, t]) => `<option value="${ech(k)}"${String(val ?? '') === String(k) ? ' selected' : ''}>${ech(t)}</option>`).join('');

// Formats de nombre proposés par catégorie
const DATES = ['dd/mm/yyyy', 'd/m/yy', 'dd/mm/yy', 'd mmmm yyyy', 'dddd d mmmm yyyy', 'mmm-yy', 'mmmm yyyy', 'yyyy-mm-dd', 'dd/mm/yyyy hh:mm'];
const HEURES = ['hh:mm', 'hh:mm:ss', 'h:mm AM/PM', '[h]:mm:ss', 'mm:ss'];
const SYMBOLES = [['€', '€ (après)'], ['$', '$ (avant)'], ['£', '£ (avant)'], ['CHF', 'CHF (après)'], ['', 'Aucun']];
const CATEGORIES = [['standard', 'Standard'], ['nombre', 'Nombre'], ['monetaire', 'Monétaire'], ['pourcentage', 'Pourcentage'], ['date', 'Date'], ['heure', 'Heure'], ['scientifique', 'Scientifique'], ['fraction', 'Fraction'], ['texte', 'Texte'], ['perso', 'Personnalisée']];

/** Code de format d'après les choix de l'onglet Nombre. */
export function codeFormat(o) {
  const dec = Math.max(0, Math.min(10, +o.decimales || 0)), d = dec ? '.' + '0'.repeat(dec) : '';
  const base = (o.milliers ? '#,##0' : '0') + d;
  const neg = (b) => (o.negatifs === 'rouge' ? b + ';[Red]-' + b : o.negatifs === 'rougeSansSigne' ? b + ';[Red]' + b : o.negatifs === 'parentheses' ? b + ';(' + b + ')' : b);
  switch (o.categorie) {
    case 'nombre': return neg(base);
    case 'monetaire': { const b = '#,##0' + d; const s = o.symbole ?? '€'; const m = !s ? b : ['$', '£'].includes(s) ? s + b : b + ' ' + s; return neg(m); }
    case 'pourcentage': return '0' + d + '%';
    case 'scientifique': return '0' + d + 'E+00';
    case 'date': return o.date || 'dd/mm/yyyy';
    case 'heure': return o.heure || 'hh:mm';
    case 'fraction': return o.fraction || '# ?/?';
    case 'texte': return '@';
    case 'perso': return o.code || 'General';
    default: return '';
  }
}
/** Catégorie et réglages d'après un code existant (pour ouvrir la boîte sur l'état actuel). */
export function lireCode(z) {
  const o = { categorie: 'standard', decimales: 2, milliers: true, negatifs: 'moins', symbole: '€', date: DATES[0], heure: HEURES[0], fraction: '# ?/?', code: z || '' };
  if (!z || z === 'General') return o;
  const nbDec = (x) => { const m = /\.(0+)/.exec(x); return m ? m[1].length : 0; };
  const premier = z.split(';')[0];
  o.decimales = nbDec(premier);
  o.milliers = premier.includes(',');
  o.negatifs = /;\[Red\]-/.test(z) ? 'rouge' : /;\[Red\]/.test(z) ? 'rougeSansSigne' : /;\(/.test(z) ? 'parentheses' : 'moins';
  if (z === '@') o.categorie = 'texte';
  else if (/%$/.test(premier)) o.categorie = 'pourcentage';
  else if (/E\+0/i.test(premier)) o.categorie = 'scientifique';
  else if (/\?\/|\/\?|\/\d/.test(premier) && !/[dmy]/i.test(premier)) { o.categorie = 'fraction'; o.fraction = z; }
  else if (/[€$£]|CHF/.test(premier)) { o.categorie = 'monetaire'; o.symbole = /€/.test(premier) ? '€' : /\$/.test(premier) ? '$' : /£/.test(premier) ? '£' : 'CHF'; }
  else if (/^[#,0.]+$/.test(premier)) o.categorie = 'nombre';
  else if (DATES.includes(z)) { o.categorie = 'date'; o.date = z; }
  else if (HEURES.includes(z)) { o.categorie = 'heure'; o.heure = z; }
  else o.categorie = 'perso';
  if (codeFormat(o) !== z) o.categorie = 'perso';
  return o;
}

/**
 * api : { classeur(), fi(), feuille(), selection(), selectionBornee(), curseur(), selectionner(p, cur),
 *   memoriser(), rendre(), sauvegarder(), toast(), pressePapier(), allerA(texte), appliquerBordures(mode, style),
 *   fusionner(oui), focusGrille() }
 */
export function installerDialogues(api) {
  const fond = document.createElement('div');
  fond.className = 'boite-fond'; fond.hidden = true;
  document.body.appendChild(fond);
  const $ = (id) => document.getElementById(id);
  let enCours = null;
  function fermer() { fond.hidden = true; fond.innerHTML = ''; enCours = null; api.focusGrille(); }
  fond.addEventListener('mousedown', (e) => { if (e.target === fond) fermer(); });
  fond.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
    else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && enCours && enCours.ok) { e.preventDefault(); e.stopPropagation(); enCours.ok(); }
  });
  /** Ouvre une boîte : titre, contenu HTML, action OK (renvoie false pour garder la boîte ouverte). */
  function ouvrir(titre, html, ok, { large = false, texteOk = 'OK', classe = '' } = {}) {
    fond.innerHTML = `<div class="boite${large ? ' large' : ''}${classe ? ' ' + classe : ''}" role="dialog" aria-label="${ech(titre)}"><div class="boite-titre">${ech(titre)}<button class="boite-x" title="Fermer (Échap)">✕</button></div><div class="boite-corps">${html}</div>
      <div class="boite-pied">${ok ? `<button class="boite-annuler">Annuler</button><button class="principal boite-ok">${ech(texteOk)}</button>` : '<button class="principal boite-annuler">Fermer</button>'}</div></div>`;
    fond.hidden = false;
    enCours = { ok: ok ? () => { if (ok() !== false) fermer(); } : null };
    fond.querySelector('.boite-x').addEventListener('click', fermer);
    fond.querySelector('.boite-annuler').addEventListener('click', fermer);
    if (ok) fond.querySelector('.boite-ok').addEventListener('click', enCours.ok);
    const premier = fond.querySelector('[autofocus]') || fond.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
    if (premier && !matchMedia('(pointer: coarse)').matches) setTimeout(() => { premier.focus(); if (premier.select) premier.select(); }, 0);
    return fond.querySelector('.boite');
  }

  // ---------------------------------------------------------------------------
  // Format de cellule (Ctrl+1)
  // ---------------------------------------------------------------------------
  function formatCellule(onglet = 'nombre') {
    const f = api.feuille(), cur = api.curseur();
    const cel = f.get(cur.r, cur.c) || {}, s0 = cel.s || {};
    const v0 = api.classeur().valeur(api.fi(), cur.r, cur.c);
    const exemple = typeof v0 === 'number' ? v0 : -1234.5678;
    const etat = { ...lireCode(cel.z), s: JSON.parse(JSON.stringify(s0)), bord: { style: 'thin', cotes: {} }, fusion: api.selectionFusionnee() };
    const ONGLETS = [['nombre', 'Nombre'], ['alignement', 'Alignement'], ['police', 'Police'], ['bordure', 'Bordure'], ['remplissage', 'Remplissage'], ['protection', 'Protection']];
    const boite = ouvrir('Format de cellule', `<div class="onglets-boite">${ONGLETS.map(([k, t]) => `<button data-onglet="${k}">${t}</button>`).join('')}</div><div class="onglet-contenu" id="fc-contenu"></div>`, appliquer, { large: true });
    const contenu = $('fc-contenu');
    let courant = onglet;
    const changer = (k) => { courant = k; boite.querySelectorAll('[data-onglet]').forEach((b) => b.classList.toggle('choisi', b.dataset.onglet === k)); dessiner(); };
    boite.querySelectorAll('[data-onglet]').forEach((b) => b.addEventListener('click', () => changer(b.dataset.onglet)));
    function apercuNombre() { const z = codeFormat(etat); return z === '@' ? String(v0 ?? '') : formater(exemple, z || undefined); }
    function dessiner() {
      const s = etat.s;
      if (courant === 'nombre') {
        const c = etat.categorie;
        contenu.innerHTML = `<div class="fc-nombre"><div class="fc-cats">${CATEGORIES.map(([k, t]) => `<button data-cat="${k}" class="${k === c ? 'choisi' : ''}">${t}</button>`).join('')}</div>
          <div class="fc-reglages"><div class="fc-apercu">Exemple : <b id="fc-ex">${ech(apercuNombre())}</b></div>
          ${['nombre', 'monetaire', 'pourcentage', 'scientifique'].includes(c) ? `<label>Décimales <input type="number" id="fc-dec" min="0" max="10" value="${etat.decimales}"></label>` : ''}
          ${c === 'nombre' ? `<label class="case"><input type="checkbox" id="fc-mil"${etat.milliers ? ' checked' : ''}> Séparateur de milliers (1 234)</label>` : ''}
          ${c === 'monetaire' ? `<label>Symbole <select id="fc-sym">${opt(SYMBOLES, etat.symbole)}</select></label>` : ''}
          ${['nombre', 'monetaire'].includes(c) ? `<label>Négatifs <select id="fc-neg">${opt([['moins', '-1 234,10'], ['rouge', '-1 234,10 en rouge'], ['rougeSansSigne', '1 234,10 en rouge'], ['parentheses', '(1 234,10)']], etat.negatifs)}</select></label>` : ''}
          ${c === 'date' ? `<div class="fc-liste">${DATES.map((d) => `<button data-z="${ech(d)}" data-cle="date" class="${d === etat.date ? 'choisi' : ''}">${ech(formater(typeof v0 === 'number' ? v0 : 45366.5, d))}</button>`).join('')}</div>` : ''}
          ${c === 'heure' ? `<div class="fc-liste">${HEURES.map((d) => `<button data-z="${ech(d)}" data-cle="heure" class="${d === etat.heure ? 'choisi' : ''}">${ech(formater(typeof v0 === 'number' ? v0 : 0.6045, d))}</button>`).join('')}</div>` : ''}
          ${c === 'fraction' ? `<div class="fc-liste">${[['# ?/?', 'Un chiffre (1/4)'], ['# ??/??', 'Deux chiffres (21/25)'], ['# ?/2', 'Demis'], ['# ?/4', 'Quarts'], ['# ?/8', 'Huitièmes'], ['# ??/100', 'Centièmes']].map(([d, t]) => `<button data-z="${d}" data-cle="fraction" class="${d === etat.fraction ? 'choisi' : ''}">${t}</button>`).join('')}</div>` : ''}
          ${c === 'perso' ? `<label>Code <input id="fc-code" value="${ech(etat.code || codeFormat({ ...etat, categorie: 'nombre' }))}" spellcheck="false"></label><p class="aide-petite">0 chiffre, # chiffre facultatif, , milliers, . décimales, % pourcentage, "texte", [Red] couleur, ; sections positif;négatif;zéro, jj/mm/aaaa ou dd/mm/yyyy, hh:mm.</p>` : ''}
          ${c === 'texte' ? '<p class="aide-petite">La saisie est gardée telle quelle (pas de calcul, pas de conversion en nombre ou en date).</p>' : ''}
          ${c === 'standard' ? '<p class="aide-petite">Affichage automatique, sans format particulier.</p>' : ''}
          </div></div>`;
        contenu.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.cat === 'perso' && etat.categorie !== 'perso') etat.code = codeFormat(etat) || '0.00'; etat.categorie = b.dataset.cat; dessiner(); }));
        contenu.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => { etat[b.dataset.cle] = b.dataset.z; dessiner(); }));
        const maj = () => { if ($('fc-dec')) etat.decimales = +$('fc-dec').value; if ($('fc-mil')) etat.milliers = $('fc-mil').checked; if ($('fc-sym')) etat.symbole = $('fc-sym').value; if ($('fc-neg')) etat.negatifs = $('fc-neg').value; if ($('fc-code')) etat.code = $('fc-code').value; $('fc-ex').textContent = apercuNombre(); };
        contenu.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', maj));
      } else if (courant === 'alignement') {
        contenu.innerHTML = `<div class="fc-grille">
          <label>Horizontal <select id="fc-h">${opt([['', 'Standard'], ['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']], s.align)}</select></label>
          <label>Vertical <select id="fc-v">${opt([['', 'Bas'], ['center', 'Centré'], ['top', 'Haut']], s.valign)}</select></label>
          <label>Retrait <input type="number" id="fc-ret" min="0" max="15" value="${s.retrait || 0}"></label>
          <label class="case"><input type="checkbox" id="fc-renvoi"${s.renvoi ? ' checked' : ''}> Renvoyer à la ligne automatiquement</label>
          <label class="case"><input type="checkbox" id="fc-fus"${etat.fusion ? ' checked' : ''}> Fusionner les cellules</label></div>`;
        const maj = () => { s.align = $('fc-h').value || undefined; s.valign = $('fc-v').value || undefined; s.retrait = +$('fc-ret').value || undefined; s.renvoi = $('fc-renvoi').checked || undefined; etat.fusion = $('fc-fus').checked; };
        contenu.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', maj));
      } else if (courant === 'police') {
        const tailles = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
        contenu.innerHTML = `<div class="fc-grille">
          <label class="case"><input type="checkbox" id="fc-g"${s.gras ? ' checked' : ''}> <b>Gras</b></label>
          <label class="case"><input type="checkbox" id="fc-i"${s.italique ? ' checked' : ''}> <i>Italique</i></label>
          <label class="case"><input type="checkbox" id="fc-u"${s.souligne ? ' checked' : ''}> <u>Souligné</u></label>
          <label class="case"><input type="checkbox" id="fc-b"${s.barre ? ' checked' : ''}> <s>Barré</s></label>
          <label>Taille <select id="fc-t">${opt(tailles.map((t) => [String(Math.round(t / 0.75)), String(t)]), String(s.taille || 13))}</select></label>
          <label>Couleur <input type="color" id="fc-c" value="${s.couleur || '#000000'}"> <button class="petit" id="fc-c0">Automatique</button></label>
          <div class="fc-apercu" id="fc-pol">AaBbCc 123</div></div>`;
        const maj = () => { s.gras = $('fc-g').checked || undefined; s.italique = $('fc-i').checked || undefined; s.souligne = $('fc-u').checked || undefined; s.barre = $('fc-b').checked || undefined; const t = +$('fc-t').value; s.taille = t !== 13 ? t : undefined; apercuPolice(); };
        const apercuPolice = () => { const el = $('fc-pol'); el.style.fontWeight = s.gras ? 700 : 400; el.style.fontStyle = s.italique ? 'italic' : 'normal'; el.style.textDecoration = [s.souligne && 'underline', s.barre && 'line-through'].filter(Boolean).join(' ') || 'none'; el.style.fontSize = (s.taille || 13) + 'px'; el.style.color = s.couleur || '#000'; };
        contenu.querySelectorAll('input:not([type=color]), select').forEach((el) => el.addEventListener('input', maj));
        $('fc-c').addEventListener('input', (e) => { s.couleur = e.target.value; apercuPolice(); });
        $('fc-c0').addEventListener('click', () => { delete s.couleur; $('fc-c').value = '#000000'; apercuPolice(); });
        apercuPolice();
      } else if (courant === 'bordure') {
        const b = etat.bord;
        contenu.innerHTML = `<div class="fc-bord">
          <div class="fc-liste">${[['aucune', 'Aucune'], ['contour', 'Contour'], ['interieur', 'Intérieur'], ['toutes', 'Toutes']].map(([k, t]) => `<button data-pre="${k}" class="${b.preset === k ? 'choisi' : ''}">${t}</button>`).join('')}</div>
          <label>Trait <select id="fc-bs">${opt([['thin', 'Fin'], ['medium', 'Moyen'], ['thick', 'Épais']], b.style)}</select></label>
          <p class="aide-petite">Ou choisissez les côtés du contour :</p>
          <div class="fc-cotes">${[['h', 'Haut'], ['b', 'Bas'], ['g', 'Gauche'], ['d', 'Droite']].map(([k, t]) => `<button data-cote="${k}" class="${b.cotes[k] ? 'choisi' : ''}">${t}</button>`).join('')}</div>
          <div class="fc-apercu-bord" style="${['h', 'b', 'g', 'd'].map((k) => (b.cotes[k] || b.preset === 'contour' || b.preset === 'toutes' ? `border-${{ h: 'top', b: 'bottom', g: 'left', d: 'right' }[k]}:${{ thin: 1, medium: 2, thick: 3 }[b.style]}px solid #111;` : '')).join('')}">${b.preset === 'interieur' || b.preset === 'toutes' ? '<i class="v"></i><i class="h"></i>' : ''}Texte</div></div>`;
        contenu.querySelectorAll('[data-pre]').forEach((x) => x.addEventListener('click', () => { b.preset = b.preset === x.dataset.pre ? null : x.dataset.pre; b.cotes = {}; dessiner(); }));
        contenu.querySelectorAll('[data-cote]').forEach((x) => x.addEventListener('click', () => { b.preset = null; b.cotes[x.dataset.cote] = !b.cotes[x.dataset.cote]; dessiner(); }));
        $('fc-bs').addEventListener('change', (e) => { b.style = e.target.value; dessiner(); });
      } else if (courant === 'protection') {
        contenu.innerHTML = `<div class="fc-grille">
          <label class="case"><input type="checkbox" id="fc-verr"${s.deverrouille ? '' : ' checked'}> Verrouillée</label>
          <label class="case"><input type="checkbox" id="fc-masq"${s.masquee ? ' checked' : ''}> Masquée (la formule n'apparaît pas dans la barre)</label>
          <p class="aide-petite">Ces réglages n'ont d'effet que lorsque la feuille est protégée (menu … › Révision › Protéger la feuille). Déverrouillez les cellules à remplir avant de protéger.</p></div>`;
        const maj = () => { s.deverrouille = !$('fc-verr').checked || undefined; s.masquee = $('fc-masq').checked || undefined; };
        contenu.querySelectorAll('input').forEach((el) => el.addEventListener('input', maj));
      } else if (courant === 'remplissage') {
        const couleurs = ['#ffffff', '#f2f2f2', '#d9d9d9', '#fff2cc', '#ffeb9c', '#fce4d6', '#ffc7ce', '#e2efda', '#c6efce', '#ddebf7', '#dbe5f1', '#e4dfec', '#ffff00', '#ffc000', '#ff0000', '#00b050', '#00b0f0', '#0070c0', '#7030a0', '#000000'];
        contenu.innerHTML = `<div class="fc-couleurs">${couleurs.map((c) => `<button data-fond="${c}" style="background:${c}" class="${s.fond === c ? 'choisi' : ''}" title="${c}"></button>`).join('')}</div>
          <label>Autre couleur <input type="color" id="fc-f" value="${s.fond || '#ffffff'}"></label>
          <button id="fc-f0" class="petit">Aucun remplissage</button>
          <div class="fc-apercu" id="fc-fa" style="background:${s.fond || 'transparent'}">Aperçu</div>`;
        const maj = (c) => { s.fond = c || undefined; $('fc-fa').style.background = c || 'transparent'; contenu.querySelectorAll('[data-fond]').forEach((x) => x.classList.toggle('choisi', x.dataset.fond === c)); };
        contenu.querySelectorAll('[data-fond]').forEach((x) => x.addEventListener('click', () => maj(x.dataset.fond)));
        $('fc-f').addEventListener('input', (e) => maj(e.target.value));
        $('fc-f0').addEventListener('click', () => maj(null));
      }
    }
    function appliquer() {
      const z = codeFormat(etat);
      const zAvant = cel.z || '';
      // Seules les propriétés changées sont posées sur toute la sélection (les autres cellules gardent les leurs)
      const patch = {};
      for (const k of ['gras', 'italique', 'souligne', 'barre', 'taille', 'couleur', 'fond', 'align', 'valign', 'renvoi', 'retrait', 'deverrouille', 'masquee']) if ((etat.s[k] ?? null) !== (s0[k] ?? null)) patch[k] = etat.s[k] ?? null;
      api.memoriser('formatCellules');
      api.surSelection((r, c) => {
        if (Object.keys(patch).length) api.classeur().style(api.fi(), r, c, patch);
        if (z !== zAvant && (z || api.feuille().get(r, c))) api.classeur().format(api.fi(), r, c, z || null);
      }, false);
      const b = etat.bord;
      if (b.preset) api.appliquerBordures(b.preset, b.style);
      else for (const [k, nom] of [['h', 'haut'], ['b', 'bas'], ['g', 'gauche'], ['d', 'droite']]) if (b.cotes[k]) api.appliquerBordures(nom, b.style);
      if (etat.fusion !== api.selectionFusionnee()) api.fusionner(etat.fusion);
      api.sauvegarder(); api.rendre();
    }
    changer(onglet);
  }

  // ---------------------------------------------------------------------------
  // Collage spécial (Ctrl+Alt+V)
  // ---------------------------------------------------------------------------
  function collageSpecial() {
    const pp = api.pressePapier();
    if (!pp) return api.toast('Copiez d\'abord des cellules (Ctrl+C)', true);
    ouvrir('Collage spécial', `<div class="fc-grille deux">
      <fieldset><legend>Coller</legend>${[['tout', 'Tout'], ['formules', 'Formules'], ['valeurs', 'Valeurs'], ['valeursFormats', 'Valeurs et formats'], ['formats', 'Formats'], ['notes', 'Notes']].map(([k, t], i) => `<label class="case"><input type="radio" name="cs-quoi" value="${k}"${i === 0 ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
      <fieldset><legend>Opération</legend>${[['aucune', 'Aucune'], ['addition', 'Addition'], ['soustraction', 'Soustraction'], ['multiplication', 'Multiplication'], ['division', 'Division']].map(([k, t], i) => `<label class="case"><input type="radio" name="cs-op" value="${k}"${i === 0 ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
      <label class="case"><input type="checkbox" id="cs-vides"> Ignorer les cellules vides</label>
      <label class="case"><input type="checkbox" id="cs-trans"> Transposer (lignes ↔ colonnes)</label></div>`, () => {
      const quoi = fond.querySelector('input[name="cs-quoi"]:checked').value, operation = fond.querySelector('input[name="cs-op"]:checked').value;
      const src = { classeur: pp.classeur, fi: pp.classeur.feuilles.indexOf(pp.feuille), r1: pp.r1, c1: pp.c1, r2: pp.r2, c2: pp.c2 };
      if (src.fi < 0) { api.toast('La feuille copiée n\'existe plus', true); return; }
      api.memoriser();
      const cur = api.selection();
      const p = collerSpecial(api.classeur(), src, api.fi(), { r: cur.r1, c: cur.c1 }, { quoi, operation, ignorerVides: $('cs-vides').checked, transposer: $('cs-trans').checked });
      api.selectionner(p, { r: p.r1, c: p.c1 });
      api.sauvegarder(); api.rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Insérer / supprimer des cellules (Ctrl++ / Ctrl+-)
  // ---------------------------------------------------------------------------
  function cellules(inserer) {
    const s = api.selection();
    if (s.c2 >= 16383) return api.lignesColonnes(inserer, 'r');
    if (s.r2 >= 1048575) return api.lignesColonnes(inserer, 'c');
    ouvrir(inserer ? 'Insérer des cellules' : 'Supprimer des cellules', `<div class="fc-grille">${(inserer ? [['bas', 'Décaler les cellules vers le bas'], ['droite', 'Décaler les cellules vers la droite'], ['lignes', 'Lignes entières'], ['colonnes', 'Colonnes entières']] : [['haut', 'Décaler les cellules vers le haut'], ['gauche', 'Décaler les cellules vers la gauche'], ['lignes', 'Lignes entières'], ['colonnes', 'Colonnes entières']]).map(([k, t], i) => `<label class="case"><input type="radio" name="ic" value="${k}"${i === 0 ? ' checked' : ''}> ${t}</label>`).join('')}</div>`, () => {
      const v = fond.querySelector('input[name="ic"]:checked').value;
      if (v === 'lignes') return api.lignesColonnes(inserer, 'r');
      if (v === 'colonnes') return api.lignesColonnes(inserer, 'c');
      api.memoriser();
      const b = api.selectionBornee();
      decalerCellules(api.classeur(), api.fi(), { ...b, r2: Math.max(b.r2, b.r1), c2: Math.max(b.c2, b.c1) }, v);
      api.sauvegarder(); api.rendre();
    }, { texteOk: inserer ? 'Insérer' : 'Supprimer' });
  }

  // ---------------------------------------------------------------------------
  // Atteindre (Ctrl+G, F5)
  // ---------------------------------------------------------------------------
  function atteindre() {
    const C = api.classeur();
    const noms = [...C.noms.values(), ...api.feuille().noms.values()].map((d) => d.nom);
    ouvrir('Atteindre', `<label>Référence <input id="at-ref" placeholder="B12, A1:C9, Feuil2!D4 ou un nom" spellcheck="false" autofocus></label>
      ${noms.length ? `<div class="fc-liste noms">${noms.map((n) => `<button data-nom="${ech(n)}">${ech(n)}</button>`).join('')}</div>` : ''}`, () => {
      const t = $('at-ref').value.trim();
      if (!t) return false;
      if (!api.allerA(t)) { api.toast('Référence introuvable : ' + t, true); return false; }
    });
    fond.querySelectorAll('[data-nom]').forEach((b) => b.addEventListener('click', () => { $('at-ref').value = b.dataset.nom; enCours.ok(); }));
  }

  // ---------------------------------------------------------------------------
  // Lien hypertexte (Ctrl+K) et note (Maj+F2)
  // ---------------------------------------------------------------------------
  function lien() {
    const cur = api.curseur(), cel = api.feuille().get(cur.r, cur.c) || {};
    const texte = api.classeur().texte(api.fi(), cur.r, cur.c);
    ouvrir('Lien hypertexte', `<label>Adresse <input id="ln-url" value="${ech(cel.lien || '')}" placeholder="https://…, mailto:…, ou #Feuil2!A1" spellcheck="false" autofocus></label>
      <label>Texte affiché <input id="ln-txt" value="${ech(texte)}"></label>${cel.lien ? '<button id="ln-suppr" class="danger petit">Supprimer le lien</button>' : ''}`, () => {
      let url = $('ln-url').value.trim(); const t = $('ln-txt').value;
      api.memoriser();
      if (url && !/^(https?:|mailto:|tel:|#|ftp:)/i.test(url)) url = (/^[^\s/]+\.[a-z]{2,}/i.test(url) ? 'https://' : '#') + url;
      const C = api.classeur(), f = api.feuille();
      if (t !== texte || !f.get(cur.r, cur.c)) C.saisir(api.fi(), cur.r, cur.c, t || url);
      const c2 = f.get(cur.r, cur.c) || {};
      if (url) { c2.lien = url; c2.s = { ...(c2.s || {}), couleur: (c2.s && c2.s.couleur) || '#0563c1', souligne: true }; } else delete c2.lien;
      f.set(cur.r, cur.c, c2); C.modifie();
      api.sauvegarder(); api.rendre();
    });
    if ($('ln-suppr')) $('ln-suppr').addEventListener('click', () => { api.memoriser(); const c2 = api.feuille().get(cur.r, cur.c); if (c2) { delete c2.lien; if (c2.s) { if (c2.s.couleur === '#0563c1') delete c2.s.couleur; delete c2.s.souligne; } } api.classeur().modifie(); api.sauvegarder(); api.rendre(); fermer(); });
  }
  function note() {
    const cur = api.curseur(), cel = api.feuille().get(cur.r, cur.c) || {};
    ouvrir('Note — ' + adresse(cur.r, cur.c), `<textarea id="nt-texte" rows="6" autofocus placeholder="Votre note…">${ech(cel.note || '')}</textarea>${cel.note ? '<button id="nt-suppr" class="danger petit">Supprimer la note</button>' : ''}`, () => {
      api.memoriser();
      const f = api.feuille(), c2 = f.get(cur.r, cur.c) || {}, t = $('nt-texte').value.trim();
      if (t) c2.note = t; else delete c2.note;
      f.set(cur.r, cur.c, Object.keys(c2).length ? c2 : null);
      api.classeur().modifie(); api.sauvegarder(); api.rendre();
    });
    $('nt-texte').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enCours.ok(); } });
    if ($('nt-suppr')) $('nt-suppr').addEventListener('click', () => { $('nt-texte').value = ''; enCours.ok(); });
  }

  // ---------------------------------------------------------------------------
  // Supprimer les doublons, convertir en colonnes
  // ---------------------------------------------------------------------------
  function doublons() {
    const C = api.classeur(), fi = api.fi(), s = api.selectionBornee();
    const p = s.r1 === s.r2 && s.c1 === s.c2 ? zoneContigue(api.feuille(), s.r1, s.c1) : s;
    const entete = aUnEntete(C, fi, p);
    const nomCol = (c, e) => { const v = e ? C.valeur(fi, p.r1, c) : null; return 'Colonne ' + colVersLettres(c) + (v !== null && v !== '' ? ' — ' + v : ''); };
    const dessiner = (e) => `<p class="aide-petite">Plage ${adresse(p.r1, p.c1)}:${adresse(p.r2, p.c2)}. Les lignes identiques sur les colonnes cochées sont supprimées (la première est gardée).</p>
      <label class="case"><input type="checkbox" id="db-ent"${e ? ' checked' : ''}> Mes données ont des en-têtes</label>
      <div class="fc-grille" id="db-cols">${Array.from({ length: p.c2 - p.c1 + 1 }, (_, i) => `<label class="case"><input type="checkbox" data-col="${p.c1 + i}" checked> ${ech(nomCol(p.c1 + i, e))}</label>`).join('')}</div>`;
    ouvrir('Supprimer les doublons', dessiner(entete), () => {
      const cols = [...fond.querySelectorAll('[data-col]')].filter((x) => x.checked).map((x) => +x.dataset.col);
      if (!cols.length) { api.toast('Cochez au moins une colonne', true); return false; }
      api.memoriser();
      const n = supprimerDoublons(C, fi, p, cols, { entete: $('db-ent').checked });
      api.sauvegarder(); api.rendre();
      api.toast(n ? n + ' doublon(s) supprimé(s)' : 'Aucun doublon');
    });
    $('db-ent').addEventListener('change', (e) => { fond.querySelector('.boite-corps').innerHTML = dessiner(e.target.checked); fond.querySelector('#db-ent').addEventListener('change', (ev) => { fond.querySelector('.boite-corps').innerHTML = dessiner(ev.target.checked); }); });
  }
  function colonnes() {
    const s = api.selectionBornee();
    if (s.c2 > s.c1) return api.toast('Choisissez une seule colonne de textes à découper', true);
    ouvrir('Convertir en colonnes', `<p class="aide-petite">Découpe chaque texte de ${adresse(s.r1, s.c1)}:${adresse(s.r2, s.c1)} sur un séparateur ; les morceaux vont dans les colonnes à droite.</p>
      <div class="fc-grille">${[[';', 'Point-virgule ;'], [',', 'Virgule ,'], ['tab', 'Tabulation'], ['espace', 'Espace'], ['autre', 'Autre :']].map(([k, t], i) => `<label class="case"><input type="radio" name="cv-sep" value="${k}"${i === 0 ? ' checked' : ''}> ${t}</label>`).join('')}
      <input id="cv-autre" maxlength="3" style="width:60px"><label class="case"><input type="checkbox" id="cv-reg"> Ignorer les séparateurs qui se suivent</label></div>`, () => {
      let sep = fond.querySelector('input[name="cv-sep"]:checked').value;
      if (sep === 'autre') sep = $('cv-autre').value || ';';
      api.memoriser();
      const n = convertirEnColonnes(api.classeur(), api.fi(), s, sep, { regrouper: $('cv-reg').checked });
      api.sauvegarder(); api.rendre(); api.toast('Découpé en ' + n + ' colonne(s)');
    });
  }

  // ---------------------------------------------------------------------------
  // Tableaux structurés : créer (Ctrl+L), style, nom, taille
  // ---------------------------------------------------------------------------
  const galerie = (choisi) => `<div class="galerie-styles">${STYLES_TABLEAU.map((n) => `<button data-style="${n}" class="${n === choisi ? 'choisi' : ''}" title="${n.replace('TableStyle', '').replace('Medium', 'Moyen ').replace('Light', 'Clair ')}">${apercuStyle(n)}</button>`).join('')}</div>`;
  const brancherGalerie = (etat) => fond.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => { etat.style = b.dataset.style; fond.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('choisi', x === b)); }));
  function creerTableau() {
    const C = api.classeur(), fi = api.fi(), s0 = api.selectionBornee();
    const existant = C.tableauEn(fi, s0.r1, s0.c1);
    if (existant) return api.toast('Cette cellule est déjà dans le tableau ' + existant.t.nom, true);
    const p = s0.r1 === s0.r2 && s0.c1 === s0.c2 ? zoneContigue(api.feuille(), s0.r1, s0.c1) : s0;
    const etat = { style: 'TableStyleMedium7' };
    ouvrir('Créer un tableau', `<label>Plage des données <input id="tb-plage" value="${adresse(p.r1, p.c1, true, true)}:${adresse(p.r2, p.c2, true, true)}" spellcheck="false"></label>
      <label class="case"><input type="checkbox" id="tb-entete"${aUnEntete(C, fi, p) ? ' checked' : ''}> Mon tableau comporte des en-têtes</label>
      <p class="aide-petite">Le tableau s'agrandit tout seul quand vous écrivez juste dessous ou à côté ; une formule saisie dans une colonne se recopie sur toute la colonne ; les formules peuvent citer ses colonnes par leur nom (<code>=SOMME(Tableau1[Prix])</code>, <code>=[@Prix]*[@Qté]</code>).</p>
      ${galerie(etat.style)}`, () => {
      const q = parsePlage($('tb-plage').value.replace(/\$/g, '').trim().toUpperCase());
      if (!q) { api.toast('Plage invalide', true); return false; }
      api.memoriser();
      let t;
      try { t = C.creerTableau(fi, q, { entete: $('tb-entete').checked, style: etat.style }); } catch (e) { api.toast(e.message, true); return false; }
      const f = api.feuille();
      if (!f.filtre) { f.filtre = { r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2, criteres: {} }; f.filtrees = new Set(); }
      api.selectionner({ r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2 }, api.curseur());
      api.sauvegarder(); api.rendre();
      api.toast('Tableau « ' + t.nom + ' » créé');
    });
    brancherGalerie(etat);
  }
  function styleTableauDlg(t) {
    const etat = { style: t.style };
    ouvrir('Style du tableau ' + t.nom, `${galerie(t.style)}
      <div class="fc-grille"><label class="case"><input type="checkbox" id="tb-bandes"${t.bandes !== false ? ' checked' : ''}> Lignes à bandes</label>
      <label class="case"><input type="checkbox" id="tb-prem"${t.premiereColonne ? ' checked' : ''}> Première colonne</label>
      <label class="case"><input type="checkbox" id="tb-der"${t.derniereColonne ? ' checked' : ''}> Dernière colonne</label></div>`, () => {
      api.memoriser();
      t.style = etat.style; t.bandes = $('tb-bandes').checked; t.premiereColonne = $('tb-prem').checked || undefined; t.derniereColonne = $('tb-der').checked || undefined;
      api.classeur().modifie(); api.sauvegarder(); api.rendre();
    });
    brancherGalerie(etat);
  }
  function renommerTableauDlg(t) {
    ouvrir('Nom du tableau', `<label>Nom <input id="tb-nom" value="${ech(t.nom)}" spellcheck="false"></label><p class="aide-petite">Les formules qui citent le tableau suivent.</p>`, () => {
      api.memoriser();
      try { api.classeur().renommerTableau(t.nom, $('tb-nom').value); } catch (e) { api.toast(e.message, true); return false; }
      api.sauvegarder(); api.rendre();
    });
  }
  function redimensionnerTableau(t) {
    ouvrir('Redimensionner le tableau', `<label>Nouvelle plage <input id="tb-plage" value="${adresse(t.r1, t.c1, true, true)}:${adresse(t.r2, t.c2, true, true)}" spellcheck="false"></label><p class="aide-petite">Les en-têtes restent sur la même ligne.</p>`, () => {
      const q = parsePlage($('tb-plage').value.replace(/\$/g, '').trim().toUpperCase());
      if (!q || q.r1 !== t.r1 || q.r2 <= q.r1) { api.toast('La plage doit commencer sur la ligne des en-têtes (' + (t.r1 + 1) + ')', true); return false; }
      const C = api.classeur(), fi = api.fi();
      if ((api.feuille().tableaux || []).some((x) => x !== t && !(q.r2 < x.r1 || q.r1 > x.r2 || q.c2 < x.c1 || q.c1 > x.c2))) { api.toast('La plage chevauche un autre tableau', true); return false; }
      api.memoriser();
      Object.assign(t, { c1: q.c1, r2: q.r2, c2: q.c2 });
      const noms = C.nomsColonnes(fi, t);
      noms.forEach((n, i) => { const cel = api.feuille().get(t.r1, t.c1 + i); if (!cel || cel.v == null || cel.v === '') api.feuille().set(t.r1, t.c1 + i, { ...(cel || {}), v: n }); });
      t.colonnes = C.nomsColonnes(fi, t);
      const f = api.feuille(); if (f.filtre && f.filtre.r1 === t.r1) Object.assign(f.filtre, { c1: t.c1, r2: t.totaux ? t.r2 - 1 : t.r2, c2: t.c2 });
      C.modifie(); api.sauvegarder(); api.rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Protéger la feuille
  // ---------------------------------------------------------------------------
  function protegerFeuille() {
    const f = api.feuille();
    if (f.protection && f.protection.active) {
      const p = f.protection;
      if (!p.hash && !p.sha) { f.protection = { ...p, active: false }; api.classeur().version++; api.sauvegarder(); api.rendre(); return api.toast('Protection de la feuille ôtée'); }
      return ouvrir('Ôter la protection', `<label>Mot de passe <input type="password" id="pf-mdp" autocomplete="off"></label>`, () => {
        const m = $('pf-mdp').value;
        if (p.hash && api.hacher(m) !== p.hash) { api.toast('Mot de passe incorrect', true); return false; }
        if (!p.hash && p.sha && !api.verifierSha(m, p.sha)) { api.toast('Mot de passe incorrect', true); return false; }
        f.protection = { ...p, active: false }; api.classeur().version++; api.sauvegarder(); api.rendre(); api.toast('Protection de la feuille ôtée');
      });
    }
    const droits = { ...((f.protection && f.protection.autoriser) || {}) };
    ouvrir('Protéger la feuille', `<p class="aide-petite">Les cellules verrouillées (toutes, par défaut) ne peuvent plus être modifiées. Pour laisser des cellules à remplir, déverrouillez-les d'abord (Format de cellule › Protection).</p>
      <label>Mot de passe (facultatif) <input type="password" id="pf-mdp" autocomplete="new-password"></label>
      <label>Confirmer <input type="password" id="pf-mdp2" autocomplete="new-password"></label>
      <div class="outil-titre">Autoriser tous les utilisateurs à :</div>
      <div class="fc-grille">${api.droits.map(([k, , t, d]) => `<label class="case"><input type="checkbox" data-droit="${k}"${(droits[k] ?? d) ? ' checked' : ''}> ${t}</label>`).join('')}</div>`, () => {
      const m = $('pf-mdp').value;
      if (m !== $('pf-mdp2').value) { api.toast('Les deux mots de passe sont différents', true); return false; }
      fond.querySelectorAll('[data-droit]').forEach((x) => { droits[x.dataset.droit] = x.checked; });
      f.protection = { active: true, autoriser: droits, ...(m ? { hash: api.hacher(m) } : {}) };
      api.classeur().version++; api.sauvegarder(); api.rendre();
      api.toast('Feuille protégée' + (m ? ' par mot de passe' : ''));
    });
  }

  // ---------------------------------------------------------------------------
  // Graphiques sparkline : une petite courbe par ligne (ou colonne) de données, dans la cellule d'à côté
  // ---------------------------------------------------------------------------
  function sparklines(type, groupe) {
    const f = api.feuille(), s = api.selectionBornee();
    const existant = groupe ? (f.sparklines || []).filter((x) => x.groupe === groupe) : null;
    const modele = existant && existant[0] ? { ...existant[0] } : { type: type || 'ligne', couleur: '#376092', couleurNeg: '#d00000', marqueurs: false, haut: false, bas: false, premier: false, dernier: false, negatifs: false };
    // Données : la sélection ; emplacement : la colonne à droite (une sparkline par ligne), ou la ligne dessous pour une seule ligne choisie en colonne
    let donnees = adresse(s.r1, s.c1) + ':' + adresse(s.r2, s.c2), lieu;
    if (existant) { donnees = existant.map((x) => x.donnees).join(';'); lieu = existant.map((x) => adresse(x.r, x.c)).join(';'); }
    else if (s.c2 > s.c1) lieu = adresse(s.r1, s.c2 + 1) + (s.r2 > s.r1 ? ':' + adresse(s.r2, s.c2 + 1) : '');
    else lieu = adresse(s.r2 + 1, s.c1);
    const html = `<div class="fc-liste" style="flex-direction:row">${[['ligne', 'Courbe'], ['colonne', 'Histogramme'], ['gainperte', 'Gain / perte']].map(([k, t]) => `<button data-sptype="${k}" class="${modele.type === k ? 'choisi' : ''}">${t}</button>`).join('')}</div>
      ${existant ? '' : `<label>Plage de données <input id="sp-donnees" value="${ech(donnees)}" spellcheck="false"></label>
      <label>Emplacement <input id="sp-lieu" value="${ech(lieu)}" spellcheck="false"></label>`}
      <div class="fc-grille"><label>Couleur <input type="color" id="sp-couleur" value="${modele.couleur}"></label><label>Négatifs <input type="color" id="sp-neg" value="${modele.couleurNeg}"></label>
      ${[['marqueurs', 'Marqueurs'], ['haut', 'Point haut'], ['bas', 'Point bas'], ['premier', 'Premier point'], ['dernier', 'Dernier point'], ['negatifs', 'Points négatifs']].map(([k, t]) => `<label class="case"><input type="checkbox" data-sp="${k}"${modele[k] ? ' checked' : ''}> ${t}</label>`).join('')}</div>`;
    ouvrir(existant ? 'Groupe de sparklines' : 'Insérer des sparklines', html, () => {
      fond.querySelectorAll('[data-sp]').forEach((x) => { modele[x.dataset.sp] = x.checked; });
      modele.couleur = $('sp-couleur').value; modele.couleurNeg = $('sp-neg').value;
      api.memoriser('formatCellules');
      if (existant) { for (const x of existant) Object.assign(x, { ...modele, r: x.r, c: x.c, donnees: x.donnees, groupe }); }
      else {
        const d = parsePlage($('sp-donnees').value.replace(/\$/g, '').trim().toUpperCase()), l = parsePlage($('sp-lieu').value.replace(/\$/g, '').trim().toUpperCase());
        if (!d || !l) { api.toast('Plage invalide', true); return false; }
        const cellules = []; for (let r = l.r1; r <= l.r2; r++) for (let c = l.c1; c <= l.c2; c++) cellules.push({ r, c });
        const enLignes = l.c1 === l.c2; // emplacement en colonne : une ligne de données par cellule
        const n = enLignes ? d.r2 - d.r1 + 1 : d.c2 - d.c1 + 1;
        if (cellules.length !== n && cellules.length !== 1) { api.toast('L\'emplacement doit avoir autant de cellules que la plage a de ' + (enLignes ? 'lignes' : 'colonnes') + ' (' + n + ')', true); return false; }
        const gr = 'sp' + Date.now().toString(36);
        f.sparklines = (f.sparklines || []).filter((x) => !cellules.some((c) => c.r === x.r && c.c === x.c));
        cellules.forEach((cel, i) => {
          const src = cellules.length === 1 ? d : enLignes ? { r1: d.r1 + i, c1: d.c1, r2: d.r1 + i, c2: d.c2 } : { r1: d.r1, c1: d.c1 + i, r2: d.r2, c2: d.c1 + i };
          f.sparklines.push({ ...modele, groupe: gr, r: cel.r, c: cel.c, donnees: adresse(src.r1, src.c1) + ':' + adresse(src.r2, src.c2) });
        });
      }
      api.classeur().version++; api.sauvegarder(); api.rendre();
    });
    fond.querySelectorAll('[data-sptype]').forEach((b) => b.addEventListener('click', () => { modele.type = b.dataset.sptype; fond.querySelectorAll('[data-sptype]').forEach((x) => x.classList.toggle('choisi', x === b)); }));
  }

  return { ouvrir, protegerFeuille, sparklines, creerTableau, styleTableau: styleTableauDlg, renommerTableau: renommerTableauDlg, redimensionnerTableau, formatCellule, collageSpecial, cellules, atteindre, lien, note, doublons, colonnes, ouvert: () => !fond.hidden };
}

