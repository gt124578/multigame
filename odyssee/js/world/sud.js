// odyssee/js/world/sud.js — les Terres du Sud, la seconde moitié du continent (sous la mer du Sud).
// On y passe par le Pont de l'Austral (route 10, au sud de Bourg-Aube) une fois les huit premiers badges en poche.
// Sept villes à arène : Métropole (Normal, la mégapole aux gratte-ciel, sa Bourse et son Casino), Port-Lisière (Vol),
// Marais-Noir (Poison), Dunes d'Ocre (Sol), Forge-Acier (Acier), Rosebrume (Fée) et Ombreval (Ténèbres).
// Avec les cinq arènes du nord, cela fait douze Champions sur le continent, plus les trois frères de l'archipel.
import { T } from './tiles.js';
import { room } from './interiors.js';
import { bande, massif, plateau, boucher, sinueuse } from './relief.js';
import { rng, along, nearestWalkable, GRAND } from './mapgen.js';

// rencontres : [espèce, niveau min, niveau max, poids]
export const ENC_SUD = {
  r13: [[203, 50, 54, 10], [128, 50, 54, 10], [241, 50, 54, 8], [20, 50, 54, 15], [22, 50, 54, 12], [53, 50, 54, 10], [217, 52, 55, 6], [424, 50, 54, 8], [508, 52, 55, 6], [398, 52, 55, 6]],
  r14: [[279, 52, 56, 12], [227, 53, 56, 6], [178, 52, 56, 10], [22, 52, 56, 12], [528, 52, 56, 8], [521, 52, 56, 8], [397, 52, 55, 10], [628, 54, 57, 4], [630, 54, 57, 4], [142, 55, 57, 2], [663, 55, 57, 3]],
  r15: [[195, 55, 59, 12], [453, 55, 59, 10], [89, 55, 59, 8], [110, 55, 59, 8], [24, 55, 59, 10], [435, 55, 59, 8], [342, 55, 59, 8], [537, 56, 59, 6], [454, 57, 59, 5], [691, 57, 59, 3], [49, 55, 58, 10]],
  r16: [[28, 58, 62, 12], [105, 58, 62, 10], [232, 58, 62, 10], [51, 58, 62, 10], [330, 58, 62, 6], [450, 59, 62, 6], [553, 59, 62, 6], [344, 58, 62, 8], [324, 58, 62, 6], [472, 60, 62, 3], [445, 61, 62, 1]],
  r17: [[75, 61, 65, 10], [303, 61, 65, 8], [208, 62, 65, 6], [227, 61, 65, 8], [82, 61, 65, 10], [437, 61, 65, 8], [598, 62, 65, 6], [530, 62, 65, 6], [306, 63, 65, 4], [376, 64, 65, 1], [411, 62, 65, 4]],
  r18: [[36, 64, 68, 8], [184, 64, 68, 10], [210, 64, 68, 8], [303, 64, 68, 6], [176, 64, 68, 6], [700, 66, 68, 3], [282, 66, 68, 4], [670, 64, 68, 8], [683, 65, 68, 6], [685, 65, 68, 6], [301, 64, 68, 8], [40, 64, 68, 8]],
  r19: [[197, 67, 71, 8], [229, 67, 71, 8], [262, 67, 71, 10], [302, 67, 71, 8], [430, 67, 71, 8], [461, 68, 71, 6], [510, 67, 71, 6], [571, 68, 71, 4], [609, 68, 71, 4], [625, 68, 71, 6], [359, 68, 71, 6], [635, 70, 71, 1]],
  r20: [[229, 70, 74, 10], [461, 70, 74, 8], [430, 70, 74, 8], [576, 70, 74, 6], [560, 70, 74, 8], [442, 70, 74, 6], [609, 70, 74, 6], [248, 72, 74, 2], [354, 70, 74, 10], [477, 71, 74, 6], [429, 70, 74, 8]],
};
export const BADGES_SUD = [
  { name: 'Badge Pavé', type: 'normal', color: '#c8c0a8' }, { name: 'Badge Rafale', type: 'flying', color: '#90b8f0' },
  { name: 'Badge Venin', type: 'poison', color: '#a050c0' }, { name: 'Badge Dune', type: 'ground', color: '#d8b860' },
  { name: 'Badge Rouage', type: 'steel', color: '#a8b0c0' }, { name: 'Badge Féérie', type: 'fairy', color: '#f0a0d0' },
  { name: 'Badge Ombre', type: 'dark', color: '#6a5878' },
];
export const LEADERS_SUD = [
  { name: 'Margot', type: 'normal', ow: 'margot', fem: true, team: [[217, 56], [128, 57], [474, 58], [241, 58], [143, 60]], intro: 'Bienvenue à Métropole, la ville qui ne dort jamais. Ici, on ne gagne qu\'avec des chiffres solides !', lose: 'Joli rendement. Le Badge Pavé est à toi : tu l\'as mérité, sans spéculer.' },
  { name: 'Aurèle', type: 'flying', ow: 'aurele', team: [[279, 59], [227, 60], [630, 60], [142, 61], [373, 63]], intro: 'Au-dessus de Port-Lisière, le vent décide de tout. Voyons s\'il est de ton côté.', lose: 'Tu as volé plus haut que moi. Le Badge Rafale est à toi !' },
  { name: 'Morgane', type: 'poison', ow: 'morgane', fem: true, team: [[452, 62], [454, 62], [110, 63], [435, 63], [691, 65]], intro: 'Le marais ne pardonne pas. Mes Pokémon non plus.', lose: 'Tu as résisté au venin… Prends le Badge Venin.' },
  { name: 'Gaspard', type: 'ground', ow: 'gaspard', team: [[530, 65], [464, 66], [472, 66], [450, 67], [445, 69]], intro: 'Les dunes bougent sans cesse, mais le sol, lui, ne cède jamais !', lose: 'Le sable s\'est dérobé sous mes pieds. Voici le Badge Dune.' },
  { name: 'Ferdinand', type: 'steel', ow: 'ferdinand', team: [[598, 68], [462, 68], [208, 69], [681, 70], [306, 70], [376, 72]], intro: 'Dans ma forge, on éprouve l\'acier au feu. Et toi, de quel métal es-tu fait ?', lose: 'Un alliage parfait. Le Badge Rouage te revient.' },
  { name: 'Lilas', type: 'fairy', ow: 'lilas', fem: true, team: [[683, 71], [685, 72], [468, 72], [282, 73], [700, 74], [36, 75]], intro: 'Rosebrume est un rêve. Mais même les rêves savent mordre !', lose: 'Quel joli combat… Le Badge Féérie est à toi.' },
  { name: 'Corbin', type: 'dark', ow: 'corbin', team: [[197, 74], [430, 74], [359, 75], [461, 75], [248, 77], [635, 77]], intro: 'À Ombreval, la lumière ne passe jamais. Voyons si tu brilles assez.', lose: 'Tu as percé les ténèbres. Prends le Badge Ombre : la Ligue t\'attend.' },
];
export const GYM_TRAINERS_SUD = [
  [['Homme d\'affaires', 'Gérald', [[20, 54], [128, 55]]], ['Femme d\'affaires', 'Clarisse', [[241, 55], [53, 55]]], ['Topdresseur', 'Max', [[217, 56], [474, 55]]]],
  [['Pilote', 'Icare', [[22, 57], [279, 58]]], ['Pilote', 'Amelia', [[227, 58], [178, 58]]], ['Topdresseuse', 'Zéphyr', [[630, 59], [142, 59]]]],
  [['Ninja', 'Kage', [[49, 60], [110, 61]]], ['Ninja', 'Suzu', [[435, 61], [89, 61]]], ['Scientifique', 'Toxin', [[454, 62], [24, 61]]]],
  [['Montagnard', 'Sablon', [[28, 63], [105, 64]]], ['Randonneuse', 'Oasis', [[232, 64], [51, 64]]], ['Topdresseur', 'Dunel', [[450, 65], [330, 65]]]],
  [['Ouvrier', 'Fondeur', [[208, 66], [82, 67]]], ['Ouvrier', 'Rivet', [[598, 67], [437, 67]]], ['Scientifique', 'Alliage', [[462, 68], [303, 67]]]],
  [['Fillette', 'Pétale', [[36, 69], [184, 70]]], ['Dame Kimono', 'Rosée', [[700, 70], [210, 70]]], ['Topdresseuse', 'Brume', [[282, 71], [683, 70]]]],
  [['Médium', 'Nocturna', [[197, 72], [302, 72]]], ['Voleur', 'Ombre', [[461, 73], [262, 72]]], ['Topdresseur', 'Corvus', [[430, 73], [229, 74]]]],
];
export const GYM_CAPS_SUD = [59, 62, 65, 68, 71, 74, 76];

/** intérieurs de Métropole : le Casino (et sa salle d'arcade, à droite), la Bourse (terminal et bureau de Pierre), la boutique de mode */
function casinoInterior(id) {
  const m = room(id, 26, 13, { floor: 'league', music: 'city', wall: 'wall_league', name: 'Casino de Métropole', wide: true, exitX: 9 });
  const table = (k, x, y, quoi) => { for (let i = 0; i < 3; i++) { m.set(x + i, y, T.BLOCK); m.deco.push({ k: 'counter', x: x + i, y, front: 'martfront' }); m.object(x + i, y, { use: (api) => api.game.casino(quoi) }); } };
  // le comptoir des jetons et des lots, à l'entrée
  for (let x = 2; x <= 5; x++) { m.set(x, 9, T.BLOCK); m.deco.push({ k: 'counter', x, y: 9, front: 'counterfront' }); }
  m.npc({ id: id + ':comptoir', x: 3, y: 8, sprite: 'vendeur', dir: 'down', script: 'casino' });
  // les machines à sous, en rang au fond
  for (let x = 2; x <= 16; x += 2) { m.prop('machine_sous', x, 2, true); m.object(x, 2, { use: (api) => api.game.casino('machine') }); }
  table('counterseg', 3, 5, 'blackjack'); table('counterseg', 8, 5, 'roulette'); table('counterseg', 13, 5, 'poker');
  table('counterseg', 12, 9, 'belote');
  m.npc({ id: id + ':croupier1', x: 4, y: 4, sprite: 'topdresseur', dir: 'down', text: ['Blackjack : le croupier reste sur 17. Approche-toi de la table.'] });
  m.npc({ id: id + ':croupier2', x: 9, y: 4, sprite: 'topdresseuse', dir: 'down', text: ['Faites vos jeux ! La roulette n\'a qu\'un zéro, ici.'] });
  m.npc({ id: id + ':croupier3', x: 14, y: 4, sprite: 'topdresseur', dir: 'down', text: ['Texas Hold\'em : deux cartes en main, cinq cartes au milieu. Blindes à 1 et 2 jetons.', 'Gérard, Mimi et le Baron cherchent un quatrième joueur.'] });
  m.npc({ id: id + ':mamie', x: 13, y: 10, sprite: 'dame', dir: 'up', text: ['Une petite belote, mon chou ? Je cherche un partenaire.', 'Le Marquis et Fernand trichent sûrement, mais chut.'] });
  m.npc({ id: id + ':joueur', x: 7, y: 2, sprite: 'vieil_homme', dir: 'up', move: 'turn', text: ['Trois 7 ! Trois 7 ! Ah… non, deux.', 'La machine du milieu paie mieux, j\'en suis sûr.'] });
  // la salle d'arcade : quatre bornes au fond, des plantes qui la séparent des tables
  [['tetris', 20], ['invaders', 21], ['briques', 22], ['serpent', 23]].forEach(([jeu, x]) => { m.prop('borne_' + jeu, x, 2, true); m.object(x, 2, { use: (api) => api.game.arcade(jeu) }); });
  m.prop('plant', 19, 2, true); m.prop('plant', 24, 2, true); m.prop('plant', 18, 4, true); m.prop('plant', 18, 8, true);
  m.npc({ id: id + ':gamin', x: 24, y: 6, sprite: 'gamin', dir: 'left', move: 'turn', text: ['La salle d\'arcade, c\'est gratuit ! Et un bon score rapporte des jetons.', 'Mon record à Tétra-Chute ? Douze mille. Personne ne me bat !'] });
  return m;
}
function bourseInterior(id) {
  const m = room(id, 17, 14, { floor: 'mart', music: 'city', wall: 'wall_mart', name: 'Bourse de Métropole', wide: true, exitX: 8 });
  // le grand tableau des cours et les terminaux
  for (let x = 2; x <= 14; x++) m.deco.push({ k: 'carpet', x, y: 2 });
  for (const x of [3, 6, 10, 13]) { m.prop('pc', x, 6, true); m.object(x, 6, { use: (api) => api.game.bourse() }); }
  for (let x = 3; x <= 13; x++) if (![3, 6, 10, 13].includes(x)) { m.set(x, 6, T.BLOCK); m.deco.push({ k: 'counter', x, y: 6, front: 'martfront' }); }
  m.prop('labmachine', 2, 2, true); m.object(2, 2, { use: (api) => api.game.bourse() });
  m.prop('labmachine', 14, 2, true); m.object(14, 2, { use: (api) => api.game.bourse() });
  // le bureau de Pierre, au fond
  m.prop('books', 6, 2, true); m.prop('books', 10, 2, true); m.prop('plant', 1, 2, true); m.prop('plant', 15, 2, true);
  m.npc({ id: 'bourse:pierre', x: 8, y: 3, sprite: 'pierre', dir: 'down', script: 'pierre' });
  m.npc({ id: id + ':trader1', x: 4, y: 9, sprite: 'topdresseur', move: 'wander', text: ['Achète la rumeur, vends la nouvelle !', '… C\'est ce qu\'on dit, en tout cas.'] });
  m.npc({ id: id + ':trader2', x: 12, y: 9, sprite: 'topdresseuse', move: 'turn', text: ['Quand la Sylphe annonce une pénurie de Poké Balls, l\'action de Devon fait souvent l\'inverse.', 'Deux concurrents, deux réactions.'] });
  m.npc({ id: id + ':analyste', x: 14, y: 11, sprite: 'scientifique', text: ['Une option asiatique se calcule sur la moyenne des cours : elle coûte moins cher qu\'une européenne.', 'Et une américaine vaut toujours au moins autant qu\'une européenne.'] });
  return m;
}
function modeInterior(id) {
  const m = room(id, 13, 10, { floor: 'center', music: 'mart', wall: 'wall_center', name: 'Boutique de mode' });
  for (const [x, y] of [[2, 2], [4, 2], [8, 2], [10, 2]]) m.prop('shelf', x, y, true);
  for (let x = 4; x <= 8; x++) { m.set(x, 5, T.BLOCK); m.deco.push({ k: 'counter', x, y: 5 }); }
  m.npc({ id: 'mode:styliste', x: 6, y: 4, sprite: 'topdresseuse', dir: 'down', script: 'apparence' });
  m.prop('plant', 1, 7, true); m.prop('plant', 11, 7, true);
  return m;
}

/**
 * construit les Terres du Sud dans la grande carte (440 × 520) : mer intérieure, pont, villes, routes.
 * ctx : { W, maps, towns, R, routeTrainer, routeItem, buildTown, ENC }
 */
export function buildSud(ctx) {
  const { W, towns, R, routeTrainer, routeItem, buildTown, ENC } = ctx;
  Object.assign(ENC, ENC_SUD);
  // la mer du Sud devient un détroit sur toute la largeur ; les Terres du Sud dessous, bordées d'eau à l'est et au sud
  W.rect(0, 268, 439, 292, T.WATER);
  W.rect(424, 293, 439, 519, T.WATER); W.rect(0, 508, 439, 519, T.WATER);
  // Pont de l'Austral : de la route 10 jusqu'au Sud, au-dessus du détroit (il faut les huit premiers badges)
  W.rect(99, 252, 100, 267, T.PATH); W.rect(99, 268, 100, 293, T.BRIDGE); W.set(101, 256, T.GRASS); W.set(98, 254, T.GRASS);
  W.npc({ id: 'sud:garde-pont', x: 101, y: 256, sprite: 'garde', dir: 'left', gate: { badges: 8, tiles: [[99, 256], [100, 256]] }, text: ['Le Pont de l\'Austral mène aux Terres du Sud et à Métropole.', 'On ne laisse passer que les dresseurs aux huit badges : les cinq du continent et ceux des trois frères.'] });
  W.gates.push({ npc: 'sud:garde-pont', badges: 8, tiles: [[99, 256], [100, 256]] });
  W.sign(98, 254, 'PONT DE L\'AUSTRAL\nTerres du Sud — Métropole', 'sign');
  W.zone(96, 254, 103, 293, { name: 'Pont de l\'Austral', music: 'route2', prio: 1 });
  ctx.routes?.push({ id: 'pont', name: 'Pont de l\'Austral', pts: [[99.5, 252], [99.5, 294]] });   // tracé sur la carte (C)

  const r13 = R('r13', 'Route 13', [[99.5, 294], [99.5, 300], [99.5, 307]], { w: 9, grass: 0.4, trees: 0.03, taperStart: false }, 'r13');
  // la rive sud du détroit reste boisée : on n'y accoste pas en surfant (seul le pont y mène)
  for (let x = 90; x <= 110; x++) if (x < 99 || x > 100) { W.set(x, 293, T.TREE); W.set(x, 294, T.TREE); }
  routeTrainer(W, r13, 0.5, 1, 3, 'Topdresseuse', 'Céleste', [[203, 52], [508, 52], [53, 53]]);

  /* ---------- Métropole (Margot, Normal) ---------- */
  const M = towns.SM = {
    id: 'metro', name: 'Métropole', x: 55, y: 306, w: 96, h: 62, exits: [['n', 44], ['e', 30], ['s', 44]], gym: 8, stock: 7, music: 'city', ground: T.PAVE,
    roads: [[44, 0, 45, 61, T.PAVE], [2, 30, 93, 31, T.PAVE], [2, 14, 93, 15, T.PAVE], [2, 46, 93, 47, T.PAVE], [20, 2, 21, 59, T.PAVE], [70, 2, 71, 59, T.PAVE]],
    deco: [
      ['sign', 43, 4, 'MÉTROPOLE\nLa ville qui ne dort jamais.'], ['sign', 46, 33, 'ARÈNE DE MÉTROPOLE\nChampionne : Margot\nLa reine des affaires.'],
      ['sign', 37, 43, 'CASINO DE MÉTROPOLE\nJetons au comptoir — 20 ₽ pièce.'], ['sign', 64, 13, 'BOURSE DE MÉTROPOLE\nCotations en continu.'], ['sign', 74, 45, 'BOUTIQUE DE MODE\nChangez de style !'],
      ['lamp', 42, 12], ['lamp', 47, 12], ['lamp', 42, 28], ['lamp', 47, 28], ['lamp', 42, 44], ['lamp', 47, 44], ['lamp', 18, 28], ['lamp', 23, 28], ['lamp', 68, 28], ['lamp', 73, 28],
      ['lamp', 18, 44], ['lamp', 73, 44], ['lamp', 18, 12], ['lamp', 73, 12],
      // le parc central : pelouse, fleurs, fontaine
      ['flowers', 25, 50, 30, 51], ['flowers', 34, 50, 39, 51], ['flowers', 50, 51, 55, 52], ['flowers', 62, 51, 67, 52], ['fontaine', 58, 53], ['fontaine', 32, 53], ['banc', 27, 55], ['banc', 37, 55], ['trees', 23, 57, 41, 58],
    ],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 36, y: 8 }, { kind: 'mart', ...GRAND.mart, x: 49, y: 8 }, { kind: 'gym', ...GRAND.gym, x: 50, y: 32, roof: 'gray' },
      { kind: 'tower', ...GRAND.casino, x: 22, y: 34, id: 'casino', name: 'Casino de Métropole', roof: 'gray', interior: casinoInterior },
      { kind: 'tower', ...GRAND.bourse, x: 58, y: 5, id: 'bourse', name: 'Bourse de Métropole', roof: 'gray', interior: bourseInterior },
      { kind: 'tower', x: 73, y: 39, w: 6, d: 4, h: 3, door: 3, id: 'mode', name: 'Boutique de mode', kit: 'gc3', flat: true, roof: 'gray', interior: modeInterior },
      { kind: 'bighouse', x: 4, y: 49, roof: 'gray', name: 'Résidence', npcs: [{ x: 4, y: 5, sprite: 'habitante', text: ['Je travaille au 42ᵉ étage. Je n\'ai jamais vu le ciel en semaine.'] }] },
      { kind: 'house2', x: 82, y: 49, roof: 'blue', npcs: [{ x: 2, y: 4, sprite: 'topdresseur', text: ['Pierre, à la Bourse ? Il m\'a recalé trois fois.', 'Révise les forwards et les options, ses questions changent à chaque fois !'] }] },
    ],
    npcs: [
      { id: 'businessman', x: 40, y: 20, sprite: 'topdresseur', move: 'wander', text: ['Pardon, je suis pressé. J\'ai une réunion au 87ᵉ étage.'] },
      { id: 'touriste', x: 60, y: 31, sprite: 'randonneuse', move: 'wander', text: ['Métropole, c\'est immense ! Je me suis perdue trois fois depuis ce matin.', 'Il paraît que la Championne travaille aussi à la Bourse.'] },
      { id: 'joueur', x: 27, y: 44, sprite: 'vieil_homme', move: 'turn', text: ['Le Casino ? On y entre riche, on en ressort… avec des jetons.', 'Les lots du comptoir valent parfois le détour : Super Bonbon, Pierres…'] },
      { id: 'enfant', x: 33, y: 49, sprite: 'enfant', move: 'wander', text: ['Mon père dit que la Bourse, c\'est comme les combats : il faut lire l\'adversaire.'] },
      { id: 'garde-est', x: 93, y: 32, sprite: 'garde', dir: 'left', gate: { badges: 9, tiles: [[94, 30], [94, 31]] }, text: ['La route 14 mène à Port-Lisière, sur les falaises.', 'Reviens avec le Badge Pavé de Margot.'] },
      { id: 'garde-sud', x: 46, y: 59, sprite: 'garde', dir: 'left', gate: { badges: 14, tiles: [[44, 60], [45, 60]] }, text: ['La route 20 file vers Ombreval, dans les ténèbres du sud.', 'Elle est fermée tant que tu n\'as pas treize badges… Fais le tour par l\'est !'] },
    ],
  };
  buildTown(W, ctx.maps, M);
  // chaussées : les avenues sont asphaltées (trottoirs pavés de part et d'autre), passages piétons aux carrefours
  {
    const H2 = [14, 30, 46], V2 = [20, 44, 70], asph = new Set();
    const put = (x, y, v) => { const k = x + ',' + y; if (asph.has(k)) return; asph.add(k); W.deco.push({ k: 'asph', x: M.x + x, y: M.y + y, v }); };
    for (const y of H2) for (let x = 2; x <= 93; x++) { const inter = V2.some((v) => x >= v - 1 && x <= v + 2); put(x, y, inter ? 'x' : 's'); put(x, y + 1, inter ? 'x' : 'n'); }
    for (const x of V2) for (let y = 0; y <= 61; y++) { if (H2.some((h) => y >= h && y <= h + 1)) continue; put(x, y, 'e'); put(x + 1, y, 'w'); }
  }
  // les gratte-ciel de Métropole (sans porte : des bureaux, la nuit leurs fenêtres s'allument)
  const tours = [[4, 3, 7, 5, 8], [11, 3, 7, 5, 11], [24, 3, 8, 5, 10], [74, 3, 7, 5, 12], [82, 3, 9, 5, 9], [4, 17, 6, 5, 7], [11, 17, 7, 5, 9], [24, 17, 8, 6, 13],
    [49, 18, 9, 6, 15], [60, 18, 8, 6, 11], [74, 18, 8, 5, 10], [84, 17, 7, 5, 8], [4, 33, 7, 5, 6], [11, 33, 7, 5, 9], [82, 33, 9, 5, 10], [74, 50, 6, 5, 8]];
  tours.forEach(([x, y, w, d, h], i) => W.building('tower', M.x + x, M.y + y, { w, d, h, door: -1, kit: 'gc' + (i % 4), flat: true, name: 'Tour', roof: 'gray' }));
  const asphAt = (x, y) => W.deco.some((d) => d.k === 'asph' && d.x === M.x + x && d.y === M.y + y);
  {
    // arbres d'alignement et bancs sur les trottoirs (là où rien d'autre ne se trouve)
    for (const y of [12, 17, 28, 33, 44, 49]) for (let x = 4; x <= 92; x += 6) {
      const ax = M.x + x, ay = M.y + y;
      if (W.get(ax, ay) === T.PAVE && !asphAt(x, y) && !W.deco.some((d) => d.x === ax && d.y === ay) && !W.npcs.some((n) => n.x === ax && n.y === ay) && W.get(ax, ay + 1) !== T.DOOR && W.get(ax, ay - 1) !== T.DOOR) W.prop((x / 6) % 3 === 1 ? 'banc' : 'erable', ax, ay);
    }
  }

  /* ---------- route 14 → Port-Lisière ---------- */
  const r14 = R('r14', 'Route 14', [[151, 336.5], [165, 336.5], [176, 329.5], [190, 336.5], [201, 336.5]], { w: 11, grass: 0.8, trees: 0.04, rocks: 0.03, flowers: 0.02 }, 'r14');
  routeTrainer(W, r14, 0.2, 1, 3, 'Pilote', 'Hugo', [[22, 53], [279, 54]]);
  routeTrainer(W, r14, 0.4, -1, 4, 'Topdresseur', 'Ilan', [[528, 54], [397, 54], [178, 55]]);
  routeTrainer(W, r14, 0.6, 1, 4, 'Fillette', 'Nora', [[521, 54], [22, 55]]);
  routeTrainer(W, r14, 0.8, -1, 3, 'Pilote', 'Sacha', [[227, 55], [630, 55]]);
  routeItem(W, r14, 0.3, -1, 5, 'max-potion'); routeItem(W, r14, 0.7, 1, 5, 'ultra-ball', 3);

  const P = towns.SP = {
    id: 'lisiere', name: 'Port-Lisière', x: 201, y: 322, w: 50, h: 42, exits: [['w', 14], ['e', 14]], gym: 9, stock: 7, music: 'port', fermer: true, lotir: { n: 6, seed: 101 },
    roads: [[2, 14, 49, 15], [17, 4, 18, 39], [2, 33, 47, 33], [44, 15, 45, 33]],
    deco: [['sign', 15, 12, 'PORT-LISIÈRE\nLà où le vent prend son élan.'], ['sign', 22, 32, 'ARÈNE DE PORT-LISIÈRE\nChampion : Aurèle\nLe pilote des falaises.'],
      ['waterRect', 38, 35, 47, 39], ['flowers', 4, 18, 7, 19], ['lamp', 16, 13], ['lamp', 19, 13], ['sand', 36, 34, 47, 34]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 4, y: 6 }, { kind: 'mart', ...GRAND.mart, x: 23, y: 7 }, { kind: 'gym', ...GRAND.gym, x: 24, y: 16, roof: 'blue' },
      { kind: 'house', x: 4, y: 20, roof: 'blue', npcs: [{ x: 4, y: 4, sprite: 'marin', text: ['Les ventilateurs de l\'arène poussent dans tous les sens.', 'Regarde où mène chaque souffle avant de t\'y engager !'] }] },
    ],
    npcs: [{ id: 'pilote', x: 11, y: 12, sprite: 'topdresseur', move: 'wander', text: ['Aurèle a fait trois fois le tour de la région en deltaplane.', 'Ses Pokémon Vol ne craignent que la Glace, l\'Électrik et la Roche.'] },
      { id: 'garde', x: 47, y: 16, sprite: 'garde', dir: 'up', gate: { badges: 10, tiles: [[48, 14], [48, 15]] }, text: ['Le marais, à l\'est, est dangereux. Il faut le Badge Rafale.'] }],
  };
  buildTown(W, ctx.maps, P);

  /* ---------- route 15 → Marais-Noir (marécage, passerelles) ---------- */
  W.blob(262, 330, 6, 4, T.WATER, rngLite(15)); W.blob(285, 322, 5, 3, T.WATER, rngLite(16));
  const r15 = R('r15', 'Route 15', [[251, 336.5], [256, 336.5], [264, 330.5], [278, 322.5], [290, 318.5], [301, 318.5]], { w: 12, grass: 1.1, tall: T.DARKTALL, trees: 0.06, bridge: true, theme: 'forest' }, 'r15', 'forest');
  routeTrainer(W, r15, 0.15, -1, 4, 'Ninja', 'Hayate', [[49, 56], [453, 57]]);
  routeTrainer(W, r15, 0.35, 1, 4, 'Médium', 'Bérénice', [[195, 57], [342, 57], [89, 57]]);
  routeTrainer(W, r15, 0.55, -1, 3, 'Pêcheur', 'Albin', [[195, 57], [453, 58]]);
  routeTrainer(W, r15, 0.75, 1, 4, 'Ninja', 'Raiden', [[435, 58], [110, 58]]);
  routeTrainer(W, r15, 0.9, -1, 3, 'Scientifique', 'Dr Vipère', [[454, 58], [24, 58], [537, 58]]);
  routeItem(W, r15, 0.45, 1, 6, 'full-heal', 2); routeItem(W, r15, 0.85, 1, 6, 'rare-candy');

  const N = towns.SN = {
    id: 'marais', name: 'Marais-Noir', x: 301, y: 305, w: 46, h: 38, exits: [['w', 13], ['s', 17]], gym: 10, stock: 7, music: 'mystic', fermer: true, lotir: { n: 5, seed: 113 },
    roads: [[2, 13, 43, 14, T.PATH], [17, 13, 18, 37, T.PATH], [2, 31, 43, 31, T.PATH]],
    deco: [['sign', 15, 11, 'MARAIS-NOIR\nOn y entre en bottes, on en sort en rampant.'], ['sign', 23, 30, 'ARÈNE DE MARAIS-NOIR\nChampionne : Morgane\nLa dame des brumes.'],
      ['water', 6, 20, 3, 2], ['water', 28, 6, 3, 2.5], ['tall', 40, 16, 43, 24]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 3, y: 5 }, { kind: 'mart', ...GRAND.mart, x: 11, y: 6 }, { kind: 'gym', ...GRAND.gym, x: 22, y: 15, roof: 'purple' },
      { kind: 'house', x: 4, y: 15, roof: 'brown', npcs: [{ x: 4, y: 4, sprite: 'vieil_homme', text: ['Dans l\'arène, les murs sont invisibles.', 'Avance à tâtons : chaque mur heurté est un mur de moins à chercher.'] }] },
    ],
    npcs: [{ id: 'garde', x: 19, y: 35, sprite: 'garde', dir: 'up', gate: { badges: 11, tiles: [[17, 36], [18, 36]] }, text: ['Au sud, les Dunes d\'Ocre. Le Badge Venin d\'abord !'] }],
  };
  buildTown(W, ctx.maps, N);

  /* ---------- route 16 → Dunes d'Ocre (désert) ---------- */
  // un vrai désert : sable à perte de vue entre des mesas de roche ocre, cactus, crêtes de dunes dont on se laisse glisser
  const r16 = R('r16', 'Route 16', sinueuse([[318.5, 343], [319, 348], [326, 353], [334, 356], [342, 366], [352, 368], [363, 372.5]]), { w: 13, grass: 0.35, trees: 0, rocks: 0.04, ground: T.SAND, overwrite: false, theme: 'desert' }, 'r16');
  {
    const r = rng(1616), ville = (x, y) => [towns.SN, { x: 363, y: 360, w: 46, h: 38 }].some((t) => x >= t.x - 2 && x <= t.x + t.w + 1 && y >= t.y - 2 && y <= t.y + t.h + 1);
    for (const [x, y] of bande(r16, 0, 11, 0, 0.04, 0.97)) {
      if (ville(x, y) || W.get(x, y) !== T.TREE) continue;
      W.set(x, y, T.SAND);
      const q = r(); if (q < 0.035) W.prop(q < 0.022 ? 'cactus' : 'cactus2', x, y); else if (q < 0.045) W.set(x, y, T.ROCK);
    }
    // au-delà du sable, des mesas de roche ocre ferment le désert (toute la forêt de la zone disparaît)
    // une cuvette ovale aux bords irréguliers (pas un rectangle) : au-delà, la forêt reprend
    const mesa = []; for (let y = 318; y <= 392; y++) for (let x = 288; x <= 382; x++) {
      const q = ((x - 336) / 46) ** 2 + ((y - 357) / 34) ** 2 + (Math.sin(x * 0.31 + y * 0.17) + Math.sin(y * 0.23 - x * 0.11)) * 0.06;
      if (q <= 1 && !ville(x, y) && W.get(x, y) === T.TREE) mesa.push([x, y]);
    }
    massif(W, mesa, { pas: 3 });
    for (const [t, o] of [[0.3, 6], [0.5, -7], [0.75, 6], [0.62, 8]]) { const p = along(r16, t), x = Math.round(p.x + p.nx * o), y = Math.round(p.y + p.ny * o); if (W.get(x, y) === T.SAND) W.prop('rocher_grand', x, y); }
    ctx.ledges?.(W, r16, [0.22, 0.6], { reach: 7 });
  }
  W.zone(296, 326, 372, 382, { name: 'Route 16', music: 'route', enc: ENC.r16, theme: 'desert', route: 'r16', prio: 0 });
  routeTrainer(W, r16, 0.2, 1, 4, 'Montagnard', 'Caravane', [[28, 59], [105, 59]]);
  routeTrainer(W, r16, 0.45, -1, 4, 'Randonneuse', 'Sahra', [[232, 60], [51, 60], [344, 60]]);
  routeTrainer(W, r16, 0.7, 1, 3, 'Topdresseur', 'Mirage', [[330, 61], [553, 61]]);
  routeTrainer(W, r16, 0.88, -1, 4, 'Montagnard', 'Touareg', [[450, 61], [324, 61]]);
  routeItem(W, r16, 0.35, 1, 6, 'max-repel'); routeItem(W, r16, 0.6, -1, 6, 'revive', 2);

  const D = towns.SD = {
    id: 'dunes', name: 'Dunes d\'Ocre', x: 363, y: 360, w: 46, h: 38, exits: [['w', 12], ['s', 18]], gym: 11, stock: 7, music: 'city', ground: T.SAND, fermer: true,
    roads: [[2, 12, 43, 13, T.PATH], [18, 12, 19, 37, T.PATH], [2, 31, 43, 31, T.PATH], [42, 13, 43, 31, T.PATH]],
    deco: [['sign', 16, 10, 'DUNES D\'OCRE\nLe vent sculpte la ville chaque nuit.'], ['sign', 23, 30, 'ARÈNE DES DUNES\nChampion : Gaspard\nLe bâtisseur de sable.'],
      ['rock', 4, 18], ['rock', 30, 4], ['rock', 31, 35], ['palm', 8, 21], ['palm', 28, 9], ['water', 10, 20, 2.5, 1.8]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 4, y: 4 }, { kind: 'mart', ...GRAND.mart, x: 12, y: 5 }, { kind: 'gym', ...GRAND.gym, x: 22, y: 15, roof: 'brown' },
      { kind: 'house', x: 3, y: 27, roof: 'orange', npcs: [{ x: 4, y: 4, sprite: 'randonneuse', text: ['Ici, on balaie le sable devant sa porte trois fois par jour.'] }] },
      { kind: 'house2', x: 8, y: 27, roof: 'brown', npcs: [{ x: 2, y: 4, sprite: 'habitant', text: ['Les caravanes du désert s\'arrêtent toujours ici avant le canyon.'] }] },
      { kind: 'house', x: 13, y: 27, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'enfant', text: ['J\'ai trouvé un os énorme dans les dunes ! Maman dit que c\'est un fossile.'] }] },
      { kind: 'house', x: 33, y: 4, roof: 'brown', npcs: [{ x: 4, y: 4, sprite: 'montagnard', text: ['Dans l\'arène, le sable glisse.', 'Tu ne t\'arrêtes que contre un rocher : regarde bien où chacun t\'arrêtera.'] }] },
    ],
    npcs: [{ id: 'garde', x: 20, y: 35, sprite: 'garde', dir: 'up', gate: { badges: 12, tiles: [[18, 36], [19, 36]] }, text: ['La route 17 descend vers Forge-Acier. Il te faut le Badge Dune.'] }],
  };
  buildTown(W, ctx.maps, D);

  /* ---------- route 17 → Forge-Acier ---------- */
  // le Canyon d'Ocre : la route descend au fond d'une gorge entre deux parois de roche ocre, grimpe sur une corniche
  // le long de la paroi nord, puis redescend vers Forge-Acier
  const r17 = R('r17', 'Route 17 — Canyon d\'Ocre', sinueuse([[381.5, 398], [381, 404], [374, 410], [364, 414], [352, 417], [344, 421], [334, 425.5]]), { w: 10, grass: 0.5, trees: 0, rocks: 0.05, theme: 'canyon' }, 'r17');
  {
    const ville = (x, y) => [towns.SD, { x: 288, y: 412, w: 46, h: 38 }].some((t) => x >= t.x - 2 && x <= t.x + t.w + 1 && y >= t.y - 2 && y <= t.y + t.h + 1);
    massif(W, bande(r17, 4.6, 13, 0, 0.03, 0.97).filter(([x, y]) => !ville(x, y)), { tout: true, pas: 2, max: 3 });
    // la corniche : un tronçon du chemin passe sur une vire, au-dessus du fond de la gorge
    const p = along(r17, 0.5), cote = p.ny < 0 ? 1 : -1;   // côté nord de la route
    plateau(W, [...bande(r17, 0, 2.2, 0, 0.36, 0.62), ...bande(r17, 2.2, 4.6, cote, 0.36, 0.62)].filter(([x, y]) => W.get(x, y) !== T.CAVEWALL), 1, { roche: true });   // falaise de roche ocre
    for (const [x, y] of bande(r17, 0, 4.6, 0)) if (W.get(x, y) === T.TREE) W.set(x, y, T.GRASS);   // pas d'arbres au fond de la gorge
    const m = along(r17, 0.5); boucher(W, bande(r17, 0, 5, 0).map(([x, y]) => x + ',' + y), nearestWalkable(W, m.x, m.y), T.ROCK);
  }
  W.zone(308, 380, 398, 440, { name: 'Canyon d\'Ocre', music: 'route', enc: ENC.r17, theme: 'canyon', route: 'r17', prio: 0 });
  routeTrainer(W, r17, 0.25, -1, 4, 'Ouvrier', 'Boulon', [[82, 62], [437, 63]]);
  routeTrainer(W, r17, 0.5, 1, 4, 'Topdresseuse', 'Alice', [[303, 63], [208, 63], [227, 64]]);
  routeTrainer(W, r17, 0.72, -1, 3, 'Ouvrier', 'Écrou', [[598, 63], [530, 64]]);
  routeTrainer(W, r17, 0.9, 1, 4, 'Karatéka', 'Kenji', [[107, 64], [68, 64]]);
  routeItem(W, r17, 0.4, 1, 6, 'full-restore'); routeItem(W, r17, 0.8, -1, 6, 'ultra-ball', 5);

  const F = towns.SF = {
    id: 'forge', name: 'Forge-Acier', x: 288, y: 412, w: 46, h: 38, exits: [['e', 13], ['w', 13]], gym: 12, stock: 7, music: 'city', fermer: true, lotir: { n: 5, seed: 127 },
    roads: [[2, 13, 45, 14, T.PAVE], [16, 4, 17, 35, T.PAVE], [2, 33, 43, 33, T.PAVE]],
    deco: [['sign', 14, 11, 'FORGE-ACIER\nLe cœur battant de l\'industrie du Sud.'], ['sign', 21, 32, 'ARÈNE DE FORGE-ACIER\nChampion : Ferdinand\nLe maître forgeron.'],
      ['lamp', 15, 12], ['lamp', 18, 12], ['rock', 3, 20], ['rock', 29, 5]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 4, y: 5 }, { kind: 'mart', ...GRAND.mart, x: 22, y: 6 }, { kind: 'gym', ...GRAND.gym, x: 22, y: 16, roof: 'gray' },
      { kind: 'tower', x: 4, y: 16, w: 7, d: 5, h: 5, door: 3, name: 'Fonderie', kit: 'gc0', flat: true, npcs: [{ x: 3, y: 5, sprite: 'montagnard', text: ['Ici, on coule l\'acier des rails et des ponts.', 'L\'arène ? Des tapis roulants et des barrières. Coupe le bon courant !'] }] },
    ],
    npcs: [{ id: 'garde', x: 2, y: 15, sprite: 'garde', dir: 'up', gate: { badges: 13, tiles: [[1, 13], [1, 14]] }, text: ['Rosebrume, à l\'ouest, ne reçoit que les porteurs du Badge Rouage.'] }],
  };
  buildTown(W, ctx.maps, F);

  /* ---------- route 18 → Rosebrume (prairie fleurie) ---------- */
  const r18 = R('r18', 'Route 18', [[287, 425.5], [266, 428], [246, 437], [230, 440], [218, 440.5]], { w: 12, grass: 0.8, trees: 0.04, flowers: 0.1 }, 'r18');
  routeTrainer(W, r18, 0.2, 1, 4, 'Fillette', 'Capucine', [[36, 65], [184, 65]]);
  routeTrainer(W, r18, 0.42, -1, 4, 'Dame Kimono', 'Sakura', [[210, 66], [700, 66]]);
  routeTrainer(W, r18, 0.62, 1, 4, 'Topdresseur', 'Florent', [[683, 66], [303, 66], [670, 66]]);
  routeTrainer(W, r18, 0.85, -1, 3, 'Fillette', 'Églantine', [[685, 67], [40, 67]]);
  routeItem(W, r18, 0.3, -1, 6, 'max-potion', 2); routeItem(W, r18, 0.7, 1, 6, 'moon-stone');

  const Ro = towns.SR = {
    id: 'rose', name: 'Rosebrume', x: 170, y: 428, w: 48, h: 38, exits: [['e', 12], ['w', 12]], gym: 13, stock: 7, music: 'town', fermer: true, lotir: { n: 6, seed: 131 },
    roads: [[2, 12, 47, 13, T.PATH], [17, 4, 18, 35, T.PATH], [2, 33, 45, 33, T.PATH]],
    deco: [['sign', 15, 10, 'ROSEBRUME\nLa ville qui sent bon le rêve.'], ['sign', 21, 32, 'ARÈNE DE ROSEBRUME\nChampionne : Lilas\nLa fée des roses.'],
      ['flowers', 3, 3, 12, 5], ['flowers', 23, 3, 32, 5], ['flowers', 3, 20, 10, 23], ['fontaine', 9, 27]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 4, y: 6 }, { kind: 'mart', ...GRAND.mart, x: 24, y: 6 }, { kind: 'gym', ...GRAND.gym, x: 22, y: 16, roof: 'red' },
      { kind: 'house', x: 11, y: 16, roof: 'red', npcs: [{ x: 4, y: 4, sprite: 'fillette', text: ['L\'arène de Lilas est pleine de miroirs magiques.', 'Chaque dalle t\'envoie ailleurs… mais pas n\'importe où !'] }] },
    ],
    npcs: [{ id: 'garde', x: 2, y: 14, sprite: 'garde', dir: 'up', gate: { badges: 14, tiles: [[1, 12], [1, 13]] }, text: ['Ombreval, plus à l\'ouest, est plongée dans la nuit.', 'Il faut le Badge Féérie pour y aller.'] }],
  };
  buildTown(W, ctx.maps, Ro);

  /* ---------- route 19 → Ombreval (forêt sombre) ---------- */
  const r19 = R('r19', 'Route 19', [[169, 440.5], [150, 445], [130, 452], [114, 458], [103, 460.5]], { w: 13, grass: 1.2, tall: T.DARKTALL, trees: 0.12, theme: 'forest' }, 'r19', 'forest');
  routeTrainer(W, r19, 0.2, -1, 4, 'Médium', 'Séléné', [[197, 68], [302, 68]]);
  routeTrainer(W, r19, 0.4, 1, 4, 'Voleur', 'Arsène', [[262, 68], [430, 69]]);
  routeTrainer(W, r19, 0.6, -1, 4, 'Topdresseuse', 'Nuit', [[359, 69], [461, 69], [510, 69]]);
  routeTrainer(W, r19, 0.8, 1, 3, 'Médium', 'Erwan', [[609, 70], [625, 70]]);
  routeItem(W, r19, 0.5, 1, 6, 'rare-candy'); routeItem(W, r19, 0.9, -1, 6, 'dusk-stone');

  const O = towns.SO = {
    id: 'ombre', name: 'Ombreval', x: 55, y: 448, w: 48, h: 40, exits: [['e', 12], ['n', 16]], gym: 14, stock: 7, music: 'mystic', fermer: true, lotir: { n: 6, seed: 139 },
    roads: [[2, 12, 47, 13, T.PATH], [16, 0, 17, 35, T.PATH], [2, 35, 45, 35, T.PATH]],
    deco: [['sign', 14, 10, 'OMBREVAL\nIci, même la lune baisse les yeux.'], ['sign', 21, 34, 'ARÈNE D\'OMBREVAL\nChampion : Corbin\nL\'homme sans ombre.'],
      ['lamp', 15, 14], ['lamp', 18, 14], ['trees', 2, 2, 6, 6, T.PINE], ['trees', 40, 3, 44, 7, T.PINE]],
    buildings: [
      { kind: 'center', ...GRAND.center, x: 5, y: 4 }, { kind: 'mart', ...GRAND.mart, x: 24, y: 5 }, { kind: 'gym', ...GRAND.gym, x: 22, y: 17, roof: 'purple' },
      { kind: 'house', x: 9, y: 17, roof: 'gray', npcs: [{ x: 4, y: 4, sprite: 'medium', text: ['L\'arène de Corbin est plongée dans le noir.', 'Même Flash n\'y fait rien : on avance à l\'aveugle dans le labyrinthe.'] }] },
    ],
    npcs: [{ id: 'veuve', x: 12, y: 20, sprite: 'dame', move: 'turn', text: ['Après Corbin, il ne te restera que la Ligue Céleste.', 'Prends la route 20, au nord : elle remonte droit vers Métropole.'] }],
  };
  buildTown(W, ctx.maps, O);

  // route 20 : d'Ombreval à Métropole (raccourci du retour, fermé côté Métropole tant qu'on n'a pas treize badges)
  const r20 = R('r20', 'Route 20', [[71.5, 447], [71.5, 425], [85, 405], [99.5, 390], [99.5, 369]], { w: 12, grass: 0.9, trees: 0.06, rocks: 0.03 }, 'r20');
  routeTrainer(W, r20, 0.25, 1, 4, 'Topdresseur', 'Valentin', [[229, 71], [576, 71], [442, 71]]);
  routeTrainer(W, r20, 0.55, -1, 4, 'Topdresseuse', 'Garance', [[560, 72], [354, 71], [477, 72]]);
  routeTrainer(W, r20, 0.8, 1, 3, 'Karatéka', 'Masao', [[429, 72], [461, 72]]);
  routeItem(W, r20, 0.4, -1, 6, 'full-restore'); routeItem(W, r20, 0.7, 1, 5, 'elixir');
}
/** petit générateur pour les étendues d'eau (indépendant des graines de la carte) */
function rngLite(seed) { let s = seed * 2654435761 >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
