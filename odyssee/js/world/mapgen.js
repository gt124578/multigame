// odyssee/js/world/mapgen.js — construction des cartes (sans DOM) : grille de terrain, bâtiments, PNJ, téléporteurs.
import { T, walkable } from './tiles.js';

/** sinus et cosinus calculés à la main (série de Taylor après réduction) : Math.sin ne donne pas exactement les mêmes
 *  décimales d'un moteur JavaScript à l'autre (Node, Chrome, Firefox…), et la carte, tirée au hasard à partir de ces
 *  valeurs, doit être la même partout (jeu, tests, joueurs en ligne) */
export function sin(x) {
  const PI = 3.141592653589793, H = 1.5707963267948966;
  let r = x - Math.round(x / 6.283185307179586) * 6.283185307179586;
  if (r > H) r = PI - r; else if (r < -H) r = -PI - r;
  const q = r * r;
  return r * (1 + q * (-1 / 6 + q * (1 / 120 + q * (-1 / 5040 + q * (1 / 362880 + q * (-1 / 39916800 + q * (1 / 6227020800 + q * (-1 / 1307674368000 + q / 355687428096000))))))));
}
export const cos = (x) => sin(x + 1.5707963267948966);
/** mélange L comme le faisait L.sort(() => r() - 0.5) dans Chrome (V8 récent : tri par insertion dichotomique jusqu'à
 *  15 éléments, puis une montée ou descente de départ et le même tri ; Node et les autres navigateurs ne posent pas les
 *  mêmes comparaisons, et la carte en dépendait). Au-delà de 63 éléments, un simple mélange de Fisher-Yates. */
export function melanger(L, r) {
  const n = L.length, cmp = () => r() - 0.5;
  if (n >= 64) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } return L; }
  let debut = 1;
  if (n >= 16) {
    // la montée (ou descente, retournée) du début
    let len = 2; const desc = cmp(L[1], L[0]) < 0; let prev = L[1];
    for (let i = 2; i < n; i++) { const c = L[i], o = cmp(c, prev); if (desc ? o >= 0 : o < 0) break; prev = c; len++; }
    if (desc) for (let i = 0, j = len - 1; i < j; i++, j--) [L[i], L[j]] = [L[j], L[i]];
    debut = len;
  }
  for (let i = debut; i < n; i++) {
    const p = L[i]; let a = 0, b = i;
    while (a < b) { const m = a + ((b - a) >> 1); if (cmp(p, L[m]) < 0) b = m; else a = m + 1; }
    for (let k = i; k > a; k--) L[k] = L[k - 1]; L[a] = p;
  }
  return L;
}
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const key = (x, y) => x + ',' + y;

export const BUILDINGS = {
  house: { w: 4, d: 3, h: 2, door: 1 }, house2: { w: 5, d: 3, h: 2, door: 2 }, bighouse: { w: 6, d: 4, h: 3, door: 2 },
  center: { w: 5, d: 4, h: 3, door: 2, style: 'center', roof: 'red' }, mart: { w: 4, d: 4, h: 3, door: 1, style: 'mart', roof: 'blue' },
  gym: { w: 7, d: 5, h: 3, door: 3, style: 'gym', roof: 'gray' }, lab: { w: 6, d: 4, h: 3, door: 2, style: 'lab', roof: 'teal' },
  league: { w: 9, d: 6, h: 4, door: 4, style: 'league', roof: 'purple' }, cave: { w: 5, d: 3, h: 2, door: 2, style: 'cave', roof: 'cave' },
  tower: { w: 4, d: 4, h: 3, door: 1, style: 'tower', roof: 'brown' }, gate: { w: 6, d: 3, h: 2, door: 2, style: 'house2', roof: 'gray' },
};

/** emprises des bâtiments en fausse 3D (modèles de render/batiments3d.js) : à étaler dans une définition de ville,
 *  ex. { kind: 'gym', ...GRAND.gym, x, y }. door / door2 : cases de porte ; blocs : cases bloquées autour (statues, étal…) ;
 *  libres : cases du rectangle où l'on marche (porche) ; porteY : rangée de la porte (sinon la dernière) */
export const GRAND = {
  center: { w: 7, d: 5, h: 3, door: 3 },
  mart: { w: 5, d: 4, h: 3, door: 3, blocs: [[0, 4], [1, 4], [2, 4]] },
  // arène à portique (8 × 11, voûte, statue du champion) ; dx, dy : décalage depuis l'ancien emplacement (18 × 14),
  // pour garder la porte dans la même colonne et la façade sur la même rangée
  gym: { w: 8, d: 11, h: 8, door: 3, door2: 4, blocs: [[0, 11], [7, 11]], dx: 5, dy: 3 },
  // laboratoire : le hall vitré et ses portes au milieu, sous la casquette ; on marche de part et d'autre du hall et
  // devant la serre (le banc et les deux jardinières restent bloqués)
  lab: { w: 10, d: 7, h: 4, door: 2, door2: 3, libres: [[0, 5], [5, 5], [6, 5], [8, 5], [9, 5], [1, 6], [4, 6], [6, 6], [7, 6], [8, 6], [9, 6]] },
  // la Ligue : bâtiment 30 × 14, puis une allée de 32 cases plein sud (x 11 → 18) bordée de colonnes, à laisser libre
  league: { w: 30, d: 14, h: 12, door: 14, door2: 15, blocs: [[11, 19], [18, 19], [11, 21], [18, 21], [11, 24], [18, 24], [11, 26], [18, 26], [11, 29], [18, 29], [11, 31], [18, 31], [11, 34], [18, 34], [11, 36], [18, 36], [11, 39], [18, 39], [11, 41], [18, 41], [11, 44], [18, 44], [11, 46], [18, 46], [9, 14], [10, 14], [9, 15], [10, 15], [19, 14], [20, 14], [19, 15], [20, 15], [12, 15], [17, 15], [10, 47], [19, 47]] },
  pagode: { w: 11, d: 11, h: 15, door: 5, modele: 'pagode' },
  // pavillon de temple (Temple Kagura) : estrade, colonnade rouge, double toit ; la rangée du bas porte l'escalier
  // (porte de 2 cases au milieu), ses coins restent libres
  pavillon: { w: 8, d: 7, h: 4, door: 3, door2: 4, libres: [[0, 6], [1, 6], [6, 6], [7, 6]], modele: 'pavillon' },
  // la Tour Cendrée (Forêt des Torii) : pagode de bois brûlée, étages effondrés
  tourCendree: { w: 11, d: 11, h: 8, door: 5, modele: 'tourCendree' },
  casino: { w: 14, d: 8, h: 6, door: 6, door2: 7, blocs: [[2, 8], [5, 8], [8, 8], [11, 8], [0, 8], [13, 8]], modele: 'casino' },
  bourse: { w: 12, d: 8, h: 7, door: 5, door2: 6, blocs: [[0, 8], [11, 8]], modele: 'bourse' },
  mairie: { w: 9, d: 5, h: 5, door: 4, modele: 'mairie' },
  usine: { w: 32, d: 10, h: 8, door: 15, door2: 16, modele: 'usinePokeball' },
  // maison en L : la terrasse devant le corps, à droite de l'aile ; le poteau du porche (3, 3) reste bloqué
  maisonL: { w: 5, d: 5, h: 3, door: 2, porteY: 2, libres: [[2, 3], [4, 3], [2, 4], [3, 4], [4, 4]], modele: 'maisonL' },
};
/** modèles dont l'emprise a des parties ouvertes (terrasse, porche, galerie) : la porte est au fond, contre la façade, et
 *  l'on marche devant elle. Appliqué à tout bâtiment posé avec ce modèle et cette emprise (villes, lieux, éditeur), même
 *  quand la définition donne une autre porte : sinon la porte du jeu tombe au milieu de la terrasse du dessin. */
export const OUVERTS = {
  maisonL: GRAND.maisonL,
  // chalet : le balcon de l'étage avance au-dessus de la dernière rangée, sur deux poteaux aux coins
  chalet: { w: 5, d: 5, door: 1, porteY: 3, libres: [[1, 4], [2, 4], [3, 4]] },
  // auberge : la terrasse et ses deux tables à parasol devant la façade ; porte de deux cases
  auberge: { w: 6, d: 5, door: 2, door2: 3, porteY: 3, libres: [[1, 4], [2, 4], [3, 4], [4, 4]] },
  // maison de thé : on monte à la galerie (engawa) par les marches, entre les deux lanternes de pierre
  maisonThe: { w: 5, d: 5, door: 2, porteY: 3, libres: [[1, 4], [2, 4], [3, 4]] },
  pavillon: GRAND.pavillon,
};

/** combien de rangées au nord de son emprise un bâtiment cache à l'écran (hauteur du modèle, caméra inclinée) : on ne
 *  pose pas une porte dans cette ombre */
const HAUT_VUE = { maisonHaute: 7, chapelle: 6, mairie: 5, auberge: 4, gare: 3, boulangerie: 3, maisonThe: 3, chalet: 3, maisonL: 3, residence: 3, moulin: 6, phare: 8, grange: 4 };
export function hauteurVue(b) {
  if (b.modele && HAUT_VUE[b.modele]) return HAUT_VUE[b.modele];
  if (b.kind === 'gym') return 8;
  if (b.kind === 'bighouse' || b.kind === 'center' || b.kind === 'mart') return 3;
  if (b.kind === 'lab' || b.kind === 'league') return 4;
  if (b.kind === 'tower') return Math.min(9, b.h || 3);
  return 2;
}

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
  setHeight(x, y, h) { if (this.in(x, y)) this.hg[y * this.w + x] = h; }
  /** peut-on passer d'une case à sa voisine selon le relief ? même hauteur, ou une marche d'escalier (un niveau d'écart) */
  canStep(x0, y0, x1, y1) {
    const a = this.height(x0, y0), b = this.height(x1, y1);
    return a === b || ((this.get(x0, y0) === T.STAIRS || this.get(x1, y1) === T.STAIRS) && Math.abs(a - b) <= 1);
  }
  rect(x0, y0, x1, y1, v, only = null) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (!only || only.includes(this.get(x, y))) this.set(x, y, v); }
  blob(cx, cy, rx, ry, v, r = Math.random, only = null) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q <= 1 - r() * 0.25 && (!only || only.includes(this.get(x, y)))) this.set(x, y, v);
    }
  }
  zone(x0, y0, x1, y1, o) { this.zones.push({ x0, y0, x1, y1, ...o }); }
  /** la zone d'une case (la dernière posée l'emporte). Index par carreaux de 32 cases, refait quand la liste change :
   *  la grande carte compte des centaines de zones et le rendu interroge chaque case */
  zoneAt(x, y) {
    const Z = this.zones;
    if (!this.in(x, y)) { for (let i = Z.length - 1; i >= 0; i--) { const z = Z[i]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z; } return null; }
    let I = this._zi;
    if (!I || I.z !== Z || I.n !== Z.length) I = this._zi = indexZones(Z, this.w, this.h);
    const c = I.cells[(y >> 5) * I.cw + (x >> 5)];
    if (c) for (let k = c.length - 1; k >= 0; k--) { const z = Z[c[k]]; if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return z; }
    return null;
  }
  warp(x, y, to) { this.warps.set(key(x, y), to); }
  warpAt(x, y) { return this.warps.get(key(x, y)); }
  sign(x, y, text, kind = 'sign') { this.under.set(key(x, y), this.get(x, y)); this.set(x, y, T.SIGN); this.signs.set(key(x, y), text); this.deco.push({ k: kind === 'sign' ? 'sign' : kind, x, y }); }
  object(x, y, o) { this.objects.set(key(x, y), o); }
  objectAt(x, y) { return this.objects.get(key(x, y)); }
  /** décor bloquant (lampadaire, pot…) */
  prop(k, x, y, block = true, o = {}) { this.deco.push({ k, x, y, ...o }); if (block) { if (this.get(x, y) !== T.BLOCK) this.under.set(key(x, y), this.get(x, y)); this.set(x, y, T.BLOCK); } }
  underAt(x, y) { return this.under.get(key(x, y)); }

  /** pose un bâtiment ; renvoie la position de la porte */
  building(kind, x, y, o = {}) {
    const B = { ...BUILDINGS[kind] }; for (const [k, v] of Object.entries(o)) if (v !== undefined) B[k] = v;
    const ouv = OUVERTS[B.modele];
    if (ouv && ouv.w === B.w && ouv.d === B.d) for (const k of ['door', 'door2', 'porteY', 'libres']) if (ouv[k] !== undefined) B[k] = ouv[k];
    const b = { kind, x, y, w: B.w, d: B.d, h: B.h, door: B.door, style: B.style || (kind === 'house2' ? 'house2' : 'house'), roof: B.roof || 'red', id: o.id, label: o.label, name: o.name, kit: o.kit, flat: o.flat, modele: B.modele, opts: B.opts };
    Object.defineProperty(b, 'o', { value: o, enumerable: false, writable: true });   // réglages d'origine (l'éditeur de carte déplace et copie les bâtiments)
    // emprise : rectangle w × d bâti, sauf les cases « libres » (porche, cour de devant…) ; « blocs » : cases bloquées
    // autour (étal, statues, colonnes, lampadaires du modèle 3D) ; porte sur la rangée du bas, ou sur porteY
    const libres = new Set((B.libres || []).map(([i, j]) => i + ',' + j));
    for (let j = 0; j < B.d; j++) for (let i = 0; i < B.w; i++) {
      if (!libres.has(i + ',' + j)) this.set(x + i, y + j, T.BUILD);
      else if (!walkable(this.get(x + i, y + j)) || this.get(x + i, y + j) === T.GRASS || this.get(x + i, y + j) === T.FLOWER || this.get(x + i, y + j) === T.TALL || this.get(x + i, y + j) === T.SAND) this.set(x + i, y + j, T.PAVE);   // terrasse dallée, au niveau du sol
    }
    if (libres.size) b.libres = [...libres].map((k) => k.split(',').map(Number));
    for (const [i, j] of B.blocs || []) { if (this.get(x + i, y + j) !== T.BLOCK) this.under.set(key(x + i, y + j), this.get(x + i, y + j)); this.set(x + i, y + j, T.BLOCK); }
    const dx = x + B.door, dy = y + (B.porteY ?? B.d - 1);
    if (B.door >= 0) this.set(dx, dy, T.DOOR);
    if (B.door2 !== undefined) { this.set(x + B.door2, dy, T.DOOR); b.door2X = x + B.door2; }
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
  item(x, y, item, qty = 1, id) {
    // objets posés avant le grand remaniement de la carte : chacun garde son ancien identifiant (les sauvegardes notent les
    // objets ramassés par identifiant). La file `anciensObjets` les donne dans l'ordre où ils sont posés ; un objet sans
    // identifiant qui ne correspond pas arrête tout (tout nouvel objet doit recevoir un identifiant fixe)
    if (!id && this.anciensObjets?.length) {
      const [oid, quoi] = this.anciensObjets.shift();
      if (quoi !== item) throw new Error(`objet sans identifiant (${item} en ${x},${y}) : on attendait ${quoi} (${oid}). Donne un identifiant fixe aux nouveaux objets.`);
      id = oid;
    }
    this.items.push({ x, y, item, qty, id: id || `${this.id}:${x},${y}` });
  }

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
    const can = (t) => (abil === true ? t === T.CUT || t === T.SMASH || t === T.WATER || t === T.BOULDER : !!abil && abil.has(t));
    if (withNpcs) { for (const n of this.npcs) if (!n.gate) blocked.add(key(n.x, n.y)); for (const it of this.items) blocked.add(key(it.x, it.y)); }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (!this.in(nx, ny) || seen[ny * this.w + nx]) continue;
        const t = this.get(nx, ny);
        let ok = (walkable(t) || can(t)) && this.height(nx, ny) === this.height(x, y);
        if (t === T.BRIDGE && this.get(x, y) === T.WATER) ok = false;   // en surf, on passe sous les ponts sans y monter
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

/** index des zones par carreaux de 32 cases (indices dans l'ordre de la liste) */
function indexZones(Z, w, h) {
  const cw = Math.ceil(w / 32), ch = Math.ceil(h / 32), cells = new Array(cw * ch);
  Z.forEach((z, i) => {
    const a = Math.max(0, z.x0 >> 5), b = Math.max(0, z.y0 >> 5), c = Math.min(cw - 1, Math.max(0, z.x1) >> 5), d = Math.min(ch - 1, Math.max(0, z.y1) >> 5);
    for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) (cells[y * cw + x] ||= []).push(i);
  });
  return { z: Z, n: Z.length, cw, cells };
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
  const wob = (s) => sin(s * 0.21 + (o.seed || 1)) * 0.9 + sin(s * 0.53 + 2 * (o.seed || 1)) * 0.6;
  // distance de chaque case au tracé : chaque segment ne regarde que les cases de son voisinage (les longues routes
  // sinueuses ont des centaines de segments) ; à distance égale, le premier segment l'emporte
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, R = half + 3;
  const bd = new Float64Array(bw * bh).fill(Infinity), bs = new Float64Array(bw * bh), bside = new Int8Array(bw * bh);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0] + 0.5, ay = pts[i - 1][1] + 0.5, bx = pts[i][0] + 0.5, by = pts[i][1] + 0.5;
    const segLen = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const sx0 = Math.max(x0, Math.floor(Math.min(ax, bx) - R - 1)), sx1 = Math.min(x1, Math.ceil(Math.max(ax, bx) + R + 1));
    const sy0 = Math.max(y0, Math.floor(Math.min(ay, by) - R - 1)), sy1 = Math.min(y1, Math.ceil(Math.max(ay, by) + R + 1));
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      const s2 = distSeg(x + 0.5, y + 0.5, ax, ay, bx, by), k = (y - y0) * bw + (x - x0);
      if (s2.d < bd[k]) { bd[k] = s2.d; bs[k] = acc + s2.t * segLen; bside[k] = s2.side; }
    }
    acc += segLen;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!map.in(x, y)) continue;
    const k = (y - y0) * bw + (x - x0); if (bd[k] === Infinity) continue;
    const best = { d: bd[k], s: bs[k], side: bside[k] };
    let hw = half + wob(best.s);
    // le couloir se resserre aux extrémités pour ne pas entamer la bordure des villes
    const fromStart = best.s, fromEnd = total - best.s;
    if (o.taperStart !== false) hw = Math.min(hw, 1.1 + fromStart * 0.6);
    if (o.taperEnd !== false) hw = Math.min(hw, 1.1 + fromEnd * 0.6);
    if (best.d <= hw) {
      const cur = map.get(x, y);
      if (cur === T.BUILD || cur === T.DOOR || cur === T.CAVEDOOR || cur === T.SIGN || cur === T.BLOCK) continue;   // bâtiments et décor posés restent
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

/** case libre pour un dresseur, un promeneur ou un objet près d'une position : praticable (ni porte, ni marche, ni pont),
 *  sans personne ni objet, loin des portes et téléporteurs, et qui ne bouche aucun passage (ses voisins restent reliés
 *  sans elle) ; à défaut, la case praticable la plus proche */
export function caseLibre(map, x, y) {
  const occ = (a, b) => map.npcs.some((n) => n.x === a && n.y === b) || map.items.some((i) => i.x === a && i.y === b);
  const SOL = new Set([T.GRASS, T.PATH, T.TALL, T.SAND, T.CAVE, T.ASH, T.FLOOR, T.FLOWER, T.DARKTALL, T.SNOW, T.PAVE]);
  const libre = (a, b) => SOL.has(map.get(a, b)) && !occ(a, b) && !map.warpAt(a, b) && map.get(a, b) !== T.SIGN;
  // près d'une porte, d'un téléporteur ou au pied d'un escalier : on ne s'y met pas (on boucherait le passage)
  const pres = (a, b) => { for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const d = Math.abs(i) + Math.abs(j); if (d <= 2 && (map.warpAt(a + i, b + j) || map.get(a + i, b + j) === T.DOOR)) return true; if (d === 1 && (map.get(a + i, b + j) === T.STAIRS || map.get(a + i, b + j) === T.BRIDGE)) return true; } return false; };
  const simple = (a, b) => {
    const h = map.height(a, b), ok = (i, j) => (i || j) && walkable(map.get(a + i, b + j)) && !occ(a + i, b + j) && map.height(a + i, b + j) === h;
    const ring = []; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (ok(i, j)) ring.push(i + ',' + j);
    const four = ['0,-1', '1,0', '0,1', '-1,0'].filter((k) => ring.includes(k)); if (four.length <= 1) return four.length === 1;
    const vu = new Set([four[0]]), q = [four[0]];
    while (q.length) { const [i, j] = q.pop().split(',').map(Number); for (const [c, d] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const k = c + ',' + d; if (ring.includes(k) && !vu.has(k)) { vu.add(k); q.push(k); } } }
    return four.every((k) => vu.has(k));
  };
  const X = Math.round(x), Y = Math.round(y);
  for (let r = 0; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const a = X + dx, b = Y + dy; if (libre(a, b) && !pres(a, b) && simple(a, b)) return [a, b];
  }
  return nearestWalkable(map, x, y);
}

/* ======================================================================
   Villes : sol, routes pavées, bâtiments reliés aux routes par des chemins
   ====================================================================== */
export function carveTown(map, o) {
  const { x, y, w, h } = o;
  // villes agrandies : la bordure redevient forêt (une route plus large qui y arrive ne contourne pas la sortie gardée)
  if (o.fermer) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < 2 || j < 2 || i >= w - 2 || j >= h - 2) map.set(x + i, y + j, T.TREE);
  map.rect(x + 2, y + 2, x + w - 3, y + h - 3, o.ground ?? T.GRASS);
  // sorties : couloirs de 2 tuiles jusqu'au bord
  for (const [dir, k] of o.exits || []) {
    if (dir === 'n') map.rect(x + k, y, x + k + 1, y + 2, T.PATH);
    if (dir === 's') map.rect(x + k, y + h - 3, x + k + 1, y + h - 1, T.PATH);
    if (dir === 'w') map.rect(x, y + k, x + 2, y + k + 1, T.PATH);
    if (dir === 'e') map.rect(x + w - 3, y + k, x + w - 1, y + k + 1, T.PATH);
  }
}
