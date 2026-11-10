import assert from 'node:assert/strict';
import {
  TROPHIES_CATALOG,
  STREAK_RANKS,
  getStreakRank,
  ensurePvpState,
  recordPvpMatch,
  claimTrophyReward,
  getPvpSummary,
  getHeadToHeadStatus,
  checkAllTrophies
} from '../odyssee/js/core/trophies.js';

console.log('Testing Odyssée Trophies, Medals & PvP System...');

// ============================================================================
// 1. Catalog integrity & Master Ball reward constraint
// ============================================================================
assert.equal(TROPHIES_CATALOG.length, 36, 'Le catalogue comporte 36 trophées (12 PvP + 24 Aventure/Dex)');

const pvpTrophies = TROPHIES_CATALOG.filter((t) => ['combat', 'reseau', 'rival', 'streak'].includes(t.category));
assert.equal(pvpTrophies.length, 12, 'Il doit y avoir exactement 12 trophées PvP');

const aventureTrophies = TROPHIES_CATALOG.filter((t) => t.category === 'aventure');
assert.equal(aventureTrophies.length, 4, 'Il doit y avoir 4 trophées Aventure');

const dexTrophies = TROPHIES_CATALOG.filter((t) => t.category === 'pokedex');
assert.equal(dexTrophies.length, 8, 'Il doit y avoir 8 trophées Pokédex (dont captures 200 et complétion de routes)');

const trainTrophies = TROPHIES_CATALOG.filter((t) => t.category === 'entrainement');
assert.equal(trainTrophies.length, 4, 'Il doit y avoir 4 trophées Entraînement');

const explorTrophies = TROPHIES_CATALOG.filter((t) => t.category === 'exploration');
assert.equal(explorTrophies.length, 4, 'Il doit y avoir 4 trophées Exploration');

const domaineTrophies = TROPHIES_CATALOG.filter((t) => t.category === 'domaine');
assert.equal(domaineTrophies.length, 4, 'Il doit y avoir 4 trophées Domaine & Économie');

// RÈGLE UTILISATEUR STRICTE :
// "change ls masters balls en cado sauf pour les 50 victoires et t'en met qu'une"
const mbTrophies = TROPHIES_CATALOG.filter((t) => t.reward?.item === 'master-ball');
assert.equal(mbTrophies.length, 1, 'Exactement UN SEUL trophée dans tout le catalogue doit donner une Master Ball');
assert.equal(mbTrophies[0].id, 'pvp_fifty_wins', 'Le trophée Master Ball doit être pvp_fifty_wins');
assert.equal(mbTrophies[0].reward.count, 1, 'La récompense de pvp_fifty_wins doit être exactement 1 Master Ball');

// Vérification de pvp_ten_same_player : ne doit plus être une Master Ball
const tenSame = TROPHIES_CATALOG.find((t) => t.id === 'pvp_ten_same_player');
assert.notEqual(tenSame?.reward?.item, 'master-ball', 'pvp_ten_same_player ne doit pas donner de Master Ball');
assert.equal(tenSame?.reward?.item, 'choice-specs');

// ============================================================================
// 2. Initial State & Summary
// ============================================================================
const state = {
  name: 'Red',
  bag: {},
  badges: Array(15).fill(false),
  flags: {},
  party: [],
  box: [],
  dex: { seen: [], caught: [] },
  visited: ['aube'],
  journal: {},
  money: 3000,
  jetons: 0
};

const pvp = ensurePvpState(state);
assert.equal(pvp.totalWins, 0);
assert.equal(pvp.totalLosses, 0);
assert.equal(pvp.currentStreak, 0);
assert.equal(pvp.bestStreak, 0);
assert.deepEqual(pvp.players, {});
assert.deepEqual(pvp.trophies, {});

let summary = getPvpSummary(state);
assert.equal(summary.totalMatches, 0);
assert.equal(summary.winRate, '0.0%');
assert.equal(summary.unlockedCount, 0);
assert.equal(summary.trophiesTotal, 36);
assert.equal(summary.rank.title, 'Challenger');

// ============================================================================
// 3. PvP progression & Duels
// ============================================================================
// 3.1 Win against Player 1 (Blue)
let res = recordPvpMatch(state, 'Blue', 'win');
assert.equal(res.currentStreak, 1);
assert.equal(res.bestStreak, 1);
assert.equal(state.pvp.totalWins, 1);
assert.equal(state.pvp.players['Blue'].wins, 1);
assert(res.newlyUnlocked.some((t) => t.id === 'pvp_first_win'));
assert.equal(state.pvp.trophies['pvp_first_win'].unlocked, true);
assert.equal(state.pvp.trophies['pvp_first_win'].claimed, false);

// 3.2 Win against Player 2 (Leaf) -> "Premier Réseau" (2 joueurs distincts)
res = recordPvpMatch(state, 'Leaf', 'win');
assert.equal(res.currentStreak, 2);
assert.equal(res.bestStreak, 2);
assert(res.newlyUnlocked.some((t) => t.id === 'pvp_two_players'));

// 3.3 Win streak reaches 3 -> "Étincelle Guerrière"
res = recordPvpMatch(state, 'Leaf', 'win');
assert.equal(res.currentStreak, 3);
assert.equal(res.bestStreak, 3);
assert(res.newlyUnlocked.some((t) => t.id === 'pvp_streak_3'));
assert.equal(res.rank.title, '🔥 En Série');

// 3.4 Lose against Silver -> streak resets, bestStreak preserved
res = recordPvpMatch(state, 'Silver', 'lose');
assert.equal(res.currentStreak, 0);
assert.equal(res.bestStreak, 3);
assert.equal(state.pvp.totalLosses, 1);
let h2hSilver = getHeadToHeadStatus(state.pvp.players['Silver']);
assert.equal(h2hSilver.cls, 'revenge');

// 3.5 Beat Blue 4 more times (total 5 times) -> "Rival Éternel"
for (let i = 0; i < 4; i++) {
  res = recordPvpMatch(state, 'Blue', 'win');
}
assert.equal(state.pvp.players['Blue'].wins, 5);
assert(state.pvp.trophies['pvp_five_same_player']?.unlocked);
let h2hBlue = getHeadToHeadStatus(state.pvp.players['Blue']);
assert.equal(h2hBlue.cls, 'domination');

// 3.6 Streak reaches 5 -> "Flamme Ardente"
res = recordPvpMatch(state, 'Blue', 'win'); // streak = 5
assert.equal(res.currentStreak, 5);
assert.equal(res.bestStreak, 5);
assert(state.pvp.trophies['pvp_streak_5']?.unlocked);
assert.equal(res.rank.title, '🔥🔥 Flamboyant');

// 3.7 Beat Blue up to 10 wins -> "Némésis Suprême"
for (let i = 0; i < 4; i++) {
  res = recordPvpMatch(state, 'Blue', 'win');
}
assert.equal(state.pvp.players['Blue'].wins, 10);
assert(state.pvp.trophies['pvp_ten_same_player']?.unlocked);

// 3.8 Streak reaches 10 -> "Légende Invaincue"
assert.equal(res.currentStreak, 9);
res = recordPvpMatch(state, 'Blue', 'win'); // 10th consecutive win
assert.equal(res.currentStreak, 10);
assert.equal(res.bestStreak, 10);
assert(state.pvp.trophies['pvp_streak_10']?.unlocked);
assert.equal(res.rank.title, '⚡ Foudre d\'Élite');

// Streak reaches 15 -> "Légende Invaincue" rank
for (let i = 0; i < 5; i++) {
  res = recordPvpMatch(state, 'Blue', 'win');
}
assert.equal(res.currentStreak, 15);
assert.equal(res.bestStreak, 15);
assert.equal(res.rank.title, '👑 Légende Invaincue');

// 3.9 Accumulate 50 total wins -> "Seigneur des Duels"
while (state.pvp.totalWins < 50) {
  res = recordPvpMatch(state, 'Blue', 'win');
}
assert.equal(state.pvp.totalWins, 50);
assert(state.pvp.trophies['pvp_fifty_wins']?.unlocked);

// ============================================================================
// 4. Claiming PvP rewards & Master Ball test
// ============================================================================
// 4.1 Claim pvp_first_win -> Super Bonbon x2
const claimCandies = claimTrophyReward(state, 'pvp_first_win');
assert.equal(claimCandies.ok, true);
assert.equal(state.bag['rare-candy'], 2);
assert.equal(state.pvp.trophies['pvp_first_win'].claimed, true);

// Double claim prevention
const claimCandiesDup = claimTrophyReward(state, 'pvp_first_win');
assert.equal(claimCandiesDup.ok, false);
assert.equal(state.bag['rare-candy'], 2);

// 4.2 Claim pvp_ten_same_player -> Lunettes Choix x1 (NOT Master Ball)
const claimSpecs = claimTrophyReward(state, 'pvp_ten_same_player');
assert.equal(claimSpecs.ok, true);
assert.equal(state.bag['choice-specs'], 1);
assert.equal(state.bag['master-ball'] || 0, 0);

// 4.3 Claim pvp_fifty_wins -> EXACTEMENT 1 Master Ball
const claimMb = claimTrophyReward(state, 'pvp_fifty_wins');
assert.equal(claimMb.ok, true);
assert.equal(state.bag['master-ball'], 1, 'Le joueur doit recevoir exactement 1 Master Ball et pas 2 !');

// ============================================================================
// 5. Non-PvP Medals Evaluation (checkAllTrophies)
// ============================================================================
// 5.1 Aventure / Badges
state.badges = [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false];
let newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'story_badges_4'));
assert.equal(state.pvp.trophies['story_badges_4'].unlocked, true);

state.badges = [true, true, true, true, true, true, true, true, false, false, false, false, false, false, false];
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'story_badges_8'));

state.badges = Array(15).fill(true);
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'story_badges_15'));

state.flags.lugiaCaught = true;
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'story_shadow_lugia'));

// 5.2 Pokédex & Shinies
state.dex.caught = Array.from({ length: 20 }, (_, i) => i + 1);
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'dex_caught_20'));

state.dex.caught = Array.from({ length: 60 }, (_, i) => i + 1);
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'dex_caught_60'));

state.dex.caught = Array.from({ length: 120 }, (_, i) => i + 1);
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'dex_caught_120'));

state.party.push({ sp: 1, lvl: 5, shiny: true }); // Bulbizarre shiny (de base)
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'dex_shiny_hunter'));

// 5.3 Entraînement & Évolutions
state.party.push({ sp: 2, lvl: 18 }); // Herbizarre (évolution de Bulbizarre)
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'train_first_evo'));

state.party.push({ sp: 134, lvl: 35 }); // Aquali (évolution par pierre Eau)
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'train_stone_evo'));

state.party[0].lvl = 100; // Niveau 100
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'train_level_100'));

// Équipe de 6 au niveau 60+
state.party = [
  { sp: 3, lvl: 65 },
  { sp: 6, lvl: 62 },
  { sp: 9, lvl: 60 },
  { sp: 25, lvl: 70 },
  { sp: 134, lvl: 61 },
  { sp: 149, lvl: 63 }
];
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'train_team_60'));

// 5.4 Exploration & Quêtes
for (let i = 1; i <= 15; i++) {
  state.flags['I:item_' + i] = true;
}
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'explor_items_15'));

state.visited = ['aube', 'cote', 'ebene', 'foret', 'port', 'vallee', 'pic', 'plage', 'archipel', 'metropole'];
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'explor_all_towns'));

state.journal = {
  q1: { done: true },
  q2: { status: 'done' },
  q3: { done: true },
  q4: { done: true },
  q5: { done: true }
};
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'quests_completed_5'));

state.bag['secateur-sylvestre'] = 1;
state.bag['harnais-flottant'] = 1;
state.bag['sifflet-celeste'] = 1;
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'explor_field_items'));

// 5.5 Domaine & Économie
state.domaine = { travaux: ['pont'], hab: [] };
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'domaine_first_build'));

state.domaine.hab = ['lucas', 'sarah', 'pierre'];
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'domaine_residents_3'));

state.jetons = 1000;
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'casino_coins_1000'));

state.money = 100000;
newly = checkAllTrophies(state);
assert(newly.some((t) => t.id === 'economy_rich_100k'));

// ============================================================================
// 6. Claim non-PvP rewards
// ============================================================================
const claimScarf = claimTrophyReward(state, 'story_badges_15');
assert.equal(claimScarf.ok, true);
assert.equal(state.bag['choice-scarf'], 1);

const claimEviolite = claimTrophyReward(state, 'dex_caught_60');
assert.equal(claimEviolite.ok, true);
assert.equal(state.bag['eviolite'], 1);

const claimLifeOrb = claimTrophyReward(state, 'train_team_60');
assert.equal(claimLifeOrb.ok, true);
assert.equal(state.bag['life-orb'], 1);

const claimSilk = claimTrophyReward(state, 'explor_field_items');
assert.equal(claimSilk.ok, true);
assert.equal(state.bag['silk-scarf'], 1);

const claimBand = claimTrophyReward(state, 'economy_rich_100k');
assert.equal(claimBand.ok, true);
assert.equal(state.bag['choice-band'], 1);

// Summary final
summary = getPvpSummary(state);
assert(summary.unlockedCount >= 25);
assert(summary.claimedCount >= 5);
assert.equal(summary.trophiesTotal, 36);

console.log('✔ All Trophies, Medals (PvP + Non-PvP) & Master Ball constraint tests PASSED 100%!');
