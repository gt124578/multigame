// Dogfight 3D : démarrage, boucle à pas fixe, hôte et invités, hangar et fin de partie.
// Hôte et solo font tourner le moteur ; les invités reçoivent un état compact, prédisent leur avion et interpolent les autres.
import { generateMap, ILE } from '../royale/engine/map.js';
import { createWorld } from './engine/world.js';
import { createFlight, stepFlight, computeAxes, TYPES, TYPE_IDS } from './engine/flight.js';
import { MODE_IDS, MODE_NAMES, isTeamMode, ZONE_CEIL } from './engine/modes.js';
import { createGame, startCountdown, stepGame, drainEvents, addPlayer, replaceByBot, snapRows, snapMissiles, snapZones, worldOf, restoreGame, applyRow, ranking, DT, COLORS, TEAM_COLORS } from './engine/rules.js';
import { DogfightScene } from './view/scene.js';
import { CockpitHUD } from './view/hud.js';
import { DogfightAudio } from './view/sfx.js';
import { FlightControls } from './view/controls.js';

const H = window.HubBridge;
const QS = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const BOT_NAMES = ['Viper', 'Maverick', 'Iceman', 'Goose', 'Jester', 'Ghost'];
const LEVELS = ['facile', 'normal', 'expert'];
const SEND_EVERY = 3;    // état des avions : vingt fois par seconde
const INPUT_EVERY = 2;   // commandes : trente fois par seconde
const INTERP = 0.11;     // les autres avions sont montrés avec ce retard (s)
const AUTOLAUNCH = 30;   // à plusieurs, le hangar n'attend pas au-delà (s)
const MODE_BRIEF = {
  chacun: () => 'Chacun pour soi : le premier à l\'objectif gagne, ou le meilleur à la fin du temps.',
  equipes: () => 'Équipes : chaque élimination compte pour ton camp.',
  domination: (me, target) => `Domination : tiens les zones A, B et C. Vole sous ${ZONE_CEIL} m au-dessus du sol pour les capturer. Chaque zone tenue rapporte un point par seconde, la première équipe à ${target} points gagne.`,
  duel: (me, target) => `Duel (${target} manches pour gagner) : un contre un, face à face. Le gagnant reste en piste, le perdant passe derrière ceux qui attendent. Après 90 s, le moins abîmé gagne la manche. Seul, un bot vient en face.`,
  escorte: (me) => (me && me.team === 2 ? 'Escorte : tu attaques. Abats le gros transport avant la fin du temps.' : 'Escorte : tu protèges le gros transport. S\'il tient jusqu\'à la fin du temps, ton équipe gagne.'),
};
const planeName = (type) => (TYPES[type] || TYPES.f16).name;
const tagColorOf = (p, mode) => (p.type !== 'cargo' && isTeamMode(mode) ? TEAM_COLORS[p.team] : p.color);

const S = {
  alive: true, role: 'solo', myId: 0, cfg: {}, run: 0,
  g: null, acc: 0, tick: 0, lastSend: -99, lastWorldAt: 0, sentRev: 0, netEv: [],
  w: null, rowsById: new Map(), snaps: [], off: null, pred: null, predPrev: null, seq: 0, hist: [], errX: 0, errY: 0, errZ: 0, gotHost: false, lastRows: null, missileRows: [],
  type: 'f16', ready: false, hangarSince: 0, reported: false, endShown: false, view: null, slow: 0, ms: 16, autoQ: true, playT: 0, vp: new Map(), lastAlive: true, otherGunT: 0,
};
let world = null, scene = null, hud = null, controls = null, raf = 0, bgTimer = 0;
const sfx = new DogfightAudio();

// ------------------------------------------------------------------ réglages locaux
const store = {
  get(k, d) { try { const v = localStorage.getItem(`dogfight_${k}`); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(`dogfight_${k}`, JSON.stringify(v)); } catch (e) { /* navigation privée */ } },
};
const pref = { quality: store.get('quality', 'auto'), assist: store.get('assist', true), invert: store.get('invert', false), sens: store.get('sens', 1) };
function applyPrefs() {
  if (controls) { controls.assist = pref.assist; controls.invert = pref.invert; controls.sens = pref.sens; }
  if (scene) { S.autoQ = pref.quality === 'auto'; scene.setQuality(S.autoQ ? 'moyen' : pref.quality); }
}

function setupPanel() {
  const btn = $('#btnSet');
  if (!window.DDVolume || !btn) return;
  btn.innerHTML = window.DDVolume.ICON || '⚙️';
  window.DDVolume.panel(btn, {
    accent: '#2563eb', kinds: ['fx'], test: () => sfx.hitConfirm(),
    sections: [
      { title: 'Image', items: [{ label: 'Qualité', get: () => pref.quality, set: (v) => { pref.quality = v; store.set('quality', v); applyPrefs(); }, options: [['auto', 'Auto'], ['bas', 'Bas'], ['moyen', 'Moyen'], ['eleve', 'Élevé']] }], hint: 'Élevé : de vrais nuages volumétriques, à réserver à une bonne carte graphique. Auto l\'essaie quand la machine suit, et baisse d\'un cran si l\'image rame.' },
      { title: 'Pilotage', items: [
        { label: 'Aide au vol', get: () => pref.assist, set: (v) => { pref.assist = v; store.set('assist', v); applyPrefs(); } },
        { label: 'Inverser le tangage', get: () => pref.invert, set: (v) => { pref.invert = v; store.set('invert', v); applyPrefs(); } },
        { label: 'Sensibilité de la souris', get: () => pref.sens, set: (v) => { pref.sens = v; store.set('sens', v); applyPrefs(); }, range: [0.4, 2, 0.1], format: (v) => `${Math.round(v * 100)} %` },
        { keys: [
          ['Viser (l\'avion suit)', 'Souris', 'Stick droit'],
          ['Tangage', '<kbd>Z</kbd> pique, <kbd>S</kbd> cabre, ou <kbd>↑</kbd> <kbd>↓</kbd>', 'Stick gauche'],
          ['Virer', '<kbd>Q</kbd> <kbd>D</kbd> ou <kbd>←</kbd> <kbd>→</kbd>', 'Stick gauche'],
          ['Tonneau (roulis libre)', '<kbd>R</kbd> + <kbd>Q</kbd> ou <kbd>D</kbd>', ''],
          ['Lacet', '<kbd>J</kbd> <kbd>L</kbd>', 'Croix'],
          ['Canon', '<kbd>Espace</kbd> ou clic gauche', 'RT'],
          ['Missile, une fois accroché', '<kbd>E</kbd> ou clic droit', 'A'],
          ['Leurres', '<kbd>F</kbd>', 'X'],
          ['Postcombustion', '<kbd>Maj</kbd>', 'RB'],
          ['Aérofrein', '<kbd>C</kbd> ou <kbd>X</kbd>', 'LB / LT'],
          ['Scores', '<kbd>Tab</kbd>', ''],
        ] },
      ] },
    ],
  });
}

// ------------------------------------------------------------------ chargement
const pause = () => new Promise((r) => setTimeout(r, 30));
const status = (t) => { const el = $('#loadStatus'); if (el) el.textContent = t; };

async function init() {
  status('Génération de l\'île…');
  await pause();
  const map = generateMap(ILE);
  world = createWorld(map);
  status('Peinture du paysage…');
  await pause();
  try {
    scene = new DogfightScene($('#stage'), world);
  } catch (err) {
    console.error('WebGL indisponible :', err);
    status('La 3D n\'est pas disponible sur ce navigateur.');
    $('#loadSpin')?.remove();
    if (H.shown) H.shown();
    return;
  }
  status('Préparation des avions…');
  await scene.ready;
  hud = new CockpitHUD($('#hudCanvas'), scene.ground.canvas);
  hud.resize();
  addEventListener('resize', () => hud.resize());
  controls = new FlightControls({ surface: $('#stage'), onFirstGesture: () => sfx.unlock(), touchBox: $('#touchUI') });
  applyPrefs();
  setupPanel();
  bindScreens();
  if (H.embedded) H.on('init', boot); else boot({});
}

function readCfg(settings = {}) {
  const src = H.embedded ? settings : Object.fromEntries(QS);
  const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);
  return { kills: num(src.kills, 8), bots: num(src.bots, 3), level: LEVELS.includes(src.level) ? src.level : 'normal', mode: MODE_IDS.includes(src.mode) ? src.mode : 'chacun', time: num(src.time, 300) };
}
function localProfile() {
  const g = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  return { name: String(g('dd_name', '') || 'As du Ciel').slice(0, 12) || 'As du Ciel', color: g('dd_color', COLORS[0]) };
}
const safeColor = (c, i) => (/^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[i % COLORS.length]);
function humans() {
  if (!H.embedded) { const p = localProfile(); return [{ id: S.myId, name: p.name, color: safeColor(p.color, 0) }]; }
  return H.players.map((p, i) => ({ id: p.id, name: p.name || `Pilote ${i + 1}`, color: safeColor(p.color, i) }));
}
function newGame() {
  const list = humans().map((p) => ({ ...p, type: 'f16' }));
  for (let b = 0; list.length < 6 && b < S.cfg.bots; b++) list.push({ id: `bot-${b + 1}`, name: BOT_NAMES[b % BOT_NAMES.length], bot: true, lvl: S.cfg.level, color: COLORS[list.length % COLORS.length], type: TYPE_IDS[Math.floor(Math.random() * TYPE_IDS.length)] });
  S.g = createGame({ settings: S.cfg, players: list, world });
  S.run++; S.acc = 0; S.tick = 0; S.lastSend = -99; S.sentRev = 0; S.netEv = []; S.reported = false; S.endShown = false; S.vp.clear(); S.playT = 0;
  const me = S.g.planes.find((p) => p.id === S.myId);
  if (me) { me.type = S.type; }
  S.ready = false; S.hangarSince = performance.now();
}

function boot(info) {
  S.role = H.embedded ? info.role : 'solo';
  S.myId = H.embedded ? info.myId : 0;
  S.cfg = readCfg(info.settings || {});
  const wanted = QS.get('type') || store.get('type', 'f16');
  S.type = TYPE_IDS.includes(wanted) ? wanted : 'f16';
  H.on('msg', onMsg);
  H.on('roster', onRoster);
  if (H.embedded) H.signalReady();  // après on('msg') : sinon les premiers messages de l'hôte se perdent
  if (S.role !== 'guest') newGame();
  else { H.send('host', { t: 'hi' }); H.send('host', { t: 'pick', type: S.type, ready: false }); }
  $('#loadingOverlay').classList.add('hidden');
  if (H.shown) H.shown();
  showHangar();
  raf = requestAnimationFrame(loop);
  // onglet caché : plus d'images, mais l'hôte fait tourner la partie, et un invité lâche ses commandes
  document.addEventListener('visibilitychange', onVisibility);
  bgTimer = setInterval(backgroundTick, 200);
  if (QS.has('debug') || QS.has('local')) window.__dogfight = { S, get scene() { return scene; }, get hud() { return hud; }, get controls() { return controls; }, sfx, frame, launch, view: () => S.view, run: (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) hostStep(); return S.g && S.g.ph; } };
  if (QS.has('autostart') && S.role !== 'guest') launch();
}

// ------------------------------------------------------------------ hangar
function bindScreens() {
  for (const b of document.querySelectorAll('[data-plane]')) b.addEventListener('click', () => pick(b.dataset.plane));
  $('#btnStart').addEventListener('click', () => {
    sfx.unlock();
    if (S.role === 'guest') { S.ready = !S.ready; sendPick(); updateHangar(); return; }
    controls.lock();   // la souris ou le trackpad ne bute plus sur le bord de l'écran dès le décollage
    launch();
  });
  $('#btnReplay').addEventListener('click', () => { if (S.role !== 'guest') { newGame(); broadcastWorld(true); hideEnd(); showHangar(); } });
  for (const id of ['#btnQuit', '#btnExit']) $(id).addEventListener('click', exitToLobby);
}
function pick(type) {
  if (!TYPE_IDS.includes(type)) return;
  sfx.unlock();
  S.type = type; store.set('type', type);
  if (S.g) { const p = S.g.planes.find((q) => q.id === S.myId); if (p) { p.type = type; S.g.rev++; } }
  if (S.role === 'guest') sendPick();
  updateHangar();
}
const sendPick = () => H.send('host', { t: 'pick', type: S.type, ready: S.ready });
const setStartLabel = (t) => { const b = $('#btnStart'); if (b.textContent !== t) b.textContent = t; };

function showHangar() { $('#hangar').classList.remove('hidden'); updateHangar(); }
function hideHangar() { $('#hangar').classList.add('hidden'); }
function updateHangar() {
  for (const b of document.querySelectorAll('[data-plane]')) {
    const on = b.dataset.plane === S.type; b.setAttribute('aria-pressed', String(on));
  }
  const T = TYPES[S.type];
  $('#planeBlurb').textContent = T.blurb;
  const stat = (k, v) => { $(`#stat-${k}`).style.width = `${Math.round(v * 100)}%`; };
  stat('speed', T.boost / 240); stat('roll', T.roll / 3.8); stat('pitch', T.pitch / 2); stat('hp', T.hp / 130); stat('gun', T.gun / 5); stat('sig', T.sig);
  const list = (S.role === 'guest' ? (S.w ? S.w.pl : []) : (S.g ? S.g.planes : [])).filter((p) => p.type !== 'cargo');
  const set = S.role === 'guest' ? (S.w && S.w.settings) : (S.g && S.g.settings);
  $('#modeBrief').textContent = set && MODE_BRIEF[set.mode] ? MODE_BRIEF[set.mode](list.find((p) => p.id === S.myId), set.target) : '';
  const rows = list.map((p) => `<li><i style="background:${p.color}"></i>${esc(p.name)}${p.bot ? ' <em>bot</em>' : ''}<span>${planeName(p.id === S.myId ? S.type : p.type)}${p.team ? ` · équipe ${p.team === 1 ? 'bleue' : 'rouge'}` : ''}${p.bot || p.id === S.myId ? '' : p.ready ? ' · prêt' : ' · choisit…'}</span></li>`).join('');
  $('#hangarRoster').innerHTML = rows || '<li>En attente de l\'hôte…</li>';
  const btn = $('#btnStart');
  if (S.role === 'guest') btn.textContent = S.ready ? 'Prêt ! En attente de l\'hôte…' : 'Je suis prêt';
  else if (!hasGuests()) btn.textContent = 'Décoller';
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function launch() {
  if (S.role === 'guest' || !S.g || S.g.ph !== 'hangar') return;
  const me = S.g.planes.find((p) => p.id === S.myId);
  if (me) me.type = S.type;
  // ces modes n'ont pas de sens sans adversaire
  if (['duel', 'escorte', 'domination'].includes(S.g.settings.mode) && S.g.planes.filter((p) => p.type !== 'cargo').length < 2) addPlayer(S.g, { id: 'bot-1', name: BOT_NAMES[0], bot: true, lvl: S.cfg.level, color: COLORS[1], type: TYPE_IDS[0] }, world);
  startCountdown(S.g, world);
  if (S.autoQ && store.get('high', null) === true && scene.quality === 'moyen') scene.setQuality('eleve');
  broadcastWorld(true);
  hideHangar();
}

// ------------------------------------------------------------------ boucle
function loop(now) {
  if (!S.alive) return;
  raf = requestAnimationFrame(loop);
  frame(now);
}
let lastT = 0;
function frame(now = performance.now()) {
  if (now < lastT) return;
  const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016);
  lastT = now;
  S.ms += (dt * 1000 - S.ms) * 0.1;
  const view = S.role === 'guest' ? guestFrame(dt) : hostFrame(dt);
  if (view) { S.view = view; present(view, dt); }
  if (S.autoQ && S.playT > 6) {
    if (S.ms > 24 && view && view.ph === 'play') {
      S.slow += dt;
      if (S.slow > 3) { S.slow = 0; if (scene.quality === 'eleve') store.set('high', false); const w = scene.lowerQuality(); if (w && QS.has('debug')) hud.toast(`Qualité baissée : ${w}`); }
    } else S.slow = Math.max(0, S.slow - dt);
    // une partie entière bien fluide en Moyen : on tentera Élevé au prochain décollage, et on s'en souviendra si ça rame
    if (S.playT > 30 && S.ms < 17.8 && scene.quality === 'moyen' && store.get('high', null) === null) store.set('high', true);
  }
}

function onVisibility() {
  if (!document.hidden) { lastT = 0; return; }
  controls.release();
  if (S.role === 'guest' && S.pred) H.send('host', { t: 'i', s: S.seq, p: 0, r: 0, y: 0, a: [S.pred.fx, S.pred.fy, S.pred.fz], b: 0 });
}
function backgroundTick() {
  if (!document.hidden || S.role === 'guest' || !S.g || !S.alive) return;
  const now = performance.now(), dt = Math.min(1.5, lastT ? (now - lastT) / 1000 : 0.2);
  lastT = now;
  hostFrame(dt, 90);
}

// ---- hôte et solo : le moteur tourne ici
function hostStep() {
  const g = S.g, me = g.planes.find((p) => p.id === S.myId);
  for (const p of g.planes) { p._px = p.x; p._py = p.y; p._pz = p.z; p._qx = p.qx; p._qy = p.qy; p._qz = p.qz; p._qw = p.qw; }
  if (me && !me.bot && g.ph === 'play') {
    const inp = controls.sample(me.alive ? me : null, DT);
    if (me.alive) me.inp = inp;
  }
  stepGame(g, DT, world);
  const ev = drainEvents(g);
  S.frameEv.push(...ev);
  if (hasGuests()) S.netEv.push(...ev);
  S.tick++;
}
const hasGuests = () => H.embedded && H.players.length > 1;

function hostFrame(dt, maxSteps = 8) {
  const g = S.g;
  if (!g) return null;
  S.frameEv = [];
  S.acc += dt;
  let steps = 0;
  while (S.acc >= DT && steps < maxSteps) { S.acc -= DT; hostStep(); steps++; }
  if (steps === maxSteps) S.acc = 0;
  // à plusieurs, le hangar n'attend pas indéfiniment : l'hôte qui s'absente ne bloque personne
  if (g.ph === 'hangar' && hasGuests()) {
    const left = AUTOLAUNCH - (performance.now() - S.hangarSince) / 1000;
    if (left <= 0) launch();
    else setStartLabel(`Décoller (auto dans ${Math.ceil(left)} s)`);
  }
  if (hasGuests()) {
    if (g.rev !== S.sentRev || performance.now() - S.lastWorldAt > 1000) broadcastWorld(false);
    if (S.netEv.length && S.tick - S.lastSend >= SEND_EVERY - 1) { H.send('all', { t: 'e', run: S.run, e: S.netEv }); S.netEv = []; }
    if (S.tick - S.lastSend >= SEND_EVERY) {
      S.lastSend = S.tick;
      H.send('all', { t: 's', run: S.run, ts: Math.round(g.clock * 1000), r: snapRows(g), m: snapMissiles(g), z: snapZones(g) }, { volatile: true });
    }
  }
  const view = buildHostView(g);
  for (const e of S.frameEv) onEvent(e, view);
  if (g.ph === 'over') { reportResult(); showEnd(view); }
  return view;
}
function broadcastWorld(force) {
  const g = S.g; if (!hasGuests() || !g) return;
  S.sentRev = g.rev; S.lastWorldAt = performance.now();
  H.send('all', { t: 'w', run: S.run, w: worldOf(g) });
}
const SHOWN = ['id', 'name', 'color', 'team', 'type', 'bot', 'kills', 'deaths', 'alive', 'speed', 'health', 'maxHp', 'boosting', 'braking', 'firing', 'over', 'warn', 'load', 'ab', 'abOut', 'heat', 'lockT', 'lockId', 'ms', 'fl', 'dE', 'dL', 'dR', 'dT', 'respawn', 'killedBy', 'deathCause', 'inv', 'ready', 'out', 'helps', 'shots', 'hits', 'mhits', 'best', 'zt', 'cdmg'];
function buildHostView(g) {
  const f = S.acc / DT, list = [];
  for (const p of g.planes) {
    let r = S.vp.get(p.id); if (!r) S.vp.set(p.id, r = {});
    for (const k of SHOWN) r[k] = p[k];
    const far = p._px === undefined || Math.abs(p._px - p.x) + Math.abs(p._pz - p.z) > 30;
    lerpPose(r, far ? p : { x: p._px, y: p._py, z: p._pz, qx: p._qx, qy: p._qy, qz: p._qz, qw: p._qw }, p, far ? 1 : f);
    r.tagColor = tagColorOf(p, g.settings.mode);
    list.push(r);
  }
  return { ph: g.ph, t: g.t, left: g.left, target: g.settings.target, mode: g.settings.mode, tk: g.tk, winner: g.winner, winTeam: g.winTeam, zones: g.zones, duel: g.duel, planes: list, missiles: g.missiles.map((m) => ({ key: m.key, x: m.x, y: m.y, z: m.z })), me: list.find((p) => p.id === S.myId) || null };
}
function lerpPose(r, a, b, f) {
  r.x = a.x + (b.x - a.x) * f; r.y = a.y + (b.y - a.y) * f; r.z = a.z + (b.z - a.z) * f;
  const s = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw < 0 ? -1 : 1;
  const x = a.qx + (s * b.qx - a.qx) * f, y = a.qy + (s * b.qy - a.qy) * f, z = a.qz + (s * b.qz - a.qz) * f, w = a.qw + (s * b.qw - a.qw) * f, n = 1 / (Math.hypot(x, y, z, w) || 1);
  r.qx = x * n; r.qy = y * n; r.qz = z * n; r.qw = w * n;
  computeAxes(r);
}

// ---- invité : prédiction de son avion, interpolation des autres
function guestFrame(dt) {
  S.frameEv = [];
  const w = S.w;
  if (!w) return null;
  const meInfo = w.pl.find((p) => p.id === S.myId), nowS = performance.now() / 1000;
  const latest = S.snaps[S.snaps.length - 1];
  const row = latest ? latest.rows.get(S.myId) : null;

  // pas fixes de prédiction
  S.acc += dt;
  let steps = 0;
  while (S.acc >= DT && steps < 8) {
    S.acc -= DT; steps++;
    if (w.ph === 'play' && S.pred && meInfo && row && (row[10] & 1)) {
      S.predPrev = { ...S.pred };
      const inp = controls.sample(S.pred, DT);
      S.tickInput = (S.tickInput || 0) + 1;
      stepFlight(S.pred, inp, DT);
      S.hist.push({ seq: S.seq + 1, inp });
      S.pendMsl = S.pendMsl || inp.msl; S.pendFlare = S.pendFlare || inp.flare;
      if (S.tickInput % INPUT_EVERY === 0) {
        S.seq++;
        H.send('host', { t: 'i', s: S.seq, p: +inp.p.toFixed(2), r: +inp.r.toFixed(2), y: +inp.y.toFixed(2), a: [+inp.ax.toFixed(3), +inp.ay.toFixed(3), +inp.az.toFixed(3)], b: (inp.boost ? 1 : 0) | (inp.brake ? 2 : 0) | (inp.fire ? 4 : 0) | (S.pendMsl ? 8 : 0) | (S.pendFlare ? 16 : 0) | (inp.free ? 32 : 0) }, { volatile: true });
        S.pendMsl = false; S.pendFlare = false;
      }
      if (S.hist.length > 200) S.hist.splice(0, 60);
      S.lastFire = inp.fire;
    }
  }
  if (steps === 8) S.acc = 0;
  const decay = Math.exp(-dt * 6); S.errX *= decay; S.errY *= decay; S.errZ *= decay;

  // temps d'affichage des autres : un peu derrière le dernier état reçu
  const list = [];
  const renderT = S.off === null ? 0 : nowS - S.off - INTERP;
  let A = null, B = null;
  for (let i = S.snaps.length - 1; i >= 0; i--) { if (S.snaps[i].t <= renderT) { A = S.snaps[i]; B = S.snaps[i + 1] || A; break; } }
  if (!A && S.snaps.length) { A = S.snaps[0]; B = A; }
  const f = A && B && B.t > A.t ? Math.max(0, Math.min(1, (renderT - A.t) / (B.t - A.t))) : 0;

  for (const info of w.pl) {
    let r = S.vp.get(info.id); if (!r) S.vp.set(info.id, r = {});
    Object.assign(r, info);
    if (info.st) [r.shots, r.hits, r.mhits, r.best, r.zt, r.cdmg] = info.st;
    r.tagColor = tagColorOf(info, w.settings.mode);
    const last = latest ? latest.rows.get(info.id) : null;
    if (!last) { r.alive = false; list.push(r); continue; }
    applyRow(r, last);
    if (info.id === S.myId && S.pred && r.alive && w.ph === 'play') {
      const a = S.predPrev || S.pred;
      lerpPose(r, a, S.pred, S.acc / DT);
      r.x += S.errX; r.y += S.errY; r.z += S.errZ;
      r.speed = S.pred.speed; r.boosting = S.pred.boosting; r.braking = S.pred.braking; r.ab = S.pred.ab; r.abOut = S.pred.abOut; r.load = S.pred.load;
      r.firing = !!S.lastFire && !r.over;
    } else if (A && B) {
      const ra = A.rows.get(info.id), rb = B.rows.get(info.id);
      if (ra && rb && (rb[10] & 1)) {
        const pa = { x: ra[1], y: ra[2], z: ra[3], qx: ra[4] / 1e4, qy: ra[5] / 1e4, qz: ra[6] / 1e4, qw: ra[7] / 1e4 }, pb = { x: rb[1], y: rb[2], z: rb[3], qx: rb[4] / 1e4, qy: rb[5] / 1e4, qz: rb[6] / 1e4, qw: rb[7] / 1e4 };
        const jump = Math.abs(pa.x - pb.x) + Math.abs(pa.z - pb.z) > 60;
        lerpPose(r, jump ? pb : pa, pb, jump ? 1 : f);
      }
    }
    list.push(r);
  }
  // missiles : le dernier état reçu
  const view = { ph: w.ph, t: w.t, left: w.left, target: w.settings.target, mode: w.settings.mode, tk: w.tk, winner: w.winner, winTeam: w.winTeam, zones: w.zones, duel: w.duel, planes: list, missiles: S.missileRows, me: list.find((p) => p.id === S.myId) || null };
  if (w.ph === 'over') showEnd(view);
  return view;
}

function receiveRows(m) {
  const nowS = performance.now() / 1000, t = m.ts / 1000, o = nowS - t;
  S.off = S.off === null ? o : Math.min(S.off + 0.002, Math.max(S.off - 0.02, o) > S.off ? S.off + (o - S.off) * 0.05 : o);
  const rows = new Map(m.r.map((r) => [r[0], r]));
  S.snaps.push({ t, rows });
  if (S.snaps.length > 30) S.snaps.shift();
  S.lastRows = m.r;
  S.missileRows = (m.m || []).map((q) => ({ key: q[0], x: q[1], y: q[2], z: q[3] }));
  if (m.z && S.w && S.w.zones) S.w.zones.forEach((z, i) => { z.cap = m.z[i] / 100; });
  // réconciliation : on repart de l'état de l'hôte et on rejoue les commandes qu'il n'a pas encore vues
  const r = rows.get(S.myId);
  const info = S.w ? S.w.pl.find((p) => p.id === S.myId) : null;
  if (!r || !info) return;
  const alive = !!(r[10] & 1);
  if (!alive) { S.pred = null; S.predPrev = null; S.hist = []; return; }
  if (!S.pred) {
    S.pred = createFlight({ type: info.type });
    applyRow(S.pred, r);
    S.predPrev = null; S.hist = []; S.errX = S.errY = S.errZ = 0;
    controls.aimFrom(S.pred.fx, S.pred.fy, S.pred.fz);
    return;
  }
  const px = S.pred.x, py = S.pred.y, pz = S.pred.z, ack = r[11];
  S.hist = S.hist.filter((h) => h.seq > ack);
  const base = { dE: info.dE, dL: info.dL, dR: info.dR, dT: info.dT };
  Object.assign(S.pred, base);
  applyRow(S.pred, r);
  for (const h of S.hist) stepFlight(S.pred, h.inp, DT);
  const ex = px - S.pred.x, ey = py - S.pred.y, ez = pz - S.pred.z, e = Math.hypot(ex, ey, ez);
  if (e > 45) { S.errX = S.errY = S.errZ = 0; S.predPrev = null; }
  else { S.errX += ex; S.errY += ey; S.errZ += ez; S.predPrev = null; }
}

// ------------------------------------------------------------------ messages
function cleanInput(m) {
  const n = (v) => (Number.isFinite(+v) ? Math.max(-1, Math.min(1, +v)) : 0);
  const a = Array.isArray(m.a) ? m.a : [0, 0, 1], b = m.b | 0;
  return { p: n(m.p), r: n(m.r), y: n(m.y), ax: n(a[0]), ay: n(a[1]), az: n(a[2]), boost: !!(b & 1), brake: !!(b & 2), fire: !!(b & 4), msl: !!(b & 8), flare: !!(b & 16), free: !!(b & 32) };
}
function onMsg(from, m) {
  if (!S.alive || !m || typeof m !== 'object') return;
  if (S.role !== 'guest') {
    const g = S.g; if (!g) return;
    if (m.t === 'hi') {
      const p = humans().find((q) => q.id === from);
      if (p && g.ph !== 'over' && !g.planes.some((q) => q.id === from)) addPlayer(g, { ...p, type: 'f16' }, world);
      const q = g.planes.find((x) => x.id === from);
      if (q && q.bot && p) { q.bot = false; q.ai = null; q.inp = { p: 0, r: 0, y: 0 }; g.rev++; }
      broadcastWorld(true);
    } else if (m.t === 'pick') {
      const q = g.planes.find((x) => x.id === from);
      if (q && g.ph === 'hangar') { if (TYPE_IDS.includes(m.type)) q.type = m.type; q.ready = !!m.ready; g.rev++; updateHangar(); }
    } else if (m.t === 'i') {
      const q = g.planes.find((x) => x.id === from);   // `from` vient du Hub : seule identité fiable
      if (q && !q.bot) { const prev = q.inp || {}, inp = cleanInput(m); inp.msl = inp.msl || prev.msl; inp.flare = inp.flare || prev.flare; q.inp = inp; q.ack = m.s | 0; }
    }
    return;
  }
  if (from !== H.info.hostId) return;
  S.gotHost = true;
  if (m.t === 'w' && m.w) {
    if (m.run !== S.run) { S.run = m.run; S.snaps = []; S.pred = null; S.hist = []; S.vp.clear(); S.endShown = false; S.ready = false; S.seq = 0; S.off = null; hideEnd(); }
    const prev = S.w ? S.w.ph : null;
    S.w = m.w; S.lastWorld = m.w;
    if (m.w.ph === 'hangar') { if ($('#hangar').classList.contains('hidden')) showHangar(); else updateHangar(); }
    else if (!$('#hangar').classList.contains('hidden')) hideHangar();
    if (prev !== m.w.ph && m.w.ph === 'hangar') sendPick();
  } else if (m.t === 's' && Array.isArray(m.r)) { if (m.run === S.run) receiveRows(m); }
  else if (m.t === 'e' && Array.isArray(m.e)) { if (m.run === S.run && S.view) for (const e of m.e) onEvent(e, S.view); }
}

function onRoster() {
  if (!S.alive) return;
  if (S.role === 'guest' && H.info.role === 'host') { becomeHost(); return; }
  if (S.role !== 'host' || !S.g) return;
  const g = S.g, ids = new Set(H.players.map((p) => p.id));
  for (const p of [...g.planes]) {
    if (p.bot || p.id === S.myId || ids.has(p.id)) continue;
    if (g.ph === 'hangar') { g.planes.splice(g.planes.indexOf(p), 1); g.rev++; }
    else replaceByBot(g, p.id);
  }
  if (g.ph === 'hangar') { for (const p of humans()) if (!g.planes.some((q) => q.id === p.id)) addPlayer(g, { ...p, type: 'f16' }, world); updateHangar(); }
  broadcastWorld(true);
}
// Le Hub a désigné ce joueur comme nouvel hôte : la partie repart du dernier état reçu
function becomeHost() {
  S.role = 'host';
  const w = S.lastWorld;
  S.acc = 0; S.tick = 0; S.lastSend = -99; S.netEv = []; S.pred = null; S.hist = []; S.snaps = []; S.vp.clear();
  if (w && w.ph !== 'over') {
    try {
      S.g = restoreGame(w, S.lastRows, world);
      const ids = new Set(H.players.map((p) => p.id));
      for (const p of S.g.planes) if (!p.bot && !ids.has(p.id)) replaceByBot(S.g, p.id);
      const me = S.g.planes.find((p) => p.id === S.myId);
      if (me && me.alive) controls.aimFrom(me.fx, me.fy, me.fz);
      S.hangarSince = performance.now();
      hud.toast('Tu deviens l\'hôte : la partie continue', 3);
      broadcastWorld(true);
      if (w.ph === 'hangar') updateHangar();
      return;
    } catch (e) { console.error(e); }
  }
  newGame(); hideEnd(); showHangar(); broadcastWorld(true);
}

// ------------------------------------------------------------------ événements
function onEvent(e, view) {
  const me = view.me, mine = me && me.id;
  switch (e.e) {
    case 'hit':
      scene.fx.hitSpark(e.x, e.y, e.z);
      if (e.by === mine) { hud.hitMarker(); sfx.hitConfirm(); }
      else if (e.id === mine) { hud.hurt(); sfx.hitMe(); scene.shake = Math.min(1, scene.shake + (e.msl ? 1 : 0.2)); }
      else sfx.hitOther(e.x, e.y, e.z);
      break;
    case 'kill': {
      scene.fx.explosion(e.x, e.y, e.z); sfx.explosion(e.x, e.y, e.z);
      const by = e.cause === 'force' ? `${e.byName} a forcé ${e.name} au crash` : `${e.byName} ✈ ${e.name}`;
      hud.addFeed(by, e.by === mine || e.id === mine);
      if (e.by === mine) hud.big(`${e.name} abattu !`);
      break;
    }
    case 'crash': {
      scene.fx.explosion(e.x, e.y, e.z); sfx.explosion(e.x, e.y, e.z);
      hud.addFeed(e.cause === 'collision' ? `${e.name} : collision` : e.cause === 'mer' ? `${e.name} a fini à la mer` : `${e.name} s'est écrasé`, e.id === mine);
      break;
    }
    case 'respawn': if (e.id === mine && me) { const p = S.role === 'guest' ? null : S.g.planes.find((q) => q.id === mine); if (p) controls.aimFrom(p.fx, p.fy, p.fz); scene.camInit = false; } break;
    case 'hot': if (e.id === mine) sfx.overheat(); break;
    case 'dust': scene.fx.dust(e.x, e.y, e.z); break;
    case 'mfire': sfx.missileLaunch(e.x, e.y, e.z); if (e.target === mine) hud.toast('Missile lancé sur toi !', 1.6); break;
    case 'mboom': scene.fx.explosion(e.x, e.y, e.z, false); sfx.explosion(e.x, e.y, e.z, false); break;
    case 'mlost': if (e.id === mine) hud.toast('Le missile a perdu ta trace', 1.8); break;
    case 'flare': { const p = view.planes.find((q) => q.id === e.id); scene.fx.flare(e.x, e.y, e.z, p ? p.fx * p.speed : 0, p ? p.fy * p.speed : 0, p ? p.fz * p.speed : 0); if (e.id === mine) sfx.flare(); break; }
    case 'help': if (e.by === mine) { hud.award(`Aide sur ${e.name}`); sfx.reward(); } break;
    case 'first': hud.addFeed(`Premier sang : ${e.name}`, e.by === mine); if (e.by === mine) hud.award('Premier sang'); break;
    case 'streak': {
      const t = e.n === 2 ? 'Doublé' : e.n === 3 ? 'Triplé' : `Série de ${e.n}`;
      hud.addFeed(`${e.name} : ${t.toLowerCase()}`, e.by === mine);
      if (e.by === mine) { hud.award(`${t} !`); sfx.reward(); }
      break;
    }
    case 'revenge': if (e.by === mine) { hud.award(`Revanche sur ${e.name}`); sfx.reward(); } break;
    case 'zone': {
      const z = view.zones && view.zones.find((q) => q.id === e.z), name = z ? `${e.z} (${z.name})` : e.z, team = me && me.team;
      if (e.own) hud.addFeed(`Zone ${name} : équipe ${e.own === 1 ? 'bleue' : 'rouge'}`, e.own === team);
      if (e.own && e.own === team) { hud.big(`Zone ${e.z} prise`); sfx.zoneWon(); }
      else if (e.was && e.was === team) { hud.big(`Zone ${e.z} perdue`); sfx.zoneLost(); }
      break;
    }
    case 'cargo':
      for (let i = 0; i < 3; i++) scene.fx.explosion(e.x + (i - 1) * 9, e.y, e.z);
      sfx.explosion(e.x, e.y, e.z);
      hud.addFeed(e.byName ? `${e.byName} abat le transport` : 'Le transport est détruit', e.by === mine);
      break;
    case 'roundEnd':
      hud.addFeed(e.byName ? `Manche ${e.n}${e.time ? ' au temps' : ''} : ${e.byName}` : `Manche ${e.n} : personne`, e.by === mine);
      if (e.by === mine) hud.big(`Manche ${e.n} gagnée`);
      else if (e.time && e.loser === mine) hud.big('Temps écoulé : tu es le plus abîmé');
      break;
    case 'round': {
      if (S.role === 'guest') { S.pred = null; S.predPrev = null; S.hist = []; }
      else { const p = S.g.planes.find((q) => q.id === mine); if (p && p.alive) controls.aimFrom(p.fx, p.fy, p.fz); }
      scene.camInit = false;
      const name = (id) => { const p = view.planes.find((q) => q.id === id); return !p ? '?' : p.id === mine ? 'toi' : p.name; };
      hud.toast(`Manche ${e.n} : ${name(e.a)} contre ${name(e.b)}`, 2.6);
      sfx.count();
      break;
    }
    case 'left': hud.addFeed(`${e.name} est parti : un bot reprend son avion`); break;
    case 'start': sfx.start(); break;
    case 'count': sfx.count(); break;
    default: break;
  }
}

// ------------------------------------------------------------------ présentation
function present(view, dt) {
  const me = view.me;
  if (view.ph === 'hangar') {
    scene.syncPlanes([]);
    scene.syncZones(null);
    scene.showPreview(S.type, me ? (me.tagColor || me.color) : '#3f7fe8', dt);
    scene.fx.update(dt, [], world);
    scene.draw();
    hud.clear();
    controls.setEnabled(false);
    sfx.updateEngine(0, false, false, false);
    return;
  }
  scene.hidePreview();
  controls.setEnabled(view.ph === 'play');
  if (view.ph === 'play') S.playT += dt;
  // au début de chaque vie, le point visé repart du nez
  const aliveNow = !!(me && me.alive);
  if (aliveNow && !S.lastAlive) { controls.aimFrom(me.fx, me.fy, me.fz); scene.camInit = false; }
  S.lastAlive = aliveNow;
  if (view.ph === 'countdown' && me) controls.aimFrom(me.fx, me.fy, me.fz);

  scene.syncPlanes(view.planes, dt);
  scene.syncZones(view.zones);
  for (const p of view.planes) scene.firing(p, dt);
  const aim = aliveNow ? controls.aim() : null;
  if (aliveNow) {
    S.boostAmt = (S.boostAmt || 0) + ((me.boosting ? 1 : 0) - (S.boostAmt || 0)) * Math.min(1, dt * 4);
    scene.updateCamera(me, aim, dt, S.boostAmt);
  } else if (me) {
    // en duel, on suit la manche ; ailleurs, celui qui nous a abattu, ou l'épave
    const by = view.duel ? view.planes.find((p) => p.alive && (p.id === view.duel.a || p.id === view.duel.b)) : view.planes.find((p) => p.alive && p.name === me.killedBy);
    if (by) scene.watch(by.x, by.y, by.z, dt);
    else scene.watch(me.x, me.y, me.z, dt);
  }
  scene.fx.syncMissiles(view.missiles, dt);
  scene.fx.update(dt, view.planes, world);
  scene.draw();

  // sons
  const cam = scene.camera;
  const right = cam.getWorldDirection(new scene.camera.position.constructor()).cross(cam.up).normalize();
  sfx.setListener(cam.position, right);
  if (view.ph === 'over') sfx.silence();
  else if (me) {
    sfx.updateEngine(me.speed, me.boosting, me.braking, me.alive);
    sfx.setFiring(aliveNow && me.firing);
    S.otherGunT -= dt;
    if (S.otherGunT <= 0) { S.otherGunT = 0.1; for (const p of view.planes) if (p.id !== me.id && p.alive && p.firing) sfx.otherGun(p.x, p.y, p.z); }
  }
  const terrain = aliveNow && lowTerrain(me);
  sfx.alarms(dt, { ground: terrain, missile: aliveNow && me.warn, lock: aliveNow ? me.lockT : 0, locked: aliveNow && me.lockT >= 1 && me.ms > 0 });
  // la zone survolée, et de combien il faut descendre pour la capturer
  const zone = aliveNow && view.zones ? view.zones.find((z) => Math.hypot(me.x - z.x, me.z - z.z) < z.r) : null;
  const zoneHigh = zone ? me.y - world.obstacleAt(me.x, me.z) - ZONE_CEIL : 0;
  hud.render(view, me, cam, aim, dt, { terrain, inCloud: world.inCloud(cam.position.x, cam.position.y, cam.position.z), scoreboard: controls.scoreboard, zone, zoneHigh });
}
// L'alerte de relief regarde devant : collines et toits compris
function lowTerrain(p) {
  if (p.y > 340) return false;
  for (const s of [0.6, 1.2, 2, 3]) {
    const x = p.x + p.fx * p.speed * s, y = p.y + p.fy * p.speed * s, z = p.z + p.fz * p.speed * s;
    if (y < world.obstacleAt(x, z) + 14) return true;
  }
  return false;
}

// ------------------------------------------------------------------ fin de partie
// Les titres de fin : ce que chacun a fait de mieux, pas seulement le score
function awards(list, mode) {
  const best = (score, min) => { let top = null, v = min; for (const p of list) { const x = score(p); if (x >= v && (!top || x > score(top))) { top = p; v = x; } } return top; };
  const out = [], add = (title, p, what) => { if (p) out.push({ title, name: p.name, what: what(p) }); };
  add('Inarrêtable', best((p) => p.best || 0, 3), (p) => `${p.best} d'affilée sans tomber`);
  if (mode === 'domination') add('Maître des lieux', best((p) => p.zt || 0, 30), (p) => `${Math.round(p.zt)} s dans les zones`);
  if (mode === 'escorte') {
    add('Chasseur de gros', best((p) => (p.team === 2 ? p.cdmg || 0 : 0), 1), (p) => `${Math.round(p.cdmg)} dégâts au transport`);
    add('Garde du corps', best((p) => (p.team === 1 ? p.kills : 0), 2), (p) => `${p.kills} attaquants abattus`);
  }
  add('Œil de lynx', best((p) => ((p.shots || 0) >= 40 ? p.hits / p.shots : 0), 0.01), (p) => `${Math.round(p.hits / p.shots * 100)} % de précision`);
  add('As du missile', best((p) => p.mhits || 0, 2), (p) => `${p.mhits} missiles au but`);
  add('Ailier en or', best((p) => p.helps || 0, 2), (p) => `${p.helps} aides`);
  add('Increvable', best((p) => (p.deaths === 0 ? p.kills : 0), 1), () => 'aucune mort');
  return out.slice(0, 4);
}

function showEnd(view) {
  if (S.endShown) return;
  S.endShown = true;
  const me = view.me, team = isTeamMode(view.mode), rows = view.planes.filter((p) => p.type !== 'cargo').map((p) => ({ ...p })).sort((a, b) => b.kills - a.kills || (b.helps || 0) - (a.helps || 0) || a.deaths - b.deaths);
  let title, sub;
  if (view.mode === 'escorte') {
    const won = me && me.team === view.winTeam;
    title = won ? 'Victoire !' : 'Défaite';
    sub = view.winTeam === 1 ? 'Le transport a tenu jusqu\'au bout.' : 'Le transport a été abattu.';
  } else if (team) {
    const a = Math.round(view.tk[1]), b = Math.round(view.tk[2]);
    if (!view.winTeam) { title = 'Match nul'; sub = `${a} partout`; }
    else { const won = me && me.team === view.winTeam; title = won ? 'Victoire !' : 'Défaite'; sub = `Équipe ${view.winTeam === 1 ? 'bleue' : 'rouge'} : ${a} — ${b}`; }
  } else if (view.winner === null) { title = 'Match nul'; sub = 'Personne ne se détache : retentez votre chance.'; }
  else { const win = view.planes.find((p) => p.id === view.winner); const won = me && view.winner === me.id; title = won ? 'Victoire !' : `${win ? win.name : '?'} gagne`; sub = won ? (view.mode === 'duel' ? 'Le roi du ciel, c\'est toi.' : 'Le ciel est à toi.') : 'Tu feras mieux au prochain vol.'; }
  const won = me && (team ? me.team === view.winTeam : view.winner === me.id);
  if (won) sfx.win(); else sfx.lose();
  $('#endTitle').textContent = title; $('#endSub').textContent = sub;
  $('#endRows').innerHTML = rows.map((p, i) => `<tr class="${me && p.id === me.id ? 'me' : ''}"><td>${i + 1}</td><td><i style="background:${p.tagColor || p.color}"></i>${esc(p.name)}${p.bot ? ' <em>bot</em>' : ''}</td><td>${planeName(p.type)}</td><td>${p.kills}</td><td>${p.helps || 0}</td><td>${p.deaths}</td></tr>`).join('');
  $('#endAwards').innerHTML = awards(rows, view.mode).map((a) => `<li><b>${a.title}</b><span>${esc(a.name)} · ${a.what}</span></li>`).join('');
  const host = S.role !== 'guest';
  $('#btnReplay').hidden = !host;
  $('#endWait').hidden = host;
  $('#endScreen').classList.remove('hidden');
  controls.setEnabled(false);
}
function hideEnd() { $('#endScreen').classList.add('hidden'); }

function reportResult() {
  if (S.reported || !H.embedded || !H.report || S.role === 'guest' || !S.g) return;
  S.reported = true;
  const g = S.g;
  // une partie sans aucune élimination ne compte pas
  if (!g.planes.some((p) => p.kills > 0)) return;
  const ranked = ranking(g);
  H.report({
    id: `dogfight-${S.run}-${Date.now()}-${ranked.filter((p) => !p.bot).map((p) => p.id).join('.')}`,
    mode: MODE_NAMES[g.settings.mode] || 'Chacun pour soi',
    players: ranked.map((p, i) => ({ id: p.bot ? null : p.id, name: p.name, color: p.color, bot: p.bot, rank: i + 1, score: p.kills })),
  });
}

// ------------------------------------------------------------------ sortie
function teardown() {
  if (!S.alive) return;
  S.alive = false;
  cancelAnimationFrame(raf);
  clearInterval(bgTimer);
  document.removeEventListener('visibilitychange', onVisibility);
  if (controls) controls.dispose();
  if (scene) scene.dispose();
  sfx.dispose();
  removeEventListener('pagehide', teardown);
}
addEventListener('pagehide', teardown);
function exitToLobby() {
  if (!H.embedded) { location.reload(); return; }
  teardown();
  H.exit();
}

init().catch((err) => { console.error('Erreur au démarrage de Dogfight 3D :', err); status('Erreur au démarrage : recharge la page.'); });
