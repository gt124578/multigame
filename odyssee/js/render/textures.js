// odyssee/js/render/textures.js — pixel art procédural (tuiles 16 px, sprites, façades), dessiné au chargement.
// Tout est original : palettes et motifs inspirés de l'ambiance des jeux DS, sans reprendre de tuiles existantes.

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
export function buildAtlas() {
  const SIZE = 1024, cols = Math.floor(SIZE / PITCH);
  const atlas = canvas(SIZE, SIZE), ctx = atlas.getContext('2d');
  const cells = {}; let n = 0;
  function put(key, draw, seed = n + 7) {
    const P = new Pix(CELL, CELL, seed * 9973 + 17); draw(P);
    const cx = (n % cols) * PITCH, cy = Math.floor(n / cols) * PITCH; n++;
    // extrusion des bords pour éviter les coutures au filtrage
    ctx.drawImage(P.c, 0, 0, 16, 1, cx + 1, cy, 16, 1); ctx.drawImage(P.c, 0, 15, 16, 1, cx + 1, cy + 17, 16, 1);
    ctx.drawImage(P.c, 0, 0, 1, 16, cx, cy + 1, 1, 16); ctx.drawImage(P.c, 15, 0, 1, 16, cx + 17, cy + 1, 1, 16);
    ctx.drawImage(P.c, cx + 1 - cx - 1, 0, 1, 1, cx, cy, 1, 1);
    ctx.drawImage(P.c, cx + 1, cy + 1);
    cells[key] = [(cx + 1) / SIZE, (cy + 1) / SIZE, (cx + 17) / SIZE, (cy + 17) / SIZE];
  }
  for (let v = 0; v < 4; v++) put('grass' + v, (P) => grassCell(P, PAL.grass, 0.6 + v * 0.25));
  for (let v = 0; v < 2; v++) put('tall' + v, (P) => grassCell(P, PAL.tall, 1.6));
  for (let v = 0; v < 2; v++) put('darktall' + v, (P) => grassCell(P, PAL.dark, 1.6));
  for (let v = 0; v < 2; v++) put('forest' + v, (P) => grassCell(P, PAL.dark, 1));
  for (const [k, pal, outline] of [['path', PAL.path, '#a88a58'], ['sand', PAL.sand, '#c8b070'], ['pave', PAL.pave, '#a09888']]) {
    for (let m = 0; m < 16; m++) put(k + m, (P) => { if (k === 'pave') paveCell(P, pal); else dirtCell(P, pal, k === 'path' ? 3 : 1); grassEdges(P, m, outline); });
  }
  for (let v = 0; v < 2; v++) put('cave' + v, (P) => dirtCell(P, PAL.cave, 5));
  for (let v = 0; v < 2; v++) put('ash' + v, (P) => dirtCell(P, PAL.ash, 6));
  for (let v = 0; v < 2; v++) put('snow' + v, (P) => { P.fill(PAL.snow[0]); P.speck(8, PAL.snow[1]); P.speck(5, PAL.snow[2]); });
  put('ledge', (P) => ledgeCell(P, 's')); put('ledgeE', (P) => ledgeCell(P, 'e')); put('ledgeW', (P) => ledgeCell(P, 'w'));
  put('bridge', bridgeCell);
  put('stairs', (P) => { const c = PAL.rock; P.fill(c[0]); for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, c[2]); P.rect(0, y + 3, 16, 1, c[3]); } });
  put('cavestairs', (P) => { const c = PAL.cave; P.fill(c[0]); for (let y = 0; y < 16; y += 4) { P.rect(0, y, 16, 1, c[2]); P.rect(0, y + 3, 16, 1, c[3]); } });
  for (const st of ['wood', 'center', 'mart', 'lab', 'league', 'gymBug', 'gymRock', 'gymWater', 'gymElec', 'gymGrass', 'gymPsy', 'gymFire', 'gymDragon']) put('floor_' + st, (P) => floorCell(P, st));
  put('mat', (P) => { P.fill('#c84848'); P.rect(1, 1, 14, 14, '#e06060'); P.rect(3, 3, 10, 10, '#c84848'); P.rect(0, 15, 16, 1, '#902a2a'); });
  put('matgreen', (P) => { P.fill('#3c8c54'); P.rect(1, 1, 14, 14, '#56a86c'); P.rect(3, 3, 10, 10, '#3c8c54'); });
  put('void', (P) => P.fill('#101018'));
  // faces verticales
  put('cliff', (P) => { const c = PAL.cliff; P.fill(c[0]); for (let y = 2; y < 16; y += 5) { P.rect(0, y, 16, 1, c[3]); for (let x = 0; x < 16; x += 6) P.p((x + y) % 16, y + 1, c[2]); } P.rect(0, 0, 16, 2, PAL.grass[3]); P.p(3, 2, PAL.grass[3]); P.p(9, 2, PAL.grass[3]); P.speck(6, c[1]); });
  put('cliffplain', (P) => { const c = PAL.cliff; P.fill(c[0]); for (let y = 2; y < 16; y += 5) { P.rect(0, y, 16, 1, c[3]); for (let x = 0; x < 16; x += 6) P.p((x + y) % 16, y + 1, c[2]); } P.speck(6, c[1]); });
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
  // sols et murs d'intérieur dessinés : ils remplacent la version du code
  for (const k of ['floor_wood', 'floor_center', 'floor_mart', 'floor_lab', 'floor_league', 'floor_gymBug', 'floor_gymRock', 'floor_gymWater', 'floor_gymElec', 'floor_gymGrass', 'floor_gymPsy', 'floor_gymFire', 'floor_gymDragon', 'wall_center', 'wall_mart', 'wall_gym', 'wall_league', 'counter', 'counterfront', 'martfront']) {
    const img = SOLS[k]; if (!img || !cells[k]) continue;
    const [u0, v0] = cells[k], cx = Math.round(u0 * SIZE) - 1, cy = Math.round(v0 * SIZE) - 1;
    ctx.drawImage(img, 0, 0, 16, 1, cx + 1, cy, 16, 1); ctx.drawImage(img, 0, 15, 16, 1, cx + 1, cy + 17, 16, 1);
    ctx.drawImage(img, 0, 0, 1, 16, cx, cy + 1, 1, 16); ctx.drawImage(img, 15, 0, 1, 16, cx + 17, cy + 1, 1, 16);
    ctx.drawImage(img, cx + 1, cy + 1);
  }
  return { canvas: atlas, cells, size: SIZE };
}

/* ---------------- atlas animé (eau, fleurs) ---------------- */
export function buildAnimAtlas() {
  const SIZE = 512, cols = Math.floor(SIZE / PITCH), FR = 4;
  const frames = [];
  const cells = {}; let n = 0;
  const keys = [];
  for (let m = 0; m < 16; m++) keys.push(['water' + m, (P, f) => waterCell(P, m, f)]);
  for (let k = 0; k < 3; k++) keys.push(['flower' + k, (P, f) => flowerCell(P, f >> 1, k)]);
  keys.push(['lava', (P, f) => { P.fill('#e85a20'); for (let i = 0; i < 6; i++) { const x = (i * 5 + f * 3) % 16, y = (i * 7 + f) % 16; P.rect(x, y, 3, 1, '#ffb040'); P.p(x + 1, y + 1, '#ffe080'); } P.speck(5, '#b83a10'); }]);
  keys.push(['deep', (P, f) => { const w = PAL.water; P.fill(w[4]); for (let k = 0; k < 3; k++) { const y = (k * 5 + 2) % 16, x0 = (k * 6 + f * 2) % 16; for (let i = 0; i < 3; i++) P.p((x0 + i) % 16, y, w[1]); } }]);
  for (let f = 0; f < FR; f++) {
    const c = canvas(SIZE, SIZE), ctx = c.getContext('2d');
    keys.forEach(([key, draw], i) => {
      const P = new Pix(CELL, CELL, i * 131 + 5); draw(P, f);
      const cx = (i % cols) * PITCH, cy = Math.floor(i / cols) * PITCH;
      ctx.drawImage(P.c, 0, 0, 16, 1, cx + 1, cy, 16, 1); ctx.drawImage(P.c, 0, 15, 16, 1, cx + 1, cy + 17, 16, 1);
      ctx.drawImage(P.c, 0, 0, 1, 16, cx, cy + 1, 1, 16); ctx.drawImage(P.c, 15, 0, 1, 16, cx + 17, cy + 1, 1, 16);
      ctx.drawImage(P.c, cx + 1, cy + 1);
      if (f === 0) cells[key] = [(cx + 1) / SIZE, (cy + 1) / SIZE, (cx + 17) / SIZE, (cy + 17) / SIZE];
    });
    frames.push(c);
  }
  n = keys.length;
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
  const SIZE = 1024; const P = new Pix(SIZE, SIZE, 4242);
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
const KITS = {}, SOLS = {};
export function setArt({ kits = {}, sols = {} } = {}) { Object.assign(KITS, kits); Object.assign(SOLS, sols); }
const KIT_OF = { house: 'maison', house2: 'maison', house3: 'maison', bighouse: 'maison', tower: 'maison', gate: 'maison', center: 'centre', mart: 'boutique', gym: 'arene', lab: 'labo', league: 'ligue' };
// position des tuiles dans un kit : [colonne, ligne]
const KT = { wall: [0, 0], win: [1, 0], winN: [2, 0], base: [3, 0], door: [0, 1], doorN: [1, 1], lintel: [2, 1], side: [3, 1], roof: [0, 2], eave: [1, 2], ridge: [2, 2], chimney: [3, 2], signL: [0, 3], signR: [1, 3], flowers: [2, 3], lamp: [3, 3], winB: [0, 4], winBN: [1, 4] };
// un kit fait 4 × 4 tuiles de 16 pixels (première version) ou de 32 pixels (version 2, deux fois plus fin)
const kitT = (kit) => Math.round(kit.width / 4);
const kitTile = (ctx, kit, k, x, y) => { const [c, r] = KT[k], T = kitT(kit); ctx.drawImage(kit, c * T, r * T, T, T, x, y, T, T); };
/** façade assemblée à partir d'un kit dessiné (null si le kit manque) */
function kitFacade(style, w, H, door, night) {
  const kit = KITS[KIT_OF[style]]; if (!kit) return null;
  const T = kitT(kit), c = canvas(w * T, H * T), x = c.getContext('2d');
  const shop = ['center', 'mart', 'gym', 'league', 'lab'].includes(style);
  const signCols = shop ? (door + 1 < w ? [door, door + 1] : [door - 1, door]) : [];
  for (let j = 0; j < H; j++) for (let i = 0; i < w; i++) {
    const X = i * T, Y = j * T, bottom = j === H - 1, off = (i - door) % 2 !== 0;
    let k = 'wall';
    // kit en 5 lignes : les fenêtres du rez-de-chaussée ont leur socle, celles des étages n'en ont pas
    const tall = kit.height > kit.width;
    if (bottom) k = i === door ? (night ? 'doorN' : 'door') : off && w > 2 ? (night ? (tall ? 'winBN' : 'winN') : (tall ? 'winB' : 'win')) : 'base';
    else if (j === H - 2 && signCols.includes(i)) k = i === signCols[0] ? 'signL' : 'signR';
    else if (j === H - 2 && i === door) k = 'lintel';
    else k = (i + j) % 2 === (door + 1) % 2 ? (night ? 'winN' : 'win') : 'wall';
    kitTile(x, kit, k, X, Y);
    // lampe murale à côté de la porte des maisons
    if (bottom && !shop && i === door + 1 && w >= 4) kitTile(x, kit, 'lamp', X, Y);
  }
  return c;
}
function kitSide(style, d, H) {
  const kit = KITS[KIT_OF[style]]; if (!kit) return null;
  const T = kitT(kit), c = canvas(d * T, H * T), x = c.getContext('2d');
  for (let j = 0; j < H; j++) for (let i = 0; i < d; i++) kitTile(x, kit, 'side', i * T, j * T);
  return c;
}
function kitRoof(style, color, w, d) {
  const kit = KITS[KIT_OF[style]]; if (!kit) return null;
  const T = kitT(kit), c = canvas(w * T, d * T), x = c.getContext('2d');
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) kitTile(x, kit, j === d - 1 ? 'eave' : 'roof', i * T, j * T);
  // les toits des maisons sont gris : on les teinte de la couleur voulue
  if (KIT_OF[style] === 'maison' && ROOFS[color]) {
    x.globalCompositeOperation = 'multiply'; x.fillStyle = ROOFS[color][0]; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(40,30,30,1)'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
  }
  return c;
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
export function facade(style, w, H, door, night = false, seed = 1) {
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
  const kitted = kitSide(style, d, H); if (kitted) return kitted;
  const P = new Pix(d * 16, H * 16, seed);
  const base = { center: '#efe6dc', mart: '#e6ecf2', gym: '#b0b4c2', league: '#c2b8e0', lab: '#e0e6e6' }[style] || '#e6d8b8';
  P.fill(base); for (let y = 3; y < H * 16; y += 4) P.rect(0, y, d * 16, 1, shade(base.length === 7 ? base : '#e6d8b8', -0.06));
  P.rect(0, H * 16 - 4, d * 16, 4, '#a89070');
  if (d >= 3 && H >= 2 && style.startsWith('house')) windowAt(P, ((d * 16) >> 1) - 4, 7, 8, 7, false);
  return P.c;
}
export function roofTex(color, w, d, seed = 3, style = null) {
  const kitted = style && kitRoof(style, color, w, d); if (kitted) return kitted;
  const [b, dk, l] = ROOFS[color] || ROOFS.red; const P = new Pix(w * 16, d * 16, seed);
  P.fill(b);
  for (let y = 0; y < d * 16; y += 4) { P.rect(0, y, w * 16, 1, dk); for (let x = (y / 4) % 2 ? 0 : 4; x < w * 16; x += 8) P.rect(x, y, 1, 4, dk); P.rect(0, y + 1, w * 16, 1, l); }
  return P.c;
}
export const roofColors = ROOFS;
