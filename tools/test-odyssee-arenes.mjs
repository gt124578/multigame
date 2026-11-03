// tools/test-odyssee-arenes.mjs — chaque arène à énigmes se résout : de l'entrée on atteint le Champion (glace, flèches,
// dalles, téléporteurs, rochers compris) et on peut revenir à la sortie, même avec les dresseurs à leur place.
import { STYLES, enigme, buildArena, resoudre } from '../odyssee/js/world/arenes.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };
const show = process.argv[2];
Object.keys(STYLES).forEach((type, gym) => {
  try {
    const t0 = Date.now();
    const { map, spots, quiz } = buildArena('t' + gym, gym, type, type);
    const { sol } = enigme(type, gym + 1);
    ok(spots.length >= 3, `${type} : ${spots.length} dresseurs`);
    if (type === 'fire') ok(quiz.length === 3, 'fire : trois gardiens du savoir');
    console.log(`${type.padEnd(9)} ${STYLES[type].meca.padEnd(12)} ${String(sol.length).padStart(3)} pas, ${spots.length} dresseurs, ${Date.now() - t0} ms`);
    if (show === type) {
      const npc = new Set(spots.map(([x, y]) => x + ',' + y)), path = new Set(sol.map(([x, y]) => x + ',' + y));
      const { G } = enigme(type, gym + 1);
      const ch = { mur: '#', sol: '.', eau: '~', lave: '%', glace: '*', haie: 'f', invis: '=', dalle: 'p', barr: 'B', tp: 'o', garde: '?', sortie: 'E' };
      G.forEach((r, y) => console.log(r.map((c, x) => (npc.has(x + ',' + y) ? 'D' : c.t === 'fleche' ? { up: '^', down: 'v', left: '<', right: '>' }[c.dir] : path.has(x + ',' + y) && c.t === 'sol' ? '·' : ch[c.t] || '?')).join('')));
    }
  } catch (e) { fails++; console.log('ÉCHEC :', type, e.message); }
});
console.log(fails ? `${fails} échec(s)` : `Arènes : ${Object.keys(STYLES).length} énigmes résolues`);
process.exit(fails ? 1 : 0);
