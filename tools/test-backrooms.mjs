// Tests unitaires du moteur des Backrooms : node tools/test-backrooms.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBackroomsMap, CELL_SIZE, T } from '../backrooms/engine/map.js';
import { findPath, hasLineOfSight } from '../backrooms/engine/nav.js';
import { BackroomsSim, CALM_HOLD, HAUNT_COOLDOWN, DT, DEPART_T, BOARD_T, FUSES, WHISTLE_CD, GRAB_T, MONSTER_STUN_T, NOISE, PANEL_T, stairAt, stairLocal, feetY, mapPrint, LIFT_CLOSE_T, ARRIVE_T, FINALE_WAIT, HUNT_DELAY, WATER_DRAIN, WATER_RUN, THIRST_BLUR, ALMOND_WATER, WATER_LEVEL_MIN, LIFT_SHUT_T, LIFT_FACE, PLAYER_RADIUS, INV_SIZE, DROP_AHEAD, DOCK_OPEN_T, DOCK_CLOSE_T, DOCK_FORCE_T, ALARM_T, DUCT_LAND, HOTEL_LEVEL } from '../backrooms/engine/sim.js';
import { hideFront } from '../backrooms/engine/hides.js';
import { PIT_HALF, bfs, createLevel0, FLOOR_DY } from '../backrooms/engine/map.js';

// distance en marche (en cases) entre deux cases
// les tests du comportement de l'entité la veulent présente dès le départ : le prélude a son propre test
BackroomsSim.PRELUDE = false;
const bfsDist = (m, ax, az, bx, bz) => bfs(m.grid, m.W, m.H, ax, az)[bz * m.W + bx];

// amène un joueur sur une cassette, à son étage (celle du renfoncement : échelle posée, au pied de l'échelle)
const putOn = (sim, P, cas) => {
  P.floor = Math.max(0, sim.floors.findIndex((f) => (f.cassettes || []).includes(cas)));
  if (cas.high) {
    sim.fm(P.floor).niche.ladder = true;
    P.x = sim.fm(P.floor).niche.baseX;
    P.z = sim.fm(P.floor).niche.baseZ;
  } else {
    P.x = cas.x;
    P.z = cas.z;
  }
};
import { createWarehouseMap, DOCK_PASS } from '../backrooms/engine/level1.js';
import { createPoolMap } from '../backrooms/engine/poolrooms.js';
import { createHotelMap, parseWords, WORDS } from '../backrooms/engine/hotel.js';

// avance la partie de n secondes
const run = (sim, sec, input = {}, others = null) => {
  for (let i = 0; i < Math.round(sec / DT); i++) sim.step(input, others);
};

let count = 0;
function test(name, fn) {
  try {
    fn();
    count++;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name);
    throw err;
  }
}

const map = createBackroomsMap(42);

test('génération de la carte : dimensions, sols, murs et pièces', () => {
  assert.equal(map.W, 64);
  assert.equal(map.H, 64);
  assert.ok(map.walkable.length > 1500, 'au moins 1500 cases praticables');
  assert.equal(map.isWall(map.spawn.gx, map.spawn.gz), false, 'le spawn est sur du sol');
  assert.equal(map.isWall(map.exit.gx, map.exit.gz), false, 'la sortie est sur du sol');
});

test('cassettes VHS : 6 cassettes placées et atteignables', () => {
  assert.equal(map.cassettes.length, 6, 'exactement 6 cassettes');
  for (const cas of map.cassettes) {
    assert.equal(map.isWall(cas.gx, cas.gz), false, `la cassette ${cas.id} n'est pas dans un mur`);
    // celle du trou dans le mur se prend depuis le pied de l'échelle, dans la case devant le mur
    const to = cas.high ? { x: map.niche.baseX, z: map.niche.baseZ } : cas;
    const path = findPath(map, map.spawn.x, map.spawn.z, to.x, to.z);
    assert.ok(path, `un chemin existe du spawn vers la cassette ${cas.id}`);
  }
});

test('sortie : atteignable depuis le spawn', () => {
  const pathToExit = findPath(map, map.spawn.x, map.spawn.z, map.exit.x, map.exit.z);
  assert.ok(pathToExit, 'un chemin existe jusqu\'à la sortie');
  assert.ok(pathToExit.length > 5, 'la sortie n\'est pas collée au spawn');
});

test('champ de vision et raymarching : détection d\'obstacles', () => {
  // Même position : visible
  assert.ok(hasLineOfSight(map, 10, 10, 10, 10));
  // À travers le spawn dans la même pièce : visible
  assert.ok(hasLineOfSight(map, map.spawn.x, map.spawn.z, map.spawn.x + 0.5, map.spawn.z + 0.5));
});

test('simulation : déplacement du joueur et collisions murales', () => {
  const sim = new BackroomsSim({ map, difficulty: 'peaceful' });
  const startX = sim.player.x;
  const startZ = sim.player.z;

  // Avancer pendant 30 ticks
  for (let i = 0; i < 30; i++) {
    sim.step({ my: 1, yaw: 0 }); // avancer droit
  }
  assert.notEqual(sim.player.z, startZ, 'le joueur a avancé');
});

test("course infinie ; la soif monte peu à peu, plus vite en courant, et tue à sec", () => {
  const sim = new BackroomsSim({ map, difficulty: 'peaceful' });
  const P = sim.player;
  assert.equal(P.water, 100);
  assert.equal(P.stamina, undefined, "plus d'endurance");
  // on court une minute entière sans jamais s'essouffler
  let ran = 0;
  for (let i = 0; i < 60 / DT; i++) {
    sim.step({ my: 1, run: true, yaw: (i % 600) < 300 ? 0 : Math.PI });
    if (P.running) ran++;
  }
  assert.ok(ran > 0.95 * (60 / DT), `on court tout du long (${ran})`);
  const afterRun = 100 - P.water;
  assert.ok(Math.abs(afterRun - 60 * WATER_DRAIN * WATER_RUN) < 0.5, `en courant : -${afterRun.toFixed(1)} en une minute`);
  const w = P.water;
  run(sim, 60, { my: 1, yaw: 0, crouch: true });
  assert.ok(Math.abs(w - P.water - 60 * WATER_DRAIN) < 0.5, 'en marchant : plus lentement');
  // la vue se brouille sous THIRST_BLUR, puis on s'effondre
  P.water = THIRST_BLUR + 0.05;
  run(sim, 1);
  assert.ok(sim.drainEvents().some((e) => e.type === 'thirsty' && e.level === 1), 'premier signe de soif');
  P.water = 0.2;
  run(sim, 2);
  assert.equal(P.status, 'dead', 'mort de soif');
  assert.ok(sim.drainEvents().some((e) => e.type === 'dead' && e.thirst), "l'écran de fin sait que c'est la soif");
});

test("ramassage des 6 cassettes, l'ascenseur s'ouvre et descend au Level 1", () => {
  const map = createBackroomsMap(42);
  const sim = new BackroomsSim({ map, difficulty: 'peaceful' });
  assert.equal(sim.cassettes, 0);
  assert.ok(map.elevator, "l'ascenseur est creusé dans un mur");
  assert.equal(map.grid[map.elevator.gz * map.W + map.elevator.gx], T.EXIT);
  // fermé : la cabine est un mur
  assert.ok(sim.isColliding(map.elevator.x, map.elevator.z, 0.3));

  // chaque cassette est posée au sol : marcher dessus ne suffit plus, il faut F
  for (const cas of map.cassettes) {
    putOn(sim, sim.player, cas);
    sim.step();
    assert.ok(!cas.collected, `la cassette ${cas.id} ne se ramasse pas en passant`);
    sim.step({ pick: true });
    assert.ok(cas.collected, `F : la cassette ${cas.id} est ramassée`);
  }

  assert.equal(sim.cassettes, 6);
  // la 6e trouvée, rien ne se passe pendant quelques secondes
  assert.ok(!sim.drainEvents().some((e) => e.type === 'exitUnlocked'), 'rien tout de suite');
  run(sim, FINALE_WAIT - 0.3);
  assert.ok(!sim.drainEvents().some((e) => e.type === 'exitUnlocked'), "toujours rien juste avant FINALE_WAIT");
  assert.ok(sim.isColliding(map.elevator.x, map.elevator.z, 0.3), 'la cabine reste fermée pendant l\'attente');
  run(sim, 0.5);
  assert.ok(sim.drainEvents().some((e) => e.type === 'exitUnlocked'), 'puis tout se met en route');
  assert.ok(!sim.isColliding(map.elevator.x, map.elevator.z, 0.3), "ouvert : on peut entrer dans la cabine");

  // de l'entrée, on marche dans la cabine : elle ne part pas toute seule
  sim.player.x = map.exit.x;
  sim.player.z = map.exit.z;
  sim.player.yaw = Math.atan2(-map.elevator.dx, -map.elevator.dz);
  for (let i = 0; i < 120; i++) sim.step({ my: 1, yaw: sim.player.yaw });
  assert.ok(sim.inCabin(sim.player), 'le joueur est dans la cabine');
  assert.equal(sim.player.status, 'alive', "entrer ne suffit pas : il faut le bouton");
  assert.ok(!sim.drainEvents().some((e) => e.type === 'depart'));
  // F dans la cabine : le bouton, les portes se ferment, puis elle part
  sim.step({ pick: true });
  assert.ok(sim.drainEvents().some((e) => e.type === 'liftClose'), 'le bouton ferme les portes');
  run(sim, LIFT_CLOSE_T + 0.1);
  assert.equal(sim.player.status, 'elevator', 'portes fermées : la cabine emporte le joueur');
  assert.ok(sim.drainEvents().some((e) => e.type === 'depart'), "seul, l'ascenseur part dès les portes fermées");
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'playing');
  assert.equal(sim.level, 1, 'arrivée au Level 1');
  assert.equal(sim.map.level, 1);
  assert.equal(sim.player.status, 'alive');
  assert.ok(sim.drainEvents().some((e) => e.type === 'level'));
  // on reprend dans la cabine qui finit de descendre : immobile, portes fermées, puis elles s'ouvrent
  const A = sim.map.arrival;
  assert.ok(A, "le Level 1 a sa cabine d'arrivée");
  const Q = sim.player;
  assert.equal(Math.floor(Q.x / CELL_SIZE), A.gx);
  assert.equal(Math.floor(Q.z / CELL_SIZE), A.gz);
  assert.ok(sim.arriveT > 0);
  const x0 = Q.x, z0 = Q.z;
  run(sim, 1, { my: 1, yaw: Q.yaw });
  assert.ok(Math.hypot(Q.x - x0, Q.z - z0) < 1e-6, 'on ne bouge pas tant que la cabine descend');
  run(sim, ARRIVE_T);
  assert.ok(sim.drainEvents().some((e) => e.type === 'arrived'), 'les portes s\'ouvrent');
  run(sim, 6, { my: 1, yaw: Q.yaw });
  assert.ok(Math.hypot(Q.x - A.x, Q.z - A.z) > 3.4, 'on sort de la cabine');
  run(sim, 0.2);
  assert.ok(sim.liftShut, 'derrière nous, la cabine se referme');
  assert.ok(sim.isColliding(A.x, A.z, 0.3), "et on n'y rentre plus");
});

test("phase finale : après la pause, l'alarme ; quelques secondes plus tard, l'entité poursuit l'équipe sans relâche", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 7 });
  const P = sim.player;
  const M = sim.monster;
  sim.cassettes = 5;
  const cas = sim.allCassettes.find((c) => !c.high);
  for (const c of sim.allCassettes) if (c !== cas) c.collected = true;
  putOn(sim, P, cas);
  sim.step({ pick: true });
  assert.equal(sim.cassettes, 6);
  run(sim, FINALE_WAIT + 0.1);
  assert.ok(sim.open && !sim.hunt, "l'ascenseur s'ouvre, pas encore la traque");
  sim.drainEvents();
  run(sim, HUNT_DELAY);
  assert.ok(sim.hunt);
  const ev = sim.drainEvents().find((e) => e.type === 'finalHunt');
  assert.ok(ev, 'la traque est annoncée');
  assert.equal(M.mode, 'chase', 'elle fonce sur nous');
  assert.equal(M.floor, P.floor, 'à notre étage');
  const d = Math.hypot(M.x - P.x, M.z - P.z);
  assert.ok(d > 5 && d < 40, `assez près pour qu'on la sente venir (${d.toFixed(1)} m)`);
  // elle ne lâche plus : ni le calme, ni l'attente, même immobile dans le noir
  for (let i = 0; i < 4 / DT; i++) {
    sim.step({});
    if (P.status !== 'alive') break;
    assert.ok(M.mode === 'chase' || M.grabbing != null, `toujours en chasse (${M.mode})`);
  }
  // plus rapide qu'en marchant, moins qu'en courant
  sim.monster.mode = 'chase';
  if (P.status === 'alive') {
    sim.updateMonster();
    assert.ok(M.speed > WALK_SPEED * 1.3 && M.speed < 4.4, `vitesse ${M.speed.toFixed(2)}`);
  }
});

test('l\'entité : calcul du danger sonore selon la distance et course-poursuite', () => {
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  assert.ok(sim.hasMonster);

  // Loin : danger à 0
  sim.monster.x = map.spawn.x + 50;
  sim.monster.z = map.spawn.z + 50;
  sim.step();
  assert.equal(sim.monster.danger, 0, 'aucun bruit de monstre à plus de 35 m');

  // Rapproché à 10 m : danger monte
  sim.monster.x = sim.player.x + 10;
  sim.monster.z = sim.player.z;
  sim.step();
  assert.ok(sim.monster.danger > 0.2, 'le son s\'amplifie à 10 m');

  // Très proche à 2 m : danger très élevé (> 0.8)
  sim.monster.x = sim.player.x + 2;
  sim.monster.z = sim.player.z;
  sim.step();
  assert.ok(sim.monster.danger > 0.7, 'le son devient assourdissant à 2 m');

  // Contact : elle l'agrippe d'abord ; sans se débattre, c'est la fin
  sim.monster.x = sim.player.x + 0.5;
  sim.monster.z = sim.player.z + 0.5;
  sim.step();
  assert.ok(sim.player.grabT > 0, 'le contact est une prise, pas une mort immédiate');
  assert.equal(sim.monster.mode, 'grab');
  assert.ok(sim.drainEvents().some((e) => e.type === 'grab'));
  run(sim, GRAB_T + 0.2);
  assert.equal(sim.state, 'dead', 'le joueur meurt s\'il ne se débat pas');
  assert.equal(sim.player.status, 'dead');
  const events = sim.drainEvents();
  assert.ok(events.some((e) => e.type === 'jumpscare'), 'jumpscare déclenché à la mort');
});

test('la prise : se débattre libère, la seconde prise est mortelle', () => {
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  sim.monster.x = P.x + 0.5;
  sim.monster.z = P.z;
  sim.step();
  assert.ok(P.grabT > 0);
  for (let i = 0; i < 12 && P.grabT > 0; i++) sim.step({ struggle: 1 });
  assert.equal(P.grabT, 0, 'on se dégage en se débattant');
  assert.equal(P.status, 'alive');
  assert.equal(sim.monster.mode, 'stun', 'elle est sonnée');
  assert.ok(sim.drainEvents().some((e) => e.type === 'release' && e.escaped));
  run(sim, MONSTER_STUN_T + 0.5);
  assert.notEqual(sim.monster.mode, 'stun');
  sim.monster.mode = 'chase';
  sim.monster.x = P.x + 0.5;
  sim.monster.z = P.z;
  sim.step();
  assert.equal(P.status, 'dead', 'la seconde prise ne pardonne pas');
});

test('perception : accroupi derrière elle, on passe ; en courant, elle entend', () => {
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  M.dormantT = 0;
  sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H); // hors de la lumière franche du départ
  M.warpT = 999;
  // elle regarde ailleurs (dos au joueur), à 6 m
  M.x = P.x + 6;
  M.z = P.z;
  M.yaw = Math.PI / 2; // regarde vers +x : le joueur est derrière elle
  M.mode = 'patrol';
  M.stalkT = 99;
  M.ambushT = 99;
  P.flashlight = false;
  for (let i = 0; i < 20; i++) {
    sim.step({ crouch: true });
    M.x = P.x + 6;
    M.z = P.z;
    M.yaw = Math.PI / 2;
  }
  assert.notEqual(M.mode, 'chase', 'accroupi, immobile, dans son dos : rien');
  P.noise = 0;
  P.running = true;
  P.bumpV = NOISE.run;
  P.bumpT = 1;
  P.sawM = sim.time; // il l'a vue (sinon elle se montre d'abord : voir le test suivant)
  sim.step();
  assert.equal(M.mode, 'chase', 'un bruit de course tout près : elle se retourne');
  sim.map.brightCells = null;
});

test("vue d'abord : avant la 3e cassette, elle ne se lance pas sur quelqu'un qui ne l'a pas vue ; vue, elle charge", () => {
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  M.dormantT = 0;
  sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H);
  M.warpT = 999;
  M.stalkT = 99;
  M.ambushT = 99;
  P.flashlight = false;
  // elle est dans son dos, à 5 m, et l'entend courir
  M.x = P.x - Math.sin(P.yaw) * -5;
  M.z = P.z - Math.cos(P.yaw) * -5;
  M.mode = 'patrol';
  let chased = false;
  for (let i = 0; i < 60; i++) {
    P.running = true;
    P.bumpV = NOISE.run;
    P.bumpT = 1;
    sim.step();
    if (M.mode === 'chase') chased = true;
  }
  assert.ok(!chased, "jamais lancée dans le dos de quelqu'un qui ne l'a pas vue");
  assert.equal(M.mode, 'watch', 'elle se montre : postée, tournée vers lui');
  // il la voit (de près) : elle charge
  P.yaw = Math.atan2(-(M.x - P.x), -(M.z - P.z));
  let charged = false;
  for (let i = 0; i < 120 && !charged; i++) {
    sim.step();
    if (M.mode === 'chase') charged = true;
  }
  assert.ok(charged, 'vue, elle se lance');
  // à partir de la 3e cassette, une partie des poursuites peut partir dans le dos
  sim.cassettes = 3;
  M.mode = 'patrol';
  M.chasedAt = -1e9;
  P.sawM = -1e9;
  M.backRollT = sim.time + 99;
  M.backOk = true;
  assert.ok(sim.mayChase(M, P, false), 'tirage favorable : elle peut partir dans le dos');
  M.backOk = false;
  assert.ok(!sim.mayChase(M, P, false), 'sinon elle se montre encore');
  sim.map.brightCells = null;
});

test('nez à nez : découverte en face, de près, elle hurle et fonce (même au repos)', () => {
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H); // hors de la lumière franche du départ
  M.warpT = 999;
  // une direction dégagée sur 6,5 m depuis le départ (plus près, elle chargerait d'elle-même)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [dx, dz] = dirs.find(([x, z]) => hasLineOfSight(sim.map, P.x, P.z, P.x + x * 6.5, P.z + z * 6.5));
  const place = () => {
    M.x = P.x + dx * 6.5;
    M.z = P.z + dz * 6.5;
  };
  place();
  M.mode = 'watch';
  M.waitT = 99;
  M.dormantT = 99;
  M.yaw = Math.atan2(-dx, -dz);
  P.flashlight = true;
  // le joueur regarde ailleurs : elle reste plantée là
  P.yaw = Math.atan2(dx, dz);
  for (let i = 0; i < 60; i++) {
    sim.step({ yaw: P.yaw, pitch: 0 });
    place();
  }
  assert.equal(M.mode, 'watch', 'pas vue : elle observe');
  // il se retourne et la voit en plein dans sa lampe
  const yaw = Math.atan2(-dx, -dz);
  sim.events.length = 0;
  for (let i = 0; i < 20; i++) {
    sim.step({ yaw, pitch: 0 });
    place();
  }
  assert.notEqual(M.mode, 'chase', 'un regard fugace ne suffit pas');
  for (let i = 0; i < 25; i++) sim.step({ yaw, pitch: 0 });
  assert.equal(M.mode, 'chase', 'découverte : elle charge');
  assert.ok(M.rushT > 0, 'en hurlant (charge rapide)');
  assert.ok(sim.events.some((e) => e.type === 'rush'), 'le cri est annoncé');
  // elle crie d'abord sur place, puis part en courant
  for (let i = 0; i < 60 && M.windT > 0; i++) {
    assert.equal(M.speed, 0, 'immobile le temps du cri');
    sim.step({ yaw, pitch: 0 });
  }
  sim.step({ yaw, pitch: 0 });
  assert.ok(M.speed > sim.monsterChaseSpeed, 'plus vite qu\'une poursuite ordinaire');
  sim.map.brightCells = null;
});

test('la fixer de loin la provoque ; s\'en approcher aussi ; la lampe ne la fait plus fuir', () => {
  let stared = 0;
  let approached = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const make = () => {
      const sim = new BackroomsSim({ seed, difficulty: 'normal' });
      sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H);
      sim.glimpseAt = Infinity;
      sim.director.huntT = 1e9;
      sim.director.fakeT = 1e9;
      return sim;
    };
    const sim = make();
    const P = sim.player;
    const M = sim.monster;
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([x, z]) => hasLineOfSight(sim.map, P.x, P.z, P.x + x * 12, P.z + z * 12));
    if (!dir) continue;
    const [dx, dz] = dir;
    const put = (d) => {
      M.x = P.x + dx * d;
      M.z = P.z + dz * d;
    };
    // elle observe à 12 m ; il la fixe, lampe allumée
    put(12);
    Object.assign(M, { mode: 'watch', waitT: 99, dormantT: 0, warpT: 1e9, flees: 0 });
    P.flashlight = true;
    const yaw = Math.atan2(-dx, -dz);
    sim.events.length = 0;
    for (let i = 0; i < 30; i++) {
      sim.step({ yaw, pitch: 0 });
      put(12);
    }
    assert.notEqual(M.mode, 'flee', 'la lampe ne la fait plus fuir');
    assert.notEqual(M.mode, 'chase', 'une demi-seconde de loin ne suffit pas');
    for (let i = 0; i < 60 && M.mode !== 'chase'; i++) sim.step({ yaw, pitch: 0 });
    assert.equal(M.mode, 'chase', 'fixée une seconde à 12 m : elle charge');
    assert.ok(M.rushT > 0 && sim.events.some((e) => e.type === 'rush'), 'en hurlant');
    stared++;
    // une autre : elle observe à 5 m, il regarde ailleurs mais elle le voit (et lui l'a vue juste avant de se
    // détourner : sans ça, elle ne se lance pas dans son dos)
    const s2 = make();
    const Q = s2.player;
    const N = s2.monster;
    N.x = Q.x + dx * 5;
    N.z = Q.z + dz * 5;
    Object.assign(N, { mode: 'watch', waitT: 99, dormantT: 0, warpT: 1e9 });
    Q.flashlight = false;
    Q.sawM = s2.time;
    for (let i = 0; i < 10; i++) s2.step({ yaw: Math.atan2(dx, dz), pitch: 0 });
    assert.equal(N.mode, 'chase', 'trop près d\'elle : elle charge');
    approached++;
  }
  assert.ok(stared >= 4 && approached >= 4, `cas testés (${stared}, ${approached})`);
});

test('zone très éclairée : à l\'abri, elle ne s\'y lance pas ; elle renonce au bord de l\'ombre et s\'y fond, hors de vue', () => {
  // une carte neuve : les parties d'avant laissent parfois un néon de la zone claire éteint ou grésillant (leurs
  // fantômes n'ont pas eu le temps de le rallumer), et le départ ne serait plus à l'abri
  const sim = new BackroomsSim({ map: createBackroomsMap(42), difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  assert.ok(sim.brightCell(sim.map, P.x, P.z), 'le départ est dans une zone claire');
  M.dormantT = 0;
  M.warpT = 999;
  const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([x, z]) => hasLineOfSight(sim.map, P.x, P.z, P.x + x * 6, P.z + z * 6));
  const put = () => {
    M.x = P.x + dx * 6;
    M.z = P.z + dz * 6;
  };
  put();
  M.mode = 'patrol';
  M.stalkT = 99;
  M.ambushT = 99;
  P.flashlight = false;
  P.yaw = Math.atan2(dx, dz); // il regarde ailleurs
  P.running = true;
  P.bumpV = NOISE.run;
  P.bumpT = 1;
  sim.step({ yaw: P.yaw });
  assert.notEqual(M.mode, 'chase', 'dans la lumière, un bruit de course à 6 m ne la lance pas');
  // déjà lancée : elle renonce au bord de la lumière et l'observe
  M.mode = 'chase';
  M.unseenT = 0;
  for (let i = 0; i < 60 * 3 && M.mode === 'chase'; i++) {
    sim.step({ yaw: P.yaw });
    put();
  }
  assert.notEqual(M.mode, 'chase', 'elle renonce au bord de la lumière');
  // il la regarde : elle ne reste pas plantée là à le fixer, elle se glisse hors de sa vue
  let still = 0;
  let worst = 0;
  let px = M.x;
  let pz = M.z;
  const d0 = Math.hypot(M.x - P.x, M.z - P.z);
  for (let i = 0; i < 60 * 6; i++) {
    sim.step({ yaw: Math.atan2(-(M.x - P.x), -(M.z - P.z)) });
    const v = Math.hypot(M.x - px, M.z - pz) / DT;
    px = M.x;
    pz = M.z;
    still = v < 0.4 && sim.inSomeView(0, M.x, M.z) && Math.hypot(M.x - P.x, M.z - P.z) < 22 ? still + DT : 0;
    worst = Math.max(worst, still);
    assert.notEqual(M.mode, 'chase', 'à l\'abri, il ne risque rien');
  }
  assert.ok(worst < 1.5, `jamais plantée à le fixer (${worst.toFixed(1)} s immobile sous ses yeux)`);
  assert.ok(!sim.inSomeView(0, M.x, M.z) || Math.hypot(M.x - P.x, M.z - P.z) > d0 + 4, 'elle a quitté sa vue (ou s\'éloigne)');
  // pendant une coupure, plus d'abri
  sim.blackout = 10;
  assert.ok(!(sim.level === 0 && !(sim.blackout > 0) && sim.brightCell(sim.map, P.x, P.z)), 'la coupure retire l\'abri');
});

test("jamais plantée sous les yeux du joueur : fixée, elle charge ; vue de côté, ou devant un joueur à l'abri, elle se glisse hors de vue", () => {
  const C = CELL_SIZE;
  const at = (c) => ({ x: (c.x + 0.5) * C, z: (c.z + 0.5) * C });
  const look = (P, M, off = 0) => () => Math.atan2(-(M.x - P.x), -(M.z - P.z)) + off;
  // le plus long moment où elle reste immobile (ni pas, ni demi-tour), hors poursuite, dans le cadre d'un joueur
  const watchIt = (sim, sec, yaw) => {
    const P = sim.player;
    const M = sim.monster;
    let px = M.x;
    let pz = M.z;
    let pyaw = M.yaw || 0;
    let t = 0;
    let worst = 0;
    let charged = false;
    let grabbed = false;
    let hidden = false;
    const d0 = Math.hypot(M.x - P.x, M.z - P.z);
    for (let i = 0; i < Math.round(sec / DT); i++) {
      sim.step({ yaw: yaw(), pitch: 0 });
      if (!sim.viewerOf(M, 22) && M.mode !== 'chase') hidden = true;
      if (M.mode === 'chase') charged = true;
      if (M.mode === 'grab' || P.grabT > 0 || P.status !== 'alive') {
        grabbed = true;
        break;
      }
      const v = Math.hypot(M.x - px, M.z - pz) / DT;
      const w = Math.abs(Math.atan2(Math.sin((M.yaw || 0) - pyaw), Math.cos((M.yaw || 0) - pyaw))) / DT;
      px = M.x;
      pz = M.z;
      pyaw = M.yaw || 0;
      t = sim.viewerOf(M, 22) && v < 0.4 && w < 0.6 && M.mode !== 'chase' ? t + DT : 0;
      worst = Math.max(worst, t);
    }
    return { worst, charged, grabbed, hidden, away: Math.hypot(M.x - P.x, M.z - P.z) - d0 };
  };
  const make = (seed) => {
    const sim = new BackroomsSim({ seed, difficulty: 'normal' });
    sim.glimpseAt = Infinity;
    if (sim.director) Object.assign(sim.director, { phase: 'build', huntT: 1e9, fakeT: 1e9 });
    return sim;
  };
  // une case libre en vue du joueur, entre dMin et dMax
  const inView = (sim, P, dMin, dMax, ok = () => true) => sim.map.walkable.map(at).find((p) => {
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    return d > dMin && d < dMax && !sim.map.pillarAt(Math.floor(p.x / C), Math.floor(p.z / C)) && hasLineOfSight(sim.map, P.x, P.z, p.x, p.z) && ok(p);
  });
  const n = { fixee: 0, cote: 0, lumiere: 0, recoin: 0, apparition: 0 };
  for (const seed of [42, 1, 9, 31]) {
    // dans le noir, lampe éteinte, il la fixe : elle charge (au bout d'une seconde au plus)
    for (const off of [0, 0.75]) {
      const sim = make(seed);
      const P = sim.player;
      const M = sim.monster;
      const free = (p) => !sim.brightCell(sim.map, p.x, p.z) && !sim.litCell(sim.map, p.x, p.z) && !sim.map.pillarAt(Math.floor(p.x / C), Math.floor(p.z / C)) && !(sim.map.calm || []).some((k) => k.cells.some((q) => q.x === Math.floor(p.x / C) && q.z === Math.floor(p.z / C)));
      const home = sim.map.walkable.map(at).filter(free).find((p) => inView(sim, p, 9, 16, free));
      if (!home) continue;
      Object.assign(P, home);
      P.flashlight = false;
      const s = inView(sim, P, 9, 16, free);
      Object.assign(M, { x: s.x, z: s.z, mode: 'watch', waitT: 30, dormantT: 0, warpT: 1e9, watch: null, path: [] });
      M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
      const r = watchIt(sim, off ? 6 : 3, look(P, M, off));
      assert.ok(r.worst < 1.5, `graine ${seed}${off ? ', vue de côté' : ''} : plantée ${r.worst.toFixed(1)} s sous ses yeux`);
      if (!off) {
        assert.ok(r.charged, `graine ${seed} : fixée, elle charge`);
        n.fixee++;
      } else {
        assert.ok(!r.charged, `graine ${seed} : vue de côté et de loin, elle ne charge pas`);
        assert.ok(r.hidden || r.away > 3, `graine ${seed} : vue de côté, elle se glisse hors de vue (ou s'éloigne)`);
        n.cote++;
      }
    }
    // à l'abri dans la lumière franche, ou dans un recoin calme : elle le poursuivait, elle ne reste pas plantée devant
    {
      const sim = make(seed);
      const P = sim.player;
      const M = sim.monster;
      if (sim.brightCell(sim.map, P.x, P.z)) {
        const s = inView(sim, P, 8, 14, (p) => !sim.brightCell(sim.map, p.x, p.z));
        if (s) {
          Object.assign(M, { x: s.x, z: s.z, mode: 'chase', dormantT: 0, warpT: 1e9, unseenT: 0, lastSeenX: P.x, lastSeenZ: P.z, repathT: 0 });
          const r = watchIt(sim, 6, look(P, M));
          assert.ok(r.worst < 1.5, `graine ${seed}, à l'abri dans la lumière : plantée ${r.worst.toFixed(1)} s`);
          n.lumiere++;
        }
      }
    }
    {
      const sim = make(seed);
      const P = sim.player;
      const M = sim.monster;
      const nook = (sim.map.calm || [])[0];
      if (nook) {
        Object.assign(P, at(nook.cells[nook.cells.length - 1]));
        const s = inView(sim, P, 5, 12);
        if (s) {
          Object.assign(M, { x: s.x, z: s.z, mode: 'chase', dormantT: 0, warpT: 1e9, unseenT: 0, lastSeenX: P.x, lastSeenZ: P.z, repathT: 0 });
          const r = watchIt(sim, 6, look(P, M));
          assert.ok(r.worst < 1.5 && !r.grabbed, `graine ${seed}, dans un recoin calme : plantée ${r.worst.toFixed(1)} s${r.grabbed ? ', attrapé' : ''}`);
          n.recoin++;
        }
      }
    }
    // la première rencontre : vue de côté (pas en plein centre), elle disparaît vite elle aussi
    {
      const sim = new BackroomsSim({ seed, difficulty: 'normal' });
      if (sim.director) Object.assign(sim.director, { huntT: 1e9, fakeT: 1e9 });
      const P = sim.player;
      const M = sim.monster;
      // hors de la zone éclairée du départ (elle n'apparaît jamais dans la lumière franche), là où une longue vue s'ouvre
      const dim = (p) => !sim.brightCell(sim.map, p.x, p.z);
      const home = sim.map.walkable.map(at).find((p) => dim(p) && inView(sim, p, 13, 19, dim));
      if (home) Object.assign(P, home);
      sim.glimpseAt = 0;
      let show = null;
      for (let i = 0; i < 60 * 30 && !show; i++) {
        sim.events.length = 0;
        sim.step({ yaw: P.yaw + 0.01 });
        show = sim.events.find((e) => e.type === 'glimpse' && e.phase === 'show');
      }
      if (show) {
        let gone = null;
        let t = 0;
        for (; t < 3 && !gone; t += DT) {
          sim.events.length = 0;
          sim.step({ yaw: Math.atan2(-(M.x - P.x), -(M.z - P.z)) + 0.5 });
          gone = sim.events.find((e) => e.type === 'glimpse' && e.phase === 'gone');
        }
        assert.ok(gone && t < 2, `graine ${seed} : vue de côté, la première apparition dure ${t.toFixed(1)} s`);
        n.apparition++;
      }
    }
  }
  assert.ok(n.fixee >= 3 && n.cote >= 3 && n.lumiere + n.recoin >= 3 && n.apparition >= 3, `cas testés : ${JSON.stringify(n)}`);
});

test('triche : invisible de tous, elle réapparaît juste derrière un angle devant sa proie, ou disparaît', () => {
  let corner = 0;
  let behind = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new BackroomsSim({ map: createBackroomsMap(seed), difficulty: 'normal' });
    const P = sim.player;
    const M = sim.monster;
    M.dormantT = 0;
    if (sim.director) sim.director.phase = 'build';
    // elle est loin, hors de vue ; le joueur, hors de la lumière franche, regarde le long d'un couloir
    sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H);
    const far = sim.map.walkable.find((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) > 50);
    M.x = (far.x + 0.5) * CELL_SIZE;
    M.z = (far.z + 0.5) * CELL_SIZE;
    M.floor = 0;
    M.mode = 'patrol';
    M.warpT = 0;
    M.stalkT = 99;
    M.ambushT = 99;
    M.unseenAllT = 5;
    const evs = [];
    let tell = null;
    let tellStep = -1;
    for (let i = 0; i < 150 && !evs.length; i++) {
      sim.events.length = 0;
      sim.step({ yaw: P.yaw });
      const t = sim.events.find((e) => e.type === 'tell');
      if (t && !tell) {
        tell = t;
        tellStep = i;
        assert.ok(Math.hypot(t.x - P.x, t.z - P.z) > 5, 'le signe vient de là où elle va surgir');
      }
      evs.push(...sim.events.filter((e) => e.type === 'warp'));
    }
    const w = evs[0];
    if (!w) continue;
    // jamais sans prévenir : un craquement ou un souffle, plus d'une seconde avant, de l'endroit même
    assert.ok(tell, 'un signe avant chaque apparition');
    assert.ok(tellStep >= 0 && Math.hypot(tell.x - M.x, tell.z - M.z) < 0.3, 'elle surgit là où on l\'a entendue');
    assert.ok(!sim.inSomeView(0, M.x, M.z), 'elle n\'apparaît jamais sous les yeux d\'un joueur');
    assert.ok(Math.hypot(M.x - P.x, M.z - P.z) > 6, 'pas collée au joueur, hors de portée de charge');
    if (w.kind === 'corner') {
      corner++;
      assert.equal(M.mode, 'watch', 'postée, elle attend');
    } else behind++;
  }
  assert.ok(corner + behind >= 8, `elle trouve où apparaître (${corner} devant, ${behind} derrière sur 12)`);
  // la disparition : elle finit d'observer, personne ne la regarde, elle est partie loin
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  M.dormantT = 0;
  sim.map.brightCells = new Uint8Array(sim.map.W * sim.map.H);
  const spot = sim.warpSpot(P, 'behind') || sim.warpSpot(P, 'corner');
  M.x = spot.x;
  M.z = spot.z;
  M.mode = 'watch';
  M.waitT = 0.01;
  M.warpT = 999;
  M.unseenAllT = 5;
  P.yaw = Math.atan2(M.x - P.x, M.z - P.z); // il lui tourne le dos
  for (let i = 0; i < 5; i++) sim.step({ yaw: P.yaw });
  assert.ok(sim.players.every((Q) => Math.hypot(Q.x - M.x, Q.z - M.z) >= 30), 'on se retourne : elle a disparu');
  sim.map.brightCells = null;
});

test('première rencontre : au bout du couloir, elle est là ; regardée, le néon claque et elle a disparu', () => {
  // (le joueur tourne sur place au départ : sur certaines cartes, aucun couloir assez long ne s'y prête)
  let shown = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const sim = new BackroomsSim({ seed, difficulty: 'normal' });
    const P = sim.player;
    const M = sim.monster;
    assert.ok(M.dormantT > 0 && sim.glimpseAt < M.dormantT, 'elle se montre pendant la minute de calme du début');
    sim.glimpseAt = 0;
    let show = null;
    // le joueur tourne lentement sur lui-même jusqu'à ce qu'elle se montre devant lui
    for (let i = 0; i < 60 * 30 && !show; i++) {
      sim.events.length = 0;
      sim.step({ yaw: P.yaw + 0.01 });
      show = sim.events.find((e) => e.type === 'glimpse' && e.phase === 'show');
    }
    if (!show) continue;
    shown++;
    const d = Math.hypot(M.x - P.x, M.z - P.z);
    assert.ok(d > 10 && d < 26, `au bout du couloir (${d.toFixed(1)} m)`);
    assert.ok(hasLineOfSight(sim.map, P.x, P.z, M.x, M.z), 'droit devant, bien en vue');
    assert.equal(M.mode, 'watch', 'immobile, elle regarde');
    // on la fixe : moins d'une seconde plus tard, le néon claque et elle n'est plus là
    let gone = null;
    for (let i = 0; i < 90 && !gone; i++) {
      sim.events.length = 0;
      sim.step({ yaw: Math.atan2(-(M.x - P.x), -(M.z - P.z)) });
      gone = sim.events.find((e) => e.type === 'glimpse' && e.phase === 'gone');
    }
    assert.ok(gone && gone.seen, 'regardée, elle disparaît');
    assert.ok(Math.hypot(M.x - P.x, M.z - P.z) >= 30, 'loin, très loin');
    assert.equal(M.mode, 'patrol');
    assert.equal(sim.glimpseAt, Infinity, 'une seule fois par partie');
  }
  assert.ok(shown >= 12, `elle se montre (${shown}/20)`);
});

test("à plusieurs : après un gel de l'hôte, la position de l'invité est reprise (pas de retour en arrière) ; les ambiances viennent de l'hôte", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const host = new BackroomsSim({ seed: 12, players, localId: 1 });
  const G = host.players[1];
  const at = { x: G.x, z: G.z };
  // un point accessible à une dizaine de mètres
  const far = host.map.walkable.map((c) => ({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE })).find((c) => Math.hypot(c.x - at.x, c.z - at.z) > 9 && Math.hypot(c.x - at.x, c.z - at.z) < 12);
  assert.ok(far, 'un point à une dizaine de mètres');
  host.step({}, { 2: { remote: true, seq: 100, pos: { x: at.x, z: at.z } } });
  // 2 s plus tard chez l'invité (l'hôte était figé) : 120 pas, à la course, ça passe
  host.step({}, { 2: { remote: true, seq: 220, pos: far } });
  assert.ok(Math.hypot(G.x - far.x, G.z - far.z) < 0.5, "l'hôte reprend la position de l'invité");
  // mais pas un bond impossible
  const back = { x: at.x, z: at.z };
  host.step({}, { 2: { remote: true, seq: 223, pos: back } });
  assert.ok(Math.hypot(G.x - far.x, G.z - far.z) < 0.5, 'un bond de 10 m en 3 pas est refusé');
  // les ambiances : tirées par l'hôte, avec un endroit et des tirages que tout le monde rejoue pareil
  const amb = [];
  for (let i = 0; i < 60 * 70; i++) {
    host.events.length = 0;
    host.step({}, {});
    amb.push(...host.events.filter((e) => e.type === 'amb'));
  }
  assert.ok(amb.length >= 1, `des ambiances (${amb.length})`);
  for (const e of amb) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.a) && e.u >= 0 && e.u <= 1 && ['rec', 'a', 'b', 'c'].includes(e.s));
});

test("même version, même carte : tous les fichiers du jeu sont versionnés, et l'empreinte voit une cassette déplacée", () => {
  const html = fs.readFileSync(new URL('../backrooms/index.html', import.meta.url), 'utf8');
  const listed = new Set([...html.matchAll(/'((?:engine|view)\/[\w-]+\.js|app\.js)'/g)].map((m) => m[1]));
  for (const dir of ['', 'engine/', 'view/']) {
    for (const f of fs.readdirSync(new URL('../backrooms/' + dir, import.meta.url))) {
      if (f.endsWith('.js')) assert.ok(listed.has(dir + f), `backrooms/index.html doit charger ${dir + f} à la version du Hub`);
    }
  }
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const a = new BackroomsSim({ seed: 77, players, localId: 1 });
  const b = new BackroomsSim({ seed: 77, players, localId: 2 });
  assert.equal(a.fp, b.fp, 'même graine, même empreinte');
  const cas = b.floors[1].cassettes[0];
  cas.x += 5;
  assert.notEqual(mapPrint(b.floors), a.fp, 'une cassette ailleurs : empreinte différente');
});

test('prélude : avant la première cassette, rien que la première apparition ; l\'entité n\'est pas là', () => {
  BackroomsSim.PRELUDE = true;
  try {
    for (let seed = 1; seed <= 4; seed++) {
      const sim = new BackroomsSim({ seed, difficulty: 'hard', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], localId: 'a' });
      const M = sim.monster;
      assert.ok(sim.prelude, 'Level 0, aucune cassette : le prélude');
      const types = new Set();
      let glimpses = 0;
      // trois minutes à parler fort et à courir partout
      for (let i = 0; i < 60 * 180; i++) {
        sim.events.length = 0;
        const t = i / 60;
        sim.step({ my: 1, mx: Math.sin(t * 0.7), run: true, voice: 0.9, radio: (i % 600) < 200 }, { b: { my: 1, mx: Math.cos(t * 0.5), voice: 0.9 } });
        for (const e of sim.events) types.add(e.type);
        if (sim.events.some((e) => e.type === 'glimpse' && e.phase === 'show')) glimpses++;
        if (!M.glimpse) assert.ok(M.away, 'hors de l\'apparition, elle n\'est pas là');
        assert.ok(M.mode !== 'chase' && M.mode !== 'grab', 'jamais de poursuite');
        assert.ok(sim.players.every((P) => !(P.danger > 0) || M.glimpse), 'pas de bourdonnement');
      }
      assert.ok(glimpses <= 1, 'une seule apparition');
      for (const t of ['spotted', 'phantom', 'din', 'tell', 'warp', 'blackout']) assert.ok(!types.has(t), `rien d'autre : ${t}`);
      assert.ok(!sim.lightsOut, 'pas de néons qui meurent');
      assert.ok(sim.players.every((P) => P.status === 'alive'), 'personne ne meurt');
      // la première cassette : elle arrive, une vingtaine de secondes plus tard, et de loin
      sim.cassettes = 1;
      run(sim, 1);
      assert.ok(!sim.prelude);
      let back = 0;
      for (let i = 0; i < 60 * 30 && !back; i++) {
        sim.step({});
        if (!M.away) back = i / 60;
      }
      assert.ok(back > 0, 'elle est revenue');
    }
  } finally {
    BackroomsSim.PRELUDE = false;
  }
});

test('traque annoncée : les néons meurent un à un jusqu\'au joueur, puis elle est lâchée du fond', () => {
  let hunts = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const sim = new BackroomsSim({ seed, difficulty: 'normal' });
    const P = sim.player;
    const M = sim.monster;
    M.dormantT = 0;
    M.warpT = 1e9;
    sim.glimpseAt = Infinity;
    // elle rôde loin
    const far = sim.map.walkable.find((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) > 60);
    M.x = (far.x + 0.5) * CELL_SIZE;
    M.z = (far.z + 0.5) * CELL_SIZE;
    M.stalkT = 99;
    M.ambushT = 99;
    sim.director.huntT = 0.01;
    sim.director.fakeT = 999;
    const offAt = [];
    let hunt = null;
    for (let i = 0; i < 60 * 8 && !hunt; i++) {
      sim.events.length = 0;
      sim.step({ yaw: P.yaw });
      for (const e of sim.events) if (e.type === 'phantom' && e.kind === 'neon') offAt.push(Math.hypot(e.x - P.x, e.z - P.z));
      hunt = sim.events.find((e) => e.type === 'hunt');
      if (sim.events.some((e) => e.type === 'rare' && e.kind === 'lightsOut')) assert.ok(sim.lightsOut && sim.lightsOut.hunt, 'c\'est une traque');
    }
    if (!hunt) continue;
    hunts++;
    assert.ok(offAt.length >= 3, 'plusieurs néons s\'éteignent');
    assert.ok(offAt[offAt.length - 1] < offAt[0], 'du plus loin jusqu\'à lui');
    assert.ok(!sim.inSomeView(0, M.x, M.z, 0.1) || Math.hypot(M.x - P.x, M.z - P.z) > 10, 'lâchée hors de vue, au fond');
    assert.ok(Math.hypot(M.x - P.x, M.z - P.z) < 30, 'tout près maintenant');
    assert.equal(M.mode, 'search', 'elle vient le chercher');
    assert.ok(Math.hypot(M.lastSeenX - P.x, M.lastSeenZ - P.z) < 0.5, 'droit sur lui');
  }
  assert.ok(hunts >= 6, `traques lancées (${hunts}/8)`);
});

test('recoin calme : elle n\'y voit ni n\'y entre ; au bout de 45 s, sa lampe grésille et plus rien n\'y protège', () => {
  let tested = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const sim = new BackroomsSim({ seed, difficulty: 'normal' });
    const nooks = sim.floors[0].calm;
    assert.ok(nooks.length >= 1, `des recoins calmes (graine ${seed})`);
    for (const n of nooks) {
      assert.ok(n.cells.length === 2 && !sim.map.isWall(n.gx, n.gz), 'un cul-de-sac libre');
      assert.ok(Math.hypot(n.x - sim.map.spawn.x, n.z - sim.map.spawn.z) >= 18, 'loin du départ');
    }
    const n = nooks[0];
    const P = sim.player;
    const M = sim.monster;
    M.dormantT = 0;
    M.warpT = 1e9;
    sim.glimpseAt = Infinity;
    sim.director.huntT = 1e9;
    P.x = n.x;
    P.z = n.z;
    P.flashlight = false;
    // elle le poursuit, juste devant l'entrée du recoin
    const ox = (n.cells[1].x + 0.5) * CELL_SIZE - n.dx * CELL_SIZE * 1.6;
    const oz = (n.cells[1].z + 0.5) * CELL_SIZE - n.dz * CELL_SIZE * 1.6;
    if (sim.map.isWall(Math.floor(ox / CELL_SIZE), Math.floor(oz / CELL_SIZE))) continue;
    tested++;
    M.x = ox;
    M.z = oz;
    M.mode = 'chase';
    M.lastSeenX = P.x;
    M.lastSeenZ = P.z;
    assert.ok(sim.calmAt(P), 'à l\'abri');
    let grabbed = false;
    for (let i = 0; i < 60 * 20; i++) {
      sim.step({ yaw: P.yaw });
      if (P.grabT > 0 || P.status !== 'alive') grabbed = true;
    }
    assert.ok(!grabbed, 'elle ne franchit pas le seuil');
    assert.notEqual(M.mode, 'chase', 'elle a cessé la poursuite');
    // il s'y éternise : la protection s'use
    sim.events.length = 0;
    for (let i = 0; i < 60 * (CALM_HOLD - 18); i++) sim.step({ yaw: P.yaw });
    assert.ok(!sim.calmAt(P), 'usé : plus d\'abri');
    assert.ok(n.wear >= 1);
    // dehors, il se recharge peu à peu
    P.x = sim.map.spawn.x;
    P.z = sim.map.spawn.z;
    for (let i = 0; i < 60 * CALM_HOLD * 3; i++) sim.updateCalm();
    assert.ok(n.wear < 0.05, 'reposé, il protège à nouveau');
  }
  assert.ok(tested >= 5, `recoins testés (${tested})`);
});

test('spectateurs : un mort fait grésiller le néon près d\'un vivant, ou frappe plus loin pour attirer l\'entité', () => {
  const sim = new BackroomsSim({ seed: 4, difficulty: 'normal', players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }] });
  const [A, B] = sim.players;
  A.status = 'dead';
  sim.glimpseAt = Infinity;
  sim.monster.dormantT = 0;
  // E : le néon le plus proche de B grésille
  const lit = sim.map.lights.filter((l) => l.state === 'on').sort((a, b) => Math.hypot(a.x - B.x, a.z - B.z) - Math.hypot(b.x - B.x, b.z - B.z))[0];
  B.x = lit.x + 1;
  B.z = lit.z;
  sim.events.length = 0;
  sim.step({ useSel: true, view: 1 }, { 1: {} });
  const f = sim.events.find((e) => e.type === 'haunt');
  assert.ok(f && f.kind === 'flicker' && f.id === 1, 'le néon de B grésille');
  assert.equal(lit.state, 'flicker');
  // pas deux de suite
  sim.events.length = 0;
  sim.step({ whistle: true, view: 1 }, { 1: {} });
  assert.ok(!sim.events.some((e) => e.type === 'haunt'), 'il faut attendre');
  // après le délai : des coups devant B, qui attirent l'entité
  A.hauntAt = 0;
  sim.events.length = 0;
  sim.step({ whistle: true, view: 1 }, { 1: {} });
  const k = sim.events.find((e) => e.type === 'haunt');
  assert.ok(k && k.kind === 'knock', 'des coups');
  const dk = Math.hypot(k.x - B.x, k.z - B.z);
  assert.ok(dk > 4 && dk < 18, `un peu plus loin (${dk.toFixed(1)} m)`);
  assert.ok(A.hauntAt - sim.time > HAUNT_COOLDOWN - 1);
  // un vivant ne hante pas
  const before = sim.events.length;
  sim.step({ useSel: true }, { 1: { whistle: true } });
  assert.ok(!sim.events.slice(before).some((e) => e.type === 'haunt'));
});

test('elle préfère celui qui s\'isole ; plus on joue bien, plus elle triche (et inversement)', () => {
  const sim = new BackroomsSim({ seed: 9, difficulty: 'normal', players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'C' }] });
  const [A, B, C] = sim.players;
  const M = sim.monster;
  const cells = sim.map.walkable.map((c) => ({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE }));
  // A et B ensemble, C seul à 40 m d'eux ; l'entité un peu plus près du groupe
  const g = cells.find((c) => Math.hypot(c.x - M.x, c.z - M.z) > 25 && Math.hypot(c.x - M.x, c.z - M.z) < 30);
  const lone = cells.find((c) => Math.hypot(c.x - M.x, c.z - M.z) > 31 && Math.hypot(c.x - M.x, c.z - M.z) < 36 && Math.hypot(c.x - g.x, c.z - g.z) > 40);
  A.x = B.x = g.x;
  A.z = g.z;
  B.z = g.z + 0.5;
  C.x = lone.x;
  C.z = lone.z;
  for (const P of sim.players) P.seen = false;
  assert.equal(sim.senseMonster().id, 2, 'le joueur seul');
  const easy = new BackroomsSim({ seed: 9, skill: 0 });
  const pro = new BackroomsSim({ seed: 9, skill: 1 });
  assert.ok(easy.monster.dormantT > pro.monster.dormantT + 20, 'plus de répit au début pour qui débute');
  assert.equal(new BackroomsSim({ seed: 9, skill: 'x' }).skill, 0.5);
});

test('invités : ils voient les néons mourir et les recoins s\'user (seuls les néons changés voyagent)', () => {
  const host = new BackroomsSim({ seed: 3 });
  const guest = new BackroomsSim({ seed: 3 });
  const a = host.map.lights.find((l) => l.state === 'on');
  const b = host.floors[1].lights.find((l) => l.state === 'on');
  a.state = 'off';
  b.state = 'flicker';
  host.floors[0].calm[0].wear = 0.6;
  const snap = JSON.parse(JSON.stringify(host.snapshot()));
  assert.ok(JSON.stringify(snap).length < 900, 'un instantané léger');
  guest.applySnapshot(snap);
  assert.equal(guest.map.lights[host.map.lights.indexOf(a)].state, 'off');
  assert.equal(guest.floors[1].lights[host.floors[1].lights.indexOf(b)].state, 'flicker');
  assert.equal(guest.floors[0].calm[0].wear, 0.6);
  a.state = 'on';
  b.state = 'on';
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.equal(guest.map.lights[host.map.lights.indexOf(a)].state, 'on', 'rallumé chez l\'invité aussi');
  assert.equal(guest.floors[1].lights[host.floors[1].lights.indexOf(b)].state, 'on');
});

test('casier : caché, l\'entité ne le voit pas ; vu en entrant, elle vient le chercher', () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 5, level: 1 });
  const hides = sim.map.hides;
  assert.ok(hides && hides.length >= 3, 'des casiers à l\'entrepôt');
  const P = sim.player;
  const h = hides[0];
  const f = hideFront(h);
  P.x = f.x;
  P.z = f.z;
  // l'entité loin, dos tourné
  sim.monster.x = P.x + 40;
  sim.monster.z = P.z;
  sim.step({ pick: true });
  assert.equal(P.hidden, h.id, 'F devant le casier : on s\'y enferme');
  assert.equal(P.flashlight, false);
  // elle arrive tout près sans l'avoir vu : elle ne le trouve pas tant qu'il retient son souffle
  sim.monster.x = h.x + h.dx * 2.5;
  sim.monster.z = h.z + h.dz * 2.5;
  sim.monster.mode = 'search';
  for (let i = 0; i < 60; i++) sim.step({ run: true });
  assert.equal(P.status, 'alive');
  assert.ok(!(P.grabT > 0), 'souffle retenu : elle passe');
  sim.step({ pick: true });
  assert.equal(P.hidden, -1, 'F pour ressortir');
});

test('Level 1 : les fusibles se portent jusqu\'au panneau et tombent avec celui qui meurt', () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 3, level: 1 });
  const P = sim.player;
  const f0 = sim.map.fuses[0];
  P.x = f0.x;
  P.z = f0.z;
  sim.step();
  assert.equal(P.carry.length, 1, 'le fusible est en poche');
  sim.killPlayer(P);
  assert.equal(P.carry.length, 0);
  assert.equal(f0.taken, false, 'il est tombé par terre');
  assert.equal(sim.fuses, 0);
});

test('grande carte : générée sans erreur pour 200 graines, sortie loin du départ', () => {
  for (let sd = 0; sd < 200; sd++) {
    const m = createBackroomsMap(sd);
    const exitD = m.dist[m.exit.gz * m.W + m.exit.gx];
    assert.ok(exitD > 40, `graine ${sd} : la sortie est à ${exitD} cases du départ`);
    for (const c of m.cassettes) assert.ok(m.dist[c.gz * m.W + c.gx] > 0, `graine ${sd} : cassette ${c.id} atteignable`);
    assert.ok(m.lights.some((l) => l.state === 'off'), `graine ${sd} : il y a des zones sombres`);
  }
});

test("eau d'amande : rend la moitié de la gourde", () => {
  const m = createBackroomsMap(7);
  const sim = new BackroomsSim({ map: m, difficulty: 'peaceful' });
  sim.player.water = 10;
  const b = m.bottles[0];
  sim.player.x = b.x;
  sim.player.z = b.z;
  sim.step();
  assert.equal(b.taken, false, 'on ne ramasse plus en passant');
  sim.step({ pick: true });
  assert.equal(b.taken, true);
  assert.deepEqual(sim.player.inv, ['bottle', null], "F : la bouteille va dans l'inventaire");
  assert.ok(sim.player.water < 11, "elle ne se boit pas toute seule");
  const before = sim.player.water;
  sim.step({ useSel: true });
  assert.ok(Math.abs(sim.player.water - (before + ALMOND_WATER)) < 0.1, 'E : on boit la case choisie (+50)');
  assert.deepEqual(sim.player.inv, [null, null]);
  assert.ok(sim.drainEvents().some((e) => e.type === 'bottle'));
  // gourde pleine : on la garde
  sim.player.water = 99;
  sim.player.inv = ['bottle', null];
  sim.step({ useSel: true, sel: 1 });
  assert.deepEqual(sim.player.inv, ['bottle', null], 'pas soif : la bouteille reste dans le sac');
  assert.ok(sim.drainEvents().some((e) => e.type === 'useless'));
  // un nouvel étage : jamais à sec en arrivant
  sim.player.water = 5;
  sim.loadLevel(1);
  assert.equal(sim.player.water, WATER_LEVEL_MIN);
});

test("inventaire : deux cases d'objets ; plein, F échange l'objet de la case choisie contre celui du sol", () => {
  const m = createBackroomsMap(9);
  const sim = new BackroomsSim({ map: m, difficulty: 'peaceful' });
  const P = sim.player;
  assert.equal(INV_SIZE, 2);
  const ladder = m.items.find((i) => i.kind === 'ladder');
  for (const o of [m.bottles[0], m.batteries[0]]) {
    P.x = o.x;
    P.z = o.z;
    sim.step({ pick: true });
  }
  assert.deepEqual(P.inv, ['bottle', 'battery']);
  // plein : la case choisie (2, l'eau d'amande) part au sol à la place de l'échelle
  const at = { x: ladder.x, z: ladder.z };
  const n0 = m.items.length;
  P.x = ladder.x;
  P.z = ladder.z;
  sim.step({ pick: true, sel: 1 });
  assert.deepEqual(P.inv, ['ladder', 'battery']);
  const dropped = m.items.find((o) => !o.taken && o.kind === 'bottle' && Math.hypot(o.x - at.x, o.z - at.z) < 0.01);
  assert.ok(dropped, "l'eau d'amande est posée là où était l'échelle");
  assert.ok(!m.items.some((o) => !o.taken && o.kind === 'ladder'), "l'échelle n'est plus au sol");
  assert.equal(m.items.length, n0, "l'échange n'ajoute pas d'objet (avant, chaque échange en ajoutait un, sans fin)");
  // échanger encore et encore au même endroit : toujours le même nombre d'objets
  for (let i = 0; i < 6; i++) sim.step({ pick: true, sel: 1 });
  assert.equal(m.items.length, n0, 'des échanges répétés ne font pas grossir la partie');
  if (P.inv[0] !== 'ladder') sim.step({ pick: true, sel: 1 });
  assert.deepEqual(P.inv, ['ladder', 'battery']);
  // une case vide : F y range l'objet sans rien poser
  P.x = m.spawn.x;
  P.z = m.spawn.z;
  P.battery = 10;
  sim.step({ sel: 2 });
  sim.step({ useSel: true });
  assert.ok(P.battery > 60, 'E : la pile de la case 3 recharge la lampe');
  assert.deepEqual(P.inv, ['ladder', null]);
  P.x = dropped.x;
  P.z = dropped.z;
  const before = m.items.length;
  sim.step({ pick: true });
  assert.deepEqual(P.inv, ['ladder', 'bottle']);
  assert.equal(m.items.length, before, 'rien de posé : il restait une case');
  // E sur une eau d'amande quand on a soif : on la boit
  P.water = 40;
  sim.step({ useSel: true });
  assert.deepEqual(P.inv, ['ladder', null]);
  assert.ok(P.water > 89);
  // une case qui n'existe pas ne se choisit pas
  sim.step({ sel: INV_SIZE + 1 });
  assert.equal(P.sel, 2);
});

test("inventaire : G pose l'objet choisi devant soi (contre un mur : à ses pieds ; sur un trou : nulle part), un coéquipier le ramasse, l'invité le voit", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 9, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 9, players, localId: 2 });
  const wire = () => guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  const [A, B] = host.players;
  const m = host.map;
  const C = CELL_SIZE;
  // une case libre, loin des trous, avec un mur juste à l'est
  const cell = (() => {
    for (let gz = 1; gz < m.H - 1; gz++) for (let gx = 1; gx < m.W - 2; gx++) {
      if (m.grid[gz * m.W + gx] !== T.FLOOR || m.grid[gz * m.W + gx + 1] !== T.WALL || m.pitAt(gx, gz) >= 0) continue; // un vrai mur (pas une cloison fine, au milieu de la case)
      if ([[-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => m.pitAt(gx + dx, gz + dz) >= 0 || m.grid[(gz + dz) * m.W + gx + dx] !== T.FLOOR)) continue;
      if (host.isColliding((gx + 0.5) * C, (gz + 0.5) * C, 0.5)) continue;
      // et rien de posé contre ce mur (un meuble du décor) : on s'y tiendra, à 40 cm
      if (host.isColliding((gx + 1) * C - 0.4, (gz + 0.5) * C, 0.3)) continue;
      return { gx, gz };
    }
  })();
  assert.ok(cell, 'une case contre un mur');
  const cx = (cell.gx + 0.5) * C;
  const cz = (cell.gz + 0.5) * C;
  A.x = cx;
  A.z = cz;
  A.yaw = Math.PI / 2; // regarde vers l'ouest (devant : -sin(yaw), -cos(yaw))
  B.x = m.spawn.x;
  B.z = m.spawn.z;
  A.inv = [null, 'bottle'];
  const n0 = m.items.length;
  host.drainEvents();
  host.step({ sel: 2, drop: true });
  assert.deepEqual(A.inv, [null, null], 'G : la case choisie se vide');
  const ev = host.drainEvents().find((e) => e.type === 'drop');
  assert.ok(ev && ev.kind === 'bottle' && ev.id === 1, "l'équipe entend tomber l'eau d'amande");
  const it = m.items.find((o) => !o.taken && o.kind === 'bottle' && Math.hypot(o.x - (cx - DROP_AHEAD), o.z - cz) < 0.01);
  assert.ok(it, 'posée par terre, juste devant soi');
  assert.ok(m.items.length <= n0 + 1, "au plus un objet de plus (on reprend d'abord un objet déjà ramassé)");
  assert.ok(Math.hypot(it.x - A.x, it.z - A.z) < 1.4, 'à portée de F');
  // un deuxième objet posé au même endroit : à côté du premier, pas dedans
  A.inv = [null, 'battery'];
  host.step({ sel: 2, drop: true });
  const bat = m.items.find((o) => !o.taken && o.kind === 'battery' && Math.hypot(o.x - A.x, o.z - A.z) < 1);
  assert.ok(bat && Math.hypot(bat.x - it.x, bat.z - it.z) >= 0.28, 'le deuxième objet se pose à côté du premier');
  bat.taken = true;
  wire();
  const gi = guest.map.items.find((o) => !o.taken && o.kind === 'bottle' && Math.hypot(o.x - it.x, o.z - it.z) < 0.02);
  assert.ok(gi, "l'invité la voit au même endroit");
  assert.deepEqual(guest.players.find((p) => p.id === 1).inv, [null, null], "et l'inventaire de A, vide, chez lui aussi");
  // B la ramasse
  B.x = it.x;
  B.z = it.z;
  host.step({}, { 2: { pick: true } });
  assert.ok(B.inv.includes('bottle') && it.taken, 'un coéquipier la ramasse');
  wire();
  assert.ok(guest.player.inv.includes('bottle') && !guest.map.items.some((o) => !o.taken && Math.hypot(o.x - it.x, o.z - it.z) < 0.02), "chez l'invité, elle est dans son sac");
  // face au mur : à ses pieds
  A.inv = [null, 'battery'];
  A.x = (cell.gx + 1) * C - 0.4;
  A.z = cz;
  A.yaw = -Math.PI / 2; // vers l'est, le mur
  host.step({ sel: 2, drop: true });
  assert.ok(m.items.some((o) => !o.taken && o.kind === 'battery' && Math.hypot(o.x - A.x, o.z - A.z) < 0.05), 'contre un mur : à ses pieds');
  // une case vide : rien à poser
  host.drainEvents();
  host.step({ sel: 1, drop: true });
  assert.ok(host.drainEvents().some((e) => e.type === 'emptySlot'));
  // au-dessus d'un trou du couloir piégé : nulle part où le poser
  let pit = null;
  for (let gz = 0; gz < m.H && !pit; gz++) for (let gx = 0; gx < m.W && !pit; gx++) if (m.pitAt(gx, gz) >= 0 && !m.pits[m.pitAt(gx, gz)].deep) pit = { gx, gz };
  assert.ok(pit, 'un trou à cet étage');
  A.inv = ['bottle', null];
  A.x = (pit.gx + 0.5) * C;
  A.z = (pit.gz + 0.5) * C;
  host.drainEvents();
  host.step({ sel: 1, drop: true });
  assert.ok(host.drainEvents().some((e) => e.type === 'noDrop'), 'au-dessus du vide : refusé');
  assert.equal(A.inv[0], 'bottle', "l'objet reste dans le sac");
});

test("renfoncement : la cassette en hauteur s'attrape seulement depuis l'échelle, qu'il faut aller chercher", () => {
  for (const sd of [2, 9, 31]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd });
    const m = sim.map;
    const N = m.niche;
    assert.ok(N, `graine ${sd} : un renfoncement`);
    const cas = m.cassettes.find((c) => c.id === N.cas);
    assert.ok(cas.high);
    const ladder = m.items.find((i) => i.kind === 'ladder');
    assert.ok(ladder, "une échelle sur la carte");
    const d = bfsDist(m, N.gx, N.gz, ladder.gx, ladder.gz);
    assert.ok(d >= 6 && d <= 40, `graine ${sd} : échelle à ${d} cases du renfoncement (dans les parages)`);
    const P = sim.player;
    // sans échelle, même juste dessous : trop haut
    P.x = N.baseX;
    P.z = N.baseZ;
    sim.step();
    assert.equal(cas.collected, false, 'trop haut sans échelle');
    // on va chercher l'échelle, on la pose dessous (E), on grimpe
    P.x = ladder.x;
    P.z = ladder.z;
    sim.step({ pick: true });
    assert.deepEqual(P.inv, ['ladder', null], "l'échelle va dans l'inventaire");
    P.x = N.baseX + 1.5;
    P.z = N.baseZ;
    if (sim.isColliding(P.x, P.z, 0.3)) {
      P.x = N.baseX;
      P.z = N.baseZ;
    }
    sim.step({ useSel: true });
    assert.ok(N.ladder, 'échelle posée');
    assert.deepEqual(P.inv, [null, null]);
    P.x = N.baseX;
    P.z = N.baseZ;
    sim.step();
    assert.ok(P.onLadder, "en haut de l'échelle");
    assert.equal(cas.collected, false, 'il faut encore la prendre');
    sim.step({ pick: true });
    assert.ok(cas.collected, 'F : cassette récupérée');
  }
});

test("échelle : le caméscope y mène s'il ne reste que la cassette perchée, ou si elle tombe des mains d'un mort (l'équipe est prévenue, l'invité le sait)", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  for (const sd of [2, 9, 31]) {
    const host = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 1 });
    const guest = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 2 });
    const wire = () => guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
    const [A, B] = host.players;
    const m = host.map;
    const N = m.niche;
    const ladder = m.items.find((i) => i.kind === 'ladder');
    const others = m.cassettes.filter((c) => !c.high);
    // A loin de tout, au départ ; B au pied de l'échelle
    const sigOf = (inB = {}) => {
      host.step({}, { 2: inB });
      return A.sigTo;
    };
    assert.equal(sigOf(), 'goal', `graine ${sd} : des cassettes à trouver, le signal les suit`);
    // il ne reste à l'étage que la cassette perchée : le signal mène à l'échelle
    for (const c of others.slice(1)) c.collected = true;
    others[0].collected = true;
    assert.equal(sigOf(), 'ladder', "il ne reste que la cassette perchée : à l'échelle");
    A.x = ladder.x + 0.6;
    A.z = ladder.z;
    host.step();
    assert.ok(A.signal > 0.9, "tout près de l'échelle, le signal est au plus fort");
    // B la ramasse : le signal de A repart vers la cassette (le renfoncement)
    B.x = ladder.x;
    B.z = ladder.z;
    A.x = host.map.spawn.x;
    A.z = host.map.spawn.z;
    sigOf({ pick: true });
    assert.ok(B.inv.includes('ladder'), "B a l'échelle");
    assert.equal(sigOf(), 'goal', "quelqu'un a l'échelle : vers la cassette");
    // une autre cassette reste à trouver ; B meurt l'échelle en main, loin du renfoncement
    others[0].collected = false;
    host.drainEvents();
    host.killPlayer(B);
    const ev = host.drainEvents().find((e) => e.type === 'ladderDrop');
    assert.ok(ev && ev.name === 'B', "l'équipe apprend que B a lâché l'échelle");
    const lying = m.items.find((i) => i.kind === 'ladder' && !i.taken);
    assert.ok(lying && lying.lost && Math.hypot(lying.x - B.x, lying.z - B.z) < 1, 'elle est par terre, là où il est tombé');
    assert.equal(sigOf(), 'ladder', "l'échelle perdue d'abord, même s'il reste une autre cassette");
    wire();
    assert.equal(guest.player.status, 'dead');
    const gl = guest.map.items.find((i) => i.kind === 'ladder' && !i.taken);
    assert.ok(gl && gl.lost && Math.abs(gl.x - lying.x) < 0.02, "l'invité la voit au même endroit, perdue");
    // A la ramasse puis la pose : plus de guidage vers l'échelle
    A.x = lying.x;
    A.z = lying.z;
    host.step({ pick: true });
    assert.ok(A.inv.includes('ladder') && !lying.lost);
    wire();
    assert.ok(!guest.map.items.some((i) => i.lost), "chez l'invité aussi, elle n'est plus perdue");
    // posée à côté du pied du renfoncement (sans grimper dans la foulée)
    let placed = false;
    for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
      if (placed || host.isColliding(N.baseX + ox, N.baseZ + oz, 0.3)) continue;
      A.x = N.baseX + ox;
      A.z = N.baseZ + oz;
      A.sel = A.inv.indexOf('ladder') + 1;
      host.step({ useSel: true });
      placed = N.ladder;
    }
    assert.ok(N.ladder, 'échelle posée');
    assert.equal(m.cassettes.find((c) => c.high).collected, false);
    others[0].collected = true;
    A.x = host.map.spawn.x;
    A.z = host.map.spawn.z;
    assert.equal(sigOf(), 'goal', 'échelle posée : vers la cassette perchée');
  }
});

test("couloir piégé : une cassette n'est accessible qu'en traversant les trous", () => {
  for (const sd of [1, 4, 8, 15, 23, 42, 77]) {
    const m = createBackroomsMap(sd);
    const v = m.cassettes.find((c) => c.vault);
    assert.ok(v, `graine ${sd} : une cassette gardée`);
    assert.ok(m.pits.length >= 6);
    const g = m.grid.map((val, i) => (m.pitAt(i % m.W, Math.floor(i / m.W)) >= 0 ? T.WALL : val));
    const d = bfs(g, m.W, m.H, m.spawn.gx, m.spawn.gz);
    assert.ok(d[v.gz * m.W + v.gx] < 0, `graine ${sd} : impossible de contourner les trous`);
    assert.ok(m.dist[v.gz * m.W + v.gx] > 0, 'mais accessible en les traversant');
    for (const c of m.cassettes) if (!c.vault) assert.ok(d[c.gz * m.W + c.gx] >= 0, 'les autres cassettes sans trou');
    assert.ok(d[m.exit.gz * m.W + m.exit.gx] >= 0, "l'ascenseur sans trou");
  }
});

test("sifflet (T) : les autres l'entendent ; trop de coups rapprochés attirent l'entité", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 40 });
  const P = sim.player;
  const M = sim.monster;
  // l'entité rôde à 30 m, sans voir le joueur
  M.x = P.x + 30;
  M.z = P.z;
  M.mode = 'patrol';
  const origRandom = Math.random;
  Math.random = () => 0.99; // pas de coup de chance : il faut insister
  try {
    sim.step({ whistle: true });
    sim.step({ whistle: true });
    const ev = sim.drainEvents().filter((e) => e.type === 'whistle');
    assert.equal(ev.length, 1, 'un coup de sifflet à la fois');
    assert.notEqual(M.mode, 'search', 'un coup : elle ne vient pas encore');
    run(sim, WHISTLE_CD + 0.05);
    sim.step({ whistle: true });
    run(sim, WHISTLE_CD + 0.05);
    sim.step({ whistle: true });
    assert.equal(M.mode, 'search', "au 3e coup rapproché, elle vient voir");
    assert.ok(Math.hypot(M.lastSeenX - P.x, M.lastSeenZ - P.z) < 0.01);
  } finally {
    Math.random = origRandom;
  }
});

test('murs : chaque graine donne un dédale différent', () => {
  const a = createBackroomsMap(1);
  const b = createBackroomsMap(2);
  let diff = 0;
  for (let i = 0; i < a.grid.length; i++) if (a.grid[i] !== b.grid[i]) diff++;
  assert.ok(diff > a.grid.length * 0.1, `${diff} cases différentes`);
});

test("l'entité perd le joueur quand elle ne le voit plus pendant quelques secondes", () => {
  const m = createBackroomsMap(11);
  const sim = new BackroomsSim({ map: m });
  sim.monster.mode = 'chase';
  for (let i = 0; i < 60 * 6 && sim.monster.mode === 'chase'; i++) {
    // on la garde loin, hors de vue, pour tester la perte de vue seule
    sim.monster.x = m.monsterSpawn.x;
    sim.monster.z = m.monsterSpawn.z;
    sim.step({ my: 0 });
  }
  assert.notEqual(sim.monster.mode, 'chase');
});

test("lampe torche : la pile se vide, la lampe s'éteint, une pile la recharge", () => {
  const m = createBackroomsMap(5);
  const sim = new BackroomsSim({ map: m, difficulty: 'peaceful' });
  assert.ok(m.batteries.length >= 6, 'des piles dans le dédale');
  sim.player.hasLamp = true;
  sim.player.flashlight = true;
  for (let i = 0; i < 60 * 300; i++) sim.step({});
  assert.equal(sim.player.battery, 0);
  assert.equal(sim.player.flashlight, false, "la lampe s'éteint à plat");
  sim.step({ toggleFlashlight: true });
  assert.equal(sim.player.flashlight, false, 'impossible de la rallumer sans pile');
  const b = m.batteries[0];
  sim.player.x = b.x;
  sim.player.z = b.z;
  sim.step({ pick: true });
  sim.step({ useSel: true });
  assert.ok(sim.player.battery > 50, 'la pile recharge la lampe');
  sim.step({ toggleFlashlight: true });
  assert.equal(sim.player.flashlight, true);
});

test("Level 1 : l'entrepôt, ses étagères, ses 3 fusibles et le monte-charge", () => {
  for (const sd of [1, 2, 3, 50, 99]) {
    const m = createWarehouseMap(sd);
    assert.equal(m.level, 1);
    assert.ok(m.shelves.length > 60, `graine ${sd} : des rangées d'étagères`);
    assert.ok(m.elevator, `graine ${sd} : un monte-charge`);
    assert.equal(m.fuses.length, FUSES);
    for (const f of m.fuses) assert.ok(m.dist[f.gz * m.W + f.gx] > 0, `graine ${sd} : fusible ${f.id} atteignable`);
    assert.ok(m.dist[m.exit.gz * m.W + m.exit.gx] > 30, `graine ${sd} : le monte-charge est loin`);
    let shelf = 0;
    for (const v of m.grid) if (v === T.SHELF) shelf++;
    assert.ok(shelf > 100);
    // une étagère bloque le passage et la vue
    const sh = m.shelves[0];
    assert.ok(m.isWall(sh.gx, sh.gz));
  }
});

test('Level 1 : les fusibles rapportés au panneau ouvrent le monte-charge, qui descend aux Poolrooms (Level 37)', () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 4, level: 1 });
  assert.equal(sim.open, false);
  for (const f of sim.map.fuses) {
    sim.player.x = f.x;
    sim.player.z = f.z;
    sim.step();
  }
  assert.equal(sim.fuses, FUSES);
  assert.equal(sim.open, false, 'il faut encore les brancher au panneau');
  sim.player.x = sim.map.exit.x;
  sim.player.z = sim.map.exit.z;
  sim.step();
  assert.equal(sim.delivered, FUSES, 'les fusibles sont au panneau');
  assert.equal(sim.powered, false, 'il faut encore relancer le monte-charge');
  run(sim, PANEL_T + 0.2);
  assert.equal(sim.powered, true);
  assert.ok(sim.drainEvents().some((e) => e.type === 'powered'));
  const E = sim.map.elevator;
  sim.player.x = E.x;
  sim.player.z = E.z;
  sim.step();
  assert.equal(sim.player.status, 'alive', 'le monte-charge aussi attend le bouton');
  sim.step({ pick: true });
  run(sim, LIFT_CLOSE_T + 0.1);
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'playing');
  assert.equal(sim.level, 2, 'on arrive aux Poolrooms');
  assert.ok(sim.drainEvents().some((e) => e.type === 'level' && e.level === 2));
  // les 3 volants de vanne ouvrent les toboggans ; on se glisse dans l'un d'eux : la partie est gagnée
  const sl = sim.map.slides[2]; // le bleu (le rouge mène au Terror Hotel, le jaune aux Tuyauteries)
  sim.player.x = sl.x - sl.dx * 0.6;
  sim.player.z = sl.z - sl.dz * 0.6;
  sim.step();
  assert.equal(sim.player.status, 'alive', 'toboggan fermé tant que les vannes manquent');
  for (const f of sim.map.fuses) {
    sim.player.x = f.x;
    sim.player.z = f.z;
    sim.step();
  }
  assert.equal(sim.fuses, FUSES, 'les 3 vannes');
  assert.equal(sim.open, true, "les toboggans s'ouvrent dès la troisième vanne");
  sim.player.x = sl.x - sl.dx * 0.6;
  sim.player.z = sl.z - sl.dz * 0.6;
  sim.step();
  assert.equal(sim.player.status, 'elevator');
  assert.equal(sim.slide, 2, 'le toboggan bleu est pris');
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'won', 'le toboggan bleu sort des Poolrooms : partie gagnée');
});

test('Level 1 : coupures de courant de 15 à 20 s', () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 8, level: 1 });
  let start = -1;
  let len = 0;
  for (let i = 0; i < 60 * 120; i++) {
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.type === 'blackout' && start < 0) start = sim.time;
      if (e.type === 'power' && start >= 0 && !len) len = sim.time - start;
    }
  }
  assert.ok(start > 0, 'une coupure arrive dans les deux premières minutes');
  assert.ok(len >= 14.9 && len <= 20.1, `elle dure ${len.toFixed(1)} s`);
});

test("Level 1 : l'entité se cache au bout des étagères pour tendre une embuscade", () => {
  let ambushes = 0;
  for (const sd of [3, 5, 9, 12]) {
    const sim = new BackroomsSim({ difficulty: 'normal', seed: sd, level: 1 });
    const P = sim.player;
    const M = sim.monster;
    // le joueur marche dans une grande allée ; l'entité est à 25 m, hors de vue
    M.x = P.x + 25;
    M.z = P.z;
    M.ambushT = 0;
    P.yaw = -Math.PI / 2;
    sim.step({});
    if (M.mode === 'ambush') {
      ambushes++;
      assert.ok(M.silent, "elle se tait en embuscade");
      assert.ok(!hasLineOfSight(sim.map, P.x, P.z, M.ambush.x, M.ambush.z), 'cachée de la vue du joueur');
      assert.ok(sim.map.isShelfSide(M.ambush.gx, M.ambush.gz), 'contre une étagère');
    }
  }
  assert.ok(ambushes >= 2, `${ambushes} embuscades sur 4`);
});

test("à plusieurs : le bouton de la cabine attend les autres, sinon on part sans eux", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 21, players, localId: 1 });
  for (const c of sim.allCassettes) {
    putOn(sim, sim.player, c);
    sim.step(); // (en haut de l'échelle pour la cassette perchée)
    sim.step({ pick: true });
  }
  assert.equal(sim.cassettes, 6, "les cassettes comptent pour toute l'équipe");
  run(sim, FINALE_WAIT + 0.1);
  assert.ok(sim.open);
  const E = sim.fm(sim.realFloor).elevator;
  // tout le monde à l'étage du vrai ascenseur, au départ de cet étage (pas au-dessus d'un puits sans fond)
  const S0 = sim.fm(sim.realFloor).spawn;
  for (const P of sim.players) Object.assign(P, { floor: sim.realFloor, x: S0.x, z: S0.z });
  const [a, b, c] = sim.players;
  sim.monster.x = sim.monster.z = -999; // loin de tout le monde
  a.x = E.x; a.z = E.z;
  sim.step();
  assert.equal(a.status, 'alive', 'dans la cabine, on reste joueur');
  assert.ok(Math.abs(sim.rage - 1 / 2) < 1e-9, "l'entité s'énerve");
  // A appuie : les autres sont dehors, il faut confirmer
  sim.step({ pick: true });
  assert.ok(sim.drainEvents().some((e) => e.type === 'liftWait' && e.n === 2), 'on prévient : deux joueurs dehors');
  assert.equal(sim.liftT, 0, 'les portes restent ouvertes');
  b.x = E.x; b.z = E.z;
  sim.step();
  assert.ok(Math.abs(sim.rage - 1) < 1e-9, 'le dernier dehors : colère au maximum');
  // A confirme : C reste dehors
  sim.step({ pick: true });
  assert.ok(sim.liftT > 0, 'deuxième appui : les portes se ferment');
  run(sim, LIFT_CLOSE_T + 0.1);
  assert.equal(a.status, 'elevator');
  assert.equal(b.status, 'elevator');
  assert.equal(c.status, 'dead', 'C est resté dehors');
  assert.ok(sim.drainEvents().some((e) => e.type === 'leftBehind' && e.id === c.id));
  assert.ok(sim.departT > 0, 'la cabine part');
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.level, 1);
  assert.ok(sim.players.every((p) => p.status === 'alive'), "tout le monde au Level 1 (C revient à l'étage suivant)");
  // tous ensemble dans la cabine : un seul appui suffit
  const s2 = new BackroomsSim({ difficulty: 'normal', seed: 21, players, localId: 1 });
  s2.cassettes = 6;
  s2.startFinale();
  const E2 = s2.fm(s2.realFloor).elevator;
  s2.monster.x = s2.monster.z = -999;
  for (const P of s2.players) Object.assign(P, { floor: s2.realFloor, x: E2.x, z: E2.z });
  s2.step({}, { 2: { pick: true } });
  assert.ok(s2.liftT > 0, "un invité peut appuyer sur le bouton");
  run(s2, LIFT_CLOSE_T + 0.1);
  assert.ok(s2.players.every((p) => p.status === 'elevator'));
});

test("à plusieurs : plus il y a de monde à l'abri, plus l'entité est rapide et voit loin", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const speed = (inside) => {
    const sim = new BackroomsSim({ difficulty: 'normal', seed: 5, players, localId: 1 });
    sim.cassettes = 6;
    for (let i = 0; i < inside; i++) sim.players[i].status = 'elevator';
    const P = sim.players[2];
    sim.monster.mode = 'chase';
    sim.monster.x = P.x + 5;
    sim.monster.z = P.z;
    sim.updateMonster();
    return sim.monster.speed;
  };
  assert.ok(speed(2) > speed(1) && speed(1) > speed(0));
});

test("à plusieurs : un joueur attrapé devient spectateur, la partie continue ; il revient à l'étage suivant", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 33, players, localId: 1 });
  const [a, b] = sim.players;
  sim.monster.x = a.x + 0.4;
  sim.monster.z = a.z;
  b.x = a.x + 30; // loin
  a.grabs = 1; // déjà agrippé une fois : cette prise-ci est mortelle
  sim.step();
  assert.equal(a.status, 'dead');
  assert.equal(sim.state, 'playing', 'B joue encore');
  assert.equal(sim.viewPlayer(0).id, b.id, 'A regarde B');
  sim.cassettes = 6;
  sim.startFinale();
  sim.realFloor = 0; // (le test choisit lui-même le vrai ascenseur)
  sim.unlockLevel0();
  b.x = sim.map.elevator.x;
  b.z = sim.map.elevator.z;
  sim.monster.x = sim.monster.z = -999;
  sim.step({}, { 2: { pick: true } });
  run(sim, LIFT_CLOSE_T + 0.1);
  assert.ok(sim.departT > 0, "B, seul vivant, entre et appuie : l'ascenseur part");
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.level, 1);
  assert.equal(sim.players[0].status, 'alive', 'A revient au Level 1');
});

test("réseau : l'invité reçoit l'état de l'hôte, se déplace chez lui et suit le changement d'étage", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'normal', seed: 77, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'normal', seed: 77, players, localId: 2 });
  const wire = () => guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.deepEqual(Array.from(guest.map.grid), Array.from(host.map.grid), 'même graine : même carte');
  host.monster.x = host.monster.z = -999;
  // l'invité avance chez lui et annonce sa position ; l'hôte la reprend
  const g = guest.player;
  for (let i = 0; i < 60; i++) guest.predict({ my: 1, yaw: g.yaw });
  const hg = host.players.find((p) => p.id === 2);
  host.step({}, { 2: { pos: { x: g.x, z: g.z }, yaw: g.yaw } });
  assert.ok(Math.hypot(hg.x - g.x, hg.z - g.z) < 0.01, "l'hôte a repris la position de l'invité");
  // une position impossible (téléportation) est refusée
  host.step({}, { 2: { pos: { x: hg.x + 20, z: hg.z } } });
  assert.ok(Math.hypot(hg.x - g.x, hg.z - g.z) < 3, 'téléportation refusée');
  // l'hôte ramasse une cassette : l'invité la voit disparaître et le compteur monte
  const c = host.map.cassettes.find((q) => !q.high);
  host.player.x = c.x;
  host.player.z = c.z;
  host.step({ pick: true });
  wire();
  assert.equal(guest.cassettes, 1);
  assert.equal(guest.allCassettes.find((q) => q.id === c.id).collected, true);
  // tout le monde dans l'ascenseur : l'invité passe au Level 1 avec la même carte
  host.cassettes = 6;
  host.startFinale();
  host.realFloor = 0; // (le test choisit lui-même le vrai ascenseur)
  host.unlockLevel0();
  for (const P of host.players) {
    P.x = host.map.elevator.x;
    P.z = host.map.elevator.z;
  }
  host.step({ pick: true });
  run(host, LIFT_CLOSE_T + 0.1);
  run(host, DEPART_T + 0.2);
  wire();
  assert.equal(guest.level, 1);
  assert.deepEqual(Array.from(guest.map.grid), Array.from(host.map.grid), 'même entrepôt');
  assert.equal(guest.player.status, 'alive');
  // coupure de courant et entité : l'invité les reçoit
  host.blackout = 12;
  host.monster.x = host.players[1].x + 6;
  host.monster.z = host.players[1].z;
  wire();
  assert.ok(guest.blackout > 0);
  assert.ok(guest.monster.danger > 0.3, "l'invité entend l'entité approcher");
  // un joueur quitte la partie : il disparaît chez l'invité
  host.removePlayer(1);
  wire();
  assert.equal(guest.players.length, 1);
});

test('départ : pas de table, chacun a déjà sa lampe dans la case 1, éteinte', () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  for (const sd of [3, 14, 15, 92, 653]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 1 });
    assert.ok(!sim.table, `graine ${sd} : pas de table au départ`);
    assert.ok(sim.players.every((p) => p.hasLamp && !p.flashlight), 'tout le monde part équipé, lampe éteinte');
    // la touche 1 allume et éteint sa lampe
    sim.step({ toggleFlashlight: true });
    assert.equal(sim.player.flashlight, true);
    assert.ok(!sim.drainEvents().some((e) => e.type === 'noLamp'));
    sim.step({ toggleFlashlight: true });
    assert.equal(sim.player.flashlight, false);
  }
});

test("course infinie, chez l'hôte comme chez l'invité ; accroupi, on ne court pas", () => {
  for (const guest of [false, true]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 3 });
    const P = sim.player;
    const go = (inp) => (guest ? sim.predict({ my: 1, yaw: P.yaw, ...inp }) : sim.step({ my: 1, yaw: P.yaw, ...inp }));
    let ran = 0;
    for (let i = 0; i < Math.round(20 / DT); i++) {
      P.yaw += i % 120 === 0 ? Math.PI / 2 : 0; // tourner de temps en temps pour ne pas rester collé à un mur
      go({ run: true });
      if (P.running) ran++;
    }
    assert.ok(ran > 0.9 * Math.round(20 / DT), `${guest ? 'invité' : 'hôte'} : on court sans s'arrêter (${ran})`);
    go({ run: true, crouch: true });
    assert.equal(P.running, false);
  }
});

test('départ à plusieurs : chacun dans son coin, à portée de sifflet, et pareil chez tout le monde', () => {
  const players = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: 'P' + id }));
  for (const sd of [3, 14, 42, 92, 653]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 1 });
    const guest = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 4 });
    const ps = sim.players;
    assert.equal(new Set(ps.map((p) => `${p.x},${p.z}`)).size, ps.length, `graine ${sd} : personne au même endroit`);
    for (const [i, p] of ps.entries()) {
      assert.equal(p.x, guest.players[i].x, 'même départ chez un invité');
      assert.equal(p.z, guest.players[i].z);
      assert.ok(!sim.isColliding(p.x, p.z, 0.3, 0), `graine ${sd} : ${p.name} pas dans un mur ni un meuble`);
      for (const q of ps) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 45, 'assez près pour entendre siffler');
    }
  }
  // seul : au départ habituel
  const solo = new BackroomsSim({ difficulty: 'peaceful', seed: 3 });
  assert.equal(solo.player.x, solo.map.spawn.x);
});

test("un joueur tombé au Level 0 repart au Level 1 avec une lampe (éteinte, comme au départ)", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const [a, b] = sim.players;
  a.status = 'dead'; // attrapé avant d'avoir pris sa lampe
  sim.cassettes = 6;
  sim.startFinale();
  sim.realFloor = 0; // (le test choisit lui-même le vrai ascenseur)
  sim.unlockLevel0();
  b.x = sim.map.elevator.x;
  b.z = sim.map.elevator.z;
  sim.step({}, { 2: { pick: true } });
  run(sim, LIFT_CLOSE_T + 0.1);
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.level, 1);
  const a1 = sim.players.find((p) => p.id === 1);
  assert.equal(a1.status, 'alive');
  assert.ok(a1.hasLamp && !a1.flashlight);
  assert.ok(!sim.table, "plus de table à l'étage suivant");
});

// hasard reproductible pour les tests d'équilibre
const withSeed = (seed, fn) => {
  const orig = Math.random;
  let s = seed;
  Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
};
// un joueur posé sur l'arête entre les deux premiers trous du couloir, face à la suite
const onBeam = (sd) => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd });
  const [p0, p1] = sim.map.pits;
  const P = sim.player;
  // deux trous voisins : l'arête est sur leur bord commun
  P.x = p0.gx === p1.gx ? Math.round(p0.x / CELL_SIZE) * CELL_SIZE : (p0.x + p1.x) / 2;
  P.z = p0.gz === p1.gz ? Math.round(p0.z / CELL_SIZE) * CELL_SIZE : (p0.z + p1.z) / 2;
  return { sim, P };
};

test("couloir piégé : il tourne, impossible de le traverser tout droit", () => {
  for (const sd of [1, 4, 8, 15, 23, 42, 77]) {
    const m = createBackroomsMap(sd);
    const xs = new Set(m.pits.map((p) => p.gx));
    const zs = new Set(m.pits.map((p) => p.gz));
    assert.ok(xs.size > 2 && zs.size > 2, `graine ${sd} : au moins un virage`);
  }
});

test("barre d'équilibre : sans rien faire on bascule dans le trou du côté où l'on penche ; avec Q / D on tient", () => {
  for (const sd of [1, 4, 8]) {
    const { sim, P } = onBeam(sd);
    sim.step();
    assert.ok(P.onBeam, `graine ${sd} : sur l'arête`);
    assert.equal(P.floor, 0);
    // sans rien faire : on tombe en quelques secondes
    let t = 0;
    withSeed(sd, () => {
      while (P.floor === 0 && t < 20) {
        sim.step();
        t += DT;
      }
    });
    assert.ok(P.floor === 1 && t > 0.5 && t < 15, `graine ${sd} : tombé à l'étage du dessous au bout de ${t.toFixed(1)} s`);
    assert.ok(sim.drainEvents().some((e) => e.type === 'fall' && e.balance));
    // en corrigeant : on tient
    const b = onBeam(sd);
    withSeed(sd + 7, () => {
      for (let i = 0; i < 60 * 20; i++) b.sim.step({ mx: Math.abs(b.P.tilt) > 0.12 ? -Math.sign(b.P.tilt) : 0 });
    });
    assert.equal(b.P.floor, 0, `graine ${sd} : tenu 20 s en corrigeant`);
  }
  // pas trop sensible : un joueur qui ne réagit qu'au bout de 0,4 s (et d'un coup) traverse une arête de trois cases
  // en marchant, presque à chaque fois
  let held = 0;
  for (let sd = 1; sd <= 24; sd++) {
    const b = onBeam(1 + (sd % 3) * 3);
    const seen = [];
    let mx = 0;
    b.P.moving = true; // les à-coups de la marche
    withSeed(100 + sd, () => {
      for (let i = 0; i < 60 * 5.5 && b.P.floor === 0; i++) {
        seen.push(b.P.tilt);
        const t = seen[Math.max(0, seen.length - 1 - 24)];
        if (Math.abs(t) > 0.3) mx = -Math.sign(t);
        else if (Math.abs(t) < 0.12) mx = 0;
        b.sim.balance(b.P, mx); // seulement l'équilibre : on reste sur l'arête (le pas en avant n'y change rien)
        if (Math.abs(b.P.tilt) >= 1) b.P.floor = -1;
      }
    });
    if (b.P.floor === 0) held++;
  }
  assert.ok(held >= 21, `réflexes de 0,4 s : ${held} traversées sur 24`);
});

test("barre d'équilibre : on n'y avance que tout droit et lentement, Q / D ne font pas de pas de côté", () => {
  const { sim, P } = onBeam(4);
  sim.step();
  const x0 = P.x;
  const z0 = P.z;
  P.tilt = 0;
  withSeed(3, () => sim.step({ mx: 1 }));
  assert.ok(Math.hypot(P.x - x0, P.z - z0) < 1e-6, 'Q / D : pas de déplacement');
  assert.ok(P.tiltV > 0, 'D penche à droite');
  // pas de course sur l'arête
  P.tilt = 0;
  P.tiltV = 0;
  withSeed(5, () => sim.step({ my: 1, run: true }));
  assert.equal(P.running, false);
});

test("réseau : un invité qui perd l'équilibre chez lui tombe chez l'hôte, et l'inclinaison se voit", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const [p0, p1] = host.map.pits;
  const g = host.players[1];
  g.x = p0.gx === p1.gx ? Math.round(p0.x / CELL_SIZE) * CELL_SIZE : (p0.x + p1.x) / 2;
  g.z = p0.gz === p1.gz ? Math.round(p0.z / CELL_SIZE) * CELL_SIZE : (p0.z + p1.z) / 2;
  host.step({}, { 2: { remote: true, pos: { x: g.x, z: g.z }, tilt: 0.7 } });
  assert.equal(g.tilt, 0.7);
  assert.ok(g.onBeam);
  host.step({}, { 2: { remote: true, beamFall: 1 } });
  assert.equal(g.floor, 1, "l'invité est tombé à l'étage du dessous");
});

test("Level 0 : aucune cassette du bas sous un trou du haut (on la verrait au fond du puits sans pouvoir la prendre)", () => {
  for (let sd = 1; sd <= 60; sd++) {
    const [up, down] = createLevel0(sd).floors;
    for (const c of down.cassettes) assert.ok(up.pits.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= 6), `graine ${sd} : cassette ${c.id} sous un trou`);
  }
});

test("Level 0 sur deux étages : les trous mènent en bas, deux escaliers loin des trous, les cassettes réparties", () => {
  for (const sd of [1, 7, 19, 33, 64]) {
    const L = createLevel0(sd);
    const [up, down] = L.floors;
    assert.equal(L.stairs.length, 2, `graine ${sd} : deux escaliers`);
    for (const st of L.stairs) {
      assert.ok(up.pits.every((p) => Math.abs(p.gx - st.gx) + Math.abs(p.gz - st.gz) >= 6), 'loin des trous');
      assert.ok(up.dist[st.gz * up.W + st.gx] >= 0 && down.dist[st.gz * down.W + st.gx] >= 0, 'accessible aux deux étages');
    }
    for (const p of up.pits) assert.ok(down.dist[p.gz * down.W + p.gx] >= 0, 'on atterrit sur du sol accessible');
    assert.ok(down.cassettes.length >= 1 && up.cassettes.length >= 1, 'des cassettes aux deux étages');
    assert.deepEqual([...up.cassettes, ...down.cassettes].map((c) => c.id).sort(), [0, 1, 2, 3, 4, 5]);
    assert.equal(up.cassettes.length, 4, "4 cassettes en haut");
    assert.equal(down.cassettes.length, 2, "2 cassettes en bas");
    assert.ok(up.elevator && down.elevator, 'un ascenseur à chaque étage');
  }
});

test("Level 0 : des puits sans fond à l'étage du bas, en grille au milieu d'une salle, jamais sur un passage obligé", () => {
  for (let sd = 1; sd <= 40; sd++) {
    const L = createLevel0(sd);
    const [up, down] = L.floors;
    const deep = down.pits.filter((p) => p.deep);
    assert.ok(deep.length >= 6, `graine ${sd} : des puits (${deep.length})`);
    assert.ok(up.pits.every((p) => !p.deep), 'en haut, les trous mènent en bas');
    const W = down.W;
    const set = new Set(deep.map((p) => p.gz * W + p.gx));
    // sans traverser les puits, on rejoint les escaliers, les cassettes et les cases où l'on atterrit en tombant du haut
    const g = down.grid.map((v, i) => (set.has(i) ? T.WALL : v));
    const st = L.stairs[0];
    const d = bfs(g, W, down.H, Math.floor(st.down.x / CELL_SIZE), Math.floor(st.down.z / CELL_SIZE));
    const must = [...L.stairs.map((q) => [Math.floor(q.down.x / CELL_SIZE), Math.floor(q.down.z / CELL_SIZE)]), ...down.cassettes.map((c) => [c.gx, c.gz]), ...up.pits.map((p) => [p.gx, p.gz])];
    for (const [x, z] of must) assert.ok(d[z * W + x] >= 0, `graine ${sd} : (${x}, ${z}) joignable sans les puits`);
    // rien posé dedans ; loin des cases d'atterrissage
    for (const it of down.items) assert.ok(down.pitAt(it.gx, it.gz) < 0, `graine ${sd} : objet dans un puits`);
    for (const p of deep) assert.ok(up.pits.every((q) => Math.max(Math.abs(q.gx - p.gx), Math.abs(q.gz - p.gz)) >= 4), `graine ${sd} : puits sous un trou du haut`);
  }
});

test('puits sans fond : chaque arête entre deux puits débouche, à ses deux bouts, sur du sol libre (jamais sur un mur ni un meuble)', () => {
  for (let sd = 1; sd <= 30; sd++) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd });
    const down = sim.floors[1];
    const W = down.W;
    const set = new Set(down.pits.filter((p) => p.deep).map((p) => p.gz * W + p.gx));
    const has = (x, z) => set.has(z * W + x);
    let ends = 0;
    for (const k of set) {
      const gx = k % W;
      const gz = (k - gx) / W;
      for (const lineX of [true, false]) {
        // deux puits voisins : l'arête est la ligne qui les sépare ; on la suit jusqu'au bout, dans les deux sens
        if (lineX ? !has(gx + 1, gz) : !has(gx, gz + 1)) continue;
        for (const s of [-1, 1]) {
          let n = 1;
          while (lineX ? has(gx, gz + s * n) && has(gx + 1, gz + s * n) : has(gx + s * n, gz) && has(gx + s * n, gz + 1)) n++;
          const x = lineX ? (gx + 1) * CELL_SIZE : (s > 0 ? gx + n : gx - n + 1) * CELL_SIZE + s * 0.6;
          const z = lineX ? (s > 0 ? gz + n : gz - n + 1) * CELL_SIZE + s * 0.6 : (gz + 1) * CELL_SIZE;
          if (lineX ? has(gx, gz + s * n) || has(gx + 1, gz + s * n) : has(gx + s * n, gz) || has(gx + s * n, gz + 1)) continue; // le bord du champ
          ends++;
          assert.ok(!sim.isColliding(x, z, PLAYER_RADIUS, 1), `graine ${sd} : l'arête finit contre un obstacle en (${(x / CELL_SIZE).toFixed(1)}, ${(z / CELL_SIZE).toFixed(1)})`);
          assert.ok(sim.pitUnder(x, z, 1) < 0, `graine ${sd} : l'arête finit dans le vide`);
        }
      }
    }
    assert.ok(ends > 0, `graine ${sd} : des arêtes`);
  }
});

// un joueur à l'étage du bas, sur l'arête entre deux puits voisins
const onDeepBeam = (sd) => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd });
  const down = sim.floors[1];
  const deep = down.pits.filter((p) => p.deep);
  const p0 = deep[0];
  const p1 = deep.find((q) => Math.abs(q.gx - p0.gx) + Math.abs(q.gz - p0.gz) === 1);
  const P = sim.player;
  P.floor = 1;
  P.x = p0.gx === p1.gx ? p0.x : (p0.x + p1.x) / 2;
  P.z = p0.gz === p1.gz ? p0.z : (p0.z + p1.z) / 2;
  P.yaw = p0.gx === p1.gx ? Math.PI / 2 : 0; // le long de l'arête
  sim.monster.floor = 0;
  return { sim, P, p0 };
};

test("puits sans fond : y entrer tue, sans entité qui surgit ; ce qu'on portait reste au bord", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 11 });
  const P = sim.player;
  const pit = sim.floors[1].pits.find((p) => p.deep);
  P.floor = 1;
  P.x = pit.x + 0.3;
  P.z = pit.z;
  P.inv[0] = 'battery';
  sim.monster.floor = 0;
  sim.step();
  assert.equal(P.status, 'dead', 'mort');
  assert.equal(P.floor, 1, "pas d'étage en dessous");
  const ev = sim.drainEvents();
  assert.ok(ev.some((e) => e.type === 'abyss' && e.id === P.id && e.x === pit.x && e.z === pit.z));
  assert.ok(ev.some((e) => e.type === 'dead' && e.abyss));
  assert.ok(!ev.some((e) => e.type === 'jumpscare'), "pas d'entité qui surgit");
  const bat = sim.floors[1].items.find((i) => i.kind === 'battery' && !i.taken && Math.hypot(i.x - pit.x, i.z - pit.z) < 6);
  assert.ok(bat, 'la pile est tombée au bord');
  assert.ok(sim.floors[1].pitAt(bat.gx, bat.gz) < 0, 'pas dans le puits');
});

test("puits sans fond : l'arête tient comme en haut, mais perdre l'équilibre est mortel (chez l'invité aussi)", () => {
  for (const sd of [3, 9]) {
    const { sim, P } = onDeepBeam(sd);
    sim.step();
    assert.ok(P.onBeam, `graine ${sd} : sur l'arête`);
    let t = 0;
    withSeed(sd, () => {
      while (P.status === 'alive' && t < 20) {
        sim.step();
        t += DT;
      }
    });
    assert.equal(P.status, 'dead', `graine ${sd} : tombé au bout de ${t.toFixed(1)} s`);
    assert.ok(sim.drainEvents().some((e) => e.type === 'abyss' && e.balance));
    // en corrigeant : on tient
    const b = onDeepBeam(sd);
    withSeed(sd + 7, () => {
      for (let i = 0; i < 60 * 10; i++) b.sim.step({ mx: Math.abs(b.P.tilt) > 0.12 ? -Math.sign(b.P.tilt) : 0 });
    });
    assert.equal(b.P.status, 'alive', `graine ${sd} : tenu 10 s en corrigeant`);
  }
  // un invité qui bascule chez lui meurt chez l'hôte, et l'invité le voit
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 3, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 3, players, localId: 2 });
  const deep = host.floors[1].pits.filter((p) => p.deep);
  const p0 = deep[0];
  const p1 = deep.find((q) => Math.abs(q.gx - p0.gx) + Math.abs(q.gz - p0.gz) === 1);
  const g = host.players[1];
  g.floor = 1;
  g.x = p0.gx === p1.gx ? p0.x : (p0.x + p1.x) / 2;
  g.z = p0.gz === p1.gz ? p0.z : (p0.z + p1.z) / 2;
  host.monster.floor = 0;
  host.step({}, { 2: { remote: true, pos: { x: g.x, z: g.z }, tilt: 0.7 } });
  assert.ok(g.onBeam);
  host.step({}, { 2: { remote: true, beamFall: 1 } });
  assert.equal(g.status, 'dead', "l'invité est tombé dans le puits");
  assert.equal(host.players[0].status, 'alive');
  guest.applySnapshot(host.snapshot());
  assert.equal(guest.player.status, 'dead', "l'invité se voit mort");
});

test("chute : par un trou, on atterrit à l'étage du dessous, juste en dessous ; l'escalier fait remonter", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 7 });
  const P = sim.player;
  const pit = sim.map.pits[0];
  P.x = pit.x + 0.2;
  P.z = pit.z;
  sim.step();
  assert.equal(P.floor, 1, "en bas");
  assert.ok(Math.hypot(P.x - pit.x, P.z - pit.z) < 0.01, 'juste sous le trou');
  assert.ok(sim.drainEvents().some((e) => e.type === 'fall'));
  // sonné un instant : pas de pas tout de suite
  const x0 = P.x;
  sim.step({ my: 1 });
  assert.equal(P.x, x0);
  // l'escalier coudé : de l'étage du bas on remonte en marchant, marche après marche, demi-tour sur le palier,
  // sans être téléporté
  const st = sim.stairs[0];
  const C = CELL_SIZE;
  const W = (u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
  const walk = (pts, check) => {
    for (const w of pts) {
      for (let i = 0; i < 400 && Math.hypot(P.x - w.x, P.z - w.z) > 0.25; i++) {
        P.yaw = Math.atan2(-(w.x - P.x), -(w.z - P.z));
        const before = { x: P.x, z: P.z, y: feetY(sim.stairs, P.x, P.z, P.floor) };
        sim.step({ my: 1, yaw: P.yaw });
        check(before);
      }
      assert.ok(Math.hypot(P.x - w.x, P.z - w.z) <= 0.25, `atteint ${w.x.toFixed(1)}, ${w.z.toFixed(1)}`);
    }
  };
  run(sim, 2.5);
  P.x = st.down.x;
  P.z = st.down.z;
  // la porte du bas est cadenassée elle aussi : il faut d'abord trouver la clé de cet étage
  for (let i = 0; i < 60; i++) {
    const w = W(0.3, C / 2);
    sim.step({ my: 1, yaw: Math.atan2(-(w.x - P.x), -(w.z - P.z)) });
  }
  assert.ok(!stairAt(sim.stairs, P.x, P.z), 'tombé sans clé : la porte du bas ne cède pas');
  sim.floors[1].key.taken = true;
  sim.floors[0].key.taken = true;
  P.x = st.down.x;
  P.z = st.down.z;
  let climbed = false;
  let top = -Infinity;
  walk([W(0.3, C / 2), W(2.5 * C, C / 2), W(2.5 * C, 1.5 * C), W(0.3, 1.5 * C), st.up], (b) => {
    const y = feetY(sim.stairs, P.x, P.z, P.floor);
    assert.ok(Math.hypot(P.x - b.x, P.z - b.z) < 0.2, 'pas de téléportation');
    assert.ok(y >= b.y - 1e-9 && y - b.y < 0.2, 'les pieds montent peu à peu');
    if (Math.abs(y + FLOOR_DY / 2) < 0.01) climbed = true;
    top = Math.max(top, y);
  });
  assert.ok(climbed, 'on est passé par le palier, à mi-hauteur');
  assert.equal(P.floor, 0, "remonté par l'escalier");
  assert.ok(FLOOR_DY > 6, 'les étages sont loin l\'un de l\'autre');
  // et on redescend par le même chemin
  walk([W(0.3, 1.5 * C), W(2.5 * C, 1.5 * C), W(2.5 * C, C / 2), W(0.3, C / 2), st.down], () => {});
  assert.equal(P.floor, 1, 'redescendu');
  // pas de raccourci d'une volée à l'autre par-dessus la rampe du milieu
  P.x = W(1.0 * C, C / 2).x;
  P.z = W(1.0 * C, C / 2).z;
  P.floor = 1;
  const goal = W(1.0 * C, 1.5 * C);
  for (let i = 0; i < 120; i++) sim.step({ my: 1, yaw: Math.atan2(-(goal.x - P.x), -(goal.z - P.z)) });
  assert.equal(stairAt(sim.stairs, P.x, P.z).lane, 'A', 'resté sur la première volée');
  // on ne monte pas sur les marches par le côté, et on ne tombe pas dans la trémie depuis l'étage du haut
  for (const side of [W(1.5 * C, -0.5 * C), W(1.5 * C, 2.5 * C), W(3.5 * C, C), W(-0.5 * C, 1.5 * C), W(-0.5 * C, 0.5 * C)]) {
    for (const floor of [0, 1]) {
      if (sim.isColliding(side.x, side.z, 0.38, floor)) continue;
      P.floor = floor;
      P.x = side.x;
      P.z = side.z;
      // les deux entrées permises : en bas de la première volée (étage du bas), en haut de la seconde (étage du haut)
      const lA = stairLocal(st, side.x, side.z);
      if ((lA.u < 0 && lA.v < C && floor === 1) || (lA.u < 0 && lA.v > C && floor === 0)) continue;
      for (let i = 0; i < 180; i++) sim.step({ my: 1, yaw: Math.atan2(-(st.cx - P.x), -(st.cz - P.z)) });
      assert.ok(!stairAt(sim.stairs, P.x, P.z), `étage ${floor} : bloqué au bord de l'escalier`);
      assert.equal(P.floor, floor);
    }
  }
});

test("Level 0 : la cage d'escalier ne coupe aucun étage, et le couloir piégé a son point de départ", () => {
  for (const sd of [1, 7, 19, 33, 64, 101]) {
    const L = createLevel0(sd);
    const [up, down] = L.floors;
    for (const st of L.stairs) assert.equal(st.cells.length, 6, 'deux volées et un palier');
    for (const [m, entry] of [[up, 'up'], [down, 'down']]) {
      const blocked = new Set(L.stairs.flatMap((st) => st.cells.map((c) => c.gz * m.W + c.gx)));
      const g = m.grid.map((v, i) => (blocked.has(i) ? 2 : v));
      const st = L.stairs[0];
      const d = bfs(g, m.W, m.H, Math.floor(st[entry].x / CELL_SIZE), Math.floor(st[entry].z / CELL_SIZE));
      for (let i = 0; i < g.length; i++) if (m.dist[i] >= 0 && !blocked.has(i)) assert.ok(d[i] >= 0, `graine ${sd} : tout l'étage reste accessible`);
    }
    if (up.trap) assert.ok(!up.isWall(Math.floor(up.trap.x / CELL_SIZE), Math.floor(up.trap.z / CELL_SIZE)), 'départ du parcours sur le sol');
  }
});

test("le faux ascenseur est toujours le plus proche de l'équipe (le coéquipier le plus près compte)", () => {
  for (const seed of [11, 23, 57]) {
    for (const near of [0, 1]) {
      const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
      const sim = new BackroomsSim({ difficulty: 'peaceful', seed, players, localId: 1 });
      const [a, b] = sim.players;
      // A attend devant l'ascenseur de l'étage « near » ; B est quelque part à l'autre étage, loin de l'ascenseur
      const X = sim.fm(near).exit;
      Object.assign(a, { floor: near, x: X.x, z: X.z });
      const other = sim.fm(1 - near);
      const spot = other.walkable.reduce((best, c) => (Math.hypot(c.x * CELL_SIZE - other.exit.x, c.z * CELL_SIZE - other.exit.z) > Math.hypot(best.x * CELL_SIZE - other.exit.x, best.z * CELL_SIZE - other.exit.z) ? c : best));
      Object.assign(b, { floor: 1 - near, x: (spot.x + 0.5) * CELL_SIZE, z: (spot.z + 0.5) * CELL_SIZE });
      sim.cassettes = 6;
      sim.startFinale();
      assert.equal(sim.realFloor, 1 - near, `graine ${seed} : celui devant lequel attend A se referme`);
      assert.ok(sim.fm(near).elevator.fake);
    }
  }
});

test("portes de la cabine : elles poussent celui qui reste entre les vantaux, et refermées on ne les traverse plus", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const [a, b] = sim.players;
  sim.cassettes = 6;
  sim.startFinale();
  sim.realFloor = 0;
  sim.unlockLevel0();
  sim.monster.x = sim.monster.z = -999;
  const E = sim.map.elevator;
  const fx = E.x - E.dx * (CELL_SIZE / 2);
  const fz = E.z - E.dz * (CELL_SIZE / 2);
  const lz = (P) => (P.x - fx) * E.dx + (P.z - fz) * E.dz;
  // A entre à peine (dans le plan des portes), B se tient sur le seuil, côté couloir
  Object.assign(a, { x: fx + E.dx * 0.06, z: fz + E.dz * 0.06 });
  Object.assign(b, { x: fx - E.dx * 0.1, z: fz - E.dz * 0.1 });
  assert.ok(sim.inCabin(a) && !sim.inCabin(b));
  sim.step({ pick: true }, {});
  sim.step({ pick: true }, {}); // à plusieurs : second appui, on part sans B
  assert.ok(sim.liftT > 0, 'les portes se ferment');
  run(sim, LIFT_SHUT_T - 0.05);
  assert.ok(lz(a) >= LIFT_FACE + PLAYER_RADIUS - 0.01, 'A a été poussé au fond de la cabine');
  assert.ok(lz(b) <= -PLAYER_RADIUS + 0.01, 'B a été repoussé dans le couloir');
  // portes jointes : la baie est un mur, des deux côtés
  run(sim, (LIFT_CLOSE_T - LIFT_SHUT_T) / 2);
  assert.ok(sim.liftT > 0);
  assert.ok(sim.isColliding(fx + E.dx * 0.1, fz + E.dz * 0.1, 0.3, 0), 'plus de passage entre les vantaux');
  assert.ok(sim.isColliding(fx - E.dx * 0.15, fz - E.dz * 0.15, 0.3, 0), 'ni depuis le couloir');
});

test("ascenseurs : un en haut, un en bas ; les 6 cassettes trouvées, le faux devient un mur et seul le vrai emmène", () => {
  for (const real of [0, 1]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 11 });
    sim.realFloor = real;
    const fake = 1 - real;
    // fermés tous les deux, impossibles à distinguer
    for (const f of sim.floors) assert.ok(sim.isColliding(f.elevator.x, f.elevator.z, 0.3, sim.floors.indexOf(f)));
    for (const c of sim.allCassettes) {
      putOn(sim, sim.player, c);
      sim.step();
      sim.step({ pick: true });
    }
    assert.equal(sim.cassettes, 6);
    assert.ok(!sim.fm(fake).elevator.fake, 'pendant la pause, rien ne bouge encore');
    // le faux est toujours celui qui est le plus près de l'équipe : on attend devant celui de l'étage « fake »
    Object.assign(sim.player, { floor: fake, x: sim.fm(fake).exit.x, z: sim.fm(fake).exit.z });
    run(sim, FINALE_WAIT + 0.1);
    assert.equal(sim.realFloor, real, 'le vrai est le plus loin');
    assert.ok(sim.fm(fake).elevator.fake, 'le faux est démasqué');
    assert.ok(!sim.fm(real).elevator.fake);
    assert.ok(sim.isColliding(sim.fm(fake).elevator.x, sim.fm(fake).elevator.z, 0.3, fake), "le faux n'est plus qu'un mur");
    assert.ok(!sim.isColliding(sim.fm(real).elevator.x, sim.fm(real).elevator.z, 0.3, real), 'le vrai est ouvert');
    // le caméscope mène au vrai ascenseur, de partout : à l'étage du faux, vers l'escalier (ou d'abord la clé de la
    // porte du haut) ; jamais sans signal
    const P = sim.player;
    P.floor = fake;
    P.x = sim.fm(fake).exit.x;
    P.z = sim.fm(fake).exit.z;
    sim.step();
    assert.ok(P.sigTo === 'stairs' || P.sigTo === 'key', `à l'étage du faux : ${P.sigTo}`);
    assert.ok(P.signal >= 0.2, 'jamais sans signal');
    assert.equal(P.status, 'alive', 'devant le faux, rien ne se passe');
    if (P.sigTo === 'key') {
      sim.floors[fake].key.taken = true;
      sim.step();
      assert.equal(P.sigTo, 'stairs', 'la porte ouverte : vers l\'escalier');
    }
    P.floor = real;
    P.x = sim.fm(real).exit.x;
    P.z = sim.fm(real).exit.z;
    sim.step();
    assert.equal(P.sigTo, 'exit', 'à son étage : droit sur le vrai');
    assert.ok(P.signal > 0.9);
    P.floor = real;
    P.x = sim.fm(real).elevator.x;
    P.z = sim.fm(real).elevator.z;
    sim.step({ pick: true });
    run(sim, LIFT_CLOSE_T + 0.1);
    assert.equal(P.status, 'elevator', 'le vrai emmène');
  }
});

test("Level 0 : une seule panne de courant, au milieu de la partie (25 à 35 s de noir, ni signal ni refuge), que l'invité voit aussi", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  for (const seed of [3, 8]) {
    const host = new BackroomsSim({ difficulty: 'normal', seed, players, localId: 1 });
    const guest = new BackroomsSim({ difficulty: 'normal', seed, players, localId: 2 });
    const M = host.monster;
    const P = host.player;
    const hold = () => {
      // l'entité reste loin (on ne teste que la panne) ; le joueur, sous un néon fort s'il y en a
      M.dormantT = 999;
      M.away = true;
      M.mode = 'patrol';
    };
    hold();
    const lit = host.map.lights.find((l) => l.bright && l.state === 'on');
    if (lit) {
      P.x = lit.x;
      P.z = lit.z;
    }
    // avant la moitié des cassettes : jamais de panne
    let evs = [];
    for (let i = 0; i < 60 * 90; i++) {
      hold();
      host.step();
      evs.push(...host.drainEvents());
    }
    assert.ok(!evs.some((e) => e.type === 'blackout'), `graine ${seed} : pas de panne avant la moitié des cassettes`);
    // la moitié des cassettes : elle tombe dans les 80 s
    const half = host.allCassettes.slice(0, 3);
    for (const c of half) c.collected = true;
    host.cassettes = 3;
    let t = 0;
    evs = [];
    while (!(host.blackout > 0) && t < 80) {
      hold();
      host.step();
      evs.push(...host.drainEvents());
      t += DT;
    }
    const ev = evs.find((e) => e.type === 'blackout');
    assert.ok(ev && ev.level === 0, `graine ${seed} : la panne tombe (${t.toFixed(0)} s)`);
    assert.ok(ev.len >= 25 && ev.len <= 35, 'quelques dizaines de secondes');
    host.step();
    assert.equal(P.signal, 0, 'plus de signal');
    assert.ok(!host.shelteredAt(P), 'plus de refuge sous les néons');
    guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
    assert.ok(guest.blackout > 0 && guest.midBlackout, "l'invité est dans le noir lui aussi");
    // la lumière revient, et c'est la seule panne de la partie
    evs = [];
    for (let i = 0; i < 60 * 150; i++) {
      hold();
      host.step();
      evs.push(...host.drainEvents());
    }
    assert.ok(evs.some((e) => e.type === 'power'), 'le courant revient');
    assert.equal(host.blackout, 0);
    assert.ok(!evs.some((e) => e.type === 'blackout'), 'une seule panne');
  }
});

test("clés : les deux portes de l'escalier sont cadenassées ; une clé par étage, la première trouvée ouvre tout pour tous", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed, players, localId: 1 });
    const K = sim.floors[0].key;
    assert.ok(K, `graine ${seed} : une clé`);
    const top = sim.floors[0];
    assert.ok(!top.isWall(K.gx, K.gz) && !(top.pitAt && top.pitAt(K.gx, K.gz) >= 0), 'posée par terre, pas dans un trou');
    assert.ok(Math.hypot(K.x - top.spawn.x, K.z - top.spawn.z) >= 30, 'loin du départ');
    assert.ok(sim.stairs.every((st) => Math.hypot(st.x - K.x, st.z - K.z) >= 18), "loin de l'escalier");
    assert.ok(!sim.litCell(top, K.x, K.z), 'dans le noir');
    // les invités la posent au même endroit
    const g = new BackroomsSim({ difficulty: 'peaceful', seed, players, localId: 2 });
    assert.deepEqual([g.floors[0].key.x, g.floors[0].key.z], [K.x, K.z]);
    // fermée : on bute contre la porte, en entendant le cadenas
    const P = sim.player;
    const st = sim.stairs[0];
    const C = CELL_SIZE;
    const W = (u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
    const go = () => {
      const a = W(-0.6, 1.5 * C);
      P.x = a.x;
      P.z = a.z;
      P.floor = 0;
      const b = W(1.0, 1.5 * C);
      const evs = [];
      for (let i = 0; i < 90; i++) {
        sim.step({ my: 1, yaw: Math.atan2(-(b.x - P.x), -(b.z - P.z)) });
        evs.push(...sim.drainEvents());
      }
      return evs;
    };
    assert.ok(sim.stairsLocked);
    assert.ok(sim.lockedDoorNear(P, 99), 'la porte est repérée');
    const evs = go();
    assert.ok(!stairAt(sim.stairs, P.x, P.z), 'la porte ne cède pas');
    assert.ok(evs.some((e) => e.type === 'locked' && e.id === P.id), 'le cadenas claque');
    // F à côté de la clé : elle est à nous, la porte s'ouvre pour tout le monde
    P.x = K.x + 0.5;
    P.z = K.z;
    sim.step({ pick: true });
    const got = sim.drainEvents().find((e) => e.type === 'key');
    assert.ok(got && got.by === P.id && K.taken, 'la clé ramassée');
    assert.ok(!sim.stairsLocked);
    g.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
    assert.ok(g.floors[0].key.taken && !g.stairsLocked, "l'invité le sait aussi");
    assert.ok(sim.floors[1].key.taken, "l'autre clé disparaît");
    go();
    assert.ok(stairAt(sim.stairs, P.x, P.z), "on entre dans l'escalier");
  }
});

test("clés : tombé à l'étage du bas, la porte du bas est fermée aussi ; sa clé l'ouvre (et celle du haut disparaît)", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed });
    const P = sim.player;
    const K = sim.floors[1].key;
    assert.ok(K, `graine ${seed} : une clé en bas aussi`);
    const low = sim.floors[1];
    assert.ok(!low.isWall(K.gx, K.gz) && !(low.pitAt && low.pitAt(K.gx, K.gz) >= 0), 'posée par terre');
    assert.ok(!sim.litCell(low, K.x, K.z), 'dans le noir');
    const st = sim.stairs[0];
    const C = CELL_SIZE;
    const W = (u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
    sim.monster.x = sim.monster.z = -999;
    const go = () => {
      const a = W(-0.6, 0.5 * C);
      Object.assign(P, { x: a.x, z: a.z, floor: 1 });
      const b = W(1.0, 0.5 * C);
      const evs = [];
      for (let i = 0; i < 90; i++) {
        sim.step({ my: 1, yaw: Math.atan2(-(b.x - P.x), -(b.z - P.z)) });
        evs.push(...sim.drainEvents());
      }
      return evs;
    };
    assert.ok(sim.lockedDoorNear(Object.assign(P, { floor: 1, ...W(-0.6, 0.5 * C) }), 99), 'la porte du bas est repérée');
    const evs = go();
    assert.ok(!stairAt(sim.stairs, P.x, P.z), 'la porte du bas ne cède pas');
    assert.ok(evs.some((e) => e.type === 'locked'), 'le cadenas claque');
    Object.assign(P, { x: K.x + 0.5, z: K.z, floor: 1 });
    sim.step({ pick: true });
    assert.ok(K.taken && sim.floors[0].key.taken, 'la clé du bas ramassée ; celle du haut disparaît');
    assert.ok(!sim.stairsLocked);
    go();
    assert.ok(stairAt(sim.stairs, P.x, P.z), "on entre dans l'escalier par le bas");
  }
});

test("voix : parler fait du bruit, le talkie grésille chez les autres, et le vacarme la rend agressive", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 5, players, localId: 1 });
  const [A, B, C] = sim.players;
  // un murmure de rien ne compte pas ; une voix normale fait plus de bruit que marcher ; un cri, plus que courir
  sim.step({ voice: 0.08 });
  assert.ok(!(A.noise > NOISE.walk), 'le souffle du micro ne compte pas');
  sim.step({ voice: 0.6 });
  assert.ok(A.noise > NOISE.walk && A.noise < NOISE.run, `une voix normale (${A.noise.toFixed(2)})`);
  sim.step({ voice: 1 });
  assert.ok(A.noise > NOISE.run, 'un cri');
  for (let i = 0; i < 40; i++) sim.step({});
  // au talkie : chez les autres aussi (leur haut-parleur), même loin
  sim.step({ voice: 0.6, radio: true });
  assert.ok(A.radio);
  assert.ok(B.noise > NOISE.walk && C.noise > NOISE.walk, 'le talkie grésille chez chacun');
  // coupure (les néons qui meurent) : le talkie ne passe plus, ni chez les autres, ni chez l'invité (instantané)
  for (let i = 0; i < 40; i++) sim.step({});
  sim.lightsOut = { list: [], t: 0, n: 0, id: 1, floor: 0 };
  assert.ok(sim.radioDead);
  sim.step({ voice: 0.6, radio: true });
  assert.ok(!A.radio && !(B.noise > NOISE.walk), 'en coupure, le talkie est mort');
  const g = new BackroomsSim({ difficulty: 'peaceful', seed: 5, players, localId: 2 });
  sim.lightsOut = { list: [], t: 0, n: 0, id: 1, floor: 0 }; // (la séquence vide s'est déjà terminée au pas précédent)
  g.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(g.radioDead, "l'invité le sait");
  sim.lightsOut = null;
  g.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(!sim.radioDead && !g.radioDead, 'le courant revient, le talkie aussi');
  // un invité : son niveau arrive avec ses commandes
  for (let i = 0; i < 40; i++) sim.step({});
  sim.step({}, { 2: { remote: true, voice: 0.7 } });
  assert.ok(B.noise > NOISE.walk && !(C.noise > NOISE.walk), "la voix de l'invité, de vive voix : chez lui seulement");
  // les morts ne font plus de bruit
  C.status = 'dead';
  sim.step({}, { 3: { remote: true, voice: 1 } });
  assert.equal(C.voice, 0);
  // le vacarme : à force de parler, elle devient plus agressive, et on est prévenu ; puis il retombe
  const a0 = sim.aggro;
  const evs = [];
  for (let i = 0; i < 60 * 40; i++) {
    sim.step({ voice: 0.7 });
    evs.push(...sim.drainEvents().filter((e) => e.type === 'din'));
  }
  assert.ok(sim.din > 0.8, `le vacarme monte (${sim.din.toFixed(2)})`);
  assert.ok(sim.aggro > a0 + 0.3, 'elle est plus agressive');
  assert.deepEqual(evs.map((e) => e.level), [1, 2], 'deux paliers, chacun une fois');
  for (let i = 0; i < 60 * 100; i++) sim.step({});
  assert.ok(sim.din < 0.5, `il retombe dans le silence (${sim.din.toFixed(2)})`);
});

test("signal : sans cassette à son étage, le caméscope guide vers l'escalier", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 19 });
  const P = sim.player;
  for (const c of sim.map.cassettes) c.collected = true;
  sim.step();
  assert.equal(P.sigTo, 'key', "d'abord la clé de la porte du haut");
  sim.floors[0].key.taken = true;
  sim.step();
  assert.equal(P.sigTo, 'stairs');
  P.floor = 1;
  P.x = sim.fm(1).cassettes[0].x + 3;
  P.z = sim.fm(1).cassettes[0].z;
  sim.step();
  assert.equal(P.sigTo, 'goal');
});

test("l'entité prend l'escalier pour suivre un joueur à l'autre étage, et on l'entend étouffée à travers le plancher", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 7 });
  const P = sim.player;
  const M = sim.monster;
  const st = sim.stairs[0];
  P.floor = 1;
  P.x = st.down.x;
  P.z = st.down.z;
  M.floor = 0;
  M.x = st.x + 0.8;
  M.z = st.z;
  sim.senseMonster();
  const muffled = P.danger;
  assert.ok(muffled < 0.3, "à l'autre étage, son bourdonnement est étouffé");
  M.mode = 'search';
  let t = 0;
  while (M.floor === 0 && t < 20) {
    sim.step();
    t += DT;
  }
  assert.equal(M.floor, 1, "elle est descendue");
  assert.ok(sim.drainEvents().some((e) => e.type === 'monsterStairs'));
});

test("réseau : l'étage, la chute et le faux ascenseur arrivent chez l'invité", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 12, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 12, players, localId: 2 });
  const wire = () => guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.deepEqual(Array.from(guest.fm(1).grid), Array.from(host.fm(1).grid), "même étage du bas");
  const g = host.players[1];
  const pit = host.map.pits[0];
  g.x = pit.x;
  g.z = pit.z;
  host.step();
  wire();
  assert.equal(guest.player.floor, 1, "l'invité est en bas chez lui aussi");
  assert.ok(Math.hypot(guest.player.x - pit.x, guest.player.z - pit.z) < 0.01);
  // le vrai ascenseur ne se dévoile qu'une fois les cassettes trouvées
  assert.equal(host.snapshot().rf, -1);
  for (const c of host.allCassettes) {
    putOn(host, host.player, c);
    host.step();
    host.step({ pick: true });
  }
  wire();
  assert.ok(!guest.open && guest.finaleT > 0, "l'invité attend lui aussi, rien ne s'ouvre encore");
  run(host, FINALE_WAIT + 0.1);
  wire();
  assert.ok(guest.open);
  assert.equal(guest.realFloor, host.realFloor);
  assert.ok(guest.fm(1 - host.realFloor).elevator.fake);
  // objets posés aux deux étages
  const h = host.player;
  h.floor = 1;
  const [b0, b1, b2] = host.fm(1).items.filter((i) => i.kind !== 'ladder');
  for (const b of [b0, b1, b2]) {
    h.x = b.x;
    h.z = b.z;
    host.step({ pick: true });
  }
  wire();
  assert.equal(guest.fm(1).items.length, host.fm(1).items.length, "l'objet posé en bas apparaît chez l'invité");
  assert.equal(guest.fm(1).items[1].taken, host.fm(1).items[1].taken);
});

test("l'entité qui perd sa proie de vue va là où elle l'a vue, fouille autour, puis reprend sa ronde", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 5 });
  const P = sim.player;
  const M = sim.monster;
  const cells = sim.map.walkable;
  const at = (c) => ({ x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE });
  // le joueur loin, hors de vue et à l'arrêt ; l'entité en chasse vient de le perdre
  // (ni sous un néon franc ni dans un recoin calme : là, elle renoncerait exprès)
  const open = cells.filter((c) => !sim.brightCell(sim.map, at(c).x, at(c).z) && !sim.calmAt({ ...P, ...at(c) }));
  const far = open.reduce((b, c) => (Math.hypot(at(c).x - M.x, at(c).z - M.z) > Math.hypot(at(b).x - M.x, at(b).z - M.z) ? c : b));
  P.x = at(far).x;
  P.z = at(far).z;
  const last = cells.find((c) => {
    const d = Math.hypot(at(c).x - M.x, at(c).z - M.z);
    return d > 6 && d < 10;
  });
  M.mode = 'chase';
  M.unseenT = 0.1;
  M.lastSeenX = at(last).x;
  M.lastSeenZ = at(last).z;
  M.repathT = 0;
  sim.step();
  assert.ok(Math.hypot(M.goal.x - M.lastSeenX, M.goal.z - M.lastSeenZ) < 0.01, 'elle vise le dernier endroit vu, pas le joueur');
  const modes = new Set();
  for (let i = 0; i < 60 * 40 && M.mode !== 'patrol'; i++) {
    sim.step();
    modes.add(M.mode);
  }
  assert.ok(modes.has('search'), 'elle fouille');
  assert.equal(M.mode, 'patrol', 'puis reprend sa ronde');
});

test("réseau : l'eau d'amande bue par un invité le désaltère chez lui aussi, et l'escalier ne le ramène pas en arrière", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 7, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 7, players, localId: 2 });
  const G = guest.player;
  const HG = host.players[1];
  HG.inv = ['bottle', null];
  HG.water = 30; // la soif se tient chez l'hôte
  G.water = 99;
  host.step({}, { 2: { remote: true, useSel: true, sel: 1 } });
  assert.deepEqual(HG.inv, [null, null], 'la bouteille est bue');
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.ok(Math.abs(G.water - (30 + ALMOND_WATER)) < 0.2, `l'invité reçoit sa gourde de l'hôte (${G.water})`);
  // le bruit de chacun aussi (la barre de bruit des invités)
  HG.noise = 0.8;
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.ok(Math.abs(G.noise - 0.8) < 0.02 || G.noise >= 0.79, 'le bruit voyage dans l\'instantané');
  // l'invité monte l'escalier chez lui (une clé a été trouvée) ; l'hôte a un quart de seconde de retard dans chaque sens
  for (const f of host.floors) if (f.key) f.key.taken = true;
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.ok(!guest.stairsLocked, "l'invité sait les portes ouvertes");
  const st = host.stairs[0];
  const C = CELL_SIZE;
  const Wp = (u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
  for (const P of [G, HG]) {
    P.x = st.down.x;
    P.z = st.down.z;
    P.floor = 1;
  }
  const path = [Wp(0.3, C / 2), Wp(2.5 * C, C / 2), Wp(2.5 * C, 1.5 * C), Wp(0.3, 1.5 * C), st.up];
  const toHost = [];
  const toGuest = [];
  let wi = 0;
  let last = null;
  for (let t = 0; t < 60 * 40 && wi < path.length; t++) {
    const w = path[wi];
    if (Math.hypot(G.x - w.x, G.z - w.z) < 0.25) {
      wi++;
      continue;
    }
    G.yaw = Math.atan2(-(w.x - G.x), -(w.z - G.z));
    guest.predict({ my: 1, yaw: G.yaw });
    toHost.push({ at: t + 15, i: { my: 1, yaw: G.yaw, pos: { x: G.x, z: G.z } } });
    let inp = null;
    while (toHost.length && toHost[0].at <= t) inp = toHost.shift().i;
    if (inp) last = inp;
    host.step({}, { 2: { remote: true, ...(last || {}), pos: inp ? inp.pos : null } });
    if (t % 3 === 0) toGuest.push({ at: t + 15, s: JSON.parse(JSON.stringify(host.snapshot())) });
    while (toGuest.length && toGuest[0].at <= t) {
      const bx = G.x;
      const bz = G.z;
      guest.applySnapshot(toGuest.shift().s);
      assert.ok(Math.hypot(G.x - bx, G.z - bz) < 0.05, 'pas ramené en arrière');
    }
  }
  assert.equal(wi, path.length, "l'invité arrive en haut");
  for (let t = 0; t < 40; t++) host.step({}, { 2: { remote: true, pos: { x: G.x, z: G.z } } });
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.equal(G.floor, 0);
  assert.equal(HG.floor, 0, "l'hôte le voit en haut lui aussi");
  assert.ok(Math.hypot(HG.x - G.x, HG.z - G.z) < 0.3, 'au même endroit');
});

test("l'entité se tapit dans le noir pour observer (sans jamais rester plantée sous ses yeux), sursaute une fois devant la lampe (de loin), et s'énerve à chaque cassette", () => {
  let watched = 0;
  let fled = 0;
  let darker = 0;
  for (const sd of [2, 6, 11, 19, 23, 31]) {
    withSeed(sd, () => {
      const sim = new BackroomsSim({ difficulty: 'normal', seed: sd });
      const P = sim.player;
      const M = sim.monster;
      P.flashlight = false;
      sim.glimpseAt = Infinity;
      if (sim.director) Object.assign(sim.director, { phase: 'build', huntT: 1e9, fakeT: 1e9 });
      // l'entité à une vingtaine de mètres, hors de vue : elle part se tapir dans un coin sombre d'où elle le voit
      const c = sim.map.walkable.find((q) => {
        const d = Math.hypot((q.x + 0.5) * CELL_SIZE - P.x, (q.z + 0.5) * CELL_SIZE - P.z);
        return d > 18 && d < 24 && !hasLineOfSight(sim.map, (q.x + 0.5) * CELL_SIZE, (q.z + 0.5) * CELL_SIZE, P.x, P.z);
      });
      if (!c) return;
      M.x = (c.x + 0.5) * CELL_SIZE;
      M.z = (c.z + 0.5) * CELL_SIZE;
      M.dormantT = 0; // passé la première minute de calme
      M.warpT = 1e9; // ici, elle ne triche pas : on regarde comment elle se tapit
      M.stalkT = 99;
      const spot = sim.darkSpot(sim.map, P, M, 8, 20, true);
      if (!spot) return;
      Object.assign(M, { mode: 'stalk', watch: spot, silent: true, repathT: 0 });
      // il regarde ailleurs (dos à l'endroit où elle va)
      const away = Math.atan2(spot.x - P.x, spot.z - P.z);
      for (let i = 0; i < 60 * 25 && M.mode !== 'watch'; i++) {
        sim.step({ yaw: away });
        if (M.mode === 'chase') return;
      }
      if (M.mode !== 'watch') return;
      watched++;
      sim.darkCellsOf(sim.map);
      const darkAt = (x, z) => sim.map.darkCells[Math.floor(z / CELL_SIZE) * sim.map.W + Math.floor(x / CELL_SIZE)];
      if (darkAt(M.x, M.z) < darkAt(P.x, P.z)) darker++;
      const d = Math.hypot(M.x - P.x, M.z - P.z);
      assert.ok(d > 6 && d < 22, `à distance (${d.toFixed(1)} m)`);
      // il ne la voit pas : elle reste là à l'observer, sans charger
      for (let i = 0; i < 60; i++) sim.step({ yaw: away });
      assert.notEqual(M.mode, 'chase', 'elle observe sans charger');
      // la lampe braquée sur elle, de loin et tout au début : un seul sursaut, elle s'enfuit (de près, elle chargerait)
      P.flashlight = true;
      const yaw = Math.atan2(-(M.x - P.x), -(M.z - P.z));
      if (M.mode === 'watch' && hasLineOfSight(sim.map, P.x, P.z, M.x, M.z)) {
        sim.step({ yaw });
        if (M.mode === 'flee') fled++;
      }
    });
  }
  assert.ok(watched >= 4, `${watched} fois tapie sur 6`);
  assert.ok(fled >= 1, 'elle sursaute devant la lampe');
  assert.ok(darker >= 3, `${darker} fois dans un coin plus sombre que le joueur`);
  // plus agressive à chaque cassette : vitesse de charge
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 4 });
  const speedAt = (n) => {
    sim.cassettes = n;
    sim.monster.mode = 'chase';
    sim.monster.x = sim.player.x + 5;
    sim.monster.z = sim.player.z;
    sim.updateMonster();
    return sim.monster.speed;
  };
  assert.equal(sim.aggro, 0);
  const s0 = speedAt(0);
  const s3 = speedAt(3);
  const s5 = speedAt(7);
  assert.ok(s0 < s3 && s3 < s5, `la charge s'accélère : ${s0.toFixed(2)} < ${s3.toFixed(2)} < ${s5.toFixed(2)}`);
  assert.ok(Math.abs(sim.aggro - 0.8) < 1e-9, `au plus 0,8 au Level 0 (${sim.aggro})`);
});

test("Level 37 (Poolrooms) : salles et bassins reliés, 3 vannes et 3 toboggans accessibles, l'eau ralentit", () => {
  for (const sd of [1, 2, 3, 37, 99, 123, 500, 777]) {
    const m = createPoolMap(sd);
    assert.equal(m.level, 2);
    assert.equal(m.fuses.length, 3, `graine ${sd} : 3 vannes`);
    for (const f of m.fuses) assert.ok(m.dist[f.gz * m.W + f.gx] > 0, `graine ${sd} : vanne accessible`);
    // 3 toboggans de couleurs différentes, dans un mur, devant une case accessible, au sec ou presque
    assert.deepEqual(m.slides.map((x) => x.color), ['red', 'yellow', 'blue'], `graine ${sd} : 3 toboggans`);
    for (const x of m.slides) {
      assert.ok(m.dist[x.gz * m.W + x.gx] > 10, `graine ${sd} : toboggan accessible, loin du départ`);
      assert.ok(m.isWall(x.nx, x.nz), "le toboggan sort d'un mur");
      assert.ok(m.depthAt(x.x - x.dx * 0.6, x.z - x.dz * 0.6) <= 0.21, 'on y entre au sec ou presque');
      assert.ok(!m.collide(x.x - x.dx * 0.6, x.z - x.dz * 0.6, 0.38), 'rien devant la bouche');
    }
    // objectifs et toboggans bien écartés les uns des autres
    const pts = [...m.fuses, ...m.slides];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) > 7, `graine ${sd} : deux objectifs trop proches`);
    assert.ok(m.walkable.some((c) => m.depth[c.z * m.W + c.x] >= 0.5), `graine ${sd} : des bassins`);
    for (const it of m.items) assert.equal(m.depthAt(it.x, it.z), 0, 'les objets sont au sec');
    // des salles préfabriquées : lagon, voûtes, couloirs… séparées par des cloisons percées de portes
    assert.ok(m.rooms.length >= 12, `graine ${sd} : ${m.rooms.length} salles`);
    assert.equal(m.rooms.filter((r) => r.type === 'tech').length >= 3, true, `graine ${sd} : 3 locaux techniques`);
    for (const sg of m.segs) assert.ok(m.collide((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2, 0.38), 'une cloison arrête le joueur');
    for (const d of m.doors) assert.ok(!m.collide(d.px, d.pz, 0.38), 'on passe par une porte');
  }
  // dans l'eau, on avance moins vite
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 5, level: 2 });
  const P = sim.player;
  const dry = sim.map.walkable.find((c) => sim.map.depth[c.z * sim.map.W + c.x] === 0);
  const deep = sim.map.walkable.find((c) => sim.map.depth[c.z * sim.map.W + c.x] >= 0.5);
  const walk = (c) => {
    P.x = (c.x + 0.5) * CELL_SIZE;
    P.z = (c.z + 0.5) * CELL_SIZE;
    const x0 = P.x;
    const z0 = P.z;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      P.x = x0;
      P.z = z0;
      sim.step({ my: 1, yaw });
      const d = Math.hypot(P.x - x0, P.z - z0);
      if (d > 0.001) return d;
    }
    return 0;
  };
  const a = walk(dry);
  const b = walk(deep);
  assert.ok(b < a * 0.8, `plus lent dans l'eau (${b.toFixed(4)} contre ${a.toFixed(4)})`);
  // l'entité du Level 1 y chasse aussi : elle part loin, au sec, et ses chemins ne passent que par les portes
  const m = sim.map;
  const ms = m.monsterSpawn;
  assert.ok(m.dist[ms.gz * m.W + ms.gx] > 15, "l'entité part loin du départ");
  assert.equal(m.depthAt(ms.x, ms.z), 0, "l'entité part au sec");
  for (const sd of [3, 37, 99]) {
    const pm = createPoolMap(sd);
    const a = pm.monsterSpawn;
    for (const r of pm.rooms.filter((q) => q.type === 'tech')) {
      const path = findPath(pm, a.x, a.z, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      assert.ok(path && path.length, `graine ${sd} : l'entité trouve un chemin`);
      let prev = a;
      for (const w of path) {
        const crossed = pm.segs.some((sg) => {
          const d1x = w.x - prev.x, d1z = w.z - prev.z, d2x = sg.x1 - sg.x0, d2z = sg.z1 - sg.z0;
          const den = d1x * d2z - d1z * d2x;
          if (Math.abs(den) < 1e-9) return false;
          const t = ((sg.x0 - prev.x) * d2z - (sg.z0 - prev.z) * d2x) / den;
          const u = ((sg.x0 - prev.x) * d1z - (sg.z0 - prev.z) * d1x) / den;
          return t > 0 && t < 1 && u >= 0 && u <= 1;
        });
        assert.ok(!crossed, `graine ${sd} : l'entité traverse une cloison`);
        prev = w;
      }
    }
  }
  run(sim, 3);
  assert.ok(sim.monster.x !== ms.x || sim.monster.z !== ms.z, "l'entité bouge aux Poolrooms");
});

test('Level 37 : le premier qui prend un toboggan choisit la couleur, les autres se referment', () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 12, level: 2, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], localId: 'a' });
  for (const f of sim.map.fuses) {
    sim.players[0].x = f.x;
    sim.players[0].z = f.z;
    sim.step();
  }
  assert.equal(sim.open, true);
  const [red, , blue] = sim.map.slides;
  const [A, B] = sim.players;
  A.x = red.x - red.dx * 0.6;
  A.z = red.z - red.dz * 0.6;
  sim.step();
  assert.equal(A.status, 'elevator');
  assert.equal(sim.slide, 0);
  B.x = blue.x - blue.dx * 0.6;
  B.z = blue.z - blue.dz * 0.6;
  sim.step();
  assert.equal(B.status, 'alive', 'le toboggan bleu est fermé');
  // l'invité reçoit le toboggan choisi
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 12, level: 2, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], localId: 'b' });
  guest.applySnapshot(sim.snapshot());
  assert.equal(guest.slide, 0);
  B.x = red.x - red.dx * 0.6;
  B.z = red.z - red.dz * 0.6;
  sim.step();
  assert.equal(B.status, 'elevator');
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'playing');
  assert.equal(sim.level, HOTEL_LEVEL, 'le toboggan rouge mène au Level 5, le Terror Hotel');
  assert.ok(sim.players.every((p) => p.status === 'alive'), "tout le monde arrive à l'hôtel");
});

test('Level 37 : le toboggan jaune descend aux Tuyauteries (Level 2), le dernier niveau', () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 12, level: 2 });
  for (const f of sim.map.fuses) {
    sim.player.x = f.x;
    sim.player.z = f.z;
    sim.step();
  }
  const yellow = sim.map.slides.find((x) => x.color === 'yellow');
  assert.equal(yellow.to, PIPES_LEVEL);
  sim.player.x = yellow.x - yellow.dx * 0.6;
  sim.player.z = yellow.z - yellow.dz * 0.6;
  sim.step();
  assert.equal(sim.player.status, 'elevator');
  sim.drainEvents();
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'playing', 'pas encore gagné : il reste les Tuyauteries');
  assert.equal(sim.level, PIPES_LEVEL);
  assert.ok(sim.drainEvents().some((e) => e.type === 'level' && e.level === PIPES_LEVEL));
  assert.equal(sim.map.valves.length, 4, 'les 4 vannes des galeries');
  assert.equal(sim.slide, -1, "plus de toboggan : l'ascenseur de service est la sortie");
});

test('objectifs écartés : cassettes et fusibles loin les uns des autres (en marche)', () => {
  const minPath = (m, pts) => {
    let mn = Infinity;
    for (const a of pts) {
      const d = bfs(m.grid, m.W, m.H, a.gx, a.gz);
      for (const b of pts) if (b !== a && d[b.gz * m.W + b.gx] >= 0) mn = Math.min(mn, d[b.gz * m.W + b.gx]);
    }
    return mn;
  };
  for (const sd of [1, 5, 9, 42, 77]) {
    const up = createLevel0(sd).floors[0];
    assert.ok(minPath(up, up.cassettes) >= 12, `graine ${sd} : cassettes trop proches (${minPath(up, up.cassettes)} cases)`);
    const w = createWarehouseMap(sd * 7 + 13);
    assert.ok(minPath(w, w.fuses) >= 12, `graine ${sd} : fusibles trop proches (${minPath(w, w.fuses)} cases)`);
  }
});

test('Level 37 : on traverse chaque porte en marchant, les cloisons arrêtent le joueur', () => {
  let crossed = 0;
  for (const sd of [1, 2, 3, 4, 5, 6]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd, level: 2 });
    for (const d of sim.map.doors) {
      const nx = d.along === 'z' ? 1 : 0;
      const nz = d.along === 'x' ? 1 : 0;
      let x = d.px - nx * 1.2;
      let z = d.pz - nz * 1.2;
      if (sim.isColliding(x, z, 0.38, 0)) {
        x = d.px + nx * 1.2;
        z = d.pz + nz * 1.2;
      }
      const dir = Math.sign(d.px - x + (d.pz - z));
      for (let i = 0; i < 80; i++) {
        const p = sim.moveWithCollisions(x, z, nx * dir * 0.05, nz * dir * 0.05, 0.38, 0);
        x = p.x;
        z = p.z;
      }
      assert.ok((x - d.px) * nx * dir + (z - d.pz) * nz * dir > 1, `graine ${sd} : porte franchie`);
      crossed++;
    }
  }
  assert.ok(crossed > 60);
});


// --- Level 5, le Terror Hotel ---
const goTo = (sim, P, x, z) => {
  P.x = x;
  P.z = z;
};
const hotelSim = (opts = {}) => new BackroomsSim({ difficulty: 'peaceful', seed: 7, level: HOTEL_LEVEL, ...opts });

test('Level 5 : un hôtel de 21 chambres (201 à 221), 6 lettres, des cachettes, tout accessible', () => {
  for (const sd of [1, 5, 9, 42, 77, 123]) {
    const m = createHotelMap(sd);
    assert.equal(m.level, HOTEL_LEVEL);
    assert.equal(m.rooms.length, 21);
    assert.deepEqual(m.rooms.map((r) => r.num), Array.from({ length: 21 }, (_, i) => 201 + i));
    assert.equal(m.letters.length, 6);
    assert.equal(new Set(m.letters.map((L) => L.room)).size, 6, 'une lettre par chambre');
    for (const L of m.letters) assert.ok(m.dist[L.gz * m.W + L.gx] > 0 || m.collide(L.x, L.z, 0.01), `graine ${sd} : lettre accessible`);
    // dans l'ordre des chambres, les boîtes aux lettres épellent le mot
    assert.deepEqual(m.letters.map((L) => L.num), [...m.letters.map((L) => L.num)].sort((a, b) => a - b));
    assert.equal(m.mailbox.boxes.length, 21);
    assert.match(m.code, /^\d{4}$/);
    assert.ok(m.spots.filter((s) => s.kind === 'bed').length === 21, 'un lit par chambre');
    assert.ok(m.spots.some((s) => s.kind === 'wardrobe'), 'des armoires');
    for (const s of m.spots) {
      assert.ok(!m.collide(s.out.x, s.out.z, 0.38), 'on sort de sa cachette sans être coincé');
      assert.ok(!m.isWall(Math.floor(s.out.x / CELL_SIZE), Math.floor(s.out.z / CELL_SIZE)));
    }
    // chaque chambre est reliée au hall ; l'entité part loin du hall
    for (const r of m.rooms) assert.ok(m.dist[r.door.z * m.W + r.door.x] > 0, `graine ${sd} : chambre ${r.num} reliée`);
    assert.ok(m.dist[m.monsterSpawn.gz * m.W + m.monsterSpawn.gx] > 12);
  }
  assert.deepEqual(parseWords('search, Shadow\nabc\nmirrors\nÉCLAIR'), ['SEARCH', 'SHADOW', 'ECLAIR']);
});

test('Level 5 : lettres ramassées, postées dans les boîtes, code au plafond, porte de secours', () => {
  const sim = hotelSim();
  const P = sim.player;
  const m = sim.map;
  assert.ok(WORDS.includes(sim.word), 'un mot de la liste standard');
  assert.equal(sim.open, false);
  // le clavier ne s'ouvre pas sans le bon code
  goTo(sim, P, m.keypad.x, m.keypad.z - 0.6);
  sim.step({ useSel: true });
  assert.ok(sim.drainEvents().some((e) => e.type === 'keypad'));
  sim.step({ code: '0000' === m.code ? '1111' : '0000' });
  assert.ok(sim.drainEvents().some((e) => e.type === 'codeWrong'));
  // les 6 lettres
  for (const L of m.letters) {
    goTo(sim, P, L.x, L.z);
    sim.step();
  }
  assert.equal(P.letters.length, 6);
  const got = sim.drainEvents().filter((e) => e.type === 'letter');
  assert.equal(got.map((e) => e.char).join(''), sim.word, 'les lettres, dans l\'ordre des chambres, forment le mot');
  // les poster
  goTo(sim, P, m.mailbox.x + 0.7, (m.mailbox.z0 + m.mailbox.z1) / 2);
  sim.step({ useSel: true });
  assert.equal(sim.posted, 6);
  assert.equal(sim.codeShown, true);
  assert.equal(P.letters.length, 0);
  assert.ok(sim.drainEvents().some((e) => e.type === 'codeShown'));
  // le bon code ouvre la porte ; on la passe : partie gagnée
  sim.step({ code: m.code });
  assert.equal(sim.open, true);
  const E = m.elevator;
  goTo(sim, P, E.x, E.z);
  sim.step();
  assert.equal(P.status, 'elevator');
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'won');
});

test('Level 5 : caché sous un lit, l\'entité perd sa trace ; elle tue si elle l\'a vu s\'y glisser', () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 7, level: HOTEL_LEVEL });
  const P = sim.player;
  const M = sim.monster;
  const m = sim.map;
  const sp = m.spots.find((s) => s.kind === 'bed');
  // se cacher puis ressortir
  goTo(sim, P, sp.out.x, sp.out.z);
  sim.step({ useSel: true });
  assert.equal(P.hidden, sp.id);
  sim.step({ my: 1, yaw: 0 });
  assert.equal(P.x, sp.x, 'caché : on ne bouge pas');
  sim.step({ useSel: true });
  assert.equal(P.hidden, -1);
  // l'entité le traque mais il se cache loin d'elle : elle le perd
  sim.step({ useSel: true });
  Object.assign(M, { x: sp.out.x + 9, z: sp.out.z, mode: 'chase', unseenT: 2, path: [], lastSeenX: sp.out.x, lastSeenZ: sp.out.z });
  if (sim.map.isWall(Math.floor(M.x / CELL_SIZE), Math.floor(M.z / CELL_SIZE))) Object.assign(M, { x: m.monsterSpawn.x, z: m.monsterSpawn.z });
  let lost = false;
  for (let i = 0; i < 60 * 8; i++) {
    sim.step();
    if (sim.drainEvents().some((e) => e.type === 'lost')) lost = true;
  }
  assert.equal(P.status, 'alive', 'caché, il survit');
  assert.ok(lost || M.mode !== 'chase', 'elle a perdu sa trace');
  // elle est tout près et le voit se cacher : elle le sort de là
  sim.step({ useSel: true });
  assert.equal(P.hidden, -1);
  Object.assign(M, { x: sp.out.x + 0.9, z: sp.out.z, mode: 'chase', unseenT: 0, path: [], dormantT: 0 });
  M.yaw = Math.atan2(sp.x - M.x, sp.z - M.z); // elle regarde la cachette
  sim.step({ useSel: true });
  assert.equal(M.sawHide, sp.id, "elle l'a vu s'y glisser");
  run(sim, 3);
  assert.equal(P.status, 'dead');
});

test('Level 5 : la course s\'entend, accroupi on passe en silence ; les lettres d\'un mort reviennent', () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 7, level: HOTEL_LEVEL });
  const P = sim.player;
  const M = sim.monster;
  const m = sim.map;
  // dans le couloir, l'entité à 8 m, sans le voir (de dos, derrière un coin : on coupe la vue)
  const c = m.corridorCells.find((k) => k.z === m.ring.z0 && k.x === m.ring.x0 + 2);
  P.x = (c.x + 0.5) * CELL_SIZE;
  P.z = (c.z + 0.5) * CELL_SIZE;
  const far = { x: P.x + 10, z: P.z };
  const reset = () => Object.assign(M, { x: far.x, z: far.z, mode: 'patrol', path: [], targetWander: { x: far.x, z: far.z } });
  reset();
  P.detect = 0;
  sim.step({ my: 1, yaw: Math.PI / 2, crouch: true });
  assert.notEqual(M.mode, 'search', 'accroupi, elle n\'entend rien');
  reset();
  sim.step({ my: 1, yaw: Math.PI / 2, run: true });
  assert.ok(M.mode === 'search' || M.mode === 'chase', 'la course attire l\'entité');
  // un joueur attrapé avec des lettres en poche : elles retournent à leur place
  const L = m.letters[0];
  P.x = L.x;
  P.z = L.z;
  sim.step();
  assert.equal(L.taken, true);
  sim.dropLetters(P);
  assert.equal(L.taken, false);
});

test('Level 5 : l\'invité reçoit le mot, les lettres, la cachette et le code affiché', () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 11, level: HOTEL_LEVEL, players, localId: 'a', words: ['MYWORD'] });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 11, level: HOTEL_LEVEL, players, localId: 'b' });
  assert.equal(host.word, 'MYWORD', 'liste VIP');
  const B = host.players[1];
  const sp = host.map.spots[0];
  B.x = sp.out.x;
  B.z = sp.out.z;
  host.step({}, { b: { useSel: true } });
  const L = host.map.letters[2];
  host.players[0].x = L.x;
  host.players[0].z = L.z;
  host.step();
  guest.applySnapshot(host.snapshot());
  assert.equal(guest.word, 'MYWORD');
  assert.equal(guest.map.letters[2].taken, true);
  assert.equal(guest.player.hidden, sp.id, 'l\'invité se voit caché');
  assert.equal(guest.player.x, sp.x);
  assert.deepEqual(guest.players[0].letters, [2]);
});


test("Level 5 : on entre dans chaque chambre par sa porte en marchant, les meubles arrêtent le joueur", () => {
  const sim = hotelSim();
  const P = sim.player;
  const m = sim.map;
  for (const r of m.rooms) {
    const [dx, dz] = r.dir;
    P.x = (r.door.x + dx + 0.5) * CELL_SIZE;
    P.z = (r.door.z + dz + 0.5) * CELL_SIZE;
    P.hidden = -1;
    const yaw = Math.atan2(dx, dz); // vers la chambre
    run(sim, 2.6, { my: 1, yaw });
    const gx = Math.floor(P.x / CELL_SIZE);
    const gz = Math.floor(P.z / CELL_SIZE);
    assert.ok(gx >= r.x0 && gx <= r.x1 && gz >= r.z0 && gz <= r.z1, `chambre ${r.num} : on y entre`);
  }
  for (const f of m.furniture) assert.ok(sim.isColliding(f.x, f.z, 0.38), `${f.kind} : on ne le traverse pas`);
});


test("Level 5 : caché, l'entité quitte la pièce et reprend sa ronde ; un autre joueur qui court l'attire", () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 7, level: HOTEL_LEVEL, players, localId: 'a' });
  const [A, B] = sim.players;
  const M = sim.monster;
  const m = sim.map;
  const sp = m.spots.find((s) => s.kind === 'bed');
  A.x = sp.out.x;
  A.z = sp.out.z;
  sim.step({ useSel: true });
  assert.equal(A.hidden, sp.id);
  // B attend sans bruit au bout du couloir
  const far = m.corridorCells.reduce((b, c) => (Math.hypot((c.x + 0.5) * CELL_SIZE - A.x, (c.z + 0.5) * CELL_SIZE - A.z) > Math.hypot((b.x + 0.5) * CELL_SIZE - A.x, (b.z + 0.5) * CELL_SIZE - A.z) ? c : b));
  B.x = (far.x + 0.5) * CELL_SIZE;
  B.z = (far.z + 0.5) * CELL_SIZE;
  // l'entité traquait A, qui s'est caché hors de sa vue
  Object.assign(M, { x: sp.out.x, z: sp.out.z, mode: 'chase', unseenT: 0.6, path: [], lastSeenX: sp.out.x, lastSeenZ: sp.out.z, target: 'a' });
  M.x += (sp.out.x - sp.x) * 0.8;
  M.z += (sp.out.z - sp.z) * 0.8;
  // A retient son souffle (Maj) : elle ne l'entend pas respirer
  run(sim, 0.1, { run: true });
  assert.equal(M.mode, 'patrol', 'elle renonce');
  run(sim, 6, { run: true });
  assert.equal(A.status, 'alive');
  assert.ok(Math.hypot(M.x - A.x, M.z - A.z) > 5, "elle s'éloigne de la cachette");
  // B se met à courir près d'elle : elle va voir
  B.x = M.x + 6;
  B.z = M.z;
  if (sim.isColliding(B.x, B.z, 0.38, 0)) { B.x = M.x; B.z = M.z + 6; }
  sim.step({}, { b: { my: 1, run: true, yaw: 0 } });
  assert.ok(M.mode === 'search' || M.mode === 'chase', "le bruit de B l'attire");
  assert.equal(M.target, 'b', 'elle part vers B');
});

// --- Level 2 : les galeries, les halles et le troupeau ---
import { createPipesMap, Z as Z2, PIPES_LEVEL } from '../backrooms/engine/level2.js';
import { GOAT_MODES, ALPHA_RAGE, ALPHA_TAME, isLit as isLitL2 } from '../backrooms/engine/goats.js';
import { BREAKER_T, BLOW_DELAY, VALVE_T, WALK_SPEED, CHASE_MIN, DOOR_GAP } from '../backrooms/engine/sim.js';

// un bout de galerie droite de n cases, sans grille, jet, renfoncement ni objet : { x0, z } (le long de x) ou null
const straightRun = (m, n) => {
  const free = (x, z) => m.grid[z * m.W + x] === T.FLOOR && m.zone[z * m.W + x] !== Z2.HALL && !(m.jetAt && m.jetAt(x, z)) && !m.props.some((p) => !p.walk && Math.hypot(p.x - (x + 0.5) * CELL_SIZE, p.z - (z + 0.5) * CELL_SIZE) < 1.6);
  for (let z = 2; z < m.H - 2; z++) {
    for (let x = 2; x + n < m.W - 2; x++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = free(x + k, z) && m.isWall(x + k, z - 1) && m.isWall(x + k, z + 1);
      if (ok && m.isWall(x - 1, z) === false) return { x0: x, z };
    }
  }
  return null;
};
const level2 = (opts = {}) => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 31, level: PIPES_LEVEL, ...opts });
  sim.map.goatLit = new Uint8Array(sim.map.W * sim.map.H); // tout dans le noir (les tests allument ce qu'il faut)
  return sim;
};
const cellC = (v) => (v + 0.5) * CELL_SIZE;

test('Level 2 : grandes halles à piliers, cuves, bergerie, renfoncements ; tout est relié', () => {
  for (const seed of [13603, 106, 491, 5, 77, 1000, 31337, 2024]) {
    const m = createPipesMap(seed);
    assert.ok(m.halls.length >= 1, 'au moins une grande halle');
    const big = m.halls.reduce((b, h) => ((h.x1 - h.x0 + 1) * (h.z1 - h.z0 + 1) > (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1) ? h : b));
    assert.ok((big.x1 - big.x0 + 1) * (big.z1 - big.z0 + 1) >= 60, `une halle d'au moins 60 cases (${seed})`);
    assert.ok(m.den, 'une bergerie');
    let pillars = 0;
    for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) if (m.pillarAt(x, z)) pillars++;
    assert.ok(pillars >= 4, 'des piliers de béton');
    for (const t of m.tanks) assert.equal(m.grid[t.gz * m.W + t.gx], T.MACHINE, 'une cuve occupe ses cases');
    assert.ok(m.niches.length >= 8, 'des renfoncements le long des galeries');
    for (const n of m.niches) assert.equal([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !m.isWall(n.gx + dx, n.gz + dz)).length, 1, 'un renfoncement est un cul-de-sac');
    const d = bfs(m.grid, m.W, m.H, m.spawn.gx, m.spawn.gz);
    for (const c of m.walkable) assert.ok(d[c.z * m.W + c.x] >= 0, `case (${c.x}, ${c.z}) isolée (${seed})`);
    for (const v of m.valves) assert.ok(d[v.gz * m.W + v.gx] >= 0, 'vanne atteignable');
    assert.ok(m.goatSpawn.every((g) => g.gx >= m.den.x0 && g.gx <= m.den.x1 && g.gz >= m.den.z0 && g.gz <= m.den.z1), 'le troupeau part de la bergerie');
  }
});

test('Level 2 : le troupeau remplace l\'entité (pas de chèvres en mode paisible)', () => {
  const sim = level2({ players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] });
  assert.equal(sim.goats.length, 4, '2 de plus que de joueurs');
  assert.equal(new BackroomsSim({ difficulty: 'hard', seed: 31, level: PIPES_LEVEL }).goats.length, 4, 'au moins 3, une de plus en difficile');
  assert.equal(new BackroomsSim({ difficulty: 'peaceful', seed: 31, level: PIPES_LEVEL }).goats, null);
  assert.equal(new BackroomsSim({ difficulty: 'normal', seed: 31, level: 1 }).goats, null, "l'entrepôt garde son entité");
});

test('Level 2 : une chèvre repère un joueur dans le noir, gratte le sol, fonce et le percute', () => {
  const sim = level2();
  const r = straightRun(sim.map, 9);
  assert.ok(r, 'une galerie droite');
  const P = sim.player;
  P.x = cellC(r.x0);
  P.z = cellC(r.z);
  P.flashlight = false;
  const g = sim.goats[0];
  sim.goats = [g];
  g.x = cellC(r.x0 + 4);
  g.z = cellC(r.z);
  g.cool = 0;
  const acts = [];
  for (let i = 0; i < 60 * 5 && P.status === 'alive' && !(P.hurt > 0); i++) {
    sim.step();
    for (const e of sim.drainEvents()) if (e.type === 'goat' || e.type === 'jumpscare' || e.type === 'hurt') acts.push(e.act || e.type);
  }
  assert.ok(acts.includes('windup') && acts.includes('charge'), `elle prévient avant de charger (${acts.join(', ')})`);
  assert.ok(acts.indexOf('windup') < acts.indexOf('charge'));
  assert.equal(P.status, 'alive', 'la première charge renverse');
  assert.equal(P.hurt, 1);
  assert.ok(acts.includes('hurt'));
  // la seconde tue
  P.hurtT = 0;
  P.lockT = 0;
  P.x = cellC(r.x0);
  P.z = cellC(r.z);
  g.x = cellC(r.x0 + 4);
  g.z = cellC(r.z);
  g.mode = 'roam';
  g.cool = 0;
  for (let i = 0; i < 60 * 8 && P.status === 'alive'; i++) {
    sim.step();
    for (const e of sim.drainEvents()) if (e.type === 'jumpscare') acts.push(e.type);
    P.x = cellC(r.x0);
    P.z = cellC(r.z);
  }
  assert.equal(P.status, 'dead', 'la seconde charge tue');
  assert.ok(acts.includes('jumpscare'));
});

test('Level 2 : la lampe braquée sur une chèvre la fait détaler, même en pleine charge', () => {
  for (const charging of [false, true]) {
    const sim = level2();
    const r = straightRun(sim.map, 9);
    const P = sim.player;
    P.x = cellC(r.x0);
    P.z = cellC(r.z);
    const g = sim.goats[0];
    sim.goats = [g];
    g.x = cellC(r.x0 + 5);
    g.z = cellC(r.z);
    P.yaw = Math.atan2(-(g.x - P.x), -(g.z - P.z)); // on la regarde
    P.flashlight = true;
    if (charging) {
      g.mode = 'charge';
      g.dirX = -1;
      g.dirZ = 0;
      g.speed = 6;
      g.maxRun = 20;
    }
    const d0 = Math.hypot(g.x - P.x, g.z - P.z);
    let fled = false;
    for (let i = 0; i < 60 * 2; i++) {
      sim.step();
      if (sim.drainEvents().some((e) => e.type === 'goat' && e.act === 'flee')) fled = true;
    }
    assert.ok(fled, 'elle fuit la lumière');
    assert.equal(P.status, 'alive');
    assert.ok(Math.hypot(g.x - P.x, g.z - P.z) > d0, 'elle s\'éloigne');
  }
});

test("Level 2 : sous une lampe allumée, on est à l'abri ; une charge manquée finit contre un mur", () => {
  const sim = level2();
  const r = straightRun(sim.map, 9);
  const P = sim.player;
  P.flashlight = false;
  P.x = cellC(r.x0);
  P.z = cellC(r.z);
  // la case du joueur est éclairée : la chèvre s'arrête au bord de l'ombre et attend
  const W = sim.map.W;
  sim.map.goatLit[r.z * W + r.x0] = 1;
  sim.map.goatLit[r.z * W + r.x0 + 1] = 1;
  const g = sim.goats[0];
  sim.goats = [g];
  g.x = cellC(r.x0 + 6);
  g.z = cellC(r.z);
  g.cool = 0;
  run(sim, 6);
  assert.equal(P.status, 'alive', 'à l\'abri sous la lampe');
  assert.ok(g.x > (r.x0 + 2) * CELL_SIZE - 0.01, 'elle n\'entre pas dans la lumière');
  assert.ok(['lurk', 'stalk'].includes(g.mode), `elle attend au bord de l'ombre (${g.mode})`);
  // lancée droit sur un mur : elle s'assomme
  sim.map.goatLit.fill(0);
  P.x = P.z = -50;
  g.mode = 'charge';
  g.x = cellC(r.x0 + 4);
  g.dirX = 0;
  g.dirZ = 1; // en travers de la galerie : le mur est à un mètre
  g.speed = 6;
  g.maxRun = 30;
  g.target = null;
  let crash = false;
  for (let i = 0; i < 60 && !crash; i++) {
    sim.step();
    crash = sim.drainEvents().some((e) => e.type === 'goat' && e.act === 'crash');
  }
  assert.ok(crash, 'contre le mur');
  assert.equal(g.mode, 'stun');
});

test('Level 2 : un disjoncteur par secteur, atteignable ; le départ et l\'ascenseur sur leur propre circuit', () => {
  for (const seed of [13603, 106, 491, 5, 77, 1000, 31337, 2024]) {
    const m = createPipesMap(seed);
    assert.equal(m.breakers.length, 4, `4 disjoncteurs (${seed})`);
    assert.deepEqual(m.breakers.map((b) => b.sector).sort(), [0, 1, 2, 3], 'un par secteur');
    const d = bfs(m.grid, m.W, m.H, m.spawn.gx, m.spawn.gz);
    for (const b of m.breakers) {
      assert.ok(d[b.gz * m.W + b.gx] >= 0, 'disjoncteur atteignable');
      assert.ok(m.isWall(b.gx + b.dx, b.gz + b.dz), 'fixé à un mur');
    }
    for (const l of m.lights) {
      assert.ok(l.sector >= -1 && l.sector < 4);
      if (Math.abs(l.gx - m.spawn.gx) + Math.abs(l.gz - m.spawn.gz) <= 2) assert.equal(l.sector, -1, 'le départ ne s\'éteint jamais');
    }
    for (let i = 0; i < 4; i++) assert.ok(m.lights.some((l) => l.sector === i && l.state === 'on'), `des néons allumés dans le secteur ${i}`);
  }
});

test('Level 2 : une vanne fermée fait sauter les néons de son secteur ; le disjoncteur les rallume', () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 31, players, localId: 1, level: PIPES_LEVEL });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 31, players, localId: 2, level: PIPES_LEVEL });
  const P = sim.player;
  const v = sim.map.valves[1];
  const mine = sim.map.lights.filter((l) => l.sector === 1 && l.base === 'on');
  const others = sim.map.lights.filter((l) => l.sector !== 1);
  const before = others.map((l) => l.state);
  assert.ok(mine.length > 2);
  P.x = v.sx;
  P.z = v.sz;
  const ev = [];
  const go = (sec) => {
    for (let i = 0; i < sec * 60; i++) {
      sim.step();
      ev.push(...sim.drainEvents().map((e) => e.type));
    }
  };
  go(VALVE_T + 0.2);
  assert.ok(v.closed && sim.valves === 1, 'vanne fermée');
  assert.ok(mine.every((l) => l.state === 'flicker'), 'les néons grésillent');
  const gen = sim.map.lightGen;
  go(BLOW_DELAY + 0.1);
  assert.ok(ev.includes('blowout'));
  assert.ok(mine.every((l) => l.state === 'off'), 'puis sautent');
  assert.ok(sim.map.lightGen > gen, "l'image relit l'éclairage");
  assert.deepEqual(others.map((l) => l.state), before, 'les autres secteurs ne bougent pas');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(guest.map.lights.filter((l) => l.sector === 1 && l.base === 'on').every((l) => l.state === 'off'), "chez l'invité aussi");
  // le disjoncteur d'un autre secteur ne sert à rien
  const b0 = sim.map.breakers.find((b) => b.sector === 0);
  P.x = b0.sx;
  P.z = b0.sz;
  go(BREAKER_T + 0.5);
  assert.ok(!b0.done, 'rien à réarmer');
  const b = sim.map.breakers.find((q) => q.sector === 1);
  P.x = b.sx;
  P.z = b.sz;
  go(BREAKER_T + 0.2);
  assert.ok(b.done && ev.includes('breaker'), 'réarmé');
  assert.ok(mine.every((l) => l.state === 'on'), 'le secteur se rallume');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(guest.map.lights.filter((l) => l.sector === 1 && l.base === 'on').every((l) => l.state === 'on'));
  assert.ok(guest.map.breakers.find((q) => q.sector === 1).done);
});

test('Level 2 : le bouc alpha ignore la lumière en fin de partie ; ébouillanté, il file à la bergerie', () => {
  const sim = level2();
  const r = straightRun(sim.map, 9);
  const P = sim.player;
  const g = sim.goats[0];
  assert.ok(g.alpha && !sim.goats[1].alpha, 'un seul bouc');
  sim.goats = [g];
  P.flashlight = false;
  P.x = cellC(r.x0);
  P.z = cellC(r.z);
  const W = sim.map.W;
  sim.map.goatLit[r.z * W + r.x0] = 1;
  sim.map.goatLit[r.z * W + r.x0 + 1] = 1;
  sim.valves = ALPHA_RAGE;
  P.hurt = 1; // déjà renversé une fois : ce coup-ci est mortel
  g.x = cellC(r.x0 + 6);
  g.z = cellC(r.z);
  g.cool = 0;
  const acts = [];
  for (let i = 0; i < 60 * 6 && P.status === 'alive'; i++) {
    sim.step();
    for (const e of sim.drainEvents()) if (e.type === 'goat') acts.push(e.act);
  }
  assert.ok(acts.includes('rage'), 'il se fâche');
  assert.equal(P.status, 'dead', 'la lumière ne le retient plus');
  // ébouillanté par un jet qui crache, en pleine charge (le joueur revient, loin)
  P.status = 'alive';
  sim.state = 'playing';
  P.x = P.z = -50;
  const j = sim.map.jets[0];
  sim.jetOn = (q) => (q === j ? 2 : 0);
  const [ax, az] = j.axis === 'x' ? [1, 0] : [0, 1];
  g.mode = 'charge';
  g.x = j.x - ax * 2.2;
  g.z = j.z - az * 2.2;
  g.dirX = ax;
  g.dirZ = az;
  g.speed = 6;
  g.maxRun = 30;
  g.target = null;
  let scald = false;
  for (let i = 0; i < 60 && !scald; i++) {
    sim.step();
    scald = sim.drainEvents().some((e) => e.type === 'goat' && e.act === 'scald');
  }
  assert.ok(scald, 'ébouillanté');
  assert.equal(g.mode, 'flee');
  assert.ok(g.tameT > ALPHA_TAME - 1 && !g.rage, 'il craint de nouveau la lumière');
  const den = sim.map.goatSpawn[0];
  assert.ok(Math.hypot(g.goal.x - den.x, g.goal.z - den.z) < 0.1, 'il file à la bergerie');
});

test('Level 2 : tout le courant saute de temps en temps ; plus rien ne protège, le troupeau attaque', () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 31, level: PIPES_LEVEL });
  assert.ok(sim.nextBlackout > 40 && sim.nextBlackout < 200, 'une coupure viendra');
  assert.equal(new BackroomsSim({ difficulty: 'peaceful', seed: 31, level: PIPES_LEVEL }).nextBlackout, Infinity, 'pas en mode paisible');
  const P = sim.player;
  const lamp = sim.map.lights.find((l) => l.state === 'on' && l.sector === -1);
  P.x = (lamp.gx + 0.5) * CELL_SIZE;
  P.z = (lamp.gz + 0.5) * CELL_SIZE;
  P.flashlight = false;
  const g = sim.goats[1];
  sim.goats = [g];
  g.x = sim.map.goatSpawn[0].x;
  g.z = sim.map.goatSpawn[0].z;
  run(sim, 1);
  assert.ok(isLitL2(sim.map, P.x, P.z), 'sous la lampe');
  sim.director.calmT = 99; // un vrai moment de calme : la coupure peut tomber
  sim.nextBlackout = 0;
  sim.step();
  assert.ok(sim.blackout > 0 && sim.map.dark, 'le noir total');
  assert.ok(!isLitL2(sim.map, P.x, P.z), 'plus aucune lampe ne protège');
  run(sim, 0.5);
  assert.equal(g.mode, 'stalk');
  assert.equal(g.target, P.id, 'elle vient droit sur le joueur, même sans le voir');
  const guest = new BackroomsSim({ difficulty: 'normal', seed: 31, level: PIPES_LEVEL, players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], localId: 2 });
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(guest.blackout > 0 && guest.map.dark, "chez l'invité aussi");
  sim.blackout = DT / 2;
  sim.step();
  assert.ok(!sim.map.dark && isLitL2(sim.map, P.x, P.z), 'le courant revient');
});

test("réseau : l'invité voit le troupeau et l'entend approcher", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'normal', seed: 31, players, localId: 1, level: PIPES_LEVEL });
  const guest = new BackroomsSim({ difficulty: 'normal', seed: 31, players, localId: 2, level: PIPES_LEVEL });
  run(host, 2);
  const g = host.goats[1];
  const me = host.players.find((p) => p.id === 2);
  g.x = me.x + 3;
  g.z = me.z;
  g.mode = 'windup';
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.equal(guest.goats.length, host.goats.length);
  assert.deepEqual(guest.goats.map((q) => [q.x, q.z]), host.goats.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100]));
  assert.equal(guest.goats[1].mode, 'windup');
  assert.ok(GOAT_MODES.includes(guest.goats[0].mode));
  assert.ok(guest.monster.danger > 0.5, "l'invité l'entend tout près");
  assert.equal(guest.monster.mode, 'chase', 'la musique de poursuite');
});

test("saut : un petit bond qui s'entend à la réception et ne franchit pas un trou", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players: [{ id: 1, name: 'A' }], localId: 1 });
  const P = sim.player;
  sim.step({ jump: true });
  assert.ok(P.jy > 0, 'en l\'air');
  let air = 0;
  let top = 0;
  let landNoise = 0;
  for (let i = 0; i < 120; i++) {
    sim.step({});
    if (P.jy > 0) air++;
    top = Math.max(top, P.jy);
    landNoise = Math.max(landNoise, P.noise);
    sim.monster.x = sim.monster.z = -999;
  }
  assert.equal(P.jy, 0, 'retombé');
  assert.ok(top > 0.25 && top < 0.5, `hauteur ${top.toFixed(2)} m`);
  assert.ok(landNoise >= NOISE.land, 'la réception fait du bruit');
  // au mieux, en courant : moins de 2 m parcourus en l'air (un trou en fait 2)
  assert.ok(((air + 1) / 60) * 4.4 < 2 * PIT_HALF, `${(((air + 1) / 60) * 4.4).toFixed(2)} m en l'air`);
  // accroupi au sol, on ne saute pas sur une arête
  P.onBeam = true;
  sim.step({ jump: true });
  assert.equal(P.jy, 0, 'pas de saut sur une arête');
});

test("saut : en courant, on garde son élan en l'air (touches lâchées), chez l'hôte comme chez l'invité ; un mur l'arrête", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 2 });
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  // une direction dégagée sur 6 m, sans trou
  const clear = (sim, P) => {
    for (let a = 0; a < 6.28; a += 0.1) {
      let ok = true;
      for (let d = 0.25; d < 6 && ok; d += 0.25) ok = !sim.isColliding(P.x - Math.sin(a) * d, P.z - Math.cos(a) * d, PLAYER_RADIUS + 0.05, P.floor) && sim.pitUnder(P.x - Math.sin(a) * d, P.z - Math.cos(a) * d, P.floor) < 0;
      if (ok) return a;
    }
    return null;
  };
  for (const [who, sim, P, step] of [
    ['hôte', host, host.player, (i) => host.step(i)],
    ['invité', guest, guest.player, (i) => guest.predict({ yaw: guest.player.yaw, ...i })],
  ]) {
    P.yaw = clear(sim, P);
    assert.ok(P.yaw !== null, `${who} : de la place`);
    for (let i = 0; i < 20; i++) step({ my: 1, run: true });
    const x0 = P.x;
    const z0 = P.z;
    step({ my: 1, run: true, jump: true });
    let n = 1;
    while (P.jy > 0 && n < 60) {
      step({});
      n++;
    }
    const d = Math.hypot(P.x - x0, P.z - z0);
    assert.ok(d > 0.9 * 4.4 * n * DT && d < 2 * PIT_HALF, `${who} : ${d.toFixed(2)} m en ${(n * DT).toFixed(2)} s, touches lâchées`);
  }
  // sur place, puis la marche en l'air : à peine un pas (on n'a pas d'élan)
  const P = host.player;
  const x0 = P.x;
  const z0 = P.z;
  host.step({ jump: true });
  while (P.jy > 0) host.step({ my: 1 });
  assert.ok(Math.hypot(P.x - x0, P.z - z0) < 0.5, "sans élan, on n'avance presque pas en l'air");
  // élancé contre un mur : il arrête l'élan (on ne repart pas de plus belle une fois le mur dépassé)
  P.jy = 0.2;
  P.jvy = 0;
  P.takeoff = false;
  P.avx = 4;
  P.avz = 0;
  host.bumpAir(P, { x: P.x, z: P.z });
  assert.equal(P.avx, 0, 'le mur arrête l\'élan');
});

test("réseau : le caméscope (V) tire sur la pile, et l'on voit qui filme et qui saute", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 2 });
  const b0 = host.players[1].battery;
  for (let i = 0; i < 60; i++) host.step({ jump: i === 0 }, { 2: { remote: true, cam: true } });
  assert.ok(host.players[1].cam, "l'hôte sait que l'invité filme");
  assert.ok(host.players[1].battery < b0, 'le caméscope tire sur la pile');
  host.step({ jump: true }, { 2: { remote: true, cam: true } });
  host.step({}, { 2: { remote: true, cam: true } });
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.ok(guest.players[0].jy > 0, "l'invité voit l'hôte sauter");
  guest.player.cam = false;
  guest.predict({ cam: true });
  assert.ok(guest.player.cam, "l'invité sort son caméscope sans attendre l'hôte");
  guest.applySnapshot(JSON.parse(JSON.stringify({ ...host.snapshot() })));
  assert.ok(guest.player.cam, "l'instantané ne le lui range pas");
});


test("fin d'équipe aux Poolrooms : le toboggan attend les autres BOARD_T secondes, puis se ferme sur les retardataires", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 11, players, localId: 1, level: 2 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 11, players, localId: 2, level: 2 });
  host.players[0].status = 'elevator';
  host.step({}, { 2: { remote: true } });
  assert.ok(host.boardT > BOARD_T - 0.1, 'le compte à rebours démarre');
  assert.ok(host.drainEvents().some((e) => e.type === 'boardCount' && e.start), 'il est annoncé');
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.ok(Math.abs(guest.boardT - host.boardT) < 0.05, "l'invité voit le même compte à rebours");
  // le retardataire arrive à temps : le compte à rebours s'arrête et l'ascenseur part
  const h2 = new BackroomsSim({ difficulty: 'peaceful', seed: 11, players, localId: 1, level: 2 });
  h2.players[0].status = 'elevator';
  run(h2, 10, {}, { 2: { remote: true } });
  h2.players[1].status = 'elevator';
  h2.step({}, { 2: { remote: true } });
  assert.equal(h2.boardT, 0);
  assert.ok(h2.departT > 0, "tout le monde est dedans : l'ascenseur part");
  // personne ne vient : les portes se ferment, l'autre est perdu, l'ascenseur part quand même
  host.monster.x = host.monster.z = -999;
  for (let i = 0; i < Math.ceil((BOARD_T + 0.5) / DT) && host.departT <= 0; i++) host.step({}, { 2: { remote: true } });
  assert.equal(host.players[1].status, 'dead', 'le retardataire est resté dehors');
  const ev = host.drainEvents();
  assert.ok(ev.some((e) => e.type === 'leftBehind' && e.id === 2), 'on le sait');
  assert.ok(ev.some((e) => e.type === 'depart'), "l'ascenseur part avec ceux qui sont dedans");
});


test("poursuite : plus rapide qu'un joueur qui marche, droit sur lui, sans tourner sur place", () => {
  const map = createBackroomsMap(3);
  const sim = new BackroomsSim({ map, difficulty: 'normal' });
  const P = sim.player;
  const M = sim.monster;
  // un couloir droit et sombre de 12 cases
  const start = map.walkable.find((c) => {
    for (let i = 0; i < 12; i++) if (sim.blocked(c.x + i, c.z, 0) || sim.brightCell(map, (c.x + i + 0.5) * CELL_SIZE, (c.z + 0.5) * CELL_SIZE)) return false;
    return true;
  });
  assert.ok(start, 'un couloir droit');
  M.dormantT = 0;
  M.floor = 0;
  if (sim.director) sim.director.phase = 'build';
  M.x = (start.x + 0.5) * CELL_SIZE;
  M.z = (start.z + 0.5) * CELL_SIZE + 0.3; // pas pile au milieu de la case
  P.x = M.x + 7;
  P.z = (start.z + 0.5) * CELL_SIZE;
  P.yaw = -Math.PI / 2;
  P.flashlight = false;
  M.mode = 'chase';
  M.unseenT = 0;
  M.path = [];
  M.repathT = 0;
  M.yaw = Math.PI / 2;
  let reversals = 0;
  let last = 0;
  const d0 = Math.hypot(P.x - M.x, P.z - M.z);
  for (let i = 0; i < 60 * 5; i++) {
    const y0 = M.yaw;
    sim.step({ my: 1, yaw: P.yaw });
    const d = Math.atan2(Math.sin(M.yaw - y0), Math.cos(M.yaw - y0));
    if (Math.abs(d) > 0.01) {
      if (last && Math.sign(d) !== Math.sign(last)) reversals++;
      last = d;
    }
  }
  const d1 = Math.hypot(P.x - M.x, P.z - M.z);
  assert.equal(M.mode, 'chase');
  assert.ok(M.speed >= WALK_SPEED * CHASE_MIN - 1e-6, `vitesse ${M.speed.toFixed(2)} m/s`);
  assert.ok(d0 - d1 > 3.5, `elle gagne du terrain sur un joueur qui marche (${d0.toFixed(1)} → ${d1.toFixed(1)} m)`);
  assert.ok(reversals <= 1, `elle ne zigzague pas (${reversals} changements de sens)`);
});


test("cage d'escalier : on bute à DOOR_GAP de la porte cadenassée et de ses murs (plus de vue à travers)", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 5 });
  const P = sim.player;
  assert.ok(sim.stairsLocked, 'la porte est cadenassée');
  const st = sim.stairs[0];
  const C = CELL_SIZE;
  const W = (u, v) => ({ x: st.ox + st.dx * u + st.px * v, z: st.oz + st.dz * u + st.pz * v });
  const p = W(-1.5, 1.5 * C);
  P.x = p.x;
  P.z = p.z;
  P.floor = 0;
  sim.drainEvents();
  const door = W(0, 1.5 * C);
  P.yaw = Math.atan2(-(door.x - P.x), -(door.z - P.z));
  run(sim, 2, { my: 1, yaw: P.yaw });
  const u = stairLocal(st, P.x, P.z).u;
  assert.ok(u <= -DOOR_GAP + 1e-6, `arrêté à ${(-u).toFixed(2)} m du battant`);
  assert.ok(sim.drainEvents().some((e) => e.type === 'locked'), 'la chaîne cogne');
  // pareil pour les autres murs de la cage, à chaque étage, en arrivant de biais : on glisse le long, sans s'y coller
  const box = (q) => Math.hypot(q.u - Math.max(0, Math.min(3 * C, q.u)), q.v - Math.max(0, Math.min(2 * C, q.v)));
  let tried = 0;
  for (const [fl, u0, v0, tu, tv] of [[0, 1.5 * C, -1.2, 2 * C, 0], [1, 1.5 * C, -1.2, 2 * C, 0], [0, 1.5 * C, 2 * C + 1.2, C, 2 * C], [1, 3 * C + 1.2, C, 3 * C, 0.5 * C]]) {
    const a = W(u0, v0);
    if (sim.isColliding(a.x, a.z, 0.3, fl)) continue;
    tried++;
    P.x = a.x;
    P.z = a.z;
    P.floor = fl;
    const t = W(tu, tv);
    let closest = Infinity;
    for (let i = 0; i < 120; i++) {
      P.yaw = Math.atan2(-(t.x - P.x), -(t.z - P.z));
      sim.step({ my: 1, yaw: P.yaw });
      if (!stairAt(sim.stairs, P.x, P.z)) closest = Math.min(closest, box(stairLocal(st, P.x, P.z)));
    }
    assert.equal(stairAt(sim.stairs, P.x, P.z), null, `étage ${fl} : on n'est pas entré par le mur`);
    assert.ok(closest >= DOOR_GAP - 1e-6, `étage ${fl} : au plus près ${closest.toFixed(2)} m du mur`);
  }
  assert.ok(tried > 0, 'au moins un mur de cage essayé');
});

test("réseau : chez l'invité, les autres et l'entité avancent à vitesse régulière malgré des paquets irréguliers ; un saut reste net", () => {
  const players = [{ id: 1, name: 'Hôte' }, { id: 2, name: 'Invité' }];
  const host = new BackroomsSim({ difficulty: 'normal', seed: 5, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'normal', seed: 5, players, localId: 2 });
  const H = host.player;
  const M = host.monster;
  M.away = false;
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const x0 = H.x;
  const mx0 = M.x;
  const inbox = [];
  let tick = 0;
  let frames = [];
  const V = 4; // m/s
  for (let f = 0; f < 144 * 4; f++) {
    const now = f / 144;
    // l'hôte : 60 pas par seconde, un instantané tous les 3 pas, qui met de 40 à 90 ms à arriver
    while (tick * DT <= now) {
      host.time = tick * DT;
      H.x = x0 + V * tick * DT;
      H.yaw = 3 * tick * DT; // il tourne la tête de 3 radians par seconde
      M.x = mx0 + V * 1.5 * tick * DT;
      if (tick % 3 === 0) inbox.push({ at: tick * DT + 0.04 + rand() * 0.05, s: JSON.parse(JSON.stringify(host.snapshot())) });
      tick++;
    }
    inbox.sort((a, b) => a.at - b.at);
    while (inbox.length && inbox[0].at <= now) guest.applySnapshot(inbox.shift().s, now);
    guest.interpolate(now);
    const Q = guest.players.find((q) => q.id === 1);
    frames.push({ x: Q.x, yaw: Q.yaw, mx: guest.monster.x });
  }
  frames = frames.slice(144); // une seconde pour s'installer
  for (let i = 1; i < frames.length; i++) {
    const v = (frames[i].x - frames[i - 1].x) * 144;
    const mv = (frames[i].mx - frames[i - 1].mx) * 144;
    const w = (frames[i].yaw - frames[i - 1].yaw) * 144;
    assert.ok(Math.abs(v - V) < V * 0.15, `vitesse affichée régulière (${v.toFixed(2)} m/s au lieu de ${V})`);
    assert.ok(Math.abs(mv - V * 1.5) < V * 1.5 * 0.15, `l'entité aussi (${mv.toFixed(2)} m/s)`);
    assert.ok(Math.abs(w - 3) < 0.45, `le regard tourne sans à-coups (${w.toFixed(2)} rad/s)`);
  }
  // affiché un peu dans le passé, pas trop : moins de 0,2 s de retard sur la position réelle
  const lag = (x0 + V * (tick - 1) * DT - frames[frames.length - 1].x) / V;
  assert.ok(lag > 0 && lag < 0.2, `retard d'affichage ${lag.toFixed(3)} s`);
  // un saut (chute, téléportation) : affiché tel quel dès son instantané, sans glisser
  H.x += 20;
  host.time = tick * DT;
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())), 4.1);
  guest.interpolate(4.1);
  assert.ok(Math.abs(guest.players.find((q) => q.id === 1).x - H.x) < 0.006, 'le saut est net');
});

test("l'échelle ne se perd jamais : mort ou départ, elle tombe là où était son porteur (et l'invité la voit)", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }, { id: 3, name: 'B' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 42, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 42, players, localId: 2 });
  const wire = () => guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  const items = host.fm(0).items;
  const ladder = items.find((o) => o.kind === 'ladder');
  assert.ok(ladder, 'une échelle');
  const B = host.players.find((q) => q.id === 2);
  B.floor = 0;
  B.x = ladder.x;
  B.z = ladder.z;
  host.pickUp(B);
  assert.ok(B.inv.includes('ladder') && ladder.taken, 'B porte l’échelle');
  // B meurt plus loin : l'échelle tombe à ses pieds
  B.x += 1;
  host.killPlayer(B);
  const back = items.find((o) => o.kind === 'ladder' && !o.taken);
  assert.ok(back && Math.hypot(back.x - B.x, back.z - B.z) < 0.6, "l'échelle est par terre, là où il est mort");
  assert.ok(!B.inv.includes('ladder'));
  wire();
  const g = guest.fm(0).items.find((o) => o.kind === 'ladder' && !o.taken);
  assert.ok(g && Math.hypot(g.x - back.x, g.z - back.z) < 0.02, "l'invité la voit au même endroit");
  // C la ramasse… et quitte la partie : elle reste
  const C = host.players.find((q) => q.id === 3);
  C.floor = 0;
  C.x = back.x;
  C.z = back.z;
  host.pickUp(C);
  assert.ok(C.inv.includes('ladder'));
  host.removePlayer(3);
  assert.ok(items.some((o) => o.kind === 'ladder' && !o.taken), "partie du joueur : l'échelle reste au sol");
});

test("Level 1 : les fusibles en poche survivent au changement d'hôte et au départ du porteur", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  host.loadLevel(1);
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 2 });
  guest.loadLevel(1);
  const G = host.players.find((q) => q.id === 2);
  G.carry = [0, 1];
  for (const id of G.carry) host.map.fuses[id].taken = true;
  host.fuses = 2;
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  const g = guest.players.find((q) => q.id === 2);
  assert.deepEqual(g.carry, [0, 1], "l'invité sait quels fusibles il porte (s'il devient l'hôte, ils ne se perdent pas)");
  // le porteur s'en va : ses fusibles tombent par terre, on peut aller les rechercher
  host.removePlayer(2);
  assert.ok(host.map.fuses[0].taken === false && host.map.fuses[1].taken === false, 'les fusibles sont au sol');
});

test("le toboggan : celui qui attendait dedans s'en va, le compte à rebours s'arrête (personne ne meurt pour lui)", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 3, players, localId: 1 });
  sim.loadLevel(2);
  const G = sim.players.find((q) => q.id === 2);
  G.status = 'elevator';
  sim.checkElevator();
  assert.ok(sim.boardT > 0, 'le compte à rebours part');
  sim.removePlayer(2);
  assert.equal(sim.boardT, 0, 'il est annulé');
  run(sim, 2);
  assert.equal(sim.player.status, 'alive');
});

test("l'ascenseur : celui qui a appuyé s'en va pendant que les portes se ferment ; elles se rouvrent, personne ne meurt", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 3, players, localId: 1 });
  sim.cassettes = 6;
  sim.startFinale();
  const E = sim.fm(sim.realFloor).elevator;
  const G = sim.players.find((q) => q.id === 2);
  Object.assign(G, { floor: sim.realFloor, x: E.x, z: E.z });
  sim.step({}, { 2: { pick: true } });
  assert.ok(sim.drainEvents().some((e) => e.type === 'liftWait' && e.names.includes('H')), "on lui dit qui est encore dehors");
  sim.step({}, { 2: { pick: true } });
  assert.ok(sim.liftT > 0, 'deuxième appui : on part sans H');
  sim.removePlayer(2);
  run(sim, LIFT_CLOSE_T + 0.2);
  assert.ok(sim.drainEvents().some((e) => e.type === 'liftOpen'), 'personne dedans : les portes se rouvrent');
  assert.equal(sim.player.status, 'alive');
  assert.equal(sim.departT, 0);
});

test("à plusieurs : les néons de tous les niveaux, et ceux qu'on a éteints un instant, sont les mêmes chez l'invité", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 21, players, localId: 1 });
  host.loadLevel(1);
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 21, players, localId: 2 });
  guest.loadLevel(1);
  const l = host.map.lights.find((q) => q.state === 'on');
  host.director.drops.push({ l, t: 3, back: 'on', map: host.map });
  l.state = 'off';
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  const i = host.map.lights.indexOf(l);
  assert.equal(guest.map.lights[i].state, 'off', 'éteint aussi chez l’invité (Level 1)');
  assert.equal(guest.director.drops.length, 1, "l'invité sait qu'il doit revenir (s'il devient l'hôte)");
  // l'invité devient l'hôte : 3 s plus tard, le néon est revenu
  run(guest, 3.2);
  assert.equal(guest.map.lights[i].state, 'on', 'le néon revient');
});

test("à plusieurs : ceux qui sont partis quittent aussi la liste de l'invité (pas de fantôme à l'étage suivant)", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }, { id: 3, name: 'L' }];
  const host = new BackroomsSim({ difficulty: 'peaceful', seed: 4, players, localId: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 4, players, localId: 2 });
  host.removePlayer(3);
  guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())));
  assert.deepEqual(guest.roster.map((r) => r.id).sort(), [1, 2]);
  guest.loadLevel(1);
  assert.ok(!guest.players.some((q) => q.id === 3), 'pas de fantôme au Level 1');
});

test('Level 0 : on ne part jamais dans une cage d’escalier, et une chute ne finit jamais dans un meuble', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed, players: [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: 'p' + id })), localId: 1 });
    for (const P of sim.players) assert.ok(!stairAt(sim.stairs, P.x, P.z) && !(sim.stairs || []).some((st) => st.cells.some((k) => Math.abs(k.gx - Math.floor(P.x / CELL_SIZE)) <= 1 && Math.abs(k.gz - Math.floor(P.z / CELL_SIZE)) <= 1)), `graine ${seed} : départ hors des cages`);
    if (sim.floors.length < 2) continue;
    const P = sim.player;
    for (let id = 0; id < (sim.fm(0).pits || []).length; id++) {
      P.floor = 0;
      sim.fallThrough(P, id);
      assert.ok(!sim.isColliding(P.x, P.z, 0.37, 1), `graine ${seed}, trou ${id} : on retombe sur ses pieds, pas dans un meuble`);
    }
  }
});

// ------------------------------------------------------------------ Level 1 : quais, alarmes, poste de garde, gaines

// les cases atteignables du départ, rideaux des quais baissés (ou relevés)
const reachL1 = (m, open) => {
  const g = m.grid.slice();
  if (!open) for (const d of m.docks) for (const [gx, gz] of d.cells) g[gz * m.W + gx] = T.WALL;
  return bfs(g, m.W, m.H, m.spawn.gx, m.spawn.gz);
};

test('Level 1 : un mur coupe-feu sépare le départ du monte-charge ; ses quais sont un raccourci, rien ne bouche le grand détour', () => {
  let shorter = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const m = createWarehouseMap(seed * 7 + 13);
    assert.ok(m.docks.length >= 1, `graine ${seed} : au moins un quai`);
    const shut = reachL1(m, false);
    const open = reachL1(m, true);
    const ek = m.exit.gz * m.W + m.exit.gx;
    assert.ok(shut[ek] > 0, `graine ${seed} : le monte-charge s'atteint rideaux baissés (le grand détour)`);
    for (const c of m.walkable) {
      if (m.dockAt(c.x, c.z)) continue;
      assert.ok(shut[c.z * m.W + c.x] >= 0, `graine ${seed} : la case ${c.x},${c.z} reste atteignable rideaux baissés`);
    }
    if (open[ek] < shut[ek]) shorter++;
    // rien de posé sur un quai ni juste devant (caisses, objets, fusibles, alarmes, poste, bouches)
    const near = (x, z) => m.docks.some((d) => Math.hypot(d.x - x, d.z - z) < 2.6);
    for (const o of [...m.props, ...m.items, ...m.fuses, ...m.alarms, ...m.ducts.vents]) assert.ok(!near(o.x, o.z), `graine ${seed} : rien devant un quai`);
    assert.ok(m.post && !near(m.post.x, m.post.z), `graine ${seed} : un poste de garde, à l'écart des quais`);
    assert.ok(m.alarms.length >= 4 && m.cams.length >= 4, `graine ${seed} : des alarmes et des caméras`);
    for (const v of m.ducts.vents) assert.ok(!m.isWall(v.gx, v.gz), `graine ${seed} : une bouche au-dessus d'une allée`);
  }
  assert.ok(shorter >= 50, `les quais raccourcissent le chemin du monte-charge (${shorter} graines sur 60)`);
});

test('Level 1 : le boîtier relève le rideau du quai (lentement), le rebaisse ; il ne retombe pas sur quelqu\'un ; l\'invité le voit', () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 4, players, localId: 1, level: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 4, players, localId: 2, level: 1 });
  const d = sim.map.docks[0];
  const P = sim.player;
  const b = d.btn[0];
  P.x = b.x + b.nx * 0.5;
  P.z = b.z + b.nz * 0.5;
  const G = sim.players.find((q) => q.id === 2);
  const o = d.btn[1];
  G.x = o.x + o.nx * 0.5;
  G.z = o.z + o.nz * 0.5;
  const [gx, gz] = d.cells[0];
  assert.ok(sim.map.isWall(gx, gz) && !hasLineOfSight(sim.map, P.x, P.z, G.x, G.z), 'rideau baissé : il arrête le passage et la vue');
  assert.ok(sim.isColliding(d.x, d.z, PLAYER_RADIUS), 'on ne passe pas au travers');
  assert.ok(!sim.isColliding(P.x, P.z, PLAYER_RADIUS), 'mais on se tient devant, dans la baie');
  sim.step({ pick: true });
  assert.equal(d.dir, 1, 'F au boîtier : il monte');
  run(sim, DOCK_OPEN_T * 0.5);
  assert.ok(d.o > 0.3 && d.o < 0.7 && sim.map.isWall(gx, gz), 'à mi-course, on ne passe pas encore dessous');
  run(sim, DOCK_OPEN_T * 0.55);
  assert.equal(d.o, 1);
  assert.ok(!sim.map.isWall(gx, gz) && !sim.isColliding(d.x, d.z, PLAYER_RADIUS) && hasLineOfSight(sim.map, P.x, P.z, G.x, G.z), 'relevé : on passe, on se voit');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(!guest.map.isWall(gx, gz) && !guest.isColliding(d.x, d.z, PLAYER_RADIUS), "chez l'invité aussi");
  // quelqu'un dessous : il s'arrête au-dessus de lui
  G.x = d.x;
  G.z = d.z;
  sim.step({ pick: true });
  assert.equal(d.dir, -1, 'F encore : il redescend');
  run(sim, DOCK_CLOSE_T * 1.2);
  assert.ok(d.o >= DOCK_PASS, "il ne descend pas sur le coéquipier qui passe dessous");
  G.x = o.x + o.nx * 0.5;
  G.z = o.z + o.nz * 0.5;
  run(sim, DOCK_CLOSE_T);
  assert.equal(d.o, 0, 'le passage libre, il finit de descendre');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(guest.map.isWall(gx, gz) && guest.isColliding(d.x, d.z, PLAYER_RADIUS), "baissé chez l'invité");
  // de l'autre côté, l'invité a son propre boîtier
  sim.step({}, { 2: { pick: true } });
  assert.equal(d.dir, 1, "le boîtier de l'autre côté le relève aussi");
});

test("Level 1 : l'entité bute sur un rideau baissé, cogne, l'arrache et passe ; elle n'attrape personne au travers", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 4, level: 1 });
  const d = sim.map.docks[0];
  const M = sim.monster;
  const P = sim.player;
  M.dormantT = 0;
  // l'entité d'un côté, le joueur de l'autre, collé au rideau ; elle le cherche là
  const ax = d.vert ? 1 : 0;
  const side = (s) => ({ x: d.x + (ax ? s * 1.6 : 0), z: d.z + (ax ? 0 : s * 1.6) });
  Object.assign(M, side(-1.6), { mode: 'search', floor: 0, path: [], repathT: 0, ductCD: 999 });
  const near = side(0.3);
  P.x = near.x;
  P.z = near.z;
  P.crouch = true;
  const bangs = [];
  let crossedShut = false;
  const axis = (q) => (ax ? q.x - d.x : q.z - d.z);
  for (let i = 0; i < Math.round((DOCK_FORCE_T + 6) / DT) && !d.broken; i++) {
    M.mode = 'search';
    M.lastSeenX = P.x;
    M.lastSeenZ = P.z;
    M.lastSeenF = 0;
    const before = axis(M);
    sim.step({ crouch: true });
    for (const e of sim.events.splice(0)) if (e.type === 'dockBang') bangs.push(e);
    if (d.o < DOCK_PASS && Math.sign(before) !== Math.sign(axis(M)) && before !== 0) crossedShut = true;
    assert.ok(d.broken || (!(P.grabT > 0) && P.status === 'alive'), `pas attrapé au travers du rideau (o ${d.o.toFixed(2)}, force ${d.force.toFixed(2)}, elle à ${axis(M).toFixed(2)} m, lui à ${axis(P).toFixed(2)})`);
  }
  assert.ok(!crossedShut, 'elle ne passe pas au travers de la tôle');
  assert.ok(bangs.length >= 3, `elle cogne (${bangs.length} coups)`);
  assert.ok(d.broken && d.o >= DOCK_PASS, 'le rideau a cédé');
  sim.step({ pick: true });
  // (le boîtier ne le redescend plus)
  run(sim, 1);
  assert.ok(d.o >= DOCK_PASS, 'arraché, il reste ouvert');
});

test("Level 1 : l'alarme incendie attire l'entité (même en chasse, de loin), elle frappe la cloche ; chacune ne sert qu'une fois", () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 6, players, localId: 1, level: 1 });
  const guest = new BackroomsSim({ difficulty: 'normal', seed: 6, players, localId: 2, level: 1 });
  const a = sim.map.alarms[0];
  const P = sim.player;
  P.x = a.x + a.nx * 0.6;
  P.z = a.z + a.nz * 0.6;
  const G = sim.players.find((q) => q.id === 2);
  const M = sim.monster;
  M.dormantT = 0;
  // l'entité poursuit le coéquipier, à une trentaine de mètres de l'alarme
  const c = sim.map.walkable.find((q) => {
    const x = (q.x + 0.5) * CELL_SIZE;
    const z = (q.z + 0.5) * CELL_SIZE;
    const dd = Math.hypot(x - a.x, z - a.z);
    return dd > 26 && dd < 36 && !sim.map.dockAt(q.x, q.z);
  });
  G.x = (c.x + 0.5) * CELL_SIZE;
  G.z = (c.z + 0.5) * CELL_SIZE;
  Object.assign(M, { x: G.x + 9, z: G.z, floor: 0, mode: 'chase', target: 2, ductCD: 999 });
  if (sim.isColliding(M.x, M.z, 0.4)) Object.assign(M, { x: G.x, z: G.z + 9 });
  if (sim.isColliding(M.x, M.z, 0.4)) Object.assign(M, { x: G.x, z: G.z - 9 });
  G.x += 0; // (il est à 9 m d'elle : elle ne le tient pas de près)
  sim.step({ pick: true });
  assert.ok(a.used && a.ringT > ALARM_T - 0.1, 'F au déclencheur : la cloche sonne');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  assert.ok(guest.map.alarms[0].used && guest.map.alarms[0].ringT > 0, "l'invité l'entend sonner");
  run(sim, 0.5);
  assert.equal(M.mode, 'search', 'elle lâche sa proie pour la cloche');
  assert.ok(Math.hypot(M.lastSeenX - a.x, M.lastSeenZ - a.z) < 1.5, 'elle va à la cloche');
  P.x = a.x + a.nx * 12; // (le joueur qui l'a déclenchée s'éloigne)
  P.z = a.z + a.nz * 12;
  if (sim.isColliding(P.x, P.z, 0.4)) {
    P.x = G.x;
    P.z = G.z + 3;
  }
  let smash = false;
  for (let i = 0; i < Math.round((ALARM_T - 1) / DT) && !smash; i++) {
    sim.step({});
    if (sim.events.splice(0).some((e) => e.type === 'alarmSmash')) smash = true;
  }
  assert.ok(smash, 'elle arrive devant et frappe la cloche');
  run(sim, 1);
  assert.equal(a.ringT, 0, 'la cloche se tait');
  P.x = a.x + a.nx * 0.6;
  P.z = a.z + a.nz * 0.6;
  assert.ok(!sim.nearControl(P), 'brisé, le déclencheur ne sert plus');
});

test('Level 1 : le poste de garde — assis, on ne bouge plus, on change de caméra ; ce que montre l\'écran compte comme vu', () => {
  const players = [{ id: 1, name: 'H' }, { id: 2, name: 'G' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 5, players, localId: 1, level: 1 });
  const guest = new BackroomsSim({ difficulty: 'peaceful', seed: 5, players, localId: 2, level: 1 });
  const S = sim.map.post;
  const G = sim.players.find((q) => q.id === 2);
  G.x = S.front.x;
  G.z = S.front.z;
  sim.step({}, { 2: { pick: true } });
  assert.ok(G.desk && S.by === 2, 'F devant le fauteuil : on s\'assoit');
  assert.ok(Math.hypot(G.x - S.seat.x, G.z - S.seat.z) < 0.01);
  const x0 = G.x;
  run(sim, 1, {}, { 2: { my: 1, mx: 1, run: true, camSel: 3 } });
  assert.equal(G.x, x0, 'assis : on ne bouge pas');
  assert.equal(G.camSel, 3, 'la caméra choisie');
  guest.applySnapshot(JSON.parse(JSON.stringify(sim.snapshot())));
  const g = guest.players.find((q) => q.id === 2);
  assert.ok(g.desk && Math.hypot(g.x - S.seat.x, g.z - S.seat.z) < 0.01, "l'invité est au fauteuil chez lui");
  assert.equal(guest.map.post.by, 2);
  assert.equal(guest.predict({ my: 1 }), 0);
  assert.ok(Math.hypot(g.x - S.seat.x, g.z - S.seat.z) < 0.01, 'il ne bouge pas chez lui non plus');
  // ce que la caméra 3 filme : devant elle, dans l'allée
  const c = sim.map.cams[3];
  const fx = -Math.sin(c.yaw);
  const fz = -Math.cos(c.yaw);
  const spot = { x: c.x + fx * 8, z: c.z + fz * 8 };
  sim.player.x = spot.x - fx * 30; // (le joueur de l'hôte regarde ailleurs, loin)
  sim.player.yaw = c.yaw + Math.PI;
  const watched = sim.inSomeView(0, spot.x, spot.z);
  assert.ok(watched, "ce qu'il y a devant la caméra choisie est à l'écran du gardien");
  run(sim, 0.1, {}, { 2: { camSel: 0 } });
  assert.ok(!sim.onScreen(G, 0, spot.x, spot.z) || sim.map.cams[0] === c, "une autre caméra : plus à l'écran");
  sim.step({}, { 2: { pick: true } });
  assert.ok(!G.desk && S.by === -1 && Math.hypot(G.x - S.front.x, G.z - S.front.z) < 0.01, 'F : on se lève, devant le bureau');
});

test('Level 1 : le poste de garde est une pièce fermée — on y entre par la porte, qui s\'ouvre devant qui arrive ; les cloisons arrêtent, cachent et ne coupent aucune allée', () => {
  for (const seed of [1, 5, 6, 11, 23]) {
    const sim = new BackroomsSim({ difficulty: 'normal', seed, players: [{ id: 1, name: 'H' }], localId: 1, level: 1 });
    const m = sim.map;
    const S = m.post;
    const gd = m.guardDoor;
    assert.ok(S && S.room && gd && m.segs.length >= 3, `graine ${seed} : une pièce, sa porte, ses cloisons`);
    const R = S.room;
    const inside = (x, z) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1;
    assert.ok(inside(S.seat.x, S.seat.z) && inside(S.front.x, S.front.z), 'le fauteuil et le bureau sont dedans');
    // les cloisons arrêtent le joueur ; la baie de la porte le laisse passer
    for (const sg of m.segs) assert.ok(sim.isColliding((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2, PLAYER_RADIUS), 'une cloison arrête');
    assert.ok(!sim.isColliding(gd.x, gd.z, PLAYER_RADIUS), 'on passe par la porte');
    // en marchant du dehors vers le fauteuil, on entre par la porte
    const P = sim.player;
    P.x = gd.x + gd.nx * 1.4;
    P.z = gd.z + gd.nz * 1.4;
    sim.step({});
    assert.ok(gd.open, 'devant la porte, elle s\'ouvre');
    for (let i = 0; i < 90; i++) {
      const tx = i < 40 ? gd.x - gd.nx * 0.8 : S.front.x;
      const tz = i < 40 ? gd.z - gd.nz * 0.8 : S.front.z;
      const p = sim.moveWithCollisions(P.x, P.z, Math.sign(tx - P.x) * Math.min(Math.abs(tx - P.x), 0.08), Math.sign(tz - P.z) * Math.min(Math.abs(tz - P.z), 0.08), PLAYER_RADIUS, 0);
      P.x = p.x;
      P.z = p.z;
    }
    assert.ok(inside(P.x, P.z), 'on est entré');
    // personne devant : elle se referme, et cache comme une cloison
    P.x = m.spawn.x;
    P.z = m.spawn.z;
    sim.monster.x = m.monsterSpawn.x;
    sim.monster.z = m.monsterSpawn.z;
    sim.step({});
    assert.ok(!gd.open, 'personne devant : fermée');
    const cx = (R.x0 + R.x1) / 2;
    const cz = (R.z0 + R.z1) / 2;
    assert.ok(!hasLineOfSight(m, cx, cz, gd.x + gd.nx * 2, gd.z + gd.nz * 2), 'porte fermée : on ne voit pas au travers');
    gd.open = true;
    assert.ok(hasLineOfSight(m, gd.x - gd.nx * 0.8, gd.z - gd.nz * 0.8, gd.x + gd.nx * 2, gd.z + gd.nz * 2), 'ouverte : on voit par la baie');
    gd.open = false;
    for (const sg of m.segs) {
      const mx = (sg.x0 + sg.x1) / 2;
      const mz = (sg.z0 + sg.z1) / 2;
      const ox = sg.x0 === sg.x1 ? 1.2 : 0;
      const oz = sg.x0 === sg.x1 ? 0 : 1.2;
      assert.ok(!hasLineOfSight(m, mx - ox, mz - oz, mx + ox, mz + oz), 'une cloison cache');
    }
    // l'entité n'entre que par la porte
    const path = findPath(m, m.monsterSpawn.x, m.monsterSpawn.z, S.seat.x, S.seat.z);
    assert.ok(path && path.length, 'elle trouve le chemin du fauteuil');
    const gin = Math.floor((gd.x - gd.nx * 0.5) / CELL_SIZE) + Math.floor((gd.z - gd.nz * 0.5) / CELL_SIZE) * m.W;
    const gout = Math.floor((gd.x + gd.nx * 0.5) / CELL_SIZE) + Math.floor((gd.z + gd.nz * 0.5) / CELL_SIZE) * m.W;
    let entered = -1;
    path.forEach((q, i) => {
      if (entered < 0 && inside(q.x, q.z)) entered = i;
    });
    assert.ok(entered > 0 && path[entered].gz * m.W + path[entered].gx === gin && path[entered - 1].gz * m.W + path[entered - 1].gx === gout, 'par la porte');
  }
});

test("Level 1 : l'entité passe par les gaines — on l'entend cogner au-dessus, la grille tombe, elle ressort près de sa proie", () => {
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 9, level: 1 });
  const m = sim.map;
  const M = sim.monster;
  const P = sim.player;
  M.dormantT = 0;
  // le joueur près d'une bouche, l'entité loin, près d'une autre
  const v0 = m.ducts.vents.find((v) => m.ducts.vents.some((w) => Math.hypot(w.x - v.x, w.z - v.z) > 36 && Math.hypot(w.x - v.x, w.z - v.z) < 44));
  P.x = v0.x + 10;
  P.z = v0.z;
  if (sim.isColliding(P.x, P.z, 0.4)) P.x = v0.x - 10;
  if (sim.isColliding(P.x, P.z, 0.4)) {
    P.x = v0.x;
    P.z = v0.z + 10;
  }
  const far = m.ducts.vents.find((w) => Math.hypot(w.x - P.x, w.z - P.z) > 32 && Math.hypot(w.x - P.x, w.z - P.z) < 45);
  Object.assign(M, { x: far.x, z: far.z + 0.3, floor: 0, mode: 'patrol', ductCD: 0, path: [], repathT: 0 });
  P.yaw = Math.atan2(P.x - M.x, P.z - M.z); // (il lui tourne le dos)
  const seen = { in: 0, bang: 0, out: null };
  let hidden = false;
  for (let i = 0; i < Math.round(60 / DT) && !(seen.out && !M.duct); i++) {
    sim.step({});
    for (const e of sim.events.splice(0)) {
      if (e.type === 'ductIn') seen.in++;
      if (e.type === 'ductBang') seen.bang++;
      if (e.type === 'ductOut') seen.out = e;
    }
    if (M.inDuct) {
      hidden = true;
      const snap = sim.snapshot();
      assert.equal(snap.m[12], 1, "l'invité sait qu'elle est dans la gaine (on ne la dessine pas)");
    }
    if (seen.out && M.duct) assert.equal(M.v, 0, 'elle tombe : rien d\'autre');
  }
  assert.ok(seen.in === 1 && hidden, 'elle entre dans une gaine');
  assert.ok(seen.bang >= 5, `on l'entend cogner (${seen.bang} coups)`);
  assert.ok(seen.out, 'elle ressort par une bouche');
  const v = m.ducts.vents[seen.out.vent];
  const d = Math.hypot(v.x - P.x, v.z - P.z);
  assert.ok(v.open && d > 6.5 && d < 16.5, `près de sa proie (${d.toFixed(1)} m), la grille tombée`);
  assert.equal(M.mode === 'search' || M.mode === 'chase', true, 'puis elle la cherche');
});

console.log(`\n${count} tests réussis pour The Backrooms !`);
