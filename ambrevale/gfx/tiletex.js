// Atlas des sols (16 × 16 px par case) et sprites du décor, dessinés en pixel art.
import { makeCanvas, noise2, rng, shade } from './pixel.js';
import { GR } from '../engine/world.js';
import { drawText, textWidth } from './font.js';

const TS = 16, PAD = 1, SLOT = TS + PAD * 2, ATLAS = 1024, PER = Math.floor(ATLAS / SLOT);

const P = {
  grass: ['#3c8a40', '#58ac50', '#72c662', '#9cdc80'],
  dgrass: ['#2e7236', '#468e42', '#5aa650', '#7cc06a'],
  tall: ['#22602e', '#33803a', '#4ea248', '#78c464'],
  path: ['#a88450', '#c8a468', '#dcbc80', '#ecd49c'],
  sand: ['#d4b880', '#ead098', '#f4e0b0', '#fff2cc'],
  water: ['#2c64b8', '#3c80d8', '#5c9ef0', '#9ccaff'],
  pave: ['#8c8880', '#aaa69c', '#c4c0b4', '#dcd8cc'],
  snow: ['#a8bcd4', '#d2deea', '#e8f0f6', '#ffffff'],
  snowpath: ['#9aa6b8', '#b8c2d0', '#cad2de', '#e2e8f0'],
  cave: ['#2e2624', '#4a3e3a', '#5e504a', '#76665e'],
  ash: ['#4e4646', '#686060', '#807676', '#988e8c'],
  rocky: ['#8c7454', '#aa9068', '#c2a87e', '#d8c49a'],
  wood: ['#7a5230', '#9c6c40', '#b88452', '#d09c66'],
  dock: ['#5e4028', '#7a5432', '#94683e', '#ae8050'],
};

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function speckle(ctx, pal, seed, density = 0.12, ox = 0, oy = 0) {
  ctx.fillStyle = pal[1]; ctx.fillRect(ox, oy, TS, TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = noise2(x, y, seed);
    if (n < density * 0.5) px(ctx, ox + x, oy + y, pal[0]);
    else if (n < density) px(ctx, ox + x, oy + y, pal[2]);
    else if (n > 1 - density * 0.3) px(ctx, ox + x, oy + y, pal[3]);
  }
}

// ---- dessins des sols (dans un canvas 16×16 à l'origine) ----
function drawGrass(ctx, v, pal = P.grass) {
  ctx.fillStyle = pal[1]; ctx.fillRect(0, 0, TS, TS);
  const r = rng(91 + v * 17);
  // touffes en V façon DS
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(r() * 14) + 1, y = Math.floor(r() * 13) + 2;
    px(ctx, x, y, pal[2]); px(ctx, x + 1, y - 1, pal[3]); px(ctx, x - 1, y - 1, pal[2]); px(ctx, x, y + 1, pal[0]);
  }
  for (let k = 0; k < 6; k++) px(ctx, Math.floor(r() * 16), Math.floor(r() * 16), r() < 0.5 ? pal[2] : pal[0]);
}
function drawTallBase(ctx) {
  ctx.fillStyle = P.tall[1]; ctx.fillRect(0, 0, TS, TS);
  for (let y = 0; y < TS; y += 4) for (let x = (y / 4) % 2 * 4; x < TS; x += 8) {
    for (let k = 0; k < 4; k++) px(ctx, x + k, y + 3 - (k === 1 || k === 2 ? 1 : 0), P.tall[2]);
    px(ctx, x + 1, y, P.tall[3]); px(ctx, x + 2, y + 1, P.tall[3]); px(ctx, x, y + 3, P.tall[0]); px(ctx, x + 3, y + 3, P.tall[0]);
  }
}
function drawFlower(ctx, v, f) {
  drawGrass(ctx, v + 3);
  const cols = [['#f85858', '#ffc0c0'], ['#f8d838', '#fff4a0'], ['#ffffff', '#ffffff'], ['#a878f0', '#e0d0ff']];
  const spots = [[4, 4], [11, 10]];
  spots.forEach(([x, y], i) => {
    const [c, l] = cols[(v + i) % cols.length], dx = f === 1 ? (i ? -1 : 1) : 0;
    px(ctx, x + dx, y - 1, c); px(ctx, x - 1 + dx, y, c); px(ctx, x + 1 + dx, y, c); px(ctx, x + dx, y + 1, c);
    px(ctx, x + dx, y, '#f8f0a0'); px(ctx, x - 1 + dx, y - 1, l);
    px(ctx, x, y + 2, P.grass[0]); px(ctx, x, y + 3, P.grass[0]);
  });
}
function drawPave(ctx, v) {
  ctx.fillStyle = P.pave[2]; ctx.fillRect(0, 0, TS, TS);
  const off = v % 2 ? 4 : 0;
  for (let y = 0; y < TS; y += 8) {
    ctx.fillStyle = P.pave[0]; ctx.fillRect(0, y + 7, TS, 1);
    ctx.fillStyle = P.pave[3]; ctx.fillRect(0, y, TS, 1);
    const o = (y / 8) % 2 ? 8 + off : off;
    for (let x = o % 16; x < TS; x += 16) { px(ctx, x, y + 1, P.pave[3]); for (let k = 0; k < 7; k++) px(ctx, (x + 15) % 16, y + k, P.pave[1]); }
  }
  for (let k = 0; k < 6; k++) px(ctx, (k * 7 + v * 3) % 16, (k * 5 + v) % 16, P.pave[1]);
}
function drawWater(ctx, f, mask) {
  ctx.fillStyle = P.water[1]; ctx.fillRect(0, 0, TS, TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const w = Math.sin((x + f * 2) * 0.8 + y * 0.35) + Math.sin((y * 1.1 - f * 1.5) + x * 0.2);
    if (w > 1.35) px(ctx, x, y, P.water[3]); else if (w > 0.8) px(ctx, x, y, P.water[2]); else if (w < -1.5) px(ctx, x, y, P.water[0]);
  }
  // écume sur les rives (mask : bits N=1 E=2 S=4 W=8 indiquent une terre voisine)
  const foam = (x, y) => px(ctx, x, y, (x + y + f) % 3 ? '#e8f6ff' : '#b4dcff');
  for (let k = 0; k < TS; k++) {
    const wob = (k + f) % 4 === 0 ? 1 : 0;
    if (mask & 1) { for (let t = 0; t < 2 + wob; t++) foam(k, t); }
    if (mask & 4) { for (let t = 0; t < 2 + wob; t++) foam(k, TS - 1 - t); }
    if (mask & 8) { for (let t = 0; t < 2 + wob; t++) foam(t, k); }
    if (mask & 2) { for (let t = 0; t < 2 + wob; t++) foam(TS - 1 - t, k); }
  }
}
/** sol à bord adouci : le voisin (herbe) déborde sur les côtés indiqués par mask */
function drawEdged(ctx, pal, seed, mask, edgePal = P.grass) {
  speckle(ctx, pal, seed, 0.14);
  const fr = (x, y, d) => {
    // frange irrégulière de 2-3 px
    const n = noise2(x, y, seed + 3);
    return d < 2 || (d < 3 && n > 0.5);
  };
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let edge = false, lip = false;
    if (mask & 1) { if (fr(x, 0, y)) edge = true; else if (y === 2 || (y === 3 && noise2(x, 1, seed) > 0.5)) lip = true; }
    if (mask & 4) { if (fr(x, 1, TS - 1 - y)) edge = true; }
    if (mask & 8) { if (fr(0, y, x)) edge = true; }
    if (mask & 2) { if (fr(1, y, TS - 1 - x)) edge = true; }
    if (edge) px(ctx, x, y, noise2(x, y, seed + 9) > 0.75 ? edgePal[2] : edgePal[1]);
    else if (lip) px(ctx, x, y, pal[0]);
  }
}
function drawPlanks(ctx, pal, vertical = false) {
  ctx.fillStyle = pal[2]; ctx.fillRect(0, 0, TS, TS);
  for (let k = 0; k < TS; k += 4) {
    ctx.fillStyle = pal[0];
    if (vertical) ctx.fillRect(k + 3, 0, 1, TS); else ctx.fillRect(0, k + 3, TS, 1);
    ctx.fillStyle = pal[3];
    if (vertical) ctx.fillRect(k, 0, 1, TS); else ctx.fillRect(0, k, TS, 1);
    const off = (k * 5) % 16;
    px(ctx, vertical ? k + 1 : off, vertical ? off : k + 1, pal[1]);
    px(ctx, vertical ? k + 2 : (off + 9) % 16, vertical ? (off + 9) % 16 : k + 2, pal[1]);
  }
}
function drawBridge(ctx) {
  drawPlanks(ctx, P.wood, true);
}
function drawCheck(ctx, a, b) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, ((x >> 3) + (y >> 3)) % 2 ? a : b);
  ctx.fillStyle = shade(a, 0.3); ctx.fillRect(0, 0, TS, 1); ctx.fillRect(0, 8, TS, 1);
}
function drawCarpet(ctx, col) {
  ctx.fillStyle = col; ctx.fillRect(0, 0, TS, TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((x + y) % 4 === 0 && (x - y + 32) % 8 === 0) px(ctx, x, y, shade(col, 0.25));
  for (let y = 0; y < TS; y += 2) for (let x = (y % 4); x < TS; x += 4) px(ctx, x, y, shade(col, -0.12));
}

// ---------------------------------------------------------------- atlas
export class TileAtlas {
  constructor() {
    const { c, ctx } = makeCanvas(ATLAS, ATLAS);
    this.c = c; this.ctx = ctx; this.slots = new Map(); this.n = 0;
    this.tmp = makeCanvas(TS, TS);
    this.anim = []; // { key, draw(f) }
  }
  slot(key, draw) {
    if (this.slots.has(key)) return this.slots.get(key);
    const i = this.n++;
    const sx = (i % PER) * SLOT + PAD, sy = Math.floor(i / PER) * SLOT + PAD;
    const s = { i, sx, sy, u0: sx / ATLAS, v0: 1 - (sy + TS) / ATLAS, u1: (sx + TS) / ATLAS, v1: 1 - sy / ATLAS, draw };
    this.slots.set(key, s);
    this.paint(s, 0);
    return s;
  }
  paint(s, f) {
    const t = this.tmp.ctx;
    t.clearRect(0, 0, TS, TS);
    s.draw(t, f);
    const c = this.ctx;
    c.clearRect(s.sx - PAD, s.sy - PAD, SLOT, SLOT);
    // bord étiré d'un pixel pour éviter les coutures
    c.drawImage(this.tmp.c, 0, 0, TS, 1, s.sx, s.sy - 1, TS, 1);
    c.drawImage(this.tmp.c, 0, TS - 1, TS, 1, s.sx, s.sy + TS, TS, 1);
    c.drawImage(this.tmp.c, 0, 0, 1, TS, s.sx - 1, s.sy, 1, TS);
    c.drawImage(this.tmp.c, TS - 1, 0, 1, TS, s.sx + TS, s.sy, 1, TS);
    c.drawImage(this.tmp.c, s.sx - s.sx, 0, TS, TS, s.sx, s.sy, TS, TS);
  }
  animSlot(key, draw) { const s = this.slot(key, draw); if (!this.anim.includes(s)) this.anim.push(s); return s; }
  tick(f) { for (const s of this.anim) this.paint(s, f); }

  /** case de sol → emplacement d'atlas. nb(dx,dy) renvoie le sol voisin. theme : couleurs des intérieurs */
  ground(g, x, y, nb, theme = {}) {
    const v = (x * 7 + y * 13) & 3;
    const maskOf = (pred) => (pred(nb(0, -1)) ? 0 : 1) | (pred(nb(1, 0)) ? 0 : 2) | (pred(nb(0, 1)) ? 0 : 4) | (pred(nb(-1, 0)) ? 0 : 8);
    switch (g) {
      case GR.GRASS: return this.slot('grass' + v, (c) => drawGrass(c, v));
      case GR.DARKGRASS: return this.slot('dgrass' + (v & 1), (c) => drawGrass(c, v + 10, P.dgrass));
      case GR.TALL: return this.slot('tall', (c) => drawTallBase(c));
      case GR.SNOWTALL: return this.slot('snowtall', (c) => { speckle(c, P.snow, 4, 0.1); for (let k = 0; k < 8; k++) { px(c, (k * 5) % 16, (k * 7) % 16, P.snow[0]); } });
      case GR.FLOWER: return this.animSlot('flower' + v, (c, f) => drawFlower(c, v, f % 2));
      case GR.PATH: { const m = maskOf((n) => n === GR.PATH || n === GR.PAVE || n === GR.BRIDGE || n === GR.SAND || n === GR.VOID || n === GR.CAVE || n === GR.ASH || n === GR.ROCKY); return this.slot('path' + m, (c) => drawEdged(c, P.path, 5, m)); }
      case GR.SAND: { const m = maskOf((n) => n !== GR.GRASS && n !== GR.TALL && n !== GR.FLOWER && n !== GR.DARKGRASS); return this.slot('sand' + m, (c) => drawEdged(c, P.sand, 6, m)); }
      case GR.SNOWPATH: { const m = maskOf((n) => n !== GR.SNOW && n !== GR.SNOWTALL); return this.slot('spath' + m, (c) => drawEdged(c, P.snowpath, 8, m, P.snow)); }
      case GR.WATER: { const m = maskOf((n) => n === GR.WATER || n === GR.VOID || n === GR.BRIDGE || n === GR.DOCK); return this.animSlot('water' + m, (c, f) => drawWater(c, f % 8, m)); }
      case GR.PAVE: return this.slot('pave' + (v & 1), (c) => drawPave(c, v));
      case GR.SNOW: return this.slot('snow' + (v & 1), (c) => { speckle(c, P.snow, 12 + v, 0.08); px(c, 3 + v, 5, '#ffffff'); px(c, 11, 12 - v, '#ffffff'); });
      case GR.CAVE: return this.slot('cave' + (v & 1), (c) => speckle(c, P.cave, 20 + v, 0.18));
      case GR.ASH: return this.slot('ash' + (v & 1), (c) => speckle(c, P.ash, 30 + v, 0.22));
      case GR.ROCKY: return this.slot('rocky' + (v & 1), (c) => { speckle(c, P.rocky, 40 + v, 0.16); px(c, 4, 9, P.rocky[0]); px(c, 5, 9, P.rocky[0]); px(c, 4, 8, P.rocky[3]); px(c, 12, 3, P.rocky[0]); px(c, 12, 2, P.rocky[3]); });
      case GR.BRIDGE: return this.slot('bridge', (c) => drawBridge(c));
      case GR.DOCK: return this.slot('dock', (c) => drawPlanks(c, P.dock, false));
      case GR.WOOD: return this.slot('wood' + (theme.wood || ''), (c) => drawPlanks(c, theme.woodPal || P.wood, false));
      case GR.TILEF: return this.slot('tilef' + (theme.tile || ''), (c) => drawCheck(c, theme.tileA || '#e8e2d2', theme.tileB || '#d2cab8'));
      case GR.CARPET: return this.slot('carpet' + (theme.carpet || '#c84848'), (c) => drawCarpet(c, theme.carpet || '#c84848'));
      case GR.GYM: return this.slot('gym' + (theme.gymA || ''), (c) => drawCheck(c, theme.gymA || '#b8b0a0', theme.gymB || '#a09888'));
      case GR.ICEFLOOR: return this.slot('ice', (c) => { speckle(c, ['#9cc8e8', '#c4e4f8', '#dcf0ff', '#ffffff'], 50, 0.06); for (let k = 0; k < 5; k++) px(c, 2 + k * 3, 13 - k * 2, '#ffffff'); });
      case GR.VOID: return this.slot('void', (c) => { c.fillStyle = '#101018'; c.fillRect(0, 0, TS, TS); });
      default: return this.slot('grass0', (c) => drawGrass(c, 0));
    }
  }
}

// ---------------------------------------------------------------- textures de falaise
export function cliffTexture(kind = 'grass') {
  // 16 px de large × 16 px par unité de hauteur, répété verticalement
  const { c, ctx } = makeCanvas(16, 16);
  const pal = kind === 'snow' ? ['#5a6a80', '#7c8ca4', '#a0b0c4', '#c8d4e2'] : kind === 'cave' ? ['#241c1a', '#3a302c', '#4e423c', '#665850'] : ['#6a5236', '#8a6c48', '#a8885c', '#c4a678'];
  ctx.fillStyle = pal[1]; ctx.fillRect(0, 0, 16, 16);
  // strates
  for (let y = 0; y < 16; y += 4) {
    ctx.fillStyle = pal[0]; ctx.fillRect(0, y + 3, 16, 1);
    ctx.fillStyle = pal[2]; for (let x = 0; x < 16; x++) if (noise2(x, y, 3) > 0.45) px(ctx, x, y, pal[2]);
    for (let x = 0; x < 16; x += 5 + ((y / 4) % 2)) { px(ctx, (x + y) % 16, y + 1, pal[0]); px(ctx, (x + y) % 16, y + 2, pal[0]); }
    px(ctx, (y * 3) % 16, y + 1, pal[3]);
  }
  return c;
}
export function cliffLipTexture(kind = 'grass') {
  // haut de falaise : herbe qui déborde
  const { c, ctx } = makeCanvas(16, 16);
  ctx.drawImage(cliffTexture(kind), 0, 0);
  const g = kind === 'snow' ? P.snow : kind === 'rocky' ? P.rocky : P.grass;
  for (let x = 0; x < 16; x++) {
    const d = 3 + (noise2(x, 0, 7) > 0.5 ? 1 : 0) + (x % 5 === 2 ? 1 : 0);
    for (let y = 0; y < d; y++) px(ctx, x, y, y === d - 1 ? g[0] : y === 0 ? g[2] : g[1]);
  }
  return c;
}

// ---------------------------------------------------------------- sprites du décor
function leafBlob(ctx, cx, cy, r, pal, r2 = 1) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y * 1.08) / r; if (d > 1) continue;
    const l = (-x - y * 1.2) / (r * 1.5) + (1 - d) * 0.5 + (noise2(cx + x, cy + y, 5) - 0.5) * 0.35;
    px(ctx, cx + x, cy + y, d > 0.86 ? pal[0] : l > 0.55 ? pal[3] : l > 0.05 ? pal[2] : pal[1]);
  }
}
export function treeSprite(kind) {
  let W = 32, H = 40;
  if (kind === 'pine' || kind === 'snowpine') { W = 24; H = 40; }
  if (kind === 'small') { W = 16; H = 16; }
  const { c, ctx } = makeCanvas(W, H);
  if (kind === 'tree') {
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(14, 28, 5, 12); ctx.fillStyle = '#7a5232'; ctx.fillRect(15, 28, 2, 12); ctx.fillStyle = '#3e2818'; ctx.fillRect(18, 30, 1, 10);
    const pal = ['#1e5a2c', '#2e7a36', '#48a046', '#7cc862'];
    leafBlob(ctx, 10, 22, 8, pal); leafBlob(ctx, 22, 22, 8, pal); leafBlob(ctx, 16, 14, 10, pal); leafBlob(ctx, 16, 25, 7, pal);
  } else if (kind === 'deadtree') {
    ctx.fillStyle = '#4a3c3a';
    ctx.fillRect(14, 12, 4, 28); ctx.fillRect(8, 14, 7, 2); ctx.fillRect(17, 9, 7, 2); ctx.fillRect(7, 10, 2, 5); ctx.fillRect(23, 5, 2, 5); ctx.fillRect(11, 20, 4, 2);
    ctx.fillStyle = '#6a5a56'; ctx.fillRect(15, 12, 1, 28); ctx.fillRect(18, 9, 5, 1);
  } else if (kind === 'pine' || kind === 'snowpine') {
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(10, 32, 4, 8);
    const pal = kind === 'snowpine' ? ['#1e4a3a', '#2c6248', '#3e7c58', '#5a9a6c'] : ['#18482c', '#245e36', '#367a42', '#549a54'];
    for (let t = 0; t < 4; t++) {
      const y0 = 4 + t * 7, hw = 4 + t * 2.6;
      for (let y = 0; y < 10; y++) for (let x = -hw; x <= hw; x++) {
        const w = hw * (y / 10); if (Math.abs(x) > w) continue;
        const X = Math.round(12 + x), Y = y0 + y;
        px(ctx, X, Y, Math.abs(x) > w - 1 ? pal[0] : x < -w * 0.3 ? pal[3] : x < w * 0.3 ? pal[2] : pal[1]);
      }
      if (kind === 'snowpine') for (let x = -hw * 0.8; x <= hw * 0.6; x++) { const Y = y0 + 9 - Math.round(Math.abs(x) * 0.2); px(ctx, Math.round(12 + x), Y - 1, '#f0f6ff'); px(ctx, Math.round(12 + x), Y - 2, Math.abs(x) < hw * 0.5 ? '#ffffff' : '#d8e4f0'); }
    }
  } else if (kind === 'palm') {
    ctx.fillStyle = '#8a6a40';
    for (let y = 14; y < 40; y++) { const x = 15 + Math.round(Math.sin(y * 0.12) * 2); ctx.fillRect(x, y, 3, 1); if (y % 3 === 0) px(ctx, x, y, '#5e4428'); }
    const pal = ['#1e6a30', '#2e8a3c', '#4cac4a', '#7ccc64'];
    for (const [a, l] of [[-2.6, 13], [-0.5, 13], [-1.6, 11], [-3.0, 9], [0.1, 9]]) {
      for (let t = 0; t < l; t++) { const x = 16 + Math.cos(a) * t, y = 14 + Math.sin(a) * t + t * t * 0.06; px(ctx, Math.round(x), Math.round(y), pal[2]); px(ctx, Math.round(x), Math.round(y) + 1, pal[1]); if (t % 2) px(ctx, Math.round(x), Math.round(y) + 2, pal[0]); px(ctx, Math.round(x), Math.round(y) - 1, t < l / 2 ? pal[3] : pal[2]); }
    }
    ctx.fillStyle = '#6a4a28'; ctx.fillRect(14, 13, 2, 2); ctx.fillRect(18, 14, 2, 2);
  }
  return c;
}

export function propSprite(kind) {
  const sizes = { rock: [16, 16], bush: [16, 16], sign: [16, 16], fence: [16, 16], lamp: [16, 32], pot: [16, 16], statue: [16, 24], mailbox: [16, 16], boulder: [16, 16], crystal: [16, 20], barrel: [16, 16], crate: [16, 16], bench: [16, 16], stalag: [16, 24], item: [16, 16], tallgrass: [16, 8], snowtall: [16, 8] };
  const [W, H] = sizes[kind] || [16, 16];
  const { c, ctx } = makeCanvas(W, H);
  const O = '#282430';
  if (kind === 'rock' || kind === 'boulder') {
    const pal = kind === 'rock' ? ['#5a5450', '#7c7670', '#a09a92', '#c8c2b8'] : ['#4a3e38', '#6a5a50', '#8a786a', '#a89684'];
    for (let y = 3; y < 16; y++) for (let x = 1; x < 15; x++) {
      const d = Math.hypot((x - 7.5) / 7, (y - 10) / 6.2); if (d > 1) continue;
      const l = (-(x - 7.5) - (y - 10)) / 10 + (1 - d) * 0.4;
      px(ctx, x, y, d > 0.84 ? O : l > 0.5 ? pal[3] : l > 0.05 ? pal[2] : l > -0.4 ? pal[1] : pal[0]);
    }
    px(ctx, 6, 9, pal[0]); px(ctx, 7, 10, pal[0]); px(ctx, 10, 12, pal[1]);
  } else if (kind === 'bush') {
    leafBlob(ctx, 5, 9, 5, ['#1e5a2c', '#2e7a36', '#48a046', '#7cc862']); leafBlob(ctx, 10, 9, 5, ['#1e5a2c', '#2e7a36', '#48a046', '#7cc862']); leafBlob(ctx, 8, 7, 5, ['#1e5a2c', '#2e7a36', '#48a046', '#7cc862']);
  } else if (kind === 'sign') {
    ctx.fillStyle = O; ctx.fillRect(7, 9, 2, 7); ctx.fillRect(1, 2, 14, 9);
    ctx.fillStyle = '#c8945a'; ctx.fillRect(2, 3, 12, 7); ctx.fillStyle = '#e0b07a'; ctx.fillRect(2, 3, 12, 1);
    ctx.fillStyle = '#8a5a30'; ctx.fillRect(4, 5, 8, 1); ctx.fillRect(4, 7, 6, 1);
    ctx.fillStyle = '#6a4424'; ctx.fillRect(7, 11, 2, 5);
  } else if (kind === 'fence') {
    ctx.fillStyle = O; ctx.fillRect(1, 4, 3, 12); ctx.fillRect(12, 4, 3, 12); ctx.fillRect(0, 6, 16, 3); ctx.fillRect(0, 11, 16, 3);
    ctx.fillStyle = '#f4ecdc'; ctx.fillRect(2, 5, 1, 10); ctx.fillRect(13, 5, 1, 10); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 12, 16, 1);
    ctx.fillStyle = '#c8bca8'; ctx.fillRect(3, 5, 1, 10); ctx.fillRect(14, 5, 1, 10);
  } else if (kind === 'lamp') {
    ctx.fillStyle = O; ctx.fillRect(6, 8, 4, 24); ctx.fillRect(3, 1, 10, 9);
    ctx.fillStyle = '#4a5468'; ctx.fillRect(7, 9, 2, 22); ctx.fillStyle = '#fff4b0'; ctx.fillRect(4, 2, 8, 7); ctx.fillStyle = '#ffe070'; ctx.fillRect(5, 5, 6, 4);
    ctx.fillStyle = '#2a3040'; ctx.fillRect(3, 0, 10, 2); ctx.fillRect(5, 29, 6, 3);
  } else if (kind === 'pot') {
    ctx.fillStyle = O; ctx.fillRect(3, 8, 10, 8); ctx.fillStyle = '#c86a3c'; ctx.fillRect(4, 9, 8, 6); ctx.fillStyle = '#e88a5a'; ctx.fillRect(4, 9, 8, 1);
    leafBlob(ctx, 8, 6, 5, ['#1e5a2c', '#2e7a36', '#48a046', '#7cc862']); px(ctx, 6, 4, '#ff6080'); px(ctx, 10, 5, '#ffe060');
  } else if (kind === 'statue') {
    ctx.fillStyle = O; ctx.fillRect(2, 18, 12, 6); ctx.fillRect(4, 3, 8, 16);
    ctx.fillStyle = '#9c98a8'; ctx.fillRect(3, 19, 10, 4); ctx.fillRect(5, 4, 6, 14); ctx.fillStyle = '#c4c0d0'; ctx.fillRect(5, 4, 2, 14); ctx.fillRect(3, 19, 10, 1);
    ctx.fillStyle = '#6a6678'; ctx.fillRect(6, 7, 4, 1); ctx.fillRect(6, 10, 4, 1);
  } else if (kind === 'mailbox') {
    ctx.fillStyle = O; ctx.fillRect(7, 8, 2, 8); ctx.fillRect(3, 3, 10, 7);
    ctx.fillStyle = '#d04040'; ctx.fillRect(4, 4, 8, 5); ctx.fillStyle = '#f06a6a'; ctx.fillRect(4, 4, 8, 1); ctx.fillStyle = '#f0f0f0'; ctx.fillRect(6, 6, 4, 1);
  } else if (kind === 'crystal' || kind === 'stalag') {
    const pal = kind === 'crystal' ? ['#3a4ca8', '#5a78d8', '#8ab0f8', '#d8ecff'] : ['#3a302c', '#5a4c46', '#7a6a62', '#9a8a80'];
    const tips = kind === 'crystal' ? [[8, 2, 3], [4, 8, 2], [12, 7, 2]] : [[8, 1, 3], [4, 9, 2]];
    for (const [tx, ty, w] of tips) for (let y = ty; y < H; y++) { const hw = Math.min(w, (y - ty) * 0.5 + 0.5); for (let x = -hw; x <= hw; x++) px(ctx, Math.round(tx + x), y, Math.abs(x) >= hw - 0.5 ? pal[0] : x < 0 ? pal[3] : pal[1]); }
  } else if (kind === 'barrel') {
    ctx.fillStyle = O; ctx.fillRect(3, 2, 10, 14); ctx.fillStyle = '#9a6a3a'; ctx.fillRect(4, 3, 8, 12); ctx.fillStyle = '#c08a4e'; ctx.fillRect(5, 3, 2, 12);
    ctx.fillStyle = '#4a4040'; ctx.fillRect(4, 5, 8, 1); ctx.fillRect(4, 12, 8, 1);
  } else if (kind === 'crate') {
    ctx.fillStyle = O; ctx.fillRect(1, 3, 14, 13); ctx.fillStyle = '#b88a52'; ctx.fillRect(2, 4, 12, 11); ctx.fillStyle = '#8a6236';
    ctx.fillRect(2, 9, 12, 1); for (let k = 0; k < 11; k++) { px(ctx, 2 + k, 4 + k, '#8a6236'); } ctx.fillStyle = '#d8aa70'; ctx.fillRect(2, 4, 12, 1);
  } else if (kind === 'bench') {
    ctx.fillStyle = O; ctx.fillRect(1, 6, 14, 5); ctx.fillRect(2, 10, 2, 5); ctx.fillRect(12, 10, 2, 5);
    ctx.fillStyle = '#b07a44'; ctx.fillRect(2, 7, 12, 3); ctx.fillStyle = '#d09a5e'; ctx.fillRect(2, 7, 12, 1);
  } else if (kind === 'item') {
    // sphère posée au sol
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 9.5); if (d > 5.5) continue;
      px(ctx, x, y, d > 4.6 ? O : y < 9 ? (x + y < 12 ? '#ff9a9a' : '#e04848') : y === 9 ? O : '#f0f0f0');
    }
    px(ctx, 7, 9, '#ffffff'); px(ctx, 8, 9, '#ffffff'); px(ctx, 6, 7, '#ffffff');
  } else if (kind === 'tallgrass' || kind === 'snowtall') {
    const pal = kind === 'tallgrass' ? P.tall : ['#7a96b4', '#a8c0d8', '#d4e2ee', '#ffffff'];
    for (let x = 0; x < 16; x++) {
      const h = 5 + ((x * 7) % 3);
      for (let y = H - h; y < H; y++) px(ctx, x, y, y === H - h ? pal[3] : (x + y) % 4 === 0 ? pal[0] : y < H - h + 2 ? pal[2] : pal[1]);
    }
  }
  return c;
}

/** bouche de grotte posée sur une face de falaise */
export function caveMouthSprite() {
  const { c, ctx } = makeCanvas(24, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) {
    const d = Math.hypot((x - 11.5) / 11, (y - 19) / 17); if (d > 1) continue;
    px(ctx, x, y, d > 0.86 ? '#4a3a2c' : d > 0.7 ? '#20181a' : '#08060a');
  }
  return c;
}

/** ombre ronde sous les personnages et les arbres */
export function shadowSprite(w = 16, h = 8) {
  const { c, ctx } = makeCanvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)) < 1) px(ctx, x, y, 'rgba(10,20,30,0.32)');
  return c;
}

/** petite enseigne de bâtiment */
export function signboard(text, bg, fg = '#ffffff') {
  const w = textWidth(text) + 8;
  const { c, ctx } = makeCanvas(w, 13);
  ctx.fillStyle = '#28242e'; ctx.fillRect(0, 0, w, 13); ctx.fillStyle = bg; ctx.fillRect(1, 1, w - 2, 11); ctx.fillStyle = shade(bg, 0.3); ctx.fillRect(1, 1, w - 2, 1);
  drawText(ctx, text, 4, 0, fg, shade(bg, -0.4));
  return c;
}
