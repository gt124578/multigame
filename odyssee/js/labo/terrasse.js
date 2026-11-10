// odyssee/js/labo/terrasse.js — l'outil Relief de l'éditeur de carte : élever, abaisser, aplanir ou lisser le sol au pinceau,
// et refaire proprement le dénivelé autour.
//
// Les règles sont celles de la carte (world/relief.js, plateau()) : on ne passe d'une case à l'autre qu'à la même hauteur
// (ou par une marche, un niveau d'écart) ; sous le bord sud d'une case plus haute, une paroi (T.CLIFF) d'une case par
// niveau d'écart, chaque case de paroi un niveau plus bas que celle du dessus ; les autres bords (nord, est, ouest) sont
// dessinés par le rendu (falaises.js) sans case de plus. Le bord est en roche (pente 0) ou en talus d'herbe (pente 1).
//
// terrasser() ne touche à la carte que par une retouche ['r', x, y, w, h, sols, hauteurs, pentes] (null = case
// inchangée) : l'éditeur l'applique, l'annule et l'exporte comme les autres.
import { T, walkable } from '../world/tiles.js';

/** cases qu'on ne transforme jamais (bâtiments, portes, ponts, eau…) : ni paroi, ni sol */
const FIXE = new Set([T.BUILD, T.DOOR, T.BRIDGE, T.CAVEDOOR, T.SIGN, T.MAT, T.BLOCK, T.WATER, T.WHIRL, T.WALL, T.CAVEWALL]);
/** sols qu'une paroi devenue inutile peut reprendre (celui du pied de la paroi, sinon de l'herbe) */
const SOLS_NATURELS = new Set([T.GRASS, T.SAND, T.SNOW, T.ASH, T.TALL, T.DARKTALL, T.FLOWER]);
const CHEMIN = new Set([T.PATH, T.PAVE, T.STAIRS]);
/** obstacles naturels : sous un bord, ils restent (le rendu loge le pan de relief dans la case où l'on ne marche pas) */
const OBSTACLE = new Set([T.TREE, T.PINE, T.BUSH, T.ROCK]);
export const H_MAX = 30;

/** cases d'un pinceau rond de rayon r (1 = une case) autour de (cx, cy) */
export function disque(cx, cy, r) {
  const out = [], R = Math.max(0, r - 1), R2 = (R + 0.5) * (R + 0.5);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R2) out.push([cx + dx, cy + dy]);
  return out;
}

/**
 * Applique des hauteurs voulues et refait les parois autour.
 * @param m       la carte (GameMap)
 * @param cibles  Map « x,y » → hauteur voulue
 * @param o.bord  'roche' (falaise de pierre) ou 'herbe' (talus de pelouse)
 * @param o.marches  vrai : là où un chemin franchit un bord sud, des marches au lieu d'une paroi
 * @returns la retouche ['r', …] (ou null si rien ne change) et les cases changées
 */
export function terrasser(m, cibles, o = {}) {
  if (!cibles.size) return null;
  const bord = o.bord === 'herbe' ? 1 : 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, hMax = 0;
  for (const [k, h] of cibles) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); hMax = Math.max(hMax, h, m.height(x, y)); }
  // fenêtre de travail : les colonnes touchées, assez haut et assez bas pour les plus hautes parois
  const marge = Math.min(H_MAX, hMax) + 2;
  const fx0 = Math.max(0, x0 - 1), fx1 = Math.min(m.w - 1, x1 + 1), fy0 = Math.max(0, y0 - marge), fy1 = Math.min(m.h - 1, y1 + marge);
  const W = fx1 - fx0 + 1, Hh = fy1 - fy0 + 1, n = W * Hh;
  const at = (x, y) => (y - fy0) * W + (x - fx0);
  const dans = (x, y) => x >= fx0 && x <= fx1 && y >= fy0 && y <= fy1;
  const tt = new Uint8Array(n), hh = new Int16Array(n), pp = new Uint8Array(n), garde = new Uint8Array(n);
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
    const i = at(x, y), g = y * m.w + x;
    tt[i] = m.t[g]; hh[i] = m.hg[g]; pp[i] = m.pentes ? m.pentes[g] : 0;
    // montagnes dessinées et ravins : leur relief vient de leur plan, on n'y touche pas
    garde[i] = (m.monts && m.monts[g]) || (m.ravins && m.ravins[g]) || FIXE.has(tt[i]) ? 1 : 0;
  }
  // 1. les parois des colonnes touchées redeviennent du sol, à la hauteur de leur pied (elles seront refaites)
  const colonnes = new Set(); for (const k of cibles.keys()) colonnes.add(+k.split(',')[0]);
  for (const x of [...colonnes]) { colonnes.add(x - 1); colonnes.add(x + 1); }
  for (const x of colonnes) {
    if (x < fx0 || x > fx1) continue;
    for (let y = fy0; y <= fy1; y++) {
      const i = at(x, y); if (tt[i] !== T.CLIFF || garde[i]) continue;
      let yy = y;
      // paroi d'un plateau hors de la fenêtre : on la garde telle quelle
      if (y === fy0) { while (yy <= fy1 && tt[at(x, yy)] === T.CLIFF) yy++; y = yy - 1; continue; }
      while (yy <= fy1 && tt[at(x, yy)] === T.CLIFF && !garde[at(x, yy)]) yy++;
      const pied = yy <= fy1 ? at(x, yy) : -1, sous = pied >= 0 ? tt[pied] : T.GRASS, hPied = pied >= 0 ? hh[pied] : hh[i];
      for (let k = y; k < yy; k++) { const j = at(x, k); tt[j] = SOLS_NATURELS.has(sous) ? sous : T.GRASS; hh[j] = hPied; }
      y = yy - 1;
    }
  }
  // 2. les hauteurs voulues
  for (const [k, h] of cibles) {
    const [x, y] = k.split(',').map(Number); if (!dans(x, y)) continue;
    const i = at(x, y); if (garde[i]) continue;
    hh[i] = Math.max(0, Math.min(H_MAX, h));
    if (tt[i] === T.CLIFF) tt[i] = T.GRASS;
    pp[i] = hh[i] > 0 ? bord : 0;
  }
  // 3. sous chaque bord sud plus haut : une paroi d'une case par niveau d'écart (ou des marches pour un chemin)
  for (const x of colonnes) {
    if (x < fx0 || x > fx1) continue;
    for (let y = fy0; y < fy1; y++) {
      const i = at(x, y), j = at(x, y + 1);
      if (tt[i] === T.CLIFF || garde[i] || garde[j] || hh[i] <= hh[j]) continue;
      const niv = hh[i], d = niv - hh[j];
      // un chemin qui descend : des marches s'il reprend en bas
      let pied = y + 1 + d; const piedT = pied <= fy1 ? tt[at(x, pied)] : -1;
      const marches = o.marches !== false && CHEMIN.has(tt[i]) && (CHEMIN.has(tt[j]) || CHEMIN.has(piedT));
      for (let k = 1; k <= d; k++) {
        const yy = y + k; if (yy > fy1) break;
        const q = at(x, yy), hq = niv - k;
        if (garde[q] || hh[q] >= niv) break;
        if (tt[q] === T.STAIRS) { hh[q] = hq; continue; }
        if (OBSTACLE.has(tt[q])) { hh[q] = hq; pp[q] = pp[i]; continue; }
        tt[q] = marches ? T.STAIRS : T.CLIFF; hh[q] = hq; pp[q] = pp[i];
      }
      if (marches && pied <= fy1 && !CHEMIN.has(piedT) && walkable(piedT) && !garde[at(x, pied)]) tt[at(x, pied)] = T.PATH;
    }
  }
  // 4. le plat d'en bas n'est pas un talus
  for (let i = 0; i < n; i++) if (hh[i] === 0 && tt[i] !== T.CLIFF && tt[i] !== T.STAIRS) pp[i] = 0;
  // 5. la retouche : seulement ce qui change, dans le plus petit rectangle
  let cx0 = Infinity, cx1 = -1, cy0 = Infinity, cy1 = -1;
  const change = (x, y) => { const i = at(x, y), g = y * m.w + x; return tt[i] !== m.t[g] || hh[i] !== m.hg[g] || pp[i] !== (m.pentes ? m.pentes[g] : 0); };
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) if (change(x, y)) { cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cy0 = Math.min(cy0, y); cy1 = Math.max(cy1, y); }
  if (cx1 < 0) return null;
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1, sols = [], hts = [], pts = [];
  let nb = 0;
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
    const i = at(x, y), g = y * m.w + x;
    sols.push(tt[i] !== m.t[g] ? tt[i] : null);
    hts.push(hh[i] !== m.hg[g] ? hh[i] : null);
    pts.push(pp[i] !== (m.pentes ? m.pentes[g] : 0) ? pp[i] : null);
    if (change(x, y)) nb++;
  }
  return { op: ['r', cx0, cy0, w, h, sols.some((v) => v != null) ? sols : null, hts.some((v) => v != null) ? hts : null, pts.some((v) => v != null) ? pts : null], nb };
}

/** hauteurs voulues par un coup de pinceau Relief sur les cases `cases`, selon le mode */
export function ciblesRelief(m, cases, mode, base, niveau) {
  const C = new Map();
  for (const [x, y] of cases) {
    if (!m.in(x, y)) continue;
    const k = x + ',' + y, h0 = base.has(k) ? base.get(k) : m.height(x, y);
    if (!base.has(k)) base.set(k, h0);
    let h = h0;
    if (mode === 'monter') h = h0 + 1;
    else if (mode === 'baisser') h = h0 - 1;
    else if (mode === 'aplanir') h = niveau;
    else if (mode === 'lisser') {
      // moyenne des cases voisines (hors parois), arrondie
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (!m.in(a, b) || m.get(a, b) === T.CLIFF) continue; s += m.height(a, b); c++; }
      h = c ? Math.round(s / c) : h0;
    }
    C.set(k, Math.max(0, Math.min(H_MAX, h)));
  }
  return C;
}
