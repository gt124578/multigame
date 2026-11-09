// odyssee/js/core/reprise.js — une partie reprend toujours sur une case d'où l'on peut repartir (sans DOM).
//
// La carte change d'une version à l'autre (lieux déplacés, intérieurs renumérotés, décor régénéré) : une sauvegarde peut
// désigner une carte qui n'existe plus, une case devenue un mur, ou une poche de terrain refermée (clairière cernée
// d'arbres, recoin derrière un bâtiment). Le joueur y serait bloqué pour toujours. reprendre() corrige la position :
//  - carte inconnue : le dernier Centre de soins visité (state.lastCenter), sinon la maison du départ ;
//  - case qui n'est plus praticable : la case libre la plus proche qu'on peut quitter ;
//  - poche refermée (on n'en sort ni à pied, ni en sautant un rebord, ni par une porte, ni par l'eau, ni par un obstacle
//    qu'une capacité de terrain fait disparaître) : le dernier Centre de soins.
// Elle rend la raison du déplacement (null si la position était bonne), pour le dire au joueur.
import { T, walkable } from '../world/tiles.js';

const LEDGES = new Set([T.LEDGE, T.LEDGE_E, T.LEDGE_W]);
// une case voisine qui ouvre un chemin, même s'il faut une capacité (Surf, Coupe, Éclate-Roc, Force) ou sauter un rebord
const SORTIE = new Set([T.WATER, T.CUT, T.SMASH, T.BOULDER, T.DOOR, T.CAVEDOOR, T.MAT, ...LEDGES]);

/**
 * la case (x, y) de la carte m appartient-elle à une poche dont on ne peut pas sortir ? On explore à pied depuis elle :
 * dès qu'on a vu assez de cases (`assez`), ou une case qui mène ailleurs (porte, téléporteur, eau, obstacle, rebord),
 * la case est libre. Coût borné par `assez`.
 */
export function enfermee(m, x, y, assez = 1500) {
  if (!m.in(x, y)) return true;
  const w = m.w, vu = new Set([y * w + x]), file = [[x, y]];
  for (let i = 0; i < file.length; i++) {
    const [cx, cy] = file[i];
    if (m.warpAt?.(cx, cy) || m.objectAt?.(cx, cy)) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = cx + dx, v = cy + dy; if (!m.in(u, v)) continue;
      const t = m.get(u, v);
      // (une case d'énigme d'arène — glace, flèche, téléporteur, dalle — ou une barrière qui se baisse compte aussi)
      if (SORTIE.has(t) || t === T.BARRIER_R || t === T.BARRIER_B || m.warpAt?.(u, v) || m.objectAt?.(u, v)) return false;
      const k = v * w + u; if (vu.has(k) || !walkable(t) || !m.canStep(cx, cy, u, v)) continue;
      vu.add(k); file.push([u, v]);
      if (file.length >= assez) return false;
    }
  }
  return true;
}

/** case praticable, qu'on peut quitter, la plus proche de (x, y) (rayon croissant) ; null s'il n'y en a pas à moins de r cases */
export function caseSure(m, x, y, r = 24) {
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    const u = Math.round(x) + dx, v = Math.round(y) + dy;
    if (!m.in(u, v)) continue;
    const t = m.get(u, v);
    if (!walkable(t) || t === T.DOOR || t === T.CAVEDOOR || t === T.MAT || t === T.STAIRS || m.warpAt?.(u, v)) continue;
    if (!enfermee(m, u, v)) return [u, v];
  }
  return null;
}

/** position de secours : le dernier Centre de soins visité, sinon le départ de l'aventure */
function secours(world, state) {
  const c = state.lastCenter, m = c && world.maps[c.map];
  if (m && m.in(c.x, c.y) && walkable(m.get(c.x, c.y))) return { map: c.map, x: c.x, y: c.y, dir: c.dir || 'up' };
  return { ...world.start };
}

/** corrige state.map / x / y si la partie ne peut pas reprendre là ; rend la raison ('carte', 'mur', 'poche') ou null */
export function reprendre(world, state) {
  let m = world.maps[state.map];
  if (!m) { Object.assign(state, secours(world, state), { surf: false }); return 'carte'; }
  if (state.surf && m.get(state.x, state.y) === T.WATER) return null;   // sur l'eau, en surf : il repartira à la nage
  let raison = null;
  if (!m.in(state.x, state.y) || !walkable(m.get(state.x, state.y))) {
    const c = caseSure(m, state.x, state.y);
    if (c) { [state.x, state.y] = c; state.surf = false; return 'mur'; }
    raison = 'mur';
  } else if (enfermee(m, state.x, state.y)) raison = 'poche';
  if (!raison) return null;
  Object.assign(state, secours(world, state), { surf: false });
  m = world.maps[state.map];
  // le secours lui-même doit être bon (sinon la case sûre la plus proche du départ)
  if (m && (!walkable(m.get(state.x, state.y)) || enfermee(m, state.x, state.y))) { const c = caseSure(m, state.x, state.y); if (c) [state.x, state.y] = c; }
  return raison;
}
