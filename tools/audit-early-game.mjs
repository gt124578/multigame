import assert from 'node:assert/strict';
import { buildWorld } from '../odyssee/js/world/region.js';
import { SPECIES } from '../odyssee/js/data/species.js';
import { ITEMS } from '../odyssee/js/core/items.js';

console.log('=== AUDITING EARLY GAME (START -> BOURG-AUBE -> LAB -> ROUTE 1 -> SYLVEBOURG) ===');

const w = buildWorld();
console.log('World built successfully.');

// 1. Check spawn position
const start = w.start;
console.log('Start map and pos:', start);
assert.equal(start.map, 'aube:maison');
assert.ok(w.maps[start.map], 'Start map exists');

// 2. Check aube:maison
const maison = w.maps['aube:maison'];
console.log('Maison dimensions:', maison.w, 'x', maison.h);
console.log('Maison warps:', [...maison.warps.entries()]);
console.log('Maison NPCs:', maison.npcs.map(n => ({ id: n.id, script: n.script })));

// 3. Check Aube town
const aube = w.towns.A;
console.log('Aube town:', aube.name, 'pos:', aube.x, aube.y, 'w:', aube.w, 'h:', aube.h);
console.log('Aube buildings:', aube.buildings.map(b => ({ id: b.id, kind: b.kind, x: b.x, y: b.y })));
console.log('Aube NPCs:', aube.npcs.map(n => ({ id: n.id, text: n.text?.[0] })));

// 4. Check Lab
const lab = w.maps['aube:labo'];
assert.ok(lab, 'Lab map exists');
console.log('Lab NPCs:', lab.npcs.map(n => ({ id: n.id, script: n.script })));
console.log('Lab objects:', lab.objects?.map(o => ({ type: o.type, cap: o.cap, sp: o.sp })));

// 5. Check Route 1
const r1 = w.routes?.r1;
console.log('Route 1 exists:', !!r1);
const r1Signs = [];
for (const [k, v] of w.maps.monde.signs.entries()) {
  if (v.includes('ROUTE 1')) r1Signs.push({ k, v: v.replace(/\n/g, ' | ') });
}
console.log('Route 1 signs:', r1Signs);

// 6. Check Sylvebourg
const sylve = w.towns.B;
console.log('Sylvebourg town:', sylve.name);
console.log('Sylvebourg buildings:', sylve.buildings.map(b => ({ id: b.id, kind: b.kind })));
const center = w.maps['sylve:center5'];
assert.ok(center, 'Sylvebourg Center exists');
const mart = w.maps['sylve:mart21'];
assert.ok(mart, 'Sylvebourg Mart exists');
const gym = w.maps['sylve:gym28'];
assert.ok(gym, 'Sylvebourg Gym exists');

console.log('=== AUDIT COMPLETE ===');
