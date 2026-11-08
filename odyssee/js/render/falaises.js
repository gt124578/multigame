// odyssee/js/render/falaises.js — relief du dehors façon HeartGold / SoulSilver : le sol monte et descend en vraie 3D, les
// falaises sont des pans de roche inclinés, comme les tuiles « Mountain » des cartes de HGSS.
//
// Ce que font les cartes de HeartGold (modèles 3D des tuiles, tels que les décrit Pokémon DS Map Studio) :
//  - un niveau de relief fait une case de haut, et la falaise qui le borde tient dans une seule case de profondeur : un
//    petit pied, puis un pan incliné à ~63° (pas vertical : la caméra, penchée à 55°, le voit presque de face), puis le
//    dessus plat du niveau. Plusieurs niveaux empilés font des terrasses (Mont Argenté, Route 45) ;
//  - la texture d'un pan est une bande : lèvre claire (herbe, roche, neige) qui déborde en haut, pierres arrondies en
//    colonnes séparées de fentes sombres, pied sombre en bas ; le dessus des gradins de roche a sa propre texture, claire ;
//  - les coins sont arrondis (pièces « Corner ») ; l'ombre est peinte (aucun éclairage dynamique).
//
// Ici, la grille du jeu reste la seule vérité (collisions, marches) : chaque case a un niveau, et chaque bord entre deux
// niveaux reçoit un pan incliné logé dans l'une des deux cases (celle où l'on ne marche pas : la roche, la paroi, l'arbre ;
// sinon la plus haute). La hauteur d'un point est celle de sa case, moins le pan qui descend vers le voisin plus bas (ou
// plus le pan qui monte vers le voisin plus haut) ; les coins sortants s'arrondissent (distance elliptique), les coins
// rentrants font un quart d'entonnoir. Le maillage (8 × 8 sommets par case) porte, par case, sa famille (sol, roche,
// néant), son biome et ses niveaux haut et bas ; le shader choisit pixel par pixel : texture du sol généré, pan de roche
// (bande lèvre / pierres / pied, un pixel de texture par pixel d'écran, une strate par niveau), dessus de roche, marches.
//
// Actif par défaut dehors ; ?relief=plat remet l'ancien rendu à plat, ?relief3d l'ancien prototype.
import * as THREE from 'three';
import { T, walkable } from '../world/tiles.js';
import { ravin, mont, pente } from '../world/relief.js';
import { LV, KLV } from './relief3d.js';

const params = () => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } };
/** le relief façon HGSS est-il demandé ? (par défaut oui ; ?relief=plat ou ?relief3d pour les anciens rendus) */
export function reliefHGSSActif() { const p = params(); return !p.has('relief3d') && p.get('relief') !== 'plat'; }

const EL = 55 * Math.PI / 180, TAN = Math.tan(EL);
const RN = 12;                // sommets par case (dans chaque sens)
const CH = 16;                // taille d'un bloc de carte (comme world3d.js)
const P = RN;                 // sommets de marge autour d'un bloc (une case)
const WD = 0.16 * LV;         // l'eau est un peu plus basse que la berge
const RAVIN = -3.2 * LV;      // fond d'un ravin
const PX = 32;                // pixels d'écran par case

// sortes de cases
const SOL = 0, ARBRE = 1, BAT = 2, ROC = 3, EAU = 4, VIDE = 5, PAROI = 6, MARCHE = 7;
// familles de dessin (attribut du maillage, lu par le shader)
const F_SOL = 0, F_ROC = 1, F_VIDE = 3, F_MARCHE = 4;

/* ------------------------------------------------------------------ biomes et palettes --------------------------------- */
// pans (du plus sombre au plus clair) et dessus des gradins de roche
export const BIOMES = ['montagne', 'granit', 'glace', 'ocre', 'magma', 'terre', 'mer', 'lune', 'grotte'];
const FACE = {
  montagne: ['#2c1f19', '#4a3326', '#6b4a34', '#8c6343', '#ab7e56', '#c99d6e'],   // brun chaud des falaises de HGSS
  granit: ['#26252a', '#3d3c42', '#57565c', '#737178', '#918e93', '#b3afb0'],
  glace: ['#33445a', '#4f6884', '#7090ae', '#94b2cc', '#bcd2e4', '#e2eef8'],
  ocre: ['#3e1c10', '#6a321c', '#8e4626', '#ae5e34', '#c87c4a', '#e0a06c'],
  magma: ['#1e110d', '#352019', '#4e2e24', '#683f31', '#835342', '#9e6a56'],
  terre: ['#2e2016', '#4f3826', '#704f35', '#8f6846', '#ad835a', '#c9a074'],
  mer: ['#1f272e', '#334049', '#47555f', '#5c6c77', '#758893', '#93a6b0'],
  lune: ['#262230', '#3d374a', '#554e65', '#6f6680', '#8a809c', '#a89eba'],
  grotte: ['#24211d', '#433d35', '#655d50', '#877e6c', '#a99f89', '#c9c0a8'],     // parois beiges des grottes de HGSS
};
const DESSUS = {
  montagne: ['#5e4a3a', '#7a624c', '#957a5e', '#ae9472', '#c6ad88', '#dac6a2'],   // la roche plate des gradins (cliff01)
  granit: ['#55535a', '#6c6a70', '#848288', '#9d9a9e', '#b5b2b3', '#cdcac8'],
  glace: ['#a9bdd0', '#c0d2e2', '#d4e2ee', '#e4eef6', '#f0f6fa', '#fbfdff'],
  ocre: ['#92522c', '#a8653a', '#be7c4c', '#d29660', '#e2ae78', '#efc694'],
  magma: ['#352621', '#46342d', '#58433a', '#6b5347', '#7f6556', '#957a69'],
  terre: ['#5a4632', '#715a42', '#887054', '#9f8666', '#b59c7a', '#cab290'],
  mer: ['#4d5a62', '#617079', '#768790', '#8c9ea6', '#a3b4bb', '#bccbd0'],
  lune: ['#4f4860', '#655d78', '#7c7390', '#948aa8', '#ada3be', '#c6bdd2'],
  grotte: ['#3a352e', '#544d43', '#6f675a', '#8b8272', '#a79e8b', '#c2b9a3'],
};
// roche des grottes selon leur biome (caveBiome de world3d.js)
const BIO_GROTTE = { terre: 'grotte', mer: 'mer', magma: 'magma', glace: 'glace', montagne: 'granit' };
// lèvres : rien (dessus de roche), herbe, neige, sable, herbe sombre de forêt
const LEVRES = [null, ['#2c7236', '#52a446', '#8ad064'], ['#b8cad8', '#e2ecf4', '#ffffff'], ['#b89058', '#d8b478', '#f0d49c'], ['#1f5a2e', '#3d8c3c', '#6cbb52']];

const hash = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
/** bruit lisse 1D (valeurs sur une grille de `s`, interpolées) */
const lisse1 = (u, s, seed) => { const f = u / s, i = Math.floor(f), t = f - i, k = t * t * (3 - 2 * t); return hash(i, 7, seed) * (1 - k) + hash(i + 1, 7, seed) * k; };

/* ------------------------------------------------------------------ textures (générées) -------------------------------- */
const TX = 64;   // une tuile de texture : 64 × 64 pixels (deux cases de large)

/** pierres pentues (64 × 64, raccord dans les deux sens) : des côtes de roche verticales (7 à 15 pixels de large) séparées
 *  de fentes sombres, faites de bosses arrondies empilées (le haut en arc, comme les falaises de HGSS) ; la lumière vient
 *  d'en haut à gauche : flanc gauche et haut de chaque bosse éclairés, flanc droit dans l'ombre (indices de palette 0 à 5) */
function pierres(seed) {
  const px = new Uint8Array(TX * TX).fill(1);
  const R = (() => { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  const set = (x, y, c) => { px[((y % TX) + TX) % TX * TX + ((x % TX) + TX) % TX] = c; };
  let x = 0;
  while (x < TX) {
    let w = 7 + Math.floor(R() * 9); if (TX - (x + w) < 7) w = TX - x;
    const cote = R() < 0.2 ? 2 : R() < 0.75 ? 3 : 4;   // teinte de la côte
    let y = Math.floor(R() * TX), fait = 0;
    while (fait < TX) {
      let h = 10 + Math.floor(R() * 17); if (TX - (fait + h) < 10) h = TX - fait;
      const b = Math.max(2, Math.min(4, cote + (R() < 0.25 ? (R() < 0.5 ? -1 : 1) : 0)));
      const arc = Math.min(w / 2, 5), dx = R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const X = x + i + (j < h / 3 ? 0 : dx), Y = y + j;
        // la bosse : le haut en arc (coins arrondis), les flancs droits ; une fente d'un pixel autour
        let dedans = i >= 1 && i < w - 1 && j >= 1;
        if (dedans && j < arc + 1) { const cx = i < w / 2 ? arc : w - 1 - arc, d = Math.hypot(i - cx, (arc + 1 - j) * 1.1); if ((i < arc || i > w - 1 - arc) && d > arc) dedans = false; }
        if (!dedans) { set(X, Y, j === 0 ? Math.max(0, b - 2) : i === 0 || i === w - 1 ? 1 : Math.max(1, b - 2)); continue; }
        const u = (i - 1) / Math.max(1, w - 3), v = (j - 1) / Math.max(1, h - 2);
        let c = b;
        if (u < 0.22 || v < 0.16) c = b + 1;                       // flanc gauche et haut éclairés
        if (u < 0.12 && v < 0.35 || (v < 0.08 && u < 0.6)) c = Math.min(5, b + 2);   // reflet
        if (u > 0.8) c = b - 1;                                     // flanc droit dans l'ombre
        if (v > 0.9 && u > 0.3) c = Math.min(c, b - 1);             // le dessous de la bosse
        if (hash(X & 63, Y & 63, seed + 5) < 0.06) c = Math.max(1, c - 1);   // grain
        set(X, Y, Math.max(1, Math.min(5, c)));
      }
      y += h; fait += h;
    }
    x += w;
  }
  return px;
}
/** un étage de paroi (64 × 32 : la bande d'un niveau, de son haut à son pied), comme les parois de HGSS : une rangée de
 *  grosses pierres (14 à 22 pixels) dont le haut s'arrondit en dôme clair (le dessus de la pierre, qui rejoint le replat),
 *  puis des flancs qui foncent vers le bas, une fente sombre entre deux pierres, l'ombre de contact au pied ; entre les
 *  dômes, on voit le replat du dessus (indices de palette 0 à 5) */
function etage(seed) {
  const W = TX, H = 32, px = new Uint8Array(W * H).fill(4);
  const R = (() => { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  let x = Math.floor(R() * 8);
  const x0 = x;
  while (x < x0 + W) {
    let w = 14 + Math.floor(R() * 9); if (x0 + W - (x + w) < 14) w = x0 + W - x;
    const b = R() < 0.3 ? 2 : R() < 0.85 ? 3 : 4, haut = Math.floor(R() * 3), ry = Math.min(w / 2, 6 + R() * 3), rx = w / 2;
    for (let j = 0; j < H; j++) for (let i = 0; i < w; i++) {
      const X = (x + i) % W, y = j - haut, dx = (i + 0.5 - rx) / rx;
      // le dôme : une demi-ellipse ; au-dessus, le replat (clair, un grain) ; une fente d'un pixel entre deux pierres
      const bord = y - ry * (1 - Math.sqrt(Math.max(0, 1 - dx * dx)));
      if (bord < 0) { px[j * W + X] = bord > -1.2 ? 2 : hash(X, j, seed + 9) < 0.15 ? 3 : 4; continue; }
      if (i === 0 || i === w - 1) { px[j * W + X] = y > ry * 0.6 ? 1 : 2; continue; }
      const u = (i + 0.5) / w, v = y / (H - haut);
      let c = b;
      if (bord < 2.2) c = b + 2;                                   // l'arrondi éclairé, juste sous le replat
      else if (y < ry + 1) c = b + 1;                              // le dôme
      if (u < 0.18 && c < b + 1) c = b + 1;                        // flanc gauche éclairé
      if (u > 0.8 && bord > 2.2) c = b - 1;                        // flanc droit dans l'ombre
      if (v > 0.6) c -= 1;                                         // le bas fonce
      if (v > 0.84) c -= 1;
      if (hash(X, j, seed + 3) < 0.05) c -= 1;                     // grain
      px[j * W + X] = Math.max(1, Math.min(5, c));
    }
    x += w;
  }
  for (let i = 0; i < W; i++) { px[(H - 1) * W + i] = 0; if (hash(i, 7, seed) < 0.7) px[(H - 2) * W + i] = Math.max(0, px[(H - 2) * W + i] - 2); }   // ombre de contact
  return px;
}
/** dessus d'un gradin de roche (64 × 64, raccord) : dalles douces aux joints un peu plus sombres, quelques grains */
function dalles(seed) {
  const px = new Uint8Array(TX * TX), pts = [];
  for (let k = 0; k < 22; k++) pts.push([hash(k, 1, seed) * TX, hash(k, 2, seed) * TX, hash(k, 3, seed) < 0.18 ? 3 : hash(k, 3, seed) < 0.75 ? 4 : 5]);
  for (let y = 0; y < TX; y++) for (let x = 0; x < TX; x++) {
    let d1 = 1e9, d2 = 1e9, c = 4;
    for (const [a, b, cc] of pts) for (const ox of [-TX, 0, TX]) for (const oy of [-TX, 0, TX]) {
      const dx = x - a - ox, dy = (y - b - oy) * 1.3, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; c = cc; } else if (d < d2) d2 = d;
    }
    // joints : un pixel plus sombre que la dalle, interrompus ; la lumière sur le bord haut-gauche de chaque dalle
    let v = c;
    if (d2 - d1 < 1.0 && hash(Math.floor(x / 3), Math.floor(y / 3), seed + 4) < 0.8) v = Math.max(2, c - 1);
    else if (d2 - d1 < 2.2 && hash(x, y, seed) < 0.3) v = Math.min(5, c + 1);
    if (hash(x, y, seed + 9) < 0.03) v = Math.max(1, v - 2);
    else if (hash(x, y, seed + 11) < 0.04) v = Math.min(5, v + 1);
    px[y * TX + x] = v;
  }
  return px;
}
let ATLAS = null;
/** atlas : une rangée par biome, [pierres | dessus], 128 × 64 chacune */
function atlas() {
  if (ATLAS) return ATLAS;
  const n = BIOMES.length, c = document.createElement('canvas'); c.width = TX * 3; c.height = TX * n;
  const g = c.getContext('2d'), im = g.createImageData(TX * 3, TX * n);
  BIOMES.forEach((b, k) => {
    const pf = FACE[b].map(rgb), pd = DESSUS[b].map(rgb), A = pierres(101 + k * 37), D = dalles(203 + k * 41);
    const E = new Uint8Array(TX * TX); E.set(etage(307 + k * 43)); E.set(etage(409 + k * 47), TX * 32);   // deux étages
    for (let y = 0; y < TX; y++) for (let x = 0; x < TX; x++) {
      for (const [ox, src, pal] of [[0, A, pf], [TX, D, pd], [TX * 2, E, pf]]) {
        const o = ((k * TX + y) * TX * 3 + ox + x) * 4, cc = pal[src[y * TX + x]];
        im.data[o] = cc[0]; im.data[o + 1] = cc[1]; im.data[o + 2] = cc[2]; im.data[o + 3] = 255;
      }
    }
  });
  g.putImageData(im, 0, 0);
  const tex = new THREE.Texture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  ATLAS = { tex, n };
  return ATLAS;
}
const glslCouleurs = (L) => L.map((p, i) => p ? `vec3 lev${i}[3] = vec3[3](${p.map((h) => { const [r, g, b] = rgb(h); return `vec3(${(r / 255).toFixed(3)}, ${(g / 255).toFixed(3)}, ${(b / 255).toFixed(3)})`; }).join(', ')});` : '').join('\n');

/* ------------------------------------------------------------------ shader ------------------------------------------- */
/** matériau du sol en relief : le sol généré (map), et par-dessus, selon la famille de la case, les pans de roche, le
 *  dessus des gradins, les marches, le fond des ravins (atlas des falaises) */
export function matTerrain(mat, w, h, grotte = false) {
  const A = atlas();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTx = { value: new THREE.Vector2(w, h) };
    sh.uniforms.uFal = { value: A.tex };
    // les cases du bloc et leur bordure (famille, biome, niveau : geoSol), pour raccorder chaque pixel à ses voisines
    sh.uniforms.uCases = { value: mat.userData.cases || null };
    sh.uniforms.uOrig = { value: new THREE.Vector2(...(mat.userData.orig || [0, 0])) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 fam; attribute vec2 niv; attribute vec4 pied; attribute vec4 bord;
flat varying vec4 vFam; flat varying vec2 vNiv; flat varying vec4 vPied; flat varying vec4 vBord; varying vec3 vP; varying vec2 vTx; uniform vec2 uTx;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFam = fam; vNiv = niv; vPied = pied; vBord = bord; vP = transformed; vTx = uv * uTx;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
flat varying vec4 vFam; flat varying vec2 vNiv; flat varying vec4 vPied; flat varying vec4 vBord; varying vec3 vP; varying vec2 vTx; uniform sampler2D uFal;
uniform sampler2D uCases; uniform vec2 uOrig;
// une case voisine : famille d'affichage (0 sol, 1 roche, 3 néant, 4 marches), biome, niveau (unités du monde)
vec3 fCase(ivec2 c) { vec4 v = texelFetch(uCases, c - ivec2(uOrig) + ivec2(1), 0) * 255.0; return vec3(floor(v.r + 0.5), floor(v.g + 0.5), (v.b - 64.0) / 4.0 * ${LV.toFixed(6)}); }
// bruit doux le long d'un bord (0..1), le même vu des deux cases qui le partagent
float fOnde(float t, float g) { float i = floor(t), u = fract(t); u = u * u * (3.0 - 2.0 * u);
  return mix(fract(sin(i * 12.9898 + g * 78.233) * 43758.5453), fract(sin((i + 1.0) * 12.9898 + g * 78.233) * 43758.5453), u); }
float fBayer(vec2 p) { p = mod(floor(p), 4.0); int i = int(p.x) + int(p.y) * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }
float fHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// un pixel de l'atlas des falaises : tuile 0 (pierres) ou 1 (dessus), biome b, pixel (x, y) de la tuile
vec3 fFal(float tuile, float b, vec2 q) {
  q = mod(floor(q), ${TX}.0);
  return texture2D(uFal, vec2((q.x + tuile * ${TX}.0 + 0.5) / ${TX * 3}.0, (q.y + b * ${TX}.0 + 0.5) / ${(TX * A.n).toFixed(1)})).rgb;
}
${glslCouleurs(LEVRES)}
vec3 fLevre(float k, float i) { int j = int(clamp(i, 0.0, 2.0));
  ${LEVRES.map((p, i) => p ? `if (k < ${i}.5) return lev${i}[j];` : '').join(' ')} return lev1[j]; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float fam = vFam.x, bio = vFam.y, levre = vFam.z;
    // la facette (normale du triangle), et la position « à l'écran » ancrée au monde (projection orthographique de la
    // caméra : un pixel = un pixel, rien ne glisse quand la caméra bouge)
    vec3 fn = normalize(cross(dFdx(vP), dFdy(vP))); if (fn.y < 0.0) fn = -fn;
    vec2 ep = vec2(vP.x * ${PX}.0, (vP.z - vP.y / ${TAN.toFixed(6)}) * ${PX}.0);
    float bay = fBayer(ep);
    // lumière en haut à gauche (comme les ombres peintes de HGSS) : paliers nets
    vec3 Ld = normalize(vec3(-0.5, 0.8, -0.3));
    float lum = dot(fn, Ld);
    // pans de roche : paliers doux (la texture porte déjà ses ombres) ; flanc ouest éclairé, flanc est et face sud plus sombres
    float q = lum > 0.72 ? 1.06 : lum > 0.45 ? 0.98 : lum > 0.2 ? 0.92 : lum > -0.05 ? 0.87 : 0.82;
    bool raide = fn.y < 0.8;
    float top = vNiv.x, bas = vNiv.y, LVv = ${LV.toFixed(6)};
    // distance (en cases) au pied d'une falaise voisine plus haute : côtés nord, est, sud, ouest de la case
    vec2 fc = fract(vP.xz);
    // (au pied d'un mur au nord, l'ombre portée de HGSS ; contre un mur de côté, une ombre deux fois plus étroite)
    float pd = min(min(vPied.x > 0.5 ? fc.y : 9.0, vPied.z > 0.5 ? (1.0 - fc.y) * 2.0 : 9.0), min(vPied.y > 0.5 ? (1.0 - fc.x) * 2.0 : 9.0, vPied.w > 0.5 ? fc.x * 2.0 : 9.0));
    pd += (fHash(floor(ep / 2.0)) - 0.5) * 0.06;
    int f = int(fam + 0.5);
    // raccords entre cases voisines, calculés au pixel (aucune tuile de transition à dessiner) :
    //  - au même niveau, la roche déborde sur le sol voisin (herbe, sable, chemin) en un bord irrégulier, cerné d'un liseré ;
    //  - deux roches de biomes différents (neige et roche, granit et ocre) se partagent le bord selon une ligne qui ondule,
    //    sur le dessus comme sur les pans ;
    //  - le bord ondule selon la position dans le monde : les deux cases le voient pareil, aucune couture.
    float lis = 1.0;
    {
      ivec2 cc = ivec2(floor(vP.xz)); vec2 fl = vP.xz - vec2(cc);
      bool dessus = !raide && abs(vP.y - vFam.w) < 0.03 * LVv;
      int fa = f == 5 ? 0 : f;                               // famille d'affichage du dessus
      for (int ax = 0; ax < 2; ax++) {
        float u = ax == 0 ? fl.x : fl.y, le = ax == 0 ? vP.z : vP.x;
        int sx = u < 0.5 ? -1 : 1;
        ivec2 nc = cc + (ax == 0 ? ivec2(sx, 0) : ivec2(0, sx));
        vec3 nb = fCase(nc); int nf = int(nb.x);
        float dd = sx > 0 ? 1.0 - u : u;                       // distance au bord partagé (en cases)
        float g = float(ax == 0 ? cc.x + max(sx, 0) : cc.y + max(sx, 0)) * 1.618 + float(ax) * 7.1;
        if (dessus && abs(nb.z - vFam.w) < 0.05 * LVv) {
          if (fa == 0 && nf == 1) {
            // la roche voisine déborde sur ce sol : de 0,06 à 0,3 case selon le bord, cernée d'un liseré sombre
            float o = 0.06 + 0.24 * fOnde(le * 2.6, g) + 0.06 * fOnde(le * 9.0, g + 3.0);
            if (dd < o) { f = ${F_ROC}; fa = 1; bio = nb.y; if (o - dd < 1.4 / ${PX}.0) lis = 0.62; }
          } else if (fa == 1 && nf == 1 && abs(nb.y - bio) > 0.5) {
            float o = (fOnde(le * 2.2, g) - 0.5) * 0.5;      // bord commun : décalé de ±0,25 case
            float sg = (sx > 0 ? -1.0 : 1.0) * o;                // vu de cette case : la frontière est à dd = sg
            if (dd < sg) bio = nb.y;
          }
        } else if (!dessus && ax == 0 && (f == ${F_ROC} || f == 5) && (nf == 1 || nf == 0) && abs(nb.y - bio) > 0.5) {
          // pans : le changement de roche suit une ligne qui ondule avec la hauteur
          float o = (fOnde(vP.y * 3.0, g) - 0.5) * 0.5, sg = (sx > 0 ? -1.0 : 1.0) * o;
          if (dd < sg && nf == 1) bio = nb.y;
        }
      }
    }
    // (le néant et la roche ne lisent pas le sol généré : jamais percés par ses trous, là où le jeu garde son propre sol)
    if (f == ${F_VIDE} || f == ${F_ROC} || (f == 5 || f == ${F_MARCHE}) && raide) diffuseColor.a = 1.0;
    // le pied d'une roche, à plat au niveau du bas (coins arrondis, bas des pentes) : c'est le sol de la case voisine la
    // plus basse qui continue — lu dans l'image du sol en miroir de leur bord commun —, avec une ombre douce contre la roche ;
    // sans sol voisin (une bosse sur un gradin), le dessus de la roche du bas
    bool piedR = (f == ${F_ROC} || f == 5) && fn.y > 0.97 && vP.y < vFam.w - 0.25 * LVv;
    if (piedR) {
      ivec2 cc = ivec2(floor(vP.xz));
      float best = 1e9; vec2 cible = vP.xz;
      for (int dj = -1; dj <= 1; dj++) for (int di = -1; di <= 1; di++) {
        if (di == 0 && dj == 0) continue;
        vec3 nb = fCase(cc + ivec2(di, dj));
        if (int(nb.x) != 0 || nb.z > vP.y + 0.1 * LVv) continue;
        vec2 bord = vec2(cc) + vec2(di > 0 ? 1.0 : 0.0, dj > 0 ? 1.0 : 0.0);
        vec2 m = vP.xz; if (di != 0) m.x = 2.0 * bord.x - m.x; if (dj != 0) m.y = 2.0 * bord.y - m.y;
        float d = distance(m, vP.xz) + (di != 0 && dj != 0 ? 0.3 : 0.0);
        if (d < best) { best = d; cible = m; }
      }
      bool lu = false;
      if (best < 1e8) {
        vec2 uvM = (cible - uOrig) * ${PX}.0 / vec2(textureSize(map, 0));
        if (uvM.x > 0.0 && uvM.y > 0.0 && uvM.x < 1.0 && uvM.y < 1.0) {
          vec4 t2 = texture2D(map, uvM);
          if (t2.a > 0.5) { diffuseColor.rgb = diffuse * t2.rgb; lu = true; }
        }
      }
      if (!lu) diffuseColor.rgb = diffuse * fFal(1.0, bio, vec2(vP.x * ${PX}.0, vP.z * ${PX}.0));
      float ao = clamp((best < 1e8 ? best : 0.5) * 0.5 / 0.35, 0.0, 1.0);
      diffuseColor.rgb *= ao > 0.66 + (bay - 0.5) * 0.2 ? 0.76 : ao > 0.33 + (bay - 0.5) * 0.2 ? 0.88 : 1.0;
      diffuseColor.a = 1.0;
      f = 99;   // rien d'autre à peindre ici
    }
    if (f == ${F_VIDE}) {
      diffuseColor.rgb *= 0.0;
    } else if (((f == ${F_ROC} || f == 5) && (raide || vP.y < vFam.w - 0.03 * LVv || vP.y > vFam.w + 0.03 * LVv)) || (f == ${F_MARCHE} && fn.y < 0.45)) {
      // pan de roche : un étage de pierres par niveau (le haut de chaque pierre arrondi, comme la géométrie), étirées sur
      // la hauteur de l'étage à l'écran ; décalées d'un étage à l'autre ; la lèvre en haut du pan
      // (étages comptés depuis le niveau 0 du monde : deux cases voisines dont le pied diffère gardent les mêmes rangées)
      float lf = vP.y / LVv + 1e-3, k = min(floor(lf), floor(top / LVv + 0.5) - 1.0), t = clamp(lf - k, 0.0, 1.0);
      float rangs = 1.0 / max(abs(dFdy(lf)), 1e-4);           // pixels d'écran par niveau, sur ce pan
      float duHaut = (top - vP.y) / LVv * rangs, duPied = (vP.y - bas) / LVv * rangs;
      float col = floor(ep.x);
      // un étage seul (les terrasses) est une pente arrondie (quart de sinus) : la texture suit la surface (son abscisse u,
      // pas la hauteur) — les pierres se couchent en arrivant sur le dessus — et l'ombre aussi : sombre au pied, qui
      // s'éclaircit à mesure que la pente tourne vers le ciel
      bool rond = top - bas < 1.5 * LVv;
      float ur = rond ? asin(clamp(t, 0.0, 1.0)) / 1.5707963 : t;
      float ve = clamp(floor((1.0 - ur) * 32.0), 0.0, 31.0);
      vec3 c = fFal(2.0, bio, vec2(ep.x + k * 23.0, ve + mod(k, 2.0) * 32.0));
      float lh = 1.0 + floor(fHash(vec2(floor(col / 3.0), 3.0)) * 2.0) + floor(fHash(vec2(floor(col / 7.0), 5.0)) * 2.0);
      if (duHaut < lh && levre > 0.5) {
        // la lèvre : herbe, neige, sable qui débordent en haut du pan
        c = fLevre(levre, duHaut < 1.0 ? 2.0 : duHaut > lh - 1.0 ? 0.0 : 1.0);
        q = max(q, 0.96);
      }
      if (rond) {
        // les côtes s'estompent en montant, et le haut de la pente se fond dans le dessus (la pierre roule jusqu'au replat)
        float m = clamp((ur - 0.62) / 0.38 + (bay - 0.5) * 0.25, 0.0, 1.0);
        vec3 dessus = f == ${F_ROC} ? fFal(1.0, bio, vec2(vP.x * ${PX}.0, vP.z * ${PX}.0)) : c;
        c = mix(c, dessus, floor(m * 3.0) / 3.0 * 0.85);
        c *= ur + (bay - 0.5) * 0.12 < 0.2 ? 0.72 : ur < 0.42 ? 0.84 : ur < 0.66 ? 0.94 : ur < 0.86 ? 1.02 : 1.08;
      }
      // pied : sombre au contact du sol
      if (duPied < 1.0) c *= 0.72; else if (duPied < 3.0 && bay < 0.5) c *= 0.86;
      // le bas d'un grand pan est plus sombre que son haut (la lumière vient d'en haut)
      float hh = clamp((vP.y - bas) / max(top - bas, 1e-3), 0.0, 1.0);
      c *= 0.8 + 0.2 * floor(hh * 3.0 + bay) / 3.0;
      // ravin : la roche plonge dans le noir
      if (vP.y < 0.0) c *= clamp(1.0 + vP.y / ${(-RAVIN * 0.9).toFixed(4)}, 0.0, 1.0);
      diffuseColor.rgb = diffuse * c * q;
    } else if (f == ${F_ROC} && ${grotte ? 'true' : 'false'}) {
      // dans une grotte, le dessus de la roche est un replat de pierre, clair au bord (le haut arrondi de la paroi) puis de
      // plus en plus sombre vers le cœur du massif (l'ombre sous la voûte) : distance au haut du pan le plus proche
      float e = 9.0;
      if (vBord.x > 0.0) e = min(e, fc.y - vBord.x);
      if (vBord.y > 0.0) e = min(e, (1.0 - vBord.y) - fc.x);
      if (vBord.z > 0.0) e = min(e, (1.0 - vBord.z) - fc.y);
      if (vBord.w > 0.0) e = min(e, fc.x - vBord.w);
      e += (fHash(vec2(floor(ep.x / 3.0), floor(ep.y / 3.0))) - 0.5) * 0.05;
      vec3 c = fFal(1.0, bio, vec2(vP.x * ${PX}.0, vP.z * ${PX}.0));
      float k = e < 0.08 ? 1.1 : e < 0.3 ? 1.0 : e < 0.55 && bay < 0.6 ? 0.9 : 0.8;
      if (pd < 0.14) k *= 0.72; else if (pd < 0.3 && bay < 0.55) k *= 0.86;
      diffuseColor.rgb = diffuse * c * k;
    } else if (f == ${F_ROC}) {
      // dessus d'un gradin de roche : la roche plate et claire de HGSS, un peu plus sombre en bas des gradins
      vec3 c = fFal(1.0, bio, vec2(vP.x * ${PX}.0, vP.z * ${PX}.0)) * lis;
      if (pd < 0.14) c *= 0.72; else if (pd < 0.3 && bay < 0.55) c *= 0.86;
      diffuseColor.rgb = diffuse * c * (raide ? q : 1.0);
    } else if (f == ${F_MARCHE}) {
      // marches : girons clairs, contremarches sombres (quatre par niveau)
      float lf = (vP.y - bas) / LVv * 4.0, s = fract(lf);
      float m = s < 0.22 ? 0.62 : s < 0.34 ? 0.82 : s > 0.9 ? 1.12 : 1.0;
      diffuseColor.rgb *= m;
    } else {
      // sol généré (herbe, chemins, sable…) : une pente s'éclaire en haut puis fonce jusqu'à son pied, en paliers tramés
      // (selon la hauteur dans le dénivelé de la case), et selon sa face ; le pied des falaises voisines s'assombrit
      float s = 1.0;
      if (fn.y < 0.985 && top - bas > 0.05) {
        float t = clamp((top - vP.y) / (top - bas), 0.0, 1.0) + (bay - 0.5) * 0.16;
        s = t < 0.1 ? 1.12 : t < 0.3 ? 0.97 : t < 0.52 ? 0.86 : t < 0.75 ? 0.76 : 0.66;
        s *= lum > 0.6 ? 1.04 : lum < 0.2 ? 0.94 : 1.0;
      }
      if (pd < 0.12) s *= 0.7; else if (pd < 0.3 && (1.0 - pd / 0.3) > bay) s *= 0.84;
      diffuseColor.rgb *= s;
    }
    // très haut (une grande montagne) : la roche pâlit et bleuit un peu dans l'air, par paliers
    float alt = vP.y / LVv - 12.0;
    if (alt > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vec3(0.8, 0.86, 0.96), floor(clamp(alt / 60.0, 0.0, 0.32) * 8.0 + bay) / 8.0);
  }`);
  };
  mat.customProgramCacheKey = () => 'falaisesHGSS' + (grotte ? 'G' : '');
  return mat;
}

/* ------------------------------------------------------------------ le relief ---------------------------------------- */
export class ReliefHGSS {
  constructor(map, o = {}) {
    this.m = map; this.base = map.base || map;
    // dans une grotte : parois de deux niveaux tout autour du sol, le dessus de la roche est le noir du plafond (bordé
    // d'une lèvre claire), comme les grottes de HGSS
    this.grotte = !map.outdoor; this.bioGrotte = BIO_GROTTE[o.biome] || 'grotte';
    this.M = 56;   // cases de marge autour de la carte (la région continue au-delà des bords)
    this.LW = map.w + 2 * this.M; this.LH = map.h + 2 * this.M;
    const n = this.LW * this.LH;
    this.sorte = new Int8Array(n).fill(-1); this.niv = new Float32Array(n); this.brut = new Float32Array(n); this.fait = new Uint8Array(n); this.bas = new Float32Array(n); this.bio = new Int8Array(n);
    this.bords = new Map();   // par case : bords et coins (calculés à la demande)
    this.blocs = new Map();
    this.isHGSS = true;
  }
  idx(x, y) { const X = Math.max(0, Math.min(this.LW - 1, x + this.M)), Y = Math.max(0, Math.min(this.LH - 1, y + this.M)); return Y * this.LW + X; }
  porteGrotte(x, y) {
    if (!this._portes) { this._portes = new Set(); for (const b of this.base.buildings || []) if (b.kind === 'cave') this._portes.add(b.doorX + ',' + b.doorY); }
    return this._portes.has(x + ',' + y);
  }
  /** biome de la roche d'une case (falaises, gradins) */
  biomeDe(x, y) {
    if (this.grotte) return this.bioGrotte;
    const b = this.base, z = this.m.zoneAt?.(x, y), th = z?.theme;
    // la neige des cimes (W.neige) : seulement là où elle tient (une arête isolée garde sa roche)
    if (b.neige && b.in(x, y) && b.neige[y * b.w + x]) {
      let n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && b.in(x + i, y + j) && b.neige[(y + j) * b.w + x + i]) n++;
      if (n >= 5) return 'glace';
    }
    if (z?.roche && FACE[z.roche]) return z.roche;
    return th === 'snow' ? 'glace' : th === 'volcanic' ? 'magma' : th === 'canyon' || th === 'desert' ? 'ocre' : th === 'beach' || th === 'sea' ? 'mer' : th === 'forest' || th === 'automne' || th === 'foretsombre' ? 'terre' : 'montagne';
  }
  /** lèvre en haut des falaises d'une case : 0 dessus de roche, 1 herbe, 2 neige, 3 sable, 4 herbe de forêt */
  levreDe(x, y, s) {
    if (s === ROC || this.grotte) return 0;
    const th = this.m.zoneAt?.(x, y)?.theme;
    return th === 'snow' ? 2 : th === 'desert' || th === 'canyon' || th === 'beach' ? 3 : th === 'forest' || th === 'foretsombre' ? 4 : 1;
  }
  /** sorte, niveau (unités du monde) d'une case */
  /** sorte et niveau « brut » d'une case (avant les terrasses de la roche) */
  cellBrut(x, y) {
    const i = this.idx(x, y);
    if (this.sorte[i] < 0) {
      const m = this.m, b = this.base, dans = b.in(x, y), t = m.get(x, y);
      const cx = Math.max(0, Math.min(b.w - 1, x)), cy = Math.max(0, Math.min(b.h - 1, y)), hg = b.height(cx, cy);
      let s = SOL, L = hg * LV;
      if (dans && ravin(b, x, y) && (t === T.CAVEWALL || t === T.BRIDGE)) { s = VIDE; L = RAVIN; }
      else switch (t) {
        case T.CLIFF: s = PAROI; break;
        case T.STAIRS: s = MARCHE; break;
        case T.CAVEWALL: s = this.porteGrotte(x, y) ? SOL : ROC; break;
        case T.WATER: case T.WHIRL: s = EAU; L = hg * LV - WD; break;
        case T.BUILD: case T.DOOR: s = BAT; break;
        case T.TREE: case T.PINE: case T.BUSH: case T.ROCK: case T.CUT: case T.SMASH: case T.BOULDER: case T.FENCE: s = ARBRE; break;
        default: s = walkable(t) ? SOL : ARBRE;
      }
      this.sorte[i] = s; this.niv[i] = L; this.bas[i] = L;
      this.bio[i] = Math.max(0, BIOMES.indexOf(this.biomeDe(x, y)));
      if (s === ROC) this.niv[i] = this.niveauRoche(x, y, hg) * LV;
      if (s === PAROI) this.niv[i] = this.niveauParoi(x, y, hg) * LV;
      if (s === MARCHE) { const [lo, hi] = this.niveauxMarche(x, y, hg); this.bas[i] = lo * LV; this.niv[i] = hi * LV; }
      this.brut[i] = this.niv[i];
    }
    return i;
  }
  /** sorte, niveau (unités du monde) d'une case : la roche en terrasses (terrasse()) */
  cell(x, y) {
    const i = this.cellBrut(x, y);
    if (!this.fait[i]) { this.fait[i] = 1; if (this.sorte[i] === ROC) this.niv[i] = this.terrasse(x, y); }
    return i;
  }
  /** la roche en terrasses, comme les montagnes de HGSS : une pente faible à moyenne (trois niveaux au plus entre une case
   *  et sa voisine plus basse) monte d'un niveau par case — chaque étage reculé d'une case entière sur celui du dessous ;
   *  au-delà, c'est une falaise, gardée d'un bloc (ses étages, serrés et réguliers, tiennent dans sa case). Calculé sur
   *  une fenêtre de 7 × 7 cases autour (la terrasse se propage de proche en proche). */
  terrasse(x, y) {
    const R = 3, N = 2 * R + 1, E = new Float32Array(N * N), B = new Float32Array(N * N), roc = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = this.cellBrut(x + i - R, y + j - R), s = this.sorte[k], q = j * N + i;
      if (s === VIDE) { E[q] = NaN; continue; }
      B[q] = this.brut[k] / LV; roc[q] = s === ROC ? 1 : 0;
      E[q] = roc[q] ? B[q] : Math.round(B[q] + (s === EAU ? WD / LV : 0));
    }
    for (let it = 0; it < 4; it++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i; if (!roc[q]) continue;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue;
        const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const e = E[jj * N + ii]; if (!(e === e)) continue;
        if (B[q] - e <= 3 + 1e-4 && e + 1 < E[q]) E[q] = e + 1;
      }
    }
    // un creux d'une case (les quatre voisins plus hauts) se comble : pas de trou isolé dans un massif
    const c = R * N + R; let lo = Infinity, plus = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const e = E[(R + b) * N + R + a]; if (e === e && e > E[c] + 1e-4) { plus++; lo = Math.min(lo, e); } }
    if (plus === 4) E[c] = Math.min(lo, B[c]);
    return E[c] * LV;
  }

  sorteDe(x, y) { return this.sorte[this.cell(x, y)]; }
  nivDe(x, y) { return this.niv[this.cell(x, y)]; }
  hg(x, y) { const b = this.base; return b.height(Math.max(0, Math.min(b.w - 1, x)), Math.max(0, Math.min(b.h - 1, y))); }
  /** niveau d'une case de roche : celui du jeu (montagnes, massifs), sinon des gradins selon la distance au pied ; jamais
   *  assez haut pour cacher qui marche juste au nord (la caméra regarde vers le nord) */
  niveauRoche(x, y, hg) {
    const b = this.base, m = this.m;
    let L = hg;
    if (this.grotte) L = 2;
    else if (!(b.in(x, y) && (mont(b, x, y) || hg > 0))) {
      let d = 9;
      for (let r = 1; r <= 5 && d === 9; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (m.get(x + i, y + j) !== T.CAVEWALL) { d = r; break; }
      }
      L = hg + 1 + Math.min(2, Math.floor((d - 1) / 2));
    }
    // la roche est toujours plus haute que le sol où l'on marche à côté (un obstacle se voit : HGSS n'a pas de roche au ras
    // du sol), même dans une montagne dont le pied est au niveau du sentier
    // (à deux cases : un petit massif ne se creuse pas en cuvette derrière son bord)
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      if (!i && !j) continue;
      const t = m.get(x + i, y + j);
      if ((walkable(t) && t !== T.STAIRS) || t === T.WATER) L = Math.max(L, this.hg(x + i, y + j) + 1);
    }
    // une case où l'on marche, k cases au nord : la roche ne monte pas plus haut que ce que la caméra laisse voir
    for (let k = 1; k <= 14; k++) {
      const t = m.get(x, y - k);
      if (t === T.CAVEWALL && !this.porteGrotte(x, y - k)) continue;
      if (walkable(t) || t === T.WATER) { const lim = this.hg(x, y - k) + Math.floor((k - 1 + 0.95 + 0.5) / KLV + 0.15); if (L > lim) L = Math.max(lim, this.hg(x, y - k) + 1); }
      break;
    }
    return L;
  }
  /** niveau du haut d'une paroi (T.CLIFF) : les parois d'une colonne montent en gradins, du sol d'en bas au plateau */
  niveauParoi(x, y, hg) {
    const m = this.m;
    let n = 0; while (n < 12 && m.get(x, y - n - 1) === T.CLIFF) n++;          // parois au-dessus
    let s = 0; while (s < 12 && m.get(x, y + s + 1) === T.CLIFF) s++;          // parois en dessous
    const haut = this.hg(x, y - n - 1), bas = this.hg(x, y + s + 1), r = n + s + 1;
    const lo = Math.min(bas, hg), hi = Math.max(haut, lo);
    return lo + (hi - lo) * (s + 1) / r;
  }
  /** marches : niveau bas et haut (vers le voisin plus haut) */
  niveauxMarche(x, y, hg) {
    let hi = hg;
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) { const t = this.m.get(x + dx, y + dy); if (t !== T.CLIFF && t !== T.CAVEWALL) hi = Math.max(hi, this.hg(x + dx, y + dy)); }
    let lo = hg;
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) { const t = this.m.get(x + dx, y + dy); if (t !== T.CLIFF && t !== T.CAVEWALL && walkable(t)) lo = Math.min(lo, this.hg(x + dx, y + dy)); }
    return [lo, Math.max(hi, lo)];
  }
  /** sens de montée des marches : [dx, dy] vers le haut */
  sensMarche(x, y) {
    const hi = this.nivDe(x, y);
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      const s = this.sorteDe(x + dx, y + dy);
      if (s !== PAROI && s !== ROC && Math.abs(this.nivDe(x + dx, y + dy) - hi) < 1e-4 && s !== MARCHE) return [dx, dy];
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) if (this.sorteDe(x + dx, y + dy) === MARCHE && this.nivDe(x + dx, y + dy) > this.bas[this.cell(x, y)] + 1e-4) return [dx, dy];
    return [0, -1];
  }

  /** bords d'une case : pour chaque côté (nord, est, sud, ouest) { w : largeur du pan, d : dénivelé (unités du monde),
   *  sens : -1 la case descend vers le voisin, +1 elle monte vers lui }, coins rentrants ; famille, biome, lèvre */
  bordsDe(x, y) {
    const k = this.idx(x, y); let B = this.bords.get(k);
    if (B) return B;
    const i = this.cell(x, y), s = this.sorte[i], L = this.niv[i];
    const pas = (q) => q === SOL || q === MARCHE;   // où l'on marche
    const cotes = [];
    let fam = s === ROC ? F_ROC : s === VIDE ? F_VIDE : s === MARCHE ? F_MARCHE : F_SOL, roche = s === ROC;
    const herbe = pente(this.base, x, y);
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => {
      const j = this.cell(x + dx, y + dy), sn = this.sorte[j], Ln = sn === MARCHE ? this.niv[j] : this.niv[j];
      let c = null;
      if (s === MARCHE || sn === MARCHE) { cotes.push(null); return; }
      if (Ln < L - 1e-4) {
        // la case est plus haute : elle porte le pan, sauf si le voisin est un obstacle bas et elle un sol où l'on marche
        // (le pan est alors logé chez le voisin, qui monte vers elle)
        const dz = L - Ln;
        // n : niveaux franchis ; pan de roche (roc) : un étage par niveau, chacun reculé d'une demi-case sur celui du dessous,
        // le haut de chaque étage arrondi ; sinon pente douce (talus d'herbe, berge, bord d'un sol où l'on marche)
        const n = Math.max(1, Math.round(dz / LV));
        if (sn === VIDE) c = { w: 0.03, d: dz, sens: -1 };
        else if (sn === EAU) c = { w: 0.18, d: dz, sens: -1 };
        else if (pas(s) && (sn === ROC || sn === ARBRE) && !(s === SOL && sn === ARBRE && dz < 1.5 * LV)) c = null;
        else if (s === ROC) {
          // vers le nord, au-dessus d'un sol où l'on marche : le pan s'élargit pour ne pas cacher les pieds de qui s'y tient
          // (la caméra regarde vers le nord) ; ailleurs, pan de face large (HGSS), pans de côté étroits (vus de biais)
          const wC = n === 1 ? 0.55 : 0.62;
          const wN = pas(sn) || sn === EAU ? Math.min(0.95, Math.max(wC, dz / LV * KLV - 0.45)) : wC;
          c = { w: d === 2 ? (n === 1 ? 0.8 : 0.95) : d === 0 ? wN : wC, d: dz, sens: -1, roc: true, n };
        }
        else if (s === PAROI) c = d === 2 ? (herbe ? { w: 1.0, d: dz, sens: -1 } : { w: n === 1 ? 0.85 : 0.95, d: dz, sens: -1, roc: true, n }) : { w: 0.5, d: dz, sens: -1, roc: !herbe, n };
        else if (s === EAU) c = { w: 0.15, d: dz, sens: -1 };
        else c = dz > 1.5 * LV ? { w: 0.42, d: dz, sens: -1, roc: true, n } : { w: 0.3, d: dz, sens: -1 };
        if (c && s !== ROC && s !== EAU && (s !== PAROI || !herbe) && (dz > 1.5 * LV || s === PAROI || sn === VIDE)) roche = true;
      } else if (Ln > L + 1e-4 && !(s === EAU) && sn !== EAU && sn !== VIDE) {
        // le voisin est plus haut : cette case porte le pan si c'est un obstacle et le voisin un sol où l'on marche
        const dz = Ln - L, n = Math.max(1, Math.round(dz / LV));
        if ((s === ROC || s === ARBRE) && pas(sn) && !(sn === SOL && s === ARBRE && dz < 1.5 * LV)) {
          c = { w: s === ROC && d === 0 ? (n === 1 ? 0.8 : 0.95) : n === 1 ? 0.55 : 0.62, d: dz, sens: 1, roc: s === ROC || dz > 1.5 * LV, n };
          roche = true;
        }
      }
      cotes.push(c);
    });
    // coins rentrants : la diagonale plus basse, aucun des deux côtés ne descend → quart d'entonnoir ; et coins où un
    // voisin plus haut se termine (le pan qui monte fait le tour du coin)
    const coins = [];
    for (const [a, b, ca, cb] of [[1, -1, 1, 0], [1, 1, 1, 2], [-1, 1, 3, 2], [-1, -1, 3, 0]]) {
      const j = this.cell(x + a, y + b), sj = this.sorte[j], Lj = this.niv[j];
      if (s === MARCHE || sj === MARCHE) { coins.push(null); continue; }
      const A = cotes[ca], Bc = cotes[cb];
      if (Lj < L - 1e-4 && !(A && A.sens < 0) && !(Bc && Bc.sens < 0)) {
        // les deux voisins de côté sont à notre niveau (ou plus haut) : le coin de la diagonale entre dans la case
        const ja = this.cell(x + a, y), jb = this.cell(x, y + b);
        if (this.niv[ja] >= L - 1e-4 && this.niv[jb] >= L - 1e-4) {
          const dz = L - Lj, sa = this.sorte[ja], sb = this.sorte[jb];
          if (pas(s) && (sj === ROC || sj === ARBRE)) { coins.push(null); continue; }
          // largeur : celle des pans voisins qui descendent vers la diagonale
          const n = Math.max(1, Math.round(dz / LV)), roc = sj !== VIDE && sj !== EAU && (s === ROC || sa === ROC || sb === ROC || dz > 1.5 * LV);
          const w = sj === VIDE ? 0.03 : sj === EAU ? 0.18 : roc ? (n === 1 ? 0.7 : 0.8) : s === PAROI ? 0.6 : 0.3;
          coins.push({ w, d: dz, sens: -1, roc, n }); continue;
        }
      }
      if (Lj > L + 1e-4 && !(A && A.sens > 0) && !(Bc && Bc.sens > 0) && (s === ROC || s === ARBRE) && pas(sj)) {
        const ja = this.cell(x + a, y), jb = this.cell(x, y + b);
        if (this.niv[ja] <= L + 1e-4 && this.niv[jb] <= L + 1e-4) { const n = Math.max(1, Math.round((Lj - L) / LV)); coins.push({ w: s === ROC ? (n === 1 ? 0.7 : 0.8) : 0.42, d: Lj - L, sens: 1, roc: s === ROC, n }); continue; }
      }
      coins.push(null);
    }
    // plus bas niveau atteint par les pans de la case (strates des pans de roche)
    let bas = L, haut = L;
    for (const c of [...cotes, ...coins]) if (c) { if (c.sens < 0) bas = Math.min(bas, L - c.d); else haut = Math.max(haut, L + c.d); }
    if (s === MARCHE) { bas = this.bas[i]; haut = L; }
    B = { s, L, cotes, coins, fam: roche && fam === F_SOL ? F_ROC : fam, sol: !roche || s !== ROC, bio: this.bio[i], levre: this.levreDe(x, y, s), haut, bas, plate: !cotes.some(Boolean) && !coins.some(Boolean) && s !== MARCHE };
    // un sol où l'on marche dont un bord tombe en falaise garde le sol généré sur son dessus (seul le pan est en roche)
    B.dessusSol = s !== ROC;
    this.bords.set(k, B);
    return B;
  }
  /** plus haut point d'une case (son niveau, ou le haut du pan qui monte vers un voisin) */
  hauteurMax(x, y) { const B = this.bordsDe(x, y); return B.s === VIDE ? RAVIN : Math.max(B.L, B.haut); }
  /** largeur d'un pan modulée le long du bord (un talus n'a pas le même angle partout) ; u : abscisse le long du bord */
  largeur(c, u, seed) { return Math.min(c.w >= 0.99 ? 1 : 0.95, c.w * (0.82 + 0.36 * lisse1(u, 2.3, seed))); }

  /** hauteur d'un point (px, pz) de la case (x, y) selon ses bords (pans, coins arrondis, entonnoirs) */
  hauteurDans(x, y, px, pz) {
    const B = this.bordsDe(x, y), L = B.L;
    if (B.s === VIDE) return RAVIN;
    if (B.s === MARCHE) {
      const [dx, dy] = this.sensMarche(x, y), lo = B.bas, hi = B.L;
      // fraction de la montée : 0 côté bas, 1 côté haut
      const f = dx > 0 ? px - x : dx < 0 ? 1 - (px - x) : dy > 0 ? pz - y : 1 - (pz - y);
      return lo + (hi - lo) * Math.max(0, Math.min(1, f));
    }
    if (B.plate) return L;
    const fx = px - x, fz = pz - y;
    // distance normalisée (0 : haut du pan, 1 : bas) dans la bande de chaque côté qui descend ; nord, est, sud, ouest
    const [cN, cE, cS, cW] = B.cotes;
    const wN = cN ? this.largeur(cN, px, 11) : 0, wE = cE ? this.largeur(cE, pz, 12) : 0, wS = cS ? this.largeur(cS, px, 13) : 0, wW = cW ? this.largeur(cW, pz, 14) : 0;
    let h = L;
    // pans qui descendent (la case est plus haute) : coins sortants arrondis (distance elliptique)
    const dn = (c, w, t) => (c && c.sens < 0 ? Math.max(0, (t - (1 - w)) / w) : 0);
    const sxE = dn(cE, wE, fx), sxW = dn(cW, wW, 1 - fx), szS = dn(cS, wS, fz), szN = dn(cN, wN, 1 - fz);
    const sx = Math.max(sxE, sxW), sz = Math.max(szS, szN);
    if (sx > 0 || sz > 0) {
      const sv = Math.min(1, Math.hypot(sx, sz));
      const cx = sxE >= sxW ? cE : cW, cz = szS >= szN ? cS : cN;
      const ux = sx > 0 && cx ? cx : null, uz = sz > 0 && cz ? cz : null, c = !uz || (ux && ux.d >= uz.d) ? ux : uz;
      h = Math.min(h, L - c.d * (1 - frac(1 - sv, c)));
    }
    // pans qui montent (obstacle bas contre un sol plus haut)
    const up = (c, w, t) => (c && c.sens > 0 ? Math.max(0, 1 - t / w) : 0);
    for (const [c, w, t] of [[cE, wE, 1 - fx], [cW, wW, fx], [cS, wS, 1 - fz], [cN, wN, fz]]) { const r = up(c, w, t); if (r > 0) h = Math.max(h, L + c.d * frac(r, c)); }
    // coins : entonnoirs (la diagonale plus basse) et pans qui contournent un coin plus haut
    const coin = [[1, 0], [1, 1], [0, 1], [0, 0]];
    B.coins.forEach((c, k) => {
      if (!c) return;
      const [ax, az] = coin[k], dist = Math.hypot(fx - ax, fz - az), w = c.w;
      if (dist >= w) return;
      const r = 1 - dist / w;
      if (c.sens < 0) h = Math.min(h, L - c.d * (1 - frac(1 - r, c)));
      else h = Math.max(h, L + c.d * frac(r, c));
    });
    return h;
  }
  /** hauteur d'un sommet de la grille : sur un bord ou un coin de case, la plus haute des cases qui le touchent */
  sommet(px, pz) {
    const cx = Math.floor(px + 1e-7), cz = Math.floor(pz + 1e-7);
    const xs = px - cx < 1e-6 ? [cx - 1, cx] : [cx], zs = pz - cz < 1e-6 ? [cz - 1, cz] : [cz];
    let h = -Infinity, toutVide = true;
    for (const y of zs) for (const x of xs) {
      if (this.sorteDe(x, y) === VIDE) continue;
      toutVide = false;
      h = Math.max(h, this.hauteurDans(x, y, px, pz));
    }
    return toutVide ? RAVIN : h;
  }
  /** hauteurs d'un bloc (sommets de la case ci·16 − 1 à …), gardées */
  bloc(ci, cj) {
    const k = ci + ',' + cj; let b = this.blocs.get(k);
    if (b) return b;
    const N = CH * RN + 1 + 2 * P, h = new Float32Array(N * N), x0 = ci * CH, z0 = cj * CH;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = this.sommet(x0 + (i - P) / RN, z0 + (j - P) / RN);
    b = { h, N, x0, z0 };
    this.blocs.set(k, b);
    if (this.blocs.size > 160) { const k0 = this.blocs.keys().next().value; this.blocs.delete(k0); }
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
  /** hauteur où se tient un personnage en (x, z) : le niveau de sa case (le replat), la rampe des marches, le tablier
   *  d'une passerelle au-dessus d'un ravin */
  Hmarche(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z), b = this.base;
    if (b.in(cx, cz) && b.get(cx, cz) === T.BRIDGE && ravin(b, cx, cz)) return b.height(cx, cz) * LV;
    const s = this.sorteDe(cx, cz);
    if (s === MARCHE) return this.hauteurDans(cx, cz, x, z);
    if (s === SOL || s === BAT) return this.nivDe(cx, cz);
    return this.H(x, z);
  }
  /** le point (x, z) est-il au fond d'un ravin ? */
  fondRavin(x, z) { return this.sorteDe(Math.floor(x), Math.floor(z)) === VIDE; }
  /** le point (x, z) est-il sur un pan (falaise, talus) ? */
  surParoi(x, z) { const s = this.sorteDe(Math.floor(x), Math.floor(z)); return s === PAROI || Math.abs(this.H(x, z) - this.nivDe(Math.floor(x), Math.floor(z))) > 0.08 * LV; }
  /** hauteur où poser un sprite (arbre, rocher, panneau) : le dessus de sa case */
  Hpose(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z), s = this.sorteDe(cx, cz);
    if (s === MARCHE || s === VIDE) return this.H(x, z);
    return this.nivDe(cx, cz);
  }
  /** niveau (unités du monde) où poser un bâtiment : celui de sa porte, sinon de son coin */
  niveauBatiment(b) { return b.doorX != null ? this.nivDe(b.doorX, b.doorY) : this.nivDe(b.x, b.y + b.d - 1); }

  /** maillage du sol d'un bloc (bw × bh cases) : les cases plates en deux triangles (fusionnées par rangées), les autres
   *  en RN × RN quarts ; attributs par case (famille, biome, lèvre ; niveaux haut et bas), pied des falaises par sommet */
  geoSol(ci, cj, bw, bh, rocheH = 0) {
    const b = this.bloc(ci, cj), N = b.N, TH = bh + rocheH, R1 = RN + 1;
    const x0 = b.x0, z0 = b.z0, hb = b.h;
    // (au pire, chaque case a ses (RN + 1)² sommets et RN² quarts)
    const nvMax = bw * bh * R1 * R1, pos = new Float32Array(nvMax * 3), uv = new Float32Array(nvMax * 2), fam = new Float32Array(nvMax * 4);
    const niv = new Float32Array(nvMax * 2), pied = new Float32Array(nvMax * 4), bord = new Float32Array(nvMax * 4), idx = new Uint32Array(bw * bh * RN * RN * 6);
    let nv = 0, ni = 0;
    const hh = (i, j) => hb[(j + P) * N + i + P];
    // pied des falaises : les côtés de la case qui touchent un voisin plus haut (le shader en tire la distance au pied)
    const seuil = 0.12 * LV, CO = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const cotesHauts = (x, y, L) => CO.map(([dx, dy]) => (this.hauteurMax(x + dx, y + dy) > L + seuil ? 1 : 0));
    const F = [0, 0, 0, 0];
    let NV0 = 0, NV1 = 0, PDc = null, BD = [0, 0, 0, 0];
    const sommet = (i, j, y) => {
      const v = nv++;
      pos[v * 3] = x0 + i / RN; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z0 + j / RN;
      uv[v * 2] = i / (bw * RN); uv[v * 2 + 1] = j / RN / TH;
      fam[v * 4] = F[0]; fam[v * 4 + 1] = F[1]; fam[v * 4 + 2] = F[2]; fam[v * 4 + 3] = F[3];
      niv[v * 2] = NV0; niv[v * 2 + 1] = NV1;
      pied[v * 4] = PDc[0]; pied[v * 4 + 1] = PDc[1]; pied[v * 4 + 2] = PDc[2]; pied[v * 4 + 3] = PDc[3];
      bord[v * 4] = BD[0]; bord[v * 4 + 1] = BD[1]; bord[v * 4 + 2] = BD[2]; bord[v * 4 + 3] = BD[3];
      return v;
    };
    // un quadrilatère (a : sud-ouest, b : sud-est, c : nord-est, d : nord-ouest), coupé selon sa plus courte diagonale
    const quad = (a, bb, c, d) => {
      if (Math.abs(pos[a * 3 + 1] - pos[c * 3 + 1]) <= Math.abs(pos[bb * 3 + 1] - pos[d * 3 + 1])) { idx[ni++] = a; idx[ni++] = bb; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
      else { idx[ni++] = a; idx[ni++] = bb; idx[ni++] = d; idx[ni++] = bb; idx[ni++] = c; idx[ni++] = d; }
    };
    const plat = (X, Y) => { const Bq = this.bordsDe(X, Y); if (!Bq.plate || Bq.s === VIDE) return false; for (let j = 0; j <= RN; j += RN) for (let i = 0; i <= RN; i += RN) if (Math.abs(hh((X - x0) * RN + i, (Y - z0) * RN + j) - Bq.L) > 1e-5) return false; return true; };
    const grille = new Uint32Array(R1 * R1);
    for (let cy = 0; cy < bh; cy++) {
      for (let cx = 0; cx < bw;) {
        const x = x0 + cx, y = z0 + cy, B = this.bordsDe(x, y);
        // famille : 1 roche (dessus en dalles, pans en pierres), 5 sol généré dessus et roche sur les pans, 0 sol, 4 marches
        F[0] = B.s === ROC ? F_ROC : B.fam === F_ROC ? 5 : B.fam; F[1] = B.bio; F[2] = B.levre; F[3] = B.L;
        NV0 = B.haut; NV1 = B.bas; PDc = cotesHauts(x, y, B.L); BD = B.cotes.map((c) => (c && c.sens < 0 ? c.w : 0));
        const sansPied = !PDc[0] && !PDc[1] && !PDc[2] && !PDc[3];
        // case plate (et ses voisines plates au même niveau, sans pied) : deux triangles
        if (B.s === VIDE || plat(x, y)) {
          let ex = cx + 1;
          while (B.s !== VIDE && ex < bw && sansPied) {
            const Bq = this.bordsDe(x0 + ex, y);
            if (!plat(x0 + ex, y) || Math.abs(Bq.L - B.L) > 1e-5 || Bq.fam !== B.fam || Bq.s === ROC !== (B.s === ROC) || Bq.bio !== B.bio || Bq.levre !== B.levre || cotesHauts(x0 + ex, y, Bq.L).some(Boolean)) break;
            ex++;
          }
          if (B.s === VIDE) F[0] = F_VIDE;
          const i0 = cx * RN, i1 = ex * RN, j0 = cy * RN, j1 = j0 + RN, Y = B.s === VIDE ? RAVIN : B.L;
          quad(sommet(i0, j1, Y), sommet(i1, j1, Y), sommet(i1, j0, Y), sommet(i0, j0, Y));
          cx = ex; continue;
        }
        for (let j = 0; j <= RN; j++) for (let i = 0; i <= RN; i++) grille[j * R1 + i] = sommet(cx * RN + i, cy * RN + j, hh(cx * RN + i, cy * RN + j));
        for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) quad(grille[(j + 1) * R1 + i], grille[(j + 1) * R1 + i + 1], grille[j * R1 + i + 1], grille[j * R1 + i]);
        cx++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, nv * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, nv * 2), 2));
    g.setAttribute('fam', new THREE.BufferAttribute(fam.subarray(0, nv * 4), 4));
    g.setAttribute('niv', new THREE.BufferAttribute(niv.subarray(0, nv * 2), 2));
    g.setAttribute('pied', new THREE.BufferAttribute(pied.subarray(0, nv * 4), 4));
    g.setAttribute('bord', new THREE.BufferAttribute(bord.subarray(0, nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(idx.slice(0, ni), 1));
    // les cases du bloc et leur bordure, lues par le shader pour raccorder les textures (famille, biome, niveau)
    const cw = bw + 2, chh = bh + 2, cd = new Uint8Array(cw * chh * 4);
    for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
      const Bq = this.bordsDe(x0 + i - 1, z0 + j - 1), o = (j * cw + i) * 4;
      cd[o] = Bq.s === ROC ? 1 : Bq.s === VIDE ? 3 : Bq.s === MARCHE ? 4 : Bq.s === SOL ? 0 : 2; cd[o + 1] = Bq.bio;
      cd[o + 2] = Math.max(0, Math.min(255, Math.round(Bq.L / LV * 4) + 64)); cd[o + 3] = 255;
    }
    const ct = new THREE.DataTexture(cd, cw, chh, THREE.RGBAFormat);
    ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter; ct.generateMipmaps = false; ct.needsUpdate = true;
    g.userData.cases = ct; g.userData.orig = [x0, z0];
    g.computeBoundingSphere();
    return g;
  }
  // le reste du sol est dans geoSol (les parois, facettes et ravins du prototype ?relief3d n'existent pas ici)
  geoParois() { return null; }
  geoFacettes() { return null; }
  geoRavin() { return null; }
  geoPentes() { return null; }
}

/** profil d'une pente douce, de son haut (0) à son pied (1) : presque droit, le haut un peu arrondi */
function profil(s) { s = Math.max(0, Math.min(1, s)); return s < 0.12 ? s * s / 0.24 : s - 0.06 + 0.06 * (s - 0.12) / 0.88; }
/** un étage de roche, de son pied (0) à son haut (1), en fraction de sa hauteur : un pan incliné (~63°, comme les tuiles
 *  de HGSS) sur un peu plus de la moitié de sa largeur, puis le haut s'arrondit jusqu'au replat (un quart d'ellipse : une
 *  pierre bombée) ; le reste de la case est le dessus plat */
function bosse(v) { v = Math.max(0, Math.min(1, v)); if (v < 0.55) return 0.62 * v / 0.55; const q = (1 - v) / 0.45; return 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - q * q)); }
/** hauteur (fraction du dénivelé) d'un pan à la distance u (0 : son pied, 1 : son haut, rapportée à sa largeur) : pente
 *  douce, ou pan de roche en étages — un par niveau, chacun reculé d'une demi-case (ou moins si la case est trop étroite
 *  pour tous) sur celui du dessous, son haut arrondi */
function frac(u, c) {
  u = Math.max(0, Math.min(1, u));
  if (!c.roc) return 1 - profil(1 - u);
  const n = c.n || 1;
  // un seul niveau (les terrasses : de la place en largeur) : une pente arrondie sur toute sa largeur, comme les rochers
  // de HGSS — 63° au pied, puis elle se courbe jusqu'à l'horizontale (un quart de sinus)
  if (n <= 1) return Math.sin(u * Math.PI / 2);
  const a = 1 / (1 + (n - 1) * 1.12), sg = 1.12 * a, k = Math.min(n - 1, Math.floor(u / sg)), loc = u - k * sg;
  return (k + (loc >= a ? 1 : bosse(loc / a))) / n;
}
