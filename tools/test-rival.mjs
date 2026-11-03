// arcadia/tools/test-rival.mjs — validation de la difficulté adaptative et des règles stratégiques du Rival
import { buildRivalParty, getRivalItems, getPlayerMaxLevel } from '../odyssee/js/world/rival.js';
import { Battle } from '../odyssee/js/core/battle.js';
import { createMon } from '../odyssee/js/core/mon.js';
import { MOVES } from '../odyssee/js/data/moves.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log('=== Test 1 : Auto-leveling & Niveaux (+2 pour le starter, max équipe pour les autres) ===');
{
  const mockGameEarly = {
    state: {
      badges: [true, false, false, false, false, false, false, false], // 1 badge
      party: [createMon(1001, 14), createMon(1010, 16), createMon(1013, 12)], // Max player lvl = 16
    }
  };

  // Équipe Théo route 2 : [[1010, 11], [1013, 11], [1004, 13]] (dernier = starter feu)
  const partyEarly = buildRivalParty(mockGameEarly, [[1010, 11], [1013, 11], [1004, 13]]);
  assert(partyEarly.length === 3, 'L\'équipe contient 3 Pokémon');
  assert(partyEarly[0].lvl === 16, 'Pokémon 1 (Piouf) est au niveau max du joueur (16)');
  assert(partyEarly[1].lvl === 16, 'Pokémon 2 (Grignotin) est au niveau max du joueur (16)');
  assert(partyEarly[2].lvl === 18, 'Starter du rival (Flambotin) est à max + 2 (18)');

  // Équipe joueur haut niveau (surleveling du joueur au début ou en mid-game)
  const mockGameOverleveled = {
    state: {
      badges: [true, true, true, false, false, false, false, false], // 3 badges
      party: [createMon(1001, 38), createMon(1010, 45)], // Max player lvl = 45
    }
  };
  const partyMid = buildRivalParty(mockGameOverleveled, [[1011, 27], [1034, 26], [1021, 26], [1005, 29]]);
  assert(partyMid[0].lvl === 45, 'Pokémon 1 au niveau max du joueur (45)');
  assert(partyMid[1].lvl === 45, 'Pokémon 2 au niveau max du joueur (45)');
  assert(partyMid[2].lvl === 45, 'Pokémon 3 au niveau max du joueur (45)');
  assert(partyMid[3].lvl === 47, 'Starter du rival au niveau max du joueur + 2 (47)');

  // Premier combat au labo
  const mockGameLab = {
    state: {
      badges: Array(8).fill(false),
      party: [createMon(1001, 5)], // Starter joueur niveau 5
    }
  };
  const partyLab = buildRivalParty(mockGameLab, [[1004, 5]]);
  assert(partyLab.length === 1, 'Labo : 1 seul Pokémon');
  assert(partyLab[0].lvl === 7, 'Labo : starter du rival est niveau 7 (5 + 2)');
}

console.log('\n=== Test 2 : IVs à fond (31 partout) ===');
{
  const mockGame = {
    state: {
      badges: [true, false, false, false, false, false, false, false],
      party: [createMon(1001, 15)],
    }
  };
  const party = buildRivalParty(mockGame, [[1010, 11], [1013, 11], [1004, 13]]);
  for (let i = 0; i < party.length; i++) {
    const perfectIVs = party[i].iv.every((val) => val === 31);
    assert(perfectIVs, `Pokémon ${i + 1} a bien 31 IV dans les 6 statistiques`);
  }
}

console.log('\n=== Test 3 : Objets stratégiques (Règle d\'or : Aucun objet avant 3 arènes) ===');
{
  // Test 0 badge
  const g0 = { state: { badges: Array(8).fill(false), party: [createMon(1001, 5)] } };
  const p0 = buildRivalParty(g0, [[1004, 5]]);
  assert(p0[0].item === null, '0 badge : starter du rival sans objet');

  // Test 1 badge (route 2)
  const g1 = { state: { badges: [true, false, false, false, false, false, false, false], party: [createMon(1001, 15)] } };
  const p1 = buildRivalParty(g1, [[1010, 11], [1013, 11], [1004, 13]]);
  assert(p1.every((m) => m.item === null), '1 badge : absolument aucun Pokémon n\'a d\'objet tenu');

  // Test 2 badges
  const g2 = { state: { badges: [true, true, false, false, false, false, false, false], party: [createMon(1001, 22)] } };
  const p2 = buildRivalParty(g2, [[1010, 20], [1004, 22]]);
  assert(p2.every((m) => m.item === null), '2 badges (avant la 3e arène) : aucun objet tenu');

  // Test 3 badges (Floralia / 3e arène battue)
  const g3 = { state: { badges: [true, true, true, false, false, false, false, false], party: [createMon(1001, 28)] } };
  const p3 = buildRivalParty(g3, [[1011, 27], [1034, 26], [1021, 26], [1005, 29]]);
  assert(p3.some((m) => m.item !== null), '3 badges : des objets stratégiques sont désormais équipés');
  assert(p3[0].item === 'focus-sash', 'Piouffon a Ceinture Force');
  assert(p3[3].item === 'sitrus-berry', 'Starter a Baie Sitrus');

  // Test 7 badges (fin de jeu)
  const g7 = { state: { badges: Array(8).fill(true), party: [createMon(1001, 70)] } };
  const p7 = buildRivalParty(g7, [[1012, 72], [1035, 71], [1022, 72], [1040, 72], [1051, 73], [1006, 76]]);
  assert(p7[0].item === 'focus-sash', 'Plumorage a Ceinture Force');
  assert(p7[1].item === 'choice-specs', 'Gerboltz a Lunettes Choix');
  assert(p7[2].item === 'leftovers', 'Champitron a Restes');
  assert(p7[4].item === 'lum-berry', 'Cieldrake a Baie Prun');
  assert(p7[5].item === 'life-orb', 'Starter Lustrelle a Orbe Vie');
}

console.log('\n=== Test 4 : Movesets stratégiques évolutifs ===');
{
  // Début de jeu (< 3 badges) : capacités naturelles
  const gEarly = { state: { badges: [true, false, false, false, false, false, false, false], party: [createMon(1001, 12)] } };
  const pEarly = buildRivalParty(gEarly, [[1010, 11]]);
  // Au niveau 11, Piouf a des attaques de base (Charge, etc.)
  assert(pEarly[0].moves.length > 0, 'Début de jeu : movesets naturels de montée de niveau');

  // Fin de jeu (>= 6 badges) : movesets de tournoi / compétition
  const gLate = { state: { badges: Array(7).fill(true), party: [createMon(1001, 65)] } };
  const pLate = buildRivalParty(gLate, [[1012, 65], [1035, 65], [1022, 65], [1051, 65]]);
  
  const plumorageMoves = pLate[0].moves.map((mv) => MOVES[mv.id].key);
  assert(plumorageMoves.includes('brave-bird'), 'Plumorage a Rapace');
  assert(plumorageMoves.includes('close-combat'), 'Plumorage a Close Combat');
  assert(plumorageMoves.includes('swords-dance'), 'Plumorage a Danse Lames');

  const gerboltzMoves = pLate[1].moves.map((mv) => MOVES[mv.id].key);
  assert(gerboltzMoves.includes('thunderbolt'), 'Gerboltz a Tonnerre');
  assert(gerboltzMoves.includes('nasty-plot'), 'Gerboltz a Machination');
  assert(gerboltzMoves.includes('focus-blast'), 'Gerboltz a Exploforce');

  const champitronMoves = pLate[2].moves.map((mv) => MOVES[mv.id].key);
  assert(champitronMoves.includes('spore'), 'Champitron a Spore');
  assert(champitronMoves.includes('giga-drain'), 'Champitron a Giga-Sangsue');

  const cieldrakeMoves = pLate[3].moves.map((mv) => MOVES[mv.id].key);
  assert(cieldrakeMoves.includes('dragon-dance'), 'Cieldrake a Danse Draco');
  assert(cieldrakeMoves.includes('outrage'), 'Cieldrake a Colère');
}

console.log('\n=== Test 5 : Objets de soin du dresseur selon la progression ===');
{
  assert(Object.keys(getRivalItems({ state: { badges: [] } })).length === 0, 'Labo : aucun objet de soin');
  assert(getRivalItems({ state: { badges: [true] } })['potion'] === 1, '1 badge : 1 Potion');
  assert(getRivalItems({ state: { badges: [true, true] } })['potion'] === 1, '2 badges : 1 Potion');
  assert(getRivalItems({ state: { badges: [true, true, true] } })['super-potion'] === 2, '3 badges : 2 Super Potions');
  assert(getRivalItems({ state: { badges: Array(5).fill(true) } })['hyper-potion'] === 2, '5 badges : 2 Hyper Potions');
  assert(getRivalItems({ state: { badges: Array(8).fill(true) } })['full-restore'] === 2, 'Ligue : 2 Guérisons (Full Restore)');
}

console.log('\n=== Test 6 : IA très forte en situation de combat ===');
{
  // Test IA KO prioritaire avec attaque de priorité
  const rivalMon = createMon(149, 70, { moves: [89, 245] }); // Dracolosse : Séisme (89) et Vitesse Extrême (245, prioritaire +2)
  const playerMon = createMon(1006, 70);
  playerMon.hp = 15; // Le joueur n'a plus que 15 PV
  
  const battle = new Battle({
    player: { party: [playerMon], name: 'Joueur' },
    foe: {
      name: 'Théo',
      trainer: { cls: 'Rival', name: 'Théo', ai: 'smart' },
      party: [rivalMon]
    }
  });

  const choice = battle.foeChoose();
  assert(choice.type === 'move', 'L\'IA choisit une attaque');
  assert(choice.id === 245, 'L\'IA utilise Vitesse Extrême pour garantir le KO prioritaire');
}

console.log(`\n===========================================`);
console.log(`RÉSULTAT : ${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
