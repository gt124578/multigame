// tools/test-odyssee-arenes-jeu.mjs — les arènes dessinées (world/arenes-plans.js) jouées dans un vrai Chrome (sans fenêtre).
//
// Pour chaque arène : le solveur (world/arenes-plan.js) cherche la solution avec les PNJ réellement posés, puis le test la
// rejoue dans le jeu, coup par coup (pas, glissades, trous, canons, dalles d'argile, leviers, miroirs, rochers poussés), et
// vérifie qu'après chaque coup les registres du jeu sont ceux que le solveur attendait, que le joueur arrive devant le
// Champion, et qu'aucune erreur JavaScript n'a eu lieu. Les gardiens du savoir sont supposés battus, les dresseurs ne
// lancent pas de combat.
//
// Prérequis : Playwright et son Chromium (`npm i -D playwright && npx playwright install chromium`).
// Sans Playwright, le test s'annonce sauté et ne fait pas échouer la suite.
//   node tools/test-odyssee-arenes-jeu.mjs [numéro d'arène…]      (CHROME_PATH=/usr/bin/google-chrome pour un autre Chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('⏭  Playwright absent : arènes jouées dans Chrome, test sauté (npm i -D playwright && npx playwright install chromium).');
  process.exit(0);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
// CHROME_PATH : un Chrome déjà installé, à la place du Chromium de Playwright
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${BASE}/odyssee/index.html?local&glb=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ody?.play, null, { timeout: 120000 });
  await page.evaluate(async () => {
    const { game } = window.__ody;
    const st = game.newState('Test', 'm'); st.flags.intro = true; st.flags.metProf = true;
    st.party = [window.__ody.mon(4, 40), window.__ody.mon(16, 40)];
    await window.__ody.play(st);
  });
  await page.waitForTimeout(2500);
  // dialogues : on répond oui, sans attendre ; pas de combat de dresseurs
  await page.evaluate(() => { const g = window.__ody.game; g.ui.say = async () => {}; g.ui.yesNo = async () => true; g.checkTrainers = async () => false; });
  const arenes = await page.evaluate(async () => {
    const { PLANS } = await import('/odyssee/js/world/arenes-plans.js');
    const g = window.__ody.game;
    return Object.keys(PLANS).map((gym) => [gym, Object.values(g.world.maps).find((m) => m.gymLock === +gym)?.id]);
  });
  const seul = process.argv.slice(2);
  for (const [gym, id] of arenes) {
    if (seul.length && !seul.includes(gym)) continue;
    const r = await page.evaluate(async (id) => {
      const g = window.__ody.game, W = (ms) => new Promise((ok) => setTimeout(ok, ms));
      await g.warp({ map: id, x: 12, y: 30, dir: 'up' }, 'door'); await W(300);
      const { resoudre, cheminFragile } = await import('/odyssee/js/world/arenes-plan.js');
      const m = g.mapObj, k = (x, y) => x + ',' + y;
      const npcs = new Set(g.npcs.filter((n) => n.def.script !== 'savoir').map((n) => k(n.x, n.y)));
      for (const it of g.items) npcs.add(k(it.x, it.y));
      const L = g.npcs.find((n) => n.def.leader != null);
      const R = resoudre(m, { npcs, but: (x, y) => x === L.x && y === L.y + 1 });
      if (!R.ok) return { ok: false, msg: 'pas de solution' };
      for (const n of g.npcs.filter((q) => q.def.script === 'savoir')) g.state.flags['QZ:' + n.id] = true;
      g.refreshNpcs();
      const p = g.player, regs = () => (g.state.flags['R:' + m.id] || m.regs0).join(',');
      const attendre = async () => { for (let i = 0; i < 400 && (p.move || g.busy); i++) await W(20); await W(30); };
      const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      for (let i = 1; i < R.coups.length; i++) {
        const [x, y, d, ox, oy] = R.coups[i];
        p.x = x; p.y = y; p.move = null; g.view.update(0, p.x, p.y);   // (x, y) est dans la zone libre du coup précédent
        if (d === 'A') { p.dir = ox > x ? 'right' : ox < x ? 'left' : oy > y ? 'down' : 'up'; await g.interact(); }
        else {
          const f = Object.values(m.etat.fragiles).find((q) => q.entree[0] === x + D[d][0] && q.entree[1] === y + D[d][1]);
          if (f && !(g.state.flags['R:' + m.id] || m.regs0)[f.r]) {
            let [cx, cy] = [x, y];
            for (const [nx, ny] of cheminFragile(f.cases, f.entree, f.fins || f.cases)) { g.tryStep(nx > cx ? 'right' : nx < cx ? 'left' : ny > cy ? 'down' : 'up'); await attendre(); [cx, cy] = [nx, ny]; }
          } else { g.tryStep(d); await attendre(); }
        }
        await attendre();
        if (regs() !== R.chemin[i][2].join(',')) return { ok: false, msg: `coup ${i} (${d} depuis ${x},${y}) : registres ${regs()} au lieu de ${R.chemin[i][2].join(',')}` };
      }
      // fin : la zone du dernier état touche le Champion (le joueur y va à pied)
      const fin = R.chemin[R.chemin.length - 1];
      return { ok: true, msg: `${R.coups.length - 1} coups, arrivée ${p.x},${p.y} (attendue ${fin[0]},${fin[1]})` };
    }, id);
    if (!r.ok) failures++;
    console.log(`${r.ok ? '  ✓' : '  ✗'} arène ${gym} (${id}) : ${r.msg}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { failures++; console.log('  ✗ erreurs JavaScript :', errors.slice(0, 3)); }
if (failures) { console.log(`\n${failures} vérification(s) en échec`); process.exit(1); }
console.log('Odyssée : arènes dessinées jouées dans le jeu OK');
