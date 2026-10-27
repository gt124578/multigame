// Textures des bâtiments (façades, côtés, toits), pixel art 16 px par unité.
import { makeCanvas, shade, noise2 } from './pixel.js';
import { drawText, textWidth } from './font.js';

const O = '#2a2630';
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

export const KIND_STYLE = {
  house: { roof: '#c85040', wall: '#f0e6d0' },
  center: { roof: '#e05048', wall: '#f6f2ea', sign: 'SOIN', signBg: '#e04a4a', door: 'glass' },
  shop: { roof: '#3c7ad0', wall: '#f2f0ea', sign: 'BOUTIQUE', signBg: '#3a78d0', door: 'glass' },
  gym: { roof: '#8c7c6a', wall: '#e0d8cc', sign: 'ARÈNE', signBg: '#5a4a6a', door: 'double' },
  lab: { roof: '#a8b4c0', wall: '#f6f6f2', door: 'glass' },
  league: { roof: '#c84040', wall: '#f2ece0', sign: 'LIGUE', signBg: '#a03030', door: 'double', columns: true },
  tower: { roof: '#4a3a5c', wall: '#a8a0b0' },
  lighthouse: { roof: '#d04040', wall: '#f4f4f4', stripes: true },
  fountain: { wall: '#c8c4bc' },
};

function wallBase(ctx, W, H, col, kind) {
  ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
  const dark = shade(col, -0.12), light = shade(col, 0.25);
  if (kind === 'stone') {
    for (let y = 0; y < H; y += 5) { ctx.fillStyle = dark; ctx.fillRect(0, y + 4, W, 1); for (let x = ((y / 5) % 2) * 4; x < W; x += 8) ctx.fillRect(x, y, 1, 4); ctx.fillStyle = light; ctx.fillRect(0, y, W, 1); }
  } else if (kind === 'wood') {
    for (let y = 0; y < H; y += 3) { ctx.fillStyle = dark; ctx.fillRect(0, y + 2, W, 1); }
    for (let x = 0; x < W; x += 16) { ctx.fillStyle = shade(col, -0.2); ctx.fillRect(x, 0, 1, H); }
  } else {
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = dark; ctx.fillRect(0, y + 3, W, 1); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (noise2(x, y, 9) > 0.93) px(ctx, x, y, dark);
  }
  // soubassement et ombre sous le toit
  ctx.fillStyle = shade(col, -0.35); ctx.fillRect(0, H - 3, W, 3);
  ctx.fillStyle = shade(col, -0.5); ctx.fillRect(0, H - 1, W, 1);
  ctx.fillStyle = shade(col, -0.28); ctx.fillRect(0, 0, W, 2);
}
function windowAt(ctx, x, y, w = 10, h = 8, frame = '#ffffff', lit = false) {
  ctx.fillStyle = O; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = lit ? '#ffe89a' : '#5a8ad0'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = lit ? '#fff6c8' : '#8ab8f0'; ctx.fillRect(x, y, w, Math.floor(h / 2));
  ctx.fillStyle = lit ? '#fffbe8' : '#c8e4ff'; for (let k = 0; k < Math.min(w, h) - 2; k++) px(ctx, x + 1 + k, y + h - 2 - k, lit ? '#fffbe8' : '#c8e4ff');
  ctx.fillStyle = frame; ctx.fillRect(x + Math.floor(w / 2), y, 1, h); ctx.fillRect(x, y + Math.floor(h / 2), w, 1);
  ctx.fillStyle = shade(frame, -0.3); ctx.fillRect(x - 1, y + h + 1, w + 2, 1);
}
function doorAt(ctx, x, H, style, wallCol) {
  const dh = 22, dw = 14, y = H - dh - 1;
  ctx.fillStyle = O; ctx.fillRect(x - 1, y - 1, dw + 2, dh + 1);
  if (style === 'glass') {
    ctx.fillStyle = '#4a6a98'; ctx.fillRect(x, y, dw, dh);
    ctx.fillStyle = '#7aa2d8'; ctx.fillRect(x + 1, y + 1, 5, dh - 2); ctx.fillRect(x + 8, y + 1, 5, dh - 2);
    ctx.fillStyle = '#b8d8ff'; ctx.fillRect(x + 1, y + 1, 2, dh - 2); ctx.fillRect(x + 8, y + 1, 2, dh - 2);
    ctx.fillStyle = O; ctx.fillRect(x + 7, y, 1, dh);
  } else if (style === 'double') {
    ctx.fillStyle = '#6a4228'; ctx.fillRect(x, y, dw, dh); ctx.fillStyle = '#8a5a36'; ctx.fillRect(x + 1, y + 1, 5, dh - 2); ctx.fillRect(x + 8, y + 1, 5, dh - 2);
    ctx.fillStyle = O; ctx.fillRect(x + 7, y, 1, dh); px(ctx, x + 5, y + 12, '#f0d070'); px(ctx, x + 9, y + 12, '#f0d070');
  } else {
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(x, y, dw, dh); ctx.fillStyle = '#9a643a'; ctx.fillRect(x + 2, y + 2, dw - 4, 8); ctx.fillRect(x + 2, y + 12, dw - 4, 8);
    ctx.fillStyle = '#5a3420'; ctx.fillRect(x + 2, y + 10, dw - 4, 1); px(ctx, x + dw - 4, y + 11, '#f0d070');
  }
  // marche
  ctx.fillStyle = shade(wallCol, -0.45); ctx.fillRect(x - 2, H - 1, dw + 4, 1);
}
function emblem(ctx, kind, cx, cy) {
  if (kind === 'center') {
    // cœur blanc sur disque rouge
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) px(ctx, cx + x, cy + y, x * x + y * y > 18 ? O : '#e04848');
    const H = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
    H.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && px(ctx, cx - 3 + x, cy - 3 + y, '#ffffff')));
  } else if (kind === 'shop') {
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) px(ctx, cx + x, cy + y, x * x + y * y > 18 ? O : '#3a78d0');
    const S = ['#####', '#.#.#', '#####', '.#.#.'];
    S.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && px(ctx, cx - 2 + x, cy - 2 + y, '#ffffff')));
  }
}

/** façade sud (avec porte) : renvoie un canvas W × H px */
export function facadeTexture(b) {
  const st = { ...KIND_STYLE[b.kind], ...(b.wall ? { wall: b.wall } : {}) };
  const W = b.w * 16, H = Math.round(b.h * 16);
  const { c, ctx } = makeCanvas(W, H);
  const material = b.kind === 'gym' || b.kind === 'tower' || b.kind === 'league' ? 'stone' : b.kind === 'house' && (b.roof || '').length && (b.x + b.y) % 3 === 0 ? 'wood' : 'plaster';
  wallBase(ctx, W, H, st.wall, b.glass ? 'plaster' : material);
  if (b.kind === 'lighthouse') {
    for (let y = 0; y < H; y += 16) { ctx.fillStyle = '#d04040'; ctx.fillRect(0, y, W, 8); ctx.fillStyle = '#a02828'; ctx.fillRect(0, y + 7, W, 1); }
    windowAt(ctx, W / 2 - 3, 10, 6, 6); windowAt(ctx, W / 2 - 3, 48, 6, 6);
    return c;
  }
  if (b.kind === 'fountain') return c;
  if (b.glass) {
    // serre : grands carreaux verts
    for (let x = 2; x < W - 2; x += 10) for (let y = 4; y < H - 6; y += 10) { ctx.fillStyle = O; ctx.fillRect(x, y, 9, 9); ctx.fillStyle = '#9ad8b0'; ctx.fillRect(x + 1, y + 1, 7, 7); ctx.fillStyle = '#d0f4dc'; ctx.fillRect(x + 1, y + 1, 3, 3); }
  }
  const doorX = b.door ? (b.doorX ?? Math.floor(b.w / 2)) : -1;
  const floors = Math.max(1, Math.floor((H - 6) / 20));
  if (!b.glass) for (let col = 0; col < b.w; col++) {
    if (col === doorX) continue;
    for (let f = 0; f < floors; f++) {
      const wy = H - 26 - f * 20;
      if (wy < 3) continue;
      if (b.kind === 'tower' && col % 2) continue;
      windowAt(ctx, col * 16 + 3, wy + (f === 0 ? 4 : 0), 10, 8, '#ffffff', b.lit);
    }
  }
  if (st.columns) for (let col = 0; col < b.w; col += 2) { ctx.fillStyle = O; ctx.fillRect(col * 16 + 6, 2, 5, H - 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(col * 16 + 7, 3, 3, H - 6); ctx.fillStyle = '#d8d0c0'; ctx.fillRect(col * 16 + 9, 3, 1, H - 6); }
  if (doorX >= 0) doorAt(ctx, doorX * 16 + 1, H, st.door, st.wall);
  // enseigne au-dessus de la porte
  if (st.sign && doorX >= 0) {
    const tw = textWidth(st.sign) + 8 + (b.kind === 'center' ? 12 : 0);
    const sx = Math.round(doorX * 16 + 8 - tw / 2), sy = Math.max(1, H - 38);
    ctx.fillStyle = O; ctx.fillRect(sx, sy, tw, 12); ctx.fillStyle = st.signBg; ctx.fillRect(sx + 1, sy + 1, tw - 2, 10); ctx.fillStyle = shade(st.signBg, 0.3); ctx.fillRect(sx + 1, sy + 1, tw - 2, 1);
    let tx = sx + 4;
    if (b.kind === 'center') { emblem(ctx, b.kind, sx - 2, sy + 6); tx += 8; }
    drawText(ctx, st.sign, tx, sy - 1, '#ffffff', shade(st.signBg, -0.45));
  }
  return c;
}

/** mur latéral ou arrière */
export function sideTexture(b, depthTiles) {
  const st = { ...KIND_STYLE[b.kind], ...(b.wall ? { wall: b.wall } : {}) };
  const W = Math.max(16, depthTiles * 16), H = Math.round(b.h * 16);
  const { c, ctx } = makeCanvas(W, H);
  wallBase(ctx, W, H, shade(st.wall, -0.1), b.kind === 'gym' || b.kind === 'tower' ? 'stone' : 'plaster');
  if (b.kind === 'lighthouse') { for (let y = 0; y < H; y += 16) { ctx.fillStyle = '#b03838'; ctx.fillRect(0, y, W, 8); } return c; }
  if (b.kind !== 'fountain' && b.kind !== 'tower' && depthTiles >= 3 && !b.glass) windowAt(ctx, W / 2 - 4, H - 22, 8, 7);
  return c;
}

/** pan de toit (tuiles) : W × L px */
export function roofTexture(b, W, L, snow = false) {
  const col = b.roof || KIND_STYLE[b.kind]?.roof || '#c85040';
  const { c, ctx } = makeCanvas(W, L);
  if (b.glass) {
    ctx.fillStyle = '#8ad0a8'; ctx.fillRect(0, 0, W, L);
    for (let x = 0; x < W; x += 8) { ctx.fillStyle = '#4a8a6a'; ctx.fillRect(x, 0, 1, L); }
    for (let y = 0; y < L; y += 8) { ctx.fillStyle = '#4a8a6a'; ctx.fillRect(0, y, W, 1); }
    for (let k = 0; k < W; k += 16) for (let t = 0; t < 6; t++) px(ctx, k + 2 + t, 2 + t, '#e0fff0');
    return c;
  }
  const d = shade(col, -0.25), dd = shade(col, -0.45), l = shade(col, 0.22);
  ctx.fillStyle = col; ctx.fillRect(0, 0, W, L);
  for (let y = 0; y < L; y += 4) {
    ctx.fillStyle = dd; ctx.fillRect(0, y + 3, W, 1);
    ctx.fillStyle = d; ctx.fillRect(0, y + 2, W, 1);
    const off = (y / 4) % 2 ? 4 : 0;
    for (let x = off; x < W; x += 8) { ctx.fillStyle = dd; ctx.fillRect(x, y, 1, 3); ctx.fillStyle = l; ctx.fillRect(x + 1, y, 3, 1); }
  }
  if (b.metal) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, L); for (let x = 0; x < W; x += 4) { ctx.fillStyle = d; ctx.fillRect(x, 0, 1, L); ctx.fillStyle = l; ctx.fillRect(x + 1, 0, 1, L); } }
  // faîtière
  ctx.fillStyle = dd; ctx.fillRect(0, 0, W, 2); ctx.fillStyle = l; ctx.fillRect(0, 2, W, 1);
  // bord inférieur (gouttière)
  ctx.fillStyle = O; ctx.fillRect(0, L - 1, W, 1); ctx.fillStyle = dd; ctx.fillRect(0, L - 2, W, 1);
  if (snow) {
    for (let x = 0; x < W; x++) {
      const h = Math.floor(L * 0.55 + Math.sin(x * 0.5) * 2 + noise2(x, 0, 4) * 3);
      for (let y = 0; y < h; y++) px(ctx, x, y, y === h - 1 ? '#c8d8ea' : (x + y) % 7 === 0 ? '#e8f0f8' : '#ffffff');
    }
  }
  return c;
}

/** eau de fontaine (dessus) */
export function fountainTop(W, H, f = 0) {
  const { c, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#8a8680'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4a8ae0'; ctx.fillRect(3, 3, W - 6, H - 6);
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if ((x * 3 + y * 5 + f * 4) % 11 === 0) px(ctx, x, y, '#a8d4ff');
  const cx = W / 2, cy = H / 2;
  ctx.fillStyle = '#c8c4bc'; ctx.fillRect(cx - 4, cy - 4, 8, 8); ctx.fillStyle = '#e8f4ff'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
  return c;
}
