// Fief Maudit : ce qui passe sur le réseau. L'hôte fait tourner la simulation ; il envoie ~15 fois par seconde un état
// compact (horloge, stock, braseros, joueurs, squelettes, bûches, poutres) et, plus rarement, le « monde » (qui joue
// quel métier, arbres abattus). L'invité garde une copie de la vallée (même graine) et y recopie ces états ; seul son
// propre déplacement est prédit chez lui (predict) puis recalé sur l'hôte. Moteur PUR.
import { DT, SPEED, BEAM, P_R, jobOf, BUILDS } from './sim.js';

const ACTS = [null, 'chop', 'strike', 'pick', 'store', 'feed', 'take', 'drop', 'repair', 'build', 'gather', 'eat', 'relight', 'ability', 'open'];
const SITES = Object.keys(BUILDS), BST = ['ruine', 'chantier', 'debout'];
const STATES = ['awaken', 'walk', 'attack', 'dead', 'rise', 'sleep'];
const KINDS = ['minion', 'warrior', 'knight', 'king'];
const r2 = (v) => Math.round(v * 100), r3 = (v) => Math.round(v * 1000);

// ------------------------------------------------------------------ hôte → invités
export function encodeState(sim) {
  return {
    c: [sim.clock.day, sim.clock.phase === 'nuit' ? 1 : 0, Math.round(sim.clock.t * 10), sim.clock.duskSaid ? 1 : 0],
    k: [sim.stock.bois, sim.stock.poutre, sim.stock.nourriture], w: sim.won ? 1 : 0,
    bd: SITES.map((id) => [BST.indexOf(sim.build[id].state), sim.build[id].prog]),
    br: sim.berries.map((b) => (b.ready ? 1 : 0)).join(''), v: Math.round(sim.village.hp), g: sim.goal, o: sim.over ? sim.over.reason : 0, ts: Math.round(sim.t * 1000),
    bz: sim.braziers.map((b) => Math.round(b.fuel * 10)),
    ch: sim.chests.map((c) => [c.id, r2(c.x), r2(c.z), r3(c.rot), c.open ? 1 : 0]),
    cr: sim.crypt.open ? [sim.crypt.gate ? 1 : 0, r2(sim.crypt.leverT), (sim.crypt.brume ? 1 : 0) | (sim.crypt.throne ? 2 : 0), sim.crypt.king ?? -1, sim.crypt.phase, sim.crypt.torches.map((t) => (t ? 1 : 0)).join('')] : 0,
    fx: sim.flares.map((f) => [r2(f.x), r2(f.z), r2(f.until - sim.t)]),
    bs: sim.bars.map((b) => [b.id, r2(b.x), r2(b.z), r3(b.rot), Math.round(b.hp), r2(b.until - sim.t)]),
    p: sim.players.map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), Math.round(p.hp), p.maxHp,
      (p.ground ? 1 : 0) | (p.down ? 2 : 0) | (p.dead ? 4 : 0) | (p.carry === 'bois' ? 8 : 0) | (p.carry === 'poutre' ? 16 : 0) | (p.hurtT > 0 ? 32 : 0) | (p.cold ? 64 : 0) | (p.carry === 'vivres' ? 128 : 0),
      ACTS.indexOf(p.act), r2(p.actT), r2(p.speed), p.beam ?? -1, p.end, Math.round(p.downT * 10), r2(p.revive), p.reviving ?? -1, p.kills, Math.round(p.food), r2(p.cd), r2(p.guardT), p.lever, p.load || 0]),
    f: sim.foes.map((f) => [f.id, KINDS.indexOf(f.kind), r2(f.x), r2(f.y), r2(f.z), r3(f.yaw), STATES.indexOf(f.state), r2(f.t), Math.round(f.hp), f.stun > 0 ? 1 : 0, r2(f.atkT), f.rises, f.maxHp || 0, f.enrage ? 1 : 0]),
    l: sim.logs.map((l) => [l.id, r2(l.x), r2(l.y), r2(l.z), r3(l.rot), l.ready ? 1 : 0]),
    b: sim.beams.map((b) => [b.id, r2(b.x), r2(b.y), r2(b.z), r3(b.rot), b.h[0] ?? -1, b.h[1] ?? -1, (b.lifted ? 1 : 0) | (b.ready ? 2 : 0)]),
  };
}
// le monde : rarement (qui est qui, arbres abattus)
export function encodeWorld(sim) {
  return {
    seed: sim.seed, mode: sim.mode, diff: sim.diff,
    pl: sim.players.map((p) => ({ id: p.id, name: p.name, job: p.job, color: p.color, bot: p.bot, stored: p.stored, felled: p.felled })),
    tr: sim.trees.filter((t) => t.down).map((t) => [t.id, r3(t.dir)]),
    st: { kills: sim.stats.kills, nights: sim.stats.nights },
  };
}

// ------------------------------------------------------------------ chez l'invité
export function applyWorld(sim, w) {
  for (const q of w.pl) {
    let p = sim.player(q.id);
    if (!p) p = sim.addPlayer({ id: q.id, name: q.name, job: q.job, color: q.color, bot: q.bot });
    Object.assign(p, { name: q.name, job: q.job, color: q.color, bot: q.bot, stored: q.stored, felled: q.felled });
  }
  const ids = new Set(w.pl.map((q) => q.id));
  sim.players = sim.players.filter((p) => ids.has(p.id));
  const fell = [];
  for (const [id, dir] of w.tr) { const T = sim.trees[id]; if (T && !T.down) { T.down = true; T.dir = dir / 1000; fell.push(id); } }
  if (w.st) Object.assign(sim.stats, w.st);
  if (w.mode) sim.mode = w.mode; if (w.diff) sim.diff = w.diff;
  sim.events = sim.events.filter((e) => e.t !== 'join');
  return fell;   // arbres à faire tomber à l'écran (on vient d'arriver)
}
// recopie l'état ; `me` (son propre joueur) n'est pas écrasé : on renvoie sa position chez l'hôte pour le recaler
export function applyState(sim, s, me) {
  const [day, night, t, dusk] = s.c;
  Object.assign(sim.clock, { day, phase: night ? 'nuit' : 'jour', t: t / 10, duskSaid: !!dusk });
  sim.stock.bois = s.k[0]; sim.stock.poutre = s.k[1]; sim.stock.nourriture = s.k[2] || 0; sim.village.hp = s.v; sim.goal = s.g; sim.won = !!s.w;
  if (s.bd) SITES.forEach((id, i) => { const b = s.bd[i]; if (b) sim.build[id] = { state: BST[b[0]], prog: b[1] }; });
  if (s.br) [...s.br].forEach((c, i) => { if (sim.berries[i]) sim.berries[i].ready = c === '1'; });
  sim.over = s.o ? { reason: s.o } : null;
  s.bz.forEach((f, i) => { if (sim.braziers[i]) sim.braziers[i].fuel = f / 10; });
  if (s.ch) sim.chests = s.ch.map((r) => ({ id: r[0], x: r[1] / 100, z: r[2] / 100, rot: r[3] / 1000, open: !!r[4] }));
  const C = sim.crypt;
  if (s.cr) {
    if (!C.open) { C.open = true; C.torches = sim.map.crypt.torches.map(() => true); }
    C.gate = !!s.cr[0]; C.leverT = s.cr[1] / 100; C.brume = !!(s.cr[2] & 1); C.throne = !!(s.cr[2] & 2); C.king = s.cr[3] < 0 ? null : s.cr[3]; C.phase = s.cr[4];
    [...s.cr[5]].forEach((c, i) => { C.torches[i] = c === '1'; });
    sim.map.crypt.gate.open = C.gate;
  }
  sim.flares = (s.fx || []).map((r) => ({ x: r[0] / 100, z: r[1] / 100, until: sim.t + r[2] / 100 }));
  sim.bars = (s.bs || []).map((r) => ({ id: r[0], x: r[1] / 100, z: r[2] / 100, rot: r[3] / 1000, hp: r[4], until: sim.t + r[5] / 100 }));
  let mine = null;
  const seen = new Set();
  for (const r of s.p) {
    const id = r[0]; seen.add(id);
    let p = sim.player(id);
    if (!p) p = sim.addPlayer({ id, name: '…', job: 'bucheron' });
    const st = { x: r[1] / 100, y: r[2] / 100, z: r[3] / 100, yaw: r[4] / 1000 };
    const fl = r[7];
    Object.assign(p, { hp: r[5], maxHp: r[6], ground: !!(fl & 1), down: !!(fl & 2), dead: !!(fl & 4), carry: fl & 8 ? 'bois' : fl & 16 ? 'poutre' : fl & 128 ? 'vivres' : null, hurtT: fl & 32 ? 0.35 : 0, cold: !!(fl & 64), food: r[17] ?? 100,
      act: ACTS[r[8]] || null, actT: r[9] / 100, speed: r[10] / 100, beam: r[11] < 0 ? null : r[11], end: r[12], downT: r[13] / 10, revive: r[14] / 100, reviving: r[15] < 0 ? null : r[15], kills: r[16], cd: (r[18] || 0) / 100, guardT: (r[19] || 0) / 100, lever: r[20] ?? -1, load: r[21] || 0 });
    if (id === me) { mine = st; p._srv = st; continue; }
    // les autres : on vise la position reçue, l'affichage s'en approche en douceur (smooth)
    p._to = st;
    if (p._new !== false) { Object.assign(p, st); p._new = false; }
  }
  sim.players = sim.players.filter((p) => seen.has(p.id));
  const fseen = new Set();
  for (const r of s.f) {
    const id = r[0]; fseen.add(id);
    let f = sim.foe(id);
    if (!f) { f = { id, kind: KINDS[r[1]], x: r[2] / 100, y: r[3] / 100, z: r[4] / 100, yaw: r[5] / 1000, stun: 0, rises: 0 }; sim.foes.push(f); }
    Object.assign(f, { kind: KINDS[r[1]], state: STATES[r[6]], t: r[7] / 100, hp: r[8], stun: r[9] ? 0.2 : 0, atkT: r[10] / 100, rises: r[11], maxHp: r[12] || undefined, enrage: !!r[13] });
    f._to = { x: r[2] / 100, y: r[3] / 100, z: r[4] / 100, yaw: r[5] / 1000 };
  }
  sim.foes = sim.foes.filter((f) => fseen.has(f.id));
  sim.logs = s.l.map((r) => ({ id: r[0], x: r[1] / 100, y: r[2] / 100, z: r[3] / 100, rot: r[4] / 1000, ready: !!r[5] }));
  sim.beams = s.b.map((r) => ({ id: r[0], x: r[1] / 100, y: r[2] / 100, z: r[3] / 100, rot: r[4] / 1000, h: [r[5] < 0 ? null : r[5], r[6] < 0 ? null : r[6]], lifted: !!(r[7] & 1), ready: !!(r[7] & 2) }));
  return mine;
}
// chaque image, chez l'invité : les autres et les squelettes glissent vers leur dernière position connue
export function smooth(sim, dt, me) {
  const k = 1 - Math.exp(-dt * 14);
  const lerpA = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  for (const o of [...sim.players, ...sim.foes]) {
    if (o.id === me && sim.players.includes(o)) continue;
    const t = o._to; if (!t) continue;
    if (Math.abs(t.x - o.x) + Math.abs(t.z - o.z) > 6) { o.x = t.x; o.y = t.y; o.z = t.z; o.yaw = t.yaw; continue; }
    o.x += (t.x - o.x) * k; o.y += (t.y - o.y) * k; o.z += (t.z - o.z) * k; o.yaw = lerpA(o.yaw, t.yaw);
  }
}

// ------------------------------------------------------------------ prédiction de son propre déplacement (invité)
// Les mêmes règles que le moteur pour marcher (vitesse du métier, poutre, collisions, eau), sans rien résoudre d'autre.
export function predict(sim, p, inp) {
  if (!p || p.down || p.dead || p.act || p.reviving !== null || p.lever >= 0) return;
  const M = sim.map;
  let wx = inp.wx || 0, wz = inp.wz || 0;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  let sp;
  if (p.carry === 'poutre') { const b = sim.beams.find((o) => o.id === p.beam); sp = !b || !b.lifted ? 0 : b.h.filter((id) => id !== null).length === 2 ? BEAM.speed : BEAM.alone; }
  else sp = p.carry ? SPEED.carry - 0.3 * Math.max(0, (p.load || 1) - 1) : inp.walk ? SPEED.walk : SPEED.run * (jobOf(p).speed || 1);
  let nx = p.x + wx * sp * DT, nz = p.z + wz * sp * DT;
  if (len > 0.05) { let d = Math.atan2(wx, wz) - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; p.yaw += d * Math.min(1, DT * 12); }
  if (M.isWater(nx, nz)) { nx = p.x; nz = p.z; }
  [nx, nz] = M.collide(nx, nz, P_R, sim.fallen);
  [nx, nz] = sim.pushBars(nx, nz, P_R);
  p.speed = Math.hypot(nx - p.x, nz - p.z) / DT;
  p.x = nx; p.z = nz;
  if (p.ground) p.y = M.heightAt(p.x, p.z);
}
// recaler sa position prédite sur celle de l'hôte (qui a ~100 ms de retard) : petit écart, on glisse ; gros écart, on saute
export function reconcile(p, srv, pinned) {
  if (!p || !srv) return;
  const d = Math.hypot(srv.x - p.x, srv.z - p.z);
  if (pinned || d > 2.5) { p.x = srv.x; p.z = srv.z; p.y = srv.y; if (pinned) p.yaw = srv.yaw; return; }
  if (d > 0.35) { const k = 0.12; p.x += (srv.x - p.x) * k; p.z += (srv.z - p.z) * k; }
  p.y = srv.y;
}

// nettoyer l'entrée reçue d'un invité (côté hôte)
export function cleanInput(m) {
  const n = (v, a, b) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : 0);
  return { wx: n(m.wx, -1, 1), wz: n(m.wz, -1, 1), walk: !!m.walk, jump: !!m.jump, hold: !!m.hold, fc: m.fc | 0, uc: m.uc | 0, ac: m.ac | 0 };
}
