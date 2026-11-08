// odyssee/js/render/arbres.js — variantes des arbres, sapins et buissons, pour des forêts moins répétitives.
// Chaque dessin de la planche donne au chargement cinq autres dessins de la même essence, faits pixel par pixel (sans
// rééchantillonnage, donc sans flou) : silhouette symétrisée depuis la gauche ou depuis la droite, houppier élargi ou
// resserré de deux colonnes, tronc allongé de quelques rangées. Au rendu, chaque arbre tire de sa position un de ces
// dessins, un miroir et une teinte (lumière, vert plus jaune ou plus bleu) : toujours les mêmes d'une image à l'autre.
// Chacun de ces six dessins existe encore en plusieurs « retouches » (voir retoucher) : comme le sol, des taches de
// feuillage plus claires, plus sombres ou plus dorées à des endroits différents, des reflets de feuilles déplacés, et
// un contour du houppier qui gagne une touffe ici et en perd une là ; la palette de l'arbre ne change pas.

/** sprites qui reçoivent des variantes */
export const ESSENCES = ['tree', 'tree2', 'tree3', 'pine', 'snowpine', 'deadtree', 'palm', 'bush', 'automne0', 'automne1', 'automne2', 'automne3', 'automne4', 'automne5', 'cerisier', 'erable', 'arbre_automne'];
/** retouches par dessin (le dessin d'origine compris) ; nombre de variantes ajoutées par sprite (clés « tree~1 » …) */
const NR = 3;
export const NV = 6 * NR - 1;
// recettes : [symétrie (0 aucune, -1 depuis la gauche, 1 depuis la droite), colonnes en plus au milieu, rangées de tronc en plus]
const RECETTES = [[-1, 0, 0], [1, 0, 2], [0, 2, 3], [-1, -2, 2], [1, 2, 4]];
/** branches fines : une moitié recopiée laisserait des brindilles en l'air */
const SANS_SYMETRIE = new Set(['deadtree']);

function lire(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
}
function ecrire(I) {
  const c = document.createElement('canvas'); c.width = I.w; c.height = I.h;
  const g = c.getContext('2d'), im = g.createImageData(I.w, I.h); im.data.set(I.d); g.putImageData(im, 0, 0); return c;
}
/** la moitié gauche (s < 0) ou droite (s > 0) recopiée en miroir sur l'autre moitié */
function symetrie(I, s) {
  const { w, h } = I, d = new Uint8ClampedArray(I.d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = s < 0 ? (x > (w - 1) / 2 ? w - 1 - x : x) : (x < (w - 1) / 2 ? w - 1 - x : x);
    for (let k = 0; k < 4; k++) d[(y * w + x) * 4 + k] = I.d[(y * w + src) * 4 + k];
  }
  return { w, h, d };
}
/** n colonnes en plus (n > 0, copies des colonnes du milieu) ou en moins (n < 0, retirées au milieu) */
function largeur(I, n) {
  if (!n) return I;
  const { w, h } = I, W = w + n, c = Math.floor(w / 2), d = new Uint8ClampedArray(W * h * 4);
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    let x;
    if (n > 0) x = X < c ? X : X < c + n ? c - (n - (X - c)) % 2 : X - n;   // colonnes c-1, c, c-1… insérées au milieu
    else x = X < c + n / 2 ? X : X - n;
    for (let k = 0; k < 4; k++) d[(y * W + X) * 4 + k] = I.d[(y * w + x) * 4 + k];
  }
  return { w: W, h, d };
}
/** n rangées de tronc en plus : la rangée du milieu du fût (sous le houppier, au-dessus des racines) répétée */
function tronc(I, n) {
  if (!n) return I;
  const { w, h } = I, larg = [];
  for (let y = 0; y < h; y++) { let a = w, b = -1; for (let x = 0; x < w; x++) if (I.d[(y * w + x) * 4 + 3] > 127) { a = Math.min(a, x); b = Math.max(b, x); } larg.push(b >= a ? b - a + 1 : 0); }
  const max = Math.max(...larg);
  // les rangées étroites du bas (le fût), sous la dernière rangée large (le houppier)
  let y1 = h - 1; while (y1 > 0 && larg[y1] === 0) y1--;
  let yb = y1; while (yb > 0 && !(larg[yb] > 0 && larg[yb] <= max * 0.3)) yb--;
  let ya = yb; while (ya > 0 && larg[ya - 1] > 0 && larg[ya - 1] <= max * 0.3) ya--;
  if (yb < h * 0.5 || yb - ya < 1) return I;   // pas de fût visible (buisson, houppier jusqu'au sol)
  const ym = Math.floor((ya + yb) / 2), H = h + n, d = new Uint8ClampedArray(w * H * 4);
  for (let Y = 0; Y < H; Y++) {
    const y = Y <= ym ? Y : Y <= ym + n ? ym : Y - n;
    d.set(I.d.subarray(y * w * 4, (y + 1) * w * 4), Y * w * 4);
  }
  return { w, h: H, d };
}

/* ---------------- retouches au pixel ---------------- */
/** bruit doux (valeur interpolée sur une grille de pas p), dans [0, 1] */
function bruit(seed, p) {
  return (x, y) => {
    const gx = x / p, gy = y / p, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), v = (a, b) => h32(a, b, seed);
    return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
  };
}
/** première rangée du fût (sous le houppier) ; h si l'arbre n'a pas de fût visible */
function debutTronc(I) {
  const { w, h, d } = I, larg = [];
  for (let y = 0; y < h; y++) { let a = w, b = -1; for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 127) { a = Math.min(a, x); b = Math.max(b, x); } larg.push(b >= a ? b - a + 1 : 0); }
  const max = Math.max(...larg);
  let y1 = h - 1; while (y1 > 0 && larg[y1] === 0) y1--;
  let yb = y1; while (yb > 0 && !(larg[yb] > 0 && larg[yb] <= max * 0.34)) yb--;
  let ya = yb; while (ya > 0 && larg[ya - 1] > 0 && larg[ya - 1] <= max * 0.34) ya--;
  return yb < h * 0.45 ? h : ya;
}
/**
 * Une retouche du dessin (seed > 0) : rien n'est inventé, chaque pixel prend une couleur de la palette du houppier.
 *  - taches : là où un bruit doux est haut, le feuillage passe à la teinte plus claire de la palette, là où il est bas
 *    à la plus sombre (le contour, la teinte la plus sombre, ne bouge pas) ; quelques taches dorées (soleil) ;
 *  - reflets : des feuilles isolées (un ou deux pixels en diagonale) prennent la teinte claire suivante ;
 *  - contour : par endroits le houppier gagne une touffe d'un pixel (le pixel du bord avance, son voisin intérieur
 *    prend sa couleur), ailleurs il en perd une ; jamais sous le houppier ni sur le tronc.
 */
function retoucher(I, seed) {
  const { w, h } = I, src = I.d, d = new Uint8ClampedArray(src), yt = Math.min(debutTronc(I), Math.floor(h * 0.86)) - 2;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
  const feuille = (x, y) => A(x, y) && y < yt;
  // palette du houppier, de la plus sombre à la plus claire
  const pal = new Map();
  for (let y = 0; y < yt; y++) for (let x = 0; x < w; x++) if (A(x, y)) { const i = (y * w + x) * 4, k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]; pal.set(k, (pal.get(k) || 0) + 1); }
  const P = [...pal.keys()].filter((k) => pal.get(k) >= 3).sort((a, b) => { const L = (k) => ((k >> 16) & 255) * 0.299 + ((k >> 8) & 255) * 0.587 + (k & 255) * 0.114; return L(a) - L(b); });
  if (P.length < 3) return I;
  // voisins de teinte : pour chaque couleur, la plus proche un peu plus claire et un peu plus sombre de même nuance
  // (sans quoi un érable rouge prendrait par endroits le brun du tronc ou le vert d'un liseré)
  const rgb = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255], L = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const nuance = (a, b) => { const sa = a[0] + a[1] + a[2] + 1, sb = b[0] + b[1] + b[2] + 1; return Math.hypot(a[0] / sa - b[0] / sb, a[1] / sa - b[1] / sb, a[2] / sa - b[2] / sb); };
  const voisin = P.map((k) => {
    const c = rgb(k), l = L(c); let up = null, dn = null, bu = 1e9, bd = 1e9;
    for (const q of P) {
      if (q === k) continue; const e = rgb(q), le = L(e), n = nuance(c, e); if (n > 0.06) continue;
      const dl = le - l; if (dl > 4 && dl < 60 && dl + n * 300 < bu) { bu = dl + n * 300; up = e; } if (dl < -4 && dl > -60 && -dl + n * 300 < bd) { bd = -dl + n * 300; dn = e; }
    }
    return { up, dn };
  });
  const rang = new Map(P.map((k, i) => [k, i]));
  const coul = (i) => rgb(P[Math.max(0, Math.min(P.length - 1, i))]);
  /** la couleur de rang r décalée d'un cran (s = 1 plus clair, -1 plus sombre), dans sa nuance ; null s'il n'y en a pas */
  const decale = (r, s) => (s > 0 ? voisin[r].up : voisin[r].dn);
  const poser = (x, y, c, a = 255) => { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; };
  const lire = (x, y) => { const i = (y * w + x) * 4; return [src[i], src[i + 1], src[i + 2]]; };
  const rg = (x, y) => { const i = (y * w + x) * 4; return rang.get((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]); };
  const bord = (x, y) => !A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1);
  const pas = Math.max(4, Math.round(Math.min(w, yt) / 6));
  const N1 = bruit(seed * 7 + 1, pas), N2 = bruit(seed * 7 + 2, pas * 1.4), N3 = bruit(seed * 7 + 3, Math.max(3, pas * 0.6));
  // 1. taches de lumière et d'ombre, et taches dorées
  for (let y = 0; y < yt; y++) for (let x = 0; x < w; x++) {
    if (!A(x, y) || bord(x, y)) continue;
    const r = rg(x, y); if (r == null || r === 0) continue;
    const n = N1(x, y), o = N2(x, y);
    let c = null;
    if (n > 0.62) c = decale(r, 1); else if (n < 0.35) c = decale(r, -1);
    if (c && (n > 0.75 || n < 0.22)) {   // au cœur de la tache, un cran de plus
      const k2 = (c[0] << 16) | (c[1] << 8) | c[2], r2 = rang.get(k2); if (r2 != null) { const c2 = decale(r2, n > 0.5 ? 1 : -1); if (c2) c = c2; }
    }
    if (c) poser(x, y, c);
    if (o > 0.7 && r >= 2) { const c0 = c || coul(r), t = Math.min(1, (o - 0.7) * 3.5) * 0.34; poser(x, y, [c0[0] * (1 + t * 0.5), c0[1] * (1 + t * 0.25), c0[2] * (1 - t * 0.5)]); }
  }
  // 2. reflets de feuilles déplacés
  for (let y = 1; y < yt - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!A(x, y) || bord(x, y)) continue;
    const r = rg(x, y); if (r == null || r < 1 || r >= P.length - 1) continue;
    const q = h32(x, y, seed * 7 + 4);
    const up = decale(r, 1), dn = decale(r, -1);
    if (q < 0.035 && up) { poser(x, y, up); if (q < 0.015 && A(x + 1, y - 1) && !bord(x + 1, y - 1) && rg(x + 1, y - 1) === r) poser(x + 1, y - 1, up); }
    else if (q > 0.975 && dn) poser(x, y, dn);
  }
  // 3. contour du houppier : touffes gagnées ou perdues (vers le haut ou sur les côtés seulement)
  const pris = new Set();
  for (let y = 1; y < yt - 2; y++) for (let x = 1; x < w - 1; x++) {
    if (!feuille(x, y) || !bord(x, y)) continue;
    const n = N3(x, y);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
      const ox = x + dx, oy = y + dy, ix = x - dx, iy = y - dy;
      if (A(ox, oy) || !feuille(ix, iy)) continue;
      if (n > 0.68 && ox >= 0 && ox < w && oy >= 0 && !pris.has(ox + ',' + oy)) {        // la touffe avance d'un pixel
        poser(ox, oy, lire(x, y)); poser(x, y, lire(ix, iy)); pris.add(ox + ',' + oy);
      } else if (n < 0.26 && bord(ix, iy) === false && !pris.has(x + ',' + y)) {        // la touffe recule d'un pixel
        poser(x, y, [0, 0, 0], 0); poser(ix, iy, lire(x, y)); pris.add(x + ',' + y);
      }
    }
  }
  return { w, h, d };
}

/**
 * Ajoute aux images de la planche les variantes de chaque essence (clés « k~1 » … « k~NV », même densité que k).
 */
export function variantesArbres(images, dens) {
  for (const k of ESSENCES) {
    const img = images[k]; if (!img || !img.width) continue;
    const I = lire(img);
    let n = 0;
    const ajouter = (V, base) => {
      for (let r = 0; r < NR; r++) {
        if (base && r === 0) continue;   // le dessin d'origine tel quel reste la clé k
        n++; images[`${k}~${n}`] = ecrire(r ? retoucher(V, n * 13 + r + k.length) : V); if (dens[k]) dens[`${k}~${n}`] = dens[k];
      }
    };
    ajouter(I, true);
    RECETTES.forEach(([s, l0, t]) => {
      let l = l0;
      let V = s && !SANS_SYMETRIE.has(k) ? symetrie(I, s) : I;
      if (SANS_SYMETRIE.has(k) && s) l = l || 2 * s;   // à la place : houppier plus large ou plus étroit
      const d1 = (dens[k] || 1) < 2;   // dessin à la densité des tuiles : un pixel en vaut deux à l'écran
      V = tronc(largeur(V, d1 && l ? Math.sign(l) : l), img.height < 30 ? 0 : d1 ? Math.ceil(t / 2) : t);
      ajouter(V, false);
    });
  }
}

const h32 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 974711) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** la variante d'un sprite pour la case (x, y) : la clé (le dessin d'origine une fois sur six) */
export function variante(S, k, x, y) {
  const v = Math.floor(h32(x, y, 201) * (NV + 1));
  return v && S[`${k}~${v}`] ? `${k}~${v}` : k;
}
/** miroir horizontal tiré de la case */
export const miroir = (x, y) => h32(x, y, 202) < 0.5;
/** teinte d'un arbre (couleurs de sommets). Comme le sol : de grandes plages de forêt plus claires ou plus sombres, plus
 *  jaunes ou plus bleutées (bruit doux sur une dizaine de cases), plus un petit écart propre à chaque arbre ;
 *  lumière 0,82 → 1,1 ; neige : lumière seule */
const PLAGE_L = bruit(211, 9), PLAGE_C = bruit(212, 13);
export function teinte(x, y, neutre = false) {
  const l = 0.8 + PLAGE_L(x, y) * 0.2 + h32(x, y, 203) * 0.1, c = neutre ? 0 : (PLAGE_C(x, y) - 0.5) * 0.3 + (h32(x, y, 204) - 0.5) * 0.08;
  return [l * (1 + c * 0.6), l * (1 + c * 0.15), l * (1 - c)];
}
