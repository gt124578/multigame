// Interface du Tableur : grille virtualisée, barre de formule, onglets, presse-papiers, macros.

import { Classeur } from './classeur.js';
import { formater, colVersLettres, lettresVersCol, parsePlage, parseAdresse, adresse, ErreurFormule, NOMS_FONCTIONS, ALIAS, referencesDe, decalerFormule, fonction } from './formules.js';
import { lireClasseur, ecrireClasseur } from './xlsxio.js';
import { executerMacro, analyserVBA, ErreurVBA } from './vba.js';

const XLSX = window.XLSX;
const $ = (id) => document.getElementById(id);

const LARGEUR_DEFAUT = 84, HAUTEUR_DEFAUT = 24, LARGEUR_ENTETE = 46;
const CLE_STOCKAGE = 'tableur.classeur';

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

let classeur = Classeur.nouveau();
let curseur = { r: 0, c: 0 };
let selection = { r1: 0, c1: 0, r2: 0, c2: 0 };
let nbLignes = 200, nbColonnes = 40;
let edition = null;          // { r, c, origine: 'cellule' | 'barre' }
let pressePapier = null;     // { fi, r1, c1, r2, c2, couper, texte }
let historique = [], futur = [];
let glisse = null;           // sélection à la souris
let refsColorees = [];
let panneauCourant = null;
let macroEnCours = false;

const conteneur = $('grille-conteneur'), cellulesDiv = $('cellules'), entetesCol = $('entetes-colonnes'), entetesLig = $('entetes-lignes');
const selDiv = $('selection'), cursDiv = $('curseur'), poignee = $('poignee'), editeur = $('editeur'), barre = $('saisie-formule'), zoneNom = $('zone-nom');

const feuille = () => classeur.feuilles[classeur.active];
// Texte de la barre de formule : les nombres bruts s'affichent avec la virgule décimale
function saisieAffichee(r, c) { const cel = feuille().get(r, c); const s = classeur.saisie(fi(), r, c); return cel && cel.f == null && typeof cel.v === 'number' && !(cel.z && /[dmyjhs]/i.test(cel.z)) ? s.replace('.', ',') : s; }
const fi = () => classeur.active;

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

let xCols = [0], yLigs = [0];
function geometrie() {
  const f = feuille();
  nbLignes = Math.max(nbLignes, f.zone.r2 + 60, 100);
  nbColonnes = Math.max(nbColonnes, f.zone.c2 + 15, 30);
  xCols = new Array(nbColonnes + 1); xCols[0] = 0;
  for (let c = 0; c < nbColonnes; c++) xCols[c + 1] = xCols[c] + largeurCol(c);
  yLigs = new Array(nbLignes + 1); yLigs[0] = 0;
  for (let r = 0; r < nbLignes; r++) yLigs[r + 1] = yLigs[r] + hauteurLig(r);
  $('grille-dimension').style.left = (LARGEUR_ENTETE + xCols[nbColonnes]) + 'px';
  $('grille-dimension').style.top = (HAUTEUR_DEFAUT + yLigs[nbLignes]) + 'px';
}
const largeurCol = (c) => { const l = feuille().largeurs[c]; return l === undefined ? LARGEUR_DEFAUT : l; };
const hauteurLig = (r) => { const h = feuille().hauteurs[r]; return h === undefined ? HAUTEUR_DEFAUT : h; };
function indexDepuis(tab, pos) { // dichotomie : indice i tel que tab[i] <= pos < tab[i+1]
  let lo = 0, hi = tab.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tab[m] <= pos) lo = m; else hi = m - 1; }
  return lo;
}
function celluleDepuisPoint(x, y) {
  const px = x - LARGEUR_ENTETE + conteneur.scrollLeft, py = y - HAUTEUR_DEFAUT + conteneur.scrollTop;
  return { r: Math.max(0, Math.min(nbLignes - 1, indexDepuis(yLigs, Math.max(0, py)))), c: Math.max(0, Math.min(nbColonnes - 1, indexDepuis(xCols, Math.max(0, px)))) };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function afficherValeur(v, z) {
  let s = formater(v, z);
  if (typeof v === 'number' && !(z && /[dmyjhs]/i.test(z.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')) && !/[0#]/.test(z))) {
    s = s.replace(/,/g, ' ').replace('.', ',');
  }
  return s;
}

let rendRequis = false;
function rendre() { if (rendRequis) return; rendRequis = true; requestAnimationFrame(() => { rendRequis = false; rendreMaintenant(); }); }

function rendreMaintenant() {
  geometrie();
  const f = feuille(), F = fi();
  const sl = conteneur.scrollLeft, st = conteneur.scrollTop, W = conteneur.clientWidth, H = conteneur.clientHeight;
  // Extension automatique vers le bas / la droite
  if (st + H > yLigs[nbLignes] - 200) { nbLignes += 100; geometrie(); }
  if (sl + W > xCols[nbColonnes] - 200) { nbColonnes += 20; geometrie(); }
  const c1 = indexDepuis(xCols, sl), c2 = Math.min(nbColonnes - 1, indexDepuis(xCols, sl + W) + 1);
  const r1 = indexDepuis(yLigs, st), r2 = Math.min(nbLignes - 1, indexDepuis(yLigs, st + H) + 1);
  // En-têtes
  entetesCol.style.left = LARGEUR_ENTETE + 'px'; entetesCol.style.width = W + 'px'; entetesCol.style.overflow = 'hidden';
  entetesLig.style.top = HAUTEUR_DEFAUT + 'px'; entetesLig.style.height = H + 'px'; entetesLig.style.overflow = 'hidden';
  let hc = '', hl = '';
  const selC1 = Math.min(selection.c1, selection.c2), selC2 = Math.max(selection.c1, selection.c2), selR1 = Math.min(selection.r1, selection.r2), selR2 = Math.max(selection.r1, selection.r2);
  for (let c = c1; c <= c2; c++) hc += `<div class="entete-col${c >= selC1 && c <= selC2 ? ' actif' : ''}" data-c="${c}" style="left:${xCols[c] - sl}px;width:${largeurCol(c)}px">${colVersLettres(c)}<div class="redim-col" data-c="${c}"></div></div>`;
  for (let r = r1; r <= r2; r++) hl += `<div class="entete-lig${r >= selR1 && r <= selR2 ? ' actif' : ''}" data-r="${r}" style="top:${yLigs[r] - st}px;height:${hauteurLig(r)}px">${r + 1}<div class="redim-lig" data-r="${r}"></div></div>`;
  entetesCol.innerHTML = hc; entetesLig.innerHTML = hl;
  // Cellules
  cellulesDiv.style.left = LARGEUR_ENTETE + 'px'; cellulesDiv.style.top = HAUTEUR_DEFAUT + 'px';
  let html = '';
  const fusionDe = (r, c) => f.fusions.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  for (let r = r1; r <= r2; r++) {
    for (let c = Math.max(0, c1 - 8); c <= c2; c++) {
      const cel = f.get(r, c);
      const fus = f.fusions.length ? fusionDe(r, c) : null;
      if (fus && (fus.r1 !== r || fus.c1 !== c)) continue;
      let w = largeurCol(c), h = hauteurLig(r);
      if (fus) { w = xCols[fus.c2 + 1] - xCols[fus.c1]; h = yLigs[fus.r2 + 1] - yLigs[fus.r1]; }
      if (!cel) { if (c >= c1) html += `<div class="cellule" style="left:${xCols[c]}px;top:${yLigs[r]}px;width:${w}px;height:${h}px"></div>`; continue; }
      const v = classeur.valeur(F, r, c);
      let txt = afficherValeur(v, cel.z);
      let cls = 'cellule';
      if (typeof v === 'number' && txt.length * 7 + 8 > (fus ? w : largeurCol(c))) txt = ajusterNombre(v, cel.z, (fus ? w : largeurCol(c)) - 8);
      const s = cel.s || {};
      if (v instanceof ErreurFormule) cls += ' erreur';
      else if (typeof v === 'number' && !(cel.z === '@')) cls += ' nombre';
      else if (typeof v === 'boolean') cls += ' booleen';
      if (s.align) cls += ' ' + { left: 'gauche', center: 'centre', right: 'droite' }[s.align];
      let style = `left:${xCols[c]}px;top:${yLigs[r]}px;height:${h}px;`;
      // Débordement du texte sur les cellules vides voisines
      if (typeof v === 'string' && !fus && txt.length * 7 > w - 8 && !s.align) {
        let cc = c + 1, ww = w;
        while (cc < nbColonnes && cc <= c2 + 1 && !f.get(r, cc) && ww < txt.length * 7.5 + 8) { ww += largeurCol(cc); cc++; }
        if (ww > w) { w = ww; cls += ' deborde'; style += 'background:#fff;'; }
      }
      style += `width:${w}px;`;
      if (s.gras) style += 'font-weight:700;'; if (s.italique) style += 'font-style:italic;'; if (s.souligne) style += 'text-decoration:underline;';
      if (s.couleur) style += `color:${s.couleur};`; if (s.fond) style += `background:${s.fond};`; if (s.taille) style += `font-size:${s.taille}px;`;
      if (s.bordure) style += 'box-shadow: inset 0 0 0 1px #374151;';
      html += `<div class="${cls}" style="${style}">${echapper(txt)}</div>`;
    }
  }
  cellulesDiv.innerHTML = html;
  positionnerSelection();
  rendreOnglets();
  rendreStatut();
}

// Un nombre trop large pour sa cellule : moins de chiffres significatifs, sinon « ##### » comme Excel.
function ajusterNombre(v, z, largeur) {
  const max = Math.max(1, Math.floor(largeur / 7));
  if (!z || z === 'General') {
    for (let k = 14; k >= 1; k--) { const t = afficherValeur(parseFloat(v.toPrecision(k)), null); if (t.length <= max) return t; }
    const e = v.toExponential(Math.max(0, max - 6)).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-');
    if (e.length <= max) return e;
  }
  return '#'.repeat(max);
}

function echapper(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function rectPlage(r1, c1, r2, c2) {
  const R1 = Math.min(r1, r2), R2 = Math.max(r1, r2), C1 = Math.min(c1, c2), C2 = Math.max(c1, c2);
  return { left: LARGEUR_ENTETE + xCols[C1], top: HAUTEUR_DEFAUT + yLigs[R1], width: xCols[Math.min(C2 + 1, nbColonnes)] - xCols[C1], height: yLigs[Math.min(R2 + 1, nbLignes)] - yLigs[R1] };
}
function poser(el, rect) { el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px'; el.style.width = rect.width + 'px'; el.style.height = rect.height + 'px'; }

function positionnerSelection() {
  const multi = selection.r1 !== selection.r2 || selection.c1 !== selection.c2;
  selDiv.style.display = multi ? 'block' : 'none';
  if (multi) poser(selDiv, rectPlage(selection.r1, selection.c1, selection.r2, selection.c2));
  const rc = rectPlage(curseur.r, curseur.c, curseur.r, curseur.c);
  const fus = feuille().fusions.find((m) => curseur.r >= m.r1 && curseur.r <= m.r2 && curseur.c >= m.c1 && curseur.c <= m.c2);
  if (fus) poser(cursDiv, rectPlage(fus.r1, fus.c1, fus.r2, fus.c2)); else poser(cursDiv, rc);
  const bas = multi ? rectPlage(selection.r1, selection.c1, selection.r2, selection.c2) : rc;
  poignee.style.left = (bas.left + bas.width - 4) + 'px'; poignee.style.top = (bas.top + bas.height - 4) + 'px';
  if (pressePapier && pressePapier.fi === fi() && !pressePapier.colle) { $('plage-copie').hidden = false; poser($('plage-copie'), rectPlage(pressePapier.r1, pressePapier.c1, pressePapier.r2, pressePapier.c2)); }
  else $('plage-copie').hidden = true;
  if (!edition) { zoneNom.value = multi ? adresse(Math.min(selection.r1, selection.r2), Math.min(selection.c1, selection.c2)) + ':' + adresse(Math.max(selection.r1, selection.r2), Math.max(selection.c1, selection.c2)) : adresse(curseur.r, curseur.c); barre.value = saisieAffichee(curseur.r, curseur.c); }
  for (const el of refsColorees) el.remove(); refsColorees = [];
  if (edition) colorerReferences();
  // Boutons de style
  const cel = feuille().get(curseur.r, curseur.c), s = (cel && cel.s) || {};
  $('btn-gras').classList.toggle('actif', !!s.gras); $('btn-italique').classList.toggle('actif', !!s.italique); $('btn-souligne').classList.toggle('actif', !!s.souligne);
  $('format-nombre').value = cel && cel.z && [...$('format-nombre').options].some((o) => o.value === cel.z) ? cel.z : (cel && cel.z ? '' : '');
}

const COULEURS_REF = ['#2563eb', '#dc2626', '#7c3aed', '#059669', '#d97706', '#db2777'];
function colorerReferences() {
  const txt = edition ? (edition.origine === 'barre' ? barre.value : editeur.value) : '';
  if (!txt.startsWith('=')) return;
  referencesDe(txt).forEach((ref, i) => {
    if (ref.feuille && classeur.indexFeuille(ref.feuille) !== fi()) return;
    const p = plageDepuisTexte(ref.ref);
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'ref-couleur';
    el.style.borderColor = COULEURS_REF[i % COULEURS_REF.length];
    poser(el, rectPlage(p.r1, p.c1, Math.min(p.r2, nbLignes - 1), Math.min(p.c2, nbColonnes - 1)));
    conteneur.appendChild(el);
    refsColorees.push(el);
  });
}
function plageDepuisTexte(s) {
  s = s.replace(/\$/g, '');
  let m;
  if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(s))) return { r1: 0, c1: lettresVersCol(m[1]), r2: 1048575, c2: lettresVersCol(m[2]) };
  if ((m = /^(\d+):(\d+)$/.exec(s))) return { r1: +m[1] - 1, c1: 0, r2: +m[2] - 1, c2: 16383 };
  return parsePlage(s);
}

function rendreOnglets() {
  const liste = $('liste-onglets');
  liste.innerHTML = '';
  classeur.feuilles.forEach((f, i) => {
    if (f.cachee) return;
    const o = document.createElement('div');
    o.className = 'onglet' + (i === fi() ? ' actif' : '');
    o.textContent = f.nom;
    o.dataset.i = i;
    o.addEventListener('click', () => activerFeuille(i));
    o.addEventListener('dblclick', () => renommerFeuille(i));
    o.addEventListener('contextmenu', (e) => { e.preventDefault(); menuOnglet(e, i); });
    liste.appendChild(o);
  });
}

function rendreStatut() {
  const R1 = Math.min(selection.r1, selection.r2), R2 = Math.min(Math.max(selection.r1, selection.r2), feuille().zone.r2);
  const C1 = Math.min(selection.c1, selection.c2), C2 = Math.min(Math.max(selection.c1, selection.c2), feuille().zone.c2);
  let somme = 0, nb = 0, nbNum = 0;
  if (R1 !== Math.max(selection.r1, selection.r2) || C1 !== Math.max(selection.c1, selection.c2)) {
    for (let r = R1; r <= R2; r++) for (let c = C1; c <= C2; c++) { const cel = feuille().get(r, c); if (!cel) continue; const v = classeur.valeur(fi(), r, c); if (v == null || v === '') continue; nb++; if (typeof v === 'number') { somme += v; nbNum++; } }
  }
  const fmt = (x) => afficherValeur(Math.round(x * 1e10) / 1e10);
  $('statut').textContent = nbNum ? `Somme : ${fmt(somme)}   Moyenne : ${fmt(somme / nbNum)}   Nb : ${nb}` : (nb ? `Nb : ${nb}` : (classeur.nomFichier || ''));
}

// ---------------------------------------------------------------------------
// Sélection et navigation
// ---------------------------------------------------------------------------

function placerCurseur(r, c, etendre = false) {
  r = Math.max(0, r); c = Math.max(0, c);
  if (r >= nbLignes - 2) { nbLignes = r + 60; }
  if (c >= nbColonnes - 2) { nbColonnes = c + 15; }
  if (etendre) { selection.r2 = r; selection.c2 = c; }
  else { curseur = { r, c }; selection = { r1: r, c1: c, r2: r, c2: c }; }
  geometrie();
  defiler(etendre ? { r, c } : curseur);
  rendre();
}
function defiler({ r, c }) {
  const x = xCols[c], y = yLigs[r], W = conteneur.clientWidth - LARGEUR_ENTETE, H = conteneur.clientHeight - HAUTEUR_DEFAUT;
  if (x < conteneur.scrollLeft) conteneur.scrollLeft = x;
  else if (x + largeurCol(c) > conteneur.scrollLeft + W) conteneur.scrollLeft = x + largeurCol(c) - W;
  if (y < conteneur.scrollTop) conteneur.scrollTop = y;
  else if (y + hauteurLig(r) > conteneur.scrollTop + H) conteneur.scrollTop = y + hauteurLig(r) - H;
}
function selectionNormalisee() {
  return { r1: Math.min(selection.r1, selection.r2), c1: Math.min(selection.c1, selection.c2), r2: Math.max(selection.r1, selection.r2), c2: Math.max(selection.c1, selection.c2) };
}
function selectionBornee() {
  const s = selectionNormalisee(), z = feuille().zone;
  return { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(z.r2, s.r1)), c2: Math.min(s.c2, Math.max(z.c2, s.c1)) };
}
function sautCtrl(dr, dc) {
  const f = feuille();
  const vide = (r, c) => { const cel = f.get(r, c); return !cel || (cel.v == null && cel.f == null); };
  let { r, c } = curseur;
  const lim = () => (dr < 0 ? r > 0 : dr > 0 ? r < f.zone.r2 : dc < 0 ? c > 0 : c < f.zone.c2);
  if (!lim()) return { r: dr < 0 ? 0 : dr > 0 ? Math.max(f.zone.r2, 0) : r, c: dc < 0 ? 0 : dc > 0 ? Math.max(f.zone.c2, 0) : c };
  if (!vide(r, c) && !vide(r + dr, c + dc)) { while (lim() && !vide(r + dr, c + dc)) { r += dr; c += dc; } }
  else { r += dr; c += dc; while (lim() && vide(r, c)) { r += dr; c += dc; } }
  return { r: Math.max(0, r), c: Math.max(0, c) };
}

// ---------------------------------------------------------------------------
// Historique (annuler / rétablir)
// ---------------------------------------------------------------------------

function instantane() {
  const f = feuille();
  const cells = new Map();
  for (const [k, cel] of f.cellules) cells.set(k, { ...cel, s: cel.s ? { ...cel.s } : undefined });
  return { fi: fi(), nom: f.nom, cells, largeurs: { ...f.largeurs }, hauteurs: { ...f.hauteurs }, fusions: f.fusions.map((m) => ({ ...m })), noms: new Map([...classeur.noms].map(([k, v]) => [k, { ...v }])) };
}
function memoriser() { historique.push(instantane()); if (historique.length > 100) historique.shift(); futur = []; }
function restaurer(s) {
  const f = classeur.feuilles[s.fi]; if (!f) return;
  f.cellules = s.cells; f.largeurs = s.largeurs; f.hauteurs = s.hauteurs; f.fusions = s.fusions; f.recalculerZone();
  classeur.noms = s.noms; classeur.active = s.fi; classeur.modifie();
}
function annuler() { if (!historique.length) return; futur.push(instantane()); restaurer(historique.pop()); rendre(); sauvegarderLocal(); }
function retablir() { if (!futur.length) return; historique.push(instantane()); restaurer(futur.pop()); rendre(); sauvegarderLocal(); }

// ---------------------------------------------------------------------------
// Édition
// ---------------------------------------------------------------------------

function commencerEdition(initial, origine = 'cellule') {
  if (edition) return;
  const { r, c } = curseur;
  edition = { r, c, origine };
  const texte = initial !== undefined ? initial : saisieAffichee(r, c);
  if (origine === 'cellule') {
    const rect = rectPlage(r, c, r, c);
    poser(editeur, { ...rect, width: Math.max(rect.width, 120) });
    editeur.hidden = false;
    editeur.value = texte;
    ajusterEditeur();
    editeur.focus();
    editeur.setSelectionRange(editeur.value.length, editeur.value.length);
    barre.value = texte;
  }
  positionnerSelection();
}
function ajusterEditeur() {
  const rect = rectPlage(edition.r, edition.c, edition.r, edition.c);
  const largeurTexte = editeur.value.length * 7.5 + 16;
  editeur.style.width = Math.max(rect.width, Math.min(largeurTexte, conteneur.clientWidth - rect.left - 10)) + 'px';
  editeur.style.height = Math.max(rect.height, editeur.scrollHeight) + 'px';
}
function validerEdition(mouvement) {
  if (!edition) return;
  const { r, c, origine } = edition;
  const texte = origine === 'barre' ? barre.value : editeur.value;
  edition = null;
  editeur.hidden = true;
  const ancien = saisieAffichee(r, c);
  if (texte !== ancien) {
    memoriser();
    try { classeur.saisir(fi(), r, c, texte); } catch (e) { toast(e.message, true); }
    sauvegarderLocal();
  }
  conteneur.focus();
  if (mouvement) placerCurseur(r + (mouvement.dr || 0), c + (mouvement.dc || 0)); else rendre();
}
function annulerEdition() {
  if (!edition) return;
  edition = null; editeur.hidden = true; conteneur.focus(); rendre();
}
function insererReference(r1, c1, r2, c2) {
  // Pendant la saisie d'une formule, un clic insère ou remplace la référence au niveau du curseur.
  const cible = edition.origine === 'barre' ? barre : editeur;
  const txt = cible.value;
  if (!txt.startsWith('=')) return false;
  let debut = cible.selectionStart, fin = cible.selectionEnd;
  if (edition.refEnCours) { debut = edition.refEnCours.debut; fin = edition.refEnCours.fin; }
  const avant = txt.slice(0, debut);
  if (!edition.refEnCours && !/[=(+\-*/^&,;<>:]\s*$/.test(avant)) return false;
  const ref = r1 === r2 && c1 === c2 ? adresse(r1, c1) : adresse(Math.min(r1, r2), Math.min(c1, c2)) + ':' + adresse(Math.max(r1, r2), Math.max(c1, c2));
  cible.value = avant + ref + txt.slice(fin);
  edition.refEnCours = { debut, fin: debut + ref.length };
  cible.setSelectionRange(debut + ref.length, debut + ref.length);
  if (cible === editeur) { barre.value = cible.value; ajusterEditeur(); } else editeur.value = cible.value;
  positionnerSelection();
  return true;
}

// ---------------------------------------------------------------------------
// Presse-papiers
// ---------------------------------------------------------------------------

function texteSelection(valeursAffichees = true) {
  const s = selectionBornee();
  const lignes = [];
  for (let r = s.r1; r <= s.r2; r++) { const l = []; for (let c = s.c1; c <= s.c2; c++) l.push(valeursAffichees ? afficherValeur(classeur.valeur(fi(), r, c), (feuille().get(r, c) || {}).z) : classeur.saisie(fi(), r, c)); lignes.push(l.join('\t')); }
  return lignes.join('\n');
}
async function copier(couper = false) {
  const s = selectionBornee();
  const texte = texteSelection();
  pressePapier = { fi: fi(), ...s, couper, texte };
  try { await navigator.clipboard.writeText(texte); } catch { /* presse-papiers système indisponible */ }
  rendre();
}
async function coller(texteSysteme) {
  let texte = texteSysteme;
  if (texte === undefined) { try { texte = await navigator.clipboard.readText(); } catch { texte = null; } }
  const dest = selectionNormalisee();
  memoriser();
  if (pressePapier && (texte == null || texte === pressePapier.texte || texte.replace(/\r/g, '') === pressePapier.texte)) {
    const src = pressePapier;
    const nl = src.r2 - src.r1 + 1, nc = src.c2 - src.c1 + 1;
    const repL = dest.r2 - dest.r1 + 1 >= nl && (dest.r2 - dest.r1 + 1) % nl === 0 ? (dest.r2 - dest.r1 + 1) / nl : 1;
    const repC = dest.c2 - dest.c1 + 1 >= nc && (dest.c2 - dest.c1 + 1) % nc === 0 ? (dest.c2 - dest.c1 + 1) / nc : 1;
    const srcF = classeur.feuilles[src.fi];
    const bloc = [];
    for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) { const cel = srcF.get(r, c); bloc.push({ dr: r - src.r1, dc: c - src.c1, cel: cel ? { ...cel, s: cel.s ? { ...cel.s } : undefined } : null }); }
    if (src.couper) { classeur.effacer(src.fi, src.r1, src.c1, src.r2, src.c2, true); pressePapier = null; }
    for (let i = 0; i < repL; i++) for (let j = 0; j < repC; j++) for (const b of bloc) {
      const r = dest.r1 + i * nl + b.dr, c = dest.c1 + j * nc + b.dc;
      const dr = r - (src.r1 + b.dr), dc = c - (src.c1 + b.dc);
      const cel = b.cel ? { ...b.cel, f: src.couper ? b.cel.f : decalerFormule(b.cel.f, dr, dc) } : null;
      feuille().set(r, c, cel);
    }
    feuille().recalculerZone(); classeur.modifie();
    selection = { r1: dest.r1, c1: dest.c1, r2: dest.r1 + nl * repL - 1, c2: dest.c1 + nc * repC - 1 };
    if (pressePapier) pressePapier.colle = true;
  } else if (texte != null && texte !== '') {
    const lignes = texte.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    lignes.forEach((l, i) => l.split('\t').forEach((v, j) => classeur.saisir(fi(), dest.r1 + i, dest.c1 + j, v)));
    selection = { r1: dest.r1, c1: dest.c1, r2: dest.r1 + lignes.length - 1, c2: dest.c1 + Math.max(...lignes.map((l) => l.split('\t').length)) - 1 };
  }
  curseur = { r: dest.r1, c: dest.c1 };
  sauvegarderLocal();
  rendre();
}
function recopier(sens) { // Ctrl+D / Ctrl+R : recopie la première ligne/colonne de la sélection
  const s = selectionNormalisee();
  memoriser();
  if (sens === 'bas') for (let c = s.c1; c <= s.c2; c++) for (let r = s.r1 + 1; r <= s.r2; r++) { const cel = feuille().get(s.r1, c); feuille().set(r, c, cel ? { ...cel, f: decalerFormule(cel.f, r - s.r1, 0) } : null); }
  else for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1 + 1; c <= s.c2; c++) { const cel = feuille().get(r, s.c1); feuille().set(r, c, cel ? { ...cel, f: decalerFormule(cel.f, 0, c - s.c1) } : null); }
  feuille().recalculerZone(); classeur.modifie(); sauvegarderLocal(); rendre();
}
function recopierVers(cible) { // poignée : étend la sélection vers cible (série pour les nombres, formules décalées)
  const s = selectionNormalisee();
  const f = feuille();
  memoriser();
  const nl = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
  if (cible.r > s.r2 || cible.r < s.r1) {
    const bas = cible.r > s.r2;
    for (let c = s.c1; c <= s.c2; c++) {
      const src = []; for (let r = s.r1; r <= s.r2; r++) src.push(f.get(r, c));
      const nums = src.map((x) => x && x.f == null && typeof x.v === 'number' ? x.v : null);
      const serie = nl >= 2 && nums.every((x) => x !== null) ? nums[1] - nums[0] : (nl === 1 && nums[0] !== null ? 0 : null);
      const debut = bas ? s.r2 + 1 : cible.r, fin = bas ? cible.r : s.r1 - 1;
      for (let r = debut; r <= fin; r++) {
        const k = bas ? r - s.r1 : r - s.r1; const i = ((k % nl) + nl) % nl; const cel = src[i];
        if (!cel) { f.set(r, c, null); continue; }
        if (serie !== null && cel.f == null) f.set(r, c, { ...cel, v: nums[i] + serie * Math.floor(k / nl) * nl / (nl === 1 ? 1 : nl) * (nl === 1 ? 1 : 1) });
        else f.set(r, c, { ...cel, f: decalerFormule(cel.f, r - (s.r1 + i), 0) });
      }
    }
    selection = { r1: Math.min(s.r1, cible.r), c1: s.c1, r2: Math.max(s.r2, cible.r), c2: s.c2 };
  } else if (cible.c > s.c2 || cible.c < s.c1) {
    const droite = cible.c > s.c2;
    for (let r = s.r1; r <= s.r2; r++) {
      const src = []; for (let c = s.c1; c <= s.c2; c++) src.push(f.get(r, c));
      const nums = src.map((x) => x && x.f == null && typeof x.v === 'number' ? x.v : null);
      const serie = nc >= 2 && nums.every((x) => x !== null) ? nums[1] - nums[0] : (nc === 1 && nums[0] !== null ? 0 : null);
      const debut = droite ? s.c2 + 1 : cible.c, fin = droite ? cible.c : s.c1 - 1;
      for (let c = debut; c <= fin; c++) {
        const k = c - s.c1; const i = ((k % nc) + nc) % nc; const cel = src[i];
        if (!cel) { f.set(r, c, null); continue; }
        if (serie !== null && cel.f == null) f.set(r, c, { ...cel, v: nums[i] + serie * Math.floor(k / nc) * nc / (nc === 1 ? 1 : nc) });
        else f.set(r, c, { ...cel, f: decalerFormule(cel.f, 0, c - (s.c1 + i)) });
      }
    }
    selection = { r1: s.r1, c1: Math.min(s.c1, cible.c), r2: s.r2, c2: Math.max(s.c2, cible.c) };
  }
  f.recalculerZone(); classeur.modifie(); sauvegarderLocal(); rendre();
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

function surSelection(cb) { const s = selectionBornee(); memoriser(); for (let r = s.r1; r <= Math.max(s.r2, s.r1); r++) for (let c = s.c1; c <= Math.max(s.c2, s.c1); c++) cb(r, c); sauvegarderLocal(); rendre(); }
function basculerStyle(prop) { const cel = feuille().get(curseur.r, curseur.c); const val = !(cel && cel.s && cel.s[prop]); surSelection((r, c) => classeur.style(fi(), r, c, { [prop]: val })); }
function changerDecimales(delta) {
  surSelection((r, c) => {
    const cel = feuille().get(r, c); if (!cel) return;
    let z = cel.z || (typeof classeur.valeur(fi(), r, c) === 'number' ? '0' : null); if (!z || /[dmyh]/i.test(z) || z === '@') return;
    const m = /0(\.(0+))?/.exec(z); if (!m) return;
    const n = Math.max(0, (m[2] ? m[2].length : 0) + delta);
    z = z.replace(/0(\.0+)?/, n ? '0.' + '0'.repeat(n) : '0');
    classeur.format(fi(), r, c, z);
  });
}

// ---------------------------------------------------------------------------
// Feuilles
// ---------------------------------------------------------------------------

function activerFeuille(i) {
  if (edition) validerEdition();
  classeur.active = i;
  const f = feuille();
  curseur = f.curseur || { r: 0, c: 0 }; selection = f.selection || { r1: 0, c1: 0, r2: 0, c2: 0 };
  nbLignes = 200; nbColonnes = 40;
  historique = []; futur = [];
  geometrie();
  conteneur.scrollTop = f.scrollTop || 0; conteneur.scrollLeft = f.scrollLeft || 0;
  rendre();
}
function memoriserVue() { const f = feuille(); if (!f) return; f.curseur = curseur; f.selection = selection; f.scrollTop = conteneur.scrollTop; f.scrollLeft = conteneur.scrollLeft; }
function renommerFeuille(i) {
  const nom = prompt('Nom de la feuille :', classeur.feuilles[i].nom);
  if (nom == null) return;
  try { classeur.renommerFeuille(i, nom); sauvegarderLocal(); rendre(); } catch (e) { toast(e.message, true); }
}
function menuOnglet(e, i) {
  const items = [
    ['Renommer…', () => renommerFeuille(i)],
    ['Insérer une feuille', () => { classeur.ajouterFeuille(null, i + 1); activerFeuille(i + 1); sauvegarderLocal(); }],
    ['Dupliquer', () => { const src = classeur.feuilles[i]; const f = classeur.ajouterFeuille(classeur.nomLibre(src.nom + ' ('), i + 1); src.chaque((r, c, cel) => f.set(r, c, { ...cel })); f.largeurs = { ...src.largeurs }; activerFeuille(i + 1); sauvegarderLocal(); }],
    ['Masquer', () => { if (classeur.feuilles.filter((f) => !f.cachee).length <= 1) return toast('Il faut garder une feuille visible', true); classeur.feuilles[i].cachee = true; if (fi() === i) activerFeuille(classeur.feuilles.findIndex((f) => !f.cachee)); sauvegarderLocal(); rendre(); }],
    ['Déplacer à gauche', () => { if (i > 0) { memoriserVue(); classeur.deplacerFeuille(i, i - 1); activerFeuille(i - 1); sauvegarderLocal(); } }],
    ['Déplacer à droite', () => { if (i < classeur.feuilles.length - 1) { memoriserVue(); classeur.deplacerFeuille(i, i + 1); activerFeuille(i + 1); sauvegarderLocal(); } }],
    null,
    ['Supprimer', () => { if (!confirm('Supprimer la feuille « ' + classeur.feuilles[i].nom + ' » ?')) return; try { classeur.supprimerFeuille(i); activerFeuille(Math.min(i, classeur.feuilles.length - 1)); sauvegarderLocal(); } catch (err) { toast(err.message, true); } }],
  ];
  const cachees = classeur.feuilles.map((f, k) => [f, k]).filter(([f]) => f.cachee);
  if (cachees.length) { items.push(null); for (const [f, k] of cachees) items.push(['Afficher « ' + f.nom + ' »', () => { f.cachee = false; activerFeuille(k); sauvegarderLocal(); }]); }
  ouvrirMenu(e.clientX, e.clientY, items);
}

// ---------------------------------------------------------------------------
// Menu contextuel et notifications
// ---------------------------------------------------------------------------

function ouvrirMenu(x, y, items) {
  const menu = $('menu-contextuel');
  menu.innerHTML = '';
  for (const it of items) {
    if (!it) { menu.appendChild(document.createElement('hr')); continue; }
    const d = document.createElement('div'); d.textContent = it[0];
    d.addEventListener('click', () => { fermerMenu(); it[1](); });
    menu.appendChild(d);
  }
  menu.hidden = false;
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px'; menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
function fermerMenu() { $('menu-contextuel').hidden = true; }
document.addEventListener('mousedown', (e) => { if (!$('menu-contextuel').contains(e.target)) fermerMenu(); });

let toastTimer;
function toast(msg, erreur = false) {
  const t = $('toast'); t.textContent = msg; t.className = erreur ? 'erreur' : ''; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, erreur ? 6000 : 2500);
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

async function ouvrirFichier(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const nouveau = lireClasseur(XLSX, buf, file.name);
    chargerClasseur(nouveau);
    toast('« ' + file.name + ' » ouvert : ' + nouveau.feuilles.length + ' feuille' + (nouveau.feuilles.length > 1 ? 's' : '') + (nouveau.macros ? ', macros lues' : ''));
    if (nouveau.vbaBrut) $('format-export').value = 'xlsm';
  } catch (e) { console.error(e); toast('Impossible de lire ce fichier : ' + e.message, true); }
}
function chargerClasseur(nouveau) {
  if (edition) annulerEdition();
  classeur = nouveau;
  historique = []; futur = []; pressePapier = null;
  $('code-vba').value = classeur.macros || '';
  rafraichirProcedures();
  activerFeuille(Math.min(classeur.active, classeur.feuilles.length - 1));
  document.title = (classeur.nomFichier || 'Classeur') + ' — Tableur';
  sauvegarderLocal();
}
function enregistrer() {
  if (edition) validerEdition();
  let type = $('format-export').value;
  classeur.macros = $('code-vba').value;
  if (type === 'xlsx' && (classeur.macros.trim() || classeur.vbaBrut)) { type = 'xlsm'; $('format-export').value = 'xlsm'; }
  try {
    const octets = ecrireClasseur(XLSX, classeur, { bookType: type });
    const nom = (classeur.nomFichier || 'Classeur1').replace(/\.(xlsx|xlsm|xls|csv|ods)$/i, '') + '.' + type;
    const blob = new Blob([octets], { type: type === 'csv' ? 'text/csv' : 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    classeur.nomFichier = nom;
    toast('Téléchargé : ' + nom + (type === 'xlsm' && classeur.macros.trim() ? ' (le code VBA modifié ici est gardé dans la feuille masquée _MacrosTableur ; Excel ne l\'exécute pas comme un vrai projet VBA)' : ''));
  } catch (e) { console.error(e); toast('Enregistrement impossible : ' + e.message, true); }
}
function nouveauClasseur() {
  if (feuille().cellules.size && !confirm('Créer un nouveau classeur ? Le classeur courant sera perdu s\'il n\'est pas enregistré.')) return;
  chargerClasseur(Classeur.nouveau());
}

// Sauvegarde locale (navigateur) pour survivre à un rechargement
let timerLocal;
function sauvegarderLocal() {
  clearTimeout(timerLocal);
  timerLocal = setTimeout(() => {
    try {
      const data = { nomFichier: classeur.nomFichier, active: classeur.active, macros: $('code-vba').value, noms: [...classeur.noms.values()],
        feuilles: classeur.feuilles.map((f) => ({ nom: f.nom, cachee: f.cachee, largeurs: f.largeurs, hauteurs: f.hauteurs, fusions: f.fusions, cellules: [...f.cellules].map(([k, c]) => [k, { ...c, v: c.v instanceof ErreurFormule ? { erreur: c.v.code } : c.v }]) })) };
      const json = JSON.stringify(data);
      if (json.length < 4_000_000) localStorage.setItem(CLE_STOCKAGE, json); else localStorage.removeItem(CLE_STOCKAGE);
    } catch { /* stockage indisponible */ }
  }, 400);
}
function restaurerLocal() {
  try {
    const json = localStorage.getItem(CLE_STOCKAGE);
    if (!json) return false;
    const data = JSON.parse(json);
    const c = new Classeur();
    c.nomFichier = data.nomFichier || 'Classeur1.xlsx';
    for (const fd of data.feuilles) {
      const f = c.ajouterFeuille(fd.nom); f.cachee = !!fd.cachee; f.largeurs = fd.largeurs || {}; f.hauteurs = fd.hauteurs || {}; f.fusions = fd.fusions || [];
      for (const [k, cel] of fd.cellules) { if (cel.v && typeof cel.v === 'object' && cel.v.erreur) cel.v = new ErreurFormule(cel.v.erreur); f.cellules.set(k, cel); }
      f.recalculerZone();
    }
    for (const n of data.noms || []) c.noms.set(n.nom.toUpperCase(), n);
    c.macros = data.macros || ''; c.active = data.active || 0;
    if (!c.feuilles.length) return false;
    c.modifie();
    classeur = c;
    $('code-vba').value = c.macros;
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Panneau latéral : macros, fonctions, noms, aide
// ---------------------------------------------------------------------------

function ouvrirPanneau(nom) {
  const p = $('panneau');
  if (panneauCourant === nom && !p.hidden) { p.hidden = true; panneauCourant = null; return; }
  panneauCourant = nom;
  p.hidden = false;
  for (const el of document.querySelectorAll('.panneau-contenu')) el.hidden = true;
  $('panneau-' + nom).hidden = false;
  $('panneau-titre').textContent = { macros: 'Macros VBA', fonctions: 'Fonctions', noms: 'Noms définis', aide: 'Aide' }[nom];
  if (nom === 'fonctions') rendreFonctions();
  if (nom === 'noms') rendreNoms();
  if (nom === 'aide') rendreAide();
  if (nom === 'macros') { rafraichirProcedures(); $('code-vba').focus(); }
  rendre();
}
function rafraichirProcedures() {
  const sel = $('liste-procedures');
  const courant = sel.value;
  sel.innerHTML = '';
  try {
    const prog = analyserVBA($('code-vba').value);
    for (const p of prog.procedures.values()) { const o = document.createElement('option'); o.value = p.nom; o.textContent = (p.fonction ? 'Function ' : 'Sub ') + p.nom + (p.params.length ? ' (' + p.params.length + ' arg.)' : ''); if (p.fonction || p.params.length) o.disabled = true; sel.appendChild(o); }
    if ([...sel.options].some((o) => o.value === courant)) sel.value = courant;
    else { const premier = [...sel.options].find((o) => !o.disabled); if (premier) sel.value = premier.value; }
  } catch { /* code incomplet pendant la frappe */ }
}
function journalVBA(texte, classe) { const s = $('sortie-vba'); const d = document.createElement('div'); if (classe) d.className = classe; d.textContent = texte; s.appendChild(d); s.scrollTop = s.scrollHeight; }
function executerMacroUI() {
  if (macroEnCours) return;
  if (edition) validerEdition();
  const code = $('code-vba').value; classeur.macros = code;
  const nom = $('liste-procedures').value;
  $('sortie-vba').innerHTML = '';
  if (!nom) { journalVBA('Aucune procédure Sub (sans paramètre) à exécuter.', 'err'); return; }
  memoriser();
  macroEnCours = true;
  const debut = performance.now();
  journalVBA('▶ ' + nom);
  const hote = {
    log: (t) => journalVBA(t),
    msgBox: (t, boutons, titre) => { const b = boutons & 15; if (b === 4 || b === 3 || b === 1) return confirm((titre ? titre + '\n\n' : '') + t) ? (b === 1 ? 1 : 6) : (b === 1 ? 2 : 7); alert((titre ? titre + '\n\n' : '') + t); return 1; },
    inputBox: (t, titre, defaut) => prompt(t, defaut),
    enregistrer: () => toast('ThisWorkbook.Save : utilisez le bouton Enregistrer pour télécharger le fichier'),
  };
  let res;
  try { res = executerMacro(classeur, code, nom, hote); }
  catch (e) { journalVBA('Erreur interne : ' + e.message, 'err'); console.error(e); macroEnCours = false; rendre(); return; }
  macroEnCours = false;
  if (res.erreur) journalVBA('✖ Erreur ' + res.erreur.numero + (res.erreur.ligne ? ' (ligne ' + res.erreur.ligne + ')' : '') + ' : ' + res.erreur.description, 'err');
  else journalVBA('✔ Terminé en ' + Math.round(performance.now() - debut) + ' ms');
  if (res.erreur && res.erreur.ligne) surlignerLigne(res.erreur.ligne);
  classeur.active = Math.min(classeur.active, classeur.feuilles.length - 1);
  geometrie(); sauvegarderLocal(); rendre();
}
function surlignerLigne(n) {
  const ta = $('code-vba'); const lignes = ta.value.split('\n'); let pos = 0;
  for (let i = 0; i < n - 1 && i < lignes.length; i++) pos += lignes[i].length + 1;
  ta.focus(); ta.setSelectionRange(pos, pos + (lignes[n - 1] || '').length);
}
function verifierVBA() {
  $('sortie-vba').innerHTML = '';
  try { const prog = analyserVBA($('code-vba').value); journalVBA('✔ Syntaxe correcte : ' + prog.procedures.size + ' procédure(s) — ' + [...prog.procedures.values()].map((p) => p.nom).join(', ')); }
  catch (e) { journalVBA('✖ ' + e.message, 'err'); if (e.ligne) surlignerLigne(e.ligne); }
}

const EXEMPLE_VBA = `Option Explicit

' Exemple : table de mortalité simplifiée et provision
Sub TableProvision()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    ws.Cells.Clear
    ws.Range("A1:E1").Value = Array("Âge", "qx", "lx", "v^t", "Flux actualisé")
    ws.Range("A1:E1").Font.Bold = True
    ws.Range("G1").Value = "Taux technique": ws.Range("H1").Value = 0.02
    ws.Range("G2").Value = "Capital": ws.Range("H2").Value = 10000
    Dim i As Long, age As Long, lx As Double
    lx = 100000
    For i = 1 To 40
        age = 60 + i - 1
        ws.Cells(i + 1, 1).Value = age
        ws.Cells(i + 1, 2).Value = Round(0.0005 * Exp(0.09 * (age - 30)), 5)   ' Gompertz
        ws.Cells(i + 1, 3).Value = Round(lx, 2)
        ws.Cells(i + 1, 4).Formula = "=(1+$H$1)^-" & (i - 1)
        ws.Cells(i + 1, 5).Formula = "=C" & (i + 1) & "*B" & (i + 1) & "*D" & (i + 1) & "*$H$2/$C$2"
        lx = lx * (1 - ws.Cells(i + 1, 2).Value)
    Next i
    ws.Range("G4").Value = "Prime unique pure"
    ws.Range("H4").Formula = "=SUM(E2:E41)"
    ws.Range("H4").NumberFormat = "#,##0.00"
    ws.Range("B2:B41").NumberFormat = "0.00000"
    ws.Range("D2:E41").NumberFormat = "0.0000"
    ws.Columns(1).ColumnWidth = 8
    MsgBox "Prime unique pure : " & Format(ws.Range("H4").Value, "#,##0.00")
End Sub

Function Annuite(taux As Double, n As Long) As Double
    If taux = 0 Then
        Annuite = n
    Else
        Annuite = (1 - (1 + taux) ^ -n) / taux
    End If
End Function

Sub TestAnnuite()
    Debug.Print "Annuité 20 ans à 3 % : " & Format(Annuite(0.03, 20), "0.0000")
    Debug.Print "VPM : " & WorksheetFunction.Pmt(0.03 / 12, 240, -200000)
End Sub
`;

function rendreFonctions() {
  const filtre = $('filtre-fonctions').value.trim().toUpperCase();
  const inverse = {}; for (const [fr, en] of Object.entries(ALIAS)) (inverse[en] = inverse[en] || []).push(fr);
  const liste = $('liste-fonctions'); liste.innerHTML = '';
  for (const nom of NOMS_FONCTIONS) {
    const fr = inverse[nom] || [];
    if (filtre && !nom.includes(filtre) && !fr.some((x) => x.includes(filtre))) continue;
    const d = document.createElement('div'); d.className = 'fonction';
    d.innerHTML = `<b>${fr[0] || nom}</b> <small>${nom}${fr.length > 1 ? ' · ' + fr.slice(1).join(', ') : ''}</small>`;
    d.addEventListener('click', () => { const texte = '=' + (fr[0] || nom) + '('; if (!edition) commencerEdition(texte); else { const cible = edition.origine === 'barre' ? barre : editeur; cible.value += (fr[0] || nom) + '('; } (edition && edition.origine === 'barre' ? barre : editeur).focus(); });
    liste.appendChild(d);
  }
}
function rendreNoms() {
  const liste = $('liste-noms'); liste.innerHTML = '';
  for (const d of classeur.noms.values()) {
    const el = document.createElement('div'); el.className = 'nom-defini';
    el.innerHTML = `<b>${echapper(d.nom)}</b><span>${echapper(d.ref)}</span>`;
    const aller = document.createElement('button'); aller.textContent = '→'; aller.title = 'Aller à la plage';
    aller.addEventListener('click', () => allerA(d.ref));
    const suppr = document.createElement('button'); suppr.textContent = '✕'; suppr.title = 'Supprimer le nom';
    suppr.addEventListener('click', () => { memoriser(); classeur.supprimerNom(d.nom); rendreNoms(); sauvegarderLocal(); rendre(); });
    el.appendChild(aller); el.appendChild(suppr);
    liste.appendChild(el);
  }
  if (!classeur.noms.size) liste.innerHTML = '<p style="color:var(--sourd)">Aucun nom. Sélectionnez une plage puis tapez un nom dans la zone à gauche de la barre de formule, ou ajoutez-le ci-dessus.</p>';
}
function allerA(texte) {
  let s = texte.replace(/^=/, '').replace(/\$/g, '');
  const k = s.lastIndexOf('!');
  if (k >= 0) { const i = classeur.indexFeuille(s.slice(0, k).replace(/^'|'$/g, '')); if (i >= 0 && i !== fi()) { memoriserVue(); activerFeuille(i); } s = s.slice(k + 1); }
  const p = plageDepuisTexte(s) || (classeur.nom(s) ? null : null);
  if (!p) { if (classeur.nom(s)) return allerA(classeur.nom(s)); return toast('Plage inconnue : ' + texte, true); }
  curseur = { r: p.r1, c: p.c1 }; selection = { r1: p.r1, c1: p.c1, r2: Math.min(p.r2, p.r1 + 5000), c2: Math.min(p.c2, p.c1 + 200) };
  nbLignes = Math.max(nbLignes, selection.r2 + 60); nbColonnes = Math.max(nbColonnes, selection.c2 + 15);
  geometrie(); defiler(curseur); rendre();
}
function rendreAide() {
  $('panneau-aide').innerHTML = `
<h3>Prise en main</h3>
<ul>
<li>Tapez dans une cellule ; <code>Entrée</code> valide, <code>Tab</code> passe à droite, <code>F2</code> modifie, <code>Échap</code> annule, <code>Suppr</code> efface.</li>
<li>Formules : <code>=SOMME(A1:A10)</code>, <code>=SI(B2&gt;0;"oui";"non")</code>, <code>=VPM(taux/12;n;-capital)</code>, <code>=LOI.NORMALE.STANDARD.N(1,96)</code>, <code>=RECHERCHEV(x;Table;2;FAUX)</code>… Noms anglais et français acceptés, séparateurs <code>;</code> ou <code>,</code>, virgule ou point décimal.</li>
<li>Autres feuilles : <code>=Hypothèses!B2</code>, <code>='Ma feuille'!A1:A9</code>. Noms définis : zone à gauche de la barre de formule.</li>
<li>Pendant la saisie d'une formule, cliquez ou glissez sur la grille pour insérer une référence.</li>
<li>Copier / couper / coller (<code>Ctrl+C/X/V</code>) décale les références relatives (<code>$A$1</code> reste fixe). Poignée en bas à droite : recopie et séries. <code>Ctrl+D</code> recopie vers le bas, <code>Ctrl+R</code> vers la droite.</li>
<li><code>Ctrl+Z</code> / <code>Ctrl+Y</code> annuler / rétablir. <code>Ctrl+flèches</code> saute au bord d'un bloc. Clic droit : menu.</li>
<li>Formats : <code>Ctrl+B/I/U</code>, liste des formats de nombre, boutons de décimales. Les formats Excel (<code>0.00%</code>, <code>#,##0.00</code>, <code>dd/mm/yyyy</code>…) sont lus et écrits.</li>
</ul>
<h3>Fichiers</h3>
<ul>
<li><b>Ouvrir</b> lit .xlsx / .xlsm / .csv : feuilles, formules, formats de nombre, largeurs, noms définis. Le code VBA d'un .xlsm est extrait et affiché dans l'éditeur.</li>
<li><b>Enregistrer</b> télécharge un .xlsx (ou .xlsm). Les formules sont écrites telles quelles ; Excel les recalcule à l'ouverture. Les macros écrites ici sont conservées dans une feuille masquée <code>_MacrosTableur</code> et rechargées par ce tableur ; le projet VBA d'origine d'un .xlsm est réécrit à l'identique.</li>
<li>Le classeur courant est aussi gardé dans le navigateur (rechargement de la page sans perte).</li>
</ul>
<h3>Macros VBA</h3>
<ul>
<li>Sous-ensemble de VBA : <code>Sub</code>/<code>Function</code>, <code>Dim</code>, tableaux, <code>If</code>, <code>Select Case</code>, <code>For</code>/<code>For Each</code>, <code>Do</code>/<code>While</code>, <code>With</code>, <code>On Error</code>, <code>Collection</code>, <code>Scripting.Dictionary</code>.</li>
<li>Objets : <code>Worksheets("x")</code>, <code>ActiveSheet</code>, <code>Range</code>, <code>Cells</code>, <code>Rows</code>, <code>Columns</code>, <code>Offset</code>, <code>Resize</code>, <code>End(xlUp)</code>, <code>UsedRange</code>, <code>Value</code>, <code>Formula</code>, <code>NumberFormat</code>, <code>Font</code>, <code>Interior</code>, <code>WorksheetFunction.*</code>, <code>MsgBox</code>, <code>InputBox</code>, <code>Debug.Print</code> (sortie sous l'éditeur).</li>
<li><code>F5</code> exécute la procédure choisie ; <code>Ctrl+Z</code> annule ses effets sur la feuille active.</li>
</ul>`;
}

// ---------------------------------------------------------------------------
// Événements : grille
// ---------------------------------------------------------------------------

conteneur.addEventListener('scroll', () => rendre());
window.addEventListener('resize', () => rendre());

conteneur.addEventListener('mousedown', (e) => {
  if (e.button === 2) return;
  const rect = conteneur.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (e.target.classList.contains('redim-col') || e.target.classList.contains('redim-lig')) { demarrerRedimension(e); return; }
  if (e.target === poignee) { e.preventDefault(); glisse = { mode: 'poignee', depart: selectionNormalisee() }; return; }
  if (x < LARGEUR_ENTETE && y < HAUTEUR_DEFAUT) { if (edition) validerEdition(); selection = { r1: 0, c1: 0, r2: Math.max(feuille().zone.r2, 0), c2: Math.max(feuille().zone.c2, 0) }; rendre(); return; }
  if (x < LARGEUR_ENTETE) { // en-tête de ligne
    const { r } = celluleDepuisPoint(LARGEUR_ENTETE + 1, y);
    if (edition) validerEdition();
    if (e.shiftKey) { selection.r2 = r; selection.c1 = 0; selection.c2 = nbColonnes - 1; } else { curseur = { r, c: 0 }; selection = { r1: r, c1: 0, r2: r, c2: 16383 }; }
    glisse = { mode: 'lignes' }; rendre(); return;
  }
  if (y < HAUTEUR_DEFAUT) { // en-tête de colonne
    const { c } = celluleDepuisPoint(x, HAUTEUR_DEFAUT + 1);
    if (edition) validerEdition();
    if (e.shiftKey) { selection.c2 = c; selection.r1 = 0; selection.r2 = nbLignes - 1; } else { curseur = { r: 0, c }; selection = { r1: 0, c1: c, r2: 1048575, c2: c }; }
    glisse = { mode: 'colonnes' }; rendre(); return;
  }
  const cel = celluleDepuisPoint(x, y);
  if (edition && (edition.origine === 'barre' ? barre : editeur).value.startsWith('=') && (edition.r !== cel.r || edition.c !== cel.c || edition.origine === 'barre')) {
    if (insererReference(cel.r, cel.c, cel.r, cel.c)) { e.preventDefault(); glisse = { mode: 'reference', depart: cel }; return; }
  }
  if (edition) validerEdition();
  e.preventDefault();
  conteneur.focus();
  if (e.shiftKey) { selection.r2 = cel.r; selection.c2 = cel.c; }
  else { curseur = cel; selection = { r1: cel.r, c1: cel.c, r2: cel.r, c2: cel.c }; }
  glisse = { mode: 'cellules' };
  rendre();
});
document.addEventListener('mousemove', (e) => {
  if (!glisse) return;
  const rect = conteneur.getBoundingClientRect();
  const cel = celluleDepuisPoint(e.clientX - rect.left, e.clientY - rect.top);
  if (glisse.mode === 'cellules') { if (cel.r !== selection.r2 || cel.c !== selection.c2) { selection.r2 = cel.r; selection.c2 = cel.c; defiler(cel); rendre(); } }
  else if (glisse.mode === 'lignes') { selection.r2 = cel.r; rendre(); }
  else if (glisse.mode === 'colonnes') { selection.c2 = cel.c; rendre(); }
  else if (glisse.mode === 'reference') { insererReference(glisse.depart.r, glisse.depart.c, cel.r, cel.c); }
  else if (glisse.mode === 'poignee') {
    const d = glisse.depart;
    const dr = cel.r < d.r1 ? d.r1 - cel.r : cel.r > d.r2 ? cel.r - d.r2 : 0, dc = cel.c < d.c1 ? d.c1 - cel.c : cel.c > d.c2 ? cel.c - d.c2 : 0;
    glisse.cible = dr >= dc ? { r: cel.r, c: null } : { r: null, c: cel.c };
    selection = dr >= dc ? { r1: Math.min(d.r1, cel.r), c1: d.c1, r2: Math.max(d.r2, cel.r), c2: d.c2 } : { r1: d.r1, c1: Math.min(d.c1, cel.c), r2: d.r2, c2: Math.max(d.c2, cel.c) };
    rendre();
  } else if (glisse.mode === 'redim-col') { const w = Math.max(20, glisse.base + e.clientX - glisse.x0); feuille().largeurs[glisse.c] = w; rendre(); }
  else if (glisse.mode === 'redim-lig') { const h = Math.max(14, glisse.base + e.clientY - glisse.y0); feuille().hauteurs[glisse.r] = h; rendre(); }
});
document.addEventListener('mouseup', () => {
  if (!glisse) return;
  const g = glisse; glisse = null;
  if (g.mode === 'poignee' && g.cible) { selection = g.depart; recopierVers({ r: g.cible.r ?? g.depart.r1, c: g.cible.c ?? g.depart.c1 }); }
  else if (g.mode === 'reference') { edition.refEnCours = null; (edition.origine === 'barre' ? barre : editeur).focus(); }
  else if (g.mode === 'redim-col' || g.mode === 'redim-lig') { classeur.modifie(); sauvegarderLocal(); }
  else if (g.mode === 'poignee') rendre();
});
function demarrerRedimension(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.target.classList.contains('redim-col')) { const c = +e.target.dataset.c; glisse = { mode: 'redim-col', c, x0: e.clientX, base: largeurCol(c) }; }
  else { const r = +e.target.dataset.r; glisse = { mode: 'redim-lig', r, y0: e.clientY, base: hauteurLig(r) }; }
}
conteneur.addEventListener('dblclick', (e) => {
  const rect = conteneur.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (e.target.classList.contains('redim-col')) { // ajustement automatique
    const c = +e.target.dataset.c; let w = 30;
    feuille().chaque((r, cc, cel) => { if (cc === c) w = Math.max(w, afficherValeur(classeur.valeur(fi(), r, cc), cel.z).length * 7.2 + 12); });
    feuille().largeurs[c] = Math.min(400, Math.round(w)); classeur.modifie(); rendre(); return;
  }
  if (x < LARGEUR_ENTETE || y < HAUTEUR_DEFAUT) return;
  if (!edition) commencerEdition();
});
conteneur.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = conteneur.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (x >= LARGEUR_ENTETE && y >= HAUTEUR_DEFAUT) { const cel = celluleDepuisPoint(x, y); const s = selectionNormalisee(); if (cel.r < s.r1 || cel.r > s.r2 || cel.c < s.c1 || cel.c > s.c2) { curseur = cel; selection = { r1: cel.r, c1: cel.c, r2: cel.r, c2: cel.c }; rendre(); } }
  const s = selectionNormalisee();
  const nl = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
  ouvrirMenu(e.clientX, e.clientY, [
    ['Couper', () => copier(true)], ['Copier', () => copier(false)], ['Coller', () => coller()], ['Coller les valeurs', () => collerValeurs()], null,
    ['Insérer ' + nl + ' ligne' + (nl > 1 ? 's' : ''), () => { memoriser(); classeur.insererLignes(fi(), s.r1, nl); sauvegarderLocal(); rendre(); }],
    ['Supprimer ' + nl + ' ligne' + (nl > 1 ? 's' : ''), () => { memoriser(); classeur.supprimerLignes(fi(), s.r1, nl); sauvegarderLocal(); rendre(); }],
    ['Insérer ' + nc + ' colonne' + (nc > 1 ? 's' : ''), () => { memoriser(); classeur.insererColonnes(fi(), s.c1, nc); sauvegarderLocal(); rendre(); }],
    ['Supprimer ' + nc + ' colonne' + (nc > 1 ? 's' : ''), () => { memoriser(); classeur.supprimerColonnes(fi(), s.c1, nc); sauvegarderLocal(); rendre(); }], null,
    [feuille().fusions.some((m) => m.r1 === s.r1 && m.c1 === s.c1) ? 'Dissocier les cellules' : 'Fusionner les cellules', () => { memoriser(); const f = feuille(); const i = f.fusions.findIndex((m) => m.r1 === s.r1 && m.c1 === s.c1); if (i >= 0) f.fusions.splice(i, 1); else if (nl * nc > 1) f.fusions.push({ ...s }); classeur.modifie(); sauvegarderLocal(); rendre(); }],
    ['Effacer le contenu', () => { memoriser(); classeur.effacer(fi(), s.r1, s.c1, Math.min(s.r2, feuille().zone.r2), Math.min(s.c2, feuille().zone.c2)); sauvegarderLocal(); rendre(); }],
    ['Effacer tout (contenu et formats)', () => { memoriser(); classeur.effacer(fi(), s.r1, s.c1, Math.min(s.r2, feuille().zone.r2), Math.min(s.c2, feuille().zone.c2), true); sauvegarderLocal(); rendre(); }],
    null, ['Définir un nom…', () => { const n = prompt('Nom pour ' + zoneNom.value + ' :'); if (n) try { classeur.definirNom(n, feuille().nom + '!' + adresseAbsolue(s)); sauvegarderLocal(); toast('Nom « ' + n + ' » défini'); } catch (err) { toast(err.message, true); } }],
  ]);
});
function adresseAbsolue(s) { const a = adresse(s.r1, s.c1, true, true); return s.r1 === s.r2 && s.c1 === s.c2 ? a : a + ':' + adresse(s.r2, s.c2, true, true); }
async function collerValeurs() {
  const dest = selectionNormalisee();
  if (!pressePapier) return coller();
  memoriser();
  const src = pressePapier; const sf = classeur.feuilles[src.fi];
  for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) { const cel = sf.get(r, c); const v = cel ? classeur.valeur(src.fi, r, c) : null; feuille().set(dest.r1 + r - src.r1, dest.c1 + c - src.c1, cel ? { v: v instanceof ErreurFormule ? null : v, z: cel.z, s: cel.s } : null); }
  feuille().recalculerZone(); classeur.modifie(); sauvegarderLocal(); rendre();
}

conteneur.addEventListener('keydown', (e) => {
  if (edition) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  const mouv = (dr, dc) => { e.preventDefault(); if (ctrl) { const p = sautCtrl(dr, dc); if (e.shiftKey) placerCurseur(p.r, p.c, true); else placerCurseur(p.r, p.c); } else { const base = e.shiftKey ? { r: selection.r2, c: selection.c2 } : curseur; placerCurseur(base.r + dr, base.c + dc, e.shiftKey); } };
  if (k === 'ArrowDown') return mouv(1, 0); if (k === 'ArrowUp') return mouv(-1, 0); if (k === 'ArrowRight') return mouv(0, 1); if (k === 'ArrowLeft') return mouv(0, -1);
  if (k === 'Enter') { e.preventDefault(); return placerCurseur(curseur.r + (e.shiftKey ? -1 : 1), curseur.c); }
  if (k === 'Tab') { e.preventDefault(); return placerCurseur(curseur.r, curseur.c + (e.shiftKey ? -1 : 1)); }
  if (k === 'Home') { e.preventDefault(); return ctrl ? placerCurseur(0, 0) : placerCurseur(curseur.r, 0); }
  if (k === 'End' && ctrl) { e.preventDefault(); return placerCurseur(Math.max(0, feuille().zone.r2), Math.max(0, feuille().zone.c2)); }
  if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor((conteneur.clientHeight - HAUTEUR_DEFAUT) / HAUTEUR_DEFAUT) - 1); return placerCurseur(curseur.r + (k === 'PageDown' ? n : -n), curseur.c, e.shiftKey); }
  if (k === 'Delete') { e.preventDefault(); const s = selectionBornee(); memoriser(); classeur.effacer(fi(), s.r1, s.c1, s.r2, s.c2); sauvegarderLocal(); return rendre(); }
  if (k === 'Backspace') { e.preventDefault(); return commencerEdition(''); }
  if (k === 'F2') { e.preventDefault(); return commencerEdition(); }
  if (k === 'F5' && panneauCourant === 'macros') { e.preventDefault(); return executerMacroUI(); }
  if (k === 'F11' && e.altKey) { e.preventDefault(); return ouvrirPanneau('macros'); }
  if (k === 'Escape') { pressePapier = null; return rendre(); }
  if (ctrl) {
    const K = k.toLowerCase();
    if (K === 'c') { e.preventDefault(); return copier(false); }
    if (K === 'x') { e.preventDefault(); return copier(true); }
    if (K === 'v') { e.preventDefault(); return coller(); }
    if (K === 'z') { e.preventDefault(); return annuler(); }
    if (K === 'y') { e.preventDefault(); return retablir(); }
    if (K === 'b') { e.preventDefault(); return basculerStyle('gras'); }
    if (K === 'i') { e.preventDefault(); return basculerStyle('italique'); }
    if (K === 'u') { e.preventDefault(); return basculerStyle('souligne'); }
    if (K === 'd') { e.preventDefault(); return recopier('bas'); }
    if (K === 'r') { e.preventDefault(); return recopier('droite'); }
    if (K === 'a') { e.preventDefault(); selection = { r1: 0, c1: 0, r2: Math.max(feuille().zone.r2, 0), c2: Math.max(feuille().zone.c2, 0) }; return rendre(); }
    if (K === 's') { e.preventDefault(); return enregistrer(); }
    if (K === 'o') { e.preventDefault(); return $('fichier').click(); }
    if (K === 'n' && e.altKey) { e.preventDefault(); return nouveauClasseur(); }
    if (k === ';') { e.preventDefault(); const d = new Date(); return (memoriser(), classeur.saisir(fi(), curseur.r, curseur.c, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`), sauvegarderLocal(), rendre()); }
    return;
  }
  if (k.length === 1 && !e.altKey) { e.preventDefault(); commencerEdition(k); }
});
// Coller depuis l'extérieur (texte tabulé)
conteneur.addEventListener('paste', (e) => { if (edition) return; e.preventDefault(); coller(e.clipboardData.getData('text/plain')); });

// ----- Éditeur de cellule -----
editeur.addEventListener('input', () => { barre.value = editeur.value; edition.refEnCours = null; ajusterEditeur(); positionnerSelection(); });
editeur.addEventListener('keydown', (e) => toucheEdition(e, 'cellule'));
barre.addEventListener('focus', () => { if (!edition) { edition = { r: curseur.r, c: curseur.c, origine: 'barre' }; positionnerSelection(); } });
barre.addEventListener('input', () => { if (edition) { editeur.value = barre.value; edition.refEnCours = null; positionnerSelection(); } });
barre.addEventListener('keydown', (e) => toucheEdition(e, 'barre'));
barre.addEventListener('blur', () => { if (edition && edition.origine === 'barre' && !glisse) setTimeout(() => { if (edition && edition.origine === 'barre' && document.activeElement !== barre) validerEdition(); }, 150); });
editeur.addEventListener('blur', () => { if (edition && edition.origine === 'cellule' && !glisse) setTimeout(() => { if (edition && edition.origine === 'cellule' && document.activeElement !== editeur && document.activeElement !== barre) validerEdition(); }, 150); });
function toucheEdition(e, origine) {
  if (!edition) return;
  e.stopPropagation();
  if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); validerEdition({ dr: e.shiftKey ? -1 : 1 }); }
  else if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const t = e.target; const p = t.selectionStart; t.value = t.value.slice(0, p) + '\n' + t.value.slice(p); t.setSelectionRange(p + 1, p + 1); if (origine === 'cellule') ajusterEditeur(); }
  else if (e.key === 'Tab') { e.preventDefault(); validerEdition({ dc: e.shiftKey ? -1 : 1 }); }
  else if (e.key === 'Escape') { e.preventDefault(); annulerEdition(); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && origine === 'cellule' && !e.target.value.startsWith('=')) { e.preventDefault(); validerEdition({ dr: e.key === 'ArrowDown' ? 1 : -1 }); }
  else if (e.key === 'F4' && e.target.value.startsWith('=')) { // bascule $ sur la référence sous le curseur
    e.preventDefault(); const t = e.target; const txt = t.value; const refs = referencesDe(txt); const p = t.selectionStart;
    const ref = refs.find((r) => p >= r.pos && p <= r.fin); if (!ref) return;
    const cycle = (part) => { const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(part); if (!m) return part; const etat = (m[1] ? 2 : 0) + (m[3] ? 1 : 0); const suivant = [3, 2, 0, 1][etat]; return (suivant & 2 ? '$' : '') + m[2] + (suivant & 1 ? '$' : '') + m[4]; };
    const nouveau = ref.ref.split(':').map(cycle).join(':');
    const deb = txt.slice(0, ref.fin).lastIndexOf(ref.ref);
    t.value = txt.slice(0, deb) + nouveau + txt.slice(deb + ref.ref.length);
    t.setSelectionRange(deb + nouveau.length, deb + nouveau.length);
    if (origine === 'cellule') barre.value = t.value; else editeur.value = t.value;
    positionnerSelection();
  }
}
zoneNom.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const txt = zoneNom.value.trim();
  if (!txt) return;
  if (plageDepuisTexte(txt) || txt.includes('!') || classeur.nom(txt)) { allerA(classeur.nom(txt) || txt); conteneur.focus(); return; }
  try { const s = selectionNormalisee(); classeur.definirNom(txt, feuille().nom + '!' + adresseAbsolue(s)); sauvegarderLocal(); toast('Nom « ' + txt + ' » défini pour ' + adresseAbsolue(s)); conteneur.focus(); } catch (err) { toast(err.message, true); }
});

// ----- Barre d'outils -----
$('btn-nouveau').addEventListener('click', nouveauClasseur);
$('btn-ouvrir').addEventListener('click', () => $('fichier').click());
$('fichier').addEventListener('change', (e) => { if (e.target.files[0]) ouvrirFichier(e.target.files[0]); e.target.value = ''; });
$('btn-enregistrer').addEventListener('click', enregistrer);
$('btn-gras').addEventListener('click', () => basculerStyle('gras'));
$('btn-italique').addEventListener('click', () => basculerStyle('italique'));
$('btn-souligne').addEventListener('click', () => basculerStyle('souligne'));
$('couleur-texte').addEventListener('input', (e) => surSelection((r, c) => classeur.style(fi(), r, c, { couleur: e.target.value })));
$('btn-fond').addEventListener('click', () => surSelection((r, c) => classeur.style(fi(), r, c, { fond: $('couleur-fond').value })));
$('couleur-fond').addEventListener('input', (e) => surSelection((r, c) => classeur.style(fi(), r, c, { fond: e.target.value })));
$('btn-sans-fond').addEventListener('click', () => surSelection((r, c) => classeur.style(fi(), r, c, { fond: null })));
for (const b of document.querySelectorAll('[data-align]')) b.addEventListener('click', () => surSelection((r, c) => classeur.style(fi(), r, c, { align: b.dataset.align })));
$('format-nombre').addEventListener('change', (e) => { const z = e.target.value; surSelection((r, c) => { if (z || feuille().get(r, c)) classeur.format(fi(), r, c, z || null); }); conteneur.focus(); });
$('btn-decimales-moins').addEventListener('click', () => changerDecimales(-1));
$('btn-decimales-plus').addEventListener('click', () => changerDecimales(1));
$('btn-inserer-ligne').addEventListener('click', () => { const s = selectionNormalisee(); memoriser(); classeur.insererLignes(fi(), s.r1, s.r2 - s.r1 + 1); sauvegarderLocal(); rendre(); });
$('btn-supprimer-ligne').addEventListener('click', () => { const s = selectionNormalisee(); memoriser(); classeur.supprimerLignes(fi(), s.r1, s.r2 - s.r1 + 1); sauvegarderLocal(); rendre(); });
$('btn-inserer-colonne').addEventListener('click', () => { const s = selectionNormalisee(); memoriser(); classeur.insererColonnes(fi(), s.c1, s.c2 - s.c1 + 1); sauvegarderLocal(); rendre(); });
$('btn-supprimer-colonne').addEventListener('click', () => { const s = selectionNormalisee(); memoriser(); classeur.supprimerColonnes(fi(), s.c1, s.c2 - s.c1 + 1); sauvegarderLocal(); rendre(); });
$('btn-noms').addEventListener('click', () => ouvrirPanneau('noms'));
$('btn-fonctions').addEventListener('click', () => ouvrirPanneau('fonctions'));
$('btn-macros').addEventListener('click', () => ouvrirPanneau('macros'));
$('btn-aide').addEventListener('click', () => ouvrirPanneau('aide'));
$('panneau-fermer').addEventListener('click', () => { $('panneau').hidden = true; panneauCourant = null; rendre(); });
$('btn-ajouter-feuille').addEventListener('click', () => { memoriserVue(); classeur.ajouterFeuille(); activerFeuille(classeur.feuilles.length - 1); sauvegarderLocal(); });
$('filtre-fonctions').addEventListener('input', rendreFonctions);
$('btn-ajouter-nom').addEventListener('click', () => { try { classeur.definirNom($('nom-nouveau').value, $('ref-nouveau').value); $('nom-nouveau').value = ''; $('ref-nouveau').value = ''; rendreNoms(); sauvegarderLocal(); rendre(); } catch (e) { toast(e.message, true); } });
$('btn-executer').addEventListener('click', executerMacroUI);
$('btn-verifier').addEventListener('click', verifierVBA);
$('btn-exemple').addEventListener('click', () => { const ta = $('code-vba'); ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n\n' : '') + EXEMPLE_VBA; classeur.macros = ta.value; rafraichirProcedures(); sauvegarderLocal(); });
let timerCode;
$('code-vba').addEventListener('input', () => { classeur.macros = $('code-vba').value; clearTimeout(timerCode); timerCode = setTimeout(() => { rafraichirProcedures(); sauvegarderLocal(); }, 400); });
$('code-vba').addEventListener('keydown', (e) => {
  if (e.key === 'F5') { e.preventDefault(); executerMacroUI(); }
  else if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const p = t.selectionStart; t.value = t.value.slice(0, p) + '    ' + t.value.slice(t.selectionEnd); t.setSelectionRange(p + 4, p + 4); }
  else if (e.key === 'Enter') { // conserve l'indentation
    const t = e.target; const p = t.selectionStart; const debut = t.value.lastIndexOf('\n', p - 1) + 1; const indent = /^[ \t]*/.exec(t.value.slice(debut, p))[0];
    e.preventDefault(); t.value = t.value.slice(0, p) + '\n' + indent + t.value.slice(t.selectionEnd); t.setSelectionRange(p + 1 + indent.length, p + 1 + indent.length);
  }
});
// Glisser-déposer d'un fichier sur la page
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) ouvrirFichier(f); });
window.addEventListener('beforeunload', () => { memoriserVue(); sauvegarderLocal(); });

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

if (!restaurerLocal()) classeur = Classeur.nouveau();
$('code-vba').value = classeur.macros || '';
rafraichirProcedures();
activerFeuille(Math.min(classeur.active, classeur.feuilles.length - 1));
document.title = (classeur.nomFichier || 'Classeur') + ' — Tableur';
conteneur.focus();
if (window.HubBridge && window.HubBridge.shown) window.HubBridge.shown();
window.__tableur = { get classeur() { return classeur; }, Classeur, rendre, chargerClasseur };
