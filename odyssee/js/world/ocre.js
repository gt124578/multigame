// odyssee/js/world/ocre.js — les canyons des Hauts d'Ocre, enfin ouverts. Les vallées de sable et les oasis creusées
// entre les mesas (sud.js) n'étaient reliées à rien : on les voyait de la route 14 sans pouvoir y descendre. Une gorge
// taillée dans la roche part du sentier de la route 14 et mène au plus grand réseau de vallées ; on y trouve des
// randonneurs, des objets posés et un objet caché. Le réseau ne touche aucune autre route (vérifié : la gorge ne longe
// que la roche et la forêt, et les vallées n'avaient aucune autre sortie) : c'est un cul-de-sac du rang de la route 14.
// Identifiants fixes : `ocre:…`.
import { T, walkable } from './tiles.js';
import { bruit } from './quartiers.js';
import { cacher } from './rythme.js';
import { caveMap } from './interiors.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORET = (t) => t === T.TREE || t === T.PINE;

export function canyonsDOcre({ W, maps, ENC, trainerNpc, route = 'r14' }) {
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
  const grotte = maps ? grotteDesMesas({ W, maps, ENC, trainerNpc, val, dist }) : null;
  return { vallees: best.length, gorge: gorge.length, entree: [ex, ey], grotte };
}

/**
 * La Grotte des Mesas : au fond des vallées, une bouche s'ouvre dans la falaise d'une mesa. Un seul niveau ; un
 * rocher fissuré (Éclate-Roc) ferme les passages étroits du fond quand il y en a ; deux montagnards, des objets et un
 * objet caché ; on en ressort par où l'on est entré (cul-de-sac). Identifiants `mesas:…`.
 */
function grotteDesMesas({ W, maps, ENC, trainerNpc, val, dist }) {
  // la bouche : une case de sable des vallées, loin de l'entrée, sous une falaise de mesa (deux niveaux au moins) ;
  // la case devant la porte et ses voisines restent du sable
  let bouche = null, bd = -1;
  for (const [k, d] of dist) {
    const [x, y] = k.split(',').map(Number);
    if (W.get(x, y) !== T.SAND || W.get(x - 1, y) !== T.SAND || W.get(x + 1, y) !== T.SAND || !walkable(W.get(x, y + 1))) continue;
    let ok = true; for (let j = 1; j <= 3 && ok; j++) for (let i = -2; i <= 2; i++) if (W.get(x + i, y - j) !== T.CAVEWALL || W.height(x + i, y - j) < 2) { ok = false; break; }
    if (!ok || W.npcs.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) < 4) || W.items.some((o) => Math.abs(o.x - x) + Math.abs(o.y - y) < 3)) continue;
    if (d > bd) { bd = d; bouche = [x, y]; }
  }
  if (!bouche) return null;
  const [bx, by] = bouche;
  const B = W.building('cave', bx - 2, by - 3);
  for (let y = B.y; y < B.y + B.d; y++) for (let x = B.x; x < B.x + B.w; x++) W.setHeight(x, y, 0);
  const m = caveMap('mesas', 46, 32, 7373, [{ x: 23, y: 27 }], { name: 'Grotte des Mesas', via: [{ x: 10, y: 20 }, { x: 8, y: 6 }, { x: 23, y: 12 }, { x: 38, y: 5 }, { x: 37, y: 22 }] });
  const g = ENC.grotte || [];
  m.encounter = g.map(([sp, a, b, p]) => [sp, a + 42, b + 42, p]); m.biome = 'terre';
  m.set(23, 28, T.CAVEDOOR); m.set(23, 27, T.CAVE); m.set(23, 29, T.CAVEWALL);
  m.warp(23, 28, { map: 'monde', x: B.doorX, y: B.doorY + 1, dir: 'down' });
  W.warp(B.doorX, B.doorY, { map: 'mesas', x: 23, y: 27, dir: 'up' });
  m.deco.push({ k: 'exitlight', x: 23, y: 28 });
  m.outside = { map: 'monde', x: B.doorX, y: B.doorY + 1 };
  // des rochers fissurés sur les passages étroits loin de l'entrée (Éclate-Roc) : ce qu'ils ferment est plus riche
  const d0 = new Int32Array(m.w * m.h).fill(-1), q = [[23, 27]]; d0[27 * m.w + 23] = 0;
  for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (!m.in(a, b) || d0[b * m.w + a] >= 0 || m.get(a, b) !== T.CAVE) continue; d0[b * m.w + a] = d0[y * m.w + x] + 1; q.push([a, b]); } }
  const etroits = [];
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) {
    if (m.get(x, y) !== T.CAVE || d0[y * m.w + x] < 14) continue;
    const ns = m.get(x, y - 1) === T.CAVEWALL && m.get(x, y + 1) === T.CAVEWALL && m.get(x - 1, y) === T.CAVE && m.get(x + 1, y) === T.CAVE;
    const ew = m.get(x - 1, y) === T.CAVEWALL && m.get(x + 1, y) === T.CAVEWALL && m.get(x, y - 1) === T.CAVE && m.get(x, y + 1) === T.CAVE;
    if (ns || ew) etroits.push([x, y, d0[y * m.w + x]]);
  }
  etroits.sort((a, b) => b[2] - a[2] || a[1] - b[1] || a[0] - b[0]);
  const poses = []; for (const [x, y] of etroits) { if (poses.length >= 3) break; if (poses.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 8)) continue; m.set(x, y, T.SMASH); poses.push([x, y]); }
  // ce qu'on atteint sans briser de rocher, et le reste
  const d1 = new Int32Array(m.w * m.h).fill(-1), q1 = [[23, 27]]; d1[27 * m.w + 23] = 0;
  for (let h = 0; h < q1.length; h++) { const [x, y] = q1[h]; for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (!m.in(a, b) || d1[b * m.w + a] >= 0 || m.get(a, b) !== T.CAVE) continue; d1[b * m.w + a] = d1[y * m.w + x] + 1; q1.push([a, b]); } }
  const sols = (derriere) => { const L = []; for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) { if (m.get(x, y) !== T.CAVE || (d1[y * m.w + x] >= 0) === derriere || d0[y * m.w + x] < 6) continue; if (N4.filter(([a, b]) => m.get(x + a, y + b) === T.CAVE).length >= 2) L.push([x, y, d0[y * m.w + x]]); } return L.sort((a, b) => b[2] - a[2] || a[1] - b[1] || a[0] - b[0]); };
  const avant = sols(false), apres = sols(true);
  const prend = (L, f) => { const p = L[Math.floor(f * (L.length - 1))]; if (!p) return null; L.splice(L.indexOf(p), 1); return p; };
  const lv = Math.max(...m.encounter.map((e) => e[2]));
  const t1 = prend(avant, 0.4); if (t1) trainerNpc(m, t1[0], t1[1], 'left', 'Montagnard', 'Barnabé', [[g[0]?.[0] ?? 74, lv], [g[2]?.[0] ?? 95, lv + 1]], { id: 'mesas:d0', sight: 3, intro: 'Les mesas sont creuses, tu savais ? Le vent y siffle comme dans une flûte.' });
  const t2 = prend(apres.length ? apres : avant, 0.2); if (t2) trainerNpc(m, t2[0], t2[1], 'down', 'Montagnard', 'Isidore', [[g[1]?.[0] ?? 74, lv], [g[3]?.[0] ?? 75, lv], [g[4]?.[0] ?? 95, lv + 1]], { id: 'mesas:d1', sight: 3 });
  const o = [[avant, 0.1, 'full-heal'], [apres.length ? apres : avant, 0.05, 'sun-stone'], [apres.length ? apres : avant, 0.6, 'max-potion']];
  o.forEach(([L, f, it], k) => { const p = prend(L, f); if (p) m.item(p[0], p[1], it, 1, 'mesas:o' + k); });
  // l'objet caché : la roche au bout d'une impasse
  const imp = []; for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE && d0[y * m.w + x] > 10 && N4.filter(([a, b]) => m.get(x + a, y + b) === T.CAVE).length === 1 && !m.items.some((it) => it.x === x && it.y === y) && !m.npcs.some((n) => n.x === x && n.y === y)) imp.push([x, y]);
  if (imp.length) { const [x, y] = imp[Math.floor(imp.length / 2)], r = N4.map(([a, b]) => [x + a, y + b]).find(([a, b]) => m.get(a, b) === T.CAVEWALL); if (r) cacher(m, r[0], r[1], 'mesas:c0', 'ultra-ball'); }
  maps.mesas = m;
  W.sign(bx + 2, by + 1, 'GROTTE DES MESAS\nDes galeries creusées par le vent.') ;
  return { bouche: [B.doorX, B.doorY], rochers: poses.length };
}
