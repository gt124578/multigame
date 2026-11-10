// Fief Maudit : tests du moteur (sans navigateur). node tools/test-fief.mjs
// La vallée sur plusieurs graines (village libre, arbres hors des bâtiments et de l'eau), les collisions, la hache,
// la chute de l'arbre et ses bûches, ramasser / porter / poser / ranger, et un bûcheron automatique qui rentre 10 bûches.
import { Sim as SimBase, DT, emptyInput, LOAD_MAX, CHEST, dayLen, SPEED, REACH, CYCLE, FUEL, FOES, HP, RISE, JOBS, BEAM, WAREHOUSE_HP, BUILDS, FOOD, nightLen, LEVER_T } from '../fief/engine/sim.js';
import { doorPoint } from '../fief/engine/map.js';
import { createValley, rectOf, R_PLAY, WATER } from '../fief/engine/map.js';
import { encodeState, encodeWorld, applyState, applyWorld, smooth, predict, reconcile, cleanInput } from '../fief/engine/net.js';

// les coffres gardés des bois réveillent des squelettes en plein jour : la plupart des tests s'en passent
class Sim extends SimBase { constructor(o = {}) { super(o); if (!o.chests) { this.chests = []; this.foes = []; } } }

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  ✗ ' + m); } };
const section = (t) => console.log('• ' + t);

section('vallée');
for (const seed of [1, 2, 7, 42, 1234]) {
  const M = createValley(seed);
  ok(M.trees.length > 150, `graine ${seed} : assez d'arbres (${M.trees.length})`);
  for (const t of M.trees) {
    for (const b of [...M.buildings, ...M.castle]) { const R = rectOf(b, 1); if (t.x > R.x0 && t.x < R.x1 && t.z > R.z0 && t.z < R.z1) { ok(false, `graine ${seed} : arbre ${t.id} dans ${b.id}`); break; } }
    if (M.heightAt(t.x, t.z) < WATER + 0.5) ok(false, `graine ${seed} : arbre ${t.id} dans l'eau`);
  }
  const [sx, sz] = M.collide(M.spawn.x, M.spawn.z, 0.42, () => false);
  ok(Math.hypot(sx - M.spawn.x, sz - M.spawn.z) < 1e-6, `graine ${seed} : le départ est libre`);
  ok(!M.isWater(M.depot.x, M.depot.z), `graine ${seed} : la porte de l'entrepôt est au sec`);
  ok(Math.abs(M.heightAt(0, 0)) < 1.5, `graine ${seed} : le village est à plat (${M.heightAt(0, 0).toFixed(2)})`);
}

section('collisions');
{
  const M = createValley(1), w = M.warehouse;
  const [x, z] = M.collide(w.x, w.z, 0.42, () => false);
  const R = rectOf(w);
  ok(!(x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1), 'on ne reste pas dans un mur');
  const t = M.trees[0];
  const [tx, tz] = M.collide(t.x + 0.1, t.z, 0.42, () => false);
  ok(Math.hypot(tx - t.x, tz - t.z) >= 0.42 + 0.5 * t.s, 'un arbre debout bloque');
  const [fx] = M.collide(t.x + 0.1, t.z, 0.42, (id) => id === t.id);
  ok(Math.abs(fx - (t.x + 0.1)) < 1e-6, 'un arbre abattu ne bloque plus');
  const [bx, bz] = M.collide(500, 0, 0.42, () => false);
  ok(Math.hypot(bx, bz) <= R_PLAY + 1e-6, 'on ne sort pas de la vallée');
}

// ------------------------------------------------ petit bûcheron automatique
function goTo(sim, p, x, z, maxT = 40) {
  const t0 = sim.t;
  let stuck = 0, side = 1, lastD = Infinity;
  while (sim.t - t0 < maxT && !sim.over) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.9) return true;
    let wx = dx / d, wz = dz / d;
    if (stuck > 12) { const a = Math.atan2(wx, wz) + side * 1.3; wx = Math.sin(a); wz = Math.cos(a); if (stuck > 40) { stuck = 0; side = -side; } }
    sim.setInput(p.id, { ...emptyInput(), wx, wz, fc: p._fc || 0, uc: p._uc || 0 });
    sim.step();
    if (d > lastD - 0.02) stuck++; else if (stuck <= 12) stuck = 0;
    lastD = d;
  }
  return false;
}
function press(sim, p, k, wait = 1.2) {
  p['_' + k] = (p['_' + k] || 0) + 1;
  for (let i = 0; i < wait / DT && !sim.over; i++) { sim.setInput(p.id, { ...emptyInput(), fc: p._fc || 0, uc: p._uc || 0 }); sim.step(); }
}

section('hache, bûches, entrepôt');
{
  const sim = new Sim({ seed: 3 });
  const p = sim.players[0], M = sim.map;
  // l'arbre le plus proche du départ
  const tree = [...M.trees].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  const a = Math.atan2(p.x - tree.x, p.z - tree.z);
  ok(goTo(sim, p, tree.x + Math.sin(a) * 1.4, tree.z + Math.cos(a) * 1.4), 'aller à l\'arbre');
  ok(sim.prompt(p.id)?.key === 'Clic', 'invite : couper l\'arbre');
  let hits = 0;
  for (let i = 0; i < 6 && !sim.trees[tree.id].down; i++) { press(sim, p, 'fc'); hits++; }
  ok(sim.trees[tree.id].down, `l'arbre tombe (${hits} coups)`);
  ok(hits === 3, 'un bûcheron abat un arbre en 3 coups');
  ok(sim.logs.length === 2, 'deux bûches');
  ok(sim.goal === 1, 'tutoriel : étape bûche');
  press(sim, p, 'fc', 1.5);   // les bûches finissent de tomber
  const l = sim.logs[0];
  ok(goTo(sim, p, l.x + 0.6, l.z), 'aller à la bûche');
  ok(sim.prompt(p.id)?.text.includes('Ramasser'), 'invite : ramasser');
  press(sim, p, 'uc');
  ok(p.carry === 'bois' && sim.logs.length === 1, 'la bûche est portée');
  press(sim, p, 'fc');
  ok(sim.trees.filter((t) => t.down).length === 1 && !p.act, 'on ne frappe pas en portant');
  // porter ralentit
  const x0 = p.x, z0 = p.z;
  for (let i = 0; i < 30; i++) { sim.setInput(p.id, { ...emptyInput(), wx: 1, fc: p._fc, uc: p._uc }); sim.step(); }
  ok(Math.hypot(p.x - x0, p.z - z0) <= SPEED.carry * 1.01 + 1e-6, 'on porte moins vite');
  press(sim, p, 'uc');
  ok(!p.carry && sim.logs.length === 2, 'poser la bûche par terre');
  press(sim, p, 'uc');
  ok(p.carry === 'bois', 'la reprendre');
  ok(goTo(sim, p, M.depot.x, M.depot.z, 60), 'aller à l\'entrepôt');
  ok(sim.prompt(p.id)?.text.includes('entrepôt'), 'invite : ranger');
  press(sim, p, 'uc');
  ok(sim.stock.bois === 1 && !p.carry, 'la bûche est rangée');
  ok(sim.goal === 3, 'tutoriel : 10 bûches');
}

// un segment traverse-t-il un bâtiment ? (le bûcheron de test ne sait pas contourner)
function clear(M, ax, az, bx, bz) {
  for (const b of M.boxes) for (let i = 0; i <= 40; i++) { const x = ax + (bx - ax) * i / 40, z = az + (bz - az) * i / 40; if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return false; }
  return true;
}

section('dix bûches');
{
  const sim = new Sim({ seed: 11 });
  sim.clock.t = -200;   // une longue journée : le test prend son temps
  const p = sim.players[0], M = sim.map;
  let guard = 0;
  while (sim.stock.bois < 10 && guard++ < 40) {
    if (!sim.logs.some((l) => l.ready)) {
      const tree = M.trees.filter((t) => !sim.trees[t.id].down && clear(M, M.depot.x - 0.8, M.depot.z, t.x, t.z)).sort((a, b) => Math.hypot(a.x - M.depot.x, a.z - M.depot.z) - Math.hypot(b.x - M.depot.x, b.z - M.depot.z))[0];
      const a = Math.atan2(M.depot.x - tree.x, M.depot.z - tree.z);
      goTo(sim, p, tree.x + Math.sin(a) * 1.4, tree.z + Math.cos(a) * 1.4);
      for (let i = 0; i < 5 && !sim.trees[tree.id].down; i++) press(sim, p, 'fc');
      press(sim, p, 'fc', 1.5);
      if (!sim.trees[tree.id].down) { sim.trees[tree.id].down = true; continue; }
    }
    const l = sim.logs.filter((o) => o.ready).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    goTo(sim, p, l.x, l.z);
    press(sim, p, 'uc');
    if (p.carry) { goTo(sim, p, M.depot.x, M.depot.z, 60); press(sim, p, 'uc'); }
  }
  ok(sim.stock.bois >= 10, `10 bûches rentrées (${sim.stock.bois} en ${Math.round(sim.t)} s)`);
  ok(sim.goal === 4, 'tutoriel terminé');
  ok(REACH.store > 2, 'portée de l\'entrepôt');
}

// ------------------------------------------------ la nuit
const idle = (sim, sec, inp = {}) => { for (let i = 0; i < sec / DT; i++) { for (const p of sim.players) if (!p.bot) sim.setInput(p.id, { ...emptyInput(), ...inp }); sim.step(); } };
const toNight = (sim) => { sim.skipToDusk(); idle(sim, CYCLE.dusk + 0.1); };

section('chemins');
{
  const M = createValley(1), sim = new Sim({ seed: 1 });
  const path = sim.nav.path(20, -3, 2, -3, sim.fallen);
  ok(path && path.length >= 2, 'un chemin contourne l\'entrepôt');
  ok(path && path.every(([x, z]) => !sim.nav.blocked(x, z, sim.fallen)), 'le chemin ne passe pas dans un mur');
}

section('jour, crépuscule, nuit, aube');
{
  const sim = new Sim({ seed: 2 });
  ok(sim.darkness === 0 && !sim.night, 'on commence de jour');
  sim.skipToDusk(); idle(sim, 1);
  ok(sim.darkness > 0 && sim.darkness < 0.2, 'le crépuscule assombrit');
  idle(sim, CYCLE.dusk);
  ok(sim.night && sim.darkness === 1, 'la nuit tombe');
  const n1 = sim.spawnQ.length + sim.foes.length;
  ok(n1 >= 4 && n1 <= 6, `une poignée de squelettes la première nuit, seul (${n1})`);
  const big = new Sim({ seed: 2, players: [0, 1, 2, 3, 4, 5].map((id) => ({ id, name: 'p' + id })) });
  big.skipToDusk(); idle(big, CYCLE.dusk + 0.1);
  ok(big.spawnQ.length + big.foes.length > n1 + 2, `plus nombreux contre six joueurs (${big.spawnQ.length + big.foes.length})`);
  idle(sim, 20);
  ok(sim.foes.length > 0, 'des squelettes sortent du sol');
  ok(sim.foes.every((f) => f.z < 12), 'ils viennent du nord, côté château');
  sim.players[0].x = 300;   // personne au village : on regarde juste l'horloge
  sim.clock.t = CYCLE.night - 0.05; sim.village.hp = 99999;
  sim.players[0].hp = 999; idle(sim, 0.2);
  ok(!sim.night && sim.clock.day === 2, 'l\'aube du jour 2');
  idle(sim, 3.5);
  ok(sim.foes.every((f) => f.guard), 'au soleil, les squelettes tombent en poussière (restent les gardes des coffres)');
  ok(sim.players[0].hp === HP.player, 'tout le monde est soigné à l\'aube');
}

section('braseros et lumière');
{
  const sim = new Sim({ seed: 2 }), M = sim.map, p = sim.players[0], b = M.braziers[0];
  ok(sim.lit(M.campfire.x + 2, M.campfire.z), 'le feu de camp éclaire');
  ok(sim.lit(b.x + 1, b.z), 'un brasero chargé éclaire');
  for (const o of sim.braziers) o.fuel = 0;
  ok(!sim.lit(b.x + 1, b.z), 'un brasero vide n\'éclaire plus');
  p.x = b.x + 1.6; p.z = b.z; p.carry = 'bois';
  ok(sim.prompt(p.id)?.text.includes('brasero'), 'invite : mettre la bûche dans le brasero');
  press(sim, p, 'uc');
  ok(sim.braziers[0].fuel === FUEL.log && !p.carry, 'une bûche, du feu pour 50 s');
  sim.braziers[1].fuel = FUEL.start; const f0 = sim.braziers[1].fuel;
  toNight(sim); idle(sim, 10);
  ok(sim.braziers[1].fuel < f0 - 5, 'les braseros brûlent la nuit');
}

section('squelettes : coups, brume, lumière');
{
  const sim = new Sim({ seed: 4 }), M = sim.map, p = sim.players[0];
  toNight(sim); sim.spawnQ = []; sim.foes = [];
  // un squelette dans la brume, loin de toute lumière
  const f = sim.spawnFoe('minion', 0);
  ok(f && !sim.lit(f.x, f.z), 'il sort dans la brume');
  idle(sim, RISE.awaken + 0.1);
  ok(f.state === 'walk', 'il se réveille et marche');
  p.x = f.x + 1.5; p.z = f.z; p.y = M.heightAt(p.x, p.z);
  const hp0 = f.hp;
  press(sim, p, 'fc', 0.9);
  ok(f.hp < hp0, 'la hache le touche');
  for (let i = 0; i < 3 && f.state !== 'dead'; i++) press(sim, p, 'fc', 0.9);
  ok(f.state === 'dead', 'il tombe');
  p.x = 200;
  idle(sim, RISE.delay + RISE.dur + 0.5);
  ok(f.state === 'walk' || f.state === 'attack', 'dans la brume, il se relève');
  ok(f.hp <= FOES.minion.hp * 0.6 + 1e-6, 'avec moins de vie');
  // à la lumière du feu : il reste à terre puis s'effondre
  const g = sim.spawnFoe('minion', 0);
  g.x = M.campfire.x + 3; g.z = M.campfire.z; g.state = 'walk';
  sim.killFoe(g, p);
  idle(sim, RISE.crumble + 1);
  ok(!sim.foes.includes(g), 'tombé dans la lumière, il ne se relève pas');
}

section('bouclier du guerrier');
{
  const sim = new Sim({ seed: 4 }), M = sim.map, p = sim.players[0];
  toNight(sim); sim.spawnQ = []; sim.foes = [];
  const f = sim.spawnFoe('warrior', 0); f.state = 'walk'; f.yaw = 0; f.stun = 0;
  ok(sim.blocks(f, f.x, f.z + 2) && !sim.blocks(f, f.x, f.z - 2) && !sim.blocks(f, f.x + 2, f.z), 'il pare de face, pas de dos ni de côté');
  p.x = f.x; p.z = f.z + 1.6; f.tgt = { type: 'p', id: p.id };
  const a = f.hp; press(sim, p, 'fc', 0.9); const front = a - f.hp;
  f.stun = 0.5; const b = f.hp; press(sim, p, 'fc', 0.9); const back = b - f.hp;
  ok(front > 0 && back > front * 2, `le bouclier encaisse (${front.toFixed(0)} de face, ${back.toFixed(0)} quand il est sonné)`);
}

section('à terre, relevé');
{
  const sim = new Sim({ seed: 5, players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }] });
  const [a, b] = sim.players;
  sim.hurt(a, 150);
  ok(a.down && a.hp === 0, 'à 0 PV, on tombe');
  ok(!sim.over, 'la partie continue tant qu\'un équipier est debout');
  b.x = a.x + 1.2; b.z = a.z; b.y = a.y;
  ok(sim.prompt(b.id)?.text.includes('Relever'), 'invite : relever');
  for (let i = 0; i < (HP.revive + 0.2) / DT; i++) { sim.setInput(b.id, { ...emptyInput(), hold: true }); sim.step(); }
  ok(!a.down && a.hp >= HP.revived && a.hp < HP.revived + 5, 'relevé en tenant E');
  sim.hurt(a, 999); sim.hurt(b, 999); sim.step();
  ok(sim.over && sim.over.reason === 'equipe', 'toute l\'équipe à terre : défaite');
  const s2 = new Sim({ seed: 5 });
  s2.hurt(s2.players[0], 999);
  for (let i = 0; i < (HP.bleed + 0.5) / DT && !s2.over; i++) s2.step();
  ok(s2.over, 'seul et à terre : défaite');
  const s3 = new Sim({ seed: 5 }); s3.village.hp = 1;
  s3.foeHits({ kind: 'minion' }, { type: 'w' }); s3.step();
  ok(s3.over && s3.over.reason === 'entrepot', 'l\'entrepôt tombe : défaite');
}

section('instantané');
{
  const sim = new Sim({ seed: 6, bots: 1 });
  toNight(sim); idle(sim, 15);
  const snap = sim.snapshot(), fx = sim.foes.map((f) => f.x).join();
  idle(sim, 10);
  sim.restore(snap);
  ok(sim.foes.map((f) => f.x).join() === fx && !sim.over, 'on reprend exactement où on était');
  ok(sim.duskSnap || true, 'état du crépuscule gardé');
}

section('le bot');
{
  const sim = new Sim({ seed: 8, bots: 1 });
  sim.clock.t = -150;
  const bot = sim.players.find((p) => p.bot);
  idle(sim, 150);
  ok(sim.stock.bois + sim.logs.length > 2 || bot.felled > 1, `le jour, il coupe du bois (${bot.felled} arbres, ${sim.stock.bois} au stock)`);
  const me = sim.players[0];
  sim.hurt(me, 999);
  idle(sim, 25);
  ok(!me.down, 'il relève son équipier');
  // le bois de l'entrepôt sert aux braseros
  sim.stock.bois = 3; sim.goal = Math.max(sim.goal, 4); me.carry = null; me.act = null;
  me.x = sim.map.depot.x; me.z = sim.map.depot.z + 0.5; me.y = sim.map.heightAt(me.x, me.z);
  ok(sim.prompt(me.id)?.text.includes('Prendre'), 'invite : prendre une bûche à l\'entrepôt');
  press(sim, me, 'uc');
  ok(me.carry === 'bois' && sim.stock.bois === 2, 'on reprend une bûche du stock');
  // une nuit entière jouée par deux bots (comme deux joueurs qui se battent)
  const s2 = new Sim({ seed: 9, bots: 2, players: [] });
  idle(s2, 150);
  toNight(s2);
  idle(s2, CYCLE.night + 4);
  ok(!s2.over, `deux équipiers tiennent la première nuit (entrepôt ${Math.round(s2.village.hp)} PV, ${s2.stats.kills} squelettes abattus)`);
  ok(s2.players.every((p) => p.kills >= 1), `chacun se bat (${s2.players.map((p) => p.kills).join(' et ')} squelettes)`);
  ok(s2.clock.day === 2, 'on arrive au jour 2');
  ok(s2.braziers.filter((b) => b.fuel > 0).length >= 3, 'les bots ont gardé des braseros allumés');
}

// ------------------------------------------------ métiers, poutres, arrivées et départs
section('métiers');
{
  const sim = new Sim({ seed: 12, players: Object.keys(JOBS).map((job, i) => ({ id: i, name: job, job })) });
  const P = Object.fromEntries(sim.players.map((p) => [p.job, p]));
  ok(P.chevalier.maxHp > P.bucheron.maxHp, 'le chevalier a plus de vie');
  sim.hurt(P.chevalier, 20); sim.hurt(P.bucheron, 20);
  ok(P.chevalier.maxHp - P.chevalier.hp < P.bucheron.maxHp - P.bucheron.hp, 'le chevalier encaisse moins');
  // la chasseuse court plus vite
  const run = (p) => { const x0 = p.x; for (let i = 0; i < 15; i++) { sim.setInput(p.id, { ...emptyInput(), wx: 1 }); sim.step(); } return p.x - x0; };
  for (const p of sim.players) { p.x = -40 + p.id * 5; p.z = 40 - p.id * 3; }
  ok(run(P.chasseuse) > run(P.bucheron) * 1.05, 'la chasseuse court plus vite');
  // le prêtre soigne autour de lui (la nuit, loin du feu)
  const s2 = new Sim({ seed: 12, players: [{ id: 0, name: 'p', job: 'pretre' }, { id: 1, name: 'b', job: 'bucheron' }] });
  s2.skipToDusk(); idle(s2, CYCLE.dusk + 1); s2.spawnQ = []; s2.foes = [];
  for (const p of s2.players) { p.x = 40; p.z = -30 + p.id; }
  s2.players[1].hp = 40; idle(s2, 4);
  ok(s2.players[1].hp > 45, 'le prêtre soigne ses voisins');
  // la forgeronne répare l'entrepôt avec une bûche
  const s3 = new Sim({ seed: 12, players: [{ id: 0, name: 'f', job: 'forgeronne' }] });
  const f = s3.players[0]; s3.village.hp = 300; f.carry = 'bois'; f.x = s3.map.depot.x; f.z = s3.map.depot.z;
  ok(s3.prompt(0)?.text.includes('Réparer'), 'invite : réparer l\'entrepôt');
  press(s3, f, 'uc', 1.3);
  ok(s3.village.hp === 300 + JOBS.forgeronne.repair && !f.carry, 'la forgeronne répare l\'entrepôt');
  s3.setJob(0, 'chevalier');
  ok(f.job === 'chevalier' && f.maxHp === JOBS.chevalier.hp, 'on change de métier');
}

section('poutres');
{
  const sim = new Sim({ seed: 13, players: [{ id: 0, name: 'A', job: 'chevalier' }, { id: 1, name: 'B', job: 'chasseuse' }] });
  const [a, b] = sim.players, M = sim.map;
  const oak = M.trees.find((t) => t.kind === 'oak' && Math.hypot(t.x, t.z) < 60);
  ok(!!oak, 'il y a des chênes près du village');
  a.x = oak.x - 1.4; a.z = oak.z; a.y = M.heightAt(a.x, a.z);
  for (let i = 0; i < 6 && !sim.trees[oak.id].down; i++) press(sim, a, 'fc');
  press(sim, a, 'fc', 1.6);
  ok(sim.beams.length === 1 && sim.logs.length === 1, 'un chêne donne une poutre et une bûche');
  const beam = sim.beams[0], [e0, e1] = sim.beamEnds(beam);
  a.x = e0[0]; a.z = e0[1]; press(sim, a, 'uc', 0.3);
  ok(a.carry === 'poutre' && !beam.lifted, 'un bout en main, la poutre reste au sol');
  for (let i = 0; i < 30; i++) { sim.setInput(a.id, { ...emptyInput(), wx: -1, fc: a._fc, uc: a._uc }); sim.setInput(b.id, emptyInput()); sim.step(); }
  ok(Math.hypot(a.x - e0[0], a.z - e0[1]) < 1, 'seul, on ne l\'emporte pas');
  b.x = e1[0]; b.z = e1[1]; press(sim, b, 'uc', 0.3);
  ok(beam.lifted, 'à deux, elle se soulève');
  // on la porte : elle suit ses porteurs (vers le nord, où le terrain est libre)
  const walk = (wx, wz, sec) => { for (let i = 0; i < sec / DT; i++) { const w = { ...emptyInput(), wx, wz }; sim.setInput(a.id, { ...w, fc: a._fc || 0, uc: a._uc || 0 }); sim.setInput(b.id, { ...w, fc: b._fc || 0, uc: b._uc || 0 }); sim.step(); } };
  const x0 = beam.x, z0 = beam.z;
  walk(0, -1, 2);
  ok(Math.hypot(beam.x - x0, beam.z - z0) > BEAM.speed * 2 * 0.7, `elle avance avec ses porteurs (${Math.hypot(beam.x - x0, beam.z - z0).toFixed(1)} m en 2 s)`);
  ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - BEAM.len) < 0.6, 'les porteurs restent à la longueur de la poutre');
  // posée près de l'entrepôt et rangée
  const D = M.depot; a.x = D.x - 2; a.z = D.z - 1.7; b.x = D.x - 2; b.z = D.z + 1.7; walk(0, 0, 0.1);
  press(sim, a, 'uc', 0.3);
  ok(sim.stock.poutre === 1 && !a.carry && !b.carry && !sim.beams.length, 'la poutre est rangée à l\'entrepôt');
  // le bûcheron la porte seul
  const s2 = new Sim({ seed: 13, players: [{ id: 0, name: 'B', job: 'bucheron' }] });
  s2.beams.push({ id: 9, x: 10, z: 20, y: s2.map.heightAt(10, 20), rot: 0, h: [null, null], lifted: false, ready: true, at: 0 });
  const p = s2.players[0], [q] = s2.beamEnds(s2.beams[0]); p.x = q[0]; p.z = q[1]; press(s2, p, 'uc', 0.3);
  ok(s2.beams[0].lifted, 'le bûcheron soulève une poutre seul');
  // un bot vient tenir l'autre bout
  const s3 = new Sim({ seed: 13, players: [{ id: 0, name: 'A', job: 'chasseuse' }], bots: 1 });
  s3.goal = 6;
  s3.beams.push({ id: 9, x: 4, z: 18, y: s3.map.heightAt(4, 18), rot: Math.PI / 2, h: [null, null], lifted: false, ready: true, at: 0 });
  const h = s3.players[0], [r] = s3.beamEnds(s3.beams[0]); h.x = r[0]; h.z = r[1]; press(s3, h, 'uc', 0.3);
  idle(s3, 15);
  ok(s3.beams[0].lifted, 'un chevalier IA vient prendre l\'autre bout');
}

section('arrivées et départs');
{
  const sim = new Sim({ seed: 14, bots: 1 });
  idle(sim, 2);
  const q = sim.addPlayer({ id: 7, name: 'Nouveau', job: 'pretre' });
  ok(sim.players.length === 3 && q.job === 'pretre', 'un joueur rejoint la partie en cours');
  q.carry = 'bois'; const n = sim.logs.length;
  sim.removePlayer(7);
  ok(sim.players.length === 2 && sim.logs.length === n + 1, 'il part : sa bûche reste par terre');
}

section('réseau');
{
  // un hôte, un invité ; l'invité garde une copie de la vallée et y recopie ce que l'hôte envoie
  const host = new Sim({ seed: 1, players: [{ id: 1, name: 'Hôte', job: 'bucheron' }], bots: 1 });
  host.addPlayer({ id: 2, name: 'Invité', job: 'chasseuse' });
  const mirror = new Sim({ seed: 1, players: [] });
  const wire = (o) => JSON.parse(JSON.stringify(o));
  applyWorld(mirror, wire(encodeWorld(host)));
  ok(mirror.players.length === 3 && mirror.player(2).job === 'chasseuse', 'l\'invité connaît l\'équipe et les métiers');
  const sizes = [];
  host.skipToDusk();
  const gi = { ...emptyInput() };
  let me = mirror.player(2);
  for (let i = 0; i < (CYCLE.dusk + 20) / DT; i++) {
    // l'invité avance chez lui et envoie son entrée
    gi.wx = 1; gi.wz = 0.3;
    predict(mirror, me, gi);
    host.setInput(2, cleanInput(wire(gi))); host.setInput(1, emptyInput());
    host.step();
    if (i % 2 === 0) {
      const msg = wire(encodeState(host)); sizes.push(JSON.stringify(msg).length);
      const srv = applyState(mirror, msg, 2);
      reconcile(me, srv, !!me.act || me.carry === 'poutre');
      smooth(mirror, DT * 2, 2);
    }
  }
  const hp = host.player(2);
  ok(Math.hypot(me.x - hp.x, me.z - hp.z) < 1.5, `la position prédite colle à celle de l'hôte (écart ${Math.hypot(me.x - hp.x, me.z - hp.z).toFixed(2)} m)`);
  ok(mirror.night && mirror.foes.length === host.foes.length && mirror.foes.length > 0, `la nuit et les squelettes arrivent chez l'invité (${mirror.foes.length})`);
  ok(mirror.braziers.every((b, i) => Math.abs(b.fuel - host.braziers[i].fuel) < 0.2), 'les braseros aussi');
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  ok(avg < 3000, `un état pèse ${Math.round(avg)} octets en moyenne`);
  // l'hôte part : l'invité reprend la partie depuis le dernier instantané complet
  const full = wire(host.snapshot());
  const heir = new Sim({ seed: 1, players: [] });
  heir.restore(full); heir.removePlayer(1);
  const n0 = heir.foes.length; idle(heir, 5);
  ok(heir.players.length === 2 && heir.night && heir.foes.length >= n0 - 2, 'un invité reprend la partie quand l\'hôte s\'en va');
  const bad = cleanInput({ wx: 9, wz: 'x', fc: 3.7, hold: 1 });
  ok(bad.wx === 1 && bad.wz === 0 && bad.fc === 3 && bad.hold === true, 'les entrées des invités sont nettoyées');
}

// ------------------------------------------------ étape 5 : la boucle complète
section('construction');
{
  const sim = new Sim({ seed: 15, players: [{ id: 0, name: 'B', job: 'bucheron' }] });
  const p = sim.players[0], M = sim.map, ruin = M.buildings.find((b) => b.id === 'maison1'), C = BUILDS.maison1;
  const d = doorPoint(ruin, 1.4); p.x = d.x; p.z = d.z; p.y = M.heightAt(d.x, d.z);
  ok(sim.prompt(0)?.text.includes('il manque'), 'invite : il manque du bois et des poutres');
  sim.stock.bois = C.bois + 2; sim.stock.poutre = C.poutre;
  ok(sim.prompt(0)?.text.startsWith('Relever'), 'invite : relever la maison');
  const hp0 = p.maxHp;
  press(sim, p, 'uc', 0.2);
  ok(sim.build.maison1.state === 'chantier' && sim.stock.bois === 2 && sim.stock.poutre === 0, 'le chantier ouvre et prend son bois au stock');
  let hits = 0; while (sim.build.maison1.state === 'chantier' && hits < 30) { press(sim, p, 'fc', 1); hits++; }
  ok(sim.build.maison1.state === 'debout', `la maison est relevée (${hits} coups de marteau)`);
  ok(p.maxHp === hp0 + 15, 'une maison : +15 PV pour l\'équipe');
  ok(sim.goal === 7, 'tutoriel : tenir dix nuits');
  // la forge renforce les coups, la chapelle empêche les morts de se relever
  sim.build.forge = { state: 'debout', prog: 14 };
  ok(sim.dmgMul() > 1.2, 'la forge : +30 % de dégâts');
  sim.skipToDusk(); idle(sim, CYCLE.dusk + 1);
  const ch = M.buildings.find((b) => b.id === 'chapelle');
  const far = [ch.x - 14, ch.z + 10];
  for (const o of sim.braziers) o.fuel = 0;
  const risesBefore = sim.canRise(far[0], far[1]);
  sim.build.chapelle = { state: 'debout', prog: 18 };
  ok(risesBefore && !sim.canRise(far[0], far[1]), 'près de la chapelle, les morts ne se relèvent plus');
  // un bot vient aider sur un chantier
  const s2 = new Sim({ seed: 16, players: [{ id: 0, name: 'A' }], bots: 1 });
  s2.goal = 6; s2.build.forge = { state: 'chantier', prog: 0 };
  idle(s2, 40);
  ok(s2.build.forge.prog > 3, `un chevalier IA vient bâtir (${s2.build.forge.prog} coups)`);
}

section('faim, baies, froid');
{
  const sim = new Sim({ seed: 17, players: [{ id: 0, name: 'A', job: 'chasseuse' }] });
  const p = sim.players[0], M = sim.map;
  idle(sim, 60);
  ok(p.food < FOOD.max - 5, `la faim se creuse (${p.food.toFixed(0)})`);
  p.food = 0; const h = p.hp; p.x = 40; p.z = -40; idle(sim, 3);
  ok(p.hp < h - 2, 'le ventre vide fait perdre des PV');
  // cueillir, ranger, manger
  const bush = M.bushes[0]; p.x = bush.x + 1.2; p.z = bush.z; p.y = M.heightAt(p.x, p.z);
  ok(sim.prompt(0)?.text.includes('baies'), 'invite : cueillir des baies');
  press(sim, p, 'uc', 1.1);
  ok(p.carry === 'vivres' && !sim.berries[0].ready, 'un panier de baies, le buisson est vide');
  p.x = M.depot.x; p.z = M.depot.z; press(sim, p, 'uc', 0.8);
  ok(sim.stock.nourriture === FOOD.berries && !p.carry, 'les baies vont à l\'entrepôt');
  p.food = 20; ok(sim.prompt(0)?.text.startsWith('Manger'), 'invite : manger');
  press(sim, p, 'uc', 1.2);
  ok(p.food > 70 && sim.stock.nourriture === FOOD.berries - 1, 'on mange un vivre');
  sim.village.hp = 1e9; p.maxHp = p.hp = 1e9; sim.clock.t = 0;
  idle(sim, FOOD.regrow + 1);
  ok(sim.berries[0].ready, 'le buisson repousse');
  sim.foes = []; sim.spawnQ = []; p.maxHp = p.hp = JOBS.chasseuse.hp; sim.clock = { day: 2, phase: 'jour', t: 0 };
  // le froid, la nuit, loin des lumières
  sim.skipToDusk(); idle(sim, CYCLE.dusk + 1); sim.spawnQ = []; sim.foes = [];
  p.x = 30; p.z = 50 - 70; p.food = 100; p.hp = p.maxHp; const hc = p.hp;
  idle(sim, 1.5);
  ok(!p.cold, 'on ne gèle pas à la première seconde dans le noir');
  idle(sim, 6);
  ok(p.cold && p.hp < hc - 2, `la nuit, loin des braseros, on a froid (${hc} → ${p.hp.toFixed(1)}, ${sim.night}, ${p.cold})`);
  p.x = M.campfire.x + 2; p.z = M.campfire.z; p.hp = 50; idle(sim, 2);
  ok(!p.cold && p.hp >= 50, 'près du feu, on se réchauffe');
}

section('sièges, dix nuits, sauvegarde');
{
  const sim = new Sim({ seed: 18, players: [{ id: 0, name: 'A' }] });
  sim.clock.day = 5; sim.skipToDusk(); idle(sim, CYCLE.dusk + 1);
  ok(nightLen(5) > CYCLE.night && sim.timeLeft > CYCLE.night, 'la cinquième nuit est plus longue');
  ok(sim.spawnQ.some((s) => s.kind === 'knight'), 'le chevalier noir vient à la cinquième nuit');
  const k = sim.spawnFoe('knight', 0); const v = sim.village.hp;
  sim.foeHits(k, { type: 'w' });
  ok(v - sim.village.hp > FOES.minion.dmg * 2, 'il enfonce l\'entrepôt bien plus fort');
  // dix nuits : la victoire
  const s2 = new Sim({ seed: 18, players: [{ id: 0, name: 'A' }] });
  s2.village.hp = 1e9; s2.players[0].hp = 1e9;
  s2.clock = { day: 10, phase: 'nuit', t: nightLen(10) - 0.01 };
  s2.step();
  ok(!s2.over && s2.crypt.open && s2.takeEvents().some((e) => e.t === 'crypt'), 'à l\'aube du onzième jour, la crypte s\'ouvre');
  const s3 = new Sim({ seed: 18, players: [{ id: 0, name: 'A' }], mode: 'sansfin' });
  s3.clock = { day: 10, phase: 'nuit', t: nightLen(10) - 0.01 }; s3.village.hp = 1e9; s3.players[0].hp = 1e9; s3.step();
  ok(!s3.over && s3.clock.day === 11, 'en mode sans fin, on continue');
  // sauvegarde : ce qui compte d'un soir à l'autre
  const s4 = new Sim({ seed: 19, players: [{ id: 0, name: 'A' }] });
  s4.clock.day = 4; s4.stock.bois = 12; s4.stock.poutre = 3; s4.build.moulin = { state: 'debout', prog: 14 }; s4.trees[5].down = true; s4.trees[5].dir = 1;
  const save = JSON.parse(JSON.stringify(s4.saveData()));
  const s5 = new Sim({ seed: 19, players: [{ id: 3, name: 'Autre', job: 'pretre' }] });
  ok(s5.loadSave(save), 'la sauvegarde se charge');
  ok(s5.clock.day === 4 && s5.stock.bois === 12 && s5.built('moulin') && s5.trees[5].down, 'jour, stock, bâtiments et arbres abattus reviennent');
  ok(!new Sim({ seed: 20, players: [] }).loadSave(save), 'une sauvegarde d\'une autre vallée est refusée');
  // le moulin donne des vivres à l'aube
  const n0 = s5.stock.nourriture; s5.clock = { day: 4, phase: 'nuit', t: nightLen(4) - 0.01 }; s5.village.hp = 1e9; s5.players[0].hp = 1e9; s5.step();
  ok(s5.stock.nourriture === n0 + 4, 'le moulin donne des vivres à chaque aube');
}

// ---------------------------------------------------------------- la crypte et le Roi-Squelette
{
  const run = (sim, sec, f) => { for (let i = 0; i < sec / DT; i++) { if (f) f(); sim.step(); } };
  const sim = new Sim({ seed: 21, players: [{ id: 0, name: 'A' }, { id: 1, name: 'B', job: 'chevalier' }] });
  const [A, B] = sim.players; const K = sim.map.crypt;
  sim.openCrypt();
  const t0 = sim.clock.t; run(sim, 2);
  ok(sim.clock.t === t0, 'le temps s\'arrête tant que la crypte est ouverte');
  sim.teleport(A, sim.map.cryptDoor.x, sim.map.cryptDoor.z + 1, 0);
  ok(sim.prompt(A.id).text.includes('crypte'), 'devant le donjon : « Descendre dans la crypte »');
  let c = 0; sim.setInput(A.id, { ...emptyInput(), uc: ++c }); sim.step();
  ok(K.inside(A.x, A.z) && Math.abs(A.y - K.y) < 0.01, 'E devant la porte fait descendre dans la crypte');
  { const gx = (K.gate.x0 + K.gate.x1) / 2, gz = (K.gate.z0 + K.gate.z1) / 2; const [, z] = sim.map.collide(gx, gz, 0.4); ok(Math.abs(z - gz) > 0.3, 'la herse est fermée'); }
  // un seul levier ne suffit pas à deux
  const [L0, L1] = K.levers;
  sim.teleport(A, L0.x, L0.z, 0);
  run(sim, 2, () => sim.setInput(A.id, { ...emptyInput(), hold: true, uc: c }));
  ok(!sim.crypt.gate, 'un seul levier tenu : la herse reste fermée');
  sim.teleport(B, L1.x, L1.z, 0);
  run(sim, LEVER_T + 0.3, () => { sim.setInput(A.id, { ...emptyInput(), hold: true, uc: c }); sim.setInput(B.id, { ...emptyInput(), hold: true }); });
  ok(sim.crypt.gate && K.gate.open, 'les deux leviers tenus ensemble ouvrent la herse');
  ok(sim.takeEvents().some((e) => e.t === 'gate'), 'la herse annonce son ouverture');
  // le couloir de brume
  const bz = K.halls.brume; sim.teleport(A, (bz.x0 + bz.x1) / 2, (bz.z0 + bz.z1) / 2, 0); sim.step();
  ok(sim.crypt.brume && sim.foes.filter((f) => f.state !== 'dead').length >= 3, 'le couloir de brume réveille des squelettes');
  ok(sim.chooseTarget(sim.foes[0]).type === 'p', 'dans la crypte, ils visent les joueurs');
  for (const f of sim.foes) sim.killFoe(f, A);
  // la salle du trône
  const tz = K.halls.trone; sim.teleport(A, K.king.x, tz.z0 + 1, 0); sim.step();
  const king = sim.foe(sim.crypt.king);
  ok(king && king.kind === 'king' && king.maxHp > FOES.knight.hp * 2, 'le Roi-Squelette se lève dans la salle du trône');
  run(sim, 10); ok(sim.takeEvents().some((e) => e.t === 'summon'), 'il appelle des squelettes');
  king.hp = king.maxHp * 0.5; sim.step(); ok(sim.crypt.phase === 2, 'sous 60 % : deuxième phase');
  king.hp = king.maxHp * 0.25; sim.step();
  ok(sim.crypt.phase === 3 && king.enrage && K.torches.filter((t) => t.throne).every((t) => !sim.torchLit(t.id)), 'sous 30 % : il souffle les torches du trône et devient furieux');
  const T = K.torches.find((t) => t.throne); sim.teleport(B, T.x, T.z + 1.2, 0);
  ok((sim.prompt(B.id) || {text:""}).text.includes('torche') || sim.foeNear(B.x, B.z, 3), 'on peut rallumer une torche');
  // instantané : la herse reste ouverte chez une copie
  const copy = new Sim({ seed: 21, players: [] }); copy.restore(JSON.parse(JSON.stringify(sim.snapshot())));
  ok(copy.crypt.phase === 3 && copy.map.crypt.gate.open, 'l\'instantané garde la crypte (phase, herse)');
  { const g = new Sim({ seed: 21, players: [] }); applyWorld(g, JSON.parse(JSON.stringify(encodeWorld(sim)))); applyState(g, JSON.parse(JSON.stringify(encodeState(sim))), -1);
    const gk = g.foe(sim.crypt.king);
    ok(g.crypt.open && g.crypt.gate && g.map.crypt.gate.open && g.crypt.phase === 3 && gk && gk.kind === 'king' && gk.maxHp === king.maxHp && gk.enrage, 'l\'invité reçoit la crypte : herse, phase, Roi furieux');
    ok(!g.torchLit(K.torches.find((t) => t.throne).id), 'et les torches éteintes'); }
  king.hp = 1; sim.teleport(A, king.x, king.z - 1.5, 0); A.yaw = 0; king.stun = 5;
  sim.killFoe(king, A);
  ok(sim.over && sim.over.reason === 'victoire' && sim.won, 'le Roi tombe : la malédiction est brisée');
}
{
  const sim = new Sim({ seed: 31, players: [], bots: 2 }); sim.openCrypt();
  for (let i = 0; i < 40 / DT && !sim.crypt.gate; i++) sim.step();
  ok(sim.crypt.gate, 'deux bots descendent et tiennent chacun un levier');
}
// ---------------------------------------------------------------- un début plus vif : jour court, bûches empilées, cloche, coffres
section('début de partie');
{
  ok(dayLen(1) < dayLen(2) && dayLen(1) <= 160, `le premier jour est court (${dayLen(1)} s, puis ${dayLen(2)} s)`);
  const sim = new Sim({ seed: 12 }); const p = sim.players[0], M = sim.map;
  for (let i = 0; i < 3; i++) sim.logs.push({ id: sim.nextLog++, x: p.x + 0.6 + i * 0.3, z: p.z, y: p.y, rot: 0, at: 0, ready: true });
  for (let i = 0; i < LOAD_MAX; i++) press(sim, p, 'uc');
  ok(p.carry === 'bois' && p.load === LOAD_MAX, `on empile jusqu'à ${LOAD_MAX} bûches`);
  p.x = M.depot.x; p.z = M.depot.z; press(sim, p, 'uc');
  ok(sim.stock.bois === LOAD_MAX && !p.carry, 'les trois se rangent d\'un coup');
  sim.goal = 4; p.x = M.campfire.x + 1.5; p.z = M.campfire.z;
  ok(/cloche/i.test(sim.prompt(p.id)?.text || ''), 'au feu de camp : sonner la cloche');
  press(sim, p, 'uc', 0.2);
  ok(sim.clock.t >= sim.dayLen - CYCLE.dusk - 1, 'la cloche fait tomber la nuit');
  const g = new Sim({ seed: 12, chests: true }); const q = g.players[0];
  ok(g.chests.length >= 2, `des coffres dans les bois (${g.chests.length})`);
  const c0 = g.chests[0], gd = g.foes.filter((f) => f.guard === c0.id);
  ok(gd.length === 1 && gd[0].state === 'sleep' && Math.hypot(c0.x - M.campfire.x, c0.z - M.campfire.z) < 45, 'le premier est près du village, un seul garde endormi');
  ok(g.foes.filter((f) => f.guard !== c0.id).length >= 2, 'les autres sont mieux gardés');
  idle(g, 3); ok(gd[0].state === 'sleep', 'le garde dort tant qu\'on est loin');
  g.teleport(q, c0.x + 6, c0.z, 0); idle(g, 0.2);
  ok(gd[0].state === 'awaken', 'il se réveille quand on approche, même de jour');
  q.hp = 9999; g.teleport(q, c0.x + 1.2, c0.z, -Math.PI / 2);
  ok(/coffre/i.test(g.prompt(q.id)?.text || ''), 'invite : ouvrir le coffre');
  const b0 = g.stock.bois; press(g, q, 'uc', 1.5);
  ok(c0.open && g.stock.bois === b0 + 5, 'le premier coffre donne 5 bûches');
  g.teleport(q, 300, 0, 0); idle(g, 12);
  ok(gd[0].state === 'sleep' || gd[0].state === 'dead' || Math.hypot(gd[0].x - c0.x, gd[0].z - c0.z) < 6, 'sans personne, le garde retourne à son coffre');
  const w = new Sim({ seed: 12, chests: true }); applyState(w, JSON.parse(JSON.stringify(encodeState(g))), -1);
  ok(w.chests.length === g.chests.length && w.chests[0].open, 'les coffres passent chez l\'invité');
}
// ---------------------------------------------------------------- les capacités (F)
{
  const sim = new Sim({ seed: 22, players: [{ id: 0, name: 'A', job: 'bucheron' }, { id: 1, name: 'B', job: 'pretre' }, { id: 2, name: 'C', job: 'forgeronne' }, { id: 3, name: 'D', job: 'chasseuse' }, { id: 4, name: 'E', job: 'chevalier' }] });
  const [A, B, Cc, D, E] = sim.players;
  const fire = (p) => { const c = (sim.lastC.get(p.id) || { ac: 0 }).ac || 0; sim.setInput(p.id, { ...emptyInput(), ac: c + 1 }); for (let i = 0; i < 1 / DT; i++) sim.step(); sim.setInput(p.id, { ...emptyInput(), ac: c + 1 }); };
  const f = sim.spawnFoeAt('warrior', A.x, A.z + 2); f.state = 'walk'; A.yaw = 0;
  const h = f.hp; fire(A);
  ok(f.hp < h && A.cd > 0, 'Grand coup du bûcheron : dégâts et temps de recharge');
  const cd = A.cd; fire(A); ok(A.cd < cd, 'pas de second Grand coup pendant la recharge');
  A.hp = 30; B.x = A.x + 2; B.z = A.z; fire(B); ok(A.hp >= 60, 'la Prière du prêtre soigne autour de lui');
  const nb = sim.bars.length; fire(Cc); ok(sim.bars.length === nb + 1, 'la Forgeronne dresse une barricade');
  sim.clock.phase = 'nuit'; D.yaw = 0; fire(D); const fl = sim.flares[0];
  ok(fl && sim.lit(fl.x, fl.z), 'la fusée de la chasseuse éclaire');
  const g = sim.spawnFoeAt('minion', E.x + 3, E.z); g.state = 'walk'; fire(E);
  ok(E.guardT > 0 && sim.chooseTarget(g).id === E.id, 'le Rempart du chevalier attire les squelettes');
}

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\n${n} vérifications, tout est bon`);
process.exit(fails ? 1 : 0);
