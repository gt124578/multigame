// odyssee/js/render/world3d.js — rendu « fausse 3D » façon DS : sol en tuiles, bâtiments en volume,
// arbres / herbes / personnages en sprites verticaux, caméra inclinée en perspective étroite, rendu basse résolution.
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { pente, ravin, mont } from '../world/relief.js';
import { sensPont } from '../world/ponts.js';
import { buildAtlas, buildAnimAtlas, buildSprites, applySpriteImages, facade, sideWall, roofTex, roofColors, kitColor, PAL, SOL16 } from './textures.js';
import { SPRITES } from '../data/sprites.js';
import { Sol } from './sol.js';
import { archeGrotte, jourGrotte } from './grottes.js';
import { sorteCase, K as SORTE } from './solgen.js';
import { WeatherSystem } from './weather3d.js';
import { Ombres } from './ombres.js';
import { teinteHeure, nuitHeure, VITRE_NUIT, Lumieres } from './lumieres.js';
import { choisirModele, geometriesModele, couleurBase, EMPRISES } from './bati-jeu.js';
import { variantesArbres, variante, miroir, teinte } from './arbres.js';
import { dessinHerbe, imageHerbe, NIMAGES, MARGE as HERBE_M, HAUTEUR as HERBE_H } from './herbes.js';
import { Relief3D, relief3dActif, matParoi, matFacettes, facettesActives, matPente, matsPente, LV as R3LV } from './relief3d.js';
import { setRelief3dSol, setReliefHGSSSol } from './solgen.js';
import { ReliefHGSS, reliefHGSSActif } from './falaises.js';

export const EL = 55 * Math.PI / 180, FOV = 13;

// Une tuile fait 16 × 16 pixels à l'écran (la projection est resserrée en largeur pour que les tuiles soient carrées,
// comme sur DS) ; un pixel de sprite vaut un pixel d'écran : WPX en largeur, HPX en hauteur (unités du monde).
export const WPX = 1 / 16, HPX = Math.tan(EL) / 16;
// À l'écran, une case du décor fait TILE_PX pixels : les tuiles (dessinées en 16 × 16) sont agrandies ×2, les sprites
// « version 2 » (personnages, nature) sont dessinés deux fois plus fins (densité 2) et affichés pixel pour pixel.
export const TILE_PX = 32;
const WPX_STR = (1 / TILE_PX).toFixed(8), HPX_STR = (Math.tan(EL) / TILE_PX).toFixed(8);
/** taille dans le monde d'un sprite de la planche (selon sa densité) */
const SW = (r) => r.w * WPX / (r.d || 1), SH = (r) => r.h * HPX / (r.d || 1);

/*
 * Sprites « à la Génération 4 » (Platine, HeartGold/SoulSilver) : les personnages, arbres, herbes et objets ne sont pas
 * des panneaux plantés dans le décor 3D. Ils sont dessinés à plat, à l'écran, toujours à leur taille exacte (un pixel
 * du dessin = un pixel d'écran, calé sur la grille), posés à l'endroit où se projettent leurs pieds. Seule leur
 * profondeur vient de la 3D (celle d'un panneau vertical à cet endroit) : un arbre passe derrière une maison, un
 * personnage devant un autre, sans jamais être déformé par la perspective, en haut comme en bas de l'écran.
 */
// uEch : les sprites rapetissent quand l'éditeur de carte voit de plus haut (1 en jeu : pixel pour pixel)
export const SPRITE_UNIFORMS = { uRes: { value: new THREE.Vector2(400, 240) }, uEch: { value: 1 } };
/**
 * Bâtiments : leur profondeur est celle de leur façade (comme un grand sprite posé sur sa rangée de devant). Un arbre
 * ou un personnage dont les pieds sont derrière la façade passe derrière toute la maison, toit compris ; devant la
 * façade, il passe devant. C'est le tri par rangée des jeux DS, sans que les toits ne coupent les arbres voisins.
 */
function frontDepth(mat, zFront) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uZFront = { value: zFront };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uZFront;')
      .replace('#include <project_vertex>', `
        vec4 fW = modelMatrix * vec4( transformed, 1.0 );
        vec4 mvPosition = viewMatrix * fW;
        vec4 fC = projectionMatrix * mvPosition;
        vec4 fF = projectionMatrix * viewMatrix * vec4( fW.x, fW.y, max( fW.z, uZFront ), 1.0 );
        gl_Position = vec4( fC.xy * ( fF.w / fC.w ), fF.z, fF.w );`);
  };
  mat.customProgramCacheKey = () => 'frontDepth';
  return mat;
}
/** profondeur d'un bâtiment à parties ouvertes (terrasse, porche, galerie : `b.libres`) : chaque morceau prend la profondeur
 *  du devant de la masse bâtie de sa colonne (comme frontDepth, mais case par case), et rien n'est avancé au-dessus d'une
 *  case où l'on marche. Un personnage sur la terrasse passe ainsi devant la façade du fond et derrière l'aile qui avance.
 *  Calculé au pixel (gl_FragDepth) : une même face peut couvrir des colonnes de profondeurs différentes. */
const GRILLE_MAX = 128;
function profondeurGrille(mat, b) {
  const w = b.w, d = b.d, libre = new Set(b.libres.map(([i, j]) => i + ',' + j)), zf = new Float32Array(GRILLE_MAX).fill(-1);
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    if (libre.has(i + ',' + j)) continue;
    let k = j; while (k + 1 < d && !libre.has(i + ',' + (k + 1))) k++;
    zf[j * w + i] = b.y + k + 1 + 0.02;
  }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uZF = { value: zf }; sh.uniforms.uGrille = { value: new THREE.Vector4(b.x, b.y, w, d) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMondeG;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMondeG = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMondeG;\nuniform float uZF[${GRILLE_MAX}];\nuniform vec4 uGrille;\nuniform mat4 projectionMatrix;`)
      .replace(/}\s*$/, `
        int gi = int( clamp( floor( vMondeG.x - uGrille.x ), 0.0, uGrille.z - 1.0 ) ), gj = int( clamp( floor( vMondeG.z - uGrille.y ), 0.0, uGrille.w - 1.0 ) );
        float gz = uZF[ gj * int( uGrille.z ) + gi ];
        vec4 gC = projectionMatrix * viewMatrix * vec4( vMondeG.x, vMondeG.y, gz < 0.0 ? vMondeG.z : max( vMondeG.z, gz ), 1.0 );
        gl_FragDepth = gC.z / gC.w * 0.5 + 0.5;
      }`);
  };
  mat.customProgramCacheKey = () => 'profondeurGrille';
  return mat;
}
const DECALS = new Set(['fleche', 'vent', 'courant', 'dalle', 'tp', 'socle', 'pollen', 'alveole', 'interrupteur', 'estrade', 'tapis']);
const WIDE_DECO = new Set(['healer', 'sofa', 'bench', 'startertable', 'fireplace', 'rug']);
/** décor du dehors posé avec une ombre au sol (leur ombre violette, dessinée dans le sprite, a été retirée) */
const OMBRE_DECO = new Set(['banc', 'parasol', 'tonneau', 'caisse', 'panneau_bois', 'borne', 'lanterne', 'stele']);
function screenSprite(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRes = SPRITE_UNIFORMS.uRes; sh.uniforms.uEch = SPRITE_UNIFORMS.uEch;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 anchor;\nuniform vec2 uRes;\nuniform float uEch;')
      .replace('#include <project_vertex>', `
        vec4 sW = modelMatrix * vec4( transformed, 1.0 );
        vec4 sA = modelMatrix * vec4( anchor, 1.0 );
        vec3 sD = sW.xyz - sA.xyz;
        vec4 sAC = projectionMatrix * viewMatrix * sA;
        vec2 sPx = floor( ( sAC.xy / sAC.w * 0.5 + 0.5 ) * uRes + 0.5 ) + vec2( sD.x / ${WPX_STR}, sD.y / ${HPX_STR} ) / uEch;
        vec4 mvPosition = viewMatrix * sW;
        vec4 sPC = projectionMatrix * mvPosition;
        // deux sprites sur la même rangée auraient exactement la même profondeur (pixels qui se battent, « hachurés ») :
        // celui de gauche passe devant celui de droite (léger décalage selon la colonne, bien plus petit qu'une rangée).
        // Le décalage rapproche le sprite de la caméra : s'il l'éloignait, le sol passerait devant le bas du dessin (les pieds)
        float sBias = - ( 64.0 - mod( sA.x, 64.0 ) ) * 2.0e-6;
        gl_Position = vec4( ( sPx / uRes * 2.0 - 1.0 ) * sPC.w, sPC.z + sBias * sPC.w, sPC.w );`);
  };
  mat.customProgramCacheKey = () => 'screenSprite';
  return mat;
}
/**
 * Herbe de devant (herbes.js) : couchée sur le sol et projetée comme lui, mais sa profondeur est celle du panneau
 * vertical dressé au bord sud de sa case (z de sa position), là où le rayon de la caméra le traverse : elle passe
 * devant qui se tient dans la case, derrière ce qui est plus au sud.
 */
function herbeDebout(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
        vec4 hW = modelMatrix * vec4( transformed, 1.0 );
        vec4 mvPosition = viewMatrix * hW;
        gl_Position = projectionMatrix * mvPosition;
        float hZ = modelMatrix[3][2];
        vec3 hQ = cameraPosition + ( hW.xyz - cameraPosition ) * ( ( hZ - cameraPosition.z ) / ( hW.z - cameraPosition.z ) );
        vec4 hQC = projectionMatrix * viewMatrix * vec4( hQ, 1.0 );
        gl_Position.z = hQC.z / hQC.w * gl_Position.w;`);
  };
  mat.customProgramCacheKey = () => 'herbeDebout';
  return mat;
}
const CH = 16;
// lignes de la planche des personnages (img/chars.png) ; les anciens noms des sprites du prototype pointent vers les nouveaux
export const CHAR_ROWS = { ...((SPRITES.chars && SPRITES.chars.rows) || {}) };
// taille d'une case de la planche des personnages (32 × 32 depuis la version 2 de la bible)
const CW = SPRITES.chars?.w || 24, CHH = SPRITES.chars?.h || 32, CD = SPRITES.chars?.d || 1;
// personnages des Terres du Sud en attendant leur dessin : un sosie proche
const PAIRS = 6;   // tenues d'autres joueurs affichables en même temps
const CHAR_ALIAS = { red: 'player_m', green: 'player_f', prof: 'scientifique', clerk: 'vendeur', youngster: 'gamin', lass: 'habitante', sailor: 'marin', hiker: 'montagnard', cooltrainer_f: 'habitante' };
const DIR_COL = { down: 0, left: 1, right: 2, up: 3 };

function tex(canvasOrImg) {
  const t = new THREE.Texture(canvasOrImg);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** reliefs des grottes : hauteur à l'écran (en cases) du haut de chaque gradin, la première marche est la plus haute */
const RLEVEL = [0, 0.75, 1.2, 1.6].map((h) => h * Math.tan(EL)), RPX = (k) => (RLEVEL[k + 1] - RLEVEL[k]) / Math.tan(EL);
/** gradin de chaque case de roche : distance (en cases) au sol praticable le plus proche, plafonnée à 3 */
function caveTiers(m) {
  const n = m.w * m.h, d = new Uint8Array(n).fill(255), q = [];
  for (let i = 0; i < n; i++) if (m.t[i] !== T.CAVEWALL) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % m.w, y = (i / m.w) | 0;
    for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (a < 0 || b < 0 || a >= m.w || b >= m.h) continue;
      const j = b * m.w + a; if (d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  // une paroi ne monte pas vers la caméra : une case de roche ne dépasse pas le nombre de cases de roche au-dessus d'elle
  // (sinon le dessus d'un gradin cacherait les pieds de qui marche juste au nord)
  for (let x = 0; x < m.w; x++) {
    let run = 3; // le bord de la carte compte comme de la roche
    for (let y = 0; y < m.h; y++) {
      const i = y * m.w + x;
      if (m.t[i] !== T.CAVEWALL) { run = 0; continue; }
      d[i] = Math.min(3, d[i] === 255 ? 3 : d[i], run); run++;
    }
  }
  return d;
}
/** relief des grottes en pentes (comme HeartGold / SoulSilver : de la roche, pas des blocs carrés) : hauteur aux sommets
 *  d'une grille de RN × RN points par case. Chaque gradin monte en pente sur RS case depuis le bord de la roche du gradin
 *  du dessous (distance au plus proche carré qui n'en fait pas partie) : coins saillants arrondis, coins rentrants en creux */
const RN = 4, RS = 0.5;
function caveHeights(m, tiers) {
  const W = m.w * RN + 1, H = m.h * RN + 1, h = new Float32Array(W * H);
  // toute la roche monte au moins d'un gradin (même au ras d'un sol au nord : sa pente regarde vers le fond, on ne la voit pas)
  const tierAt = (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 3 : m.t[y * m.w + x] === T.CAVEWALL ? Math.max(1, tiers[y * m.w + x]) : 0);
  const R = Math.ceil(RS) + 1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = i / RN, pz = j / RN, cx = Math.floor(px - 1e-6), cz = Math.floor(pz - 1e-6);
    let v = 0;
    for (let t = 1; t <= 3; t++) {
      // distance au plus proche carré de gradin < t
      let d = 9;
      for (let b = cz - R; b <= cz + R + 1; b++) for (let a = cx - R; a <= cx + R + 1; a++) {
        if (tierAt(a, b) >= t) continue;
        const dx = Math.max(a - px, 0, px - (a + 1)), dz = Math.max(b - pz, 0, pz - (b + 1));
        const dd = Math.hypot(dx, dz); if (dd < d) d = dd;
      }
      if (d <= 0) break;
      const u = Math.min(1, d / RS);
      v += (RLEVEL[t] - RLEVEL[t - 1]) * (1 - 0.35 * (1 - u) * (1 - u) - 0.65 * (1 - u));
      if (u < 1) break;
    }
    h[j * W + i] = v;
  }
  return { h, W };
}

/** roche et sol d'une grotte selon le lieu : grottes marines, magma, glace, montagne, sinon terre */
export function caveBiome(m) {
  const id = m.id || '', nm = (m.name || '').toLowerCase();
  if (m.biome) return m.biome;
  if (/marees|maree|tourbillon|sanctuaire/.test(id) || /marée|tourbillon/.test(nm)) return 'mer';
  if (/magma/.test(id) || /magma|volcan/.test(nm)) return 'magma';
  if (/givr|glace|neige/.test(id + nm)) return 'glace';
  if (/victoire|mont/.test(id + nm)) return 'montagne';
  return 'terre';
}
/** clé de tuile de relief : sol ('s', variantes pondérées) */
function reliefKey(A, b, kind, v) {
  const i = v < 0.42 ? 0 : v < 0.8 ? 1 : v < 0.93 ? 2 : 3, k = `r${kind}_${b}_${i}`;
  return A[k] ? k : A[`r${kind}_${b}_0`] ? `r${kind}_${b}_0` : null;
}

/** biome des plateaux de roche dehors (montagnes des entrées de grottes et du bord du monde) */
function bioDehors(theme) { return theme === 'snow' ? 'glace' : theme === 'volcanic' ? 'magma' : theme === 'beach' || theme === 'sea' ? 'mer' : theme === 'canyon' || theme === 'desert' ? 'ocre' : 'montagne'; }
/** roche des falaises du dehors (parois, rebords, marches) : celle des montagnes, ocre au désert, brune en forêt */
function bioFalaise(zone) { const th = zone?.theme; return zone?.roche || (th === 'snow' ? 'glace' : th === 'volcanic' ? 'magma' : th === 'canyon' || th === 'desert' ? 'ocre' : th === 'forest' || th === 'automne' ? 'terre' : 'montagne'); }
/** herbe (ou neige, sable…) qui déborde en haut d'une falaise */
function levreFalaise(th) { return th === 'snow' ? 'neige' : th === 'volcanic' ? 'cendre' : th === 'desert' || th === 'canyon' ? 'sable' : th === 'forest' || th === 'foretsombre' ? 'foret' : 'herbe'; }
/** bruit lisse (valeurs aléatoires sur une grille de `s` cases, interpolées) */
function lisse(x, y, s) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
/** la carte telle que le rendu la voit (le jeu, lui, garde la vraie carte : collisions et rencontres ne changent pas).
 *  Comme dans HeartGold / SoulSilver, on ne voit jamais le bord du monde : au-delà, la mer continue si le bord est de
 *  l'eau, sinon une forêt dense, coupée de montagnes (plateaux de roche, comme dans les grottes) ; dans une grotte, la
 *  roche continue. Autour des entrées de grottes, les arbres qui bordent l'entrée deviennent la montagne de la grotte. */
export function vueCarte(map) {
  if (!map.outdoor && map.floor !== 'cave') return map;
  const v = Object.create(map); v.ext = true; v.base = map;
  const roc = new Set();
  if (map.outdoor) for (const b of map.buildings || []) {
    if (b.kind !== 'cave') continue;
    for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) roc.add(x + ',' + y);
    for (let y = b.y - 3; y < b.y + b.d; y++) for (let x = b.x - 3; x < b.x + b.w + 3; x++) {
      const q = map.in(x, y) ? map.get(x, y) : null;
      if (q === T.TREE || q === T.PINE) roc.add(x + ',' + y);
    }
  }
  // dans une grotte, une sortie au pied de la paroi du bas s'y creuse en couloir jusqu'au delà du bord (là d'où vient le
  // jour) ; un rocher isolé posé juste devant une sortie s'efface
  const couloir = new Set(); v.sorties = [];
  if (!map.outdoor) for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.get(x, y) !== T.CAVEDOOR) continue;
    let mur = map.get(x, y + 1) === T.CAVEWALL;
    for (let yy = y + 1; mur && yy < map.h; yy++) if (map.get(x, yy) !== T.CAVEWALL) mur = false;
    let n = 0;
    if (mur) for (let yy = y + 1; yy < map.h + 3; yy++, n++) couloir.add(x + ',' + yy);
    else if (map.get(x, y + 1) === T.CAVEWALL && map.get(x - 1, y + 1) !== T.CAVEWALL && map.get(x + 1, y + 1) !== T.CAVEWALL) { couloir.add(x + ',' + (y + 1)); n = 1; }
    v.sorties.push({ x, y, n });
  }
  const W = map.w, H = map.h, cl = (a, n) => Math.max(0, Math.min(n - 1, a));
  v.get = (x, y) => {
    if (couloir.size && couloir.has(x + ',' + y)) return T.CAVE;
    if (map.in(x, y)) { if (roc.size && roc.has(x + ',' + y)) return T.CAVEWALL; const q = map.get(x, y); return q === T.WHIRL ? T.WATER : q; }   // tourbillon : de l'eau, avec sa spirale par-dessus
    if (!map.outdoor) return T.CAVEWALL;
    const cx = cl(x, W), cy = cl(y, H), d = Math.max(Math.abs(x - cx), Math.abs(y - cy)), b = map.get(cx, cy);
    if (b === T.WATER || b === T.BRIDGE) return T.WATER;
    if (d >= 2 && lisse(x, y, 7) > 0.6) return T.CAVEWALL;
    return map.zoneAt(cx, cy)?.theme === 'snow' ? T.PINE : T.TREE;
  };
  v.zoneAt = (x, y) => map.zoneAt(cl(x, W), cl(y, H));
  v.underAt = (x, y) => map.underAt(x, y);
  return v;
}

/** bloc de roche (monticule des entrées de grottes) : faces sud / est / ouest découpées en cases de roche de la hauteur
 *  d'un gradin, dessus en roche ; y0 → y1 : bas et haut du bloc */
function rockBox(G, A, bio, x0, z0, x1, z1, y0, y1, seed, topCell = null) {
  const H = (y1 - y0) / Math.tan(EL), rows = Math.max(1, Math.round(H / 0.65)), dh = (y1 - y0) / rows;
  const cell = (i, j, k) => { const c = A[`rw_${bio}_${Math.floor(hash(i * 7 + seed, j * 13 + k) * 3)}`] || A[`rw_${bio}_0`]; return [c[0], c[1], c[2], c[1] + (c[3] - c[1]) * Math.min(1, dh / Math.tan(EL))]; };
  for (let j = 0; j < rows; j++) {
    const ya = y0 + j * dh, yb = ya + dh, sh = 0.82 + 0.06 * j + 0.04 * seed;
    for (let x = x0; x < x1 - 1e-6; x += 1) {
      const xe = Math.min(x1, x + 1), c = cell(Math.floor(x * 2), j, 1), cu = c[0] + (c[2] - c[0]) * (xe - x);
      G.quad([x, ya, z1], [xe, ya, z1], [xe, yb, z1], [x, yb, z1], c[0], c[1], cu, c[3], sh);
    }
    for (let z = z0; z < z1 - 1e-6; z += 1) {
      const ze = Math.min(z1, z + 1), c = cell(Math.floor(z * 2), j, 2), cu = c[0] + (c[2] - c[0]) * (ze - z);
      G.quad([x1, ya, ze], [x1, ya, z], [x1, yb, z], [x1, yb, ze], c[0], c[1], cu, c[3], 0.66);
      G.quad([x0, ya, z], [x0, ya, ze], [x0, yb, ze], [x0, yb, z], c[0], c[1], cu, c[3], 0.66);
    }
  }
  const t = topCell || A[`rt_${bio}_0`];
  for (let z = z0; z < z1 - 1e-6; z += 1) for (let x = x0; x < x1 - 1e-6; x += 1) {
    const xe = Math.min(x1, x + 1), ze = Math.min(z1, z + 1);
    flat(G, x, z, xe, ze, y1, [t[0], t[1], t[0] + (t[2] - t[0]) * (xe - x), t[1] + (t[3] - t[1]) * (ze - z)], 0.95 + 0.03 * seed);
  }
}

/** bloc de roche en pente (monticule des entrées de grottes, comme HeartGold / SoulSilver) : faces sud / est / ouest
 *  inclinées vers l'intérieur de `s` cases, coins en biais ; stries de la roche dans le sens de la pente, pied plus sombre */
function rockSlope(G, A, bio, x0, z0, x1, z1, y0, y1, s, seed, topCell = null) {
  const H = (y1 - y0) / Math.tan(EL), rows = Math.max(1, Math.round(H / 0.8));
  const cell = (i, k) => A[`rw_${bio}_${Math.floor(hash(i * 7 + seed, k * 13 + seed) * 3)}`] || A[`rw_${bio}_0`];
  const uv = (c, u, v) => [c[0] + (c[2] - c[0]) * u, c[1] + (c[3] - c[1]) * v];
  const foot = (t) => 0.66 + 0.34 * Math.min(1, t * 1.8);
  const lerp = (a, b, f) => a + (b - a) * f;
  for (let r = 0; r < rows; r++) {
    const ta = r / rows, tb = (r + 1) / rows, ya = lerp(y0, y1, ta), yb = lerp(y0, y1, tb);
    // sud : de x0..x1 en bas à x0+s..x1-s en haut
    const nx = Math.max(1, Math.round(x1 - x0));
    for (let i = 0; i < nx; i++) {
      const fa = i / nx, fb = (i + 1) / nx, c = cell(i, r * 3 + 1);
      const xa = (t, f) => lerp(x0 + s * t, x1 - s * t, f), za = z1 - s * ta, zb = z1 - s * tb;
      G.quadv([[xa(ta, fa), ya, za], [xa(ta, fb), ya, za], [xa(tb, fb), yb, zb], [xa(tb, fa), yb, zb]],
        [uv(c, 0, 1), uv(c, 1, 1), uv(c, 1, 0), uv(c, 0, 0)], [0.92 * foot(ta), 0.92 * foot(ta), 0.92 * foot(tb), 0.92 * foot(tb)]);
    }
    // est et ouest : de z0..z1 en bas à z0+s..z1-s en haut
    const nz = Math.max(1, Math.round(z1 - z0));
    for (let i = 0; i < nz; i++) {
      const fa = i / nz, fb = (i + 1) / nz, c = cell(i + 50, r * 3 + 2);
      const zz = (t, f) => lerp(z0 + s * t, z1 - s * t, f);
      const xe = (t) => x1 - s * t, xw = (t) => x0 + s * t;
      G.quadv([[xe(ta), ya, zz(ta, fb)], [xe(ta), ya, zz(ta, fa)], [xe(tb), yb, zz(tb, fa)], [xe(tb), yb, zz(tb, fb)]],
        [uv(c, 0, 1), uv(c, 1, 1), uv(c, 1, 0), uv(c, 0, 0)], [0.7 * foot(ta), 0.7 * foot(ta), 0.7 * foot(tb), 0.7 * foot(tb)]);
      G.quadv([[xw(ta), ya, zz(ta, fa)], [xw(ta), ya, zz(ta, fb)], [xw(tb), yb, zz(tb, fb)], [xw(tb), yb, zz(tb, fa)]],
        [uv(c, 0, 1), uv(c, 1, 1), uv(c, 1, 0), uv(c, 0, 0)], [1.0 * foot(ta), 1.0 * foot(ta), 1.0 * foot(tb), 1.0 * foot(tb)]);
    }
  }
  const t = topCell || A[`rt_${bio}_0`], X0 = x0 + s, X1 = x1 - s, Z0 = z0 + s, Z1 = z1 - s;
  for (let z = Z0; z < Z1 - 1e-6; z += 1) for (let x = X0; x < X1 - 1e-6; x += 1) {
    const xe = Math.min(X1, x + 1), ze = Math.min(Z1, z + 1);
    flat(G, x, z, xe, ze, y1, [t[0], t[1], t[0] + (t[2] - t[0]) * (xe - x), t[1] + (t[3] - t[1]) * (ze - z)], 1.04);
  }
}

/** ce qu'un modèle de bâtiment couvre à l'écran, par rapport au coin nord-ouest de son emprise (en cases) : largeur
 *  réelle (x0, x1 : galeries et débords compris) et rangée du sol où se projette son point le plus haut (zN) */
const EMPRISE_ECRAN = new Map();
function empriseEcran(parts, mod, sx, sz) {
  const k = mod.nom + JSON.stringify(mod.o || {}) + ':' + sx.toFixed(3) + ':' + sz.toFixed(3);
  let e = EMPRISE_ECRAN.get(k);
  if (e) return e;
  const tan = Math.tan(EL); e = { x0: Infinity, x1: -Infinity, zN: Infinity };
  for (const p of parts) {
    const a = p.geo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i) * sx, r = a.getZ(i) * sz - a.getY(i) / tan;
      if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; if (r < e.zN) e.zN = r;
    }
  }
  EMPRISE_ECRAN.set(k, e);
  return e;
}

/** accumulateur de géométrie (quads indexés) */
class Geo {
  constructor() { this.p = []; this.uv = []; this.c = []; this.i = []; this.n = 0; this.an = []; }
  quad(a, b, c, d, u0, v0, u1, v1, shade = 1, anchor = null) {
    if (anchor) for (let k = 0; k < 4; k++) this.an.push(...anchor);
    // a=bas-gauche, b=bas-droite, c=haut-droite, d=haut-gauche (du point de vue de la texture)
    this.p.push(...a, ...b, ...c, ...d);
    this.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
    // teinte : un gris (ombrage) ou une couleur [r, g, b] (arbres teintés un à un)
    if (Array.isArray(shade)) for (let k = 0; k < 4; k++) this.c.push(shade[0], shade[1], shade[2]);
    else for (let k = 0; k < 4; k++) this.c.push(shade, shade, shade);
    const n = this.n; this.i.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
  }
  /** quad aux coordonnées de texture et teintes données sommet par sommet (pentes des grottes) */
  quadv(ps, uvs, sh) {
    for (const q of ps) this.p.push(q[0], q[1], q[2]);
    for (const q of uvs) this.uv.push(q[0], q[1]);
    for (const k of sh) this.c.push(k, k, k);
    const n = this.n; this.i.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
  }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.an.length) g.setAttribute('anchor', new THREE.Float32BufferAttribute(this.an, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}
/** sprite vertical, pieds en (cx, cz) */
function billboard(G, cx, cz, w, h, r, y0 = 0, flip = false, shade = 1) {
  const u0 = flip ? r.u1 : r.u0, u1 = flip ? r.u0 : r.u1;
  G.quad([cx - w / 2, y0, cz], [cx + w / 2, y0, cz], [cx + w / 2, y0 + h, cz], [cx - w / 2, y0 + h, cz], u0, r.v0, u1, r.v1, shade, [cx, y0, cz]);
}
function flat(G, x0, z0, x1, z1, y, cell, shade = 1) {
  // la texture regarde vers le haut : haut de la tuile = nord (z0)
  G.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], cell[0], cell[1], cell[2], cell[3], shade);
}
/** boîte : faces sud / est / ouest / dessus */
function box(G, x0, z0, x1, z1, h, front, top, side = front, o = {}) {
  if (o.south !== false) G.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], front[0], front[1], front[2], front[3], 1);
  if (o.east !== false) G.quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], side[0], side[1], side[2], side[3], 0.78);
  if (o.west !== false) G.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], side[0], side[1], side[2], side[3], 0.78);
  if (top) G.quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], top[0], top[1], top[2], top[3], 1);
}

/** pièce de hautes herbes d'une case selon ses voisins (bords, coins, coins rentrants, sinon une des trois pleines) */
function herbePiece(m, x, y, tt, v) {
  const g = (dx, dy) => { const q = m.get(x + dx, y + dy); return q === tt || q === undefined; };
  const n = g(0, -1), s = g(0, 1), w = g(-1, 0), e = g(1, 0);
  if (!n) return !w ? 'tl' : !e ? 'tr' : 't';
  if (!s) return !w ? 'bl' : !e ? 'br' : 'bot';
  if (!w) return 'l';
  if (!e) return 'r';
  if (!g(-1, -1)) return 'in_nw';
  if (!g(1, -1)) return 'in_ne';
  if (!g(-1, 1)) return 'in_sw';
  if (!g(1, 1)) return 'in_se';
  return v < 0.5 ? 'a' : v < 0.75 ? 'b' : 'c';
}
/** style de façade d'un bâtiment : boutiques et salles selon leur rôle, bâtiments à part selon leur nom, maisons selon
 *  la ville (chalets sur la neige, maisons de pêcheurs dans les ports) */
const PORTS = new Set(['azur', 'granit', 'orage']);
function kitStyle(b, map) {
  if (b.kit) return b.kit;
  if (['center', 'mart', 'gym', 'lab', 'league'].includes(b.style)) return b.style;
  const name = b.label || b.name || '';
  if (/Musée/.test(name)) return 'musee';
  if (/Caserne/.test(name)) return 'base';
  if (/Tour Mirage/.test(name)) return 'mirage';
  if (/Phare/.test(name)) return 'phare';
  if (/Tour de la Grue/.test(name)) return 'pagode';
  if (/Centrale/.test(name)) return 'lab';
  if (/Temple/.test(name)) return 'pagode';
  if (/Brume/.test(name)) return 'base';
  if (/Phare|Capitainerie/.test(name)) return /Phare/.test(name) ? 'phare' : 'port';
  const z = map.outdoor ? map.zoneAt(b.x, b.y) : null;
  if (z?.theme === 'snow') return 'chalet';
  if (z?.town && PORTS.has(z.town)) return (b.x + b.y) % 3 === 0 ? 'port' : 'pecheur';
  return b.style;
}

export class WorldView {
  constructor(renderer, charsImg, art = {}) {
    this.renderer = renderer;
    // Pokémon qui suivent le dresseur (img/suiveurs.png) : leurs lignes s'ajoutent sous celles des personnages
    if (charsImg && art.suiveurs && SPRITES.suiveurs) {
      const c = document.createElement('canvas'); c.width = charsImg.width; c.height = charsImg.height + art.suiveurs.height;
      const x = c.getContext('2d'); x.drawImage(charsImg, 0, 0); x.drawImage(art.suiveurs, 0, charsImg.height);
      const base = Math.round(charsImg.height / CHH);
      for (const [sp, r] of Object.entries(SPRITES.suiveurs.rows)) CHAR_ROWS['poke:' + sp] = base + r;
      charsImg = c;
    }
    // une rangée de plus, tout en bas : l'apparence du joueur, composée selon sa tenue (render/tenue.js)
    if (charsImg) {
      const c = document.createElement('canvas'); c.width = charsImg.width; c.height = charsImg.height + CHH;
      c.getContext('2d').drawImage(charsImg, 0, 0);
      CHAR_ROWS.joueur = Math.round(charsImg.height / CHH);
      charsImg = c;
    }
    // et quelques rangées pour les tenues des autres joueurs
    if (charsImg) {
      const c = document.createElement('canvas'); c.width = charsImg.width; c.height = charsImg.height + CHH * PAIRS;
      c.getContext('2d').drawImage(charsImg, 0, 0);
      for (let i = 0; i < PAIRS; i++) CHAR_ROWS['pair' + i] = Math.round(charsImg.height / CHH) + i;
      charsImg = c;
    }
    this.charsCanvas = charsImg;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
    const A = buildAtlas(), N = buildAnimAtlas(), S = buildSprites();
    if (art.sprites) { const dens = art.dens || (art.dens = {}); variantesArbres(art.sprites, dens); applySpriteImages(S, art.sprites, dens); }
    this.A = A; this.N = N; this.S = S;
    // ?arbres=0 : un seul dessin par essence, sans teinte (comparaison)
    this.arbresUnis = /[?&]arbres=0/.test(globalThis.location?.search || '');
    this.charRows = charsImg ? Math.round(charsImg.height / CHH) : 10;
    this.texA = tex(A.canvas); this.texN = tex(N.canvas); this.texS = tex(S.canvas); this.texC = tex(this.packChars());
    const mk = (map, o = {}) => new THREE.MeshBasicMaterial({ map, vertexColors: true, ...o });
    this.mat = {
      ground: mk(this.texA), anim: mk(this.texN), sprite: screenSprite(mk(this.texS, { alphaTest: 0.5, side: THREE.DoubleSide })),
      chars: screenSprite(new THREE.MeshBasicMaterial({ map: this.texC, alphaTest: 0.5, side: THREE.DoubleSide })),
      // sprites isolés (objets, bulle « ! », herbes qui bougent) : pas de couleurs de sommets
      actorSprite: screenSprite(new THREE.MeshBasicMaterial({ map: this.texS, alphaTest: 0.5, side: THREE.DoubleSide })),
      // sprite couché au sol (sillage du surf)
      flatSprite: new THREE.MeshBasicMaterial({ map: this.texS, alphaTest: 0.5, side: THREE.DoubleSide }),
      // ombres au sol : dessinées à la densité de l'écran, une seule couche là où elles se croisent (ombres.js)
      shadow: (this.ombres = new Ombres()).materiau(),
      walls: mk(this.texA),
      // pièces de transition des sols (terrain du bas transparent)
      overlay: mk(this.texA, { alphaTest: 0.5 }),
      // décor animé posé sur l'eau (tourbillons)
      animOver: mk(this.texN, { alphaTest: 0.5 }),
    };
    this.tinted = Object.values(this.mat);
    this.glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 1, 16, 16, 16); g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(0.4, 'rgba(255,210,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return tex(c); })();
    this.matGlow = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.geoHalo = new THREE.PlaneGeometry(1.6, 1.6);   // halo d'un lampadaire (une géométrie pour tous)
    this.lum = new Lumieres();                           // flaques de lumière de nuit (lumieres.js)
    this.tint = new THREE.Color(1, 1, 1); this.night = 0;
    // ombre des sous-bois (zones avec `ombre`, comme le Bois Murmure) : 1 en plein jour, plus bas sous les frondaisons
    this.ombre = 1; this.ombreCible = 1; this.tintBase = [1, 1, 1];
    this.animFrame = 0; this.animT = 0;
    this.sol = new Sol(this);   // sol en pixel art généré, posé sur chaque bloc (sol.js)
    // le sol du dehors en vrai relief : façon HeartGold (falaises.js, par défaut) ou l'ancien prototype (?relief3d,
    // relief3d.js) ; ?relief=plat garde le relief peint à plat
    this.r3dHGSS = reliefHGSSActif() && !relief3dActif();
    this.r3dOn = (relief3dActif() || this.r3dHGSS) && this.sol.on; this.r3d = null;
    this.r3dOrtho = this.r3dOn && !/[?&]r3persp\b/.test(globalThis.location?.search || '');
    if (this.r3dOn && !this.r3dHGSS) setRelief3dSol(true);
    if (this.r3dOn && this.r3dHGSS) setReliefHGSSSol(true);
    this.focus = new THREE.Vector3(); this.shake = 0;
    this.actors = new Map();
    this.root = null;
    try { this.weather = new WeatherSystem(this.scene, this.renderer.domElement); } catch (e) { this.weather = null; }
  }

  resize(w, h) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // tuiles carrées à l'écran : la projection est resserrée en largeur (16 px de large comme de haut au centre)
    this.camera.projectionMatrix.elements[0] *= Math.sin(EL); this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    SPRITE_UNIFORMS.uRes.value.set(w, h);
    // distance pour qu'une tuile fasse 16 pixels de haut à l'écran (rendu basse résolution)
    this.dist = (Math.sin(EL) * h) / (2 * Math.tan(FOV * Math.PI / 360) * TILE_PX) * (this.zoom || 1);
  }

  /* ---------------- construction d'une carte ---------------- */
  setMap(map) {
    if (this.root) { this.scene.remove(this.root); this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData.own) { o.material.map?.dispose(); o.material.dispose(); } }); }
    for (const a of this.actors.values()) a.dispose?.();
    this.actors.clear();
    map = vueCarte(map);   // hors des bords : la région continue (rendu seulement)
    this.ombre = this.ombreCible = 1;
    this.map = map; this.root = new THREE.Group(); this.scene.add(this.root);
    this.chunks = new Map(); this.glows = new THREE.Group(); this.root.add(this.glows);
    this.sol.setMap(map);
    this.r3d = this.r3dOn && (map.outdoor || (this.r3dHGSS && map.floor === 'cave')) && this.sol.couvre(map) ? (this.r3dHGSS ? new ReliefHGSS(map, { biome: caveBiome(map) }) : new Relief3D(map)) : null;
    if (this.r3d && !this.r3dHGSS && !this.tinted.includes(matParoi())) this.tinted.push(matParoi(), matFacettes());
    for (const e of this.herbes?.values() || []) e.tex?.dispose(); this.herbes = new Map();   // herbes de devant (herbes.js)
    this.decoAt = new Map(); for (const d of map.deco) this.decoAt.set(d.x + ',' + d.y, d);
    this.tiers = map.outdoor ? null : caveTiers(map); this.biome = caveBiome(map);
    // relief du dehors : plateaux plus hauts, parois de falaise, marches (world/relief.js)
    this.relief = !this.r3d && !!map.outdoor && (map.hg?.some((h) => h !== 0) || map.t?.includes(T.CLIFF));
    this.rh = this.tiers && !this.A?.cells?.[`rp_${this.biome}_00`] ? caveHeights(map, this.tiers) : null;
    this.scene.background = new THREE.Color(map.outdoor ? '#1d4f2a' : '#0c0a10');
    if (map.id === 'monde') this.scene.background = new THREE.Color('#1d4f2a');
    this.buildBuildings();
    this.buildSorties();
    this.buildWindowsGroup();
    this.lastChunk = null;
  }

  groundCell(x, y) {
    const m = this.map, t = m.get(x, y), A = this.A.cells, v = hash(x, y);
    const g4 = () => 'grass' + (v < 0.55 ? 0 : v < 0.8 ? 1 : v < 0.93 ? 2 : 3);
    const zone = m.outdoor ? m.zoneAt(x, y) : null, theme = zone?.theme;
    const grassKey = theme === 'volcanic' ? 'ash' + (v < 0.5 ? 0 : 1) : theme === 'snow' ? 'snow' + (v < 0.5 ? 0 : 1) : g4();
    const mask = (same) => { let k = 0; if (same(m.get(x, y - 1))) k |= 1; if (same(m.get(x + 1, y))) k |= 2; if (same(m.get(x, y + 1))) k |= 4; if (same(m.get(x - 1, y))) k |= 8; return k; };
    // sur la neige, pas de bordure d'herbe autour des chemins : on prend la case pleine
    const edge = theme === 'snow' ? () => 15 : mask;
    const groundOf = (tt) => (tt === T.SIGN || tt === T.BLOCK ? m.underAt(x, y) ?? (m.outdoor ? T.GRASS : T.FLOOR) : tt);
    const tt = groundOf(t);
    const deco = this.decoAt.get(x + ',' + y);
    if (deco?.k === 'carpet') return { c: A.mat };
    if (deco?.k === 'glace') return { c: A.gl_ice };
    if (deco?.k === 'asph') return { c: A['asph' + (deco.v ? '_' + deco.v : '')] || A.asph };
    if (deco?.k === 'sable') return { c: A.gl_sable };
    if (deco?.k === 'eau') return { anim: this.N.cells.water15 };
    if (t === T.LAVA) return { anim: this.N.cells.lava };
    // passerelle de bois au-dessus d'un ravin (montagne) : le vide dessous, planches et cordes dans le sens de la traversée
    if (t === T.BRIDGE && ravin(m, x, y)) {
      // sens de la traversée : vers les sentiers que la passerelle relie (ou le long de la passerelle)
      const pont = (a, b) => m.get(a, b) === T.BRIDGE && ravin(m, a, b);
      const ew = sensPont(m, x, y) === 'ew';   // le sens se lit sur toute la passerelle (world/ponts.js)
      const a = ew ? !pont(x, y - 1) : !pont(x - 1, y), b = ew ? !pont(x, y + 1) : !pont(x + 1, y);
      const d = ew ? !pont(x - 1, y) : !pont(x, y - 1), f = ew ? !pont(x + 1, y) : !pont(x, y + 1);
      return { c: A[`ravin_${hash(x, y) < 0.5 ? 0 : 1}`], passerelle: A[`passerelle_${ew ? 'ew' : 'ns'}_${(a ? 1 : 0) | (b ? 2 : 0) | (d ? 4 : 0) | (f ? 8 : 0)}`] };
    }
    if (t === T.BARRIER_R || t === T.BARRIER_B) return { c: A['floor_' + m.floor] || A.floor_wood };
    const isPathish = (q) => [T.PATH, T.PAVE, T.SAND, T.BUILD, T.DOOR, T.BRIDGE, T.SIGN, T.BLOCK, T.MAT].includes(q);
    if (SOL16 && m.outdoor) {
      if (tt === T.PATH || tt === T.PAVE || tt === T.DOOR || tt === T.BUILD || tt === T.SAND) return { c: A[grassKey] };
      if (tt === T.WATER) return { anim: this.N.cells.water15 };
      if (tt === T.DARKTALL && A.w_herbes_bois_15) return { c: A[grassKey] };
      if (tt === T.TALL && theme === 'snow' && A.w_herbes_neige_15) return { c: A[grassKey] };
      if (tt === T.TALL && A.hautes_herbes0) return { c: A['hautes_herbes' + (v < 0.5 ? 0 : 1)] };
    }
    switch (tt) {
      case T.GRASS: case T.FENCE: case T.ROCK: case T.BUSH: case T.CUT: return { c: A[grassKey] };
      case T.SMASH: case T.BOULDER: return { c: m.outdoor ? A[grassKey] : A['cave' + (v < 0.5 ? 0 : 1)] };
      // hautes herbes : un tapis dessiné au sol, comme sur DS (les jambes de qui s'y tient sont cachées par view.cover)
      case T.TALL: case T.DARKTALL: {
        // tileset : nappe d'herbe avec ses bords et ses coins arrondis (pièce choisie selon les voisins)
        const hk = 'h_' + (tt === T.DARKTALL ? 'bois' : theme === 'snow' ? 'neige' : 'prairie') + '_' + herbePiece(m, x, y, tt, v);
        if (A[hk]) return { c: A[hk] };
        if (tt === T.DARKTALL) return { c: A['darktall' + (v < 0.5 ? 0 : 1)] };
        return { c: A[(theme === 'snow' && A.snowtall0 ? 'snowtall' : 'tall') + (v < 0.5 ? 0 : 1)] };
      }
      case T.TREE: case T.PINE: return { c: theme === 'volcanic' ? A.ash1 : theme === 'snow' ? A.snow1 : A['forest' + (v < 0.5 ? 0 : 1)] };
      case T.PATH: return { c: A['path' + edge(isPathish)] };
      case T.PAVE: case T.DOOR: case T.BUILD: return { c: A['pave' + edge((q) => isPathish(q))] };
      case T.SAND: return { c: A['sand' + edge((q) => q !== T.GRASS && q !== T.TALL && q !== T.TREE && q !== T.FLOWER && q !== T.PINE)] };
      case T.WATER: return { anim: this.N.cells['water' + mask((q) => q === T.WATER || q === T.BRIDGE)] };
      case T.BRIDGE: { const ns = sensPont(m, x, y) === 'ns'; return { anim: this.N.cells.water15, bridge: ns ? A.bridge : A.bridgeEW || A.bridge }; }
      // une couleur par massif (par carré de 3 × 3 cases), avec parfois une fleur d'une autre couleur
      case T.FLOWER: { const nf = this.N.cells.flower5 ? 6 : 4, pv = hash(Math.floor(x / 3) + 101, Math.floor(y / 3) + 37), k = v < 0.85 ? Math.floor(pv * nf) : Math.floor(v * 97) % nf; return { anim: this.N.cells['flower' + k] || this.N.cells.flower0 }; }
      case T.LEDGE: return { c: A.ledge }; case T.LEDGE_E: return { c: A.ledgeE }; case T.LEDGE_W: return { c: A.ledgeW };
      case T.CAVEWALL: if (m.outdoor) return { c: A[grassKey] };   // sous les montagnes du dehors
        if (this.tiers && A[`rp_${this.biome}_00`]) { const k = reliefKey(A, this.biome, 's', v); return { c: A[k] }; }
        if (this.tiers && A[`rt_${this.biome}_0`] && !this.tierAt(x, y)) return { c: A[`rt_${this.biome}_${v < 0.7 ? 0 : 1}`], shade: 0.95 };
      // falls through
      case T.CAVE: { const k = reliefKey(A, this.biome, 's', v); return { c: k ? A[k] : A['cave' + (v < 0.5 ? 0 : 1)] }; }
      case T.CAVEDOOR: return { c: A.cavestairs };
      case T.ASH: return { c: A['ash' + (v < 0.5 ? 0 : 1)] };
      case T.SNOW: return { c: A['snow' + (v < 0.5 ? 0 : 1)] };
      case T.STAIRS: return { c: A.stairs };
      case T.MAT: return { c: A.mat };
      case T.FLOOR: case T.WALL: return { c: A['floor_' + m.floor] || A.floor_wood };
      default: return { c: A[grassKey] };
    }
  }

  /** jeu de transitions (sols à 16 px) auquel appartient une case : chemin, sable, pavés, herbes de la forêt ou de la neige */
  wangOf(x, y) {
    const m = this.map; if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
    let t = m.get(x, y); if (t === T.SIGN || t === T.BLOCK) t = m.underAt(x, y) ?? T.GRASS;
    const th = m.zoneAt(x, y)?.theme;
    if (t === T.PATH) return th === 'snow' ? 'neige' : th === 'volcanic' ? 'cendre' : 'chemin';
    if (t === T.PAVE && this.decoAt.get(x + ',' + y)?.k === 'asph') return 'asph';   // chaussée : son propre jeu (pas de raccord)
    if (t === T.PAVE || t === T.DOOR || t === T.BUILD) return th === 'snow' ? 'neige' : 'pave';
    if (t === T.SAND) return 'sable';
    if (t === T.DARKTALL) return 'herbes_bois';
    if (t === T.TALL && th === 'snow') return 'herbes_neige';
    return null;
  }
  /** pièces de transition d'un morceau de carte : une pièce centrée sur chaque coin de case, ses quatre coins pris
   *  aux quatre cases qui se touchent là (grille décalée d'une demi-case, comme les jeux de tuiles Wang) */
  wangChunk(O, x0, y0) {
    const m = this.map, A = this.A.cells;
    const water = (x, y) => { const a = Math.max(0, Math.min(m.w - 1, x)), b = Math.max(0, Math.min(m.h - 1, y)), q = m.get(a, b); return q === T.WATER || (q === T.BRIDGE && !ravin(m, a, b)); };
    const ORDER = ['herbes_neige', 'herbes_bois', 'sable', 'pave', 'neige', 'cendre', 'chemin'];
    const xe = x0 + CH >= m.w && !m.ext ? m.w + 1 : x0 + CH, ye = y0 + CH >= m.h && !m.ext ? m.h + 1 : y0 + CH;
    const couvert = this.sol.couvre() ? (a, b) => sorteCase(m, a, b) !== SORTE.X : null;
    for (let y = y0; y < ye; y++) for (let x = x0; x < xe; x++) {
      const cs = [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]];
      // le sol généré dessine lui-même les transitions entre les sols qu'il couvre
      if (couvert && cs.every(([a, b]) => couvert(a, b))) continue;
      // rivages : la terre (sable ou herbe) par-dessus l'eau animée
      const wm = cs.map(([a, b]) => (water(a, b) ? 0 : 1)), wmask = wm[0] << 3 | wm[1] << 2 | wm[2] << 1 | wm[3];
      if (wmask && wmask !== 15) {
        const sandy = cs.some(([a, b]) => this.wangOf(a, b) === 'sable');
        const k = A[(sandy ? 'w_rivage_' : 'w_berge_') + wmask];
        if (k) flat(O, x - 0.5, y - 0.5, x + 0.5, y + 0.5, 0.002, k);
      }
      const ws = cs.map(([a, b]) => this.wangOf(a, b));
      const present = ORDER.filter((j) => ws.includes(j));
      for (const j of present) {
        const mk = ws.map((w) => (w === j ? 1 : 0)), mask = mk[0] << 3 | mk[1] << 2 | mk[2] << 1 | mk[3];
        const k = A[`w_${j}_${mask}`]; if (k) flat(O, x - 0.5, y - 0.5, x + 0.5, y + 0.5, 0.003 + ORDER.indexOf(j) * 0.0004, k);
      }
    }
  }

  /** paroi de grotte dessinée à plat comme dans HeartGold / SoulSilver (jeu de tuiles du plateau 3 × 3) : chaque quart
   *  de case prend le morceau du plateau qui va avec ses voisins (coin arrondi, bord en pente, face de roche au sud) */
  paroiCell(G, x, y, bio = null) {
    const m = this.map, A = this.A.cells, b = bio || this.biome;
    // au-dessus du sol généré (sol.js) : ses coins arrondis laissent voir le sol fin, pas l'ancien sol de la case
    const yh = this.sol.couvre() ? 0.0049 : 0.004;
    // dehors, les montagnes ont des gradins (massif, montagne de relief.js) : chaque gradin est un plateau de roche posé
    // sur le précédent, ses bords en pente comme ceux des grottes ; la roche plus basse est « dehors »
    // dans une montagne à gravir (relief.js, montagne), le sentier fait partie du gradin quand il est à sa hauteur (ou
    // plus haut) : la roche sous le bord d'un sentier n'a pas de rebord de ce côté, elle descend en pente vers le bas
    const h0 = m.outdoor ? m.height(x, y) : 0;
    const rock = (dx, dy) => {
      const a = x + dx, c = y + dy; if (a < 0 || c < 0 || a >= m.w || c >= m.h) return true;
      if (ravin(m, a, c)) return false;
      const q = m.get(a, c);
      if (q === T.CAVEWALL) return !m.outdoor || m.height(a, c) >= h0;
      return m.outdoor && mont(m, a, c) && q !== T.STAIRS && m.height(a, c) >= h0;
    };
    if (m.outdoor) {
      // sous les coins arrondis : le gradin du dessous (ou le vide d'un ravin), pas l'herbe
      let bas = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, c = y + dy; if (!m.in(a, c) || m.get(a, c) !== T.CAVEWALL) continue;
        if (!ravin(m, a, c) && m.height(a, c) < h0) bas = true;
      }
      // à côté d'un sentier (case praticable), le pied de la paroi laisse voir le sentier : pas de roche dessous
      const sol = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.in(x + dx, y + dy) && m.get(x + dx, y + dy) !== T.CAVEWALL);
      if (bas && !sol) flat(G, x, y, x + 1, y + 1, yh - 0.0002, A[`rp_${b}_11`], 0.9);
      // le vide d'un ravin, seulement sous les quarts de case tournés vers lui (pas de noir qui déborde sur la roche)
      const vide = (a, c) => ravin(m, a, c) && m.get(a, c) === T.CAVEWALL;   // le gouffre (pas une passerelle)
      for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
        const dx = qx ? 1 : -1, dy = qy ? 1 : -1;
        if (!(vide(x, y + dy) || vide(x + dx, y) && vide(x + dx, y + dy))) continue;
        const u = A.ravin_0, hu = (u[2] - u[0]) / 2, hv = (u[3] - u[1]) / 2;
        flat(G, x + qx / 2, y + qy / 2, x + (qx + 1) / 2, y + (qy + 1) / 2, yh - 0.0001, [u[0] + qx * hu, u[1] + qy * hv, u[0] + (qx + 1) * hu, u[1] + (qy + 1) * hv]);
      }
    }
    const W = !rock(-1, 0), E = !rock(1, 0), N = !rock(0, -1), S = !rock(0, 1);
    const cols = W && E ? [0, 5] : W ? [0, 1] : E ? [4, 5] : [2, 3];
    const rows = N && S ? [0, 5] : N ? [0, 1] : S ? [4, 5] : [2, 3];
    // coin rentrant tourné vers la caméra (roche à côté et en dessous, sol en diagonale en bas) : la falaise du voisin
    // continue jusqu'au milieu de la case au lieu de laisser dépasser le dessus de la roche
    const inner = [rock(-1, 0) && rock(0, 1) && !rock(-1, 1), rock(1, 0) && rock(0, 1) && !rock(1, 1)];
    // une case entière de rechange (falaise, bord ou dessus décoré) pour que la roche ne se répète pas
    const v = hash(x * 13 + 5, y * 7 + 3), pick = (k, n, p) => A[`r${k}_${b}_${Math.floor(v * n)}`] && v < p ? A[`r${k}_${b}_${Math.floor(v * n / p) % n}`] : null;
    const open = (W ? 1 : 0) + (E ? 1 : 0) + (N ? 1 : 0) + (S ? 1 : 0);
    // falaise de montagne sur plusieurs gradins : sous une roche plus haute, la pente continue (pas de dessus de gradin)
    if (m.outdoor && S && !W && !E && !N && m.get(x, y - 1) === T.CAVEWALL && !ravin(m, x, y - 1) && m.height(x, y - 1) > h0 && mont(m, x, y)) {
      const k = A[`rv_${b}_${Math.floor(v * 4)}`] || A[`rv_${b}_0`];
      if (k) { flat(G, x, y, x + 1, y + 1, yh, k); return; }
    }
    if (!inner[0] && !inner[1] && open <= 1) {
      const alt = S ? pick('f', 4, 0.8) : N ? pick('n', 4, 0.8) : W ? pick('l', 3, 0.75) : E ? pick('e', 3, 0.75) : pick('q', 6, 0.4);
      if (alt) { flat(G, x, y, x + 1, y + 1, yh, alt); return; }
    }
    for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) {
      let c = cols[qx], r = rows[qy];
      if (inner[qx] && !S) { if (qy === 1) { r = 5; c = qx ? 3 : 2; } else if (!N) { r = 4; c = qx ? 3 : 2; } }
      const cell = A[`rp_${b}_${r >> 1}${c >> 1}`]; if (!cell) continue;
      const hu = (cell[2] - cell[0]) / 2, hv = (cell[3] - cell[1]) / 2, u0 = cell[0] + (c & 1) * hu, v0 = cell[1] + (r & 1) * hv;
      // un soupçon de chevauchement entre les quarts : pas de fente d'un pixel où l'on verrait le sol
      const e = 1 / 128, ex0 = qx ? e : 0, ex1 = qx ? 0 : e, ez0 = qy ? e : 0, ez1 = qy ? 0 : e;
      flat(G, x + qx / 2 - ex0, y + qy / 2 - ez0, x + (qx + 1) / 2 + ex1, y + (qy + 1) / 2 + ez1, yh,
        [u0 - (cell[2] - cell[0]) * ex0, v0 - (cell[3] - cell[1]) * ez0, u0 + hu + (cell[2] - cell[0]) * ex1, v0 + hv + (cell[3] - cell[1]) * ez1]);
    }
  }
  /** roche de grotte en pentes : la case est découpée en RN × RN facettes posées sur le champ de hauteur ; une facette
   *  plate prend le dessus de roche, une facette en pente la paroi striée, les stries dans le sens de la pente ;
   *  la lumière vient d'en haut à gauche */
  reliefCell(G, x, y) {
    const A = this.A.cells, b = this.biome, { h, W } = this.rh, tier = Math.max(1, this.tierAt(x, y));
    const at = (i, j) => h[(y * RN + j) * W + x * RN + i];
    let flatAll = true; const h0 = at(0, 0);
    for (let j = 0; j <= RN && flatAll; j++) for (let i = 0; i <= RN; i++) if (Math.abs(at(i, j) - h0) > 1e-4) { flatAll = false; break; }
    const topC = A[`rt_${b}_${hash(x + 11, y + 13) < 0.7 ? 0 : 1}`] || A[`rt_${b}_0`];
    const dark = 1.08 - tier * 0.05;
    if (flatAll) { flat(G, x, y, x + 1, y + 1, h0, topC, dark); return; }
    const L = [-0.42, 1, 0.62], LN = Math.hypot(...L);
    const uvOf = (c, lu, lv) => [c[0] + (c[2] - c[0]) * lu, c[1] + (c[3] - c[1]) * lv];
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      // sommets : a = sud-ouest, b = sud-est, c = nord-est, d = nord-ouest
      const ha = at(i, j + 1), hb = at(i + 1, j + 1), hc = at(i + 1, j), hd = at(i, j);
      const x0 = x + i / RN, x1 = x + (i + 1) / RN, z0 = y + j / RN, z1 = y + (j + 1) / RN;
      const ps = [[x0, ha, z1], [x1, hb, z1], [x1, hc, z0], [x0, hd, z0]];
      const gx = ((hb - ha) + (hc - hd)) / 2 * RN, gz = ((ha - hd) + (hb - hc)) / 2 * RN;
      const hmax = Math.max(ha, hb, hc, hd), hmin = Math.min(ha, hb, hc, hd);
      if (hmax - hmin < 1e-4) {
        const lu0 = i / RN, lu1 = (i + 1) / RN, lv0 = j / RN, lv1 = (j + 1) / RN;
        G.quadv(ps, [uvOf(topC, lu0, lv1), uvOf(topC, lu1, lv1), uvOf(topC, lu1, lv0), uvOf(topC, lu0, lv0)], [dark, dark, dark, dark]);
        continue;
      }
      // gradin de la pente : celui dont le haut est juste au-dessus de la facette
      let t = 1; while (t < 3 && RLEVEL[t] < hmax - 1e-4) t++;
      const band = RLEVEL[t] - RLEVEL[t - 1];
      const lv = (q) => Math.min(1, Math.max(0, (RLEVEL[t] - q) / band));
      const ns = Math.abs(gz) >= Math.abs(gx);
      const c = A[`rw_${b}_${Math.floor(hash(x * 3 + (ns ? 1 : 2), y * 5 + t) * 3)}`] || A[`rw_${b}_0`];
      // le long de la pente : u suit le bord (x pour une pente nord-sud, z pour une pente est-ouest)
      const lu = ns ? [i / RN, (i + 1) / RN, (i + 1) / RN, i / RN] : [(j + 1) / RN, (j + 1) / RN, j / RN, j / RN];
      const uvs = [uvOf(c, lu[0], lv(ha)), uvOf(c, lu[1], lv(hb)), uvOf(c, lu[2], lv(hc)), uvOf(c, lu[3], lv(hd))];
      const n = [-gx, 1, -gz], nn = Math.hypot(...n), dot = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nn * LN);
      const sh = Math.min(1.1, 0.68 + 0.45 * Math.max(0, dot)) * (1 - (t - 1) * 0.04);
      // pied de la pente plus sombre (la roche se détache du sol), haut éclairé
      const foot = (q) => sh * (0.62 + 0.38 * Math.min(1, (q - RLEVEL[t - 1]) / band * 1.6));
      G.quadv(ps, uvs, [foot(ha), foot(hb), foot(hc), foot(hd)]);
    }
  }
  /** détail posé sur une case d'herbe (ou rien) : selon la zone (forêt, neige, cendre) et un tirage fixe par case */
  detailAt(x, y) {
    const v = hash(x * 3 + 17, y * 5 + 29); if (v > 0.24) return null;
    const m = this.map, th = m.zoneAt(x, y)?.theme;
    if (th === 'snow' || th === 'volcanic') return null;
    // pas sur une case qui touche un chemin, une maison ou l'eau (les bords y sont déjà dessinés)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = m.get(x + dx, y + dy); if (q !== T.GRASS && q !== T.TALL && q !== T.TREE && q !== T.FLOWER && q !== T.FENCE) return null; }
    const L = th === 'forest' ? ['touffe', 'feuilles', 'champignons', 'brindilles', 'touffe3', 'trefle'] : ['touffe', 'touffe2', 'trefle', 'cailloux', 'paquerettes', 'boutons', 'touffe3', 'touffe', 'trefle', 'brindilles'];
    return L[Math.floor(hash(x + 503, y + 211) * L.length)];
  }
  /** tourbillons : un grand tourbillon (2 × 2 cases) aux places d'une grille décalée quand les quatre cases en sont,
   *  des remous d'écume sur les autres cases ; sens de rotation et remous tirés par case (pas de motif répété) */
  tourbillonCell(G, b, x, y) {
    const N = this.N.cells, W2 = (a, c) => b.get(a, c) === T.WHIRL;
    const ancre = (a, c) => ((a + ((c >> 1) & 1) * 2) & 3) === 0 && (c & 1) === 0 && W2(a, c) && W2(a + 1, c) && W2(a, c + 1) && W2(a + 1, c + 1);
    for (const [dx, dy, q] of [[0, 0, 0], [1, 0, 1], [0, 1, 2], [1, 1, 3]]) {
      const ax = x - dx, ay = y - dy;
      if (ancre(ax, ay)) { const v = hash(ax * 5 + 1, ay * 3 + 7) < 0.5 ? 0 : 1, k = N[`tourbillon${v}_${q}`]; if (k) flat(G, x, y, x + 1, y + 1, 0.006, k); return; }
    }
    const v = hash(x * 11 + 3, y * 7 + 1); if (v < 0.85) { const k = N['remous' + Math.floor(v / 0.85 * 3)]; if (k) flat(G, x, y, x + 1, y + 1, 0.006, k); }
  }
  /** relief du dehors, dessiné à plat comme dans HeartGold / SoulSilver : paroi de roche sous le bord sud d'un plateau
   *  (lèvre d'herbe en haut, ombre au pied), rebords de roche à l'est, à l'ouest et au nord, marches taillées */
  reliefDehors(G, x, y, t, zone) {
    const m = this.map, A = this.A.cells, h = m.height(x, y), th = zone?.theme, bio = bioFalaise(zone);
    const Y = 0.0049, v = hash(x * 3 + 1, y * 7 + 5);
    // plateaux d'herbe (world/relief.js, pente) : talus de pelouse, dessiné au pixel par le sol généré (solgen.js, talus) ;
    // sans lui (?sol=0), des pièces de pelouse toutes faites (relief-tex.js)
    const gen = this.sol.couvre(), herbe = (a, b) => pente(m, a, b), lv = levreFalaise(th);
    if ((t === T.CLIFF || t === T.STAIRS) && herbe(x, y)) {
      if (gen) return;
      if (t === T.CLIFF) {
        let r = 0; while (r < 6 && m.get(x, y - r - 1) === T.CLIFF) r++;
        const k = A[`pente_${lv}_${r === 0 ? 's' : 'm'}_${v < 0.5 ? 0 : 1}`]; if (k) flat(G, x, y, x + 1, y + 1, Y, k);
        return;
      }
      const d = m.height(x, y - 1) > h ? 's' : m.height(x, y - 1) < h ? 'n' : m.height(x + 1, y) < h ? 'e' : m.height(x - 1, y) < h ? 'w' : 's';
      if (A[`rondins_${d}`]) flat(G, x, y, x + 1, y + 1, Y + 0.0001, A[`rondins_${d}`]);
      return;
    }
    if (t === T.CLIFF) {
      let r = 0; while (r < 6 && m.get(x, y - r - 1) === T.CLIFF) r++;
      const rw = A[`rw_${bio}_${Math.floor(v * 3)}`] || A.rw_montagne_0;
      if (rw) flat(G, x, y, x + 1, y + 1, Y, rw, r === 0 ? 1 : Math.max(0.72, 0.94 - 0.08 * r));
      if (r === 0) { const L = A[`fal_levre_${levreFalaise(th)}_${v < 0.5 ? 0 : 1}`]; if (L) flat(G, x, y, x + 1, y + 1, Y + 0.0002, L); }
      const fin = (q) => q !== T.CLIFF && q !== T.STAIRS;
      if (fin(m.get(x - 1, y)) && A[`fal_bout_w_${bio}`]) flat(G, x, y, x + 1, y + 1, Y + 0.0001, A[`fal_bout_w_${bio}`]);
      if (fin(m.get(x + 1, y)) && A[`fal_bout_e_${bio}`]) flat(G, x, y, x + 1, y + 1, Y + 0.0001, A[`fal_bout_e_${bio}`]);
      return;
    }
    if (t === T.CAVEWALL) {
      const bm = bioDehors(th);
      if (A[`rp_${bm}_00`]) return;   // gradins dessinés en plateaux de roche aux bords en pente (paroiCell)
      // montagne en gradins : une paroi là où la roche du dessus est plus haute, un rebord sur les côtés
      if (m.get(x, y - 1) === T.CAVEWALL && m.height(x, y - 1) > h) {
        const rw = A[`rw_${bm}_${Math.floor(v * 3)}`] || A.rw_montagne_0;
        if (rw) flat(G, x, y, x + 1, y + 1, Y + 0.0004, rw, 0.86);
      } else if (m.get(x, y - 1) === T.CAVEWALL && m.get(x, y - 2) === T.CAVEWALL && m.height(x, y - 2) > m.height(x, y - 1) && A.fal_pied) flat(G, x, y, x + 1, y + 1, Y + 0.0004, A.fal_pied);
      const cote = (dx) => m.get(x + dx, y) === T.CAVEWALL && m.height(x + dx, y) < h && !(m.get(x, y - 1) === T.CAVEWALL && m.height(x, y - 1) > h);
      if (cote(1)) flat(G, x, y, x + 1, y + 1, Y + 0.0005, A[`fal_bord_e_${bm}`]);
      if (cote(-1)) flat(G, x, y, x + 1, y + 1, Y + 0.0005, A[`fal_bord_w_${bm}`]);
      return;
    }
    if (t === T.STAIRS && mont(m, x, y)) {
      // marches taillées dans la montagne : on monte vers le sentier (ou la marche) plus haut
      const haut = (dx, dy) => { const q = m.get(x + dx, y + dy); return q !== T.CAVEWALL && m.height(x + dx, y + dy) > h || q === T.STAIRS && m.get(x + 2 * dx, y + 2 * dy) !== T.CAVEWALL && m.height(x + 2 * dx, y + 2 * dy) > h; };
      const d = haut(0, -1) ? 's' : haut(0, 1) ? 'n' : haut(-1, 0) ? 'e' : haut(1, 0) ? 'w' : 's';
      const k = A[`marches_${d}_${bio}`] || A[`marches_${d}_montagne`];
      if (k) flat(G, x, y, x + 1, y + 1, Y + 0.0001, k);
      return;
    }
    if (t === T.STAIRS) {
      const d = m.height(x, y - 1) > h ? 's' : m.height(x, y - 1) < h && m.get(x, y - 1) !== T.CLIFF ? 'n' : m.height(x + 1, y) < h ? 'e' : m.height(x - 1, y) < h ? 'w' : m.height(x, y + 1) < h || m.get(x, y + 1) === T.STAIRS ? 's' : null;
      const k = d && (A[`marches_${d}_${bio}`] || A[`marches_${d}_montagne`]);
      if (k) { flat(G, x, y, x + 1, y + 1, Y + 0.0001, k); return; }
    }
    if (m.get(x, y - 1) === T.CLIFF && !(gen && herbe(x, y - 1)) && A.fal_pied) flat(G, x, y, x + 1, y + 1, Y, herbe(x, y - 1) ? A.pente_pied || A.fal_pied : A.fal_pied);
    // flancs d'un plateau voisin plus haut, à l'ouest ou à l'est (sauf contre une marche ou une montagne)
    const flanc = (dx) => { const q = m.get(x + dx, y); return m.height(x + dx, y) > h && q !== T.CLIFF && q !== T.STAIRS && q !== T.CAVEWALL && t !== T.STAIRS && !(gen && herbe(x + dx, y)); };
    const fl = (c, dx) => (herbe(x + dx, y) ? A[`pente_flanc_${c}_${lv}`] : A[`fal_flanc_${c}_${bio}`]);
    if (flanc(-1) && fl('w', -1)) flat(G, x, y, x + 1, y + 1, Y + 0.0001, fl('w', -1));
    if (flanc(1) && fl('e', 1)) flat(G, x, y, x + 1, y + 1, Y + 0.0001, fl('e', 1));
    if (h > 0 && !(gen && herbe(x, y))) {
      const bas = (dx, dy) => { const q = m.get(x + dx, y + dy); return m.height(x + dx, y + dy) < h && q !== T.CLIFF && q !== T.STAIRS && q !== T.CAVEWALL; };
      const bd = (c) => (herbe(x, y) ? A[`pente_bord_${c}_${lv}`] : A[`fal_bord_${c}_${bio}`]);
      if (bas(1, 0) && bd('e')) flat(G, x, y, x + 1, y + 1, Y + 0.0002, bd('e'));
      if (bas(-1, 0) && bd('w')) flat(G, x, y, x + 1, y + 1, Y + 0.0002, bd('w'));
      if (bas(0, -1) && bd('n')) flat(G, x, y, x + 1, y + 1, Y + 0.0003, bd('n'));
    }
  }
  /** hauteur du sol à l'endroit (x, z) du monde : 0 sans le relief en 3D (?relief3d) */
  hAt(x, z) { return this.r3d ? this.r3d.Hmarche(x, z) : 0; }
  r3dLV() { return this.r3d ? R3LV : 0; }
  r3dMats() {
    if (!this._r3dMats) {
      const c = (m) => { const k = m.clone(); k.depthWrite = false; this.tinted.push(k); return k; };
      this._r3dMats = { ground: c(this.mat.ground), anim: c(this.mat.anim), overlay: c(this.mat.overlay) };
    }
    return this._r3dMats;
  }
  /** pose une géométrie sur le relief : les sprites (ancrés à leurs pieds) montent avec leur point d'ancrage, le reste
   *  sommet par sommet */
  r3dLift(G, dy) {
    const p = G.p, an = G.an, r = this.r3d;
    if (an.length) for (let v = 0; v < G.n; v++) { const h = r.Hpose(an[v * 3], an[v * 3 + 2]); p[v * 3 + 1] += h; an[v * 3 + 1] += h; }
    else for (let v = 0; v < G.n; v++) p[v * 3 + 1] += r.H(p[v * 3], p[v * 3 + 2]) + dy;
    // l'ancien sol d'une case du fond d'un ravin : caché (sinon, posé sur les bords du ravin, il le couvrirait en biais)
    if (!an.length && dy < 0) for (let v = 0; v + 3 < G.n; v += 4) {
      const cx = (p[v * 3] + p[v * 3 + 6]) / 2, cz = (p[v * 3 + 2] + p[v * 3 + 8]) / 2;
      if (r.fondRavin(cx, cz)) for (let k = 0; k < 4; k++) p[(v + k) * 3 + 1] = -1e3;
    }
  }
  tierAt(x, y) { const m = this.map; if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 3; return this.tiers[y * m.w + x] || 0; }

  /** ombre au sol (ellipse) sous un objet, du rectangle (x0, z0)–(x1, z1) : dessinée à sa taille exacte à l'écran */
  ombreSol(G, x0, z0, x1, z1, y = 0.015, forme = 'ellipse') { flat(G, x0, z0, x1, z1, y, this.ombres.uv((x1 - x0) * TILE_PX, (z1 - z0) * TILE_PX, forme)); }
  buildChunk(ci, cj) {
    const m = this.map, A = this.A.cells, S = this.S.rects;
    const G = new Geo(), N = new Geo(), P = new Geo(), Wl = new Geo(), Sh = new Geo(), O0 = new Geo(), NO = new Geo(), PB = new Geo();
    const r3d = this.r3d;
    const base = m.base || m;
    const glows = [];
    const x0 = ci * CH, y0 = cj * CH;
    const wallH = 2 * Math.tan(EL), caveH = 1.25 * Math.tan(EL);
    const yEnd = m.ext ? y0 + CH : Math.min(m.h, y0 + CH), xEnd = m.ext ? x0 + CH : Math.min(m.w, x0 + CH);
    for (let y = y0; y < yEnd; y++) for (let x = x0; x < xEnd; x++) {
      const t = m.get(x, y), g = this.groundCell(x, y), v = hash(x + 7, y + 3);
      if (g.c) flat(G, x, y, x + 1, y + 1, 0, g.c, g.shade);
      if (g.anim) flat(N, x, y, x + 1, y + 1, 0, g.anim);
      if (g.bridge && !this.sol.couvre()) flat(G, x - 0.02, y, x + 1.02, y + 1, 0.012, g.bridge);   // le sol généré dessine ses pontons
      if (g.passerelle) flat(r3d ? PB : G, x, y, x + 1, y + 1, 0.012 + (r3d ? r3d.Hmarche(x + 0.5, y + 0.5) : 0), g.passerelle);
      // détails de l'herbe (touffes, trèfles, cailloux, fleurettes…) : une case d'herbe sur six environ, jamais deux
      // fois le même détail côte à côte ; des feuilles mortes et des champignons en forêt
      if (m.outdoor && !this.sol.couvre() && (t === T.GRASS || t === T.FENCE) && this.detailAt(x, y)) {
        const k = this.detailAt(x, y); if (A['dec_' + k]) flat(O0, x, y, x + 1, y + 1, 0.004, A['dec_' + k]);
      }
      const zone = m.outdoor ? m.zoneAt(x, y) : null, theme = zone?.theme;
      if (this.relief) this.reliefDehors(O0, x, y, t, zone);
      if (m.outdoor && base.get(x, y) === T.WHIRL) this.tourbillonCell(NO, base, x, y);
      if (m.outdoor && t === T.BRIDGE && theme === 'automne') {
        // garde-corps vermillon le long du pont, seulement sur ses bords (pas entre deux voies du même pont)
        const ns = sensPont(m, x, y) === 'ns', pt = (a, b) => m.get(a, b) === T.BRIDGE;
        const ha = ns ? !pt(x - 1, y) : !pt(x, y - 1), ba = ns ? !pt(x + 1, y) : !pt(x, y + 1), tex = A[`pont_rouge_${ns ? 'ns' : 'ew'}_${(ha ? 1 : 0) | (ba ? 2 : 0)}`];
        if (tex && (ha || ba)) flat(O0, x - (ns ? 0 : 0.02), y - (ns ? 0.02 : 0), x + 1 + (ns ? 0 : 0.02), y + 1 + (ns ? 0.02 : 0), 0.0051, tex);
      }
      if (this.decoAt.get(x + ',' + y)?.k === 'koi') flat(NO, x, y, x + 1, y + 1, 0.0055, this.N.cells.koi);
      // décor en volume
      if (t === T.TREE || t === T.PINE) {
        // forêts rangées comme sur DS : un arbre par bloc de 2 × 2 cases, les rangées se chevauchent un peu ;
        // un arbre isolé (bord de route) reste centré sur sa case
        // forêts serrées comme sur DS : au cœur de la forêt, un arbre une case sur deux en quinconce (les arbres font
        // presque une case et demie, ils se chevauchent) ; en lisière, un arbre sur chaque case
        const isT = (q) => q === T.TREE || q === T.PINE;
        const inner = isT(m.get(x - 1, y)) && isT(m.get(x + 1, y)) && isT(m.get(x, y - 1)) && isT(m.get(x, y + 1));
        const full = false, bx = x, by = y;
        if (!inner || ((x + y) & 1) === 0) {
          const vb = v;
          let key = t === T.PINE ? 'pine' : vb < 0.6 ? 'tree' : S.tree3 && vb < 0.68 ? 'tree3' : 'tree2';
          if (theme === 'volcanic') key = 'deadtree';
          else if (theme === 'snow') key = 'snowpine';
          else if (theme === 'automne' && t === T.TREE && S.automne0) { const a = 'automne' + Math.floor(hash(x * 7 + 3, y * 3 + 9) * 6); if (S[a]) key = a; }
          // un des dessins de l'essence (arbres.js), miroir et teinte tirés de la case
          if (!this.arbresUnis) key = variante(S, key, x, y);
          const r = S[key], cx = x + 0.5 + (v - 0.5) * 0.2, cz = y + 0.7;
          billboard(P, cx, cz, SW(r), SH(r), r, 0, this.arbresUnis ? vb > 0.5 : miroir(x, y), this.arbresUnis ? 1 : teinte(x, y, key.startsWith('snowpine') || key.startsWith('deadtree')));
          this.ombreSol(Sh, cx - 0.75, cz - 0.3, cx + 0.75, cz + 0.3);
        }
      } else if (t === T.FENCE) {
        // barrière : de face (rangée horizontale) ou vue dans l'axe (colonne nord-sud, le long d'un chemin vertical)
        const vert = S.fence_v && m.get(x - 1, y) !== T.FENCE && m.get(x + 1, y) !== T.FENCE && (m.get(x, y - 1) === T.FENCE || m.get(x, y + 1) === T.FENCE || m.get(x - 1, y) === T.PATH || m.get(x + 1, y) === T.PATH);
        const r = vert ? (m.get(x, y - 1) === T.FENCE ? S.fence_v : S.fence_v0 || S.fence_v) : S.fence; billboard(P, x + 0.5, y + (vert ? 0.75 : 0.6), SW(r), SH(r), r);
      }
      else if (t === T.ROCK) { const r = S.rock; billboard(P, x + 0.5, y + 0.6, SW(r), SH(r), r); this.ombreSol(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85); }
      else if (t === T.BUSH) { const r = S[this.arbresUnis ? 'bush' : variante(S, 'bush', x, y)]; billboard(P, x + 0.5, y + 0.6, SW(r), SH(r), r, 0, !this.arbresUnis && miroir(x, y), this.arbresUnis ? 1 : teinte(x, y)); }
      else if (t === T.CUT) { const r = S.cuttree; billboard(P, x + 0.5, y + 0.62, SW(r), SH(r), r); this.ombreSol(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85); }
      else if (t === T.BOULDER && m.bloc && S[m.bloc]) { const r = S[m.bloc]; billboard(P, x + 0.5, y + 0.66, SW(r) * 1.1, SH(r) * 1.1, r); this.ombreSol(Sh, x + 0.14, y + 0.5, x + 0.86, y + 0.86); }
      else if (t === T.BOULDER) { const r = (m.bloc && S[m.bloc]) || (m.outdoor ? S.rock : S.caverock || S.rock); billboard(P, x + 0.5, y + 0.62, SW(r) * 1.15, SH(r) * 1.15, r); this.ombreSol(Sh, x + 0.02, y + 0.35, x + 0.98, y + 0.9); }
      else if (t === T.SMASH) { const r = S.crackrock; billboard(P, x + 0.5, y + 0.62, SW(r), SH(r), r); this.ombreSol(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85); }
      else if (t === T.WALL) {
        // mur du fond en volume ; murs latéraux et bas réduits à une bordure sombre, comme sur DS
        if (y <= 1) { const south = m.get(x, y + 1) !== T.WALL; box(Wl, x, y, x + 1, y + 1, wallH, A[m.wallStyle] || A.wall_in, A.walltop, A.walltop, { south, east: false, west: false }); }
        // cloisons entre deux salles (m.cloisons : Arène de Sylvebourg) : face sud en volume, d'une case de haut
        else if (m.cloisons && y < m.h - 1 && x > 0 && x < m.w - 1 && m.get(x, y + 1) !== T.WALL) box(Wl, x, y, x + 1, y + 1, Math.tan(EL), A[m.wallStyle] || A.wall_in, A.walltop, A.walltop, { south: true, east: m.get(x + 1, y) !== T.WALL, west: m.get(x - 1, y) !== T.WALL });
        else flat(Wl, x, y, x + 1, y + 1, 0.01, A.walltop);
      } else if (t === T.CAVEWALL) {
        // dehors (montagnes des entrées de grottes, bord du monde) : mêmes plateaux de roche que dans les grottes
        const bioC = m.outdoor ? (m.neige?.[y * m.w + x] ? 'glace' : zone?.roche || bioDehors(theme)) : this.biome;
        if (m.outdoor && ravin(m, x, y)) {
          // le vide d'un ravin : sous la paroi du fond, la roche qui plonge ; plus bas, le noir
          // bords : la paroi du fond sous tout ce qui n'est pas le ravin au nord ; une lèvre là où un sentier le borde
          const bord = (dx, dy) => !ravin(m, x + dx, y + dy), sentier = (dx, dy) => bord(dx, dy) && m.get(x + dx, y + dy) !== T.CAVEWALL;
          const f = (bord(0, -1) ? 1 : 0) | (sentier(-1, 0) ? 2 : 0) | (sentier(1, 0) ? 4 : 0);
          const k = f ? A[`ravin_${bioC}_${f}`] || A[`ravin_montagne_${f}`] : A[`ravin_${hash(x, y) < 0.5 ? 0 : 1}`];
          if (k && !r3d) flat(O0, x, y, x + 1, y + 1, this.sol.couvre() ? 0.0049 : 0.004, k);
        } else if ((this.tiers || m.outdoor) && A['rp_' + bioC + '_00']) {
          if (!r3d) this.paroiCell(O0, x, y, bioC);
          // de temps en temps un rocher pointu au milieu d'un plateau
          const b = bioC, v2 = hash(x * 5 + 3, y * 7 + 11), m2 = this.map;
          const inner = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 2]].every(([dx, dy]) => (m2.get(x + dx, y + dy) === T.CAVEWALL && m2.height(x + dx, y + dy) === m2.height(x, y) && !ravin(m2, x + dx, y + dy)) || m2.get(x + dx, y + dy) == null);
          if (inner && v2 < 0.1 && !(r3d && !m.outdoor)) {   // (pas sur le noir du plafond d'une grotte)
            const r = v2 < 0.04 ? S[`pic_${b}_${Math.floor(hash(x + 41, y + 43) * 3)}`] : S[`cone_${b}_${Math.floor(hash(x + 41, y + 43) * 3)}`];
            if (r) billboard(P, x + 0.5 + (v - 0.5) * 0.25, y + 0.62, SW(r), SH(r), r, 0, v > 0.5);
          }
        } else if (this.tiers && A['rw_' + this.biome + '_0']) {
          this.reliefCell(Wl, x, y);
          // rochers pointus (comme dans HeartGold / SoulSilver) : de temps en temps un amas de pointes ou une pointe dressée
          // sur le haut de la roche (là où il est plat)
          const b = this.biome, tier = Math.max(1, this.tierAt(x, y)), v2 = hash(x * 5 + 3, y * 7 + 11);
          const { h, W } = this.rh, hh = h[(y * RN + RN / 2) * W + x * RN + RN / 2];
          if (v2 < 0.16 && hh >= RLEVEL[tier] - 1e-3) {
            const r = v2 < 0.07 ? S[`pic_${b}_${Math.floor(hash(x + 41, y + 43) * 3)}`] : S[`cone_${b}_${Math.floor(hash(x + 41, y + 43) * 3)}`];
            if (r) billboard(P, x + 0.5 + (v - 0.5) * 0.25, y + 0.62, SW(r), SH(r), r, hh, v > 0.5);
          }
        } else {
          const south = m.get(x, y + 1) !== T.CAVEWALL, east = m.get(x + 1, y) !== T.CAVEWALL, west = m.get(x - 1, y) !== T.CAVEWALL;
          if (south || east || west || m.get(x, y - 1) !== T.CAVEWALL) box(Wl, x, y, x + 1, y + 1, caveH, A.cavewall, A.cavetop, A.cavewall, { south, east, west });
          else flat(Wl, x, y, x + 1, y + 1, caveH, A.cavetop);
        }
      }
      else if (t === T.BARRIER_R || t === T.BARRIER_B) {
        const g = t === T.BARRIER_R ? 'r' : 'b';
        box(Wl, x + 0.08, y + 0.35, x + 0.92, y + 0.9, 0.62 * Math.tan(EL), A['barr_' + g], A['barr_' + g + '_top'], A['barr_' + g]);
      }
      // décor posé (lampadaires, panneaux, meubles…)
      const d = this.decoAt.get(x + ',' + y);
      // décalques des arènes au sol : flèches, souffles, courants, dalles, téléporteurs, socles des barrières
      // mine : rails (orientés selon les rails voisins) et échelles entre les niveaux
      if (m.rails?.has(x + ',' + y)) {
        const R = (dx, dy) => m.rails.has((x + dx) + ',' + (y + dy));
        const n = R(0, -1), e = R(1, 0), so = R(0, 1), w = R(-1, 0);
        const k = (n || so) && !(e || w) ? 'ns' : (e || w) && !(n || so) ? 'ew' : n && e ? 'ne' : e && so ? 'es' : so && w ? 'sw' : n && w ? 'nw' : 'ew';
        if (A['rail_' + k]) flat(O0, x, y, x + 1, y + 1, 0.0052, A['rail_' + k]);
      }
      if ((d?.k === 'echelle' || d?.k === 'echelle_jour' || d?.k === 'trou') && A[d.k]) flat(O0, x, y, x + 1, y + 1, 0.0053, A[d.k]);
      if (d?.sol && A['dec_' + d.sol]) flat(O0, x, y, x + 1, y + 1, 0.005, A['dec_' + d.sol]);   // décalque sous un objet posé
      if (d && DECALS.has(d.k)) { const k = 'dec_' + d.k + (d.dir ? '_' + d.dir : d.g ? '_' + d.g : ''); if (A[k]) flat(O0, x, y, x + 1, y + 1, 0.005, A[k]); }
      if (d) {
        if (d.k === 'counter') {
          box(Wl, x, y + 0.1, x + 1, y + 1, 0.75 * Math.tan(EL), A[d.front] || A.counterfront, A.counter, A.counter, { east: m.get(x + 1, y) !== T.BLOCK, west: m.get(x - 1, y) !== T.BLOCK });
          // capsule posée sur le comptoir (starters du labo)
          if (d.ball && S.itemball) { const r = S.itemball; billboard(P, x + 0.5, y + 0.55, SW(r), SH(r), r, 0.75 * Math.tan(EL) - 0.05); }
        }
        else if (d.k === 'shelf') box(Wl, x + 0.05, y + 0.2, x + 0.95, y + 0.95, 1.5 * Math.tan(EL), A.shelf, A.roof_flat, A.shelf);
        else if (d.k === 'carpet' || d.k === 'exitlight') { /* sol */ }
        else if (d.k === 'lianes' && m.get(x, y) !== T.BLOCK) { /* portail de lianes ouvert */ }
        else if (d.allume && S[d.k + '_on'] && m.get(d.allume[0], d.allume[1]) === T.BOULDER) { const r = S[d.k + '_on']; billboard(P, x + 0.5, y + 0.6, SW(r), SH(r), r); }
        else if (S[d.k]) {
          // arbres de décor (cerisiers, érables, palmiers…) : variés comme ceux des forêts, avec leur ombre au sol
          const arbre = !this.arbresUnis && S[d.k + '~1'], k = arbre ? variante(S, d.k, x, y) : d.k, r = S[k];
          // meubles de deux cases (le second est bloqué par l'intérieur) : centrés entre les deux ; les autres sur leur case
          billboard(P, x + (d.w ? d.w / 2 : WIDE_DECO.has(d.k) ? 1 : 0.5), y + (d.dz ?? 0.6), SW(r), SH(r), r, 0, arbre ? miroir(x, y) : false, arbre ? teinte(x, y) : 1);
          if (arbre || OMBRE_DECO.has(d.k)) this.ombreSol(Sh, x - 0.1, y + 0.3, x + 1.1, y + 0.82);
          if (d.k === 'lamp') glows.push([x + 0.5, y + 0.62, SH(r) * 0.82]);
          if (['statue', 'gymstatue', 'plant', 'lamp', 'mailbox', 'sign', 'pot', 'caverock', 'stalag', 'fridge', 'clock', 'books', 'pc', 'labmachine', 'vase', 'trash', 'machine_sous'].includes(d.k) || d.k.startsWith('borne_')) this.ombreSol(Sh, x + 0.1, y + 0.4, x + 0.9, y + 0.85);
        }
      }
    }
    const O = new Geo();
    if (SOL16 && m.outdoor) this.wangChunk(O, x0, y0);
    // relief en 3D : tout ce qui est posé suit le sol (l'ancien sol passe juste dessous du sol généré)
    if (r3d) {
      for (const q of [G, N, O]) this.r3dLift(q, -0.03); for (const q of [O0, NO, P, Wl]) this.r3dLift(q, 0);
      // ombres au sol : posées à plat sous l'arbre (au haut de sa case), et pas d'ombre sur une paroi
      for (let v = 0; v < Sh.n; v += 4) {
        const cx = (Sh.p[v * 3] + Sh.p[v * 3 + 6]) / 2, cz = (Sh.p[v * 3 + 2] + Sh.p[v * 3 + 8]) / 2;
        const h = r3d.surParoi(cx, cz) ? -1e3 : r3d.Hpose(cx, cz);
        for (let k = 0; k < 4; k++) Sh.p[(v + k) * 3 + 1] += h;
      }
    }
    const grp = new THREE.Group();
    const add = (geo, mat, order = 0) => { const g = geo.build(); if (g) { const me = new THREE.Mesh(g, mat); me.renderOrder = order; me.frustumCulled = false; grp.add(me); } };
    // sous le sol généré (sol.js, ordre -2, sans profondeur : pas de scintillement entre couches presque à la même hauteur)
    const sous = this.sol.couvre() ? -3 : 0;
    // relief en 3D : l'ancien sol (sous le sol généré) n'écrit pas la profondeur, le sol généré le recouvre toujours
    const M3 = r3d ? this.r3dMats() : this.mat;
    add(G, M3.ground, sous); add(N, M3.anim, sous); add(O, M3.overlay, sous); add(O0, this.mat.overlay); add(Sh, this.mat.shadow, 1); add(P, this.mat.sprite); add(Wl, this.mat.walls); add(NO, this.mat.animOver); add(PB, this.mat.overlay, 1);
    if (r3d) {
      // parois de la couche du dessus (texture vue de la caméra), dessinées juste après le sol généré
      const bw = m.ext ? CH : Math.min(CH, m.w - x0), bh = m.ext ? CH : Math.min(CH, m.h - y0), pg = bw > 0 && bh > 0 ? r3d.geoParois(ci, cj, bw, bh) : null;
      if (pg) { const me = new THREE.Mesh(pg, matParoi()); me.renderOrder = -1; me.frustumCulled = false; grp.add(me); }
      const gp = bw > 0 && bh > 0 && /[?&]r3tuiles/.test(location.search) ? r3d.geoPentes(ci, cj, bw, bh) : null;   // essai : tuiles simples
      for (const [k, g] of Object.entries(gp || {})) { const me = new THREE.Mesh(g, matPente(k)); me.renderOrder = -1; me.frustumCulled = false; grp.add(me); if (!this.tinted.includes(me.material)) this.tinted.push(me.material); }
      const fg = pg && facettesActives() ? r3d.geoFacettes(ci, cj, bw, bh) : null;
      if (fg) { const me = new THREE.Mesh(fg, matFacettes()); me.frustumCulled = false; grp.add(me); }
      // ravins : parois verticales jusqu'au fond noir
      const rv = bw > 0 && bh > 0 ? r3d.geoRavin(ci, cj, bw, bh) : null;
      if (rv?.paroi) { const me = new THREE.Mesh(rv.paroi, matParoi()); me.renderOrder = -1; me.frustumCulled = false; grp.add(me); }
      if (rv?.facettes) { const me = new THREE.Mesh(rv.facettes, matFacettes()); me.frustumCulled = false; grp.add(me); }
    }
    // lampadaires la nuit : halo autour de la lanterne et flaque de lumière au sol (retirés avec le bloc : defaireBloc)
    const lum = grp.userData.lum = [];
    for (const [gx, gz, gy] of glows) {
      const hs = this.hAt(gx, gz);
      const me = new THREE.Mesh(this.geoHalo, this.matGlow); me.position.set(gx, gy + hs, gz + 0.05); me.rotation.x = -0.3; me.userData.lampGlow = true;
      const fl = this.lum.lampe(gx, hs, gz);
      this.glows.add(me, fl); lum.push(me, fl);
    }
    this.root.add(grp);
    this.sol.demande(ci, cj, grp);
    return grp;
  }

  /** défait un bloc de carte : ses géométries, et ses lumières de nuit (partagées : seulement retirées) */
  defaireBloc(g) {
    this.root.remove(g); g.traverse((o) => o.geometry?.dispose());
    for (const me of g.userData.lum || []) this.glows?.remove(me);
  }
  /** une case a changé (arbre coupé, rocher brisé) : le morceau de carte qui la contient est reconstruit */
  rebuildAt(x, y) {
    const k = Math.floor(x / CH) + ',' + Math.floor(y / CH), g = this.chunks.get(k);
    if (g) { this.defaireBloc(g); this.chunks.delete(k); }
    this.sol.invalider(x, y);
    this.lastChunk = null;
  }
  /** promesse tenue quand le sol généré couvre tout l'écran (appeler après update) : derrière une transition, on attend
   *  les blocs plutôt que de laisser voir l'ancien sol (au plus ms millisecondes) */
  solPret(ms) {
    if (!this.sol.couvre()) return Promise.resolve(true);
    this.camera.updateMatrixWorld();
    const cam = this.camera.position, v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      v.set(nx, ny, 0.5).unproject(this.camera).sub(cam);
      const t = v.y < -1e-6 ? (this.focus.y - cam.y) / v.y : 400, x = cam.x + v.x * t, z = cam.z + v.z * t;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, z); y1 = Math.max(y1, z);
    }
    // les arbres et les toits du bas de l'écran ont leurs pieds une case plus bas
    return this.sol.pret(Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1) + 1, ms);
  }
  ensureChunks(px, py) {
    const ci = Math.floor(px / CH), cj = Math.floor(py / CH), k = ci + ',' + cj;
    if (k === this.lastChunk) return; this.lastChunk = k;
    const R = this.rayon || 2;   // blocs autour du point de vue (l'éditeur de carte voit plus loin)
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      // au-delà des bords, deux blocs de décor (forêt, mer, montagnes, roche) pour qu'on ne voie jamais le vide
      const ex = this.map.ext ? 2 : 0;
      if (i < -ex || j < -ex || (i - ex) * CH >= this.map.w || (j - ex) * CH >= this.map.h) continue;
      const kk = i + ',' + j; if (!this.chunks.has(kk)) this.chunks.set(kk, this.buildChunk(i, j));
      this.poserBatimentsBloc(i, j);
    }
    // les morceaux éloignés sont masqués ; ceux qui sont loin derrière nous sont défaits (la grande carte en compte des
    // milliers : la mémoire ne grossit pas à mesure qu'on voyage)
    for (const [kk, g] of this.chunks) {
      const [i, j] = kk.split(',').map(Number), d = Math.max(Math.abs(i - ci), Math.abs(j - cj));
      g.visible = d <= R;
      if (d > R + 4) { this.defaireBloc(g); this.chunks.delete(kk); }
    }
  }

  /** sorties des grottes vues de dedans : le couloir creusé dans la paroi s'éclaire du jour qui entre du dehors */
  buildSorties() {
    const L = this.map.sorties; if (!L || !L.length) return;
    for (const s of L) {
      const n = Math.min(s.n, 3) + 1, t = tex(jourGrotte(n)); t.flipY = true; t.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 }); mat.userData.own = true;
      const geo = new THREE.PlaneGeometry(1, n); geo.rotateX(-Math.PI / 2);
      const me = new THREE.Mesh(geo, mat); me.position.set(s.x + 0.5, 0.0052, s.y + n / 2); me.renderOrder = 1; this.root.add(me);
    }
  }

  /** teintes de la roche des plateaux d'un biome, relevées dans l'atlas (pour que l'arche des grottes s'y fonde) */
  paletteRoche(bio) {
    const A = this.A, px = [];
    for (const k of [`rw_${bio}_0`, `rt_${bio}_0`, `rp_${bio}_11`]) {
      const c = A.cells[k]; if (!c) continue;
      const x0 = Math.round(c[0] * A.size), y0 = Math.round(c[1] * A.size), w = Math.round((c[2] - c[0]) * A.size), h = Math.round((c[3] - c[1]) * A.size);
      const d = A.canvas.getContext('2d').getImageData(x0, y0, w, h).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (px.length < 50) return null;
    px.sort((a, b) => (a[0] * 3 + a[1] * 6 + a[2]) - (b[0] * 3 + b[1] * 6 + b[2]));
    const q = (f) => px[Math.min(px.length - 1, Math.floor(f * px.length))], hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    return [hex(q(0.02).map((v) => v * 0.55)), hex(q(0.08)), hex(q(0.3)), hex(q(0.55)), hex(q(0.8)), hex(q(0.97))];
  }

  /* ---------------- bâtiments ---------------- */
  /** les bâtiments de la carte : sur la grande carte, chacun n'est construit qu'au moment où le morceau de 16 cases qui
   *  le porte entre en vue (ensureChunks) ; les petites cartes (intérieurs, grottes) sont construites d'un coup */
  buildBuildings() {
    this.buildingMeshes = [];
    this._texBat = new Map(); this._fenetres = new Map();
    this.nightGroup = new THREE.Group(); this.root.add(this.nightGroup); this.nightGroup.visible = false;
    this.batAttente = new Map();
    for (const b of this.map.buildings) { const k = Math.floor(b.x / CH) + ',' + Math.floor(b.y / CH); if (!this.batAttente.has(k)) this.batAttente.set(k, []); this.batAttente.get(k).push(b); }
    if (this.map.buildings.length < 200) { for (const L of this.batAttente.values()) for (const b of L) this.poserBat(b); this.batAttente.clear(); }
  }
  /** construit les bâtiments en attente d'un morceau (i, j) */
  /** éditeur de carte : retire le rendu d'un bâtiment (déplacé ou effacé) */
  retirerBat(b) {
    for (const g of this.buildingMeshes.filter((q) => q.userData.b === b)) { this.root.remove(g); if (g.userData.win) this.nightGroup.remove(g.userData.win); for (const me of g.userData.lum || []) this.glows.remove(me); }
    this.buildingMeshes = this.buildingMeshes.filter((q) => q.userData.b !== b);
    for (const L of this.batAttente?.values() || []) { const i = L.indexOf(b); if (i >= 0) L.splice(i, 1); }
  }
  poserBatimentsBloc(i, j) { const k = i + ',' + j, L = this.batAttente?.get(k); if (!L) return; this.batAttente.delete(k); for (const b of L) this.poserBat(b); }
  poserBat(b) {
    const cache = this._texBat;
    const T3 = (key, mk) => { if (!cache.has(key)) cache.set(key, tex(mk())); return cache.get(key); };
    const g = new THREE.Group();
    // relief en 3D : le bâtiment est posé au niveau de sa porte (le sol est aplani dessous)
    const hb = this.r3d && b.kind !== 'cave' ? this.r3d.niveauBatiment(b) : 0;
    g.userData.hb = hb;
    const wallH = b.h * Math.tan(EL), o = 0.18;
    const zf = b.y + b.d + 0.02;
    const own = (t) => { const m = frontDepth(new THREE.MeshBasicMaterial({ map: t, vertexColors: true }), zf); this.tinted.push(m); m.userData.ownTint = true; return m; };
    if (b.kind === 'cave') {
      // la montagne est dessinée par les plateaux de roche (vueCarte : l'entrée et les arbres qui la bordent) ;
      // ici seulement la bouche sombre, peinte dans la falaise au-dessus de la porte
      const bio = bioDehors(this.map.zoneAt?.(b.x, b.y)?.theme), holeW = 1.5, holeD = 1.25;   // arche de 48 × 40 px
      const geo = new THREE.PlaneGeometry(holeW, holeD); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: T3('arche_' + bio, () => archeGrotte(bio, false, this.paletteRoche(bio))), transparent: true, alphaTest: 0.5 });
      mat.map.flipY = true; mat.map.needsUpdate = true;   // ligne 0 de l'image = nord (le haut de l'arche)
      this.tinted.push(mat); mat.color.copy(this.tint);
      const hole = new THREE.Mesh(geo, mat); hole.position.set(b.doorX + 0.5, 0.0056, b.doorY + 1 - holeD / 2); hole.renderOrder = 1;
      if (this.r3d) {
        // relief en 3D : la bouche est plaquée sur la paroi au-dessus de la porte (la géométrie suit le sol)
        const gg = new THREE.PlaneGeometry(holeW, holeD, 6, 5); gg.rotateX(-Math.PI / 2); gg.translate(b.doorX + 0.5, 0, b.doorY + 1 - holeD / 2);
        const ps = gg.attributes.position; for (let i = 0; i < ps.count; i++) ps.setY(i, this.r3d.H(ps.getX(i), ps.getZ(i)) + 0.02);
        hole.geometry.dispose(); hole.geometry = gg; hole.position.set(0, 0, 0); mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
      }
      g.add(hole); this.root.add(g); return;
    }
    // bâtiment en fausse 3D (modèle de batiments3d.js) quand un modèle a la bonne emprise ; sinon l'ancienne façade
    if (!/[?&]bati=0/.test(globalThis.location?.search || '')) {
      const z = this.map.zoneAt?.(b.x, b.y);
      const mod = choisirModele(b, { theme: z?.theme, ville: z?.town, typeArene: b.typeArene });
      if (mod) { const gm = this.batimentModele(b, mod); gm.position.y = hb; gm.userData.hb = hb; this.root.add(gm); this.buildingMeshes.push(gm); this.lumierePorte(gm, b, hb); return; }
    }
    const ks = kitStyle(b, this.map); b.kitStyle = ks;
    const fkey = `${ks}:${b.w}:${b.h}:${b.door}`;
    const fr = T3('f' + fkey, () => facade(ks, b.w, b.h, b.door, false, b.x * 7 + b.y));
    const sd = T3(`s${ks}:${b.d}:${b.h}`, () => sideWall(ks, b.d, b.h));
    // toit à deux pans, assez pentu pour qu'on voie surtout le pan avant (comme sur DS) ; toit plat pour les
    // centres, boutiques, arènes et la Ligue
    const flatRoof = b.flat || b.style === 'center' || b.style === 'mart' || b.style === 'gym' || b.style === 'league';
    const rh = flatRoof ? 0.35 : Math.min(2.2, 0.55 * b.d);
    // rangées de cellules d'un pan : sa hauteur à l'écran, en cases
    const rows = Math.max(1, Math.round(b.d / 2 + o + rh * 0.7));
    const rf = T3(`r${ks}:${b.roof}:${b.w}:${rows}`, () => roofTex(b.roof, b.w, b.d + 1, 3, ks, rows));
    const mFront = own(fr), mSide = own(sd), mRoof = own(rf);
    const x0 = b.x, x1 = b.x + b.w, z0 = b.y, z1 = b.y + b.d;
    // façade
    const geoF = new Geo(); geoF.quad([x0, 0, z1], [x1, 0, z1], [x1, wallH, z1], [x0, wallH, z1], 0, 0, 1, 1, 1);
    g.add(new THREE.Mesh(geoF.build(), mFront));
    // le toit déborde de o devant la façade : il est posé assez haut pour que son bord tombe pile sur le haut de la
    // façade à l'écran (sinon il cache le haut des fenêtres de l'étage)
    const eY = wallH + o * Math.tan(EL);
    const geoS = new Geo();
    geoS.quad([x1, 0, z1], [x1, 0, z0], [x1, eY, z0], [x1, eY, z1], 0, 0, 1, 1, 0.8);
    geoS.quad([x0, 0, z0], [x0, 0, z1], [x0, eY, z1], [x0, eY, z0], 0, 0, 1, 1, 0.8);
    g.add(new THREE.Mesh(geoS.build(), mSide));
    const zm = (z0 + z1) / 2, ytop = eY + rh;
    const geoR = new Geo();
    geoR.quad([x0 - o, eY, z1 + o], [x1 + o, eY, z1 + o], [x1 + o, ytop, zm], [x0 - o, ytop, zm], 0, 0.5, 1, 1, 1);
    geoR.quad([x1 + o, eY, z0 - o], [x0 - o, eY, z0 - o], [x0 - o, ytop, zm], [x1 + o, ytop, zm], 0, 0, 1, 0.5, 0.7);
    g.add(new THREE.Mesh(geoR.build(), mRoof));
    // pignons et liseré : couleur du mur et du rebord du kit (la couleur du toit pour les maisons recolorées)
    const rc = roofColors[b.roof] || roofColors.red;
    const kitted = !!kitColor(ks);
    const gableCol = (kitted && kitColor(ks, 'mur', -0.12)) || rc[1];
    const eaveCol = ks === 'house' || ks === 'house2' || ks === 'bighouse' || ks === 'tower' || ks === 'gate' || !kitted ? rc[1] : kitColor(ks, 'rebord', -0.35) || rc[1];
    const mkCol = (col) => { const m = frontDepth(new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }), zf); this.tinted.push(m); m.userData.ownTint = true; m.userData.base = new THREE.Color(col); return m; };
    const gableMat = mkCol(gableCol), eaveMat = mkCol(eaveCol);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([x1 + o, eY, z1 + o, x1 + o, eY, z0 - o, x1 + o, ytop, zm, x0 - o, eY, z0 - o, x0 - o, eY, z1 + o, x0 - o, ytop, zm], 3));
    g.add(new THREE.Mesh(gg, gableMat));
    // bande de mur sous le débord du toit (cachée par le rebord, sauf de très près)
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute([x0, wallH, z1, x1, wallH, z1, x1, eY, z1, x0, wallH, z1, x1, eY, z1, x0, eY, z1], 3));
    g.add(new THREE.Mesh(band, gableMat));
    // liseré sous le toit
    const eave = new THREE.Mesh(new THREE.BoxGeometry(b.w + 2 * o, 0.1, 0.1), eaveMat); eave.position.set((x0 + x1) / 2, eY - 0.05, z1 + o); g.add(eave);
    // ombre portée au sol devant le bâtiment
    const sh = new Geo();
    this.ombreSol(sh, x0 - 0.1, z1 - 0.3, x1 + 0.1, z1 + 0.3, 0.012, 'bande');
    g.add(new THREE.Mesh(sh.build(), this.mat.shadow));
    g.userData.b = b; g.userData.front = mFront; g.userData.fkey = fkey;
    // ce que le bâtiment couvre à l'écran (fondu quand on passe derrière) : débords du toit, faîte et bord arrière
    g.userData.ecran = { x0: -o, x1: b.w + o, zN: Math.min(-o - eY / Math.tan(EL), b.d / 2 - ytop / Math.tan(EL)) };
    g.position.y = hb;
    this.root.add(g); this.buildingMeshes.push(g);
    this.fenetresBat(g);
    this.lumierePorte(g, b, hb);
  }
  /** la nuit, la lumière de l'entrée se pose sur le seuil (bâtiments habités du dehors) */
  lumierePorte(g, b, hb) {
    if (!this.map.outdoor || !(b.door >= 0) || b.doorX == null || !['house', 'house2', 'bighouse', 'center', 'mart', 'gym', 'lab', 'league'].includes(b.kind)) return;
    const fl = this.lum.porte(b.doorX, hb, b.doorY); this.glows.add(fl); g.userData.lum = [fl];
  }
  /** pose un bâtiment en fausse 3D : géométries fusionnées du modèle, matériaux sans lumière (éclairage cuit),
   *  profondeur de façade, teinte de l'heure */
  batimentModele(b, mod) {
    const parts = geometriesModele(mod.nom, mod.o);
    const [ew, ed] = EMPRISES[mod.nom] || [b.w, b.d];
    const sx = mod.libre ? 1 : b.w / ew, sz = mod.libre ? 1 : b.d / ed;
    const g = new THREE.Group(); g.position.set(b.x, 0, b.y); g.scale.set(sx, 1, sz);
    const zf = b.y + b.d + 0.02;
    for (const p of parts) {
      const m0 = p.mat0;
      const mat0 = new THREE.MeshBasicMaterial({ map: m0.map || null, vertexColors: true, transparent: !!m0.transparent, opacity: m0.opacity ?? 1, side: m0.side, alphaTest: m0.alphaTest || 0 });
      const mat = b.libres?.length && b.w * b.d <= GRILLE_MAX ? profondeurGrille(mat0, b) : frontDepth(mat0, zf);
      mat.userData.base = couleurBase(m0); mat.userData.ownTint = true; mat.userData.op0 = m0.transparent ? (m0.opacity ?? 1) : 1;
      const cle = m0.map?.userData?.cle || '';
      if (/^(verre|vr|vt|r#|rs|ev|ed)/.test(cle)) mat.userData.vitre = true;   // vitres : allumées la nuit
      // maisons des villes : deux maisons du même modèle n'ont pas tout à fait la même lumière (murs, toit un peu
      // plus clairs ou plus sombres, plus chauds ou plus froids)
      if (mod.nom === 'maisonVille' && !mat.userData.vitre) { const f = 0.94 + hash(b.x * 3 + 1, b.y * 5 + 2) * 0.1, c = (hash(b.x * 7 + 5, b.y * 11 + 3) - 0.5) * 0.06; mat.userData.base.multiply(new THREE.Color(f * (1 + c), f, f * (1 - c))); }
      mat.color.copy(mat.userData.base).multiply(this.tint);
      this.tinted.push(mat);
      g.add(new THREE.Mesh(p.geo, mat));
    }
    const sh = new Geo();
    this.ombreSol(sh, 0 - 0.1, b.d - 0.3, b.w + 0.1, b.d + 0.3, 0.012, 'bande');
    const ombre = new THREE.Mesh(sh.build(), this.mat.shadow); ombre.scale.set(1 / sx, 1, 1 / sz); g.add(ombre);
    g.userData.b = b; g.userData.modele = mod.nom;
    g.userData.ecran = empriseEcran(parts, mod, sx, sz);
    return g;
  }
  buildWindowsGroup() { /* les fenêtres de nuit sont posées avec chaque bâtiment (fenetresBat) */ }
  /** à la nuit tombée, fenêtres et portes s'allument (façades de nuit non teintées) */
  fenetresBat(g) {
    const b = g.userData.b; if (!b || g.userData.modele) return;
    const cache = this._fenetres, key = g.userData.fkey;
    if (!cache.has(key)) {
      const ks = b.kitStyle || b.style;
      const day = facade(ks, b.w, b.h, b.door, false, b.x * 7 + b.y), night = facade(ks, b.w, b.h, b.door, true, b.x * 7 + b.y);
      // ne garder que les pixels qui changent (fenêtres)
      const c = document.createElement('canvas'); c.width = day.width; c.height = day.height;
      const x = c.getContext('2d'); const dd = day.getContext('2d').getImageData(0, 0, c.width, c.height), nd = night.getContext('2d').getImageData(0, 0, c.width, c.height);
      const out = x.createImageData(c.width, c.height);
      for (let i = 0; i < dd.data.length; i += 4) { if (dd.data[i] !== nd.data[i] || dd.data[i + 1] !== nd.data[i + 1] || dd.data[i + 2] !== nd.data[i + 2]) { out.data[i] = nd.data[i]; out.data[i + 1] = nd.data[i + 1]; out.data[i + 2] = nd.data[i + 2]; out.data[i + 3] = 255; } }
      x.putImageData(out, 0, 0);
      cache.set(key, new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, alphaTest: 0.5 }));
    }
    const wallH = b.h * Math.tan(EL);
    const geo = new Geo(); geo.quad([b.x, 0, b.y + b.d + 0.01], [b.x + b.w, 0, b.y + b.d + 0.01], [b.x + b.w, wallH, b.y + b.d + 0.01], [b.x, wallH, b.y + b.d + 0.01], 0, 0, 1, 1, 1);
    const wm = new THREE.Mesh(geo.build(), cache.get(key).clone()); wm.position.y = g.userData.hb || 0; g.userData.win = wm; this.nightGroup.add(wm);
  }


  /* ---------------- personnages, objets ---------------- */
  actor(id, o) {
    let a = this.actors.get(id);
    if (!a) {
      const geo = new THREE.PlaneGeometry(CW / CD * WPX, CHH / CD * HPX); geo.translate(0, CHH / CD / 2 * HPX, 0);
      // point d'ancrage (les pieds) : la bulle « ! » flotte au-dessus d'un personnage mais reste calée sur ses pieds
      const ay = o.kind === 'bang' ? -34 * HPX : 0;
      geo.setAttribute('anchor', new THREE.Float32BufferAttribute([0, ay, 0, 0, ay, 0, 0, ay, 0, 0, ay, 0], 3));
      const mesh = new THREE.Mesh(geo, o.kind === 'flat' ? this.mat.flatSprite : o.kind === 'item' || o.kind === 'bang' ? this.mat.actorSprite : this.mat.chars);
      const S = this.ombres.uv(0.85 * TILE_PX, 0.42 * TILE_PX);
      const sg = new THREE.PlaneGeometry(0.85, 0.42); sg.rotateX(-Math.PI / 2);
      const uv = sg.attributes.uv; for (let i = 0; i < 4; i++) uv.setXY(i, i % 2 ? S[2] : S[0], i < 2 ? S[1] : S[3]);
      const shadow = new THREE.Mesh(sg, this.mat.shadow); shadow.renderOrder = 1;
      a = { mesh, shadow, kind: o.kind || 'char', dispose: () => { geo.dispose(); sg.dispose(); this.root?.remove(mesh); this.root?.remove(shadow); } };
      this.root.add(mesh); if (o.kind !== 'bang') this.root.add(shadow);
      this.actors.set(id, a);
      if (o.kind === 'item') { const r = this.S.rects.itemball; this.setSpriteRect(a, r, r.w, r.h); }
      if (o.kind === 'bang') { const r = this.S.rects.bang; this.setSpriteRect(a, r, r.w, r.h); }
    }
    return a;
  }
  setSpriteRect(a, r, w, h) {
    const g = a.mesh.geometry; const pos = g.attributes.position, uv = g.attributes.uv;
    const W = w * WPX / (r.d || 1), H = h * HPX / (r.d || 1);
    pos.setXYZ(0, -W / 2, H, 0); pos.setXYZ(1, W / 2, H, 0); pos.setXYZ(2, -W / 2, 0, 0); pos.setXYZ(3, W / 2, 0, 0);
    uv.setXY(0, r.u0, r.v0); uv.setXY(1, r.u1, r.v0); uv.setXY(2, r.u0, r.v1); uv.setXY(3, r.u1, r.v1);
    pos.needsUpdate = uv.needsUpdate = true; g.computeBoundingSphere();
  }
  /** cadre d'animation : sprite (ligne), direction, pas (0 = immobile) */
  setFrame(a, sprite, dir, step) {
    const row = CHAR_ROWS[sprite] ?? CHAR_ROWS[CHAR_ALIAS[sprite]] ?? 0, col = DIR_COL[dir] * 3 + (step === 0 ? 1 : step === 1 ? 0 : 2);
    const k = row * 100 + col; if (a.frame === k) return; a.frame = k;
    // la planche est rangée en deux colonnes (texture moins haute : les téléphones plafonnent souvent à 4096 px)
    const half = this.charHalf, blk = row >= half ? 1 : 0, pr = row - blk * half;
    const u0 = (blk * 12 + col) / 24, u1 = (blk * 12 + col + 1) / 24, v0 = pr / half, v1 = (pr + 1) / half;
    const uv = a.mesh.geometry.attributes.uv; uv.setXY(0, u0, v0); uv.setXY(1, u1, v0); uv.setXY(2, u0, v1); uv.setXY(3, u1, v1); uv.needsUpdate = true;
  }
  place(a, x, y, hop = 0, inGrass = false) {
    const h = this.r3d ? this.r3d.Hmarche(x + 0.5, y + 0.55) : 0;
    a.mesh.position.set(x + 0.5, hop + h, y + 0.55);
    a.shadow.position.set(x + 0.5, 0.02 + h, y + 0.6);
    a.shadow.visible = !inGrass;
  }
  /** les herbes hautes s'agitent quand on y entre (les brins de devant se couchent et se relèvent) */
  rustle(x, y) { this.rustleAt = { k: x + ',' + y, t0: performance.now() }; }
  /** hautes herbes devant un personnage : la rangée du bas du tapis, redessinée devant lui, cache ses jambes ;
   *  gx, gy : la case d'herbe où il se tient (null : il n'est pas dans l'herbe) */
  cover(a, gx, gy) {
    if (gx == null) { if (a.cover) a.cover.visible = false; if (a.herbe) a.herbe.visible = false; a.herbeCase = null; return; }
    // sol généré : l'herbe de devant est découpée dans le sol de la case, et s'écarte quand on y entre (herbes.js)
    if (this.herbeDevant(a, gx, gy)) { if (a.cover) a.cover.visible = false; return; }
    if (a.herbe) a.herbe.visible = false;
    const t = this.map.get(gx, gy), theme = this.map.outdoor ? this.map.zoneAt(gx, gy)?.theme : null;
    const base = t === T.DARKTALL ? 'darkfront' : theme === 'snow' ? 'snowfront' : 'grassfront';
    const rs = this.rustleAt, shake = rs && rs.k === gx + ',' + gy && performance.now() - rs.t0 < 360;
    const key = base + (shake && Math.floor((performance.now() - rs.t0) / 90) % 2 === 0 ? '2' : '');
    const r = this.S.rects[key]; if (!r) return;
    if (!a.cover) {
      const geo = new THREE.PlaneGeometry(1, 1); geo.setAttribute('anchor', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
      a.cover = new THREE.Mesh(geo, this.mat.actorSprite); this.root.add(a.cover);
      const d = a.dispose; a.dispose = () => { d(); this.root?.remove(a.cover); geo.dispose(); };
    }
    if (a.coverKey !== key) { this.setSpriteRect({ mesh: a.cover }, r, r.w, r.h); a.coverKey = key; }
    a.cover.visible = true; a.cover.position.set(gx + 0.5, this.hAt(gx + 0.5, gy + 0.99), gy + 0.99);
  }
  /** herbe de devant découpée dans le sol généré (texture des images de herbes.js, gardée par case) ; null si pas prête */
  herbeTex(gx, gy) {
    const c = this.sol.solCase(gx, gy); if (!c) return undefined;
    const C = this.herbes, k = gx + ',' + gy;
    let e = C.get(k);
    if (e && e.d !== c.d) { e.tex?.dispose(); C.delete(k); e = null; }
    if (!e) {
      const r = dessinHerbe(this.sol.pixelsCase(gx, gy).px);
      let tex = null;
      if (r) {
        tex = new THREE.DataTexture(r.data, r.w, r.h, THREE.RGBAFormat);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      }
      e = { d: c.d, tex }; C.set(k, e);
      if (C.size > 64) { const [k0, e0] = C.entries().next().value; e0.tex?.dispose(); C.delete(k0); }
    }
    return e.tex;
  }
  herbeDevant(a, gx, gy) {
    const tex = this.herbeTex(gx, gy);
    if (tex === undefined) return false;                                   // sol généré pas encore là : l'ancienne herbe
    if (!tex) { if (a.herbe) a.herbe.visible = false; return true; }       // pas d'herbe haute dessinée dans cette case
    if (!a.herbe) {
      // couchée sur le sol, projetée exactement comme lui (chaque pixel retombe sur le pixel qu'il recopie, partout à
      // l'écran), mais à la profondeur d'un panneau dressé au bord sud de la case : devant les jambes de qui s'y tient
      const x0 = -0.5 - HERBE_M / 32, x1 = 0.5 + HERBE_M / 32, z0 = -HERBE_H / 32;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x0, 0, 0, x1, 0, 0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      const mat = herbeDebout(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
      mat.color.copy(this.tint); this.tinted.push(mat);
      const me = a.herbe = new THREE.Mesh(geo, mat); me.frustumCulled = false; a.herbeF = -1; this.root.add(me);
      const d = a.dispose; a.dispose = () => { d(); this.root?.remove(me); geo.dispose(); mat.dispose(); this.tinted = this.tinted.filter((m) => m !== mat); };
    }
    const me = a.herbe, now = performance.now(), k = gx + ',' + gy;
    if (me.material.map !== tex) me.material.map = tex;
    if (a.herbeCase !== k) { a.herbeCase = k; a.herbeT0 = now; }   // on vient d'entrer dans la case : les brins s'écartent
    const f = imageHerbe(now - a.herbeT0);
    if (a.herbeF !== f) {
      const uv = me.geometry.attributes.uv, u0 = f / NIMAGES, u1 = (f + 1) / NIMAGES;
      uv.setXY(0, u0, 0); uv.setXY(1, u1, 0); uv.setXY(2, u0, 1); uv.setXY(3, u1, 1); uv.needsUpdate = true; a.herbeF = f;
    }
    me.visible = true; me.position.set(gx + 0.5, this.hAt(gx + 0.5, gy + 0.75), gy + 1);
    return true;
  }
  /** grande créature posée sur la carte (légendaire) : son image de face, debout sur la case */
  imageActor(id, img, scale = 1) {
    let a = this.actors.get(id); if (a) return a;
    const t = tex(img); t.flipY = true; t.needsUpdate = true;   // image chargée telle quelle : le haut en haut
    const W = Math.round(img.width * scale) * WPX, H = Math.round(img.height * scale) * HPX;
    const geo = new THREE.PlaneGeometry(W, H); geo.translate(0, H / 2 - 3 * HPX * scale, 0);
    geo.setAttribute('anchor', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    const mat = screenSprite(new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })); this.tinted.push(mat); mat.color.copy(this.tint);
    const mesh = new THREE.Mesh(geo, mat);
    const S = this.ombres.uv(1.6 * TILE_PX, 0.7 * TILE_PX), sg = new THREE.PlaneGeometry(1.6, 0.7); sg.rotateX(-Math.PI / 2);
    const uv = sg.attributes.uv; for (let i = 0; i < 4; i++) uv.setXY(i, i % 2 ? S[2] : S[0], i < 2 ? S[1] : S[3]);
    const shadow = new THREE.Mesh(sg, this.mat.shadow); shadow.renderOrder = 1;
    a = { mesh, shadow, kind: 'image', dispose: () => { geo.dispose(); sg.dispose(); t.dispose(); mat.dispose(); this.tinted = this.tinted.filter((m) => m !== mat); this.root?.remove(mesh); this.root?.remove(shadow); } };
    this.root.add(mesh); this.root.add(shadow); this.actors.set(id, a);
    return a;
  }
  /** planche des personnages pour la carte graphique : les rangées en deux colonnes côte à côte */
  packChars() {
    const L = this.charsCanvas; if (!L) { this.charHalf = Math.ceil(this.charRows / 2); return L; }
    const half = this.charHalf = Math.ceil(this.charRows / 2);
    const c = this.charsPacked = document.createElement('canvas'); c.width = L.width * 2; c.height = half * CHH;
    const x = c.getContext('2d'); x.drawImage(L, 0, 0, L.width, half * CHH, 0, 0, L.width, half * CHH);
    x.drawImage(L, 0, half * CHH, L.width, L.height - half * CHH, L.width, 0, L.width, L.height - half * CHH);
    return c;
  }
  /** recopie une rangée de la planche dans la texture */
  packRow(r) {
    const L = this.charsCanvas, c = this.charsPacked, half = this.charHalf, blk = r >= half ? 1 : 0, x = c.getContext('2d');
    x.clearRect(blk * L.width, (r - blk * half) * CHH, L.width, CHH);
    x.drawImage(L, 0, r * CHH, L.width, CHH, blk * L.width, (r - blk * half) * CHH, L.width, CHH);
    this.texC.needsUpdate = true;
  }
  /** pose la rangée composée du joueur (768 × 64) dans la planche des personnages */
  setJoueur(row) {
    const c = this.charsCanvas, x = c.getContext('2d'), y = CHAR_ROWS.joueur * CHH;
    x.clearRect(0, y, c.width, CHH); x.drawImage(row, 0, y);
    this.packRow(CHAR_ROWS.joueur);
  }
  /** rangée d'un autre joueur pour sa tenue (code court) : composée une fois, gardée tant qu'elle sert ; null si plus de place */
  pairSprite(code, composer) {
    const P = this.pairs || (this.pairs = new Map());
    if (P.has(code)) { const e = P.get(code); e.t = performance.now(); return e.key; }
    let slot = -1;
    for (let i = 0; i < PAIRS; i++) if (![...P.values()].some((e) => e.i === i)) { slot = i; break; }
    if (slot < 0) { let old = null; for (const [k, e] of P) if (!old || e.t < old[1].t) old = [k, e]; if (performance.now() - old[1].t < 4000) return null; slot = old[1].i; P.delete(old[0]); }
    const row = composer(); if (!row) return null;
    const c = this.charsCanvas, x = c.getContext('2d'), y = CHAR_ROWS['pair' + slot] * CHH;
    x.clearRect(0, y, c.width, CHH); x.drawImage(row, 0, y); this.packRow(CHAR_ROWS['pair' + slot]);
    const e = { i: slot, key: 'pair' + slot, t: performance.now() }; P.set(code, e); return e.key;
  }
  /** le modèle de base d'un genre (pour composer une tenue) */
  baseDe(genre) { const r = CHAR_ROWS['base_' + genre]; return r == null ? null : { src: this.charsCanvas, sx: 0, sy: r * CHH }; }
  removeActor(id) { const a = this.actors.get(id); if (a) { a.dispose(); this.actors.delete(id); } }
  /** position à l'écran (pixels de la page) d'un point de la carte, à h pixels au-dessus du sol (noms des autres joueurs) */
  screenPos(x, y, h = 34) {
    const v = new THREE.Vector3(x + 0.5, h * HPX + this.hAt(x + 0.5, y + 0.55), y + 0.55).project(this.camera);
    if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { left: r.left + (v.x + 1) / 2 * r.width, top: r.top + (1 - v.y) / 2 * r.height };
  }

  /* ---------------- heure du jour ---------------- */
  setTimeOfDay(h) {
    // aube rosée, matin doré, journée neutre, soir orangé, nuit bleue (lumieres.js : teintes vues à l'écran)
    const c = teinteHeure(h);
    this.night = nuitHeure(h);
    this.tintBase = c;
    this.applyTint(c);
  }
  applyTint(c) {
    const indoorOrCave = !this.map?.outdoor;
    let k = indoorOrCave ? (this.map?.floor === 'cave' ? [0.82, 0.8, 0.86] : [1, 1, 1]) : this.eclipse ? [0.3, 0.17, 0.44] : c;
    // sous les frondaisons : plus sombre, un peu plus vert
    if (!indoorOrCave && this.ombre < 0.999) { const o = this.ombre; k = [k[0] * o * 0.94, k[1] * Math.min(1, o * 1.06), k[2] * o * 0.92]; }
    this.tint.setRGB(k[0], k[1], k[2]);
    for (const m of this.tinted) { const base = m.userData.base; if (m.userData.vitre && !indoorOrCave && this.night > 0.5) m.color.setRGB(...VITRE_NUIT); else if (base) m.color.copy(base).multiply(this.tint); else m.color.copy(this.tint); }
    if (this.nightGroup) this.nightGroup.visible = !indoorOrCave && this.night > 0.5;
    if (this.glows) this.glows.visible = !indoorOrCave && this.night > 0.5;
  }

  /** un bâtiment qui cache le joueur (marchant derrière lui) devient transparent, comme une vitre */
  fadeBuildings(fx, fy, dt) {
    const tan = Math.tan(EL);
    // rangée de l'écran où tombent les pieds du joueur (relief en 3D : un joueur en hauteur se voit plus au nord)
    const pied = fy + 0.55 - (this.r3d ? this.r3d.Hmarche(fx + 0.5, fy + 0.55) : 0) / tan;
    for (const g of this.buildingMeshes || []) {
      const b = g.userData.b; if (!b) continue;
      // derrière le bâtiment (au nord de son emprise), il le cache dès que ses pieds passent sous le haut du modèle à
      // l'écran (faîte, cheminée, statue, flèche…) et qu'il est dans sa largeur réelle (galeries et débords compris)
      const e = g.userData.ecran, hb = g.userData.hb || 0;
      const hid = !this.sansFondu && fy < b.y - 0.5 && (e
        ? pied > b.y + e.zN - hb / tan + 0.15 && fx + 0.85 > b.x + e.x0 && fx + 0.15 < b.x + e.x1
        : fx > b.x - 1 && fx < b.x + b.w && fy > b.y - b.h - 1.2);   // sansFondu : éditeur de carte
      const t = hid ? 0.45 : 1;
      const o = g.userData.opacity ?? 1;
      if (o === t) continue;
      const n = o + Math.sign(t - o) * Math.min(Math.abs(t - o), dt * 4);
      g.userData.opacity = n;
      const mats = [];
      g.traverse((m) => { if (m.material && m.material !== this.mat.shadow) mats.push(m.material); });
      if (g.userData.win) mats.push(g.userData.win.material);
      for (const m of mats) { const o0 = m.userData.op0 ?? 1; m.transparent = n < 1 || o0 < 1; m.opacity = n * o0; m.depthWrite = n >= 1 && o0 >= 1; m.needsUpdate = true; }
    }
  }

  /* ---------------- image ---------------- */
  update(dt, fx, fy) {
    this.ensureChunks(fx, fy);
    if (Math.abs(this.ombre - this.ombreCible) > 0.002) { this.ombre += (this.ombreCible - this.ombre) * Math.min(1, dt * 2.5); this.applyTint(this.tintBase); }
    this.sol.update(dt, Math.floor(fx / CH), Math.floor(fy / CH), fx + 0.5, fy + 0.5);
    this.animT += dt;
    if (this.animT > 0.2) {
      this.animT = 0; this.animFrame = (this.animFrame + 1) % this.N.frames.length;
      const ctx = this.N.canvas.getContext('2d'); ctx.clearRect(0, 0, this.N.canvas.width, this.N.canvas.height); ctx.drawImage(this.N.frames[this.animFrame], 0, 0); this.texN.needsUpdate = true;
    }
    this.focus.set(fx + 0.5, 0, fy + 0.5);
    if (this.r3d) {
      // relief en 3D : la caméra suit la hauteur du sol, calée sur la grille des pixels (rien ne « nage » en marchant)
      const fh = this.r3d.Hmarche(fx + 0.5, fy + 0.55), tan = Math.tan(EL);
      const s = Math.round((fy + 0.5 - fh / tan) * TILE_PX) / TILE_PX;
      this.focus.set(Math.round((fx + 0.5) * TILE_PX) / TILE_PX, fh, s + fh / tan);
    }
    this.fadeBuildings(fx, fy, dt);
    const d = this.r3d && this.r3dOrtho ? 400 : this.dist;
    if (this.r3d && this.r3dOrtho) {
      // relief en 3D : projection orthographique (32 px par case, comme la perspective au centre de l'écran) ; un pas
      // de la caméra décale toute l'image d'un nombre entier de pixels, le sol ne « nage » pas en marchant
      // (?r3zoom=Z : vue Z fois plus large, pour regarder une montagne entière ; les sprites rapetissent d'autant)
      const z = this.r3zoom ??= Math.max(1, +(new URLSearchParams(globalThis.location?.search || '').get('r3zoom')) || 1);
      if (z > 1) { SPRITE_UNIFORMS.uEch.value = z; this.rayon = Math.max(this.rayon || 2, Math.ceil(2 * z + 1)); }
      const u = SPRITE_UNIFORMS.uRes.value, l = -u.x / 64 * z, t = u.y * Math.sin(EL) / 64 * z, n = 1, f = 4000;
      this.camera.projectionMatrix.set(2 / (2 * -l), 0, 0, 0, 0, 2 / (2 * t), 0, 0, 0, 0, -2 / (f - n), -(f + n) / (f - n), 0, 0, 0, 1);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      this._ortho = true;
    } else if (this._ortho) { this._ortho = false; this.resize(SPRITE_UNIFORMS.uRes.value.x, SPRITE_UNIFORMS.uRes.value.y); }
    this.camera.position.set(this.focus.x, this.focus.y + d * Math.sin(EL), this.focus.z + d * Math.cos(EL));
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.85; if (this.shake < 0.01) this.shake = 0; }
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    this.weather?.update(dt, this.focus.x, this.focus.z);
  }
  setWeather(w) { this.weather?.setWeather(w); }
  render() { this.renderer.render(this.scene, this.camera); }
}
