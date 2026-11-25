// Mesure des à-coups du moteur HGSS dans Chrome (Playwright) : le joueur marche (touches tenues), on relève les
// images trop longues et le temps passé dans les étapes lourdes (cartes chargées en route, blocs construits, modèles).
//   PRET=<clone> PDSMS=<clone> node tools/perf-moteur-hgss.mjs "<paramètres>" "<touche:ms,…>"
//   ex. node tools/perf-moteur-hgss.mjs "zone=NEW_BARK&x=690&y=400&tout" "ArrowLeft:8000,ArrowUp:3000"
// Le rendu sans carte graphique (SwiftShader) est lent : on regarde surtout le JavaScript (« tâches longues »).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const PW = process.env.PLAYWRIGHT || 'playwright';
const { chromium } = await import(PW);
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary' };
const [params = 'zone=NEW_BARK&x=690&y=400&tout', actions = 'ArrowLeft:8000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1024, height: 768 } });
const servir = (prefixe, dossier, re) => p.route(prefixe + '/**', async (r) => {
  const u = decodeURIComponent(new URL(r.request().url()).pathname);
  try { await r.fulfill({ status: 200, contentType: TYPES[path.extname(u)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: await readFile(path.join(dossier, u.replace(re, ''))) }); }
  catch { await r.fulfill({ status: 404, body: '' }); }
});
await servir('http://depot.local', RACINE, /^\//);
if (process.env.PDSMS) await servir('https://raw.githubusercontent.com/Trifindo/Pokemon-DS-Map-Studio', process.env.PDSMS, /^\/Trifindo\/Pokemon-DS-Map-Studio\/[0-9a-f]+\//);
if (process.env.PLAT) await servir('https://raw.githubusercontent.com/pret/pokeplatinum', process.env.PLAT, /^\/pret\/pokeplatinum\/[0-9a-f]+\//);
if (process.env.PRET) await servir('https://raw.githubusercontent.com/pret/pokeheartgold', process.env.PRET, /^\/pret\/pokeheartgold\/[0-9a-f]+\//);
const logs = [];
p.on('pageerror', (e) => logs.push('ERREUR: ' + e.message));
await p.goto('http://depot.local/odyssee/moteur.html?debug&' + params);
await p.waitForFunction(() => window.__moteur, null, { timeout: 120000 });
await p.waitForTimeout(3000);
// espions : images, tâches longues, étapes chronométrées
await p.evaluate(() => {
  const P = (window.__perf = { images: [], longues: [], etapes: {} });
  let t0 = performance.now();
  const boucle = (t) => { P.images.push(t - t0); t0 = t; requestAnimationFrame(boucle); };
  requestAnimationFrame(boucle);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longues.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false });
  const espion = (o, nom, cle) => {
    const f = o?.[nom]; if (typeof f !== 'function') return;
    o[nom] = function (...a) {
      const d = performance.now(), r = f.apply(this, a);
      const fin = () => { const e = (P.etapes[cle] ||= { n: 0, total: 0, max: 0 }); const t = performance.now() - d; e.n++; e.total += t; e.max = Math.max(e.max, t); };
      if (r && typeof r.then === 'function') r.then(fin, fin); else fin();
      return r;
    };
  };
  const { T, R } = window.__moteur;
  espion(T, 'ajouterDonnees', 'moteur : ajouter une carte');
  espion(T, 'pas', 'moteur : un pas (1/60 s)');
  espion(R, 'construireBloc', 'rendu : construire un bloc');
  espion(R, 'dessiner', 'rendu : une image');
  espion(R.hg, 'carte', 'rendu : modèle d\'une carte');
});
// profil du JavaScript pendant la marche (temps propre de chaque fonction)
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
for (const a of actions.split(',').filter(Boolean)) {
  const [k, ms] = a.split(':');
  if (k === 'w') { await p.waitForTimeout(+ms); continue; }
  if (k === 'js') { console.log('js →', await p.evaluate(decodeURIComponent(ms))); continue; }
  await p.keyboard.down(k); await p.waitForTimeout(+(ms || 100)); await p.keyboard.up(k);
}
const { profile } = await cdp.send('Profiler.stop');
{
  const dt = {}, ids = new Map(profile.nodes.map((n) => [n.id, n]));
  const deltas = profile.timeDeltas; let k = 0;
  for (const s of profile.samples) { const n = ids.get(s), f = n.callFrame; const cle = `${f.functionName || '(anonyme)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; dt[cle] = (dt[cle] || 0) + (deltas[k++] || 0) / 1000; }
  const tot = Object.values(dt).reduce((a, b) => a + b, 0);
  console.log('JavaScript, temps propre (ms) :');
  for (const [c, t] of Object.entries(dt).filter(([c]) => !/^\((idle|program|garbage collector)\)/.test(c) || true).sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP || 25))) console.log(`  ${t.toFixed(0).padStart(6)}  ${(100 * t / tot).toFixed(1).padStart(5)} %  ${c}`);
}
const P = await p.evaluate(() => ({ ...window.__perf, zone: window.__moteur.T.zone?.id, pos: [window.__moteur.T.joueur.x, window.__moteur.T.joueur.y] }));
const im = P.images.slice(5), tri = [...im].sort((a, b) => a - b);
console.log(`arrivée : ${P.zone} ${P.pos}`);
console.log(`images : ${im.length}, médiane ${tri[tri.length >> 1]?.toFixed(1)} ms, 95 % ${tri[Math.floor(tri.length * 0.95)]?.toFixed(1)} ms, > 100 ms : ${im.filter((x) => x > 100).length}, la pire ${tri[tri.length - 1]?.toFixed(0)} ms`);
console.log(`tâches longues (> 50 ms) : ${P.longues.length}, total ${P.longues.reduce((s, x) => s + x, 0)} ms, les pires ${[...P.longues].sort((a, b) => b - a).slice(0, 8).join(', ')}`);
for (const [k, e] of Object.entries(P.etapes)) console.log(`  ${k.padEnd(32)} ${String(e.n).padStart(5)} fois, total ${e.total.toFixed(0).padStart(6)} ms, pire ${e.max.toFixed(1)} ms`);
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
await b.close();
