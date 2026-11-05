// tools/test-odyssee-ecrans.mjs — Odyssée dans un vrai Chrome (sans fenêtre) : les écrans plein cadre et la météo.
//
// Lance une partie, ouvre chaque écran (équipe, résumé, sac, Pokédex, carte, carte de dresseur, PC, quêtes, options,
// Panthéon, amis) et vérifie au clavier : Espace ne ferme jamais, Échap ferme, l'écran disparaît et la main revient
// au jeu (aucun écouteur clavier oublié), aucune erreur JavaScript.
// Puis des comportements précis : la carte (Espace recentre sans fermer, C referme), la Carte de Dresseur
// (Espace retourne la carte), les amis (le code tapé survit au rafraîchissement), et la météo (brume, cendres).
//
// Prérequis : Playwright et son Chromium (`npm i -D playwright && npx playwright install chromium`).
// Sans Playwright, le test s'annonce sauté et ne fait pas échouer la suite.
//   node tools/test-odyssee-ecrans.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('⏭  Playwright absent : test des écrans dans Chrome sauté (npm i -D playwright && npx playwright install chromium).');
  process.exit(0);
}

// petit serveur statique (le jeu n'a pas d'étape de construction)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const count = () => page.evaluate(() => ({ screens: document.querySelectorAll('.screen').length, handlers: window.__ody.game.input.handlers.length }));

try {
  await page.goto(`${BASE}/odyssee/index.html?local`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ody?.play, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const { game } = window.__ody;
    const st = game.newState('Test', 'm');
    st.flags.intro = true;
    const { SPECIES } = await import('/odyssee/js/data/species.js');
    st.party = Object.keys(SPECIES).slice(0, 3).map((sp) => window.__ody.mon(sp, 20));
    window.__ody.play(st);
  });
  await wait(2500);

  /** ouvre un écran en appelant sa fonction (comme le jeu) ; window.__done passe à vrai quand il se ferme */
  const open = async (name) => {
    await page.evaluate(async (name) => {
      const { game } = window.__ody;
      const S = await import('/odyssee/js/ui/screens.js');
      const R = await import('/odyssee/js/world/region.js');
      const args = { summaryScreen: [game, game.state.party, 0], cardScreen: [game, R.BADGES] }[name] || [game];
      window.__done = false;
      Promise.resolve(S[name](...args)).then(() => { window.__done = true; });
    }, name);
    await wait(700);
  };

  console.log('Écrans : ouverture, Espace, Échap');
  // l'équipe et le sac sont à part : Espace y ouvre le menu d'un Pokémon / utilise l'objet choisi
  for (const name of ['summaryScreen', 'dexScreen', 'mapScreen', 'cardScreen', 'pcScreen', 'questsScreen', 'optionsScreen', 'pantheonScreen', 'friendsScreen']) {
    await open(name);
    const a = await count();
    await page.keyboard.press('Space'); await wait(250);
    const b = await count();
    await page.keyboard.press('Escape'); await wait(400);
    const c = await count();
    const done = await page.evaluate(() => window.__done);
    ok(a.screens === 1 && a.handlers === 1 && b.screens === 1 && done && c.screens === 0 && c.handlers === 0,
      `${name} : s'ouvre, reste ouvert sur Espace, se ferme sur Échap et rend le clavier`);
  }
  for (const name of ['partyScreen', 'bagScreen']) {
    await open(name);
    const a = await count();
    await page.keyboard.press('Escape'); await wait(400);
    const c = await count();
    ok(a.screens === 1 && c.screens === 0 && c.handlers === 0, `${name} : s'ouvre et se ferme sur Échap`);
  }

  console.log('Carte de la région');
  await open('mapScreen');
  await page.keyboard.press('Space'); await wait(600);
  const me = await page.evaluate(() => {
    const m = document.querySelector('.map-me').getBoundingClientRect(), c = document.querySelector('.mapcv').getBoundingClientRect();
    return { inside: m.left >= c.left - 1 && m.right <= c.right + 1 && m.top >= c.top - 1 && m.bottom <= c.bottom + 1, open: !!document.querySelector('.map-scr') };
  });
  ok(me.open && me.inside, 'Espace recentre : le joueur est visible sur la carte, qui reste ouverte');
  const ratio = await page.evaluate(() => { const c = document.querySelector('.mapcv'); const r = c.getBoundingClientRect(); return Math.abs(c.width / c.height - r.width / r.height); });
  ok(ratio < 0.02, 'le dessin de la carte a le même ratio que son cadre (pas d\'étirement)');
  await page.keyboard.press('KeyC'); await wait(400);
  ok((await count()).screens === 0, 'C referme la carte');

  console.log('Carte de Dresseur');
  await open('cardScreen');
  const face0 = await page.evaluate(() => !!document.querySelector('.tc-face-profile.active'));
  await page.keyboard.press('Space'); await wait(300);
  const face1 = await page.evaluate(() => !!document.querySelector('.tc-face-badges.active'));
  ok(face0 && face1, 'Espace retourne la carte vers le coffret des badges');
  await page.keyboard.press('Escape'); await wait(400);

  console.log('Amis');
  await open('friendsScreen');
  await page.click('[data-act="tab-add"]'); await wait(200);
  await page.click('.fr-code-input');
  await page.keyboard.type('AB12');
  await wait(3600);   // un rafraîchissement de la liste passe (toutes les 3 s)
  await page.keyboard.type('-CD');
  const input = await page.evaluate(() => { const i = document.querySelector('.fr-code-input'); return { v: i?.value, focus: document.activeElement === i }; });
  ok(input.v === 'AB12-CD' && input.focus, 'le code ami tapé et le focus survivent au rafraîchissement');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Escape'); await wait(400);
  ok((await count()).screens === 0, 'l\'écran des amis se ferme ensuite');

  console.log('Météo');
  const fog = await page.evaluate(async () => {
    const { game } = window.__ody;
    game.view.setWeather('fog');
    await new Promise((r) => setTimeout(r, 100));
    const on = !!document.querySelector('.ow-fog.on');
    game.view.setWeather('ash');
    const ash = game.view.weather.current === 'ash' && game.view.weather.points.visible && !document.querySelector('.ow-fog.on');
    game.view.setWeather('none');
    return { on, ash, off: !game.view.weather.points.visible };
  });
  ok(fog.on, 'la brume pose son voile sur le décor');
  ok(fog.ash, 'les cendres tombent (particules) et la brume se lève');
  ok(fog.off, 'temps clair : plus rien à l\'écran');
  const w = await page.evaluate(() => {
    const { game } = window.__ody;
    const vals = new Set();
    for (const h of [6, 12, 15]) { game.hourOverride = h; vals.add(game.getMapWeather()); }
    game.hourOverride = null;
    return [...vals].every((v) => ['none', 'rain', 'sun', 'hail', 'sandstorm', 'ash', 'fog'].includes(v));
  });
  ok(w, 'la météo de la zone est toujours une valeur connue');

  ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
} finally {
  await browser.close();
  server.close();
}

if (failures) { console.log(`\n${failures} vérification(s) en échec`); process.exit(1); }
console.log('\nODYSSÉE DANS CHROME : ÉCRANS ET MÉTÉO AU VERT');
