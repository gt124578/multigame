// tools/odyssee-acces.mjs — contrôle d'accès de la carte du dehors d'Odyssée :
//   node tools/odyssee-acces.mjs [--png dossier] [--json fichier] [--tout]
// Explore toute la région depuis Bourg-Aube avec toutes les capacités (grottes, maisons et bateau compris, world/acces.js)
// et liste :
//   1. les zones aménagées qu'on n'atteint jamais : chemins, sable, ponts, clairières, rives de lac, lieux, objets,
//      PNJ, portes, panneaux et décor posé (bancs, tonneaux…) ;
//   2. les cases atteintes trop près du bord de la carte (on y verrait le vide : 14 cases en largeur, 11 en hauteur) ;
//   3. les PNJ, dresseurs, panneaux et objets qui bouchent un passage étroit hors des villes ;
//   4. le rang (badges nécessaires) de chaque zone et ses objets ramassables.
// Code de sortie 1 s'il reste un problème des points 1 à 3 (hors villes, sauf --tout).
import { buildWorld } from '../odyssee/js/world/region.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import { rangs, rangAutour, JAMAIS, mers, sauvage as sauvageCase, MARGE_X, MARGE_Y } from '../odyssee/js/world/acces.js';
import { ponts } from '../odyssee/js/world/ponts.js';
import { RANG_ROUTES } from '../odyssee/js/world/bareme.js';
import { image, ecrirePNG, PAR_TYPE } from './odyssee-schema-commun.mjs';
import { writeFileSync, mkdirSync } from 'fs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TOUT = process.argv.includes('--tout');
const t0 = Date.now();
const { maps, towns, docks } = buildWorld();
const W = maps.monde, w = W.w, h = W.h;
console.log(`monde ${w} × ${h} construit en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const depart = { map: 'monde', x: towns.A.x + 5, y: towns.A.y + 7 };
const t1 = Date.now();
const RG = rangs(maps, docks, depart), r = RG.get('monde');
console.log(`exploration en ${Date.now() - t1} ms`);
// la case d'un PNJ compte comme atteinte si on se tient à côté
for (const n of W.npcs) { const i = n.y * w + n.x; if (r[i] === JAMAIS) r[i] = rangAutour(W, r, n.x, n.y); }
const mer = mers(W);
const vu = (x, y) => W.in(x, y) && r[y * w + x] !== JAMAIS;
const vuAutour = (x, y) => rangAutour(W, r, x, y) !== JAMAIS;
const zoneNom = (x, y) => W.zoneAt(x, y)?.name || '(sans nom)';
const enVille = (x, y) => { const z = W.zoneAt(x, y); return !!(z && (z.town || W.zones.some((q) => q.town && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1))); };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let problemes = 0;

/* ---------- 1. l'aménagé inatteignable ---------- */
const SOL = new Set([T.GRASS, T.TALL, T.FLOWER, T.DARKTALL, T.SNOW, T.ASH]);
const categorie = (x, y) => {
  const t = W.get(x, y);
  if (t === T.PATH || t === T.PAVE || t === T.STAIRS) return 'chemin';
  if (t === T.BRIDGE) return 'pont';
  if (sauvageCase(W, mer, x, y)) return 'nature';
  if (t === T.SAND) return 'sable';
  if (SOL.has(t)) {
    // rive de lac : un sol au bord de l'eau
    for (const [dx, dy] of N4) if (W.get(x + dx, y + dy) === T.WATER) return 'rive';
    return 'clairiere';
  }
  return null;
};
// composantes de cases aménagées jamais atteintes
const marque = new Int32Array(w * h).fill(-1), comps = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x; if (marque[i] >= 0 || r[i] !== JAMAIS || !categorie(x, y)) continue;
  const c = { cases: [], cats: {}, x0: x, y0: y, x1: x, y1: y }, q = [i]; marque[i] = comps.length;
  while (q.length) {
    const j = q.pop(), a = j % w, b = (j - a) / w, k = categorie(a, b);
    c.cases.push(j); c.cats[k] = (c.cats[k] || 0) + 1;
    c.x0 = Math.min(c.x0, a); c.y0 = Math.min(c.y0, b); c.x1 = Math.max(c.x1, a); c.y1 = Math.max(c.y1, b);
    for (const [dx, dy] of N4) { const u = a + dx, v = b + dy, n = v * w + u; if (W.in(u, v) && marque[n] < 0 && r[n] === JAMAIS && categorie(u, v)) { marque[n] = comps.length; q.push(n); } }
  }
  c.ville = enVille(Math.round((c.x0 + c.x1) / 2), Math.round((c.y0 + c.y1) / 2));
  comps.push(c);
}
// ce qui est posé dessus ou à côté : objets, PNJ, portes, panneaux, décor
const poses = [];
for (const it of W.items) if (!vuAutour(it.x, it.y)) poses.push(['objet', it.x, it.y, it.item + ' ' + it.id]);
for (const n of W.npcs) if (!vuAutour(n.x, n.y)) poses.push(['PNJ', n.x, n.y, n.id || n.name || n.sprite]);
for (const [k] of W.warps) { const [x, y] = k.split(',').map(Number); if (!vuAutour(x, y)) poses.push(['porte', x, y, '→ ' + W.warps.get(k).map]); }
for (const [k, s] of W.signs) { const [x, y] = k.split(',').map(Number); if (!vuAutour(x, y)) poses.push(['panneau', x, y, String(s).split('\n')[0]]); }
// objets cachés (rythme.js) : on les fouille depuis une case voisine atteinte
const caches = [...W.objects].filter(([, o]) => o.cache);
for (const [k, o] of caches) { const [x, y] = k.split(',').map(Number); if (!vuAutour(x, y)) poses.push(['objet caché', x, y, o.item + ' ' + o.id]); }
// décor posé : sauf la nature (arbres, palmiers, cactus, rochers) dans un fond de paysage sauvage
const NATUREL = /^(palm|cactus|rocher|pin|arbre|erable|cerisier|tree|pine|bush|souche|tronc)/;
for (const d of W.deco) if (d.x != null && W.get(d.x, d.y) === T.BLOCK && !vuAutour(d.x, d.y) && !NATUREL.test(d.k)) poses.push(['décor', d.x, d.y, d.k]);
for (const b of W.buildings) if (b.doorX != null && !vuAutour(b.doorX, b.doorY) && !vuAutour(b.doorX, b.doorY + 1)) poses.push(['bâtiment', b.x, b.y, b.modele || b.kind]);
// un « fond de paysage » peut rester hors d'atteinte : nature sauvage (désert, neige, plages de la mer) ; et l'on
// signale à part les petites trouées dans la forêt (5 cases au plus, sans chemin ni pont)
const sauvage = (c) => (!c.cats.chemin && !c.cats.pont && c.cases.length <= 5) || Object.keys(c.cats).every((k) => k === 'nature');
const aRegler = comps.filter((c) => (TOUT || !c.ville) && !sauvage(c));
const resume = {}; for (const c of aRegler) for (const [k, n] of Object.entries(c.cats)) resume[k] = (resume[k] || 0) + n;
console.log(`\n1. AMÉNAGÉ HORS D'ATTEINTE : ${aRegler.length} morceaux (${Object.entries(resume).map(([k, n]) => `${n} cases de ${k}`).join(', ') || 'rien'})` +
  `, ${comps.filter((c) => c.ville).length} dans les villes${TOUT ? '' : ' (non comptés)'}, ${comps.filter(sauvage).length} morceaux de nature sauvage tolérés (${comps.filter(sauvage).reduce((s, c) => s + c.cases.length, 0)} cases)`);
aRegler.sort((a, b) => b.cases.length - a.cases.length);
for (const c of aRegler.slice(0, 60)) console.log(`   ${String(c.cases.length).padStart(5)} cases ${JSON.stringify(c.cats)} en ${c.x0},${c.y0} → ${c.x1},${c.y1} (${zoneNom(c.x0, c.y0)}${c.ville ? ', ville' : ''})`);
if (aRegler.length > 60) console.log(`   … et ${aRegler.length - 60} autres`);
const posesR = poses.filter(([, x, y]) => TOUT || !enVille(x, y));
console.log(`   objets cachés : ${caches.length} (${caches.filter(([k]) => { const [x, y] = k.split(',').map(Number); return vuAutour(x, y); }).length} qu'on peut fouiller)`);
console.log(`   posés hors d'atteinte : ${posesR.length}`);
for (const [k, x, y, q] of posesR.slice(0, 60)) console.log(`     ${k} ${q} en ${x},${y} (${zoneNom(x, y)})`);
problemes += aRegler.length + posesR.length;

/* ---------- 2. les bords ---------- */
const MX = MARGE_X, MY = MARGE_Y, bords = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r[y * w + x] !== JAMAIS && (x < MX || y < MY || x >= w - MX || y >= h - MY)) bords.push([x, y]);
console.log(`\n2. BORDS : ${bords.length} cases atteintes à moins de ${MX} cases (côtés) ou ${MY} cases (haut, bas) du bord`);
{ const parZone = new Map(); for (const [x, y] of bords) { const k = zoneNom(x, y) + (W.get(x, y) === T.WATER ? ' (eau)' : ''); const e = parZone.get(k) || { n: 0, x0: x, y0: y, x1: x, y1: y }; e.n++; e.x0 = Math.min(e.x0, x); e.y0 = Math.min(e.y0, y); e.x1 = Math.max(e.x1, x); e.y1 = Math.max(e.y1, y); parZone.set(k, e); }
  for (const [k, e] of parZone) console.log(`   ${String(e.n).padStart(6)} ${k} : ${e.x0},${e.y0} → ${e.x1},${e.y1}`); }
problemes += bords.length;

/* ---------- 3. ce qui bouche un passage ---------- */
// on compare l'exploration où PNJ, objets et panneaux bloquent à celle où on les traverse : ce qui n'est atteint que
// dans la seconde est coupé par l'un d'eux
const libre = rangs(maps, docks, depart, { bloquants: false, objets: false, panneaux: true }).get('monde');
const serre = rangs(maps, docks, depart, { bloquants: true, objets: true, panneaux: false }).get('monde');
const coupes = [];
// les gardes et les PNJ d'un moment de l'histoire (when, hideIf : un sbire qui barre la route le temps d'une quête) ont le droit
const occupants = [...W.npcs.filter((n) => !n.gate && !n.when && !n.hideIf).map((n) => ['PNJ', n.x, n.y, n.id || n.sprite, n]), ...W.items.map((i) => ['objet', i.x, i.y, i.item + ' ' + i.id, i]),
  ...[...W.signs.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return ['panneau', x, y, String(W.signs.get(k)).split('\n')[0]]; })];
const coupe = new Uint8Array(w * h); let nCoupe = 0;
const occupe = new Set(occupants.map(([, x, y]) => y * w + x));
for (let i = 0; i < w * h; i++) if (libre[i] !== JAMAIS && serre[i] === JAMAIS && walkable(W.t[i]) && !occupe.has(i)) { coupe[i] = 1; nCoupe++; }
for (const [k, x, y, q] of occupants) {
  if (!TOUT && enVille(x, y)) continue;
  // l'occupant touche une case coupée et une case atteinte : c'est lui qui ferme le passage
  let c1 = false, c2 = false;
  for (const [dx, dy] of N4) { const u = x + dx, v = y + dy; if (!W.in(u, v)) continue; const n = v * w + u; if (coupe[n]) c1 = true; else if (serre[n] !== JAMAIS) c2 = true; }
  if (c1 && c2) coupes.push([k, x, y, q]);
}
// et les rangs : un PNJ qui oblige à un détour qui coûte des badges (une case atteinte plus tard que sans lui)
console.log(`\n3. PASSAGES BOUCHÉS (hors villes) : ${coupes.length} occupants coupent ${nCoupe} cases`);
for (const [k, x, y, q] of coupes) console.log(`   ${k} ${q} en ${x},${y} (${zoneNom(x, y)})`);
problemes += coupes.length;

/* ---------- 4. rangs des zones et objets ---------- */
console.log('\n4. RANG DES ZONES (badges pour y entrer) ET LEURS OBJETS');
const zones = new Map();
for (const it of W.items) {
  const z = zoneNom(it.x, it.y), rg = rangAutour(W, r, it.x, it.y);
  const e = zones.get(z) || { rang: JAMAIS, objets: [] }; e.objets.push([rg, it.item + (it.qty > 1 ? '×' + it.qty : '')]); zones.set(z, e);
}
for (const z of W.zones) {
  if (!z.name || z.sea) continue;
  let m = JAMAIS; for (let y = Math.max(0, z.y0); y <= Math.min(h - 1, z.y1); y += 1) for (let x = Math.max(0, z.x0); x <= Math.min(w - 1, z.x1); x += 1) { const v = r[y * w + x]; if (v < m && W.zoneAt(x, y) === z) m = v; }
  const e = zones.get(z.name) || { rang: JAMAIS, objets: [] }; e.rang = Math.min(e.rang, m); zones.set(z.name, e);
}
const lignes = [...zones].sort((a, b) => a[1].rang - b[1].rang);
for (const [z, e] of lignes) console.log(`   ${String(e.rang === JAMAIS ? '–' : e.rang).padStart(2)}  ${z.padEnd(26)} ${e.objets.map(([rg, q]) => rg === e.rang ? q : `${q}[${rg === JAMAIS ? '–' : rg}]`).join(', ')}`);

/* ---------- 5. ponts ---------- */
{ const P = ponts(W).filter((p) => !p.ravin), larg = (p) => (p.sens === 'ew' ? p.y1 - p.y0 + 1 : p.x1 - p.x0 + 1);
  // en escalier : une voie (rangée d'un pont qu'on traverse d'ouest en est, colonne sinon) coupée en morceaux, ou des
  // voies décalées de plus d'une case à un bout
  const irr = P.filter((p) => {
    const S = new Set(p.cases.map(([x, y]) => x + ',' + y)), ew = p.sens === 'ew', voies = new Map();
    for (const [x, y] of p.cases) { const k = ew ? y : x, a = ew ? x : y, v = voies.get(k) || [1e9, -1e9, 0]; v[0] = Math.min(v[0], a); v[1] = Math.max(v[1], a); v[2]++; voies.set(k, v); }
    const L = [...voies.values()];
    return L.some(([a, b, n]) => b - a + 1 !== n) || L.some(([a, b]) => Math.abs(a - L[0][0]) > 1 || Math.abs(b - L[0][1]) > 1);
  });
  const voisins = P.filter((p) => P.some((q) => q !== p && q.x0 <= p.x1 + 3 && q.x1 >= p.x0 - 3 && q.y0 <= p.y1 + 3 && q.y1 >= p.y0 - 3));
  const larges = P.filter((p) => larg(p) > 2);
  console.log(`\n5. PONTS : ${P.length} ponts au-dessus de l'eau ; ${irr.length} en escalier, ${voisins.length} collés à un autre, ${larges.length} de plus de deux cases de large` + (W.ponts ? ` (remis au propre à la construction : ${W.ponts.refaits} refaits, ${W.ponts.retires} quais retirés, ${W.ponts.gardes} gardés)` : ''));
  for (const p of [...new Set([...irr, ...voisins, ...larges])]) console.log(`   ${p.sens} ${p.x0},${p.y0} → ${p.x1},${p.y1} (${zoneNom(p.x0, p.y0)})`); }

/* ---------- 6. rang des routes (barème des objets) ---------- */
{ const par = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (W.get(x, y) !== T.PATH) continue; const z = W.zoneAt(x, y); if (!z?.route || z.town) continue; const v = r[y * w + x]; if (v === JAMAIS) continue; if (!par.has(z.route)) par.set(z.route, []); par.get(z.route).push(v); }
  const ecarts = [];
  for (const [k, L] of par) { L.sort((a, b) => a - b); const med = L[Math.floor(L.length / 2)]; if (RANG_ROUTES[k] !== undefined && RANG_ROUTES[k] !== med) ecarts.push(`${k} : ${RANG_ROUTES[k]} dans bareme.js, ${med} mesuré`); }
  console.log(`\n6. RANG DES ROUTES (bareme.js) : ${ecarts.length ? ecarts.join(' ; ') : 'conforme'}`); }

/* ---------- images ---------- */
const dos = arg('--png');
if (dos) {
  mkdirSync(dos, { recursive: true });
  const im = image(w, h), put = (x, y, [R, G, B]) => { const p = (y * w + x) * 3; im.d[p] = R; im.d[p + 1] = G; im.d[p + 2] = B; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = PAR_TYPE.get(W.get(x, y))?.rgb || [255, 0, 255], i = y * w + x, f = r[i] === JAMAIS ? 0.45 : 1;
    put(x, y, c.map((v) => Math.round(v * f)));
  }
  for (const c of comps) for (const j of c.cases) put(j % w, (j - j % w) / w, sauvage(c) ? [255, 160, 0] : [255, 0, 0]);
  for (const [x, y] of bords) put(x, y, [255, 0, 255]);
  for (let i = 0; i < w * h; i++) if (coupe[i]) put(i % w, (i - i % w) / w, [255, 255, 0]);
  ecrirePNG(dos + '/acces.png', im);
  console.log(`\nimage : ${dos}/acces.png (rouge : aménagé hors d'atteinte, orange : trouée tolérée, magenta : trop près du bord, jaune : coupé par un occupant ; assombri : jamais atteint)`);
}
const js = arg('--json');
if (js) writeFileSync(js, JSON.stringify({ comps: aRegler.map((c) => ({ n: c.cases.length, cats: c.cats, box: [c.x0, c.y0, c.x1, c.y1], zone: zoneNom(c.x0, c.y0) })), poses: posesR, bords: bords.length, coupes }, null, 1));
console.log(`\n${problemes ? problemes + ' problème(s)' : 'aucun problème'}`);
process.exit(problemes ? 1 : 0);
