// test-item-text-b2w2.mjs — Vérification des messages d'objets style Noir 2 / Blanc 2 (B2W2)
import assert from 'node:assert';
import {
  ITEMS,
  itemName,
  itemPocketName,
  itemPluralName,
  formatFindItem,
  formatObtainItem,
  POCKET_NAMES,
  POCKETS,
} from '../odyssee/js/core/items.js';

console.log('=== Test 1 : Noms officiels des Poches (B2W2) ===');
assert.strictEqual(POCKET_NAMES.objets, 'Objets');
assert.strictEqual(POCKET_NAMES.soin, 'Soins');
assert.strictEqual(POCKET_NAMES.balls, 'Poké Balls');
assert.strictEqual(POCKET_NAMES.ct, 'CT & CS');
assert.strictEqual(POCKET_NAMES.baies, 'Baies');
assert.strictEqual(POCKET_NAMES.cles, 'Objets Rares');
console.log('✓ Poches B2W2 définies correctement');

console.log('=== Test 2 : Attribution des poches pour chaque catégorie ===');
assert.strictEqual(itemPocketName('potion'), 'Soins');
assert.strictEqual(itemPocketName('hyper-potion'), 'Soins');
assert.strictEqual(itemPocketName('full-restore'), 'Soins');
assert.strictEqual(itemPocketName('revive'), 'Soins');
assert.strictEqual(itemPocketName('poke-ball'), 'Poké Balls');
assert.strictEqual(itemPocketName('ultra-ball'), 'Poké Balls');
assert.strictEqual(itemPocketName('master-ball'), 'Poké Balls');
assert.strictEqual(itemPocketName('cs-coupe'), 'CT & CS');
assert.strictEqual(itemPocketName('cs-surf'), 'CT & CS');
assert.strictEqual(itemPocketName('ct-01'), 'CT & CS');
assert.strictEqual(itemPocketName('oran-berry'), 'Baies');
assert.strictEqual(itemPocketName('sitrus-berry'), 'Baies');
assert.strictEqual(itemPocketName('rare-candy'), 'Objets');
assert.strictEqual(itemPocketName('leftovers'), 'Objets');
assert.strictEqual(itemPocketName('fire-stone'), 'Objets');
assert.strictEqual(itemPocketName('town-map'), 'Objets Rares');
assert.strictEqual(itemPocketName('ferry-ticket'), 'Objets Rares');
assert.strictEqual(itemPocketName('prism-shard'), 'Objets Rares');
assert.strictEqual(itemPocketName('velo'), 'Objets Rares');
console.log('✓ Résolution automatique des poches validée');

console.log('=== Test 3 : Messages de trouvaille au sol (Poké Ball sur la carte) ===');
{
  const msg1 = formatFindItem('Sacha', 'potion', 1);
  assert.strictEqual(
    msg1,
    "Sacha trouve Potion !\nSacha met l'objet dans la Poche Soins."
  );

  const msg2 = formatFindItem('Aurore', 'poke-ball', 5);
  assert.strictEqual(
    msg2,
    "Aurore trouve 5 Poké Balls !\nAurore met les objets dans la Poche Poké Balls."
  );

  const msg3 = formatFindItem('Mélis', 'oran-berry', 1);
  assert.strictEqual(
    msg3,
    "Mélis trouve Baie Oran !\nMélis met l'objet dans la Poche Baies."
  );

  const msg4 = formatFindItem('Sacha', 'rare-candy', 3);
  assert.strictEqual(
    msg4,
    "Sacha trouve 3 Super Bonbons !\nSacha met les objets dans la Poche Objets."
  );

  const msg5 = formatFindItem('Sacha', 'cs-coupe');
  assert.strictEqual(
    msg5,
    "Sacha trouve la CS01 Coupe !\nSacha met la CS01 dans la Poche CT & CS."
  );

  const msg6 = formatFindItem('Sacha', 'ct-10');
  assert.strictEqual(
    msg6,
    "Sacha trouve la CT10 ct-10 !\nSacha met la CT10 dans la Poche CT & CS."
  );
}
console.log('✓ Format de trouvaille B2W2 (verbe "trouve" + "met dans la Poche") validé');

console.log('=== Test 4 : Messages d\'obtention (PNJ, quêtes, badges, lots) ===');
{
  const msg1 = formatObtainItem('Sacha', 'potion', 1);
  assert.strictEqual(
    msg1,
    "Sacha obtient Potion !\nSacha met l'objet dans la Poche Soins."
  );

  const msg2 = formatObtainItem('Écho', 'ultra-ball', 5);
  assert.strictEqual(
    msg2,
    "Écho obtient 5 Hyper Balls !\nÉcho met les objets dans la Poche Poké Balls."
  );

  const msg3 = formatObtainItem('Sacha', 'cs-surf', 1, { cs: 'CS02', name: 'Surf' });
  assert.strictEqual(
    msg3,
    "Sacha obtient la CS02 Surf !\nSacha met la CS02 dans la Poche CT & CS."
  );

  const msg4 = formatObtainItem('Sacha', 'ferry-ticket', 1);
  assert.strictEqual(
    msg4,
    "Sacha obtient Passe Marin !\nSacha met l'objet dans la Poche Objets Rares."
  );

  const msg5 = formatObtainItem('Sacha', 'prism-shard', 1);
  assert.strictEqual(
    msg5,
    "Sacha obtient Éclat de Prisme !\nSacha met l'objet dans la Poche Objets Rares."
  );
}
console.log('✓ Format d\'obtention B2W2 (verbe "obtient" + "met dans la Poche") validé');

console.log('=== Test 5 : Découpage des pages dans ui.say ===');
{
  // Simule la méthode say de ui.js
  const splitIntoPages = (text) => [].concat(text).flatMap((t) => String(t).split('\n')).filter((p) => p.length);

  const pagesFind = splitIntoPages(formatFindItem('Sacha', 'potion', 1));
  assert.strictEqual(pagesFind.length, 2);
  assert.strictEqual(pagesFind[0], 'Sacha trouve Potion !');
  assert.strictEqual(pagesFind[1], "Sacha met l'objet dans la Poche Soins.");

  const pagesObtain = splitIntoPages(formatObtainItem('Sacha', 'master-ball', 1));
  assert.strictEqual(pagesObtain.length, 2);
  assert.strictEqual(pagesObtain[0], 'Sacha obtient Master Ball !');
  assert.strictEqual(pagesObtain[1], "Sacha met l'objet dans la Poche Poké Balls.");
}
console.log('✓ Découpage automatique en 2 pages (comme sur console DS B2W2) validé');

console.log('\n===========================================');
console.log('TOUS LES TESTS B2W2 SONT PASSÉS AVEC SUCCÈS !');
console.log('===========================================');
