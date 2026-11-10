// Fief Maudit : la vallée. Moteur PUR (aucun DOM) : relief, rivière, chemins, village (bâtiments debout et fondations
// en ruine), château en ruine sur sa colline, arbres à abattre, rochers et objets du décor, et les collisions.
// Unités : mètres, y vers le haut. Le village est centré en (0, 0), la rivière passe au sud (z > 0), le château au nord.
import { makeRng } from './rng.js';
import { createCrypt } from './crypt.js';

export const WATER = -0.55;        // niveau de la rivière
export const R_PLAY = 112;         // rayon jouable (au-delà : la forêt dense)
export const TREE_R = 0.55;        // rayon du tronc pour les collisions
export const TREE_HP = 4;          // coups de hache pour abattre un arbre

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// bruit de valeur lissé (graine entière)
function hash2(ix, iz, s) { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
function fbm(x, z, s, oct = 4) { let t = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += vnoise(x * f, z * f, s + i * 17) * a; n += a; a *= 0.5; f *= 2.03; } return t / n; }

// ------------------------------------------------------------------ le village
// x, z : centre ; w (selon x) et d (selon z) : multiples de 2 m (un pan de mur du kit fait 2 m) ;
// door : côté de la porte ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x) ; state : 'debout' ou 'ruine' (fondations à relever)
export const BUILDINGS = [
  { id: 'entrepot', name: 'Entrepôt', x: 11, z: -3, w: 6, d: 8, style: 'brick', state: 'debout', door: 'w' },
  { id: 'maison1', name: 'Maison', x: -11, z: -7, w: 4, d: 6, style: 'plaster', state: 'ruine', door: 'e' },
  { id: 'maison2', name: 'Maison', x: -13, z: 8, w: 4, d: 4, style: 'plaster', state: 'ruine', door: 'e' },
  { id: 'forge', name: 'Forge', x: -1, z: -15, w: 6, d: 6, style: 'brick', state: 'ruine', door: 's' },
  { id: 'moulin', name: 'Moulin', x: 13, z: 13, w: 4, d: 6, style: 'plaster', state: 'ruine', door: 'w' },
  { id: 'chapelle', name: 'Chapelle', x: -1, z: 17, w: 6, d: 8, style: 'brick', state: 'ruine', door: 'n' },
];
export const CAMPFIRE = { x: 0, z: 1, r: 0.9 };
// braseros autour de la place : la nuit, leur lumière (et celle du feu de camp) tient la brume à distance
export const BRAZIERS = [[5.5, -9.5], [-1, -9], [-7.5, -1.5], [-6.5, 12], [6.5, 10], [17.5, -3]].map(([x, z], id) => ({ id, x, z }));
export const LIGHT_R = 8.5, FIRE_LIGHT_R = 9.5;
// le château en ruine, sur la colline au nord
export const CASTLE = { x: -6, z: -80 };
export const CASTLE_PARTS = [
  { id: 'donjon', x: -6, z: -80, w: 8, d: 8, style: 'brick', state: 'ruine', tall: 2, door: 's' },
  { id: 'tour-o', x: -20, z: -72, w: 4, d: 4, style: 'brick', state: 'ruine', tall: 3, door: 'e' },
  { id: 'tour-e', x: 8, z: -72, w: 4, d: 4, style: 'brick', state: 'ruine', tall: 2, door: 'w' },
];
// chemins de terre (segments), pour le décor et pour garder la place libre d'arbres
export const PATHS = [
  [[0, 1], [-2, -30], [-5, -62], [-6, -72]],
  [[0, 1], [4, 24], [9, 44]],
  [[0, 1], [24, 2], [60, -4], [96, -10]],
  [[0, 1], [-26, 3], [-64, 10]],
];

export const riverZ = (x) => 54 + 7 * Math.sin(x / 23) + 3 * Math.sin(x / 9 + 1.3);

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function pathDist(x, z) {
  let d = Infinity;
  for (const p of PATHS) for (let i = 1; i < p.length; i++) d = Math.min(d, segDist(x, z, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]));
  return d;
}
// rectangle d'un bâtiment (avec une marge)
export const rectOf = (b, m = 0) => ({ x0: b.x - b.w / 2 - m, x1: b.x + b.w / 2 + m, z0: b.z - b.d / 2 - m, z1: b.z + b.d / 2 + m });
// point devant la porte, à `out` mètres du mur
export function doorPoint(b, out = 1.6) {
  if (b.door === 'n') return { x: b.x, z: b.z - b.d / 2 - out, yaw: Math.PI };
  if (b.door === 's') return { x: b.x, z: b.z + b.d / 2 + out, yaw: 0 };
  if (b.door === 'e') return { x: b.x + b.w / 2 + out, z: b.z, yaw: Math.PI / 2 };
  return { x: b.x - b.w / 2 - out, z: b.z, yaw: -Math.PI / 2 };
}

// ------------------------------------------------------------------ construction de la vallée
export function createValley(seed = 1) {
  const rng = makeRng(seed * 7919 + 13);
  const S = seed | 0;

  // relief : plat au village, collines autour, crête qui ferme la vallée, colline du château, lit de la rivière
  function rawHeight(x, z) {
    const r = Math.hypot(x, z * 1.08);
    const flat = smooth(16, 40, r);
    let h = fbm(x / 48, z / 48, S) * 5.5 + fbm(x / 13, z / 13, S + 5, 3) * 0.9;
    h = 0.6 + h * flat + fbm(x / 20, z / 20, S + 9, 2) * 0.25 * (1 - flat);
    h += smooth(70, 150, r) * 22 * (0.75 + 0.25 * fbm(x / 60, z / 60, S + 3, 2));
    const cd = Math.hypot(x - CASTLE.x, z - CASTLE.z);
    h += 10 * Math.exp(-(cd * cd) / (2 * 22 * 22));
    // le sommet de la colline est arasé pour porter le château
    if (cd < 16) h = lerp(h, 10.2 + fbm(x / 9, z / 9, S + 2, 2) * 0.2, smooth(16, 9, cd));
    // pas de mare hors de la rivière : le fond des creux reste au sec
    return Math.max(h, 0.25 + 0.15 * h);
  }
  const crypt = createCrypt();
  function heightAt(x, z) {
    if (crypt.inside(x, z)) return crypt.y;
    let h = rawHeight(x, z);
    const d = Math.abs(z - riverZ(x));
    if (d < 11) h = lerp(h, -1.9, smooth(11, 3.5, d));
    return h;
  }
  const isWater = (x, z) => !crypt.inside(x, z) && heightAt(x, z) < WATER - 0.25;

  // ------------------------------------------------ colliders fixes : rectangles (bâtiments) et cercles (rochers, feu…)
  const boxes = [], circles = [];
  for (const b of [...BUILDINGS, ...CASTLE_PARTS]) boxes.push({ ...rectOf(b, 0.25), id: b.id });
  // les murs de la crypte et sa herse (qui s'ouvre)
  for (const w of crypt.walls) boxes.push(w);
  boxes.push(crypt.gate);
  circles.push({ x: CAMPFIRE.x, z: CAMPFIRE.z, r: CAMPFIRE.r });
  for (const b of BRAZIERS) circles.push({ x: b.x, z: b.z, r: 0.45 });

  // ------------------------------------------------ objets du décor
  const props = [];
  const blockedForDecor = (x, z, m = 3) => {
    if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 7) return true;
    if (BRAZIERS.some((b) => Math.hypot(x - b.x, z - b.z) < 2.5)) return true;
    for (const b of [...BUILDINGS, ...CASTLE_PARTS]) { const R = rectOf(b, m); if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) return true; }
    for (const b of BUILDINGS) { const p = doorPoint(b, 2.5); if (Math.hypot(x - p.x, z - p.z) < 3) return true; }
    if (pathDist(x, z) < 2.6) return true;
    if (Math.abs(z - riverZ(x)) < 9) return true;
    return false;
  };
  const addProp = (kind, x, z, rot, s, r) => { props.push({ kind, x, z, y: heightAt(x, z), rot, s }); if (r) circles.push({ x, z, r: r * s }); };
  // autour du village : charrette, caisses, tas de bûches, clôtures
  addProp('wagon', 5.5, 7.5, 0.4, 1, 1.1);
  addProp('crate', 14.8, -8.2, 0.2, 1, 0.6); addProp('crate', 15.6, -7.0, 0.9, 0.8, 0.5);
  addProp('logstack', 14.9, 2.4, Math.PI / 2, 1, 0.9);
  addProp('crate', 7.2, -8.6, 0.5, 0.9, 0.55);
  for (let i = 0; i < 4; i++) props.push({ kind: 'fence', x: -17 + i * 2.05, z: 13.2, y: heightAt(-17 + i * 2.05, 13.2), rot: 0, s: 1 });
  for (let i = 0; i < 3; i++) props.push({ kind: 'fence', x: 16.2, z: 8.2 + i * 2.05, y: heightAt(16.2, 8.2 + i * 2.05), rot: Math.PI / 2, s: 1 });
  // rochers et souches dans la nature
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(26, 105), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (blockedForDecor(x, z, 4)) continue;
    const big = rng.chance(0.3);
    addProp(big ? rng.pick(['rockA', 'rockC', 'rockE']) : rng.pick(['rockS', 'rockS2', 'stump']), x, z, rng.range(0, 6.28), big ? rng.range(0.9, 1.6) : rng.range(0.8, 1.3), big ? 1.3 : 0.45);
  }
  // gravats autour des ruines (sans collision)
  const rubble = [];
  for (const b of [...BUILDINGS, ...CASTLE_PARTS]) {
    if (b.state !== 'ruine') continue;
    const n = Math.round((b.w + b.d) * 1.3);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3), t = rng.range(-0.5, 0.5), off = rng.range(0.4, 1.8);
      const x = side < 2 ? b.x + t * b.w : b.x + (side === 2 ? 1 : -1) * (b.w / 2 + off);
      const z = side < 2 ? b.z + (side === 0 ? 1 : -1) * (b.d / 2 + off) : b.z + t * b.d;
      rubble.push({ x, z, y: heightAt(x, z), rot: rng.range(0, 6.28), v: rng.int(1, 4), tilt: rng.range(-0.5, 0.5) });
    }
  }

  // ------------------------------------------------ arbres (à abattre jusqu'à R_PLAY ; la forêt lointaine est dans la vue)
  const trees = [];
  const dens = (x, z) => 0.55 + 0.45 * fbm(x / 30, z / 30, S + 21, 2) + 0.15 * Math.sin(x * 0.05 + 1.1);
  let tries = 0;
  while (trees.length < 300 && tries++ < 9000) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.range(18 * 18, R_PLAY * R_PLAY)), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (rng.next() > dens(x, z) * smooth(16, 32, d)) continue;
    if (blockedForDecor(x, z, 4.5)) continue;
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 22) continue;
    if (heightAt(x, z) < WATER + 0.6) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
    const kind = rng.chance(0.55) ? 'pine' : rng.chance(0.55) ? 'round' : 'oak';
    trees.push({ id: trees.length, x, z, y: heightAt(x, z), kind, s: rng.range(0.85, 1.25), rot: rng.range(0, 6.283), v: rng.int(0, 7) });
  }
  // quelques arbres tout près du village, pour la première bûche
  for (const [x, z] of [[21, -12], [23.5, -9], [-21, -2], [-19, -16], [19, 20], [-22, 15]]) {
    if (!trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3) && heightAt(x, z) > WATER + 0.6) trees.push({ id: trees.length, x, z, y: heightAt(x, z), kind: 'round', s: 1, rot: x * z, v: 3 });
  }

  // ------------------------------------------------ buissons de baies (les vivres), en lisière des clairières
  const bushes = [];
  tries = 0;
  while (bushes.length < 26 && tries++ < 4000) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(20, 85), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (blockedForDecor(x, z, 3.5) || heightAt(x, z) < WATER + 0.6) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6) || props.some((p) => Math.hypot(p.x - x, p.z - z) < 2.4) || bushes.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
    bushes.push({ id: bushes.length, x, z, y: heightAt(x, z), rot: rng.range(0, 6.28), s: rng.range(0.9, 1.2) });
    circles.push({ x, z, r: 0.55 });
  }
  // deux buissons tout près du feu, pour qu'on les remarque
  for (const [x, z] of [[-9, 18], [12, -16]]) if (!bushes.some((o) => Math.hypot(o.x - x, o.z - z) < 4) && !trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) { bushes.push({ id: bushes.length, x, z, y: heightAt(x, z), rot: x, s: 1 }); circles.push({ x, z, r: 0.55 }); }

  // ------------------------------------------------ grille de recherche (cases de 8 m) pour les cercles et les arbres
  const CELL = 8, grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  const put = (o, kind) => { const k = key(Math.floor(o.x / CELL), Math.floor(o.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ o, kind }); };
  for (const c of circles) put(c, 'c');
  for (const t of trees) put(t, 't');
  function near(x, z, fn) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(key(cx + i, cz + j)); if (l) for (const e of l) fn(e.o, e.kind); }
  }

  // repousse un cercle (x, z, r) hors des obstacles ; `fallen(id)` dit si un arbre est abattu
  function collide(x, z, r, fallen) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of boxes) {
        if (b.open) continue;
        if (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
        const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d > 1e-6) { if (d < r) { x = cx + dx / d * r; z = cz + dz / d * r; } }
        else { // centre dedans : sortir par le côté le plus proche
          const opts = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          x += opts[0][0]; z += opts[0][1];
        }
      }
      near(x, z, (o, kind) => {
        if (kind === 't' && fallen && fallen(o.id)) return;
        const R = (kind === 't' ? TREE_R * o.s : o.r) + r, dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
        if (d < R && d > 1e-6) { x = o.x + dx / d * R; z = o.z + dz / d * R; }
      });
    }
    const rr = Math.hypot(x, z);
    if (rr > R_PLAY && !crypt.inside(x, z)) { x *= R_PLAY / rr; z *= R_PLAY / rr; }
    return [x, z];
  }
  // arbre debout le plus proche dans un rayon (et, si yaw est donné, devant soi)
  function treeNear(x, z, range, fallen, yaw = null, cone = 1.25) {
    let best = null, bd = range;
    near(x, z, (o, kind) => {
      if (kind !== 't' || (fallen && fallen(o.id))) return;
      const d = Math.hypot(o.x - x, o.z - z) - TREE_R * o.s;
      if (d > bd) return;
      if (yaw !== null) { let a = Math.atan2(o.x - x, o.z - z) - yaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; if (Math.abs(a) > cone) return; }
      best = o; bd = d;
    });
    return best;
  }

  const warehouse = BUILDINGS.find((b) => b.id === 'entrepot');
  const depot = doorPoint(warehouse, 1.2);
  const spawn = { x: 3, z: 4.5, yaw: Math.PI * 0.75 };
  // l'entrée de la crypte : devant la porte du donjon
  const cryptDoor = doorPoint(CASTLE_PARTS[0], 1.6);

  return {
    seed, heightAt, isWater, collide, treeNear, near,
    buildings: BUILDINGS, castle: CASTLE_PARTS, campfire: CAMPFIRE, braziers: BRAZIERS, bushes, trees, props, rubble, boxes, circles, paths: PATHS,
    warehouse, depot, spawn, riverZ, pathDist, crypt, cryptDoor,
  };
}
