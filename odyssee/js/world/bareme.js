// odyssee/js/world/bareme.js — le barème des objets ramassables (Poké Balls posées) selon l'avancement : le rang d'une
// zone est le nombre de badges qu'il faut pour l'atteindre (world/acces.js). Pas de Super Bonbon ni de pierre
// d'évolution avant le 2ᵉ badge, et peu avant le 4ᵉ (un par zone, trois en tout) ; les Hyper Balls, Potions Max…
// viennent plus tard. Les tirages des routes et des lieux (chemins.js, lieux.js) puisent dans la liste de leur rang ;
// à la fin de buildWorld, `appliquerBareme` rétrograde ce qui reste trop fort pour l'endroit où on le trouve (objets
// d'avant la grande région compris) en gardant son identifiant : un objet déjà ramassé le reste.
// Ne touche ni aux Méga-Gemmes, ni aux objets rares et de quête (tout ce qui n'est pas dans RANG_MIN).
import { JAMAIS, rangAutour } from './acces.js';

/** rang des routes (badges pour y entrer), vérifié par tools/odyssee-acces.mjs */
export const RANG_ROUTES = {
  r1: 0, r2: 1, bois: 1, r3: 1, r3e: 1, r4: 2, orage1: 2, orage2: 2, r5: 3, grue1: 3, grue2: 3, r6: 4, r7: 4, torii: 4,
  r10: 5, r11: 5, r12: 5, r13: 8, r14: 9, r15: 10, r16: 11, r17: 12, r18: 13, r19: 14, r20: 14, r9: 15, r9b: 15,
};

/** rang minimal de chaque objet courant */
export const RANG_MIN = {
  'poke-ball': 0, potion: 0, antidote: 0, 'paralyze-heal': 0, awakening: 0, 'burn-heal': 0, 'ice-heal': 0, repel: 0, 'oran-berry': 0, 'escape-rope': 0,
  'great-ball': 1, 'super-potion': 1,
  'full-heal': 2, ether: 2, 'super-repel': 2, 'sitrus-berry': 2,
  'hyper-potion': 3, revive: 3, elixir: 3, 'max-repel': 3,
  'ultra-ball': 4, 'max-potion': 6, 'max-elixir': 6, 'full-restore': 7, 'max-revive': 7,
  // comptés : un par zone et trois en tout aux rangs 2 et 3, librement ensuite
  'rare-candy': 2, 'fire-stone': 2, 'water-stone': 2, 'thunder-stone': 2, 'leaf-stone': 2, 'moon-stone': 2, 'sun-stone': 2,
  'dusk-stone': 2, 'dawn-stone': 2, 'shiny-stone': 2, 'ice-stone': 2,
};
const PIERRE = (it) => /-stone$/.test(it) && it in RANG_MIN;
const COMPTE = (it) => it === 'rare-candy' || PIERRE(it);
/** ce qu'un objet devient quand il est trop fort pour l'endroit (du plus fort au plus faible) */
const CHAINES = [
  ['ultra-ball', 'great-ball', 'poke-ball'],
  ['full-restore', 'max-potion', 'hyper-potion', 'super-potion', 'potion'],
  ['max-revive', 'revive', 'hyper-potion', 'super-potion', 'potion'],
  ['max-elixir', 'elixir', 'ether', 'super-potion', 'potion'],
  ['full-heal', 'paralyze-heal'],
  ['max-repel', 'super-repel', 'repel'],
  ['sitrus-berry', 'oran-berry'],
  ['rare-candy', 'hyper-potion', 'super-potion', 'potion'],
];
const SUITE = new Map(); for (const C of CHAINES) C.forEach((it, i) => { if (i + 1 < C.length && !SUITE.has(it)) SUITE.set(it, C[i + 1]); });
// une pierre d'évolution trop tôt : des Poké Balls
for (const it of Object.keys(RANG_MIN)) if (PIERRE(it)) SUITE.set(it, 'great-ball');

/** l'objet, ou ce qu'il devient s'il est trop fort pour le rang (compte : on n'autorise pas un objet compté) */
export function adapter(item, rang, compte = true) {
  let it = item;
  for (let k = 0; k < 8 && it in RANG_MIN; k++) {
    const ok = rang >= RANG_MIN[it] && !(COMPTE(it) && rang < 4 && !compte);
    if (ok) return it;
    const s = SUITE.get(it); if (!s) return it; it = s;
  }
  return it;
}

/** les tirages d'objets d'une route ou d'un lieu de ce rang (même longueur à chaque rang : le hasard ne bouge pas) */
const LOTS_RANG = [
  ['potion', 'poke-ball', 'antidote', 'paralyze-heal', 'awakening', 'repel', 'potion', 'poke-ball', 'escape-rope', 'oran-berry'],
  ['super-potion', 'great-ball', 'potion', 'burn-heal', 'ice-heal', 'repel', 'super-potion', 'poke-ball', 'escape-rope', 'awakening'],
  ['super-potion', 'great-ball', 'ether', 'full-heal', 'super-repel', 'super-potion', 'great-ball', 'sitrus-berry', 'escape-rope', 'repel'],
  ['super-potion', 'great-ball', 'ether', 'revive', 'full-heal', 'hyper-potion', 'super-repel', 'elixir', 'max-repel', 'great-ball'],
  ['super-potion', 'great-ball', 'ether', 'revive', 'full-heal', 'hyper-potion', 'ultra-ball', 'rare-candy', 'max-repel', 'elixir'],
];
export function lotsPour(rang = 4) { return LOTS_RANG[Math.max(0, Math.min(LOTS_RANG.length - 1, rang | 0))].slice(); }
/** rang d'une route d'après son identifiant (4 si elle est inconnue : tirages ordinaires) */
export const rangRoute = (id) => RANG_ROUTES[id] ?? 4;

/**
 * Rétrograde les objets posés trop forts pour l'endroit, sur toutes les cartes atteintes. Rang retenu pour un objet :
 * celui de sa zone (badges pour y entrer ; pour une grotte ou une maison, pour y entrer) — un objet derrière un rocher
 * à pousser sur la route 1, ou sur un îlot du port qu'on n'atteint qu'en surfant, reste un objet du début de l'aventure.
 * Renvoie la liste des changements [carte, id, avant, après, rang, zone].
 */
export function appliquerBareme(maps, RG) {
  const changes = [], parZone = new Map();
  let total = { 'rare-candy': 0, pierre: 0 };
  const lignes = [];
  for (const [id, m] of Object.entries(maps)) {
    const r = RG.get(id); if (!r || !m.items?.length) continue;
    let min = JAMAIS; if (id !== 'monde') for (let i = 0; i < r.length; i++) if (r[i] < min) min = r[i];
    for (const it of m.items) {
      if (!(it.item in RANG_MIN)) continue;
      const propre = rangAutour(m, r, it.x, it.y); if (propre === JAMAIS) continue;
      let zr = min, zn = id;
      if (id === 'monde') {
        const z = m.zoneAt(it.x, it.y); zn = z?.name || '?';
        if (!parZone.has(z)) { let v = JAMAIS; if (z) for (let y = Math.max(0, z.y0); y <= Math.min(m.h - 1, z.y1); y++) for (let x = Math.max(0, z.x0); x <= Math.min(m.w - 1, z.x1); x++) { const q = r[y * m.w + x]; if (q < v && m.zoneAt(x, y) === z) v = q; } parZone.set(z, v); }
        zr = parZone.get(z);
      }
      lignes.push({ id, m, it, propre, rang: Math.min(propre, zr === JAMAIS ? propre : zr), zone: zn });
    }
  }
  // les objets comptés des rangs 2 et 3 : du plus loin dans l'aventure au plus proche (puis du mieux caché), un par
  // zone, trois en tout
  lignes.sort((a, b) => b.rang - a.rang || b.propre - a.propre);
  const vus = new Set();
  for (const L of lignes) {
    const { it, rang } = L, avant = it.item;
    let compte = true;
    if (COMPTE(avant) && rang >= 2 && rang < 4) {
      const cat = avant === 'rare-candy' ? 'rare-candy' : 'pierre', k = L.zone + '|' + cat;
      if (vus.has(k) || total[cat] >= 3) compte = false; else { vus.add(k); total[cat]++; }
    }
    const apres = adapter(avant, rang, compte);
    if (apres !== avant) { it.item = apres; changes.push([L.id, it.id, avant, apres, rang, L.zone]); }
  }
  return changes;
}
