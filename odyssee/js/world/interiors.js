// odyssee/js/world/interiors.js — intérieurs (centre, boutique, maisons, labo, arènes, Ligue) et grottes
import { T } from './tiles.js';
import { GameMap, rng } from './mapgen.js';

/** pièce vide : murs du fond (2 rangées), murs latéraux, tapis de sortie en bas */
function room(id, w, h, o = {}) {
  const m = new GameMap(id, w, h, { outdoor: false, fill: T.FLOOR, floor: o.floor || 'wood', music: o.music || 'house', name: o.name, wallStyle: o.wall || 'wall_in', battleBg: o.battleBg || 'indoor' });
  for (let x = 0; x < w; x++) { m.set(x, 0, T.WALL); m.set(x, 1, T.WALL); }
  for (let y = 0; y < h; y++) { m.set(0, y, T.WALL); m.set(w - 1, y, T.WALL); }
  m.exitX = o.exitX ?? (w >> 1); m.exitY = h - 1;
  m.set(m.exitX, m.exitY, T.MAT);
  if (o.wide) m.set(m.exitX - 1, m.exitY, T.MAT);
  return m;
}
const counter = (m, x0, x1, y, front = 'counterfront') => { for (let x = x0; x <= x1; x++) { m.set(x, y, T.BLOCK); m.deco.push({ k: 'counter', x, y, front }); } };
const furn = (m, k, x, y) => m.prop(k, x, y, true);

export function centerInterior(id, name) {
  const m = room(id, 13, 10, { floor: 'center', music: 'center', wall: 'wall_center', name });
  counter(m, 3, 9, 4);
  m.npc({ id: id + ':infirmiere', x: 6, y: 3, sprite: 'nurse', role: 'nurse' });
  furn(m, 'healer', 8, 2); m.set(9, 2, T.BLOCK);
  furn(m, 'pc', 11, 2); m.object(11, 2, { type: 'pc' });
  furn(m, 'plant', 1, 2); furn(m, 'plant', 1, 8);
  furn(m, 'bench', 1, 6); m.set(2, 6, T.BLOCK); furn(m, 'bench', 10, 6); m.set(11, 6, T.BLOCK);
  furn(m, 'vase', 11, 8);
  return m;
}
export function martInterior(id, name, stock) {
  const m = room(id, 11, 9, { floor: 'mart', music: 'mart', wall: 'wall_mart', exitX: 2, name });
  counter(m, 1, 3, 4, 'martfront');
  m.npc({ id: id + ':vendeur', x: 2, y: 3, sprite: 'vendeur', role: 'shop', stock });
  for (const x of [6, 7, 8]) { m.set(x, 3, T.BLOCK); m.deco.push({ k: 'shelf', x, y: 3 }); m.set(x, 6, T.BLOCK); m.deco.push({ k: 'shelf', x, y: 6 }); }
  furn(m, 'plant', 9, 2);
  return m;
}
export function houseInterior(id, name, o = {}) {
  const m = room(id, o.w || 9, o.h || 8, { floor: 'wood', music: 'house', name, exitX: o.exitX });
  const w = o.w || 9;
  // avec une cuisine (frigo et évier au fond), la plante descend dans le coin pour ne pas toucher l'évier
  furn(m, 'books', 1, 2); furn(m, 'tv', 3, 2); furn(m, 'plant', o.kitchen ? 1 : w - 2, o.kitchen ? (o.h || 8) - 2 : 2);
  furn(m, 'table', 4, 4); if (o.bed) furn(m, 'bed', w - 2, 4);
  if (o.kitchen) { furn(m, 'fridge', 5, 2); furn(m, 'kitchen', 6, 2); }
  else furn(m, w > 9 ? 'clock' : 'painting', 5, 2);
  if (o.extraBooks) furn(m, 'books', 6, 2);
  if (w > 9) { furn(m, 'sofa', 7, 5); m.set(8, 5, T.BLOCK); furn(m, 'boxes', 1, 6); }
  return m;
}
export function labInterior(id) {
  const m = room(id, 13, 12, { floor: 'lab', music: 'lab', wall: 'wall_mart', name: 'Labo du Prof. Saule' });
  for (const x of [1, 2, 3, 9, 10, 11]) furn(m, 'books', x, 2);
  furn(m, 'pc', 5, 2); furn(m, 'pc', 7, 2);
  for (const x of [5, 6, 7]) { m.set(x, 5, T.BLOCK); m.deco.push({ k: 'counter', x, y: 5, front: 'counterfront', top: 'lab', ball: true }); }
  furn(m, 'plant', 1, 9); furn(m, 'plant', 11, 9); furn(m, 'labmachine', 1, 6); furn(m, 'labmachine', 11, 6);
  return m;
}
const GYM_FLOOR = { bug: 'gymBug', rock: 'gymRock', water: 'gymWater', electric: 'gymElec', grass: 'gymGrass', psychic: 'gymPsy', fire: 'gymFire', dragon: 'gymDragon' };
export function gymInterior(id, type, name) {
  const w = 15, h = 19;
  const m = room(id, w, h, { floor: GYM_FLOOR[type], music: 'gym', wall: 'wall_gym', name, battleBg: 'gym' });
  furn(m, 'gymstatue', 5, 16); furn(m, 'gymstatue', 9, 16);
  // un petit labyrinthe d'obstacles propre au type
  const obs = { bug: 'bush', rock: 'rock', water: 'pot', electric: 'pc', grass: 'bush', psychic: 'statue', fire: 'rock', dragon: 'statue' }[type];
  const layouts = {
    bug: [[2, 12, 6, 12], [8, 12, 12, 12], [4, 8, 10, 8], [2, 5, 5, 5], [9, 5, 12, 5]],
    rock: [[2, 13, 9, 13], [5, 9, 12, 9], [2, 5, 9, 5]],
    water: [[2, 12, 5, 12], [9, 12, 12, 12], [6, 8, 8, 8], [2, 5, 4, 5], [10, 5, 12, 5]],
    electric: [[3, 13, 11, 13], [2, 9, 6, 9], [8, 9, 12, 9], [4, 5, 10, 5]],
    grass: [[2, 13, 6, 13], [8, 13, 12, 13], [2, 9, 4, 9], [10, 9, 12, 9], [5, 6, 9, 6]],
    psychic: [[4, 13, 10, 13], [2, 9, 5, 9], [9, 9, 12, 9], [5, 5, 9, 5]],
    fire: [[2, 12, 8, 12], [6, 8, 12, 8], [2, 5, 6, 5]],
    dragon: [[2, 13, 5, 13], [9, 13, 12, 13], [4, 9, 10, 9], [2, 5, 4, 5], [10, 5, 12, 5]],
  }[type];
  for (const [x0, y0, x1] of layouts) for (let x = x0; x <= x1; x++) { if (x === 7) continue; furn(m, obs, x, y0); }
  // eau décorative dans l'arène Eau
  if (type === 'water') { for (const [x, y] of [[1, 10], [1, 11], [13, 10], [13, 11], [1, 3], [13, 3]]) m.set(x, y, T.WATER); }
  return m;
}
export function leagueInterior(id) {
  const m = room(id, 15, 18, { floor: 'league', music: 'league', wall: 'wall_league', name: 'Ligue Céleste', battleBg: 'league' });
  for (let y = 4; y < 17; y++) for (const x of [6, 8]) m.deco.push({ k: 'carpet', x, y });
  for (const y of [5, 9, 13]) { furn(m, 'gymstatue', 3, y); furn(m, 'gymstatue', 11, y); }
  return m;
}

/* ---------------- grottes ---------------- */
/**
 * Grotte procédurale : automate cellulaire + galeries garanties entre les entrées.
 * entries : [{ x, y }] (bord de la grotte), relié dans l'ordre.
 */
export function caveMap(id, w, h, seed, entries, o = {}) {
  const r = rng(seed);
  const m = new GameMap(id, w, h, { outdoor: false, fill: T.CAVEWALL, floor: 'cave', music: 'cave', name: o.name, battleBg: 'cave', dark: o.dark });
  m.edge = T.CAVEWALL;
  let g = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g[y * w + x] = r() < 0.47 ? 1 : 0;
  for (let it = 0; it < 4; it++) {
    const n = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += g[(y + dy) * w + x + dx];
      n[y * w + x] = c >= 5 ? 1 : 0;
    }
    g = n;
  }
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (!g[y * w + x]) m.set(x, y, T.CAVE);
  // galeries : marche aléatoire biaisée entre chaque paire d'entrées
  const dig = (x, y) => { for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) if (x + dx > 0 && y + dy > 0 && x + dx < w - 1 && y + dy < h - 1) m.set(x + dx, y + dy, T.CAVE); };
  const pts = [...entries, ...(o.via || [])];
  const order = [entries[0], ...(o.via || []), ...entries.slice(1)];
  for (let i = 1; i < order.length; i++) {
    let { x, y } = order[i - 1]; const tx = order[i].x, ty = order[i].y;
    let guard = 0;
    while ((Math.abs(x - tx) > 0 || Math.abs(y - ty) > 0) && guard++ < 5000) {
      dig(x, y);
      if (r() < 0.62) { if (Math.abs(tx - x) > Math.abs(ty - y)) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
      else if (r() < 0.5) x += r() < 0.5 ? 1 : -1; else y += r() < 0.5 ? 1 : -1;
      x = Math.max(1, Math.min(w - 3, x)); y = Math.max(2, Math.min(h - 3, y));
    }
    dig(tx, ty);
  }
  // rochers épars
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (m.get(x, y) !== T.CAVE) continue;
    const q = r();
    if (q < 0.025) { m.prop('caverock', x, y); }
    else if (q < 0.035) m.prop('stalag', x, y);
  }
  // les entrées restent dégagées
  for (const e of entries) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = m.get(e.x + dx, e.y + dy); if (t === T.BLOCK) { m.set(e.x + dx, e.y + dy, T.CAVE); m.deco = m.deco.filter((d) => !(d.x === e.x + dx && d.y === e.y + dy)); } }
  // supprimer les poches isolées (non reliées à la première entrée)
  const seen = m.reach(entries[0].x, entries[0].y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m.get(x, y) === T.CAVE && !seen[y * w + x]) m.set(x, y, T.CAVEWALL);
  m.deco = m.deco.filter((d) => { const t = m.get(d.x, d.y); return t === T.BLOCK; });
  return m;
}

/* ---------------- Tour de la Grue (Île de la Grue) ---------------- */
// Étages reliés par des escaliers (cases d'escalier = téléporteurs). L'escalier qui monte est en haut à droite,
// celui qui descend en haut à gauche ; on arrive juste en dessous.
export const TOWER_UP = { x: 11, y: 2 }, TOWER_DOWN = { x: 1, y: 2 };
export function towerFloor(id, name, o = {}) {
  const m = room(id, 13, 12, { floor: o.roof ? 'league' : 'wood', music: 'tower', wall: o.roof ? 'wall_league' : 'wall_in', name, battleBg: 'indoor' });
  if (!o.ground) m.set(m.exitX, m.exitY, T.FLOOR);   // seul le rez-de-chaussée a une porte
  if (o.up) { m.set(TOWER_UP.x, TOWER_UP.y, T.CAVEDOOR); }
  if (o.down) { m.set(TOWER_DOWN.x, TOWER_DOWN.y, T.CAVEDOOR); }
  if (o.roof) {
    // le toit : un autel au centre, des lanternes aux angles
    furn(m, 'gymstatue', 4, 4); furn(m, 'gymstatue', 8, 4);
    for (const [x, y] of [[2, 9], [10, 9], [2, 5], [10, 5]]) furn(m, 'lamp', x, y);
  } else {
    // piliers de bois et vases rituels
    for (const [x, y] of [[3, 4], [9, 4], [3, 8], [9, 8]]) furn(m, 'statue', x, y);
    furn(m, 'pot', 1, 10); furn(m, 'pot', 11, 10);
  }
  return m;
}
