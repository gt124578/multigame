// tools/test-odyssee.mjs — tests du moteur d'Odyssée (combats, capture, expérience) : node tools/test-odyssee.mjs
import { createMon, gainExp, expFor, levelEvolution, healFull } from '../odyssee/js/core/mon.js';
import { Battle, typeEff } from '../odyssee/js/core/battle.js';
import { SPECIES } from '../odyssee/js/data/species.js';
import { MOVES } from '../odyssee/js/data/moves.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// courbes d'expérience
ok(expFor(2, 100) === 1000000 && expFor(1, 100) === 1250000 && expFor(4, 100) === 1059860 && expFor(5, 100) === 600000 && expFor(6, 100) === 1640000, 'courbes d\'expérience');
ok(typeEff('water', ['fire', 'rock']) === 4 && typeEff('normal', ['ghost']) === 0 && typeEff('ghost', ['steel']) === 0.5, 'table des types');
for (const id in SPECIES) { const s = SPECIES[id]; ok(s.n && s.t.length && s.b.every((x) => x > 0) && s.ls.length, 'espèce ' + id); for (const [, m] of s.ls) ok(MOVES[m], `attaque ${m} de ${s.n}`); }

// évolution par niveau
const g = createMon(155, 13); gainExp(g, expFor(4, 14) - g.exp); ok(g.lvl === 14 && levelEvolution(g) === 156, 'Héricendre évolue au niveau 14');

// des centaines de combats aléatoires : jamais d'exception, toujours une fin
let ends = { win: 0, lose: 0, run: 0, caught: 0, fled: 0, 'win-flee': 0 }, turns = 0;
for (let k = 0; k < 600; k++) {
  const R = rng(k + 1);
  const ids = Object.keys(SPECIES).map(Number);
  const pick = () => ids[Math.floor(R() * ids.length)];
  const party = [createMon(pick(), 5 + Math.floor(R() * 50), { rng: R }), createMon(pick(), 5 + Math.floor(R() * 50), { rng: R })];
  const wild = k % 2 === 0;
  const foeParty = wild ? [createMon(pick(), 5 + Math.floor(R() * 50), { rng: R })] : [createMon(pick(), 10 + Math.floor(R() * 40), { rng: R }), createMon(pick(), 10 + Math.floor(R() * 40), { rng: R })];
  const b = new Battle({ rng: R, player: { name: 'Test', party, bag: { 'poke-ball': 5, potion: 3 } }, foe: { name: 'X', party: foeParty, trainer: wild ? null : { cls: 'Gamin', name: 'Léo', prize: 16, ai: k % 4 === 1 ? 'smart' : 'normal', items: { potion: 1 } } } });
  b.start();
  let n = 0;
  try {
    while (b.state !== 'over' && n < 400) {
      n++;
      if (b.state === 'switch') { const i = party.findIndex((m, j) => b.canSwitchTo(j)); b.playerSwitch(i); continue; }
      const r = R();
      let ev;
      if (wild && r < 0.08) ev = b.playerAction({ type: 'item', item: 'poke-ball' });
      else if (wild && r < 0.1) ev = b.playerAction({ type: 'run' });
      else if (r < 0.13 && b.bag.potion) ev = b.playerAction({ type: 'item', item: 'potion', target: b.sides[0].active });
      else { const u = b.usableMoves(0); ev = b.playerAction({ type: 'move', idx: u.length ? u[Math.floor(R() * u.length)] : 0 }); }
      for (const e of ev) if (e.t === 'msg') ok(!/undefined|NaN/.test(e.text), 'texte : ' + e.text);
    }
  } catch (e) { fails++; console.log('EXCEPTION combat', k, e.stack); }
  ok(b.state === 'over', 'combat ' + k + ' terminé (' + n + ' tours)');
  ends[b.result] = (ends[b.result] || 0) + 1; turns += n;
  for (const m of party.concat(foeParty)) ok(m.hp >= 0 && m.hp <= m.stats[0] && Number.isFinite(m.hp), 'PV valides');
}
console.log('fins de combat', ends, 'tours moyens', (turns / 600).toFixed(1));

// ---------------- la région : tout est atteignable depuis Bourg-Aube ----------------
const { buildWorld } = await import('../odyssee/js/world/region.js');
const { T, walkable } = await import('../odyssee/js/world/tiles.js');
const { maps, towns } = buildWorld();
const W = maps.monde;
// exploration à travers les grottes : chaque sortie de grotte relance l'exploration du monde
// gates : true ou nombre de badges ; abil : true (Coupe, Surf, Éclate-Roc) ou Set des cases franchissables
function explore(gates, abil) {
  const seenW = new Uint8Array(W.w * W.h);
  const seeds = [[towns.A.x + 5, towns.A.y + 7]], doneCaves = new Set();
  while (seeds.length) {
    const [sx, sy] = seeds.pop(); if (seenW[sy * W.w + sx]) continue;
    const r = W.reach(sx, sy, gates, true, abil); for (let i = 0; i < r.length; i++) if (r[i]) seenW[i] = 1;
    for (const [k, w] of W.warps) {
      const [x, y] = k.split(',').map(Number); const cave = maps[w.map];
      if (!cave || cave.floor !== 'cave' || doneCaves.has(w.map) || !(seenW[(y + 1) * W.w + x])) continue;
      doneCaves.add(w.map);
      const cr = cave.reach(w.x, w.y, gates, true, abil);
      for (const [ck, cw] of cave.warps) { const [cx, cy] = ck.split(',').map(Number); if (cr[(cy - 1) * cave.w + cx] || cr[cy * cave.w + cx]) seeds.push([cw.x, cw.y]); }
    }
  }
  return seenW;
}
const seenW = explore(true, true);
const at = (m, x, y) => y * m.w + x;
const reachable = (m, seen, x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.in(x + dx, y + dy) && seen[at(m, x + dx, y + dy)]);
// portes et téléporteurs du monde
for (const [k, w] of W.warps) {
  const [x, y] = k.split(',').map(Number);
  ok(seenW[at(W, x, y)] || reachable(W, seenW, x, y + 1), `porte ${k} → ${w.map} accessible`);
  const dst = maps[w.map]; ok(dst && walkable(dst.get(w.x, w.y)), `arrivée ${w.map} (${w.x},${w.y}) praticable`);
}
// PNJ, dresseurs et objets du monde : on peut se placer à côté
for (const n of W.npcs) ok(reachable(W, seenW, n.x, n.y), `PNJ ${n.id} atteignable (${n.x},${n.y})`);
for (const it of W.items) ok(reachable(W, seenW, it.x, it.y), `objet ${it.item} atteignable (${it.x},${it.y})`);
// intérieurs : chaque tapis ramène dehors, chaque PNJ est atteignable depuis l'entrée
for (const [id, m] of Object.entries(maps)) {
  if (id === 'monde') continue;
  const entries = [...m.warps.keys()].map((k) => k.split(',').map(Number));
  ok(entries.length > 0, `${id} a une sortie`);
  const [ex, ey] = entries[0];
  const seen = m.reach(ex, m.get(ex, ey) === T.CAVEDOOR ? ey - 1 : ey, true, true);
  for (const [x, y] of entries) ok(seen[at(m, x, y)] || reachable(m, seen, x, y), `${id} : sortie (${x},${y}) atteignable`);
  for (const n of m.npcs) ok(reachable(m, seen, n.x, n.y) || m.get(n.x, n.y + 1) === T.BLOCK && reachable(m, seen, n.x, n.y + 2), `${id} : PNJ ${n.id} atteignable`);
  for (const it of m.items) ok(reachable(m, seen, it.x, it.y), `${id} : objet atteignable`);
}
// progression : avec k badges (et les capacités de terrain qu'ils débloquent), l'arène k est accessible, pas l'arène k+1 ;
// la Ligue n'est accessible qu'avec les huit badges
const { FIELD } = await import('../odyssee/js/world/region.js');
const FIELD_T = { coupe: T.CUT, surf: T.WATER, eclate: T.SMASH };
const gymDoor = (g) => Object.values(towns).find((t) => t.gym === g).gymDoor;
const leagueDoor = [...W.warps].find(([, w]) => w.map === 'plateau:ligue')[0].split(',').map(Number);
const doorOpen = (seen, [x, y]) => !!seen[at(W, x, y + 1)];
for (let k = 0; k <= 8; k++) {
  const abil = new Set(Object.entries(FIELD).filter(([f, d]) => d.badge <= k && FIELD_T[f] != null).map(([f]) => FIELD_T[f]));
  const seen = explore(k, abil);
  if (k < 8) ok(doorOpen(seen, gymDoor(k)), `avec ${k} badge(s), l'arène ${k + 1} est accessible`);
  if (k < 7) ok(!doorOpen(seen, gymDoor(k + 1)), `avec ${k} badge(s), l'arène ${k + 2} est encore fermée`);
  ok(doorOpen(seen, leagueDoor) === (k === 8), `Ligue ${k === 8 ? 'ouverte' : 'fermée'} avec ${k} badge(s)`);
  ok(!!seen[at(W, 212, 202)] === (k === 8), `Cap des Étoiles ${k === 8 ? 'ouvert' : 'fermé'} avec ${k} badge(s)`);
}
// les huit Champions et la Maître existent
const leaders = Object.values(maps).flatMap((m) => m.npcs.filter((n) => n.leader != null));
ok(leaders.length === 8, '8 Champions');
ok(Object.values(maps).some((m) => m.npcs.some((n) => n.champion)), 'Maître de la Ligue');
// équipes et rencontres valides
for (const m of Object.values(maps)) for (const n of m.npcs) if (n.trainer) for (const [sp, l] of n.trainer.team) ok(SPECIES[sp] && l >= 2 && l <= 100, `équipe de ${n.trainer.name}`);
for (const z of W.zones) if (z.enc) for (const [sp] of z.enc) ok(SPECIES[sp], 'rencontre ' + z.name + ' ' + sp);
console.log('région :', Object.keys(maps).length, 'cartes ·', W.npcs.filter((n) => n.trainer).length + Object.values(maps).reduce((a, m) => a + (m === W ? 0 : m.npcs.filter((n) => n.trainer).length), 0), 'dresseurs ·', Object.values(maps).reduce((a, m) => a + m.items.length, 0), 'objets');
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); }
console.log('Odyssée : moteur OK');
