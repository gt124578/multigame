// The Backrooms - Pathfinding A* / BFS pour l'entité et champ de vision
import { CELL_SIZE, cellsOnSeg, segHitsPillar } from './map.js';

export function findPath(map, startX, startZ, targetX, targetZ) {
  const sgx = Math.floor(startX / CELL_SIZE);
  const sgz = Math.floor(startZ / CELL_SIZE);
  let tgx = Math.floor(targetX / CELL_SIZE);
  let tgz = Math.floor(targetZ / CELL_SIZE);

  // le joueur est à côté d'un pilier fin, dans sa case : on vise la case libre voisine la plus proche de lui
  if (map.pillarAt && map.pillarAt(tgx, tgz)) {
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (map.isWall(tgx + dx, tgz + dz)) continue;
      const d = Math.hypot((tgx + dx + 0.5) * CELL_SIZE - targetX, (tgz + dz + 0.5) * CELL_SIZE - targetZ);
      if (!best || d < best.d) best = { x: tgx + dx, z: tgz + dz, d };
    }
    if (best) {
      tgx = best.x;
      tgz = best.z;
    }
  }
  if (sgx === tgx && sgz === tgz) return [];
  if (map.isWall(tgx, tgz)) return null;

  const W = map.W;
  const H = map.H;
  const key = (x, z) => z * W + x;

  const queue = [{ x: sgx, z: sgz }];
  const cameFrom = new Int32Array(W * H).fill(-1);
  const visited = new Uint8Array(W * H);

  const startKey = key(sgx, sgz);
  visited[startKey] = 1;
  const targetKey = key(tgx, tgz);

  const dirs = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ];

  let found = false;
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const curK = key(cur.x, cur.z);

    if (curK === targetKey) {
      found = true;
      break;
    }

    for (let i = 0; i < 4; i++) {
      const nx = cur.x + dirs[i].dx;
      const nz = cur.z + dirs[i].dz;
      if (nx >= 0 && nx < W && nz >= 0 && nz < H) {
        const nK = key(nx, nz);
        // map.canStep (Poolrooms) : d'une salle à l'autre, seulement par une porte
        // (une case coupée en biais se traverse le long de son couloir en diagonale)
        if (!visited[nK] && (!map.isWall(nx, nz) || (map.crossable && map.crossable(nx, nz))) && (!map.canStep || map.canStep(cur.x, cur.z, nx, nz))) {
          visited[nK] = 1;
          cameFrom[nK] = curK;
          queue.push({ x: nx, z: nz });
        }
      }
    }
  }

  if (!found) return null;

  // Reconstruire le chemin de cases en coordonnées réelles
  const path = [];
  let curr = targetKey;
  while (curr !== startKey) {
    const cx = curr % W;
    const cz = Math.floor(curr / W);
    path.push({
      x: (cx + 0.5) * CELL_SIZE,
      z: (cz + 0.5) * CELL_SIZE,
      gx: cx,
      gz: cz,
    });
    curr = cameFrom[curr];
  }

  path.reverse();
  return path;
}

// Vérifier si une ligne droite entre deux points traverse un mur (Raymarching de grille)
export function hasLineOfSight(map, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.1) return true;

  // Poolrooms : les cloisons minces entre les salles cachent aussi
  if (map.lightBlocked && map.lightBlocked(x1, z1, x2, z2)) return false;
  const steps = Math.ceil(dist / (CELL_SIZE * 0.3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const gx = Math.floor(px / CELL_SIZE);
    const gz = Math.floor(pz / CELL_SIZE);
    if (map.isWall(gx, gz)) {
      // une grille à barreaux ne cache rien
      if (map.seeThrough && map.seeThrough(gx, gz)) continue;
      // un pilier fin ou une cloison ne cache que ce qui est derrière lui, pas toute sa case : testé exactement
      // plus bas (une cloison de 12 cm passerait entre deux échantillons)
      if (map.pillarAt && map.pillarAt(gx, gz)) continue;
      return false;
    }
  }
  if (map.pillarAt) {
    const hit = cellsOnSeg(x1, z1, x2, z2, (gx, gz) => {
      const p = map.pillarAt(gx, gz);
      return !!p && segHitsPillar(p, x1, z1, x2, z2);
    });
    if (hit) return false;
  }
  return true;
}
