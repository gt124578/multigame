// Odyssée — PixelForge : exporte la grille de terrain d'une carte du jeu (codes T) en JSON, pour terrain2.py.
//   node tools/pixelforge/dump-carte.mjs monde /tmp/monde.json
import { buildWorld } from '../../odyssee/js/world/region.js';
import { writeFileSync } from 'fs';
const [id = 'monde', out = '/tmp/monde.json'] = process.argv.slice(2);
const w = buildWorld(), maps = w.maps || w, m = maps[id];
if (!m) { console.error('carte inconnue :', id, '— cartes :', Object.keys(maps).slice(0, 40).join(' ')); process.exit(1); }
writeFileSync(out, JSON.stringify({ id, w: m.w, h: m.h, t: Array.from(m.t) }));
console.log(`${id} : ${m.w} x ${m.h} → ${out}`);
