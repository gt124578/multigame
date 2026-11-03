// L'archipel de Dogfight 3D : un vrai relief (modèle Copernicus GLO-30, voir maps.js), l'île d'Island Rush posée en mer,
// une piste gagnée sur la mer, des navires et un banc de nuages bas. Une grille proche (un point tous les 25 m) pour voler,
// une grille lointaine (tous les 100 m) pour l'horizon ; le fond de la mer descend avec la distance à la côte.
// Moteur pur : la même grille sert au jeu, aux tests et au rendu. loadMap() charge une carte et en fait la carte courante.
import { CENTER, ZONE } from './flight.js';
import { MAPS, MAP_IDS, DEFAULT_MAP, NEAR, FAR } from './maps.js';

export const SEA_FLOOR = -60;
export const RUNWAY_Y = 10, RUNWAY_W = 60;

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 144665) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function vnoise(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5, s = 0) { let t = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { t += a * vnoise(x * f, z * f, s + o * 17); n += a; a *= 0.5; f *= 2.03; } return t / n; }

// Courbe douce qui passe par tous les points (Catmull-Rom centripète), échantillonnée tous les `step` mètres.
// `seg` dit entre quels points on se trouve (2.5 : à mi-chemin du troisième au quatrième)
export function smoothPath(pts, step = 20) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], len = Math.hypot(p2.x - p1.x, p2.z - p1.z), n = Math.max(1, Math.ceil(len / step));
    const k = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
    const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
    for (let s = 0; s < n; s++) {
      const t = t1 + (t2 - t1) * s / n, q = { seg: i - 1 + s / n };
      for (const c of ['x', 'z', 'y']) {
        if (p1[c] === undefined) continue;
        const v0 = p0[c] ?? p1[c], v3 = p3[c] ?? p2[c];
        const A1 = (t1 - t) / (t1 - t0) * v0 + (t - t0) / (t1 - t0) * p1[c], A2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c], A3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * v3;
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2, B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        q[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      out.push(q);
    }
  }
  out.push({ ...pts[pts.length - 1], seg: pts.length - 1 });
  return out;
}

// Le relief brut d'une carte : grille proche en décimètres, puis grille lointaine en mètres (entiers 16 bits)
async function readRelief(id) {
  const url = new URL(`../relief/${id}.bin`, import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises'), b = await readFile(url);
    return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`relief ${id} introuvable (${r.status})`);
  return new Int16Array(await r.arrayBuffer());
}

// La piste : un repère le long de l'axe d'atterrissage (u), le côté des hangars (v)
function runwayOf(D, cx, cz) {
  const R = D.runway, x0 = cx + R.from[0], z0 = cz + R.from[1], x1 = cx + R.to[0], z1 = cz + R.to[1], len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, s = R.side || 1;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, ux, uz, vx: -uz * s, vz: ux * s, len, w: RUNWAY_W, y: RUNWAY_Y, rot: Math.atan2(uz, ux) };
}
// (a le long de la piste depuis son milieu, b vers les hangars) → monde
export const runwayPoint = (R, a, b = 0) => ({ x: R.x + R.ux * a + R.vx * b, z: R.z + R.uz * a + R.vz * b });
export const runwayLocal = (R, x, z) => ({ a: (x - R.x) * R.ux + (z - R.z) * R.uz, b: (x - R.x) * R.vx + (z - R.z) * R.vz });
// la plateforme : la piste, ses bouts, et le tarmac devant les hangars ; un talus la raccorde au fond
export const PLATFORM = { end: 150, side: 110, apron: 280 };
function platformDist(R, x, z) {
  const { a, b } = runwayLocal(R, x, z);
  const da = Math.max(0, Math.abs(a) - (R.len / 2 + PLATFORM.end)), db = Math.max(0, b - PLATFORM.apron, -PLATFORM.side - b);
  return Math.hypot(da, db);
}

function build(id, raw) {
  const D = MAPS[id], cx = D.cx, cz = D.cz, n = NEAR.n, fn = FAR.n;
  const h = new Float32Array(n * n), fh = new Float32Array(fn * fn);
  for (let k = 0; k < n * n; k++) h[k] = raw[k] / 10;
  for (let k = 0; k < fn * fn; k++) fh[k] = raw[n * n + k];
  const A = {
    id, def: D, name: D.name, x0: cx - NEAR.size / 2, z0: cz - NEAR.size / 2, size: NEAR.size, step: NEAR.step, n, h,
    far: { x0: cx - FAR.size / 2, z0: cz - FAR.size / 2, size: FAR.size, step: FAR.step, n: fn, h: fh },
    zone: { x: cx, z: cz }, island: { x: CENTER, z: CENTER },
  };
  // les lacs : au-dessus de la mer et parfaitement plats (le modèle aplanit les étendues d'eau)
  const lake = new Uint8Array(n * n);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, v = raw[k];
    if (v < 5) continue;
    if (raw[k - 1] === v && raw[k + 1] === v && raw[k - n] === v && raw[k + n] === v && raw[k - n - 1] === v && raw[k - n + 1] === v && raw[k + n - 1] === v && raw[k + n + 1] === v) lake[k] = 2;
  }
  for (let k = n; k < n * n - n; k++) if (lake[k] === 2) for (const o of [-1, 1, -n, n]) if (!lake[k + o]) lake[k + o] = 1;
  A.lake = lake;
  // la piste, gagnée sur la mer
  const R = A.runway = runwayOf(D, cx, cz);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = A.x0 + i * NEAR.step, z = A.z0 + j * NEAR.step, d = platformDist(R, x, z), k = j * n + i;
    if (d === 0) { h[k] = R.y; lake[k] = 0; } else if (d < 200) h[k] = Math.max(h[k], R.y - d * 0.45);
  }
  // navires, puis hangars (portes vers la piste) et tour de contrôle le long de la piste, du côté du tarmac
  const ship = { porteavions: [330, 76, 28], destroyer: [155, 20, 26], chalutier: [32, 8, 12] };
  A.structures = D.navy.map(([kind, x, z, rot]) => ({ kind, x: cx + x, z: cz + z, len: ship[kind][0], wid: ship[kind][1], h: ship[kind][2], rot }));
  for (const a of [250, 550, 850]) A.structures.push({ kind: 'hangar', ...runwayPoint(R, R.len / 2 - a, 195), len: 70, wid: 52, h: 22, rot: Math.atan2(-R.vz, -R.vx) });
  A.structures.push({ kind: 'tour', ...runwayPoint(R, R.len / 2 - 1150, 180), len: 12, wid: 12, h: 34, rot: R.rot });
  for (const s of A.structures) s.y = Math.max(0, heightAt(A, s.x, s.z));
  // le banc de nuages bas, que traverse le transport
  const B = D.bank;
  A.bank = { y: B.y, base: B.base, path: smoothPath(B.pts.map(([x, z]) => ({ x: cx + x, z: cz + z })), 20) };
  return A;
}

const cache = new Map();
let current = null;
// Charge une carte (une seule fois) et en fait la carte courante : la zone de jeu se centre sur elle
export async function loadMap(id) {
  const key = MAPS[id] ? id : DEFAULT_MAP;
  if (!cache.has(key)) cache.set(key, build(key, await readRelief(key)));
  return useMap(key);
}
export function useMap(id) {
  current = cache.get(id);
  if (!current) throw new Error(`carte ${id} pas encore chargée`);
  ZONE.x = current.zone.x; ZONE.z = current.zone.z;
  return current;
}
export function buildArchipel() {
  if (!current) throw new Error('aucune carte chargée : appeler loadMap() d\'abord');
  return current;
}
export { MAP_IDS };

const bilinear = (h, n, u, v) => {
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * n + i;
  return h[k] * (1 - fu) * (1 - fv) + h[k + 1] * fu * (1 - fv) + h[k + n] * (1 - fu) * fv + h[k + n + 1] * fu * fv;
};
// Hauteur du relief (négative en mer), interpolée : grille proche, puis lointaine, puis le large
export function heightAt(A, x, z) {
  let u = (x - A.x0) / A.step, v = (z - A.z0) / A.step;
  if (u >= 0 && v >= 0 && u < A.n - 1 && v < A.n - 1) return bilinear(A.h, A.n, u, v);
  const F = A.far; u = (x - F.x0) / F.step; v = (z - F.z0) / F.step;
  if (u >= 0 && v >= 0 && u < F.n - 1 && v < F.n - 1) return bilinear(F.h, F.n, u, v);
  return SEA_FLOOR;
}
// Sur un lac ?
export function lakeAt(A, x, z) {
  const i = Math.round((x - A.x0) / A.step), j = Math.round((z - A.z0) / A.step);
  return i >= 0 && j >= 0 && i < A.n && j < A.n && A.lake[j * A.n + i] > 0;
}
export { smooth };
