// odyssee/js/render/grottes.js — entrées et sorties des grottes en pixel art, dessinées au chargement (style HeartGold /
// SoulSilver) : l'arche de roche autour de la bouche ; dehors elle s'ouvre sur le noir, dedans sur la lumière du jour.

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 974711) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** teintes de la roche (du contour au plus clair) selon le biome des plateaux (bioDehors de world3d.js) */
const ROCHES = {
  montagne: ['#232126', '#4a464b', '#6a6567', '#8a8482', '#aca59f', '#cdc5bc'],
  terre: ['#271a12', '#563d2c', '#76573e', '#957150', '#b58f6c', '#d2ad88'],
  magma: ['#2e140e', '#66301f', '#8a4630', '#ab5f40', '#c87c55', '#e29c70'],
  glace: ['#2e3a4a', '#5a6c80', '#7c90a4', '#9eb2c4', '#c2d2de', '#e4ecf2'],
  mer: ['#1c2830', '#3a4c58', '#566a76', '#748c96', '#96aeb6', '#bccdd2'],
};

/** arche de la bouche d'une grotte (48 × 40 px, une case et demie de large) : couronne de pierres festonnée,
 *  pieds évasés, rebord éclairé en haut à gauche, intérieur qui plonge dans le noir, sol bleuté au fond.
 *  jour : vue de dedans, l'ouverture laisse passer la lumière du dehors (tramée vers les bords) */
export function archeGrotte(bio = 'montagne', jour = false, pal = null) {
  const P = pal || ROCHES[bio] || ROCHES.montagne, W = 48, H = 40, cx = 24;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  // silhouette extérieure : dôme qui suit la voûte (bossué pierre par pierre), puis pieds qui s'évasent
  const lump = (x) => (hash(Math.floor((x + 1) / 4), 9, 5) < 0.5 ? 1 : 0);
  const outer = (y, x) => {
    const yy = y + lump(x);
    return yy < 4 ? -1 : yy < 19 ? 17 * Math.sqrt(Math.max(0, 1 - ((19 - yy) / 15) ** 2)) : 17 + (y - 19) * 0.3;
  };
  // ouverture : demi-ellipse puis bords presque droits ; haut de l'ouverture à y = 12
  const inner = (y) => (y < 12 ? -1 : y < 22 ? 9 * Math.sqrt(Math.max(0, 1 - ((22 - y) / 10) ** 2)) : 9 + (y - 22) * 0.1);
  // pierres : rochers arrondis (Voronoï sur une grille de 5 px décalée au hasard) ; chaque pixel prend le rocher le plus proche
  const seeds = [];
  for (let j = -1; j < H / 5 + 1; j++) for (let i = -1; i < W / 5 + 1; i++) seeds.push([i * 5 + 1 + hash(i, j, 11) * 3.5, j * 5 + 1 + hash(i, j, 12) * 3.5, hash(i, j, 13)]);
  const near = (x, y) => {
    let b = 0, d1 = 1e9, d2 = 1e9;
    for (let s = 0; s < seeds.length; s++) {
      const q = seeds[s], d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
      if (d < d1) { d2 = d1; d1 = d; b = s; } else if (d < d2) d2 = d;
    }
    return [b, Math.sqrt(d2) - Math.sqrt(d1)];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, ow = outer(y, x);
    if (ow < 0 || Math.abs(dx) > ow) continue;
    const iw = inner(y);
    if (iw >= 0 && Math.abs(dx) < iw) {
      // intérieur : du brun-noir sous la voûte au noir ; au fond, le sol de la grotte bleuté
      const deep = y - 12 - (iw < 8 ? 0 : 0);
      let col = '#0a0807';
      if (jour) {
        // lumière du jour : blanc doré au centre, tramée vers les bords de l'ouverture
        const f = (iw - Math.abs(dx)) / iw, bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y % 4) * 4 + (x % 4)] / 16;
        col = f > 0.55 && deep > 3 ? '#fff8e0' : f > 0.3 + bay * 0.25 && deep > 2 ? '#f4dc9a' : f > bay * 0.3 && deep > 1 ? '#a8885a' : P[0];
        if (y >= H - 3) col = f > 0.4 ? '#c8e0a0' : '#8aa870';   // l'herbe dehors, au bout du passage
      } else {
        if (deep < 4 && hash(x, y, 3) < 0.75 - deep * 0.2) col = P[0];
        if (y >= H - 4) col = y >= H - 2 ? '#3c4050' : '#262834';
      }
      px(x, y, col);
      continue;
    }
    const edgeO = ow - Math.abs(dx), edgeI = iw >= 0 ? Math.abs(dx) - iw : 99;
    const [id, gap] = near(x + 0.5, y + 0.5), sd = seeds[id];
    // volume du rocher : éclairé côté haut-gauche de son centre, sombre côté bas-droit
    const side = ((x + 0.5 - sd[0]) + (y + 0.5 - sd[1]) * 1.2);
    let k = 2 + Math.floor(sd[2] * 1.8) + (side < -1 ? 1 : 0) - (side > 1.5 ? 1 : 0);
    k += (dx < -5 ? 1 : 0) - (dx > 6 ? 1 : 0) - (y > H - 9 ? 1 : 0) + (y < 9 ? 1 : 0);
    if (gap < 1.1) k = 1;                                      // creux entre deux rochers
    k = Math.max(1, Math.min(5, k));
    if (edgeI < 1.6) k = dx < 0 ? 5 : 2;                       // rebord de l'ouverture
    if (edgeI < 0.8) k = 1;
    if (edgeO < 1 || outer(y - 1, x) < 0 || Math.abs(x + 0.5 - cx) > outer(y - 1, x) && y < 19 || y === H - 1) k = 0;   // contour
    px(x, y, P[k]);
  }
  return c;
}

/** lumière du jour qui entre par une sortie de grotte (32 px de large, une case de haut par case) : tramée au pixel,
 *  rien en haut de la case de la porte, de plus en plus claire vers le dehors (le bas), plus forte au milieu */
export function jourGrotte(cases) {
  const W = 32, H = 32 * cases, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = Math.min(1, Math.max(0, (y - 10) / (H - 10))) * (1 - Math.max(0, Math.abs(x + 0.5 - W / 2) - 7) / 9);
    const b = bay[(y % 4) * 4 + (x % 4)] / 16;
    if (f > 0.75 + b * 0.25) { g.fillStyle = '#fff6d6'; g.fillRect(x, y, 1, 1); }
    else if (f > 0.15 + b * 0.5) { g.fillStyle = '#e6cf98'; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
