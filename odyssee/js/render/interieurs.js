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
  aube: { orn: 'cadre', mur: 'fleurs', c: '#efe2c6', m: ['#d8b48a', '#c48a6c'], lambris: '#b98a58', bord: '#5a3e2c', sol: ['bois', 1, 1, 1] },
  sylve: { orn: 'bois', mur: 'planches', c: '#a8763f', lambris: null, bord: '#3e2a1c', sol: ['bois', 0.82, 0.74, 0.7] },
  pierre: { orn: 'pioches', mur: 'pierres', c: '#b5ada0', lambris: null, bord: '#46423e', sol: ['dalles'] },
  azur: { orn: 'bouee', mur: 'rayures', c: '#f2f4f2', m: ['#cadcea'], lambris: '#4f7fae', bord: '#2f4258', sol: ['bois', 1.08, 1.04, 0.96] },
  volta: { orn: 'horloge', mur: 'uni', c: '#dde2e8', lambris: '#7f8b9c', bord: '#3a4250', sol: ['carreaux', '#e8eaee', '#c4c8d0'] },
  flora: { orn: 'couronne', mur: 'fleurs', c: '#f5e8cc', m: ['#b49ad0', '#8ab06a'], lambris: '#9fbf8a', bord: '#6a5040', sol: ['tomettes', '#c27e58'] },
  mirage: { orn: 'kakejiku', mur: 'shoji', c: '#f2ead6', lambris: '#6a4a30', bord: '#2e2420', sol: ['tatami'] },
  granit: { orn: 'barre', mur: 'pierres', c: '#c9b2a6', lambris: '#f0ece4', bord: '#5a4a46', sol: ['bois', 0.95, 0.9, 0.86] },
  cendre: { orn: 'masque', mur: 'chaux', c: '#ece8e0', lambris: '#3a3634', bord: '#2a2624', sol: ['bois', 0.86, 0.66, 0.6] },
  ecaille: { orn: 'assiette', mur: 'chaux', c: '#f6f6f2', lambris: '#3a6ac8', bord: '#2a3e70', sol: ['carreaux', '#f0f0ea', '#b4c8e4'] },
  cime: { orn: 'bois', mur: 'rondins', c: '#8a5a34', lambris: null, bord: '#3a2618', sol: ['bois', 0.78, 0.7, 0.66] },
  plateau: { orn: 'blason', mur: 'uni', c: '#eceae4', lambris: '#5a6a8a', bord: '#2e3648', sol: ['marbre'] },
  metro: { orn: 'miroir', mur: 'damas', c: '#d8d0c0', m: ['#c4b9a4'], lambris: '#6a4a32', bord: '#3a2a20', sol: ['bois', 0.86, 0.76, 0.68] },
  lisiere: { orn: 'piments', mur: 'chaux', c: '#f4f0e8', lambris: '#a83a32', bord: '#4a2a24', sol: ['bois', 0.94, 0.86, 0.8] },
  marais: { orn: 'filet', mur: 'planches', c: '#8a8e74', lambris: null, bord: '#33352a', sol: ['bois', 0.74, 0.78, 0.7] },
  dunes: { orn: 'kilim', mur: 'adobe', c: '#d8a86a', lambris: '#b86a40', bord: '#6a4026', sol: ['tomettes', '#b8764e'] },
  forge: { orn: 'outils', mur: 'briques', c: '#8a4a36', lambris: '#4a4a50', bord: '#2a2a2e', sol: ['carreaux', '#6a6a70', '#4a4a52'] },
  rose: { orn: 'couronne', mur: 'fleurs', c: '#f6e2e8', m: ['#e08aa0', '#8ab07a'], lambris: '#f2f0ec', bord: '#6a4a50', sol: ['bois', 1.06, 0.98, 0.94] },
  ombre: { orn: 'chandelier', mur: 'damas', c: '#4a3e58', m: ['#5e4e70'], lambris: '#2e2638', bord: '#1c1622', sol: ['bois', 0.62, 0.56, 0.62] },
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
  p(x, y, c, a = 255) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const o = (y * this.w + x) * 4; this.d.data[o] = c[0]; this.d.data[o + 1] = c[1]; this.d.data[o + 2] = c[2]; this.d.data[o + 3] = a; }
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
/** objet accroché au mur, propre à la ville (bouée chez le marin, pioches chez le carrier, kakejiku à Mirage…),
 *  dessiné dans le haut du mur au pixel près */
function ornement(I, k, st, seed) {
  const P = (x, y, c) => I.p(x, y, typeof c === 'string' ? hex(c) : c);
  const R = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) P(i, j, c); };
  const disque = (cx, cy, r0, r1, f) => { for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d >= r0 && d < r1) P(x, y, f(x, y, d)); } };
  switch (k) {
    case 'bouee': {   // bouée rouge et blanche, corde
      disque(16, 17, 3, 8, (x, y, d) => { if (d > 7.1 || d < 3.9) return '#6a2a24'; const a = Math.atan2(y + 0.5 - 17, x + 0.5 - 16); const q = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4 + 0.5) % 2; return q ? (y < 17 ? '#fafaf6' : '#d0ccc4') : (y < 17 ? '#e8503e' : '#b8342c'); });
      for (let x = 9; x <= 23; x += 2) P(x, 17 + ((x >> 1) & 1), '#c8a060');
      R(15, 6, 2, 4, '#8a6a40'); break;
    }
    case 'pioches': {   // deux pioches croisées
      for (let i = 0; i < 16; i++) { P(9 + i, 9 + i, '#6a4a2a'); P(23 - i, 9 + i, '#7a5432'); P(10 + i, 9 + i, '#5a3a20'); }
      R(6, 8, 7, 2, '#8a8e98'); R(5, 10, 2, 2, '#6a6e78'); R(19, 8, 7, 2, '#8a8e98'); R(25, 10, 2, 2, '#6a6e78'); break;
    }
    case 'kakejiku': {   // rouleau suspendu : papier, montagne à l'encre, soleil rouge
      R(10, 5, 11, 2, '#3a2a1e'); R(11, 7, 9, 18, '#6a7a5a'); R(12, 8, 7, 16, '#f2ead6');
      for (let x = 12; x < 19; x++) { const h = 4 - Math.abs(x - 15); for (let y = 0; y < h; y++) P(x, 20 - y, '#4a4a52'); }
      P(16, 11, '#c83a32'); P(17, 11, '#c83a32'); P(16, 12, '#c83a32'); P(17, 12, '#c83a32');
      R(10, 25, 11, 2, '#3a2a1e'); R(15, 3, 1, 2, '#3a2a1e'); break;
    }
    case 'bois': {   // bois de cerf sur un écusson
      R(13, 15, 6, 7, '#7a4a2a'); R(14, 16, 4, 5, '#9a6a3a');
      for (const s of [-1, 1]) { const x0 = s < 0 ? 13 : 18; for (let i = 0; i < 6; i++) P(x0 + s * i, 14 - i, '#e8dcc0'); P(x0 + s * 2, 10, '#e8dcc0'); P(x0 + s * 2, 9, '#d8ccb0'); P(x0 + s * 4, 8, '#e8dcc0'); P(x0 + s * 4, 7, '#d8ccb0'); }
      break;
    }
    case 'barre': {   // barre de navire en bois
      disque(16, 16, 4, 6, () => '#8a5a34'); disque(16, 16, 0, 2, () => '#6a4428');
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (let r = 2; r <= 8; r++) P(Math.round(16 + Math.cos(a) * r), Math.round(16 + Math.sin(a) * r), r > 6 ? '#b88a5a' : '#7a4a2a'); }
      break;
    }
    case 'horloge': {   // pendule ronde
      disque(16, 16, 0, 6, (x, y, d) => (d > 5 ? '#3a4250' : '#f4f4f0'));
      R(16, 12, 1, 5, '#2a2e38'); R(16, 16, 3, 1, '#2a2e38'); P(16, 11, '#c83a32'); break;
    }
    case 'couronne': {   // couronne de fleurs
      disque(16, 16, 3.5, 6.5, (x, y) => (h2(x, y, seed) < 0.3 ? (st.m?.[0] || '#e05a7a') : h2(x, y, seed + 1) < 0.5 ? '#5a9a4a' : '#3a7a3a'));
      R(15, 21, 3, 2, '#e8c040'); break;
    }
    case 'masque': {   // masque de bois sculpté
      for (let y = 8; y < 24; y++) { const w = y < 12 ? 4 + (y - 8) : y < 20 ? 8 : 8 - (y - 19) * 2; R(16 - (w >> 1), y, w, 1, '#7a3a24'); }
      R(13, 13, 2, 2, '#1a1210'); R(18, 13, 2, 2, '#1a1210'); R(15, 18, 3, 1, '#e8c060'); R(12, 10, 9, 1, '#e8c060'); break;
    }
    case 'assiette': {   // assiette décorative bleue et blanche
      disque(16, 16, 0, 6.5, (x, y, d) => (d > 5.5 ? '#3a6ac8' : d > 4.5 ? '#f6f6f2' : (h2(x >> 1, y >> 1, seed) < 0.4 ? '#5a86d0' : '#f6f6f2')));
      break;
    }
    case 'blason': {   // écu bleu et or
      for (let y = 7; y < 25; y++) { const w = y < 18 ? 12 : 12 - (y - 17) * 2; R(16 - (w >> 1), y, w, 1, y < 9 ? '#e8c040' : '#3a5aa8'); }
      R(15, 11, 2, 9, '#e8c040'); R(12, 14, 8, 2, '#e8c040'); break;
    }
    case 'miroir': {   // grand miroir au cadre doré
      R(10, 6, 12, 20, '#c89a3a'); R(11, 7, 10, 18, '#a8c4d4');
      for (let i = 0; i < 6; i++) P(13 + i, 9 + i * 2, '#d8eaf2'); R(10, 6, 12, 1, '#e8c060'); break;
    }
    case 'piments': {   // guirlande de piments d'Espelette
      R(15, 5, 2, 3, '#8a6a40');
      for (let y = 8; y < 26; y++) for (const dx of [-1, 1]) if ((y + (dx > 0 ? 1 : 0)) % 2) { P(16 + dx * 2, y, '#c8281e'); P(16 + dx * 3, y, '#a01e18'); }
      R(15, 8, 2, 18, '#7a5a30'); break;
    }
    case 'filet': {   // filet de pêche tendu, flotteurs
      for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) P(x, y, '#9a8a64');
      for (const [x, y] of [[9, 8], [22, 10], [14, 21], [24, 22]]) R(x, y, 2, 2, '#e8a030'); break;
    }
    case 'kilim': {   // tapis tissé à motifs
      for (let y = 6; y < 26; y++) for (let x = 8; x < 24; x++) { const b = Math.floor((y - 6) / 4) % 3; let c = b === 0 ? '#b8442a' : b === 1 ? '#e8b048' : '#3a5a8a'; if (Math.abs(x - 16) + Math.abs(((y - 6) % 8) - 4) === 3) c = '#f4ead6'; P(x, y, c); }
      for (let x = 8; x < 24; x += 2) P(x, 26, '#e8b048'); break;
    }
    case 'outils': {   // marteau et pince sur un panneau
      R(8, 7, 16, 18, '#6a5a48'); R(9, 8, 14, 16, '#7a6a56');
      R(11, 10, 2, 11, '#8a5a34'); R(9, 9, 6, 3, '#5a5e68');
      for (let i = 0; i < 9; i++) { P(17 + (i >> 2), 10 + i, '#4a4e58'); P(21 - (i >> 2), 10 + i, '#4a4e58'); } break;
    }
    case 'chandelier': {   // applique à trois bougies
      R(15, 14, 2, 9, '#2a2026'); R(11, 18, 10, 1, '#2a2026');
      for (const x of [11, 16, 20]) { R(x, 14, 1, 4, '#e8e0d0'); P(x, 13, '#f8c040'); P(x, 12, '#fff4b0'); } break;
    }
    default: {   // cadre : un paysage de campagne
      R(7, 8, 18, 14, '#7a5432'); R(8, 9, 16, 12, '#9ad0f0');
      R(8, 15, 16, 6, '#6ab04a'); for (let x = 8; x < 24; x++) if (h2(x, 0, seed) < 0.4) P(x, 14, '#5a9a3a');
      R(18, 11, 2, 2, '#f8e070'); R(11, 13, 4, 2, '#4a8a3a'); break;
    }
  }
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
    { const c = murHaut(st, false, false, g), I = new Img(); I.x.drawImage(c, 0, 0); I.d = I.x.getImageData(0, 0, 32, 32); ornement(I, st.orn, st, g + 21); putImg(`int_${k}_orn`, I.fin()); }
    putImg(`int_${k}_bord`, bord(st, g + 5));
    const s = sol(st, img, g + 9); if (s) putImg(`int_${k}_sol`, s);
  });
}
