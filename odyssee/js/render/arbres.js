// odyssee/js/render/arbres.js — variantes des arbres, sapins et buissons, pour des forêts moins répétitives.
// Chaque dessin de la planche donne au chargement cinq autres dessins de la même essence, faits pixel par pixel (sans
// rééchantillonnage, donc sans flou) : silhouette symétrisée depuis la gauche ou depuis la droite, houppier élargi ou
// resserré de deux colonnes, tronc allongé de quelques rangées. Au rendu, chaque arbre tire de sa position un de ces
// dessins, un miroir et une teinte (lumière, vert plus jaune ou plus bleu) : toujours les mêmes d'une image à l'autre.

/** sprites qui reçoivent des variantes */
export const ESSENCES = ['tree', 'tree2', 'tree3', 'pine', 'snowpine', 'deadtree', 'palm', 'bush', 'automne0', 'automne1', 'automne2', 'automne3', 'automne4', 'automne5', 'cerisier', 'erable', 'arbre_automne'];
/** nombre de variantes ajoutées par sprite (clés « tree~1 » … « tree~5 ») */
export const NV = 5;
// recettes : [symétrie (0 aucune, -1 depuis la gauche, 1 depuis la droite), colonnes en plus au milieu, rangées de tronc en plus]
const RECETTES = [[-1, 0, 0], [1, 0, 2], [0, 2, 3], [-1, -2, 2], [1, 2, 4]];

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

/**
 * Ajoute aux images de la planche les variantes de chaque essence (clés « k~1 » … « k~NV », même densité que k).
 */
export function variantesArbres(images, dens) {
  for (const k of ESSENCES) {
    const img = images[k]; if (!img || !img.width) continue;
    const I = lire(img);
    RECETTES.forEach(([s, l, t], i) => {
      let V = s ? symetrie(I, s) : I;
      const d1 = (dens[k] || 1) < 2;   // dessin à la densité des tuiles : un pixel en vaut deux à l'écran
      V = tronc(largeur(V, d1 && l ? Math.sign(l) : l), img.height < 30 ? 0 : d1 ? Math.ceil(t / 2) : t);
      images[`${k}~${i + 1}`] = ecrire(V); if (dens[k]) dens[`${k}~${i + 1}`] = dens[k];
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
/** teinte d'un arbre (couleurs de sommets) : lumière 0,87 → 1,07, vert plus jaune ou plus bleu ; neige : lumière seule */
export function teinte(x, y, neutre = false) {
  const l = 0.87 + h32(x, y, 203) * 0.2, c = neutre ? 0 : (h32(x, y, 204) - 0.5) * 0.14;
  return [l * (1 + c * 0.6), l * (1 + c * 0.15), l * (1 - c)];
}
