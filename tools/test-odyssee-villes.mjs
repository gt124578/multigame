// tools/test-odyssee-villes.mjs — les villes d'Odyssée, vues de près, et ce qu'on voit depuis chaque case de la carte :
//   1. de l'air entre les bâtiments : deux cases au moins entre deux bâtiments, deux cases praticables devant chaque
//      porte, et aucun bâtiment au sud qui cache la porte (son toit, vu de la caméra, ne monte pas jusqu'à elle :
//      hauteurVue de mapgen.js) ;
//   2. les parties ouvertes des modèles (terrasse, porche, galerie) : on y marche, et la porte s'ouvre dessus ;
//   3. la cohérence : pas de porte murée ni injoignable, pas de panneau ni de PNJ dans un mur, pas de rue qui bute contre
//      un mur de bâtiment, pas de bout de chemin qui ne mène nulle part ;
//   4. ce qu'on voit à l'écran (13 cases de chaque côté, 10 vers le haut, 8 vers le bas) : depuis une case d'une zone, on
//      ne doit jamais voir une case d'une autre zone qu'on ne peut pas rejoindre de près (forêt épaisse, montagne ou eau
//      entre les deux) ; l'eau compte comme un passage (on voit l'autre rive d'un lac ou d'un bras de mer).
// node tools/test-odyssee-villes.mjs [--carte] [--detail]   (--carte : écrit /tmp/odyssee-vues.json, les cases fautives)
import { buildWorld } from '../odyssee/js/world/region.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import { hauteurVue } from '../odyssee/js/world/mapgen.js';
import fs from 'fs';
import { vues } from '../odyssee/js/world/ecrans.js';

// cases d'où l'on voit encore une autre zone : celles qu'un chemin, une porte ou un habitant empêchent d'épaissir
const SEUIL_VUES = 900;

const detail = process.argv.includes('--detail'), carte = process.argv.includes('--carte');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } return c; };
const t0 = Date.now();
const world = buildWorld();
const W = world.maps.monde, w = W.w, h = W.h;
console.log(`monde construit en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const DECOR = new Set(['etal', 'puits', 'fontaine', 'kiosque', 'statueChampion']);   // petit mobilier bâti (pas une maison)
const villes = Object.values(world.towns).map((t) => ({ t, r: t.ville || { x: t.x, y: t.y, w: t.w, h: t.h } }));
const dansVille = (b, r) => b.x >= r.x && b.y >= r.y && b.x < r.x + r.w && b.y < r.y + r.h;
const npcAt = new Map(W.npcs.map((n) => [n.x + ',' + n.y, n]));

/* ---------- 1 · 2 · 3 : chaque ville ---------- */
const bilan = [];
for (const { t, r } of villes) {
  const B = W.buildings.filter((b) => b.kind !== 'cave' && dansVille(b, r) && !DECOR.has(b.modele));
  const pb = { serre: [], porte: [], cache: [], terr: [], muree: [], mur: [], rue: [] };
  // 1. écarts entre bâtiments (rectangles d'emprise) : au moins deux cases entre eux, dans un sens ou dans l'autre
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if (a.door < 0 && b.door < 0) continue;   // deux tours de bureaux côte à côte (sans porte) : un pâté de maisons
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.d), a.y - (b.y + b.d));
    if (Math.max(gx, gy) < 2) pb.serre.push(`${a.name || a.modele || a.kind}@${a.x},${a.y} / ${b.name || b.modele || b.kind}@${b.x},${b.y} (écart ${Math.max(gx, gy)})`);
  }
  // devant chaque porte : deux cases praticables, et pas de bâtiment au sud dont le toit monte jusqu'à la porte
  for (const b of B) {
    if (b.door < 0) continue;
    for (const dx of [b.doorX, b.door2X].filter((q) => q !== undefined)) {
      for (const k of [1, 2]) { const q = W.get(dx, b.doorY + k); if (!walkable(q) || q === T.DOOR) { pb.porte.push(`${b.name || b.modele || b.kind}@${b.x},${b.y} : case ${k} devant la porte (${dx},${b.doorY + k}) = ${q}`); break; } }
      for (const s of B) if (s !== b && s.y > b.doorY && dx >= s.x && dx < s.x + s.w && s.y - hauteurVue(s) <= b.doorY) pb.cache.push(`porte de ${b.name || b.modele || b.kind}@${b.x},${b.y} cachée par ${s.name || s.modele || s.kind}@${s.x},${s.y}`);
    }
    // 2. parties ouvertes : praticables
    for (const [i, j] of b.libres || []) if (!walkable(W.get(b.x + i, b.y + j))) pb.terr.push(`${b.modele || b.kind}@${b.x},${b.y} : case libre ${i},${j} = ${W.get(b.x + i, b.y + j)}`);
  }
  bilan.push({ t, r, B, pb });
}
// portes et habitants joignables (toutes capacités, tous les badges), depuis le Centre de soins (ou la maison) de chaque ville
// (comme test-odyssee.mjs : chaque sortie de grotte relance l'exploration, le bateau relie les quais)
const seen = (() => {
  const { maps, towns, docks } = world, out = new Uint8Array(w * h), quais = Object.values(docks).filter((d) => d.map === 'monde' && !d.show);
  const seeds = [towns.A.homeDoor.slice()], faites = new Set(), quaisFaits = new Set();
  for (;;) {
    if (!seeds.length) for (const d of quais) if (!quaisFaits.has(d) && quais.some((q) => out[q.y * w + q.x])) { quaisFaits.add(d); seeds.push([d.x, d.y]); }
    if (!seeds.length) break;
    const [sx, sy] = seeds.pop(); if (out[sy * w + sx]) continue;
    const r = W.reach(sx, sy, true, false, true); for (let i = 0; i < r.length; i++) if (r[i]) out[i] = 1;
    for (const [k, wp] of W.warps) {
      const [x, y] = k.split(',').map(Number), cave = maps[wp.map];
      if (!cave || cave.floor !== 'cave' || faites.has(wp.map) || !out[(y + 1) * w + x]) continue;
      faites.add(wp.map);
      const cr = cave.reach(wp.x, wp.y, true, false, true);
      for (const [ck, cw] of cave.warps) { const [cx, cy] = ck.split(',').map(Number); if (cr[(cy - 1) * cave.w + cx] || cr[cy * cave.w + cx]) seeds.push([cw.x, cw.y]); }
    }
  }
  return out;
})();
for (const { t, r, B, pb } of bilan) {
  for (const b of B) if (b.door >= 0 && !seen[(b.doorY + 1) * w + b.doorX]) pb.muree.push(`${b.name || b.modele || b.kind}@${b.x},${b.y} : porte injoignable`);
  // PNJ et panneaux : pas dans un mur ; un panneau se lit depuis une case voisine joignable
  for (const n of W.npcs) {
    if (n.x < r.x || n.y < r.y || n.x >= r.x + r.w || n.y >= r.y + r.h) continue;
    const q = W.get(n.x, n.y);
    if (!walkable(q) || q === T.DOOR) pb.mur.push(`PNJ ${n.id} sur une case ${q} (${n.x},${n.y})`);
    else if (!seen[n.y * w + n.x] && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => seen[(n.y + c) * w + n.x + a])) pb.mur.push(`PNJ ${n.id} injoignable (${n.x},${n.y})`);
  }
  for (const k of W.signs.keys()) {
    const [x, y] = k.split(',').map(Number); if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => seen[(y + c) * w + x + a])) pb.mur.push(`panneau illisible (${x},${y}) : ${W.signs.get(k).split('\n')[0]}`);
  }
  // une rue (deux cases de chemin dans le même axe) qui bute droit contre un mur de bâtiment (pas une porte)
  // (les terrasses et porches des bâtiments ne sont pas des rues)
  const dansBat = new Set(); for (const b of B) for (const [i, j] of b.libres || []) dansBat.add((b.x + i) + ',' + (b.y + j));
  const CH = (q) => q === T.PATH || q === T.PAVE;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (!CH(W.get(x, y)) || dansBat.has(x + ',' + y) || dansBat.has((x - 1) + ',' + y) || dansBat.has((x + 1) + ',' + y)) continue;
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (W.get(x + a, y + c) !== T.BUILD || !CH(W.get(x - a, y - c)) || !CH(W.get(x - 2 * a, y - 2 * c))) continue;
      // tourne-t-elle ? (une case de chemin sur le côté)
      if (CH(W.get(x + c, y + a)) || CH(W.get(x - c, y - a))) continue;
      pb.rue.push(`(${x},${y}) bute vers ${a},${c}`);
    }
  }
}
// bouts de chemin (de plus de 3 cases) qui ne mènent nulle part : ni porte, ni panneau, ni PNJ, ni objet, ni bord de ville
const objAt = new Set(W.items.map((i) => i.x + ',' + i.y));
// (devant une porte, sur une terrasse : c'est l'allée de la maison)
for (const b of W.buildings) { for (const [i, j] of b.libres || []) objAt.add((b.x + i) + ',' + (b.y + j)); if (b.door >= 0) for (const k of [1, 2]) objAt.add(b.doorX + ',' + (b.doorY + k)); }
for (const { r, pb } of bilan) {
  pb.impasse = [];
  const CH = (q) => q === T.PATH || q === T.PAVE || q === T.BRIDGE || q === T.STAIRS;
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
    if (!CH(W.get(x, y))) continue;
    const vois = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => CH(W.get(x + a, y + c)));
    if (vois.length !== 1) continue;
    // remonter le bout jusqu'au carrefour
    let px = x, py = y, n = 0, [dx, dy] = vois[0];
    const utile = (u, v) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => { const q = W.get(u + a, v + c), k = (u + a) + ',' + (v + c); return q === T.DOOR || q === T.CAVEDOOR || q === T.SIGN || (q === T.WATER && W.get(u, v) === T.BRIDGE) || npcAt.has(k) || objAt.has(k) || W.warpAt(u + a, v + c) || (walkable(q) && !CH(q) && q !== T.TALL); });
    let bon = utile(px, py);
    while (!bon && n < 40) {
      px += dx; py += dy; n++;
      const nv = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => CH(W.get(px + a, py + c)) && !(a === -dx && c === -dy));
      if (nv.length !== 1) break;
      [dx, dy] = nv[0];
    }
    if (!bon && n >= 3) pb.impasse.push(`(${x},${y})`);
  }
}
let tot = { serre: 0, porte: 0, cache: 0, terr: 0, muree: 0, mur: 0, rue: 0, impasse: 0 };
console.log('\nville            taille     bât.  serrés portes cachées terr. murées murs rues impasses');
for (const { t, r, B, pb } of bilan) {
  for (const k of Object.keys(tot)) tot[k] += pb[k].length;
  console.log(`${t.name.padEnd(16)} ${(r.w + '×' + r.h).padEnd(9)} ${String(B.length).padStart(5)} ${String(pb.serre.length).padStart(7)} ${String(pb.porte.length).padStart(6)} ${String(pb.cache.length).padStart(7)} ${String(pb.terr.length).padStart(5)} ${String(pb.muree.length).padStart(6)} ${String(pb.mur.length).padStart(4)} ${String(pb.rue.length).padStart(4)} ${String(pb.impasse.length).padStart(8)}`);
  if (detail) for (const [k, L] of Object.entries(pb)) for (const m of L.slice(0, 12)) console.log('   ', k, m);
}
ok(tot.serre === 0, `${tot.serre} paires de bâtiments à moins de deux cases`);
ok(tot.porte === 0, `${tot.porte} portes sans deux cases praticables devant`);
ok(tot.cache === 0, `${tot.cache} portes cachées par le bâtiment du sud`);
ok(tot.terr === 0, `${tot.terr} cases de terrasse où l'on ne marche pas`);
ok(tot.muree === 0, `${tot.muree} portes murées ou injoignables`);
ok(tot.mur === 0, `${tot.mur} PNJ ou panneaux dans un mur`);
ok(tot.rue <= 6, `${tot.rue} rues qui butent contre un bâtiment`);
ok(tot.impasse <= 10, `${tot.impasse} bouts de chemin qui ne mènent nulle part`);

/* ---------- 4 · ce qu'on voit à l'écran (ecrans.js) ---------- */
{
  const t1 = Date.now(), R = vues(W, undefined, null);
  console.log(`\nécrans de verdure : ${W.ecrans?.plantes} arbres plantés à la construction (${W.ecrans?.ms} ms)`);
  console.log(`vues sur une autre zone : ${R.n} cases (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  const L = [...R.fautes.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [k, v] of L.slice(0, detail ? 200 : 30)) console.log(`  ${String(v.n).padStart(5)}  ${k}  (ex. ${v.ex.join(',')})`);
  if (carte) { const c = []; for (let i = 0; i < R.expose.length; i++) if (R.expose[i]) c.push([i % w, (i / w) | 0]); fs.writeFileSync('/tmp/odyssee-vues.json', JSON.stringify(c)); }
  ok(R.n <= SEUIL_VUES, `${R.n} cases d'où l'on voit une autre zone sans pouvoir la rejoindre (seuil ${SEUIL_VUES})`);
}
console.log(fails ? `\n${fails} échec(s)` : '\nvilles : tout est bon');
process.exit(fails ? 1 : 0);
