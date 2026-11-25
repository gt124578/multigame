// Banc d'essai du moteur HGSS dans Chrome (Playwright) : le labo (lieux, téléportation, réglages d'essai), la vitesse
// ×2 / ×4, les modèles faits à la main (glTF) et les à-coups en marchant.
//   PRET=<clone pret/pokeheartgold> PDSMS=<clone Pokémon DS Map Studio> [PLAT=<clone pret/pokeplatinum>]
//   node tools/test-moteur-hgss-labo.mjs
// PLAYWRIGHT=<chemin du module> et CHROME_PATH=<chrome> si besoin. Sauté sans Playwright ni clones.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRET = process.env.PRET || '/tmp/ext/pret', PDSMS = process.env.PDSMS || '/tmp/ext/pdsms', PLAT = process.env.PLAT || '/tmp/ext/plat';
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT || 'playwright')); } catch { console.log('Playwright absent : test sauté'); process.exit(0); }
if (!existsSync(PRET) || !existsSync(PDSMS)) { console.log('clones absents (PRET, PDSMS) : test sauté'); process.exit(0); }

/** un petit .glb fait à la main : un pavé de couleur (l × h × p cases), posé au sol, centré */
function glbPave(l, h, p, rgb) {
  const x = l / 2, z = p / 2;
  const pos = new Float32Array([-x, 0, z, x, 0, z, x, h, z, -x, h, z, -x, 0, -z, x, 0, -z, x, h, -z, -x, h, -z]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'pave' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-x, 0, -z], max: [x, h, z] }, { bufferView: 1, componentType: 5123, count: idx.length, type: 'SCALAR' }],
  };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bn = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const tete = Buffer.alloc(12); tete.writeUInt32LE(0x46546c67, 0); tete.writeUInt32LE(2, 4); tete.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
  const c = (n, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(n, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([tete, c(js.length, 0x4e4f534a), js, c(bn.length, 0x004e4942), bn]);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1024, height: 768 } });
const servir = (prefixe, dossier, re) => p.route(prefixe + '/**', async (r) => {
  const u = decodeURIComponent(new URL(r.request().url()).pathname);
  try { await r.fulfill({ status: 200, contentType: TYPES[path.extname(u)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: await readFile(path.join(dossier, u.replace(re, ''))) }); }
  catch { await r.fulfill({ status: 404, body: '' }); }
});
await servir('http://depot.local', RACINE, /^\//);
await servir('https://raw.githubusercontent.com/Trifindo/Pokemon-DS-Map-Studio', PDSMS, /^\/Trifindo\/Pokemon-DS-Map-Studio\/[0-9a-f]+\//);
await servir('https://raw.githubusercontent.com/pret/pokeplatinum', PLAT, /^\/pret\/pokeplatinum\/[0-9a-f]+\//);
await servir('https://raw.githubusercontent.com/pret/pokeheartgold', PRET, /^\/pret\/pokeheartgold\/[0-9a-f]+\//);
// modèles faits à la main : une liste d'essai (rien n'est écrit dans le dépôt)
await p.route('http://depot.local/odyssee/moteur/modeles/**', async (r) => {
  const f = new URL(r.request().url()).pathname.split('/').pop();
  if (f === 'remplacements.json') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ cartes: { NEW_BARK: 'sol.glb' }, personnages: { player_m: 'joueur.glb' } }) });
  if (f === 'sol.glb') return r.fulfill({ contentType: 'model/gltf-binary', body: glbPave(32, 0.2, 32, [0.2, 0.7, 0.3]) });
  if (f === 'joueur.glb') return r.fulfill({ contentType: 'model/gltf-binary', body: glbPave(0.8, 1.6, 0.6, [0.9, 0.2, 0.2]) });
  return r.fulfill({ status: 404, body: '' });
});
const erreurs = [];
p.on('pageerror', (e) => erreurs.push(e.message));
let ok = 0, ko = 0;
const verifier = (c, m) => { if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };
const attendre = (f, arg, ms = 60000) => p.waitForFunction(f, arg, { timeout: ms }).then(() => true, () => false);
const ici = () => p.evaluate(() => { const { T } = window.__moteur; return { zone: T.zone?.id, x: T.joueur.x, y: T.joueur.y, libre: !T.transition && !T.ctxs.length && !T.joueur.m }; });

await p.goto('http://depot.local/odyssee/moteur.html?labo&debug&nouveau&langue=en&zone=NEW_BARK&x=690&y=400');
verifier(await attendre(() => window.__moteur && document.querySelector('.labo-barre'), null, 180000), 'le labo s\'ouvre (barre d\'outils)');
await p.waitForTimeout(1500);

// ——— les lieux ———
const n = await p.evaluate(() => document.querySelectorAll('.labo-barre button').length);
await p.keyboard.press('KeyJ');
const nLieux = await p.evaluate(() => document.querySelectorAll('.labo-liste option').length);
verifier(n >= 10 && nLieux > 400, `${nLieux} lieux dans la liste, rangés par famille (${await p.evaluate(() => document.querySelectorAll('.labo-liste optgroup').length)} familles)`);
await p.fill('.labo-cherche', 'VIOLET_GYM');
await p.keyboard.press('Enter');
verifier(await attendre(() => { const T = window.__moteur.T; return T.zone?.id === 'VIOLET_GYM' && !T.transition; }), 'téléportation par la liste : Arène de Mauville (carte chargée en route)');
// on passe par la liste, comme à la main
const aller = async (id) => {
  await p.keyboard.press('KeyJ'); await p.fill('.labo-cherche', id); await p.keyboard.press('Enter');
  return attendre((id) => { const T = window.__moteur.T; return T.zone?.id === id && !T.transition && !T.joueur.m; }, id);
};
for (const id of ['ROUTE_32', 'ICE_PATH_1F', 'POKEMON_LEAGUE_LANCE_ROOM', 'SAFFRON']) verifier(await aller(id), `téléportation : ${id} (${JSON.stringify(await ici())})`);
// suivant (N) : le lieu d'après dans la liste
const avant = (await ici()).zone;
await p.keyboard.press('KeyN');
verifier(await attendre((a) => { const T = window.__moteur.T; return T.zone?.id && T.zone.id !== a && !T.transition; }, avant), `N passe au lieu suivant (${avant} → ${(await ici()).zone})`);
// revue : marquer un lieu
await p.keyboard.press('KeyJ');
await p.fill('.labo-note', 'escalier à vérifier');
await p.click('[data-pb]');
const revue = await p.evaluate(() => JSON.parse(localStorage.getItem('moteur-hgss-labo-revue') || '{}'));
verifier(Object.values(revue).some((r) => r.etat === 'pb' && r.note === 'escalier à vérifier'), 'revue des lieux : « à revoir » avec une note, gardée dans le navigateur');

// ——— réglages d'essai ———
await aller('ROUTE_29');
const tour = await p.evaluate(async () => {
  const { T } = window.__moteur;
  // passer les murs : on traverse une case bloquée
  T.reglages.murs = false;
  const M = T.M; let mur = null;
  for (let y = T.joueur.y - 6; y < T.joueur.y + 6 && !mur; y++) for (let x = T.joueur.x - 8; x < T.joueur.x + 8 && !mur; x++) if (M.bloquee(x, y) && !M.bloquee(x, y + 1) && M.zone(x, y + 1)?.id === 'ROUTE_29') mur = [x, y];
  if (!mur) return { mur: null };
  T.placerJoueur(mur[0], mur[1] + 1, 0);
  for (let k = 0; k < 40; k++) T.pas({ dir: 0, a: false, b: false, course: false, velo: false });
  const passe = T.joueur.y < mur[1] + 1;
  T.reglages.murs = true;
  // rencontres coupées : 400 pas dans les hautes herbes sans combat
  T.reglages.rencontres = false;
  let combat = false;
  for (let y = 0; y < M.hauteur && !combat; y++) for (let x = 0; x < M.largeur; x++) if (M.zone(x, y)?.id === 'ROUTE_29' && M.props(x, y).rencontre === 'herbe' && M.props(x + 1, y).rencontre === 'herbe') {
    T.placerJoueur(x, y, 3);
    for (let k = 0; k < 400; k++) { T.pas({ dir: k % 40 < 20 ? 3 : 2, a: false, b: false, course: false, velo: false }); if (T.combatEnCours) { combat = true; break; } }
    break;
  }
  T.reglages.rencontres = true;
  return { mur, passe, combat };
});
verifier(tour.mur && tour.passe, `murs coupés : on traverse la case bloquée ${tour.mur}`);
verifier(tour.mur && !tour.combat, 'rencontres coupées : 400 pas dans les herbes, aucun combat');
// combats gagnés d'office
await p.evaluate(() => [...document.querySelectorAll('.labo-barre button')].find((b) => b.textContent.startsWith('🥊')).click());
const gagne = await p.evaluate(async () => {
  const { T } = window.__moteur;
  T.combat({ type: 'sauvage', espece: 'pidgey', niveau: 3 });
  await new Promise((r) => setTimeout(r, 300));
  return !T.combatEnCours;
});
verifier(gagne, 'combats gagnés d\'office : le combat se termine sans écran');
await p.evaluate(() => [...document.querySelectorAll('.labo-barre button')].find((b) => b.textContent.startsWith('🥊')).click());
// équipe et badges
await p.evaluate(() => [...document.querySelectorAll('.labo-barre button')].find((b) => b.textContent.startsWith('🎒')).click());
await p.click('[data-eq="2"]'); await p.click('[data-tous]');
const st = await p.evaluate(() => { const { T } = window.__moteur; return { n: T.etat.equipe.length, niv: T.etat.equipe[0]?.lvl, badges: [...T.etat.drapeaux].filter((f) => f.startsWith('BADGE_')).length, surf: T.capacite('surf') }; });
await p.click('[data-cs]');
const cs = await p.evaluate(() => window.__moteur.T.capacite('surf') && window.__moteur.T.capacite('cascade'));
verifier(st.n === 6 && st.badges === 16 && !st.surf && cs, `équipe forte (${st.n} POKéMON, N.${st.niv}), 16 badges (SURF : il faut encore la CS), toutes les CS cochées : SURF et CASCADE`);
await p.keyboard.press('Escape');

// gabarit pour Blender : les formes de la carte en .obj
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }).catch(() => null),
  p.evaluate(() => [...document.querySelectorAll('.labo-barre button')].find((b) => b.textContent.startsWith('📐')).click())]);
const obj = dl ? await readFile(await dl.path(), 'utf8') : '';
const nv = (obj.match(/^v /gm) || []).length, nf = (obj.match(/^f /gm) || []).length;
verifier(nv > 100 && nf > 30 && /^o sol/m.test(obj) && /^o batiment_/m.test(obj), `gabarit .obj (${dl?.suggestedFilename()}) : ${nv} sommets, ${nf} triangles, sol et bâtiments`);

// ——— vitesse ———
const rythme = async () => p.evaluate(async () => { const { T } = window.__moteur, t0 = T.t, d = performance.now(); await new Promise((r) => setTimeout(r, 1000)); return (T.t - t0) / ((performance.now() - d) / 1000); });
const v1 = await rythme();
await p.keyboard.press('KeyT');
const v2 = await rythme();
await p.keyboard.down('Shift'); await p.keyboard.press('KeyT'); await p.keyboard.up('Shift');
const v4 = await rythme();
await p.keyboard.press('KeyT');
verifier(v2 > v1 * 1.7 && v4 > v1 * 3.4, `vitesse : ${v1.toFixed(0)} pas/s, ×2 → ${v2.toFixed(0)}, ×4 → ${v4.toFixed(0)} (touche T, Maj + T)`);

// ——— modèles faits à la main ———
await aller('NEW_BARK');
await p.waitForTimeout(1500);
const rem = await p.evaluate(() => {
  const { R } = window.__moteur; let cartes = 0, perso = 0;
  R.scene.traverse((o) => { const e = o.userData.remplacement; if (e?.fichier === 'sol.glb') cartes++; if (e?.fichier === 'joueur.glb' && o.parent?.visible !== false) perso++; });
  return { cartes, perso };
});
verifier(rem.cartes >= 1 && rem.perso === 1, `remplacements.json : la carte de NEW_BARK et le joueur en modèles .glb (${rem.cartes} carte, ${rem.perso} joueur)`);

// ——— à-coups en marchant (vers l'ouest sur la Route 29, jusqu'à Ville Griotte) ———
await aller('ROUTE_29');
await p.evaluate(() => { const { T } = window.__moteur; T.reglages.murs = false; T.teleporter({ zone: 'ROUTE_29', x: 671, y: 396, dir: 2 }); });
await attendre(() => { const T = window.__moteur.T; return T.joueur.x === 671 && !T.transition; });
await p.waitForTimeout(2000);
const marche = await p.evaluate(async () => {
  const { T } = window.__moteur;
  T.reglages.murs = false; T.reglages.rencontres = false; T.reglages.dresseurs = false;
  const lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
  dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
  await new Promise((r) => setTimeout(r, 7000));
  dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
  T.reglages.murs = true; T.reglages.rencontres = true; T.reglages.dresseurs = true;
  return { x: T.joueur.x, lt };
});
verifier(marche.x <= 650 && marche.lt.filter((d) => d > 120).length === 0, `marche : de x 671 à x ${marche.x} sans à-coup de plus de 120 ms (tâches longues : ${marche.lt.join(' ') || 'aucune'})`);

verifier(!erreurs.length, 'aucune erreur dans la page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(`\n${ok} vérifications passées${ko ? `, ${ko} échouées` : ''}.`);
process.exit(ko ? 1 : 0);
