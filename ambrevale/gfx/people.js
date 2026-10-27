// Sprites des personnages : planches 3 images × 4 directions (bas, haut, gauche, droite), 16 × 24 px chacune.
import { makeCanvas, shade } from './pixel.js';

export const FW = 16, FH = 24;

// gabarits (O contour, H cheveux, S peau, E yeux, T haut, P bas, B chaussures, A accessoire)
const DOWN = [
  '................',
  '................',
  '.....OOOOOO.....',
  '....OHHHHHHO....',
  '...OHHHHHHHHO...',
  '...OHHHHHHHHO...',
  '..OHHHHHHHHHHO..',
  '..OHHSSSSSSHHO..',
  '..OHSSSSSSSSHO..',
  '..OSSESSSSESSO..',
  '..OSSESSSSESSO..',
  '...OSSSSSSSSO...',
  '....OOSSSSOO....',
  '...OTTTTTTTTO...',
  '..OTTTTTTTTTTO..',
  '..OSTTTTTTTTSO..',
  '..OSOTTTTTTOSO..',
  '...OOTTTTTTOO...',
  '....OPPPPPPO....',
  '....OPPOOPPO....',
  '....OPPOOPPO....',
  '....OBBOOBBO....',
  '....OOOOOOOO....',
  '................',
];
const UP = [
  '................',
  '................',
  '.....OOOOOO.....',
  '....OHHHHHHO....',
  '...OHHHHHHHHO...',
  '...OHHHHHHHHO...',
  '..OHHHHHHHHHHO..',
  '..OHHHHHHHHHHO..',
  '..OHHHHHHHHHHO..',
  '..OHHHHHHHHHHO..',
  '..OhHHHHHHHHhO..',
  '...OhhhhhhhhO...',
  '....OOSSSSOO....',
  '...OTTTTTTTTO...',
  '..OTTTTTTTTTTO..',
  '..OSTTTTTTTTSO..',
  '..OSOTTTTTTOSO..',
  '...OOTTTTTTOO...',
  '....OPPPPPPO....',
  '....OPPOOPPO....',
  '....OPPOOPPO....',
  '....OBBOOBBO....',
  '....OOOOOOOO....',
  '................',
];
const SIDE = [
  '................',
  '................',
  '.....OOOOOO.....',
  '....OHHHHHHO....',
  '...OHHHHHHHHO...',
  '..OHHHHHHHHHO...',
  '..OHHHHHHHHHHO..',
  '..OSSHHHHHHHHO..',
  '.OSSSSHHHHHHHO..',
  '.OSESSSHHHHHHO..',
  '.OSSSSSSHHHHO...',
  '..OSSSSSSSSO....',
  '...OOSSSSOO.....',
  '....OTTTTTO.....',
  '...OTTTTTTTO....',
  '...OTTSSTTTO....',
  '...OTTSSTTTO....',
  '....OTTTTTO.....',
  '....OPPPPPO.....',
  '....OPPPPPO.....',
  '....OPPPPPO.....',
  '....OBBBBBO.....',
  '....OOOOOOO.....',
  '................',
];
const LEGS_DOWN_A = ['....OPPPPPPO....', '....OPPOOPPO....', '....OPPO.OPO....', '....OBBO.OOO....', '....OOOO........'];
const LEGS_DOWN_B = ['....OPPPPPPO....', '....OPPOOPPO....', '....OPO.OPPO....', '....OOO.OBBO....', '........OOOO....'];
const LEGS_SIDE_A = ['....OPPPPPO.....', '...OPPOOPPO.....', '..OPPO..OPPO....', '..OBBO..OBBO....', '..OOOO..OOOO....'];
const LEGS_SIDE_B = ['....OPPPPPO.....', '....OPPPPO......', '....OPPPPO......', '....OBBBBO......', '....OOOOOO......'];

function styleHead(rows, dir, style) {
  const g = rows.map((r) => r.split(''));
  const set = (x, y, c) => { if (g[y] && x >= 0 && x < 16) g[y][x] = c; };
  const get = (x, y) => (g[y] ? g[y][x] : '.');
  if (style === 'cap' || style === 'hat' || style === 'bucket') {
    for (let y = 2; y <= 6; y++) for (let x = 0; x < 16; x++) if (get(x, y) === 'H' || get(x, y) === 'h') set(x, y, 'C');
    if (style === 'cap') {
      if (dir === 'down') { for (let x = 3; x <= 12; x++) set(x, 7, x < 5 || x > 10 ? 'H' : 'c'); for (let x = 2; x <= 13; x++) if (get(x, 6) !== '.') set(x, 6, 'c'); }
      if (dir === 'side') { for (let x = 0; x <= 5; x++) { set(x, 7, x === 0 ? 'O' : 'c'); } set(0, 6, 'O'); }
      set(7, 3, 'W'); set(8, 3, 'W'); if (dir !== 'up') set(7, 4, 'W');
    } else {
      // chapeau à bord large
      for (let x = 1; x <= 14; x++) { set(x, 7, x === 1 || x === 14 ? 'O' : 'c'); set(x, 8, get(x, 8) === '.' ? (x === 1 || x === 14 ? '.' : 'O') : get(x, 8)); }
      if (dir === 'up') for (let x = 2; x <= 13; x++) set(x, 8, 'c');
    }
  } else if (style === 'long' || style === 'bun' || style === 'pony') {
    if (style !== 'bun') {
      const side = (x, y0, y1) => { for (let y = y0; y <= y1; y++) set(x, y, 'H'); };
      if (dir === 'down') { side(2, 8, 13); side(13, 8, 13); for (let y = 8; y <= 14; y++) { set(1, y, 'O'); set(14, y, 'O'); } set(2, 14, 'O'); set(13, 14, 'O'); }
      if (dir === 'up') { for (let y = 12; y <= 15; y++) for (let x = 3; x <= 12; x++) set(x, y, y === 15 ? 'h' : 'H'); for (let y = 12; y <= 15; y++) { set(2, y, 'O'); set(13, y, 'O'); } for (let x = 3; x <= 12; x++) set(x, 16, 'O'); }
      if (dir === 'side') { for (let y = 8; y <= 15; y++) { set(11, y, 'H'); set(12, y, 'H'); set(13, y, 'O'); } set(11, 16, 'O'); set(12, 16, 'O'); }
    } else {
      // chignon
      for (let x = 5; x <= 10; x++) { set(x, 0, 'O'); set(x, 1, 'H'); } set(4, 1, 'O'); set(11, 1, 'O');
    }
  } else if (style === 'spiky') {
    for (const [x, y] of [[4, 1], [7, 0], [10, 1], [2, 3], [13, 3]]) { set(x, y, 'O'); set(x, y + 1, 'H'); }
    if (dir !== 'up') { set(5, 7, 'H'); set(10, 7, 'H'); }
  } else if (style === 'bald') {
    for (let y = 2; y <= 6; y++) for (let x = 0; x < 16; x++) if (get(x, y) === 'H') set(x, y, 'S');
    if (dir === 'down') { for (const x of [3, 12]) for (let y = 6; y <= 8; y++) set(x, y, 'H'); }
    if (dir === 'side') for (let y = 6; y <= 10; y++) for (let x = 8; x <= 12; x++) if (get(x, y) === 'H') set(x, y, 'H');
    if (dir === 'up') for (let y = 7; y <= 11; y++) for (let x = 3; x <= 12; x++) if (get(x, y) === 'H' || get(x, y) === 'h') set(x, y, y > 8 ? 'H' : 'S');
  } else if (style === 'band') {
    for (let x = 2; x <= 13; x++) if (get(x, 6) === 'H') set(x, 6, 'A');
  }
  return g.map((r) => r.join(''));
}

export const LOOKS = {
  hero: { hair: '#4a3020', cap: '#e03c3c', top: '#3c6ae0', pants: '#2c2c48', shoes: '#d84040', style: 'cap', acc: '#f0c040' },
  heroine: { hair: '#6a3a24', cap: '#f4f4f4', top: '#e04a5a', pants: '#3a4a8a', shoes: '#e84a5a', style: 'long' },
  rival: { hair: '#e8a030', top: '#2e2e3e', pants: '#6a5a4a', shoes: '#3a3a3a', style: 'spiky' },
  prof: { hair: '#c8c8c8', top: '#f4f4f4', pants: '#6a6a7a', shoes: '#4a3a3a', style: 'short' },
  mom: { hair: '#7a4a2a', top: '#f08ab0', pants: '#6a5a8a', shoes: '#8a4a4a', style: 'bun' },
  nurse: { hair: '#f08ab0', top: '#ffffff', pants: '#f8c8d8', shoes: '#ffffff', style: 'bun' },
  clerk: { hair: '#3a2a1a', cap: '#3a78d0', top: '#4a8ad0', pants: '#2e3a5a', shoes: '#2a2a2a', style: 'cap' },
  youngster: { hair: '#5a3a1a', cap: '#f0c030', top: '#e8e8e8', pants: '#3a6ac8', shoes: '#c84040', style: 'cap' },
  lass: { hair: '#e07a30', top: '#f07ab0', pants: '#5a7ad0', shoes: '#c84a7a', style: 'long' },
  kid: { hair: '#3a2a1a', top: '#58b050', pants: '#3a3a6a', shoes: '#7a4a2a', style: 'short' },
  bugcatcher: { hair: '#4a3a2a', cap: '#e8d080', top: '#78b048', pants: '#c8a060', shoes: '#6a4a2a', style: 'hat' },
  hiker: { hair: '#4a2a1a', cap: '#8a6a3a', top: '#e08030', pants: '#6a5038', shoes: '#4a3020', style: 'hat' },
  fisher: { hair: '#5a4a3a', cap: '#c8b070', top: '#7a8a4a', pants: '#4a4a6a', shoes: '#3a3a3a', style: 'bucket' },
  swimmer: { hair: '#2a2a4a', top: '#3a8ae0', pants: '#3a8ae0', shoes: '#f8d0a8', style: 'short', skinTop: true },
  sailor: { hair: '#2a2a2a', cap: '#f4f4f4', top: '#f4f4f4', pants: '#2c3a6a', shoes: '#2a2a2a', style: 'cap', stripes: '#3a5ab0' },
  karate: { hair: '#1a1a1a', top: '#f4f4ec', pants: '#f4f4ec', shoes: '#f8d0a8', style: 'band', acc: '#d03030' },
  scientist: { hair: '#5a4a3a', top: '#f2f2f2', pants: '#4a5a6a', shoes: '#3a3a3a', style: 'short', glasses: true },
  oldman: { hair: '#d8d8d8', top: '#8a6a4a', pants: '#5a5a5a', shoes: '#3a2a2a', style: 'bald' },
  oldwoman: { hair: '#d8d8e0', top: '#8a5aa0', pants: '#5a4a6a', shoes: '#3a2a3a', style: 'bun' },
  guard: { hair: '#2a2a2a', cap: '#2c3a6a', top: '#3a4a7a', pants: '#2a2a3a', shoes: '#1a1a1a', style: 'cap' },
  ace: { hair: '#3a9a9a', top: '#2a7a8a', pants: '#2a2a3a', shoes: '#3a3a3a', style: 'spiky' },
  acef: { hair: '#4aa060', top: '#2a7a8a', pants: '#f2f2f2', shoes: '#3a3a3a', style: 'long' },
  // champions d'arène
  bastien: { hair: '#5a3a20', cap: '#8a7a6a', top: '#a07850', pants: '#5a4a3a', shoes: '#3a2a1a', style: 'hat' },
  iris: { hair: '#4aa048', top: '#78c058', pants: '#c8a060', shoes: '#6a4a2a', style: 'long', acc: '#ff8ab0' },
  morgane: { hair: '#7a4aa0', top: '#3a2a4a', pants: '#2a1a3a', shoes: '#1a1a2a', style: 'long' },
  lionel: { hair: '#f0d030', top: '#f08030', pants: '#3a3a4a', shoes: '#2a2a2a', style: 'spiky', glasses: true },
  maelle: { hair: '#3a6ae0', top: '#4a9ae0', pants: '#f2f2f2', shoes: '#3a6ae0', style: 'pony' },
  aldo: { hair: '#3a2a2a', top: '#c84030', pants: '#4a3a3a', shoes: '#2a1a1a', style: 'bald', acc: '#f0c040' },
  solene: { hair: '#e8f4ff', top: '#8ac8f0', pants: '#f2f8ff', shoes: '#8ac8f0', style: 'long' },
  valere: { hair: '#4a2a6a', top: '#5a3a8a', pants: '#2a2a3a', shoes: '#1a1a1a', style: 'spiky', cape: '#2a1a3a' },
  celian: { hair: '#c8d0e0', top: '#2a2a3a', pants: '#2a2a3a', shoes: '#1a1a1a', style: 'short', cape: '#c84040' },
};

function palette(L) {
  const skin = L.skin || '#f8d0a8';
  return {
    O: '#28202c', H: L.hair, h: shade(L.hair, -0.25), S: skin, E: '#28202c', W: '#ffffff',
    T: L.top, t: shade(L.top, -0.2), P: L.pants, B: L.shoes, C: L.cap || L.hair, c: shade(L.cap || L.hair, -0.3), A: L.acc || L.top,
  };
}

function paintFrame(ctx, rows, pal, ox, oy, flip, L, dir, bob) {
  for (let y = 0; y < FH; y++) {
    const r = rows[y];
    for (let x = 0; x < FW; x++) {
      let k = r[x]; if (k === '.') continue;
      let col = pal[k];
      // ombrage simple : côté droit du haut un peu plus sombre
      if (k === 'T' && x >= (dir === 'side' ? 8 : 10)) col = pal.t;
      if (k === 'T' && L.stripes && y % 2 === 0) col = L.stripes;
      if (k === 'T' && L.skinTop && y < 15) col = pal.S;
      if (k === 'T' && L.cape && (x <= 3 || x >= 12)) col = L.cape;
      if (k === 'S' && y >= 8 && y <= 11 && (x === 3 || x === 12) && dir === 'down') col = shade(pal.S, -0.12);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + (flip ? FW - 1 - x : x), oy + y + bob, 1, 1);
    }
  }
  if (L.glasses && dir !== 'up') {
    ctx.fillStyle = '#28202c';
    if (dir === 'down') { ctx.fillRect(ox + 4, oy + 9 + bob, 3, 1); ctx.fillRect(ox + 9, oy + 9 + bob, 3, 1); ctx.fillRect(ox + 7, oy + 9 + bob, 2, 1); }
    else ctx.fillRect(ox + (flip ? FW - 1 - 1 : 1), oy + 9 + bob, 3, 1);
  }
}

const SHEETS = new Map();
/** planche du personnage : colonnes = images (arrêt, pas A, pas B), lignes = bas, haut, gauche, droite */
export function personSheet(look) {
  if (SHEETS.has(look)) return SHEETS.get(look);
  const L = LOOKS[look] || LOOKS.youngster, pal = palette(L);
  const { c, ctx } = makeCanvas(FW * 3, FH * 4);
  const style = L.style || 'short';
  const heads = { down: styleHead(DOWN, 'down', style), up: styleHead(UP, 'up', style), side: styleHead(SIDE, 'side', style) };
  const withLegs = (base, legs) => base.slice(0, 18).concat(legs, base.slice(23));
  const frames = {
    down: [heads.down, withLegs(heads.down, LEGS_DOWN_A), withLegs(heads.down, LEGS_DOWN_B)],
    up: [heads.up, withLegs(heads.up, LEGS_DOWN_B), withLegs(heads.up, LEGS_DOWN_A)],
    side: [heads.side, withLegs(heads.side, LEGS_SIDE_A), withLegs(heads.side, LEGS_SIDE_B)],
  };
  const order = [['down', false], ['up', false], ['side', false], ['side', true]];
  order.forEach(([d, flip], row) => frames[d].forEach((rows, col) => paintFrame(ctx, rows, pal, col * FW, row * FH, flip, L, d, col === 0 ? 0 : -1 * 0)));
  SHEETS.set(look, c);
  return c;
}

/** portrait 32 × 32 (tête agrandie) pour les dialogues et l'écran du bas */
export function personIcon(look) {
  const sheet = personSheet(look);
  const { c, ctx } = makeCanvas(FW, FH);
  ctx.drawImage(sheet, 0, 0, FW, FH, 0, 0, FW, FH);
  return c;
}

export const DIRS = { down: 0, up: 1, left: 2, right: 3 };
