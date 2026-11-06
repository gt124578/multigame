// odyssee/js/world/retouches.js — retouches de la carte faites dans l'éditeur de la version test (odyssee/test/).
//
// L'éditeur range chaque retouche dans le navigateur ; « Exporter » donne un texte JSON à coller ci-dessous, dans
// RETOUCHES : à partir de là, elles font partie du jeu pour tout le monde (appliquées à la fin de buildWorld).
// Une retouche, par carte (identifiant de la carte, ex. « monde », « aube:labo ») :
//   ['t', x, y, terrain]                     case de terrain (numéro de T, voir tiles.js)
//   ['p', décor, x, y]                       élément de décor (lampadaire, statue, rocher…) qui bloque le passage
//   ['-p', x, y]                             retire le décor posé sur cette case
//   ['s', x, y, texte]                       panneau
//   ['n', { id, x, y, sprite, dir, text }]   habitant (text : liste de phrases)
//   ['-n', id]                               retire un habitant
//   ['i', x, y, objet, quantité]             objet à ramasser
//   ['-i', x, y]                             retire l'objet de cette case
//   ['b', type, x, y, toit, nom]             bâtiment (house, house2, bighouse, center, mart) avec son intérieur
//   ['p', décor, x, y, bloque, options]      (forme longue : bloque = false pour un décor où l'on passe, options du décor)
//   ['b', type, x, y, toit, nom, options]    (forme longue : options de GameMap.building, ex. { w, d, h, door, modele })
//   ['mb', x, y, nx, ny]                     déplace le bâtiment dont le coin haut-gauche est en (x, y) (porte et intérieur suivent)
//   ['-b', x, y]                             efface ce bâtiment (sa porte disparaît)
//   ['mp', x, y, nx, ny]                     déplace le décor (ou le panneau) de cette case
//   ['mi', x, y, nx, ny]                     déplace l'objet de cette case (il garde son identifiant)
//   ['mn', id, nx, ny]                       déplace un habitant
//   ['r', x, y, w, h, sols, hauteurs, pentes]  rectangle de terrain collé (listes ligne par ligne ; null : case inchangée)
//   ['vide', x, y, w, h]                     vide un rectangle : décor, panneaux, habitants, objets et bâtiments partent, le sol
//                                            redevient de l'herbe (du parquet dedans) ; les hauteurs restent
//   ['h', x, y, hauteur, pente]              hauteur de la case (GameMap.hg, relief.js) ; pente (facultatif) : 1 = case d'un
//                                            plateau d'herbe (talus de pelouse au rendu, m.pentes), 0 = non. Une case plus
//                                            haute que sa voisine du sud a besoin d'une paroi (T.CLIFF) sous elle, et on ne
//                                            change d'étage que par une marche (T.STAIRS) : tools/odyssee-schema-import.mjs
//                                            les pose ou les signale.
import { T } from './tiles.js';
import { centerInterior, martInterior, houseInterior } from './interiors.js';

export const RETOUCHES = {
};

const key = (x, y) => x + ',' + y;

/** applique une liste de retouches à une carte ; renvoie les nouvelles cartes créées (intérieurs des bâtiments) */
export function applyOps(m, ops, maps) {
  const made = [];
  for (const op of ops || []) {
    const [k] = op;
    try {
      if (k === 't') { removeProp(m, op[1], op[2]); m.set(op[1], op[2], op[3]); }
      else if (k === 'p') { removeProp(m, op[2], op[3]); m.prop(op[1], op[2], op[3], op[4] ?? true, op[5] || {}); }
      else if (k === 'mp') deplacerDecor(m, op[1], op[2], op[3], op[4]);
      else if (k === 'mi') { const it = m.items.find((q) => q.x === op[1] && q.y === op[2]); if (it) { it.x = op[3]; it.y = op[4]; } }
      else if (k === 'mn') { const n = m.npcs.find((q) => q.id === op[1]); if (n) { n.x = op[2]; n.y = op[3]; } }
      else if (k === 'mb') deplacerBatiment(m, op[1], op[2], op[3], op[4], maps);
      else if (k === '-b') { const b = m.buildings.find((q) => q.x === op[1] && q.y === op[2]); if (b) effacerBatiment(m, b); }
      else if (k === 'r') {
        const [, x0, y0, w, h, sols, hts, pts] = op;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const x = x0 + i, y = y0 + j, n = j * w + i; if (!m.in(x, y)) continue;
          if (sols && sols[n] != null) { removeProp(m, x, y); m.set(x, y, sols[n]); }
          if (hts && hts[n] != null) m.setHeight(x, y, hts[n]);
          if (pts && pts[n] != null) { if (!m.pentes) m.pentes = new Uint8Array(m.w * m.h); m.pentes[y * m.w + x] = pts[n]; }
        }
      }
      else if (k === 'vide') viderRect(m, op[1], op[2], op[3], op[4]);
      else if (k === '-p') removeProp(m, op[1], op[2]);
      else if (k === 'h') {
        const [, x, y, h, p] = op; m.setHeight(x, y, h);
        if (p !== undefined && m.in(x, y)) { if (!m.pentes) m.pentes = new Uint8Array(m.w * m.h); m.pentes[y * m.w + x] = p ? 1 : 0; }
      }
      else if (k === 's') { removeProp(m, op[1], op[2]); m.sign(op[1], op[2], op[3]); }
      else if (k === 'n') { const n = op[1]; m.npcs = m.npcs.filter((q) => q.id !== n.id); m.npc({ move: 'turn', ...n }); }
      else if (k === '-n') m.npcs = m.npcs.filter((q) => q.id !== op[1]);
      else if (k === '-i') m.items = m.items.filter((q) => q.x !== op[1] || q.y !== op[2]);
      else if (k === 'i') { m.items = m.items.filter((q) => q.x !== op[1] || q.y !== op[2]); m.item(op[1], op[2], op[3], op[4] || 1, `${m.id}:r${op[1]},${op[2]}`); }
      else if (k === 'b' && maps) {
        const [, kind, x, y, roof, name, opts] = op;
        const B = m.building(kind, x, y, { ...(opts || {}), roof: roof || opts?.roof || 'red', name });
        if (B.door < 0) continue;   // décor bâti, sans porte
        const id = `${m.id}:r${kind}${x}-${y}`;
        const inside = kind === 'center' ? centerInterior(id, 'Centre de soins') : kind === 'mart' ? martInterior(id, 'Boutique', ['poke-ball', 'potion', 'super-potion', 'antidote', 'repel'])
          : houseInterior(id, name || 'Maison', { w: kind === 'bighouse' ? 11 : 9, h: kind === 'bighouse' ? 9 : 8 });
        inside.outside = { map: m.id, x: B.doorX, y: B.doorY + 1, dir: 'down' };
        inside.warp(inside.exitX, inside.exitY, inside.outside);
        m.warp(B.doorX, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
        if (m.get(B.doorX, B.doorY + 1) !== T.PATH && m.get(B.doorX, B.doorY + 1) !== T.PAVE) m.set(B.doorX, B.doorY + 1, T.PATH);
        maps[id] = inside; made.push(inside);
      }
    } catch (e) { console.warn('retouche ignorée', op, e); }
  }
  return made;
}
const sol = (m) => (m.outdoor ? T.GRASS : T.FLOOR);
const DEDANS = (b, x, y) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.d;
/** cases d'un bâtiment rendues au sol, sa porte (et son passage vers l'intérieur) retirée ; renvoie les portes retirées */
function effacerBatiment(m, b) {
  for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) { const t = m.get(x, y); if (t === T.BUILD || t === T.DOOR) m.set(x, y, sol(m)); }
  for (const [i, j] of b.o?.blocs || []) { const x = b.x + i, y = b.y + j; if (m.get(x, y) === T.BLOCK && !m.deco.some((d) => d.x === x && d.y === y)) { m.set(x, y, m.under.get(key(x, y)) ?? sol(m)); m.under.delete(key(x, y)); } }
  const portes = [];
  for (const dx of [b.doorX, b.door2X]) {
    if (dx == null || b.door < 0) continue;
    const w = m.warps.get(key(dx, b.doorY)); portes.push([dx, b.doorY, w]); m.warps.delete(key(dx, b.doorY));
  }
  m.buildings = m.buildings.filter((q) => q !== b);
  return portes;
}
/** déplace un bâtiment : même sorte, mêmes réglages ; ses portes mènent toujours au même intérieur, dont la sortie suit */
function deplacerBatiment(m, x, y, nx, ny, maps) {
  const b = m.buildings.find((q) => q.x === x && q.y === y); if (!b) return;
  const portes = effacerBatiment(m, b);
  const nb = m.building(b.kind, nx, ny, b.o || {});
  for (const [k, v] of Object.entries(b)) if (!(k in nb) || nb[k] === undefined) nb[k] = v;
  const dx = nx - x, dy = ny - y, vus = new Set();   // une sortie partagée par deux portes ne bouge qu'une fois
  for (const [px, py, w] of portes) {
    if (!w) continue;
    m.warps.set(key(px + dx, py + dy), w);
    const ins = maps?.[w.map]; if (!ins) continue;
    for (const v of ins.warps.values()) if (v.map === m.id && Math.abs(v.x - px) <= 1 && v.y === py + 1 && !vus.has(v)) { v.x += dx; v.y += dy; vus.add(v); }
    if (ins.outside && ins.outside.map === m.id && !vus.has(ins.outside)) { ins.outside = { ...ins.outside, x: ins.outside.x + dx, y: ins.outside.y + dy }; vus.add(ins.outside); }
  }
  return nb;
}
/** déplace le décor (ou le panneau) d'une case, avec ce qu'il bloque */
function deplacerDecor(m, x, y, nx, ny) {
  const d = m.deco.find((q) => q.x === x && q.y === y); if (!d) return;
  const t = m.get(x, y), bloque = t === T.BLOCK || t === T.SIGN, txt = m.signs.get(key(x, y));
  if (bloque) { m.set(x, y, m.under.get(key(x, y)) ?? sol(m)); m.under.delete(key(x, y)); }
  m.signs.delete(key(x, y));
  removeProp(m, nx, ny);
  d.x = nx; d.y = ny;
  if (bloque) { m.under.set(key(nx, ny), m.get(nx, ny)); m.set(nx, ny, t); }
  if (txt != null) m.signs.set(key(nx, ny), txt);
}
/** vide un rectangle (couper, effacer une sélection) */
function viderRect(m, x0, y0, w, h) {
  const dans = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
  // tout bâtiment qui mord sur le rectangle part (un collage n'en laisse pas un à moitié recouvert)
  for (const b of m.buildings.filter((q) => q.x < x0 + w && x0 < q.x + q.w && q.y < y0 + h && y0 < q.y + q.d)) effacerBatiment(m, b);
  for (const d of m.deco.filter((q) => dans(q.x, q.y))) removeProp(m, d.x, d.y);
  m.deco = m.deco.filter((q) => !dans(q.x, q.y));
  m.npcs = m.npcs.filter((q) => !dans(q.x, q.y));
  m.items = m.items.filter((q) => !dans(q.x, q.y));
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { m.set(x, y, sol(m)); m.under.delete(key(x, y)); m.signs.delete(key(x, y)); m.warps.delete(key(x, y)); }
}
function removeProp(m, x, y) {
  const had = m.deco.some((d) => d.x === x && d.y === y);
  if (!had) return;
  m.deco = m.deco.filter((d) => d.x !== x || d.y !== y);
  const u = m.under.get(key(x, y));
  if (m.get(x, y) === T.BLOCK || m.get(x, y) === T.SIGN) m.set(x, y, u ?? (m.outdoor ? T.GRASS : T.FLOOR));
  m.under.delete(key(x, y)); m.signs?.delete(key(x, y));
}

/** toutes les retouches (celles du jeu, puis éventuellement celles de l'éditeur) */
export function applyRetouches(maps, all = RETOUCHES) {
  for (const [id, ops] of Object.entries(all || {})) if (maps[id]) applyOps(maps[id], ops, maps);
}
