// odyssee/js/render/world3d.js — rendu « fausse 3D » façon DS : sol en tuiles, bâtiments en volume,
// arbres / herbes / personnages en sprites verticaux, caméra inclinée en perspective étroite, rendu basse résolution.
import * as THREE from 'three';
import { T } from '../world/tiles.js';
import { buildAtlas, buildAnimAtlas, buildSprites, applySpriteImages, facade, sideWall, roofTex, roofColors, PAL } from './textures.js';
import { SPRITES } from '../data/sprites.js';

export const EL = 55 * Math.PI / 180, FOV = 22;

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
export const SPRITE_UNIFORMS = { uRes: { value: new THREE.Vector2(400, 240) } };
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
const WIDE_DECO = new Set(['healer', 'sofa', 'bench', 'startertable', 'fireplace', 'rug']);
function screenSprite(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRes = SPRITE_UNIFORMS.uRes;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 anchor;\nuniform vec2 uRes;')
      .replace('#include <project_vertex>', `
        vec4 sW = modelMatrix * vec4( transformed, 1.0 );
        vec4 sA = modelMatrix * vec4( anchor, 1.0 );
        vec3 sD = sW.xyz - sA.xyz;
        vec4 sAC = projectionMatrix * viewMatrix * sA;
        vec2 sPx = floor( ( sAC.xy / sAC.w * 0.5 + 0.5 ) * uRes + 0.5 ) + vec2( sD.x / ${WPX_STR}, sD.y / ${HPX_STR} );
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
const CH = 16;
// lignes de la planche des personnages (img/chars.png) ; les anciens noms des sprites du prototype pointent vers les nouveaux
export const CHAR_ROWS = { ...((SPRITES.chars && SPRITES.chars.rows) || {}) };
// taille d'une case de la planche des personnages (32 × 32 depuis la version 2 de la bible)
const CW = SPRITES.chars?.w || 24, CHH = SPRITES.chars?.h || 32, CD = SPRITES.chars?.d || 1;
const CHAR_ALIAS = { red: 'player_m', green: 'player_f', prof: 'scientifique', clerk: 'vendeur', youngster: 'gamin', lass: 'habitante', sailor: 'marin', hiker: 'montagnard', cooltrainer_f: 'habitante' };
const DIR_COL = { down: 0, left: 1, right: 2, up: 3 };

function tex(canvasOrImg) {
  const t = new THREE.Texture(canvasOrImg);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** accumulateur de géométrie (quads indexés) */
class Geo {
  constructor() { this.p = []; this.uv = []; this.c = []; this.i = []; this.n = 0; this.an = []; }
  quad(a, b, c, d, u0, v0, u1, v1, shade = 1, anchor = null) {
    if (anchor) for (let k = 0; k < 4; k++) this.an.push(...anchor);
    // a=bas-gauche, b=bas-droite, c=haut-droite, d=haut-gauche (du point de vue de la texture)
    this.p.push(...a, ...b, ...c, ...d);
    this.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
    for (let k = 0; k < 4; k++) this.c.push(shade, shade, shade);
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

export class WorldView {
  constructor(renderer, charsImg, art = {}) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
    const A = buildAtlas(), N = buildAnimAtlas(), S = buildSprites();
    if (art.sprites) applySpriteImages(S, art.sprites, art.dens);
    this.A = A; this.N = N; this.S = S;
    this.charRows = charsImg ? Math.round(charsImg.height / CHH) : 10;
    this.texA = tex(A.canvas); this.texN = tex(N.canvas); this.texS = tex(S.canvas); this.texC = tex(charsImg);
    const mk = (map, o = {}) => new THREE.MeshBasicMaterial({ map, vertexColors: true, ...o });
    this.mat = {
      ground: mk(this.texA), anim: mk(this.texN), sprite: screenSprite(mk(this.texS, { alphaTest: 0.5, side: THREE.DoubleSide })),
      chars: screenSprite(new THREE.MeshBasicMaterial({ map: this.texC, alphaTest: 0.5, side: THREE.DoubleSide })),
      // sprites isolés (objets, bulle « ! », herbes qui bougent) : pas de couleurs de sommets
      actorSprite: screenSprite(new THREE.MeshBasicMaterial({ map: this.texS, alphaTest: 0.5, side: THREE.DoubleSide })),
      // sprite couché au sol (sillage du surf)
      flatSprite: new THREE.MeshBasicMaterial({ map: this.texS, alphaTest: 0.5, side: THREE.DoubleSide }),
      shadow: mk(this.texS, { transparent: true, depthWrite: false }),
      walls: mk(this.texA),
    };
    this.tinted = Object.values(this.mat);
    this.glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 1, 16, 16, 16); g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(0.4, 'rgba(255,210,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return tex(c); })();
    this.matGlow = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.tint = new THREE.Color(1, 1, 1); this.night = 0;
    this.animFrame = 0; this.animT = 0;
    this.focus = new THREE.Vector3(); this.shake = 0;
    this.actors = new Map();
    this.root = null;
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
    this.map = map; this.root = new THREE.Group(); this.scene.add(this.root);
    this.chunks = new Map(); this.glows = new THREE.Group(); this.root.add(this.glows);
    this.decoAt = new Map(); for (const d of map.deco) this.decoAt.set(d.x + ',' + d.y, d);
    this.scene.background = new THREE.Color(map.outdoor ? '#1d4f2a' : '#0c0a10');
    if (map.id === 'monde') this.scene.background = new THREE.Color('#1d4f2a');
    this.buildBuildings();
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
    const isPathish = (q) => [T.PATH, T.PAVE, T.SAND, T.BUILD, T.DOOR, T.BRIDGE, T.SIGN, T.BLOCK, T.MAT].includes(q);
    switch (tt) {
      case T.GRASS: case T.FENCE: case T.ROCK: case T.BUSH: case T.CUT: return { c: A[grassKey] };
      case T.SMASH: return { c: m.outdoor ? A[grassKey] : A['cave' + (v < 0.5 ? 0 : 1)] };
      case T.TALL: return { c: theme === 'snow' ? A.snow1 : A['tall' + (v < 0.5 ? 0 : 1)] };
      case T.DARKTALL: return { c: A['darktall' + (v < 0.5 ? 0 : 1)] };
      case T.TREE: case T.PINE: return { c: theme === 'volcanic' ? A.ash1 : theme === 'snow' ? A.snow1 : A['forest' + (v < 0.5 ? 0 : 1)] };
      case T.PATH: return { c: A['path' + edge(isPathish)] };
      case T.PAVE: case T.DOOR: case T.BUILD: return { c: A['pave' + edge((q) => isPathish(q))] };
      case T.SAND: return { c: A['sand' + edge((q) => q !== T.GRASS && q !== T.TALL && q !== T.TREE && q !== T.FLOWER && q !== T.PINE)] };
      case T.WATER: return { anim: this.N.cells['water' + mask((q) => q === T.WATER || q === T.BRIDGE)] };
      case T.BRIDGE: return { anim: this.N.cells.water15, bridge: A.bridge };
      case T.FLOWER: return { anim: this.N.cells['flower' + Math.floor(v * 3)] };
      case T.LEDGE: return { c: A.ledge }; case T.LEDGE_E: return { c: A.ledgeE }; case T.LEDGE_W: return { c: A.ledgeW };
      case T.CAVE: case T.CAVEWALL: return { c: A['cave' + (v < 0.5 ? 0 : 1)] };
      case T.CAVEDOOR: return { c: A.cavestairs };
      case T.ASH: return { c: A['ash' + (v < 0.5 ? 0 : 1)] };
      case T.SNOW: return { c: A['snow' + (v < 0.5 ? 0 : 1)] };
      case T.STAIRS: return { c: A.stairs };
      case T.MAT: return { c: A.mat };
      case T.FLOOR: case T.WALL: return { c: A['floor_' + m.floor] || A.floor_wood };
      default: return { c: A[grassKey] };
    }
  }

  buildChunk(ci, cj) {
    const m = this.map, A = this.A.cells, S = this.S.rects;
    const G = new Geo(), N = new Geo(), P = new Geo(), Wl = new Geo(), Sh = new Geo();
    const glows = [];
    const x0 = ci * CH, y0 = cj * CH;
    const wallH = 2 * Math.tan(EL), caveH = 1.25 * Math.tan(EL);
    for (let y = y0; y < Math.min(m.h, y0 + CH); y++) for (let x = x0; x < Math.min(m.w, x0 + CH); x++) {
      const t = m.get(x, y), g = this.groundCell(x, y), v = hash(x + 7, y + 3);
      if (g.c) flat(G, x, y, x + 1, y + 1, 0, g.c);
      if (g.anim) flat(N, x, y, x + 1, y + 1, 0, g.anim);
      if (g.bridge) flat(G, x - 0.02, y, x + 1.02, y + 1, 0.012, g.bridge);
      const zone = m.outdoor ? m.zoneAt(x, y) : null, theme = zone?.theme;
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
          const r = S[key], cx = x + 0.5 + (v - 0.5) * 0.2, cz = y + 0.7;
          billboard(P, cx, cz, SW(r), SH(r), r, 0, vb > 0.5, 1);
          flat(Sh, cx - 0.75, cz - 0.3, cx + 0.75, cz + 0.3, 0.015, [S.shadow.u0, S.shadow.v0, S.shadow.u1, S.shadow.v1]);
        }
      } else if (t === T.TALL || t === T.DARKTALL) {
        // herbe haute en tapis : la même case partout, jamais retournée, pour que les cases voisines se raccordent
        const r = S[t === T.DARKTALL ? 'darktuft' : theme === 'snow' && S.snowtuft ? 'snowtuft' : 'tuft'];
        billboard(P, x + 0.5, y + 0.93, SW(r), SH(r), r, 0, false);
      } else if (t === T.FENCE) { const r = S.fence; billboard(P, x + 0.5, y + 0.55, SW(r), SH(r), r); }
      else if (t === T.ROCK) { const r = S.rock; billboard(P, x + 0.5, y + 0.6, SW(r), SH(r), r); flat(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85, 0.015, [S.shadow.u0, S.shadow.v0, S.shadow.u1, S.shadow.v1]); }
      else if (t === T.BUSH) { const r = S.bush; billboard(P, x + 0.5, y + 0.6, SW(r), SH(r), r); }
      else if (t === T.CUT) { const r = S.cuttree; billboard(P, x + 0.5, y + 0.62, SW(r), SH(r), r); flat(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85, 0.015, [S.shadow.u0, S.shadow.v0, S.shadow.u1, S.shadow.v1]); }
      else if (t === T.SMASH) { const r = S.crackrock; billboard(P, x + 0.5, y + 0.62, SW(r), SH(r), r); flat(Sh, x + 0.05, y + 0.4, x + 0.95, y + 0.85, 0.015, [S.shadow.u0, S.shadow.v0, S.shadow.u1, S.shadow.v1]); }
      else if (t === T.WALL) {
        // mur du fond en volume ; murs latéraux et bas réduits à une bordure sombre, comme sur DS
        if (y <= 1) { const south = m.get(x, y + 1) !== T.WALL; box(Wl, x, y, x + 1, y + 1, wallH, A[m.wallStyle] || A.wall_in, A.walltop, A.walltop, { south, east: false, west: false }); }
        else flat(Wl, x, y, x + 1, y + 1, 0.01, A.walltop);
      } else if (t === T.CAVEWALL) {
        const south = m.get(x, y + 1) !== T.CAVEWALL, east = m.get(x + 1, y) !== T.CAVEWALL, west = m.get(x - 1, y) !== T.CAVEWALL;
        if (south || east || west || m.get(x, y - 1) !== T.CAVEWALL) box(Wl, x, y, x + 1, y + 1, caveH, A.cavewall, A.cavetop, A.cavewall, { south, east, west });
        else flat(Wl, x, y, x + 1, y + 1, caveH, A.cavetop);
      }
      // décor posé (lampadaires, panneaux, meubles…)
      const d = this.decoAt.get(x + ',' + y);
      if (d) {
        if (d.k === 'counter') {
          box(Wl, x, y + 0.1, x + 1, y + 1, 0.75 * Math.tan(EL), A[d.front] || A.counterfront, A.counter, A.counter, { east: m.get(x + 1, y) !== T.BLOCK, west: m.get(x - 1, y) !== T.BLOCK });
          // capsule posée sur le comptoir (starters du labo)
          if (d.ball && S.itemball) { const r = S.itemball; billboard(P, x + 0.5, y + 0.55, SW(r), SH(r), r, 0.75 * Math.tan(EL) - 0.05); }
        }
        else if (d.k === 'shelf') box(Wl, x + 0.05, y + 0.2, x + 0.95, y + 0.95, 1.5 * Math.tan(EL), A.shelf, A.roof_flat, A.shelf);
        else if (d.k === 'carpet' || d.k === 'exitlight') { /* sol */ }
        else if (S[d.k]) {
          const r = S[d.k];
          // meubles de deux cases (le second est bloqué par l'intérieur) : centrés entre les deux ; les autres sur leur case
          billboard(P, x + (WIDE_DECO.has(d.k) ? 1 : 0.5), y + 0.6, SW(r), SH(r), r);
          if (d.k === 'lamp') glows.push([x + 0.5, y + 0.62, SH(r) * 0.82]);
          if (['statue', 'gymstatue', 'plant', 'lamp', 'mailbox', 'sign', 'pot', 'caverock', 'stalag', 'fridge', 'clock', 'books', 'pc', 'labmachine', 'vase', 'trash'].includes(d.k)) flat(Sh, x + 0.1, y + 0.4, x + 0.9, y + 0.85, 0.015, [S.shadow.u0, S.shadow.v0, S.shadow.u1, S.shadow.v1]);
        }
      }
    }
    const grp = new THREE.Group();
    const add = (geo, mat, order = 0) => { const g = geo.build(); if (g) { const me = new THREE.Mesh(g, mat); me.renderOrder = order; me.frustumCulled = false; grp.add(me); } };
    add(G, this.mat.ground); add(N, this.mat.anim); add(Sh, this.mat.shadow, 1); add(P, this.mat.sprite); add(Wl, this.mat.walls);
    for (const [gx, gz, gy] of glows) {
      const me = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.matGlow); me.position.set(gx, gy, gz + 0.05); me.rotation.x = -0.3; me.userData.lampGlow = true; this.glows.add(me);
    }
    this.root.add(grp);
    return grp;
  }

  /** une case a changé (arbre coupé, rocher brisé) : le morceau de carte qui la contient est reconstruit */
  rebuildAt(x, y) {
    const k = Math.floor(x / CH) + ',' + Math.floor(y / CH), g = this.chunks.get(k);
    if (g) { this.root.remove(g); g.traverse((o) => o.geometry?.dispose()); this.chunks.delete(k); }
    this.lastChunk = null;
  }
  ensureChunks(px, py) {
    const ci = Math.floor(px / CH), cj = Math.floor(py / CH), k = ci + ',' + cj;
    if (k === this.lastChunk) return; this.lastChunk = k;
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      if (i < 0 || j < 0 || i * CH >= this.map.w || j * CH >= this.map.h) continue;
      const kk = i + ',' + j; if (!this.chunks.has(kk)) this.chunks.set(kk, this.buildChunk(i, j));
    }
    // les morceaux éloignés sont masqués
    for (const [kk, g] of this.chunks) { const [i, j] = kk.split(',').map(Number); g.visible = Math.abs(i - ci) <= 2 && Math.abs(j - cj) <= 2; }
  }

  /* ---------------- bâtiments ---------------- */
  buildBuildings() {
    this.buildingMeshes = [];
    const cache = new Map();
    const T3 = (key, mk) => { if (!cache.has(key)) cache.set(key, tex(mk())); return cache.get(key); };
    for (const b of this.map.buildings) {
      const g = new THREE.Group();
      const wallH = b.h * Math.tan(EL), o = 0.18;
      const zf = b.y + b.d + 0.02;
      const own = (t) => { const m = frontDepth(new THREE.MeshBasicMaterial({ map: t, vertexColors: true }), zf); this.tinted.push(m); m.userData.ownTint = true; return m; };
      if (b.kind === 'cave') {
        // monticule rocheux avec une ouverture sombre
        const geo = new Geo(), A = this.A.cells;
        const h = 1.6 * Math.tan(EL);
        box(geo, b.x, b.y, b.x + b.w, b.y + b.d, h, A.cliffplain, A.cliff, A.cliffplain);
        const cm = frontDepth(new THREE.MeshBasicMaterial({ map: this.texA, vertexColors: true }), zf); this.tinted.push(cm); cm.color.copy(this.tint);
        const mesh = new THREE.Mesh(geo.build(), cm); g.add(mesh);
        const holeW = 1.6, holeH = 1.15 * Math.tan(EL);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(holeW, holeH), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
        hole.position.set(b.doorX + 0.5, holeH / 2, b.y + b.d + 0.01); g.add(hole);
        this.root.add(g); this.buildingMeshes.push(g); continue;
      }
      const fkey = `${b.style}:${b.w}:${b.h}:${b.door}`;
      const fr = T3('f' + fkey, () => facade(b.style, b.w, b.h, b.door, false, b.x * 7 + b.y));
      const sd = T3(`s${b.style}:${b.d}:${b.h}`, () => sideWall(b.style, b.d, b.h));
      const rf = T3(`r${b.style}:${b.roof}:${b.w}:${b.d}`, () => roofTex(b.roof, b.w + 1, b.d + 1, 3, b.style));
      const mFront = own(fr), mSide = own(sd), mRoof = own(rf);
      const x0 = b.x, x1 = b.x + b.w, z0 = b.y, z1 = b.y + b.d;
      // façade
      const geoF = new Geo(); geoF.quad([x0, 0, z1], [x1, 0, z1], [x1, wallH, z1], [x0, wallH, z1], 0, 0, 1, 1, 1);
      g.add(new THREE.Mesh(geoF.build(), mFront));
      const geoS = new Geo();
      geoS.quad([x1, 0, z1], [x1, 0, z0], [x1, wallH, z0], [x1, wallH, z1], 0, 0, 1, 1, 0.8);
      geoS.quad([x0, 0, z0], [x0, 0, z1], [x0, wallH, z1], [x0, wallH, z0], 0, 0, 1, 1, 0.8);
      g.add(new THREE.Mesh(geoS.build(), mSide));
      // toit à deux pans
      const flatRoof = b.style === 'center' || b.style === 'mart' || b.style === 'gym' || b.style === 'league';
      const rh = flatRoof ? 0.35 : Math.min(0.9, 0.22 * b.d + 0.2);
      const zm = (z0 + z1) / 2, ytop = wallH + rh;
      const geoR = new Geo();
      geoR.quad([x0 - o, wallH - 0.05, z1 + o], [x1 + o, wallH - 0.05, z1 + o], [x1 + o, ytop, zm], [x0 - o, ytop, zm], 0, 0.5, 1, 1, 1);
      geoR.quad([x1 + o, wallH - 0.05, z0 - o], [x0 - o, wallH - 0.05, z0 - o], [x0 - o, ytop, zm], [x1 + o, ytop, zm], 0, 0, 1, 0.5, 0.7);
      g.add(new THREE.Mesh(geoR.build(), mRoof));
      // pignons
      const rc = roofColors[b.roof] || roofColors.red;
      const gableMat = frontDepth(new THREE.MeshBasicMaterial({ color: new THREE.Color(rc[1]) }), zf); this.tinted.push(gableMat); gableMat.userData.ownTint = true; gableMat.userData.base = new THREE.Color(rc[1]);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute([x1 + o, wallH - 0.05, z1 + o, x1 + o, wallH - 0.05, z0 - o, x1 + o, ytop, zm, x0 - o, wallH - 0.05, z0 - o, x0 - o, wallH - 0.05, z1 + o, x0 - o, ytop, zm], 3));
      g.add(new THREE.Mesh(gg, gableMat));
      // liseré sous le toit
      const eave = new THREE.Mesh(new THREE.BoxGeometry(b.w + 2 * o, 0.12, 0.12), gableMat); eave.position.set((x0 + x1) / 2, wallH - 0.06, z1 + o); g.add(eave);
      // ombre portée au sol devant le bâtiment
      const sh = new Geo(); const S = this.S.rects.shadow;
      flat(sh, x0 - 0.1, z1 - 0.2, x1 + 0.1, z1 + 0.45, 0.012, [S.u0, S.v0 + (S.v1 - S.v0) * 0.4, S.u1, S.v1]);
      g.add(new THREE.Mesh(sh.build(), this.mat.shadow));
      g.userData.b = b; g.userData.front = mFront; g.userData.fkey = fkey;
      this.root.add(g); this.buildingMeshes.push(g);
    }
  }
  buildWindowsGroup() {
    // à la nuit tombée, fenêtres et portes s'allument (façades de nuit non teintées)
    this.nightGroup = new THREE.Group(); this.root.add(this.nightGroup);
    const cache = new Map();
    for (const g of this.buildingMeshes) {
      const b = g.userData.b; if (!b) continue;
      const key = g.userData.fkey;
      if (!cache.has(key)) {
        const day = facade(b.style, b.w, b.h, b.door, false, b.x * 7 + b.y), night = facade(b.style, b.w, b.h, b.door, true, b.x * 7 + b.y);
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
      this.nightGroup.add(new THREE.Mesh(geo.build(), cache.get(key)));
    }
    this.nightGroup.visible = false;
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
      const S = this.S.rects.shadow;
      const sg = new THREE.PlaneGeometry(0.85, 0.42); sg.rotateX(-Math.PI / 2);
      const uv = sg.attributes.uv; for (let i = 0; i < 4; i++) uv.setXY(i, i % 2 ? S.u1 : S.u0, i < 2 ? S.v0 : S.v1);
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
    const H = this.charRows * CHH;
    const u0 = col * CW / (12 * CW), u1 = (col + 1) * CW / (12 * CW), v0 = row * CHH / H, v1 = (row + 1) * CHH / H;
    const uv = a.mesh.geometry.attributes.uv; uv.setXY(0, u0, v0); uv.setXY(1, u1, v0); uv.setXY(2, u0, v1); uv.setXY(3, u1, v1); uv.needsUpdate = true;
  }
  place(a, x, y, hop = 0, inGrass = false) {
    a.mesh.position.set(x + 0.5, hop, y + 0.55);
    a.shadow.position.set(x + 0.5, 0.02, y + 0.6);
    a.shadow.visible = !inGrass;
  }
  /** les herbes hautes s'agitent quand on y entre */
  rustle(x, y) {
    const id = 'rustle:' + x + ',' + y + ':' + performance.now();
    const a = this.actor(id, { kind: 'item' }); { const r = this.S.rects.tuft1; this.setSpriteRect(a, r, r.w, r.h); }
    a.shadow.visible = false; a.mesh.position.set(x + 0.5, 0, y + 0.96);
    const t0 = performance.now();
    const step = () => {
      const u = (performance.now() - t0) / 320;
      if (u >= 1 || !this.actors.has(id)) { this.removeActor(id); return; }
      a.mesh.scale.set(1.05 + Math.sin(u * 18) * 0.06, 1 + Math.sin(u * Math.PI) * 0.18, 1);
      requestAnimationFrame(step);
    };
    step();
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
    const S = this.S.rects.shadow, sg = new THREE.PlaneGeometry(1.6, 0.7); sg.rotateX(-Math.PI / 2);
    const uv = sg.attributes.uv; for (let i = 0; i < 4; i++) uv.setXY(i, i % 2 ? S.u1 : S.u0, i < 2 ? S.v0 : S.v1);
    const shadow = new THREE.Mesh(sg, this.mat.shadow); shadow.renderOrder = 1;
    a = { mesh, shadow, kind: 'image', dispose: () => { geo.dispose(); sg.dispose(); t.dispose(); mat.dispose(); this.tinted = this.tinted.filter((m) => m !== mat); this.root?.remove(mesh); this.root?.remove(shadow); } };
    this.root.add(mesh); this.root.add(shadow); this.actors.set(id, a);
    return a;
  }
  removeActor(id) { const a = this.actors.get(id); if (a) { a.dispose(); this.actors.delete(id); } }

  /* ---------------- heure du jour ---------------- */
  setTimeOfDay(h) {
    // matin doré, journée neutre, soirée orangée, nuit bleutée
    const keys = [[0, [0.38, 0.44, 0.72]], [4.5, [0.42, 0.46, 0.72]], [6.5, [1.0, 0.86, 0.78]], [9.5, [1, 1, 1]], [17, [1, 1, 1]], [18.5, [1.0, 0.8, 0.66]], [20, [0.55, 0.52, 0.78]], [21.5, [0.38, 0.44, 0.72]], [24, [0.38, 0.44, 0.72]]];
    let c = keys[0][1];
    for (let i = 1; i < keys.length; i++) if (h <= keys[i][0]) { const [a, ca] = keys[i - 1], [b, cb] = keys[i]; const u = (h - a) / (b - a); c = ca.map((v, k) => v + (cb[k] - v) * u); break; }
    this.night = h >= 20 || h < 5.5 ? 1 : h >= 18.5 ? (h - 18.5) / 1.5 : h < 6.5 ? 1 - (h - 5.5) : 0;
    this.applyTint(c);
  }
  applyTint(c) {
    const indoorOrCave = !this.map?.outdoor;
    const k = indoorOrCave ? (this.map?.floor === 'cave' ? [0.82, 0.8, 0.86] : [1, 1, 1]) : c;
    this.tint.setRGB(k[0], k[1], k[2]);
    for (const m of this.tinted) { const base = m.userData.base; if (base) m.color.copy(base).multiply(this.tint); else m.color.copy(this.tint); }
    if (this.nightGroup) this.nightGroup.visible = !indoorOrCave && this.night > 0.5;
    if (this.glows) this.glows.visible = !indoorOrCave && this.night > 0.5;
  }

  /* ---------------- image ---------------- */
  update(dt, fx, fy) {
    this.ensureChunks(fx, fy);
    this.animT += dt;
    if (this.animT > 0.28) {
      this.animT = 0; this.animFrame = (this.animFrame + 1) % this.N.frames.length;
      const ctx = this.N.canvas.getContext('2d'); ctx.clearRect(0, 0, this.N.canvas.width, this.N.canvas.height); ctx.drawImage(this.N.frames[this.animFrame], 0, 0); this.texN.needsUpdate = true;
    }
    this.focus.set(fx + 0.5, 0, fy + 0.5);
    const d = this.dist;
    this.camera.position.set(this.focus.x, d * Math.sin(EL), this.focus.z + d * Math.cos(EL));
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.85; if (this.shake < 0.01) this.shake = 0; }
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
