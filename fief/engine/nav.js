// Fief Maudit : chemins (A*) sur une grille de 1 m autour du village, pour les squelettes et les bots.
// Une case est bloquée par un bâtiment, un rocher, le feu, un brasero, l'eau, ou un arbre encore debout (les arbres
// abattus libèrent leur case). Le chemin trouvé est raccourci en ligne droite tant que rien ne coupe la vue.
import { TREE_R } from './map.js';

export const NAV_R = 78;       // demi-côté de la grille (m)
const N = NAV_R * 2, MARGIN = 0.45;

export function createNav(M) {
  const block = new Uint8Array(N * N);          // obstacles fixes
  const treeAt = new Int32Array(N * N).fill(-1); // arbre qui occupe la case
  const ci = (x) => Math.floor(x + NAV_R), idx = (i, j) => j * N + i;
  const cx = (i) => i - NAV_R + 0.5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), z = cx(j);
    let b = M.isWater(x, z) || Math.hypot(x, z) > 110;
    if (!b) for (const r of M.boxes) if (x > r.x0 - MARGIN && x < r.x1 + MARGIN && z > r.z0 - MARGIN && z < r.z1 + MARGIN) { b = true; break; }
    if (!b) for (const c of M.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + MARGIN) { b = true; break; }
    block[idx(i, j)] = b ? 1 : 0;
  }
  for (const t of M.trees) {
    const r = TREE_R * t.s + MARGIN;
    for (let j = ci(t.z - r); j <= ci(t.z + r); j++) for (let i = ci(t.x - r); i <= ci(t.x + r); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (Math.hypot(cx(i) - t.x, cx(j) - t.z) < r + 0.3) treeAt[idx(i, j)] = t.id;
    }
  }
  const inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const blocked = (i, j, fallen) => {
    if (!inside(i, j)) return true;
    const k = idx(i, j);
    if (block[k]) return true;
    const t = treeAt[k];
    return t >= 0 && !(fallen && fallen(t));
  };
  // ligne droite libre entre deux points ?
  function clear(ax, az, bx, bz, fallen) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
    for (let s = 1; s < n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; if (blocked(ci(x), ci(z), fallen)) return false; }
    return true;
  }
  // case libre la plus proche (le but est souvent un bâtiment ou un brasero)
  function freeNear(i, j, fallen) {
    if (!blocked(i, j, fallen)) return [i, j];
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (!blocked(i + di, j + dj, fallen)) return [i + di, j + dj];
    }
    return null;
  }
  const g = new Float32Array(N * N), from = new Int32Array(N * N), seen = new Uint32Array(N * N);
  let stamp = 0;
  // A* (8 directions, sans couper les angles). Rend une liste de points [x, z] (sans le départ), ou null.
  function path(ax, az, bx, bz, fallen, maxExp = 7000) {
    if (clear(ax, az, bx, bz, fallen)) return [[bx, bz]];
    const s = freeNear(ci(ax), ci(az), fallen), e = freeNear(ci(bx), ci(bz), fallen);
    if (!s || !e) return null;
    stamp++;
    const S = idx(s[0], s[1]), E = idx(e[0], e[1]);
    const heap = [], push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (k) => { const dx = Math.abs((k % N) - e[0]), dz = Math.abs(((k / N) | 0) - e[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    seen[S] = stamp; g[S] = 0; from[S] = -1; push(S, h(S));
    let exp = 0, found = false;
    while (heap.length && exp++ < maxExp) {
      const [, k] = pop();
      if (k === E) { found = true; break; }
      const i = k % N, j = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (blocked(ni, nj, fallen)) continue;
        if (di && dj && (blocked(i + di, j, fallen) || blocked(i, j + dj, fallen))) continue;
        const nk = idx(ni, nj), ng = g[k] + (di && dj ? 1.414 : 1);
        if (seen[nk] === stamp && ng >= g[nk]) continue;
        seen[nk] = stamp; g[nk] = ng; from[nk] = k; push(nk, ng + h(nk));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = E; k !== -1 && k !== S; k = from[k]) cells.push([cx(k % N), cx((k / N) | 0)]);
    cells.reverse();
    // raccourcis : on saute les points tant que la vue est libre
    const out = []; let px = ax, pz = az, i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !clear(px, pz, cells[j][0], cells[j][1], fallen)) j--;
      out.push(cells[j]); px = cells[j][0]; pz = cells[j][1]; i = j + 1;
    }
    if (clear(px, pz, bx, bz, fallen)) out.push([bx, bz]);
    return out;
  }
  return { path, clear, blocked: (x, z, f) => blocked(ci(x), ci(z), f) };
}
