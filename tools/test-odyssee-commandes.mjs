// tools/test-odyssee-commandes.mjs — Odyssée à la manette et au doigt, dans un vrai Chrome (Playwright, sauté s'il manque).
//
// Manette (odyssee/js/manette.js, Gamepad API simulée) : la croix et le stick font marcher, Start ouvre le menu, B le ferme,
// A valide ; le menu-manette commun du Hub (shared/padnav.js) se tait pendant ce temps.
// Tactile (odyssee/js/tactile.js, écran de téléphone en paysage) : les commandes apparaissent au premier contact, la croix
// fait marcher en suivant le doigt, le bouton Menu ouvre le menu et B le ferme ; le clavier les recache.
// Arrière-plan : onglet caché, le son s'arrête et la partie est sauvegardée ; il reprend au retour.
//   node tools/test-odyssee-commandes.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('⏭  Playwright absent : test des commandes sauté (npm i -D playwright && npx playwright install chromium).');
  process.exit(0);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(p, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓ ' + msg); else { fails++; console.log('  ✗ ' + msg); } };

// une manette simulée : window.__pad.buttons[i].pressed, window.__pad.axes
const MANETTE = () => {
  const pad = { id: 'Manette de test', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad; navigator.getGamepads = () => [pad, null, null, null];
};
// une partie devant le labo de Bourg-Aube, ni rencontres ni dresseurs
const PARTIE = async () => {
  const O = window.__ody, g = O.game, s = g.newState('Test', 'm'); s.flags.intro = true; s.party = [O.mon(6, 30)];
  const W = O.world.maps.monde, lab = [...W.warps].find(([, w]) => w.map === 'aube:labo'); const [x, y] = lab[0].split(',').map(Number);
  s.map = 'monde'; s.x = x; s.y = y + 3; s.dir = 'down';
  await O.play(s); g.noEnc = true; g.noTrainers = true;
};
const browser = await chromium.launch();
const ouvrir = async (o) => {
  const ctx = await browser.newContext(o), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/onrender\.com|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (o.manette) await page.addInitScript(MANETTE);
  await page.goto(`${BASE}/odyssee/index.html`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ody?.play && window.__odyBoot?.pret, null, { timeout: 300000, polling: 200 });
  await page.evaluate(PARTIE);
  await page.waitForFunction(() => { const g = window.__ody.game; return !g.busy && g.input.free; }, null, { timeout: 120000 });
  return { ctx, page, errors };
};
const pos = (page) => page.evaluate(() => { const g = window.__ody.game; return { x: g.player.x, y: g.player.y, libre: g.input.free, menu: !!document.querySelector('.startmenu'), busy: g.busy }; });
const attendre = (page, fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 100 }).then(() => true, () => false);

try {
  console.log('Manette');
  {
    const { ctx, page, errors } = await ouvrir({ viewport: { width: 1280, height: 800 }, manette: true });
    const p0 = await pos(page);
    await page.evaluate(() => { window.__pad.buttons[13].pressed = true; });   // croix bas, tenue
    ok(await attendre(page, `window.__ody.game.player.y >= ${p0.y + 2}`), 'croix vers le bas tenue : le dresseur marche');
    await page.evaluate(() => { window.__pad.buttons[13].pressed = false; });
    await attendre(page, () => !window.__ody.game.player.move, 10000);
    const p1 = await pos(page);
    await page.evaluate(() => { window.__pad.axes[0] = -0.9; });   // stick à gauche
    ok(await attendre(page, `window.__ody.game.player.x < ${p1.x} || window.__ody.game.player.dir === 'left'`), 'stick à gauche : le dresseur se tourne ou marche à gauche');
    await page.evaluate(() => { window.__pad.axes[0] = 0; });
    await attendre(page, () => !window.__ody.game.player.move && !window.__ody.game.busy, 10000);
    ok(await page.evaluate(() => document.documentElement.getAttribute('data-manette') === 'odyssee' && window.ArcadiaPad && !window.ArcadiaPad.active()), 'le menu-manette commun du Hub se tait');
    await page.evaluate(() => { window.__pad.buttons[9].pressed = true; });   // Start
    ok(await attendre(page, () => !!document.querySelector('.startmenu')), 'Start : le menu s\'ouvre');
    await page.evaluate(() => { window.__pad.buttons[9].pressed = false; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__pad.buttons[1].pressed = true; });   // B
    ok(await attendre(page, () => !document.querySelector('.startmenu') && window.__ody.game.input.free), 'B : le menu se ferme et la main revient au jeu');
    await page.evaluate(() => { window.__pad.buttons[1].pressed = false; });
    // arrière-plan : le son s'arrête (contexte audio suspendu) et reprend au retour, la partie est sauvegardée
    await page.mouse.click(640, 400);   // un geste débloque le son
    await page.evaluate(() => { window.__ody.sound.init(); window.__ody.sound.play('route'); });
    const fond = await page.evaluate(async () => {
      const S = window.__ody.sound, cache = (v) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); };
      localStorage.removeItem('odyssee-save-v2');
      cache(true); await new Promise((r) => setTimeout(r, 300)); const cachee = S.ctx.state, sauve = !!localStorage.getItem('odyssee-save-v2');
      cache(false); await new Promise((r) => setTimeout(r, 300));
      return { cachee, revenu: S.ctx.state, sauve };
    });
    ok(fond.cachee === 'suspended' && fond.revenu === 'running', `onglet caché : le son s'arrête et reprend (${fond.cachee} → ${fond.revenu})`);
    ok(fond.sauve, 'onglet caché : la partie est sauvegardée');
    ok(!errors.length, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors[0] : ''));
    await ctx.close();
  }
  console.log('Tactile (téléphone en paysage)');
  {
    const { ctx, page, errors } = await ouvrir({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tactile')).display === 'none'), 'commandes cachées avant le premier contact');
    await page.touchscreen.tap(420, 200);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tactile')).display !== 'none'), 'commandes affichées au premier contact');
    const r = await page.evaluate(() => { const b = document.querySelector('.tactile .croix').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width }; });
    const p0 = await pos(page);
    // le doigt posé sur le bas de la croix, tenu
    const cdp = await ctx.newCDPSession(page);
    const toucher = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await toucher('touchStart', r.x, r.y + r.w * 0.35);
    ok(await attendre(page, `window.__ody.game.player.y >= ${p0.y + 2}`), 'doigt tenu sur le bas de la croix : le dresseur marche');
    await toucher('touchMove', r.x - r.w * 0.35, r.y);
    ok(await attendre(page, `window.__ody.game.player.dir === 'left'`), 'le doigt glisse à gauche : le dresseur tourne à gauche');
    await toucher('touchEnd');
    ok(await attendre(page, () => !window.__ody.game.input.dirOrder.length && !window.__ody.game.player.move, 10000), 'doigt levé : le dresseur s\'arrête');
    await attendre(page, () => !window.__ody.game.busy, 10000);
    const m = await page.evaluate(() => { const b = document.querySelector('.tactile .menu').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await page.touchscreen.tap(...m);
    ok(await attendre(page, () => !!document.querySelector('.startmenu')), 'bouton Menu : le menu s\'ouvre');
    const b = await page.evaluate(() => { const r = document.querySelector('.tactile .b').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.touchscreen.tap(...b);
    ok(await attendre(page, () => !document.querySelector('.startmenu') && window.__ody.game.input.free), 'bouton B : le menu se ferme');
    await page.keyboard.press('KeyU'); await page.keyboard.press('KeyU');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tactile')).display === 'none'), 'le clavier recache les commandes tactiles');
    ok(!errors.length, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors[0] : ''));
    await ctx.close();
  }
} catch (e) { fails++; console.log('  ✗ ' + (e.stack || e).toString().slice(0, 400)); }
await browser.close(); server.close();
console.log(fails ? `${fails} échec(s)` : 'ODYSSÉE À LA MANETTE ET AU DOIGT : OK');
process.exit(fails ? 1 : 0);
