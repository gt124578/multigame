// Salles à plusieurs niveaux d'Odyssée (odyssee/js/world/etages.js) : règles des marches, des passerelles (dessus et
// dessous), des plateformes à registre, et parcours de tous les états de la salle d'essai (aucune case hors d'atteinte,
// on revient toujours à l'entrée).  node tools/test-odyssee-etages.mjs
import assert from 'node:assert/strict';
const B = new URL('../odyssee/js/', import.meta.url).href;
const { construireArene, appliquerEtat, agir } = await import(B + 'world/arenes-plan.js');
const { planEssai, pasEtages, hauteurVue, niveau } = await import(B + 'world/etages.js');
const { T, DIRS, walkable } = await import(B + 'world/tiles.js');

const def = planEssai(), { map: m } = construireArene('essai:niveaux', null, def, 'Salle d\'essai');
const k2 = (x, y) => x + ',' + y;
console.log(def.plan.map((l, y) => l + '   ' + def.niveaux[y]).join('\n'));

// 1. marches : on monte dans l'axe, jamais par le côté ; deux volées et un palier jusqu'à l'estrade
assert.equal(m.get(4, 16), T.STAIRS);
assert.ok(pasEtages(m, 4, 17, 4, 16).ok && pasEtages(m, 4, 16, 4, 15).ok && pasEtages(m, 4, 15, 4, 14).ok && pasEtages(m, 4, 14, 4, 13).ok, 'hall, marches, palier, marches, estrade');
assert.ok(!pasEtages(m, 3, 16, 4, 16).ok && !pasEtages(m, 4, 16, 5, 16).ok, 'pas par le côté');
assert.ok(!pasEtages(m, 2, 15, 3, 15).ok && !pasEtages(m, 3, 15, 3, 14).ok, 'ni palier ni estrade sans marches');
assert.ok(pasEtages(m, 14, 12, 15, 12).ok && pasEtages(m, 15, 12, 16, 12).ok && pasEtages(m, 16, 12, 17, 12).ok && !pasEtages(m, 15, 11, 15, 12).ok, 'marches de côté, deux d\'affilée');
assert.ok(pasEtages(m, 4, 13, 4, 14).ok && pasEtages(m, 4, 14, 4, 15).ok && pasEtages(m, 4, 15, 4, 16).ok && pasEtages(m, 4, 16, 4, 17).ok, 'on redescend');
// 2. passerelle : dessus depuis l'estrade, dessous depuis le couloir, jamais de l'un à l'autre
const d1 = pasEtages(m, 7, 11, 8, 11); assert.ok(d1.ok && d1.dessus, 'de l\'estrade sur la passerelle');
const d0 = pasEtages(m, 10, 12, 10, 11); assert.ok(d0.ok && !d0.dessus, 'du couloir sous la passerelle');
assert.ok(!pasEtages(m, 10, 11, 10, 10, true).ok, 'on ne saute pas de la passerelle');
assert.ok(pasEtages(m, 10, 11, 10, 10, false).ok && pasEtages(m, 10, 11, 11, 11, true).dessus && !pasEtages(m, 10, 11, 11, 11, false).dessus);
assert.ok(!pasEtages(m, 8, 11, 7, 11, false).ok && pasEtages(m, 8, 11, 7, 11, true).ok, 'dessous, on ne grimpe pas sur l\'estrade');
assert.equal(niveau(m, 10, 11, true), 2); assert.equal(niveau(m, 10, 11, false), 0);
// 3. hauteurs dessinées : les marches
assert.equal(hauteurVue(m, 4.5, 16.9), 0.25); assert.equal(hauteurVue(m, 4.5, 16.4), 0.75); assert.equal(hauteurVue(m, 4.5, 15.5), 1); assert.equal(hauteurVue(m, 4.5, 14.1), 2); assert.equal(hauteurVue(m, 4.5, 13.5), 2);   // quatre marches par case
assert.equal(hauteurVue(m, 10.5, 11.5, true), 2); assert.equal(hauteurVue(m, 10.5, 11.5, false), 0);
// 4. monte-charge : il suit son registre
assert.ok(pasEtages(m, 20, 14, 20, 13).ok && !pasEtages(m, 19, 13, 20, 13).ok, 'en bas : on y monte depuis le hall');
appliquerEtat(m, [1, 0]); assert.ok(pasEtages(m, 19, 13, 20, 13).ok && !pasEtages(m, 20, 14, 20, 13).ok, 'au milieu : depuis l\'estrade');
appliquerEtat(m, [2, 0]); assert.ok(pasEtages(m, 20, 12, 20, 11).ok && !pasEtages(m, 19, 13, 20, 13).ok, 'en haut : vers la mezzanine');
appliquerEtat(m, [0, 0]);

// 5. tous les états : (case, dessus, registres)
const leviers = [...m.objects].filter(([, o]) => o.type === 'reg').map(([k, o]) => [...k.split(',').map(Number), o]);
const depart = [m.exitX, m.exitY - 1, 0, 0, 0];
const cle = (s) => s.join();
const vus = new Map([[cle(depart), null]]), file = [depart], aretes = new Map();
const voisins = (s) => {
  const [x, y, d, r0, r1] = s, R = [r0, r1], out = [];
  appliquerEtat(m, R);
  for (const [dx, dy] of Object.values(DIRS)) {
    const a = x + dx, b = y + dy; if (!m.in(a, b)) continue;
    if (walkable(m.get(a, b))) { const p = pasEtages(m, x, y, a, b, !!d); if (p.ok) out.push([a, b, p.dessus ? 1 : 0, r0, r1]); }
    const lv = leviers.find(([lx, ly]) => lx === a && ly === b);
    if (lv) { const R2 = agir(lv[2].a, R, m); out.push([x, y, d, R2[0], R2[1]]); }
  }
  return out;
};
while (file.length) { const s = file.shift(), V = voisins(s); aretes.set(cle(s), V.map(cle)); for (const v of V) if (!vus.has(cle(v))) { vus.set(cle(v), s); file.push(v); } }
// toutes les cases où l'on marche sont atteintes (et la passerelle par ses deux étages)
const atteintes = new Set([...vus.keys()].map((k) => k.split(',').slice(0, 3).join()));
for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (walkable(def.plan[y][x] === '~' ? T.WATER : m.get(x, y)) && m.get(x, y) !== T.MAT) assert.ok(atteintes.has([x, y, 0].join()) || atteintes.has([x, y, 1].join()), `case ${x},${y} hors d'atteinte`);
for (let x = 8; x <= 14; x++) assert.ok(atteintes.has([x, 11, 0].join()) && atteintes.has([x, 11, 1].join()), 'passerelle : dessus et dessous');
// de tout état, on revient à l'entrée (parcours à l'envers)
const inv = new Map(); for (const [a, L] of aretes) for (const b of L) (inv.get(b) || inv.set(b, []).get(b)).push(a);
const retour = new Set(); const pile = [...vus.keys()].filter((k) => k.startsWith(depart.slice(0, 3).join() + ','));
for (const k of pile) retour.add(k);
while (pile.length) { for (const a of inv.get(pile.pop()) || []) if (!retour.has(a)) { retour.add(a); pile.push(a); } }
assert.equal(retour.size, vus.size, `${vus.size - retour.size} états d'où l'on ne revient pas à l'entrée`);
console.log(`\n✓ marches, passerelle, monte-charge ; ${vus.size} états parcourus, toutes les cases atteintes, retour toujours possible`);

// 6. arène Glace à gradins : glissades, chutes au bord d'un gradin, marches ; le solveur des arènes la résout
{
  const { resoudre } = await import(B + 'world/arenes-plan.js');
  const { planGlace, chuteGlissade } = await import(B + 'world/etages.js');
  const dg = planGlace(), g = construireArene('essai:glace', null, dg, 'Glacier').map;
  assert.ok(chuteGlissade(g, 5, 10, 5, 11) && chuteGlissade(g, 5, 16, 5, 17), 'au bord d\'un gradin, la glissade tombe');
  assert.ok(!chuteGlissade(g, 5, 11, 5, 10) && !g.canStep(5, 11, 5, 10), 'la paroi du gradin du dessus arrête');
  assert.ok(!g.canStep(5, 10, 5, 11), 'en marchant, on ne saute pas d\'un gradin');
  const R = resoudre(g, { npcs: new Set(), but: (x, y) => x === dg.but[0] && y === dg.but[1] });
  assert.ok(R.ok && R.retour, 'le Glacier se résout et l\'on en revient');
  assert.equal(R.coinces.length, 0, 'aucune impasse');
  assert.equal(R.pas, 15, 'quinze glissades au plus court');
  // une glissade vers le sud depuis le haut du deuxième gradin : on dévale tout jusqu'au hall
  const tombe = resoudre(g, { npcs: new Set(), depart: [2, 9], but: (x, y) => y >= 17 });
  assert.ok(tombe.ok, 'on peut redescendre en tombant');
  console.log(`✓ arène Glace : ${R.pas} glissades au plus court, ${R.etats} états, aucune impasse`);
}
console.log('SALLES À NIVEAUX AU VERT');
