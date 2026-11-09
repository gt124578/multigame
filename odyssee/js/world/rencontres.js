// odyssee/js/world/rencontres.js — rencontres sauvages complètes : la table faite main de chaque zone (créatures
// originales et Pokémon choisis) est complétée par tous les Pokémon des lieux équivalents des jeux officiels, de Rouge
// à X / Y (data/rencontres.js, généré par tools/odyssee-rencontres.mjs). Les niveaux restent ceux de la zone.
import { RENCONTRES, AVANT } from '../data/rencontres.js';
import { TRONCONS } from '../data/troncons.js';
import { walkable, surfable } from './tiles.js';

/** part des rencontres laissée aux Pokémon des jeux officiels (le reste : la table faite main de la zone) */
const PART_OFFICIELS = 0.6;

/** forme jouable à ce niveau : un Pokémon trop évolué redescend vers sa forme d'avant */
export function formeAuNiveau(sp, lvl) {
  for (let k = 0; k < 3; k++) {
    const p = AVANT[sp]; if (!p) break;
    const [from, evoLvl] = p;
    if (evoLvl ? lvl + 2 < evoLvl : lvl < 30) sp = from; else break;
  }
  return sp;
}

/** table de rencontres d'une zone : [espèce, niveau min, niveau max, poids] */
export function enrichir(base, zone) {
  const gen = RENCONTRES[zone];
  if (!gen || !gen.length) return base;
  const lo = base?.length ? Math.min(...base.map((e) => e[1])) : 5, hi = base?.length ? Math.max(...base.map((e) => e[2])) : lo + 3;
  const totBase = (base || []).reduce((a, e) => a + e[3], 0) || 1, totGen = gen.reduce((a, e) => a + e[1], 0) || 1;
  const kBase = (1 - PART_OFFICIELS) * 100 / totBase, kGen = PART_OFFICIELS * 100 / totGen;
  const out = new Map();
  for (const [sp, a, b, w] of base || []) out.set(sp, [sp, a, b, w * kBase]);
  for (const [sp0, w] of gen) {
    const sp = formeAuNiveau(sp0, hi);
    const e = out.get(sp);
    if (e) e[3] += w * kGen;
    else out.set(sp, [sp, lo, hi, w * kGen]);
  }
  // une rencontre très rare garde une petite chance (au moins 0,1 %)
  return [...out.values()].map((e) => [e[0], e[1], e[2], Math.max(0.1, Math.round(e[3] * 100) / 100)]);
}

/** applique enrichir à toute une table de zones */
export function enrichirTout(ENC) {
  for (const k of Object.keys(ENC)) ENC[k] = enrichir(ENC[k], k);
  return ENC;
}

/* ---------------- tronçons ----------------
 * Chaque route, grotte ou île est coupée en tronçons (data/troncons.js, écrit par tools/odyssee-troncons.mjs) :
 * 15 Pokémon par tronçon, les plus fréquents du tronçon d'avant s'y font plus rares, d'autres apparaissent.
 * Le joueur ne voit pas les limites : la table change seulement à mesure qu'il avance. La table de la zone
 * (z.enc, m.encounter) devient la réunion de ses tronçons, pour le Pokédex et la carte. */

/** tables d'avant les tronçons (pour qu'une nouvelle construction du monde reparte des mêmes tables) */
const ORIGINAUX = new Map();
/** remet les tables de rencontres telles qu'avant poserTroncons ; à appeler au début de la construction du monde */
export function restaurerTables() { for (const [t, c] of ORIGINAUX) t.splice(0, t.length, ...c.map((e) => [...e])); }

/** pose les tronçons sur les cartes ; à appeler une fois le monde construit */
export function poserTroncons({ maps, routes }) {
  if (globalThis.ODYSSEE_SANS_TRONCONS) return;
  const W = maps.monde, tables = new Map();
  const ajoute = (t, secs) => { if (!t) return; if (!tables.has(t)) tables.set(t, []); tables.get(t).push(...secs); };
  W.tronconsRoutes = {};
  for (const r of routes) {
    const secs = TRONCONS[r.id]; if (!secs) continue;
    // chaque point du tracé reçoit son tronçon selon la distance parcourue depuis le début de la route
    const d = [0]; for (let i = 1; i < r.pts.length; i++) d.push(d[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
    const L = d[d.length - 1] || 1;
    W.tronconsRoutes[r.id] = { pts: r.pts.map((q, i) => [q[0], q[1], Math.min(secs.length - 1, Math.floor(d[i] / L * secs.length))]), secs };
    ajoute(W.zones.find((z) => z.route === r.id && z.enc)?.enc, secs);
  }
  for (const z of W.zones) { const secs = TRONCONS['zone:' + z.name]; if (secs && z.enc) { z.troncons = secs; if (!tables.get(z.enc)?.includes(secs[0])) ajoute(z.enc, secs); } }
  for (const m of Object.values(maps)) {
    const secs = m.id !== 'monde' && TRONCONS['map:' + m.id]; if (!secs) continue;
    m.tronconsCarte = { secs, dist: null };
    ajoute(m.encounter || m.zones.find((z) => z.enc)?.enc, secs);
  }
  // la table d'une zone devient la réunion de ses tronçons (même objet : les zones qui la partagent suivent)
  for (const [t, secs] of tables) {
    const u = new Map();
    for (const s of secs) for (const [sp, a, b, w] of s) {
      const e = u.get(sp); if (e) { e[1] = Math.min(e[1], a); e[2] = Math.max(e[2], b); e[3] += w; } else u.set(sp, [sp, a, b, w]);
    }
    if (!ORIGINAUX.has(t)) ORIGINAUX.set(t, t.map((e) => [...e]));
    t.splice(0, t.length, ...[...u.values()].map((e) => [e[0], e[1], e[2], Math.round(e[3] / secs.length * 100) / 100]));
  }
}

/** distance (en pas) de chaque case à l'entrée d'une grotte : le premier passage de la carte */
function distances(m) {
  const D = new Int32Array(m.w * m.h).fill(-1), q = [];
  const ok = (x, y) => { const t = m.get(x, y); return walkable(t) || surfable(t) || t >= 30; };
  const w0 = m.warps.keys().next().value;
  const [sx, sy] = w0 !== undefined ? String(w0).split(',').map(Number) : [m.w >> 1, m.h - 1];
  if (m.in(sx, sy)) { D[sy * m.w + sx] = 0; q.push(sx, sy); }
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1], d = D[y * m.w + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy;
      if (m.in(a, b) && D[b * m.w + a] < 0 && ok(a, b)) { D[b * m.w + a] = d + 1; q.push(a, b); }
    }
  }
  let max = 1; for (const v of D) if (v > max) max = v;
  return { D, max };
}

/** table de rencontres à une case : celle du tronçon où l'on se trouve */
export function encAt(m, x, y) {
  const z = m.zones?.length ? m.zoneAt(x, y) : null;
  const base = m.outdoor ? z?.enc : (m.encounter || z?.enc);
  if (!base?.length) return base || null;
  const C = m.tronconsCarte;
  if (C) {
    if (!C.dist) C.dist = distances(m);
    const d = C.dist.D[y * m.w + x];
    return C.secs[d < 0 ? 0 : Math.min(C.secs.length - 1, Math.floor(d / (C.dist.max + 1) * C.secs.length))];
  }
  const R = z?.route && m.tronconsRoutes?.[z.route];
  if (R) {
    let best = 1e9, s = 0;
    for (const [px, py, k] of R.pts) { const e = (px - x) ** 2 + (py - y) ** 2; if (e < best) { best = e; s = k; } }
    return R.secs[s];
  }
  if (z?.troncons) {
    const n = z.troncons.length, wx = z.x1 - z.x0 + 1, wy = z.y1 - z.y0 + 1;
    const f = wx >= wy ? (x - z.x0) / wx : (z.y1 - y) / wy;
    return z.troncons[Math.max(0, Math.min(n - 1, Math.floor(f * n)))];
  }
  return base;
}

/* ---------------- équipes à thème (arènes) ---------------- */
import { SPECIES } from '../data/species.js';
import { LEGENDAIRES } from '../data/rencontres.js';
const LEG = new Set(LEGENDAIRES);
const POOLS = {};
/** Pokémon d'un type (Gen 1 à 6 et créatures originales), sans légendaires ni formes trop évoluées pour le niveau */
export function poolDeType(type, lvl) {
  const key = type + ':' + lvl;
  if (POOLS[key]) return POOLS[key];
  const s = new Set();
  for (const [id, S] of Object.entries(SPECIES)) {
    const n = +id; if (LEG.has(n) || (n > 721 && n < 1001) || n > 1051 || !S.t.includes(type)) continue;
    const f = formeAuNiveau(n, lvl);
    if (SPECIES[f]?.t.includes(type)) s.add(f);
  }
  return (POOLS[key] = [...s].sort((a, b) => a - b));
}
/** équipe tirée d'un type, toujours la même pour une graine donnée */
export function equipeDeType(type, lvl, n, seed) {
  const pool = poolDeType(type, lvl); let x = seed * 9301 + 49297;
  const r = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const team = [];
  for (let i = 0; i < n && pool.length; i++) {
    let sp; for (let k = 0; k < 8; k++) { sp = pool[Math.floor(r() * pool.length)]; if (!team.some((t) => t[0] === sp)) break; }
    team.push([sp, lvl - (n - 1 - i)]);
  }
  return team;
}
