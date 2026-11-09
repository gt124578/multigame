// odyssee/js/world/grottes.js — la Grotte du Col : elle traverse le coin sud-ouest de la Chaîne Céleste, du Bois Murmure
// (à l'ouest) à la route 10 (au sud), comme les grottes de HeartGold qui relient deux régions et qu'on rouvre plus tard.
//   - Galeries hautes (col1) : on y entre tôt par le Bois Murmure ; un lac souterrain coupe la grotte en deux : il faut
//     Surf (5 badges) pour passer de l'autre côté, d'où l'on ressort sur la route 10. Le raccourci n'ouvre donc rien
//     avant l'heure (la route 10 demande déjà 5 badges).
//   - Galerie profonde (col2), dans le noir (Flash) : on y descend par une échelle ; au fond, un éboulement qu'on pousse
//     avec Force garde une petite salle et son trésor.
// Les deux bouches sont des percées : un sentier part du chemin de la route, traverse la forêt tout droit et bute sur
// la roche de la Chaîne ; l'entrée est creusée dans la falaise. Identifiants fixes : `col:…`.
// Et grotteDansFalaise() : une grotte générique à deux niveaux creusée dans une falaise au bord d'une route (la Grotte
// des Sables, route 16).
import { T, walkable } from './tiles.js';
import { caveMap } from './interiors.js';
import { massif } from './relief.js';
import { bruit } from './quartiers.js';
import { cacher } from './rythme.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORET = (t) => t === T.TREE || t === T.PINE;
const ROCHE = (W, x, y) => W.get(x, y) === T.CAVEWALL && W.height(x, y) >= 1;

/**
 * Le meilleur départ d'une percée depuis le sentier d'une route, dans la direction (dx, dy) : la case du sentier d'où la
 * forêt mène le plus vite à la roche, sans rien toucher d'autre en chemin (une bande de 7 cases de forêt de chaque côté
 * des derniers pas, pour creuser l'entrée). Renvoie { x, y, n } (n : nombre de pas jusqu'à la roche) ou null.
 */
function percee(W, cells, dx, dy, o = {}) {
  const px = -dy, py = dx, min = o.min ?? 8, max = o.max ?? 70;
  let best = null;
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (W.get(x, y) !== T.PATH || W.height(x, y) !== 0) continue;
    if (o.zone && !o.zone(x, y)) continue;
    // on sort de la bande de la route, puis la forêt seule jusqu'à la roche
    let n = 1, foret = 0, ok = false, f0 = 0;
    for (; n <= max; n++) {
      const a = x + dx * n, b = y + dy * n, t = W.get(a, b);
      if (ROCHE(W, a, b)) { ok = foret >= min; break; }
      if (W.height(a, b) !== 0) break;
      if (FORET(t)) {
        // ni eau, ni chemin, ni rien d'autre de praticable à trois cases de part et d'autre (on ne relie rien)
        let propre = true;
        for (let s = -2; s <= 2 && propre; s++) { const u = a + px * s, v = b + py * s, q = W.get(u, v); if (!(FORET(q) || ROCHE(W, u, v))) propre = false; }
        if (!propre) { if (foret) break; continue; }
        if (!foret) f0 = n;
        foret++;
      } else if (foret) break;   // de nouveau du praticable après la forêt : ce n'est pas la montagne
      else if (!walkable(t)) break;
    }
    if (!ok) continue;
    // la falaise doit être franche : trois cases de roche de front, et de la roche derrière
    const ra = x + dx * n, rb = y + dy * n;
    let falaise = true;
    for (let s = -2; s <= 2; s++) for (let d = 0; d <= 2; d++) if (!ROCHE(W, ra + px * s + dx * d, rb + py * s + dy * d)) falaise = false;
    if (!falaise) continue;
    const note = foret + (o.vers ? Math.hypot(x - o.vers[0], y - o.vers[1]) * 0.05 : 0);
    if (!best || note < best.note) best = { x, y, n, f0, note };
  }
  return best;
}

/** taille le sentier de la percée et creuse l'entrée dans la falaise ; renvoie le bâtiment 'cave' (porte au sud) */
function bouche(W, P, dx, dy) {
  const px = -dy, py = dx;
  const herbe = (a, b) => { if (FORET(W.get(a, b))) W.set(a, b, T.GRASS); };
  // le sentier, bordé d'une case d'herbe qui ondule
  for (let k = 1; k < P.n; k++) {
    const a = P.x + dx * k, b = P.y + dy * k;
    if (FORET(W.get(a, b)) || W.get(a, b) === T.GRASS) W.set(a, b, T.PATH);
    for (const s of [-1, 1]) { herbe(a + px * s, b + py * s); if (bruit(a, b, 3, 71 + s) > 0.62) herbe(a + px * s * 2, b + py * s * 2); }
  }
  // au pied de la falaise : un replat d'herbe ; l'entrée creusée dans la roche
  const ex = P.x + dx * (P.n - 1), ey = P.y + dy * (P.n - 1);
  let B;
  if (dy === -1) {
    // vers le nord : la porte dans la première rangée de roche, le replat devant
    for (let j = 0; j <= 3; j++) for (let i = -3; i <= 3; i++) herbe(ex + i, ey - j + 2);
    for (let j = 0; j <= 1; j++) for (let i = -1; i <= 1; i++) if (W.get(ex + i, ey + j) === T.GRASS) W.set(ex + i, ey + j, T.PATH);
    B = W.building('cave', ex - 2, ey - 3);
  } else {
    // vers l'est ou l'ouest : le sentier tourne au pied de la falaise ; la bouche s'ouvre au sud d'un éperon de roche
    // qu'on dresse au bout du sentier, collé à la Chaîne
    const cx = ex - dx * 3, cy = ey;
    for (let j = -1; j <= 2; j++) for (let i = -3; i <= 3; i++) herbe(cx + i, cy + j);
    const eperon = [];
    for (let j = -7; j <= -1; j++) for (let i = -5; i <= 5; i++) { const a = cx + i, b = cy + j; if (FORET(W.get(a, b)) && Math.abs(i) + Math.max(0, -j - 4) <= 6 + bruit(a, b, 2, 77) * 2) eperon.push([a, b]); }
    for (let i = 0; i <= 3; i++) for (let j = -7; j <= 1; j++) { const a = cx + dx * i, b = cy + j; if (FORET(W.get(a, b)) && j < 0) eperon.push([a, b]); }
    massif(W, eperon, { pas: 2, max: 3 });
    B = W.building('cave', cx - 2, cy - 3);
    W.set(cx, cy, T.PATH);
  }
  for (let y = B.y; y < B.y + B.d; y++) for (let x = B.x; x < B.x + B.w; x++) W.setHeight(x, y, 0);
  W.setHeight(B.doorX, B.doorY + 1, 0);
  return B;
}

/** une échelle d'un niveau à l'autre (on la prend en marchant dessus) */
function echelle(m, x, y, to, jour = false) { m.set(x, y, T.CAVE); m.deco.push({ k: jour ? 'echelle_jour' : 'echelle', x, y }); m.warp(x, y, { ...to, step: true }); }

/** cases de sol d'une grotte, par distance (pas) depuis un point */
function distances(m, x0, y0, passe = (t) => t === T.CAVE) {
  const d = new Int32Array(m.w * m.h).fill(-1), q = [[x0, y0]]; d[y0 * m.w + x0] = 0;
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (!m.in(a, b) || d[b * m.w + a] >= 0 || !passe(m.get(a, b))) continue; d[b * m.w + a] = d[y * m.w + x] + 1; q.push([a, b]); } }
  return d;
}

export function grotteDuCol({ W, maps, routes, ENC, trainerNpc }) {
  const route = (id) => routes.find((r) => r.id === id)?.pts?.res;
  const bois = route('bois'), r10 = route('r10');
  if (!bois || !r10) return null;
  const zoneDe = (id) => (x, y) => W.zoneAt(x, y)?.route === id;
  // les deux percées : vers l'est depuis le Bois Murmure, vers le nord depuis la route 10
  const Pw = percee(W, bois.cells, 1, 0, { zone: zoneDe('bois'), min: 6, max: 70 });
  const Ps = percee(W, r10.cells, 0, -1, { zone: zoneDe('r10'), min: 6, max: 70, vers: [260, 600] });
  if (!Pw || !Ps) return { erreur: `percée introuvable (${!Pw ? 'bois' : ''} ${!Ps ? 'r10' : ''})` };
  const Bw = bouche(W, Pw, 1, 0), Bs = bouche(W, Ps, 0, -1);
  // (les zones commencent à la lisière : la bande de la route garde son nom et ses rencontres)
  W.zone(Pw.x + Pw.f0, Bw.y - 2, Bw.x + Bw.w + 1, Pw.y + 3, { name: 'Contreforts du Col', music: 'route', prio: 0, theme: 'forest', ombre: 0.3 });
  W.zone(Bs.x - 4, Bs.y - 2, Bs.x + Bs.w + 3, Ps.y - Ps.f0, { name: 'Contreforts du Col', music: 'route', prio: 0 });
  W.sign(Bw.doorX + 2, Bw.doorY + 2, 'GROTTE DU COL\nElle passe sous la Chaîne Céleste.\nUn lac barre les galeries : il faut savoir nager.');
  W.sign(Bs.doorX + 2, Bs.doorY + 2, 'GROTTE DU COL\n← vers le Bois Murmure, par le lac souterrain.');

  /* ---------- galeries hautes : la grotte et son lac ---------- */
  const m = caveMap('col', 60, 38, 6161, [{ x: 6, y: 33 }, { x: 53, y: 33 }], { name: 'Grotte du Col', via: [{ x: 12, y: 8 }, { x: 24, y: 20 }, { x: 36, y: 10 }, { x: 47, y: 22 }] });
  m.encounter = ENC.grotte; m.surf = true; m.surfEnc = ENC.mer; m.biome = 'grotte';
  // le lac : une bande d'eau du nord au sud qui coupe la grotte en deux (bords qui ondulent)
  for (let y = 1; y < m.h - 1; y++) {
    const a = 27 + Math.round(3 * (bruit(0, y, 6, 6161) - 0.5) * 2), b = 34 + Math.round(3 * (bruit(9, y, 6, 6162) - 0.5) * 2);
    for (let x = a; x <= b; x++) if (m.get(x, y) === T.CAVE || (m.get(x, y) === T.BLOCK && x > a && x < b)) { if (m.get(x, y) === T.BLOCK) { m.deco = m.deco.filter((d) => !(d.x === x && d.y === y)); m.under.delete(x + ',' + y); } m.set(x, y, T.WATER); }
  }
  // de l'eau qui mord les rives : quelques criques
  for (let y = 2; y < m.h - 2; y++) for (let x = 20; x < 42; x++) if (m.get(x, y) === T.CAVE && N4.some(([dx, dy]) => m.get(x + dx, y + dy) === T.WATER) && bruit(x, y, 2.5, 6163) > 0.72) m.set(x, y, T.WATER);
  const portes = [[6, 33, Bw], [53, 33, Bs]];
  for (const [cx, cy, out] of portes) {
    m.set(cx, cy + 1, T.CAVEDOOR); m.set(cx, cy, T.CAVE); m.set(cx, cy + 2, T.CAVEWALL);
    m.warp(cx, cy + 1, { map: 'monde', x: out.doorX, y: out.doorY + 1, dir: 'down' });
    W.warp(out.doorX, out.doorY, { map: 'col', x: cx, y: cy, dir: 'up' });
    m.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
  }
  maps.col = m;
  // chaque rive reste d'un seul tenant : ce qu'on n'atteint pas à pied depuis sa porte redevient roche
  const dO = distances(m, 6, 33), dE = distances(m, 53, 33);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.CAVE && dO[y * m.w + x] < 0 && dE[y * m.w + x] < 0) {
    // une poche au bord du lac reste (on y accoste en surfant)
    if (!N4.some(([dx, dy]) => m.get(x + dx, y + dy) === T.WATER)) m.set(x, y, T.CAVEWALL);
  }
  const loin = (d, xmin, xmax) => { let best = null, bd = -1; for (let y = 3; y < m.h - 3; y++) for (let x = xmin; x <= xmax; x++) { const v = d[y * m.w + x]; if (v > bd && m.get(x, y) === T.CAVE && N4.filter(([a, b]) => m.get(x + a, y + b) === T.CAVE).length >= 2 && !m.warpAt(x, y)) { bd = v; best = [x, y]; } } return best; };
  const sol = (d, x, y, min = 4) => { for (let r = 0; r < 12; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const a = x + i, b = y + j; if (m.get(a, b) === T.CAVE && d[b * m.w + a] >= min && !m.warpAt(a, b) && !m.npcs.some((n) => n.x === a && n.y === b) && !m.items.some((q) => q.x === a && q.y === b) && N4.filter(([u, v]) => m.get(a + u, b + v) === T.CAVE).length >= 3) return [a, b]; } return null; };
  // l'échelle vers la galerie profonde : au fond de la rive ouest
  const [lx, ly] = loin(dO, 2, 24);
  // dresseurs et objets : rive ouest (on y vient avec un badge), rive est (avec cinq)
  const tr = (d, x, y, dir, cls, name, team, id) => { const p = sol(d, x, y); if (p) trainerNpc(m, p[0], p[1], dir, cls, name, team, { id, sight: 3 }); };
  tr(dO, 14, 14, 'right', 'Montagnard', 'Gaston', [[1026, 12], [74, 13]], 'col:d0');
  tr(dO, 20, 28, 'left', 'Randonneuse', 'Odile', [[41, 12], [1024, 13], [1028, 13]], 'col:d1');
  tr(dE, 44, 14, 'left', 'Montagnard', 'Armand', [[75, 36], [1028, 37], [95, 37]], 'col:d2');
  tr(dE, 50, 26, 'down', 'Topdresseuse', 'Céleste', [[42, 37], [1044, 37]], 'col:d3');
  const obj = (d, x, y, item, id) => { const p = sol(d, x, y, 6); if (p) m.item(p[0], p[1], item, 1, id); };
  obj(dO, 8, 6, 'great-ball', 'col:o0'); obj(dO, 18, 22, 'escape-rope', 'col:o1');
  obj(dE, 52, 6, 'ultra-ball', 'col:o2'); obj(dE, 40, 30, 'hyper-potion', 'col:o3');
  // sur le lac, un îlot de roche où dort un objet (on y accoste en surfant)
  { let ilot = null; for (let y = 6; y < m.h - 6 && !ilot; y++) for (let x = 29; x <= 32; x++) if (m.get(x, y) === T.WATER && m.get(x + 1, y) === T.WATER && m.get(x, y + 1) === T.WATER && m.get(x + 1, y + 1) === T.WATER && m.get(x - 1, y) === T.WATER && m.get(x + 2, y) === T.WATER && m.get(x, y - 1) === T.WATER && m.get(x, y + 2) === T.WATER && y > 12) { ilot = [x, y]; break; }
    if (ilot) { const [x, y] = ilot; m.set(x, y, T.CAVE); m.set(x + 1, y, T.CAVE); m.set(x, y + 1, T.CAVE); m.set(x + 1, y + 1, T.CAVE); m.item(x + 1, y, 'max-repel', 1, 'col:o4'); } }

  /* ---------- galerie profonde : dans le noir, un éboulement à pousser ---------- */
  const m2 = caveMap('col2', 44, 30, 6262, [{ x: 5, y: 25 }], { name: 'Grotte du Col — galerie profonde', dark: true, via: [{ x: 14, y: 8 }, { x: 28, y: 18 }, { x: 36, y: 8 }] });
  m2.encounter = ENC.grotte; m2.biome = 'grotte';
  echelle(m, lx, ly, { map: 'col2', x: 5, y: 24, dir: 'down' });
  { const [ax, ay] = N4.map(([a, b]) => [lx + a, ly + b]).find(([a, b]) => m.get(a, b) === T.CAVE) || [lx, ly + 1];
    echelle(m2, 5, 25, { map: 'col', x: ax, y: ay, dir: 'down' }, true); }
  // la salle du trésor, au nord-est, fermée par un boyau où l'éboulement est tombé (Force)
  const sx0 = 34, sy0 = 2, sx1 = 40, sy1 = 6, bxc = 37;
  for (let y = sy0 - 1; y <= sy1 + 1; y++) for (let x = sx0 - 1; x <= sx1 + 1; x++) { m2.set(x, y, T.CAVEWALL); m2.deco = m2.deco.filter((d) => !(d.x === x && d.y === y)); }
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) m2.set(x, y, T.CAVE);
  const d2 = distances(m2, 5, 24);
  let by = sy1 + 1; while (by < m2.h - 2 && !(m2.get(bxc, by) === T.CAVE && d2[by * m2.w + bxc] >= 0)) { m2.set(bxc, by, T.CAVE); m2.deco = m2.deco.filter((d) => !(d.x === bxc && d.y === by)); by++; }
  // le boyau : un rocher à pousser vers le nord, dans la salle
  m2.set(bxc, sy1 + 1, T.CAVE); m2.set(bxc, sy1 + 2, T.BOULDER);
  for (const x of [bxc - 1, bxc + 1]) for (let y = sy1 + 1; y <= sy1 + 2; y++) if (m2.get(x, y) === T.CAVE) m2.set(x, y, T.CAVEWALL);
  m2.item(sx1, sy0, 'moon-stone', 1, 'col:o5'); m2.item(sx0, sy0, 'hard-stone', 1, 'col:o6');
  { const dd = distances(m2, 5, 24); let best = null, bd = -1; for (let y = 3; y < m2.h - 3; y++) for (let x = 3; x < 30; x++) { const v = dd[y * m2.w + x]; if (v > bd && m2.get(x, y) === T.CAVE && N4.filter(([a, b]) => m2.get(x + a, y + b) === T.CAVE).length >= 3) { bd = v; best = [x, y]; } }
    if (best) trainerNpc(m2, best[0], best[1], 'left', 'Montagnard', 'Fernand', [[1026, 15], [1028, 15], [95, 16]], { id: 'col:d4', sight: 3, intro: 'Tu as de la lumière ? Moi, je me guide au bruit des gouttes.' });
    const q = []; for (let y = 3; y < m2.h - 3; y++) for (let x = 3; x < m2.w - 3; x++) if (m2.get(x, y) === T.CAVE && dd[y * m2.w + x] > 12 && N4.filter(([a, b]) => m2.get(x + a, y + b) === T.CAVE).length === 1) q.push([x, y]);
    // un objet caché au bout d'une impasse de la galerie (on le trouve en fouillant la roche qui la ferme)
    if (q.length) { const [x, y] = q[Math.floor(bruit(3, 7, 1.3, 6263) * q.length) % q.length]; const [ox, oy] = N4.map(([a, b]) => [x + a, y + b]).find(([a, b]) => m2.get(a, b) === T.CAVEWALL) || []; if (ox != null) cacher(m2, ox, oy, 'col:c0', 'super-potion'); } }
  maps.col2 = m2;
  for (const q of [m, m2]) q.outside = { map: 'monde', x: Bw.doorX, y: Bw.doorY + 1 };
  return { ouest: [Bw.doorX, Bw.doorY], sud: [Bs.doorX, Bs.doorY], echelle: [lx, ly] };
}

/**
 * Une grotte creusée dans la falaise d'une mesa, au bord du sentier d'une route (la Grotte des Sables, route 16) : des
 * galeries hautes avec deux dresseurs et deux objets, une échelle vers une galerie profonde plongée dans le noir (Flash)
 * où un rocher à pousser (Force) garde une salle et son trésor, plus un objet caché. Cul-de-sac : on ressort par où
 * l'on est entré. o : { route, id, nom, graine, dresseurs: [[classe, nom, [[espèce, niveau]…]]…], objets: [haut, haut,
 * salle, salle], cache }.
 */
export function grotteDansFalaise({ W, maps, ENC, trainerNpc }, o) {
  const R = maps && (o.routes || []).find((r) => r.id === o.route)?.pts?.res; if (!R) return null;
  // la bouche : une case du sentier (ou de sa bande) sous une falaise franche de deux niveaux au moins, au milieu de la route
  let best = null, bd = 1e9;
  if (!o.percee) for (const k of R.cells) {
    const [x, y] = k.split(',').map(Number), t = W.get(x, y);
    if (![T.GRASS, T.PATH, T.SAND].includes(t) || W.zoneAt(x, y)?.route !== o.route) continue;
    const h = W.height(x, y); let ok = true;
    for (let j = 1; j <= 3 && ok; j++) for (let i = -2; i <= 2; i++) if (W.get(x + i, y - j) !== T.CAVEWALL || W.height(x + i, y - j) < h + 2) { ok = false; break; }
    if (!ok || ![-1, 1].every((i) => [T.GRASS, T.PATH, T.SAND, T.FLOWER].includes(W.get(x + i, y)) && W.height(x + i, y) === h)) continue;
    if (!walkable(W.get(x, y + 1)) || W.npcs.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) < 4) || W.items.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) < 3) || W.signs.has((x + 2) + ',' + (y + 1))) continue;
    const d = Math.abs(x - (R.pts[Math.floor(R.pts.length / 2)][0])) + Math.abs(y - (R.pts[Math.floor(R.pts.length / 2)][1]));
    if (d < bd) { bd = d; best = [x, y, h]; }
  }
  let B;
  if (best) {
    const [bx, by, bh] = best;
    B = W.building('cave', bx - 2, by - 3);
    for (let y = B.y; y < B.y + B.d; y++) for (let x = B.x; x < B.x + B.w; x++) W.setHeight(x, y, bh);
  } else if (o.percee) {
    // pas de falaise au bord du sentier : une percée tout droit à travers la forêt jusqu'à la roche (comme le Col)
    const [dx, dy] = o.percee, P = percee(W, R.cells, dx, dy, { zone: (x, y) => W.zoneAt(x, y)?.route === o.route, min: 5, max: 60 });
    if (!P) return null;
    B = bouche(W, P, dx, dy);
  } else return null;
  if ([T.GRASS, T.FLOWER, T.SAND].includes(W.get(B.doorX + 2, B.doorY + 2))) W.sign(B.doorX + 2, B.doorY + 2, `${o.nom.toUpperCase()}\n${o.panneau || 'Galeries creusées dans la roche.'}`);
  const id = o.id, enc = (o.enc || ENC[o.route] || ENC.grotte || []).map(([sp, a, b, p]) => [sp, a, b, p]);
  // galeries hautes
  const m = caveMap(id, 48, 32, o.graine, [{ x: 24, y: 27 }], { name: o.nom, via: [{ x: 8, y: 20 }, { x: 10, y: 6 }, { x: 24, y: 12 }, { x: 40, y: 6 }, { x: 38, y: 22 }] });
  m.encounter = enc; m.biome = 'terre';
  m.set(24, 28, T.CAVEDOOR); m.set(24, 27, T.CAVE); m.set(24, 29, T.CAVEWALL);
  m.warp(24, 28, { map: 'monde', x: B.doorX, y: B.doorY + 1, dir: 'down' });
  W.warp(B.doorX, B.doorY, { map: id, x: 24, y: 27, dir: 'up' });
  m.deco.push({ k: 'exitlight', x: 24, y: 28 });
  const d1 = distances(m, 24, 27), loin = (d, f) => { const L = []; for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE && d[y * m.w + x] > 5 && N4.filter(([a, b]) => m.get(x + a, y + b) === T.CAVE).length >= 3 && !m.npcs.some((n) => n.x === x && n.y === y) && !m.items.some((q) => q.x === x && q.y === y)) L.push([x, y, d[y * m.w + x]]); L.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]); return L[Math.min(L.length - 1, Math.floor(f * (L.length - 1)))]; };
  const [lx, ly] = loin(d1, 1);
  (o.dresseurs || []).slice(0, 2).forEach(([cls, nom, team], k) => { const p = loin(d1, 0.35 + k * 0.35); if (p) trainerNpc(m, p[0], p[1], ['left', 'down'][k], cls, nom, team, { id: `${id}:d${k}`, sight: 3 }); });
  (o.objets || []).slice(0, 2).forEach((it, k) => { const p = loin(d1, 0.2 + k * 0.5); if (p) m.item(p[0], p[1], it, 1, `${id}:o${k}`); });
  // galerie profonde, dans le noir
  const m2 = caveMap(id + '2', 40, 28, o.graine + 1, [{ x: 5, y: 23 }], { name: o.nom + ' — galerie profonde', dark: true, via: [{ x: 14, y: 8 }, { x: 26, y: 18 }, { x: 24, y: 6 }] });
  m2.encounter = enc; m2.biome = 'terre';
  echelle(m, lx, ly, { map: id + '2', x: 5, y: 22, dir: 'down' });
  { const [ax, ay] = N4.map(([a, b]) => [lx + a, ly + b]).find(([a, b]) => m.get(a, b) === T.CAVE) || [lx, ly + 1]; echelle(m2, 5, 23, { map: id, x: ax, y: ay, dir: 'down' }, true); }
  // la salle du trésor, au nord-est, derrière un boyau et son rocher (Force)
  const sx0 = 30, sy0 = 2, sx1 = 36, sy1 = 6, bxc = 33;
  for (let y = sy0 - 1; y <= sy1 + 1; y++) for (let x = sx0 - 1; x <= sx1 + 1; x++) { m2.set(x, y, T.CAVEWALL); m2.deco = m2.deco.filter((d) => !(d.x === x && d.y === y)); }
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) m2.set(x, y, T.CAVE);
  const dd = distances(m2, 5, 22);
  let yy = sy1 + 1; while (yy < m2.h - 2 && !(m2.get(bxc, yy) === T.CAVE && dd[yy * m2.w + bxc] >= 0)) { m2.set(bxc, yy, T.CAVE); m2.deco = m2.deco.filter((d) => !(d.x === bxc && d.y === yy)); yy++; }
  m2.set(bxc, sy1 + 1, T.CAVE); m2.set(bxc, sy1 + 2, T.BOULDER);
  for (const x of [bxc - 1, bxc + 1]) for (let y = sy1 + 1; y <= sy1 + 2; y++) if (m2.get(x, y) === T.CAVE) m2.set(x, y, T.CAVEWALL);
  (o.objets || []).slice(2, 4).forEach((it, k) => m2.item(k ? sx0 : sx1, sy0, it, 1, `${id}:o${k + 2}`));
  { const dz = distances(m2, 5, 22), q = []; for (let y = 3; y < m2.h - 3; y++) for (let x = 3; x < m2.w - 3; x++) if (m2.get(x, y) === T.CAVE && dz[y * m2.w + x] > 10 && N4.filter(([a, b]) => m2.get(x + a, y + b) === T.CAVE).length === 1) q.push([x, y]);
    if (q.length && o.cache) { const [x, y] = q[Math.floor(q.length / 2)]; const r = N4.map(([a, b]) => [x + a, y + b]).find(([a, b]) => m2.get(a, b) === T.CAVEWALL); if (r) cacher(m2, r[0], r[1], `${id}:c0`, o.cache); } }
  for (const q of [m, m2]) { q.outside = { map: 'monde', x: B.doorX, y: B.doorY + 1 }; maps[q.id] = q; }
  return { bouche: [B.doorX, B.doorY], echelle: [lx, ly] };
}
