// tools/test-odyssee-migration.mjs — les sauvegardes d'avant la grande région (carte de 440 × 520) reprennent au Centre
// de soins de la dernière ville visitée, sans rien perdre : badges, équipe, sac, quêtes, dresseurs battus, objets ramassés.
// Usage : node tools/test-odyssee-migration.mjs
import { buildWorld, CARTE_VERSION } from '../odyssee/js/world/region.js';
import { migrerCarte } from '../odyssee/js/world/migration.js';
import { walkable } from '../odyssee/js/world/tiles.js';

const world = buildWorld();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('ÉCHEC :', msg); } };
const npc = (id) => Object.values(world.maps).some((m) => m.npcs.some((n) => n.id === id));
const item = (id) => Object.values(world.maps).some((m) => m.items.some((i) => i.id === id));

ok(world.carte === CARTE_VERSION && CARTE_VERSION >= 2, 'la carte porte son numéro de version');
// une partie de l'ancienne carte, arrêtée sur la route 4, après Port-Azur
const vieille = () => ({
  v: 2, name: 'Sacha', badges: [true, true, ...Array(13).fill(false)], money: 4321, visited: ['aube', 'sylve', 'pierre', 'azur'],
  map: 'monde', x: 240, y: 45, dir: 'right', surf: true,
  party: [{ uid: 1, sp: 4, lvl: 21, hp: 50 }], box: [{ uid: 2, sp: 16, lvl: 5, hp: 20 }], bag: { potion: 3, 'permis-bateau': 1, 'cs-flash': 1 },
  flags: { starter: 1, 'T:monde:t0': true, 'T:monde:t17': true, 'I:monde:28,208': true, 'I:monde:265,47': true, 'Q:ponyta': 'fin', 'A:mPanier': true },
  cleared: { monde: ['130,40'], 'grotte': ['3,3'] }, tiles: { monde: { '100,100': 32 } }, explored: [1, 2, 3, 400], lastOutdoor: { x: 240, y: 46, map: 'monde' },
  lastCenter: { map: 'azur:center2', x: 6, y: 5, dir: 'up' },
});
{
  const s = vieille(), avant = JSON.parse(JSON.stringify(s));
  const t = migrerCarte(s, world);
  ok(t && t.id === 'azur', 'la partie reprend dans la dernière ville visitée qui a un Centre (Port-Azur)');
  const c = world.maps[s.map];
  ok(c && s.map === world.towns.D.centerId && walkable(c.get(s.x, s.y)), `au Centre de soins de Port-Azur, sur une case libre (${s.map} ${s.x},${s.y})`);
  ok(!s.surf && s.carte === CARTE_VERSION && !s.lastOutdoor, 'plus de surf, version de la carte notée, plus de position sur l\'ancienne carte');
  for (const k of ['badges', 'money', 'party', 'box', 'bag', 'flags', 'visited', 'lastCenter', 'name']) ok(JSON.stringify(s[k]) === JSON.stringify(avant[k]), `${k} inchangé`);
  ok(!s.cleared.monde && JSON.stringify(s.cleared.grotte) === '["3,3"]' && !s.tiles.monde, 'arbres coupés et rochers du monde remis en place, ceux des grottes gardés');
  ok(s.explored.length > 50, 'la carte de la région dévoile les villes visitées');
  // les drapeaux de la sauvegarde désignent toujours les mêmes dresseurs et les mêmes objets
  ok(npc('monde:t0') && npc('monde:t17') && item('monde:28,208') && item('monde:265,47'), 'dresseurs battus et objets ramassés : mêmes identifiants');
  ok(world.maps.monde.npcs.find((n) => n.id === 'monde:t0')?.trainer?.name === 'Léo' && world.maps.monde.npcs.find((n) => n.id === 'monde:t17')?.trainer?.name === 'Yves', 'les identifiants désignent les mêmes dresseurs (Léo, Yves)');
  ok(migrerCarte(s, world) === null && s.map === world.towns.D.centerId, 'une partie à jour n\'est pas déplacée une seconde fois');
}
{ // une partie toute neuve (Bourg-Aube seulement) : la maison
  const s = { ...vieille(), visited: ['aube'], badges: Array(15).fill(false) };
  const t = migrerCarte(s, world);
  ok(t && t.id === 'aube' && s.map === world.start.map, 'à Bourg-Aube (sans Centre), la partie reprend à la maison');
}
{ // arrêtée dans une grotte ou dans les Terres du Sud : la dernière ville visitée, quelle qu'elle soit
  const s = { ...vieille(), map: 'grotte', x: 5, y: 5, visited: ['aube', 'sylve', 'pierre', 'azur', 'volta', 'flora', 'mirage', 'granit', 'cendre', 'ecaille', 'metro', 'lisiere'] };
  migrerCarte(s, world);
  ok(s.map === world.towns.SP.centerId, 'reprise au Centre de Port-Lisière');
}
console.log(fails ? `${fails} échec(s)` : 'Migration des sauvegardes : OK');
process.exit(fails ? 1 : 0);
