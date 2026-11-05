// tools/test-odyssee-schema.mjs — aller-retour du schéma des cartes (odyssee-schema.mjs → dessin → odyssee-schema-import.mjs) :
//   1. à vide : le monde et chaque grotte, exportés puis relus sans retouche (1:1, ×8, hauteurs) → 0 retouche ;
//   2. coups de pinceau simulés (bord adouci, JPEG à 85 % en 4:2:0) : un lac, un chemin, une butte rehaussée d'un étage →
//      les cases changent comme voulu, rien d'autre, la butte reçoit sa falaise au sud, et le monde reste relié.
// node tools/test-odyssee-schema.mjs
import { buildWorld } from '../odyssee/js/world/region.js';
import { T } from '../odyssee/js/world/tiles.js';
import { PAR_TYPE, schema1, schema8, hauteurs1, hauteursCarte, pngDe, lirePNG, choisirCartes, grisDe } from './odyssee-schema-commun.mjs';
import { lireSchema, lireHauteurs, analyser } from './odyssee-schema-import.mjs';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('ÉCHEC :', msg); } };
const rgba = (img) => lirePNG(pngDe(img));   // passe par un vrai PNG
const baseDe = (m) => { const H = hauteursCarte(m); return { types: Uint8Array.from(m.t), h: H.h, rav: H.rav }; };

/* ---------- 1. à vide ---------- */
const world = buildWorld();
for (const m of choisirCartes(world, 'tout')) {
  const base = baseDe(m);
  const s1 = lireSchema(rgba(schema1(m)), m, base.types).types, s8 = lireSchema(rgba(schema8(m, world)), m, base.types, schema8(m, world)).types;
  const h1 = lireHauteurs(rgba(hauteurs1(m)), m, base).h;
  const r = analyser(m, base, { types: s1, h: h1 }), r8 = analyser(m, base, { types: s8 });
  ok(r.ops.length === 0 && r.refus.length === 0, `${m.id} : aller-retour 1:1 à vide → ${r.ops.length} retouches, ${r.refus.length} refus`);
  ok(r8.ops.length === 0 && r8.refus.length === 0, `${m.id} : aller-retour ×8 à vide → ${r8.ops.length} retouches`);
}

/* ---------- JPEG simulé (YCbCr, chrominance 4:2:0, DCT 8 × 8, tables de qualité 85) ---------- */
const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array(32).fill(99)];
const COS = Array.from({ length: 64 }, (_, k) => { const u = k >> 3, x = k & 7; return Math.cos((2 * x + 1) * u * Math.PI / 16) * (u ? Math.sqrt(2 / 8) : Math.sqrt(1 / 8)); });
function plan(p, W, H, Q, qual) {
  const sc = qual < 50 ? 5000 / qual : 200 - 2 * qual, q = Q.map((v) => Math.max(1, Math.floor((v * sc + 50) / 100)));
  const b = new Float64Array(64), t = new Float64Array(64);
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = p[Math.min(H - 1, by + y) * W + Math.min(W - 1, bx + x)] - 128;
    for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += b[y * 8 + x] * COS[u * 8 + x]; t[y * 8 + u] = s; }
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += t[y * 8 + u] * COS[v * 8 + y]; b[v * 8 + u] = Math.round(s / q[v * 8 + u]) * q[v * 8 + u]; }
    for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += b[v * 8 + u] * COS[u * 8 + x]; t[v * 8 + x] = s; }
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += t[v * 8 + x] * COS[v * 8 + y]; if (by + y < H && bx + x < W) p[(by + y) * W + bx + x] = s + 128; }
  }
}
function jpeg(img, qual = 85) {
  const { w, h, d } = img, n = w * h, Y = new Float64Array(n), cw = Math.ceil(w / 2), ch = Math.ceil(h / 2), Cb = new Float64Array(cw * ch), Cr = new Float64Array(cw * ch), cnt = new Float64Array(cw * ch);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], x = i % w, y = (i / w) | 0, j = (y >> 1) * cw + (x >> 1);
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[j] += -0.168736 * r - 0.331264 * g + 0.5 * b + 128; Cr[j] += 0.5 * r - 0.418688 * g - 0.081312 * b + 128; cnt[j]++;
  }
  for (let j = 0; j < cw * ch; j++) { Cb[j] /= cnt[j]; Cr[j] /= cnt[j]; }
  plan(Y, w, h, QL, qual); plan(Cb, cw, ch, QC, qual); plan(Cr, cw, ch, QC, qual);
  const out = { w, h, c: 4, d: new Uint8Array(n * 4) };
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    // suréchantillonnage bilinéaire de la chrominance (comme libjpeg, « fancy upsampling »)
    const fx = Math.max(0, Math.min(cw - 1, (x - 0.5) / 2)), fy = Math.max(0, Math.min(ch - 1, (y - 0.5) / 2)), x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const bil = (C) => { const a = C[y0 * cw + x0], b = C[y0 * cw + Math.min(cw - 1, x0 + 1)], c = C[Math.min(ch - 1, y0 + 1) * cw + x0], e = C[Math.min(ch - 1, y0 + 1) * cw + Math.min(cw - 1, x0 + 1)]; return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty; };
    const yy = Y[i], cb = bil(Cb) - 128, cr = bil(Cr) - 128, cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    out.d[i * 4] = cl(yy + 1.402 * cr); out.d[i * 4 + 1] = cl(yy - 0.344136 * cb - 0.714136 * cr); out.d[i * 4 + 2] = cl(yy + 1.772 * cb); out.d[i * 4 + 3] = 255;
  }
  return out;
}

/* ---------- pinceau : disques à bord adouci le long d'un trait (en cases ; s pixels par case) ---------- */
function pinceau(img, s, pts, rayon, col) {
  for (let k = 0; k + 1 < pts.length || k === 0; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[Math.min(k + 1, pts.length - 1)], L = Math.hypot(bx - ax, by - ay), N = Math.max(1, Math.ceil(L * 4));
    for (let j = 0; j <= N; j++) {
      const cx = (ax + (bx - ax) * j / N) * s, cy = (ay + (by - ay) * j / N) * s, R = rayon * s;
      for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
        const a = Math.max(0, Math.min(1, R + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));   // un pixel de fondu
        if (!a) continue;
        const o = (y * img.w + x) * 4; for (let q = 0; q < 3; q++) img.d[o + q] = Math.round(img.d[o + q] * (1 - a) + col[q] * a);
      }
    }
    if (pts.length === 1) break;
  }
}
const dedans = (pts, rayon, x, y, marge) => {
  let best = 1e9;
  for (let k = 0; k < Math.max(1, pts.length - 1); k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[Math.min(k + 1, pts.length - 1)], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / l2)); best = Math.min(best, Math.hypot(x + 0.5 - ax - vx * t, y + 0.5 - ay - vy * t));
  }
  return best <= rayon + marge;
};

/* ---------- 2. coups de pinceau ---------- */
// un endroit d'herbe à plat, sans PNJ ni objet ni passage, pour chaque essai
function terrain(m, w, h, depuis = [0, 0]) {
  const pris = new Set([...m.npcs.map((n) => n.x + ',' + n.y), ...m.items.map((i) => i.x + ',' + i.y), ...m.warps.keys()]);
  for (let y0 = depuis[1]; y0 < m.h - h - 2; y0++) for (let x0 = depuis[0]; x0 < m.w - w - 2; x0++) {
    let bon = true;
    for (let y = y0 - 1; y <= y0 + h && bon; y++) for (let x = x0 - 1; x <= x0 + w; x++) { const t = m.get(x, y); if ((t !== T.GRASS && t !== T.TALL && t !== T.TREE) || m.height(x, y) !== 0 || pris.has(x + ',' + y) || m.pentes?.[y * m.w + x] || m.zoneAt(x, y)?.town) { bon = false; break; } }
    if (bon) return [x0, y0];
  }
  throw new Error('pas de place pour l\'essai');
}
function essai(nom, s, avecJpeg, hauteursAussi) {
  const W = buildWorld(), m = W.maps.monde, base = baseDe(m);
  const [lx, ly] = terrain(m, 8, 8, [60, 60]), lac = [[lx + 4, ly + 4]];
  const [px, py] = terrain(m, 12, 3, [lx + 12, ly]), chemin = [[px + 1, py + 1.5], [px + 11, py + 1.5]];
  const [bx, by] = terrain(m, 9, 7, [px + 16, py]);
  // schéma : lac (rayon 3), chemin (demi-largeur 1)
  const sc = rgba(s === 1 ? schema1(m) : schema8(m, W));
  pinceau(sc, s, lac, 3, PAR_TYPE.get(T.WATER).rgb); pinceau(sc, s, chemin, 1, PAR_TYPE.get(T.PATH).rgb);
  const img = avecJpeg ? jpeg(sc) : sc;
  const types = lireSchema(img, m, base.types, s === 8 ? schema8(m, W) : null).types;
  // hauteurs : une butte d'un étage (rectangle 7 × 5 à bord adouci)
  let h = null;
  if (hauteursAussi) {
    const hi = rgba(hauteurs1(m)), g = grisDe(1), butte = [];
    for (let y = by + 1; y <= by + 5; y++) butte.push([bx + 1, y + 0.5], [bx + 8, y + 0.5]);
    for (let k = 0; k < butte.length; k += 2) pinceau(hi, 1, [butte[k], butte[k + 1]], 0.5, [g, g, g]);
    h = lireHauteurs(avecJpeg ? jpeg(hi) : hi, m, base).h;
  }
  const r = analyser(m, base, { types, h });
  // contrôle : dans le monde retouché (analyser applique les retouches à m)
  let mauvais = 0, hors = 0;
  const attendu = (x, y) => (dedans(lac, 3, x, y, -0.5) ? T.WATER : dedans(chemin, 1, x, y, -0.5) ? T.PATH : null);
  const flou = (x, y) => dedans(lac, 3, x, y, 0.6) || dedans(chemin, 1, x, y, 0.6);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x, a = attendu(x, y);
    if (a !== null) { if (m.t[i] !== a) mauvais++; }
    else if (!flou(x, y) && m.t[i] !== base.types[i] && !(m.t[i] === T.CLIFF && m.height(x, y - 1) > m.height(x, y))) { hors++; if (hors <= 5) console.log(`    ${x},${y} : ${base.types[i]} → ${m.t[i]}`); }
  }
  ok(mauvais === 0, `${nom} : ${mauvais} case(s) du lac ou du chemin pas comme voulu`);
  ok(hors === 0, `${nom} : ${hors} case(s) changée(s) hors des coups de pinceau`);
  if (hauteursAussi) {
    let bh = 0, faux = 0;
    for (let y = by + 1; y <= by + 5; y++) for (let x = bx + 2; x <= bx + 7; x++) if (m.height(x, y) !== 1) bh++;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const dansButte = x >= bx && x <= bx + 9 && y >= by && y <= by + 6;   // bord adouci : la case du bord peut aller d'un côté ou de l'autre
      if (!dansButte && m.height(x, y) !== base.h[y * m.w + x] && !(m.t[y * m.w + x] === T.CLIFF)) { faux++; if (faux <= 5) console.log(`    ${x},${y} : hauteur ${base.h[y * m.w + x]} → ${m.height(x, y)}`); }
    }
    let paroi = 0; for (let x = bx + 2; x <= bx + 7; x++) if (m.get(x, by + 6) === T.CLIFF && m.height(x, by + 6) === 0) paroi++;
    ok(bh === 0, `${nom} : ${bh} case(s) de la butte pas à l'étage 1`);
    ok(faux === 0, `${nom} : ${faux} hauteur(s) changée(s) hors de la butte`);
    ok(paroi === 6, `${nom} : la butte n'a pas sa falaise au sud (${paroi}/6)`);
    ok(r.problemes.every((p) => /enfermé|coupé/.test(p) === false), `${nom} : accès coupé : ${r.problemes.join(' ; ')}`);
  }
  console.log(`  ${nom} : ${r.compte.terrain} case(s) de terrain, ${r.compte.hauteurs} hauteur(s), ${r.compte.parois} paroi(s) ; ${r.problemes.length} remarque(s)`);
  return r;
}
essai('1:1, PNG, pinceau adouci', 1, false, true);
essai('×8, JPEG 85 %', 8, true, false);
essai('1:1 hauteurs en JPEG 85 %, ×8 schéma en JPEG', 8, true, true);
// un schéma 1:1 passé en JPEG est refusé (message clair), pas lu de travers
{ const m = world.maps.monde; let err = '';
  try { lireSchema(jpeg(rgba(schema1(m))), m, Uint8Array.from(m.t)); } catch (e) { err = e.message; }
  ok(/JPEG/.test(err), 'schéma 1:1 en JPEG : devrait être refusé'); }

console.log(fails ? `Schéma des cartes : ${fails} échec(s)` : 'Schéma des cartes : aller-retour OK');
process.exit(fails ? 1 : 0);
