// The Backrooms - Pathfinding A* / BFS pour l'entité et champ de vision
import { CELL_SIZE } from './map.js';

export function findPath(map, startX, startZ, targetX, targetZ) {
  const sgx = Math.floor(startX / CELL_SIZE);
  const sgz = Math.floor(startZ / CELL_SIZE);
  const tgx = Math.floor(targetX / CELL_SIZE);
  const tgz = Math.floor(targetZ / CELL_SIZE);

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
        if (!visited[nK] && !map.isWall(nx, nz)) {
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

  const steps = Math.ceil(dist / (CELL_SIZE * 0.3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const gx = Math.floor(px / CELL_SIZE);
    const gz = Math.floor(pz / CELL_SIZE);
    if (map.isWall(gx, gz)) return false;
  }
  return true;
}
