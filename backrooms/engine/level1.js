// The Backrooms (Level 1) - Le sous-sol industriel : un entrepôt en béton brut, humide et froid
// Des travées d'étagères métalliques séparées par de grandes allées, des piliers de béton, un parking vide çà et là,
// des caisses dans les allées, 3 fusibles à retrouver et le monte-charge qui ramène à la surface.
// Mêmes cases et même forme de carte que le Level 0 (map.js) : le moteur et la scène lisent les deux.
import { CELL_SIZE, T, blocks, bfs, carveElevator, itemList } from './map.js';

export const LEVEL1_SIZE = 56;
export const LEVEL1_CEIL = 4.2; // plafond plus haut qu'au Level 0

// caisses et matériel abandonnés dans les allées (modèles Poly Haven, CC0) : nom, hauteur, rayon de collision ;
// face : posé dos au mur ou au rayonnage (armoires électriques, coffres à outils), un nombre si l'avant du modèle
// ne regarde pas +z
export const L1_PROPS = [
  { m: 'wooden_crate_01', h: 0.62, r: 0.38 },
  { m: 'wooden_crate_02', h: 0.5, r: 0.45 },
  { m: 'cardboard_box_01', h: 0.5, r: 0.36 },
  { m: 'Barrel_01', h: 0.9, r: 0.3 },
  { m: 'Barrel_02', h: 0.88, r: 0.28 },
  { m: 'barrel_03', h: 0.93, r: 0.34 },
  { m: 'propane_tank', h: 0.8, r: 0.2 },
  { m: 'small_lpg_tank', h: 0.64, r: 0.22 },
  { m: 'plastic_crate_01', h: 0.36, r: 0.3 },
  { m: 'plastic_crate_02', h: 0.25, r: 0.3 },
  { m: 'plastic_container', h: 0.43, r: 0.45 },
  { m: 'industrial_pastic_container', h: 0.42, r: 0.36 },
  { m: 'hand_truck', h: 1.15, r: 0.32 },
  { m: 'trashbag', h: 0.5, r: 0.3 },
  { m: 'old_tyre', h: 0.6, r: 0.32 },
  { m: 'cement_bag', h: 0.18, r: 0.36 },
  { m: 'metal_jerrycan', h: 0.46, r: 0.2 },
  { m: 'portable_generator', h: 0.58, r: 0.42, face: true },
  { m: 'metal_tool_chest', h: 0.65, r: 0.36, face: -Math.PI / 2 },
  { m: 'utility_box_01', h: 1.12, r: 0.3, face: true },
];

export function createWarehouseMap(seed = 7) {
  const W = LEVEL1_SIZE;
  const H = LEVEL1_SIZE;
  const grid = new Uint8Array(W * H);

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
  const set = (x, z, v) => {
    if (inside(x, z)) grid[z * W + x] = v;
  };

  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) grid[z * W + x] = inside(x, z) ? T.FLOOR : T.WALL;

  // 1. Grandes allées (2 cases de large) à des places tirées au hasard : elles découpent l'entrepôt en travées
  const AW = 2;
  const cuts = (n) => {
    const out = [];
    for (let v = 9 + Math.floor(rnd() * 5); v < n - 9; v += 11 + Math.floor(rnd() * 5)) out.push(v);
    return out;
  };
  const ax = cuts(W);
  const az = cuts(H);
  const inAisle = (x, z) => ax.some((a) => x >= a && x < a + AW) || az.some((a) => z >= a && z < a + AW);

  // 2. Chaque travée : des rangées d'étagères (1 case) séparées par des allées étroites (2 cases), dans un sens tiré
  // au hasard, parfois percées d'un passage ; ou bien un parking vide avec ses piliers et quelques murets
  const bx = [1, ...ax.map((a) => a + AW), W - 1];
  const bz = [1, ...az.map((a) => a + AW), H - 1];
  const ends = (list, i) => [list[i], (i + 1 < list.length - 1 ? list[i + 1] - AW : list[i + 1])];
  const shelfRows = [];
  for (let j = 0; j < bz.length - 1; j++) {
    for (let i = 0; i < bx.length - 1; i++) {
      const [x0, x1] = ends(bx, i);
      const [z0, z1] = ends(bz, j);
      if (x1 - x0 < 4 || z1 - z0 < 4) continue;
      if (rnd() < 0.14) {
        // parking : piliers tous les 4 cases et un muret de béton
        for (let z = z0 + 2; z < z1 - 1; z += 4) for (let x = x0 + 2; x < x1 - 1; x += 4) set(x, z, T.WALL);
        if (rnd() < 0.6) {
          const horiz = rnd() < 0.5;
          const len = 3 + Math.floor(rnd() * 4);
          const mx = x0 + 1 + Math.floor(rnd() * Math.max(1, x1 - x0 - 2 - (horiz ? len : 0)));
          const mz = z0 + 1 + Math.floor(rnd() * Math.max(1, z1 - z0 - 2 - (horiz ? 0 : len)));
          for (let k = 0; k < len; k++) set(mx + (horiz ? k : 0), mz + (horiz ? 0 : k), T.WALL);
        }
        continue;
      }
      const alongX = rnd() < 0.5; // les rangées courent selon x (sinon selon z)
      const [a0, a1] = alongX ? [z0, z1] : [x0, x1]; // sens où les rangées se succèdent
      const [l0, l1] = alongX ? [x0, x1] : [z0, z1]; // longueur d'une rangée
      // racks simples (1 case) ou dos à dos (2 cases), toujours séparés par une allée de 2 cases
      const thick = rnd() < 0.45 ? 2 : 1;
      for (let r = a0 + (rnd() < 0.5 ? 0 : 1); r + thick <= a1; r += thick + 2) {
        const gap = rnd() < 0.5 ? l0 + 2 + Math.floor(rnd() * Math.max(1, l1 - l0 - 4)) : -1;
        for (let t = 0; t < thick; t++) {
          const row = [];
          for (let k = l0 + (l0 > 1 ? 0 : 1); k < l1 - (l1 < (alongX ? W : H) - 1 ? 0 : 1); k++) {
            if (k === gap || k === gap + 1) continue;
            const x = alongX ? k : r + t;
            const z = alongX ? r + t : k;
            if (inAisle(x, z)) continue;
            set(x, z, T.SHELF);
            row.push({ x, z });
          }
          if (row.length) shelfRows.push({ alongX, cells: row });
        }
      }
    }
  }

  // 3. Piliers de béton le long des grandes allées
  for (const a of ax) for (let z = 4; z < H - 4; z += 6) if (!inAisle(a - 1, z) && get(a - 1, z) === T.FLOOR && get(a - 1, z - 1) !== T.SHELF && get(a - 1, z + 1) !== T.SHELF) set(a - 1, z, T.WALL);
  for (const a of az) for (let x = 4; x < W - 4; x += 6) if (!inAisle(x, a - 1) && get(x, a - 1) === T.FLOOR && get(x - 1, a - 1) !== T.SHELF && get(x + 1, a - 1) !== T.SHELF) set(x, a - 1, T.WALL);

  // 4. Départ : l'arrivée du monte-charge, au croisement de grandes allées le plus central
  let sx = W >> 1;
  let sz = H >> 1;
  if (ax.length && az.length) {
    sx = ax.reduce((b, a) => (Math.abs(a + 1 - W / 2) < Math.abs(b + 1 - W / 2) ? a : b)) + 1;
    sz = az.reduce((b, a) => (Math.abs(a + 1 - H / 2) < Math.abs(b + 1 - H / 2) ? a : b)) + 1;
  }
  set(sx, sz, T.FLOOR);
  let dist = bfs(grid, W, H, sx, sz);
  for (let i = 0; i < W * H; i++) if (grid[i] === T.FLOOR && dist[i] < 0) grid[i] = T.WALL;

  const walkable = [];
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR) walkable.push({ x, z });
  const D = (c) => dist[c.z * W + c.x];
  const cellPos = (c) => ({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE, gx: c.x, gz: c.z });
  const spawn = cellPos({ x: sx, z: sz });

  // 5. Le monte-charge : creusé dans un mur, loin du départ
  const far = walkable.filter((c) => D(c) > 0).sort((a, b) => D(b) - D(a));
  let exitCell = null;
  let elevator = null;
  for (let i = 0; i < 80 && !elevator; i++) {
    exitCell = far[Math.floor(rnd() * Math.min(15 + i * 5, far.length))];
    elevator = carveElevator(grid, W, H, exitCell, { x: sx, z: sz }, rnd);
  }
  for (let i = walkable.length - 1; i >= 0; i--) if (grid[walkable[i].z * W + walkable[i].x] !== T.FLOOR) walkable.splice(i, 1);
  dist = bfs(grid, W, H, sx, sz);
  const exit = cellPos(exitCell);
  const maxD = D(far[0]) || 1;

  // 6. Les 3 fusibles : dans les allées des étagères, un par tiers de l'entrepôt autour du départ
  const shelfSide = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(c.x + dx, c.z + dz) === T.SHELF);
  const fuses = [];
  const taken = [exitCell];
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2;
    const a1 = ((i + 1) / 3) * Math.PI * 2;
    const ok = (c, minD, aisle) => {
      let a = Math.atan2(c.z - sz, c.x - sx);
      if (a < 0) a += Math.PI * 2;
      return a >= a0 && a < a1 && D(c) > maxD * minD && (!aisle || shelfSide(c)) && taken.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > 10);
    };
    let cand = walkable.filter((c) => ok(c, 0.4, true));
    if (!cand.length) cand = walkable.filter((c) => ok(c, 0.2, false));
    if (!cand.length) cand = walkable.filter((c) => D(c) > 8 && !taken.includes(c));
    const c = pick(cand);
    taken.push(c);
    fuses.push({ id: i, ...cellPos(c), taken: false });
  }

  // 7. Néons en rangées au-dessus des allées ; quelques-uns grésillent ou sont morts
  const lights = [];
  for (let z = 1; z < H - 1; z += 2) {
    for (let x = 1; x < W - 1; x += 3) {
      if (grid[z * W + x] !== T.FLOOR) continue;
      const nearSpawn = Math.hypot(x - sx, z - sz) < 6;
      const r = rnd();
      const state = nearSpawn ? 'on' : r < 0.12 ? 'off' : r < 0.24 ? 'flicker' : 'on';
      lights.push({ x: (x + 0.5) * CELL_SIZE, y: LEVEL1_CEIL - 0.02, z: (z + 0.5) * CELL_SIZE, gx: x, gz: z, state, flicker: state === 'flicker' });
    }
  }

  // 8. Caisses dans les allées, eau d'amande et piles (plus nombreuses : les coupures de courant vident la lampe)
  const busy = new Set([sz * W + sx, exitCell.z * W + exitCell.x, ...fuses.map((f) => f.gz * W + f.gx)]);
  const props = [];
  const nearBlock = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => blocks(get(c.x + dx, c.z + dz)));
  for (let i = 0; i < 120; i++) {
    const c = pick(walkable);
    const k = c.z * W + c.x;
    const side = nearBlock(c);
    if (busy.has(k) || !side || Math.hypot(c.x - sx, c.z - sz) < 3) continue;
    // une allée étroite reste toujours praticable : la caisse se colle contre l'étagère
    busy.add(k);
    const kind = pick(L1_PROPS);
    const off = CELL_SIZE / 2 - kind.r - 0.1;
    props.push({
      m: kind.m, h: kind.h, r: kind.r,
      x: (c.x + 0.5) * CELL_SIZE + side[0] * off,
      z: (c.z + 0.5) * CELL_SIZE + side[1] * off,
      rot: kind.face ? Math.atan2(-side[0], -side[1]) + (kind.face === true ? 0 : kind.face) + (rnd() - 0.5) * 0.1 : (rnd() - 0.5) * 0.6,
      tipped: false,
    });
  }
  const scatter = (n, minD) => {
    const out = [];
    for (let i = 0; i < 300 && out.length < n; i++) {
      const c = pick(walkable);
      const k = c.z * W + c.x;
      if (busy.has(k) || D(c) < minD) continue;
      busy.add(k);
      out.push({ id: out.length, ...cellPos(c), taken: false });
    }
    return out;
  };
  const bottles = scatter(7, 8);
  const batteries = scatter(10, 6);

  // 9. Contenu des étagères (caisses, cartons, fûts) tiré une fois pour toutes pour que chacun voie la même chose
  const shelves = [];
  for (const row of shelfRows) {
    for (const c of row.cells) {
      if (grid[c.z * W + c.x] !== T.SHELF) continue;
      const goods = [];
      for (let lvl = 0; lvl < 3; lvl++) {
        if (rnd() < 0.18) continue;
        goods.push({ lvl, kind: Math.floor(rnd() * 3), w: 0.55 + rnd() * 0.35, h: 0.45 + rnd() * 0.35, off: (rnd() - 0.5) * 0.5 });
      }
      shelves.push({ gx: c.x, gz: c.z, alongX: row.alongX, goods });
    }
  }

  // 10. Entité : loin du départ
  const monsterCell = pick(walkable.filter((c) => D(c) > maxD * 0.55)) || far[0];

  return {
    level: 1,
    ceil: LEVEL1_CEIL,
    W,
    H,
    grid,
    walkable,
    spawn,
    exit,
    elevator,
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
    shelves,
    dist,
    monsterSpawn: cellPos(monsterCell),
    isWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      return blocks(grid[gz * W + gx]);
    },
    isWalkableWorld(wx, wz) {
      return !this.isWall(Math.floor(wx / CELL_SIZE), Math.floor(wz / CELL_SIZE));
    },
    // cases d'embuscade : au bout ou le long d'une rangée d'étagères
    isShelfSide(gx, gz) {
      return shelfSide({ x: gx, z: gz });
    },
  };
}
