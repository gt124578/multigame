// The Backrooms (Level 0) - Génération de la carte du dédale
// Grande grille de cases (64 × 64, soit 160 m de côté) : un quadrillage de cloisons percées de passages, des piliers,
// quelques grandes salles vides, des zones aux néons morts, 6 cassettes VHS, de l'eau d'amande et 1 ascenseur.
// Le Level 1 (entrepôt) est dans level1.js et partage les types de cases, l'ascenseur et le parcours en largeur.
// Pièges du Level 0, posés une fois le dédale construit :
//  - une cassette enfermée dans une petite pièce, qu'on n'atteint que par un couloir étroit au sol creusé de trous
//    carrés (on marche sur l'arête du milieu ; qui tombe attend qu'un collègue lui lance une corde) ;
//  - une cassette posée au fond d'un trou carré creusé haut dans un mur, qu'on n'atteint qu'avec l'échelle cachée
//    ailleurs.
// Des cloisons fines (12 cm de plâtre) : au milieu des grandes pièces (voir 4d) et, par endroits, à la place des pans
// droits des murs d'une case d'épaisseur (voir 8c).

export const PIT_HALF = 1.08; // un trou fait 2,16 m de côté dans une case de 2,5 m : il reste des arêtes de 34 cm
// L'étage du bas du Level 0 : des champs de puits sans fond (on y meurt), en grille comme les trous du haut
export const DEEP_FIELDS = 3; // au plus, par étage du bas
export const DEEP_DEPTH = 60; // profondeur dessinée d'un puits (bien au-delà de ce que laisse voir l'obscurité)
export const FLOOR_DY = 6.4; // l'étage du bas est 6,40 m plus bas (3 m sous plafond et 3,40 m de dalle : les trous sont des puits)
export const PIT_DEPTH = FLOOR_DY; // on tombe d'un étage, de très haut
export const CASSETTES = 6; // cassettes VHS à trouver au Level 0 (4 en haut, 2 en bas)
export const LOWER_CASSETTES = 2; // … dont celles de l'étage du bas
// le trou carré du mur où attend la cassette perchée : son bas (à 2,40 m, hors de portée sans l'échelle), son côté et
// sa profondeur ; la cassette y tient debout, la jaquette tournée vers la pièce (NICHE_Y : son centre)
export const NICHE_LO = 2.4;
export const NICHE_SIZE = 0.56;
export const NICHE_DEPTH = 0.42;
export const NICHE_IN = 0.2; // la cassette est à 20 cm dans le trou
export const NICHE_Y = NICHE_LO + 0.115;
// rayon d'un joueur : PLAYER_RADIUS de sim.js (sim.js importe ce fichier, on ne l'importe pas d'ici)
const PLAYER_R = 0.38;

// Mélange un tableau sur place (Fisher–Yates) avec le générateur de la carte, et le renvoie. Jamais de
// sort(() => rnd() - 0.5) : l'ordre obtenu, et le nombre de tirages, dépendraient de l'algorithme de tri du
// navigateur (Chrome, Firefox et Safari ne construiraient plus la même carte à partir de la même graine).
export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// tous les objets qu'on ramasse avec F : 'bottle', 'battery', 'ladder' (id unique, position, pris ou non)
// Les objectifs d'un niveau, le plus loin possible les uns des autres : à chaque tour, la case candidate dont le
// point déjà posé le plus proche (fixed, puis les choisis) est le plus loin ; on tire au hasard parmi celles qui
// font au moins 90 % du meilleur score. distFrom(p) renvoie la distance (de marche) de p à une case c : (c) => nombre.
export function spreadOut(cands, fixed, n, distFrom, rnd) {
  const pool = [...cands];
  const near = pool.map(() => Infinity);
  const add = (p) => {
    const d = distFrom(p);
    pool.forEach((c, i) => {
      const v = d(c);
      near[i] = Math.min(near[i], v < 0 ? Infinity : v);
    });
  };
  fixed.forEach(add);
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    let best = -1;
    for (const v of near) if (v > best) best = v;
    const top = pool.map((c, i) => i).filter((i) => near[i] >= best * 0.9);
    const i = top[Math.floor(rnd() * top.length)];
    const c = pool[i];
    pool.splice(i, 1);
    near.splice(i, 1);
    out.push(c);
    add(c);
  }
  return out;
}
// distance de marche sur une grille (parcours en largeur depuis p)
export const gridDist = (grid, W, H) => (p) => {
  const d = bfs(grid, W, H, p.x, p.z);
  return (c) => d[c.z * W + c.x];
};

export function itemList(...lists) {
  const items = [];
  for (const [kind, list] of lists) for (const o of list) items.push(Object.assign(o, { kind, iid: items.length }));
  items.forEach((o, i) => {
    o.id = i;
  });
  return items;
}

export const CELL_SIZE = 2.5; // chaque case fait 2.5m x 2.5m
export const WALL_HEIGHT = 3.2; // hauteur sous plafond (3,20 m : un peu plus haut que l'ordinaire, on s'y sent petit)
export const MAP_SIZE = 64;
// l'étage du bas n'occupe qu'un carré de 40 cases (100 m de côté, contre 160 m en haut), sous le couloir piégé et les
// escaliers : le reste de sa grille est du mur plein
export const LOWER_SIZE = 40;

export const T = {
  EMPTY: 0,
  FLOOR: 1,
  WALL: 2,
  EXIT: 3, // cabine de l'ascenseur : un mur tant qu'il est fermé
  SHELF: 4, // étagère métallique (Level 1) : bloque le passage et la vue comme un mur
  PILLAR: 5, // pilier plus petit que la case (Level 0) : l'entité le contourne, les joueurs passent à côté
  GATE: 6, // grille à barreaux fermée (Level 2) : bloque le passage, pas la vue (voir seeThrough)
  MACHINE: 7, // chaudière (Level 2) : bloque le passage et la vue, mais ce n'est pas un mur
  CHAMFER: 8, // case coupée en biais par le mur d'un couloir en diagonale (Level 0) : à moitié pleine, voir DIAG. De 8
  // à 11 selon le côté libre : + 1 s'il est vers -x, + 2 s'il est vers -z (voir chamferTile)
};
// une case coupée en biais, et de quel côté elle est libre ([fx, fz] : vers +x ou -x, vers +z ou -z)
export const isChamfer = (v) => v >= T.CHAMFER && v <= T.CHAMFER + 3;
export const chamferTile = (fx, fz) => T.CHAMFER + (fx > 0 ? 0 : 1) + (fz > 0 ? 0 : 2);
export const chamferSide = (v) => [v & 1 ? -1 : 1, v & 2 ? -1 : 1];

// cases qui bloquent le passage (et la vue) : murs, étagères, cabine d'ascenseur ; un pilier fin seulement pour les
// chemins de l'entité (les collisions et la vue suivent sa vraie forme, voir outsidePillar) ; une grille, le passage seul
export const blocks = (v) => v === T.WALL || v === T.SHELF || v === T.EXIT || v === T.PILLAR || v === T.GATE || v === T.MACHINE || isChamfer(v);
// … mais une case coupée en biais se traverse le long de son couloir : les parcours en largeur (bfs) y passent. Le
// couloir est muré de part et d'autre (DIAG) : de là, on ne peut aller que dans le couloir
export const crossable = (v) => !blocks(v) || isChamfer(v);
// un pas d'une case à sa voisine (dx, dz) : on n'entre dans une case coupée en biais, et on n'en sort, que par son côté
// libre (sinon on traverserait le mur, de la moitié pleine à l'autre côté)
export const chamferStep = (a, b, dx, dz) => {
  if (isChamfer(a)) {
    const [fx, fz] = chamferSide(a);
    if (dx ? dx !== fx : dz !== fz) return false;
  }
  if (isChamfer(b)) {
    const [fx, fz] = chamferSide(b);
    if (dx ? -dx !== fx : -dz !== fz) return false;
  }
  return true;
};

// Les obstacles plus petits que leur case : un pilier ({ x, z, h, round }, h : demi-côté ou rayon), une cloison
// fine ({ x, z, h, rects : [[x0, z0, x1, z1], …], thin: true } : un à trois rectangles en mètres, h : le demi-côté
// de la case, pour borner) ou la moitié pleine d'une case coupée en biais ({ x, z, h, poly : [[x, z] ×3], face })
export const THIN_HALF = 0.06; // demi-épaisseur d'une cloison fine (12 cm)
export const THIN_SHARE = 0.25; // part des murs d'une case d'épaisseur changés en cloisons (par régions)
export const POCKET = 24; // une poche sans autre issue jusqu'à 24 cases compte comme un cul-de-sac (voir 8d)
export const DEAD_OPEN = 0.5; // part des culs-de-sac rouverts sur le reste du dédale (un tiers de moins, voir 8d)
const PARTITIONS = 60; // cloisons ajoutées au milieu des espaces trop ouverts, par étage
const PART_ROOMY = 20; // cases libres sur 5 × 5 autour du départ d'une cloison
const DIAG = 3; // couloirs en diagonale par étage (45°, 3,5 m de large, de 4 à 7 cases de long)

// la distance du point (x, z) à un polygone convexe (0 dedans)
function polyDist(poly, x, z) {
  let inside = true;
  let best = Infinity;
  const n = poly.length;
  // le sens des sommets (le triangle d'une case coupée peut tourner dans un sens ou dans l'autre)
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = area >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    if ((ex * (z - a[1]) - ez * (x - a[0])) * sgn < 0) inside = false;
    const l2 = ex * ex + ez * ez;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t));
  }
  return inside ? 0 : best;
}

// le segment [a, b] coupe-t-il le segment [c, d] ?
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(cx, cz, dx, dz, ax, az);
  const d2 = o(cx, cz, dx, dz, bx, bz);
  const d3 = o(ax, az, bx, bz, cx, cz);
  const d4 = o(ax, az, bx, bz, dx, dz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// le point (x, z) est-il hors du pilier (à margin près) ?
export function outsidePillar(p, x, z, margin = 0) {
  if (p.poly) return polyDist(p.poly, x, z) > margin;
  if (p.rects) {
    for (const r of p.rects) if (x > r[0] - margin && x < r[2] + margin && z > r[1] - margin && z < r[3] + margin) return false;
    return true;
  }
  if (p.round) return Math.hypot(x - p.x, z - p.z) > p.h + margin;
  return Math.abs(x - p.x) > p.h + margin || Math.abs(z - p.z) > p.h + margin;
}

// la distance du point (x, z) au pilier ou à la cloison (0 dedans)
export function pillarDist(p, x, z) {
  if (p.poly) return polyDist(p.poly, x, z);
  if (p.round) return Math.max(0, Math.hypot(x - p.x, z - p.z) - p.h);
  if (p.rects) {
    let best = Infinity;
    for (const r of p.rects) {
      const d = Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
      if (d < best) best = d;
    }
    return best;
  }
  return Math.hypot(Math.max(0, Math.abs(x - p.x) - p.h), Math.max(0, Math.abs(z - p.z) - p.h));
}

// le segment (ax, az) → (ax + dx, az + dz) passe-t-il dans le rectangle r ?
function segRect(ax, az, dx, dz, r) {
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-12) {
    if (ax <= r[0] || ax >= r[2]) return false;
  } else {
    let u = (r[0] - ax) / dx;
    let v = (r[2] - ax) / dx;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  if (Math.abs(dz) < 1e-12) {
    if (az <= r[1] || az >= r[3]) return false;
  } else {
    let u = (r[1] - az) / dz;
    let v = (r[3] - az) / dz;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}

// le segment (ax, az) → (bx, bz) traverse-t-il le pilier ou la cloison ? (exact : pas d'échantillons qui passeraient
// à côté d'une cloison de 12 cm)
export function segHitsPillar(p, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  if (p.poly) {
    if (polyDist(p.poly, ax, az) === 0 || polyDist(p.poly, bx, bz) === 0) return true;
    const P = p.poly;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      if (segCross(ax, az, bx, bz, a[0], a[1], b[0], b[1])) return true;
    }
    return false;
  }
  if (p.round) {
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2)) : 0;
    return Math.hypot(ax + dx * t - p.x, az + dz * t - p.z) < p.h;
  }
  if (p.rects) {
    for (const r of p.rects) if (segRect(ax, az, dx, dz, r)) return true;
    return false;
  }
  return segRect(ax, az, dx, dz, [p.x - p.h, p.z - p.h, p.x + p.h, p.z + p.h]);
}

// les cases traversées par le segment (ax, az) → (bx, bz), dans l'ordre : visit(gx, gz) renvoie true pour s'arrêter
// (et cellsOnSeg renvoie alors true)
export function cellsOnSeg(ax, az, bx, bz, visit) {
  const C = CELL_SIZE;
  let gx = Math.floor(ax / C);
  let gz = Math.floor(az / C);
  const ex = Math.floor(bx / C);
  const ez = Math.floor(bz / C);
  const dx = bx - ax;
  const dz = bz - az;
  const sx = dx > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? C / Math.abs(dx) : Infinity;
  const tdz = dz !== 0 ? C / Math.abs(dz) : Infinity;
  let tx = dx !== 0 ? (sx > 0 ? (gx + 1) * C - ax : ax - gx * C) / Math.abs(dx) : Infinity;
  let tz = dz !== 0 ? (sz > 0 ? (gz + 1) * C - az : az - gz * C) / Math.abs(dz) : Infinity;
  for (let n = 0; n < 4096; n++) {
    if (visit(gx, gz)) return true;
    if (gx === ex && gz === ez) return false;
    if (tx < tz) {
      if (tx > 1) return false;
      gx += sx;
      tx += tdx;
    } else {
      if (tz > 1) return false;
      gz += sz;
      tz += tdz;
    }
  }
  return false;
}

// Creuse la cabine de l'ascenseur dans un mur voisin de la case d'entrée : la cabine est fermée sur trois côtés,
// on y entre par l'entrée. Renvoie { gx, gz, x, z, dx, dz } (dx, dz : de l'entrée vers la cabine) ou null.
export function carveElevator(grid, W, H, entrance, spawn, rnd, avoid = null) {
  const at = (x, z) => (x < 0 || x >= W || z < 0 || z >= H ? T.WALL : grid[z * W + x]);
  let lastD = null;
  const reach = () => {
    const d = bfs(grid, W, H, spawn.x, spawn.z);
    lastD = d;
    let n = 0;
    for (let i = 0; i < W * H; i++) if (d[i] >= 0) n++;
    return n;
  };
  const before = reach();
  const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rnd);
  for (const [dx, dz] of dirs) {
    const cx = entrance.x + dx;
    const cz = entrance.z + dz;
    if (cx < 1 || cx > W - 2 || cz < 1 || cz > H - 2) continue;
    if (at(cx, cz) === T.FLOOR || at(cx, cz) === T.PILLAR || isChamfer(at(cx, cz))) continue; // la cabine se creuse dans un mur (pas dans un pilier fin)
    const around = [[cx + dx, cz + dz], [cx + dz, cz + dx], [cx - dz, cz - dx]];
    if (avoid && [[cx, cz], ...around].some(([x, z]) => avoid.has(z * W + x))) continue;
    const saved = around.map(([x, z]) => at(x, z));
    const orig = at(cx, cz);
    around.forEach(([x, z]) => {
      if (x > 0 && x < W - 1 && z > 0 && z < H - 1) grid[z * W + x] = T.WALL;
    });
    grid[cz * W + cx] = T.EXIT;
    // fermer la cabine ne doit couper aucun passage, ni isoler sa propre entrée
    if (reach() >= before - 3 && lastD[entrance.z * W + entrance.x] >= 0) {
      return { gx: cx, gz: cz, x: (cx + 0.5) * CELL_SIZE, z: (cz + 0.5) * CELL_SIZE, dx, dz };
    }
    grid[cz * W + cx] = orig;
    around.forEach(([x, z], i) => {
      if (x > 0 && x < W - 1 && z > 0 && z < H - 1) grid[z * W + x] = saved[i];
    });
  }
  return null;
}

// meubles abandonnés (modèles Kenney du manoir) : nom, hauteur en m, rayon de collision
// Objets abandonnés du Level 0 (modèles Poly Haven, CC0, dans backrooms/models/) ; chair : posée de travers, parfois renversée
export const PROP_KINDS = [
  { m: 'cardboard_box_01', h: 0.42, r: 0.32 },
  { m: 'SchoolChair_01', h: 0.86, r: 0.3, chair: true },
  { m: 'plastic_monobloc_chair_01', h: 0.8, r: 0.3, chair: true },
  { m: 'metal_office_desk', h: 0.76, r: 0.6 },
  { m: 'Television_01', h: 0.45, r: 0.3 },
  { m: 'trashbag', h: 0.5, r: 0.3 },
  { m: 'WetFloorSign_01', h: 0.62, r: 0.22 },
  { m: 'Sofa_01', h: 0.9, r: 0.62 },
  { m: 'modern_arm_chair_01', h: 0.86, r: 0.38, turn: true },
  { m: 'SchoolDesk_01', h: 0.75, r: 0.4, turn: true },
  { m: 'standing_chalkboard_01', h: 1.2, r: 0.32 },
  { m: 'worn_metal_rack', h: 1.6, r: 0.45 },
  { m: 'tool_cart', h: 0.9, r: 0.45, turn: true },
  { m: 'projector_screen', h: 1.8, r: 0.35 },
  { m: 'wooden_ladder', h: 1.5, r: 0.35 },
];
// Le matériel des chantiers abandonnés (dessiné dans le code) : projecteurs éteints sur trépied et cônes
export const WORKLIGHT = { m: 'worklight', h: 1.75, r: 0.32, proc: true };
export const CONE = { m: 'cone', h: 0.5, r: 0.18, proc: true };

// opts.lower : étage du bas (pas de couloir piégé, de renfoncement ni d'échelle) ; opts.forced : cases qui doivent
// rester du sol accessible (sous les trous de l'étage du dessus) ; opts.box : { x0, z0, size }, le carré de la grille
// où l'étage existe (son mur d'enceinte compris), le reste est du mur plein (même repère que l'étage du dessus)
export function createBackroomsMap(seed = 42, opts = {}) {
  const lower = !!opts.lower;
  const W = MAP_SIZE;
  const H = MAP_SIZE;
  const BX = opts.box ? opts.box.x0 : 0;
  const BZ = opts.box ? opts.box.z0 : 0;
  const BW = opts.box ? opts.box.size : W;
  const BH = opts.box ? opts.box.size : H;
  const AREA = (BW * BH) / (W * H); // part de la grille occupée : les tirages « par étage » en tiennent compte
  const per = (n) => (AREA === 1 ? n : Math.max(1, Math.round(n * AREA)));
  const grid = new Uint8Array(W * H);

  // Générateur pseudo-aléatoire (mulberry32) pour une carte reproductible à partir de la graine
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const inside = (x, z) => x > BX && x < BX + BW - 1 && z > BZ && z < BZ + BH - 1;
  const get = (x, z) => (x < 0 || x >= W || z < 0 || z >= H ? T.WALL : grid[z * W + x]);
  const set = (x, z, val) => {
    if (inside(x, z)) grid[z * W + x] = val;
  };

  // 1. Tout est sol, entouré d'un mur d'enceinte
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      grid[z * W + x] = inside(x, z) ? T.FLOOR : T.WALL;
    }
  }

  // 2. Grandes salles vides : on n'y pose aucune cloison (les « halls » du Level 0)
  const halls = [];
  // (trois, de 5 à 10 cases de côté : de grands espaces, mais pas au point de perdre le dédale)
  for (let i = 0; i < per(3); i++) {
    const w = 5 + Math.floor(rnd() * 6);
    const h = 5 + Math.floor(rnd() * 6);
    halls.push({ x: BX + 2 + Math.floor(rnd() * (BW - w - 4)), z: BZ + 2 + Math.floor(rnd() * (BH - h - 4)), w, h });
  }
  const inHall = (x, z) => halls.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);

  // 3. Quadrillage irrégulier de cloisons : les lignes tombent tous les 3 à 6 cases, à des places tirées au hasard,
  // et chaque pan de mur existe ou non, avec souvent une ouverture. D'une partie à l'autre, rien n'est au même endroit.
  const lines = (n) => {
    const out = [];
    for (let v = Math.floor(rnd() * 3); v < n; v += 3 + Math.floor(rnd() * 4)) out.push(v);
    if (out[out.length - 1] !== n - 1) out.push(n - 1);
    return out;
  };
  const xs = lines(W);
  const zs = lines(H);
  const density = 0.66 + rnd() * 0.14; // certaines parties plus ouvertes, d'autres plus labyrinthiques
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length; i++) {
      const gx = xs[i];
      const gz = zs[j];
      // pilier au croisement
      if (rnd() < 0.55 && !inHall(gx, gz)) set(gx, gz, T.WALL);
      // pan vers l'est (jusqu'à la ligne suivante), puis pan vers le sud
      for (const [dx, dz, len] of [[1, 0, (xs[i + 1] ?? W) - gx], [0, 1, (zs[j + 1] ?? H) - gz]]) {
        if (rnd() > density) continue;
        const gaps = new Set();
        if (rnd() < 0.65) gaps.add(1 + Math.floor(rnd() * Math.max(1, len - 1))); // case laissée ouverte
        if (len > 4 && rnd() < 0.4) gaps.add(1 + Math.floor(rnd() * (len - 1)));
        for (let k = 0; k <= len; k++) {
          const x = gx + dx * k;
          const z = gz + dz * k;
          if (gaps.has(k) || inHall(x, z)) continue;
          set(x, z, T.WALL);
        }
      }
    }
  }
  const onLine = (x, z) => xs.includes(x) || zs.includes(z);

  // 4. Cloisons libres en L, hors du quadrillage, et piliers isolés pour casser les lignes de vue
  for (let i = 0; i < per(26); i++) {
    let x = BX + 2 + Math.floor(rnd() * (BW - 4));
    let z = BZ + 2 + Math.floor(rnd() * (BH - 4));
    let [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const len = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < len * 2; k++) {
      if (k === len) {
        if (rnd() < 0.5) break;
        [dx, dz] = [dz, -dx]; // le pan tourne d'un quart
      }
      if (!inside(x, z) || inHall(x, z) || onLine(x, z)) break;
      set(x, z, T.WALL);
      x += dx;
      z += dz;
    }
  }
  for (let i = 0; i < per(90); i++) {
    const x = BX + 2 + Math.floor(rnd() * (BW - 4));
    const z = BZ + 2 + Math.floor(rnd() * (BH - 4));
    if (!onLine(x, z) && !inHall(x, z)) set(x, z, T.WALL);
  }

  // 4b. Dans les grandes salles, de gros piliers carrés (2 × 2 cases) çà et là
  for (const r of halls) {
    for (let z = r.z + 2; z + 1 < r.z + r.h - 2; z += 4 + Math.floor(rnd() * 2)) {
      for (let x = r.x + 2; x + 1 < r.x + r.w - 2; x += 4 + Math.floor(rnd() * 2)) {
        if (rnd() < 0.3) continue;
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, z + dz, T.WALL);
      }
    }
  }

  // 4c. Moins de culs-de-sac : au fond d'une impasse, on perce le mur s'il y a du sol derrière (on en garde environ un sur trois)
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const isF = (x, z) => get(x, z) === T.FLOOR;
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < H - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        if (!isF(x, z)) continue;
        const open = DIRS.filter(([dx, dz]) => isF(x + dx, z + dz));
        if (open.length !== 1 || rnd() < 0.35) continue;
        const [ox, oz] = open[0];
        // en face d'abord, sinon sur les côtés ; un mur d'une case, ou de deux
        for (const [dx, dz] of [[-ox, -oz], ...(rnd() < 0.5 ? [[oz, ox], [-oz, -ox]] : [[-oz, -ox], [oz, ox]])]) {
          if (!inside(x + dx, z + dz) || get(x + dx, z + dz) !== T.WALL) continue;
          if (isF(x + 2 * dx, z + 2 * dz)) {
            set(x + dx, z + dz, T.FLOOR);
            break;
          }
          if (inside(x + 2 * dx, z + 2 * dz) && isF(x + 3 * dx, z + 3 * dz)) {
            set(x + dx, z + dz, T.FLOOR);
            set(x + 2 * dx, z + 2 * dz, T.FLOOR);
            break;
          }
        }
      }
    }
  }

  // 4d. Des cloisons au milieu des espaces trop ouverts (hors des grandes salles) : des pans droits de 3 à 6 cases,
  // accrochés à un mur quand c'est possible et percés d'une porte s'ils vont d'un mur à l'autre. Ce sont des murs
  // ici ; ils deviennent des cloisons de plâtre de 12 cm plus bas (8c). Ils ne coupent jamais le dédale en deux et
  // ne créent pas de cul-de-sac. Tirés à part : le reste du tirage de la carte ne bouge pas.
  const partCells = new Set();
  if (PARTITIONS > 0) {
    let ps = Math.imul((seed >>> 0) ^ 0x2545f491, 2654435761) >>> 0 || 1;
    const prnd = () => {
      ps = (ps + 0x6d2b79f5) >>> 0;
      let t = ps;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const isF0 = (x, z) => inside(x, z) && grid[z * W + x] === T.FLOOR;
    const avoid = new Set();
    for (const [fx, fz] of opts.forced || []) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) avoid.add((fz + dz) * W + fx + dx);
    // la plus grande partie d'un seul tenant : une cloison ne doit jamais la couper
    let ref = -1;
    let refSize = 0;
    const seen = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) {
      if (grid[k] !== T.FLOOR || seen[k]) continue;
      const d = bfs(grid, W, H, k % W, (k - (k % W)) / W);
      let n = 0;
      for (let i = 0; i < W * H; i++) if (d[i] >= 0) (seen[i] = 1), n++;
      if (n > refSize) (refSize = n), (ref = k);
    }
    // on part du milieu des espaces les plus ouverts : presque tout libre sur 5 × 5 cases
    const roomy = (x, z) => {
      let n = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (isF0(x + dx, z + dz)) n++;
      return n >= PART_ROOMY && isF0(x, z);
    };
    const fits = (x, z, px, pz) => isF0(x, z) && !avoid.has(z * W + x) && z * W + x !== ref && isF0(x + px, z + pz) && isF0(x - px, z - pz);
    const crowded = (x, z) => {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (partCells.has((z + dz) * W + x + dx)) return true;
      return false;
    };
    // culs-de-sac (une seule case libre autour) dans un carré autour des cases posées
    const deadEnds = (cells) => {
      let n = 0;
      const xs0 = cells.map((c) => c[0]);
      const zs0 = cells.map((c) => c[1]);
      for (let z = Math.min(...zs0) - 2; z <= Math.max(...zs0) + 2; z++) {
        for (let x = Math.min(...xs0) - 2; x <= Math.max(...xs0) + 2; x++) {
          if (isF0(x, z) && DIRS.filter(([dx, dz]) => isF0(x + dx, z + dz)).length === 1) n++;
        }
      }
      return n;
    };
    let placed = 0;
    for (let a = 0; a < per(PARTITIONS) * 14 && placed < per(PARTITIONS); a++) {
      const x0 = BX + 2 + Math.floor(prnd() * (BW - 4));
      const z0 = BZ + 2 + Math.floor(prnd() * (BH - 4));
      if (!roomy(x0, z0)) continue;
      const [ax, az] = prnd() < 0.5 ? [1, 0] : [0, 1];
      const [px, pz] = [az, ax];
      let f = 0;
      let b = 0;
      while (f < 8 && fits(x0 + ax * (f + 1), z0 + az * (f + 1), px, pz)) f++;
      while (b < 8 && fits(x0 - ax * (b + 1), z0 - az * (b + 1), px, pz)) b++;
      const runLen = b + f + 1;
      if (runLen < 3) continue;
      const fWall = get(x0 + ax * (f + 1), z0 + az * (f + 1)) === T.WALL;
      const bWall = get(x0 - ax * (b + 1), z0 - az * (b + 1)) === T.WALL;
      const L = Math.min(runLen, 3 + Math.floor(prnd() * 4));
      let s = -b + Math.floor(prnd() * (runLen - L + 1)); // un paravent au milieu de la pièce
      if (fWall && (!bWall || prnd() < 0.5)) s = f - L + 1; // ou accroché au mur d'en face
      else if (bWall) s = -b;
      const cells = [];
      for (let i = 0; i < L; i++) cells.push([x0 + ax * (s + i), z0 + az * (s + i)]);
      if (cells.some(([x, z]) => crowded(x, z))) continue;
      let door = -1;
      if (s === -b && bWall && s + L - 1 === f && fWall) {
        if (L < 4) continue;
        door = 1 + Math.floor(prnd() * (L - 2));
      }
      const put = cells.filter((_, i) => i !== door);
      const before = deadEnds(cells);
      for (const [x, z] of put) grid[z * W + x] = T.WALL;
      let ok = deadEnds(cells) <= before;
      if (ok) {
        const d = bfs(grid, W, H, ref % W, (ref - (ref % W)) / W);
        let n = 0;
        for (let i = 0; i < W * H; i++) if (d[i] >= 0) n++;
        ok = n === refSize - put.length;
        if (ok) refSize = n;
      }
      if (!ok) {
        for (const [x, z] of put) grid[z * W + x] = T.FLOOR;
        continue;
      }
      for (const [x, z] of put) partCells.add(z * W + x);
      placed++;
    }
  }

  // 4e. Des couloirs en diagonale, à 45° : ils cassent le quadrillage. Une file de cases libres qui se touchent par
  // un coin (I) ; entre deux, de part et d'autre, une case coupée en biais (CHAMFER) : sa moitié du côté du couloir se
  // traverse, l'autre est pleine. Derrière, des murs (fill), pour qu'on ne puisse aller de la case coupée que dans le
  // couloir. Aux deux bouts, il débouche dans le dédale. Il ne coupe rien en deux. Tiré à part, comme les cloisons.
  const diagFill = new Set();
  // derrière le mur en biais, les cases murées en escalier, et le côté vers lequel elles donnent (voir 6b : là où il y a
  // du sol, elles deviennent à leur tour des cases coupées en biais, tournées vers l'extérieur)
  const diagOuter = new Map();
  // la forme d'une case coupée en biais, libre vers A et B : le coin libre (entre ses deux voisins libres), le coin
  // opposé, les deux bouts du biais ; la face regarde le côté libre
  const chamferShapeOf = (x, z, A, B) => {
    const cx = (x + 0.5) * CELL_SIZE;
    const cz = (z + 0.5) * CELL_SIZE;
    const h = CELL_SIZE / 2;
    const opp = [cx - (A[0] + B[0]) * h, cz - (A[1] + B[1]) * h];
    const e1 = [cx + (A[0] - B[0]) * h, cz + (A[1] - B[1]) * h];
    const e2 = [cx + (B[0] - A[0]) * h, cz + (B[1] - A[1]) * h];
    const face = { a: e1, b: e2, nx: (A[0] + B[0]) / Math.SQRT2, nz: (A[1] + B[1]) / Math.SQRT2 };
    return { x: cx, z: cz, h, poly: [e1, opp, e2], face };
  };
  const diagUsed = new Set();
  const chamferShape = new Map(); // case -> { x, z, h, poly, face }
  const chamfers = []; // pour le décor : { a: [x, z], b: [x, z], nx, nz } (la face du mur, vue du couloir), voir 6b
  // les couloirs eux-mêmes : { sx, cells : [[x, z]] (les cases pleines, dans l'ordre), cuts : [[x, z]] (les cases
  // coupées), rot : l'angle (autour de y) qui couche l'axe x le long du couloir } ; le plafond et les néons les suivent
  const diags = [];
  const diagCell = new Map(); // case pleine d'un couloir en diagonale -> son rang dans le couloir
  if (DIAG > 0) {
    let ds = Math.imul((seed >>> 0) ^ 0x51ed270b, 2246822519) >>> 0 || 1;
    const drnd = () => {
      ds = (ds + 0x6d2b79f5) >>> 0;
      let t = ds;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const avoid = new Set();
    for (const [fx, fz] of opts.forced || []) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) avoid.add((fz + dz) * W + fx + dx);
    const okCell = (x, z) => x >= BX + 2 && z >= BZ + 2 && x <= BX + BW - 3 && z <= BZ + BH - 3 && !inHall(x, z) && !avoid.has(z * W + x);
    const reachN = (from) => {
      const d = bfs(grid, W, H, from % W, (from - (from % W)) / W);
      return d;
    };
    const C = CELL_SIZE;
    let placed = 0;
    for (let a = 0; a < per(DIAG) * 40 && placed < per(DIAG); a++) {
      const sx = drnd() < 0.5 ? 1 : -1; // « \ » ou « / »
      const n = 4 + Math.floor(drnd() * 4);
      const x0 = BX + 3 + Math.floor(drnd() * (BW - 6));
      const z0 = BZ + 3 + Math.floor(drnd() * (BH - 6));
      const I = [];
      for (let i = 0; i < n; i++) I.push([x0 + i * sx, z0 + i]);
      const ch = []; // [x, z, vers I_i, vers I_i+1]
      const fill = [];
      for (let i = 0; i + 1 < n; i++) {
        const [x, z] = I[i];
        // de côté (vers x) : ses voisins du couloir sont I_i (en -sx) et I_i+1 (en +z) ; derrière, deux murs
        ch.push([x + sx, z, [-sx, 0], [0, 1]]);
        fill.push([x + 2 * sx, z], [x + sx, z - 1]);
        // en dessous (vers z) : I_i (en -z) et I_i+1 (en +sx)
        ch.push([x, z + 1, [0, -1], [sx, 0]]);
        fill.push([x - sx, z + 1], [x, z + 2]);
      }
      const [xl, zl] = I[n - 1];
      const mouths = [[x0 - sx, z0], [x0, z0 - 1], [xl + sx, zl], [xl, zl + 1]];
      const all = [...I, ...ch.map((c) => [c[0], c[1]]), ...fill, ...mouths];
      if (!all.every(([x, z]) => okCell(x, z))) continue;
      // loin des autres couloirs en diagonale
      if (all.some(([x, z]) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (diagUsed.has((z + dz) * W + x + dx)) return true; return false; })) continue;
      // il traverse quelque chose : au moins deux de ses cases étaient des murs (sinon, un espace déjà ouvert)
      if (I.filter(([x, z]) => grid[z * W + x] !== T.FLOOR).length + ch.filter(([x, z]) => grid[z * W + x] !== T.FLOOR).length < 2) continue;
      // la plus grande partie d'un seul tenant, avant
      let ref = -1;
      let refN = 0;
      const seen = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) {
        if (grid[k] !== T.FLOOR || seen[k]) continue;
        const d = reachN(k);
        let c = 0;
        for (let i = 0; i < W * H; i++) if (d[i] >= 0) (seen[i] = 1), c++;
        if (c > refN) (refN = c), (ref = k);
      }
      const before = reachN(ref);
      const saved = all.map(([x, z]) => grid[z * W + x]);
      for (const [x, z] of fill) grid[z * W + x] = T.WALL;
      for (const [x, z] of I) grid[z * W + x] = T.FLOOR;
      for (const [x, z] of mouths) grid[z * W + x] = T.FLOOR;
      for (const [x, z, A, B] of ch) grid[z * W + x] = chamferTile(A[0] || B[0], A[1] || B[1]);
      // rien de ce qu'on atteignait ne doit être coupé ; le couloir et ses deux bouts sont reliés au reste
      const start = grid[ref] === T.FLOOR ? ref : z0 * W + x0;
      const after = reachN(start);
      let ok = I.every(([x, z]) => after[z * W + x] >= 0) && mouths.every(([x, z]) => after[z * W + x] >= 0);
      for (let k = 0; ok && k < W * H; k++) if (before[k] >= 0 && grid[k] === T.FLOOR && after[k] < 0) ok = false;
      if (!ok) {
        all.forEach(([x, z], i) => (grid[z * W + x] = saved[i]));
        continue;
      }
      for (const [x, z] of all) diagUsed.add(z * W + x);
      for (const [x, z] of fill) diagFill.add(z * W + x);
      for (const [x, z] of I.slice(0, -1)) {
        diagOuter.set(z * W + x + 2 * sx, [sx, -1]);
        diagOuter.set((z - 1) * W + x + sx, [sx, -1]);
        diagOuter.set((z + 1) * W + x - sx, [-sx, 1]);
        diagOuter.set((z + 2) * W + x, [-sx, 1]);
      }
      const dg = { sx, cells: I, cuts: ch.map((c) => [c[0], c[1]]), rot: Math.atan2(-1, sx) };
      diags.push(dg);
      I.forEach(([x, z], i) => diagCell.set(z * W + x, { dg, i }));
      for (const [x, z, A, B] of ch) {
        chamferShape.set(z * W + x, chamferShapeOf(x, z, A, B));
      }
      placed++;
    }
  }

  // 5. Point de départ près du centre, sur une case libre reliée à la plus grande partie du dédale
  let floorCount = 0;
  for (let i = 0; i < W * H; i++) if (grid[i] === T.FLOOR) floorCount++;
  const cx0 = BX + (BW >> 1);
  const cz0 = BZ + (BH >> 1);
  let sx = cx0;
  let sz = cz0;
  let dist = null;
  for (let r = 0; r < 400; r++) {
    if (get(sx, sz) === T.FLOOR) {
      dist = bfs(grid, W, H, sx, sz);
      let reach = 0;
      for (let i = 0; i < W * H; i++) if (dist[i] >= 0) reach++;
      if (reach > floorCount * 0.5) break;
    }
    const spread = 4 + (r >> 4);
    sx = Math.min(BX + BW - 2, Math.max(BX + 1, cx0 + Math.floor(rnd() * (spread * 2 + 1)) - spread));
    sz = Math.min(BZ + BH - 2, Math.max(BZ + 1, cz0 + Math.floor(rnd() * (spread * 2 + 1)) - spread));
  }

  // 5b. Cases imposées (sous les trous du dessus) : du sol, relié au reste par un passage creusé s'il le faut
  if (opts.forced && opts.forced.length) {
    for (const [x, z] of opts.forced) set(x, z, T.FLOOR);
    dist = bfs(grid, W, H, sx, sz);
    for (const [fx, fz] of opts.forced) {
      if (dist[fz * W + fx] >= 0) continue;
      // parcours en largeur à travers les murs jusqu'à une case accessible, puis on creuse le chemin
      const prev = new Int32Array(W * H).fill(-1);
      const q = [fz * W + fx];
      prev[q[0]] = q[0];
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        const k = q[h];
        const x = k % W;
        const z = (k - x) / W;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (!inside(nx, nz)) continue;
          const nk = nz * W + nx;
          if (prev[nk] >= 0 || diagUsed.has(nk)) continue; // (on ne creuse pas un couloir en diagonale)
          prev[nk] = k;
          if (dist[nk] >= 0) {
            hit = nk;
            break;
          }
          q.push(nk);
        }
      }
      for (let k = hit; k >= 0 && k !== prev[k]; k = prev[k]) grid[k] = grid[k] === T.EXIT ? T.EXIT : T.FLOOR;
      grid[fz * W + fx] = T.FLOOR;
      dist = bfs(grid, W, H, sx, sz);
    }
  }

  // 6. Parcours en largeur depuis le départ : les poches inaccessibles deviennent des murs, on garde les distances
  for (let i = 0; i < W * H; i++) {
    if (grid[i] === T.FLOOR && dist[i] < 0) grid[i] = T.WALL;
  }

  const walkable = [];
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[z * W + x] === T.FLOOR) walkable.push({ x, z });
    }
  }
  const D = (c) => dist[c.z * W + c.x];
  const cellPos = (c) => ({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE, gx: c.x, gz: c.z });

  // 6b. Piliers de toutes les tailles : un mur isolé (du sol tout autour) devient souvent un pilier plus petit que la
  // case, carré (60 cm à 1,5 m) ou rond (colonne de 60 cm à 1,1 m), un peu décentré ; les autres restent pleins
  const pillars = {};
  for (const [k, sh] of chamferShape) if (isChamfer(grid[k])) (pillars[k] = sh), chamfers.push(sh.face);
  // de l'autre côté du mur en biais : là où une case murée donne sur du sol, elle est coupée en biais elle aussi, sa
  // moitié libre de ce côté-là. Le mur est alors partout aussi épais (1,8 m), biais des deux côtés, sans escalier
  for (const [k, [ox, oz]] of diagOuter) {
    if (grid[k] !== T.WALL) continue;
    const x = k % W;
    const z = (k - x) / W;
    if (get(x + ox, z) !== T.FLOOR && get(x, z + oz) !== T.FLOOR) continue;
    grid[k] = chamferTile(ox, oz);
    const sh = chamferShapeOf(x, z, [ox, 0], [0, oz]);
    pillars[k] = sh;
    chamfers.push(sh.face);
  }
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      const k = z * W + x;
      if (grid[k] !== T.WALL || DIRS.some(([dx, dz]) => get(x + dx, z + dz) !== T.FLOOR)) continue;
      if (rnd() < 0.3) continue;
      const round = rnd() < 0.4;
      const h = round ? [0.3, 0.42, 0.55][Math.floor(rnd() * 3)] : [0.3, 0.48, 0.75][Math.floor(rnd() * 3)];
      const slack = CELL_SIZE / 2 - h - 0.05;
      grid[k] = T.PILLAR;
      pillars[k] = {
        x: (x + 0.5) * CELL_SIZE + (rnd() - 0.5) * slack * 0.6,
        z: (z + 0.5) * CELL_SIZE + (rnd() - 0.5) * slack * 0.6,
        h,
        round,
      };
    }
  }

  const spawn = cellPos({ x: sx, z: sz });

  // 7. La sortie : un ascenseur creusé dans un mur, devant l'une des cases les plus éloignées (en marche) du départ
  const far = walkable.filter((c) => D(c) > 0).sort((a, b) => D(b) - D(a));
  let exitCell = null;
  let elevator = null;
  for (let i = 0; i < 60 && !elevator; i++) {
    exitCell = far[Math.floor(rnd() * Math.min(20 + i * 4, far.length))];
    elevator = carveElevator(grid, W, H, exitCell, { x: sx, z: sz }, rnd, opts.forced || diagUsed.size ? new Set([...(opts.forced || []).map(([x, z]) => z * W + x), ...diagUsed]) : null);
  }
  const exit = cellPos(exitCell);
  // la cabine et les murs qui la ferment ont pu retirer des cases du sol
  for (let i = walkable.length - 1; i >= 0; i--) if (grid[walkable[i].z * W + walkable[i].x] !== T.FLOOR) walkable.splice(i, 1);

  // 7b. Les trous : posés plus bas, une fois les cassettes en place (le couloir piégé qui garde l'une d'elles)
  const pitGrid = new Int16Array(W * H).fill(-1);
  const pits = [];
  let trap = null;
  let vaultCells = null; // les cases réécrites par le couloir piégé (pièce, couloir, murs autour)

  const maxD = D(far[0]) || 1;
  // 8. Les cassettes : le plus loin possible (en marche) du départ, de la sortie et les unes des autres
  const reach = bfs(grid, W, H, sx, sz); // la cabine a pu couper un recoin ; pas collée au bord (place pour le couloir piégé)
  const cassettes = spreadOut(walkable.filter((c) => D(c) > 6 && reach[c.z * W + c.x] >= 0 && c.x > 3 && c.z > 3 && c.x < W - 4 && c.z < H - 4), [{ x: sx, z: sz }, exitCell], CASSETTES, gridDist(grid, W, H), rnd).map((c, i) => ({
    id: i,
    ...cellPos(c),
    name: `Cassette VHS #${i + 1}`,
    collected: false,
  }));

  // 8a. Le couloir piégé : autour d'une cassette, une pièce de 3 × 3 cases fermée de murs, et un seul accès, un
  // couloir de trous qui tourne. Il avance par blocs de 2 × 2 trous : on le traverse sur les arêtes (entre deux
  // trous), qui suivent ses virages. On vérifie qu'on ne peut pas le contourner et que tout le reste du dédale reste
  // accessible ; sinon on essaie un autre tracé, un autre côté ou une autre cassette.
  const reachAll = (blockPits) => {
    const g = blockPits ? grid.map((v, i) => (pitGrid[i] >= 0 ? T.WALL : v)) : grid;
    return bfs(g, W, H, sx, sz);
  };
  // tracés possibles (en blocs de 2 cases) : d = tout droit depuis la pièce, t = de côté ; toujours au moins un virage
  const SHAPES = [['d', 't', 't', 'd'], ['d', 't', 't', 'd', 'd'], ['d', 'd', 't', 't', 'd'], ['d', 't', 'd', 't'], ['d', 't', 't', 't', 'd'], ['d', 't', 'd', 'd', 't']];
  const vaultTry = (cas, [dx, dz], shape, side) => {
    const cx = cas.gx;
    const cz = cas.gz;
    const tx = -dz * side;
    const tz = dx * side; // de côté
    const writes = new Map(); // case -> nouvelle valeur
    const put = (x, z, v) => writes.set(z * W + x, v);
    const room = new Set();
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const ring = Math.max(Math.abs(a), Math.abs(b)) === 2;
        put(cx + a, cz + b, ring ? T.WALL : T.FLOOR);
        room.add((cz + b) * W + cx + a);
      }
    }
    // premier bloc : collé à la pièce, il remplace deux cases de son mur
    let bx = dx > 0 ? cx + 2 : dx < 0 ? cx - 3 : cx;
    let bz = dz > 0 ? cz + 2 : dz < 0 ? cz - 3 : cz;
    const corridor = new Set();
    let last = [dx, dz];
    shape.forEach((step, i) => {
      const [sx2, sz2] = step === 'd' ? [dx, dz] : [tx, tz];
      if (i > 0) {
        bx += sx2 * 2;
        bz += sz2 * 2;
      }
      last = [sx2, sz2];
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) corridor.add((bz + oz) * W + bx + ox);
    });
    // la sortie : les deux cases au-delà du dernier bloc
    const [lx, lz] = last;
    const exits = lx > 0 ? [[bx + 2, bz], [bx + 2, bz + 1]] : lx < 0 ? [[bx - 1, bz], [bx - 1, bz + 1]] : lz > 0 ? [[bx, bz + 2], [bx + 1, bz + 2]] : [[bx, bz - 1], [bx + 1, bz - 1]];
    const exitSet = new Set(exits.map(([x, z]) => z * W + x));
    // le couloir ne passe pas dans la pièce (sauf par son mur d'entrée)
    for (const k of corridor) {
      const x = k % W;
      const z = (k - x) / W;
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) < 2) return false;
    }
    for (const k of corridor) writes.set(k, T.FLOOR);
    for (const k of exitSet) writes.set(k, T.FLOOR);
    // des murs tout autour du couloir : on n'y entre que par ses deux bouts
    for (const k of corridor) {
      const x = k % W;
      const z = (k - x) / W;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const n = (z + oz) * W + x + ox;
          if (!corridor.has(n) && !exitSet.has(n) && !(room.has(n) && writes.get(n) === T.FLOOR)) writes.set(n, T.WALL);
        }
      }
    }
    // rien d'important ne doit être écrasé
    const keep = new Set([sz * W + sx, exitCell.z * W + exitCell.x, ...cassettes.filter((c) => c !== cas).map((c) => c.gz * W + c.gx)]);
    if (elevator) keep.add(elevator.gz * W + elevator.gx);
    for (const [k] of writes) {
      const x = k % W;
      const z = (k - x) / W;
      if (x < 1 || x > W - 2 || z < 1 || z > H - 2) return false;
      if (keep.has(k) || grid[k] === T.EXIT || diagUsed.has(k)) return false;
      if (Math.hypot(x - sx, z - sz) < 4) return false;
    }
    const saved = new Map([...writes.keys()].map((k) => [k, grid[k]]));
    for (const [k, v] of writes) grid[k] = v;
    for (const k of corridor) pitGrid[k] = 0;
    const open = reachAll(false);
    const shut = reachAll(true);
    const others = [exitCell, ...cassettes.filter((c) => c !== cas).map((c) => ({ x: c.gx, z: c.gz }))];
    const ok = open[cas.gz * W + cas.gx] >= 0 && shut[cas.gz * W + cas.gx] < 0 && others.every((c) => shut[c.z * W + c.x] >= 0);
    for (const k of corridor) pitGrid[k] = -1;
    if (!ok) {
      for (const [k, v] of saved) grid[k] = v;
      return false;
    }
    for (const k of corridor) {
      const x = k % W;
      const z = (k - x) / W;
      pitGrid[k] = pits.length;
      pits.push({ id: pits.length, gx: x, gz: z, x: (x + 0.5) * CELL_SIZE, z: (z + 0.5) * CELL_SIZE });
    }
    cas.vault = true;
    vaultCells = new Set(writes.keys());
    // devant l'entrée du couloir piégé, tourné vers les trous (pour ?parkour)
    trap = { x: ((exits[0][0] + exits[1][0]) / 2 + 0.5 + lx * 0.2) * CELL_SIZE, z: ((exits[0][1] + exits[1][1]) / 2 + 0.5 + lz * 0.2) * CELL_SIZE, yaw: Math.atan2(lx, lz) };
    return true;
  };
  const byFar = lower ? [] : [...cassettes].sort((a, b) => D({ x: b.gx, z: b.gz }) - D({ x: a.gx, z: a.gz }));
  vaultLoop: for (const cas of byFar) {
    for (const d of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rnd)) {
      for (const shape of shuffle([...SHAPES], rnd)) {
        for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) if (vaultTry(cas, d, shape, side)) break vaultLoop;
      }
    }
  }
  // le dédale a changé : distances, cases libres (sans les trous) et cassette au centre de sa pièce
  dist = bfs(grid, W, H, sx, sz);
  for (let i = 0; i < W * H; i++) if (grid[i] === T.FLOOR && dist[i] < 0) grid[i] = T.WALL;
  walkable.length = 0;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR && pitGrid[z * W + x] < 0) walkable.push({ x, z });

  // 8a'. L'étage du bas : des champs de puits sans fond, une grille de trous carrés séparés d'arêtes de 34 cm, au
  // milieu d'une salle (on peut en faire le tour). Jamais sur un passage obligé : sans les traverser, tout l'étage reste
  // relié. Loin des cases où l'on atterrit en tombant du haut, du départ, de l'ascenseur et des cassettes possibles.
  if (lower) {
    const keepOut = [{ x: sx, z: sz, d: 5 }, { x: exitCell.x, z: exitCell.z, d: 5 }, ...(opts.forced || []).map(([x, z]) => ({ x, z, d: 4 })), ...cassettes.map((c) => ({ x: c.gx, z: c.gz, d: 2 }))];
    if (elevator) keepOut.push({ x: elevator.gx, z: elevator.gz, d: 4 });
    const clearOf = (x, z) => keepOut.every((k) => Math.max(Math.abs(k.x - x), Math.abs(k.z - z)) >= k.d);
    const open = (x, z) => x > 1 && z > 1 && x < W - 2 && z < H - 2 && grid[z * W + x] === T.FLOOR && pitGrid[z * W + x] < 0;
    const SIZES = [[4, 3], [3, 4], [3, 3], [4, 2], [2, 4], [3, 2], [2, 3]];
    const fields = [];
    for (const c of shuffle(walkable.slice(), rnd)) {
      if (fields.length >= DEEP_FIELDS) break;
      for (const [w, h] of SIZES) {
        const cells = [];
        for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) cells.push([c.x + dx, c.z + dz]);
        if (!cells.every(([x, z]) => open(x, z) && clearOf(x, z))) continue;
        // à bonne distance des autres champs
        if (fields.some((f) => Math.max(f.x0 - (c.x + w - 1), c.x - f.x1, f.z0 - (c.z + h - 1), c.z - f.z1) < 6)) continue;
        // au milieu d'une salle : du sol tout autour (les coins mis à part). Chaque arête entre deux puits débouche
        // ainsi, à ses deux bouts, sur du sol : on peut traverser le champ, jamais un chemin au bord du vide qui finit
        // contre un mur
        let ringOk = true;
        for (let x = c.x; x < c.x + w && ringOk; x++) ringOk = open(x, c.z - 1) && open(x, c.z + h);
        for (let z = c.z; z < c.z + h && ringOk; z++) ringOk = open(c.x - 1, z) && open(c.x + w, z);
        if (!ringOk) continue;
        // tout le reste de l'étage reste relié sans passer par les puits
        for (const [x, z] of cells) pitGrid[z * W + x] = 0;
        const d = bfs(grid.map((v, i) => (pitGrid[i] >= 0 ? T.WALL : v)), W, H, sx, sz);
        const linked = walkable.every((q) => pitGrid[q.z * W + q.x] >= 0 || d[q.z * W + q.x] >= 0);
        for (const [x, z] of cells) pitGrid[z * W + x] = -1;
        if (!linked) continue;
        for (const [x, z] of cells) {
          pitGrid[z * W + x] = pits.length;
          pits.push({ id: pits.length, gx: x, gz: z, x: (x + 0.5) * CELL_SIZE, z: (z + 0.5) * CELL_SIZE, deep: true });
        }
        fields.push({ x0: c.x, z0: c.z, x1: c.x + w - 1, z1: c.z + h - 1 });
        break;
      }
    }
    if (fields.length) {
      walkable.length = 0;
      for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR && pitGrid[z * W + x] < 0) walkable.push({ x, z });
    }
  }

  // 8b. Une cassette au fond d'un trou carré creusé haut dans un mur plein, au-dessus d'une case contre ce mur
  const wallSide = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL);
  let niche = null;
  for (const cas of lower ? [] : shuffle(cassettes.filter((c) => !c.vault), rnd)) {
    const c = { x: cas.gx, z: cas.gz };
    let sides = wallSide(c);
    let cell = c;
    if (!sides.length) {
      // pas de mur ici : on la déplace dans une case voisine adossée à un mur
      cell = walkable.filter((w) => Math.abs(w.x - c.x) + Math.abs(w.z - c.z) <= 4 && wallSide(w).length).sort((a, b) => Math.abs(a.x - c.x) + Math.abs(a.z - c.z) - (Math.abs(b.x - c.x) + Math.abs(b.z - c.z)))[0];
      if (!cell) continue;
      sides = wallSide(cell);
    }
    const [dx, dz] = pick(sides);
    const off = CELL_SIZE / 2 + NICHE_IN; // dans le trou, derrière la face du mur
    Object.assign(cas, cellPos(cell), { high: true });
    cas.x = (cell.x + 0.5) * CELL_SIZE + dx * off;
    cas.z = (cell.z + 0.5) * CELL_SIZE + dz * off;
    niche = { cas: cas.id, gx: cell.x, gz: cell.z, dx, dz, x: cas.x, z: cas.z, baseX: (cell.x + 0.5) * CELL_SIZE + dx * 0.55, baseZ: (cell.z + 0.5) * CELL_SIZE + dz * 0.55, ladder: false };
    break;
  }

  // 8c. Des cloisons fines : les pans posés en 4d, et par régions les pans droits et les bouts des murs d'une case
  // d'épaisseur (les angles et les croisements restent épais : le dédale garde sa forme), deviennent des cloisons de
  // plâtre de 12 cm, tirées sur l'axe de la case et prolongées jusqu'aux murs voisins. Les régions viennent d'un bruit
  // lent tiré à part : le reste du tirage de la carte ne bouge pas. On garde épais les murs de l'ascenseur, du couloir piégé (sinon on
  // longerait ses trous de l'autre côté d'une cloison) et du trou à cassette, les blocs de murs (2 × 2 et plus) et
  // l'enceinte. Une cloison est un pilier à rectangles (voir outsidePillar) : les chemins de l'entité évitent sa case,
  // mais on marche de part et d'autre (1,19 m de chaque côté).
  let thinCount = 0;
  {
    const TZ = 9;
    const hz = (i, j) => {
      let v = (Math.imul(i + 1013, 73856093) ^ Math.imul(j + 7, 19349663) ^ Math.imul((seed >>> 0) + 40503, 83492791)) >>> 0;
      v ^= v >>> 13;
      v = Math.imul(v, 1274126177) >>> 0;
      v ^= v >>> 16;
      return (v >>> 0) / 4294967296;
    };
    const region = (x, z) => {
      const fx = x / TZ;
      const fz = z / TZ;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      let tx = fx - ix;
      let tz = fz - iz;
      tx = tx * tx * (3 - 2 * tx);
      tz = tz * tz * (3 - 2 * tz);
      return (hz(ix, iz) * (1 - tx) + hz(ix + 1, iz) * tx) * (1 - tz) + (hz(ix, iz + 1) * (1 - tx) + hz(ix + 1, iz + 1) * tx) * tz;
    };
    const keep = new Set(vaultCells || []);
    const guard = (gx, gz) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) keep.add((gz + dz) * W + gx + dx);
    };
    if (elevator) guard(elevator.gx, elevator.gz);
    if (niche) guard(niche.gx + niche.dx, niche.gz + niche.dz);
    for (const k of diagFill) keep.add(k); // les murs derrière les couloirs en diagonale restent pleins
    // les culs-de-sac restent fermés de vrais murs : on s'y réfugie (les recoins calmes, avec leur fauteuil)
    const open = new Set(walkable.map((c) => c.z * W + c.x));
    for (const c of walkable) {
      const nb = DIRS.filter(([dx, dz]) => open.has((c.z + dz) * W + c.x + dx));
      if (nb.length === 1) for (const [dx, dz] of DIRS) keep.add((c.z + dz) * W + c.x + dx);
    }
    const solid = (x, z) => {
      const v = get(x, z);
      return v === T.WALL || v === T.EXIT;
    };
    // tout se décide sur la carte d'avant (une cloison ne change pas le sort de ses voisines)
    const list = [];
    for (let z = 1; z < H - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        const k = z * W + x;
        if (grid[k] !== T.WALL || keep.has(k)) continue;
        const w = solid(x - 1, z);
        const e = solid(x + 1, z);
        const n = solid(x, z - 1);
        const so = solid(x, z + 1);
        if (!(w || e || n || so)) continue;
        if ((w && n && solid(x - 1, z - 1)) || (e && n && solid(x + 1, z - 1)) || (w && so && solid(x - 1, z + 1)) || (e && so && solid(x + 1, z + 1))) continue;
        // ailleurs que dans les pans de 4d : seulement les pans droits et les bouts de mur, dans les régions tirées
        const straight = (w && e && !n && !so) || (n && so && !w && !e);
        const tip = w + e + n + so === 1;
        if (!partCells.has(k) && ((!straight && !tip) || region(x, z) > THIN_SHARE)) continue;
        list.push({ k, x, z, w, e, n, s: so });
      }
    }
    const th = THIN_HALF;
    const hc = CELL_SIZE / 2;
    for (const t of list) {
      const cx = (t.x + 0.5) * CELL_SIZE;
      const cz = (t.z + 0.5) * CELL_SIZE;
      // une cloison le long de x (et ses retours vers le nord et le sud), ou le long de z seulement
      const rects = [];
      if (t.w || t.e) {
        rects.push([t.w ? cx - hc : cx - th, cz - th, t.e ? cx + hc : cx + th, cz + th]);
        if (t.n) rects.push([cx - th, cz - hc, cx + th, cz - th]);
        if (t.s) rects.push([cx - th, cz + th, cx + th, cz + hc]);
      } else {
        rects.push([cx - th, t.n ? cz - hc : cz - th, cx + th, t.s ? cz + hc : cz + th]);
      }
      grid[t.k] = T.PILLAR;
      pillars[t.k] = { x: cx, z: cz, h: hc, rects, thin: true };
    }
    thinCount = list.length;
  }

  // 8d. Moins de culs-de-sac : une poche (jusqu'à POCKET cases) qu'on ne quitte que par où l'on est entré est, une
  // fois sur DEAD_OPEN, reliée au reste par un mur percé (une case d'épaisseur, sinon deux) : on tourne en rond au
  // lieu de buter contre un mur. Le couloir piégé, le trou à cassette, l'ascenseur, les couloirs en diagonale et les
  // cloisons fines n'y sont pour rien. Tiré à part : le reste du tirage de la carte ne bouge pas.
  {
    let ds = Math.imul((seed >>> 0) ^ 0x6a09e667, 2246822519) >>> 0 || 1;
    const drnd = () => {
      ds = (ds + 0x6d2b79f5) >>> 0;
      let t = ds;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const pass = (k) => dist[k] >= 0 && crossable(grid[k]);
    // cases qu'on ne perce pas : autour de l'ascenseur, du couloir piégé, du trou à cassette, des biais et des cloisons
    const hold = new Set(vaultCells || []);
    const ring = (gx, gz, r) => {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) hold.add((gz + dz) * W + gx + dx);
    };
    if (elevator) ring(elevator.gx, elevator.gz, 1);
    if (niche) ring(niche.gx + niche.dx, niche.gz + niche.dz, 1);
    for (const k of diagFill) hold.add(k);
    for (let k = 0; k < W * H; k++) {
      const v = grid[k];
      if (isChamfer(v) || (v === T.PILLAR && pillars[k] && pillars[k].thin)) ring(k % W, (k / W) | 0, 1);
    }
    // les points de passage obligés (Tarjan, sans récursion) depuis le départ : la descendance d'une case c qui ne
    // remonte pas plus haut que son parent est une poche fermée par ce parent
    const disc = new Int32Array(W * H).fill(-1);
    const low = new Int32Array(W * H);
    const size = new Int32Array(W * H);
    const order = [];
    const pockets = [];
    const stack = [[sz * W + sx, -1, 0]];
    disc[sz * W + sx] = low[sz * W + sx] = 0;
    order.push(sz * W + sx);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [k, par] = top;
      if (top[2] < 4) {
        const [dx, dz] = N4[top[2]++];
        const x = k % W;
        const z = (k - x) / W;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const nk = nz * W + nx;
        if (!pass(nk) || !chamferStep(grid[k], grid[nk], dx, dz)) continue;
        if (disc[nk] < 0) {
          disc[nk] = low[nk] = order.length;
          order.push(nk);
          stack.push([nk, k, 0]);
        } else if (nk !== par) low[k] = Math.min(low[k], disc[nk]);
        continue;
      }
      stack.pop();
      size[k] += 1;
      if (par >= 0) {
        size[par] += size[k];
        low[par] = Math.min(low[par], low[k]);
        if (low[k] >= disc[par] && size[k] <= POCKET) pockets.push(k);
      }
    }
    // seulement les plus grandes poches (une poche dans une poche compte une fois)
    pockets.sort((a, b) => disc[a] - disc[b]);
    const outer = [];
    for (const c of pockets) {
      const o = outer[outer.length - 1];
      if (o !== undefined && disc[c] < disc[o] + size[o]) continue;
      outer.push(c);
    }
    const exitK = exitCell.z * W + exitCell.x;
    const exitD0 = dist[exitK];
    const done = []; // les murs percés, poche par poche
    for (const c of outer) {
      if (drnd() >= DEAD_OPEN) continue;
      const lo = disc[c];
      const hi = lo + size[c];
      const inPocket = (k) => disc[k] >= lo && disc[k] < hi;
      const thin1 = [];
      const thin2 = [];
      for (let i = lo; i < hi; i++) {
        const k = order[i];
        const x = k % W;
        const z = (k - x) / W;
        if (grid[k] !== T.FLOOR) continue;
        for (const [dx, dz] of N4) {
          const a = (z + dz) * W + x + dx;
          if (!inside(x + dx, z + dz) || grid[a] !== T.WALL || hold.has(a)) continue;
          const b = (z + 2 * dz) * W + x + 2 * dx;
          if (pass(b) && grid[b] === T.FLOOR && !inPocket(b)) {
            thin1.push([a]);
            continue;
          }
          const e = (z + 3 * dz) * W + x + 3 * dx;
          if (inside(x + 2 * dx, z + 2 * dz) && grid[b] === T.WALL && !hold.has(b) && pass(e) && grid[e] === T.FLOOR && !inPocket(e)) thin2.push([a, b]);
        }
      }
      const pickFrom = thin1.length ? thin1 : thin2;
      if (!pickFrom.length) continue;
      const cut = pickFrom[Math.floor(drnd() * pickFrom.length)];
      for (const a of cut) grid[a] = T.FLOOR;
      done.push(cut);
    }
    if (done.length) {
      // un raccourci ne doit pas rapprocher l'ascenseur du départ (de plus de 10 %, ni à moins de 42 cases) : on
      // rebouche les derniers percés jusqu'à ce que ce soit le cas
      for (;;) {
        dist = bfs(grid, W, H, sx, sz);
        if (!done.length || dist[exitK] >= Math.min(exitD0, Math.max(42, Math.ceil(exitD0 * 0.9)))) break;
        for (const a of done.pop()) grid[a] = T.WALL;
      }
      walkable.length = 0;
      for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === T.FLOOR && pitGrid[z * W + x] < 0) walkable.push({ x, z });
    }
  }

  // 9. Éclairage : un néon par case paire. Un bruit à basse fréquence découpe des zones où les néons sont morts
  // ou grésillent. Le départ et ses alentours restent éclairés.
  const ZONE = 8;
  const zw = Math.ceil(W / ZONE) + 1;
  const zoneVal = Array.from({ length: zw * zw }, () => rnd());
  const zone = (x, z) => {
    // interpolation bilinéaire du bruit de zone
    const fx = x / ZONE;
    const fz = z / ZONE;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const v = (a, b) => zoneVal[Math.min(zw - 1, b) * zw + Math.min(zw - 1, a)];
    return (v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx) * (1 - tz) + (v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx) * tz;
  };
  const lights = [];
  // un néon par case pleine sur deux le long d'un couloir en diagonale (la grille des néons, une case sur deux en x et
  // en z, en laisserait certains tout noirs), couché dans son axe ; ailleurs, la grille
  const lightCells = [];
  for (let z = 1; z < H - 1; z += 2) for (let x = 1; x < W - 1; x += 2) if (!diagCell.has(z * W + x)) lightCells.push([x, z]);
  for (const dg of diags) dg.cells.forEach(([x, z], i) => i % 2 === 1 && lightCells.push([x, z, dg.rot]));
  lightCells.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  for (const [x, z, rot] of lightCells) {
    {
      if (grid[z * W + x] !== T.FLOOR) continue;
      const nearSpawn = Math.hypot(x - sx, z - sz) < 7;
      const v = zone(x, z);
      let state = 'on';
      // des zones claires (tous les néons marchent, ils éclairent plus fort et plus loin), des zones mortes, et entre
      // les deux des néons grillés çà et là : des îlots de lumière séparés par le noir
      const bright = nearSpawn || v > 0.66;
      if (!bright && (v < 0.46 || rnd() < 0.15)) state = 'off';
      else if (!bright && (v < 0.56 || rnd() < 0.1)) state = 'flicker';
      lights.push({
        x: (x + 0.5) * CELL_SIZE,
        y: WALL_HEIGHT - 0.02,
        z: (z + 0.5) * CELL_SIZE,
        gx: x,
        gz: z,
        state,
        flicker: state === 'flicker',
        bright,
        ...(rot !== undefined ? { rot } : null),
      });
    }
  }

  // 10. Meubles abandonnés le long des murs et bouteilles d'eau d'amande (elles rendent l'endurance)
  const props = [];
  const nearWall = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => get(c.x + dx, c.z + dz) === T.WALL);
  const busy = new Set([sz * W + sx, exitCell.z * W + exitCell.x, ...cassettes.map((c) => c.gz * W + c.gx)]);
  // (rien au bord d'un trou : un meuble y boucherait le bout d'une arête)
  const nearPit = (c) => pits.some((p) => Math.abs(p.gx - c.x) <= 1 && Math.abs(p.gz - c.z) <= 1);
  for (let i = 0; i < 160; i++) {
    const c = pick(walkable);
    const k = c.z * W + c.x;
    const wall = nearWall(c);
    if (busy.has(k) || !wall || nearPit(c) || Math.hypot(c.x - sx, c.z - sz) < 3) continue;
    busy.add(k);
    const kind = pick(PROP_KINDS);
    // collé au mur, dos au mur (les modèles ont le dos vers -z)
    const off = CELL_SIZE / 2 - kind.r - 0.12;
    const rot = Math.atan2(-wall[0], -wall[1]);
    props.push({
      m: kind.m,
      h: kind.h,
      r: kind.r,
      x: (c.x + 0.5) * CELL_SIZE + wall[0] * off + (rnd() - 0.5) * 0.3,
      z: (c.z + 0.5) * CELL_SIZE + wall[1] * off + (rnd() - 0.5) * 0.3,
      rot: rot + (kind.chair ? (rnd() - 0.5) * 2 : kind.turn ? (rnd() - 0.5) * 1.2 : (rnd() - 0.5) * 0.25),
      tipped: !!kind.chair && rnd() < 0.3,
    });
  }
  // 10a. Chantiers abandonnés : de la rubalise jaune et noire arrachée qui traîne par terre en travers du couloir
  // (elle ne bloque rien), des cônes au pied des murs et un projecteur éteint sur son trépied juste avant
  const tapes = [];
  const prop = (kind, x, z, rot) => props.push({ m: kind.m, h: kind.h, r: kind.r, proc: true, x, z, rot, tipped: false });
  for (let i = 0; i < 400 && tapes.length < 14; i++) {
    const c = pick(walkable);
    if (busy.has(c.z * W + c.x) || nearPit(c) || Math.hypot(c.x - sx, c.z - sz) < 4) continue;
    // couloir : des murs des deux côtés sur un axe, du sol des deux côtés sur l'autre
    const alongZ = get(c.x - 1, c.z) === T.WALL && get(c.x + 1, c.z) === T.WALL && get(c.x, c.z - 1) !== T.WALL && get(c.x, c.z + 1) !== T.WALL;
    const alongX = get(c.x, c.z - 1) === T.WALL && get(c.x, c.z + 1) === T.WALL && get(c.x - 1, c.z) !== T.WALL && get(c.x + 1, c.z) !== T.WALL;
    if (!alongZ && !alongX) continue;
    busy.add(c.z * W + c.x);
    const cx = (c.x + 0.5) * CELL_SIZE;
    const cz = (c.z + 0.5) * CELL_SIZE;
    const h = CELL_SIZE / 2;
    // un ou deux morceaux couchés au sol, d'un pied de mur vers l'autre, en biais ; wave : ses ondulations
    for (let k = rnd() < 0.4 ? 2 : 1; k > 0; k--) {
      const a = (rnd() - 0.5) * 1.6;
      const b = (rnd() - 0.5) * 1.6;
      const s1 = h - 0.15 - rnd() * 0.5;
      const s2 = h - 0.15 - rnd() * 0.9;
      const wave = { amp: 0.12 + rnd() * 0.25, freq: 1.5 + rnd() * 2.5, ph: rnd() * 6.28 };
      if (alongZ) tapes.push({ x1: cx - s1, z1: cz + a, x2: cx + s2, z2: cz + b, wave });
      else tapes.push({ x1: cx + a, z1: cz - s1, x2: cx + b, z2: cz + s2, wave });
    }
    // cônes au pied des murs (1 ou 2), dont un parfois renversé
    const side = alongZ ? [1, 0] : [0, 1];
    for (const s of rnd() < 0.5 ? [-1, 1] : [rnd() < 0.5 ? -1 : 1]) {
      const px = cx + side[0] * s * (h - 0.35);
      const pz = cz + side[1] * s * (h - 0.35);
      props.push({ m: CONE.m, h: CONE.h, r: CONE.r, proc: true, x: px, z: pz, rot: rnd() * 6.28, tipped: rnd() < 0.25 });
    }
    // le projecteur, dans la case d'avant ou d'après, tourné vers la rubalise
    const dir = rnd() < 0.5 ? -1 : 1;
    const nx = c.x + (alongZ ? 0 : dir);
    const nz = c.z + (alongZ ? dir : 0);
    if (rnd() < 0.8 && !busy.has(nz * W + nx) && get(nx, nz) === T.FLOOR && !nearPit({ x: nx, z: nz })) {
      busy.add(nz * W + nx);
      const s = rnd() < 0.5 ? -1 : 1;
      const px = (nx + 0.5) * CELL_SIZE + side[0] * s * (h - 0.45);
      const pz = (nz + 0.5) * CELL_SIZE + side[1] * s * (h - 0.45);
      prop(WORKLIGHT, px, pz, Math.atan2(cx - px, cz - pz));
    }
  }
  // et quelques projecteurs oubliés ailleurs, contre un mur
  for (let i = 0; i < 200 && props.filter((p) => p.m === WORKLIGHT.m).length < 18; i++) {
    const c = pick(walkable);
    const wall = nearWall(c);
    if (busy.has(c.z * W + c.x) || !wall || nearPit(c) || Math.hypot(c.x - sx, c.z - sz) < 3) continue;
    busy.add(c.z * W + c.x);
    const off = CELL_SIZE / 2 - 0.5;
    prop(WORKLIGHT, (c.x + 0.5) * CELL_SIZE + wall[0] * off, (c.z + 0.5) * CELL_SIZE + wall[1] * off, Math.atan2(-wall[0], -wall[1]) + (rnd() - 0.5) * 1.5);
  }
  // eau d'amande : 13 bouteilles en haut, 11 dans l'étage du bas, plus petit (la soif ne pardonne pas)
  const bottles = [];
  const nBottles = AREA === 1 ? 13 : 11;
  for (let i = 0; i < 160 && bottles.length < nBottles; i++) {
    const c = pick(walkable);
    const k = c.z * W + c.x;
    if (busy.has(k) || D(c) < 8) continue;
    busy.add(k);
    bottles.push({ id: bottles.length, ...cellPos(c), taken: false });
  }
  // piles pour la lampe torche, de préférence dans les zones sombres
  const batteries = [];
  const darkCell = (c) => !lights.some((l) => l.state === 'on' && Math.abs(l.gx - c.x) <= 2 && Math.abs(l.gz - c.z) <= 2);
  for (let i = 0; i < 400 && batteries.length < 8; i++) {
    const c = pick(walkable);
    const k = c.z * W + c.x;
    if (busy.has(k) || D(c) < 10 || (i < 300 && !darkCell(c))) continue;
    busy.add(k);
    batteries.push({ id: batteries.length, ...cellPos(c), taken: false });
  }

  // 10b. L'échelle : pas sous le renfoncement, mais dans les parages (10 à 22 cases de marche, 25 à 55 m), et jamais
  // derrière les trous du couloir piégé (dans la pièce de sa cassette, il faudrait traverser les trous pour aller la
  // chercher)
  const ladders = [];
  if (niche) {
    const dn = bfs(grid, W, H, niche.gx, niche.gz);
    const dry = reachAll(true);
    const ok = (lo, hi) => walkable.filter((c) => !busy.has(c.z * W + c.x) && dry[c.z * W + c.x] >= 0 && dn[c.z * W + c.x] >= lo && dn[c.z * W + c.x] <= hi);
    const cand = ok(10, 22).length ? ok(10, 22) : ok(6, 40);
    const c = cand.length ? pick(cand) : null;
    if (c) {
      busy.add(c.z * W + c.x);
      ladders.push({ id: 0, ...cellPos(c), taken: false });
    }
  }
  const items = itemList(['bottle', bottles], ['battery', batteries], ['ladder', ladders]);

  // (une case coupée vers l'extérieur que la suite de la génération a refermée de partout redevient un mur plein)
  for (const [k] of diagOuter) {
    if (!isChamfer(grid[k])) continue;
    const [fx, fz] = chamferSide(grid[k]);
    const x = k % W;
    const z = (k - x) / W;
    if (get(x + fx, z) === T.FLOOR || get(x, z + fz) === T.FLOOR) continue;
    grid[k] = T.WALL;
    chamfers.splice(chamfers.indexOf(pillars[k].face), 1);
    delete pillars[k];
  }

  // 11. Point de départ de l'entité : loin du joueur, mais pas forcément au bout de la carte
  const monsterCell = pick(walkable.filter((c) => D(c) > maxD * 0.55)) || far[0];

  return {
    level: 0,
    floor: lower ? 1 : 0,
    ceil: WALL_HEIGHT,
    stairs: [],
    W,
    H,
    grid,
    walkable,
    spawn,
    exit,
    elevator,
    cassettes,
    lights,
    props,
    tapes,
    bottles,
    batteries,
    items,
    pits,
    trap,
    niche,
    dist,
    // numéro du trou sous une case (-1 : pas de trou)
    pitAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return -1;
      return pitGrid[gz * W + gx];
    },
    monsterSpawn: cellPos(monsterCell),
    pillars,
    thinCount,
    // la lumière des néons s'arrête aux cloisons fines (la cuisson de la scène arrête déjà les murs pleins)
    lightBlocked: thinCount || chamfers.length
      ? (ax, az, bx, bz) =>
          cellsOnSeg(ax, az, bx, bz, (gx, gz) => {
            if (gx < 0 || gz < 0 || gx >= W || gz >= H) return false;
            const v = grid[gz * W + gx];
            if (v !== T.PILLAR && !isChamfer(v)) return false;
            const p = pillars[gz * W + gx];
            return !!(p && (p.rects || p.poly) && segHitsPillar(p, ax, az, bx, bz));
          })
      : null,
    chamfers,
    diags,
    isWall(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return true;
      return blocks(grid[gz * W + gx]);
    },
    // le pilier de la case (gx, gz), s'il y en a un (et que la case n'a pas été reprise depuis)
    pillarAt(gx, gz) {
      if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
      const k = gz * W + gx;
      return grid[k] === T.PILLAR || isChamfer(grid[k]) ? pillars[k] || null : null;
    },
    // une case coupée en biais : un mur pour les cases voisines, mais on la traverse le long du couloir (findPath)
    crossable(gx, gz) {
      return gx >= 0 && gz >= 0 && gx < W && gz < H && isChamfer(grid[gz * W + gx]);
    },
    // (findPath) d'une case à sa voisine sans traverser un mur en biais
    canStep(x, z, nx, nz) {
      return chamferStep(get(x, z), get(nx, nz), nx - x, nz - z);
    },
    isWalkableWorld(wx, wz) {
      const gx = Math.floor(wx / CELL_SIZE);
      const gz = Math.floor(wz / CELL_SIZE);
      const p = this.pillarAt(gx, gz);
      if (p) return outsidePillar(p, wx, wz);
      return !this.isWall(gx, gz);
    },
  };
}

// distances en cases depuis (sx, sz), -1 si inaccessible
export function bfs(grid, W, H, sx, sz) {
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  dist[sz * W + sx] = 0;
  queue[tail++] = sz * W + sx;
  while (head < tail) {
    const k = queue[head++];
    const x = k % W;
    const z = (k - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
      const nk = nz * W + nx;
      if (dist[nk] >= 0 || !crossable(grid[nk]) || !chamferStep(grid[k], grid[nk], dx, dz)) continue;
      dist[nk] = dist[k] + 1;
      queue[tail++] = nk;
    }
  }
  return dist;
}

// Le Level 0 sur deux étages : on tombe par les trous du haut, on remonte par les escaliers (2, loin des trous).
// Les cassettes sont réparties entre les étages (celle du couloir piégé et celle du renfoncement en haut).
// Chaque étage a son ascenseur ; le moteur décide lequel est le vrai.
// Le carré de l'étage du bas (LOWER_SIZE cases, mur d'enceinte compris) : le plus au centre possible, mais avec les
// cases sous les trous du dessus à au moins 3 cases de ses bords. Trop étalés (jamais vu), l'étage garde toute la grille
export function lowerBox(forced, W = MAP_SIZE, size = LOWER_SIZE) {
  let x0 = (W - size) >> 1;
  let z0 = x0;
  if (forced.length) {
    const xs = forced.map(([x]) => x);
    const zs = forced.map(([, z]) => z);
    // une case c est dans l'étage si x0 < c < x0 + size - 1 ; on vise 3 cases de marge de chaque côté
    const fit = (lo, hi, c) => Math.max(0, Math.min(W - size, Math.max(hi + 3 - size + 2, Math.min(lo - 4, c))));
    x0 = fit(Math.min(...xs), Math.max(...xs), x0);
    z0 = fit(Math.min(...zs), Math.max(...zs), z0);
    if (!forced.every(([x, z]) => x > x0 && x < x0 + size - 1 && z > z0 && z < z0 + size - 1)) return null;
  }
  return { x0, z0, size };
}

export function createLevel0(seed = 42) {
  const up = createBackroomsMap(seed);
  const W = up.W;
  const forced = up.pits.map((p) => [p.gx, p.gz]);
  const down = createBackroomsMap(seed + 7919, { lower: true, forced, box: lowerBox(forced, W) });

  // les escaliers coudés : deux volées côte à côte reliées par un palier (6 cases libres aux deux étages, loin des
  // trous). On entre en bas par la case d'avant la première volée (étage du bas), on monte, on fait demi-tour sur le
  // palier, on remonte par la seconde volée et on arrive en haut sur la case d'à côté (étage du haut).
  let s = (seed * 31 + 7) >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const free = (m, x, z) => x > 0 && z > 0 && x < W - 1 && z < W - 1 && m.grid[z * W + x] === T.FLOOR && m.dist[z * W + x] >= 0 && m.pitAt(x, z) < 0;
  const busyCell = (m, x, z) =>
    m.cassettes.some((c) => c.gx === x && c.gz === z) || m.items.some((i) => i.gx === x && i.gz === z) || (m.exit.gx === x && m.exit.gz === z) || (m.spawn.gx === x && m.spawn.gz === z);
  const farFromPits = (x, z, d) => up.pits.every((p) => Math.abs(p.gx - x) + Math.abs(p.gz - z) >= d);
  // ni collée à un puits sans fond de l'étage du bas (on sortirait de la cage droit dedans)
  const farFromDeep = (x, z) => down.pits.every((p) => Math.max(Math.abs(p.gx - x), Math.abs(p.gz - z)) >= 3);
  const ok = (x, z) => free(up, x, z) && free(down, x, z) && !busyCell(up, x, z) && !busyCell(down, x, z) && farFromDeep(x, z);
  // la cage d'escalier ne doit couper aucun des deux étages en morceaux (en bas, sans compter de passer par les puits)
  const stillLinked = (m, cells, enter) => {
    const blocked = new Set(cells.map(([x, z]) => z * W + x));
    for (const p of m.pits) if (p.deep) blocked.add(p.gz * W + p.gx);
    const g = m.grid.map((v, i) => (blocked.has(i) ? T.WALL : v));
    const d = bfs(g, W, m.H, enter[0], enter[1]);
    for (let i = 0; i < W * m.H; i++) if (m.dist[i] >= 0 && !blocked.has(i) && d[i] < 0) return false;
    return true;
  };
  const stairs = [];
  const C = CELL_SIZE;
  for (const minPit of [10, 6, 4]) {
    const cand = shuffle(up.walkable.filter((c) => farFromPits(c.x, c.z, minPit) && Math.hypot(c.x - up.spawn.gx, c.z - up.spawn.gz) > 6), rnd);
    for (const c of cand) {
      if (stairs.length >= 2) break;
      if (stairs.some((st) => Math.abs(st.gx - c.x) + Math.abs(st.gz - c.z) < 24)) continue;
      // c : la case d'en bas (étage du bas) ; on monte vers (dx, dz) ; la seconde volée est du côté (px, pz)
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rnd);
      let found = null;
      for (const [dx, dz] of dirs) {
        for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
          const px = -dz * side;
          const pz = dx * side;
          const cells = [];
          for (let k = 1; k <= 3; k++) for (const l of [0, 1]) cells.push([c.x + dx * k + px * l, c.z + dz * k + pz * l]);
          if (!cells.every(([x, z]) => ok(x, z) && farFromPits(x, z, minPit))) continue;
          if (!free(down, c.x, c.z) || !free(up, c.x + px, c.z + pz) || !farFromDeep(c.x, c.z)) continue;
          if (!stillLinked(down, cells, [c.x, c.z]) || !stillLinked(up, cells, [c.x + px, c.z + pz])) continue;
          found = { dx, dz, px, pz, cells };
          break;
        }
        if (found) break;
      }
      if (!found) continue;
      const { dx, dz, px, pz, cells } = found;
      const at = (x, z) => ({ x: (x + 0.5) * C, z: (z + 0.5) * C });
      // repère de la cage : o, le coin d'en bas de la première volée ; u le long des volées (0 à 3 cases), v en travers
      // (0 à 1 case : première volée, 1 à 2 cases : seconde volée) ; le palier occupe u de 2 à 3 cases
      const ox = (c.x + 0.5 + dx * 0.5 - px * 0.5) * C;
      const oz = (c.z + 0.5 + dz * 0.5 - pz * 0.5) * C;
      stairs.push({
        id: stairs.length,
        gx: c.x + dx,
        gz: c.z + dz,
        cells: cells.map(([x, z]) => ({ gx: x, gz: z })),
        ox,
        oz,
        dx,
        dz,
        px,
        pz,
        // x, z : le milieu du palier
        x: ox + dx * 2.5 * C + px * C,
        z: oz + dz * 2.5 * C + pz * C,
        // le milieu de toute la cage
        cx: ox + dx * 1.5 * C + px * C,
        cz: oz + dz * 1.5 * C + pz * C,
        up: at(c.x + px, c.z + pz),
        down: at(c.x, c.z),
      });
    }
    if (stairs.length >= 2) break;
  }
  up.stairs = stairs;
  down.stairs = stairs;
  // pas de néon dans la cage d'escalier de l'étage du bas (son plafond est ouvert sur l'étage du haut)
  // ni sous les trous de l'étage du haut (le néon flotterait au milieu du puits)
  const inWell = (l) => stairs.some((st) => st.cells.some((k) => k.gx === l.gx && k.gz === l.gz)) || up.pits.some((p) => p.gx === l.gx && p.gz === l.gz);
  down.lights = down.lights.filter((l) => !inWell(l));
  // la cage est fermée jusqu'au plafond du haut : pas de néon au-dessus d'elle non plus (ses appliques l'éclairent)
  up.lights = up.lights.filter((l) => !stairs.some((st) => st.cells.some((k) => k.gx === l.gx && k.gz === l.gz)));
  // pas d'objet ni de meuble sur les marches ni autour de la cage
  const nearWell = (x, z, d) => stairs.some((st) => st.cells.some((k) => Math.hypot(x - (k.gx + 0.5) * C, z - (k.gz + 0.5) * C) < d));
  // (ni sur la case d'où l'on entre dans la cage, en bas, et où l'on en sort, en haut : on s'y cognait)
  const atDoor = (x, z, d) => stairs.some((st) => Math.hypot(x - st.down.x, z - st.down.z) < d || Math.hypot(x - st.up.x, z - st.up.z) < d);
  for (const m of [up, down]) {
    m.props = m.props.filter((p) => !nearWell(p.x, p.z, 2.2 + (p.r || 0)) && !atDoor(p.x, p.z, 1.6 + (p.r || 0)));
    m.tapes = m.tapes.filter((t) => !nearWell((t.x1 + t.x2) / 2, (t.z1 + t.z2) / 2, 2.6));
  }
  // qui tombe par un trou atterrit en bas au milieu de sa case : aucun meuble qui arrête le pas à moins de son rayon,
  // du rayon d'un joueur et de 30 cm de ce point (sinon on atterrissait dedans, coincé pour de bon)
  down.props = down.props.filter((p) => p.walk || up.pits.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= p.r + PLAYER_R + 0.3));

  // les cassettes : 4 en haut (dont celle du couloir piégé et celle du renfoncement), 2 en bas
  const special = up.cassettes.filter((c) => c.vault || c.high);
  const others = up.cassettes.filter((c) => !c.vault && !c.high);
  // en haut, les autres le plus loin des deux spéciales ; en bas, le plus loin des escaliers et l'une de l'autre
  const cellOf = (c) => ({ x: c.gx, z: c.gz, c });
  const upDist = gridDist(up.grid, W, up.H);
  const fixedUp = [...special, up.spawn, up.exit].map(cellOf);
  const keepUp = [...special, ...spreadOut(others.map(cellOf), fixedUp, Math.max(0, CASSETTES - LOWER_CASSETTES - special.length), upDist, rnd).map((o) => o.c)];
  const freeIds = up.cassettes.filter((c) => !keepUp.includes(c)).map((c) => c.id);
  up.cassettes = keepUp;
  const downDist = gridDist(down.grid, W, down.H);
  const fixedDown = [...stairs.map((st) => ({ x: st.gx, z: st.gz })), cellOf(down.spawn)];
  // jamais sous un trou du haut (ni tout près) : vue d'en haut au fond du puits, elle brillait sans qu'on puisse la
  // prendre, et le signal (celui de l'étage où l'on est) ne la comptait pas
  const downCands = down.cassettes.map(cellOf);
  const clear = downCands.filter((o) => !up.pits.some((p) => Math.hypot(p.x - o.c.x, p.z - o.c.z) < 6));
  down.cassettes = spreadOut(clear.length >= freeIds.length ? clear : downCands, fixedDown, freeIds.length, downDist, rnd).map((o) => o.c);
  down.cassettes.forEach((c, i) => {
    c.id = freeIds[i];
  });
  return { level: 0, floors: [up, down], stairs };
}
