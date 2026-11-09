// odyssee/js/render/interieurs.js — intérieurs des maisons assortis à leur ville : papier peint, lambris, sol et bordure
// tirés de l'architecture du dehors (styles-villes.js). Une maison de carrier de Pierrefort a ses murs de pierre et ses
// dalles, une machiya de Mirage ses shoji et ses tatamis, un mas de Floralia ses tomettes et son papier à fleurs…
//
// Le mur du fond est dessiné à la densité de l'écran (un pixel = un pixel du jeu, 32 × 64 par case : haut et bas), avec
// des fenêtres qui donnent sur le jour ou sur la nuit. Seules les maisons d'habitation (sol « wood », mur « wall_in »)
// changent : Centres, boutiques, arènes, labo et lieux uniques gardent leur décor.
import { VILLE_STYLE } from './styles-villes.js';

/** réglages par style de ville : mur (motif, couleurs), lambris (null : le motif descend jusqu'à la plinthe), sol */
const S = {
  aube: { mur: 'fleurs', c: '#efe2c6', m: ['#d8b48a', '#c48a6c'], lambris: '#b98a58', bord: '#5a3e2c', sol: ['bois', 1, 1, 1] },
  sylve: { mur: 'planches', c: '#a8763f', lambris: null, bord: '#3e2a1c', sol: ['bois', 0.82, 0.74, 0.7] },
  pierre: { mur: 'pierres', c: '#b5ada0', lambris: null, bord: '#46423e', sol: ['dalles'] },
  azur: { mur: 'rayures', c: '#f2f4f2', m: ['#cadcea'], lambris: '#4f7fae', bord: '#2f4258', sol: ['bois', 1.08, 1.04, 0.96] },
  volta: { mur: 'uni', c: '#dde2e8', lambris: '#7f8b9c', bord: '#3a4250', sol: ['carreaux', '#e8eaee', '#c4c8d0'] },
  flora: { mur: 'fleurs', c: '#f5e8cc', m: ['#b49ad0', '#8ab06a'], lambris: '#9fbf8a', bord: '#6a5040', sol: ['tomettes', '#c27e58'] },
  mirage: { mur: 'shoji', c: '#f2ead6', lambris: '#6a4a30', bord: '#2e2420', sol: ['tatami'] },
  granit: { mur: 'pierres', c: '#c9b2a6', lambris: '#f0ece4', bord: '#5a4a46', sol: ['bois', 0.95, 0.9, 0.86] },
  cendre: { mur: 'chaux', c: '#ece8e0', lambris: '#3a3634', bord: '#2a2624', sol: ['bois', 0.86, 0.66, 0.6] },
  ecaille: { mur: 'chaux', c: '#f6f6f2', lambris: '#3a6ac8', bord: '#2a3e70', sol: ['carreaux', '#f0f0ea', '#b4c8e4'] },
  cime: { mur: 'rondins', c: '#8a5a34', lambris: null, bord: '#3a2618', sol: ['bois', 0.78, 0.7, 0.66] },
  plateau: { mur: 'uni', c: '#eceae4', lambris: '#5a6a8a', bord: '#2e3648', sol: ['marbre'] },
  metro: { mur: 'damas', c: '#d8d0c0', m: ['#c4b9a4'], lambris: '#6a4a32', bord: '#3a2a20', sol: ['bois', 0.86, 0.76, 0.68] },
  lisiere: { mur: 'chaux', c: '#f4f0e8', lambris: '#a83a32', bord: '#4a2a24', sol: ['bois', 0.94, 0.86, 0.8] },
  marais: { mur: 'planches', c: '#8a8e74', lambris: null, bord: '#33352a', sol: ['bois', 0.74, 0.78, 0.7] },
  dunes: { mur: 'adobe', c: '#d8a86a', lambris: '#b86a40', bord: '#6a4026', sol: ['tomettes', '#b8764e'] },
  forge: { mur: 'briques', c: '#8a4a36', lambris: '#4a4a50', bord: '#2a2a2e', sol: ['carreaux', '#6a6a70', '#4a4a52'] },
  rose: { mur: 'fleurs', c: '#f6e2e8', m: ['#e08aa0', '#8ab07a'], lambris: '#f2f0ec', bord: '#6a4a50', sol: ['bois', 1.06, 0.98, 0.94] },
  ombre: { mur: 'damas', c: '#4a3e58', m: ['#5e4e70'], lambris: '#2e2638', bord: '#1c1622', sol: ['bois', 0.62, 0.56, 0.62] },
};
export const STYLES_INT = Object.keys(S);

/** style d'intérieur d'une carte (null : décor d'origine) */
export function styleInterieur(map) {
  if (!map || map.outdoor || map.floor !== 'wood' || (map.wallStyle && map.wallStyle !== 'wall_in')) return null;
  const pre = String(map.id).split(':')[0];
  // hors des villes : cabanes des routes et des bois en rondins, hameaux et fermes à la campagne, maisons du rivage
  // au bord de mer, refuges du volcan en basalte
  const v = VILLE_STYLE[pre] || (/^r\d+$|^bois$/.test(pre) ? 'cime' : pre === 'lieu' ? 'aube' : pre === 'rive' ? 'azur' : pre === 'fumerolle' ? 'cendre' : null);
  return v && S[v] ? v : null;
}

/* ---------------- dessin (32 × 32, pixel pour pixel) ---------------- */
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const ton = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const h2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

class Img {
  constructor(w = 32, h = 32) { this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h; this.x = this.c.getContext('2d'); this.d = this.x.createImageData(w, h); this.w = w; this.h = h; }
  p(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const o = (y * this.w + x) * 4; this.d.data[o] = c[0]; this.d.data[o + 1] = c[1]; this.d.data[o + 2] = c[2]; this.d.data[o + 3] = a; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.p(i, j, c); }
  get(x, y) { const o = (y * this.w + x) * 4; return [this.d.data[o], this.d.data[o + 1], this.d.data[o + 2]]; }
  fin() { this.x.putImageData(this.d, 0, 0); return this.c; }
}

/** motif du papier peint (ou de la paroi) sur la zone y0..y1 */
function motif(I, st, y0, y1, seed) {
  const c = hex(st.c), cs = ton(c, 0.88), cl = ton(c, 1.06), m = (st.m || []).map(hex);
  for (let y = y0; y < y1; y++) for (let x = 0; x < 32; x++) {
    const n = h2(x, y, seed);
    let o = n < 0.06 ? cs : n > 0.97 ? cl : c;
    switch (st.mur) {
      case 'rayures': if (x % 8 === 2 || x % 8 === 3) o = m[0]; break;
      case 'fleurs': {
        // petite fleur de 3 pixels tous les 8, rangées décalées
        const cy = Math.floor(y / 8), ox = (cy & 1) * 4, fx = (x + ox) % 8, fy = y % 8;
        const col = m[(cy + Math.floor((x + ox) / 8)) % m.length];
        if ((fx === 3 && (fy === 2 || fy === 4)) || (fy === 3 && (fx === 2 || fx === 4))) o = col;
        else if (fx === 3 && fy === 3) o = ton(col, 0.75);
        break;
      }
      case 'damas': {
        // losanges de damas
        const a = Math.abs(((x + 4) % 8) - 4) + Math.abs(((y + 4) % 12) - 6);
        if (a === 5) o = m[0]; else if (a === 2 && ((x + y) & 1)) o = m[0];
        break;
      }
      case 'planches': {
        // planches verticales de 8 pixels, joint sombre, veinage
        const k = x % 8; if (k === 0) o = ton(c, 0.62); else if (k === 1) o = ton(c, 1.08);
        else if (h2(Math.floor(x / 8), Math.floor(y / 3), seed + 3) < 0.25 && k > 2 && k < 6) o = ton(c, 0.9);
        if (h2(Math.floor(x / 8), 0, seed + 7) < 0.3) o = ton(o, 0.92);
        break;
      }
      case 'rondins': {
        // rondins couchés de 8 pixels : arrondis (clair en haut, sombre en bas), fente entre deux
        const k = y % 8; o = k === 0 ? ton(c, 0.55) : k === 1 ? ton(c, 1.15) : k === 2 ? ton(c, 1.06) : k >= 6 ? ton(c, 0.8) : c;
        if (k > 1 && k < 6 && h2(Math.floor(x / 5), Math.floor(y / 8), seed + 2) < 0.18) o = ton(o, 0.9);
        break;
      }
      case 'pierres': {
        // moellons en rangées de 8, joints décalés, chaque pierre sa nuance
        const r = Math.floor(y / 8), dx = (r & 1) * 6 + (r % 3) * 2, col = Math.floor((x + dx) / 11), k = (x + dx) % 11, j = y % 8;
        const t = 0.9 + h2(col, r, seed + 5) * 0.2;
        o = j === 7 || k === 10 ? ton(c, 0.66) : j === 0 || k === 0 ? ton(c, 1.1 * t) : ton(c, t);
        if (n < 0.08 && j > 0 && j < 7) o = ton(o, 0.9);
        break;
      }
      case 'briques': {
        const r = Math.floor(y / 4), k = (x + (r & 1) * 4) % 8, j = y % 4;
        const t = 0.9 + h2(Math.floor((x + (r & 1) * 4) / 8), r, seed + 9) * 0.2;
        o = j === 3 || k === 7 ? [92, 84, 76] : ton(c, t * (j === 0 ? 1.08 : 1));
        break;
      }
      case 'adobe': o = n < 0.12 ? ton(c, 0.93) : n > 0.9 ? ton(c, 1.04) : c; break;
      case 'chaux': o = n < 0.1 ? ton(c, 0.95) : c; break;
      case 'shoji': {
        // cloisons de papier : poteaux sombres tous les 16, petit quadrillage de bois clair
        const k = x % 16, bois = hex(st.lambris);
        if (k === 0 || k === 1) o = bois;
        else if (k % 5 === 1 || y % 6 === 0) o = ton(bois, 1.6);
        else o = n < 0.05 ? ton(c, 0.96) : c;
        break;
      }
      default: break;
    }
    I.p(x, y, o);
  }
}

/** haut du mur : corniche (3 px) puis le motif ; fen : avec une fenêtre (jour ou nuit) */
function murHaut(st, fen, nuit, seed) {
  const I = new Img(); motif(I, st, 0, 32, seed);
  const b = hex(st.bord);
  I.rect(0, 0, 32, 2, ton(b, 1.2)); I.rect(0, 2, 32, 1, ton(b, 1.6));
  if (fen) {
    // fenêtre de 20 × 18 : cadre, croisillon, ciel (dégradé en paliers) ou nuit étoilée, rideaux
    const x0 = 6, y0 = 11, w = 20, h = 16, cadre = st.mur === 'shoji' ? hex('#4a3424') : hex('#f4efe4'), ombre = ton(cadre, 0.7);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const bord = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1, crois = x === x0 + w / 2 || y === y0 + 7;
      if (bord || crois) { I.p(x, y, bord && (x === x0 + w - 1 || y === y0 + h - 1) ? ombre : cadre); continue; }
      const t = (y - y0) / h;
      let col = nuit ? (t < 0.5 ? [26, 34, 70] : [34, 46, 88]) : (t < 0.34 ? [128, 186, 236] : t < 0.67 ? [156, 204, 242] : [186, 222, 246]);
      if (!nuit && (x - x0 + (y - y0)) % 9 === 0 && t < 0.6) col = [214, 236, 252];   // reflet
      if (nuit && h2(x, y, seed + 11) < 0.03) col = [230, 230, 200];                  // étoile
      if (!nuit && t > 0.72 && h2(x >> 2, 0, seed + 13) < 0.7) col = [96, 150, 84];   // cime d'arbres au loin
      I.p(x, y, col);
    }
    I.rect(x0 - 1, y0 + h, w + 2, 2, ton(cadre, 0.85));   // appui
    // rideaux sur les côtés
    const rid = st.mur === 'shoji' ? null : ton(hex(st.lambris || st.bord), 1.25);
    if (rid) for (let y = y0 - 1; y < y0 + h - 2; y++) for (const x of [x0 - 2, x0 - 1, x0 + 1, x0 + w - 2, x0 + w, x0 + w + 1]) I.p(x, y, (x + y) % 3 ? rid : ton(rid, 0.8));
  }
  return I.fin();
}
/** bas du mur : cimaise, lambris (panneaux) ou motif, plinthe */
function murBas(st, seed) {
  const I = new Img(); motif(I, st, 0, 32, seed + 1);
  if (st.lambris) {
    const l = hex(st.lambris);
    for (let y = 8; y < 32; y++) for (let x = 0; x < 32; x++) {
      const k = x % 16, j = y - 8;
      let o = l;
      if (k === 0) o = ton(l, 0.72); else if (k === 1) o = ton(l, 1.12);
      else if ((k === 3 || k === 14) && j > 3 && j < 18) o = ton(l, k === 3 ? 0.84 : 1.08);   // moulure des panneaux
      else if ((j === 4 || j === 17) && k > 3 && k < 14) o = ton(l, j === 4 ? 0.84 : 1.08);
      if (h2(x, y, seed + 17) < 0.05) o = ton(o, 0.94);
      I.p(x, y, o);
    }
    I.rect(0, 6, 32, 2, ton(l, 1.18)); I.rect(0, 8, 32, 1, ton(l, 0.7));   // cimaise
  }
  const p = ton(hex(st.bord), 1.3);
  I.rect(0, 27, 32, 4, p); I.rect(0, 27, 32, 1, ton(p, 1.35)); I.rect(0, 31, 32, 1, ton(p, 0.6));   // plinthe
  return I.fin();
}
/** bordure (dessus des murs et des côtés de la pièce) : la couleur sombre du style, à peine grenue */
function bord(st, seed) {
  const I = new Img(), b = hex(st.bord);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = h2(x, y, seed); I.p(x, y, n < 0.08 ? ton(b, 0.85) : n > 0.94 ? ton(b, 1.15) : b); }
  return I.fin();
}
/** sol : parquet recoloré, dalles, carreaux, tomettes, tatamis, marbre (img : tuiles de l'atlas déjà faites) */
function sol(st, img, seed) {
  const [t, a, b, c] = st.sol;
  const copie = (k) => { const s = img[k]; if (!s) return null; const I = new Img(); I.x.drawImage(s, 0, 0, 32, 32); I.d = I.x.getImageData(0, 0, 32, 32); return I; };
  if (t === 'bois') {
    const I = copie('floor_wood'); if (!I) return null;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const q = I.get(x, y); I.p(x, y, [q[0] * a, q[1] * b, q[2] * c].map((v) => Math.min(255, Math.round(v)))); }
    return I.fin();
  }
  if (t === 'dalles') return img.floor_pierre || null;
  if (t === 'tatami') return img.floor_temple || null;
  if (t === 'marbre') return img.floor_musee || null;
  const I = new Img();
  if (t === 'carreaux') {
    // grands carreaux de 16, en damier, joints fins
    const A = hex(a), B = hex(b);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dam = ((x >> 4) + (y >> 4)) & 1, n = h2(x, y, seed);
      let o = dam ? B : A; if (n < 0.05) o = ton(o, 0.95);
      if (x % 16 === 15 || y % 16 === 15) o = ton(o, 0.8); else if (x % 16 === 0 || y % 16 === 0) o = ton(o, 1.06);
      I.p(x, y, o);
    }
  } else if (t === 'tomettes') {
    // tomettes : petits pavés de terre cuite (8 × 8), chacun sa nuance, joints clairs
    const A = hex(a);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const r = y >> 3, dx = (r & 1) * 4, k = (x + dx) % 8, j = y % 8, tt = 0.93 + h2((x + dx) >> 3, r, seed) * 0.14;
      let o = ton(A, tt);
      if (k === 7 || j === 7) o = ton(A, 0.78); else if (k === 0 || j === 0) o = ton(A, tt * 1.06);
      I.p(x, y, o);
    }
  } else return null;
  return I.fin();
}

/** ajoute à l'atlas, pour chaque style : int_<s>_haut, _fen, _fenN (nuit), _bas, _bord, _sol */
export function texturesInterieurs(putImg, img) {
  STYLES_INT.forEach((k, i) => {
    const st = S[k], g = 1000 + i * 97;
    putImg(`int_${k}_haut`, murHaut(st, false, false, g));
    putImg(`int_${k}_fen`, murHaut(st, true, false, g));
    putImg(`int_${k}_fenN`, murHaut(st, true, true, g));
    putImg(`int_${k}_bas`, murBas(st, g));
    putImg(`int_${k}_bord`, bord(st, g + 5));
    const s = sol(st, img, g + 9); if (s) putImg(`int_${k}_sol`, s);
  });
}
