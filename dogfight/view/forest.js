// Les forêts de Dogfight 3D : les arbres de Birdie Party (feuillus, sapins, palmiers), semés là où la vue satellite
// montre de la forêt (voir archipel.js), teints de la couleur du sol sous eux. Des centaines de milliers d'arbres, rangés
// par carrés de 500 m : tout près de la caméra, les arbres détaillés ; plus loin, leur version légère, qui rapetisse
// jusqu'à se fondre dans la canopée de la vue satellite. L'ombre des montagnes assombrit aussi le feuillage.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { heightAt, lakeAt, runwayLocal, PLATFORM } from '../engine/archipel.js';
import { SWAY, LEAF_TINTS, PINE_TINTS } from '../../golf/view/trees.js';

const TILE = 500;
const RINGS = { hi: 700, mid: 1500 };             // portée des arbres détaillés, puis légers (m)
const FADE = 0.7;                                  // les légers rapetissent à partir de 70 % de leur portée
const TREE_K = 2;                                  // feuillage éclairé ≈ sol de la vue satellite éclairé
const REBUILD = 120;                               // on replante quand la caméra a bougé de tant (m)
const ROUND = 0, OAK = 1, PINE_A = 2, PINE_B = 3, PALM_A = 4, PALM_B = 5;
const ISLAND = 1600;

const h32 = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 144665) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// Les arbres de la carte : neuf candidats par case de 25 m en forêt dense (quatre pour les buissons) ; triés par carré.
// `tint(x, z)` : la teinte du sol sous l'arbre (la vue satellite), qui nuance son feuillage ;
// `places` (osm.js) : pas d'arbres sur les routes ni dans les maisons, et ceux des jardins ;
// `B` : les buissons épars du maquis et des landes, là où la vue satellite verdit sans être de la forêt
function sow(A, D, T, tint, places, B) {
  const n = A.n, st = A.step, W = A.runway, pal = T.palm || [0, 0], size = T.size || [0.9, 1.4];
  const out = [], dens = (M, u, v) => {
    const i = Math.min(n - 2, Math.max(0, Math.floor(u))), j = Math.min(n - 2, Math.max(0, Math.floor(v))), fu = u - i, fv = v - j, k = j * n + i;
    return (M[k] * (1 - fu) * (1 - fv) + M[k + 1] * fu * (1 - fv) + M[k + n] * (1 - fu) * fv + M[k + n + 1] * fu * fv) / 255;
  };
  function plant(x, z, I, J, dv, bush = false) {
    if (x > -40 && x < ISLAND + 40 && z > -40 && z < ISLAND + 40) return;
    const y = heightAt(A, x, z);
    if (y < 1.5 || lakeAt(A, x, z)) return;
    const r = runwayLocal(W, x, z);
    if (Math.abs(r.a) < W.len / 2 + PLATFORM.end + 60 && r.b > -PLATFORM.side - 60 && r.b < PLATFORM.apron + 60) return;
    const k1 = h32(I, J, 4), k2 = h32(I, J, 5);
    let kind;
    if (!bush && y < pal[0] && k1 < pal[1] * (1 - 0.6 * y / pal[0])) kind = k2 < 0.5 ? PALM_A : PALM_B;
    else if (y > T.pine || (!bush && k1 > 1 - (T.pineShare ?? 0.3))) kind = k2 < 0.5 ? PINE_A : PINE_B;
    else kind = k2 < 0.55 ? ROUND : OAK;
    const tc = tint ? tint(x, z) : null;
    // en forêt dense, des arbres plus grands : les cimes se touchent
    out.push(x, y, z, (size[0] + (size[1] - size[0]) * h32(I, J, 6)) * (bush ? 0.32 + 0.2 * h32(I, J, 10) : 0.8 + 0.6 * dv), h32(I, J, 7) * 6.283, kind, Math.floor(h32(I, J, 8) * 8), h32(I, J, 9),
      tc ? tc[0] : 1, tc ? tc[1] : 1, tc ? tc[2] : 1);
  }
  const scatter = (M, bush) => {
    const o = bush ? 100003 : 0, sub = bush ? 2 : 3, cell = st / sub;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (M[j * n + i] < 4 && M[Math.min(n * n - 1, j * n + i + 1)] < 4 && M[Math.min(n * n - 1, (j + 1) * n + i)] < 4) continue;
      for (let b = 0; b < sub; b++) for (let a = 0; a < sub; a++) {
        const I = i * sub + a + o, J = j * sub + b, x = A.x0 + (i - 0.5) * st + (a + 0.1 + 0.8 * h32(I, J, 2)) * cell, z = A.z0 + (j - 0.5) * st + (b + 0.1 + 0.8 * h32(I, J, 3)) * cell;
        const dv = dens(M, (x - A.x0) / st, (z - A.z0) / st);
        if (h32(I, J, 1) > dv * 0.78 || (places && places.blocked(x, z))) continue;
        plant(x, z, I, J, dv, bush);
      }
    }
  };
  scatter(D, false);
  if (B) scatter(B, true);
  if (places) for (let e = 0; e < places.extra.length; e += 2) plant(places.extra[e], places.extra[e + 1], e, 7777, 0.4);
  // rangement par carré (tri par comptage)
  const R = 11, TN = Math.ceil(A.size / TILE), count = out.length / R, tileOf = new Int32Array(count), start = new Int32Array(TN * TN + 1);
  for (let t = 0; t < count; t++) {
    const ti = Math.min(TN - 1, Math.max(0, Math.floor((out[t * R] - A.x0) / TILE))), tj = Math.min(TN - 1, Math.max(0, Math.floor((out[t * R + 2] - A.z0) / TILE)));
    tileOf[t] = tj * TN + ti; start[tileOf[t] + 1]++;
  }
  for (let k = 0; k < TN * TN; k++) start[k + 1] += start[k];
  const fill = start.slice(0, TN * TN), P = new Float32Array(count * 5), meta = new Uint8Array(count * 3), tc = new Uint8Array(count * 3), tileY = new Float32Array(TN * TN);
  for (let t = 0; t < count; t++) {
    const d = fill[tileOf[t]]++;
    for (let c = 0; c < 5; c++) P[d * 5 + c] = out[t * R + c];
    meta[d * 3] = out[t * R + 5]; meta[d * 3 + 1] = out[t * R + 6]; meta[d * 3 + 2] = Math.floor(out[t * R + 7] * 255);
    for (let c = 0; c < 3; c++) tc[d * 3 + c] = Math.round(out[t * R + 8 + c] * 100);
    tileY[tileOf[t]] += out[t * R + 1];
  }
  for (let k = 0; k < TN * TN; k++) if (start[k + 1] > start[k]) tileY[k] /= start[k + 1] - start[k];
  return { TN, start, P, meta, tc, tileY, count };
}

// Les feuilles peintes en canevas sont noires là où elles sont transparentes : réduites (mipmaps) pour les arbres
// lointains, elles virent au noir. On remplit ces trous de la couleur moyenne des feuilles, sans toucher la transparence.
function bleed(map) {
  const c = map.image, w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < w * h; k++) if (src[k * 4 + 3] > 160) { r += src[k * 4]; g += src[k * 4 + 1]; b += src[k * 4 + 2]; n++; }
  r /= n || 1; g /= n || 1; b /= n || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4, a = src[i + 3], f = a > 160 ? 1 : a / 160;
    out[o] = src[i] * f + r * (1 - f); out[o + 1] = src[i + 1] * f + g * (1 - f); out[o + 2] = src[i + 2] * f + b * (1 - f); out[o + 3] = a;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = map.colorSpace; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = map.anisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// Le feuillage de Birdie Party, assombri là où la montagne cache le soleil
function shadedFoliage(base, shade, area) {
  const m = base.clone();
  m.map = bleed(base.map);
  m.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    sh.uniforms.uShade = { value: shade }; sh.uniforms.uShadeA = { value: area };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uShade; uniform vec3 uShadeA; varying float vShadeF;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShadeF = texture2D(uShade, (vec2(instanceMatrix[3][0], instanceMatrix[3][2]) - uShadeA.xy) / uShadeA.z).r;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShadeF;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse *= vShadeF; reflectedLight.directSpecular *= vShadeF;');
  };
  m.customProgramCacheKey = () => 'dogfight-foliage-2';
  return m;
}

// `density` : la forêt de la carte, ou null en attendant (resow la plante plus tard)
export function plantForest(scene, A, look, density, kit, shade, area) {
  const T = look.trees, G = kit.geos, M = kit.mats;
  let S = sow(A, density || new Uint8Array(A.n * A.n), T);
  const mats = { leaf: shadedFoliage(M.leaf, shade, area), leaf2: shadedFoliage(M.leaf2, shade, area), pine: shadedFoliage(M.pine, shade, area), frond: shadedFoliage(M.frond, shade, area) };
  // la teinte du lieu, et un feuillage un peu plus sombre vu d'avion que sur un parcours de golf
  const tint = T.tint || [1, 1, 1], palette = (list) => list.map((h) => new THREE.Color(h).multiply(new THREE.Color(tint[0], tint[1], tint[2])).multiplyScalar(0.85));
  const LEAF = palette(LEAF_TINTS), PINE = palette(PINE_TINTS), ref = ['r', 'g', 'b'].map((c) => LEAF.reduce((a, col) => a + col[c], 0) / LEAF.length);
  // les maillages : [géométrie, matériau, essences, teintes (feuillage) ou null (tronc)]
  const slots = { hi: [], mid: [] }, byKind = { hi: [[], [], [], [], [], []], mid: [[], [], [], [], [], []] };
  const group = new THREE.Group();
  const slot = (ring, geo, mat, kinds, tints) => {
    const s = { geo, mat, tints, im: null, cap: 0, n: 0 };
    slots[ring].push(s); for (const k of kinds) byKind[ring][k].push(s);
  };
  slot('hi', G.round, mats.leaf, [ROUND], LEAF); slot('hi', G.oak, mats.leaf2, [OAK], LEAF);
  slot('hi', G.pine, mats.pine, [PINE_A], PINE); slot('hi', G.pineB, mats.pine, [PINE_B], PINE);
  slot('hi', G.palmA, mats.frond, [PALM_A], LEAF); slot('hi', G.palmB, mats.frond, [PALM_B], LEAF);
  slot('hi', G.trunkRound, M.bark, [ROUND], null); slot('hi', G.trunkOak, M.bark, [OAK], null); slot('hi', G.trunkPine, M.bark, [PINE_A, PINE_B], null);
  slot('hi', G.palmTrunkA, M.palmBark, [PALM_A], null); slot('hi', G.palmTrunkB, M.palmBark, [PALM_B], null);
  for (const ring of ['mid']) {
    slot(ring, G.roundLo, mats.leaf, [ROUND, OAK], LEAF); slot(ring, G.pineLo, mats.pine, [PINE_A, PINE_B], PINE);
    slot(ring, G.palmA, mats.frond, [PALM_A, PALM_B], LEAF); slot(ring, G.palmTrunkA, M.palmBark, [PALM_A, PALM_B], null);
  }
  const all = [...slots.hi, ...slots.mid];
  const ensure = (s) => {
    if (s.n <= s.cap) return;
    if (s.im) { group.remove(s.im); s.im.dispose(); }
    s.cap = Math.ceil(s.n * 1.4 + 64);
    s.im = new THREE.InstancedMesh(s.geo, s.mat, s.cap);
    s.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (s.tints) { s.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(s.cap * 3), 3); s.im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    s.im.frustumCulled = false; s.im.count = 0;
    group.add(s.im);
  };
  let { TN, start, P, meta, tc, tileY } = S;
  const last = new THREE.Vector3(1e9, 0, 0);
  let reach = 1;

  // Quels arbres dans quel anneau : un passage pour compter, un pour écrire
  function ringOf(tile, cam) {
    const ti = tile % TN, tj = (tile - ti) / TN, cx = A.x0 + (ti + 0.5) * TILE, cz = A.z0 + (tj + 0.5) * TILE;
    const dx = Math.max(0, Math.abs(cam.x - cx) - TILE / 2), dz = Math.max(0, Math.abs(cam.z - cz) - TILE / 2), d = Math.hypot(dx, cam.y - tileY[tile], dz);
    return d < RINGS.hi * reach ? 'hi' : d < RINGS.mid * reach ? 'mid' : null;
  }
  function replant(cam) {
    last.copy(cam);
    for (const s of all) s.n = 0;
    const span = Math.ceil((RINGS.mid * reach + TILE) / TILE), ci = Math.floor((cam.x - A.x0) / TILE), cj = Math.floor((cam.z - A.z0) / TILE), tiles = [];
    for (let tj = Math.max(0, cj - span); tj <= Math.min(TN - 1, cj + span); tj++) for (let ti = Math.max(0, ci - span); ti <= Math.min(TN - 1, ci + span); ti++) {
      const tile = tj * TN + ti, ring = start[tile + 1] > start[tile] ? ringOf(tile, cam) : null;
      if (ring) tiles.push(tile, ring);
    }
    const walk = (write) => {
      const end = RINGS.mid * reach, f0 = end * FADE;
      for (let q = 0; q < tiles.length; q += 2) {
        const ring = tiles[q + 1], table = byKind[ring];
        for (let t = start[tiles[q]]; t < start[tiles[q] + 1]; t++) {
          let fade = 1;
          if (ring === 'mid') {
            const d = Math.hypot(P[t * 5] - cam.x, P[t * 5 + 1] - cam.y, P[t * 5 + 2] - cam.z);
            if (d > end) continue;
            if (d > f0) fade = 1 - (d - f0) / (end - f0);
          }
          const list = table[meta[t * 3]];
          for (const s of list) {
            if (write) {
              const o = s.n * 16, e = s.im.instanceMatrix.array, sc = P[t * 5 + 3] * fade, c = Math.cos(P[t * 5 + 4]) * sc, sn = Math.sin(P[t * 5 + 4]) * sc;
              e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = sc; e[o + 6] = 0; e[o + 7] = 0;
              e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = P[t * 5]; e[o + 13] = P[t * 5 + 1] - 0.15; e[o + 14] = P[t * 5 + 2]; e[o + 15] = 1;
              if (s.tints) {
                const col = s.tints[meta[t * 3 + 1] % s.tints.length], ca = s.im.instanceColor.array;
                ca[s.n * 3] = col.r * tc[t * 3] / 100; ca[s.n * 3 + 1] = col.g * tc[t * 3 + 1] / 100; ca[s.n * 3 + 2] = col.b * tc[t * 3 + 2] / 100;
              }
            }
            s.n++;
          }
        }
      }
    };
    walk(false);
    for (const s of all) ensure(s);
    for (const s of all) s.n = 0;
    walk(true);
    for (const s of all) {
      if (!s.im) continue;
      s.im.count = s.n;
      s.im.instanceMatrix.clearUpdateRanges(); s.im.instanceMatrix.addUpdateRange(0, s.n * 16); s.im.instanceMatrix.needsUpdate = true;
      if (s.tints) { s.im.instanceColor.clearUpdateRanges(); s.im.instanceColor.addUpdateRange(0, s.n * 3); s.im.instanceColor.needsUpdate = true; }
    }
  }

  scene.add(group);
  return {
    group, get count() { return S.count; },
    // replanter toute la forêt (quand la vue satellite arrive, puis les lieux)
    // `tint(x, z)` : la couleur du sol rendu sous l'arbre ; le feuillage la reprend, à sa propre nuance près
    resow(density, tint, places, shrubs) {
      const k = tint && ((x, z) => tint(x, z).map((v, c) => Math.max(0.25, Math.min(2.5, v * TREE_K / ref[c]))));
      S = sow(A, density, T, k, places, shrubs); ({ TN, start, P, meta, tc, tileY } = S); last.set(1e9, 0, 0);
    },
    // qualité : la portée des anneaux (1 normal, 0.5 bas)
    setDensity(f) { const r = 0.4 + 0.6 * f; if (r !== reach) { reach = r; last.set(1e9, 0, 0); } },
    update(cam, t) {
      SWAY.uT.value = t;
      if (Math.hypot(cam.x - last.x, cam.y - last.y, cam.z - last.z) > REBUILD * reach) replant(cam);
    },
    stats() { const o = {}; for (const ring of ['hi', 'mid']) o[ring] = slots[ring].reduce((a, s) => a + s.n, 0); return o; },
    dispose() { scene.remove(group); for (const s of all) if (s.im) s.im.dispose(); for (const m of Object.values(mats)) { m.map.dispose(); m.dispose(); } },
  };
}
