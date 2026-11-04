// Mystère Mystère : les bots. Ils voient ce qu'un joueur verrait (ligne de vue, portée, noir pendant une coupure),
// retiennent qui a sorti un couteau ou tué devant eux, et remplissent une commande comme un joueur au clavier.
// Meurtrier : rôde les mains vides, choisit une proie isolée, dégaine au dernier moment, lance son couteau de loin
//   quand personne d'armé ne regarde, coupe le courant, file par les passages secrets.
// Shérif / héros : patrouille, abat celui qu'il a vu avec un couteau (jamais au hasard), garde ses distances.
// Innocent : ramasse les pièces, fuit le couteau, court vers le revolver tombé.
import { buildNav, findPath, nodeOf, nodePos } from './nav.js';
import { LV_Y, li, hasLOS, roomAt } from './map.js';
import { sees, EYE, STAB_R, alive } from './sim.js';

const LEVEL = {
  facile: { react: 1.1, turn: 4.5, aimErr: 0.16, fireTol: 0.07, throwP: 0.12, view: 20, spot: 10, greedy: 0.5 },
  normal: { react: 0.75, turn: 7, aimErr: 0.09, fireTol: 0.045, throwP: 0.35, view: 26, spot: 14, greedy: 0.75 },
  expert: { react: 0.4, turn: 11, aimErr: 0.045, fireTol: 0.03, throwP: 0.6, view: 34, spot: 20, greedy: 0.9 },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.5;

export function updateBots(sim, dt) {
  if (!sim.nav) sim.nav = buildNav(sim.M);
  // les témoins : ce que chaque bot voit arriver
  for (const e of sim.events) {
    if (e.e === 'kill' || e.e === 'swing' || e.e === 'shot' || e.e === 'gundrop' || e.e === 'misfire') for (const b of sim.players) if (b.bot && b.st === 'ok') witness(sim, b, e);
  }
  for (const p of sim.players) if (p.bot && p.st === 'ok') think(sim, p, dt);
}

function brain(sim, p) {
  if (!p.brain) p.brain = { path: null, pi: 0, goal: null, goalT: 0, repath: 0, stuckT: 0, lastX: p.x, lastZ: p.z, idle: 0, sus: new Map(), known: null, lastSeen: null, flee: null, fleeT: 0, react: 0, aim: null, lv: LEVEL[sim.level] || LEVEL.normal, fc: 0, sc: 0, uc: 0, bc: 0, yaw: p.yaw, pitch: 0, target: null, throwCd: 2, boT: 30 + Math.random() * 40, holdT: 0, useCd: 0, wantDraw: false };
  return p.brain;
}

// ------------------------------------------------------------------ perception
function canSee(sim, b, q, range) {
  const B = brain(sim, b);
  const r = (range || B.lv.view) * (sim.w.bo > 0 ? 0.3 : 1);
  return sees(sim.M, sim.w, b, q, r);
}
function witness(sim, b, e) {
  const B = brain(sim, b);
  const near = { x: e.x, y: e.y ?? b.y, z: e.z };
  if (Math.hypot(near.x - b.x, near.z - b.z) > B.lv.spot) return;
  if (e.e === 'kill' || e.e === 'swing') {
    // qui tenait un couteau près de là ?
    for (const q of sim.players) {
      if (q === b || q.st !== 'ok' || !q.drawn || sim.holding(q) !== 'knife') continue;
      if (Math.hypot(q.x - near.x, q.z - near.z) < 3.5 && canSee(sim, b, q, B.lv.spot)) { B.sus.set(q.id, 2); B.known = q.id; B.lastSeen = { x: q.x, z: q.z, lv: q.lv, y: q.y }; }
    }
    if (e.e === 'kill' && b.role !== 'm' && !b.hasGun) { B.flee = { x: e.x, z: e.z, lv: b.lv }; B.fleeT = 3 + Math.random() * 2; }
  }
}
function look(sim, b) {
  const B = brain(sim, b);
  // un couteau sorti, vu de ses yeux : c'est le meurtrier
  for (const q of sim.players) {
    if (q === b || q.st !== 'ok') continue;
    if (q.drawn && sim.holding(q) === 'knife' && b.role !== 'm' && canSee(sim, b, q, B.lv.spot)) {
      if (B.known !== q.id) { B.react = B.lv.react * (0.7 + Math.random() * 0.6); }
      B.known = q.id; B.sus.set(q.id, 2);
    }
    if (B.known === q.id && canSee(sim, b, q)) B.lastSeen = { x: q.x, z: q.z, lv: q.lv, y: q.y, t: sim.time };
  }
  if (B.known != null) { const k = sim.byId.get(B.known); if (!k || k.st !== 'ok') { B.known = null; B.lastSeen = null; } }
}

// ------------------------------------------------------------------ déplacement
function goTo(sim, b, x, z, lv, tag) {
  const B = brain(sim, b);
  if (B.goal && B.goal.tag === tag && B.path && Math.hypot(B.goal.x - x, B.goal.z - z) < 1.5 && B.goal.lv === lv && B.repath > 0) return true;
  const nav = sim.nav;
  const from = nodeOf(nav, sim.M, b.lv, b.x, b.z, b.y), to = nodeOf(nav, sim.M, lv, x, z, LV_Y[li(lv)]);
  if (from == null || to == null) return false;
  const path = findPath(nav, from, to);
  B.goal = { x, z, lv, tag }; B.repath = 1 + Math.random() * 0.6;
  if (!path) { B.path = null; return false; }
  B.path = path; B.pi = Math.min(1, path.length - 1);
  return true;
}
// avance sur le chemin ; renvoie la direction voulue (monde) ou null à l'arrivée
function follow(sim, b, dt) {
  const B = brain(sim, b);
  if (!B.path) return null;
  while (B.pi < B.path.length) {
    const n = nodePos(B.path[B.pi]);
    const d = Math.hypot(n.x - b.x, n.z - b.z);
    const n2 = B.pi + 1 < B.path.length ? nodePos(B.path[B.pi + 1]) : null;
    // nœud atteint, ou déjà dépassé dans le sens de la marche
    // sur un escalier ou devant un passage, on suit les cases à la lettre
    const strict = special(sim, n) || (n2 && special(sim, n2));
    const passed = !strict && n2 && d < 1.1 && ((n2.x - n.x) * (b.x - n.x) + (n2.z - n.z) * (b.z - n.z)) > 0.05;
    if (d < (strict ? 0.3 : 0.45) || passed) { B.pi++; continue; }
    // passage fermé devant : on l'ouvre
    const t = sim.M.t[li(n.lv)][(Math.floor(n.z)) * sim.M.W + Math.floor(n.x)];
    if (t === 5 && d < 1.6 && !(sim.w.pass[sim.M.passAt[li(n.lv)][Math.floor(n.z) * sim.M.W + Math.floor(n.x)]] > 0) && B.useCd <= 0) { B.uc++; B.useCd = 1.2; }
    // on vise un peu plus loin si la ligne est droite (même niveau)
    let tx = n.x, tz = n.z;
    if (n2 && d < 1.2 && !strict) { tx = n.x * 0.4 + n2.x * 0.6; tz = n.z * 0.4 + n2.z * 0.6; }
    return { dx: tx - b.x, dz: tz - b.z };
  }
  B.path = null;
  return null;
}
function special(sim, n) { const t = sim.M.t[li(n.lv)][Math.floor(n.z) * sim.M.W + Math.floor(n.x)]; return t === 4 || t === 5; }
function steer(sim, b, dt, dir, { run = false, faceYaw = null, pitch = 0 } = {}) {
  const B = brain(sim, b), inp = b.inp;
  let wantYaw = faceYaw;
  if (dir && wantYaw == null) wantYaw = Math.atan2(-dir.dx, -dir.dz);
  if (wantYaw != null) { const d = angDiff(wantYaw, B.yaw), m = B.lv.turn * dt; B.yaw += clamp(d, -m, m); }
  B.pitch += clamp(pitch - B.pitch, -2 * dt, 2 * dt);
  inp.yaw = B.yaw; inp.pitch = B.pitch;
  if (dir) {
    const l = Math.hypot(dir.dx, dir.dz) || 1, wx = dir.dx / l, wz = dir.dz / l;
    // direction monde → commande relative au regard (avant = -z à yaw 0)
    const s = Math.sin(B.yaw), c = Math.cos(B.yaw);
    inp.mx = clamp(wx * c - wz * s, -1, 1);
    inp.my = clamp(-wx * s - wz * c, -1, 1);
    inp.run = run;
  } else { inp.mx = 0; inp.my = 0; inp.run = false; }
  // coincé : on saute, on repart ailleurs
  B.stuckT = Math.hypot(b.x - B.lastX, b.z - B.lastZ) < 0.6 * dt * 2 && dir ? B.stuckT + dt : Math.max(0, B.stuckT - dt);
  B.lastX = b.x; B.lastZ = b.z;
  inp.jump = B.stuckT > 0.6 && B.stuckT < 0.75;
  if (B.stuckT > 1.6) { B.stuckT = 0; B.path = null; B.goal = null; B.repath = 0; }
}
function wander(sim, b, dt, run = false) {
  const B = brain(sim, b);
  if (B.idle > 0) { B.idle -= dt; steer(sim, b, dt, null); return; }
  if (!B.path || !B.goal || B.goal.tag !== 'wander') {
    const M = sim.M, c = M.walk[Math.floor(Math.random() * M.walk.length)];
    goTo(sim, b, c.x, c.z, c.lv, 'wander');
  }
  const dir = follow(sim, b, dt);
  if (!dir) { B.goal = null; B.idle = Math.random() < 0.4 ? 0.5 + Math.random() * 2 : 0; }
  steer(sim, b, dt, dir, { run });
}
// une pièce d'or visible et proche, ou rien
function nearCoin(sim, b, r = 9) {
  let best = null, bd = r;
  for (const c of sim.w.coins) {
    if (c.lv !== b.lv) continue;
    const d = Math.hypot(c.x - b.x, c.z - b.z);
    if (d < bd && hasLOS(sim.M, sim.w, b.lv, b.x, b.z, c.x, c.z)) { bd = d; best = c; }
  }
  return best;
}
function aimAt(sim, b, q, err = 0) {
  const B = brain(sim, b);
  const dx = q.x - b.x, dz = q.z - b.z, dy = q.y + 1.15 - (b.y + EYE), d = Math.hypot(dx, dz);
  if (!B.aimN || Math.random() < 0.05) B.aimN = { y: (Math.random() - 0.5) * 2, p: (Math.random() - 0.5) * 2 };
  return { yaw: Math.atan2(-dx, -dz) + B.aimN.y * err, pitch: Math.atan2(dy, d) + B.aimN.p * err * 0.6, d };
}

// ------------------------------------------------------------------ cerveau
function think(sim, b, dt) {
  const B0 = brain(sim, b);
  if (b.role === 'm' && b.kills !== B0.lastKills) { B0.lastKills = b.kills; if (b.kills) { B0.calm = 1.5 + Math.random() * 3; B0.target = null; B0.exposedT = 10; } }
  const B = brain(sim, b), inp = b.inp;
  B.repath -= dt; B.useCd -= dt; B.react -= dt; B.throwCd -= dt; B.boT -= dt;
  if (b.stun > 0) { steer(sim, b, dt, null); return; }
  look(sim, b);
  if (b.role === 'm') murderer(sim, b, dt);
  else if (b.hasGun || b.role === 'x') gunner(sim, b, dt);
  else innocent(sim, b, dt);
  inp.fc = B.fc; inp.sc = B.sc; inp.uc = B.uc; inp.bc = B.bc; inp.draw = B.wantDraw; inp.ws = 1;
}

function innocent(sim, b, dt) {
  const B = brain(sim, b), w = sim.w;
  B.wantDraw = false;
  const k = B.known != null ? sim.byId.get(B.known) : null;
  // le meurtrier en vue : on s'éloigne en courant
  if (k && canSee(sim, b, k, 16)) { B.flee = { x: k.x, z: k.z, lv: k.lv }; B.fleeT = 2.5; }
  if (B.fleeT > 0) {
    B.fleeT -= dt;
    if (!B.goal || B.goal.tag !== 'flee' || B.repath <= 0) {
      // la case la plus loin de la menace parmi quelques tirages
      let best = null, bd = -1;
      for (let i = 0; i < 10; i++) { const c = sim.M.walk[Math.floor(Math.random() * sim.M.walk.length)]; const d = Math.hypot(c.x - B.flee.x, c.z - B.flee.z) + (c.lv !== B.flee.lv ? 12 : 0); if (d > bd && Math.hypot(c.x - b.x, c.z - b.z) < 26) { bd = d; best = c; } }
      if (best) goTo(sim, b, best.x, best.z, best.lv, 'flee');
    }
    steer(sim, b, dt, follow(sim, b, dt), { run: true });
    return;
  }
  // le revolver est par terre : on fonce (sauf s'il est au pied du meurtrier connu)
  if (w.guns.length) {
    const g = w.guns[0];
    const danger = k && Math.hypot(k.x - g.x, k.z - g.z) < 5;
    const dg = Math.hypot(g.x - b.x, g.z - b.z);
    if (!danger && dg < 45 && Math.random() < 0.995) {
      goTo(sim, b, g.x, g.z, g.lv, 'gun');
      steer(sim, b, dt, follow(sim, b, dt) || { dx: g.x - b.x, dz: g.z - b.z }, { run: true });
      return;
    }
  }
  // les pièces d'or
  B.moodT = (B.moodT ?? 0) - dt;
  if (B.moodT <= 0) { B.moodT = 3 + Math.random() * 3; B.greedy = Math.random() < B.lv.greedy; }
  if (B.greedy || B.goal?.tag === 'coin') {
    const c = nearCoin(sim, b);
    if (c && b.coins < 40) { goTo(sim, b, c.x, c.z, c.lv, 'coin'); const dir = follow(sim, b, dt) || { dx: c.x - b.x, dz: c.z - b.z }; steer(sim, b, dt, dir, { run: Math.hypot(c.x - b.x, c.z - b.z) > 4 && b.stam > 50 }); return; }
  }
  wander(sim, b, dt);
}

function gunner(sim, b, dt) {
  const B = brain(sim, b);
  const k = B.known != null ? sim.byId.get(B.known) : null;
  if (k && k.st === 'ok' && canSee(sim, b, k)) {
    B.wantDraw = true;
    const a = aimAt(sim, b, k, B.lv.aimErr * (1 + (k.moving ? 1 : 0)));
    // garder ses distances : on recule s'il approche, on avance s'il est loin
    let dir = null;
    if (a.d < 4) dir = { dx: b.x - k.x, dz: b.z - k.z };
    else if (a.d > 11) dir = { dx: k.x - b.x, dz: k.z - b.z };
    steer(sim, b, dt, dir, { faceYaw: a.yaw, pitch: a.pitch, run: a.d < 4 });
    const err = Math.abs(angDiff(a.yaw, B.yaw));
    if (B.react <= 0 && b.drawn && b.cd.gun <= 0 && b.cd.draw <= 0 && err < B.lv.fireTol + 0.3 / Math.max(2, a.d)) { B.fc++; B.aimN = null; B.react = B.lv.react * 0.5; }
    return;
  }
  // vu récemment : on va voir là où il était
  if (k && B.lastSeen && sim.time - (B.lastSeen.t || 0) < 12) {
    B.wantDraw = true;
    goTo(sim, b, B.lastSeen.x, B.lastSeen.z, B.lastSeen.lv, 'hunt');
    const dir = follow(sim, b, dt);
    if (!dir) B.lastSeen = null;
    steer(sim, b, dt, dir, { run: true });
    return;
  }
  // patrouille, arme parfois sortie
  if (B.holdT <= 0) { B.holdT = 4 + Math.random() * 6; B.patrolDraw = Math.random() < 0.35; }
  B.holdT -= dt;
  B.wantDraw = B.patrolDraw && b.role !== 'x';
  if (b.role === 'x') { innocent(sim, b, dt); return; }
  B.moodT = (B.moodT ?? 0) - dt;
  if (B.moodT <= 0) { B.moodT = 3 + Math.random() * 3; B.greedy = Math.random() < 0.6; }
  const c = B.greedy || B.goal?.tag === 'coin' ? nearCoin(sim, b, 6) : null;
  if (c) { goTo(sim, b, c.x, c.z, c.lv, 'coin'); steer(sim, b, dt, follow(sim, b, dt) || { dx: c.x - b.x, dz: c.z - b.z }); return; }
  wander(sim, b, dt);
}

function murderer(sim, b, dt) {
  const B = brain(sim, b), w = sim.w;
  const live = sim.players.filter((q) => q !== b && q.st === 'ok');
  // les armes qu'on voit : un revolver sorti qui nous regarde, c'est dangereux
  const guns = live.filter((q) => q.drawn && sim.holding(q) === 'gun' && canSee(sim, b, q));
  // il ne se sent visé que s'il s'est montré (couteau sorti ou meurtre récent) : sinon il reste l'innocent qu'il joue
  if (b.drawn || b.atkT > 0) B.exposedT = 10;
  B.exposedT = Math.max(0, (B.exposedT || 0) - dt);
  const threat = B.exposedT > 0 && guns.find((q) => { const dx = b.x - q.x, dz = b.z - q.z, d = Math.hypot(dx, dz); const f = (-Math.sin(q.yaw) * dx - Math.cos(q.yaw) * dz) / (d || 1); return f > 0.75 && d < 22; });
  // couteau lancé : on va le chercher (il revient aussi tout seul)
  if (!b.hasKnife) {
    B.wantDraw = false;
    const kn = w.knives.find((k) => k.owner === b.id && !k.fly);
    if (kn && Math.hypot(kn.x - b.x, kn.z - b.z) < 20) { goTo(sim, b, kn.x, kn.z, b.lv, 'knife'); steer(sim, b, dt, follow(sim, b, dt) || { dx: kn.x - b.x, dz: kn.z - b.z }, { run: true }); if (Math.hypot(kn.x - b.x, kn.z - b.z) < 2) B.uc++; return; }
    wander(sim, b, dt, true); return;
  }
  // coupure de courant quand ça arrange
  if (B.boT <= 0 && b.cd.bo <= 0 && w.bo <= 0) { B.bc++; B.boT = 25 + Math.random() * 40; }
  // un tireur nous vise : soit on le lance (expert), soit on range et on file
  if (threat) {
    const d = Math.hypot(threat.x - b.x, threat.z - b.z);
    if (d < 2.6) { // trop près pour fuir : on frappe
      const a = aimAt(sim, b, threat, 0);
      B.wantDraw = true; steer(sim, b, dt, { dx: threat.x - b.x, dz: threat.z - b.z }, { faceYaw: a.yaw, run: true });
      if (b.drawn && b.cd.draw <= 0 && b.cd.stab <= 0) B.fc++;
      return;
    }
    if (B.duel || (d > 3 && d < 16 && B.throwCd <= 0 && Math.random() < B.lv.throwP * dt * 1.6)) {
      B.duel = B.duel || 1.2;
      B.duel -= dt;
      const a = aimAt(sim, b, threat, B.lv.aimErr);
      B.wantDraw = true; steer(sim, b, dt, null, { faceYaw: a.yaw, pitch: a.pitch + 0.02 + d * 0.004 });
      if (b.drawn && b.cd.draw <= 0 && Math.abs(angDiff(a.yaw, B.yaw)) < 0.07) { B.sc++; B.throwCd = 6; B.duel = 0; }
      if (B.duel <= 0) B.duel = 0;
      return;
    }
    B.wantDraw = false;
    if (!B.goal || B.goal.tag !== 'hide' || B.repath <= 0) { let best = null, bd = -1; for (let i = 0; i < 10; i++) { const c = sim.M.walk[Math.floor(Math.random() * sim.M.walk.length)]; const dd = Math.hypot(c.x - threat.x, c.z - threat.z) + (c.lv !== threat.lv ? 14 : 0); if (dd > bd && Math.hypot(c.x - b.x, c.z - b.z) < 24) { bd = dd; best = c; } } if (best) goTo(sim, b, best.x, best.z, best.lv, 'hide'); }
    steer(sim, b, dt, follow(sim, b, dt), { run: true });
    return;
  }
  // au début, on se fond dans la foule
  if (B.calm === undefined) B.calm = 12 + Math.random() * 14;
  if (B.calm > 0) { B.calm -= dt; B.wantDraw = false; const c = nearCoin(sim, b, 7); if (c) { goTo(sim, b, c.x, c.z, c.lv, 'coin'); steer(sim, b, dt, follow(sim, b, dt) || { dx: c.x - b.x, dz: c.z - b.z }); } else wander(sim, b, dt); return; }
  // la proie : la plus proche, de préférence seule (personne d'autre ne la voit)
  let tgt = B.target ? sim.byId.get(B.target) : null;
  if (!tgt || tgt.st !== 'ok' || B.retarget <= 0) {
    B.retarget = 4 + Math.random() * 3;
    let best = null, bs = Infinity;
    for (const q of live) {
      const witnesses = live.filter((o) => o !== q && Math.hypot(o.x - q.x, o.z - q.z) < 9 && o.lv === q.lv).length;
      const s = dist(b, q) + witnesses * 8 + (q.drawn ? 25 : 0);
      if (s < bs) { bs = s; best = q; }
    }
    tgt = best; B.target = best ? best.id : null;
  }
  B.retarget = (B.retarget ?? 0) - dt;
  if (!tgt) { wander(sim, b, dt); return; }
  const d = Math.hypot(tgt.x - b.x, tgt.z - b.z), sameLv = tgt.lv === b.lv && Math.abs(tgt.y - b.y) < 1.2;
  const see = canSee(sim, b, tgt);
  const witnesses = live.filter((o) => o !== tgt && canSee(sim, o, b)).length;
  // lancer de loin, quand personne ne regarde (ou en pleine coupure)
  if (see && sameLv && d > 5.5 && d < 15 && B.throwCd <= 0 && (witnesses === 0 || w.bo > 0) && Math.random() < B.lv.throwP * dt * 1.2) {
    const a = aimAt(sim, b, tgt, B.lv.aimErr * (tgt.moving ? 1.6 : 1));
    // on vise devant celui qui court
    const lead = tgt.moving ? 0.12 : 0;
    B.wantDraw = true; B.throwAim = { yaw: a.yaw + lead * (Math.random() < 0.5 ? 1 : -1) * 0, pitch: a.pitch + d * 0.006 };
    B.throwCd = 5 + Math.random() * 4;
  }
  if (B.throwAim) {
    steer(sim, b, dt, null, { faceYaw: B.throwAim.yaw, pitch: B.throwAim.pitch });
    if (b.drawn && b.cd.draw <= 0 && Math.abs(angDiff(B.throwAim.yaw, B.yaw)) < 0.05) { B.sc++; B.throwAim = null; }
    if (B.throwCd < 3.5) B.throwAim = null;
    return;
  }
  // approche : arme cachée tant qu'on n'est pas tout près, ou si quelqu'un regarde
  const quiet = witnesses === 0 || w.bo > 0 || (B.lv === LEVEL.expert && witnesses === 1 && d < 1.8);
  const close = see && sameLv && quiet && d < (B.lv === LEVEL.facile ? 4 : 2.7);
  B.wantDraw = close;
  if (close) {
    const a = aimAt(sim, b, tgt, 0);
    steer(sim, b, dt, d > 1.0 ? { dx: tgt.x - b.x, dz: tgt.z - b.z } : null, { faceYaw: a.yaw, pitch: 0, run: true });
    if (d < STAB_R * 0.85 && b.drawn && b.cd.draw <= 0 && b.cd.stab <= 0 && Math.abs(angDiff(a.yaw, B.yaw)) < 0.8) B.fc++;
    return;
  }
  // trop de monde autour : on suit de loin, l'air de rien
  if (see && sameLv && !quiet && d < 6) { B.wantDraw = false; if (Math.random() < dt * 0.4) B.retarget = 0; wander(sim, b, dt); return; }
  goTo(sim, b, tgt.x, tgt.z, tgt.lv, 'hunt');
  const dir = follow(sim, b, dt);
  steer(sim, b, dt, dir || { dx: tgt.x - b.x, dz: tgt.z - b.z }, { run: d < 9 && b.stam > 30 && quiet });
}
