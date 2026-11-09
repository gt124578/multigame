// odyssee/js/world/contreforts.js — la Chaîne Céleste sans son cadre :
//   - contreforts() : au-delà du plan rectangulaire de la chaîne, la roche déborde dans la forêt de fond en longues
//     avancées (des épaulements qui descendent en gradins jusqu'à la forêt, des vallées de pins entre eux), toujours à
//     cinq cases au moins de tout ce qu'on foule : depuis les routes voisines, on voit la montagne se dresser derrière
//     les arbres, et sa silhouette n'a plus de bord droit ;
//   - plateauNaturel() : le Plateau Céleste n'est plus un rectangle posé dans la roche ; ses bords d'herbe libres
//     (loin des allées, des bâtiments et des gens) redeviennent roche en suivant un bruit : la falaise mord le replat.
// Posé après les lieux (on ne prend jamais le bloc d'un lieu) ; bruit à graine fixe : même carte partout.
import { T, walkable } from './tiles.js';
import { bruit } from './quartiers.js';
import { BLOC, CHAINE } from './plan.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORET = (t) => t === T.TREE || t === T.PINE;

/** distance (chanfrein 1 / 1,41) aux cases `src` dans un rectangle */
function distance(w, h, src) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = src(i) ? 0 : 1e9;
  for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (d[p]) d[p] = Math.min(d[p], d[p - 1] + 1, d[p - w] + 1, d[p - w - 1] + 1.41, d[p - w + 1] + 1.41); }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) { const p = y * w + x; if (d[p]) d[p] = Math.min(d[p], d[p + 1] + 1, d[p + w] + 1, d[p + w + 1] + 1.41, d[p + w - 1] + 1.41); }
  return d;
}

export function contreforts(W, o = {}) {
  const PORTEE = o.portee ?? 64, MARGE = o.marge ?? 5;
  let X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
  for (const [c0, r0, c1, r1] of CHAINE) { X0 = Math.min(X0, c0 * BLOC); Y0 = Math.min(Y0, r0 * BLOC); X1 = Math.max(X1, (c1 + 1) * BLOC - 1); Y1 = Math.max(Y1, (r1 + 1) * BLOC - 1); }
  X0 = Math.max(1, X0 - PORTEE); Y0 = Math.max(1, Y0 - PORTEE); X1 = Math.min(W.w - 2, X1 + PORTEE); Y1 = Math.min(W.h - 2, Y1 + PORTEE);
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1, at = (x, y) => (y - Y0) * w + (x - X0);
  const dansPlan = (x, y) => CHAINE.some(([c0, r0, c1, r1]) => x >= c0 * BLOC && y >= r0 * BLOC && x < (c1 + 1) * BLOC && y < (r1 + 1) * BLOC);
  const villes = W.zones.filter((z) => z.town);
  // la roche de la chaîne (dans son plan) et ce qu'on doit laisser en paix (sol foulé, eau, bâti, décor posé)
  const pris = new Uint8Array(w * h);
  for (const d of W.deco) if (d.x >= X0 && d.y >= Y0 && d.x <= X1 && d.y <= Y1) pris[at(d.x, d.y)] = 1;
  for (const k of [...W.warps.keys(), ...W.signs.keys(), ...W.objects.keys()]) { const [x, y] = k.split(',').map(Number); if (x >= X0 && y >= Y0 && x <= X1 && y <= Y1) pris[at(x, y)] = 1; }
  const dRoche = distance(w, h, (i) => { const x = X0 + (i % w), y = Y0 + ((i / w) | 0); return W.t[y * W.w + x] === T.CAVEWALL && W.hg[y * W.w + x] >= 1 && dansPlan(x, y); });
  const dSol = distance(w, h, (i) => { const x = X0 + (i % w), y = Y0 + ((i / w) | 0), t = W.t[y * W.w + x]; return pris[i] || (!FORET(t) && t !== T.CAVEWALL) || (t === T.CAVEWALL && !dansPlan(x, y) && W.hg[y * W.w + x] === 0); });
  const R = [];
  // (dans le plan, la bande de forêt du pied, à moins de 14 cases de son bord, se prend aussi : pas de douve d'arbres
  //  entre la chaîne et ses avancées)
  const dPlan = distance(w, h, (i) => !dansPlan(X0 + (i % w), Y0 + ((i / w) | 0)));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (dansPlan(x, y) && dPlan[at(x, y)] > 14) continue;
    const i = at(x, y), t = W.get(x, y);
    if (!FORET(t) || W.height(x, y) !== 0 || dSol[i] < MARGE) continue;
    if (villes.some((z) => x >= z.x0 - 4 && x <= z.x1 + 4 && y >= z.y0 - 4 && y <= z.y1 + 4)) continue;
    // la portée des avancées : de larges épaulements (bruit lent, accentué), des arêtes plus fines
    const lent = bruit(x, y, 38, 7101), fin = bruit(x, y, 13, 7102);
    const portee = 6 + PORTEE * Math.pow(Math.max(0, lent - 0.2) / 0.8, 1.1) + 10 * fin;
    const d = dRoche[i]; if (d > portee) continue;
    // des vallées de pins entre les épaulements
    const val = Math.abs(2 * bruit(x + 13 * (fin - 0.5), y, 21, 7103) - 1);
    if (val < 0.09) { W.set(x, y, T.PINE); continue; }
    R.push([x, y, d, portee]);
  }
  // hauteur : on descend en gradins depuis la chaîne vers la pointe de l'avancée, plus vite sur les côtés
  const S = new Set(R.map(([x, y]) => x + ',' + y));
  for (const [x, y, d, portee] of R) {
    const reste = portee - d, crete = bruit(x, y, 9, 7104);
    const H = Math.max(1, Math.min(6, Math.round(1 + reste / 6 + crete * 1.5)));
    W.set(x, y, T.CAVEWALL); W.setHeight(x, y, H);
  }
  // le pied : une case de roche au bord ne dépasse jamais deux niveaux (des gradins, pas un mur)
  for (const [x, y] of R) if (N4.some(([a, b]) => !S.has((x + a) + ',' + (y + b)) && W.get(x + a, y + b) !== T.CAVEWALL)) W.setHeight(x, y, Math.min(W.height(x, y), 2));
  return { cases: R.length };
}

/**
 * Les bords du Plateau Céleste (ville J, au niveau 4) : l'herbe libre à moins de quelques cases du bord de la ville
 * redevient roche selon un bruit (falaise de 1 à 3 gradins au-dessus du replat) ; jamais une allée, un bâtiment, un PNJ,
 * un objet, un panneau ni leurs abords ; ce qui couperait un passage est rendu.
 */
export function plateauNaturel(W, J) {
  const v = J?.ville; if (!v) return { cases: 0 };
  const base = W.height(v.x + (v.w >> 1), v.y + (v.h >> 1));
  const occ = new Set([...W.npcs.map((n) => n.x + ',' + n.y), ...W.items.map((q) => q.x + ',' + q.y), ...W.warps.keys(), ...W.signs.keys(), ...W.objects.keys()]);
  for (const d of W.deco) if (d.x != null) occ.add(d.x + ',' + d.y);
  const LIBRE = (t) => t === T.GRASS || t === T.FLOWER || t === T.TALL;
  const DUR = (t) => t === T.PATH || t === T.PAVE || t === T.BUILD || t === T.DOOR || t === T.STAIRS || t === T.BRIDGE || t === T.SIGN || t === T.BLOCK || t === T.MAT;
  const bord = (x, y) => Math.min(x - v.x, y - v.y, v.x + v.w - 1 - x, v.y + v.h - 1 - y);
  const pris = [];
  for (let y = v.y; y < v.y + v.h; y++) for (let x = v.x; x < v.x + v.w; x++) {
    const t = W.get(x, y); if (!LIBRE(t) || W.height(x, y) !== base || occ.has(x + ',' + y)) continue;
    const prof = 1 + 7 * bruit(x, y, 8, 7201) + 2 * bruit(x, y, 3, 7202);
    // les coins s'arrondissent (rayon 11 cases)
    const ax = Math.min(x - v.x, v.x + v.w - 1 - x), ay = Math.min(y - v.y, v.y + v.h - 1 - y), RC = 11;
    const coin = ax < RC && ay < RC && (RC - ax) ** 2 + (RC - ay) ** 2 > RC * RC;
    if (bord(x, y) >= prof && !coin) continue;
    let pres = false;
    for (let j = -1; j <= 1 && !pres; j++) for (let i = -1; i <= 1; i++) { const q = W.get(x + i, y + j); if (DUR(q) || occ.has((x + i) + ',' + (y + j))) { pres = true; break; } }
    if (pres) continue;
    pris.push([x, y, t]);
  }
  for (const [x, y] of pris) { W.set(x, y, T.CAVEWALL); W.setHeight(x, y, base + 1 + Math.max(0, Math.min(2, Math.floor((6 - bord(x, y)) / 2)))); }
  // ce qui n'est plus relié au reste du plateau (depuis la porte de la Ligue ou l'allée) : rendu, jusqu'à ce que tout tienne
  const cle = (x, y) => x + ',' + y, dans = (x, y) => x >= v.x - 1 && y >= v.y - 1 && x <= v.x + v.w && y <= v.y + v.h;
  let depart = null; for (let y = v.y + v.h - 1; y >= v.y && !depart; y--) for (let x = v.x; x < v.x + v.w; x++) if (W.get(x, y) === T.PATH || W.get(x, y) === T.PAVE) { depart = [x, y]; break; }
  if (!depart) return { cases: pris.length };
  const rendus = new Set();
  for (let tour = 0; tour < 6; tour++) {
    const vu = new Set([cle(...depart)]), q = [depart];
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of N4) { const u = x + a, w2 = y + b, k = cle(u, w2); if (vu.has(k) || !dans(u, w2) || !walkable(W.get(u, w2)) || !W.canStep(x, y, u, w2)) continue; vu.add(k); q.push([u, w2]); } }
    let n = 0;
    for (const [x, y, t] of pris) {
      if (rendus.has(cle(x, y))) continue;
      // une case de roche qui touche un sol coupé du reste : rendue
      if (N4.some(([a, b]) => walkable(W.get(x + a, y + b)) && dans(x + a, y + b) && !vu.has(cle(x + a, y + b)) && W.height(x + a, y + b) === base)) { W.set(x, y, t); W.setHeight(x, y, base); rendus.add(cle(x, y)); n++; }
    }
    if (!n) break;
  }
  return { cases: pris.length - rendus.size };
}
