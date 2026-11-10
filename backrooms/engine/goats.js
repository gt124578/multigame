// The Backrooms (Level 2) - Le troupeau : des chèvres noires qui vivent dans le noir des galeries.
// Elles rôdent ensemble d'un coin sombre à l'autre, repèrent les joueurs (une lampe allumée se voit de loin, une course
// s'entend), les approchent par le noir, s'arrêtent, grattent le sol… puis foncent tout droit. Une charge ne tourne
// presque pas : un pas de côté suffit, et la chèvre qui manque sa cible va s'assommer contre un mur.
// Elles craignent la lumière : le faisceau d'une lampe torche les fait détaler, et elles n'entrent jamais sous une
// lampe allumée (une lampe qui grésille, elle, ne protège pas). Quand quelqu'un est à l'abri sous une lampe, elles
// attendent au bord de l'ombre, en le regardant. Pour passer d'un coin sombre à un autre quand des lampes leur barrent
// la route, elles se faufilent par les gaines et les faux plafonds, là où personne ne les voit : on les entend
// gratter dans les conduits.
import { CELL_SIZE, bfs } from './map.js';
import { hasLineOfSight } from './nav.js';

const C = CELL_SIZE;
const DT = 1 / 60;
export const GOAT_R = 0.42;
export const GOAT_ROAM = 1.5;
export const GOAT_STALK = 2.6;
export const GOAT_CHARGE = 7.4;
export const GOAT_FLEE = 4.8;
export const WINDUP_T = 0.8; // le temps de gratter le sol avant de charger : de quoi braquer sa lampe ou s'écarter
export const STUN_T = 1.7;
export const BEAM_RANGE = 15; // portée du faisceau qui les fait fuir
export const BEAM_ANGLE = 0.42; // demi-angle du faisceau (rad), plus large tout près
export const HIT_R = 0.88;
export const GOAT_MODES = ['roam', 'stalk', 'lurk', 'windup', 'charge', 'stun', 'flee'];
// Le bouc alpha (la chèvre 0, à cloche) : à partir de ALPHA_RAGE vannes fermées, la lumière ne l'arrête plus. Ébouillanté
// par un jet de vapeur en pleine charge, il file à la bergerie et craint de nouveau la lumière pendant ALPHA_TAME s.
export const ALPHA_RAGE = 2;
export const ALPHA_TAME = 45;
// le bouc ne craint plus la lumière
export const bold = (sim, g) => !!g.alpha && sim.valves >= ALPHA_RAGE && !(g.tameT > 0);
const rand = (a, b) => a + Math.random() * (b - a);
const cellOf = (v) => Math.floor(v / C);

// cases éclairées par une lampe allumée (sa case et les quatre voisines) : les chèvres n'y entrent pas
export function litCells(map) {
  // tout le courant a sauté : plus aucune lampe ne protège
  if (map.dark) return map.goatDark || (map.goatDark = new Uint8Array(map.W * map.H));
  if (map.goatLit) return map.goatLit;
  const lit = new Uint8Array(map.W * map.H);
  for (const l of map.lights || []) {
    if (l.state !== 'on') continue;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = l.gx + dx;
      const z = l.gz + dz;
      if (x >= 0 && z >= 0 && x < map.W && z < map.H) lit[z * map.W + x] = 1;
    }
  }
  map.goatLit = lit;
  return lit;
}

export function isLit(map, x, z) {
  const gx = cellOf(x);
  const gz = cellOf(z);
  if (gx < 0 || gz < 0 || gx >= map.W || gz >= map.H) return false;
  return litCells(map)[gz * map.W + gx] === 1;
}

// combien de chèvres : 2 de plus que de joueurs, de 3 à 6 (une de plus en difficile)
export function goatCount(players, difficulty) {
  return Math.min(6, Math.max(3, 2 + players)) + (difficulty === 'hard' ? 1 : 0);
}

export function createGoats(map, n) {
  const spots = map.goatSpawn && map.goatSpawn.length ? map.goatSpawn : [map.monsterSpawn];
  return Array.from({ length: n }, (_, i) => {
    const s = spots[i % spots.length];
    return {
      id: i,
      alpha: i === 0,
      tameT: 0, // bouc alpha : secondes où il craint encore la lumière (ébouillanté)
      rage: false, // bouc alpha : la lumière ne l'arrête plus (annoncé une fois à chaque fois)
      x: s.x + (i >= spots.length ? 0.6 : 0),
      z: s.z,
      yaw: Math.random() * Math.PI * 2,
      mode: 'roam',
      t: 0,
      path: [],
      pi: 0,
      repathT: Math.random(),
      goal: null,
      target: null, // id du joueur visé
      seenT: 0, // secondes depuis qu'elle a perçu sa cible
      dirX: 0,
      dirZ: 1,
      run: 0,
      maxRun: 0,
      speed: 0,
      cool: rand(2, 5), // délai avant de pouvoir charger
      fearT: 0, // effrayée : ne traque plus personne
      litT: 0,
      bleatT: rand(3, 12),
      stuckT: 0, // secondes à ne pas pouvoir rejoindre son but par le noir
    };
  });
}

// Chemin par le noir (BFS sur les cases ni bloquées ni éclairées ; la case de départ peut l'être, pour en sortir).
// Renvoie { path, reached } : faute de pouvoir atteindre le but, le chemin mène à la case sombre la plus proche de lui.
function darkPath(sim, map, sx, sz, tx, tz, maxCells = 900, brave = false) {
  const W = map.W;
  const lit = brave ? null : litCells(map);
  const s = cellOf(sz) * W + cellOf(sx);
  const tgx = cellOf(tx);
  const tgz = cellOf(tz);
  const t = tgz * W + tgx;
  const prev = new Int32Array(W * map.H).fill(-1);
  prev[s] = s;
  const q = [s];
  let best = s;
  let bestD = Math.abs(cellOf(sx) - tgx) + Math.abs(cellOf(sz) - tgz);
  let reached = s === t;
  for (let h = 0; h < q.length && !reached && q.length < maxCells; h++) {
    const k = q[h];
    const x = k % W;
    const z = (k - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const nk = nz * W + nx;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H || prev[nk] >= 0) continue;
      if (sim.blocked(nx, nz, 0) || (lit && lit[nk])) continue;
      prev[nk] = k;
      const d = Math.abs(nx - tgx) + Math.abs(nz - tgz);
      if (d < bestD) {
        bestD = d;
        best = nk;
      }
      if (nk === t) {
        reached = true;
        break;
      }
      q.push(nk);
    }
  }
  const end = reached ? t : best;
  const path = [];
  for (let k = end; k !== s; k = prev[k]) path.push({ x: ((k % W) + 0.5) * C, z: (Math.floor(k / W) + 0.5) * C });
  path.reverse();
  return { path, reached };
}

// une case sombre au hasard, à distance [r0, r1] du point (ox, oz) ; (ax, az) : à l'opposé de ce point-là (de l'autre
// côté de (ox, oz)), le plus loin possible
function darkCell(map, ox, oz, r0, r1, ax = null, az = null) {
  const lit = litCells(map);
  let best = null;
  let bestS = -Infinity;
  for (let i = 0; i < 120; i++) {
    const c = map.walkable[Math.floor(Math.random() * map.walkable.length)];
    const x = (c.x + 0.5) * C;
    const z = (c.z + 0.5) * C;
    const d = Math.hypot(x - ox, z - oz);
    if (lit[c.z * map.W + c.x] || d < r0 || d > r1) continue;
    if (ax !== null && (x - ox) * (ox - ax) + (z - oz) * (oz - az) <= 0) continue;
    const sc = ax === null ? Math.random() : Math.hypot(x - ax, z - az) + Math.random() * 4;
    if (sc > bestS) {
      bestS = sc;
      best = { x, z };
    }
  }
  return best;
}

// quelqu'un la voit-il (ou verrait-il ce point) ?
function watched(sim, map, x, z, r = 22) {
  return sim.players.some((P) => P.status === 'alive' && Math.hypot(P.x - x, P.z - z) < r && hasLineOfSight(map, P.x, P.z, x, z));
}

// Par les gaines : bloquée loin de son but par des lampes, et personne ne la regarde, elle ressort dans le noir près de
// son but (à r0-r1 m), d'une case sombre que personne ne voit et d'où le but s'atteint par le noir
function ventTravel(sim, map, g, gx, gz, r0, r1) {
  if (watched(sim, map, g.x, g.z)) return false;
  for (let i = 0; i < 6; i++) {
    const c = darkCell(map, gx, gz, r0, r1);
    if (!c || watched(sim, map, c.x, c.z)) continue;
    if (!darkPath(sim, map, c.x, c.z, gx, gz, 600).reached) continue;
    sim.emit({ type: 'goat', act: 'vent', id: g.id, x: g.x, z: g.z });
    g.x = c.x;
    g.z = c.z;
    g.path = [];
    g.repathT = 0;
    g.stuckT = 0;
    sim.emit({ type: 'goat', act: 'vent', id: g.id, x: c.x, z: c.z });
    return true;
  }
  return false;
}

// angle entre le regard du joueur et un point
function facing(P, x, z) {
  let d = Math.atan2(-(x - P.x), -(z - P.z)) - P.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

// le joueur qui l'éclaire de sa lampe (ou null)
function beamOn(sim, map, g) {
  for (const P of sim.players) {
    if (P.status !== 'alive' || !P.flashlight || (P.floor || 0) !== 0) continue;
    const d = Math.hypot(g.x - P.x, g.z - P.z);
    if (d > BEAM_RANGE) continue;
    if (facing(P, g.x, g.z) > (d < 3.5 ? 0.8 : BEAM_ANGLE)) continue;
    if (!hasLineOfSight(map, P.x, P.z, g.x, g.z)) continue;
    return P;
  }
  return null;
}

// un grand bruit (vanne qui claque, cri) : les chèvres qui l'entendent viennent voir, par le noir
export function alertGoats(sim, x, z, range) {
  for (const g of sim.goats || []) {
    if (g.fearT > 0 || g.mode === 'charge' || g.mode === 'windup' || g.mode === 'flee') continue;
    if (Math.hypot(g.x - x, g.z - z) > range) continue;
    g.mode = 'stalk';
    g.target = null;
    g.goal = { x, z };
    g.seenT = 0;
    g.repathT = 0;
  }
}

function setMode(g, mode) {
  g.mode = mode;
  g.repathT = 0;
}

// La fuite : par le noir, sans jamais se rapprocher de la lumière (distance de marche depuis elle), aussi loin que
// possible en une quinzaine de cases. Renvoie le chemin (vide : acculée).
function retreat(sim, map, g, from) {
  const W = map.W;
  const fx = Math.max(0, Math.min(W - 1, cellOf(from.x)));
  const fz = Math.max(0, Math.min(map.H - 1, cellOf(from.z)));
  const dP = bfs(map.grid, W, map.H, fx, fz);
  const lit = litCells(map);
  const s = cellOf(g.z) * W + cellOf(g.x);
  if (dP[s] < 0) return [];
  const prev = new Int32Array(W * map.H).fill(-1);
  const steps = new Int16Array(W * map.H);
  prev[s] = s;
  const q = [s];
  let best = s;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (steps[k] >= 15) continue;
    const x = k % W;
    const z = (k - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const nk = nz * W + nx;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H || prev[nk] >= 0) continue;
      if (sim.blocked(nx, nz, 0) || lit[nk] || dP[nk] < dP[k]) continue;
      prev[nk] = k;
      steps[nk] = steps[k] + 1;
      if (dP[nk] > dP[best] || (dP[nk] === dP[best] && steps[nk] > steps[best])) best = nk;
      q.push(nk);
    }
  }
  const path = [];
  for (let k = best; k !== s; k = prev[k]) path.push({ x: ((k % W) + 0.5) * C, z: (Math.floor(k / W) + 0.5) * C });
  return path.reverse();
}

function flee(sim, map, g, from) {
  const path = retreat(sim, map, g, from);
  const spot = path.length ? path[path.length - 1] : darkCell(map, g.x, g.z, 8, 24, from.x, from.z);
  setMode(g, 'flee');
  g.path = path;
  g.pi = 0;
  g.repathT = path.length ? 99 : 0; // le chemin de la fuite est gardé jusqu'au bout
  g.goal = spot || { x: g.x, z: g.z };
  g.fearT = rand(4, 7);
  g.cool = Math.max(g.cool, 2.5);
  g.target = null;
  sim.emit({ type: 'goat', act: 'flee', id: g.id, x: g.x, z: g.z });
}

// le bouc ébouillanté : il hurle et file à la bergerie, la lumière lui refait peur un moment
function scald(sim, map, g) {
  setMode(g, 'flee');
  const den = (map.goatSpawn && map.goatSpawn[0]) || map.monsterSpawn;
  g.goal = { x: den.x, z: den.z };
  g.path = [];
  g.pi = 0;
  g.fearT = 12;
  g.tameT = ALPHA_TAME;
  g.rage = false;
  g.cool = 6;
  g.target = null;
  g.speed = 0;
  sim.emit({ type: 'goat', act: 'scald', id: g.id, x: g.x, z: g.z });
}

// Proximité du troupeau pour chaque joueur (son, image) : la chèvre la plus proche, plus inquiétante quand elle
// traque ou qu'elle charge. L'entité du moteur (sim.monster) sert de relais pour le son et l'image.
export function senseGoats(sim) {
  const M = sim.monster;
  const goats = sim.goats || [];
  for (const P of sim.players) {
    let best = null;
    let bestD = Infinity;
    for (const g of goats) {
      const d = Math.hypot(g.x - P.x, g.z - P.z);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    P.mDist = bestD;
    if (!best) {
      P.danger = 0;
      continue;
    }
    const k = best.mode === 'charge' || best.mode === 'windup' ? 1 : best.mode === 'stalk' || best.mode === 'lurk' ? 0.7 : 0.4;
    const ratio = 1 - Math.min(1, Math.max(0, (bestD - 1) / 28));
    P.danger = bestD > 30 ? 0 : Math.pow(ratio, 1.6) * k;
    let diff = Math.atan2(best.x - P.x, best.z - P.z) - (P.yaw - Math.PI);
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    P.pan = Math.max(-0.9, Math.min(0.9, Math.sin(diff)));
    P.goat = best;
  }
  const view = sim.viewPlayer(sim.spectate || 0);
  const g = view.goat;
  M.floor = 0;
  if (g) {
    M.x = g.x;
    M.z = g.z;
    M.yaw = g.yaw;
  }
  M.mode = goats.some((q) => (q.mode === 'charge' || q.mode === 'windup') && Math.hypot(q.x - view.x, q.z - view.z) < 20) ? 'chase' : 'patrol';
  M.silent = false;
  M.danger = view.danger || 0;
  M.pan = view.pan || 0;
}

export function updateGoats(sim) {
  const map = sim.map;
  const goats = sim.goats;
  if (!goats || !goats.length || sim.freezeGoats) return; // freezeGoats : figées (captures du mode debug)
  const lit = litCells(map);
  const A = sim.aggro;
  const rage = sim.rage;
  // les joueurs cachés dans un casier n'existent pas pour le troupeau
  const alive = sim.players.filter((P) => P.status === 'alive' && !(P.hidden >= 0));
  const herd = sim.herd || (sim.herd = { goal: null, t: 0 });

  // le troupeau va paître d'un coin sombre à l'autre, de plus en plus souvent près des joueurs
  herd.t -= DT;
  if (!herd.goal || herd.t <= 0) {
    const P = alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
    const near = P && Math.random() < 0.4 + A * 0.5 + rage * 0.3;
    herd.goal = (near ? darkCell(map, P.x, P.z, 8, 26) : null) || darkCell(map, map.W * C * Math.random(), map.H * C * Math.random(), 0, 60) || herd.goal;
    herd.t = rand(14, 26) * (1 - A * 0.4);
  }

  // le noir total : elles savent où sont les joueurs, et elles y vont toutes
  const hunt = sim.blackout > 0 && map.dark;
  if (hunt && !herd.hunt) {
    herd.hunt = true;
    for (const g of goats) g.cool = Math.min(g.cool, rand(0.4, 2));
  } else if (!hunt) herd.hunt = false;

  for (const g of goats) {
    if (hunt && g.fearT <= 0 && alive.length && ['roam', 'stalk', 'lurk'].includes(g.mode)) {
      let near = null;
      for (const P of alive) if ((P.floor || 0) === 0 && (!near || Math.hypot(P.x - g.x, P.z - g.z) < Math.hypot(near.x - g.x, near.z - g.z))) near = P;
      if (near) {
        if (g.mode !== 'stalk') setMode(g, 'stalk');
        g.target = near.id;
        g.seenT = 0;
      }
    }
    g.cool = Math.max(0, g.cool - DT);
    g.fearT = Math.max(0, g.fearT - DT);
    if (g.alpha) g.tameT = Math.max(0, (g.tameT || 0) - DT);
    const brave = bold(sim, g);
    if (brave && !g.rage) {
      // le bouc n'a plus peur : sa cloche et son cri dans toutes les galeries
      g.rage = true;
      sim.emit({ type: 'goat', act: 'rage', id: g.id, x: g.x, z: g.z });
    }
    g.bleatT -= DT;
    g.t -= DT;

    // 1. La lumière : le faisceau d'une lampe la fait détaler (en pleine charge, il lui faut un court instant)
    const beam = brave || g.mode === 'stun' || g.mode === 'flee' ? null : beamOn(sim, map, g);
    if (beam) {
      g.litT += DT;
      if (g.litT > (g.mode === 'charge' ? 0.15 : 0.06)) flee(sim, map, g, beam);
    } else g.litT = 0;

    // 2. Ce qu'elle perçoit : le joueur le plus proche qu'elle voit (la lampe se voit de loin) ou entend courir
    let T = null;
    let td = Infinity;
    for (const P of alive) {
      if ((P.floor || 0) !== 0) continue;
      const d = Math.hypot(P.x - g.x, P.z - g.z);
      if (d > 26) continue;
      const los = hasLineOfSight(map, g.x, g.z, P.x, P.z);
      // une lampe allumée, ou un joueur debout sous une lampe, se voit de loin
      const seen = los && d < (P.flashlight ? 24 : isLit(map, P.x, P.z) ? 20 : 11 + A * 4);
      const heard = (P.running && d < 13 + A * 4) || (P.moving && d < 4.5);
      if (!seen && !heard) continue;
      const sc = d - (g.target === P.id ? 5 : 0);
      if (sc < td) {
        td = sc;
        T = P;
      }
    }
    if (T && g.fearT <= 0 && (g.mode === 'roam' || g.mode === 'stalk' || g.mode === 'lurk')) {
      if (g.mode === 'roam') {
        setMode(g, 'stalk');
        if (!(g.spotT > sim.time)) {
          sim.emit({ type: 'goat', act: 'spot', id: g.id, x: g.x, z: g.z });
          g.spotT = sim.time + 6;
          g.bleatT = rand(6, 12);
        }
        // elle appelle les autres : celles qui l'entendent la rejoignent
        for (const o of goats) {
          if (o !== g && o.mode === 'roam' && o.fearT <= 0 && Math.hypot(o.x - g.x, o.z - g.z) < 28) {
            setMode(o, 'stalk');
            o.target = T.id;
            o.seenT = 0;
          }
        }
      }
      g.target = T.id;
      g.seenT = 0;
    } else g.seenT += DT;
    const tgt = g.target !== null ? alive.find((P) => P.id === g.target) : null;
    if ((g.mode === 'stalk' || g.mode === 'lurk') && ((g.target !== null && !tgt) || g.seenT > 7 + A * 4)) {
      setMode(g, 'roam');
      g.target = null;
    }

    // 3. Les états
    const dist = tgt ? Math.hypot(tgt.x - g.x, tgt.z - g.z) : Infinity;
    const busy = goats.filter((o) => o !== g && o.target === g.target && (o.mode === 'windup' || o.mode === 'charge')).length;
    if ((g.mode === 'stalk' || g.mode === 'lurk') && tgt && g.cool <= 0 && g.fearT <= 0 && busy < 2 && dist > 1.0 && dist < 14 + A * 3 && (brave || !isLit(map, tgt.x, tgt.z)) && hasLineOfSight(map, g.x, g.z, tgt.x, tgt.z)) {
      // à portée, dans le noir, et personne ne la gêne : elle s'arrête, baisse la tête et gratte le sol
      setMode(g, 'windup');
      g.t = WINDUP_T + Math.random() * 0.35 - A * 0.2;
      g.path = [];
      sim.emit({ type: 'goat', act: 'windup', id: g.id, x: g.x, z: g.z, target: tgt.id });
    }

    let speed = 0;
    let follow = false;
    let goalX = g.x;
    let goalZ = g.z;
    const k = (1 + rage * 0.3) * (0.92 + A * 0.16);
    if (g.mode === 'roam') {
      // vers le pâturage du troupeau, chacune un peu à côté des autres ; arrivée, elle broute
      const gl = herd.goal;
      if (gl) {
        goalX = gl.x + Math.cos(g.id * 2.4) * 1.6;
        goalZ = gl.z + Math.sin(g.id * 2.4) * 1.6;
        follow = Math.hypot(goalX - g.x, goalZ - g.z) > 1.4;
      }
      speed = GOAT_ROAM * k;
    } else if (g.mode === 'stalk' || g.mode === 'lurk') {
      // vers sa cible par le noir ; si elle est à l'abri de la lumière, au bord de l'ombre, et elle attend
      goalX = tgt ? tgt.x : g.goal ? g.goal.x : g.x;
      goalZ = tgt ? tgt.z : g.goal ? g.goal.z : g.z;
      follow = true;
      speed = GOAT_STALK * k;
      if (!tgt && g.goal && Math.hypot(g.goal.x - g.x, g.goal.z - g.z) < 1.5) {
        setMode(g, 'roam');
        g.goal = null;
      }
    } else if (g.mode === 'windup') {
      if (tgt) g.yaw = Math.atan2(tgt.x - g.x, tgt.z - g.z);
      if (g.t <= 0) {
        if (!tgt) setMode(g, 'stalk');
        else {
          // la charge part droit sur la cible (là où elle sera dans un instant)
          const lead = tgt.moving ? (tgt.running ? 0.35 : 0.2) : 0;
          const ax = tgt.x - Math.sin(tgt.yaw) * lead * 3 - g.x;
          const az = tgt.z - Math.cos(tgt.yaw) * lead * 3 - g.z;
          const l = Math.hypot(ax, az) || 1;
          g.dirX = ax / l;
          g.dirZ = az / l;
          g.run = 0;
          g.maxRun = dist + 5;
          g.speed = 3;
          setMode(g, 'charge');
          sim.emit({ type: 'goat', act: 'charge', id: g.id, x: g.x, z: g.z, target: tgt.id });
        }
      }
    } else if (g.mode === 'charge') {
      // elle tourne à peine (on l'évite d'un pas de côté), accélère, et ne s'arrête qu'au mur ou au bord de la lumière
      if (tgt && dist > 1.5) {
        const want = Math.atan2(tgt.x - g.x, tgt.z - g.z);
        let cur = Math.atan2(g.dirX, g.dirZ);
        let dd = want - cur;
        while (dd > Math.PI) dd -= 2 * Math.PI;
        while (dd < -Math.PI) dd += 2 * Math.PI;
        cur += Math.max(-0.7 * DT, Math.min(0.7 * DT, dd));
        g.dirX = Math.sin(cur);
        g.dirZ = Math.cos(cur);
      }
      g.speed = Math.min(GOAT_CHARGE * k, g.speed + DT * 14);
      const step = g.speed * DT;
      const nx = g.x + g.dirX * step;
      const nz = g.z + g.dirZ * step;
      g.yaw = Math.atan2(g.dirX, g.dirZ);
      if (!brave && isLit(map, nx + g.dirX * 0.4, nz + g.dirZ * 0.4)) {
        // la lumière devant : elle pile net, au bord de l'ombre
        setMode(g, 'lurk');
        g.cool = rand(2, 3.5);
      } else if (sim.steamAt(nx, nz)) {
        // la vapeur la brûle : elle fait demi-tour en criant ; le bouc, lui, file à la bergerie
        if (g.alpha) scald(sim, map, g);
        else flee(sim, map, g, { x: nx + g.dirX * 4, z: nz + g.dirZ * 4 });
      } else {
        const p = sim.moveWithCollisions(g.x, g.z, g.dirX * step, g.dirZ * step, GOAT_R, 0);
        const moved = Math.hypot(p.x - g.x, p.z - g.z);
        g.x = p.x;
        g.z = p.z;
        g.run += moved;
        if (moved < step * 0.45) {
          // contre un mur (ou une caisse) : sonnée
          setMode(g, 'stun');
          g.t = STUN_T;
          g.speed = 0;
          sim.emit({ type: 'goat', act: 'crash', id: g.id, x: g.x, z: g.z });
        } else if (g.run > g.maxRun) {
          setMode(g, 'stalk');
          g.cool = rand(2.2, 3.5) * (1 - A * 0.3);
        }
      }
      // elle percute un joueur
      // elle percute un joueur (un seul par charge) : le premier coup le renverse, le second est mortel (le bouc tue
      // d'un coup en difficile)
      for (const P of alive) {
        if (P.status !== 'alive' || (P.floor || 0) !== 0 || P.hurtT > 0) continue;
        if (Math.hypot(P.x - g.x, P.z - g.z) > HIT_R * (g.alpha ? 1.15 : 1)) continue;
        if ((P.hurt || 0) >= 1 || (g.alpha && sim.difficulty === 'hard')) sim.killPlayer(P, { x: g.x, z: g.z, goat: true });
        else {
          P.hurt = (P.hurt || 0) + 1;
          P.hurtT = 3;
          P.lockT = 1.4;
          P.running = false;
          // projeté dans le sens de la charge
          const p = sim.moveWithCollisions(P.x, P.z, g.dirX * 1.2, g.dirZ * 1.2, 0.38, 0);
          P.x = p.x;
          P.z = p.z;
          sim.emit({ type: 'hurt', id: P.id, name: P.name, x: g.x, z: g.z, goat: true });
        }
        setMode(g, 'stalk');
        g.target = null;
        g.cool = 4;
        break;
      }
    } else if (g.mode === 'stun') {
      if (g.t <= 0) {
        setMode(g, 'stalk');
        g.cool = 1.5;
      }
    } else if (g.mode === 'flee') {
      goalX = g.goal ? g.goal.x : g.x;
      goalZ = g.goal ? g.goal.z : g.z;
      follow = true;
      speed = GOAT_FLEE;
      // arrivée, ou au bout de son chemin une fois la peur passée
      if (Math.hypot(goalX - g.x, goalZ - g.z) < 1.2 || (g.fearT <= 0 && g.path.length && !g.path[g.pi])) {
        setMode(g, 'roam');
        g.goal = null;
      }
    }

    // 4. Suivre son chemin par le noir (recalculé de temps en temps)
    if (follow) {
      g.repathT -= DT;
      if (g.repathT <= 0) {
        g.repathT = g.mode === 'stalk' ? 0.5 : g.mode === 'flee' ? 99 : 1.5;
        const r = darkPath(sim, map, g.x, g.z, goalX, goalZ, 900, brave);
        g.path = r.path;
        g.pi = 0;
        // le but est dans le noir, mais des lampes l'en séparent : au bout d'un moment, elle passe par les gaines
        const goalDark = brave || !isLit(map, goalX, goalZ);
        g.stuckT = !r.reached && goalDark ? g.stuckT + g.repathT : 0;
        if (g.stuckT > (g.mode === 'roam' ? 4 : 2.5) && ventTravel(sim, map, g, goalX, goalZ, g.mode === 'roam' ? 0 : 9, g.mode === 'roam' ? 8 : 18)) continue;
        // sa cible est à l'abri de la lumière : elle attend au bord de l'ombre
        if (g.mode === 'stalk' && tgt && !r.reached && !goalDark) g.lurkAt = r.path.length ? r.path[r.path.length - 1] : { x: g.x, z: g.z };
        else g.lurkAt = null;
      }
      const wp = g.path[g.pi];
      const gx = wp ? wp.x : goalX;
      const gz = wp ? wp.z : goalZ;
      const dx = gx - g.x;
      const dz = gz - g.z;
      const d = Math.hypot(dx, dz);
      if (wp && d < 0.3) g.pi++;
      else if (d > 0.05 && (wp || (cellOf(gx) === cellOf(g.x) && cellOf(gz) === cellOf(g.z)))) {
        const step = Math.min(d, speed * DT);
        const nx = g.x + (dx / d) * step;
        const nz = g.z + (dz / d) * step;
        // pas dans un jet de vapeur qui crache, ni sous une lampe allumée
        if (!(sim.steamAt(nx, nz) && !sim.steamAt(g.x, g.z)) && (brave || !(isLit(map, nx, nz) && !isLit(map, g.x, g.z)))) {
          g.x = nx;
          g.z = nz;
          g.yaw = Math.atan2(dx, dz);
        }
      }
      if (g.mode === 'stalk' && g.lurkAt && !g.path[g.pi]) setMode(g, 'lurk');
    }
    if (g.mode === 'lurk') {
      // au bord de l'ombre : immobile, elle fixe sa cible ; si la cible ressort dans le noir, elle reprend la traque
      if (tgt) g.yaw = Math.atan2(tgt.x - g.x, tgt.z - g.z);
      g.repathT -= DT;
      if (g.repathT <= 0) {
        g.repathT = 0.8;
        if (!tgt || brave || !isLit(map, tgt.x, tgt.z)) setMode(g, 'stalk');
      }
    }
    if (g.mode === 'roam' && g.bleatT <= 0) {
      g.bleatT = rand(8, 20);
      sim.emit({ type: 'goat', act: 'bleat', id: g.id, x: g.x, z: g.z });
    }
  }

  // elles ne se marchent pas dessus
  for (let i = 0; i < goats.length; i++) {
    for (let j = i + 1; j < goats.length; j++) {
      const a = goats[i];
      const b = goats[j];
      if (a.mode === 'charge' || b.mode === 'charge') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.9 || d < 1e-4) continue;
      const push = (0.9 - d) * 0.5;
      const ax = a.x - (dx / d) * push;
      const az = a.z - (dz / d) * push;
      const bx = b.x + (dx / d) * push;
      const bz = b.z + (dz / d) * push;
      if (!sim.isColliding(ax, az, 0.2, 0)) {
        a.x = ax;
        a.z = az;
      }
      if (!sim.isColliding(bx, bz, 0.2, 0)) {
        b.x = bx;
        b.z = bz;
      }
    }
  }
}

// instantané : [x, z, cap, état] par chèvre
export function goatSnapshot(goats) {
  const r2 = (v) => Math.round(v * 100) / 100;
  return (goats || []).map((g) => [r2(g.x), r2(g.z), r2(g.yaw), GOAT_MODES.indexOf(g.mode), g.rage ? 1 : g.tameT > 0 ? 2 : 0]);
}

export function applyGoatSnapshot(sim, rows) {
  if (!rows) return;
  if (!sim.goats || sim.goats.length !== rows.length) sim.goats = createGoats(sim.map, rows.length);
  rows.forEach(([x, z, yaw, m, a], i) => {
    const g = sim.goats[i];
    g.rage = a === 1;
    g.tameT = a === 2 ? 1 : 0;
    g.x = x;
    g.z = z;
    g.yaw = yaw;
    g.mode = GOAT_MODES[m] || 'roam';
  });
}
