// Arène de Sylvebourg (la Grande Serre, odyssee/js/world/arene-sylve.js) : le plan se lit, l'accueil ne gêne pas l'entrée,
// l'énigme des souffleries se résout (avec le vrai moteur du souffle), chaque demi-serre se remet toujours en état sans
// impasse, un parcours « du premier coup » ne croise jamais le regard des deux dresseurs, et le monde se construit avec
// cette arène (dresseurs, Champion, guide à leur place). Usage : node tools/test-odyssee-arene-sylve.mjs
import { areneSylve, lirePlan, souffle, stelesPleines, moitieDe, PLAN } from '../odyssee/js/world/arene-sylve.js';
import { T, DIRS, walkable } from '../odyssee/js/world/tiles.js';

let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC', msg); } };
const ar = areneSylve('test:arene', 'Arène de test'), m = ar.map, P = lirePlan();
const k = (x, y) => x + ',' + y;

/* ---------------- plan et accueil */
ok(PLAN.every((r) => r.length === m.w), 'lignes du plan de même longueur');
ok(m.exitX === 12 && m.get(m.exitX, m.exitY) === T.MAT, 'sortie au milieu du bas');
ok(P.souffleries.length >= 8 && P.steles.length === 2 && P.blocs.length === 2 && P.portail.length === 2, 'souffleries, deux stèles, deux blocs, portail');
for (const s of P.souffleries) ok(m.get(s.sx, s.sy) === T.FLOOR && m.objectAt(s.sx, s.sy)?.type === 'souffle', `dalle de la soufflerie ${s.x},${s.y} au sol`);
const [sx, sy] = [...m.signs.keys()][0].split(',').map(Number);
ok(Math.abs(sx - m.exitX) <= 1 && m.exitY - sy >= 4, 'panneau au centre de l\'accueil, loin de l\'entrée');
ok(!(ar.guide[0] === m.exitX && ar.guide[1] === m.exitY - 1), 'le guide ne se tient pas devant l\'entrée');
ok(P.portail.every(([x, y]) => m.get(x, y) === T.BLOCK), 'portail du dôme fermé au départ');

/* ---------------- énigme : états = positions des blocs */
const base = new Map(); for (const [x, y] of P.blocs) base.set(k(x, y), true);
const poser = (blocs) => { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.BOULDER) m.set(x, y, T.FLOOR); for (const b of blocs) m.set(...b.split(',').map(Number), T.BOULDER); };
const jouer = (blocs, i) => {
  poser(blocs); const r = souffle(m, P.souffleries[i]); if (!r) return null;
  const n = blocs.filter((b) => b !== k(...r.de)); const [x, y] = r.chemin[r.chemin.length - 1]; n.push(k(x, y)); return n.sort();
};
const plein = (blocs) => { poser(blocs); return stelesPleines(m); };
const depart = P.blocs.map(([x, y]) => k(x, y)).sort();
// tous les états atteignables, et depuis chacun, la solution reste-t-elle possible ?
const vus = new Map([[depart.join('|'), depart]]), file = [depart];
while (file.length) { const s = file.shift(); for (let i = 0; i < P.souffleries.length; i++) { const n = jouer(s, i); if (n && !vus.has(n.join('|'))) { vus.set(n.join('|'), n); file.push(n); } } }
const bons = new Set([...vus.keys()].filter((key) => plein(vus.get(key))));
let change = true;
while (change) { change = false; for (const [key, s] of vus) if (!bons.has(key) && P.souffleries.some((_, i) => { const n = jouer(s, i); return n && bons.has(n.join('|')); })) { bons.add(key); change = true; } }
ok(bons.size > 0 && bons.has(depart.join('|')), 'les deux stèles peuvent être remplies');
const impasses = [...vus.keys()].filter((key) => !bons.has(key));
ok(impasses.length === 0, `aucune impasse (sinon : ${impasses.join(' / ')})`);

/* ---------------- parcours au premier coup, sans entrer dans le regard des dresseurs */
const npcs = new Set([k(...ar.leader), k(...ar.guide), ...ar.dresseurs.map((d) => k(d.x, d.y))]);
const regard = new Set();
for (const d of ar.dresseurs) { const [dx, dy] = DIRS[d.dir]; for (let j = 1; j <= d.sight; j++) { const x = d.x + dx * j, y = d.y + dy * j; if (!walkable(m.get(x, y))) break; regard.add(k(x, y)); } }
const marche = (blocs, a, b, eviter) => {
  poser(blocs); const vu = new Set([a]), q = [a];
  while (q.length) { const c = q.shift(); if (c === b) return true; const [x, y] = c.split(',').map(Number);
    for (const [dx, dy] of Object.values(DIRS)) { const n = k(x + dx, y + dy); if (vu.has(n) || npcs.has(n) || (eviter && regard.has(n)) || !walkable(m.get(x + dx, y + dy))) continue; vu.add(n); q.push(n); } }
  return false;
};
const entree = k(m.exitX, m.exitY - 1), portail = k(P.portail[0][0], P.portail[1][1] + 1);
// recherche en largeur sur (blocs, place du joueur) : chaque souffle se déclenche depuis sa dalle, atteinte à pied
let trouve = null; { const d0 = [depart, entree], seen = new Set([depart.join('|') + '@' + entree]), q = [[d0, 0]];
  while (q.length && !trouve) { const [[s, pos], n] = q.shift();
    if (plein(s) && marche(s, pos, portail, true)) { trouve = n; break; }
    P.souffleries.forEach((so, i) => { const sw = k(so.sx, so.sy); if (!marche(s, pos, sw, true)) return; const nx = jouer(s, i); if (!nx) return; const key = nx.join('|') + '@' + sw; if (!seen.has(key)) { seen.add(key); q.push([[nx, sw], n + 1]); } }); } }
ok(trouve != null, 'résoluble sans passer devant les dresseurs');
ok(trouve >= 8, `assez de souffles pour une vraie énigme (${trouve})`);
// les dresseurs gardent bien quelque chose : une soufflerie inutile ou un objet dans leur regard
ok(ar.dresseurs.every((d) => P.souffleries.some((s) => regard.has(k(s.sx, s.sy)) && moitieDe(s.sx) === moitieDe(d.x))), 'chaque dresseur guette une soufflerie de sa demi-serre');
ok(m.items.every((it) => regard.has(k(it.x, it.y))), 'les objets de la serre sont sous le regard des dresseurs');

/* ---------------- le monde se construit avec cette arène */
const { buildWorld, LEADERS } = await import('../odyssee/js/world/region.js');
const W = buildWorld(), g = Object.values(W.maps).find((q) => q.gymLock === 0);
// depuis novembre 2026, Sylvebourg est une arène dessinée comme les autres (la Ruche, world/arenes-plans.js) ; la Grande
// Serre reste ici, vérifiée seule, pour qui voudrait la remettre
ok(g && g.planArene, 'Sylvebourg a la Ruche (arène dessinée)');
const tr = g.npcs.filter((n) => n.trainer && n.leader == null), chef = g.npcs.find((n) => n.leader === 0);
ok(tr.length === 4 && tr.every((n) => n.trainer.team.every(([, l]) => l >= 12 && l <= 15)), 'quatre dresseurs, niveaux 12 à 15');
ok(chef && chef.trainer.team.length === 3, 'Hector et ses trois Pokémon');
ok(LEADERS[0].team.some((e) => e[4] === 'sacoches-pollen'), 'l\'as d\'Hector a Sacoches de Pollen');
ok(g.npcs.some((n) => n.script === 'gymguide'), 'le guide de l\'arène est là');

/* ---------------- Sacoches de Pollen (l'as d'Hector) et la CT01 */
const { createMon, apteCT } = await import('../odyssee/js/core/mon.js');
const { Battle } = await import('../odyssee/js/core/battle.js');
const { ITEMS } = await import('../odyssee/js/core/items.js');
const { MOVES } = await import('../odyssee/js/data/moves.js');
let vuSacoches = 0, deuxFois = 0;
for (let seed = 1; seed <= 40; seed++) {
  let s = seed; const rng = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  const [sp, lvl, , mv, ab] = LEADERS[0].team[2];
  const as = createMon(sp, lvl, { moves: mv, ability: ab, rng }), moi = createMon(4, 14, { moves: [10, 52], rng });
  const b = new Battle({ rng, player: { name: 'Test', party: [moi], bag: {} }, foe: { name: 'Hector', party: [as], trainer: { name: 'Hector', cls: 'Champion' } } });
  let n = 0, fois = 0; const lire = (ev) => { for (const e of ev) if (e.t === 'msg' && /Sacoches de Pollen/.test(e.text)) fois++; };
  lire(b.start());
  while (b.state !== 'over' && n++ < 60) { if (b.state === 'switch') break; lire(b.playerAction({ type: 'move', idx: n % 2 })); }
  if (fois) vuSacoches++; if (fois > 1) deuxFois++;
}
ok(vuSacoches > 0, 'Sacoches de Pollen se déclenche');
ok(deuxFois === 0, 'Sacoches de Pollen : une seule fois par combat');
const ct = ITEMS['ct-01'];
ok(ct && MOVES[ct.ct]?.n === 'Pollen Collant' && MOVES[ct.ct].t === 'bug', 'CT01 Pollen Collant');
ok(apteCT(1020, ct) && apteCT(10, ct) && apteCT(4, ct) === false && apteCT(1004, ct) === false, 'CT01 : Insectes oui, Salamèche et Mèchelet non');
ok(apteCT(1, ct) === false, 'CT01 : Bulbizarre non');

console.log(`états de l'énigme : ${vus.size}, solution au premier coup : ${trouve} souffles`);
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); } else console.log('Odyssée : Arène de Sylvebourg OK');
