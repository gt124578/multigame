// tools/test-starters-talents.mjs — tests unitaires des 3 nouveaux talents des starters
import assert from 'node:assert/strict';
import { ABILITIES, abilitiesOf, getAbility } from '../odyssee/js/data/abilities.js';
import { createMon } from '../odyssee/js/core/mon.js';
import { Battle } from '../odyssee/js/core/battle.js';
import { MOVES } from '../odyssee/js/data/moves.js';

let passed = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  passed++;
};

console.log('--- 1. Vérification des données des talents ---');

// Vérification de la présence dans ABILITIES
const expected = [
  ['halo-sylvestre', 'Halo Sylvestre', 'Attaque Spéciale'],
  ['cire-brulante', 'Cire Brûlante', 'Vitesse'],
  ['coeur-vaillant', 'Cœur Vaillant', 'Attaque'],
];

for (const [id, nom, keyword] of expected) {
  const ab = ABILITIES[id];
  ok(ab, `Le talent ${id} existe dans ABILITIES`);
  ok(ab.name === nom, `Nom français exact pour ${id} : "${ab.name}" === "${nom}"`);
  ok(ab.desc && ab.desc.includes(keyword), `Description de ${id} contient "${keyword}"`);
}

// Vérification de l'attribution aux 9 espèces des 3 familles
const plantLine = [1001, 1002, 1003];
const fireLine = [1004, 1005, 1006];
const waterLine = [1007, 1008, 1009];

for (const sp of plantLine) {
  const [a] = abilitiesOf(sp);
  ok(a === 'halo-sylvestre', `Espèce ${sp} a halo-sylvestre en talent principal`);
  const m = createMon(sp, 5);
  ok(getAbility(m).id === 'halo-sylvestre', `createMon(${sp}) a Halo Sylvestre`);
}

for (const sp of fireLine) {
  const [a] = abilitiesOf(sp);
  ok(a === 'cire-brulante', `Espèce ${sp} a cire-brulante en talent principal`);
  const m = createMon(sp, 5);
  ok(getAbility(m).id === 'cire-brulante', `createMon(${sp}) a Cire Brûlante`);
}

for (const sp of waterLine) {
  const [a] = abilitiesOf(sp);
  ok(a === 'coeur-vaillant', `Espèce ${sp} a coeur-vaillant en talent principal`);
  const m = createMon(sp, 5);
  ok(getAbility(m).id === 'coeur-vaillant', `createMon(${sp}) a Cœur Vaillant`);
}

console.log('--- 2. Tests de combat : Halo Sylvestre (Capyousse) ---');
{
  // Capyousse (1001) entre en combat contre un Rattata (19)
  const capy = createMon(1001, 10);
  const foe = createMon(19, 10);
  const b = new Battle({
    player: { name: 'Dresseur', party: [capy], bag: {} },
    foe: { name: 'Adversaire', party: [foe], trainer: { cls: 'Gamin', name: 'Tim' } },
  });

  const ev = b.start();
  // sid 4 = Sp. Atk -> index 3 dans st
  ok(b.sides[1].v.st[3] === -1, 'Halo Sylvestre baisse l\'Atq Spé de l\'adversaire d\'un cran (-1)');
  const msgs = ev.filter((e) => e.t === 'msg').map((e) => e.text);
  ok(msgs.some((m) => m.includes('Halo Sylvestre') && m.includes('rayonne doucement')), 'Message Halo Sylvestre affiché');
}

console.log('--- 3. Tests de combat : Cœur Vaillant (Narvi) ---');
{
  // Narvi (1007) entre en combat : son Attaque augmente de +1
  const narvi = createMon(1007, 10);
  const foe = createMon(19, 10);
  const b = new Battle({
    player: { name: 'Dresseur', party: [narvi], bag: {} },
    foe: { name: 'Adversaire', party: [foe], trainer: { cls: 'Gamin', name: 'Tim' } },
  });

  const ev = b.start();
  // sid 2 = Atk -> index 1 dans st
  ok(b.sides[0].v.st[1] === 1, 'Cœur Vaillant monte l\'Attaque de Narvi d\'un cran (+1) à l\'entrée');
  const msgs = ev.filter((e) => e.t === 'msg').map((e) => e.text);
  ok(msgs.some((m) => m.includes('Cœur Vaillant') && m.includes('s\'enflamme de bravoure')), 'Message Cœur Vaillant entrée affiché');
}

{
  // Narvi immunisé contre l'Intimidation ennemie
  const narvi = createMon(1007, 10);
  const gyro = createMon(130, 20); // Léviator a Intimidation
  gyro.ability = 'intimidate';
  const b = new Battle({
    player: { name: 'Dresseur', party: [narvi], bag: {} },
    foe: { name: 'Adversaire', party: [gyro], trainer: { cls: 'Pêcheur', name: 'Barnabé' } },
  });

  const ev = b.start();
  // Narvi a son propre boost (+1), et l'Intimidation a été bloquée (st[1] reste à 1, pas 0 !)
  ok(b.sides[0].v.st[1] === 1, 'Intimidation adverse bloquée : l\'Attaque reste à +1');
  const msgs = ev.filter((e) => e.t === 'msg').map((e) => e.text);
  ok(msgs.some((m) => m.includes('Cœur Vaillant') && m.includes('empêche la baisse')), 'Message d\'immunité à la baisse affiché');
}

{
  // Narvi immunisé contre la peur (flinch)
  const narvi = createMon(1007, 10);
  const foe = createMon(19, 10);
  const b = new Battle({
    player: { name: 'Dresseur', party: [narvi], bag: {} },
    foe: { name: 'Adversaire', party: [foe], trainer: { cls: 'Gamin', name: 'Tim' } },
  });
  b.start();
  // On force flinch sur Narvi
  b.sides[0].v.flinch = true;
  // Narvi utilise une attaque (par exemple Écume / Pistolet à O)
  const moveIdx = 0;
  const ev = b.playerAction({ type: 'move', idx: moveIdx });
  const msgs = ev.filter((e) => e.t === 'msg').map((e) => e.text);
  ok(!msgs.some((m) => m.includes('a peur ! Il ne peut pas attaquer')), 'Narvi n\'a pas peur grâce à Cœur Vaillant');
}

console.log('--- 4. Tests de combat : Cire Brûlante (Mèchelet) ---');
{
  // Mèchelet (1004) subit une attaque physique directe (ex: Charge / Tackle, mv 33)
  const mechelet = createMon(1004, 25);
  const foe = createMon(19, 10);
  foe.moves = [{ id: 33, pp: 35 }]; // Charge (physique)

  let burnTriggered = false;
  let speedDropCount = 0;

  // On lance 10 simulations de contact physique
  for (let k = 0; k < 10; k++) {
    const b = new Battle({
      player: { name: 'Dresseur', party: [createMon(1004, 25)], bag: {} },
      foe: { name: 'Adversaire', party: [createMon(19, 10)], trainer: { cls: 'Gamin', name: 'Tim' } },
      rng: () => 0.1, // roll < 0.30 pour forcer la brûlure
    });
    b.start();
    // Le foe attaque au tour 1 avec Charge
    b.sides[1].party[0].moves = [{ id: 33, pp: 35 }];
    b.playerAction({ type: 'move', idx: 0 });
    // L'attaquant adverse doit avoir subi une baisse de Vitesse (-1, index 5)
    if (b.sides[1].v.st[5] === -1) speedDropCount++;
    if (b.sides[1].party[0].status === 'brn') burnTriggered = true;
  }

  ok(speedDropCount === 10, 'Cire Brûlante baisse systématiquement la Vitesse de l\'attaquant physique (10/10)');
  ok(burnTriggered, 'Cire Brûlante inflige la brûlure à l\'attaquant physique (30% de chance)');
}

{
  // Une attaque spéciale à distance (ex: Pistolet à O / Water Gun, mv 55) ne déclenche PAS Cire Brûlante
  const b = new Battle({
    player: { name: 'Dresseur', party: [createMon(1004, 25)], bag: {} },
    foe: { name: 'Adversaire', party: [createMon(7, 10)], trainer: { cls: 'Gamin', name: 'Tim' } },
  });
  b.start();
  // Foe utilise Pistolet à O (spécial)
  b.sides[1].party[0].moves = [{ id: 55, pp: 25 }];
  b.playerAction({ type: 'move', idx: 0 });
  ok(b.sides[1].v.st[5] === 0, 'Attaque spéciale ne déclenche pas Cire Brûlante');
  ok(b.sides[1].party[0].status !== 'brn', 'Pas de brûlure sur attaque spéciale');
}

console.log(`\nTOUS LES TESTS SONT PASSÉS AVEC SUCCÈS (${passed} vérifications réussies) !`);
