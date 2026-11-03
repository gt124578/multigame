// Tests du moteur de Dogfight 3D : node tools/test-dogfight.mjs
import { generateMap, ILE } from '../royale/engine/map.js';
import { createFlight, stepFlight, computeAxes, bankOf, keyRamp, keyCurve, KEY_ATTACK, TYPES, TYPE_IDS, ZONE_MAX, CENTER, CEILING } from '../dogfight/engine/flight.js';
import { computeLead, BULLET_SPEED, BULLET_GRAVITY, FIRE_RATE, stepGun, hitZone } from '../dogfight/engine/weapons.js';
import { createWorld } from '../dogfight/engine/world.js';
import { createGame, startCountdown, stepGame, drainEvents, DT, snapRows, worldOf, restoreGame, replaceByBot, applyRow, ranking, addPlayer } from '../dogfight/engine/rules.js';
import { botInput, LEVELS } from '../dogfight/engine/ai.js';
import { ZONE_CEIL, CAPTURE_TIME, KILL_POINTS, ROUND_TIME, routeAt } from '../dogfight/engine/modes.js';

let passed = 0;
function assert(c, msg) { if (!c) { console.error(`ÉCHEC : ${msg}`); process.exit(1); } passed++; }
const run = (s, inp, sec) => { for (let t = 0; t < sec; t += DT) stepFlight(s, inp, DT); return s; };
const deg = (r) => r * 180 / Math.PI;

const map = generateMap(ILE), world = createWorld(map);

// ----- 1. Vol
{
  const s = createFlight({ x: 0, y: 500, z: 0, heading: 0.5 });
  assert(Math.abs(s.fx - Math.sin(0.5)) < 1e-6 && Math.abs(s.fz - Math.cos(0.5)) < 1e-6, 'le cap donne la direction du nez');
  assert(s.uy > 0.99 && Math.abs(s.lx - Math.cos(0.5)) < 1e-6, 'avion à plat, aile gauche à gauche');
  // vol droit : ni virage ni perte d'altitude sans commande
  const a = createFlight({ x: 800, y: 500, z: 800 });
  run(a, { ax: a.fx, ay: a.fy, az: a.fz }, 5);
  assert(Math.abs(a.y - 500) < 1 && Math.abs(a.x - 800) < 1, 'lâcher les commandes : l\'avion file tout droit');
  // looping complet : le nez passe par la verticale et l'avion revient à plat
  const l = createFlight({ x: 800, y: 500, z: 800 });
  l.speed = 200;
  let up = false, inverted = false;
  for (let t = 0; t < 8 && !(inverted && l.fy < 0.05 && l.uy > 0.5 && up); t += DT) { stepFlight(l, { p: 1, boost: true }, DT); if (l.fy > 0.95) up = true; if (l.uy < -0.9) inverted = true; }
  assert(up && inverted, 'looping : l\'avion passe à la verticale puis sur le dos');
  // tonneau : roulis libre, 360° complets
  const r = createFlight({ x: 800, y: 500, z: 800 });
  let total = 0, prev = bankOf(r);
  for (let t = 0; t < 2.5; t += DT) { stepFlight(r, { r: 1, free: true }, DT); const b = bankOf(r); let d = b - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; total += d; prev = b; }
  assert(total > 2 * Math.PI, 'tonneau : plus d\'un tour complet en roulis libre');
  assert(Math.abs(bankOf((() => { const c = createFlight({ x: 800, y: 500, z: 800 }); run(c, { r: 0.0001 }, 0); stepFlight(c, { r: 1 }, DT); return c; })())) > 0, 'une commande de roulis incline l\'avion');
  // sens : commande à droite → aile droite basse, nez vers la droite du pilote
  const d = createFlight({ x: 800, y: 500, z: 800 });
  run(d, { r: 1 }, 1);
  assert(bankOf(d) > 0.5 && d.fx < 0, 'virage à droite : aile droite basse et nez vers la droite du pilote (−X)');
  assert(deg(Math.abs(bankOf(d))) < 92, 'virage coordonné : inclinaison limitée vers 80°');
  // énergie : monter coûte de la vitesse, et la postcombustion ne dure pas
  const e = createFlight({ x: 800, y: 300, z: 800 }), v0 = e.speed;
  run(e, { p: 1 }, 0.8);
  const steep = e.fy;
  assert(steep > 0.7 && e.speed < v0, `monter fait perdre de la vitesse (${v0} → ${e.speed.toFixed(0)})`);
  const b = createFlight({ x: 800, y: 500, z: 800 });
  run(b, { boost: true }, 3);
  assert(b.speed > TYPES.f16.cruise + 40, 'la postcombustion accélère');
  run(b, { boost: true }, 8);
  assert(b.abOut && !b.boosting, 'la postcombustion se vide au bout de 9 s');
  // instructeur : amène le nez sur un point à 120° de l'axe, ailes à plat à la fin
  const m = createFlight({ x: 800, y: 500, z: 800 });
  const aim = { ax: Math.sin(2.1), ay: 0, az: Math.cos(2.1) };
  run(m, aim, 6);
  assert(m.fx * aim.ax + m.fz * aim.az > 0.98 && Math.abs(bankOf(m)) < 0.2, `instructeur : aligné sur le point visé, ailes à plat (banque ${deg(bankOf(m)).toFixed(0)}°)`);
  // limite de zone : ramené vers l'île
  const z = createFlight({ x: CENTER + ZONE_MAX + 50, y: 400, z: CENTER, heading: Math.PI / 2 });
  run(z, { boost: true }, 12);
  assert(Math.hypot(z.x - CENTER, z.z - CENTER) < ZONE_MAX, 'hors zone : l\'instructeur ramène l\'avion');
  const c = createFlight({ x: 800, y: CEILING + 80, z: 800 });
  run(c, { p: 1 }, 6);
  assert(c.y < CEILING + 90, 'plafond : l\'avion ne monte pas indéfiniment');
  // dégâts : la dérive touchée réduit le tangage
  const h = createFlight({ x: 800, y: 500, z: 800 }), h2 = createFlight({ x: 800, y: 500, z: 800 }); h2.dT = 1;
  run(h, { p: 1 }, 0.4); run(h2, { p: 1 }, 0.4);
  assert(h.fy > h2.fy, 'dérive touchée : l\'avion tire moins fort');
  console.log('✓ Vol : looping, tonneau, énergie, instructeur, limites, dégâts');
}

// ----- 1 bis. Douceur des commandes
{
  // une touche maintenue `hold` secondes, puis lâchée : angle parcouru, plus gros à-coup d'une image à l'autre
  const press = (axis, hold, after = 1, attack = KEY_ATTACK.pitch) => {
    const s = createFlight({ x: 800, y: 600, z: 800 }), aim = { ax: s.fx, ay: s.fy, az: s.fz };
    let stick = 0, prev = 0, jerk = 0, angle = 0, stopT = null;
    for (let t = 0; t < hold + after; t += DT) {
      stick = keyRamp(stick, t < hold ? 1 : 0, DT, attack);
      if (stick !== 0) { aim.ax = s.fx; aim.ay = s.fy; aim.az = s.fz; }   // comme en jeu : le point visé suit le nez pendant l'appui
      const a = { qx: s.qx, qy: s.qy, qz: s.qz, qw: s.qw };
      stepFlight(s, { p: 0, r: 0, y: 0, ...aim, [axis]: keyCurve(stick) }, DT);
      const rate = deg(2 * Math.acos(Math.min(1, Math.abs(a.qx * s.qx + a.qy * s.qy + a.qz * s.qz + a.qw * s.qw)))) / DT;
      jerk = Math.max(jerk, Math.abs(rate - prev)); prev = rate;
      if (t < hold) angle += rate * DT;
      if (t >= hold && stopT === null && rate < 8) stopT = t - hold;
    }
    return { jerk, angle, stopT, s };
  };
  const tap = press('p', 0.1), hold = press('p', 1), rollHold = press('r', 1, 1, KEY_ATTACK.roll), rollTap = press('r', 0.1, 1, KEY_ATTACK.roll);
  assert(tap.angle < 3, `une tape de 100 ms ne bouge le nez que de quelques degrés (${tap.angle.toFixed(1)}°)`);
  assert(rollTap.angle < 6, `une tape de 100 ms n'incline que de quelques degrés (${rollTap.angle.toFixed(1)}°)`);
  assert(hold.angle > 45, `un appui d'une seconde tire franchement (${hold.angle.toFixed(0)}°)`);
  assert(hold.jerk < 8 && rollHold.jerk < 14, `pas d'à-coup d'une image à l'autre (${hold.jerk.toFixed(1)} et ${rollHold.jerk.toFixed(1)} °/s)`);
  assert(hold.stopT !== null && hold.stopT < 0.7, `l'avion se calme après le relâchement (${hold.stopT} s)`);
  assert(keyRamp(0.5, -1, DT, KEY_ATTACK.roll) < 0.5 && keyRamp(0.001, 0, DT, KEY_ATTACK.roll) === 0, 'manche virtuel : il revient par zéro et s\'y arrête');
  // le point visé tenu fixe : pas d'oscillation une fois arrivé
  const w = createFlight({ x: 800, y: 600, z: 800 }), c = 25 / 57.3, a = { ax: Math.sin(c), ay: 0.05, az: Math.cos(c) };
  run(w, a, 2);
  let flips = 0, last = 0, wander = 0;
  for (let t = 0; t < 2; t += DT) { stepFlight(w, a, DT); if (Math.abs(w.wp) > 0.02 && Math.sign(w.wp) !== Math.sign(last)) flips++; if (Math.abs(w.wp) > 0.02) last = w.wp; wander = Math.max(wander, Math.acos(Math.min(1, (w.fx * a.ax + w.fy * a.ay + w.fz * a.az) / Math.hypot(a.ax, a.ay, a.az)))); }
  assert(flips <= 1 && deg(wander) < 1.5, `visée stable, sans oscillation (${flips} inversions, ${deg(wander).toFixed(2)}°)`);
  console.log(`✓ Douceur : tape ${tap.angle.toFixed(1)}°, à-coup max ${rollHold.jerk.toFixed(1)} °/s, calme en ${hold.stopT.toFixed(2)} s`);
}

// ----- 2. Armes
{
  // la cadence ne dépend pas de la taille du pas
  const count = (dt) => { const p = Object.assign(createFlight({ x: 800, y: 500, z: 800 }), { id: 1, team: 0, heat: 0, over: false, overT: 0, fireAcc: 0, firing: false }); const list = []; for (let t = 0; t < 1; t += dt) { p.heat = 0; stepGun(p, true, dt, list, []); } return list.length; };
  assert(Math.abs(count(1 / 30) - FIRE_RATE) <= 1 && Math.abs(count(1 / 60) - FIRE_RATE) <= 1 && Math.abs(count(1 / 144) - FIRE_RATE) <= 1, 'cadence de 25 tirs/s à 30, 60 et 144 pas/s');
  // le point d'anticipation fait vraiment toucher : balle tirée vers le point rendu, avec la vitesse du tireur
  for (const [svz, tvx, tz] of [[125, 125, 500], [210, -125, 300], [125, 200, 700], [65, 90, 450]]) {
    const l = computeLead(0, 500, 0, 0, 0, svz, 0, 500, tz, tvx, 0, 0);
    const n = Math.hypot(l.x, l.y - 500, l.z), dv = { x: l.x / n * BULLET_SPEED, y: (l.y - 500) / n * BULLET_SPEED, z: l.z / n * BULLET_SPEED + svz };
    let bx = 0, by = 500, bz = 0, bvy = dv.y, tx = 0, miss = 1e9;
    for (let t = 0; t < 1.6; t += 1 / 240) { bvy -= BULLET_GRAVITY / 240; bx += dv.x / 240; by += bvy / 240; bz += dv.z / 240; tx += tvx / 240; miss = Math.min(miss, Math.hypot(bx - tx, by - 500, bz - tz)); }
    assert(miss < 3, `anticipation : écart de ${miss.toFixed(1)} m à ${tz} m (rayon de touche 4 m)`);
  }
  const p = createFlight({ x: 0, y: 0, z: 0 });
  assert(hitZone(p, 4, 0, 0) === 'L' && hitZone(p, -4, 0, 0) === 'R' && hitZone(p, 0, 0, -6) === 'E' && hitZone(p, 0, 2, -6) === 'T' && hitZone(p, 0, 0, 3) === 'C', 'zones d\'impact');
  console.log('✓ Armes : cadence stable, anticipation, zones d\'impact');
}

// ----- 3. Le monde
{
  assert(world.groundAt(742, 588) > 90, 'le Pic du Vent est là');
  assert(world.groundAt(-500, 100) === 0 && world.obstacleAt(5000, 5000) === 0, 'hors de l\'île, c\'est plat');
  const b = map.buildings[0], cx = (b.x0 + b.w / 2) * 4, cz = (b.z0 + b.d / 2) * 4;
  assert(world.obstacleAt(cx, cz) > world.groundAt(cx, cz) + 2, 'les toits comptent comme obstacle');
  const c = world.clouds[0];
  assert(world.inCloud(c.x, 475, c.z) && !world.inCloud(c.x, 300, c.z), 'on sait si un avion est dans un nuage');
  console.log('✓ Monde : relief, toits, nuages');
}

// ----- 4. Parties entre bots
const players = (n, lvl, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, bot: true, lvl, ...extra }));
function play(n, lvl, sec, settings = {}) {
  const g = createGame({ settings: { kills: 500, time: sec + 10, level: lvl, ...settings }, players: players(n, lvl), world });
  startCountdown(g, world);
  const stats = { shots: 0, hits: 0, crashes: 0, kills: 0, ceil: 0, n: 0, maxD: 0 };
  while (g.left > 10 && g.ph !== 'over') {
    stepGame(g, DT, world);
    for (const e of drainEvents(g)) { if (e.e === 'hit') stats.hits++; if (e.e === 'crash') stats.crashes++; if (e.e === 'kill') stats.kills++; }
    for (const p of g.planes) if (p.alive) { stats.n++; if (p.y > 1100) stats.ceil++; stats.maxD = Math.max(stats.maxD, Math.hypot(p.x - CENTER, p.z - CENTER)); if (p.firing) stats.shots++; }
  }
  return { g, stats };
}
{
  const res = {};
  for (const lvl of ['facile', 'normal', 'expert']) { res[lvl] = play(4, lvl, 240).stats; const s = res[lvl], more = play(4, lvl, 240).stats; s.kills2 = s.kills + more.kills; console.log(`  ${lvl} : ${s.kills} élim., ${s.crashes} crashs, ${s.shots} images de tir, ${s.hits} touches en 4 min`); assert(s.shots > 100, `${lvl} : les bots tirent`); assert(s.ceil / s.n < 0.02, `${lvl} : les bots ne restent pas au plafond`); assert(s.crashes <= 6, `${lvl} : les bots se crashent peu (${s.crashes})`); assert(s.maxD < ZONE_MAX + 200, `${lvl} : les bots restent dans la zone`); }
  assert(res.expert.kills2 > res.facile.kills2 * 1.3, `les niveaux se distinguent (facile ${res.facile.kills2} élim., expert ${res.expert.kills2} en deux parties)`);
  // contre une cible qui vole droit, sur plusieurs départs : le niveau change le temps pour l'abattre
  const duel = (lvl) => {
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const g = createGame({ settings: { kills: 1, time: 90, level: lvl }, players: [{ id: 'b', name: 'B', bot: true, lvl }, { id: 'h', name: 'H' }], world });
      startCountdown(g, world);
      for (let i = 0; i < 190; i++) stepGame(g, DT, world);
      const h = g.planes[1], an = k * 1.05; h.x = 800 + Math.cos(an) * 500; h.z = 800 + Math.sin(an) * 500; h.y = 300;
      let t = 0; h.inv = 0;
      while (g.ph === 'play' && h.deaths === 0 && t < 80) { const n = Math.hypot(800 - h.x, 800 - h.z) || 1; h.inp = { p: 0, r: 0, y: 0, ax: (800 - h.x) / n * (n > 900 ? 1 : 0) + (n > 900 ? 0 : h.fx), ay: 0, az: (800 - h.z) / n * (n > 900 ? 1 : 0) + (n > 900 ? 0 : h.fz) }; stepGame(g, DT, world); drainEvents(g); t += DT; }
      total += t;
    }
    return total / 6;
  };
  const tf = duel('facile'), te = duel('expert');
  console.log(`  cible en ligne droite abattue en ${tf.toFixed(0)} s (facile), ${te.toFixed(0)} s (expert)`);
  assert(te < tf * 0.75 && te < 25, 'un bot expert abat vite une cible qui ne manœuvre pas, un facile beaucoup moins');
  console.log('✓ IA : combat, niveaux, évitement');
}

// ----- 5. Règles
{
  const g = createGame({ settings: { kills: 1, time: 100 }, players: [{ id: 0, name: 'Hôte' }, { id: 'b1', name: 'B', bot: true, lvl: 'normal' }], world });
  assert(g.planes[0].id === 0, 'l\'id 0 de l\'hôte reste 0');
  assert(g.ph === 'hangar', 'on commence au hangar');
  stepGame(g, 5, world);
  assert(g.ph === 'hangar', 'le hangar attend');
  startCountdown(g, world);
  const h = g.planes[0];
  const toC = Math.hypot(CENTER - h.x, CENTER - h.z), dot = (h.fx * (CENTER - h.x) + h.fz * (CENTER - h.z)) / toC;
  assert(dot > 0.99, 'on apparaît face à l\'île');
  for (let i = 0; i < 200; i++) stepGame(g, DT, world);
  assert(g.ph === 'play', 'le décompte se termine');
  // un crash ne donne pas de point ; une partie sans élimination est nulle
  const n = createGame({ settings: { kills: 3, time: 1 }, players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], world });
  startCountdown(n, world); for (let i = 0; i < 300; i++) stepGame(n, DT, world);
  assert(n.ph === 'over' && n.winner === null, 'temps écoulé sans élimination : match nul');
  // crash : l'avion au sol meurt, réapparaît, et personne ne marque
  const c = createGame({ settings: { kills: 3, time: 100 }, players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], world });
  startCountdown(c, world); for (let i = 0; i < 200; i++) stepGame(c, DT, world);
  c.planes[0].y = 1; c.planes[0].inv = 0; stepGame(c, DT, world);
  assert(!c.planes[0].alive && c.planes[0].deaths === 1 && c.planes[1].kills === 0, 'crash : une mort, aucun point');
  for (let i = 0; i < 300; i++) stepGame(c, DT, world);
  assert(c.planes[0].alive && c.planes[0].health === 100, 'réapparition, avion réparé');
  // un joueur qui part laisse un bot
  replaceByBot(c, 1); assert(c.planes[0].bot, 'joueur parti : un bot reprend l\'avion');
  // équipes : pas de tir ami, score d'équipe
  const t = createGame({ settings: { kills: 2, time: 100, mode: 'equipes' }, players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C', bot: true }, { id: 4, name: 'D', bot: true }], world });
  assert(t.planes.filter((p) => p.team === 1).length === 2 && t.planes.filter((p) => p.team === 2).length === 2, 'équipes équilibrées');
  addPlayer(t, { id: 5, name: 'E' }, world); assert(t.planes[4].team === 1, 'l\'arrivant rejoint la plus petite équipe');
  // missile : la cible sans leurre est touchée, F-22 plus long à accrocher
  console.log('✓ Règles : phases, spawn, crash, match nul, équipes, départ');
}

// ----- 6. Réseau
{
  const g = createGame({ settings: { kills: 8, time: 100 }, players: [{ id: 0, name: 'H' }, { id: 7, name: 'I' }, { id: 'b', name: 'B', bot: true, lvl: 'normal' }], world });
  startCountdown(g, world); for (let i = 0; i < 400; i++) stepGame(g, DT, world);
  const rows = snapRows(g), w = worldOf(g);
  const size = JSON.stringify(rows).length;
  assert(size < 500, `instantané de 3 avions compact (${size} o)`);
  const copy = applyRow({ ...g.planes[2] }, rows[2]);
  assert(Math.abs(copy.wr - g.planes[2].wr) < 0.01 && Math.abs(copy.wp - g.planes[2].wp) < 0.01, 'réseau : l\'inertie de l\'avion voyage avec l\'instantané');
  assert(Math.hypot(copy.x - g.planes[2].x, copy.y - g.planes[2].y) < 0.2 && copy.fx * g.planes[2].fx + copy.fy * g.planes[2].fy + copy.fz * g.planes[2].fz > 0.999, 'une ligne reconstruit l\'avion');
  // le nouvel hôte reprend depuis du JSON (plus aucune méthode), et la boucle continue
  const r = restoreGame(JSON.parse(JSON.stringify(w)), JSON.parse(JSON.stringify(rows)), world);
  assert(r.planes.length === 3 && r.planes[1].id === 7, 'reprise : mêmes joueurs');
  replaceByBot(r, 0);
  for (let i = 0; i < 300; i++) stepGame(r, DT, world);
  assert(r.left < w.left && r.planes[0].bot, 'reprise : la partie continue, l\'ancien hôte est remplacé par un bot');
  // prédiction : rejouer les commandes sur une copie donne la même trajectoire
  const a = createFlight({ x: 800, y: 500, z: 800 }), b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 120; i++) { const inp = { p: i % 40 < 20 ? 1 : 0, r: i % 60 < 30 ? 1 : 0 }; stepFlight(a, inp, DT); stepFlight(b, inp, DT); }
  assert(a.x === b.x && a.qw === b.qw, 'prédiction : le vol est déterministe');
  console.log('✓ Réseau : instantané compact, reprise d\'hôte, prédiction');
}

// ---------------------------------------------------------------- modes et récompenses
{
  const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true, lvl: 'normal', type: 'f16' }));
  const start = (mode, n = 4, extra = {}) => { const g = createGame({ settings: { mode, kills: 8, time: 300, level: 'normal', ...extra }, players: roster(n), world }); startCountdown(g, world); g.t = 0; stepGame(g, DT, world); return g; };
  // abat `v` : l'avion touché juste avant s'écrase, le point revient au tireur
  const down = (g, v, by) => { v.inv = 0; if (by) { v.lastHitBy = by.id; v.lastHitT = g.clock; } else v.lastHitBy = null; v.y = -5; stepGame(g, DT, world); return drainEvents(g); };
  const parked = (g) => { for (const p of g.planes) { p.bot = false; p.inp = { p: 0, r: 0, y: 0, boost: false, brake: false, fire: false, msl: false, flare: false, free: false, lim: 1 }; } };
  const network = (g) => { const w = JSON.parse(JSON.stringify(worldOf(g))), r = JSON.parse(JSON.stringify(snapRows(g))); return restoreGame(w, r, world); };

  // Domination
  {
    const g = start('domination');
    assert(g.zones.length === 3 && new Set(g.zones.map((z) => z.name)).size === 3, 'domination : trois zones distinctes');
    for (const a of g.zones) for (const b of g.zones) if (a !== b) assert(Math.hypot(a.x - b.x, a.z - b.z) > 2 * a.r, 'domination : les zones ne se touchent pas');
    assert(g.settings.target === 240, 'domination : l\'objectif se compte en points');
    assert(g.planes[0].team !== g.planes[1].team, 'domination : se joue en équipes');
    parked(g);
    const z = g.zones[0], a = g.planes.find((p) => p.team === 1), far = () => { for (const p of g.planes) { p.x = 3000; p.z = 3000; p.y = 400; p.speed = 130; p.inv = 9; } };
    far(); a.x = z.x; a.z = z.z; a.y = z.y + ZONE_CEIL + 80;
    const hold = (sec) => { for (let i = 0; i < sec * 60 && g.ph === 'play'; i++) { const x = a.x, y = a.y, zz = a.z; stepGame(g, DT, world); a.x = x; a.y = y; a.z = zz; for (const p of g.planes) if (p !== a) { p.x = 3000; p.z = 3000; p.y = 400; } } drainEvents(g); };
    hold(2);
    assert(z.cap === 0, 'domination : trop haut, on ne capture pas');
    a.y = world.obstacleAt(a.x, a.z) + ZONE_CEIL - 40;
    hold(CAPTURE_TIME - 1);
    assert(z.own === 0 && z.cap > 0.5, 'domination : la capture prend du temps');
    const t0 = g.tk[1];
    hold(1.5);
    assert(z.own === 1, 'domination : la zone change de camp');
    hold(5);
    assert(g.tk[1] - t0 >= 4 && g.tk[1] - t0 <= 7, `domination : une zone rapporte un point par seconde (${g.tk[1] - t0})`);
    const before = g.tk[1], foe = g.planes.find((p) => p.team === 2);
    a.y = world.obstacleAt(a.x, a.z) + ZONE_CEIL - 40; down(g, foe, a);
    assert(g.tk[1] >= before + KILL_POINTS, 'domination : une élimination rapporte aussi');
    const r = network(g);
    assert(r.zones[0].own === 1 && r.zones[0].y === z.y, 'domination : un nouvel hôte reprend les zones');
    g.tk[1] = g.settings.target - 1; hold(1.2);
    assert(g.ph === 'over' && g.winTeam === 1, 'domination : l\'objectif atteint termine la partie');
  }

  // Duel
  {
    const g = start('duel');
    const [a, b, c, d] = g.planes;
    assert(g.duel.a === a.id && g.duel.b === b.id && g.duel.q.length === 2, 'duel : deux en piste, les autres attendent');
    assert(a.alive && b.alive && !c.alive && c.out && !d.alive, 'duel : les autres ne volent pas');
    assert(Math.hypot(a.x - b.x, a.z - b.z) > 1000, 'duel : on part de loin, face à face');
    let ev = down(g, b, a);
    assert(a.kills === 1 && ev.some((e) => e.e === 'roundEnd' && e.by === a.id), 'duel : la manche va au tireur');
    for (let i = 0; i < 2 * 60; i++) stepGame(g, DT, world);
    assert(!c.alive && !b.alive, 'duel : personne ne réapparaît avant la fin de la pause');
    ev = [];
    for (let i = 0; i < 2 * 60; i++) { stepGame(g, DT, world); ev.push(...drainEvents(g)); }
    assert(ev.some((e) => e.e === 'round' && e.n === 2), 'duel : la manche suivante démarre');
    assert(g.duel.a === a.id && g.duel.b === c.id && g.duel.q[g.duel.q.length - 1] === b.id, 'duel : le gagnant reste, le perdant passe derrière');
    assert(a.alive && c.alive && !b.alive && b.out, 'duel : les bons pilotes sont en piste');
    assert(a.health === a.maxHp, 'duel : le gagnant repart réparé');
    a.inv = 0; a.y = -5; stepGame(g, DT, world); drainEvents(g);
    assert(c.kills === 1, 'duel : s\'écraser donne la manche à l\'autre');
    const r = network(g);
    assert(r.duel && r.duel.a === g.duel.a && r.planes.find((p) => p.id === b.id).out, 'duel : un nouvel hôte reprend les manches');
    const h = start('duel', 2, { kills: 1 });
    down(h, h.planes[1], h.planes[0]);
    assert(h.ph === 'over' && h.winner === h.planes[0].id, 'duel : l\'objectif atteint désigne le gagnant');
    const tm = start('duel', 3);
    parked(tm);
    tm.planes[0].health = 40; tm.duel.t = 0.01;
    const before = [tm.planes[0].deaths, tm.planes[1].kills];
    stepGame(tm, DT, world); stepGame(tm, DT, world);
    const evT = drainEvents(tm);
    assert(tm.planes[1].kills === before[1] + 1 && !tm.planes[0].alive && tm.planes[0].deaths === before[0], 'duel : au temps, le moins abîmé gagne la manche');
    assert(evT.some((e) => e.e === 'roundEnd' && e.time) && tm.duel.pause > 0, 'duel : la fin au temps ouvre la pause');
    for (let i = 0; i < 4 * 60; i++) stepGame(tm, DT, world);
    assert(tm.duel.round === 2 && tm.duel.t > ROUND_TIME - 2, 'duel : la manche suivante repart avec tout son temps');
    const late = start('duel', 2);
    addPlayer(late, { id: 'new', name: 'New', type: 'f16' }, world);
    assert(late.duel.q.includes('new') && !late.planes.find((p) => p.id === 'new').alive, 'duel : qui arrive en route attend son tour');
  }

  // Escorte
  {
    assert(!TYPE_IDS.includes('cargo'), 'escorte : le transport ne se choisit pas au hangar');
    for (let u = 0; u < 6.3; u += 0.02) { const q = routeAt(u); assert(q.y > world.obstacleAt(q.x, q.z) + 100, 'escorte : la route passe au-dessus du relief'); }
    const g = start('escorte');
    const c = g.planes.find((p) => p.type === 'cargo');
    assert(c && c.team === 1 && c.health === c.maxHp && c.maxHp > 1000, 'escorte : le transport vole avec les défenseurs');
    assert(!ranking(g).includes(c), 'escorte : le transport n\'est pas au classement');
    assert(g.planes.filter((p) => p.team === 1 && p !== c).length === 2 && g.planes.filter((p) => p.team === 2).length === 2, 'escorte : deux équipes égales');
    parked(g);
    // seul, il suit sa route sans jamais s'écraser ni sortir de la zone
    for (const p of g.planes) if (p !== c) { p.alive = false; p.respawn = 1e6; }
    let low = 1e9, high = 0, wide = 0, tilt = 1, px = c.x, pz = c.z, fast = 0;
    for (let i = 0; i < 280 * 60 && g.ph === 'play'; i++) {
      stepGame(g, DT, world);
      low = Math.min(low, c.y - world.obstacleAt(c.x, c.z)); high = Math.max(high, c.y); wide = Math.max(wide, Math.hypot(c.x - CENTER, c.z - CENTER)); tilt = Math.min(tilt, c.uy);
      fast = Math.max(fast, Math.hypot(c.x - px, c.z - pz) / DT); px = c.x; pz = c.z;
    }
    drainEvents(g);
    assert(c.alive && low > 100 && high < 400, `escorte : le transport tient sa route (entre ${low.toFixed(0)} m du sol et ${high.toFixed(0)} m d'altitude)`);
    assert(tilt > 0.6, `escorte : il vire sans se mettre sur la tranche (${tilt.toFixed(2)})`);
    assert(fast < 110, `escorte : sa vitesse reste régulière (${fast.toFixed(0)} m/s)`);
    assert(wide < ZONE_MAX, 'escorte : le transport reste dans la zone de vol');
    for (let i = 0; i < 30 * 60 && g.ph === 'play'; i++) stepGame(g, DT, world);
    assert(g.ph === 'over' && g.winTeam === 1, 'escorte : s\'il survit au temps, les défenseurs gagnent');
    const k = start('escorte'), kc = k.planes.find((p) => p.type === 'cargo'), foe = k.planes.find((p) => p.team === 2);
    kc.health = 1; k.bullets.push({ x: kc.x, y: kc.y, z: kc.z + 1, vx: 0, vy: 0, vz: -50, by: foe.id, dmg: 5, age: 0 });
    for (let i = 0; i < 12 && k.ph === 'play'; i++) stepGame(k, DT, world);
    assert(k.ph === 'over' && k.winTeam === 2, 'escorte : s\'il tombe, les attaquants gagnent');
    const n = start('escorte'), r = network(n);
    assert(r.cargo && r.planes.find((p) => p.type === 'cargo').hitR > 5, 'escorte : un nouvel hôte reprend le transport');
    for (let i = 0; i < 60; i++) stepGame(r, DT, world);
    assert(r.ph === 'play', 'escorte : la partie continue après la reprise');
  }

  // Récompenses
  {
    const g = start('chacun');
    const [a, b, c] = g.planes;
    b.dmgBy[c.id] = { d: 30, t: g.clock };
    let ev = down(g, b, a);
    assert(ev.some((e) => e.e === 'first' && e.by === a.id), 'récompenses : premier sang');
    assert(c.helps === 1 && ev.some((e) => e.e === 'help' && e.by === c.id), 'récompenses : qui a bien touché avant compte une aide');
    assert(a.helps === 0, 'récompenses : le tireur ne s\'aide pas lui-même');
    assert(b.nemesis === a.id, 'récompenses : on retient qui nous a abattu');
    const d = g.planes[3];
    d.inv = 0; ev = down(g, d, a);
    assert(a.streak === 2 && ev.some((e) => e.e === 'streak' && e.n === 2), 'récompenses : doublé');
    assert(!ev.some((e) => e.e === 'first'), 'récompenses : un seul premier sang');
    a.inv = 0; b.alive = true; b.inv = 0; b.y = 400; b.lastHitBy = null;
    ev = down(g, a, b);
    assert(a.streak === 0 && a.best === 2, 'récompenses : mourir coupe la série, le record reste');
    assert(ev.some((e) => e.e === 'revenge' && e.by === b.id), 'récompenses : la revanche');
    c.dmgBy[d.id] = { d: 5, t: g.clock }; c.dmgBy[a.id] = { d: 50, t: g.clock - 20 };
    const h = c.helps + d.helps + a.helps; c.inv = 0; down(g, c, b);
    assert(c.helps + d.helps + a.helps === h, 'récompenses : pas d\'aide pour une égratignure ni un tir trop ancien');
    assert(worldOf(g).pl[1].st.length === 6, 'récompenses : les statistiques voyagent sur le réseau');
  }
  console.log('✓ Modes : Domination, Duel, Escorte, récompenses');
}

console.log(`\nTOUS LES TESTS SONT VALIDES (${passed} vérifications)`);
