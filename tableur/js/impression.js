// Mise en page et découpage en pages (sans DOM) : papier, orientation, échelle ou « ajuster à N pages »,
// marges, en-tête et pied de page, zone d'impression, titres à répéter, quadrillage, sauts de page.
// Produit le HTML des pages, utilisé tel quel pour l'aperçu et pour l'impression.

import { ErreurFormule, formater, couleurFormat, colVersLettres, parsePlage } from './formules.js';
import { styleTableau, styleCelluleTableau } from './tableaux.js';

export const PAPIERS = { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
export const CODES_PAPIER = { A4: 9, A3: 8, A5: 11, Letter: 1, Legal: 5 };
const MM = 96 / 25.4; // pixels par millimètre

export function miseEnPageDefaut() {
  return { orientation: 'portrait', papier: 'A4', echelle: 100, ajuster: null, marges: { h: 1.9, b: 1.9, g: 1.8, d: 1.8, entete: 0.8, pied: 0.8 },
    centrerH: false, centrerV: false, entete: { g: '', c: '', d: '' }, pied: { g: '', c: '', d: '' }, zone: '', titresLignes: '', titresColonnes: '',
    quadrillage: false, entetes: false, ordre: 'bas', sautsLignes: [], sautsColonnes: [] };
}
export const mp = (f) => ({ ...miseEnPageDefaut(), ...(f.miseEnPage || {}), marges: { ...miseEnPageDefaut().marges, ...((f.miseEnPage || {}).marges || {}) } });

const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const largeur = (f, c) => (f.largeurs[c] === undefined ? 84 : f.largeurs[c]);
const hauteur = (f, r) => (f.filtrees && f.filtrees.has(r) ? 0 : f.hauteurs[r] === undefined ? 24 : f.hauteurs[r]);

// « 1:2 » → [0, 1] ; « A:B » → [0, 1]
function lireTitres(t, axe) {
  const s = String(t || '').replace(/\$/g, '').replace(/^.*!/, '').trim().toUpperCase();
  if (!s) return null;
  const m = axe === 'r' ? /^(\d+)(?::(\d+))?$/.exec(s) : /^([A-Z]{1,3})(?::([A-Z]{1,3}))?$/.exec(s);
  if (!m) return null;
  const v = (x) => (axe === 'r' ? +x - 1 : x.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1);
  const a = v(m[1]), b = m[2] ? v(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Zones à imprimer : zone d'impression (plusieurs séparées par « ; »), sélection, ou toute la feuille utilisée (objets compris). */
export function zonesImpression(f, regl, { selection = null, objets = [] } = {}) {
  if (selection) return [selection];
  const zs = String(regl.zone || '').split(/[;,]/).map((x) => parsePlage(x.replace(/\$/g, '').replace(/^.*!/, '').trim().toUpperCase())).filter(Boolean);
  if (zs.length) return zs;
  let r2 = Math.max(0, f.zone.r2), c2 = Math.max(0, f.zone.c2);
  // Les graphiques et images agrandissent la zone
  for (const o of objets) {
    let x = 0, c = 0; while (x < o.x + o.w && c < 16384) { x += largeur(f, c); c++; }
    let y = 0, r = 0; while (y < o.y + o.h && r < 1048576) { y += hauteur(f, r); r++; }
    r2 = Math.max(r2, r - 1); c2 = Math.max(c2, c - 1);
  }
  return [{ r1: 0, c1: 0, r2, c2 }];
}

/**
 * Découpe en pages. → { pages: [{ lignes: [r], colonnes: [c] }], echelle, papier: [w, h] (mm), titresL: [r], titresC: [c] }
 */
export function paginer(f, regl, zones) {
  const [pw, ph] = PAPIERS[regl.papier] || PAPIERS.A4;
  const [W, H] = regl.orientation === 'paysage' ? [ph, pw] : [pw, ph];
  const m = regl.marges;
  const utileW = (W - (m.g + m.d) * 10) * MM, utileH = (H - (m.h + m.b) * 10) * MM;
  const tl = lireTitres(regl.titresLignes, 'r'), tc = lireTitres(regl.titresColonnes, 'c');
  const titresL = [], titresC = [];
  if (tl) for (let r = tl[0]; r <= tl[1]; r++) if (hauteur(f, r)) titresL.push(r);
  if (tc) for (let c = tc[0]; c <= tc[1]; c++) if (largeur(f, c)) titresC.push(c);
  const enteteW = regl.entetes ? 36 : 0, enteteH = regl.entetes ? 20 : 0;
  const sautsL = new Set(regl.sautsLignes || []), sautsC = new Set(regl.sautsColonnes || []);
  const decouper = (idx, taille, dispo, sauts) => {
    const out = []; let cur = [], t = 0;
    for (const i of idx) {
      const w = taille(i);
      if (cur.length && (t + w > dispo || sauts.has(i))) { out.push(cur); cur = []; t = 0; }
      cur.push(i); t += w;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const essai = (s) => {
    const pages = [];
    for (const z of zones) {
      const lignes = [], colonnes = [];
      for (let r = z.r1; r <= z.r2; r++) if (hauteur(f, r)) lignes.push(r);
      for (let c = z.c1; c <= z.c2; c++) if (largeur(f, c)) colonnes.push(c);
      // Les titres répétés prennent leur place sur chaque page
      const dispoH = utileH / s - enteteH - titresL.reduce((a, r) => a + hauteur(f, r), 0);
      const dispoW = utileW / s - enteteW - titresC.reduce((a, c) => a + largeur(f, c), 0);
      const blocsL = decouper(lignes, (r) => hauteur(f, r), Math.max(20, dispoH), sautsL);
      const blocsC = decouper(colonnes, (c) => largeur(f, c), Math.max(20, dispoW), sautsC);
      if (regl.ordre === 'droite') for (const L of blocsL) for (const Cc of blocsC) pages.push({ lignes: L, colonnes: Cc, larges: blocsC.length, hautes: blocsL.length });
      else for (const Cc of blocsC) for (const L of blocsL) pages.push({ lignes: L, colonnes: Cc, larges: blocsC.length, hautes: blocsL.length });
    }
    return pages;
  };
  let s = regl.ajuster ? 1 : Math.max(0.1, Math.min(4, (+regl.echelle || 100) / 100));
  let pages = essai(s);
  if (regl.ajuster) {
    const L = +regl.ajuster.l || 0, Hh = +regl.ajuster.h || 0;
    for (let k = 0; k < 60 && s > 0.1; k++) {
      const larges = Math.max(...pages.map((p) => p.larges)), hautes = Math.max(...pages.map((p) => p.hautes));
      if ((!L || larges <= L) && (!Hh || hautes <= Hh)) break;
      s *= 0.96; pages = essai(s);
    }
  }
  return { pages, echelle: s, papier: [W, H], titresL, titresC };
}

/** Texte d'en-tête / pied : &[Page], &[Pages], &[Date], &[Heure], &[Fichier], &[Feuille]. */
export function remplacerCodes(t, ctx) {
  const d = new Date();
  return String(t || '').replace(/&\[(Page|Pages|Date|Heure|Fichier|Feuille)\]/gi, (m, k) => ({ page: ctx.page, pages: ctx.pages, date: d.toLocaleDateString('fr-FR'), heure: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), fichier: ctx.fichier, feuille: ctx.feuille }[k.toLowerCase()]));
}
// Format des fichiers Excel : &L…&C…&R… avec &P, &N, &D, &T, &F, &A
export function versExcel(hf) {
  const conv = (t) => String(t || '').replace(/&(?!\[)/g, '&&').replace(/&\[Page\]/gi, '&P').replace(/&\[Pages\]/gi, '&N').replace(/&\[Date\]/gi, '&D').replace(/&\[Heure\]/gi, '&T').replace(/&\[Fichier\]/gi, '&F').replace(/&\[Feuille\]/gi, '&A');
  return (hf.g ? '&L' + conv(hf.g) : '') + (hf.c ? '&C' + conv(hf.c) : '') + (hf.d ? '&R' + conv(hf.d) : '');
}
export function depuisExcel(t) {
  const out = { g: '', c: '', d: '' };
  let zone = 'c';
  const s = String(t || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '&') { out[zone] += ch; continue; }
    const n = s[i + 1];
    if (n === undefined) break;
    i++;
    if (n === 'L') zone = 'g'; else if (n === 'C') zone = 'c'; else if (n === 'R') zone = 'd';
    else if (n === 'P') out[zone] += '&[Page]'; else if (n === 'N') out[zone] += '&[Pages]'; else if (n === 'D') out[zone] += '&[Date]';
    else if (n === 'T') out[zone] += '&[Heure]'; else if (n === 'F') out[zone] += '&[Fichier]'; else if (n === 'A') out[zone] += '&[Feuille]';
    else if (n === '&') out[zone] += '&';
    else if (n === '"') { const j = s.indexOf('"', i + 1); i = j < 0 ? s.length : j; } // police
    else if (/\d/.test(n)) { while (/\d/.test(s[i + 1] || '')) i++; } // taille
    // &B, &I, &U, &S… (styles) : ignorés
  }
  return out;
}

/**
 * HTML des pages (une chaîne par page). objets : [{ x, y, w, h, html }] (graphiques et images, en pixels de la feuille).
 * styleCellule(r, c) : style conditionnel éventuel (mise en forme conditionnelle).
 */
export function htmlPages(C, fi, regl, pag, { objets = [], styleCellule = null } = {}) {
  const f = C.feuilles[fi], [W, H] = pag.papier, s = pag.echelle, m = regl.marges;
  const tabs = (f.tableaux || []).map((t) => [t, styleTableau(t.style)]);
  const X = []; { let x = 0; for (let c = 0; c <= Math.max(f.zone.c2 + 50, ...pag.pages.flatMap((p) => p.colonnes)) + 1; c++) { X[c] = x; x += largeur(f, c); } }
  const Y = []; { let y = 0; for (let r = 0; r <= Math.max(f.zone.r2 + 100, ...pag.pages.flatMap((p) => p.lignes)) + 1; r++) { Y[r] = y; y += hauteur(f, r); } }
  const cellule = (r, c, rowspan, colspan) => {
    const cel = f.get(r, c);
    let st = (cel && cel.s) || {};
    const t = tabs.find(([x]) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
    if (t) { const ts = styleCelluleTableau(t[0], r, c, t[1]); if (ts) st = { ...ts, ...st, bordures: st.bordures || ts.bordures, bordCouleur: st.bordures ? st.bordCouleur : ts.bordCouleur }; }
    if (styleCellule) { const x = styleCellule(r, c); if (x) { st = { ...st }; for (const k of ['fond', 'couleur', 'gras', 'italique']) if (x[k] !== undefined) st[k] = x[k]; } }
    const v = C.valeur(fi, r, c);
    const txt = v === null || v === undefined ? '' : v instanceof ErreurFormule ? v.code : formater(v, cel && cel.z);
    let css = '';
    if (st.gras) css += 'font-weight:700;'; if (st.italique) css += 'font-style:italic;';
    if (st.souligne || st.barre) css += 'text-decoration:' + [st.souligne && 'underline', st.barre && 'line-through'].filter(Boolean).join(' ') + ';';
    const coul = typeof v === 'number' && cel && cel.z ? couleurFormat(v, cel.z) : null;
    if (coul || st.couleur) css += 'color:' + (coul || st.couleur) + ';';
    if (st.fond) css += 'background:' + st.fond + ';';
    if (st.taille) css += 'font-size:' + st.taille + 'px;';
    css += 'text-align:' + (st.align || (typeof v === 'number' ? 'right' : typeof v === 'boolean' || v instanceof ErreurFormule ? 'center' : 'left')) + ';';
    if (st.valign) css += 'vertical-align:' + (st.valign === 'top' ? 'top' : 'middle') + ';';
    if (st.renvoi) css += 'white-space:pre-wrap;';
    if (st.retrait) css += 'padding-left:' + (3 + st.retrait * 9) + 'px;';
    const b = st.bordures || (st.bordure ? { h: 'thin', b: 'thin', g: 'thin', d: 'thin' } : null);
    if (b) for (const [k, p] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) if (b[k]) css += `border-${p}:${{ thin: 1, medium: 2, thick: 3, double: 3 }[b[k]] || 1}px ${b[k] === 'double' ? 'double' : 'solid'} ${st.bordCouleur || '#000'};`;
    return `<td${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''} style="${css}">${ech(txt)}</td>`;
  };
  const pages = pag.pages.map((p, k) => {
    const lignes = [...pag.titresL.filter((r) => !p.lignes.includes(r) && r < p.lignes[0]), ...p.lignes];
    const colonnes = [...pag.titresC.filter((c) => !p.colonnes.includes(c) && c < p.colonnes[0]), ...p.colonnes];
    const setL = new Set(lignes), setC = new Set(colonnes);
    const pris = new Set();
    let html = `<table class="${regl.quadrillage ? 'quadrillage' : ''}"><colgroup>${regl.entetes ? '<col style="width:36px">' : ''}${colonnes.map((c) => `<col style="width:${largeur(f, c)}px">`).join('')}</colgroup>`;
    if (regl.entetes) html += `<tr style="height:20px"><th></th>${colonnes.map((c) => `<th>${colVersLettres(c)}</th>`).join('')}</tr>`;
    for (const r of lignes) {
      html += `<tr style="height:${hauteur(f, r)}px">${regl.entetes ? `<th>${r + 1}</th>` : ''}`;
      for (const c of colonnes) {
        if (pris.has(r + ',' + c)) continue;
        const fus = f.fusions.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
        if (fus) {
          // Fusion coupée par la page : la partie visible porte le contenu
          const rs = lignes.filter((x) => x >= r && x <= fus.r2 && setL.has(x)).length, cs = colonnes.filter((x) => x >= c && x <= fus.c2 && setC.has(x)).length;
          for (const rr of lignes) for (const cc of colonnes) if (rr >= r && rr <= fus.r2 && cc >= c && cc <= fus.c2) pris.add(rr + ',' + cc);
          html += cellule(fus.r1, fus.c1, rs, cs);
        } else html += cellule(r, c, 1, 1);
      }
      html += '</tr>';
    }
    html += '</table>';
    // Graphiques et images de la partie de feuille de cette page
    const x0 = X[p.colonnes[0]], x1 = X[p.colonnes[p.colonnes.length - 1] + 1], y0 = Y[p.lignes[0]], y1 = Y[p.lignes[p.lignes.length - 1] + 1];
    const decX = (regl.entetes ? 36 : 0) + pag.titresC.filter((c) => !p.colonnes.includes(c) && c < p.colonnes[0]).reduce((a, c) => a + largeur(f, c), 0);
    const decY = (regl.entetes ? 20 : 0) + pag.titresL.filter((r) => !p.lignes.includes(r) && r < p.lignes[0]).reduce((a, r) => a + hauteur(f, r), 0);
    let obj = '';
    for (const o of objets) if (o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0) obj += `<div class="objet-page" style="left:${o.x - x0 + decX}px;top:${o.y - y0 + decY}px;width:${o.w}px;height:${o.h}px">${o.html}</div>`;
    const contenuW = decX + (x1 - x0), contenuH = decY + (y1 - y0);
    const utileW = (W - (m.g + m.d) * 10) * MM, utileH = (H - (m.h + m.b) * 10) * MM;
    const dx = regl.centrerH ? Math.max(0, (utileW - contenuW * s) / 2) : 0, dy = regl.centrerV ? Math.max(0, (utileH - contenuH * s) / 2) : 0;
    const ctx = { page: k + 1, pages: pag.pages.length, fichier: C.nomFichier || '', feuille: f.nom };
    const bande = (hf, haut) => (hf.g || hf.c || hf.d ? `<div class="bande-page" style="${haut ? 'top' : 'bottom'}:${(haut ? m.entete : m.pied) * 10}mm"><span>${ech(remplacerCodes(hf.g, ctx))}</span><span>${ech(remplacerCodes(hf.c, ctx))}</span><span>${ech(remplacerCodes(hf.d, ctx))}</span></div>` : '');
    return `<div class="page" style="width:${W}mm;height:${H}mm">${bande(regl.entete, true)}<div class="zone-page" style="left:${m.g * 10}mm;top:${m.h * 10}mm;width:${W - (m.g + m.d) * 10}mm;height:${H - (m.h + m.b) * 10}mm">
      <div class="contenu-page" style="transform:translate(${dx}px,${dy}px) scale(${s});width:${contenuW}px;height:${contenuH}px">${html}${obj}</div></div>${bande(regl.pied, false)}</div>`;
  });
  return pages;
}
