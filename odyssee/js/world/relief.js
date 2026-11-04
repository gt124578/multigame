// odyssee/js/world/relief.js — relief du dehors (sans DOM) : plateaux plus hauts que le sol autour, parois de falaise
// sous leur bord sud, marches taillées là où un chemin franchit un bord. La grille garde la vérité du jeu : chaque case a
// une hauteur (GameMap.hg) ; on ne passe d'une hauteur à l'autre que par une marche (T.STAIRS, un niveau d'écart),
// la paroi (T.CLIFF) est infranchissable. Le rendu (world3d.js, reliefDehors) dessine tout ça à plat, façon HeartGold.
import { T } from './tiles.js';
import { along, rng } from './mapgen.js';

const key = (x, y) => x + ',' + y;
/** ce qu'une paroi ne recouvre jamais */
const PROTEGE = new Set([T.BUILD, T.DOOR, T.BRIDGE, T.CAVEDOOR, T.SIGN, T.MAT]);
/** sols où une marche peut être taillée (un chemin qui franchit un bord) */
const CHEMIN = new Set([T.PATH, T.PAVE, T.STAIRS]);

/** sols que le contour naturel d'un plateau peut prendre ou laisser (herbe, fleurs, arbres, petit décor) */
const MOU = new Set([T.GRASS, T.TALL, T.DARKTALL, T.FLOWER, T.TREE, T.PINE, T.BUSH, T.ROCK]);

/** bruit lisse (valeurs tirées sur une grille de `s` cases, interpolées), dans [0, 1] */
function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function bruit(x, y, s, g) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, g), b = hash(ix + 1, iy, g), c = hash(ix, iy + 1, g), d = hash(ix + 1, iy + 1, g);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/**
 * contour naturel d'un plateau d'herbe : le bord ondule (avancées et retraits de 1 à 3 cases, bruit à graine fixe),
 * les coins s'arrondissent. Ne bougent jamais : les chemins, l'eau, les bâtiments, les cases d'un autre niveau, les PNJ
 * et les objets ; près d'un chemin qui franchit le bord (ou de l'eau), le bord reste droit pour que les marches tombent
 * juste. L'amplitude suit l'épaisseur du plateau (une bande de deux cases ne bouge presque pas).
 */
function contourNaturel(W, cells, niv) {
  const S = new Set(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of cells) if (W.in(x, y)) { S.add(key(x, y)); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (!S.size) return S;
  const M = 6; x0 -= M; y0 -= M; x1 += M; y1 += M;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, at = (x, y) => (y - y0) * bw + (x - x0);
  const dans = new Uint8Array(bw * bh);
  for (const k of S) { const [x, y] = k.split(',').map(Number); dans[at(x, y)] = 1; }
  const de = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1 && dans[at(x, y)] === 1;
  // distance (en cases, 8 voisins) au bord, dedans et dehors : épaisseur du plateau, bande où le bord peut bouger
  const dist = (val) => {
    const d = new Int16Array(bw * bh).fill(99), q = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dans[at(x, y)] !== val) { d[at(x, y)] = 0; q.push([x, y]); }
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i], v = d[at(x, y)];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = y + dy; if (a < x0 || b < y0 || a > x1 || b > y1) continue;
        if (d[at(a, b)] > v + 1) { d[at(a, b)] = v + 1; q.push([a, b]); }
      }
    }
    return d;
  };
  const din = dist(1), dout = dist(0);
  let epais = 0; for (let i = 0; i < din.length; i++) if (dans[i]) epais = Math.max(epais, din[i]);
  const A = Math.min(2.6, epais / 2.4);
  if (A < 0.6) return S;
  const prises = new Set([...W.npcs.map((n) => key(n.x, n.y)), ...W.items.map((i) => key(i.x, i.y))]);
  // une case « fixe » garde son appartenance ; près des cases fixes posées sur le bord, le bord ne bouge pas
  const fixe = (x, y) => {
    const t = W.get(x, y), k = key(x, y);
    if (prises.has(k) || !MOU.has(t)) return true;
    // dehors : seulement les cases du niveau juste en dessous ; dedans : rien qui soit déjà plus haut que le plateau
    const h = W.height(x, y);
    return de(x, y) ? h !== niv - 1 && h !== niv : h !== niv - 1;
  };
  const ancre = []; // cases fixes près du bord : chemins qui le franchissent, eau, maisons…
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y), pres = dans[i] ? din[i] <= 3 : dout[i] <= 3;
    if (pres && fixe(x, y) && W.in(x, y)) ancre.push([x, y]);
  }
  const loin = new Float32Array(bw * bh).fill(99);
  for (const [ax, ay] of ancre) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const a = ax + dx, b = ay + dy; if (a < x0 || b < y0 || a > x1 || b > y1) continue;
    const d = Math.hypot(dx, dy), i = at(a, b); if (d < loin[i]) loin[i] = d;
  }
  // indicatrice adoucie (moyenne sur 7 × 7 cases : coins arrondis) + bruit lisse décalé : le nouveau contour
  const g = (x0 * 7 + y0 * 13 + niv * 101) | 0, R = 3, out = new Uint8Array(bw * bh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y);
    if (!W.in(x, y) || fixe(x, y)) { out[i] = dans[i]; continue; }
    if ((dans[i] && din[i] > 4) || (!dans[i] && dout[i] > 4)) { out[i] = dans[i]; continue; }
    let s = 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) s += de(x + dx, y + dy) ? 1 : 0;
    const b = s / ((2 * R + 1) ** 2);
    const n = 0.65 * bruit(x, y, 5.5, g) + 0.35 * bruit(x, y, 2.6, g + 1);
    const att = Math.max(0, Math.min(1, (loin[i] - 1) / 2));
    const decal = A * att * (2 * n - 1);   // en cases : > 0 le plateau avance, < 0 il recule
    out[i] = b + decal / (2 * R + 1) > 0.5 ? 1 : 0;
  }
  // nettoyage : pas de dent ni de trou d'une case (deux passes), on garde la grande pièce
  for (let pass = 0; pass < 2; pass++) for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
    const i = at(x, y); if (!W.in(x, y) || fixe(x, y)) continue;
    const n4 = out[at(x + 1, y)] + out[at(x - 1, y)] + out[at(x, y + 1)] + out[at(x, y - 1)];
    if (out[i] && n4 <= 1) out[i] = 0; else if (!out[i] && n4 >= 3) out[i] = 1;
    // bande d'une case entre deux morceaux : comblée (pas de couloir bas d'une case de large)
    if (!out[i] && ((out[at(x + 1, y)] && out[at(x - 1, y)]) || (out[at(x, y + 1)] && out[at(x, y - 1)]))) out[i] = 1;
  }
  const res = new Set(), vu = new Uint8Array(bw * bh); let best = null;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y); if (!out[i] || vu[i]) continue;
    const comp = [], q = [[x, y]]; vu[i] = 1;
    while (q.length) { const [a, b] = q.pop(); comp.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = a + dx, d = b + dy; if (c < x0 || d < y0 || c > x1 || d > y1) continue; const j = at(c, d); if (out[j] && !vu[j]) { vu[j] = 1; q.push([c, d]); } } }
    // une pièce qui garde une case fixe du plateau d'origine reste (chemin, maison…) ; les miettes s'en vont
    if (comp.length >= 6 || comp.some(([a, b]) => fixe(a, b) && de(a, b))) for (const [a, b] of comp) res.add(key(a, b));
    if (!best || comp.length > best.length) best = comp;
  }
  if (best) for (const [a, b] of best) res.add(key(a, b));
  return res;
}

/** marque les cases d'un plateau d'herbe (dessus, talus, marches) : le rendu y dessine une pente de pelouse */
function marquer(W, k, v) {
  if (!W.pentes) { if (!v) return; W.pentes = new Uint8Array(W.w * W.h); }
  const [x, y] = k.split(',').map(Number); if (W.in(x, y)) W.pentes[y * W.w + x] = v;
}
/** la case est-elle le fond d'un ravin (montagne) ? Le rendu y dessine le vide */
export const ravin = (W, x, y) => !!W.ravins && x >= 0 && y >= 0 && x < W.w && y < W.h && W.ravins[y * W.w + x] === 1;
/** la case est-elle (dessus, talus ou marche) d'un plateau d'herbe ? */
export const pente = (W, x, y) => !!W.pentes && x >= 0 && y >= 0 && x < W.w && y < W.h && W.pentes[y * W.w + x] === 1;

/**
 * élève les cases `cells` ([x, y]) au niveau `niv`. Sous chaque bord sud, une paroi (le talus) d'une case par niveau
 * d'écart ; là où un chemin franchit un bord, des marches (o.marches === false : aucune). Renvoie l'ensemble des cases
 * élevées. Par défaut, un plateau d'herbe : contour naturel (contourNaturel) et talus de pelouse au rendu ;
 * o.roche : falaise de roche au bord droit (canyons, déserts).
 */
export function plateau(W, cells, niv, o = {}) {
  const R = o.roche ? new Set() : contourNaturel(W, cells, niv);
  if (o.roche) for (const [x, y] of cells) if (W.in(x, y)) R.add(key(x, y));
  // tout ce qui est sur le plateau monte avec lui (bâtiments et portes compris) ; seules les parois épargnent le décor protégé
  for (const k of R) { const [x, y] = k.split(',').map(Number); W.setHeight(x, y, niv); marquer(W, k, o.roche ? 0 : 1); }
  const avant = new Map();   // sol d'origine des cases devenues paroi
  for (const k of R) {
    const [x, y] = k.split(',').map(Number);
    if (R.has(key(x, y + 1))) continue;
    const d = niv - W.height(x, y + 1);
    for (let i = 1; i <= d; i++) {
      const yy = y + i, q = W.get(x, yy);
      if (!W.in(x, yy) || R.has(key(x, yy)) || PROTEGE.has(q) || W.height(x, yy) >= niv) break;
      if (q === T.CLIFF && W.height(x, yy) <= niv - i) { W.setHeight(x, yy, niv - i); marquer(W, key(x, yy), o.roche ? 0 : 1); continue; }
      avant.set(key(x, yy), q); W.set(x, yy, T.CLIFF); W.setHeight(x, yy, niv - i); marquer(W, key(x, yy), o.roche ? 0 : 1);
    }
  }
  if (o.marches !== false) {
    // parois : une colonne de marches sous chaque case de chemin qui arrive au bord, si un chemin repart en bas
    for (const k of R) {
      const [x, y] = k.split(',').map(Number);
      if (!CHEMIN.has(W.get(x, y)) || W.get(x, y + 1) !== T.CLIFF) continue;
      let n = 1; while (W.get(x, y + n) === T.CLIFF && n < 8) n++;
      const sous = W.get(x, y + n), haut = avant.get(key(x, y + 1));
      if (!(CHEMIN.has(sous) || CHEMIN.has(haut))) continue;
      for (let i = 1; i < n; i++) W.set(x, y + i, T.STAIRS);
      if (!CHEMIN.has(sous) && sous !== T.WATER) W.set(x, y + n, T.PATH);
    }
    // bords nord, est et ouest : la case du bord devient une marche quand le chemin continue plus bas
    for (const k of R) {
      const [x, y] = k.split(',').map(Number);
      if (!CHEMIN.has(W.get(x, y)) || W.get(x, y) === T.STAIRS) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (R.has(key(nx, ny)) || W.height(nx, ny) !== niv - 1 || !CHEMIN.has(W.get(nx, ny))) continue;
        W.set(x, y, T.STAIRS); break;
      }
    }
  }
  return R;
}

/** marches posées à la main dans une paroi (colonnes x0 → x1, sous la rangée y du plateau) */
export function marches(W, x0, x1, y) {
  for (let x = x0; x <= x1; x++) {
    let n = 1; while (W.get(x, y + n) === T.CLIFF && n < 8) n++;
    for (let i = 1; i < n; i++) W.set(x, y + i, T.STAIRS);
    if (W.get(x, y) === T.TREE || W.get(x, y) === T.PINE) W.set(x, y, T.PATH);
    const q = W.get(x, y + n); if (q === T.TREE || q === T.PINE || q === T.CLIFF) W.set(x, y + n, T.PATH);
  }
}

/* ---------------- formes ---------------- */
/** cases d'un rectangle (bornes comprises) */
export function rectangle(x0, y0, x1, y1) { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; }
/** cases à l'intérieur d'un polygone [[x, y]…] (centre de la case) */
export function polygone(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = [];
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
    const px = x + 0.5, py = y + 0.5; let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins;
    }
    if (ins) out.push([x, y]);
  }
  return out;
}
/** bande le long d'une ligne brisée : cases dont la distance au tracé est entre d0 et d1, du côté `cote` (+1 / -1 / 0 : les deux),
 *  pour une portion t0 → t1 de la ligne */
export function bande(pts, d0, d1, cote = 0, t0 = 0, t1 = 1) {
  const out = [], seen = new Set();
  const n = Math.ceil(lenOf(pts) * (t1 - t0) * 2) + 2;
  for (let i = 0; i <= n; i++) {
    const p = along(pts, t0 + (t1 - t0) * i / n);
    for (const s of cote ? [cote] : [-1, 1]) for (let d = d0; d <= d1; d += 0.5) {
      const x = Math.floor(p.x + 0.5 + p.nx * s * d), y = Math.floor(p.y + 0.5 + p.ny * s * d), k = key(x, y);
      if (!seen.has(k)) { seen.add(k); out.push([x, y]); }
    }
  }
  return out;
}
const lenOf = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };

/** courbe lissée (Catmull-Rom) qui passe par les points : routes sinueuses plutôt que des segments droits */
export function sinueuse(pts, pas = 3) {
  if (pts.length < 3) return pts;
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / pas));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** ceinture de tourbillons sur la mer : le long de chaque ligne brisée, les cases d'eau à moins de `hw` (plus un peu de
 *  bruit, jamais moins) deviennent des tourbillons, infranchissables à la nage */
export function tourbillons(W, lignes, hw = 1.5, seed = 77) {
  const r = rng(seed);
  for (const pts of lignes) {
    const L = lenOf(pts), n = Math.ceil(L * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const p = along(pts, i / n), e = hw + (r() < 0.35 ? 1 : 0);
      for (let dy = -Math.ceil(e); dy <= Math.ceil(e); dy++) for (let dx = -Math.ceil(e); dx <= Math.ceil(e); dx++) {
        if (Math.hypot(dx, dy) > e + 0.25) continue;
        const x = Math.floor(p.x + dx), y = Math.floor(p.y + dy);
        if (W.get(x, y) === T.WATER) W.set(x, y, T.WHIRL);
      }
    }
  }
}

/** après avoir posé des plateaux sur une route : les bouts de couloir que le relief a isolés (ni marche ni chemin pour y
 *  monter) redeviennent de la forêt, pour qu'aucun dresseur, objet ou recoin n'y tombe. cells : clés « x,y » du couloir */
export function boucher(W, cells, depart, remplace = T.TREE) {
  const r = W.reach(depart[0], depart[1], true, false, true);
  const pris = new Set([...W.npcs.map((n) => key(n.x, n.y)), ...W.items.map((i) => key(i.x, i.y))]);
  const SOL = new Set([T.GRASS, T.TALL, T.DARKTALL, T.FLOWER, T.PATH, T.SAND, T.SNOW]);
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (!r[y * W.w + x] && SOL.has(W.get(x, y)) && !pris.has(k)) W.set(x, y, remplace);
  }
}

/**
 * montagne à gravir, dessinée case par case (plan : une chaîne par rangée, à partir de (x0, y0)) :
 *   '1' à '9'  roche (T.CAVEWALL) de cette hauteur, posée seulement là où la montagne (massif) est déjà de la roche ;
 *   'a' à 'i'  sentier (T.PATH) à la hauteur 1 à 9 ; 'A' à 'I' : herbe rase à cette hauteur (palier, sommet) ;
 *   '='        marches taillées dans la roche (T.STAIRS), à la hauteur du sentier le plus bas qui les touche ;
 *   'v'        ravin : le vide (roche au fond, hauteur 0, que le rendu dessine comme un gouffre) ;
 *   '#'        passerelle de bois au-dessus du ravin (T.BRIDGE), à la hauteur du sentier qu'elle relie ;
 *   ' ' ou '.' rien ne change.
 * Les gradins de roche sont dessinés comme les parois des grottes (bords en pente, world3d.js, paroiCell). Les cases de
 * la montagne perdent leur marque de plateau d'herbe. Renvoie les cases du sentier (clés « x,y »).
 */
export function montagne(W, x0, y0, plan) {
  const sentier = new Set(), ponts = [], marchesC = [];
  if (!W.ravins) W.ravins = new Uint8Array(W.w * W.h);
  plan.forEach((ligne, j) => [...ligne].forEach((ch, i) => {
    const x = x0 + i, y = y0 + j; if (!W.in(x, y) || ch === ' ' || ch === '.') return;
    if (W.pentes) W.pentes[y * W.w + x] = 0;
    W.ravins[y * W.w + x] = 0;
    if (ch >= '1' && ch <= '9') { if (W.get(x, y) === T.CAVEWALL || W.get(x, y) === T.CLIFF) { W.set(x, y, T.CAVEWALL); W.setHeight(x, y, +ch); } }
    else if (ch >= 'a' && ch <= 'i') { W.set(x, y, T.PATH); W.setHeight(x, y, ch.charCodeAt(0) - 96); sentier.add(key(x, y)); }
    else if (ch >= 'A' && ch <= 'I') { W.set(x, y, T.GRASS); W.setHeight(x, y, ch.charCodeAt(0) - 64); sentier.add(key(x, y)); }
    else if (ch === '=') { W.set(x, y, T.STAIRS); marchesC.push([x, y]); sentier.add(key(x, y)); }
    else if (ch === 'v') { W.set(x, y, T.CAVEWALL); W.setHeight(x, y, 0); W.ravins[y * W.w + x] = 1; }
    else if (ch === '#') { W.set(x, y, T.BRIDGE); W.ravins[y * W.w + x] = 1; ponts.push([x, y]); sentier.add(key(x, y)); }
  }));
  // hauteur des marches et des passerelles : celle du sentier voisin (le plus bas pour une marche, le plus haut pour un pont)
  const voisins = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => sentier.has(key(a, b)) && W.get(a, b) !== T.STAIRS && W.get(a, b) !== T.BRIDGE).map(([a, b]) => W.height(a, b));
  for (const [x, y] of marchesC) { const h = voisins(x, y); W.setHeight(x, y, h.length ? Math.min(...h) : W.height(x, y)); }
  for (let k = 0; k < 3; k++) for (const [x, y] of ponts) {
    const h = voisins(x, y), hp = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => W.get(x + dx, y + dy) === T.BRIDGE).map(([dx, dy]) => W.height(x + dx, y + dy));
    const all = [...h, ...hp]; if (all.length) W.setHeight(x, y, Math.max(...all));
  }
  return sentier;
}

/** massif rocheux (montagne infranchissable) : la roche remplace la forêt dans le polygone ; ses cases reçoivent des
 *  gradins (1 à 3 selon la distance au pied) que le rendu dessine en parois successives, comme une vraie montagne */
export function massif(W, cells, o = {}) {
  const R = [];
  for (const [x, y] of cells) { const t = W.get(x, y); if (t === T.TREE || t === T.PINE || (o.tout && t !== T.BUILD && t !== T.DOOR)) { W.set(x, y, T.CAVEWALL); R.push([x, y]); } }
  // distance au pied (cases qui ne sont pas de la roche)
  const d = new Map(), q = [];
  for (const [x, y] of R) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => W.get(x + a, y + b) !== T.CAVEWALL)) { d.set(key(x, y), 0); q.push([x, y]); }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], k = d.get(key(x, y));
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const kk = key(x + a, y + b); if (W.get(x + a, y + b) === T.CAVEWALL && !d.has(kk)) { d.set(kk, k + 1); q.push([x + a, y + b]); } }
  }
  const pas = o.pas || 4, base = o.base ?? 0;
  for (const [x, y] of R) W.setHeight(x, y, base + 1 + Math.min(o.max ?? 2, Math.floor((d.get(key(x, y)) ?? 0) / pas)));
  return R;
}
