// Règles de Dogfight 3D : joueurs et équipes, modes, phases, dégâts localisés, réapparitions, victoire,
// et état compact pour le réseau. Moteur pur : l'état est un objet simple, qu'un nouvel hôte peut reprendre.
import { createFlight, stepFlight, computeAxes, TYPES, CENTER, ZONE, ZONE_WARN } from './flight.js';
import { stepGun, stepBullets, stepLock, launchMissile, stepMissiles, MISSILE_DAMAGE, FLARE_COOLDOWN, FLARE_TIME } from './weapons.js';
import { useAbility } from './abilities.js';
import { botInput } from './ai.js';
import { MODE_IDS, isTeamMode, pickZones, stepZones, KILL_POINTS, POINTS_PER_KILL_GOAL, duelPoses, nextPair, ROUND_TIME, cargoHp, stepCargo, startCargo, newCargo, cargoLeft, alongRoute, getRoute, CARGO_RADIUS, ATTACK_LIVES } from './modes.js';

export const DT = 1 / 60;
export const COLORS = ['#3f7fe8', '#e0483c', '#2fa866', '#e29a2b', '#9a5be0', '#21a8c4'];
export const TEAM_COLORS = { 1: '#4f8dff', 2: '#ff5a4d' };
export const RESPAWN_DELAY = 4;
export const INVULNERABLE_TIME = 2.5;
export const COUNTDOWN = 3;
const ZONE_MULT = { C: 1, E: 1.25, T: 1, L: 0.9, R: 0.9 };
const ZONE_WEAR = 1 / 50;    // une zone est hors d'usage après ~50 points de dégâts
const ASSIST_TIME = 6;       // qui a touché juste avant un crash marque le point
const HELP_TIME = 12;        // qui a touché dans ces dernières secondes compte comme aide
const HELP_DAMAGE = 20;
const DUEL_PAUSE = 3;

export const blankInput = () => ({ p: 0, r: 0, y: 0, boost: false, brake: false, fire: false, msl: false, flare: false, ab: false, free: false, lim: 1 });

// Une altitude sûre ici et devant soi (relief, toits, mâts) : on n'apparaît jamais face à une montagne
function safeY(world, x, z, hx, hz, above = 150) {
  if (!world) return above;
  let h = 0;
  for (const d of [0, 250, 500, 800]) for (const o of [-60, 60]) h = Math.max(h, world.obstacleAt(x + hx * d - hz * o, z + hz * d + hx * o));
  return h + above;
}

function spawnPose(idx, total, world, ring = 900) {
  const a = (idx / Math.max(1, total)) * Math.PI * 2 + 0.4, x = CENTER + Math.cos(a) * ring, z = CENTER + Math.sin(a) * ring;
  const h = world ? world.obstacleAt(x, z) : 0;
  return { x, y: Math.max(h + 130, 230 + (idx % 3) * 35), z, heading: Math.atan2(CENTER - x, CENTER - z) };
}

function makePlane(p, idx, total, world, settings) {
  const T = TYPES[p.type] ? p.type : 'f16', stats = TYPES[T];
  const f = createFlight({ ...spawnPose(idx, total, world), type: T });
  return Object.assign(f, {
    id: p.id, name: p.name || `Pilote ${idx + 1}`, color: p.color || COLORS[idx % COLORS.length], bot: !!p.bot, lvl: p.lvl || settings.level || 'normal', team: p.team || 0,
    health: stats.hp, maxHp: stats.hp, kills: 0, deaths: 0, alive: true, respawn: 0, inv: INVULNERABLE_TIME,
    heat: 0, over: false, overT: 0, firing: false, fireAcc: 0, msCd: 0, flCd: 0, flT: 0, abCd: 0, abT: 0, cob: 0, lockId: null, lockT: 0, warn: false, lives: 0, out: false, abUses: 0,
    lastHitBy: null, lastHitT: 0, ack: 0, inp: blankInput(), ready: !!p.bot,
    shots: 0, hits: 0, mhits: 0, helps: 0, streak: 0, best: 0, zt: 0, cdmg: 0, nemesis: null, dmgBy: {},
  });
}

export function assignTeams(players, mode) {
  if (!isTeamMode(mode)) { players.forEach((p) => { p.team = 0; }); return players; }
  // les humains d'abord, en alternance, puis les bots comblent
  const humans = players.filter((p) => !p.bot), bots = players.filter((p) => p.bot);
  let a = 0, b = 0;
  for (const p of [...humans, ...bots]) { if (a <= b) { p.team = 1; a++; } else { p.team = 2; b++; } }
  return players;
}

export function createGame({ settings = {}, players = [], world = null } = {}) {
  const mode = MODE_IDS.includes(settings.mode) ? settings.mode : 'chacun', kills = Number(settings.kills || 8), time = Number(settings.time || 300);
  assignTeams(players, mode);
  const g = {
    settings: { target: mode === 'domination' ? kills * POINTS_PER_KILL_GOAL : kills, time, level: settings.level || 'normal', mode },
    ph: 'hangar', t: 0, left: time, clock: 0, tk: { 1: 0, 2: 0 }, winner: null, winTeam: 0,
    planes: [], bullets: [], missiles: [], events: [], rev: 1, zones: null, duel: null, cargo: null,
  };
  g.planes = players.map((p, i) => makePlane(p, i, players.length, world, g.settings));
  if (mode === 'domination' && world) g.zones = pickZones(world);
  if (mode === 'escorte') addCargo(g, world);
  return g;
}
const isCargo = (p) => p.type === 'cargo';

// Le transport est un avion comme un autre pour les balles et les missiles, mais il ne se pilote pas et ne figure pas aux scores
function addCargo(g, world) {
  g.cargo = world ? newCargo(g.settings.time, world) : { route: 'traversee', model: 'a400m', d: 0, v: 80, landed: false };
  const c = makePlane({ id: 'cargo', name: 'Transport', color: '#e8b53c', bot: true, team: 1, type: 'cargo' }, g.planes.length, g.planes.length + 1, world, g.settings);
  c.hitR = CARGO_RADIUS; c.ready = true; c.model = g.cargo.model; c.maxHp = c.health = cargoHp(g.planes.filter((p) => p.team === 2).length);
  g.planes.push(c);
}

function placeCargo(g, world) {
  const c = g.planes.find(isCargo); if (!c) return;
  // sa solidité se règle au décollage, selon le nombre d'attaquants présents
  const hp = cargoHp(g.planes.filter((p) => p.team === 2).length);
  Object.assign(c, { health: hp, maxHp: hp, alive: true, inv: 0, dmgBy: {}, flCd: 0 });
  if (world) startCargo(c, g.cargo, world);
}

// Escorte : l'escorte vole en formation derrière le transport, les assaillants l'attendent loin devant, sur sa route
function escortPose(g, p, world, k, start) {
  const c = g.planes.find(isCargo), at = alongRoute(g.cargo, world, 0), n = Math.hypot(at.tx, at.tz) || 1, hx = at.tx / n, hz = at.tz / n;
  const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
  if (p.team === 1) {
    const back = start ? 260 + row * 150 : 650 + Math.random() * 250, lat = side * (start ? 140 + row * 60 : 150 + Math.random() * 200);
    const x = c.x - hx * back - hz * lat, z = c.z - hz * back + hx * lat;
    return { x, z, y: Math.max(c.y + (start ? 35 : 90), safeY(world, x, z, hx, hz, 110)), heading: Math.atan2(hx, hz) };
  }
  const f = alongRoute(g.cargo, world, start ? 4200 : 2600 + Math.random() * 900), lat = side * (300 + row * 220 + (start ? 0 : Math.random() * 400));
  const fn = Math.hypot(f.tx, f.tz) || 1, x = f.x - f.tz / fn * lat, z = f.z + f.tx / fn * lat, dx = c.x - x, dz = c.z - z, dn = Math.hypot(dx, dz) || 1;
  return { x, z, y: Math.max(f.y + 90, safeY(world, x, z, dx / dn, dz / dn, 160)), heading: Math.atan2(dx, dz) };
}

// Duel : deux pilotes en piste, les autres attendent leur tour
function setupDuel(g, world) {
  const ids = g.planes.map((p) => p.id);
  g.duel = { a: ids[0], b: ids[1] ?? null, q: ids.slice(2), round: 1, pause: 0, loser: null, t: ROUND_TIME };
  placeDuelists(g, world);
}
function placeDuelists(g, world) {
  const d = g.duel, poses = duelPoses(d.round, world);
  for (const p of g.planes) {
    const k = p.id === d.a ? 0 : p.id === d.b ? 1 : -1;
    if (k < 0) { p.alive = false; p.out = true; p.respawn = 0; p.firing = false; continue; }
    const type = p.type;
    Object.assign(p, createFlight({ ...poses[k], type }), repaired(p), { alive: true, out: false, inv: INVULNERABLE_TIME, killedBy: null, deathCause: null });
  }
}
// Temps écoulé : la manche va au moins abîmé, et à égalité au dernier arrivé
function endRoundOnTime(g) {
  const d = g.duel, a = g.planes.find((p) => p.id === d.a), b = g.planes.find((p) => p.id === d.b);
  if (!a || !b || !a.alive || !b.alive) { d.t = ROUND_TIME; return; }
  const loser = a.health / a.maxHp <= b.health / b.maxHp ? a : b, winner = loser === a ? b : a;
  winner.kills++; winner.inv = DUEL_PAUSE + 1;
  loser.alive = false; loser.firing = false; loser.respawn = 0;
  d.pause = DUEL_PAUSE; d.loser = loser.id; g.rev++;
  g.events.push({ e: 'roundEnd', loser: loser.id, by: winner.id, byName: winner.name, n: d.round, time: true });
  if (winner.kills >= g.settings.target) finish(g);
}
function nextRound(g, world) {
  const d = g.duel;
  nextPair(d);
  d.round++; d.pause = 0; d.loser = null; d.t = ROUND_TIME;
  g.bullets.length = 0; g.missiles.length = 0;
  placeDuelists(g, world);
  g.rev++;
  g.events.push({ e: 'round', n: d.round, a: d.a, b: d.b });
}

export function startCountdown(g, world) {
  g.ph = 'countdown'; g.t = COUNTDOWN; g.rev++;
  g.planes.forEach((p, i) => { const type = p.type; Object.assign(p, createFlight({ ...spawnPose(i, g.planes.length, world), type }), { ...repaired(p), alive: true, out: false, inv: INVULNERABLE_TIME + COUNTDOWN }); });
  if (g.settings.mode === 'duel') { setupDuel(g, world); for (const p of g.planes) if (p.alive) p.inv = INVULNERABLE_TIME + COUNTDOWN; }
  if (g.cargo) {
    placeCargo(g, world);
    if (world) { g.left = cargoLeft(g.cargo, world); const k = { 1: 0, 2: 0 }; for (const p of g.planes) if (!isCargo(p)) Object.assign(p, createFlight({ ...escortPose(g, p, world, k[p.team]++, true), type: p.type }), { speed: p.team === 1 ? getRoute(g.cargo.route, world).speed + 25 : (TYPES[p.type] || TYPES.f16).cruise }); }
    for (const p of g.planes) p.lives = p.team === 2 && !isCargo(p) ? ATTACK_LIVES : 0;
  }
  g.events.push({ e: 'count' });
}

// Réparé et réarmé : missile, leurres et capacité sont prêts dès la réapparition
function repaired(p) { const T = TYPES[p.type] || TYPES.f16, hp = p.type === 'cargo' ? p.maxHp : T.hp; return { dmgBy: {}, health: hp, maxHp: hp, msCd: 0, flCd: 0, flT: 0, abCd: 0, abT: 0, cob: 0, heat: 0, over: false, overT: 0, lockId: null, lockT: 0, warn: false, lastHitBy: null, dE: 0, dL: 0, dR: 0, dT: 0, inp: p.bot ? blankInput() : p.inp, ai: null }; }

export function addPlayer(g, p, world) {
  if (g.planes.some((q) => q.id === p.id)) return;
  if (isTeamMode(g.settings.mode)) { const a = g.planes.filter((q) => q.team === 1 && q.type !== 'cargo').length, b = g.planes.filter((q) => q.team === 2).length; p.team = a <= b ? 1 : 2; } else p.team = 0;
  const q = makePlane(p, g.planes.length, g.planes.length + 1, world, g.settings);
  q.inv = INVULNERABLE_TIME;
  if (g.cargo && q.team === 2) q.lives = ATTACK_LIVES;
  // en plein duel, le nouveau venu attend son tour
  if (g.duel) { q.alive = false; q.out = true; if (g.duel.b === null) g.duel.b = q.id; else g.duel.q.push(q.id); }
  g.planes.push(q); g.rev++;
}

// Un joueur part : un bot reprend son avion et son score
export function replaceByBot(g, id) {
  const p = g.planes.find((q) => q.id === id);
  if (!p || p.bot) return;
  p.bot = true; p.ai = null; p.lvl = g.settings.level; p.inp = blankInput(); g.rev++;
  g.events.push({ e: 'left', name: p.name });
}

function kill(g, victim, killer, cause, world) {
  if (!victim.alive) return;
  victim.alive = false; victim.deaths++; victim.respawn = RESPAWN_DELAY; victim.firing = false; g.rev++;
  const scored = killer && killer.id !== victim.id && !(killer.team && killer.team === victim.team);
  victim.killedBy = scored ? killer.name : null;
  victim.deathCause = cause;
  const at = { x: Math.round(victim.x), y: Math.round(victim.y), z: Math.round(victim.z) }, mode = g.settings.mode;
  victim.streak = 0;
  if (victim.type === 'cargo') {
    if (scored) killer.kills++;
    g.events.push({ e: 'cargo', by: scored ? killer.id : null, byName: scored ? killer.name : null, ...at });
    g.why = 'shot';
    finish(g);
    return;
  }
  // Escorte : un assaillant sans vie restante regarde la fin ; tous à terre, l'escorte gagne
  if (g.cargo && victim.team === 2) {
    victim.lives = Math.max(0, victim.lives - 1);
    if (!victim.lives) { victim.out = true; victim.respawn = 0; g.events.push({ e: 'out', id: victim.id, name: victim.name }); }
  }
  if (scored) {
    killer.kills++; killer.streak++; killer.best = Math.max(killer.best, killer.streak);
    for (const id of Object.keys(victim.dmgBy)) {
      const h = victim.dmgBy[id];
      if (id === String(killer.id) || g.clock - h.t > HELP_TIME || h.d < HELP_DAMAGE) continue;
      const q = g.planes.find((x) => String(x.id) === id);
      if (q && !(q.team && q.team === victim.team)) { q.helps++; g.events.push({ e: 'help', by: q.id, name: victim.name }); }
    }
    if (mode === 'domination') g.tk[killer.team] += KILL_POINTS;
    else if (killer.team) g.tk[killer.team]++;
    g.events.push({ e: 'kill', by: killer.id, byName: killer.name, id: victim.id, name: victim.name, cause, ...at });
    if (!g.first) { g.first = true; g.events.push({ e: 'first', by: killer.id, name: killer.name }); }
    if (killer.streak >= 2) g.events.push({ e: 'streak', by: killer.id, name: killer.name, n: killer.streak });
    if (killer.nemesis === victim.id) { killer.nemesis = null; g.events.push({ e: 'revenge', by: killer.id, name: victim.name }); }
    victim.nemesis = killer.id;
  } else g.events.push({ e: 'crash', id: victim.id, name: victim.name, cause, ...at });
  // en duel, celui qui s'écrase offre la manche à l'autre
  if (g.duel && (victim.id === g.duel.a || victim.id === g.duel.b)) {
    const other = g.planes.find((q) => q.id === (victim.id === g.duel.a ? g.duel.b : g.duel.a));
    if (!scored && cause !== 'collision' && other && other.alive) other.kills++;
    if (!g.duel.pause) { g.duel.pause = DUEL_PAUSE; g.duel.loser = victim.id; g.events.push({ e: 'roundEnd', loser: victim.id, by: other && other.alive ? other.id : null, byName: other && other.alive ? other.name : null, n: g.duel.round }); if (other && other.alive) other.inv = DUEL_PAUSE + 1; }
    victim.respawn = 0;
    if (other && other.kills >= g.settings.target) finish(g);
    return;
  }
  if (g.cargo && g.ph === 'play' && !g.planes.some((q) => q.team === 2 && !isCargo(q) && !q.out)) { g.why = 'wiped'; finish(g); return; }
  if (scored) {
    const reached = mode === 'escorte' ? false : mode === 'domination' ? g.tk[killer.team] >= g.settings.target : killer.team ? g.tk[killer.team] >= g.settings.target : killer.kills >= g.settings.target;
    if (reached) finish(g);
  }
}

function finish(g) {
  if (g.ph === 'over') return;
  g.ph = 'over'; g.t = 0; g.rev++;
  const mode = g.settings.mode;
  if (mode === 'escorte') {
    g.winTeam = g.planes.some((p) => p.type === 'cargo' && p.alive) ? 1 : 2;
    g.winner = null;
  } else if (isTeamMode(mode)) {
    g.winTeam = g.tk[1] > g.tk[2] ? 1 : g.tk[2] > g.tk[1] ? 2 : 0;
    g.winner = null;
  } else {
    // personne n'a marqué, ou égalité parfaite : match nul
    const r = ranking(g), best = r[0], second = r[1];
    g.winner = best && best.kills > 0 && !(second && second.kills === best.kills && second.deaths === best.deaths && second.helps === best.helps) ? best.id : null;
  }
  g.events.push({ e: 'over', winner: g.winner, winTeam: g.winTeam });
}

export function ranking(g) {
  const score = (p) => (isTeamMode(g.settings.mode) && p.team === g.winTeam ? 1000 : 0) + p.kills * 10 + (p.helps || 0) * 3 - p.deaths * 0.01;
  return g.planes.filter((p) => p.type !== 'cargo').sort((a, b) => score(b) - score(a));
}

// On réapparaît près de l'action : à un bon kilomètre du gros des avions, tourné vers eux
function respawnPose(g, p, world) {
  let cx = 0, cz = 0, n = 0;
  for (const q of g.planes) if (q.alive && q !== p && q.type !== 'cargo' && (!p.team || q.team !== p.team)) { cx += q.x; cz += q.z; n++; }
  if (!n) { cx = CENTER; cz = CENTER; } else { cx /= n; cz /= n; }
  const a = Math.random() * Math.PI * 2, r = 1000 + Math.random() * 500;
  let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
  const lim = ZONE_WARN - 900;
  x = Math.max(ZONE.x - lim, Math.min(ZONE.x + lim, x)); z = Math.max(ZONE.z - lim, Math.min(ZONE.z + lim, z));
  const hx = cx - x, hz = cz - z, hn = Math.hypot(hx, hz) || 1;
  return { x, z, y: Math.max(safeY(world, x, z, hx / hn, hz / hn), 260 + Math.random() * 90), heading: Math.atan2(hx, hz) };
}

function respawn(g, p, world) {
  const pose = g.cargo && world ? escortPose(g, p, world, Math.floor(Math.random() * 4), false) : respawnPose(g, p, world);
  Object.assign(p, createFlight({ ...pose, type: p.type }), repaired(p), { alive: true, inv: INVULNERABLE_TIME, killedBy: null, deathCause: null });
  g.rev++;
  g.events.push({ e: 'respawn', id: p.id });
}

function damage(g, victim, by, dmg, zone, world) {
  if (!victim.alive || victim.inv > 0) return;
  victim.health -= dmg * (ZONE_MULT[zone] || 1);
  victim.lastHitBy = by; victim.lastHitT = g.clock;
  const h = victim.dmgBy[by] || (victim.dmgBy[by] = { d: 0, t: 0 }); h.d += dmg; h.t = g.clock;
  if (victim.type === 'cargo') {
    const q = g.planes.find((x) => x.id === by); if (q) q.cdmg += dmg;
    if (victim.health <= 0) { victim.health = 0; kill(g, victim, q, 'tir', world); }
    return;
  }
  if (zone === 'E') victim.dE = Math.min(1, victim.dE + dmg * ZONE_WEAR);
  else if (zone === 'T') victim.dT = Math.min(1, victim.dT + dmg * ZONE_WEAR);
  else if (zone === 'L') victim.dL = Math.min(1, victim.dL + dmg * ZONE_WEAR);
  else if (zone === 'R') victim.dR = Math.min(1, victim.dR + dmg * ZONE_WEAR);
  if (victim.health <= 0) { victim.health = 0; kill(g, victim, g.planes.find((q) => q.id === by), 'tir', world); }
}

export function stepGame(g, dt, world) {
  g.clock += dt;
  if (g.ph === 'hangar' || g.ph === 'over') {
    if (g.ph === 'over') {
      g.t += dt;
      // posé, le transport roule jusqu'à l'arrêt pendant l'écran de fin
      const c = g.cargo && g.cargo.landed && world ? g.planes.find(isCargo) : null;
      if (c && c.alive) stepCargo(c, g.cargo, dt, world);
    }
    return;
  }
  if (g.ph === 'countdown') {
    g.t -= dt;
    // pendant le décompte, chacun garde son cap, ailes à plat
    for (const p of g.planes) { if (!p.alive) continue; if (p.type === 'cargo') { if (world) stepCargo(p, g.cargo, dt, world); continue; } const n = Math.hypot(p.fx, p.fz) || 1; stepFlight(p, { ax: p.fx / n, ay: 0, az: p.fz / n }, dt); }
    if (g.t <= 0) { g.ph = 'play'; g.rev++; g.events.push({ e: 'start' }); for (const p of g.planes) p.inv = Math.min(p.inv, INVULNERABLE_TIME); }
    return;
  }

  // en Escorte, le chrono est le temps qu'il reste au transport avant de se poser
  if (g.cargo && world) g.left = cargoLeft(g.cargo, world);
  else { g.left -= dt; if (g.left <= 0) { g.left = 0; g.why = 'time'; finish(g); return; } }
  if (g.duel) {
    if (g.duel.pause > 0) { g.duel.pause -= dt; if (g.duel.pause <= 0) nextRound(g, world); }
    else { g.duel.t -= dt; if (g.duel.t <= 0) { endRoundOnTime(g); if (g.ph !== 'play') return; } }
  }

  for (const p of g.planes) {
    if (!p.alive) { if (!g.duel && !p.out) { p.respawn -= dt; if (p.respawn <= 0) respawn(g, p, world); } continue; }
    if (p.inv > 0) p.inv -= dt;
    if (p.msCd > 0) p.msCd = Math.max(0, p.msCd - dt);
    if (p.flCd > 0) p.flCd = Math.max(0, p.flCd - dt);
    if (p.abCd > 0) p.abCd = Math.max(0, p.abCd - dt);
    if (p.abT > 0) p.abT = Math.max(0, p.abT - dt);
    if (p.flT > 0) p.flT -= dt;
    if (p.type === 'cargo') {
      if (world && stepCargo(p, g.cargo, dt, world) && !g.cargo.landed) { g.cargo.landed = true; g.why = 'landed'; g.events.push({ e: 'landed' }); finish(g); return; }
      continue;
    }
    if (p.bot) p.inp = botInput(p, g, world, dt);
    stepFlight(p, p.inp, dt);
    // sol, mer ou toit : crash (le point va à celui qui l'a touché juste avant)
    if (world && p.y <= world.obstacleAt(p.x, p.z) + 2.5) {
      const hitter = p.lastHitBy !== null && g.clock - p.lastHitT < ASSIST_TIME ? g.planes.find((q) => q.id === p.lastHitBy) : null;
      kill(g, p, hitter, hitter ? 'force' : (world.groundAt(p.x, p.z) < 0.5 ? 'mer' : 'sol'), world);
      if (g.ph === 'over') return;
      continue;
    }
  }

  // collisions entre avions
  for (let i = 0; i < g.planes.length; i++) for (let j = i + 1; j < g.planes.length; j++) {
    const a = g.planes[i], b = g.planes[j];
    if (!a.alive || !b.alive || a.inv > 0 || b.inv > 0) continue;
    const big = a.type === 'cargo' || b.type === 'cargo', r2 = big ? 144 : 16;
    if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 >= r2) continue;
    // contre le transport, seul le chasseur y laisse ses ailes
    if (big) { const c = a.type === 'cargo' ? a : b, f = c === a ? b : a; kill(g, f, null, 'collision', world); c.health = Math.max(1, c.health - 40); }
    else { kill(g, a, null, 'collision', world); kill(g, b, null, 'collision', world); }
    if (g.ph !== 'play') return;
  }
  if (g.zones) {
    stepZones(g, dt, world, (team) => { g.tk[team]++; if (g.tk[team] >= g.settings.target) finish(g); });
    if (g.ph !== 'play') return;
  }

  for (const p of g.planes) {
    if (!p.alive) { p.firing = false; continue; }
    // le transport lâche ses leurres tout seul quand un missile approche
    if (p.type === 'cargo') { if (p.warn && p.flCd <= 0 && g.missiles.some((m) => m.target === p.id && (m.x - p.x) ** 2 + (m.y - p.y) ** 2 + (m.z - p.z) ** 2 < 640000)) dropFlares(g, p); continue; }
    stepLock(p, g.planes, world, dt);
    if (p.inp.ab) useAbility(p, g, world);
    stepGun(p, p.inp.fire && g.ph === 'play' && !(p.cob > 0), dt, g.bullets, g.events);
    if (p.inp.msl) launchMissile(p, g.missiles, g.events);
    if (p.inp.flare && p.flCd <= 0) dropFlares(g, p);
    if (!p.bot) { p.inp.msl = false; p.inp.flare = false; p.inp.ab = false; }
    if (g.ph !== 'play') return;
  }

  stepBullets(g.bullets, g.planes, world, dt, (t, zone, b, at) => {
    g.events.push({ e: 'hit', by: b.by, id: t.id, zone, x: Math.round(at.x), y: Math.round(at.y), z: Math.round(at.z) });
    const shooter = g.planes.find((q) => q.id === b.by); if (shooter) shooter.hits++;
    damage(g, t, b.by, b.dmg, zone, world);
  }, g.events);
  stepMissiles(g.missiles, g.planes, world, dt, (t, m) => {
    g.events.push({ e: 'hit', by: m.by, id: t.id, zone: 'C', msl: 1, x: Math.round(t.x), y: Math.round(t.y), z: Math.round(t.z) });
    const shooter = g.planes.find((q) => q.id === m.by); if (shooter) shooter.mhits++;
    if (t.type !== 'cargo') for (const z of ['E', 'T', 'L', 'R']) if (Math.random() < 0.5) damage(g, t, m.by, 0, z, world), t['d' + z] = Math.min(1, t['d' + z] + 0.35);
    damage(g, t, m.by, MISSILE_DAMAGE, 'C', world);
  }, g.events);
}

function dropFlares(g, p) {
  p.flCd = FLARE_COOLDOWN; p.flT = FLARE_TIME;
  g.events.push({ e: 'flare', id: p.id, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });
}

export function drainEvents(g) { const e = g.events; g.events = []; return e; }

// ---------------------------------------------------------------- réseau
const q4 = (v) => Math.round(v * 1e4);
const d1 = (v) => Math.round(v * 10) / 10;

// Ligne compacte d'un avion, envoyée vingt fois par seconde
// recharges en dixièmes de seconde ; pendant un Cobra, de quoi le rejouer chez l'invité
export function snapRows(g) {
  return g.planes.map((p) => {
    const r = [p.id, d1(p.x), d1(p.y), d1(p.z), q4(p.qx), q4(p.qy), q4(p.qz), q4(p.qw), d1(p.speed), Math.round(p.health), flagsOf(p), p.ack, Math.round(p.ab * 100), Math.round(p.heat * 100), Math.round(p.lockT * 100), p.lockId, Math.round(p.load), Math.round(p.wp * 100), Math.round(p.wr * 100), Math.round(p.wy * 100),
      Math.ceil(p.msCd * 10), Math.ceil(p.flCd * 10), Math.ceil(p.abCd * 10), Math.ceil(p.abT * 10)];
    if (p.cob > 0) r.push(Math.round(p.cob * 1000), q4(p.cqx), q4(p.cqy), q4(p.cqz), q4(p.cqw), q4(p.cvx), q4(p.cvy), q4(p.cvz), d1(p.cv));
    return r;
  });
}
const flagsOf = (p) => (p.alive ? 1 : 0) | (p.boosting ? 2 : 0) | (p.braking ? 4 : 0) | (p.firing ? 8 : 0) | (p.over ? 16 : 0) | (p.warn ? 32 : 0) | (p.inv > 0 ? 64 : 0) | (p.abOut ? 128 : 0);

export function applyRow(p, r) {
  p.x = r[1]; p.y = r[2]; p.z = r[3]; p.qx = r[4] / 1e4; p.qy = r[5] / 1e4; p.qz = r[6] / 1e4; p.qw = r[7] / 1e4; p.speed = r[8]; p.health = r[9];
  const f = r[10]; p.alive = !!(f & 1); p.boosting = !!(f & 2); p.braking = !!(f & 4); p.firing = !!(f & 8); p.over = !!(f & 16); p.warn = !!(f & 32); p.inv = f & 64 ? 1 : 0; p.abOut = !!(f & 128);
  p.ack = r[11]; p.ab = r[12] / 100; p.heat = r[13] / 100; p.lockT = r[14] / 100; p.lockId = r[15]; p.load = r[16]; p.wp = (r[17] || 0) / 100; p.wr = (r[18] || 0) / 100; p.wy = (r[19] || 0) / 100;
  p.msCd = (r[20] || 0) / 10; p.flCd = (r[21] || 0) / 10; p.abCd = (r[22] || 0) / 10; p.abT = (r[23] || 0) / 10;
  if (r.length > 24) { p.cob = r[24] / 1000; p.cqx = r[25] / 1e4; p.cqy = r[26] / 1e4; p.cqz = r[27] / 1e4; p.cqw = r[28] / 1e4; p.cvx = r[29] / 1e4; p.cvy = r[30] / 1e4; p.cvz = r[31] / 1e4; p.cv = r[32]; } else p.cob = 0;
  const n = 1 / (Math.hypot(p.qx, p.qy, p.qz, p.qw) || 1); p.qx *= n; p.qy *= n; p.qz *= n; p.qw *= n;
  return computeAxes(p);
}

// Missiles en vol
export const snapZones = (g) => (g.zones ? g.zones.map((z) => Math.round(z.cap * 100)) : null);
export const snapMissiles = (g) => g.missiles.map((m) => [m.key, d1(m.x), d1(m.y), d1(m.z), m.target]);

// L'état lent : ce qui change rarement, envoyé à chaque changement et une fois par seconde
export function worldOf(g) {
  return {
    settings: g.settings, ph: g.ph, t: d1(g.t), left: d1(g.left), clock: d1(g.clock), tk: g.tk, winner: g.winner, winTeam: g.winTeam, rev: g.rev, why: g.why || null,
    zones: g.zones, duel: g.duel, cargo: g.cargo, first: !!g.first,
    pl: g.planes.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, lvl: p.lvl, team: p.team, type: p.type, model: p.model || null, lives: p.lives, abUses: p.abUses || 0, kills: p.kills, deaths: p.deaths, respawn: d1(p.respawn), maxHp: p.maxHp, dE: d1(p.dE), dL: d1(p.dL), dR: d1(p.dR), dT: d1(p.dT), killedBy: p.killedBy || null, deathCause: p.deathCause || null, ready: !!p.ready, out: !!p.out, helps: p.helps, st: [p.shots, p.hits, p.mhits, p.best, Math.round(p.zt), Math.round(p.cdmg)] })),
  };
}

// Reprise par un nouvel hôte à partir du dernier état reçu
export function restoreGame(w, rows, world) {
  const g = { settings: w.settings, ph: w.ph, t: w.t, left: w.left, clock: w.clock, tk: w.tk, winner: w.winner, winTeam: w.winTeam, rev: (w.rev || 1) + 1, why: w.why || null, planes: [], bullets: [], missiles: [], events: [], zones: w.zones || null, duel: w.duel || null, cargo: w.cargo || null, first: !!w.first };
  const byId = new Map((rows || []).map((r) => [r[0], r]));
  w.pl.forEach((s, i) => {
    const p = makePlane(s, i, w.pl.length, world, g.settings);
    p.team = s.team; p.kills = s.kills; p.deaths = s.deaths; p.respawn = s.respawn; p.maxHp = s.maxHp; p.lives = s.lives || 0; p.model = s.model || undefined; p.abUses = s.abUses || 0; p.dE = s.dE; p.dL = s.dL; p.dR = s.dR; p.dT = s.dT; p.ready = s.ready; p.out = !!s.out; p.helps = s.helps || 0;
    if (s.st) { p.shots = s.st[0]; p.hits = s.st[1]; p.mhits = s.st[2]; p.best = s.st[3]; p.zt = s.st[4]; p.cdmg = s.st[5]; }
    if (s.type === 'cargo') p.hitR = CARGO_RADIUS;
    const r = byId.get(s.id);
    if (r) { applyRow(p, r); p.ack = 0; p.firing = false; }
    g.planes.push(p);
  });
  return g;
}
