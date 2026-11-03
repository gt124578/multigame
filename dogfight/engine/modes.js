// Modes de Dogfight 3D : les zones de Domination, les manches du Duel, le trajet du transport d'Escorte.
// Moteur pur : l'état vit dans la partie (g.zones, g.duel, g.cargo), le réseau et un nouvel hôte le reprennent tel quel.
import { CENTER, computeAxes } from './flight.js';
import { buildRoute, routeAt, routeForTime } from './route.js';

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
// Le transport suit l'itinéraire de sa route (route.js) et se pose sur la piste de la base : arrivé, l'escorte gagne.
// Les assaillants ont cinq vies chacun ; tous à terre, l'escorte gagne aussi.
export const CARGO_RADIUS = 17;
export const ATTACK_LIVES = 5;
// Solidité : de quoi tenir le trajet si l'escorte fait son travail. Les assaillants n'ont que cinq vies :
// ce qu'ils peuvent infliger ne grandit pas avec la longueur du trajet
export const cargoHp = (attackers) => Math.max(1, attackers) * 2300;

const CARGO_BANK = 0.6, ROLL_BRAKE = 7;
const routes = new Map();
// La route se calcule une fois par carte (elle épouse le relief)
export function getRoute(id, world) {
  const key = `${world.archi.id}:${id}`;
  if (!routes.has(key)) routes.set(key, buildRoute(id, (x, z) => world.obstacleAt(x, z), world.archi));
  return routes.get(key);
}
export function newCargo(time, world) {
  const id = routeForTime(time), R = getRoute(id, world);
  return { route: id, model: R.model, d: 0, v: R.speed, landed: false };
}

// Le transport vole sur des rails : un gros porteur ne se pilote pas comme un chasseur. Il s'incline dans ses virages
// comme le ferait un vrai pilote, et freine sur la piste une fois posé.
export function stepCargo(p, cargo, dt, world) {
  const R = getRoute(cargo.route, world);
  cargo.v = cargo.d >= R.landS ? Math.max(0, cargo.v - ROLL_BRAKE * dt) : R.speed;
  cargo.d = Math.min(R.len - 1, cargo.d + cargo.v * dt);
  const a = routeAt(R, cargo.d);
  p.x = a.x; p.y = a.y; p.z = a.z; p.speed = cargo.v;
  const flat = Math.hypot(a.tx, a.tz) || 1, yaw = Math.atan2(a.tx, a.tz) / 2, pitch = -Math.atan2(a.ty, flat) / 2;
  const roll = cargo.d >= R.landS ? 0 : -Math.max(-CARGO_BANK, Math.min(CARGO_BANK, Math.atan(R.speed * R.speed * a.turn / 9.8))) / 2;
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch), sr = Math.sin(roll), cr = Math.cos(roll);
  p.qx = cy * sp * cr + sy * cp * sr; p.qy = sy * cp * cr - cy * sp * sr; p.qz = cy * cp * sr - sy * sp * cr; p.qw = cy * cp * cr + sy * sp * sr;
  computeAxes(p);
  return cargo.d >= R.landS;
}
export const startCargo = (p, cargo, world) => { cargo.d = 0; cargo.landed = false; cargo.v = getRoute(cargo.route, world).speed; stepCargo(p, cargo, 0, world); };
// Temps qu'il reste avant que les roues touchent la piste
export const cargoLeft = (cargo, world) => { const R = getRoute(cargo.route, world); return Math.max(0, (R.landS - cargo.d) / R.speed); };
// Un point de la route, devant (ou derrière) le transport : pour faire apparaître les deux camps
export function alongRoute(cargo, world, ahead) { const R = getRoute(cargo.route, world); return routeAt(R, Math.max(0, Math.min(R.landS, cargo.d + ahead))); }
