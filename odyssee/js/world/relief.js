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

/**
 * élève les cases `cells` ([x, y]) au niveau `niv`. Sous chaque bord sud, une paroi d'une case par niveau d'écart ;
 * là où un chemin franchit un bord, des marches (o.marches === false : aucune). Renvoie l'ensemble des cases élevées.
 */
export function plateau(W, cells, niv, o = {}) {
  const R = new Set();
  // tout ce qui est sur le plateau monte avec lui (bâtiments et portes compris) ; seules les parois épargnent le décor protégé
  for (const [x, y] of cells) if (W.in(x, y)) { R.add(key(x, y)); W.setHeight(x, y, niv); }
  const avant = new Map();   // sol d'origine des cases devenues paroi
  for (const k of R) {
    const [x, y] = k.split(',').map(Number);
    if (R.has(key(x, y + 1))) continue;
    const d = niv - W.height(x, y + 1);
    for (let i = 1; i <= d; i++) {
      const yy = y + i, q = W.get(x, yy);
      if (!W.in(x, yy) || R.has(key(x, yy)) || PROTEGE.has(q) || W.height(x, yy) >= niv) break;
      if (q === T.CLIFF && W.height(x, yy) <= niv - i) { W.setHeight(x, yy, niv - i); continue; }
      avant.set(key(x, yy), q); W.set(x, yy, T.CLIFF); W.setHeight(x, yy, niv - i);
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
export function boucher(W, cells, depart) {
  const r = W.reach(depart[0], depart[1], true, false, true);
  const pris = new Set([...W.npcs.map((n) => key(n.x, n.y)), ...W.items.map((i) => key(i.x, i.y))]);
  const SOL = new Set([T.GRASS, T.TALL, T.DARKTALL, T.FLOWER, T.PATH, T.SAND, T.SNOW]);
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (!r[y * W.w + x] && SOL.has(W.get(x, y)) && !pris.has(k)) W.set(x, y, T.TREE);
  }
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
