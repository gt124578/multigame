// tools/test-field-items-scenario.mjs — Test de l'obtention scénarisée des objets d'exploration
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELD, BADGES } from '../odyssee/js/world/region.js';
import { formatObtainItem, formatFindItem, itemPocketName } from '../odyssee/js/core/items.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

console.log('=== Test 1 : Vérification de la configuration FIELD ===');
assert.strictEqual(FIELD.coupe.item, 'secateur-sylvestre');
assert.strictEqual(FIELD.coupe.badge, 4);
assert.strictEqual(BADGES[FIELD.coupe.badge - 1].name, 'Badge Pétale');

assert.strictEqual(FIELD.surf.item, 'harnais-flottant');
assert.strictEqual(FIELD.surf.badge, 5);
assert.strictEqual(BADGES[FIELD.surf.badge - 1].name, 'Badge Mirage');

assert.strictEqual(FIELD.vol.item, 'sifflet-celeste');
assert.strictEqual(FIELD.vol.badge, 5);
assert.strictEqual(BADGES[FIELD.vol.badge - 1].name, 'Badge Mirage');
console.log('✓ Configuration FIELD et associations de badges validées');

console.log('=== Test 2 : Format B2W2 pour les Objets Rares d\'exploration ===');
assert.strictEqual(itemPocketName('secateur-sylvestre'), 'Objets Rares');
assert.strictEqual(itemPocketName('harnais-flottant'), 'Objets Rares');
assert.strictEqual(itemPocketName('sifflet-celeste'), 'Objets Rares');

const msgCoupe = formatObtainItem('Aurore', 'secateur-sylvestre', 1);
assert.strictEqual(msgCoupe, "Aurore obtient Sécateur Sylvestre !\nAurore met l'objet dans la Poche Objets Rares.");

const msgSurf = formatObtainItem('Aurore', 'harnais-flottant', 1);
assert.strictEqual(msgSurf, "Aurore obtient Harnais Flottant !\nAurore met l'objet dans la Poche Objets Rares.");

const msgVol = formatObtainItem('Aurore', 'sifflet-celeste', 1);
assert.strictEqual(msgVol, "Aurore obtient Sifflet Céleste !\nAurore met l'objet dans la Poche Objets Rares.");

const msgEclate = formatObtainItem('Aurore', 'cs-eclate', 1);
assert.strictEqual(msgEclate, "Aurore obtient la CS03 Éclate-Roc !\nAurore met la CS03 dans la Poche CT & CS.");
console.log('✓ Messages B2W2 et distinction Objets Rares vs CT & CS validés');

console.log('=== Test 3 : Scénarisation dans game.js ===');
const gameJs = readFileSync(join(root, 'odyssee/js/game.js'), 'utf8');

// Flora remet le Sécateur Sylvestre à Floralia
assert.ok(gameJs.includes('Ciselé par les maîtres arboristes de Floralia, il tranche net les ronces et buissons épineux.'));
assert.ok(gameJs.includes('Route 6 vers Mirage'));

// Sibylle remet le Harnais Flottant à Mirage
assert.ok(gameJs.includes('ta destinée t\\\'attend au-delà des flots. Prends ce Harnais Flottant !') || gameJs.includes('Prends ce Harnais Flottant !'));
assert.ok(gameJs.includes('Cap Mirage fait face au Sanctuaire des Marées'));

// Grand Sage Hoël remet le Sifflet Céleste au sommet de la Tour de la Grue
assert.ok(gameJs.includes('bois sacré de la tour et orné d\\\'un ruban céleste') || gameJs.includes('bois sacré de la tour'));
assert.ok(gameJs.includes("this.give('sifflet-celeste')"));

// Pyros possède un dialogue adaptatif (fallback si pas encore visité Hautegrue)
assert.ok(gameJs.includes('Sifflet Céleste des Sages de Hautegrue'));
assert.ok(gameJs.includes('pèlerin de la Tour de la Grue'));

// Doyenne Amaya mentionne le Sifflet Céleste
assert.ok(gameJs.includes('La Plume Arc-en-ciel et le Sifflet Céleste !'));

console.log('✓ Scènes de dialogues et attributions scénarisées dans game.js validées');

console.log('=== Test 4 : PNJ de l\'univers (region.js) ===');
const regionJs = readFileSync(join(root, 'odyssee/js/world/region.js'), 'utf8');

// PNJ Floralia
assert.ok(regionJs.includes('Flora, notre Championne, conserve le précieux Sécateur Sylvestre.'));

// PNJ Cap Mirage
assert.ok(regionJs.includes('Harnais Flottant d\\\'Écume') || regionJs.includes('Harnais Flottant'));

// PNJ Tour de la Grue
assert.ok(regionJs.includes('Sifflet Céleste sacré'));

console.log('✓ Textes des PNJ de Floralia, Cap Mirage et Hautegrue validés');

console.log('=== Test 5 : Journal de quêtes (questsData.js) ===');
const questsJs = readFileSync(join(root, 'odyssee/js/core/questsData.js'), 'utf8');
assert.ok(questsJs.includes('Sifflet Céleste au sommet de la Tour de la Grue'));
console.log('✓ Journal des quêtes synchronisé');

console.log('\n===========================================');
console.log('TOUS LES TESTS DU SCÉNARIO SONT PASSÉS AVEC SUCCÈS !');
console.log('===========================================');
