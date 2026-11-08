// odyssee/js/world/ponts.js — les ponts et passerelles : dans quel sens on les traverse, et leur remise au propre.
// Le sens d'un pont se lit sur tout le pont (ses cases voisines, 4-connexes) et pas case par case : on le traverse
// dans l'axe où il relie la terre à ses deux bouts (rangées ou colonnes qui touchent la terre des deux côtés) ;
// à égalité, dans sa plus grande longueur ; un ponton (terre d'un seul côté) s'avance dans la mer. Les planches se
// posent en travers du sens de la traversée, les garde-corps le long, seulement sur les bords du pont (un pont de
// deux cases de large n'a pas de garde-corps au milieu).
// `redresserPonts` (fin de buildWorld) refait au propre les ponts posés par les générateurs : un pont droit, d'une ou
// deux cases de large, au lieu de bouts de planches en escalier ou de deux ponts collés côte à côte.
import { T, walkable } from './tiles.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ravin = (m, x, y) => !!(m.ravins && m.in(x, y) && m.ravins[y * m.w + x]);

/** les cases d'un pont (composante 4-connexe de T.BRIDGE, ravin ou non selon la case de départ) */
export function casesPont(m, x, y, max = 600) {
  if (m.get(x, y) !== T.BRIDGE) return [];
  const rv = ravin(m, x, y), vu = new Set([x + ',' + y]), out = [[x, y]];
  for (let i = 0; i < out.length && out.length < max; i++) {
    const [a, b] = out[i];
    for (const [dx, dy] of N4) {
      const u = a + dx, v = b + dy, k = u + ',' + v;
      if (vu.has(k) || m.get(u, v) !== T.BRIDGE || ravin(m, u, v) !== rv) continue;
      vu.add(k); out.push([u, v]);
    }
  }
  return out;
}

/** sens de la traversée d'un pont donné par ses cases : 'ew' (d'ouest en est) ou 'ns' (du nord au sud) */
export function sensDe(m, cases) {
  if (!cases.length) return 'ew';
  const S = new Set(cases.map(([x, y]) => x + ',' + y)), rv = ravin(m, cases[0][0], cases[0][1]);
  const terre = (x, y) => { if (S.has(x + ',' + y)) return false; const t = m.get(x, y); return walkable(t) && t !== T.BRIDGE && !(rv && t === T.CAVEWALL); };
  const eau = (x, y) => { const t = m.get(x, y); return t === T.WATER || t === T.WHIRL || (rv && t === T.CAVEWALL && ravin(m, x, y)); };
  const lignes = new Map(), cols = new Map();
  for (const [x, y] of cases) {
    const L = lignes.get(y) || [1e9, -1e9]; L[0] = Math.min(L[0], x); L[1] = Math.max(L[1], x); lignes.set(y, L);
    const C = cols.get(x) || [1e9, -1e9]; C[0] = Math.min(C[0], y); C[1] = Math.max(C[1], y); cols.set(x, C);
  }
  let ew = 0, ns = 0, ew1 = 0, ns1 = 0;
  for (const [y, [a, b]] of lignes) { const g = terre(a - 1, y), d = terre(b + 1, y); if (g && d) ew++; if (g || d) ew1++; }
  for (const [x, [a, b]] of cols) { const g = terre(x, a - 1), d = terre(x, b + 1); if (g && d) ns++; if (g || d) ns1++; }
  const wd = cols.size, ht = lignes.size;
  // un ponton long et étroit, ancré par un bout, qui passe au-dessus d'un petit bras d'eau près de la rive : il
  // s'avance dans l'eau (on le traverse dans sa longueur)
  if (ew && !ns && ht >= 4 && ht >= 2 * wd && 2 * ew < ht && ns1 === wd) return 'ns';
  if (ns && !ew && wd >= 4 && wd >= 2 * ht && 2 * ns < wd && ew1 === ht) return 'ew';
  if (ew !== ns) return ew > ns ? 'ew' : 'ns';
  // un ponton : la terre d'un seul côté, il s'avance dans l'eau
  if (wd !== ht) return wd > ht ? 'ew' : 'ns';
  if (ew1 !== ns1) return ew1 > ns1 ? 'ew' : 'ns';
  const [x, y] = cases[0];
  return eau(x - 1, y) || eau(x + 1, y) ? 'ns' : 'ew';
}

/** sens de la traversée du pont qui passe par (x, y) */
export function sensPont(m, x, y) { return sensDe(m, casesPont(m, x, y)); }

/** toutes les composantes de ponts d'une carte : [{ cases, sens, x0, y0, x1, y1, ravin }] */
export function ponts(m) {
  const vu = new Uint8Array(m.w * m.h), out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (vu[y * m.w + x] || m.t[y * m.w + x] !== T.BRIDGE) continue;
    const cases = casesPont(m, x, y, 1e6); for (const [a, b] of cases) vu[b * m.w + a] = 1;
    const xs = cases.map((c) => c[0]), ys = cases.map((c) => c[1]);
    out.push({ cases, sens: sensDe(m, cases), x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), ravin: ravin(m, x, y) });
  }
  return out;
}

/**
 * Remet au propre les ponts au-dessus de l'eau posés par les générateurs (routes, lieux, rivières des villes) : un pont
 * en escalier (sentier qui franchit l'eau en biais), trop large (plus de deux cases) ou collé à un autre pont (deux
 * passages côte à côte) devient un seul pont droit, d'une case de large (s'il n'y avait qu'un passage d'une case) ou de
 * deux, posé là où l'eau est la plus étroite près de l'ancien, entre les deux mêmes rives. Un quai de planches posé le
 * long de l'eau, qui ne relie rien qu'on ne rejoigne déjà à pied, redevient de l'eau. On ne touche pas aux passerelles
 * des ravins, ni aux pontons propres (quais, embarcadères), ni à ce qui porte un PNJ, un objet, une porte ou un panneau ;
 * et chaque changement est vérifié (les rives restent reliées), sinon le pont reste tel quel.
 * Renvoie { refaits, retires, gardes }.
 */
export function redresserPonts(W) {
  const k = (x, y) => y * W.w + x;
  const occ = new Set();
  for (const n of W.npcs) occ.add(k(n.x, n.y));
  for (const it of W.items) occ.add(k(it.x, it.y));
  for (const key of [...W.warps.keys(), ...W.signs.keys(), ...W.objects.keys()]) { const [x, y] = key.split(',').map(Number); occ.add(k(x, y)); }
  for (const g of W.gates) for (const [x, y] of g.tiles) occ.add(k(x, y));
  for (const d of W.deco) if (d.x != null) occ.add(k(d.x, d.y));
  const P = ponts(W).filter((p) => !p.ravin && p.cases.length < 2000);
  // groupes : ponts à deux cases ou moins l'un de l'autre
  const parent = P.map((_, i) => i), f = (i) => (parent[i] === i ? i : (parent[i] = f(parent[i])));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (a.x0 <= b.x1 + 3 && b.x0 <= a.x1 + 3 && a.y0 <= b.y1 + 3 && b.y0 <= a.y1 + 3) parent[f(i)] = f(j);
  }
  const groupes = new Map(); P.forEach((p, i) => { const r = f(i); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(p); });
  const bilan = { refaits: 0, retires: 0, gardes: 0, journal: [] };
  for (const G of groupes.values()) {
    const propre = (p) => p.cases.length === (p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1) && (p.sens === 'ew' ? p.y1 - p.y0 : p.x1 - p.x0) <= 1;
    if (G.length === 1 && propre(G[0])) continue;
    const cases = G.flatMap((p) => p.cases);
    const bx = [Math.min(...G.map((p) => p.x0)), Math.min(...G.map((p) => p.y0)), Math.max(...G.map((p) => p.x1)), Math.max(...G.map((p) => p.y1))];
    if (cases.some(([x, y]) => occ.has(k(x, y)))) { bilan.gardes++; bilan.journal.push([...bx, 'occupé']); continue; }
    const res = refaire(W, G, cases, occ);
    bilan.journal.push([...bx, res === 'retire' ? 'retiré' : res ? 'refait' : 'gardé']);
    if (res === 'retire') bilan.retires++; else if (res) bilan.refaits++; else bilan.gardes++;
  }
  return bilan;
}

/** un groupe de ponts : rives (terre de part et d'autre, reliée sans ces ponts dans une fenêtre autour), puis le
 *  meilleur pont droit entre les deux rives */
function refaire(W, G, cases, occ) {
  const S = new Set(cases.map(([x, y]) => y * W.w + x));
  let X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
  for (const [x, y] of cases) { X0 = Math.min(X0, x); Y0 = Math.min(Y0, y); X1 = Math.max(X1, x); Y1 = Math.max(Y1, y); }
  const M = 24, wx0 = Math.max(0, X0 - M), wy0 = Math.max(0, Y0 - M), wx1 = Math.min(W.w - 1, X1 + M), wy1 = Math.min(W.h - 1, Y1 + M);
  const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1, dans = (x, y) => x >= wx0 && y >= wy0 && x <= wx1 && y <= wy1;
  const sol = (x, y, pont) => { const t = W.get(x, y); return t === T.BRIDGE ? pont.has(y * W.w + x) || !S.has(y * W.w + x) : walkable(t); };
  /** composantes de terre de la fenêtre ; pont : cases de pont du groupe qu'on garde */
  const etiquettes = (pont) => {
    const lab = new Int32Array(ww * wh).fill(-1); let n = 0;
    for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
      const i = (y - wy0) * ww + (x - wx0); if (lab[i] >= 0 || !sol(x, y, pont)) continue;
      lab[i] = n; const q = [x, y];
      while (q.length) {
        const b = q.pop(), a = q.pop();
        for (const [dx, dy] of N4) {
          const u = a + dx, v = b + dy; if (!dans(u, v)) continue;
          const j = (v - wy0) * ww + (u - wx0); if (lab[j] >= 0 || !sol(u, v, pont) || !W.canStep(a, b, u, v)) continue;
          lab[j] = n; q.push(u, v);
        }
      }
      n++;
    }
    return (x, y) => (dans(x, y) ? lab[(y - wy0) * ww + (x - wx0)] : -1);
  };
  const sans = etiquettes(new Set());
  // les rives : la terre qui touche le groupe
  const rives = new Map();
  for (const [x, y] of cases) for (const [dx, dy] of N4) {
    const u = x + dx, v = y + dy; if (S.has(v * W.w + u)) continue;
    const l = sans(u, v); if (l >= 0) rives.set(l, (rives.get(l) || 0) + 1);
  }
  if (rives.size === 0) return false;
  const vider = () => { for (const [x, y] of cases) W.set(x, y, T.WATER); };
  // une traversée : une rangée (ou colonne) du groupe qui touche la terre à ses deux bouts
  const traverse = G.some((p) => { const S1 = new Set(p.cases.map(([x, y]) => x + ',' + y)), terre = (x, y) => !S1.has(x + ',' + y) && sans(x, y) >= 0;
    return p.cases.some(([x, y]) => (!S1.has((x - 1) + ',' + y) && terre(x - 1, y) && (() => { let a = x; while (S1.has(a + ',' + y)) a++; return terre(a, y); })())
      || (!S1.has(x + ',' + (y - 1)) && terre(x, y - 1) && (() => { let b = y; while (S1.has(x + ',' + b)) b++; return terre(x, b); })())); });
  if (rives.size === 1 && !traverse) { vider(); return 'retire'; }   // un quai le long de l'eau : on rejoint déjà tout à pied
  if (rives.size > 2) return false;
  const [A, B = A] = [...rives.keys()];
  // largeur : une case si chaque pont du groupe n'en faisait qu'une et qu'il n'y en avait qu'un, sinon deux
  const larg = G.length === 1 && Math.min(G[0].x1 - G[0].x0, G[0].y1 - G[0].y0) === 0 ? 1 : 2;
  const pontable = (x, y) => { const i = y * W.w + x; return (W.get(x, y) === T.WATER || S.has(i)) && !occ.has(i); };
  // centre des anciennes cases (on reste au plus près des chemins qui y mènent)
  const cx = cases.reduce((s, c) => s + c[0], 0) / cases.length, cy = cases.reduce((s, c) => s + c[1], 0) / cases.length;
  let best = null;
  for (const axe of ['ew', 'ns']) {
    const L = axe === 'ew' ? [X0, X1] : [Y0, Y1], Pp = axe === 'ew' ? [Y0, Y1] : [X0, X1], c0 = axe === 'ew' ? cy : cx;
    const xy = (a, p) => (axe === 'ew' ? [a, p] : [p, a]);
    // une voie : la plus courte traversée d'eau entre la rive A et la rive B, sur la ligne p
    const voie = (p) => {
      let mieux = null;
      for (let a = L[0] - 4; a <= L[1] + 4; a++) {
        const [sx, sy] = xy(a, p); const ls = sans(sx, sy); if (ls !== A && ls !== B) continue;
        let b = a + 1; while (b <= L[1] + 5 && pontable(...xy(b, p))) b++;
        if (b === a + 1) continue;
        const [ex, ey] = xy(b, p), le = sans(ex, ey);
        if (le < 0 || (le === ls && A !== B) || (le !== A && le !== B)) continue;
        if (W.height(sx, sy) !== W.height(ex, ey)) continue;
        if (!mieux || b - a < mieux.b - mieux.a) mieux = { a, b, de: ls, h: W.height(sx, sy) };
      }
      return mieux;
    };
    // deux voies si le passage en avait deux, alignées (sinon une seule, un peu pénalisée)
    for (const lg of larg === 2 ? [2, 1] : [1]) for (let p = Pp[0] - 2; p + lg - 1 <= Pp[1] + 2; p++) {
      const V = []; for (let l = 0; l < lg; l++) V.push(voie(p + l));
      if (V.some((v) => !v) || V.some((v) => v.de !== V[0].de || v.h !== V[0].h)) continue;
      const long = V.reduce((s, v) => s + v.b - v.a - 1, 0) / lg, decal = Math.abs(p + (lg - 1) / 2 - c0);
      // le pont prolonge les rues et les chemins qui arrivent au bord de l'eau
      const rue = (x, y) => { const t = W.get(x, y); return t === T.PATH || t === T.PAVE || t === T.STAIRS; };
      let bouts = 0; V.forEach((v, l) => { if (rue(...xy(v.a, p + l))) bouts++; if (rue(...xy(v.b, p + l))) bouts++; });
      const score = long + decal + (Math.abs(V[0].a - V[lg - 1].a) + Math.abs(V[0].b - V[lg - 1].b)) * 3 + (lg < larg ? 4 : 0) - 4 * bouts / lg;
      if (!best || score < best.score) best = { score, axe, p, V, xy };
    }
  }
  if (!best) return false;
  const neuf = new Set(), hauteur = best.V[0].h;
  best.V.forEach((v, l) => { for (let a = v.a + 1; a < v.b; a++) { const [x, y] = best.xy(a, best.p + l); neuf.add(y * W.w + x); } });
  // deux voies décalées d'une case (rive en biais) : le tablier de la plus courte se prolonge sur la berge, le pont
  // reste un rectangle
  if (best.V.length === 2) {
    const a0 = Math.min(...best.V.map((v) => v.a)) + 1, b0 = Math.max(...best.V.map((v) => v.b)) - 1;
    const berge = (x, y) => [T.GRASS, T.PATH, T.SAND, T.FLOWER, T.TALL].includes(W.get(x, y)) && !occ.has(y * W.w + x) && W.height(x, y) === hauteur;
    const plus = [];
    for (let l = 0; l < 2; l++) for (let a = a0; a <= b0; a++) { const [x, y] = best.xy(a, best.p + l), i = y * W.w + x; if (!neuf.has(i)) { if (berge(x, y)) plus.push(i); else { plus.length = 0; l = 2; break; } } }
    for (const i of plus) neuf.add(i);
  }
  // on pose, puis on vérifie que les deux rives restent reliées ; sinon on remet tout
  const avant = cases.map(([x, y]) => [x, y, W.get(x, y), W.height(x, y)]), avantN = [...neuf].map((i) => [i % W.w, Math.floor(i / W.w), W.get(i % W.w, Math.floor(i / W.w)), W.hg[i]]);
  vider();
  for (const i of neuf) { const x = i % W.w, y = (i - x) / W.w; W.set(x, y, T.BRIDGE); W.setHeight(x, y, hauteur); }
  const apres = etiquettes(neuf);
  let ok = true;
  const ra = [], rb = [];
  for (const [x, y] of cases) for (const [dx, dy] of N4) { const u = x + dx, v = y + dy; const l = sans(u, v); if (l === A) ra.push(apres(u, v)); if (l === B) rb.push(apres(u, v)); }
  if (!ra.length || !rb.length || ra.some((l) => l !== ra[0]) || rb.some((l) => l !== ra[0])) ok = false;
  if (!ok) {
    for (const [x, y, t, h] of avantN) { W.set(x, y, t); W.setHeight(x, y, h); }
    for (const [x, y, t, h] of avant) { W.set(x, y, t); W.setHeight(x, y, h); }
    return false;
  }
  return true;
}
