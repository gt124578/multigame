// Fief Maudit : les coéquipiers IA. Un bot joue avec les mêmes entrées qu'un joueur (direction, clic, E, E tenu) :
// il relève un équipier à terre, se bat contre les squelettes qui approchent, charge les braseros au crépuscule
// et la nuit, et le jour coupe du bois près du village et le rentre à l'entrepôt. Il se déplace par les chemins
// de la grille (nav.js). Moteur PUR.
import { FUEL, REACH, CYCLE, BEAM, FOOD, LOAD_MAX, emptyInput, jobOf } from './sim.js';
import { inZone } from './crypt.js';
import { TREE_R, rectOf } from './map.js';

const THINK = 0.3;   // secondes entre deux décisions

export function botInput(sim, p) {
  const ai = p.ai || (p.ai = { fc: 0, uc: 0, ac: 0, goal: null, path: null, pathAt: -9, pathTo: null, think: 0, cool: 0, stuck: 0, tree: null });
  const out = { wx: 0, wz: 0, walk: false, jump: false, hold: false, fc: ai.fc, uc: ai.uc, ac: ai.ac };
  if (p.down || p.dead) return out;
  ai.think -= 1 / 30; ai.cool -= 1 / 30;
  // une poutre en main : on suit son équipier (mêmes gestes que lui), ou on lâche s'il ne vient pas
  if (p.carry === 'poutre') {
    const b = sim.beams.find((o) => o.id === p.beam);
    const mate = b && b.h.map((id) => (id === null || id === p.id ? null : sim.player(id))).find(Boolean);
    if (!b || !mate) { ai.wait = (ai.wait || 0) + 1 / 30; if (ai.wait > 3 && ai.cool <= 0) { out.uc = ++ai.uc; ai.cool = 1; ai.wait = 0; } return out; }
    ai.wait = 0;
    const mi = sim.inputs.get(mate.id) || emptyInput();
    // il tire dans le même sens que son équipier, et se recale à bonne distance
    out.wx = mi.wx || 0; out.wz = mi.wz || 0;
    return out;
  }
  if (ai.think <= 0 || !ai.goal) { ai.think = THINK; ai.goal = decide(sim, p, ai); }
  const G = ai.goal;
  if (!G) return out;
  // la capacité du métier, quand elle sert
  if (p.cd <= 0 && !p.act && !p.carry && ai.cool <= 0 && wantAbility(sim, p)) { out.ac = ++ai.ac; ai.cool = 0.5; return out; }
  const d = Math.hypot(G.x - p.x, G.z - p.z);
  if (d > G.near) {
    // en route
    if (!ai.path || !ai.path.length || sim.t - ai.pathAt > 2.5 || Math.hypot(ai.pathTo[0] - G.x, ai.pathTo[1] - G.z) > 1.5) {
      ai.path = sim.inCrypt(p.x, p.z) ? cryptPath(sim, p, G) : sim.nav.path(p.x, p.z, G.x, G.z, sim.fallen); if (!ai.path || !ai.path.length) ai.path = [[G.x, G.z]]; ai.pathAt = sim.t; ai.pathTo = [G.x, G.z];
    }
    while (ai.path.length > 1 && Math.hypot(ai.path[0][0] - p.x, ai.path[0][1] - p.z) < 0.7) ai.path.shift();
    const w = ai.path[0], wx = w[0] - p.x, wz = w[1] - p.z, wd = Math.hypot(wx, wz) || 1;
    out.wx = wx / wd; out.wz = wz / wd;
    if (p.speed < 0.6 && !p.act) { ai.stuck += 1 / 30; if (ai.stuck > 1) { ai.path = null; ai.stuck = 0; } } else ai.stuck = 0;
    return out;
  }
  // arrivé : le geste
  if (p.act) return out;
  if (G.kind === 'revive' || G.kind === 'lever') out.hold = true;
  else if ((G.kind === 'fight' || G.kind === 'chop' || G.kind === 'build') && ai.cool <= 0) { out.fc = ++ai.fc; ai.cool = 0.25; }
  else if ((G.kind === 'pick' || G.kind === 'store' || G.kind === 'feed' || G.kind === 'take' || G.kind === 'beam' || G.kind === 'eat' || G.kind === 'gather' || G.kind === 'descend' || G.kind === 'relight' || G.kind === 'open') && ai.cool <= 0) { out.uc = ++ai.uc; ai.cool = 0.8; }
  return out;
}

function decide(sim, p, ai) {
  const M = sim.map, dist = (o) => Math.hypot(o.x - p.x, o.z - p.z);
  const foes = sim.foes.filter((f) => f.state !== 'dead' && f.state !== 'rise');
  const close = foes.filter((f) => dist(f) < 2.6);
  // 1. relever un équipier, si personne ne le frappe dans le dos
  const down = sim.players.filter((o) => o !== p && o.down).sort((a, b) => dist(a) - dist(b))[0];
  if (down && dist(down) < 45 && !close.length) return { kind: 'revive', x: down.x, z: down.z, near: REACH.revive - 0.5 };
  // 2. se battre : squelettes près de lui, du feu ou d'un équipier
  const camp = M.campfire;
  const threat = foes.filter((f) => f.state !== 'awaken' || dist(f) < 4)
    .filter((f) => dist(f) < 14 || Math.hypot(f.x - camp.x, f.z - camp.z) < 24 || sim.players.some((o) => !o.bot && !o.down && Math.hypot(o.x - f.x, o.z - f.z) < 8))
    .sort((a, b) => dist(a) - dist(b))[0];
  // blessé la nuit : se replier près du feu (ou d'une maison), ne frapper que ce qui vient au contact
  if (sim.night && p.hp < p.maxHp * 0.35 && !sim.sheltered(p.x, p.z)) {
    if (close.length) return { kind: 'fight', x: close[0].x, z: close[0].z, near: REACH.strike - 0.6 };
    return { kind: 'guard', x: camp.x + Math.sin(p.id) * 2.5, z: camp.z + Math.cos(p.id) * 2.5, near: 1.2 };
  }
  if (threat && !p.carry) return { kind: 'fight', x: threat.x, z: threat.z, near: REACH.strike - 0.6 };
  // la crypte ouverte : on y descend, on tient un levier, on rallume les torches, on suit les autres jusqu'au Roi
  if (sim.crypt.open && !p.carry) { const g = cryptGoal(sim, p, foes); if (g) return g; }
  // 2b. un équipier attend à un bout de poutre : prendre l'autre bout
  if (!p.carry) for (const b of sim.beams) {
    const k = b.h.findIndex((id) => id !== null && !sim.player(id)?.bot);
    if (k < 0 || b.lifted || b.h[1 - k] !== null) continue;
    const [ex, ez] = sim.beamEnds(b)[1 - k];
    if (Math.hypot(ex - p.x, ez - p.z) < 60) return { kind: 'beam', x: ex, z: ez, near: BEAM.grab - 0.7 };
  }
  const dark = sim.darkness > 0 || sim.clock.t > sim.dayLen - CYCLE.dusk - 40;
  // 3. une bûche en main : le brasero le plus vide, ou l'entrepôt
  if (p.carry) {
    if (dark && p.carry === 'bois') {
      const b = M.braziers.filter((o) => sim.braziers[o.id].fuel < FUEL.max - FUEL.log).sort((a, b2) => sim.braziers[a.id].fuel - sim.braziers[b2.id].fuel)[0];
      if (b) return { kind: 'feed', x: b.x, z: b.z, near: REACH.feed - 0.6 };
    }
    // encore de la place dans les bras : la bûche d'à côté
    if (p.carry === 'bois' && p.load < LOAD_MAX) { const l = sim.logs.filter((o) => o.ready && dist(o) < 8).sort((a, b) => dist(a) - dist(b))[0]; if (l) return { kind: 'pick', x: l.x, z: l.z, near: REACH.pick - 0.7 }; }
    return { kind: 'store', x: M.depot.x, z: M.depot.z, near: REACH.store - 1.2 };
  }
  // 3b. les mains vides au crépuscule ou la nuit : reprendre du bois à l'entrepôt pour un brasero qui faiblit
  if (dark && sim.stock.bois > 0 && sim.goal >= 4 && M.braziers.some((o) => sim.braziers[o.id].fuel < FUEL.max - FUEL.log - 10))
    return { kind: 'take', x: M.depot.x, z: M.depot.z, near: REACH.store - 1.2 };
  // 3c. manger quand on a faim
  if (p.food < 35 && sim.stock.nourriture > 0) return { kind: 'eat', x: M.depot.x, z: M.depot.z, near: REACH.store - 1.2 };
  // 3d. le jour : un chantier ouvert a besoin de bras
  if (!sim.night) for (const b of M.buildings) {
    if (!sim.build[b.id] || sim.build[b.id].state !== 'chantier') continue;
    const R = rectOf(b), cx = Math.max(R.x0, Math.min(R.x1, p.x)), cz = Math.max(R.z0, Math.min(R.z1, p.z));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1;
    return { kind: 'build', x: cx + dx / d * 1.3, z: cz + dz / d * 1.3, near: 0.8 };
  }
  // 3e. le jour, s'il manque des vivres : cueillir
  if (!dark && sim.stock.nourriture < 2 + sim.players.length) {
    const bush = M.bushes.filter((o) => sim.berries[o.id].ready && !sim.players.some((q) => q !== p && q.ai && q.ai.goal && q.ai.goal.kind === 'gather' && q.ai.goal.id === o.id)).sort((a, c) => dist(a) - dist(c))[0];
    if (bush && dist(bush) < 70) { const a2 = Math.atan2(p.x - bush.x, p.z - bush.z); return { kind: 'gather', id: bush.id, x: bush.x + Math.sin(a2) * 1.3, z: bush.z + Math.cos(a2) * 1.3, near: 0.6 }; }
  }
  // 3f. le jour : un coffre dont les gardes sont tombés
  if (!dark) {
    const c = sim.chests.filter((o) => !o.open && dist(o) < 60 && !sim.foes.some((f) => f.guard === o.id && f.state !== 'dead')).sort((a, b) => dist(a) - dist(b))[0];
    if (c) { const a2 = Math.atan2(p.x - c.x, p.z - c.z); return { kind: 'open', x: c.x + Math.sin(a2) * 1.3, z: c.z + Math.cos(a2) * 1.3, near: 0.5 }; }
  }
  // 4. la nuit sans ennemi proche : rester près du feu (et ramasser les bûches qui traînent près des braseros)
  const log = sim.logs.filter((l) => l.ready && Math.hypot(l.x - camp.x, l.z - camp.z) < (dark ? 25 : 60)).sort((a, b) => dist(a) - dist(b))[0];
  if (log) return { kind: 'pick', x: log.x, z: log.z, near: REACH.pick - 0.7 };
  if (sim.night) return { kind: 'guard', x: camp.x + Math.sin(p.id) * 4, z: camp.z + Math.cos(p.id) * 4, near: 1.5 };
  // 5. le jour : couper le bois le plus proche de l'entrepôt (on garde son arbre tant qu'il est debout)
  let t = ai.tree !== null && ai.tree !== undefined && !sim.trees[ai.tree].down ? M.trees[ai.tree] : null;
  if (!t) {
    const cand = M.trees.filter((o) => !sim.trees[o.id].down && Math.hypot(o.x, o.z) > 16 && !sim.players.some((q) => q !== p && q.ai && q.ai.tree === o.id));
    cand.sort((a, b) => Math.hypot(a.x - M.depot.x, a.z - M.depot.z) - Math.hypot(b.x - M.depot.x, b.z - M.depot.z));
    t = cand[0]; ai.tree = t ? t.id : null;
  }
  if (!t) return { kind: 'guard', x: camp.x + 3, z: camp.z + 3, near: 1.5 };
  // se placer côté village
  const a = Math.atan2(M.depot.x - t.x, M.depot.z - t.z), off = TREE_R * t.s + 0.9;
  return { kind: 'chop', x: t.x + Math.sin(a) * off, z: t.z + Math.cos(a) * off, near: 0.6 };
}

// ------------------------------------------------------------------ la crypte
function cryptGoal(sim, p, foes) {
  const M = sim.map, K = M.crypt, dist = (o) => Math.hypot(o.x - p.x, o.z - p.z);
  if (!sim.inCrypt(p.x, p.z)) return { kind: 'descend', x: M.cryptDoor.x, z: M.cryptDoor.z + 1.2, near: 1.6 };
  if (!sim.crypt.gate) {
    // le levier que personne d'autre ne tient, le plus proche
    const mine = p.ai.goal && p.ai.goal.kind === 'lever' ? p.ai.goal.id : -1;
    const taken = (l) => sim.players.some((o) => o !== p && !o.dead && (Math.hypot(o.x - l.x, o.z - l.z) < 1.6 || (o.bot && o.ai && o.ai.goal && o.ai.goal.kind === 'lever' && o.ai.goal.id === l.id && o.id < p.id)));
    const l = K.levers.find((o) => o.id === mine && !taken(o)) || K.levers.filter((o) => !taken(o)).sort((a, b) => dist(a) - dist(b))[0];
    if (l) return { kind: 'lever', id: l.id, x: l.x, z: l.z, near: 0.9 };
    return { kind: 'follow', x: (K.x0 + K.x1) / 2 + Math.sin(p.id) * 3, z: K.levers[0].z + 2, near: 1.5 };
  }
  // une torche éteinte, quand rien ne menace autour
  const t = K.torches.filter((o) => !sim.torchLit(o.id)).sort((a, b) => dist(a) - dist(b))[0];
  if (t && !foes.some((f) => Math.hypot(f.x - t.x, f.z - t.z) < 5)) { const s = Math.sign(-t.x) || 1; return { kind: 'relight', x: t.x + s * 1.8, z: t.z, near: 0.7 }; }
  // suivre un joueur humain descendu, sinon avancer vers le trône
  const lead = sim.players.filter((o) => !o.bot && !o.dead && !o.down && sim.inCrypt(o.x, o.z)).sort((a, b) => dist(a) - dist(b))[0];
  if (lead) return { kind: 'follow', x: lead.x + Math.sin(p.id * 2.1) * 2, z: lead.z + Math.cos(p.id * 2.1) * 2, near: 1.5 };
  return { kind: 'follow', x: K.king.x + Math.sin(p.id * 2.1) * 3, z: K.king.z + 6, near: 1.5 };
}
// la crypte est une enfilade de salles le long de l'axe x = milieu : on rejoint l'axe, on le suit, on en ressort
function cryptPath(sim, p, G) {
  const K = sim.map.crypt, mid = (K.x0 + K.x1) / 2;
  const hall = (x, z) => Object.keys(K.halls).find((h) => inZone(K.halls[h], x, z)) || 'col';
  if (hall(p.x, p.z) === hall(G.x, G.z)) return [[G.x, G.z]];
  return [[mid, p.z], [mid, G.z], [G.x, G.z]];
}
// ------------------------------------------------------------------ capacités (F)
function wantAbility(sim, p) {
  const J = jobOf(p), near = (r) => sim.foes.filter((f) => f.state !== 'dead' && f.state !== 'rise' && f.state !== 'awaken' && Math.hypot(f.x - p.x, f.z - p.z) < r);
  const hurt = sim.players.filter((o) => !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 8 && (o.down || o.hp < o.maxHp * 0.55));
  if (J.ab === 'grandcoup') return near(3).length >= 2 || near(3).some((f) => f.kind !== 'minion');
  if (J.ab === 'rempart') return near(6).length >= 3 || (hurt.some((o) => o !== p) && near(8).length > 0);
  if (J.ab === 'fusee') return (sim.night || sim.inCrypt(p.x, p.z)) && !sim.lit(p.x, p.z) && near(9).length > 0;
  if (J.ab === 'priere') return hurt.length >= 1 && (hurt.length >= 2 || hurt.some((o) => o.down) || hurt[0].hp < hurt[0].maxHp * 0.4);
  if (J.ab === 'barricade') return near(7).length >= 2;
  return false;
}
