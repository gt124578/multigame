// Générateur de sprites de créatures originales, en pixel art façon DS.
// Une créature = un plan de corps + des traits ; on dessine des formes simples (ellipses, gélules, polygones)
// éclairées comme des volumes (lumière en haut à gauche), puis contours colorés, yeux et détails à plat.

import { makeCanvas, ramp, shade, hexToRgb, BAYER4 } from './pixel.js';

const LV = (() => { const v = [-0.5, -0.66, 0.56], n = Math.hypot(...v); return v.map((x) => x / n); })();

class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.mat = new Int16Array(w * h).fill(-1);
    this.part = new Int16Array(w * h).fill(-1);
    this.lum = new Float32Array(w * h);
    this.flat = new Int32Array(w * h).fill(0); // couleur à plat (yeux, détails) 0 = rien
    this.mats = []; this.partOut = []; this.nparts = 0;
    this.S = 1; this.ox = 0; this.oy = 0;
  }
  setT(s, ox, oy) { this.S = s; this.ox = ox; this.oy = oy; }
  X(x) { return x * this.S + this.ox; } Y(y) { return y * this.S + this.oy; } R(r) { return r * this.S; }
  addMat(hex, o = {}) { this.mats.push({ ramp: ramp(hex), hex, ...o }); return this.mats.length - 1; }
  newPart(out) { this.partOut.push(out); return this.nparts++; }
  put(x, y, mat, part, lum, clip) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (clip != null && !clip.includes(this.part[i])) return;
    this.mat[i] = mat; this.part[i] = part; this.lum[i] = lum; this.flat[i] = 0;
  }
  /** ellipse éclairée comme une sphère aplatie */
  ellipse(cx, cy, rx, ry, mat, o = {}) {
    cx = this.X(cx); cy = this.Y(cy); rx = Math.max(0.6, this.R(rx)); ry = Math.max(0.6, this.R(ry));
    const rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), part = o.part ?? this.newPart(o.out !== false);
    const m = Math.max(rx, ry) + 1, bulge = o.bulge ?? 1;
    for (let y = Math.floor(cy - m); y <= Math.ceil(cy + m); y++) for (let x = Math.floor(cx - m); x <= Math.ceil(cx + m); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * cs + dy * sn) / rx, v = (-dx * sn + dy * cs) / ry;
      const d2 = u * u + v * v; if (d2 > 1) continue;
      // normale dans le repère écran
      const nx = (u * cs - v * sn) * bulge, ny = (u * sn + v * cs) * bulge, nz = Math.sqrt(Math.max(0.02, 1 - d2));
      const ln = Math.hypot(nx, ny, nz);
      this.put(x, y, mat, part, Math.max(0, (nx * LV[0] + ny * LV[1] + nz * LV[2]) / ln) + (o.lift || 0), o.clip);
    }
    return part;
  }
  /** gélule (segment épais, rayon variable) */
  capsule(x1, y1, x2, y2, r1, r2, mat, o = {}) {
    x1 = this.X(x1); y1 = this.Y(y1); x2 = this.X(x2); y2 = this.Y(y2); r1 = Math.max(0.55, this.R(r1)); r2 = Math.max(0.55, this.R(r2 ?? r1));
    const part = o.part ?? this.newPart(o.out !== false);
    const m = Math.max(r1, r2) + 1;
    const minx = Math.floor(Math.min(x1, x2) - m), maxx = Math.ceil(Math.max(x1, x2) + m);
    const miny = Math.floor(Math.min(y1, y2) - m), maxy = Math.ceil(Math.max(y1, y2) + m);
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - x1, py = y + 0.5 - y1;
      const t = Math.max(0, Math.min(1, (px * vx + py * vy) / L2));
      const r = r1 + (r2 - r1) * t, dx = px - vx * t, dy = py - vy * t, d = Math.hypot(dx, dy);
      if (d > r) continue;
      const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0.02, 1 - (d * d) / (r * r)));
      this.put(x, y, mat, part, Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]) + (o.lift || 0), o.clip);
    }
    return part;
  }
  /** courbe de Bézier quadratique épaisse */
  curve(x1, y1, cx, cy, x2, y2, r1, r2, mat, o = {}) {
    const part = o.part ?? this.newPart(o.out !== false), N = 10;
    let px = x1, py = y1;
    for (let i = 1; i <= N; i++) {
      const t = i / N, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      const qx = a * x1 + b * cx + c * x2, qy = a * y1 + b * cy + c * y2;
      this.capsule(px, py, qx, qy, r1 + (r2 - r1) * ((i - 1) / N), r1 + (r2 - r1) * (i / N), mat, { ...o, part });
      px = qx; py = qy;
    }
    return part;
  }
  /** polygone à facette légèrement bombée */
  poly(pts, mat, o = {}) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)]);
    const part = o.part ?? this.newPart(o.out !== false);
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, gx = 0, gy = 0;
    for (const [x, y] of P) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); gx += x; gy += y; }
    gx /= P.length; gy /= P.length;
    const sz = Math.max(2, (maxx - minx + maxy - miny) / 2);
    for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) for (let x = Math.floor(minx); x <= Math.ceil(maxx); x++) {
      const qx = x + 0.5, qy = y + 0.5;
      let inside = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > qy) !== (yj > qy) && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      const nx = ((qx - gx) / sz) * 0.7, ny = ((qy - gy) / sz) * 0.7, nz = 0.75, ln = Math.hypot(nx, ny, nz);
      this.put(x, y, mat, part, Math.max(0, (nx * LV[0] + ny * LV[1] + nz * LV[2]) / ln) + (o.lift || 0), o.clip);
    }
    return part;
  }
  tri(a, b, c, mat, o) { return this.poly([a, b, c], mat, o); }
  /** pixel à plat (yeux, bouche) en coordonnées transformées */
  dot(x, y, col) {
    x = Math.round(this.X(x)); y = Math.round(this.Y(y));
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hexToRgb(col); this.flat[y * this.w + x] = (255 << 24) | (r << 16) | (g << 8) | b;
    if (this.mat[y * this.w + x] < 0) { this.mat[y * this.w + x] = -2; }
  }
  /** disque plat (non éclairé), pour les yeux */
  disc(cx, cy, rx, ry, col, clipToBody = false) {
    const X = this.X(cx), Y = this.Y(cy), Rx = Math.max(0.5, this.R(rx)), Ry = Math.max(0.5, this.R(ry));
    for (let y = Math.floor(Y - Ry - 1); y <= Math.ceil(Y + Ry + 1); y++) for (let x = Math.floor(X - Rx - 1); x <= Math.ceil(X + Rx + 1); x++) {
      const u = (x + 0.5 - X) / Rx, v = (y + 0.5 - Y) / Ry;
      if (u * u + v * v > 1) continue;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x; if (clipToBody && this.mat[i] < 0) continue;
      const [r, g, b] = hexToRgb(col); this.flat[i] = (255 << 24) | (r << 16) | (g << 8) | b;
      if (this.mat[i] < 0) this.mat[i] = -2;
    }
  }
  /** rendu final : tons, contours intérieurs et extérieurs */
  render(ctx, flip = false) {
    const { w, h } = this, img = ctx.createImageData(w, h), d = img.data;
    const col = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, m = this.mat[i];
      if (this.flat[i]) { const f = this.flat[i]; col[i] = [(f >> 16) & 255, (f >> 8) & 255, f & 255]; continue; }
      if (m < 0) continue;
      const M = this.mats[m];
      let tone;
      if (M.tone != null) tone = M.tone;
      else {
        const l = this.lum[i] + (BAYER4[y & 3][x & 3] - 0.5) * 0.09;
        tone = l < 0.3 ? 1 : l < 0.7 ? 2 : l < 0.92 ? 3 : 4;
        if (M.noHi && tone === 4) tone = 3;
      }
      // contour intérieur : ce pixel touche une pièce dessinée devant lui
      const p = this.part[i];
      const front = (j) => { const q = this.part[j]; return q > p && this.partOut[q] && this.mat[j] >= 0 && !this.flat[j]; };
      if (M.inner !== false && ((x > 0 && front(i - 1)) || (x < w - 1 && front(i + 1)) || (y > 0 && front(i - w)) || (y < h - 1 && front(i + w)))) tone = 0;
      col[i] = hexToRgb(M.ramp[tone]);
    }
    // contour extérieur coloré (plus sombre en bas à droite)
    const outC = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (col[i]) continue;
      let src = -1;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h || Math.abs((j % w) - x) > 1) continue;
        if (col[j]) { src = j; break; }
      }
      if (src < 0) continue;
      const m = this.mat[src];
      let base = m >= 0 ? hexToRgb(this.mats[m].ramp[0]) : col[src];
      base = base.map((v, k) => v * 0.55 + [26, 22, 38][k] * 0.45);
      outC.push([i, base]);
    }
    for (const [i, c] of outC) col[i] = c;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = col[i]; if (!c) continue;
      const o = (y * w + (flip ? w - 1 - x : x)) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
}

// --------------------------------------------------------------- traits communs
const EYE_DARK = '#20202c', EYE_W = '#ffffff';

function drawEyes(P, sp, ex1, ey, ex2, er, look = -1) {
  const st = sp.eyes || 'round', ec = sp.eyeColor || EYE_DARK;
  const one = (x, y, r) => {
    if (st === 'dot') { P.disc(x, y, r * 0.55, r * 0.7, ec); P.dot(x - r * 0.2, y - r * 0.35, EYE_W); return; }
    if (st === 'sleepy') { for (let k = -1; k <= 1; k++) P.dot(x + k * r * 0.5, y, ec); P.dot(x - r, y - 0.5, ec); return; }
    if (st === 'glow') { P.disc(x, y, r, r * 0.8, sp.glow || '#fff27a'); P.disc(x + look * r * 0.2, y, r * 0.35, r * 0.5, '#ffffff'); return; }
    // œil rond : blanc, iris, pupille, reflet
    P.disc(x, y, r * 0.85, r, EYE_W);
    P.disc(x + look * r * 0.25, y + r * 0.1, r * 0.62, r * 0.78, sp.iris || ec);
    if (sp.iris) P.disc(x + look * r * 0.3, y + r * 0.15, r * 0.35, r * 0.45, EYE_DARK);
    P.dot(x + look * r * 0.05 - r * 0.15, y - r * 0.35, EYE_W);
    if (r >= 2.6) P.dot(x + look * r * 0.05 - r * 0.15 + 1 / P.S, y - r * 0.35, EYE_W);
    if (st === 'angry') { P.capsule(x - r, y - r * 1.15 + (look < 0 ? 0 : 1), x + r, y - r * 1.15 + (look < 0 ? 1.2 : -0.2), 0.5, 0.5, P.browMat); }
  };
  one(ex1, ey, er);
  if (ex2 != null) one(ex2, ey, er * (sp.farEye ?? 0.9));
}

function drawMouth(P, sp, mx, my, w = 3) {
  const st = sp.mouth || 'smile', c = sp.mouthColor || '#30202a';
  if (st === 'none') return;
  if (st === 'smile') { P.dot(mx - w * 0.5, my - 0.5, c); P.dot(mx, my, c); P.dot(mx + w * 0.5, my - 0.5, c); }
  else if (st === 'cat') { P.dot(mx - 1.2, my, c); P.dot(mx, my - 0.6, c); P.dot(mx + 1.2, my, c); }
  else if (st === 'open') { P.disc(mx, my + 0.4, w * 0.45, 1.3, '#5a2030'); P.disc(mx, my + 0.9, w * 0.3, 0.6, '#e06a7a'); }
  else if (st === 'fang') { P.dot(mx - w * 0.5, my, c); P.dot(mx, my, c); P.dot(mx + w * 0.5, my, c); P.dot(mx - w * 0.3, my + 1, '#ffffff'); P.dot(mx + w * 0.35, my + 1, '#ffffff'); }
  else if (st === 'line') { for (let k = -1; k <= 1; k++) P.dot(mx + k * w * 0.4, my, c); }
}

/** oreilles / cornes / crêtes sur une tête de centre (hx, hy) et de rayon hr */
function drawHeadTop(P, sp, hx, hy, hr, M, behind, dir = -1) {
  const ears = sp.ears || 'none', L = sp.earLen ?? 1;
  if (behind) {
    if (ears === 'point') {
      for (const s of [-1, 1]) {
        const bx = hx + s * hr * 0.55, by = hy - hr * 0.45;
        const tx = hx + s * hr * (0.95 + 0.15 * L), ty = hy - hr * (1.25 + 0.55 * L);
        P.tri([bx - hr * 0.42, by + 1], [bx + hr * 0.42, by - 1], [tx, ty], M.body);
        if (!sp.backView) P.tri([bx - hr * 0.18, by - 0.5], [bx + hr * 0.2, by - 1.5], [tx - s * 0.4, ty + 3 * L], M.inner, { out: false });
      }
    } else if (ears === 'long') {
      for (const s of [-1, 1]) P.ellipse(hx + s * hr * 0.5, hy - hr * (1.2 + 0.4 * L), hr * 0.3, hr * (0.75 + 0.3 * L), M.body, { rot: s * 0.25 });
    } else if (ears === 'round') {
      for (const s of [-1, 1]) P.ellipse(hx + s * hr * 0.72, hy - hr * 0.72, hr * 0.42 * L, hr * 0.42 * L, M.body);
    } else if (ears === 'fin') {
      for (const s of [-1, 1]) P.tri([hx + s * hr * 0.6, hy - hr * 0.2], [hx + s * hr * 0.9, hy + hr * 0.3], [hx + s * hr * (1.5 + 0.4 * L), hy - hr * (0.6 + 0.3 * L)], M.accent);
    } else if (ears === 'leaf') {
      for (const s of [-1, 1]) P.ellipse(hx + s * hr * 0.75, hy - hr * 0.95, hr * 0.28, hr * 0.7 * L, M.accent, { rot: s * 0.55 });
    }
    if (sp.mane) {
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = Math.PI * (0.05 + 1.9 * (k / (n - 1))) + Math.PI * 0.5;
        const r0 = hr * 0.9, r1 = hr * (1.45 + (k % 2) * 0.2);
        P.tri([hx + Math.cos(a - 0.3) * r0, hy + Math.sin(a - 0.3) * r0], [hx + Math.cos(a + 0.3) * r0, hy + Math.sin(a + 0.3) * r0], [hx + Math.cos(a) * r1, hy + Math.sin(a) * r1], M.accent, { part: M.manePart ?? (M.manePart = P.newPart(true)) });
      }
      M.manePart = null;
    }
    return;
  }
  // devant la tête
  if (sp.horn === 'single') P.tri([hx - hr * 0.18 + dir * hr * 0.1, hy - hr * 0.75], [hx + hr * 0.2 + dir * hr * 0.1, hy - hr * 0.8], [hx + dir * hr * 0.15, hy - hr * (1.6 + 0.3 * (sp.hornLen || 1))], M.horn);
  if (sp.horn === 'double') for (const s of [-1, 1]) P.tri([hx + s * hr * 0.3, hy - hr * 0.7], [hx + s * hr * 0.62, hy - hr * 0.55], [hx + s * hr * 0.9, hy - hr * (1.4 + 0.3 * (sp.hornLen || 1))], M.horn);
  if (sp.crest) {
    const n = sp.crest === true ? 3 : sp.crest;
    for (let k = 0; k < n; k++) {
      const x = hx - hr * 0.3 + k * hr * 0.32;
      P.tri([x - hr * 0.2, hy - hr * 0.8], [x + hr * 0.2, hy - hr * 0.85], [x + hr * 0.35, hy - hr * (1.5 + 0.25 * (k % 2))], M.accent);
    }
  }
  if (sp.sprout) { P.capsule(hx, hy - hr * 0.9, hx + 1, hy - hr * 1.4, 0.7, 0.7, M.accent2); P.ellipse(hx - 2.5, hy - hr * 1.5, 3, 1.6, M.accent, { rot: -0.4 }); P.ellipse(hx + 3.5, hy - hr * 1.6, 3, 1.6, M.accent, { rot: 0.5 }); }
  if (sp.flameTop) { P.tri([hx - 4, hy - hr * 0.7], [hx + 4, hy - hr * 0.7], [hx + 1, hy - hr * 1.9], M.accent); P.tri([hx - 2, hy - hr * 0.8], [hx + 2.5, hy - hr * 0.8], [hx + 0.5, hy - hr * 1.4], M.accent2, { out: false, lift: 0.3 }); }
  if (sp.antenna) for (const s of [-1, 1]) { P.curve(hx + s * hr * 0.3, hy - hr * 0.8, hx + s * hr * 0.6, hy - hr * 1.6, hx + s * hr * 1.0, hy - hr * 1.9, 0.6, 0.6, M.dark); P.ellipse(hx + s * hr * 1.0, hy - hr * 1.95, 1.6, 1.6, M.accent); }
}

function drawTail(P, sp, x0, y0, dir, M, big = 1) {
  const t = sp.tail || 'none'; if (t === 'none') return;
  const k = big * (sp.tailLen ?? 1);
  if (t === 'thin' || t === 'bolt' || t === 'flame' || t === 'club' || t === 'leaf' || t === 'tuft') {
    const ex = x0 + dir * 12 * k, ey = y0 - 12 * k;
    if (t === 'bolt') {
      P.poly([[x0, y0], [x0 + dir * 7 * k, y0 - 6 * k], [x0 + dir * 4 * k, y0 - 8 * k], [x0 + dir * 12 * k, y0 - 16 * k], [x0 + dir * 9 * k, y0 - 9 * k], [x0 + dir * 12 * k, y0 - 9 * k], [x0 + dir * 3 * k, y0 + 1]], M.accent);
      return;
    }
    P.curve(x0, y0, x0 + dir * 12 * k, y0 + 1, ex, ey, 2.2 * big, 1.3 * big, M.body);
    if (t === 'flame') { P.ellipse(ex, ey - 2, 3.4 * big, 4.6 * big, M.accent, { lift: 0.25 }); P.ellipse(ex - dir * 0.4, ey - 1, 1.8 * big, 2.6 * big, M.accent2, { out: false, lift: 0.4 }); }
    if (t === 'club') P.ellipse(ex, ey, 4 * big, 3.5 * big, M.accent);
    if (t === 'leaf') P.ellipse(ex + dir * 2, ey - 3, 2.6 * big, 5 * big, M.accent, { rot: dir * 0.6 });
    if (t === 'tuft') P.ellipse(ex, ey, 2.8 * big, 2.8 * big, M.accent);
  } else if (t === 'thick') {
    P.curve(x0, y0, x0 + dir * 10 * k, y0 + 4, x0 + dir * 15 * k, y0 - 3 * k, 4.5 * big, 2 * big, M.body);
  } else if (t === 'fluffy') {
    P.curve(x0, y0, x0 + dir * 11 * k, y0 + 2, x0 + dir * 11 * k, y0 - 13 * k, 4 * big, 6 * big, M.body);
    P.ellipse(x0 + dir * 11 * k, y0 - 15 * k, 4 * big, 4 * big, M.accent, { clip: null });
  } else if (t === 'fin') {
    P.capsule(x0, y0, x0 + dir * 8 * k, y0 + 2, 3.5 * big, 2.5 * big, M.body);
    P.poly([[x0 + dir * 7 * k, y0 + 1], [x0 + dir * 15 * k, y0 - 6 * k], [x0 + dir * 13 * k, y0 + 2], [x0 + dir * 16 * k, y0 + 8 * k]], M.accent);
  }
}

function backFeatures(P, sp, bx, by, brx, bry, M, view) {
  const f = sp.back || 'none';
  if (f === 'spikes') {
    const n = sp.spikes || 4;
    for (let k = 0; k < n; k++) {
      const x = bx - brx * 0.45 + (k / Math.max(1, n - 1)) * brx * 1.0, y = by - bry * 0.82 + Math.abs(k - (n - 1) / 2) * 0.8;
      P.tri([x - 2.8, y + 2], [x + 2.8, y + 2], [x + 0.6, y - 5.5], M.accent);
    }
  } else if (f === 'shell') {
    P.ellipse(bx + 1, by - bry * 0.35, brx * 1.06, bry * 0.95, M.accent, { bulge: 1.1 });
    const pp = P.nparts - 1;
    for (const [dx, dy] of [[-0.35, -0.3], [0.25, -0.45], [0.05, 0.1], [0.55, 0.05], [-0.6, 0.15]]) P.ellipse(bx + dx * brx, by - bry * 0.35 + dy * bry, brx * 0.22, bry * 0.2, M.accent2, { out: false, clip: [pp] });
  } else if (f === 'leaves') {
    for (let k = 0; k < 5; k++) { const a = -Math.PI * 0.5 + (k - 2) * 0.55; P.ellipse(bx + Math.cos(a) * brx * 0.5, by - bry * 0.6 + Math.sin(a) * bry * 0.6 - 4, 3, 7, M.accent, { rot: a + Math.PI / 2 }); }
  } else if (f === 'bulb') {
    P.ellipse(bx + 1, by - bry * 0.9, brx * 0.62, bry * 0.75, M.accent, { bulge: 1.1 });
    for (let k = 0; k < 4; k++) { const a = -Math.PI * 0.5 + (k - 1.5) * 0.7; P.ellipse(bx + 1 + Math.cos(a) * brx * 0.62, by - bry * 0.4 + Math.sin(a) * bry * 0.3, 2.5, 5.5, M.accent2, { rot: a + Math.PI / 2 }); }
  } else if (f === 'crystals') {
    for (let k = 0; k < 4; k++) { const x = bx - brx * 0.4 + k * brx * 0.3, y = by - bry * 0.7; P.poly([[x - 2, y + 2], [x + 2, y + 2], [x + 2.5, y - 3 - (k % 2) * 3], [x, y - 7 - (k % 2) * 3], [x - 2.5, y - 3]], M.accent, { lift: 0.15 }); }
  } else if (f === 'flame') {
    for (let k = 0; k < 3; k++) { const x = bx - brx * 0.25 + k * brx * 0.35; P.ellipse(x, by - bry - 3, 2.6, 5, M.accent, { lift: 0.2 }); P.ellipse(x, by - bry - 2, 1.3, 2.8, M.accent2, { out: false, lift: 0.4 }); }
  } else if (f === 'cloud') {
    for (const [dx, dy, r] of [[-0.5, -0.8, 5], [0.1, -1.05, 6], [0.7, -0.75, 5]]) P.ellipse(bx + dx * brx, by + dy * bry, r, r * 0.8, M.accent);
  }
}

function wingPair(P, sp, x, y, span, M, view, flap = 0) {
  // aile en éventail : bord d'attaque arrondi, plumes en dents
  const W = (s, mat, part) => {
    const tipx = x + s * span, tipy = y - span * (0.75 - flap * 0.3);
    const pts = [[x, y - 2], [x + s * span * 0.45, tipy - 2], [tipx, tipy], [x + s * span * 0.95, y - span * 0.2], [x + s * span * 0.75, y - span * 0.05], [x + s * span * 0.6, y + span * 0.12], [x + s * span * 0.3, y + span * 0.18], [x, y + 3]];
    P.poly(pts, mat, part != null ? { part } : {});
  };
  return W;
}

// --------------------------------------------------------------- plans de corps
// Chaque plan dessine en 64×64, pieds vers y = 60. view: 'front' (regarde vers la gauche) ou 'back' (vu de dos).

const PLANS = {
  quad(P, sp, M, view) {
    const back = view === 'back';
    const bx = 36, by = 42 - (sp.leg ?? 1) * 2 + 2, brx = 15 * (sp.bw ?? 1), bry = 10 * (sp.bh ?? 1);
    const leg = 8 * (sp.leg ?? 1), lr = 3 * (sp.legW ?? 1), hr = 10 * (sp.head ?? 1);
    const hx = bx - brx * 0.72, hy = by - bry - 2 + (sp.headY || 0);
    const gy = Math.min(60, by + bry + leg - 2);
    if (!back) {
      drawTail(P, sp, bx + brx * 0.85, by - 2, 1, M);
      // pattes du fond
      for (const lx of [bx + brx * 0.55 + 3, bx - brx * 0.5 + 3]) { P.capsule(lx, by + 2, lx, gy - 1, lr, lr * 0.9, M.far); P.ellipse(lx - 0.5, gy, lr * 1.15, lr * 0.75, M.far); }
      P.ellipse(bx, by, brx, bry, M.body);
      const bp = P.nparts - 1;
      if (sp.belly) P.ellipse(bx - 3, by + bry * 0.42, brx * 0.72, bry * 0.5, M.belly, { out: false, clip: [bp] });
      pattern(P, sp, bx, by, brx, bry, M, bp);
      backFeatures(P, sp, bx, by, brx, bry, M, view);
      for (const lx of [bx + brx * 0.55 - 2, bx - brx * 0.5 - 2]) { P.capsule(lx, by + 3, lx - 0.5, gy - 1, lr, lr * 0.9, M.body); P.ellipse(lx - 1, gy, lr * 1.2, lr * 0.8, M.body); }
      drawHeadTop(P, sp, hx, hy, hr, M, true);
      const hp = P.ellipse(hx, hy, hr * (sp.headW ?? 1.05), hr, M.body);
      if (sp.headMask) P.ellipse(hx - hr * 0.1, hy - hr * 0.35, hr * 0.9, hr * 0.5, M.accent, { out: false, clip: [hp] });
      let mx = hx - hr * 0.15, my = hy + hr * 0.5;
      if (sp.snout) { P.ellipse(hx - hr * 0.62, hy + hr * 0.32, hr * 0.5 * sp.snout, hr * 0.38, M.belly || M.body); P.dot(hx - hr * 0.62 - hr * 0.45 * sp.snout, hy + hr * 0.15, '#2a2028'); mx = hx - hr * 0.62; my = hy + hr * 0.56; }
      if (sp.cheeks) for (const s of [-1, 1]) P.ellipse(hx + s * hr * 0.5 - hr * 0.08, hy + hr * 0.38, hr * 0.2, hr * 0.15, M.cheek, { out: false, clip: [hp], lift: 0.2 });
      drawHeadTop(P, sp, hx, hy, hr, M, false);
      drawEyes(P, sp, hx - hr * 0.42, hy - hr * 0.05, hx + hr * 0.3, hr * 0.26 * (sp.eyeSize ?? 1));
      drawMouth(P, sp, mx, my);
    } else {
      // de dos : tête au fond, corps devant, queue au premier plan
      const hx2 = bx - brx * 0.25, hy2 = by - bry - 3;
      drawHeadTop(P, sp, hx2, hy2, hr, M, true);
      P.ellipse(hx2, hy2, hr * 1.05, hr, M.body);
      drawHeadTop(P, sp, hx2, hy2, hr, M, false);
      for (const lx of [bx - brx * 0.6, bx + brx * 0.6]) P.capsule(lx, by + 2, lx, gy, lr * 1.1, lr, M.far);
      P.ellipse(bx, by, brx * 0.95, bry * 1.05, M.body);
      const bp = P.nparts - 1;
      pattern(P, sp, bx, by, brx, bry, M, bp);
      backFeatures(P, sp, bx, by, brx, bry, M, view);
      drawTail(P, sp, bx + brx * 0.3, by + bry * 0.2, 1, M, 1.1);
    }
  },

  biped(P, sp, M, view) {
    const back = view === 'back';
    const bx = 32, brx = 10.5 * (sp.bw ?? 1), bry = 12.5 * (sp.bh ?? 1), leg = 6 * (sp.leg ?? 1);
    const by = 60 - leg - bry + 2, hr = 10.5 * (sp.head ?? 1), hy = by - bry - hr * 0.55 + 2 + (sp.headY || 0), hx = bx - (back ? 0 : 1);
    const lr = 3.6 * (sp.legW ?? 1);
    if (!back) {
      drawTail(P, sp, bx + brx * 0.7, by + bry * 0.4, 1, M);
      if (sp.wings) { const W = wingPair(P, sp, bx + 4, by - bry * 0.4, 16 * sp.wings, M, view); W(1, M.wing); W(-1, M.wing); }
      for (const s of [-1, 1]) { P.capsule(bx + s * brx * 0.5, by + bry * 0.6, bx + s * brx * 0.55, 58, lr, lr, M.body); P.ellipse(bx + s * brx * 0.55 + s * 0.5, 58.5, lr * 1.3, lr * 0.8, M.body); }
      P.ellipse(bx, by, brx, bry, M.body);
      const bp = P.nparts - 1;
      if (sp.belly) P.ellipse(bx - 1, by + bry * 0.18, brx * 0.65, bry * 0.7, M.belly, { out: false, clip: [bp] });
      pattern(P, sp, bx, by, brx, bry, M, bp);
      backFeatures(P, sp, bx, by, brx, bry, M, view);
      const ar = 2.8 * (sp.armW ?? 1);
      for (const s of [-1, 1]) { const ax = bx + s * brx * 0.95, ay = by - bry * 0.45; P.capsule(ax, ay, ax + s * 4, ay + 9 * (sp.arm ?? 1), ar, ar * 0.9, M.body); if (sp.claws) P.ellipse(ax + s * 4.3, ay + 10 * (sp.arm ?? 1), ar * 1.2, ar, M.accent); }
      drawHeadTop(P, sp, hx, hy, hr, M, true);
      const hp = P.ellipse(hx, hy, hr * (sp.headW ?? 1.08), hr, M.body);
      if (sp.headMask) P.ellipse(hx, hy - hr * 0.4, hr * 0.95, hr * 0.45, M.accent, { out: false, clip: [hp] });
      let mx = hx - 1, my = hy + hr * 0.52;
      if (sp.snout) { P.ellipse(hx - 1, hy + hr * 0.42, hr * 0.5 * sp.snout, hr * 0.34, M.belly || M.body); my = hy + hr * 0.62; P.dot(hx - 1, hy + hr * 0.26, '#2a2028'); }
      if (sp.beak) { P.tri([hx - 3, hy + hr * 0.2], [hx + 2, hy + hr * 0.2], [hx - 0.5, hy + hr * 0.85], M.horn); }
      if (sp.cheeks) for (const s of [-1, 1]) P.ellipse(hx + s * hr * 0.6, hy + hr * 0.35, hr * 0.2, hr * 0.15, M.cheek, { out: false, clip: [hp], lift: 0.2 });
      drawHeadTop(P, sp, hx, hy, hr, M, false);
      drawEyes(P, sp, hx - hr * 0.4, hy - hr * 0.02, hx + hr * 0.36, hr * 0.27 * (sp.eyeSize ?? 1), -0.4);
      if (!sp.beak) drawMouth(P, sp, mx, my);
    } else {
      drawHeadTop(P, sp, hx, hy, hr, M, true);
      P.ellipse(hx, hy, hr * 1.08, hr, M.body);
      drawHeadTop(P, sp, hx, hy, hr, M, false);
      for (const s of [-1, 1]) P.capsule(bx + s * brx * 0.95, by - bry * 0.45, bx + s * (brx + 5), by + 2, 3, 2.6, M.far);
      P.ellipse(bx, by, brx * 1.05, bry, M.body);
      const bp = P.nparts - 1;
      pattern(P, sp, bx, by, brx, bry, M, bp);
      backFeatures(P, sp, bx, by, brx, bry, M, view);
      if (sp.wings) { const W = wingPair(P, sp, bx, by - bry * 0.4, 15 * sp.wings, M, view); W(1, M.wing); W(-1, M.wing); }
      drawTail(P, sp, bx + 2, by + bry * 0.5, 1, M, 1.1);
    }
  },

  bird(P, sp, M, view) {
    const back = view === 'back';
    const bx = 35, by = 38, brx = 13 * (sp.bw ?? 1), bry = 10.5 * (sp.bh ?? 1), hr = 8 * (sp.head ?? 1);
    const hx = bx - brx * 0.8, hy = by - bry * 0.95;
    const span = 18 * (sp.wings ?? 1);
    if (!back) {
      // aile du fond, queue
      P.poly([[bx + 6, by - 4], [bx + 10, by - span * 0.95], [bx + 20, by - span * 1.05], [bx + 24, by - span * 0.6], [bx + 18, by - 2]], M.wingFar);
      P.poly([[bx + brx * 0.6, by + 1], [bx + brx + 12, by + 6], [bx + brx + 10, by + 10], [bx + brx + 2, by + 9], [bx + brx * 0.5, by + 6]], M.accent);
      for (const lx of [bx - 2, bx + 4]) { P.capsule(lx, by + bry - 2, lx - 1, 58, 1.1, 1.1, M.horn); P.capsule(lx - 1, 58, lx - 4, 59, 0.8, 0.8, M.horn); }
      P.ellipse(bx, by, brx, bry, M.body, { rot: -0.2 });
      const bp = P.nparts - 1;
      if (sp.belly) P.ellipse(bx - 4, by + bry * 0.3, brx * 0.65, bry * 0.6, M.belly, { out: false, clip: [bp] });
      pattern(P, sp, bx, by, brx, bry, M, bp);
      // aile du devant
      P.poly([[bx - 3, by - 5], [bx + 8, by - span * 0.75], [bx + 16, by - span * 0.6], [bx + 15, by - span * 0.3], [bx + 18, by - 2], [bx + 12, by + 5], [bx + 4, by + 6], [bx - 2, by + 2]], M.wing);
      drawHeadTop(P, sp, hx, hy, hr, M, true);
      const hp = P.ellipse(hx, hy, hr, hr * 0.95, M.body);
      if (sp.headMask) P.ellipse(hx - 1, hy - hr * 0.3, hr * 0.9, hr * 0.5, M.accent, { out: false, clip: [hp] });
      const bl = sp.beakLen ?? 1;
      P.tri([hx - hr * 0.7, hy - 1.5], [hx - hr * 0.6, hy + 2.5], [hx - hr - 6 * bl, hy + 1.5], M.horn);
      drawHeadTop(P, sp, hx, hy, hr, M, false);
      drawEyes(P, sp, hx - hr * 0.25, hy - hr * 0.2, null, hr * 0.32 * (sp.eyeSize ?? 1));
    } else {
      P.ellipse(bx - 6, by - bry * 0.9, hr, hr * 0.95, M.body);
      drawHeadTop(P, sp, bx - 6, by - bry * 0.9, hr, M, false);
      P.poly([[bx - 8, by - 2], [bx - 8 - span, by - span * 0.95], [bx - 12 - span * 0.6, by - span * 0.25], [bx - 10, by + 6]], M.wingFar);
      P.ellipse(bx, by, brx * 0.95, bry * 1.05, M.body);
      const bp = P.nparts - 1;
      pattern(P, sp, bx, by, brx, bry, M, bp);
      P.poly([[bx + 6, by - 3], [bx + 6 + span, by - span * 1.0], [bx + 10 + span * 0.7, by - span * 0.3], [bx + 8, by + 7]], M.wing);
      P.poly([[bx - 4, by + bry * 0.6], [bx + 4, by + bry * 0.6], [bx + 6, by + bry + 10], [bx - 6, by + bry + 10]], M.accent);
    }
  },

  serpent(P, sp, M, view) {
    const back = view === 'back';
    const pts = back
      ? [[34, 64], [30, 54], [36, 44], [40, 36], [36, 28]]
      : [[54, 59], [44, 58], [36, 54], [40, 46], [44, 38], [36, 31], [26, 27]];
    const r0 = 3 * (sp.bw ?? 1), r1 = 6.5 * (sp.bw ?? 1);
    const hr = 9 * (sp.head ?? 1), [hx, hy] = back ? [36, 22] : [20, 22];
    if (sp.wings && !back) { const W = wingPair(P, sp, 40, 40, 16 * sp.wings, M, view); W(1, M.wing); }
    if (back) { drawHeadTop(P, sp, hx, hy, hr, M, true); P.ellipse(hx, hy, hr * 1.05, hr * 0.85, M.body); drawHeadTop(P, sp, hx, hy, hr, M, false); }
    const bodyPart = P.newPart(true);
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
      const [ax, ay] = pts[i], [bx2, by2] = pts[i + 1];
      const ra = back ? r1 + (r0 - r1) * t0 * 0.6 : r0 + (r1 - r0) * t0, rb = back ? r1 + (r0 - r1) * t1 * 0.6 : r0 + (r1 - r0) * t1;
      P.capsule(ax, ay, bx2, by2, ra, rb, M.body, { part: bodyPart });
    }
    if (sp.belly && !back) for (let i = 1; i < pts.length - 1; i++) { const [ax, ay] = pts[i]; P.ellipse(ax - 2, ay + 1.5, 3 + i * 0.5, 2 + i * 0.3, M.belly, { out: false, clip: [bodyPart] }); }
    if (sp.pattern === 'band' || sp.pattern === 'spots') for (let i = 1; i < pts.length - 1; i += 1) { const [ax, ay] = pts[i]; P.ellipse(ax + 1, ay - 2, 2, 1.6, M.accent, { out: false, clip: [bodyPart] }); }
    if (sp.back === 'spikes' || sp.back === 'crystals') for (let i = 1; i < pts.length - 1; i++) { const [ax, ay] = pts[i]; P.tri([ax + 1, ay - 3], [ax + 5, ay - 2], [ax + 5, ay - 8], M.accent); }
    if (back) { if (sp.wings) { const W = wingPair(P, sp, 36, 42, 14 * sp.wings, M, view); W(1, M.wing); W(-1, M.wing); } return; }
    if (sp.hood) P.ellipse(hx + 3, hy + 2, hr * 1.3, hr * 1.15, M.accent);
    drawHeadTop(P, sp, hx, hy, hr, M, true);
    const hp = P.ellipse(hx, hy, hr * 1.1, hr * 0.85, M.body, { rot: -0.15 });
    P.ellipse(hx - hr * 0.55, hy + hr * 0.35, hr * 0.55, hr * 0.32, M.belly || M.body, { clip: [hp], out: false });
    drawHeadTop(P, sp, hx, hy, hr, M, false);
    drawEyes(P, sp, hx - hr * 0.2, hy - hr * 0.25, hx + hr * 0.45, hr * 0.27 * (sp.eyeSize ?? 1));
    drawMouth(P, { ...sp, mouth: sp.mouth || 'line' }, hx - hr * 0.6, hy + hr * 0.45, 4);
  },

  fish(P, sp, M, view) {
    const back = view === 'back';
    const bx = 33, by = 36, brx = 15 * (sp.bw ?? 1), bry = 11 * (sp.bh ?? 1);
    const tailx = back ? bx : bx + brx - 1;
    if (!back) {
      P.poly([[tailx - 2, by], [tailx + 11, by - 10 * (sp.finSize ?? 1)], [tailx + 8, by], [tailx + 11, by + 10 * (sp.finSize ?? 1)]], M.accent);
      P.poly([[bx - 4, by - bry + 2], [bx + 2, by - bry - 7 * (sp.finSize ?? 1)], [bx + 9, by - bry + 2]], M.accent);
      const bp = P.ellipse(bx, by, brx, bry, M.body);
      if (sp.belly) P.ellipse(bx - 3, by + bry * 0.45, brx * 0.75, bry * 0.45, M.belly, { out: false, clip: [bp] });
      pattern(P, sp, bx, by, brx, bry, M, bp);
      if (sp.horn) P.tri([bx - brx * 0.5, by - bry * 0.7], [bx - brx * 0.2, by - bry * 0.9], [bx - brx * 0.9, by - bry * 1.6], M.horn);
      P.poly([[bx - 2, by + 2], [bx + 6, by + 3], [bx + 3, by + 9]], M.accent);
      if (sp.whiskers) { P.curve(bx - brx + 3, by + 3, bx - brx - 2, by + 5, bx - brx - 4, by + 10, 0.6, 0.5, M.accent2); }
      drawEyes(P, sp, bx - brx * 0.5, by - bry * 0.2, null, 3.2 * (sp.eyeSize ?? 1));
      drawMouth(P, { ...sp, mouth: sp.mouth || 'open' }, bx - brx * 0.85, by + bry * 0.25, 3);
    } else {
      P.poly([[bx - 4, by + bry - 2], [bx - 12, by + bry + 12], [bx, by + bry + 6], [bx + 12, by + bry + 12], [bx + 4, by + bry - 2]], M.accent);
      const bp = P.ellipse(bx, by + 6, brx * 0.8, bry * 1.25, M.body);
      pattern(P, sp, bx, by + 6, brx * 0.8, bry, M, bp);
      P.poly([[bx - 2, by - bry + 4], [bx + 1, by - bry - 7], [bx + 4, by - bry + 4]], M.accent);
      for (const s of [-1, 1]) P.poly([[bx + s * brx * 0.7, by + 6], [bx + s * (brx + 7), by + 2], [bx + s * (brx + 4), by + 12]], M.accent);
    }
  },

  blob(P, sp, M, view) {
    const back = view === 'back';
    const fl = sp.float ? 5 : 0;
    const bx = 32, brx = 15 * (sp.bw ?? 1), bry = 13.5 * (sp.bh ?? 1), by = 59 - bry - fl;
    if (!back) {
      drawTail(P, sp, bx + brx * 0.75, by + bry * 0.3, 1, M);
      if (sp.wings) { const W = wingPair(P, sp, bx + 3, by - 2, 15 * sp.wings, M, view, 0.4); W(1, M.wing); W(-1, M.wing); }
      if (!sp.float && sp.feet !== false) for (const s of [-1, 1]) P.ellipse(bx + s * brx * 0.5, by + bry - 1, 4.5, 3, M.body);
      backFeatures(P, sp, bx, by, brx, bry, M, view);
      drawHeadTop(P, sp, bx, by - bry * 0.15, brx * 0.95, M, true);
      let bp;
      if (sp.ghost) {
        const pts = [];
        for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; pts.push([bx + Math.cos(a) * brx, by + Math.sin(a) * bry]); }
        for (let k = 0; k <= 6; k++) { const x = bx + brx - (k / 6) * brx * 2; pts.push([x, by + bry * 0.75 + (k % 2 ? 5 : 0)]); }
        bp = P.poly(pts, M.body);
      } else bp = P.ellipse(bx, by, brx, bry, M.body);
      if (sp.belly) P.ellipse(bx - 1, by + bry * 0.45, brx * 0.62, bry * 0.45, M.belly, { out: false, clip: [bp] });
      pattern(P, sp, bx, by, brx, bry, M, bp);
      if (sp.arms !== false) for (const s of [-1, 1]) P.ellipse(bx + s * (brx - 0.5), by + bry * 0.15, 3, 4.2, M.body, { rot: s * -0.5 });
      if (sp.cheeks) for (const s of [-1, 1]) P.ellipse(bx + s * brx * 0.55, by + bry * 0.12, brx * 0.14, brx * 0.1, M.cheek, { out: false, clip: [bp], lift: 0.2 });
      drawHeadTop(P, sp, bx, by - bry * 0.15, brx * 0.95, M, false);
      drawEyes(P, sp, bx - brx * 0.32, by - bry * 0.15, bx + brx * 0.32, brx * 0.2 * (sp.eyeSize ?? 1), -0.2);
      drawMouth(P, sp, bx - 1, by + bry * 0.18, 4);
    } else {
      drawHeadTop(P, sp, bx, by - bry * 0.2, brx * 0.95, M, true);
      const bp = sp.ghost ? P.ellipse(bx, by + 4, brx * 1.05, bry * 1.15, M.body) : P.ellipse(bx, by + 4, brx * 1.05, bry * 1.1, M.body);
      pattern(P, sp, bx, by + 4, brx, bry, M, bp);
      backFeatures(P, sp, bx, by + 6, brx, bry, M, view);
      drawHeadTop(P, sp, bx, by - bry * 0.2, brx * 0.95, M, false);
      if (sp.wings) { const W = wingPair(P, sp, bx, by, 14 * sp.wings, M, view, 0.4); W(1, M.wing); W(-1, M.wing); }
      drawTail(P, sp, bx + 3, by + bry * 0.6, 1, M, 1.1);
    }
  },

  bug(P, sp, M, view) {
    const back = view === 'back';
    const fl = sp.float ? 6 : 0;
    const ax = 44, ay = 46 - fl, tx = 32, ty = 42 - fl, hx = 21, hy = 34 - fl, hr = 7.5 * (sp.head ?? 1);
    if (!back) {
      if (sp.wings) {
        P.ellipse(40, 26 - fl, 9 * sp.wings, 5 * sp.wings, M.wing, { rot: -0.9, lift: 0.3 });
        P.ellipse(48, 32 - fl, 8 * sp.wings, 4 * sp.wings, M.wingFar, { rot: -0.5, lift: 0.3 });
      }
      if (!sp.float) for (const [x1, x2] of [[30, 26], [35, 36], [40, 44]]) P.capsule(x1 + 2, ty + 2, x2 + 2, 58, 1, 0.8, M.far);
      const ap = P.ellipse(ax, ay, 11 * (sp.bw ?? 1), 8.5 * (sp.bh ?? 1), M.body, { rot: 0.15 });
      if (sp.pattern === 'stripes' || sp.pattern === 'band') for (let k = 0; k < 3; k++) P.ellipse(ax - 3 + k * 4, ay, 1.2, 8, M.accent, { out: false, clip: [ap], rot: 0.1 });
      P.ellipse(tx, ty, 7, 6.5, M.body);
      if (!sp.float) for (const [x1, x2] of [[29, 24], [34, 32], [38, 40]]) P.capsule(x1, ty + 3, x2, 59, 1.1, 0.9, M.dark);
      if (sp.claws) { P.capsule(tx - 3, ty, hx - 9, ty - 6, 1.6, 2.4, M.accent); P.ellipse(hx - 10, ty - 8, 3, 2.4, M.accent, { rot: 0.7 }); }
      drawHeadTop(P, { ...sp, antenna: sp.antenna !== false }, hx, hy, hr, M, false);
      const hp = P.ellipse(hx, hy, hr, hr * 0.92, M.body);
      if (sp.headMask) P.ellipse(hx, hy - hr * 0.3, hr * 0.9, hr * 0.5, M.accent, { out: false, clip: [hp] });
      if (sp.wings && sp.wingFront) P.ellipse(36, 34 - fl, 8, 4, M.wing, { rot: -0.6, lift: 0.35 });
      drawEyes(P, sp, hx - hr * 0.35, hy - 0.5, hx + hr * 0.4, hr * 0.33 * (sp.eyeSize ?? 1));
      if (sp.mandibles) { P.tri([hx - 4, hy + hr * 0.6], [hx - 1, hy + hr * 0.6], [hx - 5, hy + hr + 2], M.horn); P.tri([hx + 1, hy + hr * 0.6], [hx + 4, hy + hr * 0.6], [hx + 2, hy + hr + 2], M.horn); }
    } else {
      drawHeadTop(P, { ...sp, antenna: sp.antenna !== false }, 30, 26 - fl, hr, M, false);
      P.ellipse(30, 26 - fl, hr, hr * 0.9, M.body);
      const ap = P.ellipse(32, 46 - fl, 12 * (sp.bw ?? 1), 11 * (sp.bh ?? 1), M.body);
      if (sp.pattern === 'stripes' || sp.pattern === 'band') for (let k = 0; k < 3; k++) P.ellipse(32, 41 + k * 5 - fl, 12, 1.2, M.accent, { out: false, clip: [ap] });
      if (sp.wings) { P.ellipse(22, 34 - fl, 9 * sp.wings, 5 * sp.wings, M.wing, { rot: -2.3, lift: 0.3 }); P.ellipse(42, 34 - fl, 9 * sp.wings, 5 * sp.wings, M.wing, { rot: -0.8, lift: 0.3 }); }
    }
  },

  plant(P, sp, M, view) {
    const back = view === 'back';
    const bx = 32, brx = 13 * (sp.bw ?? 1), bry = 12 * (sp.bh ?? 1), by = 58 - bry;
    const leaves = (front) => {
      const n = sp.leaves || 5;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k - (n - 1) / 2) * (2.3 / n);
        const len = 9 + (k % 2) * 2;
        P.ellipse(bx + Math.cos(a) * (brx * 0.35 + len * 0.6), by - bry * 0.6 + Math.sin(a) * (len * 0.8), 3.4, len * 0.62, M.accent, { rot: a + Math.PI / 2 });
      }
      if (sp.flower) {
        const fy = by - bry - 9, n2 = 6;
        for (let k = 0; k < n2; k++) { const a = (k / n2) * Math.PI * 2; P.ellipse(bx + Math.cos(a) * 4.5, fy + Math.sin(a) * 3.5, 3, 2.6, M.petal); }
        P.ellipse(bx, fy, 2.6, 2.3, M.accent2, { lift: 0.2 });
      }
    };
    if (!back) {
      leaves(false);
      for (const s of [-1, 1]) P.capsule(bx + s * brx * 0.5, by + bry - 3, bx + s * (brx * 0.6 + 3), 59, 2.2, 1.6, M.far);
      const bp = P.ellipse(bx, by, brx, bry, M.body);
      pattern(P, sp, bx, by, brx, bry, M, bp);
      if (sp.belly) P.ellipse(bx, by + bry * 0.4, brx * 0.6, bry * 0.45, M.belly, { out: false, clip: [bp] });
      if (sp.arms !== false) for (const s of [-1, 1]) P.ellipse(bx + s * (brx + 1), by + 2, 4.5, 2.2, M.accent, { rot: s * 0.6 });
      if (sp.cheeks) for (const s of [-1, 1]) P.ellipse(bx + s * brx * 0.55, by + bry * 0.15, 2.2, 1.6, M.cheek, { out: false, clip: [bp], lift: 0.2 });
      drawEyes(P, sp, bx - brx * 0.33, by - bry * 0.1, bx + brx * 0.33, brx * 0.21 * (sp.eyeSize ?? 1), -0.2);
      drawMouth(P, sp, bx - 1, by + bry * 0.22, 4);
    } else {
      const bp = P.ellipse(bx, by + 5, brx * 1.05, bry * 1.1, M.body);
      pattern(P, sp, bx, by + 5, brx, bry, M, bp);
      leaves(true);
    }
  },
};

function pattern(P, sp, bx, by, brx, bry, M, bp) {
  const p = sp.pattern;
  if (!p || p === 'none') return;
  if (p === 'stripes') for (let k = 0; k < 3; k++) P.ellipse(bx - brx * 0.1 + k * brx * 0.35, by - bry * 0.5, brx * 0.08, bry * 0.55, M.accent, { out: false, clip: [bp], rot: 0.25 });
  if (p === 'spots') for (const [dx, dy] of [[-0.3, -0.45], [0.3, -0.3], [0.55, 0.2], [0.05, 0.05]]) P.ellipse(bx + dx * brx, by + dy * bry, brx * 0.13, bry * 0.14, M.accent, { out: false, clip: [bp] });
  if (p === 'band') P.ellipse(bx, by - bry * 0.1, brx * 1.1, bry * 0.22, M.accent, { out: false, clip: [bp] });
  if (p === 'saddle') P.ellipse(bx + brx * 0.2, by - bry * 0.55, brx * 0.6, bry * 0.5, M.accent, { out: false, clip: [bp] });
}

// --------------------------------------------------------------- API
function materials(P, sp) {
  const body = sp.body || '#b0a090';
  const M = {
    body: P.addMat(body),
    far: P.addMat(shade(body, -0.22)),
    belly: sp.belly ? P.addMat(sp.belly, { noHi: true }) : null,
    accent: P.addMat(sp.accent || shade(body, -0.3)),
    accent2: P.addMat(sp.accent2 || shade(sp.accent || body, 0.4)),
    inner: P.addMat(sp.innerEar || sp.belly || shade(body, 0.35), { inner: false }),
    horn: P.addMat(sp.horn_c || sp.hornColor || '#f0e6c8'),
    dark: P.addMat(sp.dark || shade(body, -0.45)),
    cheek: P.addMat(sp.cheek || '#ff8a8a', { noHi: true }),
    wing: P.addMat(sp.wing || sp.accent || shade(body, 0.15)),
    wingFar: P.addMat(shade(sp.wing || sp.accent || shade(body, 0.15), -0.22)),
    petal: P.addMat(sp.petal || '#ff9ac8'),
  };
  P.browMat = M.dark;
  return M;
}

/** Dessine une créature. view = 'front' | 'back' ; size = taille du canvas (64 ou 32) */
export function drawCreature(sp, view = 'front', size = 64) {
  const P = new Painter(size, size);
  const k = size / 64;
  const s0 = sp.s ?? 1, sc = view === 'back' ? s0 * 1.1 + 0.16 : s0;
  // agrandit autour du point d'ancrage (bas, centre) ; le dos est rogné en bas comme sur DS
  P.setT(sc * k, (32 - 32 * sc) * k + (view === 'back' ? -2 * k : 0), (60 - 60 * sc) * k + (view === 'back' ? (3 + 5 * sc) * k : 0));
  const M = materials(P, { ...sp, backView: view === 'back' });
  const plan = PLANS[sp.plan] || PLANS.blob;
  plan(P, { ...sp, backView: view === 'back' }, M, view);
  const { c, ctx } = makeCanvas(size, size);
  P.render(ctx, view === 'back');
  return c;
}

const CACHE = new Map();
export function creatureSprite(id, sp, view = 'front', size = 64) {
  const key = id + ':' + view + ':' + size;
  if (!CACHE.has(key)) CACHE.set(key, drawCreature(sp, view, size));
  return CACHE.get(key);
}
