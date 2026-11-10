// The Backrooms - Le directeur de tension (sans DOM). Il mesure la peur des joueurs et règle le rythme de la partie :
//   montée (build) : l'entité rôde, se rapproche peu à peu ; de fausses alertes de temps en temps (un bourdonnement
//                    sans rien derrière, des pas, une porte, un coéquipier qui siffle… alors qu'il est loin) ;
//   pic (peak)     : une poursuite, une prise ; rien d'autre ne s'ajoute ;
//   relâche (relax): après un pic, l'entité s'éloigne et se tait 30 à 60 s : c'est son absence qui rend son retour
//                    terrible. Les coupures de courant n'arrivent qu'après un vrai moment de calme, jamais en poursuite.
// Une fois par niveau, avec un peu de chance, un événement rare : l'ascenseur qui sonne alors que personne n'y est,
// une silhouette au bout du couloir, les néons qui s'éteignent un à un jusqu'à soi.
import { CELL_SIZE } from './map.js';
import { hasLineOfSight } from './nav.js';

const DT = 1 / 60;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const RELAX_T = [30, 60]; // secondes de répit après un pic
export const FAKE_EVERY = [28, 55]; // une fausse alerte de temps en temps, pendant la montée
export const CALM_BEFORE_BLACKOUT = 10; // secondes de calme avant qu'une coupure puisse tomber
export const RARE_CHANCE = 0.4; // chance d'un événement rare par niveau
const L0_AGGRO = 0.8; // Level 0 : l'entité moins agressive (même valeur que dans sim.js) : répits et traques plus espacés

export function createDirector(level) {
  return {
    level,
    stress: 0, // 0 à 1 : la peur de l'équipe (la plus forte)
    phase: 'build', // 'build' | 'peak' | 'relax'
    relaxT: 0,
    calmT: 0, // secondes depuis que tout est calme
    fakeT: rand(...FAKE_EVERY) * 0.8,
    rareAt: Math.random() < RARE_CHANCE ? rand(70, 200) : Infinity, // l'événement rare, ce niveau-ci
    rareDone: false,
    t: 0,
    drops: [], // néons éteints un instant : [{ l, t, back }]
    // Level 0 : de temps en temps, les néons meurent un à un jusqu'à soi… et quand ils reviennent, elle arrive
    huntT: level === 0 ? rand(85, 130) / L0_AGGRO : Infinity,
  };
}

// la peur d'un joueur : l'entité proche, traqué, agrippé, assoiffé
function playerStress(sim, P) {
  const M = sim.monster;
  let s = (P.danger || 0) * 0.65;
  if (M && M.mode === 'chase' && M.target === P.id) s += 0.45;
  if (P.grabT > 0) s += 1;
  if ((P.water ?? 100) < 20) s += 0.1;
  if (sim.goats) for (const g of sim.goats) if (g.target === P.id && (g.mode === 'charge' || g.mode === 'windup')) s += 0.5;
  return Math.min(1, s);
}

export function updateDirector(sim) {
  const D = sim.director;
  if (!D) return;
  D.t += DT;
  const alive = sim.players.filter((P) => P.status === 'alive');
  let s = 0;
  for (const P of alive) s = Math.max(s, playerStress(sim, P));
  // la peur monte vite et redescend lentement (une douzaine de secondes)
  D.stress += (s - D.stress) * Math.min(1, (s > D.stress ? 2.5 : 0.085) * DT * 6);
  D.calmT = D.stress < 0.25 ? D.calmT + DT : 0;
  const M = sim.monster;
  const chasing = (M && (M.mode === 'chase' || M.mode === 'grab')) || alive.some((P) => P.grabT > 0);

  if (D.phase === 'build' && D.stress > 0.65) D.phase = 'peak';
  else if (D.phase === 'peak' && D.stress < 0.35 && !chasing) {
    D.phase = 'relax';
    D.relaxT = (rand(...RELAX_T) * (sim.difficulty === 'hard' ? 0.65 : 1)) / (D.level === 0 ? L0_AGGRO : 1);
    sim.emit({ type: 'relief' });
  } else if (D.phase === 'relax') {
    D.relaxT -= DT;
    if (D.relaxT <= 0) D.phase = 'build';
  }

  // les néons éteints un instant reviennent
  for (let i = D.drops.length - 1; i >= 0; i--) {
    const d = D.drops[i];
    d.t -= DT;
    if (d.t > 0) continue;
    d.l.state = d.back;
    d.l.flicker = d.back === 'flicker';
    D.drops.splice(i, 1);
    lightsChanged(d.map || sim.map);
  }

  // le prélude (Level 0, avant la première cassette) : rien que l'apparition mise en scène
  if (!alive.length || sim.state !== 'playing' || sim.departT > 0 || sim.prelude) return;

  // fausses alertes : seulement pendant la montée, quand on respire
  if (D.phase === 'build' && D.stress < 0.4) {
    D.fakeT -= DT;
    if (D.fakeT <= 0) {
      D.fakeT = rand(...FAKE_EVERY) * (sim.difficulty === 'hard' ? 0.8 : 1);
      fakeAlarm(sim, pick(alive));
    }
  }

  // Level 0 : la traque annoncée. Les néons s'éteignent un à un vers le joueur ; au dernier, elle est lâchée depuis
  // le fond du couloir, là où le premier est mort
  if (D.level === 0 && sim.hasMonster && M && D.phase === 'build' && D.stress < 0.3 && !sim.lightsOut && !(sim.blackout > 0) && M.mode === 'patrol' && !M.glimpse && !(M.dormantT > 0)) {
    D.huntT -= DT;
    if (D.huntT <= 0) {
      D.huntT = (rand(100, 160) * (1.2 - (sim.skill ?? 0.5) * 0.4)) / L0_AGGRO;
      // de préférence celui qui s'est isolé
      const lone = alive.slice().sort((a, b) => isolation(sim, b) - isolation(sim, a))[0];
      if (!sim.calmAt || !sim.calmAt(lone)) lightsDie(sim, lone, true);
    }
  }

  // l'événement rare du niveau
  if (!D.rareDone && D.t > D.rareAt && D.phase === 'build' && D.stress < 0.3) {
    D.rareDone = true;
    rareEvent(sim, pick(alive));
  }
}

// une coupure de courant peut-elle tomber maintenant ?
export function blackoutAllowed(sim) {
  const D = sim.director;
  if (!D) return true;
  const M = sim.monster;
  if (M && (M.mode === 'chase' || M.mode === 'grab')) return false;
  return D.phase === 'build' && D.calmT > CALM_BEFORE_BLACKOUT;
}

// l'entité doit-elle garder ses distances ? (répit après un pic, ou les premières minutes)
export function entityRelaxed(sim) {
  const D = sim.director;
  return !!D && D.phase === 'relax';
}

export function lightsChanged(map) {
  map.goatLit = null;
  map.darkCells = null;
  map.brightCells = null;
  map.lightGen = (map.lightGen || 0) + 1;
}

// une case libre au hasard entre rMin et rMax du joueur (à son étage), hors de sa vue si possible
function spotAround(sim, P, rMin, rMax, hidden = true) {
  const map = sim.fm(P.floor);
  const list = map.walkable || [];
  let best = null;
  for (let i = 0; i < 40 && list.length; i++) {
    const c = pick(list);
    const x = (c.x + 0.5) * CELL_SIZE;
    const z = (c.z + 0.5) * CELL_SIZE;
    const d = Math.hypot(x - P.x, z - P.z);
    if (d < rMin || d > rMax) continue;
    if (map.pitAt && map.pitAt(c.x, c.z) >= 0) continue;
    best = { x, z, floor: P.floor || 0 };
    if (!hidden || !hasLineOfSight(map, x, z, P.x, P.z)) break;
  }
  return best;
}

// Une fausse alerte : un son sans rien derrière (sauf le néon qui saute vraiment, au Level 2)
function fakeAlarm(sim, P) {
  const lv = sim.level;
  const pipes = !!sim.goats || (sim.map.valves || []).length > 0;
  // Level 0 : aussi l'écho (des pas qui s'arrêtent quand on s'arrête), une silhouette qui s'efface, l'ascenseur qui
  // sonne tout seul
  const kinds = pipes ? ['hammer', 'groan', 'knock', 'steps', 'neon', 'neon'] : lv === 1 ? ['buzz', 'steps', 'door', 'knock', 'groan', 'neon'] : lv === 2 ? ['steps', 'knock', 'drag'] : ['steps', 'door', 'drag', 'neon', 'echo', 'echo', 'figure', 'ding', 'row', 'row', 'surge', 'surge'];
  // à plusieurs, l'entité imite parfois le sifflet d'un coéquipier… qui est ailleurs
  const mates = sim.players.filter((Q) => Q !== P && Q.status === 'alive');
  if (mates.length && sim.hasMonster && !sim.goats && Math.random() < 0.25) {
    const spot = spotAround(sim, P, 14, 30);
    const Q = pick(mates);
    if (spot) {
      sim.emit({ type: 'phantom', kind: 'whistle', x: spot.x, z: spot.z, floor: spot.floor, name: Q.name, id: P.id });
      return;
    }
  }
  let kind = pick(kinds);
  // pendant la panne, ou l'alarme rouge de la fin du Level 0, les néons ne sont plus les siens
  if ((sim.blackout > 0 || (lv === 0 && sim.open)) && (kind === 'neon' || kind === 'row' || kind === 'surge')) kind = 'steps';
  if (kind === 'neon') {
    if (neonDrop(sim, P)) return;
  }
  // des néons vivants : toute une rangée s'éteint d'un coup dans ton dos, ou un tube s'emballe et bourdonne fort
  if (kind === 'row' && rowBehind(sim, P)) return;
  if (kind === 'surge' && neonSurge(sim, P)) return;
  if (kind === 'echo') {
    // seul celui qui est visé l'entend : quelqu'un marche derrière lui, à son rythme, et s'arrête quand il s'arrête
    sim.emit({ type: 'phantom', kind: 'echo', id: P.id, len: rand(7, 11) });
    return;
  }
  if (kind === 'figure' && figureAhead(sim, P)) return;
  if (kind === 'ding') {
    const E = sim.fm(P.floor).exit;
    if (E) {
      sim.emit({ type: 'rare', kind: 'ding', x: E.x, z: E.z, floor: P.floor || 0 });
      return;
    }
  }
  const spot = spotAround(sim, P, 16, 38);
  const k = kind === 'neon' || kind === 'figure' || kind === 'ding' ? 'knock' : kind;
  if (spot) sim.emit({ type: 'phantom', kind: k, x: spot.x, z: spot.z, floor: spot.floor });
}

// un néon allumé près du joueur claque et s'éteint quelques secondes (au Level 2, la protection disparaît vraiment)
function neonDrop(sim, P) {
  const map = sim.fm(P.floor);
  const D = sim.director;
  const lit = (map.lights || []).filter((l) => l.state === 'on' && !D.drops.some((d) => d.l === l) && Math.hypot(l.x - P.x, l.z - P.z) < 16 && Math.hypot(l.x - P.x, l.z - P.z) > 4 && !(l.sector === -1 && sim.goats));
  if (!lit.length) return false;
  const l = pick(lit);
  D.drops.push({ l, t: rand(2.5, 5), back: l.state, map });
  l.state = 'off';
  l.flicker = false;
  lightsChanged(map);
  sim.emit({ type: 'phantom', kind: 'neon', x: l.x, z: l.z, floor: P.floor || 0 });
  return true;
}

// Une rangée de néons s'éteint d'un seul coup dans le dos du joueur (le claquement le fait se retourner) et ne revient
// qu'au bout de 8 à 14 s : le couloir d'où il vient est devenu noir
function rowBehind(sim, P) {
  const map = sim.fm(P.floor);
  const D = sim.director;
  const fx = -Math.sin(P.yaw);
  const fz = -Math.cos(P.yaw);
  const behind = (map.lights || []).filter((l) => {
    if (l.state !== 'on' || D.drops.some((d) => d.l === l)) return false;
    const dx = l.x - P.x;
    const dz = l.z - P.z;
    const d = Math.hypot(dx, dz);
    return d > 3 && d < 22 && (dx * fx + dz * fz) / d < -0.45;
  });
  if (behind.length < 2) return false;
  // la rangée : les néons alignés avec le plus proche (même ligne ou même colonne de cases)
  behind.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  const a = behind[0];
  const row = behind.filter((l) => l.gx === a.gx || l.gz === a.gz).slice(0, 6);
  const list = row.length >= 2 ? row : behind.slice(0, 4);
  const t = rand(8, 14);
  for (const l of list) {
    D.drops.push({ l, t, back: l.state, map });
    l.state = 'off';
    l.flicker = false;
  }
  lightsChanged(map);
  sim.emit({ type: 'phantom', kind: 'row', x: a.x, z: a.z, floor: P.floor || 0, n: list.length });
  return true;
}

// Un néon proche s'emballe : il grésille, clignote et bourdonne beaucoup plus fort quelques secondes
function neonSurge(sim, P) {
  const map = sim.fm(P.floor);
  const D = sim.director;
  const lit = (map.lights || []).filter((l) => l.state === 'on' && !D.drops.some((d) => d.l === l) && Math.hypot(l.x - P.x, l.z - P.z) < 9);
  if (!lit.length) return false;
  const l = pick(lit);
  D.drops.push({ l, t: rand(4, 7), back: l.state, map });
  l.state = 'flicker';
  l.flicker = true;
  lightsChanged(map);
  sim.emit({ type: 'phantom', kind: 'surge', x: l.x, z: l.z, floor: P.floor || 0 });
  return true;
}

// Un événement rare, une fois par niveau au plus
function rareEvent(sim, P) {
  const map = sim.fm(P.floor);
  const options = ['ding', 'figure', 'lightsOut'];
  const kind = pick(sim.level === 2 ? ['ding', 'figure'] : options);
  if (kind === 'ding') {
    // l'ascenseur sonne alors qu'il n'y a personne… et que la sortie n'est pas encore ouverte
    const E = map.exit || P;
    sim.emit({ type: 'rare', kind: 'ding', x: E.x, z: E.z, floor: P.floor || 0 });
    return;
  }
  if (kind === 'figure') {
    if (figureAhead(sim, P)) return;
    sim.emit({ type: 'rare', kind: 'ding', x: (map.exit || P).x, z: (map.exit || P).z, floor: P.floor || 0 });
    return;
  }
  if (!lightsDie(sim, P, false)) sim.emit({ type: 'rare', kind: 'ding', x: (map.exit || P).x, z: (map.exit || P).z, floor: P.floor || 0 });
}

// une silhouette immobile au bout du couloir, droit devant, qui n'est plus là quand on y regarde de trop près
function figureAhead(sim, P) {
  const map = sim.fm(P.floor);
  const fx = -Math.sin(P.yaw);
  const fz = -Math.cos(P.yaw);
  for (let d = 26; d >= 12; d -= 2) {
    const x = P.x + fx * d;
    const z = P.z + fz * d;
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    if (map.isWall(gx, gz) || !hasLineOfSight(map, P.x, P.z, x, z)) continue;
    sim.emit({ type: 'rare', kind: 'figure', x: (gx + 0.5) * CELL_SIZE, z: (gz + 0.5) * CELL_SIZE, floor: P.floor || 0, id: P.id });
    return true;
  }
  return false;
}

// à quelle distance du coéquipier le plus proche (Infinity seul)
function isolation(sim, P) {
  let m = Infinity;
  for (const Q of sim.players) if (Q !== P && Q.status === 'alive' && (Q.floor || 0) === (P.floor || 0)) m = Math.min(m, Math.hypot(Q.x - P.x, Q.z - P.z));
  return m === Infinity ? 0 : m;
}

// les néons s'éteignent un à un, du plus loin jusqu'au-dessus du joueur, puis se rallument d'un coup. hunt : quand le
// dernier meurt, l'entité est lâchée depuis le fond (sim.huntFrom)
function lightsDie(sim, P, hunt) {
  const map = sim.fm(P.floor);
  const lights = (map.lights || []).filter((l) => l.state === 'on' && Math.hypot(l.x - P.x, l.z - P.z) < 24).sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z));
  if (lights.length < 3) return false;
  const D = sim.director;
  const n = Math.min(8, lights.length);
  // chaque néon s'éteint à son tour (updateLightsOut) ; tous reviennent ensemble ~4 s après le dernier
  for (let i = 0; i < n; i++) D.drops.push({ l: lights[i], t: 4.5 + n * 0.45, back: 'on', map });
  sim.lightsOut = { list: lights.slice(0, n), t: 0, n, hunt, id: P.id, floor: P.floor || 0 };
  sim.emit({ type: 'rare', kind: 'lightsOut', x: P.x, z: P.z, floor: P.floor || 0, hunt });
  return true;
}

// la séquence des néons qui s'éteignent un à un (appelée à chaque pas)
export function updateLightsOut(sim) {
  const S = sim.lightsOut;
  if (!S) return;
  S.t += DT;
  const k = Math.min(S.n, Math.floor(S.t / 0.45) + 1);
  let changed = false;
  for (let i = 0; i < k; i++) {
    const l = S.list[i];
    if (l.state !== 'off') {
      l.state = 'off';
      l.flicker = false;
      changed = true;
    }
  }
  if (changed) {
    lightsChanged(sim.fm ? sim.fm(S.floor || 0) : sim.map);
    sim.emit({ type: 'phantom', kind: 'neon', x: S.list[k - 1].x, z: S.list[k - 1].z, floor: S.floor || 0, quiet: true });
  }
  if (k >= S.n) {
    sim.lightsOut = null;
    if (S.hunt && sim.huntFrom) sim.huntFrom(S);
  }
}
