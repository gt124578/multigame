// tools/test-odyssee-troncons.mjs — vérifie les rencontres par tronçons d'Odyssée (data/troncons.js, world/rencontres.js) :
// 15 Pokémon par tronçon et 100 % de chances, les 5 plus fréquents d'un tronçon restent au suivant en plus rares,
// chaque tronçon posé sur la carte est atteint, la table d'une zone est la réunion de ses tronçons,
// et deux constructions du monde de suite donnent les mêmes tables.
import { buildWorld } from '../odyssee/js/world/region.js';
import { encAt } from '../odyssee/js/world/rencontres.js';
import { TRONCONS } from '../odyssee/js/data/troncons.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ ' + m); } };
for (const [k, secs] of Object.entries(TRONCONS)) secs.forEach((s, i) => {
  ok(s.length === 15, `${k} tronçon ${i + 1} : ${s.length} Pokémon`);
  const tot = s.reduce((a, e) => a + e[3], 0); ok(Math.abs(tot - 100) < 1, `${k} tronçon ${i + 1} : ${tot.toFixed(1)} %`);
  ok(new Set(s.map((e) => e[0])).size === s.length, `${k} tronçon ${i + 1} : un Pokémon en double`);
  if (i) {
    const top = [...secs[i - 1]].sort((a, b) => b[3] - a[3]).slice(0, 5);
    for (const [sp, , , p] of top) { const e = s.find((q) => q[0] === sp); ok(e && e[3] < p, `${k} tronçon ${i + 1} : ${sp} (top 5 d'avant) absent ou pas plus rare`); }
  }
});
const w = buildWorld(), W = w.maps.monde;
for (const r of w.routes) {
  const R = W.tronconsRoutes[r.id]; if (!R) continue;
  const vus = new Set(); for (const [x, y] of r.pts) { const e = encAt(W, Math.round(x), Math.round(y)); if (R.secs.includes(e)) vus.add(e); }
  ok(vus.size === R.secs.length, `${r.id} : ${vus.size} tronçons atteints sur ${R.secs.length}`);
}
for (const m of Object.values(w.maps)) if (m.tronconsCarte) {
  const vus = new Set(); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) vus.add(encAt(m, x, y));
  ok(m.tronconsCarte.secs.every((s) => vus.has(s)), `${m.id} : un tronçon jamais atteint`);
  const u = new Set(m.tronconsCarte.secs.flat().map((e) => e[0])), t = m.encounter || m.zones.find((z) => z.enc)?.enc;
  ok([...u].every((sp) => t.some((e) => e[0] === sp)), `${m.id} : la table de la carte n'a pas tous ses tronçons`);
}
const sig = (w) => JSON.stringify(Object.values(w.maps).map((m) => [m.encounter, m.zones?.map((z) => z.enc)]));
ok(sig(w) === sig(buildWorld()), 'deux constructions du monde donnent des tables différentes');
console.log(fails ? `${fails} échec(s)` : `Tronçons : ${Object.values(TRONCONS).flat().length} tronçons OK`);
process.exit(fails ? 1 : 0);
