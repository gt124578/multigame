// tools/test-odyssee-coherence.mjs — ce qu'on voit et ce qu'on touche disent la même chose, et la carte est la même partout.
//  - aucun bâtiment traversable : toutes les cases de son emprise bloquent (sauf porte, porche et cases « libres » du modèle) ;
//  - aucune porte ni téléporteur ne dépose le joueur dans un mur, un meuble ou une carte qui n'existe pas ;
//  - chaque porte du dehors mène à un intérieur dont la sortie ramène devant elle ;
//  - aucun habitant ni objet posé dans un mur ;
//  - deux constructions de suite donnent la même carte (pas d'état caché entre deux appels de buildWorld) ;
//  - world/ n'emploie ni Math.random, ni Math.sin / Math.cos, ni sort(() => r() - 0.5) (voir mapgen.js) ; les autres fonctions
//    de Math dont le résultat peut varier d'un moteur à l'autre (atan2, pow, hypot, exp, log…) sont signalées sans échec.
// Usage : node tools/test-odyssee-coherence.mjs [--vite]   (--vite : une seule construction)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../odyssee/js/world/region.js';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import { empreinte, differences } from './odyssee-empreinte.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, msg, ex = []) => { if (c) console.log('  ✓ ' + msg); else { fails++; console.log('  ✗ ' + msg + (ex.length ? ' — ' + ex.slice(0, 8).join(' | ') : '')); } };

const W = buildWorld();
const bat = [], murs = [], sans = [], loin = [], pnj = [], obj = [];
for (const m of Object.values(W.maps)) {
  for (const b of m.buildings) {
    const lib = new Set((b.libres || []).map(([i, j]) => i + ',' + j)); let n = 0;
    for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) {
      const x = b.x + i, y = b.y + j;
      if (!m.in(x, y) || lib.has(i + ',' + j) || (y === b.doorY && (x === b.doorX || x === b.door2X))) continue;
      if (walkable(m.get(x, y))) n++;
    }
    if (n) bat.push(`${m.id} ${b.kind}${b.modele ? '/' + b.modele : ''} ${b.x},${b.y} (${n} case(s))`);
  }
  for (const [k, w] of m.warps) {
    const d = W.maps[w.map];
    if (!d) { murs.push(`${m.id} ${k} → ${w.map} (carte inconnue)`); continue; }
    if (!d.in(w.x, w.y) || !walkable(d.get(w.x, w.y))) murs.push(`${m.id} ${k} → ${w.map} ${w.x},${w.y}`);
    if (m.id === 'monde' && d !== m && d.floor !== 'cave') {
      const [x, y] = k.split(',').map(Number), back = [...d.warps].filter(([, v]) => v.map === 'monde');
      if (!back.length) sans.push(`${k} → ${w.map}`);
      else if (Math.min(...back.map(([, v]) => Math.abs(v.x - x) + Math.abs(v.y - y))) > 3) loin.push(`${k} → ${w.map}`);
    }
  }
  for (const n of m.npcs) { const t = m.get(n.x, n.y); if (!walkable(t) && t !== T.BLOCK) pnj.push(`${m.id} ${n.id} ${n.x},${n.y}`); }
  for (const it of m.items) if (!walkable(m.get(it.x, it.y))) obj.push(`${m.id} ${it.id} ${it.x},${it.y}`);
}
ok(!bat.length, 'aucun bâtiment traversable', bat);
ok(!murs.length, 'aucune porte ni téléporteur ne dépose le joueur dans un mur', murs);
ok(!sans.length && !loin.length, 'chaque intérieur ramène devant sa porte', sans.concat(loin));
ok(!pnj.length, 'aucun habitant dans un mur', pnj);
ok(!obj.length, 'aucun objet dans un mur', obj);

if (!process.argv.includes('--vite')) {
  const d = differences(empreinte(W), empreinte(buildWorld()));
  ok(!d.length, 'deux constructions de suite donnent la même carte', d);
}

// le code de la carte : rien qui dépende du moteur JavaScript
const dir = path.join(ROOT, 'odyssee/js/world'), interdits = [], douteux = new Map();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const lignes = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lignes.forEach((l, i) => {
    if (/^\s*(\*|\/\*)/.test(l)) return;   // ligne de commentaire
    const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (/Math\.(random|sin|cos)\s*\(/.test(code) && !/r = Math\.random/.test(code)) interdits.push(`${f}:${i + 1}`);
    if (/\.sort\(\s*\(\)\s*=>/.test(code)) interdits.push(`${f}:${i + 1} (sort au hasard)`);
    for (const fn of code.match(/Math\.(atan2|atan|tan|asin|acos|pow|hypot|exp|log|cbrt|sinh|cosh|tanh)\b/g) || []) douteux.set(fn, (douteux.get(fn) || []).concat(`${f}:${i + 1}`));
  });
}
ok(!interdits.length, 'world/ : ni Math.random, ni Math.sin / cos, ni tri au hasard', interdits);
if (douteux.size) console.log('  ! à surveiller (résultat qui peut varier d\'un moteur à l\'autre) : ' + [...douteux].map(([k, L]) => `${k} ×${L.length}`).join(', '));

console.log(fails ? `${fails} échec(s)` : 'Cohérence de la carte : OK');
process.exit(fails ? 1 : 0);
