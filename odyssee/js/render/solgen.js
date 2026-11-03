// odyssee/js/render/solgen.js — sol en pixel art généré (32 px par case), sans tuile répétée.
//
// Chaque pixel dépend de sa position dans le monde (bruit et graines par case) : deux cases ne sont jamais pareilles, un
// bloc de carte se raccorde au pixel près à ses voisins, et retoucher une case ne change que son voisinage.
// Les bords (chemins, eau, hautes herbes) sont organiques mais ne s'écartent jamais de plus d'un quart de case de la
// limite des cases pour ce qui compte en jeu (hautes herbes, eau) : la grille reste la seule vérité du jeu.
// Vrai pixel art : palette fixe (indices), aucun anti-crénelage, lumière en haut à gauche.
//
// Sans DOM ni dépendance : tourne dans un Worker (solgen-worker.js) et dans Node (tools/pixelforge/solgen-apercu.mjs).
// Port de tools/pixelforge/terrain2.py (atelier).

import { T } from '../world/tiles.js';

export const NFRAMES = 8;      // images de l'eau animée
export const CELL = 32;        // pixels par case
export const MARGIN = 2;       // cases de contexte autour d'un bloc (raccords)
export const TRANSPARENT = 255;

// sortes de cases (calculées par le moteur à partir des codes T, voir sol.js)
export const K = { X: 0, G: 1, F: 2, T: 3, TD: 4, P: 5, V: 6, W: 7, B: 8, C: 9, L: 10, LE: 11, LW: 12, CW: 13 };

/** sorte d'une case de la carte du jeu (K.X : le jeu garde son propre sol) */
export function sorteCase(m, x, y) {
  let t = m.get(x, y);
  if (t === T.SIGN || t === T.BLOCK) t = m.underAt?.(x, y) ?? (m.outdoor ? T.GRASS : T.CAVE);
  if (!m.outdoor) {
    if (m.floor !== 'cave') return K.X;                                   // intérieurs : sols du jeu
    if (t === T.WATER) return K.W;
    if (t === T.BRIDGE) return K.B;
    if (t === T.CAVEWALL) return K.CW;                                    // sol fin sous les plateaux de roche du jeu
    return [T.CAVE, T.CAVEDOOR, T.ROCK, T.BOULDER, T.SMASH, T.BLOCK, T.SIGN].includes(t) ? K.C : K.X;
  }
  const th = m.zoneAt?.(x, y)?.theme, froid = th === 'snow' || th === 'volcanic';   // neige et cendre : sols du jeu
  switch (t) {
    case T.WATER: return K.W;
    case T.BRIDGE: return K.B;
    case T.PAVE: return K.V;
    case T.PATH: case T.DOOR: return K.P;
    case T.TALL: return froid ? K.X : K.T;
    case T.DARKTALL: return K.TD;
    case T.FLOWER: return froid ? K.X : K.F;
    case T.LEDGE: return froid ? K.X : K.L;
    case T.LEDGE_E: return froid ? K.X : K.LE;
    case T.LEDGE_W: return froid ? K.X : K.LW;
    case T.GRASS: case T.TREE: case T.PINE: case T.BUSH: case T.ROCK: case T.FENCE: case T.CUT: case T.SMASH: case T.BOULDER:
    case T.CAVEWALL:   // montagnes du dehors (plateaux de roche posés sur l'herbe)
      return froid ? K.X : K.G;
    default: return K.X;
  }
}
/** sortes des cases d'un bloc et de sa marge, prêtes pour rendreBloc */
export function zoneBloc(m, ci, cj, CH = 16) {
  const x0 = ci * CH, y0 = cj * CH, bw = m.ext ? CH : Math.min(CH, m.w - x0), bh = m.ext ? CH : Math.min(CH, m.h - y0);
  const zw = bw + 2 * MARGIN, zh = bh + 2 * MARGIN, zx0 = x0 - MARGIN, zy0 = y0 - MARGIN;
  const kinds = new Uint8Array(zw * zh);
  for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) kinds[y * zw + x] = sorteCase(m, zx0 + x, zy0 + y);
  return { kinds, zw, zh, zx0, zy0, bw, bh };
}

/* ------------------------------------------------------------------ palette ------------------------------------------ */
const HEX = {
  // herbe, du plus sombre au plus clair
  g0: '#1f5a2e', g1: '#2c7236', g2: '#3d8c3c', g3: '#52a446', g4: '#6cbb52', g5: '#8ad064', g6: '#b4e47e',
  // hautes herbes, hautes herbes sombres (sous-bois)
  h0: '#173f2a', h1: '#1f5a34', h2: '#2f7a3a', h3: '#45984a', h4: '#6abc5c',
  k0: '#0f2e20', k1: '#163f28', k2: '#205a30', k3: '#2f7a3a', k4: '#4f9c4a',
  // terre des chemins
  d0: '#6e4f33', d1: '#8c6a44', d2: '#a88655', d3: '#c2a06a', d4: '#d6b882', d5: '#e8d0a0',
  // cailloux, sable de berge
  p0: '#4e5052', p1: '#7a7c7a', p2: '#a4a6a0', p3: '#cfd0c8',
  s0: '#b09460', s1: '#d2b880', s2: '#e8d6a2',
  // eau, du fond au bord
  w0: '#1e4a9c', w1: '#2862be', w2: '#357ed6', w3: '#4c9ae6', w4: '#6cb8ee', w5: '#9ad6f4', w6: '#e6f6ff',
  wd: '#173f94', wt: '#5cc0e8',
  // fleurs
  fr: '#e24a4a', fR: '#a02c3a', fy: '#f6d84a', fw: '#f8f8f0', fW: '#c8ccd8', fb: '#7a8ef0', fB: '#4a58b8',
  // bois (pontons)
  b0: '#4a3020', b1: '#6e4a2c', b2: '#946840', b3: '#b88a58',
  // pavés de ville
  v0: '#5e5850', v1: '#847c70', v2: '#a49a8a', v3: '#beb4a2', v4: '#d6cebc', m0: '#4a6a3a', m1: '#6a8a4a',
  // rebords façon HeartGold / SoulSilver (bourrelet de roche brune)
  l0: '#3a2a22', l1: '#5e4434', l2: '#7e604c', l3: '#a08066', l4: '#c4a486', l5: '#e2c8a6',
  // flaques des grottes
  cw: '#3a5a7a', cW: '#5a86a8', cg: '#7ac0c8',
};
// sols de grotte selon le lieu (mêmes noms de biome que le relief des parois, caveBiome de world3d.js)
const CAVES = {
  terre: ['#2e2620', '#463a30', '#5e4e40', '#7a6652', '#968068', '#b49c80'],
  mer: ['#262e36', '#3a464e', '#4e5c66', '#61737e', '#7a8c96', '#98aab4'],
  montagne: ['#2c2a28', '#45413c', '#5d5850', '#787168', '#958c80', '#b3a99a'],
  magma: ['#2a1814', '#45261e', '#5e342a', '#7a463a', '#94584a', '#b0705e'],
  glace: ['#3a4a5c', '#5a6e84', '#7a92aa', '#9ab4c8', '#bcd2e0', '#dceaf2'],
};
for (const [b, cols] of Object.entries(CAVES)) cols.forEach((c, i) => (HEX[`c_${b}${i}`] = c));

export const NAMES = Object.keys(HEX);
const I = Object.fromEntries(NAMES.map((k, i) => [k, i]));
/** couleur RGBA (octets dans l'ordre de la mémoire, petit-boutiste) de chaque indice ; 255 = transparent */
export const LUT = new Uint32Array(256);
NAMES.forEach((k, i) => { const n = parseInt(HEX[k].slice(1), 16); LUT[i] = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; });
LUT[TRANSPARENT] = 0;
const ramp = (p, n) => Array.from({ length: n }, (_, i) => I[p + i]);
const G = ramp('g', 7), H = ramp('h', 5), HK = ramp('k', 5), D = ramp('d', 6), P = ramp('p', 4), S = ramp('s', 3);
const W = ramp('w', 7), B = ramp('b', 4), V = ramp('v', 5), L = ramp('l', 6);
const caveRamp = (b) => ramp(`c_${CAVES[b] ? b : 'terre'}`, 6);
const isIn = (arr) => { const s = new Uint8Array(256); for (const v of arr) s[v] = 1; return s; };
const IS_G = isIn(G.slice(2)), IS_S = isIn(S), IS_D = isIn(D);

/* ------------------------------------------------------------------ hasard lié à la position ------------------------ */
export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, -2048144777)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, sc, s) {
  const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function fbm1(x, y, scale, s, oct) {
  let o = 0, amp = 1, tot = 0;
  for (let k = 0; k < oct; k++) { o += amp * vnoise(x, y, Math.max(1.5, scale), s * 31 + k); tot += amp; amp *= 0.5; scale /= 2; }
  return o / tot;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cellRng = (cx, cy, s) => mulberry((Math.floor(hash2(cx, cy, s) * 4294967296) ^ Math.imul(s, 7919)) >>> 0);
const ri = (r, a, b) => a + Math.floor(r() * (b - a));                 // entier dans [a, b)
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function poisson(r, lam) { const lim = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > lim); return k - 1; }

/* ------------------------------------------------------------------ outils d'image ---------------------------------- */
const INF = 1e20;
function dt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** distance euclidienne de chaque pixel où mask = val au plus proche pixel où mask ≠ val (0 ailleurs) */
function edt(mask, w, h, val = 1) {
  const out = new Float32Array(w * h), n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] === val ? INF : 0;
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    dt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}
/** flou gaussien approché (trois flous en boîte), bords prolongés */
function blur(src, w, h, sigma) {
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1); let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let i = 0; i < n; i++) {
    const r = ((i < m ? wl : wl + 2) - 1) >> 1;
    boxH(a, b, w, h, r); boxV(b, a, w, h, r);
  }
  return a;
}
function boxH(s, t, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r - 1; x < r; x++) acc += s[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { acc += s[o + Math.min(w - 1, x + r)] - s[o + Math.max(0, x - r - 1)]; t[o + x] = acc * k; }
  }
}
function boxV(s, t, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r - 1; y < r; y++) acc += s[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { acc += s[Math.min(h - 1, y + r) * w + x] - s[Math.max(0, y - r - 1) * w + x]; t[y * w + x] = acc * k; }
  }
}

/* ------------------------------------------------------------------ zone de travail ---------------------------------- */
class Zone {
  /** kinds : sortes des cases de la zone (cw × ch, bloc + marge), rx0 / ry0 : première case de la zone dans le monde */
  constructor(kinds, cw, ch, rx0, ry0, seed) {
    this.k = kinds; this.cw = cw; this.ch = ch; this.rx0 = rx0; this.ry0 = ry0; this.s = seed;
    this.c = CELL; this.W = cw * CELL; this.H = ch * CELL; this.N = this.W * this.H; this.band = CELL >> 2;
  }
  X(i) { return this.rx0 * this.c + (i % this.W); }
  Y(i) { return this.ry0 * this.c + ((i / this.W) | 0); }
  kind(cx, cy) { return cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch ? K.X : this.k[cy * this.cw + cx]; }
  field(scale, s, oct = 3, mask = null) {
    // bruit lisse : pour les grandes échelles, calculé sur une grille grossière puis interpolé (même rendu, bien plus vite)
    const f = new Float32Array(this.N), W0 = this.rx0 * this.c, H0 = this.ry0 * this.c, Wd = this.W, Hh = this.H;
    const st = Math.max(1, Math.min(8, Math.floor(scale / 2 ** (oct - 1) / 2)));
    if (st === 1) {   // fin : seulement là où on en a besoin (mask)
      for (let y = 0, i = 0; y < Hh; y++) for (let x = 0; x < Wd; x++, i++) if (!mask || mask[i]) f[i] = fbm1(W0 + x, H0 + y, scale, s, oct);
      return f;
    }
    // grille alignée sur le monde (multiples de st) : deux blocs voisins tombent sur les mêmes points
    const gx0 = Math.floor(W0 / st), gy0 = Math.floor(H0 / st);
    const gw = Math.ceil((W0 + Wd) / st) - gx0 + 2, gh = Math.ceil((H0 + Hh) / st) - gy0 + 2, g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fbm1((gx0 + i) * st, (gy0 + j) * st, scale, s, oct);
    for (let y = 0, k = 0; y < Hh; y++) {
      const wy = H0 + y, fy = wy / st - gy0, j = Math.floor(fy), ty = fy - j;
      for (let x = 0; x < Wd; x++, k++) {
        const fx = (W0 + x) / st - gx0, i = Math.floor(fx), tx = fx - i, o = j * gw + i;
        const a = g[o] + (g[o + 1] - g[o]) * tx, b = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * tx;
        f[k] = a + (b - a) * ty;
      }
    }
    return f;
  }
  px(pred) {
    const m = new Uint8Array(this.N), c = this.c;
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) {
      if (!pred(this.k[cy * this.cw + cx])) continue;
      for (let y = cy * c; y < cy * c + c; y++) m.fill(1, y * this.W + cx * c, y * this.W + cx * c + c);
    }
    return m;
  }
  /** cases → région au pixel près : coins arrondis, bord bruité, jamais à plus de band de la limite des cases */
  region(pred, s, { wobble = 1, round = 0.35, band = this.band, freq = 0.4 } = {}) {
    const mp = this.px(pred);
    let any = false; for (let i = 0; i < this.N; i++) if (mp[i]) { any = true; break; }
    if (!any) return mp;
    const soft = blur(mp, this.W, this.H, this.c * round), out = new Uint8Array(this.N), c = this.c, Wd = this.W;
    const W0 = this.rx0 * c, H0 = this.ry0 * c, sc = c * freq;
    const inn = new Uint8Array(9);
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) {
      // distance exacte à la limite des cases : seules les 8 cases voisines peuvent être à moins d'une demi-case
      for (let dy = -1, q = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, q++) inn[q] = pred(this.kind(cx + dx, cy + dy)) ? 1 : 0;
      const me = inn[4];
      let mixed = false; for (let q = 0; q < 9; q++) if (inn[q] !== me) { mixed = true; break; }
      for (let ly = 0; ly < c; ly++) {
        const row = (cy * c + ly) * Wd + cx * c;
        if (!mixed) { out.fill(me, row, row + c); continue; }
        for (let lx = 0; lx < c; lx++) {
          let d2 = Infinity;
          for (let dy = -1, q = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, q++) {
            if (inn[q] === me) continue;
            const ax = dx > 0 ? c - lx : dx < 0 ? lx + 1 : 0, ay = dy > 0 ? c - ly : dy < 0 ? ly + 1 : 0, dd = ax * ax + ay * ay;
            if (dd < d2) d2 = dd;
          }
          const d = Math.sqrt(d2), sd = me ? d : -d + 1, i = row + lx;
          if (sd > band) out[i] = 1;
          else if (sd < -band) out[i] = 0;
          else {
            const n = fbm1(W0 + cx * c + lx, H0 + cy * c + ly, sc, s, 3);
            out[i] = sd / band * 0.3 + (soft[i] - 0.5) + (n - 0.5) * wobble > 0 ? 1 : 0;
          }
        }
      }
    }
    return out;
  }
}
const and = (a, b) => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] & b[i]; return o; };
const andNot = (a, b) => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] & (b[i] ^ 1); return o; };
const or = (...ms) => { const o = new Uint8Array(ms[0].length); for (const m of ms) for (let i = 0; i < o.length; i++) o[i] |= m[i]; return o; };
const anyOf = (m) => { for (let i = 0; i < m.length; i++) if (m[i]) return true; return false; };
/** masque décalé de (dy, dx) : out[y][x] = m[y - dy][x - dx] (cval hors de l'image) */
function shift(m, W, H, dy, dx, cval = 0) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sy = y - dy, sx = x - dx;
    o[y * W + x] = sy < 0 || sx < 0 || sy >= H || sx >= W ? cval : m[sy * W + sx];
  }
  return o;
}
const digitize = (v, edges) => { let k = 0; while (k < edges.length && v >= edges[k]) k++; return k; };

/* ------------------------------------------------------------------ matériaux ---------------------------------------- */
function blade(img, Z, y, x, Ln, lean, base, pal, block) {
  const top = pal.length - 1;
  for (let i = 0; i < Ln; i++) {
    const yy = y - i, xx = x + (i >= Ln - 1 - Math.floor(Ln / 3) ? lean : 0);
    if (yy < 0 || xx < 0 || yy >= Z.H || xx >= Z.W) continue;
    const j = yy * Z.W + xx; if (block && block[j]) continue;
    img[j] = i === 0 ? pal[Math.max(0, base - 1)] : i === Ln - 1 ? pal[Math.min(top, base + 1)] : pal[base];
  }
}

function herbe(Z, img, mask, block) {
  const s = Z.s, c = Z.c, Wd = Z.W;
  const light = Z.field(120, s + 1), patch = Z.field(30, s + 2), colony = Z.field(70, s + 3, 2);
  const lv = new Uint8Array(Z.N);
  for (let i = 0; i < Z.N; i++) { lv[i] = digitize(0.65 * light[i] + 0.35 * patch[i], [0.42, 0.58]) + 2; if (mask[i]) img[i] = G[lv[i] + 1]; }
  const blades = [], fl = [];
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    const r = cellRng(cx + Z.rx0, cy + Z.ry0, s + 10), n = Math.floor(c * c / 5.5);
    for (let k = 0; k < n; k++) blades.push([cy * c + ri(r, 0, c), cx * c + ri(r, 0, c), pick(r, [3, 3, 4, 4, 5]), r(), pick(r, [-1, 0, 1])]);
    const force = Z.kind(cx, cy) === K.F, nf = Math.floor(c * c / 60) * (force ? 3 : 1);
    for (let k = 0; k < nf; k++) fl.push([cy * c + ri(r, 2, c - 2), cx * c + ri(r, 2, c - 2), r(), force]);
  }
  blades.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [y, x, Ln, v, lean] of blades) {
    const i = y * Wd + x; if (!mask[i]) continue;
    const base = lv[i];
    if (v < 0.55) { blade(img, Z, y, x, Ln, -1, base, G, block); blade(img, Z, y, x + 1, Ln - 1, 1, base, G, block); }
    else blade(img, Z, y, x, Ln, lean, base, G, block);
  }
  const kinds = [['fr', 'fR', 'fy'], ['fw', 'fW', 'fy'], ['fb', 'fB', 'fw']];
  for (const [y, x, v, force] of fl) {
    if (y < 2 || y >= Z.H - 3 || x < 2 || x >= Wd - 2) continue;
    const i = y * Wd + x; if (!mask[i]) continue;
    if (colony[i] < 0.64 && !force) continue;
    const kd = kinds[Math.floor(colony[i] * 97 + v * 3) % 3], pe = I[kd[0]], sh = I[kd[1]], ce = I[kd[2]];
    img[i + Wd + 1] = G[1]; img[i + 2 * Wd] = G[2];
    img[i - Wd] = pe; img[i - 1] = pe; img[i + 1] = sh; img[i + Wd] = sh; img[i] = ce;
  }
  return lv;
}

function hautesHerbes(Z, img, mask, lv, dark) {
  const s = Z.s, c = Z.c, Wd = Z.W, Hp = dark || H;
  const sh = shift(mask, Wd, Z.H, 3, 2);
  for (let i = 0; i < Z.N; i++) if (sh[i] && !mask[i] && img[i] !== TRANSPARENT && IS_G[img[i]]) img[i] = G[Math.max(0, lv[i] - 2)];
  const dk = Z.field(16, s + 20, 2);
  for (let i = 0; i < Z.N; i++) if (mask[i]) img[i] = dk[i] < 0.45 ? Hp[0] : Hp[1];
  const d = edt(mask, Wd, Z.H, 1), bl = [];
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    const r = cellRng(cx + Z.rx0, cy + Z.ry0, s + 21), n = Math.floor(c * c / 4);
    for (let k = 0; k < n; k++) bl.push([cy * c + ri(r, 0, c), cx * c + ri(r, 0, c), ri(r, 0, 4), pick(r, [-1, 1]), r()]);
  }
  bl.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [y, x, e, lean, v] of bl) {
    if (!mask[y * Wd + x]) continue;
    const Ln = Math.floor(4 + e + Math.min(2, d[y * Wd + x] / 5));
    const tufts = v < 0.6 ? [[0, lean], [1, -lean]] : [[0, lean]];
    for (const [dx, ln] of tufts) {
      const top = Ln - 1 - (dx ? 1 : 0);
      for (let j = 0; j < Ln - (dx ? 1 : 0); j++) {
        const yy = y - j, xx = x + dx + (j > Ln * 0.55 ? ln : 0);
        if (yy < 0 || xx < 0 || yy >= Z.H || xx >= Wd) continue;
        img[yy * Wd + xx] = j === top ? Hp[4] : j < Ln * 0.35 ? Hp[1] : j < Ln * 0.75 ? Hp[2] : Hp[3];
      }
    }
  }
}

function cailloux(Z, img, mask, s, shade, density) {
  const c = Z.c, Wd = Z.W;
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    const r = cellRng(cx + Z.rx0, cy + Z.ry0, s), n = poisson(r, c * c * density);
    for (let k = 0; k < n; k++) {
      const y = cy * c + ri(r, 1, c - 4), x = cx * c + ri(r, 1, c - 4);
      const small = r() < 0.35, wv = small ? 1 : ri(r, 2, 4), hv = small ? 1 : 2;
      if (!mask[y * Wd + x]) continue;
      for (let yy = y + 1; yy <= y + hv; yy++) for (let xx = x + 1; xx <= x + wv; xx++) img[yy * Wd + xx] = shade;
      for (let yy = y; yy < y + hv; yy++) for (let xx = x; xx < x + wv; xx++) img[yy * Wd + xx] = P[1];
      for (let xx = x; xx < x + wv; xx++) img[y * Wd + xx] = P[2];
      img[y * Wd + x] = wv > 1 ? P[3] : P[2];
    }
  }
}

function chemin(Z, img, mask, block) {
  const s = Z.s, c = Z.c, Wd = Z.W;
  const din = edt(mask, Wd, Z.H, 1), n = Z.field(14, s + 30, 3, mask);
  const up = shift(mask, Wd, Z.H, 2, 1, 1);
  for (let i = 0; i < Z.N; i++) {
    if (!mask[i]) continue;
    const dl = digitize(0.55 * n[i] + 0.45 * Math.min(1, din[i] / (c * 0.5)), [0.32, 0.5, 0.66]) + 1;
    const g = hash2(Z.X(i), Z.Y(i), s + 31);
    img[i] = g < 0.04 ? D[dl - 1] : g > 0.97 ? D[Math.min(5, dl + 1)] : D[dl];
    if (din[i] <= 1.5) img[i] = D[0];
    else if (din[i] <= 3 && !up[i]) img[i] = D[1];
  }
  // brins qui débordent sur la terre
  const dout = edt(mask, Wd, Z.H, 0);
  for (let i = 0; i < Z.N; i++) {
    if (mask[i] || dout[i] > 2 || block[i]) continue;
    const X = Z.X(i), Y = Z.Y(i);
    if (hash2(X, Y, s + 32) >= 0.33) continue;
    blade(img, Z, (i / Wd) | 0, i % Wd, 2 + (hash2(X, Y, s + 33) < 0.5 ? 1 : 0), 0, 3, G, null);
  }
  const inner = new Uint8Array(Z.N); for (let i = 0; i < Z.N; i++) inner[i] = mask[i] && din[i] > 3 ? 1 : 0;
  cailloux(Z, img, inner, s + 34, D[0], 1 / 200);
}

function paves(Z, img, mask) {
  const s = Z.s, Wd = Z.W, sh = 8, sw = 11;
  const moss = Z.field(24, s + 73, 2), area = Z.field(50, s + 72, 2);
  for (let i = 0; i < Z.N; i++) {
    if (!mask[i]) continue;
    const X = Z.X(i), Y = Z.Y(i), row = Math.floor(Y / sh);
    const off = (row & 1) * (sw >> 1) + Math.floor(hash2(row, 0, s + 70) * 3);
    const col = Math.floor((X + off) / sw), stone = hash2(col, row, s + 71);
    const ly = Y - row * sh, lx = (X + off) - col * sw;
    const tone = Math.min(4, Math.max(1, 1 + Math.floor(stone * 3) + (area[i] > 0.6 ? 1 : 0)));
    let o = V[tone];
    if (ly === 0 || lx === 0) o = V[Math.min(4, tone + 1)];
    if (ly === sh - 1 || lx === sw - 1) { o = V[0]; if (moss[i] > 0.66) o = I.m0; if (ly === sh - 1 && moss[i] > 0.66 && hash2(X, Y, s + 74) < 0.3) o = I.m1; }
    else if (ly > 0 && lx > 0 && hash2(X, Y, s + 75) < 0.03) o = V[tone - 1];
    img[i] = o;
  }
  const din = edt(mask, Wd, Z.H, 1);
  for (let i = 0; i < Z.N; i++) if (mask[i] && din[i] <= 1.5) img[i] = V[0];
}

function grotte(Z, img, mask, C) {
  const s = Z.s, Wd = Z.W;
  const t1 = Z.field(50, s + 80), t2 = Z.field(12, s + 81, 3, mask), plate = Z.field(20, s + 82);
  const cr = Z.field(26, s + 84, 3, mask), crz = Z.field(60, s + 89, 2), pf = Z.field(22, s + 85, 2);
  const pud = new Uint8Array(Z.N);
  for (let i = 0; i < Z.N; i++) {
    if (!mask[i]) continue;
    const X = Z.X(i), Y = Z.Y(i);
    let o = C[digitize(0.6 * t1[i] + 0.4 * t2[i], [0.38, 0.5, 0.62]) + 1];
    const pl = plate[i] > 0.6;
    if (pl && !(i >= Wd && plate[i - Wd] > 0.6)) o = C[5];                 // plaques de roche : arête claire en haut
    else if (pl && !(i + Wd < Z.N && plate[i + Wd] > 0.6)) o = C[0];        // … sombre en bas
    const g = hash2(X, Y, s + 83);
    if (g < 0.025) o = C[0]; else if (g > 0.98) o = C[4];
    if (Math.abs(cr[i] - 0.5) < 0.008 && crz[i] > 0.55) o = C[0];           // fissures
    if (pf[i] > 0.9) pud[i] = 1;                                            // petites flaques
    img[i] = o;
  }
  if (anyOf(pud)) {
    const pd = edt(pud, Wd, Z.H, 1);
    for (let i = 0; i < Z.N; i++) {
      if (!pud[i]) continue;
      const X = Z.X(i), Y = Z.Y(i);
      img[i] = pd[i] <= 1.5 ? C[1] : pd[i] > 3 && hash2(X, Y, s + 87) < 0.006 ? I.cg : pd[i] > 2 && hash2(X, Y, s + 86) < 0.04 ? I.cW : I.cw;
    }
  }
  cailloux(Z, img, andNot(mask, pud), s + 88, C[0], 1 / 420);
  // ombre de contact au pied des plateaux de roche (silhouette arrondie comme leurs coins) : la roche se pose sur le sol
  if (Z.k.includes(K.CW)) {
    const roc = Z.region((k) => k === K.CW, s + 90, { wobble: 0, round: 0.22 }), dr = edt(roc, Wd, Z.H, 0);
    const pos = new Int8Array(256).fill(-1); C.forEach((v, i) => (pos[v] = i));
    for (let i = 0; i < Z.N; i++) {
      if (roc[i] || dr[i] > 3.2 || pos[img[i]] < 0) continue;
      img[i] = dr[i] <= 1.2 ? C[1] : C[Math.max(1, pos[img[i]] - 1)];
    }
  }
}

/** ce qui ne change pas d'une image à l'autre pour l'eau (distances, bruits, berges) */
function prepEau(Z, mask, block, rocky) {
  const Wd = Z.W, s = Z.s;
  const dw = edt(mask, Wd, Z.H, 1), sd = edt(mask, Wd, Z.H, 0);
  for (let i = 0; i < Z.N; i++) if (dw[i] > 62) dw[i] = 62;                // la marge garantit ces distances : raccords exacts
  const lapPh = Z.field(40, s + 43, 2), dn = Z.field(20, s + 40);
  const lv2 = new Int8Array(Z.N).fill(-1);
  const edges = [0.08, 0.26, 0.9, 1.6];
  for (let i = 0; i < Z.N; i++) {
    if (!mask[i]) continue;
    const depth = dw[i] / (Z.c * 1.1) + (dn[i] - 0.5) * 0.35, l = digitize(depth, edges);
    const dith = l > 0 && depth - edges[l - 1] < 0.05 && ((Z.X(i) + Z.Y(i)) & 1) === 0;
    lv2[i] = dith ? l - 1 : l;
  }
  return { mask, block, rocky, dw, sd, lapPh, lv2 };
}
function eau(Z, img, E, frame) {
  const { mask, block, rocky, dw, sd, lapPh, lv2 } = E, Wd = Z.W, Hh = Z.H, s = Z.s, c = Z.c, ph = frame / NFRAMES;
  const sp = rocky ? [rocky[1], rocky[3], rocky[4]] : S;
  const cols = [I.wt, W[4], W[3], W[2], I.wd];
  for (let i = 0; i < Z.N; i++) {
    const lap = Math.sin(2 * Math.PI * (ph + lapPh[i] * 2));                   // la vague va et vient
    if (mask[i]) {
      img[i] = cols[lv2[i]];
      const fd = 1.6 + 1.1 * (lap + 1) / 2, X = Z.X(i), Y = Z.Y(i);
      if (dw[i] <= fd && hash2(X, Y, s + 44) < 0.8) img[i] = W[6];               // écume
      else if (dw[i] <= fd + 1.2 && hash2(X, Y, s + 45) < 0.35) img[i] = W[5];
    } else if (!block[i] && sd[i] <= 5) {                                       // berge
      if (sd[i] <= 4) img[i] = sd[i] <= 1.5 + (lap > 0.3 ? 1 : 0) ? sp[0] : sd[i] <= 3 ? sp[1] : sp[2];
      else img[i] = rocky ? rocky[0] : G[1];                                    // lisière
    }
  }
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    const r = cellRng(cx + Z.rx0, cy + Z.ry0, s + 42);
    const n1 = poisson(r, c * c / 110);
    for (let k = 0; k < n1; k++) {                                             // vaguelettes
      const y = cy * c + ri(r, 0, c), x = cx * c + ri(r, 0, c), Ln = ri(r, 3, 9), p0 = r(), kind = r();
      const tau = (ph + p0) % 1, i = y * Wd + x;
      if (y >= Hh - 1 || !mask[i] || dw[i] < 4 || tau > 0.75) continue;
      const ln = Math.max(1, Math.round(Ln * Math.sin(Math.PI * tau / 0.75))), xs = x + Math.floor(tau * 4) - (ln >> 1), lv = lv2[i];
      for (let q = 0; q < ln; q++) {
        const xx = xs + q;
        if (xx >= 0 && xx < Wd && mask[y * Wd + xx]) img[y * Wd + xx] = kind < 0.15 && q === ln >> 1 ? W[6] : lv <= 2 ? W[5] : W[4];
        if (xx + 1 >= 0 && xx + 1 < Wd && lv >= 2 && mask[(y + 1) * Wd + xx + 1]) img[(y + 1) * Wd + xx + 1] = lv >= 3 ? W[1] : W[2];
      }
    }
    const n2 = poisson(r, c * c / 700);
    for (let k = 0; k < n2; k++) {                                             // reflets
      const y = cy * c + ri(r, 1, c - 1), x = cx * c + ri(r, 1, c - 1), tau = (ph + r()) % 1, i = y * Wd + x;
      if (!mask[i] || dw[i] < 6 || tau > 0.3) continue;
      img[i] = W[6];
      if (tau > 0.08 && tau < 0.22) for (const j of [i - Wd, i + Wd, i - 1, i + 1]) if (mask[j]) img[j] = W[5];
    }
    const n3 = poisson(r, c * c / 500);
    for (let k = 0; k < n3; k++) {                                             // rides sombres au large
      const y = cy * c + ri(r, 0, c), x = cx * c + ri(r, 0, c - 8), tau = (ph + r()) % 1, i = y * Wd + x;
      const m = ri(r, 3, 6);
      if (!mask[i] || lv2[i] < 3 || tau > 0.6) continue;
      const xs = x - Math.floor(tau * 3);
      for (let q = 0; q < m; q++) if (xs + q >= 0 && xs + q < Wd && mask[y * Wd + xs + q]) img[y * Wd + xs + q] = lv2[i] === 3 ? I.wd : W[0];
    }
  }
}

function ponton(Z, img, frame) {
  const c = Z.c, Wd = Z.W, ph = frame / NFRAMES, s = Z.s;
  const isB = (cx, cy) => Z.kind(cx, cy) === K.B;
  const tile = new Uint8Array(c * c);
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    if (!isB(cx, cy)) continue;
    const horiz = isB(cx - 1, cy) || isB(cx + 1, cy);
    const at = (u, v) => horiz ? (cy * c + v) * Wd + cx * c + u : (cy * c + u) * Wd + cx * c + v;   // u : le long, v : en travers
    for (let v = 0; v < c; v++) for (let u = 0; u < c; u++) tile[v * c + u] = img[at(u, v)];
    const a = c >> 3, b = c - (c >> 3), set = (u, v, col) => { if (u >= 0 && u < c && v >= 0 && v < c) tile[v * c + u] = col; };
    for (let u = 0; u < c; u++) { for (let v = b; v < Math.min(c, b + 5); v++) set(u, v, W[0]); set(u, b, B[0]); set(u, b + 1, B[0]); }
    const gx = cx + Z.rx0, gy = cy + Z.ry0;
    for (const px of [Math.floor(c / 6), c - Math.floor(c / 6) - 4]) {                          // pieux et ronds dans l'eau
      for (let v = b; v < Math.min(c, b + 6); v++) { for (let u = px; u < px + 4; u++) set(u, v, B[1]); set(px, v, B[3]); set(px + 3, v, B[0]); }
      const rr = Math.floor(1 + 3 * ((ph + hash2(gx + px, gy, s + 61)) % 1)), vv = Math.min(c - 1, b + 6);
      for (let du = -rr; du < 4 + rr; du++) if (Math.abs(du - 1.5) > rr) set(px + du, vv, W[5]);
    }
    let u = 0;
    while (u < c) {                                                                            // planches en travers
      const wv = 4 + Math.floor(hash2(u + gx * c, gy, s + 62) * 2), tone = hash2(u + gx * c, gy, s + 63) < 0.5 ? B[2] : B[3];
      for (let uu = u; uu < Math.min(c, u + wv); uu++) for (let v = a + 2; v < b - 2; v++) set(uu, v, hash2(uu + gx * c, v + gy * c, s + 64) < 0.06 ? B[1] : tone);
      for (let v = a + 2; v < b - 2; v++) set(Math.min(c - 1, u + wv - 1), v, B[0]);
      if (u + 1 < c) { set(u + 1, a + 3, P[3]); set(u + 1, b - 4, P[3]); }
      u += wv;
    }
    for (let uu = 0; uu < c; uu++) { set(uu, a, B[3]); set(uu, a + 1, B[2]); set(uu, b - 2, B[1]); set(uu, b - 1, B[0]); }
    for (let v = 0; v < c; v++) for (let uu = 0; uu < c; uu++) img[at(uu, v)] = tile[v * c + uu];
  }
}

/** rangée de rochers d'une case (longueur c, épaisseur H) façon HGSS : sommets festonnés, face sombre, coupelles aux bouts */
function bandeRochers(n, H, seed, cupA, cupB) {
  const up = 4, Ht = H + up, S_ = new Int16Array(Ht * n).fill(-1), r = mulberry(seed);
  let x = 0;
  while (x < n) {
    const w = ri(r, 5, 8), x1 = Math.min(n, x + w);
    let top = up + ri(r, 0, 3);
    if ((cupA && x < 5) || (cupB && x1 > n - 5)) top = 1;
    for (let xx = x; xx < x1; xx++) {
      const edge = xx === x || xx === x1 - 1, t0 = top + (edge ? 1 : 0), hh = Ht - t0;
      for (let yy = t0; yy < Ht; yy++) {
        const d = yy - t0, f = d / Math.max(1, hh);
        let col = d === 0 ? L[4] : d <= 2 ? (xx - x <= 1 && d === 1 ? L[5] : L[3]) : f < 0.5 ? (r() > 0.25 ? L[3] : L[2]) : f < 0.58 ? L[2] : (r() > 0.15 ? L[1] : L[2]);
        if (edge && f > 0 && f < 0.5 && xx === x1 - 1) col = L[2];
        S_[yy * n + xx] = col;
      }
      S_[Math.max(0, t0 - 1) * n + xx] = L[0];
    }
    x = x1;
  }
  for (let xx = 0; xx < n; xx++) { S_[(Ht - 1) * n + xx] = L[0]; if (S_[(Ht - 2) * n + xx] >= 0) S_[(Ht - 2) * n + xx] = L[1]; }
  for (const xx of cupA ? [0] : []) for (let y = 0; y < Ht; y++) if (S_[y * n + xx] >= 0) S_[y * n + xx] = L[0];
  for (const xx of cupB ? [n - 1] : []) for (let y = 0; y < Ht; y++) if (S_[y * n + xx] >= 0) S_[y * n + xx] = L[0];
  return { S_, Ht, n };
}
function rebords(Z, img) {
  const c = Z.c, Wd = Z.W, Hh = Z.H, s = Z.s;
  const shade = (y, x) => {
    if (y < 0 || x < 0 || y >= Hh || x >= Wd) return;
    const i = y * Wd + x, v = img[i];
    if (v === TRANSPARENT) return;
    img[i] = IS_G[v] ? G[1] : IS_S[v] ? S[0] : IS_D[v] ? D[0] : v;
  };
  const isLed = (k) => k === K.L || k === K.LE || k === K.LW;
  for (let cy = 0; cy < Z.ch; cy++) for (let cx = 0; cx < Z.cw; cx++) {
    const k = Z.kind(cx, cy); if (!isLed(k)) continue;
    const gx = cx + Z.rx0, gy = cy + Z.ry0;
    if (k === K.L) {                                                            // on saute vers le bas
      const { S_, Ht, n } = bandeRochers(c, 14, (hash2(gx, gy, s + 75) * 1e6) | 0, !isLed(Z.kind(cx - 1, cy)), !isLed(Z.kind(cx + 1, cy)));
      const y0 = cy * c + (c >> 1) - 9, x0 = cx * c;
      for (let yy = 0; yy < Ht; yy++) for (let xx = 0; xx < n; xx++) { const v = S_[yy * n + xx]; if (v >= 0) img[(y0 + yy) * Wd + x0 + xx] = v; }
      for (let x = x0 + 1; x <= x0 + c; x++) for (let dy = 0; dy < 3; dy++) shade(y0 + Ht + dy, x);
    } else {                                                                    // on saute vers l'est / l'ouest
      const side = k === K.LE ? 1 : -1;
      const { S_, Ht, n } = bandeRochers(c, 13, (hash2(gx, gy, s + 76) * 1e6) | 0, !isLed(Z.kind(cx, cy - 1)), !isLed(Z.kind(cx, cy + 1)));
      const x0 = cx * c + (c >> 1) - (Ht >> 1), y0 = cy * c;
      for (let yy = 0; yy < Ht; yy++) for (let xx = 0; xx < n; xx++) {
        const v = S_[(side < 0 ? Ht - 1 - yy : yy) * n + xx];                   // la crête regarde d'où l'on vient
        if (v >= 0) img[(y0 + xx) * Wd + x0 + yy] = v;
      }
      for (let y = y0 + 2; y < y0 + c + 2; y++) for (let dx = 1; dx <= 3; dx++) shade(y, side > 0 ? x0 + Ht - 1 + dx : x0 - dx);
    }
  }
}

/* ------------------------------------------------------------------ un bloc de carte ---------------------------------- */
/**
 * kinds : sortes des cases de la zone (bloc + MARGIN cases tout autour), zw × zh ; (zx0, zy0) : première case de la zone.
 * Rend le bloc central (bw × bh cases, à MARGIN cases du bord de la zone) : tableau d'images (Uint8Array d'indices de
 * palette, TRANSPARENT là où le jeu garde son propre sol), une seule s'il n'y a pas d'eau, NFRAMES sinon.
 */
export function rendreBloc({ kinds, zw, zh, zx0, zy0, bw, bh, seed = 7, cave = null }) {
  const Z = new Zone(kinds, zw, zh, zx0, zy0, seed), c = CELL;
  const img = new Uint8Array(Z.N).fill(TRANSPARENT);
  const has = (k) => kinds.includes(k);
  const isW = (k) => k === K.W || k === K.B;
  const water = has(K.W) || has(K.B) ? Z.region(isW, seed + 100, { wobble: 0.7, round: 0.45 }) : new Uint8Array(Z.N);
  let path = has(K.P) ? Z.region((k) => k === K.P, seed + 101, { wobble: 0.9, round: 0.55, band: c >> 1 }) : new Uint8Array(Z.N);
  const pave = has(K.V) ? Z.region((k) => k === K.V, seed + 103, { wobble: 0, round: 0.08 }) : new Uint8Array(Z.N);
  let tall = has(K.T) || has(K.TD) ? Z.region((k) => k === K.T || k === K.TD, seed + 106, { wobble: 1.6, round: 0.3, freq: 0.25 }) : new Uint8Array(Z.N);
  let caveM = new Uint8Array(Z.N);
  if (cave) caveM = andNot(Z.px((k) => k !== K.X), water);
  const hard = or(water, pave, caveM);
  path = andNot(path, hard); tall = andNot(tall, or(hard, path));
  const C = cave ? caveRamp(cave) : null;
  let lv = null;
  if (!cave) {
    const grass = new Uint8Array(Z.N); for (let i = 0; i < Z.N; i++) grass[i] = hard[i] | path[i] ? 0 : 1;
    lv = herbe(Z, img, grass, water);
    if (anyOf(tall)) {
      // les hautes herbes sombres (sous-bois) ont leur propre vert
      const tdM = Z.px((k) => k === K.TD), tlM = and(tall, Z.px((k) => k !== K.TD)), tdR = and(tall, tdM);
      if (anyOf(tlM)) hautesHerbes(Z, img, tlM, lv);
      if (anyOf(tdR)) hautesHerbes(Z, img, tdR, lv, HK);
    }
    if (anyOf(path)) chemin(Z, img, path, or(water, hard));
    if (anyOf(pave)) paves(Z, img, pave);
  } else grotte(Z, img, caveM, C);
  // transparence : cases que le jeu dessine lui-même (sable, neige, maisons, parois de grotte…)
  const keep = Z.px((k) => k !== K.X);
  for (let i = 0; i < Z.N; i++) if (!keep[i]) img[i] = TRANSPARENT;
  const animated = anyOf(water) || has(K.B);
  const E = anyOf(water) ? prepEau(Z, water, cave ? path : or(pave, path), C) : null;
  const frames = [];
  for (let f = 0; f < (animated ? NFRAMES : 1); f++) {
    const im = animated ? img.slice() : img;
    if (E) eau(Z, im, E, f);
    if (has(K.B)) ponton(Z, im, f);
    if (has(K.L) || has(K.LE) || has(K.LW)) rebords(Z, im);
    for (let i = 0; i < Z.N; i++) if (!keep[i]) im[i] = TRANSPARENT;
    // on ne garde que le bloc central
    const ox = MARGIN * c, oy = MARGIN * c, w = bw * c, h = bh * c, out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) out.set(im.subarray((oy + y) * Z.W + ox, (oy + y) * Z.W + ox + w), y * w);
    frames.push(out);
  }
  return frames;
}
