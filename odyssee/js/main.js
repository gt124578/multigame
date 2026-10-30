// odyssee/js/main.js — démarrage : images dessinées, rendu basse résolution, écran titre (Odyssor sur la mer),
// nouvelle partie / continuer, aide des touches
import * as THREE from 'three';
import { WorldView } from './render/world3d.js';
import { setArt } from './render/textures.js';
import { buildWorld } from './world/region.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI, el, esc, wait } from './ui/ui.js';
import { optionsScreen } from './ui/screens.js';
import { Game } from './game.js';
import { createMon } from './core/mon.js';
import { ASSETS, loadImg, loadAll } from './assets.js';
import { SPRITES } from './data/sprites.js';

const H = window.HubBridge;
const canvas = document.getElementById('gl'), uiRoot = document.getElementById('ui'), loading = document.getElementById('loading');

function fatal(e) {
  console.error(e);
  loading.style.display = 'flex'; loading.innerHTML = `<div>Oups, le jeu a rencontré un problème.<br><small>${esc(e && e.message ? e.message : e)}</small></div>`;
  if (H && H.logCrash) H.logCrash('CRASH_JS_ERROR', 'Odyssée : ' + (e && e.message ? e.message : e), { stack: e && e.stack });
}
addEventListener('error', (e) => fatal(e.error || e.message));
addEventListener('unhandledrejection', (e) => fatal(e.reason));

// éléments de décor dessinés repris dans le jeu (les autres restent dessinés par le code : herbes, fleurs…)
const NATURE = ['tree', 'tree2', 'pine', 'snowpine', 'deadtree', 'palm', 'bush', 'rock', 'stalag', 'sign', 'fence', 'lamp', 'mailbox', 'pot', 'itemball', 'bang', 'statue'];
const SOLS = ['floor_wood', 'floor_center', 'floor_mart', 'floor_lab', 'floor_league', 'floor_gymBug', 'floor_gymRock', 'floor_gymWater', 'floor_gymElec', 'floor_gymGrass', 'floor_gymPsy', 'floor_gymFire', 'floor_gymDragon', 'wall_center', 'wall_mart', 'wall_gym', 'wall_league'];

async function loadArt() {
  const sprites = {};
  // décor version 2 (vue de 3/4, bible) : tout ce que la planche fournit ; sinon la sélection de la première planche
  for (const k of SPRITES.natureV2 ? Object.keys(SPRITES.nature) : NATURE) sprites[k] = ASSETS.nature(k);
  const dens = {}; for (const [k, v] of Object.entries(SPRITES.nature || {})) if (v[2]) dens[k] = v[2];
  // mobilier (sans écraser un élément de la nature du même nom, comme la statue d'arène)
  for (const k of Object.keys(SPRITES.mobilier || {})) if (!sprites[k]) sprites[k] = ASSETS.mobilier(k);
  for (const [k, v] of Object.entries(SPRITES.mobilier || {})) if (v[2] && !dens[k]) dens[k] = v[2];
  const kits = {}; for (const k of SPRITES.facades || []) kits[k] = ASSETS.facade(k);
  const sols = {}; for (const k of SOLS) sols[k] = ASSETS.sol(k);
  const [S, K, L, chars, title] = await Promise.all([loadAll(sprites), loadAll(kits), loadAll(sols), loadImg(ASSETS.chars), loadImg(ASSETS.title)]);
  return { sprites: S, dens, kits: K, sols: L, chars, title };
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const input = new Input(), sound = new Sound(), ui = new UI(uiRoot, input, sound);
  const world = buildWorld();
  const art = await loadArt();
  setArt({ kits: art.kits, sols: art.sols });
  const view = new WorldView(renderer, art.chars, { sprites: art.sprites, dens: art.dens });
  const game = new Game({ view, ui, input, sound, world });
  window.__ody = { game, world, view, ui, sound, mon: (sp, lvl) => createMon(sp, lvl) };

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

  let mode = 'title', last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'game') game.tick(dt);
    requestAnimationFrame(loop);
  };
  view.setMap(world.maps.monde); view.setTimeOfDay(new Date().getHours() + new Date().getMinutes() / 60);
  loading.style.display = 'none';
  requestAnimationFrame(loop);
  ui.fade(false, 500);
  if (H && H.embedded) H.signalReady();
  // outil de test : démarrer directement une partie depuis la console
  window.__ody.play = async (state) => { document.querySelector('.title-scr')?.remove(); input.handlers.length = 0; ui.closeDialog(); mode = 'game'; await game.start(state); };

  /* ---------------- écran titre ---------------- */
  for (;;) {
    sound.play('title');
    const title = el('div', 'title-scr', `<canvas class="title-cv" width="256" height="192"></canvas><div class="logo"><div class="logo-main">ODYSSÉE</div><div class="logo-sub">La baleine des étoiles</div></div><div class="press">Appuie sur F ou Entrée</div><div class="title-foot">Prototype · créatures originales et Pokémon de remplacement · H : aide des touches</div>`);
    uiRoot.appendChild(title);
    const stopSea = titleSea(title.querySelector('canvas'), art.title);
    await new Promise((res) => { const pop = input.push((k) => { if (k === 'a') { pop(); sound.init(); sound.sfx('select'); res(); } }); });
    title.querySelector('.press').remove();
    const has = Game.hasSave();
    let info = null;
    if (has) { try { info = JSON.parse(localStorage.getItem(Game.SAVE_KEY)); } catch (e) {} }
    const opts = (has ? ['Continuer'] : []).concat(['Nouvelle partie', 'Options'], H && H.embedded ? ['Retour au salon'] : []);
    const card = info ? el('div', 'box save-info', `<b>${esc(info.name)}</b><br>Badges : ${info.badges.filter(Boolean).length} · Pokédex : ${info.dex.caught.length}<br>Temps : ${Math.floor(info.time / 3600)}:${String(Math.floor(info.time / 60) % 60).padStart(2, '0')}`) : null;
    if (card) title.appendChild(card);
    const r = await ui.list({ items: opts.map((label) => ({ label })), cls: 'title-menu', cancel: null, parent: title });
    const pick = opts[r];
    if (pick === 'Options') { stopSea(); title.remove(); await optionsScreen(game); continue; }
    if (pick === 'Retour au salon') { H.exit(); stopSea(); title.remove(); continue; }
    if (pick === 'Nouvelle partie' && has && !(await ui.yesNo('Une sauvegarde existe déjà. Commencer une nouvelle partie l\'effacera. Continuer ?'))) { stopSea(); title.remove(); continue; }
    stopSea(); title.remove();
    let state;
    if (pick === 'Continuer') state = game.load();
    else state = await intro(game, ui, sound);
    await ui.fade(true, 300);
    mode = 'game';
    await game.start(state);
    break;
  }
}

/**
 * Écran titre : nuit sur la mer, Odyssor qui nage entre les vagues en laissant un sillage d'étoiles.
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
    x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(206, 30, 11, 0, 7); x.fill(); x.fillStyle = '#24306a'; x.beginPath(); x.arc(211, 27, 9, 0, 7); x.fill();
    // îles au loin
    x.fillStyle = '#1c2348'; x.beginPath(); x.moveTo(0, SEA); x.lineTo(18, SEA - 9); x.lineTo(40, SEA - 4); x.lineTo(62, SEA); x.fill();
    x.beginPath(); x.moveTo(150, SEA); x.lineTo(170, SEA - 13); x.lineTo(182, SEA - 8); x.lineTo(200, SEA); x.fill();
    // mer
    const s = x.createLinearGradient(0, SEA, 0, Hh); s.addColorStop(0, '#2a3c7a'); s.addColorStop(1, '#0e1838');
    x.fillStyle = s; x.fillRect(0, SEA, W, Hh - SEA);
    x.fillStyle = 'rgba(255,246,216,.55)'; for (let y = SEA + 3; y < Hh; y += 4) { const w = 10 - (y - SEA) / 10; x.fillRect(206 - w + Math.sin(t * 2 + y) * 2, y, w * 2, 1); }
    // Odyssor : il nage d'est en ouest, monte et replonge
    const period = 18, u = ((t / period) % 1), wx = W + 60 - u * (W + 140), bob = Math.sin(t * 1.6) * 3 - 6 + Math.sin(u * Math.PI) * -10;
    const size = 92, wy = SEA - size * 0.62 + bob;
    if (whale) {
      x.save(); x.beginPath(); x.rect(0, 0, W, SEA + 6 + bob * 0.2); x.clip();
      x.translate(Math.round(wx), Math.round(wy)); x.scale(-1, 1); x.drawImage(whale, -size / 2, 0, size, size); x.restore();
    }
    // sillage d'étoiles
    if (Math.random() < 0.6) sparks.push({ x: wx + 30 + Math.random() * 20, y: SEA - 4 + Math.random() * 6, v: -0.2 - Math.random() * 0.4, life: 1 });
    for (const p of sparks) { p.x += 0.4; p.y += p.v; p.life -= 0.02; x.fillStyle = `rgba(200,230,255,${Math.max(0, p.life)})`; x.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    // vagues (par-dessus le bas d'Odyssor)
    for (let row = 0; row < 7; row++) {
      const y = SEA + 2 + row * 10, sp = 6 + row * 4, ph = t * (0.6 + row * 0.15);
      x.fillStyle = row < 2 ? '#6c8ad0' : '#3d5aa0';
      for (let k = -1; k < W / 24 + 1; k++) { const bx = ((k * 24 + ph * sp) % (W + 24)) - 12; x.fillRect(Math.round(bx), y, 8, 1); x.fillRect(Math.round(bx) + 2, y - 1, 4, 1); }
    }
    x.fillStyle = 'rgba(160,200,255,.7)'; for (let k = 0; k < 5; k++) x.fillRect(Math.round(wx - 30 + k * 12 + Math.sin(t * 5 + k) * 2), SEA + 1, 6, 1);
    requestAnimationFrame(frame);
  };
  frame();
  return () => { alive = false; };
}

/** présentation du professeur, choix du personnage et du nom */
async function intro(game, ui, sound) {
  sound.play('lab');
  const s = el('div', 'screen intro-scr', '<div class="intro-stage"><img class="intro-prof" alt=""><img class="intro-mon" alt=""><div class="intro-kid"></div></div>');
  uiRoot.appendChild(s);
  const prof = s.querySelector('.intro-prof'), mon = s.querySelector('.intro-mon'), kid = s.querySelector('.intro-kid');
  prof.src = ASSETS.portrait('saule') || ASSETS.trainer('saule');
  await wait(400); prof.classList.add('in');
  await ui.say(['Bonjour ! Bienvenue dans la région d\'Odyssée !', 'Je m\'appelle Saule. Les gens d\'ici m\'appellent le Professeur.'], { speaker: 'Prof. Saule' });
  mon.src = ASSETS.front(1001); mon.classList.add('in'); sound.cry(ASSETS.cry(1001));
  await ui.say(['Ce monde est peuplé de créatures étonnantes.', 'Certains les adoptent comme compagnons, d\'autres les entraînent pour le combat.', 'Et les marins racontent qu\'une baleine céleste, Odyssor, guide ceux qui partent à l\'aventure...'], { speaker: 'Prof. Saule' });
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
