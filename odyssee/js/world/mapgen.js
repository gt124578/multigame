// odyssee/js/world/mapgen.js — construction des cartes (sans DOM) : grille de terrain, bâtiments, PNJ, téléporteurs.
import { T, walkable } from './tiles.js';

export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const key = (x, y) => x + ',' + y;

export const BUILDINGS = {
  house: { w: 4, d: 3, h: 2, door: 1 }, house2: { w: 5, d: 3, h: 2, door: 2 }, bighouse: { w: 6, d: 4, h: 3, door: 2 },
  center: { w: 5, d: 4, h: 2, door: 2, style: 'center', roof: 'red' }, mart: { w: 4, d: 4, h: 2, door: 1, style: 'mart', roof: 'blue' },
  gym: { w: 7, d: 5, h: 2, door: 3, style: 'gym', roof: 'gray' }, lab: { w: 6, d: 4, h: 2, door: 2, style: 'lab', roof: 'teal' },
  league: { w: 9, d: 6, h: 3, door: 4, style: 'league', roof: 'purple' }, cave: { w: 5, d: 3, h: 2, door: 2, style: 'cave', roof: 'cave' },
  tower: { w: 4, d: 4, h: 3, door: 1, style: 'tower', roof: 'brown' }, gate: { w: 6, d: 3, h: 2, door: 2, style: 'house2', roof: 'gray' },
};

export class GameMap {
  constructor(id, w, h, o = {}) {
    this.id = id; this.w = w; this.h = h;
    this.t = new Uint8Array(w * h).fill(o.fill ?? T.TREE);
    this.hg = new Int8Array(w * h);
    this.outdoor = o.outdoor ?? true;
    this.name = o.name || id; this.music = o.music || 'route'; this.floor = o.floor || 'wood';
    this.buildings = []; this.deco = []; this.npcs = []; this.items = [];
    this.warps = new Map(); this.signs = new Map(); this.objects = new Map(); this.zones = [];
    this.gates = []; this.encounter = o.encounter || null; this.battleBg = o.battleBg || 'grass';
    this.under = new Map();
    this.dark = !!o.dark; this.wallStyle = o.wallStyle || 'wall_in'; this.edge = o.edge ?? (this.outdoor ? T.TREE : T.WALL);
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.t[y * this.w + x] : this.edge; }
  set(x, y, v) { if (this.in(x, y)) this.t[y * this.w + x] = v; }
  height(x, y) { return this.in(x, y) ? this.hg[y * this.w + x] : 0; }
  rect(x0, y0, x1, y1, v, only = null) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (!only || only.includes(this.get(x, y))) this.set(x, y, v); }
  blob(cx, cy, rx, ry, v, r = Math.random, only = null) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q <= 1 - r() * 0.25 && (!only || only.includes(this.get(x, y)))) this.set(x, y, v);
    }
  }
  zone(x0, y0, x1, y1, o) { this.zones.push({ x0, y0, x1, y1, ...o }); }
  zoneAt(x, y) { for (let i = this.zones.length - 1; i >= 0; i--) { const z = this.zones[i]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z; } return null; }
  warp(x, y, to) { this.warps.set(key(x, y), to); }
  warpAt(x, y) { return this.warps.get(key(x, y)); }
  sign(x, y, text, kind = 'sign') { this.under.set(key(x, y), this.get(x, y)); this.set(x, y, T.SIGN); this.signs.set(key(x, y), text); this.deco.push({ k: kind === 'sign' ? 'sign' : kind, x, y }); }
  object(x, y, o) { this.objects.set(key(x, y), o); }
  objectAt(x, y) { return this.objects.get(key(x, y)); }
  /** décor bloquant (lampadaire, pot…) */
  prop(k, x, y, block = true) { this.deco.push({ k, x, y }); if (block) { if (this.get(x, y) !== T.BLOCK) this.under.set(key(x, y), this.get(x, y)); this.set(x, y, T.BLOCK); } }
  underAt(x, y) { return this.under.get(key(x, y)); }

  /** pose un bâtiment ; renvoie la position de la porte */
  building(kind, x, y, o = {}) {
    const B = { ...BUILDINGS[kind] }; for (const [k, v] of Object.entries(o)) if (v !== undefined) B[k] = v;
    const b = { kind, x, y, w: B.w, d: B.d, h: B.h, door: B.door, style: B.style || (kind === 'house2' ? 'house2' : 'house'), roof: B.roof || 'red', id: o.id, label: o.label };
    for (let j = 0; j < B.d; j++) for (let i = 0; i < B.w; i++) this.set(x + i, y + j, T.BUILD);
    const dx = x + B.door, dy = y + B.d - 1;
    if (B.door >= 0) this.set(dx, dy, T.DOOR);
    b.doorX = dx; b.doorY = dy;
    this.buildings.push(b);
    return b;
  }

  /** chemin en L entre deux points (ne traverse pas les bâtiments) */
  lpath(x0, y0, x1, y1, v = T.PATH, vertFirst = true) {
    const can = (x, y) => ![T.BUILD, T.DOOR, T.WATER, T.SIGN, T.BLOCK].includes(this.get(x, y));
    const put = (x, y) => { if (can(x, y) && this.get(x, y) !== T.PAVE && this.get(x, y) !== T.BRIDGE) this.set(x, y, v); };
    if (vertFirst) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x0, y); for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y1); }
    else { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y0); for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x1, y); }
  }

  npc(o) { const n = { dir: 'down', move: 'static', sprite: 'youngster', ...o }; this.npcs.push(n); return n; }
  item(x, y, item, qty = 1, id) { this.items.push({ x, y, item, qty, id: id || `${this.id}:${x},${y}` }); }

  /** remplace l'herbe proche de l'eau par du sable */
  beaches(radius = 1) {
    const out = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const t = this.get(x, y); if (t !== T.GRASS && t !== T.TALL && t !== T.FLOWER) continue;
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy++) for (let dx = -radius; dx <= radius; dx++) if (this.get(x + dx, y + dy) === T.WATER) { near = true; break; }
      if (near) out.push([x, y]);
    }
    for (const [x, y] of out) this.set(x, y, T.SAND);
  }

  /** accessibilité depuis un point (sans tenir compte des PNJ) */
  // abil : on dispose de toutes les capacités de terrain (Coupe, Éclate-Roc, Surf)
  reach(x0, y0, passGates = true, withNpcs = false, abil = false) {
    const seen = new Uint8Array(this.w * this.h), q = [[x0, y0]]; seen[y0 * this.w + x0] = 1;
    // passGates : true (tous), false (aucun) ou un nombre de badges ; abil : true (toutes les capacités) ou un Set de cases franchissables
    const blocked = new Set(); if (passGates !== true) for (const g of this.gates) if (passGates === false || g.badges > passGates) for (const [x, y] of g.tiles) blocked.add(key(x, y));
    const can = (t) => (abil === true ? t === T.CUT || t === T.SMASH || t === T.WATER : !!abil && abil.has(t));
    if (withNpcs) { for (const n of this.npcs) if (!n.gate) blocked.add(key(n.x, n.y)); for (const it of this.items) blocked.add(key(it.x, it.y)); }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (!this.in(nx, ny) || seen[ny * this.w + nx]) continue;
        const t = this.get(nx, ny);
        let ok = (walkable(t) || can(t)) && this.height(nx, ny) === this.height(x, y);
        if (t === T.LEDGE && dy === 1 && walkable(this.get(nx, ny + 1))) { seen[ny * this.w + nx] = 1; if (!seen[(ny + 1) * this.w + nx]) { seen[(ny + 1) * this.w + nx] = 1; q.push([nx, ny + 1]); } continue; }
        if (t === T.LEDGE_E && dx === 1 && walkable(this.get(nx + 1, ny))) { if (!seen[ny * this.w + nx + 1]) { seen[ny * this.w + nx + 1] = 1; q.push([nx + 1, ny]); } continue; }
        if (t === T.LEDGE_W && dx === -1 && walkable(this.get(nx - 1, ny))) { if (!seen[ny * this.w + nx - 1]) { seen[ny * this.w + nx - 1] = 1; q.push([nx - 1, ny]); } continue; }
        if (t === T.STAIRS || this.get(x, y) === T.STAIRS) ok = walkable(t) && Math.abs(this.height(nx, ny) - this.height(x, y)) <= 1;
        if (blocked.has(key(nx, ny))) ok = false;
        if (ok) { seen[ny * this.w + nx] = 1; q.push([nx, ny]); }
      }
    }
    return seen;
  }
}

/* ======================================================================
   Routes : couloir le long d'une ligne brisée, sentier, hautes herbes, décor
   ====================================================================== */
function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / l2; t = Math.max(0, Math.min(1, t));
  const qx = ax + t * vx, qy = ay + t * vy;
  return { d: Math.hypot(px - qx, py - qy), t, side: Math.sign(vx * (py - ay) - vy * (px - ax)) };
}
/** position le long de la ligne : t∈[0,1] → point + direction */
export function along(pts, t) {
  const lens = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
  let s = t * tot;
  for (let i = 0; i < lens.length; i++) {
    if (s <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, s / lens[i]) : 0, a = pts[i], b = pts[i + 1];
      const dx = (b[0] - a[0]) / (lens[i] || 1), dy = (b[1] - a[1]) / (lens[i] || 1);
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx, dy, nx: -dy, ny: dx };
    }
    s -= lens[i];
  }
  return { x: pts[0][0], y: pts[0][1], dx: 0, dy: 1, nx: -1, ny: 0 };
}
export function routeLength(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }

/**
 * Taille un couloir de route.
 * o.w largeur, o.grass part d'herbes hautes (0..1), o.trees densité d'arbres isolés, o.tall type d'herbe, o.bridge, o.path
 */
export function carveRoute(map, pts, o = {}) {
  const r = rng(o.seed || 7), W = o.w || 9, half = W / 2;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor(x0 - half - 3); y0 = Math.floor(y0 - half - 3); x1 = Math.ceil(x1 + half + 3); y1 = Math.ceil(y1 + half + 3);
  const total = routeLength(pts);
  const info = new Map();
  // bord irrégulier : demi-largeur bruitée le long de la route
  const wob = (s) => Math.sin(s * 0.21 + (o.seed || 1)) * 0.9 + Math.sin(s * 0.53 + 2 * (o.seed || 1)) * 0.6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!map.in(x, y)) continue;
    let best = null, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const s = distSeg(x + 0.5, y + 0.5, pts[i - 1][0] + 0.5, pts[i - 1][1] + 0.5, pts[i][0] + 0.5, pts[i][1] + 0.5);
      const segLen = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (!best || s.d < best.d) best = { d: s.d, s: acc + s.t * segLen, side: s.side };
      acc += segLen;
    }
    let hw = half + wob(best.s);
    // le couloir se resserre aux extrémités pour ne pas entamer la bordure des villes
    const fromStart = best.s, fromEnd = total - best.s;
    if (o.taperStart !== false) hw = Math.min(hw, 1.1 + fromStart * 0.6);
    if (o.taperEnd !== false) hw = Math.min(hw, 1.1 + fromEnd * 0.6);
    if (best.d <= hw) {
      const cur = map.get(x, y);
      info.set(key(x, y), { d: best.d, s: best.s / total, side: best.side, hw });
      if (cur === T.WATER) { if (o.bridge && best.d <= 1.05) map.set(x, y, T.BRIDGE); continue; }
      if (cur === T.TREE || cur === T.PINE || o.overwrite) map.set(x, y, o.ground ?? T.GRASS);
      if (o.path !== false && best.d <= 1.05) map.set(x, y, o.pathT ?? T.PATH);
    }
  }
  // hautes herbes
  const tall = o.tall ?? T.TALL;
  const nPatch = Math.round(total / 9 * (o.grass ?? 0.6));
  for (let i = 0; i < nPatch; i++) {
    const p = along(pts, (i + 0.5 + (r() - 0.5) * 0.6) / nPatch);
    const side = r() < 0.5 ? -1 : 1, off = 2 + r() * Math.max(0.5, half - 3);
    const cx = p.x + p.nx * side * off, cy = p.y + p.ny * side * off;
    map.blob(cx + 0.5, cy + 0.5, 1.5 + r() * 3, 1.5 + r() * 2.5, tall, r, [T.GRASS]);
  }
  if (o.grassOnPath) { /* herbes sur toute la largeur (routes sauvages) */
    for (const [k, v] of info) { const [x, y] = k.split(',').map(Number); if (map.get(x, y) === T.GRASS && r() < o.grassOnPath) map.set(x, y, tall); }
  }
  // arbres isolés, rochers, fleurs, buissons
  for (const [k, v] of info) {
    const [x, y] = k.split(',').map(Number);
    if (map.get(x, y) !== T.GRASS || v.d < 2.6 || v.d > v.hw - 0.5) continue;
    const q = r();
    if (q < (o.trees ?? 0.05)) map.set(x, y, o.treeT ?? T.TREE);
    else if (q < (o.trees ?? 0.05) + (o.flowers ?? 0.02)) map.set(x, y, T.FLOWER);
    else if (q < (o.trees ?? 0.05) + (o.flowers ?? 0.02) + (o.rocks ?? 0.006)) map.set(x, y, T.ROCK);
  }
  return { info, total };
}

/** rebords (sauts vers le bas) sur le côté d'une route verticale, en dehors du sentier */
export function ledges(map, pts, ts, o = {}) {
  for (const t of ts) {
    const p = along(pts, t), y = Math.round(p.y), cx = Math.round(p.x);
    for (const side of [-1, 1]) {
      for (let k = 2; k < (o.reach || 8); k++) {
        const x = cx + side * k;
        if (map.get(x, y) !== T.GRASS && map.get(x, y) !== T.TALL) break;
        if (!(walkable(map.get(x, y - 1)) && walkable(map.get(x, y + 1)))) continue;
        map.set(x, y, T.LEDGE);
      }
    }
  }
}

/** point praticable le plus proche d'une position */
export function nearestWalkable(map, x, y, avoid = new Set()) {
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
    const t = map.get(nx, ny);
    if ((t === T.GRASS || t === T.PATH || t === T.TALL || t === T.SAND || t === T.CAVE || t === T.ASH || t === T.FLOOR || t === T.FLOWER || t === T.DARKTALL || t === T.SNOW || t === T.BRIDGE) && !avoid.has(key(nx, ny))) return [nx, ny];
  }
  return [Math.round(x), Math.round(y)];
}

/* ======================================================================
   Villes : sol, routes pavées, bâtiments reliés aux routes par des chemins
   ====================================================================== */
export function carveTown(map, o) {
  const { x, y, w, h } = o;
  map.rect(x + 2, y + 2, x + w - 3, y + h - 3, o.ground ?? T.GRASS);
  // sorties : couloirs de 2 tuiles jusqu'au bord
  for (const [dir, k] of o.exits || []) {
    if (dir === 'n') map.rect(x + k, y, x + k + 1, y + 2, T.PATH);
    if (dir === 's') map.rect(x + k, y + h - 3, x + k + 1, y + h - 1, T.PATH);
    if (dir === 'w') map.rect(x, y + k, x + 2, y + k + 1, T.PATH);
    if (dir === 'e') map.rect(x + w - 3, y + k, x + w - 1, y + k + 1, T.PATH);
  }
}
