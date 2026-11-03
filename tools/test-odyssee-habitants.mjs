// tools/test-odyssee-habitants.mjs — joue toutes les requêtes des habitants d'Odyssée (world/habitants.js) sans
// affichage : on accepte la quête, on remplit la condition (objet trouvé sur la carte, Pokémon montré, dresseurs
// battus, lieu visité, combat gagné), on la termine. Vérifie aussi que le journal la note, puis la marque terminée,
// et que ses phrases ne donnent pas d'indice.   node tools/test-odyssee-habitants.mjs
globalThis.location = { search: '' };
const { buildWorld } = await import('../odyssee/js/world/region.js');
const { MISSIONS } = await import('../odyssee/js/world/habitants.js');
const { storyTalk } = await import('../odyssee/js/story.js');
const { getAllQuests, syncJournal, QUEST_COUNT } = await import('../odyssee/js/core/questsData.js');
const { ITEMS } = await import('../odyssee/js/core/items.js');
const { SPECIES } = await import('../odyssee/js/data/species.js');
const { createMon } = await import('../odyssee/js/core/mon.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } };
const world = buildWorld(), W = world.maps.monde;
const st = { name: 'Léa', gender: 'f', flags: { starter: 1, rival1: true, rivalSp: 1 }, bag: {}, party: [createMon(1, 30)], box: [], badges: Array(8).fill(true), dex: { seen: [], caught: [] }, time: 0, journal: {} };
const g = {
  state: st, world, ui: { say: async () => {}, yesNo: async () => true, toast() {} }, sound: { sfx() {} },
  give(k, n = 1) { ok(ITEMS[k], 'objet connu : ' + k); st.bag[k] = (st.bag[k] || 0) + n; },
  take(k, n = 1) { st.bag[k] = (st.bag[k] || 0) - n; if (st.bag[k] <= 0) delete st.bag[k]; },
  lead: () => st.party[0], refreshNpcs() {}, badgeCount: () => 8, locationName: () => 'Test', hour: () => 22,
  rivalLine: () => [4, 5, 6], rivalB: () => ({ name: 'Ethan', e: '', fils: 'petit-fils' }),
  missionTrainers: (r) => W.missionTrainers[r] || [],
  pickParty: async (gg, o) => st.party.findIndex((m) => !o.filter(m)),
  api: () => ({ fight: async (tr) => { for (const [sp, l] of tr.team) ok(SPECIES[sp] && l > 0 && l <= 100, `équipe de ${tr.name}`); return 'win'; } }),
};
const talk = async (n) => { ok(await storyTalk(g, 'mission', { def: n, id: n.id }), 'script mission joué : ' + n.id); };
const npcOf = (id, dest) => W.npcs.find((n) => n.script === 'mission' && n.mission.id === id && (dest ? n.mission.role === 'receiver' : n.mission.role !== 'receiver'));
// objets posés dans la région pour une quête
const itemsOnMaps = (it) => Object.values(world.maps).flatMap((m) => m.items.filter((x) => x.item === it));

const HINT = /📍|destination|rends-toi|va voir|au nord|au sud|à l'est|à l'ouest|il faut |utilise la cs/i;
for (const M of MISSIONS) {
  const n = npcOf(M.id); ok(n, `PNJ de ${M.id} posé`); if (!n) continue;
  ok(W.zoneAt(n.x, n.y)?.town, `${M.id} : ${M.who} est bien dans une ville`);
  for (const [it, k] of (M.reward || M.to?.reward || [])) ok(ITEMS[it] && k > 0, `${M.id} : récompense ${it}`);
  if (M.showIf) { st.flags[M.showIf] = true; }
  await talk(n); syncJournal(g);
  ok(st.flags['A:' + M.id], `${M.id} : quête acceptée`);
  ok(getAllQuests(g).some((q) => q.id === M.id), `${M.id} : dans le journal`);
  if (M.kind === 'relay') {
    ok(st.bag[M.item] === 1, `${M.id} : objet confié`);
    const d = npcOf(M.id, true); ok(d && W.zoneAt(d.x, d.y)?.town, `${M.id} : destinataire posé dans une ville`);
    await talk(d);
  } else if (M.kind === 'bring') {
    const q = M.qty || 1;
    if (M.place) { const found = itemsOnMaps(M.item); ok(found.length >= q, `${M.id} : ${q} × ${M.item} posé(s) dans la région (${found.length})`); }
    st.bag[M.item] = q; await talk(n); ok(!st.bag[M.item], `${M.id} : objet rendu`);
  } else if (M.kind === 'show') {
    const sp = Object.keys(SPECIES).map(Number).find((x) => M.test(createMon(x, 40), st) || M.test(Object.assign(createMon(x, 40), { ot: st.name }), st));
    ok(sp, `${M.id} : un Pokémon convient`); const m = createMon(sp, 40); m.ot = st.name; st.party.push(m);
    await talk(n); st.party.pop();
  } else if (M.kind === 'check') {
    if (M.id === 'mCapitaine') st.dex.caught = Object.keys(SPECIES).map(Number).filter((x) => SPECIES[x].t.includes('water')).slice(0, 10);
    if (M.id === 'mReves') st.flags['VN:jardin'] = true;
    for (const r of ['r5', 'r11']) for (const id of g.missionTrainers(r)) st.flags['T:' + id] = true;
    ok(M.test(st, g), `${M.id} : condition remplie`);
    await talk(n);
  } else if (M.kind === 'duel') await talk(n);
  st.time += 600; syncJournal(g);
  ok(st.flags[M.id], `${M.id} : terminée`);
  const q = getAllQuests(g).find((x) => x.id === M.id);
  ok(q && q.status === 'done' && st.journal[M.id]?.d != null, `${M.id} : marquée terminée dans le journal`);
  ok(q && q.notes.every((t) => !HINT.test(t)), `${M.id} : pas d'indice dans le journal`);
}
ok(MISSIONS.length >= 20, `au moins 20 requêtes d'habitants (${MISSIONS.length})`);
ok(QUEST_COUNT >= 45, `journal : au moins 45 quêtes (${QUEST_COUNT})`);
console.log(fails ? `${fails} échec(s)` : `Odyssée : ${MISSIONS.length} requêtes d'habitants jouées, ${QUEST_COUNT} quêtes au journal`);
process.exit(fails ? 1 : 0);
