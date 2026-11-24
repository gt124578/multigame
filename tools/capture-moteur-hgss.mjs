// Capture d'écran du banc d'essai du moteur façon HGSS dans Chrome (Playwright), après une suite de touches.
// Les fichiers du dépôt sont servis par Playwright lui-même (aucun serveur à lancer).
//   node tools/capture-moteur-hgss.mjs "<paramètres>" <image.png> ["Touche:ms,w:ms,…"]
//   ex. node tools/capture-moteur-hgss.mjs "nouveau&debug" /tmp/a.png "ArrowDown:400,w:500"
// PLAYWRIGHT=<chemin du module> et CHROME_PATH=<chrome> si besoin.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const PW = process.env.PLAYWRIGHT || 'playwright';
const { chromium } = await import(PW);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
const [params = '', out = '/tmp/moteur.png', actions = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1024, height: 768 } });
await p.route('http://depot.local/**', async (r) => {
  const u = new URL(r.request().url());
  const f = path.join(RACINE, decodeURIComponent(u.pathname));
  if (!f.startsWith(RACINE)) return r.fulfill({ status: 403 });
  try { r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: await readFile(f) }); }
  catch { r.fulfill({ status: 404, body: '' }); }
});
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('ERREUR: ' + e.message));
await p.goto('http://depot.local/odyssee/moteur/index.html?' + params);
await p.waitForTimeout(2500);
for (const a of actions.split(',').filter(Boolean)) {
  const [k, ms] = a.split(':');
  if (k === 'w') { await p.waitForTimeout(+ms); continue; }
  await p.keyboard.down(k); await p.waitForTimeout(+(ms || 100)); await p.keyboard.up(k); await p.waitForTimeout(80);
}
await p.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await b.close();
