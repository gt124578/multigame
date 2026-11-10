// Banc d'essai de l'entité des Backrooms : node tools/bench-backrooms.mjs [joueurs] [niveau] [graine] [minutes]
// Des bots jouent des parties entières hors navigateur : ils explorent, vont chercher les cassettes, montent et
// descendent l'escalier, sautent dans les trous, fuient quand elle les poursuit, se retournent, la fixent parfois,
// se débattent quand elle les tient. On relève chaque mouvement incohérent de l'entité :
//   teleport_vue   : elle saute d'un coup (plus loin qu'un pas, ou d'un étage) alors qu'un joueur la voit vraiment
//                    (dans son champ, rien entre eux, et de la lumière sur elle : un néon, sa lampe, ou tout près).
//                    À part, pour information : les sauts dans le noir complet (néons coupés, lampes qui vacillent)
//   survitesse     : elle avance plus vite que sa vitesse
//   dans_mur       : elle est dans un mur, dans la cage d'escalier (hors des marches) ou dans un meuble
//   sur_trou       : elle flotte au-dessus d'un trou
//   demi_tour_vu   : elle pivote d'un coup (plus de 20° en une image) sous les yeux d'un joueur
//   reculons       : elle se déplace de côté ou à reculons (plus de 75° entre son regard et sa marche), vue (sauf
//                    quand elle titube en arrière, repoussée par un joueur qui s'est dégagé)
//   pietine       : elle devrait marcher mais n'avance plus depuis une seconde
//   plantee        : en chasse, à moins de 9 m de sa proie qui la voit, elle ne bouge plus depuis une seconde
//   plantee_vue    : hors poursuite, immobile (ni pas, ni demi-tour) dans le champ d'un joueur à moins de 22 m, plus de
//                    1,5 s : elle doit charger ou se glisser hors de vue, jamais rester plantée à le fixer
//   hesite         : trois demi-tours de marche en moins d'une seconde
//   a_coup         : un pas manqué (immobile une image entre deux pas)
//   etage_faux     : son étage ne correspond pas à là où elle est dans l'escalier
// Options (variables d'environnement) : PRELUDE=1 garde le prélude (absente jusqu'à la première cassette) ;
// VERBOSE=1 affiche chaque anomalie ; EX=n exemples par type (3 par défaut) ; DIFF=hard|normal.
import { BackroomsSim, DT, stairAt, stairLocal, PLAYER_RADIUS } from '../backrooms/engine/sim.js';
import { CELL_SIZE, PIT_HALF } from '../backrooms/engine/map.js';
import { hasLineOfSight } from '../backrooms/engine/nav.js';
import { clearAt, BODY_R } from '../backrooms/engine/gait.js';

const [nPlayers = 2, level = 0, seed0 = 1, minutes = 10] = process.argv.slice(2).map(Number);
const VERBOSE = !!process.env.VERBOSE;
const SLOW = Number(process.env.SLOW || 0);
const TRACE = process.env.TRACE ? process.env.TRACE.split(',').map(Number) : null; // TRACE=t0,t1 : chaque pas de l'entité entre t0 et t1 s
const EX = +(process.env.EX || 3);
const DIFF = process.env.DIFF || 'normal';
if (!process.env.PRELUDE) BackroomsSim.PRELUDE = false;
const C = CELL_SIZE;

// le hasard du jeu, rejouable : la même graine refait la même partie
let rs = 1;
const reseed = (s) => {
  rs = (Math.imul(s + 0x9e3779b9, 2654435761) >>> 0) || 1;
};
Math.random = () => {
  rs ^= rs << 13;
  rs >>>= 0;
  rs ^= rs >>> 17;
  rs ^= rs << 5;
  rs >>>= 0;
  return rs / 4294967296;
};

const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const cellOf = (v) => Math.floor(v / C);
// la direction de la marche d'un joueur (yaw) vers un point
const yawTo = (P, x, z) => Math.atan2(-(x - P.x), -(z - P.z));
// l'angle entre le regard d'un joueur et un point
const facing = (P, x, z) => Math.abs(ang(yawTo(P, x, z) - P.yaw));

// un point de l'escalier : u le long des volées, v en travers (en cases)
const stairPt = (st, u, v) => ({ x: st.ox + st.dx * u * C + st.px * v * C, z: st.oz + st.dz * u * C + st.pz * v * C });
const inStairs = (sim, x, z) => stairAt(sim.stairs, x, z);

// ce que voit un joueur : l'entité dans son champ de vision (100° de champ vertical en 16:9, et sa largeur), rien
// entre eux (le centre ou une épaule), ou tout près ; dans la même cage d'escalier, on se voit
function seesMonster(sim, Q, M) {
  if (Q.status !== 'alive' || Q.hidden >= 0 || M.away) return false;
  const d = Math.hypot(M.x - Q.x, M.z - Q.z);
  const sQ = inStairs(sim, Q.x, Q.z);
  const sM = inStairs(sim, M.x, M.z);
  // dans la même cage d'escalier, on se voit d'un étage à l'autre (par l'ouverture) ; mais pas dans son dos
  const cage = sQ && sM && sQ.st === sM.st;
  if (cage && d > 12) return false;
  if (!cage && (Q.floor || 0) !== (M.floor || 0)) return false;
  if (d < 2.5) return true;
  if (d > 50) return false;
  const half = Math.atan2(0.45, d);
  if (facing(Q, M.x, M.z) > 1.25 + half) return false;
  const map = sim.fm(M.floor || 0);
  const nx = -(M.z - Q.z) / d;
  const nz = (M.x - Q.x) / d;
  for (const s of [0, 0.4, -0.4]) if (hasLineOfSight(map, Q.x, Q.z, M.x + nx * s, M.z + nz * s)) return true;
  return false;
}

// ---------------------------------------------------------------- les bots
// un parcours en largeur sur les cases libres (ni mur, ni trou, ni cage d'escalier) de l'étage
function botPath(sim, floor, sx, sz, tx, tz) {
  const m = sim.fm(floor);
  const W = m.W;
  const H = m.H;
  const stairCells = new Set((sim.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
  const free = (x, z) => x >= 0 && z >= 0 && x < W && z < H && !m.isWall(x, z) && !(m.pitAt && m.pitAt(x, z) >= 0) && !stairCells.has(z * W + x) && !(m.pillarAt && m.pillarAt(x, z));
  const a = cellOf(sx);
  const b = cellOf(sz);
  const ta = cellOf(tx);
  const tb = cellOf(tz);
  if (!free(ta, tb)) return null;
  const from = new Int32Array(W * H).fill(-1);
  const q = [b * W + a];
  from[b * W + a] = b * W + a;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === tb * W + ta) break;
    const x = k % W;
    const z = (k - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!free(nx, nz) || from[nz * W + nx] >= 0) continue;
      from[nz * W + nx] = k;
      q.push(nz * W + nx);
    }
  }
  if (from[tb * W + ta] < 0) return null;
  const out = [];
  for (let k = tb * W + ta; k !== b * W + a; k = from[k]) out.push({ x: (k % W + 0.5) * C, z: (Math.floor(k / W) + 0.5) * C });
  out.reverse();
  out.push({ x: tx, z: tz });
  return out;
}

// une case libre au hasard à une certaine distance (à vol d'oiseau)
function cellAround(sim, P, rMin, rMax, away = null) {
  const m = sim.fm(P.floor || 0);
  let best = null;
  let bs = -Infinity;
  for (let i = 0; i < 40; i++) {
    const c = m.walkable[Math.floor(Math.random() * m.walkable.length)];
    const x = (c.x + 0.5) * C;
    const z = (c.z + 0.5) * C;
    const d = Math.hypot(x - P.x, z - P.z);
    if (d < rMin || d > rMax) continue;
    if (inStairs(sim, x, z)) continue;
    const s = away ? Math.hypot(x - away.x, z - away.z) - d * 0.3 : Math.random();
    if (s > bs) {
      bs = s;
      best = { x, z };
    }
  }
  return best;
}

class Bot {
  constructor(sim, P, i) {
    this.sim = sim;
    this.P = P;
    this.i = i;
    this.path = [];
    this.wp = 0;
    this.t = 0;
    this.goal = null;
    this.task = 'roam';
    this.stareT = 0;
    this.lookBackT = 0;
    this.stuckT = 0;
    this.lastX = P.x;
    this.lastZ = P.z;
    this.lampy = i % 2 === 0;
  }

  plan() {
    const { sim, P } = this;
    const M = sim.monster;
    const floor = P.floor || 0;
    const r = Math.random();
    const cas = (sim.fm(floor).cassettes || []).filter((c) => !c.collected && !c.high && !c.vault);
    this.task = 'roam';
    let goal = null;
    if (sim.level === 0 && floor === 1 && r < 0.18) {
      // monter : jusqu'au pied de la première volée, puis les marches
      const st = sim.stairs[Math.floor(Math.random() * sim.stairs.length)];
      if (st) {
        this.task = 'up';
        this.stair = st;
        goal = st.down;
      }
    } else if (sim.level === 0 && floor === 0 && r < 0.12) {
      // descendre : par l'escalier s'il est ouvert, sinon par un trou
      const st = sim.stairs[Math.floor(Math.random() * sim.stairs.length)];
      if (st && !sim.stairsLocked) {
        this.task = 'down';
        this.stair = st;
        goal = st.up;
      } else {
        const pits = sim.fm(0).pits || [];
        const pit = pits[Math.floor(Math.random() * pits.length)];
        if (pit) {
          this.task = 'drop';
          this.pit = pit;
          // la case voisine du trou, libre
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const gx = pit.gx + dx;
            const gz = pit.gz + dz;
            const m0 = sim.fm(0);
            if (!m0.isWall(gx, gz) && m0.pitAt(gx, gz) < 0) {
              goal = { x: (gx + 0.5) * C, z: (gz + 0.5) * C };
              break;
            }
          }
        }
      }
    } else if (cas.length && r < 0.45) {
      const c = cas.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      this.task = 'tape';
      goal = { x: c.x, z: c.z };
    } else if (sim.level === 0 && floor === 0 && sim.stairsLocked && sim.floors[0].key && r < 0.55) {
      this.task = 'key';
      goal = { x: sim.floors[0].key.x, z: sim.floors[0].key.z };
    } else if (r < 0.62) {
      this.task = 'idle';
      this.idleT = 2 + Math.random() * 4;
    }
    if (!goal && this.task === 'roam') goal = cellAround(sim, P, 12, 45);
    if (!goal) {
      if (this.task !== 'idle') this.task = 'idle';
      this.idleT = this.idleT || 2;
      this.path = [];
      return;
    }
    this.goal = goal;
    this.path = botPath(sim, floor, P.x, P.z, goal.x, goal.z) || [];
    this.wp = 0;
    if (!this.path.length && this.task !== 'idle') {
      this.task = 'idle';
      this.idleT = 1;
    }
    void M;
  }

  flee() {
    const { sim, P } = this;
    const M = sim.monster;
    const g = cellAround(sim, P, 10, 30, M);
    this.task = 'flee';
    this.fleeT = 1.5;
    this.path = g ? botPath(sim, P.floor || 0, P.x, P.z, g.x, g.z) || [] : [];
    this.wp = 0;
  }

  input() {
    const { sim, P } = this;
    const M = sim.monster;
    const inp = { mx: 0, my: 0, yaw: P.yaw, run: false, crouch: false };
    if (P.status !== 'alive') return inp;
    // agrippé : on se débat (pas toujours assez vite)
    if (P.grabT > 0) {
      if (Math.random() < 0.22) inp.struggle = 1;
      return inp;
    }
    this.t += DT;
    const same = M && (M.floor || 0) === (P.floor || 0) && !M.away;
    const dM = same ? Math.hypot(M.x - P.x, M.z - P.z) : Infinity;
    const sees = M && seesMonster(sim, P, M);
    // poursuivi : on fuit en courant (et parfois on regarde derrière soi)
    if (M && M.mode === 'chase' && M.target === P.id && dM < 20 && this.task !== 'up' && this.task !== 'down' && this.task !== 'flee' && this.task !== 'stare') this.flee();
    if (this.task === 'flee') {
      this.fleeT -= DT;
      if (this.fleeT <= 0 || this.wp >= this.path.length) {
        if (M.mode === 'chase' && dM < 24) this.flee();
        else this.plan();
      }
    }
    // l'entité en vue, loin, elle ne nous chasse pas : parfois on la fixe (ce qui la provoque)
    if (sees && this.task !== 'stare' && this.task !== 'flee' && M.mode !== 'chase' && Math.random() < 0.004) {
      this.task = 'stare';
      this.stareT = 1 + Math.random() * 2.5;
    }
    if (this.task === 'stare') {
      this.stareT -= DT;
      inp.yaw = yawTo(P, M.x, M.z);
      if (this.stareT <= 0 || !same) this.plan();
      return inp;
    }
    if (this.task === 'idle') {
      this.idleT -= DT;
      inp.yaw = P.yaw + Math.sin(this.t * 1.3 + this.i) * 0.04;
      if (this.idleT <= 0) this.plan();
      return inp;
    }
    // la lampe : dans le noir, certains l'allument
    if (P.hasLamp && this.lampy && !P.flashlight && P.battery > 20 && Math.random() < 0.01 && !sim.litCell(sim.fm(P.floor || 0), P.x, P.z)) inp.toggleFlashlight = true;
    if (P.flashlight && Math.random() < 0.002) inp.toggleFlashlight = true;
    // ramasser ce qui traîne
    if (Math.random() < 0.05) inp.pick = true;
    // dans l'escalier : les marches
    if ((this.task === 'up' || this.task === 'down') && this.wp >= this.path.length) {
      if (!this.route) {
        const st = this.stair;
        this.route = this.task === 'up'
          ? [stairPt(st, 0.3, 0.5), stairPt(st, 2.5, 0.5), stairPt(st, 2.5, 1.5), stairPt(st, -0.8, 1.5)]
          : [stairPt(st, 0.3, 1.5), stairPt(st, 2.5, 1.5), stairPt(st, 2.5, 0.5), stairPt(st, -0.8, 0.5)];
        this.ri = 0;
      }
      const p = this.route[this.ri];
      if (!p) {
        this.route = null;
        this.plan();
        return inp;
      }
      if (Math.hypot(p.x - P.x, p.z - P.z) < 0.4) this.ri++;
      inp.yaw = yawTo(P, p.x, p.z);
      inp.my = 1;
      return this.unstick(inp);
    }
    // au bord d'un trou : un pas dedans
    if (this.task === 'drop' && this.wp >= this.path.length && this.pit) {
      inp.yaw = yawTo(P, this.pit.x, this.pit.z);
      inp.my = 1;
      if ((P.floor || 0) === 1) this.plan();
      return inp;
    }
    if (this.wp >= this.path.length) {
      this.plan();
      return inp;
    }
    const w = this.path[this.wp];
    if (Math.hypot(w.x - P.x, w.z - P.z) < 0.5) this.wp++;
    inp.yaw = yawTo(P, w.x, w.z);
    inp.my = 1;
    inp.run = this.task === 'flee'; // la course est infinie
    // en fuyant, on se retourne parfois (on marche à reculons un instant)
    if (this.task === 'flee' && same && dM < 14) {
      this.lookBackT -= DT;
      if (this.lookBackT <= -2 && Math.random() < 0.02) this.lookBackT = 0.6;
      if (this.lookBackT > 0) {
        inp.yaw = yawTo(P, M.x, M.z);
        inp.my = -1;
        inp.run = false;
      }
    }
    return this.unstick(inp);
  }

  // coincé (un angle, un meuble) : on replanifie
  unstick(inp) {
    const { P } = this;
    const d = Math.hypot(P.x - this.lastX, P.z - this.lastZ);
    this.lastX = P.x;
    this.lastZ = P.z;
    this.stuckT = inp.my && d < 0.004 && !(P.lockT > 0) ? this.stuckT + DT : 0;
    if (this.stuckT > 1.5) {
      this.stuckT = 0;
      this.route = null;
      this.plan();
    }
    return inp;
  }
}

// ---------------------------------------------------------------- les mesures
// la lumière telle que la vue la cuit (view/scene.js) : un néon éclaire jusqu'à LR (plus loin dans les zones claires),
// en déclinant vite ; on compte « éclairé » à moins de 70 % de sa portée (en deçà, c'est une pénombre). Rien pendant
// une coupure
const LIGHT_R = 1.55;
function reachOf(sim, l) {
  const L0 = sim.level === 0;
  const LR = L0 && l.bright ? LIGHT_R * C * 2.3 : l.bright ? LIGHT_R * C * 1.55 : l.kind === 'bulb' ? 2.2 * C : l.kind === 'tube' ? 2.3 * C : LIGHT_R * C * (L0 ? 1.15 : 1);
  return LR * 0.7;
}
function litAt(sim, floor, x, z) {
  if (sim.blackout > 0) return false;
  const m = sim.fm(floor);
  for (const l of m.lights || []) {
    if (l.state === 'off') continue;
    const r = reachOf(sim, l);
    if (Math.abs(l.x - x) > r || Math.abs(l.z - z) > r || Math.hypot(l.x - x, l.z - z) > r) continue;
    if (hasLineOfSight(m, l.x, l.z, x, z)) return true;
  }
  return false;
}
const lampCut = new Map(); // id du joueur → heure jusqu'à laquelle sa lampe vacille (noire)
// ce qu'un joueur voit vraiment : géométriquement visible, et éclairée (néon près d'elle ou derrière elle, sa lampe
// braquée sur elle, ou tout près) ; rend la raison ('' : il ne la voit pas)
function seeWhy(sim, Q, M) {
  if (!seesMonster(sim, Q, M)) return '';
  const d = Math.hypot(M.x - Q.x, M.z - Q.z);
  if (d < 3) return `tout près (${d.toFixed(1)} m)`;
  const lamp = Q.flashlight && !((lampCut.get(Q.id) || 0) > sim.time);
  if (lamp && d < 24 && facing(Q, M.x, M.z) < 0.6) return `lampe à ${d.toFixed(1)} m`;
  const f = M.floor || 0;
  if (litAt(sim, f, M.x, M.z)) return `sous un néon à ${d.toFixed(1)} m`;
  // sa silhouette sur un fond éclairé, juste derrière elle
  const ux = (M.x - Q.x) / d;
  const uz = (M.z - Q.z) / d;
  for (const k of [1.5, 3, 4.5]) if (litAt(sim, f, M.x + ux * k, M.z + uz * k) && hasLineOfSight(sim.fm(f), M.x, M.z, M.x + ux * k, M.z + uz * k)) return `silhouette (fond éclairé à ${k} m) à ${d.toFixed(1)} m`;
  return '';
}
function reallySees(sim, Q, M) {
  return !!seeWhy(sim, Q, M);
}
function whoSees(sim, M) {
  for (const Q of sim.players) {
    const w = seeWhy(sim, Q, M);
    if (w) return `${Q.name || Q.id} : ${w}`;
  }
  return '';
}

const KINDS = ['teleport_vue', 'survitesse', 'dans_mur', 'sur_trou', 'demi_tour_vu', 'reculons', 'pietine', 'plantee', 'plantee_vue', 'hesite', 'a_coup', 'etage_faux'];
const found = Object.fromEntries(KINDS.map((k) => [k, []]));
const info = { teleport_noir: [] };
const stats = { ticks: 0, seen: 0, chases: 0, grabs: 0, deaths: 0, warps: 0, warpsSeen: 0, tapes: 0, runs: 0, floorMoves: 0, modes: {} };

function note(kind, sim, M, extra = '') {
  const e = `t=${sim.time.toFixed(1)}s ${M.mode} étage ${M.floor || 0} (${M.x.toFixed(1)}, ${M.z.toFixed(1)}) ${extra}`;
  found[kind].push(e);
  if (VERBOSE) console.log(`  [${kind}] ${e}`);
}

function blockedAt(sim, M) {
  const m = sim.fm(M.floor || 0);
  if (inStairs(sim, M.x, M.z)) return '';
  const gx = cellOf(M.x);
  const gz = cellOf(M.z);
  if (sim.blocked(gx, gz, M.floor || 0)) {
    const p = m.pillarAt && m.pillarAt(gx, gz);
    if (!p) return 'mur';
  }
  // dans la cage d'escalier, hors des marches : à travers ses murs
  for (const st of sim.stairs || []) for (const k of st.cells) if (k.gx === gx && k.gz === gz) return 'cage';
  if (sim.isColliding(M.x, M.z, 0.2, M.floor || 0)) {
    for (const pr of m.props || []) if (!pr.walk && Math.hypot(pr.x - M.x, pr.z - M.z) < pr.r + 0.2) return `meuble r=${pr.r} ${pr.kind || ''}`;
    for (const h of m.hides || []) if (Math.hypot(h.x - M.x, h.z - M.z) < 0.8) return 'casier';
    return 'pilier ou cloison';
  }
  return '';
}

function overPit(sim, M) {
  const m = sim.fm(M.floor || 0);
  const id = m.pitAt ? m.pitAt(cellOf(M.x), cellOf(M.z)) : -1;
  if (id < 0) return false;
  const p = m.pits[id];
  return Math.abs(M.x - p.x) < PIT_HALF - 0.1 && Math.abs(M.z - p.z) < PIT_HALF - 0.1;
}

function runGame(seed, budget) {
  reseed(seed);
  const players = Array.from({ length: nPlayers }, (_, i) => ({ id: i, name: `bot${i}` }));
  const sim = new BackroomsSim({ seed, players, localId: 0, level, difficulty: DIFF });
  if (sim.level !== level) sim.loadLevel(level);
  const bots = sim.players.map((P, i) => new Bot(sim, P, i));
  bots.forEach((b) => b.plan());
  const M = sim.monster;
  let prev = null;
  const ep = { stuck: 0, planted: 0, back: 0, revs: [], lastDir: null, dirHist: [], v0: 0, v1: 0, why: '' };
  let moved1 = false;
  let moved2 = false;
  stats.runs++;
  const maxTicks = Math.round(budget / DT);
  let t = 0;
  const evCount = { chase: 0 };
  for (; t < maxTicks && sim.state === 'playing'; t++) {
    const inputs = bots.map((b) => b.input());
    const others = {};
    for (let i = 1; i < inputs.length; i++) others[i] = inputs[i];
    const whyBefore = whoSees(sim, M);
    const seenBefore = !!whyBefore;
    const geoBefore = sim.players.some((Q) => seesMonster(sim, Q, M));
    const before = { x: M.x, z: M.z, yaw: M.yaw, floor: M.floor || 0, mode: M.mode, speed: M.speed || 0, away: !!M.away, push: M.push ? M.push.v : 0, v: M.v || 0, falling: !!(M.trav && M.trav.kind === 'drop' && M.trav.phase !== 'peer') };
    sim.step(inputs[0], others);
    const evs = sim.drainEvents ? sim.drainEvents() : [];
    for (const ev of evs) if (ev.type === 'lampCut') for (const Q of sim.players) if ((Q.floor || 0) === (ev.floor || 0) && Math.hypot(Q.x - ev.x, Q.z - ev.z) < (ev.r || 30)) lampCut.set(Q.id, sim.time + ev.t);
    for (const ev of evs) {
      if (ev.type === 'spotted' || ev.type === 'rush') evCount.chase++;
      if (ev.type === 'grab') stats.grabs++;
      if (ev.type === 'death' || ev.type === 'dead' || ev.type === 'killed') stats.deaths++;
      if (ev.type === 'warp' || ev.type === 'hunt') {
        stats.warps++;
        if (seenBefore) stats.warpsSeen++;
      }
      if (ev.type === 'cassette') stats.tapes++;
      if (ev.type === 'monsterStairs' || ev.type === 'monsterLand') stats.floorMoves++;
    }
    // (aux Poolrooms, pas d'entité : elle attend hors de la carte)
    if (!sim.hasMonster || sim.goats || M.away || before.away || M.x < 0 || before.x < 0) {
      prev = null;
      continue;
    }
    stats.ticks++;
    stats.modes[M.mode] = (stats.modes[M.mode] || 0) + 1;
    const whyAfter = whoSees(sim, M);
    const seenAfter = !!whyAfter;
    // là où elle était, vu après coup (avec la lumière d'après : un néon qui claque cache sa disparition)
    const whyOld = whyBefore ? whoSees(sim, { x: before.x, z: before.z, floor: before.floor }) : '';
    const geoAfter = sim.players.some((Q) => seesMonster(sim, Q, M));
    if (seenAfter) stats.seen++;
    const seen = seenBefore || seenAfter;
    // un saut se voit si on la voit arriver, ou si on la voyait et qu'on voit encore l'endroit, éclairé, désert
    const seenJump = !!whyAfter || (!!whyBefore && !!whyOld);
    const geo = geoBefore || geoAfter;
    const dx = M.x - before.x;
    const dz = M.z - before.z;
    const d = Math.hypot(dx, dz);
    // sonnée, elle titube sous la poussée (plus vite qu'elle ne marche)
    // ou ralentit depuis une course (elle freine sur quelques pas, sans s'arrêter net)
    const vmax = Math.max(before.speed, M.speed || 0, before.push, before.v, 0.5);
    // changer d'étage dans l'escalier ou au bout d'une chute dans un trou n'est pas un saut
    const floorJump = (M.floor || 0) !== before.floor && !inStairs(sim, M.x, M.z) && !inStairs(sim, before.x, before.z) && !before.falling;
    const tele = d > Math.max(0.35, vmax * DT * 3) || floorJump;
    const P = sim.players.find((Q) => Q.id === M.target) || sim.players[0];
    const dP = P ? Math.hypot(P.x - M.x, P.z - M.z) : Infinity;
    if (tele && seenJump) note('teleport_vue', sim, M, `saut ${d.toFixed(2)} m${floorJump ? ' + étage' : ''} (avant : ${before.mode}, de (${before.x.toFixed(1)}, ${before.z.toFixed(1)}) étage ${before.floor}) — vue avant : ${whyBefore || 'non'} ; l'endroit après : ${whyOld || 'non'} ; elle après : ${whyAfter || 'non'} ; évènements : ${evs.map((e) => e.type).join(',') || 'aucun'}`);
    else if (tele && geo) info.teleport_noir.push(`t=${sim.time.toFixed(1)}s ${M.mode} saut ${d.toFixed(2)} m (avant : ${before.mode})`);
    if (!tele && d / DT > vmax * 1.15 + 0.25) note('survitesse', sim, M, `${(d / DT).toFixed(2)} m/s pour ${vmax.toFixed(2)}`);
    if (TRACE && sim.time >= TRACE[0] && sim.time <= TRACE[1]) console.log(`    ${sim.time.toFixed(2)} ${M.mode} (${M.x.toFixed(2)}, ${M.z.toFixed(2)}) yaw ${(M.yaw || 0).toFixed(2)} v ${(M.v || 0).toFixed(2)} pas ${d.toFixed(4)} chemin ${M.pathIndex}/${(M.path || []).length} ${M.path && M.path[M.pathIndex] ? `→ (${M.path[M.pathIndex].x.toFixed(1)}, ${M.path[M.pathIndex].z.toFixed(1)})` : ''} repath ${(M.repathT || 0).toFixed(2)} arrivée ${M.arrived ? 1 : 0} place ${M.trav ? '-' : clearAt(sim, M.floor || 0, M.x, M.z).toFixed(3)}${M.trav ? ' passage' : ''}${M.push ? ' poussée' : ''}`);
    const why = blockedAt(sim, M);
    if (why && !ep.wall) note('dans_mur', sim, M, why);
    ep.wall = !!why;
    if (overPit(sim, M) && !(M.trav && M.trav.kind === 'drop')) note('sur_trou', sim, M);
    const dyaw = Math.abs(ang((M.yaw || 0) - before.yaw));
    if (!tele && seen && dyaw > 0.35) note('demi_tour_vu', sim, M, `${((dyaw * 180) / Math.PI).toFixed(0)}° en une image (avant : ${before.mode})`);
    // de côté ou à reculons
    if (!tele && d > 0.01) {
      const mv = Math.atan2(dx, dz);
      const off = Math.abs(ang(mv - (M.yaw || 0)));
      if (seen && off > 1.3 && M.mode !== 'stun') {
        ep.back++;
        if (ep.back === 4) note('reculons', sim, M, `${((off * 180) / Math.PI).toFixed(0)}° entre regard et marche`);
      } else ep.back = 0;
    } else ep.back = 0;
    // piétine : elle devrait avancer
    const wantsMove = (M.speed || 0) > 0.5 && ['chase', 'search', 'patrol', 'stalk', 'flee'].includes(M.mode) && !M.steamWait && !(M.stunT > 0) && !(M.trav && M.trav.kind === 'drop');
    // elle pivote sur place (pour repartir dans l'autre sens) : elle ne piétine pas
    const turning = Math.abs(ang((M.yaw || 0) - before.yaw)) > 0.01;
    if (wantsMove && d < 0.002 && !tele && !turning) {
      ep.stuck++;
      // arrivée au bout de sa ronde, elle s'arrête exprès pour écouter (jusqu'à 1,6 s) : au-delà, elle est coincée
      if (ep.stuck === (M.arrived ? 120 : 60)) note('pietine', sim, M, `vitesse ${(M.speed || 0).toFixed(1)}, proie à ${dP.toFixed(1)} m${M.arrived ? ' (arrivée)' : ''} · v ${(M.v || 0).toFixed(2)} chemin ${M.pathIndex}/${(M.path || []).length} vise ${M.goal ? Math.hypot(M.goal.x - M.x, M.goal.z - M.z).toFixed(1) : '-'} repath ${(M.repathT || 0).toFixed(2)} bloc ${(M.blockT || 0).toFixed(2)} heurts ${M.bumps || 0} portail ${M.portal ? M.portal.kind : '-'} cachée ${P && P.hidden >= 0 ? 'oui' : 'non'}`);
    } else ep.stuck = 0;
    // plantée devant sa proie
    const preySees = P && seesMonster(sim, P, M);
    if ((M.mode === 'chase' || M.mode === 'search') && preySees && dP < 9 && d < 0.002) {
      ep.planted++;
      if (ep.planted === 60) note('plantee', sim, M, `proie à ${dP.toFixed(1)} m`);
    } else ep.planted = 0;
    // plantée sous les yeux de quelqu'un, hors poursuite (immobile : ni pas, ni demi-tour)
    const viewer = !tele && !M.trav && !['chase', 'grab', 'stun'].includes(M.mode) && d < 0.4 * DT && dyaw < 0.6 * DT ? sim.players.find((Q) => seesMonster(sim, Q, M) && Math.hypot(Q.x - M.x, Q.z - M.z) < 22) : null;
    ep.plantV = viewer ? (ep.plantV || 0) + DT : 0;
    if (viewer && Math.abs(ep.plantV - 1.5) < DT / 2) note('plantee_vue', sim, M, `vue par ${viewer.name || viewer.id} à ${Math.hypot(viewer.x - M.x, viewer.z - M.z).toFixed(1)} m${M.glimpse ? ' (première rencontre)' : ''}${M.lurk ? ' (postée)' : ''}`);
    // hésitations : demi-tours de marche rapprochés
    if (!tele && d > 0.005) {
      const dir = [dx / d, dz / d];
      ep.dirHist.push(dir);
      if (ep.dirHist.length > 8) ep.dirHist.shift();
      const old = ep.dirHist[0];
      if (ep.dirHist.length === 8 && old[0] * dir[0] + old[1] * dir[1] < -0.3) {
        ep.revs.push(sim.time);
        ep.dirHist.length = 0;
      }
      ep.revs = ep.revs.filter((s) => sim.time - s < 1);
      if (ep.revs.length >= 3) {
        note('hesite', sim, M, `${ep.revs.length} demi-tours en 1 s`);
        ep.revs.length = 0;
      }
    }
    // à-coup : immobile une image entre deux pas, sans raison
    const moving = d > 0.004 && !tele;
    // un vrai arrêt (pas un pas très lent dans un virage serré)
    const halted = d < 0.0015;
    if (moved2 && ep.halted && moving && wantsMove && before.mode === M.mode) note('a_coup', sim, M, `v ${ep.v1.toFixed(2)} → ${ep.v0.toFixed(2)} → ${(M.v || 0).toFixed(2)} · ${ep.why || ''}`);
    ep.v1 = ep.v0;
    ep.v0 = M.v || 0;
    ep.why = `pas ${d.toFixed(4)} trav ${M.trav ? M.trav.kind : '-'} portail ${M.portal ? M.portal.kind : '-'} chemin ${M.pathIndex}/${(M.path || []).length} bloc ${(M.blockT || 0).toFixed(2)} attente ${M.steamWait ? 1 : 0} vise ${M.goal ? Math.hypot(M.goal.x - M.x, M.goal.z - M.z).toFixed(1) : '-'}`;
    moved2 = moved1;
    moved1 = moving;
    ep.halted = halted;
    // l'étage dans l'escalier
    const s = inStairs(sim, M.x, M.z);
    if (s && (s.h > 0.55 ? 0 : s.h < 0.45 ? 1 : M.floor || 0) !== (M.floor || 0)) note('etage_faux', sim, M, `hauteur ${s.h.toFixed(2)}`);
    prev = before;
  }
  stats.chases += sim.chases || 0;
  void prev;
  void evCount;
  return { ticks: t, state: sim.state };
}

const t0 = Date.now();
let worst = 0;
const step0 = BackroomsSim.prototype.step;
BackroomsSim.prototype.step = function (...a) {
  const s = performance.now();
  const r = step0.apply(this, a);
  const e = performance.now() - s;
  worst = Math.max(worst, e);
  // SLOW=ms : chaque pas plus long que ça, avec ce que faisait l'entité
  if (SLOW && e > SLOW) {
    const M = this.monster;
    console.log(`  pas lent ${e.toFixed(1)} ms à t=${this.time.toFixed(2)} s · ${M ? `${M.mode} étage ${M.floor || 0} chemin ${M.pathIndex}/${(M.path || []).length} portail ${M.portal ? M.portal.kind : '-'}` : ''}`);
  }
  return r;
};
let left = minutes * 60;
let seed = seed0;
while (left > 1) {
  const r = runGame(seed, left);
  left -= r.ticks * DT;
  seed++;
}
const sec = stats.ticks * DT;
console.log(`Banc de l'entité — ${nPlayers} bot(s), niveau ${level}, graines ${seed0} à ${seed - 1}, ${(sec / 60).toFixed(1)} min de jeu avec elle (${stats.runs} partie(s)), ${((Date.now() - t0) / 1000).toFixed(1)} s de calcul`);
console.log(`  pas de simulation le plus long : ${worst.toFixed(1)} ms`);
console.log(`  vue ${((100 * stats.seen) / Math.max(1, stats.ticks)).toFixed(0)} % du temps · poursuites ${stats.chases} · prises ${stats.grabs} · téléportations ${stats.warps} (dont ${stats.warpsSeen} vues) · cassettes ${stats.tapes} · changements d'étage ${stats.floorMoves}`);
console.log(`  modes : ${Object.entries(stats.modes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / stats.ticks).toFixed(0)} %`).join(', ')}`);
let total = 0;
for (const k of KINDS) {
  const list = found[k];
  total += list.length;
  console.log(`  ${list.length ? '✗' : '✓'} ${k.padEnd(13)} ${String(list.length).padStart(5)}${list.length ? ` (par minute : ${((list.length * 60) / Math.max(1, sec)).toFixed(2)})` : ''}`);
  for (const e of list.slice(0, EX)) console.log(`      ${e}`);
}
console.log(`  (pour information : ${info.teleport_noir.length} saut(s) dans le noir complet, sous les yeux de personne)`);
for (const e of info.teleport_noir.slice(0, EX)) console.log(`      ${e}`);
console.log(total ? `${total} mouvement(s) incohérent(s)` : 'Aucun mouvement incohérent.');
process.exitCode = total ? 1 : 0;
void PLAYER_RADIUS;
void stairLocal;
