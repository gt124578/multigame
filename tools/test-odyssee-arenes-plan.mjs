// Arènes dessinées à la main (moteur et solveur : odyssee/js/world/arenes-plan.js, plans : arenes-plans.js, écrits par
// tools/odyssee-arenes/dessiner.py) : chaque arène se construit, son énigme se résout jusqu'au Champion avec les vraies
// règles, on peut toujours ressortir (aucun état sans retour, le pupitre de remise compris), les dresseurs ne ferment
// jamais le passage, l'énigme demande un vrai effort, et le monde se construit avec elles.
// Usage : node tools/test-odyssee-arenes-plan.mjs [type]   (rejouer les solutions dans le jeu : test-odyssee-arenes-jeu.mjs)
import { construireArene, resoudre, cheminFragile } from '../odyssee/js/world/arenes-plan.js';
import { PLANS } from '../odyssee/js/world/arenes-plans.js';
import { DIRS, T } from '../odyssee/js/world/tiles.js';

const seul = process.argv[2];
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('  ÉCHEC', msg); } };
const k = (x, y) => x + ',' + y;
for (const [gym, def] of Object.entries(PLANS)) {
  if (seul && def.type !== seul) continue;
  let ar;
  try { ar = construireArene('test:' + def.type, +gym, def, 'Arène ' + def.type); } catch (e) { fails++; console.log(def.type, 'ÉCHEC construction :', e.message); continue; }
  const m = ar.map;
  ok(m.exitX != null && ar.leader && ar.guide, `${def.type} : sortie, Champion et guide`);
  ok(ar.spots.filter(Boolean).length >= 2, `${def.type} : au moins deux dresseurs`);
  const [sx, sy] = [...m.signs].find(([, v]) => v === def.regles)[0].split(',').map(Number);
  ok(m.exitY - sy >= 3, `${def.type} : panneau loin de l'entrée`);
  ok(!(ar.guide[0] === m.exitX && ar.guide[1] === m.exitY - 1), `${def.type} : guide pas devant l'entrée`);
  const npcs = new Set([k(...ar.leader), k(...ar.guide), ...ar.spots.filter(Boolean).map(([x, y]) => k(x, y)), ...ar.objets.map(([x, y]) => k(x, y))]);
  const [lx, ly] = ar.leader, but = (x, y) => x === lx && y === ly + 1;
  const t0 = Date.now(), R = resoudre(m, { npcs, but });
  ok(R.ok, `${def.type} : le Champion est atteignable`);
  ok(R.retour, `${def.type} : retour possible depuis le Champion`);
  ok(R.coinces.length === 0, `${def.type} : ${R.coinces.length} état(s) sans retour, ex. ${R.coinces[0]}`);
  ok(R.actions >= (def.minActions ?? 3), `${def.type} : énigme assez riche (${R.actions} actions)`);
  // les fragiles : un chemin existe
  for (const [id, f] of Object.entries(m.etat.fragiles)) ok(cheminFragile(f.cases, f.entree, f.fins || f.cases), `${def.type} : salle fragile ${id} faisable`);
  // sans les dresseurs, le parcours est-il plus court ? (ils gardent quelque chose sans fermer le passage)
  const R0 = resoudre(m, { npcs: new Set([k(...ar.leader), k(...ar.guide)]), but });
  console.log(`${def.type.padEnd(9)} ${String(R.etats).padStart(6)} états · ${String(R.pas).padStart(4)} pas · ${String(R.actions).padStart(3)} actions · sans dresseurs ${R0.pas} pas · ${Date.now() - t0} ms`);
}
if (!seul) {
  const { buildWorld } = await import('../odyssee/js/world/region.js');
  const W = buildWorld();
  for (const gym of Object.keys(PLANS)) {
    const g = Object.values(W.maps).find((q) => q.gymLock === +gym);
    ok(g?.planArene, `arène ${gym} : dans le monde, faite main`);
    ok(g && g.npcs.some((n) => n.leader === +gym), `arène ${gym} : Champion posé`);
    const places = construireArene('t', +gym, PLANS[gym], 'x').spots.filter(Boolean).length;
    ok(g && g.npcs.filter((n) => n.trainer && n.leader == null).length === places, `arène ${gym} : un dresseur sur chaque place du plan (ils font partie de l'énigme)`);
  }
}
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); } else console.log('Odyssée : arènes dessinées OK');
