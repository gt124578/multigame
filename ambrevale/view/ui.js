// Primitives d'interface façon DS : fenêtres, boutons, barres de PV, étiquettes de type, icônes.
import { drawText, drawTextCentered, drawTextRight, textWidth, wrap } from '../gfx/font.js';
import { shade, drawGrid } from '../gfx/pixel.js';
import { TYPES } from '../engine/types.js';
import { STATUS_NAMES, STATUS_COLORS } from '../engine/mon.js';

export { drawText, drawTextCentered, drawTextRight, textWidth, wrap };

export function rrect(ctx, x, y, w, h, col, r = 2) {
  ctx.fillStyle = col;
  ctx.fillRect(x + r, y, w - 2 * r, h); ctx.fillRect(x, y + r, w, h - 2 * r);
  if (r >= 2) { ctx.fillRect(x + 1, y + 1, w - 2, h - 2); }
}
/** fenêtre de texte à double bordure */
export function frame(ctx, x, y, w, h, theme = 'text') {
  const T = {
    text: ['#3a4a6a', '#8aa0c8', '#ffffff'],
    menu: ['#6a3a3a', '#e08a7a', '#fffaf4'],
    green: ['#2a5a3a', '#7ac08a', '#f4fff4'],
    dark: ['#141420', '#4a4a6a', '#262636'],
    gold: ['#6a5020', '#e0c060', '#fffaea'],
  }[theme] || ['#3a4a6a', '#8aa0c8', '#ffffff'];
  rrect(ctx, x, y, w, h, T[0], 3);
  rrect(ctx, x + 1, y + 1, w - 2, h - 2, T[1], 2);
  rrect(ctx, x + 3, y + 3, w - 6, h - 6, T[2], 2);
  ctx.fillStyle = shade(T[2], -0.05); ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
}
export function arrow(ctx, x, y, col = '#484850') { drawText(ctx, '▶', x, y, col, null); }

/** bouton bombé de l'écran tactile */
export function button(ctx, x, y, w, h, col, label, o = {}) {
  const sel = o.sel, dis = o.disabled;
  const c = dis ? '#9a9aa4' : col;
  rrect(ctx, x, y, w, h, sel ? '#ffffff' : shade(c, -0.55), 4);
  rrect(ctx, x + 1, y + 1, w - 2, h - 2, shade(c, -0.25), 3);
  rrect(ctx, x + 2, y + 2, w - 4, h - 4, c, 3);
  ctx.fillStyle = shade(c, 0.22); ctx.fillRect(x + 4, y + 3, w - 8, Math.max(2, Math.floor((h - 6) / 2)));
  ctx.fillStyle = shade(c, 0.42); ctx.fillRect(x + 5, y + 3, w - 10, 1);
  if (sel) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); }
  if (label) {
    const lines = String(label).split('\n');
    const ty = y + Math.floor(h / 2) - (lines.length * 11) / 2 - 1 + (o.icon ? 6 : 0);
    lines.forEach((l, i) => drawTextCentered(ctx, l, x + w / 2 + (o.dx || 0), ty + i * 11, '#ffffff', shade(c, -0.55)));
  }
  if (o.icon) o.icon(ctx, x + w / 2 - 8, y + 4);
}

export function hpBar(ctx, x, y, w, ratio, label = true) {
  ratio = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = '#2a2a32'; ctx.fillRect(x, y, w + (label ? 15 : 2), 5);
  if (label) { ctx.fillStyle = '#f8c838'; ctx.fillRect(x + 1, y + 1, 12, 3); drawTiny(ctx, 'PV', x + 2, y, '#5a3a10'); }
  const bx = x + (label ? 14 : 1), bw = w;
  ctx.fillStyle = '#505060'; ctx.fillRect(bx, y + 1, bw, 3);
  const col = ratio > 0.5 ? ['#38d060', '#80f8a0'] : ratio > 0.2 ? ['#f0c020', '#fff080'] : ['#f04838', '#ff9888'];
  const fw = Math.ceil(bw * ratio);
  ctx.fillStyle = col[0]; ctx.fillRect(bx, y + 1, fw, 3); ctx.fillStyle = col[1]; ctx.fillRect(bx, y + 1, fw, 1);
}
export function xpBar(ctx, x, y, w, ratio) {
  ctx.fillStyle = '#2a2a32'; ctx.fillRect(x, y, w + 2, 3);
  ctx.fillStyle = '#4a4a5a'; ctx.fillRect(x + 1, y + 1, w, 1);
  ctx.fillStyle = '#48a8f8'; ctx.fillRect(x + 1, y + 1, Math.floor(w * Math.max(0, Math.min(1, ratio))), 1);
}

// police minuscule 3×4 pour « PV », « Nv »
const TINY = { P: ['##.', '###', '#..', '#..'], V: ['#.#', '#.#', '#.#', '.#.'], N: ['#.#', '###', '###', '#.#'], v: ['...', '#.#', '#.#', '.#.'], X: ['#.#', '.#.', '.#.', '#.#'] };
export function drawTiny(ctx, s, x, y, col) {
  ctx.fillStyle = col; let cx = x;
  for (const ch of s) { const g = TINY[ch]; if (!g) { cx += 4; continue; } g.forEach((r, yy) => [...r].forEach((p, xx) => p === '#' && ctx.fillRect(cx + xx, y + yy, 1, 1))); cx += 4; }
}

export function typeTag(ctx, x, y, type, w = 34) {
  const T = TYPES[type]; if (!T) return;
  rrect(ctx, x, y, w, 11, shade(T.color, -0.45), 2);
  rrect(ctx, x + 1, y + 1, w - 2, 9, T.color, 2);
  ctx.fillStyle = shade(T.color, 0.25); ctx.fillRect(x + 2, y + 1, w - 4, 1);
  const name = T.name.length > 7 ? T.name.slice(0, 6) + '.' : T.name;
  drawTextCentered(ctx, name, x + w / 2, y - 1, '#ffffff', shade(T.color, -0.5));
}
export function statusTag(ctx, x, y, st) {
  if (!st) return;
  rrect(ctx, x, y, 22, 9, shade(STATUS_COLORS[st], -0.4), 2); rrect(ctx, x + 1, y + 1, 20, 7, STATUS_COLORS[st], 2);
  drawTextCentered(ctx, STATUS_NAMES[st], x + 11, y - 2, '#ffffff', null);
}

/** fond animé de l'écran du bas (losanges en dégradé) */
export function subBackground(ctx, a = '#d8e4f0', b = '#c4d4e6', t = 0) {
  ctx.fillStyle = a; ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = b;
  const off = Math.floor(t * 8) % 16;
  for (let y = -16; y < 192; y += 16) for (let x = -16; x < 256; x += 16) {
    const cx = x + 8 + off, cy = y + 8 + off;
    for (let k = 0; k < 4; k++) ctx.fillRect(cx - k, cy - 3 + k, 1 + 2 * k, 1), ctx.fillRect(cx - k, cy + 3 - k, 1 + 2 * k, 1);
  }
}
export function topBar(ctx, title, col = '#4a6aa8', right = '') {
  ctx.fillStyle = shade(col, -0.45); ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = col; ctx.fillRect(0, 0, 256, 15);
  ctx.fillStyle = shade(col, 0.25); ctx.fillRect(0, 0, 256, 1);
  drawText(ctx, title, 6, 2, '#ffffff', shade(col, -0.5));
  if (right) drawTextRight(ctx, right, 250, 2, '#ffffff', shade(col, -0.5));
}

// ---- icônes 16 × 16 ----
const ICONS = {
  team: { rows: ['................', '.....oooooo.....', '....orrrrrro....', '...orrrrrrrro...', '...orrrrrrrro...', '..orrrrwwrrrro..', '..oooooowooooo..', '..okkkkoookkko..', '..owwwwwowwwwo..', '...owwwwwwwwo...', '...owwwwwwwwo...', '....owwwwwwo....', '.....oooooo.....', '................', '................', '................'], pal: { o: '#2a2630', r: '#e84848', w: '#f4f4f4', k: '#2a2630' } },
  bag: { rows: ['................', '.....oooooo.....', '....o......o....', '....o......o....', '..oooooooooooo..', '.obbbbbbbbbbbbo.', '.obyyyyyyyyyybo.', '.obbbbbbbbbbbbo.', '.obbbbboobbbbbo.', '.obbbbboobbbbbo.', '.obbbbbbbbbbbbo.', '.obbbbbbbbbbbbo.', '.obbbbbbbbbbbbo.', '..oooooooooooo..', '................', '................'], pal: { o: '#2a2630', b: '#d0843a', y: '#f0c060' } },
  dex: { rows: ['................', '..oooooooooooo..', '..orrrrrrrrrro..', '..orwwwwwwwwro..', '..orwggggggwro..', '..orwggggggwro..', '..orwggggggwro..', '..orwwwwwwwwro..', '..orrrrrrrrrro..', '..orooroorrrro..', '..orooroorrrro..', '..orrrrrrrrrro..', '..oooooooooooo..', '................', '................', '................'], pal: { o: '#2a2630', r: '#d83a3a', w: '#e8e8e8', g: '#58c8a0' } },
  map: { rows: ['................', '.oooooooooooooo.', '.oggggbbbbggggo.', '.ogggbbbbbggggo.', '.oggggbbbgyyggo.', '.oyyggggggyyggo.', '.oyyyggggggggbo.', '.oggggggrrgggbo.', '.oggggggrrggbbo.', '.obbggggggggbbo.', '.obbbgggyygggbo.', '.oooooooooooooo.', '................', '................', '................', '................'], pal: { o: '#2a2630', g: '#68c058', b: '#4a8ae0', y: '#e8d070', r: '#e04848' } },
  badge: { rows: ['................', '.......oo.......', '......oyyo......', '.....oyyyyo.....', 'ooooooyyyyoooooo', '.oyyyyyyyyyyyyo.', '..oyyyywyyyyyo..', '...oyyyyyyyyo...', '...oyyyyyyyyo...', '..oyyyyooyyyyo..', '..oyyyo..oyyyo..', '.oyyo......oyyo.', '.ooo........ooo.', '................', '................', '................'], pal: { o: '#5a3a10', y: '#f8d038', w: '#ffffff' } },
  save: { rows: ['................', '.ooooooooooooo..', '.obbbwwwwwwbbbo.', '.obbbwwwwwwbbbo.', '.obbbwwwwwwbbbo.', '.obbbbbbbbbbbbo.', '.obbbbbbbbbbbbo.', '.obboooooooobbo.', '.obowwwwwwwwobo.', '.obowwwwwwwwobo.', '.obowwwwwwwwobo.', '.ooooooooooooo..', '................', '................', '................', '................'], pal: { o: '#2a2630', b: '#4a6ad0', w: '#f0f0f0' } },
  ball: { rows: ['.....oooooo.....', '...oorrrrrroo...', '..orrrwrrrrrro..', '.orrwwrrrrrrrro.', '.orrrrrrrrrrrro.', 'orrrrrrrrrrrrrro', 'ooooooowwooooooo', 'owwwwwowwowwwwwo', 'owwwwwwoowwwwwwo', '.owwwwwwwwwwwwo.', '.owwwwwwwwwwwwo.', '..owwwwwwwwwwo..', '...oowwwwwwoo...', '.....oooooo.....', '................', '................'], pal: { o: '#2a2630', r: '#e84848', w: '#f4f4f4' } },
  opt: { rows: ['................', '.......oo.......', '...oo.owwo.oo...', '...owoowwoowo...', '....owwwwwwo....', '..oowwwoowwwoo..', '..owwwo..owwwo..', '..owwwo..owwwo..', '..oowwwoowwwoo..', '....owwwwwwo....', '...owoowwoowo...', '...oo.owwo.oo...', '.......oo.......', '................', '................', '................'], pal: { o: '#2a2630', w: '#c8ccd8' } },
};
export function icon(name) { return (ctx, x, y) => { const I = ICONS[name]; if (I) drawGrid(ctx, I.rows, I.pal, x, y); }; }

/** petite sphère colorée (sac, équipe) */
export function ballIcon(ctx, x, y, col = '#e84848', s = 8) {
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    const d = Math.hypot(xx + 0.5 - s / 2, yy + 0.5 - s / 2); if (d > s / 2) continue;
    ctx.fillStyle = d > s / 2 - 1 ? '#2a2630' : yy < s / 2 - 0.5 ? col : yy < s / 2 + 0.5 ? '#2a2630' : '#f4f4f4'; ctx.fillRect(x + xx, y + yy, 1, 1);
  }
}
