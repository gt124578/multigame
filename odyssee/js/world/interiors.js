// odyssee/js/world/interiors.js — intérieurs (centre, boutique, maisons, labo, arènes, Ligue, lieux uniques) et grottes
import { T } from './tiles.js';
import { GameMap, rng } from './mapgen.js';

/** pièce vide : murs du fond (2 rangées), murs latéraux, tapis de sortie en bas */
export function room(id, w, h, o = {}) {
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
  m.npc({ id: id + ':relearner', x: 2, y: 4, sprite: 'savant', role: 'relearner', dir: 'right' });
  furn(m, 'healer', 8, 2); m.set(9, 2, T.BLOCK);
  furn(m, 'pc', 11, 2); m.object(11, 2, { type: 'pc' });
  // PC des Natures : on y change la nature d'un Pokémon de l'équipe
  furn(m, 'pc', 2, 2); m.object(2, 2, { type: 'naturepc' });
  furn(m, 'plant', 1, 2); furn(m, 'plant', 1, 8);
  furn(m, 'bench', 1, 6); m.set(2, 6, T.BLOCK); furn(m, 'bench', 10, 6); m.set(11, 6, T.BLOCK);
  furn(m, 'vase', 11, 8);
  m.npc({ id: id + ':club', x: 10, y: 8, sprite: 'topdresseur', dir: 'left', script: 'clubCombat' });
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
  // la chambre du joueur : une armoire pour changer de tenue
  if (o.bed && o.kitchen) m.object(4, 2, { use: (api) => api.game.frigo() });   // le frigo : son aimant d'agence immobilière
  // l'armoire est large : avec une cuisine (frigo et évier décalés d'une case), juste à droite de l'évier, sinon au fond à droite
  const [ax, ay] = o.bed && o.kitchen ? [6, 2] : [w - 2, 2];
  if (o.bed) { furn(m, 'armoire', ax, ay); m.object(ax, ay, { use: (api) => api.game.apparence({ armoire: true }) }); furn(m, 'pc', 2, 2); m.object(2, 2, { type: 'pc' }); }
  if (o.kitchen) { furn(m, 'fridge', o.bed ? 4 : 5, 2); furn(m, 'kitchen', o.bed ? 5 : 6, 2); }
  else furn(m, w > 9 ? 'clock' : 'painting', 5, 2);
  if (o.extraBooks) furn(m, 'books', 6, 2);
  if (w > 9) { furn(m, 'sofa', 7, 5); m.set(8, 5, T.BLOCK); furn(m, 'boxes', 1, 6); }
  return m;
}
/**
 * La Centrale de Voltacité (11 × 9) : la salle des générateurs. Sol de tôle, murs d'usine, consoles et générateurs au
 * fond, turbines (cuves) le long des murs. Les cases que story.js occupe restent libres : l'ingénieur (2, 6), les deux
 * sbires (4, 6) et (8, 5), la pierre (9, 6), et Érèbe en (7, 3) avec toute sa ligne de vue vers le sud (7, 4 → 7, 7).
 */
export function centraleInterior(id, name = 'Centrale de Voltacité') {
  const m = room(id, 11, 9, { floor: 'base', music: 'hideout', wall: 'wall_usine', name });
  for (const x of [1, 2, 3]) furn(m, 'console', x, 2);
  furn(m, 'ecran_carte', 4, 2);
  for (const x of [6, 7, 8]) furn(m, 'machine', x, 2);   // les trois générateurs derrière Érèbe
  furn(m, 'console', 9, 2);
  for (const [x, y] of [[1, 4], [1, 5], [9, 3], [9, 4]]) furn(m, 'cuve', x, y);   // turbines
  furn(m, 'machine', 3, 4); furn(m, 'borne', 1, 7); furn(m, 'borne', 9, 7);
  // câbles et bande de sécurité au sol : de la porte aux générateurs
  for (let y = 3; y <= 7; y++) m.deco.push({ k: 'cable_sol', x: 6, y });
  for (let x = 4; x <= 8; x++) m.deco.push({ k: 'bande_danger', x, y: 3 });
  return m;
}
/**
 * La Tour Mirage (11 × 9) : un sanctuaire à fresques. Dallage de marbre, murs de pierre dorée dont les fresques
 * racontent les légendes (le vieil homme en parle), piliers, stèle et gardiens de pierre au fond, tapis pourpre jusqu'à
 * la stèle. La médium (5, 4) et le vieil homme (8, 5) de region.js restent à leur place.
 */
export function tourMirageInterior(id, name = 'Tour Mirage') {
  const m = room(id, 11, 9, { floor: 'musee', music: 'tower', wall: 'wall_antique', name, battleBg: 'indoor' });
  furn(m, 'stele', 5, 2); furn(m, 'statue_dragon', 3, 2); furn(m, 'statue_dragon', 7, 2);
  furn(m, 'brasero', 1, 2); furn(m, 'brasero', 9, 2);
  for (const [x, y] of [[2, 4], [8, 3], [2, 6], [8, 7]]) furn(m, 'colonne', x, y);
  furn(m, 'vase', 1, 7); furn(m, 'vase', 9, 5);
  for (let y = 3; y <= 7; y++) m.deco.push({ k: 'carpet', x: 5, y });
  return m;
}
/**
 * Le Musée des Dragons de Cimelune (11 × 9) : une galerie de marbre qui n'expose « que des squelettes et des fresques »,
 * comme le dit la conservatrice. Au mur du fond, côte à côte, les deux fresques que montre le scientifique : Odyssor sous
 * la mer étoilée et Lugia, l'oiseau d'argent (colonnes 4 et 6), de part et d'autre de la vitrine au crâne de dragon ;
 * les stèles devant lesquelles Drakos s'incline, un dragon de pierre, deux colonnes et des urnes.
 * L'estrade de velours attend le grand squelette que la quête du fossile pose en (3 → 6, 6), avec la vitrine du fossile
 * (8, 6) et le second dragon de pierre (9, 2).
 * Les habitants gardent leur place : le vieil homme (5, 4), le savant de la quête (2, 4) et le scientifique, demandé en
 * (8, 5) et décalé en (9, 5), à côté de la vitrine du fossile, comme il l'était par le canapé.
 */
export function museeInterior(id, name = 'Musée des Dragons') {
  const m = room(id, 11, 9, { floor: 'musee', music: 'house', wall: 'wall_musee', name });
  furn(m, 'statue_dragon', 1, 2); furn(m, 'stele', 3, 2); furn(m, 'vitrine_dragon', 5, 2); furn(m, 'stele', 7, 2);
  m.fenetresMur = [4, 6];
  furn(m, 'colonne', 3, 4); furn(m, 'colonne', 7, 4);
  m.set(8, 5, T.BLOCK);   // l'arrière de la grande vitrine du fossile (8, 6), qui déborde sur cette case
  furn(m, 'vase', 1, 7); furn(m, 'vase', 9, 7);
  for (const [x, g] of [[3, 'musee_g'], [4, 'musee_m'], [5, 'musee_m'], [6, 'musee_d']]) m.deco.push({ k: 'estrade', x, y: 6, g });
  return m;
}
/**
 * La Caserne d'Écaille de Fort-Écaille (11 × 9) : le corps de garde de Drakos. Dallage de pierre, murs sombres au
 * bandeau indigo, bannières au dragon, râteliers de hallebardes et armures au fond, table d'état-major (la carte de
 * l'archipel), mannequin d'entraînement, tonneaux et caisses de l'intendance, braseros, tapis de garde depuis la porte.
 * Les deux gardes gardent leur place : demandés en (4, 4) et (7, 5), ils se tiennent en (5, 4) devant la table et en
 * (6, 5) près du mannequin (la table et le mannequin occupent les cases de l'ancienne table et de l'ancien canapé).
 */
export function caserneInterior(id, name = 'Caserne d\'Écaille') {
  const m = room(id, 11, 9, { floor: 'caserne', music: 'house', wall: 'wall_caserne', name });
  furn(m, 'ratelier', 1, 2); furn(m, 'armure', 3, 2); furn(m, 'armure', 7, 2); furn(m, 'ratelier', 9, 2);
  furn(m, 'table_tactique', 4, 4);
  furn(m, 'mannequin', 7, 5); furn(m, 'ratelier', 8, 5);
  furn(m, 'caisses', 1, 6); furn(m, 'tonneau', 1, 7); furn(m, 'brasero', 9, 7); furn(m, 'brasero', 1, 4);
  for (let y = 5; y <= 7; y++) m.deco.push({ k: 'tapis', x: 5, y, g: 'caserne' });
  return m;
}
/**
 * La Fonderie de Forge-Acier (11 × 9) : l'atelier où l'on coule l'acier des rails et des ponts. Dalles de béton cerclées de
 * fer, murs de briques sombres, verrières d'atelier ; au fond, deux fours de briques à la gueule ardente de part et d'autre
 * de l'établi ; deux rigoles de coulée mènent leur métal jusqu'au creuset du milieu ; enclume, lingots, bac de trempe,
 * caisses et tonneaux de l'expédition.
 * Le fondeur garde sa place : demandé en (3, 5), il s'y tient, devant la rigole de gauche (rien n'est posé sur sa case ni
 * sur l'allée de la porte, colonne 5).
 */
export function fonderieInterior(id, name = 'Fonderie') {
  const m = room(id, 11, 9, { floor: 'fonderie', music: 'house', wall: 'wall_fonderie', name });
  furn(m, 'caisses', 1, 2); furn(m, 'four_fonderie', 2, 2); furn(m, 'lingots', 4, 2); furn(m, 'etabli', 5, 2); furn(m, 'lingots', 6, 2); furn(m, 'four_fonderie', 8, 2); furn(m, 'tonneau', 9, 2);
  m.fenetresMur = [3, 7];
  // les rigoles : de la gueule de chaque four jusqu'au creuset
  for (const [x, y, g] of [[2, 3, 'ns'], [2, 4, 'ne'], [3, 4, 'oe'], [4, 4, 'o'], [8, 3, 'ns'], [8, 4, 'no'], [7, 4, 'oe'], [6, 4, 'e']]) m.deco.push({ k: 'rigole', x, y, g });
  furn(m, 'creuset', 5, 4);
  furn(m, 'enclume', 7, 6); furn(m, 'bac_trempe', 9, 5); furn(m, 'lingots', 9, 7); furn(m, 'caisses', 1, 7); furn(m, 'tonneau', 1, 5);
  for (let x = 4; x <= 6; x++) m.deco.push({ k: 'bande_danger', x, y: 5 });
  return m;
}
export function labInterior(id) {
  const m = room(id, 13, 12, { floor: 'lab', music: 'lab', wall: 'wall_mart', name: 'Labo du Prof. Saule' });
  for (const x of [1, 2, 3, 9, 10, 11]) furn(m, 'books', x, 2);
  furn(m, 'pc', 5, 2); furn(m, 'pc', 7, 2); m.object(5, 2, { type: 'pc' }); m.object(7, 2, { type: 'pc' });
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

export function dojoInterior(id, name = 'Dojo de Mamadou') {
  const m = room(id, 15, 15, { floor: 'temple', music: 'tower', wall: 'wall_league', name, battleBg: 'gym', wide: true });
  for (let y = 4; y < 14; y++) for (const x of [6, 7, 8]) m.deco.push({ k: 'carpet', x, y });
  furn(m, 'statue_dragon', 3, 4); furn(m, 'statue_dragon', 11, 4);
  for (const y of [8, 12]) { furn(m, 'statue', 3, y); furn(m, 'statue', 11, y); }
  for (const [x, y] of [[4, 3], [10, 3], [5, 13], [9, 13]]) furn(m, 'brasero', x, y);
  furn(m, 'pot', 1, 13); furn(m, 'pot', 13, 13);
  furn(m, 'healer', 1, 2); m.set(2, 2, T.BLOCK);   // l'appareil de soin occupe deux cases, comme au Centre
  furn(m, 'pc', 13, 2); m.object(13, 2, { type: 'pc' });
  m.npc({ id: id + ':mamadou', x: 7, y: 3, dir: 'down', sprite: 'mamadou', script: 'dojoMamadou' });
  m.npc({ id: id + ':mascotte', x: 9, y: 3, dir: 'down', sprite: 'bouc', script: 'dojoMascotte' });
  m.npc({ id: id + ':intendant', x: 11, y: 6, dir: 'left', sprite: 'vendeur', script: 'dojoBoutique' });
  m.npc({ id: id + ':infirmiere', x: 1, y: 4, dir: 'down', sprite: 'nurse', role: 'nurse' });
  m.npc({
    id: id + ':disciple', x: 3, y: 10, dir: 'right', sprite: 'kimono',
    text: [
      'Bienvenue au Dojo de Mamadou ! Ici, personne ne combat jamais seul.',
      'En Duo Co-op, deux dresseurs s\'unissent avec 1 Pokémon actif chacun (+ 1 remplaçant) contre deux tacticiens redoutables.',
      'En Trio Co-op, il faut être trois dresseurs connectés en ligne ! Passe par le menu Amis / Connexion pour vous retrouver dans la même salle.',
    ],
  });
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

/* ---------------- Tour Dorée (Forêt des Torii ; autrefois Tour de la Grue) ---------------- */
// Étages reliés par des escaliers (cases d'escalier = téléporteurs). L'escalier qui monte est en haut à droite,
// celui qui descend en haut à gauche ; on arrive juste en dessous.
export const TOWER_UP = { x: 11, y: 2 }, TOWER_DOWN = { x: 1, y: 2 };
export function towerFloor(id, name, o = {}) {
  const m = room(id, 13, 12, { floor: o.roof ? 'temple' : 'wood', music: 'tower', wall: o.roof ? 'wall_league' : 'wall_in', name, battleBg: 'indoor' });
  if (!o.ground) m.set(m.exitX, m.exitY, T.FLOOR);   // seul le rez-de-chaussée a une porte
  if (o.up) { m.set(TOWER_UP.x, TOWER_UP.y, T.CAVEDOOR); }
  if (o.down) { m.set(TOWER_DOWN.x, TOWER_DOWN.y, T.CAVEDOOR); }
  if (o.roof) {
    // le toit : dalles dorées, deux gardiens de pierre au fond, des braseros aux angles (Ho-Oh se pose au milieu)
    furn(m, 'statue_dragon', 4, 4); furn(m, 'statue_dragon', 8, 4);
    for (const [x, y] of [[2, 9], [10, 9], [2, 5], [10, 5]]) furn(m, 'brasero', x, y);
  } else {
    // piliers de bois et vases rituels
    for (const [x, y] of [[3, 4], [9, 4], [3, 8], [9, 8]]) furn(m, 'statue', x, y);
    furn(m, 'pot', 1, 10); furn(m, 'pot', 11, 10);
  }
  return m;
}
