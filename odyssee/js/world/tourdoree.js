// odyssee/js/world/tourdoree.js — la Tour Dorée (sans DOM), qu'on appelait autrefois la Tour de la Grue.
// Elle se dresse dans le parc du Temple Kagura, au cœur de la Forêt des Torii, à côté de sa sœur brûlée, la Tour Cendrée
// (comme la Tour Carillon et la Tour Cendrée de Rosalia). Quatre niveaux reliés par des escaliers : deux Sages au
// rez-de-chaussée, deux au 1er étage, le Grand Sage Hoël au 2e (il confie la Plume Arc-en-ciel : `onWin: 'grandSage'`,
// drapeau `plume`), un novice qui garde l'escalier du toit tant qu'on n'a pas la plume, et Ho-Oh sur le toit.
// Les cartes gardent leurs identifiants d'avant le déménagement (grue:tour, grue:tour2, grue:tour3, grue:tour-toit) :
// une partie arrêtée dans la tour reprend au même endroit.
import { towerFloor, TOWER_UP, TOWER_DOWN } from './interiors.js';
import { GRAND } from './mapgen.js';

/** identifiant de la carte du rez-de-chaussée (les étages en dérivent) */
export const TOUR_DOREE_ID = 'grue:tour';
/** badges qu'il faut pour monter au toit (avec la plume) : la Forêt des Torii s'ouvre avec le quatrième */
export const TOUR_DOREE_BADGES = 4;

/**
 * Le bâtiment à poser dans une ville (buildTown) : pagode 11 × 11, porte au milieu, toits dorés.
 * ctx : { legends, trainerNpc }.
 */
export function tourDoree({ legends, trainerNpc }, x, y) {
  const interior = (id) => towerFloor(id, 'Tour Dorée — rez-de-chaussée', { ground: true, up: true });
  const more = (f1, id) => {
    const f2 = towerFloor(id + '2', 'Tour Dorée — 1er étage', { up: true, down: true });
    const f3 = towerFloor(id + '3', 'Tour Dorée — 2e étage', { up: true, down: true });
    const roof = towerFloor(id + '-toit', 'Toit de la Tour Dorée', { down: true, roof: true });
    const link = (a, b) => { a.warp(TOWER_UP.x, TOWER_UP.y, { map: b.id, x: TOWER_DOWN.x, y: TOWER_DOWN.y + 1, dir: 'down' }); b.warp(TOWER_DOWN.x, TOWER_DOWN.y, { map: a.id, x: TOWER_UP.x, y: TOWER_UP.y + 1, dir: 'down' }); };
    link(f1, f2); link(f2, f3); link(f3, roof);
    for (const f of [f2, f3, roof]) f.outside = f1.outside;   // Corde Sortie, Vol : on ressort au pied de la tour
    // identifiants des dresseurs : ceux d'avant le déménagement (drapeaux T: des parties en cours)
    const sage = (m, x, y, dir, name, team, intro, n) => trainerNpc(m, x, y, dir, 'Sage', name, team, { id: m.id + ':t' + n, sight: 3, intro, after: 'Le Grand Sage t\'attend plus haut.' });
    sage(f1, 4, 7, 'right', 'Ernest', [[1039, 30], [163, 30]], 'La tour accueille ceux qui viennent en paix. Prouve-le !', 47);
    sage(f1, 8, 5, 'left', 'Gaspard', [[1023, 31], [1015, 30]], 'Cette tour dorée veille sur la forêt depuis mille ans.', 48);
    sage(f2, 5, 5, 'right', 'Hilaire', [[1030, 32], [1040, 31]], 'Ho-Oh ne se montre qu\'aux cœurs sincères.', 49);
    sage(f2, 8, 8, 'left', 'Isidore', [[164, 32], [1016, 32]], 'Plus haut, l\'air devient sacré.', 50);
    trainerNpc(f3, 6, 4, 'down', 'Grand Sage', 'Hoël', [[1040, 34], [1030, 34], [1023, 35], [1016, 36]], { id: f3.id + ':t51', sight: 0, ai: 'smart', onWin: 'grandSage', intro: 'Tu viens chercher la Plume Arc-en-ciel ? Montre-moi le lien qui t\'unit à tes créatures !', lose: 'Ce lien... il est réel.', after: 'Va sur le toit. Ho-Oh t\'attend peut-être.' });
    const gate = { badges: TOUR_DOREE_BADGES, flag: 'plume', tiles: [[10, 2], [11, 3]] };
    const n = f3.npc({ id: id + ':novice', x: 10, y: 3, dir: 'down', sprite: 'medium', gate, text: ['Le toit est réservé à qui porte la Plume Arc-en-ciel.', 'Seul le Grand Sage peut te la confier.'] });
    f3.gates.push({ npc: n.id, ...gate });
    legends.push({ id: 'hooh', sp: 250, lvl: 40, map: roof.id, x: 6, y: 6, cond: 'plume', intro: ['La Plume Arc-en-ciel se met à briller...', 'Un arc-en-ciel déchire les nuages. Ho-Oh se pose sur la Tour Dorée !'] });
    return [f2, f3, roof];
  };
  // toits dorés (le modèle `pagode` de batiments3d.js), quel que soit le toit de la ville
  return { kind: 'tower', ...GRAND.pagode, x, y, roof: 'gold', opts: { toit: '#e8b030' }, id: 'tour', mapId: TOUR_DOREE_ID, name: 'Tour Dorée', interior, more };
}
