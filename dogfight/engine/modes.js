// Modes de Dogfight 3D : les zones de Domination, les manches du Duel, le trajet du transport d'Escorte.
// Moteur pur : l'état vit dans la partie (g.zones, g.duel, g.cargo), le réseau et un nouvel hôte le reprennent tel quel.
import { CENTER, computeAxes } from './flight.js';

export const MODE_IDS = ['chacun', 'equipes', 'domination', 'duel', 'escorte'];
export const MODE_NAMES = { chacun: 'Chacun pour soi', equipes: 'Équipes', domination: 'Domination', duel: 'Duel', escorte: 'Escorte' };
export const isTeamMode = (m) => m === 'equipes' || m === 'domination' || m === 'escorte';

// ---------------------------------------------------------------- Domination
export const ZONE_RADIUS = 190;     // rayon d'une zone (m)
export const ZONE_CEIL = 170;       // pour la capturer, on vole sous cette hauteur au-dessus du sol (m)
export const CAPTURE_TIME = 7;      // un seul avion prend une zone neutre en ce temps (s)
export const KILL_POINTS = 5;       // points d'équipe par élimination
export const POINTS_PER_KILL_GOAL = 30;

// Trois lieux habités de l'île, aussi éloignés que possible les uns des autres
export function pickZones(world) {
  const pois = (world.map.pois || []).filter((p) => p.town && p.rect), c = pois.map((p) => ({ name: p.name, x: (p.rect.x0 + p.rect.x1) / 2, z: (p.rect.z0 + p.rect.z1) / 2 }));
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  let best = null, score = -1;
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) for (let k = j + 1; k < c.length; k++) {
    const s = Math.min(d(c[i], c[j]), d(c[j], c[k]), d(c[i], c[k]));
    if (s > score) { score = s; best = [c[i], c[j], c[k]]; }
  }
  const list = best || [{ name: 'Nord', x: CENTER, z: CENTER - 400 }, { name: 'Est', x: CENTER + 350, z: CENTER + 200 }, { name: 'Ouest', x: CENTER - 350, z: CENTER + 200 }];
  return list.sort((a, b) => a.x - b.x).map((p, i) => ({ id: 'ABC'[i], name: p.name, x: Math.round(p.x), y: Math.round(world.obstacleAt(p.x, p.z)), z: Math.round(p.z), r: ZONE_RADIUS, own: 0, cap: 0 }));
}

// Dans la zone, assez bas ?
export function inZone(p, z, world) {
  return p.alive && Math.hypot(p.x - z.x, p.z - z.z) < z.r && p.y - world.obstacleAt(p.x, p.z) < ZONE_CEIL;
}

// Capture : le camp en surnombre fait pencher la zone ; onScore(équipe) à chaque seconde par zone tenue
export function stepZones(g, dt, world, onScore) {
  for (const z of g.zones) {
    let a = 0, b = 0;
    for (const p of g.planes) {
      if (p.type === 'cargo' || !inZone(p, z, world)) continue;
      p.zt = (p.zt || 0) + dt;
      if (p.team === 1) a++; else if (p.team === 2) b++;
    }
    const lead = a - b;
    if (lead) {
      z.cap = Math.max(-1, Math.min(1, z.cap + Math.sign(lead) * (1 + 0.4 * (Math.abs(lead) - 1)) * dt / CAPTURE_TIME));
      const was = z.own;
      if (z.cap >= 1) z.own = 1;
      else if (z.cap <= -1) z.own = 2;
      else if ((z.own === 1 && z.cap <= 0) || (z.own === 2 && z.cap >= 0)) z.own = 0;
      if (z.own !== was) { g.rev++; g.events.push({ e: 'zone', z: z.id, own: z.own, was }); }
    }
  }
  g.zoneT = (g.zoneT || 0) + dt;
  if (g.zoneT >= 1) {
    g.zoneT -= 1; g.rev++;
    for (const z of g.zones) if (z.own) onScore(z.own);
  }
}

// ---------------------------------------------------------------- Duel
const DUEL_RANGE = 620;
export const ROUND_TIME = 90;   // au-delà, le moins abîmé gagne : ceux qui attendent ne patientent pas sans fin

// Les deux pilotes de la manche repartent face à face, de part et d'autre de l'île
export function duelPoses(round, world) {
  const a = 0.7 + round * 1.9, sx = Math.cos(a), sz = Math.sin(a);
  return [1, -1].map((s) => {
    const x = CENTER + sx * DUEL_RANGE * s, z = CENTER + sz * DUEL_RANGE * s;
    return { x, z, y: Math.max(world ? world.obstacleAt(x, z) + 150 : 150, 300), heading: Math.atan2(CENTER - x, CENTER - z) };
  });
}

// Manche suivante : le gagnant reste, le perdant passe derrière ceux qui attendent
export function nextPair(duel) {
  const { a, b, loser, q } = duel;
  if (!q.length) return;
  const out = loser === a ? a : b, stay = out === a ? b : a;
  q.push(out);
  duel.a = stay; duel.b = q.shift();
}

// ---------------------------------------------------------------- Escorte
export const CARGO_RADIUS = 15;
// Solidité : de quoi tenir la durée de la partie si l'escorte fait son travail
export const cargoHp = (attackers, time) => Math.round(Math.max(1, attackers) * 4300 * (time / 300));

// Le trajet : une grande boucle autour du sommet, assez large pour que ce gros avion vire sans forcer
export const routeAt = (u) => ({ x: CENTER + 640 * Math.sin(u), y: 285 + 35 * Math.sin(u * 2), z: CENTER + 520 * Math.cos(u) });

const CARGO_SPEED = 96, ROUTE_START = 1, CARGO_BANK = 0.6;

// Le transport vole sur des rails : un gros porteur ne se pilote pas comme un chasseur, et ses virages restent larges
export function stepCargo(p, cargo, dt) {
  const u = cargo.u, dx = 640 * Math.cos(u), dy = 70 * Math.cos(u * 2), dz = -520 * Math.sin(u), ddx = -640 * Math.sin(u), ddz = -520 * Math.cos(u);
  const n = Math.hypot(dx, dy, dz);
  cargo.u = u + CARGO_SPEED * dt / n;
  const at = routeAt(cargo.u);
  p.x = at.x; p.y = at.y; p.z = at.z; p.speed = CARGO_SPEED;
  const yaw = Math.atan2(dx, dz) / 2, pitch = -Math.asin(dy / n) / 2, h2 = dx * dx + dz * dz;
  // il s'incline dans ses virages, comme le ferait un vrai pilote
  const roll = -Math.max(-CARGO_BANK, Math.min(CARGO_BANK, Math.atan(CARGO_SPEED * CARGO_SPEED / 9.8 * (dz * ddx - dx * ddz) / (h2 * Math.sqrt(h2))))) / 2;
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch), sr = Math.sin(roll), cr = Math.cos(roll);
  p.qx = cy * sp * cr + sy * cp * sr; p.qy = sy * cp * cr - cy * sp * sr; p.qz = cy * cp * sr - sy * sp * cr; p.qw = cy * cp * cr + sy * sp * sr;
  computeAxes(p);
}
export const startCargo = (p, cargo) => { cargo.u = ROUTE_START; stepCargo(p, cargo, 0); };
