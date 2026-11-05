// tools/test-odyssee-quetes.mjs — joue toutes les quêtes de l'histoire secondaire d'Odyssée (world/quetes.js) d'un bout
// à l'autre, sans affichage : dialogues passés, combats gagnés. Vérifie que chaque étape mène à la suivante et que
// chaque quête se termine.   node tools/test-odyssee-quetes.mjs
import { buildWorld } from '../odyssee/js/world/region.js';
import { SPECIES } from '../odyssee/js/data/species.js';
import { ITEMS } from '../odyssee/js/core/items.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } };
const W = buildWorld();
const F = {}, bag = {}, party = [], box = [];
const game = { hour: () => 22, refreshNpcs() {}, state: { flags: F, bag, party, box, name: 'Léa' }, npcs: [] };
const A = {
  game, st: game.state, f: F, name: 'Léa', e: 'e',
  say: async () => {}, yesNo: async () => true, ask: async () => 0,
  step: (id) => F['Q:' + id] || 0,
  set: async (id, n) => { F['Q:' + id] = n; },
  flag: (k, v = true) => { F[k] = v; },
  has: (k, n = 1) => (bag[k] || 0) >= n,
  give: async (k, n = 1) => { ok(ITEMS[k], 'objet connu : ' + k); bag[k] = (bag[k] || 0) + n; },
  take: (k, n = 1) => { bag[k] = (bag[k] || 0) - n; if (bag[k] <= 0) delete bag[k]; },
  money: async () => {}, badges: () => 8, heal: () => {}, sfx: () => {}, wait: async () => {}, cry: () => {},
  fight: async (tr) => { for (const [sp, l] of tr.team) ok(SPECIES[sp] && l > 0 && l <= 100, `équipe de ${tr.name}`); return 'win'; },
  wild: async () => 'caught',
  giveMon: async (sp, lvl) => { ok(SPECIES[sp], 'Pokémon offert ' + sp); party.push({ sp, lvl }); },
  partyHas: () => null, warp: async () => {}, banner: () => {}, walk: async () => {}, flash: () => {},
};
const maps = W.maps;
const npc = (map, id) => { const n = maps[map]?.npcs.find((q) => q.id === id || q.id.endsWith(':' + id)); if (!n) throw new Error(`PNJ introuvable : ${map} ${id}`); return n; };
const visible = (n) => !n.when || n.when(F, game);
const talk = async (map, id) => { const n = npc(map, id); ok(visible(n), `${id} présent à ce moment de la quête`); await n.talk(A, { def: n, id: n.id }); };
const beat = async (map, id) => { const n = npc(map, id); ok(visible(n), `${id} présent`); for (const [sp, l] of n.trainer.team) ok(SPECIES[sp] && l > 0, `équipe de ${id}`); F['T:' + n.id] = true; if (n.onWin) await n.onWin(A, { def: n }); };
const use = async (map, x, y) => { const o = maps[map].objectAt(x, y); if (!o?.use) throw new Error(`objet introuvable : ${map} ${x},${y}`); await o.use(A, o, x, y); };
const leg = async (id, r = 'caught') => { const L = W.legends.find((q) => q.id === id); ok(L && L.cond(F, game), `légendaire ${id} prêt`); ok(SPECIES[L.sp], 'espèce ' + id); F['L:' + id] = r === 'caught' ? 'caught' : 'met'; if (L.after) await L.after(A, r); };
const S = (q) => F['Q:' + q];
const deco = (map, k) => maps[map].deco.filter((d) => d.k === k && maps[map].objectAt(d.x, d.y));

try {
  // Le Ponyta de Lucie
  await talk('monde', 'q:lucie'); ok(S('ponyta') === 1, 'Ponyta : quête lancée');
  for (const t of ['q:pain', 'q:enfant', 'q:mamie']) await talk('monde', t);
  ok(S('ponyta') === 2, 'Ponyta : les trois témoins mènent au bois');
  await beat('monde', 'q:voleur'); ok(S('ponyta') === 3 && bag['insigne-brume'], 'Ponyta : le voleur avoue');
  await beat('monde', 'q:brume1'); await beat('monde', 'q:brume2');
  const [cage] = deco('monde', 'caisse'); await use('monde', cage.x, cage.y); ok(S('ponyta') === 4, 'Ponyta : délivré');
  await talk('monde', 'q:lucie'); ok(S('ponyta') === 'fin', 'Ponyta : terminée');
  // Le courrier perdu (lettres remises au fil des autres quêtes)
  await talk('monde', 'q:facteur'); ok(S('courrier') === 1 && bag['lettre-facteur'] === 4, 'courrier : 4 lettres');
  await talk('monde', 'q:lucie');
  // Les eaux troubles du Lac Miroir
  await talk('lac', 'q:gaston'); await talk('lac', 'q:gaston'); ok(S('lac') === 1, 'lac : lancée');
  for (let i = 1; i <= 3; i++) await beat('lac', 'q:pompe' + i);
  for (const d of deco('lac', 'console')) await use('lac', d.x, d.y);
  ok(S('lac') === 2, 'lac : pompes arrêtées');
  await talk('lac', 'q:sylas1'); ok(S('lac') === 3, 'lac : Sylas battu');
  await talk('marees', 'q:sylas2'); ok(S('lac') === 4, 'lac : grotte');
  await leg('mesprit'); ok(S('lac') === 5, 'lac : Mesprit');
  await talk('lac', 'q:gaston'); ok(S('lac') === 'fin', 'lac : terminée');
  // Les nuits blanches de Floralia
  await talk('monde', 'q:helene'); await talk('jardin', 'q:jardinier'); await talk('jardin', 'q:jardinier');
  ok(S('songes') === 2, 'songes : vers Cresselia');
  await leg('cresselia', 'met'); ok(S('songes') === 3 && bag['plume-lune'], 'songes : Plume Lune');
  await talk('monde', 'q:helene'); ok(S('songes') === 4, 'songes : la nuit au jardin');
  await talk('jardin', 'q:ariane1'); ok(S('songes') === 5, 'songes : Ariane fuit au temple');
  // Les talismans du Temple Kagura
  await talk('monde', 'q:sakura'); ok(S('kagura') === 1, 'kagura : lancée');
  // la Forêt des Torii est sur la carte du monde (à l'ouest de la route 7)
  ok(!maps.torii, 'la Forêt des Torii n\'est plus une carte à part');
  await beat('monde', 'q:tor1'); await beat('monde', 'q:tor2');
  const { TORII } = await import('../odyssee/js/world/plan.js'), [tdx, tdy] = maps.monde.w > 440 ? [TORII.dx, TORII.dy] : [0, 0];
  const torii = (d) => d.x >= 204 + tdx && d.x <= 281 + tdx && d.y >= 152 + tdy && d.y <= 197 + tdy;
  const [stele] = deco('monde', 'stele').filter(torii); await use('monde', stele.x, stele.y);
  ok(S('kagura') === 2 && bag.talisman === 3, 'kagura : trois talismans');
  const temple = Object.keys(maps).find((k) => k.startsWith('kagura:tower'));
  await talk(temple, 'pretre'); await talk(temple, 'pretre'); ok(S('kagura') === 3, 'kagura : talismans rendus');
  const [cl] = deco('monde', 'cloche').filter(torii); await use('monde', cl.x, cl.y); ok(S('kagura') === 'fin', 'kagura : terminée');
  await leg('uxie');
  await talk('kagura:sanctuaire', 'q:ariane2'); ok(S('songes') === 6, 'songes : sanctuaire');
  await leg('darkrai'); ok(S('songes') === 7, 'songes : Darkrai');
  await talk('monde', 'q:helene'); ok(S('songes') === 'fin', 'songes : terminée');
  ok(S('courrier') === 2, 'courrier : toutes les lettres remises');
  await talk('monde', 'q:facteur'); ok(S('courrier') === 'fin', 'courrier : terminée');
  // Le vœu de la fontaine, Créfadet
  ok(W.legends.find((q) => q.id === 'azelf').cond(F, game), 'Créfadet après Créhelf et Mesprit');
  bag['eclat-etoile'] = 7; await use('jardin', 22, 19); await use('jardin', 22, 19); ok(S('voeu') === 2, 'vœu : fontaine');
  await leg('jirachi'); ok(S('voeu') === 'fin', 'vœu : terminée');
  // Le dragon de pierre
  const musee = Object.values(maps).find((m) => m.name === 'Musée des Dragons');
  await talk(musee.id, 'q:savant'); bag['vieil-ambre'] = 1; await talk(musee.id, 'q:savant'); ok(S('fossile') === 'fin', 'fossile : terminée');
  // Le cœur du volcan
  ok(!W.docks.magma.show(F), 'Île du Magma fermée avant le titre de Maître');
  F.champion = true; ok(W.docks.magma.show(F), 'Île du Magma ouverte au Maître');
  const anc = Object.values(maps).find((m) => m.npcs.some((n) => n.id === 'ancien'));
  await talk(anc.id, 'ancien'); ok(S('magma') === 1, 'magma : lancée');
  for (let i = 1; i <= 4; i++) await beat('magma:base', 'q:base' + i);
  await talk('magma:base', 'q:sylas3'); await talk('magma:base', 'q:nox1'); ok(S('magma') === 2, 'magma : Nox fuit');
  await talk('magma:caverne', 'q:nox2'); ok(S('magma') === 3, 'magma : Groudon');
  await leg('groudon'); await talk(anc.id, 'ancien'); ok(S('magma') === 'fin' && bag['master-ball'], 'magma : terminée');
  ok(W.legends.find((q) => q.id === 'heatran').cond(F, game), 'Heatran après la quête');
  // Le fond de la mine (Pierrefort) : trois niveaux reliés par des échelles, le fossile tout au fond
  await talk('monde', 'mine:albin'); ok(S('mine') === 1, 'mine : lancée');
  { const ech = (m) => [...maps[m].warps.values()].filter((w) => w.step).map((w) => w.map);
    ok(ech('mine1').includes('mine2') && ech('mine2').includes('mine3') && ech('mine3').includes('mine2'), 'mine : échelles entre les niveaux');
    const f = maps.mine3.items.find((i) => i.item === 'fossile-dome'); ok(!!f, 'mine : le fossile est au fond');
    const r = maps.mine2.reach(5, 5, true, false, new Set()), sansForce = [...maps.mine2.warps.keys()].some((k) => { const [x, y] = k.split(',').map(Number); return maps.mine2.warps.get(k).map === 'mine3' && r[y * maps.mine2.w + x]; });
    ok(!sansForce, 'mine : l\'éboulement demande Force'); }
  bag['fossile-dome'] = 1; await talk('monde', 'mine:silex'); ok(S('mine') === 'fin' && !bag['fossile-dome'] && party.some((m) => m.sp === 140), 'mine : fossile ranimé');
} catch (e) { fails++; console.log('ÉCHEC :', e.message); }

for (const [id, q] of Object.entries(W.quests)) ok(F['Q:' + id] === 'fin', `quête ${id} (${q.name}) terminée`);
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); }
console.log(`Odyssée : ${Object.keys(W.quests).length} quêtes jouées de bout en bout`);
