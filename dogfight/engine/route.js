// L'itinéraire du transport d'Escorte, propre à chaque carte (maps.js) : au ras de l'eau le long des côtes, par le fond
// des vallées entre les montagnes, à travers le banc de nuages bas, puis l'approche et l'atterrissage sur la piste.
// Les tronçons de vallée suivent le vrai relief : le chemin le plus bas d'un point à l'autre, comme un pilote qui se faufile.
// La route est calculée une fois : position et altitude tous les 10 m, sans jamais toucher le relief.
// Moteur pur : le transport la suit sur des rails, chez l'hôte comme dans les tests.
import { smoothPath, buildArchipel, runwayPoint, RUNWAY_Y } from './archipel.js';

const STEP = 10;            // un point tous les 10 m
const LOW = 42;             // rase-mottes : hauteur au-dessus du relief (m), sous le seuil des radars
const VALLEY = 80;          // dans les vallées : au-dessus du fond
const CLEAR = 30;           // jamais moins que ça sous le ventre
const CLIMB = 0.16, DIVE = 0.24;   // pentes permises en montée et en descente
const GROUND_Y = RUNWAY_Y + 3;
const MODES = { c: 'cruise', l: 'low', v: 'valley', b: 'cruise', B: 'cruise' };

export const ROUTE_IDS = ['traversee', 'tour', 'odyssee'];
export const routeForTime = (time) => (time >= 600 ? 'odyssee' : time >= 480 ? 'tour' : 'traversee');
export const routeInfo = (id, A = buildArchipel()) => A.def.routes[id] || A.def.routes.traversee;

// Le relief le plus haut sous l'avion et autour (son envergure : 25 m de chaque côté)
function under(ground, x, z, tx, tz, r) {
  let h = ground(x, z);
  for (const k of [-1, 1]) { h = Math.max(h, ground(x - tz * r * k, z + tx * r * k), ground(x + tx * r * k, z + tz * r * k)); }
  return h;
}

// Le fond des vallées : le chemin le moins coûteux sur une grille de 50 m, où chaque mètre coûte d'autant plus cher
// qu'on est haut. Il contourne les sommets par les cols et suit les vallées ; au-dessus de l'eau, il va tout droit.
const CELL = 50;
function heightGrid(A, ground) {
  const n = Math.floor(A.size / CELL) + 1, H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = Math.max(0, ground(A.x0 + i * CELL, A.z0 + j * CELL));
  return { n, H };
}
function valleyPath(A, G, a, b) {
  const { n, H } = G, idx = (p) => Math.max(0, Math.min(n - 1, Math.round((p.z - A.z0) / CELL))) * n + Math.max(0, Math.min(n - 1, Math.round((p.x - A.x0) / CELL)));
  const start = idx(a), goal = idx(b), gx = goal % n, gz = Math.floor(goal / n);
  const g = new Float64Array(n * n).fill(Infinity), from = new Int32Array(n * n).fill(-1), done = new Uint8Array(n * n);
  const heap = [], f = new Float64Array(n * n);
  const push = (k) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[k]) break; heap[i] = heap[p]; i = p; } heap[i] = k; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, fm = f[last]; if (l < heap.length && f[heap[l]] < fm) { m = l; fm = f[heap[l]]; } if (r < heap.length && f[heap[r]] < fm) m = r; if (m === i) break; heap[i] = heap[m]; i = m; } heap[i] = last; }
    return top;
  };
  g[start] = 0; f[start] = Math.hypot(start % n - gx, Math.floor(start / n) - gz) * CELL; push(start);
  // il reste près de la ligne droite entre les deux points : il choisit le meilleur passage, sans faire le tour de l'île
  const ax = (a.x - A.x0) / CELL, az = (a.z - A.z0) / CELL, bx = (b.x - A.x0) / CELL, bz = (b.z - A.z0) / CELL, L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
  const off = (i, j) => { const t = Math.max(0, Math.min(1, ((i - ax) * (bx - ax) + (j - az) * (bz - az)) / L2)); return Math.hypot(ax + (bx - ax) * t - i, az + (bz - az) * t - j) * CELL; };
  const cost = (k) => { const i = k % n, d = off(i, (k - i) / n) / 350; return 1 + H[k] / 30 + d * d; };
  while (heap.length) {
    const k = pop();
    if (k === goal) break;
    if (done[k]) continue;
    done[k] = 1;
    const i = k % n, j = (k - i) / n;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 1 || jj < 1 || ii >= n - 1 || jj >= n - 1) continue;
      const q = jj * n + ii, L = (di && dj ? Math.SQRT2 : 1) * CELL, c = g[k] + L * (cost(k) + cost(q)) / 2;
      if (c < g[q]) { g[q] = c; from[q] = k; f[q] = c + Math.hypot(ii - gx, jj - gz) * CELL; push(q); }
    }
  }
  const cells = [];
  for (let k = goal; k >= 0; k = from[k]) { cells.push(k); if (k === start) break; }
  cells.reverse();
  // un point tous les 150 m, adouci : le chemin brut zigzague d'une case à l'autre
  const pts = cells.filter((_, i) => i % 3 === 0 || i === cells.length - 1).map((k) => ({ x: A.x0 + (k % n) * CELL, z: A.z0 + Math.floor(k / n) * CELL }));
  pts[0] = { x: a.x, z: a.z }; pts[pts.length - 1] = { x: b.x, z: b.z };
  for (let it = 0; it < 4; it++) for (let i = 1; i < pts.length - 1; i++) { pts[i].x += ((pts[i - 1].x + pts[i + 1].x) / 2 - pts[i].x) * 0.5; pts[i].z += ((pts[i - 1].z + pts[i + 1].z) / 2 - pts[i].z) * 0.5; }
  return pts.slice(1);
}

// Points de contrôle de la route : ceux de la carte, les vallées et le banc de nuages déroulés, puis l'atterrissage
function controls(A, R, G) {
  const ctrl = [], cx = A.zone.x, cz = A.zone.z;
  let pin = 0;
  for (const p of R.pts) {
    const m = MODES[p[0]] ? p[0] : p[2];
    if (m === 'b' || m === 'B') {
      const path = m === 'B' ? [...A.bank.path].reverse() : A.bank.path, k = ++pin;
      // au bord du banc (ses 240 premiers et derniers mètres), la route peut s'arrondir pour y entrer
      path.forEach((q, i) => ctrl.push({ x: q.x, z: q.z, m: 'cruise', y: A.bank.y, c: i > 12 && i < path.length - 13 ? k : -1 }));
      continue;
    }
    const q = { x: cx + p[0], z: cz + p[1], m: MODES[m], y: p[3], c: -1 };
    if (m === 'v' && ctrl.length) {
      const k = ++pin, list = valleyPath(A, G, ctrl[ctrl.length - 1], q);
      list.forEach((v, i) => ctrl.push({ x: v.x, z: v.z, m: 'valley', c: i < list.length - 1 ? k : -1 }));
      continue;
    }
    ctrl.push(q);
  }
  // l'alignement sur l'axe, la descente, le toucher des roues et le roulage
  const W = A.runway, L = W.len / 2, at = (a) => runwayPoint(W, a);
  ctrl.push({ ...at(-L - 3000), m: 'cruise', y: 180, c: -1 }, { ...at(-L - 1950), m: 'glide', y: 105, c: -1 }, { ...at(-L), m: 'ground', c: -1 }, { ...at(-L + 1050), m: 'ground', c: -1 }, { ...at(L - 150), m: 'ground', c: -1 });
  return ctrl;
}

// Construit la route : tableaux x, y, z, distance cumulée, et l'endroit où les roues touchent la piste
export function buildRoute(id, ground, A = buildArchipel()) {
  const R = routeInfo(id, A), ctrl = controls(A, R, heightGrid(A, ground));
  const path = smoothPath(ctrl, STEP), n = path.length;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n), floor = new Float32Array(n), pin = new Uint8Array(n);
  let land = -1;
  for (let i = 0; i < n; i++) {
    const p = path[i], a = ctrl[Math.floor(p.seg)], b = ctrl[Math.min(ctrl.length - 1, Math.ceil(p.seg))];
    x[i] = p.x; z[i] = p.z;
    pin[i] = (a.c >= 0 && a.c === b.c) || a.m === 'ground' || b.m === 'ground' ? 1 : 0;
  }
  // hors des vallées, du banc de nuages et de la piste, on arrondit les virages : un gros porteur ne tourne pas sur place
  for (let it = 0; it < 120; it++) for (let i = 1; i < n - 1; i++) if (!pin[i]) { x[i] += ((x[i - 1] + x[i + 1]) / 2 - x[i]) * 0.6; z[i] += ((z[i - 1] + z[i + 1]) / 2 - z[i]) * 0.6; }
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  // altitude voulue : selon le mode des deux points de passage qui encadrent
  const want = (c, i, tx, tz) => {
    if (c.m === 'cruise' || c.m === 'glide') return c.y;
    if (c.m === 'ground') return GROUND_Y;
    const h = under(ground, x[i], z[i], tx, tz, 40);
    return h + (c.m === 'valley' ? VALLEY : LOW);
  };
  for (let i = 0; i < n; i++) {
    const a = Math.floor(path[i].seg), f = path[i].seg - a, A1 = ctrl[a], B1 = ctrl[Math.min(ctrl.length - 1, a + 1)];
    const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1), tl = Math.hypot(x[j] - x[k], z[j] - z[k]) || 1, tx = (x[j] - x[k]) / tl, tz = (z[j] - z[k]) / tl;
    const e = f * f * (3 - 2 * f);
    y[i] = want(A1, i, tx, tz) * (1 - e) + want(B1, i, tx, tz) * e;
    const onRunway = A1.m === 'ground' || (A1.m === 'glide' && B1.m === 'ground');
    floor[i] = onRunway ? -1e9 : under(ground, x[i], z[i], tx, tz, 45) + CLEAR;
    if (A1.m === 'ground' && land < 0) land = i;
    if (A1.m === 'glide' && B1.m === 'ground') y[i] = A1.y + (GROUND_Y - A1.y) * f;   // pente d'approche droite
  }
  // jamais sous le relief, puis des pentes qu'un gros porteur peut tenir (on ne fait que monter les points)
  const lift = () => {
    for (let i = 0; i < n; i++) if (y[i] < floor[i]) y[i] = floor[i];
    for (let i = n - 2; i >= 0; i--) { const lim = y[i + 1] - CLIMB * (s[i + 1] - s[i]); if (y[i] < lim && floor[i] > -1e8) y[i] = lim; }
    for (let i = 1; i < n; i++) { const lim = y[i - 1] - DIVE * (s[i] - s[i - 1]); if (y[i] < lim && floor[i] > -1e8) y[i] = lim; }
  };
  lift();
  const tmp = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) { let t = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(n - 1, i + 8); k++) { t += y[k]; c++; } tmp[i] = floor[i] < -1e8 ? y[i] : t / c; }
    y.set(tmp); lift();
  }
  // en finale, on ne fait que descendre
  const al = path.findIndex((p) => p.seg >= ctrl.length - 5), landAt = land < 0 ? n - 1 : land;
  for (let i = al + 1; i <= landAt; i++) if (y[i] > y[i - 1]) y[i] = y[i - 1];
  // contrôle : plus petit rayon de virage et plus petite marge sous le ventre
  let minR = Infinity, minClear = Infinity;
  for (let i = 6; i < n - 6; i++) {
    const a1 = Math.atan2(x[i] - x[i - 6], z[i] - z[i - 6]), a2 = Math.atan2(x[i + 6] - x[i], z[i + 6] - z[i]);
    let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
    if (da > 1e-4) minR = Math.min(minR, (s[i + 6] - s[i - 6]) / 2 / da);
    if (floor[i] > -1e8) minClear = Math.min(minClear, y[i] - (floor[i] - CLEAR));
  }
  // la vitesse qui fait arriver le transport à l'heure dite
  return { id, map: A.id, name: R.name, model: R.model, time: R.time, speed: s[landAt] / R.time, n, x, y, z, s, len: s[n - 1], land: landAt, landS: s[landAt], minR, minClear };
}

// Position sur la route à la distance d (interpolée) ; tx, tz, ty : direction ; turn : courbure signée (1/m)
export function routeAt(R, d) {
  const s = R.s, n = R.n;
  d = Math.max(0, Math.min(R.len - 0.01, d));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
  const f = (d - s[lo]) / ((s[hi] - s[lo]) || 1), at = (a) => a[lo] + (a[hi] - a[lo]) * f;
  const a = Math.max(0, lo - 4), b = Math.min(n - 1, hi + 4), L = Math.hypot(R.x[b] - R.x[a], R.z[b] - R.z[a]) || 1;
  const a1 = Math.atan2(R.x[lo] - R.x[a], R.z[lo] - R.z[a]), a2 = Math.atan2(R.x[b] - R.x[hi], R.z[b] - R.z[hi]);
  let da = a2 - a1; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
  return { x: at(R.x), y: at(R.y), z: at(R.z), tx: (R.x[b] - R.x[a]) / L, tz: (R.z[b] - R.z[a]) / L, ty: (R.y[b] - R.y[a]) / L, turn: da / ((s[b] - s[a]) || 1) * 2 };
}
