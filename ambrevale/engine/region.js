// Génération de la région d'Ambrevale (monde extérieur), déterministe.
// Forêt partout par défaut, puis on creuse villes et routes, on pose les reliefs, l'eau et les bâtiments.

import { GameMap, GR, OB, addBuilding } from './world.js';
import { TOWNS_DATA, placeRouteStuff } from './towns.js';

export const WORLD_W = 240, WORLD_H = 200;

// ---- bruit ----
function hash2(x, y, s) { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sm = (t) => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 1) { return vnoise(x / 6, y / 6, s) * 0.6 + vnoise(x / 2.5, y / 2.5, s + 7) * 0.3 + vnoise(x, y, s + 13) * 0.1; }

function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L));
  return [Math.hypot(px - ax - vx * t, py - ay - vy * t), t];
}
function distPoly(px, py, pts) {
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [d, t] = distSeg(px, py, ...pts[i], ...pts[i + 1]); if (d < best) { best = d; bi = i; bt = t; } }
  return [best, bi + bt];
}

export function buildWorld() {
  const M = new GameMap('world', WORLD_W, WORLD_H, { outdoor: true, name: 'Ambrevale', music: 'route', fill: GR.GRASS });
  M.interiors = {};
  const routeMask = new Uint8Array(M.w * M.h);   // 1 = couloir de route (pour les hautes herbes)
  const pathMask = new Uint8Array(M.w * M.h);    // 1 = chemin de terre
  const snowy = (x, y) => y < 47 && x < 100;

  // ---------------- 1. fond : forêt dense, neige au nord-ouest, roche au nord-est, mer à l'est et au sud
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    const n = fbm(x, y, 3);
    if (snowy(x, y)) { M.setG(x, y, GR.SNOW); M.setO(x, y, n > 0.42 ? OB.SNOWPINE : OB.PINE); }
    else if (y < 40 && x >= 100) { M.setG(x, y, GR.ROCKY); M.setO(x, y, n > 0.55 ? OB.PINE : OB.TREE); }
    else { M.setG(x, y, n > 0.62 ? GR.DARKGRASS : GR.GRASS); M.setO(x, y, OB.TREE); }
  }
  // mer à l'est (avec plage) et au sud du village de départ
  for (let y = 38; y < M.h; y++) for (let x = 212; x < M.w; x++) {
    const coast = 227 + Math.round((fbm(0, y, 9) - 0.5) * 4);
    if (x >= coast) { M.setG(x, y, GR.WATER); M.setO(x, y, OB.NONE); }
    else if (x >= coast - 4 && y > 78) { M.setG(x, y, GR.SAND); if (M.o(x, y) === OB.TREE) M.setO(x, y, hash2(x, y, 4) < 0.18 ? OB.PALM : OB.NONE); }
  }
  for (let y = 186; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    const coast = 196 + Math.round((fbm(x, 0, 11) - 0.5) * 3);
    if (y >= coast && x > 70 && x < 230) { M.setG(x, y, GR.WATER); M.setO(x, y, OB.NONE); }
    else if (y >= coast - 2 && x > 92 && x < 142) { M.setG(x, y, GR.SAND); M.setO(x, y, OB.NONE); }
  }

  // ---------------- 2. reliefs (plateaux décoratifs, falaises)
  const plateau = (cx, cy, rx, ry, h, top = null, seed = 1) => {
    for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
      if (!M.inb(x, y)) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (fbm(x, y, seed) - 0.5) * 0.5;
      if (d < 1) { M.setE(x, y, Math.max(M.e(x, y), h)); if (top) M.setG(x, y, top); }
    }
  };
  plateau(106, 112, 9, 4, 1, null, 2);
  plateau(78, 52, 12, 3.5, 1, null, 5);
  plateau(84, 74, 10, 3, 2, null, 6);
  plateau(26, 96, 8, 10, 1, null, 7);
  plateau(140, 98, 10, 8, 1, null, 8);
  plateau(90, 100, 8, 6, 2, null, 9);
  plateau(200, 100, 6, 9, 1, null, 10);
  // massif central (traversé par la Grotte Cendrée)
  for (let y = 108; y < 158; y++) for (let x = 144; x < 192; x++) {
    const d = Math.max(Math.abs(x - 167.5) / 23, Math.abs(y - 132) / 24) + (fbm(x, y, 12) - 0.5) * 0.25;
    if (d < 1) { M.setE(x, y, d < 0.55 ? 3 : d < 0.8 ? 2 : 1); M.setG(x, y, GR.ROCKY); M.setO(x, y, hash2(x, y, 1) < 0.1 ? OB.PINE : hash2(x, y, 2) < 0.05 ? OB.ROCK : OB.NONE); }
  }
  // montagnes du nord-est (derrière le Plateau des Champions)
  for (let y = 0; y < 44; y++) for (let x = 206; x < M.w; x++) {
    if (x > 206 + fbm(x, y, 13) * 6) { M.setE(x, y, x > 215 ? 3 : 2); M.setG(x, y, GR.ROCKY); M.setO(x, y, hash2(x, y, 3) < 0.08 ? OB.PINE : OB.NONE); }
  }
  // chaînes enneigées entre les routes du nord
  plateau(80, 34, 10, 6, 2, GR.SNOW, 14);
  plateau(20, 40, 6, 5, 1, GR.SNOW, 15);
  plateau(150, 36, 9, 3, 1, null, 16);

  // ---------------- 3. outils de creusement
  const clear = (x, y, g) => { if (!M.inb(x, y)) return; M.setE(x, y, 0); M.setO(x, y, OB.NONE); if (g != null) M.setG(x, y, g); };
  const rect = (x0, y0, x1, y1, g) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) clear(x, y, g); };
  const ground = (x0, y0, x1, y1, g) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (M.inb(x, y)) M.setG(x, y, g); };
  const ellipse = (cx, cy, rx, ry, fn) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) fn(x, y); };

  /** couloir de route : contours irréguliers, sol de base, chemin au milieu, herbes hautes, décor */
  function route(o) {
    const pts = o.pts, W = o.w ?? 11, base = o.ground ?? GR.GRASS, path = o.path ?? GR.PATH, tall = o.tall ?? GR.TALL;
    const seed = o.seed ?? pts[0][0] * 7 + pts[0][1];
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const m = W / 2 + 3;
    for (let y = Math.floor(miny - m); y <= maxy + m; y++) for (let x = Math.floor(minx - m); x <= maxx + m; x++) {
      if (!M.inb(x, y)) continue;
      const [d, t] = distPoly(x, y, pts);
      const half = W / 2 + (fbm(x, y, seed) - 0.5) * 3.2;
      if (d > half) continue;
      const g0 = M.g(x, y);
      if (g0 === GR.WATER && !o.overWater) continue;
      clear(x, y, g0 === GR.SAND && base === GR.GRASS ? GR.SAND : base);
      routeMask[M.i(x, y)] = 1;
      // chemin de terre qui serpente
      const wob = (fbm(t * 9, 0, seed + 1) - 0.5) * (o.wobble ?? 3);
      if (o.path !== false && Math.abs(d - Math.abs(wob)) < (o.pathW ?? 1.3) && d < half - 1.5) { M.setG(x, y, path); pathMask[M.i(x, y)] = 1; }
    }
    // hautes herbes en taches, et bandes qui barrent la route
    if (tall != null) {
      for (let y = Math.floor(miny - m); y <= maxy + m; y++) for (let x = Math.floor(minx - m); x <= maxx + m; x++) {
        if (!M.inb(x, y) || !routeMask[M.i(x, y)] || pathMask[M.i(x, y)]) continue;
        if (M.g(x, y) !== base) continue;
        const n = fbm(x * 1.6, y * 1.6, seed + 5);
        if (n > (o.grassT ?? 0.56)) M.setG(x, y, tall);
      }
      for (const bt of o.bands || []) {
        const fi = bt * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(fi)), f = fi - i0;
        const cx = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f, cy = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f;
        const vert = Math.abs(pts[i0 + 1][1] - pts[i0][1]) > Math.abs(pts[i0 + 1][0] - pts[i0][0]);
        const bw = o.bandW ?? 3;
        for (let y = Math.round(cy - (vert ? bw : W)); y <= cy + (vert ? bw : W); y++) for (let x = Math.round(cx - (vert ? W : bw)); x <= cx + (vert ? W : bw); x++)
          if (M.inb(x, y) && routeMask[M.i(x, y)] && M.o(x, y) === OB.NONE && hash2(x, y, 77) > 0.08) M.setG(x, y, tall);
      }
    }
    // décor épars dans le couloir
    for (let y = Math.floor(miny - m); y <= maxy + m; y++) for (let x = Math.floor(minx - m); x <= maxx + m; x++) {
      if (!M.inb(x, y) || !routeMask[M.i(x, y)] || pathMask[M.i(x, y)]) continue;
      const [d] = distPoly(x, y, pts);
      if (d < 2.5) continue;
      const r = hash2(x, y, seed + 9);
      if (r < (o.trees ?? 0.025)) M.setO(x, y, o.treeObj ?? OB.TREE);
      else if (r < (o.trees ?? 0.025) + (o.rocks ?? 0.006)) M.setO(x, y, OB.ROCK);
      else if (r < 0.06 && M.g(x, y) === base && base === GR.GRASS) M.setG(x, y, GR.FLOWER);
    }
  }
  function ledge(x0, x1, y) { for (let x = x0; x <= x1; x++) if (M.inb(x, y) && M.walkable(x, y) && M.walkable(x, y + 1) && M.g(x, y) !== GR.WATER) { M.ledge[M.i(x, y)] = 1; if (M.g(x, y) === GR.TALL) M.setG(x, y, GR.GRASS); } }
  function pond(cx, cy, rx, ry, sandRim = false) {
    ellipse(cx, cy, rx + 1.2, ry + 1.2, (x, y) => { if (sandRim) clear(x, y, GR.SAND); });
    ellipse(cx, cy, rx, ry, (x, y) => clear(x, y, GR.WATER));
  }

  // ---------------- 4. villes (rectangles dégagés + plan détaillé dans towns.js)
  const towns = {};
  for (const T of TOWNS_DATA) {
    const r = T.rect;
    // contour un peu organique : on dégage le rectangle et on laisse quelques arbres aux coins
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) {
      const edge = Math.min(x - r[0], r[2] - x, y - r[1], r[3] - y);
      if (edge === 0 && hash2(x, y, 31) < 0.55) { M.setE(x, y, 0); M.setO(x, y, T.edgeObj ?? OB.TREE); M.setG(x, y, T.base); continue; }
      clear(x, y, T.base);
    }
    towns[T.id] = T;
  }

  // ---------------- 5. routes
  const R = [];
  // Route 1 : Hameau des Brumes -> Roc-Marbre
  R.push({ id: 'r1', name: 'Route 1', pts: [[117, 171], [113, 165], [119, 158], [115, 151], [118, 144]], w: 12, bands: [0.25, 0.7], seed: 101 });
  // Route 2 (prairie) puis Bois Murmurant
  R.push({ id: 'r2', name: 'Route 2', pts: [[101, 131], [94, 128], [86, 132]], w: 11, bands: [0.5], seed: 102 });
  R.push({ id: 'bois', name: 'Bois Murmurant', pts: [[87, 132], [82, 127], [76, 134], [70, 128], [65, 133], [60, 131]], w: 7, ground: GR.DARKGRASS, path: GR.PATH, grassT: 0.47, trees: 0.06, seed: 103, wobble: 2 });
  // Route 3 : Jardibourg -> Brumecourt
  R.push({ id: 'r3', name: 'Route 3', pts: [[44, 116], [39, 108], [48, 99], [41, 90], [46, 82], [44, 77]], w: 13, bands: [0.35, 0.8], seed: 104 });
  // Route 4 : Brumecourt -> Volteville
  R.push({ id: 'r4', name: 'Route 4', pts: [[63, 63], [70, 60], [78, 66], [87, 61], [94, 65], [99, 63]], w: 11, bands: [0.45], seed: 105, rocks: 0.02 });
  // Route 10 : Volteville -> Roc-Marbre
  R.push({ id: 'r10', name: 'Route 10', pts: [[120, 80], [125, 89], [115, 99], [122, 109], [118, 118]], w: 11, bands: [0.3, 0.75], seed: 110 });
  // Route 5 : Volteville -> Port-Azur, par le Lac Miroir
  R.push({ id: 'r5', name: 'Route 5', pts: [[143, 63], [152, 61], [166, 64], [180, 61], [194, 63]], w: 15, bands: [0.12, 0.88], seed: 106, overWater: false });
  // Route 6 : la plage, Port-Azur -> Forgeval
  R.push({ id: 'r6', name: 'Route 6', pts: [[210, 80], [205, 91], [214, 103], [207, 112], [210, 118]], w: 15, bands: [0.55], seed: 107, trees: 0.012 });
  // Route 11 : Roc-Marbre -> Grotte Cendrée -> Forgeval
  R.push({ id: 'r11', name: 'Route 11', pts: [[137, 131], [143, 133], [148, 134]], w: 9, seed: 111, tall: null });
  R.push({ id: 'r11b', name: 'Route 11', pts: [[186, 134], [190, 133], [193, 133]], w: 9, seed: 112, tall: null, ground: GR.ASH, path: GR.PATH });
  // Route 7 : col enneigé, Brumecourt -> Givrecime
  R.push({ id: 'r7', name: 'Route 7', pts: [[44, 50], [37, 45], [50, 40], [44, 33]], w: 11, ground: GR.SNOW, path: GR.SNOWPATH, tall: GR.SNOWTALL, treeObj: OB.SNOWPINE, seed: 108 });
  // Route 8 : Givrecime -> Cité Draconique
  R.push({ id: 'r8', name: 'Route 8', pts: [[63, 20], [71, 15], [81, 24], [91, 17], [100, 20]], w: 11, ground: GR.SNOW, path: GR.SNOWPATH, tall: GR.SNOWTALL, treeObj: OB.SNOWPINE, bands: [0.5], seed: 109 });
  // Route 9 : Route Victoire
  R.push({ id: 'r9', name: 'Route Victoire', pts: [[139, 20], [146, 14], [155, 26], [164, 15], [172, 20]], w: 10, ground: GR.ROCKY, path: GR.PATH, grassT: 0.6, rocks: 0.05, trees: 0.015, treeObj: OB.PINE, seed: 113 });
  for (const r of R) route(r);

  // reprise des neiges de la route 8 vers la roche
  for (let y = 0; y < 36; y++) for (let x = 86; x < 101; x++) if (M.g(x, y) === GR.SNOW && hash2(x, y, 5) < (x - 86) / 15) M.setG(x, y, GR.ROCKY);

  // Lac Miroir et grand pont de bois
  pond(167, 63, 13, 9, true);
  for (let x = 153; x <= 182; x++) for (let y = 62; y <= 64; y++) { clear(x, y, GR.BRIDGE); }
  for (let x = 152; x <= 183; x++) { for (const y of [61, 65]) if (M.g(x, y) === GR.WATER) { /* bords du pont : rampes */ M.setO(x, y, OB.NONE); } }
  // étangs
  pond(53, 104, 3.2, 2.4);
  pond(31, 87, 2.6, 2);
  pond(126, 95, 2.2, 1.8);

  // corniches (on saute vers le sud)
  ledge(109, 116, 161); ledge(119, 124, 154);
  ledge(37, 43, 95); ledge(45, 52, 106);
  ledge(70, 76, 64); ledge(84, 90, 63);
  ledge(116, 124, 104);
  ledge(148, 152, 21); ledge(158, 163, 20);

  // entrées de la Grotte Cendrée : encoches dans le massif, face sud
  for (const [ex, ey0, ey1] of [[149, 128, 135], [185, 128, 135]]) {
    for (let y = ey0; y <= ey1; y++) for (let x = ex - 1; x <= ex + 1; x++) clear(x, y, y === ey0 ? GR.CAVE : GR.ROCKY);
    rect(ex - 3, ey0 + 4, ex + 3, ey1 + 1, GR.ROCKY);
  }
  // relie l'encoche ouest à la route 11
  rect(143, 132, 150, 136, GR.ROCKY);
  rect(184, 132, 192, 136, GR.ASH);
  M.decor.push({ kind: 'cavemouth', x: 149, y: 127 }, { kind: 'cavemouth', x: 185, y: 127 });
  M.addWarp(149, 128, { map: 'grotte', x: 3, y: 17, dir: 'up', kind: 'cave' });
  M.addWarp(185, 128, { map: 'grotte', x: 56, y: 17, dir: 'up', kind: 'cave' });
  // Antre d'Ambre (après la Ligue)
  rect(199, 13, 203, 18, GR.ROCKY);
  for (let x = 200; x <= 202; x++) for (let y = 10; y <= 12; y++) { M.setE(x, y, 2); M.setG(x, y, GR.ROCKY); M.setO(x, y, OB.NONE); }
  clear(201, 13, GR.CAVE);
  M.decor.push({ kind: 'cavemouth', x: 201, y: 12 });
  M.addWarp(201, 13, { map: 'antre', x: 9, y: 16, dir: 'up', kind: 'cave' });

  // ---------------- 6. plans détaillés des villes (bâtiments, rues, PNJ)
  const api = { M, clear, rect, ground, ellipse, pond, hash2, ledge, addBuilding: (b) => addBuilding(M, b) };
  for (const T of TOWNS_DATA) T.build(api, T);
  placeRouteStuff(api);

  // ---------------- 7. zones (noms, musique, rencontres)
  for (const T of TOWNS_DATA) M.areas.push({ id: T.id, name: T.name, x0: T.rect[0], y0: T.rect[1], x1: T.rect[2], y1: T.rect[3], music: T.music || 'town', town: true, mist: T.mist, fly: T.fly });
  for (const r of R) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const [x, y] of r.pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const pad = Math.ceil((r.w ?? 11) / 2) + 2;
    M.areas.push({ id: r.id, name: r.name, x0: minx - pad, y0: miny - pad, x1: maxx + pad, y1: maxy + pad, music: r.id === 'bois' ? 'forest' : r.id.startsWith('r7') || r.id.startsWith('r8') ? 'snow' : 'route', mist: r.id === 'bois' ? 0.35 : 0 });
  }
  M.areas.push({ id: 'lac', name: 'Lac Miroir', x0: 150, y0: 50, x1: 185, y1: 76, music: 'route' });

  // nettoyage : aucun arbre sur une case de chemin, ni d'objet sur l'eau
  for (let i = 0; i < M.w * M.h; i++) {
    const g = M.ground[i];
    if (g === GR.WATER) { M.obj[i] = OB.NONE; M.elev[i] = 0; }
    if (M.elev[i] > 0 && (M.obj[i] === OB.TREE) && hash2(i, 0, 3) < 0.6) M.obj[i] = OB.NONE;
  }
  M.routeMask = routeMask;
  return M;
}
