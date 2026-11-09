// tools/odyssee-troncons.mjs — coupe chaque route, grotte et île d'Odyssée en tronçons de 15 Pokémon
// (odyssee/js/data/troncons.js). Règles, du premier lieu sauvage (Route 1) au dernier (Grotte Victoire) :
//  - tronçon 1 d'un lieu : 15 Pokémon tirés de la table de la zone (les fréquents ont plus de chances, 2 places
//    réservées à des Pokémon rares) ;
//  - tronçon suivant : les 5 plus fréquents du tronçon d'avant restent, mais ne pèsent plus que 20 % à eux cinq ;
//  - dès le tronçon 3 : 1 ou 2 Pokémon de l'avant-dernier tronçon reviennent (3,5 % chacun) ;
//  - le reste est neuf : jamais vu depuis Bourg-Aube tant que la table en a encore ;
//  - les niveaux montent d'un tronçon à l'autre, entre le plus bas et le plus haut de la table du lieu.
// Un tronçon de route fait environ 60 cases de chemin. Un lieu absent de la carte (selon la branche) est sauté. Usage : node tools/odyssee-troncons.mjs [rapport.json]
globalThis.ODYSSEE_SANS_TRONCONS = true;   // lire les tables de départ, pas celles déjà coupées
const { buildWorld } = await import('../odyssee/js/world/region.js');
const { SPECIES } = await import('../odyssee/js/data/species.js');
const fs = await import('node:fs');
const out = new URL('../odyssee/js/data/troncons.js', import.meta.url);

const w = buildWorld(), W = w.maps.monde;
const N = 15, CARRY = 5, CARRY_SHARE = 20, BACK_SHARE = 3.5, RARE = 1.5, CAP = 18, PAS = 60;
const flat = (x) => Math.pow(x, 0.6);
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const nm = (sp) => SPECIES[sp]?.n || String(sp);

const R = (id) => ['route', id], M = (id, n) => ['map', id, n], Z = (name, n) => ['zone', name, n];
const LIEUX = [
  ['Route 1', [R('r1')]], ['Route 2', [R('r2')]], ['Bois Murmure', [R('bois')]],
  ['Mine de Pierrefort', [M('mine1', 1), M('mine2', 1), M('mine3', 1)]], ['Route 3', [R('r3'), R('r3e')]], ['Grotte des Crêtes', [M('cretes', 2), M('cretes2', 1)]],
  ['Grotte Lunaire', [M('grotte', 2)]], ['Grotte du Col', [M('col', 2), M('col2', 1)]],
  ['Route 4', [R('r4')]], ['Lac Miroir', [M('lac', 2)]], ['Île Orageuse', [R('orage1'), R('orage2')]],
  ['Route 5', [R('r5')]], ['Sentier des Pins', [R('grue1')]], ['Chemin du Brasier', [R('grue2')]],
  ['Route 6', [R('r6')]], ['Jardin des Songes', [M('jardin', 2)]], ['Forêt des Torii', [R('torii')]],
  ['Route 7', [R('r7')]], ['Route 10', [R('r10')]], ['Île de Granit', [Z('Île de Granit', 2)]],
  ['Île Givrée', [R('givre1'), R('givre2'), Z('Mont Givré', 1)]], ['Grotte des Tourbillons', [M('tourbillons', 2)]], ['Grotte des Marées', [M('marees', 2)]],
  ["Route 11 et Forêt d'Écaille", [R('r11'), R('r12')]],
  ['Route 13', [R('r13')]], ['Route 14', [R('r14')]], ['Grotte des Mesas', [M('mesas', 2)]], ['Route 15', [R('r15')]], ['Île du Magma', [M('magma', 2)]],
  ['Route 16', [R('r16')]], ['Grotte des Sables', [M('sables', 2), M('sables2', 1)]], ['Caverne du Magma', [M('magma:caverne', 2)]], ['Route 17', [R('r17')]], ['Route 18', [R('r18')]], ['Route 19', [R('r19')]],
  ['Route 20', [R('r20')]], ['Route Victoire', [R('r9'), R('r9b')]], ['Grotte Victoire', [M('victoire', 3)]],
];
const routeLen = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; };
function part([kind, id, n]) {
  if (kind === 'route') {
    const r = w.routes.find((q) => q.id === id), z = W.zones.find((q) => q.route === id && q.enc);
    if (!r || !z) return null;
    const L = routeLen(r.pts);
    return { key: id, enc: z.enc, n: L < 45 ? 1 : Math.max(2, Math.round(L / PAS)), label: (i, k) => (k > 1 ? 'tronçon ' + (i + 1) : '') };
  }
  if (kind === 'map') {
    const m = w.maps[id]; const enc = m?.encounter || m?.zones.find((z) => z.enc)?.enc;
    if (!enc) return null;
    return { key: 'map:' + id, enc, n, name: m.name };
  }
  const z = W.zones.find((q) => q.name === id && q.enc); if (!z) return null;
  return { key: 'zone:' + id, enc: z.enc, n, name: id };
}

const seenN = new Set(), TR = {}, rapport = [], lieux = [];
for (const [lieu, parts0] of LIEUX) {
  const parts = parts0.map(part).filter(Boolean);
  if (!parts.length) continue;
  const pool = new Map(); for (const p of parts) for (const e of p.enc) if (!pool.has(e[0])) pool.set(e[0], e);
  const enc = [...pool.values()];
  const lo = Math.min(...enc.map((e) => e[1])), hi = Math.max(...enc.map((e) => e[2]));
  const n = parts.reduce((a, p) => a + p.n, 0);
  const secs = [], usedHere = new Set();
  const pick = (k, excl, rares) => {
    const res = [];
    for (const pass of [0, 1, 2]) {   // 0 : jamais vus ; 1 : vus ailleurs avant ; 2 : déjà sortis plus tôt dans ce lieu
      const taken = () => new Set([...excl, ...res].map(nm));
      let cand = enc.filter((e) => !taken().has(nm(e[0])) && (pass === 2 || !usedHere.has(e[0])) && (pass >= 1 || !seenN.has(nm(e[0]))));
      while (res.length < k && cand.length) {
        let g;
        if (res.length >= k - 2 && cand.length > 3) {   // les deux dernières places : un rare (moitié la moins fréquente)
          const s = [...cand].sort((p, q) => p[3] - q[3]).slice(0, Math.ceil(cand.length / 2));
          g = s[Math.floor(rnd() * s.length)][0]; rares.add(g);
        } else {
          const s = cand.reduce((a, e) => a + e[3], 0); let r = rnd() * s, i = 0;
          for (; i < cand.length - 1; i++) { r -= cand[i][3]; if (r <= 0) break; }
          g = cand[i][0];
        }
        res.push(g); cand = cand.filter((e) => nm(e[0]) !== nm(g));
      }
      if (res.length >= k) break;
    }
    return res;
  };
  for (let i = 0; i < n; i++) {
    const wd = hi - lo >= 4 ? 2 : 1, a = n === 1 ? lo : Math.round(lo + (hi - wd - lo) * i / (n - 1)), b = n === 1 ? hi : a + wd;
    const prev = secs[i - 1], prev2 = secs[i - 2];
    const carry = prev ? [...prev.rows].sort((p, q) => q.p - p.p).slice(0, CARRY) : [];
    const back = [];
    const excl = new Set(carry.map((r) => r.sp));
    if (prev2) {
      const ps = new Set(prev.rows.map((r) => r.sp));
      const c2 = prev2.rows.filter((r) => !ps.has(r.sp) && !r.back);
      const k = Math.min(c2.length, 1 + Math.floor(rnd() * 2));
      for (let j = 0; j < k; j++) back.push(c2.splice(Math.floor(rnd() * c2.length), 1)[0]);
      back.forEach((r) => excl.add(r.sp));
    }
    const rares = new Set();
    const fresh = pick(N - carry.length - back.length, excl, rares);
    const tags = new Map(fresh.map((sp) => [sp, rares.has(sp) ? 'rare' : usedHere.has(sp) ? 'reprise' : seenN.has(nm(sp)) ? 'deja' : 'nouveau']));
    fresh.forEach((sp) => { usedHere.add(sp); seenN.add(nm(sp)); });
    const fr = fresh.filter((sp) => !rares.has(sp)), fq = fresh.filter((sp) => rares.has(sp));
    const share = 100 - (carry.length ? CARRY_SHARE : 0) - back.length * BACK_SHARE - fq.length * RARE;
    const fw = fr.map((sp) => flat(pool.get(sp)[3])), fs_ = fw.reduce((x, y) => x + y, 0) || 1, cw = carry.reduce((x, r) => x + r.p, 0) || 1;
    const rows = [
      ...carry.map((r) => ({ sp: r.sp, p: Math.min(r.p / 2, r.p / cw * CARRY_SHARE), tag: 'moins' })),
      ...back.map((r) => ({ sp: r.sp, p: BACK_SHARE, tag: 'retour', back: true })),
      ...fr.map((sp, j) => ({ sp, p: fw[j] / fs_ * share, tag: tags.get(sp) })),
      ...fq.map((sp) => ({ sp, p: RARE, tag: 'rare' })),
    ];
    for (let it = 0; it < 4; it++) {   // au moins 1 %, au plus 18 %, total 100 (les nouveaux absorbent l'écart)
      rows.forEach((r) => (r.p = Math.min(CAP, Math.max(1, r.p))));
      const t0 = rows.reduce((x, r) => x + r.p, 0), fN = rows.filter((q) => !['moins', 'retour', 'rare'].includes(q.tag)).reduce((x, q) => x + q.p, 0);
      if (fN) rows.forEach((r) => { if (!['moins', 'retour', 'rare'].includes(r.tag)) r.p *= 1 + (100 - t0) / fN; });
    }
    rows.sort((p, q) => q.p - p.p);
    secs.push({ a, b, rows });
  }
  lieux.push({ lieu, parts, enc, secs });
}
// un Pokémon de la table d'un lieu qui n'est tombé dans aucun tronçon prend la place d'un rare déjà montré ailleurs
{
  const vus = new Map();
  for (const L of lieux) for (const s of L.secs) for (const r of s.rows) vus.set(r.sp, (vus.get(r.sp) || 0) + 1);
  for (const L of lieux) for (const [sp] of L.enc) {
    if (vus.has(sp) || [...vus.keys()].some((q) => nm(q) === nm(sp))) continue;
    for (const s of [...L.secs].reverse()) {
      const r = s.rows.find((q) => q.tag === 'rare' && vus.get(q.sp) > 1) || s.rows.find((q) => q.tag === 'deja' || q.tag === 'reprise');
      if (!r) continue;
      vus.set(r.sp, vus.get(r.sp) - 1); r.sp = sp; r.tag = 'rare'; vus.set(sp, 1); seenN.add(nm(sp)); break;
    }
  }
}
for (const { lieu, parts, enc, secs } of lieux) {
  // répartit les tronçons entre les morceaux du lieu (deux branches d'une route, les étages d'une mine…)
  let i0 = 0;
  for (const p of parts) {
    const mine = secs.slice(i0, i0 + p.n); i0 += p.n;
    TR[p.key] = mine.map((s) => s.rows.map((r) => [r.sp, s.a, s.b, Math.round(r.p * 10) / 10]));
  }
  rapport.push({ n: lieu, pool: enc.length, s: secs.map((s, i) => ({ a: s.a, b: s.b, e: s.rows.map((r) => [nm(r.sp), Math.round(r.p * 10) / 10, r.tag, SPECIES[r.sp]?.t || []]) })) });
}
const lignes = Object.entries(TR).map(([k, secs]) => `  ${JSON.stringify(k)}: [\n${secs.map((s) => '    ' + JSON.stringify(s)).join(',\n')}\n  ]`);
fs.writeFileSync(out, `// odyssee/js/data/troncons.js — rencontres sauvages tronçon par tronçon (généré par tools/odyssee-troncons.mjs, ne pas modifier à la main)
// clé : identifiant de route, « map:<carte> » ou « zone:<nom> » ; chaque tronçon : [espèce, niveau min, niveau max, chance en %]
export const TRONCONS = {
${lignes.join(',\n')}
};
`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rapport));
console.log(Object.keys(TR).length, 'morceaux,', rapport.reduce((a, l) => a + l.s.length, 0), 'tronçons,', seenN.size, 'Pokémon différents');
