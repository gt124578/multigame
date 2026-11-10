// The Backrooms (Level 37) - Les Poolrooms, assemblées à partir de salles préfabriquées.
// Le niveau n'est plus un damier de cases : c'est une suite de salles dessinées, chacune avec sa propre forme, posées
// sur une grille grossière de modules de 10 m (4 cases) et reliées par des portes en arc percées dans les cloisons.
//   lagoon  2 × 2 modules : un bassin en haricot aux bords courbes, des îlots secs, de grosses colonnes (photo 1)
//   groin   2 × 2 : un bassin aux angles arrondis sous des voûtes d'arêtes portées par des colonnes (photo 4)
//   tunnel  1 × n : un couloir inondé, voûté, rythmé d'arcs, sombre, éclairé à ses bouts (photo 2)
//   gallery 1 × n : une galerie voûtée claire, à l'eau aux chevilles (photo 3)
//   sky     2 × 1 : une halle sous verrière, un long bassin, des échelles, des hublots (photo 5)
//   wade    1 × 1 : une pataugeoire à quatre colonnes ; tech 1 × 1 : un local technique au sec (un volant de vanne)
// Le moteur garde sa grille de cases de 2,5 m (les cases hors des salles, et les flancs pleins des couloirs, sont des
// murs) ; en plus : les cloisons minces entre deux salles (segments, avec leurs portes), les colonnes (cercles), et la
// profondeur d'eau donnée en tout point par la forme du bassin de chaque salle.
// Bible de conception : « Bible de conception — Les Poolrooms (Level 37) ».
import { CELL_SIZE, T, itemList, spreadOut } from './map.js';
import { PIPES_LEVEL } from './level2.js';

const C = CELL_SIZE;
export const MOD = 4; // un module = 4 cases = 10 m
export const MODS = 12; // 12 × 12 modules
export const POOL_SIZE = MODS * MOD + 2;
export const POOL_CEIL = 4.5;
export const WALL_T = 0.3; // épaisseur d'une cloison
export const DOOR = { w: 3, h: 3.2 }; // une porte en plein cintre : 3 m de large, 3,20 m sous la clé
export const DEPTH = { WADE: 0.2, GALLERY: 0.25, TUNNEL: 0.6 };
// La sortie : trois toboggans colorés sortent des murs ; une fois les 3 volants de vanne trouvés, on se glisse dans
// l'un d'eux. Chaque couleur mène ailleurs (to : le niveau d'arrivée ; null tant qu'il n'existe pas : on sort des
// Backrooms). MOUTH : le tube, au ras du sol (rayon et hauteur du centre), et la distance où l'on s'y glisse.
export const SLIDES = [
  { color: 'red', name: 'RED', hex: '#e2402f', to: 4 }, // vers le Level 5, le Terror Hotel (HOTEL_LEVEL)
  { color: 'yellow', name: 'YELLOW', hex: '#f2bf1d', to: PIPES_LEVEL }, // les galeries de service (Level 2)
  { color: 'blue', name: 'BLUE', hex: '#2c7fe0', to: null },
];
export const MOUTH = { r: 0.62, y: 0.72, enter: 1.15 };

// objets abandonnés au bord des bassins (Poly Haven, CC0) ; face : dos au mur
export const L37_PROPS = [
  { m: 'plastic_monobloc_chair_01', h: 0.8, r: 0.3, chair: true },
  { m: 'WetFloorSign_01', h: 0.62, r: 0.22 },
  { m: 'painted_wooden_bench', h: 0.45, r: 0.5, face: true },
  { m: 'lifebuoy', h: 0.12, r: 0.36 },
];

// --- formes (distance signée : négative à l'intérieur) ---
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const sdCircle = (x, z, c) => Math.hypot(x - c.x, z - c.z) - c.r;
export const sdRoundRect = (x, z, b) => {
  const qx = Math.abs(x - b.cx) - b.hx + b.rad;
  const qz = Math.abs(z - b.cz) - b.hz + b.rad;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - b.rad;
};
// le bord du bassin d'une salle (null : pas de bassin), et ses îlots
export function poolSdf(room, x, z) {
  if (room.blobs) {
    let d = Infinity;
    for (const b of room.blobs) d = d === Infinity ? sdCircle(x, z, b) : smin(d, sdCircle(x, z, b), 2.2);
    return d;
  }
  if (room.basin) return sdRoundRect(x, z, room.basin);
  return null;
}
export function islandSdf(room, x, z) {
  let d = Infinity;
  for (const b of room.islands || []) d = Math.min(d, sdCircle(x, z, b));
  return d;
}
// hauteur d'eau d'une salle en un point : un bassin a un bord franc de 45 cm puis descend doucement
export function roomDepth(room, x, z) {
  if (room.flat !== undefined) return room.flat;
  const s = poolSdf(room, x, z);
  if (s === null || s >= 0) return 0;
  if (islandSdf(room, x, z) < 0) return 0;
  return Math.min(room.maxDepth, 0.45 + -s * 0.45);
}

export function createPoolMap(seed = 37) {
  const W = POOL_SIZE;
  const H = POOL_SIZE;
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // 1. Les salles sur la grille des modules : on part d'un lagon au centre et on greffe des salles sur les côtés
  const mod = new Int16Array(MODS * MODS).fill(-1);
  const rooms = [];
  const doors = [];
  const free = (mx, mz, mw, mh) => {
    if (mx < 0 || mz < 0 || mx + mw > MODS || mz + mh > MODS) return false;
    for (let j = mz; j < mz + mh; j++) for (let i = mx; i < mx + mw; i++) if (mod[j * MODS + i] >= 0) return false;
    return true;
  };
  const place = (type, mx, mz, mw, mh, extra = {}) => {
    const r = { id: rooms.length, type, mx, mz, mw, mh, x0: (1 + mx * MOD) * C, z0: (1 + mz * MOD) * C, w: mw * MOD * C, h: mh * MOD * C, ...extra };
    r.x1 = r.x0 + r.w;
    r.z1 = r.z0 + r.h;
    for (let j = mz; j < mz + mh; j++) for (let i = mx; i < mx + mw; i++) mod[j * MODS + i] = r.id;
    rooms.push(r);
    return r;
  };
  // une porte au milieu d'un bord de module commun à deux salles : (px, pz) sur la cloison ; along : 'x' si la cloison
  // court selon x
  const addDoor = (a, b, px, pz, along) => {
    if (doors.some((d) => Math.hypot(d.px - px, d.pz - pz) < 1)) return;
    doors.push({ a: a.id, b: b.id, px, pz, along, w: DOOR.w, h: DOOR.h, arch: true });
  };
  const edgeDoor = (a, b, sd) => addDoor(a, b, (1 + (sd.i + 0.5 + sd.dx * 0.5) * MOD) * C, (1 + (sd.j + 0.5 + sd.dz * 0.5) * MOD) * C, sd.dx ? 'z' : 'x');
  const SIZES = { lagoon: [2, 2], groin: [2, 2], wade: [1, 1], tech: [1, 1] };
  const start = place('lagoon', 5, 5, 2, 2);
  const WEIGHTS = [['tunnel', 4], ['gallery', 3], ['lagoon', 2], ['groin', 2], ['sky', 2], ['wade', 3]];
  const total = WEIGHTS.reduce((a, [, w]) => a + w, 0);
  const pickType = () => {
    let v = rnd() * total;
    for (const [t, w] of WEIGHTS) if ((v -= w) < 0) return t;
    return 'wade';
  };
  // les côtés d'où l'on peut greffer : (module de la salle, direction) ; un couloir ne se greffe que par ses bouts
  const sides = (r) => {
    const out = [];
    for (let j = r.mz; j < r.mz + r.mh; j++) {
      for (let i = r.mx; i < r.mx + r.mw; i++) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = i + dx;
          const nz = j + dz;
          if (nx >= r.mx && nx < r.mx + r.mw && nz >= r.mz && nz < r.mz + r.mh) continue;
          if (r.axis && (r.axis === 'x' ? dz !== 0 : dx !== 0)) continue;
          out.push({ i, j, dx, dz });
        }
      }
    }
    return out;
  };
  for (let tries = 0; tries < 900 && rooms.length < 20; tries++) {
    const R = pick(rooms);
    const sd = pick(sides(R));
    if (!sd) continue;
    let type = pickType();
    if (R.axis && (type === 'tunnel' || type === 'gallery') && rnd() < 0.6) type = 'wade'; // pas trois couloirs d'affilée
    let mw;
    let mh;
    let extra = {};
    if (type === 'tunnel' || type === 'gallery') {
      const L = 1 + Math.floor(rnd() * 3);
      const axis = sd.dx ? 'x' : 'z';
      [mw, mh] = axis === 'x' ? [L, 1] : [1, L];
      extra = { axis };
    } else if (type === 'sky') [mw, mh] = sd.dx ? [2, 1] : [1, 2];
    else [mw, mh] = SIZES[type];
    // la nouvelle salle touche le module (i, j) du côté (dx, dz) ; on la décale le long du bord au hasard
    const mx = sd.dx > 0 ? sd.i + 1 : sd.dx < 0 ? sd.i - mw : sd.i - Math.floor(rnd() * mw);
    const mz = sd.dz > 0 ? sd.j + 1 : sd.dz < 0 ? sd.j - mh : sd.j - Math.floor(rnd() * mh);
    if (!free(mx, mz, mw, mh)) continue;
    const r = place(type, mx, mz, mw, mh, extra);
    edgeDoor(R, r, sd);
  }
  // les 3 locaux techniques (un volant de vanne chacun) : greffés le plus loin possible du lagon de départ et les uns
  // des autres (à vol d'oiseau, en modules)
  const slots = [];
  for (const R of rooms) for (const sd of sides(R)) if (free(sd.i + sd.dx, sd.j + sd.dz, 1, 1)) slots.push({ x: sd.i + sd.dx, z: sd.j + sd.dz, R, sd });
  const modDist = (p) => (c) => Math.hypot(c.x - p.x, c.z - p.z);
  for (const t of spreadOut(slots, [{ x: start.mx + 0.5, z: start.mz + 0.5 }], 3, modDist, rnd)) {
    if (!free(t.x, t.z, 1, 1)) continue;
    edgeDoor(t.R, place('tech', t.x, t.z, 1, 1), t.sd);
  }
  for (let tries = 0; tries < 400 && rooms.filter((r) => r.type === 'tech').length < 3; tries++) {
    const R = pick(rooms);
    const sd = pick(sides(R));
    if (!sd) continue;
    if (!free(sd.i + sd.dx, sd.j + sd.dz, 1, 1)) continue;
    edgeDoor(R, place('tech', sd.i + sd.dx, sd.j + sd.dz, 1, 1), sd);
  }
  // quelques portes de plus entre salles voisines (des boucles), jamais sur le flanc d'un couloir
  for (const a of rooms) {
    for (const sd of sides(a)) {
      const nx = sd.i + sd.dx;
      const nz = sd.j + sd.dz;
      if (nx < 0 || nz < 0 || nx >= MODS || nz >= MODS) continue;
      const bi = mod[nz * MODS + nx];
      if (bi < 0 || bi === a.id) continue;
      const b = rooms[bi];
      if (b.axis && (b.axis === 'x' ? sd.dz !== 0 : sd.dx !== 0)) continue;
      if (doors.some((d) => (d.a === a.id && d.b === b.id) || (d.a === b.id && d.b === a.id))) continue;
      if (rnd() < 0.35) edgeDoor(a, b, sd);
    }
  }

  // 2. Le contenu de chaque salle : bassin, îlots, colonnes, voûtes, profondeur
  const cols = [];
  for (const r of rooms) {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    if (r.type === 'lagoon') {
      // un haricot : trois cercles fondus, à 3 m au moins des murs
      r.blobs = [];
      for (let k = 0; k < 3; k++) {
        const rr = 3 + rnd() * 2;
        r.blobs.push({ x: r.x0 + 3 + rr + rnd() * (r.w - 6 - 2 * rr), z: r.z0 + 3 + rr + rnd() * (r.h - 6 - 2 * rr), r: rr });
      }
      r.maxDepth = 1.2;
      r.islands = rnd() < 0.7 ? [{ x: r.blobs[0].x + (rnd() - 0.5) * 2, z: r.blobs[0].z + (rnd() - 0.5) * 2, r: 1.2 + rnd() * 0.8 }] : [];
      // de grosses colonnes, sur la plage ou dans l'eau, pas sur l'îlot
      let n = 0;
      for (let k = 0; k < 60 && n < 5; k++) {
        const c = { x: r.x0 + 2.5 + rnd() * (r.w - 5), z: r.z0 + 2.5 + rnd() * (r.h - 5), r: 0.7 };
        if (cols.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 4.5)) continue;
        if (islandSdf(r, c.x, c.z) < 0.8) continue;
        cols.push({ ...c, room: r.id });
        n++;
      }
      r.ceil = 'flat';
    } else if (r.type === 'groin') {
      r.basin = { cx, cz, hx: r.w / 2 - 2, hz: r.h / 2 - 2, rad: 2 };
      r.maxDepth = 0.95;
      // colonnes tous les 5 m, voûtes d'arêtes entre elles
      const xs = [r.x0];
      const zs = [r.z0];
      for (let x = r.x0 + 5; x < r.x1 - 1; x += 5) xs.push(x);
      for (let z = r.z0 + 5; z < r.z1 - 1; z += 5) zs.push(z);
      xs.push(r.x1);
      zs.push(r.z1);
      for (const x of xs.slice(1, -1)) for (const z of zs.slice(1, -1)) cols.push({ x, z, r: 0.55, room: r.id });
      r.bays = [];
      for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) r.bays.push({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] });
      r.ceil = 'groin';
    } else if (r.type === 'sky') {
      const long = r.w > r.h;
      r.basin = { cx, cz, hx: long ? r.w / 2 - 3 : r.w / 2 - 2.2, hz: long ? r.h / 2 - 2.2 : r.h / 2 - 3, rad: 1 };
      r.maxDepth = 1.3;
      r.ceil = 'sky';
      r.long = long ? 'x' : 'z';
    } else if (r.type === 'tunnel' || r.type === 'gallery') {
      r.flat = r.type === 'tunnel' ? DEPTH.TUNNEL : DEPTH.GALLERY;
      r.ceil = 'barrel';
      r.dark = r.type === 'tunnel';
    } else if (r.type === 'wade') {
      r.flat = DEPTH.WADE;
      for (const [ox, oz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) cols.push({ x: cx + ox, z: cz + oz, r: 0.45, room: r.id });
      r.ceil = 'flat';
      r.dark = rnd() < 0.3;
    } else if (r.type === 'tech') {
      r.flat = 0;
      r.ceil = 'low';
    }
  }

  // 3. La grille : les cases des salles sont du sol ; les flancs pleins des couloirs et le dehors, des murs
  const grid = new Uint8Array(W * H).fill(T.WALL);
  const roomOf = new Int16Array(W * H).fill(-1);
  for (const r of rooms) {
    for (let gz = 1 + r.mz * MOD; gz < 1 + (r.mz + r.mh) * MOD; gz++) {
      for (let gx = 1 + r.mx * MOD; gx < 1 + (r.mx + r.mw) * MOD; gx++) {
        if (r.axis) {
          // couloir : 2 cases de large au milieu du module (5 m)
          const lat = r.axis === 'x' ? (gz - 1) % MOD : (gx - 1) % MOD;
          if (lat === 0 || lat === 3) continue;
        }
        grid[gz * W + gx] = T.FLOOR;
        roomOf[gz * W + gx] = r.id;
      }
    }
  }
  const roomAt = (x, z) => {
    const gx = Math.floor(x / C);
    const gz = Math.floor(z / C);
    if (gx < 0 || gz < 0 || gx >= W || gz >= H) return null;
    const id = roomOf[gz * W + gx];
    return id >= 0 ? rooms[id] : null;
  };
  const depthAt = (x, z) => {
    const r = roomAt(x, z);
    return r ? roomDepth(r, x, z) : 0;
  };

  // 4. Les cloisons minces : partout où deux cases de sol voisines sont à deux salles différentes, moins les portes
  const doorOn = (along, line, u) => doors.find((d) => d.along === along && Math.abs((along === 'x' ? d.pz : d.px) - line) < 0.01 && Math.abs((along === 'x' ? d.px : d.pz) - u) < d.w / 2);
  const edges = []; // bords de case à cloison
  for (let gz = 0; gz < H; gz++) {
    for (let gx = 0; gx < W; gx++) {
      const a = roomOf[gz * W + gx];
      if (a < 0) continue;
      if (gx + 1 < W && roomOf[gz * W + gx + 1] >= 0 && roomOf[gz * W + gx + 1] !== a) {
        const x = (gx + 1) * C;
        edges.push({ x0: x, z0: gz * C, x1: x, z1: (gz + 1) * C, along: 'z', a, b: roomOf[gz * W + gx + 1] });
      }
      if (gz + 1 < H && roomOf[(gz + 1) * W + gx] >= 0 && roomOf[(gz + 1) * W + gx] !== a) {
        const z = (gz + 1) * C;
        edges.push({ x0: gx * C, z0: z, x1: (gx + 1) * C, z1: z, along: 'x', a, b: roomOf[(gz + 1) * W + gx] });
      }
    }
  }
  // pour les collisions et la lumière : les cloisons en segments, la porte en moins (3 m, à cheval sur deux bords de case)
  const segs = [];
  for (const e of edges) {
    const line = e.along === 'x' ? e.z0 : e.x0;
    const lo = e.along === 'x' ? e.x0 : e.z0;
    const hi = e.along === 'x' ? e.x1 : e.z1;
    // on retire de ce bord l'ouverture de chaque porte de la même ligne
    let parts = [[lo, hi]];
    for (const d of doors) {
      if (d.along !== e.along || Math.abs((e.along === 'x' ? d.pz : d.px) - line) > 0.01) continue;
      const c0 = (e.along === 'x' ? d.px : d.pz) - d.w / 2;
      const c1 = c0 + d.w;
      parts = parts.flatMap(([a, b]) => [[a, Math.min(b, c0)], [Math.max(a, c1), b]]).filter(([a, b]) => b - a > 0.01);
    }
    for (const [u0, u1] of parts) {
      if (u1 - u0 < 0.01) continue;
      segs.push(e.along === 'x' ? { x0: u0, z0: line, x1: u1, z1: line, along: 'x' } : { x0: line, z0: u0, x1: line, z1: u1, along: 'z' });
    }
  }
  const segDist = (sg, x, z) => {
    const dx = sg.x1 - sg.x0;
    const dz = sg.z1 - sg.z0;
    const t = Math.max(0, Math.min(1, ((x - sg.x0) * dx + (z - sg.z0) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (sg.x0 + dx * t), z - (sg.z0 + dz * t));
  };
  const cross = (ax, az, bx, bz, sg) => {
    const d1x = bx - ax;
    const d1z = bz - az;
    const d2x = sg.x1 - sg.x0;
    const d2z = sg.z1 - sg.z0;
    const den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((sg.x0 - ax) * d2z - (sg.z0 - az) * d2x) / den;
    const u = ((sg.x0 - ax) * d1z - (sg.z0 - az) * d1x) / den;
    return t > 0 && t < 1 && u >= 0 && u <= 1;
  };
  // collisions : murs de la grille (par le moteur), cloisons et colonnes ici
  const collide = (x, z, rad) => {
    for (const c of cols) if (Math.abs(c.x - x) < c.r + rad && Math.hypot(c.x - x, c.z - z) < c.r + rad) return true;
    for (const sg of segs) {
      if (x < Math.min(sg.x0, sg.x1) - rad - 0.2 || x > Math.max(sg.x0, sg.x1) + rad + 0.2) continue;
      if (z < Math.min(sg.z0, sg.z1) - rad - 0.2 || z > Math.max(sg.z0, sg.z1) + rad + 0.2) continue;
      if (segDist(sg, x, z) < WALL_T / 2 + rad) return true;
    }
    return false;
  };

  // 5. Accessibilité : parcours en largeur de case en case, en ne passant d'une salle à l'autre que par une porte
  const startCell = (() => {
    // le départ : un point sec du lagon central, loin du bassin et des colonnes. Les joueurs arrivent côte à côte
    // autour de lui, jusqu'à 0,99 m (newPlayer, sim.js), et ont 0,38 m de rayon : à 6, avec moins de 1,4 m de place,
    // l'un d'eux pouvait apparaître dans une colonne, coincé
    for (let k = 0; k < 600; k++) {
      const x = start.x0 + 2 + rnd() * (start.w - 4);
      const z = start.z0 + 2 + rnd() * (start.h - 4);
      if (poolSdf(start, x, z) > 1.5 && !collide(x, z, 1.4)) return { x, z };
    }
    return { x: start.x0 + 1.25, z: start.z0 + 1.25 };
  })();
  const crossOk = (gx, gz, nx, nz) => {
    if (roomOf[gz * W + gx] === roomOf[nz * W + nx]) return true;
    if (nx !== gx) return !!doorOn('z', Math.max(gx, nx) * C, (gz + 0.5) * C);
    return !!doorOn('x', Math.max(gz, nz) * C, (gx + 0.5) * C);
  };
  const bfsFrom = (sx, sz) => {
    const dist = new Int32Array(W * H).fill(-1);
    const q = [sz * W + sx];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      const x = k % W;
      const z = (k - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        const nk = nz * W + nx;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || dist[nk] >= 0 || grid[nk] !== T.FLOOR || !crossOk(x, z, nx, nz)) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
    return dist;
  };
  const sgx = Math.floor(startCell.x / C);
  const sgz = Math.floor(startCell.z / C);
  const dist = bfsFrom(sgx, sgz);
  const walkable = [];
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR && dist[z * W + x] >= 0) walkable.push({ x, z });
  const D = (gx, gz) => dist[gz * W + gx];
  const freeSpot = (x, z, rad) => {
    const gx = Math.floor(x / C);
    const gz = Math.floor(z / C);
    if (gx < 1 || gz < 1 || gx >= W - 1 || gz >= H - 1 || grid[gz * W + gx] !== T.FLOOR || dist[gz * W + gx] < 0) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ngx = Math.floor((x + dx * rad) / C);
      const ngz = Math.floor((z + dz * rad) / C);
      if (grid[ngz * W + ngx] !== T.FLOOR) return false;
    }
    return !collide(x, z, rad);
  };

  const cellPos = (c) => ({ x: (c.x + 0.5) * C, z: (c.z + 0.5) * C, gx: c.x, gz: c.z });

  // 6. Les 3 volants de vanne : au milieu des locaux techniques
  const fuses = [];
  for (const r of rooms.filter((q) => q.type === 'tech')) {
    if (fuses.length === 3) break;
    const x = (r.x0 + r.x1) / 2;
    const z = (r.z0 + r.z1) / 2;
    const gx = Math.floor(x / C);
    const gz = Math.floor(z / C);
    if (D(gx, gz) < 0) continue;
    fuses.push({ id: fuses.length, x, z, gx, gz, taken: false });
  }

  // 7. Les 3 toboggans : dans un mur plein (une case de mur fermée sur les côtés et derrière, pour que le tube y
  // court), devant une case au sec ou presque d'un lagon, d'une pataugeoire ou d'une verrière (plafond haut), loin des
  // portes ; le plus loin possible (en marche) du départ, des volants et les uns des autres
  const slideRoom = (r) => r && ['lagoon', 'wade', 'sky'].includes(r.type);
  const mouths = [];
  for (const c of walkable) {
    const r = rooms[roomOf[c.z * W + c.x]];
    if (!slideRoom(r) || roomDepth(r, (c.x + 0.5) * C, (c.z + 0.5) * C) > DEPTH.WADE + 0.01 || collide((c.x + 0.5) * C, (c.z + 0.5) * C, 0.8)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const nz = c.z + dz;
      if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= H - 1 || grid[nz * W + nx] !== T.WALL || roomOf[nz * W + nx] >= 0) continue;
      const shut = [[nx + dz, nz + dx], [nx - dz, nz - dx], [nx + dx, nz + dz]].every(([x, z]) => grid[z * W + x] === T.WALL);
      // les cases voisines le long du mur : de la même salle (le tube court au-dessus d'elles)
      const along = [[c.x + dz, c.z + dx], [c.x - dz, c.z - dx]].every(([x, z]) => roomOf[z * W + x] === r.id);
      const mx = (c.x + 0.5 + dx * 0.5) * C;
      const mz = (c.z + 0.5 + dz * 0.5) * C;
      if (!shut || !along || doors.some((d) => Math.hypot(d.px - mx, d.pz - mz) < 4)) continue;
      mouths.push({ x: c.x, z: c.z, nx, nz, dx, dz, mx, mz });
    }
  }
  const walkDist = (p) => {
    const d = bfsFrom(p.x, p.z);
    return (c) => d[c.z * W + c.x];
  };
  const fixed = [{ x: sgx, z: sgz }, ...fuses.map((f) => ({ x: f.gx, z: f.gz }))];
  // pas dans le lagon de départ, ni juste à côté (sauf s'il n'y a pas d'autre place)
  const farMouths = mouths.filter((m) => roomOf[m.z * W + m.x] !== start.id && D(m.x, m.z) >= 14);
  const slides = spreadOut(farMouths.length >= SLIDES.length * 3 ? farMouths : mouths, fixed, SLIDES.length, walkDist, rnd).map((m, i) => ({
    id: i,
    ...SLIDES[i],
    gx: m.x,
    gz: m.z,
    nx: m.nx,
    nz: m.nz,
    dx: m.dx,
    dz: m.dz,
    x: m.mx,
    z: m.mz,
  }));
  for (const sl of slides) rooms[roomOf[sl.gz * W + sl.gx]].exit = true;
  // le repère de sortie (signal, lumière) : devant le premier toboggan
  const exit = slides.length ? cellPos({ x: slides[0].gx, z: slides[0].gz }) : cellPos({ x: sgx, z: sgz });

  // 8. Les lampes de chaque salle : position, hauteur du luminaire (fy), sa taille (fs), cachée ou non
  const lights = [];
  const addLight = (x, z, o = {}) => {
    lights.push({ x, y: POOL_CEIL - 0.02, z, gx: Math.floor(x / C), gz: Math.floor(z / C), state: 'on', flicker: false, bright: true, fy: POOL_CEIL - 0.02, fs: 1, ...o });
  };
  for (const r of rooms) {
    if (r.type === 'lagoon' || r.type === 'wade') {
      for (let x = r.x0 + 2.5; x < r.x1; x += 5) {
        for (let z = r.z0 + 2.5; z < r.z1; z += 5) {
          if (r.dark) {
            const st = rnd() < 0.25 ? 'flicker' : 'off';
            addLight(x, z, { state: st, flicker: st === 'flicker', bright: false });
          } else addLight(x, z);
        }
      }
    } else if (r.type === 'groin') {
      for (const b of r.bays) addLight((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, { fs: 0.7 });
    } else if (r.type === 'sky') {
      // la verrière : le jour tombe partout, sans luminaire visible
      for (let x = r.x0 + 2.5; x < r.x1; x += 5) for (let z = r.z0 + 2.5; z < r.z1; z += 5) addLight(x, z, { hidden: true });
    } else if (r.axis) {
      // couloirs : des lampes dans la voûte ; le tunnel est sombre, éclairé seulement à ses bouts
      const n = (r.axis === 'x' ? r.mw : r.mh) * 2;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = r.axis === 'x' ? r.x0 + t * r.w : (r.x0 + r.x1) / 2;
        const z = r.axis === 'z' ? r.z0 + t * r.h : (r.z0 + r.z1) / 2;
        if (r.type === 'tunnel' && k !== 0 && k !== n - 1) continue;
        addLight(x, z, { hidden: r.type === 'tunnel', fs: 0.55, bright: r.type === 'gallery', fy: POOL_CEIL - 0.06 });
      }
    } else if (r.type === 'tech') {
      addLight((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 + 1.5, { state: 'flicker', flicker: true, bright: false, fy: 3.18, fs: 0.6, tech: true });
    }
  }

  // 9. Objets : au bord des bassins (au sec, contre un mur), canards sur l'eau, eau d'amande et piles
  // rien devant une porte ni devant l'ascenseur
  const busy = [startCell, ...slides, ...slides.map((sl) => ({ x: sl.x - sl.dx * C, z: sl.z - sl.dz * C })), ...fuses, ...doors.map((d) => ({ x: d.px, z: d.pz }))];
  const near = (x, z, d) => busy.some((b) => Math.hypot(b.x - x, b.z - z) < d);
  const props = [];
  const deckRooms = rooms.filter((q) => q.type === 'lagoon' || q.type === 'sky' || q.type === 'groin' || q.type === 'wade');
  for (let i = 0; i < 500 && props.length < 26; i++) {
    const r = pick(deckRooms);
    const side = Math.floor(rnd() * 4);
    const kind = pick(L37_PROPS);
    const off = kind.r + 0.3;
    const t = 1.5 + rnd() * ((side % 2 ? r.h : r.w) - 3);
    const x = side === 0 ? r.x0 + t : side === 1 ? r.x1 - off : side === 2 ? r.x1 - t : r.x0 + off;
    const z = side === 0 ? r.z0 + off : side === 1 ? r.z0 + t : side === 2 ? r.z1 - off : r.z1 - t;
    if (roomDepth(r, x, z) > 0 || !freeSpot(x, z, kind.r + 0.05) || near(x, z, 2.5)) continue;
    const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][side]; // vers le mur
    busy.push({ x, z });
    props.push({ m: kind.m, h: kind.h, r: kind.r, x, z, rot: kind.face ? Math.atan2(-dir[0], -dir[1]) : (rnd() - 0.5) * 2, tipped: !!kind.chair && rnd() < 0.2 });
  }
  const basins = rooms.filter((q) => q.blobs || q.basin);
  for (let i = 0; i < 300 && basins.length && props.filter((p) => p.m === 'rubber_duck_toy').length < 3; i++) {
    const r = pick(basins);
    const x = r.x0 + rnd() * r.w;
    const z = r.z0 + rnd() * r.h;
    if (roomDepth(r, x, z) < 0.7 || collide(x, z, 0.3)) continue;
    props.push({ m: 'rubber_duck_toy', h: 0.12, r: 0.01, x, z, rot: rnd() * 6, tipped: false, float: true });
  }
  const scatter = (n) => {
    const out = [];
    for (let i = 0; i < 3000 && out.length < n; i++) {
      const c = pick(walkable);
      const x = (c.x + 0.2 + rnd() * 0.6) * C;
      const z = (c.z + 0.2 + rnd() * 0.6) * C;
      if (depthAt(x, z) > 0 || !freeSpot(x, z, 0.5) || near(x, z, 3) || D(c.x, c.z) < 4) continue;
      busy.push({ x, z });
      out.push({ id: out.length, x, z, gx: c.x, gz: c.z, taken: false });
    }
    return out;
  };
  const bottles = scatter(9);
  const batteries = scatter(6);

  // échelles : deux par bassin rectangulaire (verrière, voûtes), du bord sec vers l'eau
  const ladders = [];
  for (const r of rooms) {
    if (!r.basin) continue;
    const b = r.basin;
    const opts = r.long === 'x' || (!r.long && r.w >= r.h)
      ? [[b.cx - b.hx + 2, b.cz - b.hz, 0, 1], [b.cx + b.hx - 2, b.cz + b.hz, 0, -1]]
      : [[b.cx - b.hx, b.cz - b.hz + 2, 1, 0], [b.cx + b.hx, b.cz + b.hz - 2, -1, 0]];
    for (const [x, z, dx, dz] of opts) if (!collide(x - dx * 0.4, z - dz * 0.4, 0.3)) ladders.push({ x, z, dx, dz });
  }

  // l'entité (la même qu'au Level 1) part au sec, dans une des salles les plus éloignées du départ
  const farCells = walkable.filter((c) => depthAt((c.x + 0.5) * C, (c.z + 0.5) * C) === 0 && !collide((c.x + 0.5) * C, (c.z + 0.5) * C, 0.6)).sort((a, b) => D(b.x, b.z) - D(a.x, a.z));
  const mc = farCells[Math.floor(rnd() * Math.min(10, farCells.length))] || walkable[walkable.length - 1];
  const monsterSpawn = cellPos(mc);

  // profondeur par case (au centre)
  const depth = new Float32Array(W * H);
  for (const c of walkable) depth[c.z * W + c.x] = depthAt((c.x + 0.5) * C, (c.z + 0.5) * C);

  return {
    level: 2,
    name: 37,
    ceil: POOL_CEIL,
    W,
    H,
    grid,
    depth,
    walkable,
    spawn: { x: startCell.x, z: startCell.z, gx: sgx, gz: sgz },
    exit,
    elevator: null,
    slides,
    cassettes: [],
    fuses,
    lights,
    props,
    bottles,
    batteries,
    items: itemList(['bottle', bottles], ['battery', batteries]),
    pits: [],
    niche: null,
    pitAt: () => -1,
    rooms,
    doors,
    edges,
    segs,
    cols,
    ladders,
    dist,
    roomOf,
    monsterSpawn,
    canStep: crossOk,
    isWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      const v = grid[gz * W + gx];
      return v === T.WALL || v === T.EXIT;
    },
    pillarAt: () => null,
    roomAt,
    depthAt,
    // cloisons minces et colonnes (les murs de la grille, le moteur les connaît déjà)
    collide,
    // la lumière d'une lampe en (lx, lz) atteint-elle (px, pz) sans traverser de cloison ?
    lightBlocked(lx, lz, px, pz) {
      for (const sg of segs) if (cross(lx, lz, px, pz, sg)) return true;
      return false;
    },
    isWalkableWorld(wx, wz) {
      const gx = Math.floor(wx / C);
      const gz = Math.floor(wz / C);
      return !this.isWall(gx, gz) && !collide(wx, wz, 0.05);
    },
  };
}
