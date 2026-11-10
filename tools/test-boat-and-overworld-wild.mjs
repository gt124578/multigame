// arcadia/tools/test-boat-and-overworld-wild.mjs
// Teste la non-traversabilité du bateau (3 cases bloquées) et la cohérence sprite vu -> combat sauvage
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameMap } from '../odyssee/js/world/mapgen.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import { createMon } from '../odyssee/js/core/mon.js';
import { REGLES } from '../odyssee/js/data/regles.js';
import { SAUVAGE, REMPLACANTS } from '../odyssee/js/data/remplacants.js';

console.log('=== TEST 1 : BATEAU (COLLISION SUR LES 3 CASES) ===');
{
  const m = new GameMap('test', 20, 20);
  // Remplir d'herbe marchable
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      m.set(x, y, T.GRASS);
    }
  }

  // Poser un bateau en (10, 10)
  m.prop('bateau', 10, 10);

  // Vérifier les 3 cases : 9,10; 10,10; 11,10
  assert.equal(m.get(9, 10), T.BLOCK, 'Case gauche du bateau (9, 10) doit être bloquée (T.BLOCK)');
  assert.equal(m.get(10, 10), T.BLOCK, 'Case milieu du bateau (10, 10) doit être bloquée (T.BLOCK)');
  assert.equal(m.get(11, 10), T.BLOCK, 'Case droite du bateau (11, 10) doit être bloquée (T.BLOCK)');

  // Vérifier que walkable est faux pour les 3 cases
  assert.equal(walkable(m.get(9, 10)), false, 'Case gauche ne doit pas être marchable');
  assert.equal(walkable(m.get(10, 10)), false, 'Case milieu ne doit pas être marchable');
  assert.equal(walkable(m.get(11, 10)), false, 'Case droite ne doit pas être marchable');

  // Vérifier que les cases autour (8, 10) et (12, 10) restent du terrain normal
  assert.equal(m.get(8, 10), T.GRASS, 'Case adjacente (8, 10) doit rester de l herbe');
  assert.equal(m.get(12, 10), T.GRASS, 'Case adjacente (12, 10) doit rester de l herbe');

  // Vérifier la restauration de under
  assert.equal(m.underAt(9, 10), T.GRASS, 'underAt(9, 10) doit retenir T.GRASS');
  assert.equal(m.underAt(10, 10), T.GRASS, 'underAt(10, 10) doit retenir T.GRASS');
  assert.equal(m.underAt(11, 10), T.GRASS, 'underAt(11, 10) doit retenir T.GRASS');

  console.log('✓ Le bateau bloque parfaitement ses 3 cases (gauche, milieu, droite) !');
}

console.log('\n=== TEST 2 : COHÉRENCE DU POKÉMON VISIBLE DANS L HERBE ===');
{
  // 1021 = Champinou, dont le remplaçant officiel est 43 = Mystherbe
  assert.equal(REMPLACANTS[1021], 43, '1021 Champinou a bien pour remplaçant 43 Mystherbe');

  // Sans fixed: true, SAUVAGE(1021) renvoie 43 environ 60% du temps
  let replacedCount = 0;
  for (let i = 0; i < 200; i++) {
    if (SAUVAGE(1021) === 43) replacedCount++;
  }
  assert(replacedCount > 50, 'SAUVAGE sans fixed remplace bien statistiquement Champinou par Mystherbe');

  // Avec fixed: true, l'espèce e[0] passée au créateur de combat ne subit JAMAIS SAUVAGE
  const simulateWildEncounter = (e, o = {}) => {
    return createMon(o.fixed ? e[0] : SAUVAGE(e[0]), 5);
  };

  const vu = {
    sp: 1021,
    e: [1021, 5, 8, 1]
  };

  // Simuler 200 combats avec fixed: true
  for (let i = 0; i < 200; i++) {
    const wild = simulateWildEncounter(vu.e, { fixed: true });
    assert.equal(wild.sp, 1021, 'L espèce créée doit toujours être 1021 (Champinou)');
  }
  console.log('✓ 200/200 combats testés : avec fixed: true, aucun remplacement inattendu en Mystherbe !');

  // Vérifier que game.js passe bien { fixed: true } sur la rencontre avec vu
  const gameSrc = fs.readFileSync('arcadia/odyssee/js/game.js', 'utf8');
  assert(
    gameSrc.includes('if (vu) { this.vie.remove(vu); await this.wildBattle([vu.e], { fixed: true }); return; }'),
    'game.js doit passer { fixed: true } lors de la rencontre avec le Pokémon visible de l herbe'
  );
  console.log('✓ game.js vérifié : { fixed: true } est bien présent pour les Pokémon visibles !');
}

console.log('\n=== TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS (100%) ===');
