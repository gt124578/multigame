// odyssee/js/render/relief3d.js — PROTOTYPE, actif seulement avec ?relief3d dans l'adresse : le sol du dehors en vrai
// relief. Sans ce paramètre, rien de ce fichier ne sert (le jeu reste celui d'avant, pixel pour pixel).
//
// La grille du jeu reste la seule vérité (collisions, marches, hautes herbes) : seul le dessin change.
//  1. Hauteurs fines : 4 × 4 sommets par case. Chaque case a un niveau (GameMap.hg, relief.js, montagnes.js) ; les cases
//     où l'on se tient (herbe, chemins, villes) sont des replats, les parois (T.CLIFF), les marches (T.STAIRS) et le bord
//     des replats sont des pentes : la hauteur d'un sommet en pente est interpolée entre les replats voisins (inverse de
//     la distance). La bande de pente est placée selon les cases : dans la paroi pour une falaise, à cheval sur le bord
//     entre deux pelouses (pente douce), au bord de la roche pour une montagne (paroi raide), et jamais assez raide, du côté
//     nord d'une butte, pour cacher une case où l'on marche.
//  2. Le sol généré (solgen.js, 32 px par case) est plaqué sur ce maillage, coordonnées de texture alignées sur les cases.
//  3. Les pentes raides (parois) reçoivent par-dessus une texture de paroi striée façon HeartGold, plaquée comme vue de la
//     caméra (u = x, v = position à l'écran) : un pixel de texture = un pixel d'écran, sans étirement, quelle que soit la
//     pente (la « texture déformée » du joueur). Lèvre d'herbe et arête claire en haut, pied sombre en bas.
//  4. Ombrage par paliers nets (lumière en haut à gauche), tramé sur la grille des pixels de texture.
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { ravin, mont, pente } from '../world/relief.js';
import { ROCHES } from './relief-tex.js';

const EL = 55 * Math.PI / 180, TAN = Math.tan(EL);
const params = () => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } };
/** le prototype est-il demandé ? (?relief3d dans l'adresse) */
export const facettesActives = () => !params().has('r3plat');
let MAT_FAC = null;
export function matFacettes() { return MAT_FAC || (MAT_FAC = new THREE.MeshBasicMaterial({ vertexColors: true })); }
export function relief3dActif() { return params().has('relief3d'); }
const num = (k, d) => { const v = params().get(k); return v == null || v === '' || isNaN(+v) ? d : +v; };

export const RN = 4;                 // sommets par case (dans chaque sens)
const CH = 16;                       // taille d'un bloc de carte (comme world3d.js)
const P = 8;                         // sommets de marge autour d'un bloc (gradients, parois qui commencent au-dessus)
export const KLV = num('r3k', 0.75); // hauteur d'un niveau, en cases d'écran
export const LV = KLV * TAN;         // … en unités du monde
const PENTE_PAROI = num('r3t', 0.75);   // pente (dy / dx) au-delà de laquelle le sol devient une paroi
const PENTE_DOUCE_MAX = 1.6;            // … entre deux replats où l'on marche (pelouse, chemin) : bien plus raide
const WD = 0.16 * LV;                // l'eau est un peu plus basse que la berge
const RAVIN = -3.2 * LV;             // fond d'un ravin
const DOUX = 1.5;                    // largeur (cases) d'une pente douce entre deux replats d'un niveau d'écart
const ROC = 0.42;
const GAMMA_STRATES = num('r3g', 1.8);   // > 1 : strates espacées en haut, serrées vers le pied (perspective)
const PAS_STRATES = num('r3s', 9);
const SERRE = num('r3p', 1.7);   // > 1 : la texture de la paroi se tasse vers le pied (perspective) ; 1 : régulière
const SOMBRE = num('r3d', 0.65);  // assombrissement au pied (0 : aucun)       // espacement des strates (pixels « déroulés » de la paroi)                    // largeur de la paroi d'un gradin de roche (dans la case de roche)
const NORD = 0.7;                    // pente maximale (× tan de la caméra) d'un versant tourné vers le nord

// sortes de cases
const W = 0, TR = 1, B = 2, R = 3, EAU = 4, V = 5, C = 6, S = 7;
const LIBRE = (c) => c === C || c === S;

/* ------------------------------------------------------------------ parois et marches (textures) --------------------- */
const TUILE = 64;
export const MURS = ['terre', 'montagne', 'glace', 'ocre', 'magma', 'mer', 'lune'];
const MARCHES = ['m_terre', 'm_roche', 'm_neige'];
const TUILES = [...MURS, ...MARCHES];
const hash = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// terre des talus d'herbe : brun chaud des falaises de HeartGold
const PALS = { ...ROCHES, terre: ['#3a2414', '#5c3b20', '#7c552e', '#9c703e', '#bb8d52', '#d8ae72'] };

/** paroi striée verticalement (64 × 64, raccord dans les deux sens) : colonnes de 4 à 9 px, bord gauche éclairé, creux
 *  sombre à droite, ressauts d'un pixel et quelques cassures horizontales */
function paroi(pal, seed) {
  const px = new Uint8Array(TUILE * TUILE);   // indices de palette
  // colonnes
  const cols = []; let x = 0, k = 0;
  while (x < TUILE) { let w = 4 + Math.floor(hash(k, 1, seed) * 6); if (TUILE - (x + w) < 4) w = TUILE - x; cols.push([x, w, hash(k, 2, seed)]); x += w; k++; }
  // ressauts : décalage (−1, 0, 1) de chaque bord de colonne, par tronçons de 5 à 12 rangées
  const jog = cols.map((_, i) => {
    const out = new Int8Array(TUILE); let y = 0, j = 0, v = 0;
    while (y < TUILE) { const n = 5 + Math.floor(hash(i, j, seed + 7) * 8); for (let t = 0; t < n && y < TUILE; t++, y++) out[y] = v; j++; v = Math.max(-1, Math.min(1, v + (hash(i, j, seed + 9) < 0.5 ? -1 : 1))); }
    out[TUILE - 1] = 0; out[0] = 0; return out;
  });
  for (let y = 0; y < TUILE; y++) for (let i = 0; i < cols.length; i++) {
    const [x0, w, v] = cols[i], a = x0 + jog[i][y], b = x0 + w + jog[(i + 1) % cols.length][y];
    const base = v < 0.3 ? 2 : v < 0.8 ? 3 : 4;
    for (let xx = a; xx < b; xx++) {
      const r = xx - a, X = ((xx % TUILE) + TUILE) % TUILE;
      let c = base;
      if (r === 0) c = 1;                         // le creux entre deux colonnes
      else if (r === 1) c = Math.min(5, base + 1); // bord gauche éclairé
      else if (r >= b - a - 1) c = Math.max(1, base - 1);
      else if (hash(X, y, seed + 3) < 0.06) c = Math.max(1, base - 1);   // grain
      px[y * TUILE + X] = c;
    }
  }
  // cassures : un trait sombre en travers d'une colonne, la lumière dessous
  for (let n = 0; n < 4; n++) {
    const i = Math.floor(hash(n, 5, seed) * cols.length), y = Math.floor(hash(n, 6, seed) * TUILE), [x0, w] = cols[i];
    const a = x0 + 1 + Math.floor(hash(n, 8, seed) * 2), e = Math.min(x0 + w - 1, a + 2 + Math.floor(hash(n, 9, seed) * 3));
    for (let xx = a; xx < e; xx++) { const X = xx % TUILE, yy = (y + (xx - a > 1 ? 1 : 0)) % TUILE; px[yy * TUILE + X] = 1; px[((yy + 1) % TUILE) * TUILE + X] = 4; }
  }
  return px.map((c) => c);   // indices
}
/** marches (64 de large, 16 de haut répétés) : giron clair, contremarche, ombre ; bords des joues tous les 32 px */
function marches(pal) {
  const px = new Uint8Array(TUILE * TUILE);
  for (let y = 0; y < TUILE; y++) for (let x = 0; x < TUILE; x++) {
    const r = y % 8, xl = x % 32;
    let c = r < 2 ? 5 : r < 3 ? 4 : r < 6 ? 3 : r < 7 ? 2 : 0;
    if (xl === 0 || xl === 31) c = 1; else if (xl === 1 || xl === 30) c = Math.min(c, 2);
    if (r >= 2 && r < 6 && hash(x, y, 31) < 0.08) c = 2;
    px[y * TUILE + x] = c;
  }
  return px;
}
let ATLAS = null;
/** atlas des parois et des marches (une tuile de 64 × 64 par sorte, empilées) */
function atlas() {
  if (ATLAS) return ATLAS;
  const n = TUILES.length, c = document.createElement('canvas'); c.width = TUILE; c.height = TUILE * n;
  const x = c.getContext('2d'), im = x.createImageData(TUILE, TUILE * n);
  TUILES.forEach((k, t) => {
    const pal = (k === 'm_terre' ? ['#3a2a1c', '#5a4028', '#7a5a38', '#9a7650', '#b89468', '#d6b88c'] : k === 'm_roche' ? PALS.montagne : k === 'm_neige' ? PALS.glace : PALS[k] || PALS.montagne).map(rgb);
    const px = k.startsWith('m_') ? marches(pal) : paroi(pal, 17 + t * 31);
    for (let i = 0; i < px.length; i++) { const o = (t * TUILE * TUILE + i) * 4, cc = pal[px[i]]; im.data[o] = cc[0]; im.data[o + 1] = cc[1]; im.data[o + 2] = cc[2]; im.data[o + 3] = 255; }
  });
  x.putImageData(im, 0, 0);
  const tex = new THREE.Texture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  ATLAS = { tex, n };
  return ATLAS;
}
// lèvres (herbe en haut des talus), par thème de zone
const LEVRE = { herbe: '#4a9a40', foret: '#2f7234', neige: '#e8f0f8', sable: '#dcc488', cendre: '#7a7470', automne: '#b8782e' };

/* ------------------------------------------------------------------ ombrage (shaders) -------------------------------- */
// trame de Bayer 4 × 4, sur la grille des pixels de texture (le motif suit le monde, il ne glisse pas sous la caméra)
const GLSL_COMMUN = `
float r3Bayer(vec2 p) { p = mod(floor(p), 4.0); int i = int(p.x) + int(p.y) * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }
// paliers nets d'éclairage : lumière en haut à gauche (ouest, et un peu du côté de la caméra), le plat vaut 1
float r3Palier(vec3 n, float bay) {
  vec3 L = normalize(vec3(-0.5, 1.0, 0.35));
  // l'écart au plat est accentué : une butte douce se lit toute seule
  float f = 1.0 + 1.8 * (dot(normalize(n), L) / L.y - 1.0) + (bay - 0.5) * 0.06;
  return f < 0.45 ? 0.68 : f < 0.72 ? 0.78 : f < 0.92 ? 0.89 : f < 1.06 ? 1.0 : 1.1;
}
// fond des ravins : la roche s'assombrit avec la profondeur
float r3Fond(float y) { return clamp(1.0 + y / ${(-RAVIN * 0.95).toFixed(4)}, 0.0, 1.0); }`;

/** sol généré posé sur le relief : paliers d'ombre selon la pente, herbe plus sombre au pied des parois */
export function matSol(mat, w, h) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTx = { value: new THREE.Vector2(w, h) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 nrm; attribute float pied; varying vec3 vNrm; varying float vPied; varying float vY; varying vec2 vTx; uniform vec2 uTx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNrm = nrm; vPied = pied; vY = transformed.y; vTx = uv * uTx;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNrm; varying float vPied; varying float vY; varying vec2 vTx;' + GLSL_COMMUN)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float bay = r3Bayer(vTx);
        float q = r3Palier(vNrm, bay);
        if (vPied < 14.0 && (1.0 - vPied / 14.0) * 1.15 > bay) q *= 0.8;
        diffuseColor.rgb *= q * r3Fond(vY);`);
  };
  mat.customProgramCacheKey = () => 'r3sol';
  return mat;
}
let MAT_PAROI = null;
/** matériau des parois (partagé) */
export function matParoi() {
  if (MAT_PAROI) return MAT_PAROI;
  const A = atlas();
  const mat = new THREE.MeshBasicMaterial({ map: A.tex, side: THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 suv; attribute float tuile; attribute vec2 hb; attribute vec3 nrm; attribute vec4 levre;\nvarying vec2 vSuv; varying float vTuile; varying vec2 vHb; varying vec3 vNrm; varying vec4 vLevre; varying float vY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuv = suv; vTuile = tuile; vHb = hb; vNrm = nrm; vLevre = levre; vY = transformed.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSuv; varying float vTuile; varying vec2 vHb; varying vec3 vNrm; varying vec4 vLevre; varying float vY;' + GLSL_COMMUN)
      .replace('#include <map_fragment>', `
        if (vHb.x < 0.0 || vHb.y < 0.0) discard;
        // perspective : le haut de la paroi est plus près de la caméra que son pied, les stries s'y resserrent
        float sP = clamp(vHb.x / max(vHb.x + vHb.y, 1.0), 0.0, 1.0);
        // la hauteur de la paroi se tasse vers le pied (plus loin de la caméra) : la texture y est plus serrée
        float hP = max(vHb.x + vHb.y, 1.0);
        vec2 tp = floor(vec2(vSuv.x, vSuv.y - vHb.x + hP * pow(sP, ${SERRE.toFixed(3)}) * (1.0 + 0.0 * sP)));
        vec2 tuv = vec2((mod(tp.x, ${TUILE}.0) + 0.5) / ${TUILE}.0, (mod(tp.y, ${TUILE}.0) + 0.5 + floor(vTuile + 0.5) * ${TUILE}.0) / ${(TUILE * A.n).toFixed(1)});
        vec3 col = texture2D(map, tuv).rgb;
        float bay = r3Bayer(tp);
        float hl = fract(sin(tp.x * 12.9898 + 4.1) * 43758.5453);
        // lèvre (herbe, neige, sable) qui déborde sur 1 à 4 pixels, puis l'arête claire
        float lv = vLevre.a > 0.5 ? 1.0 + floor(hl * 4.0) : 0.0;
        float edge = 1.0;
        if (vHb.x < lv) { col = vLevre.rgb * (vHb.x > lv - 1.0 ? 0.74 : 1.0); edge = 0.0; }
        else if (vHb.x < lv + 2.0) col = min(vec3(1.0), col * 1.3 + 0.04);
        // profondeur : strates horizontales qui se resserrent vers le haut (la paroi fuit vers le haut, comme vue en
        // perspective), puis dégradé de lumière, clair sous la lèvre et sombre au pied, en paliers tramés
        float hT = max(vHb.x + vHb.y, 1.0), s0 = clamp(vHb.x / hT, 0.0, 1.0);
        if (edge > 0.5 && vTuile < ${MURS.length}.0 - 0.5) {
          float G = ${GAMMA_STRATES.toFixed(3)}, L = ${PAS_STRATES.toFixed(2)};
          float w0 = hT * pow(s0, G), w1 = hT * pow(clamp((vHb.x + 1.0) / hT, 0.0, 1.0), G), wm = hT * pow(clamp((vHb.x - 1.0) / hT, 0.0, 1.0), G);
          float jit = floor(fract(sin(floor(vSuv.x / 7.0) * 7.31) * 91.7) * 3.0);   // les strates ondulent un peu par colonne
          w0 += jit; w1 += jit; wm += jit;
          if (floor(w1 / L) != floor(w0 / L) && vHb.x > 3.0) col *= 0.6;           // le pli sombre d'une strate
          else if (floor(wm / L) != floor(w0 / L) && vHb.x > 3.0) col = min(vec3(1.0), col * 1.2 + 0.03);   // le rebord éclairé dessous
          float g = 1.12 - ${SOMBRE.toFixed(3)} * pow(s0, 0.8);
          float lvl = floor((g - 0.46) / 0.165 + bay * 0.9);
          col *= 0.46 + clamp(lvl, 0.0, 4.0) * 0.165;
        }
        // pied sombre
        if (vHb.y < 2.0) col *= 0.55; else if (vHb.y < 4.0 && bay < 0.6) col *= 0.75;
        float q = edge > 0.5 ? r3Palier(vNrm, bay) : 1.0;
        diffuseColor.rgb *= col * q * r3Fond(vY);`);
  };
  mat.customProgramCacheKey = () => 'r3paroi';
  MAT_PAROI = mat;
  return mat;
}

/* ------------------------------------------------------------------ carte des hauteurs ------------------------------- */
export class Relief3D {
  /**
   * map : la carte vue par le rendu (vueCarte de world3d.js) ; o.ville : identifiant de la ville posée sur un plateau
   * pour la démonstration (zone.town), o.levee : de combien de niveaux elle monte
   */
  constructor(map, o = {}) {
    this.m = map; this.base = map.base || map;
    this.M = 56;   // cases de marge autour de la carte (la région continue au-delà des bords)
    this.LW = map.w + 2 * this.M; this.LH = map.h + 2 * this.M;
    const n = this.LW * this.LH;
    this.sorte = new Int8Array(n).fill(-1); this.niv = new Float32Array(n);
    this.ins = new Float32Array(n * 4).fill(-1);   // retraits nord, est, sud, ouest du replat de chaque case (-1 : pas calculé)
    this.blocs = new Map();
    this.ville = null;
    const id = o.ville ?? params().get('r3ville') ?? 'sylve';
    const z = id && map.zones?.find((q) => q.town === id && q.x1 - q.x0 > 10);
    if (z) this.ville = this.plateauVille(z, o.levee ?? num('r3levee', 1.5));
  }

  /* --- ville de démonstration : sa zone monte de `levee` niveaux, les routes qui en sortent descendent en pente douce --- */
  plateauVille(z, levee) {
    const m = this.base, rampe = new Map(), q = [];
    const dans = (x, y) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
    const route = (t) => t === T.PATH || t === T.PAVE || t === T.BRIDGE || t === T.STAIRS || t === T.SAND;
    for (let y = z.y0 - 1; y <= z.y1 + 1; y++) for (let x = z.x0 - 1; x <= z.x1 + 1; x++) {
      if (dans(x, y) || !m.in(x, y) || !route(m.get(x, y))) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => dans(x + a, y + b))) { rampe.set(x + ',' + y, 1); q.push([x, y]); }
    }
    const D = 8;
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i], d = rampe.get(x + ',' + y);
      if (d >= D) continue;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + a, Y = y + b, k = X + ',' + Y;
        if (!m.in(X, Y) || dans(X, Y) || rampe.has(k) || !route(m.get(X, Y))) continue;
        rampe.set(k, d + 1); q.push([X, Y]);
      }
    }
    return { z, levee: levee * LV, rampe, D, dans };
  }
  /** levée de la ville (unités du monde) pour une case : la zone entière, puis la rampe des routes et ses abords */
  leveeVille(x, y) {
    const v = this.ville; if (!v) return 0;
    if (v.dans(x, y)) return v.levee;
    let best = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const d = v.rampe.get((x + a) + ',' + (y + b)); if (d == null) continue;
      const dd = d + Math.max(Math.abs(a), Math.abs(b)) * 0.5;
      best = Math.max(best, v.levee * Math.max(0, 1 - dd / (v.D + 1)));
    }
    return best;
  }

  anneauVille(x, y) {
    const v = this.ville; if (!v || v.dans(x, y)) return false;
    const z = v.z; if (x < z.x0 - 1 || x > z.x1 + 1 || y < z.y0 - 1 || y > z.y1 + 1) return false;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (v.rampe.has((x + a) + ',' + (y + b))) return false;
    return true;
  }
  /** hauteur où se tient un personnage en (x, z) : celle du sol, ou du tablier d'une passerelle au-dessus d'un ravin */
  Hmarche(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z), b = this.base;
    if (b.in(cx, cz) && b.get(cx, cz) === T.BRIDGE && ravin(b, cx, cz)) return b.height(cx, cz) * LV + this.leveeVille(cx, cz);
    return this.H(x, z);
  }
  /** le point (x, z) est-il sur une paroi (case de falaise, ou pente raide) ? */
  surParoi(x, z) { const s = this.sorteDe(Math.floor(x), Math.floor(z)); if (s === C) return true; const e = 0.25; return Math.hypot(this.H(x + e, z) - this.H(x - e, z), this.H(x, z + e) - this.H(x, z - e)) / (2 * e) > PENTE_DOUCE_MAX; }
  /** hauteur où poser un sprite (arbre, rocher) : sur une paroi, le haut de sa case (il se tient au bord du replat) */
  Hpose(x, z) {
    if (this.sorteDe(Math.floor(x), Math.floor(z)) !== C) return this.H(x, z);
    const cx = Math.floor(x), cz = Math.floor(z);
    return Math.max(this.H(cx, cz), this.H(cx + 1, cz), this.H(cx + 0.5, cz), this.H(cx, cz + 1), this.H(cx + 1, cz + 1));
  }
  idx(x, y) { const X = Math.max(0, Math.min(this.LW - 1, x + this.M)), Y = Math.max(0, Math.min(this.LH - 1, y + this.M)); return Y * this.LW + X; }
  /** sorte et niveau (unités du monde) d'une case */
  cell(x, y) {
    const i = this.idx(x, y);
    if (this.sorte[i] < 0) {
      const m = this.m, b = this.base, dans = b.in(x, y), t = m.get(x, y);
      const cx = Math.max(0, Math.min(b.w - 1, x)), cy = Math.max(0, Math.min(b.h - 1, y)), hg = b.height(cx, cy);
      let s = W, L = hg * LV;
      if (dans && ravin(b, x, y) && (t === T.CAVEWALL || t === T.BRIDGE)) { s = V; L = RAVIN; }
      else switch (t) {
        case T.CLIFF: s = C; break;
        case T.STAIRS: s = S; break;
        case T.CAVEWALL: s = R; L = this.niveauRoche(x, y, hg) * LV; break;
        case T.WATER: case T.WHIRL: s = EAU; L = hg * LV - WD; break;
        case T.BUILD: s = B; break;
        case T.DOOR: s = B; break;
        case T.TREE: case T.PINE: case T.BUSH: case T.ROCK: case T.CUT: case T.SMASH: case T.BOULDER: case T.FENCE: s = TR; break;
        default: s = W;
      }
      // l'entrée d'une grotte : un replat au pied de la roche (la bouche est peinte sur la paroi)
      if (s === R && this.porteGrotte(x, y)) { s = W; L = hg * LV; }
      if (s !== V) L += this.leveeVille(x, y);
      // le tour de la ville (hors des rampes) : une paroi
      if (this.anneauVille(x, y) && s !== EAU && s !== B) s = C;
      this.sorte[i] = s; this.niv[i] = L;
    }
    return i;
  }
  porteGrotte(x, y) {
    if (!this._portes) { this._portes = new Set(); for (const b of this.base.buildings || []) if (b.kind === 'cave') this._portes.add(b.doorX + ',' + b.doorY); }
    return this._portes.has(x + ',' + y);
  }
  /** niveau d'une case de roche : celui du jeu (montagnes, massifs), sinon des gradins selon la distance au pied */
  niveauRoche(x, y, hg) {
    const b = this.base;
    if (b.in(x, y) && (mont(b, x, y) || hg > 0)) return hg;
    let d = 9;
    for (let r = 1; r <= 5 && d === 9; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      if (this.m.get(x + i, y + j) !== T.CAVEWALL) { d = r; break; }
    }
    return hg + 1 + Math.min(2, Math.floor((d - 1) / 2));
  }
  sorteDe(x, y) { return this.sorte[this.cell(x, y)]; }
  nivDe(x, y) { return this.niv[this.cell(x, y)]; }

  /** bande de pente entre une case haute et une case basse voisine (dir : direction de la haute vers la basse) :
   *  [retrait dans la haute, retrait dans la basse], en cases */
  bande(sh, sl, dir, dl) {
    if (dl < 0.01 || LIBRE(sh) || LIBRE(sl)) return [0, 0];
    let a = 0, b = 0;
    if (sl === V) b = 0.12;
    else if (sl === EAU) b = 0.22;
    else if (sh === EAU) a = 0.2;
    else if (sh === B) b = Math.min(0.98, DOUX * Math.min(1.5, dl));
    else if (sl === B) a = Math.min(0.98, DOUX * Math.min(1.5, dl));
    else if (sh === R) a = ROC;
    else if (sl === R) b = ROC;
    else { const w = DOUX * Math.min(1.5, Math.max(0.6, dl)); a = b = w / 2; }
    // versant tourné vers le nord (la case basse est au nord) : jamais assez raide pour cacher ce qui est derrière
    if (dir === 0) {
      const min = dl * KLV / NORD;
      if (a + b < min) { if (sh !== B) a = Math.min(0.98, min - b); else b = Math.min(0.98, min - a); }
    }
    return [a, b];
  }
  /** retraits (nord, est, sud, ouest) du replat d'une case ; null pour une case libre (paroi, marche) */
  retraits(x, y) {
    const i = this.cell(x, y), s = this.sorte[i];
    if (LIBRE(s)) return null;
    if (this.ins[i * 4] < 0) {
      const L = this.niv[i];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => {
        const j = this.cell(x + dx, y + dy), Ln = this.niv[j], sn = this.sorte[j];
        let v;
        if (Math.abs(L - Ln) < 1e-4) v = 0;
        else if (L > Ln) v = this.bande(s, sn, d, (L - Ln) / LV)[0];
        else v = this.bande(sn, s, (d + 2) % 4, (Ln - L) / LV)[1];
        this.ins[i * 4 + d] = v;
      });
      // un replat garde au moins un peu de place
      for (const [a, b] of [[0, 2], [1, 3]]) { const s2 = this.ins[i * 4 + a] + this.ins[i * 4 + b]; if (s2 > 0.96) { this.ins[i * 4 + a] *= 0.96 / s2; this.ins[i * 4 + b] *= 0.96 / s2; } }
    }
    return this.ins.subarray(i * 4, i * 4 + 4);
  }

  /** hauteur d'un sommet (px, pz) : celle du replat qui le contient, sinon interpolée entre les replats voisins */
  sommet(px, pz) {
    const cx = Math.floor(px), cz = Math.floor(pz);
    // cas courant : le sommet est dans le replat de toutes les cases qui le touchent
    {
      const xs = px - cx < 1e-6 ? [cx - 1, cx] : [cx], zs = pz - cz < 1e-6 ? [cz - 1, cz] : [cz];
      let ok = true, Lm = -Infinity;
      for (const y of zs) for (const x of xs) {
        const r = this.retraits(x, y); if (!r) { ok = false; break; }
        if (px < x + r[3] - 1e-6 || px > x + 1 - r[1] + 1e-6 || pz < y + r[0] - 1e-6 || pz > y + 1 - r[2] + 1e-6) { ok = false; break; }
        Lm = Math.max(Lm, this.niv[this.cell(x, y)]);
      }
      if (ok) return Lm;
    }
    let dedans = -Infinity; const lv = [], dv = [];
    for (let y = cz - 3; y <= cz + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const r = this.retraits(x, y); if (!r) continue;
      const x0 = x + r[3], x1 = x + 1 - r[1], z0 = y + r[0], z1 = y + 1 - r[2];
      const dx = Math.max(x0 - px, 0, px - x1), dz = Math.max(z0 - pz, 0, pz - z1);
      const L = this.niv[this.cell(x, y)];
      if (dx < 1e-6 && dz < 1e-6) { if (L > dedans) dedans = L; continue; }
      const d = Math.hypot(dx, dz);
      let k = 0; while (k < lv.length && Math.abs(lv[k] - L) > 1e-4) k++;
      if (k === lv.length) { lv.push(L); dv.push(d); } else if (d < dv[k]) dv[k] = d;
    }
    if (dedans > -Infinity) return dedans;
    if (!lv.length) return this.nivDe(cx, cz);
    let s = 0, sw = 0;
    for (let k = 0; k < lv.length; k++) { const w = 1 / (dv[k] + 1e-6); s += lv[k] * w; sw += w; }
    return s / sw;
  }

  /** hauteurs d'un bloc (sommets de la case ci·16 − P/4 à … , (16·RN + 1 + 2P)²), gardées */
  bloc(ci, cj) {
    const k = ci + ',' + cj; let b = this.blocs.get(k);
    if (b) return b;
    const N = CH * RN + 1 + 2 * P, h = new Float32Array(N * N), x0 = ci * CH, z0 = cj * CH;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = this.sommet(x0 + (i - P) / RN, z0 + (j - P) / RN);
    b = { h, N, x0, z0 };
    this.blocs.set(k, b);
    return b;
  }
  /** hauteur du sol en (x, z) (mêmes triangles que le maillage) */
  H(x, z) {
    const ci = Math.floor(x / CH), cj = Math.floor(z / CH), b = this.bloc(ci, cj);
    const fi = (x - b.x0) * RN + P, fj = (z - b.z0) * RN + P;
    const i = Math.min(b.N - 2, Math.max(0, Math.floor(fi))), j = Math.min(b.N - 2, Math.max(0, Math.floor(fj)));
    const fx = fi - i, fz = fj - j, at = (a, c) => b.h[c * b.N + a];
    const Ha = at(i, j + 1), Hb = at(i + 1, j + 1), Hc = at(i + 1, j), Hd = at(i, j);
    return fx + fz >= 1 ? Ha + fx * (Hb - Ha) + (1 - fz) * (Hc - Hb) : Ha + (1 - fz) * (Hd - Ha) + fx * (Hc - Hd);
  }
  /** niveau (unités du monde) où poser un bâtiment : celui de sa porte, sinon de son coin */
  niveauBatiment(b) { return b.doorX != null ? this.nivDe(b.doorX, b.doorY) : this.nivDe(b.x, b.y + b.d - 1); }

  /* ------------------------------------------------------------------ attributs d'un bloc ---------------------------- */
  /** normales, parois (sommets raides), position à l'écran, distances au haut et au bas de chaque paroi, pied */
  details(ci, cj) {
    const b = this.bloc(ci, cj);
    if (b.det) return b.det;
    const { h, N } = b, n = N * N, e = 1 / RN;
    const gx = new Float32Array(n), gz = new Float32Array(n), raide = new Uint8Array(n), ecran = new Float32Array(n);
    const ht = new Float32Array(n).fill(-64), hbas = new Float32Array(n).fill(-64), pied = new Float32Array(n).fill(99);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, at = (a, c) => h[Math.max(0, Math.min(N - 1, c)) * N + Math.max(0, Math.min(N - 1, a))];
      gx[k] = (at(i + 1, j) - at(i - 1, j)) / (2 * e); gz[k] = (at(i, j + 1) - at(i, j - 1)) / (2 * e);
      const g = Math.hypot(gx[k], gz[k]);
      // une paroi : assez raide, et pas tournée vers le nord (ces versants-là restent du sol, vus de biais) ; entre deux
      // pelouses (pente douce), seulement si c'est vraiment abrupt
      const sc = this.sorteDe(Math.floor(b.x0 + (i - P) * e + 1e-4), Math.floor(b.z0 + (j - P) * e + 1e-4));
      const seuil = sc === W || sc === TR || sc === B || sc === EAU ? PENTE_DOUCE_MAX : PENTE_PAROI;
      raide[k] = g > seuil && !(gz[k] > 0.7 * g) ? 1 : 0;
      ecran[k] = ((b.z0 + (j - P) * e) - h[k] / TAN) * 32;
    }
    // le long de chaque colonne de sommets, du nord au sud : suites de sommets raides (une paroi), haut et bas
    // placés là où la pente passe le seuil (interpolé : bords réguliers)
    const g = (k) => Math.hypot(gx[k], gz[k]);
    for (let i = 0; i < N; i++) {
      let j = 0;
      while (j < N) {
        if (!raide[j * N + i]) { j++; continue; }
        let j1 = j; while (j1 + 1 < N && raide[(j1 + 1) * N + i]) j1++;
        const k0 = j * N + i, k1 = j1 * N + i;
        const croise = (ka, kb) => { const ga = g(ka), gb = g(kb), t = Math.max(0, Math.min(1, (PENTE_PAROI - ga) / (gb - ga || 1))); return ecran[ka] + (ecran[kb] - ecran[ka]) * t; };
        const top = j > 0 ? croise(k0 - N, k0) : -1e4, bot = j1 < N - 1 ? croise(k1 + N, k1) : 1e4;
        for (let jj = Math.max(0, j - 1); jj <= Math.min(N - 1, j1 + 1); jj++) {
          const k = jj * N + i, a = ecran[k] - top, c = bot - ecran[k];
          // un sommet entre deux parois proches : on garde la plus proche
          if (raide[k] || ht[k] === -64 || Math.min(a, c) > Math.min(ht[k], hbas[k])) { ht[k] = a; hbas[k] = c; }
        }
        // herbe plus sombre au pied de la paroi
        for (let jj = j1 + 1; jj < N; jj++) { const k = jj * N + i, d = ecran[k] - bot; if (d > 16 || raide[k]) break; pied[k] = Math.min(pied[k], Math.max(0, d)); }
        j = j1 + 1;
      }
    }
    b.det = { gx, gz, raide, ecran, ht, hbas, pied };
    return b.det;
  }

  /** maillage du sol généré d'un bloc (bw × bh cases) : position, uv (alignées sur les cases), normale, pied */
  geoSol(ci, cj, bw, bh) {
    const b = this.bloc(ci, cj), D = this.details(ci, cj), nx = bw * RN + 1, nz = bh * RN + 1;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), nrm = new Float32Array(nx * nz * 3), pied = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i, k = (j + P) * b.N + i + P;
      pos[v * 3] = b.x0 + i / RN; pos[v * 3 + 1] = b.h[k]; pos[v * 3 + 2] = b.z0 + j / RN;
      uv[v * 2] = i / (nx - 1); uv[v * 2 + 1] = j / (nz - 1);
      const l = Math.hypot(D.gx[k], 1, D.gz[k]); nrm[v * 3] = -D.gx[k] / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -D.gz[k] / l;
      pied[v] = D.pied[k];
    }
    // les cases plates (25 sommets à la même hauteur) sont fusionnées par rangées : deux triangles au lieu de 32 ; leurs
    // bords tombent sur des sommets de la même hauteur que les cases voisines (pas de fente)
    const idx = [], plate = new Uint8Array(bw * bh);
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw; cx++) {
      const h0 = pos[((cy * RN) * nx + cx * RN) * 3 + 1]; let ok = true;
      for (let j = 0; j <= RN && ok; j++) for (let i = 0; i <= RN; i++) { const v = ((cy * RN + j) * nx) + cx * RN + i; if (Math.abs(pos[v * 3 + 1] - h0) > 1e-5 || pied[v] < 99 || nrm[v * 3 + 1] < 0.9999) { ok = false; break; } }
      plate[cy * bw + cx] = ok ? 1 : 0;
    }
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw;) {
      if (plate[cy * bw + cx]) {
        const h0 = pos[((cy * RN) * nx + cx * RN) * 3 + 1];
        let ex = cx + 1; while (ex < bw && plate[cy * bw + ex] && Math.abs(pos[((cy * RN) * nx + ex * RN) * 3 + 1] - h0) < 1e-5) ex++;
        const d = cy * RN * nx + cx * RN, c = cy * RN * nx + ex * RN, a = d + RN * nx, bb = c + RN * nx;
        idx.push(a, bb, c, a, c, d); cx = ex; continue;
      }
      for (let j = cy * RN; j < (cy + 1) * RN; j++) for (let i = cx * RN; i < (cx + 1) * RN; i++) {
        const d = j * nx + i, c = d + 1, a = d + nx, bb = a + 1;   // a = sud-ouest, bb = sud-est, c = nord-est, d = nord-ouest
        idx.push(a, bb, c, a, c, d);
      }
      cx++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('nrm', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('pied', new THREE.BufferAttribute(pied, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }

  /** sorte de paroi (tuile de l'atlas) et lèvre d'une facette dans la case (x, y) */
  paroiDe(x, y) {
    const s = this.sorteDe(x, y), b = this.base, z = this.m.zoneAt?.(x, y), th = z?.theme;
    const bio = (k) => MURS.indexOf(k) >= 0 ? MURS.indexOf(k) : 1;
    const roche = () => bio(z?.roche || (th === 'snow' ? 'glace' : th === 'volcanic' ? 'magma' : th === 'canyon' || th === 'desert' ? 'ocre' : 'montagne'));
    const lev = th === 'snow' ? LEVRE.neige : th === 'desert' || th === 'canyon' ? LEVRE.sable : th === 'volcanic' ? LEVRE.cendre : th === 'forest' || th === 'foretsombre' ? LEVRE.foret : th === 'automne' ? LEVRE.automne : LEVRE.herbe;
    if (s === S) return { t: MURS.length + (b.in(x, y) && mont(b, x, y) ? (th === 'snow' ? 2 : 1) : 0), levre: null };
    if (s === R || s === V) return { t: roche(), levre: null };
    // la roche plus haute d'à côté donne sa paroi (sentier au pied d'une montagne)
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (this.sorteDe(x + dx, y + dy) === R && this.nivDe(x + dx, y + dy) > this.nivDe(x, y) + 1e-3) return { t: roche(), levre: null };
    if (s === C && b.in(x, y) && !pente(b, x, y) && !this.anneauVille(x, y)) {   // falaise d'un plateau de roche (canyons)
      const k = z?.roche || (th === 'snow' ? 'glace' : th === 'volcanic' ? 'magma' : th === 'canyon' || th === 'desert' ? 'ocre' : th === 'forest' || th === 'automne' ? 'terre' : 'montagne');
      return { t: bio(k), levre: k === 'terre' ? lev : null };
    }
    return { t: th === 'snow' ? bio('glace') : th === 'desert' || th === 'canyon' ? bio('ocre') : th === 'volcanic' ? bio('magma') : 0, levre: lev };
  }
  /** couche des parois d'un bloc : facettes proches d'une paroi, texture vue de la caméra (1 pixel = 1 pixel d'écran) */
  geoParois(ci, cj, bw, bh) {
    const b = this.bloc(ci, cj), D = this.details(ci, cj);
    const pos = [], suv = [], tuile = [], hb = [], nrm = [], lev = [], idx = []; let n = 0;
    const cache = new Map();
    for (let j = 0; j < bh * RN; j++) for (let i = 0; i < bw * RN; i++) {
      const ks = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]].map(([a, c]) => (c + P) * b.N + a + P);
      if (!ks.some((k) => D.ht[k] > -64)) continue;
      if (!ks.some((k) => D.ht[k] >= 0 && D.hbas[k] >= 0)) continue;
      const cx = b.x0 + Math.floor(i / RN), cz = b.z0 + Math.floor(j / RN), ck = cx + ',' + cz;
      let p = cache.get(ck); if (!p) { p = this.paroiDe(cx, cz); cache.set(ck, p); }
      const lc = p.levre ? rgb(p.levre).map((v) => (v / 255) ** 2.2) : [0, 0, 0];
      for (const [q, k] of ks.entries()) {
        const a = i + (q === 1 || q === 2 ? 1 : 0), c = j + (q < 2 ? 1 : 0), x = b.x0 + a / RN, z = b.z0 + c / RN;
        pos.push(x, b.h[k], z);
        // u : pixels le long de x ; marches : de 0 à 32 dans la case
        const u = p.t >= MURS.length ? (x - cx) * 32 + (cx & 1) * 32 : x * 32;
        suv.push(u, D.ecran[k]);
        tuile.push(p.t);
        hb.push(D.ht[k] > -64 ? D.ht[k] : -64, D.hbas[k] > -64 ? D.hbas[k] : -64);
        const l = Math.hypot(D.gx[k], 1, D.gz[k]); nrm.push(-D.gx[k] / l, 1 / l, -D.gz[k] / l);
        lev.push(lc[0], lc[1], lc[2], p.levre ? 1 : 0);
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    }
    if (!n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('suv', new THREE.Float32BufferAttribute(suv, 2));
    g.setAttribute('tuile', new THREE.Float32BufferAttribute(tuile, 1));
    g.setAttribute('hb', new THREE.Float32BufferAttribute(hb, 2));
    g.setAttribute('nrm', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('levre', new THREE.Float32BufferAttribute(lev, 4));
    g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }
  /** facettes de roche en vrai volume par-dessus les parois (?relief3d&r3f) : chaque intervalle entre deux colonnes de
   *  sommets d'une paroi devient un prisme en dents de scie (arête saillante vers la caméra, à une position et une
   *  profondeur tirées au hasard), bombé à mi-hauteur : la moitié haute regarde le ciel (claire), la moitié basse le
   *  sol (sombre), chaque pan prend sa propre lumière en paliers nets. Couleurs tirées de la palette du biome. */
  geoFacettes(ci, cj, bw, bh) {
    const b = this.bloc(ci, cj), D = this.details(ci, cj), N = b.N;
    const runs = [];   // par colonne de sommets : [{ t: k haut, b: k bas }]
    for (let i = 0; i <= bw * RN; i++) {
      const L = []; let j = 0;
      while (j <= bh * RN) {
        const k = (j + P) * N + i + P;
        if (!D.raide[k]) { j++; continue; }
        let j1 = j; while (j1 + 1 <= bh * RN && D.raide[(j1 + 1 + P) * N + i + P]) j1++;
        L.push({ t: (j - 1 + P) * N + i + P, b: (Math.min(j1 + 1, bh * RN + P - 1) + P) * N + i + P, j0: j - 1, j1: j1 + 1 });
        j = j1 + 1;
      }
      runs.push(L);
    }
    const pos = [], col = [], Lgt = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
    const P3 = (k, i, j) => new THREE.Vector3(b.x0 + i / RN, b.h[k], b.z0 + j / RN);
    const tri = (a, c, d, pal, haut) => {
      const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      if (n.z < 0) { n.negate(); [c, d] = [d, c]; }
      const f = n.dot(Lgt), lv = f > 0.62 ? 5 : f > 0.42 ? 4 : f > 0.2 ? 3 : f > 0.0 ? 2 : 1;
      const lvl = Math.max(0, Math.min(4, lv - (haut ? 0 : 2)));
      const cc = rgb(pal[lvl]).map((v) => (v / 255) ** 2.2);
      for (const v of [a, c, d]) { pos.push(v.x, v.y, v.z); col.push(...cc); }
    };
    for (let i = 0; i < bw * RN; i++) for (const r0 of runs[i]) {
      const r1 = runs[i + 1].find((r) => Math.abs(r.j0 - r0.j0) <= 2 && Math.abs(r.j1 - r0.j1) <= 3);
      if (!r1) continue;
      const cx = b.x0 + Math.floor(i / RN), cz = b.z0 + Math.floor(Math.max(r0.j0, 0) / RN);
      const pz = this.paroiDe(cx, cz + 1);
      if (pz.t >= MURS.length) continue;   // les marches gardent leur dessin
      const pal = PALS[MURS[pz.t]] || PALS.montagne;
      const T0 = P3(r0.t, i, r0.j0), B0 = P3(r0.b, i, r0.j1), T1 = P3(r1.t, i + 1, r1.j0), B1 = P3(r1.b, i + 1, r1.j1);
      // la lèvre (herbe, neige) reste visible : les facettes commencent un peu sous le haut de la paroi
      T0.lerp(B0, 0.14); T1.lerp(B1, 0.14);
      const hx = (b.x0 * RN + i) | 0, rnd = (s) => hash(hx, Math.round(cz), s);
      const tr = 0.3 + rnd(1) * 0.4, dep = 0.05 + rnd(2) * 0.12;
      const Tm = T0.clone().lerp(T1, tr), Bm = B0.clone().lerp(B1, tr);
      Tm.z += dep * 0.4; Bm.z += dep * 0.5;
      const mid = (a, c, e) => { const m = a.clone().lerp(c, 0.45); m.z += e; return m; };
      const M0 = mid(T0, B0, dep * 0.6), M1 = mid(T1, B1, dep * 0.6), Mm = mid(Tm, Bm, dep * 1.3);
      // quatre pans (gauche/droite × haut/bas), deux triangles chacun
      for (const [a, c, d, e, haut] of [[T0, Tm, Mm, M0, 1], [Tm, T1, M1, Mm, 1], [M0, Mm, Bm, B0, 0], [Mm, M1, B1, Bm, 0]]) { tri(a, c, d, pal, haut); tri(a, d, e, pal, haut); }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

}
