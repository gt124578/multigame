// odyssee/js/ui/screens/map.js — carte de la région (C-Gear)
import { el, esc } from '../ui.js';
import { levelCap, GYM_CAPS } from '../../core/mon.js';
import { BADGES, LEADERS, SPAWNS } from '../../world/region.js';
import { getZoneCatchStats } from '../../core/trophies.js';

function findZoneSpawnKey(z) {
  if (!z) return null;
  if (z.spawns && SPAWNS[z.spawns]) return z.spawns;
  if (z.route && SPAWNS[z.route]) return z.route;
  if (z.enc) {
    for (const [k, v] of Object.entries(SPAWNS)) {
      if (v?.land === z.enc) return k;
    }
  }
  return null;
}
import { ASSETS } from '../../assets.js';
import { SPRITES } from '../../data/sprites.js';
import { T, walkable } from '../../world/tiles.js';
import { TYPE_FR, screen, closer } from './common.js';
import { preparerLocale, dessinerLocale, vueLocale } from './carteLocale.js';

/* ================= CARTE DE LA RÉGION ================= */
// La carte se dévoile au fil du voyage : seules les zones parcourues sont dessinées, le reste n'est qu'une étendue
// verte ; le cadre est zoomé sur ce qu'on connaît et s'élargit à mesure qu'on avance.
/** carte de la région, dessinée comme le Pokégear de HeartGold / SoulSilver : mer en trois bleus, côtes en falaises,
 *  plaines et forêts, montagnes en paliers, routes blanches cerclées de gris, villes en pastilles rouges.
 *  Un pixel = une case ; le relief est posé par blocs de 2 × 2 cases, comme les pixels doublés du DS. */
const B2W2_PALETTE = {
  open: [20, 68, 108], far: [14, 50, 84], deep: [10, 36, 62], foam: [0, 224, 255],
  flat: [60, 164, 116], shadow: [40, 126, 86], cliff: [168, 122, 88],
  top: [238, 180, 136], vhigh: [214, 158, 116], high: [188, 140, 100], low: [156, 122, 84],
  ink: '#0b1c2d', road: '#e0f4ff', town: '#ef4444', townDark: '#991b1b', special: '#00e0ff', water: '#185a9d',
};
const HG = B2W2_PALETTE;
let carteIcons = null;
function loadCarteIcons() {
  if (carteIcons) return carteIcons;
  carteIcons = {};
  for (const k of SPRITES.carte || []) { const im = new Image(); im.src = ASSETS.carte(k); carteIcons[k] = im; }
  return carteIcons;
}
/** relief de la région, une case = un pixel (gardé en cache : la carte ne change pas) */
function regionTerrain(game) {
  if (game._regionTerrain) return game._regionTerrain;
  // Carte illustrée façon Pokégear : la grille de cases sert de calque, puis tout est adouci
  // (côtes arrondies, biomes en dégradés) ; montagnes, forêts et villes sont posées en icônes dessinées.
  const W = game.world.maps.monde, w = W.w, h = W.h, N = w * h;
  const isW = (t) => t === T.WATER || t === T.WHIRL;
  const tile = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tile[y * w + x] = W.get(x, y);
  const TH = [], tw = Math.ceil(w / 4);
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) TH[(y >> 2) * tw + (x >> 2)] = W.zoneAt(x, y)?.theme || '';
  const theme = (x, y) => TH[(y >> 2) * tw + (x >> 2)];
  const SNOW = new Set(['snow', 'cime']), VOLC = new Set(['volcanic', 'cendre', 'forge']), SAND = new Set(['desert', 'dunes', 'mirage', 'canyon']);
  const rock = (t) => t === T.ROCK || t === T.CAVEWALL || t === T.CLIFF;
  const forest = (t) => t === T.TREE || t === T.PINE || t === T.CUT || t === T.BUSH;

  // villes : clairière ronde aux bords irréguliers ; le reste du rectangle de la ville passe en forêt
  const TZ = new Uint8Array(N);
  for (const z of W.zones.filter((z) => z.town)) {
    const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2, rx = (z.x1 - z.x0) / 2, ry = (z.y1 - z.y0) / 2;
    for (let y = Math.max(0, z.y0); y <= Math.min(h - 1, z.y1); y++) for (let x = Math.max(0, z.x0); x <= Math.min(w - 1, z.x1); x++) {
      const a = Math.atan2(y - cy, x - cx), wob = 0.8 + 0.1 * Math.sin(a * 3 + z.x0) + 0.07 * Math.sin(a * 5 + z.y0);
      TZ[y * w + x] = Math.hypot((x - cx) / rx, (y - cy) / ry) < wob ? 1 : 2;
    }
  }
  // 1. calques bruts : terre, couleur de fond, montagne, forêt
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cLand = mk(), cCol = mk(), cMnt = mk(), cFor = mk();
  const iL = cLand.getContext('2d').createImageData(w, h), iC = cCol.getContext('2d').createImageData(w, h),
    iM = cMnt.getContext('2d').createImageData(w, h), iF = cFor.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = tile[i], o = i * 4, th = theme(x, y);
    const land = !isW(t);
    iL.data[o + 3] = land ? 255 : 0;
    iM.data[o + 3] = rock(t) ? 255 : 0;
    iF.data[o + 3] = forest(t) || TZ[i] === 2 ? 255 : 0;
    const c = SNOW.has(th) ? [228, 238, 246] : VOLC.has(th) ? [128, 104, 92] : SAND.has(th) ? (th === 'canyon' ? [214, 150, 102] : [232, 206, 146])
      : th === 'marais' ? [110, 146, 92] : th === 'automne' ? [176, 168, 86] : th === 'ombre' ? [80, 124, 92] : [118, 190, 104];
    iC.data[o] = c[0]; iC.data[o + 1] = c[1]; iC.data[o + 2] = c[2]; iC.data[o + 3] = 255;
  }
  cLand.getContext('2d').putImageData(iL, 0, 0); cCol.getContext('2d').putImageData(iC, 0, 0);
  cMnt.getContext('2d').putImageData(iM, 0, 0); cFor.getContext('2d').putImageData(iF, 0, 0);
  const soft = (src, r) => { const c = mk(), x = c.getContext('2d'); x.filter = `blur(${r}px)`; x.drawImage(src, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const L = soft(cLand, 12), Cc = soft(cCol, 7), M = soft(cMnt, 4), F = soft(cFor, 3);
  const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 255) / 255; };
  // bruit doux (valeur interpolée) pour des bords naturels
  const vn = (x, y, s) => { const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1), u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };

  // 2. terre arrondie (seuil du flou + un peu de bruit), distances à la côte
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const x = i % w, y = (i / w) | 0; land[i] = L[i * 4 + 3] / 255 + (vn(x, y, 40) - 0.5) * 0.7 + (vn(x, y, 11) - 0.5) * 0.3 > 0.5 ? 1 : 0; }
  const bfs = (pred) => { const d = new Int16Array(N).fill(60), q = []; for (let i = 0; i < N; i++) if (pred(i)) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w; if (d[i] >= 59) continue; for (const j of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < N ? i + w : -1, i - w]) if (j >= 0 && d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } }
    return d; };
  const toSea = bfs((i) => !land[i]), toLand = bfs((i) => land[i]);

  // 3. relief doux pour l'ombrage
  const Hh = new Float32Array(N);
  for (let i = 0; i < N; i++) Hh[i] = land[i] ? Math.min(toSea[i], 20) * 0.08 + M[i * 4 + 3] / 255 * 3 + F[i * 4 + 3] / 255 * 0.5 + vn(i % w, (i / w) | 0, 14) * 0.6 : 0;

  // 4. peinture
  const c0 = mk(), ctx = c0.getContext('2d'), img = ctx.createImageData(w, h), D = img.data;
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    let c;
    if (!land[i]) {
      const d = toLand[i];
      c = mix([110, 198, 214], [26, 72, 128], Math.sqrt(Math.min(d, 26) / 26));
      if (d === 1 || d === 2) c = mix(c, [226, 246, 248], d === 1 ? 0.55 : 0.2);          // écume le long du rivage
      if (d > 4 && vn(x, y * 3, 5) > 0.82) c = mix(c, [150, 210, 232], 0.25);              // vaguelettes
    } else {
      const th = theme(x, y);
      c = [Cc[o], Cc[o + 1], Cc[o + 2]];
      const f = F[o + 3] / 255, m = M[o + 3] / 255;
      if (f > 0.15) c = mix(c, [c[0] * 0.55, c[1] * 0.72, c[2] * 0.6], Math.min(1, f * 1.3));       // sous-bois
      if (m > 0.2) c = mix(c, SNOW.has(th) ? [240, 244, 250] : VOLC.has(th) ? [92, 74, 68] : [176, 150, 120], Math.min(1, m * 1.2));
      if (toSea[i] <= 2) c = mix(c, SNOW.has(th) ? [236, 240, 244] : [238, 222, 172], toSea[i] === 1 ? 0.9 : 0.5);   // plage
      const sh = Math.max(-0.3, Math.min(0.25, ((x > 0 ? Hh[i - 1] : Hh[i]) - Hh[i] + (y > 0 ? Hh[i - w] : Hh[i]) - Hh[i]) * -1.6));
      const k = 1 + sh + (vn(x, y, 3) - 0.5) * 0.08;
      c = [c[0] * k, c[1] * k, c[2] * k];
    }
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // contour de côte
  const out = mk(), ox = out.getContext('2d'), oi = ox.createImageData(w, h);
  for (let i = 0; i < N; i++) if (land[i] && toSea[i] === 1) { oi.data[i * 4] = 40; oi.data[i * 4 + 1] = 70; oi.data[i * 4 + 2] = 70; oi.data[i * 4 + 3] = 150; }
  ox.putImageData(oi, 0, 0); ctx.drawImage(out, 0, 0);

  // 5. icônes : sommets sur les massifs, bosquets dans les forêts (jamais sur une ville ni une route)
  const townAt = (x, y) => W.zoneAt(x, y)?.town;
  const peaks = [], trees = [];
  for (let y = 4; y < h - 4; y += 6) for (let x = 4; x < w - 4; x += 6) {
    const jx = x + Math.floor(hash(x, y) * 6) - 3, jy = y + Math.floor(hash(y, x) * 6) - 3, i = jy * w + jx;
    if (!land[i] || TZ[i] === 1) continue;
    const m = M[i * 4 + 3] / 255, f = F[i * 4 + 3] / 255, th = theme(jx, jy);
    if (m > 0.6 && hash(jx, jy + 7) > 0.45) peaks.push({ x: jx, y: jy, s: 5 + m * 5 + hash(jx, jy) * 3, snow: SNOW.has(th) || m > 0.9 && !VOLC.has(th), volc: VOLC.has(th), sand: SAND.has(th) });
    else if (f > 0.6 && hash(jx + 1, jy) > 0.25) trees.push({ x: jx, y: jy, s: 3 + hash(jx, jy + 1) * 1.6, pine: SNOW.has(th) || th === 'ombre', autumn: th === 'automne' });
  }
  peaks.sort((a, b) => a.y - b.y); trees.sort((a, b) => a.y - b.y);
  // anciens champs encore lus ailleurs
  const B = 2, bw = Math.ceil(w / B), bh = Math.ceil(h / B), kind = new Uint8Array(bw * bh), toOpen = new Int16Array(bw * bh), toFoot = new Int16Array(bw * bh);
  return (game._regionTerrain = { canvas: c0, peaks, trees, kind, bw, bh, toOpen, toFoot, B });
}

/** cadre de la carte : ce qu'on a exploré (plus une marge), jamais plus petit qu'un tiers de la région ;
 *  il s'adapte au ratio de l'écran (par défaut 16/10) et s'élargit à mesure qu'on avance */
export function exploredView(game, targetAspect) {
  const W = game.world.maps.monde, C = 8, cw = Math.ceil(W.w / C), seen = game.state.explored || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of seen) { const cx = i % cw, cy = Math.floor(i / cw); x0 = Math.min(x0, cx * C); y0 = Math.min(y0, cy * C); x1 = Math.max(x1, cx * C + C); y1 = Math.max(y1, cy * C + C); }
  const p = game.worldPos(); if (!isFinite(x0)) { x0 = p.x - 20; x1 = p.x + 20; y0 = p.y - 15; y1 = p.y + 15; }
  const M = 16, ar = targetAspect || (16 / 10);
  x0 -= M; y0 -= M; x1 += M; y1 += M;
  let w = Math.max(x1 - x0, 80), h = Math.max(y1 - y0, 50);
  if (w / h > ar) h = w / ar; else w = h * ar;
  w = Math.min(w, W.w); h = Math.min(h, W.h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.max(0, Math.min(W.w - w, cx - w / 2)), y = Math.max(0, Math.min(W.h - h, cy - h / 2));
  return { x, y, w, h };
}

/** direction cardinale d'un écart (dx, dy) en cases ; '' quand on y est déjà */
export function cardinalDir(dx, dy) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return '';
  if (Math.abs(dy) > Math.abs(dx) * 2) return dy < 0 ? 'Nord' : 'Sud';
  if (Math.abs(dx) > Math.abs(dy) * 2) return dx < 0 ? 'Ouest' : 'Est';
  return (dy < 0 ? 'Nord-' : 'Sud-') + (dx < 0 ? 'Ouest' : 'Est');
}
const distLabel = (dx, dy) => {
  const d = Math.round(Math.hypot(dx, dy)), dir = cardinalDir(dx, dy);
  return dir ? `À ~${d} pas au ${dir}` : 'Vous y êtes';
};

/** même taille que la vue explorée, mais centrée sur le joueur (bornée à la région) */
export function playerView(game, targetAspect) {
  const W = game.world.maps.monde, v = exploredView(game, targetAspect), p = game.worldPos();
  const x = Math.max(0, Math.min(W.w - v.w, p.x - v.w / 2)), y = Math.max(0, Math.min(W.h - v.h, p.y - v.h / 2));
  return { x, y, w: v.w, h: v.h };
}

/** vue régionale complète de l'archipel d'Odyssée */
export function fullRegionView(game, targetAspect) {
  const W = game.world.maps.monde;
  const ar = targetAspect || (16 / 10);
  let w = W.w, h = W.h;
  if (w / h > ar) h = w / ar; else w = h * ar;
  const x = (W.w - w) / 2, y = (W.h - h) / 2;   // centrée, quitte à déborder (fond sombre autour)
  return { x, y, w, h };
}

/** dessine la région dans le cadre v (en cases) : relief, routes, villes, et voile radar C-Gear */
function drawRegion(game, cv, v) {
  const W = game.world.maps.monde, ctx = cv.getContext('2d'), R = regionTerrain(game);
  const sx = cv.width / v.w, sy = cv.height / v.h;
  const X = (x) => (x - v.x) * sx, Y = (y) => (y - v.y) * sy;
  ctx.fillStyle = '#163f6e'; ctx.fillRect(0, 0, cv.width, cv.height);   // haute mer autour de la région
  ctx.imageSmoothingEnabled = sx > 1.5; ctx.imageSmoothingQuality = 'high';

  // Découpage sécurisé du canvas de terrain de la région
  const sx0 = Math.max(0, Math.min(W.w, Math.floor(v.x)));
  const sy0 = Math.max(0, Math.min(W.h, Math.floor(v.y)));
  const sw = Math.min(W.w - sx0, Math.ceil(v.w));
  const sh = Math.min(W.h - sy0, Math.ceil(v.h));
  if (sw > 0 && sh > 0) {
    ctx.drawImage(R.canvas, sx0, sy0, sw, sh, X(sx0), Y(sy0), sw * sx, sh * sy);
  }
  ctx.imageSmoothingEnabled = false;

  // icônes du Pokégear : grandeur fixe à l'écran (deux pixels par pixel d'icône quand la carte est zoomée)
  const k = Math.max(1, Math.min(3, Math.round(sx / 2.2)));
  const I = loadCarteIcons();
  const icon = (key, x, y) => { const im = I[key]; if (im && im.complete && im.naturalWidth) ctx.drawImage(im, Math.round(X(x) - im.width * k / 2), Math.round(Y(y) - im.height * k + 2 * k), im.width * k, im.height * k); };
  // forêts et montagnes dessinées (taille en cases : elles grandissent avec le zoom)
  const inV = (o, m) => o.x > v.x - m && o.x < v.x + v.w + m && o.y > v.y - m && o.y < v.y + v.h + m;
  const u = Math.max(sx, 0.9);
  for (const t of R.trees) { if (!inV(t, 6)) continue;
    const cx = X(t.x), cy = Y(t.y), r = t.s * u * 0.9;
    const base = t.autumn ? ['#8a5a1e', '#c9852e', '#e6b04e'] : t.pine ? ['#1d4a3a', '#2f6b52', '#4f8f70'] : ['#1f5a2c', '#2f7d3a', '#58a957'];
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx + r * .3, cy + r * .55, r, r * .45, 0, 0, 7); ctx.fill();
    if (t.pine) { ctx.fillStyle = base[1]; ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx + r * .9, cy + r * .5); ctx.lineTo(cx - r * .9, cy + r * .5); ctx.fill();
      ctx.fillStyle = base[2]; ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx - r * .9, cy + r * .5); ctx.lineTo(cx - r * .1, cy + r * .5); ctx.fill(); }
    else { ctx.fillStyle = base[0]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.fillStyle = base[1]; ctx.beginPath(); ctx.arc(cx - r * .15, cy - r * .15, r * .8, 0, 7); ctx.fill();
      ctx.fillStyle = base[2]; ctx.beginPath(); ctx.arc(cx - r * .35, cy - r * .4, r * .38, 0, 7); ctx.fill(); }
  }
  for (const p of R.peaks) { if (!inV(p, 14)) continue;
    const cx = X(p.x), by = Y(p.y), s = p.s * u, ht = s * 1.05;
    const light = p.volc ? '#9a8070' : p.sand ? '#e0b47c' : p.snow ? '#c8d2dc' : '#b79a7c', dark = p.volc ? '#5a4640' : p.sand ? '#a87444' : p.snow ? '#7f8c9c' : '#7c624c';
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx + s * .2, by + s * .05, s * .95, s * .22, 0, 0, 7); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(cx - s * .9, by); ctx.lineTo(cx - s * .05, by - ht); ctx.lineTo(cx + s * .9, by); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx - s * .05, by - ht); ctx.lineTo(cx + s * .9, by); ctx.lineTo(cx + s * .15, by); ctx.lineTo(cx + s * .1, by - ht * .5); ctx.fill();
    if (p.snow || p.s > 11) { ctx.fillStyle = '#fbfdff'; ctx.beginPath(); ctx.moveTo(cx - s * .05, by - ht); ctx.lineTo(cx - s * .32, by - ht * .7); ctx.lineTo(cx - s * .12, by - ht * .76); ctx.lineTo(cx + s * .02, by - ht * .66); ctx.lineTo(cx + s * .24, by - ht * .74); ctx.fill(); }
    if (p.volc && p.s > 10) { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(cx - s * .05, by - ht, s * .14, s * .06, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,20,15,.45)'; ctx.lineWidth = Math.max(1, s * .06); ctx.beginPath(); ctx.moveTo(cx - s * .9, by); ctx.lineTo(cx - s * .05, by - ht); ctx.lineTo(cx + s * .9, by); ctx.stroke();
  }

  // routes : un trait blanc cerclé de gris
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const roads = (game.world.routes || []).map((r) => r.pts);
  for (const [lw, col] of [[Math.max(4, sx * 1.9), HG.ink], [Math.max(2, sx * 1.1), HG.road]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (const pts of roads) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x + 0.5), Y(y + 0.5)) : ctx.moveTo(X(x + 0.5), Y(y + 0.5)))); ctx.stroke(); }
  }
  for (const b of W.buildings) if (b.kind === 'cave') icon('grotte_m', b.x + b.w / 2, b.y + b.d);
  const pill = (x, y, pw, ph, fill, dark) => {
    pw *= k; ph *= k; x = Math.round(X(x) - pw / 2); y = Math.round(Y(y) - ph / 2);
    ctx.fillStyle = HG.ink; ctx.fillRect(x - k, y, pw + 2 * k, ph); ctx.fillRect(x, y - k, pw, ph + 2 * k);
    ctx.fillStyle = fill; ctx.fillRect(x, y, pw, ph);
    if (dark) { ctx.fillStyle = dark; ctx.fillRect(x, y + Math.ceil(ph * 0.55), pw, Math.floor(ph * 0.45)); }
  };
  for (const m of Object.values(game.world.maps)) if (m !== W && m.outdoor && m.outside?.map === 'monde' && m.id !== 'magma') pill(m.outside.x, m.outside.y, 6, 6, HG.special);
  const visited = new Set(game.state.visited || []);
  // villes : une place ronde et quelques maisons ; arène en or, Ligue en violet, ville pas encore visitée en gris
  const town = (t) => {
    const isGym = t.gym != null, isLigue = t.id === 'plateau', vis = visited.has(t.id);
    const cx = X(t.x + t.w / 2), cy = Y(t.y + t.h / 2), r = Math.max(9, Math.min(26, Math.min(t.w, t.h) * 0.32 * sx));
    const roof = !vis ? '#7b8494' : isLigue ? '#9333ea' : isGym ? '#e0a020' : '#d94b3d';
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r * 1.15, r * .85, 0, 0, 7); ctx.fill();
    ctx.fillStyle = vis ? '#efe2c0' : '#c9ccd2'; ctx.strokeStyle = '#3b3326'; ctx.lineWidth = Math.max(1.5, r * .1);
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.15, r * .85, 0, 0, 7); ctx.fill(); ctx.stroke();
    const hs = r * .42, house = (hx, hy, big) => { const s2 = big ? hs * 1.3 : hs;
      ctx.fillStyle = '#f7f3ea'; ctx.fillRect(hx - s2 / 2, hy - s2 * .2, s2, s2 * .7);
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(hx - s2 * .65, hy - s2 * .15); ctx.lineTo(hx, hy - s2 * .75); ctx.lineTo(hx + s2 * .65, hy - s2 * .15); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,20,.6)'; ctx.lineWidth = 1; ctx.strokeRect(hx - s2 / 2, hy - s2 * .2, s2, s2 * .7); };
    house(cx - r * .48, cy + r * .1); house(cx + r * .5, cy + r * .15); house(cx, cy - r * .1, isGym || isLigue);
    if (isGym || isLigue) { ctx.fillStyle = isLigue ? '#c084fc' : '#fde047'; ctx.beginPath(); ctx.arc(cx, cy - r * .95, r * .16, 0, 7); ctx.fill(); ctx.strokeStyle = '#3b3326'; ctx.stroke(); }
  };
  for (const t of Object.values(game.world.towns)) town(t);

  // brouillard : ce qu'on n'a pas encore parcouru reste caché (rien n'y paraît, ni relief, ni route, ni ville) ;
  // la carte se dévoile autour de chaque pas, avec un bord adouci
  brouillard(ctx, cv, seenMask(game, 'monde'), 8, v);
}

/** masque des blocs explorés d'une carte (un pixel par bloc), gardé tant que la liste n'a pas bougé */
export function seenMask(game, id) {
  const st = game.state, m = game.world.maps[id], monde = id === 'monde';
  const B = monde ? 8 : BLOC_LOCAL, seen = (monde ? st.explored : st.explores?.[id]) || [];
  const cw = Math.ceil(m.w / B), ch = Math.ceil(m.h / B);
  game._fogMasks ||= {};
  let FM = game._fogMasks[id];
  if (!FM || FM.n !== seen.length || FM.cw !== cw) {
    const mask = document.createElement('canvas'); mask.width = cw; mask.height = ch;
    const mx = mask.getContext('2d'), md = mx.createImageData(cw, ch);
    for (const i of seen) if (i >= 0 && i < cw * ch) md.data[i * 4 + 3] = 255;
    mx.putImageData(md, 0, 0);
    FM = game._fogMasks[id] = { mask, n: seen.length, cw, ch, set: new Set(seen), fog: FM?.fog || document.createElement('canvas') };
  }
  return FM;
}
/** blocs de cases des cartes autres que la région (grottes, îles) : plus petits, ces cartes sont petites */
export const BLOC_LOCAL = 4;

/** motif du brouillard (nuages sombres et quadrillage radar du C-Gear), raccordable sur lui-même */
let motifBrume = null;
function brumeMotif() {
  if (motifBrume) return motifBrume;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x2 = c.getContext('2d'), im = x2.createImageData(N, N), D = im.data;
  const h = (x, y, p) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 1023) / 1023; };
  const vn = (x, y, s) => { const p = N / s, gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const a = h(x0, y0, p), b = h(x0 + 1, y0, p), cc = h(x0, y0 + 1, p), d = h(x0 + 1, y0 + 1, p), u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (cc - a) * w + (a - b - cc + d) * u * w; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = vn(x, y, 64) * 0.55 + vn(x, y, 32) * 0.3 + vn(x, y, 8) * 0.15;
    const k = Math.max(0, Math.min(1, (n - 0.3) * 1.6)), o = (y * N + x) * 4;
    let r = 14 + 26 * k, g = 24 + 34 * k, b = 40 + 46 * k;
    if (x % 32 === 0 || y % 32 === 0) { r += 6; g += 16; b += 22; }   // quadrillage radar
    D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = 255;
  }
  x2.putImageData(im, 0, 0);
  return (motifBrume = c);
}

/** recouvre le cadre v (en cases) d'un brouillard opaque, sauf les blocs explorés de FM (blocs de B cases) */
export function brouillard(ctx, cv, FM, B, v) {
  const sx = cv.width / v.w, sy = cv.height / v.h, X = (x) => (x - v.x) * sx, Y = (y) => (y - v.y) * sy;
  const fog = FM.fog;
  if (fog.width !== cv.width || fog.height !== cv.height) { fog.width = cv.width; fog.height = cv.height; }
  const fx = fog.getContext('2d');
  fx.globalCompositeOperation = 'source-over'; fx.clearRect(0, 0, fog.width, fog.height);
  // le motif suit la carte (il ne glisse pas quand on la déplace) et garde la même taille à l'écran
  const pat = fx.createPattern(brumeMotif(), 'repeat');
  pat.setTransform(new DOMMatrix([1, 0, 0, 1, X(0) % 256, Y(0) % 256]));
  fx.fillStyle = pat; fx.fillRect(0, 0, fog.width, fog.height);
  const r = Math.max(2, B * sx * 0.35);
  // lueur au bord de l'inconnu : le brouillard s'éclaire là où il touche ce qu'on connaît
  fx.globalAlpha = 0.5; fx.filter = `blur(${r * 2.2}px) brightness(0) invert(1) sepia(1) hue-rotate(150deg) saturate(3)`;
  fx.globalCompositeOperation = 'source-atop';
  fx.drawImage(FM.mask, X(0), Y(0), FM.cw * B * sx, FM.ch * B * sy);
  fx.globalAlpha = 1;
  // découpe des blocs explorés : bord flou, mais l'intérieur bien net
  fx.globalCompositeOperation = 'destination-out';
  fx.imageSmoothingEnabled = true;
  fx.filter = `blur(${r}px)`;
  for (let k = 0; k < 2; k++) fx.drawImage(FM.mask, X(0), Y(0), FM.cw * B * sx, FM.ch * B * sy);
  fx.filter = 'none';
  fx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fog, 0, 0);
}

/** la case (x, y) d'une carte a-t-elle été vue ? */
export function caseVue(game, id, x, y) {
  const m = game.world.maps[id]; if (!m) return false;
  const B = id === 'monde' ? 8 : BLOC_LOCAL, FM = seenMask(game, id);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
  return FM.set.has(Math.floor(y / B) * FM.cw + Math.floor(x / B));
}

/** recadre une vue mémorisée au ratio voulu, autour de son centre */
function playerAspect(v, ar) {
  let w = v.w, h = v.h;
  if (w / h > ar) h = w / ar; else w = h * ar;
  return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
}

export function mapScreen(game) {
  const ui = game.ui, W = game.world.maps.monde, towns = game.world.towns, st = game.state;
  const allTowns = Object.values(towns);
  const visited = new Set(st.visited || []);
  return new Promise((resolve) => {
    const s = screen(ui, 'map-scr');
    const p = game.worldPos();
    const near = () => { let best = null, bd = 1e9; for (const r of game.world.routes || []) for (const [x, y] of r.pts) { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = r.name; } } return best; };
    const here = game.mapObj === W && !W.zoneAt(p.x, p.y)?.name ? near() || game.locationName() : game.locationName();

    const spots = [{
      name: here,
      x: p.x,
      y: p.y,
      sub: 'Position actuelle du dresseur',
      tag: '',
      tagCls: 'here',
    }].concat(
      allTowns.filter((t) => visited.has(t.id)).map((t) => {
        const gIdx = t.gym;
        const hasGym = gIdx != null && LEADERS[gIdx];
        const gotBadge = hasGym && st.badges?.[gIdx];
        const leader = hasGym ? LEADERS[gIdx] : null;
        const badge = hasGym ? BADGES[gIdx] : null;
        const capLvl = hasGym ? GYM_CAPS[gIdx] : null;
        return {
          id: t.id,
          name: t.name,
          x: t.x + t.w / 2,
          y: t.y + t.h / 2,
          sub: hasGym
            ? `Champion : ${leader.name}, type ${TYPE_FR[leader.type] || leader.type}${gotBadge ? ' · ' + badge.name + ' obtenu' : ` · niveau max avant l'arène : ${capLvl}`}`
            : t.id === 'plateau'
              ? 'Le Conseil 4 et la Maître de la Ligue'
              : 'Centre de soins',
          tag: hasGym ? (gotBadge ? 'Badge obtenu ✓' : `Arène ${gIdx + 1}`) : t.id === 'plateau' ? 'Ligue' : '',
          tagCls: hasGym ? (gotBadge ? 'badge-ok' : 'gym') : t.id === 'plateau' ? 'league' : 'town',
        };
      })
    );

    s.innerHTML = `
      <!-- Fond et Châssis C-Gear B2W2 Nanobanana (sans fausses cartes ni texte intrusif) -->
      <img class="map-pixelart-bg" src="${ASSETS.carteBg}" alt="">
      <div class="map-scanlines"></div>

      <!-- En-tête C-Gear B2W2 -->
      <div class="map-b2w2-hdr">
        <div class="map-hdr-left">
          <div class="map-cgear-icon"></div>
          <div class="map-hdr-titles">
            <span class="map-hdr-main">CARTE DE LA RÉGION D'ODYSSÉE</span>
            <span class="map-hdr-sub">${visited.size} / ${allTowns.length} villes découvertes</span>
          </div>
        </div>
        <div class="map-hdr-right">
          <span class="map-cap-pill">Niveau max : <b>N.${game.levelCap ? game.levelCap() : levelCap(st.badges)}</b></span>
          <button type="button" class="map-close-btn" data-act="close" title="Fermer (Échap)">FERMER ✕</button>
        </div>
      </div>

      <!-- Barre de localisation GPS en direct -->
      <div class="map-gps-bar">
        <div class="map-gps-left">
          <span class="map-gps-dot"></span>
          <span class="map-gps-title">Tu es ici :</span>
          <span class="map-gps-loc">${esc(here)}</span>
        </div>
        <div class="map-gps-right">
          <div class="map-onglets" role="tablist" title="Changer de carte (Tab)">
            <button type="button" class="map-onglet" data-act="mode" data-mode="region">🌍 Région</button>
            <button type="button" class="map-onglet" data-act="mode" data-mode="locale">📍 Ici</button>
          </div>
          <button type="button" class="map-ctrl-btn" data-act="me" title="Centrer la carte sur ma position (Espace / Entrée)">⌖ Ma position</button>
          <button type="button" class="map-ctrl-btn" data-act="toggle-view" title="Basculer entre vue zoomée et vue de la région">🗺️ Toute la région</button>
        </div>
      </div>

      <!-- Cadre Écran Cartographique Central Grand Écran B2W2 -->
      <div class="map-stage">
        <div class="map-wrap">
          <canvas class="mapcv"></canvas>
          <div class="map-labels"></div>
          <div class="map-corner tl"></div><div class="map-corner tr"></div>
          <div class="map-corner bl"></div><div class="map-corner br"></div>
        </div>
      </div>

      <!-- Panneau Inférieur Tactile B2W2 -->
      <div class="map-footer">
        <button type="button" class="map-nav-btn prev" data-act="prev" title="Lieu précédent (◀ ou Flèche Gauche)">
          <span class="map-btn-arr">◀</span> Précédent
        </button>
        <div class="map-info">
          <div class="map-info-top">
            <span class="map-where"></span>
            <span class="map-tag"></span>
          </div>
          <div class="map-sub"></div>
        </div>
        <button type="button" class="map-nav-btn next" data-act="next" title="Lieu suivant (▶ ou Flèche Droite)">
          Suivant <span class="map-btn-arr">▶</span>
        </button>
        <div class="map-legend">
          <span><i class="lg-dot me"></i> Vous</span>
          <span><i class="lg-dot town"></i> Ville</span>
          <span><i class="lg-dot gym"></i> Arène</span>
          <span><i class="lg-dot league"></i> Ligue</span>
        </div>
      </div>`;

    const c = s.querySelector('.mapcv');
    const lab = s.querySelector('.map-labels');
    const whereEl = s.querySelector('.map-where');
    const tagEl = s.querySelector('.map-tag');
    const subEl = s.querySelector('.map-sub');

    let isFullRegion = false, animId = 0;
    let view;
    const aspectNow = () => (c.width > 0 && c.height > 0 ? c.width / c.height : 16 / 10);
    const fit = () => {
      const r = c.getBoundingClientRect();
      const w = Math.max(320, Math.round(r.width * (window.devicePixelRatio || 1)));
      const h = Math.max(200, Math.round(r.height * (window.devicePixelRatio || 1)));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    };
    // carte locale (le lieu où l'on est, case par case) : préparée au premier passage sur l'onglet
    let locale = game.mapObj?.floor === 'cave' ? true : st.mapMode === 'locale', L = null, viewL = null;
    const place = (node, x, y) => {
      const view0 = view; { const view = locale && node === me ? viewL : view0;
      node.style.left = ((x - view.x) / view.w * 100) + '%';
      node.style.top = ((y - view.y) / view.h * 100) + '%';
      // nom de ville près d'un bord : ancré de ce côté pour ne pas être coupé
      if (node.classList?.contains?.('map-pin-name') && node.style.setProperty) {
        const px = (x - view.x) / view.w;
        node.style.setProperty('--ax', px < 0.1 ? '-8%' : px > 0.9 ? '-92%' : '-50%');
      } }
    };
    const pinsAt = [];
    let me = null;
    const draw = () => {
      if (!s.isConnected) return;
      fit();
      if (locale) {
        L ||= preparerLocale(game);
        viewL = vueLocale(L, aspectNow());
        dessinerLocale(game, c, L, viewL);
        if (me) place(me, L.p.x + 0.5, L.p.y + 0.5);
        return;
      }
      drawRegion(game, c, view);
      for (const [node, x, y] of pinsAt) place(node, x, y);
    };
    // la vue prend le ratio réel du canvas (sinon la carte est étirée hors 16/10)
    fit();
    const target = exploredView(game, aspectNow());
    const from = st.mapView && st.mapView.w ? playerAspect(st.mapView, aspectNow()) : target;
    view = { ...from };
    draw();
    Object.values(loadCarteIcons()).forEach((im) => { if (!im.complete) im.onload = draw; });

    if (Math.abs(from.w - target.w) > 0.5 || Math.abs(from.x - target.x) > 0.5 || Math.abs(from.y - target.y) > 0.5) {
      const id0 = animId;
      setTimeout(() => { if (animId === id0) animateTo(target, 900); }, 200);   // sauf si le joueur a déjà bougé la vue
    }
    st.mapView = target;

    // Balise Joueur "VOUS ÊTES ICI" interactive avec double halo radar
    me = el('div', 'map-me');
    me.innerHTML = `
      <div class="map-me-radar-outer"></div>
      <div class="map-me-radar"></div>
      <div class="map-me-core"></div>
      <div class="map-me-tag">Toi</div>
    `;
    me.title = `Votre position : ${here} [${Math.round(p.x)}, ${Math.round(p.y)}]`;
    me.addEventListener('click', (e) => {
      e.stopPropagation();
      k = 0;
      ui.sound.sfx('blip');
      show();
    });
    pinsAt.push([me, p.x, p.y]); place(me, p.x, p.y);
    lab.appendChild(me);

    // Points d'intérêt des villes & arènes visitées
    spots.forEach((sp, idx) => {
      if (idx === 0) return;
      const pin = el('button', 'map-pin ' + (sp.tagCls || ''));
      pin.type = 'button';
      pinsAt.push([pin, sp.x, sp.y]); place(pin, sp.x, sp.y);
      pin.title = sp.name;
      pin.innerHTML = sp.tagCls?.includes('gym') ? '★' : sp.tagCls?.includes('badge-ok') ? '✓' : sp.tagCls?.includes('league') ? '👑' : '●';
      // le nom de la ville à côté du repère : on s'y retrouve sans cliquer partout
      // (à côté du repère, pas dedans : le repère découpe tout ce qui dépasse de sa forme)
      const nm = el('span', 'map-pin-name'); nm.textContent = sp.name; lab.appendChild(nm); pinsAt.push([nm, sp.x, sp.y]); place(nm, sp.x, sp.y);
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        k = idx;
        ui.sound.sfx('blip');
        show();
      });
      lab.appendChild(pin);
    });

    // Viseur / Réticule de ciblage B2W2
    const cur = el('div', 'map-cur');
    cur.innerHTML = `
      <div class="map-cur-bracket tl"></div>
      <div class="map-cur-bracket tr"></div>
      <div class="map-cur-bracket bl"></div>
      <div class="map-cur-bracket br"></div>
      <div class="map-cur-crosshair"></div>
    `;
    lab.appendChild(cur);
    const curAt = [cur, p.x, p.y]; pinsAt.push(curAt);

    let k = 0;
    const titre = s.querySelector('.map-hdr-main');
    const showLocale = () => {
      L ||= preparerLocale(game);
      whereEl.textContent = L.nom;
      tagEl.textContent = L.grotte ? 'Grotte' : L.ville ? 'Ville' : L.id === 'monde' ? 'Route' : 'Lieu';
      tagEl.className = 'map-tag ' + (L.ville ? 'town' : 'here');
      // part du lieu déjà parcourue
      const FM = seenMask(game, L.id), B = L.id === 'monde' ? 8 : BLOC_LOCAL;
      let n = 0, vus = 0;
      for (let by = Math.floor(L.y0 / B); by <= Math.floor(L.y1 / B); by++) for (let bx = Math.floor(L.x0 / B); bx <= Math.floor(L.x1 / B); bx++) { n++; if (FM.set.has(by * FM.cw + bx)) vus++; }
      const zKey = L.zone ? findZoneSpawnKey(L.zone) : null, zCatch = zKey ? getZoneCatchStats(st, zKey) : null;
      subEl.innerHTML = `Carte locale · <b>${Math.round(vus / Math.max(1, n) * 100)} %</b> exploré` + (zCatch ? ` <span class="map-route-catch-badge${zCatch.complete ? ' complete' : ''}">· 🐾 Pokédex Zone : <b>${zCatch.caught} / ${zCatch.total}</b> capturés${zCatch.complete ? ' ★' : ''}</span>` : '');
    };
    const setMode = (loc, son = true) => {
      locale = loc; st.mapMode = loc ? 'locale' : 'region';
      s.classList.toggle('mode-locale', loc);
      s.querySelectorAll('.map-onglet').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'locale') === loc));
      titre.textContent = loc ? `CARTE LOCALE — ${(L ||= preparerLocale(game)).nom.toUpperCase()}` : 'CARTE DE LA RÉGION D\'ODYSSÉE';
      if (son) ui.sound.sfx('blip');
      if (loc) showLocale(); else show();
      draw();
    };
    const show = () => {
      if (locale) return showLocale();
      const q = spots[k];
      curAt[1] = q.x; curAt[2] = q.y; place(cur, q.x, q.y);
      whereEl.textContent = q.name;
      tagEl.textContent = q.tag || '';
      tagEl.className = 'map-tag ' + (q.tagCls || '');
      
      const zAt = (W || game.world?.maps?.monde)?.zoneAt?.(Math.round(q.x), Math.round(q.y));
      const zKey = findZoneSpawnKey(zAt);
      const zCatch = zKey ? getZoneCatchStats(st, zKey) : null;
      const catchBadge = zCatch
        ? ` <span class="map-route-catch-badge${zCatch.complete ? ' complete' : ''}">· 🐾 Pokédex Zone : <b>${zCatch.caught} / ${zCatch.total}</b> capturés${zCatch.complete ? ' ★' : ''}</span>`
        : '';

      if (k === 0) {
        subEl.innerHTML = `Tu es ici.${catchBadge}`;
      } else {
        subEl.innerHTML = `${esc(q.sub || '')} <span class="map-sub-dist">· ${distLabel(q.x - p.x, q.y - p.y)}</span>${catchBadge}`;
      }
    };
    setMode(locale, false);

    // Clic n'importe où sur la carte : Waypoint GPS interactif
    c.addEventListener('click', (e) => {
      if (locale) return;
      const rect = c.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;
      const worldX = Math.round(view.x + clickX * view.w);
      const worldY = Math.round(view.y + clickY * view.h);

      // rayon de prise : ~22 px à l'écran, quel que soit le zoom
      let nearestIdx = -1, nearestDist = Math.max(3, 22 / rect.width * view.w);
      spots.forEach((sp, i) => {
        const d = Math.hypot(sp.x - worldX, sp.y - worldY);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });

      if (nearestIdx >= 0) {
        k = nearestIdx;
        ui.sound.sfx('blip');
        show();
      } else {
        ui.sound.sfx('select');
        curAt[1] = worldX; curAt[2] = worldY; place(cur, worldX, worldY);
        const vue = caseVue(game, 'monde', worldX, worldY);
        const clickZone = vue ? W.zoneAt?.(worldX, worldY) : null;
        const clickKey = findZoneSpawnKey(clickZone);
        const clickCatch = vue && clickKey ? getZoneCatchStats(st, clickKey) : null;
        const clickCatchHtml = clickCatch
          ? ` <span class="map-route-catch-badge${clickCatch.complete ? ' complete' : ''}">· 🐾 Pokédex Zone : <b>${clickCatch.caught} / ${clickCatch.total}</b> capturés${clickCatch.complete ? ' ★' : ''}</span>`
          : '';
        whereEl.textContent = vue ? clickZone?.name || 'Repère' : 'Zone inexplorée';
        tagEl.textContent = '';
        tagEl.className = 'map-tag waypoint';
        subEl.innerHTML = `Repère temporaire posé sur la carte <span class="map-sub-dist">· ${distLabel(worldX - p.x, worldY - p.y)}</span>${clickCatchHtml}`;
      }
    });

    const animateTo = (nextTarget, D) => {
      const startView = { ...view }, t0 = performance.now(), id = ++animId;
      const anim = () => {
        if (!s.isConnected || id !== animId) return;   // une nouvelle animation remplace l'ancienne
        const u = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - u, 3);
        for (const prop of ['x', 'y', 'w', 'h']) view[prop] = startView[prop] + (nextTarget[prop] - startView[prop]) * e;
        draw();
        if (u < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    };
    const toggleView = () => {
      isFullRegion = !isFullRegion;
      animateTo(isFullRegion ? fullRegionView(game, aspectNow()) : exploredView(game, aspectNow()), 450);
      const zoomBtn = s.querySelector('[data-act="toggle-view"]');
      if (zoomBtn) zoomBtn.textContent = isFullRegion ? '🔍 Autour de moi' : '🗺️ Toute la région';
      ui.sound.sfx('blip');
    };

    const centerOnPlayer = () => {
      k = 0;
      ui.sound.sfx('select');
      show();
      isFullRegion = false;
      const zoomBtn = s.querySelector('[data-act="toggle-view"]');
      if (zoomBtn) zoomBtn.textContent = '🗺️ Toute la région';
      animateTo(playerView(game, aspectNow()), 350);
    };

    const close = closer(ui, s, () => pop, resolve);
    s.querySelector('[data-act="close"]')?.addEventListener('click', close);
    s.querySelector('[data-act="me"]')?.addEventListener('click', centerOnPlayer);
    s.querySelector('[data-act="toggle-view"]')?.addEventListener('click', toggleView);
    s.querySelectorAll('[data-act="mode"]').forEach((b) => b.addEventListener('click', () => { if ((b.dataset.mode === 'locale') !== locale) setMode(!locale); }));
    s.querySelector('[data-act="prev"]')?.addEventListener('click', () => {
      k = (k + spots.length - 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });
    s.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      k = (k + 1) % spots.length;
      ui.sound.sfx('blip');
      show();
    });

    const pop = ui.input.push((key) => {
      if (key === 'menu') { setMode(!locale); return; }   // Tab : carte locale ⇄ carte de la région
      if (locale) { if (key === 'b' || key === 'map') close(); return; }
      if (key === 'left' || key === 'up') { k = (k + spots.length - 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      if (key === 'right' || key === 'down') { k = (k + 1) % spots.length; ui.sound.sfx('blip'); show(); return; }
      // Espace / Entrée (« a ») : recentrer sur le joueur, sans jamais fermer
      if (key === 'a') { centerOnPlayer(); return; }
      if (key === 'b' || key === 'map') close();   // C rouvre / referme la carte, comme en jeu
    });
  });
}
