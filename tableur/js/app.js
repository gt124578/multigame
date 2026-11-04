// Interface du Tableur : grille virtualisée, barre de formule, onglets, presse-papiers, macros.

import { Classeur, PROPRIETES_FEUILLE } from './classeur.js';
import { styleTableau, styleCelluleTableau } from './tableaux.js';
import { couleurFormat, formater, colVersLettres, lettresVersCol, parsePlage, parseAdresse, adresse, ErreurFormule, NOMS_FONCTIONS, ALIAS, referencesDe, decalerFormule, fonction } from './formules.js';
import { lireClasseur, ecrireClasseur, lireDocx, nettoyerModuleVBA } from './xlsxio.js';
import { estChiffre, dechiffrerOffice, ErreurMotDePasse, sha512, sha384, sha256, sha1 } from './chiffrement.js';
import { hacherMotDePasse, verifierShaMotDePasse, DROITS } from './page-xlsx.js';
import { executerMacro, analyserVBA, ErreurVBA, InterpreteurVBA, creerUDF } from './vba.js';
import { listerProcedures, procedureALaLigne, insererMacro, supprimerProcedure, ajouterAuProjet, nomVBAValide } from './projetvba.js';
import { installerGraphiques } from './ui-graphiques.js';
import { styleConditionnel, validationDe, valeurValide } from './donnees.js';
import { installerDonnees } from './ui-donnees.js';
import { installerTCD } from './ui-tcd.js';
import { installerDialogues } from './ui-dialogues.js';
import { installerAnalyse } from './ui-analyse.js';
import { installerImpression } from './ui-impression.js';
import { rendreGraphiqueSVG, normaliser as normaliserGraphique, sparklineSVG } from './graphiques.js';
import { antecedents, dependants, actualiserTablesDonnees } from './analyse.js';
import { AIDE } from './aide-fonctions.js';
import { matriceGraphique } from './graphiques-xlsx.js';

const XLSX = window.XLSX;
const $ = (id) => document.getElementById(id);

const LARGEUR_DEFAUT = 84, HAUTEUR_DEFAUT = 24, LARGEUR_ENTETE = 46;
const CLE_STOCKAGE = 'tableur.classeurs', ANCIENNE_CLE = 'tableur.classeur';

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

let classeur = Classeur.nouveau();
let classeurs = [classeur];    // classeurs ouverts (onglets du haut)
let curseur = { r: 0, c: 0 };
let selection = { r1: 0, c1: 0, r2: 0, c2: 0 };
let nbLignes = 200, nbColonnes = 40;
let edition = null;          // { r, c, origine: 'cellule' | 'barre' }
let pressePapier = null;     // { classeur, feuille, r1, c1, r2, c2, couper, texte } : peut venir d'un autre classeur
let historique = [], futur = [];
let glisse = null;           // sélection à la souris
let refsColorees = [];
let panneauCourant = null;
let graphiqueActif = null;   // id du graphique sélectionné
let imageActive = null;      // id de l'image sélectionnée
let afficherFormules = false; // Ctrl+` : les formules à la place des résultats
let pinceau = null;          // reproduire la mise en forme : { cellules, nl, nc, garder }
let derniereAction = null;   // F4 hors saisie : refaire la dernière mise en forme
let pressePapierObjet = null; // { genre: 'graphique' | 'image', objet, classeur, feuilleNom } : graphique ou image copié
let macroEnCours = false;
let fleches = [];             // flèches d'audit : { de: { fi, r1, c1, r2, c2 }, vers: { fi, r, c }, genre: 'ant' | 'dep' }

const conteneur = $('grille-conteneur'), cellulesDiv = $('cellules'), entetesCol = $('entetes-colonnes'), entetesLig = $('entetes-lignes');
const selDiv = $('selection'), cursDiv = $('curseur'), poignee = $('poignee'), editeur = $('editeur'), barre = $('saisie-formule'), zoneNom = $('zone-nom');

const feuille = () => classeur.feuilles[classeur.active];
// Texte de la barre de formule : les nombres bruts s'affichent avec la virgule décimale
function saisieAffichee(r, c) { const cel = feuille().get(r, c); if (cel && cel.f != null && cel.s && cel.s.masquee && feuilleProtegee()) return ''; const s = classeur.saisie(fi(), r, c); return cel && cel.f == null && typeof cel.v === 'number' && !(cel.z && /[dmyjhs]/i.test(cel.z)) ? s.replace('.', ',') : s; }
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
  const taille = 13 * Z() + 'px';
  if (cellulesDiv.style.fontSize !== taille) { cellulesDiv.style.fontSize = taille; $('volets').style.fontSize = taille; editeur.style.fontSize = matchMedia('(pointer: coarse)').matches ? Math.max(16, 13 * Z()) + 'px' : taille; }
}
/** Change le zoom de la feuille en gardant le point sous `ancre` (coordonnées dans la grille) au même endroit. */
function definirZoom(z, ancre) {
  z = Math.round(Math.min(4, Math.max(0.1, z)) * 100) / 100;
  const f = feuille(), avant = Z();
  if (Math.abs(z - avant) < 0.001) return;
  const ax = ancre ? ancre.x : conteneur.clientWidth / 2, ay = ancre ? ancre.y : conteneur.clientHeight / 2;
  const cx = (conteneur.scrollLeft + ax - LARGEUR_ENTETE) / avant, cy = (conteneur.scrollTop + ay - HAUTEUR_DEFAUT) / avant;
  if (z === 1) delete f.zoom; else f.zoom = z;
  geometrie();
  while (xCols[nbColonnes] < cx * z + conteneur.clientWidth && nbColonnes < 16384) { nbColonnes += 20; geometrie(); }
  while (yLigs[nbLignes] < cy * z + conteneur.clientHeight && nbLignes < 1048576) { nbLignes += 100; geometrie(); }
  conteneur.scrollLeft = Math.max(0, cx * z - ax + LARGEUR_ENTETE); conteneur.scrollTop = Math.max(0, cy * z - ay + HAUTEUR_DEFAUT);
  rendre(); sauvegarderLocal();
}
const PALIERS_ZOOM = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
function zoomPas(sens, ancre) { const z = Z(); const p = sens > 0 ? PALIERS_ZOOM.find((x) => x > z + 0.001) : [...PALIERS_ZOOM].reverse().find((x) => x < z - 0.001); if (p) definirZoom(p, ancre); }
function zoomSelection() {
  const s = selectionBornee(), z = Z();
  const w = (xCols[Math.min(s.c2 + 1, nbColonnes)] - xCols[s.c1]) / z, h = (yLigs[Math.min(s.r2 + 1, nbLignes)] - yLigs[s.r1]) / z;
  definirZoom(Math.min((conteneur.clientWidth - LARGEUR_ENTETE - 20) / w, (conteneur.clientHeight - HAUTEUR_DEFAUT - 20) / h, 4));
  defiler({ r: s.r1, c: s.c1 });
}
function menuZoom(x, y) {
  ouvrirMenu(x, y, [...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => [(Math.abs(Z() - z) < 0.001 ? '✓ ' : '') + Math.round(z * 100) + ' %', () => definirZoom(z)]), null,
    ['Zoom sur la sélection', () => zoomSelection()], ['Personnalisé…', () => { const v = prompt('Zoom (10 à 400 %) :', Math.round(Z() * 100)); if (v) definirZoom(+String(v).replace('%', '').replace(',', '.') / 100); }]]);
}
// ----- Thème clair / sombre -----
let theme = (() => { try { return localStorage.getItem('sprezz.theme') || 'clair'; } catch { return 'clair'; } })();
function appliquerTheme() {
  const sombre = theme === 'sombre' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('sombre', sombre);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = sombre ? '#1e2127' : '#1f7a4d';
}
function choisirTheme(t) { theme = t; try { localStorage.setItem('sprezz.theme', t); } catch { /* navigation privée */ } appliquerTheme(); rendre(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (theme === 'auto') { appliquerTheme(); rendre(); } });
appliquerTheme();
// En thème sombre, un texte noir par défaut sur une cellule claire reste noir ; sans fond, il devient clair
function clair(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return true; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.55; }
// Zoom de la feuille (comme Excel : propre à chaque feuille) : toute la géométrie des cellules est mise à l'échelle
const Z = () => feuille().zoom || 1;
const largeurCol = (c) => { const l = feuille().largeurs[c]; return (l === undefined ? LARGEUR_DEFAUT : l) * Z(); };
const hauteurLig = (r) => { const f = feuille(); if (f.filtrees && f.filtrees.size && f.filtrees.has(r)) return 0; const h = f.hauteurs[r]; return (h === undefined ? HAUTEUR_DEFAUT : h) * Z(); };
function indexDepuis(tab, pos) { // dichotomie : indice i tel que tab[i] <= pos < tab[i+1]
  let lo = 0, hi = tab.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tab[m] <= pos) lo = m; else hi = m - 1; }
  return lo;
}
function celluleDepuisPoint(x, y) {
  const z = zoneFigee();
  let px = x - LARGEUR_ENTETE, py = y - HAUTEUR_DEFAUT;
  if (!z.c || px >= z.FW) px += conteneur.scrollLeft;
  if (!z.r || py >= z.FH) py += conteneur.scrollTop;
  return { r: Math.max(0, Math.min(nbLignes - 1, indexDepuis(yLigs, Math.max(0, py)))), c: Math.max(0, Math.min(nbColonnes - 1, indexDepuis(xCols, Math.max(0, px)))) };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function afficherValeur(v, z) { return formater(v, z); }

// Largeur réelle d'un texte dans la police des cellules (pour « ##### » et les débordements)
const mesureur = document.createElement('canvas').getContext('2d');
function largeurTexte(t, s) {
  mesureur.font = (s && s.italique ? 'italic ' : '') + (s && s.gras ? '700 ' : '400 ') + ((s && s.taille) || 13) + 'px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  return mesureur.measureText(t).width * Z();
}

let rendRequis = false;
function rendre() { if (rendRequis) return; rendRequis = true; requestAnimationFrame(() => { rendRequis = false; rendreMaintenant(); }); }

function htmlCellules(f, F, r1, r2, c1, c2, dx = 0, dy = 0) {
  let html = '';
  const entourerInvalides = uiD.validation.entourer();
  const sombre = document.body.classList.contains('sombre');
  const zonesDebord = classeur.evaluateur.zonesDebord(F) || [];
  const fusionDe = (r, c) => f.fusions.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  // Tableaux structurés : leur style passe sous la mise en forme propre de chaque cellule
  const tabs = (f.tableaux || []).filter((t) => t.r2 >= r1 && t.r1 <= r2), stTabs = new Map(tabs.map((t) => [t, styleTableau(t.style)]));
  const styleTab = (r, c) => { if (!tabs.length) return null; const t = tabs.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2); return t ? styleCelluleTableau(t, r, c, stTabs.get(t)) : null; };
  const css = (s) => {
    let o = '';
    if (s.fond) o += `background:${s.fond};`;
    const bo = s.bordures || (s.bordure ? { h: 'thin', b: 'thin', g: 'thin', d: 'thin' } : null);
    if (bo) { const ep = { thin: 1, medium: 2, thick: 3, double: 3 }; for (const [k, cs] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) if (bo[k]) o += `border-${cs}:${ep[bo[k]] || 1}px ${bo[k] === 'double' ? 'double' : 'solid'} ${s.bordCouleur || '#1f2937'};`; }
    return o;
  };
  for (let r = r1; r <= r2; r++) {
    if (!hauteurLig(r)) continue;
    for (let c = Math.max(0, c1 - 8); c <= c2; c++) {
      let cel = f.get(r, c);
      // Cellule vide dans le débordement d'une formule (tableau dynamique) : elle affiche sa part du résultat
      if (!cel && zonesDebord.length && zonesDebord.some((z) => r >= z.r && r < z.r + z.h && c >= z.c && c < z.c + z.w && (z.r !== r || z.c !== c))) cel = { debordee: true };
      const fus = f.fusions.length ? fusionDe(r, c) : null;
      if (fus && (fus.r1 !== r || fus.c1 !== c)) continue;
      let w = largeurCol(c), h = hauteurLig(r);
      if (fus) { w = xCols[fus.c2 + 1] - xCols[fus.c1]; h = yLigs[fus.r2 + 1] - yLigs[fus.r1]; }
      const ts = styleTab(r, c);
      if (!cel) { if (c >= c1) html += `<div class="cellule" style="left:${xCols[c] + dx}px;top:${yLigs[r] + dy}px;width:${w}px;height:${h}px;${ts ? css(ts) : ''}"></div>`; continue; }
      const v = classeur.valeur(F, r, c);
      let txt = afficherValeur(v, cel.z);
      let cls = 'cellule';
      let reduction = 0;
      if (typeof v === 'number') {
        const dispo = (fus ? w : largeurCol(c)) - 6, besoinN = largeurTexte(txt, cel.s);
        // Un peu trop large (notre police est plus large que l'Arial 10 d'Excel) : on serre plutôt que « ##### »
        if (besoinN > dispo && besoinN <= dispo * 1.3) reduction = Math.floor(((cel.s && cel.s.taille) || 13) * Z() * dispo / besoinN * 10) / 10;
        else if (besoinN > dispo) txt = ajusterNombre(v, cel.z, dispo, cel.s);
      }
      let s = cel.s || {};
      if (ts) s = { ...ts, ...s, bordures: s.bordures || ts.bordures, bordCouleur: s.bordures ? s.bordCouleur : ts.bordCouleur };
      if (sombre) { if (s.fond && clair(s.fond) && !s.couleur) s = { ...s, couleur: '#111827' }; else if (!s.fond && s.couleur && !clair(s.couleur) && /^#(000|0{6}|1[0-9a-f]{5})$/i.test(s.couleur)) s = { ...s, couleur: null }; }
      const mfc = f.mfc && f.mfc.length ? styleConditionnel(classeur, F, r, c) : null;
      if (mfc) { s = { ...s }; for (const k of ['fond', 'couleur', 'gras', 'italique']) if (mfc[k] !== undefined) s[k] = mfc[k]; }
      if (v instanceof ErreurFormule) cls += ' erreur';
      else if (typeof v === 'number' && !(cel.z === '@')) cls += ' nombre';
      else if (typeof v === 'boolean') cls += ' booleen';
      if (s.align) cls += ' ' + { left: 'gauche', center: 'centre', right: 'droite' }[s.align];
      let style = `left:${xCols[c] + dx}px;top:${yLigs[r] + dy}px;height:${h}px;`;
      // Débordement du texte sur les cellules vides voisines
      if (s.renvoi) cls += ' renvoi';
      if (s.valign) cls += s.valign === 'top' ? ' haut' : ' milieu';
      const besoin = typeof v === 'string' && !fus && !s.renvoi ? largeurTexte(txt, s) + 10 : 0;
      if (besoin > w && s.align !== 'center') {
        let ww = w;
        if (s.align === 'right') { // texte aligné à droite : il déborde sur les cellules vides de gauche
          let cc = c - 1;
          while (cc >= 0 && !f.get(r, cc) && ww < besoin) { ww += largeurCol(cc); cc--; }
          if (ww > w) { style += `left:${xCols[cc + 1] + dx}px;`; w = ww; cls += ' deborde'; }
        } else {
          let cc = c + 1;
          while (cc < nbColonnes && cc <= c2 + 1 && !f.get(r, cc) && ww < besoin) { ww += largeurCol(cc); cc++; }
          if (ww > w) { w = ww; cls += ' deborde'; style += 'background:var(--papier);'; }
        }
      }
      style += `width:${w}px;`;
      if (s.gras) style += 'font-weight:700;'; if (s.italique) style += 'font-style:italic;';
      if (s.souligne || s.barre) style += `text-decoration:${[s.souligne && 'underline', s.barre && 'line-through'].filter(Boolean).join(' ')};`;
      if (s.retrait) style += `padding-${s.align === 'right' ? 'right' : 'left'}:${4 + s.retrait * 9 * Z()}px;`;
      const cFormat = typeof v === 'number' && cel.z ? couleurFormat(v, cel.z) : null;
      if (cFormat && !(mfc && mfc.couleur)) style += `color:${cFormat};`; else if (s.couleur) style += `color:${s.couleur};`; if (s.taille) style += `font-size:${s.taille * Z()}px;`;
      if (reduction) style += `font-size:${reduction}px;padding:0 2px;`;
      if (mfc && mfc.barre) { const b = mfc.barre; style += `background:linear-gradient(90deg,transparent ${b.debut}%,${b.negatif ? '#ff5555' : b.couleur} ${b.debut}%,${(b.negatif ? '#ff5555' : b.couleur) + '55'} ${b.fin}%,transparent ${b.fin}%)${s.fond ? ',' + s.fond : ''};`; }
      style += css({ ...s, fond: mfc && mfc.barre ? null : s.fond });
      if (cel.note) cls += ' note';
      if (cel.lien) cls += ' lien';
      if (entourerInvalides && f.validations.length) { const dv = validationDe(f, r, c); if (dv && !valeurValide(classeur, F, dv, r, c)) cls += ' invalide'; }
      const bulle = cel.note || (cel.lien ? cel.lien + ' — Ctrl+clic pour suivre le lien' : '');
      html += `<div class="${cls}" style="${style}"${bulle ? ` title="${echapper(bulle).replace(/"/g, '&quot;')}"` : ''}>${afficherFormules && cel.f != null ? echapper(classeur.saisie(F, r, c)) : echapper(txt)}</div>`;
    }
  }
  // Graphiques sparkline : dessinés dans leur cellule
  for (const sp of f.sparklines || []) {
    if (sp.r < r1 || sp.r > r2 || sp.c < c1 || sp.c > c2 || !hauteurLig(sp.r) || !largeurCol(sp.c)) continue;
    const vals = matriceGraphique(classeur, f, sp.donnees).flat();
    html += `<div class="sparkline" style="left:${xCols[sp.c] + dx}px;top:${yLigs[sp.r] + dy}px;width:${largeurCol(sp.c)}px;height:${hauteurLig(sp.r)}px">${sparklineSVG(vals, largeurCol(sp.c) - 1, hauteurLig(sp.r) - 1, sp)}</div>`;
  }
  return html;
}

// ----- Volets figés -----
function zoneFigee() {
  const g = feuille().figer;
  if (!g || (!g.r && !g.c)) return { r: 0, c: 0, FW: 0, FH: 0 };
  const r = Math.min(g.r || 0, nbLignes - 1), c = Math.min(g.c || 0, nbColonnes - 1);
  return { r, c, FW: xCols[c], FH: yLigs[r] };
}
// Une ligne / colonne masquée juste avant : un trait double sur l'en-tête, comme Excel
function masqueAvant(i, axe) { return i > 0 && (axe === 'r' ? hauteurLig(i - 1) : largeurCol(i - 1)) === 0; }
let voletsRendus = { sl: 0, st: 0 };
// Pendant le défilement, le contenu des volets suit tout de suite (le rendu complet arrive à l'image suivante)
function suivreVolets() {
  const v = $('volets'); if (!v.firstChild) return;
  const h = v.querySelector('.volet-haut .volet-contenu'), g = v.querySelector('.volet-gauche .volet-contenu');
  if (h) h.style.transform = `translateX(${voletsRendus.sl - conteneur.scrollLeft}px)`;
  if (g) g.style.transform = `translateY(${voletsRendus.st - conteneur.scrollTop}px)`;
}
// Dans quel volet se trouve un objet (bouton, image : sa cellule d'ancrage ; graphique : son coin haut-gauche)
function zoneObjet(o, z = zoneFigee()) { return (o.de.r < z.r ? 'H' : '') + (o.de.c < z.c ? 'G' : ''); }
function zoneGraphique(g, z = zoneFigee()) { return (z.r && g.y * Z() < z.FH ? 'H' : '') + (z.c && g.x * Z() < z.FW ? 'G' : ''); }
function rendreVolets(f, F, z, sl, st, W, H, rv1, r2, cv1, c2) {
  const volets = $('volets');
  if (!z.r && !z.c) { if (volets.innerHTML) volets.innerHTML = ''; return; }
  const L = LARGEUR_ENTETE, T = HAUTEUR_DEFAUT;
  let html = '';
  // Le contenu d'un volet est dessiné dans le repère de la feuille, décalé pour que la bonne partie apparaisse
  const panneau = (cls, x, y, w, h, dx, dy, contenu) => (w > 0 && h > 0 ? `<div class="volet ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="volet-contenu" style="left:${dx}px;top:${dy}px">${contenu}</div></div>` : '');
  const objets = (quoi) => rendreObjets(f, quoi) + uiG.rendreSurFeuille(f, (g) => zoneGraphique(g, z) === quoi, Z());
  voletsRendus = { sl, st };
  if (z.r) html += panneau('volet-haut', L + z.FW, T, W - L - z.FW, z.FH, -sl - z.FW, 0, htmlCellules(f, F, 0, z.r - 1, cv1, c2) + objets('H'));
  if (z.c) html += panneau('volet-gauche', L, T + z.FH, z.FW, H - T - z.FH, 0, -st - z.FH, htmlCellules(f, F, rv1, r2, 0, z.c - 1) + objets('G'));
  if (z.r && z.c) html += panneau('volet-coin', L, T, z.FW, z.FH, 0, 0, htmlCellules(f, F, 0, z.r - 1, 0, z.c - 1) + objets('HG'));
  // Traits qui marquent la séparation
  if (z.r) html += `<div class="trait-volet horizontal" style="left:${L}px;top:${T + z.FH - 1}px;width:${W - L}px"></div>`;
  if (z.c) html += `<div class="trait-volet vertical" style="left:${L + z.FW - 1}px;top:${T}px;height:${H - T}px"></div>`;
  volets.innerHTML = html;
}

function rendreMaintenant() {
  geometrie();
  if (panneauCourant === 'macros') { if (moduleCourant().cle !== moduleAffiche) afficherModule(); else rendreArbreVBA(false); }
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
  const z = zoneFigee();
  // Volets figés : les premières colonnes / lignes ne défilent pas (leurs en-têtes sont dessinés par-dessus les autres)
  const enteteCol = (c, x, fige) => { const w = largeurCol(c); return w ? `<div class="entete-col${c >= selC1 && c <= selC2 ? ' actif' : ''}${fige ? ' fige' : ''}${masqueAvant(c, 'c') ? ' apres-masque' : ''}" data-c="${c}" style="left:${x}px;width:${w}px">${colVersLettres(c)}<div class="redim-col" data-c="${c}"></div></div>` : ''; };
  const enteteLig = (r, y, fige) => { const h = hauteurLig(r); return h ? `<div class="entete-lig${r >= selR1 && r <= selR2 ? ' actif' : ''}${fige ? ' fige' : ''}${f.filtrees && f.filtrees.size && f.filtre && r > f.filtre.r1 && r <= f.filtre.r2 ? ' filtree' : ''}${masqueAvant(r, 'r') ? ' apres-masque' : ''}" data-r="${r}" style="top:${y}px;height:${h}px">${r + 1}<div class="redim-lig" data-r="${r}"></div></div>` : ''; };
  const cv1 = z.c ? Math.max(z.c, indexDepuis(xCols, sl + z.FW)) : c1, rv1 = z.r ? Math.max(z.r, indexDepuis(yLigs, st + z.FH)) : r1;
  for (let c = cv1; c <= c2; c++) hc += enteteCol(c, xCols[c] - sl, false);
  for (let c = 0; c < z.c; c++) hc += enteteCol(c, xCols[c], true);
  for (let r = rv1; r <= r2; r++) hl += enteteLig(r, yLigs[r] - st, false);
  for (let r = 0; r < z.r; r++) hl += enteteLig(r, yLigs[r], true);
  entetesCol.innerHTML = hc; entetesLig.innerHTML = hl;
  rendreVolets(f, F, z, sl, st, W, H, rv1, r2, cv1, c2);
  // Cellules
  cellulesDiv.style.left = LARGEUR_ENTETE + 'px'; cellulesDiv.style.top = HAUTEUR_DEFAUT + 'px';
  let html = htmlCellules(f, F, r1, r2, c1, c2);
  html += rendreObjets(f);
  html += rendreGraphiques(f);
  html += rendreFleches(F);
  html += rendreSauts(f);
  cellulesDiv.innerHTML = html;
  positionnerSelection();
  rendreOnglets();
  rendreStatut();
  rendreClasseurs();
}

// ----- Boutons (macros) et images posés sur la feuille -----
function rectObjet(o) {
  const z = Z();
  const x1 = xCols[Math.min(o.de.c, nbColonnes)] + (o.de.dx || 0) * z, y1 = yLigs[Math.min(o.de.r, nbLignes)] + (o.de.dy || 0) * z;
  if (o.a) { const x2 = xCols[Math.min(o.a.c, nbColonnes)] + (o.a.dx || 0) * z, y2 = yLigs[Math.min(o.a.r, nbLignes)] + (o.a.dy || 0) * z; return { x: x1, y: y1, w: Math.max(16, x2 - x1), h: Math.max(12, y2 - y1) }; }
  return { x: x1, y: y1, w: (o.w || 80) * z, h: (o.h || 24) * z };
}
function rendreObjets(f, quoi = '') {
  let html = '';
  const z = zoneFigee();
  for (const im of f.images || []) {
    if (zoneObjet(im, z) !== quoi) continue;
    const r = rectObjet(im);
    html += `<img class="image-feuille${im.macro ? ' cliquable' : ''}${im.id === imageActive ? ' actif' : ''}" data-image="${im.id}" src="${im.src}" alt="${echapper(im.titre || '')}" title="${echapper(im.macro ? 'Macro : ' + im.macro : (im.titre || ''))}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${im.transparentBlanc ? 'mix-blend-mode:multiply;' : ''}">`;
  }
  if (f.filtre) {
    const flt = f.filtre, r = flt.r1, h = hauteurLig(r);
    for (let c = flt.c1; c <= flt.c2 && h; c++) {
      if (!largeurCol(c) || zoneObjet({ de: { r, c } }, z) !== quoi) continue;
      const actif = !!flt.criteres[c], t = Math.min(18, h - 2);
      html += `<button class="bouton-filtre${actif ? ' actif' : ''}" data-filtre-col="${c}" title="${actif ? 'Filtre actif — ' : ''}Trier et filtrer" style="left:${xCols[c + 1] - t - 2}px;top:${yLigs[r] + (h - t) / 2}px;width:${t}px;height:${t}px">${actif ? '⧩' : '▾'}</button>`;
    }
  }
  for (const b of f.boutons || []) {
    if (zoneObjet(b, z) !== quoi) continue;
    const r = rectObjet(b);
    html += `<button class="bouton-macro${b.forme ? ' forme' : ''}" data-bouton="${b.id}" title="Macro : ${echapper(b.macro || '(aucune)')} — clic droit pour modifier" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${b.fond ? 'background:' + b.fond + ';' : ''}">${echapper(b.texte || 'Bouton')}</button>`;
  }
  return html;
}
// Les objets (boutons, images, graphiques) sont posés sur la feuille ou, quand ils sont dans les volets figés, sur les volets
function surObjets(type, fn, capture) { cellulesDiv.addEventListener(type, fn, capture); $('volets').addEventListener(type, fn, capture); }
// Pose une image (repère de la grille, en pixels) : ancrée à la cellule sous son coin haut-gauche
function placerImage(im, x, y, w, h) {
  const c = indexDepuis(xCols, x), r = indexDepuis(yLigs, y);
  const z = Z();
  im.de = { c, dx: Math.round((x - xCols[c]) / z), r, dy: Math.round((y - yLigs[r]) / z) };
  delete im.a; im.w = Math.round(w / z); im.h = Math.round(h / z);
}
function objetSelectionne() {
  if (graphiqueActif) { const o = feuille().graphiques.find((x) => x.id === graphiqueActif); if (o) return { genre: 'graphique', o }; }
  if (imageActive) { const o = feuille().images.find((x) => x.id === imageActive); if (o) return { genre: 'image', o }; }
  return null;
}
const refNomFeuille = (nom) => (/^[A-Za-z_][\w.]*$/.test(nom) ? nom : "'" + nom.replace(/'/g, "''") + "'");
/** Ctrl+C / Ctrl+X sur un graphique ou une image : renvoie vrai si un objet était choisi. */
function copierObjet(couper) {
  const sel = objetSelectionne();
  if (!sel) return false;
  const objet = JSON.parse(JSON.stringify(sel.o));
  if (sel.genre === 'image') { const r = rectObjet(sel.o); objet.w = r.w; objet.h = r.h; delete objet.a; }
  pressePapierObjet = { genre: sel.genre, objet, classeur, feuilleNom: feuille().nom };
  pressePapier = null;
  if (couper) {
    memoriser();
    const liste = sel.genre === 'graphique' ? 'graphiques' : 'images';
    feuille()[liste] = feuille()[liste].filter((x) => x !== sel.o);
    graphiqueActif = null; imageActive = null;
    classeur.version++; sauvegarderLocal();
  }
  toast((sel.genre === 'graphique' ? 'Graphique' : 'Image') + (couper ? ' coupé' : ' copié') + (sel.genre === 'image' ? 'e' : '') + ' : choisissez une cellule puis Ctrl+V');
  rendre();
  return true;
}
/** Ctrl+V : le graphique ou l'image copié est posé avec son coin haut-gauche sur la cellule active. */
function collerObjet() {
  const p = pressePapierObjet;
  if (!p) return false;
  memoriser();
  const o = JSON.parse(JSON.stringify(p.objet));
  o.id = (p.genre === 'graphique' ? 'g' : 'i') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const x = xCols[curseur.c], y = yLigs[curseur.r];
  if (p.genre === 'graphique') {
    o.x = x / Z(); o.y = y / Z();
    // Collé sur une autre feuille du même classeur : il garde ses données d'origine
    if (p.classeur === classeur && p.feuilleNom !== feuille().nom && !String(o.plage || '').includes('!')) o.plage = refNomFeuille(p.feuilleNom) + '!' + o.plage;
    feuille().graphiques.push(o); graphiqueActif = o.id; imageActive = null;
  } else {
    placerImage(o, x, y, o.w || 120, o.h || 90);
    feuille().images.push(o); imageActive = o.id; graphiqueActif = null;
  }
  classeur.version++; sauvegarderLocal(); rendre();
  return true;
}
/** Flèches sur un objet choisi : il se déplace (Maj : d'un pixel). */
function deplacerObjet(dx, dy) {
  const sel = objetSelectionne();
  if (!sel) return false;
  if (sel.genre === 'graphique') { sel.o.x = Math.max(0, sel.o.x + dx); sel.o.y = Math.max(0, sel.o.y + dy); }
  else { const r = rectObjet(sel.o); placerImage(sel.o, Math.max(0, r.x + dx), Math.max(0, r.y + dy), r.w, r.h); }
  classeur.version++; sauvegarderLocal(); rendre();
  return true;
}
function supprimerObjet() {
  const sel = objetSelectionne();
  if (!sel) return false;
  memoriser();
  const liste = sel.genre === 'graphique' ? 'graphiques' : 'images';
  feuille()[liste] = feuille()[liste].filter((x) => x !== sel.o);
  graphiqueActif = null; imageActive = null;
  classeur.version++; sauvegarderLocal(); rendre();
  return true;
}
function objetDepuis(el) {
  const b = el.closest('[data-bouton]'), im = el.closest('[data-image]');
  if (b) return { genre: 'bouton', o: feuille().boutons.find((x) => x.id === b.dataset.bouton) };
  if (im) return { genre: 'image', o: feuille().images.find((x) => x.id === im.dataset.image) };
  return null;
}
surObjets('mousedown', (e) => {
  const t = objetDepuis(e.target);
  if (!t || !t.o) return;
  e.stopPropagation(); if (e.button === 0) e.preventDefault();
  // Une image se choisit et se déplace (celle qui lance une macro : Ctrl+clic, comme dans Excel)
  if (t.genre === 'image' && e.button === 0 && (!t.o.macro || e.ctrlKey || e.metaKey || imageActive === t.o.id)) {
    if (edition) validerEdition();
    graphiqueActif = null; imageActive = t.o.id; conteneur.focus();
    const r = rectObjet(t.o);
    memoriser();
    glisse = { mode: 'image', g: t.o, x0: e.clientX, y0: e.clientY, x: r.x, y: r.y, w: r.w, h: r.h };
    rendre();
  }
}, true);
surObjets('click', (e) => {
  const t = objetDepuis(e.target);
  if (!t || !t.o || !t.o.macro) return;
  if (t.genre === 'image' && (imageActive === t.o.id || e.ctrlKey || e.metaKey)) { e.stopPropagation(); return; }
  e.stopPropagation();
  lancerMacro(t.o.macro, { depuisBouton: true });
});
surObjets('contextmenu', (e) => {
  const t = objetDepuis(e.target);
  if (!t || !t.o) return;
  e.preventDefault(); e.stopPropagation();
  const o = t.o, liste = t.genre === 'bouton' ? feuille().boutons : feuille().images;
  const items = [];
  if (t.genre === 'image') { graphiqueActif = null; imageActive = o.id; rendre(); items.push(['Couper', () => copier(true), 'Ctrl+X'], ['Copier', () => copier(false), 'Ctrl+C'], null); }
  if (t.genre === 'bouton') items.push(['Modifier le texte…', () => { const x = prompt('Texte du bouton :', o.texte); if (x !== null) { o.texte = x; sauvegarderLocal(); rendre(); } }]);
  items.push(['Affecter une macro…', () => { const x = choisirMacro(o.macro); if (x !== null) { o.macro = x; sauvegarderLocal(); rendre(); } }]);
  if (o.macro) items.push(['Exécuter « ' + o.macro + ' »', () => lancerMacro(o.macro, { depuisBouton: true })]);
  items.push(['Placer sur la sélection', () => { const s2 = selectionNormalisee(); o.de = { c: s2.c1, dx: 2, r: s2.r1, dy: 2 }; o.a = { c: s2.c2 + 1, dx: -2, r: s2.r2 + 1, dy: -2 }; delete o.w; delete o.h; sauvegarderLocal(); rendre(); }]);
  items.push(null, ['Supprimer', () => { liste.splice(liste.indexOf(o), 1); sauvegarderLocal(); rendre(); }]);
  ouvrirMenu(e.clientX, e.clientY, items);
}, true);
function choisirMacro(actuelle) {
  const subs = classeur.vba ? classeur.vba.listerProcedures() : [];
  const x = prompt('Macro à lancer' + (subs.length ? ' (' + subs.join(', ') + ')' : ' (écrivez d\'abord une Sub dans l\'éditeur VBA)') + ' :', actuelle || subs[0] || '');
  return x === null ? null : x.trim();
}
function insererBouton() {
  const macro = choisirMacro('');
  if (macro === null) return;
  const texte = prompt('Texte du bouton :', macro || 'Bouton');
  if (texte === null) return;
  const s2 = selectionNormalisee();
  const plusieurs = s2.r1 !== s2.r2 || s2.c1 !== s2.c2;
  feuille().boutons.push({ id: 'b' + Date.now().toString(36), texte, macro, de: { c: s2.c1, dx: 2, r: s2.r1, dy: 2 }, ...(plusieurs ? { a: { c: s2.c2 + 1, dx: -2, r: s2.r2 + 1, dy: -2 } } : { w: Math.max(90, texte.length * 8 + 20), h: 26 }) });
  sauvegarderLocal(); rendre();
}

// ----- Graphiques -----
// Données d'un graphique : sa plage peut désigner une autre feuille (« Données!A1:C9 », graphiques venus d'Excel)
// Un module vide (Module1 créé à l'ouverture de l'éditeur) ne fait pas un classeur à macros
function aDesMacros(c) { return !!c.vbaBrut || c.modulesVBA().some((m) => (m.code || '').trim()); }
function donneesGraphique(f, plage) { return matriceGraphique(classeur, f, plage); }
function rendreGraphiques(f) { const z = zoneFigee(); return uiG.rendreSurFeuille(f, z.r || z.c ? (g) => zoneGraphique(g, z) === '' : null, Z()); }
function creerGraphique() { uiG.ouvrirGalerie(); }
const uiG = installerGraphiques({
  feuille: () => feuille(),
  donnees: (f, plage) => donneesGraphique(f, plage),
  selection: () => selectionBornee(),
  adresse: (r, c) => adresse(r, c),
  plageValide: (t) => !!plageDepuisTexte(String(t).replace(/\$/g, '').replace(/^.*!/, '').trim()),
  position: (s2) => ({ x: (xCols[Math.min(s2.c2 + 1, nbColonnes - 1)] + 10) / Z(), y: yLigs[s2.r1] / Z() }),
  rendre: () => rendre(),
  sauvegarder: () => { classeur.version++; sauvegarderLocal(); },
  toast: (m, e) => toast(m, e),
  ouvrirPanneau: (nom) => ouvrirPanneau(nom),
  panneauOuvert: (nom) => panneauCourant === nom && !$('panneau').hidden,
  actif: () => graphiqueActif,
  activer: (id) => { graphiqueActif = id; },
});
const uiD = installerDonnees({
  classeur: () => classeur, fi: () => fi(), feuille: () => feuille(),
  selection: () => selectionNormalisee(), curseur: () => curseur,
  selectionner: (p, cur) => { selection = { r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2 }; curseur = cur || { r: p.r1, c: p.c1 }; },
  allerA: (i, r, c) => { if (i !== fi()) { memoriserVue(); activerFeuille(i); } placerCurseur(r, c); },
  rendre: () => rendre(), sauvegarder: () => sauvegarderLocal(), memoriser: (perm) => memoriser(perm), toast: (m, e) => toast(m, e),
  ouvrirMenu: (x, y, items) => ouvrirMenu(x, y, items),
  ouvrirPanneau: (nom) => ouvrirPanneau(nom), panneauOuvert: (nom) => panneauCourant === nom && !$('panneau').hidden,
  commencerEdition: (t) => { conteneur.focus(); commencerEdition(t); },
});
const uiT = installerTCD({
  classeur: () => classeur, fi: () => fi(), feuille: () => feuille(), selection: () => selectionNormalisee(), curseur: () => curseur,
  selectionner: (p) => { selection = { ...p }; curseur = { r: p.r1, c: p.c1 }; },
  activerFeuille: (i) => { memoriserVue(); activerFeuille(i); },
  nouvelleFeuille: (base) => { let n = base, i = 1; while (classeur.indexFeuille(n) >= 0) n = base + (++i); memoriserVue(); classeur.ajouterFeuille(n, fi() + 1); return classeur.indexFeuille(n); },
  rendre: () => rendre(), sauvegarder: () => sauvegarderLocal(), memoriser: (perm) => memoriser(perm), toast: (m, e) => toast(m, e),
  ouvrirPanneau: (nom) => ouvrirPanneau(nom), panneauOuvert: (nom) => panneauCourant === nom && !$('panneau').hidden,
});
const uiB = installerDialogues({
  classeur: () => classeur, fi: () => fi(), feuille: () => feuille(), selection: () => selectionNormalisee(), selectionBornee: () => selectionBornee(), curseur: () => curseur,
  selectionner: (p, cur) => { selection = { ...p }; curseur = cur || { r: p.r1, c: p.c1 }; },
  memoriser: (perm) => memoriser(perm), rendre: () => rendre(), sauvegarder: () => sauvegarderLocal(), toast: (m, e) => toast(m, e),
  hacher: (m) => hacherMotDePasse(m), verifierSha: (m, x) => verifierShaMotDePasse(m, x, { 'SHA-512': sha512, 'SHA-384': sha384, 'SHA-256': sha256, 'SHA-1': sha1 }), droits: DROITS,
  pressePapier: () => pressePapier, allerA: (t) => allerA(t), focusGrille: () => conteneur.focus({ preventScroll: true }),
  surSelection: (cb) => { const s = selectionBornee(); for (let r = s.r1; r <= Math.max(s.r2, s.r1); r++) for (let c = s.c1; c <= Math.max(s.c2, s.c1); c++) cb(r, c); },
  appliquerBordures: (mode, style) => appliquerBordures(mode, style, false),
  selectionFusionnee: () => { const s = selectionNormalisee(); return feuille().fusions.some((m) => m.r1 === s.r1 && m.c1 === s.c1); },
  fusionner: (oui) => fusionnerSelection(oui, false),
  lignesColonnes: (inserer, axe) => lignesColonnes(inserer, axe),
});
const uiA = installerAnalyse({
  classeur: () => classeur, fi: () => fi(), feuille: () => feuille(), selection: () => selectionNormalisee(), selectionBornee: () => selectionBornee(), curseur: () => curseur,
  selectionner: (p, cur) => { selection = { r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2 }; curseur = cur || { r: p.r1, c: p.c1 }; },
  allerA: (i, r, c) => { if (i !== fi()) { memoriserVue(); activerFeuille(i); } placerCurseur(r, c); },
  rendre: () => rendre(), sauvegarder: () => sauvegarderLocal(), memoriser: (perm) => memoriser(perm), toast: (m, e) => toast(m, e),
  ouvrirPanneau: (nom) => ouvrirPanneau(nom), panneauOuvert: (nom) => panneauCourant === nom && !$('panneau').hidden,
  dialogue: (titre, html, ok, opts) => uiB.ouvrir(titre, html, ok, opts),
});
const uiP = installerImpression({
  classeur: () => classeur, fi: () => fi(), feuille: () => feuille(), selectionBornee: () => selectionBornee(),
  memoriser: (perm) => memoriser(perm), sauvegarder: () => sauvegarderLocal(), rendre: () => rendre(), toast: (m, e) => toast(m, e),
  dialogue: (titre, html, ok, opts) => uiB.ouvrir(titre, html, ok, opts),
  styleCellule: (F, r, c) => (classeur.feuilles[F].mfc && classeur.feuilles[F].mfc.length ? styleConditionnel(classeur, F, r, c) : null),
  // Graphiques et images de la feuille, en pixels (repère des colonnes et lignes de cette feuille)
  objets: (f) => {
    const X = (c) => { let x = 0; for (let k = 0; k < c; k++) x += f.largeurs[k] === undefined ? LARGEUR_DEFAUT : f.largeurs[k]; return x; };
    const Y = (r) => { let y = 0; for (let k = 0; k < r; k++) y += f.filtrees && f.filtrees.has(k) ? 0 : f.hauteurs[k] === undefined ? HAUTEUR_DEFAUT : f.hauteurs[k]; return y; };
    const out = [];
    for (const g of f.graphiques || []) { try { normaliserGraphique(g); out.push({ x: g.x, y: g.y, w: g.w, h: g.h, html: rendreGraphiqueSVG(g, donneesGraphique(f, g.plage), g.w, g.h, {}) }); } catch (e) { console.warn(e); } }
    for (const im of f.images || []) {
      const x1 = X(im.de.c) + (im.de.dx || 0), y1 = Y(im.de.r) + (im.de.dy || 0);
      const x2 = im.a ? X(im.a.c) + (im.a.dx || 0) : x1 + (im.w || 80), y2 = im.a ? Y(im.a.r) + (im.a.dy || 0) : y1 + (im.h || 24);
      out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, html: `<img src="${im.src}" style="width:100%;height:100%;${im.transparentBlanc ? 'mix-blend-mode:multiply;' : ''}">` });
    }
    return out;
  },
});
// Bouton ▾ d'un en-tête de filtre
surObjets('mousedown', (e) => {
  const b = e.target.closest('[data-filtre-col]');
  if (!b) return;
  e.stopPropagation(); e.preventDefault();
  if (edition) validerEdition();
  uiD.ouvrirFiltre(+b.dataset.filtreCol, b);
}, true);
function modifierTitreGraphique(g, zone, el) {
  if (edition) validerEdition();
  document.querySelectorAll('.titre-en-cours').forEach((x) => x.remove());
  const r = el.getBoundingClientRect(), vertical = r.height > r.width * 1.5;
  const champ = document.createElement('input');
  champ.className = 'titre-en-cours';
  champ.value = g[zone] || '';
  champ.placeholder = zone === 'titre' ? 'Titre du graphique' : 'Titre de l\'axe';
  const w = Math.max(180, (vertical ? r.height : r.width) + 60), h = Math.max(26, (vertical ? r.width : r.height) + 8);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  Object.assign(champ.style, { left: Math.max(4, Math.min(window.innerWidth - w - 4, cx - w / 2)) + 'px', top: Math.max(4, cy - h / 2) + 'px', width: w + 'px', height: h + 'px', fontSize: zone === 'titre' ? '15px' : '12px', fontWeight: zone === 'titre' ? '600' : '400' });
  document.body.appendChild(champ);
  champ.focus(); champ.select();
  let fini = false;
  const terminer = (garder) => {
    if (fini) return; fini = true;
    if (garder && champ.value !== (g[zone] || '')) { memoriser(); if (champ.value.trim()) g[zone] = champ.value; else delete g[zone]; classeur.version++; sauvegarderLocal(); }
    champ.remove(); rendre(); conteneur.focus({ preventScroll: true });
  };
  champ.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); terminer(true); } else if (ev.key === 'Escape') { ev.preventDefault(); terminer(false); } });
  champ.addEventListener('blur', () => terminer(true));
}
function graphiqueDepuis(el) { const div = el.closest('.graphique'); if (!div) return null; return { div, g: feuille().graphiques.find((x) => x.id === div.dataset.id) }; }
surObjets('mousedown', (e) => {
  const trouve = graphiqueDepuis(e.target);
  if (!trouve || !trouve.g) return;
  e.stopPropagation();
  const { g } = trouve;
  // Graphique déjà choisi : un clic sur son titre (ou un titre d'axe) l'écrit directement, comme une zone de texte
  const zoneTexte = e.target.closest && e.target.closest('[data-zone]');
  if (zoneTexte && graphiqueActif === g.id && e.button === 0) { e.preventDefault(); modifierTitreGraphique(g, zoneTexte.dataset.zone, zoneTexte); return; }
  graphiqueActif = g.id;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  conteneur.focus();
  imageActive = null;
  if (edition) validerEdition();
  memoriser('objets');
  if (e.target.classList.contains('graphique-redim')) glisse = { mode: 'graphique-redim', g, x0: e.clientX, y0: e.clientY, w: g.w, h: g.h };
  else glisse = { mode: 'graphique', g, x0: e.clientX, y0: e.clientY, x: g.x * Z(), y: g.y * Z() };
  rendre();
});
surObjets('click', (e) => {
  const trouve = graphiqueDepuis(e.target);
  if (!trouve || !trouve.g) return;
  if (e.target.classList.contains('graphique-suppr')) uiG.supprimer(trouve.g);
  else if (e.target.classList.contains('graphique-reglages')) uiG.ouvrirParametres(trouve.g);
});
surObjets('dblclick', (e) => {
  const trouve = graphiqueDepuis(e.target);
  if (!trouve || !trouve.g) return;
  e.stopPropagation();
  if (e.target.closest && e.target.closest('[data-zone]')) return;
  uiG.ouvrirParametres(trouve.g);
});
surObjets('contextmenu', (e) => {
  const trouve = graphiqueDepuis(e.target);
  if (!trouve || !trouve.g) return;
  e.preventDefault(); e.stopPropagation();
  const g = trouve.g;
  graphiqueActif = g.id; rendre();
  ouvrirMenu(e.clientX, e.clientY, [
    ['Couper', () => copier(true), 'Ctrl+X'], ['Copier', () => copier(false), 'Ctrl+C'], null,
    ['Modifier le titre', () => { rendre(); setTimeout(() => { const el = document.querySelector('.graphique[data-id="' + g.id + '"] [data-zone="titre"]'); if (el) modifierTitreGraphique(g, 'titre', el); }, 30); }],
    ['Paramètres du graphique…', () => uiG.ouvrirParametres(g)],
    ['Télécharger en image (PNG)', () => uiG.exporter(g, 'png')],
    ['Télécharger en SVG', () => uiG.exporter(g, 'svg')],
    null,
    ['Supprimer le graphique', () => uiG.supprimer(g)],
  ]);
}, true);

// Un nombre trop large pour sa cellule : moins de chiffres significatifs, sinon « ##### » comme Excel.
function ajusterNombre(v, z, largeur, s) {
  if (!z || z === 'General') {
    for (let k = 14; k >= 1; k--) { const t = afficherValeur(parseFloat(v.toPrecision(k)), null); if (largeurTexte(t, s) <= largeur) return t; }
    for (let k = 6; k >= 0; k--) { const e = v.toExponential(k).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-'); if (largeurTexte(e, s) <= largeur) return e; }
  }
  return '#'.repeat(Math.max(1, Math.floor(largeur / largeurTexte('#', s))));
}

function echapper(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function rectPlage(r1, c1, r2, c2) {
  const R1 = Math.min(r1, r2), R2 = Math.max(r1, r2), C1 = Math.min(c1, c2), C2 = Math.max(c1, c2);
  const z = zoneFigee();
  // Position à l'écran sur un axe (volets figés compris), coupée au bord des en-têtes / des volets, ramenée dans le repère du contenu
  const axe = (i1, i2, tab, n, fige, F, s) => {
    const a = tab[Math.min(i1, n)], b = tab[Math.min(i2 + 1, n)];
    const va = i1 < fige ? a : Math.max(a - s, F);
    let vb = i2 < fige ? b : b - s;
    if (i1 < fige && i2 >= fige) vb = Math.max(vb, F);
    return [va + s, Math.max(vb, va) + s];
  };
  const [x1, x2] = axe(C1, C2, xCols, nbColonnes, z.c, z.FW, conteneur.scrollLeft);
  const [y1, y2] = axe(R1, R2, yLigs, nbLignes, z.r, z.FH, conteneur.scrollTop);
  return { left: LARGEUR_ENTETE + x1, top: HAUTEUR_DEFAUT + y1, width: x2 - x1, height: y2 - y1 };
}
function poser(el, rect) { el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px'; el.style.width = rect.width + 'px'; el.style.height = rect.height + 'px'; el.style.visibility = rect.width > 0 && rect.height > 0 ? '' : 'hidden'; }

function positionnerSelection() {
  const multi = selection.r1 !== selection.r2 || selection.c1 !== selection.c2;
  selDiv.style.display = multi ? 'block' : 'none';
  if (multi) poser(selDiv, rectPlage(selection.r1, selection.c1, selection.r2, selection.c2));
  const rc = rectPlage(curseur.r, curseur.c, curseur.r, curseur.c);
  const fus = feuille().fusions.find((m) => curseur.r >= m.r1 && curseur.r <= m.r2 && curseur.c >= m.c1 && curseur.c <= m.c2);
  if (fus) poser(cursDiv, rectPlage(fus.r1, fus.c1, fus.r2, fus.c2)); else poser(cursDiv, rc);
  const bas = multi ? rectPlage(selection.r1, selection.c1, selection.r2, selection.c2) : rc;
  poignee.style.left = (bas.left + bas.width - 4) + 'px'; poignee.style.top = (bas.top + bas.height - 4) + 'px'; poignee.style.visibility = bas.width > 0 && bas.height > 0 ? '' : 'hidden';
  if (pressePapier && pressePapier.feuille === feuille() && !pressePapier.colle) { $('plage-copie').hidden = false; poser($('plage-copie'), rectPlage(pressePapier.r1, pressePapier.c1, pressePapier.r2, pressePapier.c2)); }
  else $('plage-copie').hidden = true;
  // Débordement d'une formule (tableau dynamique) : cadre bleu, et la formule d'origine grisée dans la barre
  const zd = classeur.evaluateur.zoneDe(fi(), curseur.r, curseur.c), cadre = $('zone-debord');
  cadre.hidden = !zd || !!edition;
  if (zd && !edition) poser(cadre, rectPlage(zd.r, zd.c, zd.r + zd.h - 1, zd.c + zd.w - 1));
  const fantome = !!zd && (zd.r !== curseur.r || zd.c !== curseur.c) && !feuille().get(curseur.r, curseur.c)?.v;
  barre.classList.toggle('fantome', fantome && !edition);
  if (!edition) { zoneNom.value = multi ? adresse(Math.min(selection.r1, selection.r2), Math.min(selection.c1, selection.c2)) + ':' + adresse(Math.max(selection.r1, selection.r2), Math.max(selection.c1, selection.c2)) : adresse(curseur.r, curseur.c); barre.value = fantome ? classeur.saisie(fi(), zd.r, zd.c) : saisieAffichee(curseur.r, curseur.c); }
  for (const el of refsColorees) el.remove(); refsColorees = [];
  if (edition) colorerReferences();
  // Validation : flèche de la liste déroulante et message de saisie de la cellule active
  const dv = validationDe(feuille(), curseur.r, curseur.c);
  const fleche = $('fleche-liste'), msgDv = $('message-validation');
  const voir = (el, oui) => { el.hidden = !oui; };
  voir(fleche, !!(dv && dv.type === 'liste' && dv.fleche !== false && !edition && rc.width > 0 && rc.height > 0));
  if (!fleche.hidden) { fleche.style.left = (rc.left + rc.width + 1) + 'px'; fleche.style.top = rc.top + 'px'; fleche.style.height = rc.height + 'px'; }
  voir(msgDv, !!(dv && dv.message && (dv.message.titre || dv.message.texte) && rc.width > 0 && rc.height > 0));
  if (!msgDv.hidden) { msgDv.innerHTML = (dv.message.titre ? '<b>' + echapper(dv.message.titre) + '</b>' : '') + echapper(dv.message.texte || ''); msgDv.style.left = (rc.left + 12) + 'px'; msgDv.style.top = (rc.top + rc.height + 4) + 'px'; }
  const celActive = feuille().get(curseur.r, curseur.c), puce = $('puce-lien');
  voir(puce, !!(celActive && celActive.lien && !edition && rc.width > 0 && rc.height > 0));
  if (!puce.hidden) { puce.style.left = (rc.left + rc.width + (fleche.hidden ? 1 : 20)) + 'px'; puce.style.top = rc.top + 'px'; puce.style.height = rc.height + 'px'; puce.title = 'Ouvrir ' + celActive.lien; }
  uiD.curseurChange(); uiT.curseurChange();
  // Boutons de style
  const cel = feuille().get(curseur.r, curseur.c), s = (cel && cel.s) || {};
  $('btn-gras').classList.toggle('actif', !!s.gras); $('btn-italique').classList.toggle('actif', !!s.italique); $('btn-souligne').classList.toggle('actif', !!s.souligne);
  $('btn-renvoi').classList.toggle('actif', !!s.renvoi); $('btn-filtrer').classList.toggle('actif', !!feuille().filtre); $('btn-figer').classList.toggle('actif', !!feuille().figer);
  { const t = String(s.taille || 13), sel = $('taille-police'); if (![...sel.options].some((o) => o.value === t)) { const o = document.createElement('option'); o.value = t; o.textContent = Math.round(+t * 0.75 * 2) / 2; sel.appendChild(o); } sel.value = t; }
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
    if (f.couleur) o.style.boxShadow = 'inset 0 -3px 0 ' + f.couleur;
    o.dataset.i = i;
    o.addEventListener('click', () => { if (i !== fi()) { memoriserVue(); activerFeuille(i); } conteneur.focus({ preventScroll: true }); });
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
    // Comme Excel : les lignes masquées par un filtre ne comptent pas
    const filtrees = feuille().filtrees;
    for (let r = R1; r <= R2; r++) { if (filtrees && filtrees.has(r)) continue; for (let c = C1; c <= C2; c++) { const cel = feuille().get(r, c); if (!cel) continue; const v = classeur.valeur(fi(), r, c); if (v == null || v === '') continue; nb++; if (typeof v === 'number') { somme += v; nbNum++; } } }
  }
  const fmt = (x) => afficherValeur(Math.round(x * 1e10) / 1e10);
  $('statut').textContent = nbNum ? `Somme : ${fmt(somme)}   Moyenne : ${fmt(somme / nbNum)}   Nb : ${nb}` : (nb ? `Nb : ${nb}` : (classeur.nomFichier || ''));
  $('zoom-valeur').textContent = Math.round(Z() * 100) + ' %';
  $('ind-protection').hidden = !feuilleProtegee();
  $('ind-calcul').hidden = !classeur.calculManuel;
}

// ---------------------------------------------------------------------------
// Sélection et navigation
// ---------------------------------------------------------------------------

function placerCurseur(r, c, etendre = false) {
  r = Math.max(0, r); c = Math.max(0, c);
  // Les lignes et colonnes masquées (ou filtrées) sont sautées, dans le sens du déplacement
  const depart = etendre ? { r: selection.r2, c: selection.c2 } : curseur;
  const sauter = (i, avant, taille) => { if (taille(i)) return i; const d = i >= avant ? 1 : -1; let j = i; while (j >= 0 && j < i + 5000 && !taille(j)) j += d; if (j < 0) { j = i; while (!taille(j) && j < i + 5000) j++; } return j; };
  r = sauter(r, depart.r, hauteurLig); c = sauter(c, depart.c, largeurCol);
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
  const z = zoneFigee();
  // Une cellule des volets figés est toujours visible ; les autres doivent sortir de dessous les volets
  if (c >= z.c) {
    if (x - z.FW < conteneur.scrollLeft) conteneur.scrollLeft = x - z.FW;
    else if (x + largeurCol(c) > conteneur.scrollLeft + W) conteneur.scrollLeft = x + largeurCol(c) - W;
  }
  if (r >= z.r) {
    if (y - z.FH < conteneur.scrollTop) conteneur.scrollTop = y - z.FH;
    else if (y + hauteurLig(r) > conteneur.scrollTop + H) conteneur.scrollTop = y + hauteurLig(r) - H;
  }
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
  return { fi: fi(), nom: f.nom, cells, largeurs: { ...f.largeurs }, hauteurs: { ...f.hauteurs }, fusions: f.fusions.map((m) => ({ ...m })), graphiques: f.graphiques.map((g) => ({ ...g })), boutons: f.boutons.map((b) => ({ ...b })), images: f.images.map((im) => ({ ...im, de: im.de && { ...im.de }, a: im.a && { ...im.a } })), noms: new Map([...classeur.noms].map(([k, v]) => [k, { ...v }])),
    figer: f.figer ? { ...f.figer } : null, mfc: JSON.parse(JSON.stringify(f.mfc || [])), filtre: f.filtre ? JSON.parse(JSON.stringify(f.filtre)) : null, filtrees: new Set(f.filtrees || []),
    validations: JSON.parse(JSON.stringify(f.validations || [])), tcd: JSON.parse(JSON.stringify(f.tcd || [])),
    extra: Object.fromEntries(PROPRIETES_FEUILLE.map((k) => [k, f[k] === undefined ? undefined : JSON.parse(JSON.stringify(f[k]))])) };
}
// ----- Feuille protégée : toute modification passe par memoriser(), qui la refuse si elle n'est pas permise -----
class ErreurProtection extends Error {}
let permission = null; // ce que l'action en cours modifie : 'cellules' (déverrouillées), 'formatCellules', 'insererLignes'…
function feuilleProtegee(f = feuille()) { const p = f && f.protection; return p && p.active ? p : null; }
function verrouillee(r, c, f = feuille()) { const cel = f.get(r, c); return !(cel && cel.s && cel.s.deverrouille); }
function plageVerrouillee(s, f = feuille()) {
  if (!feuilleProtegee(f)) return false;
  if ((s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1) > 200000) return true;
  for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) if (verrouillee(r, c, f)) return true;
  return false;
}
function avec(perm, fn) { const av = permission; permission = perm; try { return fn(); } finally { permission = av; } }
function signalerProtection() { toast('Feuille protégée : modification impossible ici. Pour la permettre : menu … › Révision › Ôter la protection.', true); }
window.addEventListener('error', (e) => { if (e.error instanceof ErreurProtection) { e.preventDefault(); signalerProtection(); } });
window.addEventListener('unhandledrejection', (e) => { if (e.reason instanceof ErreurProtection) { e.preventDefault(); signalerProtection(); } });
function memoriser(perm = permission) {
  const p = feuilleProtegee();
  if (p && !macroEnCours) {
    const a = p.autoriser || {};
    if (!(perm === 'cellules' || perm === 'affichage' || (perm && a[perm]))) throw new ErreurProtection('feuille protégée');
  }
  historique.push(instantane()); if (historique.length > 100) historique.shift(); futur = [];
}
function restaurer(s) {
  const f = classeur.feuilles[s.fi]; if (!f) return;
  f.cellules = s.cells; f.largeurs = s.largeurs; f.hauteurs = s.hauteurs; f.fusions = s.fusions; f.graphiques = s.graphiques; f.boutons = s.boutons; if (s.images) f.images = s.images; f.recalculerZone();
  if ('mfc' in s) { f.figer = s.figer; f.mfc = s.mfc; f.filtre = s.filtre; f.filtrees = s.filtrees; }
  if ('tcd' in s) { f.validations = s.validations; f.tcd = s.tcd; }
  if (s.extra) for (const k of PROPRIETES_FEUILLE) f[k] = s.extra[k] === undefined ? (k === 'tableaux' ? [] : undefined) : s.extra[k];
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
  if (feuilleProtegee() && verrouillee(r, c)) { if (origine === 'barre') barre.blur(); return signalerProtection(); }
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
  fermerSuggestions();
  const { r, c, origine } = edition;
  const texte = origine === 'barre' ? barre.value : editeur.value;
  edition = null;
  editeur.hidden = true;
  const ancien = saisieAffichee(r, c);
  if (texte !== ancien) {
    memoriser(verrouillee(r, c) ? null : 'cellules');
    const avant = feuille().get(r, c);
    const copie = avant ? { ...avant } : null;
    try { classeur.saisir(fi(), r, c, texte); } catch (e) { toast(e.message, true); }
    if (fleches.length) fleches = [];
    // Tableau structuré : il s'agrandit si on écrit juste à côté ; une formule devient une colonne calculée
    if (texte !== '') { try { classeur.etendreTableau(fi(), r, c); if (classeur.colonneCalculee(fi(), r, c)) toast('Colonne calculée : formule recopiée dans tout le tableau'); } catch (e) { console.warn(e); } }
    // Validation des données : une saisie refusée est retirée et on la propose de nouveau
    if (!uiD.validation.controlerSaisie(r, c)) {
      feuille().set(r, c, copie); feuille().recalculerZone(); classeur.modifie(); historique.pop();
      curseur = { r, c }; selection = { r1: r, c1: c, r2: r, c2: c };
      rendre();
      commencerEdition(texte);
      return;
    }
    sauvegarderLocal();
  }
  conteneur.focus();
  if (mouvement) { if (suivantDansSelection(mouvement.dr || 0, mouvement.dc || 0)) return; placerCurseur(r + (mouvement.dr || 0), c + (mouvement.dc || 0)); } else rendre();
}
// Ctrl+Entrée : la saisie va dans toute la sélection (formules décalées comme une recopie)
function remplirSelection() {
  if (!edition) return;
  const texte = edition.origine === 'barre' ? barre.value : editeur.value;
  const { r, c } = edition;
  fermerSuggestions(); edition = null; editeur.hidden = true;
  const n = selectionNormalisee(), s = { r1: n.r1, c1: n.c1, r2: Math.min(n.r2, n.r1 + 5000), c2: Math.min(n.c2, n.c1 + 200) };
  memoriser(plageVerrouillee(s) ? null : 'cellules');
  const sel = s.r1 === s.r2 && s.c1 === s.c2 ? { r1: r, c1: c, r2: r, c2: c } : s;
  for (let i = sel.r1; i <= sel.r2; i++) for (let j = sel.c1; j <= sel.c2; j++) classeur.saisir(fi(), i, j, texte.startsWith('=') ? decalerFormule(texte, i - r, j - c) : texte);
  sauvegarderLocal(); conteneur.focus(); rendre();
}
function annulerEdition() {
  if (!edition) return;
  fermerSuggestions();
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
  if (copierObjet(couper)) return;
  pressePapierObjet = null;
  const s = selectionBornee();
  const texte = texteSelection();
  pressePapier = { classeur, feuille: feuille(), ...s, couper, texte, systeme: false };
  try { await navigator.clipboard.writeText(texte); pressePapier.systeme = true; } catch { /* presse-papiers système indisponible (mobile, permissions) */ }
  rendre();
}
async function coller(texteSysteme) {
  if (pressePapierObjet && texteSysteme === undefined && collerObjet()) return;
  let texte = texteSysteme;
  if (texte === undefined) {
    // Le navigateur peut attendre indéfiniment une autorisation (mobile) : on n'attend pas plus d'une demi-seconde
    if (pressePapier && !pressePapier.systeme) texte = null;
    else {
      try { texte = await Promise.race([navigator.clipboard.readText(), new Promise((ok) => setTimeout(() => ok(null), 500))]); }
      catch { texte = null; }
    }
  }
  const dest = selectionNormalisee();
  if (feuilleProtegee()) {
    // Taille de ce qui est collé : la cible doit être entièrement déverrouillée
    const lignes = texte ? texte.replace(/\r?\n$/, '').split(/\r?\n/) : null;
    const h = pressePapier && !texte ? pressePapier.r2 - pressePapier.r1 : lignes ? lignes.length - 1 : 0, w = pressePapier && !texte ? pressePapier.c2 - pressePapier.c1 : lignes ? Math.max(...lignes.map((l) => l.split('\t').length)) - 1 : 0;
    memoriser(plageVerrouillee({ r1: dest.r1, c1: dest.c1, r2: Math.max(dest.r2, dest.r1 + h), c2: Math.max(dest.c2, dest.c1 + w) }) ? null : 'cellules');
  } else memoriser();
  // Copie interne prioritaire si le presse-papiers du système est vide, inaccessible ou n'a pas pu la recevoir
  if (pressePapier && (texte == null || texte === '' || !pressePapier.systeme || texte === pressePapier.texte || texte.replace(/\r/g, '') === pressePapier.texte)) {
    const src = pressePapier;
    const nl = src.r2 - src.r1 + 1, nc = src.c2 - src.c1 + 1;
    const repL = dest.r2 - dest.r1 + 1 >= nl && (dest.r2 - dest.r1 + 1) % nl === 0 ? (dest.r2 - dest.r1 + 1) / nl : 1;
    const repC = dest.c2 - dest.c1 + 1 >= nc && (dest.c2 - dest.c1 + 1) % nc === 0 ? (dest.c2 - dest.c1 + 1) / nc : 1;
    const srcF = src.feuille, srcC = src.classeur, srcFi = srcC.feuilles.indexOf(srcF);
    const autre = srcC !== classeur;   // copie d'un classeur vers un autre
    const bloc = [];
    for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) {
      const cel = srcF.get(r, c);
      // Valeur d'origine : sert de repli si la formule ne marche pas dans l'autre classeur (feuille ou nom absent)
      const v = autre && cel && cel.f != null && srcFi >= 0 ? srcC.valeur(srcFi, r, c) : undefined;
      bloc.push({ dr: r - src.r1, dc: c - src.c1, cel: cel ? { ...cel, s: cel.s ? { ...cel.s, bordures: cel.s.bordures ? { ...cel.s.bordures } : undefined } : undefined } : null, v });
    }
    if (src.couper) { if (srcFi >= 0) srcC.effacer(srcFi, src.r1, src.c1, src.r2, src.c2, true); pressePapier = null; if (autre) { srcC.modifie(); } }
    const aVerifier = [];
    for (let i = 0; i < repL; i++) for (let j = 0; j < repC; j++) for (const b of bloc) {
      const r = dest.r1 + i * nl + b.dr, c = dest.c1 + j * nc + b.dc;
      const dr = r - (src.r1 + b.dr), dc = c - (src.c1 + b.dc);
      const cel = b.cel ? { ...b.cel, f: src.couper ? b.cel.f : decalerFormule(b.cel.f, dr, dc) } : null;
      feuille().set(r, c, cel);
      if (autre && cel && cel.f != null) aVerifier.push([r, c, b]);
    }
    feuille().recalculerZone(); classeur.modifie();
    let remplacees = 0;
    for (const [r, c, b] of aVerifier) {
      const v = classeur.valeur(fi(), r, c);
      if (v instanceof ErreurFormule && (v.code === '#REF!' || v.code === '#NAME?') && !(b.v instanceof ErreurFormule)) {
        feuille().set(r, c, { v: b.v ?? null, z: b.cel.z, s: b.cel.s }); remplacees++;
      }
    }
    if (remplacees) { classeur.modifie(); toast(remplacees + ' formule' + (remplacees > 1 ? 's' : '') + ' citant une feuille ou un nom absent de ce classeur collée' + (remplacees > 1 ? 's' : '') + ' en valeur'); }
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
// Séries de la poignée, comme Excel : nombres en progression (une date seule avance d'un jour), mois et jours
// de la semaine, textes terminés par un nombre (« Trimestre 1 »…), sinon le motif est répété.
const LISTES_SERIES = [
  ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'], ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  ['t1', 't2', 't3', 't4'], ['q1', 'q2', 'q3', 'q4'],
];
/** Cellule à la position k (0 = première de la source, peut être négative) d'une série prolongée ; decaler(cel, delta) décale une formule. */
function prolongerSerie(src, k, decaler) {
  const n = src.length, i = ((k % n) + n) % n, cel = src[i];
  if (!cel) return null;
  if (src.some((x) => !x || x.f != null)) return cel.f != null ? decaler(cel, k - i) : { ...cel };
  const vals = src.map((x) => x.v);
  if (vals.every((v) => typeof v === 'number')) {
    if (n >= 2) { const pas = (vals[n - 1] - vals[0]) / (n - 1); return { ...src[0], z: src[i].z, s: src[i].s, v: Math.round((vals[0] + pas * k) * 1e10) / 1e10 }; }
    return /[dmyj]/i.test((cel.z || '').replace(/"[^"]*"/g, '')) && !/[0#]/.test(cel.z || '') ? { ...cel, v: cel.v + k } : { ...cel };
  }
  if (vals.every((v) => typeof v === 'string')) {
    const casse = (modele, t) => (modele === modele.toUpperCase() && /[A-Z]/i.test(modele) && modele.length > 1 ? t.toUpperCase() : /^[A-ZÀ-Ý]/.test(modele) ? t[0].toUpperCase() + t.slice(1) : t);
    for (const L of LISTES_SERIES) {
      const idx = vals.map((v) => L.indexOf(v.toLowerCase()));
      if (idx.some((x) => x < 0)) continue;
      const pas = n >= 2 ? (idx[n - 1] - idx[0]) / (n - 1) : 1;
      if (!Number.isInteger(pas)) break;
      const j = (((idx[0] + pas * k) % L.length) + L.length) % L.length;
      return { ...cel, v: casse(vals[0], L[j]) };
    }
    const m = vals.map((v) => /^(.*?)(\d+)(\D*)$/.exec(v));
    if (m.every(Boolean) && m.every((x) => x[1] === m[0][1] && x[3] === m[0][3])) {
      const nums = m.map((x) => +x[2]), pas = n >= 2 ? (nums[n - 1] - nums[0]) / (n - 1) : 1;
      if (Number.isInteger(pas)) { const v = nums[0] + pas * k; if (v >= 0) return { ...cel, v: m[0][1] + String(v).padStart(m[0][2].startsWith('0') ? m[0][2].length : 0, '0') + m[0][3] }; }
    }
  }
  return { ...cel };
}
function recopierVers(cible) { // poignée : étend la sélection vers cible (séries, formules décalées)
  const s = selectionNormalisee();
  const f = feuille();
  memoriser();
  if (cible.r > s.r2 || cible.r < s.r1) {
    const bas = cible.r > s.r2;
    for (let c = s.c1; c <= s.c2; c++) {
      const src = []; for (let r = s.r1; r <= s.r2; r++) { const x = f.get(r, c); src.push(x ? { ...x } : null); }
      const debut = bas ? s.r2 + 1 : cible.r, fin = bas ? cible.r : s.r1 - 1;
      for (let r = debut; r <= fin; r++) f.set(r, c, prolongerSerie(src, r - s.r1, (cel, d) => ({ ...cel, f: decalerFormule(cel.f, d, 0), cache: undefined })));
    }
    selection = { r1: Math.min(s.r1, cible.r), c1: s.c1, r2: Math.max(s.r2, cible.r), c2: s.c2 };
  } else if (cible.c > s.c2 || cible.c < s.c1) {
    const droite = cible.c > s.c2;
    for (let r = s.r1; r <= s.r2; r++) {
      const src = []; for (let c = s.c1; c <= s.c2; c++) { const x = f.get(r, c); src.push(x ? { ...x } : null); }
      const debut = droite ? s.c2 + 1 : cible.c, fin = droite ? cible.c : s.c1 - 1;
      for (let c = debut; c <= fin; c++) f.set(r, c, prolongerSerie(src, c - s.c1, (cel, d) => ({ ...cel, f: decalerFormule(cel.f, 0, d), cache: undefined })));
    }
    selection = { r1: s.r1, c1: Math.min(s.c1, cible.c), r2: s.r2, c2: Math.max(s.c2, cible.c) };
  }
  f.recalculerZone(); classeur.modifie(); sauvegarderLocal(); rendre();
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------

function surSelection(cb) { const s = selectionBornee(); memoriser('formatCellules'); for (let r = s.r1; r <= Math.max(s.r2, s.r1); r++) for (let c = s.c1; c <= Math.max(s.c2, s.c1); c++) cb(r, c); sauvegarderLocal(); rendre(); }
function basculerStyle(prop) { const cel = feuille().get(curseur.r, curseur.c); const val = !(cel && cel.s && cel.s[prop]); surSelection((r, c) => classeur.style(fi(), r, c, { [prop]: val })); }
function appliquerBordures(mode, style = 'thin', memo = true) {
  const s = selectionBornee();
  const sel = selectionNormalisee();
  if (memo) memoriser('formatCellules');
  for (let r = s.r1; r <= Math.max(s.r2, s.r1); r++) for (let c = s.c1; c <= Math.max(s.c2, s.c1); c++) {
    const cel = feuille().get(r, c);
    const b = { ...((cel && cel.s && cel.s.bordures) || {}) };
    const haut = r === sel.r1, bas = r === sel.r2, gauche = c === sel.c1, droite = c === sel.c2;
    switch (mode) {
      case 'toutes': b.h = b.b = b.g = b.d = style; break;
      case 'interieur': if (!haut) b.h = style; if (!bas) b.b = style; if (!gauche) b.g = style; if (!droite) b.d = style; break;
      case 'contour': case 'contour-epais': { const v = mode === 'contour' ? style : 'thick'; if (haut) b.h = v; if (bas) b.b = v; if (gauche) b.g = v; if (droite) b.d = v; break; }
      case 'bas': if (bas) b.b = style; break;
      case 'bas-epais': if (bas) b.b = 'thick'; break;
      case 'haut': if (haut) b.h = style; break;
      case 'gauche': if (gauche) b.g = style; break;
      case 'droite': if (droite) b.d = style; break;
      case 'sans-contour': if (haut) delete b.h; if (bas) delete b.b; if (gauche) delete b.g; if (droite) delete b.d; break;
      case 'aucune': delete b.h; delete b.b; delete b.g; delete b.d; break;
    }
    if (mode === 'aucune' && !cel) continue;
    classeur.style(fi(), r, c, { bordures: Object.keys(b).length ? b : null });
  }
  sauvegarderLocal(); rendre();
}

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
  uiD.fermerPopup(); uiD.validation.fermerListe();
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
const COULEURS_ONGLET = [['', 'Aucune'], ['#c00000', 'Rouge'], ['#ed7d31', 'Orange'], ['#ffc000', 'Jaune'], ['#70ad47', 'Vert'], ['#4472c4', 'Bleu'], ['#7030a0', 'Violet'], ['#7f7f7f', 'Gris']];
// Duplique tout : cellules, tailles, fusions, mise en forme conditionnelle, validations, volets, graphiques, images
function dupliquerFeuille(i) {
  const src = classeur.feuilles[i];
  let nom = src.nom + ' (2)', k = 2; while (classeur.indexFeuille(nom) >= 0) nom = src.nom + ' (' + (++k) + ')';
  const f = classeur.ajouterFeuille(nom, i + 1);
  src.chaque((r, c, cel) => f.set(r, c, JSON.parse(JSON.stringify({ ...cel, v: cel.v instanceof ErreurFormule ? null : cel.v }))));
  const copie = (x) => JSON.parse(JSON.stringify(x));
  f.largeurs = copie(src.largeurs); f.hauteurs = copie(src.hauteurs); f.fusions = copie(src.fusions);
  f.mfc = copie(src.mfc || []); f.validations = copie(src.validations || []); f.figer = src.figer ? { ...src.figer } : null; f.couleur = src.couleur;
  f.graphiques = (src.graphiques || []).map((g) => ({ ...copie(g), id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }));
  f.images = (src.images || []).map((im) => ({ ...copie(im), id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }));
  f.boutons = (src.boutons || []).map((b) => ({ ...copie(b), id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }));
  for (const [cle, d] of src.noms) f.noms.set(cle, { ...d, ref: d.ref.replace(new RegExp("^'?" + src.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'?!", 'i'), (/^[A-Za-z_][\w.]*$/.test(nom) ? nom : "'" + nom + "'") + '!') });
  f.code = src.code || '';
  for (const k of PROPRIETES_FEUILLE) if (src[k] !== undefined) f[k] = copie(src[k]);
  // Les noms de tableau sont uniques dans le classeur : la copie reçoit des noms neufs
  for (const t of f.tableaux || []) { t.nom = classeur.nomTableauLibre(t.nom.replace(/\d+$/, '') || 'Tableau'); }
  f.recalculerZone(); classeur.modifie();
  memoriserVue(); activerFeuille(i + 1); sauvegarderLocal();
}
function menuOnglet(e, i) {
  const items = [
    ['Renommer…', () => renommerFeuille(i)],
    ['Insérer une feuille', () => { classeur.ajouterFeuille(null, i + 1); activerFeuille(i + 1); sauvegarderLocal(); }],
    ['Dupliquer', () => dupliquerFeuille(i)],
    ['Couleur de l\'onglet', [...COULEURS_ONGLET.map(([c, t]) => [t, () => { classeur.feuilles[i].couleur = c || undefined; classeur.modifie(); sauvegarderLocal(); rendreOnglets(); }])]],
    ['Visualiser le code', () => { if (panneauCourant !== 'macros') ouvrirPanneau('macros'); afficherModule('feuille:' + classeur.feuilles[i].codeNom); }],
    ['Masquer', () => { if (classeur.feuilles.filter((f) => !f.cachee).length <= 1) return toast('Il faut garder une feuille visible', true); classeur.feuilles[i].cachee = true; if (fi() === i) activerFeuille(classeur.feuilles.findIndex((f) => !f.cachee)); sauvegarderLocal(); rendre(); }],
    ['Déplacer à gauche', () => { if (i > 0) { memoriserVue(); classeur.deplacerFeuille(i, i - 1); activerFeuille(i - 1); sauvegarderLocal(); } }],
    ['Déplacer à droite', () => { if (i < classeur.feuilles.length - 1) { memoriserVue(); classeur.deplacerFeuille(i, i + 1); activerFeuille(i + 1); sauvegarderLocal(); } }],
    null,
    ['Supprimer', () => { if (!confirm('Supprimer la feuille « ' + classeur.feuilles[i].nom + ' » ?' + ((classeur.feuilles[i].code || '').trim() ? '\nSon module de code VBA (' + classeur.feuilles[i].codeNom + ') sera supprimé avec elle.' : ''))) return; try { classeur.supprimerFeuille(i); activerFeuille(Math.min(i, classeur.feuilles.length - 1)); sauvegarderLocal(); } catch (err) { toast(err.message, true); } }],
  ];
  const cachees = classeur.feuilles.map((f, k) => [f, k]).filter(([f]) => f.cachee);
  if (cachees.length) { items.push(null); for (const [f, k] of cachees) items.push(['Afficher « ' + f.nom + ' »', () => { f.cachee = false; activerFeuille(k); sauvegarderLocal(); }]); }
  ouvrirMenu(e.clientX, e.clientY, items);
}

// ---------------------------------------------------------------------------
// Menu contextuel et notifications
// ---------------------------------------------------------------------------

// items : [libellé, action, raccourci] ; une action peut être une liste : un sous-menu (▸), avec ‹ pour revenir
function ouvrirMenu(x, y, items, retour = null) {
  const menu = $('menu-contextuel');
  menu.innerHTML = '';
  if (retour) { const d = document.createElement('div'); d.className = 'retour'; d.textContent = '‹ ' + retour.titre; d.addEventListener('click', (e) => { e.stopPropagation(); ouvrirMenu(x, y, retour.items); }); menu.appendChild(d); menu.appendChild(document.createElement('hr')); }
  // Pas de séparateur en tête, en fin ni en double
  items = items.filter((it, i, t) => it || (i > 0 && t[i - 1] && t.slice(i + 1).some(Boolean)));
  for (const it of items) {
    if (!it) { menu.appendChild(document.createElement('hr')); continue; }
    const d = document.createElement('div');
    d.innerHTML = '<span>' + echapper(it[0]) + '</span>' + (Array.isArray(it[1]) ? '<small>▸</small>' : it[2] ? '<small>' + echapper(it[2]) + '</small>' : '');
    if (Array.isArray(it[1])) d.addEventListener('click', (e) => { e.stopPropagation(); ouvrirMenu(x, y, it[1], { titre: it[0], items }); });
    else d.addEventListener('click', () => { fermerMenu(); it[1](); const a = document.activeElement; if (!a || a === document.body || a.closest('.onglet, #barre-outils, .menu')) conteneur.focus({ preventScroll: true }); });
    menu.appendChild(d);
  }
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + 'px'; menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + 'px';
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
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    let buf = new Uint8Array(await file.arrayBuffer());
    if (estChiffre(XLSX, buf)) {
      buf = await dechiffrerAvecMotDePasse(buf, file.name);
      if (!buf) return;
    }
    if (ext === 'bas' || ext === 'cls' || ext === 'frm' || ext === 'vba') {
      let texte;
      try { texte = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texte = new TextDecoder('windows-1252').decode(buf); }
      const cles = ajouterAuProjet(classeur, nettoyerModuleVBA(texte, file.name));
      classeur.version++;
      if (panneauCourant !== 'macros') ouvrirPanneau('macros');
      afficherModule(cles[0]); sauvegarderLocal();
      toast('Module « ' + (classeur.moduleVBA(cles[0]) || { libelle: file.name }).libelle + ' » ajouté au projet VBA');
      return;
    }
    if (ext === 'docx') {
      const nouveau = lireDocx(XLSX, buf, file.name);
      nouveau.nomFichier = nomLibreClasseur(nouveau.nomFichier);
      chargerClasseur(nouveau);
      toast('« ' + file.name + '» : ' + nouveau.feuilles.length + ' tableau' + (nouveau.feuilles.length > 1 ? 'x' : '') + ' importé' + (nouveau.feuilles.length > 1 ? 's' : ''));
      return;
    }
    const nouveau = lireClasseur(XLSX, buf, file.name);
    nouveau.nomFichier = nomLibreClasseur(nouveau.nomFichier);
    chargerClasseur(nouveau);
    toast('« ' + file.name + ' » ouvert : ' + nouveau.feuilles.length + ' feuille' + (nouveau.feuilles.length > 1 ? 's' : '') + (nouveau.modulesVBA().some((m) => (m.code || '').trim()) ? ', macros lues' : '') + (nouveau.feuilles.some((f) => f.graphiques.length) ? ', graphiques affichés' : ''));
    if (nouveau.vbaBrut) $('format-export').value = 'xlsm';
  } catch (e) { console.error(e); toast('Impossible de lire ce fichier : ' + e.message, true); }
}
// ----- Plusieurs classeurs ouverts -----
const baseNom = (n) => String(n || '').replace(/\.(xlsx|xlsm|xls|csv|ods)$/i, '');
/** Un nom de fichier qui n'est pas déjà pris par un classeur ouvert (« Classeur2.xlsx », « budget (2).xlsx »…). */
function nomLibreClasseur(voulu, sauf = null) {
  const pris = new Set(classeurs.filter((c) => c !== sauf).map((c) => baseNom(c.nomFichier).toLowerCase()));
  if (!voulu) { let i = 1; while (pris.has('classeur' + i)) i++; return 'Classeur' + i + '.xlsx'; }
  const ext = (/\.(xlsx|xlsm|xls|csv|ods)$/i.exec(voulu) || ['.xlsx'])[0];
  let base = baseNom(voulu), nom = base, k = 2;
  while (pris.has(nom.toLowerCase())) nom = base + ' (' + k++ + ')';
  return nom + ext;
}
const estModifie = (c) => c.version !== c.enregistre;
const estVierge = (c) => c.feuilles.length === 1 && !c.feuilles[0].cellules.size && !(c.feuilles[0].graphiques || []).length && !c.modulesVBA().some((m) => m.code.trim()) && !estModifie(c);

/** Passe à un autre classeur ouvert en gardant la vue, l'historique et le presse-papiers. */
function basculerClasseur(c) {
  if (!c || c === classeur) return;
  if (edition) validerEdition();
  memoriserVue();
  classeur._hist = { historique, futur };
  classeur = c;
  graphiqueActif = null;
  $('sortie-vba').innerHTML = '';
  afficherModule();
  $('format-export').value = aDesMacros(classeur) ? 'xlsm' : 'xlsx';
  activerFeuille(Math.min(classeur.active, classeur.feuilles.length - 1));
  ({ historique, futur } = classeur._hist || { historique: [], futur: [] });
  document.title = (classeur.nomFichier || 'Classeur') + ' — Sprezz';
  if (panneauCourant === 'noms') rendreNoms();
  sauvegarderLocal();
  rendreClasseurs(true);
  rendre();
}
/** Ajoute un classeur (ouvert ou nouveau) ; un classeur vide et intact au premier plan est remplacé, comme dans Excel. */
/** Demande le mot de passe d'un fichier chiffré (plusieurs essais) et renvoie le zip déchiffré, ou null si annulé. */
async function dechiffrerAvecMotDePasse(octets, nomFichier) {
  // Mot de passe par défaut d'Excel pour les classeurs seulement « protégés en écriture »
  try { return dechiffrerOffice(XLSX, octets, 'VelvetSweatshop'); } catch { /* il faut le vrai mot de passe */ }
  let message = '';
  for (;;) {
    const mdp = await demanderMotDePasse(nomFichier, message);
    if (mdp === null) { toast('Ouverture annulée'); return null; }
    $('mdp-attente').hidden = false;
    await new Promise((r) => setTimeout(r, 30)); // laisse s'afficher « Déchiffrement… »
    try { const zip = dechiffrerOffice(XLSX, octets, mdp); fermerDialogueMdp(); return zip; }
    catch (e) {
      $('mdp-attente').hidden = true;
      if (e instanceof ErreurMotDePasse) { message = 'Mot de passe incorrect, réessayez.'; continue; }
      fermerDialogueMdp(); throw e;
    }
  }
}
let resoudreMdp = null;
function demanderMotDePasse(nomFichier, message) {
  return new Promise((resolve) => {
    resoudreMdp = resolve;
    $('mdp-fichier').textContent = nomFichier;
    $('mdp-message').textContent = message || '';
    $('mdp-attente').hidden = true;
    $('mdp-saisie').value = '';
    $('dialogue-mdp').hidden = false;
    setTimeout(() => $('mdp-saisie').focus(), 0);
  });
}
function fermerDialogueMdp() { $('dialogue-mdp').hidden = true; $('mdp-attente').hidden = true; }
function repondreMdp(valeur) { const r = resoudreMdp; resoudreMdp = null; if (valeur === null) fermerDialogueMdp(); if (r) r(valeur); }
$('mdp-ok').addEventListener('click', () => repondreMdp($('mdp-saisie').value));
$('mdp-annuler').addEventListener('click', () => repondreMdp(null));
$('mdp-saisie').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); repondreMdp($('mdp-saisie').value); } else if (e.key === 'Escape') repondreMdp(null); });
$('mdp-voir').addEventListener('change', (e) => { $('mdp-saisie').type = e.target.checked ? 'text' : 'password'; });

function chargerClasseur(nouveau, remplacerVierge = true) {
  if (edition) annulerEdition();
  nouveau.enregistre = nouveau.version;
  const i = classeurs.indexOf(classeur);
  if (remplacerVierge && estVierge(classeur) && classeurs.length >= 1) {
    classeurs[i] = nouveau;
    if (pressePapier && pressePapier.classeur === classeur) pressePapier = null;
    classeur = null;
  } else classeurs.splice(i + 1, 0, nouveau);
  if (!classeur) basculerVers(nouveau);
  else basculerClasseur(nouveau);
  nouveau.enregistre = nouveau.version;
  rendreClasseurs(true);
}
function basculerVers(c) { // premier affichage d'un classeur qui remplace le précédent
  classeur = c;
  graphiqueActif = null;
  $('sortie-vba').innerHTML = '';
  afficherModule();
  $('format-export').value = aDesMacros(c) ? 'xlsm' : 'xlsx';
  activerFeuille(Math.min(c.active, c.feuilles.length - 1));
  document.title = (c.nomFichier || 'Classeur') + ' — Sprezz';
  if (panneauCourant === 'noms') rendreNoms();
  sauvegarderLocal();
}
function fermerClasseur(c) {
  if (estModifie(c) && !confirm('« ' + c.nomFichier + ' » a des modifications non enregistrées. Le fermer quand même ?')) return;
  const i = classeurs.indexOf(c);
  if (i < 0) return;
  if (classeurs.length === 1) { const n = Classeur.nouveau(); n.nomFichier = 'Classeur1.xlsx'; classeurs = [n]; basculerVers(n); n.enregistre = n.version; rendreClasseurs(true); return; }
  const suivant = classeurs[i + 1] || classeurs[i - 1];
  if (c === classeur) basculerClasseur(suivant);
  classeurs.splice(i, 1);
  sauvegarderLocal();
  rendreClasseurs(true);
}
function renommerClasseur(c) {
  const nom = prompt('Nom du fichier :', baseNom(c.nomFichier));
  if (!nom || !nom.trim()) return;
  const ext = (/\.(xlsx|xlsm|xls|csv|ods)$/i.exec(c.nomFichier) || ['.xlsx'])[0];
  c.nomFichier = nomLibreClasseur(nom.trim().replace(/[\\/:*?"<>|]/g, '_') + (/\.(xlsx|xlsm|csv)$/i.test(nom.trim()) ? '' : ext), c);
  if (c === classeur) document.title = c.nomFichier + ' — Sprezz';
  sauvegarderLocal(); rendreClasseurs(true);
}
let signatureClasseurs = '';
function rendreClasseurs(forcer = false) {
  const sig = classeurs.map((c) => c.nomFichier + (estModifie(c) ? '*' : '') + (c === classeur ? '!' : '')).join('|');
  if (!forcer && sig === signatureClasseurs) return;
  signatureClasseurs = sig;
  const liste = $('liste-classeurs');
  liste.innerHTML = '';
  for (const c of classeurs) {
    const o = document.createElement('div');
    o.className = 'classeur-onglet' + (c === classeur ? ' actif' : '');
    o.title = c.nomFichier + (estModifie(c) ? ' (modifié, non enregistré)' : '') + '\nDouble-clic : renommer · clic droit : menu';
    const nom = document.createElement('span'); nom.className = 'classeur-nom'; nom.textContent = (estModifie(c) ? '● ' : '') + c.nomFichier;
    const x = document.createElement('button'); x.className = 'classeur-fermer'; x.textContent = '✕'; x.title = 'Fermer ce classeur';
    x.addEventListener('click', (e) => { e.stopPropagation(); fermerClasseur(c); });
    o.append(nom, x);
    o.addEventListener('click', () => { basculerClasseur(c); conteneur.focus({ preventScroll: true }); });
    o.addEventListener('dblclick', () => renommerClasseur(c));
    o.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ouvrirMenu(e.clientX, e.clientY, [
        ['Renommer…', () => renommerClasseur(c)],
        ['Enregistrer', () => { basculerClasseur(c); enregistrer(); }],
        ['Dupliquer', () => { const copie = lireClasseur(XLSX, ecrireClasseur(XLSX, c, { bookType: 'xlsx' }), nomLibreClasseur(baseNom(c.nomFichier) + ' - copie.xlsx')); copie.nomFichier = nomLibreClasseur(baseNom(c.nomFichier) + ' - copie.xlsx'); chargerClasseur(copie, false); }],
        null,
        ['Fermer', () => fermerClasseur(c)],
        ['Fermer les autres', () => { for (const autre of [...classeurs]) if (autre !== c) fermerClasseur(autre); }],
      ]);
    });
    liste.appendChild(o);
  }
}

function enregistrer() {
  if (edition) validerEdition();
  let type = $('format-export').value;
  if (type === 'xlsx' && aDesMacros(classeur)) { type = 'xlsm'; $('format-export').value = 'xlsm'; }
  try {
    const octets = ecrireClasseur(XLSX, classeur, { bookType: type });
    const nom = (classeur.nomFichier || 'Classeur1').replace(/\.(xlsx|xlsm|xls|csv|ods)$/i, '') + '.' + type;
    const blob = new Blob([octets], { type: type === 'csv' ? 'text/csv' : 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    classeur.nomFichier = nom;
    classeur.enregistre = classeur.version;
    rendreClasseurs(true); sauvegarderLocal();
    toast('Téléchargé : ' + nom + (type === 'xlsm' && classeur.macros.trim() ? ' (le code VBA modifié ici est gardé dans la feuille masquée _MacrosTableur ; Excel ne l\'exécute pas comme un vrai projet VBA)' : ''));
  } catch (e) { console.error(e); toast('Enregistrement impossible : ' + e.message, true); }
}
function nouveauClasseur() {
  const c = Classeur.nouveau();
  c.nomFichier = nomLibreClasseur();
  chargerClasseur(c, false);
  toast('Nouveau classeur « ' + c.nomFichier + ' »');
}

// Sauvegarde locale (navigateur) de tous les classeurs ouverts, pour survivre à un rechargement
function serialiserClasseur(c) {
  return JSON.stringify({ nomFichier: c.nomFichier, active: c.active, macros: c.macros || '', calculManuel: !!c.calculManuel, noms: [...c.noms.values()], modifie: estModifie(c),
    feuilles: c.feuilles.map((f, fi2) => ({ nom: f.nom, codeNom: f.codeNom, cachee: f.cachee, largeurs: f.largeurs, hauteurs: f.hauteurs, fusions: f.fusions, graphiques: f.graphiques, boutons: f.boutons, images: f.images, noms: [...f.noms.values()], figer: f.figer, mfc: f.mfc, filtre: f.filtre, filtrees: [...(f.filtrees || [])], validations: f.validations, tcd: f.tcd, couleur: f.couleur,
      ...Object.fromEntries(PROPRIETES_FEUILLE.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])), zoom: f.zoom,
      cellules: [...f.cellules].map(([k, cel]) => {
        const o = { ...cel, v: cel.v instanceof ErreurFormule ? { erreur: cel.v.code } : cel.v };
        // Comme Excel à l'enregistrement : la dernière valeur calculée d'une formule est gardée
        if (cel.f != null) { const [r, col] = k.split(',').map(Number); const v = c.valeur(fi2, r, col); if (v !== null && v !== undefined && !(v instanceof ErreurFormule) && typeof v !== 'object') o.cache = v; else delete o.cache; }
        return [k, o];
      }) })) });
}
function deserialiserClasseur(data) {
  const c = new Classeur();
  c.nomFichier = data.nomFichier || 'Classeur1.xlsx';
  for (const fd of data.feuilles || []) {
    const f = c.ajouterFeuille(fd.nom); if (fd.codeNom) { try { c.changerCodeNom(f, fd.codeNom); } catch { /* nom pris */ } } f.cachee = !!fd.cachee; f.largeurs = fd.largeurs || {}; f.hauteurs = fd.hauteurs || {}; f.fusions = fd.fusions || []; f.graphiques = fd.graphiques || []; f.boutons = fd.boutons || []; f.images = fd.images || [];
    f.figer = fd.figer || null; f.mfc = fd.mfc || []; f.filtre = fd.filtre || null; f.filtrees = new Set(fd.filtrees || []); f.validations = fd.validations || []; f.tcd = fd.tcd || []; if (fd.couleur) f.couleur = fd.couleur;
    for (const k of PROPRIETES_FEUILLE) if (fd[k] !== undefined) f[k] = fd[k];
    if (fd.zoom) f.zoom = fd.zoom;
    for (const n of fd.noms || []) f.noms.set(n.nom.toUpperCase(), n);
    for (const [k, cel] of fd.cellules) { if (cel.v && typeof cel.v === 'object' && cel.v.erreur) cel.v = new ErreurFormule(cel.v.erreur); f.cellules.set(k, cel); }
    f.recalculerZone();
  }
  if (!c.feuilles.length) return null;
  for (const n of data.noms || []) c.noms.set(n.nom.toUpperCase(), n);
  c.macros = data.macros || ''; c.active = Math.min(data.active || 0, c.feuilles.length - 1);
  if (data.calculManuel) c.calculManuel = true;
  c.modifie();
  c.enregistre = data.modifie ? -1 : c.version;
  return c;
}
let timerLocal;
function sauvegarderLocal() {
  clearTimeout(timerLocal);
  timerLocal = setTimeout(() => {
    try { if (!classeur.calculManuel && classeur.feuilles.some((f) => f.tablesDonnees && f.tablesDonnees.length) && actualiserTablesDonnees(classeur)) rendre(); } catch (e) { console.warn(e); }
    try { uiG.rafraichir(); uiD.rafraichir(); uiA.rafraichir(); } catch (e) { console.warn(e); }
    try {
      const morceaux = [];
      let total = 0;
      for (const c of classeurs) {
        // Les classeurs en arrière-plan ne changent pas : on garde leur texte tant que leur version est la même
        if (c !== classeur && c._json && c._jsonVersion === c.version + '/' + estModifie(c)) { /* déjà prêt */ }
        else { c._json = serialiserClasseur(c); c._jsonVersion = c.version + '/' + estModifie(c); }
        if (total + c._json.length > 4_500_000) continue; // trop gros pour le navigateur : seulement en mémoire
        morceaux.push(c._json); total += c._json.length;
      }
      localStorage.setItem(CLE_STOCKAGE, '{"actif":' + Math.max(0, classeurs.indexOf(classeur)) + ',"liste":[' + morceaux.join(',') + ']}');
      localStorage.removeItem(ANCIENNE_CLE);
    } catch { /* stockage indisponible ou plein */ }
  }, 400);
}
function restaurerLocal() {
  try {
    const json = localStorage.getItem(CLE_STOCKAGE);
    if (json) {
      const data = JSON.parse(json);
      const liste = (data.liste || []).map(deserialiserClasseur).filter(Boolean);
      if (!liste.length) return false;
      classeurs = liste;
      classeur = liste[Math.min(data.actif || 0, liste.length - 1)];
      return true;
    }
    const ancien = localStorage.getItem(ANCIENNE_CLE); // un seul classeur (version précédente)
    if (!ancien) return false;
    const c = deserialiserClasseur(JSON.parse(ancien));
    if (!c) return false;
    classeurs = [c]; classeur = c;
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
  $('panneau-titre').textContent = { macros: 'Macros VBA', fonctions: 'Fonctions', noms: 'Noms définis', aide: 'Aide', graphique: 'Graphique', rechercher: 'Rechercher et remplacer', tri: 'Tri personnalisé', mfc: 'Mise en forme conditionnelle', cible: 'Valeur cible', validation: 'Validation des données', tcd: 'Tableau croisé dynamique', ...uiA.titres }[nom] || nom;
  if (uiD.panneaux[nom]) uiD.panneaux[nom]();
  if (uiA.panneaux[nom]) uiA.panneaux[nom]();
  if (nom === 'tcd') uiT.construire();
  if (nom === 'fonctions') rendreFonctions();
  if (nom === 'noms') rendreNoms();
  if (nom === 'aide') rendreAide();
  if (nom === 'macros') { afficherModule(classeur._moduleActif); $('code-vba').focus(); }
  rendre();
}
// ----- Projet VBA : modules de feuille, ThisWorkbook, modules standard -----

/** Module affiché dans l'éditeur (celui choisi, sinon le premier qui a du code, sinon Module1 / la feuille active). */
let moduleAffiche = null; // clé du module montré dans l'éditeur
function moduleCourant() {
  let m = classeur._moduleActif && classeur.moduleVBA(classeur._moduleActif);
  if (m) return m;
  // Projet vide : un premier module standard « Module1 », prêt à recevoir des macros
  if (!classeur.modules.length && !classeur.modulesVBA().some((x) => x.code.trim())) classeur.modules.push({ nom: 'Module1', code: '' });
  const tous = classeur.modulesVBA();
  m = tous.find((x) => x.genre === 'module') || tous.find((x) => x.code.trim()) || tous.find((x) => x.feuille === feuille()) || tous[0];
  classeur._moduleActif = m.cle;
  return m;
}
/** Affiche un module dans l'éditeur (et place le curseur à la ligne donnée, 1-based). */
function afficherModule(cle, ligne) {
  if (cle) classeur._moduleActif = cle;
  const m = moduleCourant();
  moduleAffiche = m.cle;
  const ta = $('code-vba');
  if (ta.value !== m.code) ta.value = m.code;
  ta.placeholder = m.genre === 'feuille' ? "' Code de la feuille « " + m.feuille.nom + ' » : Range, Cells et Me y désignent cette feuille.\nSub MaMacro()\n    Range("A1").Value = 42\nEnd Sub'
    : m.genre === 'classeur' ? "' Code du classeur (ThisWorkbook)\nSub MaMacro()\n    MsgBox ThisWorkbook.Name\nEnd Sub"
    : 'Sub MaMacro()\n    Range("A1").Value = 42\nEnd Sub';
  $('module-titre').textContent = m.libelle;
  $('module-titre').title = m.genre === 'feuille' ? 'Module de la feuille « ' + m.feuille.nom + ' » (nom de code ' + m.nom + ')' : m.genre === 'classeur' ? 'Module du classeur' : 'Module standard « ' + m.nom + ' »';
  rendreArbreVBA();
  rafraichirProcedures();
  const sel = $('liste-procedures');
  if (!sel.value.startsWith(m.nom + '.')) { const o = [...sel.options].find((x) => x.value.startsWith(m.nom + '.')); if (o) sel.value = o.value; }
  if (ligne) { allerALigne(ligne); suivreCurseurVBA(); }
}
function allerALigne(n, selectionner = false) {
  const ta = $('code-vba'); const lignes = ta.value.split('\n'); let pos = 0;
  for (let i = 0; i < n - 1 && i < lignes.length; i++) pos += lignes[i].length + 1;
  const fin = selectionner ? pos + (lignes[n - 1] || '').length : pos + /^\s*/.exec(lignes[n - 1] || '')[0].length;
  ta.focus(); ta.setSelectionRange(selectionner ? pos : fin, fin);
  // fait défiler jusqu'à la ligne
  const hl = parseFloat(getComputedStyle(ta).lineHeight) || 18;
  ta.scrollTop = Math.max(0, (n - 4) * hl);
}
let signatureArbre = '';
function rendreArbreVBA(forcer = true) {
  const tous = classeur.modulesVBA();
  const actif = moduleCourant().cle;
  const sig = actif + '|' + tous.map((m) => m.libelle + ':' + m.code.length + ':' + m.code.split('\n').length).join('|');
  if (!forcer && sig === signatureArbre) return;
  signatureArbre = sig;
  const arbre = $('arbre-vba');
  arbre.innerHTML = '';
  const groupe = (titre, info) => { const g = document.createElement('div'); g.className = 'arbre-groupe'; g.textContent = titre; if (info) g.title = info; arbre.appendChild(g); };
  const ligneModule = (m) => {
    const d = document.createElement('div');
    d.className = 'arbre-module' + (m.cle === actif ? ' actif' : '');
    const procs = listerProcedures(m.code);
    d.innerHTML = '<span class="arbre-icone">' + (m.genre === 'feuille' ? '▦' : m.genre === 'classeur' ? '📗' : '⚙') + '</span>';
    const nom = document.createElement('span'); nom.className = 'arbre-nom'; nom.textContent = m.libelle; d.appendChild(nom);
    if (m.feuille && m.feuille.cachee) { const c = document.createElement('span'); c.className = 'arbre-note'; c.textContent = 'masquée'; d.appendChild(c); }
    d.title = m.genre === 'module' ? 'Module standard — clic : afficher, double-clic : renommer, clic droit : menu' : 'Clic : afficher le code, clic droit : menu';
    d.addEventListener('click', () => afficherModule(m.cle));
    d.addEventListener('dblclick', () => { if (m.genre === 'module') renommerModuleUI(m.nom); });
    d.addEventListener('contextmenu', (e) => { e.preventDefault(); menuModule(e, m); });
    arbre.appendChild(d);
    for (const p of procs) {
      const q = document.createElement('div');
      q.className = 'arbre-proc' + (p.macro ? ' macro' : '');
      q.textContent = (p.genre === 'Function' ? 'ƒ ' : p.macro ? '▸ ' : '· ') + p.nom + (p.params ? '(…)' : '') + (p.prive ? ' (privée)' : '');
      q.title = p.genre + ' ' + p.nom + ' — ligne ' + p.ligne + (p.macro ? ' — double-clic : exécuter' : '');
      q.addEventListener('click', () => afficherModule(m.cle, p.ligne));
      if (p.macro) q.addEventListener('dblclick', () => executerMacroUI(m.nom + '.' + p.nom));
      q.addEventListener('contextmenu', (e) => { e.preventDefault(); ouvrirMenu(e.clientX, e.clientY, [
        ...(p.macro ? [['▶ Exécuter', () => executerMacroUI(m.nom + '.' + p.nom)]] : []),
        ['Modifier', () => afficherModule(m.cle, p.ligne)],
        null,
        ['Supprimer « ' + p.nom + ' »', () => supprimerMacroUI(m.cle, p.nom)],
      ]); });
      arbre.appendChild(q);
    }
  };
  groupe('Feuilles et classeur', 'Microsoft Excel Objets : un module par feuille et ThisWorkbook');
  for (const m of tous) if (m.genre !== 'module') ligneModule(m);
  groupe('Modules', 'Modules standard : vos macros nommées');
  const modules = tous.filter((m) => m.genre === 'module');
  for (const m of modules) ligneModule(m);
  if (!modules.length) { const v = document.createElement('div'); v.className = 'arbre-vide'; v.textContent = 'Aucun module — « + Module » pour en créer un'; arbre.appendChild(v); }
}
function menuModule(e, m) {
  const items = [
    ['Afficher le code', () => afficherModule(m.cle)],
    ['Nouvelle macro ici…', () => { afficherModule(m.cle); nouvelleMacroUI(); }],
  ];
  if (m.genre === 'feuille') items.push(['Aller à la feuille « ' + m.feuille.nom + ' »', () => { const i = classeur.feuilles.indexOf(m.feuille); if (i >= 0) { if (m.feuille.cachee) m.feuille.cachee = false; activerFeuille(i); } }]);
  items.push(['Exporter (.bas)', () => exporterModule(m)]);
  if (m.genre === 'module') items.push(null, ['Renommer…', () => renommerModuleUI(m.nom)], ['Supprimer le module', () => supprimerModuleUI(m.nom)]);
  else if (m.code.trim()) items.push(null, ['Effacer le code', () => { if (!confirm('Effacer tout le code de ' + m.libelle + ' ?')) return; classeur.definirCodeModule(m.cle, ''); afficherModule(m.cle); sauvegarderLocal(); }]);
  ouvrirMenu(e.clientX, e.clientY, items);
}
function nouveauModuleUI() {
  const propose = classeur.nomModuleLibre('Module');
  const nom = prompt('Nom du nouveau module (lettres, chiffres et _, sans espace) :', propose);
  if (nom == null) return;
  try { const n = classeur.ajouterModule(nom.trim() || propose); if (panneauCourant !== 'macros') ouvrirPanneau('macros'); afficherModule('module:' + n); $('code-vba').focus(); sauvegarderLocal(); toast('Module « ' + n + ' » créé'); }
  catch (e) { toast(e.message, true); }
}
function renommerModuleUI(ancien) {
  const nom = prompt('Nouveau nom du module « ' + ancien + ' » :', ancien);
  if (nom == null || nom.trim() === ancien) return;
  try { const n = classeur.renommerModule(ancien, nom); afficherModule('module:' + n); sauvegarderLocal(); }
  catch (e) { toast(e.message, true); }
}
function supprimerModuleUI(nom) {
  const m = classeur.moduleVBA('module:' + nom);
  if (!m) return;
  if (m.code.trim() && !confirm('Supprimer le module « ' + nom + ' » et tout son code (' + listerProcedures(m.code).length + ' procédure(s)) ?')) return;
  classeur.supprimerModule(nom);
  if (classeur._moduleActif === m.cle) classeur._moduleActif = null;
  afficherModule(); sauvegarderLocal();
  toast('Module « ' + nom + ' » supprimé');
}
function exporterModule(m) {
  const entete = m.genre === 'module' ? 'Attribute VB_Name = "' + m.nom + '"\r\n' : 'VERSION 1.0 CLASS\r\nBEGIN\r\n  MultiUse = -1  \'True\r\nEND\r\nAttribute VB_Name = "' + m.nom + '"\r\n';
  const blob = new Blob([entete + m.code.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m.nom + (m.genre === 'module' ? '.bas' : '.cls'); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** Toutes les macros du projet : [{ module, cle, nom, qualifie, ligne, prive, macro, genre }] */
function toutesProcedures() {
  const out = [];
  for (const m of classeur.modulesVBA()) for (const p of listerProcedures(m.code)) out.push({ module: m, cle: m.cle, nom: p.nom, qualifie: m.nom + '.' + p.nom, ligne: p.ligne, prive: p.prive, macro: p.macro, genre: p.genre });
  return out;
}
/** Crée une macro vide nommée dans un module (par défaut celui affiché) et place le curseur dedans. */
function creerMacro(nom, cle) {
  nom = String(nom || '').trim();
  if (!nomVBAValide(nom)) { toast('Nom de macro invalide : une lettre, puis des lettres, chiffres ou _ (sans espace ni tiret)', true); return false; }
  const m = classeur.moduleVBA(cle || moduleCourant().cle);
  if (listerProcedures(m.code).some((p) => p.nom.toLowerCase() === nom.toLowerCase())) { toast('« ' + nom + ' » existe déjà dans ' + m.libelle, true); afficherModule(m.cle, listerProcedures(m.code).find((p) => p.nom.toLowerCase() === nom.toLowerCase()).ligne); return false; }
  const autre = toutesProcedures().find((p) => p.nom.toLowerCase() === nom.toLowerCase() && p.module.genre === 'module' && m.genre === 'module');
  if (autre) { toast('Une macro « ' + nom + ' » existe déjà dans ' + autre.module.nom + ' : choisissez un autre nom', true); return false; }
  const { code, ligne } = insererMacro(m.code, nom);
  classeur.definirCodeModule(m.cle, code);
  if (panneauCourant !== 'macros') ouvrirPanneau('macros');
  afficherModule(m.cle, ligne);
  sauvegarderLocal();
  toast('Macro « ' + nom + ' » créée dans ' + m.libelle);
  return true;
}
function nouvelleMacroUI() {
  const m = moduleCourant();
  const nom = prompt('Nom de la nouvelle macro (dans ' + m.libelle + ') :', '');
  if (nom == null) return;
  creerMacro(nom, m.cle);
}
function supprimerMacroUI(cle, nom) {
  const m = classeur.moduleVBA(cle);
  if (!m || !confirm('Supprimer la macro « ' + nom + ' » de ' + m.libelle + ' ?')) return false;
  classeur.definirCodeModule(cle, supprimerProcedure(m.code, nom));
  afficherModule(classeur._moduleActif); sauvegarderLocal();
  toast('Macro « ' + nom + ' » supprimée');
  return true;
}

// Les Function du code VBA deviennent des fonctions de formule (=MaFonction(A1;2))
// Un seul interpréteur VBA par classeur : les variables Public remplies par une macro (une table chargée
// par un bouton, par exemple) restent disponibles pour les fonctions VBA utilisées dans les cellules.
function hoteVBA() {
  return {
    log: (t) => journalVBA(t),
    msgBox: (t, boutons, titre) => { const b = boutons & 15; if (b === 4 || b === 3 || b === 1) return confirm((titre ? titre + '\n\n' : '') + t) ? (b === 1 ? 1 : 6) : (b === 1 ? 2 : 7); alert((titre ? titre + '\n\n' : '') + t); return 1; },
    inputBox: (t, titre, defaut, type) => {
      if (type & 8) {
        // Excel laisse sélectionner la plage à la souris : ici, la sélection en cours est proposée
        const s2 = selectionNormalisee();
        const proposition = defaut || (s2.r1 !== s2.r2 || s2.c1 !== s2.c2 ? adresse(s2.r1, s2.c1) + ':' + adresse(s2.r2, s2.c2) : '');
        return prompt((titre && titre !== 'Saisie' ? titre + '\n\n' : '') + t + '\n\nPlage de cellules (ex. B10:B120, ou Feuille!B10:B120). Astuce : sélectionnez-la avant de cliquer sur le bouton.', proposition);
      }
      return prompt((titre && titre !== 'Saisie' ? titre + '\n\n' : '') + t, defaut);
    },
    enregistrer: () => toast('ThisWorkbook.Save : utilisez le bouton Enregistrer pour télécharger le fichier'),
  };
}
function chargerUDF() {
  const signature = classeur.macros;
  if (classeur.vba && classeur.vbaCode === signature) { classeur.evaluateur.invalider(); return; }
  classeur.vbaCode = signature;
  classeur.vba = null;
  if (!classeur.modulesVBA().some((m) => m.code.trim())) { classeur.udf = null; classeur.evaluateur.invalider(); return; }
  try {
    // Un seul interpréteur pour tout le projet : les variables Public d'une macro servent ensuite aux fonctions des cellules
    const it = new InterpreteurVBA(classeur, hoteVBA());
    it.limitePas = 5_000_000;
    for (const m of classeur.modulesVBA()) if (m.code.trim()) { try { it.charger(m.code, { nom: m.nom, genre: m.genre, feuille: m.feuille }); } catch { /* module en cours de frappe */ } }
    classeur.vba = it;
    classeur.udf = creerUDF(it);
  } catch { classeur.udf = null; }
  classeur.evaluateur.invalider();
}
/** Lance une Sub (depuis l'éditeur ou un bouton de la feuille). */
function lancerMacro(nom, { depuisBouton = false } = {}) {
  if (macroEnCours) return;
  if (edition) validerEdition();
  chargerUDF();
  const it = classeur.vba;
  if (!it) { toast('Ce classeur n\'a pas de code VBA, ou il contient une erreur : ouvrez l\'éditeur VBA et cliquez sur Vérifier', true); return; }
  if (!it.prog.procedures.has(String(nom).toUpperCase())) { toast('Macro « ' + nom + ' » introuvable dans le code VBA', true); return; }
  if (depuisBouton && panneauCourant === 'macros') $('sortie-vba').innerHTML = '';
  if (!depuisBouton) $('sortie-vba').innerHTML = '';
  memoriser();
  macroEnCours = true;
  const debut = performance.now();
  journalVBA('▶ ' + nom);
  it.hote = hoteVBA();
  it.sortie = [];
  let erreur = null;
  try { it.executerProcedure(nom); }
  catch (e) { erreur = e instanceof ErreurVBA ? e : null; if (!erreur && !(e && e.constructor && /Signal/.test(e.constructor.name))) { journalVBA('Erreur interne : ' + e.message, 'err'); console.error(e); } }
  macroEnCours = false;
  if (erreur) {
    journalVBA('✖ Erreur ' + erreur.numero + (erreur.module ? ' dans ' + erreur.module : '') + (erreur.ligne ? ' (ligne ' + erreur.ligne + ')' : '') + ' : ' + erreur.description, 'err');
    if (depuisBouton) toast('Macro « ' + nom + ' » : erreur ' + erreur.numero + ' — ' + erreur.description, true);
    else if (erreur.ligne) montrerErreur(erreur.module, erreur.ligne);
  } else {
    journalVBA('✔ Terminé en ' + Math.round(performance.now() - debut) + ' ms');
    if (depuisBouton) toast('Macro « ' + nom + ' » exécutée');
  }
  classeur.active = Math.min(classeur.active, classeur.feuilles.length - 1);
  classeur.evaluateur.invalider(); // les variables globales ont pu changer
  classeur.version++;
  geometrie(); sauvegarderLocal(); rendre();
}

/** Liste des macros à exécuter (toutes celles du projet, groupées par module). */
function rafraichirProcedures() {
  chargerUDF();
  const sel = $('liste-procedures');
  const courant = sel.value;
  sel.innerHTML = '';
  const actif = moduleCourant();
  const parModule = new Map();
  for (const p of toutesProcedures()) { if (!p.macro) continue; if (!parModule.has(p.cle)) parModule.set(p.cle, []); parModule.get(p.cle).push(p); }
  for (const m of classeur.modulesVBA()) {
    const liste = parModule.get(m.cle);
    if (!liste) continue;
    const g = document.createElement('optgroup'); g.label = m.libelle;
    for (const p of liste) { const o = document.createElement('option'); o.value = p.qualifie; o.textContent = p.nom + (p.prive ? ' (privée)' : ''); g.appendChild(o); }
    sel.appendChild(g);
  }
  if (!sel.options.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(aucune macro)'; sel.appendChild(o); }
  if ([...sel.options].some((o) => o.value === courant)) sel.value = courant;
  else { const premier = [...sel.options].find((o) => o.value.startsWith(actif.nom + '.')) || sel.options[0]; sel.value = premier.value; }
}
/** Quand le curseur de l'éditeur entre dans une Sub, elle devient la macro à exécuter. */
function suivreCurseurVBA() {
  const ta = $('code-vba');
  const n = ta.value.slice(0, ta.selectionStart).split('\n').length;
  const p = procedureALaLigne(ta.value, n);
  if (p && p.macro) { const v = moduleCourant().nom + '.' + p.nom; if ([...$('liste-procedures').options].some((o) => o.value === v)) $('liste-procedures').value = v; }
}
function journalVBA(texte, classe) { const s = $('sortie-vba'); const d = document.createElement('div'); if (classe) d.className = classe; d.textContent = texte; s.appendChild(d); s.scrollTop = s.scrollHeight; }
function executerMacroUI(nomQualifie) {
  const nom = typeof nomQualifie === 'string' ? nomQualifie : $('liste-procedures').value;
  if (panneauCourant !== 'macros') ouvrirPanneau('macros');
  if (!nom) { $('sortie-vba').innerHTML = ''; journalVBA('Aucune macro à exécuter : créez une Sub sans paramètre (« + Macro »).', 'err'); return; }
  lancerMacro(nom);
  rendreArbreVBA(false);
}
function montrerErreur(nomModule, ligne) {
  const m = nomModule ? classeur.modulesVBA().find((x) => x.nom.toLowerCase() === nomModule.toLowerCase()) : moduleCourant();
  if (m) { afficherModule(m.cle); allerALigne(ligne, true); }
}
function verifierVBA() {
  $('sortie-vba').innerHTML = '';
  let erreurs = 0, total = 0;
  const publiques = new Map();
  for (const m of classeur.modulesVBA()) {
    if (!m.code.trim()) continue;
    try {
      const prog = analyserVBA(m.code);
      total += prog.procedures.size;
      journalVBA('✔ ' + m.libelle + ' : ' + prog.procedures.size + ' procédure(s)' + (prog.procedures.size ? ' — ' + [...prog.procedures.values()].map((p) => p.nom).join(', ') : ''));
      if (m.genre === 'module') for (const p of prog.procedures.values()) { if (p.prive) continue; const k = p.nom.toUpperCase(); if (publiques.has(k)) journalVBA('⚠ « ' + p.nom + ' » existe dans ' + publiques.get(k) + ' et dans ' + m.nom + ' : appelez-la par Module.' + p.nom, 'msg'); else publiques.set(k, m.nom); }
    } catch (e) {
      erreurs++;
      journalVBA('✖ ' + m.libelle + ' : ' + e.message, 'err');
      if (erreurs === 1 && e.ligne) montrerErreur(m.nom, e.ligne);
    }
  }
  if (!erreurs) journalVBA(total ? '✔ Syntaxe correcte dans tout le projet (' + total + ' procédure(s))' : 'Le projet ne contient pas encore de code.');
}

// ----- Boîte « Macros » (Alt+F8), comme dans Excel -----
function ouvrirDialogueMacros() {
  if (edition) validerEdition();
  const d = $('dialogue-macros');
  const sel = $('macros-dans');
  const garde = sel.value;
  sel.innerHTML = '<option value="">Tous les modules</option>';
  for (const m of classeur.modulesVBA()) { const o = document.createElement('option'); o.value = m.cle; o.textContent = m.libelle; sel.appendChild(o); }
  sel.value = [...sel.options].some((o) => o.value === garde) ? garde : '';
  $('macro-nom').value = '';
  d.hidden = false;
  rendreDialogueMacros();
  $('macro-nom').focus();
}
function fermerDialogueMacros() { $('dialogue-macros').hidden = true; }
let macroChoisie = null;
function rendreDialogueMacros() {
  const filtre = $('macros-dans').value;
  const texte = $('macro-nom').value.trim().toLowerCase();
  const liste = $('macros-liste');
  liste.innerHTML = '';
  const macros = toutesProcedures().filter((p) => p.macro && !p.prive && (!filtre || p.cle === filtre));
  let choisi = null;
  for (const p of macros) {
    const d = document.createElement('div');
    d.className = 'macro-item';
    const nomAffiche = p.module.genre === 'module' ? p.nom : p.qualifie;
    d.innerHTML = '<span></span><small></small>';
    d.firstChild.textContent = nomAffiche; d.lastChild.textContent = p.module.libelle;
    if (texte && !nomAffiche.toLowerCase().includes(texte)) d.classList.add('estompe');
    if (!choisi && texte && (nomAffiche.toLowerCase() === texte || p.nom.toLowerCase() === texte)) choisi = p;
    if (macroChoisie && macroChoisie.qualifie === p.qualifie && !texte) choisi = p;
    d.addEventListener('click', () => { $('macro-nom').value = nomAffiche; macroChoisie = p; rendreDialogueMacros(); });
    d.addEventListener('dblclick', () => { fermerDialogueMacros(); executerMacroUI(p.qualifie); });
    d.dataset.q = p.qualifie;
    liste.appendChild(d);
  }
  if (!macros.length) { const v = document.createElement('div'); v.className = 'arbre-vide'; v.textContent = 'Aucune macro. Tapez un nom puis « Créer ».'; liste.appendChild(v); }
  macroChoisie = choisi;
  for (const el of liste.children) el.classList.toggle('choisi', !!choisi && el.dataset.q === choisi.qualifie);
  $('macro-executer').disabled = !choisi; $('macro-modifier').disabled = !choisi; $('macro-supprimer').disabled = !choisi;
  $('macro-creer').disabled = !texte || !!choisi;
}
function cibleCreation() {
  const filtre = $('macros-dans').value;
  if (filtre) return filtre;
  const m = moduleCourant();
  if (m.genre === 'module') return m.cle;
  const premier = classeur.modulesVBA().find((x) => x.genre === 'module');
  return premier ? premier.cle : 'module:' + classeur.ajouterModule();
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
  const tous = [...[...classeur.noms.values()].map((d) => [d, null]), ...[...feuille().noms.values()].map((d) => [d, fi()])];
  for (const [d, local] of tous) {
    const el = document.createElement('div'); el.className = 'nom-defini';
    el.innerHTML = `<b>${echapper(d.nom)}</b><span>${echapper(d.ref)}${local !== null ? ' <i>(feuille « ' + echapper(feuille().nom) + ' »)</i>' : ''}</span>`;
    const aller = document.createElement('button'); aller.textContent = '→'; aller.title = 'Aller à la plage';
    aller.addEventListener('click', () => allerA(d.ref));
    const suppr = document.createElement('button'); suppr.textContent = '✕'; suppr.title = 'Supprimer le nom';
    suppr.addEventListener('click', () => { memoriser(); classeur.supprimerNom(d.nom, local); rendreNoms(); sauvegarderLocal(); rendre(); });
    el.appendChild(aller); el.appendChild(suppr);
    liste.appendChild(el);
  }
  if (!tous.length) liste.innerHTML = '<p style="color:var(--sourd)">Aucun nom. Sélectionnez une plage puis tapez un nom dans la zone à gauche de la barre de formule, ou ajoutez-le ci-dessus.</p>';
}
function allerA(texte) {
  let s = texte.replace(/^=/, '').replace(/\$/g, '');
  const k = s.lastIndexOf('!');
  if (k >= 0) { const i = classeur.indexFeuille(s.slice(0, k).replace(/^'|'$/g, '')); if (i >= 0 && i !== fi()) { memoriserVue(); activerFeuille(i); } s = s.slice(k + 1); }
  const p = plageDepuisTexte(s);
  if (!p) { if (classeur.nom(s, fi())) return allerA(classeur.nom(s, fi())); toast('Plage inconnue : ' + texte, true); return false; }
  curseur = { r: p.r1, c: p.c1 }; selection = { r1: p.r1, c1: p.c1, r2: Math.min(p.r2, p.r1 + 5000), c2: Math.min(p.c2, p.c1 + 200) };
  nbLignes = Math.max(nbLignes, selection.r2 + 60); nbColonnes = Math.max(nbColonnes, selection.c2 + 15);
  geometrie(); defiler(curseur); rendre();
  return true;
}
function rendreAide() {
  $('panneau-aide').innerHTML = `
<p><b>Sprezz</b> : un tableur simple, qui lit et écrit les fichiers Excel, avec les mêmes raccourcis qu'Excel.</p>
<h3>Raccourcis (les mêmes qu'Excel)</h3>
<table class="raccourcis">
<tr><td>Ctrl+C / X / V</td><td>Copier, couper, coller (aussi un graphique ou une image : il se pose sur la cellule choisie)</td></tr>
<tr><td>Ctrl+Alt+V</td><td>Collage spécial (valeurs, formats, transposé, opérations)</td></tr>
<tr><td>Ctrl+Z / Ctrl+Y</td><td>Annuler / rétablir</td></tr>
<tr><td>Ctrl+1</td><td>Format de cellule</td></tr>
<tr><td>Ctrl+B / I / U / 5</td><td>Gras, italique, souligné, barré (aussi Ctrl+2, 3, 4)</td></tr>
<tr><td>Ctrl+Maj+1 … 6</td><td>Nombre, heure, date, monétaire, pourcentage, scientifique ; Ctrl+Maj+~ : standard</td></tr>
<tr><td>Ctrl+Maj+& / _</td><td>Bordure de contour / sans bordure</td></tr>
<tr><td>F2 · Échap · Entrée · Tab</td><td>Modifier · annuler · valider (dans une sélection, on reste dedans)</td></tr>
<tr><td>Alt+Entrée · Ctrl+Entrée</td><td>Retour à la ligne · remplir toute la sélection</td></tr>
<tr><td>F4</td><td>En saisie : $ des références ; sinon : refaire la dernière mise en forme</td></tr>
<tr><td>Ctrl+D / Ctrl+R · Ctrl+'</td><td>Recopier vers le bas / la droite · reprendre la formule du dessus</td></tr>
<tr><td>Ctrl+; · Ctrl+Maj+:</td><td>Date du jour · heure</td></tr>
<tr><td>Alt+= </td><td>Somme automatique</td></tr>
<tr><td>Ctrl+flèches · Ctrl+Maj+flèches</td><td>Au bord des données · en sélectionnant</td></tr>
<tr><td>Ctrl+Début / Fin · Ctrl+Maj+Fin</td><td>Début / fin des données · sélectionner jusqu'à la fin</td></tr>
<tr><td>Ctrl+A · Ctrl+Maj+*</td><td>Le tableau autour, puis toute la feuille · la zone autour</td></tr>
<tr><td>Ctrl+Espace · Maj+Espace</td><td>Colonnes · lignes entières</td></tr>
<tr><td>Ctrl++ / Ctrl+-</td><td>Insérer / supprimer des cellules, lignes ou colonnes</td></tr>
<tr><td>Ctrl+9 / Ctrl+0</td><td>Masquer les lignes / colonnes (avec Maj : les afficher)</td></tr>
<tr><td>Ctrl+F / Ctrl+H · Maj+F4</td><td>Rechercher / remplacer · suivant</td></tr>
<tr><td>Ctrl+G ou F5</td><td>Atteindre une cellule ou un nom</td></tr>
<tr><td>Ctrl+K · Maj+F2</td><td>Lien hypertexte · note</td></tr>
<tr><td>Ctrl+L (ou Ctrl+T)</td><td>Mettre sous forme de tableau</td></tr>
<tr><td>Ctrl+Maj+L</td><td>Filtre automatique</td></tr>
<tr><td>Alt+↓</td><td>Ouvrir la liste déroulante d'une cellule</td></tr>
<tr><td>Alt+F1 ou F11</td><td>Graphique de la sélection</td></tr>
<tr><td>Ctrl+\`</td><td>Afficher les formules</td></tr>
<tr><td>Ctrl+PgSuiv / PgPréc · Maj+F11</td><td>Feuille suivante / précédente (aussi avec Alt) · nouvelle feuille</td></tr>
<tr><td>Maj+F10</td><td>Menu de la cellule</td></tr>
<tr><td>F9 · Ctrl+Alt+F9</td><td>Recalculer · tout recalculer</td></tr>
<tr><td>Ctrl+S · F12 · Ctrl+O · Ctrl+P</td><td>Enregistrer · enregistrer · ouvrir · imprimer</td></tr>
<tr><td>Alt+F11 · Alt+F8</td><td>Éditeur VBA · liste des macros</td></tr>
</table>
<h3>Souris et doigt</h3>
<ul>
<li>Glisser le <b>bord de la sélection</b> la déplace (avec Ctrl : la copie). Double-clic sur la <b>poignée</b> : recopie jusqu'au bout des données voisines. Double-clic sur le bord d'un en-tête : largeur ou hauteur ajustée au contenu.</li>
<li><b>Titre d'un graphique</b> : choisissez le graphique, puis cliquez sur son titre (« Titre du graphique » s'il est vide) ou sur un titre d'axe et écrivez ; Entrée pour valider.</li>
<li><b>Poignée de recopie</b> : séries comme Excel (1, 2… ; janv., févr.… ; lundi, mardi… ; Trimestre 1, 2… ; une date avance d'un jour).</li>
<li>Tout ce qui a un raccourci est aussi dans un menu : clic droit (appui long au doigt) sur une cellule, un graphique, une image ou un onglet, et le menu ⋯ de la barre d'outils.</li>
<li><b>Graphiques et images</b> : un clic (un appui) les choisit, on les glisse n'importe où ; flèches pour les ajuster (Maj : au pixel), Alt en glissant pour les caler sur les cellules, Suppr pour les enlever.</li>
<li>🖌 <b>Pinceau</b> : un clic reproduit la mise en forme une fois, un double-clic plusieurs fois (Échap pour finir). ⊞ fusionne et centre.</li>
<li>En tapant un texte, Sprezz propose celui qui existe déjà dans la colonne (Entrée pour le prendre).</li>
</ul>
<h3>Prise en main</h3>
<ul>
<li>Tapez dans une cellule ; <code>Entrée</code> valide, <code>Tab</code> passe à droite, <code>F2</code> modifie, <code>Échap</code> annule, <code>Suppr</code> efface.</li>
<li>Formules : <code>=SOMME(A1:A10)</code>, <code>=SI(B2&gt;0;"oui";"non")</code>, <code>=VPM(taux/12;n;-capital)</code>, <code>=LOI.NORMALE.STANDARD.N(1,96)</code>, <code>=RECHERCHEV(x;Table;2;FAUX)</code>… Noms anglais et français acceptés, séparateurs <code>;</code> ou <code>,</code>, virgule ou point décimal.</li>
<li>Autres feuilles : <code>=Hypothèses!B2</code>, <code>='Ma feuille'!A1:A9</code>. Noms définis : zone à gauche de la barre de formule.</li>
<li>Pendant la saisie d'une formule, cliquez ou glissez sur la grille pour insérer une référence.</li>
<li>Copier / couper / coller (<code>Ctrl+C/X/V</code>) décale les références relatives (<code>$A$1</code> reste fixe). Poignée en bas à droite : recopie et séries. <code>Ctrl+D</code> recopie vers le bas, <code>Ctrl+R</code> vers la droite.</li>
<li><b>Au doigt</b> (téléphone, tablette) : un appui sélectionne une cellule, un second appui la modifie (le clavier s'ouvre) ; glisser depuis la sélection l'étend, glisser ailleurs fait défiler ; un appui long ouvre le menu (copier, coller, insérer…) sur les cellules, les onglets, les boutons et les graphiques. Le bouton ☰ à gauche de la barre de formule masque les outils (masqués d'office en paysage). ↶ ↷ : annuler, rétablir.</li>
<li><code>Ctrl+Z</code> / <code>Ctrl+Y</code> annuler / rétablir. <code>Ctrl+flèches</code> saute au bord d'un bloc. Clic droit : menu.</li>
<li>Formats : <code>Ctrl+B/I/U</code>, couleurs, alignement, menu <b>Bordures</b>, formats de nombre, boutons de décimales : tout est lu et écrit dans le <code>.xlsx</code>.</li>
<li>Graphiques : sélectionnez la plage (en-têtes compris) puis <b>📈 Graphique</b> : la galerie montre chaque catégorie avec vos données. Déplacez-le par sa barre, redimensionnez par le coin ; ⚙ ou double-clic ouvre ses réglages (type, titres, axes, légende, étiquettes, couleurs, export PNG / SVG) ; <code>Suppr</code> ou ✕ pour l'enlever. Ils sont enregistrés comme de vrais graphiques Excel, et ceux d'un fichier Excel s'affichent ici.</li>
<li><b>Σ</b> (<code>Alt+=</code>) : somme de la colonne au-dessus ou de la ligne à gauche ; ▾ pour moyenne, nb, max, min. Sur une plage : un total sous chaque colonne.</li>
<li><b>⇅ Trier</b> : de A à Z / de Z à A sur la colonne de la cellule active (le tableau autour est trié avec, la ligne d'en-têtes reste en place) ou tri personnalisé sur plusieurs colonnes.</li>
<li><b>⧩ Filtrer</b> (<code>Ctrl+Maj+L</code>) : un ▾ dans chaque en-tête pour trier, cocher les valeurs à garder, chercher, ou poser une condition (supérieur à, contient…). Les numéros des lignes filtrées passent en bleu.</li>
<li><b>🔍</b> (<code>Ctrl+F</code>, <code>Ctrl+H</code>) : rechercher et remplacer, avec les jokers <code>*</code> et <code>?</code>, dans les valeurs ou les formules, sur la feuille ou tout le classeur. <code>F3</code> : suivant.</li>
<li><b>🎨 Conditionnelle</b> : règles rapides (doublons, 10 plus grandes, échelle de couleurs, barres de données…) ou règles sur mesure (valeur, texte, formule comme <code>=$C2&gt;100</code>…), dans l'ordre de priorité.</li>
<li><b>📊 Croisé</b> : tableau croisé dynamique. Placez le curseur dans vos données (une ligne d'en-têtes), créez-le (nouvelle feuille ou cellule choisie), puis rangez chaque champ en Lignes, Colonnes, Valeurs (somme, nombre, moyenne, max, min, écart type… ou % du total) ou Filtres. Les dates se regroupent par années, trimestres ou mois, les nombres par tranches (âges de 10 en 10…). ↻ Actualiser après avoir changé les données.</li>
<li><b>Validation des données</b> (menu ⇅ Trier ou ⋯) : liste déroulante (<code>Oui;Non</code> ou une plage <code>=$H$2:$H$9</code>), nombre entier ou décimal entre deux bornes, date, heure, longueur du texte, formule ; message de saisie et alerte (arrêt, avertissement, information). <code>Alt+↓</code> ouvre la liste. ⭕ entoure les cellules non valides.</li>
<li><b>Saisie des formules</b> : après <code>=</code>, les fonctions qui commencent par ce que vous tapez sont proposées (<code>Tab</code> ou un appui pour choisir, <code>↑ ↓</code> pour parcourir) ; pendant les arguments, une bulle rappelle lesquels sont attendus.</li>
<li><b>❄ Figer</b> : figer les lignes au-dessus et les colonnes à gauche de la cellule active, la première ligne ou la première colonne ; masquer et afficher des lignes ou des colonnes (aussi au clic droit).</li>
<li><b>⋯</b> : <b>Valeur cible</b> (la valeur d'une cellule qui donne le résultat voulu dans une formule : taux, prime…), impression / PDF (<code>Ctrl+P</code>), recalcul.</li>
</ul>
<h3>Fichiers</h3>
<ul>
<li><b>Ouvrir</b> lit .xlsx / .xlsm / .csv (feuilles, formules, formats, styles, largeurs, noms définis), .docx (chaque tableau Word devient une feuille) et les modules VBA .bas / .cls (ajoutés à l'éditeur). Le code VBA d'un .xlsm est extrait et affiché dans l'éditeur. On peut aussi glisser un fichier sur la page.</li>
<li><b>Enregistrer</b> télécharge un .xlsx (ou .xlsm). Les formules sont écrites telles quelles ; Excel les recalcule à l'ouverture. Les macros écrites ici sont conservées dans une feuille masquée <code>_MacrosTableur</code> et rechargées par ce tableur ; le projet VBA d'origine d'un .xlsm est réécrit à l'identique.</li>
<li><b>Plusieurs classeurs ouverts</b> : chaque fichier ouvert ou créé (<b>Nouveau</b>, bouton <b>+</b>) a son onglet en haut ; clic pour passer de l'un à l'autre, double-clic pour renommer, ✕ pour fermer (● = modifié, pas encore enregistré). Copier dans un classeur et coller dans un autre garde les formules ; celles qui citent une feuille ou un nom absent du classeur d'arrivée sont collées en valeur. Annuler (<code>Ctrl+Z</code>) est propre à chaque classeur.</li>
<li>Tous les classeurs ouverts sont gardés dans le navigateur (rechargement de la page sans perte).</li>
<li><b>Fichiers protégés par mot de passe</b> (« Chiffrer avec mot de passe » d'Excel, ou LibreOffice) : le mot de passe est demandé à l'ouverture, le déchiffrement se fait dans le navigateur, rien n'est envoyé. Les protections de feuille ou de classeur (sans chiffrement) et les projets VBA verrouillés s'ouvrent directement : le code est lu quand même.</li>
</ul>
<h3>Macros VBA</h3>
<ul>
<li>Sous-ensemble de VBA : <code>Sub</code>/<code>Function</code>, <code>Dim</code>, tableaux, <code>If</code>, <code>Select Case</code>, <code>For</code>/<code>For Each</code>, <code>Do</code>/<code>While</code>, <code>With</code>, <code>On Error</code>, <code>Collection</code>, <code>Scripting.Dictionary</code>.</li>
<li>Objets : <code>Worksheets("x")</code>, <code>ActiveSheet</code>, <code>Range</code>, <code>Cells</code>, <code>Rows</code>, <code>Columns</code>, <code>Offset</code>, <code>Resize</code>, <code>End(xlUp)</code>, <code>UsedRange</code>, <code>Value</code>, <code>Formula</code>, <code>NumberFormat</code>, <code>Font</code>, <code>Interior</code>, <code>WorksheetFunction.*</code>, <code>MsgBox</code>, <code>InputBox</code>, <code>Debug.Print</code> (sortie sous l'éditeur).</li>
<li><b>Projet VBA</b> (bouton <b>VBA</b>, <code>Alt+F11</code>) : comme dans Excel, chaque feuille a son module de code (<code>Feuil1 (Hypothèses)</code>), le classeur a <code>ThisWorkbook</code>, et vous ajoutez des modules nommés avec <b>+ Module</b> (double-clic pour renommer, clic droit pour supprimer ou exporter en .bas). Sous chaque module s'affichent ses procédures : un clic y mène, un double-clic exécute une macro. Clic droit sur un onglet de feuille : <b>Visualiser le code</b>.</li>
<li>Dans un module de feuille, <code>Range</code>, <code>Cells</code> et <code>Me</code> désignent cette feuille. Une feuille s'appelle aussi par son nom de code : <code>Feuil1.Range("A1")</code> ; une procédure par son module : <code>Module1.MaMacro</code>.</li>
<li><b>Macros</b> (<code>Alt+F8</code>) : la liste de toutes les macros du classeur. Tapez un nom puis <b>Créer</b> pour définir une nouvelle macro, ou choisissez-en une pour l'<b>Exécuter</b>, la <b>Modifier</b> ou la <b>Supprimer</b>. <b>+ Macro</b> crée une macro nommée dans le module affiché.</li>
<li><code>F5</code> exécute la macro où se trouve le curseur (ou celle choisie dans la liste) ; <code>Ctrl+Z</code> annule ses effets sur la feuille active.</li>
<li><b>Boutons</b> : les boutons d'un fichier Excel (« Load Table »…) apparaissent sur la feuille et lancent leur macro. Clic droit pour changer le texte, la macro ou la place ; <b>🔘 Bouton</b> en crée un sur la sélection. Quand une macro demande une plage (<code>Application.InputBox … Type:=8</code>), la sélection en cours est proposée : sélectionnez la plage avant de cliquer.</li>
<li>Les variables <code>Public</code> remplies par une macro restent en mémoire pour les fonctions VBA des cellules (comme dans Excel). Tant qu'elles ne sont pas remplies, les cellules gardent les valeurs enregistrées dans le fichier. <code>F9</code> recalcule, <code>Ctrl+Alt+F9</code> oublie les valeurs du fichier et recalcule tout.</li>
<li>Les <code>Function</code> du code s'utilisent dans les cellules : <code>=MaFonction(A1;B1)</code>. Une plage arrive en <code>Range</code> (<code>For Each c In rg</code>, <code>rg.Value</code>).</li>
</ul>`;
}

// ---------------------------------------------------------------------------
// Événements : grille
// ---------------------------------------------------------------------------

conteneur.addEventListener('scroll', () => { suivreVolets(); rendre(); });
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
  if (uiD.celluleChoisie(cel.r, cel.c)) { e.preventDefault(); return; }
  // Champ de cellule d'un panneau (Solveur, Table de données…) : un clic ou un glissé l'écrit
  const champ = document.activeElement;
  if (champ && champ.classList && champ.classList.contains('champ-ref') && !champ.disabled) { e.preventDefault(); glisse = { mode: 'champ', champ, depart: cel }; ecrireChamp(champ, cel, cel); return; }
  // Bord de la sélection : on la déplace (Ctrl : on la copie), comme dans Excel
  if (e.isTrusted && !edition && !e.shiftKey && surBordSelection(e)) { e.preventDefault(); conteneur.focus(); glisse = { mode: 'deplacer', depart: selectionNormalisee(), cel0: cel, cible: null }; return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !edition) { const lc = feuille().get(cel.r, cel.c); if (lc && lc.lien) { e.preventDefault(); suivreLien(lc.lien); return; } }
  if (graphiqueActif || imageActive) { graphiqueActif = null; imageActive = null; rendre(); }
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
conteneur.addEventListener('mousemove', (e) => { if (glisse || edition || e.buttons) return; const bord = e.target.closest('#cellules, #volets, #grille-conteneur') && !e.target.closest('.graphique, .image-feuille, .bouton-macro') && surBordSelection(e); conteneur.classList.toggle('sur-bord', !!bord); });
document.addEventListener('mousemove', (e) => {
  if (!glisse) return;
  const rect = conteneur.getBoundingClientRect();
  const cel = celluleDepuisPoint(e.clientX - rect.left, e.clientY - rect.top);
  if (glisse.mode === 'cellules') { if (cel.r !== selection.r2 || cel.c !== selection.c2) { selection.r2 = cel.r; selection.c2 = cel.c; defiler(cel); rendre(); } }
  else if (glisse.mode === 'lignes') { selection.r2 = cel.r; rendre(); }
  else if (glisse.mode === 'colonnes') { selection.c2 = cel.c; rendre(); }
  else if (glisse.mode === 'reference') { insererReference(glisse.depart.r, glisse.depart.c, cel.r, cel.c); }
  else if (glisse.mode === 'champ') { ecrireChamp(glisse.champ, glisse.depart, glisse.champ.dataset.plage ? cel : glisse.depart); }
  else if (glisse.mode === 'poignee') {
    const d = glisse.depart;
    const dr = cel.r < d.r1 ? d.r1 - cel.r : cel.r > d.r2 ? cel.r - d.r2 : 0, dc = cel.c < d.c1 ? d.c1 - cel.c : cel.c > d.c2 ? cel.c - d.c2 : 0;
    glisse.cible = dr >= dc ? { r: cel.r, c: null } : { r: null, c: cel.c };
    selection = dr >= dc ? { r1: Math.min(d.r1, cel.r), c1: d.c1, r2: Math.max(d.r2, cel.r), c2: d.c2 } : { r1: d.r1, c1: Math.min(d.c1, cel.c), r2: d.r2, c2: Math.max(d.c2, cel.c) };
    rendre();
  } else if (glisse.mode === 'deplacer') {
    const d = glisse.depart, dr = Math.max(-d.r1, cel.r - glisse.cel0.r), dc = Math.max(-d.c1, cel.c - glisse.cel0.c);
    glisse.cible = dr || dc ? { r: d.r1 + dr, c: d.c1 + dc } : null;
    const fa = $('fantome');
    fa.hidden = !glisse.cible;
    if (glisse.cible) { poser(fa, rectPlage(d.r1 + dr, d.c1 + dc, d.r2 + dr, d.c2 + dc)); fa.classList.toggle('copie', e.ctrlKey || e.metaKey); }
    defiler(cel);
  } else if (glisse.mode === 'graphique' || glisse.mode === 'image') {
    // Déplacement d'un graphique ou d'une image ; Alt : aligné sur les cellules (comme Excel)
    let x = Math.max(0, glisse.x + e.clientX - glisse.x0), y = Math.max(0, glisse.y + e.clientY - glisse.y0);
    if (e.altKey) { x = xCols[indexDepuis(xCols, x + largeurCol(indexDepuis(xCols, x)) / 2)]; y = yLigs[indexDepuis(yLigs, y + hauteurLig(indexDepuis(yLigs, y)) / 2)]; }
    if (glisse.mode === 'graphique') { glisse.g.x = x / Z(); glisse.g.y = y / Z(); } else placerImage(glisse.g, x, y, glisse.w, glisse.h);
    glisse.bouge = true;
    rendre();
  } else if (glisse.mode === 'graphique-redim') { glisse.g.w = Math.max(160, glisse.w + (e.clientX - glisse.x0) / Z()); glisse.g.h = Math.max(110, glisse.h + (e.clientY - glisse.y0) / Z()); rendre(); }
  else if (glisse.mode === 'redim-col') { const w = Math.max(20, (glisse.base + e.clientX - glisse.x0) / Z()); feuille().largeurs[glisse.c] = Math.round(w); rendre(); }
  else if (glisse.mode === 'redim-lig') { const h = Math.max(14, (glisse.base + e.clientY - glisse.y0) / Z()); feuille().hauteurs[glisse.r] = Math.round(h); rendre(); }
});
document.addEventListener('mouseup', (e) => {
  if (!glisse) return;
  const g = glisse; glisse = null;
  if (g.mode === 'deplacer') { $('fantome').hidden = true; if (g.cible) deplacerCellules(g.depart, g.cible, e.ctrlKey || e.metaKey); return; }
  if (g.mode === 'poignee' && g.cible) { selection = g.depart; recopierVers({ r: g.cible.r ?? g.depart.r1, c: g.cible.c ?? g.depart.c1 }); }
  else if (g.mode === 'reference') { edition.refEnCours = null; (edition.origine === 'barre' ? barre : editeur).focus(); }
  else if (g.mode === 'champ') { g.champ.focus(); }
  else if (g.mode === 'redim-col' || g.mode === 'redim-lig') { classeur.modifie(); sauvegarderLocal(); }
  else if (g.mode === 'graphique' || g.mode === 'graphique-redim' || g.mode === 'image') { if (g.bouge || g.mode === 'graphique-redim') { classeur.version++; sauvegarderLocal(); } }
  else if (g.mode === 'poignee') rendre();
  else if (g.mode === 'cellules' && pinceau) appliquerPinceau();
});
function ecrireChamp(champ, a, b) {
  const t = a.r === b.r && a.c === b.c ? adresse(a.r, a.c) : adresse(Math.min(a.r, b.r), Math.min(a.c, b.c)) + ':' + adresse(Math.max(a.r, b.r), Math.max(a.c, b.c));
  if (champ.value === t) return;
  champ.value = t;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  selection = { r1: a.r, c1: a.c, r2: b.r, c2: b.c }; rendre();
}

// ----- Audit des formules : flèches des antécédents et des dépendants -----
function tracer(genre) {
  const F = fi(), { r, c } = curseur;
  // Un nouveau clic sur la même cellule ajoute un niveau (comme Excel)
  const deja = fleches.filter((x) => x.genre === genre);
  let depart = [{ fi: F, r, c }];
  if (deja.length) {
    const vus = new Set(deja.map((x) => genre === 'ant' ? x.de.fi + ',' + x.de.r1 + ',' + x.de.c1 : x.vers.fi + ',' + x.vers.r + ',' + x.vers.c));
    depart = genre === 'ant'
      ? deja.flatMap((x) => { const o = []; for (let i = x.de.r1; i <= Math.min(x.de.r2, x.de.r1 + 40); i++) for (let j = x.de.c1; j <= Math.min(x.de.c2, x.de.c1 + 40); j++) { const cel = classeur.cellule(x.de.fi, i, j); if (cel && cel.f != null) o.push({ fi: x.de.fi, r: i, c: j }); } return o; })
      : deja.map((x) => x.vers);
    depart = depart.filter((d) => !fleches.some((x) => x.genre === genre && (genre === 'ant' ? x.vers.fi === d.fi && x.vers.r === d.r && x.vers.c === d.c : x.de.fi === d.fi && x.de.r1 === d.r && x.de.c1 === d.c)));
    void vus;
  }
  let n = 0;
  for (const d of depart.slice(0, 200)) {
    if (genre === 'ant') for (const p of antecedents(classeur, d.fi, d.r, d.c)) { fleches.push({ genre, de: p, vers: d }); n++; }
    else for (const x of dependants(classeur, d.fi, d.r, d.c)) { fleches.push({ genre, de: { fi: d.fi, r1: d.r, c1: d.c, r2: d.r, c2: d.c }, vers: x }); n++; }
  }
  if (!n) toast(genre === 'ant' ? (deja.length ? 'Pas d\'autre niveau d\'antécédents' : 'Cette cellule ne lit aucune autre cellule') : (deja.length ? 'Pas d\'autre niveau de dépendants' : 'Aucune formule ne lit cette cellule'));
  rendre();
}
// Sauts de page manuels (pointillés) et contour de la zone d'impression, comme l'affichage d'Excel après un aperçu
function rendreSauts(f) {
  const m = f.miseEnPage;
  if (!m) return '';
  let h = '';
  for (const r of m.sautsLignes || []) if (r < nbLignes) h += `<div class="saut-page lig" style="top:${yLigs[r] - 1}px;width:${xCols[nbColonnes]}px"></div>`;
  for (const c of m.sautsColonnes || []) if (c < nbColonnes) h += `<div class="saut-page col" style="left:${xCols[c] - 1}px;height:${yLigs[nbLignes]}px"></div>`;
  for (const z of String(m.zone || '').split(/[;,]/)) { const p = parsePlage(z.replace(/\$/g, '').replace(/^.*!/, '').trim().toUpperCase()); if (p && p.r2 < nbLignes + 1000) h += `<div class="zone-impression" style="left:${xCols[p.c1]}px;top:${yLigs[p.r1]}px;width:${xCols[Math.min(p.c2 + 1, nbColonnes)] - xCols[p.c1]}px;height:${yLigs[Math.min(p.r2 + 1, nbLignes)] - yLigs[p.r1]}px"></div>`; }
  return h;
}
function effacerFleches() { fleches = []; rendre(); }
// Ctrl+[ et Ctrl+] : sélectionne les antécédents / les dépendants directs (le premier groupe, sur cette feuille)
function selectionnerLies(genre) {
  const F = fi();
  const liste = genre === 'ant' ? antecedents(classeur, F, curseur.r, curseur.c).filter((p) => p.fi === F) : dependants(classeur, F, curseur.r, curseur.c).filter((x) => x.fi === F).map((x) => ({ r1: x.r, c1: x.c, r2: x.r, c2: x.c }));
  if (!liste.length) return toast(genre === 'ant' ? 'Aucun antécédent sur cette feuille' : 'Aucun dépendant sur cette feuille');
  const r1 = Math.min(...liste.map((p) => p.r1)), c1 = Math.min(...liste.map((p) => p.c1)), r2 = Math.max(...liste.map((p) => p.r2)), c2 = Math.max(...liste.map((p) => p.c2));
  selection = { r1, c1, r2: Math.min(r2, r1 + 1048575), c2 }; curseur = { r: liste[0].r1, c: liste[0].c1 };
  defiler(curseur); rendre();
  if (liste.length > 1) toast(liste.length + (genre === 'ant' ? ' antécédents' : ' dépendants') + ' (zone qui les contient sélectionnée)');
}
function rendreFleches(F) {
  const liste = fleches.filter((x) => x.vers.fi === F || x.de.fi === F);
  if (!liste.length) return '';
  const centre = (r, c) => [xCols[c] + largeurCol(c) / 2, yLigs[r] + hauteurLig(r) / 2];
  let svg = '';
  for (const x of liste) {
    const erreur = classeur.valeur(x.de.fi, x.de.r1, x.de.c1) instanceof ErreurFormule;
    const coul = erreur ? '#dc2626' : '#2563eb';
    const [x2, y2] = x.vers.fi === F ? centre(x.vers.r, x.vers.c) : [0, 0];
    if (x.de.fi === F && x.vers.fi === F) {
      const [x1, y1] = centre(x.de.r1, x.de.c1);
      if (x.de.r2 > x.de.r1 || x.de.c2 > x.de.c1) svg += `<rect x="${xCols[x.de.c1] + 1}" y="${yLigs[x.de.r1] + 1}" width="${xCols[Math.min(x.de.c2, nbColonnes - 1) + 1] - xCols[x.de.c1] - 2}" height="${yLigs[Math.min(x.de.r2, nbLignes - 1) + 1] - yLigs[x.de.r1] - 2}" fill="none" stroke="${coul}" stroke-width="1.5"/>`;
      svg += `<circle cx="${x1}" cy="${y1}" r="3" fill="${coul}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${coul}" stroke-width="1.5" marker-end="url(#pointe-${erreur ? 'r' : 'b'})"/>`;
    } else if (x.vers.fi === F) {
      // Antécédent sur une autre feuille : petite icône de feuille, trait pointillé
      const ix = Math.max(8, x2 - 70), iy = Math.max(8, y2 - 34);
      svg += `<line x1="${ix + 8}" y1="${iy + 6}" x2="${x2}" y2="${y2}" stroke="#111827" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#pointe-n)"/><rect x="${ix}" y="${iy}" width="16" height="12" fill="#fff" stroke="#111827"/><path d="M${ix} ${iy + 4}h16M${ix + 5} ${iy}v12M${ix + 10} ${iy}v12" stroke="#111827" stroke-width=".8"/><title>${classeur.feuilles[x.de.fi].nom}!${adresse(x.de.r1, x.de.c1)}</title>`;
    } else {
      const [x1, y1] = centre(x.de.r1, x.de.c1);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x1 + 60}" y2="${y1 - 30}" stroke="#111827" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#pointe-n)"/><rect x="${x1 + 60}" y="${y1 - 42}" width="16" height="12" fill="#fff" stroke="#111827"/><title>${classeur.feuilles[x.vers.fi].nom}!${adresse(x.vers.r, x.vers.c)}</title>`;
    }
  }
  const pointe = (id, c) => `<marker id="pointe-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
  return `<svg class="fleches-audit" width="${xCols[nbColonnes]}" height="${yLigs[nbLignes]}"><defs>${pointe('b', '#2563eb')}${pointe('r', '#dc2626')}${pointe('n', '#111827')}</defs>${svg}</svg>`;
}

// Double-clic sur un bord d'en-tête : largeur (ou hauteur) ajustée au contenu ; toutes les colonnes choisies à la fois
function ajusterAuto(el) {
  const f = feuille(), s = selectionNormalisee();
  memoriser();
  if (el.classList.contains('redim-col')) {
    const c0 = +el.dataset.c, entieres = s.r2 >= 1048575 && c0 >= s.c1 && c0 <= s.c2;
    const cols = entieres ? Array.from({ length: Math.min(s.c2, f.zone.c2 + 1) - s.c1 + 1 }, (_, i) => s.c1 + i) : [c0];
    for (const c of cols) {
      let w = 0;
      f.chaque((r, cc, cel) => { if (cc !== c || f.fusions.some((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2 && m.c2 > m.c1)) return; const v = classeur.valeur(fi(), r, cc); if (v === null || v === '') return; w = Math.max(w, largeurTexte(afficherValeur(v, cel.z), cel.s) + 12); });
      if (w) f.largeurs[c] = Math.min(500, Math.max(24, Math.ceil(w / Z())));
    }
  } else {
    const r0 = +el.dataset.r, entieres = s.c2 >= 16383 && r0 >= s.r1 && r0 <= s.r2;
    const lignes = entieres ? Array.from({ length: Math.min(s.r2, f.zone.r2 + 1) - s.r1 + 1 }, (_, i) => s.r1 + i) : [r0];
    for (const r of lignes) {
      let h = 0;
      for (let c = 0; c <= f.zone.c2; c++) {
        const cel = f.get(r, c); if (!cel) continue;
        const t = afficherValeur(classeur.valeur(fi(), r, c), cel.z), taille = (cel.s && cel.s.taille) || 13;
        const n = cel.s && cel.s.renvoi ? Math.max(1, Math.ceil(largeurTexte(t, cel.s) / Math.max(10, largeurCol(c) - 8 * Z()))) + (t.match(/\n/g) || []).length : 1 + (t.match(/\n/g) || []).length;
        h = Math.max(h, n * taille * 1.25 + 6);
      }
      if (h <= HAUTEUR_DEFAUT) delete f.hauteurs[r]; else f.hauteurs[r] = Math.ceil(h);
    }
  }
  classeur.modifie(); sauvegarderLocal(); rendre();
}
// Double-clic sur la poignée : recopie vers le bas jusqu'au bout des données de la colonne voisine (comme Excel)
function recopieDoubleClic() {
  const s = selectionNormalisee(), f = feuille();
  const plein = (r, c) => { const cel = f.get(r, c); return !!cel && (cel.f != null || (cel.v !== null && cel.v !== undefined && cel.v !== '')); };
  let fin = s.r2;
  for (const c of [s.c1 - 1, s.c2 + 1]) { if (c < 0) continue; let r = s.r2; while (plein(r + 1, c) && r < s.r2 + 100000) r++; fin = Math.max(fin, r); }
  if (fin > s.r2) recopierVers({ r: fin, c: s.c1 });
}
// Reproduire la mise en forme (pinceau) : un clic pour une fois, un double-clic pour plusieurs (Échap pour finir)
function prendrePinceau(garder) {
  const s = selectionBornee(), f = feuille();
  const cellules = [];
  for (let r = s.r1; r <= Math.max(s.r1, s.r2); r++) { const l = []; for (let c = s.c1; c <= Math.max(s.c1, s.c2); c++) { const cel = f.get(r, c) || {}; l.push({ s: cel.s ? JSON.parse(JSON.stringify(cel.s)) : undefined, z: cel.z }); } cellules.push(l); }
  pinceau = { cellules, nl: cellules.length, nc: cellules[0].length, garder };
  document.body.classList.add('pinceau'); $('btn-pinceau').classList.add('actif');
  toast(garder ? 'Pinceau : choisissez les cellules à mettre en forme (Échap pour finir)' : 'Pinceau : choisissez les cellules à mettre en forme');
}
function appliquerPinceau() {
  if (!pinceau) return;
  const s = selectionBornee(), f = feuille(), p = pinceau;
  memoriser();
  for (let r = s.r1; r <= Math.max(s.r1, s.r2); r++) for (let c = s.c1; c <= Math.max(s.c1, s.c2); c++) {
    const src = p.cellules[(r - s.r1) % p.nl][(c - s.c1) % p.nc], cel = f.get(r, c) || {};
    if (src.s) cel.s = JSON.parse(JSON.stringify(src.s)); else delete cel.s;
    if (src.z) cel.z = src.z; else delete cel.z;
    f.set(r, c, cel.f == null && (cel.v === null || cel.v === undefined) && !cel.s && !cel.z && !cel.note ? null : cel);
  }
  classeur.modifie(); sauvegarderLocal();
  if (!p.garder) { pinceau = null; document.body.classList.remove('pinceau'); $('btn-pinceau').classList.remove('actif'); }
  rendre();
}
// Saisie semi-automatique du texte (comme Excel) : un texte déjà présent dans la colonne est proposé, la fin sélectionnée
function completerTexte(r, c, t) {
  const f = feuille(), tl = t.toLowerCase(), trouves = new Map();
  const voir = (rr) => { const v = classeur.valeur(fi(), rr, c); if (typeof v === 'string' && v.length > t.length && v.toLowerCase().startsWith(tl)) trouves.set(v.toLowerCase(), v); return v !== null && v !== undefined && v !== ''; };
  for (let rr = r - 1; rr >= 0 && r - rr <= 2000 && voir(rr); rr--);
  for (let rr = r + 1; rr <= f.zone.r2 && rr - r <= 2000 && voir(rr); rr++);
  return trouves.size === 1 ? t + [...trouves.values()][0].slice(t.length) : null;
}
// Pointeur sur le bord de la sélection (hors poignée de recopie)
function surBordSelection(e) {
  const s = selectionNormalisee();
  if (s.r2 >= 1048575 || s.c2 >= 16383) return false;
  const r = rectPlage(s.r1, s.c1, s.r2, s.c2), box = conteneur.getBoundingClientRect();
  const x = e.clientX - box.left + conteneur.scrollLeft, y = e.clientY - box.top + conteneur.scrollTop;
  const pres = 4, dedans = x >= r.left - pres && x <= r.left + r.width + pres && y >= r.top - pres && y <= r.top + r.height + pres;
  if (!dedans || r.width <= 0) return false;
  const coin = x > r.left + r.width - 8 && y > r.top + r.height - 8;
  return !coin && (x < r.left + pres || x > r.left + r.width - pres || y < r.top + pres || y > r.top + r.height - pres);
}
function deplacerCellules(src, cible, copie) {
  memoriser();
  const s2 = { r1: src.r1, c1: src.c1, r2: Math.min(src.r2, Math.max(feuille().zone.r2, src.r1)), c2: Math.min(src.c2, Math.max(feuille().zone.c2, src.c1)) };
  classeur.copier(fi(), s2, cible, !copie);
  // Les fusions déplacées suivent
  if (!copie) for (const m of feuille().fusions) if (m.r1 >= src.r1 && m.r2 <= src.r2 && m.c1 >= src.c1 && m.c2 <= src.c2) { m.r1 += cible.r - src.r1; m.r2 += cible.r - src.r1; m.c1 += cible.c - src.c1; m.c2 += cible.c - src.c1; }
  selection = { r1: cible.r, c1: cible.c, r2: cible.r + src.r2 - src.r1, c2: cible.c + src.c2 - src.c1 }; curseur = { r: cible.r, c: cible.c + (curseur.c - src.c1) };
  curseur.r = cible.r + (curseur.r - src.r1);
  sauvegarderLocal(); rendre();
}
function demarrerRedimension(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.target.classList.contains('redim-col')) { const c = +e.target.dataset.c; glisse = { mode: 'redim-col', c, x0: e.clientX, base: largeurCol(c) }; }
  else { const r = +e.target.dataset.r; glisse = { mode: 'redim-lig', r, y0: e.clientY, base: hauteurLig(r) }; }
}
conteneur.addEventListener('dblclick', (e) => {
  const rect = conteneur.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (e.target.classList.contains('redim-col') || e.target.classList.contains('redim-lig')) { ajusterAuto(e.target); return; }
  if (x < LARGEUR_ENTETE || y < HAUTEUR_DEFAUT) return;
  if (!edition) commencerEdition();
});
conteneur.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = conteneur.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (x >= LARGEUR_ENTETE && y >= HAUTEUR_DEFAUT) { const cel = celluleDepuisPoint(x, y); const s = selectionNormalisee(); if (cel.r < s.r1 || cel.r > s.r2 || cel.c < s.c1 || cel.c > s.c2) { curseur = cel; selection = { r1: cel.r, c1: cel.c, r2: cel.r, c2: cel.c }; rendre(); } }
  const s = selectionNormalisee();
  ouvrirMenu(e.clientX, e.clientY, menuCellules(s));
});
// Menu des cellules (clic droit, appui long) : court, le reste dans des sous-menus ▸
function menuCellules(s) {
  const nl = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
  const pl = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
  const cel = feuille().get(curseur.r, curseur.c) || {};
  const effacer = (tout) => { memoriser(); classeur.effacer(fi(), s.r1, s.c1, Math.min(s.r2, feuille().zone.r2), Math.min(s.c2, feuille().zone.c2), tout); sauvegarderLocal(); rendre(); };
  const fusion = feuille().fusions.some((m) => m.r1 === s.r1 && m.c1 === s.c1);
  return [
    ['Couper', () => copier(true), 'Ctrl+X'], ['Copier', () => copier(false), 'Ctrl+C'], ['Coller', () => coller(), 'Ctrl+V'],
    ['Collage spécial', [['Valeurs', () => collerValeurs()], ['Collage spécial…', () => uiB.collageSpecial(), 'Ctrl+Alt+V']]], null,
    ['Insérer', [['Insérer ' + pl(nl, 'ligne'), () => lignesColonnes(true, 'r')], ['Insérer ' + pl(nc, 'colonne'), () => lignesColonnes(true, 'c')], ['Insérer des cellules…', () => uiB.cellules(true), 'Ctrl++']]],
    ['Supprimer', [['Supprimer ' + pl(nl, 'ligne'), () => lignesColonnes(false, 'r')], ['Supprimer ' + pl(nc, 'colonne'), () => lignesColonnes(false, 'c')], ['Supprimer des cellules…', () => uiB.cellules(false), 'Ctrl+-']]],
    ['Effacer', [['Le contenu', () => effacer(false), 'Suppr'], ['Les formats', () => effacerFormats()], ['Tout', () => effacer(true)], ...(cel.note ? [['La note', () => { memoriser(); delete cel.note; classeur.modifie(); sauvegarderLocal(); rendre(); }]] : [])]], null,
    ['Remplir', [['Vers le bas', () => recopier('bas'), 'Ctrl+D'], ['Vers la droite', () => recopier('droite'), 'Ctrl+R'], ['Jusqu\'au bout des données voisines', () => recopieDoubleClic(), 'double-clic ■'], ['Formule de la cellule du dessus', () => { if (curseur.r > 0) commencerEdition(classeur.saisie(fi(), curseur.r - 1, curseur.c)); }, "Ctrl+'"]]],
    ['Format de cellule…', () => uiB.formatCellule(), 'Ctrl+1'],
    [fusion ? 'Dissocier les cellules' : 'Fusionner et centrer', () => fusionnerSelection(!fusion)],
    [cel.note ? 'Modifier la note…' : 'Insérer une note…', () => uiB.note(), 'Maj+F2'],
    [cel.lien ? 'Modifier le lien…' : 'Lien hypertexte…', () => uiB.lien(), 'Ctrl+K'],
    ...(cel.lien ? [['Ouvrir le lien', () => suivreLien(cel.lien)]] : []),
    ...(validationDe(feuille(), curseur.r, curseur.c)?.type === 'liste' ? [['Choisir dans la liste…', () => uiD.validation.ouvrirListe(curseur.r, curseur.c, $('curseur').getBoundingClientRect()), 'Alt+↓']] : []),
    null,
    ['Données', [['Trier de A à Z', () => uiD.trierRapide(false)], ['Trier de Z à A', () => uiD.trierRapide(true)], ['Tri personnalisé…', () => uiD.ouvrirTri()], [feuille().filtre ? 'Retirer le filtre' : 'Filtrer', () => uiD.basculerFiltre(), 'Ctrl+Maj+L'], null,
      ['Supprimer les doublons…', () => uiB.doublons()], ['Convertir en colonnes…', () => uiB.colonnes()], ['Validation des données…', () => uiD.validation.ouvrir()], ['Mettre sous forme de tableau', () => mettreEnTableau(), 'Ctrl+L']]],
    ['Mise en forme conditionnelle…', () => uiD.ouvrirMfc()],
    ...menuTableau(),
    ...((feuille().sparklines || []).some((x) => x.r === curseur.r && x.c === curseur.c) ? [['Sparkline', [['Modifier le groupe…', () => uiB.sparklines(null, (feuille().sparklines.find((x) => x.r === curseur.r && x.c === curseur.c) || {}).groupe)],
      ['Supprimer', () => { memoriser('formatCellules'); feuille().sparklines = feuille().sparklines.filter((x) => !(x.r === curseur.r && x.c === curseur.c)); classeur.version++; sauvegarderLocal(); rendre(); }],
      ['Supprimer le groupe', () => { const gr = feuille().sparklines.find((x) => x.r === curseur.r && x.c === curseur.c).groupe; memoriser('formatCellules'); feuille().sparklines = feuille().sparklines.filter((x) => x.groupe !== gr); classeur.version++; sauvegarderLocal(); rendre(); }]]]] : []),
    ...(uiT.sousCurseur() ? [['Tableau croisé', [['Modifier les champs…', () => uiT.ouvrir()], ['Actualiser', () => { uiT.ouvrir(); uiT.toutActualiser(); }]]]] : [['Tableau croisé dynamique…', () => uiT.ouvrir()]]),
    ['Masquer / afficher', [
      ...(s.r2 >= 1048575 ? [] : [['Masquer les lignes', () => uiD.masquer('r', false), 'Ctrl+9'], ['Afficher les lignes masquées', () => uiD.masquer('r', true), 'Ctrl+Maj+9']]),
      ...(s.c2 >= 16383 ? [] : [['Masquer les colonnes', () => uiD.masquer('c', false), 'Ctrl+0'], ['Afficher les colonnes masquées', () => uiD.masquer('c', true), 'Ctrl+Maj+0']])]],
    ['Définir un nom…', () => { const n = prompt('Nom pour ' + zoneNom.value + ' :'); if (n) try { classeur.definirNom(n, feuille().nom + '!' + adresseAbsolue(s)); sauvegarderLocal(); toast('Nom « ' + n + ' » défini'); } catch (err) { toast(err.message, true); } }],
  ];
}
// Sous-menu du tableau structuré sous le curseur
function menuTableau() {
  const x = classeur.tableauEn(fi(), curseur.r, curseur.c);
  if (!x) return [];
  const t = x.t, fait = (fn) => () => { memoriser(); fn(); sauvegarderLocal(); rendre(); };
  const choisir = (r1, c1, r2, c2) => () => { selection = { r1, c1, r2, c2 }; curseur = { r: r1, c: c1 }; rendre(); };
  const d1 = t.r1 + 1, d2 = t.totaux ? t.r2 - 1 : t.r2;
  return [['Tableau « ' + t.nom + ' »', [
    [t.totaux ? 'Retirer la ligne de total' : 'Ligne de total', fait(() => classeur.ligneTotal(fi(), t, !t.totaux)), 'Ctrl+Maj+T'],
    ['Style du tableau…', () => uiB.styleTableau(t)], ['Renommer le tableau…', () => uiB.renommerTableau(t)], ['Redimensionner…', () => uiB.redimensionnerTableau(t)], null,
    ['Sélectionner', [['La colonne (données)', choisir(d1, curseur.c, d2, curseur.c), 'Ctrl+Espace'], ['La ligne du tableau', choisir(curseur.r, t.c1, curseur.r, t.c2), 'Maj+Espace'], ['Tout le tableau', choisir(t.r1, t.c1, t.r2, t.c2), 'Ctrl+A']]],
    ['Insérer une ligne au-dessus', fait(() => { classeur.insererLignes(fi(), Math.max(curseur.r, d1), 1); })], ['Insérer une colonne à gauche', fait(() => { classeur.insererColonnes(fi(), curseur.c, 1); if (curseur.c === t.c1) { t.c1--; } const n = classeur.nomsColonnes(fi(), t); feuille().set(t.r1, curseur.c, { v: n[curseur.c - t.c1] }); t.colonnes = classeur.nomsColonnes(fi(), t); })], null,
    ['Convertir en plage', () => { if (!confirm('Convertir le tableau « ' + t.nom + ' » en plage normale ? Les formules qui le citent passent en références A1.')) return; fait(() => classeur.supprimerTableau(fi(), t))(); }],
  ]]];
}
function lignesColonnes(inserer, axe) {
  const s = selectionNormalisee(); memoriser((inserer ? 'inserer' : 'supprimer') + (axe === 'r' ? 'Lignes' : 'Colonnes'));
  if (axe === 'r') { const n = s.r2 - s.r1 + 1; if (inserer) classeur.insererLignes(fi(), s.r1, n); else classeur.supprimerLignes(fi(), s.r1, n); }
  else { const n = s.c2 - s.c1 + 1; if (inserer) classeur.insererColonnes(fi(), s.c1, n); else classeur.supprimerColonnes(fi(), s.c1, n); }
  sauvegarderLocal(); rendre();
}
function effacerFormats() { const s = selectionBornee(); memoriser(); for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) { const cel = feuille().get(r, c); if (!cel) continue; delete cel.s; delete cel.z; feuille().set(r, c, cel.f == null && (cel.v === null || cel.v === undefined) && !cel.note ? null : cel); } classeur.modifie(); sauvegarderLocal(); rendre(); }
function fusionnerSelection(oui, centrer = true) {
  const s = selectionNormalisee(), f = feuille();
  memoriser();
  f.fusions = f.fusions.filter((m) => !(m.r2 >= s.r1 && m.r1 <= s.r2 && m.c2 >= s.c1 && m.c1 <= s.c2));
  if (oui && (s.r2 > s.r1 || s.c2 > s.c1) && s.r2 < 1048575 && s.c2 < 16383) {
    f.fusions.push({ r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 });
    if (centrer) classeur.style(fi(), s.r1, s.c1, { align: 'center' });
  }
  classeur.modifie(); sauvegarderLocal(); rendre();
}
function insererImage(fichier) {
  const lecteur = new FileReader();
  lecteur.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 420 / img.naturalWidth, 320 / img.naturalHeight);
      memoriser();
      const im = { id: 'i' + Date.now().toString(36), src: lecteur.result, titre: fichier.name };
      placerImage(im, xCols[curseur.c], yLigs[curseur.r], Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
      feuille().images.push(im); imageActive = im.id; graphiqueActif = null;
      classeur.version++; sauvegarderLocal(); rendre();
      toast('Image insérée : glissez-la pour la placer, Suppr pour l\'enlever');
    };
    img.src = lecteur.result;
  };
  lecteur.readAsDataURL(fichier);
}
function suivreLien(url) {
  if (!url) return;
  if (url.startsWith('#')) { allerA(url.slice(1)); return; }
  window.open(url, '_blank', 'noopener');
}
// Mettre sous forme de tableau (Ctrl+L) : en-têtes colorés, lignes à bandes, bordures fines et filtre
function mettreEnTableau() { uiB.creerTableau(); }
function adresseAbsolue(s) { const a = adresse(s.r1, s.c1, true, true); return s.r1 === s.r2 && s.c1 === s.c2 ? a : a + ':' + adresse(s.r2, s.c2, true, true); }
async function collerValeurs() {
  const dest = selectionNormalisee();
  if (!pressePapier) return coller();
  memoriser();
  const src = pressePapier; const sf = src.feuille, sc = src.classeur, sfi = sc.feuilles.indexOf(sf);
  for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) { const cel = sf.get(r, c); const v = cel && sfi >= 0 ? sc.valeur(sfi, r, c) : null; feuille().set(dest.r1 + r - src.r1, dest.c1 + c - src.c1, cel ? { v: v instanceof ErreurFormule ? null : v, z: cel.z, s: cel.s } : null); }
  feuille().recalculerZone(); classeur.modifie(); sauvegarderLocal(); rendre();
}

conteneur.addEventListener('keydown', (e) => {
  if (edition) return;
  if (uiD.validation.toucheListe(e)) return;
  if (raccourciExcel(e)) return;
  if (e.altKey && e.key === 'ArrowDown') { const dv = validationDe(feuille(), curseur.r, curseur.c); if (dv && dv.type === 'liste') { e.preventDefault(); return uiD.validation.ouvrirListe(curseur.r, curseur.c, $('curseur').getBoundingClientRect()); } }
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  // Graphique ou image choisi : Suppr l'enlève, les flèches le déplacent, Échap revient aux cellules
  if ((k === 'Delete' || k === 'Backspace') && objetSelectionne()) { e.preventDefault(); supprimerObjet(); return; }
  if (objetSelectionne() && !ctrl && k.startsWith('Arrow')) { e.preventDefault(); const p = e.shiftKey ? 1 : 8; deplacerObjet(k === 'ArrowLeft' ? -p : k === 'ArrowRight' ? p : 0, k === 'ArrowUp' ? -p : k === 'ArrowDown' ? p : 0); return; }
  if (k === 'Escape' && objetSelectionne()) { graphiqueActif = null; imageActive = null; return rendre(); }
  const mouv = (dr, dc) => { e.preventDefault(); if (ctrl) { const p = sautCtrl(dr, dc); if (e.shiftKey) placerCurseur(p.r, p.c, true); else placerCurseur(p.r, p.c); } else { const base = e.shiftKey ? { r: selection.r2, c: selection.c2 } : curseur; placerCurseur(base.r + dr, base.c + dc, e.shiftKey); } };
  if (k === 'ArrowDown') return mouv(1, 0); if (k === 'ArrowUp') return mouv(-1, 0); if (k === 'ArrowRight') return mouv(0, 1); if (k === 'ArrowLeft') return mouv(0, -1);
  if (k === 'Enter') { e.preventDefault(); if (suivantDansSelection(e.shiftKey ? -1 : 1, 0)) return; return placerCurseur(curseur.r + (e.shiftKey ? -1 : 1), curseur.c); }
  if (k === 'Tab') { e.preventDefault(); if (suivantDansSelection(0, e.shiftKey ? -1 : 1)) return; return placerCurseur(curseur.r, curseur.c + (e.shiftKey ? -1 : 1)); }
  if (k === 'Home') { e.preventDefault(); return ctrl ? placerCurseur(0, 0) : placerCurseur(curseur.r, 0); }
  if (k === 'End' && ctrl) { e.preventDefault(); return placerCurseur(Math.max(0, feuille().zone.r2), Math.max(0, feuille().zone.c2)); }
  if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor((conteneur.clientHeight - HAUTEUR_DEFAUT) / HAUTEUR_DEFAUT) - 1); return placerCurseur(curseur.r + (k === 'PageDown' ? n : -n), curseur.c, e.shiftKey); }
  if (k === 'Delete') { e.preventDefault(); const s = selectionBornee(); memoriser(plageVerrouillee(s) ? null : 'cellules'); classeur.effacer(fi(), s.r1, s.c1, s.r2, s.c2); sauvegarderLocal(); return rendre(); }
  if (k === 'Backspace') { e.preventDefault(); return commencerEdition(''); }
  if (k === 'F2') { e.preventDefault(); return commencerEdition(); }
  if (k === 'F9') { e.preventDefault(); if (ctrl && e.altKey) { classeur.abandonnerCaches(); classeur.evaluateur.recalculerTout(); actualiserTablesDonnees(classeur); toast('Tout est recalculé (valeurs du fichier oubliées)'); return rendre(); } return recalculer(); }
  if (k === 'F5' && panneauCourant === 'macros') { e.preventDefault(); return executerMacroUI(); }
  if (k === 'F11' && e.altKey) { e.preventDefault(); return ouvrirPanneau('macros'); }
  if (k === 'F8' && e.altKey) { e.preventDefault(); return ouvrirDialogueMacros(); }
  if (k === '=' && e.altKey) { e.preventDefault(); return uiD.sommeAuto(); }
  if (k === 'F3' || (k === 'F4' && e.shiftKey)) { e.preventDefault(); return uiD.rechercherSuivant(e.shiftKey && k === 'F3' ? -1 : 1); }
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
    if (K === 'f') { e.preventDefault(); return uiD.ouvrirRecherche(false); }
    if (K === 'h') { e.preventDefault(); return uiD.ouvrirRecherche(true); }
    if (K === 'l' && e.shiftKey) { e.preventDefault(); return uiD.basculerFiltre(); }
    if (K === 'p') { e.preventDefault(); return uiP.ouvrir(); }
    if (k === ';') { e.preventDefault(); const d = new Date(); return (memoriser(), classeur.saisir(fi(), curseur.r, curseur.c, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`), sauvegarderLocal(), rendre()); }
    return;
  }
  if (k.length === 1 && !e.altKey) { e.preventDefault(); commencerEdition(k); }
});

// ---------------------------------------------------------------------------
// Raccourcis d'Excel (mêmes touches, pour ne rien réapprendre)
// ---------------------------------------------------------------------------
const FORMATS_RAPIDES = { Digit1: '#,##0.00', Digit2: 'hh:mm', Digit3: 'dd/mm/yyyy', Digit4: '#,##0.00 €', Digit5: '0%', Digit6: '0.00E+00', Backquote: '' };
function poserFormat(z) { surSelection((r, c) => { if (z || feuille().get(r, c)) classeur.format(fi(), r, c, z || null); }); derniereAction = () => poserFormat(z); }
function selectionRegion() { const s = selectionNormalisee(); if (s.r1 === s.r2 && s.c1 === s.c2) { const z = uiD.zone(s); if (z.r2 > z.r1 || z.c2 > z.c1) return z; } return null; }
function raccourciExcel(e) {
  const ctrl = e.ctrlKey || e.metaKey, k = e.key, code = e.code;
  const fait = (fn) => { e.preventDefault(); fn(); return true; };
  if (ctrl && e.altKey && (k === 'v' || k === 'V')) return fait(() => uiB.collageSpecial());
  if (ctrl && e.altKey && (code === 'Equal' || code === 'NumpadAdd' || k === '=' || k === '+')) return fait(() => zoomPas(1));
  if (ctrl && e.altKey && (code === 'Minus' || code === 'NumpadSubtract' || k === '-' || k === '6')) return fait(() => zoomPas(-1));
  if (ctrl && !e.altKey && (k === '+' || code === 'NumpadAdd' || (code === 'Equal' && e.shiftKey))) return fait(() => uiB.cellules(true));
  if (ctrl && e.shiftKey && FORMATS_RAPIDES[code] !== undefined) return fait(() => poserFormat(FORMATS_RAPIDES[code]));
  if (ctrl && e.shiftKey && code === 'Digit7') return fait(() => { appliquerBordures('contour'); derniereAction = () => appliquerBordures('contour'); });
  if (ctrl && e.shiftKey && (code === 'Minus' || k === '_')) return fait(() => appliquerBordures('aucune'));
  if (ctrl && e.shiftKey && code === 'Digit9') return fait(() => uiD.masquer('r', true));
  if (ctrl && e.shiftKey && code === 'Digit0') return fait(() => uiD.masquer('c', true));
  if (ctrl && e.shiftKey && (code === 'Digit8' || k === '*')) return fait(() => { const z = uiD.zone(selectionNormalisee()); selection = { ...z }; rendre(); });
  if (ctrl && e.shiftKey && (k === 'F' || k === 'f' || k === 'P' || k === 'p')) return fait(() => uiB.formatCellule('police'));
  if (ctrl && e.shiftKey && !e.altKey && (k === 'T' || k === 't')) { const x = classeur.tableauEn(fi(), curseur.r, curseur.c); if (x) return fait(() => { memoriser(); classeur.ligneTotal(fi(), x.t, !x.t.totaux); sauvegarderLocal(); rendre(); }); }
  if (ctrl && e.shiftKey && (k === ':' || code === 'Semicolon' || code === 'Period')) return fait(() => { const d = new Date(); memoriser(); classeur.saisir(fi(), curseur.r, curseur.c, String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); sauvegarderLocal(); rendre(); });
  if (ctrl && !e.shiftKey && !e.altKey) {
    if (code === 'Digit1' || code === 'Numpad1') return fait(() => uiB.formatCellule());
    if (code === 'Digit2') return fait(() => basculerStyle('gras'));
    if (code === 'Digit3') return fait(() => basculerStyle('italique'));
    if (code === 'Digit4') return fait(() => basculerStyle('souligne'));
    if (code === 'Digit5') return fait(() => { basculerStyle('barre'); derniereAction = () => basculerStyle('barre'); });
    if (code === 'Digit9') return fait(() => uiD.masquer('r', false));
    if (code === 'Digit0') return fait(() => uiD.masquer('c', false));
    if (code === 'Backquote' || k === '`' || k === '²') return fait(() => { afficherFormules = !afficherFormules; toast(afficherFormules ? 'Formules affichées (Ctrl+` pour revenir)' : 'Résultats affichés'); rendre(); });
    if ((code === 'Space' || k === ' ') && classeur.tableauEn(fi(), curseur.r, curseur.c)) {
      // Dans un tableau : d'abord les données de la colonne, puis la colonne entière
      const t = classeur.tableauEn(fi(), curseur.r, curseur.c).t, s = selectionNormalisee(), d2 = t.totaux ? t.r2 - 1 : t.r2;
      if (!(s.r1 === t.r1 + 1 && s.r2 === d2)) return fait(() => { selection = { r1: t.r1 + 1, c1: s.c1, r2: d2, c2: s.c2 }; rendre(); });
    }
    if (code === 'Space' || k === ' ') return fait(() => { const s = selectionNormalisee(); selection = { r1: 0, c1: s.c1, r2: 1048575, c2: s.c2 }; rendre(); });
    if (k === '-' || code === 'NumpadSubtract' || code === 'Minus') return fait(() => uiB.cellules(false));
    if (k === 'k' || k === 'K') return fait(() => uiB.lien());
    if (k === 'g' || k === 'G') return fait(() => uiB.atteindre());
    if (k === 'l' || k === 'L') return fait(() => mettreEnTableau());
    if (k === 't' || k === 'T') return fait(() => mettreEnTableau());
    if (k === "'" || code === 'Quote') return fait(() => { if (curseur.r > 0) commencerEdition(classeur.saisie(fi(), curseur.r - 1, curseur.c)); });
    if (k === 'PageDown' || k === 'PageUp') return fait(() => changerFeuille(k === 'PageDown' ? 1 : -1));
    if (k === 'Backspace') return fait(() => defiler(curseur));
    if (k === 'F1') return fait(() => $('btn-outils').click());
    if (k === 'F3') return fait(() => ouvrirPanneau('noms'));
    if (k === 'e' || k === 'E') return fait(() => uiA.remplissage());
    if (k === '[' || code === 'BracketLeft') return fait(() => selectionnerLies('ant'));
    if (k === ']' || code === 'BracketRight') return fait(() => selectionnerLies('dep'));
    if (k === 'a' || k === 'A') { const z = selectionRegion(); if (z && !(selection.r1 === z.r1 && selection.r2 === z.r2 && selection.c1 === z.c1 && selection.c2 === z.c2)) return fait(() => { selection = { ...z }; rendre(); }); }
  }
  if (ctrl && e.shiftKey && (k === 'End' || k === 'Home')) return fait(() => { if (k === 'End') { selection.r2 = Math.max(0, feuille().zone.r2); selection.c2 = Math.max(0, feuille().zone.c2); } else { selection.r2 = 0; selection.c2 = 0; } rendre(); });
  if (ctrl && e.altKey && (k === 'PageDown' || k === 'PageUp')) return fait(() => changerFeuille(k === 'PageDown' ? 1 : -1));
  if (ctrl && e.altKey && k === 'F5') return fait(() => { uiT.toutActualiser(); actualiserTablesDonnees(classeur); rendre(); sauvegarderLocal(); toast('Tout est actualisé'); });
  if (!ctrl && e.shiftKey && (code === 'Space' || k === ' ')) return fait(() => { const s = selectionNormalisee(); selection = { r1: s.r1, c1: 0, r2: s.r2, c2: 16383 }; rendre(); });
  if (!ctrl && e.shiftKey && k === 'F2') return fait(() => uiB.note());
  if ((e.shiftKey && k === 'F10') || k === 'ContextMenu') return fait(() => { const r = $('curseur').getBoundingClientRect(); ouvrirMenu(r.left + 10, r.bottom, menuCellules(selectionNormalisee())); });
  if (!ctrl && !e.shiftKey && k === 'F12') return fait(() => enregistrer());
  if (ctrl && !e.shiftKey && k === 'F12') return fait(() => $('fichier').click());
  if (ctrl && !e.shiftKey && k === 'F2') return fait(() => uiP.ouvrir());
  if (!ctrl && e.shiftKey && k === 'F11') return fait(() => { memoriserVue(); classeur.ajouterFeuille(null, fi() + 1); activerFeuille(fi() + 1); sauvegarderLocal(); });
  if (!ctrl && e.shiftKey && k === 'F3') return fait(() => ouvrirPanneau('fonctions'));
  if (!ctrl && e.shiftKey && k === 'F4') return fait(() => uiD.rechercherSuivant(1));
  if ((e.altKey && k === 'F1') || (!ctrl && !e.altKey && !e.shiftKey && k === 'F11')) return fait(() => uiG.insererDirect());
  if (!ctrl && !e.altKey && !e.shiftKey && k === 'F5' && panneauCourant !== 'macros') return fait(() => uiB.atteindre());
  if (!ctrl && !e.altKey && !e.shiftKey && k === 'F4' && derniereAction) return fait(() => derniereAction());
  if (k === 'Escape' && pinceau) return fait(() => { pinceau = null; document.body.classList.remove('pinceau'); $('btn-pinceau').classList.remove('actif'); });
  return false;
}
function changerFeuille(sens) {
  const n = classeur.feuilles.length; let i = fi();
  for (let k = 0; k < n; k++) { i = (i + sens + n) % n; if (!classeur.feuilles[i].cachee) break; }
  if (i !== fi()) { memoriserVue(); activerFeuille(i); }
}
// Entrée / Tab dans une sélection de plusieurs cellules : on reste dedans (comme Excel)
function suivantDansSelection(dr, dc) {
  const s = selectionNormalisee();
  if (s.r1 === s.r2 && s.c1 === s.c2 || s.r2 >= 1048575 || s.c2 >= 16383) return false;
  let { r, c } = curseur;
  if (dr) { r += dr; if (r > s.r2) { r = s.r1; c = c + 1 > s.c2 ? s.c1 : c + 1; } else if (r < s.r1) { r = s.r2; c = c - 1 < s.c1 ? s.c2 : c - 1; } }
  else { c += dc; if (c > s.c2) { c = s.c1; r = r + 1 > s.r2 ? s.r1 : r + 1; } else if (c < s.c1) { c = s.c2; r = r - 1 < s.r1 ? s.r2 : r - 1; } }
  curseur = { r, c }; defiler(curseur); rendre();
  return true;
}
// Coller depuis l'extérieur (texte tabulé)
// Rechercher / remplacer : aussi quand le focus est ailleurs que dans la grille (panneau, barre d'outils)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || edition || conteneur.contains(e.target)) return;
  const K = e.key.toLowerCase();
  if ((K === 'f' || K === 'h') && e.target.id !== 'code-vba') { e.preventDefault(); uiD.ouvrirRecherche(K === 'h'); }
});
conteneur.addEventListener('paste', (e) => { if (edition) return; e.preventDefault(); coller(e.clipboardData.getData('text/plain')); });

// ----- Éditeur de cellule -----
editeur.addEventListener('input', () => { barre.value = editeur.value; edition.refEnCours = null; ajusterEditeur(); positionnerSelection(); });
editeur.addEventListener('input', (e) => {
  if (!edition || edition.origine !== 'cellule' || !e.inputType || !e.inputType.startsWith('insert')) return;
  const t = editeur.value;
  if (!t || t.startsWith('=') || /^[\d\s.,+\-]/.test(t) || editeur.selectionStart !== t.length) return;
  const prop = completerTexte(edition.r, edition.c, t);
  if (prop) { editeur.value = prop; editeur.setSelectionRange(t.length, prop.length); barre.value = prop; }
});
editeur.addEventListener('keydown', (e) => toucheEdition(e, 'cellule'));
barre.addEventListener('focus', () => { if (barre.classList.contains('fantome')) { barre.value = ''; barre.classList.remove('fantome'); } if (!edition) { edition = { r: curseur.r, c: curseur.c, origine: 'barre' }; positionnerSelection(); } });
barre.addEventListener('input', () => { if (edition) { editeur.value = barre.value; edition.refEnCours = null; positionnerSelection(); } });
barre.addEventListener('keydown', (e) => toucheEdition(e, 'barre'));
barre.addEventListener('blur', () => { if (edition && edition.origine === 'barre' && !glisse) setTimeout(() => { if (edition && edition.origine === 'barre' && document.activeElement !== barre) validerEdition(); }, 150); });
editeur.addEventListener('blur', () => { if (edition && edition.origine === 'cellule' && !glisse) setTimeout(() => { if (edition && edition.origine === 'cellule' && document.activeElement !== editeur && document.activeElement !== barre) validerEdition(); }, 150); });

// ----- Saisie semi-automatique des formules : noms de fonctions et aide sur les arguments -----
const boiteSugg = document.createElement('div'); boiteSugg.id = 'suggestions-formule'; boiteSugg.hidden = true; document.body.appendChild(boiteSugg);
const bulleArgs = document.createElement('div'); bulleArgs.id = 'aide-arguments'; bulleArgs.hidden = true; document.body.appendChild(bulleArgs);
let sugg = null; // { liste, i, debut, fin, navigue }
const NOMS_PROPOSES = (() => {
  const fr = Object.keys(ALIAS).filter((n) => !['VRAI', 'FAUX'].includes(n)).map((n) => ({ nom: n, en: fonction(n) ? fonction(n).nom : ALIAS[n], fr: true }));
  const en = NOMS_FONCTIONS.filter((n) => !['TRUE', 'FALSE'].includes(n)).map((n) => ({ nom: n, en: n, fr: false }));
  return [...fr, ...en];
})();
function aideDe(nom) { const f = fonction(nom); return f ? AIDE[f.nom] || AIDE[nom.toUpperCase()] : null; }
function fermerSuggestions() { boiteSugg.hidden = true; bulleArgs.hidden = true; sugg = null; }
function cibleEdition() { return edition ? (edition.origine === 'barre' ? barre : editeur) : null; }
function placerSous(el, cible) { const r = cible.getBoundingClientRect(); el.style.left = Math.max(4, Math.min(r.left, window.innerWidth - el.offsetWidth - 4)) + 'px'; const h = el.offsetHeight; el.style.top = (r.bottom + h + 4 > window.innerHeight ? Math.max(4, r.top - h - 2) : r.bottom + 2) + 'px'; }
function majSuggestions() {
  const cible = cibleEdition();
  if (!cible || !cible.value.startsWith('=') || cible.selectionStart !== cible.selectionEnd) return fermerSuggestions();
  const avant = cible.value.slice(0, cible.selectionStart);
  if ((avant.match(/"/g) || []).length % 2) return fermerSuggestions();
  // 0. Colonne d'un tableau : Tableau1[Pr… ou [@Pr…
  const mt = /(?:^|[^\wÀ-ÿ.])([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)?\[(@?)([^\[\]'"]*)$/.exec(avant);
  if (mt) {
    const x = mt[1] ? classeur.tableau(mt[1]) : edition && classeur.tableauEn(fi(), edition.r, edition.c);
    if (x) {
      const P = mt[3].toLowerCase();
      const cols = classeur.nomsColonnes(x.fi, x.t).map((n) => ({ nom: /[\s\[\]#'@,;:]/.test(n) && mt[2] ? '[' + n + ']' : n, nomDefini: true, ref: 'colonne de ' + x.t.nom, suffixe: ']' }));
      const mots = mt[2] ? [] : ['#Tout', '#Données', '#En-têtes', '#Totaux'].map((n) => ({ nom: n, nomDefini: true, ref: '', suffixe: ']' }));
      const liste0 = [...cols, ...mots].filter((y) => y.nom.toLowerCase().replace(/^\[/, '').startsWith(P)).slice(0, 10);
      if (liste0.length) {
        sugg = { liste: liste0, i: 0, debut: avant.length - mt[3].length, fin: avant.length, navigue: false };
        boiteSugg.innerHTML = liste0.map((y, i) => `<div data-i="${i}" class="${i === 0 ? 'choisi' : ''}"><b>${echapper(y.nom)}</b> <small>${echapper(y.ref)}</small></div>`).join('');
        boiteSugg.hidden = false; bulleArgs.hidden = true; placerSous(boiteSugg, cible);
        return;
      }
    }
  }
  // 1. Nom en cours de frappe
  const m = /(^=|[(;,+\-*/^&<>=\s])([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)$/.exec(avant);
  let liste = [];
  if (m && !/^[A-Za-z]{1,3}\d+$/.test(m[2])) {
    const P = m[2].toUpperCase();
    const vus = new Set();
    for (const x of NOMS_PROPOSES) if (x.nom.startsWith(P) && !vus.has(x.nom)) { vus.add(x.nom); liste.push(x); }
    // D'abord le nom exact, puis les fonctions courantes (celles qui ont une aide), en français, les plus courtes
    const courante = (x) => (AIDE[x.en] ? 0 : 1);
    liste.sort((a, b) => (a.nom === P ? -1 : b.nom === P ? 1 : 0) || courante(a) - courante(b) || (a.fr === b.fr ? a.nom.length - b.nom.length || a.nom.localeCompare(b.nom) : a.fr ? -1 : 1));
    // Noms définis (plages nommées)
    for (const d of [...classeur.noms.values(), ...feuille().noms.values()]) if (d.nom.toUpperCase().startsWith(P)) liste.unshift({ nom: d.nom, nomDefini: true, ref: d.ref });
    for (const f2 of classeur.feuilles) for (const t of f2.tableaux || []) if (t.nom.toUpperCase().startsWith(P)) liste.unshift({ nom: t.nom, nomDefini: true, ref: 'tableau ' + f2.nom + '!' + adresse(t.r1, t.c1) + ':' + adresse(t.r2, t.c2), suffixe: '[' });
    liste = liste.slice(0, 8);
    if (liste.length === 1 && liste[0].nom === P && !liste[0].nomDefini) liste = [];
  }
  if (liste.length) {
    const ancien = sugg && sugg.liste[sugg.i] && sugg.liste[sugg.i].nom;
    sugg = { liste, i: Math.max(0, liste.findIndex((x) => x.nom === ancien)), debut: avant.length - m[2].length, fin: avant.length, navigue: sugg ? sugg.navigue : false };
    boiteSugg.innerHTML = liste.map((x, i) => { const a = x.nomDefini ? null : aideDe(x.nom); return `<div data-i="${i}" class="${i === sugg.i ? 'choisi' : ''}"><b>${echapper(x.nom)}</b>${x.nomDefini ? ` <small>${echapper(x.ref)}</small>` : a ? ` <small>${echapper(a[1])}</small>` : x.fr ? '' : ` <small>${echapper(Object.keys(ALIAS).find((k) => ALIAS[k] === x.nom) || '')}</small>`}</div>`; }).join('');
    boiteSugg.hidden = false; bulleArgs.hidden = true;
    placerSous(boiteSugg, cible);
    return;
  }
  boiteSugg.hidden = true; sugg = null;
  // 2. Aide sur la fonction dont on tape les arguments
  let prof = 0, k = avant.length - 1, nArg = 0, dansTexte = false;
  for (; k >= 0; k--) {
    const ch = avant[k];
    if (ch === '"') dansTexte = !dansTexte;
    if (dansTexte) continue;
    if (ch === ')') prof++;
    else if (ch === '(') { if (prof === 0) break; prof--; }
    else if ((ch === ';' || ch === ',') && prof === 0) nArg++;
  }
  const nomF = k > 0 ? (/([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)$/.exec(avant.slice(0, k)) || [])[1] : null;
  const a = nomF && aideDe(nomF);
  if (!a) { bulleArgs.hidden = true; return; }
  const args = a[0] ? a[0].split(';').map((x) => x.trim()) : [];
  const iArg = args.length && args[args.length - 1] === '…' ? Math.min(nArg, args.length - 2) : Math.min(nArg, args.length - 1);
  bulleArgs.innerHTML = `<b>${echapper(nomF.toUpperCase())}</b>(${args.map((x, i) => (i === iArg ? '<u>' + echapper(x) + '</u>' : echapper(x))).join('; ')})<div>${echapper(a[1])}</div>`;
  bulleArgs.hidden = false;
  placerSous(bulleArgs, cible);
}
function accepterSuggestion(i = sugg && sugg.i) {
  const cible = cibleEdition();
  if (!sugg || !cible || !sugg.liste[i]) return false;
  const x = sugg.liste[i], txt = cible.value;
  const ajout = x.nom + (x.suffixe != null ? x.suffixe : x.nomDefini ? '' : '(');
  cible.value = txt.slice(0, sugg.debut) + ajout + txt.slice(sugg.fin);
  const pos = sugg.debut + ajout.length;
  cible.setSelectionRange(pos, pos);
  if (cible === editeur) { barre.value = editeur.value; ajusterEditeur(); } else editeur.value = barre.value;
  edition.refEnCours = null;
  sugg = null;
  positionnerSelection();
  majSuggestions();
  return true;
}
// Renvoie vrai si la touche a été prise par la liste de suggestions
function toucheSuggestions(e) {
  if (!sugg || boiteSugg.hidden) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    sugg.i = (sugg.i + (e.key === 'ArrowDown' ? 1 : -1) + sugg.liste.length) % sugg.liste.length; sugg.navigue = true;
    boiteSugg.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('choisi', +el.dataset.i === sugg.i));
  } else if (e.key === 'Tab' || (e.key === 'Enter' && sugg.navigue)) accepterSuggestion();
  else if (e.key === 'Escape') { fermerSuggestions(); }
  else return false;
  e.preventDefault(); e.stopPropagation();
  return true;
}
boiteSugg.addEventListener('mousedown', (e) => e.preventDefault());
boiteSugg.addEventListener('click', (e) => { const d = e.target.closest('[data-i]'); if (d) accepterSuggestion(+d.dataset.i); });
for (const el of [editeur, barre]) {
  el.addEventListener('input', () => majSuggestions());
  el.addEventListener('click', () => majSuggestions());
  el.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) majSuggestions(); });
  el.addEventListener('blur', () => setTimeout(() => { if (!edition || (document.activeElement !== editeur && document.activeElement !== barre)) fermerSuggestions(); }, 200));
}

function toucheEdition(e, origine) {
  if (!edition) return;
  e.stopPropagation();
  if (toucheSuggestions(e)) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); remplirSelection(); }
  else if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); validerEdition({ dr: e.shiftKey ? -1 : 1 }); }
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
  if (plageDepuisTexte(txt) || txt.includes('!') || classeur.nom(txt, fi())) { allerA(classeur.nom(txt, fi()) || txt); conteneur.focus(); return; }
  try { const s = selectionNormalisee(); classeur.definirNom(txt, feuille().nom + '!' + adresseAbsolue(s)); sauvegarderLocal(); toast('Nom « ' + txt + ' » défini pour ' + adresseAbsolue(s)); conteneur.focus(); } catch (err) { toast(err.message, true); }
});

// ----- Barre d'outils -----
$('btn-nouveau').addEventListener('click', nouveauClasseur);
$('btn-ouvrir').addEventListener('click', () => $('fichier').click());
$('fichier').addEventListener('change', async (e) => { const fichiers = [...e.target.files]; e.target.value = ''; for (const f of fichiers) await ouvrirFichier(f); });
$('btn-nouveau-classeur').addEventListener('click', nouveauClasseur);
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
$('btn-bouton').addEventListener('click', insererBouton);
$('btn-graphique').addEventListener('click', () => creerGraphique());
const sousBouton = (id) => { const r = $(id).getBoundingClientRect(); return [r.left, r.bottom + 2]; };
$('btn-somme').addEventListener('click', () => uiD.sommeAuto());
$('btn-pinceau').addEventListener('click', () => { if (pinceau) { pinceau = null; document.body.classList.remove('pinceau'); $('btn-pinceau').classList.remove('actif'); return; } prendrePinceau(false); });
$('btn-pinceau').addEventListener('dblclick', () => { prendrePinceau(true); });
$('btn-fusion').addEventListener('click', () => { const s = selectionNormalisee(); fusionnerSelection(!feuille().fusions.some((m) => m.r1 === s.r1 && m.c1 === s.c1)); });
$('puce-lien').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
$('puce-lien').addEventListener('click', (e) => { e.stopPropagation(); const c = feuille().get(curseur.r, curseur.c); if (c && c.lien) suivreLien(c.lien); });
poignee.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); glisse = null; recopieDoubleClic(); });
$('fichier-image').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) insererImage(f); });
$('fleche-liste').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
$('fleche-liste').addEventListener('click', (e) => { e.stopPropagation(); uiD.validation.ouvrirListe(curseur.r, curseur.c, $('curseur').getBoundingClientRect()); });
$('btn-somme-menu').addEventListener('click', () => uiD.menuSomme(...sousBouton('btn-somme')));
$('btn-trier').addEventListener('click', () => uiD.menuTri(...sousBouton('btn-trier')));
$('btn-filtrer').addEventListener('click', () => uiD.basculerFiltre());
$('btn-rechercher').addEventListener('click', () => uiD.ouvrirRecherche(false));
$('btn-tcd').addEventListener('click', () => uiT.ouvrir());
$('btn-mfc').addEventListener('click', () => uiD.menuMfc(...sousBouton('btn-mfc')));
$('btn-figer').addEventListener('click', () => uiD.menuFiger(...sousBouton('btn-figer')));
$('btn-plus').addEventListener('click', () => ouvrirMenu(...sousBouton('btn-plus'), menuPlus()));
$('zoom-moins').addEventListener('click', () => zoomPas(-1));
$('zoom-plus').addEventListener('click', () => zoomPas(1));
$('zoom-valeur').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); menuZoom(r.left, r.top - 4); });
$('ind-calcul').addEventListener('click', () => recalculer());
$('ind-protection').addEventListener('click', () => uiB.protegerFeuille());
// Ctrl + molette : zoom autour du pointeur (comme Excel)
conteneur.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const r = conteneur.getBoundingClientRect(), ancre = { x: e.clientX - r.left, y: e.clientY - r.top };
  // Pavé tactile (pincement) : petits pas continus ; molette : paliers
  if (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)) definirZoom(Z() * Math.exp(-e.deltaY / 100), ancre); else zoomPas(e.deltaY < 0 ? 1 : -1, ancre);
}, { passive: false });
// Menu « … » : tout ce qui n'a pas de bouton, rangé comme les onglets d'Excel
function menuPlus() {
  return [
    ['Format de cellule…', () => uiB.formatCellule(), 'Ctrl+1'], ['Collage spécial…', () => uiB.collageSpecial(), 'Ctrl+Alt+V'], ['Atteindre…', () => uiB.atteindre(), 'Ctrl+G'], null,
    ['Insérer', [['Tableau…', () => mettreEnTableau(), 'Ctrl+L'], ['Graphique', () => uiG.insererDirect(), 'Alt+F1'],
      ['Sparklines', [['Courbe…', () => uiB.sparklines('ligne')], ['Histogramme…', () => uiB.sparklines('colonne')], ['Gain / perte…', () => uiB.sparklines('gainperte')]]], ['Image…', () => $('fichier-image').click()], ['Lien hypertexte…', () => uiB.lien(), 'Ctrl+K'], ['Note…', () => uiB.note(), 'Maj+F2']]],
    ['Données', [['Remplissage instantané', () => uiA.remplissage(), 'Ctrl+E'], ['Supprimer les doublons…', () => uiB.doublons()], ['Convertir en colonnes…', () => uiB.colonnes()], ['Validation des données…', () => uiD.validation.ouvrir()], null,
      ['Actualiser tout', () => { uiT.toutActualiser(); actualiserTablesDonnees(classeur); rendre(); sauvegarderLocal(); }, 'Ctrl+Alt+F5']]],
    ['Analyse', [['Valeur cible…', () => uiD.ouvrirCible()], ['Solveur…', () => uiA.ouvrirSolveur()], ['Table de données…', () => uiA.ouvrirTableDonnees()]]],
    ['Formules', [['Repérer les antécédents', () => tracer('ant')], ['Repérer les dépendants', () => tracer('dep')], ['Supprimer les flèches', () => effacerFleches()], null,
      ['Sélectionner les antécédents', () => selectionnerLies('ant'), 'Ctrl+['], ['Sélectionner les dépendants', () => selectionnerLies('dep'), 'Ctrl+]'], null,
      ['Évaluer la formule…', () => uiA.evaluerFormule()], ['Vérification des erreurs…', () => uiA.ouvrirErreurs()],
      [afficherFormules ? 'Afficher les résultats' : 'Afficher les formules', () => { afficherFormules = !afficherFormules; rendre(); }, 'Ctrl+`'], null,
      [(classeur.calculManuel ? '✓ ' : '') + 'Calcul manuel', () => basculerCalculManuel()],
      ['Recalculer', () => recalculer(), 'F9'], ['Tout recalculer', () => { classeur.abandonnerCaches(); classeur.evaluateur.recalculerTout(); actualiserTablesDonnees(classeur); rendre(); toast('Tout est recalculé (valeurs du fichier oubliées)'); }, 'Ctrl+Alt+F9']]],
    ['Mise en page', [['Imprimer / PDF…', () => uiP.ouvrir(), 'Ctrl+P'], ['Imprimer la sélection…', () => uiP.ouvrir({ quoi: 'selection' })], null,
      ['Définir la zone d\'impression', () => uiP.definirZone()], ['Effacer la zone d\'impression', () => uiP.effacerZone()], null,
      ['Insérer un saut de page', () => uiP.saut(true, curseur)], ['Supprimer le saut de page', () => uiP.saut(false, curseur)], ['Rétablir tous les sauts de page', () => uiP.retablirSauts()]]],
    ['Affichage', [['Zoom', [...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => [(Math.abs(Z() - z) < 0.001 ? '✓ ' : '') + Math.round(z * 100) + ' %', () => definirZoom(z)]), ['Zoom sur la sélection', () => zoomSelection()], ['Zoom avant', () => zoomPas(1), 'Ctrl+Alt+='], ['Zoom arrière', () => zoomPas(-1), 'Ctrl+Alt+-']]],
      ['Thème', [['clair', 'Clair'], ['sombre', 'Sombre'], ['auto', 'Comme le système']].map(([k, t]) => [(theme === k ? '✓ ' : '') + t, () => choisirTheme(k)])],
      ['Figer les volets', () => uiD.menuFiger(...sousBouton('btn-plus'))]]],
    ['Révision', [[feuilleProtegee() ? 'Ôter la protection de la feuille…' : 'Protéger la feuille…', () => uiB.protegerFeuille()], ['Déverrouiller les cellules choisies', () => { surSelection((r, c) => classeur.style(fi(), r, c, { deverrouille: true })); toast('Cellules déverrouillées : elles resteront modifiables quand la feuille sera protégée'); }],
      ['Verrouiller les cellules choisies', () => surSelection((r, c) => classeur.style(fi(), r, c, { deverrouille: null }))]]],
    ['Feuille', [['Nouvelle feuille', () => { memoriserVue(); classeur.ajouterFeuille(null, fi() + 1); activerFeuille(fi() + 1); sauvegarderLocal(); }, 'Maj+F11'], ['Feuille suivante', () => changerFeuille(1), 'Ctrl+PgSuiv'], ['Feuille précédente', () => changerFeuille(-1), 'Ctrl+PgPréc'], ['Dupliquer cette feuille', () => dupliquerFeuille(fi())]]],
    ['Nouveau classeur', () => nouveauClasseur(), 'Ctrl+Alt+N'], ['Raccourcis clavier', () => { if (panneauCourant !== 'aide') ouvrirPanneau('aide'); }, '?'],
  ];
}
// F9 : recalcule (utile en calcul manuel) ; tables de données comprises
function recalculer() { classeur.evaluateur.recalculerTout(); actualiserTablesDonnees(classeur); rendre(); toast('Recalculé'); }
function basculerCalculManuel() {
  classeur.calculManuel = !classeur.calculManuel;
  if (!classeur.calculManuel) classeur.evaluateur.recalculerTout();
  sauvegarderLocal(); rendre();
  toast(classeur.calculManuel ? 'Calcul manuel : F9 pour recalculer' : 'Calcul automatique');
}

$('taille-police').addEventListener('change', (e) => { const v = +e.target.value; surSelection((r, c) => classeur.style(fi(), r, c, { taille: v && v !== 13 ? v : null })); conteneur.focus(); });
$('btn-renvoi').addEventListener('click', () => basculerStyle('renvoi'));
$('bordures').addEventListener('change', (e) => { if (e.target.value) appliquerBordures(e.target.value); e.target.value = ''; conteneur.focus(); });
$('btn-decimales-moins').addEventListener('click', () => changerDecimales(-1));
$('btn-decimales-plus').addEventListener('click', () => changerDecimales(1));
$('btn-inserer-ligne').addEventListener('click', () => lignesColonnes(true, 'r'));
$('btn-supprimer-ligne').addEventListener('click', () => lignesColonnes(false, 'r'));
$('btn-inserer-colonne').addEventListener('click', () => lignesColonnes(true, 'c'));
$('btn-supprimer-colonne').addEventListener('click', () => lignesColonnes(false, 'c'));
$('btn-noms').addEventListener('click', () => ouvrirPanneau('noms'));
$('btn-fonctions').addEventListener('click', () => ouvrirPanneau('fonctions'));
$('btn-macros').addEventListener('click', () => ouvrirPanneau('macros'));
$('btn-aide').addEventListener('click', () => ouvrirPanneau('aide'));
$('panneau-fermer').addEventListener('click', () => { $('panneau').hidden = true; panneauCourant = null; rendre(); });
$('btn-ajouter-feuille').addEventListener('click', () => { memoriserVue(); classeur.ajouterFeuille(); activerFeuille(classeur.feuilles.length - 1); sauvegarderLocal(); });
$('filtre-fonctions').addEventListener('input', rendreFonctions);
$('btn-ajouter-nom').addEventListener('click', () => { try { classeur.definirNom($('nom-nouveau').value, $('ref-nouveau').value); $('nom-nouveau').value = ''; $('ref-nouveau').value = ''; rendreNoms(); sauvegarderLocal(); rendre(); } catch (e) { toast(e.message, true); } });
$('btn-executer').addEventListener('click', () => executerMacroUI());
$('btn-verifier').addEventListener('click', verifierVBA);
$('btn-exemple').addEventListener('click', () => { const m = moduleCourant(); classeur.definirCodeModule(m.cle, (m.code.trim() ? m.code.replace(/\s+$/, '') + '\n\n' : '') + EXEMPLE_VBA); afficherModule(m.cle); sauvegarderLocal(); });
$('btn-nouveau-module').addEventListener('click', nouveauModuleUI);
$('btn-nouvelle-macro').addEventListener('click', nouvelleMacroUI);
$('btn-liste-macros').addEventListener('click', ouvrirDialogueMacros);
$('btn-macros-liste').addEventListener('click', ouvrirDialogueMacros);
$('macro-nom').addEventListener('input', () => { macroChoisie = null; rendreDialogueMacros(); });
$('macros-dans').addEventListener('change', rendreDialogueMacros);
$('macro-executer').addEventListener('click', () => { if (!macroChoisie) return; const q = macroChoisie.qualifie; fermerDialogueMacros(); executerMacroUI(q); });
$('macro-modifier').addEventListener('click', () => { if (!macroChoisie) return; const p = macroChoisie; fermerDialogueMacros(); if (panneauCourant !== 'macros') ouvrirPanneau('macros'); afficherModule(p.cle, p.ligne + 1); });
$('macro-creer').addEventListener('click', () => { const nom = $('macro-nom').value.trim(); if (!nomVBAValide(nom)) return toast('Nom de macro invalide : une lettre, puis des lettres, chiffres ou _ (sans espace ni tiret)', true); const cle = cibleCreation(); if (creerMacro(nom, cle)) fermerDialogueMacros(); });
$('macro-supprimer').addEventListener('click', () => { if (macroChoisie && supprimerMacroUI(macroChoisie.cle, macroChoisie.nom)) { macroChoisie = null; $('macro-nom').value = ''; rendreDialogueMacros(); } });
$('macro-fermer').addEventListener('click', fermerDialogueMacros);
$('dialogue-macros').addEventListener('mousedown', (e) => { if (e.target.id === 'dialogue-macros') fermerDialogueMacros(); });
$('dialogue-macros').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); fermerDialogueMacros(); }
  else if (e.key === 'Enter' && e.target.id === 'macro-nom') { e.preventDefault(); if (macroChoisie) $('macro-executer').click(); else if (!$('macro-creer').disabled) $('macro-creer').click(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'F8' && e.altKey && !$('dialogue-macros').contains(e.target)) { e.preventDefault(); ouvrirDialogueMacros(); } }, true);
let timerCode;
$('code-vba').addEventListener('input', () => {
  const m = moduleAffiche && classeur.moduleVBA(moduleAffiche);
  if (!m) return afficherModule();
  classeur.definirCodeModule(m.cle, $('code-vba').value);
  clearTimeout(timerCode); timerCode = setTimeout(() => { rendreArbreVBA(false); rafraichirProcedures(); suivreCurseurVBA(); sauvegarderLocal(); }, 400);
});
$('code-vba').addEventListener('click', suivreCurseurVBA);
$('code-vba').addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown') suivreCurseurVBA(); });
$('code-vba').addEventListener('keydown', (e) => {
  if (e.key === 'F5') { e.preventDefault(); suivreCurseurVBA(); executerMacroUI(); }
  else if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const p = t.selectionStart; t.value = t.value.slice(0, p) + '    ' + t.value.slice(t.selectionEnd); t.setSelectionRange(p + 4, p + 4); }
  else if (e.key === 'Enter') { // conserve l'indentation
    const t = e.target; const p = t.selectionStart; const debut = t.value.lastIndexOf('\n', p - 1) + 1; const indent = /^[ \t]*/.exec(t.value.slice(debut, p))[0];
    e.preventDefault(); t.value = t.value.slice(0, p) + '\n' + indent + t.value.slice(t.selectionEnd); t.setSelectionRange(p + 1 + indent.length, p + 1 + indent.length);
  }
});
// Glisser-déposer d'un fichier sur la page
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', async (e) => { e.preventDefault(); for (const f of e.dataTransfer.files) await ouvrirFichier(f); });
window.addEventListener('beforeunload', () => { memoriserVue(); sauvegarderLocal(); });

// ---------------------------------------------------------------------------
// Écrans tactiles (téléphone, tablette)
// ---------------------------------------------------------------------------
// Un appui sur une cellule la sélectionne ; un second appui sur la même cellule la modifie (clavier).
// Glisser depuis la sélection l'étend ; glisser ailleurs fait défiler. Appui long : le menu (clic droit).
// Les gestes sont traduits en évènements souris pour réutiliser toute la logique du bureau.

const SEUIL_GLISSE = 10;
let toucher = null, dernierToucher = 0, appuiLong = 0, minuterieAppui = null, departAppui = null;

function souris(type, cible, x, y, extra = {}) {
  cible.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: type === 'contextmenu' ? 2 : 0, view: window, ...extra }));
}

const vivant = (el, x, y) => (el && el.isConnected ? el : document.elementFromPoint(x, y) || conteneur);

// Deux doigts : zoom de la feuille (pincement), autour du milieu des doigts
let pincement = null;
const ecartDoigts = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
conteneur.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 2) return;
  const r = conteneur.getBoundingClientRect();
  pincement = { d0: ecartDoigts(e.touches), z0: Z(), ancre: { x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top } };
  // Les cellules sont redessinées pendant le geste : on écoute directement les éléments touchés (même détachés)
  const cibles = [...new Set([...e.touches].map((t) => t.target))];
  const bouger = (ev) => { if (!pincement || ev.touches.length !== 2) return; ev.preventDefault(); definirZoom(pincement.z0 * ecartDoigts(ev.touches) / pincement.d0, pincement.ancre); };
  const fin = (ev) => { if (ev.touches.length >= 2) return; pincement = null; for (const c of cibles) { c.removeEventListener('touchmove', bouger); c.removeEventListener('touchend', fin); c.removeEventListener('touchcancel', fin); } };
  for (const c of cibles) { c.addEventListener('touchmove', bouger, { passive: false }); c.addEventListener('touchend', fin); c.addEventListener('touchcancel', fin); }
}, { passive: true });
conteneur.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) { toucher = null; return; } // deux doigts : zoom de la feuille (ci-dessus)
  const t = e.touches[0], cible = e.target;
  // Les vrais contrôles posés sur la grille (boutons de macro, barre d'un graphique, images-boutons) gardent leur comportement
  if (cible === editeur || cible.closest('button, select, input, a, .image-feuille.cliquable')) { toucher = null; return; }
  const rect = conteneur.getBoundingClientRect();
  const x = t.clientX - rect.left, y = t.clientY - rect.top;
  let mode = 'appui';
  const gEl = cible.closest('.graphique'), imEl = cible.closest('.image-feuille');
  if (cible === poignee || cible.classList.contains('redim-col') || cible.classList.contains('redim-lig') || cible.classList.contains('graphique-redim') || cible.closest('.graphique-barre')) mode = 'glisser';
  // Graphique ou image déjà choisi (premier appui) : le doigt le déplace, où qu'il le prenne
  else if ((gEl && gEl.dataset.id === graphiqueActif) || (imEl && imEl.dataset.image === imageActive)) mode = 'glisser';
  else if (!edition && x > LARGEUR_ENTETE && y > HAUTEUR_DEFAUT) {
    const cel = celluleDepuisPoint(x, y), s2 = selectionNormalisee();
    if (cel.r >= s2.r1 && cel.r <= s2.r2 && cel.c >= s2.c1 && cel.c <= s2.c2) mode = 'selection';
  }
  toucher = { mode, x0: t.clientX, y0: t.clientY, t0: Date.now(), cible, bouge: false, actif: false };
  // La grille est redessinée pendant le geste : l'élément touché quitte la page mais reçoit toujours la suite du geste,
  // et seulement lui (plus de propagation). On écoute donc directement sur lui.
  const finir = () => { cible.removeEventListener('touchmove', bouger); cible.removeEventListener('touchend', lacher); cible.removeEventListener('touchcancel', annulerGeste); };
  const bouger = (ev) => toucheBouge(ev);
  const lacher = (ev) => { finir(); toucheFin(ev); };
  const annulerGeste = () => { finir(); if (toucher && toucher.actif) souris('mouseup', document, 0, 0); toucher = null; };
  cible.addEventListener('touchmove', bouger, { passive: false });
  cible.addEventListener('touchend', lacher, { passive: false });
  cible.addEventListener('touchcancel', annulerGeste);
  if (mode === 'glisser') { e.preventDefault(); souris('mousedown', cible, t.clientX, t.clientY); toucher.actif = true; }
  else if (mode === 'selection') e.preventDefault(); // pas de défilement : le doigt étend la sélection
}, { passive: false });

function toucheBouge(e) {
  if (!toucher) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - toucher.x0, t.clientY - toucher.y0) > SEUIL_GLISSE) toucher.bouge = true;
  if (toucher.mode === 'appui') { if (toucher.bouge) toucher = null; return; } // défilement natif
  e.preventDefault();
  if (toucher.mode === 'selection' && toucher.bouge && !toucher.actif) { souris('mousedown', vivant(toucher.cible, toucher.x0, toucher.y0), toucher.x0, toucher.y0, { shiftKey: true }); toucher.actif = true; }
  if (toucher.actif) {
    souris('mousemove', document, t.clientX, t.clientY);
    // Défilement automatique quand le doigt approche du bord
    const rect = conteneur.getBoundingClientRect(), marge = 36;
    if (t.clientY > rect.bottom - marge) conteneur.scrollTop += 16; else if (t.clientY < rect.top + HAUTEUR_DEFAUT + marge) conteneur.scrollTop -= 16;
    if (t.clientX > rect.right - marge) conteneur.scrollLeft += 16; else if (t.clientX < rect.left + LARGEUR_ENTETE + marge) conteneur.scrollLeft -= 16;
  }
}

function toucheFin(e) {
  if (!toucher) return;
  const g = toucher; toucher = null;
  const t = e.changedTouches[0];
  e.preventDefault(); // pas d'évènements souris en double
  if (g.actif) { souris('mouseup', document, t.clientX, t.clientY); return; }
  if (g.bouge || Date.now() - appuiLong < 800) return;
  const rect = conteneur.getBoundingClientRect();
  const x = t.clientX - rect.left, y = t.clientY - rect.top;
  const cible = vivant(g.cible, t.clientX, t.clientY);
  if (!edition && x > LARGEUR_ENTETE && y > HAUTEUR_DEFAUT && !cible.closest('.graphique, .image-feuille, .bouton-macro')) {
    const cel = celluleDepuisPoint(x, y);
    const unique = selection.r1 === selection.r2 && selection.c1 === selection.c2;
    // Second appui sur la cellule active : on la modifie (le focus pendant le geste ouvre le clavier)
    if (unique && cel.r === curseur.r && cel.c === curseur.c) { commencerEdition(); return; }
  }
  souris('mousedown', cible, t.clientX, t.clientY);
  souris('mouseup', document, t.clientX, t.clientY);
  souris('click', cible, t.clientX, t.clientY);
}

// Appui long n'importe où (grille, onglets, boutons, graphiques) : le menu contextuel
document.addEventListener('touchstart', (e) => {
  dernierToucher = Date.now();
  clearTimeout(minuterieAppui);
  if (e.touches.length !== 1) return;
  const t = e.touches[0], cible = e.target;
  if (cible.closest('input, textarea, select, .menu, .dialogue, .voile, .dialogue-fond, #panneau, #barre-outils, #barre-formule')) return;
  departAppui = { x: t.clientX, y: t.clientY };
  minuterieAppui = setTimeout(() => {
    if (toucher && (toucher.bouge || toucher.actif)) return;
    toucher = null;
    appuiLong = Date.now();
    if (navigator.vibrate) navigator.vibrate(12);
    souris('contextmenu', vivant(cible, departAppui.x, departAppui.y), departAppui.x, departAppui.y);
  }, 520);
}, { passive: true, capture: true });
document.addEventListener('touchmove', (e) => {
  if (!departAppui) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - departAppui.x, t.clientY - departAppui.y) > SEUIL_GLISSE) { clearTimeout(minuterieAppui); departAppui = null; }
}, { passive: true, capture: true });
document.addEventListener('touchend', (e) => {
  clearTimeout(minuterieAppui); departAppui = null;
  if (Date.now() - appuiLong < 1500 && dernierToucher <= appuiLong) e.preventDefault(); // fin de l'appui long : rien n'est cliqué
}, { passive: false, capture: true });
// Android termine parfois un appui long par de vrais clics souris (sans fin de toucher) : ils fermeraient le menu
for (const type of ['mousedown', 'mouseup', 'click']) document.addEventListener(type, (e) => {
  // Tant que le doigt de l'appui long ne s'est pas reposé, aucun clic ne passe (pas même sur le menu ouvert sous le doigt)
  if (e.isTrusted && Date.now() - appuiLong < 1500 && dernierToucher <= appuiLong) { e.preventDefault(); e.stopPropagation(); }
}, true);
// Au doigt, c'est le second appui qui modifie une cellule : les doubles-clics fabriqués par le navigateur sont ignorés
document.addEventListener('dblclick', (e) => {
  if (e.isTrusted && Date.now() - dernierToucher < 1500 && !e.target.closest('input, textarea')) { e.preventDefault(); e.stopPropagation(); }
}, true);
// Le menu natif du navigateur (appui long) est remplacé par le nôtre
document.addEventListener('contextmenu', (e) => {
  if (e.isTrusted && Date.now() - dernierToucher < 1500 && !e.target.closest('input, textarea')) { e.preventDefault(); e.stopPropagation(); }
}, true);

// Barre d'outils repliable (téléphone en paysage : la grille garde la place)
let choixOutils = null;
const ecranMobile = () => window.matchMedia('(pointer: coarse), (max-width: 820px)').matches;
function appliquerOutils() {
  barre.placeholder = ecranMobile() ? 'Saisie ou =formule' : 'Saisie ou formule (=SOMME(A1:A5), =SI(…), =VPM(…))';
  const replie = ecranMobile() && (choixOutils ?? window.innerHeight < 500);
  document.body.classList.toggle('outils-replies', replie);
  $('btn-outils').textContent = replie ? '☰' : '▴';
  $('btn-outils').title = replie ? 'Afficher les outils' : 'Masquer les outils';
}
$('btn-outils').addEventListener('click', () => { choixOutils = !document.body.classList.contains('outils-replies'); appliquerOutils(); rendre(); });
let derniereOrientation = window.innerWidth > window.innerHeight;
window.addEventListener('resize', () => {
  const paysage = window.innerWidth > window.innerHeight;
  if (paysage !== derniereOrientation) { derniereOrientation = paysage; choixOutils = null; } // chaque orientation retrouve son réglage
  appliquerOutils();
});
appliquerOutils();
// Clavier virtuel : la cellule modifiée reste visible
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (edition) { defiler({ r: edition.r, c: edition.c }); rendre(); } });
$('btn-annuler').addEventListener('click', () => { if (edition) annulerEdition(); annuler(); });
$('btn-retablir').addEventListener('click', () => { if (edition) validerEdition(); retablir(); });

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

if (!restaurerLocal()) { classeur = Classeur.nouveau(); classeur.nomFichier = 'Classeur1.xlsx'; classeurs = [classeur]; }
for (const c of classeurs) if (c.enregistre === undefined) c.enregistre = c.version;
afficherModule();
activerFeuille(Math.min(classeur.active, classeur.feuilles.length - 1));
document.title = (classeur.nomFichier || 'Classeur') + ' — Sprezz';
conteneur.focus();
if (window.HubBridge && window.HubBridge.shown) window.HubBridge.shown();
rendreClasseurs(true);
window.__tableur = { get classeur() { return classeur; }, get classeurs() { return classeurs; }, Classeur, rendre, chargerClasseur, basculerClasseur };
