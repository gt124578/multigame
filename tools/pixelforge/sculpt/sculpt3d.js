// Odyssée — PixelForge / sculpt3d : sculpture par champs de distance (SDF) pour les petits objets détaillés
// (statues, lanternes, vases, fontaines…), là où les boîtes et les cylindres à 8 faces donnent un rendu « cubique ».
//
// Principe : on décrit l'objet comme une suite de formes arrondies (sphères, ellipsoïdes, capsules, boîtes arrondies,
// tores, profils tournés, profils extrudés) fondues les unes dans les autres par union douce (k = rayon du congé),
// creusées (yeux, plis, rainures) ou peintes (bandes dorées, pupilles) ; puis on maille la surface (surface nets),
// on prend les normales du champ (lisses, sans facettes) et on cuit dans les couleurs des sommets une occlusion
// ambiante tirée du champ (les creux s'assombrissent : plis, yeux, dessous du menton se lisent même à 32 px par case).
// Le détail vient de la forme ET des couleurs, comme les modèles « 3D pixel art » de Noir & Blanc : peu de géométrie
// à l'écran, mais une silhouette organique et un ombrage en paliers qui suit les courbes.
//
// Module pur (aucune dépendance) : utilisable dans le navigateur (atelier3d.html) comme dans Node (tests, cuisson).
//
//   const S = sculpture();
//   S.mat('bronze', '#b0763a', { grain: 0.06 });
//   S.capsule([0, 0, 0], [0, 1, 0], [0.2, 0.15], { mat: 'bronze', k: 0.05 });
//   S.groupe({ t: [0, 1.2, 0], r: [0, 0.3, 0] }, () => S.sphere([0, 0, 0], 0.2));
//   S.miroirX(() => S.sphere([0.2, 1, 0], 0.08));               // une fois de chaque côté
//   const m = S.maille({ pas: 0.025 });                          // { positions, normales, couleurs, indices, … }

/* ---------------------------------------------------------------- petits outils vectoriels ------------------------- */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const hexRGB = (c) => {
  if (Array.isArray(c)) return c;
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};

/** matrice affine 3 × 4 (lignes) : [a b c tx ; d e f ty ; g h i tz] */
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function mul(A, B) {   // A ∘ B
  const R = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) R[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
    R[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
  }
  return R;
}
function rotEuler([rx = 0, ry = 0, rz = 0]) {     // ordre X puis Y puis Z (comme three.js « XYZ »)
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const X = [1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0], Y = [cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0], Z = [cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0];
  return mul(mul(X, Y), Z);
}
/** transformation : t (translation), r (rotation d'Euler, radians), e (échelle uniforme), mx (miroir en x) */
function trs({ t = [0, 0, 0], r = [0, 0, 0], e = 1, mx = false } = {}) {
  const R = rotEuler(r), sx = mx ? -e : e;
  return [R[0] * sx, R[1] * e, R[2] * e, t[0], R[4] * sx, R[5] * e, R[6] * e, t[1], R[8] * sx, R[9] * e, R[10] * e, t[2]];
}
function inverse(M) {   // matrice rotation × échelle uniforme (± miroir) : inverse = transposée / e²
  const e2 = M[0] * M[0] + M[4] * M[4] + M[8] * M[8];
  const R = [M[0] / e2, M[4] / e2, M[8] / e2, 0, M[1] / e2, M[5] / e2, M[9] / e2, 0, M[2] / e2, M[6] / e2, M[10] / e2, 0];
  R[3] = -(R[0] * M[3] + R[1] * M[7] + R[2] * M[11]); R[7] = -(R[4] * M[3] + R[5] * M[7] + R[6] * M[11]); R[11] = -(R[8] * M[3] + R[9] * M[7] + R[10] * M[11]);
  return R;
}
const app = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];

/* ---------------------------------------------------------------- distances signées (Inigo Quilez) ---------------- */
function sdEllipsoide(x, y, z, rx, ry, rz) {
  const k0 = len3(x / rx, y / ry, z / rz), k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function sdBoiteArrondie(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
/** cône arrondi de a (rayon r1) à b (rayon r2) ; r1 = r2 : capsule */
function sdConeArrondi(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], l2 = bax * bax + bay * bay + baz * baz;
  if (l2 < 1e-12) return len3(px - a[0], py - a[1], pz - a[2]) - Math.max(r1, r2);
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2], yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv, x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yv * yv * l2, z2 = zv * zv * l2, k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}
function sdCylindre(px, py, pz, a, b, r) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const baba = bax * bax + bay * bay + baz * baz, paba = pax * bax + pay * bay + paz * baz;
  if (baba < 1e-12) return len3(pax, pay, paz) - r;
  const x = len3(pax * baba - bax * paba, pay * baba - bay * paba, paz * baba - baz * paba) - r * baba;
  const y = Math.abs(paba - baba * 0.5) - baba * 0.5, x2 = x * x, y2 = y * y * baba;
  const d = Math.max(x, y) < 0 ? -Math.min(x2, y2) : (x > 0 ? x2 : 0) + (y > 0 ? y2 : 0);
  return (Math.sign(d) * Math.sqrt(Math.abs(d))) / baba;
}
/** distance signée à un polygone 2D (sommets [[x, y], …]) */
function sdPolygone(px, py, v) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1), bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
/** lisse un profil : chaque coin arrondi par une courbe de Chaikin (n passes) */
export function chaikin(pts, n = 2, ferme = true) {
  let P = pts;
  for (let k = 0; k < n; k++) {
    const Q = [], m = P.length;
    for (let i = 0; i < (ferme ? m : m - 1); i++) {
      const a = P[i], b = P[(i + 1) % m];
      Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!ferme) { Q.unshift(P[0]); Q.push(P[m - 1]); }
    P = Q;
  }
  return P;
}

/* ---------------------------------------------------------------- bruit 3D (grain des matières) -------------------- */
function h3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1440662683) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function bruit3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}

/* ---------------------------------------------------------------- la sculpture ------------------------------------- */
export function sculpture() {
  const ops = [], mats = { defaut: { c: [0.8, 0.78, 0.74], grain: 0, echelle: 18 } };
  let pile = [ID];
  const M = () => pile[pile.length - 1];

  /** enregistre une matière : couleur, grain (amplitude du bruit de couleur), échelle du grain, veines,
   *  patine (couleur que prennent les creux : vert-de-gris d'un bronze, mousse d'une pierre),
   *  brillance (0 à 1 : reflet net du soleil, métal, vernis), lueur (0 à 1 : éclairé de l'intérieur, sans ombre) */
  function mat(nom, couleur, o = {}) { mats[nom] = { c: hexRGB(couleur), grain: o.grain ?? 0.04, echelle: o.echelle ?? 18, veines: o.veines ?? 0, patine: o.patine ? hexRGB(o.patine) : null, brillance: o.brillance ?? 0, lueur: o.lueur ?? 0 }; return nom; }
  const couleurDe = (m) => (m == null ? null : typeof m === 'string' && mats[m] ? m : (mats['#' + m] || mat(String(m), m), String(m)));

  /** ajoute une forme : f(x, y, z) = distance locale, bornes locales [x0, y0, z0, x1, y1, z1] */
  function forme(f, bornes, o = {}) {
    const W = M(), I = inverse(W), e = Math.sqrt(W[0] * W[0] + W[4] * W[4] + W[8] * W[8]);
    const [x0, y0, z0, x1, y1, z1] = bornes;
    let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
      const [X, Y, Z] = app(W, x, y, z);
      bx0 = Math.min(bx0, X); by0 = Math.min(by0, Y); bz0 = Math.min(bz0, Z); bx1 = Math.max(bx1, X); by1 = Math.max(by1, Y); bz1 = Math.max(bz1, Z);
    }
    const c = [(bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2], R = len3(bx1 - bx0, by1 - by0, bz1 - bz0) / 2;
    ops.push({ f, I, e, op: o.op || 'union', k: o.k ?? 0.03, mat: couleurDe(o.mat ?? (o.op === 'creuser' || o.op === 'inter' ? null : 'defaut')), net: !!o.net,
      c, R, aabb: [bx0, by0, bz0, bx1, by1, bz1] });
    return S;
  }

  const S = {
    mat, mats, ops,
    /** sphère de centre c */
    sphere: (c, r, o) => forme((x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r, [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r], o),
    /** ellipsoïde de centre c, rayons [rx, ry, rz], o.r : rotation */
    ellipsoide: (c, [rx, ry, rz], o = {}) => S.groupe({ t: c, r: o.r || [0, 0, 0] }, () => forme((x, y, z) => sdEllipsoide(x, y, z, rx, ry, rz), [-rx, -ry, -rz, rx, ry, rz], o)),
    /** capsule (r nombre) ou cône arrondi (r = [ra, rb]) de a à b */
    capsule: (a, b, r, o) => {
      const [ra, rb] = Array.isArray(r) ? r : [r, r], m = Math.max(ra, rb);
      return forme((x, y, z) => sdConeArrondi(x, y, z, a, b, ra, rb), [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m], o);
    },
    /** boîte de centre c, demi-tailles h, arrondi o.arrondi, rotation o.r */
    boite: (c, [hx, hy, hz], o = {}) => S.groupe({ t: c, r: o.r || [0, 0, 0] }, () => forme((x, y, z) => sdBoiteArrondie(x, y, z, hx, hy, hz, Math.min(o.arrondi ?? 0.02, hx, hy, hz)), [-hx, -hy, -hz, hx, hy, hz], o)),
    /** cylindre de a à b, arrondi des arêtes o.arrondi */
    cylindre: (a, b, r, o = {}) => {
      const d = len3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ar = Math.min(o.arrondi ?? 0.02, r * 0.9, d * 0.45), u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d];
      const a2 = [a[0] + u[0] * ar, a[1] + u[1] * ar, a[2] + u[2] * ar], b2 = [b[0] - u[0] * ar, b[1] - u[1] * ar, b[2] - u[2] * ar];
      return forme((x, y, z) => sdCylindre(x, y, z, a2, b2, r - ar) - ar, [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r], o);
    },
    /** tore d'axe y (o.r pour le tourner), grand rayon R, petit rayon r */
    tore: (c, R, r, o = {}) => S.groupe({ t: c, r: o.r || [0, 0, 0] }, () => forme((x, y, z) => len3(Math.hypot(x, z) - R, y, 0) - r, [-R - r, -r, -R - r, R + r, r, R + r], o)),
    /** profil tourné autour de l'axe y : points [[rayon, y], …] (polygone fermé, rayon ≥ 0) ; o.lisser : passes de Chaikin ;
     *  o.pans : n pans (lanterne hexagonale…) au lieu d'un tour parfait */
    tour: (c, profil, o = {}) => {
      const P = o.lisser ? chaikin(profil, o.lisser) : profil, rmax = Math.max(...P.map((p) => p[0])), ys = P.map((p) => p[1]);
      const pans = o.pans || 0, sect = pans ? Math.PI / pans : 0;
      return S.groupe({ t: c, r: o.r || [0, 0, 0] }, () => forme((x, y, z) => {
        let rr = Math.hypot(x, z);
        if (pans) { const a = Math.atan2(z, x) + sect, m = ((a % (2 * sect)) + 2 * sect) % (2 * sect) - sect; rr *= Math.cos(m) / Math.cos(sect); }   // faces centrées sur 0, 2π/n…
        return sdPolygone(rr, y, P);
      }, [-rmax, Math.min(...ys), -rmax, rmax, Math.max(...ys), rmax], o));
    },
    /** profil extrudé : polygone [[x, y], …] dans le plan xy, épaisseur 2 × h en z (o.arrondi arrondit les bords) */
    plaque: (c, poly, h, o = {}) => {
      const P = o.lisser ? chaikin(poly, o.lisser) : poly, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), ar = o.arrondi ?? 0.01;
      return S.groupe({ t: c, r: o.r || [0, 0, 0] }, () => forme((x, y, z) => {
        const dx = sdPolygone(x, y, P) + ar, dz = Math.abs(z) - h + ar;
        return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) - ar;
      }, [Math.min(...xs), Math.min(...ys), -h, Math.max(...xs), Math.max(...ys), h], o));
    },
    /** demi-espace sous le plan de normale n passant par c (pour trancher : op 'inter' ou 'creuser') */
    plan: (c, n, o) => { const l = len3(...n), u = n.map((v) => v / l); return forme((x, y, z) => (x - c[0]) * u[0] + (y - c[1]) * u[1] + (z - c[2]) * u[2], [-50, -50, -50, 50, 50, 50], o); },
    /** forme quelconque : f(x, y, z) en coordonnées locales, bornes locales */
    libre: (f, bornes, o) => forme(f, bornes, o),

    /** les formes ajoutées dans fn subissent la transformation { t, r, e, mx } */
    groupe(tr, fn) { pile.push(mul(M(), trs(tr))); try { fn(); } finally { pile.pop(); } return S; },
    /** fn une fois, puis une seconde fois en miroir (x → −x) : bras, oreilles, pattes */
    miroirX(fn) { fn(); return S.groupe({ mx: true }, fn); },
    /** n copies tournées autour de l'axe y */
    autour(n, fn, depart = 0) { for (let i = 0; i < n; i++) S.groupe({ r: [0, depart + (i * 2 * Math.PI) / n, 0] }, () => fn(i)); return S; },

    /* --------------------------------------------- évaluation du champ ----------------------------------------- */
    /** distance (et couleur si col) au point (x, y, z) */
    champ(x, y, z, col = null) {
      let d = 1e9, r = 0.8, g = 0.78, b = 0.74, premier = true;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i], k = o.k;
        const lb = len3(x - o.c[0], y - o.c[1], z - o.c[2]) - o.R;
        if (o.op === 'union' && !premier && lb >= d + k) continue;
        if (o.op === 'creuser' && lb > k) continue;
        if (o.op === 'peindre' && lb > k) continue;
        const I = o.I, lx = I[0] * x + I[1] * y + I[2] * z + I[3], ly = I[4] * x + I[5] * y + I[6] * z + I[7], lz = I[8] * x + I[9] * y + I[10] * z + I[11];
        const dp = o.f(lx, ly, lz) * o.e;
        const m = o.mat ? mats[o.mat] : null;
        if (o.op === 'union') {
          if (premier) { d = dp; premier = false; if (m) [r, g, b] = m.c; if (col && m) col.m = o.mat; continue; }
          const h = k > 0 ? clamp(0.5 + (0.5 * (dp - d)) / k, 0, 1) : dp < d ? 0 : 1;
          d = dp * (1 - h) + d * h - k * h * (1 - h);
          if (m) { const w = o.net ? (h < 0.5 ? 0 : 1) : h; r = m.c[0] * (1 - w) + r * w; g = m.c[1] * (1 - w) + g * w; b = m.c[2] * (1 - w) + b * w; if (col && h < 0.5) col.m = o.mat; }
        } else if (o.op === 'creuser') {
          const h = k > 0 ? clamp(0.5 - (0.5 * (d + dp)) / k, 0, 1) : -dp > d ? 1 : 0;
          d = d * (1 - h) - dp * h + k * h * (1 - h);
          if (m) { const w = o.net ? (h < 0.5 ? 0 : 1) : h; r = r * (1 - w) + m.c[0] * w; g = g * (1 - w) + m.c[1] * w; b = b * (1 - w) + m.c[2] * w; if (col && h >= 0.5) col.m = o.mat; }
        } else if (o.op === 'inter') {
          const h = k > 0 ? clamp(0.5 - (0.5 * (dp - d)) / k, 0, 1) : dp > d ? 0 : 1;
          d = dp * (1 - h) + d * h + k * h * (1 - h);
        } else if (o.op === 'peindre' && m) {
          const w = o.net ? (dp < 0 ? 1 : 0) : clamp(0.5 - dp / (2 * Math.max(k, 1e-4)), 0, 1);
          r = r * (1 - w) + m.c[0] * w; g = g * (1 - w) + m.c[1] * w; b = b * (1 - w) + m.c[2] * w; if (col && w >= 0.5) col.m = o.mat;
        }
      }
      if (col) { col.r = r; col.g = g; col.b = b; }
      return d;
    },
    /** bornes de l'objet (formes ajoutées seulement) */
    bornes() {
      const B = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const o of ops) if (o.op === 'union') for (let i = 0; i < 3; i++) { B[i] = Math.min(B[i], o.aabb[i]); B[i + 3] = Math.max(B[i + 3], o.aabb[i + 3]); }
      return B;
    },

    /* --------------------------------------------- maillage (surface nets) ------------------------------------- */
    /** pas : taille d'une cellule (0,02 à 0,03 pour un objet d'une case) ; ao : force de l'occlusion cuite ;
     *  renvoie { positions, normales, couleurs, finis (brillance, lueur), indices, bornes, nbSommets, nbTriangles, ms } */
    maille({ pas = 0.025, ao = 1, grain = 1 } = {}) {
      const t0 = Date.now(), B = S.bornes(), mg = pas * 2;
      const ox = B[0] - mg, oy = B[1] - mg, oz = B[2] - mg;
      const nx = Math.ceil((B[3] - B[0] + 2 * mg) / pas) + 1, ny = Math.ceil((B[4] - B[1] + 2 * mg) / pas) + 1, nz = Math.ceil((B[5] - B[2] + 2 * mg) / pas) + 1;
      const V = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = S.champ(ox + i * pas, oy + j * pas, oz + k * pas);
      // un sommet par cellule traversée : moyenne des points de passage sur ses arêtes
      const cel = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
      const P = [];
      const AR = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const v8 = new Float32Array(8);
      for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        let neg = 0;
        for (let c = 0; c < 8; c++) { v8[c] = V[id(i + CO[c][0], j + CO[c][1], k + CO[c][2])]; if (v8[c] < 0) neg++; }
        if (neg === 0 || neg === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of AR) {
          const va = v8[a], vb = v8[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += CO[a][0] + (CO[b][0] - CO[a][0]) * t; sy += CO[a][1] + (CO[b][1] - CO[a][1]) * t; sz += CO[a][2] + (CO[b][2] - CO[a][2]) * t; n++;
        }
        cel[cid(i, j, k)] = P.length / 3;
        P.push(ox + (i + sx / n) * pas, oy + (j + sy / n) * pas, oz + (k + sz / n) * pas);
      }
      // une face (deux triangles) par arête de la grille qui traverse la surface
      const T = [];
      const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) T.push(a, c, b, a, d, c); else T.push(a, b, c, a, c, d); };
      for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {   // arêtes en x
        const a = V[id(i, j, k)], b = V[id(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
        quad(cel[cid(i, j - 1, k - 1)], cel[cid(i, j, k - 1)], cel[cid(i, j, k)], cel[cid(i, j - 1, k)], a > 0);
      }
      for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {   // arêtes en y
        const a = V[id(i, j, k)], b = V[id(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
        quad(cel[cid(i - 1, j, k - 1)], cel[cid(i - 1, j, k)], cel[cid(i, j, k)], cel[cid(i, j, k - 1)], a > 0);
      }
      for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {   // arêtes en z
        const a = V[id(i, j, k)], b = V[id(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
        quad(cel[cid(i - 1, j - 1, k)], cel[cid(i, j - 1, k)], cel[cid(i, j, k)], cel[cid(i - 1, j, k)], a > 0);
      }
      // normales du champ (lisses), couleurs, grain, occlusion ambiante cuite
      const nv = P.length / 3, N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), F = new Float32Array(nv * 2), e = pas * 0.5, col = {};
      for (let v = 0; v < nv; v++) {
        const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
        let gx = S.champ(x + e, y, z) - S.champ(x - e, y, z), gy = S.champ(x, y + e, z) - S.champ(x, y - e, z), gz = S.champ(x, y, z + e) - S.champ(x, y, z - e);
        const l = len3(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
        N[3 * v] = gx; N[3 * v + 1] = gy; N[3 * v + 2] = gz;
        S.champ(x, y, z, col);
        let f = 1;
        const m = mats[col.m];
        if (m) { F[2 * v] = m.brillance; F[2 * v + 1] = m.lueur; }
        if (m && grain && m.grain) {
          const s = m.echelle;
          f += (bruit3(x * s, y * s, z * s) - 0.5) * 2 * m.grain * grain + (bruit3(x * s * 2.7, y * s * 2.7, z * s * 2.7) - 0.5) * m.grain * grain;
          if (m.veines) { const w = Math.abs(Math.sin((x + y * 0.6 + bruit3(x * 4, y * 4, z * 4) * 1.2) * 9)); f -= m.veines * Math.pow(1 - w, 8); }
        }
        if (ao) {   // occlusion : on remonte le long de la normale, le champ dit si quelque chose est proche
          let occ = 0, poids = 1;
          for (let s = 1; s <= 5; s++) {
            const hh = 0.012 + 0.03 * s;
            occ += (hh - S.champ(x + gx * hh, y + gy * hh, z + gz * hh)) * poids; poids *= 0.6;
          }
          const oc = ao * clamp(occ * 2.2, 0, 0.55);
          if (m && m.patine) { const w = clamp(oc * 1.8, 0, 0.85); col.r = col.r * (1 - w) + m.patine[0] * w; col.g = col.g * (1 - w) + m.patine[1] * w; col.b = col.b * (1 - w) + m.patine[2] * w; f *= 1 - oc * 0.5; }
          else f *= 1 - oc;
        }
        C[3 * v] = clamp(col.r * f, 0, 1); C[3 * v + 1] = clamp(col.g * f, 0, 1); C[3 * v + 2] = clamp(col.b * f, 0, 1);
      }
      // orientation : chaque triangle tourné vers l'extérieur (normale du champ)
      for (let t = 0; t < T.length; t += 3) {
        const a = T[t], b = T[t + 1], c = T[t + 2];
        const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
        const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const mx = N[3 * a] + N[3 * b] + N[3 * c], my = N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1], mz = N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2];
        if (cx * mx + cy * my + cz * mz < 0) { T[t + 1] = c; T[t + 2] = b; }
      }
      return { positions: new Float32Array(P), normales: N, couleurs: C, finis: F, indices: new Uint32Array(T), bornes: B, nbSommets: nv, nbTriangles: T.length / 3, ms: Date.now() - t0 };
    },
  };
  return S;
}
