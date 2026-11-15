// tools/test-odyssee-journal-quetes.mjs — le journal des quêtes d'Odyssée (core/questsData.js) : un carnet de voyage.
// Une quête n'apparaît qu'une fois acceptée ; ses phrases rappellent ce qui a été demandé et ce qui s'est passé, sans
// indice ni destination ; le journal retient le temps de jeu écoulé depuis qu'elle a été acceptée ; une ancienne
// sauvegarde garde ses quêtes (« il y a longtemps ») ; la quête suivie s'affiche dans le HUD.
//   node tools/test-odyssee-journal-quetes.mjs
import assert from 'node:assert/strict';
import { getAllQuests, getTrackedQuest, setTrackedQuest, syncJournal, since, QUEST_CATEGORIES, QUEST_COUNT } from '../odyssee/js/core/questsData.js';

console.log('--- Journal des quêtes ---');
const makeGame = (flags = {}, badges = 0, journal = {}) => ({
  state: { name: 'Léa', gender: 'f', flags, badges: Array(8).fill(false).map((_, i) => i < badges), party: [], box: [], dex: { seen: [], caught: [] }, time: 0, journal },
  world: { towns: { B: { gym: 0, name: 'Sylvebourg' }, D: { gym: 1, name: 'Port-Azur' } } },
  rivalLine: () => [4, 5, 6], rivalB: () => ({ name: 'Ethan', e: '', fils: 'petit-fils' }), save() {},
});

// 1. rien n'est noté avant d'avoir accepté une quête
const g0 = makeGame();
assert.equal(getAllQuests(g0).filter((q) => q.cat !== 'main').length, 0, 'aucune quête annexe au début (seule la quête principale est notée)');
assert.ok(QUEST_COUNT >= 45, 'au moins 45 quêtes au registre');
for (const c of ['main', 'side', 'legend', 'npc']) assert.ok(QUEST_CATEGORIES[c], 'catégorie ' + c);
console.log(`✓ journal vide au départ, ${QUEST_COUNT} quêtes possibles`);

// 2. une quête acceptée apparaît, avec l'heure (en temps de jeu) où elle l'a été
const g1 = makeGame({ starter: 1, 'Q:ponyta': 1 });
let fresh = syncJournal(g1);
assert.deepEqual(fresh.map((q) => q.id).filter((id) => id !== 'depart').sort(), ['ligue', 'ponyta']);
g1.state.time = 2 * 3600 + 5 * 60;
const ponyta = getAllQuests(g1).find((q) => q.id === 'ponyta');
assert.equal(ponyta.status, 'active');
assert.equal(ponyta.since, 'il y a 2 h 05 de jeu');
assert.ok(/Lucie/.test(ponyta.note), 'rappel : qui a demandé quoi');
console.log('✓ quête acceptée : « ' + ponyta.note + ' » (' + ponyta.since + ')');

// 3. le carnet s'enrichit à chaque étape, sans jamais dire où aller
g1.state.flags['Q:ponyta'] = 3; g1.state.badges[0] = true;
const p3 = getAllQuests(g1).find((q) => q.id === 'ponyta');
assert.equal(p3.notes.length, 3, 'trois phrases après trois étapes');
const HINT = /📍|destination|rends-toi|va voir|il faut aller/i;
const all = makeGame(Object.fromEntries([['starter', 1], ['rival1', 1], ['T:ecl:bois1', 1], ['giftFlash', 1], ['eclipse', 1], ['Q:lac', 3], ['Q:songes', 5], ['orageQuest', 1], ['gsGiven', 1], ['A:mPanier', 1], ['A:qRoche', 1]]), 3);
for (const q of getAllQuests(all)) for (const n of q.notes) assert.ok(!HINT.test(n), `pas d'indice dans « ${n} »`);
console.log(`✓ ${getAllQuests(all).length} quêtes notées, aucune phrase ne donne d'indice`);

// 4. une quête terminée passe dans « terminées » et garde l'heure de fin
g1.state.flags['Q:ponyta'] = 'fin'; g1.state.time += 60; syncJournal(g1);
assert.equal(getAllQuests(g1).find((q) => q.id === 'ponyta').status, 'done');
assert.ok(g1.state.journal.ponyta.d >= g1.state.journal.ponyta.t);
console.log('✓ quête terminée');

// 5. ancienne sauvegarde (sans journal) : les quêtes déjà commencées sont notées « il y a longtemps »
const old = makeGame({ starter: 1, 'Q:lac': 2 }, 2, undefined); delete old.state.journal;
assert.equal(syncJournal(old).length, 0, 'pas d\'annonce pour une ancienne sauvegarde');
assert.equal(getAllQuests(old).find((q) => q.id === 'lac').since, 'il y a longtemps');
assert.equal(since(old, -1), 'il y a longtemps');
console.log('✓ ancienne sauvegarde reprise');

// 6. la quête suivie s'affiche dans le HUD, et se désélectionne
assert.equal(getTrackedQuest(g1), null, 'aucune quête suivie par défaut');
setTrackedQuest(g1, 'ligue');
assert.equal(getTrackedQuest(g1).id, 'ligue');
setTrackedQuest(g1, 'ligue');
assert.equal(getTrackedQuest(g1), null);
console.log('✓ suivi d\'une quête dans le HUD');
console.log('JOURNAL DES QUÊTES : OK');
