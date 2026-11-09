// odyssee/js/render/densite.js — une seule densité de pixels à l'écran.
//
// Les personnages, les arbres et le décor « version 2 » sont dessinés à densité 2 (un pixel du dessin = un pixel de
// l'écran, une case = 32 pixels). Le décor repris du tileset du DS (cerisiers, érables, bancs, lanternes, torii,
// fontaines, tonneaux…, plus de 3 000 sur la carte) était dessiné à densité 1 : chacun de ses pixels faisait 2 × 2 pixels
// d'écran, à côté d'arbres et de personnages deux fois plus fins. Ces dessins sont ici repassés à densité 2 au
// chargement, pixel par pixel (aucun flou, aucune couleur nouvelle) :
//  - Scale2x (EPX) : chaque pixel devient quatre, les diagonales et les contours s'arrondissent d'un demi-pixel ;
//  - feuillage (arbres) : à l'intérieur du houppier, quelques sous-pixels prennent la teinte d'un pixel voisin plus
//    clair (en haut, côté lumière) ou plus sombre (en bas), ce qui dessine des petites touffes de feuilles à la finesse
//    des autres arbres ; le contour et la palette ne changent pas.

/** décor dessiné à densité 1 à repasser à densité 2 (feuillage : retouche des touffes en plus) */
export const A_DENSIFIER = ['cerisier', 'erable', 'arbre_automne', 'banc', 'bateau', 'borne', 'bouee', 'brasero', 'butte', 'caisse', 'caisses', 'cloche', 'colonne', 'console', 'corde', 'coussin', 'cristal', 'cuve', 'ecran_carte', 'fontaine', 'fossile', 'gargouille', 'lampe_phare', 'lanterne', 'livres', 'machine_labo', 'panneau_bois', 'parasol', 'pilier_ball', 'rocher_grand', 'sanctuaire', 'squelette', 'statue_dragon', 'stele', 'table_balls', 'telescope', 'tonneau', 'torii', 'trone', 'bang', 'wake'];
const FEUILLAGE = new Set(['cerisier', 'erable', 'arbre_automne']);

const h3 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 974711) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Scale2x d'une image RGBA (Uint8ClampedArray w × h) : renvoie l'image 2w × 2h */
export function scale2x(d, w, h) {
  const W = w * 2, out = new Uint8ClampedArray(W * h * 2 * 4);
  const eq = (a, b) => a === b || (d[a + 3] === 0 && d[b + 3] === 0) || (d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2] && d[a + 3] === d[b + 3]);
  const at = (x, y) => (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4;
  const put = (X, Y, s) => { const o = (Y * W + X) * 4; out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = d[s + 3]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    put(2 * x, 2 * y, eq(C, A) && !eq(C, D) && !eq(A, B) ? A : P);
    put(2 * x + 1, 2 * y, eq(A, B) && !eq(A, C) && !eq(B, D) ? B : P);
    put(2 * x, 2 * y + 1, eq(D, C) && !eq(D, B) && !eq(C, A) ? C : P);
    put(2 * x + 1, 2 * y + 1, eq(B, D) && !eq(B, A) && !eq(D, C) ? D : P);
  }
  return out;
}

/** touffes de feuilles : sous-pixels intérieurs repris d'un voisin (source à densité 1) plus clair au-dessus, plus
 *  sombre au-dessous ; o : image 2× (modifiée), d : source */
function touffes(o, d, w, h, seed) {
  const W = w * 2, lum = (i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!opaque(x, y) || !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) continue;
    const P = (y * w + x) * 4, U = ((y - 1) * w + x) * 4, Dn = ((y + 1) * w + x) * 4, lp = lum(P);
    // tronc (brun peu saturé) : pas de touffes
    if (Math.max(d[P], d[P + 1], d[P + 2]) - Math.min(d[P], d[P + 1], d[P + 2]) < 24) continue;
    for (let s = 0; s < 4; s++) {
      const sx = s & 1, sy = s >> 1, r = h3(2 * x + sx, 2 * y + sy, seed);
      // en haut du pixel : reflet du voisin du dessus s'il est plus clair ; en bas : ombre du voisin du dessous
      const src = sy === 0 ? (lum(U) > lp + 6 && r < 0.42 ? U : -1) : (lum(Dn) < lp - 6 && r < 0.36 ? Dn : -1);
      if (src < 0) continue;
      const q = ((2 * y + sy) * W + 2 * x + sx) * 4;
      o[q] = d[src]; o[q + 1] = d[src + 1]; o[q + 2] = d[src + 2];
    }
  }
}

/** repasse à densité 2 les dessins listés qui sont encore à densité 1 (images : clé → image ; dens : clé → densité) */
export function densifier(images, dens) {
  for (const k of A_DENSIFIER) {
    const img = images[k]; if (!img || !img.width || (dens[k] || 1) >= 2) continue;
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data, o = scale2x(d, w, h);
    if (FEUILLAGE.has(k)) touffes(o, d, w, h, k.length * 31 + 7);
    const C = document.createElement('canvas'); C.width = w * 2; C.height = h * 2;
    const G = C.getContext('2d'), im = G.createImageData(w * 2, h * 2); im.data.set(o); G.putImageData(im, 0, 0);
    images[k] = C; dens[k] = 2;
  }
}
