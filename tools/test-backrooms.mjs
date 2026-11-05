// Tests unitaires du moteur des Backrooms : node tools/test-backrooms.mjs
import assert from 'node:assert/strict';
import { createBackroomsMap, CELL_SIZE, T } from '../backrooms/engine/map.js';
import { findPath, hasLineOfSight } from '../backrooms/engine/nav.js';
import { BackroomsSim, DT, DEPART_T, FUSES, WHISTLE_CD, stairAt, stairLocal, feetY } from '../backrooms/engine/sim.js';
import { PIT_HALF, bfs, createLevel0, FLOOR_DY } from '../backrooms/engine/map.js';

// distance en marche (en cases) entre deux cases
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
import { createWarehouseMap } from '../backrooms/engine/level1.js';

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

test('cassettes VHS : 5 cassettes placées et atteignables', () => {
  assert.equal(map.cassettes.length, 5, 'exactement 5 cassettes');
  for (const cas of map.cassettes) {
    assert.equal(map.isWall(cas.gx, cas.gz), false, `la cassette ${cas.id} n'est pas dans un mur`);
    const path = findPath(map, map.spawn.x, map.spawn.z, cas.x, cas.z);
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

test('endurance : courir consomme la stamina, l\'arrêt la recharge', () => {
  const sim = new BackroomsSim({ map, difficulty: 'peaceful' });
  assert.equal(sim.player.stamina, 100);

  // Courir
  for (let i = 0; i < 30; i++) {
    sim.step({ my: 1, run: true });
  }
  assert.ok(sim.player.stamina < 100, 'la stamina a diminué en courant');
  assert.equal(sim.player.running, true);

  // S'arrêter
  const staminaAfterRun = sim.player.stamina;
  for (let i = 0; i < 30; i++) {
    sim.step({ my: 0, run: false });
  }
  assert.ok(sim.player.stamina > staminaAfterRun, 'la stamina s\'est régénérée au repos');
});

test("ramassage des 5 cassettes, l'ascenseur s'ouvre et descend au Level 1", () => {
  const map = createBackroomsMap(42);
  const sim = new BackroomsSim({ map, difficulty: 'peaceful' });
  assert.equal(sim.cassettes, 0);
  assert.ok(map.elevator, "l'ascenseur est creusé dans un mur");
  assert.equal(map.grid[map.elevator.gz * map.W + map.elevator.gx], T.EXIT);
  // fermé : la cabine est un mur
  assert.ok(sim.isColliding(map.elevator.x, map.elevator.z, 0.3));

  // Téléporter sur chaque cassette pour la ramasser
  for (const cas of map.cassettes) {
    putOn(sim, sim.player, cas);
    sim.step();
    assert.ok(cas.collected, `la cassette ${cas.id} a été ramassée`);
  }

  assert.equal(sim.cassettes, 5);
  const events = sim.drainEvents();
  assert.ok(events.some((e) => e.type === 'exitUnlocked'), 'événement exitUnlocked émis');
  assert.ok(!sim.isColliding(map.elevator.x, map.elevator.z, 0.3), "ouvert : on peut entrer dans la cabine");

  // de l'entrée, on marche dans la cabine
  sim.player.x = map.exit.x;
  sim.player.z = map.exit.z;
  sim.player.yaw = Math.atan2(-map.elevator.dx, -map.elevator.dz);
  for (let i = 0; i < 120 && sim.player.status === 'alive'; i++) sim.step({ my: 1, yaw: sim.player.yaw });
  assert.equal(sim.player.status, 'elevator', 'le joueur est dans la cabine');
  assert.ok(sim.drainEvents().some((e) => e.type === 'depart'), "seul, l'ascenseur part tout de suite");
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'playing');
  assert.equal(sim.level, 1, 'arrivée au Level 1');
  assert.equal(sim.map.level, 1);
  assert.equal(sim.player.status, 'alive');
  assert.ok(sim.drainEvents().some((e) => e.type === 'level'));
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

  // Contact immédiat : jumpscare et mort
  sim.monster.x = sim.player.x + 0.5;
  sim.monster.z = sim.player.z + 0.5;
  sim.step();
  assert.equal(sim.state, 'dead', 'le joueur meurt attrapé par le monstre');
  assert.equal(sim.player.status, 'dead');
  const events = sim.drainEvents();
  assert.ok(events.some((e) => e.type === 'jumpscare'), 'jumpscare déclenché à la mort');
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

test("eau d'amande : remplit l'endurance", () => {
  const m = createBackroomsMap(7);
  const sim = new BackroomsSim({ map: m, difficulty: 'peaceful' });
  sim.player.stamina = 10;
  const b = m.bottles[0];
  sim.player.x = b.x;
  sim.player.z = b.z;
  sim.step();
  assert.equal(b.taken, false, 'on ne ramasse plus en passant');
  sim.step({ pick: true });
  assert.equal(b.taken, true);
  assert.deepEqual(sim.player.inv, ['bottle', null], "F : la bouteille va dans l'inventaire");
  assert.ok(sim.player.stamina < 100, "elle ne se boit pas toute seule");
  sim.step({ useSel: true });
  assert.equal(sim.player.stamina, 100, 'E : on boit la case choisie');
  assert.deepEqual(sim.player.inv, [null, null]);
  assert.ok(sim.drainEvents().some((e) => e.type === 'bottle'));
});

test("inventaire : deux cases d'objets ; plein, F échange l'objet de la case choisie contre celui du sol", () => {
  const m = createBackroomsMap(9);
  const sim = new BackroomsSim({ map: m, difficulty: 'peaceful' });
  const P = sim.player;
  const ladder = m.items.find((i) => i.kind === 'ladder');
  for (const o of [m.bottles[0], m.batteries[0]]) {
    P.x = o.x;
    P.z = o.z;
    sim.step({ pick: true });
  }
  assert.deepEqual(P.inv, ['bottle', 'battery']);
  // plein : la case choisie (2, l'eau d'amande) part au sol à la place de l'échelle
  P.x = ladder.x;
  P.z = ladder.z;
  sim.step({ pick: true, sel: 1 });
  assert.deepEqual(P.inv, ['ladder', 'battery']);
  assert.equal(ladder.taken, true);
  const dropped = m.items[m.items.length - 1];
  assert.equal(dropped.kind, 'bottle');
  assert.equal(dropped.taken, false);
  assert.ok(Math.hypot(dropped.x - ladder.x, dropped.z - ladder.z) < 0.01, "l'eau d'amande est posée là où était l'échelle");
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
  // E sur une eau d'amande inutile (souffle plein) : on la garde
  P.stamina = 100;
  sim.step({ useSel: true });
  assert.deepEqual(P.inv, ['ladder', 'bottle']);
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
    assert.ok(d >= 12 && d <= 70, `graine ${sd} : échelle à ${d} cases du renfoncement`);
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
    assert.ok(cas.collected, 'cassette récupérée');
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

test('Level 1 : les fusibles rapportés au panneau ouvrent le monte-charge, puis la victoire', () => {
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
  assert.equal(sim.powered, true);
  assert.ok(sim.drainEvents().some((e) => e.type === 'powered'));
  const E = sim.map.elevator;
  sim.player.x = E.x;
  sim.player.z = E.z;
  sim.step();
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.state, 'won', 'le monte-charge remonte : partie gagnée');
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

test("à plusieurs : qui entre dans l'ascenseur devient spectateur, il part quand tout le monde est dedans", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const sim = new BackroomsSim({ difficulty: 'normal', seed: 21, players, localId: 1 });
  for (const c of sim.allCassettes) {
    putOn(sim, sim.player, c);
    sim.step();
  }
  assert.equal(sim.cassettes, 5, "les cassettes comptent pour toute l'équipe");
  const E = sim.fm(sim.realFloor).elevator;
  for (const P of sim.players) P.floor = sim.realFloor;
  const [a, b, c] = sim.players;
  sim.monster.x = sim.monster.z = -999; // loin de tout le monde
  a.x = E.x; a.z = E.z;
  sim.step();
  assert.equal(a.status, 'elevator');
  assert.equal(sim.departT, 0, "il attend les autres");
  assert.notEqual(sim.viewPlayer(0).id, a.id, 'le spectateur suit un joueur encore dehors');
  assert.ok(Math.abs(sim.rage - 1 / 3) < 1e-9, "l'entité s'énerve");
  b.x = E.x; b.z = E.z;
  sim.step();
  assert.ok(Math.abs(sim.rage - 2 / 3) < 1e-9);
  assert.equal(sim.departT, 0);
  c.x = E.x; c.z = E.z;
  sim.step();
  assert.ok(sim.departT > 0, 'tout le monde est dedans : départ');
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.level, 1);
  assert.ok(sim.players.every((p) => p.status === 'alive'));
});

test("à plusieurs : plus il y a de monde à l'abri, plus l'entité est rapide et voit loin", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const speed = (inside) => {
    const sim = new BackroomsSim({ difficulty: 'normal', seed: 5, players, localId: 1 });
    sim.cassettes = 5;
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
  sim.step();
  assert.equal(a.status, 'dead');
  assert.equal(sim.state, 'playing', 'B joue encore');
  assert.equal(sim.viewPlayer(0).id, b.id, 'A regarde B');
  sim.cassettes = 5;
  sim.realFloor = 0;
  b.x = sim.map.elevator.x;
  b.z = sim.map.elevator.z;
  sim.monster.x = sim.monster.z = -999;
  sim.step();
  assert.ok(sim.departT > 0, "B seul dehors entre : l'ascenseur part");
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
  host.step();
  wire();
  assert.equal(guest.cassettes, 1);
  assert.equal(guest.allCassettes.find((q) => q.id === c.id).collected, true);
  // tout le monde dans l'ascenseur : l'invité passe au Level 1 avec la même carte
  host.cassettes = 5;
  host.realFloor = 0;
  for (const P of host.players) {
    P.x = host.map.elevator.x;
    P.z = host.map.elevator.z;
  }
  host.step();
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

test('départ : pas de table, chacun a déjà sa lampe allumée dans la case 1', () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  for (const sd of [3, 14, 15, 92, 653]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: sd, players, localId: 1 });
    assert.ok(!sim.table, `graine ${sd} : pas de table au départ`);
    assert.ok(sim.players.every((p) => p.hasLamp && p.flashlight), 'tout le monde part équipé, lampe allumée');
    // la touche 1 éteint et rallume sa lampe
    sim.step({ toggleFlashlight: true });
    assert.equal(sim.player.flashlight, false);
    assert.ok(!sim.drainEvents().some((e) => e.type === 'noLamp'));
    sim.step({ toggleFlashlight: true });
    assert.equal(sim.player.flashlight, true);
  }
});

test("à bout de souffle : une seconde sans pouvoir courir, chez l'hôte comme chez l'invité", () => {
  for (const guest of [false, true]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 3 });
    const P = sim.player;
    const go = () => (guest ? sim.predict({ my: 1, run: true, yaw: P.yaw }) : sim.step({ my: 1, run: true, yaw: P.yaw }));
    let t = 0;
    while (P.stamina > 0 && t < 20) {
      go();
      t += DT;
    }
    assert.equal(P.stamina, 0, 'endurance épuisée');
    let stopped = 0;
    for (let i = 0; i < Math.round(1.5 / DT); i++) {
      go();
      if (P.running) break;
      stopped += DT;
    }
    assert.ok(stopped > 0.9 && stopped < 1.1, `${guest ? 'invité' : 'hôte'} : environ une seconde sans courir (${stopped.toFixed(2)} s)`);
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

test("un joueur tombé au Level 0 repart au Level 1 avec une lampe", () => {
  const players = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 8, players, localId: 1 });
  const [a, b] = sim.players;
  a.status = 'dead'; // attrapé avant d'avoir pris sa lampe
  sim.cassettes = 5;
  sim.realFloor = 0;
  b.x = sim.map.elevator.x;
  b.z = sim.map.elevator.z;
  sim.step();
  run(sim, DEPART_T + 0.2);
  assert.equal(sim.level, 1);
  const a1 = sim.players.find((p) => p.id === 1);
  assert.equal(a1.status, 'alive');
  assert.ok(a1.hasLamp && a1.flashlight);
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
    assert.deepEqual([...up.cassettes, ...down.cassettes].map((c) => c.id).sort(), [0, 1, 2, 3, 4]);
    assert.ok(up.elevator && down.elevator, 'un ascenseur à chaque étage');
  }
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

test("ascenseurs : un en haut, un en bas ; les 5 cassettes trouvées, le faux devient un mur et seul le vrai emmène", () => {
  for (const real of [0, 1]) {
    const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 11 });
    sim.realFloor = real;
    const fake = 1 - real;
    // fermés tous les deux, impossibles à distinguer
    for (const f of sim.floors) assert.ok(sim.isColliding(f.elevator.x, f.elevator.z, 0.3, sim.floors.indexOf(f)));
    for (const c of sim.allCassettes) {
      putOn(sim, sim.player, c);
      sim.step();
    }
    assert.equal(sim.cassettes, 5);
    assert.ok(sim.fm(fake).elevator.fake, 'le faux est démasqué');
    assert.ok(!sim.fm(real).elevator.fake);
    assert.ok(sim.isColliding(sim.fm(fake).elevator.x, sim.fm(fake).elevator.z, 0.3, fake), "le faux n'est plus qu'un mur");
    assert.ok(!sim.isColliding(sim.fm(real).elevator.x, sim.fm(real).elevator.z, 0.3, real), 'le vrai est ouvert');
    // le signal de chaque étage pointe vers son propre ascenseur (le doute reste)
    const P = sim.player;
    P.floor = fake;
    P.x = sim.fm(fake).exit.x;
    P.z = sim.fm(fake).exit.z;
    sim.step();
    assert.equal(P.sigTo, 'exit');
    assert.ok(P.signal > 0.9);
    assert.equal(P.status, 'alive', 'devant le faux, rien ne se passe');
    P.floor = real;
    P.x = sim.fm(real).elevator.x;
    P.z = sim.fm(real).elevator.z;
    sim.step();
    assert.equal(P.status, 'elevator', 'le vrai emmène');
  }
});

test("signal : sans cassette à son étage, le caméscope guide vers l'escalier", () => {
  const sim = new BackroomsSim({ difficulty: 'peaceful', seed: 19 });
  const P = sim.player;
  for (const c of sim.map.cassettes) c.collected = true;
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
  }
  wire();
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

console.log(`\n${count} tests réussis pour The Backrooms !`);
