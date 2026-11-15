// Audit des cartes d'Odyssée : portes qui mènent quelque part où l'on marche, habitants et objets au sol bien posés
// (pas l'un sur l'autre, pas sur une porte), dresseurs, boutiques et objets qui existent, textes sans « undefined »,
// intérieurs et grottes entièrement accessibles depuis leurs entrées.
// node tools/audit-odyssee-monde.mjs [exemples par problème = 8]
const B = new URL('../odyssee/js/', import.meta.url).href;
await import(B + 'core/mega.js');   // les Méga-Gemmes s'inscrivent dans ITEMS
const { buildWorld } = await import(B + 'world/region.js');
const { T, walkable } = await import(B + 'world/tiles.js');
const { SPECIES } = await import(B + 'data/species.js');
const { MOVES } = await import(B + 'data/moves.js');
const { ITEMS } = await import(B + 'core/items.js');
const W = buildWorld(); const maps = W.maps;
const pb = []; const P = (k, s) => pb.push([k, s]);
const key = (x, y) => x + ',' + y;
let nw = 0, nn = 0, ni = 0;
for (const m of Object.values(maps)) {
  // warps
  for (const [k, to] of m.warps) {
    nw++;
    const d = maps[to.map]; if (!d) { P('warp vers carte inconnue', `${m.id} ${k} → ${to.map}`); continue; }
    if (!d.in(to.x, to.y)) { P('warp hors carte', `${m.id} ${k} → ${to.map} ${to.x},${to.y}`); continue; }
    const t = d.get(to.x, to.y);
    if (!walkable(t)) P('warp arrive sur une case où on ne marche pas', `${m.id} ${k} → ${to.map} ${to.x},${to.y} (tuile ${t})`);
    if (d.npcs.some((n) => n.x === to.x && n.y === to.y && !n.when)) P('warp arrive sur un PNJ', `${m.id} ${k} → ${to.map} ${to.x},${to.y}`);
  }
  // PNJ
  const occ = new Map();
  for (const n of m.npcs) {
    nn++;
    if (!m.in(n.x, n.y)) { P('PNJ hors carte', `${m.id} ${n.id}`); continue; }
    const t = m.get(n.x, n.y);
    if (!walkable(t) && t !== T.WATER && !n.when && !n.sp && !/^poke:/.test(n.sprite || '')) P('PNJ sur une case pleine', `${m.id} ${n.id} (${n.x},${n.y}) tuile ${t} sprite ${n.sprite}`);
    if (m.warpAt(n.x, n.y)) P('PNJ sur un warp', `${m.id} ${n.id} (${n.x},${n.y})`);
    if (!n.when) { const k = key(n.x, n.y); if (occ.has(k)) P('deux PNJ permanents sur la même case', `${m.id} ${n.id} et ${occ.get(k)} (${n.x},${n.y})`); occ.set(k, n.id); }
    if (m.objectAt(n.x, n.y)) P('PNJ sur un objet', `${m.id} ${n.id} (${n.x},${n.y}) ${m.objectAt(n.x, n.y).type || ''}`);
    if (n.trainer) { for (const e of n.trainer.team || []) { const [sp, l, o] = e; if (!SPECIES[sp]) P('dresseur : espèce inconnue', `${m.id} ${n.id} ${sp}`); if (!(l >= 1 && l <= 100)) P('dresseur : niveau invalide', `${m.id} ${n.id} ${l}`); for (const mv of (o?.moves || [])) if (!MOVES[mv]) P('dresseur : attaque inconnue', `${m.id} ${n.id} ${mv}`); if (o?.item && !ITEMS[o.item]) P('dresseur : objet tenu inconnu', `${m.id} ${n.id} ${o.item}`); } if (!(n.trainer.team || []).length) P('dresseur sans équipe', `${m.id} ${n.id}`); }
    if (n.role === 'shop') for (const it of (n.stock || [])) if (!ITEMS[Array.isArray(it) ? it[0] : it]) P('boutique : objet inconnu', `${m.id} ${n.id} ${it}`);
    const txt = JSON.stringify([n.text, n.name, n.trainer?.intro, n.trainer?.win, n.trainer?.after, n.trainer?.name]);
    if (/undefined|NaN|\[object/.test(txt)) P('texte de PNJ avec undefined', `${m.id} ${n.id} ${txt.slice(0, 200)}`);
    if (!n.sprite) P('PNJ sans sprite', `${m.id} ${n.id}`);
  }
  for (const it of m.items) {
    ni++;
    if (!ITEMS[it.item]) P('objet au sol inconnu', `${m.id} ${it.id} ${it.item}`);
    if (!m.in(it.x, it.y)) { P('objet au sol hors carte', `${m.id} ${it.id}`); continue; }
    if (m.npcs.some((n) => n.x === it.x && n.y === it.y && !n.when)) P('objet au sol sous un PNJ', `${m.id} ${it.id} (${it.x},${it.y})`);
    if (m.warpAt(it.x, it.y)) P('objet au sol sur un warp', `${m.id} ${it.id}`);
  }
  for (const [k, s] of m.signs) if (/undefined|NaN|\[object/.test(JSON.stringify(s))) P('panneau avec undefined', `${m.id} ${k} ${JSON.stringify(s).slice(0, 160)}`);
  // rencontres
  const encs = [m.encounter, ...m.zones.map((z) => z.encounter || z.enc)].filter(Boolean);
  for (const e of encs) for (const [kind, L] of Object.entries(e)) if (Array.isArray(L)) for (const r of L) { const sp = Array.isArray(r) ? r[0] : r?.sp; if (typeof sp === 'number' && !SPECIES[sp]) P('rencontre : espèce inconnue', `${m.id} ${kind} ${sp}`); }
  // intérieurs et grottes : depuis les arrivées, tout est-il atteignable ?
  if (m.id !== 'monde') {
    const arr = []; for (const o of Object.values(maps)) for (const [, to] of o.warps) if (to.map === m.id) arr.push([to.x, to.y]);
    if (!arr.length) { if (m.npcs.length || m.items.length) P('carte sans aucune entrée', m.id); continue; }
    const seen = new Uint8Array(m.w * m.h); const q = [];
    for (const [x, y] of arr) if (m.in(x, y)) { seen[y * m.w + x] = 1; q.push([x, y]); }
    const fixes = new Set(m.npcs.filter((n) => !n.when && (n.move === 'static' || n.move === 'turn' || !n.move)).map((n) => key(n.x, n.y)));
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = x + dx, v = y + dy; if (!m.in(u, v) || seen[v * m.w + u]) continue; const t = m.get(u, v); const pass = walkable(t) || t === T.WATER || t === T.CUT || t === T.SMASH || t === T.BOULDER || t === T.LEDGE || t === T.STAIRS; if (!pass || fixes.has(key(u, v))) continue; if (m.canStep && walkable(t) && walkable(m.get(x, y)) && !m.canStep(x, y, u, v) && !m.canStep(u, v, x, y)) continue; seen[v * m.w + u] = 1; q.push([u, v]); } }
    const pres = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => m.in(x + dx, y + dy) && seen[(y + dy) * m.w + x + dx]);
    for (const n of m.npcs) if (!pres(n.x, n.y) && !m.etat && !m.planArene) P('PNJ inaccessible (intérieur / grotte)', `${m.id} ${n.id} (${n.x},${n.y})`);
    for (const it of m.items) if (!pres(it.x, it.y) && !m.etat) P('objet inaccessible (intérieur / grotte)', `${m.id} ${it.id} (${it.x},${it.y})`);
    for (const [k] of m.warps) { const [x, y] = k.split(',').map(Number); if (!pres(x, y) && !m.etat) P('sortie inaccessible (intérieur / grotte)', `${m.id} ${k}`); }
  }
}
console.log(`${Object.keys(maps).length} cartes, ${nw} warps, ${nn} PNJ, ${ni} objets`);
const G = new Map(); for (const [k, s] of pb) { if (!G.has(k)) G.set(k, []); G.get(k).push(s); }
for (const [k, L] of G) { console.log(`\n[${L.length}×] ${k}`); for (const s of L.slice(0, +(process.argv[2] || 8))) console.log('    ' + s); }
if (G.size) process.exit(1);
console.log('\nAUDIT DES CARTES AU VERT');
