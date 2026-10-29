/* =============================================================================
   Mini-Golf Party — boucle de jeu, contrôles, caméra, tours, scores, réseau, bots
   -----------------------------------------------------------------------------
   Réseau (via HubBridge) : l'hôte tient l'état de la partie (tours, coups, scores) et le diffuse.
   Le joueur qui tire simule lui-même son coup (aucune latence) et diffuse la position des balles
   30 fois par seconde ; l'hôte relaie aux spectateurs, qui interpolent. L'hôte simule les bots.
   Messages : invité → hôte  hello, shoot, bs (flux), rest (fin du coup), aim, ping
              hôte → tous    st (état), bs, aim, pong
   ============================================================================= */
import * as THREE from 'three';
import { COURSES, courseById, buildCourseHole } from './courses.js';
import { makeBall, strike, tick, TICK, BALL_R, gravSign } from './physics.js';
import { Renderer } from './render.js';
import { planShot, BOT_LEVELS } from './ai.js';
import { initAudio, sfx, ambience } from './sfx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowMs = () => performance.now();
const DEBUG = new URLSearchParams(location.search).has('debug');

/* ---------------------------------------------------------------- réseau */
const H = window.HubBridge || { embedded: false, info: { role: 'solo', myId: 0, hostId: 0, settings: {} }, players: [], readyMap: {}, on() {}, send() {}, signalReady() {}, exit() {}, report() {} };
// L'horloge de la partie est celle du premier hôte : offset vaut 0 chez lui, et un invité qui reprend la partie
// garde son décalage, pour que les échéances (intro, fin de trou, minuteur) et les obstacles restent à l'heure.
const NET = {
  role: 'solo', myId: 0, hostId: 0, offset: 0, rtt: 999, resync: false,
  get isHost() { return this.role !== 'guest'; },
  hostNow() { return nowMs() + this.offset; },
  toHost(m) { if (this.role === 'guest') H.send('host', m); else onMsg(this.myId, m, true); },
  // vol : flux continu (positions, visée), sauté si la connexion sature au lieu de s'empiler
  all(m, vol) { if (this.role === 'host') H.send('all', m, vol ? { volatile: true } : undefined); },
};
const kT = () => NET.hostNow() / 1000;   // temps des obstacles (secondes, horloge de l'hôte)
const PALETTE = ['#ff4b2b', '#2b8cff', '#ffc531', '#2fbf71', '#b45cff', '#ff5fa2', '#1fc7c1', '#ff8a1f'];
const BOT_NAMES = ['Birdie', 'Bogey', 'Caddie', 'Mulligan', 'Albatros'];

function myName() { const p = (H.players || []).find((q) => q.id === NET.myId); if (p) return p.name; try { return JSON.parse(localStorage.getItem('dd_name')) || 'Moi'; } catch (e) { return 'Moi'; } }
function myColor() { const p = (H.players || []).find((q) => q.id === NET.myId); if (p) return p.color; try { return JSON.parse(localStorage.getItem('dd_color')) || PALETTE[0]; } catch (e) { return PALETTE[0]; } }
function humans() { return NET.role === 'solo' || !H.embedded ? [{ id: NET.myId, name: myName(), color: myColor() }] : (H.players || []).map((p) => ({ id: p.id, name: p.name, color: p.color })); }
const K = (id) => String(id);
const ME = () => K(NET.myId);

/* ---------------------------------------------------------------- état de la partie */
const PREFS = (() => { try { return JSON.parse(localStorage.getItem('minigolf_prefs')) || {}; } catch (e) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('minigolf_prefs', JSON.stringify(PREFS)); } catch (e) {} };
let G = {
  phase: 'lobby', n: 0, course: PREFS.course || 'park',
  opts: { holes: PREFS.holes || 'all', bots: PREFS.bots ?? (H.embedded ? 0 : 1), level: PREFS.level || 'normal', collide: PREFS.collide ?? true, timer: PREFS.timer ?? 45 },
  players: [], holeList: [0, 1, 2, 3, 4, 5], hi: 0, scores: {}, strokes: {}, done: {}, balls: {}, order: [], turn: null, turnEnds: 0, phaseEnds: 0, shot: null, last: null,
};
const capOf = (par) => Math.max(7, par + 4);
/** Parcours de 18 trous (le Marathon) : il fait à lui seul une partie complète */
const isLong = (c) => c.holes.length >= 18;
/** Survol du trou au départ : plus long sur les très longs trous */
const introMs = (h) => (h && h.routeLen > 70 ? Math.min(7200, 3600 + (h.routeLen - 70) * 22) : 3600);

/* ---------------------------------------------------------------- parcours chargé */
let COURSE = null, HOLES = [], R = null;
/** Entrée k de la liste des trous : [id du parcours, numéro du trou] */
function entry(k, s = G) { const e = s.holeList[k]; return Array.isArray(e) ? e : [s.course, e ?? 0]; }
const parOf = (k, s = G) => { const [c, i] = entry(k, s); return courseById(c).holes[i]?.par ?? 3; };
function holeNow() { const [c, i] = entry(G.hi); if (!COURSE || COURSE.id !== c) return null; return HOLES[i] || null; }
function ensureCourse(id) { if (!COURSE || COURSE.id !== id || !HOLES.length) loadCourse(id); }
function loadCourse(id) {
  if (COURSE && COURSE.id === id && HOLES.length) return;
  COURSE = courseById(id);
  showLoading(true, COURSE.name);
  HOLES = COURSE.holes.map((_, i) => buildCourseHole(COURSE, i));
  R.loadCourse(COURSE, HOLES);
  ambience(COURSE.theme);
  showLoading(false);
  ballsVisual.clear();
}

/* ================================================================ HÔTE */
let shotSeq = 1;
function commit() {
  G.n++;
  NET.all({ t: 'st', s: G, now: nowMs() });
  onState(G);
}
function lobbyPlayers() {
  const hs = humans().map((h) => ({ id: K(h.id), name: h.name, color: h.color, bot: false }));
  const used = new Set(hs.map((h) => h.color));
  const nb = clamp(G.opts.bots | 0, 0, Math.max(0, 6 - hs.length));
  const bots = [];
  for (let i = 0; i < nb; i++) { const color = PALETTE.find((c) => !used.has(c)) || PALETTE[i]; used.add(color); bots.push({ id: 'b' + (i + 1), name: BOT_NAMES[i], color, bot: true, level: G.opts.level }); }
  return hs.concat(bots);
}
function hostSetLobby(patch) {
  if (patch.course) G.course = patch.course;
  if (patch.opts) Object.assign(G.opts, patch.opts);
  Object.assign(PREFS, { course: G.course, ...G.opts }); savePrefs();
  G.players = lobbyPlayers();
  commit();
}
function hostStart() {
  G.players = lobbyPlayers();
  const c = courseById(G.course);
  if (G.opts.holes === 'eighteen' && !isLong(c)) {
    // Grand Tour : ce parcours et les deux suivants (parmi ceux de 6 trous)
    const tour = COURSES.filter((q) => !isLong(q)), k = tour.findIndex((q) => q.id === c.id);
    G.holeList = [];
    for (let j = 0; j < 3; j++) { const cc = tour[(k + j) % tour.length]; cc.holes.forEach((_, i) => G.holeList.push([cc.id, i])); }
  } else {
    // aller (première moitié) ou retour (seconde moitié), sinon tout le parcours
    const n = c.holes.length, half = Math.floor(n / 2), all = c.holes.map((_, i) => i);
    const idx = G.opts.holes === 'first' ? all.slice(0, half) : G.opts.holes === 'last' ? all.slice(half) : all;
    G.holeList = idx.map((i) => [c.id, i]);
  }
  G.scores = {}; for (const p of G.players) G.scores[p.id] = G.holeList.map(() => null);
  G.hi = 0; G.last = null;
  hostStartHole(0);
}
function hostStartHole(i) {
  G.hi = i; ensureCourse(entry(i)[0]);
  const h = holeNow();
  G.phase = 'intro'; G.phaseEnds = NET.hostNow() + introMs(h) + 200; G.shot = null; G.turn = null;
  G.strokes = {}; G.done = {}; G.balls = {};
  const here = new Set(humans().map((q) => K(q.id)));
  for (const p of G.players) { G.strokes[p.id] = 0; G.done[p.id] = p.bot || here.has(p.id) ? false : 'left'; G.balls[p.id] = { p: h.tee.slice(), inPlay: false }; }
  // honneur : le meilleur score du trou précédent joue en premier
  const order = G.players.map((p) => p.id);
  if (i > 0) order.sort((a, b) => (G.scores[a][i - 1] ?? 99) - (G.scores[b][i - 1] ?? 99));
  G.order = order;
  commit();
}
const AWAY_TURN_MS = 12000;   // joueur en coupure : son tour passe vite, même en temps libre
const isAway = (pid) => (H.players || []).some((q) => K(q.id) === K(pid) && q.away);
function hostBeginTurn(pid) {
  G.turn = pid; G.shot = null; G.turnEnds = G.opts.timer ? NET.hostNow() + G.opts.timer * 1000 : 0;
  const p = G.players.find((q) => q.id === pid);
  if (p && !p.bot && isAway(pid)) G.turnEnds = Math.min(G.turnEnds || Infinity, NET.hostNow() + AWAY_TURN_MS);
  if (p && p.bot) botStart(p);
  commit();
}
function hostNextTurn() {
  const active = G.order.filter((id) => !G.done[id] && G.players.some((p) => p.id === id));
  if (!active.length) return hostEndHole();
  const cur = G.order.indexOf(G.turn);
  for (let k = 1; k <= G.order.length; k++) { const id = G.order[(cur + k) % G.order.length]; if (active.includes(id)) return hostBeginTurn(id); }
  hostBeginTurn(active[0]);
}
function hostEndHole() {
  // parti sans finir le trou : le maximum, pour qu'un départ ne vaille pas un 0
  const h = holeNow();
  for (const p of G.players) G.scores[p.id][G.hi] = G.done[p.id] === 'left' && h ? Math.max(G.strokes[p.id], capOf(h.par) + 1) : G.strokes[p.id];
  G.phase = 'holeEnd'; G.phaseEnds = NET.hostNow() + 5200; G.turn = null; G.shot = null;
  commit();
}
function hostAfterHole() {
  if (G.hi + 1 < G.holeList.length) hostStartHole(G.hi + 1);
  else { G.phase = 'over'; commit(); reportResult(); }
}
/** Un joueur (ou un bot) tire */
function hostShoot(from, m) {
  if (G.phase !== 'play' || G.shot || K(from) !== G.turn && !(String(G.turn).startsWith('b') && from === NET.myId && m.bot)) return false;
  const pid = G.turn;
  G.strokes[pid]++;
  G.balls[pid].inPlay = true;
  G.shot = { id: shotSeq++, pid, owner: from, T0: m.T0, yaw: m.yaw, power: m.power, from: G.balls[pid].p.slice() };
  G.turnEnds = 0;
  commit();
  return G.shot;
}
/** Fin du coup : positions finales envoyées par celui qui a simulé */
function hostRest(from, m) {
  if (!G.shot || m.i !== G.shot.id || from !== G.shot.owner) return;
  const pid = G.shot.pid, h = holeNow();
  const last = { n: G.n + 1, pid, strokes: G.strokes[pid], kind: 'stroke' };
  for (const [id, r] of Object.entries(m.balls || {})) {
    const b = G.balls[id]; if (!b) continue;
    if (r.holed) { b.inPlay = false; b.p = h.cup.slice(); G.done[id] = 'holed'; if (id === pid) last.kind = 'holed'; else last.knock = id; }
    else if (r.oob) { if (id === pid) { G.strokes[pid]++; last.kind = 'oob'; last.oob = r.oob; last.strokes = G.strokes[pid]; } b.p = Array.isArray(r.start) ? r.start : b.p; }
    else if (Array.isArray(r.p) && r.p.length === 3 && r.p.every(Number.isFinite)) b.p = r.p;
  }
  if (!G.done[pid] && G.strokes[pid] >= capOf(h.par)) { G.done[pid] = 'max'; G.strokes[pid] = capOf(h.par) + 1; G.balls[pid].inPlay = false; last.kind = 'max'; last.strokes = G.strokes[pid]; }
  G.last = last; G.shot = null;
  hostNextTurn();
}
function hostTick() {
  const now = NET.hostNow();
  if (G.phase === 'intro' && now > G.phaseEnds) { G.phase = 'play'; const first = G.order.find((id) => !G.done[id]); if (first) hostBeginTurn(first); else hostEndHole(); }
  else if (G.phase === 'holeEnd' && now > G.phaseEnds) hostAfterHole();
  else if (G.phase === 'play' && !G.shot && G.turnEnds && now > G.turnEnds) {
    const pid = G.turn; G.strokes[pid]++;
    G.last = { n: G.n + 1, pid, kind: 'timeout', strokes: G.strokes[pid] };
    const h = holeNow();
    if (G.strokes[pid] >= capOf(h.par)) { G.done[pid] = 'max'; G.strokes[pid] = capOf(h.par) + 1; G.balls[pid].inPlay = false; }
    hostNextTurn();
  }
  botTick();
}
function reportResult() {
  if (!H.embedded || NET.role !== 'host') return;
  const tot = (id) => G.scores[id].reduce((a, b) => a + (b || 0), 0);
  const sorted = G.players.slice().sort((a, b) => tot(a.id) - tot(b.id));
  try {
    H.report({ id: 'minigolf-' + Math.round(G.phaseEnds) + '-' + G.players.map((p) => p.id).join(''), mode: new Set(G.holeList.map((e) => entry(0, { holeList: [e], course: G.course })[0])).size > 1 ? 'Grand Tour 18 trous' : courseById(G.course).name,
      players: sorted.map((p) => ({ id: p.bot ? null : Number(p.id), name: p.name, color: p.color, bot: p.bot, rank: 1 + sorted.filter((q) => tot(q.id) < tot(p.id)).length, score: tot(p.id) })) });
  } catch (e) { console.warn(e); }
}

/* ---------------------------------------------------------------- bots (hôte) */
let BOT = null;
function botStart(p) {
  const L = BOT_LEVELS[p.level] || BOT_LEVELS.normal, think = L.think[0] + Math.random() * (L.think[1] - L.think[0]);
  const T0 = kT() + think + 0.6;
  const { balls, idx } = simBalls(p.id);
  BOT = { pid: p.id, T0, gen: planShot(holeNow(), balls, idx, T0, p.level, Math.random, G.opts.collide), plan: null, aimT: 0, yaw0: camYawToRoute(G.balls[p.id].p) };
}
function botTick() {
  if (!BOT) return;
  if (G.phase !== 'play' || G.turn !== BOT.pid || G.shot) { BOT = null; return; }
  // très long trou : chaque essai simule un long roulé, le bot réfléchit un peu plus par image pour ne pas faire attendre
  const t0 = nowMs(), hb = holeNow(), budget = hb && hb.routeLen > 70 ? 13 : 9;
  while (!BOT.plan && nowMs() - t0 < budget) { const r = BOT.gen.next(); if (r.done) BOT.plan = r.value; }
  const left = BOT.T0 - kT();
  // visée visible par tous pendant la dernière seconde
  if (BOT.plan && left < 1.1) {
    const k = clamp(1 - left / 1.1, 0, 1);
    const yaw = BOT.yaw0 + angDiff(BOT.plan.yaw, BOT.yaw0) * Math.min(1, k * 1.6);
    sendAim({ pid: BOT.pid, yaw, power: BOT.plan.power * clamp((k - 0.35) / 0.65, 0, 1), on: true });
  }
  if (BOT.plan && left <= 0) {
    const plan = { ...BOT.plan, T0: BOT.T0 }; BOT = null;
    const shot = hostShoot(NET.myId, { T0: Math.max(BOT_T0_FLOOR(), plan.T0 ?? 0) || kT(), yaw: plan.yaw, power: plan.power, bot: true });
    if (shot) startSim(shot);
  }
}
const BOT_T0_FLOOR = () => kT() - 0.05;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/* ================================================================ SIMULATION LOCALE (celui qui tire) */
let SIM = null;
/** Balles en jeu pour une simulation : toutes celles posées sur le parcours + celle du tireur */
function simBalls(pid) {
  const balls = [], ids = [];
  for (const p of G.players) {
    const b = G.balls[p.id]; if (!b) continue;
    if (p.id !== pid && (!b.inPlay || G.done[p.id])) continue;
    if (p.id !== pid && !G.opts.collide) continue;
    const mb = makeBall(p.id, b.p); balls.push(mb); ids.push(p.id);
  }
  return { balls, ids, idx: ids.indexOf(pid) };
}
function startSim(shot) {
  const h = holeNow(); if (!h) return;
  const { balls, idx } = simBalls(shot.pid);
  const me = balls[idx]; if (!me) return;
  me.p = shot.from.slice();
  strike(h.world, me, shot.yaw, shot.power);
  SIM = { id: shot.id, pid: shot.pid, balls, T0: shot.T0, t: 0, acc: 0, ev: [], send: 0, done: false, moved: new Set([shot.pid]), start: Object.fromEntries(balls.map((b) => [b.id, b.p.slice()])) };
  FX.shot(me.p, shot.power);
}
function simTick(dt) {
  if (!SIM || SIM.done) return;
  const h = holeNow(); if (!h) { SIM = null; return; }
  SIM.acc += dt; let n = 0, moving = true;
  while (SIM.acc >= TICK && n < 72) {
    const ev = [];
    moving = tick(h.world, SIM.balls, SIM.T0 + SIM.t, ev, { collide: G.opts.collide });
    SIM.t += TICK; SIM.acc -= TICK; n++;
    for (const e of ev) { handleEvent(e); SIM.ev.push([e.k, e.b, +e.p[0].toFixed(2), +e.p[1].toFixed(2), +e.p[2].toFixed(2), +(e.s || 0).toFixed(1), e.m ?? -1]); }
    if (!moving) break;
  }
  if (SIM.acc > TICK * 72) SIM.acc = 0;
  SIM.send += dt;
  if (SIM.send > 1 / 30 || !moving) {
    SIM.send = 0;
    for (const b of SIM.balls) if (b.awake || b.oob || b.holed) SIM.moved.add(b.id);
    const m = { t: 'bs', i: SIM.id, T: +SIM.t.toFixed(3), b: SIM.balls.filter((b) => SIM.moved.has(b.id)).map((b) => [b.id, +b.p[0].toFixed(3), +b.p[1].toFixed(3), +b.p[2].toFixed(3), b.holed ? 1 : b.oob ? 2 : 0]), e: SIM.ev };
    SIM.ev = [];
    if (NET.role === 'host') NET.all(m, true); else if (NET.role === 'guest') H.send('host', m, { volatile: true });
  }
  if (!moving) {
    SIM.done = true;
    const res = {};
    for (const b of SIM.balls) {
      const moved = Math.hypot(b.p[0] - SIM.start[b.id][0], b.p[1] - SIM.start[b.id][1], b.p[2] - SIM.start[b.id][2]) > 1e-4;
      if (b.id === SIM.pid || moved || b.holed || b.oob) res[b.id] = { p: b.p.map((v) => +v.toFixed(4)), holed: b.holed, oob: b.oob, start: SIM.start[b.id] };
    }
    const sim = SIM, t0 = nowMs();
    const send = () => { if (sim.id === 'pending' && nowMs() - t0 < 6000) return setTimeout(send, 100); NET.toHost({ t: 'rest', i: sim.id, balls: res }); };
    setTimeout(send, 350);
  }
}

/* ================================================================ RÉCEPTION */
const STREAM = { id: 0, buf: [], lastArr: 0 };   // positions reçues pendant un coup d'un autre joueur
function onMsg(from, m, local) {
  if (!m || typeof m !== 'object') return;
  if (NET.role !== 'guest') {
    // Le salon renvoie à l'hôte ce qu'il diffuse à tous : ses propres messages reviennent ici. Les relayer de
    // nouveau relançait la boucle sans fin (visée de l'hôte, coups de l'hôte et des bots) : des milliers de
    // messages par seconde, jusqu'à saturer sa connexion et le faire décrocher. Ce qui vient de lui passe par `local`.
    if (!local && K(from) === K(NET.myId)) return;
    switch (m.t) {
      case 'ping': H.send(from, { t: 'pong', c: m.c, h: NET.hostNow() }); return;
      case 'hello': H.send(from, { t: 'st', s: G, now: NET.hostNow() }); return;
      case 'shoot': { if (local) return; hostShoot(from, m); return; }
      case 'bs': if (G.shot && from === G.shot.owner && m.i === G.shot.id && !local) { H.send('all', m, { volatile: true }); onStream(m); } return;
      case 'rest': hostRest(from, m); return;
      case 'aim': if (G.turn === K(from) && !local) { const a = { ...m, pid: K(from) }; H.send('all', a, a.on ? { volatile: true } : undefined); onAim(a); } return;
    }
    return;
  }
  if (from !== NET.hostId) return;
  switch (m.t) {
    case 'pong': { const now = nowMs(), rtt = now - m.c; if (NET.resyncClock || rtt < NET.rtt * 1.5 || rtt < 120) { NET.resyncClock = false; NET.rtt = Math.min(rtt, NET.rtt * 0.8 + rtt * 0.2); NET.offset = m.h + rtt / 2 - now; } break; }
    // après un changement d'hôte, le premier état du nouvel hôte est pris quel que soit son numéro
    case 'st': if (m.s && (m.s.n >= G.n || NET.resync)) { NET.resync = false; G = m.s; onState(G); } break;
    case 'bs': if ((!SIM || SIM.id !== m.i) && G.shot && m.i === G.shot.id) onStream(m); break;
    case 'aim': onAim(m); break;
  }
}
function onStream(m) {
  if (m.i !== STREAM.id) { STREAM.id = m.i; STREAM.buf = []; STREAM.clock = null; }
  if (STREAM.buf.length && m.T <= STREAM.buf[STREAM.buf.length - 1].T) return;   // paquet en double ou en retard
  STREAM.buf.push({ T: m.T, at: nowMs(), b: m.b });
  if (STREAM.buf.length > 240) STREAM.buf.shift();
  STREAM.lastArr = nowMs();
  for (const e of m.e || []) handleEvent({ k: e[0], b: e[1], p: [e[2], e[3], e[4]], s: e[5], m: e[6] }, true);
}
const AIM = { pid: null, yaw: 0, power: 0, on: false, at: 0 };
function onAim(m) { if (m.pid === ME() && !String(m.pid).startsWith('b')) return; Object.assign(AIM, { pid: m.pid, yaw: m.yaw, power: m.power, on: m.on, at: nowMs() }); }
function sendAim(a) {
  // la visée en cours est un flux (volatil) ; la fin de visée (on: false) doit arriver, elle part normalement
  if (NET.role === 'host' || NET.role === 'solo') { NET.all({ t: 'aim', ...a }, a.on); onAim(a); }
  else H.send('host', { t: 'aim', yaw: a.yaw, power: a.power, on: a.on }, a.on ? { volatile: true } : undefined);
}

/* ================================================================ RÉACTIONS À L'ÉTAT */
let prev = { phase: null, hi: -1, turn: null, lastN: -1, shotId: 0, course: null };
function onState(s) {
  if (s.phase !== 'lobby' && s.phase !== 'over') ensureCourse(entry(s.hi, s)[0]);
  if (s.phase === 'lobby') {
    UI.show('lobby'); UI.lobby();
    if (COURSE && COURSE.id !== s.course) { clearTimeout(onState._lt); onState._lt = setTimeout(() => { if (G.phase === 'lobby') loadCourse(G.course); }, 60); }
  }
  else if (s.phase === 'over') { UI.show('results'); UI.results(); }
  else UI.show('game');
  if (s.phase !== 'lobby' && s.phase !== 'over') {
    if (prev.hi !== s.hi || prev.course !== s.course || (prev.phase !== 'intro' && s.phase === 'intro')) {
      R.setHole(entry(s.hi, s)[1]); CAM.introStart = nowMs(); CAM.mode = 'intro';
      for (const id of [...ballsVisual.keys()]) { ballsVisual.get(id).sink = 0; }
      UI.holeBanner();
    }
    if (s.phase === 'play' && prev.phase === 'intro') CAM.mode = 'follow';
    if (s.phase === 'holeEnd' && prev.phase !== 'holeEnd') { CAM.mode = 'orbit'; setTimeout(() => { if (G.phase === 'holeEnd') UI.holeSummary(); }, 1500); }
    if (s.last && s.last.n !== prev.lastN && prev.lastN !== -1) announceLast(s.last);
    if (s.turn !== prev.turn && s.turn) onTurn(s.turn);
    if (s.shot && s.shot.id !== prev.shotId) {
      prev.shotId = s.shot.id; AIM.on = false;
      if (s.shot.owner === NET.myId && (!SIM || SIM.id !== s.shot.id) && !(NET.isHost && String(s.shot.pid).startsWith('b'))) { /* déjà lancé localement */ }
      if (s.shot.owner !== NET.myId) sfx.putt(s.shot.power);
    }
    if (!s.shot && SIM && SIM.done) SIM = null;
  }
  prev = { phase: s.phase, hi: s.hi, turn: s.turn, lastN: s.last ? s.last.n : prev.lastN === -1 ? (s.last ? s.last.n : 0) : prev.lastN, shotId: s.shot ? s.shot.id : prev.shotId, course: s.course };
  UI.score();
}
const PERF = { t: 0, n: 0, done: false };
function perfWatch(dt) {
  if (PERF.done || UI.screen !== 'game' || R.quality === 'low') return;
  PERF.t += dt; PERF.n++;
  if (PERF.t > 5) {
    PERF.done = true;
    if (PERF.n / PERF.t < 28 && PREFS.quality !== 'high') { R.setQuality('low'); UI.toast('Graphismes allégés pour garder le jeu fluide (Échap, puis Réglages, pour changer)'); }
  }
}
function onTurn(pid) {
  const p = G.players.find((q) => q.id === pid); if (!p) return;
  const b = G.balls[pid];
  CAM.trans = nowMs();
  if (b) CAM.yaw = camYawToRoute(b.p);
  if (pid === ME()) { sfx.turn(); UI.flash('À toi de jouer !', p.color); requestLockSoon(); }
  else UI.flash(`${p.name} joue`, p.color, true);
}
function announceLast(L) {
  const p = G.players.find((q) => q.id === L.pid); if (!p) return;
  const h = holeNow(); if (!h) return;
  if (L.kind === 'holed') {
    const d = L.strokes - h.par;
    const label = L.strokes === 1 ? 'Trou en un !' : d <= -3 ? 'Albatros !' : d === -2 ? 'Eagle !' : d === -1 ? 'Birdie !' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `+${d}`;
    UI.big(label, `${p.name} · ${L.strokes} coup${L.strokes > 1 ? 's' : ''}`, p.color);
    if (L.strokes === 1) { sfx.ace(); R.fx('ace', h.cup); } else sfx.cheer(d < 0);
  } else if (L.kind === 'oob') {
    UI.big(L.oob === 'water' ? 'Plouf !' : L.oob === 'lava' ? 'Dans la lave !' : L.oob === 'void' ? 'Perdu dans le vide !' : 'Hors-jeu !', `${p.name} · +1 coup de pénalité`, '#ff5a4a');
  } else if (L.kind === 'timeout') UI.big('Temps écoulé', `${p.name} · +1 coup`, '#ff9a3c');
  else if (L.kind === 'max') UI.big('Coups épuisés', `${p.name} · ${L.strokes} sur ce trou`, '#ff9a3c');
}

/* ================================================================ ÉVÉNEMENTS PHYSIQUES → sons et effets */
const FX = {
  shot(p, pw) { sfx.putt(pw); R.fx('shot', p); },
};
const EVT = {};
function evOk(k, gap) { const t = nowMs(); if (t - (EVT[k] || -1e9) < gap) return false; EVT[k] = t; return true; }
function handleEvent(e) {
  const p = e.p;
  switch (e.k) {
    case 'hit':
      if (!evOk('hit', 90)) break;
      sfx.hit(e.s, MAT_NAMES_CACHE[e.m]);
      if (e.s > 2.5 && evOk('hitfx', 160)) R.fx('hit', p, { s: e.s });
      if (e.s > 6) shake(Math.min(0.08, e.s * 0.006));
      break;
    case 'bumper': if (evOk('bumper', 120)) { sfx.bumper(); R.fx('bumper', p); } break;
    case 'bounce': if (evOk('bounce', 110)) sfx.bounce(e.s); break;
    case 'sand': if (evOk('sand', 150)) { sfx.sand(); R.fx('sand', p); } break;
    case 'ball': if (evOk('ball', 100)) { sfx.ball(e.s); R.fx('hit', p, { s: e.s }); } break;
    case 'cup': sfx.cup(); R.fx('cup', [p[0], p[1] + 0.2, p[2]]); { const v = ballsVisual.get(K(e.b)); if (v) v.sinkStart = nowMs(); } break;
    case 'water': sfx.water(); R.fx('water', p); break;
    case 'lava': sfx.lava(); R.fx('lava', p); break;
    case 'out': sfx.out(); R.fx('out', p); break;
    case 'void': sfx.out(); R.fx('void', p); break;
    case 'mud': if (evOk('sand', 150)) { sfx.sand(); R.fx('mud', p); } break;
    case 'slow': if (evOk('slow', 400)) { sfx.slow(); R.fx('slow', p); } break;
    case 'flip': if (evOk('flip', 300)) { sfx.flip(e.s); R.fx('flip', p, { s: e.s }); } break;
    case 'boost': if (evOk('boost', 300)) { sfx.boost(); R.fx('boost', p); } break;
    case 'tramp': if (evOk('tramp', 150)) { sfx.tramp(); R.fx('tramp', p); } break;
    case 'tele': sfx.tele(); R.fx('tele', p); break;
  }
}
import { MAT_NAMES } from './physics.js';
const MAT_NAMES_CACHE = MAT_NAMES;

/* ================================================================ BALLES À L'ÉCRAN */
const ballsVisual = new Map();   // id → { p, vis, sink }
/** Position affichée de chaque balle : simulation locale, flux reçu ou position de repos */
function updateBalls(dt) {
  const h = holeNow(); if (!h) return;
  const live = new Map();
  const simLive = SIM && (!SIM.done || pendingShot || (G.shot && (G.shot.id === SIM.id || SIM.id === 'pending')));
  if (simLive) for (const b of SIM.balls) live.set(K(b.id), { p: b.p, holed: b.holed, oob: b.oob });
  else if (G.shot && STREAM.id === G.shot.id && STREAM.buf.length) {
    // interpolation avec ~110 ms de retard
    const buf = STREAM.buf, last = buf[buf.length - 1], DELAY = 0.14;
    const target = Math.min(last.T, last.T + (nowMs() - last.at) / 1000 - DELAY);
    if (STREAM.clock == null) STREAM.clock = Math.max(buf[0].T, target);
    else {
      STREAM.clock += dt;
      const err = target - STREAM.clock;
      if (err > 0.6) STREAM.clock = target;                         // très en retard : on rattrape d'un coup
      else STREAM.clock += clamp(err * dt * 3, -dt * 0.6, dt * 0.8);  // sinon on accélère ou ralentit un peu, sans reculer
      STREAM.clock = Math.min(STREAM.clock, last.T);
    }
    const rt = STREAM.clock;
    let lo = 0, hi = buf.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (buf[mid].T <= rt) lo = mid; else hi = mid - 1; }
    const a = buf[lo], b = buf[Math.min(buf.length - 1, lo + 1)];
    const t = b.T > a.T ? clamp((rt - a.T) / (b.T - a.T), 0, 1) : 1;
    const ma = new Map(a.b.map((r) => [K(r[0]), r])), mb = new Map(b.b.map((r) => [K(r[0]), r]));
    for (const [id, rb] of mb) { const ra = ma.get(id) || rb; live.set(id, { p: [ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t, ra[3] + (rb[3] - ra[3]) * t], holed: rb[4] === 1, oob: rb[4] === 2 }); }
    for (const [id, ra] of ma) if (!live.has(id)) live.set(id, { p: [ra[1], ra[2], ra[3]], holed: ra[4] === 1, oob: ra[4] === 2 });
    STREAM.rt = rt;
  }
  for (const p of G.players) {
    const id = p.id; let v = ballsVisual.get(id);
    if (!v) { v = { p: null, sink: 0 }; ballsVisual.set(id, v); R.addBall(id, p.color); }
    const st = G.balls[id]; if (!st) { R.setBall(id, [0, 0, 0], false); continue; }
    let pos = st.p, show = st.inPlay && !G.done[id];
    const L = live.get(id);
    if (L) { pos = L.p; show = true; }
    else if (G.shot && G.shot.pid === id) { pos = G.shot.from; show = true; }
    if (G.turn === id && G.phase === 'play') show = true;
    if (G.done[id] === 'holed' && !L) show = false;
    let sink = 0;
    if (v.sinkStart) { sink = clamp((nowMs() - v.sinkStart) / 500, 0, 1) * 0.4; if (!L && !(G.shot && G.shot.pid === id)) v.sinkStart = 0; }
    if (G.phase === 'intro' || G.phase === 'holeEnd') show = show && G.phase === 'holeEnd' ? st.inPlay : false;
    v.p = pos; v.show = show;
    R.setBall(id, pos, show, { dt, active: G.turn === id && !G.shot, sink });
  }
  for (const id of [...ballsVisual.keys()]) if (!G.players.some((p) => p.id === id)) { R.removeBall(id); ballsVisual.delete(id); }
  // son de roulement : balle suivie
  const f = focusBall();
  if (f && live.has(f)) { const v = ballsVisual.get(f); const sp = (R.balls.get(f)?.speed) || 0; sfx.roll(sp, true, false); void v; }
  else sfx.roll(0, false);
}
function focusBall() {
  if (G.shot) return G.shot.pid;
  return G.turn || ME();
}

/* ================================================================ CAMÉRA */
const CAM = { flipSign: 1, roll: 0, yaw: 0, pitch: 0.42, dist: 5.2, target: new THREE.Vector3(), cur: new THREE.Vector3(), mode: 'follow', introStart: 0, trans: 0, lastInput: 0, shake: 0, overview: false };
function camYawToRoute(p) {
  const h = holeNow(); if (!h) return 0;
  const r = h.route; let bi = 0, bd = 1e9;
  for (let i = 0; i < r.length; i++) { const d = Math.hypot(r[i][0] - p[0], r[i][2] - p[2]) + Math.abs(r[i][1] - p[1]) * 3; if (d < bd) { bd = d; bi = i; } }
  let acc = 0, j = bi;
  while (j < r.length - 1 && acc < 3.5) { acc += Math.hypot(r[j + 1][0] - r[j][0], r[j + 1][2] - r[j][2]); j++; }
  const q = r[j]; const dx = q[0] - p[0], dz = q[2] - p[2];
  if (Math.hypot(dx, dz) < 0.5) { const c = h.cup; return Math.atan2(c[0] - p[0], c[2] - p[2]); }
  return Math.atan2(dx, dz);
}
/** Point du parcours à la distance s (en mètres, à plat) depuis le départ */
function routeAt(h, s) {
  const r = h.route;
  if (!h._cum) { h._cum = [0]; for (let i = 1; i < r.length; i++) h._cum.push(h._cum[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][2] - r[i - 1][2])); }
  const C = h._cum; s = clamp(s, 0, C[C.length - 1]);
  let lo = 0, hi = C.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (C[m] <= s) lo = m; else hi = m; }
  const t = C[hi] > C[lo] ? (s - C[lo]) / (C[hi] - C[lo]) : 0, a = r[lo], b = r[hi];
  return new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function shake(a) { CAM.shake = Math.max(CAM.shake, a); }
function updateCamera(dt) {
  const cam = R.camera, h = holeNow(); if (!h) return;
  const fid = focusBall(), v = fid ? ballsVisual.get(fid) : null;
  let tgt = v && v.p ? new THREE.Vector3(...v.p) : new THREE.Vector3(...h.tee);
  // spectateur : suit le regard du joueur qui vise s'il ne touche pas la souris
  if (AIM.on && AIM.pid === G.turn && G.turn !== ME() && nowMs() - CAM.lastInput > 2500 && nowMs() - AIM.at < 1500) CAM.yaw += angDiff(AIM.yaw, CAM.yaw) * Math.min(1, dt * 4);
  if (CAM.mode === 'intro') {
    const u = clamp((nowMs() - CAM.introStart) / introMs(h), 0, 1), e = u * u * (3 - 2 * u);
    const cup = new THREE.Vector3(...h.cup), tee = new THREE.Vector3(...h.tee);
    const yawT = camYawToRoute(h.tee);
    const fwd = new THREE.Vector3(Math.sin(yawT), 0, Math.cos(yawT));
    const p0 = cup.clone().add(new THREE.Vector3(3, 7, 3)), p1 = tee.clone().addScaledVector(fwd, -5).add(new THREE.Vector3(0, 2.6, 0));
    let look = cup.clone().lerp(tee.clone().addScaledVector(fwd, 2), e), pos = p0.lerp(p1, e);
    if (h.routeLen > 70) {
      // très long trou : on remonte le parcours du trou jusqu'au départ, en regardant vers l'arrivée, puis on se pose derrière la balle
      const s = h.routeLen * (1 - e), k = clamp((u - 0.86) / 0.14, 0, 1), kk = k * k * (3 - 2 * k);
      const fly = routeAt(h, s - 9).add(new THREE.Vector3(0, 6.5, 0)), aim = routeAt(h, s + 7);
      pos = fly.lerp(p1, kk); look = aim.lerp(tee.clone().addScaledVector(fwd, 2), kk);
    }
    cam.up.set(0, 1, 0); CAM.roll = 0; CAM.flipSign = 1;
    cam.position.copy(pos); cam.lookAt(look);
    CAM.cur.copy(tee); CAM.yaw = yawT; CAM.pitch = 0.42;
    if (u >= 1 && G.phase !== 'intro') CAM.mode = 'follow';
    return;
  }
  if (CAM.mode === 'orbit') {
    const c = new THREE.Vector3(...h.cup), a = nowMs() / 4000;
    cam.up.set(0, 1, 0); cam.position.set(c.x + Math.sin(a) * 6, c.y + 3.5, c.z + Math.cos(a) * 6); cam.lookAt(c);
    return;
  }
  if (CAM.overview) { const b = h.bounds; tgt = new THREE.Vector3((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2); }
  // transition douce vers la balle suivie
  const k = 1 - Math.exp(-dt * (nowMs() - CAM.trans < 900 ? 4 : 9));
  CAM.cur.lerp(tgt, k);
  const dist = CAM.overview ? Math.max(18, Math.hypot(h.bounds.max[0] - h.bounds.min[0], h.bounds.max[2] - h.bounds.min[2]) * 0.8) : CAM.dist;
  const pitch = CAM.overview ? 1.05 : CAM.pitch;
  const fwd = new THREE.Vector3(Math.sin(CAM.yaw), 0, Math.cos(CAM.yaw));
  // au plafond aimanté, la caméra se retourne : on joue à l'envers
  const gsF = !CAM.overview && v && v.p ? gravSign(h.world, v.p) : 1;
  CAM.roll += ((gsF < 0 ? Math.PI : 0) - CAM.roll) * Math.min(1, dt * 3.5);
  const cr = Math.cos(CAM.roll), sr = Math.sin(CAM.roll);
  const upv = new THREE.Vector3(0, cr, 0).addScaledVector(new THREE.Vector3(-Math.cos(CAM.yaw), 0, Math.sin(CAM.yaw)), sr);
  CAM.flipSign = cr < 0 ? -1 : 1;
  cam.up.copy(upv);
  // la tête en bas, on reste dans le tunnel : caméra basse et proche
  const inv = Math.max(0, -cr), pitchE = pitch + (Math.min(pitch, 0.12) - pitch) * inv, distE = dist + (Math.min(dist, 3.0) - dist) * inv;
  const look = CAM.cur.clone().addScaledVector(upv, 0.25 * (1 - inv) + 0.04 * inv);
  let desired = look.clone().addScaledVector(fwd, -distE * Math.cos(pitchE)).addScaledVector(upv, distE * Math.sin(pitchE));
  if (!CAM.overview) desired = R.camClip(look, desired);
  cam.position.copy(desired);
  if (CAM.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * CAM.shake; cam.position.y += (Math.random() - 0.5) * CAM.shake; CAM.shake *= Math.exp(-dt * 10); }
  cam.lookAt(look);
}

/* ================================================================ CONTRÔLES */
const INPUT = { lastDx: 0, lastDy: 0, aiming: false, power: 0, btn: -1, space: false, lastAimSend: 0, locked: false, yaw: null, mx: -1, inside: false, keys: new Set() };
const TOUCHDEV = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const aimYaw = () => (INPUT.yaw != null ? INPUT.yaw : CAM.yaw);
const canvasEl = () => R.renderer.domElement;
function myTurn() { return G.phase === 'play' && G.turn === ME() && !G.shot && !SIM; }
function requestLock() { const c = canvasEl(); try { if (document.pointerLockElement !== c) { const p = c.requestPointerLock({ unadjustedMovement: false }); if (p && p.catch) p.catch(() => {}); } } catch (e) {} }
function requestLockSoon() { /* le verrouillage demande un clic : on l'obtient au prochain clic */ }
function startAim(btn) {
  if (!myTurn() || UI.screen !== 'game' || UI.menuOpen) return;
  INPUT.aiming = true; INPUT.power = 0; INPUT.btn = btn;
}
function releaseAim() {
  if (!INPUT.aiming) return;
  INPUT.aiming = false;
  const pw = INPUT.power, yaw = aimYaw(); INPUT.power = 0; INPUT.yaw = null;
  sendAim({ pid: ME(), yaw, power: 0, on: false });
  if (pw < 0.02 || !myTurn()) return;
  doShoot(yaw, pw);
}
function cancelAim() { if (!INPUT.aiming) return; INPUT.aiming = false; INPUT.power = 0; INPUT.yaw = null; sendAim({ pid: ME(), yaw: CAM.yaw, power: 0, on: false }); }

/* ---- écran tactile ----
   un doigt : tourner la caméra ; deux doigts : zoomer ;
   poser le doigt sur sa balle et tirer en arrière (lance-pierre) : la balle part à l'opposé, plus on tire loin, plus c'est fort */
const TOUCH = { pts: new Map(), mode: null, aimId: null, d0: 0, dist0: 0 };
function ballScreen() {
  const b = G.balls[ME()]; if (!b) return null;
  const v = ballsVisual.get(ME()), p = v && v.p ? v.p : b.p;
  const pr = R.project(p); if (!pr.front) return null;
  return { x: pr.x * innerWidth, y: pr.y * innerHeight, p };
}
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();
function touchAim(x, y) {
  const bs = ballScreen(); if (!bs) return;
  const sd = Math.hypot(x - bs.x, y - bs.y), full = Math.min(innerWidth, innerHeight) * 0.38;
  INPUT.power = clamp((sd - 14) / full, 0, 1);
  if (sd < 14) return;
  // direction : du doigt vers la balle, mesurée sur le sol (plan horizontal à hauteur de balle)
  _ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); _ray.setFromCamera(_ndc, R.camera);
  _plane.set(new THREE.Vector3(0, 1, 0), -bs.p[1]);
  const ok = _ray.ray.intersectPlane(_plane, _hit);
  if (ok && Math.hypot(_hit.x - bs.p[0], _hit.z - bs.p[2]) < 60) INPUT.yaw = Math.atan2(bs.p[0] - _hit.x, bs.p[2] - _hit.z);
  else INPUT.yaw = CAM.yaw - Math.atan2(bs.x - x, -(bs.y - y));   // doigt au-dessus de l'horizon : repli sur l'écran
}
function bindTouch(c) {
  const pinchDist = () => { const a = [...TOUCH.pts.values()]; return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  c.addEventListener('touchstart', (e) => {
    e.preventDefault(); initAudio();
    if (UI.screen !== 'game' || UI.menuOpen) return;
    for (const t of e.changedTouches) TOUCH.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
    if (TOUCH.pts.size === 1) {
      const t = e.changedTouches[0], bs = myTurn() ? ballScreen() : null;
      const reach = Math.max(70, Math.min(innerWidth, innerHeight) * 0.13);
      if (bs && Math.hypot(t.clientX - bs.x, t.clientY - bs.y) < reach) { TOUCH.mode = 'aim'; TOUCH.aimId = t.identifier; INPUT.aiming = true; INPUT.power = 0; INPUT.btn = -3; INPUT.yaw = CAM.yaw; }
      else TOUCH.mode = 'cam';
    } else if (TOUCH.pts.size === 2) {
      if (TOUCH.mode === 'aim') cancelAim();
      TOUCH.mode = 'pinch'; TOUCH.d0 = pinchDist(); TOUCH.dist0 = CAM.dist;
    }
  }, { passive: false });
  c.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (UI.screen !== 'game' || UI.menuOpen) return;
    for (const t of e.changedTouches) {
      const prevP = TOUCH.pts.get(t.identifier); if (!prevP) continue;
      const dx = t.clientX - prevP.x, dy = t.clientY - prevP.y;
      TOUCH.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (TOUCH.mode === 'cam') { CAM.yaw -= dx * 0.0065 * SENS.cam * CAM.flipSign; CAM.pitch = clamp(CAM.pitch + dy * 0.005 * SENS.cam, 0.05, 1.35); CAM.lastInput = nowMs(); }
      else if (TOUCH.mode === 'aim' && t.identifier === TOUCH.aimId) touchAim(t.clientX, t.clientY);
    }
    if (TOUCH.mode === 'pinch' && TOUCH.d0 > 10) { const d = pinchDist(); if (d > 10) { CAM.dist = clamp(TOUCH.dist0 * TOUCH.d0 / d, 1.3, 18); CAM.lastInput = nowMs(); } }
  }, { passive: false });
  const end = (e, cancel) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      TOUCH.pts.delete(t.identifier);
      if (TOUCH.mode === 'aim' && t.identifier === TOUCH.aimId) { if (cancel) cancelAim(); else releaseAim(); TOUCH.mode = null; }
    }
    if (TOUCH.pts.size === 0) TOUCH.mode = null;
    else if (TOUCH.mode === 'pinch' && TOUCH.pts.size === 1) TOUCH.mode = 'cam';
  };
  c.addEventListener('touchend', (e) => end(e, false), { passive: false });
  c.addEventListener('touchcancel', (e) => end(e, true), { passive: false });
}
function doShoot(yaw, power) {
  const T0 = kT();
  const shot = { id: -1, pid: ME(), owner: NET.myId, T0, yaw, power, from: G.balls[ME()].p.slice() };
  if (NET.isHost) { const s = hostShoot(NET.myId, { T0, yaw, power }); if (s) startSim(s); }
  else {
    H.send('host', { t: 'shoot', T0, yaw, power });
    // on lance tout de suite chez soi ; l'identifiant du coup est celui que l'hôte attribuera
    shot.id = (G.shot ? G.shot.id : 0) + 1; pendingShot = shot; startSim({ ...shot, id: 'pending' });
  }
}
let pendingShot = null;
function bindInput() {
  const c = canvasEl();
  bindTouch(c);
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('mousedown', (e) => {
    initAudio();
    if (UI.screen !== 'game') return;
    if (e.button === 0 || e.button === 2) { requestLock(); startAim(e.button); }
  });
  addEventListener('mouseup', (e) => { if (INPUT.aiming && (e.button === INPUT.btn || INPUT.btn === -1)) releaseAim(); });
  addEventListener('mousemove', (e) => {
    if (UI.screen !== 'game' || UI.menuOpen) return;
    const locked = document.pointerLockElement === c;
    INPUT.mx = e.clientX; INPUT.inside = e.target === c;
    if (!locked && e.target !== c) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;
    if (dx || dy) { INPUT.lastDx = dx; INPUT.lastDy = dy; }
    if (INPUT.aiming) {
      INPUT.power = clamp(INPUT.power + dy * 0.0032 * SENS.power, 0, 1);
      CAM.yaw -= dx * 0.0009 * SENS.cam * CAM.flipSign;
    } else {
      CAM.yaw -= dx * 0.0032 * SENS.cam * CAM.flipSign; CAM.pitch = clamp(CAM.pitch + dy * 0.0026 * SENS.cam, 0.05, 1.35);
      CAM.lastInput = nowMs();
    }
  });
  c.addEventListener('wheel', (e) => {
    e.preventDefault(); if (UI.screen !== 'game') return;
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    CAM.dist = clamp(CAM.dist * Math.exp(d * (e.ctrlKey ? 0.006 : 0.0016)), 1.3, 18); CAM.lastInput = nowMs();
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => { INPUT.locked = document.pointerLockElement === c; UI.lockHint(); });
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    initAudio();
    if (e.code === 'Escape') { if (INPUT.aiming) { cancelAim(); return; } if (UI.screen === 'game') UI.toggleMenu(); return; }
    if (UI.screen !== 'game' || UI.menuOpen) return;
    if (e.code === 'KeyM') { const m = DDVolume.toggle(['fx']); UI.toast(m ? 'Son coupé' : 'Son activé'); }
    if (e.code === 'KeyV') { CAM.overview = !CAM.overview; }
    if (e.code === 'Tab') { e.preventDefault(); UI.bigCard(true); }
    if (e.code === 'Space' && !e.repeat) { if (myTurn()) { INPUT.aiming = true; INPUT.power = 0; INPUT.btn = -2; INPUT.space = true; } e.preventDefault(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyQ', 'KeyW', 'KeyS', 'KeyZ'].includes(e.code)) { INPUT.keys.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Tab') UI.bigCard(false);
    INPUT.keys.delete(e.code);
    if (e.code === 'Space' && INPUT.space) { INPUT.space = false; releaseAim(); }
  });
  addEventListener('blur', () => { if (INPUT.aiming) { INPUT.aiming = false; INPUT.power = 0; } INPUT.keys.clear(); INPUT.inside = false; });
  // le curseur quitte la fenêtre par un côté : la caméra continue de tourner comme s'il restait collé au bord
  document.addEventListener('mouseout', (e) => {
    if (e.relatedTarget) return;
    const W = innerWidth, x = e.clientX, sideways = Math.abs(INPUT.lastDx) >= Math.abs(INPUT.lastDy);
    if (UI.screen === 'game' && sideways && x < W * 0.3 && INPUT.lastDx <= 0) { INPUT.mx = 0; INPUT.inside = true; }
    else if (UI.screen === 'game' && sideways && x > W * 0.7 && INPUT.lastDx >= 0) { INPUT.mx = W - 1; INPUT.inside = true; }
    else INPUT.inside = false;
  });
}
const SENS = { cam: PREFS.sens ?? 1, power: 1 };
function inputTick(dt) {
  // touches maintenues : la caméra tourne sans limite
  const K_ = INPUT.keys, left = K_.has('ArrowLeft') || K_.has('KeyA') || K_.has('KeyQ'), right = K_.has('ArrowRight') || K_.has('KeyD');
  const up = K_.has('ArrowUp') || K_.has('KeyW') || K_.has('KeyZ'), down = K_.has('ArrowDown') || K_.has('KeyS');
  const ks = INPUT.aiming ? 0.5 : 2.2;
  if (left) CAM.yaw += ks * dt * CAM.flipSign; if (right) CAM.yaw -= ks * dt * CAM.flipSign;
  if (up) CAM.pitch = clamp(CAM.pitch - 1.2 * dt, 0.05, 1.35); if (down) CAM.pitch = clamp(CAM.pitch + 1.2 * dt, 0.05, 1.35);
  // souris non verrouillée : pousser le curseur contre un bord fait tourner la caméra en continu
  if (!INPUT.locked && !TOUCHDEV && INPUT.inside && UI.screen === 'game' && !UI.menuOpen && INPUT.mx >= 0) {
    const W = innerWidth, edge = Math.max(40, W * 0.06);
    // pleine vitesse sur la moitié extérieure de la bande du bord
    const k = INPUT.mx < edge ? Math.min(1, 2 * (1 - INPUT.mx / edge)) : INPUT.mx > W - edge ? -Math.min(1, 2 * (1 - (W - 1 - INPUT.mx) / edge)) : 0;
    if (k) {
      CAM.yaw += k * (INPUT.aiming ? 0.6 : 2.4) * dt * CAM.flipSign; CAM.lastInput = nowMs();
      if (myTurn()) UI._hintAt = nowMs();   // rappelle qu'un clic verrouille la souris pour tourner librement
    }
  }
  if (INPUT.aiming && INPUT.space) INPUT.power = clamp(INPUT.power + dt * 0.55, 0, 1);
  if (INPUT.aiming && !myTurn()) { INPUT.aiming = false; INPUT.power = 0; }
  if (INPUT.aiming && nowMs() - INPUT.lastAimSend > 100) { INPUT.lastAimSend = nowMs(); sendAim({ pid: ME(), yaw: aimYaw(), power: INPUT.power, on: true }); }
}

/* ================================================================ INTERFACE */
const UI = {
  screen: null, menuOpen: false,
  show(s) {
    if (this.screen === s) return; this.screen = s;
    for (const id of ['lobby', 'results']) $(id).classList.toggle('hidden', id !== s);
    $('hud').classList.toggle('hidden', s !== 'game');
    if (s !== 'game') { this.menuOpen = false; $('menu').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
  },
  lobby() {
    const host = NET.isHost;
    $('lbwait').classList.toggle('hidden', host);
    $('lbstart').classList.toggle('hidden', !host);
    $('cards').innerHTML = COURSES.map((c) => `
      <button class="card ${c.id} ${G.course === c.id ? 'sel' : ''}" data-c="${c.id}" ${host ? '' : 'disabled'}>
        <div class="art">${ART[c.id]}</div>
        <div class="txt"><b>${esc(c.name)}</b><span>${esc(c.sub)}</span>
        <i class="diff" title="Difficulté">${[1, 2, 3].map((k) => `<em class="${k <= c.diff ? 'on' : ''}"></em>`).join('')}<small>${['', 'Classique', 'Normal', 'Difficile'][c.diff]}</small></i></div>
      </button>`).join('');
    $('cards').querySelectorAll('.card').forEach((b) => b.onclick = () => { sfx.click(); hostSetLobby({ course: b.dataset.c }); });
    const opt = (key, label, vals, cur = G.opts[key]) => `<div class="opt"><span>${label}</span><div class="seg">${vals.map(([v, l]) => `<button data-k="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'sel' : ''}" ${host ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>`;
    const nh = humans().length, cc = courseById(G.course);
    // le Marathon fait déjà 18 trous : aller, retour ou les 18 (le Grand Tour de 3 parcours ne le concerne pas)
    const holeOpts = isLong(cc) ? [['all', 'Les 18'], ['first', '1 à 9'], ['last', '10 à 18']] : [['all', 'Les 6'], ['first', '1 à 3'], ['last', '4 à 6'], ['eighteen', '18 (3 parcours)']];
    $('opts').innerHTML = opt('holes', 'Trous', holeOpts, isLong(cc) && G.opts.holes === 'eighteen' ? 'all' : G.opts.holes)
      + opt('bots', 'Bots', [0, 1, 2, 3].filter((n) => n + nh <= 6).map((n) => [n, n ? String(n) : 'Aucun']))
      + (G.opts.bots ? opt('level', 'Niveau des bots', [['facile', 'Facile'], ['normal', 'Normal'], ['expert', 'Expert']]) : '')
      + opt('collide', 'Les balles se touchent', [[true, 'Oui'], [false, 'Non']])
      + opt('timer', 'Temps par coup', [[30, '30 s'], [45, '45 s'], [60, '60 s'], [0, 'Libre']]);
    $('opts').querySelectorAll('button').forEach((b) => b.onclick = () => {
      sfx.click(); let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(Number(v))) v = Number(v);
      hostSetLobby({ opts: { [b.dataset.k]: v } });
    });
    const pl = G.players.length ? G.players : lobbyPlayers();
    $('lbplayers').innerHTML = pl.map((p) => `<li style="--c:${p.color}"><i></i>${esc(p.name)}${p.bot ? ' <small>bot</small>' : ''}${p.id === ME() ? ' <small>toi</small>' : ''}</li>`).join('');
  },
  holeBanner() {
    const h = holeNow(); if (!h) return;
    $('hnum').textContent = G.hi + 1; $('hname').textContent = h.name; $('hpar').textContent = 'Par ' + h.par;
    $('hcourse').textContent = COURSE.name + ' · trou ' + (G.hi + 1) + ' sur ' + G.holeList.length;
    document.body.dataset.theme = COURSE.theme;
    const intro = $('intro'); intro.innerHTML = `<div class="n">${G.hi + 1}</div><div class="nm">${esc(h.name)}</div><div class="pr">Par ${h.par}</div>`;
    intro.classList.remove('show'); void intro.offsetWidth; intro.classList.add('show');
  },
  holeSummary() {
    const h = holeNow(); if (!h) return;
    const rows = G.players.map((p) => { const s = G.strokes[p.id], d = s - h.par; return { p, s, d }; }).sort((a, b) => a.s - b.s);
    const lab = (r) => (G.done[r.p.id] === 'max' ? 'Coups épuisés' : r.s === 1 ? 'Trou en un' : r.d <= -2 ? 'Eagle' : r.d === -1 ? 'Birdie' : r.d === 0 ? 'Par' : r.d === 1 ? 'Bogey' : `+${r.d}`);
    $('summary').innerHTML = `<h3>Trou ${G.hi + 1} · ${esc(h.name)}</h3>` + rows.map((r) => `<div class="row" style="--c:${r.p.color}"><i></i><b>${esc(r.p.name)}</b><span class="s">${r.s}</span><span class="l">${lab(r)}</span></div>`).join('')
      + `<p>${G.hi + 1 < G.holeList.length ? 'Trou suivant dans un instant…' : 'Résultats…'}</p>`;
    const el = $('summary'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  },
  /** carte de score sur le côté */
  score() {
    if (!G.players.length || G.phase === 'lobby') return;
    const list = G.holeList, pars = list.map((_, k) => parOf(k));
    const w0 = list.length > 9 ? (G.hi < 9 ? 0 : 9) : 0, w1 = Math.min(list.length, w0 + 9), win = (k) => k >= w0 && k < w1;
    const tot = (id) => list.reduce((a, _, k) => a + (k === G.hi && G.phase !== 'holeEnd' && G.phase !== 'over' ? (G.strokes[id] || 0) : (G.scores[id]?.[k] || 0)), 0);
    const parSoFar = (id) => list.reduce((a, _, k) => a + (k < G.hi || (k === G.hi && (G.done[id] || G.phase === 'holeEnd' || G.phase === 'over')) ? pars[k] : 0), 0);
    const doneK = G.phase === 'holeEnd' || G.phase === 'over' ? G.hi + 1 : G.hi;
    const rel = (id) => { if (!doneK) return ''; const d = list.slice(0, doneK).reduce((a, _, k) => a + (G.scores[id]?.[k] || 0) - pars[k], 0); return d === 0 ? 'par' : d > 0 ? '+' + d : String(d); };
    void parSoFar;
    const cell = (id, k) => {
      if (k < G.hi || G.phase === 'over') return G.scores[id]?.[k] ?? '';
      if (k === G.hi) { const s = G.phase === 'holeEnd' ? G.scores[id]?.[k] : G.strokes[id]; return s ? s + (G.done[id] === 'holed' ? '' : G.done[id] === 'max' ? '×' : '') : ''; }
      return '';
    };
    const html = `<table><thead><tr><th class="nm">${list.length > 9 ? (w0 ? 'Retour' : 'Aller') : 'Trou'}</th>${list.map((_, k) => win(k) ? `<th class="${k === G.hi ? 'cur' : ''}">${k + 1}</th>` : '').join('')}<th class="t">Tot</th></tr>
      <tr class="par"><td class="nm">Par</td>${pars.map((p, k) => win(k) ? `<td class="${k === G.hi ? 'cur' : ''}">${p}</td>` : '').join('')}<td class="t">${pars.reduce((a, b) => a + b, 0)}</td></tr></thead><tbody>
      ${G.players.map((p) => `<tr class="${G.turn === p.id ? 'turn' : ''} ${G.done[p.id] === 'holed' ? 'in' : ''}" style="--c:${p.color}">
        <td class="nm"><i></i><span>${esc(p.name)}</span></td>
        ${list.map((_, k) => win(k) ? `<td class="${k === G.hi ? 'cur' : ''} sc">${cell(p.id, k)}</td>` : '').join('')}
        <td class="t"><b>${tot(p.id)}</b><small>${rel(p.id)}</small></td></tr>`).join('')}</tbody></table>`;
    const key = html.length + ':' + html;
    if (this._lastCard !== key) {
      const changed = this._lastCard != null;
      $('card').innerHTML = html; this._lastCard = key;
      if (changed) { $('card').classList.remove('bump'); void $('card').offsetWidth; $('card').classList.add('bump'); }
    }
  },
  bigCard(on) { $('card').classList.toggle('big', on); },
  results() {
    const c = courseById(G.course), list = G.holeList, pars = list.map((_, k) => parOf(k)), parT = pars.reduce((a, b) => a + b, 0);
    const multi = new Set(list.map((_, k) => entry(k)[0])).size > 1;
    const tot = (id) => list.reduce((a, _, k) => a + (G.scores[id]?.[k] || 0), 0);
    const rows = G.players.slice().sort((a, b) => tot(a.id) - tot(b.id));
    const rank = (p) => 1 + rows.filter((q) => tot(q.id) < tot(p.id)).length;
    $('podium').innerHTML = rows.slice(0, 3).map((p, i) => `<div class="pod p${rank(p)}" style="--c:${p.color}"><div class="who">${esc(p.name)}</div><div class="blk"><b>${rank(p)}</b><span>${tot(p.id)} coups</span><small>${tot(p.id) - parT === 0 ? 'par' : (tot(p.id) - parT > 0 ? '+' : '') + (tot(p.id) - parT)}</small></div></div>`).join('');
    $('resultcard').innerHTML = `<table><thead><tr><th class="nm">${esc(multi ? 'Grand Tour' : c.name)}</th>${list.map((_, k) => `<th>${k + 1}</th>`).join('')}<th class="t">Total</th></tr><tr class="par"><td class="nm">Par</td>${pars.map((p) => `<td>${p}</td>`).join('')}<td class="t">${parT}</td></tr></thead>
      <tbody>${rows.map((p) => `<tr style="--c:${p.color}"><td class="nm"><i></i><span>${esc(p.name)}</span></td>${list.map((_, k) => { const s = G.scores[p.id]?.[k]; const d = s - pars[k]; return `<td class="sc ${s === 1 ? 'ace' : d < 0 ? 'under' : d > 0 ? 'over' : ''}">${s ?? ''}</td>`; }).join('')}<td class="t"><b>${tot(p.id)}</b></td></tr>`).join('')}</tbody></table>`;
    $('resagain').classList.toggle('hidden', !NET.isHost);
    $('reswait').classList.toggle('hidden', NET.isHost);
    sfx.cheer(true);
  },
  flash(text, color, soft) {
    const el = $('turnchip'); el.innerHTML = `<i style="background:${color}"></i>${esc(text)}`; el.className = soft ? 'soft show' : 'show';
    clearTimeout(this._ft); this._ft = setTimeout(() => el.classList.remove('show'), soft ? 2200 : 2600);
  },
  big(text, sub, color) {
    const el = $('big'); el.innerHTML = `<div class="t" style="--c:${color}">${esc(text)}</div><div class="s">${esc(sub)}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), 1800); },
  toggleMenu(force) {
    this.menuOpen = force ?? !this.menuOpen; $('menu').classList.toggle('hidden', !this.menuOpen);
    if (this.menuOpen && document.pointerLockElement) document.exitPointerLock();
  },
  lockHint() {
    if (INPUT.locked) this.lockSeen = true;
    if (myTurn() && !this._hintAt) this._hintAt = nowMs(); if (!myTurn()) this._hintAt = 0;
    $('lockhint').classList.toggle('hidden', TOUCHDEV || INPUT.locked || UI.screen !== 'game' || !myTurn() || INPUT.aiming || (this._hintAt && nowMs() - this._hintAt > 6000));
  },
  /** éléments qui bougent à chaque image */
  frame() {
    if (this.screen !== 'game') return;
    const h = holeNow(); if (!h) return;
    // coups du joueur qui a la main
    const pid = G.shot ? G.shot.pid : G.turn, p = G.players.find((q) => q.id === pid);
    $('hstroke').innerHTML = p ? `<i style="background:${p.color}"></i>${esc(p.name)} · coup ${Math.min((G.strokes[pid] || 0) + (G.shot ? 0 : 1), capOf(h.par))}<small> / ${capOf(h.par)}</small>` : '';
    // minuteur
    const tl = G.turnEnds && !G.shot ? Math.max(0, (G.turnEnds - NET.hostNow()) / 1000) : null;
    const tm = $('timer');
    if (tl != null && G.phase === 'play') { tm.classList.remove('hidden'); tm.querySelector('b').textContent = Math.ceil(tl); tm.style.setProperty('--p', clamp(tl / (G.opts.timer || 45), 0, 1)); tm.classList.toggle('low', tl < 8); if (tl < 5 && G.turn === ME() && Math.ceil(tl) !== this._tick) { this._tick = Math.ceil(tl); sfx.tick(); } }
    else tm.classList.add('hidden');
    // puissance
    const pw = $('power'), aiming = INPUT.aiming || (AIM.on && AIM.pid === G.turn && G.turn !== ME() && nowMs() - AIM.at < 600);
    const val = INPUT.aiming ? INPUT.power : AIM.power;
    pw.classList.toggle('show', aiming);
    if (aiming) { pw.style.setProperty('--p', val); pw.querySelector('b').textContent = Math.round(val * 100) + ' %'; }
    // aide
    const mine = myTurn();
    $('help').innerHTML = TOUCHDEV
      ? (mine ? (INPUT.aiming ? 'Tire en arrière pour doser · lâche pour frapper · reviens sur la balle pour annuler' : 'Pose le doigt sur ta balle et tire en arrière · un doigt ailleurs : caméra · deux doigts : zoom')
        : (G.shot && G.shot.pid === ME() ? 'Ta balle roule…' : G.phase === 'play' ? 'Spectateur · un doigt : caméra · deux doigts : zoom' : ''))
      : mine
      ? (INPUT.aiming ? 'Recule la souris pour doser · relâche pour tirer · Échap annule' : 'Bouge la souris pour viser · maintiens un clic et recule pour la puissance · molette : zoom · V : vue du trou')
      : (G.shot && G.shot.pid === ME() ? 'Ta balle roule…' : G.phase === 'play' ? 'Mode spectateur · bouge la souris pour tourner autour · molette : zoom · Tab : carte' : '');
    $('spec').classList.toggle('show', G.phase === 'play' && G.turn !== ME() && !!p);
    if (p) $('spec').innerHTML = `Spectateur — <b style="color:${p.color}">${esc(p.name)}</b> ${G.shot ? 'a tiré' : 'vise…'}`;
    // pseudos au-dessus des balles
    const tags = $('tags');
    for (const pl of G.players) {
      let el = tags.querySelector(`[data-id="${CSS.escape(pl.id)}"]`);
      if (!el) { el = document.createElement('div'); el.className = 'tag'; el.dataset.id = pl.id; tags.appendChild(el); }
      const v = ballsVisual.get(pl.id);
      if (!v || !v.show || !v.p) { el.style.display = 'none'; continue; }
      const hw = holeNow(), up = hw ? gravSign(hw.world, v.p) * CAM.flipSign : 1;
      const pr = R.project([v.p[0], v.p[1] + 0.32 * up, v.p[2]]);
      const d = R.camera.position.distanceTo(new THREE.Vector3(...v.p));
      if (!pr.front || d > 45) { el.style.display = 'none'; continue; }
      el.style.display = ''; el.textContent = pl.name; el.style.setProperty('--c', pl.color);
      el.style.transform = `translate(${pr.x * innerWidth}px, ${pr.y * innerHeight}px) translate(-50%, -100%) scale(${clamp(5 / d, 0.6, 1.1)})`;
      el.classList.toggle('turn', G.turn === pl.id);
    }
    for (const el of [...tags.children]) if (!G.players.some((q) => q.id === el.dataset.id)) el.remove();
  },
};
function showLoading(on, name) { $('loading').classList.toggle('hidden', !on); if (name) $('loading').querySelector('b').textContent = name; }

/* illustrations des cartes postales de parcours (SVG) */
const ART = {
  marathon: `<svg viewBox="0 0 200 120"><defs><linearGradient id="ms" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a7fd6"/><stop offset=".6" stop-color="#93c3ee"/><stop offset="1" stop-color="#ffe2b8"/></linearGradient></defs><rect width="200" height="120" fill="url(#ms)"/><circle cx="150" cy="40" r="12" fill="#fff1c8"/><path d="M0 62 Q40 50 80 58 T160 54 T200 56 V120 H0Z" fill="#7fb35a"/><path d="M0 76 Q50 64 100 72 T200 68 V120 H0Z" fill="#5d9a42"/><path d="M14 118 C 40 96, 150 100, 120 84 S 60 76, 96 68 S 150 64, 132 60" fill="none" stroke="#d8cbb0" stroke-width="9" stroke-linecap="round"/><path d="M14 118 C 40 96, 150 100, 120 84 S 60 76, 96 68 S 150 64, 132 60" fill="none" stroke="#3f9c4c" stroke-width="5" stroke-linecap="round"/><path d="M132 60 V44" stroke="#fff" stroke-width="1.4"/><path d="M132 44 l9 3 -9 3z" fill="#ff7a1a"/><g fill="#2f7a33"><circle cx="30" cy="70" r="6"/><circle cx="170" cy="66" r="5"/><circle cx="60" cy="96" r="7"/></g><g transform="translate(160 92)"><rect x="-14" y="-9" width="28" height="18" rx="3" fill="#f7f1df" stroke="#5a3d24" stroke-width="1.5"/><text x="0" y="5" text-anchor="middle" font-family="Bowlby One, sans-serif" font-size="12" fill="#1d2b4f">18</text></g></svg>`,
  park: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#8cc6f5"/><circle cx="160" cy="26" r="14" fill="#fff3b0"/><rect y="70" width="200" height="50" fill="#5daa3c"/><path d="M20 98 Q100 74 180 92 L180 104 Q100 88 20 110Z" fill="#2f9a4c" stroke="#d9cfc2" stroke-width="4"/><circle cx="150" cy="93" r="4" fill="#111"/><path d="M150 93 V64" stroke="#fff" stroke-width="2"/><path d="M150 64 l16 5 -16 5z" fill="#e8433b"/><g transform="translate(46 44)"><rect x="-12" y="8" width="24" height="26" fill="#f4f1e8"/><path d="M-14 8 L0 -6 L14 8Z" fill="#c8322c"/><g stroke="#7a5534" stroke-width="4"><path d="M0 4 L0 -22M0 4 L0 30M0 4 L-26 4M0 4 L26 4"/></g></g><circle cx="80" cy="60" r="10" fill="#4ea845"/><rect x="78" y="64" width="4" height="10" fill="#6b4a2b"/></svg>`,
  pirate: `<svg viewBox="0 0 200 120"><defs><linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a6e"/><stop offset=".6" stop-color="#d9668f"/><stop offset="1" stop-color="#ffc07a"/></linearGradient></defs><rect width="200" height="120" fill="url(#ps)"/><circle cx="60" cy="74" r="18" fill="#ffd27a"/><rect y="74" width="200" height="46" fill="#1b6f88"/><path d="M0 84 h200 M20 92 h60 M110 96 h70" stroke="#ffd9a0" stroke-width="2" opacity=".6"/><ellipse cx="150" cy="80" rx="34" ry="8" fill="#e9d39c"/><path d="M148 78 q-4 -24 6 -36" stroke="#7a5c3a" stroke-width="4" fill="none"/><path d="M154 42 q-16 -2 -24 8 M154 42 q14 -6 24 4 M154 42 q-6 -12 -18 -14 M154 42 q10 -12 22 -10" stroke="#2f8a35" stroke-width="5" fill="none"/><path d="M20 80 h70 l-8 12 h-54z" fill="#5a3a20"/><path d="M50 80 V44 M50 46 l16 16 h-16z" stroke="#4a3220" stroke-width="3" fill="#f2e6c8"/></svg>`,
  zen: `<svg viewBox="0 0 200 120"><defs><linearGradient id="zs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#191b46"/><stop offset=".55" stop-color="#7a4d86"/><stop offset="1" stop-color="#f3a27a"/></linearGradient></defs><rect width="200" height="120" fill="url(#zs)"/><rect y="84" width="200" height="36" fill="#3b5a2c"/><path d="M30 92 Q100 56 170 92" stroke="#d22f2a" stroke-width="6" fill="none"/><path d="M40 90 v10 M70 76 v18 M100 70 v20 M130 76 v18 M160 90 v10" stroke="#d22f2a" stroke-width="3"/><ellipse cx="100" cy="102" rx="60" ry="8" fill="#1d5a6a"/><g transform="translate(36 40)"><rect x="-3" y="10" width="6" height="40" fill="#5a3d24"/><circle cx="0" cy="8" r="16" fill="#ffb7d0"/><circle cx="12" cy="16" r="10" fill="#ff9ec2"/></g><g transform="translate(166 62)"><rect x="-6" y="6" width="12" height="14" fill="#8f8a82"/><rect x="-5" y="-4" width="10" height="10" fill="#ffd38a"/><path d="M-10 -4 L0 -12 L10 -4Z" fill="#8f8a82"/></g><circle cx="172" cy="56" r="14" fill="#ffb050" opacity=".25"/></svg>`,
  forge: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#12070a"/><path d="M0 120 V96 Q50 88 100 98 T200 92 V120Z" fill="#ff5a12"/><path d="M0 104 Q60 96 120 106 T200 102" stroke="#ffd060" stroke-width="3" fill="none"/><path d="M120 96 L150 30 L180 96Z" fill="#2a1c18"/><path d="M144 40 h12" stroke="#ff7a20" stroke-width="5"/><g transform="translate(60 62)"><circle r="20" fill="none" stroke="#5b5f68" stroke-width="8"/><circle r="20" fill="none" stroke="#39e6ff" stroke-width="2" opacity=".8"/></g><rect x="20" y="80" width="90" height="6" fill="#3c4048"/><rect x="20" y="78" width="90" height="2" fill="#39e6ff"/><path d="M96 44 l-10 0 l0 -14 l10 0" stroke="#ffc21a" stroke-width="5" fill="none"/></svg>`,
  canyon: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#8fbde8"/><circle cx="40" cy="26" r="13" fill="#fff3c8"/><path d="M0 70 L30 40 L60 40 L70 70Z M120 70 L135 30 L175 30 L190 70Z" fill="#c77a4a"/><rect y="70" width="200" height="50" fill="#e2b77c"/><path d="M10 112 C 60 70, 90 110, 140 84 S 190 80, 196 74" fill="none" stroke="#a85e34" stroke-width="11"/><path d="M10 112 C 60 70, 90 110, 140 84 S 190 80, 196 74" fill="none" stroke="#e0a070" stroke-width="7"/><g fill="#3f8a4a"><rect x="96" y="56" width="7" height="26" rx="3"/><rect x="88" y="62" width="6" height="12" rx="3"/><rect x="105" y="60" width="6" height="12" rx="3"/></g></svg>`,
  space: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#0b0a2a"/><g fill="#fff"><circle cx="20" cy="18" r="1"/><circle cx="60" cy="40" r="1.4"/><circle cx="120" cy="12" r="1"/><circle cx="170" cy="30" r="1.3"/><circle cx="90" cy="70" r="1"/><circle cx="185" cy="90" r="1"/></g><circle cx="160" cy="88" r="30" fill="#4a6aff"/><ellipse cx="160" cy="88" rx="48" ry="9" fill="none" stroke="#d8c8ff" stroke-width="3" opacity=".7"/><rect x="20" y="48" width="110" height="28" rx="4" fill="#3c4048"/><rect x="20" y="48" width="110" height="5" fill="#b36bff"/><rect x="20" y="71" width="110" height="3" fill="#ff3fa8"/><circle cx="70" cy="58" r="5" fill="#fafafa"/><path d="M70 64 v8" stroke="#d39bff" stroke-width="2" stroke-dasharray="2 2"/></svg>`,
  swamp: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#3b5446"/><rect y="0" width="200" height="60" fill="#5a7462"/><rect y="74" width="200" height="46" fill="#2c3a22"/><ellipse cx="60" cy="96" rx="14" ry="4" fill="#4a8a3a"/><ellipse cx="140" cy="104" rx="10" ry="3" fill="#4a8a3a"/><path d="M0 84 h200" stroke="#a3aa78" stroke-width="2" opacity=".4"/><path d="M20 82 L120 76 L190 82" stroke="#6b5038" stroke-width="8" fill="none"/><path d="M40 82 v14 M80 79 v16 M120 77 v16 M160 80 v14" stroke="#4a3420" stroke-width="3"/><path d="M168 74 V20 M168 40 l-14 -12 M168 30 l12 -10" stroke="#4a3a2a" stroke-width="4" fill="none"/><g fill="#d8ff6a"><circle cx="40" cy="50" r="2"/><circle cx="96" cy="36" r="1.6"/><circle cx="130" cy="58" r="2"/></g></svg>`,
  ice: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#a5d0f2"/><path d="M0 80 L50 24 L80 54 L110 14 L160 64 L200 40 V120 H0Z" fill="#e8f2fb"/><path d="M50 24 L60 36 L48 34 Z M110 14 L122 28 L106 26Z" fill="#fff"/><path d="M0 112 C 50 80, 80 112, 120 92 S 180 70, 200 66" fill="none" stroke="#7fb8e0" stroke-width="12"/><path d="M0 112 C 50 80, 80 112, 120 92 S 180 70, 200 66" fill="none" stroke="#dff4ff" stroke-width="7"/><path d="M150 100 l8 -14 8 14z M164 100 l7 -12 7 12z" fill="#2a5a4a"/></svg>`,
  candy: `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#ffd0ec"/><rect y="84" width="200" height="36" fill="#a8f0d8"/><g transform="translate(150 50)"><circle r="34" fill="none" stroke="#fff" stroke-width="3"/><g stroke="#fff" stroke-width="2"><path d="M-34 0 H34 M0 -34 V34 M-24 -24 L24 24 M-24 24 L24 -24"/></g><rect x="-6" y="-40" width="12" height="9" fill="#ff5a8a"/><rect x="-40" y="-5" width="12" height="9" fill="#5ab8ff"/><rect x="28" y="-5" width="12" height="9" fill="#ffd23f"/></g><path d="M10 100 Q40 40 70 96 T 120 70" fill="none" stroke="#e8263c" stroke-width="7"/><path d="M10 100 Q40 40 70 96 T 120 70" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="6 6"/><circle cx="40" cy="30" r="9" fill="#5af0a0"/><rect x="39" y="38" width="2" height="30" fill="#fff"/></svg>`,
};

/* ================================================================ DÉMARRAGE */
function bootNet(onReady) {
  const start = (info) => {
    NET.role = H.embedded ? info.role : 'solo'; NET.myId = H.embedded ? info.myId : 0; NET.hostId = info.hostId ?? 0;
    H.on('msg', (from, m) => onMsg(from, m, false));
    H.on('roster', () => {
      const was = NET.role, oldHost = NET.hostId; NET.hostId = H.info.hostId;
      if (H.embedded && H.info.role === 'host' && was === 'guest') {   // l'hôte est parti : je reprends la partie
        NET.role = 'host'; UI.toast('Tu es maintenant l\'hôte');
        // l'horloge de la partie continue (NET.offset gardé) ; un numéro d'état bien plus grand passe chez tous les invités
        G.n += 1000;
        if (G.shot) { const s = G.shot; G.strokes[s.pid] = Math.max(0, G.strokes[s.pid] - 1); G.shot = null; }
        SIM = null; pendingShot = null; BOT = null; STREAM.id = 0; STREAM.buf = [];
        if (G.phase === 'play' && G.turn) hostBeginTurn(G.turn); else commit();
      } else if (NET.role === 'guest' && oldHost !== NET.hostId) {
        // nouvel hôte : on accepte son état même s'il a raté le dernier, et on se recale sur son horloge
        NET.resync = true; NET.resyncClock = true; NET.rtt = 999;
        H.send('host', { t: 'hello' }); H.send('host', { t: 'ping', c: nowMs() });
      }
      if (NET.role === 'host') {
        const ids = new Set(humans().map((h) => K(h.id)));
        if (G.phase === 'lobby') { G.players = lobbyPlayers(); commit(); }
        else {
          let changed = false;
          for (const p of G.players.slice()) {
            if (p.bot) continue;
            if (!ids.has(p.id)) {
              if (G.done[p.id] === 'left') continue;
              if (!G.done[p.id]) G.done[p.id] = 'left';
              changed = true;
              if (G.shot && K(G.shot.owner) === p.id) { G.strokes[G.shot.pid] = Math.max(0, G.strokes[G.shot.pid] - 1); G.shot = null; }
              if (G.turn === p.id && !G.shot) { hostNextTurn(); changed = false; }
            } else if (G.done[p.id] === 'left' && G.phase !== 'over') {
              // revenu (coupure, ou ancien hôte qui rejoint le nouveau) : il reprend le trou là où il l'avait laissé
              G.done[p.id] = false; changed = true;
            }
          }
          // celui qui a la main vient de couper : son tour ne bloque pas les autres
          if (G.phase === 'play' && G.turn && !G.shot && isAway(G.turn) && (!G.turnEnds || G.turnEnds > NET.hostNow() + AWAY_TURN_MS)) { G.turnEnds = NET.hostNow() + AWAY_TURN_MS; changed = true; }
          if (changed) commit();
        }
      }
      if (G.phase === 'lobby') UI.lobby();
    });
    H.signalReady();
    if (NET.role === 'guest') { H.send('host', { t: 'hello' }); const iv = setInterval(() => { if (G.n > 0 || !H.embedded) clearInterval(iv); else H.send('host', { t: 'hello' }); }, 1500); }
    onReady();
  };
  if (H.embedded) H.on('init', start); else start({ role: 'solo', myId: 0, hostId: 0 });
}

function boot() {
  R = new Renderer($('game'));
  bindInput();
  // boutons
  $('lbstart').onclick = () => { initAudio(); sfx.click(); if (NET.isHost) hostStart(); };
  $('lbquit').onclick = () => (H.embedded ? H.exit() : location.reload());
  $('resagain').onclick = () => { if (NET.isHost) { G.phase = 'lobby'; G.players = lobbyPlayers(); commit(); } };
  $('resquit').onclick = () => (H.embedded ? H.exit() : location.reload());
  $('mresume').onclick = () => UI.toggleMenu(false);
  // un seul panneau Réglages : le son (pas de musique dans Mini-Golf Party), les graphismes et la caméra
  DDVolume.panel($('mset'), {
    kinds: ['fx'], accent: '#2e8b57',
    sections: [{
      title: 'Jeu',
      items: [
        { label: 'Graphismes', options: [['high', 'Détaillés'], ['low', 'Légers']], get: () => (R.quality === 'low' ? 'low' : 'high'),
          set: (v) => { R.setQuality(v); PREFS.quality = R.quality; PERF.done = true; savePrefs(); } },
        { label: 'Sensibilité caméra', range: [0.4, 1.8, 0.1], get: () => SENS.cam, format: (v) => Math.round(v * 100) + ' %',
          set: (v) => { SENS.cam = +(+v).toFixed(1); PREFS.sens = SENS.cam; savePrefs(); } },
      ],
    }],
    hint: 'Touche <kbd>M</kbd> : couper ou remettre le son.',
  });
  $('mquit').onclick = () => (H.embedded ? H.exit() : location.reload());
  $('menubtn').onclick = () => UI.toggleMenu();
  $('viewbtn').onclick = () => { CAM.overview = !CAM.overview; $('viewbtn').classList.toggle('on', CAM.overview); };
  $('card').onclick = () => { if (TOUCHDEV) $('card').classList.toggle('big'); };
  document.body.classList.toggle('touch', TOUCHDEV);
  $('lockhint').onclick = () => { requestLock(); };
  R.touch = TOUCHDEV; R.setQuality(PREFS.quality === 'low' ? 'low' : 'high');
  // décor du salon : premier parcours chargé derrière le menu
  loadCourse(G.course);
  bootNet(() => {
    if (NET.isHost) { G.players = lobbyPlayers(); commit(); }
    else UI.show('lobby');
    // invités : recalage d'horloge sur l'hôte (s'arrête tout seul si l'on devient hôte)
    setInterval(() => { if (NET.role === 'guest') H.send('host', { t: 'ping', c: nowMs() }); }, 2000);
    requestAnimationFrame(frame);
  });
  if (DEBUG) window.__golf = { get G() { return G; }, R, NET, INPUT, TOUCHDEV, BV: ballsVisual, hostStart, doShoot, goHole: (i) => hostStartHole(i), CAM, get SIM() { return SIM; }, HOLES: () => HOLES };
}

let last = nowMs(), menuSpin = 0;
function frame() {
  const t = nowMs(), raw = (t - last) / 1000, dt = Math.min(0.05, raw); last = t;
  if (NET.isHost) hostTick();
  inputTick(dt);
  // coup lancé avant la réponse de l'hôte : on adopte l'identifiant attribué
  if (pendingShot && G.shot && G.shot.pid === ME() && SIM && SIM.id === 'pending') { SIM.id = G.shot.id; pendingShot = null; }
  if (pendingShot && SIM && SIM.id === 'pending' && SIM.done && !G.shot && nowMs() - (SIM.doneAt || (SIM.doneAt = nowMs())) > 2500) { SIM = null; pendingShot = null; }
  simTick(Math.min(0.3, raw));   // la balle avance en temps réel, même si l'affichage rame
  let kin = kT();
  if (SIM && !SIM.done) kin = SIM.T0 + SIM.t;
  else if (G.shot && STREAM.id === G.shot.id && STREAM.rt != null) kin = G.shot.T0 + STREAM.rt;
  if (UI.screen === 'game' && COURSE && holeNow()) {
    updateBalls(dt); updateCamera(dt);
    const fb = ballsVisual.get(focusBall());
    if (holeNow()) R.flagFade(entry(G.hi)[1], fb && fb.p ? Math.hypot(fb.p[0] - holeNow().cup[0], fb.p[2] - holeNow().cup[2]) : 99);
    const me = G.balls[ME()];
    const hw = holeNow().world;
    R.aim(myTurn() && !!me, me ? me.p : [0, 0, 0], INPUT.aiming ? aimYaw() : CAM.yaw, INPUT.aiming ? INPUT.power : 0, null, me ? gravSign(hw, me.p) < 0 : false);
    if (!myTurn() && AIM.on && AIM.pid === G.turn && G.balls[AIM.pid] && nowMs() - AIM.at < 600) R.aim(true, G.balls[AIM.pid].p, AIM.yaw, AIM.power, null, gravSign(hw, G.balls[AIM.pid].p) < 0);
    R.update(dt, kin, fb && fb.p ? new THREE.Vector3(...fb.p) : CAM.cur);
  } else if (COURSE && HOLES.length) {
    // menu : survol lent du parcours
    menuSpin += dt * 0.05;
    const h = HOLES[0], c = new THREE.Vector3((h.bounds.min[0] + h.bounds.max[0]) / 2, 0, (h.bounds.min[2] + h.bounds.max[2]) / 2 + 20);
    R.camera.up.set(0, 1, 0); R.camera.position.set(c.x + Math.sin(menuSpin) * 40, 18, c.z + Math.cos(menuSpin) * 40); R.camera.lookAt(c);
    R.update(dt, kin, c);
  }
  R.render();
  UI.frame();
  perfWatch(dt);
  const lk = myTurn() + ':' + INPUT.aiming + ':' + INPUT.locked + ':' + (UI._hintAt && nowMs() - UI._hintAt > 6000);
  if (UI.screen === 'game' && lk !== UI._mt) { UI._mt = lk; UI.lockHint(); }
  requestAnimationFrame(frame);
}

boot();
