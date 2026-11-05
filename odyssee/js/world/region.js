// odyssee/js/world/region.js — la région d'Odyssée : le continent (cinq arènes, la Ligue) et, au sud-est, l'archipel
// des trois frères (Basalte, Pyros et Drakos), au-delà des tourbillons : on y va avec le passeur du Cap Mirage. Les quatre premières arènes se suivent dans
// l'ordre (des gardes bloquent la route) ; ensuite, ce sont les capacités de terrain qui ouvrent de nouvelles zones :
// Coupe (badge 4) vers Mirage, le bateau du Cap Mirage vers l'archipel (5 badges), Éclate-Roc (badge 6) sur la Grande Île,
// Vol (badge 7). Une ceinture de tourbillons entoure l'archipel et les îles de l'Est : on ne les atteint pas à la nage.
// À l'est, trois îles desservies par le bateau de l'Embarcadère de l'Aube (2, 3 et 5 badges), avec les quêtes des
// légendaires (renvoyées dans `legends`, les quais dans `docks`).
// Noms de lieux et personnages originaux ; les créatures du jeu côtoient les Pokémon du prototype.
import { T, DIRS, walkable, isGrassEnc } from './tiles.js';
import { GameMap, carveRoute, carveTown, ledges, along, nearestWalkable, caseLibre, rng, GRAND } from './mapgen.js';
import { centerInterior, martInterior, houseInterior, labInterior, gymInterior, leagueInterior, caveMap } from './interiors.js';
import { NEW_STARTERS } from '../data/creatures.js';
import { R } from '../data/remplacants.js';
import { buildQuests } from './quetes.js';
import { addStory } from './story.js';
import { enrichirTout, equipeDeType } from './rencontres.js';
import { addHabitants } from './habitants.js';
import { applyRetouches } from './retouches.js';
import { buildArena } from './arenes.js';
import { buildSud, BADGES_SUD, LEADERS_SUD, GYM_TRAINERS_SUD } from './sud.js';
import { addVehicules } from './vehicules.js';
import { addMine } from './mine.js';
import { tourbillons, plateau, polygone, rectangle, sinueuse, boucher, massif, bande } from './relief.js';
import { montLunaire, montGivre } from './montagnes.js';
import { LARGEUR, HAUTEUR, BLOC, VILLES, TERR, TORII, LUNAIRE, CHAINE, porte, arrivee } from './plan.js';
import { grandeVille } from './quartiers.js';
import { grandeRoute, boucherLocal } from './chemins.js';
import { atelier } from './atelier.js';
import { ANCIENS_OBJETS } from './anciens-objets.js';

/** version de la carte du monde : une sauvegarde d'une version plus ancienne reprend au Centre de la dernière ville
 *  visitée (game.js, migrerCarte) — 1 : l'ancienne carte (440 × 520), 2 : la grande région (1200 × 1392) */
export const CARTE_VERSION = 2;

// toutes les lignées connues : la créature d'Odyssée (plus proposée, mais les parties déjà commencées avec elle restent valables),
// le Pokémon de Rouge / Bleu et celui d'Or / Argent, avec leurs évolutions
export const STARTER_TABLE = [
  { type: 'grass', lines: [[NEW_STARTERS[0], NEW_STARTERS[0] + 1, NEW_STARTERS[0] + 2], [1, 2, 3], [152, 153, 154]] },
  { type: 'fire', lines: [[NEW_STARTERS[1], NEW_STARTERS[1] + 1, NEW_STARTERS[1] + 2], [4, 5, 6], [155, 156, 157]] },
  { type: 'water', lines: [[NEW_STARTERS[2], NEW_STARTERS[2] + 1, NEW_STARTERS[2] + 2], [7, 8, 9], [158, 159, 160]] },
].map((c) => ({ ...c, lines: c.lines.map((l) => l.map(R)) }));
// au labo, trois capsules, une par type ; dans chacune, deux partenaires au choix : celui de Rouge / Bleu et celui d'Or / Argent
export const STARTER_CHOICES = STARTER_TABLE.map((c) => ({ ...c, lines: c.lines.slice(1) }));
/** les trois capsules (repérées par le premier partenaire de chacune) */
export const STARTERS = STARTER_CHOICES.map((c) => c.lines[0][0]);
/** toutes les lignées de partenaires de départ (pour le Pokémon qui suit le dresseur) */
export const STARTER_LINES = STARTER_TABLE.flatMap((c) => c.lines);
/** type et rang (0 original, 1 Rouge / Bleu, 2 Or / Argent) d'un partenaire de départ, dans STARTER_TABLE */
export function starterSlot(sp) {
  for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) if (STARTER_TABLE[t].lines[k].includes(sp)) return { t, k };
  return null;
}
export const RIVAL_NAME = 'Théo';
// ordre des arènes : Hector, Marine, Volta, Flora, Sibylle, puis les trois frères de l'archipel
export const BADGES = [
  { name: 'Badge Élytre', type: 'bug', color: '#8cc43c' }, { name: 'Badge Écume', type: 'water', color: '#4a9ae8' },
  { name: 'Badge Volt', type: 'electric', color: '#f0d030' }, { name: 'Badge Pétale', type: 'grass', color: '#58c060' },
  { name: 'Badge Mirage', type: 'psychic', color: '#e070c0' }, { name: 'Badge Granit', type: 'rock', color: '#b89c6c' },
  { name: 'Badge Braise', type: 'fire', color: '#f07030' }, { name: 'Badge Écaille', type: 'dragon', color: '#7a68e0' },
  // les sept arènes des Terres du Sud (après les trois frères)
  ...BADGES_SUD,
];
// capacités de terrain : obtenues auprès d'un Champion, utilisables avec le badge indiqué
export const FIELD = {
  coupe: { name: 'Coupe', item: 'secateur-sylvestre', itemName: 'Sécateur Sylvestre', cs: 'Sécateur Sylvestre', badge: 4, desc: 'Tranche les petits arbres et arbustes épineux qui barrent le chemin.' },
  surf: { name: 'Surf', item: 'harnais-flottant', itemName: 'Harnais Flottant', cs: 'Harnais Flottant', badge: 5, desc: 'Selle nautique étanche permettant de naviguer et glisser sur l\'eau.' },
  eclate: { name: 'Éclate-Roc', cs: 'CS03', badge: 6, desc: 'Brise les rochers fissurés.' },
  vol: { name: 'Vol', item: 'sifflet-celeste', itemName: 'Sifflet Céleste', cs: 'Sifflet Céleste', badge: 5, desc: 'Sifflet appelant un oiseau pour voyager en un instant vers une ville déjà visitée.' },
  // données par l'histoire (la Team Éclipse) : Flash par le Dr Lumen, Force par l'ingénieur de la Centrale
  flash: { name: 'Flash', cs: 'CS05', badge: 1, desc: 'Éclaire les grottes plongées dans le noir.' },
  force: { name: 'Force', cs: 'CS06', badge: 3, desc: 'Pousse les gros rochers qui barrent certains chemins.' },
};
const STOCK = {
  1: ['poke-ball', 'potion', 'antidote', 'paralyze-heal', 'awakening', 'repel'],
  2: ['poke-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'escape-rope'],
  3: ['poke-ball', 'great-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'super-repel', 'escape-rope'],
  4: ['poke-ball', 'great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'thunder-stone', 'moon-stone'],
  5: ['great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'leaf-stone', 'fire-stone', 'water-stone', 'sun-stone', 'dusk-stone', 'dawn-stone', 'shiny-stone', 'ice-stone', 'ether'],
  6: ['great-ball', 'ultra-ball', 'hyper-potion', 'max-potion', 'full-heal', 'revive', 'max-repel', 'escape-rope', 'ether', 'elixir'],
  7: ['ultra-ball', 'hyper-potion', 'max-potion', 'full-restore', 'full-heal', 'revive', 'max-repel', 'escape-rope', 'elixir'],
};

/* ---------------- rencontres sauvages : [espèce, niveau min, niveau max, poids] ---------------- */
const ENC = {
  r1: [[1010, 2, 4, 25], [1013, 2, 4, 25], [16, 2, 4, 15], [19, 2, 4, 15], [1017, 2, 3, 12], [161, 2, 4, 8]],
  r2: [[1010, 4, 7, 15], [1013, 4, 6, 15], [1017, 4, 6, 15], [1018, 6, 7, 5], [1034, 5, 7, 10], [1021, 5, 7, 10], [21, 5, 7, 10], [10, 4, 6, 10], [1039, 5, 6, 5], [29, 5, 6, 5]],
  bois: [[1053, 7, 9, 5], [1017, 6, 8, 15], [1018, 7, 9, 8], [1015, 6, 9, 15], [1021, 6, 9, 15], [1020, 7, 9, 8], [1013, 7, 9, 10], [165, 6, 9, 8], [167, 6, 9, 8], [1043, 7, 9, 5], [1038, 8, 9, 3], [46, 7, 9, 5]],
  r3: [[1055, 9, 11, 6], [1026, 8, 11, 15], [1034, 8, 11, 15], [1011, 9, 11, 10], [1014, 9, 11, 5], [21, 8, 11, 15], [27, 8, 11, 10], [56, 8, 11, 10], [66, 9, 11, 10], [1039, 9, 11, 10]],
  grotte: [[1057, 10, 13, 6], [1024, 9, 13, 35], [1028, 10, 13, 15], [1026, 9, 12, 15], [74, 9, 13, 15], [41, 9, 13, 10], [1047, 10, 12, 7], [95, 12, 14, 3]],
  r4: [[1059, 13, 16, 6], [1031, 13, 17, 15], [1029, 13, 16, 15], [1026, 13, 16, 10], [1033, 15, 17, 5], [54, 13, 17, 10], [72, 13, 16, 10], [98, 13, 17, 10], [1011, 14, 17, 10], [1037, 14, 16, 8], [179, 13, 16, 7]],
  r5: [[1055, 17, 20, 5], [1034, 16, 20, 12], [1035, 19, 21, 3], [1036, 17, 20, 10], [1037, 16, 19, 10], [100, 16, 20, 10], [81, 16, 20, 10], [1014, 17, 20, 10], [1043, 17, 20, 10], [77, 17, 21, 10], [1015, 16, 19, 10], [58, 17, 20, 5]],
  r6: [[1053, 21, 24, 6], [1021, 21, 23, 10], [1022, 24, 25, 3], [1038, 21, 24, 12], [1039, 21, 23, 10], [1040, 25, 26, 2], [1019, 22, 24, 8], [1020, 21, 24, 10], [43, 21, 23, 10], [69, 21, 23, 10], [114, 22, 25, 8], [123, 24, 26, 3], [127, 24, 26, 2], [1016, 24, 26, 7]],
  r7: [[1011, 26, 29, 10], [1023, 26, 30, 10], [1039, 26, 29, 10], [1043, 27, 30, 10], [1031, 26, 29, 10], [96, 26, 30, 10], [177, 26, 29, 10], [203, 27, 30, 10], [1012, 30, 30, 3], [1029, 26, 29, 10], [216, 26, 29, 7]],
  mer: [[1029, 25, 32, 25], [1031, 25, 32, 20], [1007, 28, 30, 3], [1045, 28, 32, 10], [72, 25, 32, 20], [1033, 30, 33, 7], [120, 26, 32, 10], [1027, 32, 34, 5]],
  granit: [[1060, 36, 38, 3], [1026, 34, 37, 15], [1027, 36, 38, 5], [1028, 34, 38, 15], [1047, 34, 37, 10], [1048, 37, 39, 3], [74, 34, 37, 15], [111, 35, 38, 10], [1045, 34, 37, 10], [1046, 37, 39, 2], [95, 35, 38, 10], [1024, 34, 37, 5]],
  cendre: [[1041, 38, 42, 20], [1042, 41, 43, 5], [1005, 40, 42, 3], [77, 38, 42, 15], [126, 40, 43, 5], [1028, 38, 41, 10], [1043, 38, 42, 12], [1044, 41, 43, 3], [218, 38, 42, 12], [1036, 38, 41, 10]],
  ecaille: [[1058, 43, 46, 3], [1049, 42, 45, 12], [1050, 45, 47, 4], [1044, 43, 46, 10], [1025, 42, 46, 12], [1016, 42, 45, 10], [1012, 43, 46, 8], [1023, 42, 45, 10], [1048, 43, 46, 8], [148, 44, 46, 6], [1040, 43, 46, 8], [1035, 42, 45, 8], [147, 42, 44, 4]],
  r9: [[1012, 34, 38, 15], [1035, 34, 38, 10], [67, 34, 38, 20], [75, 34, 38, 20], [42, 34, 37, 20], [1044, 35, 38, 10], [105, 34, 37, 5]],
  victoire: [[1056, 38, 42, 4], [67, 36, 42, 12], [75, 36, 42, 12], [1028, 36, 42, 12], [1025, 36, 40, 12], [1048, 38, 42, 8], [1050, 38, 42, 6], [95, 37, 41, 8], [42, 36, 40, 12], [105, 36, 40, 8], [1044, 38, 42, 6], [208, 39, 42, 2], [1051, 50, 50, 1]],
  // îles du bateau : un cran au-dessus de l'arène précédente
  orage: [[1034, 20, 24, 15], [1036, 21, 24, 10], [81, 20, 24, 12], [100, 20, 24, 10], [1029, 20, 24, 10], [21, 20, 23, 10], [22, 22, 25, 5], [1031, 20, 24, 10], [179, 20, 23, 10], [180, 24, 26, 3], [1037, 22, 25, 5]],
  grue: [[1054, 30, 32, 3], [1021, 27, 31, 10], [1038, 27, 31, 10], [1039, 27, 30, 10], [1023, 28, 31, 10], [96, 27, 31, 10], [177, 27, 30, 10], [203, 28, 31, 8], [163, 27, 30, 10], [164, 30, 32, 3], [1043, 28, 31, 8], [1015, 27, 30, 8]],
  brasier: [[1041, 28, 32, 20], [1042, 31, 33, 4], [58, 28, 32, 12], [77, 28, 32, 12], [1028, 28, 31, 10], [1026, 28, 31, 10], [126, 30, 33, 4], [74, 28, 31, 10]],
  givre: [[1045, 37, 41, 20], [1046, 40, 42, 4], [86, 37, 41, 12], [220, 37, 41, 12], [221, 40, 42, 4], [225, 37, 41, 10], [215, 38, 41, 10], [124, 39, 42, 5], [1012, 38, 41, 8], [1016, 38, 41, 8]],
  tourbillons: [[1046, 40, 44, 15], [87, 40, 44, 10], [1030, 40, 43, 12], [1032, 40, 43, 12], [1027, 40, 44, 10], [1009, 42, 44, 3], [131, 42, 44, 4], [42, 40, 43, 12], [1025, 40, 43, 10]],
  est: [[1029, 30, 36, 20], [1031, 30, 36, 20], [72, 30, 36, 20], [1033, 32, 36, 10], [1045, 32, 36, 8], [120, 30, 35, 10], [1007, 32, 35, 3], [131, 35, 38, 2]],
  r10: [[1014, 33, 37, 10], [1035, 33, 37, 10], [1037, 33, 37, 10], [1040, 34, 37, 5], [22, 33, 37, 15], [85, 33, 37, 10], [128, 34, 37, 10], [241, 34, 37, 10], [203, 33, 37, 10], [20, 33, 36, 10]],
};
// plus de diversité : chaque zone reçoit aussi tous les Pokémon des lieux équivalents des jeux officiels (Rouge à X / Y)
enrichirTout(ENC);

/* ---------------- dresseurs ---------------- */
// classe → apparence sur la carte et portrait en combat, prime de base
const CLS = {
  Gamin: ['gamin', 16], Fillette: ['fillette', 16], Montagnard: ['montagnard', 24], Marin: ['marin', 24],
  Topdresseur: ['topdresseur', 40], Topdresseuse: ['topdresseuse', 40], Scientifique: ['scientifique', 30], Pêcheur: ['pecheur', 20],
  Insectomane: ['insectomane', 16], Randonneuse: ['randonneuse', 20], Médium: ['medium', 30], Karatéka: ['karateka', 28],
  'Garde d\'Écaille': ['garde', 36],
  // troisième valeur : portrait en combat quand le personnage n'a pas le sien
  'Sbire de la Brume': ['brume', 32], 'Sbire': ['brume_f', 32], 'Admin de la Brume': ['sylas', 70], 'Chef de la Brume': ['nox', 120], Voleur: ['voleur', 24], Moine: ['pretre', 34, 'pretre'], 'Dame Kimono': ['kimono', 40],
  'Homme d\'affaires': ['topdresseur', 50], 'Femme d\'affaires': ['topdresseuse', 50], Pilote: ['marin', 44], Ninja: ['voleur', 44], Ouvrier: ['montagnard', 40],
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
  ...LEADERS_SUD,
];
const CHAMPION = { name: 'Célestine', ow: 'celestine', team: [[1016, 78], [1046, 79], [1035, 79], [1040, 80], [248, 80], [149, 82]], intro: 'Quinze badges... Les douze du continent, et même celui de Drakos. Tu as parcouru toute la région pour arriver jusqu\'ici. Alors montre-moi tout ce que tu as appris !', lose: 'Magnifique. Tu es le nouveau Maître de la Ligue Céleste !' };

let tCount = 0;
export function trainerNpc(map, x, y, dir, cls, name, team, o = {}) {
  const [ow, prize, bs] = CLS[cls] || ['gamin', 20];
  return map.npc({
    id: o.id || `${map.id}:t${tCount++}`, x, y, dir, sprite: o.ow || ow, move: 'static', onWin: o.onWin,
    trainer: { cls, name, team, prize: o.prize || prize, sight: o.sight ?? 4, bs: o.bs || bs || ow, ai: o.ai || 'normal', items: o.items, intro: o.intro || 'Nos regards se sont croisés : c\'est l\'heure du combat !', lose: o.lose || 'J\'ai perdu...', after: o.after || 'Tu es vraiment fort !' },
  });
}
/** dresseur posé le long d'une route : t sur la ligne, côté ±1, distance au sentier */
function routeTrainer(map, pts, t, side, off, cls, name, team, o = {}) {
  const p = along(pts, t);
  const [x, y] = caseLibre(map, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off);
  // regarde vers le sentier
  const vx = -p.nx * side, vy = -p.ny * side;
  const dir = o.dir || (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up'));
  return trainerNpc(map, x, y, dir, cls, name, team, o);
}
function routeItem(map, pts, t, side, off, item, qty = 1, id) {
  const p = along(pts, t);
  const [x, y] = caseLibre(map, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off);
  map.item(x, y, item, qty, id);
}

/* ---------------- villes ---------------- */
export function buildTown(W, maps, def) {
  const ox = def.x, oy = def.y;
  carveTown(W, { x: ox, y: oy, w: def.w, h: def.h, exits: def.exits, ground: def.ground, fermer: def.fermer });
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
  const poser = (b) => poserBatiment(W, maps, def, b);
  for (const b of def.buildings) poser(b);
  // nouveaux quartiers : des maisons posées d'elles-mêmes dans l'herbe libre de la ville (villes agrandies)
  if (def.lotir) lotir(W, def, poser);
  for (const n of def.npcs || []) {
    const gate = n.gate ? { ...n.gate, tiles: n.gate.tiles.map(([x, y]) => [ox + x, oy + y]) } : undefined;
    const npc = W.npc({ ...n, gate, id: `${def.id}:${n.id || n.x + '-' + n.y}`, x: ox + n.x, y: oy + n.y });
    if (gate) W.gates.push({ npc: npc.id, ...gate });
  }
  W.zone(ox, oy, ox + def.w - 1, oy + def.h - 1, { name: def.name, music: def.music || 'town', town: def.id, theme: def.theme });
}
/** pose un bâtiment de ville (coordonnées relatives au coin de la ville def) avec son intérieur, ses habitants, sa boîte aux
 *  lettres ; renvoie le bâtiment posé */
export function poserBatiment(W, maps, def, b) {
  const ox = def.x, oy = def.y;
  const B = W.building(b.kind, ox + b.x + (b.dx || 0), oy + b.y + (b.dy || 0), { roof: b.roof, style: b.style, label: b.label, name: b.name, w: b.w, d: b.d, h: b.h, door: b.door, kit: b.kit, flat: b.flat, door2: b.door2, blocs: b.blocs, libres: b.libres, porteY: b.porteY, modele: b.modele, opts: b.opts });
  // mapId : identifiant imposé (bâtiment déménagé : les parties arrêtées à l'intérieur reprennent au même endroit)
  let id = b.mapId || `${def.id}:${b.id || b.kind + b.x}`;
  if (maps[id] && !b.mapId) id += 'y' + b.y;   // deux bâtiments dans la même colonne : chacun garde son intérieur
  let inside;
  if (b.interior) inside = b.interior(id);
  else if (b.kind === 'center') inside = centerInterior(id, 'Centre de soins');
  else if (b.kind === 'mart') inside = martInterior(id, 'Boutique', STOCK[def.stock || 1]);
  else if (b.kind === 'gym') { const ar = buildArena(id, def.gym, LEADERS[def.gym].type, 'Arène de ' + def.name); inside = ar.map; def.gymArena = ar; }
  else if (b.kind === 'lab') inside = labInterior(id);
  else if (b.kind === 'league') inside = leagueInterior(id);
  else inside = houseInterior(id, b.name || 'Maison', { w: b.kind === 'bighouse' || b.kind === 'tower' ? 11 : 9, h: b.kind === 'bighouse' || b.kind === 'tower' ? 9 : 8, bed: b.bed, extraBooks: b.kind === 'tower', kitchen: b.kitchen });
  inside.townId = def.id; inside.outside = { map: W.id, x: B.doorX, y: B.doorY + 1, dir: 'down' };
  inside.warp(inside.exitX, inside.exitY, inside.outside);
  if (inside.get(inside.exitX - 1, inside.exitY) === T.MAT) inside.warp(inside.exitX - 1, inside.exitY, inside.outside);
  W.warp(B.doorX, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
  if (B.door2X !== undefined) W.warp(B.door2X, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
  for (const n of b.npcs || []) inside.npc({ id: `${id}:${n.id || n.x + '-' + n.y}`, ...n });
  if (b.setup) b.setup(inside);
  // chemin depuis la porte jusqu'à la route la plus proche
  for (let y = B.doorY + 1; y < B.doorY + 8; y++) { const t = W.get(B.doorX, y); if (t === T.PAVE || t === T.PATH) break; if (t === T.TREE || t === T.BUILD || t === T.WATER) break; W.set(B.doorX, y, T.PATH); }
  maps[id] = inside;
  if (b.kind === 'house' || b.kind === 'house2' || b.kind === 'bighouse') mailbox(W, B, b, def);
  for (const more of b.more ? b.more(inside, id) : []) maps[more.id] = more;   // étages supplémentaires
  if (b.kind === 'center') { def.centerId = id; def.centerDoor = [B.doorX, B.doorY + 1]; }
  if (b.id === 'maison') def.homeDoor = [B.doorX, B.doorY + 1];   // Vol ramène devant la maison à Bourg-Aube (pas de Centre)
  if (b.kind === 'gym') { def.gymMap = inside; def.gymDoor = [B.doorX, B.doorY]; B.typeArene = LEADERS[def.gym]?.type; B.champion = LEADERS[def.gym]?.ow; }
  return B;
}
/** boîte aux lettres devant chaque maison : on y lit qui habite là (nom de famille, et un mot sur les habitants) */
const FAMILLES = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefèvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guérin', 'Muller', 'Henry', 'Roussel', 'Perrin', 'Morin', 'Mathieu', 'Clément', 'Gauthier', 'Dumont', 'Fontaine', 'Chevalier', 'Robin', 'Masson', 'Marchand', 'Duval', 'Denis', 'Lemoine', 'Picard', 'Renard', 'Arnaud', 'Barbier', 'Brun', 'Colin', 'Lucas', 'Aubert', 'Caron'];
const HABITANT = { insectomane: 'Un passionné d\'insectes vit ici.', habitante: 'Une habitante du coin.', habitant: 'Un habitant du coin.', vieil_homme: 'Un vieux monsieur, qui reçoit beaucoup de lettres.', montagnard: 'Un randonneur : la boîte déborde de cartes de randonnée.', randonneuse: 'Une randonneuse, souvent en vadrouille.', pecheur: 'Un pêcheur. Ça sent un peu le poisson…', marin: 'Un marin, rarement à terre.', gamin: 'Une famille avec un petit dresseur.', fillette: 'Une famille avec une petite fille.', enfant: 'Une famille avec des enfants.', scientifique: 'Un chercheur : des revues scientifiques dépassent de la boîte.', medium: 'Une médium. La boîte est… étrangement froide.', karateka: 'Un karatéka. La boîte est cabossée.', topdresseur: 'Un dresseur aguerri.', topdresseuse: 'Une dresseuse aguerrie.', dame: 'Une vieille dame très coquette.', jardinier: 'Un jardinier : des graines dans le courrier.', kimono: 'Une danseuse en kimono.', savant: 'Un savant distrait.', maman: 'Ta famille.' };
function mailbox(W, B, b, def) {
  const h = (B.x * 73856093) ^ (B.y * 19349663);
  const fam = b.id === 'maison' ? null : FAMILLES[Math.abs(h) % FAMILLES.length];
  const who = (b.npcs || []).map((n) => HABITANT[n.sprite]).find(Boolean);
  const text = b.mailboxText || (b.id === 'maison' ? 'BOÎTE AUX LETTRES\nC\'est chez toi ! Une lettre de Maman y attend parfois.'
    : b.name && /^Maison (de|d')/.test(b.name) ? `BOÎTE AUX LETTRES\n${b.name.replace(/^Maison /, 'Famille ')}.`
      : `BOÎTE AUX LETTRES\nFamille ${fam}.${who ? '\n' + who : ''}`);
  // sur le côté de la maison, contre le mur de la façade (à droite si possible, sinon à gauche), sinon près de la porte
  if (W._npcN !== W.npcs.length) { W._npcPos = new Set(W.npcs.map((n) => n.x + ',' + n.y)); W._npcN = W.npcs.length; }
  const libre = (x, y) => { const t = W.get(x, y); return (t === T.GRASS || t === T.FLOWER) && !W._npcPos.has(x + ',' + y) && !W.signs.has(x + ',' + y); };
  for (const [x, y] of [[B.x + B.w, B.doorY], [B.x - 1, B.doorY], [B.x + B.w, B.doorY - 1], [B.x - 1, B.doorY - 1]]) if (libre(x, y)) { W.sign(x, y, text, 'mailbox'); return; }
  for (const dx of [B.w - B.door <= 1 ? -1 : 1, -1, 1]) {
    const x = B.doorX + dx, y = B.doorY + 1;
    if (libre(x, y)) { W.sign(x, y, text, 'mailbox'); return; }
  }
}
/** habitants des maisons des nouveaux quartiers : apparence et quelques mots (jamais d'indice sur l'histoire) */
const VOISINS = [
  ['habitante', ['On a construit tout ce quartier en deux ans. Avant, c\'était la forêt !']],
  ['habitant', ['Le soir, j\'aime regarder les Roucool rentrer au nid.', 'Ils passent toujours au-dessus de la place.']],
  ['vieil_homme', ['Quand j\'étais petit, la ville tenait sur une seule rue.', 'Maintenant, il me faut une carte pour aller chez le boulanger !']],
  ['gamin', ['Un jour, j\'aurai six Pokémon et tous les badges de la région !']],
  ['fillette', ['Ma grande sœur dit qu\'un Pokémon heureux se bat mieux.', 'Alors je brosse mon Ponyta tous les matins.']],
  ['dame', ['Les baies sauvages sont plus sucrées après la pluie.', 'Mais ne les cueille pas toutes : les Pokémon en ont besoin aussi.']],
  ['scientifique', ['J\'étudie le chant des Pokémon Insecte.', 'Chaque ville a son accent, figure-toi.']],
  ['randonneuse', ['Je pars en randonnée demain. Sac, gourde, Potions… et Repousse, surtout !']],
  ['pecheur', ['Une bonne canne, de la patience, et un peu de chance.', 'C\'est tout le secret de la pêche.']],
  ['montagnard', ['Les routes de la région montent et descendent sans arrêt.', 'Mes mollets s\'en souviennent !']],
  ['habitante', ['Le Centre de soins ne ferme jamais. L\'infirmière ne dort donc jamais ?']],
  ['enfant', ['Tu as vu l\'Arène ? Elle est immense ! J\'ai jamais osé entrer.']],
  ['topdresseur', ['Changer de Pokémon au bon moment, c\'est la moitié d\'un combat.']],
  ['topdresseuse', ['Une attaque du même type que le Pokémon qui la lance frappe plus fort.', 'Pense à varier quand même !']],
  ['habitant', ['Mon voisin élève des Chenipan. Le jardin ressemble à une passoire…']],
  ['dame', ['Prends le temps de parler aux gens. On apprend toujours quelque chose.']],
  ['gamin', ['J\'ai échangé mon goûter contre une Poké Ball. Bonne affaire, non ?']],
  ['vieil_homme', ['Les jeunes courent partout. Moi, je regarde les nuages.', 'Ils ont parfois la forme d\'un Pokémon.']],
];
const LOTS = [['house', 4, 3], ['house2', 5, 3], ['house', 4, 3], ['bighouse', 6, 4], ['house2', 5, 3], ['house', 5, 5, 'maisonL']];
/** pose `def.lotir.n` maisons dans l'herbe libre de la ville : la porte donne sur une rue toute proche, et la maison ne coupe
 *  jamais un passage (rues, portes et habitants restent reliés) */
function lotir(W, def, poser) {
  const { n, seed = 7 } = def.lotir, r = rng(seed), ox = def.x, oy = def.y;
  const libre = (t) => t === T.GRASS || t === T.FLOWER;
  const route = (t) => t === T.PATH || t === T.PAVE;
  const reserve = new Set((def.npcs || []).map((q) => (ox + q.x) + ',' + (oy + q.y)));
  for (const q of W.npcs) reserve.add(q.x + ',' + q.y);
  const essentiels = () => {
    const out = [];
    for (let y = oy + 2; y < oy + def.h - 2; y++) for (let x = ox + 2; x < ox + def.w - 2; x++) { const t = W.get(x, y); if (route(t) || t === T.DOOR) out.push([x, t === T.DOOR ? y + 1 : y]); }
    for (const k of reserve) { const [x, y] = k.split(',').map(Number); if (x >= ox && y >= oy && x < ox + def.w && y < oy + def.h) out.push([x, y + 1]); }
    return out;
  };
  // rues, seuils des portes et abords des habitants : tous reliés entre eux avant comme après la pose d'une maison
  const relie = (E) => {
    const vivants = E.filter(([x, y]) => walkable(W.get(x, y)) && W.get(x, y) !== T.DOOR); if (!vivants.length) return true;
    const seen = new Set([vivants[0].join(',')]), q = [vivants[0]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = a + ',' + b; if (seen.has(k) || a < ox || b < oy || a >= ox + def.w || b >= oy + def.h) continue;
        const t = W.get(a, b); if (!walkable(t) || t === T.DOOR) continue;
        seen.add(k); q.push([a, b]);
      }
    }
    return vivants.every(([x, y]) => seen.has(x + ',' + y));
  };
  const cands = [];
  for (let y = 3; y < def.h - 4; y++) for (let x = 3; x < def.w - 4; x++) cands.push([x, y]);
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  let pose = 0, v = Math.floor(r() * VOISINS.length);
  for (const [rx, ry] of cands) {
    if (pose >= n) break;
    const [kind, bw, bd, gk] = LOTS[(pose + seed) % LOTS.length], G = gk ? GRAND[gk] : null;
    const x0 = ox + rx, y0 = oy + ry;
    if (x0 + bw + 1 >= ox + def.w - 2 || y0 + bd + 2 >= oy + def.h - 2) continue;
    // emprise et un tour d'une case libres, rue à moins de 5 cases sous la porte
    let ok = true;
    for (let y = y0 - 1; y <= y0 + bd && ok; y++) for (let x = x0 - 1; x <= x0 + bw; x++) {
      const t = W.get(x, y);   // la rangée du dessus peut être une rue (la maison lui tourne le dos)
      if (!(libre(t) || ((y === y0 - 1 || y === y0 + bd) && route(t))) || reserve.has(x + ',' + y)) { ok = false; break; }
    }
    if (!ok) continue;
    const dxd = G ? G.door : kind === 'house2' ? 2 : kind === 'bighouse' ? 2 : 1, doorY = y0 + (G ? G.porteY : bd - 1);
    let rue = -1; for (let k = 1; k <= 5; k++) { const t = W.get(x0 + dxd, doorY + k); if (route(t)) { rue = k; break; } if (!libre(t)) break; }
    if (rue < 0) continue;
    // la maison ne doit couper aucun passage
    const sauve = []; for (let y = y0; y < y0 + bd; y++) for (let x = x0; x < x0 + bw; x++) { sauve.push([x, y, W.get(x, y)]); W.set(x, y, T.BUILD); }
    for (let k = 1; k < rue; k++) { sauve.push([x0 + dxd, doorY + k, W.get(x0 + dxd, doorY + k)]); W.set(x0 + dxd, doorY + k, T.PATH); }
    for (const [x, y, t] of sauve) W.set(x, y, t);
    const E = essentiels().filter(([x, y]) => walkable(W.get(x, y)));
    for (const [x, y] of sauve) W.set(x, y, y < y0 + bd ? T.BUILD : T.PATH);
    const bon = relie(E);
    for (const [x, y, t] of sauve) W.set(x, y, t);
    if (!bon) continue;
    const [sp, lignes] = VOISINS[v++ % VOISINS.length];
    poser({ kind, ...(G || {}), x: rx, y: ry, roof: ['red', 'blue', 'green', 'brown', 'teal', 'orange', 'purple', 'gray'][Math.floor(r() * 8)], id: 'lot' + pose, npcs: [{ x: 3, y: 4, sprite: sp, move: 'turn', text: lignes }] });
    for (let y = y0 - 1; y <= y0 + bd + 1; y++) for (let x = x0 - 1; x <= x0 + bw; x++) reserve.add(x + ',' + y);
    pose++;
  }
  def.lotis = pose;
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
  // la grande région : 1200 × 1392 cases (plan.js) ; le continent au nord, l'archipel au sud-est, les îles du bateau à l'est,
  // les Terres du Sud sous le détroit
  const W = new GameMap('monde', LARGEUR, HAUTEUR, { outdoor: true, fill: T.TREE, name: 'Odyssée' });
  W.anciensObjets = ANCIENS_OBJETS.map((q) => q.slice());   // les objets d'avant gardent leur identifiant (anciens-objets.js)
  const maps = { monde: W };
  const towns = {};
  const routes = [];
  const legends = [], docks = {};
  const ctxA = { W, maps, legends, routes, docks, towns };
  terres(W);
  /** une ville : l'ancienne au centre, ses nouveaux quartiers autour (quartiers.js, plan.js) */
  const ville = (def, k) => grandeVille(W, maps, def, VILLES[k], { buildTown, poserBatiment });
  const sortie = (def, vers) => def.sorties.find((s) => s.vers === vers);
  /** zone posée sur le couloir d'une porte de ville (déclencheurs de l'histoire) */
  const zoneSortie = (def, vers, o) => { const s = sortie(def, vers), xs = s.cells.map((c) => c[0]), ys = s.cells.map((c) => c[1]); W.zone(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, o); };

  /* ---------- A · Bourg-Aube ---------- */
  const A = towns.A = {
    id: 'aube', name: 'Bourg-Aube', x: 20, y: 238, w: 40, h: 30, exits: [['n', 14], ['e', 10]], fermer: true, lotir: { n: 5, seed: 11 },
    roads: [[14, 2, 15, 23, T.PATH], [4, 10, 39, 11, T.PATH], [14, 19, 22, 19, T.PATH], [4, 23, 35, 23, T.PATH], [30, 11, 31, 27, T.PATH], [3, 27, 36, 27, T.PATH]],
    deco: [['flowers', 9, 3, 11, 5], ['flowers', 26, 13, 27, 17], ['water', 6, 15, 3.2, 2.2], ['fence', 2, 8, 4, 8], ['fence', 24, 8, 27, 8],
      ['sign', 12, 8, 'BOURG-AUBE\nLà où chaque aventure commence.'], ['sign', 13, 17, 'LABORATOIRE\nProf. Saule'], ['lamp', 13, 9], ['lamp', 16, 9]],
    buildings: [
      { kind: 'house', x: 4, y: 4, roof: 'red', id: 'maison', name: 'Maison', bed: true, kitchen: true, npcs: [{ id: 'maman', x: 5, y: 4, sprite: 'maman', dir: 'down', script: 'mom' }] },
      { kind: 'house', x: 20, y: 4, roof: 'blue', id: 'rival', name: 'Maison de Théo', npcs: [{ x: 3, y: 4, sprite: 'habitante', dir: 'right', script: 'rivalMom' }] },
      { kind: 'lab', ...GRAND.lab, x: 16, y: 12, id: 'labo' },
    ],
    npcs: [
      { id: 'fille', x: 11, y: 13, sprite: 'fillette', move: 'wander', text: ['Les créatures sauvages vivent dans les hautes herbes.', 'Sans créature à toi, il ne faut surtout pas y aller !'] },
      { id: 'vieux', x: 24, y: 7, sprite: 'vieil_homme', move: 'turn', text: ['Tu sais courir ? Garde la touche Maj enfoncée en marchant.', 'Et si tu oublies une touche, regarde le petit bouton en bas de l\'écran !'] },
      { id: 'garde10', x: 37, y: 12, sprite: 'garde', dir: 'up', gate: { badges: 5, tiles: [[38, 10], [38, 11]] }, text: ['La route 10 longe des falaises instables.', 'Reviens quand tu auras 5 badges.'] },
    ],
  };
  ville(A, 'A');
  zoneSortie(A, 'r1', { name: 'Bourg-Aube', music: 'town', trigger: 'needStarter' });

  /* ---------- B · Sylvebourg (Hector, Insecte) ---------- */
  const B = towns.B = {
    id: 'sylve', name: 'Sylvebourg', x: 18, y: 138, w: 54, h: 44, exits: [['s', 16], ['n', 16]], gym: 0, stock: 1, fermer: true, lotir: { n: 7, seed: 21 },
    roads: [[16, 0, 17, 43, T.PATH], [4, 11, 49, 12], [4, 20, 15, 21], [4, 36, 49, 37], [46, 12, 47, 36], [18, 28, 27, 28]],
    deco: [['flowers', 11, 4, 14, 7], ['flowers', 19, 4, 21, 7], ['lamp', 14, 10], ['lamp', 19, 10], ['lamp', 14, 13], ['lamp', 19, 13], ['lamp', 14, 35], ['lamp', 19, 35],
      ['sign', 14, 9, 'SYLVEBOURG\nLa ville où murmurent les feuilles.'], ['sign', 39, 38, 'ARÈNE DE SYLVEBOURG\nChampion : Hector\nL\'observateur des insectes.'],
      ['trees', 2, 23, 3, 25], ['tall', 28, 2, 31, 5], ['water', 8, 30, 3.4, 2.2], ['flowers', 19, 29, 26, 33], ['trees', 49, 2, 51, 8], ['trees', 2, 39, 6, 41]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 5, y: 5 }, { kind: 'mart', ...GRAND.mart, x: 21, y: 6 }, { kind: 'gym', ...GRAND.gym, x: 28, y: 18, roof: 'green' },
      { kind: 'house', x: 5, y: 15, roof: 'green', npcs: [{ x: 4, y: 4, sprite: 'insectomane', text: ['Hector, le Champion, adore les créatures Insecte.', 'Le Feu, le Vol et la Roche les mettent en difficulté !'] }] },
      { kind: 'house', x: 10, y: 15, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Une créature endormie ou paralysée est bien plus facile à capturer.', 'Et plus ses PV sont bas, mieux c\'est !'] }, { id: 'gs', x: 6, y: 3, sprite: 'vieil_homme', script: 'gsBall' }] },
    ],
    npcs: [
      { id: 'gamin', x: 9, y: 13, sprite: 'gamin', move: 'wander', text: ['Le Centre de soins soigne tes créatures gratuitement.', 'C\'est le bâtiment au toit rouge !'] },
      { id: 'garde', x: 16, y: 3, sprite: 'garde', dir: 'down', gate: { badges: 1, tiles: [[16, 2], [17, 2]] }, text: ['Le Bois Murmure est plein de dresseurs coriaces.', 'Reviens quand tu auras le badge de l\'Arène !'] },
    ],
  };
  ville(B, 'B');

  /* ---------- C · Pierrefort (ville minière, sans arène) ---------- */
  const C = towns.C = {
    id: 'pierre', name: 'Pierrefort', x: 62, y: 30, w: 60, h: 34, decal: [28, 0], exits: [['s', 43], ['e', 10], ['n', 45]], stock: 2, fermer: true, lotir: { n: 6, seed: 83 },
    roads: [[43, 10, 44, 33], [36, 10, 59, 11], [45, 18, 55, 19], [4, 26, 57, 27], [19, 18, 20, 26], [36, 11, 37, 26]],
    deco: [['rock', 56, 20], ['rock', 38, 23], ['rock', 3, 23], ['lamp', 42, 12], ['lamp', 45, 12], ['trees', 54, 3, 57, 6, T.PINE],
      ['sign', 41, 12, 'PIERREFORT\nUne ville taillée dans la montagne.'], ['sign', 54, 8, 'MAISON DES MINEURS\nAncien atelier de Basalte.'], ['flowers', 46, 21, 46, 24],
      // l'usine Poké Ball, derrière sa clôture : un portail gardé sur l'allée
      ['fence', 2, 3, 37, 3], ['fence', 2, 4, 2, 17], ['fence', 37, 4, 37, 17], ['fence', 3, 17, 18, 17], ['fence', 21, 17, 36, 17],
      ['sign', 17, 19, 'USINE POKÉ BALL DE PIERREFORT\nFermée au public. Accès réservé au personnel.'], ['lamp', 18, 16], ['lamp', 21, 16]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 39, y: 3 }, { kind: 'mart', ...GRAND.mart, x: 47, y: 21 },
      { kind: 'bighouse', x: 48, y: 3, roof: 'brown', id: 'mineurs', name: 'Maison des Mineurs', npcs: [
        { x: 4, y: 5, sprite: 'montagnard', text: ['Ici travaillait Basalte, le meilleur mineur de la région.', 'Il est parti sur l\'Île de Granit, au sud-est, rejoindre ses deux frères.', 'On dit qu\'il garde l\'île pour le compte de l\'aîné, Drakos...'] },
        { x: 7, y: 6, sprite: 'vieil_homme', text: ['Les trois frères étaient de braves gars.', 'Puis Drakos a perdu contre Célestine, la Maître de la Ligue.', 'Il n\'a jamais digéré sa défaite. Il s\'est taillé un royaume sur les îles.'] }] },
      { kind: 'house', x: 45, y: 13, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['Les créatures Roche résistent aux attaques Normal et Feu.', 'Mais l\'Eau et la Plante les font fondre !'] }] },
      { kind: 'house', x: 50, y: 13, roof: 'brown', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['À l\'est, la route 3 mène à la Grotte Lunaire.', 'Il y fait sombre... et les Nosferapti adorent s\'y cacher.'] }] },
      { kind: 'house2', x: 53, y: 21, roof: 'red', npcs: [{ x: 2, y: 4, sprite: 'scientifique', text: ['Ta créature peut évoluer en gagnant des niveaux.', 'Certaines ont besoin d\'une pierre spéciale, vendue en boutique.'] }] },
      { kind: 'tower', ...GRAND.usine, x: 4, y: 4, roof: 'gray', id: 'usine', name: 'Usine Poké Ball', npcs: [{ x: 5, y: 4, sprite: 'scientifique', text: ['Comment es-tu entré ? ... Bon, ne touche à rien.', 'Ici, on assemble les Poké Balls de toute la région.'] }] },
    ],
    npcs: [
      { id: 'montagnard', x: 48, y: 12, sprite: 'montagnard', move: 'wander', text: ['Il paraît que des Onix creusent au fond de la Grotte Lunaire.', 'On les entend gronder sous la roche !'] },
      { id: 'usine', x: 18, y: 18, sprite: 'garde', dir: 'down', gate: { badges: 99, tiles: [[19, 17], [20, 17]] }, text: ['L\'usine Poké Ball est fermée au public.', 'Depuis qu\'on a volé des prototypes de Balls, personne n\'entre sans badge d\'employé.', 'Des gens en gris rôdaient autour, la veille du vol... Circule.'] },
    ],
  };
  ville(C, 'C');
  { const s = sortie(C, 'mine'); C.mine = [s.cells[0][0], VILLES.C.y]; }   // le chemin de la mine part de la porte nord (mine.js)

  /* ---------- D · Port-Azur (Marine, Eau) ---------- */
  const D = towns.D = {
    id: 'azur', name: 'Port-Azur', x: 185, y: 22, w: 37, h: 46, exits: [['w', 11], ['e', 19]], gym: 1, stock: 3, music: 'port', fermer: true, lotir: { n: 6, seed: 33 },
    roads: [[2, 11, 31, 12], [2, 19, 36, 20], [15, 7, 16, 42], [30, 11, 31, 42], [2, 42, 34, 43], [2, 20, 3, 42], [17, 30, 29, 30]],
    deco: [['waterRect', 2, 0, 31, 3], ['sand', 2, 4, 31, 6], ['bridge', 15, 0, 16, 6], ['lamp', 14, 13], ['lamp', 17, 13], ['lamp', 14, 21], ['lamp', 17, 21],
      ['sign', 13, 8, 'PORT-AZUR\nLe parfum des embruns et des voyages.'], ['sign', 21, 41, 'ARÈNE DE PORT-AZUR\nChampionne : Marine\nLa vague déferlante.'], ['flowers', 19, 21, 28, 23], ['lamp', 14, 41], ['lamp', 17, 41], ['water', 30, 36, 2.6, 1.6]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 6 }, { kind: 'mart', ...GRAND.mart, x: 10, y: 6 },
      { kind: 'house', x: 19, y: 8, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'marin', text: ['Plus loin à l\'est, Voltacité ne dort jamais.', 'Ses néons éclairent la côte toute la nuit !'] }] },
      { kind: 'house', x: 24, y: 8, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Une créature peut retenir quatre attaques au maximum.', 'Quand elle en apprend une cinquième, il faut en oublier une.'] }] },
      { kind: 'gym', ...GRAND.gym, x: 6, y: 25, roof: 'blue' },
      { kind: 'house2', x: 5, y: 14, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'marin', text: ['Le port s\'agrandit chaque année : les quais du sud sont tout neufs.'] }] },
      { kind: 'house', x: 19, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Avant, un ferry partait d\'ici pour l\'archipel du sud.', 'Depuis que Drakos tient les îles, plus un bateau ne part d\'ici.', 'Et ne compte pas y aller à la nage : des tourbillons entourent l\'archipel. Seul le vieux passeur du Cap Mirage connaît la passe.'] }] },
      { kind: 'house2', x: 24, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Le jour, la nuit, le matin, le soir...', 'La couleur du ciel change avec l\'heure de ton ordinateur !'] }] },
    ],
    npcs: [
      { id: 'marin', x: 17, y: 5, sprite: 'marin', move: 'turn', text: ['Ahoy ! Ce ponton était le départ des ferries.', 'Depuis que les îles ont fermé leurs ports, plus aucun bateau ne part...'] },
      { id: 'pecheur', x: 25, y: 5, sprite: 'pecheur', move: 'wander', text: ['Les Racaillou se cachent parmi les galets, méfie-toi en marchant sur la plage.'] },
      { id: 'garde', x: 34, y: 18, sprite: 'garde', dir: 'down', gate: { badges: 2, tiles: [[35, 19], [35, 20]] }, text: ['La route 4 longe une côte escarpée.', 'Il faut deux badges pour l\'emprunter.'] },
    ],
  };
  ville(D, 'D');

  /* ---------- E · Voltacité (Volta, Électrik) ---------- */
  const E = towns.E = {
    id: 'volta', name: 'Voltacité', x: 275, y: 48, w: 47, h: 46, exits: [['w', 10], ['s', 8]], gym: 2, stock: 4, ground: T.PAVE, music: 'city', fermer: true,
    roads: [[0, 10, 44, 11], [2, 18, 44, 19], [8, 10, 9, 45], [2, 42, 44, 43], [40, 10, 41, 42]],
    deco: [['lamp', 7, 12], ['lamp', 10, 12], ['lamp', 16, 12], ['lamp', 22, 12], ['lamp', 16, 20], ['lamp', 27, 20], ['pot', 2, 12], ['pot', 28, 12],
      ['sign', 11, 12, 'VOLTACITÉ\nLa ville qui ne s\'éteint jamais.'], ['sign', 21, 41, 'ARÈNE DE VOLTACITÉ\nChampionne : Volta\nL\'étincelle foudroyante.'], ['flowers', 2, 21, 7, 22], ['flowers', 11, 21, 28, 22], ['lamp', 12, 41], ['lamp', 34, 41], ['lamp', 39, 20], ['pot', 42, 12]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 5 }, { kind: 'mart', ...GRAND.mart, x: 11, y: 5 },
      { kind: 'tower', x: 17, y: 6, roof: 'gold', name: 'Centrale de Voltacité', npcs: [{ x: 5, y: 4, sprite: 'scientifique', text: ['Cette centrale alimente toute la région.', 'Les Magnéti adorent se blottir contre les générateurs !'] }, { x: 8, y: 6, sprite: 'scientifique', text: ['Les créatures Sol ne craignent pas du tout l\'électricité.', 'Un bon atout contre l\'Arène !'] }] },
      { kind: 'house2', x: 23, y: 7, roof: 'gray', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['La paralysie divise la vitesse par quatre.', 'Et parfois, la créature ne peut même pas attaquer !'] }] },
      { kind: 'gym', ...GRAND.gym, x: 13, y: 24, roof: 'gold' },
      { kind: 'house2', x: 31, y: 7, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'scientifique', text: ['La nuit, la ville brille tellement qu\'on voit à peine les étoiles.'] }] },
      { kind: 'bighouse', x: 33, y: 21, roof: 'gray', name: 'Résidence des Néons', npcs: [{ x: 4, y: 4, sprite: 'topdresseuse', text: ['Douze étages, et l\'ascenseur est toujours en panne. Merci les coupures de courant !'] }] },
      { kind: 'house', x: 33, y: 29, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitant', text: ['Mon Pikachu recharge mon téléphone. Pratique, non ?'] }] },
      { kind: 'house2', x: 2, y: 24, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'enfant', text: ['Quand je serai grand, je travaillerai à la Centrale !'] }] },
      { kind: 'house', x: 2, y: 33, roof: 'orange', npcs: [{ x: 4, y: 4, sprite: 'dame', text: ['Les Magnéti adorent se coller aux lampadaires. Ça fait de drôles de grappes.'] }] },
      { kind: 'house2', x: 33, y: 35, roof: 'purple', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['Le Champion de Port-Azur, c\'était dur ? Volta, c\'est autre chose !'] }] },
      { kind: 'house', x: 11, y: 15, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Une Super Capsule capture mieux qu\'une Capsule.', 'Une Hyper Capsule, c\'est encore mieux !'] }] },
      { kind: 'house', x: 3, y: 15, roof: 'purple', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Au sud, la route 5 descend jusqu\'à Floralia.', 'Une ville couverte de fleurs, tu verras.'] }] },
    ],
    npcs: [
      { id: 'scientifique', x: 14, y: 14, sprite: 'scientifique', move: 'wander', text: ['La nuit, les créatures qu\'on croise ne sont pas tout à fait les mêmes.', 'Les Hoothoot, par exemple, sortent surtout le soir.'] },
      { id: 'garde', x: 10, y: 43, sprite: 'garde', dir: 'left', gate: { badges: 3, tiles: [[8, 44], [9, 44]] }, text: ['La route 5 est fermée aux dresseurs débutants.', 'Il faut trois badges pour passer.'] },
    ],
  };
  ville(E, 'E');

  /* ---------- F · Floralia (Flora, Plante) ---------- */
  const F = towns.F = {
    id: 'flora', name: 'Floralia', x: 165, y: 112, w: 50, h: 40, exits: [['n', 17], ['e', 19]], gym: 3, stock: 5, music: 'city', fermer: true, lotir: { n: 6, seed: 45 },
    roads: [[17, 0, 18, 37], [2, 9, 33, 10], [2, 19, 49, 20], [2, 9, 3, 37], [32, 9, 33, 20], [2, 37, 47, 37], [46, 20, 47, 37]],
    deco: [['flowers', 5, 11, 15, 12], ['flowers', 20, 11, 30, 12], ['flowers', 5, 22, 14, 24], ['water', 9, 30, 3.4, 1.8], ['flowers', 19, 22, 23, 26], ['flowers', 36, 6, 44, 8],
      ['lamp', 16, 7], ['lamp', 19, 7], ['lamp', 16, 21], ['lamp', 19, 21], ['pot', 8, 13], ['pot', 28, 13],
      ['sign', 15, 3, 'FLORALIA\nLa cité aux mille couleurs.'], ['sign', 24, 36, 'ARÈNE DE FLORALIA\nChampionne : Flora\nLa beauté épineuse.'],
      // petits arbres qui barrent la route 6 : il faut la capacité Coupe
      ['cut', 48, 19], ['cut', 48, 20]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 3 }, { kind: 'mart', ...GRAND.mart, x: 10, y: 4 },
      { kind: 'bighouse', x: 21, y: 5, roof: 'purple', name: 'Résidence Floralia', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Les attaques de statut ne font pas de dégâts, mais elles changent tout.', 'Un adversaire endormi, c\'est un adversaire inoffensif !'] }, { x: 7, y: 5, sprite: 'scientifique', text: ['J\'ai vu un dresseur aux cheveux bleus foncer vers l\'Arène.', 'Il avait l\'air pressé de te battre...'] }] },
      { kind: 'house2', x: 27, y: 6, roof: 'green', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['Les buissons épineux à l\'est bloquent la Route 6 vers Mirage.', 'Flora, notre Championne, conserve le précieux Sécateur Sylvestre.', 'Elle ne le confie qu\'aux dresseurs qui remportent le Badge Pétale !'] }] },
      { kind: 'gym', ...GRAND.gym, x: 26, y: 21, roof: 'green' },
      { kind: 'house', x: 4, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Ta créature la plus en forme combat en premier.', 'Change l\'ordre de ton équipe dans le menu Équipe !'] }] },
      { kind: 'house', x: 9, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Mirage, à l\'est, est une ville étrange.', 'On dit que ses habitants lisent dans les pensées.'] }] },
      { kind: 'house', x: 28, y: 16, roof: 'blue', npcs: [{ x: 3, y: 4, sprite: 'marin', text: ['Le PC du Centre garde les créatures en trop.', 'Ton équipe ne peut compter que six créatures.'] }] },
    ],
    npcs: [
      { id: 'jardiniere', x: 12, y: 13, sprite: 'fillette', move: 'wander', text: ['Bienvenue à Floralia ! Respire ce parfum...'] },
      { id: 'garde', x: 17, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 3, tiles: [[17, 1], [18, 1]] }, text: ['Floralia accueille les dresseurs qui ont trois badges.'] },
    ],
  };
  ville(F, 'F');
  zoneSortie(F, 'r5', { name: 'Floralia', music: 'city', trigger: 'rival3' });

  /* ---------- G · Mirage (Sibylle, Psy) ---------- */
  const G = towns.G = {
    id: 'mirage', name: 'Mirage', x: 276, y: 136, w: 46, h: 34, exits: [['w', 10], ['s', 15], ['w', 28]], gym: 4, stock: 6, music: 'mystic', fermer: true, lotir: { n: 4, seed: 57 },
    roads: [[0, 10, 43, 11], [2, 18, 24, 19], [15, 10, 16, 33], [0, 28, 15, 29], [2, 31, 43, 31], [41, 11, 42, 31]],
    deco: [['flowers', 2, 2, 27, 3], ['lamp', 14, 12], ['lamp', 17, 12], ['pot', 2, 13], ['pot', 13, 16], ['water', 20, 24, 3, 1.4], ['lamp', 14, 30], ['lamp', 17, 30],
      ['sign', 18, 12, 'MIRAGE\nLa ville où l\'esprit voit plus loin.'], ['sign', 25, 30, 'ARÈNE DE MIRAGE\nChampionne : Sibylle\nLe regard qui perce le voile.']],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 4 }, { kind: 'mart', ...GRAND.mart, x: 10, y: 5 },
      { kind: 'tower', x: 20, y: 6, roof: 'purple', name: 'Tour Mirage', npcs: [{ x: 5, y: 4, sprite: 'medium', text: ['Les attaques Psy sont puissantes... mais le type Ténèbres ne les craint pas.', 'Et les Insectes ne sont pas si fragiles face à elles.'] }, { x: 8, y: 5, sprite: 'vieil_homme', text: ['Les murs de cette tour racontent les légendes d\'Odyssée.', 'Trois oiseaux gardent les îles de l\'Est : la foudre, le feu et la glace.', 'Deux gardiens règnent sur le ciel et la mer : Ho-Oh, l\'arc-en-ciel, et Lugia, l\'argent des profondeurs.', 'Et au-dessus d\'eux, Odyssor, le géant des océans, qui a guidé les premiers marins jusqu\'ici.'] }] },
      { kind: 'gym', ...GRAND.gym, x: 26, y: 14, roof: 'purple' },
      { kind: 'house', x: 3, y: 13, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'medium', text: ['Je savais que tu viendrais. Ne me demande pas comment.'] }] },
      { kind: 'house', x: 8, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'pecheur', text: ['Au sud, la route 7 descend jusqu\'au Cap Mirage.', 'De là, on aperçoit les îles de l\'archipel.', 'Mais les tourbillons empêchent de traverser à la nage : seul le passeur du Cap y va.'] }] },
    ],
    npcs: [
      { id: 'voyante', x: 20, y: 13, sprite: 'medium', move: 'turn', text: ['Je vois... trois îles, trois frères.', 'Et une vieille rancune qui gronde comme un volcan.'] },
    ],
  };
  ville(G, 'G');
  zoneSortie(G, 'r6', { name: 'Mirage', music: 'mystic', town: 'mirage', trigger: 'rivalB1' });

  /* ---------- K · Port-Granit, Île de Granit (Basalte, Roche) ---------- */
  const K = towns.K = {
    id: 'granit', name: 'Port-Granit', x: 302, y: 198, w: 30, h: 30, exits: [['n', 20]], gym: 5, stock: 6, music: 'port', island: true,
    roads: [[20, 0, 21, 26, T.PATH], [2, 18, 27, 18, T.PATH], [2, 26, 27, 26, T.PATH]],
    deco: [['rock', 26, 13], ['rock', 27, 17], ['rock', 2, 27], ['rock', 17, 21], ['rock', 25, 24], ['lamp', 22, 12], ['lamp', 22, 17], ['lamp', 19, 19], ['lamp', 22, 25],
      ['flowers', 23, 20, 27, 23], ['flowers', 25, 15, 27, 16], ['flowers', 11, 19, 16, 20],
      ['sign', 22, 5, 'PORT-GRANIT\nÎle de Granit — sous la protection de Drakos.'], ['sign', 12, 17, 'ARÈNE DE GRANIT\nChampion : Basalte\nLe frère cadet.']],
    buildings: [
      // mapId : les identifiants des intérieurs d'avant l'agrandissement (parties arrêtées dedans, dresseurs de l'arène)
      { kind: 'gym', ...GRAND.gym, x: 2, y: 2, roof: 'brown', mapId: 'granit:gym3' },
      { kind: 'mart', ...GRAND.mart, x: 23, y: 3, mapId: 'granit:mart18' },
      { kind: 'house', x: 23, y: 9, roof: 'gray', mapId: 'granit:house15', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Drakos nous prend la moitié de chaque pêche.', '« Pour protéger les îles », qu\'il dit.', 'Basalte ferme les yeux... c\'est son frère, après tout.'] }] },
      { kind: 'center', ...GRAND.center, x: 3, y: 21, mapId: 'granit:center2' },
      { kind: 'house', x: 12, y: 23, roof: 'brown', mapId: 'granit:house20', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Les trois frères sont nés ici, sur Granit.', 'Basalte est le plus jeune. Pyros garde le volcan, et Drakos... la Grande Île.'] }] },
    ],
    npcs: [
      { id: 'garde-quai', x: 22, y: 2, sprite: 'garde', dir: 'down', script: 'granitDock', text: ['Port-Granit. Ici, c\'est Drakos qui fait la loi, pas la Ligue.'] },
      { id: 'marin', x: 15, y: 22, sprite: 'marin', move: 'wander', text: ['Avec Surf, tu peux rejoindre Cendrelune, au sud-ouest.', 'Mais les gardes de Pyros ne laissent entrer que ceux qui ont battu Basalte.'] },
    ],
  };
  ville(K, 'K');
  zoneSortie(K, 'quai', { name: 'Port-Granit', music: 'port', town: 'granit', trigger: 'rivalB2' });
  // le chemin du ponton de Port-Granit, face au Cap Mirage
  const quaiGranit = (() => { const s = sortie(K, 'quai'), [x, y] = s.ext[0]; W.rect(x - 2, y - 14, x + 3, y, T.SAND, [T.TREE, T.GRASS, T.WATER]); W.rect(x, y - 14, x + 1, y, T.PATH); let qy = y - 14; while (W.get(x, qy - 1) !== T.WATER && qy > y - 40) { W.set(x, qy - 1, T.PATH); W.set(x + 1, qy - 1, T.PATH); qy--; } return [x, qy]; })();

  /* ---------- H · Cendrelune (Pyros, Feu) ---------- */
  const H = towns.H = {
    id: 'cendre', name: 'Cendrelune', x: 268, y: 231, w: 36, h: 31, exits: [['n', 23], ['w', 7]], gym: 6, stock: 7, ground: T.ASH, music: 'volcano', theme: 'volcanic', island: true,
    roads: [[23, 0, 24, 8, T.PATH], [0, 7, 33, 8, T.PATH], [6, 9, 6, 27, T.PATH], [28, 9, 28, 27, T.PATH], [2, 27, 33, 27, T.PATH]],
    deco: [['rock', 32, 2], ['rock', 9, 10], ['rock', 5, 25], ['rock', 32, 25], ['rock', 25, 28], ['rock', 8, 28], ['rock', 15, 3], ['rock', 20, 4], ['lamp', 22, 9], ['lamp', 25, 9],
      // les sources chaudes, entre les rochers
      ['water', 31, 20, 2.2, 1.6], ['rock', 29, 18], ['rock', 33, 22],
      ['sign', 25, 5, 'CENDRELUNE\nL\'île où dort le volcan.'], ['sign', 14, 26, 'ARÈNE DE CENDRELUNE\nChampion : Pyros\nLe frère du milieu.'],
      ['sign', 29, 23, 'SOURCES CHAUDES\nPour les Pokémon aguerris.']],
    buildings: [
      // mapId : les identifiants des intérieurs d'avant l'agrandissement (parties arrêtées dedans, dresseurs de l'arène)
      { kind: 'center', ...GRAND.center, x: 2, y: 2, mapId: 'cendre:center3' }, { kind: 'mart', ...GRAND.mart, x: 27, y: 2, mapId: 'cendre:mart11' },
      { kind: 'house', x: 2, y: 19, roof: 'orange', mapId: 'cendre:house23', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['L\'Eau, la Roche et le Sol éteignent le Feu.', 'Pyros a beau être ardent, il a ses faiblesses.'] }] },
      { kind: 'gym', ...GRAND.gym, x: 8, y: 11, roof: 'red', mapId: 'cendre:gym12' },
      { kind: 'house', x: 2, y: 12, roof: 'brown', mapId: 'cendre:house3', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Le pont qui nous reliait au continent a été coupé sur ordre de Drakos.', 'Il voulait que les îles se débrouillent sans la Ligue.'] }] },
      { kind: 'house', x: 30, y: 12, roof: 'gray', mapId: 'cendre:house22', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: ['Pyros n\'est pas méchant. Il croit que son frère protège les îles.', 'Mais protéger, ce n\'est pas tout prendre...'] }] },
    ],
    npcs: [],
  };
  ville(H, 'H');
  // plages de Cendrelune : au nord (vers Granit, un sentier y descend) et à l'ouest (vers la Grande Île)
  for (const v of ['plage-n', 'plage-w']) { const s = sortie(H, v), [x, y] = s.ext[0], d = { n: [0, -1], w: [-1, 0] }[s.dir]; for (let k = 0; k < 30; k++) { const a = x + d[0] * k, b = y + d[1] * k; if (W.get(a, b) === T.WATER) break; W.rect(a - 2 + (d[0] ? 0 : 0), b - (d[1] ? 0 : 2), a + 3, b + (d[1] ? 0 : 3), T.SAND, [T.TREE, T.GRASS]); W.set(a, b, T.PATH); W.set(a + (d[1] ? 1 : 0), b + (d[0] ? 1 : 0), T.PATH); } }
  gymGuard(W, H, 6, ['Halte ! L\'arène de Pyros n\'accueille que ceux qui ont vaincu Basalte.', 'Reviens avec le Badge Granit.']);

  /* ---------- L · Fort-Écaille, Grande Île (Drakos, Dragon) ---------- */
  const L = towns.L = {
    id: 'ecaille', name: 'Fort-Écaille', x: 192, y: 207, w: 38, h: 34, exits: [['e', 11], ['n', 20], ['s', 20]], gym: 7, stock: 7, music: 'mystic', island: true,
    roads: [[20, 0, 21, 33], [22, 11, 37, 12], [2, 30, 35, 30]],
    deco: [['trees', 2, 2, 19, 9, T.PINE], ['flowers', 3, 10, 17, 12], ['statue', 18, 11], ['statue', 23, 13], ['statue', 18, 2], ['lamp', 22, 2], ['lamp', 19, 14], ['lamp', 22, 22], ['lamp', 19, 29], ['lamp', 22, 29],
      ['trees', 34, 2, 35, 3, T.PINE], ['trees', 34, 18, 35, 23, T.PINE], ['flowers', 29, 25, 35, 28], ['flowers', 29, 20, 31, 22], ['flowers', 23, 26, 27, 28],
      ['sign', 22, 10, 'FORT-ÉCAILLE\nCapitale de l\'archipel. Par ordre de Drakos.'], ['sign', 12, 29, 'TOUR DE DRAKOS\nChampion : Drakos\nL\'aîné des trois frères.']],
    buildings: [
      // mapId : les identifiants des intérieurs d'avant l'agrandissement (parties arrêtées dedans, dresseurs de l'arène)
      { kind: 'gym', ...GRAND.gym, x: 2, y: 14, roof: 'purple', mapId: 'ecaille:gym13' },
      { kind: 'center', ...GRAND.center, x: 23, y: 3, mapId: 'ecaille:center3' }, { kind: 'mart', ...GRAND.mart, x: 31, y: 4, mapId: 'ecaille:mart9' },
      { kind: 'bighouse', x: 23, y: 14, roof: 'purple', mapId: 'ecaille:bighouse23', name: 'Caserne d\'Écaille', npcs: [{ x: 4, y: 4, sprite: 'garde', text: ['Nous, les Gardes d\'Écaille, servons Drakos.', 'Il a juré qu\'aucun Maître de la Ligue ne dicterait jamais sa loi aux îles.'] }, { x: 7, y: 5, sprite: 'garde', text: ['Entre nous... ça fait longtemps que je ne sais plus contre qui on se bat.'] }] },
      { kind: 'house', x: 31, y: 14, roof: 'teal', mapId: 'ecaille:house4', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Drakos a perdu contre Célestine, il y a dix ans, en finale de la Ligue.', 'Depuis, il refuse toute autorité. Même celle de la Ligue.'] }] },
      { kind: 'house', x: 24, y: 21, roof: 'red', mapId: 'ecaille:house25', npcs: [{ x: 2, y: 4, sprite: 'vieil_homme', text: ['Au nord de la ville, il y a le Cap des Étoiles.', 'On raconte que Odyssor, le géant des océans, y passe quand la mer est calme...', 'Mais Drakos en interdit l\'accès.'] }] },
    ],
    npcs: [
      { id: 'garde-cap', x: 20, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 8, tiles: [[20, 1], [21, 1]] }, text: ['Le Cap des Étoiles est interdit.', 'Seul Drakos, ou celui qui l\'aura vaincu, peut y passer.'] },
      { id: 'enfant', x: 27, y: 26, sprite: 'enfant', move: 'wander', text: ['Mon papa dit que Drakos était un héros, avant.'] },
    ],
  };
  ville(L, 'L');
  { const [gx, gy] = L.gymDoor; W.zone(gx - 3, gy + 1, gx + 3, gy + 4, { name: 'Fort-Écaille', music: 'mystic', town: 'ecaille', trigger: 'rivalB3' }); }
  gymGuard(W, L, 7, ['Halte ! Drakos ne reçoit que ceux qui ont vaincu ses deux frères.', 'Il te faut le Badge Granit et le Badge Braise.']);

  /* ---------- I · Cimelune (porte de la Route Victoire) ---------- */
  const I = towns.I = {
    id: 'cime', name: 'Cimelune', x: 150, y: 222, w: 32, h: 32, exits: [['e', 16], ['n', 10], ['w', 16]], stock: 7, music: 'mystic', fermer: true, lotir: { n: 4, seed: 69 },
    roads: [[2, 9, 29, 10], [0, 16, 31, 17], [10, 0, 11, 17], [15, 17, 16, 28], [3, 28, 28, 28]],
    deco: [['water', 26, 5, 3.2, 2.6], ['trees', 2, 19, 5, 21, T.PINE], ['trees', 26, 19, 29, 21, T.PINE], ['flowers', 12, 19, 19, 21], ['statue', 15, 21], ['lamp', 9, 11], ['lamp', 12, 11],
      ['sign', 8, 8, 'CIMELUNE\nLa cité des dragons anciens.'], ['sign', 13, 14, 'MUSÉE DES DRAGONS\nL\'histoire des dragons d\'Odyssée.']],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 3 }, { kind: 'mart', ...GRAND.mart, x: 13, y: 4 },
      { kind: 'house', x: 19, y: 6, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'scientifique', text: ['Les dragons ne craignent presque rien...', 'sauf la Glace et les autres dragons.'] }] },
      { kind: 'bighouse', x: 13, y: 11, roof: 'purple', name: 'Musée des Dragons', npcs: [{ x: 5, y: 4, sprite: 'vieil_homme', text: ['Drakos a grandi en écoutant les histoires de ce musée.', 'Il rêvait de devenir Maître. Célestine l\'a battu en finale.', 'Depuis, il règne sur l\'archipel, loin de la Ligue.'] }, { x: 8, y: 5, sprite: 'scientifique', text: ['Regarde cette fresque : une créature immense nageant sous la mer étoilée.', 'Odyssor. Les anciens disaient qu\'il apparaît au Cap des Étoiles quand les îles et le continent se réconcilient.', 'À côté, un oiseau d\'argent plonge dans la mer : Lugia. On dit que Odyssor et Lugia sont les deux gardiens des eaux.'] }] },
      { kind: 'house', x: 3, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Au nord, la Route Victoire mène au Plateau Céleste.', 'Seuls les dresseurs aux quinze badges peuvent la franchir : les douze du continent et ceux des trois frères.'] }] },
      { kind: 'house', x: 22, y: 13, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['La route 10 relie Cimelune à Bourg-Aube, par l\'ouest.', 'Ça rappelle des souvenirs, hein ?'] }] },
    ],
    npcs: [
      { id: 'garde', x: 12, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 15, tiles: [[9, 1], [10, 1], [11, 1], [12, 1]] }, text: ['Halte ! La Route Victoire est réservée aux dresseurs aux quinze badges.', 'Les douze Champions du continent et les trois frères de l\'archipel. Les sept derniers t\'attendent dans les Terres du Sud, au-delà du Pont de l\'Austral.'] },
    ],
  };
  ville(I, 'I');
  // plage de Cimelune, face à la Grande Île (derrière les tourbillons)
  { const s = sortie(I, 'plage'), [x, y] = s.ext[0]; for (let k = 0; k < 40 && W.get(x + k, y) !== T.WATER; k++) { W.rect(x + k, y - 3, x + k, y + 4, T.SAND, [T.TREE]); W.set(x + k, y, T.PATH); W.set(x + k, y + 1, T.PATH); } }

  /* ---------- J · Plateau Céleste (Ligue), au cœur de la Chaîne Céleste ---------- */
  const J = towns.J = {
    id: 'plateau', name: 'Plateau Céleste', x: 74, y: 130, w: 34, h: 56, exits: [['s', 16]], stock: 7, music: 'league', fermer: true,
    // la Ligue en haut, puis la grande allée bordée de colonnes (laissée libre et pavée) jusqu'à la sortie, au sud
    roads: [[11, 16, 22, 50], [16, 51, 17, 53], [3, 30, 10, 31], [23, 30, 30, 31]],
    deco: [['flowers', 3, 18, 9, 26], ['flowers', 24, 18, 30, 26], ['flowers', 3, 40, 9, 50], ['flowers', 24, 40, 30, 50], ['lamp', 10, 51], ['lamp', 23, 51],
      ['sign', 24, 52, 'PLATEAU CÉLESTE\nLe sommet des dresseurs.']],
    buildings: [
      { kind: 'league', ...GRAND.league, x: 2, y: 2, id: 'ligue' },
      { kind: 'center', ...GRAND.center, x: 3, y: 33 }, { kind: 'mart', ...GRAND.mart, x: 25, y: 34 },
    ],
    npcs: [],
  };
  ville(J, 'J');

  /* ======================== ROUTES ======================== */
  // grandes routes (chemins.js) : le sentier serpente de bloc en bloc dans son territoire (plan.js, TERR)
  const G2 = (S, enc, music = 'route') => {
    const res = grandeRoute(W, { ...S, terr: S.terr || TERR[S.id], enc }, { ENC, trainerNpc, maps });
    routes.push({ id: S.id, name: S.nom, pts: res.pts, cells: res.cells.keys() });
    for (const [c0, r0, c1, r1] of S.terr || TERR[S.id]) W.zone(c0 * BLOC, r0 * BLOC, (c1 + 1) * BLOC - 1, (r1 + 1) * BLOC - 1, { name: S.nom, music, enc: ENC[enc], theme: S.theme, route: S.id, prio: 0, ombre: S.ombre });
    const tr = S.terr || TERR[S.id], x0 = Math.min(...tr.map((q) => q[0])) * BLOC - 2, y0 = Math.min(...tr.map((q) => q[1])) * BLOC - 2, x1 = (Math.max(...tr.map((q) => q[2])) + 1) * BLOC + 1, y1 = (Math.max(...tr.map((q) => q[3])) + 1) * BLOC + 1;
    res.rect = [x0, y0, x1, y1];
    boucherLocal(W, res.cells, nearestWalkable(W, ...res.pts[Math.floor(res.pts.length / 2)]), res.rect, T.TREE, S.id + ':');
    res.pts.res = res;
    return res.pts;
  };
  // le point de passage entre deux routes qui se suivent (la route 2 et le Bois Murmure)
  const relais = (x, y, dir) => ({ x, y, dir });

  const r1 = G2({ id: 'r1', nom: 'Route 1', de: porte('A', 'r1'), vers: arrivee('B', 'r1'), long: 3, graine: 101, w: 13, grass: 0.8, trees: 0.04, paysages: ['rebords', 'prairie', 'fleurs'], branches: 0, dresseurs: 0, promeneurs: 1, panneaux: ['ROUTE 1\n↑ Sylvebourg   ↓ Bourg-Aube', null], voix: 'general' }, 'r1');
  routeTrainer(W, r1, 0.35, 1, 4, 'Gamin', 'Léo', [[1013, 4], [1010, 4]], { intro: 'Hé ! Toi aussi tu viens d\'avoir ta première créature ?' });
  routeTrainer(W, r1, 0.62, -1, 4, 'Fillette', 'Inès', [[161, 5]], { intro: 'Mon Fouinette est le plus mignon de la route !' });
  routeTrainer(W, r1, 0.82, 1, 3, 'Gamin', 'Malo', [[1010, 5], [19, 5], [1017, 4]]);
  routeTrainer(W, r1, 0.5, 1, 5, 'Fillette', 'Mila', [[1013, 4], [16, 4]]);
  routeItem(W, r1, 0.5, -1, 5, 'potion'); routeItem(W, r1, 0.9, 1, 5, 'poke-ball', 2);

  const H1 = relais(143, 196, 'e');
  const r2 = G2({ id: 'r2', nom: 'Route 2', de: porte('B', 'r2'), vers: H1, effile: [true, false], long: 14, graine: 202, w: 11, grass: 0.7, trees: 0.05, flowers: 0.03, paysages: ['prairie', 'fleurs', 'bosquet', 'plateau', 'etang', 'riviere', 'rebords'], branches: 0.45, raccourci: 'coupe', anciens: 4, panneaux: ['ROUTE 2\n↑ Bois Murmure   ↓ Sylvebourg', null], voix: 'general' }, 'r2');
  routeTrainer(W, r2, 0.2, -1, 3, 'Insectomane', 'Noé', [[1017, 6], [1018, 6], [10, 7]]);
  routeTrainer(W, r2, 0.45, 1, 3, 'Fillette', 'Jade', [[1039, 7], [29, 7]]);
  routeTrainer(W, r2, 0.7, -1, 4, 'Gamin', 'Sacha', [[21, 8], [1034, 7]]);
  routeTrainer(W, r2, 0.9, 1, 3, 'Topdresseuse', 'Alba', [[1021, 8], [43, 9], [1011, 9]]);
  routeItem(W, r2, 0.33, 1, 4, 'antidote'); routeItem(W, r2, 0.6, -1, 4, 'potion', 2); routeItem(W, r2, 0.8, 1, 5, 'repel');
  { const p = along(r2, 0.02), [x, y] = nearestWalkable(W, p.x, p.y); W.zone(x - 3, y - 3, x + 3, y + 3, { name: 'Route 2', music: 'route', trigger: 'rival2' }); }

  // le Bois Murmure : une forêt dense et sombre (on marche à l'ombre des frondaisons), un sentier qui serpente, deux
  // cabanes, une clairière cachée derrière un passage dans les arbres
  const bois = G2({ id: 'bois', nom: 'Bois Murmure', de: relais(144, 196, 'e'), vers: arrivee('C', 'bois'), effile: [false, true], long: 7, graine: 303, w: 11, grass: 1.3, tall: T.DARKTALL, trees: 0.3, flowers: 0, theme: 'forest', ombre: 0.5, paysages: ['bosquet', 'prairie', 'bosquet', 'etang'], branches: 0, anciens: 4, voix: 'bois', panneaux: [null, 'BOIS MURMURE\n↑ Pierrefort'] }, 'bois', 'forest');
  {
    /** cabane dans les bois : une petite clairière, une maison de bois et son intérieur, un sentier jusqu'à la route */
    const cabane = (id, name, x, y, vers, o = {}) => {
      W.rect(x - 2, y - 2, x + 5, y + 4, T.GRASS, [T.TREE, T.PINE, T.DARKTALL, T.TALL]);
      const B = W.building('house', x, y, { roof: o.roof || 'brown', name, kit: 'chalet' });
      const mid = 'bois:' + id, inside = houseInterior(mid, name, { w: 9, h: 8, bed: o.bed, kitchen: o.kitchen });
      inside.outside = { map: 'monde', x: B.doorX, y: B.doorY + 1, dir: 'down' }; inside.warp(inside.exitX, inside.exitY, inside.outside);
      W.warp(B.doorX, B.doorY, { map: mid, x: inside.exitX, y: inside.exitY, dir: 'up' });
      W.lpath(B.doorX, B.doorY + 1, vers[0], vers[1], T.PATH, true);
      maps[mid] = inside; return inside;
    };
    // les blocs libres du bois, à côté du sentier : les deux cabanes et la clairière cachée
    const libres = blocsLibres(bois.res, TERR.bois);
    const [b1, b2, b3] = libres;
    const coin = (b) => [b.f[0] * BLOC + 12, b.f[1] * BLOC + 12];
    const [cx1, cy1] = coin(b1), [cx2, cy2] = coin(b2), [cx3, cy3] = coin(b3);
    const versChemin = (b) => { const p = along(bois, b.t); return nearestWalkable(W, p.x, p.y); };
    const buch = cabane('bucheron', 'Cabane du Bûcheron', cx1 - 2, cy1 - 2, versChemin(b1), { kitchen: true });
    buch.npc({ id: 'bois:bucheron', x: 4, y: 4, sprite: 'montagnard', dir: 'down', text: ['Ce bois est si dense que le soleil n\'y touche presque jamais le sol.', 'Les anciens l\'appellent le Bois Murmure : quand le vent tombe, les arbres continuent de chuchoter.', 'Moi, je ne coupe que le bois mort. Les vieux arbres d\'ici ont vu passer plus de siècles que toi et moi.'] });
    W.prop('tonneau', cx1 - 3, cy1); W.prop('caisses', cx1 + 4, cy1 - 1); W.sign(cx1 - 3, cy1 + 2, 'CABANE DU BÛCHERON\nBois mort uniquement.');
    const vieille = cabane('abandonnee', 'Cabane abandonnée', cx2 - 2, cy2 - 2, versChemin(b2));
    vieille.item(2, 3, 'dusk-stone'); vieille.item(7, 5, 'super-potion', 2);
    vieille.prop('books', 6, 2); vieille.object(6, 2, { use: async (A) => A.say(['Un vieux carnet est resté ouvert sur l\'étagère. L\'écriture est pâle :', '« Le jour où j\'ai posé la capsule sur l\'autel, les feuilles se sont figées en l\'air. »', '« Puis tout est reparti, comme si de rien n\'était. J\'ai reperdu la capsule depuis. »', '... La suite est illisible.']) });
    W.prop('rocher_grand', cx2 - 4, cy2 + 2); W.prop('tonneau', cx2 + 4, cy2 - 1);
    // la clairière cachée : un passage d'une case entre les arbres, un cercle de pierres, une silhouette qui parle par énigmes
    W.rect(cx3 - 3, cy3 - 3, cx3 + 2, cy3 + 2, T.GRASS, [T.TREE, T.PINE, T.DARKTALL]);
    { const [px, py] = versChemin(b3), dedans = (x, y) => x >= cx3 - 3 && x <= cx3 + 2 && y >= cy3 - 3 && y <= cy3 + 2;
      let x = cx3, y = cy3; while (x !== px || y !== py) { if (x !== px) x += Math.sign(px - x); else y += Math.sign(py - y); if (dedans(x, y)) continue; if (walkable(W.get(x, y))) break; W.set(x, y, T.GRASS); W.setHeight(x, y, W.height(px, py)); } }
    for (const [x, y] of [[cx3 - 3, cy3 - 3], [cx3 + 2, cy3 - 3], [cx3 - 3, cy3 + 2], [cx3 + 2, cy3 + 2], [cx3 - 1, cy3 - 3]]) W.prop('rocher_grand', x, y);
    W.prop('stele', cx3, cy3 - 1); W.object(cx3, cy3 - 1, { use: async (A) => A.say('Une pierre couverte de mousse. On y devine des feuilles gravées en spirale,\net, au centre, une petite créature aux ailes rondes.') });
    W.npc({ id: 'bois:silhouette', x: cx3 - 1, y: cy3 + 1, sprite: 'medium', dir: 'left', text: ['Tu as trouvé le passage. Peu de gens le voient.', 'Ce bois murmure parce qu\'il se souvient. Hier, demain... pour lui, c\'est la même chose.', 'Ceux qui portent ce qu\'il attend trouvent toujours l\'autel.'] });
    W.item(cx3 + 1, cy3, 'rare-candy');
  }
  routeTrainer(W, bois, 0.2, 1, 4, 'Insectomane', 'Adam', [[1017, 9], [1020, 9], [165, 9]]);
  routeTrainer(W, bois, 0.42, -1, 4, 'Randonneuse', 'Clara', [[1015, 10], [69, 10]]);
  routeTrainer(W, bois, 0.65, 1, 3, 'Insectomane', 'Timothée', [[167, 11], [1019, 11]]);
  routeTrainer(W, bois, 0.85, -1, 4, 'Topdresseur', 'Yanis', [[1043, 12], [1011, 12], [1021, 11]]);
  routeItem(W, bois, 0.3, -1, 6, 'super-potion'); routeItem(W, bois, 0.55, 1, 6, 'paralyze-heal'); routeItem(W, bois, 0.75, -1, 6, 'moon-stone');

  // route 3 : elle serpente vers le Mont Lunaire et grimpe sur ses contreforts jusqu'à la Grotte Lunaire, qui le traverse
  const { dx: LX, dy: LY } = LUNAIRE;
  // les abords des deux bouches de la grotte : un replat d'herbe (au pied du sentier du Mont, devant la sortie est)
  W.rect(141 + LX, 34 + LY, 154 + LX, 42 + LY, T.GRASS); W.rect(166 + LX, 35 + LY, 178 + LX, 43 + LY, T.GRASS);
  const g1in = W.building('cave', 146 + LX, 38 + LY), g1out = W.building('cave', 171 + LX, 38 + LY);
  const r3a = G2({ id: 'r3', nom: 'Route 3', de: porte('C', 'r3'), vers: { x: g1in.doorX, y: g1in.doorY + 1, dir: 'n' }, long: 6, graine: 404, w: 10, grass: 0.8, trees: 0.04, rocks: 0.02, paysages: ['rochers', 'prairie', 'bosquet', 'fleurs'], branches: 0.5, anciens: 4, panneaux: ['ROUTE 3\n→ Grotte Lunaire, Mont Lunaire', null], voix: 'montagne' }, 'r3');
  plateau(W, polygone([[137.5 + LX, 27 + LY], [153 + LX, 25 + LY], [154.5 + LX, 34 + LY], [153.5 + LX, 47.5 + LY], [146 + LX, 48.5 + LY], [137.5 + LX, 47.5 + LY]]), 1);
  routeTrainer(W, r3a, 0.35, 1, 3, 'Montagnard', 'Gaston', [[1026, 11], [74, 12], [66, 12]]);
  routeTrainer(W, r3a, 0.7, -1, 3, 'Fillette', 'Lise', [[1039, 12], [35, 11]]);
  routeItem(W, r3a, 0.55, 1, 4, 'burn-heal');
  routeTrainer(W, r3a, 0.15, -1, 3, 'Gamin', 'Joris', [[1024, 11], [21, 11]]);
  routeTrainer(W, r3a, 0.88, 1, 3, 'Randonneuse', 'Célia', [[1026, 12], [1039, 12]]);
  const r3b = G2({ id: 'r3e', nom: 'Route 3', de: { x: g1out.doorX, y: g1out.doorY + 1, dir: 's' }, vers: arrivee('D', 'r3e'), long: 7, graine: 505, w: 9, grass: 0.6, trees: 0.03, paysages: ['prairie', 'rochers', 'fleurs', 'etang'], branches: 0.5, anciens: 1, panneaux: [null, 'ROUTE 3\n→ Port-Azur'], voix: 'montagne' }, 'r3');
  plateau(W, polygone([[167.5 + LX, 26 + LY], [181.5 + LX, 26 + LY], [181.5 + LX, 47.5 + LY], [167.5 + LX, 47.5 + LY]]), 1);
  routeTrainer(W, r3b, 0.6, -1, 3, 'Randonneuse', 'Maëlle', [[1034, 13], [27, 13]]);

  // route 4 : elle monte sur les falaises qui dominent la mer, longe le bord, puis redescend vers Voltacité
  const r4 = G2({ id: 'r4', nom: 'Route 4', de: porte('D', 'r4'), vers: arrivee('E', 'r4'), long: 11, graine: 606, w: 12, grass: 0.6, trees: 0.03, flowers: 0.03, paysages: ['plateau', 'prairie', 'fleurs', 'etang', 'rochers', 'riviere'], branches: 0.4, raccourci: 'coupe', anciens: 4, panneaux: ['ROUTE 4\n→ Voltacité', 'ROUTE 4\n← Port-Azur'], voix: 'mer' }, 'r4', 'route2');
  routeTrainer(W, r4, 0.18, -1, 4, 'Pêcheur', 'Yves', [[1031, 15], [1029, 15], [60, 15]]);
  routeTrainer(W, r4, 0.4, 1, 4, 'Marin', 'Loïc', [[66, 16], [1033, 16]]);
  routeTrainer(W, r4, 0.62, -1, 4, 'Fillette', 'Romane', [[1037, 16], [179, 17]]);
  routeTrainer(W, r4, 0.85, 1, 3, 'Topdresseur', 'Kylian', [[1011, 18], [84, 17], [1026, 18]]);
  routeItem(W, r4, 0.3, 1, 5, 'great-ball', 2); routeItem(W, r4, 0.72, -1, 5, 'water-stone', 1, 'monde:265,47');   // identifiant d'avant les talus (anciennes sauvegardes)

  const r5 = G2({ id: 'r5', nom: 'Route 5', de: porte('E', 'r5'), vers: arrivee('F', 'r5'), long: 17, graine: 707, w: 12, grass: 0.75, trees: 0.05, rocks: 0.01, paysages: ['prairie', 'rebords', 'rochers', 'etang', 'fleurs', 'riviere', 'bosquet'], branches: 0.4, raccourci: 'eclate', anciens: 5, panneaux: ['ROUTE 5\n↓ Floralia', 'ROUTE 5\n↑ Voltacité'], voix: 'general' }, 'r5');
  // au milieu de la route, un tertre : un escalier taillé y grimpe, sa falaise domine le sentier
  tertre(W, r5, 0.5, 'ether', 2);
  routeTrainer(W, r5, 0.12, 1, 4, 'Scientifique', 'Pierre', [[1036, 19], [100, 19], [81, 20]]);
  routeTrainer(W, r5, 0.3, -1, 4, 'Randonneuse', 'Élise', [[77, 20], [1014, 20]]);
  routeTrainer(W, r5, 0.46, 1, 4, 'Karatéka', 'Kenji', [[66, 21], [1033, 22]]);
  routeTrainer(W, r5, 0.6, -1, 4, 'Gamin', 'Nathan', [[1034, 20], [22, 20], [209, 21]]);
  routeTrainer(W, r5, 0.78, 1, 4, 'Topdresseuse', 'Zoé', [[1037, 22], [1043, 21], [179, 21]]);
  routeItem(W, r5, 0.22, -1, 5, 'super-potion', 2); routeItem(W, r5, 0.5, 1, 5, 'thunder-stone'); routeItem(W, r5, 0.7, -1, 5, 'full-heal'); routeItem(W, r5, 0.9, 1, 5, 'rare-candy');

  const r6 = G2({ id: 'r6', nom: 'Route 6', de: porte('F', 'r6'), vers: arrivee('G', 'r6'), long: 10, graine: 808, w: 12, grass: 0.8, trees: 0.06, flowers: 0.04, paysages: ['fleurs', 'prairie', 'plateau', 'etang', 'bosquet'], branches: 0.4, anciens: 4, panneaux: ['ROUTE 6\n→ Mirage', 'ROUTE 6\n← Floralia'], voix: 'general' }, 'r6', 'route2');
  // une falaise boisée et un petit belvédère où l'on monte par un escalier taillé
  tertre(W, r6, 0.8, 'elixir', 1);
  routeTrainer(W, r6, 0.15, 1, 4, 'Randonneuse', 'Nina', [[1038, 24], [70, 24]]);
  routeTrainer(W, r6, 0.35, -1, 4, 'Insectomane', 'Hugo', [[1019, 25], [127, 25]]);
  routeTrainer(W, r6, 0.55, 1, 3, 'Médium', 'Morgane', [[1023, 25], [92, 24], [1039, 26]]);
  routeTrainer(W, r6, 0.75, -1, 4, 'Topdresseur', 'Axel', [[47, 26], [1020, 26], [1016, 26]]);
  routeItem(W, r6, 0.25, -1, 5, 'leaf-stone'); routeItem(W, r6, 0.65, 1, 5, 'hyper-potion'); routeItem(W, r6, 0.9, -1, 5, 'revive');

  // route 7 : de Mirage au Cap Mirage, face à l'archipel
  const CAP = { x: 830, y: 548 };
  const r7 = G2({ id: 'r7', nom: 'Route 7', de: porte('G', 'r7'), vers: { x: CAP.x, y: CAP.y, dir: 's' }, effile: [true, false], long: 6, graine: 909, w: 12, grass: 0.7, trees: 0.04, rocks: 0.03, paysages: ['rebords', 'rochers', 'prairie', 'fleurs'], branches: 0.4, anciens: 4, panneaux: ['ROUTE 7\n↓ Cap Mirage', null], voix: 'mer' }, 'r7');
  routeTrainer(W, r7, 0.25, 1, 4, 'Médium', 'Ophélie', [[1023, 28], [97, 29]]);
  routeTrainer(W, r7, 0.55, -1, 4, 'Karatéka', 'Bruno', [[1033, 29], [107, 29], [106, 30]]);
  routeTrainer(W, r7, 0.8, 1, 4, 'Topdresseuse', 'Lou', [[78, 31], [1012, 31], [1040, 30]]);
  routeTrainer(W, r7, 0.4, 1, 3, 'Pêcheur', 'Gaël', [[1029, 28], [118, 29]]);
  routeItem(W, r7, 0.4, -1, 5, 'fire-stone');
  // Cap Mirage : plage, ponton et le rival qui attend
  { const { x, y } = CAP; W.rect(x - 22, y, x + 22, y + 6, T.SAND, [T.TREE, T.GRASS, T.TALL, T.WATER, T.FLOWER]); W.rect(x - 22, y + 7, x + 22, y + 9, T.WATER, [T.TREE, T.GRASS, T.SAND, T.TALL]);
    W.rect(x - 18, y + 4, x + 18, y + 6, T.SAND, [T.WATER]);
    W.zone(x - 22, y - 2, x + 22, y + 6, { name: 'Cap Mirage', music: 'route', trigger: 'rival4' });
    W.sign(x + 9, y + 1, 'CAP MIRAGE\nAu sud-est : Île de Granit. Au sud : Cendrelune.\nTourbillons au large : baignade interdite. Passeur pour l\'archipel.');
    W.npc({ id: 'cap:pecheur', x: x - 6, y: y + 2, sprite: 'pecheur', dir: 'down', text: ['Les trois îles que tu vois là-bas, ce sont les îles des trois frères.', 'Granit, la plus proche. Puis Cendrelune, le volcan. Et la Grande Île, tout au fond.', 'Drakos, l\'aîné, règne sur les trois depuis Fort-Écaille.', 'Même avec le Harnais Flottant, n\'essaie pas d\'y aller à la nage : les tourbillons t\'avaleraient. Le passeur du Cap t\'y emmènera.', 'Là-bas, ton Harnais te servira pour passer d\'une île à l\'autre.'] }); }

  // Grande Île : route 11 (de la plage est à Fort-Écaille, par une passe rocheuse) et forêt d'Écaille au sud
  const PLAGE11 = { x: 668, y: 744 };
  const r11 = G2({ id: 'r11', nom: 'Route 11', de: { x: PLAGE11.x, y: PLAGE11.y, dir: 'w' }, vers: arrivee('L', 'r11'), effile: [false, true], long: 6, graine: 1111, w: 10, grass: 0.8, trees: 0.06, rocks: 0.05, paysages: ['rochers', 'prairie', 'bosquet'], branches: 0.4, anciens: 2, voix: 'mer' }, 'ecaille');
  W.rect(PLAGE11.x - 2, PLAGE11.y - 4, PLAGE11.x + 6, PLAGE11.y + 5, T.SAND, [T.TREE, T.GRASS, T.TALL]);
  // la passe : des rochers fissurés barrent la route sur toute sa largeur (Éclate-Roc)
  { const p = along(r11, 0.55); for (let k = -6; k <= 6; k++) { const x = Math.round(p.x + p.nx * k), y = Math.round(p.y + p.ny * k); for (const [xx, yy] of [[x, y], [x + 1, y]]) { const t = W.get(xx, yy); if (t !== T.TREE && t !== T.WATER) W.set(xx, yy, T.SMASH); } } }
  // la passe est une gorge : deux murailles de roche l'enserrent, de part et d'autre du sentier (on y passe à trois de front)
  { const g = [...bande(r11, 2.6, 10, 1, 0.3, 0.72), ...bande(r11, 2.6, 10, -1, 0.3, 0.72)];
    const pris = new Set([...W.npcs.map((n) => n.x + ',' + n.y), ...W.items.map((i) => i.x + ',' + i.y)]);
    for (const [x, y] of g) if ([T.GRASS, T.TALL, T.FLOWER, T.ROCK].includes(W.get(x, y)) && !pris.has(x + ',' + y)) W.set(x, y, T.TREE);
    massif(W, g, { pas: 2, max: 2 }); boucherLocal(W, r11.res.cells, nearestWalkable(W, ...r11[1]), r11.res.rect, T.TREE, 'r11:'); }
  routeTrainer(W, r11, 0.25, 1, 3, 'Garde d\'Écaille', 'Ronan', [[1044, 44], [1025, 44], [1048, 45]], { intro: 'Halte ! La Grande Île appartient à Drakos !', lose: 'Tch... Passe, alors.' });
  routeTrainer(W, r11, 0.8, -1, 3, 'Garde d\'Écaille', 'Solène', [[1050, 46], [1012, 45], [1035, 45]], { intro: 'Tu veux voir Drakos ? Montre-moi d\'abord ce que tu vaux !', lose: 'Drakos va enfin avoir un vrai adversaire...' });
  routeItem(W, r11, 0.4, 1, 4, 'max-potion');
  const r12 = G2({ id: 'r12', nom: 'Forêt d\'Écaille', de: porte('L', 'r12'), vers: { x: 588, y: 772, dir: 's' }, long: 7, graine: 1212, w: 12, grass: 1.1, tall: T.DARKTALL, trees: 0.14, theme: 'forest', paysages: ['bosquet', 'prairie', 'etang'], branches: 0.6, anciens: 2, voix: 'bois' }, 'ecaille', 'forest');
  routeTrainer(W, r12, 0.3, -1, 3, 'Topdresseuse', 'Maya', [[1040, 44], [1016, 44], [184, 45]]);
  routeTrainer(W, r12, 0.6, 1, 3, 'Karatéka', 'Takeo', [[1033, 45], [107, 45], [68, 46]]);
  routeItem(W, r12, 0.5, -1, 4, 'ultra-ball', 3, 'monde:222,250'); routeItem(W, r12, 0.95, 1, 2, 'rare-candy');   // (la première garde son identifiant d'avant l'agrandissement de Fort-Écaille)
  // Cap des Étoiles : au nord de Fort-Écaille, une clairière où passe Odyssor
  { const s = sortie(L, 'cap'), [x0, y0] = s.ext[0], cy = y0 - 12;
    W.rect(x0 - 5, cy - 3, x0 + 6, y0, T.GRASS, [T.TREE]); W.rect(x0, cy - 2, x0 + 1, y0, T.PATH);
    W.prop('statue', x0 - 2, cy - 2); W.prop('statue', x0 + 3, cy - 2);
    W.object(x0, cy - 3, { type: 'odyssor' }); W.object(x0 + 1, cy - 3, { type: 'odyssor' }); W.rect(x0, cy - 3, x0 + 1, cy - 3, T.PATH);
    // une barrière au bord de la falaise : on contemple la mer, mais on n'accoste pas ici en surfant
    W.set(x0, cy - 4, T.FENCE); W.set(x0 + 1, cy - 4, T.FENCE); W.rect(x0 - 4, cy - 12, x0 + 5, cy - 5, T.WATER);
    W.zone(x0 - 5, cy - 12, x0 + 6, y0, { name: 'Cap des Étoiles', music: 'mystic', trigger: 'rivalB4' });
    W.capEtoiles = [x0, cy - 3]; }

  // la mer de l'archipel : rencontres en surfant
  W.zone(456, 552, 938, 815, { name: 'Mer de l\'Archipel', music: 'route2', enc: ENC.mer, sea: true, prio: -1 });
  W.zone(816, 576, 938, 712, { name: 'Île de Granit', music: 'port', enc: ENC.granit });

  // Route Victoire : de Cimelune, elle grimpe en lacets dans la Chaîne Céleste jusqu'à la Grotte Victoire ; de l'autre côté
  // de la grotte, sur le haut plateau, la Route Céleste mène au Plateau Céleste et à la Ligue
  const v1in = W.building('cave', 372, 392), v1out = W.building('cave', 300, 396);
  const r9 = G2({ id: 'r9', nom: 'Route Victoire', de: porte('I', 'r9'), vers: { x: v1in.doorX, y: v1in.doorY + 1, dir: 'n' }, long: 13, graine: 999, w: 9, grass: 0.5, trees: 0.02, rocks: 0.06, monte: 3, paysages: ['rochers', 'prairie', 'etang'], branches: 0, dresseurs: 5, theme: 'montagne', voix: 'montagne', panneaux: ['ROUTE VICTOIRE\nRéservée aux dresseurs aux quinze badges.', null] }, 'r9');
  { const h = W.height(v1in.doorX, v1in.doorY + 1); for (let y = v1in.y; y < v1in.y + v1in.d; y++) for (let x = v1in.x; x < v1in.x + v1in.w; x++) W.setHeight(x, y, h); }
  const r9b = G2({ id: 'r9b', nom: 'Route Céleste', de: { x: v1out.doorX, y: v1out.doorY + 1, dir: 's' }, vers: arrivee('J', 'r9b'), long: 5, graine: 1010, w: 9, grass: 0.4, trees: 0.02, rocks: 0.04, base: 4, paysages: ['rochers', 'fleurs'], branches: 0.3, dresseurs: 2, theme: 'montagne', voix: 'montagne' }, 'r9');
  for (const b of [v1out]) for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) W.setHeight(x, y, 4);
  { const p = along(r9b, 0.12), [x, y] = nearestWalkable(W, p.x, p.y); W.zone(x - 6, y - 5, x + 6, y + 5, { name: 'Route Céleste', music: 'route', enc: ENC.r9, trigger: 'rival5' }); }
  void r9; void r9b;

  // route 10 : elle longe la côte du détroit, franchit le chenal de l'Embarcadère, puis rejoint Cimelune
  const r10 = G2({ id: 'r10', nom: 'Route 10', de: porte('A', 'r10'), vers: arrivee('I', 'r10'), long: 15, graine: 1313, w: 12, grass: 0.8, trees: 0.05, rocks: 0.02, paysages: ['plateau', 'prairie', 'rochers', 'fleurs', 'etang', 'rebords'], branches: 0.4, raccourci: 'surf', anciens: 4, panneaux: ['ROUTE 10\n→ Cimelune · Pont de l\'Austral', 'ROUTE 10\n← Bourg-Aube'], voix: 'mer' }, 'r10');
  routeTrainer(W, r10, 0.2, 1, 4, 'Topdresseur', 'Victor', [[1035, 36], [128, 36], [1014, 36]]);
  routeTrainer(W, r10, 0.45, -1, 4, 'Karatéka', 'Ryu', [[68, 37], [1033, 37]]);
  routeTrainer(W, r10, 0.7, 1, 4, 'Topdresseuse', 'Léa', [[241, 37], [1040, 37], [1037, 37]]);
  routeTrainer(W, r10, 0.9, -1, 4, 'Médium', 'Sixtine', [[1023, 37], [94, 38]]);
  routeItem(W, r10, 0.35, -1, 5, 'ultra-ball', 3); routeItem(W, r10, 0.85, 1, 5, 'sun-stone');
  // la tête du Pont de l'Austral : la case de la route 10 la plus au sud, entre x 198 et 236, d'où part le pont (sud.js)
  let PONT = null;
  for (const [px, py] of r10) { const x = Math.round(px), y = Math.round(py); if (x >= 198 && x <= 236 && W.get(x, y) === T.PATH && W.get(x + 1, y) === T.PATH && (!PONT || y > PONT[1])) PONT = [x, y]; }

  /* ======================== LES ÎLES DU BATEAU ======================== */
  // Le bateau part de l'Embarcadère de l'Aube (à droite de la route 1) : Île Orageuse avec 2 badges, Île de la Grue avec 3,
  // Île Givrée (tout au nord) avec 5. Pas de Champion sur ces îles, mais des dresseurs plus forts que l'arène précédente
  // et, sur chacune, au moins un légendaire à capturer au bout d'une quête. Chaque île est bâtie dans son ancien repère
  // puis posée à l'est, au-delà des tourbillons (atelier.js).
  const legend = (o) => { legends.push({ map: 'monde', ...o }); return o; };
  const xy = ([x, y]) => ({ x, y });
  /** outils de construction sur une carte (la grande, ou le brouillon d'une île) */
  const outils = (M) => {
    const R = (id, name, pts, o, enc, music = 'route') => {
      const res = carveRoute(M, pts, { seed: routes.length * 97 + 13, ...o });
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = (o.w || 9) / 2 + 2;
      routes.push({ id, name, pts, cells: res.info.keys() });
      M.zone(Math.floor(Math.min(...xs) - m), Math.floor(Math.min(...ys) - m), Math.ceil(Math.max(...xs) + m), Math.ceil(Math.max(...ys) + m), { name, music, enc: ENC[enc], theme: o.theme, route: id, prio: 0, ombre: o.ombre });
      return pts;
    };
    /** ponton : planches sur l'eau depuis la côte (x, y) vers dx ; le capitaine se tient au bout */
    const pier = (key, name, x, y, dx, len, badges, o = {}) => {
      for (let k = 0; k < len; k++) M.set(x + dx * k, y, T.BRIDGE);
      const cx = x + dx * (len - 1);
      M.npc({ id: 'quai:' + key, x: cx, y, dir: dx > 0 ? 'left' : 'right', sprite: 'marin', script: 'ferry', dock: key });
      docks[key] = { name, map: 'monde', x: cx - dx, y, dir: dx > 0 ? 'left' : 'right', badges, ...o };
      const x0 = Math.min(x, cx), x1 = Math.max(x, cx); M.zone(x0 - 1, y - 2, x1 + 1, y + 2, { name: o.town || name, music: o.music || 'port' });
    };
    /** ponton vertical (depuis une plage, vers le sud ou le nord) ; le passeur se tient au bout */
    const pierV = (key, name, x, y, dy, len, badges, o = {}) => {
      for (let k = 0; k < len; k++) M.set(x, y + dy * k, T.BRIDGE);
      const cy = y + dy * (len - 1), dir = dy > 0 ? 'up' : 'down';
      M.npc({ id: 'quai:' + key, x, y: cy, dir, sprite: 'marin', script: 'ferry', dock: key });
      docks[key] = { name, map: 'monde', x, y: cy - dy, dir, badges, ...o };
    };
    /** passage étroit (2 cases) fermé par un PNJ tant qu'un drapeau d'histoire n'est pas levé */
    const flagGate = (id, tiles, npcAt, flag, badges, sprite, text) => {
      const n = M.npc({ id, x: npcAt[0], y: npcAt[1], dir: 'down', sprite, gate: { badges, flag, tiles }, text });
      M.gates.push({ npc: n.id, badges, flag, tiles });
    };
    /** objet de décor avec lequel on interagit (borne, stèle, autel) */
    const thing = (prop, x, y, o) => { M.prop(prop, x, y); M.object(x, y, o); };
    const offRoute = (pts, t, side, off) => { const p = along(pts, t); return nearestWalkable(M, p.x + 0.5 + p.nx * side * off, p.y + 0.5 + p.ny * side * off); };
    return { R, pier, pierV, flagGate, thing, offRoute };
  };
  const { pierV, thing, offRoute, pier } = outils(W);
  // le passeur du Cap Mirage et le ponton de Port-Granit : le seul bateau qui franchit les tourbillons de l'archipel
  // (5 badges : on y vient d'abord à pied, par Mirage ; le bateau de l'Embarcadère n'y mène pas plus tôt)
  pierV('cap', 'Cap Mirage', CAP.x + 12, CAP.y + 7, 1, 2, 5, { town: 'Cap Mirage' });
  pierV('granit', 'Île de Granit (Port-Granit)', quaiGranit[0], quaiGranit[1] - 1, -1, 1, 5, { town: 'Port-Granit' });

  // Bois Murmure : l'autel de Celebi (la Balle GS vient d'une vieille dame de Sylvebourg)
  { const [sx, sy] = offRoute(bois, 0.5, 1, 5); thing('statue', sx, sy, { type: 'shrine' });
    const [cx, cy] = nearestWalkable(W, sx, sy + 1, new Set([sx + ',' + sy]));
    legend({ id: 'celebi', sp: 251, lvl: 20, x: cx, y: cy, cond: 'celebi', intro: ['La Balle GS se met à trembler...', 'Une petite créature verte surgit d\'entre les feuilles : Celebi !'] }); }

  // Embarcadère de l'Aube : un sentier part de la route 1 vers la baie
  { const p = along(r1, 0.55), y = Math.round(p.y); let x = Math.round(p.x) + 3;
    while (x < 240 && W.get(x, y) !== T.WATER) { W.rect(x, y - 2, x, y + 2, T.GRASS, [T.TREE, T.TALL, T.PINE]); W.set(x, y, T.PATH); x++; }
    W.sign(x - 4, y - 1, 'EMBARCADÈRE DE L\'AUBE\nBateau pour les îles de l\'Est.\nÎle Orageuse : 2 badges · Île de la Grue : 3 badges · Île Givrée : 5 badges');
    pier('aube', 'Embarcadère de l\'Aube', x, y, 1, 4, 0);
    W.zone(x - 14, y - 8, x + 6, y + 8, { name: 'Embarcadère de l\'Aube', music: 'port' }); }

  atelier(ctxA, [338, 150, 439, 250], 640, 410, (W) => {
    const { R, pier, flagGate, thing, offRoute } = outils(W);
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
    legend({ id: 'raikou', sp: 243, lvl: 40, ...xy(offRoute(so, 0.55, 1, 2)), cond: 'beasts', intro: ['Un rugissement fait trembler l\'herbe...', 'C\'est Raikou, la bête du tonnerre, échappée de la Tour Cendrée !'] });
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
  }, { fond: T.WATER });

  atelier(ctxA, [338, 66, 439, 149], 640, 234, (W) => {
    const { R, pier, flagGate, thing, offRoute } = outils(W);
    /* ---------- Île de la Grue (3 badges) : Hautegrue et son jardin, Sulfura, Entei ---------- */
    // (la tour des Sages et Ho-Oh, la Tour Dorée qu'on appelait Tour de la Grue, se dresse sur le continent, dans la Forêt
    // des Torii, à côté de la Tour Cendrée : world/tourdoree.js)
    tCount += 5;   // les numéros de ses cinq dresseurs (gardés là-bas) : les dresseurs suivants gardent leur identifiant
    W.rect(350, 72, 434, 148, T.TREE);
    const G2 = towns.Q = {
      id: 'grue', name: 'Hautegrue', x: 354, y: 112, w: 34, h: 30, exits: [['w', 12], ['e', 12], ['n', 16]], stock: 4, music: 'mystic', fermer: true,
      roads: [[0, 12, 33, 13, T.PATH], [16, 0, 17, 27, T.PATH], [18, 27, 31, 27, T.PATH], [27, 20, 27, 26, T.PATH]],
      deco: [['lamp', 15, 11], ['lamp', 18, 11], ['flowers', 3, 20, 8, 23], ['water', 8, 25, 2.6, 1.6], ['trees', 2, 2, 4, 4, T.PINE],
        // le Jardin de la Grue, là où les Sages venaient méditer : gravier ratissé, étang, maison de thé, lanternes
        ['sand', 20, 15, 23, 19], ['rocher_grand', 21, 16], ['butte', 22, 18], ['water', 22, 23, 2.6, 1.5],
        ['flowers', 19, 21, 19, 25], ['flowers', 30, 15, 31, 19], ['flowers', 29, 21, 31, 25],
        ['lanterne', 24, 20], ['lanterne', 30, 20], ['lanterne', 26, 26], ['lanterne', 28, 26], ['erable', 31, 14], ['cerisier', 19, 14], ['arbre_automne', 31, 23],
        ['sign', 14, 14, 'HAUTEGRUE\nLe village de la Grue de bois.'], ['sign', 19, 26, 'JARDIN DE LA GRUE\nLes Sages de la Tour Dorée y venaient méditer.\nLeur tour se dresse sur le continent, dans la Forêt des Torii.']],
      buildings: [
        { kind: 'center', ...GRAND.center, x: 3, y: 4, mapId: 'grue:center5' }, { kind: 'mart', ...GRAND.mart, x: 11, y: 4, mapId: 'grue:mart10' },
        { kind: 'house', w: 5, d: 5, h: 3, door: 2, modele: 'maisonThe', x: 25, y: 15, roof: 'gray', id: 'the', name: 'Maison de thé', npcs: [{ x: 4, y: 4, sprite: 'dame', text: ['Une tasse de thé ? Les Sages s\'arrêtaient toujours ici avant de prendre le bateau.', 'Leur tour dorée est sur le continent, dans la Forêt des Torii, au sud-ouest de Mirage.', 'Tout près de la Tour Cendrée, sa sœur brûlée.'] }] },
        { kind: 'house', x: 4, y: 16, roof: 'brown', id: 'doyenne', name: 'Maison de la Doyenne', npcs: [{ id: 'doyenne', x: 4, y: 4, sprite: 'vieil_homme', script: 'doyenne' }] },
        { kind: 'house', x: 22, y: 4, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Il y a longtemps, trois créatures ont péri dans l\'incendie d\'une tour : la Tour Cendrée,', 'la sœur de la Tour Dorée. Les deux tours se dressent côte à côte dans la Forêt des Torii, sur le continent.', 'On raconte que Ho-Oh a ramené les trois créatures à la vie : Raikou, Entei et Suicune.'] }] },
        { kind: 'house', x: 10, y: 17, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'montagnard', text: ['À l\'est, le chemin du Mont Brasier est barré par des arbustes.', 'Avec Coupe, tu pourrais aller voir le cratère... on dit qu\'un oiseau de feu y niche.'] }] },
      ],
      npcs: [{ id: 'enfant', x: 12, y: 15, sprite: 'enfant', move: 'wander', text: ['Mamie dit que la Tour Dorée, sur le continent, touche presque les nuages !', 'Avant, on l\'appelait la Tour de la Grue, comme notre village.'] }],
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
  }, { fond: T.WATER });

  atelier(ctxA, [336, 0, 439, 66], 640, 40, (W) => {
    const { R, pier, flagGate, thing, offRoute } = outils(W);
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
        { kind: 'house', x: 3, y: 12, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Sous l\'île, la mer creuse des grottes immenses.', 'Les tourbillons y sont si forts que personne n\'en revient... sauf ceux que Lugia laisse passer.', 'Ma grand-mère disait que Lugia et Ho-Oh étaient autrefois amis. Depuis l\'incendie de la vieille tour, chacun garde son île.'] }] },
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
    montGivre({ W, trainerNpc, ENC });   // le Mont Givré, au nord du Rivage Gelé (world/montagnes.js)
  }, { fond: T.WATER });


  // mer de l'Est : rencontres en surfant
  W.zone(938, 0, 1199, 815, { name: 'Mer de l\'Est', music: 'route2', enc: ENC.est, sea: true, prio: -1 });

  // pas d'herbes hautes débordant des routes dans les villes (sauf celles prévues par la ville)
  for (const t of Object.values(towns)) {
    const keep = (t.deco || []).filter((d) => d[0] === 'tall').map(([, x0, y0, x1, y1]) => [t.x + x0, t.y + y0, t.x + x1, t.y + y1]);
    const v = t.ville || t;
    for (let y = v.y; y < v.y + v.h; y++) for (let x = v.x; x < v.x + v.w; x++) {
      const q = W.get(x, y); if (q !== T.TALL && q !== T.DARKTALL) continue;
      if (keep.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
      W.set(x, y, t.ground ?? T.GRASS);
    }
  }
  // les villes passent devant les routes dans la recherche de zone, la mer passe derrière tout
  const townZones = W.zones.filter((z) => z.town || z.trigger), seaZones = W.zones.filter((z) => z.sea), routeZones = W.zones.filter((z) => !z.town && !z.trigger && !z.sea);
  W.zones = [...seaZones, ...routeZones, ...townZones];

  /* ======================== GROTTES ======================== */
  // Grotte Lunaire : entre la route 3 ouest et est ; le Mont Lunaire, la montagne que la grotte traverse (la roche remplace
  // la forêt), et son sentier qui grimpe au sommet (world/montagnes.js, posé par l'atelier à son ancienne place décalée)
  massif(W, polygone([[149, 14], [171, 12], [182, 19], [180, 30], [175, 37.5], [167, 45], [160, 50], [153, 45], [147, 37.5], [143, 26]].map(([x, y]) => [x + LX, y + LY])));
  W.zone(143 + LX, 12 + LY, 182 + LX, 37 + LY, { name: 'Mont Lunaire', music: 'route', prio: 0 });
  atelier(ctxA, LUNAIRE.zone, LX, LY, (S) => montLunaire({ W: S, trainerNpc }), { copier: true });
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

  // Grotte Victoire : des rochers fissurés en barrent les galeries (Éclate-Roc)
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

  /* ======================== TERRES DU SUD ======================== */
  buildSud({ W, maps, towns, routes, G2, routeTrainer, routeItem, buildTown, poserBatiment, ENC, ledges, PONT });
  // ceintures de tourbillons : l'archipel des trois frères et les îles de l'Est ne s'atteignent qu'en bateau
  tourbillons(W, [
    [[938, 0], [938, 812]], [[938, 812], [1199, 812]],                                  // îles de l'Est
    [[476, 562], [735, 562]], [[476, 562], [476, 805]], [[476, 805], [938, 805]],         // archipel : nord, ouest, sud
    [[735, 552], [735, 640]], [[735, 640], [815, 640]], [[815, 566], [815, 640]], [[815, 566], [938, 566]],   // autour de l'Îlot des Marées
  ], 1.0, 2026);

  /* ======================== LA CHAÎNE CÉLESTE ======================== */
  chaine(W, towns);
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
    ...GYM_TRAINERS_SUD,
  ];
  // quatrième dresseur des arènes qui n'en avaient que deux ou trois
  const GYM_EXTRA = [
    ['Gamin', 'Théodore', [[1017, 10]]], ['Pêcheur', 'Gilles', [[1029, 18]]], ['Scientifique', 'Volt', [[1034, 24]]], ['Fillette', 'Capucine', [[1021, 29]]],
    ['Médium', 'Isaure', [[1039, 34]]], ['Montagnard', 'Roch', [[1026, 39]]], ['Karatéka', 'Kazuo', [[1041, 44]]], ['Topdresseur', 'Siegfried', [[1049, 48]]],
  ];
  for (const t of Object.values(towns)) {
    if (t.gym == null) continue;
    const g = t.gymMap, L2 = LEADERS[t.gym], ar = t.gymArena;
    g.npc({ id: g.id + ':guide', x: ar.guide[0], y: ar.guide[1], sprite: 'habitant', dir: 'left', script: 'gymguide', gym: t.gym });
    // les dresseurs se tiennent à côté du parcours de l'énigme, tournés vers lui : ils ne bloquent jamais le passage
    const spots = ar.spots;
    // arène Feu : des gardiens du savoir posent une question avant de s'écarter
    ar.quiz.forEach(([x, y], k) => g.npc({ id: `${g.id}:savoir${k}`, x, y, sprite: 'scientifique', dir: 'down', script: 'savoir', quiz: k + t.gym, hideIf: `QZ:${g.id}:savoir${k}` }));
    // quatre dresseurs par arène ; chacun garde ses Pokémon et en ajoute un ou deux du type de l'arène, pris dans
    // les six générations (un Pokémon différent d'une arène à l'autre, toujours le même pour une arène donnée)
    const list = gymTrainers[t.gym].slice();
    const extra = GYM_EXTRA[t.gym]; if (list.length < 4 && extra) list.push(extra);
    list.forEach(([cls, name, team], i) => {
      const lvl = Math.max(...team.map((m) => m[1]));
      const more = equipeDeType(L2.type, lvl, team.length >= 3 ? 1 : 2, t.gym * 31 + i * 7 + 3).filter(([sp]) => !team.some((m) => m[0] === sp));
      const [x, y, dir] = spots[i]; trainerNpc(g, x, y, dir, cls, name, team.concat(more).slice(0, 4), { sight: 3, intro: 'Tu veux défier notre Champion ? Passe d\'abord par moi !', after: 'Notre Champion est bien plus fort que moi.' });
    });
    const fem = L2.fem || ['Marine', 'Volta', 'Flora', 'Sibylle'].includes(L2.name);
    g.npc({ id: g.id + ':leader', x: ar.leader[0], y: ar.leader[1], dir: 'down', sprite: L2.ow, leader: t.gym, trainer: { cls: fem ? 'Championne' : 'Champion', name: L2.name, team: L2.team, prize: 100, bs: L2.ow, ai: 'smart', items: { 'potion': t.gym === 0 ? 1 : 0, 'super-potion': (t.gym < 3 ? 2 : 0), 'hyper-potion': (t.gym >= 3 ? 2 : 0), 'full-restore': (t.gym >= 6 ? 2 : (t.gym >= 4 ? 1 : 0)) }, intro: L2.intro, lose: L2.lose, sight: 0 } });
  }
  // Ligue : la Maître
  const league = maps['plateau:ligue'];
  league.npc({ id: 'champion', x: 7, y: 3, dir: 'down', sprite: CHAMPION.ow, champion: true, trainer: { cls: 'Maître', name: CHAMPION.name, team: CHAMPION.team, prize: 200, bs: CHAMPION.ow, ai: 'smart', items: { 'full-restore': 3 }, intro: CHAMPION.intro, lose: CHAMPION.lose, sight: 0 } });
  league.npc({ id: 'ligue-garde', x: 5, y: 15, sprite: 'garde', dir: 'right', text: ['Bienvenue à la Ligue Céleste.', 'La Maître t\'attend au bout du tapis. Bonne chance !'] });

  // Labo : professeur, assistant
  const lab = maps['aube:labo'];
  lab.npc({ id: 'prof', x: 6, y: 3, sprite: 'saule', dir: 'down', script: 'prof' });
  lab.npc({ id: 'assistant', x: 10, y: 7, sprite: 'scientifique', move: 'wander', text: ['Le professeur étudie le lien entre les dresseurs et leurs créatures.', 'Il dit que c\'est en voyageant qu\'on le comprend le mieux.'] });
  STARTERS.forEach((sp, i) => lab.object(5 + i, 5, { type: 'starter', sp, cap: i }));

  // histoire secondaire : la Brume, les nouveaux lieux (lac, forêt des torii, jardin, île du Magma) et leurs quêtes
  const quests = buildQuests({ W, maps, towns, routes, legends, docks, buildTown, trainerNpc, offRoute: (id, t, side, off) => offRoute(routes.find((r) => r.id === id).pts, t, side, off),
    decalTorii: [TORII.dx, TORII.dy], atelierTorii: (f) => atelier(ctxA, TORII.zone, TORII.dx, TORII.dy, f) });
  // histoire principale : la Team Éclipse, Lugia Obscur, le Conseil 4, Flash et Force, les quêtes annexes
  addStory({ W, maps, towns, routes: { r1, r2, bois, r3a, r3b, r4, r5, r6, r7, r10 }, legends, trainerNpc, ilot: [765, 596] });
  // la vie des villes : les requêtes des habitants (et les deux combats d'après la Ligue)
  addHabitants({ W, maps, towns, routes });
  // quêtes du vélo (Voltacité) et du permis bateau (Port-Azur)
  addVehicules({ W, maps, towns });
  // la mine de Pierrefort (trois niveaux, un fossile au fond)
  addMine({ W, maps, towns, trainerNpc, ENC });
  { const tz = W.zones.filter((z) => z.town || z.trigger), sz = W.zones.filter((z) => z.sea), rz = W.zones.filter((z) => !z.town && !z.trigger && !z.sea); W.zones = [...sz, ...rz, ...tz]; }
  // les grandes villes perchées : on y monte par des escaliers à chaque porte
  for (const [k, t] of Object.entries(towns)) if (VILLES[k]?.releve) relever(W, t);
  // petites barrières de bois le long des chemins des routes (jamais là où elles couperaient un passage)
  fenceRoutes(W, legends);
  // retouches faites dans l'éditeur de la version test et intégrées au jeu (world/retouches.js)
  applyRetouches(maps);
  // cartes disparues (lieux désormais posés sur la carte du monde) : une ancienne partie qui y était reprend ici
  const moved = { torii: { map: 'monde', x: 222 + TORII.dx, y: 193 + TORII.dy, dir: 'up' } };
  if (W.anciensObjets.length) throw new Error('anciens objets jamais posés : ' + W.anciensObjets.map((q) => q.join(' ')).join(', '));
  return { maps, towns, routes, legends, docks, quests, moved, start: { map: 'aube:maison', x: 4, y: 6, dir: 'up' }, carte: CARTE_VERSION };
}


/* ======================================================================
   La grande région : terres et mers, reliefs, outils de pose
   ====================================================================== */
/** mers, côtes (bord ondulé), baie de l'Embarcadère, îles de l'archipel */
function terres(W) {
  const bord = (x, y) => Math.sin(x * 0.045 + y * 0.013) * 4 + Math.sin(x * 0.11 - y * 0.07) * 2.5 + Math.sin(y * 0.09 + x * 0.031) * 3;
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
    const b = bord(x, y);
    let mer = false;
    if (x >= 380 && x < 940 && y < 20 + b) mer = true;                       // mer du Nord, devant Port-Azur
    if (x >= 932 + b && y < 812) mer = true;                                  // mer de l'Est (les îles du bateau)
    if (x >= 462 + b && y >= 551 + b * 0.5 && y < 812) mer = true;            // la mer de l'archipel
    if (y >= 692 + b && y < 812 + b * 0.4) mer = true;                        // le détroit, entre le continent et le Sud
    if (x >= 1154 + b && y >= 800) mer = true;                                 // côte est des Terres du Sud
    if (y >= 1366 + b * 0.5) mer = true;                                       // mer du Sud
    if (mer) W.set(x, y, T.WATER);
  }
  // la baie de l'Embarcadère de l'Aube (à droite de la route 1) et son chenal vers le détroit
  W.blob(132, 488, 24, 30, T.WATER, rng(2024)); W.rect(146, 500, 149, 700, T.WATER);
  // l'archipel : la Grande Île (Fort-Écaille), Cendrelune (le volcan), l'Île de Granit
  const ile = (x0, y0, x1, y1, g) => {
    const r = 26;
    for (let y = y0 - 4; y <= y1 + 4; y++) for (let x = x0 - 4; x <= x1 + 4; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
      const n = Math.sin(x * 0.21 + g) * 1.6 + Math.sin(y * 0.17 - g) * 1.6;
      if (Math.hypot(dx, dy) <= r + n) W.set(x, y, T.TREE);
    }
  };
  ile(494, 568, 676, 796, 1); ile(684, 650, 812, 792, 2); ile(806, 578, 934, 712, 3);
}

/** les blocs libres d'un territoire, à côté du tracé d'une route (pour y poser des lieux faits main) : { f, t, i } */
function blocsLibres(res, terr) {
  const S = new Set(); for (const [c0, r0, c1, r1] of terr) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) S.add(c + ',' + r);
  const pris = new Set(res.chemin.map((b) => b.join(','))), out = [];
  for (const k of res.cotes || []) pris.add(k.b.join(','));
  res.chemin.forEach((b, i) => { if (i === 0 || i === res.chemin.length - 1) return; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const f = [b[0] + dx, b[1] + dy], k = f.join(','); if (S.has(k) && !pris.has(k)) { pris.add(k); out.push({ f, t: res.tBloc[i], i }); } } });
  return out;
}

/** tertre à côté d'une route : une butte d'herbe un niveau plus haut, où l'on monte par un escalier taillé ; un objet au
 *  sommet (posé sans identifiant : il reprend celui d'avant, anciens-objets.js) */
function tertre(W, pts, t, item, qty) {
  for (const t2 of [t, t - 0.08, t + 0.08, t - 0.16, t + 0.16]) for (const side of [1, -1]) {
    const p = along(pts, t2), cx = Math.round(p.x + p.nx * side * 9), cy = Math.round(p.y + p.ny * side * 9);
    const disque = []; let ok = true;
    for (let y = cy - 5; y <= cy + 5 && ok; y++) for (let x = cx - 5; x <= cx + 5; x++) {
      if (Math.hypot(x - cx, y - cy) > 4.6) continue;
      const q = W.get(x, y); if (![T.TREE, T.PINE, T.GRASS, T.TALL, T.FLOWER].includes(q) || W.npcs.some((n) => n.x === x && n.y === y)) { ok = false; break; }
      disque.push([x, y]);
    }
    if (!ok) continue;
    const h = W.height(Math.round(p.x), Math.round(p.y));
    for (const [x, y] of disque) { W.set(x, y, T.GRASS); W.setHeight(x, y, h); }
    // le sentier qui y monte
    let x = Math.round(p.x), y = Math.round(p.y);
    while (x !== cx || y !== cy) { if (Math.abs(cx - x) > Math.abs(cy - y)) x += Math.sign(cx - x); else y += Math.sign(cy - y); if (![T.PATH, T.PAVE].includes(W.get(x, y))) { W.set(x, y, T.PATH); W.setHeight(x, y, h); } }
    plateau(W, disque, h + 1);
    W.item(cx, cy, item, qty);
    for (const [a, b] of [[-3, -1], [3, -2]]) if (W.get(cx + a, cy + b) === T.GRASS) W.prop('rocher_grand', cx + a, cy + b);
    return true;
  }
  W.item(...nearestWalkable(W, along(pts, t).x, along(pts, t).y), item, qty);
  return false;
}

/** la Chaîne Céleste : tout ce qui reste de forêt dans ses blocs devient roche, en gradins ; près des sentiers perchés (la
 *  Route Victoire qui grimpe, le haut plateau de la Ligue), la roche les domine toujours ; le Plateau Céleste et la Route
 *  Céleste sont posés au niveau 4 */
function chaine(W, towns) {
  const J = towns.J?.ville;
  if (J) for (let y = J.y; y < J.y + J.h; y++) for (let x = J.x; x < J.x + J.w; x++) W.setHeight(x, y, 4);
  // bruit lisse (somme de sinus) : le contour de la chaîne, ses vallées, ses sommets
  const n = (x, y, s, g) => (Math.sin(x / s + g) + Math.sin(y / (s * 1.3) - g * 0.7) + Math.sin((x + y) / (s * 0.8) + g * 1.9)) / 3;
  const dedans = (x, y) => CHAINE.some(([c0, r0, c1, r1]) => x >= c0 * BLOC && y >= r0 * BLOC && x < (c1 + 1) * BLOC && y < (r1 + 1) * BLOC);
  const auBord = (x, y) => Math.min(...CHAINE.filter(([c0, r0, c1, r1]) => x >= c0 * BLOC && y >= r0 * BLOC && x < (c1 + 1) * BLOC && y < (r1 + 1) * BLOC)
    .map(([c0, r0, c1, r1]) => Math.min(x - c0 * BLOC, y - r0 * BLOC, (c1 + 1) * BLOC - 1 - x, (r1 + 1) * BLOC - 1 - y)));
  const cells = [], pins = [];
  for (const [c0, r0, c1, r1] of CHAINE) for (let y = r0 * BLOC; y < (r1 + 1) * BLOC; y++) for (let x = c0 * BLOC; x < (c1 + 1) * BLOC; x++) {
    const t = W.get(x, y); if (!(t === T.TREE || t === T.PINE) || (W.monts && W.monts[y * W.w + x])) continue;
    // le pied de la chaîne : la forêt monte à l'assaut des pentes, en dents de scie (jamais un bord droit)
    const d = auBord(x, y), lisiere = 4 + 26 * Math.max(0, (n(x, y, 26, 1.3) + 0.5) / 1.5) + 4 * (n(x, y, 7, 3.1) + 1) / 2;
    if (d < lisiere) { if (r2(x, y) < 0.5) W.set(x, y, T.PINE); continue; }
    // vallées de pins (en creux), le reste est roche
    if (n(x, y, 22, 4.1) < -0.38) { W.set(x, y, T.PINE); pins.push([x, y]); continue; }
    cells.push([x, y]);
  }
  massif(W, cells, { pas: 3, max: 3 });
  // les sommets : la roche s'élève en crêtes loin des sentiers
  for (const [x, y] of cells) { if (!dedans(x, y)) continue; const crete = Math.max(0, Math.round((n(x, y, 30, 2.2) + 0.2) * 4)); if (crete) W.setHeight(x, y, W.height(x, y) + crete); }
  rochesHautes(W, cells);
  // des lacs d'altitude au creux des vallées
  const R0 = rng(4141);
  for (let k = 0, fait = 0; k < 200 && fait < 6; k++) {
    const [x, y] = pins[Math.floor(R0() * pins.length)] || []; if (x == null) break;
    let ok = true; for (let j = -9; j <= 9 && ok; j++) for (let i = -13; i <= 13; i++) if (W.get(x + i, y + j) !== T.PINE) { ok = false; break; }
    if (!ok) continue;
    W.blob(x, y, 7 + R0() * 4, 4 + R0() * 3, T.WATER, R0, [T.PINE]); fait++;
  }
  W.zones.unshift({ x0: CHAINE[0][0] * BLOC, y0: CHAINE[0][1] * BLOC, x1: (CHAINE[0][2] + 1) * BLOC - 1, y1: (CHAINE[0][3] + 1) * BLOC - 1, name: 'Chaîne Céleste', music: 'route', prio: -1 });
}
/** hasard fixe d'une case (0..1) */
function r2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** la roche qui borde un sol perché le dépasse toujours : un gradin de plus que le sol, puis un tous les deux pas */
function rochesHautes(W, cells) {
  const S = new Set(cells.map(([x, y]) => x + ',' + y)), q = [], base = new Map(), dist = new Map();
  for (const [x, y] of cells) {
    let b = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = W.get(x + dx, y + dy); if (walkable(t) || t === T.WATER) b = Math.max(b, W.height(x + dx, y + dy)); }
    if (b > 0) { base.set(x + ',' + y, b); dist.set(x + ',' + y, 0); q.push([x, y]); }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i], k = x + ',' + y, d = dist.get(k), b = base.get(k);
    W.setHeight(x, y, Math.max(W.height(x, y), b + 1 + Math.floor(d / 2)));
    if (d >= 6) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (x + dx) + ',' + (y + dy); if (S.has(kk) && !dist.has(kk)) { dist.set(kk, d + 1); base.set(kk, b); q.push([x + dx, y + dy]); } }
  }
}
/** une grande ville perchée (bitume) : toute la ville un niveau plus haut, falaise de roche au sud, escaliers à chaque porte.
 *  (Comme plateau(…, { roche: true }) de relief.js, en grilles : la ville entière compte des dizaines de milliers de cases) */
function relever(W, t) {
  const v = t.ville; if (!v) return;
  const X = v.x, Y = v.y, X1 = v.x + v.w - 1, Y1 = v.y + v.h - 1;
  const CHEMIN = (q) => q === T.PATH || q === T.PAVE || q === T.STAIRS;
  const PROT = (q) => q === T.BUILD || q === T.DOOR || q === T.BRIDGE || q === T.CAVEDOOR || q === T.SIGN || q === T.MAT;
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) { W.setHeight(x, y, 1); if (W.pentes) W.pentes[y * W.w + x] = 0; }
  // la paroi sous le bord sud ; des marches là où une rue franchit le bord
  for (let x = X; x <= X1; x++) {
    const q = W.get(x, Y1 + 1); if (!W.in(x, Y1 + 1) || PROT(q) || W.height(x, Y1 + 1) >= 1) continue;
    W.set(x, Y1 + 1, T.CLIFF); W.setHeight(x, Y1 + 1, 0);
    if (CHEMIN(W.get(x, Y1)) && (CHEMIN(W.get(x, Y1 + 2)) || CHEMIN(q))) { W.set(x, Y1 + 1, T.STAIRS); if (!CHEMIN(W.get(x, Y1 + 2)) && W.get(x, Y1 + 2) !== T.WATER) W.set(x, Y1 + 2, T.PATH); }
  }
  // bords nord, est et ouest : la case du bord devient une marche quand la route continue plus bas
  const bord = (x, y, dx, dy) => { if (CHEMIN(W.get(x, y)) && W.get(x, y) !== T.STAIRS && W.height(x + dx, y + dy) === 0 && CHEMIN(W.get(x + dx, y + dy))) W.set(x, y, T.STAIRS); };
  for (let x = X; x <= X1; x++) bord(x, Y, 0, -1);
  for (let y = Y; y <= Y1; y++) { bord(X, y, -1, 0); bord(X1, y, 1, 0); }
}

/** barrières de bois brunes le long des chemins des routes, par tronçons, comme sur DS. Une case ne reçoit une barrière
 *  que si ses voisins praticables restent reliés entre eux sans elle (aucun passage coupé, aucun recoin isolé) ; jamais
 *  devant une porte, un panneau, un PNJ, un objet ou dans le champ de vision d'un dresseur. */
function fenceRoutes(W, legends = []) {
  const busy = new Set();
  for (const l of legends) if (l.map === 'monde') for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) busy.add((l.x + i) + ',' + (l.y + j));
  for (const n of W.npcs) {
    busy.add(n.x + ',' + n.y);
    const sight = n.trainer?.sight || 0, [dx, dy] = DIRS[n.dir] || [0, 0];
    for (let k = 1; k <= sight + 1; k++) busy.add((n.x + dx * k) + ',' + (n.y + dy * k));
  }
  for (const it of W.items) busy.add(it.x + ',' + it.y);
  for (const k of W.warps.keys()) busy.add(k);
  for (const k of W.signs.keys()) busy.add(k);
  const free = (x, y) => walkable(W.get(x, y));
  const simple = (x, y) => {
    // les voisins praticables (4 directions) restent-ils reliés par le carré 3 × 3 privé de la case ?
    const ring = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && free(x + i, y + j)) ring.push(i + ',' + j);
    const four = ['0,-1', '1,0', '0,1', '-1,0'].filter((k) => ring.includes(k));
    if (four.length <= 1) return four.length === 1;
    const seen = new Set([four[0]]), q = [four[0]];
    while (q.length) {
      const [i, j] = q.pop().split(',').map(Number);
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const k = a + ',' + b; if ((a || b) && Math.abs(a) <= 1 && Math.abs(b) <= 1 && ring.includes(k) && !seen.has(k)) { seen.add(k); q.push(k); } }
    }
    return four.every((k) => seen.has(k));
  };
  let run = 0; const sensBarr = new Map();
  for (let y = 1; y < W.h - 1; y++) for (let x = 1; x < W.w - 1; x++) {
    if (W.get(x, y) !== T.GRASS || busy.has(x + ',' + y)) { run = 0; continue; }
    const z = W.zoneAt(x, y); if (!z || z.town || z.sea || z.trigger) { run = 0; continue; }
    // le long d'un chemin horizontal (au-dessus ou au-dessous) ou vertical (à gauche ou à droite)
    const along = (W.get(x, y - 1) === T.PATH || W.get(x, y + 1) === T.PATH) && W.get(x - 1, y) !== T.PATH && W.get(x + 1, y) !== T.PATH;
    const alongV = (W.get(x - 1, y) === T.PATH || W.get(x + 1, y) === T.PATH) && W.get(x, y - 1) !== T.PATH && W.get(x, y + 1) !== T.PATH;
    // seulement le long des chemins horizontaux : de face, une barrière verticale ne serait qu'un piquet
    if (!along) { run = 0; continue; }
    // tronçons : environ un mètre de barrière sur trois, choisis par blocs de 6 cases
    const blk = rng(((x / 6) | 0) * 7349 + ((y / 6) | 0) * 1931 + 11)();
    if (blk > 0.33) { run = 0; continue; }
    if (!simple(x, y)) { run = 0; continue; }
    // pas contre les hautes herbes ni les rebords, et deux barrières ne se croisent jamais (une seule direction par tronçon)
    const sens = along ? 'h' : 'v';
    let gene = false;
    for (let j = -1; j <= 1 && !gene; j++) for (let i = -1; i <= 1; i++) {
      const t = W.get(x + i, y + j);
      if (isGrassEnc(t) || t === T.LEDGE || t === T.LEDGE_E || t === T.LEDGE_W) { gene = true; break; }
      if (t === T.FENCE && sensBarr.get((x + i) + ',' + (y + j)) !== sens) { gene = true; break; }
    }
    if (gene) { run = 0; continue; }
    W.set(x, y, T.FENCE); sensBarr.set(x + ',' + y, sens); run++;
  }
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
