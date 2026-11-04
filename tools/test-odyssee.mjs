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
ok(typeEff('water', ['fire', 'rock']) === 4 && typeEff('normal', ['ghost']) === 0 && typeEff('ghost', ['steel']) === 1 && typeEff('dragon', ['fairy']) === 0 && typeEff('fairy', ['dragon', 'dark']) === 4, 'table des types (6e génération)');
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
const { maps, towns, legends, docks } = buildWorld();
const W = maps.monde;
// exploration à travers les grottes : chaque sortie de grotte relance l'exploration du monde ; le bateau (permis bateau
// dès 2 badges) relie entre eux les quais atteints, selon les badges que demande chaque quai
// gates : true ou nombre de badges ; abil : true (Coupe, Surf, Éclate-Roc) ou Set des cases franchissables
const quais = Object.values(docks).filter((d) => d.map === 'monde' && !d.show);
function explore(gates, abil, bateau = true) {
  const seenW = new Uint8Array(W.w * W.h), nb = gates === true ? 99 : gates === false ? 0 : gates;
  const seeds = [[towns.A.x + 5, towns.A.y + 7]], doneCaves = new Set(), doneQuais = new Set();
  for (;;) {
    if (!seeds.length && bateau && nb >= 2 && quais.some((d) => seenW[d.y * W.w + d.x])) {
      for (const d of quais) if (d.badges <= nb && !doneQuais.has(d)) { doneQuais.add(d); seeds.push([d.x, d.y]); }
    }
    if (!seeds.length) break;
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
// sans bateau, même avec toutes les capacités (Surf compris), les tourbillons gardent l'archipel et les îles de l'Est
{ const nage = explore(true, true, false), door = (id) => [...W.warps].find(([, w]) => w.map === id)?.[0].split(',').map(Number);
  for (const t of ['granit', 'cendre', 'ecaille', 'orage', 'grue', 'givre']) { const T0 = towns[Object.keys(towns).find((k) => towns[k].id === t)]; const [cx, cy] = T0.centerDoor; ok(!nage[cy * W.w + cx], `${T0.name} hors d'atteinte à la nage (tourbillons)`); ok(seenW[cy * W.w + cx], `${T0.name} atteignable en bateau`); } }
const at = (m, x, y) => y * m.w + x;
const reachable = (m, seen, x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.in(x + dx, y + dy) && seen[at(m, x + dx, y + dy)]);
// portes et téléporteurs du monde
for (const [k, w] of W.warps) {
  const [x, y] = k.split(',').map(Number);
  ok(seenW[at(W, x, y)] || reachable(W, seenW, x, y + 1), `porte ${k} → ${w.map} accessible`);
  const dst = maps[w.map]; ok(dst && walkable(dst.get(w.x, w.y)), `arrivée ${w.map} (${w.x},${w.y}) praticable`);
}
// relief : chaque porte est au niveau de la case devant elle ; les marches relient deux niveaux voisins, jamais plus
for (const [k] of W.warps) { const [x, y] = k.split(',').map(Number); if (W.get(x, y) === T.DOOR) ok(W.height(x, y) === W.height(x, y + 1), `porte ${k} au niveau de son seuil`); }
for (let y = 1; y < W.h - 1; y++) for (let x = 1; x < W.w - 1; x++) {
  if (!walkable(W.get(x, y))) continue;
  for (const [dx, dy] of [[1, 0], [0, 1]]) { const q = W.get(x + dx, y + dy); if (walkable(q) && Math.abs(W.height(x, y) - W.height(x + dx, y + dy)) > 1) ok(false, `marche trop haute entre ${x},${y} et ${x + dx},${y + dy}`); }
}
{ // une marche mène d'un niveau à l'autre ; une falaise, non
  const { GameMap } = await import('../odyssee/js/world/mapgen.js'), { plateau, rectangle } = await import('../odyssee/js/world/relief.js');
  const m = new GameMap('essai', 12, 12, { fill: T.GRASS }); m.rect(5, 0, 6, 11, T.PATH);
  plateau(m, rectangle(0, 0, 11, 4), 1);
  ok(m.get(3, 5) === T.CLIFF && m.get(5, 5) === T.STAIRS && m.height(3, 3) === 1 && m.height(3, 7) === 0, 'plateau : paroi au sud, marches sur le chemin');
  ok(!m.canStep(3, 4, 3, 5) && m.canStep(5, 4, 5, 5) && m.canStep(5, 5, 5, 6), 'on ne descend une falaise que par les marches');
  const r = m.reach(5, 10); ok(r[2 * 12 + 2] && r[10 * 12 + 2], 'les deux niveaux sont reliés par l\'escalier');
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
  // cartes annexes (lac, grotte des marées…) : avec toutes les capacités de terrain (Surf compris)
  const seen = m.reach(ex, m.get(ex, ey) === T.CAVEDOOR ? ey - 1 : ey, true, true, true);
  for (const [x, y] of entries) ok(seen[at(m, x, y)] || reachable(m, seen, x, y), `${id} : sortie (${x},${y}) atteignable`);
  if (m.gymLock != null) continue;   // arènes à énigmes : vérifiées par tools/test-odyssee-arenes.mjs
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
const NB = 15;   // cinq arènes au nord, les trois frères, sept arènes dans les Terres du Sud
for (let k = 0; k <= NB; k++) {
  const abil = new Set(Object.entries(FIELD).filter(([f, d]) => d.badge <= k && FIELD_T[f] != null).map(([f]) => FIELD_T[f]));
  const seen = explore(k, abil);
  if (k < NB) ok(doorOpen(seen, gymDoor(k)), `avec ${k} badge(s), l'arène ${k + 1} est accessible`);
  if (k < NB - 1) ok(!doorOpen(seen, gymDoor(k + 1)), `avec ${k} badge(s), l'arène ${k + 2} est encore fermée`);
  ok(doorOpen(seen, leagueDoor) === (k === NB), `Ligue ${k === NB ? 'ouverte' : 'fermée'} avec ${k} badge(s)`);
  ok(!!seen[at(W, 212, 202)] === (k >= 8), `Cap des Étoiles ${k >= 8 ? 'ouvert' : 'fermé'} avec ${k} badge(s)`);
}
// l'usine Poké Ball de Pierrefort reste fermée (portail gardé), même avec tous les badges et toutes les capacités
{ const u = [...W.warps].find(([, w]) => w.map === 'pierre:usine'); ok(!!u, 'usine Poké Ball posée à Pierrefort');
  if (u) { const [x, y] = u[0].split(',').map(Number), s15 = explore(NB, true); ok(!s15[at(W, x, y + 1)], 'l\'usine Poké Ball reste fermée'); } }
// îles du bateau : depuis chaque quai, sans Surf, avec les badges qui ouvrent la traversée
const near = (seen, m, x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.in(x + dx, y + dy) && seen[(y + dy) * m.w + x + dx]);
for (const [k, d] of Object.entries(docks)) ok(d.map !== 'monde' ? walkable(maps[d.map].get(d.x, d.y)) : walkable(W.get(d.x, d.y)) && seenW[at(W, d.x, d.y)], `quai ${k} praticable et atteignable`);
const L = Object.fromEntries(legends.map((q) => [q.id, q]));
const fromDock = (k, badges, abil = new Set()) => W.reach(docks[k].x, docks[k].y, badges, true, abil);
{ const s2 = fromDock('orage', 2); ok(near(s2, W, L.zapdos.x, L.zapdos.y) && near(s2, W, L.mew.x, L.mew.y), 'Île Orageuse : Électhor et Mew accessibles avec 2 badges');
  ok(!near(s2, W, L.mewtwo.x, L.mewtwo.y), 'Île Orageuse : le sanctuaire de Mewtwo reste scellé');
  const s1 = fromDock('orage', 1); ok(!near(s1, W, L.zapdos.x, L.zapdos.y), 'Île Orageuse : Pic Tonnerre fermé tant que les relais sont coupés'); }
{ const s3 = fromDock('grue', 3), Q = towns.Q;
  ok(near(s3, W, Q.centerDoor[0], Q.centerDoor[1]), 'Île de la Grue : Hautegrue est accessible avec 3 badges');
  // la tour des Sages n'est plus à Hautegrue : à sa place, le Jardin de la Grue
  const dansQ = (x, y) => x >= Q.x && x < Q.x + Q.w && y >= Q.y && y < Q.y + Q.h;
  ok(!W.buildings.some((b) => dansQ(b.x, b.y) && (b.kind === 'tower' || b.modele === 'pagode')) && ![...W.warps].some(([k, w]) => w.map.startsWith('grue:tour') && dansQ(...k.split(',').map(Number))), 'Hautegrue : plus de tour au village');
  ok(!near(s3, W, L.moltres.x, L.moltres.y), 'Île de la Grue : le cratère de Sulfura demande Coupe');
  ok(near(fromDock('grue', 4, new Set([T.CUT])), W, L.moltres.x, L.moltres.y), 'Île de la Grue : Sulfura accessible avec Coupe'); }
{ const s5 = fromDock('givre', 5, new Set([T.CUT, T.WATER])); ok(near(s5, W, L.articuno.x, L.articuno.y), 'Île Givrée : Artikodin accessible avec 5 badges'); }
// chaque légendaire se tient sur une case libre qu'on peut approcher
for (const q of legends) {
  const m = maps[q.map]; ok(m && walkable(m.get(q.x, q.y)), `légendaire ${q.id} sur une case praticable`);
  const e = [...m.warps.keys()][0].split(',').map(Number);
  const seen = q.map === 'monde' ? seenW : m.reach(e[0], m.get(e[0], e[1]) === T.CAVEDOOR && m.get(e[0], e[1] - 1) === T.CAVE ? e[1] - 1 : e[1], true, true, true);
  ok(near(seen, m, q.x, q.y), `légendaire ${q.id} atteignable`);
  ok(SPECIES[q.sp] && q.lvl > 0, `légendaire ${q.id} valide`);
}
// la Tour Cendrée (Forêt des Torii) : posée dans la forêt d'automne, atteignable avec 5 badges ; l'échelle du
// rez-de-chaussée mène au sous-sol, où (et seulement où) se joue l'évènement des trois bêtes
{ const porte = [...W.warps].find(([, w]) => w.map === 'cendree:rdc'); ok(!!porte, 'Tour Cendrée posée sur la carte du monde');
  const [x, y] = porte[0].split(',').map(Number), bat = W.buildings.find((b) => b.name === 'Tour Cendrée');
  ok(bat && bat.modele === 'tourCendree' && W.zoneAt(x, y + 1)?.theme === 'automne', 'Tour Cendrée : modèle 3D, dans la forêt d\'automne');
  const abil5 = new Set(Object.entries(FIELD).filter(([f, d]) => d.badge <= 5 && FIELD_T[f] != null).map(([f]) => FIELD_T[f]));
  ok(!!explore(5, abil5)[at(W, x, y + 1)], 'Tour Cendrée atteignable avec 5 badges');
  const rdc = maps['cendree:rdc'], sous = maps['cendree:sous-sol'];
  const lad = [...rdc.warps].find(([, w]) => w.map === sous.id)?.[0].split(',').map(Number);
  const sr = rdc.reach(rdc.exitX, rdc.exitY, true, true);
  ok(lad && reachable(rdc, sr, lad[0], lad[1]), 'Tour Cendrée : l\'échelle du sous-sol est atteignable depuis l\'entrée');
  const arr = rdc.warpAt(...lad), ss = sous.reach(arr.x, arr.y, true, true);
  ok(sous.betes?.length === 3 && sous.betes.every(([sp, bx, by]) => SPECIES[sp] && walkable(sous.get(bx, by)) && reachable(sous, ss, bx, by)), 'Tour Cendrée : les trois bêtes dorment au sous-sol, sur des cases qu\'on approche');
  ok(Object.values(maps).filter((q) => q.betes).length === 1 && !maps['grue:tour']?.betes, 'l\'évènement des bêtes ne se joue qu\'au sous-sol de la Tour Cendrée');
  const src = (await import('fs')).readFileSync(new URL('../odyssee/js/game.js', import.meta.url), 'utf8');
  ok(/this\.mapObj\.betes && !st\.flags\.beasts/.test(src) && !/'grue:tour' && !st\.flags\.beasts/.test(src), 'game.js : l\'évènement des bêtes suit m.betes'); }
// la Tour Dorée (l'ancienne Tour de la Grue) : dans le parc du Temple Kagura, au cœur de la Forêt des Torii, à côté de la
// Tour Cendrée ; atteignable dès que la forêt l'est (pas avant) ; Ho-Oh se pose sur son toit, l'escalier du toit gardé par
// le novice tant qu'on n'a pas la Plume Arc-en-ciel ; le Temple Kagura garde son intérieur, dans un pavillon en 3D
{ const porte = [...W.warps].find(([, w]) => w.map === 'grue:tour'); ok(!!porte, 'Tour Dorée posée sur la carte du monde');
  const [x, y] = porte[0].split(',').map(Number), bat = W.buildings.find((b) => b.name === 'Tour Dorée'), cen = W.buildings.find((b) => b.name === 'Tour Cendrée');
  ok(bat && bat.modele === 'pagode' && bat.w === 11 && bat.d === 11 && bat.doorX === bat.x + 5 && x === bat.doorX && y === bat.doorY, 'Tour Dorée : pagode 11 × 11, porte au milieu');
  ok(W.zoneAt(x, y + 1)?.theme === 'automne' && x >= 166 && x <= 275 && y >= 152 && y <= 197, 'Tour Dorée : dans la Forêt des Torii');
  ok(cen && Math.abs((bat.x + 5) - (cen.x + 5)) <= 45 && Math.abs(bat.y - cen.y) <= 6, 'Tour Dorée : à côté de la Tour Cendrée');
  const abilK = (k) => new Set(Object.entries(FIELD).filter(([f, d]) => d.badge <= k && FIELD_T[f] != null).map(([f]) => FIELD_T[f]));
  const [cx, cy] = [cen.doorX, cen.doorY];
  const kMin = [...Array(NB + 1).keys()].find((k) => !!explore(k, abilK(k))[at(W, cx, cy + 1)]);
  const s = explore(kMin, abilK(kMin)), avant = explore(kMin - 1, abilK(kMin - 1));
  ok(kMin <= 5 && !!s[at(W, x, y + 1)] && !avant[at(W, x, y + 1)], `Tour Dorée atteignable avec ${kMin} badges, comme la Forêt des Torii (et pas avant)`);
  const f1 = maps['grue:tour'], f2 = maps['grue:tour2'], f3 = maps['grue:tour3'], toit = maps['grue:tour-toit'];
  ok(f1 && f2 && f3 && toit && f1.outside?.x === x && f1.outside?.y === y + 1, 'Tour Dorée : quatre niveaux, la sortie ramène au pied de la tour');
  ok(L.hooh && L.hooh.map === 'grue:tour-toit' && L.hooh.cond === 'plume' && walkable(toit.get(L.hooh.x, L.hooh.y)), 'Ho-Oh se pose sur le toit de la Tour Dorée');
  const nov = f3.gates.find((g) => g.flag === 'plume'); ok(nov && nov.badges <= kMin, 'Tour Dorée : le novice garde le toit tant qu\'on n\'a pas la Plume');
  const sage = f3.npcs.find((n) => n.trainer?.name === 'Hoël'); ok(sage && sage.onWin === 'grandSage', 'Tour Dorée : le Grand Sage Hoël confie la Plume');
  // de l'entrée au toit, d'escalier en escalier : sans la plume, le novice barre le dernier ; avec, on monte jusqu'à Ho-Oh
  const monte = (plume) => {
    let m = f1, sx = f1.exitX, sy = f1.exitY;
    for (const nx of [f2, f3, toit]) {
      const r = m.reach(sx, sy, plume ? true : false), up = [...m.warps].find(([, w]) => w.map === nx.id);
      if (!up) return false;
      const [ux, uy] = up[0].split(',').map(Number); if (!reachable(m, r, ux, uy)) return false;
      const w = m.warpAt(ux, uy); m = nx; sx = w.x; sy = w.y;
    }
    return near(toit.reach(sx, sy, true), toit, L.hooh.x, L.hooh.y);
  };
  // les parties en cours gardent leurs drapeaux : mêmes cartes, mêmes identifiants de dresseurs qu'avant le déménagement
  ok(['grue:tour:t47', 'grue:tour:t48', 'grue:tour2:t49', 'grue:tour2:t50', 'grue:tour3:t51'].every((id) => [f1, f2, f3].some((m) => m.npcs.some((n) => n.id === id && n.trainer))), 'Tour Dorée : les Sages gardent leurs identifiants');
  ok(monte(true) && !monte(false), 'Tour Dorée : on monte de l\'entrée jusqu\'à Ho-Oh, avec la Plume seulement');
  const temple = W.buildings.find((b) => b.name === 'Temple Kagura'); ok(temple && temple.modele === 'pavillon' && maps['kagura:tower13'] && [...W.warps].some(([, w]) => w.map === 'kagura:tower13'), 'Temple Kagura : pavillon en 3D, même intérieur');
}
// dans la Forêt des Torii, à Hautegrue et dans les villes des îles, aucun bâtiment n'a gardé l'ancien dessin (façade plate) :
// chacun a un modèle 3D explicite, ou l'emprise exacte du modèle de sa sorte (render/bati-jeu.js, choisirModele)
{ const { GRAND } = await import('../odyssee/js/world/mapgen.js');
  const TAILLE = { house: [4, 3], house2: [5, 3], bighouse: [6, 4], center: [GRAND.center.w, GRAND.center.d], mart: [GRAND.mart.w, GRAND.mart.d], gym: [GRAND.gym.w, GRAND.gym.d] };
  const en3d = (b) => !!b.modele || (TAILLE[b.kind] && TAILLE[b.kind][0] === b.w && TAILLE[b.kind][1] === b.d);
  const zones = [['Forêt des Torii', 160, 150, 280, 198], ...['Q', 'K', 'H', 'L'].map((k) => [towns[k].name, towns[k].x, towns[k].y, towns[k].x + towns[k].w, towns[k].y + towns[k].h])];
  for (const [nom, x0, y0, x1, y1] of zones) for (const b of W.buildings.filter((b) => b.x >= x0 && b.x < x1 && b.y >= y0 && b.y < y1 && b.kind !== 'cave')) ok(en3d(b), `${nom} : ${b.name || b.kind} (${b.x},${b.y}) a un modèle 3D`); }
// les arènes des îles (Port-Granit, Cendrelune, Fort-Écaille) ont la grande emprise (GRAND.gym, modèle areneCour)
{ const { GRAND } = await import('../odyssee/js/world/mapgen.js');
  for (const k of ['K', 'H', 'L']) { const t = towns[k], b = W.buildings.find((q) => q.kind === 'gym' && q.doorX === t.gymDoor[0] && q.doorY === t.gymDoor[1]);
    ok(b && b.w === GRAND.gym.w && b.d === GRAND.gym.d, `${t.name} : arène à l'emprise GRAND.gym`);
    ok(t.gymMap.id === { K: 'granit:gym3', H: 'cendre:gym12', L: 'ecaille:gym13' }[k], `${t.name} : l'arène garde l'identifiant de son intérieur`);
    ok(b && b.x >= t.x + 2 && b.x + b.w <= t.x + t.w - 2 && b.y >= t.y + 2 && b.y + b.d <= t.y + t.h - 2, `${t.name} : l'arène tient dans la ville`); } }
// aucun bâtiment de la carte du monde n'en chevauche un autre
{ const B = W.buildings, croise = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d) croise.push(`${a.name || a.kind}@${a.x},${a.y} × ${b.name || b.kind}@${b.x},${b.y}`); }
  ok(!croise.length, 'bâtiments qui se chevauchent : ' + croise.join(' ; ')); }
// les quinze Champions et la Maître existent
const leaders = Object.values(maps).flatMap((m) => m.npcs.filter((n) => n.leader != null));
ok(leaders.length === NB, `${NB} Champions`);
ok(Object.values(maps).some((m) => m.npcs.some((n) => n.champion)), 'Maître de la Ligue');
// équipes et rencontres valides
for (const m of Object.values(maps)) for (const n of m.npcs) if (n.trainer) for (const [sp, l] of n.trainer.team) ok(SPECIES[sp] && l >= 2 && l <= 100, `équipe de ${n.trainer.name}`);
for (const z of W.zones) if (z.enc) for (const [sp] of z.enc) ok(SPECIES[sp], 'rencontre ' + z.name + ' ' + sp);
console.log('région :', Object.keys(maps).length, 'cartes ·', W.npcs.filter((n) => n.trainer).length + Object.values(maps).reduce((a, m) => a + (m === W ? 0 : m.npcs.filter((n) => n.trainer).length), 0), 'dresseurs ·', Object.values(maps).reduce((a, m) => a + m.items.length, 0), 'objets');
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); }
console.log('Odyssée : moteur OK');
