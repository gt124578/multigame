// odyssee/js/render/serre-tex.js — pixel art de l'Arène de Sylvebourg (la Grande Serre, world/arene-sylve.js), dessiné au
// chargement à 32 px par case, lumière en haut à gauche. Palette : vert tendre, blanc, ambre.
//   tuiles (atlas du décor) : sol de la serre, mur de verre, dalles d'alvéoles du bassin, stèles-alvéoles,
//     dalles-interrupteurs (une par sens de souffle), estrade et tapis du dôme
//   sprites : bloc de pollen, bordure du bassin, fleur géante, massif de fleurs, soufflerie, portail de lianes, pupitre
// Appelé par buildAtlas et buildSprites de textures.js.

const rgba = (h) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255];
};
/** toile w × h et ses pinceaux (couleurs '#rrggbb' ou '#rrggbbaa') */
function toile(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data;
  const p = (i, j, col) => {
    i = Math.round(i); j = Math.round(j);
    if (i < 0 || j < 0 || i >= w || j >= h || !col) return;
    const [r, g, b, a] = rgba(col), k = (j * w + i) * 4;
    if (a >= 255 || !d[k + 3]) { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a; return; }
    const t = a / 255; d[k] = d[k] * (1 - t) + r * t; d[k + 1] = d[k + 1] * (1 - t) + g * t; d[k + 2] = d[k + 2] * (1 - t) + b * t; d[k + 3] = Math.max(d[k + 3], a);
  };
  const rect = (x0, y0, ww, hh, col) => { for (let j = y0; j < y0 + hh; j++) for (let i = x0; i < x0 + ww; i++) p(i, j, col); };
  const disque = (cx, cy, rx, ry, col, f) => {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
      const q = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2;
      if (q <= 1) p(i, j, f ? f(i, j, q) : col);
    }
  };
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  draw({ p, rect, disque, rnd, w, h });
  x.putImageData(im, 0, 0);
  return c;
}
/** hexagone (pointe en haut) de « rayon » r autour de (cx, cy) : contour et intérieur */
function hexa(T, cx, cy, r, bord, dedans) {
  const inHex = (i, j) => { const dx = Math.abs(i - cx), dy = Math.abs(j - cy); return dy <= r && dx <= r * 0.87 && dx * 0.577 + dy <= r; };
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
    if (!inHex(i, j)) continue;
    const edge = !inHex(i - 1, j) || !inHex(i + 1, j) || !inHex(i, j - 1) || !inHex(i, j + 1);
    T.p(i, j, edge ? bord : dedans);
  }
}

/* ------------------------------------------------------------------ tuiles (32 × 32) */
export function texturesSerre(putImg) {
  // sol : grands carreaux clairs vert d'eau, joints blancs, quelques reflets
  putImg('floor_serre', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#dcefd2');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const u = i % 16, v = j % 16;
      if (u === 0 || v === 0) T.p(i, j, '#f8fff2');
      else if (u === 15 || v === 15) T.p(i, j, '#c4e0b8');
      else if ((u + v) % 7 === 0 && T.rnd() < 0.25) T.p(i, j, '#e8f6e0');
    }
    for (let k = 0; k < 10; k++) T.p(1 + Math.floor(T.rnd() * 30), 1 + Math.floor(T.rnd() * 30), '#cfe6c4');
  }));
  // mur : grandes vitres vert pâle, montants blancs, soubassement vert, une liane qui pend
  putImg('wall_serre', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) T.p(i, j, j < 26 ? (i + j) % 11 < 2 ? '#e2f6ec' : '#c6e8d8' : '#8cc08c');
    T.rect(0, 0, 32, 2, '#ffffff'); T.rect(0, 12, 32, 1, '#ffffff'); T.rect(0, 25, 32, 1, '#ffffff'); T.rect(0, 26, 32, 1, '#a8d4a0');
    T.rect(0, 31, 32, 1, '#6a9a6a');
    for (const x of [0, 15, 16]) T.rect(x, 0, 1, 26, '#ffffff');
    T.rect(31, 0, 1, 26, '#b4d8c4');
    // liane
    for (let j = 0; j < 20; j++) { const x = 7 + Math.round(Math.sin(j * 0.45) * 1.5); T.p(x, j, '#3e8a46'); if (j % 4 === 1) { T.p(x + 1, j, '#62b45a'); T.p(x + 2, j + 1, '#62b45a'); } if (j % 4 === 3) { T.p(x - 1, j, '#62b45a'); T.p(x - 2, j + 1, '#4e9e4c'); } }
    for (let j = 0; j < 9; j++) { const x = 24 + Math.round(Math.sin(j * 0.6) * 1); T.p(x, j, '#3e8a46'); if (j % 3 === 2) T.p(x + 1, j, '#62b45a'); }
  }));
  // dalles d'alvéoles du bassin (décalque posé sur le sol)
  putImg('dec_pollen', toile(32, 32, (T) => {
    const pts = [[8, 8], [24, 8], [0, 22], [16, 22], [32, 22], [8, 36], [24, 36], [8, -6], [24, -6]];
    for (const [cx, cy] of pts) hexa(T, cx, cy, 8, '#e3a83a', '#f7d77acc');
    for (const [cx, cy] of pts) { T.p(cx - 3, cy - 4, '#fff4c4'); T.p(cx - 2, cy - 4, '#fff4c4'); }
  }));
  // stèle-alvéole : une grande alvéole creuse cerclée de pierre blanche
  putImg('dec_alveole', toile(32, 32, (T) => {
    T.disque(16, 16, 15, 15, null, (i, j, q) => (q > 0.82 ? '#9a9c8e' : q > 0.7 ? '#f2f2e8' : '#ffffff'));
    hexa(T, 16, 16, 11, '#a86a10', '#5a3a10');
    hexa(T, 16, 17, 7, '#7a4a10', '#3a2408');
    T.p(11, 10, '#ffd860'); T.p(12, 10, '#ffd860'); T.p(21, 22, '#ffb030');
  }));
  // dalles-interrupteurs : pavé ambre en relief, flèche blanche dans le sens du souffle
  const fl = { up: (i, j) => [i, j], right: (i, j) => [31 - j, i], down: (i, j) => [31 - i, 31 - j], left: (i, j) => [j, 31 - i] };
  for (const [dir, f] of Object.entries(fl)) putImg('dec_interrupteur_' + dir, toile(32, 32, (T) => {
    const P = (i, j, c) => { const [a, b] = f(i, j); T.p(a, b, c); };
    for (let j = 3; j < 29; j++) for (let i = 3; i < 29; i++) P(i, j, i === 3 || j === 3 ? '#ffe9a0' : i === 28 || j === 28 ? '#a8701c' : '#f0b83c');
    for (let j = 5; j < 27; j++) for (let i = 5; i < 27; i++) if (i === 5 || j === 5 || i === 26 || j === 26) P(i, j, '#d89a2c');
    // flèche (vers le haut avant rotation)
    for (let j = 8; j < 16; j++) { const h = j - 8; for (let i = 16 - h; i < 16 + h; i++) P(i, j, '#ffffff'); P(16 - h - 1, j, '#b07a20'); P(16 + h, j, '#b07a20'); }
    for (let j = 16; j < 24; j++) for (let i = 13; i < 19; i++) P(i, j, i === 18 ? '#e0e0e0' : '#ffffff');
    for (let i = 13; i < 19; i++) P(i, 24, '#b07a20');
  }));
  // estrade du Champion : dalles blanches à liseré vert
  putImg('dec_estrade', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#f6f8ee');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#d8e4c8');
    for (let i = 0; i < 32; i++) { T.p(i, 30, '#a8cc90'); T.p(i, 31, '#86b070'); }
    T.p(4, 4, '#ffffff'); T.p(20, 20, '#ffffff');
  }));
  // tapis vert à bordure ambre
  putImg('dec_tapis', toile(32, 32, (T) => {
    T.rect(3, 0, 26, 32, '#4ea25a'); T.rect(3, 0, 2, 32, '#e8b448'); T.rect(27, 0, 2, 32, '#e8b448');
    T.rect(5, 0, 1, 32, '#2e7a3e'); T.rect(26, 0, 1, 32, '#2e7a3e');
    for (let j = 2; j < 32; j += 8) { T.p(16, j, '#f6d878'); T.p(15, j + 1, '#f6d878'); T.p(17, j + 1, '#f6d878'); T.p(16, j + 2, '#f6d878'); }
  }));
}

/* ------------------------------------------------------------------ sprites (32 px par case : densité 2) */
const SPRITES = {
  // bloc de pollen : cube arrondi ambre, duvet et motif d'alvéoles
  bloc_pollen: [32, 32, (T) => {
    T.disque(16, 18, 14, 13, null, (i, j, q) => (q > 0.86 ? '#8a5410' : j < 12 && i < 16 ? '#ffd860' : j > 24 ? '#d08a1c' : '#f2b234'));
    // motif d'alvéoles, seulement sur le bloc
    const sur = (i, j) => ((i - 16) / 13) ** 2 + ((j - 18) / 12) ** 2 <= 0.8;
    const Tm = { p: (i, j, c) => { if (sur(i, j)) T.p(i, j, c); } };
    for (const [cx, cy] of [[11, 15], [20, 15], [15.5, 22], [24.5, 22], [6.5, 22], [15.5, 8]]) hexa(Tm, cx, cy, 4, '#c27e18', null);
    for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2; T.p(16 + Math.cos(a) * 14.6, 18 + Math.sin(a) * 13.6, k % 2 ? '#f6c450' : '#7a4a10'); }
    T.p(9, 9, '#fff6c8'); T.p(10, 9, '#fff6c8'); T.p(9, 10, '#fff6c8'); T.p(13, 8, '#fff6c8');
  }],
  // bordure du bassin : jardinière blanche vitrée, haie taillée dessus
  jardiniere: [32, 28, (T) => {
    T.rect(1, 12, 30, 15, '#f4faf2'); T.rect(1, 26, 30, 2, '#9ab89a');
    T.rect(3, 15, 12, 9, '#cde9da'); T.rect(17, 15, 12, 9, '#cde9da'); T.rect(3, 15, 12, 1, '#ffffff'); T.rect(17, 15, 12, 1, '#ffffff');
    T.rect(1, 12, 1, 15, '#c8dcc8'); T.rect(30, 12, 1, 15, '#b0c8b0');
    T.disque(16, 9, 15, 7, null, (i, j, q) => (q > 0.85 ? '#2e7a3e' : j < 6 ? '#8ad070' : (i + j) % 5 === 0 ? '#3e8e48' : '#5aae58'));
    for (const [x, y] of [[8, 5], [22, 4], [15, 7]]) T.p(x, y, '#ffffff');
  }],
  // fleur géante : grosse corolle blanche au cœur ambre sur une tige épaisse
  fleur_geante: [32, 46, (T) => {
    T.rect(15, 24, 3, 22, '#3e8a46'); T.rect(15, 24, 1, 22, '#62b45a');
    T.disque(9, 36, 7, 3, null, (i, j, q) => (q > 0.7 ? '#2e7a3e' : '#5aae58')); T.disque(23, 32, 7, 3, null, (i, j, q) => (q > 0.7 ? '#2e7a3e' : '#5aae58'));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 - 1.2;
      T.disque(16 + Math.cos(a) * 8.5, 14 + Math.sin(a) * 7.5, 6, 5.5, null, (i, j, q) => (q > 0.8 ? '#b8ccb0' : j < 12 ? '#ffffff' : '#eef6e6'));
    }
    T.disque(16, 14, 5.5, 5, null, (i, j, q) => (q > 0.75 ? '#b06a10' : j < 13 ? '#ffd860' : '#f0a830'));
    T.p(14, 12, '#fff6c8'); T.p(15, 11, '#fff6c8');
  }],
  // massif de fleurs : buisson rond semé de fleurs blanches, ambre et roses
  massif: [32, 30, (T) => {
    T.disque(16, 17, 15, 12, null, (i, j, q) => (q > 0.86 ? '#2a6a36' : j < 11 ? '#7cc86a' : (i * 3 + j) % 7 === 0 ? '#3a8a44' : '#52a854'));
    const cols = ['#ffffff', '#f6c040', '#f6a0c0', '#ffffff', '#f6c040'];
    for (let k = 0; k < 9; k++) {
      const x = 5 + ((k * 37) % 22), y = 9 + ((k * 23) % 13), c = cols[k % 5];
      T.p(x, y, c); T.p(x + 1, y, c); T.p(x, y + 1, c); T.p(x + 1, y + 1, c); T.p(x - 1, y, c); T.p(x + 2, y + 1, c); T.p(x, y - 1, c);
      T.p(x + 1, y + 2, '#2e7a3e');
    }
  }],
  // soufflerie : hélice dans un cadre rond blanc, socle vert
  soufflerie: [32, 36, (T) => {
    T.rect(6, 26, 20, 10, '#5a9a62'); T.rect(6, 26, 20, 2, '#86c08a'); T.rect(6, 34, 20, 2, '#3a6e44');
    T.rect(14, 22, 4, 5, '#d8e4d8');
    T.disque(16, 13, 13, 12, null, (i, j, q) => (q > 0.78 ? (j < 10 ? '#ffffff' : '#c8d8cc') : q > 0.66 ? '#9ab0a0' : '#2e4a3a'));
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + 0.4;
      for (let r = 2; r < 9; r++) for (let w = -0.28; w <= 0.28; w += 0.07) {
        const a = a0 + w + r * 0.06; T.p(16 + Math.cos(a) * r, 13 + Math.sin(a) * r * 0.92, r > 6 ? '#c8d8d0' : '#eef6f0');
      }
    }
    T.disque(16, 13, 2.5, 2.5, '#f0b030'); T.p(15, 12, '#fff2b0');
    for (let j = 6; j < 21; j += 3) { T.p(3, j, '#e8f4ff'); T.p(29, j, '#e8f4ff'); }
  }],
  // portail de lianes : rideau de lianes feuillues qui ferme le dôme
  lianes: [32, 42, (T) => {
    T.rect(0, 0, 32, 3, '#2e5a34');
    for (let s = 0; s < 8; s++) {
      const x0 = 2 + s * 4, len = 36 + ((s * 7) % 6);
      for (let j = 2; j < len; j++) {
        const x = x0 + Math.round(Math.sin(j * 0.35 + s) * 1.2);
        T.p(x, j, s % 2 ? '#2e7a3e' : '#3e8a46');
        if ((j + s * 3) % 6 === 0) { T.p(x + 1, j, '#7cc86a'); T.p(x + 2, j - 1, '#62b45a'); T.p(x + 1, j + 1, '#4e9e4c'); }
        if ((j + s * 5) % 9 === 0) { T.p(x - 1, j, '#7cc86a'); T.p(x - 2, j + 1, '#62b45a'); }
      }
      if (s % 3 === 1) { T.p(x0, len, '#f6c040'); T.p(x0 + 1, len, '#f6c040'); T.p(x0, len + 1, '#ffffff'); }
    }
  }],
  // stèle de la serre : pilier de pierre blanche coiffé d'un cristal d'ambre (éteint / allumé quand son alvéole est pleine)
  stele_serre: [24, 46, (T) => stele(T, false)],
  stele_serre_on: [24, 46, (T) => stele(T, true)],
  // pupitre de la serre : borne blanche, écran vert, gros bouton ambre
  pupitre: [32, 36, (T) => {
    T.rect(12, 18, 8, 16, '#e8f0e8'); T.rect(12, 18, 2, 16, '#ffffff'); T.rect(18, 18, 2, 16, '#c0d0c0');
    T.rect(8, 33, 16, 3, '#7a9a80');
    T.rect(4, 6, 24, 13, '#f6faf4'); T.rect(4, 6, 24, 1, '#ffffff'); T.rect(4, 18, 24, 1, '#a8bca8'); T.rect(4, 6, 1, 13, '#ffffff'); T.rect(27, 6, 1, 13, '#b8c8b8');
    T.rect(7, 8, 12, 8, '#2e6a3e'); T.rect(8, 9, 10, 6, '#58b06a'); T.p(9, 10, '#c8f0c0'); T.p(10, 10, '#c8f0c0');
    T.disque(23, 12, 2.6, 2.6, '#e89a20'); T.p(22, 11, '#ffe090');
  }],
};
function stele(T, on) {
  if (on) T.disque(12, 9, 11.5, 10, null, (i, j, q) => (q > 0.6 ? '#fff4b040' : '#ffe68080'));
  T.rect(5, 18, 14, 26, '#eef2e8'); T.rect(5, 18, 3, 26, '#ffffff'); T.rect(16, 18, 3, 26, '#c4ccbc');
  T.rect(3, 42, 18, 4, '#a8b4a0'); T.rect(3, 42, 18, 1, '#d8e0d0');
  for (let j = 22; j < 40; j += 6) T.rect(8, j, 8, 1, '#d0d8c8');
  T.rect(4, 16, 16, 3, '#d8e0d0'); T.rect(4, 16, 16, 1, '#ffffff');
  hexa(T, 12, 9, 7, on ? '#c87a10' : '#8a6a3a', on ? '#ffd040' : '#b89a68');
  hexa(T, 12, 9, 4, on ? '#ffe680' : '#a88a58', on ? '#fff8d0' : '#c8ac78');
  if (on) { T.p(12, 1, '#ffffff'); T.p(3, 9, '#ffffff'); T.p(21, 9, '#ffffff'); T.p(12, 17, '#fff4b0'); }
}
/** pose les sprites de la serre dans la planche des sprites (zone du code, au-dessus des images) ; add(k, x, y, w, h) */
export function spritesSerre(ctx, add, x0 = 480, y0 = 0) {
  let x = x0;
  for (const [k, [w, h, draw]] of Object.entries(SPRITES)) {
    ctx.drawImage(toile(w, h, draw), x, y0);
    add(k, x, y0, w, h, 2);
    x += w + 2;
  }
}
