// odyssee/js/world/relief.js — relief du dehors (sans DOM) : plateaux plus hauts que le sol autour, parois de falaise
// sous leur bord sud, marches taillées là où un chemin franchit un bord. La grille garde la vérité du jeu : chaque case a
// une hauteur (GameMap.hg) ; on ne passe d'une hauteur à l'autre que par une marche (T.STAIRS, un niveau d'écart),
// la paroi (T.CLIFF) est infranchissable. Le rendu (world3d.js, reliefDehors) dessine tout ça à plat, façon HeartGold.
import { T, walkable } from './tiles.js';
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
  const R = o.roche || o.brut ? new Set() : contourNaturel(W, cells, niv);
  if (o.roche || o.brut) for (const [x, y] of cells) if (W.in(x, y)) R.add(key(x, y));
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

/** la case fait-elle partie d'une montagne à gravir (montagne) ? Le rendu y lit le relief au niveau des cases */
export const mont = (W, x, y) => !!W.monts && x >= 0 && y >= 0 && x < W.w && y < W.h && W.monts[y * W.w + x] !== 0;

/**
 * montagne à gravir, dessinée case par case (plan : une chaîne par rangée, à partir de (x0, y0)), façon Mont Argenté :
 *   'a' à 'n'  sentier à la hauteur 1 à 14 (o.sentier : T.PATH, ou T.SNOW sur la neige) ;
 *   '+'        roche (T.CAVEWALL), hauteur calculée (voir plus bas) ; 'A' à 'N' : roche de hauteur imposée (1 à 14) ;
 *   '='        marches taillées dans la roche (T.STAIRS) : une volée relie deux sentiers de hauteurs h et h + 2 (marches à
 *              h + 1) ou h et h + 1 (marches à h) ;
 *   'v'        ravin : le vide (roche au fond, que le rendu dessine comme un gouffre) ;
 *   '#'        passerelle de bois au-dessus du ravin (T.BRIDGE), à la hauteur des sentiers qu'elle relie ;
 *   ' '        rien ne change.
 * o.herbe : rectangles [x0, y0, x1, y1] où le sentier est un replat d'herbe (o.herbeT : T.GRASS ou T.SNOW).
 * Hauteur de la roche '+' : entre deux sentiers d'une même colonne, elle descend du plus haut (la falaise part du bord du
 * sentier du dessus) vers le plus bas, un gradin par rangée ; au-dessous du dernier sentier, la montagne descend d'un
 * gradin toutes les deux rangées ; à côté d'un sentier (est, ouest, au nord), la roche le dépasse toujours d'un gradin
 * (pas de roche au ras du sentier). Le rendu dessine chaque gradin comme les parois des grottes (bords en pente, world3d.js,
 * paroiCell) : une falaise de deux rangées montre deux pentes l'une sous l'autre.
 * Les cases de la montagne sont marquées dans W.monts (2 : sentier, 1 : roche), perdent leur marque de plateau d'herbe,
 * et les ravins dans W.ravins. Renvoie les cases praticables (clés « x,y »).
 */
export function montagne(W, x0, y0, plan, o = {}) {
  const sentierT = o.sentier ?? T.PATH, herbeT = o.herbeT ?? T.GRASS;
  const sentier = new Set(), ponts = [], marchesC = [], auto = [];
  if (!W.ravins) W.ravins = new Uint8Array(W.w * W.h);
  if (!W.monts) W.monts = new Uint8Array(W.w * W.h);
  const herbe = (x, y) => (o.herbe || []).some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
  plan.forEach((ligne, j) => [...ligne].forEach((ch, i) => {
    const x = x0 + i, y = y0 + j, k = y * W.w + x; if (!W.in(x, y) || ch === ' ') return;
    if (W.pentes) W.pentes[k] = 0;
    W.ravins[k] = 0; W.monts[k] = 1;
    if (ch === '+') { W.set(x, y, T.CAVEWALL); auto.push([x, y]); }
    else if (ch >= 'A' && ch <= 'N') { W.set(x, y, T.CAVEWALL); W.setHeight(x, y, ch.charCodeAt(0) - 64); }
    else if (ch >= 'a' && ch <= 'n') { W.set(x, y, herbe(x, y) ? herbeT : sentierT); W.setHeight(x, y, ch.charCodeAt(0) - 96); sentier.add(key(x, y)); W.monts[k] = 2; }
    else if (ch === '=') { W.set(x, y, T.STAIRS); marchesC.push([x, y]); sentier.add(key(x, y)); W.monts[k] = 2; }
    else if (ch === 'v') { W.set(x, y, T.CAVEWALL); W.setHeight(x, y, 0); W.ravins[k] = 1; }
    else if (ch === '#') { W.set(x, y, T.BRIDGE); W.ravins[k] = 1; ponts.push([x, y]); sentier.add(key(x, y)); W.monts[k] = 2; }
    else throw new Error(`montagne : signe inconnu « ${ch} » en ${x},${y}`);
  }));
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sol = (x, y) => sentier.has(key(x, y)) && W.get(x, y) !== T.STAIRS && W.get(x, y) !== T.BRIDGE;
  // volées de marches : chaque volée (cases de marches qui se touchent) relie le sentier le plus bas et le plus haut
  const vu = new Set();
  for (const [sx, sy] of marchesC) {
    if (vu.has(key(sx, sy))) continue;
    const volee = [], q = [[sx, sy]]; vu.add(key(sx, sy));
    while (q.length) { const [x, y] = q.pop(); volee.push([x, y]); for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (W.get(a, b) === T.STAIRS && sentier.has(key(a, b)) && !vu.has(key(a, b))) { vu.add(key(a, b)); q.push([a, b]); } } }
    const hs = [];
    // (le sol au pied de la montagne compte : la première volée part du chemin d'en bas)
    for (const [x, y] of volee) for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (sol(a, b) || (!mont(W, a, b) && W.in(a, b) && walkable(W.get(a, b)) && W.get(a, b) !== T.STAIRS)) hs.push(W.height(a, b)); }
    const lo = Math.min(...hs), hi = Math.max(...hs);
    for (const [x, y] of volee) W.setHeight(x, y, hi - lo >= 2 ? lo + 1 : lo);
  }
  // passerelles : à la hauteur des sentiers qu'elles relient
  for (let k = 0; k < 4; k++) for (const [x, y] of ponts) {
    const hs = N4.filter(([dx, dy]) => sol(x + dx, y + dy) || W.get(x + dx, y + dy) === T.BRIDGE && ravin(W, x + dx, y + dy)).map(([dx, dy]) => W.height(x + dx, y + dy));
    if (hs.length) W.setHeight(x, y, Math.max(...hs));
  }
  // roche '+' : hauteur lue sur la colonne (sentiers au nord et au sud), puis sur la rangée pour la roche sans sentier
  const praticable = (x, y) => sentier.has(key(x, y)) || (!mont(W, x, y) && W.get(x, y) !== T.CAVEWALL && W.get(x, y) !== T.TREE && W.get(x, y) !== T.PINE && W.get(x, y) !== T.WATER && W.in(x, y));
  const fait = new Map();
  const cherche = (x, y, dy) => {
    for (let d = 1; d < 40; d++) {
      const b = y + dy * d;
      if (!W.in(x, b) || ravin(W, x, b)) return null;
      if (praticable(x, b)) return [d, W.height(x, b)];
      if (W.get(x, b) !== T.CAVEWALL) return null;
    }
    return null;
  };
  for (const [x, y] of auto) {
    const n = cherche(x, y, -1), s = cherche(x, y, 1);
    let h = null;
    if (n && s) {
      const nb = n[0] + s[0] - 1, [dh, Hh, Hl] = n[1] >= s[1] ? [n[0], n[1], s[1]] : [s[0], s[1], n[1]];
      h = Hh === Hl ? Hh + 1 : Math.max(Hl + 1, Hh - Math.round((dh - 1) * (Hh - Hl - 1) / Math.max(1, nb - 1)));
    } else if (n) h = Math.max(1, n[1] - Math.floor((n[0] - 1) / 2));
    else if (s) h = s[1] + 1 + Math.floor((s[0] - 1) / 2);
    if (h != null) fait.set(key(x, y), h);
  }
  for (const [x, y] of auto) {
    if (fait.has(key(x, y))) continue;
    let best = null;
    for (let d = 1; d < 40 && !best; d++) for (const a of [x - d, x + d]) if (fait.has(key(a, y))) { best = Math.max(1, fait.get(key(a, y)) - Math.floor((d - 1) / 2)); break; }
    fait.set(key(x, y), best ?? 1);
  }
  // lissage (médiane sur cinq cases de large et trois de haut) : pas de marche verticale entre deux colonnes voisines
  for (const [x, y] of auto) {
    const v = [];
    for (let e = -1; e <= 1; e++) for (let d = -2; d <= 2; d++) if (fait.has(key(x + d, y + e))) v.push(fait.get(key(x + d, y + e)));
    v.sort((a, b) => a - b); W.setHeight(x, y, v[v.length >> 1]);
  }
  // juste sous un sentier, la roche ne le dépasse pas (le sentier tient le haut de la falaise) ; à côté d'un sentier (à
  // l'est, à l'ouest ou au nord), elle le dépasse d'un gradin : un bord en pente, pas un raccord à plat
  for (const [x, y] of auto) {
    let h = W.height(x, y);
    if (sol(x, y - 1)) h = Math.min(h, W.height(x, y - 1));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) if (sol(x + dx, y + dy)) h = Math.max(h, W.height(x + dx, y + dy) + 1);
    W.setHeight(x, y, h);
  }
  return sentier;
}

/** massif rocheux (montagne infranchissable) : la roche remplace la forêt dans le polygone ; ses cases reçoivent des
 *  gradins (1 à 3 selon la distance au pied) que le rendu dessine en parois successives, comme une vraie montagne */
export function massif(W, cells, o = {}) {
  const R = [];
  for (const [x, y] of cells) { const t = W.get(x, y); if (t === T.TREE || t === T.PINE || (o.tout && t !== T.BUILD && t !== T.DOOR)) { W.set(x, y, T.CAVEWALL); R.push([x, y]); } }
  if (!R.length) return R;
  // distance au pied (cases qui ne sont pas de la roche), en grille d'entiers sur le rectangle du massif
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of R) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
  let n = 0;
  for (const [x, y] of R) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => W.get(x + a, y + b) !== T.CAVEWALL)) { const i = (y - y0) * w + (x - x0); d[i] = 0; q[n++] = i; }
  for (let k = 0; k < n; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const u = x + a, v = y + b; if (u < 0 || v < 0 || u >= w || v >= h) continue;
      const j = v * w + u; if (d[j] >= 0 || W.get(u + x0, v + y0) !== T.CAVEWALL) continue;
      d[j] = d[i] + 1; q[n++] = j;
    }
  }
  const pas = o.pas || 4, base = o.base ?? 0;
  for (const [x, y] of R) { const k = d[(y - y0) * w + (x - x0)]; W.setHeight(x, y, base + 1 + Math.min(o.max ?? 2, Math.floor(Math.max(0, k) / pas))); }
  return R;
}

/**
 * une montagne en vrai relief sur les cases `cells` (forêt devenue roche) : la hauteur monte avec la distance au pied
 * (o.pente niveaux par case), plafonnée par un relief de crêtes et de masses (bruit à graine fixe o.g) ; o.max : plus haut
 * niveau ; o.palier : hauteurs arrondies (2 : tables et mesas aux bords abrupts) ; o.base : niveau du pied. Renvoie les
 * cases de roche.
 */
export function reliefMontagne(W, cells, o = {}) {
  if (!cells.length) return [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of cells) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  x0--; y0--; x1++; y1++;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, at = (x, y) => (y - y0) * w + (x - x0), d = new Float32Array(w * h);
  for (const [x, y] of cells) d[at(x, y)] = 1e9;
  for (let y = y0 + 1; y <= y1; y++) for (let x = x0 + 1; x < x1; x++) { const p = at(x, y); if (d[p]) d[p] = Math.min(d[p], d[p - 1] + 1, d[p - w] + 1, d[p - w - 1] + 1.41, d[p - w + 1] + 1.41); }
  for (let y = y1 - 1; y >= y0; y--) for (let x = x1 - 1; x > x0; x--) { const p = at(x, y); if (d[p]) d[p] = Math.min(d[p], d[p + 1] + 1, d[p + w] + 1, d[p + w + 1] + 1.41, d[p + w - 1] + 1.41); }
  const g = o.g ?? 7, pente = o.pente ?? 0.55, max = o.max ?? 8, pal = o.palier ?? 1, base = o.base ?? 0;
  for (const [x, y] of cells) {
    const crete = 1 - Math.abs(2 * bruit(x, y, o.echelle ?? 40, g) - 1), masse = bruit(x, y, (o.echelle ?? 40) * 2.2, g + 1), detail = bruit(x, y, 9, g + 2);
    const cible = 1 + crete * (o.crete ?? 4) + masse * (o.masse ?? 3) + detail * 1.4;
    let H = Math.max(1, Math.min(max, Math.floor(d[at(x, y)] * pente) + 1, Math.floor(cible)));
    if (pal > 1) H = Math.max(1, Math.round(H / pal) * pal);
    W.set(x, y, T.CAVEWALL); W.setHeight(x, y, base + H);
  }
  return cells;
}
