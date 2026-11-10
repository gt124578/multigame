// The Backrooms (Level 2) - « Pipe Dreams » : les galeries de service
// De très longs couloirs carrelés (ocre ou brun) qui se croisent à angle droit, le plafond encombré de tuyaux, des
// lampes grillagées au mur ; entre les galeries, des réserves en brique, 4 chaufferies et deux grandes halles à
// piliers de béton (l'une encombrée de cuves, l'autre, la plus lointaine, sert de bergerie au troupeau de chèvres),
// et des renfoncements obscurs le long des galeries. Dans chaque chaufferie, une
// vanne : fermer les 4 coupe la vapeur qui bloque l'ascenseur de service. Des grilles à barreaux ferment certains
// couloirs (on voit au travers, il faut faire le tour), et des tuyaux percés crachent des jets de vapeur brûlante par
// intervalles en travers des couloirs : chaque vanne fermée éteint ceux de son secteur.
// Mêmes cases et même forme de carte que le Level 0 et le Level 1 (map.js) : le moteur et la scène lisent les trois.
import { CELL_SIZE, T, blocks, bfs, carveElevator, itemList, shuffle } from './map.js';

export const LEVEL2_SIZE = 66;
export const LEVEL2_CEIL = 3.3;
export const VALVES = 4;
// numéro interne de ce niveau (affiché « Level 2 ») : il vient après le Level 37 (les Poolrooms, numéro 2), par le
// toboggan rouge
export const PIPES_LEVEL = 3;
// zones (map.zone, une valeur par case de sol) : ce qui habille ses murs
export const Z = { TILE: 1, TILE_DARK: 2, BRICK: 3, BOILER: 4, HALL: 5 };
// Un jet de vapeur : une bande de JET_HALF × 2 en travers du couloir. Il siffle JET_WARN secondes avant de jaillir.
export const JET_HALF = 0.95;
export const JET_WARN = 0.9;

// état d'un jet au temps donné : 0 au repos, 1 il siffle (ça va partir), 2 il crache
export function jetState(j, time) {
  const t = (((time + j.off) % j.period) + j.period) % j.period;
  const start = j.period - j.on;
  if (t >= start) return 2;
  if (t >= start - JET_WARN) return 1;
  return 0;
}

// le point (x, z) est-il dans la bande du jet (sa case, à moins de JET_HALF de son milieu le long du couloir) ?
export function inJet(j, x, z) {
  if (Math.floor(x / CELL_SIZE) !== j.gx || Math.floor(z / CELL_SIZE) !== j.gz) return false;
  return Math.abs(j.axis === 'x' ? x - j.x : z - j.z) < JET_HALF;
}

// objets abandonnés (modèles Poly Haven CC0, et quelques-uns dessinés dans le code : proc) : nom, hauteur, rayon
// face : posé dos au mur (un nombre si l'avant du modèle ne regarde pas +z) ; node : une pièce d'un modèle qui en a
// plusieurs ; tipped : couché ; walk : à plat, on marche dessus (papiers, canettes)
const TRASH = { m: 'metal_trash_can', node: 'metal_trash_can', h: 0.9, r: 0.3 };
const TRASH_RUST = { m: 'metal_trash_can', node: 'metal_trash_can_rust', h: 0.9, r: 0.3 };
const LITTER = { m: 'litter', h: 0.06, r: 0.3, proc: true, walk: true };
const RUBBLE = { m: 'rubble', h: 0.5, r: 0.45, proc: true };
const REBAR = { m: 'rebar', h: 2.5, r: 0.2, proc: true, face: true }; // fagot de fers à béton appuyé au mur
const CAN = { m: 'can_rusted', h: 0.15, r: 0.08, walk: true };
const STORE = [
  { m: 'worn_metal_rack', h: 1.6, r: 0.45, face: true },
  { m: 'steel_frame_shelves_01', h: 2.05, r: 0.3, face: true },
  { m: 'steel_frame_shelves_03', node: 'steel_frame_shelves_03', h: 2.1, r: 0.38, face: true },
  { m: 'steel_frame_shelves_03', node: 'steel_frame_shelves_03', h: 2.1, r: 0.38, face: true },
  { m: 'compost_bags', node: 'compost_bags_standing', h: 0.68, r: 0.36 },
  { m: 'compost_bags', node: 'compost_bags_floorstacked', h: 0.18, r: 0.42 },
  TRASH_RUST,
  RUBBLE,
  LITTER,
  { m: 'cardboard_box_01', h: 0.48, r: 0.34 },
  { m: 'cardboard_box_01', h: 0.42, r: 0.32 },
  { m: 'plastic_container', h: 0.43, r: 0.45 },
  { m: 'wooden_crate_01', h: 0.62, r: 0.38 },
  { m: 'wooden_crate_02', h: 0.5, r: 0.45 },
  { m: 'plastic_crate_01', h: 0.36, r: 0.3 },
  { m: 'Barrel_02', h: 0.88, r: 0.28 },
  { m: 'trashbag', h: 0.5, r: 0.3 },
  { m: 'metal_office_desk', h: 0.76, r: 0.6, face: true },
];
const BOILER_KIT = [
  { m: 'metal_tool_chest', h: 0.65, r: 0.36, face: -Math.PI / 2 },
  { m: 'metal_jerrycan', h: 0.46, r: 0.2 },
  { m: 'propane_tank', h: 0.8, r: 0.2 },
  { m: 'portable_generator', h: 0.58, r: 0.42, face: true },
  { m: 'Barrel_01', h: 0.9, r: 0.3 },
  { m: 'utility_box_01', h: 1.12, r: 0.3, face: true },
  { m: 'pipe_wrench', h: 0.4, r: 0.15, tipped: true, walk: true },
  { m: 'oil_tin', node: 'oil_tin', h: 0.21, r: 0.1 },
  REBAR,
  TRASH_RUST,
];
const HALLWAY = [
  { m: 'hand_truck', h: 1.15, r: 0.32 },
  { m: 'WetFloorSign_01', h: 0.62, r: 0.22 },
  { m: 'cardboard_box_01', h: 0.42, r: 0.32 },
  { m: 'trashbag', h: 0.5, r: 0.3 },
  { m: 'metal_jerrycan', h: 0.46, r: 0.2 },
  { m: 'conduits', h: 2.4, r: 0.2, proc: true, face: true }, // fagot de tubes électriques appuyé au mur
  { m: 'korean_fire_extinguisher_01', h: 0.62, r: 0.14, face: true }, // extincteur (modèle Poly Haven)
  { m: 'bucket', h: 0.36, r: 0.17, proc: true },
  TRASH,
  TRASH_RUST,
  { m: 'utility_box_02', h: 1.12, r: 0.24, face: true },
  { m: 'plunger', h: 0.42, r: 0.1 },
  { m: 'multi_cleaner_5_litre', node: 'multi_cleaner_5_litre', h: 0.3, r: 0.12 },
  REBAR,
  RUBBLE,
  LITTER,
  LITTER,
  CAN,
];

// les halles : fûts, caisses, palettes de sacs le long des murs ; la bergerie : sacs de grain, auges, tonneaux d'eau
const HALL_KIT = [
  { m: 'Barrel_01', h: 0.9, r: 0.3 },
  { m: 'Barrel_02', h: 0.88, r: 0.28 },
  { m: 'wooden_crate_01', h: 0.62, r: 0.38 },
  { m: 'wooden_crate_02', h: 0.5, r: 0.45 },
  { m: 'plastic_container', h: 0.43, r: 0.45 },
  { m: 'propane_tank', h: 0.8, r: 0.2 },
  { m: 'metal_jerrycan', h: 0.46, r: 0.2 },
  { m: 'cardboard_box_01', h: 0.48, r: 0.34 },
  { m: 'compost_bags', node: 'compost_bags_floorstacked', h: 0.18, r: 0.42 },
  TRASH_RUST,
  RUBBLE,
  LITTER,
  REBAR,
];
const DEN_KIT = [
  { m: 'compost_bags', node: 'compost_bags_standing', h: 0.68, r: 0.36 },
  { m: 'compost_bags', node: 'compost_bags_floorstacked', h: 0.18, r: 0.42 },
  { m: 'wooden_crate_02', h: 0.5, r: 0.45 },
  { m: 'plastic_crate_01', h: 0.36, r: 0.3 },
  { m: 'Barrel_02', h: 0.88, r: 0.28 },
  { m: 'trough', h: 0.42, r: 0.42, proc: true, face: true },
  LITTER,
  RUBBLE,
];

// Distance pour les choix de la carte : la racine d'une somme de carrés exacte, que tous les navigateurs calculent
// pareil. Math.hypot est arrondi différemment d'un moteur à l'autre (Chrome n'est pas au plus près) : à égalité de
// distance, Chrome et Firefox ne choisissaient pas toujours la même halle, ni le même secteur pour un jet de vapeur.
const span = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

export function createPipesMap(seed = 3) {
  const W = LEVEL2_SIZE;
  const H = LEVEL2_SIZE;
  const C = CELL_SIZE;
  const grid = new Uint8Array(W * H).fill(T.WALL);
  const zone = new Uint8Array(W * H);

  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const inside = (x, z) => x > 0 && x < W - 1 && z > 0 && z < H - 1;
  const get = (x, z) => (x < 0 || x >= W || z < 0 || z >= H ? T.WALL : grid[z * W + x]);
  const isF = (x, z) => get(x, z) === T.FLOOR;
  const carve = (x, z, zn) => {
    if (!inside(x, z)) return;
    const k = z * W + x;
    grid[k] = T.FLOOR;
    if (!zone[k]) zone[k] = zn;
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 1. Les galeries : de longues lignes droites qui traversent presque toute la carte, tous les 7 à 10 cases. Certaines
  // s'interrompent entre deux croisements (il faut faire le tour). Carrelage ocre, ou brun pour une galerie sur trois.
  const lines = (n) => {
    const out = [];
    for (let v = 3 + Math.floor(rnd() * 3); v < n - 3; v += 7 + Math.floor(rnd() * 4)) out.push(v);
    return out;
  };
  const xs = lines(W);
  const zs = lines(H);
  const gallery = (alongX, at, cross, n) => {
    const a = rnd() < 0.45 ? 2 : cross[Math.floor(rnd() * Math.min(2, cross.length))];
    const b = rnd() < 0.45 ? n - 3 : cross[cross.length - 1 - Math.floor(rnd() * Math.min(2, cross.length))];
    const zn = rnd() < 0.34 ? Z.TILE_DARK : Z.TILE;
    // un tronçon manquant entre deux croisements
    let gap = null;
    if (rnd() < 0.3 && cross.length > 3) {
      const i = 1 + Math.floor(rnd() * (cross.length - 2));
      gap = [cross[i] + 2, cross[i + 1] - 2];
    }
    for (let v = a; v <= b; v++) {
      if (gap && v >= gap[0] && v <= gap[1]) continue;
      if (alongX) carve(v, at, zn);
      else carve(at, v, zn);
    }
  };
  for (const z of zs) gallery(true, z, xs, W);
  for (const x of xs) gallery(false, x, zs, H);

  // 1b. Les grandes halles : deux à quatre pâtés voisins réunis en une salle de 15 à 45 m, loin du départ, les
  // galeries qui la traversaient effacées. Des piliers de béton tous les 3 cases ; la plus lointaine est la bergerie.
  const bxs = [0, ...xs, W - 1];
  const bzs = [0, ...zs, H - 1];
  const mid = (list, n) => list.reduce((b, v) => (Math.abs(v - n / 2) < Math.abs(b - n / 2) ? v : b));
  const sx0 = mid(xs, W);
  const sz0 = mid(zs, H);
  const usedB = new Set();
  const rooms = [];
  const pillars = {};
  // spread : au lieu de la plus lointaine du départ, à l'écart des halles déjà posées et vers le milieu (on les répartit)
  const hallTry = (bw, bh, minD, minW, minH, spread = false) => {
    const cand = [];
    for (let j = 0; j + bh < bzs.length; j++) {
      for (let i = 0; i + bw < bxs.length; i++) {
        let free = true;
        for (let b = 0; b < bh; b++) for (let a = 0; a < bw; a++) if (usedB.has(i + a + ',' + (j + b))) free = false;
        if (!free) continue;
        const x0 = bxs[i] === 0 ? 1 : bxs[i] + 2;
        const x1 = bxs[i + bw] === W - 1 ? W - 2 : bxs[i + bw] - 2;
        const z0 = bzs[j] === 0 ? 1 : bzs[j] + 2;
        const z1 = bzs[j + bh] === H - 1 ? H - 2 : bzs[j + bh] - 2;
        if (x1 - x0 + 1 < minW || z1 - z0 + 1 < minH) continue;
        const near = span(Math.max(x0 - sx0, 0, sx0 - x1), Math.max(z0 - sz0, 0, sz0 - z1));
        if (near < minD) continue;
        cand.push({ i, j, bw, bh, x0, x1, z0, z1, d: span((x0 + x1) / 2 - sx0, (z0 + z1) / 2 - sz0) });
      }
    }
    if (!cand.length) return null;
    if (spread) {
      // assez loin des autres halles (au-delà de 16 cases, peu importe), mais plutôt vers le cœur du réseau
      for (const q of cand) q.far = Math.min(16, ...halls.map((h) => span((q.x0 + q.x1 - h.x0 - h.x1) / 2, (q.z0 + q.z1 - h.z0 - h.z1) / 2))) - 0.55 * q.d;
      cand.sort((a, b) => b.far - a.far);
    } else cand.sort((a, b) => b.d - a.d);
    const c = cand[Math.floor(rnd() * Math.min(spread ? 3 : 5, cand.length))];
    for (let b = 0; b < c.bh; b++) for (let a = 0; a < c.bw; a++) usedB.add(c.i + a + ',' + (c.j + b));
    return c;
  };
  const halls = [];
  const wide = rnd() < 0.5;
  // la halle des machines, la bergerie, puis deux ou trois salles de piliers plus petites semées dans le reste du
  // réseau (dont souvent une à deux pas du départ) : de grands vides qui cassent la grille des galeries
  const plan = [[2, 2, 12, 12], wide ? [2, 1, 12, 5] : [1, 2, 5, 12]];
  const extras = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let e = 0; e < extras; e++) plan.push(rnd() < 0.45 ? (rnd() < 0.5 ? [2, 1, 9, 5] : [1, 2, 5, 9]) : [1, 1, 5, 5]);
  for (let n = 0; n < plan.length; n++) {
    const [bw, bh, mw, mh] = plan[n];
    const extra = n >= 2;
    const c = extra
      ? hallTry(bw, bh, 4, mw, mh, true) || hallTry(bh, bw, 4, mh, mw, true) || hallTry(1, 1, 4, 5, 5, true)
      : hallTry(bw, bh, 7, mw, mh) || hallTry(bh, bw, 7, mh, mw) || hallTry(2, 1, 6, 9, 5) || hallTry(1, 2, 6, 5, 9) || hallTry(1, 1, 6, 5, 5);
    if (!c) continue;
    if (n === 2 && halls.length) halls[halls.length - 1].den = true;
    const hall = { x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, type: 'hall', doors: [], tanks: [], d: c.d, extra };
    // les petites salles : piliers ronds une fois sur deux, et il en manque quelques-uns
    const round = extra && rnd() < 0.5;
    const fallen = extra ? 0.06 : 0;
    for (let z = c.z0; z <= c.z1; z++) {
      for (let x = c.x0; x <= c.x1; x++) {
        grid[z * W + x] = T.FLOOR;
        zone[z * W + x] = Z.HALL;
      }
    }
    // la grille de piliers, centrée dans la halle (3 cases de passage le long des murs)
    const w = c.x1 - c.x0 + 1;
    const h = c.z1 - c.z0 + 1;
    // les petites salles : une forêt de piliers tous les 2 cases (5 m), à une case des murs
    const st = extra ? 2 : 3;
    const mg = extra ? 1 : 2;
    hall.st = st;
    hall.px = c.x0 + Math.floor(((w - 2 * mg + 1) % st) / 2) + mg;
    hall.pz = c.z0 + Math.floor(((h - 2 * mg + 1) % st) / 2) + mg;
    for (let z = hall.pz; z <= c.z1 - mg; z += st) {
      for (let x = hall.px; x <= c.x1 - mg; x += st) {
        if (rnd() < fallen) continue;
        grid[z * W + x] = T.PILLAR;
        pillars[z * W + x] = { x: (x + 0.5) * C, z: (z + 0.5) * C, h: round ? 0.4 : 0.36, round, hall: true };
      }
    }
    halls.push(hall);
    rooms.push(hall);
  }
  // la grande halle garde ses cuves ; la seconde sert de bergerie au troupeau
  if (halls.length && !halls.some((h) => h.den)) halls[Math.min(1, halls.length - 1)].den = true;

  // 2. Entre les galeries : une réserve en brique (souvent), un passage de traverse, ou un boyau qui tourne
  for (let j = 0; j < bzs.length - 1; j++) {
    for (let i = 0; i < bxs.length - 1; i++) {
      if (usedB.has(i + ',' + j)) continue;
      const x0 = bxs[i] === 0 ? 1 : bxs[i] + 2;
      const x1 = bxs[i + 1] === W - 1 ? W - 2 : bxs[i + 1] - 2;
      const z0 = bzs[j] === 0 ? 1 : bzs[j] + 2;
      const z1 = bzs[j + 1] === H - 1 ? H - 2 : bzs[j + 1] - 2;
      const bw = x1 - x0 + 1;
      const bh = z1 - z0 + 1;
      if (bw < 3 || bh < 3) continue;
      if (rnd() < 0.68) {
        const w = Math.min(bw, 3 + Math.floor(rnd() * (bw - 2)));
        const h = Math.min(bh, 3 + Math.floor(rnd() * (bh - 2)));
        const rx = x0 + Math.floor(rnd() * (bw - w + 1));
        const rz = z0 + Math.floor(rnd() * (bh - h + 1));
        const room = { x0: rx, z0: rz, x1: rx + w - 1, z1: rz + h - 1, type: 'store', doors: [] };
        for (let z = room.z0; z <= room.z1; z++) for (let x = room.x0; x <= room.x1; x++) carve(x, z, Z.BRICK);
        // une ou deux portes : un passage creusé du bord de la pièce jusqu'à la galerie la plus proche (4 cases au plus)
        const tries = [];
        for (let x = room.x0; x <= room.x1; x++) tries.push([x, room.z0, 0, -1], [x, room.z1, 0, 1]);
        for (let z = room.z0; z <= room.z1; z++) tries.push([room.x0, z, -1, 0], [room.x1, z, 1, 0]);
        shuffle(tries, rnd);
        const want = w * h > 16 && rnd() < 0.6 ? 2 : 1;
        for (const [ex, ez, dx, dz] of tries) {
          if (room.doors.length >= want) break;
          if (room.doors.some((d) => d.dx === dx && d.dz === dz)) continue;
          let n = 1;
          while (n <= 4 && inside(ex + dx * n, ez + dz * n) && !isF(ex + dx * n, ez + dz * n)) n++;
          if (n > 4 || !isF(ex + dx * n, ez + dz * n) || n === 1) continue;
          for (let k = 1; k < n; k++) carve(ex + dx * k, ez + dz * k, zone[(ez + dz * n) * W + ex + dx * n] || Z.TILE);
          room.doors.push({ gx: ex + dx, gz: ez + dz, dx, dz, len: n - 1 });
        }
        rooms.push(room);
      } else if (rnd() < 0.45 && bxs[i] > 0 && bxs[i + 1] < W - 1 && bzs[j] > 0 && bzs[j + 1] < H - 1) {
        // traverse : un couloir qui relie deux galeries parallèles à travers le pâté ; une fois sur deux, un boyau de
        // service qui fait un crochet en chemin
        const zn = rnd() < 0.3 ? Z.TILE_DARK : Z.TILE;
        const bend = rnd() < 0.5;
        if (rnd() < 0.5) {
          let x = x0 + Math.floor(rnd() * bw);
          const turn = bend ? bzs[j] + 2 + Math.floor(rnd() * Math.max(1, bzs[j + 1] - bzs[j] - 3)) : -1;
          const x2 = Math.max(x0, Math.min(x1, x + (rnd() < 0.5 ? -2 : 2)));
          for (let z = bzs[j] + 1; z < bzs[j + 1]; z++) {
            carve(x, z, zn);
            if (z === turn) {
              for (let k = Math.min(x, x2); k <= Math.max(x, x2); k++) carve(k, z, zn);
              x = x2;
            }
          }
        } else {
          let z = z0 + Math.floor(rnd() * bh);
          const turn = bend ? bxs[i] + 2 + Math.floor(rnd() * Math.max(1, bxs[i + 1] - bxs[i] - 3)) : -1;
          const z2 = Math.max(z0, Math.min(z1, z + (rnd() < 0.5 ? -2 : 2)));
          for (let x = bxs[i] + 1; x < bxs[i + 1]; x++) {
            carve(x, z, zn);
            if (x === turn) {
              for (let k = Math.min(z, z2); k <= Math.max(z, z2); k++) carve(x, k, zn);
              z = z2;
            }
          }
        }
      }
    }
  }

  // 3. Départ : l'arrivée du monte-charge du Level 1, au croisement de galeries le plus central
  let sx = W >> 1;
  let sz = H >> 1;
  let best = Infinity;
  for (const x of xs) {
    for (const z of zs) {
      const d = span(x - W / 2, z - H / 2);
      if (d < best && isF(x, z)) {
        best = d;
        sx = x;
        sz = z;
      }
    }
  }
  carve(sx, sz, Z.TILE);

  // 4. Tout doit être relié : une poche isolée est rattachée par un passage creusé jusqu'au réseau
  const connect = () => {
    for (let guard = 0; guard < 80; guard++) {
      const d = bfs(grid, W, H, sx, sz);
      let lost = -1;
      for (let i = 0; i < W * H && lost < 0; i++) if (grid[i] === T.FLOOR && d[i] < 0) lost = i;
      if (lost < 0) return;
      const prev = new Int32Array(W * H).fill(-1);
      const q = [lost];
      prev[lost] = lost;
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        const k = q[h];
        const x = k % W;
        const z = (k - x) / W;
        for (const [dx, dz] of DIRS) {
          const nx = x + dx;
          const nz = z + dz;
          if (!inside(nx, nz)) continue;
          const nk = nz * W + nx;
          if (prev[nk] >= 0) continue;
          prev[nk] = k;
          if (d[nk] >= 0) {
            hit = nk;
            break;
          }
          q.push(nk);
        }
      }
      if (hit < 0) {
        grid[lost] = T.WALL;
        continue;
      }
      for (let k = prev[hit]; k !== lost; k = prev[k]) if (grid[k] !== T.FLOOR) carve(k % W, Math.floor(k / W), Z.TILE);
    }
  };
  connect();
  let dist = bfs(grid, W, H, sx, sz);
  for (let i = 0; i < W * H; i++) {
    if (grid[i] === T.FLOOR && dist[i] < 0) grid[i] = T.WALL;
    if (grid[i] !== T.FLOOR) zone[i] = 0;
  }

  const cellPos = (c) => ({ x: (c.x + 0.5) * C, z: (c.z + 0.5) * C, gx: c.x, gz: c.z });
  const D = (c) => dist[c.z * W + c.x];
  const listFloor = () => {
    const out = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR) out.push({ x, z });
    return out;
  };
  let walkable = listFloor();
  const reachCount = () => {
    const d = bfs(grid, W, H, sx, sz);
    let n = 0;
    for (let i = 0; i < W * H; i++) if (d[i] >= 0) n++;
    return n;
  };
  const roomOf = (x, z) => rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || null;
  const inRoom = (x, z) => !!roomOf(x, z);
  // une case de couloir droit : du sol devant et derrière, des murs des deux côtés
  const straight = (x, z) => {
    if (!isF(x, z) || inRoom(x, z)) return null;
    if (isF(x - 1, z) && isF(x + 1, z) && get(x, z - 1) === T.WALL && get(x, z + 1) === T.WALL) return 'x';
    if (isF(x, z - 1) && isF(x, z + 1) && get(x - 1, z) === T.WALL && get(x + 1, z) === T.WALL) return 'z';
    return null;
  };

  // 5. L'ascenseur de service : creusé dans un mur de galerie, loin du départ
  const spawn = cellPos({ x: sx, z: sz });
  const far = walkable.filter((c) => D(c) > 0 && !inRoom(c.x, c.z)).sort((a, b) => D(b) - D(a));
  let exitCell = null;
  let elevator = null;
  for (let i = 0; i < 80 && !elevator; i++) {
    exitCell = far[Math.floor(rnd() * Math.min(12 + i * 5, far.length))];
    elevator = carveElevator(grid, W, H, exitCell, { x: sx, z: sz }, rnd);
  }
  dist = bfs(grid, W, H, sx, sz);
  for (let i = 0; i < W * H; i++) if (grid[i] !== T.FLOOR) zone[i] = 0;
  walkable = listFloor();
  const exit = cellPos(exitCell);
  const maxD = Math.max(1, ...walkable.map((c) => D(c)));

  // 5b. Les cuves de la halle des machines : de grands réservoirs ronds dans les intervalles de la grille de piliers
  // (2 × 2 cases), sans jamais couper le passage
  const tanks = [];
  for (const hall of halls) {
    if (hall.den || hall.extra) continue;
    const spots = [];
    for (let z = hall.pz; z + 3 <= hall.z1 - 2; z += 3) for (let x = hall.px; x + 3 <= hall.x1 - 2; x += 3) spots.push([x + 1, z + 1]);
    shuffle(spots, rnd);
    const want = Math.min(spots.length, 3 + Math.floor(rnd() * 3));
    for (const [gx, gz] of spots) {
      if (hall.tanks.length >= want) break;
      const cells = [[gx, gz], [gx + 1, gz], [gx, gz + 1], [gx + 1, gz + 1]];
      if (cells.some(([x, z]) => grid[z * W + x] !== T.FLOOR || (x === exitCell.x && z === exitCell.z))) continue;
      const before = reachCount();
      for (const [x, z] of cells) grid[z * W + x] = T.MACHINE;
      if (reachCount() < before - 4) {
        for (const [x, z] of cells) grid[z * W + x] = T.FLOOR;
        continue;
      }
      const t = { gx, gz, x: (gx + 1) * C, z: (gz + 1) * C, r: 1.85 + rnd() * 0.3, h: 2.3 + rnd() * 0.5 };
      hall.tanks.push(t);
      tanks.push(t);
    }
  }
  dist = bfs(grid, W, H, sx, sz);
  walkable = listFloor();

  // 6. Les 4 chaufferies, une par quart de la carte autour du départ, loin : une ou deux chaudières, et la vanne au
  // mur, du côté opposé à la porte. Faute de pièce dans un quart, la vanne se pose au mur d'un couloir.
  const valves = [];
  const boilers = [];
  const used = new Set();
  for (let i = 0; i < VALVES; i++) {
    const a0 = (i / VALVES) * Math.PI * 2;
    const a1 = ((i + 1) / VALVES) * Math.PI * 2;
    const angle = (x, z) => {
      let a = Math.atan2(z - sz, x - sx);
      if (a < 0) a += Math.PI * 2;
      return a;
    };
    const center = (r) => ({ x: Math.round((r.x0 + r.x1) / 2), z: Math.round((r.z0 + r.z1) / 2) });
    const okRoom = (r, minD) => {
      if (used.has(r) || !r.doors.length) return false;
      const c = center(r);
      const a = angle(c.x, c.z);
      return a >= a0 && a < a1 && (D(c) < 0 ? 0 : D(c)) > maxD * minD && span(c.x - exitCell.x, c.z - exitCell.z) > 6;
    };
    let cand = rooms.filter((r) => okRoom(r, 0.35));
    if (!cand.length) cand = rooms.filter((r) => okRoom(r, 0.12));
    let valve = null;
    for (const room of shuffle(cand, rnd)) {
      // la case où l'on se tient : contre un mur de la pièce, le plus loin possible de la porte
      const door = room.doors[0];
      const spots = [];
      for (let z = room.z0; z <= room.z1; z++) {
        for (let x = room.x0; x <= room.x1; x++) {
          for (const [dx, dz] of DIRS) {
            if (get(x + dx, z + dz) !== T.WALL) continue;
            if (room.doors.some((d) => d.gx === x + dx && d.gz === z + dz)) continue;
            spots.push({ x, z, dx, dz, d: Math.abs(x - door.gx) + Math.abs(z - door.gz) });
          }
        }
      }
      if (!spots.length) continue;
      spots.sort((a, b) => b.d - a.d);
      const v = spots[Math.floor(rnd() * Math.min(3, spots.length))];
      // les chaudières : dans les autres coins de la pièce, sans couper le passage ni boucher la porte
      const before = reachCount();
      const placed = [];
      const corners = shuffle([[room.x0, room.z0], [room.x1, room.z0], [room.x0, room.z1], [room.x1, room.z1]], rnd);
      const wantB = (room.x1 - room.x0 + 1) * (room.z1 - room.z0 + 1) >= 12 ? 2 : 1;
      for (const [x, z] of corners) {
        if (placed.length >= wantB) break;
        if (Math.abs(x - v.x) + Math.abs(z - v.z) < 2) continue;
        if (room.doors.some((d) => Math.abs(d.gx - x) + Math.abs(d.gz - z) <= 1)) continue;
        grid[z * W + x] = T.MACHINE;
        if (reachCount() < before - placed.length - 1) {
          grid[z * W + x] = T.FLOOR;
          continue;
        }
        placed.push({ gx: x, gz: z });
      }
      used.add(room);
      room.type = 'boiler';
      for (let z = room.z0; z <= room.z1; z++) for (let x = room.x0; x <= room.x1; x++) if (grid[z * W + x] === T.FLOOR) zone[z * W + x] = Z.BOILER;
      for (const b of placed) boilers.push({ ...b, x: (b.gx + 0.5) * C, z: (b.gz + 0.5) * C, valve: i });
      valve = v;
      break;
    }
    if (!valve) {
      // au mur d'un couloir de ce quart
      const spots = walkable.filter((c) => {
        const a = angle(c.x, c.z);
        return a >= a0 && a < a1 && D(c) > maxD * 0.3 && !inRoom(c.x, c.z) && valves.every((o) => Math.abs(o.gx - c.x) + Math.abs(o.gz - c.z) > 10);
      });
      let pool = spots.length ? spots : walkable.filter((w) => D(w) > 8);
      // carte minuscule (aucune case à plus de 8 cases du départ) : la case accessible la plus lointaine, hors des
      // autres vannes, au pire le départ lui-même (jamais de pick([]) suivi d'un plantage)
      if (!pool.length) {
        const free = walkable.filter((w) => D(w) >= 0 && valves.every((o) => o.gx !== w.x || o.gz !== w.z));
        pool = [free.reduce((b, w) => (D(w) > D(b) ? w : b), free[0] || { x: sx, z: sz })];
      }
      const c = pick(pool);
      const d = DIRS.find(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL) || [1, 0];
      valve = { x: c.x, z: c.z, dx: d[0], dz: d[1] };
    }
    const cx = (valve.x + 0.5) * C;
    const cz = (valve.z + 0.5) * C;
    valves.push({
      id: i,
      gx: valve.x,
      gz: valve.z,
      dx: valve.dx,
      dz: valve.dz,
      // le volant, contre le mur
      x: cx + valve.dx * (C / 2 - 0.2),
      z: cz + valve.dz * (C / 2 - 0.2),
      // là où l'on se tient pour le tourner
      sx: cx + valve.dx * 0.35,
      sz: cz + valve.dz * 0.35,
      closed: false,
      turn: 0,
      power: 0, // le courant de son secteur (sim.setSector)
    });
  }
  dist = bfs(grid, W, H, sx, sz);
  walkable = listFloor();

  // 7. Les grilles à barreaux. Fermées : en travers d'une galerie, seulement là où l'on peut faire le tour (rien ne
  // devient inaccessible), on voit au travers. Ouvertes : le battant rabattu contre le mur, pour le décor.
  const gates = [];
  const keep = new Set([sz * W + sx, exitCell.z * W + exitCell.x, ...valves.map((v) => v.gz * W + v.gx)]);
  const nearKeep = (x, z, d) => [...keep].some((k) => Math.abs((k % W) - x) + Math.abs(Math.floor(k / W) - z) < d);
  const straightCells = shuffle(walkable.filter((c) => straight(c.x, c.z)), rnd);
  for (const c of straightCells) {
    if (gates.filter((g) => !g.open).length >= 5) break;
    if (nearKeep(c.x, c.z, 5) || gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 12)) continue;
    const axis = straight(c.x, c.z);
    if (!axis) continue;
    const before = reachCount();
    grid[c.z * W + c.x] = T.GATE;
    if (reachCount() !== before - 1) {
      grid[c.z * W + c.x] = T.FLOOR;
      continue;
    }
    gates.push({ gx: c.x, gz: c.z, x: (c.x + 0.5) * C, z: (c.z + 0.5) * C, axis, open: false });
  }
  for (const c of straightCells) {
    if (gates.filter((g) => g.open).length >= 7) break;
    const axis = straight(c.x, c.z);
    if (!axis || nearKeep(c.x, c.z, 3) || gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 9)) continue;
    gates.push({ gx: c.x, gz: c.z, x: (c.x + 0.5) * C, z: (c.z + 0.5) * C, axis, open: true, side: rnd() < 0.5 ? 1 : -1 });
  }
  // la cabine de l'ascenseur et les chaudières ont pu isoler une case ou deux : elles redeviennent du mur
  dist = bfs(grid, W, H, sx, sz);
  for (let i = 0; i < W * H; i++) {
    if (grid[i] === T.FLOOR && dist[i] < 0) grid[i] = T.WALL;
    if (grid[i] !== T.FLOOR) zone[i] = 0;
  }
  walkable = listFloor();

  // 8. Les jets de vapeur : des tuyaux percés en travers des couloirs droits, loin du départ et les uns des autres.
  // Chacun a son rythme ; chacun dépend de la vanne la plus proche (la fermer l'éteint).
  const jets = [];
  const gateAt = (x, z) => gates.some((g) => g.gx === x && g.gz === z);
  for (const c of shuffle(walkable.filter((w) => straight(w.x, w.z)), rnd)) {
    if (jets.length >= 16) break;
    if (D(c) < 7 || nearKeep(c.x, c.z, 4) || gateAt(c.x, c.z)) continue;
    if (jets.some((j) => Math.abs(j.gx - c.x) + Math.abs(j.gz - c.z) < 8)) continue;
    if (gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 3)) continue;
    const axis = straight(c.x, c.z);
    const period = 5.5 + rnd() * 4;
    const sector = valves.reduce((b, v) => (span(v.gx - c.x, v.gz - c.z) < span(b.gx - c.x, b.gz - c.z) ? v : b)).id;
    jets.push({ id: jets.length, gx: c.x, gz: c.z, x: (c.x + 0.5) * C, z: (c.z + 0.5) * C, axis, side: rnd() < 0.5 ? 1 : -1, y: 1.5 + rnd() * 0.7, period, on: 1.5 + rnd() * 0.9, off: rnd() * period, sector });
  }
  const jetGrid = new Int16Array(W * H).fill(-1);
  for (const j of jets) jetGrid[j.gz * W + j.gx] = j.id;

  // 8b. Des renfoncements obscurs le long des galeries : une case creusée dans le mur, en cul-de-sac (les chèvres s'y
  // tapissent, on s'y cache) ; la lampe de cette case-là n'est jamais posée
  const niches = [];
  for (const c of shuffle(walkable.filter((w) => straight(w.x, w.z)), rnd)) {
    if (niches.length >= 16) break;
    if (D(c) < 5 || nearKeep(c.x, c.z, 4) || jetGrid[c.z * W + c.x] >= 0) continue;
    if (gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 3)) continue;
    if (niches.some((n) => Math.abs(n.gx - c.x) + Math.abs(n.gz - c.z) < 6)) continue;
    const axis = straight(c.x, c.z);
    const side = rnd() < 0.5 ? 1 : -1;
    const [dx, dz] = axis === 'x' ? [0, side] : [side, 0];
    const nx = c.x + dx;
    const nz = c.z + dz;
    if (!inside(nx, nz) || !inside(nx + dx, nz + dz) || get(nx, nz) !== T.WALL) continue;
    let closed = true;
    for (let ez = -1; ez <= 1; ez++) {
      for (let ex = -1; ex <= 1; ex++) {
        const x = nx + ex;
        const z = nz + ez;
        if ((ex === 0 && ez === 0) || (axis === 'x' ? z === c.z : x === c.x)) continue;
        if (get(x, z) !== T.WALL) closed = false;
      }
    }
    if (!closed) continue;
    grid[nz * W + nx] = T.FLOOR;
    zone[nz * W + nx] = zone[c.z * W + c.x] || Z.TILE;
    niches.push({ gx: nx, gz: nz, x: (nx + 0.5) * C, z: (nz + 0.5) * C, dx, dz });
  }
  walkable = listFloor();
  dist = bfs(grid, W, H, sx, sz);

  // 9. Éclairage. Dans les galeries, des lampes grillagées au mur toutes les 2 cases (5 m), toutes du même côté d'un même
  // couloir ; un bruit à basse fréquence découpe des tronçons morts ou qui grésillent. Dans les réserves, des tubes
  // néon suspendus ; dans les chaufferies, une ampoule au mur.
  const ZONE = 9;
  const zw = Math.ceil(W / ZONE) + 1;
  const zoneVal = Array.from({ length: zw * zw }, () => rnd());
  const noiseAt = (x, z) => {
    const fx = x / ZONE;
    const fz = z / ZONE;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const v = (a, b) => zoneVal[Math.min(zw - 1, b) * zw + Math.min(zw - 1, a)];
    return (v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx) * (1 - tz) + (v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx) * tz;
  };
  const hash = (a, b) => ((((a * 73856093) ^ (b * 19349663) ^ (seed * 83492791)) >>> 0) % 1000) / 1000;
  const lights = [];
  const stateAt = (x, z) => {
    if (span(x - sx, z - sz) < 7) return 'on';
    const v = noiseAt(x, z);
    if (v < 0.27 || rnd() < 0.07) return 'off';
    if (v < 0.37 || rnd() < 0.08) return 'flicker';
    return 'on';
  };
  const lit = new Set();
  for (const c of walkable) {
    if (inRoom(c.x, c.z) || jetGrid[c.z * W + c.x] >= 0) continue;
    const axis = straight(c.x, c.z);
    if (!axis) continue;
    const line = axis === 'x' ? c.z : c.x;
    const along = axis === 'x' ? c.x : c.z;
    if ((along + Math.floor(hash(line, 7) * 2)) % 2 !== 0) continue;
    const side = hash(line, 3) < 0.5 ? 1 : -1;
    const [dx, dz] = axis === 'x' ? [0, side] : [side, 0];
    if (get(c.x + dx, c.z + dz) !== T.WALL) continue;
    const state = stateAt(c.x, c.z);
    lit.add(c.z * W + c.x);
    lights.push({ kind: 'bulb', x: (c.x + 0.5) * C + dx * (C / 2 - 0.2), y: 2.2, z: (c.z + 0.5) * C + dz * (C / 2 - 0.2), gx: c.x, gz: c.z, wall: [dx, dz], state, flicker: state === 'flicker' });
  }
  // les croisements restent rarement dans le noir complet : une lampe au mur d'un coin, une fois sur deux
  for (const c of walkable) {
    if (inRoom(c.x, c.z) || straight(c.x, c.z) || rnd() < 0.5) continue;
    if ([...lit].some((k) => Math.abs((k % W) - c.x) + Math.abs(Math.floor(k / W) - c.z) < 2)) continue;
    const d = DIRS.find(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL);
    if (!d) continue;
    const state = stateAt(c.x, c.z);
    lit.add(c.z * W + c.x);
    lights.push({ kind: 'bulb', x: (c.x + 0.5) * C + d[0] * (C / 2 - 0.2), y: 2.2, z: (c.z + 0.5) * C + d[1] * (C / 2 - 0.2), gx: c.x, gz: c.z, wall: d, state, flicker: state === 'flicker' });
  }
  for (const r of rooms) {
    if (r.type === 'boiler') {
      // une ampoule nue au mur, au-dessus de la vanne si elle est là
      const v = valves.find((q) => q.gx >= r.x0 && q.gx <= r.x1 && q.gz >= r.z0 && q.gz <= r.z1);
      if (v) lights.push({ kind: 'bulb', x: (v.gx + 0.5) * C + v.dx * (C / 2 - 0.2) + (v.dz ? 0.8 : 0), y: 2.45, z: (v.gz + 0.5) * C + v.dz * (C / 2 - 0.2) + (v.dx ? 0.8 : 0), gx: v.gx, gz: v.gz, wall: [v.dx, v.dz], state: rnd() < 0.3 ? 'flicker' : 'on', flicker: false });
      // et une seconde lampe au mur, à l'autre bout de la chaufferie
      let best = null;
      for (let z = r.z0; z <= r.z1; z++) {
        for (let x = r.x0; x <= r.x1; x++) {
          if (grid[z * W + x] !== T.FLOOR) continue;
          const d = DIRS.find(([dx, dz]) => get(x + dx, z + dz) === T.WALL);
          const far = v ? Math.abs(x - v.gx) + Math.abs(z - v.gz) : 0;
          if (d && (!best || far > best.far)) best = { x, z, d, far };
        }
      }
      if (best && (!v || best.far >= 2)) lights.push({ kind: 'bulb', x: (best.x + 0.5) * C + best.d[0] * (C / 2 - 0.2), y: 2.3, z: (best.z + 0.5) * C + best.d[1] * (C / 2 - 0.2), gx: best.x, gz: best.z, wall: best.d, state: 'on', flicker: false });
      continue;
    }
    if (r.type === 'hall') {
      // halles : des réglettes pendues entre les piliers, une sur deux ; beaucoup sont mortes, et la bergerie est
      // presque toute noire
      const st = r.st || 3;
      for (let z = r.pz - st; z <= r.z1 - 1; z += st) {
        for (let x = r.px - st; x <= r.x1 - 1; x += st) {
          if ((((x - r.px) / st + (z - r.pz) / st) & 1) !== 0) continue;
          const gx = Math.max(r.x0, x + 1);
          const gz = Math.max(r.z0, z + 1);
          if (grid[gz * W + gx] !== T.FLOOR) continue;
          const q = rnd();
          const state = r.den ? (q < 0.15 ? 'flicker' : 'off') : q < 0.42 ? 'on' : q < 0.62 ? 'flicker' : 'off';
          const lx = gx + 1 <= r.x1 && grid[gz * W + gx + 1] === T.FLOOR ? (gx + 1) * C : (gx + 0.5) * C;
          lights.push({ kind: 'tube', x: lx, y: LEVEL2_CEIL - 0.42, z: (gz + 0.5) * C, gx, gz, wall: null, state, flicker: state === 'flicker', alongX: true });
        }
      }
      continue;
    }
    const dead = rnd() < 0.15;
    for (let z = r.z0 + ((r.z1 - r.z0) % 2 ? 0 : 1); z <= r.z1; z += 2) {
      for (let x = r.x0 + ((r.x1 - r.x0) % 2 ? 0 : 1); x <= r.x1; x += 2) {
        if (grid[z * W + x] !== T.FLOOR) continue;
        const q = rnd();
        const state = dead ? (q < 0.8 ? 'off' : 'flicker') : q < 0.08 ? 'off' : q < 0.22 ? 'flicker' : 'on';
        lights.push({ kind: 'tube', x: (x + 0.5) * C, y: LEVEL2_CEIL - 0.42, z: (z + 0.5) * C, gx: x, gz: z, wall: null, state, flicker: state === 'flicker', alongX: r.x1 - r.x0 >= r.z1 - r.z0 });
      }
    }
  }
  for (const l of lights) l.flicker = l.state === 'flicker';

  // 9b. Les secteurs : les lampes à moins de SECTOR_R cases de marche d'une vanne dépendent d'elle (la plus proche) ;
  // fermer la vanne les fait sauter, le noir s'étend autour d'elle. Le départ et l'ascenseur ont leur propre circuit.
  // Un disjoncteur par secteur, au mur d'une galerie, vers le bord de la zone noire, côté départ : on le réarme pour
  // rallumer le secteur (une fois).
  const SECTOR_R = 20;
  const fromValve = valves.map((v) => bfs(grid, W, H, v.gx, v.gz));
  const sectorOf = (x, z) => {
    let best = -1;
    let bd = SECTOR_R + 1;
    fromValve.forEach((d, i) => {
      const v = d[z * W + x];
      if (v >= 0 && v < bd) {
        bd = v;
        best = i;
      }
    });
    return best;
  };
  for (const l of lights) {
    const own = Math.abs(l.gx - sx) + Math.abs(l.gz - sz) <= 3 || Math.abs(l.gx - exitCell.x) + Math.abs(l.gz - exitCell.z) <= 3;
    l.sector = own ? -1 : sectorOf(l.gx, l.gz);
    l.base = l.state;
  }
  const breakers = [];
  const lampFace = new Set(lights.filter((l) => l.wall).map((l) => `${l.gx},${l.gz},${l.wall[0]},${l.wall[1]}`));
  for (const v of valves) {
    const dv = fromValve[v.id];
    const ok = (c, lo, hi) => {
      const d = dv[c.z * W + c.x];
      if (d < lo || d > hi || sectorOf(c.x, c.z) !== v.id || D(c) >= dist[v.gz * W + v.gx] || inRoom(c.x, c.z) || !straight(c.x, c.z)) return false;
      if (jetGrid[c.z * W + c.x] >= 0 || niches.some((n) => n.gx === c.x && n.gz === c.z) || nearKeep(c.x, c.z, 3)) return false;
      if (gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 3)) return false;
      return !breakers.some((b) => Math.abs(b.gx - c.x) + Math.abs(b.gz - c.z) < 6);
    };
    // Faute de place le long d'une galerie (le secteur tient parfois tout entier dans la chaufferie : une autre vanne
    // toute proche a pris les couloirs), des passes plus lâches : n'importe quelle case du secteur contre un mur, dans
    // une pièce ou dans un coin, puis n'importe quelle case à moins de SECTOR_R de la vanne. Chaque secteur doit avoir
    // son disjoncteur : sans lui, ses néons sautés ne se rallumeraient jamais.
    const loose = (c, own) => {
      const d = dv[c.z * W + c.x];
      if (d < 1 || d > SECTOR_R || (own && sectorOf(c.x, c.z) !== v.id)) return false;
      if (jetGrid[c.z * W + c.x] >= 0 || niches.some((n) => n.gx === c.x && n.gz === c.z) || nearKeep(c.x, c.z, 2)) return false;
      if (gates.some((g) => Math.abs(g.gx - c.x) + Math.abs(g.gz - c.z) < 2)) return false;
      return !breakers.some((b) => Math.abs(b.gx - c.x) + Math.abs(b.gz - c.z) < 3);
    };
    const passes = [(c) => ok(c, 9, SECTOR_R - 2), (c) => ok(c, 4, SECTOR_R), (c) => loose(c, true), (c) => loose(c, false)];
    let spot = null;
    for (const pass of passes) {
      // vers le bord de la zone noire (parmi les plus éloignés de la vanne, un peu au hasard) : une clé par case, tirée
      // une fois (sa distance à la vanne, à 1,5 case près), puis un tri ordinaire sur cette clé
      const cand = walkable.filter(pass).map((c) => ({ c, k: dv[c.z * W + c.x] + (rnd() - 0.5) * 3 })).sort((a, b) => b.k - a.k);
      for (const { c } of cand) {
        const d = DIRS.find(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL && !lampFace.has(`${c.x},${c.z},${dx},${dz}`));
        if (d) {
          spot = { c, d };
          break;
        }
      }
      if (spot) break;
    }
    if (!spot) continue;
    const { c, d } = spot;
    const cx = (c.x + 0.5) * C;
    const cz = (c.z + 0.5) * C;
    breakers.push({ id: breakers.length, sector: v.id, gx: c.x, gz: c.z, dx: d[0], dz: d[1], x: cx + d[0] * (C / 2 - 0.12), z: cz + d[1] * (C / 2 - 0.12), sx: cx + d[0] * 0.3, sz: cz + d[1] * 0.3, turn: 0, done: false });
  }

  // 10. Objets abandonnés : rayonnages et cartons dans les réserves, outillage dans les chaufferies, quelques objets
  // le long des galeries (jamais dans un jet de vapeur, devant une grille ou une porte)
  const busy = new Set([...keep, ...jets.map((j) => j.gz * W + j.gx), ...gates.map((g) => g.gz * W + g.gx), ...breakers.map((b) => b.gz * W + b.gx)]);
  for (const r of rooms) {
    for (const d of r.doors) {
      busy.add((d.gz - d.dz) * W + (d.gx - d.dx)); // la case de la pièce devant la porte
      for (let k = 0; k <= d.len; k++) busy.add((d.gz + d.dz * k) * W + (d.gx + d.dx * k));
    }
  }
  const props = [];
  const putProp = (kind, c, wall, jitter = 0.25) => {
    const off = C / 2 - kind.r - 0.08;
    props.push({
      m: kind.m,
      ...(kind.node ? { node: kind.node } : {}),
      ...(kind.walk ? { walk: true } : {}),
      h: kind.h,
      r: kind.r,
      proc: !!kind.proc,
      x: (c.x + 0.5) * C + wall[0] * off + (wall[1] ? (rnd() - 0.5) * jitter * 2 : 0),
      z: (c.z + 0.5) * C + wall[1] * off + (wall[0] ? (rnd() - 0.5) * jitter * 2 : 0),
      rot: kind.face ? Math.atan2(-wall[0], -wall[1]) + (kind.face === true ? 0 : kind.face) + (rnd() - 0.5) * 0.08 : rnd() * Math.PI * 2,
      tipped: !!kind.tipped,
    });
  };
  for (const r of rooms) {
    const kit = r.type === 'boiler' ? BOILER_KIT : r.type === 'hall' ? (r.den ? DEN_KIT : HALL_KIT) : STORE;
    const p = r.type === 'boiler' ? 0.35 : r.type === 'hall' ? 0.3 : 0.6;
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const k = z * W + x;
        if (grid[k] !== T.FLOOR || busy.has(k)) continue;
        const walls = DIRS.filter(([dx, dz]) => get(x + dx, z + dz) === T.WALL);
        // dans les halles, quelques fûts et caisses au pied des piliers aussi
        const pil = r.type === 'hall' ? DIRS.filter(([dx, dz]) => get(x + dx, z + dz) === T.PILLAR) : [];
        if (walls.length && rnd() < p) {
          busy.add(k);
          putProp(pick(kit), { x, z }, pick(walls));
        } else if (pil.length && rnd() < 0.12) {
          busy.add(k);
          putProp(pick(kit), { x, z }, pick(pil), 0.15);
        }
      }
    }
  }
  // la bergerie : de la paille éparpillée par terre
  const straw = [];
  const den = halls.find((h) => h.den) || null;
  if (den) {
    for (let z = den.z0; z <= den.z1; z++) {
      for (let x = den.x0; x <= den.x1; x++) {
        if (grid[z * W + x] !== T.FLOOR || rnd() < 0.35) continue;
        straw.push({ x: (x + 0.2 + rnd() * 0.6) * C, z: (z + 0.2 + rnd() * 0.6) * C, r: 0.7 + rnd() * 0.7, rot: rnd() * Math.PI });
      }
    }
  }
  for (const c of walkable) {
    const k = c.z * W + c.x;
    if (busy.has(k) || inRoom(c.x, c.z) || span(c.x - sx, c.z - sz) < 3 || rnd() > 0.075) continue;
    const walls = DIRS.filter(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL);
    if (!walls.length) continue;
    busy.add(k);
    putProp(pick(HALLWAY), c, pick(walls));
  }

  // 11. Eau d'amande et piles (la lampe compte : des tronçons entiers sont dans le noir)
  const scatter = (n, minD) => {
    const out = [];
    for (let i = 0; i < 400 && out.length < n; i++) {
      const c = pick(walkable);
      const k = c.z * W + c.x;
      if (busy.has(k) || D(c) < minD) continue;
      busy.add(k);
      out.push({ id: out.length, ...cellPos(c), taken: false });
    }
    return out;
  };
  const bottles = scatter(11, 8);
  const batteries = scatter(10, 6);

  // 12. Entité : loin du départ ; le troupeau part de la bergerie (ou, faute de bergerie, de cases lointaines)
  const monsterCell = pick(walkable.filter((c) => D(c) > maxD * 0.55 && !busy.has(c.z * W + c.x))) || far[0];
  const goatCells = den ? walkable.filter((c) => c.x >= den.x0 && c.x <= den.x1 && c.z >= den.z0 && c.z <= den.z1) : walkable.filter((c) => D(c) > maxD * 0.6);
  const goatSpawn = shuffle(goatCells, rnd).slice(0, 8).map(cellPos);

  const open = (x, z) => x >= 0 && z >= 0 && x < W && z < H && !blocks(grid[z * W + x]);
  const openCount = (x, z) => DIRS.filter(([dx, dz]) => open(x + dx, z + dz)).length;

  return {
    level: PIPES_LEVEL,
    ceil: LEVEL2_CEIL,
    W,
    H,
    grid,
    zone,
    rooms,
    walkable,
    spawn,
    exit,
    elevator,
    cassettes: [],
    fuses: [],
    valves,
    breakers,
    boilers,
    gates,
    jets,
    halls,
    tanks,
    niches,
    straw,
    den,
    goatSpawn,
    lights,
    props,
    bottles,
    batteries,
    items: itemList(['bottle', bottles], ['battery', batteries]),
    pits: [],
    niche: null,
    pitAt: () => -1,
    dist,
    monsterSpawn: cellPos(monsterCell),
    isWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      return blocks(grid[gz * W + gx]);
    },
    isWalkableWorld(wx, wz) {
      return !this.isWall(Math.floor(wx / C), Math.floor(wz / C));
    },
    // le pilier de béton de la case (gx, gz), s'il y en a un
    pillarAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
      const k = gz * W + gx;
      return grid[k] === T.PILLAR ? pillars[k] || null : null;
    },
    // une grille fermée arrête le pas, pas le regard
    seeThrough(gx, gz) {
      return gx >= 0 && gz >= 0 && gx < W && gz < H && grid[gz * W + gx] === T.GATE;
    },
    // le jet de vapeur de la case (ou null)
    jetAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
      const id = jetGrid[gz * W + gx];
      return id >= 0 ? jets[id] : null;
    },
    // cases d'embuscade : juste après un croisement, hors de la galerie qu'on suit
    isAmbush(gx, gz) {
      if (!open(gx, gz) || jetGrid[gz * W + gx] >= 0) return false;
      return DIRS.some(([dx, dz]) => open(gx + dx, gz + dz) && openCount(gx + dx, gz + dz) >= 3);
    },
  };
}
