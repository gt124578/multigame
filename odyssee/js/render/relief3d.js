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
//  5. Pentes déroulées : sur une pente, le motif suit la vraie longueur de l'hypoténuse (v = z + le « reste »). Pentes de
//     roche des montagnes : le motif se lit dans une bande de roche seule, générée avec le sol (rendreRoche de solgen.js),
//     jamais dans le sentier d'à côté ; chaque gradin a son arête claire et son pied sombre (selon la hauteur dans le niveau).
//  6. Ravins : parois verticales (geoRavin) du bord jusqu'au fond, la roche plonge dans le noir ; facettes en volume.
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
export const modePente = () => params().get('r3pente') !== '0';   // par défaut : vraies pentes là où le relief est doux
const penteRoche = () => params().get('r3proche') !== '0';   // les montagnes de roche (hors neige, canyon, volcan) aussi
// tuiles inclinées des pentes : texture répétée, plaquée selon la vraie longueur de la pente (pas d'étirement)
const TUILES_PENTE = { herbe: 'grass0', foret: 'forest0', automne: 'leaves0', roche: 'cave0' };
const MATS_PENTE = new Map();
export function matPente(k) {
  if (MATS_PENTE.has(k)) return MATS_PENTE.get(k);
  const t = new THREE.TextureLoader().load(new URL('../../img/sol32/' + TUILES_PENTE[k] + '.png', import.meta.url).href);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, vertexColors: true }); MATS_PENTE.set(k, m); return m;
}
export const matsPente = () => [...MATS_PENTE.values()];
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
const FOND_RAVIN = num('r3fond', 9);   // profondeur (niveaux) où la paroi d'un ravin a plongé dans le noir
const LISSE = num('r3lisse', 0), LISSE_K = num('r3lk2', 1);
const DOUX = num('r3doux', 1.5);      // largeur (cases) d'une pente douce entre deux replats d'un niveau d'écart
const ROC = num('r3roc', 0.42);   // largeur de la paroi d'un gradin de roche abrupt (neige, canyon, volcan)
const ROC_PENTE = num('r3rocp', 0.95);   // … d'un gradin de roche en pente (montagnes ordinaires)
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
float r3Hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float r3Fond(float y) { return clamp(1.0 + y / ${(-RAVIN * 0.95).toFixed(4)}, 0.0, 1.0); }`;

/* ESSAIS (?r3tal=lum,arete,pied,frange,courbes,hachures,sec,terre,tout) : comment faire lire un talus d'herbe comme une pente.
 *  Chaque mot ajoute un indice ; tout se calcule dans le pixel, d'après la facette (normale du triangle) et la hauteur. */
const TAL = new Set((params().get('r3tal') || '').split(',').filter(Boolean));
const tal = (k) => TAL.has(k) || (TAL.has('tout') && !['hachures', 'courbes2', 'lumface', 'gris', 'facette', 'courbes', 'terre'].includes(k));
function glslTalus() {
  if (!TAL.size) return '';
  const K = num('r3lk', 2.4).toFixed(3), LZ = num('r3lz', -0.35).toFixed(3), LX = num('r3lx', -0.5).toFixed(3);
  return `
  ${tal('gris') ? 'diffuseColor.rgb = vec3(0.45, 0.66, 0.36);' : ''}
  if (vRoc < 0.5) {
    vec3 fn = normalize(cross(dFdx(vP), dFdy(vP))); if (fn.y < 0.0) fn = -fn;
    vec3 ns = normalize(vNrm);
    float pt = length(ns.xz) / max(ns.y, 0.05);
    if (pt > 0.12) {
      float th = fract(vY / ${LV.toFixed(5)} + 0.0004);
      vec2 dn = normalize(ns.xz);
      bool cote = abs(dn.x) > abs(dn.y);
      vec2 px = floor(vTx);
      float col = cote ? px.y : px.x;
      float along = cote ? vTx.y : vTx.x;
      q = 1.0;
      ${tal('lum') || tal('lumface') ? `{
        vec3 Ls = normalize(vec3(${LX}, 1.0, ${tal('lumface') ? '0.45' : LZ}));
        vec3 nl = ${tal('facette') ? 'fn' : 'normalize(vNrm)'};
        float f = 1.0 + ${K} * (dot(nl, Ls) / Ls.y - 1.0);
        q = 0.58 + 0.105 * floor(clamp((f - 0.58) / 0.105 + bay - 0.5, 0.0, 6.0));
      }` : ''}
      ${tal('sec') ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.04, 0.7), clamp(pt * 0.9, 0.0, 0.55));' : ''}
      ${tal('terre') ? `if (th > 0.62 && r3Hash(floor(px / 3.0)) > 0.8 - (th - 0.62) * 0.6) diffuseColor.rgb = r3Hash(px) > 0.5 ? vec3(0.56, 0.4, 0.24) : vec3(0.47, 0.32, 0.19);` : ''}
      ${tal('courbes') || tal('courbes2') ? `{
        float N = ${tal('courbes2') ? '5.0' : '3.0'}, c = fract(vY / (${LV.toFixed(5)} / N) + 0.5);
        float keep = r3Hash(vec2(floor(along / 7.0), floor(vY / (${LV.toFixed(5)} / N) + 0.5)));
        if (keep > 0.22) { if (c < 0.09) q *= 0.74; else if (c < 0.17) q *= 1.12; }
      }` : ''}
      ${tal('hachures') ? `{
        float a = dot(vTx, vec2(-dn.y, dn.x));
        float lane = floor(a / 3.0), r = r3Hash(vec2(lane, 7.0));
        if (mod(floor(a), 3.0) < 1.0 && fract(th * 2.0 + r) < 0.55) q *= 0.8;
      }` : ''}
      ${tal('arete') ? 'if (th > 0.9) q *= 1.18; else if (th > 0.84 && bay > 0.5) q *= 1.08;' : ''}
      ${tal('pied') ? 'if (th < 0.05) q *= 0.6; else if (th < 0.13) q *= 0.76; else if (th < 0.2 && bay > 0.5) q *= 0.88;' : ''}
      ${tal('frange') ? `{
        float tooth = 0.07 + 0.2 * r3Hash(vec2(floor(col / 2.0), 3.0)) + 0.06 * r3Hash(vec2(floor(col / 5.0), 9.0));
        if (th > 1.0 - tooth) q = ${tal('lum') ? 'max(q, 1.0)' : '1.0'};
        else if (th > 1.0 - tooth - 0.045) q *= 0.6;
      }` : ''}
    }
  }`;
}

/** sol généré posé sur le relief : paliers d'ombre selon la pente, herbe plus sombre au pied des parois */
export function matSol(mat, w, h) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTx = { value: new THREE.Vector2(w, h) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 nrm; attribute float pied; attribute float fr; attribute float roc; varying vec3 vNrm; varying float vPied; varying float vY; varying vec2 vTx; varying float vFr; varying float vRoc; varying vec3 vP; uniform vec2 uTx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNrm = nrm; vPied = pied; vY = transformed.y; vTx = uv * uTx; vFr = fr; vRoc = roc; vP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNrm; varying float vPied; varying float vY; varying vec2 vTx; varying float vFr; varying float vRoc; varying vec3 vP;' + GLSL_COMMUN)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float bay = r3Bayer(vTx);
        float q = r3Palier(vNrm, bay);
        ${modePente() ? `if (vRoc > 0.5) {
          // gradins de roche : sur un pan en pente (normale du triangle), la position dans le niveau (hauteur) donne
          // l'arête claire en haut, puis la roche fonce jusqu'au pli sombre du pied ; chaque niveau a son dégradé
          vec3 fn = normalize(cross(dFdx(vP), dFdy(vP)));
          if (abs(fn.y) < 0.97) {
            float t = 1.0 - fract(vY / ${LV.toFixed(5)} - 0.02) + (bay - 0.5) * 0.12;
            q = t < 0.07 ? 1.75 : t < 0.25 ? 1.3 : t < 0.45 ? 1.0 : t < 0.65 ? 0.76 : t < 0.86 ? 0.56 : 0.38;   // (lumière linéaire)
          }
        } else if (vFr >= 0.0) {
          // pente d'un étage : bord haut éclairé, puis l'herbe fonce jusqu'au pied, en paliers tramés
          float t = vFr + (bay - 0.5) * 0.18;
          q = t < 0.08 ? 1.14 : t < 0.28 ? 0.96 : t < 0.5 ? 0.8 : t < 0.72 ? 0.66 : 0.52;
        }` : ''}
        ${glslTalus()}
        ${tal('nopied') ? '' : 'if (vPied < 22.0 && (1.0 - vPied / 22.0) * 1.25 > bay) q *= vPied < 6.0 ? 0.66 : 0.8;'}
        diffuseColor.rgb *= q * r3Fond(vY);`);
  };
  mat.customProgramCacheKey = () => 'r3sol' + (modePente() ? 'p' : '') + [...TAL].join('');
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
      .replace('#include <common>', '#include <common>\nattribute vec2 suv; attribute float tuile; attribute vec2 hb; attribute vec3 nrm; attribute vec4 levre; attribute float fond;\nvarying vec2 vSuv; varying float vTuile; varying vec2 vHb; varying vec3 vNrm; varying vec4 vLevre; varying float vY; varying float vFond;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSuv = suv; vTuile = tuile; vHb = hb; vNrm = nrm; vLevre = levre; vY = transformed.y; vFond = fond;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSuv; varying float vTuile; varying vec2 vHb; varying vec3 vNrm; varying vec4 vLevre; varying float vY; varying float vFond;' + GLSL_COMMUN)
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
        // paroi d'un ravin : la roche plonge dans le noir, en paliers tramés (1 : tout au fond)
        if (vFond > 0.001) q *= vFond >= 0.999 ? 0.0 : floor((1.0 - vFond) * 5.0 + bay * 0.999) / 5.0;
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
  /** le point (x, z) est-il au fond d'un ravin ? */
  fondRavin(x, z) { return this.sorteDe(Math.floor(x), Math.floor(z)) === V; }
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
  bande(sh, sl, dir, dl, roc = ROC) {
    if (dl < 0.01 || LIBRE(sh) || LIBRE(sl)) return [0, 0];
    let a = 0, b = 0;
    if (sl === V) b = 0;   // bord d'un ravin : le replat va jusqu'au bord, la paroi verticale est à part (geoRavin)
    else if (sl === EAU) b = 0.22;
    else if (sh === EAU) a = 0.2;
    else if (sh === B) b = Math.min(0.98, DOUX * Math.min(1.5, dl));
    else if (sl === B) a = Math.min(0.98, DOUX * Math.min(1.5, dl));
    else if (sh === R) a = roc;
    else if (sl === R) b = roc;
    else { const w = DOUX * Math.min(1.5, Math.max(0.6, dl)) * (this._va || 1); a = b = Math.min(0.98, w / 2); }
    // versant tourné vers le nord (la case basse est au nord) : jamais assez raide pour cacher ce qui est derrière
    if (dir === 0) {
      const min = dl * KLV / NORD;
      if (a + b < min) { if (sh !== B) a = Math.min(0.98, min - b); else b = Math.min(0.98, min - a); }
    }
    return [a, b];
  }
  /** le relief de la case est-il abrupt (parois) : neige, canyon, désert, volcan (les ravins ont leurs parois à part,
   *  verticales : geoRavin ; la roche qui les borde est en pente comme le reste de la montagne) */
  abrupt(x, y) {
    const th = this.m.zoneAt?.(x, y)?.theme;
    return th === 'snow' || th === 'canyon' || th === 'desert' || th === 'volcanic';
  }
  largRoc(x, y) { return modePente() && penteRoche() && !this.abrupt(x, y) ? ROC_PENTE : ROC; }
  /** cette case se dessine-t-elle en vraie pente (true) ou avec une paroi (false) ? */
  enPente(p, x, y) { return modePente() && (p.levre ? !this.abrupt(x, y) : penteRoche() && (p.t === 1 || p.t === 6) && !this.abrupt(x, y)); }
  /** retraits (nord, est, sud, ouest) du replat d'une case ; null pour une case libre (paroi, marche) */
  /** facteur de largeur d'une pente le long de son bord (0,55 à 1,7) : un talus n'a pas le même angle partout */
  varAngle(x, y) {
    if (!modePente() || params().get('r3var') === '0') return 1;
    const n = (u, v) => { const a = Math.floor(u), c = Math.floor(v), fu = u - a, fv = v - c, sm = (t) => t * t * (3 - 2 * t);
      const h = (i, j) => hash(i, j, 911); const A = h(a, c), B = h(a + 1, c), C2 = h(a, c + 1), D2 = h(a + 1, c + 1);
      return A + (B - A) * sm(fu) + (C2 - A) * sm(fv) + (A - B - C2 + D2) * sm(fu) * sm(fv); };
    const v = n(x / 4.2, y / 4.2) * 0.7 + n(x / 1.7 + 7, y / 1.7) * 0.3;
    return num('r3vmin', 0.45) + num('r3vamp', 1.9) * v * v;
  }
  retraits(x, y) {
    const i = this.cell(x, y), s = this.sorte[i];
    if (LIBRE(s)) return null;
    if (this.ins[i * 4] < 0) {
      const L = this.niv[i];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => {
        const j = this.cell(x + dx, y + dy), Ln = this.niv[j], sn = this.sorte[j];
        let v;
        this._va = this.varAngle(x + dx * 0.5, y + dy * 0.5);   // même facteur des deux côtés du bord
        if (modePente() && sn === C && (s === W || s === TR || s === B) && dy !== 0 && !this.abrupt(x + dx, y + dy)) v = Math.max(0, Math.min(0.8, (this._va - 0.75) * 0.75));   // talus d'herbe : la pente déborde plus ou moins sur le replat
        else if (Math.abs(L - Ln) < 1e-4) v = 0;
        else if (L > Ln) v = this.bande(s, sn, d, (L - Ln) / LV, this.largRoc(x, y))[0];
        else v = this.bande(sn, s, (d + 2) % 4, (Ln - L) / LV, this.largRoc(x, y))[1];
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
    // ESSAI (?r3lisse=R) : talus d'herbe lissés — la hauteur est la moyenne des niveaux des cases sous un carré de côté 2R
    // centré sur le sommet (flou en boîte) : replats plats, rampe droite avec une arête nette en haut et en bas, et un
    // contour arrondi au lieu des marches d'escalier de la grille ; r3lk2 > 1 resserre la rampe sans perdre l'arrondi
    if (LISSE > 0) { const h = this.sommetLisse(px, pz); if (h != null) return h; }
    // un ravin a des parois verticales : un sommet sur son bord appartient à la case d'à côté, et le fond du ravin ne
    // compte pas dans les pentes autour (seuls les sommets tout entiers dans le ravin sont au fond)
    const xs = px - cx < 1e-6 ? [cx - 1, cx] : [cx], zs = pz - cz < 1e-6 ? [cz - 1, cz] : [cz];
    let toutV = true;
    for (const y of zs) for (const x of xs) if (this.sorte[this.cell(x, y)] !== V) toutV = false;
    if (toutV) return RAVIN;
    // cas courant : le sommet est dans le replat de toutes les cases qui le touchent
    {
      let ok = true, Lm = -Infinity;
      for (const y of zs) for (const x of xs) {
        if (this.sorte[this.cell(x, y)] === V) continue;
        const r = this.retraits(x, y); if (!r) { ok = false; break; }
        if (px < x + r[3] - 1e-6 || px > x + 1 - r[1] + 1e-6 || pz < y + r[0] - 1e-6 || pz > y + 1 - r[2] + 1e-6) { ok = false; break; }
        Lm = Math.max(Lm, this.niv[this.cell(x, y)]);
      }
      if (ok) return Lm;
    }
    let dedans = -Infinity; const lv = [], dv = [];
    for (let y = cz - 3; y <= cz + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const r = this.retraits(x, y); if (!r || this.sorte[this.cell(x, y)] === V) continue;
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

  /** hauteur lissée (flou en boîte des niveaux) si toutes les cases sous le carré sont de l'herbe ou un talus d'herbe */
  sommetLisse(px, pz) {
    const R = LISSE, b = this.base;
    const x0 = Math.floor(px - R), x1 = Math.floor(px + R - 1e-9), z0 = Math.floor(pz - R), z1 = Math.floor(pz + R - 1e-9);
    let s = 0, lo = Infinity, hi = -Infinity;
    for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
      const i = this.cell(x, y), so = this.sorte[i];
      const herbe = so === W || so === TR || (so === C && b.in(x, y) && b.pentes && b.pentes[y * b.w + x]);
      if (!herbe || this.abrupt(x, y)) return null;
      const L = this.niv[i];
      const ax = Math.max(0, Math.min(x + 1, px + R) - Math.max(x, px - R)), az = Math.max(0, Math.min(y + 1, pz + R) - Math.max(y, pz - R));
      s += ax * az * L; if (ax * az > 1e-9) { lo = Math.min(lo, L); hi = Math.max(hi, L); }
    }
    let h = s / (4 * R * R);
    if (hi - lo < 1e-6) return h;
    // la rampe resserrée autour du milieu de chaque marche de niveau (les replats restent plats)
    const K = LISSE_K * (this.varAngleLisse ? this.varAngleLisse(px, pz) : 1);
    const n = Math.floor((h - lo) / LV + 1e-6), f = (h - lo) / LV - n;
    return lo + LV * (n + Math.max(0, Math.min(1, (f - 0.5) * K + 0.5)));
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
    // le fond d'un ravin et ce qui le borde sont séparés par une paroi verticale : la pente ne se calcule pas au travers
    const fond = (q) => h[q] < RAVIN + 1e-3;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, f0 = fond(k), at = (a, c) => { const q = Math.max(0, Math.min(N - 1, c)) * N + Math.max(0, Math.min(N - 1, a)); return fond(q) !== f0 ? h[k] : h[q]; };
      gx[k] = (at(i + 1, j) - at(i - 1, j)) / (2 * e); gz[k] = (at(i, j + 1) - at(i, j - 1)) / (2 * e);
      const g = Math.hypot(gx[k], gz[k]);
      // une paroi : assez raide, et pas tournée vers le nord (ces versants-là restent du sol, vus de biais) ; entre deux
      // pelouses (pente douce), seulement si c'est vraiment abrupt
      const sc = this.sorteDe(Math.floor(b.x0 + (i - P) * e + 1e-4), Math.floor(b.z0 + (j - P) * e + 1e-4));
      const seuil = modePente() && (sc === W || sc === TR || sc === B) ? 0.32 : sc === W || sc === TR || sc === B || sc === EAU ? PENTE_DOUCE_MAX : PENTE_PAROI;
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
        const S0 = modePente() ? 0.32 : PENTE_PAROI;
        const croise = (ka, kb) => { const ga = g(ka), gb = g(kb), t = Math.max(0, Math.min(1, (S0 - ga) / (gb - ga || 1))); return ecran[ka] + (ecran[kb] - ecran[ka]) * t; };
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

  /** maillage du sol généré d'un bloc (bw × bh cases) : position, uv (alignées sur les cases), normale, pied.
   *  rocheH : cases de la bande de roche rangée sous l'image du bloc (sol.js, rendreRoche de solgen.js), 0 sans elle */
  geoSol(ci, cj, bw, bh, rocheH = 0) {
    const b = this.bloc(ci, cj), D = this.details(ci, cj), nx = bw * RN + 1, nz = bh * RN + 1;
    const TH = bh + rocheH;   // hauteur de l'image, en cases (le bloc, puis la bande de roche)
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), nrm = new Float32Array(nx * nz * 3), pied = new Float32Array(nx * nz), fr = new Float32Array(nx * nz).fill(-1);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i, k = (j + P) * b.N + i + P;
      pos[v * 3] = b.x0 + i / RN; pos[v * 3 + 1] = b.h[k]; pos[v * 3 + 2] = b.z0 + j / RN;
      uv[v * 2] = i / (nx - 1); uv[v * 2 + 1] = j / RN / TH;
      const l = Math.hypot(D.gx[k], 1, D.gz[k]); nrm[v * 3] = -D.gx[k] / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -D.gz[k] / l;
      pied[v] = D.pied[k];
      if (D.ht[k] > -64 && D.hbas[k] > -64) fr[v] = Math.max(0, Math.min(1, D.ht[k] / Math.max(1, D.ht[k] + D.hbas[k])));
    }
    // fond des ravins : une case entière à plat, tout au fond (ses bords sont des parois verticales, geoRavin)
    const vide = new Uint8Array(bw * bh);
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw; cx++) vide[cy * bw + cx] = this.sorteDe(b.x0 + cx, b.z0 + cy) === V ? 1 : 0;
    // les cases plates (25 sommets à la même hauteur) sont fusionnées par rangées : deux triangles au lieu de 32 ; leurs
    // bords tombent sur des sommets de la même hauteur que les cases voisines (pas de fente)
    const idx = [], plate = new Uint8Array(bw * bh);
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw; cx++) {
      if (vide[cy * bw + cx]) continue;
      const h0 = pos[((cy * RN) * nx + cx * RN) * 3 + 1]; let ok = true;
      for (let j = 0; j <= RN && ok; j++) for (let i = 0; i <= RN; i++) { const v = ((cy * RN + j) * nx) + cx * RN + i; if (Math.abs(pos[v * 3 + 1] - h0) > 1e-5 || pied[v] < 99 || nrm[v * 3 + 1] < 0.9999) { ok = false; break; } }
      plate[cy * bw + cx] = ok ? 1 : 0;
    }
    // quarts de case en pente : leurs sommets sont doublés, avec une texture déroulée selon la longueur réelle de la pente
    // (le sol continue sur l'hypoténuse : 1,46 case de motif sur un étage, au lieu d'une case étirée). Le long de chaque
    // colonne de sommets, ex = longueur parcourue sur la pente moins la longueur à plat (le « reste » de Pythagore), remis à
    // zéro sur le plat : la texture se lit en v = z + ex, raccordée au replat d'en haut, la même pour deux bandes voisines.
    const deroule = !/[?&]r3etire/.test(globalThis.location?.search || '');
    const kq = (i, j) => (j + P) * b.N + i + P;
    const ex = new Float32Array(nx * nz);
    if (deroule) for (let i = 0; i < nx; i++) {
      // depuis la marge au nord du bloc : une pente qui commence dans le bloc d'au-dessus garde le même motif
      let e = 0;
      for (let j = -P + 1; j < nz; j++) {
        const h1 = b.h[kq(i, j)], h0 = b.h[kq(i, j - 1)], dy = h1 - h0;
        // remis à zéro sur le plat, et au bord d'un ravin (la paroi verticale n'est pas une pente du sol)
        e = Math.abs(dy) < 1e-5 || h0 < RAVIN + 1e-3 || h1 < RAVIN + 1e-3 ? 0 : e + Math.hypot(1 / RN, dy) - 1 / RN;
        if (j >= 0) ex[j * nx + i] = e;
      }
    }
    // pentes de roche (montagnes) : le motif déroulé se lit dans la bande de roche (rien que de la roche, le même motif que
    // le sol de roche du replat), jamais dans le sentier de la case d'à côté ; les autres pentes des montagnes restent étirées
    const rocC = new Uint8Array(bw * bh);
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw; cx++) {
      const x = b.x0 + cx, z = b.z0 + cy, p = this.paroiDe(x, z);
      const rp = !vide[cy * bw + cx] && !p.levre && this.enPente(p, x, z);
      rocC[cy * bw + cx] = rp && rocheH > 0 ? 1 : rp ? 3 : this.base.in(x, z) && (mont(this.base, x, z) || mont(this.base, x, z + 1) || mont(this.base, x, z - 1)) ? 2 : 0;
    }
    // 1 : pente de roche ; 3 : pente de roche sans bande de roche ; 2 : autre case de montagne ; 0 : ailleurs
    const roc = (i, j) => rocC[Math.floor(j / RN) * bw + Math.floor(i / RN)];
    // un quart à plat (au pied ou en haut d'une pente) reste dessiné comme le sol d'à côté
    const plat = (i, j) => { const h0 = b.h[kq(i, j)]; return Math.abs(b.h[kq(i + 1, j)] - h0) < 1e-5 && Math.abs(b.h[kq(i, j + 1)] - h0) < 1e-5 && Math.abs(b.h[kq(i + 1, j + 1)] - h0) < 1e-5; };
    const pq = (i, j) => deroule && !vide[Math.floor(j / RN) * bw + Math.floor(i / RN)] && (D.raide[kq(i, j)] || D.raide[kq(i, j + 1)] || D.raide[kq(i + 1, j)] || D.raide[kq(i + 1, j + 1)]) && roc(i, j) < 2 && !plat(i, j);
    const XP = [], XU = [], XN = [], XPi = [], XF = [], XR = [], xidx = [];
    let nv = nx * nz;
    const plus = (v, U, Vv, y = pos[v * 3 + 1]) => { XP.push(pos[v * 3], y, pos[v * 3 + 2]); XN.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]); XPi.push(pied[v]); XF.push(fr[v]); XR.push(0); XU.push(U, Vv); return nv++; };
    // sommets de la grille touchant une pente de roche : ombrés en gradins (matSol)
    const rocG = new Float32Array(nx * nz);
    if (modePente()) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < nx - 1 && c < nz - 1 && (roc(a, c) & 1) && !vide[Math.floor(c / RN) * bw + Math.floor(a / RN)]) { rocG[j * nx + i] = 1; break; } }
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!pq(i, j)) continue;
      const r = roc(i, j) === 1, lim = r ? TH - 0.5 / 32 : bh;
      const w = (v) => { const z = pos[v * 3 + 2] - b.z0 + ex[v]; return (r ? bh + Math.min(rocheH - 0.5 / 32, z) : Math.min(lim, z)) / TH; };
      const d = j * nx + i, c = d + 1, a = d + nx, bb = a + 1;
      const A = plus(a, uv[a * 2], w(a)), B = plus(bb, uv[bb * 2], w(bb)), C = plus(c, uv[c * 2], w(c)), Dd = plus(d, uv[d * 2], w(d));
      if (r) for (const q of [A, B, C, Dd]) XR[q - nx * nz] = 1;
      xidx.push(A, B, C, A, C, Dd);
    }
    for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw;) {
      if (vide[cy * bw + cx]) {
        const d = cy * RN * nx + cx * RN, c = d + RN, a = d + RN * nx, bb = a + RN;
        const A = plus(a, uv[a * 2], uv[a * 2 + 1], RAVIN), B = plus(bb, uv[bb * 2], uv[bb * 2 + 1], RAVIN), C = plus(c, uv[c * 2], uv[c * 2 + 1], RAVIN), Dd = plus(d, uv[d * 2], uv[d * 2 + 1], RAVIN);
        for (const q of [A, B, C, Dd]) { XN[(q - nx * nz) * 3] = 0; XN[(q - nx * nz) * 3 + 1] = 1; XN[(q - nx * nz) * 3 + 2] = 0; XPi[q - nx * nz] = 99; XF[q - nx * nz] = -1; }
        xidx.push(A, B, C, A, C, Dd); cx++; continue;
      }
      if (plate[cy * bw + cx]) {
        const h0 = pos[((cy * RN) * nx + cx * RN) * 3 + 1];
        let ex2 = cx + 1; while (ex2 < bw && plate[cy * bw + ex2] && Math.abs(pos[((cy * RN) * nx + ex2 * RN) * 3 + 1] - h0) < 1e-5) ex2++;
        const d = cy * RN * nx + cx * RN, c = cy * RN * nx + ex2 * RN, a = d + RN * nx, bb = c + RN * nx;
        idx.push(a, bb, c, a, c, d); cx = ex2; continue;
      }
      for (let j = cy * RN; j < (cy + 1) * RN; j++) for (let i = cx * RN; i < (cx + 1) * RN; i++) {
        if (pq(i, j)) continue;   // quart en pente : dessiné avec ses propres sommets (texture déroulée)
        const d = j * nx + i, c = d + 1, a = d + nx, bb = a + 1;   // a = sud-ouest, bb = sud-est, c = nord-est, d = nord-ouest
        idx.push(a, bb, c, a, c, d);
      }
      cx++;
    }
    const cat = (A, X) => { const o = new Float32Array(A.length + X.length); o.set(A); o.set(X, A.length); return o; };
    for (const q of xidx) idx.push(q);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cat(pos, XP), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(cat(uv, XU), 2));
    g.setAttribute('nrm', new THREE.BufferAttribute(cat(nrm, XN), 3));
    g.setAttribute('pied', new THREE.BufferAttribute(cat(pied, XPi), 1));
    g.setAttribute('fr', new THREE.BufferAttribute(cat(fr, XF), 1));
    g.setAttribute('roc', new THREE.BufferAttribute(cat(rocG, XR), 1));
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
      if (this.sorteDe(cx, cz) === V) continue;   // ravins : geoRavin
      let p = cache.get(ck); if (!p) { p = this.paroiDe(cx, cz); cache.set(ck, p); }
      if (this.enPente(p, cx, cz)) continue;
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
    g.setAttribute('fond', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
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
      if (this.sorteDe(cx, cz + 1) === V) continue;   // ravins : geoRavin
      const pz = this.paroiDe(cx, cz + 1);
      if (pz.t >= MURS.length) continue;   // les marches gardent leur dessin
      if (this.enPente(pz, cx, cz + 1)) continue;
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

  /** parois des ravins d'un bloc : verticales (90°), du bord jusqu'au fond, là où une case qui n'est pas le ravin touche
   *  une case du ravin. Paroi du fond (tournée vers la caméra, au nord du ravin) : roche striée vue de la caméra, qui
   *  plonge dans le noir en paliers (FOND niveaux sous le bord), et facettes de roche en volume par-dessus ; côtés est et
   *  ouest : la même roche (vus par la tranche avec la caméra orthographique, ils bouchent seulement les fentes).
   *  Renvoie { paroi, facettes } (géométries, ou null) */
  geoRavin(ci, cj, bw, bh) {
    const b = this.bloc(ci, cj), N = b.N;
    const pos = [], suv = [], tuile = [], hb = [], nrm = [], lev = [], fond = [], idx = []; let n = 0;
    const fpos = [], fcol = [];
    const hAt = (x, z) => { const i = Math.round((x - b.x0) * RN) + P, j = Math.round((z - b.z0) * RN) + P; return b.h[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))]; };
    const ecr = (y, z) => (z - y / TAN) * 32;
    const FD = FOND_RAVIN * LV;
    // un quadrilatère de paroi (sommets [x, y, z, ht, hbas, fond]), tourné vers nW (vecteur voulu de sa normale)
    const quad = (Q, t, nW) => {
      const [a, c, d] = Q, ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const cr = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const ok = cr[0] * nW[0] + cr[1] * nW[1] + cr[2] * nW[2] > 0;
      for (const q of Q) {
        pos.push(q[0], q[1], q[2]); suv.push((nW[0] !== 0 ? q[2] : q[0]) * 32, ecr(q[1], q[2])); tuile.push(t);
        hb.push(q[3], q[4]); nrm.push(nW[0], nW[1], nW[2]); lev.push(0, 0, 0, 0); fond.push(q[5]);
      }
      if (ok) idx.push(n, n + 1, n + 2, n, n + 2, n + 3); else idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
      n += 4;
    };
    // une bande verticale de paroi entre (x0, z0) et (x1, z1), hauts y0 et y1 : partie en roche (FD sous le bord), puis noire
    const bande = (x0, z0, y0, x1, z1, y1, t, nW) => {
      const m0 = Math.max(RAVIN, y0 - FD), m1 = Math.max(RAVIN, y1 - FD);
      const e0 = ecr(y0, z0), e1 = ecr(y1, z1), f0 = ecr(y0 - FD, z0), f1 = ecr(y1 - FD, z1);
      const sv = (x, y, z, eT, eB, yT) => [x, y, z, ecr(y, z) - eT, eB - ecr(y, z), Math.min(1, (yT - y) / FD)];
      // ordre : haut-gauche, haut-droite, bas-droite, bas-gauche
      quad([sv(x0, y0, z0, e0, f0, y0), sv(x1, y1, z1, e1, f1, y1), sv(x1, m1, z1, e1, f1, y1), sv(x0, m0, z0, e0, f0, y0)], t, nW);
      if (m0 > RAVIN + 1e-4 || m1 > RAVIN + 1e-4) quad([[x0, m0, z0, 99, 99, 1], [x1, m1, z1, 99, 99, 1], [x1, RAVIN, z1, 99, 99, 1], [x0, RAVIN, z0, 99, 99, 1]], t, nW);
    };
    const Lgt = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();
    const tri = (A, C, Dv, pal, haut, yT) => {
      const nn = new THREE.Vector3().subVectors(C, A).cross(new THREE.Vector3().subVectors(Dv, A)).normalize();
      if (nn.z < 0) { nn.negate(); [C, Dv] = [Dv, C]; }
      const f = nn.dot(Lgt), lv = f > 0.62 ? 5 : f > 0.42 ? 4 : f > 0.2 ? 3 : f > 0.0 ? 2 : 1;
      const lvl = Math.max(0, Math.min(4, lv - (haut ? 0 : 2)));
      // plongée dans le noir : même palier que la paroi derrière (au centre du triangle)
      const fd = Math.min(1, (yT - (A.y + C.y + Dv.y) / 3) / FD), k = fd >= 0.999 ? 0 : Math.floor((1 - fd) * 5 + 0.5) / 5;
      const cc = rgb(pal[lvl]).map((v) => ((v / 255) ** 2.2) * k);
      for (const v of [A, C, Dv]) { fpos.push(v.x, v.y, v.z); fcol.push(...cc); }
    };
    const pals = new Map();
    for (let cz = b.z0; cz < b.z0 + bh; cz++) for (let cx = b.x0; cx < b.x0 + bw; cx++) {
      if (this.sorteDe(cx, cz) !== V) continue;
      let t = pals.get(cx + ',' + cz); if (t == null) { t = this.paroiDe(cx, cz).t; pals.set(cx + ',' + cz, t); }
      const pal = PALS[MURS[t]] || PALS.montagne;
      // paroi du fond : la case au nord n'est pas le ravin
      if (this.sorteDe(cx, cz - 1) !== V) {
        for (let i = 0; i < RN; i++) {
          const xa = cx + i / RN, xb = xa + 1 / RN;
          bande(xa, cz, hAt(xa, cz), xb, cz, hAt(xb, cz), t, [0, 0, 1]);
        }
        // facettes : des colonnes de roche d'un quart ou d'une demi-case, chacune un prisme en dents de scie qui part du
        // bord et descend plus ou moins loin dans le noir (bas irrégulier)
        for (let i = 0; i < RN;) {
          const rnd = (q) => hash(cx * RN + i, cz, 977 + q);
          const w = i < RN - 1 && rnd(0) < 0.4 ? 2 : 1;
          const xa = cx + i / RN, xb = cx + (i + w) / RN, ya = hAt(xa, cz), yb = hAt(xb, cz), yT = (ya + yb) / 2;
          const hh = FD * (0.55 + rnd(1) * 0.4), y0a = ya - 0.08 * LV, y0b = yb - 0.08 * LV;
          const T0 = new THREE.Vector3(xa, y0a, cz), T1 = new THREE.Vector3(xb, y0b, cz);
          const B0 = new THREE.Vector3(xa, Math.max(RAVIN, y0a - hh * (0.85 + rnd(2) * 0.3)), cz), B1 = new THREE.Vector3(xb, Math.max(RAVIN, y0b - hh * (0.85 + rnd(3) * 0.3)), cz);
          const tr = 0.3 + rnd(4) * 0.4, dep = (0.06 + rnd(5) * 0.1) * w;
          const Tm = T0.clone().lerp(T1, tr), Bm = B0.clone().lerp(B1, tr);
          Tm.z += dep * 0.4; Bm.z += dep * 0.3; Bm.y -= hh * 0.12 * rnd(6);   // la pointe du bas descend un peu plus
          const mid = (A, C, e, k) => { const m = A.clone().lerp(C, k); m.z += e; return m; };
          const kM = 0.3 + rnd(7) * 0.2, M0 = mid(T0, B0, dep * 0.6, kM), M1 = mid(T1, B1, dep * 0.6, kM), Mm = mid(Tm, Bm, dep * 1.3, kM);
          for (const [A, C, Dv, E, haut] of [[T0, Tm, Mm, M0, 1], [Tm, T1, M1, Mm, 1], [M0, Mm, Bm, B0, 0], [Mm, M1, B1, Bm, 0]]) { tri(A, C, Dv, pal, haut, yT); tri(A, Dv, E, pal, haut, yT); }
          i += w;
        }
      }
      // côtés : la case à l'ouest ou à l'est n'est pas le ravin
      for (const [dx, xw, nx] of [[-1, cx, 1], [1, cx + 1, -1]]) {
        if (this.sorteDe(cx + dx, cz) === V) continue;
        for (let j = 0; j < RN; j++) {
          const za = cz + j / RN, zb = za + 1 / RN;
          bande(xw, za, hAt(xw, za), xw, zb, hAt(xw, zb), t, [nx, 0, 0]);
        }
      }
    }
    let paroi = null, facettes = null;
    if (n) {
      paroi = new THREE.BufferGeometry();
      paroi.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      paroi.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      paroi.setAttribute('suv', new THREE.Float32BufferAttribute(suv, 2));
      paroi.setAttribute('tuile', new THREE.Float32BufferAttribute(tuile, 1));
      paroi.setAttribute('hb', new THREE.Float32BufferAttribute(hb, 2));
      paroi.setAttribute('nrm', new THREE.Float32BufferAttribute(nrm, 3));
      paroi.setAttribute('levre', new THREE.Float32BufferAttribute(lev, 4));
      paroi.setAttribute('fond', new THREE.Float32BufferAttribute(fond, 1));
      paroi.setIndex(idx); paroi.computeBoundingSphere();
    }
    if (fpos.length && facettesActives()) {
      facettes = new THREE.BufferGeometry();
      facettes.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
      facettes.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
      facettes.computeBoundingSphere();
    }
    return paroi || facettes ? { paroi, facettes } : null;
  }

  /** tuiles inclinées sur les pentes (cases en pente) : texture répétée plaquée selon la longueur réelle de la pente
   *  (u : le long de x, v : distance parcourue sur la pente depuis son haut), donc 1,46 tuile sur l'hypoténuse d'un
   *  étage au lieu d'une tuile étirée, quel que soit l'angle ; ombre en paliers, claire en haut, sombre au pied.
   *  Renvoie { sorte: géométrie } */
  geoPentes(ci, cj, bw, bh) {
    if (!modePente()) return null;
    const b = this.bloc(ci, cj), D = this.details(ci, cj), N = b.N, e = 1 / RN;
    const lots = {};
    const sorteDe = (p) => !p.levre ? 'roche' : p.levre === LEVRE.foret ? 'foret' : p.levre === LEVRE.automne ? 'automne' : 'herbe';
    const cache = new Map();
    for (let i = 0; i < bw * RN; i++) {
      // le long de la colonne : suites de sommets raides, distance cumulée sur la pente depuis le haut
      let j = 0;
      while (j < bh * RN) {
        const k = (j + P) * N + i + P;
        if (!D.raide[k] && !D.raide[k + 1]) { j++; continue; }
        let j1 = j; while (j1 + 1 < bh * RN && (D.raide[(j1 + 1 + P) * N + i + P] || D.raide[(j1 + 1 + P) * N + i + 1 + P])) j1++;
        const ja = Math.max(0, j - 1), jb = Math.min(bh * RN, j1 + 1);
        const pos = (jj, ii) => { const kk = (jj + P) * N + ii + P; return [b.x0 + ii * e, b.h[kk], b.z0 + jj * e]; };
        // distance cumulée (milieu de la bande de deux colonnes)
        const sv = [0];
        for (let jj = ja + 1; jj <= jb; jj++) {
          const a0 = pos(jj - 1, i), a1 = pos(jj, i), c0 = pos(jj - 1, i + 1), c1 = pos(jj, i + 1);
          const d = (Math.hypot(a1[1] - a0[1], a1[2] - a0[2]) + Math.hypot(c1[1] - c0[1], c1[2] - c0[2])) / 2;
          sv.push(sv[sv.length - 1] + d);
        }
        const tot = sv[sv.length - 1] || 1;
        for (let jj = ja; jj < jb; jj++) {
          const cx = b.x0 + Math.floor(i / RN), cz = b.z0 + Math.floor(jj / RN), ck = cx + ',' + cz;
          let p = cache.get(ck); if (!p) { p = this.paroiDe(cx, cz); cache.set(ck, p); }
          if (!this.enPente(p, cx, cz)) continue;
          const kind = sorteDe(p), L = lots[kind] || (lots[kind] = { pos: [], uv: [], col: [] });
          const fr = (sv[jj - ja] + sv[jj - ja + 1]) / 2 / tot, bay = hash(b.x0 * RN + i, b.z0 * RN + jj, 3) * 0.12;
          const q = (fr + bay) < 0.12 ? 1.1 : (fr + bay) < 0.35 ? 0.95 : (fr + bay) < 0.6 ? 0.82 : (fr + bay) < 0.85 ? 0.7 : 0.6;
          const v0 = pos(jj, i), v1 = pos(jj, i + 1), v2 = pos(jj + 1, i + 1), v3 = pos(jj + 1, i);
          const u0 = b.x0 + i * e, u1 = u0 + e, s0 = -(cz + sv[jj - ja]), s1 = -(cz + sv[jj - ja + 1]);
          const quad = [[v3, u0, s1], [v2, u1, s1], [v1, u1, s0], [v3, u0, s1], [v1, u1, s0], [v0, u0, s0]];   // sens du sol (vu d'en haut)
          for (const [v, u, w] of quad) { L.pos.push(v[0], v[1] + 0.002, v[2]); L.uv.push(u, w); L.col.push(q, q, q); }
        }
        j = j1 + 1;
      }
    }
    const out = {};
    for (const [k, L] of Object.entries(lots)) {
      if (!L.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.computeBoundingSphere(); out[k] = g;
    }
    return out;
  }

}
