// tools/test-odyssee-villes.mjs — les villes d'Odyssée, vues de près, et ce qu'on voit depuis chaque case de la carte :
//   1. de l'air entre les bâtiments : deux cases au moins entre deux bâtiments, deux cases praticables devant chaque
//      porte, et aucun bâtiment juste au sud qui cache la porte (son toit ne monte pas jusqu'à elle) ;
//   2. les parties ouvertes des modèles (terrasse, porche, galerie) : on y marche, et la porte s'ouvre dessus ;
//   3. la cohérence : pas de porte murée ni injoignable, pas de panneau ni de PNJ dans un mur, pas de rue qui bute contre
//      un mur de bâtiment, pas de bout de chemin qui ne mène nulle part ;
//   4. ce qu'on voit à l'écran (13 cases de chaque côté, 10 vers le haut, 8 vers le bas) : depuis une case d'une zone, on
//      ne doit jamais voir une case d'une autre zone qu'on ne peut pas rejoindre de près (forêt épaisse, montagne ou eau
//      entre les deux) ; l'eau compte comme un passage (on voit l'autre rive d'un lac ou d'un bras de mer).
// node tools/test-odyssee-villes.mjs [--carte] [--detail]   (--carte : écrit /tmp/odyssee-vues.json, les cases fautives)
import { buildWorld } from '../odyssee/js/world/region.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import fs from 'fs';

const detail = process.argv.includes('--detail'), carte = process.argv.includes('--carte');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } return c; };
const t0 = Date.now();
const world = buildWorld();
const W = world.maps.monde, w = W.w, h = W.h;
console.log(`monde construit en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const DECOR = new Set(['etal', 'puits', 'fontaine', 'kiosque', 'statueChampion']);   // petit mobilier bâti (pas une maison)
const villes = Object.values(world.towns).map((t) => ({ t, r: t.territoire || t.ville || { x: t.x, y: t.y, w: t.w, h: t.h } }));
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
      for (const s of B) if (s !== b && s.y > b.doorY && dx >= s.x && dx < s.x + s.w && s.y - Math.min(s.h, 3) <= b.doorY) pb.cache.push(`porte de ${b.name || b.modele || b.kind}@${b.x},${b.y} cachée par ${s.name || s.modele || s.kind}@${s.x},${s.y}`);
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
ok(tot.rue === 0, `${tot.rue} rues qui butent contre un bâtiment`);
ok(tot.impasse <= 6, `${tot.impasse} bouts de chemin qui ne mènent nulle part`);

/* ---------- 4 · ce qu'on voit à l'écran ---------- */
{
  const t1 = Date.now();
  const VX = 13, VH = 10, VB = 8, M = 16, G = 8;   // fenêtre de vue, marge de la recherche locale, groupe de cases
  // la zone de chaque case (ville, ou nom de la zone)
  const zid = new Int32Array(w * h).fill(-1), noms = new Map(), nom = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!seen[y * w + x]) continue;
    // la mer et les cases sans zone ne comptent pas (rivages, îlots) : seules les villes, routes et lieux sont des zones
    const z = W.zoneAt(x, y); if (!z || (z.sea && !z.town)) continue;
    const k = z.town ? 'ville ' + z.town : z.name;
    if (!noms.has(k)) { noms.set(k, nom.length); nom.push(k); }
    zid[y * w + x] = noms.get(k);
  }
  // passage local : marcher (même hauteur, escaliers), sauter un rebord (dans les deux sens), nager, couper, briser
  const passe = (q) => walkable(q) || q === T.WATER || q === T.CUT || q === T.SMASH || q === T.BOULDER || q === T.LEDGE || q === T.LEDGE_E || q === T.LEDGE_W;
  const pas = (x0, y0, x1, y1) => { const a = W.height(x0, y0), b = W.height(x1, y1); return a === b || Math.abs(a - b) <= 1 && (W.get(x0, y0) === T.STAIRS || W.get(x1, y1) === T.STAIRS || [T.LEDGE, T.LEDGE_E, T.LEDGE_W].includes(W.get(x0, y0)) || [T.LEDGE, T.LEDGE_E, T.LEDGE_W].includes(W.get(x1, y1))); };
  // vue par-dessus l'eau (lac, bras de mer : au moins trois cases d'eau sur la ligne de vue) : permis
  const parEau = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); let k = 0; for (let i = 1; i < n; i++) { const q = W.get(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)); if (q === T.WATER || q === T.WHIRL) k++; } return k >= 3; };
  const BW = G + 2 * (VX + M), BH = G + VH + VB + 2 * M, lab = new Int32Array(BW * BH), pile = new Int32Array(BW * BH * 2);
  const fautes = new Map(), cases = [];
  let nf = 0;
  for (let gy = 0; gy < h; gy += G) for (let gx = 0; gx < w; gx += G) {
    let any = false; for (let y = gy; y < gy + G && !any; y++) for (let x = gx; x < gx + G; x++) if (zid[y * w + x] >= 0) { any = true; break; }
    if (!any) continue;
    const X0 = gx - VX - M, Y0 = gy - VH - M;
    lab.fill(0); let nl = 0;
    const L = (x, y) => lab[(y - Y0) * BW + (x - X0)];
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
      if (!W.in(x, y) || L(x, y) || !passe(W.get(x, y))) continue;
      nl++; let n = 0; pile[n++] = x; pile[n++] = y; lab[(y - Y0) * BW + (x - X0)] = nl;
      while (n) {
        const cy = pile[--n], cx = pile[--n];
        for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const u = cx + a, v = cy + c;
          if (u < X0 || v < Y0 || u >= X0 + BW || v >= Y0 + BH || !W.in(u, v) || lab[(v - Y0) * BW + (u - X0)] || !passe(W.get(u, v)) || !pas(cx, cy, u, v)) continue;
          lab[(v - Y0) * BW + (u - X0)] = nl; pile[n++] = u; pile[n++] = v;
        }
      }
    }
    for (let py = gy; py < gy + G && py < h; py++) for (let px = gx; px < gx + G && px < w; px++) {
      const zp = zid[py * w + px]; if (zp < 0) continue;
      const lp = L(px, py);
      let vu = -1, qx = 0, qy = 0;
      for (let y = Math.max(0, py - VH); y <= Math.min(h - 1, py + VB) && vu < 0; y++) for (let x = Math.max(0, px - VX); x <= Math.min(w - 1, px + VX); x++) {
        const zq = zid[y * w + x]; if (zq < 0 || zq === zp || L(x, y) === lp || parEau(px, py, x, y)) continue;
        vu = zq; qx = x; qy = y; break;
      }
      if (vu < 0) continue;
      nf++;
      const cle = nom[zp] + ' → ' + nom[vu];
      if (!fautes.has(cle)) fautes.set(cle, { n: 0, ex: [px, py, qx, qy] });
      fautes.get(cle).n++;
      if (carte) cases.push([px, py, qx, qy]);
    }
  }
  console.log(`\nvues sur une autre zone : ${nf} cases (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  const L = [...fautes.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [k, v] of L.slice(0, detail ? 200 : 40)) console.log(`  ${String(v.n).padStart(5)}  ${k}  (ex. ${v.ex.join(',')})`);
  if (carte) fs.writeFileSync('/tmp/odyssee-vues.json', JSON.stringify(cases));
  ok(nf === 0, `${nf} cases d'où l'on voit une autre zone sans pouvoir la rejoindre`);
}
console.log(fails ? `\n${fails} échec(s)` : '\nvilles : tout est bon');
process.exit(fails ? 1 : 0);
