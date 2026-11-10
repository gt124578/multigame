// The Backrooms (Level 1) - Le sous-sol industriel : un entrepôt en béton brut, humide et froid
// Des travées d'étagères métalliques séparées par de grandes allées, des piliers de béton, un parking vide çà et là,
// des caisses dans les allées, 3 fusibles à retrouver et le monte-charge qui ramène à la surface.
// Mêmes cases et même forme de carte que le Level 0 (map.js) : le moteur et la scène lisent les deux.
import { CELL_SIZE, T, blocks, bfs, carveElevator, itemList, spreadOut, gridDist } from './map.js';

export const LEVEL1_SIZE = 56;
export const LEVEL1_CEIL = 4.2; // plafond plus haut qu'au Level 0

// Le mur coupe-feu et ses quais : un rideau métallique relevé au-delà de DOCK_PASS laisse passer ; en dessous, c'est
// une cloison mince (DOCK_HALF de part et d'autre de l'axe du mur) qui arrête les joueurs, la vue et l'entité
export const DOCK_PASS = 0.7;
export const DOCK_HALF = 0.09;
export const DOCK_H = 3; // la baie : au-dessus, le linteau de béton
export const DOCK_BTN = 0.9; // le boîtier de commande, de chaque côté du rideau, sur la joue de la baie
// les gaines de ventilation, sous le plafond : leur axe et leur dessous (là où sont les bouches de reprise)
export const DUCT_Y = LEVEL1_CEIL - 0.62;
export const DUCT_LOW = DUCT_Y - 0.26 * 0.78;
export const DUCT_W = 0.66; // largeur d'une gaine
// le poste de garde : une pièce fermée de cloisons de parpaings (épaisseur GUARD_T), jusqu'au plafond ; sa porte
// (GUARD_DOOR de large) s'ouvre quand quelqu'un arrive devant
export const GUARD_T = 0.2;
export const GUARD_DOOR = 1.2; // (une porte large : on y passe à deux, l'entité aussi)
export const GUARD_DOOR_H = 2.1; // au-dessus, l'imposte de parpaings
export const GUARD_NEAR = 1.7; // à moins de ça du milieu de la porte, elle s'ouvre

// la porte du poste de garde doit-elle être ouverte ? (quelqu'un de vivant, ou l'entité, tout près ; bodies : des
// { x, z }) ; le moteur et la vue tranchent de la même façon
export function guardDoorWant(door, bodies) {
  if (!door) return false;
  for (const b of bodies) if (b && Math.hypot(b.x - door.x, b.z - door.z) < GUARD_NEAR) return true;
  return false;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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

  // 4b. On sort de l'ascenseur pris au Level 0 : sa cabine est une gaine de béton prise dans un rayonnage (ou un mur),
  // le plus près possible du centre ; le départ est la case devant ses portes. Seules des cases déjà pleines
  // deviennent du béton : aucun passage n'est bouché
  let arrival = null;
  {
    const isW = (x, z) => get(x, z) === T.WALL || get(x, z) === T.SHELF;
    const cand = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (get(x, z) === T.FLOOR && dist[z * W + x] >= 0) cand.push({ x, z, d: Math.hypot(x - sx, z - sz) });
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cx = c.x + dx;
        const cz = c.z + dz;
        if (!isW(cx, cz) || !isW(cx + dx, cz + dz) || !isW(cx + dz, cz + dx) || !isW(cx - dz, cz - dx)) continue;
        if (get(c.x - dx, c.z - dz) !== T.FLOOR) continue; // de la place pour sortir
        arrival = { gx: cx, gz: cz, x: (cx + 0.5) * CELL_SIZE, z: (cz + 0.5) * CELL_SIZE, dx, dz, arrival: true };
        for (const [x, z] of [[cx, cz], [cx + dx, cz + dz], [cx + dz, cz + dx], [cx - dz, cz - dx]]) if (x > 0 && z > 0 && x < W - 1 && z < H - 1) grid[z * W + x] = T.WALL;
        sx = c.x;
        sz = c.z;
        break;
      }
      if (arrival) break;
    }
  }

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
  const exit = cellPos(exitCell);

  // 5b. Le mur coupe-feu : un voile de béton d'un bout à l'autre de l'entrepôt, entre le départ et le monte-charge, sur
  // la ligne des piliers d'une grande allée. Là où il croise les grandes allées de l'autre sens, une seule baie reste
  // ouverte, la plus éloignée du chemin direct (le grand détour) ; une ou deux autres sont des quais fermés par un
  // rideau métallique qu'un bouton relève (le raccourci) ; les dernières sont murées. Les cases d'un quai restent du
  // sol dans la grille : c'est son rideau, baissé, qui fait mur (isWall, pillarAt)
  const docks = [];
  const keepOut = new Set(); // ni caisse, ni objet, ni casier, ni bouche : les quais et leurs abords
  const lifts = new Set();
  for (const E of [elevator, arrival]) {
    if (!E) continue;
    for (const [x, z] of [[E.gx, E.gz], [E.gx + E.dx, E.gz + E.dz], [E.gx + E.dz, E.gz + E.dx], [E.gx - E.dz, E.gz - E.dx]]) lifts.add(z * W + x);
  }
  {
    const lines = [];
    for (const [list, vert] of [[ax, true], [az, false]]) {
      for (const a of list) {
        const c = a - 1;
        const s = vert ? sx : sz; // le départ et le monte-charge, de part et d'autre du mur
        const e = vert ? exitCell.x : exitCell.z;
        if ((s - c) * (e - c) >= 0 || Math.abs(s - c) < 3 || Math.abs(e - c) < 2) continue;
        if ([...lifts].some((k) => (vert ? k % W : Math.floor(k / W)) === c)) continue;
        const cross = vert ? az : ax;
        if (cross.length < 2) continue;
        lines.push({ vert, c, s, e, cross, k: Math.abs(c - (s + e) / 2) });
      }
    }
    lines.sort((p, q) => p.k - q.k);
    for (const L of lines) {
      const n = L.vert ? H : W;
      const key = (k) => (L.vert ? k * W + L.c : L.c * W + k);
      // où le chemin à vol d'oiseau du départ au monte-charge croise le mur
      const sp = L.vert ? sz : sx;
      const ep = L.vert ? exitCell.z : exitCell.x;
      const mid = sp + ((ep - sp) * (L.c - L.s)) / (L.e - L.s);
      const gaps = L.cross.map((b) => ({ b, d: Math.abs(b + 1 - mid) })).sort((p, q) => q.d - p.d);
      const open = gaps[0].b;
      const quays = gaps.slice(1).sort((p, q) => p.d - q.d).slice(0, 2).map((g) => g.b);
      const g2 = grid.slice();
      for (let k = 1; k < n - 1; k++) {
        const b = L.cross.find((v) => k === v || k === v + 1);
        if (b === open || (b !== undefined && quays.includes(b))) continue;
        g2[key(k)] = T.WALL;
      }
      // rideaux baissés, on doit encore pouvoir aller partout par le grand détour (et atteindre les deux côtés de chaque quai)
      const shut = g2.slice();
      for (const b of quays) for (const k of [b, b + 1]) shut[key(k)] = T.WALL;
      const d2 = bfs(shut, W, H, sx, sz);
      if (d2[exitCell.z * W + exitCell.x] < 0) continue;
      const side = (b, s) => (L.vert ? d2[b * W + L.c + s] : d2[(L.c + s) * W + b]);
      const ok = quays.filter((b) => side(b, -1) >= 0 && side(b, 1) >= 0 && side(b + 1, -1) >= 0 && side(b + 1, 1) >= 0);
      if (!ok.length) continue;
      for (const b of quays) if (!ok.includes(b)) for (const k of [b, b + 1]) g2[key(k)] = T.WALL;
      grid.set(g2);
      // ce que le mur a coupé du reste (le bout d'une allée étroite) devient du béton
      const isQuay = new Set(ok.flatMap((b) => [key(b), key(b + 1)]));
      for (let i = 0; i < W * H; i++) if (grid[i] === T.FLOOR && d2[i] < 0 && !isQuay.has(i)) grid[i] = T.WALL;
      const C = CELL_SIZE;
      const axis = (L.c + 0.5) * C;
      for (const b of ok) {
        const id = docks.length;
        const cells = [b, b + 1].map((k) => (L.vert ? [L.c, k] : [k, L.c]));
        // le rideau baissé : une tôle de DOCK_HALF * 2 dans l'axe du mur, d'une joue de la baie à l'autre, coupée par case
        const slab = cells.map(([gx, gz]) => ({ rects: [L.vert ? [axis - DOCK_HALF, gz * C, axis + DOCK_HALF, (gz + 1) * C] : [gx * C, axis - DOCK_HALF, (gx + 1) * C, axis + DOCK_HALF]] }));
        // les boîtiers : sur la joue de la baie (le mur qui la borde), à DOCK_BTN du rideau, de chaque côté
        const btn = [-1, 1].map((s) => (L.vert ? { x: axis + s * DOCK_BTN, z: b * C, nx: 0, nz: 1, s } : { x: b * C, z: axis + s * DOCK_BTN, nx: 1, nz: 0, s }));
        docks.push({ id, vert: L.vert, cells, slab, btn, x: L.vert ? axis : (b + 1) * C, z: L.vert ? (b + 1) * C : axis, o: 0, dir: 0, force: 0, broken: false });
        for (const [gx, gz] of cells) for (let t = -1; t <= 1; t++) keepOut.add(L.vert ? gz * W + gx + t : (gz + t) * W + gx);
      }
      break;
    }
  }
  const dockAt = new Int16Array(W * H).fill(-1);
  docks.forEach((d) => d.cells.forEach(([gx, gz]) => (dockAt[gz * W + gx] = d.id)));
  walkable.length = 0;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR) walkable.push({ x, z });
  dist = bfs(grid, W, H, sx, sz);
  let maxD = 1;
  for (const c of walkable) maxD = Math.max(maxD, D(c));

  // 6. Les 3 fusibles : dans les allées des étagères, un par tiers de l'entrepôt autour du départ
  const shelfSide = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(c.x + dx, c.z + dz) === T.SHELF);
  // le plus loin possible (en marche) du départ, du monte-charge et les uns des autres
  const free = (c) => !keepOut.has(c.z * W + c.x);
  let cand = walkable.filter((c) => D(c) > 8 && shelfSide(c) && free(c));
  if (cand.length < 3) cand = walkable.filter((c) => D(c) > 8 && free(c));
  const fuses = spreadOut(cand, [{ x: sx, z: sz }, exitCell], 3, gridDist(grid, W, H), rnd).map((c, i) => ({ id: i, ...cellPos(c), taken: false }));

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

  // 8. Le matériel du jeu, puis caisses dans les allées, eau d'amande et piles (plus nombreuses : les coupures de
  // courant vident la lampe)
  const busy = new Set([sz * W + sx, exitCell.z * W + exitCell.x, ...fuses.map((f) => f.gz * W + f.gx), ...keepOut]);
  const props = [];
  const C = CELL_SIZE;
  const shuffled = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  // une face de mur (pas un pilier isolé, pas une cabine d'ascenseur, pas le rideau d'un quai) devant une case libre
  const faces = [];
  for (const c of walkable) {
    for (const [dx, dz] of DIRS) {
      const wx = c.x + dx;
      const wz = c.z + dz;
      if (get(wx, wz) !== T.WALL || lifts.has(wz * W + wx)) continue;
      if (get(wx + dz, wz + dx) !== T.WALL && get(wx - dz, wz - dx) !== T.WALL) continue;
      faces.push({ c, dx, dz, x: (c.x + 0.5) * C + dx * (C / 2), z: (c.z + 0.5) * C + dz * (C / 2) });
    }
  }

  // 8a. Le poste de garde : une petite pièce de 5 m sur 5 (quatre cases) adossée à un mur, pas loin de l'arrivée,
  // fermée de cloisons de parpaings jusqu'au plafond ; on y entre par une porte, qui s'ouvre quand on la pousse.
  // Dedans, un bureau métallique contre le mur, ses trois moniteurs reliés aux caméras de l'entrepôt et le fauteuil
  // devant. Assis (F), on ne bouge plus : on regarde les écrans. L'entité n'y entre que par la porte, ne voit pas à
  // travers les cloisons, et la lumière des néons s'y arrête
  let post = null;
  const roomCells = new Set();
  const segs = []; // les cloisons : { x0, z0, x1, z1 } (sur le bord des cases)
  let door = null;
  // les distances (en cases) depuis k0, en ne passant la cloison que par la porte (kIn, kOut : ses deux cases)
  const reach = (k0, inRoom, kIn, kOut) => {
    const dd = new Int16Array(W * H).fill(-1);
    const q = [k0];
    dd[k0] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      const x = k % W;
      const z = (k - x) / W;
      for (const [ex, ez] of DIRS) {
        const nx = x + ex;
        const nz = z + ez;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const nk = nz * W + nx;
        if (dd[nk] >= 0 || blocks(grid[nk])) continue;
        if (inRoom && inRoom.has(k) !== inRoom.has(nk) && !((k === kIn && nk === kOut) || (k === kOut && nk === kIn))) continue;
        dd[nk] = dd[k] + 1;
        q.push(nk);
      }
    }
    return dd;
  };
  // la pièce ne doit rien couper ni allonger les trajets de plus de quelques pas (qu'elle ne bouche pas une allée) :
  // mesuré depuis le départ, le monte-charge et quelques cases réparties dans l'entrepôt
  const probes = [sz * W + sx, exitCell.z * W + exitCell.x, ...[1, 2, 3, 4, 5, 6].map((i) => {
    const c = walkable[Math.floor((i * walkable.length) / 7)];
    return c.z * W + c.x;
  })];
  const base0 = probes.map((k) => reach(k, null));
  const keeps = (inRoom, kIn, kOut, slack) =>
    probes.every((k0, i) => {
      if (inRoom.has(k0)) return false;
      const dd = reach(k0, inRoom, kIn, kOut);
      const d0 = base0[i];
      for (let k = 0; k < W * H; k++) {
        if (d0[k] < 0 || inRoom.has(k)) continue;
        if (dd[k] < 0 || dd[k] - d0[k] > slack) return false;
      }
      return true;
    });
  const roomFree = (x, z) => get(x, z) === T.FLOOR && !busy.has(z * W + x) && dockAt[z * W + x] < 0 && !lifts.has(z * W + x);
  // (le plus près possible de l'arrivée, à quelques pas près)
  // (au besoin, plus loin de l'arrivée, puis un détour un peu plus long)
  const order = faces.map((f) => ({ f, k: D(f.c) + rnd() * 6 })).sort((p, q) => p.k - q.k).map((o) => o.f);
  search: for (const [far, slack] of [[24, 3], [40, 3], [40, 6], [99, 10]])
  for (const f of order) {
    const { c, dx, dz } = f;
    const d = D(c);
    if (d < 4 || d > far) continue;
    if (Math.hypot(f.x - spawn.x, f.z - spawn.z) < 5) continue;
    // la pièce s'étend d'un côté ou de l'autre le long du mur (t)
    for (const sgn of [1, -1]) {
      const tx = dz * sgn;
      const tz = dx * sgn;
      const cells = [[c.x, c.z], [c.x + tx, c.z + tz], [c.x - dx, c.z - dz], [c.x - dx + tx, c.z - dz + tz]];
      if (!cells.every(([x, z]) => roomFree(x, z))) continue;
      // le mur du fond, plein sur les deux cases
      if (get(c.x + dx, c.z + dz) !== T.WALL || get(c.x + tx + dx, c.z + tz + dz) !== T.WALL) continue;
      if (lifts.has((c.z + dz) * W + c.x + dx) || lifts.has((c.z + tz + dz) * W + c.x + tx + dx)) continue;
      // la porte : devant la case du coin, ou sur son côté ; il faut une case libre devant
      const [bx, bz] = cells[3];
      const opts = [[bx - dx, bz - dz, -dx, -dz], [bx + tx, bz + tz, tx, tz]].filter(([x, z]) => roomFree(x, z));
      for (const [ox, oz, nx, nz] of opts) {
        const inRoom = new Set(cells.map(([x, z]) => z * W + x));
        const kIn = bz * W + bx;
        const kOut = oz * W + ox;
        if (!keeps(inRoom, kIn, kOut, slack)) continue;
        // les cloisons : sur chaque bord de la pièce qui ne donne pas sur un mur (le mur du fond est déjà là). Jamais
        // contre un rayonnage (elle passerait dans ses montants), ni contre un quai ou un ascenseur
        const xs = cells.map(([x]) => x);
        const zs = cells.map(([, z]) => z);
        const X0 = Math.min(...xs) * C;
        const X1 = (Math.max(...xs) + 1) * C;
        const Z0 = Math.min(...zs) * C;
        const Z1 = (Math.max(...zs) + 1) * C;
        // le milieu de la porte, sur le bord de la case du coin
        const dmx = (bx + 0.5) * C + nx * (C / 2);
        const dmz = (bz + 0.5) * C + nz * (C / 2);
        const pieces = [];
        let bad = false;
        for (const [x, z] of cells) {
          for (const [ex, ez] of DIRS) {
            if (inRoom.has((z + ez) * W + x + ex)) continue;
            const k2 = (z + ez) * W + x + ex;
            const t2 = get(x + ex, z + ez);
            if (t2 === T.WALL) continue;
            if (t2 !== T.FLOOR || dockAt[k2] >= 0 || lifts.has(k2)) bad = true;
            // le bord de la case, dans le sens des x croissants ou des z croissants
            const lx = (x + 0.5) * C + ex * (C / 2);
            const lz = (z + 0.5) * C + ez * (C / 2);
            const h = C / 2;
            const sg = ex ? { x0: lx, z0: lz - h, x1: lx, z1: lz + h } : { x0: lx - h, z0: lz, x1: lx + h, z1: lz };
            if (x === bx && z === bz && ex === nx && ez === nz) {
              // le bord de la porte : deux pans, de part et d'autre de la baie
              const g = GUARD_DOOR / 2;
              if (ex) pieces.push({ ...sg, z1: dmz - g }, { ...sg, z0: dmz + g });
              else pieces.push({ ...sg, x1: dmx - g }, { ...sg, x0: dmx + g });
            } else pieces.push(sg);
          }
        }
        if (bad) continue;
        // les morceaux bout à bout sur une même ligne n'en font qu'un
        pieces.sort((p, q) => p.x0 - q.x0 || p.z0 - q.z0);
        const merged = [];
        for (const q of pieces) {
          const m = merged.find((o) => (q.x0 === q.x1 ? o.x0 === o.x1 && o.x0 === q.x0 && Math.abs(o.z1 - q.z0) < 1e-6 : o.z0 === o.z1 && o.z0 === q.z0 && Math.abs(o.x1 - q.x0) < 1e-6));
          if (m) {
            m.x1 = q.x1;
            m.z1 = q.z1;
          } else merged.push({ ...q });
        }
        segs.push(...merged);
        // la porte : dans la baie, sa normale vers le dehors ; elle s'ouvre vers l'intérieur
        door = { x: dmx, z: dmz, nx, nz, w: GUARD_DOOR, h: GUARD_DOOR_H, open: false };
        for (const k of inRoom) roomCells.add(k);
        const ry = Math.atan2(-dx, -dz); // le bureau tourne le dos au mur
        const seat = { x: f.x - dx * 1.35, z: f.z - dz * 1.35, yaw: Math.atan2(-dx, -dz) }; // assis, on regarde le mur (le regard va vers -sin, -cos)
        post = { x: f.x - dx * 0.5, z: f.z - dz * 0.5, dx, dz, ry, gx: c.x, gz: c.z, seat, front: { x: f.x - dx * 2.1, z: f.z - dz * 2.1 }, by: -1, room: { x0: X0, z0: Z0, x1: X1, z1: Z1, tx, tz }, door };
        const ttx = dz;
        const ttz = dx;
        props.push({ m: 'metal_office_desk', h: 0.79, r: 0.45, x: post.x, z: post.z, rot: ry, tipped: false, post: true });
        for (const o of [-0.58, 0.58]) props.push({ m: null, ghost: true, h: 0, r: 0.42, x: post.x + ttx * o, z: post.z + ttz * o, rot: 0 });
        for (const [i, o] of [[0, -0.62], [1, 0], [2, 0.62]]) props.push({ m: 'Television_01', h: 0.46, r: 0.3, walk: true, y: 0.79, x: f.x - dx * 0.36 + ttx * o, z: f.z - dz * 0.36 + ttz * o, rot: ry + (i - 1) * -0.18 * (dx + dz > 0 ? 1 : -1), tipped: false, screen: i });
        props.push({ m: 'modern_arm_chair_01', h: 1.0, r: 0.28, x: seat.x, z: seat.z, rot: Math.atan2(dx, dz), tipped: false, post: true });
        for (const k of inRoom) busy.add(k);
        busy.add(kOut);
        // une réglette au plafond de la pièce (celles de l'entrepôt restent dehors)
        if (!lights.some((l) => inRoom.has(l.gz * W + l.gx))) {
          const lx = (X0 + X1) / 2;
          const lz = (Z0 + Z1) / 2;
          lights.push({ x: lx, y: LEVEL1_CEIL - 0.02, z: lz, gx: Math.floor(lx / C), gz: Math.floor(lz / C), state: 'on', flicker: false });
        }
        break search;
      }
    }
  }
  // (les cloisons : 20 cm de parpaings, de part et d'autre de leur axe)
  const segDist = (sg, x, z) => {
    const ex = sg.x1 - sg.x0;
    const ez = sg.z1 - sg.z0;
    const L2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - sg.x0) * ex + (z - sg.z0) * ez) / L2));
    return Math.hypot(x - sg.x0 - ex * u, z - sg.z0 - ez * u);
  };
  const crosses = (ax, az, bx, bz, sg) => {
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
  // la porte fermée, comme une cloison de plus (pour la vue et le son ; on la traverse toujours : elle s'ouvre)
  const doorSeg = door ? (door.nx ? { x0: door.x, z0: door.z - door.w / 2, x1: door.x, z1: door.z + door.w / 2 } : { x0: door.x - door.w / 2, z0: door.z, x1: door.x + door.w / 2, z1: door.z }) : null;

  // 8b. Les déclencheurs manuels d'alarme incendie : sur les murs, loin les uns des autres. Brisé, le boîtier fait
  // sonner la cloche au-dessus pendant une vingtaine de secondes : l'entité y court (une seule fois chacun)
  const alarms = [];
  for (const f of shuffled(faces)) {
    if (alarms.length >= 7) break;
    const k = f.c.z * W + f.c.x;
    if (busy.has(k) || Math.hypot(f.x - spawn.x, f.z - spawn.z) < 9 || Math.hypot(f.x - exit.x, f.z - exit.z) < 6) continue;
    if (post && Math.hypot(f.x - post.x, f.z - post.z) < 8) continue;
    if (docks.some((d) => Math.hypot(f.x - d.x, f.z - d.z) < 6)) continue;
    if (alarms.some((a) => Math.hypot(a.x - f.x, a.z - f.z) < 22)) continue;
    alarms.push({ id: alarms.length, x: f.x, z: f.z, nx: -f.dx, nz: -f.dz, gx: f.c.x, gz: f.c.z, used: false, ringT: 0 });
    busy.add(k);
  }

  // 8c. Les caméras de surveillance : au bout des grandes allées, sous le plafond, elles plongent le long de l'allée ;
  // une au-dessus des portes du monte-charge, une au-dessus du poste de garde (ce qui arrive dans son dos)
  const cams = [];
  const camAt = (x, z, lx, lz, name, pitch = -0.2, y = 2.95) => cams.push({ id: cams.length, x, y, z, yaw: Math.atan2(-lx, -lz), pitch, name });
  const NAMES = 'ABCDEFGH';
  ax.forEach((a, i) => {
    const north = i % 2 === 0;
    const gz = north ? 1 : H - 2;
    const wall = north ? 0 : H - 1;
    if (get(a, gz) !== T.FLOOR || get(a + 1, gz) !== T.FLOOR || lifts.has(wall * W + a) || lifts.has(wall * W + a + 1)) return;
    camAt((a + 1) * C, north ? C + 0.25 : (H - 1) * C - 0.25, 0, north ? 1 : -1, `AISLE ${NAMES[i]} · ${north ? 'NORTH' : 'SOUTH'}`);
  });
  az.forEach((a, i) => {
    const west = i % 2 === 1;
    const gx = west ? 1 : W - 2;
    const wall = west ? 0 : W - 1;
    if (get(gx, a) !== T.FLOOR || get(gx, a + 1) !== T.FLOOR || lifts.has(a * W + wall) || lifts.has((a + 1) * W + wall)) return;
    camAt(west ? C + 0.25 : (W - 1) * C - 0.25, (a + 1) * C, west ? 1 : -1, 0, `ROW ${i + 1} · ${west ? 'WEST' : 'EAST'}`);
  });
  if (elevator) camAt(exit.x + elevator.dx * (C / 2 - 0.3), exit.z + elevator.dz * (C / 2 - 0.3), -elevator.dx, -elevator.dz, 'FREIGHT ELEVATOR', -0.32, 3.05);
  if (post) camAt(post.x + post.dx * 0.2, post.z + post.dz * 0.2, -post.dx, -post.dz, 'GUARD POST', -0.38, 3.0);

  // 8d. Les gaines de ventilation (le réseau est d'un seul tenant, au-dessus des rayonnages) : des troncs le long de z,
  // et sous chacun des bouches de reprise au-dessus des allées libres. L'entité peut s'y glisser et ressortir par l'une
  // d'elles (sa grille tombe)
  const ducts = { y: DUCT_Y, low: DUCT_LOW, trunks: [], vents: [] };
  for (let gx = 6 + Math.floor(rnd() * 4); gx < W - 3; gx += 13 + Math.floor(rnd() * 5)) ducts.trunks.push((gx % 3 === 1 ? gx + 1 : gx) * C + 1.2);
  const nearLift = (gx, gz) => [elevator, arrival].some((E) => E && Math.abs(gx - E.gx) <= 1 && Math.abs(gz - E.gz) <= 1);
  ducts.trunks.forEach((x0, t) => {
    const gx = Math.floor(x0 / C);
    let last = -99;
    for (let gz = 2; gz < H - 2; gz++) {
      if (gz - last < 5 || get(gx, gz) !== T.FLOOR || nearLift(gx, gz) || busy.has(gz * W + gx) || rnd() < 0.35) continue;
      // ni sur un néon (les réglettes passent au milieu des cases une rangée sur deux), ni trop près d'un mur
      const z = (gz + 0.5) * C + (gz % 2 === 1 ? 0.75 : 0);
      ducts.vents.push({ id: ducts.vents.length, t, x: x0, z, gx, gz, open: false });
      busy.add(gz * W + gx);
      last = gz;
    }
  });
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
  const bottles = scatter(10, 8);
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
  const monsterCell = pick(walkable.filter((c) => D(c) > maxD * 0.55 && !roomCells.has(c.z * W + c.x))) || walkable[walkable.length - 1];

  return {
    level: 1,
    ceil: LEVEL1_CEIL,
    docks,
    alarms,
    cams,
    post,
    ducts,
    W,
    H,
    grid,
    walkable,
    spawn,
    exit,
    elevator,
    arrival,
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
    segs,
    guardDoor: door,
    // les cloisons du poste de garde arrêtent les joueurs et l'entité (le moteur connaît déjà les murs de la grille)
    collide(x, z, rad) {
      for (const sg of segs) {
        if (x < Math.min(sg.x0, sg.x1) - rad - 0.2 || x > Math.max(sg.x0, sg.x1) + rad + 0.2) continue;
        if (z < Math.min(sg.z0, sg.z1) - rad - 0.2 || z > Math.max(sg.z0, sg.z1) + rad + 0.2) continue;
        if (segDist(sg, x, z) < GUARD_T / 2 + rad) return true;
      }
      return false;
    },
    // la lumière d'une lampe en (lx, lz) atteint-elle (px, pz) sans traverser de cloison (ni la porte fermée) ? Sert
    // aussi à la vue de l'entité et au bruit étouffé
    lightBlocked: segs.length
      ? (ax, az, bx, bz) => segs.some((sg) => crosses(ax, az, bx, bz, sg)) || (!!doorSeg && !door.open && crosses(ax, az, bx, bz, doorSeg))
      : null,
    // d'une case à l'autre (chemins de l'entité) : on n'entre au poste et on n'en sort que par la porte
    canStep: segs.length
      ? (gx, gz, nx, nz) => {
          const a = roomCells.has(gz * W + gx);
          if (a === roomCells.has(nz * W + nx)) return true;
          const mx = (Math.max(gx, nx) + (gx === nx ? 0.5 : 0)) * C;
          const mz = (Math.max(gz, nz) + (gz === nz ? 0.5 : 0)) * C;
          return Math.hypot(mx - door.x, mz - door.z) < 0.6;
        }
      : null,
    // un quai : mur tant que son rideau est baissé (au-dessous de DOCK_PASS) ; sa vraie forme est une tôle mince
    isWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      const d = dockAt[gz * W + gx];
      if (d >= 0) return docks[d].o < DOCK_PASS;
      return blocks(grid[gz * W + gx]);
    },
    pillarAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
      const d = dockAt[gz * W + gx];
      if (d < 0 || docks[d].o >= DOCK_PASS) return null;
      const D0 = docks[d];
      return D0.slab[D0.cells[0][0] === gx && D0.cells[0][1] === gz ? 0 : 1];
    },
    // les murs qui ne bougent pas (pour les chemins de l'entité : elle passe par les quais, quitte à forcer le rideau)
    navWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      return blocks(grid[gz * W + gx]);
    },
    dockAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
      const d = dockAt[gz * W + gx];
      return d >= 0 ? docks[d] : null;
    },
    isWalkableWorld(wx, wz) {
      return !this.isWall(Math.floor(wx / CELL_SIZE), Math.floor(wz / CELL_SIZE)) && !this.collide(wx, wz, 0.05);
    },
    // cases d'embuscade : au bout ou le long d'une rangée d'étagères
    isShelfSide(gx, gz) {
      return shelfSide({ x: gx, z: gz });
    },
  };
}
