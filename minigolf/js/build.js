/* =============================================================================
   Golf Party — constructeur de trous (pur, sans Three.js)
   -----------------------------------------------------------------------------
   Un trou est décrit par une « tortue » qui dessine l'allée (virages, pentes, dévers, loopings, sauts)
   et par des primitives posées autour (blocs, plots, tremplins, plateaux, cuvettes, obstacles mobiles,
   eau, téléporteurs…). Le constructeur produit des groupes de triangles par matériau : les mêmes
   triangles servent au rendu et aux collisions, ce qu'on voit est exactement ce qui touche la balle.
   Convention : yaw = 0 regarde vers +z ; tourner de +deg = tourner à gauche ; lat > 0 = à gauche.
   ============================================================================= */
import { StaticMesh, World, BALL_R, CUP_R, settle } from './physics.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const D2R = Math.PI / 180;
export const V = { add, sub, mul, dot, cross, norm };

const EASE = {
  s: [(t) => (1 - Math.cos(Math.PI * t)) / 2, (t) => Math.PI / 2 * Math.sin(Math.PI * t)],
  lin: [(t) => t, () => 1],
  in: [(t) => 1 - Math.cos(Math.PI * t / 2), (t) => Math.PI / 2 * Math.sin(Math.PI * t / 2)],
  out: [(t) => Math.sin(Math.PI * t / 2), (t) => Math.PI / 2 * Math.cos(Math.PI * t / 2)],
};

/* ---------------------------------------------------------------- tortue */
class Path {
  constructor(B, o) {
    this.B = B;
    const st = o.wp ? o.wp.slice() : B.L(o.x || 0, o.y || 0, o.z || 0);
    this.P = st; this.yaw = o.wyaw ?? (B.yaw + (o.yaw || 0) * D2R); this.bank = 0;
    this.w = o.w ?? 2.2; this.floor = o.floor || B.theme.floor; this.wallM = o.wall || B.theme.wall;
    this.wh = o.wh ?? 0.3; this.wt = o.wt ?? 0.2; this.wl = o.walls !== false; this.wr = o.walls !== false;
    this.roofOn = false; this.roofMat = null; this.noFloor = false; this.base = o.base ?? B.defaultBase ?? 'ground'; this.prm = null; this.s = 0;
    this.trim = o.trim ?? B.theme.trim ?? null;
    this.step = o.step || 0.2;   // pas des lignes droites plates (les très longs trous en prennent un plus grand : même forme, moins de triangles)
    this.pieces = []; this.frames = []; this.main = o.main !== false;
    this.newPiece();
    this.pushFrame(this.P, this.slopeless(), 0);
    B.paths.push(this);
  }
  slopeless() { return [Math.sin(this.yaw), 0, Math.cos(this.yaw)]; }
  newPiece() { this.piece = { frames: [], capS: false, capE: false, base: this.base }; this.pieces.push(this.piece); }
  pushFrame(p, f, bank, uOverride) {
    f = norm(f);
    let u;
    if (uOverride) { u = norm(sub(uOverride, mul(f, dot(uOverride, f)))); }
    else {
      const ub = norm(sub([0, 1, 0], mul(f, f[1])));
      const lb = norm(cross(ub, f));
      u = norm(add(mul(ub, Math.cos(bank)), mul(lb, Math.sin(bank))));
    }
    const l = norm(cross(u, f));
    const fr = { p: p.slice(), f, u, l, w: this.w, wl: this.wl, wr: this.wr, wh: this.wh, wt: this.wt, s: this.s,
      floor: this.floor, wall: this.wallM, roof: this.roofOn, roofMat: this.roofMat, nofloor: this.noFloor, prm: this.prm, base: this.piece.base, trim: this.trim };
    this.piece.frames.push(fr); this.frames.push(fr);
    return fr;
  }
  get last() { return this.frames[this.frames.length - 1]; }

  /** Segment générique : longueur horizontale len, virage turn (deg, + = gauche), dénivelé dh, dévers bank (deg), largeur w */
  seg(o) {
    const len = Math.max(0.05, o.len), tr = (o.turn || 0) * D2R, dh = o.dh || 0, [E, dE] = EASE[o.ease || 's'];
    const yaw0 = this.yaw, y0 = this.P[1], b0 = this.bank, b1 = o.bank != null ? o.bank * D2R : b0, w0 = this.w, w1 = o.w ?? w0;
    const flat = !tr && !dh && Math.abs(b1 - b0) < 1e-6 && Math.abs(w1 - w0) < 1e-6 && !this.prmMode;
    const N = Math.max(2, Math.ceil(len / (flat ? this.step : 0.2) + Math.abs(tr) / (5 * D2R)));
    let x = this.P[0], z = this.P[2];
    for (let k = 1; k <= N; k++) {
      const t = k / N, ym = yaw0 + tr * (k - 0.5) / N;
      x += Math.sin(ym) * len / N; z += Math.cos(ym) * len / N;
      const yaw = yaw0 + tr * t, y = y0 + dh * E(t), slope = dh * dE(t) / len;
      this.bank = lerp(b0, b1, smooth(t)); this.w = lerp(w0, w1, smooth(t)); this.s += Math.hypot(len / N, dh * (E(t) - E((k - 1) / N)));
      this.yaw = yaw;
      this.P = [x, y, z];
      if (this.prmMode === 'fwd') this.prm = mul(norm([Math.sin(yaw), slope, Math.cos(yaw)]), this.flowSign || 1);
      this.pushFrame(this.P, [Math.sin(yaw), slope, Math.cos(yaw)], this.bank);
    }
    this.yaw = yaw0 + tr; this.bank = b1; this.w = w1;
    return this;
  }
  straight(len, o = {}) { return this.seg({ ...o, len }); }
  turn(deg, radius, o = {}) { return this.seg({ ...o, len: Math.abs(deg) * D2R * radius, turn: deg }); }
  slope(len, dh, o = {}) { return this.seg({ ...o, len, dh }); }
  /** Looping vertical de rayon R, décalé latéralement de shift vers la droite pour ne pas se croiser */
  loop(R = 1.6, shift) {
    shift = shift ?? (this.w + this.wt * 2 + 0.25);
    const P0 = this.P.slice(), yaw = this.yaw, F = [Math.sin(yaw), 0, Math.cos(yaw)], U = [0, 1, 0], L = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const N = Math.ceil(2 * Math.PI * R / 0.14);
    const wasBase = this.piece.base; this.piece.base = 'slab';
    for (let k = 1; k <= N; k++) {
      const q = k / N, th = 2 * Math.PI * q, lat = -shift * (1 - Math.cos(Math.PI * q)) / 2, dlat = -shift * Math.PI / 2 * Math.sin(Math.PI * q) / (2 * Math.PI);
      const pos = add(add(P0, mul(F, R * Math.sin(th))), add(mul(U, R * (1 - Math.cos(th))), mul(L, lat)));
      const f = add(add(mul(F, R * Math.cos(th)), mul(U, R * Math.sin(th))), mul(L, dlat));
      const c = add(add(P0, mul(U, R)), mul(L, lat));
      this.s += 2 * Math.PI * R / N;
      this.pushFrame(pos, f, 0, sub(c, pos));
    }
    this.piece.base = wasBase;
    this.P = add(P0, mul(L, -shift));
    // repère final remis à plat (même cap)
    this.last.u = [0, 1, 0]; this.last.f = F; this.last.l = L;
    return this;
  }
  /** Trou dans l'allée : la balle doit sauter. dh = différence de hauteur à l'arrivée */
  gap(len, dh = 0) {
    const F = this.slopeless();
    this.P = add(this.P, add(mul(F, len), [0, dh, 0])); this.s += len;
    this.newPiece(); this.pushFrame(this.P, F, this.bank);
    return this;
  }
  walls(l, r = l) { this.wl = l; this.wr = r; this.last.wl = this.last.wl && l; this.last.wr = this.last.wr && r; return this; }
  wallH(h) { this.wh = h; return this; }
  mat(floor, wall) { if (floor) this.floor = floor; if (wall) this.wallM = wall; return this; }
  roof(on, mat) { this.roofOn = on; this.roofMat = mat || null; if (!on) { this.last.roof = this.last.roof; } return this; }
  /** Pas de sol sur la suite (vide sous un plafond aimanté, par exemple) */
  floorOff(on) { this.noFloor = on; return this; }
  boostOn(on) { this.flowSign = 1; this.prmMode = on ? 'fwd' : null; if (!on) this.prm = null; else this.prm = norm(this.last.f); return this; }
  /** Sens du tapis roulant / accélérateur : +1 vers l'avant, -1 vers l'arrière, 0 coupé */
  flow(sign) { if (!sign) { this.prmMode = null; this.prm = null; return this; } this.prmMode = 'fwd'; this.flowSign = sign; this.prm = mul(norm(this.last.f), sign); return this; }
  base_(b) { this.piece.base = b; this.base = b; return this; }
  capStart() { this.pieces[0].capS = true; return this; }
  capEnd() { this.piece.capE = true; return this; }
  /** Point monde relatif au repère courant (fwd devant, lat à gauche, up au-dessus du sol) */
  here(fwd = 0, lat = 0, up = 0) { const f = this.last; return add(add(f.p, mul(norm([f.f[0], 0, f.f[2]]), fwd)), add(mul(f.l, lat), mul(f.u, up))); }
  dir() { return this.yaw; }
  /** Repère à l'abscisse curviligne s */
  frameAt(s) {
    const fr = this.frames; if (s <= fr[0].s) return fr[0];
    for (let i = 1; i < fr.length; i++) if (fr[i].s >= s) {
      const a = fr[i - 1], b = fr[i], t = (s - a.s) / ((b.s - a.s) || 1);
      return { ...b, p: add(a.p, mul(sub(b.p, a.p), t)) };
    }
    return fr[fr.length - 1];
  }
  at(s, lat = 0, up = 0) { const f = this.frameAt(s); return add(add(f.p, mul(f.l, lat)), mul(f.u, up)); }
}

/* ---------------------------------------------------------------- constructeur */
export class HoleBuilder {
  constructor(o) {
    this.ox = o.at?.[0] || 0; this.oz = o.at?.[1] || 0; this.oy = o.at?.[3] || 0; this.yaw = (o.at?.[2] || 0) * D2R;
    this.theme = o.theme; this.groundY = o.groundY ?? 0; this.groundType = o.groundType || 'grass'; this.defaultBase = o.base || null;
    this.groups = new Map(); this.kins = []; this.zones = []; this.decor = []; this.lights = []; this.paths = [];
    this.teeP = null; this.cupP = null; this.foot = []; this.piles = [];   // empreinte au sol (pour placer le décor autour)
    this.cam = null;
  }
  /** local → monde */
  L(x, y, z) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return [this.ox + x * c + z * s, this.oy + y, this.oz - x * s + z * c]; }
  Y(deg) { return this.yaw + deg * D2R; }
  path(o = {}) { return new Path(this, o); }

  group(mat, phys = true, render = true) {
    const k = mat + '|' + (phys ? 1 : 0) + (render ? 1 : 0);
    let g = this.groups.get(k);
    if (!g) { g = { mat, phys, render, pos: [], nrm: [], uv: [], ao: [], prm: [] }; this.groups.set(k, g); }
    return g;
  }
  /** Triangle : sommets {p, n?, uv?, ao?} ; l'ordre est corrigé pour que la face regarde vers ref */
  tri(mat, A, B, C, o = {}) {
    const g = this.group(mat, o.phys !== false, o.render !== false);
    const gn = cross(sub(B.p, A.p), sub(C.p, A.p));
    if (Math.hypot(gn[0], gn[1], gn[2]) < 1e-10) return;
    const ref = o.ref || A.n;
    if (ref && dot(gn, ref) < 0) { const t = B; B = C; C = t; }
    const fn = norm(cross(sub(B.p, A.p), sub(C.p, A.p)));
    for (const P of [A, B, C]) {
      g.pos.push(P.p[0], P.p[1], P.p[2]);
      const n = o.flat || !P.n ? fn : P.n; g.nrm.push(n[0], n[1], n[2]);
      g.uv.push(P.uv ? P.uv[0] : 0, P.uv ? P.uv[1] : 0); g.ao.push(P.ao ?? 1);
    }
    const pr = o.prm || [0, 0, 0]; g.prm.push(pr[0], pr[1], pr[2]);
  }
  quad(mat, A, B, C, D, o) { this.tri(mat, A, B, C, o); this.tri(mat, A, C, D, o); }
  footprint(p, r = 1) { this.foot.push([p[0], p[2], r]); }

  tee(p) { this.teeP = p.slice(); }
  cup(p) { this.cupP = p.slice(); }

  /* ---- primitives ---- */
  /** Bloc orienté (yaw monde), centre c, tailles s = [largeur x, hauteur y, profondeur z] */
  box(c, s, o = {}) {
    const yaw = o.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw), mat = o.mat || this.theme.wall;
    const P = (x, y, z) => [c[0] + x * cs + z * sn, c[1] + y, c[2] - x * sn + z * cs];
    const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, sc = o.uvs || 1;
    const faces = [
      [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]], s[2], s[1]],
      [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]], s[2], s[1]],
      [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]], s[0], s[2]],
      [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]], s[0], s[2]],
      [[0, 0, 1], [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]], s[0], s[1]],
      [[0, 0, -1], [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]], s[0], s[1]],
    ];
    for (const [n0, q, uw, vh] of faces) {
      if (o.noBottom && n0[1] < 0) continue;
      const n = [n0[0] * cs + n0[2] * sn, n0[1], -n0[0] * sn + n0[2] * cs];
      const uvs = [[0, 0], [0, vh * sc], [uw * sc, vh * sc], [uw * sc, 0]];
      const v = q.map((pp, i) => ({ p: P(...pp), n, uv: uvs[i], ao: pp[1] < 0 ? 0.8 : 1 }));
      this.quad(mat, v[0], v[1], v[2], v[3], { ref: n, phys: o.phys, render: o.render });
    }
    this.footprint(c, Math.hypot(s[0], s[2]) / 2);
  }
  /** Cylindre vertical (plots, tonneaux, piliers), c = centre de la base */
  cyl(c, r, h, o = {}) {
    const n = o.seg || 18, mat = o.mat || this.theme.wall;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const d0 = [Math.sin(a0), 0, Math.cos(a0)], d1 = [Math.sin(a1), 0, Math.cos(a1)];
      const b0 = add(c, mul(d0, r)), b1 = add(c, mul(d1, r)), t0 = add(b0, [0, h, 0]), t1 = add(b1, [0, h, 0]);
      this.quad(mat, { p: b0, n: d0, uv: [i / n * 2, 0], ao: 0.8 }, { p: b1, n: d1, uv: [(i + 1) / n * 2, 0], ao: 0.8 }, { p: t1, n: d1, uv: [(i + 1) / n * 2, h] }, { p: t0, n: d0, uv: [i / n * 2, h] }, { ref: d0, phys: o.phys, render: o.render });
      const top = add(c, [0, h, 0]);
      if (!o.noTop) this.tri(o.topMat || mat, { p: top, n: [0, 1, 0], uv: [0.5, 0.5] }, { p: t0, n: [0, 1, 0], uv: [0.5 + d0[0] / 2, 0.5 + d0[2] / 2] }, { p: t1, n: [0, 1, 0], uv: [0.5 + d1[0] / 2, 0.5 + d1[2] / 2] }, { ref: [0, 1, 0], phys: o.phys, render: o.render });
    }
    this.footprint(c, r);
  }
  /** Tremplin / rampe en coin : base au sol en c, monte de 0 à h sur la longueur len dans la direction yaw */
  wedge(c, w, h, len, yaw, o = {}) {
    const mat = o.mat || this.theme.floor, sideMat = o.side || this.theme.skirt || 'skirt';
    const F = [Math.sin(yaw), 0, Math.cos(yaw)], Lv = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const a = add(c, mul(Lv, w / 2)), b = add(c, mul(Lv, -w / 2));
    const a2 = add(add(a, mul(F, len)), [0, h, 0]), b2 = add(add(b, mul(F, len)), [0, h, 0]);
    const a3 = add(a, mul(F, len)), b3 = add(b, mul(F, len));
    const n = norm(cross(sub(a2, a), Lv)); const nn = n[1] < 0 ? mul(n, -1) : n;
    this.quad(mat, { p: a, n: nn, uv: [0, 0] }, { p: a2, n: nn, uv: [0, len] }, { p: b2, n: nn, uv: [w, len] }, { p: b, n: nn, uv: [w, 0] }, { ref: nn, prm: o.prm, phys: o.phys });
    this.quad(sideMat, { p: a3, uv: [0, 0] }, { p: a2, uv: [0, h] }, { p: b2, uv: [w, h] }, { p: b3, uv: [w, 0] }, { ref: F, flat: true, phys: o.phys });
    this.tri(sideMat, { p: a, uv: [0, 0] }, { p: a3, uv: [len, 0] }, { p: a2, uv: [len, h] }, { ref: Lv, flat: true, phys: o.phys });
    this.tri(sideMat, { p: b, uv: [0, 0] }, { p: b3, uv: [len, 0] }, { p: b2, uv: [len, h] }, { ref: mul(Lv, -1), flat: true, phys: o.phys });
  }
  /** Plateau plat polygonal (sens quelconque) à la hauteur y, murets sur les arêtes choisies */
  pad(pts, y, o = {}) {
    const floor = o.floor || this.theme.floor, wall = o.wall || this.theme.wall, wh = o.wh ?? 0.3, wt = o.wt ?? 0.2;
    // orientation : sens anti-horaire vu du dessus (x, z)
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    let P = area < 0 ? pts.slice() : pts.slice().reverse();
    let walls = o.walls ?? true;
    if (Array.isArray(walls) && area >= 0) { const n = walls.length; walls = walls.map((_, i) => o.walls[(n - 2 - i + n) % n]); }
    const wallOn = (i) => (Array.isArray(walls) ? !!walls[i] : !!walls);
    // triangulation par oreilles
    const idx = P.map((_, i) => i), tris = [];
    const isConvex = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 0;
    const inside = (p, a, b, c) => {
      const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
      const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    let guard = 0;
    while (idx.length > 3 && guard++ < 2000) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = P[ia], b = P[ib], c = P[ic];
        if (!isConvex(a, b, c)) continue;
        if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(P[j], a, b, c))) continue;
        tris.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) tris.push(idx.slice());
    const up = [0, 1, 0], uvS = 0.5;
    for (const [a, b, c] of tris) {
      const V3 = (i) => ({ p: [P[i][0], y, P[i][1]], n: up, uv: [P[i][0] * uvS, P[i][1] * uvS], ao: 1 });
      this.tri(floor, V3(a), V3(b), V3(c), { ref: up, prm: o.prm });
    }
    // murets et jupes
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const A = [a[0], y, a[1]], Bp = [b[0], y, b[1]];
      const e = norm(sub(Bp, A)), outN = [-e[2], 0, e[0]];   // extérieur (polygone horaire en x,z)
      const len = Math.hypot(Bp[0] - A[0], Bp[2] - A[2]);
      if (wallOn(i)) this.wallStrip(wall, A, Bp, outN, wh, wt, len);
      const ob = wallOn(i) ? wt : 0;
      const baseY = o.base === 'slab' ? y - 0.35 : (typeof o.base === 'number' ? o.base : this.groundY);
      if (baseY < y - 0.01) {
        const A2 = add(A, mul(outN, ob)), B2 = add(Bp, mul(outN, ob));
        this.quad(this.theme.skirt || 'skirt', { p: [A2[0], baseY, A2[2]], n: outN, uv: [0, 0] }, { p: [B2[0], baseY, B2[2]], n: outN, uv: [len, 0] }, { p: B2, n: outN, uv: [len, y - baseY] }, { p: A2, n: outN, uv: [0, y - baseY] }, { ref: outN, phys: false });
      }
      this.footprint(A, 1);
    }
    if (o.base === 'slab') for (const [a, b, c] of tris) {
      const V3 = (i) => ({ p: [P[i][0], y - 0.35, P[i][1]], n: [0, -1, 0], uv: [0, 0] });
      this.tri(this.theme.skirt || 'skirt', V3(a), V3(b), V3(c), { ref: [0, -1, 0], phys: false });
    }
    let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; }
    this.footprint([cx / P.length, y, cz / P.length], 2);
  }
  /** Muret droit de A à B (au sol), outN = côté extérieur */
  wallStrip(mat, A, Bp, outN, wh, wt, len, o = {}) {
    const up = [0, 1, 0], inN = mul(outN, -1), e = norm(sub(Bp, A));
    const At = add(A, [0, wh, 0]), Bt = add(Bp, [0, wh, 0]), Ao = add(A, mul(outN, wt)), Bo = add(Bp, mul(outN, wt)), Aot = add(Ao, [0, wh, 0]), Bot = add(Bo, [0, wh, 0]);
    this.quad(mat, { p: A, n: inN, uv: [0, 0], ao: 0.85 }, { p: Bp, n: inN, uv: [len, 0], ao: 0.85 }, { p: Bt, n: inN, uv: [len, wh] }, { p: At, n: inN, uv: [0, wh] }, { ref: inN });
    this.quad(mat, { p: At, n: up, uv: [0, 0] }, { p: Bt, n: up, uv: [len, 0] }, { p: Bot, n: up, uv: [len, wt] }, { p: Aot, n: up, uv: [0, wt] }, { ref: up });
    this.quad(mat, { p: Ao, n: outN, uv: [0, 0] }, { p: Bo, n: outN, uv: [len, 0] }, { p: Bot, n: outN, uv: [len, wh] }, { p: Aot, n: outN, uv: [0, wh] }, { ref: outN });
    // bouts
    this.quad(mat, { p: A, uv: [0, 0] }, { p: At, uv: [0, wh] }, { p: Aot, uv: [wt, wh] }, { p: Ao, uv: [wt, 0] }, { ref: mul(e, -1), flat: true });
    this.quad(mat, { p: Bp, uv: [0, 0] }, { p: Bt, uv: [0, wh] }, { p: Bot, uv: [wt, wh] }, { p: Bo, uv: [wt, 0] }, { ref: e, flat: true });
  }
  /** Muret le long d'une polyligne [[x,z]...] posée à la hauteur y */
  wallLine(pts, y, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const A = [pts[i][0], y, pts[i][1]], Bp = [pts[i + 1][0], y, pts[i + 1][1]], e = norm(sub(Bp, A));
      let outN = o.flip ? [-e[2], 0, e[0]] : [e[2], 0, -e[0]];
      if (o.center) { const m = [(A[0] + Bp[0]) / 2 - o.center[0], 0, (A[2] + Bp[2]) / 2 - o.center[2]]; if (dot(m, outN) < 0) outN = mul(outN, -1); }
      this.wallStrip(o.mat || this.theme.wall, A, Bp, outN, o.wh ?? 0.3, o.wt ?? 0.2, Math.hypot(Bp[0] - A[0], Bp[2] - A[2]));
    }
  }
  /** Cuvette (entonnoir) de rayon R et profondeur depth, bord à la hauteur c[1] ; le trou au centre */
  bowl(c, R, depth, o = {}) {
    const floor = o.floor || this.theme.floor, rings = 14, segs = 40, prof = (r) => c[1] - depth * Math.pow(1 - r / R, 1.6);
    const P = (r, a) => [c[0] + Math.sin(a) * r, prof(r), c[2] + Math.cos(a) * r];
    const N = (r, a) => { const e = 0.01, d = (prof(Math.min(R, r + e)) - prof(Math.max(0, r - e))) / (2 * e); return norm([-Math.sin(a) * d, 1, -Math.cos(a) * d]); };
    const r0 = o.flat ?? 0.6;   // centre plat pour le trou
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const ra = r0 + (R - r0) * i / rings, rb = r0 + (R - r0) * (i + 1) / rings, a0 = j / segs * Math.PI * 2, a1 = (j + 1) / segs * Math.PI * 2;
      const v = (r, a) => ({ p: P(r, a), n: N(r, a), uv: [Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5], ao: 0.85 + 0.15 * (1 - r / R) });
      this.quad(floor, v(ra, a0), v(rb, a0), v(rb, a1), v(ra, a1), { ref: [0, 1, 0] });
    }
    const yc = prof(r0);
    for (let j = 0; j < segs; j++) {
      const a0 = j / segs * Math.PI * 2, a1 = (j + 1) / segs * Math.PI * 2, up = [0, 1, 0];
      this.tri(floor, { p: [c[0], yc, c[2]], n: up, uv: [0, 0] }, { p: [c[0] + Math.sin(a0) * r0, yc, c[2] + Math.cos(a0) * r0], n: up, uv: [0, 0] }, { p: [c[0] + Math.sin(a1) * r0, yc, c[2] + Math.cos(a1) * r0], n: up, uv: [0, 0] }, { ref: up });
    }
    this.footprint(c, R + 0.5);
    return [c[0], yc, c[2]];
  }
  /** Obstacle mobile */
  kin(o) {
    const pose = { ...o.pose, pivot: o.pivot.slice(), yaw: (o.pose.yaw || 0) };
    if (pose.dir) { const d = pose.dir, cs = Math.cos(pose.yaw), sn = Math.sin(pose.yaw); pose.dir = [d[0] * cs + d[2] * sn, d[1], -d[0] * sn + d[2] * cs]; }
    const k = { pose, boxes: o.boxes, mat: o.mat || 'metalw', look: o.look || 'metal', id: this.kins.length };
    this.kins.push(k); this.footprint(o.pivot, 2);
    return k;
  }
  zone(type, c, h, yaw = 0, extra = {}) { this.zones.push({ type, c, h, yaw, ...extra }); }
  /** Zone (boîte alignée) qui englobe l'allée entre les abscisses s0 et s1, de la hauteur du sol (moins below) à celle du toit (plus above) */
  zoneAlong(t, s0, s1, type, o = {}) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const fr of t.frames) {
      if (fr.s < s0 - 1e-6 || fr.s > s1 + 1e-6) continue;
      for (const side of [1, -1]) for (const up of [-(o.below ?? 0.1), fr.wh + (o.above ?? 0.05)]) {
        const q = add(add(fr.p, mul(fr.l, side * (fr.w / 2 + (o.pad ?? 0)))), mul(fr.u, up));
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
      }
    }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], h = [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2];
    this.zone(type, c, h, 0, o.extra || {});
    return { c, h };
  }
  water(c, h, yaw = 0) { this.zone('water', c, h, yaw); }
  lava(c, h, yaw = 0) { this.zone('lava', c, h, yaw); }
  tele(c, h, to, toYaw, extra = {}) { this.zone('tele', c, h, 0, { to, toYaw, ...extra }); }
  wind(c, h, f, yaw = 0) { this.zone('wind', c, h, yaw, { f }); }
  deco(type, p, o = {}) { this.decor.push({ type, p: p.slice(), ...o }); }
  light(p, color, intensity = 6, dist = 7) { this.lights.push({ p: p.slice(), color, intensity, dist }); }

  /* ---- génération des allées ---- */
  finish() {
    for (const path of this.paths) for (const pc of path.pieces) this.buildPiece(pc);
    return this;
  }
  buildPiece(pc) {
    const F = pc.frames; if (F.length < 2) return;
    const theme = this.theme, skirt = theme.skirt || 'skirt';
    const E = (fr, side, extra = 0) => add(fr.p, mul(fr.l, side * (fr.w / 2 + extra)));
    // sol (2 bandes : gauche-centre et centre-droite)
    for (let i = 0; i < F.length - 1; i++) {
      const a = F[i], b = F[i + 1], mat = b.floor;
      if (a.nofloor && b.nofloor) continue;
      const aoE = (fr, side) => (side > 0 ? (fr.wl ? 0.72 : 0.95) : (fr.wr ? 0.72 : 0.95));
      const V3 = (fr, side) => ({ p: side === 0 ? fr.p : E(fr, side), n: fr.u, uv: [(side * fr.w / 2) * 0.5, fr.s * 0.5], ao: side === 0 ? 1 : aoE(fr, side) });
      this.quad(mat, V3(a, 1), V3(b, 1), V3(b, 0), V3(a, 0), { ref: a.u, prm: b.prm });
      this.quad(mat, V3(a, 0), V3(b, 0), V3(b, -1), V3(a, -1), { ref: a.u, prm: b.prm });
      this.footprint(a.p, a.w / 2 + 0.4);
    }
    this.footprint(F[F.length - 1].p, F[F.length - 1].w / 2 + 0.4);
    // murets
    for (const side of [1, -1]) {
      const on = (fr) => (side > 0 ? fr.wl : fr.wr);
      for (let i = 0; i < F.length - 1; i++) {
        const a = F[i], b = F[i + 1];
        if (!on(a) || !on(b)) continue;
        const mat = b.wall, inN = (fr) => mul(fr.l, -side), outN = (fr) => mul(fr.l, side);
        const ib = (fr) => E(fr, side), it = (fr) => add(E(fr, side), mul(fr.u, fr.wh)), ot = (fr) => add(E(fr, side, fr.wt), mul(fr.u, fr.wh)), ob = (fr) => E(fr, side, fr.wt);
        this.quad(mat, { p: ib(a), n: inN(a), uv: [a.s * 0.5, 0], ao: 0.8 }, { p: ib(b), n: inN(b), uv: [b.s * 0.5, 0], ao: 0.8 }, { p: it(b), n: inN(b), uv: [b.s * 0.5, b.wh] }, { p: it(a), n: inN(a), uv: [a.s * 0.5, a.wh] }, { ref: inN(a) });
        this.quad(b.trim || mat, { p: it(a), n: a.u, uv: [a.s * 0.5, 0] }, { p: it(b), n: b.u, uv: [b.s * 0.5, 0] }, { p: ot(b), n: b.u, uv: [b.s * 0.5, b.wt] }, { p: ot(a), n: a.u, uv: [a.s * 0.5, a.wt] }, { ref: a.u });
        this.quad(mat, { p: ob(a), n: outN(a), uv: [a.s * 0.5, 0] }, { p: ob(b), n: outN(b), uv: [b.s * 0.5, 0] }, { p: ot(b), n: outN(b), uv: [b.s * 0.5, b.wh] }, { p: ot(a), n: outN(a), uv: [a.s * 0.5, a.wh] }, { ref: outN(a) });
        // bouts de muret
        const prevOn = i > 0 && on(F[i - 1]), nextOn = i + 2 < F.length && on(F[i + 2]);
        if (!prevOn && !(i === 0 && pc.capS)) this.quad(mat, { p: ib(a), uv: [0, 0] }, { p: it(a), uv: [0, a.wh] }, { p: ot(a), uv: [a.wt, a.wh] }, { p: ob(a), uv: [a.wt, 0] }, { ref: mul(a.f, -1), flat: true });
        if (!nextOn && !(i + 2 === F.length && pc.capE)) this.quad(mat, { p: ib(b), uv: [0, 0] }, { p: it(b), uv: [0, b.wh] }, { p: ot(b), uv: [b.wt, b.wh] }, { p: ob(b), uv: [b.wt, 0] }, { ref: b.f, flat: true });
      }
      // jupe sous l'allée (rendu seulement)
      for (let i = 0; i < F.length - 1; i++) {
        const a = F[i], b = F[i + 1];
        const ex = (fr) => (on(fr) ? fr.wt : 0);
        const top = (fr) => E(fr, side, ex(fr));
        const bot = (fr) => (fr.base === 'slab' || pc.base === 'slab') ? add(top(fr), mul(fr.u, -0.3)) : (typeof fr.base === 'number' ? [top(fr)[0], fr.base, top(fr)[2]] : [top(fr)[0], this.groundY, top(fr)[2]]);
        const n = mul(a.l, side);
        if (top(a)[1] - bot(a)[1] < 0.02 && top(b)[1] - bot(b)[1] < 0.02) continue;
        this.quad(skirt, { p: bot(a), n, uv: [a.s * 0.5, 0] }, { p: bot(b), n, uv: [b.s * 0.5, 0] }, { p: top(b), n, uv: [b.s * 0.5, 1] }, { p: top(a), n, uv: [a.s * 0.5, 1] }, { ref: n, phys: false });
      }
    }
    // pilotis sous les dalles
    let lastPile = -9;
    for (const fr of F) {
      if (!(fr.base === 'slab' || pc.base === 'slab') || fr.u[1] < 0.8) continue;
      if (fr.s - lastPile < 2.6) continue;
      lastPile = fr.s;
      for (const side of [1, -1]) { const q = add(E(fr, side, -0.15), mul(fr.u, -0.3)); this.piles.push([q[0], q[1], q[2]]); }
    }
    // dessous de dalle (loopings, passerelles)
    for (let i = 0; i < F.length - 1; i++) {
      const a = F[i], b = F[i + 1];
      if (!(a.base === 'slab' || pc.base === 'slab')) continue;
      const d = (fr, side) => add(E(fr, side, (side > 0 ? fr.wl : fr.wr) ? fr.wt : 0), mul(fr.u, -0.3));
      const n = mul(a.u, -1);
      this.quad(skirt, { p: d(a, 1), n, uv: [0, a.s * 0.5] }, { p: d(b, 1), n, uv: [0, b.s * 0.5] }, { p: d(b, -1), n, uv: [1, b.s * 0.5] }, { p: d(a, -1), n, uv: [1, a.s * 0.5] }, { ref: n, phys: false });
    }
    // toit (tunnels)
    for (let i = 0; i < F.length - 1; i++) {
      const a = F[i], b = F[i + 1];
      if (!a.roof || !b.roof) continue;
      const r = (fr, side) => add(E(fr, side, 0.02), mul(fr.u, fr.wh));
      const n = mul(a.u, -1);
      this.quad(b.roofMat || theme.roof || 'glassroof', { p: r(a, 1), n, uv: [0, a.s] }, { p: r(b, 1), n, uv: [0, b.s] }, { p: r(b, -1), n, uv: [1, b.s] }, { p: r(a, -1), n, uv: [1, a.s] }, { ref: n });
    }
    // bouts arrondis
    if (pc.capS) this.cap(F[0], -1);
    if (pc.capE) this.cap(F[F.length - 1], 1);
  }
  /** Bout arrondi : demi-disque de sol + muret en arc */
  cap(fr, dirSign) {
    const n = 14, c = fr.p, r = fr.w / 2, d = mul(norm([fr.f[0], 0, fr.f[2]]), dirSign), l = fr.l, up = fr.u;
    const pt = (k, rr) => { const a = k / n * Math.PI; return add(c, add(mul(l, Math.cos(a) * rr), mul(d, Math.sin(a) * rr))); };
    const skirt = this.theme.skirt || 'skirt';
    for (let k = 0; k < n; k++) {
      const p0 = pt(k, r), p1 = pt(k + 1, r);
      this.tri(fr.floor, { p: c, n: up, uv: [0, fr.s * 0.5], ao: 1 }, { p: p0, n: up, uv: [0, 0], ao: 0.75 }, { p: p1, n: up, uv: [0, 0], ao: 0.75 }, { ref: up });
      const o0 = pt(k, r + fr.wt), o1 = pt(k + 1, r + fr.wt), h = fr.wh;
      const rd0 = norm(sub(p0, c)), rd1 = norm(sub(p1, c));
      const inN0 = mul(rd0, -1), inN1 = mul(rd1, -1);
      this.quad(fr.wall, { p: p0, n: inN0, uv: [k * 0.2, 0], ao: 0.8 }, { p: p1, n: inN1, uv: [(k + 1) * 0.2, 0], ao: 0.8 }, { p: add(p1, mul(up, h)), n: inN1, uv: [(k + 1) * 0.2, h] }, { p: add(p0, mul(up, h)), n: inN0, uv: [k * 0.2, h] }, { ref: inN0 });
      this.quad(fr.trim || fr.wall, { p: add(p0, mul(up, h)), n: up, uv: [k * 0.2, 0] }, { p: add(p1, mul(up, h)), n: up, uv: [(k + 1) * 0.2, 0] }, { p: add(o1, mul(up, h)), n: up, uv: [(k + 1) * 0.2, fr.wt] }, { p: add(o0, mul(up, h)), n: up, uv: [k * 0.2, fr.wt] }, { ref: up });
      this.quad(fr.wall, { p: o0, n: rd0, uv: [k * 0.2, 0] }, { p: o1, n: rd1, uv: [(k + 1) * 0.2, 0] }, { p: add(o1, mul(up, h)), n: rd1, uv: [(k + 1) * 0.2, h] }, { p: add(o0, mul(up, h)), n: rd0, uv: [k * 0.2, h] }, { ref: rd0 });
      const by = fr.base === 'slab' ? null : (typeof fr.base === 'number' ? fr.base : this.groundY);
      if (by != null && o0[1] - by > 0.02) this.quad(skirt, { p: [o0[0], by, o0[2]], n: rd0, uv: [k * 0.3, 0] }, { p: [o1[0], by, o1[2]], n: rd1, uv: [(k + 1) * 0.3, 0] }, { p: o1, n: rd1, uv: [(k + 1) * 0.3, 1] }, { p: o0, n: rd0, uv: [k * 0.3, 1] }, { ref: rd0, phys: false });
    }
    this.footprint(c, r + 0.5);
  }

  /* ---- sortie ---- */
  result(meta) {
    this.finish();
    const groups = [...this.groups.values()].map((g) => ({ ...g, pos: Float32Array.from(g.pos), nrm: Float32Array.from(g.nrm), uv: Float32Array.from(g.uv), ao: Float32Array.from(g.ao) }));
    const mesh = new StaticMesh();
    for (const g of this.groups.values()) {
      if (!g.phys) continue;
      const P = g.pos;
      for (let i = 0, t = 0; i < P.length; i += 9, t++) {
        mesh.add([P[i], P[i + 1], P[i + 2]], [P[i + 3], P[i + 4], P[i + 5]], [P[i + 6], P[i + 7], P[i + 8]], g.mat, [g.prm[t * 3], g.prm[t * 3 + 1], g.prm[t * 3 + 2]]);
      }
    }
    mesh.build();
    // zones orientées → boîtes alignées (approximation par l'enveloppe si tournées)
    const zones = this.zones.map((z) => {
      const cs = Math.abs(Math.cos(z.yaw)), sn = Math.abs(Math.sin(z.yaw));
      const hx = z.h[0] * cs + z.h[2] * sn, hz = z.h[0] * sn + z.h[2] * cs;
      return { ...z, min: [z.c[0] - hx, z.c[1] - z.h[1], z.c[2] - hz], max: [z.c[0] + hx, z.c[1] + z.h[1], z.c[2] + hz], yaw: z.toYaw ?? z.yaw };
    });
    const main = this.paths.filter((p) => p.main);
    const route = [];
    for (const p of main) for (const f of p.frames) route.push(f.p);
    if (this.teeP) route.unshift(this.teeP);
    if (this.cupP) route.push(this.cupP);
    let routeLen = 0; for (let i = 1; i < route.length; i++) routeLen += Math.hypot(route[i][0] - route[i - 1][0], route[i][2] - route[i - 1][2]);
    const world = new World({ mesh, kin: this.kins, zones, cup: this.cupP, groundY: this.groundY, groundType: this.groundType,
      ceilY: zones.some((z) => z.type === 'antigrav') ? mesh.max[1] + 10 : null,
      killY: Math.min(mesh.min[1], this.groundY) - 4,
      bounds: [mesh.min[0] - 12, mesh.min[2] - 12, mesh.max[0] + 12, mesh.max[2] + 12] });
    // départ posé au sol
    const tee = this.teeP ? settle(world, this.teeP) : null;
    return { ...meta, groups, kin: this.kins, zones, decor: this.decor, lights: this.lights, piles: this.piles, groundY: this.groundY, groundType: this.groundType, tee, cup: this.cupP, route, routeLen, foot: this.foot,
      world, bounds: { min: mesh.min, max: mesh.max }, tris: mesh.n, cam: this.cam };
  }
}

/** Distance restante le long du parcours (pour les bots et les tests) */
export function routeRemaining(route, p) {
  let best = Infinity, bestI = 0, bestT = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1], ab = sub(b, a), l2 = dot(ab, ab) || 1e-9;
    let t = dot(sub(p, a), ab) / l2; t = Math.max(0, Math.min(1, t));
    const q = add(a, mul(ab, t)), dh = Math.hypot(p[0] - q[0], p[2] - q[2]), dv = Math.abs(p[1] - q[1]);
    const d = dh + dv * 2.5;
    if (d < best) { best = d; bestI = i; bestT = t; }
  }
  let rem = 0;
  const a = route[bestI], b = route[bestI + 1];
  rem += Math.hypot(...sub(b, a)) * (1 - bestT);
  for (let i = bestI + 1; i < route.length - 1; i++) rem += Math.hypot(...sub(route[i + 1], route[i]));
  return { rem, off: best };
}
export { BALL_R, CUP_R };
