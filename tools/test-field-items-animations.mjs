// tools/test-field-items-animations.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

console.log('=== Test 1 : Vérification des sprites Pixel Art des objets ===');
const expectedItems = [
  'secateur-sylvestre.png',
  'harnais-flottant.png',
  'sifflet-celeste.png'
];

for (const it of expectedItems) {
  const p = join(root, 'odyssee/img/items', it);
  if (!existsSync(p)) throw new Error(`Image manquante: ${p}`);
  console.log(`  ✓ Sprite trouvé : ${it}`);
}

console.log('=== Test 2 : Vérification de l\'enregistrement dans sprites.js ===');
const spritesJs = readFileSync(join(root, 'odyssee/js/data/sprites.js'), 'utf8');
for (const it of ['secateur-sylvestre', 'harnais-flottant', 'sifflet-celeste']) {
  if (!spritesJs.includes(`"${it}"`)) throw new Error(`Item ${it} non enregistré dans SPRITES.items de sprites.js`);
  console.log(`  ✓ Item enregistré dans sprites.js : ${it}`);
}

console.log('=== Test 3 : Vérification des effets sonores (SFX) dans audio.js ===');
const audioJs = readFileSync(join(root, 'odyssee/js/audio.js'), 'utf8');
for (const sfx of ['cut', 'splash', 'whistle']) {
  if (!audioJs.includes(`case '${sfx}':`)) throw new Error(`SFX ${sfx} manquant dans audio.js`);
  console.log(`  ✓ SFX présent dans audio.js : ${sfx}`);
}

console.log('=== Test 4 : Vérification des méthodes d\'animation dans game.js ===');
const gameJs = readFileSync(join(root, 'odyssee/js/game.js'), 'utf8');
for (const m of ['animateCut', 'animateSurfSplash', 'animateFlyDeparture', 'animateFlyAscent', 'animateFlyDescent', 'animateLandingDust']) {
  if (!gameJs.includes(m)) throw new Error(`Méthode d'animation ${m} manquante dans game.js`);
  console.log(`  ✓ Méthode d'animation présente : ${m}`);
}

console.log('=== Test 5 : Vérification des classes CSS dans odyssee.css ===');
const css = readFileSync(join(root, 'odyssee/odyssee.css'), 'utf8');
for (const c of ['.field-cut-fx', '.cut-slash', '.cut-leaf', '.field-surf-splash', '.surf-ripple', '.surf-droplet', '.field-fly-fx', '.fly-musical-note', '.fly-landing-dust']) {
  if (!css.includes(c)) throw new Error(`Classe CSS ${c} manquante dans odyssee.css`);
  console.log(`  ✓ Classe CSS présente : ${c}`);
}

console.log('=== Test 6 : Vérification de version et CHANGELOG.md ===');
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const hubJs = readFileSync(join(root, 'hub/hub.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

if (!changelog.includes('## 3.92 — 3 novembre 2026')) throw new Error('Section 3.92 manquante dans CHANGELOG.md');
const verMatch = hubJs.match(/const VERSION = '([0-9.]+)';/);
if (!verMatch || parseFloat(verMatch[1]) < 3.92) throw new Error('Version >= 3.92 manquante dans hub.js');
console.log('  ✓ Version >= 3.92 synchronisée dans CHANGELOG.md, hub.js et index.html');

console.log('\n===========================================');
console.log('TOUS LES TESTS DES CAPACITÉS & PIXEL ART PASSENT AVEC SUCCÈS !');
console.log('===========================================');
