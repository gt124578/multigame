// The Backrooms - L'allure de l'entité (sans DOM)
// Elle se déplace comme un corps : jamais à travers un mur, un meuble, un casier ou la cage d'un escalier, jamais
// au-dessus d'un trou. Elle se tourne avant d'avancer (ni pas de côté ni marche arrière), accélère et freine, monte et
// descend vraiment les marches, et peut sauter dans un trou pour suivre quelqu'un à l'étage du dessous.
// Ses chemins se cherchent sur une grille fine (50 cm) où chaque obstacle est grossi de la largeur de son corps, puis
// se tendent en lignes droites aussi longues que son corps peut les suivre sans rien frôler.
import { CELL_SIZE, FLOOR_DY, PIT_HALF, pillarDist } from './map.js';
import { LOCKER_R } from './hides.js';

const C = CELL_SIZE;
const DT = 1 / 60;
export const BODY_R = 0.34; // demi-largeur de son corps : rien ne s'approche plus près de son centre
const PLAN_R = 0.42; // ses chemins gardent un peu plus de marge
const RES = 0.5; // une case de la grille fine
const SUB = Math.round(C / RES);
const FALL_G = 15; // sa chute dans un trou : elle se jette (un peu plus vite que la pesanteur)
const STAIR_K = 0.85; // dans les marches, un peu moins vite
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

// ------------------------------------------------------------------ escaliers (mêmes repères que sim.js)
// u le long des volées (0 à 3 cases), v en travers (0 à 1 case : première volée, 1 à 2 : seconde) ; palier : u > 2 cases
const local = (st, x, z) => {
  const ex = x - st.ox;
  const ez = z - st.oz;
  return { u: ex * st.dx + ez * st.dz, v: ex * st.px + ez * st.pz };
};
const point = (st, u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
const height = (u, v) => {
  if (u >= 2 * C) return 0.5;
  const f = Math.max(0, u) / (2 * C);
  return v < C ? f * 0.5 : 1 - f * 0.5;
};
const inside = (q) => q.u >= 0 && q.u <= 3 * C && q.v >= 0 && q.v <= 2 * C;
export function cageAt(stairs, x, z) {
  for (const st of stairs || []) {
    const q = local(st, x, z);
    if (inside(q)) return { st, u: q.u, v: q.v, h: height(q.u, q.v) };
  }
  return null;
}
// le trajet dans la cage : on entre devant une volée, on la suit, demi-tour sur le palier, on ressort par l'autre
const UP = [[-0.35, 0.5], [0.4, 0.5], [2.3, 0.5], [2.55, 1.0], [2.3, 1.5], [-0.6, 1.5]];
const DOWN = [[-0.35, 1.5], [0.4, 1.5], [2.3, 1.5], [2.55, 1.0], [2.3, 0.5], [-0.6, 0.5]];

// ------------------------------------------------------------------ la grille fine d'un étage
function build(sim, floor) {
  const m = sim.fm(floor);
  const W = m.W;
  const H = m.H;
  const below = !!(sim.floors && sim.floors[floor + 1]);
  // 0 libre, 1 plein (mur, étagère, ascenseur, cage d'escalier), 2 pilier (sa vraie forme), 3 trou (2 m sur 2)
  const solid = new Uint8Array(W * H);
  const cage = new Set();
  for (const st of sim.stairs || []) for (const k of st.cells) cage.add(k.gz * W + k.gx);
  // (Level 1 : les murs qui ne bougent pas ; les rideaux des quais, elle les force, voir sim.dockPush)
  const wall = m.navWall ? (gx, gz) => m.navWall(gx, gz) : (gx, gz) => m.isWall(gx, gz);
  for (let gz = 0; gz < H; gz++) {
    for (let gx = 0; gx < W; gx++) {
      const k = gz * W + gx;
      if (wall(gx, gz)) solid[k] = m.pillarAt && m.pillarAt(gx, gz) ? 2 : 1;
      else if (cage.has(k)) solid[k] = 1;
      else if (below && m.pitAt && m.pitAt(gx, gz) >= 0) solid[k] = 3;
    }
  }
  // meubles et casiers : des cercles, rangés par case (chaque case connaît ceux qui la touchent à 1 m près)
  const bucket = new Array(W * H);
  const addCircle = (x, z, r) => {
    const reach = r + 1;
    for (let gz = Math.floor((z - reach) / C); gz <= Math.floor((z + reach) / C); gz++) {
      for (let gx = Math.floor((x - reach) / C); gx <= Math.floor((x + reach) / C); gx++) {
        if (gx < 0 || gz < 0 || gx >= W || gz >= H) continue;
        (bucket[gz * W + gx] || (bucket[gz * W + gx] = [])).push({ x, z, r });
      }
    }
  };
  for (const pr of m.props || []) if (!pr.walk && !pr.float && pr.r > 0.02) addCircle(pr.x, pr.z, pr.r);
  for (const h of m.hides || []) addCircle(h.x, h.z, LOCKER_R);
  // la distance libre autour d'un point (plafonnée à cap)
  const clear = (x, z, cap = 1) => {
    let best = cap;
    const gx0 = Math.floor((x - cap) / C);
    const gx1 = Math.floor((x + cap) / C);
    const gz0 = Math.floor((z - cap) / C);
    const gz1 = Math.floor((z + cap) / C);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const s = gx < 0 || gz < 0 || gx >= W || gz >= H ? 1 : solid[gz * W + gx];
        if (!s) continue;
        let d;
        if (s === 1) {
          const ex = Math.max(gx * C - x, 0, x - (gx + 1) * C);
          const ez = Math.max(gz * C - z, 0, z - (gz + 1) * C);
          d = Math.hypot(ex, ez);
        } else if (s === 2) {
          d = pillarDist(m.pillarAt(gx, gz), x, z); // pilier carré ou rond, cloison fine
        } else {
          const p = m.pits[m.pitAt(gx, gz)];
          d = Math.hypot(Math.max(0, Math.abs(x - p.x) - PIT_HALF), Math.max(0, Math.abs(z - p.z) - PIT_HALF));
        }
        if (d < best) {
          if (d <= 0) return 0;
          best = d;
        }
      }
    }
    const gx = Math.floor(x / C);
    const gz = Math.floor(z / C);
    const list = gx >= 0 && gz >= 0 && gx < W && gz < H ? bucket[gz * W + gx] : null;
    if (list) {
      for (const c of list) {
        const d = Math.hypot(x - c.x, z - c.z) - c.r;
        if (d < best) {
          if (d <= 0) return 0;
          best = d;
        }
      }
    }
    // Poolrooms (cloisons minces, colonnes) et Level 5 (meubles, montants des portes) : la collision propre à la carte
    if (m.collide && m.collide(x, z, best)) return 0;
    return best;
  };
  const FW = W * SUB;
  const FH = H * SUB;
  const free = new Uint8Array(FW * FH);
  for (let fz = 0; fz < FH; fz++) {
    for (let fx = 0; fx < FW; fx++) {
      if (solid[Math.floor(fz / SUB) * W + Math.floor(fx / SUB)] === 1) continue;
      if (clear((fx + 0.5) * RES, (fz + 0.5) * RES, PLAN_R) >= PLAN_R) free[fz * FW + fx] = 1;
    }
  }
  // les morceaux d'un seul tenant (8 voisins, sans couper les coins) : une cible dans un autre morceau est hors d'atteinte
  const comp = new Int32Array(FW * FH).fill(-1);
  const queue = new Int32Array(FW * FH);
  let n = 0;
  for (let s = 0; s < FW * FH; s++) {
    if (!free[s] || comp[s] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    comp[s] = n;
    while (head < tail) {
      const k = queue[head++];
      const x = k % FW;
      const z = (k - x) / FW;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d];
        const nz = z + DZ[d];
        if (nx < 0 || nz < 0 || nx >= FW || nz >= FH) continue;
        const nk = nz * FW + nx;
        if (!free[nk] || comp[nk] >= 0) continue;
        if (d >= 4 && (!free[z * FW + nx] || !free[nz * FW + x])) continue;
        comp[nk] = n;
        queue[tail++] = nk;
      }
    }
    n++;
  }
  return {
    m,
    floor,
    below,
    FW,
    FH,
    free,
    comp,
    clear,
    g: new Float32Array(FW * FH),
    from: new Int32Array(FW * FH),
    seen: new Uint32Array(FW * FH),
    done: new Uint32Array(FW * FH),
    gen: 0,
    hk: new Float64Array(4096),
    hv: new Int32Array(4096),
  };
}

// la grille de l'étage, faite une fois (les murs, les trous, les meubles et les casiers ne bougent pas)
export function navOf(sim, floor = 0) {
  const m = sim.fm(floor);
  const below = !!(sim.floors && sim.floors[floor + 1]);
  const key = `${(sim.stairs || []).length}:${below ? 1 : 0}:${(m.props || []).length}:${(m.hides || []).length}`;
  if (!m.mnav || m.mnavKey !== key) {
    m.mnav = build(sim, floor);
    m.mnavKey = key;
  }
  return m.mnav;
}

// le point est-il dans la grande partie de l'étage où l'entité circule ? Un joueur se faufile partout, elle non : un
// recoin dont l'entrée est trop étroite pour son corps l'y enfermerait (où elle n'apparaît donc jamais)
export function roamable(sim, floor, x, z) {
  const N = navOf(sim, floor);
  if (N.main === undefined) {
    const size = new Map();
    for (let k = 0; k < N.comp.length; k++) if (N.comp[k] >= 0) size.set(N.comp[k], (size.get(N.comp[k]) || 0) + 1);
    N.main = -1;
    let best = 0;
    for (const [c, n] of size) if (n > best) (best = n), (N.main = c);
  }
  return snap(N, x, z, 1.2, N.main) >= 0;
}

// la place libre autour d'un point, à son étage (pour ses déplacements)
export const clearAt = (sim, floor, x, z, cap = 1) => navOf(sim, floor).clear(x, z, cap);

// une ligne droite que son corps suit sans rien frôler
export function clearLine(N, x0, z0, x1, z1, r = BODY_R + 0.04) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (N.clear(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r) < r) return false;
  }
  return true;
}

const fineOf = (N, x, z) => {
  const fx = Math.floor(x / RES);
  const fz = Math.floor(z / RES);
  return fx < 0 || fz < 0 || fx >= N.FW || fz >= N.FH ? -1 : fz * N.FW + fx;
};

// la case fine libre la plus proche d'un point (jusqu'à maxR mètres), dans le morceau comp si on le demande
function snap(N, x, z, maxR = 2, comp = -1) {
  const k0 = fineOf(N, x, z);
  if (k0 >= 0 && N.free[k0] && (comp < 0 || N.comp[k0] === comp)) return k0;
  const fx = Math.floor(x / RES);
  const fz = Math.floor(z / RES);
  const R = Math.ceil(maxR / RES);
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r <= R; r++) {
    // un anneau après l'autre : on s'arrête dès qu'un anneau ne peut plus faire mieux
    if (best >= 0 && (r - 1) * RES > bd) break;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ix = fx + dx;
        const iz = fz + dz;
        if (ix < 0 || iz < 0 || ix >= N.FW || iz >= N.FH) continue;
        const k = iz * N.FW + ix;
        if (!N.free[k] || (comp >= 0 && N.comp[k] !== comp)) continue;
        const d = Math.hypot((ix + 0.5) * RES - x, (iz + 0.5) * RES - z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
  }
  return best;
}

function heapPush(N, key, v, n) {
  if (n >= N.hk.length) {
    const k2 = new Float64Array(N.hk.length * 2);
    k2.set(N.hk);
    const v2 = new Int32Array(N.hv.length * 2);
    v2.set(N.hv);
    N.hk = k2;
    N.hv = v2;
  }
  const hk = N.hk;
  const hv = N.hv;
  let i = n;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hk[p] <= key) break;
    hk[i] = hk[p];
    hv[i] = hv[p];
    i = p;
  }
  hk[i] = key;
  hv[i] = v;
}
function heapPop(N, n) {
  const hk = N.hk;
  const hv = N.hv;
  const top = hv[0];
  const key = hk[n - 1];
  const val = hv[n - 1];
  let i = 0;
  const m = n - 1;
  for (;;) {
    let c = 2 * i + 1;
    if (c >= m) break;
    if (c + 1 < m && hk[c + 1] < hk[c]) c++;
    if (hk[c] >= key) break;
    hk[i] = hk[c];
    hv[i] = hv[c];
    i = c;
  }
  hk[i] = key;
  hv[i] = val;
  return top;
}

// A* sur la grille fine (8 voisins, sans couper les coins). Renvoie les cases du départ à la cible (ou à la case la
// plus proche atteinte, si la recherche s'arrête avant)
function astar(N, s, t, cap = 50000) {
  const { FW, FH, free, g, from, seen, done } = N;
  const gen = (N.gen = (N.gen + 1) >>> 0) || (N.gen = 1);
  const tx = t % FW;
  const tz = (t - tx) / FW;
  const H = (k) => {
    const x = k % FW;
    const dx = Math.abs(x - tx);
    const dz = Math.abs((k - x) / FW - tz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  let n = 0;
  g[s] = 0;
  seen[s] = gen;
  from[s] = -1;
  heapPush(N, H(s), s, n++);
  let best = s;
  let bestH = H(s);
  let count = 0;
  while (n > 0) {
    const k = heapPop(N, n--);
    if (done[k] === gen) continue;
    done[k] = gen;
    if (k === t) {
      best = t;
      break;
    }
    const h = H(k);
    if (h < bestH) {
      bestH = h;
      best = k;
    }
    if (++count > cap) break;
    const x = k % FW;
    const z = (k - x) / FW;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= FW || nz >= FH) continue;
      const nk = nz * FW + nx;
      if (!free[nk] || done[nk] === gen) continue;
      if (d >= 4 && (!free[z * FW + nx] || !free[nz * FW + x])) continue;
      const ng = g[k] + (d >= 4 ? Math.SQRT2 : 1);
      if (seen[nk] === gen && ng >= g[nk]) continue;
      seen[nk] = gen;
      g[nk] = ng;
      from[nk] = k;
      heapPush(N, ng + H(nk) * 1.001, nk, n++);
    }
  }
  const cells = [];
  for (let k = best; k !== -1; k = from[k]) {
    cells.push(k);
    if (k === s || cells.length > 100000) break;
  }
  cells.reverse();
  return { cells, reached: best === t };
}

// Un chemin d'un point à un autre du même étage : une liste de points (le premier est le prochain à atteindre).
// partial : la cible est hors d'atteinte (un trou, une arête, un autre morceau de l'étage) ; le chemin mène au plus près
export function findRoute(N, x0, z0, x1, z1) {
  const s = snap(N, x0, z0, 2.5);
  if (s < 0) return null;
  const comp = N.comp[s];
  let t = snap(N, x1, z1, 1.5, comp);
  let partial = false;
  if (t < 0) {
    t = snap(N, x1, z1, 30, comp);
    partial = true;
    if (t < 0) return null;
  }
  const exact = !partial && t === fineOf(N, x1, z1);
  const { cells, reached } = astar(N, s, t);
  if (!reached) partial = true;
  const FW = N.FW;
  const pts = [];
  // on ne garde que les coudes (les points alignés ne servent à rien)
  let pdx = 0;
  let pdz = 0;
  for (let i = 1; i < cells.length; i++) {
    const k = cells[i];
    const x = k % FW;
    const z = (k - x) / FW;
    const q = cells[i - 1];
    const qx = q % FW;
    const qz = (q - qx) / FW;
    const dx = x - qx;
    const dz = z - qz;
    if (pts.length && dx === pdx && dz === pdz) pts.pop();
    pts.push({ x: (x + 0.5) * RES, z: (z + 0.5) * RES });
    pdx = dx;
    pdz = dz;
  }
  // d'où elle est, la ligne droite vers le premier coude frôle un angle (elle s'est arrêtée de travers, tout contre) :
  // elle passe d'abord par le centre de la case libre d'où part le chemin
  if (pts.length && !clearLine(N, x0, z0, pts[0].x, pts[0].z, BODY_R)) pts.unshift({ x: (s % FW + 0.5) * RES, z: (Math.floor(s / FW) + 0.5) * RES });
  // le dernier point : la cible elle-même si elle est dégagée
  if (!partial && (exact || Math.hypot(x1 - (t % FW + 0.5) * RES, z1 - (Math.floor(t / FW) + 0.5) * RES) < 1.2) && N.clear(x1, z1, BODY_R) >= BODY_R) {
    const last = pts.length ? pts[pts.length - 1] : { x: x0, z: z0 };
    if (clearLine(N, last.x, last.z, x1, z1)) {
      if (pts.length) pts[pts.length - 1] = { x: x1, z: z1 };
      else pts.push({ x: x1, z: z1 });
    }
  }
  return { pts, partial };
}

// ------------------------------------------------------------------ changer d'étage
// les passages vers l'étage toFloor : un escalier (on monte toujours ; on ne descend que si la porte du haut n'est
// plus cadenassée) ou, pour descendre en poursuite, un trou
function portals(sim, M, toFloor, allowDrop) {
  const out = [];
  const from = M.floor || 0;
  for (const st of sim.stairs || []) {
    if (from === 1 && toFloor === 0) out.push({ kind: 'stairs', st, dir: 'up', entry: point(st, UP[0][0] * C, UP[0][1] * C), exit: point(st, UP[5][0] * C, UP[5][1] * C), len: 6.5 * C });
    else if (from === 0 && toFloor === 1 && !sim.stairsLocked) out.push({ kind: 'stairs', st, dir: 'down', entry: point(st, DOWN[0][0] * C, DOWN[0][1] * C), exit: point(st, DOWN[5][0] * C, DOWN[5][1] * C), len: 6.5 * C });
  }
  if (allowDrop && from === 0 && toFloor === 1 && sim.floors[1]) {
    const N = navOf(sim, 0);
    for (const p of sim.fm(0).pits || []) {
      // au bord du trou, du côté le plus proche d'elle, là où elle tient debout
      let best = null;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const e = { x: p.x + ax * (PIT_HALF + BODY_R + 0.22), z: p.z + az * (PIT_HALF + BODY_R + 0.22) };
        if (N.clear(e.x, e.z, BODY_R + 0.05) < BODY_R + 0.05) continue;
        const d = Math.hypot(e.x - M.x, e.z - M.z);
        if (!best || d < best.d) best = { ...e, d };
      }
      if (best) out.push({ kind: 'drop', pit: p, entry: { x: best.x, z: best.z }, exit: { x: p.x, z: p.z }, len: 2 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ le plan
// Va vers (x, z) à l'étage floor. Si c'est l'autre étage, elle passe par l'escalier (ou par un trou si allowDrop) le
// plus court. M.goal garde la destination demandée ; M.path, M.pathIndex le chemin à suivre à son étage
export function planTo(sim, M, x, z, floor = M.floor || 0, opt = {}) {
  M.goal = { x, z };
  M.goalF = floor;
  M.planOpt = opt;
  M.arrived = false;
  M.blockT = 0;
  if (M.trav) return; // dans l'escalier ou au bord d'un trou : elle finit ce qu'elle a commencé
  // déjà dans une cage d'escalier (on l'y a mise) : elle en sort par la volée de l'étage où elle va
  const cg = sim.stairs && sim.stairs.length ? cageAt(sim.stairs, M.x, M.z) : null;
  if (cg) {
    const toA = floor === 1; // la première volée mène en bas, la seconde en haut
    const inA = cg.u < 2 * C && cg.v < C;
    const inB = cg.u < 2 * C && cg.v >= C;
    const lane = toA ? 0.5 : 1.5;
    const pts = (toA && inB) || (!toA && inA) ? [[2.3, cg.v < C ? 0.5 : 1.5], [2.55, 1.0], [2.3, lane], [-0.6, lane]] : cg.u >= 2 * C ? [[2.3, lane], [-0.6, lane]] : [[-0.6, lane]];
    M.trav = { kind: 'stairs', st: cg.st, dir: toA ? 'down' : 'up', pts: pts.map(([u, v]) => point(cg.st, u * C, v * C)), i: 0, door: false };
    M.path = [];
    M.pathIndex = 0;
    return;
  }
  const f = M.floor || 0;
  const N = navOf(sim, f);
  let tx = x;
  let tz = z;
  M.portal = null;
  if (floor !== f) {
    const list = portals(sim, M, floor, !!opt.allowDrop).filter((p) => !(M.badPortal && M.badPortal.t > sim.time && M.badPortal.key === portalKey(p)));
    let best = null;
    for (const p of list) {
      const cost = Math.hypot(p.entry.x - M.x, p.entry.z - M.z) * 1.35 + p.len + Math.hypot(p.exit.x - x, p.exit.z - z);
      if (!best || cost < best.cost) best = { p, cost };
    }
    if (!best) {
      M.path = [];
      M.pathIndex = 0;
      M.route = { partial: true };
      M.arrived = true;
      return;
    }
    M.portal = best.p;
    tx = best.p.entry.x;
    tz = best.p.entry.z;
  }
  const r = findRoute(N, M.x, M.z, tx, tz);
  M.path = r ? r.pts : [];
  M.pathIndex = 0;
  M.route = { x: tx, z: tz, floor: f, partial: !r || r.partial };
  if (M.portal && M.route.partial) {
    // ce passage est hors d'atteinte d'ici : elle en essaiera un autre
    M.badPortal = { key: portalKey(M.portal), t: sim.time + 8 };
    M.portal = null;
  }
}
const portalKey = (p) => (p.kind === 'stairs' ? `s${p.st.id}${p.dir}` : `p${p.pit.gx},${p.pit.gz}`);

// ------------------------------------------------------------------ la marche
// tourne vers un point, au plus de rate rad/s ; renvoie l'écart restant
export function faceTo(M, x, z, rate) {
  const want = Math.atan2(x - M.x, z - M.z);
  const e = angle(want - (M.yaw || 0));
  const t = rate * DT;
  M.yaw = angle((M.yaw || 0) + Math.max(-t, Math.min(t, e)));
  return Math.abs(angle(want - M.yaw));
}

// un pas vers (sx, sz) : elle tourne (rate), accélère ou freine, avance droit devant elle. left : distance jusqu'au
// bout du trajet (pour s'y arrêter sans le dépasser). free : sans collisions (dans la cage d'escalier)
function stride(sim, N, M, sx, sz, o, left = Infinity, free = false) {
  const dx = sx - M.x;
  const dz = sz - M.z;
  const d = Math.hypot(dx, dz);
  let align = 0;
  if (d > 1e-3) {
    const err = faceTo(M, sx, sz, o.turn || 4);
    // elle ne fait pas un pas tant qu'elle ne fait pas face (elle se retourne d'abord), pleine vitesse une fois alignée
    align = Math.max(0, Math.min(1, (Math.cos(err) - 0.35) / 0.6));
  }
  let vt = (o.speed || 0) * align;
  if (left < Infinity) vt = Math.min(vt, Math.sqrt(2 * (o.decel || 7) * Math.max(0, left)));
  const a = vt > (M.v || 0) ? o.accel || 5 : o.decel || 7;
  M.v = (M.v || 0) + Math.max(-a * DT, Math.min(a * DT, vt - (M.v || 0)));
  if (M.v < 0.005) {
    M.v = 0;
    return 0;
  }
  let step = M.v * DT;
  if (left < Infinity) step = Math.min(step, left);
  const fx = Math.sin(M.yaw);
  const fz = Math.cos(M.yaw);
  if (free) {
    M.x += fx * step;
    M.z += fz * step;
    return step;
  }
  return slide(N, M, fx, fz, step);
}

// avance de step selon (fx, fz) sans entrer dans un obstacle ; contre un mur, elle glisse le long
function slide(N, M, fx, fz, step) {
  const c0 = N.clear(M.x, M.z, BODY_R);
  const ok = (x, z) => {
    const c = N.clear(x, z, BODY_R);
    return c >= BODY_R - 1e-6 || c > c0 + 1e-5;
  };
  const nx = M.x + fx * step;
  const nz = M.z + fz * step;
  if (ok(nx, nz)) {
    M.x = nx;
    M.z = nz;
    return step;
  }
  // contre un angle ou un meuble rond : elle le contourne en glissant le long (la direction qui l'en éloigne vient
  // de la place libre autour d'elle), au lieu de rester plantée l'épaule dans le coin
  const e = 0.02;
  const gx = N.clear(M.x + e, M.z, 1) - N.clear(M.x - e, M.z, 1);
  const gz = N.clear(M.x, M.z + e, 1) - N.clear(M.x, M.z - e, 1);
  const gl = Math.hypot(gx, gz);
  if (gl > 1e-6) {
    const ux = gx / gl;
    const uz = gz / gl;
    const dot = fx * ux + fz * uz;
    if (dot < 0) {
      const tx = fx - dot * ux;
      const tz = fz - dot * uz;
      const tl = Math.hypot(tx, tz);
      if (tl > 0.25) {
        const s = step * tl;
        const ax = M.x + (tx / tl) * s + ux * s * 0.15;
        const az = M.z + (tz / tl) * s + uz * s * 0.15;
        if (ok(ax, az)) {
          M.x = ax;
          M.z = az;
          return s;
        }
      }
    }
  }
  const okX = Math.abs(fx) > 0.2 && ok(nx, M.z);
  const okZ = Math.abs(fz) > 0.2 && ok(M.x, nz);
  if (okX && (!okZ || Math.abs(fx) >= Math.abs(fz))) {
    M.x = nx;
    return Math.abs(fx) * step;
  }
  if (okZ) {
    M.z = nz;
    return Math.abs(fz) * step;
  }
  return 0;
}

// Un pas le long de son chemin (ou droit sur sa proie si elle la voit et que la voie est libre).
// o : { speed, turn, accel, decel, direct: { x, z } (sa proie), stopR, avoid(x, z) (un endroit où ne pas entrer) }
export function move(sim, M, o = {}) {
  M.crossed = false;
  if (M.trav) {
    traverse(sim, M, o);
    M.y = feetOf(sim, M);
    return;
  }
  const f = M.floor || 0;
  const N = navOf(sim, f);
  const x0 = M.x;
  const z0 = M.z;
  // au bord d'un passage (escalier, trou) : elle s'y engage
  if (M.portal) {
    const e = Math.hypot(M.portal.entry.x - M.x, M.portal.entry.z - M.z);
    if (e < 0.6 || (e < 1.4 && (!M.path || M.pathIndex >= M.path.length - 1) && (M.v || 0) < 0.5)) {
      startTraversal(sim, M, M.portal);
      traverse(sim, M, o);
      M.moved = Math.hypot(M.x - x0, M.z - z0);
      M.y = feetOf(sim, M);
      return;
    }
  }
  let sx = null;
  let sz = null;
  let left = Infinity;
  const direct = o.direct && clearLine(N, M.x, M.z, o.direct.x, o.direct.z);
  // plus de chemin alors que le but est encore loin (elle fonçait droit sur sa proie, qui vient de passer un angle) :
  // un nouveau chemin tout de suite, sans marquer d'arrêt
  if (!direct && !M.portal && M.goal && (!M.path || M.pathIndex >= M.path.length) && M.replanAt !== sim.time && Math.hypot(M.goal.x - M.x, M.goal.z - M.z) > Math.max(0.4, (o.stopR || 0) + 0.25)) {
    M.replanAt = sim.time;
    planTo(sim, M, M.goal.x, M.goal.z, M.goalF ?? f, M.planOpt || {});
    if (M.trav) {
      traverse(sim, M, o);
      M.moved = Math.hypot(M.x - x0, M.z - z0);
      M.y = feetOf(sim, M);
      return;
    }
  }
  // droit sur sa proie
  if (direct) {
    sx = o.direct.x;
    sz = o.direct.z;
    M.pathIndex = M.path ? M.path.length : 0;
    M.repathT = Math.min(M.repathT || 0, 0.1);
  } else if (M.path && M.pathIndex < M.path.length) {
    // le point le plus lointain du chemin qu'elle peut déjà atteindre en ligne droite (quelques essais par pas)
    for (let k = 0; k < 4 && M.pathIndex + 1 < M.path.length; k++) {
      const q = M.path[M.pathIndex + 1];
      if (!clearLine(N, M.x, M.z, q.x, q.z)) break;
      M.pathIndex++;
    }
    let w = M.path[M.pathIndex];
    if (Math.hypot(w.x - M.x, w.z - M.z) < 0.35 && M.pathIndex + 1 < M.path.length) w = M.path[++M.pathIndex];
    sx = w.x;
    sz = w.z;
    // le reste du chemin, pour s'arrêter au bout (pas au bord d'un passage : elle y entre sans freiner)
    if (!M.portal) {
      left = Math.hypot(w.x - M.x, w.z - M.z);
      for (let i = M.pathIndex + 1; i < M.path.length; i++) left += Math.hypot(M.path[i].x - M.path[i - 1].x, M.path[i].z - M.path[i - 1].z);
      left = Math.max(0, left - (o.stopR || 0));
    }
  }
  if (sx === null) {
    // rien à suivre : elle s'arrête (en freinant)
    stride(sim, N, M, M.x + Math.sin(M.yaw), M.z + Math.cos(M.yaw), { ...o, speed: 0 }, 0);
    M.arrived = true;
  } else if (o.avoid && o.avoid(M.x + (sx - M.x) * 0.1, M.z + (sz - M.z) * 0.1) && !o.avoid(M.x, M.z)) {
    // devant un jet de vapeur : elle attend qu'il cesse
    M.steamWait = true;
    stride(sim, N, M, sx, sz, { ...o, speed: 0 }, 0);
  } else {
    M.steamWait = false;
    const moved = stride(sim, N, M, sx, sz, o, left);
    // contre un obstacle (un meuble poussé de travers, une épaule dans un angle) : elle cherche un autre chemin
    const want = M.v > 0.3;
    M.blockT = want && moved < M.v * DT * 0.25 ? (M.blockT || 0) + DT : 0;
    if (M.blockT > 0.35) {
      M.blockT = 0;
      M.v = 0;
      M.repathT = 0;
      M.bumps = (M.bumps || 0) + 1;
    } else if (moved > 0.01) M.bumps = 0;
    const end = M.path && M.pathIndex >= M.path.length - 1;
    if (end && M.path.length && Math.hypot(M.path[M.path.length - 1].x - M.x, M.path[M.path.length - 1].z - M.z) < Math.max(0.3, (o.stopR || 0) + 0.05)) M.arrived = true;
  }
  M.moved = Math.hypot(M.x - x0, M.z - z0);
  M.y = feetOf(sim, M);
}

// ------------------------------------------------------------------ escaliers et trous
function startTraversal(sim, M, p) {
  M.portal = null;
  M.path = [];
  M.pathIndex = 0;
  if (p.kind === 'stairs') {
    const pts = (p.dir === 'up' ? UP : DOWN).slice(1).map(([u, v]) => point(p.st, u * C, v * C));
    M.trav = { kind: 'stairs', st: p.st, dir: p.dir, pts, i: 0, door: false };
  } else {
    M.trav = { kind: 'drop', pit: p.pit, phase: 'peer', t: 0.9 + Math.random() * 0.6, edge: { x: M.x, z: M.z } };
  }
}

function traverse(sim, M, o) {
  const T = M.trav;
  if (T.kind === 'stairs') {
    const st = T.st;
    const w = T.pts[T.i];
    const last = T.i === T.pts.length - 1;
    if (!last && Math.hypot(w.x - M.x, w.z - M.z) < 0.45) {
      T.i++;
      return traverse(sim, M, o);
    }
    const before = local(st, M.x, M.z);
    stride(sim, null, M, w.x, w.z, { ...o, speed: Math.max(1.2, (o.speed || 0) * STAIR_K), turn: Math.max(4, o.turn || 4) }, Infinity, true);
    // jamais par-dessus une rampe : dans les volées, elle reste du côté où elle est (le palier seul permet de changer)
    const r = BODY_R;
    let { u, v } = local(st, M.x, M.z);
    if (u < 2 * C) {
      const laneA = (before.u < 2 * C ? before.v : v) < C;
      v = laneA ? Math.max(r, Math.min(C - r, v)) : Math.max(C + r, Math.min(2 * C - r, v));
    }
    u = Math.min(3 * C - r, u);
    const p = point(st, u, v);
    M.x = p.x;
    M.z = p.z;
    // l'étage change à mi-hauteur
    if (inside({ u, v })) {
      const fl = height(u, v) > 0.5 ? 0 : 1;
      if (fl !== (M.floor || 0)) {
        M.floor = fl;
        sim.emit({ type: 'monsterStairs', floor: fl, up: fl === 0, x: M.x, z: M.z });
      }
    }
    // la porte du haut : elle la passe d'un coup d'épaule (on l'entend claquer)
    const throughDoor = before.v > C && v > C && ((before.u >= 0 && u < 0) || (before.u < 0 && u >= 0));
    if (throughDoor && !T.door) {
      T.door = true;
      sim.emit({ type: 'monsterDoor', x: M.x, z: M.z, floor: 0 });
    }
    if (last && Math.hypot(w.x - M.x, w.z - M.z) < 0.25) {
      M.trav = null;
      M.crossed = true;
      M.repathT = 0;
    }
    return;
  }
  // le trou : elle se penche au bord, regarde en bas… et saute
  const pit = T.pit;
  if (T.phase === 'peer') {
    stride(sim, navOf(sim, M.floor || 0), M, pit.x, pit.z, { ...o, speed: 0 }, 0);
    T.t -= DT;
    if (T.t <= 0 && faceTo(M, pit.x, pit.z, 6) < 0.2) {
      T.phase = 'leap';
      M.v = 3.2;
      sim.emit({ type: 'monsterDrop', x: M.x, z: M.z, floor: M.floor || 0 });
    }
    return;
  }
  if (T.phase === 'leap') {
    faceTo(M, pit.x, pit.z, 10);
    const d = Math.hypot(pit.x - M.x, pit.z - M.z);
    const step = Math.min(d, M.v * DT);
    if (d > 1e-3) {
      M.x += ((pit.x - M.x) / d) * step;
      M.z += ((pit.z - M.z) / d) * step;
    }
    // dès qu'elle n'a plus le sol sous les pieds, elle tombe
    if (Math.abs(M.x - pit.x) < PIT_HALF - BODY_R * 0.5 && Math.abs(M.z - pit.z) < PIT_HALF - BODY_R * 0.5) {
      T.phase = 'fall';
      T.vy = 0;
      M.dropY = 0;
    }
    return;
  }
  if (T.phase === 'fall') {
    // en tombant, elle finit d'arriver au milieu du puits
    const d = Math.hypot(pit.x - M.x, pit.z - M.z);
    if (d > 1e-3) {
      const step = Math.min(d, 2 * DT);
      M.x += ((pit.x - M.x) / d) * step;
      M.z += ((pit.z - M.z) / d) * step;
    }
    T.vy += FALL_G * DT;
    M.dropY = (M.dropY || 0) + T.vy * DT;
    if (M.dropY >= FLOOR_DY) {
      M.dropY = 0;
      M.floor = (M.floor || 0) + 1;
      M.v = 0;
      T.phase = 'land';
      T.t = 0.75;
      sim.emit({ type: 'monsterLand', x: M.x, z: M.z, floor: M.floor });
    }
    return;
  }
  // accroupie un instant après la chute, puis elle repart
  T.t -= DT;
  if (T.t <= 0) {
    M.trav = null;
    M.crossed = true;
    M.repathT = 0;
  }
}

// une poussée (elle titube en arrière, sonnée) : vitesse v (m/s) selon (dx, dz), freinée en une demi-seconde
export function shove(M, dx, dz, v) {
  const d = Math.hypot(dx, dz) || 1;
  M.push = { x: dx / d, z: dz / d, v };
}
export function stagger(sim, M) {
  M.v = 0;
  const p = M.push;
  if (!p) return;
  const N = navOf(sim, M.floor || 0);
  slide(N, M, p.x, p.z, p.v * DT);
  p.v = Math.max(0, p.v - (2 + p.v * 5) * DT);
  if (p.v <= 0.01) M.push = null;
  M.y = feetOf(sim, M);
}

// la hauteur de ses pieds (0 : sol de l'étage du haut) : les marches, la chute dans un trou
export function feetOf(sim, M) {
  const s = sim.stairs && sim.stairs.length ? cageAt(sim.stairs, M.x, M.z) : null;
  if (s) return -FLOOR_DY + s.h * FLOOR_DY;
  return -(M.floor || 0) * FLOOR_DY - (M.dropY || 0);
}
