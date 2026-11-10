// The Backrooms - Les cachettes (sans DOM) : des casiers métalliques contre les murs (Level 1, Tuyauteries). On s'y
// enferme avec F ; dedans, l'entité et le troupeau ne voient personne… sauf s'ils t'ont vu entrer. On retient son
// souffle (Maj) quand elle passe tout près : trop longtemps, et l'on suffoque bruyamment.
import { CELL_SIZE } from './map.js';

export const HIDE_R = 1.3; // portée de F devant la porte
export const LOCKER_R = 0.42; // le casier arrête le passage (cercle)
export const BREATH_HOLD = 7; // secondes de souffle retenu
export const BREATH_BACK = 22; // % par seconde quand on respire de nouveau

// n casiers contre des murs de couloir, loin du départ, des objectifs et les uns des autres. Le tirage ne dépend que
// de la carte (hôte et invités ont les mêmes)
export function placeHides(map, n, seed = 1) {
  const C = CELL_SIZE;
  const W = map.W;
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const open = (x, z) => !map.isWall(x, z);
  const avoid = [map.spawn, map.exit, map.guardDoor, ...(map.fuses || []), ...(map.valves || []), ...(map.breakers || []), ...(map.items || [])].filter(Boolean);
  const cand = [];
  for (const c of map.walkable || []) {
    const d = map.dist ? map.dist[c.z * W + c.x] : 99;
    if (!(d >= 6)) continue;
    if (map.pitAt && map.pitAt(c.x, c.z) >= 0) continue;
    if (map.jetAt && map.jetAt(c.x, c.z)) continue;
    const x = (c.x + 0.5) * C;
    const z = (c.z + 0.5) * C;
    if (avoid.some((o) => Math.hypot((o.x ?? 0) - x, (o.z ?? 0) - z) < 3.5)) continue;
    if ((map.props || []).some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1.4)) continue;
    // un mur d'un côté, un couloir en face (on doit pouvoir passer devant le casier)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (open(c.x + dx, c.z + dz) || !open(c.x - dx, c.z - dz)) continue;
      // pas dans un cul-de-sac d'une case (il faut que le couloir continue sur le côté)
      const side = open(c.x + dz, c.z + dx) || open(c.x - dz, c.z - dx);
      if (!side) continue;
      cand.push({ gx: c.x, gz: c.z, dx: -dx, dz: -dz, x: x + dx * (C / 2 - 0.36), z: z + dz * (C / 2 - 0.36), k: rnd() });
    }
  }
  cand.sort((a, b) => a.k - b.k);
  const out = [];
  for (const h of cand) {
    if (out.length >= n) break;
    if (out.some((o) => Math.abs(o.gx - h.gx) + Math.abs(o.gz - h.gz) < 12)) continue;
    out.push({ id: out.length, gx: h.gx, gz: h.gz, dx: h.dx, dz: h.dz, x: h.x, z: h.z, ry: Math.atan2(h.dx, h.dz), by: -1 });
  }
  return out;
}

// où se tient un joueur caché dans le casier (au fond, face à la porte), et où il ressort (devant la porte)
export const hideInside = (h) => ({ x: h.x - h.dx * 0.05, z: h.z - h.dz * 0.05, yaw: Math.atan2(-h.dx, -h.dz) });
export const hideFront = (h) => h.out || ({ x: h.x + h.dx * 0.95, z: h.z + h.dz * 0.95 });
