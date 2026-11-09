// odyssee/js/main.js — démarrage : images dessinées, rendu basse résolution, écran titre (Odyssor sur la mer),
// nouvelle partie / continuer, aide des touches
import * as THREE from 'three';
import { WorldView } from './render/world3d.js';
import { setArt } from './render/textures.js';
import { buildWorld } from './world/region.js';
import { Input } from './input.js';
import { brancherManette } from './manette.js';
import { brancherTactile } from './tactile.js';
import { Sound } from './audio.js';
import { UI, el, esc, wait } from './ui/ui.js';
import { optionsScreen, loadCodeScreen } from './ui/screens.js';
import { decodeSave, saveSummary } from './core/savecode.js';
import { Cloud } from './net/cloud.js';
import { Game } from './game.js';
import { apparenceScreen } from './ui/apparence.js';
import { createMon } from './core/mon.js';
import { ASSETS, loadImg, loadAll } from './assets.js';
import { DECOR_PLUS } from './data/decor-plus.js';
import { SPRITES } from './data/sprites.js';
import { SOL16_FICHIERS } from './data/sol16.js';
import { R, ORIGINALES } from './data/remplacants.js';

const H = window.HubBridge;
// étapes du démarrage, en millisecondes depuis l'ouverture de la page (lues par tools/odyssee-parcours.mjs)
const BOOT = window.__odyBoot = { module: Math.round(performance.now()) };
const etape = (k) => { BOOT[k] = Math.round(performance.now()); };
const canvas = document.getElementById('gl'), uiRoot = document.getElementById('ui'), loading = document.getElementById('loading');

function fatal(e) {
  console.error(e);
  loading.style.display = 'flex'; loading.innerHTML = `<div>Oups, le jeu a rencontré un problème.<br><small>${esc(e && e.message ? e.message : e)}</small></div>`;
  if (H && H.logCrash) H.logCrash('CRASH_JS_ERROR', 'Odyssée : ' + (e && e.message ? e.message : e), { stack: e && e.stack });
}
// une fois le jeu affiché, une erreur isolée (un script de PNJ, une image, une promesse oubliée) ne cache plus l'écran :
// elle est notée (console, journal du Hub) et la partie continue ; l'écran d'erreur reste pour le démarrage, ou si
// chaque image échoue pendant 3 s (la partie ne peut plus avancer)
let enJeu = false;
const signales = new Set();
function incident(e) {
  if (!enJeu) { fatal(e); return; }
  console.error('[odyssée] incident', e);
  const msg = e && e.message ? e.message : String(e);
  if (H && H.logCrash && !signales.has(msg) && signales.size < 20) { signales.add(msg); H.logCrash('CRASH_JS_ERROR', 'Odyssée (en jeu) : ' + msg, { stack: e && e.stack }); }
}
addEventListener('error', (e) => incident(e.error || e.message));
addEventListener('unhandledrejection', (e) => incident(e.reason));

// éléments de décor dessinés repris dans le jeu (les autres restent dessinés par le code : herbes, fleurs…)
const NATURE = ['tree', 'tree2', 'pine', 'snowpine', 'deadtree', 'palm', 'bush', 'rock', 'stalag', 'sign', 'fence', 'lamp', 'mailbox', 'pot', 'itemball', 'bang', 'statue'];
const MOBILIER_PLUS = ['machine_sous', 'borne_tetris', 'borne_invaders', 'borne_briques', 'borne_serpent'];
const SOLS = ['tall0', 'tall1', 'darktall0', 'darktall1', 'snowtall0', 'snowtall1', 'floor_wood', 'floor_center', 'floor_mart', 'floor_lab', 'floor_league', 'floor_gymBug', 'floor_gymRock', 'floor_gymWater', 'floor_gymElec', 'floor_gymGrass', 'floor_gymPsy', 'floor_gymFire', 'floor_gymDragon', 'wall_center', 'wall_mart', 'wall_gym', 'wall_league'];

/** les images du décor ; prechauffe : seulement lancer leur téléchargement (rendu tout de suite, sans attendre) */
async function loadArt(prechauffe = false) {
  const sprites = {};
  // décor version 2 (vue de 3/4, bible) : tout ce que la planche fournit ; sinon la sélection de la première planche
  for (const k of SPRITES.natureV2 ? Object.keys(SPRITES.nature) : NATURE) sprites[k] = ASSETS.nature(k);
  const dens = {}; for (const [k, v] of Object.entries(SPRITES.nature || {})) if (v[2]) dens[k] = v[2];
  // mobilier (sans écraser un élément de la nature du même nom, comme la statue d'arène)
  for (const k of Object.keys(SPRITES.mobilier || {})) if (!sprites[k]) sprites[k] = ASSETS.mobilier(k);
  for (const [k, v] of Object.entries(SPRITES.mobilier || {})) if (v[2] && !dens[k]) dens[k] = v[2];
  // mobilier dessiné à part (Casino de Métropole : machines à sous et bornes d'arcade), même densité que la planche
  for (const k of MOBILIER_PLUS) { sprites[k] = ASSETS.mobilier(k); dens[k] = 2; }
  // décor du tileset (fontaine, torii, lanternes, cloche…) : dessiné à la densité des tuiles du DS
  for (const k of Object.keys(SPRITES.deco || {})) if (!sprites[k]) { sprites[k] = ASSETS.deco(k); dens[k] = 1; }
  // décor ajouté à la main (arbres d'automne, relief…) : data/decor-plus.js
  for (const [k, [dir, d]] of Object.entries(DECOR_PLUS)) { sprites[k] = ASSETS[dir](k); dens[k] = d; }
  const kits = {}; for (const k of SPRITES.facades || []) kits[k] = ASSETS.facade(k);
  const sols = {}; for (const k of SOLS) sols[k] = ASSETS.sol(k);
  // tileset global (tools/odyssee-tileset.py) : sols à 32 px et pièces des hautes herbes
  const sol32 = {}; for (const k of SPRITES.sol32 || []) sol32[k] = ASSETS.sol32(k);
  for (const [th, ks] of Object.entries(SPRITES.herbes || {})) for (const k of ks) sol32[`h_${th}_${k}`] = ASSETS.herbe(`${th}_${k}`);
  // sols à 16 px (PixelLab) : ils remplacent ceux du tileset
  for (const k of SOL16_FICHIERS) sol32['s16_' + k] = ASSETS.sol16(k);
  // devant un personnage dans l'herbe : le bas de la nappe du tileset (et l'image de l'herbe qui bouge)
  for (const [th, key] of [['prairie', 'grassfront'], ['bois', 'darkfront'], ['neige', 'snowfront']]) {
    if (!SPRITES.herbes?.[th]) continue;
    sprites[key] = ASSETS.herbe(th + '_front'); sprites[key + '2'] = ASSETS.herbe(th + '_front2'); dens[key] = dens[key + '2'] = 2;
  }
  // devant un personnage dans les hautes herbes à 16 px : le bas de la tuile
  sprites.grassfront = ASSETS.sol16('hautes_herbes_front'); sprites.grassfront2 = ASSETS.sol16('hautes_herbes_front2'); dens.grassfront = dens.grassfront2 = 1;
  // animations de terrain de HeartGold / SoulSilver (mer, rivages, fleurs)
  const hg = {}; for (const k of Object.keys(SPRITES.hgss || {})) hg[k] = ASSETS.hgss(k);
  if (prechauffe) {
    // même requête que loadImg (crossOrigin), pour que le cache des images du navigateur la resserve telle quelle
    const L = [sprites, kits, sols, sol32, hg].flatMap(Object.values).concat([ASSETS.chars, ASSETS.title, SPRITES.suiveurs && ASSETS.suiveurs, ASSETS.relief]);
    return L.filter(Boolean).map((src) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = src; return im; });
  }
  const [S, K, L, L32, HGI, chars, title, suiveurs, relief] = await Promise.all([loadAll(sprites), loadAll(kits), loadAll(sols), loadAll(sol32), loadAll(hg), loadImg(ASSETS.chars), loadImg(ASSETS.title), SPRITES.suiveurs ? loadImg(ASSETS.suiveurs) : null, loadImg(ASSETS.relief).catch(() => null)]);
  return { sprites: S, dens, kits: K, sols: L, sol32: L32, hgss: HGI, chars, title, suiveurs, relief };
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });   // stencil : ombres au sol sans double couche (render/ombres.js)
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const input = new Input(), sound = new Sound(), ui = new UI(uiRoot, input, sound);
  brancherManette(input); brancherTactile(input);   // manette et commandes tactiles : les mêmes touches que le clavier
  // la construction de la carte occupe le processeur plusieurs secondes d'un seul tenant : les images se téléchargent
  // pendant ce temps (loadArt les retrouve ensuite dans le cache du navigateur), et l'écran de chargement est affiché avant
  const prechauffe = await loadArt(true);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  etape('ecran');
  const world = buildWorld();
  etape('carte');
  const art = await loadArt();
  prechauffe.length = 0;
  etape('images');
  setArt({ kits: art.kits, sols: art.sols, sol32: art.sol32, hgss: art.hgss, relief: art.relief });
  const view = new WorldView(renderer, art.chars, { sprites: art.sprites, dens: art.dens, suiveurs: art.suiveurs });
  etape('vue');
  const game = new Game({ view, ui, input, sound, world });
  // sauvegarde en ligne (compte du Hub) : chaque sauvegarde part aussi sur le serveur, regroupée
  const cloud = game.cloud = new Cloud();
  game.onSaved = (silent) => { if (silent) cloud.queue(game.state); };
  const bye = () => { if (game.state && mode === 'game') { game.save(true); cloud.flush(); } };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bye(); });
  addEventListener('pagehide', bye);
  cloud.fetch();
  window.__ody = { game, world, view, ui, sound, cloud, mon: (sp, lvl) => createMon(sp, lvl), playIntroVideo: () => playIntroVideo(ui, input, sound), testIntro: () => intro(game, ui, sound) };

  // rendu en basse résolution, agrandi sans lissage : chaque « pixel » du jeu fait --px pixels d'écran
  const resize = () => {
    // le monde : une case fait 32 pixels de rendu, environ 12 cases de haut comme sur DS (agrandi d'un facteur entier)
    const scale = Math.max(1, Math.round(innerHeight / 400));
    const iw = Math.ceil(innerWidth / scale), ih = Math.ceil(innerHeight / scale);
    renderer.setSize(iw, ih, false); view.resize(iw, ih);
    // l'interface garde son propre pas de pixel
    const ui = Math.max(2, Math.round(innerHeight / 270));
    document.documentElement.style.setProperty('--px', ui + 'px');
    document.documentElement.style.setProperty('--bp', (innerHeight / 192) + 'px');
  };
  addEventListener('resize', resize); resize();
  // le premier appui débloque le son
  const unlock = () => sound.init();
  addEventListener('keydown', unlock); addEventListener('pointerdown', unlock);
  ui.helpButton();

  let mode = 'title', last = performance.now(), enPanne = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);   // d'abord : une erreur dans l'image ne doit pas arrêter le jeu
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode !== 'game') return;
    try { game.tick(dt); enPanne = 0; } catch (e) { if (!enPanne) incident(e); if (++enPanne === 180) fatal(e); }
  };
  view.setMap(world.maps.monde); view.setTimeOfDay(new Date().getHours() + new Date().getMinutes() / 60);
  loading.style.display = 'none';
  etape('pret'); enJeu = true;
  requestAnimationFrame(loop);
  ui.fade(false, 500);
  if (H && H.embedded) H.signalReady();
  // outil de test : démarrer directement une partie depuis la console
  window.__ody.play = async (state) => { document.querySelector('.title-scr')?.remove(); input.handlers.length = 0; ui.closeDialog(); mode = 'game'; await game.start(state); };

  // version test (odyssee/test/) : on choisit un lieu et une équipe, et on y apparaît ; rien n'est sauvegardé
  if (window.ODYSSEE_TEST) {
    cloud.on = false;
    const { startLabo } = await import('./labo/labo.js');
    await startLabo({ game, world, view, ui, input, sound, setMode: (m) => { mode = m; } });
    return;
  }

  /* ---------------- écran titre ---------------- */
  for (;;) {
    sound.play('title');
    const title = el('div', 'title-scr', `<canvas class="title-cv" width="256" height="192"></canvas><div class="logo"><div class="logo-main">ODYSSÉE</div></div><div class="press">Appuie sur F ou Entrée</div><div class="title-foot">H : aide des touches</div>`);
    uiRoot.appendChild(title);
    const stopSea = titleSea(title.querySelector('canvas'), art.title);
    await new Promise((res) => { const pop = input.push((k) => { if (k === 'a') { pop(); sound.init(); sound.sfx('select'); res(); } }); });
    title.querySelector('.press').remove();
    // la sauvegarde en ligne a quelques secondes pour répondre (le serveur peut être en train de se réveiller)
    if (cloud.on && cloud.remote === undefined) await Promise.race([cloud.fetch(), wait(2500)]);
    let info = null;
    if (Game.hasSave()) { try { info = JSON.parse(localStorage.getItem(Game.SAVE_KEY)); } catch (e) {} }
    const remote = cloud.remote?.state || null;
    const newer = remote && (!info || (remote.time || 0) > (info.time || 0) + 5);
    const has = !!info || !!remote;
    const opts = (has ? ['Continuer'] : []).concat(['Nouvelle partie'], cloud.on ? ['Sauvegarde en ligne'] : [], ['Charger un code', 'Options'], H && H.embedded ? ['Retour au salon'] : []);
    const card = info ? el('div', 'box save-info', `<b>${esc(info.name)}</b><br>Badges : ${info.badges.filter(Boolean).length} · Pokédex : ${info.dex.caught.length}<br>Temps : ${Math.floor(info.time / 3600)}:${String(Math.floor(info.time / 60) % 60).padStart(2, '0')}`) : null;
    if (card) title.appendChild(card);
    const r = await ui.list({ items: opts.map((label) => ({ label })), cls: 'title-menu', cancel: null, parent: title });
    const pick = opts[r];
    if (pick === 'Options') { stopSea(); title.remove(); await optionsScreen(game); continue; }
    if (pick === 'Retour au salon') { H.exit(); stopSea(); title.remove(); continue; }
    if (pick === 'Sauvegarde en ligne') { stopSea(); title.remove(); await onlineScreen(ui, cloud, info); continue; }
    if (pick === 'Charger un code') {
      stopSea(); title.remove();
      const r = await loadCodeScreen(ui, decodeSave);
      if (!r) continue;
      if (has && !(await ui.yesNo(`Remplacer la partie de cet appareil par celle de ${r.state.name} ? (${saveSummary(r.state)})`))) continue;
      try { localStorage.setItem(Game.SAVE_KEY, JSON.stringify(r.state)); } catch (e) { await ui.say('Impossible d\'enregistrer la partie sur cet appareil.'); continue; }
      sound.sfx('save');
      await ui.say(`Partie de ${r.state.name} chargée ! Choisis « Continuer » pour la reprendre.`);
      continue;
    }
    if (pick === 'Nouvelle partie' && has && !(await ui.yesNo(remote ? 'Une partie existe déjà (sur cet appareil ou en ligne). La nouvelle la remplacera à la première sauvegarde. Continuer ?' : 'Une sauvegarde existe déjà. Commencer une nouvelle partie l\'effacera. Continuer ?'))) { stopSea(); title.remove(); continue; }
    stopSea(); title.remove();
    let state;
    if (pick === 'Continuer') {
      // la partie la plus avancée l'emporte : celle de cet appareil, ou celle du compte en ligne
      let useRemote = newer && !info;
      if (newer && info) useRemote = await ui.yesNo(`Ta partie en ligne est plus récente (${saveSummary(remote)}). La reprendre ?`);
      if (useRemote) { try { localStorage.setItem(Game.SAVE_KEY, JSON.stringify(remote)); } catch (e) {} }
      state = useRemote ? game.load(remote) : game.load();
    }
    else { await playIntroVideo(ui, input, sound); state = await intro(game, ui, sound); }
    await ui.fade(true, 300);
    mode = 'game';
    await game.start(state);
    break;
  }
}

/**
 * Écran titre : nuit sur la mer (avec Odyssor qui nage entre les vagues quand les créatures originales sont actives).
 * Rendu en 256 × 192 agrandi sans lissage, comme sur DS.
 */
function titleSea(cv, whale) {
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const W = 256, Hh = 192, SEA = 118;
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % (SEA - 20), p: i * 0.7 }));
  const sparks = [];
  let alive = true; const t0 = performance.now();
  const frame = () => {
    if (!alive) return;
    const t = (performance.now() - t0) / 1000;
    // ciel
    const g = x.createLinearGradient(0, 0, 0, SEA); g.addColorStop(0, '#0b1030'); g.addColorStop(0.6, '#24306a'); g.addColorStop(1, '#5a4e8e');
    x.fillStyle = g; x.fillRect(0, 0, W, SEA);
    for (const s of stars) { const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + s.p)); x.fillStyle = `rgba(255,255,240,${a})`; x.fillRect(s.x, s.y, 1, 1); }
    // lune et son reflet
    x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(36, 26, 11, 0, 7); x.fill(); x.fillStyle = '#24306a'; x.beginPath(); x.arc(41, 23, 9, 0, 7); x.fill();
    // îles au loin
    x.fillStyle = '#1c2348'; x.beginPath(); x.moveTo(0, SEA); x.lineTo(18, SEA - 9); x.lineTo(40, SEA - 4); x.lineTo(62, SEA); x.fill();
    x.beginPath(); x.moveTo(150, SEA); x.lineTo(170, SEA - 13); x.lineTo(182, SEA - 8); x.lineTo(200, SEA); x.fill();
    // mer
    const s = x.createLinearGradient(0, SEA, 0, Hh); s.addColorStop(0, '#2a3c7a'); s.addColorStop(1, '#0e1838');
    x.fillStyle = s; x.fillRect(0, SEA, W, Hh - SEA);
    x.fillStyle = 'rgba(255,246,216,.55)'; for (let y = SEA + 3; y < Hh; y += 4) { const w = 10 - (y - SEA) / 10; x.fillRect(36 - w + Math.sin(t * 2 + y) * 2, y, w * 2, 1); }
    // Odyssor sort de l'eau au milieu de la scène, comme Lugia sur l'écran titre de SoulSilver : il monte lentement,
    // se balance, et l'eau ruisselle de ses ailes ; la mer passe devant le bas de son corps
    const rise = Math.min(1, t / 3), ease = 1 - (1 - rise) ** 3;
    const bob = Math.sin(t * 1.1) * 2.5, wx = 132, wy = Math.round(SEA - 100 + (1 - ease) * 70 + bob);
    if (whale) {
      x.save(); x.beginPath(); x.rect(0, 0, W, SEA + 3); x.clip();
      x.drawImage(whale, Math.round(wx - 80), wy); x.restore();
      // gouttes qui tombent des ailes
      if (Math.random() < 0.8) sparks.push({ x: wx - 62 + Math.random() * 124, y: wy + 30 + Math.random() * 40, v: 0.6 + Math.random() * 0.6, life: 1, drop: true });
    }
    for (const p of sparks) { p.y += p.v; p.v += 0.05; p.life -= 0.018; if (p.y > SEA + 2) p.life = 0; x.fillStyle = `rgba(210,235,255,${Math.max(0, p.life)})`; x.fillRect(Math.round(p.x), Math.round(p.y), 1, 2); }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    // vagues (par-dessus le bas d'Odyssor)
    for (let row = 0; row < 7; row++) {
      const y = SEA + 2 + row * 10, sp = 6 + row * 4, ph = t * (0.6 + row * 0.15);
      x.fillStyle = row < 2 ? '#6c8ad0' : '#3d5aa0';
      for (let k = -1; k < W / 24 + 1; k++) { const bx = ((k * 24 + ph * sp) % (W + 24)) - 12; x.fillRect(Math.round(bx), y, 8, 1); x.fillRect(Math.round(bx) + 2, y - 1, 4, 1); }
    }
    // écume et remous autour du corps, à la surface
    if (whale) {
      for (let k = 0; k < 9; k++) {
        const fx = wx - 34 + k * 8 + Math.sin(t * 4 + k * 1.7) * 2, fy = SEA + 1 + ((k % 3) === 1 ? 1 : 0);
        x.fillStyle = k % 2 ? 'rgba(235,245,255,.9)' : 'rgba(170,205,255,.8)'; x.fillRect(Math.round(fx), fy, 6, 1); x.fillRect(Math.round(fx) + 1, fy - 1, 3, 1);
      }
      x.fillStyle = 'rgba(150,190,255,.35)'; for (let r = 0; r < 3; r++) { const rr = ((t * 14 + r * 12) % 36); x.fillRect(Math.round(wx - 40 - rr), SEA + 4 + r * 3, 10, 1); x.fillRect(Math.round(wx + 30 + rr), SEA + 4 + r * 3, 10, 1); }
    }
    requestAnimationFrame(frame);
  };
  frame();
  return () => { alive = false; };
}

/** écran « Sauvegarde en ligne » : état du compte, et reprise de la partie en ligne */
async function onlineScreen(ui, cloud, info) {
  if (cloud.remote === undefined) {
    ui.say('Connexion au serveur… (il peut mettre jusqu\'à une minute à se réveiller)', { keep: true, noWaitLast: true });
    await cloud.fetch(70000);
    ui.closeDialog();
  }
  if (!cloud.on) { await ui.say('La sauvegarde en ligne n\'est pas encore activée sur le serveur.'); return; }
  if (cloud.remote === undefined) { await ui.say('Le serveur ne répond pas pour l\'instant. Ta partie reste sauvegardée sur cet appareil ; réessaie plus tard.'); return; }
  const id = cloud.fid ? `Compte ${cloud.fid.slice(0, 4)}-${cloud.fid.slice(4)}. ` : '';
  if (!cloud.remote) { await ui.say([`${id}Aucune partie en ligne pour l'instant.`, 'Elle sera créée dès ta prochaine sauvegarde, et tu la retrouveras sur tous tes appareils où tu as importé ton compte du Hub.']); return; }
  const r = cloud.remote.state;
  await ui.say(`${id}Partie en ligne : ${saveSummary(r)}.`, { keep: true });
  if (!(await ui.yesNo(info ? 'La charger sur cet appareil (elle remplace celle d\'ici) ?' : 'La charger sur cet appareil ?'))) return;
  try { localStorage.setItem('odyssee-save-v1', JSON.stringify(r)); } catch (e) { await ui.say('Impossible d\'enregistrer la partie sur cet appareil.'); return; }
  await ui.say(`Partie de ${r.name} chargée ! Choisis « Continuer » pour la reprendre.`);
}

/** cinématique d'ouverture (30 s) lancée au début d'une nouvelle partie, avant le Prof. Saule */
async function playIntroVideo(ui, input, sound) {
  sound.play(null);
  await ui.fade(true, 250);
  const s = el('div', 'screen cine-scr', '<video class="cine-vid" src="img/intro.mp4" playsinline preload="auto"></video><button type="button" class="cine-skip">Passer la cinématique (Entrée / Échap)</button>');
  uiRoot.appendChild(s);
  const vid = s.querySelector('.cine-vid'), skipBtn = s.querySelector('.cine-skip');
  vid.volume = Math.max(0, Math.min(1, sound.vol ?? 0.7));
  await ui.fade(false, 300);
  await new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pop();
      try { vid.pause(); } catch (e) {}
      res();
    };
    const pop = input.push((k) => {
      if (k === 'a' || k === 'b' || k === 'menu') { sound.sfx('select'); finish(); }
    });
    skipBtn.addEventListener('click', (e) => { e.stopPropagation(); sound.sfx('select'); finish(); });
    vid.addEventListener('ended', finish, { once: true });
    vid.addEventListener('error', finish, { once: true });
    const p = vid.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        vid.muted = true;
        vid.play().catch(finish);
      });
    }
  });
  await ui.fade(true, 300);
  s.remove();
  await ui.fade(false, 250);
}

/** présentation du professeur, choix du personnage et du nom */
function chooseGenderCard(ui, input, sound, parent) {
  return new Promise((resolve) => {
    const wrap = el('div', 'intro-cards', `
      <div class="intro-card on" data-g="m">
        <span class="intro-card-tag">DRESSEUR INTRÉPIDE</span>
        <div class="intro-card-art">
          <img src="img/dresseurs/player_m.png" alt="Garçon">
          <div class="intro-card-spr m"></div>
        </div>
        <div class="intro-card-title">Garçon</div>
        <div class="intro-card-sub">Prêt à braver les vents et les arènes de l'archipel</div>
      </div>
      <div class="intro-card" data-g="f">
        <span class="intro-card-tag">EXPLORATRICE CÉLESTE</span>
        <div class="intro-card-art">
          <img src="img/dresseurs/player_f.png" alt="Fille">
          <div class="intro-card-spr f"></div>
        </div>
        <div class="intro-card-title">Fille</div>
        <div class="intro-card-sub">Guidée par les étoiles et le chant des océans</div>
      </div>
    `);
    parent.appendChild(wrap);
    const cards = [...wrap.querySelectorAll('.intro-card')];
    let idx = 0;
    const sync = () => cards.forEach((c, k) => c.classList.toggle('on', k === idx));
    const finish = (g) => {
      pop();
      sound.sfx('select');
      wrap.remove();
      ui.closeDialog();
      resolve(g);
    };
    cards.forEach((c, k) => {
      c.addEventListener('pointerenter', () => { if (idx !== k) { idx = k; sound.sfx('blip'); sync(); } });
      c.addEventListener('click', (e) => { e.stopPropagation(); idx = k; sync(); finish(c.dataset.g); });
    });
    const pop = input.push((k) => {
      if (k === 'left' || k === 'up' || k === 'right' || k === 'down') {
        idx = idx === 0 ? 1 : 0;
        sound.sfx('blip');
        sync();
      } else if (k === 'a') {
        finish(cards[idx].dataset.g);
      }
    });
  });
}

function chooseTrainerName(ui, input, sound, gender, parent) {
  return new Promise((resolve) => {
    const def = gender === 'f' ? 'Lyra' : 'Ethan';
    const presets = gender === 'f'
      ? ['Lyra', 'Céleste', 'Aurore', 'Marina', 'Luna', 'Iris']
      : ['Ethan', 'Sacha', 'Léo', 'Orion', 'Marin', 'Solal'];
    const spr = gender === 'f' ? 'img/dresseurs/player_f.png' : 'img/dresseurs/player_m.png';
    const card = el('div', 'intro-idcard', `
      <div class="intro-id-left">
        <img src="${spr}" alt="">
        <div class="intro-id-badge">BOURG-AUBE · LIGUE D'ODYSSÉE</div>
      </div>
      <div class="intro-id-right">
        <div class="intro-id-head">Carte d'enregistrement · Quel est ton prénom ?</div>
        <input class="intro-id-in" maxlength="10" spellcheck="false" autocomplete="off" value="${esc(def)}">
        <div class="intro-id-chips">
          ${presets.map((p) => `<button type="button" class="intro-id-chip" data-name="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
        <div class="intro-id-foot">
          <span class="intro-id-hint">Tape ton prénom (max 10 lettres) ou choisis une suggestion</span>
          <button type="button" class="intro-id-ok">Valider ▸</button>
        </div>
      </div>
    `);
    parent.appendChild(card);
    const inp = card.querySelector('.intro-id-in');
    const okBtn = card.querySelector('.intro-id-ok');
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    const pop = input.push(() => {});
    const submit = () => {
      const v = inp.value.trim() || def;
      pop();
      card.remove();
      sound.sfx('select');
      resolve(v);
    };
    card.querySelectorAll('.intro-id-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.sfx('blip');
        inp.value = btn.dataset.name;
        inp.focus();
      });
    });
    okBtn.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      e.stopPropagation();
    });
  });
}

async function intro(game, ui, sound) {
  const input = ui.input;
  sound.play('lab');
  const sparksHtml = Array.from({ length: 26 }, (_, i) => {
    const left = (i * 37) % 100, bottom = (i * 19) % 75, delay = ((i * 0.43) % 5.2).toFixed(2), dur = (4.2 + (i % 4) * 0.7).toFixed(2);
    return `<i class="intro-spark" style="left:${left}%;bottom:${bottom}%;animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }).join('');

  const starterSp = R(1001);
  const s = el('div', 'screen intro-scr', `
    <div class="intro-bg"></div>
    <div class="intro-beam"></div>
    <div class="intro-sparks">${sparksHtml}</div>
    <div class="intro-header"><i class="intro-header-dot"></i><span class="intro-chap">LABORATOIRE DE BOURG-AUBE · PROF. SAULE</span></div>
    <div class="intro-stage">
      <div class="intro-pedestal"></div>
      <div class="intro-subped"></div>
      <img class="intro-prof" src="${ASSETS.portrait('saule') || ASSETS.trainer('saule')}" alt="">
      <img class="intro-ball" src="img/battle/poke_ball_48.png" alt="">
      <div class="intro-burst"></div>
      <img class="intro-starter" src="${ASSETS.front(starterSp)}" alt="">
      <img class="intro-hero" alt="">
      <div class="intro-rival-box">
        <div class="intro-rival-ped"></div>
        <img class="intro-rival" src="${ASSETS.trainer('theo')}" alt="">
        <span class="intro-rival-tag">Théo · Voisin</span>
      </div>
    </div>
  `);
  uiRoot.appendChild(s);
  const chap = s.querySelector('.intro-chap'), prof = s.querySelector('.intro-prof'), ped = s.querySelector('.intro-pedestal');
  const subped = s.querySelector('.intro-subped'), ball = s.querySelector('.intro-ball'), burst = s.querySelector('.intro-burst');
  const starter = s.querySelector('.intro-starter'), hero = s.querySelector('.intro-hero'), rivalBox = s.querySelector('.intro-rival-box');

  await wait(350);
  prof.classList.add('in');
  await ui.say([
    'Bonjour ! Bienvenue dans la région d\'Odyssée !',
    'Je m\'appelle Saule. Depuis mon laboratoire de Bourg-Aube, j\'étudie les liens qui unissent les humains et les créatures de cet archipel.'
  ], { speaker: 'Prof. Saule' });

  chap.textContent = 'LES CRÉATURES D\'ODYSSÉE';
  prof.classList.add('side');
  ped.classList.add('side');
  subped.classList.add('in');
  ball.classList.add('toss');
  sound.sfx('select');
  await wait(440);
  ball.src = 'img/battle/poke_ball_open.png';
  ball.classList.add('open');
  burst.classList.add('go');
  await ui.flash(1, '#ffffff', 60);
  starter.classList.add('in');
  sound.cry(ASSETS.cry(starterSp));
  await ui.say([
    'Ce monde est peuplé de créatures étonnantes !',
    'Certains les adoptent comme fidèles compagnons de route, d\'autres les entraînent pour disputer des combats passionnants à travers les quinze Arènes de l\'archipel.'
  ], { speaker: 'Prof. Saule' });

  starter.classList.add('recall');
  await wait(240);
  starter.classList.remove('in', 'recall');
  ball.src = 'img/battle/poke_ball_48.png';
  ball.classList.remove('toss', 'open');
  burst.classList.remove('go');
  subped.classList.remove('in');
  prof.classList.remove('in', 'side');
  ped.classList.remove('side');
  ped.style.opacity = '0';
  await wait(280);

  chap.textContent = 'CHOISIS TON APPARENCE DE DRESSEUR';
  ui.say('Mais parle-moi un peu de toi... Qui es-tu ?', { speaker: 'Prof. Saule', keep: true, noWaitLast: true });
  let gender = await chooseGenderCard(ui, input, sound, s);

  // la tenue : le dresseur par défaut, aux couleurs choisies (casquette ou serre-tête, haut, bas, chaussures, sacoche)
  let tenue = null;
  if (game.view.baseDe?.(gender)) {
    chap.textContent = 'TA TENUE DE DRESSEUR';
    s.style.visibility = 'hidden';
    tenue = await apparenceScreen(ui, { premiere: true, tenue: { genre: gender }, base: (g) => game.view.baseDe(g) });
    s.style.visibility = '';
    if (tenue?.genre) gender = tenue.genre;
  }

  chap.textContent = 'INSCRIPTION À LA LIGUE D\'ODYSSÉE';
  const name = await chooseTrainerName(ui, input, sound, gender, s);

  chap.textContent = `${name.toUpperCase()} & THÉO · DÉPART À BOURG-AUBE`;
  ped.style.opacity = '1';
  hero.src = gender === 'f' ? 'img/dresseurs/player_f.png' : 'img/dresseurs/player_m.png';
  hero.classList.add('in');
  await ui.say([`${name} ! Voilà un prénom qui résonnera bientôt dans toutes les Arènes de la région !`], { speaker: 'Prof. Saule' });

  hero.classList.add('left');
  ped.classList.add('side');
  rivalBox.classList.add('in');
  sound.sfx('select');
  await ui.say([
    'Ton voisin et ami d\'enfance, Théo, est déjà en route vers mon laboratoire à Bourg-Aube pour choisir son premier partenaire !',
  ], { speaker: 'Prof. Saule' });

  rivalBox.classList.remove('in');
  hero.classList.remove('left');
  ped.classList.remove('side');
  await ui.say([
    `Alors, ${name}, prêt${gender === 'f' ? 'e' : ''} à vivre ta propre aventure ? Ton Odyssée commence maintenant !`
  ], { speaker: 'Prof. Saule' });

  sound.sfx('exit');
  hero.classList.add('shrink');
  await wait(550);
  s.classList.add('out');
  await wait(480);
  s.remove();
  const st = game.newState(name, gender); if (tenue) st.tenue = tenue;
  return st;
}

async function _legacyIntro(game, ui, sound) {
  sound.play('lab');
  const s = el('div', 'screen intro-scr', '<div class="intro-stage"><img class="intro-prof" alt=""><img class="intro-mon" alt=""><div class="intro-kid"></div></div>');
  uiRoot.appendChild(s);
  const prof = s.querySelector('.intro-prof'), mon = s.querySelector('.intro-mon'), kid = s.querySelector('.intro-kid');
  prof.src = ASSETS.portrait('saule') || ASSETS.trainer('saule');
  await wait(400); prof.classList.add('in');
  await ui.say(['Bonjour ! Bienvenue dans la région d\'Odyssée !', 'Je m\'appelle Saule. Les gens d\'ici m\'appellent le Professeur.'], { speaker: 'Prof. Saule' });
  mon.src = ASSETS.front(R(1001)); mon.classList.add('in'); sound.cry(ASSETS.cry(R(1001)));
  await ui.say(['Ce monde est peuplé de créatures étonnantes.', 'Certains les adoptent comme compagnons, d\'autres les entraînent pour le combat.', 'Et les marins racontent qu\'un géant des océans, Odyssor, guide ceux qui partent à l\'aventure...'], { speaker: 'Prof. Saule' });
  mon.classList.remove('in'); prof.classList.remove('in');
  await wait(300);
  const g = await ui.ask('Mais parle-moi un peu de toi. Es-tu un garçon ou une fille ?', ['Garçon', 'Fille'], { cancel: null, speaker: 'Prof. Saule' });
  const gender = g === 1 ? 'f' : 'm';
  kid.className = 'intro-kid in ' + gender;
  const name = await ui.nameEntry('Quel est ton prénom ?', gender === 'f' ? 'Lyra' : 'Ethan');
  await ui.say([`${name}... C'est un joli prénom !`, 'Ton voisin Théo est déjà en route pour mon laboratoire, à Bourg-Aube.', `Alors, ${name}, prêt${gender === 'f' ? 'e' : ''} ? Ta propre aventure commence maintenant !`], { speaker: 'Prof. Saule' });
  s.classList.add('out'); await wait(500); s.remove();
  return game.newState(name, gender);
}

boot().catch(fatal);
