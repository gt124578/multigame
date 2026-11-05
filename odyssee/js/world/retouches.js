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
      else if (k === 'p') { removeProp(m, op[2], op[3]); m.prop(op[1], op[2], op[3], true); }
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
        const [, kind, x, y, roof, name] = op;
        const B = m.building(kind, x, y, { roof: roof || 'red', name });
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
