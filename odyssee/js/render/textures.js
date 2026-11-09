// odyssee/js/render/textures.js — pixel art procédural (tuiles 16 px, sprites, façades), dessiné au chargement.
// Tout est original : palettes et motifs inspirés de l'ambiance des jeux DS, sans reprendre de tuiles existantes.

import { SOL16_JEUX } from '../data/sol16.js';
import { REGLES, kitCell } from '../data/regles.js';
import { texturesRelief, tourbillon, quart, remous, koi } from './relief-tex.js';
import { texturesSerre, spritesSerre } from './serre-tex.js';
import { texturesInterieurs } from './interieurs.js';

export const CELL = 16, PITCH = 18;

/* ---------------- outils ---------------- */
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function shade(c, k) { const [r, g, b] = hex(c); const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

class Pix {
  constructor(w, h, seed = 1) { this.c = canvas(w, h); this.x = this.c.getContext('2d'); this.w = w; this.h = h; this.r = rng(seed); }
  p(x, y, col) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.x.fillStyle = col; this.x.fillRect(x | 0, y | 0, 1, 1); }
  rect(x, y, w, h, col) { this.x.fillStyle = col; this.x.fillRect(x | 0, y | 0, w | 0, h | 0); }
  fill(col) { this.rect(0, 0, this.w, this.h, col); }
  speck(n, col, x0 = 0, y0 = 0, w = this.w, h = this.h) { for (let i = 0; i < n; i++) this.p(x0 + Math.floor(this.r() * w), y0 + Math.floor(this.r() * h), col); }
  ri(n) { return Math.floor(this.r() * n); }
}

/* ---------------- palettes ---------------- */
export const PAL = {
  grass: ['#84d66c', '#6cc25c', '#9fe486', '#4fa650', '#c2f0a0'],
  tall: ['#4fae4f', '#3a9442', '#76d064', '#2b7a37', '#a6ec8a'],
  dark: ['#3f8f47', '#2e7439', '#5aae58', '#225c2e', '#86d077'],
  path: ['#e3c690', '#cfae74', '#f0dcac', '#b38f58', '#9a7646'],
  sand: ['#f2e2a6', '#e0cc8a', '#fbf0c6', '#cbb474', '#b89e5e'],
  pave: ['#d9d3c6', '#c3bcad', '#ece8de', '#a8a092', '#8e8679'],
  water: ['#4b94e6', '#3a7ad0', '#7cb9f6', '#c6e4ff', '#2d63b4'],
  cave: ['#a58b6e', '#8e7558', '#bba183', '#6f5a43', '#5a4836'],
  ash: ['#8c8580', '#77706b', '#a39c96', '#5f5955', '#4a4542'],
  snow: ['#eef4fb', '#d4e0ee', '#ffffff', '#b8c8dc', '#9fb2ca'],
  rock: ['#a7a7a4', '#8d8d8a', '#c6c6c2', '#6c6c6a', '#4f4f4e'],
  cliff: ['#b39472', '#977a5b', '#cfb08c', '#7a6047', '#5e4836'],
  wood: ['#c99a62', '#b0814b', '#ddb27c', '#8c6236', '#6e4a27'],
};

/* ---------------- tuiles de sol ---------------- */
function grassCell(P, pal, density = 1) {
  const [b, d, l, dd, hl] = pal;
  P.fill(b);
  // touffes en « v » comme sur DS
  const n = Math.round(5 * density);
  for (let i = 0; i < n; i++) {
    const x = 1 + P.ri(13), y = 2 + P.ri(12);
    P.p(x, y, d); P.p(x + 2, y, d); P.p(x + 1, y + 1, d);
    P.p(x, y - 1, l);
  }
  P.speck(3 * density, l); P.speck(2, hl);
}
function dirtCell(P, pal, pebbles = 4) {
  const [b, d, l, dd] = pal; P.fill(b);
  P.speck(10, d); P.speck(6, l);
  for (let i = 0; i < pebbles; i++) { const x = P.ri(14), y = P.ri(14); P.p(x, y, dd); P.p(x + 1, y, d); P.p(x, y - 1, l); }
}
function paveCell(P, pal) {
  const [b, d, l, dd] = pal; P.fill(b);
  // dalles 8×8 décalées
  for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x += 8) {
    const ox = (y / 8) % 2 ? 4 : 0;
    P.rect((x + ox) % 16, y, 1, 8, d); P.rect(0, y, 16, 1, d);
    P.p((x + ox + 1) % 16, y + 1, l); P.p((x + ox + 2) % 16, y + 1, l);
  }
  P.speck(4, l); P.speck(3, dd);
}
/** bordure d'herbe sur les côtés où le voisin n'est pas du même groupe */
function grassEdges(P, mask, outline) {
  const g = PAL.grass;
  const side = (dir) => !(mask & dir);
  for (let i = 0; i < 16; i++) {
    const j = (P.r() < 0.5 ? 1 : 0) + 1;
    if (side(1)) { P.rect(i, 0, 1, j, g[0]); P.p(i, j, outline); }
    if (side(4)) { P.rect(i, 16 - j, 1, j, g[0]); P.p(i, 15 - j, outline); }
    if (side(8)) { P.rect(0, i, j, 1, g[0]); P.p(j, i, outline); }
    if (side(2)) { P.rect(16 - j, i, j, 1, g[0]); P.p(15 - j, i, outline); }
  }
}
function waterCell(P, mask, frame) {
  const [b, d, l, hl, dd] = PAL.water; P.fill(b);
  // vaguelettes qui glissent selon la frame
  for (let k = 0; k < 4; k++) {
    const y = (k * 4 + 1) % 16, x0 = (k * 5 + frame * 2) % 16;
    for (let i = 0; i < 4; i++) P.p((x0 + i) % 16, y, l);
    P.p((x0 + 1) % 16, y - 1 < 0 ? 15 : y - 1, hl);
    P.p((x0 + 8) % 16, (y + 2) % 16, d);
    P.p((x0 + 9) % 16, (y + 2) % 16, d);
  }
  // rivage : écume + sable
  const foam = frame % 2 ? '#e8f4ff' : '#d0e8ff';
  const s = PAL.sand[0];
  if (!(mask & 1)) { P.rect(0, 0, 16, 2, s); P.rect(0, 2, 16, 1, foam); }
  if (!(mask & 4)) { P.rect(0, 14, 16, 2, s); P.rect(0, 13, 16, 1, foam); }
  if (!(mask & 8)) { P.rect(0, 0, 2, 16, s); P.rect(2, 0, 1, 16, foam); }
  if (!(mask & 2)) { P.rect(14, 0, 2, 16, s); P.rect(13, 0, 1, 16, foam); }
}
function flowerCell(P, frame, kind) {
  grassCell(P, PAL.grass, 0.5);
  const cols = kind === 0 ? ['#f05050', '#ffd040'] : kind === 1 ? ['#ffffff', '#f8d84a'] : ['#f6a2d0', '#ffffff'];
  const spots = [[3, 4], [11, 3], [7, 10], [13, 12], [2, 13]];
  spots.forEach(([x, y], i) => {
    const sw = (frame + i) % 2 ? 1 : 0; const c = cols[i % 2 ? 1 : 0];
    P.p(x + sw, y - 1, c); P.p(x - 1 + sw, y, c); P.p(x + 1 + sw, y, c); P.p(x + sw, y + 1, c); P.p(x + sw, y, '#f8f080');
    P.p(x, y + 2, PAL.grass[3]);
  });
}
function ledgeCell(P, dir) {
  grassCell(P, PAL.grass, 0.7);
  const g = PAL.grass;
  if (dir === 's') {
    P.rect(0, 9, 16, 1, '#e8f8c8'); P.rect(0, 10, 16, 2, g[1]); P.rect(0, 12, 16, 2, g[3]); P.rect(0, 14, 16, 1, '#2f6a33');
    for (let x = 0; x < 16; x += 4) P.p(x + 1, 11, g[3]);
  } else {
    const x0 = dir === 'e' ? 9 : 2;
    P.rect(x0, 0, 2, 16, g[1]); P.rect(dir === 'e' ? x0 + 2 : x0 - 1, 0, 2, 16, g[3]); P.rect(dir === 'e' ? x0 - 1 : x0 + 2, 0, 1, 16, '#e8f8c8');
  }
}
function bridgeCell(P) {
  const w = PAL.wood; P.fill(w[0]);
  for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, w[3]); P.rect(0, y + 1, 16, 1, w[2]); }
  P.speck(6, w[1]); P.rect(0, 0, 1, 16, w[4]); P.rect(15, 0, 1, 16, w[4]);
}
function floorCell(P, style) {
  const F = {
    wood: ['#d8a868', '#c08c50', '#e8c088', '#a87440'],
    center: ['#f2ece0', '#ddd2c0', '#ffffff', '#c8b8a0'],
    mart: ['#e2ecf2', '#c8d6e0', '#f6fbff', '#a8b8c8'],
    lab: ['#e8e8ec', '#cfd0d8', '#fafafc', '#b0b2bc'],
    league: ['#c8b6e8', '#a894d0', '#e2d6f8', '#8a74b8'],
    gymBug: ['#b6d68a', '#98bc68', '#d2ecaa', '#78a050'], gymRock: ['#c8b49a', '#aa967a', '#e0d0b8', '#8a765e'],
    gymWater: ['#a8d4f0', '#88b8e0', '#c8e8ff', '#6898c8'], gymElec: ['#f0e08a', '#d8c464', '#fff4b0', '#b8a040'],
    gymGrass: ['#9ad48a', '#7cbc6c', '#bce8a8', '#5c9c4c'], gymPsy: ['#e0b0e0', '#c890c8', '#f4d0f4', '#a870a8'],
    gymFire: ['#e8a888', '#d08868', '#f8c8a8', '#b06848'], gymDragon: ['#a8a0d8', '#8880c0', '#c8c0f0', '#6860a0'],
  }[style] || ['#d8c8a8', '#c0b090', '#e8dcc0', '#a89878'];
  P.fill(F[0]);
  if (style === 'wood') { for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, F[1]); P.p((y * 3) % 16, y + 2, F[3]); } P.speck(5, F[2]); return; }
  if (style === 'center' || style === 'mart' || style === 'lab' || style === 'league') {
    P.rect(0, 0, 16, 1, F[1]); P.rect(0, 0, 1, 16, F[1]); P.rect(8, 0, 1, 16, F[1]); P.rect(0, 8, 16, 1, F[1]);
    P.p(2, 2, F[2]); P.p(10, 10, F[2]); P.p(3, 2, F[2]); P.p(11, 10, F[2]); return;
  }
  P.rect(0, 0, 16, 1, F[1]); P.rect(0, 0, 1, 16, F[1]); P.rect(15, 0, 1, 16, F[3]); P.rect(0, 15, 16, 1, F[3]); P.speck(6, F[2]);
}

/* ---------------- atlas des tuiles ---------------- */
// cases de 32 pixels (une case du décor à l'écran, pixel pour pixel) : les tuiles du tileset dessiné y vont telles
// quelles, les tuiles du code (16 pixels) y sont agrandies ×2
const C2 = 32, P2 = 34;
const herbeImg = (theme, k) => SOL32['h_' + theme + '_' + k] || null;
/** pose une image 32 × 32 dans une case de l'atlas, bords prolongés d'un pixel (pas de couture au filtrage) */
function blit(ctx, img, cx, cy) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, C2, C2, cx + 1, cy + 1, C2, C2);
  ctx.drawImage(img, 0, 0, C2, 1, cx + 1, cy, C2, 1); ctx.drawImage(img, 0, C2 - 1, C2, 1, cx + 1, cy + C2 + 1, C2, 1);
  ctx.drawImage(img, 0, 0, 1, C2, cx, cy + 1, 1, C2); ctx.drawImage(img, C2 - 1, 0, 1, C2, cx + C2 + 1, cy + 1, 1, C2);
}
const up2 = (src) => { const c = canvas(C2, C2), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, src.width, src.height, 0, 0, C2, C2); return c; };
/** bordure d'herbe dessinée (32 px) autour d'un chemin : dentelée, avec un liseré sombre, sur les côtés sans voisin */
function grassEdges32(base, grass, mask, seed) {
  const c = canvas(C2, C2), x = c.getContext('2d'); x.drawImage(base, 0, 0);
  const r = rng(seed * 7919 + mask * 31 + 1);
  const gd = grass.getContext ? grass.getContext('2d') : (() => { const t = canvas(C2, C2); t.getContext('2d').drawImage(grass, 0, 0); return t.getContext('2d'); })();
  const gp = gd.getImageData(0, 0, C2, C2).data, out = x.getImageData(0, 0, C2, C2), d = out.data;
  const depth = (side) => { const v = []; let cur = 3; for (let i = 0; i < C2; i++) { if (r() < 0.35) cur = Math.max(2, Math.min(5, cur + (r() < 0.5 ? -1 : 1))); v.push(cur); } return v; };
  const sides = [[1, (i, k) => [i, k]], [4, (i, k) => [i, C2 - 1 - k]], [8, (i, k) => [k, i]], [2, (i, k) => [C2 - 1 - k, i]]];
  for (const [bit, at] of sides) {
    if (mask & bit) continue;
    const dep = depth(bit);
    for (let i = 0; i < C2; i++) for (let k = 0; k <= dep[i]; k++) {
      const [px, py] = at(i, k), o = (py * C2 + px) * 4;
      if (k === dep[i]) { d[o] = d[o] * 0.62; d[o + 1] = d[o + 1] * 0.6; d[o + 2] = d[o + 2] * 0.55; }
      else { d[o] = gp[o]; d[o + 1] = gp[o + 1]; d[o + 2] = gp[o + 2]; }
    }
  }
  x.putImageData(out, 0, 0);
  return c;
}
/** pièce de hautes herbes posée sur son sol */
function onGround(ground, piece) { const c = canvas(C2, C2), x = c.getContext('2d'); x.drawImage(ground, 0, 0); x.drawImage(piece, 0, 0); return c; }

export function buildAtlas() {
  const SIZE = 2048, cols = Math.floor(SIZE / P2);
  const atlas = canvas(SIZE, SIZE), ctx = atlas.getContext('2d');
  const cells = {}; let n = 0;
  const slot = (key) => { const cx = (n % cols) * P2, cy = Math.floor(n / cols) * P2; n++; cells[key] = [(cx + 1) / SIZE, (cy + 1) / SIZE, (cx + 1 + C2) / SIZE, (cy + 1 + C2) / SIZE]; return [cx, cy]; };
  const img = {}; // tuile finale (32 px) de chaque clé, pour composer les suivantes
  function put(key, draw, seed = n + 7) {
    const P = new Pix(CELL, CELL, seed * 9973 + 17); draw(P);
    const c = up2(P.c); img[key] = c; const [cx, cy] = slot(key); blit(ctx, c, cx, cy);
  }
  function putImg(key, c) { img[key] = c; const [cx, cy] = slot(key); blit(ctx, c, cx, cy); }
  // tuile dessinée (tileset) si elle existe, sinon celle du code
  const drawn = (k) => SOL32[k] || null;
  function putSol(key, alt, draw, seed) { const d = drawn(alt || key); if (d) putImg(key, up2(d)); else put(key, draw, seed); }

  putSol('grass0', 'grass0', (P) => grassCell(P, PAL.grass, 0.6));
  putSol('grass1', 'grass1', (P) => grassCell(P, PAL.grass, 0.85));
  putSol('grass2', 'grass2', (P) => grassCell(P, PAL.grass, 1.1));
  putSol('grass3', 'grass0', (P) => grassCell(P, PAL.grass, 1.35));
  for (let v = 0; v < 2; v++) put('tall' + v, (P) => grassCell(P, PAL.tall, 1.6));
  for (let v = 0; v < 2; v++) put('darktall' + v, (P) => grassCell(P, PAL.dark, 1.6));
  for (let v = 0; v < 2; v++) put('snowtall' + v, (P) => grassCell(P, PAL.tall, 1.6));
  for (let v = 0; v < 2; v++) putSol('forest' + v, 'forest' + v, (P) => grassCell(P, PAL.dark, 1));
  const grassImg = img.grass0;
  for (const [k, pal, outline] of [['path', PAL.path, '#a88a58'], ['sand', PAL.sand, '#c8b070'], ['pave', PAL.pave, '#a09888']]) {
    const base = drawn(k + '0');
    for (let m = 0; m < 16; m++) {
      if (base) putImg(k + m, grassEdges32(up2(base), grassImg, m, k.length));
      else put(k + m, (P) => { if (k === 'pave') paveCell(P, pal); else dirtCell(P, pal, k === 'path' ? 3 : 1); grassEdges(P, m, outline); });
    }
  }
  for (let v = 0; v < 2; v++) putSol('cave' + v, 'cave' + v, (P) => dirtCell(P, PAL.cave, 5));
  for (let v = 0; v < 2; v++) putSol('ash' + v, 'ash' + v, (P) => dirtCell(P, PAL.ash, 6));
  for (let v = 0; v < 2; v++) putSol('snow' + v, 'snow' + v, (P) => { P.fill(PAL.snow[0]); P.speck(8, PAL.snow[1]); P.speck(5, PAL.snow[2]); });
  putSol('ledge', 'ledge', (P) => ledgeCell(P, 's')); putSol('ledgeE', 'ledgeE', (P) => ledgeCell(P, 'e')); putSol('ledgeW', 'ledgeW', (P) => ledgeCell(P, 'w'));
  putSol('bridge', 'bridgeNS', bridgeCell); putSol('bridgeEW', 'bridgeEW', bridgeCell);
  putSol('stairs', 'stairs', (P) => { const c = PAL.rock; P.fill(c[0]); for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, c[2]); P.rect(0, y + 3, 16, 1, c[3]); } });
  put('cavestairs', (P) => { const c = PAL.cave; P.fill(c[0]); for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, c[2]); P.rect(0, y + 3, 16, 1, c[3]); } });
  // sols d'intérieur : la tuile du tileset qui correspond à chaque salle
  const FLOOR32 = { base: 'floor_metal', temple: 'tatami', musee: 'floor_marble', wood: 'floor_wood', center: 'floor_pink', mart: 'floor_blue', lab: 'floor_white', league: 'carpet', cendre: 'floor_dark', gymBug: 'leaves0', gymRock: 'floor_stone', gymWater: 'floor_blue2', gymElec: 'floor_metal', gymGrass: 'tatami', gymPsy: 'floor_marble', gymFire: 'floor_dark2', gymDragon: 'floor_dark', cave: 'cave0' };
  for (const st of ['wood', 'center', 'mart', 'lab', 'league', 'gymBug', 'gymRock', 'gymWater', 'gymElec', 'gymGrass', 'gymPsy', 'gymFire', 'gymDragon', 'base', 'temple', 'musee']) putSol('floor_' + st, FLOOR32[st], (P) => floorCell(P, st));
  put('mat', (P) => { P.fill('#c84848'); P.rect(1, 1, 14, 14, '#e06060'); P.rect(3, 3, 10, 10, '#c84848'); P.rect(0, 15, 16, 1, '#902a2a'); });
  put('matgreen', (P) => { P.fill('#3c8c54'); P.rect(1, 1, 14, 14, '#56a86c'); P.rect(3, 3, 10, 10, '#3c8c54'); });
  put('void', (P) => P.fill('#101018'));
  // faces verticales
  put('cliff', (P) => { const c = PAL.cliff; P.fill(c[0]); for (let y = 2; y < 16; y += 5) { P.rect(0, y, 16, 1, c[3]); for (let x = 0; x < 16; x += 6) P.p((x + y) % 16, y + 1, c[2]); } P.rect(0, 0, 16, 2, PAL.grass[3]); P.p(3, 2, PAL.grass[3]); P.p(9, 2, PAL.grass[3]); P.speck(6, c[1]); });
  putSol('cliffplain', 'cliffR', (P) => { const c = PAL.cliff; P.fill(c[0]); for (let y = 2; y < 16; y += 5) { P.rect(0, y, 16, 1, c[3]); for (let x = 0; x < 16; x += 6) P.p((x + y) % 16, y + 1, c[2]); } P.speck(6, c[1]); });
  put('cavewall', (P) => { const c = PAL.cave; P.fill(c[3]); for (let y = 1; y < 16; y += 4) { P.rect(0, y, 16, 1, c[4]); P.p(P.ri(16), y + 1, c[1]); P.p(P.ri(16), y + 2, c[0]); } P.speck(8, c[1]); });
  put('cavetop', (P) => { P.fill('#2e241c'); P.speck(10, '#3c3026'); P.speck(4, '#1e1812'); });
  put('wall_in', (P) => { P.fill('#f0e6d2'); P.rect(0, 12, 16, 4, '#c8a878'); P.rect(0, 12, 16, 1, '#a88858'); P.speck(4, '#e2d6be'); });
  put('wall_center', (P) => { P.fill('#fbf4ec'); P.rect(0, 10, 16, 6, '#f08890'); P.rect(0, 10, 16, 1, '#d05860'); });
  put('wall_mart', (P) => { P.fill('#f4f8fc'); P.rect(0, 10, 16, 6, '#7aa8e0'); P.rect(0, 10, 16, 1, '#4a78b8'); });
  put('wall_gym', (P) => { P.fill('#c0c4d0'); P.rect(0, 0, 16, 1, '#e0e4f0'); for (let y = 4; y < 16; y += 4) P.rect(0, y, 16, 1, '#a0a4b4'); });
  put('wall_league', (P) => { P.fill('#6c5c9c'); P.rect(0, 0, 16, 2, '#9c8cd0'); for (let x = 0; x < 16; x += 8) P.rect(x, 2, 1, 14, '#54447c'); });
  put('walltop', (P) => { P.fill('#3a3448'); P.speck(4, '#4a4458'); });
  put('counter', (P) => { P.fill('#e8d8c0'); P.rect(0, 0, 16, 2, '#fff8ec'); P.rect(0, 14, 16, 2, '#b89c78'); });
  put('counterfront', (P) => { P.fill('#d06070'); P.rect(0, 0, 16, 2, '#f0a0a8'); P.rect(0, 13, 16, 3, '#a03848'); });
  put('martfront', (P) => { P.fill('#5a8ad0'); P.rect(0, 0, 16, 2, '#9ac0f0'); P.rect(0, 13, 16, 3, '#3a5a98'); });
  put('shelf', (P) => { P.fill('#8a6440'); for (let y = 1; y < 16; y += 5) { P.rect(1, y, 14, 4, '#5a3e24'); for (let x = 2; x < 14; x += 3) P.rect(x, y + 1, 2, 3, ['#e05050', '#50a0e0', '#f0c040', '#60c060'][(x + y) % 4]); } });
  put('roof_flat', (P) => { P.fill('#5c6a7c'); P.speck(6, '#6c7a8c'); });
  // sols et murs d'intérieur dessinés de la première version (16 px) : ils remplacent la version du code, sauf
  // quand le tileset fournit déjà la tuile
  for (const k of ['tall0', 'tall1', 'darktall0', 'darktall1', 'snowtall0', 'snowtall1', 'floor_wood', 'floor_center', 'floor_mart', 'floor_lab', 'floor_league', 'floor_gymBug', 'floor_gymRock', 'floor_gymWater', 'floor_gymElec', 'floor_gymGrass', 'floor_gymPsy', 'floor_gymFire', 'floor_gymDragon', 'wall_center', 'wall_mart', 'wall_gym', 'wall_league', 'counter', 'counterfront', 'martfront']) {
    const im = SOLS[k]; if (!im || !cells[k]) continue;
    if (k.startsWith('floor_') && drawn(FLOOR32[k.slice(6)])) continue;
    const [u0, v0] = cells[k], cx = Math.round(u0 * SIZE) - 1, cy = Math.round(v0 * SIZE) - 1;
    blit(ctx, up2(im), cx, cy);
  }
  // hautes herbes du tileset : chaque pièce (bords, coins, pleines) posée sur le sol qui l'entoure
  const HERBE_GROUND = { prairie: img.grass0, bois: img.grass0, neige: img.snow0 };
  for (const theme of ['prairie', 'bois', 'neige']) for (const k of HERBE_PIECES) {
    const pc = herbeImg(theme, k); if (pc) putImg(`h_${theme}_${k}`, onGround(HERBE_GROUND[theme], pc));
  }
  // transitions des sols à 16 px : une pièce par combinaison de coins (le terrain du bas est transparent)
  for (const j of SOL16_JEUX) for (let m = 1; m < 16; m++) { const im = SOL32[`s16_${j}_${m}`]; if (im) putImg(`w_${j}_${m}`, up2(im)); }
  for (const k of ['hautes_herbes0', 'hautes_herbes1']) if (SOL32['s16_' + k]) putImg(k, up2(SOL32['s16_' + k]));
  // arènes à énigmes : glace, sable glissant, flèches, souffles, courants, dalles, téléporteurs, socles et barrières
  putImg('gl_ice', SOL32.ice ? up2(SOL32.ice) : (() => { const P = new Pix(CELL, CELL, 41); P.fill('#cfeaf8'); P.speck(10, '#ffffff'); P.speck(6, '#a8d4ec'); for (let i = 0; i < 3; i++) { const x = P.ri(12), y = P.ri(12); P.rect(x, y, 4, 1, '#ffffff'); } return up2(P.c); })());
  putImg('gl_sable', SOL32.sand0 ? up2(SOL32.sand0) : (() => { const P = new Pix(CELL, CELL, 43); dirtCell(P, PAL.sand, 2); return up2(P.c); })());
  for (const [g, c1, c2] of [['r', '#e04848', '#ff9a8a'], ['b', '#3a6ae0', '#9ab8ff']]) {
    putImg('dec_dalle_' + g, decal16((P) => { P.rect(3, 3, 10, 10, '#2c2c34'); P.rect(4, 4, 8, 8, c1); P.rect(5, 5, 6, 2, c2); P.rect(4, 11, 8, 1, shade(c1, -0.35)); }));
    putImg('dec_socle_' + g, decal16((P) => { P.rect(1, 6, 14, 5, '#3a3a44'); P.rect(2, 7, 12, 3, shade(c1, -0.45)); P.rect(2, 7, 12, 1, c1); }));
    put('barr_' + g, (P) => { P.fill(c1); for (let y = 2; y < 16; y += 5) P.rect(0, y, 16, 2, shade(c1, -0.3)); P.rect(0, 0, 16, 1, c2); P.rect(7, 0, 2, 16, shade(c1, 0.25)); });
    put('barr_' + g + '_top', (P) => { P.fill(c2); P.rect(1, 1, 14, 14, c1); });
  }
  putImg('dec_tp', decal16((P) => { P.rect(2, 2, 12, 12, '#4a3a7a'); P.rect(3, 3, 10, 10, '#8a6ae0'); P.rect(5, 5, 6, 6, '#c8b8ff'); P.rect(7, 7, 2, 2, '#ffffff'); P.p(3, 3, '#4a3a7a'); P.p(12, 3, '#4a3a7a'); P.p(3, 12, '#4a3a7a'); P.p(12, 12, '#4a3a7a'); }));
  const chevron = (P, col, dark) => { for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { P.p(3 + i, 9 - i + k * 4, col); P.p(12 - i, 9 - i + k * 4, col); P.p(3 + i, 10 - i + k * 4, dark); P.p(12 - i, 10 - i + k * 4, dark); } };
  for (const [kind, col, dark] of [['fleche', '#f6d040', '#a07a10'], ['vent', '#e8f6ff', '#8ab8d8'], ['courant', '#ffffff', '#5aa0e0']]) {
    const up = decal16((P) => chevron(P, col, dark));
    putImg(`dec_${kind}_up`, up);
    for (const [d, rot] of [['right', 1], ['down', 2], ['left', 3]]) { const c = canvas(C2, C2), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.translate(C2 / 2, C2 / 2); x.rotate(rot * Math.PI / 2); x.drawImage(up, -C2 / 2, -C2 / 2); putImg(`dec_${kind}_${d}`, c); }
  }
  // Arène de Sylvebourg (la Grande Serre) : sol, mur de verre, alvéoles, stèles, interrupteurs, estrade, tapis
  texturesSerre(putImg);
  // chaussées de Métropole : asphalte, avec la ligne pointillée du milieu sur le bord commun des deux voies
  const asph = (P) => { P.fill('#5a5c64'); P.speck(18, '#64666e'); P.speck(10, '#4e5058'); };
  put('asph', asph);
  put('asph_n', (P) => { asph(P); P.rect(2, 0, 5, 1, '#f0e8c0'); P.rect(10, 0, 5, 1, '#f0e8c0'); });
  put('asph_s', (P) => { asph(P); P.rect(2, 15, 5, 1, '#f0e8c0'); P.rect(10, 15, 5, 1, '#f0e8c0'); });
  put('asph_w', (P) => { asph(P); P.rect(0, 2, 1, 5, '#f0e8c0'); P.rect(0, 10, 1, 5, '#f0e8c0'); });
  put('asph_e', (P) => { asph(P); P.rect(15, 2, 1, 5, '#f0e8c0'); P.rect(15, 10, 1, 5, '#f0e8c0'); });
  put('asph_x', (P) => { asph(P); for (let x = 1; x < 16; x += 4) P.rect(x, 2, 2, 12, '#e8e8e8'); });   // passage piéton
  // petits détails posés sur l'herbe (touffes, trèfles, cailloux, pâquerettes, feuilles, champignons) : dessinés à 32 px
  DETAILS.forEach((k, i) => putImg('dec_' + k, detailDecal(k, i * 7919 + 13)));
  // grottes en relief (tools/odyssee-relief.py) : une rangée par biome, sols / faces de paroi / dessus des gradins
  if (ART.relief) RELIEF.biomes.forEach((b, j) => RELIEF.cols.forEach((k, i) => {
    const c = canvas(C2, C2); c.getContext('2d').drawImage(ART.relief, i * 32, j * 32, 32, 32, 0, 0, C2, C2);
    putImg(`r${k[0]}_${b}_${k.slice(1)}`, c);
  }));
  // relief du dehors (falaises, rebords, marches, roche ocre) : render/relief-tex.js
  texturesRelief(putImg, img);
  tameGreens(atlas);
  // Tour Cendrée : planches noircies par le feu, suie en haut, cendre claire par endroits
  put('wall_cendre', (P) => { P.fill('#3e3028'); for (let x = 0; x < 16; x += 4) P.rect(x, 0, 1, 16, '#271c16'); P.rect(0, 0, 16, 3, '#211814'); P.speck(10, '#2c211b', 0, 3, 16, 9); P.speck(5, '#5e5048'); P.speck(3, '#7a3a20', 0, 6, 16, 6); P.rect(0, 13, 16, 3, '#2a1f19'); P.rect(0, 13, 16, 1, '#54443a'); });
  putSol('floor_cendre', FLOOR32.cendre, (P) => floorCell(P, 'gymDragon'));
  putSol('floor_pierre', 'floor_stone', (P) => floorCell(P, 'gymRock'));
  // intérieurs des maisons assortis à leur ville (murs à la densité de l'écran, fenêtres de jour et de nuit, sols)
  texturesInterieurs(putImg, img);
  return { canvas: atlas, cells, size: SIZE };
}
/** verts du sol adoucis : l'herbe à 16 px est très saturée (vert fluo) ; on la ramène vers le vert tendre des jeux DS.
 *  Une table de couleurs (les tuiles en ont peu) évite de refaire le calcul pour chaque pixel. */
export function tameGreens(cv) {
  const x = cv.getContext('2d'), im = x.getImageData(0, 0, cv.width, cv.height), d = im.data, lut = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let o = lut.get(key);
    if (o === undefined) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      let h = 0; if (c) h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h = ((h / 6) + 1) % 1;
      const sa = mx ? c / mx : 0;
      if (h > 0.21 && h < 0.42 && sa > 0.32 && mx > 0.25) {
        const H = h + (0.31 - h) * 0.45, S = sa * 0.7, V = Math.min(1, mx * 1.04);
        const f = (n) => { const k = (n + H * 6) % 6; return V - V * S * Math.max(0, Math.min(k, 4 - k, 1)); };
        o = (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
      } else o = key;
      lut.set(key, o);
    }
    d[i] = o >> 16 & 255; d[i + 1] = o >> 8 & 255; d[i + 2] = o & 255;
  }
  x.putImageData(im, 0, 0);
}
/** décalque transparent dessiné à 16 px, agrandi ×2 */
function decal16(draw) { const P = new Pix(CELL, CELL, 7); P.x.clearRect(0, 0, CELL, CELL); draw(P); return up2(P.c); }
/** détails de l'herbe, à pleine résolution (32 px par case), fond transparent */
export const DETAILS = ['touffe', 'touffe2', 'trefle', 'cailloux', 'paquerettes', 'boutons', 'feuilles', 'champignons', 'touffe3', 'brindilles'];
function detailDecal(kind, seed) {
  // dessiné à 16 px puis agrandi ×2, comme les sols
  const c = canvas(CELL, CELL), x = c.getContext('2d'), r = rng(seed);
  const p = (px, py, col) => { if (px < 0 || py < 0 || px >= CELL || py >= CELL) return; x.fillStyle = col; x.fillRect(px | 0, py | 0, 1, 1); };
  const G = ['#2f7a2a', '#3d8f2c', '#56a83a', '#78c050', '#9fd870'];
  const tuft = (cx, cy, n = 3) => {
    // brins en éventail : pied sombre, pointe claire
    for (let k = 0; k < n; k++) {
      const dx = (k - (n - 1) / 2) * 1.6, len = 3 + Math.floor(r() * 3);
      for (let j = 0; j < len; j++) p(cx + dx * (j / len) * 1.4, cy - j, G[Math.min(4, Math.floor(j * 4 / len))]);
    }
    p(cx - 1, cy + 1, G[0]); p(cx, cy + 1, G[0]); p(cx + 1, cy + 1, G[0]);
  };
  const spots = (n, f) => { for (let i = 0; i < n; i++) f(2 + Math.floor(r() * 12), 4 + Math.floor(r() * 10)); };
  if (kind === 'touffe') spots(1, (a, b) => tuft(a, b, 3));
  else if (kind === 'touffe2') spots(2, (a, b) => tuft(a, b, 2));
  else if (kind === 'touffe3') spots(1, (a, b) => { tuft(a, b, 4); tuft(a + 3, b + 2, 3); });
  else if (kind === 'trefle') spots(1, (a, b) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) { p(a + dx * 2, b + dy * 2, G[3]); p(a + dx * 2 + 1, b + dy * 2, G[2]); p(a + dx * 2, b + dy * 2 + 1, G[2]); p(a + dx * 2 + 1, b + dy * 2 + 1, G[1]); } p(a, b + 2, G[0]); });
  else if (kind === 'cailloux') spots(2, (a, b) => { const w = 2 + Math.floor(r() * 2); for (let i = 0; i < w; i++) { p(a + i, b, '#c8c4b8'); p(a + i, b + 1, '#9c978a'); } p(a, b - 1, '#e4e0d6'); p(a + w, b + 1, '#3d8f2c'); p(a - 1, b + 1, '#3d8f2c'); });
  else if (kind === 'paquerettes') spots(3, (a, b) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) p(a + dx, b + dy, '#ffffff'); p(a, b, '#f4d040'); p(a, b + 2, G[1]); });
  else if (kind === 'boutons') spots(3, (a, b) => { const col = ['#f6d24a', '#f08aa0', '#9cc8ff'][Math.floor(r() * 3)]; p(a, b, col); p(a + 1, b, col); p(a, b - 1, col); p(a, b + 1, G[1]); p(a, b + 2, G[0]); });
  else if (kind === 'feuilles') spots(3, (a, b) => { const col = ['#c88a3a', '#b8642c', '#d8a848'][Math.floor(r() * 3)]; p(a, b, col); p(a + 1, b, col); p(a + 1, b - 1, col); p(a, b + 1, '#7a4a20'); });
  else if (kind === 'champignons') spots(1, (a, b) => { p(a - 1, b - 1, '#d84a3a'); p(a, b - 1, '#e86050'); p(a + 1, b - 1, '#d84a3a'); p(a, b - 2, '#f08070'); p(a, b - 1, '#ffffff'); p(a, b, '#f0e6d0'); p(a, b + 1, '#3d8f2c'); });
  else if (kind === 'brindilles') spots(1, (a, b) => { for (let i = 0; i < 5; i++) p(a + i, b - (i >> 1), i % 2 ? '#8a6a40' : '#6e5230'); p(a + 2, b + 1, '#5a4228'); });
  return up2(c);
}
export const RELIEF = { biomes: ['terre', 'montagne', 'mer', 'magma', 'glace', 'lune'], cols: ['s0', 's1', 's2', 's3', 'w0', 'w1', 'w2', 't0', 't1', 'r0', 'p00', 'p01', 'p02', 'p10', 'p11', 'p12', 'p20', 'p21', 'p22', 'f0', 'f1', 'f2', 'f3', 'n0', 'n1', 'n2', 'n3', 'l0', 'e0', 'l1', 'e1', 'l2', 'e2', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5'] };
export const HERBE_PIECES = ['a', 'b', 'c', 't', 'tl', 'tr', 'l', 'r', 'bot', 'bl', 'br', 'in_nw', 'in_ne', 'in_sw', 'in_se'];

/* ---------------- atlas animé (eau, fleurs) ---------------- */
/** rivage dessiné (32 px) : sable et écume sur les côtés de l'eau sans voisin d'eau */
function shore32(water, mask, frame) {
  const c = canvas(C2, C2), x = c.getContext('2d'); x.drawImage(water, 0, 0);
  const sand = SOL32.sand0, foam = frame % 2 ? '#eef6ff' : '#d4e8ff';
  const side = (bit, rect) => {
    if (mask & bit) return;
    const [sx, sy, sw, sh, fx, fy, fw, fh] = rect;
    if (sand) x.drawImage(sand, sx, sy, sw, sh, sx, sy, sw, sh); else { x.fillStyle = PAL.sand[0]; x.fillRect(sx, sy, sw, sh); }
    x.fillStyle = foam; x.fillRect(fx, fy, fw, fh);
  };
  side(1, [0, 0, 32, 4, 0, 4, 32, 2]); side(4, [0, 28, 32, 4, 0, 26, 32, 2]);
  side(8, [0, 0, 4, 32, 4, 0, 2, 32]); side(2, [28, 0, 4, 32, 26, 0, 2, 32]);
  return c;
}
/** image n° f d'une bande d'animation HGSS (carrés de côté h), agrandie à 32 px */
function hgFrame(k, f) {
  const im = HG[k]; if (!im) return null;
  const h = im.height, n = Math.round(im.width / h), c = canvas(C2, C2), x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.drawImage(im, (f % n) * h, 0, h, h, 0, 0, C2, C2);
  return c;
}
/** eau de HeartGold / SoulSilver : la mer animée, et sur les côtés sans voisin d'eau, le rivage (sable, écume qui
 *  monte et redescend) tiré de l'animation de plage du jeu, tourné vers la terre */
function hgWater(mask, f) {
  const sea = hgFrame('mer', f); if (!sea) return null;
  const c = canvas(C2, C2), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(sea, 0, 0);
  const R = HG.rivage;
  if (R) {
    // bord droit de la plage du jeu : la moitié basse (sable en haut, vagues, eau) d'une image de 32 px
    const h = R.height, n = Math.round(R.width / h), sx = (f % n) * h;
    const piece = canvas(C2, C2), px = piece.getContext('2d'); px.imageSmoothingEnabled = false;
    px.drawImage(R, sx, h / 2, h / 2, h / 2, 0, 0, C2, C2);
    for (const [bit, rot] of [[1, 0], [2, 1], [4, 2], [8, 3]]) {
      if (mask & bit) continue;
      x.save(); x.translate(C2 / 2, C2 / 2); x.rotate(rot * Math.PI / 2); x.translate(-C2 / 2, -C2 / 2);
      x.beginPath(); x.rect(0, 0, C2, C2 / 2); x.clip(); x.drawImage(piece, 0, 0); x.restore();
    }
  }
  return c;
}
/** massif de fleurs de HGSS : l'herbe, et par-dessus deux fleurs qui se balancent */
function hgFlower(k, f, grass) {
  const fl = hgFrame(k, f >> 1); if (!fl) return null;
  const c = canvas(C2, C2), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  if (grass) x.drawImage(grass, 0, 0, grass.width, grass.height, 0, 0, C2, C2);
  x.drawImage(fl, 0, 0);
  return c;
}
export function buildAnimAtlas() {
  const SIZE = 512, cols = Math.floor(SIZE / P2), FR = 8;
  const frames = [];
  const cells = {};
  const keys = [];
  const W = [0, 1, 2, 3].map((f) => SOL32['water' + f]);
  const E16 = [0, 1, 2, 3].map((f) => SOL32['s16_eau' + f]);
  for (let m = 0; m < 16; m++) keys.push(['water' + m, (P, f) => waterCell(P, m, f), E16[0] ? ((f) => up2(E16[(f >> 1) % 4])) : HG.mer ? ((f) => hgWater(m, f)) : W[0] && ((f) => shore32(up2(W[f % 4] || W[0]), m, f))]);
  const FL = [SOL32.flowerR, SOL32.flowerW, SOL32.flowerR, SOL32.flowerW], HGF = ['fleur_r', 'fleur_y', 'fleur_b', 'fleur_p'];
  const F16 = ['fleur_r', 'fleur_y', 'fleur_w', 'fleur_p'].map((k) => SOL32['s16_' + k]);
  // massifs de fleurs : les fleurs dessinées de HeartGold / SoulSilver (32 px, qui se balancent) posées sur l'herbe du jeu ;
  // à défaut, les petites fleurs à 16 px ou celles du tileset
  for (let k = 0; k < 4; k++) keys.push(['flower' + k, (P, f) => flowerCell(P, f >> 1, k % 3), HG[HGF[k]] ? ((f) => hgFlower(HGF[k], f, SOL32.grass0)) : F16[k] ? ((f) => { const c = up2(F16[k]); if ((f >> 2) & 1) { const x = c.getContext('2d'), t = canvas(C2, C2); t.getContext('2d').drawImage(c, 0, 0); x.clearRect(0, 0, C2, C2); x.drawImage(t, 0, 0, C2, C2, 0, -1, C2, C2); x.drawImage(t, 0, C2 - 1, C2, 1, 0, C2 - 1, C2, 1); } return c; }) : FL[k] && (() => up2(FL[k]))]);
  for (const [k, hk] of [[4, 'fleur_o'], [5, 'fleur_w']]) if (HG[hk]) keys.push(['flower' + k, (P, f) => flowerCell(P, f >> 1, k % 3), (f) => hgFlower(hk, f, SOL32.grass0)]);
  keys.push(['lava', (P, f) => { P.fill('#e85a20'); for (let i = 0; i < 6; i++) { const x = (i * 5 + f * 3) % 16, y = (i * 7 + f) % 16; P.rect(x, y, 3, 1, '#ffb040'); P.p(x + 1, y + 1, '#ffe080'); } P.speck(5, '#b83a10'); }, SOL32.lava0 && ((f) => up2(SOL32['lava' + ((f >> 2) & 1)] || SOL32.lava0))]);
  keys.push(['deep', (P, f) => { const w = PAL.water; P.fill(w[4]); for (let k = 0; k < 3; k++) { const y = (k * 5 + 2) % 16, x0 = (k * 6 + f * 2) % 16; for (let i = 0; i < 3; i++) P.p((x0 + i) % 16, y, w[1]); } }, SOL32.deep0 && ((f) => up2(SOL32['deep' + ((f >> 2) & 1)] || SOL32.deep0))]);
  // tourbillons : grands (2 × 2 cases, deux sens de rotation), remous entre eux, carpes koï (render/relief-tex.js)
  const tbCache = new Map(), tb = (v, f) => { const k = v * 8 + f; if (!tbCache.has(k)) tbCache.set(k, tourbillon(f, v)); return tbCache.get(k); };
  for (let v = 0; v < 2; v++) for (let q = 0; q < 4; q++) keys.push([`tourbillon${v}_${q}`, null, (f) => quart(tb(v, f), q)]);
  for (let v = 0; v < 3; v++) keys.push([`remous${v}`, null, (f) => remous(f, v)]);
  keys.push(['koi', null, (f) => koi(f)]);   // tourbillons de la mer (render/relief-tex.js)
  for (let f = 0; f < FR; f++) {
    const c = canvas(SIZE, SIZE), ctx = c.getContext('2d');
    keys.forEach(([key, draw, drawImg], i) => {
      let t = drawImg ? drawImg(f) : null;
      if (!t) { const P = new Pix(CELL, CELL, i * 131 + 5); draw(P, f % 4); t = up2(P.c); }
      const cx = (i % cols) * P2, cy = Math.floor(i / cols) * P2;
      blit(ctx, t, cx, cy);
      if (f === 0) cells[key] = [(cx + 1) / SIZE, (cy + 1) / SIZE, (cx + 1 + C2) / SIZE, (cy + 1 + C2) / SIZE];
    });
    frames.push(c);
  }
  for (const fr of frames) tameGreens(fr);
  const live = canvas(SIZE, SIZE); live.getContext('2d').drawImage(frames[0], 0, 0);
  return { canvas: live, frames, cells, size: SIZE };
}

/* ---------------- sprites (arbres, herbes, décor) ---------------- */
function treeSprite(P, pal, ox, oy, kind) {
  const [b, d, l, dd, hl] = pal;
  const W = 32, H = 40;
  // tronc
  P.rect(ox + 13, oy + 30, 6, 8, '#8a5a30'); P.rect(ox + 13, oy + 30, 2, 8, '#6a4220'); P.rect(ox + 17, oy + 30, 1, 8, '#a87040');
  P.rect(ox + 12, oy + 37, 8, 2, '#5a3a1c');
  // feuillage : union de disques
  const blobs = kind === 'pine'
    ? null
    : [[16, 13, 11], [9, 19, 8], [23, 19, 8], [16, 23, 9], [16, 8, 7]];
  const inside = (x, y) => {
    if (kind === 'pine') {
      // trois étages triangulaires
      for (const [cy, hw, top] of [[30, 13, 18], [22, 10, 9], [14, 7, 1]]) { const t = (y - top) / (cy - top); if (t >= 0 && t <= 1 && Math.abs(x - 16) <= hw * t + 1) return true; }
      return false;
    }
    return blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  };
  for (let y = 0; y < 32; y++) for (let x = 0; x < W; x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
    let col;
    if (edge) col = dd;
    else {
      // lumière en haut à gauche, ombre en bas
      const k = (y / 32) * 0.9 + (x / 32) * 0.3 + (P.r() - 0.5) * 0.18;
      col = k < 0.32 ? l : k < 0.7 ? b : d;
      // petites boucles de feuilles
      if ((x * 7 + y * 13) % 11 === 0 && k < 0.8) col = hl;
      if ((x * 5 + y * 3) % 17 === 0 && k > 0.4) col = dd;
    }
    P.p(ox + x, oy + y, col);
  }
}
function tuftSprite(P, pal, ox, oy, frame = 0) {
  const [b, d, l, dd, hl] = pal;
  // deux rangées de brins en « V » serrés, sombres à la base et clairs à la pointe
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
    const x = ox + 1 + i * 3.2 + row * 1.6, base = oy + 13 - row * 3, h = 8 + ((i + row) % 3);
    for (let y = 0; y < h; y++) {
      const lean = (frame && i % 2 ? 1 : 0) * (y > h - 4 ? 1 : 0);
      const col = y < 3 ? dd : y > h - 3 ? hl : y > h - 5 ? l : b;
      P.p(x + lean, base - y, col); if (y < h - 2) P.p(x + 1 + lean, base - y, y < 3 ? dd : d);
    }
  }
  P.rect(ox, oy + 12, 16, 2, dd);
}
export function buildSprites() {
  const SIZE = 2048; const P = new Pix(SIZE, SIZE, 4242);   // 2048 : les variantes des arbres (arbres.js) ne tenaient plus dans 1024
  P.x.clearRect(0, 0, SIZE, SIZE);
  const rects = {};
  const add = (k, x, y, w, h) => { rects[k] = { x, y, w, h, u0: x / SIZE, v0: y / SIZE, u1: (x + w) / SIZE, v1: (y + h) / SIZE }; };
  treeSprite(P, ['#46a24e', '#32843f', '#6cc65e', '#1f5a2c', '#96e07c'], 0, 0, 'round'); add('tree', 0, 0, 32, 40);
  treeSprite(P, ['#3a8f52', '#2a7442', '#58b06a', '#174a2c', '#7ccc88'], 32, 0, 'round'); add('tree2', 32, 0, 32, 40);
  treeSprite(P, ['#2f8a5a', '#226e46', '#4aa874', '#124a30', '#70c894'], 64, 0, 'pine'); add('pine', 64, 0, 32, 40);
  treeSprite(P, ['#c8d8e8', '#a8bccc', '#eef4fb', '#6a7c90', '#ffffff'], 96, 0, 'pine'); add('snowpine', 96, 0, 32, 40);
  treeSprite(P, ['#9a7a5a', '#7a5c40', '#b89874', '#4a3624', '#c8a884'], 128, 0, 'round'); add('deadtree', 128, 0, 32, 40);
  // touffes d'herbe haute (2 frames) et herbe sombre
  tuftSprite(P, PAL.tall, 0, 48, 0); add('tuft', 0, 48, 16, 14);
  tuftSprite(P, PAL.tall, 16, 48, 1); add('tuft1', 16, 48, 16, 14);
  tuftSprite(P, PAL.dark, 32, 48, 0); add('darktuft', 32, 48, 16, 14);
  // buisson
  (() => { const ox = 48, oy = 48; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 9; if (dx * dx / 64 + dy * dy / 49 > 1) continue; const e = dx * dx / 64 + dy * dy / 49 > 0.7; P.p(ox + x, oy + y, e ? '#1f5a2c' : y < 7 ? '#7ad06a' : y < 11 ? '#4aa452' : '#348a42'); } add('bush', ox, oy, 16, 16); })();
  // rocher
  (() => { const ox = 64, oy = 48, c = PAL.rock; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 9; const q = dx * dx / 56 + dy * dy / 42; if (q > 1) continue; P.p(ox + x, oy + y, q > 0.78 ? c[4] : dy < -2 && dx < 2 ? c[2] : dy > 2 ? c[3] : c[0]); } P.p(ox + 5, oy + 6, '#ffffff'); add('rock', ox, oy, 16, 16); })();
  // panneau en bois
  (() => { const ox = 80, oy = 48, w = PAL.wood; P.rect(ox + 7, oy + 9, 2, 7, w[4]); P.rect(ox + 1, oy + 1, 14, 9, w[3]); P.rect(ox + 2, oy + 2, 12, 7, w[0]); P.rect(ox + 2, oy + 2, 12, 1, w[2]); for (let i = 0; i < 3; i++) P.rect(ox + 4, oy + 4 + i * 2, 8 - i * 2, 1, w[4]); add('sign', ox, oy, 16, 16); })();
  // barrière
  (() => { const ox = 96, oy = 48; P.rect(ox, oy + 5, 16, 2, '#f4f0e8'); P.rect(ox, oy + 10, 16, 2, '#f4f0e8'); P.rect(ox, oy + 7, 16, 1, '#b8b0a0'); P.rect(ox, oy + 12, 16, 1, '#b8b0a0'); for (const x of [1, 12]) { P.rect(ox + x, oy + 2, 3, 13, '#ffffff'); P.rect(ox + x + 2, oy + 2, 1, 13, '#c8c0b0'); P.rect(ox + x, oy + 14, 3, 1, '#a8a090'); } add('fence', ox, oy, 16, 16); })();
  // lampadaire
  (() => { const ox = 112, oy = 32; P.rect(ox + 6, oy + 8, 3, 24, '#3a3a4a'); P.rect(ox + 7, oy + 8, 1, 24, '#5a5a6a'); P.rect(ox + 3, oy + 2, 9, 7, '#2a2a3a'); P.rect(ox + 4, oy + 3, 7, 5, '#fff2b0'); P.rect(ox + 4, oy + 3, 7, 1, '#ffffff'); P.rect(ox + 4, oy + 30, 7, 2, '#2a2a3a'); add('lamp', ox, oy, 16, 32); })();
  // Poké Ball au sol (objet)
  (() => { const ox = 128, oy = 48; for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const dx = x - 5.5, dy = y - 5.5; const q = dx * dx + dy * dy; if (q > 30) continue; let c = q > 22 ? '#202020' : dy < -0.5 ? '#e83838' : dy < 0.8 ? '#202020' : '#f4f4f4'; if (dy < -2 && dx < -1 && q < 12) c = '#ff9090'; P.p(ox + 2 + x, oy + 4 + y, c); } P.rect(ox + 6, oy + 9, 4, 3, '#202020'); P.rect(ox + 7, oy + 10, 2, 1, '#ffffff'); add('itemball', ox, oy, 16, 16); })();
  // ombre
  (() => { const ox = 144, oy = 48; for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { const dx = (x - 7.5) / 7.5, dy = (y - 3.5) / 3.5; if (dx * dx + dy * dy <= 1) P.p(ox + x, oy + y, 'rgba(20,30,20,0.35)'); } add('shadow', ox, oy, 16, 8); })();
  // bulle « ! »
  (() => { const ox = 160, oy = 48; P.rect(ox + 1, oy, 12, 14, '#202020'); P.rect(ox + 2, oy + 1, 10, 12, '#ffffff'); P.rect(ox + 6, oy + 3, 2, 6, '#e02020'); P.rect(ox + 6, oy + 10, 2, 2, '#e02020'); P.rect(ox + 5, oy + 14, 4, 2, '#202020'); P.rect(ox + 6, oy + 13, 2, 2, '#ffffff'); add('bang', ox, oy, 14, 16); })();
  // boîte aux lettres
  (() => { const ox = 176, oy = 48; P.rect(ox + 7, oy + 8, 2, 8, '#6a4a2a'); P.rect(ox + 3, oy + 2, 10, 7, '#e05050'); P.rect(ox + 3, oy + 2, 10, 2, '#ff8080'); P.rect(ox + 4, oy + 5, 6, 1, '#802020'); add('mailbox', ox, oy, 16, 16); })();
  // pot de fleurs
  (() => { const ox = 192, oy = 48; P.rect(ox + 4, oy + 10, 8, 6, '#c86a3a'); P.rect(ox + 4, oy + 10, 8, 1, '#e88a5a'); for (const [x, y, c] of [[5, 6, '#f05050'], [9, 5, '#ffd040'], [7, 3, '#f6a2d0'], [11, 8, '#ffffff']]) { P.rect(ox + x, oy + y, 3, 3, c); P.p(ox + x + 1, oy + y + 1, '#fff6a0'); } P.rect(ox + 7, oy + 7, 1, 3, '#3a8a3a'); add('pot', ox, oy, 16, 16); })();
  // plante d'intérieur haute
  (() => { const ox = 208, oy = 32; P.rect(ox + 4, oy + 24, 8, 8, '#a86a3a'); P.rect(ox + 4, oy + 24, 8, 1, '#d08a5a'); for (let i = 0; i < 9; i++) { const a = -1.2 + i * 0.3, l = 9 + (i % 3) * 3; for (let t = 0; t < l; t++) P.p(ox + 8 + Math.sin(a) * t, oy + 24 - Math.cos(a) * t * 1.4, t > l - 3 ? '#8ae07a' : i % 2 ? '#3a9a4a' : '#5ab86a'); } add('plant', ox, oy, 16, 32); })();
  // machine de soin
  (() => { const ox = 224, oy = 32; P.rect(ox, oy + 8, 32, 24, '#d8d8e0'); P.rect(ox, oy + 8, 32, 3, '#ffffff'); P.rect(ox + 2, oy + 12, 28, 10, '#9098a8'); for (let i = 0; i < 6; i++) { const x = ox + 4 + (i % 3) * 9, y = oy + 13 + Math.floor(i / 3) * 5; P.rect(x, y, 6, 4, '#e84040'); P.rect(x, y + 2, 6, 2, '#f4f4f4'); } P.rect(ox + 6, oy + 2, 20, 7, '#4a90d0'); P.rect(ox + 8, oy + 3, 16, 5, '#a8e0ff'); add('healer', ox, oy, 32, 32); })();
  // ordinateur
  (() => { const ox = 256, oy = 32; P.rect(ox + 1, oy + 4, 14, 26, '#c8ccd8'); P.rect(ox + 1, oy + 4, 14, 2, '#eef0f6'); P.rect(ox + 3, oy + 7, 10, 8, '#304060'); P.rect(ox + 4, oy + 8, 8, 6, '#58c0f0'); P.p(ox + 5, oy + 9, '#ffffff'); P.rect(ox + 3, oy + 18, 10, 2, '#9098a8'); P.rect(ox + 3, oy + 22, 10, 6, '#a0a8b8'); add('pc', ox, oy, 16, 32); })();
  // bibliothèque
  (() => { const ox = 272, oy = 32; P.rect(ox, oy, 16, 32, '#7a5232'); for (let y = 2; y < 30; y += 7) { P.rect(ox + 1, oy + y, 14, 6, '#4a301a'); for (let x = 2; x < 14; x += 2) P.rect(ox + x, oy + y + 1 + (x % 3 ? 0 : 1), 2, 5 - (x % 3 ? 0 : 1), ['#d04848', '#4878c8', '#e0b040', '#58a858', '#a060c0'][(x + y) % 5]); } add('books', ox, oy, 16, 32); })();
  // télé
  (() => { const ox = 288, oy = 48; P.rect(ox + 1, oy + 2, 14, 11, '#3a3a44'); P.rect(ox + 3, oy + 4, 10, 7, '#80c8f0'); P.rect(ox + 3, oy + 4, 4, 2, '#d0f0ff'); P.rect(ox + 4, oy + 13, 8, 3, '#2a2a30'); add('tv', ox, oy, 16, 16); })();
  // lit
  (() => { const ox = 304, oy = 32; P.rect(ox, oy, 16, 32, '#8a5a32'); P.rect(ox + 1, oy + 2, 14, 28, '#f8f8ff'); P.rect(ox + 2, oy + 3, 12, 6, '#ffffff'); P.rect(ox + 1, oy + 12, 14, 18, '#5a8ae0'); P.rect(ox + 1, oy + 12, 14, 2, '#8ab0f0'); add('bed', ox, oy, 16, 32); })();
  // table
  (() => { const ox = 320, oy = 48; P.rect(ox, oy + 2, 16, 9, '#c88a50'); P.rect(ox, oy + 2, 16, 2, '#e0a870'); P.rect(ox + 1, oy + 11, 2, 5, '#8a5a30'); P.rect(ox + 13, oy + 11, 2, 5, '#8a5a30'); add('table', ox, oy, 16, 16); })();
  // statue d'arène
  (() => { const ox = 336, oy = 32; P.rect(ox + 2, oy + 24, 12, 8, '#8a8a9a'); P.rect(ox + 2, oy + 24, 12, 2, '#b0b0c0'); for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 13; if (dx * dx / 36 + dy * dy / 100 > 1) continue; P.p(ox + x, oy + y, dx < -2 ? '#e8e8f0' : dx > 2 ? '#9090a8' : '#c0c0d0'); } P.rect(ox + 5, oy + 10, 6, 6, '#e8c040'); P.rect(ox + 6, oy + 11, 4, 4, '#fff080'); add('statue', ox, oy, 16, 32); })();
  // rocher de grotte et stalagmite
  (() => { const ox = 352, oy = 48, c = PAL.cave; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 9; const q = dx * dx / 56 + dy * dy / 40; if (q > 1) continue; P.p(ox + x, oy + y, q > 0.75 ? c[4] : dy < -2 ? c[2] : dy > 2 ? c[3] : c[0]); } add('caverock', ox, oy, 16, 16); })();
  (() => { const ox = 368, oy = 32, c = PAL.cave; for (let y = 0; y < 32; y++) { const hw = Math.max(1, (y / 32) * 7); for (let x = Math.round(8 - hw); x < 8 + hw; x++) P.p(ox + x, oy + y, x < 7 ? c[2] : x > 9 ? c[3] : c[0]); } add('stalag', ox, oy, 16, 32); })();
  // échelle / trou de grotte
  (() => { const ox = 384, oy = 48; P.rect(ox + 1, oy + 1, 14, 14, '#1a1410'); P.rect(ox + 2, oy + 2, 12, 12, '#2c2018'); for (let y = 3; y < 14; y += 3) P.rect(ox + 4, oy + y, 8, 1, '#a07848'); P.rect(ox + 4, oy + 2, 1, 12, '#a07848'); P.rect(ox + 11, oy + 2, 1, 12, '#a07848'); add('ladder', ox, oy, 16, 16); })();
  // petit palmier
  (() => { const ox = 400, oy = 0; P.rect(ox + 14, oy + 14, 4, 24, '#a87848'); for (let y = 14; y < 38; y += 3) P.rect(ox + 14, oy + y, 4, 1, '#7a5430'); for (let i = 0; i < 7; i++) { const a = -2.6 + i * 0.85; for (let t = 0; t < 13; t++) { const x = ox + 16 + Math.cos(a) * t, y = oy + 14 + Math.sin(a) * t * 0.6 + (t * t) / 28; P.p(x, y, t > 9 ? '#8ae07a' : '#3a9a4a'); P.p(x, y + 1, '#2a7a3a'); } } add('palm', ox, oy, 32, 40); })();
  // petit arbre à couper (Coupe) et rocher fissuré (Éclate-Roc)
  (() => { const ox = 416, oy = 48; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 8; if (dx * dx / 40 + dy * dy / 42 > 1) continue; const e = dx * dx / 40 + dy * dy / 42 > 0.72; P.p(ox + x, oy + y, e ? '#1d4a24' : y < 6 ? '#8ad86a' : y < 10 ? '#4ea84e' : '#2f7a3c'); } P.rect(ox + 7, oy + 13, 2, 3, '#7a5030'); add('cuttree', ox, oy, 16, 16); })();
  (() => { const ox = 432, oy = 48, c = PAL.rock; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 9; const q = dx * dx / 56 + dy * dy / 44; if (q > 1) continue; P.p(ox + x, oy + y, q > 0.78 ? c[4] : dy < -2 && dx < 2 ? c[2] : dy > 2 ? c[3] : c[0]); } for (const [x, y] of [[7, 3], [8, 4], [7, 5], [8, 6], [9, 7], [8, 8], [6, 7], [5, 8], [10, 8], [11, 9]]) P.p(ox + x, oy + y, '#3a3a3a'); add('crackrock', ox, oy, 16, 16); })();
  // sillage autour du joueur qui surfe
  (() => { const ox = 448, oy = 48; for (let y = 0; y < 10; y++) for (let x = 0; x < 24; x++) { const dx = (x - 11.5) / 11.5, dy = (y - 4.5) / 4.5, q = dx * dx + dy * dy; if (q > 1) continue; P.p(ox + x, oy + y, q > 0.62 ? '#ffffff' : q > 0.4 ? '#bfe4ff' : '#3a86d8'); } add('wake', ox, oy, 24, 10); })();
  // Arène de Sylvebourg : bloc de pollen, bordure du bassin, fleur géante, massif, soufflerie, lianes, pupitre (32 px par case)
  spritesSerre(P.x, (k, x, y, w, h, d) => { add(k, x, y, w, h); rects[k].d = d; });
  return { canvas: P.c, rects, size: SIZE };
}
/** pose les images dessinées (nature, mobilier) dans l'atlas des sprites, à la place des dessins du code */
/** dens : densité de chaque image (2 = dessin « version 2 », deux fois plus fin que les tuiles du décor) */
export function applySpriteImages(S, images, dens = {}) {
  const ctx = S.canvas.getContext('2d');
  let x = 0, y = 96, rowH = 0;
  for (const [k, img] of Object.entries(images)) {
    if (!img) continue;
    const w = img.width, h = img.height;
    if (x + w > S.size) { x = 0; y += rowH + 2; rowH = 0; }
    if (y + h > S.size) { console.warn('planche des sprites pleine :', k); break; }
    ctx.clearRect(x, y, w, h); ctx.drawImage(img, x, y);
    // case vide sur la planche (découpe ratée) : on garde le dessin procédural
    const px = ctx.getImageData(x, y, w, h).data; let any = false; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { any = true; break; }
    if (!any) { ctx.clearRect(x, y, w, h); continue; }
    S.rects[k] = { x, y, w, h, d: dens[k] || 1, u0: x / S.size, v0: y / S.size, u1: (x + w) / S.size, v1: (y + h) / S.size };
    x += w + 2; rowH = Math.max(rowH, h);
  }
}

/* ---------------- images dessinées (planches préparées par tools/odyssee-sprites.py) ---------------- */
// kits de façade (4 × 4 tuiles de 16 px) par style, et sols d'intérieur ; chargés au démarrage, sinon dessin du code
const KITS = {}, SOLS = {}, SOL32 = {}, HG = {}, ART = {};
export function setArt({ kits = {}, sols = {}, sol32 = {}, hgss = {}, relief = null } = {}) { ART.relief = relief; Object.assign(KITS, kits); Object.assign(SOLS, sols); for (const [k, v] of Object.entries(sol32)) if (v) SOL32[k] = v; for (const [k, v] of Object.entries(hgss)) if (v) HG[k] = v; 
  // sols à 16 px (PixelLab) : ils prennent la place des tuiles du tileset (agrandies ×2 comme les autres)
  const s = (k) => SOL32['s16_' + k];
  if (s('chemin_0')) {
    const alias = { grass0: 'chemin_0', grass1: 'herbe_v1', grass2: 'chemin_0', forest0: 'berge_15', forest1: 'chemin_0', path0: 'chemin_15', sand0: 'sable_15', pave0: 'pave_15',
      snow0: 'neige_0', snow1: 'herbes_neige_0', ash0: 'cendre_0', ash1: 'cendre_0', ledge: 'rebord', bridgeNS: 'pont_ns', bridgeEW: 'pont_eo', stairs: 'escalier',
      cliffR: 'falaise', cave0: 'grotte', cave1: 'grotte', lava0: 'lave', deep0: 'profond' };
    for (const [k, v] of Object.entries(alias)) if (s(v)) SOL32[k] = s(v);
    SOL32.lava1 = null; SOL32.deep1 = null; SOL16 = true;
  }
}
/** les sols à 16 px sont-ils là (pièces de transition posées sur la grille décalée) ? */
export let SOL16 = false;
const KIT_OF = { house: 'maison', house2: 'maison', house3: 'maison', bighouse: 'maison', tower: 'maison', gate: 'maison', center: 'centre', mart: 'boutique', gym: 'arene', lab: 'labo', league: 'ligue', chalet: 'chalet', pecheur: 'pecheur', port: 'port', musee: 'musee', base: 'base', mirage: 'mirage', phare: 'phare', pagode: 'pagode' };
// Les bâtiments sont assemblés à partir d'un kit de 4 × 4 cellules (docs/ODYSSEE-GRAPHISME.md) : le rôle de chaque
// cellule (mur, fenêtre, porte, toit, rebord…) est donné par REGLES.kits ; le jeu place porte, fenêtres, linteau,
// enseigne, lampe et jardinières, et compose le toit (faîte en haut, rebord en bas).
const kitT = (kit) => Math.round(kit.width / 4);
const HOUSE_STYLES = new Set(['house', 'house2', 'house3', 'bighouse', 'tower', 'gate', 'chalet', 'pecheur']);
const SHOP_STYLES = new Set(['center', 'mart']);
function kitOf(style) { const name = KIT_OF[style]; const kit = name && KITS[name]; return kit ? { kit, name, T: kitT(kit) } : null; }
/** dessine la cellule d'un rôle ; false si le kit ne l'a pas */
function put(ctx, K, role, x, y, flip = false) {
  const c = kitCell(K.name, role); if (!c) return false;
  const T = K.T;
  if (flip) { ctx.save(); ctx.translate(x, y + T); ctx.scale(1, -1); ctx.drawImage(K.kit, c[0] * T, c[1] * T, T, T, 0, 0, T, T); ctx.restore(); }
  else ctx.drawImage(K.kit, c[0] * T, c[1] * T, T, T, x, y, T, T);
  return true;
}
const has = (K, role) => !!kitCell(K.name, role);
/** la cellule est-elle un objet détouré (lampe, jardinière, plaque) et non un morceau de mur plein ? */
const objCache = new Map();
function isObject(K, role) {
  const c = kitCell(K.name, role); if (!c) return false;
  const key = K.name + ':' + c; if (objCache.has(key)) return objCache.get(key);
  const cv = canvas(K.T, K.T), x = cv.getContext('2d'); x.drawImage(K.kit, c[0] * K.T, c[1] * K.T, K.T, K.T, 0, 0, K.T, K.T);
  const d = x.getImageData(0, 0, K.T, K.T).data; let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (!d[i]) clear++;
  const r = clear > K.T * K.T * 0.15; objCache.set(key, r); return r;
}
const variant = (K, k) => (REGLES.kits.variantes[K.name] || {})[k];
/** colonnes des fenêtres : symétriques, ni sur la porte ni sur les bords (sauf façade étroite) */
function windowCols(w, door) {
  const out = new Set();
  for (let i = 0; i < w; i++) if (i !== door && ((i > 0 && i < w - 1) || w <= 3)) out.add(i);
  return out;
}
/** façade assemblée à partir d'un kit dessiné (null si le kit manque) */
function kitFacade(style, w, H, door, night) {
  const K = kitOf(style); if (!K) return null;
  const T = K.T, c = canvas(w * T, H * T), x = c.getContext('2d');
  const house = HOUSE_STYLES.has(style), shop = SHOP_STYLES.has(style);
  const wins = windowCols(w, door);
  const win = night ? 'fenetre_nuit' : 'fenetre';
  for (let j = 0; j < H; j++) for (let i = 0; i < w; i++) {
    const X = i * T, Y = j * T, bottom = j === H - 1;
    if (bottom) {
      if (i === door) {
        if (!house && has(K, 'embleme') && !shop) put(x, K, 'embleme', X, Y);
        else put(x, K, night ? 'porte_nuit' : 'porte', X, Y) || put(x, K, 'porte', X, Y);
      } else if (wins.has(i)) {
        if (!(has(K, 'fenetre_bas') && put(x, K, 'fenetre_bas', X, Y))) put(x, K, win, X, Y);
      } else put(x, K, 'socle', X, Y) || put(x, K, 'mur', X, Y);
    } else if (j === H - 2 && i === door && has(K, 'linteau')) put(x, K, 'linteau', X, Y);
    else if (wins.has(i) || (i === door && j < H - 2)) put(x, K, win, X, Y);
    else put(x, K, 'mur', X, Y);
  }
  // objets posés sur la façade, au pixel près
  const sign = has(K, 'enseigne_g') && has(K, 'enseigne_d');
  if (sign && !house) {
    if (variant(K, 'plaques') && isObject(K, 'enseigne_g')) {
      // deux plaques de part et d'autre de la porte
      if (door > 0) put(x, K, 'enseigne_g', (door - 1) * T, (H - 1) * T);
      if (door < w - 1) put(x, K, 'enseigne_d', (door + 1) * T, (H - 1) * T);
    } else if (H >= 2) {
      // enseigne de deux cellules centrée sur la porte, juste au-dessus
      const sx = door * T + (T >> 1) - T, sy = (H - 2) * T;
      put(x, K, 'enseigne_g', sx, sy); put(x, K, 'enseigne_d', sx + T, sy);
    }
  }
  if (house) {
    // jardinières sous les fenêtres du rez-de-chaussée, lampe à droite de la porte
    if (isObject(K, 'fleurs')) for (const i of wins) put(x, K, 'fleurs', i * T, (H - 1) * T + Math.round(T * 0.12));
    if (isObject(K, 'lampe') && door + 1 < w) put(x, K, 'lampe', (door + 1) * T - Math.round(T * 0.3), (H - 1) * T - Math.round(T * 0.35));
  } else if (!shop && isObject(K, 'lampe') && door > 0 && door < w - 1) {
    put(x, K, 'lampe', (door - 1) * T + Math.round(T * 0.3), (H - 1) * T - Math.round(T * 0.35));
    put(x, K, 'lampe', (door + 1) * T - Math.round(T * 0.3), (H - 1) * T - Math.round(T * 0.35));
  }
  return c;
}
function kitSide(style, d, H) {
  const K = kitOf(style); if (!K) return null;
  const T = K.T, c = canvas(d * T, H * T), x = c.getContext('2d');
  for (let j = 0; j < H; j++) for (let i = 0; i < d; i++) put(x, K, 'cote', i * T, j * T) || put(x, K, 'mur', i * T, j * T);
  return c;
}
/** couleur moyenne d'une cellule (pignons, liserés) */
const avgCache = new Map();
export function kitColor(style, role = 'mur', k = 0) {
  const K = kitOf(style); if (!K) return null;
  const key = K.name + role + k; if (avgCache.has(key)) return avgCache.get(key);
  const c = canvas(K.T, K.T), x = c.getContext('2d'); put(x, K, role, 0, 0);
  const d = x.getImageData(0, 0, K.T, K.T).data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const col = n ? '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('') : null;
  const out = col && k ? shade(col, k) : col; avgCache.set(key, out); return out;
}
/** toit composé : moitié haute = pan arrière, moitié basse = pan avant (faîte en haut, rebord en bas), rows rangées par pan */
function kitRoof(style, color, w, rows) {
  const K = kitOf(style); if (!K) return null;
  const T = K.T, c = canvas(w * T, 2 * rows * T), x = c.getContext('2d');
  const house = HOUSE_STYLES.has(style);
  for (let j = 0; j < rows; j++) for (let i = 0; i < w; i++) {
    // pan arrière (vu en fuite) : toit simple
    put(x, K, 'toit', i * T, j * T);
    // pan avant
    const Y = (rows + j) * T;
    const role = j === rows - 1 ? 'rebord' : j === 0 && rows > 1 ? 'faite' : 'toit';
    put(x, K, role, i * T, Y) || put(x, K, 'toit', i * T, Y);
  }
  // cheminée des maisons, sur le pan avant
  if (house && has(K, 'cheminee') && rows >= 3 && w >= 4) put(x, K, 'cheminee', (w - 2) * T, (rows + 1) * T - (T >> 2));
  // les toits gris du kit « maison » prennent la couleur voulue en gardant leurs nuances
  if (K.name === 'maison' && ROOFS[color]) recolor(x, c.width, c.height, ROOFS[color]);
  return c;
}
/** teinte un dessin gris : la luminosité de chaque pixel choisit sa place dans une rampe de 4 nuances de la couleur */
function recolor(x, W, H, [base, dark, light]) {
  const stops = [hex(dark).map((v) => v * 0.55), hex(dark), hex(base), hex(light)];
  const img = x.getImageData(0, 0, W, H), d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // pixels colorés (bois, brique de la cheminée) : gardés
    if (Math.max(r, g, b) - Math.min(r, g, b) > 28) continue;
    const t = Math.max(0, Math.min(1, ((0.3 * r + 0.59 * g + 0.11 * b) - lo) / Math.max(1, hi - lo))) * 3;
    const k = Math.min(2, Math.floor(t)), f = t - k;
    for (let q = 0; q < 3; q++) d[i + q] = Math.round(stops[k][q] * (1 - f) + stops[k + 1][q] * f);
  }
  x.putImageData(img, 0, 0);
}
/** tuile de sol dessinée (intérieurs), ou null */
export const solTile = (k) => SOLS[k] || null;

/* ---------------- façades des bâtiments ---------------- */
const ROOFS = { red: ['#d8584a', '#b23e34', '#f08070'], blue: ['#4a7ad0', '#335aa8', '#78a4f0'], green: ['#4aa060', '#337a46', '#78c88a'], brown: ['#a8724a', '#82542f', '#c8946a'], purple: ['#8a64c0', '#684898', '#aa8ce0'], teal: ['#3aa0a0', '#287878', '#68c8c8'], gray: ['#7a8090', '#5a6070', '#a0a6b4'], orange: ['#e0884a', '#b8642c', '#f8a870'], gold: ['#d8a838', '#b08020', '#f0c860'] };
export const ROOF_COLORS = Object.keys(ROOFS);

function windowAt(P, x, y, w, h, night) {
  P.rect(x - 1, y - 1, w + 2, h + 2, '#ffffff'); P.rect(x - 1, y + h, w + 2, 1, '#b8b0a0');
  P.rect(x, y, w, h, night ? '#ffe08a' : '#6aaee8');
  if (!night) { P.rect(x, y, w, 2, '#a8d8ff'); P.p(x + 1, y + 2, '#ffffff'); }
  P.rect(x + (w >> 1), y, 1, h, '#ffffff');
}
/** façade avant d'un bâtiment de w tuiles de large et H tuiles de haut (murs) */
/** gratte-ciel de Métropole : quatre allures (béton, verre bleu, brique sombre, verre fumé) ; un étage tous les 8 pixels */
const GC = [
  { mur: '#b8bcc4', bande: '#8e939c', vitre: '#6f9ccc', reflet: '#a8cdf0', nuit: '#ffe08a' },
  { mur: '#5c7a9c', bande: '#3f5874', vitre: '#89b8e6', reflet: '#c8e4ff', nuit: '#fff0b0' },
  { mur: '#8a5a4a', bande: '#64402f', vitre: '#4f6e8c', reflet: '#8ab0d0', nuit: '#ffd070' },
  { mur: '#3c4250', bande: '#2a2e38', vitre: '#4a6c8a', reflet: '#7fa6c8', nuit: '#ffe8a0' },
];
function grattecielFace(style, w, H, door, night, seed, side = false) {
  const g = GC[+style.slice(2) % GC.length], W = w * 16, Hp = H * 16, P = new Pix(W, Hp, seed * 13 + w);
  P.fill(g.mur);
  // étages : une bande, puis une rangée de fenêtres ; la nuit, certaines sont allumées
  for (let y = 0; y < Hp - 16; y += 8) {
    P.rect(0, y, W, 1, g.bande);
    for (let x = 2; x < W - 3; x += 6) {
      const on = night && P.r() < 0.55;
      P.rect(x, y + 2, 4, 4, on ? g.nuit : g.vitre); if (!on) P.p(x, y + 2, g.reflet);
    }
  }
  // rez-de-chaussée : un hall vitré (la porte au milieu, s'il y en a une)
  P.rect(0, Hp - 16, W, 16, g.bande); P.rect(1, Hp - 14, W - 2, 12, night ? '#ffe8b0' : '#9cc4e8'); for (let x = 4; x < W; x += 8) P.rect(x, Hp - 14, 1, 12, g.bande);
  if (!side && door >= 0) { const dx = door * 16; P.rect(dx + 2, Hp - 15, 12, 15, '#3a4250'); P.rect(dx + 3, Hp - 14, 10, 14, night ? '#fff0c0' : '#bfe0ff'); P.rect(dx + 8, Hp - 14, 1, 14, '#3a4250'); }
  P.rect(0, 0, W, 2, g.bande);
  return P.c;
}
export function facade(style, w, H, door, night = false, seed = 1) {
  if (style && style.startsWith('gc')) return grattecielFace(style, w, H, door, night, seed);
  const kitted = kitFacade(style, w, H, door, night); if (kitted) return kitted;
  const W = w * 16, Hp = H * 16; const P = new Pix(W, Hp, seed);
  const wallCol = { house: '#f4e8cc', house2: '#e8eef4', house3: '#f6dcc8', center: '#fbf6f0', mart: '#f6f9fc', gym: '#c8ccd8', lab: '#f0f4f4', league: '#d8d0f0', cave: '#5a4836', tower: '#e0d8c8' }[style] || '#f4e8cc';
  P.fill(wallCol);
  // planches / briques
  if (style.startsWith('house')) for (let y = 3; y < Hp; y += 4) P.rect(0, y, W, 1, shade(wallCol.length === 7 ? wallCol : '#f4e8cc', -0.08));
  if (style === 'gym' || style === 'league') for (let y = 0; y < Hp; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) { P.rect(x, y, 1, 6, shade('#c8ccd8', -0.12)); P.rect(0, y, W, 1, shade('#c8ccd8', -0.12)); }
  // soubassement
  P.rect(0, Hp - 4, W, 4, style === 'gym' ? '#8a8ea0' : '#c0a888'); P.rect(0, Hp - 4, W, 1, '#9a8468');
  const dx = door * 16;
  // bandeaux de couleur
  if (style === 'center') { P.rect(0, 2, W, 5, '#e85a60'); P.rect(0, 7, W, 1, '#b83a40'); }
  if (style === 'mart') { P.rect(0, 2, W, 5, '#4a86d8'); P.rect(0, 7, W, 1, '#2a5aa0'); }
  // fenêtres
  const winY = style === 'center' || style === 'mart' ? 12 : 7;
  for (let i = 0; i < w; i++) {
    if (i === door) continue;
    if (style === 'gym' || style === 'league') { if (i % 2 === 0) continue; }
    if (Hp - winY < 14) continue;
    windowAt(P, i * 16 + 3, winY, 10, Math.min(8, Hp - winY - 8), night);
  }
  // porte
  if (door >= 0) {
    const auto = ['center', 'mart', 'lab', 'gym', 'league'].includes(style);
    if (auto) { P.rect(dx + 1, Hp - 17, 14, 17, '#4a5a6a'); P.rect(dx + 2, Hp - 16, 12, 16, night ? '#ffe8a0' : '#8ac8f0'); P.rect(dx + 8, Hp - 16, 1, 16, '#ffffff'); P.rect(dx + 2, Hp - 16, 12, 2, '#c8e8ff'); }
    else { P.rect(dx + 2, Hp - 15, 12, 15, '#6a4224'); P.rect(dx + 3, Hp - 14, 10, 14, '#a86a3a'); P.rect(dx + 3, Hp - 14, 10, 1, '#c88a5a'); P.p(dx + 11, Hp - 7, '#ffd040'); P.rect(dx + 5, Hp - 12, 6, 4, '#7a4a28'); }
  }
  // enseignes
  if (style === 'center' || style === 'mart') {
    const sx = Math.max(2, dx - 13);
    P.rect(sx, 9, 11, 9, '#ffffff'); P.rect(sx + 1, 10, 9, 7, style === 'center' ? '#e85a60' : '#4a86d8');
    if (style === 'center') { P.rect(sx + 4, 11, 3, 5, '#ffffff'); P.rect(sx + 2, 12, 7, 3, '#ffffff'); }
    else { P.rect(sx + 2, 11, 7, 1, '#ffffff'); P.rect(sx + 2, 13, 7, 1, '#ffffff'); P.rect(sx + 2, 15, 7, 1, '#ffffff'); }
  }
  if (style === 'gym') { const cx = W >> 1; P.rect(cx - 10, 2, 20, 9, '#30344a'); P.rect(cx - 9, 3, 18, 7, '#e8c040'); P.rect(cx - 7, 5, 14, 3, '#30344a'); }
  if (style === 'lab') { P.rect(2, 3, W - 4, 3, '#5ab0b0'); }
  return P.c;
}
export function sideWall(style, d, H, seed = 2) {
  if (style && style.startsWith('gc')) return grattecielFace(style, d, H, -1, false, seed, true);
  const kitted = kitSide(style, d, H); if (kitted) return kitted;
  const P = new Pix(d * 16, H * 16, seed);
  const base = { center: '#efe6dc', mart: '#e6ecf2', gym: '#b0b4c2', league: '#c2b8e0', lab: '#e0e6e6' }[style] || '#e6d8b8';
  P.fill(base); for (let y = 3; y < H * 16; y += 4) P.rect(0, y, d * 16, 1, shade(base.length === 7 ? base : '#e6d8b8', -0.06));
  P.rect(0, H * 16 - 4, d * 16, 4, '#a89070');
  if (d >= 3 && H >= 2 && style.startsWith('house')) windowAt(P, ((d * 16) >> 1) - 4, 7, 8, 7, false);
  return P.c;
}
export function roofTex(color, w, d, seed = 3, style = null, rows = null) {
  const kitted = style && kitRoof(style, color, w, rows || Math.max(1, Math.round(d / 2))); if (kitted) return kitted;
  const [b, dk, l] = ROOFS[color] || ROOFS.red; const P = new Pix(w * 16, d * 16, seed);
  P.fill(b);
  for (let y = 0; y < d * 16; y += 4) { P.rect(0, y, w * 16, 1, dk); for (let x = (y / 4) % 2 ? 0 : 4; x < w * 16; x += 8) P.rect(x, y, 1, 4, dk); P.rect(0, y + 1, w * 16, 1, l); }
  return P.c;
}
export const roofColors = ROOFS;
