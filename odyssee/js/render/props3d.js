// odyssee/js/render/props3d.js — petits décors des arènes en vrai volume (au lieu d'un sprite dressé, qui se lisait à
// plat) : panneau de bois, statue sur son socle, pupitre à écran incliné, pics de glace, rocher de glace à pousser.
// Chaque décor est un assemblage de boîtes, de troncs de pyramide et de pointes, posé dans la géométrie des murs du bloc
// (faces sud, est, ouest et dessus : le nord ne se voit jamais), habillé de tuiles de 32 px dessinées par
// arenes-tex.js (clés « p3_… ») et ombré face par face, lumière en haut à gauche.
// prop3d(G, A, k, x, y, tan) : G = géométrie (quadv), A = cases de l'atlas, tan = tangente de l'inclinaison de la caméra
// (une hauteur de h cases à l'écran = h × tan dans le monde). Renvoie false si le décor n'a pas de modèle.

const OMBRE = { s: 0.84, e: 0.62, o: 0.98, h: 1 };
/** sous-rectangle d'une tuile (en pixels sur 32) */
const sous = (t, a, b, c, d) => { const [u0, v0, u1, v1] = t, du = (u1 - u0) / 32, dv = (v1 - v0) / 32; return [u0 + a * du, v0 + b * dv, u0 + c * du, v0 + d * dv]; };
const uvQ = ([u0, v0, u1, v1]) => [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
const uvT = ([u0, v0, u1, v1]) => [[u0, v1], [u1, v1], [(u0 + u1) / 2, v0], [(u0 + u1) / 2, v0]];
const q = (G, P, uv, sh) => G.quadv(P, uv, [sh, sh, sh, sh]);

/** boîte (x0, z0)–(x1, z1) de y0 à y1 ; t : { s, e, o, h } tuiles des faces (une face sans tuile n'est pas posée) ; k : éclat */
function boite(G, x0, z0, x1, z1, y0, y1, t, k = 1) {
  if (t.s) q(G, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uvQ(t.s), OMBRE.s * k);
  if (t.e) q(G, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uvQ(t.e), OMBRE.e * k);
  if (t.o) q(G, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uvQ(t.o), OMBRE.o * k);
  if (t.h) q(G, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uvQ(t.h), OMBRE.h * k);
}
/** tronc de pyramide : base (x0, z0)–(x1, z1) à y0, sommet rentré de r (ou [ro, re, rn, rs]) à y1 */
function tronc(G, x0, z0, x1, z1, y0, y1, r, t, k = 1) {
  const [ro, re, rn, rs] = Array.isArray(r) ? r : [r, r, r, r], a0 = x0 + ro, a1 = x1 - re, b0 = z0 + rn, b1 = z1 - rs;
  if (t.s) q(G, [[x0, y0, z1], [x1, y0, z1], [a1, y1, b1], [a0, y1, b1]], uvQ(t.s), OMBRE.s * k);
  if (t.e) q(G, [[x1, y0, z1], [x1, y0, z0], [a1, y1, b0], [a1, y1, b1]], uvQ(t.e), OMBRE.e * k);
  if (t.o) q(G, [[x0, y0, z0], [x0, y0, z1], [a0, y1, b1], [a0, y1, b0]], uvQ(t.o), OMBRE.o * k);
  if (t.h) q(G, [[a0, y1, b1], [a1, y1, b1], [a1, y1, b0], [a0, y1, b0]], uvQ(t.h), OMBRE.h * k);
}
/** pointe : base (x0, z0)–(x1, z1) à y0, sommet en (ax, ay, az) */
function pointe(G, x0, z0, x1, z1, y0, ax, ay, az, t, k = 1) {
  const S = [ax, ay, az];
  if (t.s) q(G, [[x0, y0, z1], [x1, y0, z1], S, S], uvT(t.s), OMBRE.s * k);
  if (t.e) q(G, [[x1, y0, z1], [x1, y0, z0], S, S], uvT(t.e), OMBRE.e * k);
  if (t.o) q(G, [[x0, y0, z0], [x0, y0, z1], S, S], uvT(t.o), OMBRE.o * k);
}
/** un cristal : fût qui s'évase à peine puis pointe (cx, cz : centre de la base, l : demi-largeur, h : hauteur, p : penché) */
function cristal(G, cx, cz, l, h, p, t) {
  const f = h * 0.55, r = l * 0.18;
  tronc(G, cx - l, cz - l, cx + l, cz + l, 0, f, [r - p * 0.3, r + p * 0.3, r, r], { s: t.s, e: t.e, o: t.o });
  pointe(G, cx - l + r - p * 0.3, cz - l + r, cx + l - r - p * 0.3, cz + l - r, f, cx + p, h, cz - l * 0.2, { s: t.sp, e: t.e, o: t.op });
}

export function prop3d(G, A, k, x, y, tan, o = {}) {
  const H = (h) => h * tan;
  if (k === 'sign') {
    const b = A.p3_bois, p = A.p3_panneau; if (!b || !p) return false;
    const pot = { s: sous(b, 0, 0, 3, 24), e: sous(b, 3, 0, 6, 24), o: sous(b, 0, 0, 3, 24), h: sous(b, 8, 0, 11, 3) };
    boite(G, x + 0.17, y + 0.56, x + 0.26, y + 0.65, 0, H(0.8), pot); boite(G, x + 0.74, y + 0.56, x + 0.83, y + 0.65, 0, H(0.8), pot);
    // la planche, un peu en avant des poteaux, et son chaperon
    boite(G, x + 0.06, y + 0.63, x + 0.94, y + 0.72, H(0.27), H(0.83), { s: sous(p, 0, 0, 28, 18), e: sous(b, 3, 0, 6, 18), o: sous(b, 0, 0, 3, 18), h: sous(b, 8, 4, 32, 7) });
    boite(G, x + 0.02, y + 0.58, x + 0.98, y + 0.75, H(0.83), H(0.9), { s: sous(b, 8, 8, 32, 10), e: sous(b, 3, 0, 6, 2), o: sous(b, 0, 0, 3, 2), h: sous(b, 8, 12, 32, 17) });
    return true;
  }
  if (k === 'gymstatue') {
    const s = A.p3_socle, c = A.p3_statue; if (!s || !c) return false;
    const pierre = sous(s, 0, 0, 24, 13), cote = sous(s, 0, 16, 16, 29), dessus = sous(s, 16, 16, 32, 32), corps = sous(c, 0, 16, 16, 32), flanc = sous(c, 16, 16, 28, 32), dos = sous(c, 0, 0, 1, 1);
    // socle à plinthe, plaque gravée devant
    boite(G, x + 0.1, y + 0.3, x + 0.9, y + 0.94, 0, H(0.1), { s: sous(s, 0, 13, 26, 16), e: sous(s, 0, 13, 20, 16), o: sous(s, 0, 13, 20, 16), h: dessus });
    boite(G, x + 0.14, y + 0.34, x + 0.86, y + 0.9, H(0.1), H(0.46), { s: pierre, e: cote, o: cote, h: dessus });
    boite(G, x + 0.1, y + 0.3, x + 0.9, y + 0.94, H(0.46), H(0.54), { s: sous(s, 0, 13, 26, 16), e: sous(s, 0, 13, 20, 16), o: sous(s, 0, 13, 20, 16), h: dessus });
    // la créature assise : corps trapu, pattes avant, tête aux yeux creusés, deux oreilles pointues, queue
    tronc(G, x + 0.27, y + 0.42, x + 0.73, y + 0.84, H(0.54), H(0.96), [0.05, 0.05, 0.04, 0.02], { s: corps, e: flanc, o: flanc, h: dos });
    boite(G, x + 0.3, y + 0.8, x + 0.41, y + 0.9, H(0.54), H(0.72), { s: sous(c, 16, 0, 20, 6), e: sous(c, 20, 0, 23, 6), o: sous(c, 16, 0, 19, 6), h: dos });
    boite(G, x + 0.59, y + 0.8, x + 0.7, y + 0.9, H(0.54), H(0.72), { s: sous(c, 16, 0, 20, 6), e: sous(c, 20, 0, 23, 6), o: sous(c, 16, 0, 19, 6), h: dos });
    boite(G, x + 0.31, y + 0.5, x + 0.69, y + 0.86, H(0.96), H(1.28), { s: sous(c, 0, 0, 12, 10), e: sous(c, 16, 6, 28, 16), o: sous(c, 16, 6, 28, 16), h: sous(c, 12, 0, 16, 4) });
    pointe(G, x + 0.31, y + 0.56, x + 0.44, y + 0.76, H(1.28), x + 0.35, H(1.52), y + 0.66, { s: flanc, e: flanc, o: flanc });
    pointe(G, x + 0.56, y + 0.56, x + 0.69, y + 0.76, H(1.28), x + 0.65, H(1.52), y + 0.66, { s: flanc, e: flanc, o: flanc });
    pointe(G, x + 0.7, y + 0.52, x + 0.84, y + 0.66, H(0.54), x + 0.86, H(0.9), y + 0.56, { s: flanc, e: flanc, o: flanc });
    return true;
  }
  if (k === 'pupitre') {
    const m = A.p3_metal, e = A.p3_ecran; if (!m || !e) return false;
    const fut = { s: sous(m, 0, 0, 6, 16), e: sous(m, 6, 0, 10, 16), o: sous(m, 0, 0, 4, 16), h: sous(m, 12, 0, 20, 6) };
    boite(G, x + 0.22, y + 0.46, x + 0.78, y + 0.9, 0, H(0.07), { s: sous(m, 0, 18, 18, 20), e: sous(m, 0, 18, 14, 20), o: sous(m, 0, 18, 14, 20), h: sous(m, 12, 8, 30, 22) });
    boite(G, x + 0.41, y + 0.6, x + 0.59, y + 0.76, H(0.07), H(0.5), fut);
    // la console : un coin dont le dessus incliné porte l'écran
    const x0 = x + 0.12, x1 = x + 0.88, zb = y + 0.9, zh = y + 0.5, yb = H(0.5), yh = H(0.98), ym = H(0.42);
    boite(G, x0, zh, x1, zb, ym, yb, { s: sous(m, 0, 22, 24, 25), e: sous(m, 0, 22, 12, 25), o: sous(m, 0, 22, 12, 25) });
    q(G, [[x0, yb, zb], [x1, yb, zb], [x1, yh, zh], [x0, yh, zh]], uvQ(sous(e, 0, 0, 24, 20)), 1);
    q(G, [[x1, yb, zb], [x1, yb, zh], [x1, yh, zh], [x1, yh, zh]], uvT(sous(m, 20, 0, 28, 8)), OMBRE.e);
    q(G, [[x0, yb, zh], [x0, yb, zb], [x0, yh, zh], [x0, yh, zh]], uvT(sous(m, 20, 0, 28, 8)), OMBRE.o);
    return true;
  }
  if (k === 'pilier_glace') {
    const g = A.p3_glace; if (!g) return false;
    const t = { s: sous(g, 0, 0, 16, 32), sp: sous(g, 0, 0, 16, 20), e: sous(g, 16, 0, 24, 32), o: sous(g, 24, 0, 32, 32), op: sous(g, 24, 0, 32, 20) };
    // un bouquet de cristaux : le grand au milieu, deux petits penchés à ses pieds (tirés de la case : jamais deux pareils)
    const v = ((x * 73 + y * 151) % 7) / 7, w = ((x * 31 + y * 57) % 5) / 5;
    cristal(G, x + 0.62 - v * 0.1, y + 0.52, 0.15, H(0.75 + w * 0.3), 0.07, t);
    cristal(G, x + 0.47 + v * 0.06, y + 0.62, 0.21, H(1.35 + v * 0.3), -0.02 + w * 0.04, t);
    cristal(G, x + 0.24, y + 0.76, 0.13, H(0.55 + v * 0.25), -0.08, t);
    if (w > 0.3) cristal(G, x + 0.76, y + 0.8, 0.1, H(0.4 + w * 0.2), 0.06, t);
    return true;
  }
  if (k === 'rocher_glace') {
    const g = A.p3_bloc, n = A.p3_neige; if (!g || !n) return false;
    // un bloc de glace trapu, arêtes abattues, coiffé de neige
    const cote = sous(g, 0, 0, 24, 18), flanc = sous(g, 0, 18, 20, 32), neige = sous(n, 0, 0, 24, 20);
    tronc(G, x + 0.08, y + 0.22, x + 0.92, y + 0.94, 0, H(0.2), -0.03, { s: sous(g, 0, 12, 24, 18), e: sous(g, 0, 26, 20, 32), o: sous(g, 0, 26, 20, 32) });
    boite(G, x + 0.05, y + 0.19, x + 0.95, y + 0.97, H(0.2), H(0.62), { s: cote, e: flanc, o: flanc });
    tronc(G, x + 0.05, y + 0.19, x + 0.95, y + 0.97, H(0.62), H(0.84), [0.12, 0.12, 0.1, 0.14], { s: sous(n, 0, 20, 24, 26), e: sous(n, 0, 26, 20, 32), o: sous(n, 0, 20, 20, 26), h: neige });
    return true;
  }
  return false;
}
