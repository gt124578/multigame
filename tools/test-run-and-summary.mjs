import assert from 'assert';
import { Battle } from '../odyssee/js/core/battle.js';
import { createMon } from '../odyssee/js/core/mon.js';

console.log('=== Test Fuite en Combat de Dresseur vs Combat Sauvage ===');

// 1. Combat de dresseur (wild = false)
const p1 = createMon(1, 15);
const p2 = createMon(4, 15);
const trainerBattle = new Battle({
  player: { name: 'Joueur', party: [p1], bag: {} },
  foe: { name: 'Rival', party: [p2], trainer: { cls: 'Rival', name: 'Rival' } }
});
trainerBattle.start();

const initialTurn = trainerBattle.turn;
const evs = trainerBattle.playerAction({ type: 'run' });

assert.strictEqual(trainerBattle.turn, initialTurn, 'Le tour ne doit pas avoir augmenté en combat de dresseur lors d\'une fuite');
assert.ok(evs.some(e => e.t === 'msg' && e.text.includes('Impossible de fuir')), 'Un message d\'interdiction doit être renvoyé');
assert.ok(!evs.some(e => e.t === 'move'), 'L\'adversaire ne doit pas attaquer quand la fuite est refusée');
console.log('✓ Combat de dresseur : la fuite ne saute pas le tour et n\'entraîne aucune attaque adverse');

// 2. Combat sauvage (wild = true)
const wildBattle = new Battle({
  player: { name: 'Joueur', party: [p1], bag: {} },
  foe: { name: 'Rattata', party: [p2], trainer: null }
});
wildBattle.start();
const wildEvs = wildBattle.playerAction({ type: 'run' });
assert.ok(wildBattle.state === 'over' || wildBattle.turn > 0, 'En combat sauvage, l\'action de fuite est résolue');
console.log('✓ Combat sauvage : la fuite fonctionne normalement');

console.log('\n=== Tous les tests spécifiques sont validés avec succès ! ===');
