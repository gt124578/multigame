import assert from 'assert';
import fs from 'fs';

console.log('=== Test Arrière-plans de Combat (Arènes, Ville & Village) ===');

// 1. Vérification des dimensions des fichiers PNG
const root = fs.existsSync('odyssee/img/battle') ? '.' : 'arcadia';
const bgs = [
  `${root}/odyssee/img/battle/bg_gym.png`,
  `${root}/odyssee/img/battle/bg_gym_rock.png`,
  `${root}/odyssee/img/battle/bg_city.png`,
  `${root}/odyssee/img/battle/bg_village.png`,
];

for (const p of bgs) {
  assert.ok(fs.existsSync(p), `Le fichier ${p} doit exister`);
  const buf = fs.readFileSync(p);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  assert.strictEqual(w, 340, `${p} largeur doit être 340`);
  assert.strictEqual(h, 192, `${p} hauteur doit être 192`);
  console.log(`✓ ${p} est conforme (340x192 PNG)`);
}

// 2. Vérification de la logique dans game.js
const gameSrc = fs.readFileSync(fs.existsSync('odyssee/js/game.js') ? 'odyssee/js/game.js' : 'arcadia/odyssee/js/game.js', 'utf8');
assert.ok(gameSrc.includes("const isVillage = z?.town === 'aube' || z?.town === 'sylve'"), 'game.js doit détecter les villages');
assert.ok(gameSrc.includes("const isCity = !!z?.town"), 'game.js doit détecter les villes');
assert.ok(gameSrc.includes("const gymKind = (m.arene === 'rock'"), 'game.js doit varier les arènes (gym_rock vs gym)');
console.log('✓ Logique de sélection des décors validée dans game.js');

// 3. Vérification de battleView.js
const bvSrc = fs.readFileSync(fs.existsSync('odyssee/js/ui/battleView.js') ? 'odyssee/js/ui/battleView.js' : 'arcadia/odyssee/js/ui/battleView.js', 'utf8');
assert.ok(bvSrc.includes("gym_rock: 'bg_gym_rock'"), 'battleView.js doit mapper gym_rock');
assert.ok(bvSrc.includes("city: 'bg_city'"), 'battleView.js doit mapper city');
assert.ok(bvSrc.includes("village: 'bg_village'"), 'battleView.js doit mapper village');
console.log('✓ Mappings de décors et plateformes validés dans battleView.js');

console.log('\n=== Tous les tests de décors sont validés avec succès ! ===');
