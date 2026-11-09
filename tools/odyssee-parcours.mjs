// tools/odyssee-parcours.mjs — parcours automatique d'Odyssée dans un vrai Chrome (sans fenêtre, Playwright) et banc de mesure.
//
// Ouvre le jeu, mesure le démarrage (étapes de main.js : carte construite, images, rendu prêt), lance une partie puis
// joue tout seul : sauts d'un bout à l'autre de la région, marche jusqu'à des portes (chemin le plus court, en tenant
// les touches comme un joueur), entrée et sortie des bâtiments et des grottes, un combat sauvage, les menus, la
// sauvegarde, le rechargement de la page et la reprise. À chaque étape : durée des transitions, coût d'une image
// (temps de calcul de game.tick, appels de dessin, triangles), images lentes (à-coups), mémoire (géométries et
// textures de three.js, tas JavaScript après ramasse-miettes), part de l'écran où l'on voit le vide (couleur du fond),
// joueur bloqué, erreurs et avertissements de la console. Compare aussi l'empreinte de la carte construite dans la
// page à celle de Node (tools/odyssee-empreinte.mjs).
//
//   node tools/odyssee-parcours.mjs [--portes N] [--sauts N] [--court] [--sortie dossier] [--captures] [--accel K] [--ecran LxH]
//
// --accel K (3 par défaut) : le temps du jeu passe K fois plus vite (le Chrome sans écran ne dessine que quelques images
// par seconde, la marche serait sinon interminable) ; --accel 1 pour mesurer le jeu tel quel. --ecran : taille de la
// fenêtre (1280x800 par défaut, rendu en 640 × 400 comme dans le jeu).
//
// Résumé à l'écran, détail dans <sortie>/parcours.json (par défaut /tmp/odyssee-parcours). Code de sortie 1 si une erreur
// JavaScript, une carte différente de Node, un joueur bloqué ou une fuite de mémoire est relevé.
// Le Chrome sans écran dessine en logiciel (SwiftShader) : les durées d'image y sont bien plus longues que sur un vrai
// GPU ; on compare surtout le temps de calcul (tick), les appels de dessin et la mémoire, d'une version à l'autre.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('⏭  Playwright absent : parcours sauté (npm i -D playwright && npx playwright install chromium).');
  process.exit(0);
}
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const COURT = process.argv.includes('--court');
const NPORTES = +arg('portes', COURT ? 3 : 10), NSAUTS = +arg('sauts', COURT ? 3 : 8);
const OUT = arg('sortie', '/tmp/odyssee-parcours'), CAPTURES = process.argv.includes('--captures');
const ACCEL = +arg('accel', 3), [ECW, ECH] = arg('ecran', '1280x800').split('x').map(Number);
fs.mkdirSync(OUT, { recursive: true });

// petit serveur statique (le jeu n'a pas d'étape de construction)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };
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

// empreinte de la carte dans Node (même code que dans la page)
const { empreinte, differences } = await import('./odyssee-empreinte.mjs');
const tn0 = performance.now(), c0 = process.cpuUsage();
const { buildWorld } = await import('../odyssee/js/world/region.js');
const EN = empreinte(buildWorld());
const nodeMs = Math.round(performance.now() - tn0), nodeCpu = Math.round((process.cpuUsage(c0).user) / 1000);

const R = { node: { buildWorldMs: nodeMs, cpuMs: nodeCpu, empreinte: EN.total }, etapes: [], console: [], bloque: [], vide: [] };
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: ECW, height: ECH } });
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') R.console.push({ t, phase: R.phase, m: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => { R.console.push({ t: 'pageerror', phase: R.phase, m: (e.stack || e.message).slice(0, 600) }); if (R.console.filter((c) => c.t === 'pageerror').length <= 3) log('  ✗ erreur JavaScript : ' + (e.stack || e.message).slice(0, 400)); });
// le jeu essaie de joindre le serveur des sauvegardes en ligne : on coupe court (hors sujet ici)
await page.route(/onrender\.com|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const cdp = await ctx.newCDPSession(page);

/* ------------------------------------------------------------ côté page ------------------------------------------------------------ */
// le pilote : mesures image par image, chemin le plus court, marche au clavier, dialogues validés
async function installer() {
  await page.evaluate((ACCEL) => {
    const O = window.__ody, g = O.game, v = O.view, r = v.renderer;
    const P = window.__parcours = { images: [], phase: 'titre' };
    const tick0 = g.tick.bind(g), rendu0 = v.render.bind(v);
    let rendus = 0; v.render = () => { rendus++; rendu0(); };
    let avant = 0;
    g.tick = (dt) => {
      const t = performance.now(), f0 = rendus; tick0(Math.min(0.15, dt * ACCEL)); const c = performance.now() - t;
      const rendu = rendus !== f0;
      P.images.push([+(t - avant).toFixed(1), +c.toFixed(2), rendu ? r.info.render.calls : -1, rendu ? r.info.render.triangles : -1, P.phase]);
      avant = t;
    };
    const attendre = (ms) => new Promise((res) => setTimeout(res, ms));
    P.attendre = attendre;
    // valide les dialogues (touche A) tant qu'un écran attend une réponse
    P.valider = false;   // allumé une fois la partie lancée (sinon il validerait l'écran titre)
    setInterval(() => { if (P.valider && !g.input.free && !g.ui.root.querySelector('.screen')) g.input.emit('a'); }, 180);
    P.libre = () => !g.busy && !g.stepLock && !g.player.move && g.input.free;
    P.attendreLibre = async (ms = 30000) => { const t0 = performance.now(); while (!P.libre()) { if (performance.now() - t0 > ms) return false; await attendre(30); } return true; };
    // chemin le plus court sur la carte courante (mêmes règles que tryStep, sans les rebords)
    P.chemin = async (cible, max = 400000) => {
      const { walkable, T } = await import('/odyssee/js/world/tiles.js');
      const m = g.mapObj, p = g.player, w = m.w, start = p.y * w + p.x;
      const prev = new Int32Array(m.w * m.h).fill(-1), q = new Int32Array(Math.min(max, m.w * m.h)); let a = 0, b = 0;
      prev[start] = start; q[b++] = start;
      const D = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
      let fin = -1;
      while (a < b && b < q.length) {
        const i = q[a++], x = i % w, y = (i / w) | 0;
        if (cible(x, y)) { fin = i; break; }
        for (const [, dx, dy] of D) {
          const u = x + dx, v2 = y + dy; if (!m.in(u, v2)) continue; const j = v2 * w + u;
          if (prev[j] >= 0) continue;
          const t = m.get(u, v2);
          if (!walkable(t) || g.occupied(u, v2) || !m.canStep(x, y, u, v2)) continue;
          // une porte ou un tapis ne se traverse pas : c'est une arrivée
          if ((t === T.DOOR || t === T.CAVEDOOR || m.warpAt(u, v2)) && !cible(u, v2)) continue;
          prev[j] = i; q[b++] = j;
        }
      }
      if (fin < 0) return null;
      const L = []; for (let i = fin; i !== start; i = prev[i]) L.push(i); L.reverse();
      return L.map((i) => [i % w, (i / w) | 0]);
    };
    // suit un chemin en tenant les touches de direction ; rend { ok, pas, bloque }
    P.marcher = async (L, ms = 60000) => {
      const p = g.player, inp = g.input, t0 = performance.now();
      let k = 0, dernier = performance.now(), pos = p.x + ',' + p.y;
      const lacher = () => { inp.dirOrder = []; inp.held.delete('up'); inp.held.delete('down'); inp.held.delete('left'); inp.held.delete('right'); };
      try {
        while (k < L.length) {
          if (performance.now() - t0 > ms) return { ok: false, pas: k, raison: 'temps' };
          if (g.mapObj !== P.carte0) return { ok: true, pas: k, sortie: true };
          const [x, y] = L[k];
          if (p.x === x && p.y === y) { k++; continue; }
          if (p.x + ',' + p.y !== pos) { pos = p.x + ',' + p.y; dernier = performance.now(); }
          // hors du chemin (glissade, poussée) : on s'arrête là, l'appelant recalcule
          if (!p.move && Math.abs(p.x - x) + Math.abs(p.y - y) !== 1) return { ok: false, pas: k, raison: 'hors chemin' };
          if (!p.move) {
            const d = x > p.x ? 'right' : x < p.x ? 'left' : y > p.y ? 'down' : 'up';
            if (inp.dir() !== d) { lacher(); inp.dirOrder = [d]; inp.held.set(d, performance.now()); }
          }
          if (performance.now() - dernier > 3000 && P.libre()) return { ok: false, pas: k, raison: 'bloqué', x: p.x, y: p.y, vers: [x, y] };
          await new Promise(requestAnimationFrame);
        }
        return { ok: true, pas: k };
      } finally { lacher(); }
    };
    // marche jusqu'à une case cible ; si un passant reste planté sur le chemin, on recalcule (trois fois au plus)
    P.allerA = async (cible, ms = 90000) => {
      let res = null;
      for (let essai = 0; essai < 4; essai++) {
        const L = await P.chemin(cible); if (!L) return res || { ok: false, raison: 'pas de chemin' };
        res = await P.marcher(L, ms);
        if (res.ok || res.raison === 'temps') return { ...res, essais: essai + 1 };
        await attendre(400);
      }
      return res;
    };
    // part de l'image où l'on voit le fond de la scène (le vide) : lu dans le tampon juste après un rendu
    P.vide = () => {
      v.render();
      const gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const c = v.scene.background; if (!c || !c.isColor) return 0;
      const s = c.clone().convertLinearToSRGB?.() || c;   // le fond est en espace linéaire, l'image en sRGB
      const R0 = Math.round(s.r * 255), G0 = Math.round(s.g * 255), B0 = Math.round(s.b * 255);
      let n = 0; for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - R0) <= 2 && Math.abs(px[i + 1] - G0) <= 2 && Math.abs(px[i + 2] - B0) <= 2) n++;
      return n / (W * H);
    };
    P.accel = ACCEL;
    P.memoire = () => ({ geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs?.length || 0, tas: Math.round(performance.memory.usedJSHeapSize / 1e5) / 10, blocs: v.chunks?.size || 0, sol: v.sol?.cache?.size || 0, solMo: Math.round((v.sol?.octets || 0) / 1e5) / 10, objets: (() => { let n = 0; v.scene.traverse(() => n++); return n; })(), teintes: v.tinted?.length || 0, batiments: v.buildingMeshes?.length || 0 });
  }, ACCEL);
}
const pg = (fn, a) => page.evaluate(fn, a);
const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); await cdp.send('HeapProfiler.collectGarbage'); };
let imgVues = 0;
/** résumé des images enregistrées depuis le dernier appel */
async function images() {
  const L = await pg(() => { const L = window.__parcours.images; window.__parcours.images = []; return L; });
  imgVues += L.length;
  const r = L.filter((f) => f[2] >= 0); if (!r.length) return L.length ? { n: 0, ticks: L.length } : null;
  const tick = r.map((f) => f[1]).sort((a, b) => a - b), gap = L.slice(1).map((f) => f[0]).sort((a, b) => a - b);
  const q = (A, f) => A[Math.min(A.length - 1, Math.floor(f * A.length))];
  return { n: r.length, tickMed: q(tick, 0.5), tick95: q(tick, 0.95), tickMax: tick[tick.length - 1], appels: Math.max(...r.map((f) => f[2])), appelsMed: q(r.map((f) => f[2]).sort((a, b) => a - b), 0.5), triangles: Math.max(...r.map((f) => f[3])), ecartMed: q(gap, 0.5), ecartMax: gap[gap.length - 1] || 0, lentes: gap.filter((x) => x > 100).length };
}
async function etape(nom, fn) {
  R.phase = nom; await pg((n) => { window.__parcours.phase = n; }, nom);
  const t0 = Date.now(); let res;
  try { res = await fn(); } catch (e) { res = { erreur: String(e.message || e).slice(0, 300) }; }
  const e = { nom, ms: Date.now() - t0, ...res, images: await images() };
  R.etapes.push(e);
  const im = e.images;
  log(`  ${nom.padEnd(34)} ${String(e.ms).padStart(6)} ms${e.transition != null ? ` (transition ${e.transition} ms)` : ''}${im ? ` · tick ${im.tickMed}/${im.tick95}/${im.tickMax} ms · ${im.appelsMed}–${im.appels} appels · ${Math.round(im.triangles / 1000)} k tri.` : ''}${e.vide ? ` · vide ${(e.vide * 100).toFixed(1)} %` : ''}${e.erreur ? ' ✗ ' + e.erreur : ''}${e.bloque ? ' ✗ bloqué ' + JSON.stringify(e.bloque) : ''}`);
  return e;
}
const memoire = async () => { await gc(); return pg(() => window.__parcours.memoire()); };

/* ------------------------------------------------------------ démarrage ------------------------------------------------------------ */
async function demarrer(premiere) {
  const t0 = Date.now();
  await page.goto(`${BASE}/odyssee/index.html`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ody?.play && window.__odyBoot?.pret, null, { timeout: 240000, polling: 200 });
  const boot = await pg(() => window.__odyBoot);
  const met = await cdp.send('Performance.getMetrics').catch(() => null);
  await installer();
  return { boot, total: Date.now() - t0, premiere };
}

try {
  log(`Node : buildWorld ${nodeMs} ms (CPU ${nodeCpu} ms), empreinte ${EN.total}`);
  await cdp.send('Performance.enable');
  const d = await demarrer(true);
  R.demarrage = d;
  log(`Démarrage : module ${d.boot.module} ms · carte construite ${d.boot.carte} ms · images ${d.boot.images} ms · rendu ${d.boot.vue} ms · titre ${d.boot.pret} ms`);
  R.memoireTitre = await memoire();

  // empreinte de la carte construite dans la page
  const EB = await pg(async () => { const { empreinte } = await import('/tools/odyssee-empreinte.mjs'); return empreinte(window.__ody.world); });
  const diff = differences(EN, EB);
  R.empreinte = { node: EN.total, chrome: EB.total, differences: diff };
  log(diff.length ? `✗ carte différente entre Node et Chrome : ${diff.slice(0, 12).join(', ')}` : `✓ même carte dans Node et Chrome (${EB.total})`);

  // une partie : équipe solide, ni rencontres ni dresseurs pendant la marche (on lance le combat soi-même)
  await etape('nouvelle partie (Bourg-Aube)', async () => {
    const t = await pg(async () => {
      const O = window.__ody, g = O.game, P = window.__parcours;
      const s = g.newState('Parcours', 'm'); s.flags.intro = true;
      s.party = [O.mon(6, 60), O.mon(9, 60), O.mon(3, 60)];
      s.map = 'monde'; const W = O.world.maps.monde;
      // devant le labo de Bourg-Aube
      const lab = [...W.warps].find(([, w]) => w.map === 'aube:labo'); const [x, y] = lab[0].split(',').map(Number);
      s.x = x; s.y = y + 2; s.dir = 'up';
      const t0 = performance.now(); await O.play(s); P.valider = true; g.noEnc = true; g.noTrainers = true; g.hourOverride = 12;
      P.carte0 = g.mapObj;
      return Math.round(performance.now() - t0);
    });
    return { transition: t, vide: await pg(() => window.__parcours.vide()), memoire: await memoire() };
  });
  R.memoireDepart = R.etapes.at(-1).memoire;
  await pg(() => window.__parcours.attendre(1500));
  await etape('immobile 3 s (Bourg-Aube)', async () => { await page.waitForTimeout(3000); return { etat: await pg(() => { const g = window.__ody.game; return { combat: !!g.bv.alive, ecrans: [...g.ui.root.querySelectorAll('.screen')].map((e) => e.className).join(' '), touches: g.input.handlers.length, occupe: g.busy, pas: g.stepLock }; }) }; });
  log('    ' + JSON.stringify(R.etapes.at(-1).etat));

  // portes choisies d'un bout à l'autre de la carte : maisons, centres, boutiques, grottes
  const portes = await pg((n) => {
    const W = window.__ody.world.maps.monde, L = [];
    for (const [k, w] of W.warps) { const [x, y] = k.split(',').map(Number); const dest = window.__ody.world.maps[w.map]; if (dest && dest !== W) L.push({ x, y, map: w.map, cave: dest.floor === 'cave' }); }
    // un tirage régulier dans la liste triée par position (toujours les mêmes)
    L.sort((a, b) => a.y - b.y || a.x - b.x);
    const out = []; for (let i = 0; i < n; i++) out.push(L[Math.floor((i + 0.5) * L.length / n)]);
    const grotte = L.find((p) => p.cave); if (grotte && !out.includes(grotte)) out.push(grotte);
    return out;
  }, NPORTES);

  for (const [i, pt] of portes.entries()) {
    // saut à une vingtaine de cases de la porte (transition comme un Vol), puis marche jusqu'à elle
    const e = await etape(`porte ${i + 1} : ${pt.map}`.slice(0, 34), async () => {
      const r = await pg(async (pt) => {
        const O = window.__ody, g = O.game, P = window.__parcours, W = O.world.maps.monde;
        const { walkable } = await import('/odyssee/js/world/tiles.js');
        // une case libre, au même niveau, à 12–25 cases de la porte
        let dep = null;
        for (let r = 12; r <= 25 && !dep; r++) for (const [dx, dy] of [[0, r], [r, 0], [-r, 0], [0, -r], [r, r], [-r, r]]) { const x = pt.x + dx, y = pt.y + dy; if (W.in(x, y) && walkable(W.get(x, y)) && !W.warpAt(x, y)) { dep = [x, y]; break; } }
        if (!dep) return { erreur: 'pas de départ' };
        await P.attendreLibre();
        const t0 = performance.now();
        await g.warp({ map: 'monde', x: dep[0], y: dep[1], dir: 'up' }, 'exit');
        const saut = Math.round(performance.now() - t0);
        P.carte0 = g.mapObj;
        const vide = P.vide();
        const L = await P.chemin((x, y) => x === pt.x && y === pt.y);
        if (!L) return { saut, vide, chemin: false };
        const t1 = performance.now();
        const m = await P.allerA((x, y) => x === pt.x && y === pt.y, 90000);
        await P.attendre(200); await P.attendreLibre();
        const dedans = g.mapObj.id;
        return { saut, vide, chemin: L.length, marche: m, marcheMs: Math.round(performance.now() - t1), dedans, entre: dedans === pt.map };
      }, pt);
      const res = { ...r, transition: r.saut };
      if (r.marche && !r.marche.ok && !r.marche.sortie) { res.bloque = r.marche; R.bloque.push({ porte: pt, ...r.marche }); }
      if (r.vide > 0.002) R.vide.push({ ou: pt, vide: r.vide });
      if (CAPTURES) await page.screenshot({ path: `${OUT}/porte${i + 1}-dehors.png` });
      return res;
    });
    if (!e.entre) continue;
    // dedans : on fait le tour, puis on ressort par où l'on est entré
    await etape(`  dedans, puis sortie`, async () => {
      const r = await pg(async () => {
        const O = window.__ody, g = O.game, P = window.__parcours, m = g.mapObj;
        P.carte0 = m;
        const vide = m.floor === 'cave' ? P.vide() : 0;
        const sorties = [...m.warps].filter(([, w]) => w.map === 'monde').map(([k]) => k.split(',').map(Number));
        const L = await P.chemin((x, y) => sorties.some(([a, b]) => a === x && b === y) || (m.warpAt(x, y)?.map === 'monde'));
        if (!L) return { vide, erreur: 'pas de chemin vers la sortie' };
        const t0 = performance.now(); let res = await P.marcher(L, 60000);
        // sur le tapis : un pas vers le bas pour sortir
        if (g.mapObj === m) { await P.attendreLibre(); const inp = g.input; inp.dirOrder = ['down']; inp.held.set('down', performance.now()); await P.attendre(600); inp.dirOrder = []; inp.held.delete('down'); }
        await P.attendre(300); await P.attendreLibre();
        return { vide, marche: res, sorti: g.mapObj.id === 'monde', transition: Math.round(performance.now() - t0), dehors: P.vide() };
      });
      if (r.marche && !r.marche.ok && !r.marche.sortie) { r.bloque = r.marche; R.bloque.push({ dedans: true, ...r.marche }); }
      if (!r.sorti) R.bloque.push({ dedans: true, raison: 'pas ressorti' });
      return r;
    });
  }

  // longue marche le long d'une route (blocs du sol qui arrivent pendant qu'on avance)
  await etape('marche 120 cases', async () => pg(async () => {
    const O = window.__ody, g = O.game, P = window.__parcours, W = O.world.maps.monde;
    const { T } = await import('/odyssee/js/world/tiles.js');
    if (g.mapObj !== W) return { erreur: 'pas dehors' };
    P.carte0 = W;
    const p = g.player, x0 = p.x, y0 = p.y;
    const cible = (x, y) => Math.abs(x - x0) + Math.abs(y - y0) >= 120 && [T.PATH, T.GRASS, T.PAVE].includes(W.get(x, y));
    const L = await P.chemin(cible);
    if (!L) return { erreur: 'pas de chemin' };
    const m = await P.allerA(cible, 120000);
    return { chemin: L.length, marche: m, ...(m.ok ? {} : { bloque: m }) };
  }));

  // sauts d'un bout à l'autre de la région (Vol) : temps avant que l'écran se rouvre, vide, mémoire
  const sauts = await pg((n) => {
    const W = window.__ody.world.maps.monde, out = [];
    for (let i = 0; i < n; i++) { const z = W.zones.filter((z) => z.town)[Math.floor(i * 7.3) % W.zones.filter((z) => z.town).length]; out.push(z.town); }
    return [...new Set(out)];
  }, NSAUTS);
  for (const ville of sauts) {
    await etape(`vol vers ${ville}`, async () => pg(async (ville) => {
      const O = window.__ody, g = O.game, P = window.__parcours, W = O.world.maps.monde;
      const t = O.world.towns?.[ville] || null;
      const c = [...W.warps].find(([, w]) => /center|centre/i.test(w.map) && w.map.startsWith(ville + ':')) || [...W.warps].find(([, w]) => w.map.startsWith(ville + ':'));
      if (!c) return { erreur: 'pas de porte' };
      const [x, y] = c[0].split(',').map(Number);
      await P.attendreLibre();
      const t0 = performance.now();
      await g.warp({ map: 'monde', x, y: y + 1, dir: 'down' }, 'exit');
      const tr = Math.round(performance.now() - t0);
      await P.attendre(800);
      return { transition: tr, vide: P.vide() };
    }, ville));
  }

  // combat sauvage
  await etape('combat sauvage', async () => pg(async () => {
    const O = window.__ody, g = O.game, P = window.__parcours;
    await P.attendreLibre();
    const t0 = performance.now(); let premier = null;
    const obs = setInterval(() => { if (premier == null && g.bv.alive) premier = Math.round(performance.now() - t0); }, 10);
    const res = await Promise.race([g.wildBattle([[16, 5, 5, 1]], { fixed: true }), P.attendre(120000).then(() => 'temps')]);
    clearInterval(obs);
    await P.attendreLibre();
    return { resultat: res, transition: premier, combatMs: Math.round(performance.now() - t0) };
  }));

  // menus : ouvrir le menu, chaque écran, refermer
  await etape('menus', async () => pg(async () => {
    const O = window.__ody, g = O.game, P = window.__parcours;
    P.valider = false;
    const ok = [];
    for (const k of ['menu', 'map', 'quests', 'trophies']) {
      await P.attendreLibre();
      g.onKey(k); await P.attendre(900);
      const ouvert = !!g.ui.root.querySelector('.screen') || !g.input.free;
      for (let i = 0; i < 4 && !g.input.free; i++) { g.input.emit('b'); await P.attendre(400); }
      ok.push([k, ouvert, g.input.free]);
    }
    P.valider = true;
    return { ecrans: ok, mainRendue: ok.every((x) => x[2]) };
  }));

  // aller-retour pour les fuites : retour au point de départ, mémoire comparée à celle de l'arrivée
  const retour = await etape('retour à Bourg-Aube', async () => {
    const t = await pg(async () => {
      const O = window.__ody, g = O.game, P = window.__parcours, W = O.world.maps.monde;
      const lab = [...W.warps].find(([, w]) => w.map === 'aube:labo'); const [x, y] = lab[0].split(',').map(Number);
      await P.attendreLibre(); const t0 = performance.now();
      await g.warp({ map: 'monde', x, y: y + 2, dir: 'up' }, 'exit'); await P.attendre(1500);
      return Math.round(performance.now() - t0);
    });
    return { transition: t, memoire: await memoire() };
  });
  // dix allers-retours dans une maison : rien ne doit s'accumuler
  const mA = await memoire();
  await etape('10 allers-retours au labo', async () => pg(async () => {
    const O = window.__ody, g = O.game, P = window.__parcours, W = O.world.maps.monde;
    const lab = [...W.warps].find(([, w]) => w.map === 'aube:labo'); const [x, y] = lab[0].split(',').map(Number);
    const T0 = performance.now(), tr = [];
    for (let i = 0; i < 10; i++) {
      await P.attendreLibre(); let t0 = performance.now();
      await g.warp(W.warpAt(x, y)); tr.push(Math.round(performance.now() - t0));
      await P.attendreLibre(); t0 = performance.now();
      await g.warp({ map: 'monde', x, y: y + 1, dir: 'down' }, 'exit'); tr.push(Math.round(performance.now() - t0));
    }
    return { transitions: tr, transition: Math.round(tr.reduce((a, b) => a + b, 0) / tr.length), ms: Math.round(performance.now() - T0) };
  }));
  const mB = await memoire();
  R.fuite = { avant: mA, apres: mB, geo: mB.geo - mA.geo, tex: mB.tex - mA.tex, tas: +(mB.tas - mA.tas).toFixed(1) };
  log(`Aller-retour ×10 : géométries ${mA.geo} → ${mB.geo}, textures ${mA.tex} → ${mB.tex}, tas ${mA.tas} → ${mB.tas} Mo, objets de la scène ${mA.objets} → ${mB.objets}`);
  log(`Mémoire : titre ${JSON.stringify(R.memoireTitre)}\n          départ ${JSON.stringify(R.memoireDepart)}\n          fin ${JSON.stringify(retour.memoire)}`);

  // sauvegarde, rechargement de la page, reprise
  const avant = await pg(() => { const g = window.__ody.game; g.save(true); return { map: g.mapObj.id, x: g.player.x, y: g.player.y, party: g.state.party.length }; });
  R.phase = 'reprise';
  const d2 = await demarrer(false);
  R.demarrage2 = d2;
  log(`Rechargement : titre ${d2.boot.pret} ms`);
  const apres = await pg(async () => {
    const O = window.__ody, g = O.game;
    const s = g.load(); await O.play(s); window.__parcours.valider = true;
    return { map: g.mapObj.id, x: g.player.x, y: g.player.y, party: g.state.party.length };
  });
  R.reprise = { avant, apres, ok: JSON.stringify(avant) === JSON.stringify(apres) };
  log(R.reprise.ok ? '✓ reprise au même endroit' : `✗ reprise ailleurs : ${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);
} catch (e) {
  R.console.push({ t: 'parcours', m: String(e.stack || e).slice(0, 600) });
  log('✗ parcours interrompu : ' + e.message);
} finally {
  await browser.close(); server.close();
}

const erreurs = R.console.filter((c) => c.t === 'error' || c.t === 'pageerror' || c.t === 'parcours');
const avert = R.console.filter((c) => c.t === 'warning');
const grouper = (L) => { const M = new Map(); for (const c of L) { const k = c.m.replace(/\d+/g, '#').slice(0, 140); M.set(k, (M.get(k) || 0) + 1); } return [...M].sort((a, b) => b[1] - a[1]); };
log(`\nConsole : ${erreurs.length} erreur(s), ${avert.length} avertissement(s)`);
for (const [m, n] of grouper(erreurs).slice(0, 12)) log(`  ✗ ${n} × ${m}`);
for (const [m, n] of grouper(avert).slice(0, 8)) log(`  ! ${n} × ${m}`);
if (R.bloque.length) log(`✗ joueur bloqué ${R.bloque.length} fois : ${JSON.stringify(R.bloque.slice(0, 4))}`);
if (R.vide.length) log(`! vide à l'écran : ${JSON.stringify(R.vide.slice(0, 6))}`);
fs.writeFileSync(path.join(OUT, 'parcours.json'), JSON.stringify(R, null, 1));
log(`Détail : ${path.join(OUT, 'parcours.json')}`);
// les erreurs de réseau (sauvegarde en ligne coupée exprès) ne comptent pas
const graves = erreurs.filter((c) => !/Failed to load resource|ERR_FAILED|net::/.test(c.m));
const fuite = R.fuite && (R.fuite.geo > 20 || R.fuite.tex > 4);
if (graves.length || R.empreinte?.differences?.length || R.bloque.length || fuite || (R.reprise && !R.reprise.ok)) process.exitCode = 1;
