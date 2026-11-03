// tools/test-odyssee-vehicules.mjs — les quêtes du vélo (Voltacité) et du permis bateau (Port-Azur) se jouent de bout en bout
import { buildWorld } from '../odyssee/js/world/region.js';
import { EXAMEN } from '../odyssee/js/world/vehicules.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };
const w = buildWorld(), W = w.maps.monde;
const st = { flags: {}, bag: {}, badges: 0 };
let q = 0;
const A = {
  get f() { return st.flags; }, e: '', step: (id) => st.flags['Q:' + id] || 0, set: async (id, n) => { st.flags['Q:' + id] = n; },
  has: (k) => !!st.bag[k], give: async (k) => { st.bag[k] = 1; }, take: (k) => { delete st.bag[k]; }, say: async () => {}, yesNo: async () => true,
  badges: () => st.badges, sfx: () => {}, fight: async () => 'win',
  game: { ui: { list: async () => EXAMEN[q++ % EXAMEN.length].bonne } },
};
const npc = (id) => W.npcs.find((n) => n.id === id);
for (const id of ['velo:lucien', 'velo:yves', 'velo:mineur', 'permis:inspectrice']) ok(!!npc(id), `${id} est dans la région`);
await npc('velo:lucien').talk(A); ok(!A.step('velo'), 'sans badge, Lucien ne propose rien');
st.badges = 1; await npc('velo:lucien').talk(A); ok(A.step('velo') === 1, 'Lucien lance la quête');
await npc('velo:yves').talk(A); ok(A.has('chambre-air'), 'Yves donne la chambre à air');
await npc('velo:lucien').talk(A); ok(!A.has('velo'), 'pas de vélo avec une seule pièce');
await npc('velo:mineur').talk(A); ok(A.has('derailleur'), 'les mineurs donnent le dérailleur');
await npc('velo:lucien').talk(A); ok(A.has('velo') && A.step('velo') === 'fin', 'Lucien assemble le vélo');
await npc('permis:inspectrice').talk(A); ok(!A.has('permis-bateau'), 'pas d\'examen avant deux badges');
st.badges = 2; await npc('permis:inspectrice').talk(A); ok(A.has('permis-bateau') && A.step('permis') === 'fin', 'examen réussi, permis délivré');
console.log(fails ? `${fails} échec(s)` : 'Vélo et permis bateau : OK');
process.exit(fails ? 1 : 0);
