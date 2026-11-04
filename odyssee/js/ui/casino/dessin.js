// odyssee/js/ui/casino/dessin.js — le matériel du Casino en pixel art : cartes (coins, couleurs, figures), dos de
// cartes, jetons empilés, tables de feutre, moquette, personnages assis (planche des dresseurs), symboles des rouleaux.
import { texte, largeur, rect, pave, ellipse, toile } from '../pixel.js';
import { ASSETS, loadImg } from '../../assets.js';
import { SPRITES } from '../../data/sprites.js';

/* ---------------- cartes ---------------- */
const bm = (s) => s.split('|');
const COUL7 = {
  '♠': bm('...#...|..###..|.#####.|#######|#######|#.#.#.#|..###..'),
  '♥': bm('.##.##.|#######|#######|#######|.#####.|..###..|...#...'),
  '♦': bm('...#...|..###..|.#####.|#######|.#####.|..###..|...#...'),
  '♣': bm('..###..|..###..|##.#.##|#######|##.#.##|...#...|..###..'),
};
const COUL5 = {
  '♠': bm('..#..|.###.|#####|#.#.#|.###.'),
  '♥': bm('##.##|#####|#####|.###.|..#..'),
  '♦': bm('..#..|.###.|#####|.###.|..#..'),
  '♣': bm('.###.|.###.|#####|#.#.#|.###.'),
};
function motif(g, rows, x, y, col, renverse = false) {
  g.fillStyle = col; const h = rows.length, w = rows[0].length;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rows[j][i] === '#') g.fillRect(x + (renverse ? w - 1 - i : i), y + (renverse ? h - 1 - j : j), 1, 1);
}
export const ROUGE = '#d0202e', NOIR = '#1e1e28';
export const rougeC = (c) => c.s === '♥' || c.s === '♦';
const RANG = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
export const nomRang = (r) => RANG[r] || String(r);
export const CARTE = { w: 24, h: 34 }, PETITE = { w: 16, h: 22 };
/** carte de face ; o : { petit, eteinte (non jouable), lumiere (contour doré), leve } */
export function carte(g, c, x, y, o = {}) {
  x = Math.round(x); y = Math.round(y);
  const w = o.petit ? 16 : 24, h = o.petit ? 22 : 34, col = rougeC(c) ? ROUGE : NOIR;
  // ombre portée, contour, papier (un peu plus foncé en bas)
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + h, w - 2, 1); g.fillRect(x + w, y + 2, 1, h - 3);
  if (o.lumiere) pave(g, x - 1, y - 1, w + 2, h + 2, '#ffe060', '#ffe060');
  pave(g, x, y, w, h, '#fbf8ef', '#2a2a34');
  rect(g, x + 1, y + h - 3, w - 2, 2, '#e8e0cc');
  const rg = nomRang(c.r);
  if (o.petit) {
    texte(g, rg, x + 2 + (rg.length > 1 ? 0 : 0), y + 2, col);
    motif(g, COUL7[c.s], x + 5, y + 11, col);
  } else {
    texte(g, rg, x + 2, y + 2, col);
    motif(g, COUL5[c.s], x + 2, y + 11, col);
    // en bas à droite, la même chose tête-bêche
    const lw = largeur(rg); texte(g, [...rg].reverse().join(''), x + w - 2 - lw, y + h - 9, col, { renverse: true });
    motif(g, COUL5[c.s], x + w - 7, y + h - 17, col, true);
    if (c.r >= 11 && c.r <= 13) {
      // figure : un cadre doré, un buste stylisé (couronne pour le roi, fleur pour la dame, plume pour le valet)
      const fx = x + 8, fy = y + 7;
      pave(g, fx, fy, 9, 20, rougeC(c) ? '#f4d8a8' : '#d8e0f4', '#c89a2a');
      const habit = rougeC(c) ? '#c02838' : '#2848a0';
      rect(g, fx + 2, fy + 12, 5, 6, habit); rect(g, fx + 3, fy + 12, 3, 1, '#ffe080');
      rect(g, fx + 3, fy + 7, 3, 4, '#f0c8a0'); rect(g, fx + 3, fy + 8, 1, 1, '#302020'); rect(g, fx + 5, fy + 8, 1, 1, '#302020');
      if (c.r === 13) { rect(g, fx + 2, fy + 4, 5, 2, '#ffd030'); rect(g, fx + 2, fy + 3, 1, 1, '#ffd030'); rect(g, fx + 4, fy + 3, 1, 1, '#ffd030'); rect(g, fx + 6, fy + 3, 1, 1, '#ffd030'); }
      else if (c.r === 12) { rect(g, fx + 2, fy + 5, 5, 2, '#8a4a20'); rect(g, fx + 2, fy + 7, 1, 4, '#8a4a20'); rect(g, fx + 6, fy + 7, 1, 4, '#8a4a20'); rect(g, fx + 4, fy + 4, 1, 1, '#ff70a0'); }
      else { rect(g, fx + 2, fy + 5, 5, 2, habit); rect(g, fx + 6, fy + 2, 1, 4, '#f8f8f8'); }
      motif(g, COUL5[c.s], fx + 2, fy + 1 - 0, col);
    } else if (c.r === 14) {
      // l'as : sa couleur dans un médaillon
      g.fillStyle = col; for (let a = 0; a < 6.283; a += 0.25) g.fillRect(Math.round(x + 12 + Math.cos(a) * 7.5 - 0.5), Math.round(y + 17.5 + Math.sin(a) * 7.5 - 0.5), 1, 1);
      motif(g, COUL7[c.s], x + 9, y + 14, col);
    } else motif(g, COUL7[c.s], x + 9, y + 14, col);
  }
  if (o.eteinte) { g.fillStyle = 'rgba(20,30,40,.45)'; g.fillRect(x, y, w, h); }
}
/** dos de carte (bleu nuit, treillis, Poké Ball au centre) */
export function dos(g, x, y, o = {}) {
  x = Math.round(x); y = Math.round(y);
  const w = o.petit ? 16 : 24, h = o.petit ? 22 : 34;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + h, w - 2, 1);
  pave(g, x, y, w, h, '#f0f0f8', '#2a2a34');
  rect(g, x + 2, y + 2, w - 4, h - 4, '#24408c');
  g.fillStyle = '#3a5cc0';
  for (let j = 0; j < h - 4; j++) for (let i = 0; i < w - 4; i++) if ((i + j) % 4 === 0 || (i - j + 400) % 4 === 0) g.fillRect(x + 2 + i, y + 2 + j, 1, 1);
  const cx = x + (w >> 1) - 3, cy = y + (h >> 1) - 3;
  if (!o.petit) { motif(g, bm('..###..|.#####.|#######|#######|#######|.#####.|..###..'), cx, cy, '#1a1a22'); motif(g, bm('..###..|.#####.|##...##|.......|.......|.......|.......'), cx, cy, '#e83030'); motif(g, bm('.......|.......|.......|.......|##...##|.#####.|..###..'), cx, cy, '#f8f8f8'); rect(g, cx + 3, cy + 3, 1, 1, '#f8f8f8'); }
}
/** emplacement vide (contour pointillé) */
export function emplacement(g, x, y, o = {}) {
  const w = o.petit ? 16 : 24, h = o.petit ? 22 : 34; g.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 1; i < w - 1; i += 2) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
  for (let j = 1; j < h - 1; j += 2) { g.fillRect(x, y + j, 1, 1); g.fillRect(x + w - 1, y + j, 1, 1); }
}

/* ---------------- jetons ---------------- */
export const VALEURS = [500, 100, 25, 5, 1];
export const COUL_JETON = {
  1: ['#ffffff', '#dcdce4', '#9a9aac', '#3a6ad8'], 5: ['#ff7a6a', '#d83434', '#7a1820', '#ffffff'], 10: ['#7ac0ff', '#2a74d0', '#123c78', '#ffffff'],
  25: ['#7ae08a', '#2a9a4a', '#125428', '#ffffff'], 50: ['#ffb060', '#e07818', '#7a3c08', '#ffffff'], 100: ['#6a6a7a', '#2c2c36', '#0e0e14', '#ffd040'], 500: ['#c890ff', '#8a3ac8', '#40166a', '#ffd040'],
};
/** un jeton vu de trois quarts (11 × 4) ; empilés tous les 2 pixels, ils font des colonnes rayées */
export function jeton(g, x, y, v) {
  const [cl, ba, so, ra] = COUL_JETON[v] || COUL_JETON[1]; x = Math.round(x); y = Math.round(y);
  rect(g, x + 1, y, 9, 1, cl); rect(g, x, y + 1, 11, 2, ba); rect(g, x + 1, y + 3, 9, 1, so);
  rect(g, x + 1, y + 1, 1, 2, ra); rect(g, x + 5, y + 2, 1, 1, ra); rect(g, x + 9, y + 1, 1, 2, ra); rect(g, x + 4, y + 1, 3, 1, cl);
}
/** décompose un montant en jetons (du plus gros au plus petit) */
export function enJetons(n, valeurs = VALEURS) { const out = []; for (const v of valeurs) while (n >= v && out.length < 40) { out.push(v); n -= v; } return out; }
/** des piles de jetons pour un montant, centrées en x, posées sur y (le bas des piles) */
export function piles(g, n, x, y, o = {}) {
  if (n <= 0) return;
  const js = enJetons(n, o.valeurs), parPile = o.haut || 8, nb = Math.ceil(js.length / parPile);
  const x0 = Math.round(x - (nb * 12 - 1) / 2);
  for (let p = 0; p < nb; p++) { const pile = js.slice(p * parPile, (p + 1) * parPile).reverse(); pile.forEach((v, k) => jeton(g, x0 + p * 12, y - 4 - k * 2, v)); }
  if (o.etiquette !== false) texte(g, String(n), x, y + 2, o.coul || '#ffe070', { a: 'c', ombre: '#000' });
}

/* ---------------- tables et décor ---------------- */
/** moquette rouge du casino, motif de losanges dorés */
export function moquette(g, x, y, w, h) {
  rect(g, x, y, w, h, '#3a0f18');
  g.fillStyle = '#4a1420'; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((i + j) & 15) === 0 || ((i - j + 1024) & 15) === 0) g.fillRect(x + i, y + j, 1, 1);
  g.fillStyle = '#a07a30'; for (let j = 8; j < h; j += 16) for (let i = 8; i < w; i += 16) g.fillRect(x + i, y + j, 1, 1);
}
/** tapis de feutre ovale avec rebord en bois ; renvoie le masque (pour placer les décorations) */
export function tableOvale(g, cx, cy, rx, ry, o = {}) {
  ellipse(g, cx, cy + 4, rx + 10, ry + 10, 'rgba(0,0,0,.35)');
  ellipse(g, cx, cy, rx + 10, ry + 10, '#2a140a');
  ellipse(g, cx, cy, rx + 9, ry + 9, '#6a3a1a');
  ellipse(g, cx, cy - 1, rx + 7, ry + 7, '#8a5028');
  ellipse(g, cx, cy, rx + 3, ry + 3, '#4a2810');
  ellipse(g, cx, cy, rx + 2, ry + 2, o.bord || '#145a30');
  ellipse(g, cx, cy, rx, ry, o.feutre || '#1d7a42');
  // trame du feutre
  g.fillStyle = o.trame || '#22844a';
  for (let y = -ry; y <= ry; y++) { const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry))); for (let x = -w + ((y & 1) ? 1 : 0); x <= w; x += 3) if (((x * 7 + y * 13) & 7) < 3) g.fillRect(cx + x, cy + y, 1, 1); }
  // filet décoratif
  const r2x = rx - 12, r2y = ry - 10; g.fillStyle = o.filet || '#3aa860';
  for (let a = 0; a < Math.PI * 2; a += 0.012) g.fillRect(Math.round(cx + Math.cos(a) * r2x), Math.round(cy + Math.sin(a) * r2y), 1, 1);
  // reflet sur le bois
  g.fillStyle = '#b07040';
  for (let a = Math.PI * 1.15; a < Math.PI * 1.85; a += 0.01) g.fillRect(Math.round(cx + Math.cos(a) * (rx + 8)), Math.round(cy - 1 + Math.sin(a) * (ry + 8)), 1, 1);
}
/** voyant « joueur dont c'est le tour » : petit losange jaune qui clignote */
export function tour(g, x, y, t) { if (Math.floor(t / 300) % 2) return; g.fillStyle = '#ffe040'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 2, y - 0, 1, 1); g.fillRect(x + 2, y, 1, 1); }
/** bouton du donneur */
export function boutonDonneur(g, x, y) { ellipse(g, x, y + 2, 7, 5, '#0a0a0a'); ellipse(g, x, y, 7, 5, '#f8f8f0'); ellipse(g, x, y, 6, 4, '#ffffff'); texte(g, 'D', x - 2, y - 3, '#c01820'); }

/* ---------------- personnages ---------------- */
let planche = null;
/** la planche des personnages (chars.png), chargée une fois */
export function chargerPersos() { if (!planche) planche = loadImg(ASSETS.chars).then((im) => { planche.im = im; return im; }); return planche; }
const COL = { down: 1, left: 4, right: 7, up: 10 };
/** un personnage (64 × 64), pieds en (x, y) ; dir : down / left / right / up */
export function perso(g, nom, dir, x, y, o = {}) {
  const im = planche?.im; if (!im) return;
  const row = SPRITES.chars?.rows?.[nom]; if (row == null) return;
  const sh = o.coupe ? 64 - o.coupe : 64;
  g.drawImage(im, COL[dir] * 64, row * 64, 64, sh, Math.round(x - 32), Math.round(y - 64), 64, sh);
}

/* ---------------- symboles des rouleaux (24 × 24) ---------------- */
const cache = {};
function dansCercle(x, y, cx, cy, r) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r; }
export function symbole(nom) {
  if (cache[nom]) return cache[nom];
  const [c, g] = toile(24, 24); const p = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  if (nom === '7') {
    const forme = bm('................|.##############.|.#############..|.##.........###.|............###.|...........###..|..........###...|.........###....|........###.....|.......###......|.......###......|......###.......|......###.......|......###.......|......###.......|................');
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (forme[j][i] === '#') { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p(i + 4 + dx, j + 4 + dy, '#3a0808'); }
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (forme[j][i] === '#') p(i + 4, j + 4, j < 3 ? '#ff6a6a' : i < 8 ? '#e81c28' : '#b01020');
    p(6, 5, '#ffd0d0'); p(7, 5, '#ffd0d0');
  } else if (nom === 'BAR') {
    pave(g, 1, 7, 22, 11, '#1a1a1a', '#000'); rect(g, 2, 8, 20, 1, '#3a3a3a');
    texte(g, 'BAR', 3, 9, '#ffd23f'); rect(g, 2, 16, 20, 1, '#ffd23f');
  } else if (nom === 'Poké Ball') {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!dansCercle(x + 0.5, y + 0.5, 12, 12, 10)) continue;
      if (!dansCercle(x + 0.5, y + 0.5, 12, 12, 9)) { p(x, y, '#1a1a22'); continue; }
      if (y >= 11 && y <= 12) { p(x, y, '#1a1a22'); continue; }
      p(x, y, y < 11 ? (dansCercle(x, y, 9, 7, 3) ? '#ff8080' : '#e02828') : (y > 18 ? '#c8c8d0' : '#f4f4f8'));
    }
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { if (dansCercle(x + 0.5, y + 0.5, 12, 12, 3.6)) p(x, y, '#1a1a22'); if (dansCercle(x + 0.5, y + 0.5, 12, 12, 2.4)) p(x, y, '#ffffff'); }
  } else if (nom === 'Baie') {
    // Baie Oran : ronde, bleue, deux feuilles
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!dansCercle(x + 0.5, y + 0.5, 12, 14, 8.5)) continue;
      p(x, y, !dansCercle(x + 0.5, y + 0.5, 12, 14, 7.6) ? '#0e2a5a' : dansCercle(x, y, 9, 11, 3) ? '#8ac8ff' : y > 18 ? '#2a5ab0' : '#3a7ae0');
    }
    for (let i = 0; i < 6; i++) { p(12 + i, 5 - (i >> 1), '#2a8a2a'); p(12 + i, 6 - (i >> 1), '#4ac04a'); p(11 - i, 5 - (i >> 1), '#2a8a2a'); p(11 - i, 6 - (i >> 1), '#4ac04a'); }
    p(12, 4, '#6a4a20'); p(12, 5, '#6a4a20');
  } else if (nom === 'Pierre Lune') {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const dedans = dansCercle(x + 0.5, y + 0.5, 12, 12, 9) && !dansCercle(x + 0.5, y + 0.5, 16, 9, 7);
      if (!dedans) continue;
      const bord = !(dansCercle(x + 0.5, y + 0.5, 12, 12, 8) && !dansCercle(x + 0.5, y + 0.5, 16, 9, 8));
      p(x, y, bord ? '#2a2038' : x < 8 ? '#b8a8d8' : y > 16 ? '#5a4a78' : '#8a78b0');
    }
    p(7, 10, '#e8e0ff'); p(8, 14, '#e8e0ff'); p(10, 18, '#c8b8f0');
  } else if (nom === 'Étoile') {
    const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4.4 : 10.5; pts.push([12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]); }
    const dedans = (x, y) => { let c2 = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c2 = !c2; } return c2; };
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (dedans(x + 0.5, y + 0.5)) {
      const bord = !dedans(x - 0.5, y + 0.5) || !dedans(x + 1.5, y + 0.5) || !dedans(x + 0.5, y - 0.5) || !dedans(x + 0.5, y + 1.5);
      p(x, y, bord ? '#8a5a00' : y < 10 ? '#fff4a0' : x > 13 && y > 12 ? '#e8a810' : '#ffd23f');
    }
  }
  cache[nom] = c; return c;
}
