// Textures des meubles d'intérieur : renvoie { top, front, side } (canvas), 16 px par unité.
import { makeCanvas, shade, noise2 } from './pixel.js';

const O = '#2a2630';
function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function box(W, H, fill) { const k = makeCanvas(Math.max(1, Math.round(W)), Math.max(1, Math.round(H))); if (fill) { k.ctx.fillStyle = fill; k.ctx.fillRect(0, 0, k.c.width, k.c.height); } return k; }
function frame(ctx, W, H, c = O) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1); ctx.fillRect(0, 0, 1, H); ctx.fillRect(W - 1, 0, 1, H); }

export function furnitureFaces(f) {
  const W = (f.w || 1) * 16, D = (f.d || 1) * 16, H = Math.max(1, Math.round((f.h || 1) * 16));
  const k = f.kind;
  if (k === 'wall') {
    const col = f.color || '#e8d8b8';
    const fr = box(W, H, col), c = fr.ctx;
    if (f.pattern === 'stone') {
      for (let y = 0; y < H; y += 6) { c.fillStyle = shade(col, -0.18); c.fillRect(0, y + 5, W, 1); for (let x = ((y / 6) % 2) * 6; x < W; x += 12) c.fillRect(x, y, 1, 5); c.fillStyle = shade(col, 0.12); c.fillRect(0, y, W, 1); }
    } else {
      for (let x = 0; x < W; x += 8) { c.fillStyle = shade(col, -0.06); c.fillRect(x, 0, 3, H); }
      for (let y = 6; y < H - 8; y += 10) for (let x = 4; x < W; x += 16) { px(c, x, y, shade(col, -0.2)); px(c, x + 1, y + 1, shade(col, -0.2)); }
      c.fillStyle = shade(col, -0.3); c.fillRect(0, H - 6, W, 6); c.fillStyle = shade(col, -0.45); c.fillRect(0, H - 6, W, 1);
    }
    c.fillStyle = shade(col, -0.5); c.fillRect(0, H - 1, W, 1);
    // fenêtres
    if (f.pattern !== 'stone') for (let x = 24; x < W - 24; x += 64) { c.fillStyle = O; c.fillRect(x, 8, 18, 14); c.fillStyle = '#9ad0ff'; c.fillRect(x + 1, 9, 16, 12); c.fillStyle = '#d0ecff'; c.fillRect(x + 1, 9, 16, 5); c.fillStyle = '#ffffff'; c.fillRect(x + 8, 9, 1, 12); }
    const top = box(W, 16, shade(col, -0.6));
    return { top: top.c, front: fr.c, side: box(16, H, shade(col, -0.4)).c };
  }
  if (k === 'mat') { const t = box(W, D, '#c84a3a'); t.ctx.fillStyle = '#e86a5a'; t.ctx.fillRect(2, 2, W - 4, D - 4); return { top: t.c }; }
  if (k === 'rug') {
    const col = f.color || '#c86a5a', t = box(W, D, shade(col, -0.25)), c = t.ctx;
    c.fillStyle = col; c.fillRect(2, 2, W - 4, D - 4); c.fillStyle = shade(col, 0.3);
    for (let x = 4; x < W - 4; x += 4) { c.fillRect(x, 3, 2, 1); c.fillRect(x, D - 4, 2, 1); }
    return { top: t.c };
  }
  if (k === 'table' || k === 'counter' || k === 'starter') {
    const col = k === 'counter' ? '#c8a878' : '#b8804a';
    const top = box(W, D, shade(col, 0.15)), t = top.ctx; frame(t, W, D); t.fillStyle = shade(col, 0.35); t.fillRect(1, 1, W - 2, 2);
    for (let x = 3; x < W; x += 6) { t.fillStyle = shade(col, 0.05); t.fillRect(x, 3, 1, D - 4); }
    if (k === 'starter') {
      // trois Sphères posées sur la table
      for (const cx of [W / 6, W / 2, (W * 5) / 6]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x, y); if (d > 4.5) continue; px(t, Math.round(cx + x), D / 2 + y, d > 3.6 ? O : y < 0 ? (x + y < -3 ? '#ffa0a0' : '#e04848') : y === 0 ? O : '#f4f4f4'); }
    }
    const fr = box(W, H, col), c = fr.ctx;
    if (k === 'counter') { c.fillStyle = f.color || '#e86a6a'; c.fillRect(0, 3, W, H - 5); c.fillStyle = shade(f.color || '#e86a6a', 0.3); c.fillRect(0, 3, W, 1); c.fillStyle = '#ffffff'; for (let x = 6; x < W; x += 16) c.fillRect(x, 7, 4, 2); }
    else { c.fillStyle = O; c.fillRect(1, 2, 2, H - 2); c.fillRect(W - 3, 2, 2, H - 2); c.fillStyle = shade(col, -0.2); c.fillRect(0, 0, W, 3); c.clearRect(3, 3, W - 6, H - 3); c.fillStyle = 'rgba(0,0,0,0)'; }
    c.fillStyle = O; c.fillRect(0, 0, W, 1);
    return { top: top.c, front: fr.c, side: fr.c, cut: k === 'table' };
  }
  if (k === 'bookcase' || k === 'shelf') {
    const col = k === 'bookcase' ? '#8a5a34' : '#c8ccd4';
    const fr = box(W, H, col), c = fr.ctx; frame(c, W, H);
    const rows = Math.max(2, Math.floor(H / 9));
    for (let r = 0; r < rows; r++) {
      const y = 2 + r * Math.floor((H - 3) / rows), hh = Math.floor((H - 3) / rows) - 2;
      c.fillStyle = shade(col, -0.45); c.fillRect(2, y, W - 4, hh);
      for (let x = 3; x < W - 3; x += 3) {
        const bh = hh - 1 - Math.floor(noise2(x, r, 4) * 3);
        const cc = k === 'bookcase' ? ['#c84a3a', '#3a6ac8', '#58a048', '#e0b040', '#8a4ab0'][Math.floor(noise2(x, r, 9) * 5)] : ['#e84848', '#f0c030', '#48a0e0', '#f4f4f4', '#58b050'][Math.floor(noise2(x, r, 7) * 5)];
        c.fillStyle = cc; c.fillRect(x, y + hh - bh, 2, bh);
      }
    }
    return { top: box(W, D, shade(col, -0.15)).c, front: fr.c, side: box(D, H, shade(col, -0.2)).c };
  }
  if (k === 'bed') {
    const top = box(W, D, '#f4f4f4'), t = top.ctx; frame(t, W, D);
    t.fillStyle = '#4a7ad0'; t.fillRect(1, D * 0.4, W - 2, D * 0.6 - 1); t.fillStyle = '#6a9ae8'; t.fillRect(1, D * 0.4, W - 2, 2);
    t.fillStyle = '#ffffff'; t.fillRect(4, 3, W - 8, D * 0.3);
    const fr = box(W, H, '#8a5a34'); frame(fr.ctx, W, H);
    return { top: top.c, front: fr.c, side: fr.c };
  }
  if (k === 'tv' || k === 'pc' || k === 'machine' || k === 'healer') {
    const col = k === 'healer' ? '#e8e8f0' : k === 'machine' ? '#a8b0c0' : '#c8c8d0';
    const fr = box(W, H, col), c = fr.ctx; frame(c, W, H);
    if (k === 'tv') { c.fillStyle = '#28283a'; c.fillRect(2, 2, W - 4, H - 6); c.fillStyle = '#5a8ad0'; c.fillRect(3, 3, W - 6, H - 8); c.fillStyle = '#9ac8ff'; c.fillRect(3, 3, 4, 2); }
    if (k === 'pc') { c.fillStyle = '#28283a'; c.fillRect(2, 2, W - 4, 8); c.fillStyle = '#58d080'; c.fillRect(3, 3, W - 6, 6); c.fillStyle = '#a8ffc8'; c.fillRect(4, 4, 3, 1); c.fillStyle = shade(col, -0.25); c.fillRect(2, 12, W - 4, 2); }
    if (k === 'machine') { for (let x = 3; x < W - 4; x += 8) { c.fillStyle = '#28283a'; c.fillRect(x, 3, 6, 6); c.fillStyle = ['#58d080', '#f0c030', '#e85a5a'][(x / 8) % 3]; c.fillRect(x + 1, 4, 4, 4); } c.fillStyle = shade(col, -0.3); c.fillRect(2, 12, W - 4, H - 14); }
    if (k === 'healer') { c.fillStyle = '#d04848'; c.fillRect(2, 2, W - 4, 4); for (const x of [3, 7, 11]) { c.fillStyle = O; c.fillRect(x, 8, 3, 3); c.fillStyle = '#f0f0f0'; c.fillRect(x, 8, 2, 2); } }
    return { top: box(W, D, shade(col, 0.15)).c, front: fr.c, side: box(D, H, shade(col, -0.15)).c };
  }
  if (k === 'fridge') { const fr = box(W, H, '#e8ecf0'), c = fr.ctx; frame(c, W, H); c.fillStyle = '#b8c0c8'; c.fillRect(1, H * 0.4, W - 2, 1); c.fillRect(W - 4, 4, 1, 6); c.fillRect(W - 4, H * 0.4 + 3, 1, 8); return { top: box(W, D, '#f4f8fa').c, front: fr.c, side: box(D, H, '#c8ccd4').c }; }
  if (k === 'sofa') { const col = f.color || '#d05a5a'; const fr = box(W, H, col), c = fr.ctx; frame(c, W, H); c.fillStyle = shade(col, 0.25); c.fillRect(1, 1, W - 2, 3); const top = box(W, D, shade(col, 0.1)); frame(top.ctx, W, D); top.ctx.fillStyle = shade(col, -0.2); top.ctx.fillRect(1, 1, 4, D - 2); return { top: top.c, front: fr.c, side: fr.c }; }
  if (k === 'plant') return { sprite: 'pot' };
  if (k === 'statue') return { sprite: 'statue' };
  if (k === 'pillar') { const col = '#f2eee4'; const fr = box(W, H, col), c = fr.ctx; c.fillStyle = shade(col, -0.15); c.fillRect(W - 5, 0, 4, H); c.fillStyle = '#ffffff'; c.fillRect(3, 0, 2, H); c.fillStyle = shade(col, -0.35); c.fillRect(0, 0, W, 3); c.fillRect(0, H - 3, W, 3); return { top: box(W, D, shade(col, -0.1)).c, front: fr.c, side: fr.c }; }
  if (k === 'obstacle') {
    const st = f.style;
    if (st === 'rock') return { sprite: 'boulder' };
    if (st === 'plant') return { sprite: 'bush' };
    if (st === 'statue') return { sprite: 'statue' };
    if (st === 'pillar') { const col = '#5a4a72'; const fr = box(W, H, col), c = fr.ctx; c.fillStyle = shade(col, 0.2); c.fillRect(2, 0, 3, H); c.fillStyle = '#c8a0ff'; c.fillRect(6, 4, 4, 4); return { top: box(W, D, shade(col, 0.1)).c, front: fr.c, side: fr.c }; }
    if (st === 'machine') { const fr = box(W, H, '#8a90a0'), c = fr.ctx; frame(c, W, H); c.fillStyle = '#f0d030'; for (let x = 2; x < W; x += 4) { c.fillRect(x, 2, 2, 2); } c.fillStyle = '#28283a'; c.fillRect(3, 6, W - 6, 6); c.fillStyle = '#58f0ff'; c.fillRect(4, 8, W - 8, 2); return { top: box(W, D, '#a0a8b8').c, front: fr.c, side: fr.c }; }
    // piscine, lave, glace : dalles plates
    const pal = st === 'pool' ? ['#2a6ac0', '#4a8ae8', '#8ac0ff'] : st === 'lava' ? ['#c83a1a', '#f0702a', '#ffc040'] : ['#a8d8f0', '#c8ecff', '#ffffff'];
    const t = box(W, D, pal[1]), c = t.ctx; frame(c, W, D, shade(pal[0], -0.3));
    for (let y = 1; y < D - 1; y++) for (let x = 1; x < W - 1; x++) { const n = noise2(x, y, 5); if (n > 0.85) px(c, x, y, pal[2]); else if (n < 0.12) px(c, x, y, pal[0]); }
    return { top: t.c, front: box(W, H, pal[0]).c, side: box(D, H, pal[0]).c, anim: st };
  }
  const b = box(W, H, '#a08060'); frame(b.ctx, W, H);
  return { top: box(W, D, '#b89070').c, front: b.c, side: b.c };
}
