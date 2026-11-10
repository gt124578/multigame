// Fief Maudit : la scène 3D. Ciel et nuages de Birdie Party, sommets au loin, terrain peint (herbe, terre des chemins,
// berges, roche des pentes), rivière, village (village.js), arbres de Birdie Party en instances (on peut les abattre :
// l'arbre bascule dans le sens du coup, laisse une souche), forêt dense au-delà de la vallée, rochers et buissons de
// Kenney, feu de camp, bûches au sol, personnages (actors.js) et caméra à l'épaule.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';
import { buildSky, buildPeaks, SKIES } from '../../golf/view/sky.js';
import { noiseTexture } from '../../golf/view/terrain.js';
import { createTreeKit, LEAF_TINTS, PINE_TINTS, SWAY } from '../../golf/view/trees.js';
import { grassTexture } from '../../golf/view/textures.js';
import { WATER, R_PLAY } from '../engine/map.js';
import { loadKit, buildVillage } from './village.js';
import { createActors } from './actors.js';
import { createNight } from './night.js';
import { createCrypt3D, createAbilityFx, CEIL } from './crypt.js';
import { createChests } from './chests.js';

const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;
const SUN_DIR = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpA = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
const NATURE = '../royale/models/nature/';

export function createScene(stage, { onLost } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost && onLost(); });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2400);
  const noise = noiseTexture();
  const look = { ...SKIES.campagne, horizon: 0xd8e2e6, fog: 0xb6c6cc, peaks: 'alpes', peak: 0x5f6f80, peakTop: 0xe8eef6 };
  scene.fog = new THREE.Fog(look.fog, 70, 330);

  const hemi = new THREE.HemisphereLight(0xc8d8ec, 0x3b4a24, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8c8, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const sky = buildSky(look, SUN_DIR, noise); scene.add(sky);
  let env = null;
  {
    const pmrem = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(buildSky(look, SUN_DIR, noise));
    env = pmrem.fromScene(es, 0.02).texture; scene.environment = env; pmrem.dispose();
    scene.environmentIntensity = 0.45;
  }

  let night = null, peaksMesh = null, kitRef = null, villageGroup = null, villageKey = '', berryMesh = null, berryKey = '';
  let map = null, treeKit = null, trees = null, actors = null, logsGroup = null, fire = null, falling = [], stumps = null;
  const logMeshes = new Map(), beamMeshes = new Map();
  let crypt3d = null, fx = null, chests3d = null, villageLights = [], wasInside = false, farForest = null;
  // qualité : finesse de l'image, ombres, forêt lointaine, nappes de brume
  let quality = 'moyen';
  try { quality = localStorage.getItem('fief_q') || (MOBILE ? 'bas' : 'moyen'); } catch (e) {}
  function setQuality(q) {
    if (!['bas', 'moyen', 'haut'].includes(q)) q = 'moyen';
    quality = q; try { localStorage.setItem('fief_q', q); } catch (e) {}
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, { bas: 1, moyen: MOBILE ? 1.25 : 1.5, haut: 2 }[q]));
    const size = q === 'haut' ? 4096 : MOBILE ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    sun.castShadow = q !== 'bas' && !wasInside;
    if (farForest) farForest.visible = q !== 'bas';
    if (night) night.layers(q === 'bas' ? 1 : q === 'moyen' ? 2 : 3);
    resize();
  }
  let viewT = 0;
  const SEE = { uSeeThru: { value: 0 }, uSeeAt: { value: new THREE.Vector3() } };
  const scr = new THREE.Vector3(), dbuf = new THREE.Vector2();
  const cam = { yaw: 0, pitch: 0.28, dist: 6.2, tx: 0, ty: 0, tz: 0, ready: false };
  const loader = new GLTFLoader();
  const glb = (u) => loader.loadAsync(u).catch((e) => { console.warn('modèle manquant', u, e); return null; });

  // ------------------------------------------------------------------ terrain
  function buildTerrain(M) {
    const R = 240, step = MOBILE ? 3 : 2, n = Math.round(R * 2 / step) + 1;
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, n - 1, n - 1).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const C = (s) => new THREE.Color(s);
    const grassA = C('#738f46'), grassB = C('#55723a'), grassDry = C('#8f8c58'), dirt = C('#8d6e4a'), dirtDark = C('#6f5539'), mud = C('#5e5140'), rock = C('#7d786d'), forest = C('#3f5a26');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = M.heightAt(x, z);
      pos.setY(i, h);
      const e = 1.2, sx = M.heightAt(x + e, z) - M.heightAt(x - e, z), sz = M.heightAt(x, z + e) - M.heightAt(x, z - e), slope = Math.hypot(sx, sz) / (2 * e);
      const nz = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.5 + 0.5;
      c.copy(grassA).lerp(grassB, nz * 0.7).lerp(grassDry, clamp((Math.sin(x * 0.031 + z * 0.023) - 0.4), 0, 1) * 0.6);
      const r = Math.hypot(x, z);
      if (r > R_PLAY - 6) c.lerp(forest, clamp((r - R_PLAY + 6) / 30, 0, 0.75));
      const pd = M.pathDist(x, z), plaza = Math.hypot(x, z - 1);
      const path = Math.max(clamp((2.6 - pd) / 1.4, 0, 1), clamp((8.5 - plaza) / 3, 0, 1));
      if (path > 0) c.lerp(pd < 1.2 || plaza < 6 ? dirt : dirtDark, path * 0.92);
      const rd = Math.abs(z - M.riverZ(x));
      if (rd < 11) c.lerp(mud, clamp((11 - rd) / 5, 0, 1) * 0.85);
      if (slope > 0.55) c.lerp(rock, clamp((slope - 0.55) * 2.2, 0, 0.9));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const tex = grassTexture(512); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(R / 3, R / 3);
    tex.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, metalness: 0 });
    // la texture d'herbe (grise, centrée sur 0,5) module la couleur sans l'assombrir
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n diffuseColor.rgb *= 0.55 + sampledDiffuseColor.r * 0.9;\n#endif'); };
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
    return mesh;
  }
  function buildRiver(M) {
    const pts = [], W = 13;
    for (let x = -250; x <= 250; x += 4) pts.push(x);
    const pos = [], uv = [], idx = [];
    pts.forEach((x, i) => { const z = M.riverZ(x); pos.push(x, WATER, z - W, x, WATER, z + W); uv.push(x / 20, 0, x / 20, 1); if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e5560, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.86, envMapIntensity: 1.1 });
    const U = { uT: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = U.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform float uT;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float w1 = sin(vW.x * 0.9 + uT * 1.7 + sin(vW.z * 0.7)) * 0.5 + sin(vW.x * 2.3 - vW.z * 1.9 + uT * 2.9) * 0.25;
          float w2 = cos(vW.z * 1.1 - uT * 1.3 + sin(vW.x * 0.5)) * 0.5 + cos(vW.z * 2.7 + vW.x * 1.3 - uT * 3.3) * 0.25;
          normal = normalize(normal + (viewMatrix * vec4(w1 * 0.07, 0.0, w2 * 0.07, 0.0)).xyz);`);
    };
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 2;
    mesh.userData.U = U;
    return mesh;
  }

  // ------------------------------------------------------------------ arbres : instances par essence, avec une table pour en cacher un
  function plantTrees(kit, list, { lo = false, shadows = true, dark = false } = {}) {
    const G = kit.geos, Mt = kit.mats, group = new THREE.Group(), slots = new Map();
    const kinds = lo
      ? [['roundLo', 'leaf', ['round', 'oak'], LEAF_TINTS], ['pineLo', 'pine', ['pine'], PINE_TINTS], ['trunkPine', 'bark', ['pine'], null], ['trunkRound', 'bark', ['round', 'oak'], null]]
      : [['round', 'leaf', ['round'], LEAF_TINTS], ['oak', 'leaf2', ['oak'], LEAF_TINTS], ['pine', 'pine', ['pine'], PINE_TINTS, 0], ['pineB', 'pine', ['pine'], PINE_TINTS, 1],
        ['trunkRound', 'bark', ['round'], null], ['trunkOak', 'bark', ['oak'], null], ['trunkPine', 'bark', ['pine'], null]];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (const [geo, mat, ks, tints, parity] of kinds) {
      const items = list.filter((t) => ks.includes(t.kind) && (parity === undefined || (t.v & 1) === parity));
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(G[geo], Mt[mat], items.length);
      items.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y - 0.15, t.z); s.setScalar(t.s); m.compose(p, q, s); im.setMatrixAt(i, m);
        if (tints) { c.setHex(tints[t.v % tints.length]); if (dark) c.multiplyScalar(0.5); im.setColorAt(i, c); }
        if (t.id !== undefined) { if (!slots.has(t.id)) slots.set(t.id, []); slots.get(t.id).push([im, i]); }
      });
      im.castShadow = shadows; im.receiveShadow = true; im.computeBoundingSphere();
      group.add(im);
    }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    return { group, hide(id) { for (const [im, i] of slots.get(id) || []) { im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; } } };
  }
  // un arbre seul (celui qui tombe)
  function treeMesh(kit, t) {
    const G = kit.geos, Mt = kit.mats, g = new THREE.Group();
    const [fo, mat, tr, tints] = t.kind === 'pine' ? [t.v & 1 ? 'pineB' : 'pine', 'pine', 'trunkPine', PINE_TINTS] : t.kind === 'oak' ? ['oak', 'leaf2', 'trunkOak', LEAF_TINTS] : ['round', 'leaf', 'trunkRound', LEAF_TINTS];
    // le feuillage de Birdie Party se balance d'après la position de l'instance : l'arbre qui tombe est une instance seule
    const one = (geo, m, tint) => { const im = new THREE.InstancedMesh(geo, m, 1); im.setMatrixAt(0, new THREE.Matrix4()); if (tint !== undefined) im.setColorAt(0, new THREE.Color(tint)); im.castShadow = true; im.frustumCulled = false; return im; };
    g.add(one(G[fo], Mt[mat], tints[t.v % tints.length]), one(G[tr], Mt.bark));
    g.scale.setScalar(t.s); g.rotation.y = t.rot;
    const pivot = new THREE.Group(); pivot.position.set(t.x, t.y - 0.15, t.z); pivot.add(g);
    pivot.userData.dispose = () => {};
    return pivot;
  }

  // ------------------------------------------------------------------ bûches au sol
  const barkTex = (() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#5a4030'; g.fillRect(0, 0, 64, 128); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${30 + Math.random() * 40},${20 + Math.random() * 25},${12 + Math.random() * 15},0.7)`; g.fillRect(Math.random() * 64, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 30); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const logGeo = new THREE.CylinderGeometry(0.17, 0.19, 1.7, 12, 1).rotateZ(Math.PI / 2);
  const logMats = [new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xc89f6a, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xc89f6a, roughness: 0.8 })];
  // poutre équarrie : 3,4 m de long, faces sciées claires aux bouts
  const beamGeo = new THREE.BoxGeometry(0.3, 0.3, 3.4);
  const beamMats = [logMats[0], logMats[0], logMats[0], logMats[0], logMats[1], logMats[1]];
  function makeLog() { const m = new THREE.Mesh(logGeo, logMats); m.castShadow = true; m.receiveShadow = true; return m; }

  // ------------------------------------------------------------------ feu de camp
  function buildFire(M, campfireGlb) {
    const g = new THREE.Group(), c = M.campfire, y = M.heightAt(c.x, c.z);
    g.position.set(c.x, y, c.z);
    if (campfireGlb) { const s = campfireGlb.scene.clone(); s.scale.setScalar(1.6); s.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(s); }
    // pierres autour
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.9 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.04, 0), stone); st.position.set(Math.sin(a) * 0.95, 0.08, Math.cos(a) * 0.95); st.rotation.set(i, i * 2, 0); st.castShadow = true; g.add(st); }
    const light = new THREE.PointLight(0xff9a4a, 9, 14, 1.6); light.position.y = 1.0; g.add(light);
    // flammes : quelques langues additives qui ondulent
    const flameTex = (() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 92, 2, 32, 80, 60); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(62, 80, 32, 124); x.quadraticCurveTo(2, 80, 32, 4); x.fill(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const fmat = new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const flames = [];
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(fmat); s.position.set((i - 2) * 0.12, 0.55, ((i * 7) % 3 - 1) * 0.1); s.scale.set(0.55, 1.1, 1); g.add(s); flames.push(s); }
    return { group: g, update(t, dark = 0) { light.intensity = (8 + Math.sin(t * 13) * 1.2 + Math.sin(t * 7.3) * 1.4) * (1 + dark * 0.8); light.distance = 14 + dark * 6; flames.forEach((f, i) => { const k = 0.85 + 0.25 * Math.sin(t * (9 + i) + i * 2); f.scale.set(0.5 * k, 1.15 * k, 1); f.position.y = 0.5 + 0.08 * k; }); } };
  }

  // ------------------------------------------------------------------ chargement
  async function load(M, { onProgress } = {}) {
    map = M;
    // hauteur des bâtiments pour la caméra (toit compris)
    for (const b of M.boxes) { const B = [...M.buildings, ...M.castle].find((o) => o.id === b.id); b.top = b.id === 'crypte' || b.id === 'herse' ? 99 : M.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) + (B && B.state === 'debout' ? 8.5 : 3.4 * (B && B.tall || 1)); }
    const step = (k) => onProgress && onProgress(k);
    scene.add(buildTerrain(M)); step(0.1);
    const river = buildRiver(M); scene.add(river); fire = { river };
    const peaks = buildPeaks(look, 3, { x: 0, z: 0 }, noise); if (peaks) scene.add(peaks); peaksMesh = peaks;
    treeKit = createTreeKit();
    // le feuillage entre la caméra et le joueur devient ajouré (tramé), pour ne jamais perdre son personnage dans un sapin
    for (const k of ['leaf', 'leaf2', 'pine', 'bark']) {
      const m = treeKit.mats[k], base = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        if (base) base(sh, r);
        Object.assign(sh.uniforms, SEE);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCamD;').replace('#include <project_vertex>', '#include <project_vertex>\nvCamD = -mvPosition.z;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCamD; uniform float uSeeThru; uniform vec3 uSeeAt;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            if (vCamD < uSeeThru) {
              // seulement autour du personnage à l'écran (uSeeAt : x, y en pixels, rayon)
              float near = 1.0 - smoothstep(uSeeAt.z * 0.6, uSeeAt.z, distance(gl_FragCoord.xy, uSeeAt.xy));
              float k = clamp((uSeeThru - vCamD) / 1.2, 0.0, 0.93) * near;
              float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
              if (d < k) discard;
            }`);
      };
      m.customProgramCacheKey = () => 'fief-see-' + k;
      m.needsUpdate = true;
    }
    // arbres à abattre, posés un peu dans le sol
    const items = M.trees.map((t) => ({ ...t, y: Math.min(t.y, M.heightAt(t.x + 0.6, t.z), M.heightAt(t.x - 0.6, t.z), M.heightAt(t.x, t.z + 0.6), M.heightAt(t.x, t.z - 0.6)) }));
    trees = plantTrees(treeKit, items); scene.add(trees.group); step(0.25);
    // forêt dense hors de la vallée
    const far = [], rr = (s) => { s = Math.sin(s * 127.1) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; far.length < (MOBILE ? 900 : 2200) && i < 20000; i++) {
      const a = rr(i + 0.3) * Math.PI * 2, d = R_PLAY + 2 + rr(i + 0.7) * 125, x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.abs(z - M.riverZ(x)) < 12) continue;
      far.push({ x, z, y: M.heightAt(x, z), kind: rr(i + 0.11) < 0.7 ? 'pine' : 'round', s: 0.9 + rr(i + 0.5) * 0.6, rot: rr(i) * 6.28, v: Math.floor(rr(i + 0.9) * 8) });
    }
    farForest = plantTrees(treeKit, far, { lo: true, shadows: false, dark: true }).group; scene.add(farForest); step(0.35);
    // village et château
    kitRef = await loadKit('models/village.glb'); step(0.6);
    villageGroup = buildVillage(kitRef, M); scene.add(villageGroup);
    // décor de Kenney : rochers, souches, tas de bûches, feu de camp, buissons
    const names = { rockA: 'rock_largeA', rockC: 'rock_largeC', rockE: 'rock_largeE', rockS: 'rock_smallA', rockS2: 'rock_smallC', stump: 'stump_round', logstack: 'log_stackLarge' };
    const models = {};
    await Promise.all([...Object.entries(names), ['campfire', 'campfire_logs'], ['bush', 'plant_bushDetailed'], ['bushL', 'plant_bushLarge']].map(async ([k, f]) => { models[k] = await glb(NATURE + f + '.glb'); }));
    step(0.75);
    // les couleurs vives du kit de Kenney, ramenées à la palette de la vallée
    const RECOLOR = { dirt: ['#8c877c', true], grass: ['#5c7d34', true], woodBark: ['#6a4a30'], woodInner: ['#d6b688'], wood: ['#8a5a36'], woodDark: ['#5a3a22'] };
    const recol = new Map();
    const matFor = (m) => { const n = (m.name || '').replace(/\.\d+$/, ''), r = RECOLOR[n]; if (!r) return m; if (!recol.has(n)) recol.set(n, new THREE.MeshStandardMaterial({ color: r[0], roughness: 0.92, flatShading: !!r[1] })); return recol.get(n); };
    for (const g of Object.values(models)) if (g) g.scene.traverse((m) => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(matFor) : matFor(m.material); });
    const prop = (k, x, y, z, rot, s) => { const g = models[k]; if (!g) return; const o = g.scene.clone(); o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(s * (k.startsWith('rock') ? 2.2 : k === 'stump' ? 2.6 : k === 'logstack' ? 1.9 : 1)); o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(o); return o; };
    for (const p of M.props) if (names[p.kind]) prop(p.kind, p.x, p.y - 0.05, p.z, p.rot, p.s);
    for (let i = 0; i < 90; i++) {
      const a = rr(i + 9.1) * Math.PI * 2, d = 24 + rr(i + 3.3) * 85, x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (M.pathDist(x, z) < 3 || Math.abs(z - M.riverZ(x)) < 8 || M.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
      prop(rr(i) < 0.6 ? 'bush' : 'bushL', x, M.heightAt(x, z) - 0.05, z, rr(i + 1) * 6.28, 1.4 + rr(i + 2) * 1.2);
    }
    // buissons de baies : un buisson de Kenney et des grappes rouges (cachées une fois cueillies)
    for (const b of M.bushes) prop('bush', b.x, b.y - 0.05, b.z, b.rot, 1.7 * b.s);
    {
      const geo = new THREE.SphereGeometry(0.07, 6, 5), mat = new THREE.MeshStandardMaterial({ color: 0xc8243a, roughness: 0.35, emissive: 0x3a0008 });
      const per = 9; berryMesh = new THREE.InstancedMesh(geo, mat, M.bushes.length * per); berryMesh.userData = { per, pos: [] };
      const m4 = new THREE.Matrix4(), rr2 = (k) => { const v = Math.sin(k * 91.7) * 43758.5; return v - Math.floor(v); };
      M.bushes.forEach((b, i) => { for (let k = 0; k < per; k++) { const a = rr2(i * 13 + k) * 6.28, r = 0.35 + rr2(i * 7 + k * 3) * 0.3, y = 0.35 + rr2(i + k * 11) * 0.45; const p = [b.x + Math.cos(a) * r * b.s, b.y + y * b.s, b.z + Math.sin(a) * r * b.s]; berryMesh.userData.pos.push(p); m4.makeTranslation(...p); berryMesh.setMatrixAt(i * per + k, m4); } });
      scene.add(berryMesh);
    }
    // souches qui remplacent les arbres abattus
    stumps = { model: models.stump, list: [] };
    const f = buildFire(M, models.campfire); scene.add(f.group); fire.update = f.update;
    logsGroup = new THREE.Group(); scene.add(logsGroup);
    night = createNight({ scene, renderer, sky, sun, hemi, map: M, noise, peaks: peaksMesh });
    actors = await createActors(scene, { makeLog }); step(0.95);
    // la crypte et les effets des capacités ; les lumières du village s'éteignent quand on est sous terre (et inversement)
    scene.traverse((o) => { if (o.isPointLight) villageLights.push(o); });
    crypt3d = createCrypt3D({ scene, kit: kitRef, map: M, noise });
    fx = createAbilityFx(scene, M);
    chests3d = createChests(scene, M);
    setQuality(quality);
    const s = M.spawn; cam.yaw = s.yaw + Math.PI; cam.tx = s.x; cam.tz = s.z; cam.ty = M.heightAt(s.x, s.z) + 1.6;
  }

  // ------------------------------------------------------------------ chaque image
  const tmpV = new THREE.Vector3();
  function treeFell(sim, id, dir, quiet = false) {
    trees.hide(id);
    const t = map.trees[id];
    if (quiet) { addStump(t); return; }
    const piv = treeMesh(treeKit, { ...t, y: t.y });
    piv.userData = { ...piv.userData, t0: viewT, dir, axis: new THREE.Vector3(Math.cos(dir), 0, -Math.sin(dir)) };
    scene.add(piv); falling.push(piv);
    addStump(t);
  }
  function addStump(t) { if (stumps.model) { const o = stumps.model.scene.clone(); o.position.set(t.x, t.y - 0.1, t.z); o.scale.setScalar(2.3 * t.s); o.rotation.y = t.rot; o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(o); } }
  // un arbre déjà abattu au chargement (partie reprise) : juste la souche
  function syncTrees(sim) { sim.trees.forEach((T, i) => { if (T.down && !T.shown) { T.shown = true; treeFell(sim, i, T.dir); } }); }

  function update(view, dt, t) {
    const { sim, me, camYaw, camPitch, zoom } = view;
    SWAY.uT.value = t;
    if (fire) { fire.river.userData.U.uT.value = t; fire.update && fire.update(t, sim.darkness); }
    if (night) night.update(sim, t);
    // sous terre : ni ciel ni soleil, une lumière d'ambiance froide, un brouillard noir
    const inside = !!(map && map.crypt.inside(cam.tx, cam.tz));
    if (inside !== wasInside) {
      wasInside = inside; for (const l of villageLights) l.visible = !inside; sky.visible = !inside; sun.castShadow = !inside && quality !== 'bas';
      if (!inside && night) night.force();
    }
    if (inside) {
      sun.intensity = 0; hemi.color.setHex(0x7a6c96); hemi.groundColor.setHex(0x2a1e16); hemi.intensity = 0.55;
      scene.fog.color.setHex(0x07080c); scene.fog.near = 5; scene.fog.far = 36; renderer.toneMappingExposure = 1.15; scene.environmentIntensity = 0.04;
      if (peaksMesh) peaksMesh.visible = false;
    }
    if (crypt3d) crypt3d.update(sim, t, camera, inside);
    if (fx) fx.update(sim, dt, t);
    if (chests3d) chests3d.update(sim, dt, t);
    // arbres qui tombent : bascule accélérée, petit rebond, puis s'enfoncent et disparaissent
    viewT = t;
    const now = t;
    falling = falling.filter((p) => {
      const u = now - p.userData.t0;
      const fall = Math.min(1, (u / 1.5) ** 2.2);
      let ang = fall * (Math.PI / 2 - 0.06);
      if (u > 1.5) ang = Math.PI / 2 - 0.06 + Math.sin(Math.min(1, (u - 1.5) / 0.35) * Math.PI) * 0.05;
      p.quaternion.setFromAxisAngle(p.userData.axis, ang);
      if (u > 3.4) p.position.y -= dt * 0.9;
      if (u > 5.5) { scene.remove(p); p.userData.dispose(); return false; }
      return true;
    });
    // bûches au sol
    const seen = new Set();
    for (const l of sim.logs) {
      if (!l.ready) continue;
      seen.add(l.id);
      let m = logMeshes.get(l.id);
      if (!m) { m = makeLog(); m.position.set(l.x, l.y + 0.17, l.z); m.rotation.y = l.rot + Math.PI / 2; logsGroup.add(m); logMeshes.set(l.id, m); m.userData.born = now; }
      const k = Math.min(1, (now - m.userData.born) / 0.25); m.scale.setScalar(0.6 + 0.4 * k);
    }
    for (const [id, m] of logMeshes) if (!seen.has(id)) { logsGroup.remove(m); logMeshes.delete(id); }
    // poutres : au sol, ou portées à hauteur d'épaule entre leurs porteurs
    const bseen = new Set();
    for (const b of sim.beams || []) {
      if (!b.ready) continue;
      bseen.add(b.id);
      let m = beamMeshes.get(b.id);
      if (!m) { m = new THREE.Mesh(beamGeo, beamMats); m.castShadow = true; m.receiveShadow = true; logsGroup.add(m); beamMeshes.set(b.id, m); m.position.set(b.x, b.y + 0.16, b.z); }
      const ty = b.lifted ? b.y : map.heightAt(b.x, b.z) + 0.16, k = 1 - Math.exp(-dt * 18);
      m.position.x += (b.x - m.position.x) * k; m.position.z += (b.z - m.position.z) * k; m.position.y += (ty - m.position.y) * k;
      let dr = b.rot - m.rotation.y; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
      m.rotation.y += dr * k;
    }
    for (const [id, m] of beamMeshes) if (!bseen.has(id)) { logsGroup.remove(m); beamMeshes.delete(id); }
    actors.update(sim, dt, me, t);
    // le village change quand un chantier s'ouvre ou qu'un bâtiment est relevé
    const vk = Object.entries(sim.build || {}).map(([k, v]) => k + v.state).join();
    if (vk !== villageKey && kitRef) { villageKey = vk; if (villageGroup) scene.remove(villageGroup); villageGroup = buildVillage(kitRef, map, sim.build); scene.add(villageGroup); }
    // les baies cueillies disparaissent du buisson
    const bk = (sim.berries || []).map((b) => (b.ready ? 1 : 0)).join('');
    if (bk !== berryKey && berryMesh) {
      berryKey = bk; const m4 = new THREE.Matrix4(), per = berryMesh.userData.per;
      sim.berries.forEach((b, i) => { for (let k = 0; k < per; k++) { const p = berryMesh.userData.pos[i * per + k]; if (b.ready) m4.makeTranslation(...p); else m4.makeScale(0, 0, 0); berryMesh.setMatrixAt(i * per + k, m4); } });
      berryMesh.instanceMatrix.needsUpdate = true;
    }

    // caméra à l'épaule : derrière le joueur, orientée par la souris
    const p = sim.player(me);
    if (p) {
      const k = 1 - Math.exp(-dt * 12);
      cam.tx += (p.x - cam.tx) * k; cam.tz += (p.z - cam.tz) * k; cam.ty += (p.y + 1.55 - cam.ty) * (1 - Math.exp(-dt * 8));
    }
    cam.dist += (zoom - cam.dist) * (1 - Math.exp(-dt * 8));
    const cp = Math.cos(camPitch), sx = Math.sin(camYaw) * cp, sz = Math.cos(camYaw) * cp;
    // un peu à droite de l'épaule
    const side = 0.55, rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let cx = cam.tx + sx * cam.dist + rx * side, cz = cam.tz + sz * cam.dist + rz * side, cy = cam.ty + Math.sin(camPitch) * cam.dist;
    // la caméra s'arrête avant d'entrer dans un bâtiment ou dans la colline
    {
      const ox = cam.tx + rx * side, oz = cam.tz + rz * side, oy = cam.ty;
      let f = 1;
      for (let i = 1; i <= 24; i++) {
        const u = i / 24, x = ox + (cx - ox) * u, z = oz + (cz - oz) * u, y = oy + (cy - oy) * u;
        if (y < map.heightAt(x, z) + 0.35 || map.boxes.some((b) => !b.open && x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3 && y < b.top)) { f = Math.max(0.12, (i - 1) / 24); break; }
      }
      cam.pull = Math.min(f, (cam.pull ?? 1) + dt * 1.5);
      cx = ox + (cx - ox) * cam.pull; cz = oz + (cz - oz) * cam.pull; cy = oy + (cy - oy) * cam.pull;
    }
    cy = Math.max(cy, map.heightAt(cx, cz) + 0.6);
    if (inside) cy = Math.min(cy, map.crypt.y + CEIL - 0.35);
    camera.position.set(cx, cy, cz);
    camera.updateMatrixWorld();
    SEE.uSeeThru.value = Math.max(0, Math.hypot(cx - cam.tx, cy - cam.ty, cz - cam.tz) - 1.1);
    // position du personnage à l'écran (en pixels du tampon de rendu), rayon de la trouée
    renderer.getDrawingBufferSize(dbuf);
    scr.set(cam.tx, cam.ty - 0.4, cam.tz).project(camera);
    SEE.uSeeAt.value.set((scr.x * 0.5 + 0.5) * dbuf.x, (scr.y * 0.5 + 0.5) * dbuf.y, dbuf.y * 0.32);
    camera.lookAt(cam.tx + rx * side, cam.ty, cam.tz + rz * side);
    // l'ombre suit le joueur
    tmpV.set(cam.tx, cam.ty, cam.tz);
    sun.position.copy(tmpV).addScaledVector(night ? night.sunDir : SUN_DIR, 120); sun.target.position.copy(tmpV);
    sky.position.copy(camera.position);
    if (sky.userData.update) sky.userData.update(t, null);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  return { get quality() { return quality; }, setQuality, get falling() { return falling; }, cam, renderer, scene, camera, load, update, treeFell, syncTrees, actorsEvent: (e) => actors && actors.event && actors.event(e), fxEvent: (e, sim) => { if (fx) fx.event(e, sim); if (chests3d) chests3d.event(e); }, get actors() { return actors; } };
}
