// Pilotes de Dogfight 3D : ils choisissent où viser, et le même instructeur que le joueur pilote l'avion.
// Trois niveaux, de vraies différences de visée, de discipline de tir et de réflexes.
import { computeLead, stepLock, abActive, LOCK_RANGE } from './weapons.js';
import { CENTER, ZONE, ZONE_WARN, zoneDist, TYPES } from './flight.js';
import { ZONE_CEIL } from './modes.js';

// ab : chance de bien utiliser sa capacité quand l'occasion se présente
export const LEVELS = {
  facile: { react: 0.8, err: 0.014, wobble: 0.5, range: 420, cone: 0.995, burst: 0.8, rest: 0.75, sight: 1100, pull: 0.72, missiles: false, flares: 0, evade: 0, heat: 0.6, margin: 90, patience: 3.5, extend: 3.2, ab: 0.25 },
  normal: { react: 0.4, err: 0.01, wobble: 0.9, range: 500, cone: 0.9965, burst: 1, rest: 0.45, sight: 1500, pull: 0.86, missiles: true, flares: 0.45, evade: 0.2, heat: 0.75, margin: 70, patience: 4.5, extend: 2.8, ab: 0.6 },
  expert: { react: 0.2, err: 0.006, wobble: 1.3, range: 640, cone: 0.998, burst: 1.3, rest: 0.3, sight: 1800, pull: 1, missiles: true, flares: 0.9, evade: 0.4, heat: 0.85, margin: 55, patience: 6, extend: 2.2, ab: 1 },
};

// La capacité : chacun la garde pour le bon moment
function wantsAbility(b, g, t, l, align) {
  const id = (TYPES[b.type] || {}).ab, enemy = (q) => q.alive && q.id !== b.id && !(b.team && q.team === b.team) && q.type !== 'cargo';
  if (id === 'surge' || id === 'brrrt') return !!(t && l.dist < 520 && align > 0.985);
  if (id === 'stealth') return b.warn || g.planes.some((q) => enemy(q) && q.lockId === b.id && q.lockT > 0.5);
  if (id === 'jam') return b.warn || g.missiles.some((m) => m.team !== b.team && b.team && (m.x - b.x) ** 2 + (m.z - b.z) ** 2 < 800 * 800);
  if (id === 'salvo') return !!(t && l.dist > 300 && l.dist < LOCK_RANGE && align > 0.9 && b.msCd > 4);
  if (id === 'cobra') {
    if (b.speed < 120) return false;
    return g.planes.some((q) => { if (!enemy(q)) return false; const dx = b.x - q.x, dy = b.y - q.y, dz = b.z - q.z, d = Math.hypot(dx, dy, dz) || 1; return d < 380 && (dx * q.fx + dy * q.fy + dz * q.fz) / d > 0.93 && (dx * b.fx + dy * b.fy + dz * b.fz) / d > 0.5; });
  }
  return false;
}

const norm = (x, y, z) => { const n = Math.hypot(x, y, z) || 1; return { x: x / n, y: y / n, z: z / n }; };

// Domination : la zone à rejoindre. Les zones à prendre d'abord, les proches, et on ne s'y met pas tous
function chooseZone(b, g, a) {
  a.zoneT = (a.zoneT || 0) - 1;
  if (a.zone && a.zoneT > 0) return g.zones.find((z) => z.id === a.zone);
  let best = null, score = Infinity;
  for (const z of g.zones) {
    let s = Math.hypot(z.x - b.x, z.z - b.z) / 500 + (z.own === b.team ? 1.8 : z.own ? 0.3 : 0) + Math.random() * 0.4;
    for (const q of g.planes) if (q !== b && q.alive && q.team === b.team && q.ai && q.ai.zone === z.id) s += 0.9;
    if (s < score) { score = s; best = z; }
  }
  a.zone = best ? best.id : null; a.zoneT = 180;
  return best;
}

export function botInput(b, g, world, dt) {
  const L = LEVELS[b.lvl] || LEVELS.normal;
  const inp = { p: 0, r: 0, y: 0, boost: false, brake: false, fire: false, msl: false, flare: false, ab: false, lim: L.pull };
  const a = b.ai || (b.ai = { t: Math.random() * L.react, target: null, seed: Math.random() * 100, burst: 0, rest: 0, way: null, wayT: 0, evade: 0, ex: 0, ey: 0, ez: 0, stuck: 0, ext: 0, xx: 0, xz: 0, abT: 0 });
  a.t -= dt; a.abT -= dt;
  // une fois par demi-seconde, on se demande si c'est le moment de la capacité (le Cobra et le brouilleur servent aussi en défense)
  const abCheck = () => { if (b.abCd > 0 || a.abT > 0) return false; a.abT = 0.5; return Math.random() < L.ab; };

  // 1. Le sol d'abord : on regarde devant soi, d'autant plus loin qu'on va vite
  const here = world.obstacleAt(b.x, b.z), alt = b.y - here;
  let danger = 0;
  for (const s of [0.8, 1.6, 2.6, 3.6]) {
    const d = b.speed * s, h = world.obstacleAt(b.x + b.fx * d, b.z + b.fz * d), yy = b.y + b.fy * d;
    if (yy < h + L.margin) danger = Math.max(danger, 1 - s / 5);
  }
  if (alt < L.margin * 0.8) danger = 1;
  if (danger > 0) {
    const up = 0.45 + danger * 0.75;
    const dir = norm(b.fx, up, b.fz);
    inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.lim = 1;
    inp.boost = b.speed < 150;
    return inp;
  }

  // 2. Pas de collision : on calcule le point de croisement, et on s'écarte tant qu'il reste du temps
  for (const q of g.planes) {
    if (!q.alive || q.id === b.id) continue;
    const dx = q.x - b.x, dy = q.y - b.y, dz = q.z - b.z, d = Math.hypot(dx, dy, dz);
    if (d > 520 || d < 1) continue;
    const rvx = q.fx * q.speed - b.fx * b.speed, rvy = q.fy * q.speed - b.fy * b.speed, rvz = q.fz * q.speed - b.fz * b.speed, rv2 = rvx * rvx + rvy * rvy + rvz * rvz;
    const tc = rv2 > 1 ? -(dx * rvx + dy * rvy + dz * rvz) / rv2 : -1;
    if (tc < 0 || tc > 1.9) continue;
    const miss = Math.hypot(dx + rvx * tc, dy + rvy * tc, dz + rvz * tc);
    if (miss < 26) {
      const away = b.id < q.id ? 1 : -1, cx = dx + rvx * tc, cy = dy + rvy * tc, cz = dz + rvz * tc, cn = Math.hypot(cx, cy, cz) || 1;
      const e = norm(b.fx - cx / cn * 0.8 + b.lx * away * 0.6, b.fy - cy / cn * 0.8 + (b.y - here < 200 ? 0.5 : 0), b.fz - cz / cn * 0.8 + b.lz * away * 0.6);
      inp.ax = e.x; inp.ay = e.y; inp.az = e.z; inp.lim = 1;
      return inp;
    }
  }

  // 3. Trop loin ou trop haut au-dessus du relief : retour vers le centre de la zone
  const dcx = ZONE.x - b.x, dcz = ZONE.z - b.z, dist = Math.hypot(dcx, dcz), out = zoneDist(b.x, b.z);
  if (out > ZONE_WARN - 200 || alt > 950) {
    const dir = norm(dcx / (dist || 1), alt > 700 ? -0.4 : 0.05, dcz / (dist || 1));
    inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.boost = out > ZONE_WARN;
    return inp;
  }

  // 4. Choix de la cible : devant et proche, jamais à travers un nuage
  if (a.t <= 0) {
    a.t = L.react;
    let best = null, bestScore = -Infinity;
    const cargo = g.cargo ? g.planes.find((q) => q.type === 'cargo') : null;
    for (const q of g.planes) {
      if (!q.alive || q.id === b.id || (b.team && b.team === q.team)) continue;
      const dx = q.x - b.x, dy = q.y - b.y, dz = q.z - b.z, d = Math.hypot(dx, dy, dz) || 1;
      const sight = L.sight * (TYPES[q.type] || TYPES.f16).sig ** 0.5;
      if (d > sight || (d > 260 && world.inCloud(q.x, q.y, q.z)) || (d > 320 && abActive(q, 'stealth'))) continue;
      const dot = (dx * b.fx + dy * b.fy + dz * b.fz) / d;
      let score = dot * 1.6 - d / 700 + (q.id === a.target ? 0.5 : 0) + (q.health < 40 ? 0.3 : 0);
      if (q.type === 'cargo') score += 1.2;
      else if (cargo && cargo.alive && b.team === cargo.team && Math.hypot(q.x - cargo.x, q.z - cargo.z) < 650) score += 0.7;
      // l'assaillant se retourne contre le chasseur qui lui colle aux ailes
      else if (cargo && b.team !== cargo.team && d < 600 && (-dx * q.fx - dy * q.fy - dz * q.fz) / d > 0.8) score += 1.6;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    a.target = best ? best.id : null;
    // on nous tire dessus ? rupture
    if (a.evade <= 0 && Math.random() < L.evade) {
      for (const q of g.planes) {
        if (!q.alive || q.id === b.id || (b.team && b.team === q.team)) continue;
        const dx = b.x - q.x, dy = b.y - q.y, dz = b.z - q.z, d = Math.hypot(dx, dy, dz) || 1;
        if (d < 380 && (dx * q.fx + dy * q.fy + dz * q.fz) / d > 0.97 && (dx * b.fx + dy * b.fy + dz * b.fz) / d > 0.3) {
          const s = Math.random() < 0.5 ? 1 : -1, e = norm(b.lx * s + b.fx * 0.25, Math.random() * 0.5 - 0.15, b.lz * s + b.fz * 0.25);
          a.ex = e.x; a.ey = e.y; a.ez = e.z; a.evade = 0.9 + Math.random() * 0.8;
          break;
        }
      }
    }
  }
  // un missile nous suit : leurre et rupture
  if ((b.warn || (TYPES[b.type] || {}).ab === 'cobra') && abCheck() && wantsAbility(b, g, null, null, 0)) inp.ab = true;
  if (b.warn) {
    if (b.flCd <= 0 && Math.random() < L.flares * dt * 3) inp.flare = true;
    if (a.evade <= 0 && Math.random() < L.evade * dt * 4) { const s = Math.random() < 0.5 ? 1 : -1, e = norm(b.lx * s, 0.2, b.lz * s); a.ex = e.x; a.ey = e.y; a.ez = e.z; a.evade = 1.4; }
  }
  if (a.evade > 0) {
    a.evade -= dt;
    let dir = { x: a.ex, y: a.ey, z: a.ez };
    if (alt < 180 && dir.y < 0.1) dir = norm(dir.x, 0.25, dir.z);
    inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.lim = 1; inp.boost = b.speed < 170;
    return inp;
  }

  const t = a.target !== null ? g.planes.find((q) => q.id === a.target && q.alive) : null;

  // Domination : on descend sur la zone, et on ne quitte sa route que pour un ennemi tout proche
  if (g.zones) {
    const z = chooseZone(b, g, a), td = t ? Math.hypot(t.x - b.x, t.y - b.y, t.z - b.z) : Infinity;
    if (z && td > 380) {
      const dx = z.x - b.x, dz = z.z - b.z, d = Math.hypot(dx, dz) || 1, inside = d < z.r * 0.75;
      // sur place, on tourne autour du centre pour rester dedans
      const side = String(b.id).length % 2 ? 1 : -1, tx = inside ? -dz / d * side + dx / d * 0.35 : dx / d, tz = inside ? dx / d * side + dz / d * 0.35 : dz / d;
      const ahead = Math.max(world.obstacleAt(b.x + b.fx * 150, b.z + b.fz * 150), here), want = d < 750 ? ahead + Math.min(ZONE_CEIL - 30, L.margin + 40) : Math.max(ahead + 170, 230);
      const dir = norm(tx, Math.max(-0.45, Math.min(0.5, (want - b.y) / 160)), tz);
      inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.boost = d > 700 && b.ab > 0.4; inp.lim = Math.max(L.pull, 0.85);
      return inp;
    }
  }

  // 5. Personne en vue : on part vers l'adversaire le plus proche, le ciel n'est jamais vide longtemps
  if (!t) {
    let near = null, nd = Infinity;
    for (const q of g.planes) {
      if (!q.alive || q.id === b.id) continue;
      // l'escorte reste près du transport ; les autres cherchent l'adversaire le plus proche
      const friend = b.team && b.team === q.team;
      if (friend && q.type !== 'cargo') continue;
      const d = Math.hypot(q.x - b.x, q.y - b.y, q.z - b.z);
      if (friend) { near = q; nd = d; break; }
      if (d < nd) { nd = d; near = q; }
    }
    a.wayT -= dt;
    if (!a.way || a.wayT <= 0) {
      const an = Math.random() * 6.283, r = near ? (near.type === 'cargo' && near.team === b.team ? 140 : 60) + Math.random() * 120 : 200 + Math.random() * 500;
      const wx = near ? near.x + Math.cos(an) * r : CENTER + Math.cos(an) * r, wz = near ? near.z + Math.sin(an) * r : CENTER + Math.sin(an) * r, wg = world.obstacleAt(wx, wz);
      a.way = near ? { x: wx, y: Math.max(here + 160, wg + 140, Math.min(wg + 380, near.y + 20)), z: wz } : { x: wx, y: wg + 200 + Math.random() * 180, z: wz };
      a.wayT = near ? 2.5 : 8;
    }
    const dir = norm(a.way.x - b.x, (a.way.y - b.y) * 0.8, a.way.z - b.z);
    inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.boost = nd > 900 && b.ab > 0.4;
    return inp;
  }

  // Deux avions qui tournent l'un derrière l'autre sans jamais s'aligner ne se touchent pas : au bout d'un moment,
  // l'un casse le cercle et file tout droit pour reprendre de la vitesse. C'est là que l'autre peut le tirer.
  if (a.ext > 0) {
    a.ext -= dt;
    const dir = norm(a.xx, alt < 170 ? 0.18 : b.y > 420 ? -0.12 : 0, a.xz);
    inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z; inp.boost = b.speed < 170 && b.ab > 0.3;
    return inp;
  }

  // 6. Poursuite : viser le point d'anticipation, avec une erreur qui dépend du niveau
  const l = computeLead(b.x, b.y, b.z, b.fx * b.speed, b.fy * b.speed, b.fz * b.speed, t.x, t.y, t.z, t.fx * t.speed, t.fy * t.speed, t.fz * t.speed);
  const time = g.clock + a.seed, e = L.err;
  let dir = norm(l.x - b.x, l.y - b.y, l.z - b.z);
  dir = norm(dir.x + Math.sin(time * L.wobble * 1.3) * e, dir.y + Math.sin(time * L.wobble * 1.9 + 1) * e, dir.z + Math.cos(time * L.wobble * 1.7 + 2) * e);
  // à basse altitude, on ne plonge pas sur une cible
  if (alt < (g.zones ? L.margin + 35 : 130) && dir.y < 0) dir = norm(dir.x, 0.02, dir.z);
  // le combat reste près du relief : on ne suit pas une cible jusqu'au plafond
  if (alt > 420 && (l.dist > 450 || dir.x * b.fx + dir.y * b.fy + dir.z * b.fz < 0.97)) dir = norm(dir.x, dir.y - Math.min(0.8, (alt - 420) / 320), dir.z);
  inp.ax = dir.x; inp.ay = dir.y; inp.az = dir.z;

  const align = dir.x * b.fx + dir.y * b.fy + dir.z * b.fz;
  a.stuck = align < 0.9 ? a.stuck + dt : Math.max(0, a.stuck - dt * 2);
  if (a.stuck > L.patience) { const n = Math.hypot(b.fx, b.fz) || 1; a.stuck = 0; a.ext = L.extend * (0.8 + Math.random() * 0.4); a.xx = b.fx / n; a.xz = b.fz / n; a.target = null; a.t = a.ext; return inp; }
  // 7. Gaz
  inp.boost = l.dist > 520 && b.ab > 0.25;
  inp.brake = l.dist < 130 && align > 0.5;

  // 8. Tir : rafales courtes, canon surveillé
  if (a.rest > 0) a.rest -= dt;
  const inFire = align > L.cone && l.dist < L.range && !b.over && b.heat < L.heat;
  if (inFire && a.rest <= 0) {
    inp.fire = true;
    a.burst += dt;
    if (a.burst > L.burst) { a.burst = 0; a.rest = L.rest * (0.7 + Math.random() * 0.6); }
  } else if (!inFire) a.burst = Math.max(0, a.burst - dt);

  // 9. Missile quand l'accrochage est complet, capacité quand l'occasion se présente
  if (L.missiles && b.lockT >= 1 && b.msCd <= 0 && l.dist > 280) inp.msl = true;
  if (abCheck() && wantsAbility(b, g, t, l, align)) inp.ab = true;
  return inp;
}
export { stepLock };
