// odyssee/js/world/region.js — la région d'Odyssée : le continent (cinq arènes, la Ligue) et, au sud-est, l'archipel
// des trois frères (Basalte, Pyros et Drakos), qu'on rejoint en surfant. Les quatre premières arènes se suivent dans
// l'ordre (des gardes bloquent la route) ; ensuite, ce sont les capacités de terrain qui ouvrent de nouvelles zones :
// Coupe (badge 4) vers Mirage, Surf (badge 5) vers les îles, Éclate-Roc (badge 6) sur la Grande Île, Vol (badge 7).
// À l'est, trois îles desservies par le bateau de l'Embarcadère de l'Aube (2, 3 et 5 badges), avec les quêtes des
// légendaires (renvoyées dans `legends`, les quais dans `docks`).
// Noms de lieux et personnages originaux ; les créatures du jeu côtoient les Pokémon du prototype.
import { T } from './tiles.js';
import { GameMap, carveRoute, carveTown, ledges, along, nearestWalkable, rng } from './mapgen.js';
import { centerInterior, martInterior, houseInterior, labInterior, gymInterior, leagueInterior, caveMap, towerFloor, TOWER_UP, TOWER_DOWN } from './interiors.js';
import { NEW_STARTERS } from '../data/creatures.js';

export const STARTERS = NEW_STARTERS;
export const RIVAL_NAME = 'Théo';
// ordre des arènes : Hector, Marine, Volta, Flora, Sibylle, puis les trois frères de l'archipel
export const BADGES = [
  { name: 'Badge Élytre', type: 'bug', color: '#8cc43c' }, { name: 'Badge Écume', type: 'water', color: '#4a9ae8' },
  { name: 'Badge Volt', type: 'electric', color: '#f0d030' }, { name: 'Badge Pétale', type: 'grass', color: '#58c060' },
  { name: 'Badge Mirage', type: 'psychic', color: '#e070c0' }, { name: 'Badge Granit', type: 'rock', color: '#b89c6c' },
  { name: 'Badge Braise', type: 'fire', color: '#f07030' }, { name: 'Badge Écaille', type: 'dragon', color: '#7a68e0' },
];
// capacités de terrain : obtenues auprès d'un Champion, utilisables avec le badge indiqué
export const FIELD = {
  coupe: { name: 'Coupe', cs: 'CS01', badge: 4, desc: 'Tranche les petits arbres qui barrent le chemin.' },
  surf: { name: 'Surf', cs: 'CS02', badge: 5, desc: 'Permet de traverser l\'eau sur le dos d\'une créature.' },
  eclate: { name: 'Éclate-Roc', cs: 'CS03', badge: 6, desc: 'Brise les rochers fissurés.' },
  vol: { name: 'Vol', cs: 'CS04', badge: 7, desc: 'Ramène en un instant dans une ville déjà visitée.' },
};
const STOCK = {
  1: ['poke-ball', 'potion', 'antidote', 'paralyze-heal', 'awakening', 'repel'],
  2: ['poke-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'escape-rope'],
  3: ['poke-ball', 'great-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'super-repel', 'escape-rope'],
  4: ['poke-ball', 'great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'thunder-stone', 'moon-stone'],
  5: ['great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'leaf-stone', 'fire-stone', 'water-stone', 'sun-stone', 'ether'],
  6: ['great-ball', 'ultra-ball', 'hyper-potion', 'max-potion', 'full-heal', 'revive', 'max-repel', 'escape-rope', 'ether', 'elixir'],
  7: ['ultra-ball', 'hyper-potion', 'max-potion', 'full-restore', 'full-heal', 'revive', 'max-repel', 'escape-rope', 'elixir'],
};

/* ---------------- rencontres sauvages : [espèce, niveau min, niveau max, poids] ---------------- */
const ENC = {
  r1: [[1010, 2, 4, 25], [1013, 2, 4, 25], [16, 2, 4, 15], [19, 2, 4, 15], [1017, 2, 3, 12], [161, 2, 4, 8]],
  r2: [[1010, 4, 7, 15], [1013, 4, 6, 15], [1017, 4, 6, 15], [1018, 6, 7, 5], [1034, 5, 7, 10], [1021, 5, 7, 10], [21, 5, 7, 10], [10, 4, 6, 10], [1039, 5, 6, 5], [29, 5, 6, 5]],
  bois: [[1017, 6, 8, 15], [1018, 7, 9, 8], [1015, 6, 9, 15], [1021, 6, 9, 15], [1020, 7, 9, 8], [1013, 7, 9, 10], [165, 6, 9, 8], [167, 6, 9, 8], [1043, 7, 9, 5], [1038, 8, 9, 3], [46, 7, 9, 5]],
  r3: [[1026, 8, 11, 15], [1034, 8, 11, 15], [1011, 9, 11, 10], [1014, 9, 11, 5], [21, 8, 11, 15], [27, 8, 11, 10], [56, 8, 11, 10], [66, 9, 11, 10], [1039, 9, 11, 10]],
  grotte: [[1024, 9, 13, 35], [1028, 10, 13, 15], [1026, 9, 12, 15], [74, 9, 13, 15], [41, 9, 13, 10], [1047, 10, 12, 7], [95, 12, 14, 3]],
  r4: [[1031, 13, 17, 15], [1029, 13, 16, 15], [1026, 13, 16, 10], [1033, 15, 17, 5], [54, 13, 17, 10], [72, 13, 16, 10], [98, 13, 17, 10], [1011, 14, 17, 10], [1037, 14, 16, 8], [179, 13, 16, 7]],
  r5: [[1034, 16, 20, 12], [1035, 19, 21, 3], [1036, 17, 20, 10], [1037, 16, 19, 10], [100, 16, 20, 10], [81, 16, 20, 10], [1014, 17, 20, 10], [1043, 17, 20, 10], [77, 17, 21, 10], [1015, 16, 19, 10], [58, 17, 20, 5]],
  r6: [[1021, 21, 23, 10], [1022, 24, 25, 3], [1038, 21, 24, 12], [1039, 21, 23, 10], [1040, 25, 26, 2], [1019, 22, 24, 8], [1020, 21, 24, 10], [43, 21, 23, 10], [69, 21, 23, 10], [114, 22, 25, 8], [123, 24, 26, 3], [127, 24, 26, 2], [1016, 24, 26, 7]],
  r7: [[1011, 26, 29, 10], [1023, 26, 30, 10], [1039, 26, 29, 10], [1043, 27, 30, 10], [1031, 26, 29, 10], [96, 26, 30, 10], [177, 26, 29, 10], [203, 27, 30, 10], [1012, 30, 30, 3], [1029, 26, 29, 10], [216, 26, 29, 7]],
  mer: [[1029, 25, 32, 25], [1031, 25, 32, 20], [1007, 28, 30, 3], [1045, 28, 32, 10], [72, 25, 32, 20], [1033, 30, 33, 7], [120, 26, 32, 10], [1027, 32, 34, 5]],
  granit: [[1026, 34, 37, 15], [1027, 36, 38, 5], [1028, 34, 38, 15], [1047, 34, 37, 10], [1048, 37, 39, 3], [74, 34, 37, 15], [111, 35, 38, 10], [1045, 34, 37, 10], [1046, 37, 39, 2], [95, 35, 38, 10], [1024, 34, 37, 5]],
  cendre: [[1041, 38, 42, 20], [1042, 41, 43, 5], [1005, 40, 42, 3], [77, 38, 42, 15], [126, 40, 43, 5], [1028, 38, 41, 10], [1043, 38, 42, 12], [1044, 41, 43, 3], [218, 38, 42, 12], [1036, 38, 41, 10]],
  ecaille: [[1049, 42, 45, 12], [1050, 45, 47, 4], [1044, 43, 46, 10], [1025, 42, 46, 12], [1016, 42, 45, 10], [1012, 43, 46, 8], [1023, 42, 45, 10], [1048, 43, 46, 8], [148, 44, 46, 6], [1040, 43, 46, 8], [1035, 42, 45, 8], [147, 42, 44, 4]],
  r9: [[1012, 34, 38, 15], [1035, 34, 38, 10], [67, 34, 38, 20], [75, 34, 38, 20], [42, 34, 37, 20], [1044, 35, 38, 10], [105, 34, 37, 5]],
  victoire: [[67, 36, 42, 12], [75, 36, 42, 12], [1028, 36, 42, 12], [1025, 36, 40, 12], [1048, 38, 42, 8], [1050, 38, 42, 6], [95, 37, 41, 8], [42, 36, 40, 12], [105, 36, 40, 8], [1044, 38, 42, 6], [208, 39, 42, 2], [1051, 50, 50, 1]],
  // îles du bateau : un cran au-dessus de l'arène précédente
  orage: [[1034, 20, 24, 15], [1036, 21, 24, 10], [81, 20, 24, 12], [100, 20, 24, 10], [1029, 20, 24, 10], [21, 20, 23, 10], [22, 22, 25, 5], [1031, 20, 24, 10], [179, 20, 23, 10], [180, 24, 26, 3], [1037, 22, 25, 5]],
  grue: [[1021, 27, 31, 10], [1038, 27, 31, 10], [1039, 27, 30, 10], [1023, 28, 31, 10], [96, 27, 31, 10], [177, 27, 30, 10], [203, 28, 31, 8], [163, 27, 30, 10], [164, 30, 32, 3], [1043, 28, 31, 8], [1015, 27, 30, 8]],
  brasier: [[1041, 28, 32, 20], [1042, 31, 33, 4], [58, 28, 32, 12], [77, 28, 32, 12], [1028, 28, 31, 10], [1026, 28, 31, 10], [126, 30, 33, 4], [74, 28, 31, 10]],
  givre: [[1045, 37, 41, 20], [1046, 40, 42, 4], [86, 37, 41, 12], [220, 37, 41, 12], [221, 40, 42, 4], [225, 37, 41, 10], [215, 38, 41, 10], [124, 39, 42, 5], [1012, 38, 41, 8], [1016, 38, 41, 8]],
  tourbillons: [[1046, 40, 44, 15], [87, 40, 44, 10], [1030, 40, 43, 12], [1032, 40, 43, 12], [1027, 40, 44, 10], [1009, 42, 44, 3], [131, 42, 44, 4], [42, 40, 43, 12], [1025, 40, 43, 10]],
  est: [[1029, 30, 36, 20], [1031, 30, 36, 20], [72, 30, 36, 20], [1033, 32, 36, 10], [1045, 32, 36, 8], [120, 30, 35, 10], [1007, 32, 35, 3], [131, 35, 38, 2]],
  r10: [[1014, 33, 37, 10], [1035, 33, 37, 10], [1037, 33, 37, 10], [1040, 34, 37, 5], [22, 33, 37, 15], [85, 33, 37, 10], [128, 34, 37, 10], [241, 34, 37, 10], [203, 33, 37, 10], [20, 33, 36, 10]],
};

/* ---------------- dresseurs ---------------- */
// classe → apparence sur la carte et portrait en combat, prime de base
const CLS = {
  Gamin: ['gamin', 16], Fillette: ['fillette', 16], Montagnard: ['montagnard', 24], Marin: ['marin', 24],
  Topdresseur: ['topdresseur', 40], Topdresseuse: ['topdresseuse', 40], Scientifique: ['scientifique', 30], Pêcheur: ['pecheur', 20],
  Insectomane: ['insectomane', 16], Randonneuse: ['randonneuse', 20], Médium: ['medium', 30], Karatéka: ['karateka', 28],
  'Garde d\'Écaille': ['garde', 36],
  // troisième valeur : portrait en combat quand le personnage n'a pas le sien
  Sage: ['vieil_homme', 32, 'medium'], 'Grand Sage': ['vieil_homme', 60, 'medium'], Skieuse: ['randonneuse', 30], Alpiniste: ['montagnard', 30],
};
export const LEADERS = [
  { name: 'Hector', type: 'bug', ow: 'hector', team: [[1018, 10], [167, 11], [1020, 12], [1019, 14]], intro: 'Les insectes ne crient pas : ils observent. Et toi, que vois-tu dans ce combat ?', lose: 'Tu as l\'œil vif ! Le Badge Élytre est à toi.' },
  { name: 'Marine', type: 'water', ow: 'marine', team: [[1031, 19], [1029, 19], [120, 20], [1033, 22]], intro: 'La marée monte ! Tu vas te faire emporter par mes créatures de l\'océan !', lose: 'Ouah, tu as tenu face à la vague. Voici le Badge Écume !' },
  { name: 'Volta', type: 'electric', ow: 'volta', team: [[1034, 25], [1036, 26], [82, 26], [1035, 29]], intro: 'Ça grésille ! Prépare-toi à recevoir le choc de ta vie !', lose: 'Court-circuit total ! Tu remportes le Badge Volt.' },
  { name: 'Flora', type: 'grass', ow: 'flora', team: [[1021, 30], [1038, 31], [114, 31], [1022, 34]], intro: 'Mes fleurs sont belles, mais elles savent piquer. Prêt ?', lose: 'Tu as fait éclore quelque chose de beau. Le Badge Pétale te revient.' },
  { name: 'Sibylle', type: 'psychic', ow: 'sibylle', team: [[1039, 35], [1030, 36], [1019, 36], [65, 37], [1040, 39]], intro: 'J\'ai déjà vu l\'issue de ce combat... mais montre-moi quand même.', lose: 'L\'avenir m\'a trompée. Le Badge Mirage est à toi.' },
  { name: 'Basalte', type: 'rock', ow: 'basalte', team: [[1026, 40], [111, 41], [1028, 42], [95, 42], [1027, 44]], intro: 'Mon frère aîné m\'a confié cette île. Pour aller plus loin, il faudra passer à travers la roche !', lose: 'Tu as fendu le roc... Le Badge Granit est à toi. Drakos ne va pas aimer ça.' },
  { name: 'Pyros', type: 'fire', ow: 'pyros', team: [[1041, 45], [78, 46], [1005, 46], [126, 47], [1042, 49]], intro: 'Le volcan gronde et mon cœur aussi ! Personne ne passe sur la Grande Île sans brûler un peu !', lose: 'Quelle flamme... Le Badge Braise te va bien. Va. Drakos t\'attend.' },
  { name: 'Drakos', type: 'dragon', ow: 'drakos', team: [[1049, 50], [1044, 52], [148, 52], [1050, 53], [149, 54], [1051, 56]], intro: 'Dix ans que personne n\'a franchi cette porte. Célestine t\'envoie ? Peu importe. Ici, c\'est moi qui règne !', lose: '... Les dragons te reconnaissent. Prends le Badge Écaille. Le dernier.' },
];
const CHAMPION = { name: 'Célestine', ow: 'celestine', team: [[1016, 56], [1046, 57], [1035, 57], [1040, 58], [248, 58], [149, 60]], intro: 'Huit badges... Et même celui de Drakos. Tu as parcouru toute la région pour arriver jusqu\'ici. Alors montre-moi tout ce que tu as appris !', lose: 'Magnifique. Tu es le nouveau Maître de la Ligue Céleste !' };

let tCount = 0;
function trainerNpc(map, x, y, dir, cls, name, team, o = {}) {
  const [ow, prize, bs] = CLS[cls] || ['gamin', 20];
  return map.npc({
    id: o.id || `${map.id}:t${tCount++}`, x, y, dir, sprite: o.ow || ow, move: 'static', onWin: o.onWin,
    trainer: { cls, name, team, prize: o.prize || prize, sight: o.sight ?? 4, bs: o.bs || bs || ow, ai: o.ai || 'normal', items: o.items, intro: o.intro || 'Nos regards se sont croisés : c\'est l\'heure du combat !', lose: o.lose || 'J\'ai perdu...', after: o.after || 'Tu es vraiment fort !' },
  });
}
/** dresseur posé le long d'une route : t sur la ligne, côté ±1, distance au sentier */
function routeTrainer(map, pts, t, side, off, cls, name, team, o = {}) {
  const p = along(pts, t);
  const [x, y] = nearestWalkable(map, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off);
  // regarde vers le sentier
  const vx = -p.nx * side, vy = -p.ny * side;
  const dir = o.dir || (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up'));
  return trainerNpc(map, x, y, dir, cls, name, team, o);
}
function routeItem(map, pts, t, side, off, item, qty = 1) {
  const p = along(pts, t);
  const [x, y] = nearestWalkable(map, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off);
  map.item(x, y, item, qty);
}

/* ---------------- villes ---------------- */
function buildTown(W, maps, def) {
  const ox = def.x, oy = def.y;
  carveTown(W, { x: ox, y: oy, w: def.w, h: def.h, exits: def.exits, ground: def.ground });
  for (const [x0, y0, x1, y1, t] of def.roads || []) W.rect(ox + x0, oy + y0, ox + x1, oy + y1, t ?? T.PAVE);
  for (const d of def.deco || []) {
    const [k, ...a] = d;
    if (k === 'flowers') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.FLOWER, [T.GRASS, T.ASH, T.PAVE]);
    else if (k === 'fence') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.FENCE);
    else if (k === 'water') W.blob(ox + a[0], oy + a[1], a[2], a[3], T.WATER, rng(ox * 31 + oy), [T.GRASS, T.FLOWER, T.ASH, T.SAND]);
    else if (k === 'waterRect') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.WATER);
    else if (k === 'sand') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.SAND);
    else if (k === 'bridge') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.BRIDGE);
    else if (k === 'trees') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], a[4] ?? T.TREE);
    else if (k === 'tall') W.rect(ox + a[0], oy + a[1], ox + a[2], oy + a[3], T.TALL, [T.GRASS]);
    else if (k === 'rock') W.set(ox + a[0], oy + a[1], T.ROCK);
    else if (k === 'cut') W.set(ox + a[0], oy + a[1], T.CUT);
    else if (k === 'sign') W.sign(ox + a[0], oy + a[1], a[2]);
    else W.prop(k, ox + a[0], oy + a[1]);
  }
  for (const b of def.buildings) {
    const B = W.building(b.kind, ox + b.x, oy + b.y, { roof: b.roof, style: b.style, label: b.label, w: b.w, d: b.d, h: b.h, door: b.door });
    const id = `${def.id}:${b.id || b.kind + b.x}`;
    let inside;
    if (b.interior) inside = b.interior(id);
    else if (b.kind === 'center') inside = centerInterior(id, 'Centre de soins');
    else if (b.kind === 'mart') inside = martInterior(id, 'Boutique', STOCK[def.stock || 1]);
    else if (b.kind === 'gym') inside = gymInterior(id, LEADERS[def.gym].type, 'Arène de ' + def.name);
    else if (b.kind === 'lab') inside = labInterior(id);
    else if (b.kind === 'league') inside = leagueInterior(id);
    else inside = houseInterior(id, b.name || 'Maison', { w: b.kind === 'bighouse' || b.kind === 'tower' ? 11 : 9, h: b.kind === 'bighouse' || b.kind === 'tower' ? 9 : 8, bed: b.bed, extraBooks: b.kind === 'tower', kitchen: b.kitchen });
    inside.townId = def.id; inside.outside = { map: 'monde', x: B.doorX, y: B.doorY + 1, dir: 'down' };
    inside.warp(inside.exitX, inside.exitY, inside.outside);
    if (inside.get(inside.exitX - 1, inside.exitY) === T.MAT) inside.warp(inside.exitX - 1, inside.exitY, inside.outside);
    W.warp(B.doorX, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
    for (const n of b.npcs || []) inside.npc({ id: `${id}:${n.id || n.x + '-' + n.y}`, ...n });
    if (b.setup) b.setup(inside);
    // chemin depuis la porte jusqu'à la route la plus proche
    for (let y = B.doorY + 1; y < B.doorY + 8; y++) { const t = W.get(B.doorX, y); if (t === T.PAVE || t === T.PATH) break; if (t === T.TREE || t === T.BUILD || t === T.WATER) break; W.set(B.doorX, y, T.PATH); }
    maps[id] = inside;
    for (const more of b.more ? b.more(inside, id) : []) maps[more.id] = more;   // étages supplémentaires
    if (b.kind === 'center') { def.centerId = id; def.centerDoor = [B.doorX, B.doorY + 1]; }
    if (b.id === 'maison') def.homeDoor = [B.doorX, B.doorY + 1];   // Vol ramène devant la maison à Bourg-Aube (pas de Centre)
    if (b.kind === 'gym') { def.gymMap = inside; def.gymDoor = [B.doorX, B.doorY]; }
  }
  for (const n of def.npcs || []) {
    const gate = n.gate ? { ...n.gate, tiles: n.gate.tiles.map(([x, y]) => [ox + x, oy + y]) } : undefined;
    const npc = W.npc({ ...n, gate, id: `${def.id}:${n.id || n.x + '-' + n.y}`, x: ox + n.x, y: oy + n.y });
    if (gate) W.gates.push({ npc: npc.id, ...gate });
  }
  W.zone(ox, oy, ox + def.w - 1, oy + def.h - 1, { name: def.name, music: def.music || 'town', town: def.id, theme: def.theme });
}
/** garde posté devant la porte de l'arène d'une île (on peut y arriver par la mer de plusieurs côtés) */
function gymGuard(W, def, badges, text) {
  const [dx, dy] = def.gymDoor;
  const npc = W.npc({ id: `${def.id}:garde-arene`, x: dx + 1, y: dy + 1, dir: 'left', sprite: 'garde', gate: { badges, tiles: [[dx, dy + 1]] }, text });
  W.gates.push({ npc: npc.id, badges, tiles: [[dx, dy + 1]] });
}

/* ======================================================================
   Construction de la région
   ====================================================================== */
export function buildWorld() {
  tCount = 0;
  const W = new GameMap('monde', 440, 280, { outdoor: true, fill: T.TREE, name: 'Odyssée' });
  const maps = { monde: W };
  const towns = {};

  // mers : nord, côte du Port-Azur, est, sud-est (l'archipel), détroit de Cimelune
  W.rect(150, 0, 339, 19, T.WATER);
  W.rect(222, 20, 272, 35, T.WATER);
  W.rect(322, 0, 439, 279, T.WATER);   // mer de l'Est : les îles du bateau
  W.rect(0, 268, 184, 279, T.WATER);   // mer du Sud
  // baie de l'Aube (l'Embarcadère, à droite de la route 1) et chenal vers la mer du Sud, sous le pont de la route 10
  W.blob(60, 214, 7, 10, T.WATER, rng(2024)); W.rect(60, 214, 62, 267, T.WATER);
  W.rect(185, 196, 339, 279, T.WATER);
  W.rect(250, 189, 321, 195, T.WATER);   // la mer s'avance jusqu'au Cap Mirage
  // l'archipel : Île de Granit (petite), Cendrelune (volcan), Grande Île de l'Écaille
  W.rect(302, 197, 331, 218, T.TREE);
  W.rect(266, 221, 309, 254, T.TREE);
  W.rect(190, 201, 259, 271, T.TREE);

  /* ---------- A · Bourg-Aube ---------- */
  const A = towns.A = {
    id: 'aube', name: 'Bourg-Aube', x: 20, y: 238, w: 30, h: 22, exits: [['n', 14], ['e', 10]],
    roads: [[14, 2, 15, 18, T.PATH], [4, 10, 29, 11, T.PATH], [14, 18, 20, 19, T.PATH]],
    deco: [['flowers', 9, 3, 11, 5], ['flowers', 25, 13, 26, 17], ['water', 6, 15, 3.2, 2.2], ['fence', 2, 8, 4, 8], ['fence', 24, 8, 27, 8],
      ['sign', 12, 8, 'BOURG-AUBE\nLà où chaque aventure commence.'], ['sign', 16, 17, 'LABORATOIRE\nProf. Saule'], ['lamp', 13, 9], ['lamp', 16, 9], ['mailbox', 8, 6], ['mailbox', 19, 6]],
    buildings: [
      { kind: 'house', x: 4, y: 4, roof: 'red', id: 'maison', name: 'Maison', bed: true, kitchen: true, npcs: [{ id: 'maman', x: 5, y: 4, sprite: 'maman', dir: 'down', script: 'mom' }] },
      { kind: 'house', x: 20, y: 4, roof: 'blue', id: 'rival', name: 'Maison de Théo', npcs: [{ x: 3, y: 4, sprite: 'habitante', dir: 'right', script: 'rivalMom' }] },
      { kind: 'lab', x: 17, y: 13, id: 'labo' },
    ],
    npcs: [
      { id: 'fille', x: 11, y: 13, sprite: 'fillette', move: 'wander', text: ['Les créatures sauvages vivent dans les hautes herbes.', 'Sans créature à toi, il ne faut surtout pas y aller !'] },
      { id: 'vieux', x: 24, y: 7, sprite: 'vieil_homme', move: 'turn', text: ['Tu sais courir ? Garde la touche Maj enfoncée en marchant.', 'Et si tu oublies une touche, regarde le petit bouton en bas de l\'écran !'] },
      { id: 'garde10', x: 28, y: 10, sprite: 'garde', dir: 'left', gate: { badges: 5, tiles: [[28, 10], [28, 11]] }, text: ['La route 10 longe des falaises instables.', 'Reviens quand tu auras 5 badges.'] },
    ],
  };
  buildTown(W, maps, A);
  W.zone(34 - 1, 238, 36, 240, { name: 'Bourg-Aube', music: 'town', trigger: 'needStarter' });

  /* ---------- B · Sylvebourg (Hector, Insecte) ---------- */
  const B = towns.B = {
    id: 'sylve', name: 'Sylvebourg', x: 18, y: 138, w: 34, h: 24, exits: [['s', 16], ['n', 16]], gym: 0, stock: 1,
    roads: [[16, 0, 17, 23, T.PATH], [4, 11, 29, 12], [4, 19, 25, 20]],
    deco: [['flowers', 11, 4, 14, 7], ['flowers', 19, 4, 21, 7], ['lamp', 14, 10], ['lamp', 19, 10], ['lamp', 14, 13], ['lamp', 19, 13],
      ['sign', 14, 9, 'SYLVEBOURG\nLa ville où murmurent les feuilles.'], ['sign', 20, 18, 'ARÈNE DE SYLVEBOURG\nChampion : Hector\nL\'observateur des insectes.'],
      ['trees', 28, 15, 30, 18], ['trees', 2, 14, 3, 16], ['tall', 28, 2, 31, 5]],
    buildings: [
      { kind: 'center', x: 5, y: 7 }, { kind: 'mart', x: 23, y: 7 }, { kind: 'gym', x: 21, y: 14, roof: 'green' },
      { kind: 'house', x: 5, y: 15, roof: 'green', npcs: [{ x: 4, y: 4, sprite: 'insectomane', text: ['Hector, le Champion, adore les créatures Insecte.', 'Le Feu, le Vol et la Roche les mettent en difficulté !'] }] },
      { kind: 'house', x: 10, y: 15, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Une créature endormie ou paralysée est bien plus facile à capturer.', 'Et plus ses PV sont bas, mieux c\'est !'] }, { id: 'gs', x: 6, y: 3, sprite: 'vieil_homme', script: 'gsBall' }] },
    ],
    npcs: [
      { id: 'gamin', x: 9, y: 13, sprite: 'gamin', move: 'wander', text: ['Le Centre de soins soigne tes créatures gratuitement.', 'C\'est le bâtiment au toit rouge !'] },
      { id: 'garde', x: 16, y: 3, sprite: 'garde', dir: 'down', gate: { badges: 1, tiles: [[16, 2], [17, 2]] }, text: ['Le Bois Murmure est plein de dresseurs coriaces.', 'Reviens quand tu auras le badge de l\'Arène !'] },
    ],
  };
  buildTown(W, maps, B);

  /* ---------- C · Pierrefort (ville minière, sans arène) ---------- */
  const C = towns.C = {
    id: 'pierre', name: 'Pierrefort', x: 90, y: 30, w: 32, h: 24, exits: [['s', 15], ['e', 10]], stock: 2,
    roads: [[15, 10, 16, 23], [4, 10, 31, 11], [4, 18, 27, 19]],
    deco: [['rock', 27, 14], ['rock', 28, 16], ['rock', 26, 21], ['rock', 3, 21], ['lamp', 14, 12], ['lamp', 17, 12], ['trees', 26, 3, 29, 6, T.PINE],
      ['sign', 13, 12, 'PIERREFORT\nUne ville taillée dans la montagne.'], ['sign', 26, 8, 'MAISON DES MINEURS\nAncien atelier de Basalte.'], ['flowers', 18, 21, 24, 21]],
    buildings: [
      { kind: 'center', x: 4, y: 4 }, { kind: 'mart', x: 10, y: 5 },
      { kind: 'bighouse', x: 19, y: 3, roof: 'brown', id: 'mineurs', name: 'Maison des Mineurs', npcs: [
        { x: 4, y: 5, sprite: 'montagnard', text: ['Ici travaillait Basalte, le meilleur mineur de la région.', 'Il est parti sur l\'Île de Granit, au sud-est, rejoindre ses deux frères.', 'On dit qu\'il garde l\'île pour le compte de l\'aîné, Drakos...'] },
        { x: 7, y: 6, sprite: 'vieil_homme', text: ['Les trois frères étaient de braves gars.', 'Puis Drakos a perdu contre Célestine, la Maître de la Ligue.', 'Il n\'a jamais digéré sa défaite. Il s\'est taillé un royaume sur les îles.'] }] },
      { kind: 'house', x: 4, y: 14, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['Les créatures Roche résistent aux attaques Normal et Feu.', 'Mais l\'Eau et la Plante les font fondre !'] }] },
      { kind: 'house', x: 9, y: 14, roof: 'brown', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['À l\'est, la route 3 mène à la Grotte Lunaire.', 'Il y fait sombre... et les Noctaile adorent s\'y cacher.'] }] },
      { kind: 'house2', x: 20, y: 14, roof: 'red', npcs: [{ x: 2, y: 4, sprite: 'scientifique', text: ['Ta créature peut évoluer en gagnant des niveaux.', 'Certaines ont besoin d\'une pierre spéciale, vendue en boutique.'] }] },
    ],
    npcs: [
      { id: 'montagnard', x: 20, y: 12, sprite: 'montagnard', move: 'wander', text: ['Il paraît que des Cristaupe creusent au fond de la Grotte Lunaire.', 'Leurs cristaux brillent dans le noir !'] },
    ],
  };
  buildTown(W, maps, C);

  /* ---------- D · Port-Azur (Marine, Eau) ---------- */
  const D = towns.D = {
    id: 'azur', name: 'Port-Azur', x: 185, y: 22, w: 34, h: 26, exits: [['w', 11], ['e', 19]], gym: 1, stock: 3, music: 'port',
    roads: [[2, 11, 31, 12], [2, 19, 33, 20], [15, 7, 16, 20], [30, 11, 31, 20]],
    deco: [['waterRect', 2, 0, 31, 3], ['sand', 2, 4, 31, 6], ['bridge', 15, 0, 16, 6], ['lamp', 14, 13], ['lamp', 17, 13], ['lamp', 14, 21], ['lamp', 17, 21],
      ['sign', 13, 8, 'PORT-AZUR\nLe parfum des embruns et des voyages.'], ['sign', 12, 18, 'ARÈNE DE PORT-AZUR\nChampionne : Marine\nLa vague déferlante.'], ['flowers', 3, 21, 12, 23], ['flowers', 19, 21, 28, 23]],
    buildings: [
      { kind: 'center', x: 3, y: 7 }, { kind: 'mart', x: 9, y: 7 },
      { kind: 'house', x: 19, y: 8, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'marin', text: ['Plus loin à l\'est, Voltacité ne dort jamais.', 'Ses néons éclairent la côte toute la nuit !'] }] },
      { kind: 'house', x: 24, y: 8, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Une créature peut retenir quatre attaques au maximum.', 'Quand elle en apprend une cinquième, il faut en oublier une.'] }] },
      { kind: 'gym', x: 5, y: 14, roof: 'blue' },
      { kind: 'house', x: 19, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Avant, un ferry partait d\'ici pour l\'archipel du sud.', 'Depuis que Drakos tient les îles, plus un bateau ne part.', 'Il faut savoir surfer pour s\'y rendre, maintenant.'] }] },
      { kind: 'house2', x: 24, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Le jour, la nuit, le matin, le soir...', 'La couleur du ciel change avec l\'heure de ton ordinateur !'] }] },
    ],
    npcs: [
      { id: 'marin', x: 17, y: 5, sprite: 'marin', move: 'turn', text: ['Ahoy ! Ce ponton était le départ des ferries.', 'Depuis que les îles ont fermé leurs ports, plus aucun bateau ne part...'] },
      { id: 'pecheur', x: 25, y: 5, sprite: 'pecheur', move: 'wander', text: ['Les Galetin pincent fort, méfie-toi en marchant sur la plage.'] },
      { id: 'garde', x: 32, y: 18, sprite: 'garde', dir: 'left', gate: { badges: 2, tiles: [[33, 19], [33, 20]] }, text: ['La route 4 longe une côte escarpée.', 'Il faut deux badges pour l\'emprunter.'] },
    ],
  };
  buildTown(W, maps, D);

  /* ---------- E · Voltacité (Volta, Électrik) ---------- */
  const E = towns.E = {
    id: 'volta', name: 'Voltacité', x: 275, y: 48, w: 32, h: 24, exits: [['w', 10], ['s', 8]], gym: 2, stock: 4, ground: T.PAVE, music: 'city',
    roads: [[0, 10, 29, 11], [2, 18, 29, 19], [8, 10, 9, 23]],
    deco: [['lamp', 7, 12], ['lamp', 10, 12], ['lamp', 16, 12], ['lamp', 22, 12], ['lamp', 16, 20], ['lamp', 27, 20], ['pot', 2, 12], ['pot', 28, 12],
      ['sign', 11, 12, 'VOLTACITÉ\nLa ville qui ne s\'éteint jamais.'], ['sign', 17, 17, 'ARÈNE DE VOLTACITÉ\nChampionne : Volta\nL\'étincelle foudroyante.'], ['flowers', 2, 21, 7, 22], ['flowers', 11, 21, 28, 22]],
    buildings: [
      { kind: 'center', x: 3, y: 6 }, { kind: 'mart', x: 11, y: 6 },
      { kind: 'tower', x: 17, y: 6, roof: 'gold', name: 'Centrale de Voltacité', npcs: [{ x: 5, y: 4, sprite: 'scientifique', text: ['Cette centrale alimente toute la région.', 'Les Ampoulet adorent se blottir contre les générateurs !'] }, { x: 8, y: 6, sprite: 'scientifique', text: ['Les créatures Sol ne craignent pas du tout l\'électricité.', 'Un bon atout contre l\'Arène !'] }] },
      { kind: 'house2', x: 23, y: 7, roof: 'gray', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['La paralysie divise la vitesse par quatre.', 'Et parfois, la créature ne peut même pas attaquer !'] }] },
      { kind: 'gym', x: 18, y: 13, roof: 'gold' },
      { kind: 'house', x: 11, y: 15, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Une Super Capsule capture mieux qu\'une Capsule.', 'Une Hyper Capsule, c\'est encore mieux !'] }] },
      { kind: 'house', x: 3, y: 15, roof: 'purple', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Au sud, la route 5 descend jusqu\'à Floralia.', 'Une ville couverte de fleurs, tu verras.'] }] },
    ],
    npcs: [
      { id: 'scientifique', x: 14, y: 14, sprite: 'scientifique', move: 'wander', text: ['La nuit, les créatures qu\'on croise ne sont pas tout à fait les mêmes.', 'Les Chouillon, par exemple, sortent surtout le soir.'] },
      { id: 'garde', x: 10, y: 21, sprite: 'garde', dir: 'left', gate: { badges: 3, tiles: [[8, 21], [9, 21]] }, text: ['La route 5 est fermée aux dresseurs débutants.', 'Il faut trois badges pour passer.'] },
    ],
  };
  buildTown(W, maps, E);

  /* ---------- F · Floralia (Flora, Plante) ---------- */
  const F = towns.F = {
    id: 'flora', name: 'Floralia', x: 165, y: 112, w: 36, h: 28, exits: [['n', 17], ['e', 19]], gym: 3, stock: 5, music: 'city',
    roads: [[17, 0, 18, 20], [2, 9, 33, 10], [2, 19, 33, 20], [2, 9, 3, 20], [32, 9, 33, 20]],
    deco: [['flowers', 5, 11, 15, 12], ['flowers', 20, 11, 30, 12], ['flowers', 4, 22, 14, 24], ['water', 24, 23, 3.4, 1.6], ['flowers', 19, 21, 21, 24], ['flowers', 29, 22, 31, 24],
      ['lamp', 16, 7], ['lamp', 19, 7], ['lamp', 16, 21], ['lamp', 19, 21], ['pot', 8, 13], ['pot', 28, 13],
      ['sign', 15, 3, 'FLORALIA\nLa cité aux mille couleurs.'], ['sign', 20, 17, 'ARÈNE DE FLORALIA\nChampionne : Flora\nLa beauté épineuse.'],
      // petits arbres qui barrent la route 6 : il faut la capacité Coupe
      ['cut', 34, 19], ['cut', 34, 20]],
    buildings: [
      { kind: 'center', x: 3, y: 5 }, { kind: 'mart', x: 9, y: 5 },
      { kind: 'bighouse', x: 21, y: 5, roof: 'purple', name: 'Résidence Floralia', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Les attaques de statut ne font pas de dégâts, mais elles changent tout.', 'Un adversaire endormi, c\'est un adversaire inoffensif !'] }, { x: 7, y: 5, sprite: 'scientifique', text: ['J\'ai vu un dresseur aux cheveux bleus foncer vers l\'Arène.', 'Il avait l\'air pressé de te battre...'] }] },
      { kind: 'house2', x: 27, y: 6, roof: 'green', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['Les petits arbres à l\'est bloquent la route de Mirage.', 'Flora sait comment les couper... mais elle ne l\'apprend qu\'aux dresseurs qui la battent !'] }] },
      { kind: 'gym', x: 21, y: 14, roof: 'green' },
      { kind: 'house', x: 4, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Ta créature la plus en forme combat en premier.', 'Change l\'ordre de ton équipe dans le menu Équipe !'] }] },
      { kind: 'house', x: 9, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Mirage, à l\'est, est une ville étrange.', 'On dit que ses habitants lisent dans les pensées.'] }] },
      { kind: 'house', x: 28, y: 16, roof: 'blue', npcs: [{ x: 3, y: 4, sprite: 'marin', text: ['Le PC du Centre garde les créatures en trop.', 'Ton équipe ne peut compter que six créatures.'] }] },
    ],
    npcs: [
      { id: 'jardiniere', x: 12, y: 13, sprite: 'fillette', move: 'wander', text: ['Bienvenue à Floralia ! Respire ce parfum...'] },
      { id: 'garde', x: 17, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 3, tiles: [[17, 1], [18, 1]] }, text: ['Floralia accueille les dresseurs qui ont trois badges.'] },
    ],
  };
  buildTown(W, maps, F);
  W.zone(165 + 15, 112, 165 + 20, 112 + 4, { name: 'Floralia', music: 'city', trigger: 'rival3' });

  /* ---------- G · Mirage (Sibylle, Psy) ---------- */
  const G = towns.G = {
    id: 'mirage', name: 'Mirage', x: 276, y: 136, w: 30, h: 24, exits: [['w', 10], ['s', 15]], gym: 4, stock: 6, music: 'mystic',
    roads: [[0, 10, 27, 11], [2, 18, 27, 19], [15, 10, 16, 23]],
    deco: [['flowers', 2, 2, 27, 3], ['lamp', 14, 12], ['lamp', 17, 12], ['pot', 2, 13], ['pot', 13, 16], ['water', 23, 22, 3, 1.4],
      ['sign', 18, 12, 'MIRAGE\nLa ville où l\'esprit voit plus loin.'], ['sign', 11, 17, 'ARÈNE DE MIRAGE\nChampionne : Sibylle\nLe regard qui perce le voile.']],
    buildings: [
      { kind: 'center', x: 3, y: 6 }, { kind: 'mart', x: 9, y: 6 },
      { kind: 'tower', x: 20, y: 6, roof: 'purple', name: 'Tour Mirage', npcs: [{ x: 5, y: 4, sprite: 'medium', text: ['Les attaques Psy sont puissantes... mais le type Ténèbres ne les craint pas.', 'Et les Insectes ne sont pas si fragiles face à elles.'] }] },
      { kind: 'gym', x: 3, y: 13, roof: 'purple' },
      { kind: 'house', x: 19, y: 15, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'medium', text: ['Je savais que tu viendrais. Ne me demande pas comment.'] }] },
      { kind: 'house', x: 24, y: 15, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'pecheur', text: ['Au sud, la route 7 descend jusqu\'au Cap Mirage.', 'De là, on aperçoit les îles de l\'archipel.', 'Mais sans Surf, impossible de traverser.'] }] },
    ],
    npcs: [
      { id: 'voyante', x: 20, y: 13, sprite: 'medium', move: 'turn', text: ['Je vois... trois îles, trois frères.', 'Et une vieille rancune qui gronde comme un volcan.'] },
    ],
  };
  buildTown(W, maps, G);

  /* ---------- K · Port-Granit, Île de Granit (Basalte, Roche) ---------- */
  const K = towns.K = {
    id: 'granit', name: 'Port-Granit', x: 304, y: 198, w: 26, h: 19, exits: [['n', 11]], gym: 5, stock: 6, music: 'port', island: true,
    roads: [[11, 0, 12, 16, T.PATH], [2, 9, 23, 10, T.PATH]],
    deco: [['rock', 3, 3], ['rock', 21, 3], ['rock', 22, 14], ['lamp', 10, 8], ['lamp', 13, 8],
      ['sign', 14, 3, 'PORT-GRANIT\nÎle de Granit — sous la protection de Drakos.'], ['sign', 9, 11, 'ARÈNE DE GRANIT\nChampion : Basalte\nLe frère cadet.']],
    buildings: [
      { kind: 'center', x: 2, y: 4 }, { kind: 'mart', x: 18, y: 4 },
      { kind: 'gym', x: 3, y: 11, roof: 'brown' },
      { kind: 'house', x: 15, y: 12, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Drakos nous prend la moitié de chaque pêche.', '« Pour protéger les îles », qu\'il dit.', 'Basalte ferme les yeux... c\'est son frère, après tout.'] }] },
      { kind: 'house', x: 20, y: 12, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Les trois frères sont nés ici, sur Granit.', 'Basalte est le plus jeune. Pyros garde le volcan, et Drakos... la Grande Île.'] }] },
    ],
    npcs: [
      { id: 'garde-quai', x: 13, y: 2, sprite: 'garde', dir: 'down', script: 'granitDock', text: ['Port-Granit. Ici, c\'est Drakos qui fait la loi, pas la Ligue.'] },
      { id: 'marin', x: 7, y: 8, sprite: 'marin', move: 'wander', text: ['Avec Surf, tu peux rejoindre Cendrelune, au sud-ouest.', 'Mais les gardes de Pyros ne laissent entrer que ceux qui ont battu Basalte.'] },
    ],
  };
  buildTown(W, maps, K);
  // ponton de Port-Granit, face au Cap Mirage
  W.rect(314, 196, 317, 198, T.SAND);

  /* ---------- H · Cendrelune (Pyros, Feu) ---------- */
  const H = towns.H = {
    id: 'cendre', name: 'Cendrelune', x: 272, y: 226, w: 32, h: 24, exits: [['n', 19], ['w', 12]], gym: 6, stock: 7, ground: T.ASH, music: 'volcano', theme: 'volcanic', island: true,
    roads: [[19, 0, 20, 13, T.PATH], [0, 12, 29, 13, T.PATH], [2, 20, 29, 21, T.PATH], [9, 12, 10, 21, T.PATH]],
    deco: [['rock', 26, 4], ['rock', 28, 7], ['rock', 3, 3], ['lamp', 18, 14], ['lamp', 21, 14],
      ['sign', 22, 10, 'CENDRELUNE\nL\'île où dort le volcan.'], ['sign', 11, 19, 'ARÈNE DE CENDRELUNE\nChampion : Pyros\nLe frère du milieu.']],
    buildings: [
      { kind: 'center', x: 3, y: 7 }, { kind: 'mart', x: 11, y: 7 },
      { kind: 'house', x: 23, y: 8, roof: 'orange', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['L\'Eau, la Roche et le Sol éteignent le Feu.', 'Pyros a beau être ardent, il a ses faiblesses.'] }] },
      { kind: 'gym', x: 12, y: 15, roof: 'red' },
      { kind: 'house', x: 3, y: 17, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Le pont qui nous reliait au continent a été coupé sur ordre de Drakos.', 'Il voulait que les îles se débrouillent sans la Ligue.'] }] },
      { kind: 'house', x: 22, y: 17, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: ['Pyros n\'est pas méchant. Il croit que son frère protège les îles.', 'Mais protéger, ce n\'est pas tout prendre...'] }] },
    ],
    npcs: [],
  };
  buildTown(W, maps, H);
  // plages de Cendrelune : au nord (vers Granit) et à l'ouest (vers la Grande Île)
  W.rect(290, 221, 293, 225, T.SAND); W.rect(266, 237, 271, 239, T.SAND);
  gymGuard(W, H, 6, ['Halte ! L\'arène de Pyros n\'accueille que ceux qui ont vaincu Basalte.', 'Reviens avec le Badge Granit.']);

  /* ---------- L · Fort-Écaille, Grande Île (Drakos, Dragon) ---------- */
  const L = towns.L = {
    id: 'ecaille', name: 'Fort-Écaille', x: 196, y: 207, w: 34, h: 24, exits: [['e', 11], ['n', 16], ['s', 16]], gym: 7, stock: 7, music: 'mystic', island: true,
    roads: [[2, 11, 33, 12], [16, 0, 17, 23], [2, 18, 30, 19]],
    deco: [['statue', 14, 9], ['statue', 19, 9], ['lamp', 12, 13], ['lamp', 21, 13], ['lamp', 12, 20], ['lamp', 21, 20], ['trees', 2, 2, 5, 5, T.PINE], ['trees', 28, 2, 31, 5, T.PINE],
      ['sign', 22, 10, 'FORT-ÉCAILLE\nCapitale de l\'archipel. Par ordre de Drakos.'], ['sign', 13, 17, 'TOUR DE DRAKOS\nChampion : Drakos\nL\'aîné des trois frères.']],
    buildings: [
      { kind: 'center', x: 3, y: 6 }, { kind: 'mart', x: 9, y: 6 },
      { kind: 'gym', x: 13, y: 13, roof: 'purple' },
      { kind: 'bighouse', x: 23, y: 4, roof: 'purple', name: 'Caserne d\'Écaille', npcs: [{ x: 4, y: 4, sprite: 'garde', text: ['Nous, les Gardes d\'Écaille, servons Drakos.', 'Il a juré qu\'aucun Maître de la Ligue ne dicterait jamais sa loi aux îles.'] }, { x: 7, y: 5, sprite: 'garde', text: ['Entre nous... ça fait longtemps que je ne sais plus contre qui on se bat.'] }] },
      { kind: 'house', x: 4, y: 15, roof: 'teal', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Drakos a perdu contre Célestine, il y a dix ans, en finale de la Ligue.', 'Depuis, il refuse toute autorité. Même celle de la Ligue.'] }] },
      { kind: 'house', x: 25, y: 15, roof: 'red', npcs: [{ x: 2, y: 4, sprite: 'vieil_homme', text: ['Au nord de la ville, il y a le Cap des Étoiles.', 'On raconte qu\'Odyssor, la baleine céleste, y passe quand la mer est calme...', 'Mais Drakos en interdit l\'accès.'] }] },
    ],
    npcs: [
      { id: 'garde-cap', x: 16, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 8, tiles: [[16, 1], [17, 1]] }, text: ['Le Cap des Étoiles est interdit.', 'Seul Drakos, ou celui qui l\'aura vaincu, peut y passer.'] },
      { id: 'enfant', x: 8, y: 20, sprite: 'enfant', move: 'wander', text: ['Mon papa dit que Drakos était un héros, avant.'] },
    ],
  };
  buildTown(W, maps, L);
  gymGuard(W, L, 7, ['Halte ! Drakos ne reçoit que ceux qui ont vaincu ses deux frères.', 'Il te faut le Badge Granit et le Badge Braise.']);

  /* ---------- I · Cimelune (porte de la Route Victoire) ---------- */
  const I = towns.I = {
    id: 'cime', name: 'Cimelune', x: 150, y: 222, w: 32, h: 26, exits: [['e', 16], ['n', 10], ['w', 16]], stock: 7, music: 'mystic',
    roads: [[2, 9, 29, 10], [0, 16, 31, 17], [10, 0, 11, 17]],
    deco: [['water', 26, 5, 3.2, 2.6], ['trees', 2, 19, 5, 21, T.PINE], ['trees', 26, 19, 29, 21, T.PINE], ['flowers', 12, 19, 19, 21], ['statue', 15, 21], ['lamp', 9, 11], ['lamp', 12, 11],
      ['sign', 8, 8, 'CIMELUNE\nLa cité des dragons anciens.'], ['sign', 13, 14, 'MUSÉE DES DRAGONS\nL\'histoire des dragons d\'Odyssée.']],
    buildings: [
      { kind: 'center', x: 3, y: 5 }, { kind: 'mart', x: 14, y: 5 },
      { kind: 'house', x: 19, y: 6, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'scientifique', text: ['Les dragons ne craignent presque rien...', 'sauf la Glace et les autres dragons.'] }] },
      { kind: 'bighouse', x: 13, y: 11, roof: 'purple', name: 'Musée des Dragons', npcs: [{ x: 5, y: 4, sprite: 'vieil_homme', text: ['Drakos a grandi en écoutant les histoires de ce musée.', 'Il rêvait de devenir Maître. Célestine l\'a battu en finale.', 'Depuis, il règne sur l\'archipel, loin de la Ligue.'] }] },
      { kind: 'house', x: 3, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Au nord, la Route Victoire mène au Plateau Céleste.', 'Seuls les dresseurs aux huit badges peuvent la franchir.'] }] },
      { kind: 'house', x: 22, y: 13, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['La route 10 relie Cimelune à Bourg-Aube, par l\'ouest.', 'Ça rappelle des souvenirs, hein ?'] }] },
    ],
    npcs: [
      { id: 'garde', x: 12, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 8, tiles: [[9, 1], [10, 1], [11, 1], [12, 1]] }, text: ['Halte ! La Route Victoire est réservée aux dresseurs aux huit badges.'] },
    ],
  };
  buildTown(W, maps, I);
  // plage de Cimelune, face à la Grande Île
  W.rect(182, 236, 186, 241, T.SAND);

  /* ---------- J · Plateau Céleste (Ligue) ---------- */
  const J = towns.J = {
    id: 'plateau', name: 'Plateau Céleste', x: 70, y: 150, w: 30, h: 24, exits: [['e', 18]], stock: 7, music: 'league',
    roads: [[3, 10, 26, 19]],
    deco: [['flowers', 3, 3, 8, 8], ['flowers', 20, 3, 26, 8], ['statue', 12, 11], ['statue', 16, 11], ['lamp', 8, 11], ['lamp', 20, 11],
      ['sign', 22, 17, 'PLATEAU CÉLESTE\nLe sommet des dresseurs.']],
    buildings: [
      { kind: 'league', x: 10, y: 4, id: 'ligue' },
      { kind: 'center', x: 3, y: 12 }, { kind: 'mart', x: 21, y: 12 },
    ],
    npcs: [],
  };
  buildTown(W, maps, J);

  /* ======================== ROUTES ======================== */
  const routes = [];
  const R = (id, name, pts, o, enc, music = 'route') => {
    const res = carveRoute(W, pts, { seed: routes.length * 97 + 13, ...o });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = (o.w || 9) / 2 + 2;
    routes.push({ id, name, pts });
    W.zone(Math.floor(Math.min(...xs) - m), Math.floor(Math.min(...ys) - m), Math.ceil(Math.max(...xs) + m), Math.ceil(Math.max(...ys) + m), { name, music, enc: ENC[enc], theme: o.theme, route: id, prio: 0 });
    void res; return pts;
  };
  const r1 = R('r1', 'Route 1', [[34.5, 240], [34.5, 224], [30.5, 210], [38.5, 190], [34.5, 174], [34.5, 160]], { w: 13, grass: 0.8, trees: 0.04 }, 'r1');
  ledges(W, r1, [0.18, 0.32, 0.55, 0.7], { reach: 7 });
  routeTrainer(W, r1, 0.35, 1, 4, 'Gamin', 'Léo', [[1013, 4], [1010, 4]], { intro: 'Hé ! Toi aussi tu viens d\'avoir ta première créature ?' });
  routeTrainer(W, r1, 0.62, -1, 4, 'Fillette', 'Inès', [[161, 5]], { intro: 'Mon Fouinette est le plus mignon de la route !' });
  routeTrainer(W, r1, 0.82, 1, 3, 'Gamin', 'Malo', [[1010, 5], [19, 5], [1017, 4]]);
  routeItem(W, r1, 0.5, -1, 5, 'potion'); routeItem(W, r1, 0.9, 1, 5, 'poke-ball', 2);

  const r2 = R('r2', 'Route 2', [[34.5, 138], [34.5, 120], [37.5, 104], [52.5, 96.5], [75.5, 94.5], [99.5, 92.5]], { w: 11, grass: 0.7, trees: 0.05, flowers: 0.03, taperEnd: false }, 'r2');
  routeTrainer(W, r2, 0.2, -1, 3, 'Insectomane', 'Noé', [[1017, 6], [1018, 6], [10, 7]]);
  routeTrainer(W, r2, 0.45, 1, 3, 'Fillette', 'Jade', [[1039, 7], [29, 7]]);
  routeTrainer(W, r2, 0.7, -1, 4, 'Gamin', 'Sacha', [[21, 8], [1034, 7]]);
  routeTrainer(W, r2, 0.9, 1, 3, 'Topdresseuse', 'Alba', [[1021, 8], [43, 9], [1011, 9]]);
  routeItem(W, r2, 0.33, 1, 4, 'antidote'); routeItem(W, r2, 0.6, -1, 4, 'potion', 2); routeItem(W, r2, 0.8, 1, 5, 'repel');
  W.zone(33, 133, 36, 136, { name: 'Route 2', music: 'route', trigger: 'rival2' });

  const bois = R('bois', 'Bois Murmure', [[99.5, 92.5], [104.5, 82.5], [99.5, 70.5], [104.5, 60.5], [105.5, 52]], { w: 15, grass: 1.2, tall: T.DARKTALL, trees: 0.16, flowers: 0.01, taperStart: false, theme: 'forest' }, 'bois', 'forest');
  routeTrainer(W, bois, 0.2, 1, 4, 'Insectomane', 'Adam', [[1017, 9], [1020, 9], [165, 9]]);
  routeTrainer(W, bois, 0.42, -1, 4, 'Randonneuse', 'Clara', [[1015, 10], [69, 10]]);
  routeTrainer(W, bois, 0.65, 1, 3, 'Insectomane', 'Timothée', [[167, 11], [1019, 11]]);
  routeTrainer(W, bois, 0.85, -1, 4, 'Topdresseur', 'Yanis', [[1043, 12], [1011, 12], [1021, 11]]);
  routeItem(W, bois, 0.3, -1, 6, 'super-potion'); routeItem(W, bois, 0.55, 1, 6, 'paralyze-heal'); routeItem(W, bois, 0.75, -1, 6, 'moon-stone');

  const r3a = R('r3', 'Route 3', [[121, 40.5], [135, 41.5], [148.5, 41.5]], { w: 10, grass: 0.8, trees: 0.04, rocks: 0.02, taperEnd: false }, 'r3');
  routeTrainer(W, r3a, 0.35, 1, 3, 'Montagnard', 'Gaston', [[1026, 11], [74, 12], [66, 12]]);
  routeTrainer(W, r3a, 0.7, -1, 3, 'Fillette', 'Lise', [[1039, 12], [35, 11]]);
  routeItem(W, r3a, 0.55, 1, 4, 'burn-heal');
  const r3b = R('r3e', 'Route 3', [[173.5, 41.5], [178, 41.5], [182, 34.5], [187, 33.5]], { w: 8, grass: 0.6, trees: 0.03, taperStart: false }, 'r3');
  routeTrainer(W, r3b, 0.6, -1, 3, 'Randonneuse', 'Maëlle', [[1034, 13], [27, 13]]);

  const r4 = R('r4', 'Route 4', [[218, 41.5], [235, 42.5], [250, 50.5], [262, 58.5], [277, 58.5]], { w: 12, grass: 0.6, trees: 0.03, flowers: 0.03 }, 'r4', 'route2');
  routeTrainer(W, r4, 0.18, -1, 4, 'Pêcheur', 'Yves', [[1031, 15], [1029, 15], [60, 15]]);
  routeTrainer(W, r4, 0.4, 1, 4, 'Marin', 'Loïc', [[66, 16], [1033, 16]]);
  routeTrainer(W, r4, 0.62, -1, 4, 'Fillette', 'Romane', [[1037, 16], [179, 17]]);
  routeTrainer(W, r4, 0.85, 1, 3, 'Topdresseur', 'Kylian', [[1011, 18], [84, 17], [1026, 18]]);
  routeItem(W, r4, 0.3, 1, 5, 'great-ball', 2); routeItem(W, r4, 0.72, -1, 5, 'water-stone');

  const r5 = R('r5', 'Route 5', [[283.5, 71], [283.5, 86], [262, 96.5], [230, 98.5], [200, 99.5], [182.5, 101], [182.5, 113]], { w: 12, grass: 0.75, trees: 0.05, rocks: 0.01 }, 'r5');
  ledges(W, r5, [0.08], { reach: 6 });
  routeTrainer(W, r5, 0.12, 1, 4, 'Scientifique', 'Pierre', [[1036, 19], [100, 19], [81, 20]]);
  routeTrainer(W, r5, 0.3, -1, 4, 'Randonneuse', 'Élise', [[77, 20], [1014, 20]]);
  routeTrainer(W, r5, 0.46, 1, 4, 'Karatéka', 'Kenji', [[66, 21], [1033, 22]]);
  routeTrainer(W, r5, 0.6, -1, 4, 'Gamin', 'Nathan', [[1034, 20], [22, 20], [209, 21]]);
  routeTrainer(W, r5, 0.78, 1, 4, 'Topdresseuse', 'Zoé', [[1037, 22], [1043, 21], [179, 21]]);
  routeItem(W, r5, 0.22, -1, 5, 'super-potion', 2); routeItem(W, r5, 0.5, 1, 5, 'thunder-stone'); routeItem(W, r5, 0.7, -1, 5, 'full-heal'); routeItem(W, r5, 0.9, 1, 5, 'rare-candy');

  const r6 = R('r6', 'Route 6', [[200, 131.5], [225, 131.5], [245, 140.5], [265, 146.5], [278, 146.5]], { w: 12, grass: 0.8, trees: 0.06, flowers: 0.04 }, 'r6', 'route2');
  routeTrainer(W, r6, 0.15, 1, 4, 'Randonneuse', 'Nina', [[1038, 24], [70, 24]]);
  routeTrainer(W, r6, 0.35, -1, 4, 'Insectomane', 'Hugo', [[1019, 25], [127, 25]]);
  routeTrainer(W, r6, 0.55, 1, 3, 'Médium', 'Morgane', [[1023, 25], [92, 24], [1039, 26]]);
  routeTrainer(W, r6, 0.75, -1, 4, 'Topdresseur', 'Axel', [[47, 26], [1020, 26], [1016, 26]]);
  routeItem(W, r6, 0.25, -1, 5, 'leaf-stone'); routeItem(W, r6, 0.65, 1, 5, 'hyper-potion'); routeItem(W, r6, 0.9, -1, 5, 'revive');

  // route 7 : de Mirage au Cap Mirage, face à l'archipel
  const r7 = R('r7', 'Route 7', [[291.5, 159], [289.5, 172], [291.5, 186]], { w: 12, grass: 0.7, trees: 0.04, rocks: 0.03 }, 'r7');
  ledges(W, r7, [0.4], { reach: 6 });
  routeTrainer(W, r7, 0.25, 1, 4, 'Médium', 'Ophélie', [[1023, 28], [97, 29]]);
  routeTrainer(W, r7, 0.55, -1, 4, 'Karatéka', 'Bruno', [[1033, 29], [107, 29], [106, 30]]);
  routeTrainer(W, r7, 0.8, 1, 4, 'Topdresseuse', 'Lou', [[78, 31], [1012, 31], [1040, 30]]);
  routeItem(W, r7, 0.4, -1, 5, 'fire-stone');
  // Cap Mirage : plage, ponton et le rival qui attend
  W.rect(282, 185, 301, 188, T.SAND);
  W.zone(282, 183, 301, 188, { name: 'Cap Mirage', music: 'route', trigger: 'rival4' });
  W.sign(296, 185, 'CAP MIRAGE\nAu sud-est : Île de Granit. Au sud : Cendrelune.\nTraversée à la nage : Surf requis.');
  W.npc({ id: 'cap:pecheur', x: 286, y: 186, sprite: 'pecheur', dir: 'down', text: ['Les trois îles que tu vois là-bas, ce sont les îles des trois frères.', 'Granit, la plus proche. Puis Cendrelune, le volcan. Et la Grande Île, tout au fond.', 'Drakos, l\'aîné, règne sur les trois depuis Fort-Écaille.'] });

  // Grande Île : route 11 (de la plage est à Fort-Écaille, par une passe rocheuse) et forêt d'Écaille au sud
  const r11 = R('r11', 'Route 11', [[256.5, 238.5], [247, 240.5], [239, 233.5], [233, 224], [229, 218.5]], { w: 10, grass: 0.8, trees: 0.06, rocks: 0.05, taperEnd: false }, 'ecaille');
  W.rect(255, 236, 259, 241, T.SAND);
  // la passe : des rochers fissurés barrent la route sur toute sa largeur (Éclate-Roc)
  { const p = along(r11, 0.55); for (let k = -6; k <= 6; k++) { const x = Math.round(p.x + p.nx * k), y = Math.round(p.y + p.ny * k); for (const [xx, yy] of [[x, y], [x + 1, y]]) { const t = W.get(xx, yy); if (t !== T.TREE && t !== T.WATER) W.set(xx, yy, T.SMASH); } } }
  routeTrainer(W, r11, 0.25, 1, 3, 'Garde d\'Écaille', 'Ronan', [[1044, 44], [1025, 44], [1048, 45]], { intro: 'Halte ! La Grande Île appartient à Drakos !', lose: 'Tch... Passe, alors.' });
  routeTrainer(W, r11, 0.8, -1, 3, 'Garde d\'Écaille', 'Solène', [[1050, 46], [1012, 45], [1035, 45]], { intro: 'Tu veux voir Drakos ? Montre-moi d\'abord ce que tu vaux !', lose: 'Drakos va enfin avoir un vrai adversaire...' });
  routeItem(W, r11, 0.4, 1, 4, 'max-potion');
  const r12 = R('r12', 'Forêt d\'Écaille', [[212.5, 230], [212.5, 245], [222, 256], [240, 258]], { w: 12, grass: 1.1, tall: T.DARKTALL, trees: 0.14, taperStart: false, theme: 'forest' }, 'ecaille', 'forest');
  routeTrainer(W, r12, 0.3, -1, 3, 'Topdresseuse', 'Maya', [[1040, 44], [1016, 44], [184, 45]]);
  routeTrainer(W, r12, 0.6, 1, 3, 'Karatéka', 'Takeo', [[1033, 45], [107, 45], [68, 46]]);
  routeItem(W, r12, 0.5, -1, 4, 'ultra-ball', 3); routeItem(W, r12, 0.95, 1, 2, 'rare-candy');
  // Cap des Étoiles : au nord de Fort-Écaille, une clairière où passe Odyssor
  W.rect(210, 202, 215, 206, T.GRASS); W.rect(212, 203, 213, 206, T.PATH);
  W.prop('statue', 210, 203); W.prop('statue', 215, 203);
  W.object(212, 202, { type: 'odyssor' }); W.object(213, 202, { type: 'odyssor' });
  // une barrière au bord de la falaise : on contemple la mer, mais on n'accoste pas ici en surfant
  W.set(212, 201, T.FENCE); W.set(213, 201, T.FENCE); W.rect(208, 199, 217, 200, T.WATER);
  W.zone(208, 199, 217, 206, { name: 'Cap des Étoiles', music: 'mystic' });

  // la mer de l'archipel : rencontres en surfant
  W.zone(185, 186, 339, 279, { name: 'Mer de l\'Archipel', music: 'route2', enc: ENC.mer, sea: true, prio: -1 });
  W.zone(296, 196, 333, 219, { name: 'Île de Granit', music: 'port', enc: ENC.granit });

  const r9 = R('r9', 'Route 9', [[160.5, 224], [160.5, 214], [160.5, 208]], { w: 7, grass: 0.5, trees: 0.03, taperEnd: false }, 'r9');
  const r9b = R('r9b', 'Route 9', [[115.5, 166], [108, 168.5], [99, 168.5]], { w: 7, grass: 0.4, trees: 0.02, taperStart: false }, 'r9');
  W.zone(99, 165, 112, 172, { name: 'Route 9', music: 'route', enc: ENC.r9, trigger: 'rival5' });
  void r9; void r9b;

  const r10 = R('r10', 'Route 10', [[49, 248.5], [75, 250.5], [100, 247.5], [125, 242.5], [150, 238.5]], { w: 12, grass: 0.8, trees: 0.05, rocks: 0.02, bridge: true }, 'r10');
  routeTrainer(W, r10, 0.2, 1, 4, 'Topdresseur', 'Victor', [[1035, 36], [128, 36], [1014, 36]]);
  routeTrainer(W, r10, 0.45, -1, 4, 'Karatéka', 'Ryu', [[68, 37], [1033, 37]]);
  routeTrainer(W, r10, 0.7, 1, 4, 'Topdresseuse', 'Léa', [[241, 37], [1040, 37], [1037, 37]]);
  routeItem(W, r10, 0.35, -1, 5, 'ultra-ball', 3); routeItem(W, r10, 0.85, 1, 5, 'sun-stone');


  /* ======================== LES ÎLES DU BATEAU ======================== */
  // Le bateau part de l'Embarcadère de l'Aube (à droite de la route 1) : Île Orageuse avec 2 badges, Île de la Grue avec 3,
  // Île Givrée (tout au nord) avec 5. Pas de Champion sur ces îles, mais des dresseurs plus forts que l'arène précédente
  // et, sur chacune, au moins un légendaire à capturer au bout d'une quête.
  const legends = [], docks = {};
  const legend = (o) => { legends.push({ map: 'monde', ...o }); return o; };
  const xy = ([x, y]) => ({ x, y });
  /** ponton : planches sur l'eau depuis la côte (x, y) vers dx ; le capitaine se tient au bout */
  const pier = (key, name, x, y, dx, len, badges, o = {}) => {
    for (let k = 0; k < len; k++) W.set(x + dx * k, y, T.BRIDGE);
    const cx = x + dx * (len - 1);
    W.npc({ id: 'quai:' + key, x: cx, y, dir: dx > 0 ? 'left' : 'right', sprite: 'marin', script: 'ferry', dock: key });
    docks[key] = { name, map: 'monde', x: cx - dx, y, dir: dx > 0 ? 'left' : 'right', badges, ...o };
    const x0 = Math.min(x, cx), x1 = Math.max(x, cx); W.zone(x0 - 1, y - 2, x1 + 1, y + 2, { name: o.town || name, music: o.music || 'port' });
  };
  /** passage étroit (2 cases) fermé par un PNJ tant qu'un drapeau d'histoire n'est pas levé */
  const flagGate = (id, tiles, npcAt, flag, badges, sprite, text) => {
    const n = W.npc({ id, x: npcAt[0], y: npcAt[1], dir: 'down', sprite, gate: { badges, flag, tiles }, text });
    W.gates.push({ npc: n.id, badges, flag, tiles });
  };
  /** objet de décor avec lequel on interagit (borne, stèle, autel) */
  const thing = (prop, x, y, o) => { W.prop(prop, x, y); W.object(x, y, o); };
  const offRoute = (pts, t, side, off) => { const p = along(pts, t); return nearestWalkable(W, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off); };

  // Bois Murmure : l'autel de Celebi (la Balle GS vient d'une vieille dame de Sylvebourg)
  { const [sx, sy] = offRoute(bois, 0.5, 1, 5); thing('statue', sx, sy, { type: 'shrine' });
    const [cx, cy] = nearestWalkable(W, sx, sy + 1, new Set([sx + ',' + sy]));
    legend({ id: 'celebi', sp: 251, lvl: 20, x: cx, y: cy, cond: 'celebi', intro: ['La Balle GS se met à trembler...', 'Une petite créature verte surgit d\'entre les feuilles : Celebi !'] }); }

  // Embarcadère de l'Aube : un sentier part de la route 1 vers la baie
  W.rect(40, 212, 53, 216, T.GRASS, [T.TREE, T.TALL]); W.rect(40, 214, 53, 214, T.PATH);
  W.sign(44, 213, 'EMBARCADÈRE DE L\'AUBE\nBateau pour les îles de l\'Est.\nÎle Orageuse : 2 badges · Île de la Grue : 3 badges · Île Givrée : 5 badges');
  pier('aube', 'Embarcadère de l\'Aube', 54, 214, 1, 4, 0);
  W.zone(46, 204, 68, 224, { name: 'Embarcadère de l\'Aube', music: 'port' });

  /* ---------- Île Orageuse (2 badges) : Électhor, Mew, et Mewtwo pour le Maître ---------- */
  W.rect(350, 156, 434, 243, T.TREE);
  const O = towns.O = {
    id: 'orage', name: 'Port-Orage', x: 352, y: 206, w: 28, h: 20, exits: [['w', 9], ['n', 13], ['e', 9]], stock: 3, music: 'island',
    roads: [[0, 9, 27, 10, T.PATH], [13, 0, 14, 19, T.PATH]],
    deco: [['lamp', 12, 8], ['lamp', 15, 8], ['flowers', 16, 13, 18, 16], ['sign', 11, 11, 'PORT-ORAGE\nL\'île où gronde le tonnerre.'], ['rock', 24, 16]],
    buildings: [
      { kind: 'center', x: 3, y: 3 }, { kind: 'mart', x: 8, y: 3 },
      { kind: 'tower', x: 21, y: 3, roof: 'red', name: 'Phare de l\'Orage', npcs: [{ id: 'gardien', x: 5, y: 4, sprite: 'scientifique', script: 'phare' }] },
      { kind: 'house', x: 16, y: 4, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Les orages d\'ici ne sont pas naturels.', 'Mon grand-père disait qu\'un grand oiseau de foudre dort sur le Pic Tonnerre.'] }] },
      { kind: 'house', x: 3, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['À l\'est, au bout de la côte, il y a de vieilles ruines.', 'Trois stèles racontent l\'histoire d\'une créature minuscule, rose comme l\'aube...'] }] },
      { kind: 'house', x: 19, y: 13, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: ['Tout au fond de l\'île, il y a un sanctuaire scellé.', 'Seul le Maître de la Ligue a le droit d\'y entrer. Ce qui dort là-dedans est... dangereux.'] }] },
    ],
    npcs: [{ id: 'marin', x: 8, y: 11, sprite: 'marin', move: 'wander', text: ['Le bateau de l\'Embarcadère passe ici tous les jours.', 'Avec trois badges, il t\'emmènera à l\'Île de la Grue, au nord.'] }],
  };
  buildTown(W, maps, O);
  W.rect(350, 215, 353, 216, T.SAND);
  pier('orage', 'Île Orageuse (Port-Orage)', 349, 215, -1, 5, 2, { town: 'Port-Orage', music: 'island' });
  // Sentier Orageux jusqu'au Pic Tonnerre
  const so = R('orage1', 'Sentier Orageux', [[365.5, 206], [365.5, 192], [378, 182], [394, 176], [406, 174]], { w: 11, grass: 0.9, trees: 0.05, rocks: 0.03 }, 'orage', 'island');
  routeTrainer(W, so, 0.2, 1, 4, 'Scientifique', 'Ampère', [[1036, 24], [81, 24], [100, 25]], { intro: 'Mes mesures sont formelles : la foudre vient du Pic !' });
  routeTrainer(W, so, 0.45, -1, 4, 'Randonneuse', 'Orane', [[1038, 24], [1034, 25]]);
  routeTrainer(W, so, 0.7, 1, 4, 'Topdresseur', 'Éloi', [[1035, 26], [1011, 25], [1031, 26]]);
  routeItem(W, so, 0.35, -1, 5, 'super-potion', 2); routeItem(W, so, 0.85, 1, 4, 'thunder-stone');
  // trois relais électriques à rallumer (quête du gardien du phare)
  [[0.3, 1], [0.6, -1], [0.92, -1]].forEach(([t, side], i) => { const [x, y] = offRoute(so, t, side, 4); thing('labmachine', x, y, { type: 'pylon', n: i + 1 }); });
  // le Pic : un couloir de deux cases, fermé par un technicien tant que les relais sont coupés
  W.rect(406, 173, 420, 174, T.PATH); W.rect(419, 166, 420, 174, T.PATH);
  W.rect(410, 157, 429, 166, T.GRASS); W.rect(419, 158, 420, 166, T.PATH);
  W.set(421, 171, T.GRASS);
  flagGate('orage:technicien', [[419, 170], [420, 170]], [421, 171], 'pylons', 2, 'scientifique', ['Le sentier du Pic Tonnerre est fermé : les trois relais de l\'île sont coupés.', 'Le gardien du phare, à Port-Orage, sait comment les rallumer.']);
  W.prop('statue', 415, 159); W.prop('statue', 424, 159);
  W.zone(406, 156, 430, 175, { name: 'Pic Tonnerre', music: 'mystic' });
  legend({ id: 'zapdos', sp: 145, lvl: 30, x: 419, y: 160, cond: 'pylons', intro: ['Le ciel se zèbre d\'éclairs...', 'Électhor, l\'oiseau de foudre, déploie ses ailes !'] });
  legend({ id: 'raikou', sp: 243, lvl: 40, ...xy(offRoute(so, 0.55, 1, 2)), cond: 'beasts', intro: ['Un rugissement fait trembler l\'herbe...', 'C\'est Raikou, la bête du tonnerre, échappée de la Tour de la Grue !'] });
  // Côte des Ruines : trois stèles, l'autel de Mew, et le sanctuaire scellé de Mewtwo
  const cr = R('orage2', 'Côte des Ruines', [[379.5, 215.5], [394, 221], [410, 225], [424, 225]], { w: 10, grass: 0.8, trees: 0.04, flowers: 0.03 }, 'orage', 'island');
  routeTrainer(W, cr, 0.3, 1, 3, 'Médium', 'Céleste', [[1039, 26], [1023, 27]]);
  routeTrainer(W, cr, 0.65, -1, 3, 'Karatéka', 'Tao', [[1033, 27], [66, 27], [1037, 28]]);
  routeItem(W, cr, 0.5, 1, 4, 'great-ball', 3);
  const STELES = [
    'STÈLE I\n« Avant les hommes, avant les villes, une créature minuscule portait en elle toutes les autres. »',
    'STÈLE II\n« Elle jouait dans le vent des îles, invisible à ceux qui la cherchaient. »',
    'STÈLE III\n« Qui aura lu les trois pierres et porté quatre badges la verra danser sur l\'autel. »',
  ];
  [[0.2, -1], [0.5, -1], [0.8, 1]].forEach(([t, side], i) => { const [x, y] = offRoute(cr, t, side, 3); thing('statue', x, y, { type: 'stele', n: i + 1, text: STELES[i] }); });
  W.rect(424, 222, 431, 228, T.GRASS); W.rect(424, 225, 431, 225, T.PATH);
  W.prop('gymstatue', 430, 223); W.prop('gymstatue', 430, 227);
  legend({ id: 'mew', sp: 151, lvl: 35, x: 429, y: 225, cond: 'mew', intro: ['Une bulle rose flotte au-dessus de l\'autel...', 'C\'est Mew !'] });
  // sanctuaire scellé : au sud de la côte, gardé jusqu'au titre de Maître
  W.rect(414, 229, 415, 237, T.PATH); W.rect(410, 237, 422, 241, T.GRASS); W.set(416, 234, T.GRASS);
  flagGate('orage:sceau', [[414, 234], [415, 234]], [416, 234], 'champion', 8, 'garde', ['Ce sanctuaire est scellé par ordre de la Ligue.', 'Seul le Maître peut y entrer.']);
  W.prop('statue', 411, 238); W.prop('statue', 421, 238);
  W.zone(409, 235, 423, 242, { name: 'Sanctuaire Scellé', music: 'mystic' });
  legend({ id: 'mewtwo', sp: 150, lvl: 70, x: 416, y: 239, intro: ['Une présence écrasante emplit le sanctuaire...', 'Mewtwo ouvre les yeux.'] });

  /* ---------- Île de la Grue (3 badges) : Hautegrue, la Tour de la Grue et Ho-Oh, Sulfura, Entei ---------- */
  W.rect(350, 72, 434, 148, T.TREE);
  const tower = (id) => towerFloor(id, 'Tour de la Grue — rez-de-chaussée', { ground: true, up: true });
  const towerMore = (f1, id) => {
    const f2 = towerFloor(id + '2', 'Tour de la Grue — 1er étage', { up: true, down: true });
    const f3 = towerFloor(id + '3', 'Tour de la Grue — 2e étage', { up: true, down: true });
    const roof = towerFloor(id + '-toit', 'Toit de la Tour de la Grue', { down: true, roof: true });
    const link = (a, b) => { a.warp(TOWER_UP.x, TOWER_UP.y, { map: b.id, x: TOWER_DOWN.x, y: TOWER_DOWN.y + 1, dir: 'down' }); b.warp(TOWER_DOWN.x, TOWER_DOWN.y, { map: a.id, x: TOWER_UP.x, y: TOWER_UP.y + 1, dir: 'down' }); };
    link(f1, f2); link(f2, f3); link(f3, roof);
    const sage = (m, x, y, dir, name, team, intro) => trainerNpc(m, x, y, dir, 'Sage', name, team, { sight: 3, intro, after: 'Le Grand Sage t\'attend plus haut.' });
    sage(f1, 4, 7, 'right', 'Ernest', [[1039, 30], [163, 30]], 'La tour accueille ceux qui viennent en paix. Prouve-le !');
    sage(f1, 8, 5, 'left', 'Gaspard', [[1023, 31], [1015, 30]], 'La grue de bois veille sur nous depuis mille ans.');
    sage(f2, 5, 5, 'right', 'Hilaire', [[1030, 32], [1040, 31]], 'Ho-Oh ne se montre qu\'aux cœurs sincères.');
    sage(f2, 8, 8, 'left', 'Isidore', [[164, 32], [1016, 32]], 'Plus haut, l\'air devient sacré.');
    trainerNpc(f3, 6, 4, 'down', 'Grand Sage', 'Hoël', [[1040, 34], [1030, 34], [1023, 35], [1016, 36]], { sight: 0, ai: 'smart', onWin: 'grandSage', intro: 'Tu viens chercher la Plume Arc-en-ciel ? Montre-moi le lien qui t\'unit à tes créatures !', lose: 'Ce lien... il est réel.', after: 'Va sur le toit. Ho-Oh t\'attend peut-être.' });
    const n = f3.npc({ id: id + ':novice', x: 10, y: 3, dir: 'down', sprite: 'medium', gate: { badges: 3, flag: 'plume', tiles: [[10, 2], [11, 3]] }, text: ['Le toit est réservé à qui porte la Plume Arc-en-ciel.', 'Seul le Grand Sage peut te la confier.'] });
    f3.gates.push({ npc: n.id, badges: 3, flag: 'plume', tiles: [[10, 2], [11, 3]] });
    legends.push({ id: 'hooh', sp: 250, lvl: 40, map: roof.id, x: 6, y: 6, cond: 'plume', intro: ['La Plume Arc-en-ciel se met à briller...', 'Un arc-en-ciel déchire les nuages. Ho-Oh se pose sur la tour !'] });
    return [f2, f3, roof];
  };
  const G2 = towns.Q = {
    id: 'grue', name: 'Hautegrue', x: 354, y: 112, w: 34, h: 26, exits: [['w', 12], ['e', 12], ['n', 16]], stock: 4, music: 'mystic',
    roads: [[0, 12, 33, 13, T.PATH], [16, 0, 17, 25, T.PATH]],
    deco: [['lamp', 15, 11], ['lamp', 18, 11], ['flowers', 3, 20, 8, 23], ['water', 27, 21, 2.6, 1.8], ['trees', 2, 2, 4, 4, T.PINE],
      ['sign', 14, 14, 'HAUTEGRUE\nLe village de la Grue de bois.'], ['sign', 20, 10, 'TOUR DE LA GRUE\nLà où l\'oiseau arc-en-ciel se posait jadis.']],
    buildings: [
      { kind: 'center', x: 5, y: 4 }, { kind: 'mart', x: 10, y: 4 },
      { kind: 'tower', x: 22, y: 2, w: 5, d: 5, h: 7, door: 2, roof: 'brown', id: 'tour', name: 'Tour de la Grue', interior: tower, more: towerMore },
      { kind: 'house', x: 4, y: 16, roof: 'brown', id: 'doyenne', name: 'Maison de la Doyenne', npcs: [{ id: 'doyenne', x: 4, y: 4, sprite: 'vieil_homme', script: 'doyenne' }] },
      { kind: 'house', x: 21, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Il y a longtemps, trois créatures ont péri dans l\'incendie de l\'ancienne tour.', 'On raconte que Ho-Oh les a ramenées à la vie : Raikou, Entei et Suicune.'] }] },
      { kind: 'house', x: 10, y: 17, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'montagnard', text: ['À l\'est, le chemin du Mont Brasier est barré par des arbustes.', 'Avec Coupe, tu pourrais aller voir le cratère... on dit qu\'un oiseau de feu y niche.'] }] },
    ],
    npcs: [{ id: 'enfant', x: 12, y: 15, sprite: 'enfant', move: 'wander', text: ['Mamie dit que la Tour de la Grue touche presque les nuages !'] }],
  };
  buildTown(W, maps, G2);
  W.rect(350, 124, 355, 125, T.SAND);
  pier('grue', 'Île de la Grue (Hautegrue)', 349, 124, -1, 5, 3, { town: 'Hautegrue', music: 'mystic' });
  // Sentier des Pins, au nord du village
  const sp1 = R('grue1', 'Sentier des Pins', [[370.5, 112], [370.5, 100], [384, 90], [396, 86], [404, 85]], { w: 11, grass: 0.9, trees: 0.06, treeT: T.PINE, flowers: 0.02 }, 'grue', 'forest');
  routeTrainer(W, sp1, 0.2, -1, 4, 'Randonneuse', 'Iris', [[1021, 29], [1038, 30], [69, 29]]);
  routeTrainer(W, sp1, 0.45, 1, 4, 'Médium', 'Séléné', [[1039, 30], [1023, 31]]);
  routeTrainer(W, sp1, 0.75, -1, 4, 'Topdresseur', 'Hugo', [[1043, 31], [1011, 31], [58, 31]]);
  routeItem(W, sp1, 0.3, 1, 5, 'great-ball', 3); routeItem(W, sp1, 0.6, -1, 5, 'hyper-potion'); routeItem(W, sp1, 0.95, 1, 3, 'rare-candy');
  // Chemin du Mont Brasier, à l'est : des arbustes à couper (Coupe) mènent au cratère de Sulfura
  const mb = R('grue2', 'Chemin du Brasier', [[387.5, 124.5], [400, 120], [412, 112], [423.5, 102]], { w: 10, grass: 0.8, trees: 0.04, rocks: 0.04 }, 'brasier', 'volcano');
  routeTrainer(W, mb, 0.35, 1, 4, 'Karatéka', 'Kaito', [[1033, 31], [66, 31], [1041, 32]]);
  routeTrainer(W, mb, 0.7, -1, 4, 'Montagnard', 'Bastien', [[1042, 32], [1028, 31], [74, 31]]);
  W.rect(423, 88, 424, 103, T.PATH); W.set(423, 95, T.CUT); W.set(424, 95, T.CUT);
  W.rect(414, 76, 432, 87, T.ASH); W.rect(423, 78, 424, 87, T.PATH);
  W.prop('rock', 416, 78); W.prop('rock', 430, 79); W.prop('rock', 417, 85);
  W.zone(412, 75, 433, 94, { name: 'Cratère du Brasier', music: 'volcano', theme: 'volcanic' });
  legend({ id: 'moltres', sp: 146, lvl: 38, x: 423, y: 79, intro: ['La chaleur devient insoutenable...', 'Sulfura, l\'oiseau de feu, s\'élève du cratère !'] });
  legend({ id: 'entei', sp: 244, lvl: 40, ...xy(offRoute(mb, 0.5, -1, 2)), cond: 'beasts', intro: ['Le sol se met à fumer...', 'C\'est Entei, la bête du feu !'] });

  /* ---------- Île Givrée (5 badges) : Artikodin, Lugia et Suicune ---------- */
  W.rect(344, 3, 436, 62, T.TREE);
  W.zone(340, 0, 439, 64, { name: 'Île Givrée', music: 'snow', theme: 'snow' });   // posée avant les routes : elles passent devant
  const Gv = towns.V = {
    id: 'givre', name: 'Givrebourg', x: 350, y: 36, w: 28, h: 20, exits: [['w', 8], ['n', 14], ['e', 8]], stock: 6, music: 'snow', ground: T.SNOW, theme: 'snow',
    roads: [[0, 8, 27, 9, T.PATH], [14, 0, 15, 19, T.PATH]],
    deco: [['water', 22, 15, 3, 2], ['lamp', 13, 7], ['lamp', 16, 7], ['trees', 2, 15, 4, 17, T.PINE],
      ['sign', 11, 10, 'GIVREBOURG\nLe village au bout du monde.']],
    buildings: [
      { kind: 'center', x: 3, y: 2 }, { kind: 'mart', x: 9, y: 2 },
      { kind: 'house', x: 19, y: 3, roof: 'gray', id: 'ermite', name: 'Cabane de l\'Ermite', npcs: [{ id: 'ermite', x: 4, y: 4, sprite: 'montagnard', script: 'ermite' }] },
      { kind: 'house', x: 3, y: 12, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Sous l\'île, la mer creuse des grottes immenses.', 'Les tourbillons y sont si forts que personne n\'en revient... sauf ceux que Lugia laisse passer.'] }] },
      { kind: 'house', x: 9, y: 13, roof: 'teal', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['La Glace craint le Feu, le Combat, la Roche et l\'Acier.', 'Pense à prendre de quoi soigner le gel !'] }] },
    ],
    npcs: [{ id: 'enfant', x: 18, y: 11, sprite: 'enfant', move: 'wander', text: ['Il neige tout le temps ici. J\'adore !'] }],
  };
  buildTown(W, maps, Gv);
  W.rect(344, 44, 351, 45, T.SAND);
  pier('givre', 'Île Givrée (Givrebourg)', 343, 44, -1, 3, 5, { town: 'Givrebourg', music: 'snow' });
  const pg = R('givre1', 'Pente Givrée', [[364.5, 36], [364.5, 24], [380, 16], [398, 12], [414, 10]], { w: 11, grass: 0.8, trees: 0.06, treeT: T.PINE, rocks: 0.03, theme: 'snow' }, 'givre', 'snow');
  routeTrainer(W, pg, 0.2, 1, 4, 'Skieuse', 'Neige', [[1045, 38], [225, 38], [86, 39]], { intro: 'Attention, ça glisse !' });
  routeTrainer(W, pg, 0.45, -1, 4, 'Alpiniste', 'Gaspard', [[220, 39], [1028, 39], [1027, 40]]);
  routeTrainer(W, pg, 0.7, 1, 4, 'Topdresseuse', 'Alba', [[1046, 41], [124, 40], [1040, 41]]);
  routeTrainer(W, pg, 0.9, -1, 3, 'Alpiniste', 'Erwan', [[221, 42], [87, 42], [1035, 42]]);
  routeItem(W, pg, 0.3, -1, 5, 'ice-heal', 3); routeItem(W, pg, 0.6, 1, 5, 'ultra-ball', 3); routeItem(W, pg, 0.8, -1, 5, 'max-potion');
  // Cime Givrée : Artikodin
  W.rect(413, 9, 418, 10, T.PATH); W.rect(416, 4, 432, 15, T.GRASS); W.rect(423, 5, 424, 15, T.PATH);
  W.prop('statue', 419, 6); W.prop('statue', 428, 6);
  W.zone(412, 3, 433, 16, { name: 'Cime Givrée', music: 'mystic', theme: 'snow' });
  legend({ id: 'articuno', sp: 144, lvl: 45, x: 423, y: 6, intro: ['Un vent glacial se lève...', 'Artikodin, l\'oiseau des glaces, plane au-dessus de la cime !'] });
  // à l'est du village : la Grotte des Tourbillons (Lugia), ouverte par l'Ermite
  const gt = R('givre2', 'Rivage Gelé', [[377.5, 44.5], [392, 46], [404, 47.5]], { w: 9, grass: 0.6, trees: 0.05, treeT: T.PINE, theme: 'snow' }, 'givre', 'snow');
  routeTrainer(W, gt, 0.5, 1, 3, 'Skieuse', 'Flocon', [[1045, 40], [1046, 42]]);
  const tb = W.building('cave', 406, 43);
  W.rect(402, 46, 413, 48, T.GRASS); W.rect(402, 47, 413, 47, T.PATH); W.rect(tb.doorX, tb.doorY + 1, tb.doorX, 48, T.PATH);
  flagGate('givre:gardien', [[tb.doorX, tb.doorY + 1]], [tb.doorX + 1, tb.doorY + 2], 'plumeArgent', 5, 'pecheur', ['Halte ! Les tourbillons de cette grotte sont mortels.', 'L\'Ermite de Givrebourg sait comment les apaiser. Va le voir.']);
  const tourb = caveMap('tourbillons', 44, 30, 5151, [{ x: 4, y: 25 }], { name: 'Grotte des Tourbillons', via: [{ x: 16, y: 10 }, { x: 30, y: 20 }, { x: 38, y: 6 }], dark: false });
  tourb.encounter = ENC.tourbillons; maps.tourbillons = tourb;
  tourb.set(4, 26, T.CAVEDOOR); tourb.set(4, 25, T.CAVE); tourb.set(4, 27, T.CAVEWALL);
  tourb.warp(4, 26, { map: 'monde', x: tb.doorX, y: tb.doorY + 1, dir: 'down' });
  W.warp(tb.doorX, tb.doorY, { map: 'tourbillons', x: 4, y: 25, dir: 'up' });
  tourb.deco.push({ k: 'exitlight', x: 4, y: 26 });
  { // un bassin d'eau et Lugia au fond de la grotte
    const [lx, ly] = nearestWalkable(tourb, 38, 6);
    legends.push({ id: 'lugia', sp: 249, lvl: 50, map: 'tourbillons', x: lx, y: ly, intro: ['L\'eau se met à tourbillonner...', 'Une immense silhouette argentée émerge des profondeurs : Lugia !'] });
  }
  caveTrainers(tourb, [['Pêcheur', 'Morvan', [[1046, 43], [131, 43]]], ['Topdresseur', 'Loïc', [[1032, 43], [87, 44], [1009, 44]]]], 44);
  caveItems(tourb, ['max-repel', 'ultra-ball', 'full-restore'], 45);
  legend({ id: 'suicune', sp: 245, lvl: 40, ...xy(offRoute(gt, 0.25, -1, 2)), cond: 'beasts', intro: ['Un vent du nord souffle sur la glace...', 'C\'est Suicune, la bête des eaux pures !'] });
  // l'île se couvre de neige ; les arbres deviennent des sapins givrés, les sentiers des chemins pavés
  for (let y = 3; y <= 62; y++) for (let x = 344; x <= 436; x++) { const t = W.get(x, y); if (t === T.GRASS) W.set(x, y, T.SNOW); else if (t === T.TREE) W.set(x, y, T.PINE); else if (t === T.PATH) W.set(x, y, T.PAVE); }

  // mer de l'Est : rencontres en surfant
  W.zone(340, 64, 439, 279, { name: 'Mer de l\'Est', music: 'route2', enc: ENC.est, sea: true, prio: -1 });

  // pas d'herbes hautes débordant des routes dans les villes (sauf celles prévues par la ville)
  for (const t of Object.values(towns)) {
    const keep = (t.deco || []).filter((d) => d[0] === 'tall').map(([, x0, y0, x1, y1]) => [t.x + x0, t.y + y0, t.x + x1, t.y + y1]);
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
      const v = W.get(x, y); if (v !== T.TALL && v !== T.DARKTALL) continue;
      if (keep.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
      W.set(x, y, t.ground ?? T.GRASS);
    }
  }
  // les villes passent devant les routes dans la recherche de zone, la mer passe derrière tout
  const townZones = W.zones.filter((z) => z.town || z.trigger), seaZones = W.zones.filter((z) => z.sea), routeZones = W.zones.filter((z) => !z.town && !z.trigger && !z.sea);
  W.zones = [...seaZones, ...routeZones, ...townZones];

  /* ======================== GROTTES ======================== */
  // Grotte Lunaire : entre la route 3 ouest et est
  const g1in = W.building('cave', 146, 38), g1out = W.building('cave', 171, 38);
  const grotte = caveMap('grotte', 46, 32, 4242, [{ x: 4, y: 26 }, { x: 41, y: 26 }], { name: 'Grotte Lunaire', via: [{ x: 14, y: 8 }, { x: 30, y: 20 }, { x: 36, y: 6 }] });
  grotte.encounter = ENC.grotte; maps.grotte = grotte;
  for (const [cx, cy, out] of [[4, 26, g1in], [41, 26, g1out]]) {
    grotte.set(cx, cy + 1, T.CAVEDOOR); grotte.set(cx, cy, T.CAVE); grotte.set(cx, cy + 2, T.CAVEWALL);
    grotte.warp(cx, cy + 1, { map: 'monde', x: out.doorX, y: out.doorY + 1, dir: 'down' });
    W.warp(out.doorX, out.doorY, { map: 'grotte', x: cx, y: cy, dir: 'up' });
    grotte.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
  }
  caveTrainers(grotte, [['Montagnard', 'Roger', [[1026, 12], [1028, 13]]], ['Gamin', 'Enzo', [[1024, 11], [41, 12], [1047, 12]]], ['Montagnard', 'Bernard', [[50, 13], [74, 13], [1026, 14]]]], 11);
  caveItems(grotte, ['escape-rope', 'moon-stone', 'super-potion', 'great-ball'], 12);

  // Route Victoire : des rochers fissurés en barrent les galeries (Éclate-Roc)
  const v1in = W.building('cave', 158, 205), v1out = W.building('cave', 113, 163);
  const victoire = caveMap('victoire', 60, 40, 777, [{ x: 50, y: 34 }, { x: 6, y: 34 }], { name: 'Route Victoire', via: [{ x: 48, y: 8 }, { x: 28, y: 18 }, { x: 10, y: 6 }] });
  victoire.encounter = ENC.victoire; maps.victoire = victoire;
  for (const [cx, cy, out] of [[50, 34, v1in], [6, 34, v1out]]) {
    victoire.set(cx, cy + 1, T.CAVEDOOR); victoire.set(cx, cy, T.CAVE); victoire.set(cx, cy + 2, T.CAVEWALL);
    victoire.warp(cx, cy + 1, { map: 'monde', x: out.doorX, y: out.doorY + 1, dir: 'down' });
    W.warp(out.doorX, out.doorY, { map: 'victoire', x: cx, y: cy, dir: 'up' });
    victoire.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
  }
  caveTrainers(victoire, [['Topdresseur', 'Dimitri', [[67, 40], [1044, 40], [130, 41]]], ['Topdresseuse', 'Sofia', [[148, 41], [1040, 40], [1035, 40]]], ['Karatéka', 'Takeshi', [[68, 42], [1033, 41], [106, 41]]], ['Médium', 'Iris', [[94, 41], [1023, 41]]], ['Montagnard', 'Hubert', [[76, 42], [1028, 42], [112, 42]]]], 41);
  caveItems(victoire, ['full-restore', 'max-repel', 'rare-candy', 'ultra-ball', 'revive', 'max-potion'], 43);
  smashOnPath(victoire, { x: 50, y: 34 }, 3, 991);

  /* ======================== ARÈNES ======================== */
  const gymTrainers = [
    [['Insectomane', 'Lucas', [[1017, 9], [10, 10]]], ['Insectomane', 'Basile', [[1018, 10], [1020, 10]]]],
    [['Marin', 'Yann', [[1029, 17], [116, 17]]], ['Fillette', 'Océane', [[118, 18], [1031, 18]]], ['Pêcheur', 'Paul', [[60, 19], [1033, 19]]]],
    [['Scientifique', 'Alan', [[100, 23], [1034, 23]]], ['Topdresseuse', 'Électra', [[1036, 24], [25, 24]]], ['Scientifique', 'Ohm', [[82, 25]]]],
    [['Randonneuse', 'Rose', [[69, 28], [1021, 28]]], ['Topdresseuse', 'Lila', [[44, 29], [1038, 29]]], ['Randonneuse', 'Iris', [[189, 30]]]],
    [['Médium', 'Esther', [[1039, 33], [178, 33]]], ['Médium', 'Félix', [[97, 34], [1030, 34]]], ['Topdresseuse', 'Luna', [[196, 35]]]],
    [['Montagnard', 'Marcel', [[1026, 38], [74, 38]]], ['Montagnard', 'Henri', [[95, 39], [1028, 39]]], ['Garde d\'Écaille', 'Gwen', [[1027, 40]]]],
    [['Karatéka', 'Akira', [[1041, 43], [58, 43]]], ['Topdresseur', 'Blaise', [[78, 44], [1005, 44]]], ['Garde d\'Écaille', 'Ignace', [[1042, 45], [218, 44]]]],
    [['Garde d\'Écaille', 'Kael', [[1049, 47], [1050, 48]]], ['Topdresseuse', 'Wyrna', [[148, 49], [1044, 49]]], ['Garde d\'Écaille', 'Ivar', [[147, 48], [1050, 49], [1025, 49]]]],
  ];
  for (const t of Object.values(towns)) {
    if (t.gym == null) continue;
    const g = t.gymMap, L2 = LEADERS[t.gym];
    g.npc({ id: g.id + ':guide', x: 9, y: 17, sprite: 'habitant', dir: 'down', script: 'gymguide', gym: t.gym });
    // les dresseurs se tiennent sur le côté de l'allée centrale (colonne 7) : ils ne bloquent jamais le passage
    const spots = [[5, 15, 'right'], [10, 10, 'left'], [4, 7, 'right'], [10, 11, 'left']];
    gymTrainers[t.gym].forEach(([cls, name, team], i) => {
      const [x, y, dir] = spots[i]; trainerNpc(g, x, y, dir, cls, name, team, { sight: 3, intro: 'Tu veux défier notre Champion ? Passe d\'abord par moi !', after: 'Notre Champion est bien plus fort que moi.' });
    });
    const fem = ['Marine', 'Volta', 'Flora', 'Sibylle'].includes(L2.name);
    g.npc({ id: g.id + ':leader', x: 7, y: 3, dir: 'down', sprite: L2.ow, leader: t.gym, trainer: { cls: fem ? 'Championne' : 'Champion', name: L2.name, team: L2.team, prize: 100, bs: L2.ow, ai: 'smart', items: { 'super-potion': t.gym < 3 ? 1 : 0, 'hyper-potion': t.gym >= 3 ? 2 : 0, 'full-restore': t.gym === 7 ? 1 : 0 }, intro: L2.intro, lose: L2.lose, sight: 0 } });
  }
  // Ligue : la Maître
  const league = maps['plateau:ligue'];
  league.npc({ id: 'champion', x: 7, y: 3, dir: 'down', sprite: CHAMPION.ow, champion: true, trainer: { cls: 'Maître', name: CHAMPION.name, team: CHAMPION.team, prize: 200, bs: CHAMPION.ow, ai: 'smart', items: { 'full-restore': 2 }, intro: CHAMPION.intro, lose: CHAMPION.lose, sight: 0 } });
  league.npc({ id: 'ligue-garde', x: 5, y: 15, sprite: 'garde', dir: 'right', text: ['Bienvenue à la Ligue Céleste.', 'La Maître t\'attend au bout du tapis. Bonne chance !'] });

  // Labo : professeur, assistant
  const lab = maps['aube:labo'];
  lab.npc({ id: 'prof', x: 6, y: 3, sprite: 'saule', dir: 'down', script: 'prof' });
  lab.npc({ id: 'assistant', x: 10, y: 7, sprite: 'scientifique', move: 'wander', text: ['Le professeur étudie le lien entre les dresseurs et leurs créatures.', 'Il dit que c\'est en voyageant qu\'on le comprend le mieux.'] });
  STARTERS.forEach((sp, i) => lab.object(5 + i, 5, { type: 'starter', sp }));

  return { maps, towns, routes, legends, docks, start: { map: 'aube:maison', x: 4, y: 6, dir: 'up' } };
}

function caveTrainers(m, list, seed) {
  const r = rng(seed); const floors = [];
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE && m.get(x + 1, y) === T.CAVE && m.get(x - 1, y) === T.CAVE) floors.push([x, y]);
  list.forEach(([cls, name, team], i) => {
    const [x, y] = floors[Math.floor(((i + 0.5) / list.length) * floors.length * 0.9 + r() * floors.length * 0.08)];
    trainerNpc(m, x, y, ['left', 'right', 'down', 'up'][Math.floor(r() * 4)], cls, name, team, { sight: 3 });
  });
}
function caveItems(m, items, seed) {
  const r = rng(seed); const floors = [];
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE) floors.push([x, y]);
  for (const it of items) { const [x, y] = floors[Math.floor(r() * floors.length)]; m.item(x, y, it); }
}
/** rochers fissurés sur des passages étroits d'une grotte (cases dont le voisinage est fermé de deux côtés opposés) */
function smashOnPath(m, from, n, seed) {
  const r = rng(seed), cands = [];
  for (let y = 4; y < m.h - 4; y++) for (let x = 4; x < m.w - 4; x++) {
    if (m.get(x, y) !== T.CAVE || Math.hypot(x - from.x, y - from.y) < 8) continue;
    const ns = m.get(x, y - 1) === T.CAVEWALL && m.get(x, y + 1) === T.CAVEWALL && m.get(x - 1, y) === T.CAVE && m.get(x + 1, y) === T.CAVE;
    const ew = m.get(x - 1, y) === T.CAVEWALL && m.get(x + 1, y) === T.CAVEWALL && m.get(x, y - 1) === T.CAVE && m.get(x, y + 1) === T.CAVE;
    if (ns || ew) cands.push([x, y]);
  }
  for (let i = 0; i < n && cands.length; i++) { const k = Math.floor(r() * cands.length); const [x, y] = cands.splice(k, 1)[0]; m.set(x, y, T.SMASH); }
}
