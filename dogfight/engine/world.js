// Le monde vu par le moteur : la carte courante (vrai relief, navires, piste), l'île d'Island Rush posée en mer
// (relief et bâtiments), et les nuages (mêmes partout, tirés d'une graine).
// Moteur pur : sert au jeu, aux tests et au rendu. La carte doit être chargée avant (loadMap).
import { buildArchipel, heightAt } from './archipel.js';

export const CLOUD_BASE = 470;   // base par défaut des cumulus (une carte la change dans sky.base)
export const CLOUD_FAR = 17000;  // les nuages de l'horizon vont jusque-là autour du centre de la zone
const CELL_M = 40;      // grille des obstacles (toits, ponts, navires)
const CLOUD_CELL = 400; // grille des nuages
const CLOUD_IN = 0.85;  // le cœur d'un dôme, où l'on est caché : ses bords sont effilochés

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// Les nuages, tirés d'une graine (les mêmes chez tous les joueurs) : de gros amas de cumulus serrés, plus hauts au centre,
// des tours qui montent haut, une mer de nuages accrochée au massif principal (les sommets la percent), quelques cumulus
// isolés, ceux de l'horizon (far, hors de la zone de jeu), et le banc bas que traverse le transport.
// Un dôme : centre (x, z), rayon R, base, hauteur H et galbe p ; son sommet, à la distance d du centre (en rayons) :
// base + H·(1 − d²)^p.
export const cloudTop = (c, d2) => c.base + c.H * Math.pow(1 - d2, c.p);
export function generateClouds() {
  const A = buildArchipel(), K = { base: CLOUD_BASE, masses: 22, size: [700, 1700], top: [600, 1300], towers: 3, tall: [2000, 2800], small: 40, ...A.def.sky };
  const list = [], X0 = A.x0 - 500, Z0 = A.z0 - 500, S = A.size + 1000, lerp = ([a, b], t) => a + (b - a) * t;
  // un cumulus : un dôme, et 2 à 6 bourgeons autour, plus ou moins hauts
  const cumulus = (i, x, z, R, H, base, p, far) => {
    list.push({ i, x, z, R, H, base, p, far });
    for (let k = 0, n = 2 + Math.floor(hash(i, 7) * 5); k < n; k++) {
      const a = hash(i, 20 + k) * 6.283, r = Math.sqrt(hash(i, 40 + k)) * R * 0.55;
      list.push({ i: 1e6 + i * 8 + k, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, R: R * (0.35 + hash(i, 60 + k) * 0.35), H: H * (0.5 + hash(i, 80 + k) * 0.8), base, p: p * 0.9, far });
    }
  };
  const base = (i) => K.base + (hash(i, 6) - 0.5) * 90;
  // un amas : des cumulus serrés sur une même base, de plus en plus hauts vers le centre ; une tour en son cœur, parfois
  const mass = (i, x, z, M, top, tall, far) => {
    const b = base(i);
    for (let k = 0, n = 7 + Math.floor(M / 80); k < n; k++) {
      const a = hash(i, 300 + k) * 6.283, f = Math.sqrt(hash(i, 340 + k)), r = f * M * 0.78, R = M * (0.26 + 0.22 * hash(i, 380 + k)) * (1 - 0.3 * f);
      cumulus(100 * i + k, x + Math.cos(a) * r, z + Math.sin(a) * r * 0.8, R, Math.max(R * 0.5, top * (1 - 0.65 * f * f) * (0.65 + 0.45 * hash(i, 420 + k))), b, 0.5, far);
    }
    // la tour : un large pied, et des bourrelets tout autour qui montent en s'étageant (le chou-fleur)
    if (tall) for (let k = 0; k < 8; k++) {
      const a = (k + hash(i, 500 + k) * 0.7) * 0.898, r = k ? M * (0.28 + 0.22 * hash(i, 520 + k)) : 0, R = M * (k ? 0.32 + 0.2 * hash(i, 540 + k) : 0.7);
      cumulus(100 * i + 90 + k, x + Math.cos(a) * r, z + Math.sin(a) * r, R, (tall - b) * (k ? 0.3 + 0.55 * hash(i, 560 + k) : 1), b, k ? 0.45 : 0.36, far);
    }
  };
  const inField = (x, z) => x > X0 && x < X0 + S && z > Z0 && z < Z0 + S;
  for (let c = 0; c < K.masses; c++) mass(c, X0 + hash(c, 1) * S, Z0 + hash(c, 2) * S, lerp(K.size, hash(c, 4)), lerp(K.top, hash(c, 5)), c < K.towers ? lerp(K.tall, hash(c, 8)) : 0, false);
  for (let c = 0; c < K.small; c++) { const i = 5000 + c, R = 70 + hash(i, 4) * 150; cumulus(i, X0 + hash(i, 1) * S, Z0 + hash(i, 2) * S, R, R * (0.5 + hash(i, 5) * 0.6), base(i), 0.55, false); }
  // l'horizon : des amas et des tours, hors du carré de la zone
  for (let c = 0, F = CLOUD_FAR; c < K.masses * 3; c++) {
    const i = 3000 + c, x = A.zone.x + (hash(i, 1) * 2 - 1) * F, z = A.zone.z + (hash(i, 2) * 2 - 1) * F;
    if (!inField(x, z)) mass(i, x, z, lerp(K.size, hash(i, 4)) * 1.2, lerp(K.top, hash(i, 5)), hash(i, 9) < 0.25 ? lerp(K.tall, hash(i, 8)) : 0, true);
  }
  // la mer de nuages : une nappe épaisse, trouée, posée sur la mer au pied du massif le plus haut, du côté où il plonge
  // le plus vite ; elle lèche ses pentes et ses crêtes la percent
  let P = { h: 0, x: A.zone.x, z: A.zone.z };
  for (let x = A.zone.x - 6000; x <= A.zone.x + 6000; x += 150) for (let z = A.zone.z - 6000; z <= A.zone.z + 6000; z += 150) { const h = heightAt(A, x, z); if (h > P.h) P = { h, x, z }; }
  if (K.deck !== false && P.h > 800) {
    let best = Infinity, ang = 0;
    for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283; for (let d = 200; d < 9000; d += 100) if (heightAt(A, P.x + Math.cos(a) * d, P.z + Math.sin(a) * d) < P.h * 0.15) { if (d < best) { best = d; ang = a; } break; } }
    const cx = P.x + Math.cos(ang) * (best + 1800), cz = P.z + Math.sin(ang) * (best + 1800), top = P.h * 0.72, b = Math.max(A.bank.base + 40, P.h * 0.3);
    for (let k = 0; k < 150; k++) {
      const i = 8000 + k, a = hash(i, 1) * 6.283, r = Math.sqrt(hash(i, 2)) * 3000;
      if (hash(i, 3) < 0.15) continue;
      list.push({ i, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, R: 260 + hash(i, 4) * 260, H: (top - b) * (0.5 + 0.5 * hash(i, 5)) * (1 - 0.4 * r / 3000), base: b, p: 0.32, deck: true });
    }
  }
  // le banc bas : de larges dômes plats, serrés le long de son trajet
  const N = A.bank;
  N.path.forEach((p, k) => { if (k % 9 === 0) { const i = 900 + k; list.push({ i, x: p.x + (hash(i, 1) - 0.5) * 120, z: p.z + (hash(i, 2) - 0.5) * 120, R: 230 + hash(i, 4) * 90, H: 150 + hash(i, 5) * 40, base: N.base, p: 0.3, bank: true }); } });
  return list;
}

// Une boîte orientée, posée dans la grille des obstacles (un peu large : mieux vaut frôler que traverser)
function stamp(grid, n, s, A) {
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), top = s.y + s.h, hl = s.len / 2 + 6, hw = s.wid / 2 + 6;
  for (let a = -hl; a <= hl; a += CELL_M / 3) for (let b = -hw; b <= hw; b += CELL_M / 3) {
    const x = s.x + a * c - b * sn, z = s.z + a * sn + b * c, i = Math.floor((x - A.x0) / CELL_M), j = Math.floor((z - A.z0) / CELL_M);
    if (i >= 0 && j >= 0 && i < n && j < n && grid[j * n + i] < top) grid[j * n + i] = top;
  }
}

export function createWorld(map, { clouds } = {}) {
  const size = map.size, cell = map.cell || 4, A = buildArchipel();
  clouds = clouds || generateClouds();
  const n = Math.ceil(A.size / CELL_M), grid = new Float32Array(n * n);
  const CELL = 4; // cases de bâtiments d'Island Rush
  for (const b of map.buildings) {
    const x0 = b.x0 * CELL, z0 = b.z0 * CELL, x1 = (b.x0 + b.w) * CELL, z1 = (b.z0 + b.d) * CELL, top = b.y + b.floors * 3.2 + 2;
    for (let j = Math.floor((z0 - A.z0) / CELL_M); j <= Math.floor((z1 - A.z0) / CELL_M); j++) for (let i = Math.floor((x0 - A.x0) / CELL_M); i <= Math.floor((x1 - A.x0) / CELL_M); i++) {
      if (i >= 0 && j >= 0 && i < n && j < n && grid[j * n + i] < top) grid[j * n + i] = top;
    }
  }
  for (const s of A.structures) stamp(grid, n, s, A);
  const cloudGrid = new Map();
  const key = (i, j) => (i + 64) * 4096 + j + 64;
  let lowBase = Infinity, highTop = 0;
  for (const c of clouds) {
    if (c.far) continue;
    lowBase = Math.min(lowBase, c.base); highTop = Math.max(highTop, c.base + c.H);
    const r = c.R * CLOUD_IN, i0 = Math.floor((c.x - r) / CLOUD_CELL), i1 = Math.floor((c.x + r) / CLOUD_CELL), j0 = Math.floor((c.z - r) / CLOUD_CELL), j1 = Math.floor((c.z + r) / CLOUD_CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!cloudGrid.has(k)) cloudGrid.set(k, []); cloudGrid.get(k).push(c); }
  }
  // l'île d'Island Rush garde son relief à elle ; ailleurs, celui de la carte
  const islandAt = (x, z) => (x >= 0 && z >= 0 && x < size && z < size ? map.heightAt(x, z) : -Infinity);
  return {
    map, clouds, size, cell, archi: A,
    // fond sous la mer compris (négatif) : pour le rendu de la mer
    seabedAt(x, z) { return Math.max(heightAt(A, x, z), islandAt(x, z)); },
    // hauteur du relief (la mer est à 0)
    groundAt(x, z) { return Math.max(0, heightAt(A, x, z), islandAt(x, z)); },
    // relief + toits, navires et constructions
    obstacleAt(x, z) {
      const g = this.groundAt(x, z), i = Math.floor((x - A.x0) / CELL_M), j = Math.floor((z - A.z0) / CELL_M);
      if (i < 0 || j < 0 || i >= n || j >= n) return g;
      const t = grid[j * n + i];
      return t > g ? t : g;
    },
    // dans un nuage ? (on s'y cache des missiles et des bots)
    inCloud(x, y, z) {
      if (y < lowBase - 4 || y > highTop) return false;
      const list = cloudGrid.get(key(Math.floor(x / CLOUD_CELL), Math.floor(z / CLOUD_CELL)));
      if (!list) return false;
      for (const c of list) {
        const dx = x - c.x, dz = z - c.z, d2 = (dx * dx + dz * dz) / (c.R * c.R * CLOUD_IN * CLOUD_IN);
        if (d2 < 1 && y >= c.base - 4 && y < cloudTop(c, d2) - 10) return true;
      }
      return false;
    },
  };
}
