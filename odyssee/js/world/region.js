// odyssee/js/world/region.js — la région d'Odyssée : le continent (cinq arènes, la Ligue) et, au sud-est, l'archipel
// des trois frères (Basalte, Pyros et Drakos), au-delà des tourbillons : on y va avec le passeur du Cap Mirage. Les quatre premières arènes se suivent dans
// l'ordre (des gardes bloquent la route) ; ensuite, ce sont les capacités de terrain qui ouvrent de nouvelles zones :
// Coupe (badge 4) vers Mirage, le bateau du Cap Mirage vers l'archipel (5 badges), Éclate-Roc (badge 6) sur la Grande Île,
// Vol (badge 7). Une ceinture de tourbillons entoure l'archipel et les îles de l'Est : on ne les atteint pas à la nage.
// À l'est, trois îles desservies par le bateau de l'Embarcadère de l'Aube (2, 3 et 5 badges), avec les quêtes des
// légendaires (renvoyées dans `legends`, les quais dans `docks`).
// Noms de lieux et personnages originaux ; les créatures du jeu côtoient les Pokémon du prototype.
import { memoCases } from './cache-monde.js';
import { poserBiomes } from './biomes.js';
import { decorerRoutes, reserver } from './decors-routes.js';
import { tracerRoutes } from './traces.js';
import { T, DIRS, walkable, isGrassEnc } from './tiles.js';
import { GameMap, carveRoute, carveTown, ledges, along, nearestWalkable, caseLibre, rng, GRAND, sin, cos, hauteurVue } from './mapgen.js';
import { centerInterior, martInterior, houseInterior, labInterior, gymInterior, leagueInterior, dojoInterior, caveMap, centraleInterior, tourMirageInterior, museeInterior, caserneInterior } from './interiors.js';
import { NEW_STARTERS } from '../data/creatures.js';
import { R } from '../data/remplacants.js';
import { buildQuests } from './quetes.js';
import { addStory } from './story.js';
import { enrichirTout, equipeDeType, poserTroncons, restaurerTables } from './rencontres.js';
import { addHabitants, indexMissionTrainers } from './habitants.js';
import { applyRetouches } from './retouches.js';
import { poserDonjons } from '../donjons/index.js';
import { redresserPonts } from './ponts.js';
import { rangs, mers, tourbillonsDuBord, rendreALaForet, degager, oterDecorIsole } from './acces.js';
import { appliquerBareme } from './bareme.js';
import { poserCT } from './cts.js';
import { poserLegendairesApresLigue, poserTourDeCombat } from './apres-ligue.js';
import { buildArena } from './arenes.js';
import { construireArene } from './arenes-plan.js';
import { PLANS } from './arenes-plans.js';
import { areneSylve } from './arene-sylve.js';
import { buildSud, BADGES_SUD, LEADERS_SUD, GYM_TRAINERS_SUD } from './sud.js';
import { addVehicules } from './vehicules.js';
import { addMine } from './mine.js';
import { tourbillons, plateau, polygone, rectangle, sinueuse, boucher, massif, bande } from './relief.js';
import { montLunaire, montGivre } from './montagnes.js';
import { LARGEUR, HAUTEUR, BLOC, VILLES, TERR, TORII, LUNAIRE, CHAINE, porte, arrivee } from './plan.js';
import { grandeVille, bruit } from './quartiers.js';
import { grandeRoute, boucherLocal } from './chemins.js';
import { atelier } from './atelier.js';
import { lieux, faconnerImpasses, panneauxDesLieux } from './lieux.js';
import { ecrans } from './ecrans.js';
import { rythme, cachettesDesVilles } from './rythme.js';
import { grotteDuCol, grotteDansFalaise } from './grottes.js';
import { volcan } from './volcan.js';
import { contreforts, plateauNaturel } from './contreforts.js';
import { canyonsDOcre } from './ocre.js';
import { addFauneVilles, addVieRoutes, addMarches, addFouilles, addVoisinage, addFetes } from './faune.js';
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
// au labo, trois capsules, une par type ; dans chacune, trois partenaires au choix : celui d'Odyssée, celui de Rouge / Bleu et celui d'Or / Argent
export const STARTER_CHOICES = STARTER_TABLE.map((c) => ({ ...c }));
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
export const STOCK = {
  1: ['poke-ball', 'potion', 'antidote', 'paralyze-heal', 'awakening', 'repel'],
  2: ['poke-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'escape-rope'],
  3: ['poke-ball', 'great-ball', 'potion', 'super-potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'repel', 'super-repel', 'escape-rope'],
  4: ['poke-ball', 'great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'thunder-stone', 'moon-stone'],
  5: ['great-ball', 'super-potion', 'hyper-potion', 'full-heal', 'revive', 'super-repel', 'escape-rope', 'leaf-stone', 'fire-stone', 'water-stone', 'sun-stone', 'dusk-stone', 'dawn-stone', 'shiny-stone', 'ice-stone', 'ether'],
  6: ['great-ball', 'ultra-ball', 'hyper-potion', 'max-potion', 'full-heal', 'revive', 'max-repel', 'escape-rope', 'ether', 'elixir'],
  7: ['ultra-ball', 'hyper-potion', 'max-potion', 'full-restore', 'full-heal', 'revive', 'max-revive', 'max-repel', 'escape-rope', 'elixir', 'max-elixir'],
};
// baies et objets tenus (5.95) : de plus en plus au fil des boutiques ; les objets compétitifs uniques restent en exploration + PCo
{ const TYPE_BOOSTERS = ['charcoal', 'mystic-water', 'miracle-seed', 'magnet', 'never-melt-ice', 'black-belt', 'poison-barb', 'soft-sand', 'sharp-beak', 'twisted-spoon', 'silver-powder', 'hard-stone', 'spell-tag', 'dragon-fang', 'black-glasses', 'metal-coat', 'silk-scarf', 'fairy-feather'];
  const plus = {
    3: ['cheri-berry', 'pecha-berry', 'rawst-berry'],
    4: ['cheri-berry', 'chesto-berry', 'pecha-berry', 'rawst-berry', 'aspear-berry', 'persim-berry', 'muscle-band', 'wise-glasses'],
    5: ['cheri-berry', 'chesto-berry', 'pecha-berry', 'rawst-berry', 'aspear-berry', 'persim-berry', 'occa-berry', 'passho-berry', 'wacan-berry', 'rindo-berry', 'yache-berry', 'shuca-berry',
      'muscle-band', 'wise-glasses', 'quick-claw', 'scope-lens', 'big-root', 'white-herb'],
    6: ['occa-berry', 'passho-berry', 'wacan-berry', 'rindo-berry', 'yache-berry', 'chople-berry', 'shuca-berry', 'coba-berry', 'payapa-berry', 'kasib-berry', 'haban-berry', 'colbur-berry', 'roseli-berry',
      'muscle-band', 'wise-glasses', 'quick-claw', 'scope-lens', 'white-herb', 'kings-rock', 'black-sludge', 'shell-bell', 'heart-scale', ...TYPE_BOOSTERS],
    7: ['liechi-berry', 'ganlon-berry', 'petaya-berry', 'apicot-berry', 'salac-berry', 'muscle-band', 'wise-glasses', 'quick-claw', 'scope-lens', 'white-herb', 'kings-rock', 'black-sludge', 'shell-bell', 'heart-scale', ...TYPE_BOOSTERS],
  };
  for (const [k, L] of Object.entries(plus)) STOCK[k] = STOCK[k].concat(L); }

/* ---------------- rencontres sauvages : [espèce, niveau min, niveau max, poids] ---------------- */
export const ENC = {
  r1: [[1010, 2, 4, 25], [1013, 2, 4, 25], [16, 2, 4, 15], [19, 2, 4, 15], [1017, 2, 3, 12], [161, 2, 4, 8]],
  r2: [[1010, 8, 12, 15], [1013, 8, 11, 15], [1017, 8, 11, 15], [1018, 10, 12, 5], [1034, 9, 12, 10], [1021, 9, 12, 10], [21, 9, 12, 10], [10, 8, 11, 10], [1039, 9, 11, 5], [29, 9, 11, 5]],
  bois: [[1053, 11, 14, 5], [1017, 11, 13, 15], [1018, 12, 14, 8], [1015, 11, 14, 15], [1021, 11, 14, 15], [1020, 12, 14, 8], [1013, 11, 14, 10], [165, 11, 14, 8], [167, 11, 14, 8], [1043, 12, 14, 5], [1038, 13, 14, 3], [46, 11, 14, 5]],
  r3: [[1055, 13, 16, 6], [1026, 13, 16, 15], [1034, 13, 16, 15], [1011, 13, 16, 10], [1014, 14, 16, 5], [21, 13, 16, 15], [27, 13, 16, 10], [56, 13, 16, 10], [66, 13, 16, 10], [1039, 13, 16, 10]],
  grotte: [[1057, 13, 17, 6], [1024, 13, 17, 35], [1028, 14, 17, 15], [1026, 13, 16, 15], [74, 13, 17, 15], [41, 13, 17, 10], [1047, 14, 16, 7], [95, 15, 17, 3]],
  r4: [[1059, 18, 21, 6], [1031, 18, 21, 20], [1029, 18, 21, 15], [1026, 18, 21, 10], [54, 18, 21, 10], [72, 18, 21, 10], [98, 18, 21, 10], [1011, 18, 21, 10], [1037, 18, 21, 8], [179, 18, 21, 7]],
  r5: [[1055, 25, 27, 5], [1034, 24, 27, 12], [1035, 26, 28, 3], [1036, 24, 27, 10], [1037, 24, 27, 10], [100, 24, 27, 10], [81, 24, 27, 10], [1014, 24, 27, 10], [1043, 25, 28, 10], [77, 25, 28, 10], [1015, 24, 27, 10], [58, 25, 28, 5]],
  r6: [[1053, 29, 32, 6], [1021, 29, 31, 10], [1022, 31, 33, 3], [1038, 29, 32, 12], [1039, 29, 31, 10], [1040, 32, 33, 2], [1019, 30, 32, 8], [1020, 29, 32, 10], [43, 29, 31, 10], [69, 29, 31, 10], [114, 30, 33, 8], [123, 31, 33, 3], [127, 31, 33, 2], [1016, 31, 33, 7]],
  r7: [[1011, 34, 37, 10], [1023, 34, 38, 10], [1039, 34, 37, 10], [1043, 35, 38, 10], [1031, 34, 37, 10], [96, 34, 38, 10], [177, 34, 37, 10], [203, 35, 38, 10], [1012, 37, 38, 3], [1029, 34, 37, 10], [216, 34, 37, 7]],
  mer: [[1029, 25, 32, 25], [1031, 25, 32, 20], [1007, 28, 30, 3], [1045, 28, 32, 10], [72, 25, 32, 20], [1033, 30, 33, 7], [120, 26, 32, 10], [1027, 32, 34, 5]],
  granit: [[1060, 36, 38, 3], [1026, 34, 37, 15], [1027, 36, 38, 5], [1028, 34, 38, 15], [1047, 34, 37, 10], [1048, 37, 39, 3], [74, 34, 37, 15], [111, 35, 38, 10], [1045, 34, 37, 10], [1046, 37, 39, 2], [95, 35, 38, 10], [1024, 34, 37, 5], [140, 34, 37, 4], [138, 34, 37, 4], [447, 34, 36, 3]],
  cendre: [[1041, 38, 42, 20], [1042, 41, 43, 5], [1005, 40, 42, 3], [77, 38, 42, 15], [126, 40, 43, 5], [1028, 38, 41, 10], [1043, 38, 42, 12], [1044, 41, 43, 3], [218, 38, 42, 12], [1036, 38, 41, 10]],
  ecaille: [[1058, 43, 46, 3], [1049, 42, 45, 12], [1050, 45, 47, 4], [1044, 43, 46, 10], [1025, 42, 46, 12], [1016, 42, 45, 10], [1012, 43, 46, 8], [1023, 42, 45, 10], [1048, 43, 46, 8], [148, 44, 46, 6], [1040, 43, 46, 8], [1035, 42, 45, 8], [147, 42, 44, 4], [1, 40, 44, 3], [152, 40, 44, 3], [252, 40, 44, 3], [650, 40, 44, 3]],
  r9: [[1012, 68, 72, 15], [1035, 68, 72, 10], [68, 68, 72, 20], [76, 68, 72, 20], [169, 68, 72, 20], [1044, 69, 73, 10], [105, 68, 72, 5], [143, 70, 73, 4], [687, 69, 72, 4]],
  victoire: [[1056, 70, 74, 4], [68, 70, 74, 12], [76, 70, 74, 12], [1028, 70, 74, 12], [1025, 70, 74, 12], [1048, 71, 74, 8], [1050, 71, 74, 6], [208, 71, 75, 8], [169, 70, 74, 12], [105, 70, 74, 8], [1044, 71, 74, 6], [464, 72, 75, 2], [1051, 75, 75, 1]],
  // îles du bateau : un cran au-dessus de l'arène précédente
  orage: [[1034, 20, 24, 15], [1036, 21, 24, 10], [81, 20, 24, 12], [100, 20, 24, 10], [1029, 20, 24, 10], [21, 20, 23, 10], [22, 22, 25, 5], [1031, 20, 24, 10], [179, 20, 23, 10], [180, 24, 26, 3], [1037, 22, 25, 5]],
  grue: [[1054, 30, 32, 3], [1021, 27, 31, 10], [1038, 27, 31, 10], [1039, 27, 30, 10], [1023, 28, 31, 10], [96, 27, 31, 10], [177, 27, 30, 10], [203, 28, 31, 8], [163, 27, 30, 10], [164, 30, 32, 3], [1043, 28, 31, 8], [1015, 27, 30, 8]],
  brasier: [[1041, 28, 32, 20], [1042, 31, 33, 4], [58, 28, 32, 12], [77, 28, 32, 12], [1028, 28, 31, 10], [1026, 28, 31, 10], [126, 30, 33, 4], [74, 28, 31, 10], [4, 30, 33, 3], [155, 30, 33, 3], [255, 30, 33, 3], [498, 30, 33, 3], [653, 30, 33, 3]],
  givre: [[1045, 37, 41, 20], [1046, 40, 42, 4], [86, 37, 41, 12], [220, 37, 41, 12], [221, 40, 42, 4], [225, 37, 41, 10], [215, 38, 41, 10], [124, 39, 42, 5], [1012, 38, 41, 8], [1016, 38, 41, 8]],
  tourbillons: [[1046, 40, 44, 15], [87, 40, 44, 10], [1030, 40, 43, 12], [1032, 40, 43, 12], [1027, 40, 44, 10], [1009, 42, 44, 3], [131, 42, 44, 4], [42, 40, 43, 12], [1025, 40, 43, 10]],
  est: [[1029, 30, 36, 20], [1031, 30, 36, 20], [72, 30, 36, 20], [1033, 32, 36, 10], [1045, 32, 36, 8], [120, 30, 35, 10], [1007, 32, 35, 3], [131, 35, 38, 2], [7, 30, 35, 3], [158, 30, 35, 3], [258, 30, 35, 3], [656, 30, 35, 3], [349, 30, 35, 3]],
  r10: [[1014, 33, 37, 10], [1035, 33, 37, 10], [1037, 33, 37, 10], [1040, 34, 37, 5], [22, 33, 37, 15], [85, 33, 37, 10], [128, 34, 37, 10], [241, 34, 37, 10], [203, 33, 37, 10], [20, 33, 36, 10]],
};
// plus de diversité : chaque zone reçoit aussi tous les Pokémon des lieux équivalents des jeux officiels (Rouge à X / Y)
enrichirTout(ENC);
export const SPAWNS = ENC;

/* ---------------- dresseurs ---------------- */
// classe → apparence sur la carte et portrait en combat, prime de base
const CLS = {
  Gamin: ['gamin', 16], Fillette: ['fillette', 16], Montagnard: ['montagnard', 24], Marin: ['marin', 24],
  Topdresseur: ['topdresseur', 40], Topdresseuse: ['topdresseuse', 40], Scientifique: ['scientifique', 30], Pêcheur: ['pecheur', 20],
  Insectomane: ['insectomane', 16], Jardinière: ['randonneuse', 20], Randonneuse: ['randonneuse', 20], Médium: ['medium', 30], Karatéka: ['karateka', 28],
  'Garde d\'Écaille': ['garde', 36],
  // troisième valeur : portrait en combat quand le personnage n'a pas le sien
  'Sbire de la Brume': ['brume', 32], 'Sbire': ['brume_f', 32], 'Admin de la Brume': ['sylas', 70], 'Chef de la Brume': ['nox', 120], Voleur: ['voleur', 24], Moine: ['pretre', 34, 'pretre'], 'Dame Kimono': ['kimono', 40],
  'Homme d\'affaires': ['topdresseur', 50], 'Femme d\'affaires': ['topdresseuse', 50], Pilote: ['marin', 44], Ninja: ['voleur', 44], Ouvrier: ['montagnard', 40],
  Sage: ['vieil_homme', 32, 'medium'], 'Grand Sage': ['vieil_homme', 60, 'medium'], Skieuse: ['randonneuse', 30], Alpiniste: ['montagnard', 30],
};
export const LEADERS = [
  // Hector : trois Pokémon qui jouent ensemble. Mimigal tisse et ralentit (Sécrétion, Grimace), Couverdure encaisse et endort
  // (Abri, Siffl'Herbe), Bourdonnet frappe vite et puise dans ses Sacoches de Pollen quand il faiblit (talent propre à Odyssée)
  // équipe : [espèce, niveau, objet tenu, attaques, talent]
  { name: 'Hector', type: 'bug', ow: 'hector', team: [
    [167, 12, null, [81, 184, 40, 132]],
    [541, 13, null, [182, 320, 75, 106]],
    [1020, 14, null, [42, 210, 98, 230], 'sacoches-pollen'],
  ], intro: ['Bienvenue dans ma Ruche. Ici, chaque insecte a sa place, et chaque alvéole cache un secret.', 'Tu as su percer les murs de cire... Voyons si tu sais guider tes Pokémon !'], lose: 'Tu as l\'œil vif et la main sûre ! Le Badge Élytre est à toi.' },
  { name: 'Marine', type: 'water', ow: 'marine', team: [[1031, 19], [1029, 19], [120, 20], [1033, 22]], intro: 'La marée monte ! Tu vas te faire emporter par mes Pokémon de l\'océan !', lose: 'Ouah, tu as tenu face à la vague. Voici le Badge Écume !' },
  { name: 'Volta', type: 'electric', ow: 'volta', team: [[1034, 25], [1036, 26], [82, 26, null, [430, 351, 451, 86]], [1035, 29, null, [85, 247, 98, 86]]], intro: 'Ça grésille ! Prépare-toi à recevoir le choc de ta vie !', lose: 'Court-circuit total ! Tu remportes le Badge Volt.' },
  { name: 'Flora', type: 'grass', ow: 'flora', team: [[1021, 30], [1038, 31], [114, 31, null, [202, 246, 79, 73]], [1022, 34, null, [202, 188, 147, 523]]], intro: 'Mes fleurs sont belles, mais elles savent piquer. À toi de jouer !', lose: 'Tu as fait éclore quelque chose de beau. Le Badge Pétale te revient.' },
  { name: 'Sibylle', type: 'psychic', ow: 'sibylle', team: [[1039, 35], [1030, 36], [1019, 36], [65, 37, null, [94, 324, 347, 105]], [1040, 39, null, [94, 585, 347, 236]]], intro: 'J\'ai déjà vu l\'issue de ce combat... mais montre-moi quand même.', lose: 'L\'avenir m\'a trompée. Le Badge Mirage est à toi.' },
  { name: 'Basalte', type: 'rock', ow: 'basalte', team: [[1026, 40], [111, 41], [1028, 42], [76, 43], [1027, 44]], intro: 'Mon frère aîné m\'a confié cette île. Pour aller plus loin, il faudra passer à travers la roche !', lose: 'Tu as fendu le roc... Le Badge Granit est à toi. Drakos ne va pas aimer ça.' },
  { name: 'Pyros', type: 'fire', ow: 'pyros', team: [[1041, 45], [78, 46], [1005, 46], [467, 48], [1042, 49]], intro: 'Le volcan gronde et mon cœur aussi ! Personne ne passe sur la Grande Île sans brûler un peu !', lose: 'Quelle flamme... Le Badge Braise te va bien. Va. Drakos t\'attend.' },
  { name: 'Drakos', type: 'dragon', ow: 'drakos', team: [[1049, 50], [148, 52], [1050, 53], [149, 54], [330, 55], [1051, 56]], intro: 'Dix ans que personne n\'a franchi cette porte. Célestine t\'envoie ? Peu importe. Ici, c\'est moi qui règne !', lose: '... Les dragons te reconnaissent. Prends le Badge Écaille. Les huit badges du Nord sont à toi — les sept Champions des Terres du Sud t\'attendent au-delà du Pont de l\'Austral.' },
  ...LEADERS_SUD,
];
const CHAMPION = { name: 'Célestine', ow: 'celestine', team: [[1016, 77], [1046, 78], [1035, 78], [1040, 79], [248, 79], [149, 81]], intro: 'Quinze badges... Les huit du Nord et les sept des Terres du Sud. Tu as parcouru toute la région pour arriver jusqu\'ici. Alors montre-moi tout ce que tu as appris !', lose: 'Magnifique. Tu es le nouveau Maître de la Ligue Céleste !' };

let tCount = 0;
export function trainerNpc(map, x, y, dir, cls, name, team, o = {}) {
  const [ow, prize, bs] = CLS[cls] || ['gamin', 20];
  return map.npc({
    id: o.id || `${map.id}:t${tCount++}`, x, y, dir, sprite: o.ow || ow, move: 'static', onWin: o.onWin,
    trainer: { cls, name, team, prize: o.prize || prize, sight: o.sight ?? 4, bs: o.bs || bs || ow, ai: o.ai || 'normal', items: o.items, megaSp: o.megaSp, format: o.format, slots: o.slots, intro: o.intro || 'Nos regards se sont croisés : c\'est l\'heure du combat !', lose: o.lose || 'J\'ai perdu...', after: o.after || 'Quel combat ! Tes Pokémon sont vraiment forts.' },
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
// Méga-Gemmes (Arcadia) : identifiants fixes, ceux de la version 4.28 quand ils étaient uniques (un objet déjà ramassé le reste)
const GEMME_ID = {"fan-amoongusite": "monde:294,176", 
  "fan-azumarillite": "monde:gemme-fan-azumarillite", 
  "fan-butterfreeite": "monde:137,236", 
  "fan-conkeldurrite": "monde:242,234", 
  "fan-darkraiite": "monde:234,253", 
  "fan-dugtrioite": "monde:379,188", 
  "fan-electivireite": "monde:416,221", 
  "fan-excadrillite": "monde:407,121", 
  "fan-feraligatrite": "monde:gemme-fan-feraligatrite", 
  "fan-flygonite": "monde:390,49", 
  "fan-golemite": "monde:295,181", 
  "fan-jumpluffite": "monde:gemme-fan-jumpluffite", 
  "fan-kabutopsite": "monde:128,237", 
  "fan-magmortarite": "monde:gemme-fan-magmortarite", 
  "fan-meganiumite": "monde:231,252", 
  "fan-miloticite": "monde:374,192", 
  "fan-omastarite": "monde:412,221", 
  "fan-poliwrathite": "monde:404,124", 
  "fan-pyroarite": "monde:394,8", 
  "fan-shiftryite": "monde:384,49", 
  "fan-snorlaxite": "monde:295,177", 
  "fan-torkoalite": "monde:164,218", 
  "fan-typhlosionite": "monde:118,239", 
  "fan-whimsicottite": "monde:250,237", 
  "lucarionite": "monde:164,214", 
  "gyaradosite": "monde:88,247", 
  "aerodactylite": "monde:132,245", 
  "absolite": "monde:241,233", 
  "scizorite": "monde:222,249", 
  "heracronite": "monde:233,261", 
  "ampharosite": "monde:376,180", 
  "gengarite": "monde:405,228", 
  "houndoominite": "monde:405,113", 
  "abomasite": "monde:390,18", 
  "glalitite": "monde:392,50", 
  "tyranitarite": "monde:287,180"};
const FANS = ["amoongus", "azumarill", "butterfree", "conkeldurr", "darkrai", "dugtrio", "electivire", "excadrill", "feraligatr", "flygon", "golem", "jumpluff", "kabutops", "magmortar", "meganium", "milotic", "omastar", "poliwrath", "pyroar", "shiftry", "snorlax", "torkoal", "typhlosion", "whimsicott"];
/** les Méga-Gemmes d'une route de la fin de l'aventure : k = rang de la route dans la liste d'Arcadia (r7, r9, r10, r11, r12,
 *  Sentier Orageux, Côte des Ruines, Chemin du Brasier, Pente Givrée, Rivage Gelé), extra = [t, côté, gemme] */
function gemmes(map, pts, k, extra = []) {
  FANS.forEach((g, i) => { if (i % 10 === k) { const it = 'fan-' + g + 'ite'; routeItem(map, pts, 0.12 + ((i * 0.37) % 0.76), i % 2 ? 1 : -1, 5, it, 1, GEMME_ID[it]); } });
  for (const [t, side, gem] of extra) routeItem(map, pts, t, side, 4, gem, 1, GEMME_ID[gem]);
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
/** case libre la plus proche de (x, y) dans un intérieur : on y marche, personne n'y est, ni le tapis ni la case devant lui */
function caseLibreDedans(m, x, y) {
  const ok = (a, b) => m.in(a, b) && walkable(m.get(a, b)) && m.get(a, b) !== T.MAT && !(a === m.exitX && b === m.exitY - 1) && !m.npcs.some((q) => q.x === a && q.y === b);
  if (ok(x, y)) return [x, y];
  for (let r = 1; r < 6; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(x + dx * r, y + dy * r)) return [x + dx * r, y + dy * r];
  return [x, y];
}
export function poserBatiment(W, maps, def, b) {
  const ox = def.x, oy = def.y;
  const B = W.building(b.kind, ox + b.x + (b.dx || 0), oy + b.y + (b.dy || 0), { roof: b.roof, style: b.style, label: b.label, name: b.name, w: b.w, d: b.d, h: b.h, door: b.door, kit: b.kit, flat: b.flat, door2: b.door2, blocs: b.blocs, libres: b.libres, porteY: b.porteY, modele: b.modele, opts: b.opts });
  // mapId : identifiant imposé (bâtiment déménagé : les parties arrêtées à l'intérieur reprennent au même endroit)
  let id = b.mapId || `${def.id}:${b.id || b.kind + b.x}`;
  if (maps[id] && !b.mapId) id += 'y' + b.y;   // deux bâtiments dans la même colonne : chacun garde son intérieur
  let inside;
  if (b.interior) inside = b.interior(id);
  else if (b.kind === 'center') inside = centerInterior(id, 'Centre de soins');
  else if (b.kind === 'mart') { const earlyCime = def.id === 'cime'; inside = martInterior(id, 'Boutique', STOCK[earlyCime ? 5 : (def.stock || 1)]); if (earlyCime) { const v = inside.npcs.find((q) => q.role === 'shop'); if (v) { v.stockLate = STOCK[7]; v.stockLateBadges = 8; } } }
  else if (b.kind === 'gym') {
    // la première arène (Sylvebourg) est dessinée à la main : la Grande Serre (world/arene-sylve.js) ; les autres sont tirées d'une graine
    // les autres sont dessinées dans un plan (world/arenes-plans.js, mécanismes dans world/arenes-plan.js) ; repli : énigme tirée d'une graine
    const nom = 'Arène de ' + def.name;
    const ar = PLANS[def.gym] ? construireArene(id, def.gym, PLANS[def.gym], nom) : def.gym === 0 ? areneSylve(id, nom) : buildArena(id, def.gym, LEADERS[def.gym].type, nom);
    inside = ar.map; def.gymArena = ar;
  }
  else if (b.kind === 'lab') inside = labInterior(id);
  else if (b.kind === 'league') inside = leagueInterior(id);
  else if (b.kind === 'dojo') inside = dojoInterior(id, b.name || 'Dojo de Mamadou');
  else inside = houseInterior(id, b.name || 'Maison', { w: b.kind === 'bighouse' || b.kind === 'tower' ? 11 : 9, h: b.kind === 'bighouse' || b.kind === 'tower' ? 9 : 8, bed: b.bed, extraBooks: b.kind === 'tower', kitchen: b.kitchen });
  inside.townId = def.id; inside.outside = { map: W.id, x: B.doorX, y: B.doorY + 1, dir: 'down' };
  inside.warp(inside.exitX, inside.exitY, inside.outside);
  if (inside.get(inside.exitX - 1, inside.exitY) === T.MAT) inside.warp(inside.exitX - 1, inside.exitY, inside.outside);
  W.warp(B.doorX, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
  if (B.door2X !== undefined) W.warp(B.door2X, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
  // un habitant demandé sur un meuble (table, canapé : la pièce a été meublée après coup) prend la case libre la plus
  // proche ; son identifiant garde la case demandée (sauvegardes, quêtes)
  for (const n of b.npcs || []) { const [nx, ny] = caseLibreDedans(inside, n.x, n.y); inside.npc({ id: `${id}:${n.id || n.x + '-' + n.y}`, ...n, x: nx, y: ny }); }
  if (b.setup) b.setup(inside);
  // chemin depuis la porte jusqu'à la route la plus proche
  // (seulement si elle y arrive tout droit : sinon le chemin buterait contre un mur, et relier() trace le bon)
  { let fin = 0; for (let y = B.doorY + 1; y < B.doorY + 8; y++) { const t = W.get(B.doorX, y); if (t === T.PAVE || t === T.PATH || t === T.BRIDGE) { fin = y; break; } if (!walkable(t) && t !== T.FENCE && t !== T.BUSH) break; }
    for (let y = B.doorY + 1; y < fin; y++) if (W.get(B.doorX, y) !== T.PAVE) W.set(B.doorX, y, T.PATH); }
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
      if (def.id === 'aube' && rx >= 12 && rx <= 26 && ry >= 12 && ry <= 25) continue;
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
    // de l'air : rien de bâti à moins de deux cases, aucune porte juste au nord que le toit cacherait
    const BATI = (q) => q === T.BUILD || q === T.DOOR;
    for (let y = y0 - 3; y <= y0 + bd + 1 && ok; y++) for (let x = x0 - 2; x <= x0 + bw + 1; x++) { const q = W.get(x, y); if (y >= y0 - 2 ? BATI(q) : q === T.DOOR && x >= x0 - 1 && x <= x0 + bw) { ok = false; break; } }
    if (!ok) continue;
    const dxd = G ? G.door : kind === 'house2' ? 2 : kind === 'bighouse' ? 2 : 1, doorY = y0 + (G ? G.porteY : bd - 1);
    if (BATI(W.get(x0 + dxd, doorY + 2)) || BATI(W.get(x0 + dxd, doorY + 3))) continue;
    // ni porte cachée par un bâtiment plus haut, au sud
    { let k = 1; while (k <= 10 && !BATI(W.get(x0 + dxd, doorY + k))) k++; const S = k <= 10 && W.buildings.find((q) => x0 + dxd >= q.x && x0 + dxd < q.x + q.w && doorY + k >= q.y && doorY + k < q.y + q.d); if (S && S.y - hauteurVue(S) <= doorY) continue; }
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
  const tiles = def.doubleDoor ? [[dx, dy + 1], [dx + 1, dy + 1]] : [[dx, dy + 1], [dx + 1, dy + 1]];
  const npc = W.npc({ id: `${def.id}:garde-arene`, x: dx + 1, y: dy + 1, dir: 'left', sprite: 'garde', gate: { badges, tiles }, text });
  W.gates.push({ npc: npc.id, badges, tiles });
}

/** réoriente tout dresseur dont la ligne de vue est immédiatement bloquée par un mur, relief ou obstacle */
function orienterDresseursAveugles(W) {
  const npcSet = new Set(W.npcs.map((q) => q.x + ',' + q.y));
  const blocked = (x, y) => W.signs?.has(x + ',' + y) || W.items?.some((it) => it.x === x && it.y === y) || W.warps?.has(x + ',' + y);
  const vue = (n, dir) => {
    const [dx, dy] = DIRS[dir]; let k = 0;
    for (let s = 1; s <= n.trainer.sight; s++) {
      const x = n.x + dx * s, y = n.y + dy * s;
      if (!W.canStep(x - dx, y - dy, x, y) || !walkable(W.get(x, y)) || npcSet.has(x + ',' + y) || blocked(x, y)) break;
      k = s;
    }
    return k;
  };
  for (const n of W.npcs) {
    if (!n.trainer || !n.trainer.sight || n.trainer.sight <= 0 || n.gate) continue;
    if (vue(n, n.dir) > 0) continue;
    let bestDir = n.dir, bestVue = 0;
    for (const d of ['down', 'up', 'left', 'right']) {
      const v = vue(n, d);
      if (v > bestVue) { bestVue = v; bestDir = d; }
    }
    n.dir = bestDir;
  }
}

/**
 * Parvis d'une arène : on efface les rues en double devant sa porte. Le chemin devient de l'herbe (les deux se
 * marchent : aucun passage n'est ouvert ni fermé). « double » (Floralia) : une seconde rue de chemin juste sous la
 * première, à une rangée d'herbe d'écart — on la retire, sauf dans les colonnes où un chemin descend vers le sud (on
 * le relie alors à la première rue). « facade » (Mirage) : la rue qui longe la façade sur la rangée même de la porte.
 */
function parvisArene(W, t, mode) {
  if (!t?.gymDoor) return;
  const [dx, dy] = t.gymDoor, x0 = dx - 14, x1 = dx + 14;
  const chemin = (x, y) => W.get(x, y) === T.PATH;
  const bande = (y) => { let n = 0; for (let x = x0; x <= x1; x++) if (chemin(x, y)) n++; return n >= 18; };
  if (mode === 'facade') {
    for (let x = dx - 9; x <= dx + 10; x++) if (chemin(x, dy) && chemin(x, dy + 1)) W.set(x, dy, T.GRASS);
    return;
  }
  for (let y = dy + 1; y <= dy + 8; y++) {
    if (!bande(y)) continue;
    let fin = y; while (bande(fin + 1)) fin++;          // la première rue : y … fin
    const y2 = fin + 2; if (bande(fin + 1) || !bande(y2)) continue;
    let f2 = y2; while (bande(f2 + 1)) f2++;            // la rue en double : y2 … f2
    // de la porte vers l'ouest puis vers l'est, tant que les deux rues courent côte à côte
    const colonne = (x) => {
      if (chemin(x, f2 + 1)) { for (let yy = fin + 1; yy <= f2; yy++) W.set(x, yy, T.PATH); return; }
      for (let yy = y2; yy <= f2; yy++) W.set(x, yy, T.GRASS);
    };
    const double = (x) => chemin(x, fin) && !chemin(x, fin + 1) && chemin(x, y2);
    for (let x = dx; double(x); x--) colonne(x);
    for (let x = dx + 1; double(x); x++) colonne(x);
    return;
  }
}

/* ======================================================================
   Construction de la région
   ====================================================================== */
export function buildWorld({ decors = true, traces = decors } = {}) {
  restaurerTables();   // les tables de rencontres d'avant les tronçons (une construction précédente les a réunies)
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
    // bourg de 56 × 36 cases, à l'échelle de Noir 2 & Blanc 2 : la rue du nord (x 27-28) mène à la Route 1, la grand-rue
    // (y 20-21) traverse le bourg jusqu'à la porte de la Route 10 ; au nord les deux maisons et le laboratoire, au sud la
    // boulangerie, les maisons du bas et les potagers
    id: 'aube', name: 'Bourg-Aube', x: 20, y: 238, w: 56, h: 36, exits: [['n', 27], ['e', 20]], fermer: true, lotir: false,
    roads: [[27, 0, 28, 29, T.PATH], [3, 20, 55, 21, T.PATH], [4, 29, 52, 29, T.PATH],
      [10, 11, 10, 19, T.PATH], [18, 11, 18, 19, T.PATH], [36, 17, 37, 19, T.PATH],
      [9, 27, 9, 28, T.PATH], [16, 27, 16, 28, T.PATH], [36, 27, 36, 28, T.PATH], [43, 27, 43, 28, T.PATH]],
    deco: [
      // le nord : jardins des deux maisons, massifs, arbres d'ornement, l'étang
      ['flowers', 8, 3, 13, 5], ['trees', 2, 1, 5, 4], ['cerisier', 15, 3], ['cerisier', 21, 3], ['flowers', 20, 13, 23, 15], ['flowers', 5, 13, 8, 15],
      ['fence', 7, 12, 8, 12], ['fence', 12, 12, 16, 12], ['fence', 20, 12, 22, 12], ['erable', 13, 16], ['erable', 23, 17], ['banc', 15, 17],
      ['waterRect', 46, 3, 52, 6], ['flowers', 45, 8, 53, 8], ['banc', 47, 1], ['banc', 51, 1], ['cerisier', 44, 2], ['cerisier', 54, 5], ['lanterne', 45, 4],
      ['flowers', 31, 3, 34, 6], ['erable', 39, 4],
      ['lamp', 26, 3], ['lamp', 29, 3], ['lamp', 26, 18], ['lamp', 29, 18], ['lamp', 26, 24], ['lamp', 29, 24],
      ['sign', 25, 18, 'BOURG-AUBE\nLà où chaque aventure commence.'], ['sign', 39, 18, 'LABORATOIRE\nProf. Saule'],
      ['flowers', 33, 17, 34, 18], ['flowers', 39, 17, 41, 17], ['flowers', 45, 13, 50, 16], ['erable', 52, 14],
      // le sud : la boulangerie et ses caisses, les maisons du bas, les potagers clos
      ['caisses', 40, 25], ['tonneau', 41, 26], ['flowers', 20, 24, 24, 26], ['flowers', 47, 24, 51, 26], ['pot', 13, 25], ['pot', 20, 27],
      ['fence', 4, 31, 12, 31], ['fence', 14, 31, 22, 31], ['fence', 4, 34, 22, 34], ['fence', 4, 32, 4, 33], ['fence', 22, 32, 22, 33],
      ['flowers', 5, 32, 11, 32], ['flowers', 15, 32, 21, 32], ['flowers', 5, 33, 11, 33], ['flowers', 15, 33, 21, 33], ['banc', 24, 31],
      ['fence', 32, 31, 50, 31], ['cerisier', 34, 33], ['erable', 39, 33], ['cerisier', 44, 33], ['erable', 49, 33]],
    buildings: [
      { kind: 'house', x: 9, y: 8, roof: 'red', id: 'maison', name: 'Maison', bed: true, kitchen: true, npcs: [{ id: 'maman', x: 5, y: 4, sprite: 'maman', dir: 'down', script: 'mom' }] },
      { kind: 'house', x: 17, y: 8, roof: 'blue', id: 'rival', name: 'Maison de Théo', npcs: [{ x: 3, y: 4, sprite: 'habitante', dir: 'right', script: 'rivalMom' }] },
      { kind: 'lab', ...GRAND.lab, x: 34, y: 10, id: 'labo' },
      { kind: 'house', x: 8, y: 24, roof: 'orange', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Le Professeur Saule travaille jour et nuit dans son laboratoire.', 'Il paraît qu\'il prépare des Pokémon pour les jeunes du bourg !'] }] },
      { kind: 'house', x: 15, y: 24, roof: 'red', npcs: [{ x: 3, y: 4, sprite: 'vieil_homme', text: ['De mon temps, on allait jusqu\'à Sylvebourg à pied, sans courir !', 'La Route 1 est courte, mais les hautes herbes y sont pleines de surprises.'] }] },
      { kind: 'house2', x: 34, y: 24, roof: 'orange', name: 'Boulangerie', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Bienvenue à la boulangerie de l\'Aube !', 'Le premier pain sort du four avant le lever du soleil.'] }] },
      { kind: 'house', x: 42, y: 24, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: ['Dans ma jeunesse, j\'ai voulu défier un Champion avec un Pokémon bien trop fort pour moi.', 'Il ne m\'écoutait plus ! Un Pokémon ne suit qu\'un dresseur qui a fait ses preuves.', 'C\'est pour ça qu\'avant chaque Arène, il y a un niveau maximum : tes Pokémon ne grandissent pas au-delà tant que tu n\'as pas gagné le badge.', 'Ta Carte de Dresseur et ton Pokématos te disent où tu en es. Pas de raccourci : du travail d\'équipe !'] }] },
    ],
    npcs: [
      { id: 'fille', x: 22, y: 23, sprite: 'fillette', move: 'wander', text: ['Les Pokémon sauvages vivent dans les hautes herbes.', 'Sans Pokémon à toi, il ne faut surtout pas y aller !'] },
      { id: 'vieux', x: 31, y: 9, sprite: 'vieil_homme', move: 'turn', text: ['Tu sais courir ? Garde la touche Maj enfoncée en marchant.', 'Et si tu oublies une touche, regarde le petit bouton en bas de l\'écran !'] },
      { id: 'garde10', x: 53, y: 19, sprite: 'garde', dir: 'down', gate: { badges: 5, tiles: [[55, 20], [55, 21]] }, text: ['La route 10 longe des falaises instables.', 'Reviens quand tu auras 5 badges.'] },
    ],
  };
  ville(A, 'A');
  zoneSortie(A, 'r1', { name: 'Bourg-Aube', music: 'town', trigger: 'needStarter' });

  /* ---------- B · Sylvebourg (Hector, Insecte) ---------- */
  const B = towns.B = {
    // village de 56 × 52 cases, à l'échelle de Noir 2 & Blanc 2 (un peu plus grand) : la grand-rue nord-sud (x 27-28) relie
    // les deux portes ; au nord le Centre et la Boutique, au milieu les maisons, l'Arène et le parc à l'étang, au sud
    // l'auberge, la cabane du chasseur et le verger
    id: 'sylve', name: 'Sylvebourg', x: 18, y: 138, w: 56, h: 52, exits: [['s', 27], ['n', 27]], gym: 0, stock: 1, music: 'island', fermer: true, lotir: false,   // trois villes d'affilée : chacune son air
    roads: [[27, 0, 28, 51, T.PATH], [4, 13, 51, 14, T.PATH], [4, 36, 51, 37, T.PATH], [4, 15, 5, 35, T.PATH], [50, 15, 51, 35, T.PATH],
      [6, 22, 26, 22, T.PATH], [4, 45, 51, 45, T.PATH], [12, 12, 12, 12, T.PATH], [39, 12, 39, 12, T.PATH],
      [9, 20, 9, 21, T.PATH], [16, 20, 16, 21, T.PATH], [9, 29, 9, 35, T.PATH], [16, 29, 16, 35, T.PATH], [34, 30, 35, 35, T.PATH],
      [9, 44, 9, 44, T.PATH], [17, 43, 17, 44, T.PATH], [35, 43, 35, 44, T.PATH], [42, 43, 42, 44, T.PATH], [49, 43, 49, 44, T.PATH]],
    deco: [
      // le nord : massifs devant le Centre et la Boutique, arbres d'ornement, lampadaires de la grand-rue
      ['flowers', 18, 8, 23, 11], ['flowers', 43, 8, 47, 11], ['flowers', 6, 9, 7, 11], ['erable', 18, 4], ['erable', 23, 4], ['cerisier', 43, 4], ['cerisier', 48, 4],
      ['trees', 2, 1, 6, 4], ['trees', 51, 1, 54, 5], ['lamp', 26, 5], ['lamp', 29, 5], ['lamp', 26, 11], ['lamp', 29, 11], ['lamp', 26, 33], ['lamp', 29, 33], ['lamp', 26, 47], ['lamp', 29, 47],
      ['sign', 25, 11, 'SYLVEBOURG\nLa ville où murmurent les feuilles.'],
      // les maisons de l'ouest : jardinets clos et fleurs
      ['fence', 7, 24, 13, 24], ['fence', 14, 24, 20, 24], ['flowers', 11, 25, 12, 27], ['flowers', 18, 25, 19, 27], ['flowers', 7, 16, 7, 18], ['flowers', 20, 16, 21, 18],
      ['banc', 22, 24], ['tonneau', 13, 21], ['pot', 20, 30], ['pot', 22, 30], ['flowers', 21, 27, 24, 29],
      // l'Arène
      ['sign', 33, 32, 'ARÈNE DE SYLVEBOURG\nChampion : Hector\nL\'apiculteur.'], ['flowers', 30, 32, 31, 34], ['flowers', 38, 32, 39, 34],
      // le parc à l'étang
      ['waterRect', 43, 20, 47, 23], ['flowers', 42, 18, 48, 18], ['flowers', 42, 25, 48, 25], ['banc', 43, 27], ['banc', 47, 27], ['statue', 45, 31],
      ['cerisier', 41, 30], ['cerisier', 49, 30], ['erable', 41, 17], ['erable', 49, 17], ['lanterne', 42, 21], ['lanterne', 48, 21],
      // le sud : l'auberge, la cabane, le verger
      ['caisses', 21, 41], ['tonneau', 22, 42], ['flowers', 23, 40, 25, 42], ['flowers', 30, 40, 32, 42], ['flowers', 46, 40, 46, 42],
      ['trees', 6, 48, 6, 48], ['trees', 9, 48, 9, 48], ['trees', 12, 48, 12, 48], ['trees', 15, 48, 15, 48], ['trees', 18, 48, 18, 48], ['trees', 21, 48, 21, 48],
      ['trees', 7, 50, 7, 50], ['trees', 10, 50, 10, 50], ['trees', 13, 50, 13, 50], ['trees', 16, 50, 16, 50], ['trees', 19, 50, 19, 50], ['trees', 22, 50, 22, 50],
      ['flowers', 33, 47, 38, 49], ['erable', 41, 48], ['cerisier', 45, 48], ['erable', 49, 48], ['flowers', 40, 50, 50, 51]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 9, y: 7 }, { kind: 'mart', ...GRAND.mart, x: 36, y: 8 }, { kind: 'gym', ...GRAND.gym, x: 26, y: 16, roof: 'green' },
      { kind: 'house', x: 8, y: 17, roof: 'green', npcs: [{ x: 4, y: 4, sprite: 'insectomane', text: ['Hector, le Champion, adore les Pokémon Insecte.', 'Le Feu, le Vol et la Roche les mettent en difficulté !'] }] },
      { kind: 'house', x: 15, y: 17, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Un Pokémon endormi ou paralysé est bien plus facile à capturer.', 'Et plus ses PV sont bas, mieux c\'est !'] }, { id: 'gs', x: 6, y: 3, sprite: 'dame', script: 'gsBall' }] },
      { kind: 'house', x: 8, y: 26, roof: 'teal', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Le Bois Murmure, au nord, est si touffu qu\'on y voit à peine le ciel.', 'Les Pokémon Insecte y pullulent !'] }] },
      { kind: 'house', x: 15, y: 26, roof: 'green', npcs: [{ x: 3, y: 4, sprite: 'gamin', text: ['Mon grand frère a battu Hector du premier coup.', 'Il dit qu\'un oiseau, ça règle tout !'] }] },
      { kind: 'bighouse', x: 7, y: 40, roof: 'brown', name: 'Auberge', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Bienvenue à l\'auberge du Chêne !', 'Les voyageurs s\'y reposent avant d\'affronter le Bois Murmure.'] }] },
      { kind: 'house', x: 16, y: 40, roof: 'teal', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Hector élève des abeilles derrière son Arène. Son miel est le meilleur de la région !', 'Mais ses Mimigal, eux, ont un dard venimeux. Garde un Antidote sur toi avant d\'aller le défier.'] }] },
      { kind: 'house', x: 34, y: 40, roof: 'green', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['Les types, c\'est comme pierre-feuille-ciseaux, mais en plus compliqué !', 'Le Feu brûle les Insectes, le Vol les attrape en plein ciel, et la Roche les écrase.', 'Pour l\'Arène d\'Hector, un Pokémon Feu ou Vol, c\'est le bon choix !'] }] },
      { kind: 'house', x: 41, y: 40, roof: 'brown', npcs: [{ x: 4, y: 4, sprite: 'habitant', text: ['Méfie-toi de deux bandes qui rôdent dans la région, et ne les confonds pas.', 'La Brume, ce sont des trafiquants en gris : ils volent des Pokémon rares pour les revendre au marché noir.', 'La Team Éclipse, en noir et violet, c\'est autre chose : des illuminés qui parlent d\'un Prisme Noir et de Lugia, le gardien des marées.', 'Les uns veulent de l\'argent, les autres veulent éteindre le ciel. Je ne sais pas lesquels me font le plus peur.'] }] },
      { kind: 'house', x: 48, y: 40, roof: 'brown', name: 'Cabane du chasseur', npcs: [{ x: 3, y: 4, sprite: 'insectomane', text: ['Je piste les Pokémon des bois depuis quarante ans.', 'Les plus rares ne sortent qu\'à l\'aube.'] }] },
    ],
    npcs: [
      { id: 'gamin', x: 22, y: 20, sprite: 'gamin', move: 'wander', text: ['Le Centre de soins soigne tes Pokémon gratuitement.', 'C\'est le bâtiment au toit rouge !'] },
      { x: 45, y: 29, sprite: 'fillette', move: 'wander', text: ['Il paraît qu\'un vieil arbre du Bois Murmure cache un autel.', 'Ma grand-mère dit qu\'il ne faut pas y toucher...'] },
      { id: 'garde', x: 29, y: 2, sprite: 'garde', dir: 'left', gate: { badges: 1, tiles: [[27, 1], [28, 1]] }, text: ['Le Bois Murmure est plein de dresseurs coriaces.', 'Reviens quand tu auras le badge de l\'Arène !'] },
    ],
  };
  ville(B, 'B');

  /* ---------- C · Pierrefort (ville minière, sans arène) ---------- */
  const C = towns.C = {
    id: 'pierre', name: 'Pierrefort', x: 62, y: 30, w: 60, h: 34, decal: [28, 0], exits: [['s', 43], ['e', 10], ['n', 45]], stock: 2, music: 'tower', fermer: true, lotir: { n: 6, seed: 83 },
    roads: [[43, 10, 44, 33, T.PATH], [36, 10, 59, 11, T.PATH], [43, 18, 59, 19, T.PATH], [0, 26, 59, 27, T.PATH], [19, 18, 20, 26, T.PATH], [36, 11, 37, 26, T.PATH]],
    deco: [['rock', 56, 20], ['rock', 38, 23], ['rock', 3, 23], ['lamp', 42, 12], ['lamp', 45, 12], ['trees', 54, 3, 57, 6, T.PINE],
      ['sign', 41, 12, 'PIERREFORT\nUne ville taillée dans la montagne.'], ['sign', 54, 8, 'MAISON DES MINEURS\nAncien atelier de Basalte.'], ['flowers', 46, 21, 46, 24],
      // l'usine Poké Ball, derrière sa clôture : un portail gardé sur l'allée
      ['fence', 2, 3, 37, 3], ['fence', 2, 4, 2, 17], ['fence', 37, 4, 37, 17], ['fence', 3, 17, 18, 17], ['fence', 21, 17, 36, 17],
      ['sign', 17, 19, 'USINE POKÉ BALL DE PIERREFORT\nOuverte aux dresseurs titulaires de 5 badges.'], ['lamp', 18, 16], ['lamp', 21, 16]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 39, y: 3 }, { kind: 'mart', ...GRAND.mart, x: 47, y: 21 },
      { kind: 'bighouse', x: 48, y: 3, roof: 'brown', id: 'mineurs', name: 'Maison des Mineurs', npcs: [
        { x: 4, y: 5, sprite: 'montagnard', text: ['Ici travaillait Basalte, le meilleur mineur de la région.', 'Il est parti sur l\'Île de Granit, au sud-est, rejoindre ses deux frères.', 'On dit qu\'il garde l\'île pour le compte de l\'aîné, Drakos...'] },
        { x: 7, y: 6, sprite: 'vieil_homme', text: ['Les trois frères étaient de braves gars.', 'Puis Drakos a perdu contre Célestine, la Maître de la Ligue.', 'Il n\'a jamais digéré sa défaite. Il s\'est taillé un royaume sur les îles.'] }] },
      { kind: 'house', x: 45, y: 13, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['Les Pokémon Roche résistent aux attaques Normal et Feu.', 'Mais l\'Eau et la Plante les font fondre !'] }] },
      { kind: 'house', x: 50, dx: 1, y: 13, roof: 'brown', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['À l\'est, la route 3 mène à la Grotte Lunaire.', 'Il y fait sombre... et les Nosferapti adorent s\'y cacher.'] }] },
      { kind: 'house2', x: 53, dx: 1, y: 21, roof: 'red', npcs: [{ x: 2, y: 4, sprite: 'scientifique', text: ['Ton Pokémon peut évoluer en gagnant des niveaux.', 'Certains ont besoin d\'une pierre spéciale, vendue en boutique.'] }] },
      { kind: 'tower', ...GRAND.usine, x: 4, y: 4, roof: 'gray', id: 'usine', name: 'Usine Poké Ball', npcs: [{ id: 'inventeur', x: 5, y: 4, sprite: 'scientifique', talk: async (A) => {
        if (!A.f.giftUsine) {
          A.flag('giftUsine', true);
          await A.say([
            'Tiens, la direction a enfin autorisé la visite aux dresseurs à 5 badges !',
            'On teste de nouveaux moules pour la Ligue. Prends cet équipement de laboratoire et un lot d\'Hyper Balls pour tes recherches !'
          ]);
          await A.give('expert-belt');
          await A.give('ultra-ball', 3);
          return;
        }
        await A.say([
          'Ici, on assemble les Poké Balls et les équipements de combat de toute la région.',
          'La Ceinture Pro récompense ceux qui exploitent chaque faiblesse de type !'
        ]);
      } }] },
    ],
    npcs: [
      { id: 'montagnard', x: 48, y: 12, sprite: 'montagnard', move: 'wander', text: ['Il paraît que des Onix creusent au fond de la Grotte Lunaire.', 'On les entend gronder sous la roche !'] },
      { id: 'usine', x: 18, y: 18, sprite: 'garde', dir: 'down', gate: { badges: 5, tiles: [[19, 17], [20, 17]] }, text: ['L\'usine Poké Ball protège ses prototypes des curieux.', 'Reviens avec 5 badges pour entrer — notre scientifique à l\'intérieur a un équipement expérimental pour toi !'] },
    ],
  };
  ville(C, 'C');
  { const s = sortie(C, 'mine'); C.mine = [s.cells[0][0], VILLES.C.y]; }   // le chemin de la mine part de la porte nord (mine.js)

  /* ---------- D · Port-Azur (Marine, Eau) ---------- */
  const D = towns.D = {
    id: 'azur', name: 'Port-Azur', x: 185, y: 22, w: 37, h: 46, exits: [['w', 11], ['e', 19]], gym: 1, stock: 3, music: 'port', fermer: true, lotir: { n: 6, seed: 33 },
    roads: [[0, 11, 36, 12], [0, 19, 36, 20], [15, 7, 16, 45], [30, 11, 31, 45], [0, 42, 36, 43], [2, 19, 3, 45], [16, 30, 31, 31]],
    deco: [['waterRect', 2, 0, 31, 3], ['sand', 2, 4, 31, 6], ['bridge', 15, 0, 16, 6], ['lamp', 14, 13], ['lamp', 17, 13], ['lamp', 14, 21], ['lamp', 17, 21],
      ['sign', 17, 10, 'PORT-AZUR\nLe parfum des embruns et des voyages.'], ['sign', 12, 39, 'ARÈNE DE PORT-AZUR\nChampionne : Marine\nLa vague déferlante.'], ['flowers', 19, 21, 28, 23], ['lamp', 14, 41], ['lamp', 17, 41], ['water', 30, 36, 2.6, 1.6]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, dx: -1, y: 6 }, { kind: 'mart', ...GRAND.mart, x: 10, y: 6 },
      { kind: 'house', x: 19, y: 8, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'marin', text: ['Plus loin à l\'est, Voltacité ne dort jamais.', 'Ses néons éclairent la côte toute la nuit !'] }] },
      { kind: 'house', x: 24, dx: 1, y: 8, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Un Pokémon peut retenir quatre attaques au maximum.', 'Quand il en apprend une cinquième, il faut en oublier une.'] }] },
      { kind: 'gym', ...GRAND.gym, x: 6, y: 25, roof: 'blue' },
      { kind: 'house2', x: 5, y: 14, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'marin', text: ['Le port s\'agrandit chaque année : les quais du sud sont tout neufs.'] }] },
      { kind: 'house', x: 19, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Les ferries se préparent de nouveau pour l\'archipel !', 'Mais même sans ferry, le passeur du Cap Mirage y emmène les dresseurs confirmés.'] : ['Avant, un ferry partait d\'ici pour l\'archipel du sud.', 'Depuis que Drakos tient les îles, plus un bateau ne part d\'ici.', 'Et ne compte pas y aller à la nage : des tourbillons entourent l\'archipel. Seul le vieux passeur du Cap Mirage connaît la passe.'] }] },
      { kind: 'house2', x: 24, dx: 1, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Le jour, la nuit, le matin, le soir...', 'La couleur du ciel change au fil de la journée : certains Pokémon ne sortent que la nuit !'] }] },
    ],
    npcs: [
      { id: 'marin', x: 17, y: 5, sprite: 'marin', move: 'turn', text: ['Ahoy ! Ce ponton était le départ des ferries.', 'Depuis que les îles ont fermé leurs ports, plus aucun bateau ne part...'] },
      {
        id: 'pecheur',
        x: 25,
        y: 5,
        sprite: 'pecheur',
        move: 'wander',
        name: 'Pêcheur Barnabé',
        who: 'Pêcheur Barnabé',   // nom affiché au-dessus de ses répliques
        talk: async (A, n) => {
          if (!A.has('canne')) {
            await A.say([
              'Ahoy, moussaillon ! La brise marine est vivifiante aujourd\'hui.',
              'Une bonne canne, de la patience et un peu de chance... voilà tout le secret d\'un bon pêcheur !',
              'Tiens, prends ma Canne à Pêche ! Mets-toi face à l\'eau depuis le rivage et appuie pour lancer ta ligne.'
            ], 'Pêcheur Barnabé');
            await A.give('canne');
            await A.say('Tu pourras ferrer de superbes Pokémon aquatiques dans tous les étangs et en pleine mer !', 'Pêcheur Barnabé');
            return;
          }
          if (n?.def?.show && A.game) return A.game.script('show', n);
          await A.say([
            'Les Racaillou se cachent parmi les galets, méfie-toi en marchant sur la plage.',
            'Quand la mer est calme, c\'est le moment rêvé pour sortir la Canne à Pêche !'
          ], 'Pêcheur Barnabé');
        }
      },
      { id: 'garde', x: 34, y: 18, sprite: 'garde', dir: 'down', gate: { badges: 2, tiles: [[35, 19], [35, 20]] }, text: ['La route 4 longe une côte escarpée.', 'Il faut deux badges pour l\'emprunter.'] },
    ],
  };
  ville(D, 'D');

  /* ---------- E · Voltacité (Volta, Électrik) ---------- */
  const E = towns.E = {
    id: 'volta', name: 'Voltacité', x: 275, y: 48, w: 47, h: 46, exits: [['w', 10], ['s', 8]], gym: 2, stock: 4, ground: T.PAVE, music: 'cityVolt', fermer: true,
    roads: [[0, 10, 44, 11], [2, 18, 44, 19], [8, 10, 9, 45], [2, 42, 44, 43], [40, 10, 41, 42]],
    deco: [['lamp', 7, 12], ['lamp', 10, 12], ['lamp', 16, 12], ['lamp', 22, 12], ['lamp', 16, 20], ['lamp', 27, 20], ['pot', 2, 12], ['pot', 28, 12],
      ['sign', 11, 12, 'VOLTACITÉ\nLa ville qui ne s\'éteint jamais.'], ['sign', 21, 41, 'ARÈNE DE VOLTACITÉ\nChampionne : Volta\nL\'étincelle foudroyante.'], ['flowers', 2, 21, 7, 22], ['flowers', 11, 21, 28, 22], ['lamp', 12, 41], ['lamp', 34, 41], ['lamp', 39, 20], ['pot', 42, 12]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 5 }, { kind: 'mart', ...GRAND.mart, x: 11, y: 5 },
      { kind: 'tower', x: 17, dx: 1, y: 6, roof: 'gold', name: 'Centrale de Voltacité', interior: (id) => centraleInterior(id), npcs: [{ x: 5, y: 4, sprite: 'scientifique', text: ['Cette centrale alimente toute la région.', 'Les Magnéti adorent se blottir contre les générateurs !'] }, { x: 8, y: 6, sprite: 'scientifique', text: ['Les Pokémon Sol ne craignent pas du tout l\'électricité.', 'Un bon atout contre l\'Arène !'] }] },
      { kind: 'house2', x: 23, dx: 1, y: 7, roof: 'gray', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['La paralysie divise la vitesse par quatre.', 'Et parfois, le Pokémon ne peut même pas attaquer !'] }] },
      { kind: 'gym', ...GRAND.gym, x: 13, y: 24, roof: 'gold' },
      { kind: 'house2', x: 31, y: 7, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'scientifique', text: ['La nuit, la ville brille tellement qu\'on voit à peine les étoiles.'] }] },
      { kind: 'bighouse', x: 33, y: 21, roof: 'gray', name: 'Résidence des Néons', npcs: [{ x: 4, y: 4, sprite: 'topdresseuse', text: ['Douze étages, et l\'ascenseur est toujours en panne. Merci les coupures de courant !'] }] },
      { kind: 'house', x: 33, y: 29, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitant', text: ['Mon Pikachu recharge mon téléphone. Pratique, non ?'] }] },
      { kind: 'house2', x: 2, y: 24, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'enfant', text: ['Quand je serai grand, je travaillerai à la Centrale !'] }] },
      { kind: 'house', x: 2, y: 33, roof: 'orange', npcs: [{ x: 4, y: 4, sprite: 'dame', text: ['Les Magnéti adorent se coller aux lampadaires. Ça fait de drôles de grappes.'] }] },
      { kind: 'house2', x: 33, y: 35, roof: 'purple', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['La Championne de Port-Azur, c\'était dur ? Volta, c\'est autre chose !'] }] },
      { kind: 'house', x: 11, y: 15, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Une Super Ball capture mieux qu\'une Poké Ball.', 'Une Hyper Ball, c\'est encore mieux !'] }] },
      { kind: 'house', x: 3, y: 15, roof: 'purple', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Au sud, la route 5 descend jusqu\'à Floralia.', 'Une ville couverte de fleurs, tu verras.'] }] },
    ],
    npcs: [
      { id: 'scientifique', x: 14, y: 14, sprite: 'scientifique', move: 'wander', text: ['La nuit, les Pokémon qu\'on croise ne sont pas tout à fait les mêmes.', 'Les Hoothoot, par exemple, sortent surtout le soir.'] },
      { id: 'garde', x: 10, y: 43, sprite: 'garde', dir: 'left', gate: { badges: 3, tiles: [[8, 44], [9, 44]] }, text: ['La route 5 est fermée aux dresseurs débutants.', 'Il faut trois badges pour passer.'] },
    ],
  };
  ville(E, 'E');

  /* ---------- F · Floralia (Flora, Plante) ---------- */
  const F = towns.F = {
    id: 'flora', name: 'Floralia', x: 165, y: 112, w: 50, h: 40, exits: [['n', 17], ['e', 19]], gym: 3, stock: 5, music: 'cityFlora', fermer: true, lotir: { n: 6, seed: 45 },
    roads: [[17, 0, 18, 39, T.PATH], [0, 9, 33, 10, T.PATH], [0, 19, 49, 20, T.PATH], [2, 9, 3, 39, T.PATH], [32, 9, 33, 20, T.PATH], [0, 37, 49, 38, T.PATH], [46, 20, 47, 38, T.PATH]],
    deco: [['flowers', 5, 11, 15, 12], ['flowers', 20, 11, 30, 12], ['flowers', 5, 22, 14, 24], ['water', 9, 30, 3.4, 1.8], ['flowers', 19, 22, 23, 26], ['flowers', 36, 6, 44, 8],
      ['lamp', 16, 7], ['lamp', 19, 7], ['lamp', 16, 21], ['lamp', 19, 21], ['pot', 8, 13], ['pot', 28, 13],
      ['sign', 15, 3, 'FLORALIA\nLa cité aux mille couleurs.'], ['sign', 24, 36, 'ARÈNE DE FLORALIA\nChampionne : Flora\nLa beauté épineuse.'],
      // petits arbres qui barrent la route 6 : il faut la capacité Coupe
      ['cut', 48, 19], ['cut', 48, 20]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 3 }, { kind: 'mart', ...GRAND.mart, x: 10, dx: 1, y: 4 },
      { kind: 'bighouse', x: 21, y: 5, roof: 'purple', name: 'Résidence Floralia', npcs: [{ x: 3, y: 4, sprite: 'habitante', text: ['Les attaques de statut ne font pas de dégâts, mais elles changent tout.', 'Un adversaire endormi, c\'est un adversaire inoffensif !'] }, { x: 7, y: 5, sprite: 'scientifique', text: ['J\'étudie les fleurs de la serre de Flora. Dans le carré de la Reine, chaque fleur que tu touches fait aussi éclore ou refermer ses voisines !', 'Réfléchis avant de marcher sur une dalle : chaque pas compte.'] }] },
      { kind: 'house2', x: 27, dx: 2, y: 6, roof: 'green', npcs: [{ x: 2, y: 4, sprite: 'gamin', text: ['Les buissons épineux à l\'est bloquent la Route 6 vers Mirage.', 'Flora, notre Championne, conserve le précieux Sécateur Sylvestre.', 'Elle ne le confie qu\'aux dresseurs qui remportent le Badge Pétale !'] }] },
      { kind: 'gym', ...GRAND.gym, x: 26, y: 21, roof: 'green' },
      { kind: 'house', x: 4, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Ton Pokémon en tête d\'équipe combat en premier.', 'Change l\'ordre de ton équipe dans le menu Équipe !'] }] },
      { kind: 'house', x: 9, dx: 1, y: 16, roof: 'orange', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Mirage, à l\'est, est une ville étrange.', 'On dit que ses habitants lisent dans les pensées.'] }] },
      { kind: 'house', x: 28, y: 16, roof: 'blue', npcs: [{ x: 3, y: 4, sprite: 'marin', text: ['Le PC du Centre garde les Pokémon en trop.', 'Ton équipe ne peut compter que six Pokémon.'] }] },
    ],
    npcs: [
      { id: 'jardiniere', x: 12, y: 13, sprite: 'fillette', move: 'wander', text: ['Bienvenue à Floralia ! Respire ce parfum...'] },
      { id: 'garde', x: 17, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 3, tiles: [[17, 1], [18, 1]] }, text: ['Floralia accueille les dresseurs qui ont trois badges.'] },
    ],
  };
  ville(F, 'F');
  zoneSortie(F, 'r5', { name: 'Floralia', music: 'cityFlora', trigger: 'rival3' });

  /* ---------- G · Mirage (Sibylle, Psy) ---------- */
  const G = towns.G = {
    id: 'mirage', name: 'Mirage', x: 276, y: 136, w: 46, h: 34, exits: [['w', 10], ['s', 15], ['w', 28]], gym: 4, stock: 6, music: 'mystic', fermer: true, lotir: { n: 4, seed: 57 },
    roads: [[0, 10, 43, 11], [2, 18, 24, 19], [15, 10, 16, 33], [0, 28, 15, 29], [2, 31, 43, 31], [41, 11, 42, 31]],
    deco: [['flowers', 2, 2, 27, 3], ['lamp', 14, 12], ['lamp', 17, 12], ['pot', 2, 13], ['pot', 13, 16], ['water', 20, 24, 3, 1.4], ['lamp', 14, 30], ['lamp', 17, 30],
      ['sign', 18, 12, 'MIRAGE\nLa ville où l\'esprit voit plus loin.'], ['sign', 25, 30, 'ARÈNE DE MIRAGE\nChampionne : Sibylle\nLe regard qui perce le voile.']],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 2, y: 4 }, { kind: 'mart', ...GRAND.mart, x: 10, dx: 1, y: 5 },
      { kind: 'tower', x: 20, y: 6, roof: 'purple', name: 'Tour Mirage', interior: (id) => tourMirageInterior(id), npcs: [{ x: 5, y: 4, sprite: 'medium', text: ['Les attaques Psy sont puissantes... mais le type Ténèbres ne les craint pas.', 'Et les Insectes ne sont pas si fragiles face à elles.'] }, { x: 8, y: 5, sprite: 'vieil_homme', text: ['Les murs de cette tour racontent les légendes d\'Odyssée.', 'Trois oiseaux gardent les îles de l\'Est : la foudre, le feu et la glace.', 'Deux gardiens règnent sur le ciel et la mer : Ho-Oh, l\'arc-en-ciel, et Lugia, l\'argent des profondeurs.', 'Et au-dessus d\'eux, Odyssor, le géant des océans, qui a guidé les premiers marins jusqu\'ici.'] }] },
      { kind: 'gym', ...GRAND.gym, x: 26, y: 14, roof: 'purple' },
      { kind: 'house', x: 3, y: 13, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'medium', text: ['Je savais que tu viendrais. Ne me demande pas comment.'] }] },
      { kind: 'house', x: 8, dx: 1, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'pecheur', text: ['Au sud, la route 7 descend jusqu\'au Cap Mirage.', 'De là, on aperçoit les îles de l\'archipel.', 'Mais les tourbillons empêchent de traverser à la nage : seul le passeur du Cap y va.'] }] },
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
    deco: [['rock', 26, 13], ['rock', 27, 17], ['rock', 2, 27], ['rock', 17, 21], ['lamp', 22, 12], ['lamp', 22, 17], ['lamp', 19, 19], ['lamp', 22, 25],
      ['flowers', 25, 15, 27, 16], ['flowers', 11, 19, 16, 20],
      ['sign', 22, 5, 'PORT-GRANIT\nÎle de Granit — Porte de l\'archipel.'], ['sign', 12, 17, 'ARÈNE DE GRANIT\nChampion : Basalte\nLe frère cadet.'], ['sign', 24, 25, 'DOJO DE MAMADOU\nCombats Co-op Duo & Trio\nRéservé aux escouades de 2 ou 3 dresseurs !']],
    buildings: [
      // mapId : les identifiants des intérieurs d'avant l'agrandissement (parties arrêtées dedans, dresseurs de l'arène)
      { kind: 'gym', ...GRAND.gym, x: 2, y: 2, roof: 'brown', mapId: 'granit:gym3' },
      { kind: 'mart', ...GRAND.mart, x: 23, y: 3, mapId: 'granit:mart18' },
      { kind: 'house', x: 23, y: 9, roof: 'gray', mapId: 'granit:house15', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Drakos a supprimé l\'impôt sur la pêche ! Les bateaux rentrent enfin les cales pleines.', 'Basalte vient même donner un coup de main sur le port le matin.'] : ['Drakos nous prend la moitié de chaque pêche.', '« Pour protéger les îles », qu\'il dit.', 'Basalte ferme les yeux... c\'est son frère, après tout.'] }] },
      { kind: 'center', ...GRAND.center, x: 3, y: 21, mapId: 'granit:center2' },
      { kind: 'dojo', ...GRAND.dojo, x: 23, y: 20, roof: 'red', mapId: 'granit:dojo', name: 'Dojo de Mamadou' },
      { kind: 'house', x: 12, y: 23, roof: 'brown', mapId: 'granit:house20', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Les trois frères sont nés ici, sur Granit.', 'Basalte est le plus jeune. Pyros garde le volcan, et Drakos... la Grande Île.'] }] },
    ],
    npcs: [
      { id: 'garde-quai', x: 22, y: 2, sprite: 'garde', dir: 'down', script: 'granitDock', text: ['Port-Granit. Ici, c\'est Drakos qui fait la loi, pas la Ligue.'] },
      // le Professeur Cèdre, chercheur des Méga-Évolutions : remet le Méga-Anneau aux dresseurs qui ont 5 badges, puis vend les Méga-Gemmes
      { id: 'mega-chercheuse', x: 17, y: 8, sprite: 'savant', dir: 'down', script: 'megaRing' },
      { id: 'marin', x: 15, y: 22, sprite: 'marin', move: 'wander', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Depuis que tu as battu Drakos, les ferries reprennent la mer vers le continent !', 'Les trois îles respirent enfin.'] : st.badges[5] ? ['Tu as battu Basalte ! Avec Surf, tu peux rejoindre Cendrelune au sud-ouest.', 'Les gardes de Pyros devraient te laisser passer maintenant.'] : ['Avec Surf, tu peux rejoindre Cendrelune, au sud-ouest.', 'Mais les gardes de Pyros ne laissent entrer que ceux qui ont battu Basalte.'] },
    ],
  };
  ville(K, 'K');
  gymGuard(W, K, 5, ['Halte ! L\'arène de Basalte n\'accueille que les dresseurs confirmés.', 'Reviens avec cinq badges.']);
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
      { kind: 'house', x: 2, y: 12, roof: 'brown', mapId: 'cendre:house3', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Les ferries du continent accostent de nouveau sur l\'archipel !', 'On dit que même Pyros et Drakos se reparlent comme avant.'] : ['Le pont qui nous reliait au continent a été coupé sur ordre de Drakos.', 'Il voulait que les îles se débrouillent sans la Ligue.'] }] },
      { kind: 'house', x: 30, y: 12, roof: 'gray', mapId: 'cendre:house22', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Pyros a compris que son frère n\'avait pas besoin qu\'on ferme les îles.', 'Les trois frères se parlent de nouveau. Ça fait chaud au cœur.'] : ['Pyros n\'est pas méchant. Il croit que son frère protège les îles.', 'Mais protéger, ce n\'est pas tout prendre...'] }] },
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
      ['sign', 22, 10, 'FORT-ÉCAILLE\nCapitale de l\'archipel des dragons.'], ['sign', 12, 29, 'TOUR DE DRAKOS\nChampion : Drakos\nL\'aîné des trois frères.']],
    buildings: [
      // mapId : les identifiants des intérieurs d'avant l'agrandissement (parties arrêtées dedans, dresseurs de l'arène)
      { kind: 'gym', ...GRAND.gym, x: 2, y: 14, roof: 'purple', mapId: 'ecaille:gym13' },
      { kind: 'center', ...GRAND.center, x: 23, y: 3, mapId: 'ecaille:center3' }, { kind: 'mart', ...GRAND.mart, x: 31, dx: 1, y: 4, mapId: 'ecaille:mart9' },
      { kind: 'bighouse', x: 23, y: 14, roof: 'purple', mapId: 'ecaille:bighouse23', name: 'Caserne d\'Écaille', interior: (id) => caserneInterior(id), npcs: [{ x: 4, y: 4, sprite: 'garde', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Drakos a ouvert les ports et laissé le passé derrière lui.', 'Nous veillons désormais sur la paix de l\'archipel aux côtés de la Ligue.'] : ['Nous, les Gardes d\'Écaille, servons Drakos.', 'Il a juré qu\'aucun Maître de la Ligue ne dicterait jamais sa loi aux îles.'] }, { x: 7, y: 5, sprite: 'garde', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Depuis que tu as vaincu Drakos, tout le monde respire ici.'] : ['Entre nous... ça fait longtemps que je ne sais plus contre qui on se bat.'] }] },
      { kind: 'house', x: 31, y: 14, roof: 'teal', mapId: 'ecaille:house4', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: (st) => (st.badges[7] || st.flags.drakos) ? ['On raconte que Drakos prépare déjà sa revanche amicale contre Célestine… et contre toi !'] : ['Drakos a perdu contre Célestine, il y a dix ans, en finale de la Ligue.', 'Depuis, il refuse toute autorité. Même celle de la Ligue.'] }] },
      { kind: 'house', x: 24, y: 21, roof: 'red', mapId: 'ecaille:house25', npcs: [{ x: 2, y: 4, sprite: 'vieil_homme', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Le Cap des Étoiles est désormais ouvert au nord de la ville !', 'On raconte qu\'Odyssor, le géant des océans, y passe quand la mer est calme...'] : ['Au nord de la ville, il y a le Cap des Étoiles.', 'On raconte qu\'Odyssor, le géant des océans, y passe quand la mer est calme...', 'Mais Drakos en interdit l\'accès.'] }] },
    ],
    npcs: [
      { id: 'garde-cap', x: 20, y: 2, sprite: 'garde', dir: 'down', gate: { badges: 8, open: (f, g) => (g?.state ? !!(f.drakos || g.state.badges?.[7]) : g.badgeCount() >= 8), tiles: [[20, 1], [21, 1]] }, text: (st) => (st.badges[7] || st.flags.drakos) ? [`La voie du Cap des Étoiles t'est ouverte, Champion${st.gender === 'f' ? 'ne' : ''}.`, 'Puisse le gardien des eaux t\'entendre.'] : ['Le Cap des Étoiles est interdit.', 'Seul Drakos, ou celui qui l\'aura vaincu, peut y passer.'] },
      { id: 'enfant', x: 27, y: 26, sprite: 'enfant', move: 'wander', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Mon papa dit que Drakos sourit de nouveau, depuis son combat contre toi !'] : ['Mon papa dit que Drakos était un héros, avant.'] },
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
      { kind: 'house', x: 19, dx: 1, y: 6, roof: 'purple', npcs: [{ x: 4, y: 4, sprite: 'scientifique', text: ['Les dragons ne craignent presque rien...', 'sauf la Glace, la Fée et les autres dragons.'] }] },
      { kind: 'bighouse', x: 13, y: 11, roof: 'purple', name: 'Musée des Dragons', interior: (id) => museeInterior(id), npcs: [{ x: 5, y: 4, sprite: 'vieil_homme', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Drakos est revenu s\'incliner devant les stèles du musée après votre duel.', 'Les trois frères ont enfin rouvert l\'archipel vers le continent.'] : ['Drakos a grandi en écoutant les histoires de ce musée.', 'Il rêvait de devenir Maître. Célestine l\'a battu en finale.', 'Depuis, il règne sur l\'archipel, loin de la Ligue.'] }, { x: 8, y: 5, sprite: 'scientifique', text: (st) => st.flags.odyssorMet ? ['La fresque d\'Odyssor semble briller davantage depuis ta rencontre au Cap des Étoiles !', 'Les anciens avaient raison : les deux gardiens des eaux veillent sur un archipel réconcilié.'] : (st.badges[7] || st.flags.drakos) ? ['Tu as vaincu Drakos : les îles et le continent se réconcilient enfin.', 'Va au nord de Fort-Écaille, au Cap des Étoiles... Odyssor doit déjà s\'y montrer !'] : ['Regarde cette fresque : un Pokémon immense nageant sous la mer étoilée.', 'Odyssor. Les anciens disaient qu\'il apparaît au Cap des Étoiles quand les îles et le continent se réconcilient.', 'À côté, un oiseau d\'argent plonge dans la mer : Lugia. On dit qu\'Odyssor et Lugia sont les deux gardiens des eaux.'] }] },
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
    // quatre jardins de part et d'autre de l'allée : massifs en bordure, cerisiers, statues, fontaines et lanternes
    deco: [
      ['flowers', 3, 17, 9, 17], ['flowers', 3, 27, 9, 27], ['flowers', 3, 18, 3, 26], ['flowers', 9, 18, 9, 26],
      ['flowers', 24, 17, 30, 17], ['flowers', 24, 27, 30, 27], ['flowers', 24, 18, 24, 26], ['flowers', 30, 18, 30, 26],
      ['cerisier', 5, 19], ['cerisier', 7, 25], ['statue', 6, 22], ['banc', 5, 25],
      ['cerisier', 28, 19], ['cerisier', 26, 25], ['statue', 27, 22], ['banc', 28, 25],
      ['flowers', 3, 40, 9, 40], ['flowers', 3, 50, 9, 50], ['flowers', 3, 41, 3, 49], ['flowers', 9, 41, 9, 49], ['fontaine', 5, 45], ['lanterne', 4, 42], ['lanterne', 8, 48],
      ['flowers', 24, 40, 30, 40], ['flowers', 24, 50, 30, 50], ['flowers', 24, 41, 24, 49], ['flowers', 30, 41, 30, 49], ['fontaine', 27, 45], ['lanterne', 29, 42], ['lanterne', 25, 48],
      ['lamp', 10, 51], ['lamp', 23, 51], ['lanterne', 10, 16], ['lanterne', 23, 16],
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

  const r1 = G2({ id: 'r1', nom: 'Route 1', de: porte('A', 'r1'), vers: arrivee('B', 'r1'), long: 5, graine: 101, w: 13, grass: 0.8, trees: 0.04, paysages: ['rebords', 'prairie', 'fleurs'], branches: 0, dresseurs: 0, promeneurs: 1, panneaux: ['ROUTE 1\n↑ Sylvebourg   ↓ Bourg-Aube', null], voix: 'general' }, 'r1');
  const pGuide = along(r1, 0.06);
  const [gx, gy] = caseLibre(W, pGuide.x + 0.5 + pGuide.nx * 2, pGuide.y + 0.5 + pGuide.ny * 2);
  W.npc({
    id: 'r1:guide',
    x: gx,
    y: gy,
    dir: 'left',
    sprite: 'randonneuse',
    name: 'Guide de la Route',
    text: [
      'Bienvenue sur la Route 1 ! Tu as des Poké Balls sur toi ?',
      'Pour capturer facilement un Pokémon sauvage, affaiblis-le d\'abord dans les herbes.',
      'Astuce de pro : en combat sauvage, appuie directement sur B ou Y pour lancer ta meilleure Ball sans passer par les menus !'
    ]
  });
  routeTrainer(W, r1, 0.35, 1, 4, 'Gamin', 'Léo', [[1013, 3]], { intro: 'Hé ! Toi aussi tu viens d\'avoir ton premier Pokémon ?' });
  routeTrainer(W, r1, 0.62, -1, 4, 'Fillette', 'Inès', [[161, 4]], { intro: 'Mon Fouinette est le plus mignon de la route !' });
  routeTrainer(W, r1, 0.82, 1, 3, 'Gamin', 'Malo', [[1010, 4], [19, 4]]);
  routeTrainer(W, r1, 0.5, 1, 5, 'Fillette', 'Chloé', [[16, 4]]);
  routeItem(W, r1, 0.5, -1, 5, 'potion'); routeItem(W, r1, 0.9, 1, 5, 'poke-ball', 2);

  const H1 = relais(143, 196, 'e');
  const r2 = G2({ id: 'r2', nom: 'Route 2', de: porte('B', 'r2'), vers: H1, effile: [true, false], long: 15, graine: 202, w: 11, grass: 0.7, trees: 0.05, flowers: 0.03, paysages: ['prairie', 'fleurs', 'bosquet', 'plateau', 'etang', 'riviere', 'rebords'], branches: 0.45, raccourci: 'coupe', anciens: 4, panneaux: ['ROUTE 2\n↑ Bois Murmure   ↓ Sylvebourg', null], voix: 'general' }, 'r2', 'route2');
  routeTrainer(W, r2, 0.2, -1, 3, 'Insectomane', 'Noé', [[1017, 10], [1018, 10, null, [33, 81, 106]], [10, 11]]);
  routeTrainer(W, r2, 0.45, 1, 3, 'Fillette', 'Jade', [[1039, 11], [29, 11]]);
  routeTrainer(W, r2, 0.7, -1, 4, 'Gamin', 'Sacha', [[21, 12], [1034, 11]]);
  routeTrainer(W, r2, 0.9, 1, 3, 'Topdresseuse', 'Alba', [[1021, 12], [43, 12], [1011, 13]]);
  routeItem(W, r2, 0.33, 1, 4, 'antidote'); routeItem(W, r2, 0.6, -1, 4, 'potion', 2); routeItem(W, r2, 0.8, 1, 5, 'repel');
  { const p = along(r2, 0.02), [x, y] = nearestWalkable(W, p.x, p.y); W.zone(x - 8, y - 5, x + 8, y + 5, { name: 'Route 2', music: 'route2', trigger: 'rival2' }); }

  // le Bois Murmure : une forêt dense et sombre (on marche à l'ombre des frondaisons), un sentier qui serpente, deux
  // cabanes, une clairière cachée derrière un passage dans les arbres
  const bois = G2({ id: 'bois', nom: 'Bois Murmure', de: relais(144, 196, 'e'), vers: arrivee('C', 'bois'), effile: [false, true], long: 7, graine: 303, w: 11, grass: 1.3, tall: T.DARKTALL, trees: 0.3, flowers: 0, theme: 'forest', ombre: 0.78, paysages: ['bosquet', 'prairie', 'bosquet', 'etang'], branches: 0, anciens: 4, voix: 'bois', bande: [4, 5], panneaux: [null, 'BOIS MURMURE\n↑ Pierrefort'] }, 'bois', 'forest');
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
    vieille.prop('books', 6, 2); vieille.object(6, 2, { use: async (A) => A.say(['Un vieux carnet est resté ouvert sur l\'étagère. L\'écriture est pâle :', '« Le jour où j\'ai posé la Poké Ball dorée sur l\'autel, les feuilles se sont figées en l\'air. »', '« Puis tout est reparti, comme si de rien n\'était. J\'ai reperdu la Poké Ball depuis. »', '... La suite est illisible.']) });
    W.prop('rocher_grand', cx2 - 4, cy2 + 2); W.prop('tonneau', cx2 + 4, cy2 - 1);
    // la clairière cachée : un passage d'une case entre les arbres, un cercle de pierres, une silhouette qui parle par énigmes
    W.rect(cx3 - 3, cy3 - 3, cx3 + 2, cy3 + 2, T.GRASS, [T.TREE, T.PINE, T.DARKTALL]);
    { const [px, py] = versChemin(b3), dedans = (x, y) => x >= cx3 - 3 && x <= cx3 + 2 && y >= cy3 - 3 && y <= cy3 + 2;
      let x = cx3, y = cy3; while (x !== px || y !== py) { if (x !== px) x += Math.sign(px - x); else y += Math.sign(py - y); if (dedans(x, y)) continue; if (walkable(W.get(x, y))) break; W.set(x, y, T.GRASS); W.setHeight(x, y, W.height(px, py)); } }
    for (const [x, y] of [[cx3 - 3, cy3 - 3], [cx3 + 2, cy3 - 3], [cx3 - 3, cy3 + 2], [cx3 + 2, cy3 + 2], [cx3 - 1, cy3 - 3]]) W.prop('rocher_grand', x, y);
    W.prop('stele', cx3, cy3 - 1); W.object(cx3, cy3 - 1, { use: async (A) => A.say('Une pierre couverte de mousse. On y devine des feuilles gravées en spirale,\net, au centre, un petit Pokémon aux ailes rondes.') });
    W.npc({ id: 'bois:silhouette', x: cx3 - 1, y: cy3 + 1, sprite: 'medium', dir: 'left', text: ['Tu as trouvé le passage. Peu de gens le voient.', 'Ce bois murmure parce qu\'il se souvient. Hier, demain... pour lui, c\'est la même chose.', 'Ceux qui portent ce qu\'il attend trouvent toujours l\'autel.'] });
    W.item(cx3 + 1, cy3, 'rare-candy');
  }
  routeTrainer(W, bois, 0.2, 1, 4, 'Insectomane', 'Adam', [[1017, 12], [1020, 13], [165, 13]]);
  routeTrainer(W, bois, 0.42, -1, 4, 'Randonneuse', 'Clara', [[1015, 13], [69, 13]]);
  routeTrainer(W, bois, 0.65, 1, 3, 'Insectomane', 'Timothée', [[167, 14], [1019, 14]]);
  routeTrainer(W, bois, 0.85, -1, 4, 'Topdresseur', 'Yanis', [[1043, 14], [1011, 14], [1021, 14]]);
  routeItem(W, bois, 0.3, -1, 6, 'super-potion'); routeItem(W, bois, 0.55, 1, 6, 'paralyze-heal'); routeItem(W, bois, 0.75, -1, 6, 'moon-stone');

  // route 3 : elle serpente vers le Mont Lunaire et grimpe sur ses contreforts jusqu'à la Grotte Lunaire, qui le traverse
  const { dx: LX, dy: LY } = LUNAIRE;
  // les abords des deux bouches de la grotte : un replat d'herbe (au pied du sentier du Mont, devant la sortie est)
  W.rect(141 + LX, 34 + LY, 154 + LX, 42 + LY, T.GRASS); W.rect(166 + LX, 35 + LY, 178 + LX, 43 + LY, T.GRASS);
  const g1in = W.building('cave', 146 + LX, 38 + LY), g1out = W.building('cave', 171 + LX, 38 + LY);
  const r3a = G2({ id: 'r3', nom: 'Route 3', de: porte('C', 'r3'), vers: { x: g1in.doorX, y: g1in.doorY + 1, dir: 'n' }, long: 6, graine: 404, w: 10, grass: 0.8, trees: 0.04, rocks: 0.02, paysages: ['rochers', 'prairie', 'bosquet', 'fleurs'], branches: 0.5, anciens: 4, panneaux: ['ROUTE 3\n→ Grotte Lunaire, Mont Lunaire', null], voix: 'montagne' }, 'r3');
  plateau(W, polygone([[137.5 + LX, 27 + LY], [153 + LX, 25 + LY], [154.5 + LX, 34 + LY], [153.5 + LX, 47.5 + LY], [146 + LX, 48.5 + LY], [137.5 + LX, 47.5 + LY]]), 1);
  routeTrainer(W, r3a, 0.35, 1, 3, 'Montagnard', 'Béranger', [[1026, 14], [74, 15], [66, 15]]);
  routeTrainer(W, r3a, 0.7, -1, 3, 'Fillette', 'Lise', [[1039, 15], [35, 14]]);
  routeItem(W, r3a, 0.55, 1, 4, 'burn-heal');
  routeTrainer(W, r3a, 0.15, -1, 3, 'Gamin', 'Joris', [[1024, 14], [21, 14]]);
  routeTrainer(W, r3a, 0.88, 1, 3, 'Randonneuse', 'Célia', [[1026, 15], [1039, 15]]);
  const r3b = G2({ id: 'r3e', nom: 'Route 3', de: { x: g1out.doorX, y: g1out.doorY + 1, dir: 's' }, vers: arrivee('D', 'r3e'), long: 7, graine: 505, w: 9, grass: 0.6, trees: 0.03, paysages: ['prairie', 'rochers', 'fleurs', 'etang'], branches: 0.5, anciens: 1, panneaux: [null, 'ROUTE 3\n→ Port-Azur'], voix: 'montagne' }, 'r3');
  plateau(W, polygone([[167.5 + LX, 26 + LY], [181.5 + LX, 26 + LY], [181.5 + LX, 47.5 + LY], [167.5 + LX, 47.5 + LY]]), 1);
  routeTrainer(W, r3b, 0.6, -1, 3, 'Randonneuse', 'Maëlle', [[1034, 16], [27, 16]]);

  // route 4 : elle monte sur les falaises qui dominent la mer, longe le bord, puis redescend vers Voltacité
  const r4 = G2({ id: 'r4', nom: 'Route 4', de: porte('D', 'r4'), vers: arrivee('E', 'r4'), long: 11, graine: 606, w: 12, grass: 0.6, trees: 0.03, flowers: 0.03, paysages: ['plateau', 'prairie', 'fleurs', 'etang', 'rochers', 'riviere'], branches: 0.4, raccourci: 'coupe', anciens: 4, panneaux: ['ROUTE 4\n→ Voltacité', 'ROUTE 4\n← Port-Azur'], voix: 'mer' }, 'r4', 'route2');
  routeTrainer(W, r4, 0.18, -1, 4, 'Pêcheur', 'Yves', [[1031, 19], [1029, 19], [60, 19]]);
  routeTrainer(W, r4, 0.4, 1, 4, 'Marin', 'Loïc', [[66, 20], [1033, 20]]);
  routeTrainer(W, r4, 0.62, -1, 4, 'Fillette', 'Romane', [[1037, 20], [179, 21]]);
  routeTrainer(W, r4, 0.85, 1, 3, 'Topdresseur', 'Kylian', [[1011, 21], [84, 21], [1026, 22]]);
  routeItem(W, r4, 0.3, 1, 5, 'great-ball', 2); routeItem(W, r4, 0.72, -1, 5, 'water-stone', 1, 'monde:265,47');   // identifiant d'avant les talus (anciennes sauvegardes)

  const r5 = G2({ id: 'r5', nom: 'Route 5', de: porte('E', 'r5'), vers: arrivee('F', 'r5'), long: 17, graine: 707, w: 12, grass: 0.75, trees: 0.05, rocks: 0.01, paysages: ['prairie', 'rebords', 'rochers', 'etang', 'fleurs', 'riviere', 'bosquet'], branches: 0.4, raccourci: 'eclate', anciens: 5, panneaux: ['ROUTE 5\n↓ Floralia', 'ROUTE 5\n↑ Voltacité'], voix: 'general' }, 'r5');
  // au milieu de la route, un tertre : un escalier taillé y grimpe, sa falaise domine le sentier
  tertre(W, r5, 0.5, 'ether', 2);
  routeTrainer(W, r5, 0.12, 1, 4, 'Scientifique', 'Aurélien', [[1036, 26], [100, 26], [81, 27]]);
  routeTrainer(W, r5, 0.3, -1, 4, 'Randonneuse', 'Élise', [[77, 27], [1014, 27]]);
  routeTrainer(W, r5, 0.46, 1, 4, 'Karatéka', 'Kenji', [[66, 28], [1033, 29]]);
  routeTrainer(W, r5, 0.6, -1, 4, 'Gamin', 'Nathan', [[1034, 27], [22, 27], [209, 28]]);
  routeTrainer(W, r5, 0.78, 1, 4, 'Topdresseuse', 'Zoé', [[1037, 29], [1043, 28], [179, 28]]);
  routeItem(W, r5, 0.22, -1, 5, 'super-potion', 2); routeItem(W, r5, 0.5, 1, 5, 'thunder-stone'); routeItem(W, r5, 0.7, -1, 5, 'full-heal'); routeItem(W, r5, 0.9, 1, 5, 'rare-candy');

  const r6 = G2({ id: 'r6', nom: 'Route 6', de: porte('F', 'r6'), vers: arrivee('G', 'r6'), long: 10, graine: 808, w: 12, grass: 0.8, trees: 0.06, flowers: 0.04, paysages: ['fleurs', 'prairie', 'plateau', 'etang', 'bosquet'], branches: 0.4, anciens: 4, panneaux: ['ROUTE 6\n→ Mirage', 'ROUTE 6\n← Floralia'], voix: 'general' }, 'r6', 'route2');
  // une falaise boisée et un petit belvédère où l'on monte par un escalier taillé
  tertre(W, r6, 0.8, 'elixir', 1);
  routeTrainer(W, r6, 0.15, 1, 4, 'Randonneuse', 'Nina', [[1038, 31], [70, 31]]);
  routeTrainer(W, r6, 0.35, -1, 4, 'Insectomane', 'Thibault', [[1019, 32], [127, 32]]);
  routeTrainer(W, r6, 0.55, 1, 3, 'Médium', 'Gwenaëlle', [[1023, 32], [92, 32], [1039, 33]]);
  routeTrainer(W, r6, 0.75, -1, 4, 'Topdresseur', 'Axel', [[47, 33], [1020, 33], [1016, 34]]);
  routeItem(W, r6, 0.25, -1, 5, 'leaf-stone'); routeItem(W, r6, 0.65, 1, 5, 'hyper-potion'); routeItem(W, r6, 0.9, -1, 5, 'revive');

  // route 7 : de Mirage au Cap Mirage, face à l'archipel
  const CAP = { x: 830, y: 548 };
  const r7 = G2({ id: 'r7', nom: 'Route 7', de: porte('G', 'r7'), vers: { x: CAP.x, y: CAP.y, dir: 's' }, effile: [true, false], long: 6, graine: 909, w: 12, grass: 0.7, trees: 0.04, rocks: 0.03, paysages: ['rebords', 'rochers', 'prairie', 'fleurs'], branches: 0.4, anciens: 4, panneaux: ['ROUTE 7\n↓ Cap Mirage', null], voix: 'mer' }, 'r7');
  routeTrainer(W, r7, 0.25, 1, 4, 'Médium', 'Ophélie', [[1023, 36], [97, 37]]);
  routeTrainer(W, r7, 0.55, -1, 4, 'Karatéka', 'Bruno', [[1033, 37], [107, 37], [106, 38]]);
  routeTrainer(W, r7, 0.8, 1, 4, 'Topdresseuse', 'Lou', [[78, 38], [1012, 39], [1040, 38]]);
  routeTrainer(W, r7, 0.4, 1, 3, 'Pêcheur', 'Yohan', [[1029, 36], [118, 37]]);
  routeItem(W, r7, 0.4, -1, 5, 'fire-stone'); routeItem(W, r7, 0.25, 1, 5, 'eviolite', 1, 'item:r7:eviolite');
  // Cap Mirage : plage, ponton et le rival qui attend
  { const { x, y } = CAP; W.rect(x - 22, y, x + 22, y + 6, T.SAND, [T.TREE, T.GRASS, T.TALL, T.WATER, T.FLOWER]); W.rect(x - 22, y + 7, x + 22, y + 9, T.WATER, [T.TREE, T.GRASS, T.SAND, T.TALL]);
    W.rect(x - 18, y + 4, x + 18, y + 6, T.SAND, [T.WATER]);
    W.zone(x - 22, y - 2, x + 22, y + 6, { name: 'Cap Mirage', music: 'route', trigger: 'rival4' });
    W.sign(x + 9, y + 1, 'CAP MIRAGE\nAu sud-est : Île de Granit. Au sud : Cendrelune.\nTourbillons au large : baignade interdite. Passeur pour l\'archipel.');
    W.npc({ id: 'cap:pecheur', x: x - 6, y: y + 2, sprite: 'pecheur', dir: 'down', text: (st) => (st.badges[7] || st.flags.drakos) ? ['Les ferries traversent de nouveau le détroit jusqu\'à Port-Granit !', 'Tu as réussi là où la Ligue hésitait depuis des années : les trois frères sont réconciliés.'] : ['Les trois îles que tu vois là-bas, ce sont les îles des trois frères.', 'Granit, la plus proche. Puis Cendrelune, le volcan. Et la Grande Île, tout au fond.', 'Drakos, l\'aîné, règne sur les trois depuis Fort-Écaille.', 'Même avec le Harnais Flottant, n\'essaie pas d\'y aller à la nage : les tourbillons t\'avaleraient. Le passeur du Cap t\'y emmènera.', 'Là-bas, ton Harnais te servira pour passer d\'une île à l\'autre.'] }); }

  // Grande Île : route 11 (de la plage est à Fort-Écaille, par une passe rocheuse) et forêt d'Écaille au sud
  const PLAGE11 = { x: 668, y: 744 };
  const r11 = G2({ id: 'r11', nom: 'Route 11', de: { x: PLAGE11.x, y: PLAGE11.y, dir: 'w' }, vers: arrivee('L', 'r11'), effile: [false, true], long: 6, graine: 1111, w: 10, grass: 0.8, trees: 0.06, rocks: 0.05, paysages: ['rochers', 'prairie', 'bosquet'], branches: 0.4, anciens: 2, voix: 'mer' }, 'ecaille');
  W.rect(PLAGE11.x - 2, PLAGE11.y - 4, PLAGE11.x + 6, PLAGE11.y + 5, T.SAND, [T.TREE, T.GRASS, T.TALL]);
  // la passe : des rochers fissurés barrent la route sur toute sa largeur (Éclate-Roc)
  { const p = along(r11, 0.55); for (let k = -12; k <= 12; k++) { const x = Math.round(p.x + p.nx * k), y = Math.round(p.y + p.ny * k); for (const [xx, yy] of [[x, y], [x + 1, y], [x, y + 1]]) { const t = W.get(xx, yy); if (t !== T.TREE && t !== T.PINE && t !== T.CLIFF && t !== T.WATER) W.set(xx, yy, T.SMASH); } } }
  // la passe est une gorge : deux murailles de roche l'enserrent, de part et d'autre du sentier
  { const g = [...bande(r11, 2.6, 12, 1, 0.3, 0.72), ...bande(r11, 2.6, 12, -1, 0.3, 0.72)];
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
  // Méga-Gemmes et légendaires à Méga (Arcadia), une fois le Méga-Anneau reçu à Port-Granit
  gemmes(W, r7, 0, [[0.5, 1, 'tyranitarite']]); gemmes(W, r9, 1, [[0.6, 1, 'lucarionite']]);
  gemmes(W, r10, 2, [[0.3, -1, 'gyaradosite'], [0.8, 1, 'aerodactylite']]); gemmes(W, r11, 3, [[0.5, 1, 'absolite']]);
  gemmes(W, r12, 4, [[0.4, -1, 'scizorite'], [0.85, 1, 'heracronite']]);
  legend({ id: 'latias', sp: 380, lvl: 50, ...xy(offRoute(r10, 0.55, -1, 3)), cond: (f, g) => g.badgeCount() >= 8 && (!!f.drakos || !!g.state?.badges?.[7]), intro: ['Un souffle chaud frôle la route...', 'Un Pokémon rouge et blanc plane en silence : Latias !'] });
  legend({ id: 'diancie', sp: 719, lvl: 55, ...xy(offRoute(r12, 0.6, -1, 3)), cond: (f, g) => g.badgeCount() >= 8 && (!!f.drakos || !!g.state?.badges?.[7]), intro: ['Des cristaux roses scintillent entre les arbres...', 'Une petite princesse de diamant apparaît : Diancie !'] });
  // le passeur du Cap Mirage et le ponton de Port-Granit : le seul bateau qui franchit les tourbillons de l'archipel
  // (5 badges : on y vient d'abord à pied, par Mirage ; le bateau de l'Embarcadère n'y mène pas plus tôt)
  pierV('cap', 'Cap Mirage', CAP.x + 12, CAP.y + 7, 1, 2, 5, { town: 'Cap Mirage' });
  pierV('granit', 'Île de Granit (Port-Granit)', quaiGranit[0], quaiGranit[1] - 1, -1, 1, 5, { town: 'Port-Granit' });

  // Bois Murmure : l'autel de Celebi (la Balle GS vient d'une vieille dame de Sylvebourg)
  // une allée part du sentier jusqu'à l'autel : Celebi s'y tient toujours sur une case qu'on atteint, quel que soit le tracé
  { const p = along(bois, 0.5), pas = [];
    for (let d = 1; d <= 5; d++) { const x = Math.floor(p.x + 0.5 + p.nx * d), y = Math.floor(p.y + 0.5 + p.ny * d); if (!pas.some(([a, b]) => a === x && b === y)) pas.push([x, y]); }
    pas.forEach(([x, y], i) => { const q = pas[i - 1]; if (q && q[0] !== x && q[1] !== y && !walkable(W.get(x, q[1]))) W.set(x, q[1], T.GRASS); if (!walkable(W.get(x, y))) W.set(x, y, T.GRASS); });
    const [sx, sy] = pas[pas.length - 1], [cx, cy] = pas[pas.length - 2]; thing('statue', sx, sy, { type: 'shrine' });
    legend({ id: 'celebi', sp: 251, lvl: 30, x: cx, y: cy, cond: 'celebi', intro: ['La GS Ball se met à trembler...', 'Un petit Pokémon vert surgit d\'entre les feuilles : Celebi !'] }); }

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
      deco: [['lamp', 12, 8], ['lamp', 15, 8], ['flowers', 16, 13, 18, 16], ['sign', 11, 11, 'PORT-ORAGE\nL\'île où gronde le tonnerre.'], ['rock', 24, 16],
        // un village de pêcheurs : caisses et tonneaux près du ponton, bouée, bancs, jardinets fleuris et clôtures
        ['caisses', 2, 11], ['tonneau', 3, 11], ['tonneau', 2, 12], ['bouee', 1, 8], ['caisses', 24, 12], ['tonneau', 25, 12],
        ['banc', 10, 12], ['banc', 17, 12], ['flowers', 8, 14, 9, 16], ['flowers', 23, 14, 24, 15],
        ['fence', 2, 18, 11, 18], ['fence', 16, 18, 25, 18]],
      buildings: [
        { kind: 'center', x: 3, dx: -1, y: 3 }, { kind: 'mart', x: 8, dx: 1, y: 3 },
        { kind: 'tower', x: 21, y: 3, roof: 'red', name: 'Phare de l\'Orage', npcs: [{ id: 'gardien', x: 5, y: 4, sprite: 'scientifique', script: 'phare' }] },
        { kind: 'house', x: 16, dx: -1, y: 4, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['Les orages d\'ici ne sont pas naturels.', 'Mon grand-père disait qu\'un grand oiseau de foudre dort sur le Pic Tonnerre.'] }] },
        { kind: 'house', x: 3, y: 13, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['À l\'est, au bout de la côte, il y a de vieilles ruines.', 'Trois stèles racontent l\'histoire d\'un Pokémon minuscule, rose comme l\'aube...'] }] },
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
    legend({ id: 'raikou', sp: 243, lvl: 50, ...xy(offRoute(so, 0.55, 1, 2)), cond: 'beasts', intro: ['Un rugissement fait trembler l\'herbe...', 'C\'est Raikou, la bête du tonnerre, échappée de la Tour Cendrée !'] });
    // Côte des Ruines : trois stèles, l'autel de Mew, et le sanctuaire scellé de Mewtwo
    const cr = R('orage2', 'Côte des Ruines', [[379.5, 215.5], [394, 221], [410, 225], [424, 225]], { w: 10, grass: 0.8, trees: 0.04, flowers: 0.03 }, 'orage', 'island');
    routeTrainer(W, cr, 0.3, 1, 3, 'Médium', 'Céleste', [[1039, 26], [1023, 27]]);
    routeTrainer(W, cr, 0.65, -1, 3, 'Karatéka', 'Tao', [[1033, 27], [66, 27], [1037, 28]]);
    routeItem(W, cr, 0.5, 1, 4, 'great-ball', 3);
    const STELES = [
      'STÈLE I\n« Avant les hommes, avant les villes, un Pokémon minuscule portait en lui tous les autres. »',
      'STÈLE II\n« Il jouait dans le vent des îles, invisible à ceux qui le cherchaient. »',
      'STÈLE III\n« Qui aura lu les trois pierres et porté quatre badges le verra danser sur l\'autel. »',
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
    gemmes(W, so, 5, [[0.5, -1, 'ampharosite']]); gemmes(W, cr, 6, [[0.6, 1, 'gengarite']]);
    legend({ id: 'latios', sp: 381, lvl: 50, ...xy(offRoute(cr, 0.35, 1, 3)), cond: (f, g) => g.badgeCount() >= 8, intro: ['Une ombre bleue file au ras des vagues...', 'C\'est Latios !'] });
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
        { kind: 'center', ...GRAND.center, x: 3, dx: -1, y: 4, mapId: 'grue:center5' }, { kind: 'mart', ...GRAND.mart, x: 11, y: 4, mapId: 'grue:mart10' },
        { kind: 'house', w: 5, d: 5, h: 3, door: 2, modele: 'maisonThe', x: 25, y: 15, roof: 'gray', id: 'the', name: 'Maison de thé', npcs: [{ x: 4, y: 4, sprite: 'dame', text: ['Une tasse de thé ? Les Sages s\'arrêtaient toujours ici avant de prendre le bateau.', 'Leur tour dorée est sur le continent, dans la Forêt des Torii, au sud-ouest de Mirage.', 'Tout près de la Tour Cendrée, sa sœur brûlée.'] }] },
        { kind: 'house', x: 4, y: 16, roof: 'brown', id: 'doyenne', name: 'Maison de la Doyenne', npcs: [{ id: 'doyenne', x: 4, y: 4, sprite: 'dame', script: 'doyenne' }] },
        { kind: 'house', x: 22, y: 4, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Il y a longtemps, trois Pokémon ont péri dans l\'incendie d\'une tour : la Tour Cendrée,', 'la sœur de la Tour Dorée. Les deux tours se dressent côte à côte dans la Forêt des Torii, sur le continent.', 'On raconte que Ho-Oh a ramené les trois Pokémon à la vie : Raikou, Entei et Suicune.'] }] },
        { kind: 'house', x: 10, y: 17, roof: 'teal', npcs: [{ x: 2, y: 4, sprite: 'montagnard', text: ['À l\'est, le chemin du Mont Brasier est barré par des arbustes.', 'Avec Coupe, tu pourrais aller voir le cratère... on dit qu\'un oiseau de feu y niche.'] }] },
      ],
      npcs: [{ id: 'enfant', x: 12, y: 15, sprite: 'enfant', move: 'wander', text: ['Mamie dit que la Tour Dorée, sur le continent, touche presque les nuages !', 'Avant, on l\'appelait la Tour de la Grue, comme notre village.'] }],
    };
    buildTown(W, maps, G2);
    W.rect(350, 124, 355, 125, T.SAND);
    pier('grue', 'Île de la Grue (Hautegrue)', 349, 124, -1, 5, 3, { town: 'Hautegrue', music: 'mystic' });
    // Sentier des Pins, au nord du village
    const sp1 = R('grue1', 'Sentier des Pins', [[370.5, 112], [370.5, 100], [384, 90], [396, 86], [404, 85]], { w: 11, grass: 0.9, trees: 0.06, treeT: T.PINE, flowers: 0.02 }, 'grue', 'forest');
    routeTrainer(W, sp1, 0.2, -1, 4, 'Randonneuse', 'Opaline', [[1021, 29], [1038, 30], [69, 29]]);
    routeTrainer(W, sp1, 0.45, 1, 4, 'Médium', 'Séléné', [[1039, 30], [1023, 31]]);
    routeTrainer(W, sp1, 0.75, -1, 4, 'Topdresseur', 'Léonard', [[1043, 31], [1011, 31], [58, 31]]);
    routeItem(W, sp1, 0.3, 1, 5, 'great-ball', 3); routeItem(W, sp1, 0.6, -1, 5, 'hyper-potion'); routeItem(W, sp1, 0.95, 1, 3, 'rare-candy');
    // Chemin du Mont Brasier, à l'est : des arbustes à couper (Coupe) mènent au cratère de Sulfura
    const mb = R('grue2', 'Chemin du Brasier', [[387.5, 124.5], [400, 120], [412, 112], [423.5, 102]], { w: 10, grass: 0.8, trees: 0.04, rocks: 0.04 }, 'brasier', 'volcano');
    routeTrainer(W, mb, 0.35, 1, 4, 'Karatéka', 'Kaito', [[1033, 31], [66, 31], [1041, 32]]);
    routeTrainer(W, mb, 0.7, -1, 4, 'Montagnard', 'Damien', [[1042, 32], [1028, 31], [74, 31]]);
    W.rect(423, 88, 424, 103, T.PATH); W.set(423, 95, T.CUT); W.set(424, 95, T.CUT);
    W.rect(414, 76, 432, 87, T.ASH); W.rect(423, 78, 424, 87, T.PATH);
    W.prop('rock', 416, 78); W.prop('rock', 430, 79); W.prop('rock', 417, 85);
    W.zone(412, 75, 433, 94, { name: 'Cratère du Brasier', music: 'volcano', theme: 'volcanic' });
    legend({ id: 'moltres', sp: 146, lvl: 38, x: 423, y: 79, intro: ['La chaleur devient insoutenable...', 'Sulfura, l\'oiseau de feu, s\'élève du cratère !'] });
    legend({ id: 'entei', sp: 244, lvl: 50, ...xy(offRoute(mb, 0.5, -1, 2)), cond: 'beasts', intro: ['Le sol se met à fumer...', 'C\'est Entei, la bête du feu !'] });
    gemmes(W, mb, 7, [[0.5, -1, 'houndoominite']]);
  }, { fond: T.WATER });

  atelier(ctxA, [336, 0, 439, 66], 640, 40, (W) => {
    const { R, pier, flagGate, thing, offRoute } = outils(W);
    /* ---------- Île Givrée (5 badges) : Artikodin, Lugia et Suicune ---------- */
    W.rect(344, 3, 436, 62, T.TREE);
    W.zone(340, 0, 439, 64, { name: 'Île Givrée', music: 'snow', theme: 'snow' });   // posée avant les routes : elles passent devant
    const Gv = towns.V = {
      id: 'givre', name: 'Givrebourg', x: 350, y: 36, w: 28, h: 20, exits: [['w', 8], ['n', 14], ['e', 8]], stock: 6, music: 'snow', ground: T.SNOW, theme: 'snow',
      roads: [[0, 8, 27, 9, T.PATH], [14, 0, 15, 19, T.PATH]],
      deco: [['water', 22, 15, 3, 2], ['lamp', 13, 7], ['lamp', 16, 7], ['trees', 1, 16, 3, 18, T.PINE],
        // au bout du monde : pins, lanternes allumées dans la neige, réserves des pêcheurs, clôture du lac gelé
        ['trees', 24, 2, 26, 4, T.PINE], ['lanterne', 12, 11], ['lanterne', 17, 11], ['banc', 20, 11], ['tonneau', 2, 10], ['caisses', 3, 10],
        ['fence', 18, 18, 26, 18], ['rock', 25, 12],
        ['sign', 11, 10, 'GIVREBOURG\nLe village au bout du monde.']],
      buildings: [
        { kind: 'center', x: 3, y: 2 }, { kind: 'mart', x: 9, dx: 1, y: 2 },
        { kind: 'house', x: 19, y: 3, roof: 'gray', id: 'ermite', name: 'Cabane de l\'Ermite', npcs: [{ id: 'ermite', x: 4, y: 4, sprite: 'montagnard', script: 'ermite' }] },
        { kind: 'house', x: 3, y: 12, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'habitante', text: ['Sous l\'île, la mer creuse des grottes immenses.', 'Les tourbillons y sont si forts que personne n\'en revient... sauf ceux que Lugia laisse passer.', 'Ma grand-mère disait que Lugia et Ho-Oh étaient autrefois amis. Depuis l\'incendie de la vieille tour, Lugia veille sur son île et Ho-Oh sur sa tour dorée.'] }] },
        { kind: 'house', x: 9, y: 13, roof: 'teal', npcs: [{ x: 4, y: 4, sprite: 'pecheur', text: ['La Glace craint le Feu, le Combat, la Roche et l\'Acier.', 'Pense à prendre de quoi soigner le gel !'] }] },
      ],
      npcs: [{ id: 'enfant', x: 18, y: 11, sprite: 'enfant', move: 'wander', text: ['Il neige tout le temps ici. J\'adore !'] }],
    };
    buildTown(W, maps, Gv);
    W.rect(344, 44, 351, 45, T.SAND);
    pier('givre', 'Île Givrée (Givrebourg)', 343, 44, -1, 3, 5, { town: 'Givrebourg', music: 'snow' });
    const pg = R('givre1', 'Pente Givrée', [[364.5, 36], [364.5, 24], [380, 16], [398, 12], [414, 10]], { w: 11, grass: 0.8, trees: 0.06, treeT: T.PINE, rocks: 0.03, theme: 'snow' }, 'givre', 'snow');
    routeTrainer(W, pg, 0.2, 1, 4, 'Skieuse', 'Neige', [[1045, 38], [225, 38], [86, 39]], { intro: 'Attention, ça glisse !' });
    routeTrainer(W, pg, 0.45, -1, 4, 'Alpiniste', 'Benoît', [[220, 39], [1028, 39], [1027, 40]]);
    routeTrainer(W, pg, 0.7, 1, 4, 'Topdresseuse', 'Noémie', [[1046, 41], [124, 40], [1040, 41]]);
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
  for (let x = 2; x <= 6; x++) for (let y = 26; y < tourb.h; y++) if (x !== 4 || y !== 26) tourb.set(x, y, T.CAVEWALL);   // sortie au bout de la salle
    tourb.warp(4, 26, { map: 'monde', x: tb.doorX, y: tb.doorY + 1, dir: 'down' });
    W.warp(tb.doorX, tb.doorY, { map: 'tourbillons', x: 4, y: 25, dir: 'up' });
    tourb.deco.push({ k: 'exitlight', x: 4, y: 26 });
    { // un bassin d'eau et Lugia au fond de la grotte
      const [lx, ly] = nearestWalkable(tourb, 38, 6);
      legends.push({ id: 'lugia', sp: 249, lvl: 50, map: 'tourbillons', x: lx, y: ly, intro: ['L\'eau se met à tourbillonner...', 'Une immense silhouette argentée émerge des profondeurs : Lugia !'] });
    }
    caveTrainers(tourb, [['Pêcheur', 'Morvan', [[1046, 43], [131, 43]]], ['Topdresseur', 'Tristan', [[1032, 43], [87, 44], [1009, 44]]]], 44);
    caveItems(tourb, ['max-repel', 'ultra-ball', 'full-restore'], 45);
    legend({ id: 'suicune', sp: 245, lvl: 50, ...xy(offRoute(gt, 0.25, -1, 2)), cond: 'beasts', intro: ['Un vent du nord souffle sur la glace...', 'C\'est Suicune, la bête des eaux pures !'] });
    // l'île se couvre de neige ; les arbres deviennent des sapins givrés, les sentiers des chemins pavés
    for (let y = 3; y <= 62; y++) for (let x = 344; x <= 436; x++) { const t = W.get(x, y); if (t === T.GRASS) W.set(x, y, T.SNOW); else if (t === T.TREE) W.set(x, y, T.PINE); else if (t === T.PATH) W.set(x, y, T.PAVE); }
    montGivre({ W, trainerNpc, ENC });   // le Mont Givré, au nord du Rivage Gelé (world/montagnes.js)
    gemmes(W, pg, 8, [[0.6, 1, 'abomasite']]); gemmes(W, gt, 9, [[0.55, 1, 'glalitite']]);
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
    // la sortie au bout de la salle : roche de chaque côté de la porte et en dessous (plus de case libre à côté)
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy + 1; y < grotte.h; y++) if (x !== cx || y !== cy + 1) grotte.set(x, y, T.CAVEWALL);
    grotte.warp(cx, cy + 1, { map: 'monde', x: out.doorX, y: out.doorY + 1, dir: 'down' });
    W.warp(out.doorX, out.doorY, { map: 'grotte', x: cx, y: cy, dir: 'up' });
    grotte.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
  }
  caveTrainers(grotte, [['Montagnard', 'Roger', [[1026, 15], [1028, 16]]], ['Gamin', 'Enzo', [[1024, 14], [41, 15], [1047, 15]]], ['Montagnard', 'Bernard', [[50, 16], [74, 16], [1026, 16]]]], 11);
  caveItems(grotte, ['escape-rope', 'moon-stone', 'super-potion', 'great-ball'], 12);

  // Grotte Victoire : des rochers fissurés en barrent les galeries (Éclate-Roc)
  const victoire = caveMap('victoire', 60, 40, 777, [{ x: 50, y: 34 }, { x: 6, y: 34 }], { name: 'Route Victoire', via: [{ x: 48, y: 8 }, { x: 28, y: 18 }, { x: 10, y: 6 }] });
  victoire.encounter = ENC.victoire; maps.victoire = victoire;
  for (const [cx, cy, out] of [[50, 34, v1in], [6, 34, v1out]]) {
    victoire.set(cx, cy + 1, T.CAVEDOOR); victoire.set(cx, cy, T.CAVE); victoire.set(cx, cy + 2, T.CAVEWALL);
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy + 1; y < victoire.h; y++) if (x !== cx || y !== cy + 1) victoire.set(x, y, T.CAVEWALL);   // sortie au bout de la salle
    victoire.warp(cx, cy + 1, { map: 'monde', x: out.doorX, y: out.doorY + 1, dir: 'down' });
    W.warp(out.doorX, out.doorY, { map: 'victoire', x: cx, y: cy, dir: 'up' });
    victoire.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
  }
  caveTrainers(victoire, [['Topdresseur', 'Dimitri', [[68, 71], [1044, 72], [130, 72]], { format: 'triple', intro: 'Route Victoire, combat Trio ! Montre-moi ce que tu vaux !' }], ['Topdresseuse', 'Sofia', [[149, 72], [1040, 72], [1035, 72]], { format: 'double', intro: 'Un combat Duo avant la Ligue, ça te tente ?' }], ['Karatéka', 'Takeshi', [[68, 73], [1033, 72], [106, 73]]], ['Médium', 'Violette', [[94, 73], [1023, 73]]], ['Montagnard', 'Hubert', [[76, 73], [1028, 73], [464, 74]]]], 73);
  caveItems(victoire, ['full-restore', 'max-repel', 'rare-candy', 'ultra-ball', 'revive', 'max-potion'], 43);
  smashOnPath(victoire, { x: 50, y: 34 }, 3, 991);

  /* ======================== TERRES DU SUD ======================== */
  buildSud({ W, maps, towns, routes, G2, routeTrainer, routeItem, buildTown, poserBatiment, ENC, ledges, PONT });
  // ceintures de tourbillons : l'archipel des trois frères et les îles de l'Est ne s'atteignent qu'en bateau
  tourbillons(W, [
    [[938, 0], [938, 812]], [[938, 812], [1199, 812]],                                  // îles de l'Est
    [[476, 562], [735, 562]], [[476, 562], [476, 805]], [[0, 805], [476, 805]], [[476, 805], [938, 805]],         // archipel : nord, ouest, sud + barrage détroit sud
    [[735, 552], [735, 640]], [[735, 640], [815, 640]], [[815, 566], [815, 640]], [[815, 566], [938, 566]],   // autour de l'Îlot des Marées
  ], 1.0, 2026);

  /* ======================== LA CHAÎNE CÉLESTE ======================== */
  chaine(W, towns);
  // le Plateau Céleste sans cadre : la falaise mord ses bords d'herbe libres (contreforts.js)
  W.plateau = plateauNaturel(W, towns.J);
  /* ======================== ARÈNES ======================== */
  const gymTrainers = [
    [['Insectomane', 'Lucas', [[13, 9], [1017, 10]]], ['Jardinière', 'Anémone', [[540, 10], [401, 10]]]],   // la Ruche de Sylvebourg (niveaux 9 à 11)
    [['Marin', 'Yann', [[1029, 17], [116, 17]]], ['Fillette', 'Océane', [[118, 18], [1031, 18]]], ['Pêcheur', 'Paul', [[60, 19], [1033, 19]]]],
    [['Scientifique', 'Alan', [[100, 23], [1034, 23]]], ['Topdresseuse', 'Électra', [[1036, 24], [25, 24, null, [351, 98, 86, 451]]]], ['Scientifique', 'Ohm', [[82, 25]]]],
    [['Randonneuse', 'Rose', [[69, 28], [1021, 28]]], ['Topdresseuse', 'Lila', [[44, 29], [1038, 29]]], ['Randonneuse', 'Iris', [[189, 30]]]],
    [['Médium', 'Esther', [[1039, 33], [178, 33]]], ['Médium', 'Félix', [[97, 34], [1030, 34]]], ['Topdresseuse', 'Luna', [[196, 35]]]],
    [['Montagnard', 'Marcel', [[1026, 38], [74, 38]]], ['Montagnard', 'Henri', [[95, 39], [1028, 39]]], ['Garde d\'Écaille', 'Gwen', [[1027, 40]]]],
    [['Karatéka', 'Akira', [[1041, 43], [58, 43]]], ['Topdresseur', 'Blaise', [[78, 44], [1005, 44]]], ['Garde d\'Écaille', 'Ignace', [[1042, 45], [218, 44]]]],
    [['Garde d\'Écaille', 'Kael', [[1049, 47], [1050, 48]]], ['Topdresseuse', 'Wyrna', [[148, 49], [329, 49]]], ['Garde d\'Écaille', 'Ivar', [[147, 48], [1050, 49], [334, 49]]]],
    ...GYM_TRAINERS_SUD,
  ];
  // quatrième dresseur des arènes qui n'en avaient que deux ou trois
  const GYM_EXTRA = [
    ['Insectomane', 'Basile', [[1018, 10, null, [33, 81, 106]], [1020, 11]]], ['Pêcheur', 'Gilles', [[1029, 18]]], ['Scientifique', 'Volt', [[1034, 24]]], ['Fillette', 'Pivoine', [[1021, 29]]],
    ['Médium', 'Isaure', [[1039, 34]]], ['Montagnard', 'Roch', [[1026, 39]]], ['Karatéka', 'Kazuo', [[1041, 44]]], ['Topdresseur', 'Siegfried', [[1049, 48]]],
  ];
  // cinquième dresseur des arènes dessinées qui ont cinq places
  const GYM_CINQUIEME = {
    grass: [['Jardinière', 'Pervenche'], ['Randonneuse', 'Myrtille']], psychic: [['Médium', 'Oriane'], ['Médium', 'Séraphin']], rock: [['Montagnard', 'Silex'], ['Montagnard', 'Galet']],
    fire: [['Karatéka', 'Daigo'], ['Topdresseur', 'Ignis']], dragon: [['Garde d\'Écaille', 'Ysolde'], ['Topdresseuse', 'Draconia']], flying: [['Pilote', 'Mistral'], ['Pilote', 'Alizée']],
    dark: [['Ninja', 'Vesper'], ['Voleur', 'Sombral']], normal: [['Homme d\'affaires', 'Albert'], ['Femme d\'affaires', 'Odile']], water: [['Marin', 'Yannick'], ['Pêcheur', 'Ewen']],
    electric: [['Scientifique', 'Thibaut'], ['Topdresseuse', 'Volta Jr']], poison: [['Voleur', 'Vénénis'], ['Médium', 'Belladone']], ground: [['Montagnard', 'Argile'], ['Ouvrier', 'Gravier']],
    steel: [['Ouvrier', 'Félicien'], ['Scientifique', 'Ferraille']], fairy: [['Dame Kimono', 'Jacinthe'], ['Fillette', 'Mélusine']],
    bug: [['Gamin', 'Théodore'], ['Insectomane', 'Mathis']],
  };
  // objets des recoins (case « o » des plans)
  // la Ruche : un Antidote (les Mimigal d'Hector empoisonnent), pas un Anti-Para
  const OBJETS_ARENE = { 0: ['potion', 'antidote'], 1: ['mystic-water'], 11: ['soft-sand'] };
  // répliques [avant, après le combat] des dresseurs des arènes de Voltacité (2), Floralia (3), Mirage (4) et des trois
  // frères de l'archipel (Port-Granit 5, Cendrelune 6, Fort-Écaille 7), dans l'ordre de leurs places sur le plan ;
  // aucune ne dit si le joueur est un garçon ou une fille
  const REPLIQUES_ARENE = {
    2: [
      ['Bzzt ! Tu sens ce picotement ? C\'est la dynamo qui te souhaite la bienvenue !', 'Mes circuits ont grillé... Notre Championne va te recharger, elle.'],
      ['Barrières rouges, barrières bleues... Moi, je ne me trompe jamais de courant !', 'Tu as inversé la tendance. Joli court-circuit ! Notre Championne t\'attend.'],
      ['Volta me l\'a appris : la vitesse avant tout !', 'Trop rapide pour moi... Et notre Championne l\'est encore plus.'],
      ['Le dernier fusible, c\'est moi ! Montre-moi ta tension !', 'La porte du générateur est à toi. Notre Championne t\'attend derrière.'],
    ],
    3: [
      ['Chut... Les fleurs poussent mieux dans le calme. Mais un petit combat, ça les arrose !', 'Mes fleurs se referment... Notre Championne saura les faire éclore.'],
      ['Une dalle de travers, et tout le parterre se referme. Je te montre comment on fait ?', 'Tu as la main verte, on dirait. Notre Championne va être ravie.'],
      ['Mes Pokémon Plante adorent le soleil de la serre. Ils sont en pleine forme !', 'Il va falloir que je rempote mon équipe. Notre Championne, elle, ne flétrit jamais.'],
      ['Le carré de la Reine ne s\'ouvre qu\'avec de la patience. Tu en as ?', 'De la patience et de la force : notre Championne va adorer.'],
      ['Les épines, ça pique ! Flora me l\'a assez répété.', 'Aïe. Tes Pokémon ont des épines, eux aussi. Gare à notre Championne !'],
    ],
    4: [
      ['Je t\'ai vu arriver... dans un rêve, cette nuit.', 'Mon rêve ne finissait pas comme ça. Notre Championne, elle, l\'avait vu venir.'],
      ['Lune, soleil, étoile... Tu sais déjà quel orbe toucher ?', 'Tu lis le palais mieux que moi. Notre Championne t\'attend au fond.'],
      ['Les téléporteurs t\'ont donné le tournis ? Mes Pokémon Psy vont finir le travail !', 'C\'est moi qui ai la tête qui tourne... Notre Championne ne te fera pas de cadeau.'],
      ['Sibylle voit l\'avenir. Et moi, je vois ta défaite !', 'Ma boule de cristal était embuée... Notre Championne, elle, ne se trompe jamais.'],
      ['Le Palais des Songes garde ses secrets. Ta victoire n\'en fera pas partie !', 'Mes songes s\'envolent... Notre Championne t\'attend.'],
    ],
    // la Carrière de Basalte : rochers à pousser dans les fosses
    5: [
      ['Ici, on ne contourne pas la roche : on la pousse. Mes Pokémon aussi sont durs à déplacer !', 'Tu m\'as roulé comme un galet... Basalte, lui, ne bouge pas d\'un pouce.'],
      ['Un rocher dans chaque fosse, et la voie s\'ouvre. Deux Pokémon de front, et elle se referme !', 'Tu as comblé toutes mes failles. Notre Champion t\'attend au bout de la carrière.'],
      ['Les Gardes d\'Écaille surveillent cette carrière pour Drakos. Trois contre trois, sans discuter !', 'Tch... La roche se fissure. Ne crois pas que Basalte cédera aussi vite.'],
      ['Trente ans que je taille le granit de l\'île. Toi, je vais te tailler en pièces !', 'Bien taillé... Tu as le coup de pioche. Notre Champion va apprécier.'],
      ['Un rocher mal poussé, et il faut tout reprendre au pupitre. Un combat mal engagé, c\'est pareil !', 'Éboulement général dans mon équipe... Monte voir notre Champion, la voie est dégagée.'],
    ],
    // la Forge de Pyros : vannes rouge et noire, coulées de lave, gardiens du savoir
    6: [
      ['Kiai ! La chaleur de la forge endurcit le corps. Viens tâter de mes flammes !', 'Refroidi d\'un seul coup... Pyros, lui, ne s\'éteint jamais.'],
      ['Vanne rouge, vanne noire : une coulée se fige, l\'autre repart. Mes deux Pokémon se relaient pareil !', 'Tu as fermé le robinet... Notre Champion bout d\'impatience, là-haut.'],
      ['Ordre de Drakos : personne n\'atteint la Grande Île sans passer par le feu. À trois, on t\'encercle !', 'Mon uniforme sent le roussi... Passe. Mais Pyros te fera regretter le voyage.'],
      ['Je médite au bord de la lave depuis l\'aube. Mon esprit est un brasier !', 'Il ne reste que des braises... Va, notre Champion t\'attend au cœur du volcan.'],
      ['Les gardiens du savoir posent des questions. Moi, je ne pose que mes poings !', 'Belle riposte. Garde ce feu-là pour notre Champion !'],
    ],
    // la Tour de Drakos : statues qui rugissent, ponts-dragons au-dessus du gouffre
    7: [
      ['Halte ! Les statues ne rugissent que pour ceux qui le méritent. Prouve-le !', 'Les ponts pivotent pour toi... Drakos t\'observe déjà, là-haut.'],
      ['Deux dragons valent mieux qu\'un. Sauras-tu regarder des deux côtés du gouffre ?', 'Mes dragons baissent la tête. Notre Champion, lui, ne la baisse devant personne.'],
      ['Dix ans que je garde cette tour. Dix ans que personne ne passe. Trois dragons te barrent la route !', 'Dix ans... et c\'est toi. Avance. Notre Champion attendait peut-être ce jour.'],
      ['On dit que j\'ai tenu trois tours face à Drakos. Et toi, combien en tiendras-tu face à moi ?', 'Trois tours... C\'est ce que j\'ai tenu face à toi. Notre Champion va enfin avoir un vrai combat.'],
      ['Un faux pas, et c\'est le gouffre. Une attaque mal choisie, et c\'est pareil !', 'Tu marches droit, même au-dessus du vide. Monte : notre Champion t\'attend au sommet.'],
    ],
  };
  for (const t of Object.values(towns)) {
    if (t.gym == null) continue;
    const g = t.gymMap, L2 = LEADERS[t.gym], ar = t.gymArena;
    g.npc({ id: g.id + ':guide', x: ar.guide[0], y: ar.guide[1], sprite: 'habitant', dir: 'left', script: 'gymguide', gym: t.gym });
    // les dresseurs se tiennent à côté du parcours de l'énigme, tournés vers lui : ils ne bloquent jamais le passage
    const spots = ar.spots;
    // arène dessinée à la main (Sylvebourg) : ses dresseurs, leurs places et leurs cadeaux viennent d'elle
    if (ar.dresseurs) for (const d of ar.dresseurs) trainerNpc(g, d.x, d.y, d.dir, d.cls, d.name, d.team, { sight: d.sight, ow: d.ow, bs: d.ow, intro: d.intro, after: d.after, onWin: d.gift && (async (A) => { await A.say(`${d.cls} ${d.name} : « Tiens, prends ça. Tu l\'as bien mérité ! »`); await A.give(d.gift[0], d.gift[1]); }) });
    // arène Feu : des gardiens du savoir posent une question avant de s'écarter
    ar.quiz.forEach(([x, y], k) => g.npc({ id: `${g.id}:savoir${k}`, x, y, sprite: 'scientifique', dir: 'down', script: 'savoir', quiz: k + t.gym, hideIf: `QZ:${g.id}:savoir${k}` }));
    // quatre dresseurs par arène ; chacun garde ses Pokémon et en ajoute un ou deux du type de l'arène, pris dans
    // les six générations (un Pokémon différent d'une arène à l'autre, toujours le même pour une arène donnée)
    const list = ar.dresseurs ? [] : gymTrainers[t.gym].slice();
    const extra = GYM_EXTRA[t.gym]; if (!ar.dresseurs && list.length < 4 && extra) list.push(extra);
    // arène dessinée : autant de dresseurs que de places (un cinquième, du même niveau que le quatrième, si le plan en prévoit un)
    // (les places des plans font partie de l'énigme : chaque place reçoit son dresseur)
    const plus = GYM_CINQUIEME[L2.type] || [];
    for (let k = 0; !ar.dresseurs && ar.map.planArene && spots.length > list.length && list.length && k < plus.length; k++) {
      if (t.gym === 0 && k === 0) { list.push([plus[k][0], plus[k][1], [[10, 10], [165, 11]]]); continue; }
      const t4 = list[list.length - 1][2]; list.push([plus[k][0], plus[k][1], t4.map(([sp, lv]) => [sp, lv + 1]).slice(0, 1)]);
    }
    const fem = L2.fem || ['Marine', 'Volta', 'Flora', 'Sibylle'].includes(L2.name);
    const titre = fem ? 'notre Championne' : 'notre Champion';
    list.slice(0, spots.length).forEach(([cls, name, team], i) => {
      const lvl = Math.max(...team.map((m) => m[1]));
      const format = t.gym >= 4 && i === 2 ? 'triple' : t.gym >= 1 && i === 1 ? 'double' : undefined;
      const needMore = format === 'triple' ? Math.max(2, 3 - team.length) : t.gym === 1 ? 1 : (team.length >= 3 ? 1 : 2);
      const more = t.gym === 0 ? [] : equipeDeType(L2.type, lvl, needMore, t.gym * 31 + i * 7 + 3).filter(([sp]) => !team.some((m) => m[0] === sp));
      const fullTeam = t.gym === 0 ? team.slice(0, 2) : team.concat(more).slice(0, t.gym === 1 ? 3 : 4);
      const [x, y, dir, vue] = spots[i];
      // arènes de Voltacité, Floralia, Mirage et de l'archipel : chaque dresseur a ses propres répliques (REPLIQUES_ARENE)
      const rep = REPLIQUES_ARENE[t.gym]?.[i];
      const annonce = format === 'triple' ? 'Place au combat Trio ! ' : format === 'double' ? 'Place au combat Duo ! ' : '';
      const intro = rep ? annonce + rep[0]
        : format === 'triple' ? 'Place au combat Trio ! Montre-moi comment ton équipe se coordonne !'
          : format === 'double' ? `Place au combat Duo ! Tu veux défier ${titre} ? Passe d'abord par moi !`
            : `Tu veux défier ${titre} ? Passe d'abord par moi !`;
      const after = rep ? rep[1] : `${fem ? 'Notre Championne est bien plus forte' : 'Notre Champion est bien plus fort'} que moi.`;
      trainerNpc(g, x, y, dir, cls, name, fullTeam, { sight: vue ?? 3, format: fullTeam.length >= (format === 'triple' ? 3 : 2) ? format : undefined, intro, after });
    });
    // objets posés dans les recoins des arènes dessinées
    (ar.objets || []).forEach(([x, y], i) => g.item(x, y, OBJETS_ARENE[t.gym]?.[i] || 'super-potion', 1, `${g.id}:objet${i}`));
    g.npc({ id: g.id + ':leader', x: ar.leader[0], y: ar.leader[1], dir: 'down', sprite: L2.ow, leader: t.gym, trainer: { cls: fem ? 'Championne' : 'Champion', name: L2.name, team: L2.team, prize: 100, bs: L2.ow, ai: t.gym === 0 ? 'normal' : 'smart', items: { 'potion': t.gym === 0 ? 2 : 0, 'super-potion': t.gym === 1 ? 1 : (t.gym === 2 ? 2 : 0), 'hyper-potion': (t.gym >= 3 ? 2 : 0), 'full-restore': (t.gym >= 6 ? 2 : (t.gym >= 4 ? 1 : 0)) }, intro: L2.intro, lose: L2.lose, sight: 0 } });
  }
  // Ligue : la Maître
  const league = maps['plateau:ligue'];
  league.npc({ id: 'champion', x: 7, y: 3, dir: 'down', sprite: CHAMPION.ow, champion: true, trainer: { cls: 'Maître', name: CHAMPION.name, team: CHAMPION.team, prize: 200, bs: CHAMPION.ow, ai: 'smart', megaSp: 149, items: { 'full-restore': 3 }, intro: CHAMPION.intro, lose: CHAMPION.lose, sight: 0 } });
  poserTourDeCombat(league);
  league.npc({ id: 'ligue-garde', x: 5, y: 15, sprite: 'garde', dir: 'right', text: ['Bienvenue à la Ligue Céleste.', 'La Maître t\'attend au bout du tapis. Bonne chance !'] });

  // Labo : professeur, assistant
  const lab = maps['aube:labo'];
  lab.battleBg = 'lab';
  lab.npc({ id: 'prof', x: 6, y: 3, sprite: 'saule', dir: 'down', script: 'prof' });
  lab.npc({ id: 'assistant', x: 10, y: 7, sprite: 'scientifique', move: 'wander', text: ['Le professeur étudie le lien entre les dresseurs et leurs Pokémon.', 'Il dit que c\'est en voyageant qu\'on le comprend le mieux.'] });
  STARTERS.forEach((sp, i) => lab.object(5 + i, 5, { type: 'starter', sp, cap: i }));

  // histoire secondaire : la Brume, les nouveaux lieux (lac, forêt des torii, jardin, île du Magma) et leurs quêtes
  const quests = buildQuests({ W, maps, towns, routes, legends, docks, buildTown, trainerNpc, offRoute: (id, t, side, off) => offRoute(routes.find((r) => r.id === id).pts, t, side, off),
    decalTorii: [TORII.dx, TORII.dy], atelierTorii: (f) => atelier(ctxA, TORII.zone, TORII.dx, TORII.dy, f) });
  // histoire principale : la Team Éclipse, Lugia Obscur, le Conseil 4, Flash et Force, les quêtes annexes
  addStory({ W, maps, towns, routes: { r1, r2, bois, r3a, r3b, r4, r5, r6, r7, r10 }, legends, trainerNpc, ilot: [765, 596] });
  // la vie des villes : les requêtes des habitants (et les deux combats d'après la Ligue)
  addHabitants({ W, maps, towns, routes });
  // des Pokémon en liberté dans les villes
  addFauneVilles(W);
  // routes : colporteurs, voyageurs et arbres à baies ; marché du week-end ; parois à fouiller dans les grottes
  addVieRoutes(W, routes); addMarches(W, towns); addFouilles(maps); addVoisinage(W, maps, routes, towns); addFetes(W, towns);
  // quêtes du vélo (Voltacité) et du permis bateau (Port-Azur)
  addVehicules({ W, maps, towns });
  // la mine de Pierrefort (trois niveaux, un fossile au fond)
  addMine({ W, maps, towns, trainerNpc, ENC });
  // les grands vides entre les routes : lieux à découvrir au bout d'un sentier, ou paysages vus de loin (lieux.js)
  W.lieux = lieux(W, { maps, trainerNpc, ENC });
  // les impasses des routes : des clairières de forme naturelle, façonnées après coup (lieux.js)
  W.impasses = faconnerImpasses(W, routes);
  // le volcan de Cendrelune, au sud de la ville (volcan.js ; après les lieux, qui gardent leur tirage)
  { const v = towns.H.ville; if (v) W.volcan = volcan(W, { cx: v.x + v.w / 2, cy: v.y + v.h + 22, rx: 40, ry: 24, haut: 11, ville: v }); }
  // la Chaîne Céleste déborde de son plan : des avancées de roche dans la forêt de fond (contreforts.js)
  { const t0 = performance.now(); W.contreforts = memoCases('contreforts', W, () => contreforts(W)) || {}; W.contreforts.ms = Math.round(performance.now() - t0); }
  // la Grotte du Col : sous le coin sud-ouest de la Chaîne, du Bois Murmure à la route 10 (un lac souterrain : Surf ;
  // posée après les lieux et les contreforts, qui avancent la roche de la Chaîne)
  W.col = grotteDuCol({ W, maps, routes, ENC, trainerNpc });
  // les canyons des Hauts d'Ocre : une gorge depuis la route 14 ouvre les vallées de sable entre les mesas (ocre.js)
  W.ocre = canyonsDOcre({ W, maps, ENC, trainerNpc });
  // la Grotte des Sables : dans la falaise d'une mesa de la route 16 (grottes.js)
  W.sables = grotteDansFalaise({ W, maps, ENC, trainerNpc }, { routes, route: 'r16', id: 'sables', nom: 'Grotte des Sables', graine: 8181,
    dresseurs: [['Montagnard', 'Ulysse', [[28, 61], [105, 62]]], ['Randonneuse', 'Sidonie', [[51, 61], [232, 61], [330, 62]]]],
    objets: ['max-potion', 'max-repel', 'fire-stone', 'max-elixir'], cache: 'ultra-ball' });
  // la Grotte des Crêtes : une percée depuis la route 3 dans la roche de la Chaîne Céleste, au nord (grottes.js)
  W.cretes = grotteDansFalaise({ W, maps, ENC, trainerNpc }, { routes, route: 'r3', id: 'cretes', nom: 'Grotte des Crêtes', graine: 9191, percee: [0, -1], enc: ENC.grotte,
    panneau: 'Sous les crêtes de la Chaîne Céleste.', dresseurs: [['Montagnard', 'Léon', [[74, 14], [41, 15]]], ['Gamin', 'Matéo', [[1024, 14], [1026, 15]]]],
    objets: ['great-ball', 'escape-rope', 'moon-stone', 'super-potion'], cache: 'repel' });
  { const tz = W.zones.filter((z) => z.town || z.trigger), sz = W.zones.filter((z) => z.sea), rz = W.zones.filter((z) => !z.town && !z.trigger && !z.sea); W.zones = [...sz, ...rz, ...tz]; }
  // les grandes villes perchées : on y monte par des escaliers à chaque porte
  for (const [k, t] of Object.entries(towns)) if (VILLES[k]?.releve) relever(W, t);
  // des écrans de verdure entre les zones : d'une ville, d'une route ou d'un lieu, on ne voit jamais une autre zone qu'on
  // ne peut pas rejoindre de près (ecrans.js)
  { const t0 = performance.now(); W.ecrans = memoCases('ecrans', W, () => ecrans(W)); W.ecrans.ms = Math.round(performance.now() - t0); }
  // un panneau au départ du sentier de chaque lieu habité (hameau, ferme, verger)
  W.panneauxLieux = panneauxDesLieux(W);
  // après la Ligue : le Parc des Légendes (32 légendaires invités, apres-ligue.js)
  W.apresLigue = poserLegendairesApresLigue(W, maps, legends);
  // le rythme des routes (rythme.js) : raccourcis à sens unique et rebords à sauter, objets cachés, panneaux aux deux bouts
  { const t0 = performance.now(); W.rythme = rythme(W, routes, { trainerNpc }); W.rythme.ms = Math.round(performance.now() - t0); }
  // petites barrières de bois le long des chemins des routes (jamais là où elles couperaient un passage)
  memoCases('barrieres', W, () => fenceRoutes(W, legends), legends.filter((l) => l.map === 'monde').map((l) => [l.x, l.y]));
  // les ponts au propre : droits, d'une ou deux cases de large, jamais deux côte à côte (ponts.js)
  W.ponts = memoCases('ponts', W, () => redresserPonts(W));
  // finitions (acces.js) : des tourbillons au large, à la limite de la marge (on ne voit jamais le bord de la carte) ;
  // ce qu'on n'atteint jamais redevient forêt ; rien ne bouche un passage ; objets selon l'avancement (bareme.js)
  { const mer = mers(W); W.finitions = { tourbillons: memoCases('tourbillons', W, () => tourbillonsDuBord(W, mer)) };
    const RG = rangs(maps, docks, { map: 'monde', x: towns.A.x + 5, y: towns.A.y + 7 }, { bloquants: false });   // un PNJ qui garde un passage ne rend pas la suite inatteignable
    W.finitions.foret = rendreALaForet(W, RG.get('monde'), mer);
    W.finitions.decor = oterDecorIsole(W, RG.get('monde'));
    W.finitions.degages = degager(W);
    W.finitions.bareme = appliquerBareme(maps, RG);
    // les CT 16 à 62 : chacune à la place d'un objet ordinaire de son rang (world/cts.js)
    W.finitions.cts = poserCT(maps, RG);
    // des objets cachés en ville : un tonneau, une caisse, un pot au bord d'une rue, au barème de l'endroit (rythme.js)
    W.cachettes = cachettesDesVilles(W, towns, RG.get('monde')); }
  // retouches faites dans l'éditeur de la version test et intégrées au jeu (world/retouches.js)
  applyRetouches(maps);
  // les donjons à plusieurs (donjons/index.js) : Crypte des Murmures (Route 2), Sanctuaire des Trois Voies et Donjon
  // des Miroirs (Route 3), posés une fois tout le reste fait
  W.donjons = poserDonjons(W, maps, routes); W.crypte = W.donjons.crypte;
  // cartes disparues (lieux désormais posés sur la carte du monde) : une ancienne partie qui y était reprend ici
  const moved = { torii: { map: 'monde', x: 222 + TORII.dx, y: 193 + TORII.dy, dir: 'up' } };
  // les biomes des routes (world/biomes.js) et leur level design (world/decors-routes.js)
  poserBiomes(W, mers(W));
  // la trame des routes : terrasses, obstacles, boucles, sentiers redessinés (world/traces.js ; ne change que des cases)
  if (traces) W.traces = memoCases('traces', W, () => tracerRoutes(W, routes, reserver(W, routes, legends)), legends.filter((l) => l.map === 'monde').map((l) => [l.x, l.y]));
  if (decors) W.decorsRoutes = decorerRoutes(W, routes, { legends, trainerNpc, maps });   // (decors : false dans les tests, pour comparer)
  indexMissionTrainers(W, routes);
  orienterDresseursAveugles(W);
  // rencontres par tronçons (world/rencontres.js)
  poserTroncons({ maps, routes });
  if (W.anciensObjets.length) throw new Error('anciens objets jamais posés : ' + W.anciensObjets.map((q) => q.join(' ')).join(', '));
  // dernier filet : dans une maison, personne ne reste planté dans un meuble posé après lui (table, fossile, canapé)
  for (const m of Object.values(maps)) if (!m.outdoor && m.floor === 'wood') for (const n of m.npcs) if (!walkable(m.get(n.x, n.y))) { const [x, y] = caseLibreDedans(m, n.x, n.y); n.x = x; n.y = y; }
  parvisArene(W, towns.F, 'double'); parvisArene(W, towns.G, 'facade');
  return { maps, towns, routes, legends, docks, quests, moved, cts: W.finitions?.cts || [], start: { map: 'aube:maison', x: 4, y: 6, dir: 'up' }, carte: CARTE_VERSION };
}


/* ======================================================================
   La grande région : terres et mers, reliefs, outils de pose
   ====================================================================== */
/** mers, côtes (bord ondulé), baie de l'Embarcadère, îles de l'archipel */
function terres(W) {
  const bord = (x, y) => sin(x * 0.045 + y * 0.013) * 4 + sin(x * 0.11 - y * 0.07) * 2.5 + sin(y * 0.09 + x * 0.031) * 3;
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
  // (côtes découpées : caps et anses tirés d'un bruit, jamais au-delà des ceintures de tourbillons : boîte [bx0, by0, bx1, by1])
  const ile = (x0, y0, x1, y1, g, [bx0, by0, bx1, by1]) => {
    const r = 26;
    for (let y = Math.max(by0, y0 - 12); y <= Math.min(by1, y1 + 12); y++) for (let x = Math.max(bx0, x0 - 12); x <= Math.min(bx1, x1 + 12); x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
      const n = -2 + 11 * bruit(x, y, 24, 300 + g) + 2.5 * bruit(x, y, 7, 310 + g) + sin(x * 0.21 + g) * 1.2;
      if (Math.hypot(dx, dy) <= r + n) W.set(x, y, T.TREE);
    }
  };
  ile(494, 568, 676, 796, 1, [482, 568, 690, 798]); ile(684, 650, 812, 792, 2, [682, 647, 812, 799]); ile(806, 578, 934, 712, 3, [806, 572, 934, 724]);
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
  const J = towns.J?.territoire || towns.J?.ville;
  if (J) for (let y = J.y; y < J.y + J.h; y++) for (let x = J.x; x < J.x + J.w; x++) W.setHeight(x, y, 4);
  // le Plateau Céleste est un replat dans la roche : sa lisière d'arbres devient falaise (un à trois gradins au-dessus)
  if (J) { const rim = [];
    for (let y = J.y; y < J.y + J.h; y++) for (let x = J.x; x < J.x + J.w; x++) {
      const t = W.get(x, y); if (!(t === T.TREE || t === T.PINE)) continue;
      const bord = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => walkable(W.get(x + a, y + b)));
      if (bord && r2(x, y) < 0.35) continue;   // quelques arbres au pied des falaises
      W.set(x, y, T.CAVEWALL); W.setHeight(x, y, 4); rim.push([x, y]);
    }
    rochesHautes(W, rim); }
  const dedans = (x, y) => CHAINE.some(([c0, r0, c1, r1]) => x >= c0 * BLOC && y >= r0 * BLOC && x < (c1 + 1) * BLOC && y < (r1 + 1) * BLOC);
  // (une case de marge autour du plan : le pied se mesure aussi depuis ses bords extérieurs)
  const X0 = Math.min(...CHAINE.map((q) => q[0])) * BLOC - 1, Y0 = Math.max(0, Math.min(...CHAINE.map((q) => q[1])) * BLOC - 1);
  const X1 = (Math.max(...CHAINE.map((q) => q[2])) + 1) * BLOC, Y1 = (Math.max(...CHAINE.map((q) => q[3])) + 1) * BLOC;
  const w = X1 - X0 + 1, h = Y1 - Y0 + 1, at = (x, y) => (y - Y0) * w + (x - X0);
  const foret = (x, y) => { const t = W.get(x, y); return (t === T.TREE || t === T.PINE) && !(W.monts && W.monts[y * W.w + x]) && W.height(x, y) === 0; };
  // 1. le pied : la forêt monte à l'assaut des pentes en dents de scie ; les vallées boisées (pins) entre les crêtes
  // un relief sans cercles : bruit lu dans des coordonnées déformées (domain warping) et étirées le long des crêtes
  const dx = (x, y) => 22 * (bruit(x, y, 29, 61) - 0.5) + 8 * (bruit(x, y, 11, 63) - 0.5), dy = (x, y) => 22 * (bruit(x, y, 29, 62) - 0.5) + 8 * (bruit(x, y, 11, 64) - 0.5);
  const U = (x, y) => (x + dx(x, y)) * 0.55 + (y + dy(x, y)) * 0.32, V = (x, y) => (y + dy(x, y)) * 1.15 - (x + dx(x, y)) * 0.42;
  const roc = new Uint8Array(w * h), pins = [];
  const lisiere = new Float32Array(w * h).fill(1e9);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (!dedans(x, y)) lisiere[at(x, y)] = 0;
  for (let y = Y0 + 1; y <= Y1; y++) for (let x = X0 + 1; x < X1; x++) { const p = at(x, y); lisiere[p] = Math.min(lisiere[p], lisiere[p - 1] + 1, lisiere[p - w] + 1, lisiere[p - w - 1] + 1.41, lisiere[p - w + 1] + 1.41); }
  for (let y = Y1 - 1; y >= Y0; y--) for (let x = X1 - 1; x > X0; x--) { const p = at(x, y); lisiere[p] = Math.min(lisiere[p], lisiere[p + 1] + 1, lisiere[p + w] + 1, lisiere[p + w + 1] + 1.41, lisiere[p + w - 1] + 1.41); }
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (!dedans(x, y) || !foret(x, y)) continue;
    // (de profondes avancées de forêt remontent les vallées : le massif n'a jamais le bord droit de son plan)
    const pied = 3 + 40 * Math.max(0, bruit(x, y, 37, 13) - 0.35) + 10 * bruit(x, y, 13, 15) + 4 * bruit(x, y, 6, 14);
    if (lisiere[at(x, y)] < pied) { if (r2(x, y) < 0.6) W.set(x, y, T.PINE); continue; }
    // vallées : de longs couloirs boisés entre les crêtes (cols), où dorment des lacs d'altitude
    const u = U(x, y), v = V(x, y), val = Math.abs(2 * bruit(u, v, 24, 41) - 1), large = 0.015 + 0.16 * bruit(x, y, 17, 43) * (1 - bruit(x, y, 70, 44));
    if (val < large) { W.set(x, y, T.PINE); pins.push([x, y]); continue; }
    roc[at(x, y)] = 1;
  }
  // 2. la roche : la distance au pied (dans la roche) et des crêtes (bruit en arêtes) donnent la hauteur ; gradins serrés
  //    près du pied, sommets qui culminent à dix niveaux, neige vers le huitième
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = roc[i] ? 1e9 : 0;
  for (let y = Y0 + 1; y <= Y1; y++) for (let x = X0 + 1; x < X1; x++) { const p = at(x, y); if (d[p]) d[p] = Math.min(d[p], d[p - 1] + 1, d[p - w] + 1, d[p - w - 1] + 1.41, d[p - w + 1] + 1.41); }
  for (let y = Y1 - 1; y >= Y0; y--) for (let x = X1 - 1; x > X0; x--) { const p = at(x, y); if (d[p]) d[p] = Math.min(d[p], d[p + 1] + 1, d[p + w] + 1, d[p + w + 1] + 1.41, d[p + w - 1] + 1.41); }
  const cells = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const p = at(x, y); if (!roc[p]) continue;
    const u = U(x, y), v = V(x, y), crete = 1 - Math.abs(2 * bruit(u, v, 30, 7) - 1), masse = bruit(u, v, 80, 8), detail = bruit(x + dx(x, y), y, 7, 9);
    const cible = 1.5 + crete * 5 + masse * 3.5 + detail * 1.6;
    const H = Math.max(1, Math.min(10, Math.floor(d[p] * 0.55) + 1, Math.floor(cible)));
    W.set(x, y, T.CAVEWALL); W.setHeight(x, y, H); cells.push([x, y]);
  }
  rochesHautes(W, cells);
  // 2 bis. le Pic Céleste : la montagne géante qui domine la Ligue, au nord du Plateau Céleste
  const pic = J ? picCeleste(W, J, cells) : null;
  // 3. la neige des sommets : au-dessus du huitième niveau (la limite des neiges ondule), la roche devient glace (W.neige) ;
  //    sur le Pic Céleste, bien plus haut
  if (!W.neige) W.neige = new Uint8Array(W.w * W.h);
  for (const [x, y] of cells) {
    const lim = pic && pic.dans(x, y) ? 40 : 8;
    if (W.height(x, y) >= lim - Math.round(bruit(x, y, 13, 51) * 1.4)) W.neige[y * W.w + x] = 1;
  }
  // 4. des lacs d'altitude au creux des vallées
  const R0 = rng(4141);
  for (let k = 0, fait = 0; k < 300 && fait < 9; k++) {
    const [x, y] = pins[Math.floor(R0() * pins.length)] || []; if (x == null) break;
    let ok = true; for (let j = -7; j <= 7 && ok; j++) for (let i = -10; i <= 10; i++) if (W.get(x + i, y + j) !== T.PINE) { ok = false; break; }
    if (!ok) continue;
    W.blob(x, y, 5 + R0() * 4, 3 + R0() * 2.5, T.WATER, R0, [T.PINE]); fait++;
  }
  W.zones.unshift({ x0: CHAINE[0][0] * BLOC, y0: CHAINE[0][1] * BLOC, x1: (CHAINE[0][2] + 1) * BLOC - 1, y1: (CHAINE[0][3] + 1) * BLOC - 1, name: 'Chaîne Céleste', music: 'route', prio: -1 });
}
/** le Pic Céleste : une montagne géante et abrupte au nord du Plateau Céleste (la Ligue). Sa roche monte en hautes
 *  falaises de quatre niveaux séparées de replats étroits, jusqu'au soixantième niveau (deux niveaux par case en moyenne :
 *  bien plus raide que le reste de la chaîne) ; des arêtes la découpent ; les pins des vallons qu'elle recouvre deviennent
 *  roche. On ne la gravit pas : elle se dresse derrière la Ligue, comme le Mont Argenté. Rend { dans(x, y) } (la neige y
 *  commence plus haut). */
function picCeleste(W, J, cells) {
  const cx = J.x + J.w / 2 + 4, cy = J.y - 30, rx = 50, ry = 28, SOMMET = 60;
  const dans = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  // deux cimes : la grande à l'ouest, une épaule plus basse à l'est ; de larges arêtes en descendent (cinq ou six autour
  // de chaque cime), séparées de combes : un relief lent, sans aiguilles, que les terrasses découpent en courbes de niveau
  const cime = (x, y, ox, oy, sx, sy, k, g0) => {
    const a = Math.atan2(y - oy, (x - ox) * sy / sx), r = Math.hypot((x - ox) / sx, (y - oy) / sy);
    const arete = 0.5 + 0.5 * cos(a * 5 + g0 + 2.4 * (bruit(a * 1.6 + g0, r * 1.2, 1, 77) - 0.5));
    return k * (1 - r * (1.18 - 0.36 * arete * Math.min(1, r * 1.6)));
  };
  const forme = (x, y) => {
    const g = Math.max(cime(x, y, cx - 10, cy - 3, rx * 0.8, ry, 1, 0.7), cime(x, y, cx + 24, cy + 4, rx * 0.5, ry * 0.72, 0.72, 2.1)) - 0.06 * (bruit(x, y, 14, 78) - 0.5);
    return Math.max(0, Math.min(1, g));
  };
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (!W.in(x, y) || !dans(x, y)) continue;
    const t = W.get(x, y);
    if (walkable(t) || t === T.WATER || t === T.BUILD || t === T.DOOR || (W.monts && W.monts[y * W.w + x])) continue;
    if (y >= J.y - 1 && x >= J.x - 1 && x <= J.x + J.w) continue;   // le plateau et sa bordure
    const g = forme(x, y); if (g <= 0.02) continue;
    // falaises de quatre niveaux dont le bord ondule (bruit)
    const H = 5 + (SOMMET - 5) * Math.pow(g, 0.85), q = 4, Hq = Math.floor((H + (bruit(x, y, 7, 79) - 0.5) * 2.4) / q) * q;
    if (t !== T.CAVEWALL) { W.set(x, y, T.CAVEWALL); cells.push([x, y]); }
    W.setHeight(x, y, Math.max(W.height(x, y), Math.min(SOMMET, Hq)));
  }
  return { dans };
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
    // une seule rive barrée : jamais de couloir fermé des deux côtés du chemin (on ne pouvait plus quitter le sentier)
    { const s = W.get(x, y - 1) === T.PATH ? -1 : 1; let yy = y + s; while (W.get(x, yy) === T.PATH) yy += s;
      if (W.get(x, yy) === T.FENCE || W.get(x - 1, yy) === T.FENCE || W.get(x + 1, yy) === T.FENCE) { run = 0; continue; } }
    // des tronçons courts (4 cases au plus), avec une ouverture entre deux
    if (run < 0) { run++; continue; }
    if (run >= 4) { run = -2; continue; }
    W.set(x, y, T.FENCE); sensBarr.set(x + ',' + y, sens); run++;
  }
  // un bout de barrière d'une seule case ne barre rien et se lit mal : on le retire
  for (const k of sensBarr.keys()) { const [x, y] = k.split(',').map(Number); if (W.get(x - 1, y) !== T.FENCE && W.get(x + 1, y) !== T.FENCE) W.set(x, y, T.GRASS); }
}

function caveTrainers(m, list, seed) {
  const r = rng(seed); const floors = [];
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE && m.get(x + 1, y) === T.CAVE && m.get(x - 1, y) === T.CAVE) floors.push([x, y]);
  list.forEach(([cls, name, team, extra], i) => {
    const [x, y] = floors[Math.floor(((i + 0.5) / list.length) * floors.length * 0.9 + r() * floors.length * 0.08)];
    trainerNpc(m, x, y, ['left', 'right', 'down', 'up'][Math.floor(r() * 4)], cls, name, team, { sight: 3, ...(extra || {}) });
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
