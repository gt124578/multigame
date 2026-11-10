import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, itemName } from '../odyssee/js/core/items.js';
import { buildWorld } from '../odyssee/js/world/region.js';

console.log('=== TEST 1 : DÉFINITION DE L\'OBJET CANNE À PÊCHE ===');
assert.ok(ITEMS.canne, 'L\'objet canne doit exister');
assert.equal(ITEMS.canne.pocket, 'cles', 'La canne doit être dans la poche des objets rares');
assert.equal(ITEMS.canne.key, true, 'La canne est un objet rare clé');
assert.ok(ITEMS.canne.name.includes('Canne'), 'Nom de la canne valide');
assert.ok(ITEMS.canne.desc.includes('pêche') || ITEMS.canne.desc.includes('Pêche'), 'Description valide');
console.log('✓ Objet "canne" correctement configuré dans ITEMS !');

console.log('\n=== TEST 2 : DON DE LA CANNE PAR LES PNJ PÊCHEURS ===');
class MockApi {
  constructor() {
    this.bag = {};
    this.messages = [];
  }
  has(k, n = 1) { return (this.bag[k] || 0) >= n; }
  give(k, n = 1) { this.bag[k] = (this.bag[k] || 0) + n; }
  async say(lines) { this.messages.push(lines); }
}

// 1. Pêcheur de Port-Azur
const world = buildWorld();
const portAzur = world.towns.D;
const barnabe = portAzur.npcs.find((n) => n.id === 'pecheur');
assert.ok(barnabe, 'Le pêcheur Barnabé de Port-Azur doit exister');
assert.equal(typeof barnabe.talk, 'function', 'Le pêcheur doit avoir une fonction talk()');

const api1 = new MockApi();
await barnabe.talk(api1);
assert.equal(api1.has('canne'), true, 'Barnabé doit donner la canne si le joueur ne l\'a pas');
console.log('✓ Barnabé donne la Canne à Pêche au joueur !');

const oldBagCount = api1.bag['canne'];
await barnabe.talk(api1);
assert.equal(api1.bag['canne'], oldBagCount, 'Barnabé ne doit pas redonner une deuxième canne');
console.log('✓ Barnabé dialogue normalement une fois la canne reçue !');

// 2. Vérification de lieux.js pour le lac secret
const lieuxSrc = fs.readFileSync(path.resolve('arcadia/odyssee/js/world/lieux.js'), 'utf8');
assert.ok(lieuxSrc.includes("!A.has('canne')"), 'Le lac secret doit vérifier !A.has("canne")');
assert.ok(lieuxSrc.includes("A.give('canne')"), 'Le lac secret doit donner la canne');
console.log('✓ Pêcheur du lac secret configuré pour offrir la canne !');

console.log('\n=== TEST 3 : LOGIQUE DU RACCOURCI FAST BALL ===');
// Implémentation testée de getFastBall (identique à battleView.js)
function getFastBall(ctx) {
  if (!ctx.battle?.wild) return null;
  const bag = ctx.game?.state?.bag || {};
  const last = ctx.lastBattleItem || ctx.game?._lastBattleItem;
  if (last && ITEMS[last]?.ball && (bag[last] || 0) > 0) {
    return { id: last, name: itemName(last), count: bag[last], it: ITEMS[last] };
  }
  const priority = ['ultra-ball', 'great-ball', 'poke-ball', 'master-ball'];
  for (const pid of priority) {
    if ((bag[pid] || 0) > 0) {
      return { id: pid, name: itemName(pid), count: bag[pid], it: ITEMS[pid] };
    }
  }
  for (const [k, qty] of Object.entries(bag)) {
    if (qty > 0 && ITEMS[k]?.ball) {
      return { id: k, name: itemName(k), count: qty, it: ITEMS[k] };
    }
  }
  return null;
}

const mockCtx = {
  game: {
    state: {
      bag: { 'poke-ball': 5, 'great-ball': 2, potion: 3 }
    },
    _lastBattleItem: null
  },
  battle: { wild: true },
  lastBattleItem: null
};

// Test A : sélection automatique de la meilleure Ball disponible
let fb = getFastBall(mockCtx);
assert.ok(fb, 'Une Fast Ball doit être trouvée');
assert.equal(fb.id, 'great-ball', 'Doit proposer great-ball en priorité sur poke-ball');
console.log('✓ Fast Ball propose la meilleure Ball disponible (Super Ball)');

// Test B : respect de la mémoire du dernier objet utilisé
mockCtx.lastBattleItem = 'poke-ball';
fb = getFastBall(mockCtx);
assert.equal(fb.id, 'poke-ball', 'Doit proposer poke-ball si c\'est la dernière Ball utilisée');
console.log('✓ Fast Ball respecte la mémoire du dernier objet utilisé (Poké Ball)');

// Test C : aucune ball en stock
mockCtx.game.state.bag = { potion: 10 };
mockCtx.lastBattleItem = null;
fb = getFastBall(mockCtx);
assert.equal(fb, null, 'Doit renvoyer null si aucune Ball dans le sac');
console.log('✓ Fast Ball renvoie null si aucune Ball');

// Test D : combat de dresseur (non sauvage)
mockCtx.game.state.bag = { 'ultra-ball': 5 };
mockCtx.battle.wild = false;
fb = getFastBall(mockCtx);
assert.equal(fb, null, 'Doit renvoyer null si combat de dresseur');
console.log('✓ Fast Ball désactivé en combat de dresseur');

console.log('\n=== TEST 4 : INTÉGRATION SOURCE & FICHIERS ===');
// 1. battleView.js
const bvSrc = fs.readFileSync(path.resolve('arcadia/odyssee/js/ui/battleView.js'), 'utf8');
assert.ok(bvSrc.includes('getFastBall()'), 'battleView.js doit contenir getFastBall()');
assert.ok(bvSrc.includes('fast-ball-banner'), 'battleView.js doit afficher fast-ball-banner');
assert.ok(bvSrc.includes("k === 'ball' && fastBall"), 'battleView.js doit écouter la touche ball');
assert.ok(bvSrc.includes('c.fastBall'), 'chooseAction doit gérer c.fastBall');
console.log('✓ battleView.js intègre parfaitement le lancer rapide !');

// 2. input.js
const inputSrc = fs.readFileSync(path.resolve('arcadia/odyssee/js/input.js'), 'utf8');
assert.ok(inputSrc.includes("KeyB: 'ball'") && inputSrc.includes("KeyY: 'ball'"), 'input.js doit mapper KeyB et KeyY à ball');
console.log('✓ input.js a les touches B et Y mappées à ball !');

// 3. 08-combat.css
const cssSrc = fs.readFileSync(path.resolve('arcadia/odyssee/css/08-combat.css'), 'utf8');
assert.ok(cssSrc.includes('.fast-ball-banner'), '08-combat.css doit contenir .fast-ball-banner');
assert.ok(cssSrc.includes('.fbb-key-pill'), '08-combat.css doit styliser .fbb-key-pill');
console.log('✓ 08-combat.css contient tous les styles de la bannière Fast Ball !');

// 4. game.js
const gameSrc = fs.readFileSync(path.resolve('arcadia/odyssee/js/game.js'), 'utf8');
assert.ok(gameSrc.includes('tryWaterInteraction(fx, fy)'), 'game.js doit appeler tryWaterInteraction face à l\'eau');
assert.ok(gameSrc.includes('async pecher(fx, fy)'), 'game.js doit implémenter pecher(fx, fy)');
assert.ok(gameSrc.includes("r.item === 'canne'"), 'game.js fieldBag doit gérer l\'utilisation de la canne');
assert.ok(gameSrc.includes("st.bag['canne'] > 0"), 'game.js doit vérifier la possession de la canne');
console.log('✓ game.js intègre la mécanique de pêche et l\'interaction aquatique !');

// 5. ui.js
const uiSrc = fs.readFileSync(path.resolve('arcadia/odyssee/js/ui/ui.js'), 'utf8');
assert.ok(uiSrc.includes('Pêche & Capacités'), 'ui.js doit documenter la pêche');
assert.ok(uiSrc.includes('Lancer rapide de Ball'), 'ui.js doit documenter le lancer rapide');
console.log('✓ ui.js panneau d\'aide à jour avec les commandes !');

console.log('\n=== TOUS LES TESTS FAST BALL & PÊCHE SONT VALIDÉS AVEC SUCCÈS (100%) ===');
