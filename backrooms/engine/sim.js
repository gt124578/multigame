// The Backrooms - Moteur de simulation (60 Hz), sans DOM
// Plusieurs joueurs possibles (l'hôte fait autorité). Deux niveaux :
//   Level 0 : deux étages superposés (on tombe par les trous du haut, on remonte par les escaliers). 5 cassettes
//             VHS réparties entre les étages ; un ascenseur à chaque étage, mais un seul est le vrai : quand les 5
//             cassettes sont trouvées, le faux se referme en mur et le vrai s'ouvre.
//   Level 1 : l'entrepôt ; 3 fusibles à rapporter au panneau du monte-charge, des coupures de courant, et l'entité
//             qui se cache au bout des rangées d'étagères pour tendre des embuscades.
// Qui entre dans l'ascenseur ouvert devient spectateur ; il part quand plus personne n'est dehors. Plus il y a de
// monde dans la cabine, plus l'entité s'énerve contre ceux qui restent.
// Au tout début, personne n'a de lampe : une table au départ en porte une par joueur. Un joueur attrapé regarde les
// autres jusqu'à la fin de l'étage ; si l'équipe le termine, tout le monde repart à l'étage suivant, lampe en main.
import { CELL_SIZE, T, createLevel0, PIT_HALF } from './map.js';
import { createWarehouseMap } from './level1.js';
import { findPath, hasLineOfSight } from './nav.js';

export const DT = 1 / 60;
export const PLAYER_RADIUS = 0.38;
// On avance lentement dans les Backrooms : la carte est immense et chaque pas compte
export const WALK_SPEED = 2.1;
export const SPRINT_SPEED = 3.7;
export const MONSTER_PATROL_SPEED = 1.5;
export const MONSTER_CHASE_SPEED = 2.75;
export const STAMINA_DRAIN = 15; // par seconde de course
export const STAMINA_REGEN = 9;
export const LOSE_TRACK_T = 4; // secondes sans voir le joueur avant que l'entité ne le perde
export const BATTERY_DRAIN = 0.42; // % par seconde de lampe allumée (environ 4 minutes pour une pile pleine)
export const BATTERY_PACK = 60; // % rendus par une pile utilisée
export const INV_SIZE = 2; // cases d'objets (piles, eau d'amande, échelle) : la case 1 de l'inventaire est réservée à la lampe
export const PICK_R = 1.4; // portée de F pour ramasser
// Barre d'équilibre : sur une arête entre deux trous, on n'avance que tout droit et le corps tangue ; Q et D
// corrigent. tilt va de -1 (penché à gauche) à 1 (à droite) : au bout, on tombe dans le trou de ce côté.
export const BEAM_SPEED = 0.65; // vitesse de marche sur une arête (part de la marche normale)
export const BEAM_UNSTABLE = 4; // plus on penche, plus on penche
export const BEAM_NOISE = [10, 16]; // à-coups au hasard (immobile, en marchant)
export const BEAM_FIX = 4.5; // force de Q / D
export const BEAM_DAMP = 2.5;
export const FALL_LOCK = 0.9; // secondes à terre après une chute d'un étage
export const STAIR_LOCK = 0.5; // secondes dans l'escalier
export const STAIR_R = 0.75; // on prend l'escalier en entrant dans sa case
export const WHISTLE_CD = 1.2;
export const WHISTLE_HEAT = 2.5; // chaque coup compte 1 et s'oublie en 20 s : au 3e coup rapproché, l'entité vient à coup sûr
export const CASSETTES = 5;
export const FUSES = 3;
export const LAST_LEVEL = 1;
export const DEPART_T = 3; // secondes entre la fermeture des portes et l'arrivée
// coupures de courant du Level 1 : toutes les 35 à 60 s, pendant 15 à 20 s
export const BLACKOUT_EVERY = [35, 60];
export const BLACKOUT_LEN = [15, 20];

const rand = (a, b) => a + Math.random() * (b - a);
const cellOf = (v) => Math.floor(v / CELL_SIZE);

// les étages d'un niveau : même graine de partie, des cartes différentes par niveau
export function makeLevelMap(level, seed) {
  return level === 1 ? [createWarehouseMap(seed * 7 + 13)] : createLevel0(seed).floors;
}

function newPlayer(id, name, map, i) {
  // les joueurs arrivent côte à côte autour du départ
  const off = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [0.7, 0.7]][i % 6];
  return {
    id,
    name,
    floor: 0, // étage (0 : en haut, 1 : en bas)
    x: map.spawn.x + off[0],
    z: map.spawn.z + off[1],
    yaw: 0,
    pitch: 0,
    stamina: 100, // 0 à 100
    running: false,
    flashlight: false,
    hasLamp: true, // lampe torche, toujours dans la case 1
    bottles: 0,
    battery: 100, // pile de la lampe torche (0 à 100)
    inv: [null, null], // cases 2 et 3 de l'inventaire : 'battery', 'bottle', 'ladder' ou null
    sel: 1, // case choisie (1 ou 2 ; la case 0, c'est la lampe) : E l'utilise, F l'échange contre un objet au sol
    lockT: 0, // immobile un instant (après une chute, dans l'escalier)
    onBeam: false, // sur une arête entre deux trous
    tilt: 0, // équilibre (-1 à 1)
    tiltV: 0,
    onLadder: false, // en haut de l'échelle (la caméra monte)
    whistleCd: 0,
    heat: 0, // coups de sifflet récents : trop, et l'entité vient
    signal: 0, // 0 à 1 : force du signal de l'objectif le plus proche (affiché par la caméra)
    sigTo: 'goal', // ce que suit le signal : 'goal', 'stairs' ou 'exit'
    moving: false,
    status: 'alive', // 'alive' | 'elevator' (à l'abri, spectateur) | 'dead' (spectateur)
    danger: 0, // 0 à 1 : proximité de l'entité, pour ce joueur (son, image)
    pan: 0,
    found: 0, // objets d'objectif trouvés (cassettes, fusibles)
  };
}

export class BackroomsSim {
  // players : [{ id, name }] (le premier est l'hôte) ; localId : le joueur de cet écran
  // map : une carte d'un seul étage (tests) ; sinon le niveau est généré à partir de la graine
  constructor({ map = null, difficulty = 'normal', seed = 42, players = null, localId = 0, level = 0 } = {}) {
    this.difficulty = difficulty;
    this.seed = seed;
    this.time = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'dead'
    this.localId = localId;
    this.roster = players && players.length ? players : [{ id: localId, name: 'Joueur' }];
    this.hasMonster = difficulty !== 'peaceful';
    this.monsterChaseSpeed = MONSTER_CHASE_SPEED * (difficulty === 'hard' ? 1.2 : 1);
    this.events = [];
    this.loadLevel(level, map ? [map] : null);
  }

  // Installe un niveau : nouveaux étages, joueurs au départ (les morts reviennent), entité au loin
  loadLevel(level, floors = null) {
    const prev = this.players || [];
    this.level = level;
    this.floors = floors || makeLevelMap(level, this.seed);
    this.map = this.floors[0];
    this.stairs = this.map.stairs || [];
    this.players = this.roster.map((r, i) => {
      const P = newPlayer(r.id, r.name, this.map, i);
      const old = prev.find((p) => p.id === r.id);
      if (old) {
        // on garde son inventaire, sa pile et ses trouvailles d'un étage à l'autre
        P.inv = old.inv;
        P.sel = old.sel;
        P.battery = old.battery;
        P.bottles = old.bottles;
        P.found = old.found;
        P.yaw = old.yaw;
      }
      // tout le monde part avec sa lampe torche, allumée, dans la case 1 (ceux qui étaient tombés en reçoivent une)
      P.hasLamp = true;
      P.flashlight = !old || old.flashlight || old.status !== 'alive';
      return P;
    });
    // plus de table au départ : chacun a sa lampe dans la case 1 dès le début
    this.table = null;
    this.lamps = [];
    this.cassettes = 0; // cassettes trouvées par l'équipe (Level 0)
    this.fuses = 0; // fusibles en poche (Level 1)
    this.items0 = this.floors.map((f) => (f.items || []).length); // objets d'origine (les suivants ont été posés par des joueurs)
    // un seul vrai ascenseur : on ne sait pas lequel tant que les cassettes ne sont pas toutes trouvées
    this.realFloor = this.floors.length > 1 ? (Math.random() < 0.5 ? 0 : 1) : 0;
    this.unlocked = false;
    this.powered = false; // panneau du monte-charge réalimenté
    this.departT = 0; // compte à rebours du départ de l'ascenseur
    this.blackout = 0; // secondes de noir restantes
    this.nextBlackout = level === 1 ? rand(...BLACKOUT_EVERY) * 0.6 : Infinity;

    const ms = this.map.monsterSpawn;
    this.monster = {
      floor: 0,
      x: ms.x,
      z: ms.z,
      yaw: 0,
      mode: 'patrol', // 'patrol' | 'search' | 'chase' | 'ambush'
      speed: MONSTER_PATROL_SPEED,
      path: [],
      pathIndex: 0,
      repathT: 0,
      lastSeenX: ms.x,
      lastSeenZ: ms.z,
      targetWander: null,
      target: null, // id du joueur traqué
      distToPlayer: 999,
      danger: 0, // proximité vue par le joueur de cet écran (son, image)
      pan: 0,
      hasLineOfSight: false,
      unseenT: 0,
      ambush: null, // case d'embuscade
      ambushT: 8, // délai avant la prochaine embuscade
      waitT: 0,
      burstT: 0, // élan de la charge après une embuscade
      silent: false, // l'entité se tait quand elle attend en embuscade
      stairT: 0, // dans l'escalier
    };
  }

  // la carte d'un étage
  fm(floor) {
    return this.floors[floor] || this.floors[0];
  }

  // toutes les cassettes, des deux étages, dans l'ordre de leur numéro
  get allCassettes() {
    return this.floors.flatMap((f) => f.cassettes || []).sort((a, b) => a.id - b.id);
  }

  // le joueur de cet écran
  get player() {
    return this.players.find((p) => p.id === this.localId) || this.players[0];
  }

  // le joueur que la caméra suit : soi-même, ou un joueur encore dehors quand on est spectateur
  viewPlayer(pick = 0) {
    const me = this.player;
    if (me.status === 'alive') return me;
    const out = this.players.filter((p) => p.status === 'alive');
    if (!out.length) return me;
    return out[((pick % out.length) + out.length) % out.length];
  }

  get open() {
    return this.level === 0 ? this.cassettes >= CASSETTES : this.powered;
  }

  // part de l'équipe déjà à l'abri dans l'ascenseur (0 à 1) : l'entité devient plus agressive
  get rage() {
    const n = this.players.length;
    return n > 1 ? this.players.filter((p) => p.status === 'elevator').length / n : 0;
  }

  emit(ev) {
    this.events.push(ev);
  }

  drainEvents() {
    const list = this.events;
    this.events = [];
    return list;
  }

  // Toutes les cassettes trouvées : le faux ascenseur se referme en mur (on ne le sait qu'en arrivant devant)
  unlockLevel0() {
    this.unlocked = true;
    for (let f = 0; f < this.floors.length; f++) {
      const E = this.floors[f].elevator;
      if (E) E.fake = f !== this.realFloor;
    }
  }

  // Déplacement avec glissement contre les murs
  moveWithCollisions(px, pz, dx, dz, radius = PLAYER_RADIUS, floor = 0) {
    let nextX = px + dx;
    let nextZ = pz + dz;
    if (this.isColliding(nextX, pz, radius, floor)) nextX = px;
    if (this.isColliding(nextX, nextZ, radius, floor)) nextZ = pz;
    return { x: nextX, z: nextZ };
  }

  // la cabine de l'ascenseur se traverse seulement quand il est ouvert (et que c'est le vrai)
  blocked(gx, gz, floor = 0) {
    const m = this.fm(floor);
    if (!m.isWall(gx, gz)) return false;
    return !(this.open && m.grid[gz * m.W + gx] === T.EXIT && !(m.elevator && m.elevator.fake));
  }

  isColliding(x, z, radius, floor = 0) {
    const minGx = cellOf(x - radius);
    const maxGx = cellOf(x + radius);
    const minGz = cellOf(z - radius);
    const maxGz = cellOf(z + radius);
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (!this.blocked(gx, gz, floor)) continue;
        const closestX = Math.max(gx * CELL_SIZE, Math.min(x, (gx + 1) * CELL_SIZE));
        const closestZ = Math.max(gz * CELL_SIZE, Math.min(z, (gz + 1) * CELL_SIZE));
        if ((x - closestX) ** 2 + (z - closestZ) ** 2 < radius * radius) return true;
      }
    }
    // table des lampes, caisses et meubles abandonnés (cercles)
    const T0 = floor === 0 && this.table;
    if (T0 && (T0.x - x) ** 2 + (T0.z - z) ** 2 < (radius + T0.r) ** 2) return true;
    for (const pr of this.fm(floor).props || []) {
      const rr = radius + pr.r;
      if (Math.abs(pr.x - x) < rr && Math.abs(pr.z - z) < rr && (pr.x - x) ** 2 + (pr.z - z) ** 2 < rr * rr) return true;
    }
    return false;
  }

  // Boire l'eau d'amande (souffle au maximum), changer la pile de la lampe, poser l'échelle
  useItem(P, i) {
    const kind = P.inv[i];
    if (!kind) return this.emit({ type: 'emptySlot', id: P.id });
    if (kind === 'ladder') {
      // l'échelle se pose sous le renfoncement de la cassette
      const N = this.fm(P.floor).niche;
      if (!N || N.ladder || Math.hypot(N.baseX - P.x, N.baseZ - P.z) > 2.2) return this.emit({ type: 'ladderFar', id: P.id });
      N.ladder = true;
      P.inv[i] = null;
      return this.emit({ type: 'ladderPlaced', id: P.id });
    }
    if (kind === 'bottle') {
      if (P.stamina >= 100) return this.emit({ type: 'useless', kind, id: P.id });
      P.stamina = 100;
      P.bottles++;
    } else {
      if (P.battery >= 100) return this.emit({ type: 'useless', kind, id: P.id });
      P.battery = Math.min(100, P.battery + BATTERY_PACK);
    }
    P.inv[i] = null;
    this.emit({ type: kind, used: true, id: P.id });
  }

  // F : prendre sa lampe sur la table, ou l'objet le plus proche (dans une case vide, sinon échangé avec la case choisie)
  pickUp(P) {
    if (!P.hasLamp && P.floor === 0 && this.table && Math.hypot(this.table.x - P.x, this.table.z - P.z) < 1.7) {
      const lamp = this.lamps.find((l) => !l.taken);
      if (lamp) {
        lamp.taken = true;
        P.hasLamp = true;
        P.flashlight = true;
        return this.emit({ type: 'lamp', id: P.id, lamp: lamp.id });
      }
    }
    const it = this.nearItem(P);
    if (!it) return this.emit({ type: 'nothing', id: P.id });
    it.taken = true;
    let slot = P.inv.indexOf(null);
    let dropped = null;
    if (slot < 0) {
      // inventaire plein : l'objet de la case choisie reste par terre à sa place
      slot = P.sel - 1;
      dropped = P.inv[slot];
      const items = this.fm(P.floor).items;
      items.push({ id: items.length, kind: dropped, x: it.x, z: it.z, gx: it.gx, gz: it.gz, taken: false });
    }
    P.inv[slot] = it.kind;
    this.emit({ type: 'pickup', kind: it.kind, dropped, by: P.id });
  }

  // l'objet au sol le plus proche à portée de F (à son étage)
  nearItem(P) {
    let best = null;
    let bd = PICK_R;
    for (const it of this.fm(P.floor).items || []) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  // le trou sous un point de l'étage du haut (-1 : pas de trou)
  pitUnder(x, z, floor) {
    const m = this.fm(floor);
    if (!this.floors[floor + 1]) return -1; // pas d'étage en dessous : pas de trou
    return m.pitAt ? m.pitAt(cellOf(x), cellOf(z)) : -1;
  }

  // l'hôte (ou le joueur seul) tient son équilibre ; s'il le perd, il tombe
  balanceSide(P, mx, my) {
    P.moving = mx !== 0 || my !== 0;
    const side = this.balance(P, mx);
    if (side) this.beamFall(P, side);
    return side;
  }

  // Barre d'équilibre : renvoie le côté de la chute (-1 gauche, 1 droite) ou 0
  balance(P, mx) {
    P.onBeam = this.pitUnder(P.x, P.z, P.floor) >= 0;
    if (!P.onBeam) {
      P.tilt *= Math.max(0, 1 - DT * 5);
      P.tiltV = 0;
      return 0;
    }
    const noise = (Math.random() - 0.5) * BEAM_NOISE[P.moving ? 1 : 0];
    P.tiltV += (P.tilt * BEAM_UNSTABLE + noise + mx * BEAM_FIX) * DT;
    P.tiltV *= 1 - DT * BEAM_DAMP;
    P.tilt = Math.max(-1, Math.min(1, P.tilt + P.tiltV * DT));
    return Math.abs(P.tilt) >= 1 ? Math.sign(P.tilt) : 0;
  }

  // Sur l'arête : seulement tout droit (Q et D servent à l'équilibre), lentement, et le pas suit l'arête la plus proche
  beamStep(P, my) {
    const C = CELL_SIZE;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const v = my * WALK_SPEED * BEAM_SPEED * DT;
    let dx = fx * v;
    let dz = fz * v;
    // les arêtes sont sur les bords des cases : on y est ramené en douceur, dans le sens de la marche
    const pull = 1.6 * DT;
    if (Math.abs(fx) > Math.abs(fz)) {
      const t = Math.round(P.z / C) * C - P.z;
      if (Math.abs(t) < 0.4) dz += Math.sign(t) * Math.min(Math.abs(t), pull);
    } else {
      const t = Math.round(P.x / C) * C - P.x;
      if (Math.abs(t) < 0.4) dx += Math.sign(t) * Math.min(Math.abs(t), pull);
    }
    return this.moveWithCollisions(P.x, P.z, dx, dz, PLAYER_RADIUS, P.floor);
  }

  // Tomber par un trou : on atterrit à l'étage du dessous, juste en dessous, sonné un instant
  fallThrough(P, pitId, balance = false) {
    const pit = this.fm(P.floor).pits[pitId];
    P.floor += 1;
    P.x = pit.x;
    P.z = pit.z;
    P.lockT = FALL_LOCK;
    P.running = false;
    P.onBeam = false;
    P.tilt = 0;
    P.tiltV = 0;
    P.stamina = Math.max(0, P.stamina - 30);
    this.emit({ type: 'fall', id: P.id, name: P.name, balance });
  }

  // Perdre l'équilibre : on bascule dans le trou du côté où l'on penche
  beamFall(P, side) {
    const rx = Math.cos(P.yaw);
    const rz = -Math.sin(P.yaw);
    P.tilt = 0;
    P.tiltV = 0;
    for (const d of [0.9, 0.6, 1.3]) {
      const id = this.pitUnder(P.x + rx * side * d, P.z + rz * side * d, P.floor);
      if (id >= 0) return this.fallThrough(P, id, true);
    }
  }

  // Prendre l'escalier : on entre dans sa case, on arrive à l'autre étage devant les marches
  takeStairs(P) {
    for (const st of this.stairs) {
      if (Math.hypot(st.x - P.x, st.z - P.z) > STAIR_R) continue;
      const up = P.floor > 0;
      P.floor += up ? -1 : 1;
      const to = up ? st.up : st.down;
      P.x = to.x;
      P.z = to.z;
      P.lockT = STAIR_LOCK;
      // on regarde dans le sens de la sortie de l'escalier
      P.yaw = up ? Math.atan2(-st.dx, -st.dz) : Math.atan2(st.dx, st.dz);
      this.emit({ type: 'stairs', id: P.id, up });
      return true;
    }
    return false;
  }

  // T : siffler. Les autres l'entendent ; trop de coups de sifflet rapprochés attirent l'entité
  whistle(P) {
    if (P.whistleCd > 0) return;
    P.whistleCd = WHISTLE_CD;
    P.heat += 1;
    this.emit({ type: 'whistle', id: P.id, name: P.name, x: P.x, z: P.z, floor: P.floor });
    const M = this.monster;
    if (!this.hasMonster || M.mode === 'chase' || M.floor !== P.floor) return;
    if (Math.hypot(M.x - P.x, M.z - P.z) > 45) return;
    if (P.heat >= WHISTLE_HEAT || Math.random() < 0.15) {
      M.mode = 'search';
      M.silent = false;
      M.ambush = null;
      M.lastSeenX = P.x;
      M.lastSeenZ = P.z;
      M.repathT = 0;
      this.emit({ type: 'heard', id: P.id });
    }
  }

  // Un pas de simulation. input : les commandes du joueur de cet écran ; others : { id: commandes } des autres
  step(input = {}, others = null) {
    if (this.state !== 'playing') return;
    this.time += DT;

    // l'ascenseur part : les portes sont fermées, on attend l'arrivée
    if (this.departT > 0) {
      this.departT -= DT;
      if (this.departT <= 0) this.arrive();
      return;
    }

    // coupures de courant du Level 1
    if (this.level === 1) {
      if (this.blackout > 0) {
        this.blackout -= DT;
        if (this.blackout <= 0) {
          this.blackout = 0;
          this.nextBlackout = rand(...BLACKOUT_EVERY);
          this.emit({ type: 'power' });
        }
      } else {
        this.nextBlackout -= DT;
        if (this.nextBlackout <= 0) {
          this.blackout = rand(...BLACKOUT_LEN);
          this.emit({ type: 'blackout', len: this.blackout });
        }
      }
    }

    for (const P of this.players) {
      const inp = P.id === this.localId ? input : (others && others[P.id]) || {};
      if (P.status === 'alive') this.stepPlayer(P, inp);
    }
    if (this.state !== 'playing') return;

    if (this.hasMonster) this.updateMonster();
    this.checkElevator();
  }

  stepPlayer(P, input) {
    // 1. Orientation, lampe et inventaire
    if (input.yaw !== undefined) P.yaw = input.yaw;
    if (input.pitch !== undefined) P.pitch = input.pitch;
    if (input.sel === 1 || input.sel === 2) P.sel = input.sel;
    P.whistleCd = Math.max(0, P.whistleCd - DT);
    P.heat = Math.max(0, P.heat - DT / 20);
    if (input.whistle) this.whistle(P);
    if (input.pick) this.pickUp(P);
    if (input.toggleFlashlight) {
      if (!P.hasLamp) this.emit({ type: 'noLamp', id: P.id });
      else if (!P.flashlight && P.battery <= 0) this.emit({ type: 'batteryEmpty', id: P.id });
      else {
        P.flashlight = !P.flashlight;
        this.emit({ type: 'flashlight', on: P.flashlight, id: P.id });
      }
    }
    if (input.use !== undefined && input.use !== null) this.useItem(P, input.use);
    if (input.useSel) this.useItem(P, P.sel - 1);

    // la lampe vide la pile ; à plat, elle s'éteint
    if (P.flashlight) {
      P.battery = Math.max(0, P.battery - BATTERY_DRAIN * DT);
      if (P.battery <= 0) {
        P.flashlight = false;
        this.emit({ type: 'batteryEmpty', id: P.id });
      }
    }

    // 2. Endurance et course
    const mx = input.mx || 0;
    const my = input.my || 0;
    const wantRun = !!input.run && (mx !== 0 || my !== 0) && !P.onBeam;
    if (wantRun && P.stamina > 5) {
      P.running = true;
      P.stamina = Math.max(0, P.stamina - DT * STAMINA_DRAIN);
    } else {
      P.running = false;
      P.stamina = Math.min(100, P.stamina + DT * STAMINA_REGEN);
    }

    // 3. Déplacement (un invité se déplace chez lui et annonce sa position : l'hôte la prend si elle est plausible)
    const speed = P.running ? SPRINT_SPEED : WALK_SPEED;
    P.moving = mx !== 0 || my !== 0;
    const pos = input.pos;
    // un invité a perdu l'équilibre chez lui : il bascule dans le trou de ce côté
    if (input.beamFall) this.beamFall(P, Math.sign(input.beamFall));
    if (P.lockT > 0) {
      P.lockT = Math.max(0, P.lockT - DT);
      P.moving = false;
    } else if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) && Math.hypot(pos.x - P.x, pos.z - P.z) < 3 && !this.isColliding(pos.x, pos.z, PLAYER_RADIUS * 0.8, P.floor)) {
      // un invité se déplace chez lui (et tient son équilibre chez lui) : l'hôte prend sa position et son inclinaison
      P.x = pos.x;
      P.z = pos.z;
      if (Number.isFinite(input.tilt)) P.tilt = Math.max(-1, Math.min(1, input.tilt));
      P.onBeam = this.pitUnder(P.x, P.z, P.floor) >= 0;
    } else if (input.remote) {
      // invité sans position ce pas-ci : il reste où il est
    } else if (this.balanceSide(P, mx, my) !== 0) {
      // perdu l'équilibre : c'est fait dans balanceSide
    } else if (P.onBeam) {
      P.moving = my !== 0;
      if (my !== 0) {
        const b = this.beamStep(P, my);
        P.x = b.x;
        P.z = b.z;
      }
    } else if (P.moving) {
      const len = Math.hypot(mx, my) || 1;
      const normX = mx / len;
      const normY = my / len;
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      const rx = Math.cos(P.yaw);
      const rz = -Math.sin(P.yaw);
      const p2 = this.moveWithCollisions(P.x, P.z, (fx * normY + rx * normX) * speed * DT, (fz * normY + rz * normX) * speed * DT, PLAYER_RADIUS, P.floor);
      P.x = p2.x;
      P.z = p2.z;
    }

    // 3b. Un pas de trop au-dessus d'un trou : on tombe à l'étage du dessous
    const pitId = this.pitUnder(P.x, P.z, P.floor);
    if (pitId >= 0) {
      const pit = this.fm(P.floor).pits[pitId];
      if (Math.abs(P.x - pit.x) < PIT_HALF && Math.abs(P.z - pit.z) < PIT_HALF) this.fallThrough(P, pitId);
    }
    // 3c. L'escalier
    if (P.lockT <= 0) this.takeStairs(P);

    // 3d. Au pied de l'échelle posée : on grimpe jusqu'au renfoncement
    const map = this.fm(P.floor);
    const N = map.niche;
    P.onLadder = !!(N && N.ladder && Math.hypot(N.baseX - P.x, N.baseZ - P.z) < 0.9);

    // 4. Objectifs : cassettes (Level 0) ou fusibles (Level 1), pour toute l'équipe
    for (const cas of map.cassettes || []) {
      if (cas.collected || Math.hypot(cas.x - P.x, cas.z - P.z) >= 1.4) continue;
      if (cas.high && !P.onLadder) continue; // trop haut sans l'échelle
      cas.collected = true;
      this.cassettes++;
      P.found++;
      this.emit({ type: 'cassette', id: cas.id, by: P.id, count: this.cassettes, total: CASSETTES });
      if (this.cassettes === CASSETTES) {
        if (this.level === 0) this.unlockLevel0();
        this.emit({ type: 'exitUnlocked' });
      }
    }
    for (const f of map.fuses || []) {
      if (f.taken || Math.hypot(f.x - P.x, f.z - P.z) >= 1.3) continue;
      f.taken = true;
      this.fuses++;
      P.found++;
      this.emit({ type: 'fuse', id: f.id, by: P.id, count: this.fuses, total: FUSES });
    }
    // les 3 fusibles rapportés au panneau du monte-charge : le courant revient, les portes s'ouvrent
    if (this.level === 1 && !this.powered && this.fuses >= FUSES && Math.hypot(map.exit.x - P.x, map.exit.z - P.z) < 2.6) {
      this.powered = true;
      this.emit({ type: 'powered', by: P.id });
      this.emit({ type: 'exitUnlocked' });
    }

    // 4c. Signal (à vol d'oiseau, 0 au-delà de 45 m) : l'objectif le plus proche à cet étage ; s'il n'en reste qu'à
    // l'autre étage, l'escalier ; une fois tout trouvé, l'ascenseur de cet étage (le vrai… ou le faux)
    this.updateSignal(P);

    // 5. Entrer dans le vrai ascenseur ouvert : à l'abri, spectateur jusqu'au départ
    if (this.open && P.floor === this.realFloor) {
      const E = map.elevator;
      const inside = E ? cellOf(P.x) === E.gx && cellOf(P.z) === E.gz : Math.hypot(map.exit.x - P.x, map.exit.z - P.z) < 1.8;
      if (inside) {
        P.status = 'elevator';
        P.moving = false;
        P.running = false;
        this.emit({ type: 'board', id: P.id, name: P.name });
      }
    }
  }

  updateSignal(P) {
    const map = this.fm(P.floor);
    const near = (list) => list.reduce((b, g) => Math.min(b, Math.hypot(g.x - P.x, g.z - P.z)), Infinity);
    let best = Infinity;
    P.sigTo = 'goal';
    if (this.level === 0 && !this.open) {
      best = near((map.cassettes || []).filter((c) => !c.collected));
      if (best === Infinity && this.stairs.length) {
        best = near(this.stairs);
        P.sigTo = 'stairs';
      }
    } else if (this.level === 1 && this.fuses < FUSES) {
      best = near((map.fuses || []).filter((f) => !f.taken));
    } else {
      best = Math.hypot(map.exit.x - P.x, map.exit.z - P.z);
      P.sigTo = 'exit';
    }
    P.signal = best === Infinity ? 0 : Math.max(0, 1 - best / 45);
  }

  // Invité : il déplace seulement son joueur, sans rien ramasser ni décider (l'hôte le fera). Renvoie le côté d'une
  // chute de la barre d'équilibre (l'hôte fera tomber), sinon 0.
  predict(input = {}) {
    const P = this.player;
    if (this.state !== 'playing' || P.status !== 'alive' || this.departT > 0) return 0;
    if (input.yaw !== undefined) P.yaw = input.yaw;
    if (input.pitch !== undefined) P.pitch = input.pitch;
    if (P.lockT > 0) {
      P.lockT = Math.max(0, P.lockT - DT);
      return 0;
    }
    const mx = input.mx || 0;
    const my = input.my || 0;
    P.moving = mx !== 0 || my !== 0;
    const side = this.balance(P, mx);
    if (side) {
      P.tilt = 0;
      P.tiltV = 0;
      return side;
    }
    if (P.onBeam) {
      P.running = false;
      P.stamina = Math.min(100, P.stamina + DT * STAMINA_REGEN);
      P.moving = my !== 0;
      if (my !== 0) {
        const b = this.beamStep(P, my);
        P.x = b.x;
        P.z = b.z;
      }
      return 0;
    }
    P.running = !!input.run && P.moving && P.stamina > 5;
    if (P.running) P.stamina = Math.max(0, P.stamina - DT * STAMINA_DRAIN);
    else P.stamina = Math.min(100, P.stamina + DT * STAMINA_REGEN);
    if (!P.moving) return 0;
    const speed = P.running ? SPRINT_SPEED : WALK_SPEED;
    const len = Math.hypot(mx, my) || 1;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw);
    const rz = -Math.sin(P.yaw);
    const pos = this.moveWithCollisions(P.x, P.z, ((fx * my + rx * mx) / len) * speed * DT, ((fz * my + rz * mx) / len) * speed * DT, PLAYER_RADIUS, P.floor);
    P.x = pos.x;
    P.z = pos.z;
    return 0;
  }

  // Un joueur arrive en cours de partie : spectateur jusqu'au prochain étage
  addPlayer(id, name) {
    if (this.players.some((p) => p.id === id)) return;
    this.roster.push({ id, name });
    const P = newPlayer(id, name, this.map, this.players.length);
    P.status = 'dead';
    this.players.push(P);
  }

  // l'objectif à suivre pour un joueur sans lampe : la table du départ
  get needLamp() {
    return !!this.table && !this.player.hasLamp && this.player.status === 'alive';
  }

  // Un joueur s'en va : il disparaît de la partie ; s'il était le dernier dehors, l'ascenseur part
  removePlayer(id) {
    this.roster = this.roster.filter((r) => r.id !== id);
    this.players = this.players.filter((p) => p.id !== id);
    if (this.players.length && this.state === 'playing') this.checkElevator();
  }

  // Instantané envoyé par l'hôte aux invités (~20 fois par seconde)
  snapshot() {
    const M = this.monster;
    const bits = (list, k) => (list || []).map((o) => (o[k] ? 1 : 0)).join('');
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      lv: this.level,
      st: this.state,
      tm: r2(this.time),
      c: this.cassettes,
      f: this.fuses,
      pw: this.powered ? 1 : 0,
      bo: r2(this.blackout),
      dp: r2(this.departT),
      // le vrai ascenseur ne se dévoile qu'une fois les cassettes trouvées
      rf: this.open ? this.realFloor : -1,
      p: this.players.map((P) => [P.id, r2(P.x), r2(P.z), r2(P.yaw), r2(P.pitch), P.status, P.flashlight ? 1 : 0, Math.round(P.battery), Math.round(P.stamina), P.inv.map((k) => k || '').join(','), r2(P.signal), P.running ? 1 : 0, P.moving ? 1 : 0, P.found, P.name, P.hasLamp ? 1 : 0, P.sel, P.floor, P.sigTo, P.onLadder ? 1 : 0, r2(P.lockT), r2(P.tilt), P.onBeam ? 1 : 0]),
      m: [r2(M.x), r2(M.z), r2(M.yaw), M.mode, M.silent ? 1 : 0, M.floor],
      k: [bits(this.allCassettes, 'collected'), bits(this.map.fuses, 'taken'), this.floors.map((f) => bits(f.items, 'taken')).join('|'), '', bits(this.lamps, 'taken')],
      // objets posés par des joueurs (échanges) : [étage, objet, x, z] ; échelle posée
      ix: this.floors.flatMap((f, fi) => (f.items || []).slice(this.items0[fi]).map((o) => [fi, o.kind, r2(o.x), r2(o.z)])),
      nl: this.floors.some((f) => f.niche && f.niche.ladder) ? 1 : 0,
    };
  }

  // Invité : applique l'instantané de l'hôte. Son propre joueur garde sa position prédite, sauf grand écart
  applySnapshot(snap) {
    if (snap.lv !== this.level) this.loadLevel(snap.lv);
    this.state = snap.st;
    this.time = snap.tm;
    this.cassettes = snap.c;
    this.fuses = snap.f;
    this.powered = !!snap.pw;
    this.blackout = snap.bo;
    this.departT = snap.dp;
    if (snap.rf >= 0 && !this.unlocked) {
      this.realFloor = snap.rf;
      if (this.level === 0) this.unlockLevel0();
    }
    const seen = new Set();
    for (const row of snap.p) {
      const [id, x, z, yaw, pitch, status, fl, bat, stam, inv, signal, running, moving, found, name, lamp, sel, floor, sigTo, onLadder, lockT, tilt, onBeam] = row;
      seen.add(id);
      let P = this.players.find((q) => q.id === id);
      if (!P) {
        this.roster.push({ id, name });
        P = newPlayer(id, name, this.map, this.players.length);
        this.players.push(P);
      }
      const mine = id === this.localId;
      const far = Math.hypot(P.x - x, P.z - z) > 2.5;
      // l'hôte décide des chutes et des escaliers : la position suit
      if (!mine || far || status !== 'alive' || P.status !== 'alive' || P.floor !== floor) {
        P.x = x;
        P.z = z;
      }
      if (!mine) {
        P.yaw = yaw;
        P.pitch = pitch;
        P.running = !!running;
        P.moving = !!moving;
        P.stamina = stam;
      } else if (P.floor !== floor) P.yaw = yaw;
      P.floor = floor || 0;
      P.status = status;
      P.flashlight = !!fl;
      P.hasLamp = !!lamp;
      if (!mine && sel) P.sel = sel;
      P.sigTo = sigTo || 'goal';
      P.onLadder = !!onLadder;
      if (lockT > 0 && !(P.lockT > 0)) P.lockT = lockT;
      if (!mine) {
        P.tilt = tilt || 0;
        P.onBeam = !!onBeam;
      }
      P.battery = bat;
      P.inv = (inv || ',').split(',').map((k) => k || null);
      P.signal = signal;
      P.found = found;
    }
    this.players = this.players.filter((q) => seen.has(q.id));
    const M = this.monster;
    [M.x, M.z, M.yaw, M.mode] = snap.m;
    M.silent = !!snap.m[4];
    M.floor = snap.m[5] || 0;
    const set = (list, k, b) => (list || []).forEach((o, i) => {
      o[k] = (b || '')[i] === '1';
    });
    set(this.allCassettes, 'collected', snap.k[0]);
    set(this.map.fuses, 'taken', snap.k[1]);
    // objets posés par des joueurs : on ajoute ceux qu'on n'a pas encore, étage par étage
    this.floors.forEach((f, fi) => {
      const list = (snap.ix || []).filter((o) => o[0] === fi);
      for (const [, kind, x, z] of list.slice(f.items.length - this.items0[fi])) f.items.push({ id: f.items.length, kind, x, z, gx: cellOf(x), gz: cellOf(z), taken: false });
    });
    const takenBits = (snap.k[2] || '').split('|');
    this.floors.forEach((f, fi) => set(f.items, 'taken', takenBits[fi]));
    for (const f of this.floors) if (f.niche) f.niche.ladder = !!snap.nl;
    // la table compte autant de lampes que de joueurs chez l'hôte
    if (snap.k[4] !== undefined && this.table) {
      while (this.lamps.length < snap.k[4].length) this.lamps.push({ ...this.lamps[0], id: this.lamps.length, taken: false });
      set(this.lamps, 'taken', snap.k[4]);
    }
    if (this.hasMonster) this.senseMonster();
  }

  // L'ascenseur part quand plus personne n'est dehors (et qu'au moins un joueur est dedans)
  checkElevator() {
    if (this.departT > 0 || this.state !== 'playing') return;
    const alive = this.players.filter((p) => p.status === 'alive').length;
    const inside = this.players.filter((p) => p.status === 'elevator').length;
    if (alive > 0) return;
    if (inside > 0) {
      this.departT = DEPART_T;
      this.emit({ type: 'depart', level: this.level });
    } else {
      this.state = 'dead';
      this.emit({ type: 'gameover', time: this.time });
    }
  }

  arrive() {
    if (this.level >= LAST_LEVEL) {
      this.state = 'won';
      this.emit({ type: 'win', time: this.time });
      return;
    }
    this.loadLevel(this.level + 1);
    this.emit({ type: 'level', level: this.level });
  }

  // Proximité de l'entité pour chaque joueur (son, image) et cible de la traque. À l'autre étage, on l'entend
  // étouffée à travers le plancher et elle ne voit personne.
  senseMonster() {
    const M = this.monster;
    let target = null;
    let bestScore = Infinity;
    for (const P of this.players) {
      const same = P.floor === M.floor;
      const dx = P.x - M.x;
      const dz = P.z - M.z;
      const dist = Math.hypot(dx, dz);
      P.mDist = same ? dist : dist + 40;
      // bourdonnement : de 0 à 35 m, il monte vite quand elle est à portée ; elle se tait en embuscade
      const ratio = 1 - Math.min(1, Math.max(0, (dist - 1.2) / 32));
      P.danger = dist > 35 ? 0 : Math.pow(ratio, 1.6) * (M.silent ? 0.35 : 1) * (same ? 1 : 0.25);
      let diff = Math.atan2(M.x - P.x, M.z - P.z) - (P.yaw - Math.PI);
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      P.pan = Math.max(-0.9, Math.min(0.9, Math.sin(diff)));
      if (P.status !== 'alive') continue;
      P.seen = same && hasLineOfSight(this.fm(M.floor), M.x, M.z, P.x, P.z);
      const score = P.mDist - (P.seen ? 12 : 0) - (P.id === M.target ? 6 : 0);
      if (score < bestScore) {
        bestScore = score;
        target = P;
      }
    }
    const view = this.viewPlayer(this.spectate || 0);
    M.danger = view.danger;
    M.pan = view.pan;
    return target;
  }

  updateMonster() {
    const M = this.monster;
    const P = this.senseMonster();
    if (!P) return;
    M.target = P.id;
    const map = this.fm(M.floor);
    const rage = this.rage; // 0 seul ou personne à l'abri, jusqu'à 1 quand il ne reste qu'un joueur dehors
    const dark = this.blackout > 0;
    const same = P.floor === M.floor;
    const dx = P.x - M.x;
    const dz = P.z - M.z;
    const dist = same ? Math.hypot(dx, dz) : Infinity;
    M.distToPlayer = dist;
    M.hasLineOfSight = P.seen;

    // Détection : vue directe (moins loin lampe éteinte ; dans le noir, une lampe allumée se voit de loin),
    // bruit de course, présence rapprochée. La colère allonge tout.
    const sight = (dark ? (P.flashlight ? 28 : 7) : P.flashlight ? 24 : 15) + rage * 10;
    const hear = (dark ? 15 : 12) + rage * 8;
    const canSee = M.hasLineOfSight && dist < sight;
    const canHear = P.running && dist < hear;
    const isNearby = dist < 4 + rage * 2;

    if (M.mode === 'ambush') {
      // en embuscade, elle attend que sa proie passe tout près
      M.waitT -= DT;
      const atSpot = M.ambush && Math.hypot(M.x - M.ambush.x, M.z - M.ambush.z) < 0.6;
      if (dist < 6.5 || (M.hasLineOfSight && dist < 9)) {
        this.emit({ type: 'spotted', ambush: true });
        M.mode = 'chase';
        M.silent = false;
        M.burstT = 2;
        M.unseenT = 0;
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
      } else if (M.waitT <= 0) {
        // personne n'est passé : elle part voir là où se trouvait sa proie
        M.mode = 'search';
        M.silent = false;
        M.ambush = null;
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
        M.repathT = 0;
        M.ambushT = rand(14, 22) * (1 - rage * 0.5);
      } else if (atSpot) {
        M.path = [];
      }
    } else if (canSee || canHear || isNearby) {
      if (M.mode !== 'chase') this.emit({ type: 'spotted' });
      M.mode = 'chase';
      M.silent = false;
      M.unseenT = 0;
      M.lastSeenX = P.x;
      M.lastSeenZ = P.z;
    } else if (M.mode === 'chase') {
      // hors de vue : au bout de quelques secondes, le joueur l'a semée
      M.unseenT += DT;
      if (M.unseenT > LOSE_TRACK_T + rage * 4 || !same) M.mode = 'search';
    }

    // Vitesse selon le mode, la colère et le noir
    const k = 1 + rage * 0.35 + (dark ? 0.1 : 0);
    M.burstT = Math.max(0, M.burstT - DT);
    if (M.mode === 'chase') M.speed = this.monsterChaseSpeed * k * (M.burstT > 0 ? 1.15 : 1);
    else if (M.mode === 'search') M.speed = MONSTER_PATROL_SPEED * 1.3 * k;
    else if (M.mode === 'ambush') M.speed = MONSTER_PATROL_SPEED * 1.5;
    else M.speed = MONSTER_PATROL_SPEED * (1 + rage * 0.5);

    // Level 1 : en patrouille, elle contourne par les rangées d'étagères pour attendre le joueur plus loin
    if (M.mode === 'patrol' && map.isShelfSide && same) {
      M.ambushT -= DT;
      if (M.ambushT <= 0 && dist < 45) {
        const spot = this.findAmbush(P);
        M.ambushT = 4;
        if (spot) {
          M.mode = 'ambush';
          M.silent = true;
          M.ambush = spot;
          M.waitT = 14;
          M.repathT = 0;
        }
      }
    }

    // Recalcul de trajectoire. Sa proie est à l'autre étage : elle va à l'escalier le plus proche
    M.repathT -= DT;
    if (M.repathT <= 0) {
      M.repathT = M.mode === 'chase' ? 0.35 : 1.2;
      let tx = P.x;
      let tz = P.z;
      if (!same && this.stairs.length && M.mode !== 'patrol') {
        const st = this.stairs.reduce((b, s) => (Math.hypot(s.x - M.x, s.z - M.z) < Math.hypot(b.x - M.x, b.z - M.z) ? s : b));
        tx = st.x;
        tz = st.z;
      } else if (M.mode === 'patrol') {
        if (!M.targetWander || Math.hypot(M.x - M.targetWander.x, M.z - M.targetWander.z) < 1.5) {
          // l'entité rôde : souvent non loin d'un joueur de son étage (de plus en plus quand elle s'énerve) ;
          // de temps en temps, elle change d'étage
          if (!same && this.stairs.length && Math.random() < 0.35 + rage * 0.4) {
            M.mode = 'search';
          } else {
            const near = same && Math.random() < 0.5 + rage * 0.4 ? map.walkable.filter((c) => Math.hypot((c.x + 0.5) * CELL_SIZE - P.x, (c.z + 0.5) * CELL_SIZE - P.z) < 28 - rage * 12) : [];
            const pool = near.length ? near : map.walkable;
            const c = pool[Math.floor(Math.random() * pool.length)];
            M.targetWander = { x: (c.x + 0.5) * CELL_SIZE, z: (c.z + 0.5) * CELL_SIZE };
          }
        }
        if (M.targetWander) {
          tx = M.targetWander.x;
          tz = M.targetWander.z;
        }
      } else if (M.mode === 'search') {
        tx = M.lastSeenX;
        tz = M.lastSeenZ;
        if (Math.hypot(M.x - tx, M.z - tz) < 2) M.mode = 'patrol';
      } else if (M.mode === 'ambush') {
        tx = M.ambush.x;
        tz = M.ambush.z;
      }
      M.goal = { x: tx, z: tz };
      const path = findPath(map, M.x, M.z, tx, tz);
      if (path && path.length > 0) {
        M.path = path;
        M.pathIndex = 0;
      }
    }

    // Avancement le long du chemin
    if (M.path && M.path.length > M.pathIndex) {
      const wp = M.path[M.pathIndex];
      const wdx = wp.x - M.x;
      const wdz = wp.z - M.z;
      const wdist = Math.hypot(wdx, wdz);
      if (wdist < 0.3) M.pathIndex++;
      else {
        const stepLen = Math.min(wdist, M.speed * DT);
        M.x += (wdx / wdist) * stepLen;
        M.z += (wdz / wdist) * stepLen;
        M.yaw = Math.atan2(wdx, wdz);
      }
    } else if (M.mode === 'chase' && same && dist > 0.1) {
      const stepLen = Math.min(dist, M.speed * DT);
      M.x += (dx / dist) * stepLen;
      M.z += (dz / dist) * stepLen;
      M.yaw = Math.atan2(dx, dz);
    } else if (M.goal && cellOf(M.goal.x) === cellOf(M.x) && cellOf(M.goal.z) === cellOf(M.z) && Math.hypot(M.goal.x - M.x, M.goal.z - M.z) > 0.1) {
      // le but est dans sa case (pas de chemin à suivre) : tout droit
      const gx = M.goal.x - M.x;
      const gz = M.goal.z - M.z;
      const gd = Math.hypot(gx, gz);
      const stepLen = Math.min(gd, M.speed * DT);
      M.x += (gx / gd) * stepLen;
      M.z += (gz / gd) * stepLen;
      M.yaw = Math.atan2(gx, gz);
    }

    // l'entité prend l'escalier quand sa proie est à l'autre étage
    M.stairT = Math.max(0, M.stairT - DT);
    if (!same && M.stairT <= 0) {
      for (const st of this.stairs) {
        if (Math.hypot(st.x - M.x, st.z - M.z) > 0.6) continue;
        const up = M.floor > 0;
        M.floor += up ? -1 : 1;
        const to = up ? st.up : st.down;
        M.x = to.x;
        M.z = to.z;
        M.path = [];
        M.repathT = 0;
        M.stairT = 3;
        M.mode = 'search';
        M.lastSeenX = P.x;
        M.lastSeenZ = P.z;
        this.emit({ type: 'monsterStairs', floor: M.floor });
        break;
      }
    }

    // L'entité attrape le joueur
    if (same && dist < 1.15) {
      P.status = 'dead';
      P.moving = false;
      this.emit({ type: 'jumpscare', x: M.x, z: M.z, id: P.id });
      this.emit({ type: 'dead', id: P.id, name: P.name, time: this.time });
      M.mode = 'patrol';
      M.target = null;
      M.path = [];
      M.ambushT = 6;
    }
  }

  // Une case au bout ou le long d'une rangée d'étagères, sur la route probable du joueur et hors de sa vue
  findAmbush(P) {
    const map = this.fm(P.floor);
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    const px = P.x + fx * 10;
    const pz = P.z + fz * 10;
    let best = null;
    let bestD = Infinity;
    for (const c of map.walkable) {
      const x = (c.x + 0.5) * CELL_SIZE;
      const z = (c.z + 0.5) * CELL_SIZE;
      const dp = Math.hypot(x - px, z - pz);
      if (dp > 8 || dp >= bestD) continue;
      if (Math.hypot(x - P.x, z - P.z) < 7) continue;
      if (!map.isShelfSide(c.x, c.z)) continue;
      if (hasLineOfSight(map, P.x, P.z, x, z)) continue;
      best = { x, z, gx: c.x, gz: c.z };
      bestD = dp;
    }
    return best;
  }
}
