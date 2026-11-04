// Mystère Mystère : démarrage, manches, boucle de jeu, réseau via le Hub.
// L'hôte fait tourner le moteur à 60 Hz et diffuse les joueurs 20 fois par seconde, l'état lent (pièces, couteaux, passages…)
// quand il change, et à chacun en privé ce que lui seul doit savoir (son rôle, ses temps de recharge). Personne d'autre ne
// connaît le meurtrier avant la fin de la manche. L'invité envoie ses commandes à 30 Hz, anticipe son propre pas avec le
// même movePlayer, se recale sur l'hôte en rejouant ce que l'hôte n'a pas encore vu, et voit les autres ~100 ms en retard.
// Si l'hôte part, la manche s'arrête et le nouvel hôte relance. ?debug expose __mystery ; ?autostart, ?seed, ?mode=explore, ?bots=4, ?lag=150.
import * as THREE from '../shared/vendor/three/three.module.min.js';
import { Sim, DT, FL, CD, emptyInput, movePlayer, EYE } from './engine/sim.js';
import { buildMap, LV_Y, li, roomAt, STYLES } from './engine/map.js';
import { createScene } from './view/scene.js';
import { Input } from './input.js';
import { Sfx } from './view/sfx.js';
import { HUD, briefingHtml, menuHtml, endHtml, ROLE_COLOR } from './view/hud.js';

const H = window.HubBridge;
const QS = new URLSearchParams(location.search);
const LAG = Math.max(0, Math.min(1000, +QS.get('lag') || 0));
const $ = (s) => document.querySelector(s);
const screenEl = $('#screen');
const INTERP = 0.1, HOST_SILENCE = 2.5, HOST_GIVEUP = 15, MAX_REPLAY = 90, AUTO_NEXT = 12;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lerpA = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };

const M = buildMap();
const S = {
  role: 'solo', myId: 0, cfg: null, sim: null, runId: 0, lobby: true, menu: false, alive: true, endShown: false, reported: false, netEv: [], tick: 0, lastSend: 0, lastW: -99,
  acc: 0, inp: null, seq: 0, sendT: 0, gotHost: false, hiT: 0, snapAt: 0, view: null, overT: 0, warned: false, roleShown: false, board: false,
  // invité
  w: null, sheets: new Map(), snaps: [], off: null, pred: null, pending: [], errX: 0, errZ: 0, me: null, meAt: 0, flying: [],
  // vue
  rp: new Map(), specI: 0, steps: new Map(), sentMe: new Map(), totals: {}, lastM: [], autoT: 0, heartT: 0, lastTick: -1,
};
const send = (to, m, o) => { if (LAG) setTimeout(() => H.send(to, m, o), LAG / 2); else H.send(to, m, o); };

// ------------------------------------------------------------------ montage
const hud = new HUD();
const sfx = new Sfx();
let scene = null;
try { scene = createScene($('#stage'), { map: M, quality: QS.get('q') || 'normal', onLost: () => hud.toast('Affichage 3D interrompu : recharge la page', 6) }); }
catch (e) { console.error(e); }
const input = new Input($('#stage'), {
  menu: () => toggleMenu(),
  unlocked: () => { if (!S.lobby && !S.endShown && !S.menu && !QS.has('debug') && !document.body.classList.contains('touch')) toggleMenu(); },
  mute: () => { sfx.unlock(); DDVolume.toggle(); },
  unlock: () => sfx.unlock(),
  enter: () => { const b = $('#btnGo') || $('#btnAgain'); if (b) b.click(); },
  board: (on) => { S.board = on; },
  spec: (d) => { S.specI += d; },
  canDraw: () => !!myWeapon(),
  drawChanged: (on) => { if (!on && S.view && S.view.real && S.view.real.held) sfx.play('holster'); },
  wheel: (d) => {
    if (S.view && !S.view.mine) { S.specI += d; return; }
    if (S.view && S.view.w.mode === 'explore' && input.draw) { input.ws = input.ws ? 0 : 1; return; }
    if (myWeapon()) input.setDraw(!input.draw);
  },
});
input.bindTouch($('#tbtns'));
const SETTINGS = {
  accent: '#ffc94d',
  hint: 'Touche <kbd>M</kbd> : couper ou remettre le son.',
  test: (k) => sfx.play(k === 'music' ? 'role-i' : 'coin'),
  sections: [
    { title: 'Jeu', items: [
      { label: 'Commandes', get: () => (input.kb ? 'kb' : 'mouse'), set: (v) => input.setKb(v === 'kb'), options: [['mouse', 'Souris'], ['kb', 'Sans souris']] },
      { label: 'Sensibilité de la vue', get: () => input.sens, set: (v) => input.setSens(v), range: [0.3, 3, 0.05], format: (v) => `${Math.round(v * 100)} %` },
      { label: 'Qualité de l\'image', get: () => S.quality || 'normal', set: (v) => { S.quality = v; try { localStorage.setItem('mystery_q', v); } catch (e) {} scene && scene.setQuality(v); }, options: [['bas', 'Rapide'], ['normal', 'Normale'], ['haut', 'Fine']] },
    ] },
    { title: 'Commandes', items: [{ keys: [
      ['Se déplacer · courir · sauter', '<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Maj</kbd> · <kbd>Espace</kbd>', 'stick gauche · LB · Ⓐ'],
      ['Ranger · sortir l\'arme', '<kbd>1</kbd> <kbd>2</kbd> ou molette', 'Ⓨ'],
      ['Frapper · tirer', 'clic gauche', 'gâchette droite'],
      ['Lancer le couteau', 'clic droit', 'gâchette gauche'],
      ['Passage secret · ramasser', '<kbd>E</kbd>', 'Ⓧ'],
      ['Couper le courant (meurtrier)', '<kbd>F</kbd>', 'Ⓑ'],
      ['Invités', '<kbd>Tab</kbd>', ''],
      ['Pause', '<kbd>Échap</kbd>', 'Start'],
    ] }] },
    { title: 'Sans souris', items: [{ keys: [
      ['Se déplacer', '<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd>'],
      ['Tourner la vue', '<kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd>'],
      ['Frapper · tirer', '<kbd>F</kbd>'],
      ['Lancer le couteau', 'tenir <kbd>G</kbd> : plus longtemps, plus fort'],
      ['Couper le courant (meurtrier)', '<kbd>C</kbd>'],
    ] }] },
  ],
};
try { S.quality = localStorage.getItem('mystery_q') || 'normal'; if (S.quality !== 'normal' && scene) scene.setQuality(S.quality); } catch (e) {}
$('#btnSet').innerHTML = DDVolume.ICON;
DDVolume.panel($('#btnSet'), SETTINGS);
input.listen($('#btnMenu'), 'click', () => toggleMenu());
input.listen(document, 'visibilitychange', () => { if (document.hidden && S.role === 'solo' && S.sim && !S.menu && !S.endShown && !S.lobby && !QS.has('debug')) toggleMenu(); });

let raf = 0;
function teardown() {
  if (!S.alive) return;
  S.alive = false;
  cancelAnimationFrame(raf);
  input.dispose(); scene && scene.dispose(); sfx.dispose();
  removeEventListener('pagehide', teardown);
}
addEventListener('pagehide', teardown);
function exitToLobby() { if (!H.embedded) { location.reload(); return; } teardown(); H.exit(); }

// ------------------------------------------------------------------ réglages et joueurs
const LEVELS = ['facile', 'normal', 'expert'], TIMES = [120, 180, 240], BOTS = [0, 2, 4, 6, 8], MODES = ['classic', 'explore'];
function readCfg(settings = {}) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('mystery_cfg') || '{}'); } catch (e) {}
  const src = H.embedded ? { ...saved, ...settings } : { ...saved, ...Object.fromEntries(QS) };
  const num = (v, d, ok) => (v === undefined || v === '' || !Number.isFinite(+v) || (ok && !ok.includes(+v)) ? d : +v);
  return {
    mode: MODES.includes(src.mode) ? src.mode : 'classic', level: LEVELS.includes(src.level) ? src.level : 'normal',
    time: num(src.time, 180, TIMES), bots: num(src.bots, H.embedded ? 2 : 6, BOTS),
  };
}
function localProfile() {
  const g = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  return { name: String(g('dd_name', '') || 'Invité').slice(0, 14) || 'Invité', color: g('dd_color', '#4da3ff') };
}
const PALETTE = ['#4da3ff', '#ff6b9a', '#3ddc84', '#ffc531', '#b07bff', '#ff8a3d', '#3dd6d0', '#e8e8f0', '#9a6b4f', '#7a8cff'];
const BOT_NAMES = ['Lady Rose', 'Colonel Moutarde', 'Pr Violet', 'Mme Pervenche', 'Dr Olive', 'Baron Bleu', 'Duchesse Ambre', 'Comte Cassis', 'Mlle Prune', 'Sir Gaspard'];
function humanPlayers() {
  if (!H.embedded) { const p = localProfile(); return [{ id: 0, name: p.name, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PALETTE[0] }]; }
  return H.players.map((p, i) => ({ id: p.id, name: p.name, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PALETTE[i % PALETTE.length] }));
}
const isReady = (id) => id === S.myId || !H.embedded || H.readyMap[id] === 'mystery';
const squad = () => humanPlayers().map((p) => ({ ...p, me: p.id === S.myId, ready: isReady(p.id) }));
const plannedBots = () => { const n = squad().filter((p) => p.ready).length; return S.cfg.mode === 'explore' ? 0 : Math.max(S.cfg.bots, 3 - n); };

// ------------------------------------------------------------------ démarrage
function boot(info) {
  S.role = H.embedded ? info.role : 'solo';
  S.myId = H.embedded ? info.myId : 0;
  S.cfg = readCfg(info.settings || {});
  H.on('msg', (from, m) => { if (LAG) setTimeout(() => onMsg(from, m), LAG / 2); else onMsg(from, m); });
  H.on('roster', onRoster);
  if (H.embedded) H.signalReady(); // après on('msg') : sinon les premiers messages de l'hôte se perdent
  if (!scene) { showNoGL(); if (H.shown) H.shown(); return; }
  showBriefing();
  scene.ready.then(() => { if (H.shown) H.shown(); });
  if (S.role === 'guest') send('host', { t: 'hi' });
  raf = requestAnimationFrame(loop);
  if (QS.has('debug')) window.__mystery = { S, scene, input, hud, sfx, M, teardown, start: () => startRun(), run: (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) step(1 / 60); }, ff: (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) { S.sim.step(DT); for (const e of S.sim.drainEvents()) if (S.view) fxEvent(e, S.view); } }, to: (x, z, lv = 0) => { const p = S.sim.byId.get(S.myId); p.x = x; p.z = z; p.lv = lv; p.y = LV_Y[li(lv)]; } };
  if (QS.has('autostart') && S.role !== 'guest') scene.ready.then(() => setTimeout(startRun, 100));
}
if (H.embedded) H.on('init', boot); else boot({});

function showNoGL() {
  screenEl.hidden = false; screenEl.className = 'screen dim';
  screenEl.innerHTML = `<div class="nogl"><p>Ton navigateur n'arrive pas à afficher la 3D (WebGL).</p>${H.embedded ? '<button class="btn" id="btnExit">Retour au salon</button>' : ''}</div>`;
  const b = $('#btnExit'); if (b) b.onclick = exitToLobby;
}
function showBriefing() {
  if (!S.lobby) return;
  screenEl.className = 'screen'; screenEl.hidden = false;
  const sq = squad(), bots = plannedBots();
  screenEl.innerHTML = briefingHtml({ host: S.role !== 'guest', squad: sq, cfg: S.cfg, embedded: H.embedded, bots, total: sq.filter((p) => p.ready).length + bots });
  hud.show(false);
  const go = $('#btnGo'); if (go) { go.onclick = () => { sfx.unlock(); sfx.play('ui'); startRun(); }; go.focus({ preventScroll: true }); }
  const ex = $('#btnExit'); if (ex) ex.onclick = exitToLobby;
  for (const b of screenEl.querySelectorAll('.seg button')) b.onclick = () => {
    const k = b.dataset.k, v = b.dataset.v;
    S.cfg[k] = k === 'mode' || k === 'level' ? v : +v;
    try { localStorage.setItem('mystery_cfg', JSON.stringify(S.cfg)); } catch (e) {}
    sfx.unlock(); sfx.play('ui'); showBriefing();
  };
}
function hideScreen() { screenEl.hidden = true; screenEl.innerHTML = ''; S.menu = false; hud.show(true); if (!input.free && !QS.has('debug') && !input.locked) input.lock(); }

// ------------------------------------------------------------------ hôte
function startRun() {
  if (S.role === 'guest') return;
  const dbg = QS.has('debug'), seed = dbg && QS.get('seed') ? +QS.get('seed') : (Math.random() * 2 ** 31) | 0;
  const sim = new Sim({ seed, mode: S.cfg.mode, duration: S.cfg.time, level: S.cfg.level, map: M });
  const humans = squad().filter((p) => p.ready);
  let model = Math.floor(Math.random() * 6);
  for (const p of humans) sim.addPlayer({ id: p.id, name: p.name, color: p.color, model: (model++) % 6 });
  const nb = plannedBots(), free = Math.floor(Math.random() * BOT_NAMES.length);
  for (let k = 0; k < nb; k++) sim.addPlayer({ id: 1000 + k, name: BOT_NAMES[(free + k) % BOT_NAMES.length], color: PALETTE[(humans.length + k) % PALETTE.length], model: (model++) % 6, bot: true });
  const forced = dbg && QS.get('role');
  sim.assignRoles({ avoid: S.lastM, murderer: forced === 'm' ? S.myId : forced === 'i' ? 1000 : undefined, sheriff: forced === 's' ? S.myId : forced === 'i' ? 1001 : undefined });
  S.lastM = sim.players.filter((p) => p.role === 'm').map((p) => p.id);
  sim.w.round = (S.round = (S.round || 0) + 1);
  S.sim = sim; S.runId = Date.now(); S.lobby = false; S.endShown = false; S.reported = false; S.netEv = []; S.acc = 0; S.tick = 0; S.lastW = -999; S.lastSend = -99;
  S.rp.clear(); S.steps.clear(); S.sentMe.clear(); S.roleShown = false; S.overT = 0; S.specI = 0; S.autoT = 0;
  const me = sim.byId.get(S.myId);
  if (me) { input.yaw = me.yaw; input.pitch = 0; }
  input.setDraw(false); input.ws = 0;
  hideScreen();
  if (H.embedded) send('all', { t: 'go', run: S.runId });
}
const hasGuests = () => H.embedded && H.players.length > 1;

function hostFrame(dt) {
  const sim = S.sim, paused = S.menu && S.role === 'solo';
  if (!paused) S.acc += Math.min(0.1, dt);
  const frameEv = [];
  while (S.acc >= DT) {
    S.acc -= DT;
    if (S.inp) sim.setInput(S.myId, { ...S.inp, q: ++S.seq });
    for (const p of sim.players) { p._px = p.x; p._pz = p.z; p._py = p.y; }
    sim.step(DT);
    const ev = sim.drainEvents();
    frameEv.push(...ev);
    if (hasGuests()) S.netEv.push(...ev);
    S.tick++;
  }
  if (hasGuests()) {
    if (sim.dirty ? S.tick - S.lastW >= 6 : S.tick - S.lastW >= 90) { S.lastW = S.tick; sim.dirty = false; send('all', { t: 'w', run: S.runId, w: worldMsg(sim) }); }
    if (S.netEv.length) { send('all', { t: 'e', run: S.runId, e: S.netEv.map(publicEvent) }); S.netEv = []; }
    if (S.tick - S.lastSend >= 3) {
      S.lastSend = S.tick;
      send('all', { t: 's', run: S.runId, ts: +sim.time.toFixed(3), r: sim.rows(), k: sim.flying() }, { volatile: true });
      // à chacun sa fiche, quand elle change
      for (const p of sim.players) {
        if (p.bot || p.id === S.myId) continue;
        const sh = JSON.stringify(sim.sheet(p));
        if (S.sentMe.get(p.id) !== sh || S.tick % 60 === 0) { S.sentMe.set(p.id, sh); send(p.id, { t: 'me', run: S.runId, me: sim.sheet(p) }); }
      }
    }
  } else sim.dirty = false;
  // ce qu'on affiche : entre deux pas du moteur
  const f = S.acc / DT, list = [];
  for (const p of sim.players) {
    const r = renderOf(p.id);
    const h = p.drawn ? sim.holding(p) : null;
    Object.assign(r, { id: p.id, name: p.name, color: p.color, model: p.model, bot: p.bot, spec: p.spec, lv: p.lv, yaw: p.yaw, pitch: p.pitch, moving: p.moving, run: p.run, air: p.air, held: h, atk: p.atkT > 0, shot: p.shotT > 0, throw: p.throwT > 0, dead: p.st === 'dead', stun: p.stun > 0, coins: p.coins, cdGun: p.cd.gun });
    const far = p._px === undefined || Math.abs(p._px - p.x) + Math.abs(p._pz - p.z) > 2;
    r.x = far ? p.x : p._px + (p.x - p._px) * f; r.z = far ? p.z : p._pz + (p.z - p._pz) * f; r.y = far ? p.y : p._py + (p.y - p._py) * f;
    list.push(r);
  }
  const me = sim.byId.get(S.myId);
  const priv = me ? { role: me.role, coins: me.coins, cd: me.cd, hasKnife: me.hasKnife, hasGun: me.hasGun, stam: me.stam, stun: me.stun > 0 } : null;
  const view = buildView(list, hostWorld(sim), priv, sim.flying().map(knifeOf));
  for (const e of frameEv) fxEvent(e, view);
  if (sim.w.ph === 'over') report(sim);
  return view;
}
const renderOf = (id) => { let r = S.rp.get(id); if (!r) S.rp.set(id, r = {}); return r; };
const knifeOf = (k) => ({ id: k[0], x: k[1] / 100, y: k[2] / 100, z: k[3] / 100, yaw: k[4] / 1000, fly: true });
// le monde vu par la scène (côté hôte : tiré du moteur)
function hostWorld(sim) {
  const w = sim.w;
  return { ph: w.ph, t: w.t, dur: w.dur, mode: w.mode, bo: w.bo, win: w.win, why: w.why, hero: w.hero, pass: w.pass.map((v) => (v > 0 ? 1 : 0)), coins: w.coins, knives: w.knives.filter((k) => !k.fly).map((k) => ({ id: k.id, x: k.x, y: k.y, z: k.z, yaw: k.yaw, owner: k.owner })), guns: w.guns, sheriffDead: w.sheriffDead, roles: w.roles, intro: w.intro };
}
function worldMsg(sim) { const m = sim.world(); m.tot = S.totals; return m; }
// les événements partent chez tout le monde : on retire ce qui trahirait le meurtrier
function publicEvent(e) { if (e.e === 'blackout') return { e: 'blackout' }; if (e.e === 'kill') { const { by, ...rest } = e; return rest; } return e; }

function onRoster() {
  if (!S.alive) return;
  if (S.role === 'guest' && H.info.role === 'host') becomeHost();
  if (S.role !== 'host') { if (S.lobby) showBriefing(); return; }
  if (S.lobby) { showBriefing(); return; }
  const sim = S.sim; if (!sim) return;
  const ids = new Set(H.players.map((p) => p.id));
  for (const p of [...sim.players]) if (!p.bot && p.id !== S.myId && (!ids.has(p.id) || !isReady(p.id))) sim.replaceByBot(p.id);
  for (const p of squad()) if (p.ready && !sim.byId.has(p.id)) { sim.addPlayer({ id: p.id, name: p.name, color: p.color, spec: true }); send(p.id, { t: 'go', run: S.runId }); }
}
// le Hub a désigné ce joueur comme nouvel hôte : les rôles étaient secrets, la manche ne peut pas continuer
function becomeHost() {
  S.role = 'host'; S.snaps = []; S.pending = []; S.pred = null;
  if (!S.lobby) { hud.toast('L\'hôte est parti : tu reprends la main, relance une manche', 4); }
  S.sim = null; S.lobby = true; S.endShown = false; input.unlock(); showBriefing();
}
function report(sim) {
  if (S.reported || S.role === 'guest') return;
  S.reported = true;
  const ranked = sim.ranking();
  for (const p of ranked) S.totals[p.id] = (S.totals[p.id] || 0) + p.score;
  sim.dirty = true;
  if (!H.embedded || sim.w.mode === 'explore') return;
  H.report({
    id: `mystery-${S.runId}-${ranked.filter((p) => !p.bot).map((p) => p.id).join('.')}`,
    mode: sim.w.win === 'm' ? 'Victoire du meurtrier' : 'Victoire des innocents',
    players: ranked.map((p, k) => ({ id: p.bot ? null : p.id, name: p.name, color: p.color, bot: p.bot, rank: k + 1, score: p.score })),
  });
}

// ------------------------------------------------------------------ messages
function onMsg(from, m) {
  if (!S.alive || !m || typeof m !== 'object') return;
  if (S.role === 'host' || S.role === 'solo') {
    if (m.t === 'hi') {
      if (!S.lobby && S.sim) {
        if (!S.sim.byId.has(from)) { const p = squad().find((q) => q.id === from); if (p) S.sim.addPlayer({ id: p.id, name: p.name, color: p.color, spec: true }); }
        send(from, { t: 'go', run: S.runId }); S.sim.dirty = true; S.lastW = -999; S.sentMe.delete(from);
      }
    } else if (m.t === 'i' && S.sim) S.sim.setInput(from, cleanInput(m)); // `from` vient du Hub : seule identité fiable
    return;
  }
  if (from !== H.info.hostId) return; // invité : seul l'hôte fait foi
  S.gotHost = true; S.snapAt = performance.now();
  if (m.t === 'go') newRun(m.run);
  else if (m.t === 'w' && m.w) { if (m.run !== S.runId) newRun(m.run); receiveWorld(m.w); }
  else if (m.t === 's' && Array.isArray(m.r)) { if (m.run === S.runId) receiveRows(m); }
  else if (m.t === 'me' && m.me) { if (m.run === S.runId) { S.me = m.me; S.meAt = performance.now(); if (S.pred) S.pred.stam = m.me.stam; } }
  else if (m.t === 'e' && Array.isArray(m.e)) { if (m.run === S.runId && S.view) for (const e of m.e) fxEvent(e, S.view); }
}
function newRun(run) {
  if (S.runId === run && !S.lobby) return;
  S.runId = run; S.lobby = false; S.endShown = false; S.w = null; S.sheets.clear(); S.snaps = []; S.pending = []; S.pred = null; S.off = null; S.rp.clear(); S.steps.clear(); S.roleShown = false; S.overT = 0; S.errX = S.errZ = 0; S.me = null; S.specI = 0;
  input.setDraw(false); input.ws = 0;
  hideScreen();
}
function cleanInput(m) {
  const n = (v, a, b) => (Number.isFinite(+v) ? clamp(+v, a, b) : 0);
  return { mx: n(m.mx, -1, 1), my: n(m.my, -1, 1), yaw: n(m.yaw, -1e4, 1e4), pitch: n(m.pitch, -1.5, 1.5), run: !!m.run, jump: !!m.jump, draw: !!m.draw, ws: m.ws ? 1 : 0, fc: m.fc | 0, sc: m.sc | 0, uc: m.uc | 0, bc: m.bc | 0, q: m.q | 0, tp: m.tp === undefined ? 1 : n(m.tp, 0.3, 1) };
}

// ------------------------------------------------------------------ invité
function receiveWorld(world) {
  const { pl, coins, knives, guns, tot, ...w } = world;
  w.coins = coins.map((c) => ({ id: c[0], lv: c[1], x: c[2] / 10, z: c[3] / 10, y: LV_Y[li(c[1])] }));
  w.knives = knives.map((k) => ({ id: k[0], x: k[1] / 100, y: k[2] / 100, z: k[3] / 100, yaw: k[4] / 1000, owner: k[5] }));
  w.guns = guns.map((g) => ({ id: g[0], x: g[1] / 100, y: g[2] / 100, z: g[3] / 100, lv: g[4] }));
  if (S.w) w.t = Math.abs(S.w.t - w.t) < 1 ? S.w.t : w.t;
  S.w = w; if (tot) S.totals = tot;
  for (const f of pl) { const q = S.sheets.get(f.id); S.sheets.set(f.id, q ? Object.assign(q, f) : f); }
  for (const id of [...S.sheets.keys()]) if (!pl.some((f) => f.id === id)) S.sheets.delete(id);
}
function applyRow(p, r) {
  p.x = r[1] / 100; p.y = r[2] / 100; p.z = r[3] / 100; p.yaw = r[4] / 1000; p.pitch = r[5] / 1000; p.lv = r[8];
  const f = r[6];
  p.moving = !!(f & FL.MOVE); p.run = !!(f & FL.RUN); p.air = !!(f & FL.AIR); p.held = f & FL.KNIFE ? 'knife' : f & FL.GUN ? 'gun' : null;
  p.atk = !!(f & FL.ATK); p.shot = !!(f & FL.SHOT); p.throw = !!(f & FL.THROW); p.dead = !!(f & FL.DEAD); p.stun = !!(f & FL.STUN); p.spec = !!(f & FL.SPEC);
}
function receiveRows(m) {
  const now = performance.now() / 1000;
  const o = now - m.ts;
  if (S.off == null || o < S.off || Math.abs(o - S.off) > 1) S.off = o; else S.off += (o - S.off) * 0.02;
  S.snaps.push({ t: m.ts, rows: new Map(m.r.map((r) => [r[0], r])) });
  if (S.snaps.length > 10) S.snaps.shift();
  S.flying = (m.k || []).map(knifeOf);
  reconcile(m.r);
}
// se recaler sur l'hôte : on repart de sa position, et on rejoue les pas qu'il n'a pas encore reçus
function reconcile(rows) {
  const r = rows.find((q) => q[0] === S.myId);
  if (!r || !S.w) return;
  const f = r[6];
  if (!S.pred) { S.pred = { x: 0, y: 0, z: 0, lv: 0, vy: 0, air: false, yaw: 0, pitch: 0, st: 'ok', stam: 100, stun: 0, run: false, moving: false }; applyPredRow(S.pred, r); input.yaw = S.pred.yaw; input.pitch = 0; return; }
  const P = S.pred, ox = P.x, oz = P.z, yaw = P.yaw, pitch = P.pitch;
  applyPredRow(P, r); P.yaw = yaw; P.pitch = pitch;
  void f;
  const ack = r[7];
  S.pending = S.pending.filter((s) => s.q > ack);
  if (S.pending.length > MAX_REPLAY) S.pending.splice(0, S.pending.length - MAX_REPLAY);
  for (const s of S.pending) movePlayer(M, S.w, P, s.inp, DT);
  const dx = ox - P.x, dz = oz - P.z, d = Math.hypot(dx, dz);
  if (d > 3) { S.errX = S.errZ = 0; } else { S.errX += dx; S.errZ += dz; const e = Math.hypot(S.errX, S.errZ); if (e > 1.2) { S.errX *= 1.2 / e; S.errZ *= 1.2 / e; } }
}
function applyPredRow(P, r) { P.x = r[1] / 100; P.y = r[2] / 100; P.z = r[3] / 100; P.yaw = r[4] / 1000; P.pitch = r[5] / 1000; P.lv = r[8]; const f = r[6]; P.st = f & FL.DEAD ? 'dead' : 'ok'; P.stun = f & FL.STUN ? 1 : 0; P.air = !!(f & FL.AIR); if (!P.air) P.vy = 0; }
function guestFrame(dt) {
  if (!S.w || !S.snaps.length) return null;
  const w = S.w, rt = performance.now() / 1000 - S.off - INTERP;
  let a = S.snaps[0], b = S.snaps[S.snaps.length - 1];
  for (let i = 0; i < S.snaps.length - 1; i++) if (S.snaps[i].t <= rt && S.snaps[i + 1].t >= rt) { a = S.snaps[i]; b = S.snaps[i + 1]; break; }
  if (rt >= b.t) a = b;
  const f = a === b ? 0 : clamp((rt - a.t) / (b.t - a.t), 0, 1);
  if (w.ph === 'play' && w.t > 0) w.t = Math.max(0, w.t - dt);
  if (w.bo > 0) w.bo = Math.max(0, w.bo - dt);
  // mon pas à moi, sans attendre l'hôte
  if (S.pred && S.inp) {
    S.acc += Math.min(0.1, dt);
    while (S.acc >= DT) { S.acc -= DT; const inp = { ...S.inp, q: S.seq + 1 }; movePlayer(M, w, S.pred, inp, DT); S.pending.push({ q: S.seq + 1, inp }); }
    const k = Math.exp(-dt * 10); S.errX *= k; S.errZ *= k;
  }
  if (S.me) { for (const k in S.me.cd) S.me.cd[k] = Math.max(0, S.me.cd[k] - dt); }
  const list = [];
  for (const [id, sh] of S.sheets) {
    const r = renderOf(id);
    Object.assign(r, { id, name: sh.name, color: sh.color, model: sh.model, bot: sh.bot, coins: sh.coins, spec: sh.spec });
    const rb = b.rows.get(id), ra = a.rows.get(id) || rb;
    if (!rb) continue;
    applyRow(r, rb);
    r.x = (ra[1] + (rb[1] - ra[1]) * f) / 100; r.y = (ra[2] + (rb[2] - ra[2]) * f) / 100; r.z = (ra[3] + (rb[3] - ra[3]) * f) / 100;
    r.yaw = lerpA(ra[4] / 1000, rb[4] / 1000, f); r.pitch = (ra[5] + (rb[5] - ra[5]) * f) / 1000;
    if (id === S.myId && S.pred && !r.dead) {
      r.x = S.pred.x + S.errX; r.z = S.pred.z + S.errZ; r.y = S.pred.y; r.lv = S.pred.lv; r.moving = S.pred.moving; r.run = S.pred.run;
    }
    r.cdGun = id === S.myId && S.me ? S.me.cd.gun : 0;
    list.push(r);
  }
  const me = S.me;
  const priv = me ? { role: me.role, coins: me.coins, cd: me.cd, hasKnife: me.hasKnife, hasGun: me.hasGun, stam: S.pred ? S.pred.stam : me.stam, stun: me.stun > 0 && !!list.find((p) => p.id === S.myId)?.stun } : null;
  return buildView(list, w, priv, S.flying);
}

// ------------------------------------------------------------------ ce qu'on voit
function buildView(list, w, priv, flying) {
  const real = list.find((p) => p.id === S.myId) || null;
  let me = real, mine = true;
  if (!real || real.dead || real.spec) {
    // on suit un autre invité encore en vie
    const pool = list.filter((p) => p !== real && !p.spec && !p.dead);
    me = pool.length ? pool[((S.specI % pool.length) + pool.length) % pool.length] : real; mine = false;
    if (real && real.dead && S.deadT > 0) { me = real; }
  }
  if (real && mine) { real.yaw = input.yaw; real.pitch = input.pitch; }
  const camMode = mine ? 'fps' : 'spec';
  let yaw = input.yaw, pitch = input.pitch;
  return { w, players: list, me, real, mine, camMode, yaw, pitch, priv, flying };
}
function myWeapon() {
  const v = S.view; if (!v) return null;
  const p = v.priv; if (!p) return null;
  if (v.w.mode === 'explore') return input.ws ? 'gun' : 'knife';
  if (p.role === 'm') return p.hasKnife ? 'knife' : null;
  return p.hasGun ? 'gun' : null;
}

// ------------------------------------------------------------------ effets, sons, annonces
const nameOf = (id) => { const p = S.view && S.view.players.find((q) => q.id === id); return p ? `<b style="--c:${esc(p.color)}">${esc(p.name)}</b>` : 'Quelqu\'un'; };
function fxEvent(e, v) {
  const fx = scene && scene.fx, meId = S.myId, me = v.real;
  const pos = { x: e.x, y: e.y, z: e.z };
  const mine = e.id === meId;
  switch (e.e) {
    case 'start':
      sfx.play('start'); hud.banner(v.w.mode === 'explore' ? 'Le manoir est à toi<small>Explore, trouve les passages secrets</small>' : 'Les lumières vacillent…<small>Le meurtrier est parmi vous</small>', 2.6);
      break;
    case 'draw': sfx.play(e.k === 'knife' ? 'drawKnife' : 'drawGun', { ...pos, range: e.k === 'knife' ? 12 : 16 }); break;
    case 'swing': sfx.play('swing', { ...pos, range: 14 }); if (mine) fx && fx.swing(); break;
    case 'throw': sfx.play('throw', { ...pos, range: 18 }); if (mine) fx && fx.throwKnife(); break;
    case 'stick': sfx.play('stick', { ...pos, range: 20 }); break;
    case 'knifeback': if (mine) { sfx.play('drawKnife'); hud.toast('Couteau récupéré', 1.6); } break;
    case 'shot':
      sfx.play('shot', { ...pos, range: 70 }); fx && fx.shot(e, mine);
      if (mine) { fx && fx.recoil(); fx && fx.shake(0.6); }
      break;
    case 'hitmark': if (e.by === meId) { hud.hitmark(); sfx.play('hit'); } break;
    case 'kill': {
      sfx.play('kill', { ...pos, range: 26 });
      if (e.id === meId) { S.deadT = 2.6; hud.banner(e.how === 'gun' ? 'Abattu !<small>Tu peux suivre la fin de la manche</small>' : 'Tu as été tué !<small>Tu peux suivre la fin de la manche</small>', 3, 'horror'); fx && fx.shake(1); input.setDraw(false); }
      else {
        const d = me ? Math.hypot(e.x - me.x, e.z - me.z) : 99;
        if (e.sheriff && v.w.mode !== 'explore') hud.banner('Le shérif est tombé !<small>Son revolver est quelque part…</small>', 2.6, 'blue');
        else if (d < 22) hud.feed(`Un cri dans ${roomLabel(e)}…`, 'bad');
      }
      break;
    }
    case 'misfire':
      sfx.play('misfire', { ...pos, range: 30 });
      if (mine) { hud.banner('Bavure !<small>Tu as tué un innocent et lâché ton revolver</small>', 3, 'bad'); input.setDraw(false); }
      else hud.feed('Bavure : un innocent abattu, le revolver tombe', 'bad');
      break;
    case 'gundrop': sfx.play('gundrop'); if (!(S.view && S.view.priv && S.view.priv.role === 'm')) hud.banner('Le revolver est tombé !<small>Suis le faisceau doré</small>', 2.4, 'gold'); else hud.toast('Le revolver est à terre : ne laisse personne le prendre', 3); break;
    case 'gunpick':
      if (mine) { sfx.play('gunpick'); hud.banner('Tu as le revolver !<small>Trouve le meurtrier et abats-le</small>', 3, 'gold'); input.setDraw(true); }
      else { sfx.play('drawGun', { ...pos, range: 20 }); hud.feed('Quelqu\'un a ramassé le revolver', 'gold'); }
      break;
    case 'coin': if (mine) { sfx.play('coin'); if (e.n === 40) hud.toast('Ta bourse est pleine !', 2); } break;
    case 'pass': { const ps = M.passages[e.id]; if (ps) sfx.play('pass', { x: ps.x, y: ps.y + 1, z: ps.z, range: 22 }); if (e.by === meId && e.open) hud.toast(`Passage secret : ${ps ? ps.name : ''}`, 2); break; }
    case 'blackout': sfx.play('blackout'); hud.banner(S.view && S.view.priv && S.view.priv.role === 'm' ? 'Lumières coupées<small>À toi de jouer</small>' : 'Coupure de courant !', 2, 'bad'); break;
    case 'lights': sfx.play('lights'); break;
    case 'over': break;
  }
}
function roomLabel(e) { let best = -1; for (const lv of [-1, 0, 1]) { if (Math.abs(LV_Y[li(lv)] - e.y) < 2.2) best = roomAt(M, lv, e.x, e.z); } const r = best >= 0 ? M.rooms[best] : null; return r ? `le ${r.name.toLowerCase()}`.replace('le salle', 'la salle').replace('le cuisine', 'la cuisine').replace('le bibliothèque', 'la bibliothèque').replace('le chambre', 'la chambre').replace('le galerie', 'la galerie').replace('le cave', 'la cave').replace('le crypte', 'la crypte').replace('le jardin', 'le jardin') : 'le manoir'; }

// ------------------------------------------------------------------ fin, menu
function showEnd(reason) {
  if (S.endShown) return;
  S.endShown = true;
  input.unlock();
  const v = S.view, w = v && v.w;
  let ranking = [];
  if (S.sim) ranking = S.sim.ranking();
  else if (v && w) ranking = [...S.sheets.values()].filter((p) => !p.spec).map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, role: w.roles ? w.roles[p.id] : 'i', score: p.score || 0, coins: p.coins || 0, st: p.st, how: p.how, won: w.roles ? (w.win === 'm') === (w.roles[p.id] === 'm') : false })).sort((a, b) => (b.won - a.won) || b.score - a.score);
  screenEl.className = 'screen dim'; screenEl.hidden = false;
  const canReplay = S.role !== 'guest' && reason !== 'host';
  S.autoT = canReplay && w && w.mode !== 'explore' ? AUTO_NEXT : 0;
  const render = () => { screenEl.innerHTML = endHtml({ w: w || {}, ranking, myId: S.myId, canReplay, embedded: H.embedded, reason, auto: S.autoT > 0 ? Math.ceil(S.autoT) : 0, totals: S.totals }); const again = $('#btnAgain'); if (again) again.onclick = () => { S.autoT = 0; startRun(); }; const ex = $('#btnExit'); if (ex) ex.onclick = exitToLobby; };
  render(); S.renderEnd = render;
  hud.show(false);
  const me = ranking.find((p) => p.id === S.myId);
  if (me) sfx.play(me.won ? 'win' : 'lose');
}
function toggleMenu() {
  if (S.lobby || S.endShown) return;
  S.menu = !S.menu;
  if (!S.menu) { hideScreen(); return; }
  input.unlock();
  screenEl.className = 'screen dim'; screenEl.hidden = false;
  screenEl.innerHTML = menuHtml({ solo: S.role === 'solo' });
  $('#btnResume').onclick = () => toggleMenu();
  DDVolume.panel($('#btnSettings'), SETTINGS);
  $('#btnQuit').onclick = exitToLobby;
  $('#btnResume').focus({ preventScroll: true });
}

// ------------------------------------------------------------------ boucle
let lastT = performance.now();
function loop(now) {
  if (!S.alive) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  step(dt);
}
const proj = new THREE.Vector3();
function step(dt) {
  const blocked = S.lobby || S.endShown || (S.menu && S.role === 'solo');
  const raw = input.sample(dt);
  const quiet = blocked || S.menu;
  S.inp = quiet ? { ...raw, mx: 0, my: 0, run: false, jump: false } : raw;
  // spectateur : un clic passe au suivant
  if (S.view && !S.view.mine && raw.fc !== S.prevFc) S.specI++;
  S.prevFc = raw.fc;
  if (S.deadT > 0) S.deadT -= dt;

  let view = null;
  if (S.role !== 'guest' && S.sim) view = hostFrame(dt);
  else if (S.role === 'guest') {
    S.hiT -= dt;
    if (!S.gotHost && S.hiT <= 0) { S.hiT = 1.5; send('host', { t: 'hi' }); }
    if (S.w && !S.lobby) {
      S.sendT += dt;
      if (S.sendT >= 1 / 30) { S.sendT = 0; S.seq++; send('host', { t: 'i', ...S.inp, q: S.seq }, { volatile: true }); }
      const silent = (performance.now() - S.snapAt) / 1000;
      if (S.w.ph !== 'over' && silent > HOST_SILENCE && !S.endShown) { if (!S.warned) { S.warned = true; hud.toast('Liaison avec l\'hôte interrompue…', 4); } if (silent > HOST_GIVEUP) showEnd('host'); }
      else S.warned = false;
    }
    view = guestFrame(dt);
  }
  if (!view) { idleFrame(dt); return; }
  S.view = view;
  const real = view.real, w = view.w, priv = view.priv;
  // carte du rôle au début de la manche
  if (priv && !S.roleShown && real && !real.spec) {
    S.roleShown = true; hud.roleCard(priv.role, real.name); sfx.play(priv.role === 'm' ? 'role-m' : priv.role === 's' ? 'role-s' : 'role-i');
    input.yaw = real.yaw; input.pitch = 0;
  }
  if (w.ph === 'over' && !S.endShown) { S.overT += dt; if (S.overT >= 2.6) showEnd(); }
  if (S.endShown && S.autoT > 0) { const before = Math.ceil(S.autoT); S.autoT -= dt; if (S.autoT <= 0) { S.autoT = 0; startRun(); } else if (Math.ceil(S.autoT) !== before && S.renderEnd) { const el = $('#autoT'); if (el) el.textContent = `(${Math.ceil(S.autoT)})`; } }
  if (scene) scene.frame(view, dt);
  // sons continus
  if (view.me) sfx.listener(scene ? scene.camera.position.x : view.me.x, scene ? scene.camera.position.y : view.me.y + EYE, scene ? scene.camera.position.z : view.me.z, view.yaw);
  footsteps(view, dt);
  const tense = w.ph === 'play' && ((w.t >= 0 && w.t < 30) || w.guns.length > 0 || w.bo > 0);
  sfx.update(dt, { play: w.ph !== 'over', tense, music: w.bo > 0 ? 0.2 : 0.45 });
  // le cœur bat quand un couteau sorti est tout près
  if (real && !real.dead && priv && priv.role !== 'm') {
    const knife = view.players.find((p) => p.id !== real.id && !p.dead && p.held === 'knife' && Math.hypot(p.x - real.x, p.z - real.z) < 9 && p.lv === real.lv);
    if (knife) { S.heartT -= dt; if (S.heartT <= 0) { const d = Math.hypot(knife.x - real.x, knife.z - real.z); S.heartT = 0.45 + d * 0.06; sfx.play('heart', { vol: 1 - d / 10 }); } }
  }
  // tic-tac des dix dernières secondes
  if (w.ph === 'play' && w.t > 0 && w.t <= 10 && Math.ceil(w.t) !== S.lastTick) { S.lastTick = Math.ceil(w.t); sfx.play('tick'); }
  // plus que deux survivants, puis un seul : la tension monte d'un cran (le nombre de vivants est public)
  if (w.ph === 'play' && w.mode !== 'explore' && w.intro <= 0) {
    if (S.survRound !== w.round) { S.survRound = w.round; S.survSaid = 99; }
    const left = view.players.filter((p) => !p.dead && !p.spec).length - 1; // sans le meurtrier
    if (left <= 2 && left >= 1 && left < S.survSaid && view.players.length >= 4) {
      S.survSaid = left;
      const amM = priv && priv.role === 'm';
      hud.banner(left === 1 ? (amM ? 'Plus qu\'un seul survivant<small>Trouve-le avant l\'aube</small>' : 'Dernier survivant !<small>Tiens jusqu\'à l\'aube</small>') : 'Plus que deux survivants…<small>Le meurtrier se rapproche</small>', 2.4, 'horror');
      sfx.play('heart', { vol: 1 });
    }
  }
  hud.update(view, dt, hudInfo(view));
}
function hudInfo(v) {
  const priv = v.priv, real = v.real, w = v.w;
  const o = { role: priv && real && !real.spec ? priv.role : null, coins: priv ? priv.coins : 0, cd: priv ? priv.cd : { stab: 0, gun: 0, bo: 0 }, hasKnife: priv ? priv.hasKnife : false, weapon: priv ? (priv.hasGun || priv.hasKnife) : false, stam: priv ? priv.stam : 100, stun: priv ? priv.stun : false, ws: input.ws, board: S.board, stick: input.stick(), lockHint: !QS.has('debug') && !input.locked && !input.free && !S.lobby && !S.endShown && !S.menu, kb: input.kb };
  if (real && real.held === 'knife' && v.mine) o.charge = input.charge();
  // invite : passage secret, couteau planté
  if (real && !real.dead && v.mine && w.ph !== 'over') {
    for (const ps of M.passages) if (ps.lv === real.lv && Math.hypot(ps.x - real.x, ps.z - real.z) < 2.1) { o.prompt = `${w.pass[ps.id] ? 'Refermer' : 'Ouvrir'} ${esc(ps.name)}`; break; }
    if (!o.prompt && priv && priv.role === 'm' && !priv.hasKnife) for (const k of w.knives) if (k.owner === S.myId && Math.hypot(k.x - real.x, k.z - real.z) < 2.4) { o.prompt = 'Reprendre ton couteau'; break; }
  }
  // repère du revolver tombé
  if (w.guns.length && scene && v.me) {
    const g = w.guns[0], cam = scene.camera;
    proj.set(g.x, g.y + 0.6, g.z).project(cam);
    const W = innerWidth, Hh = innerHeight;
    let x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * Hh;
    const behind = proj.z > 1;
    if (behind) { x = W - x; y = Hh - y; }
    const m = 46, edge = behind || x < m || x > W - m || y < m || y > Hh - m;
    if (behind) y = Hh - m;
    x = clamp(x, m, W - m); y = clamp(y, m + 50, Hh - m);
    o.gunScreen = { x, y, edge, d: Math.hypot(g.x - v.me.x, g.z - v.me.z) };
  }
  return o;
}
function footsteps(v, dt) {
  for (const p of v.players) {
    if (p.spec || p.dead) continue;
    let s = S.steps.get(p.id);
    if (!s) S.steps.set(p.id, s = { x: p.x, z: p.z, a: 0, air: false });
    s.a += Math.hypot(p.x - s.x, p.z - s.z); s.x = p.x; s.z = p.z;
    const self = v.real && p.id === v.real.id && v.mine;
    if (s.air && !p.air) sfx.play('land', { x: p.x, y: p.y, z: p.z, range: 14, vol: self ? 0.6 : 1 });
    s.air = p.air;
    if (s.a >= (p.run ? 2.1 : 1.6) && !p.air) {
      s.a = 0;
      const r = roomAt(M, p.lv, p.x, p.z), st = r >= 0 ? STYLES[M.rooms[r].style] : null;
      const surf = st ? (st.floor.startsWith('tapis') ? 'tapis' : st.floor === 'pierre' || st.floor === 'damier' || st.floor === 'carreaux' || st.floor === 'tomettes' ? 'pierre' : 'bois') : 'bois';
      sfx.play('step', { x: p.x, y: p.y, z: p.z, range: 16, vol: self ? 0.45 : p.run ? 1 : 0.7, surf });
    }
  }
}
// avant le lancement : une vue fixe sur le hall et ses escaliers
const lobbyWorld = { ph: 'lobby', t: 0, dur: 180, mode: 'classic', bo: 0, pass: M.passages.map(() => 0), coins: [], knives: [], guns: [], sheriffDead: false };
let lobbyA = 0;
function idleFrame(dt) {
  lobbyA += dt * 0.05;
  const v = { w: lobbyWorld, players: [], me: { id: -1, x: 20.5 + Math.sin(lobbyA) * 2, y: 0.3, z: 22.5, lv: 0 }, real: null, mine: true, camMode: 'fps', yaw: Math.sin(lobbyA * 0.7) * 0.35, pitch: 0.22, priv: null, flying: [] };
  if (scene) scene.frame(v, dt);
  sfx.update(dt, { play: true, tense: false, music: 0.4 });
}
