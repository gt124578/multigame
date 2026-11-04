// tools/test-odyssee-story.mjs — l'aventure d'Odyssée peut-elle être finie ? Parcours de toute l'histoire, sans navigateur.
// À chaque étape, on vérifie qu'on peut atteindre le PNJ / l'objet suivant avec ce qu'on possède à ce moment-là
// (badges, CS, drapeaux de l'histoire), en respectant gardes, sbires, rochers, petits arbres et rochers fissurés.
// Usage : node tools/test-odyssee-story.mjs
import { buildWorld, FIELD } from '../odyssee/js/world/region.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';

const W = buildWorld(), maps = W.maps;
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('ÉCHEC :', msg); } };
const key = (m, x, y) => m + ':' + x + ',' + y;

// état du joueur (les mêmes règles que game.js : gateClosed, npcVisible, canField)
const st = { badges: Array(15).fill(false), flags: {}, bag: {} };
const game = { badgeCount: () => st.badges.filter(Boolean).length };
const gateOn = (g) => (g.open ? !g.open(st.flags, game) : g.flag ? !st.flags[g.flag] : game.badgeCount() < g.badges);
function visible(n) {
  if (n.when && !n.when(st.flags, game)) return false;
  if (n.gate) return gateOn(n.gate);
  if (n.vanish && st.flags['T:' + n.id]) return false;
  if (n.showIf && !st.flags[n.showIf]) return false;
  if (n.hideIf && st.flags[n.hideIf]) return false;
  return true;
}
const can = (k) => !!st.bag['cs-' + k] && game.badgeCount() >= FIELD[k].badge;
function npcPos(n) { return n.beatenPos && st.flags['T:' + n.id] ? n.beatenPos : [n.x, n.y]; }
function blockedSet(m) {
  const b = new Set();
  for (const n of m.npcs) if (visible(n)) { const [x, y] = npcPos(n); b.add(x + ',' + y); }
  for (const g of m.gates) if (gateOn(g)) for (const [x, y] of g.tiles) b.add(x + ',' + y);
  for (const it of m.items) if (!st.flags['I:' + it.id]) b.add(it.x + ',' + it.y);
  return b;
}

/** exploration depuis pos : renvoie l'ensemble des tuiles atteignables */
function explore(pos) {
  const seen = new Set(), q = [pos], blocked = new Map();
  const bl = (id) => { if (!blocked.has(id)) blocked.set(id, blockedSet(maps[id])); return blocked.get(id); };
  seen.add(key(pos.map, pos.x, pos.y));
  while (q.length) {
    const p = q.pop(), m = maps[p.map];
    const push = (map, x, y) => { const k = key(map, x, y); if (!seen.has(k)) { seen.add(k); q.push({ map, x, y }); } };
    const t0 = m.get(p.x, p.y);
    const w = m.warpAt(p.x, p.y);
    if (w && (t0 === T.DOOR || t0 === T.CAVEDOOR || t0 === T.MAT || w.step)) {
      if (!w.need || st.bag[w.need]) push(w.map, w.x, w.y);
      if (t0 !== T.MAT) continue; // on ne reste pas sur une porte
    }
    const onWater = t0 === T.WATER;
    // le bateau : à côté d'un passeur, avec le permis, vers chaque quai que les badges ouvrent
    if (p.map === 'monde' && st.bag['permis-bateau']) for (const n of m.npcs) if (n.script === 'ferry' && Math.abs(n.x - p.x) + Math.abs(n.y - p.y) === 1)
      for (const d of Object.values(W.docks)) if (game.badgeCount() >= d.badges && (!d.show || d.show(st.flags))) push(d.map, d.x, d.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy; if (!m.in(x, y)) continue;
      const t = m.get(x, y), B = bl(p.map);
      if (B.has(x + ',' + y)) continue;
      if (t === T.LEDGE && dy === 1 && !onWater) { if (walkable(m.get(x, y + 1)) && !B.has(x + ',' + (y + 1))) push(p.map, x, y + 1); continue; }
      if (t === T.LEDGE_E && dx === 1) { if (walkable(m.get(x + 1, y))) push(p.map, x + 1, y); continue; }
      if (t === T.LEDGE_W && dx === -1) { if (walkable(m.get(x - 1, y))) push(p.map, x - 1, y); continue; }
      let pass = walkable(t) && m.height(x, y) === m.height(p.x, p.y);
      if (t === T.STAIRS || t0 === T.STAIRS) pass = walkable(t) && Math.abs(m.height(x, y) - m.height(p.x, p.y)) <= 1;
      if (t === T.CUT && can('coupe')) pass = true;
      if (t === T.SMASH && can('eclate')) pass = true;
      if (t === T.BOULDER && can('force')) pass = true;
      if (t === T.WATER && can('surf') && (m.outdoor || m.surf)) pass = true;
      if (onWater && (t === T.DOOR || t === T.BRIDGE)) pass = false;   // on passe sous les ponts, on n'y monte pas
      if (pass) push(p.map, x, y);
    }
  }
  return seen;
}

let pos = { map: W.start.map, x: W.start.x, y: W.start.y };
const findNpc = (id) => { for (const [mid, m] of Object.entries(maps)) { const n = m.npcs.find((q) => q.id === id); if (n) return [mid, m, n]; } return null; };
/** va à côté d'un PNJ (ou d'un objet / d'une case précise) */
function reach(label, mapId, x, y) {
  const seen = explore(pos);
  const m = maps[mapId];
  // arène à énigmes (glace, téléporteurs, dalles…) : son solveur est vérifié par test-odyssee-arenes ; il suffit d'y entrer
  if (m.gymLock != null && seen.has(key(mapId, m.exitX, m.exitY - 1))) { pos = { map: mapId, x: m.exitX, y: m.exitY - 1 }; return true; }
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (seen.has(key(mapId, x + dx, y + dy))) { pos = { map: mapId, x: x + dx, y: y + dy }; return true; }
    // par-dessus un comptoir
    if (m.get(x + dx, y + dy) === T.BLOCK && seen.has(key(mapId, x + 2 * dx, y + 2 * dy))) { pos = { map: mapId, x: x + 2 * dx, y: y + 2 * dy }; return true; }
  }
  ok(false, `${label} inatteignable (${mapId} ${x},${y}) depuis ${pos.map} ${pos.x},${pos.y}`);
  return false;
}
function talk(id, then) {
  const f = findNpc(id); if (!f) { ok(false, 'PNJ introuvable : ' + id); return; }
  const [mid, , n] = f; const [x, y] = npcPos(n);
  if (reach(id, mid, x, y) && then) then(n);
}
/** l'histoire impose son ordre : ce PNJ ne doit PAS encore être atteignable */
function cannot(label, id) {
  const [mid, , n] = findNpc(id), seen = explore(pos), [x, y] = npcPos(n);
  ok(![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(key(mid, x + dx, y + dy))), label);
}
const beat = (...ids) => ids.forEach((id) => talk(id, () => { st.flags['T:' + id] = true; }));
// ordre des arènes : Sylvebourg, Port-Azur, Voltacité, Floralia, Mirage, puis Granit, Cendrelune et Fort-Écaille
const GYMS = ['B', 'D', 'E', 'F', 'G', 'K', 'H', 'L', 'SM', 'SP', 'SN', 'SD', 'SF', 'SR', 'SO'];   // + les sept arènes des Terres du Sud
const GIFT = { 3: 'coupe', 4: 'surf', 5: 'eclate', 6: 'vol' };
const leaderId = (i) => `${W.towns[GYMS[i]].gymMap.id}:leader`;
const leader = (i) => {
  beat(leaderId(i));
  // sans ce badge, l'Arène suivante reste hors d'atteinte
  if (GYMS[i + 1]) cannot(`Arène ${i + 2} atteignable sans le badge ${i + 1}`, leaderId(i + 1));
  st.badges[i] = true; if (GIFT[i]) st.bag['cs-' + GIFT[i]] = 1;
};
const item = (mapId, it, x, y) => { const m = maps[mapId], o = m.items.find((q) => q.item === it && !st.flags['I:' + q.id] && (x == null || (q.x === x && q.y === y))); if (!o) { ok(false, `objet ${it} introuvable sur ${mapId}`); return; } if (reach('objet ' + it, mapId, o.x, o.y)) { st.flags['I:' + o.id] = true; st.bag[it] = (st.bag[it] || 0) + o.qty; } };

/* ---------------- vérifications de placement ---------------- */
for (const [mid, m] of Object.entries(maps)) {
  const used = new Map();
  for (const n of m.npcs) {
    const [x, y] = [n.x, n.y], t = m.get(x, y);
    ok(walkable(t) || t === T.BLOCK, `${n.id} posé sur une case infranchissable (${mid} ${x},${y} = ${t})`);
    ok(!m.warpAt(x, y), `${n.id} posé sur une porte`);
    ok(!used.has(x + ',' + y), `${n.id} et ${used.get(x + ',' + y)} sur la même case`); used.set(x + ',' + y, n.id);
  }
  for (const it of m.items) ok(walkable(m.get(it.x, it.y)), `objet ${it.item} sur une case infranchissable (${mid} ${it.x},${it.y})`);
}
ok(maps.monde.pockets.length >= 8, 'les recoins secrets sont creusés');

/* ---------------- l'aventure ---------------- */
talk('prof'); reach('starter', 'aube:labo', 5, 5); st.flags.starter = 1; st.flags.rival1 = true;
leader(0);
{ const o = maps.monde.items.find((q) => q.item === 'medaillon'), seen = explore(pos); ok(![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(key('monde', o.x + dx, o.y + dy))), 'le médaillon demande Coupe'); }
beat('ecl:bois1', 'ecl:bois2'); talk('lumen-bois', () => { st.bag['cs-flash'] = 1; });
beat('ecl:grotte1', 'ecl:erebe1', 'ecl:grotte2');
beat('ecl:azur1', 'ecl:nyx1'); talk('azur:marin'); leader(1);
// le permis bateau (Capitainerie de Port-Azur, dès 2 badges) : l'archipel et les îles de l'Est ne s'atteignent qu'en bateau
talk('permis:inspectrice', () => { st.bag['permis-bateau'] = 1; });
cannot('l\'Arène de Voltacité est fermée tant que la Centrale est occupée', leaderId(2));
beat('ecl:volta1', 'ecl:volta2', 'ecl:erebe2'); talk('volta:ingenieur', () => { st.bag['cs-force'] = 1; });
leader(2);
leader(3);
item('monde', 'medaillon'); talk('sylve:medaillon');
cannot('Mirage est bloquée par la Team Éclipse', leaderId(4));
beat('ecl:rep1', 'ecl:rep2', 'ecl:rep3', 'ecl:nyx2', 'ecl:rep4', 'ecl:rep5', 'ecl:boss1'); st.flags.eclipse = true;
leader(4); talk('mirage:voyante', () => { st.bag['plume-argent'] = 1; st.flags.plumeArgent = true; });
item('monde', 'rare-candy', W.towns.D.x + 26, W.towns.D.y + 1); // îlot du port (Surf)
leader(5); leader(6); leader(7);
cannot('la Route Victoire reste fermée tant que dure l\'Éclipse', 'c4:1');
reach('Lumen au Sanctuaire', 'sanctuaire', 13, 29);
beat('ecl:sanct1', 'ecl:sanct2', 'ecl:nyx3', 'ecl:erebe3', 'ecl:boss2'); reach('Lugia', 'sanctuaire', 12, 4); st.flags.lugia = true;
// les Terres du Sud : Métropole, Port-Lisière, Marais-Noir, Dunes d'Ocre, Forge-Acier, Rosebrume, Ombreval
for (let i = 8; i < 15; i++) leader(i);
for (const id of ['c4:1', 'c4:2', 'c4:3', 'c4:4']) beat(id);
beat('champion');
const out = maps['plateau:ligue'].outside; pos = { map: 'monde', x: out.x, y: out.y }; // la fin ramène sur le plateau

/* ---------------- tous les objets de l'histoire, à la fin ---------------- */
const all = explore(pos);
const missing = [];
for (const id of ['monde', 'grotte', 'repaire', 'sanctuaire', 'volta:tower17', 'victoire']) for (const it of maps[id].items) {
  if (st.flags['I:' + it.id]) continue;
  if (![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => all.has(key(id, it.x + dx, it.y + dy)))) missing.push(`${it.item} (${id} ${it.x},${it.y})`);
}
ok(!missing.length, 'objets inaccessibles : ' + missing.join(', '));

console.log(fails ? `${fails} échec(s)` : 'Aventure complète : toutes les étapes sont atteignables, tous les objets aussi.');
process.exit(fails ? 1 : 0);
