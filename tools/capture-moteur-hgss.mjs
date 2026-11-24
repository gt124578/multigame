// Capture d'écran du banc d'essai du moteur façon HGSS dans Chrome (Playwright), après une suite de touches.
// Les fichiers du dépôt sont servis par Playwright lui-même (aucun serveur à lancer).
//   node tools/capture-moteur-hgss.mjs "<paramètres>" <image.png> ["Touche:ms,w:ms,js:<code encodeURIComponent>,…"]
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
// textures de Pokémon DS Map Studio : depuis un clone local si PDSMS=<dossier du clone> (pas de réseau dans les tests)
if (process.env.PDSMS) await p.route('https://raw.githubusercontent.com/Trifindo/Pokemon-DS-Map-Studio/**', async (r) => {
  const u = decodeURIComponent(new URL(r.request().url()).pathname);
  const f = path.join(process.env.PDSMS, u.replace(/^\/Trifindo\/Pokemon-DS-Map-Studio\/[0-9a-f]+\//, ''));
  try { r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: await readFile(f) }); }
  catch { r.fulfill({ status: 404, body: '' }); }
});
// décompilation de HGSS (bâtiments) : depuis un clone local si PRET=<dossier du clone>
if (process.env.PRET) await p.route('https://raw.githubusercontent.com/pret/pokeheartgold/**', async (r) => {
  const u = decodeURIComponent(new URL(r.request().url()).pathname);
  const f = path.join(process.env.PRET, u.replace(/^\/pret\/pokeheartgold\/[0-9a-f]+\//, ''));
  try { r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: await readFile(f) }); }
  catch { r.fulfill({ status: 404, body: '' }); }
});
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('ERREUR: ' + e.message));
await p.goto(params.startsWith('/') ? 'http://depot.local' + params : 'http://depot.local/odyssee/moteur.html?' + params);
await p.waitForTimeout(2500);
for (const a of actions.split(',').filter(Boolean)) {
  const i = a.indexOf(':'), k = i < 0 ? a : a.slice(0, i), ms = i < 0 ? '' : a.slice(i + 1);
  if (k === 'w') { await p.waitForTimeout(+ms); continue; }
  if (k === 'js') { console.log('js →', await p.evaluate(decodeURIComponent(ms))); continue; }   // js:<code encodé> (avec ?debug : window.__moteur)
  await p.keyboard.down(k); await p.waitForTimeout(+(ms || 100)); await p.keyboard.up(k); await p.waitForTimeout(80);
}
await p.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await b.close();
