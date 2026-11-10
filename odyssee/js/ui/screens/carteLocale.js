// odyssee/js/ui/screens/carteLocale.js — carte locale : le lieu où l'on se trouve (route, ville, grotte), case par case.
// Elle s'ouvre depuis la carte de la région (onglet « Ici », touche Tab) ; comme la carte de la région, elle ne montre
// que ce qu'on a déjà parcouru (le reste dort sous le brouillard) et se complète à chaque pas.
import { T } from '../../world/tiles.js';
import { seenMask, brouillard, caseVue, BLOC_LOCAL } from './map.js';

const MAX_W = 200, MAX_H = 150;   // au-delà (mer, très grande zone) : un cadre autour du joueur

/** le lieu à montrer : la grotte (ou carte annexe) entière, sinon la zone de la région où l'on est (toutes ses parties) */
export function zoneLocale(game) {
  const m = game.mapObj;
  if (m.id !== 'monde' && (m.floor === 'cave' || m.outdoor)) {
    return { id: m.id, m, x0: 0, y0: 0, x1: m.w - 1, y1: m.h - 1, nom: m.name || 'Grotte', p: { x: game.player.x, y: game.player.y }, grotte: m.floor === 'cave' };
  }
  const W = game.world.maps.monde, p = game.worldPos(), z = W.zoneAt(p.x, p.y);
  let x0, y0, x1, y1, nom = z?.name || 'Environs';
  if (z?.name && !z.sea) {
    x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
    for (const q of W.zones) {
      if (q.name !== z.name || (z.town && q.town !== z.town)) continue;
      x0 = Math.min(x0, q.x0); y0 = Math.min(y0, q.y0); x1 = Math.max(x1, q.x1); y1 = Math.max(y1, q.y1);
    }
  } else { x0 = p.x - 45; x1 = p.x + 45; y0 = p.y - 30; y1 = p.y + 30; }
  // trop grand : un cadre autour du joueur
  if (x1 - x0 > MAX_W) { x0 = Math.max(x0, Math.min(x1 - MAX_W, p.x - MAX_W / 2)); x1 = x0 + MAX_W; }
  if (y1 - y0 > MAX_H) { y0 = Math.max(y0, Math.min(y1 - MAX_H, p.y - MAX_H / 2)); y1 = y0 + MAX_H; }
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W.w - 1, x1 + 1); y1 = Math.min(W.h - 1, y1 + 1);
  return { id: 'monde', m: W, x0, y0, x1, y1, nom, p, zone: z, ville: !!z?.town };
}

/* ---------------- dessin des cases (4 pixels par case, gardé pour la durée de l'écran) ---------------- */
const K = 4;
const RGB = {
  herbe: [120, 192, 96], herbeAut: [176, 166, 88], hautes: [70, 150, 70], hautesSomb: [50, 108, 62],
  arbre: [44, 110, 58], pin: [34, 90, 70], buisson: [70, 136, 66], eau: [64, 136, 216], eauClair: [118, 182, 238],
  chemin: [222, 198, 140], pave: [190, 192, 202], pont: [170, 122, 76], sable: [236, 216, 158], neige: [236, 242, 250],
  cendre: [150, 140, 140], roche: [150, 136, 118], falaise: [160, 118, 86], paroi: [96, 78, 62], sol: [198, 172, 130],
  plancher: [210, 200, 180], noir: [26, 22, 20], lave: [230, 96, 40], bati: [120, 120, 132],
};
const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 1023) / 1023; };

function peindre(L) {
  const { m, x0, y0, x1, y1 } = L, w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas'); c.width = w * K; c.height = h * K;
  const ctx = c.getContext('2d'), im = ctx.createImageData(c.width, c.height), D = im.data;
  const px = (X, Y, col, f = 1) => { const o = (Y * c.width + X) * 4; D[o] = col[0] * f; D[o + 1] = col[1] * f; D[o + 2] = col[2] * f; D[o + 3] = 255; };
  const hg = (x, y) => (m.height ? m.height(x, y) || 0 : 0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = m.get(x, y), bx = (x - x0) * K, by = (y - y0) * K, v = 0.94 + hash(x, y) * 0.1;
    const theme = L.id === 'monde' ? m.zoneAt?.(x, y)?.theme : null;
    const herbe = theme === 'automne' ? RGB.herbeAut : RGB.herbe;
    const fond = (col, f = v) => { for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) px(bx + i, by + j, col, f); };
    switch (t) {
      case T.GRASS: case T.LEDGE: case T.LEDGE_E: case T.LEDGE_W: case T.SIGN: fond(herbe); break;
      case T.FLOWER: fond(herbe); px(bx + 1, by + 1, [236, 120, 160]); px(bx + 3, by + 2, [248, 220, 90]); break;
      case T.TALL: case T.DARKTALL: {
        const col = t === T.DARKTALL ? RGB.hautesSomb : RGB.hautes; fond(col);
        px(bx + 1, by + 1, col, 1.3); px(bx + 3, by + 3, col, 1.3); px(bx, by + 3, col, 0.8); break;
      }
      case T.TREE: case T.PINE: case T.BUSH: case T.CUT: {
        const col = t === T.PINE ? RGB.pin : t === T.BUSH ? RGB.buisson : t === T.CUT ? RGB.buisson : RGB.arbre;
        fond(col, 0.92 + hash(x, y) * 0.16);
        px(bx + 1, by + 1, col, 1.35); px(bx + 2, by + 1, col, 1.2); px(bx + 1, by + 2, col, 1.15);
        px(bx + 3, by + 3, col, 0.7); px(bx + 2, by + 3, col, 0.8); break;
      }
      case T.WATER: case T.WHIRL: {
        fond(RGB.eau, t === T.WHIRL ? 0.75 : 0.97 + hash(x, y) * 0.06);
        if (hash(x + 7, y) > 0.7) { px(bx + 1, by + 1, RGB.eauClair); px(bx + 2, by + 1, RGB.eauClair); }
        break;
      }
      case T.PATH: case T.STAIRS: fond(RGB.chemin); if (t === T.STAIRS) for (let i = 0; i < K; i++) px(bx + i, by + 1, RGB.chemin, 0.8); break;
      case T.PAVE: fond(RGB.pave); break;
      case T.BRIDGE: fond(RGB.pont); for (let i = 0; i < K; i++) px(bx + i, by + 3, RGB.pont, 0.7); break;
      case T.SAND: fond(RGB.sable); break;
      case T.SNOW: fond(RGB.neige); break;
      case T.ASH: fond(RGB.cendre); break;
      case T.FENCE: fond(herbe); for (let i = 0; i < K; i++) { px(bx + i, by + 2, [130, 84, 48]); } break;
      case T.ROCK: case T.SMASH: case T.BOULDER: fond(herbe); px(bx + 1, by + 1, RGB.roche, 1.2); px(bx + 2, by + 1, RGB.roche); px(bx + 1, by + 2, RGB.roche); px(bx + 2, by + 2, RGB.roche, 0.8); break;
      case T.CLIFF: fond(RGB.falaise, 0.85); break;
      case T.CAVEWALL: fond(RGB.paroi, 0.9 + hash(x, y) * 0.1); break;
      case T.CAVE: fond(RGB.sol); break;
      case T.FLOOR: case T.MAT: fond(RGB.plancher); break;
      case T.CAVEDOOR: fond(RGB.noir, 1); break;
      case T.LAVA: fond(RGB.lave); break;
      default: fond(RGB.bati, 1);
    }
    // relief : bord haut éclairé, bord bas dans l'ombre, et les niveaux un peu plus clairs en montant
    const hh = hg(x, y);
    if (hh) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const o = ((by + j) * c.width + bx + i) * 4; for (let q = 0; q < 3; q++) D[o + q] = Math.min(255, D[o + q] * (1 + Math.min(hh, 8) * 0.025)); }
    if (hg(x, y - 1) < hh) for (let i = 0; i < K; i++) { const o = (by * c.width + bx + i) * 4; for (let q = 0; q < 3; q++) D[o + q] = Math.min(255, D[o + q] * 1.25); }
    if (hg(x, y + 1) < hh || t === T.LEDGE) for (let i = 0; i < K; i++) { const o = ((by + K - 1) * c.width + bx + i) * 4; for (let q = 0; q < 3; q++) D[o + q] *= 0.6; }
    if (t === T.LEDGE_E) for (let j = 0; j < K; j++) { const o = ((by + j) * c.width + bx + K - 1) * 4; for (let q = 0; q < 3; q++) D[o + q] *= 0.6; }
    if (t === T.LEDGE_W) for (let j = 0; j < K; j++) { const o = ((by + j) * c.width + bx) * 4; for (let q = 0; q < 3; q++) D[o + q] *= 0.6; }
  }
  ctx.putImageData(im, 0, 0);
  // bâtiments : toit coloré, porte
  const TOIT = { center: '#e04848', mart: '#3a78d8', gym: '#e0a020', league: '#9333ea', lab: '#8a96a8', tower: '#8a8a96' };
  const MAISONS = ['#c0504a', '#4a78b0', '#5a9a58', '#a0703c', '#7a5aa0', '#3a8a8a'];
  for (const b of m.buildings || []) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.d < y0 || b.y > y1 || b.kind === 'cave') continue;
    const X = (b.x - x0) * K, Y = (b.y - y0) * K, Wd = b.w * K, Hd = b.d * K;
    const roof = TOIT[b.kind] || (typeof b.roof === 'string' && b.roof.startsWith('#') ? b.roof : MAISONS[Math.floor(hash(b.x, b.y) * MAISONS.length)]);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(X + 2, Y + 2, Wd, Hd);
    ctx.fillStyle = '#1e1a18'; ctx.fillRect(X - 1, Y - 1, Wd + 2, Hd + 2);
    ctx.fillStyle = roof; ctx.fillRect(X, Y, Wd, Hd);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(X, Y, Wd, Math.max(2, Hd * 0.3));
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(X, Y + Hd - 2, Wd, 2);
    if (b.doorX != null) { ctx.fillStyle = '#3a2416'; ctx.fillRect((b.doorX - x0) * K + 1, (b.doorY - y0) * K, K - 2, K); }
  }
  return c;
}

/** repères à écrire par-dessus : bâtiments utiles et sorties vers les lieux voisins */
function reperes(game, L) {
  const { m, x0, y0, x1, y1 } = L, out = [];
  const NOMS = { center: ['Centre', '+', '#e04848'], mart: ['Boutique', '¤', '#3a78d8'], gym: ['Arène', '★', '#e0a020'], league: ['Ligue', '♛', '#9333ea'], lab: ['Labo', '⚗', '#8a96a8'] };
  for (const b of m.buildings || []) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.d < y0 || b.y > y1) continue;
    if (b.kind === 'cave') { out.push({ x: b.doorX ?? b.x + b.w / 2, y: (b.doorY ?? b.y + b.d) + 0.5, txt: 'Grotte', ico: '◖', col: '#5a4636', vu: caseVue(game, L.id, b.doorX ?? b.x, b.doorY ?? b.y) }); continue; }
    const n = NOMS[b.kind]; if (!n) continue;
    out.push({ x: b.x + b.w / 2, y: b.y + b.d / 2, txt: n[0], ico: n[1], col: n[2], vu: caseVue(game, L.id, Math.floor(b.x + b.w / 2), Math.floor(b.y + b.d / 2)) });
  }
  if (L.id === 'monde') {
    // sorties : un chemin praticable qui franchit le bord du lieu vers une autre zone
    const W = m, groupes = [];
    const pousse = (x, y, ox, oy, dir) => {
      const t = W.get(ox, oy); if (![T.PATH, T.GRASS, T.TALL, T.PAVE, T.BRIDGE, T.SAND, T.SNOW, T.FLOWER, T.STAIRS, T.ASH, T.DARKTALL].includes(t) || ![T.PATH, T.PAVE, T.BRIDGE, T.STAIRS].includes(W.get(x, y))) return;
      const z = W.zoneAt(ox, oy), n = z?.name; if (!n || n === L.nom || z.sea) return;
      const g = groupes.find((q) => q.n === n && q.dir === dir && Math.abs(q.x - x) + Math.abs(q.y - y) < 10);
      if (g) { g.k++; g.x += (x - g.x) / g.k; g.y += (y - g.y) / g.k; } else groupes.push({ n, dir, x, y, k: 1, ox, oy, vu: caseVue(game, 'monde', x, y), loin: caseVue(game, 'monde', ox, oy) });
    };
    for (let x = x0; x <= x1; x++) { pousse(x, y0, x, y0 - 1, 'n'); pousse(x, y1, x, y1 + 1, 's'); }
    for (let y = y0; y <= y1; y++) { pousse(x0, y, x0 - 1, y, 'o'); pousse(x1, y, x1 + 1, y, 'e'); }
    for (const g of groupes) out.push({ x: g.x + 0.5, y: g.y + 0.5, txt: g.loin ? g.n : '???', sortie: g.dir, vu: g.vu });
  } else {
    for (const [k, w] of m.warps || []) {
      const [x, y] = k.split(',').map(Number);
      const vers = w.map === 'monde' ? 'Sortie' : game.world.maps[w.map]?.floor === 'cave' ? (game.world.maps[w.map]?.name === m.name ? 'Passage' : game.world.maps[w.map]?.name || 'Passage') : 'Sortie';
      if (out.some((q) => q.txt === vers && Math.abs(q.x - x) + Math.abs(q.y - y) < 4)) continue;
      out.push({ x: x + 0.5, y: y + 0.5, txt: vers, ico: '⇱', col: '#2a2420', vu: caseVue(game, m.id, x, y) });
    }
  }
  return out;
}

/** cadre (en cases) qui montre tout le lieu au ratio du canvas */
export function vueLocale(L, ar) {
  let w = L.x1 - L.x0 + 1, h = L.y1 - L.y0 + 1;
  const pad = Math.max(3, Math.round(Math.max(w, h) * 0.08)); w += pad * 2; h += pad * 2;
  if (w / h > ar) h = w / ar; else w = h * ar;
  return { x: (L.x0 + L.x1 + 1) / 2 - w / 2, y: (L.y0 + L.y1 + 1) / 2 - h / 2, w, h };
}

/** prépare la carte locale (dessin des cases, repères) : à garder pendant que l'écran est ouvert */
export function preparerLocale(game) {
  const L = zoneLocale(game);
  L.img = peindre(L); L.reperes = reperes(game, L);
  return L;
}

/** dessine la carte locale L dans le canvas cv, cadre v (en cases) */
export function dessinerLocale(game, cv, L, v) {
  const ctx = cv.getContext('2d'), sx = cv.width / v.w, sy = cv.height / v.h;
  const X = (x) => (x - v.x) * sx, Y = (y) => (y - v.y) * sy;
  ctx.fillStyle = L.grotte ? '#0d0a08' : '#0b1c2d'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(L.img, X(L.x0), Y(L.y0), (L.x1 - L.x0 + 1) * sx, (L.y1 - L.y0 + 1) * sy);
  // cadre du lieu
  ctx.strokeStyle = 'rgba(0, 224, 255, .55)'; ctx.lineWidth = 2;
  ctx.strokeRect(X(L.x0), Y(L.y0), (L.x1 - L.x0 + 1) * sx, (L.y1 - L.y0 + 1) * sy);
  // brouillard sur ce qu'on n'a pas encore vu
  const B = L.id === 'monde' ? 8 : BLOC_LOCAL;
  ctx.save(); ctx.beginPath(); ctx.rect(X(L.x0), Y(L.y0), (L.x1 - L.x0 + 1) * sx, (L.y1 - L.y0 + 1) * sy); ctx.clip();
  brouillard(ctx, cv, seenMask(game, L.id), B, v);
  ctx.restore();
  // repères (seulement ceux qu'on a déjà vus)
  const f = Math.max(11, Math.min(16, sx * 2.6)) * (window.devicePixelRatio || 1) / (window.devicePixelRatio || 1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of L.reperes) {
    if (!r.vu) continue;
    const cx = X(r.x), cy = Y(r.y);
    if (r.sortie) {
      const a = { n: -Math.PI / 2, s: Math.PI / 2, o: Math.PI, e: 0 }[r.sortie], s = Math.max(7, f * 0.7);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = '#00e0ff'; ctx.strokeStyle = '#0b1c2d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.lineTo(-s * 0.6, s * 0.7); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      // le nom du lieu voisin, dehors, au-delà de la flèche
      const dx = r.sortie === 'e' ? 1 : r.sortie === 'o' ? -1 : 0, dy = r.sortie === 's' ? 1 : r.sortie === 'n' ? -1 : 0;
      const tx = cx + dx * f * 1.3, ty = cy + dy * f * 1.4;
      ctx.font = `700 ${Math.round(f)}px system-ui, sans-serif`;
      const lw = ctx.measureText(r.txt).width, al = dx > 0 ? (tx + lw > cv.width - 4 ? 'right' : 'left') : dx < 0 ? (tx - lw < 4 ? 'left' : 'right') : 'center';
      etiquette(ctx, al === 'right' && dx > 0 ? cx - f : al === 'left' && dx < 0 ? cx + f : tx, ty, r.txt, f, al);
      continue;
    }
    const rr = Math.max(7, f * 0.62);
    ctx.fillStyle = '#0b1c2d'; ctx.beginPath(); ctx.arc(cx, cy, rr + 2, 0, 7); ctx.fill();
    ctx.fillStyle = r.col; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(rr * 1.3)}px system-ui, sans-serif`; ctx.fillText(r.ico, cx, cy + 1);
    etiquette(ctx, cx, cy + rr + f * 0.75, r.txt, f, 'center');
  }
}

function etiquette(ctx, x, y, txt, f, align) {
  ctx.font = `700 ${Math.round(f)}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 16, 28, .9)'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = '#f1f5f9'; ctx.fillText(txt, x, y);
}
