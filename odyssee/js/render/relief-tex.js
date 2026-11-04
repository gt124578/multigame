// odyssee/js/render/relief-tex.js — pixel art du relief du dehors, dessiné au chargement (32 px par case, lumière en
// haut à gauche, palette fixe) : lèvre d'herbe en haut des falaises, pied d'ombre, rebords des plateaux, marches taillées
// dans la roche, roche ocre des canyons et du désert, tourbillons de la mer (8 images).
// Appelé par buildAtlas / buildAnimAtlas de textures.js ; la roche des parois vient de relief.png (biomes).

const C = 32;
const mk = () => { const c = document.createElement('canvas'); c.width = C; c.height = C; return c; };
function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
/** toile de 32 × 32 et un pinceau pixel par pixel */
function toile(draw) {
  const c = mk(), x = c.getContext('2d'), im = x.createImageData(C, C), d = im.data;
  const p = (i, j, col) => { if (i < 0 || j < 0 || i >= C || j >= C || !col) return; const [r, g, b] = rgb(col), k = (j * C + i) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; };
  draw(p);
  x.putImageData(im, 0, 0);
  return c;
}

// roches des rebords, par biome (du plus sombre au plus clair)
export const ROCHES = {
  montagne: ['#2e2b27', '#4a4640', '#67615a', '#857e74', '#a39b8e', '#c4bcae'],
  terre: ['#33241a', '#56402e', '#76583f', '#957252', '#b38f6b', '#cfb08a'],
  ocre: ['#3e1c10', '#6a321c', '#8e4626', '#ae5e34', '#c87c4a', '#e0a06c'],
  glace: ['#3c4a5a', '#5c7088', '#7c94ac', '#a0b8cc', '#c4d8e6', '#e4f0f8'],
  magma: ['#24140f', '#3e231b', '#583226', '#724335', '#8c5646', '#a8705e'],
  mer: ['#232b33', '#36434c', '#4b5964', '#5f707c', '#788a95', '#96a8b2'],
  lune: ['#2a2632', '#423c4e', '#5a526a', '#746a86', '#8e84a0', '#aca2bc'],
};
// lèvres : herbe, herbe de forêt, neige, cendre, sable
const LEVRES = {
  herbe: ['#1f5a2e', '#2c7236', '#3d8c3c', '#52a446', '#6cbb52', '#8ad064'],
  foret: ['#163f28', '#1f5a2e', '#2c7236', '#3d8c3c', '#52a446', '#6cbb52'],
  neige: ['#6f84a0', '#8fa4c0', '#b2c2d8', '#ccd8e8', '#e2eaf4', '#f8fbff'],
  cendre: ['#2e2a28', '#3e3a38', '#58524e', '#6f6863', '#857e78', '#9c958f'],
  sable: ['#8c6e40', '#b09460', '#c4a868', '#dcc488', '#ecd8a2', '#f8ecc4'],
};
const PIERRE = ['#3a352e', '#5a544a', '#7c7466', '#9c9484', '#bcb4a2', '#d8d2c2'];

/** lèvre en haut d'une paroi : le bord du plateau déborde un peu, brins qui pendent, ombre portée dessous */
function levre(pal, seed) {
  return toile((p) => {
    for (let i = 0; i < C; i++) {
      const bas = 5 + Math.floor(hash(i >> 1, 0, seed) * 3) + (hash(i, 1, seed) < 0.18 ? 2 : 0);
      for (let j = 0; j <= bas; j++) {
        const k = j === bas ? 0 : j === bas - 1 ? 1 : j < 2 ? 4 : hash(i, j, seed + 3) < 0.25 ? 5 : 3;
        p(i, j, pal[k]);
      }
      // ombre de la lèvre sur la roche (tramée)
      for (let j = bas + 1; j <= bas + 3; j++) if (((i + j) & 1) === 0 || j === bas + 1) p(i, j, '#1c1a18');
    }
  });
}
/** pied de la paroi : ombre tramée sur le sol du dessous */
function pied() {
  return toile((p) => {
    for (let i = 0; i < C; i++) for (let j = 0; j < 7; j++) {
      const t = j / 7, on = j < 2 || (j < 4 && ((i + j) & 1) === 0) || (j >= 4 && ((i & 1) === 0 && (j & 1) === 0) && hash(i, j, 9) > t);
      if (on) p(i, j, j < 2 ? '#1a1e14' : '#26301c');
    }
  });
}
/** rebord d'un plateau vu d'en haut (côté est, ouest ou nord) : arête de roche, liseré sombre vers l'extérieur */
function bord(cote, R, seed) {
  return toile((p) => {
    for (let a = 0; a < C; a++) {
      const w = 5 + Math.floor(hash(a >> 2, 0, seed) * 2);
      for (let b = 0; b < w; b++) {
        // b = 0 : bord extérieur
        const k = b === 0 ? 0 : b === 1 ? 1 : b === w - 1 ? 5 : hash(a, b, seed + 1) < 0.3 ? 2 : b === w - 2 ? 4 : 3;
        if (cote === 'e') p(C - 1 - b, a, R[k]);
        else if (cote === 'w') p(b, a, R[k]);
        else p(a, b, R[k]);
      }
    }
  });
}
/** bout d'une paroi (sa fin à l'est ou à l'ouest) : la roche tourne, plus sombre */
function bout(cote, R) {
  return toile((p) => {
    for (let j = 0; j < C; j++) for (let b = 0; b < 4; b++) p(cote === 'e' ? C - 1 - b : b, j, R[b === 0 ? 0 : b === 1 ? 1 : 2]);
  });
}
/** marches taillées dans la roche : 's' dans la paroi (on descend vers le bas de l'écran), 'n' sur le rebord nord,
 *  'e' / 'w' sur un rebord de côté ; joues de roche de part et d'autre */
function marches(dir, R) {
  return toile((p) => {
    for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) {
      const [u, v] = dir === 's' || dir === 'n' ? [i, j] : [j, i];   // u : en travers des marches, v : le long de la pente
      const vv = dir === 'n' || dir === 'w' ? C - 1 - v : v;
      let col;
      if (u < 4 || u > C - 5) col = R[u === 0 || u === C - 1 ? 0 : u < 2 || u > C - 3 ? 1 : 3];
      else {
        const s = vv % 8;   // une marche fait 8 px : plat clair, nez lumineux, contremarche sombre
        col = s === 0 ? PIERRE[5] : s < 5 ? PIERRE[hash(i >> 1, (j >> 3), 5) < 0.3 ? 3 : 4] : s < 7 ? PIERRE[2] : PIERRE[1];
        if (u === 4 || u === C - 5) col = PIERRE[1];
      }
      p(i, j, col);
    }
  });
}
/** une image du tourbillon (f sur 8) : spirale d'écume qui tourne, œil sombre au centre ; fond transparent */
export function tourbillon(f) {
  const c = mk(), x = c.getContext('2d'), im = x.createImageData(C, C), d = im.data;
  const put = (i, j, col) => { if (i < 0 || j < 0 || i >= C || j >= C) return; const [r, g, b] = rgb(col), k = (j * C + i) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; };
  const a0 = f * Math.PI / 4;
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    const dx = i - 15.5, dy = (j - 15.5) * 1.25, r = Math.hypot(dx, dy); if (r > 15) continue;
    const th = Math.atan2(dy, dx);
    // deux bras en spirale logarithmique
    const ph = ((th - a0 - Math.log(r + 1) * 2.6) % Math.PI + Math.PI) % Math.PI;
    if (r < 2.2) put(i, j, '#12306e');
    else if (r < 4) put(i, j, ph < 1.2 ? '#1e4a9c' : '#173f94');
    else if (ph < 0.35) put(i, j, r > 12 ? '#9ad6f4' : '#e6f6ff');
    else if (ph < 0.7) put(i, j, '#6cb8ee');
    else if (ph > 2.6 && r < 11) put(i, j, '#2862be');
  }
  x.putImageData(im, 0, 0);
  return c;
}
/** une image des carpes koï (f sur 8) : deux poissons qui tournent lentement dans l'eau, fond transparent */
export function koi(f) {
  const c = mk(), x = c.getContext('2d'), im = x.createImageData(C, C), d = im.data;
  const put = (i, j, col) => { i = Math.round(i); j = Math.round(j); if (i < 0 || j < 0 || i >= C || j >= C) return; const [r, g, b] = rgb(col), k = (j * C + i) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; };
  const poissons = [[0, ['#f07020', '#fff4e8', '#c84010']], [Math.PI, ['#fff4e8', '#e83020', '#c8c0b0']]];
  for (const [ph, [a, b, o]] of poissons) {
    const t = f * Math.PI / 4 * 0.5 + ph, cx = 16 + Math.cos(t) * 8, cy = 16 + Math.sin(t) * 6;
    const dx = -Math.sin(t), dy = Math.cos(t) * 0.75, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
    // corps (tête vers l'avant), taches, nageoire caudale qui ondule
    for (let k = -4; k <= 4; k++) {
      const px = cx + ux * k, py = cy + uy * k, w = k > 2 ? 1 : k < -2 ? 0.6 : 1.4;
      for (let s2 = -w; s2 <= w; s2 += 0.5) put(px - uy * s2, py + ux * s2, (k + 7) % 3 === 0 ? b : a);
    }
    put(cx + ux * 4, cy + uy * 4, o);
    const q = ((f & 1) ? 1 : -1);
    put(cx - ux * 6 - uy * q, cy - uy * 6 + ux * q, a); put(cx - ux * 6 + uy * q * 2, cy - uy * 6 - ux * q * 2, a);
  }
  x.putImageData(im, 0, 0);
  return c;
}
/** planches du pont rouge (vu d'en haut, est-ouest) : garde-corps vermillon en haut et en bas */
function pontRouge() {
  return toile((p) => {
    for (let i = 0; i < C; i++) {
      const poteau = i % 10 === 4 || i % 10 === 5;
      // garde-corps du haut (vu de dessus : main courante claire, ombre dessous) et du bas (face vermillon)
      for (let j = 0; j < 5; j++) p(i, j, poteau ? (j < 4 ? '#7a1408' : '#3a0c04') : j === 0 ? '#3a0c04' : j === 1 ? '#f05a3a' : j < 4 ? '#c8301e' : '#4a2410');
      for (let j = C - 7; j < C; j++) p(i, j, poteau ? (j === C - 7 ? '#f05a3a' : '#8a1a0c') : j === C - 7 ? '#3a0c04' : j === C - 6 ? '#f05a3a' : j < C - 2 ? '#c8301e' : j === C - 2 ? '#8a1a0c' : '#2a0802');
    }
  });
}
/** copie recolorée d'une case de roche (terre → ocre des canyons) */
function ocre(src) {
  const c = mk(), x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, C, C), d = im.data;
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3]) continue;
    const l = (d[k] * 0.3 + d[k + 1] * 0.55 + d[k + 2] * 0.15) / 255;
    // rampe ocre : brun-rouge sombre → orangé clair
    d[k] = Math.min(255, 40 + l * 250); d[k + 1] = Math.min(255, 14 + l * 150); d[k + 2] = Math.min(255, 6 + l * 92);
  }
  x.putImageData(im, 0, 0);
  return c;
}

/** ajoute à l'atlas des sols les pièces du relief du dehors */
export function texturesRelief(putImg, img) {
  // roche ocre (canyons, désert) : copie recolorée de la roche brune de relief.png
  for (const k of Object.keys(img)) { const m = /^r(.)_terre_(.+)$/.exec(k); if (m) putImg(`r${m[1]}_ocre_${m[2]}`, ocre(img[k])); }
  Object.entries(LEVRES).forEach(([k, pal], i) => { for (let v = 0; v < 2; v++) putImg(`fal_levre_${k}_${v}`, levre(pal, 31 + i * 7 + v * 101)); });
  putImg('fal_pied', pied());
  putImg('pont_rouge', pontRouge());
  for (const [bio, R] of Object.entries(ROCHES)) {
    for (const c of ['e', 'w', 'n']) putImg(`fal_bord_${c}_${bio}`, bord(c, R, c.charCodeAt(0)));
    for (const c of ['e', 'w']) putImg(`fal_bout_${c}_${bio}`, bout(c, R));
    for (const d of ['s', 'n', 'e', 'w']) putImg(`marches_${d}_${bio}`, marches(d, R));
  }
}
