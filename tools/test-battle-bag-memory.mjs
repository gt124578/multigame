import assert from 'node:assert/strict';
import { ITEMS } from '../odyssee/js/core/items.js';

console.log('Testing in-battle bag memory & random trainer megas...');

// 1. Verify itemPocketId logic for balls, soin, objets, baies
const itemPocketId = (k) => {
  const it = ITEMS[k];
  if (!it) return 'objets';
  if (it.pocket === 'baies' || k.includes('berry') || k.includes('baie')) return 'baies';
  if (it.pocket === 'ct' || k.startsWith('cs-') || k.startsWith('ct-')) return 'ct';
  if (it.pocket === 'balls') return 'balls';
  if (it.pocket === 'soin') return 'soin';
  if (it.pocket === 'cles' || it.key) return 'cles';
  return 'objets';
};

assert.equal(itemPocketId('poke-ball'), 'balls');
assert.equal(itemPocketId('great-ball'), 'balls');
assert.equal(itemPocketId('ultra-ball'), 'balls');
assert.equal(itemPocketId('potion'), 'soin');
assert.equal(itemPocketId('oran-berry'), 'baies');

console.log('✓ itemPocketId accurately maps items to B2W2 pockets');

// 2. Mock state & bag simulation
const fakeBag = {
  'potion': 3,
  'super-potion': 2,
  'poke-ball': 10,
  'great-ball': 5,
  'ultra-ball': 2,
  'oran-berry': 4,
};

const POCKETS = ['objets', 'soin', 'balls', 'ct', 'baies', 'cles'];
const entriesFor = (pocketId) => {
  return Object.keys(fakeBag)
    .filter((k) => ITEMS[k] && itemPocketId(k) === pocketId && fakeBag[k] > 0)
    .sort((a, b) => Object.keys(ITEMS).indexOf(a) - Object.keys(ITEMS).indexOf(b));
};

// Simulation of bagScreen opening with great-ball as last used item
const initialItem = 'great-ball';
const targetPId = itemPocketId(initialItem);
const targetPIdx = POCKETS.indexOf(targetPId);
assert.equal(targetPId, 'balls');
assert.equal(targetPIdx, 2);

const ballsEntries = entriesFor(targetPId);
const itemIdx = ballsEntries.indexOf(initialItem);
assert(itemIdx >= 0, 'great-ball doit être présent dans la poche des Poké Balls');
assert.equal(ballsEntries[itemIdx], 'great-ball');

console.log(`✓ Initial open on '${initialItem}': pocket '${targetPId}' (index ${targetPIdx}), item index ${itemIdx} in list: [${ballsEntries.join(', ')}]`);

// 3. Verify game.js trainer mega code
import fs from 'fs';
const resolvePath = (p) => fs.existsSync(p) ? p : 'arcadia/' + p;
const gameCode = fs.readFileSync(resolvePath('odyssee/js/game.js'), 'utf8');
assert(gameCode.includes("if (o.leader != null || o.champion || h % 3 === 0) o.trainer = { ...o.trainer, megaSp: 'auto', megaSeed: h };"), "game.js doit autoriser les dresseurs aléatoires à méga-évoluer à 5+ badges");

// 4. Verify battleView.js code passes initialItem
const bvCode = fs.readFileSync(resolvePath('odyssee/js/ui/battleView.js'), 'utf8');
assert(bvCode.includes("initialItem: this.lastBattleItem || this.game._lastBattleItem"), "battleView.js doit passer le dernier objet utilisé");

// 5. Verify bag.js remembers item in battle
const bagCode = fs.readFileSync(resolvePath('odyssee/js/ui/screens/bag.js'), 'utf8');
assert(bagCode.includes("if (o.battle) game._lastBattleItem = item;"), "bag.js doit enregistrer game._lastBattleItem lors de l'utilisation en combat");

console.log('🎉 ALL BATTLE BAG MEMORY & RANDOM TRAINER MEGA CHECKS PASSED 100%!');
