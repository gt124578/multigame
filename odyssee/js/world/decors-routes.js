// odyssee/js/world/decors-routes.js — le level design des routes : chaque biome (biomes.js) aménage la sienne.
//
// Passe de fin, une fois la région entière posée : champs en sillons, rizières, étangs, passerelles sur l'eau, allées,
// arches, cercles de pierres, vergers, vignes, parterres, cimetières, coulées de lave… Rien de ce que les sauvegardes et
// les quêtes connaissent ne bouge (dresseurs, habitants, objets, panneaux, portes, rebords, escaliers) : ces cases et leurs
// abords sont réservés. Et rien ne coupe un passage : avant de bloquer des cases, on vérifie que tout ce qui se rejoignait
// à pied autour d'elles se rejoint encore (bloquer). Un tirage par route, toujours le même.
import { T, walkable } from './tiles.js';
import { along, rng } from './mapgen.js';
import { massif } from './relief.js';
import { B, BIOME_ROUTE, BIOMES, bruitBiome, hasardCase, essence, matiere } from './biomes.js';
import { PETITS, GENS, CAMP, PIQUENIQUE, ETUDE, DEFI, APRES_DEFI, DEFIEURS } from './vie-routes.js';
import { adapter, lotsPour, rangRoute } from './bareme.js';
import { cacher } from './rythme.js';
import { PRENOMS } from './voix.js';
import { etiquettes } from './traces.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOLS = new Set([T.GRASS, T.FLOWER, T.TALL, T.DARKTALL, T.SAND, T.SNOW, T.ASH]);
const NATURE = new Set([T.GRASS, T.FLOWER, T.TALL, T.DARKTALL, T.SAND]);
const FORET = new Set([T.TREE, T.PINE]);
const R0 = 15;   // portée autour du sentier, en cases

class Chantier {
  constructor(W, route, reserve, taken, tr = null, occ = new Set(), etq = null) {
    this.W = W; this.route = route; this.id = route.id; this.nb = B[BIOME_ROUTE[route.id]]; this.bio = BIOMES[this.nb];
    let g = 7; for (const c of route.id) g = (g * 31 + c.charCodeAt(0)) >>> 0;
    this.r = rng(g); this.reserve = reserve; this.pris = taken; this.faits = {}; this.lieux = [];
    // distance de chaque case au sentier, et où elle se trouve le long de la route
    this.info = new Map(); this.long = 0;
    const P = this.main = tr?.trace || route.pts; this.tr = tr; this.occ = occ; this.etq = etq; { const q = new Map(); for (const [x, y] of P) { const e = etq?.[Math.round(y) * W.w + Math.round(x)]; if (e) q.set(e, (q.get(e) || 0) + 1); } this.L0 = [...q].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0; } this.graine = 4000 + g % 5000; for (let i = 1; i < P.length; i++) this.long += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const n = Math.max(2, Math.ceil(this.long * 1.5));
    this.ech = []; for (let i = 0; i <= n; i++) this.ech.push({ ...along(P, i / n), t: i / n });
    // les embranchements (traces.js) comptent comme du sentier
    for (const L of tr?.autres || []) { let l = 0; for (let i = 1; i < L.length; i++) l += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); const m = Math.max(2, Math.ceil(l * 1.2)); for (let i = 0; i <= m; i++) this.ech.push({ ...along(L, i / m), t: 0.5, R: 9 }); }
    { let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; for (const p of this.ech) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      x0 = Math.floor(x0) - R0; y0 = Math.floor(y0) - R0; const w = Math.ceil(x1) + R0 - x0 + 1, h = Math.ceil(y1) + R0 - y0 + 1, D = new Float32Array(w * h).fill(1e9), Q = new Int32Array(w * h).fill(-1);
      for (let e = 0; e < this.ech.length; e++) {
        const p = this.ech[e], X = Math.round(p.x), Y = Math.round(p.y), R = p.R || R0, R2 = R * R;
        for (let y = Y - R; y <= Y + R; y++) for (let x = X - R; x <= X + R; x++) { const d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y); if (d > R2) continue; const i = (y - y0) * w + x - x0; if (d < D[i]) { D[i] = d; Q[i] = e; } }
      }
      for (let i = 0; i < Q.length; i++) { if (Q[i] < 0) continue; const x = x0 + i % w, y = y0 + Math.floor(i / w), p = this.ech[Q[i]]; if (!W.in(x, y)) continue; this.info.set(y * W.w + x, { d: Math.sqrt(D[i]), t: p.t, p, c: (x - p.x) * p.nx + (y - p.y) * p.ny }); } }
    this.k = (x, y) => y * W.w + x;
  }
  pick(L) { return L[Math.floor(this.r() * L.length)]; }
  inf(x, y) { return this.info.get(this.k(x, y)); }
  /** case de la route (son biome, à terre) */
  dans(x, y) { return this.W.in(x, y) && (this.W.biomes[this.k(x, y)] & 31) === this.nb && this.info.has(this.k(x, y)) && this.W.zoneAt(x, y)?.route === this.id; }
  sentier(x, y) { const t = this.W.get(x, y); return t === T.PATH || t === T.BRIDGE || t === T.STAIRS || t === T.PAVE; }
  /** case de nature à pied qu'on peut aménager */
  libre(x, y, dmin = 2.2) {
    if (!this.dans(x, y) || this.reserve.has(this.k(x, y)) || this.pris.has(this.k(x, y))) return false;
    return NATURE.has(this.W.get(x, y)) && this.inf(x, y).d >= dmin && !this.W.monts?.[this.k(x, y)];
  }
  /** case à pied dont on peut changer l'herbe (rien ne s'y bloque : les abords des dresseurs aussi) */
  sol(x, y, dmin = 1.9) { return this.dans(x, y) && !this.pris.has(this.k(x, y)) && NATURE.has(this.W.get(x, y)) && this.inf(x, y).d >= dmin && !this.W.monts?.[this.k(x, y)]; }
  /** case de forêt (hors d'atteinte) où poser un décor */
  foret(x, y) { return this.dans(x, y) && !this.reserve.has(this.k(x, y)) && !this.pris.has(this.k(x, y)) && FORET.has(this.W.get(x, y)); }
  /** peut-on bloquer ces cases sans couper un passage ? (cases : [x, y]) */
  sansCouper(cases) {
    const W = this.W, S = new Set(cases.map(([x, y]) => this.k(x, y)));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of cases) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 -= 6; y0 -= 6; x1 += 6; y1 += 6;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const pied = (x, y) => W.in(x, y) && walkable(W.get(x, y));
    const passe = (ax, ay, bx, by) => {
      const ta = W.get(ax, ay), tb = W.get(bx, by), dh = Math.abs(W.height(ax, ay) - W.height(bx, by));
      return dh === 0 || (dh <= 1 && (ta === T.STAIRS || tb === T.STAIRS));
    };
    const composantes = (sans) => {
      const id = new Int32Array(w * h); let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = (y - y0) * w + x - x0; if (id[i] || !pied(x, y) || (sans && S.has(this.k(x, y)))) continue;
        n++; const q = [[x, y]]; id[i] = n;
        while (q.length) {
          const [a, b] = q.pop();
          for (const [dx, dy] of N4) {
            const u = a + dx, v = b + dy; if (u < x0 || v < y0 || u > x1 || v > y1) continue;
            const j = (v - y0) * w + u - x0; if (id[j] || !pied(u, v) || (sans && S.has(this.k(u, v))) || !passe(a, b, u, v)) continue;
            id[j] = n; q.push([u, v]);
          }
        }
      }
      return id;
    };
    const A = composantes(false), Z = composantes(true), m = new Map();
    for (let i = 0; i < w * h; i++) {
      if (!Z[i]) continue;                          // bloquée, ou l'était déjà
      const v = m.get(A[i]); if (v === undefined) m.set(A[i], Z[i]); else if (v !== Z[i]) return false;
    }
    return true;
  }
  /** pose un terrain infranchissable (eau, rocher, buisson…) si rien n'est coupé */
  bloquer(cases, t) {
    cases = cases.filter(([x, y]) => walkable(this.W.get(x, y))); if (!cases.length || !this.sansCouper(cases)) return false;
    for (const [x, y] of cases) { this.W.set(x, y, t); this.pris.add(this.k(x, y)); }
    return true;
  }
  /** pose un décor sur une case (bloquant : seulement si rien n'est coupé) */
  prop(k, x, y, o = {}) {
    const bloque = o.bloque !== false;
    if (bloque && walkable(this.W.get(x, y)) && !this.sansCouper([[x, y]])) return false;
    if (bloque) { this.W.set(x, y, this.bio.sable ? T.SAND : T.GRASS); }
    this.W.prop(k, x, y, bloque, o.opt || {}); this.pris.add(this.k(x, y)); this.faits[k] = (this.faits[k] || 0) + 1;
    if (o.dit) this.W.object(x, y, { use: async (A) => A.say([].concat(o.dit)) });
    return true;
  }
  /** un décor quelque part au bord du sentier, entre d0 et d1 cases */
  seme(k, n, d0 = 3, d1 = 9, o = {}) {
    for (let i = 0, f = 0; i < n * 14 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, d = d0 + this.r() * (d1 - d0), x = Math.round(p.x + p.nx * s * d), y = Math.round(p.y + p.ny * s * d);
      if (!this.libre(x, y, d0 - 0.5) || (o.ecart && this.proche(k, x, y, o.ecart))) continue;
      if (this.prop(typeof k === 'string' ? k : this.pick(k), x, y, o)) { f++; (this.places ||= []).push([k, x, y]); }
    }
  }
  proche(k, x, y, e) { return (this.places || []).some(([q, a, b]) => q === k && Math.hypot(a - x, b - y) < e); }
  /** un décor au bord de la forêt ou dedans (hors d'atteinte : il remplace des arbres) */
  lisiere(k, n, dmax = 12) {
    for (let i = 0, f = 0; i < n * 20 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, d = 4 + this.r() * (dmax - 4), x = Math.round(p.x + p.nx * s * d), y = Math.round(p.y + p.ny * s * d);
      if (!this.foret(x, y)) continue;
      const g = this.W.get(x, y); this.W.prop(typeof k === 'string' ? k : this.pick(k), x, y, true); this.W.under.set(x + ',' + y, g); this.pris.add(this.k(x, y)); f++;
    }
  }
  /** deux rangées de décors de part et d'autre du sentier */
  allee(ks, { pas = 4, d = 3, t0 = 0.06, t1 = 0.94, cote = 0 } = {}) {
    ks = [].concat(ks); let n = 0;
    const N = Math.floor(this.long * (t1 - t0) / pas);
    for (let i = 0; i <= N; i++) {
      const p = along(this.main, t0 + (t1 - t0) * i / Math.max(1, N));
      for (const s of cote ? [cote] : [1, -1]) {
        for (const dd of [d, d + 0.7, d + 1.4]) {
          const x = Math.round(p.x + p.nx * s * dd), y = Math.round(p.y + p.ny * s * dd);
          if (!this.libre(x, y, d - 0.9)) continue;
          if (this.prop(ks[(i + (s > 0 ? 0 : 1)) % ks.length], x, y)) { n++; break; }
        }
      }
    }
    return n;
  }
  /** une arche de cinq cases de large au-dessus du sentier, là où il va du nord au sud ; ses deux pieds bloquent */
  arches(k, n, dit = null) {
    let f = 0;
    for (let i = 0; i < 300 && f < n; i++) {
      const p = this.ech[Math.floor((0.05 + 0.9 * ((f + this.r()) / n)) * (this.ech.length - 1))];
      if (Math.abs(p.dy) < 0.6) continue;
      const x = Math.round(p.x), y = Math.round(p.y), A = [x - 2, y], Z = [x + 2, y];
      if (![-1, 0, 1].every((a) => walkable(this.W.get(x + a, y)) && this.W.height(x + a, y) === this.W.height(x, y)) || this.proche(k, x, y, 12)) continue;
      const bon = ([a, b]) => this.dans(a, b) && !this.reserve.has(this.k(a, b)) && !this.pris.has(this.k(a, b)) && (NATURE.has(this.W.get(a, b)) || this.W.get(a, b) === T.PATH) && this.W.height(a, b) === this.W.height(x, y);
      if (!bon(A) || !bon(Z) || [-1, 0, 1].some((a) => this.reserve.has(this.k(x + a, y)) || this.pris.has(this.k(x + a, y))) || !this.sansCouper([A, Z])) continue;
      for (const [a, b] of [A, Z]) { this.W.under.set(a + ',' + b, T.GRASS); this.W.set(a, b, T.BLOCK); this.pris.add(this.k(a, b)); if (dit) this.W.object(a, b, { use: async (G) => G.say(dit) }); }
      this.W.prop(k, x, y, false, { dz: 0.35 }); this.pris.add(this.k(x, y)); (this.places ||= []).push([k, x, y]); this.faits[k] = (this.faits[k] || 0) + 1; this.lieux.push([k, x, y]); f++;
    }
    return f;
  }
  /** un rectangle w × h près du sentier dont toutes les cases (ou presque) sont libres ; rend son coin */
  place(w, h, { dmin = 2.4, dmax = 10, part = 1, essais = 400, sol = false } = {}) {
    for (let i = 0; i < essais; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, d = dmin + this.r() * (dmax - dmin);
      const x0 = Math.round(p.x + p.nx * s * (d + Math.abs(p.nx) * w / 2) - w / 2), y0 = Math.round(p.y + p.ny * s * (d + Math.abs(p.ny) * h / 2) - h / 2), h0 = this.W.height(x0, y0);
      let n = 0, non = 0; const max = w * h * (1 - part);
      for (let y = y0; y < y0 + h && non <= max; y++) for (let x = x0; x < x0 + w; x++) if ((sol ? this.sol(x, y, dmin) : this.libre(x, y, dmin)) && this.W.height(x, y) === h0) n++; else if (++non > max) break;
      if (n >= w * h * part && non <= max) return { x: x0, y: y0, w, h };
    }
    return null;
  }
  marque(R) { this.lieux.push([R.n || 'champ', Math.round(R.x + R.w / 2), Math.round(R.y + R.h / 2)]); for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) this.pris.add(this.k(x, y)); }
  /** un champ en sillons : rangs de culture et rangs de terre, un épouvantail ou une gerbe aux coins */
  champs(n, { w = [7, 11], h = [4, 7], t = T.TALL, entre = T.FLOWER, pas = 2, coins = null, part = 0.74 } = {}) {
    let f = 0;
    for (let i = 0; i < n; i++) {
      const R = this.place(w[0] + Math.floor(this.r() * (w[1] - w[0] + 1)), h[0] + Math.floor(this.r() * (h[1] - h[0] + 1)), { dmin: 1.9, part, sol: true }); if (!R) continue;
      for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (this.sol(x, y)) this.W.set(x, y, (y - R.y) % pas === 0 ? t : entre);
      if (coins) { const [cx, cy] = [this.r() < 0.5 ? R.x : R.x + R.w - 1, this.r() < 0.5 ? R.y : R.y + R.h - 1]; if (this.libre(cx, cy)) this.prop(this.pick(coins), cx, cy); }
      this.marque(R); f++;
    }
    return f;
  }
  /** un étang aux bords naturels ; dessus : décors flottants, autour : décors de rive */
  etangs(n, { rx = [2.6, 4.4], ry = [1.8, 3], dessus = null, rive = null, dmin = 3.2, dmax = 11, densite = 0.16 } = {}) {
    let f = 0;
    for (let i = 0; i < n * 30 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, a = rx[0] + this.r() * (rx[1] - rx[0]), b = ry[0] + this.r() * (ry[1] - ry[0]), d = dmin + a * Math.abs(p.nx) + b * Math.abs(p.ny) + this.r() * (dmax - dmin) * 0.6;
      const cx = p.x + p.nx * s * d, cy = p.y + p.ny * s * d, C = [], h0 = this.W.height(Math.round(cx), Math.round(cy)); let ok = true, g = this.r() * 99;
      for (let y = Math.floor(cy - b - 1); y <= cy + b + 1 && ok; y++) for (let x = Math.floor(cx - a - 1); x <= cx + a + 1; x++) {
        const q = ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 + (bruitBiome(x, y, 2.4, g) - 0.5) * 0.7; if (q > 1) continue;
        if (this.foret(x, y) && this.W.height(x, y) === h0) { C.push([x, y]); continue; }
        if (!this.libre(x, y, 2.2) || this.W.height(x, y) !== h0) { if (q > 0.55) continue; ok = false; break; }
        C.push([x, y]);
      }
      // de l'eau seulement là où l'on marchait : un arbre reste un arbre (aucun passage nouveau)
      const E = C.filter(([x, y]) => walkable(this.W.get(x, y)));
      if (!ok || E.length < 6 || E.length < C.length * 0.6 || !this.sansCouper(E)) continue;
      for (const [x, y] of E) { this.W.set(x, y, T.WATER); this.pris.add(this.k(x, y)); }
      const EK = new Set(E.map(([x, y]) => this.k(x, y)));
      if (dessus) for (const [x, y] of E) if (this.r() < densite && N4.every(([u, v]) => EK.has(this.k(x + u, y + v)))) this.W.prop(this.pick(dessus), x, y, false);
      if (rive) for (const [x, y] of E) for (const [u, v] of N4) if (this.libre(x + u, y + v, 2.6) && this.r() < densite) this.prop(this.pick(rive), x + u, y + v);
      (this.places ||= []).push(['etang', Math.round(cx), Math.round(cy)]); this.lieux.push(['etang', Math.round(cx), Math.round(cy)]); f++;
    }
    return f;
  }
  /** des mares dans la forêt, vues du sentier mais hors d'atteinte (une rangée d'arbres les entoure) ; autour : décors */
  mares(n, { rx = [2, 3.4], ry = [1.5, 2.4], rive = null, dessus = null, dmax = 9 } = {}) {
    let f = 0;
    for (let i = 0; i < n * 60 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, a = rx[0] + this.r() * (rx[1] - rx[0]), b = ry[0] + this.r() * (ry[1] - ry[0]), d = 5 + this.r() * (dmax - 5), cx = p.x + p.nx * s * d, cy = p.y + p.ny * s * d, C = [], Rv = [], h0 = this.W.height(Math.round(cx), Math.round(cy));
      let ok = true;
      for (let y = Math.floor(cy - b - 2); y <= cy + b + 2 && ok; y++) for (let x = Math.floor(cx - a - 2); x <= cx + a + 2; x++) {
        const q = ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 + (bruitBiome(x, y, 2.4, i) - 0.5) * 0.6, q2 = ((x - cx) / (a + 1.6)) ** 2 + ((y - cy) / (b + 1.6)) ** 2; if (q > 1 && q2 > 1) continue;
        if (!this.foret(x, y) || this.W.height(x, y) !== h0) { ok = false; break; }
        if (q <= 1) C.push([x, y]); else Rv.push([x, y]);
      }
      if (!ok || C.length < 6) continue;
      const CK = new Set(C.map(([x, y]) => this.k(x, y)));
      for (const [x, y] of C) { this.W.set(x, y, T.WATER); this.pris.add(this.k(x, y)); }
      if (dessus) for (const [x, y] of C) if (this.r() < 0.2) this.W.prop(this.pick(dessus), x, y, false);
      for (const [x, y] of Rv) { this.pris.add(this.k(x, y)); if (rive && this.r() < 0.5) { const g = this.W.get(x, y); this.W.prop(this.pick(rive), x, y, true); this.W.under.set(x + ',' + y, g); } }
      this.lieux.push(['mare', Math.round(cx), Math.round(cy)]); f++;
    }
    return f;
  }
  /** des rizières : casiers d'eau séparés par des diguettes d'une case, pousses vertes ou dorées */
  rizieres(n) {
    let f = 0;
    for (let i = 0; i < n * 2 && f < n; i++) {
      const nx = 2 + Math.floor(this.r() * 2), ny = 1 + Math.floor(this.r() * 2), cw = 4, ch = 3, w = nx * (cw + 1) + 1, h = ny * (ch + 1) + 1;
      const R = this.place(w, h, { dmin: 2.2, part: 0.64 }); if (!R) continue;
      for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
        const C = [], x0 = R.x + 1 + k * (cw + 1), y0 = R.y + 1 + j * (ch + 1), mur = this.r() < 0.3;
        for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) if (this.libre(x, y, 2.4)) C.push([x, y]);
        if (C.length < cw * ch * 0.6 || !this.bloquer(C, T.WATER)) continue;
        for (const [x, y] of C) if (hasardCase(x, y, 5) < 0.86) this.W.prop(mur ? 'riz2' : 'riz', x, y, false);
      }
      // les diguettes : herbe rase
      for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (this.libre(x, y, 1.9)) this.W.set(x, y, T.GRASS);
      R.n = 'riziere'; this.marque(R); f++;
    }
    return f;
  }
  /** le sentier passe sur l'eau : une passerelle droite de deux cases, une nappe d'eau de chaque côté */
  passerelles(n, { larg = 4, dessus = null, rive = null, long = [7, 14] } = {}) {
    const W = this.W; let f = 0;
    for (let i = 0; i < n * 140 && f < n; i++) {
      const p = this.ech[Math.floor((0.08 + 0.84 * this.r()) * (this.ech.length - 1))], ew = Math.abs(p.dx) > Math.abs(p.dy);
      if (Math.max(Math.abs(p.dx), Math.abs(p.dy)) < 0.86) continue;
      const cx = Math.round(p.x), cy = Math.round(p.y), L = long[0] + Math.floor(this.r() * (long[1] - long[0])), h0 = W.height(cx, cy);
      const at = (u, v) => (ew ? [cx + u, cy + v] : [cx + v, cy + u]);
      // les deux planches : deux rangées du sentier, praticables de bout en bout (et une case de sentier à chaque bout)
      let ok = true, v0 = null;
      for (const v of [0, -1]) { let q = true; for (let u = -1; u <= L && q; u++) for (const e of [0, 1]) { const [x, y] = at(u, v + e); if (!this.dans(x, y) || W.get(x, y) !== T.PATH || W.height(x, y) !== h0 || this.reserve.has(this.k(x, y)) || this.pris.has(this.k(x, y))) q = false; } if (q) { v0 = v; break; } }
      if (v0 == null) continue;
      const E = [], PL = [];
      for (let u = 0; u < L && ok; u++) for (let v = -larg - 3; v <= larg + 4; v++) {
        const [x, y] = at(u, v), b = Math.abs(v - v0 - 0.5);
        if (v === v0 || v === v0 + 1) { PL.push([x, y]); continue; }
        const bord = larg + 0.5 + (bruitBiome(u, v > 0 ? 1 : 0, 3, i + 60) - 0.5) * 2.6 - (u === 0 || u === L - 1 ? 1.4 : 0);
        if (b > bord) continue;
        const t = W.get(x, y);
        if (FORET.has(t) || !walkable(t)) { if (b < 2) ok = false; continue; }
        if (!this.dans(x, y) || this.reserve.has(this.k(x, y)) || this.pris.has(this.k(x, y)) || W.height(x, y) !== h0 || !(NATURE.has(t) || t === T.PATH)) { if (b < 3) ok = false; continue; }
        E.push([x, y]);
      }
      if (!ok || E.length < L * 3 || !this.sansCouper(E)) continue;
      for (const [x, y] of E) { W.set(x, y, T.WATER); this.pris.add(this.k(x, y)); }
      for (const [x, y] of PL) { W.set(x, y, T.BRIDGE); this.pris.add(this.k(x, y)); }
      const EK = new Set(E.map(([x, y]) => this.k(x, y)));
      for (const [x, y] of E) {
        if (dessus && this.r() < 0.14) W.prop(this.pick(dessus), x, y, false);
        else if (rive && this.r() < 0.3 && N4.some(([u, v]) => !EK.has(this.k(x + u, y + v)) && !PL.some(([a, b]) => a === x + u && b === y + v))) W.prop(this.pick(rive), x, y, false);
      }
      for (let a = -1; a <= L; a += 3) for (const v of [v0 - 1, v0 + 2]) { const [x, y] = at(a, v); if (EK.has(this.k(x, y)) && this.lampe && (a + 1) % 6 === 0) W.prop(this.lampe, x, y, false); }
      for (let u = -2; u <= L + 1; u++) for (const e of [0, 1]) { const [x, y] = at(u, v0 + e); this.pris.add(this.k(x, y)); }
      f++; this.faits.passerelle = f; this.lieux.push(['passerelle', cx, cy]);
    }
    return f;
  }
  /** un cercle de pierres dressées autour d'une pierre gravée */
  cercle(ks, centre, dit, { rx = 3.2, ry = 2.5, n = 8 } = {}) {
    for (let i = 0; i < 40; i++) {
      const R = this.place(Math.ceil(rx * 2 + 2), Math.ceil(ry * 2 + 2), { dmin: 2.4, dmax: 11, part: 0.9 - i * 0.005, essais: 40 }); if (!R) continue;
      const cx = R.x + (R.w - 1) / 2, cy = R.y + (R.h - 1) / 2;
      for (let k = 0; k < n; k++) { const a = k / n * 6.283 + 0.2, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry); if (this.libre(x, y)) this.prop(this.pick(ks), x, y); }
      const X = Math.round(cx), Y = Math.round(cy); if (centre && this.libre(X, Y)) this.prop(centre, X, Y, { dit });
      for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (this.libre(x, y) && this.W.get(x, y) !== T.FLOWER) this.W.set(x, y, hasardCase(x, y, 8) < 0.3 ? T.FLOWER : T.GRASS);
      R.n = 'cercle'; this.marque(R); return true;
    }
    return false;
  }
  /** un quadrillage de décors (verger, vigne, cimetière, parterres) */
  grille(n, ks, { nx = 4, ny = 3, px = 2, py = 2, sol = T.GRASS, part = 0.74, dmax = 11 } = {}) {
    let f = 0; ks = [].concat(ks);
    for (let i = 0; i < n; i++) {
      const R = this.place(nx * px + 1, ny * py + 1, { dmin: 2.4, dmax, part }); if (!R) continue;
      for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (this.libre(x, y)) this.W.set(x, y, sol);
      const k = this.pick(ks);
      for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) { const x = R.x + 1 + a * px, y = R.y + 1 + b * py; if (this.libre(x, y)) this.prop(Array.isArray(k) ? this.pick(k) : k, x, y); }
      R.n = 'grille'; this.marque(R); f++;
    }
    return f;
  }
  /** de longues rangées (haies, vignes) d'une case d'épaisseur, d'est en ouest, avec des trouées */
  rangees(n, k, { w = [6, 9], nb = [2, 4], pas = 2, sol = T.GRASS, entre = null } = {}) {
    let f = 0;
    for (let i = 0; i < n; i++) {
      const L = w[0] + Math.floor(this.r() * (w[1] - w[0] + 1)), N = nb[0] + Math.floor(this.r() * (nb[1] - nb[0] + 1)), R = this.place(L + 2, N * pas + 1, { dmin: 2.6, part: 0.78 }); if (!R) continue;
      for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) if (this.libre(x, y)) this.W.set(x, y, entre != null && (y - R.y) % pas === 0 ? entre : sol);
      for (let j = 0; j < N; j++) { const trou = 1 + Math.floor(this.r() * L); for (let x = 1; x <= L; x++) if (x !== trou && this.libre(R.x + x, R.y + 1 + j * pas)) this.prop(typeof k === 'string' ? k : this.pick(k), R.x + x, R.y + 1 + j * pas); }
      R.n = 'rangees'; this.marque(R); f++;
    }
    return f;
  }
  /** un amas serré d'un même décor (champignons, cristaux…) */
  amas(n, ks, { taille = [3, 6], ray = 1.9, dmin = 3, dmax = 10 } = {}) {
    let f = 0;
    for (let i = 0; i < n * 10 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, d = dmin + this.r() * (dmax - dmin), cx = p.x + p.nx * s * d, cy = p.y + p.ny * s * d, N = taille[0] + Math.floor(this.r() * (taille[1] - taille[0] + 1));
      let m = 0; for (let q = 0; q < N * 4 && m < N; q++) { const x = Math.round(cx + (this.r() - 0.5) * 2 * ray), y = Math.round(cy + (this.r() - 0.5) * 2 * ray * 0.8); if (this.libre(x, y, dmin - 0.5) && this.prop(this.pick(ks), x, y)) m++; }
      if (m) f++;
    }
    return f;
  }
  /** un bâtiment de décor (moulin, phare, grange…), sans porte */
  batiment(modele, w, d, h, dit = null, dmax = 11) {
    for (let i = 0; i < 400; i++) {
      const p = this.ech[Math.floor((0.12 + 0.76 * this.r()) * (this.ech.length - 1))], s = this.r() < 0.5 ? 1 : -1, q = 4 + this.r() * (dmax - 4), x0 = Math.round(p.x + p.nx * s * q - w / 2), y0 = Math.round(p.y + p.ny * s * q - d / 2), h0 = this.W.height(x0, y0);
      let ok = true, n = 0, frontOpen = false; const C = [];
      for (let j = -1; j <= d && ok; j++) for (let k = -1; k <= w; k++) {
        const x = x0 + k, y = y0 + j, bord = j < 0 || k < 0 || j === d || k === w, f = this.foret(x, y);
        if (!(f || this.libre(x, y, 2.2)) || this.W.height(x, y) !== h0) { ok = false; break; }
        if (j === d && k >= 0 && k < w && !f) frontOpen = true;
        if (!bord) { if (!f) C.push([x, y]); n++; }
      }
      // rien d'important caché derrière (au nord, sur la hauteur du bâtiment)
      for (let j = 1; j <= h && ok; j++) for (let k = 0; k < w; k++) if (this.sentier(x0 + k, y0 - j) || this.reserve.has(this.k(x0 + k, y0 - j))) { ok = false; break; }
      if (!ok || !n || !frontOpen || (C.length && !this.sansCouper(C))) continue;
      this.W.building('tower', x0, y0, { w, d, h, door: -1, modele, name: modele, roof: 'gray' });
      for (let j = -1; j <= d; j++) for (let k = -1; k <= w; k++) this.pris.add(this.k(x0 + k, y0 + j));
      if (dit) for (let k = 0; k < w; k++) this.W.object(x0 + k, y0 + d - 1, { use: async (A) => A.say([].concat(dit)) });
      this.faits[modele] = (this.faits[modele] || 0) + 1; this.lieux.push([modele, x0 + (w >> 1), y0 + d + 1]);
      return true;
    }
    return false;
  }
  /** des pitons de roche (mesas, aiguilles) */
  pitons(n, { rx = [2, 4], ry = [1.8, 3.2], max = 3, dmin = 4 } = {}) {
    let f = 0;
    for (let i = 0; i < n * 30 && f < n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, a = rx[0] + this.r() * (rx[1] - rx[0]), b = ry[0] + this.r() * (ry[1] - ry[0]), d = dmin + a * Math.abs(p.nx) + b * Math.abs(p.ny) + this.r() * 4;
      const cx = p.x + p.nx * s * d, cy = p.y + p.ny * s * d, C = [], h0 = this.W.height(Math.round(cx), Math.round(cy)); let ok = h0 === 0;
      for (let y = Math.floor(cy - b - 1); y <= cy + b + 2 && ok; y++) for (let x = Math.floor(cx - a - 1); x <= cx + a + 1; x++) {
        const q = ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 + (bruitBiome(x, y, 2.2, i) - 0.5) * 0.4; if (q > 1.5) continue;
        if (!this.libre(x, y, 3) || this.W.height(x, y) !== h0) { ok = false; break; }
        if (q <= 1) C.push([x, y]);
      }
      if (!ok || C.length < 7 || !this.sansCouper(C)) continue;
      for (const [x, y] of C) { this.W.set(x, y, T.TREE); this.pris.add(this.k(x, y)); for (const [u, v] of N4) this.pris.add(this.k(x + u, y + v)); }
      massif(this.W, C, { pas: 1.4, max, base: h0 }); f++; this.faits.piton = f; this.lieux.push(['piton', Math.round(cx), Math.round(cy)]);
    }
    return f;
  }
  /** le sentier : 'large' (une allée de cinq cases), 'efface' (mangé par l'herbe) */
  voie(mode) {
    const W = this.W;
    for (const [k, v] of this.info) {
      const x = k % W.w, y = (k - x) / W.w; if (v.d > 3 || !this.dans(x, y) || this.reserve.has(k)) continue;
      const t = W.get(x, y);
      if (mode === 'large' && v.d <= 1.65 && NATURE.has(t) && W.height(x, y) === W.height(Math.round(v.p.x), Math.round(v.p.y))) W.set(x, y, T.PATH);
      else if (mode === 'efface' && t === T.PATH && v.d > 0.75 && bruitBiome(x, y, 2.2, 31) > 0.52) W.set(x, y, T.GRASS);
    }
  }
  /** les carrés d'herbes hautes en vrac laissent la place à un dessin : une part redevient herbe rase */
  degager(part) {
    const W = this.W;
    for (const [k, v] of this.info) {
      const x = k % W.w, y = (k - x) / W.w; if (v.d < 1.8 || !this.dans(x, y)) continue;
      const t = W.get(x, y); if ((t === T.TALL || t === T.DARKTALL || t === T.FLOWER) && bruitBiome(x, y, 9, 44) < part) W.set(x, y, T.GRASS);
    }
  }
}

/* ---------------- la vie des routes ---------------- */
const CLAIRS = new Set(['savane', 'desert', 'canyon', 'cote', 'gorge']);
const SECS = new Set(['desert', 'canyon', 'gorge', 'orage', 'braises', 'givre']);   // pas de tapis de fleurs
const TALUS = new Set([T.STAIRS, T.CLIFF, T.LEDGE, T.LEDGE_E, T.LEDGE_W, T.DOOR, T.CAVEDOOR, T.BRIDGE]);
Object.assign(Chantier.prototype, {
  /** une case où poser quelqu'un ou quelque chose sans rien gêner : ses huit voisines sont praticables, au même niveau */
  degagee(x, y, herbe = true) {
    const W = this.W, t = W.get(x, y); if (this.etq[this.k(x, y)] !== this.L0 || !this.dans(x, y) || this.reserve.has(this.k(x, y)) || this.pris.has(this.k(x, y)) || !(SOLS.has(t) && (herbe || (t !== T.TALL && t !== T.DARKTALL)))) return false;
    const h = W.height(x, y);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const q = W.get(x + a, y + b); if (!walkable(q) || TALUS.has(q) || W.height(x + a, y + b) !== h || this.occ.has(this.k(x + a, y + b))) return false; }
    return true;
  },
  coin(x, y, r, sauf = 0) {
    const L = []; for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const d = Math.hypot(a, b); if (d <= r && d >= sauf && this.degagee(x + a, y + b, false)) L.push([x + a, y + b]); }
    return L.length ? this.pick(L) : null;
  },
  abords(p, r = 1) { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) this.reserve.add(this.k(p[0] + a, p[1] + b)); this.occ.add(this.k(...p)); },
  /** quelqu'un (ou un Pokémon) à cet endroit */
  quelquun(p, o) { const n = this.W.npc({ x: p[0], y: p[1], ...o }); this.abords(p); return n; },
  objetA(p, item, id) { this.W.item(p[0], p[1], item, 1, id); this.abords(p); },
  /** un petit décor bloquant qui ne coupe rien */
  pose(k, p) { if (!p) return false; this.W.prop(k, p[0], p[1], true); this.pris.add(this.k(...p)); this.occ.add(this.k(...p)); return true; },
  /** les clairières, corniches et bords de chemin prennent vie */
  habiter({ trainerNpc, enc, noms }) {
    const W = this.W, id = this.id, rang = rangRoute(id), LOTS = lotsPour(rang), lot = () => adapter(this.pick(LOTS), rang), gens = (GENS[this.bio.id] || []).slice();
    const salles = (this.tr?.salles || []).slice(), n0 = salles.length, SCENES = ['camp', 'pique', 'defi', 'etude', 'defi', 'gens', 'defi', 'camp', 'pique'];
    // en plus : des haltes au bord du chemin
    for (let i = 0, n = Math.max(2, Math.round(this.long / 55)); i < n * 12 && salles.length < n0 + n; i++) {
      const p = this.pick(this.ech), s = this.r() < 0.5 ? 1 : -1, d = 4 + this.r() * 5, x = Math.round(p.x + p.nx * s * d), y = Math.round(p.y + p.ny * s * d);
      if (!this.degagee(x, y) || salles.some((q) => Math.hypot(q.x - x, q.y - y) < 14)) continue; salles.push({ x, y, r: 3, sorte: 'halte' });
    }
    let no = 0, nv = 0, nd = 0, suite = Math.floor(this.r() * SCENES.length);
    for (const q of salles) {
      const { x, y } = q, r = Math.max(2, q.r), kind = SCENES[suite++ % SCENES.length], centre = this.coin(x, y, r) || this.coin(x, y, r + 3); if (!centre) continue;
      const pres = (sauf = 1.5) => this.coin(centre[0], centre[1], 3, sauf);
      const parle = (p, sprite, nom, o) => p && this.quelquun(p, { id: `${id}:v${nv++}`, sprite, name: nom, dir: p[0] < centre[0] ? 'right' : p[0] > centre[0] ? 'left' : p[1] < centre[1] ? 'down' : 'up', move: 'turn', ...o });
      // un objet au fond de chaque clairière et au sommet de chaque corniche
      if (q.sorte !== 'halte' && q.sorte !== 'detour') { const p = this.coin(x, y, r + 2, Math.max(1, r - 2)); if (p) this.objetA(p, lot(), `${id}:t${no++}`); }
      if (kind === 'camp') {
        this.pose('brasero', this.coin(...centre, 1) || null); this.pose('tonneau', pres(2)); this.pose('caisses', pres(2));
        const txt = this.pick(CAMP);
        parle(pres(1.2), this.pick(['randonneuse', 'montagnard']), 'Campeur', { talk: async (A) => { await A.say(txt, 'Campeur'); if (await A.yesNo('Te reposer près du feu ?', 'Campeur')) { A.sfx('heal'); A.heal(); await A.say('Ton équipe se repose au coin du feu. Tout le monde est en pleine forme !'); } } });
      } else if (kind === 'pique') {
        const f = `${id}:pique${nv}`, txt = this.pick(PIQUENIQUE), baie = adapter('sitrus-berry', rang);
        parle(pres(1), 'habitante', 'Pique-niqueuse', { talk: async (A) => { if (A.f[f]) { await A.say('Bonne route ! Et prends le temps de regarder autour de toi.', 'Pique-niqueuse'); return; } await A.say(txt, 'Pique-niqueuse'); A.flag(f); await A.give(baie, 2); } });
        this.pose('caisse', pres(2));
      } else if (kind === 'etude') {
        const f = `${id}:etude${nv}`, txt = this.pick(ETUDE), don = lot(); this.pose('caisses', pres(1.5)); this.pose('caisse', pres(1.5));
        parle(this.coin(...centre, 2), 'scientifique', 'Chercheur de terrain', { talk: async (A) => { if (A.f[f]) { await A.say('Je note, je compte, je note encore. Continue, toi : tu vois des choses que je ne vois pas !', 'Chercheur de terrain'); return; } await A.say(txt, 'Chercheur de terrain'); A.flag(f); await A.give(don); } });
      } else if (kind === 'defi' && enc.length && q.sorte !== 'halte') {
        const cls = this.pick(['Randonneuse', 'Montagnard', 'Topdresseur', 'Topdresseuse', 'Insectomane', 'Karatéka']), N = 1 + Math.floor(this.r() * 3), haut = Math.max(...enc.map((e) => e[2])), team = [];
        for (let i = 0; i < N; i++) team.push([this.pick(enc)[0], Math.min(100, haut + 1 - (N - 1) + Math.floor(this.r() * 2))]);
        trainerNpc(W, centre[0], centre[1], this.pick(['down', 'left', 'right', 'up']), cls, noms(/euse|ée$/.test(cls) && cls !== 'Karatéka' ? 'f' : 'm'), team, { id: `${id}:s${nd++}`, sight: 2, intro: this.pick(DEFI), after: this.pick(APRES_DEFI) });
        this.abords(centre, 2);
      } else if (gens.length) {
        // quelqu'un du coin : il raconte, puis donne un petit quelque chose (une seule fois)
        const g = gens.pop(), f = `${id}:don${nv}`, don = lot();
        parle(centre, g[0], g[1], { talk: async (A) => { if (A.f[f]) { await A.say(g[2][g[2].length - 1], g[1]); return; } for (const l of g[2]) await A.say(l, g[1]); A.flag(f); await A.say('Tiens, prends ça. Moi, je n\'en ai plus besoin.', g[1]); await A.give(don); } });
        if (this.r() < 0.5) this.pose('banc', pres(1.5));
      } else continue;
      this.lieux.push(['scene:' + kind, centre[0], centre[1]]);
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) this.pris.add(this.k(centre[0] + a, centre[1] + b));
    }
    // (plus de passants qui ne font que parler, ni de Pokémon de décor : chaque personne d'une route sert à quelque chose)
    Object.assign(this.faits, { gens: nv, objets: no, defis: nd });
  },
  /** les vides se remplissent : fourrés, rochers, buissons, menu décor, et quelques cachettes */
  remplir() {
    const W = this.W, g = this.graine, petits = PETITS[this.bio.id] || [['bush', 1]];
    // 1. des fourrés par plaques (la forêt du biome)
    const cand = new Set(); for (const [k, v] of this.info) { const x = k % W.w, y = (k - x) / W.w; if (v.d < 2.9 || !this.libre(x, y, 2.9) || this.occ.has(k) || W.objects.has(x + ',' + y)) continue; if (bruitBiome(x, y, 6.5, g) * 0.7 + bruitBiome(x, y, 2.6, g + 1) * 0.3 > SEUIL_BOIS) cand.add(k); }
    let nf = 0;
    for (const k0 of [...cand]) {
      if (!cand.delete(k0)) continue; const C = [k0];
      for (let i = 0; i < C.length && C.length < 34; i++) { const x = C[i] % W.w, y = (C[i] - x) / W.w; for (const [u, v] of N4) { const k = this.k(x + u, y + v); if (C.length < 34 && W.height(x + u, y + v) === W.height(x, y) && cand.delete(k)) C.push(k); } }
      if (C.length < 4) continue;
      // savane, déserts, côte : des arbres espacés, pas une haie
      if (CLAIRS.has(this.bio.id)) { const L = C.map((k) => [k % W.w, Math.floor(k / W.w)]).filter(([x, y]) => (x + 2 * y + (hasardCase(x >> 2, y >> 2, g) < 0.5 ? 1 : 0)) % 4 === 0); for (const c of L) if (this.degagee(...c) && this.bloquer([c], hasardCase(...c, g) < 0.3 ? T.PINE : T.TREE)) nf++; continue; }
      const cases = C.map((k) => [k % W.w, Math.floor(k / W.w)]);
      if (this.bloquer(cases, hasardCase(...cases[0], g) < 0.3 ? T.PINE : T.TREE)) nf += cases.length;
    }
    // 2. le menu décor, semé par touffes ; sous certains, quelque chose est caché
    let np = 0, nc = 0; const rang = rangRoute(this.id), LOTS = lotsPour(rang), NC = Math.round(this.long / 90) + 1;
    for (const [k, v] of this.info) {
      const x = k % W.w, y = (k - x) / W.w; if (v.d < 2.2 || W.get(x, y) === T.PATH) continue;
      if (hasardCase(x, y, g + 5) > 0.085 + 0.34 * Math.max(0, bruitBiome(x, y, 5, g + 6) - 0.35) || !this.degagee(x, y)) continue;
      const q = essence(petits, hasardCase(x, y, g + 7)), tuile = q === 'bush' ? T.BUSH : q === 'rock' ? T.ROCK : 0;
      if (tuile) { W.set(x, y, tuile); this.pris.add(k); } else this.pose(q, [x, y]);
      np++;
      if (nc < NC && hasardCase(x, y, g + 8) < 0.04) { cacher(W, x, y, `${this.id}:h${nc}`, adapter(this.pick(LOTS), rang), 1, tuile ? null : q); nc++; }
    }
    // 3. des tapis de fleurs et de grandes plaques d'herbes hautes : loin du sentier, plus de sol nu
    for (const [k, v] of this.info) {
      const x = k % W.w, y = (k - x) / W.w; if (v.d < 1.8 || this.pris.has(k) || !this.dans(x, y) || W.get(x, y) !== T.GRASS) continue;
      const a = bruitBiome(x, y, 4.5, g + 9); if (a > 0.78 && !SECS.has(this.bio.id)) W.set(x, y, T.FLOWER); else if (a < SEUIL_HERBES && v.d > 2.2 && !this.reserve.has(k) && !SANS_HERBES.has(matiere(this.nb, x, y))) W.set(x, y, T.TALL);
    }
    // 4. le sol nu hors du ruban (clairières et boucles de la trame) : on y va à pied depuis le sentier, et à plus de deux pas
    //    du chemin le sol nu prend des herbes hautes par grandes plaques (les herbes ne bloquent rien : aucun passage coupé)
    let nh = 0; { const D = new Map(), F = [];
      for (const L of [this.main, ...(this.tr?.autres || [])]) for (const [x, y] of L) { const k = this.k(Math.round(x), Math.round(y)); if (!D.has(k)) { D.set(k, 0); F.push(k); } }
      for (let i = 0; i < F.length; i++) {
        const k = F[i], x = k % W.w, y = (k - x) / W.w, d = D.get(k); if (d >= 24) continue;
        for (const [u, v] of N4) { const a = x + u, b = y + v, q = this.k(a, b); if (D.has(q) || !W.in(a, b) || !walkable(W.get(a, b)) || W.zoneAt(a, b)?.route !== this.id) continue; D.set(q, this.sentier(a, b) ? 0 : d + 1); F.push(q); }
      }
      for (const [k, d] of D) {
        const x = k % W.w, y = (k - x) / W.w; if (d < 3 || W.get(x, y) !== T.GRASS || this.pris.has(k) || this.reserve.has(k) || this.occ.has(k) || W.objects.has(x + ',' + y) || (W.biomes[k] & 31) !== this.nb) continue;
        if (bruitBiome(x, y, 4.5, g + 9) < SEUIL_HERBES + 0.2 && !SANS_HERBES.has(matiere(this.nb, x, y))) { W.set(x, y, T.TALL); nh++; }
      } }
    Object.assign(this.faits, { fourres: nf, petits: np, cachettes: nc, herbes: nh });
  },
});

// remplissage du vide : au-dessus de SEUIL_BOIS, un bosquet ; sous SEUIL_HERBES, des herbes hautes (bruits de 0 à 1)
const SEUIL_BOIS = 0.53, SEUIL_HERBES = 0.56;
// pas de hautes herbes sur une plaque de neige ou de cendre (comme sur DS : elles y feraient des carrés d'herbe)
const SANS_HERBES = new Set(['neige', 'cendre']);

/** ce que chaque biome fait de sa route (u : nombre de choses pour 100 cases de chemin) */
const PLANS = {
  campagne(C, u) {
    C.degager(0.62); C.batiment('moulin', 4, 4, 6, 'Le moulin de la Route 1. Ses ailes grincent doucement dans le vent.');
    C.champs(u(9), { coins: ['epouvantail', 'gerbe', 'gerbe'], entre: T.GRASS, w: [7, 12] }); C.grille(u(1.6), 'tournesol', { nx: 4, ny: 3, px: 1, py: 2 });
    C.seme('gerbe', u(6), 3, 8, { ecart: 4 }); C.seme('ruche', u(1.5), 4, 9); C.allee('b_peuplier', { pas: 7, d: 3.2 });
  },
  valfleuri(C, u) {
    C.degager(0.4); C.passerelles(u(2.2), { dessus: ['nenuphar_f', 'nenuphar'], rive: ['roseaux_b'] }); C.etangs(u(4), { dessus: ['nenuphar_f', 'nenuphar'], rive: ['roseaux_b'] });
    C.champs(u(4), { t: T.FLOWER, entre: T.FLOWER, pas: 1 }); C.arches('arche_glycine', u(1.4)); C.seme(['hortensia', 'rosier_blanc'], u(8), 3, 9); C.seme('ruche', u(1), 4, 9);
  },
  murmure(C, u) {
    C.voie('efface'); C.degager(0.4); C.amas(u(8), ['champi_violet', 'b_champi_bleu', 'champi_violet']); C.etangs(u(2.4), { dessus: ['nenuphar'], rive: ['champi_violet'] }); C.mares(u(5), { rive: ['champi_violet', 'b_champi_bleu'], dessus: ['nenuphar_f'] });
    C.cercle(['champi_rouge', 'champi_violet'], 'autel', ['Un petit autel au milieu d\'un rond de champignons. Une lueur douce y brûle, sans flamme.', 'On raconte que les Pokémon du bois viennent y danser, les nuits sans lune.']); C.seme('souche_m', u(4), 3, 9, { ecart: 5 }); C.lisiere(['b_champi_bleu', 'b_champi_bleu', 'champi_violet'], u(16)); C.allee(['champi_violet', 'b_champi_bleu'], { pas: 6, d: 2.5 });
  },
  alpage(C, u) {
    C.degager(0.5); C.pitons(u(3), { max: 2 }); C.etangs(u(1.6), {}); C.arches('fanions', u(2), 'Des fanions de prière claquent au vent des cimes.'); C.seme('cairn', u(7), 2.8, 7, { ecart: 6 }); C.champs(u(3), { t: T.FLOWER, entre: T.GRASS, pas: 2, w: [6, 9], h: [4, 6] }); C.seme('menhir2', u(3), 4, 9);
  },
  cerisaie(C, u) {
    C.degager(0.55); C.allee(['cerisier', 'b_cerisier_blanc'], { pas: 3, d: 2.8 }); C.arches('arche_rose', u(2.5)); C.etangs(u(2.4), { dessus: ['nenuphar_f'] }); C.champs(u(2.5), { t: T.TALL, entre: T.GRASS }); C.seme('lanterne_bois', u(4), 2.6, 4, { ecart: 8 });
  },
  lande(C, u) {
    C.voie('efface'); C.cercle(['menhir', 'menhir2', 'menhir'], 'menhir_rune', ['Une pierre gravée de signes qui luisent faiblement.', '« Dressées avant les hommes, nous comptons les orages. »']); C.cercle(['menhir', 'menhir2'], 'menhir_rune', ['Les signes gravés forment une carte du ciel.']);
    C.seme(['menhir', 'menhir2'], u(6), 3, 9, { ecart: 5 }); C.etangs(u(2.4), { rive: ['roseaux_b'] }); C.seme('paratonnerre', u(2), 3, 6, { ecart: 12 }); C.seme('cairn', u(2.5), 3, 8); C.pitons(u(1.4), { max: 2 });
  },
  savane(C, u) {
    C.degager(0.4); C.etangs(u(1.8), { rx: [3.4, 5.5], ry: [2.2, 3.4], rive: ['roseaux_b'] }); C.pitons(u(1.8), { max: 3 }); C.seme('b_acacia', u(9), 3.4, 10, { ecart: 4 }); C.seme('b_baobab', u(2.4), 5, 10, { ecart: 12 }); C.seme('totem', u(1.4), 3, 6, { ecart: 14 }); C.seme('crane', u(1.6), 3, 9, { ecart: 12 }); C.arches('arche_os', u(0.7), 'Les côtes d\'un géant, blanchies par le soleil. Quel Pokémon pouvait être aussi grand ?');
  },
  lavande(C, u) {
    C.degager(0.75); C.champs(u(7), { entre: T.GRASS, w: [8, 12], h: [5, 7], part: 0.78 }); C.champs(u(2), { t: T.FLOWER, entre: T.FLOWER, pas: 1 }); C.grille(u(1.6), 'tournesol', { nx: 5, ny: 2, px: 1, py: 2 }); C.arches('arche_glycine', u(1.6)); C.allee('b_cypres', { pas: 5, d: 3 }); C.seme('ruche', u(3), 3.5, 8, { ecart: 5 }); C.batiment('moulin', 4, 4, 6, 'Un moulin à parfum. Tout sent la lavande, ici.');
  },
  mirage(C, u) {
    C.degager(0.45); C.amas(u(6), ['cristal_rose', 'b_cristal', 'cristal_rose']); C.etangs(u(3), { rive: ['cristal_rose'] }); C.cercle(['b_cristal', 'cristal_rose'], 'menhir_rune', ['Les cristaux chantent quand on s\'approche.', 'Dans leurs facettes, ton reflet a un instant de retard…']); C.allee(['cristal_rose'], { pas: 9, d: 2.8 }); C.lisiere('b_cristal', u(6));
  },
  jungle(C, u) {
    C.voie('efface'); C.mares(u(3), { rive: ['b_fougere', 'fleur_geante'], dessus: ['nenuphar_f'] }); C.etangs(u(2.4), { dessus: ['nenuphar', 'nenuphar_f'], rive: ['b_fougere'] }); C.passerelles(u(1.6), { dessus: ['nenuphar'], rive: ['roseaux_b'] }); C.seme('fleur_geante', u(4), 3, 9, { ecart: 6 }); C.seme('totem', u(2.4), 2.8, 6, { ecart: 9 }); C.seme('b_fougere', u(8), 3, 9); C.seme('souche_m', u(2), 3, 9);
    C.cercle(['totem', 'menhir2'], 'autel', ['Un autel de la vieille forêt, gardé par des totems.', '« Écailles, plumes ou pelage : la jungle ne fait pas de différence. »'], { n: 6 });
  },
  gorge(C, u) {
    C.etangs(u(4), { rx: [1.8, 3.2], ry: [1.4, 2.2], rive: ['geyser'], densite: 0.1 }); C.seme('geyser', u(5), 3, 8, { ecart: 5 }); C.pitons(u(3), { max: 3 }); C.seme('cairn', u(2), 2.8, 6);
  },
  taiga(C, u) {
    C.degager(0.4); C.etangs(u(2), {}); C.pitons(u(2), { max: 2 }); C.lisiere('cristal_glace', u(6)); C.seme('cairn', u(5), 2.6, 5, { ecart: 8 }); C.arches('fanions', u(1.2), 'Les dresseurs qui ont vaincu la Route Victoire accrochent ici un fanion.'); C.seme('cristal_glace', u(4), 3, 9, { ecart: 4 }); C.seme('souche_m', u(2), 3, 8);
  },
  celeste(C, u) {
    C.voie('large'); C.degager(0.6); C.allee(['colonne_c', 'colonne_c', 'colonne_b'], { pas: 4, d: 3.4 }); C.etangs(u(3), {}); C.seme('colonne_b', u(4), 4.5, 9, { ecart: 4 }); C.champs(u(2.5), { t: T.FLOWER, entre: T.FLOWER, pas: 1, w: [5, 7], h: [3, 4] });
    C.cercle(['colonne_c', 'colonne_b'], 'autel', ['Le vent des hauteurs chante entre les colonnes.', 'Des noms de Maîtres sont gravés dans le marbre. Le dernier : Célestine.'], { n: 6 });
  },
  cote(C, u) {
    C.degager(0.4); C.allee('palm', { pas: 5, d: 3 }); C.etangs(u(3), { rx: [3, 5], ry: [2, 3.2], rive: ['palm'], densite: 0.08 }); C.batiment('phare', 3, 3, 8, 'Un vieux phare. Sa lampe balaie la côte, la nuit venue.'); C.seme('barque', u(2), 3.5, 9, { ecart: 10 }); C.seme('parasol', u(2.4), 3.2, 8, { ecart: 6 }); C.seme('b_pin_parasol', u(5), 3.6, 10, { ecart: 4 }); C.passerelles(u(1), {});
  },
  verger(C, u) {
    C.degager(0.6); C.grille(u(9), ['b_pommier', 'b_oranger', 'b_pommier'], { nx: 4, ny: 3, px: 2, py: 2 }); C.grille(u(5), ['b_pommier', 'b_oranger'], { nx: 3, ny: 2, px: 2, py: 2 }); C.champs(u(3), { t: T.FLOWER, entre: T.GRASS }); C.seme('ruche', u(4), 3, 8, { ecart: 5 }); C.batiment('grange', 6, 5, 4, 'Une grange pleine de cageots de pommes.'); C.seme('gerbe', u(3), 3, 8); C.allee('b_peuplier', { pas: 8, d: 3.4 });
  },
  riziere(C, u) {
    C.degager(0.6); C.rizieres(u(9)); C.batiment('moulin', 4, 4, 6, 'Un moulin qui règle l\'eau des rizières.'); C.passerelles(u(1.2), { rive: ['roseaux_b'] }); C.seme('epouvantail', u(3), 2.8, 7, { ecart: 7 }); C.seme('lanterne_bois', u(3), 2.6, 4, { ecart: 9 }); C.seme('gerbe', u(2), 3, 8);
  },
  marais(C, u) {
    C.lampe = 'lanterne_bois'; C.passerelles(u(9), { dessus: ['nenuphar', 'nenuphar_f'], rive: ['roseaux_b'], larg: 5, long: [8, 16] }); C.etangs(u(7), { dessus: ['nenuphar', 'nenuphar_f'], rive: ['roseaux_b'], rx: [2.4, 4.8], ry: [1.8, 3.2], dmin: 2.6 }); C.seme('roseaux_b', u(8), 3, 8); C.seme('b_paletuvier', u(5), 3.4, 9, { ecart: 3 }); C.seme('barque', u(1), 3, 8); C.amas(u(2), ['champi_violet', 'champi_rouge']);
  },
  desert(C, u) {
    C.etangs(u(1.2), { rx: [3.4, 5], ry: [2.2, 3.2], rive: ['palm', 'palm', 'b_fougere'], densite: 0.3 }); C.arches('arche_os', u(1.1), 'Les côtes d\'un géant des sables. Le vent y siffle comme dans une flûte.'); C.seme('crane', u(2), 3, 9, { ecart: 9 }); C.seme(['cactus', 'cactus2'], u(9), 3, 10, { ecart: 3 }); C.seme('menhir2', u(2), 4, 10); C.pitons(u(1.6), { max: 3 }); C.seme('totem', u(0.8), 3, 6);
  },
  canyon(C, u) {
    C.pitons(u(5), { max: 4, rx: [2.2, 4.4] }); C.arches('arche_os', u(0.9), 'Des os plus vieux que le canyon lui-même.'); C.seme('crane', u(1.8), 3, 9, { ecart: 10 }); C.seme(['cactus', 'cactus2'], u(5), 3, 9, { ecart: 4 }); C.seme('totem', u(1.6), 2.8, 5, { ecart: 12 }); C.seme('cairn', u(2.4), 2.8, 6, { ecart: 7 });
  },
  roseraie(C, u) {
    C.voie('large'); C.degager(0.7); C.arches('arche_rose', u(4)); C.rangees(u(4), ['b_rosier', 'b_rosier', 'rosier_blanc'], { w: [5, 8], nb: [2, 3] }); C.allee(['b_rosier', 'rosier_blanc'], { pas: 4, d: 3.4 }); C.etangs(u(1.4), { dessus: ['nenuphar_f'] }); C.champs(u(3), { t: T.FLOWER, entre: T.FLOWER, pas: 1 }); C.batiment('kiosque', 4, 5, 3, 'Un kiosque couvert de roses. On y joue de la musique, les soirs d\'été.'); C.champs(u(1.6), { entre: T.GRASS });
  },
  hante(C, u) {
    C.voie('efface'); C.mares(u(2), { rive: ['b_mort', 'tombe'] }); C.grille(u(4), [['tombe', 'tombe2', 'tombe']], { nx: 4, ny: 3, px: 2, py: 2 }); C.allee('feu_follet', { pas: 8, d: 2.8 }); C.batiment('chapelle', 4, 7, 6, ['Une chapelle abandonnée. La porte est clouée.', 'Derrière, quelqu\'un fredonne… et s\'arrête dès que tu écoutes.']); C.amas(u(3), ['champi_violet']); C.seme('b_mort', u(6), 3, 9, { ecart: 3 }); C.etangs(u(1.2), { rive: ['b_mort'], densite: 0.1 }); C.arches('arche_os', u(0.5), 'Une arche d\'os. Elle n\'était pas là hier, jurerais-tu.');
  },
  vigne(C, u) {
    C.degager(0.5); C.rangees(u(8), 'vigne', { w: [6, 9], nb: [2, 4] }); C.allee('b_peuplier_or', { pas: 6, d: 3.2 }); C.seme('tonneau', u(4), 3, 7, { ecart: 5 }); C.seme('gerbe', u(2), 3, 8); C.batiment('grange', 6, 5, 4, 'Le chai du domaine. Ça sent le raisin et le chêne.'); C.seme('epouvantail', u(1.4), 3, 7);
  },
  orage(C, u) {
    C.seme('paratonnerre', u(7), 2.8, 7, { ecart: 6 }); C.cercle(['menhir_orage'], 'menhir_orage', ['La pierre bourdonne sous tes doigts.', 'Des éclairs y sont gravés, par centaines, comme un calendrier.'], { n: 7 }); C.seme('menhir_orage', u(6), 3, 8, { ecart: 4 }); C.pitons(u(2), { max: 2 }); C.etangs(u(2.5), { dmin: 2.4, rx: [1.8, 3], ry: [1.4, 2.2] }); C.allee('menhir_orage', { pas: 8, d: 2.6 }); C.mares(u(6), { rive: ['menhir_orage'] }); C.lisiere(['menhir_orage', 'paratonnerre', 'b_foudroye'], u(26));
  },
  bambou(C, u) {
    C.degager(0.6); C.arches('arche_bambou', u(7)); C.allee('b_bambou', { pas: 2, d: 2.7 }); C.etangs(u(3), { dessus: ['nenuphar_f', 'nenuphar'] }); C.seme('lanterne', u(6), 2.6, 4, { ecart: 5 }); C.seme('menhir2', u(3), 3, 8);
  },
  braises(C, u) {
    C.mares(u(8), { rive: ['brasero_r', 'b_braise'] }); C.etangs(u(8), { rx: [1.6, 2.8], ry: [1.2, 2], dmin: 2.2 }); C.allee('brasero_r', { pas: 6, d: 2.7 }); C.pitons(u(3), { max: 2 }); C.seme('menhir2', u(3), 3, 8); C.passerelles(u(1.6), { larg: 3, long: [5, 8] });
  },
  givre(C, u) {
    C.amas(u(5), ['cristal_glace'], { taille: [2, 4] }); C.etangs(u(2), {}); C.seme('cairn', u(3), 2.8, 6, { ecart: 6 }); C.arches('fanions', u(3)); C.mares(u(6), { rive: ['cristal_glace'] }); C.lisiere('cristal_glace', u(22)); C.allee('cristal_glace', { pas: 6, d: 2.6 });
  },
};

/** les cases auxquelles on ne touche pas : habitants, dresseurs (et leur regard), objets, portes, panneaux, rebords… et leurs abords */
export function reserver(W, routes, legends = []) {
  const reserve = new Set(), k = (x, y) => y * W.w + x;
  const garder = (x, y, r = 1) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) reserve.add(k(x + a, y + b)); };
  for (const n of W.npcs) {
    garder(n.x, n.y, n.move === 'wander' ? 3 : n.trainer ? 1 : 2);
    if (n.trainer) { const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[n.dir] || [0, 1]; for (let i = 1; i <= (n.trainer.sight ?? n.sight ?? 5) + 1; i++) reserve.add(k(n.x + dx * i, n.y + dy * i)); }
  }
  for (const q of W.items) garder(q.x, q.y, 1);
  for (const q of legends) if ((q.map || 'monde') === W.id) garder(q.x, q.y, 2);
  for (const M of [W.warps, W.signs, W.objects]) for (const s of M.keys()) { const [x, y] = s.split(',').map(Number); garder(x, y, M === W.warps ? 2 : 1); }
  for (const d of W.deco) if (d.x != null) garder(d.x, d.y, 1);
  for (const g of W.gates) for (const s of g.tiles) { const [x, y] = String(s).split(',').map(Number); garder(x, y, 2); }
  for (const b of W.buildings) for (let y = b.y - 1; y <= b.y + b.d + 1; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) reserve.add(k(x, y));
  // rebords, escaliers, arbres à couper, rochers : leurs abords restent tels quels
  for (let i = 0; i < W.t.length; i++) {
    const t = W.t[i]; if (![T.LEDGE, T.LEDGE_E, T.LEDGE_W, T.STAIRS, T.CUT, T.SMASH, T.BOULDER, T.CLIFF, T.DOOR, T.CAVEDOOR].includes(t)) continue;
    const x = i % W.w, y = (i - x) / W.w; garder(x, y, t === T.CLIFF ? 1 : 2);
    if (t === T.STAIRS) for (let b = 3; b <= 4; b++) for (let a = -1; a <= 1; a++) reserve.add(k(x + a, y + b));   // rien de haut juste devant des marches
  }
  // les bouts des routes (l'entrée des villes, les portes des grottes)
  for (const r of routes) if (r.pts?.length) for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) garder(Math.round(p[0]), Math.round(p[1]), 5);
  return reserve;
}

/** aménage toutes les routes ; renvoie ce qui a été posé, par route (tests) */
export function decorerRoutes(W, routes, { legends = [], trainerNpc = null, maps = null } = {}) {
  const portes = new Set(PRENOMS); for (const m of Object.values(maps || { W })) for (const n of m.npcs) if (n.trainer) portes.add(n.trainer.name);
  const noms = (g) => { const n = DEFIEURS[g].find((q) => !portes.has(q)); portes.add(n); return n; };
  const occ = new Set(); for (const L of [W.npcs, W.items]) for (const o of L) occ.add(o.y * W.w + o.x);
  const res = {}, reserve = reserver(W, routes, legends), pris = new Set(), etq = etiquettes(W);
  // les arbres d'ornement des anciens vergers prennent l'essence du biome
  for (const d of W.deco) { if ((d.k !== 'cerisier' && d.k !== 'erable') || !W.zoneAt(d.x, d.y)?.route) continue; const L = (BIOMES[W.biomes[d.y * W.w + d.x] & 31]?.arbres || []).filter(([q]) => q.startsWith('b_') || q === 'cerisier' || q === 'palm'); if (L.length) d.k = essence(L, hasardCase(d.x, d.y, 77)); }
  for (const route of routes) {
    const b = BIOME_ROUTE[route.id], plan = PLANS[b]; if (!plan || !route.pts?.length) continue;
    const C = new Chantier(W, route, reserve, pris, W.traces?.[route.id], occ, etq);
    if (trainerNpc) C.habiter({ trainerNpc, noms, enc: W.zones.find((z) => z.route === route.id && z.enc)?.enc || [] });
    plan(C, (n) => Math.max(1, Math.round(n * C.long / 100)));
    C.remplir();
    res[route.id] = { ...C.faits, lieux: C.lieux };
  }
  return res;
}
