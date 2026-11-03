// Tests du moteur de Dogfight 3D : node tools/test-dogfight.mjs
import { generateMap, ILE } from '../royale/engine/map.js';
import { createFlight, stepFlight, computeAxes, bankOf, keyRamp, keyCurve, KEY_ATTACK, TYPES, TYPE_IDS, ZONE_MAX, ZONE_WARN, ZONE, zoneDist, CENTER, CEILING, COBRA_TIME } from '../dogfight/engine/flight.js';
import { computeLead, BULLET_SPEED, BULLET_GRAVITY, FIRE_RATE, stepGun, hitZone, stepLock, MISSILE_COOLDOWN, FLARE_COOLDOWN, MISSILE_DAMAGE, LOW_HIDE } from '../dogfight/engine/weapons.js';
import { createWorld, cloudTop } from '../dogfight/engine/world.js';
import { createGame, startCountdown, stepGame, drainEvents, DT, snapRows, worldOf, restoreGame, replaceByBot, applyRow, ranking, addPlayer } from '../dogfight/engine/rules.js';
import { botInput, LEVELS } from '../dogfight/engine/ai.js';
import { ZONE_CEIL, CAPTURE_TIME, KILL_POINTS, ROUND_TIME, ATTACK_LIVES, getRoute } from '../dogfight/engine/modes.js';
import { ABILITIES, ABILITY_COOLDOWN } from '../dogfight/engine/abilities.js';
import { ROUTE_IDS, routeForTime } from '../dogfight/engine/route.js';
import { loadMap, useMap, heightAt, lakeAt, runwayLocal, MAP_IDS, RUNWAY_Y } from '../dogfight/engine/archipel.js';

let passed = 0;
function assert(c, msg) { if (!c) { console.error(`ÉCHEC : ${msg}`); process.exit(1); } passed++; }
const run = (s, inp, sec) => { for (let t = 0; t < sec; t += DT) stepFlight(s, inp, DT); return s; };
const deg = (r) => r * 180 / Math.PI;

const map = generateMap(ILE);
for (const id of MAP_IDS) await loadMap(id);
useMap('eoliennes');
const world = createWorld(map);

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
  const z = createFlight({ x: ZONE.x + ZONE_MAX + 50, y: 400, z: ZONE.z, heading: Math.PI / 2 });
  run(z, { boost: true }, 12);
  assert(zoneDist(z.x, z.z) < ZONE_MAX, 'hors zone : l\'instructeur ramène l\'avion');
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
  assert(world.obstacleAt(40000, 40000) === 0, 'au-delà de la carte, c\'est la mer');
  const b = map.buildings[0], cx = (b.x0 + b.w / 2) * 4, cz = (b.z0 + b.d / 2) * 4;
  assert(world.obstacleAt(cx, cz) > world.groundAt(cx, cz) + 2, 'les toits comptent comme obstacle');
  const c = world.clouds.find((q) => !q.bank && !q.far), far = world.clouds.find((q) => q.far);
  // les dômes d'un amas se chevauchent : au-dessus de c, le plus haut d'entre eux fait le sommet (0.85 : le cœur où l'on est caché)
  const over = world.clouds.filter((q) => !q.far).map((q) => [q, ((q.x - c.x) ** 2 + (q.z - c.z) ** 2) / (q.R * q.R * 0.85 * 0.85)]).filter(([, d2]) => d2 < 1);
  const top = Math.max(...over.map(([q, d2]) => cloudTop(q, d2))), low = Math.min(...over.map(([q]) => q.base));
  assert(world.inCloud(c.x, c.base + 20, c.z) && !world.inCloud(c.x, low - 60, c.z) && !world.inCloud(c.x, top + 5, c.z), 'on sait si un avion est dans un nuage');
  assert(far && !world.inCloud(far.x, far.base + 20, far.z) && world.clouds.some((q) => !q.far && q.base + q.H > 1400), 'des nuages à l\'horizon (décor seulement), et des tours qui montent haut');
  // les quatre cartes : un vrai relief, l'île d'Island Rush en mer, une piste plate, des navires, un banc de nuages bas
  const PEAKS = { eoliennes: [550, 650], teno: [1300, 1420], kauai: [1200, 1350], lofoten: [950, 1080] };
  for (const id of MAP_IDS) {
    const A = useMap(id), w = createWorld(map);
    let peak = 0, land = 0, tot = 0;
    for (let x = A.zone.x - 6000; x <= A.zone.x + 6000; x += 50) for (let z = A.zone.z - 6000; z <= A.zone.z + 6000; z += 50) { const h = heightAt(A, x, z); peak = Math.max(peak, h); tot++; if (h > 0) land++; }
    assert(peak > PEAKS[id][0] && peak < PEAKS[id][1], `${A.name} : le sommet est à sa vraie hauteur (${peak.toFixed(0)} m)`);
    assert(land / tot > 0.15 && land / tot < 0.75, `${A.name} : terre et mer se partagent la carte (${(land / tot * 100).toFixed(0)} % de terre)`);
    let dry = 0; for (let x = -100; x <= 1700; x += 50) for (let z = -100; z <= 1700; z += 50) if (heightAt(A, x, z) > 0) dry++;
    assert(dry === 0, `${A.name} : l'île d'Island Rush est posée en mer`);
    let seam = 0; for (let t = -6900; t <= 6900; t += 37) { const e = A.x0 + A.size; seam = Math.max(seam, Math.abs(heightAt(A, e - 1, A.zone.z + t) - heightAt(A, e + 1, A.zone.z + t))); }
    assert(seam < 4, `${A.name} : pas de marche entre le relief proche et l'horizon (${seam.toFixed(1)} m)`);
    const W = A.runway, along = [-W.len / 2, 0, W.len / 2].map((a) => w.groundAt(W.x + W.ux * a, W.z + W.uz * a));
    assert(along.every((h) => Math.abs(h - RUNWAY_Y) < 0.5), `${A.name} : la piste est plate`);
    assert(Math.hypot(W.x - A.zone.x, W.z - A.zone.z) < 5600, `${A.name} : la piste est dans la zone de jeu`);
    const pa = A.structures.find((q) => q.kind === 'porteavions');
    assert(w.obstacleAt(pa.x, pa.z) > 20 && w.groundAt(pa.x, pa.z) === 0, `${A.name} : le porte-avions est un obstacle en pleine mer`);
    assert(A.structures.filter((q) => q.kind !== 'hangar' && q.kind !== 'tour').every((q) => heightAt(A, q.x, q.z) < -5), `${A.name} : les navires flottent`);
    const low = w.clouds.find((q) => q.bank);
    assert(low && w.inCloud(low.x, A.bank.y, low.z), `${A.name} : le banc de nuages bas cache le transport`);
  }
  let lakes = 0; const L = useMap('lofoten'); for (let k = 0; k < L.lake.length; k++) if (L.lake[k] === 2) lakes++;
  assert(lakes > 2000 && lakeAt(L, L.zone.x - 4600, L.zone.z - 400), `Lofoten : les lacs sont repérés (${lakes} cases)`);
  useMap('eoliennes');
  console.log('✓ Monde : quatre vrais reliefs, toits, navires, piste, nuages');
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
    for (const p of g.planes) if (p.alive) { stats.n++; if (p.y - world.groundAt(p.x, p.z) > 1000) stats.ceil++; stats.maxD = Math.max(stats.maxD, zoneDist(p.x, p.z)); if (p.firing) stats.shots++; }
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
  console.log('✓ Règles : phases, spawn, crash, match nul, équipes, départ');
}

// ----- 5 bis. Armes à recharge et capacités
{
  // A poursuit B à 800 m, haut dans le ciel, en ligne droite
  const duel = (ta, tb, more = []) => {
    const g = createGame({ settings: { kills: 20, time: 300 }, players: [{ id: 1, name: 'A', type: ta }, { id: 2, name: 'B', type: tb }, ...more], world });
    startCountdown(g, world); for (let i = 0; i < 200; i++) stepGame(g, DT, world);
    g.planes.forEach((p, i) => Object.assign(p, createFlight({ x: 800 + (i > 1 ? (i % 2 ? 160 : -160) : 0), y: 1500, z: i ? 200 : -600, type: p.type }), { inv: 0 }));
    return g;
  };
  const steps = (g, sec) => { const ev = []; for (let t = 0; t < sec; t += DT) { stepGame(g, DT, world); ev.push(...drainEvents(g)); } return ev; };
  const count = (ev, e) => ev.filter((q) => q.e === e).length;
  // missiles : sans stock, un toutes les 12 s, toujours avec accrochage, 70 % d'un F-16
  {
    const g = duel('f16', 'f16'), [a, b] = g.planes;
    a.inp.msl = true; let ev = steps(g, DT);
    assert(count(ev, 'mfire') === 0, 'missile : pas de tir sans accrochage');
    ev = steps(g, 1.6);
    assert(a.lockId === 2 && a.lockT >= 1, 'missile : la cible devant est accrochée');
    a.inp.msl = true; ev = steps(g, DT);
    assert(count(ev, 'mfire') === 1 && Math.abs(a.msCd - MISSILE_COOLDOWN) < 0.1, `missile : tir, puis ${MISSILE_COOLDOWN} s de recharge`);
    ev = steps(g, 6);
    assert(Math.abs(b.health - (TYPES.f16.hp - MISSILE_DAMAGE)) < 0.5 && b.alive, `missile : un F-16 touché garde 30 % (${b.health.toFixed(0)})`);
    a.inp.msl = true; ev = steps(g, DT);
    assert(count(ev, 'mfire') === 0, 'missile : rien pendant la recharge');
    ev = steps(g, MISSILE_COOLDOWN - 6);
    a.inp.msl = true; ev = steps(g, 0.1);
    assert(a.msCd > MISSILE_COOLDOWN - 1 && count(ev, 'mfire') === 1, `missile : de nouveau prêt après ${MISSILE_COOLDOWN} s, sans limite de stock`);
    // leurres : sans stock, toutes les 9 s
    b.inp.flare = true; ev = steps(g, DT);
    assert(count(ev, 'flare') === 1 && Math.abs(b.flCd - FLARE_COOLDOWN) < 0.1, `leurres : lâchés, puis ${FLARE_COOLDOWN} s de recharge`);
    b.inp.flare = true; ev = steps(g, 5);
    assert(count(ev, 'flare') === 0, 'leurres : rien pendant la recharge');
    b.inp.flare = true; ev = steps(g, FLARE_COOLDOWN - 4.9);
    assert(count(ev, 'flare') === 1, `leurres : de nouveau prêts après ${FLARE_COOLDOWN} s`);
    // tout est prêt à la réapparition
    a.msCd = 12; a.flCd = 9; a.abCd = 30; a.y = -5; steps(g, DT);
    assert(!a.alive, 'crash pour le test de réapparition');
    steps(g, 6);
    assert(a.alive && a.msCd === 0 && a.flCd === 0 && a.abCd === 0, 'réapparition : missile, leurres et capacité prêts');
  }
  // rase-mottes et nuages : invisible aux radars
  {
    let sx = null;
    for (let x = -3000; x < 4000 && sx === null; x += 100) for (let z = -3000; z < 3000; z += 100) if ([0, 300, 600, 900].every((d) => world.obstacleAt(x, z + d) === 0)) { sx = { x, z }; break; }
    const a = { id: 1, x: sx.x, y: 200, z: sx.z, fx: 0, fy: -0.17, fz: 0.985, lockT: 0, lockId: null }, b = { id: 2, alive: true, type: 'f16', x: sx.x, y: 40, z: sx.z + 900 };
    for (let i = 0; i < 180; i++) stepLock(a, [a, b], world, DT);
    assert(b.y < LOW_HIDE && a.lockId === null, 'rase-mottes : sous 50 m, impossible à accrocher');
    b.y = 70; a.fy = -0.14; for (let i = 0; i < 180; i++) stepLock(a, [a, b], world, DT);
    assert(a.lockId === 2 && a.lockT === 1, 'au-dessus de 50 m, on l\'accroche');
  }
  // capacités : 25 s, une par avion
  assert(TYPE_IDS.length === 6 && TYPE_IDS.every((t) => ABILITIES[TYPES[t].ab]) && new Set(TYPE_IDS.map((t) => TYPES[t].ab)).size === 6, 'six avions, six capacités différentes');
  {
    // Surcharge du F-16 : plus vite, sans chauffer
    const g = duel('f16', 'f16'), [a] = g.planes, shots0 = a.shots || 0;
    a.inp.ab = true; let ev = steps(g, DT);
    assert(count(ev, 'ab') === 1 && a.abCd > ABILITY_COOLDOWN - 0.1 && a.abT > 5.9, `Surcharge : déclenchée, ${ABILITY_COOLDOWN} s de recharge`);
    a.inp.fire = true; steps(g, 5); a.inp.fire = false;
    assert(a.heat === 0 && !a.over && (a.shots - shots0) > FIRE_RATE * 1.25 * 5, `Surcharge : ${a.shots - shots0} obus en 5 s sans chauffer`);
    a.inp.ab = true; ev = steps(g, DT);
    assert(count(ev, 'ab') === 0, 'Surcharge : rien pendant la recharge');
    a.inp.fire = true; steps(g, 3); a.inp.fire = false;
    assert(a.heat > 0.3 || a.over, 'Surcharge finie : le canon chauffe de nouveau');
  }
  {
    // Furtivité du F-22 : décroche le missile déjà en vol, et plus d'accrochage
    const g = duel('f16', 'f22'), [a, b] = g.planes;
    steps(g, 2.2); a.inp.msl = true; steps(g, DT);
    assert(g.missiles.length === 1 && g.missiles[0].target === 2, 'Furtivité : un missile poursuit le F-22');
    b.inp.ab = true; const ev = steps(g, 0.2);
    assert(g.missiles.every((m) => m.target === null) && count(ev, 'mlost') === 1, 'Furtivité : le missile perd sa cible');
    steps(g, 3);
    assert(a.lockId === null && b.abT > 0, 'Furtivité : impossible à accrocher pendant 6 s');
  }
  {
    // Salve du Rafale : deux missiles sur deux cibles, sans accrochage ; sans cible, pas gâchée
    const g = duel('rafale', 'f16', [{ id: 3, name: 'C', type: 'f16' }]), [a] = g.planes;
    g.planes[2].z = 300; a.lockT = 0; a.inp.ab = true; let ev = steps(g, DT);
    const fired = ev.filter((q) => q.e === 'mfire');
    assert(fired.length === 2 && new Set(fired.map((q) => q.target)).size === 2 && a.abCd > ABILITY_COOLDOWN - 1, 'Salve : deux missiles, deux cibles, sans accrocher');
    const solo = duel('rafale', 'f16'), r = solo.planes[0];
    Object.assign(solo.planes[1], { z: -2000 }); r.inp.ab = true; ev = steps(solo, DT);
    assert(count(ev, 'abno') === 1 && r.abCd === 0 && count(ev, 'mfire') === 0, 'Salve : sans cible devant, elle reste prête');
  }
  {
    // Cobra du Su-35 : cabré brutal, il garde sa route et casse sa vitesse
    const g = duel('su35', 'f16'), [a] = g.planes, x0 = a.x, y0 = a.y, z0 = a.z, v0 = a.speed;
    a.inp.ab = true; a.inp.fire = true; steps(g, COBRA_TIME / 2);
    assert(a.fy > 0.6 && Math.abs(a.x - x0) < 3 && a.cob > 0, `Cobra : le nez se dresse (${a.fy.toFixed(2)}) sans quitter la route`);
    assert(!a.firing, 'Cobra : pas de canon pendant la figure');
    steps(g, COBRA_TIME / 2 + 0.05);
    const along = a.z - z0;
    assert(a.cob === 0 && a.fz > 0.9 && Math.abs(a.y - y0) < 20 && along > 60 && a.speed < v0 * 0.65, `Cobra : retombe à plat dans l'axe, ${a.speed.toFixed(0)} m/s au lieu de ${v0.toFixed(0)}`);
  }
  {
    // Brouilleur du F/A-18 : les missiles autour décrochent et personne n'accroche
    const g = duel('f16', 'f18'), [a, b] = g.planes;
    steps(g, 2.2); a.inp.msl = true; steps(g, DT);
    assert(g.missiles.length === 1, 'Brouilleur : un missile poursuit le F/A-18');
    b.inp.ab = true; steps(g, 0.1);
    assert(g.missiles.every((m) => m.target === null), 'Brouilleur : le missile décroche');
    steps(g, 2);
    assert(a.lockId === null, 'Brouilleur : personne n\'accroche à moins d\'un kilomètre');
  }
  {
    // Brrrt de l'A-10 : obus deux fois plus forts, sans chauffer
    const g = duel('a10', 'f16'), [a] = g.planes;
    a.inp.ab = true; a.inp.fire = true; steps(g, 1);
    const dmg = g.bullets.map((q) => q.dmg);
    assert(dmg.length > 10 && dmg.every((d) => d === TYPES.a10.gun * 2) && a.heat === 0, 'Brrrt : dégâts doublés, sans chauffer');
  }
  console.log('✓ Armes à recharge, leurres, rase-mottes, six capacités');
}

// ----- 6. Réseau
{
  const g = createGame({ settings: { kills: 8, time: 100 }, players: [{ id: 0, name: 'H' }, { id: 7, name: 'I' }, { id: 'b', name: 'B', bot: true, lvl: 'normal' }], world });
  startCountdown(g, world); for (let i = 0; i < 400; i++) stepGame(g, DT, world);
  const rows = snapRows(g), w = worldOf(g);
  const size = JSON.stringify(rows).length;
  assert(size < 600, `instantané de 3 avions compact (${size} o)`);
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
  // un Cobra en cours voyage avec l'instantané : l'invité le rejoue à l'identique
  const s0 = g.planes[2]; s0.type = 'su35'; s0.abCd = 0; s0.inp = { ...s0.inp, ab: true }; s0.bot = false;
  stepGame(g, DT, world); s0.inp.ab = false;
  for (let i = 0; i < 20; i++) stepGame(g, DT, world);
  const rc = snapRows(g)[2], cp = applyRow(createFlight({ type: 'su35' }), rc);
  assert(s0.cob > 0 && Math.abs(cp.cob - s0.cob) < 0.01 && cp.abCd > ABILITY_COOLDOWN - 5, 'réseau : le Cobra et les recharges voyagent avec l\'instantané');
  stepFlight(cp, {}, DT); stepFlight(s0, {}, DT);
  assert(Math.hypot(cp.x - s0.x, cp.y - s0.y, cp.z - s0.z) < 0.5 && cp.fy * s0.fy + cp.fx * s0.fx + cp.fz * s0.fz > 0.999, 'réseau : l\'invité rejoue le Cobra comme l\'hôte');
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
    assert(routeForTime(300) === 'traversee' && routeForTime(480) === 'tour' && routeForTime(600) === 'odyssee', 'escorte : la durée choisit la route');
    // l'approche finale : dans l'axe de la piste, derrière son seuil
    const onFinal = (W, x, z, tol) => { const q = runwayLocal(W, x, z); return Math.abs(q.b) < tol && q.a > -W.len / 2 - 3100 && q.a < W.len / 2; };
    for (const mid of MAP_IDS) {
      const A = useMap(mid), w = createWorld(map), W = A.runway;
      for (const id of ROUTE_IDS) {
        const R = getRoute(id, w);
        let clear = 1e9, low = 0, cloud = 0, valley = 0, glide = 0;
        for (let i = 0; i < R.land; i++) {
          if (R.s[i] > R.landS - 2950) { glide = Math.max(glide, R.y[i] - R.y[i - 1]); continue; }
          const h = Math.max(w.obstacleAt(R.x[i], R.z[i]), w.obstacleAt(R.x[i] + 20, R.z[i]), w.obstacleAt(R.x[i] - 20, R.z[i]), w.obstacleAt(R.x[i], R.z[i] + 20), w.obstacleAt(R.x[i], R.z[i] - 20));
          clear = Math.min(clear, R.y[i] - h);
          if (R.y[i] - h < LOW_HIDE) low += 10;
          if (w.inCloud(R.x[i], R.y[i], R.z[i])) cloud += 10;
          if (Math.max(w.groundAt(R.x[i] + 400, R.z[i]), w.groundAt(R.x[i] - 400, R.z[i]), w.groundAt(R.x[i], R.z[i] + 400), w.groundAt(R.x[i], R.z[i] - 400)) > R.y[i]) valley += 10;
        }
        const min = R.time / 60, end = runwayLocal(W, R.x[R.land], R.z[R.land]);
        console.log(`  ${A.name}, ${R.name} (${R.model}) : ${(R.landS / 1000).toFixed(1)} km en ${min} min à ${R.speed.toFixed(0)} m/s ; ${(low / 1000).toFixed(1)} km en rase-mottes, ${(cloud / 1000).toFixed(1)} km dans les nuages, ${(valley / 1000).toFixed(1)} km entre les montagnes ; marge ${clear.toFixed(0)} m`);
        assert(R.map === mid, `escorte, ${R.name} : la route est celle de la carte`);
        assert(clear > 20, `escorte, ${R.name} : la route ne frôle jamais le relief (${clear.toFixed(0)} m)`);
        assert(glide <= 0, `escorte, ${R.name} : l'approche finale descend sans remonter`);
        assert(low > 2500 && cloud > 2000 && valley > 1000, `escorte, ${R.name} : rase-mottes, nuages et montagnes au programme`);
        assert(R.speed > 70 && R.speed < 100, `escorte, ${R.name} : une vitesse de gros porteur (${R.speed.toFixed(0)} m/s)`);
        let out = 0; for (let i = 0; i < R.n; i++) out = Math.max(out, zoneDist(R.x[i], R.z[i]));
        assert(out < ZONE_WARN, `escorte, ${R.name} : la route reste dans la zone de jeu (${out.toFixed(0)} m du centre)`);
        assert(Math.abs(R.y[R.land] - W.y) < 6 && Math.abs(end.b) < 5 && Math.abs(end.a) <= W.len / 2 + 1, `escorte, ${R.name} : il se pose sur la piste`);
      }
    }
    useMap('eoliennes');
    const g = start('escorte');
    const c = g.planes.find((p) => p.type === 'cargo');
    assert(c && c.team === 1 && c.health === c.maxHp && c.maxHp > 1000 && c.model === 'a400m', 'escorte : l\'A400M vole avec les défenseurs sur la route de 5 min');
    assert(!ranking(g).includes(c), 'escorte : le transport n\'est pas au classement');
    assert(g.planes.filter((p) => p.team === 1 && p !== c).length === 2 && g.planes.filter((p) => p.team === 2).length === 2, 'escorte : deux équipes égales');
    assert(g.planes.every((p) => p.lives === (p.team === 2 ? ATTACK_LIVES : 0)), 'escorte : cinq vies par assaillant');
    const def = g.planes.find((p) => p.team === 1 && p !== c), att = g.planes.find((p) => p.team === 2);
    assert(Math.hypot(def.x - c.x, def.z - c.z) < 700 && Math.hypot(att.x - c.x, att.z - c.z) > 2500, 'escorte : l\'escorte part avec le transport, les assaillants loin devant');
    assert(Math.abs(g.left - 300) < 5, `escorte : le chrono est le temps avant l'atterrissage (${g.left.toFixed(0)} s)`);
    parked(g);
    // seul, il suit sa route sans jamais s'écraser, et se pose à l'heure
    for (const p of g.planes) if (p !== c) { p.alive = false; p.respawn = 1e6; }
    let low = 1e9, tilt = 1, px = c.x, pz = c.z, fast = 0, t = 0, ev = [];
    for (let i = 0; i < 320 * 60 && g.ph === 'play'; i++) {
      stepGame(g, DT, world); t += DT; ev.push(...drainEvents(g));
      if (g.ph === 'play' && !onFinal(world.archi.runway, c.x, c.z, 30)) low = Math.min(low, c.y - world.obstacleAt(c.x, c.z));
      tilt = Math.min(tilt, c.uy);
      fast = Math.max(fast, Math.hypot(c.x - px, c.z - pz) / DT); px = c.x; pz = c.z;
    }
    assert(c.alive && low > 20, `escorte : le transport ne touche jamais le relief (${low.toFixed(0)} m au plus bas)`);
    assert(tilt > 0.6, `escorte : il vire sans se mettre sur la tranche (${tilt.toFixed(2)})`);
    assert(fast < 110, `escorte : sa vitesse reste régulière (${fast.toFixed(0)} m/s)`);
    assert(g.ph === 'over' && g.winTeam === 1 && g.why === 'landed' && ev.some((e) => e.e === 'landed') && Math.abs(t - 303) < 6, `escorte : posé à l'heure (${t.toFixed(0)} s), l'escorte gagne`);
    const a0 = runwayLocal(world.archi.runway, c.x, c.z).a; for (let i = 0; i < 600; i++) stepGame(g, DT, world);
    assert(runwayLocal(world.archi.runway, c.x, c.z).a > a0 + 50 && c.speed < 60, 'escorte : posé, il roule et freine sur la piste');
    // les cinq vies des assaillants
    const w = start('escorte'), foes = w.planes.filter((p) => p.team === 2);
    for (let k = 0; k < ATTACK_LIVES; k++) { for (let i = 0; i < 5 * 60 && !foes[0].alive; i++) stepGame(w, DT, world); down(w, foes[0]); }
    assert(foes[0].out && !foes[0].alive && foes[0].lives === 0, 'escorte : cinq morts et l\'assaillant est hors jeu');
    for (let i = 0; i < 8 * 60; i++) stepGame(w, DT, world);
    assert(!foes[0].alive && w.ph === 'play', 'escorte : hors jeu, il ne réapparaît plus');
    for (let k = 0; k < ATTACK_LIVES && w.ph === 'play'; k++) { for (let i = 0; i < 5 * 60 && !foes[1].alive; i++) stepGame(w, DT, world); down(w, foes[1]); }
    assert(w.ph === 'over' && w.winTeam === 1 && w.why === 'wiped', 'escorte : tous les assaillants à terre, l\'escorte gagne');
    const k = start('escorte'), kc = k.planes.find((p) => p.type === 'cargo'), foe = k.planes.find((p) => p.team === 2);
    kc.health = 1; k.bullets.push({ x: kc.x, y: kc.y, z: kc.z + 1, vx: 0, vy: 0, vz: -50, by: foe.id, dmg: 5, age: 0 });
    for (let i = 0; i < 12 && k.ph === 'play'; i++) stepGame(k, DT, world);
    assert(k.ph === 'over' && k.winTeam === 2, 'escorte : s\'il tombe, les attaquants gagnent');
    const n = start('escorte', 4, { time: 600 }), r = network(n);
    assert(n.cargo.model === 'c17' && r.cargo && r.cargo.route === 'odyssee' && r.planes.find((p) => p.type === 'cargo').hitR > 5 && r.planes.find((p) => p.team === 2).lives === ATTACK_LIVES, 'escorte : un nouvel hôte reprend le C-17, sa route et les vies');
    for (let i = 0; i < 60; i++) stepGame(r, DT, world);
    assert(r.ph === 'play' && r.cargo.d > n.cargo.d, 'escorte : la partie continue après la reprise');
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
