// odyssee/js/world/ocre.js — les canyons des Hauts d'Ocre, enfin ouverts. Les vallées de sable et les oasis creusées
// entre les mesas (sud.js) n'étaient reliées à rien : on les voyait de la route 14 sans pouvoir y descendre. Une gorge
// taillée dans la roche part du sentier de la route 14 et mène au plus grand réseau de vallées ; on y trouve des
// randonneurs, des objets posés et un objet caché. Le réseau ne touche aucune autre route (vérifié : la gorge ne longe
// que la roche et la forêt, et les vallées n'avaient aucune autre sortie) : c'est un cul-de-sac du rang de la route 14.
// Identifiants fixes : `ocre:…`.
import { T, walkable } from './tiles.js';
import { bruit } from './quartiers.js';
import { cacher } from './rythme.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORET = (t) => t === T.TREE || t === T.PINE;

export function canyonsDOcre({ W, ENC, trainerNpc, route = 'r14' }) {
  const Z = W.zones.find((z) => z.name === 'Hauts d\'Ocre'); if (!Z) return null;
  const dansZ = (x, y) => W.zoneAt(x, y) === Z;
  // 1. le plus grand réseau de vallées qu'on n'atteint de nulle part : sol praticable d'un seul tenant, dans le
  //    rectangle des Hauts d'Ocre, qui ne mène à aucun chemin (sentier de route ou de lieu, rue)
  const vu = new Set(); let best = null;
  const dansR = (x, y) => x >= Z.x0 && y >= Z.y0 && x <= Z.x1 && y <= Z.y1;
  for (let y = Z.y0; y <= Z.y1; y++) for (let x = Z.x0; x <= Z.x1; x++) {
    const k = x + ',' + y; if (vu.has(k) || W.get(x, y) !== T.SAND) continue;
    const c = [[x, y]], q = [[x, y]]; vu.add(k); let relie = false;
    while (q.length) { const [a, b] = q.pop(); for (const [dx, dy] of N4) { const u = a + dx, v = b + dy, kk = u + ',' + v, t = W.get(u, v); if (vu.has(kk) || !walkable(t) || !W.canStep(a, b, u, v)) continue; if (t === T.PATH || t === T.PAVE || t === T.BRIDGE || t === T.STAIRS || !dansR(u, v)) { relie = true; continue; } vu.add(kk); c.push([u, v]); q.push([u, v]); } }
    if (!relie && (!best || c.length > best.length)) best = c;
  }
  if (!best) return null;
  const val = new Set(best.map(([x, y]) => x + ',' + y));
  // 2. la gorge : plus court chemin depuis les vallées à travers la roche et la forêt, jusqu'au sol de la route ; une case
  //    de la gorge ne touche jamais un sol étranger (ni lieu, ni autre route)
  const zr = (x, y) => { const z = W.zoneAt(x, y); return z?.route === route && !z.town; };
  const etranger = (x, y) => { const t = W.get(x, y); return (walkable(t) || t === T.WATER) && !val.has(x + ',' + y) && !zr(x, y); };
  const perce = (x, y) => { const t = W.get(x, y); if (!(t === T.CAVEWALL || FORET(t) || t === T.ROCK)) return false; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (etranger(x + i, y + j)) return false; return true; };
  const prev = new Map(), q = [];
  for (const [x, y] of best) { prev.set(x + ',' + y, null); q.push([x, y, 0]); }
  let fin = null;
  for (let h = 0; h < q.length && !fin; h++) {
    const [x, y, d] = q[h]; if (d > 60) break;
    for (const [dx, dy] of N4) {
      const u = x + dx, v = y + dy, k = u + ',' + v; if (prev.has(k)) continue;
      const t = W.get(u, v);
      if (zr(u, v) && walkable(t) && W.height(u, v) === 0 && t !== T.STAIRS) { prev.set(k, x + ',' + y); fin = [u, v]; break; }
      if (!perce(u, v)) continue;
      prev.set(k, x + ',' + y); q.push([u, v, d + 1]);
    }
  }
  if (!fin) return { erreur: 'gorge introuvable' };
  const gorge = []; for (let k = prev.get(fin.join(',')); k; k = prev.get(k)) { if (val.has(k)) break; gorge.push(k.split(',').map(Number)); }
  // la gorge : un sentier de sable au fond, trois cases de large, les parois de roche de part et d'autre restent hautes
  const creuse = (x, y, t) => { const q2 = W.get(x, y); if (!(q2 === T.CAVEWALL || FORET(q2) || q2 === T.ROCK)) return; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (etranger(x + i, y + j)) return; W.set(x, y, t); W.setHeight(x, y, 0); };
  for (const [x, y] of gorge) creuse(x, y, T.PATH);
  for (const [x, y] of gorge) for (const [dx, dy] of N4) if (bruit(x + dx, y + dy, 3, 8801) > 0.25) creuse(x + dx, y + dy, T.SAND);
  // 3. ce qu'on y trouve : un panneau à l'entrée, des randonneurs, des objets, un objet caché dans la roche
  const [ex, ey] = gorge[0] || fin;
  const caseLibre = (x, y, min = 3) => {
    for (let r = 0; r < 14; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const a = x + i, b = y + j; if (!val.has(a + ',' + b) || W.get(a, b) !== T.SAND || W.npcs.some((n) => n.x === a && n.y === b) || W.items.some((o) => o.x === a && o.y === b)) continue;
      if (N4.filter(([u, v]) => walkable(W.get(a + u, b + v))).length >= min) return [a, b];
    }
    return null;
  };
  { const p = N4.map(([dx, dy]) => [ex + dx, ey + dy]).find(([a, b]) => W.get(a, b) === T.SAND && !N4.every(([u, v]) => walkable(W.get(a + u, b + v)))); if (p) W.sign(p[0], p[1], 'HAUTS D\'OCRE\nVallées de sable entre les mesas.\nPrévoyez de l\'eau !'); }
  // les points les plus éloignés de l'entrée (pas), pour y mettre randonneurs et objets
  const dist = new Map([[gorge[gorge.length - 1].join(','), 0]]), q3 = [gorge[gorge.length - 1]];
  for (let h = 0; h < q3.length; h++) { const [x, y] = q3[h], d = dist.get(x + ',' + y); for (const [dx, dy] of N4) { const k = (x + dx) + ',' + (y + dy); if (!dist.has(k) && val.has(k)) { dist.set(k, d + 1); q3.push([x + dx, y + dy]); } } }
  const tri = [...dist].sort((a, b) => a[1] - b[1]), loin = (f) => tri[Math.min(tri.length - 1, Math.floor(f * (tri.length - 1)))][0].split(',').map(Number);
  const enc = ENC?.[route] || [];
  const niv = enc.length ? Math.max(...enc.map((e) => e[2])) : 55;
  const equipe = (k, n) => Array.from({ length: n }, (_, i) => [enc[(k * 5 + i * 3) % enc.length]?.[0] ?? 74, niv - n + 1 + i % 2]);
  const dresseurs = [['Montagnard', 'Gustave', 0.3, 'right', 2], ['Randonneuse', 'Sahra', 0.55, 'left', 3], ['Topdresseur', 'Anouar', 0.85, 'down', 3]];
  dresseurs.forEach(([cls, nom, f, dir, n], k) => { const p = caseLibre(...loin(f)); if (p) trainerNpc(W, p[0], p[1], dir, cls, nom, equipe(k, n), { id: `ocre:d${k}`, sight: 3 }); });
  const objets = [['hyper-potion', 0.4], ['max-repel', 0.7], ['rare-candy', 1]];
  objets.forEach(([it, f], k) => { const p = caseLibre(...loin(f), 2); if (p) W.item(p[0], p[1], it, 1, `ocre:o${k}`); });
  // l'objet caché : dans la roche au bout d'une impasse des vallées
  const impasses = tri.filter(([k]) => { const [x, y] = k.split(',').map(Number); return N4.filter(([a, b]) => walkable(W.get(x + a, y + b))).length === 1; });
  if (impasses.length) { const [x, y] = impasses[Math.floor(impasses.length * 0.8)][0].split(',').map(Number); const r = N4.map(([a, b]) => [x + a, y + b]).find(([a, b]) => W.get(a, b) === T.CAVEWALL); if (r) cacher(W, r[0], r[1], 'ocre:c0', 'ultra-ball'); }
  return { vallees: best.length, gorge: gorge.length, entree: [ex, ey] };
}
