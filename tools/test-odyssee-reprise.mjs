// tools/test-odyssee-reprise.mjs — une partie reprend toujours sur une case d'où l'on peut repartir (odyssee/js/core/reprise.js) :
// carte disparue, case devenue un mur, poche refermée, et aucune fausse alerte sur les vraies positions du jeu (portes de la
// région, entrées des intérieurs, Centres de soins, cases d'arrivée des téléporteurs).
// Usage : node tools/test-odyssee-reprise.mjs
import { buildWorld } from '../odyssee/js/world/region.js';
import { reprendre, enfermee } from '../odyssee/js/core/reprise.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';

const W = buildWorld();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('ÉCHEC :', msg); } else console.log('  ✓ ' + msg); };
const base = () => ({ map: 'monde', x: 0, y: 0, dir: 'down', surf: false, lastCenter: { map: W.towns.D.centerId, x: 6, y: 5, dir: 'up' } });
const M = W.maps.monde;

// 1. carte qui n'existe plus : au dernier Centre de soins
{ const s = { ...base(), map: 'cime:bighouse999', x: 3, y: 3 }; const r = reprendre(W, s); ok(r === 'carte' && s.map === W.towns.D.centerId, 'carte disparue : reprise au dernier Centre de soins'); }
// … et sans Centre connu : au départ de l'aventure
{ const s = { ...base(), map: 'nulle-part', lastCenter: { map: 'disparu', x: 1, y: 1 } }; reprendre(W, s); ok(s.map === W.start.map, 'sans Centre connu : la maison du départ'); }
// 2. case devenue un mur (un arbre de la forêt, au bord d'une route) : la case libre la plus proche
{
  const [dx, dy] = [...M.warps.keys()].map((k) => k.split(',').map(Number)).find(([x, y]) => M.get(x, y) === T.DOOR);
  let mur = null; for (let r = 2; r < 40 && !mur; r++) for (const [a, b] of [[r, 0], [-r, 0], [0, -r]]) if (M.get(dx + a, dy + b) === T.TREE) { mur = [dx + a, dy + b]; break; }
  const s = { ...base(), x: mur[0], y: mur[1] }; const r = reprendre(W, s);
  ok(r === 'mur' && s.map === 'monde' && walkable(M.get(s.x, s.y)) && Math.abs(s.x - mur[0]) + Math.abs(s.y - mur[1]) < 30, `case devenue un arbre (${mur}) : reprise juste à côté (${s.x},${s.y})`);
}
// 3. poche refermée : une clairière d'une case au cœur d'une forêt (on la creuse sur une copie de la case)
{
  let p = null;
  for (let y = 10; y < M.h - 10 && !p; y += 7) for (let x = 10; x < M.w - 10; x += 7) {
    let foret = true; for (let b = -2; b <= 2 && foret; b++) for (let a = -2; a <= 2; a++) if (M.get(x + a, y + b) !== T.TREE) { foret = false; break; }
    if (foret) { p = [x, y]; break; }
  }
  const avant = M.get(p[0], p[1]); M.set(p[0], p[1], T.GRASS);
  const s = { ...base(), x: p[0], y: p[1] }; const r = reprendre(W, s);
  M.set(p[0], p[1], avant);
  ok(r === 'poche' && s.map === W.towns.D.centerId, `poche refermée (${p}) : reprise au dernier Centre de soins`);
}
// 4. pas de fausse alerte : devant chaque porte de la région, à l'arrivée de chaque téléporteur, dans chaque Centre
{
  let n = 0, faux = [];
  for (const m of Object.values(W.maps)) for (const [k, w] of m.warps) {
    const d = W.maps[w.map]; if (!d || !walkable(d.get(w.x, w.y))) continue;
    n++;
    const s = { ...base(), map: w.map, x: w.x, y: w.y };
    const r = reprendre(W, s); if (r) faux.push(`${m.id} ${k} → ${w.map} ${w.x},${w.y} (${r})`);
  }
  ok(!faux.length, `${n} arrivées de portes et téléporteurs : aucune reprise inutile${faux.length ? ' — ' + faux.slice(0, 6).join(' | ') : ''}`);
}
// 5. sur l'eau en surf : on ne bouge pas
{ let e = null; for (let i = 0; i < M.t.length && !e; i += 97) if (M.t[i] === T.WATER) e = [i % M.w, (i / M.w) | 0]; const s = { ...base(), x: e[0], y: e[1], surf: true }; ok(reprendre(W, s) === null && s.x === e[0], 'en surf sur l\'eau : la partie reprend sur place'); }
// 6. coût borné : enfermee sur une grande prairie s'arrête vite
{ const t0 = performance.now(); for (let i = 0; i < 200; i++) enfermee(M, W.towns.A?.x ?? 100, W.towns.A?.y ?? 100); ok(performance.now() - t0 < 2000, 'enfermee : 200 appels en moins de 2 s'); }

console.log(fails ? `${fails} échec(s)` : 'Reprise des parties : OK');
process.exit(fails ? 1 : 0);
