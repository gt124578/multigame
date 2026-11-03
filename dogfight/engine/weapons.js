// Armement de Dogfight 3D : canon rotatif M61, balles (qui héritent de la vitesse du tireur), surchauffe,
// missiles à accrochage, leurres, et calcul du point d'anticipation.
// Moteur pur : la cadence de tir ne dépend plus des images par seconde.
import { TYPES } from './flight.js';

export const BULLET_SPEED = 780;     // m/s, en plus de la vitesse du tireur
export const BULLET_LIFETIME = 1.6;
export const FIRE_RATE = 25;         // tirs par seconde
export const HIT_RADIUS = 5;
export const BULLET_GRAVITY = 4.9;

export const HEAT_PER_SHOT = 0.035;
export const COOL_RATE = 0.45;
export const OVERHEAT_LOCK = 2;

export const LOCK_TIME = 1.3;        // s pour accrocher un F-16
export const LOCK_CONE = 0.92;       // cos(23°)
export const LOCK_RANGE = 1400;
export const MISSILE_SPEED = 345;
export const MISSILE_ACCEL = 170;
export const MISSILE_TURN = 1.5;     // rad/s
export const MISSILE_LIFE = 7;
export const MISSILE_DAMAGE = 55;
export const MISSILE_FUSE = 14;
export const MISSILE_COOLDOWN = 2;
export const FLARE_COOLDOWN = 1.5;
export const FLARE_TIME = 0.7;
export const FLARE_BREAK = 0.7;      // chance qu'un leurre fasse décrocher un missile

// Point à viser pour toucher (position, vitesse) en tenant compte de sa propre vitesse et de la chute de la balle.
// L'axe du canon doit passer par le point rendu.
export function computeLead(sx, sy, sz, svx, svy, svz, tx, ty, tz, tvx, tvy, tvz) {
  const rvx = tvx - svx, rvy = tvy - svy, rvz = tvz - svz;
  let px = tx, py = ty, pz = tz, t = 0;
  for (let i = 0; i < 3; i++) {
    t = Math.hypot(px - sx, py - sy, pz - sz) / BULLET_SPEED;
    px = tx + rvx * t; py = ty + rvy * t; pz = tz + rvz * t;
  }
  return { x: px, y: py + 0.5 * BULLET_GRAVITY * t * t, z: pz, t, dist: Math.hypot(tx - sx, ty - sy, tz - sz) };
}

const inSeg = (x1, y1, z1, x2, y2, z2, cx, cy, cz, r) => {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = dx * dx + dy * dy + dz * dz;
  let t = len ? ((cx - x1) * dx + (cy - y1) * dy + (cz - z1) * dz) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x1 + t * dx, py = y1 + t * dy, pz = z1 + t * dz, q = (cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2;
  return q <= r * r ? { x: px, y: py, z: pz } : null;
};

// Où la balle a-t-elle frappé ? Dans le repère de l'avion : moteur, queue, aile gauche, aile droite ou corps
export function hitZone(p, x, y, z) {
  const rx = x - p.x, ry = y - p.y, rz = z - p.z, along = rx * p.fx + ry * p.fy + rz * p.fz, side = rx * p.lx + ry * p.ly + rz * p.lz;
  if (Math.abs(side) > 1.5) return side > 0 ? 'L' : 'R';
  if (along < -2.4) return Math.abs(side) < 0.8 && Math.abs(ry) < 0.8 ? 'E' : 'T';
  return 'C';
}

// Un pas d'armement pour un avion : tir, surchauffe. Ajoute les balles dans `bullets`.
export function stepGun(p, fire, dt, bullets, events) {
  if (p.over) { p.overT -= dt; p.heat = Math.max(0, p.overT / OVERHEAT_LOCK); if (p.overT <= 0) { p.over = false; p.heat = 0; } }
  else p.heat = Math.max(0, p.heat - COOL_RATE * dt);
  p.firing = false;
  p.fireAcc = Math.min(p.fireAcc + dt * FIRE_RATE, 2);
  if (!fire || p.over) { p.fireAcc = Math.min(p.fireAcc, 1); return; }
  const T = TYPES[p.type] || TYPES.f16;
  while (p.fireAcc >= 1) {
    p.fireAcc -= 1;
    p.firing = true;
    p.heat += HEAT_PER_SHOT;
    p.shots = (p.shots || 0) + 1;
    if (p.heat >= 1) { p.heat = 1; p.over = true; p.overT = OVERHEAT_LOCK; events.push({ e: 'hot', id: p.id }); p.fireAcc = 0; }
    const sx = (Math.random() - 0.5) * 0.008, sy = (Math.random() - 0.5) * 0.008;
    const dx = p.fx + p.lx * sx + p.ux * sy, dy = p.fy + p.ly * sx + p.uy * sy, dz = p.fz + p.lz * sx + p.uz * sy;
    const b = { x: p.x + p.fx * 3.2, y: p.y + p.fy * 3.2, z: p.z + p.fz * 3.2, vx: dx * BULLET_SPEED + p.fx * p.speed, vy: dy * BULLET_SPEED + p.fy * p.speed, vz: dz * BULLET_SPEED + p.fz * p.speed, age: 0, by: p.id, team: p.team, dmg: T.gun };
    bullets.push(b);
    if (p.over) break;
  }
}

// Avance les balles ; onHit(cible, zone, balle, point) ; le relief et les toits les arrêtent
export function stepBullets(bullets, planes, world, dt, onHit, events) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.age += dt;
    if (b.age >= BULLET_LIFETIME) { bullets.splice(i, 1); continue; }
    b.vy -= BULLET_GRAVITY * dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
    let hit = null, at = null;
    for (const t of planes) {
      if (!t.alive || t.id === b.by || t.inv > 0 || (b.team && b.team === t.team)) continue;
      at = inSeg(b.x, b.y, b.z, nx, ny, nz, t.x, t.y, t.z, t.hitR || HIT_RADIUS);
      if (at) { hit = t; break; }
    }
    if (hit) { bullets.splice(i, 1); onHit(hit, hitZone(hit, at.x, at.y, at.z), b, at); continue; }
    if (world && ny < 130 && ny <= world.obstacleAt(nx, nz)) {
      if (events && b.age > 0.02 && Math.random() < 0.3) events.push({ e: 'dust', x: Math.round(nx), y: Math.round(ny), z: Math.round(nz) });
      bullets.splice(i, 1); continue;
    }
    b.x = nx; b.y = ny; b.z = nz;
  }
}

// L'accrochage : un ennemi dans le cône, hors des nuages, assez longtemps
export function stepLock(p, planes, world, dt) {
  let best = null, bestDot = LOCK_CONE;
  if (p.ms > 0) for (const t of planes) {
    if (!t.alive || t.id === p.id || (p.team && p.team === t.team)) continue;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, d = Math.hypot(dx, dy, dz);
    if (d < 120 || d > LOCK_RANGE) continue;
    const dot = (dx * p.fx + dy * p.fy + dz * p.fz) / d;
    if (dot > bestDot && !(world && world.inCloud(t.x, t.y, t.z))) { bestDot = dot; best = t; }
  }
  if (!best) { p.lockT = Math.max(0, p.lockT - dt * 2); if (p.lockT === 0) p.lockId = null; return; }
  if (best.id !== p.lockId) { p.lockId = best.id; p.lockT = 0; }
  const sig = (TYPES[best.type] || TYPES.f16).sig;
  p.lockT = Math.min(1, p.lockT + dt / (LOCK_TIME / sig));
}

export function launchMissile(p, missiles, events) {
  if (p.ms <= 0 || p.msCd > 0 || p.lockT < 1 || p.lockId === null) return false;
  p.ms--; p.msCd = MISSILE_COOLDOWN;
  const m = { id: p.nextM = (p.nextM || 0) + 1, key: `${p.id}:${p.nextM}`, by: p.id, team: p.team, target: p.lockId, x: p.x - p.ux * 1.2, y: p.y - p.uy * 1.2, z: p.z - p.uz * 1.2, vx: p.fx * (p.speed + 30), vy: p.fy * (p.speed + 30), vz: p.fz * (p.speed + 30), speed: p.speed + 30, age: 0 };
  missiles.push(m);
  events.push({ e: 'mfire', id: p.id, target: p.lockId, x: Math.round(m.x), y: Math.round(m.y), z: Math.round(m.z) });
  p.lockT = 0;
  return true;
}

// Avance les missiles : guidage, leurres, nuages, explosion de proximité
export function stepMissiles(missiles, planes, world, dt, onBlast, events) {
  for (const p of planes) p.warn = false;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.age += dt;
    m.speed = Math.min(MISSILE_SPEED, m.speed + MISSILE_ACCEL * dt);
    const t = m.target !== null ? planes.find((q) => q.id === m.target) : null;
    if (m.target !== null && (!t || !t.alive)) m.target = null;
    if (t && t.alive) {
      // un leurre lâché pendant le vol, ou un nuage, peut faire perdre la cible
      if (t.flT > 0 && !m.seenFlare) { m.seenFlare = true; if (Math.random() < FLARE_BREAK) { m.target = null; events.push({ e: 'mlost', id: t.id }); } }
      if (t.flT <= 0) m.seenFlare = false;
      if (m.target !== null && world && world.inCloud(t.x, t.y, t.z)) { m.blind = (m.blind || 0) + dt; if (m.blind > 0.7) { m.target = null; events.push({ e: 'mlost', id: t.id }); } } else m.blind = 0;
    }
    let dirX = m.vx, dirY = m.vy, dirZ = m.vz, n = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= n; dirY /= n; dirZ /= n;
    if (m.target !== null && t) {
      t.warn = true;
      const tt = Math.hypot(t.x - m.x, t.y - m.y, t.z - m.z) / m.speed;
      const ax = t.x + t.fx * t.speed * tt - m.x, ay = t.y + t.fy * t.speed * tt - m.y, az = t.z + t.fz * t.speed * tt - m.z, an = Math.hypot(ax, ay, az) || 1;
      const k = Math.min(1, MISSILE_TURN * dt / Math.max(0.001, Math.acos(Math.min(1, (ax * dirX + ay * dirY + az * dirZ) / an))));
      dirX += (ax / an - dirX) * k; dirY += (ay / an - dirY) * k; dirZ += (az / an - dirZ) * k;
      n = Math.hypot(dirX, dirY, dirZ) || 1; dirX /= n; dirY /= n; dirZ /= n;
    }
    m.vx = dirX * m.speed; m.vy = dirY * m.speed; m.vz = dirZ * m.speed;
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    let boom = m.age >= MISSILE_LIFE || (world && m.y <= world.obstacleAt(m.x, m.z));
    for (const q of planes) {
      if (!q.alive || q.id === m.by || (m.team && m.team === q.team)) continue;
      if (Math.hypot(q.x - m.x, q.y - m.y, q.z - m.z) < MISSILE_FUSE && (q.id === m.target || m.age > 0.5)) { if (q.inv <= 0) onBlast(q, m); boom = true; break; }
    }
    if (boom) { events.push({ e: 'mboom', x: Math.round(m.x), y: Math.round(m.y), z: Math.round(m.z) }); missiles.splice(i, 1); }
  }
}
