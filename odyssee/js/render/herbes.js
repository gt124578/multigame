// odyssee/js/render/herbes.js — les hautes herbes qui passent devant un personnage, façon HeartGold / SoulSilver.
//
// L'herbe de devant est découpée dans le sol généré lui-même (sol.js, solgen.js) : le bas de la case, pixel pour pixel,
// couché sur le sol et projeté comme lui (32 px par case), mais à la profondeur du bord sud de la case (herbeDebout de
// world3d.js). Immobile, elle ne se voit pas : elle ne fait que cacher les jambes de qui se tient dans l'herbe. En haut, seuls les brins restent (les creux sombres entre eux deviennent
// transparents) : le bord est une frange de pointes, pas une ligne droite.
// Quand on entre dans la case, les brins s'écartent depuis le milieu (plus fort à la pointe qu'au pied, comme des tiges
// qui se couchent), frémissent, puis se referment. Mêmes teintes que l'herbe du sol (prairie, sous-bois, neige).
// Sans DOM : le dessin est calculé ici, world3d.js en fait une texture.
import { LUT, CELL, HAUTES } from './solgen.js';

export const HAUT = 4;                 // première ligne de la case reprise (au-dessus, le personnage est entièrement visible)
export const FRANGE = 8;               // lignes du haut où seuls les brins restent
export const MARGE = 5;                // pixels de chaque côté : les brins couchés débordent sur les cases voisines
export const LARG = CELL + 2 * MARGE, HAUTEUR = CELL - HAUT;

// images : [écart des pointes (pixels), frémissement (décalage alterné des pointes)]
const IMAGES = [[0, 0], [1.5, 0], [3, 0], [4, 1], [3.5, -1], [2.5, 1], [1.2, 0]];
export const NIMAGES = IMAGES.length;
// déroulé après l'entrée dans la case : [jusqu'à (ms), image]
const DEROULE = [[50, 1], [110, 2], [180, 3], [250, 4], [310, 3], [370, 5], [430, 6]];
export const DUREE = DEROULE[DEROULE.length - 1][0];
/** image à montrer ms millisecondes après l'entrée dans la case (0 : herbe au repos) */
export function imageHerbe(ms) {
  if (!(ms >= 0)) return 0;
  for (const [t, f] of DEROULE) if (ms < t) return f;
  return 0;
}

const TOUTES = new Uint8Array(256), BRINS = new Uint8Array(256);
for (const R of HAUTES) R.forEach((v, i) => { TOUTES[v] = 1; if (i >= 2) BRINS[v] = 1; });

/**
 * px : indices de palette de la case (CELL × CELL, ligne 0 = nord). Rend les NIMAGES images côte à côte (RGBA,
 * LARG × NIMAGES de large, HAUTEUR de haut, ligne 0 = haut), ou null s'il n'y a pas d'herbe haute dans la case.
 */
export function dessinHerbe(px) {
  let n = 0;
  for (let r = HAUT; r < CELL; r++) for (let x = 0; x < CELL; x++) n += TOUTES[px[r * CELL + x]];
  if (n < CELL * 4) return null;
  const W = LARG * NIMAGES, out = new Uint32Array(W * HAUTEUR), mil = CELL / 2;
  IMAGES.forEach(([A, q], f) => {
    const ox = f * LARG + MARGE;
    for (let r = 0; r < HAUTEUR; r++) {
      const cr = HAUT + r, t = (HAUTEUR - 1 - r) / (HAUTEUR - 1);      // 0 au pied, 1 en haut
      // les brins se couchent vers l'extérieur, d'autant plus qu'on monte ; les pointes frémissent (s'ouvrent et se
      // referment d'un pixel)
      const e = Math.round(A * t ** 1.6) + (t > 0.5 ? q : 0);
      for (let x = 0; x < CELL; x++) {
        const v = px[cr * CELL + x];
        if (!TOUTES[v] || (r < FRANGE && !BRINS[v])) continue;
        const dx = x < mil ? x - e : x + e, X = ox + dx;
        if (dx < -MARGE || dx >= CELL + MARGE) continue;
        out[r * W + X] = LUT[v];
      }
    }
  });
  return { data: new Uint8Array(out.buffer), w: W, h: HAUTEUR };
}
