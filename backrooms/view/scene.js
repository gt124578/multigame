// The Backrooms - Scène 3D Three.js : Level 0 (moquette, sur deux étages), Level 1 (entrepôt), ascenseurs, joueurs et entité
// L'éclairage des néons est « cuit » dans une petite texture par étage (une valeur par case) lue en coordonnées monde par
// tous les matériaux : des centaines de néons pour le prix d'aucune lumière. Seuls la lampe torche, les cassettes et
// les ascenseurs sont de vraies lumières. Les étages sont empilés (le second FLOOR_DY plus bas) : on voit l'étage du
// dessous par les trous et les cages d'escalier. L'image finale passe par le filtre de vieille caméra (vhs.js).
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';
import { CELL_SIZE, WALL_HEIGHT, T, PIT_HALF, NICHE_Y, FLOOR_DY } from '../engine/map.js';
import { FUSES } from '../engine/sim.js';
import { createBackroomsTextures } from './textures.js';
import { createVhsFilter } from './vhs.js';

const MODELS = new URL('../models/', import.meta.url).href; // modèles Poly Haven (CC0), voir models/LICENSE.txt
export const ENTITY_IMG = new URL('../img/entite.png?v=2', import.meta.url).href; // ?v : image plus nette, ne pas garder l'ancienne en cache
// L'entité du Level 1 : une vidéo détourée, découpée en planche d'images (12 par seconde, 16 par rangée) jouée en boucle
export const ENTITY_ANIM = { url: new URL('../monster/david.webp?v=2', import.meta.url).href, frames: 119, cols: 16, rows: 8, fps: 12, aspect: 246 / 400 };

const LIGHT_R = 2.6; // portée d'un néon, en cases
const AMBIENT = 0.006; // lumière minimale dans les zones mortes (presque le noir complet)
const RB = 4; // finesse de l'éclairage cuit : texels par case (des flaques de lumière rondes, des ombres nettes au coin des murs)
const AO_R = 0.8; // portée de l'ombre de contact au pied des murs, en mètres
const SLAB = FLOOR_DY - WALL_HEIGHT; // épaisseur de la dalle entre deux étages

// floors : les étages du niveau (une carte chacun)
export function createBackroomsScene(container, floors) {
  if (!Array.isArray(floors)) floors = [floors];
  const map0 = floors[0];
  const L1 = map0.level === 1;
  const CEIL = map0.ceil || WALL_HEIGHT;
  const scene = new THREE.Scene();
  // Level 1 : un froid bleuté, un brouillard plus épais
  scene.background = new THREE.Color(L1 ? '#06080a' : '#0d0b06');
  scene.fog = new THREE.FogExp2(L1 ? '#0b0e11' : '#14110a', L1 ? 0.058 : 0.05);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  camera.position.set(map0.spawn.x, 1.6, map0.spawn.z);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);
  const vhs = createVhsFilter(renderer);
  vhs.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

  const textures = createBackroomsTextures(map0.level || 0);
  const ambient = new THREE.AmbientLight(L1 ? '#c9d8ff' : '#fff3c4', 0.05);
  scene.add(ambient);
  const dummy = new THREE.Object3D();
  const loader = new GLTFLoader();

  // masque de transparence d'un plan couché (sol ou plafond) : des trous carrés. 16 texels par case (16 cm : de quoi
  // garder les arêtes de 50 cm entre les trous). flip : la ligne 0 du masque est au bord z max (sol) ou z 0 (plafond)
  const holeMask = (W, H, holes, flip) => {
    const R = 16;
    const mw = W * R;
    const mh = H * R;
    const mask = new Uint8Array(mw * mh * 4).fill(255);
    const tx = (v) => Math.round((v / CELL_SIZE) * R);
    for (const h of holes) {
      const x0 = tx(h.x - h.half);
      const x1 = tx(h.x + h.half);
      for (let zi = tx(h.z - h.half); zi < tx(h.z + h.half); zi++) {
        const row = flip ? mh - 1 - zi : zi;
        mask.fill(0, (row * mw + x0) * 4, (row * mw + x1) * 4);
      }
    }
    const t = new THREE.DataTexture(mask, mw, mh, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  // les trous d'un étage (ceux du sol, par où l'on tombe) et ses cages d'escalier
  const holesOf = (m) => [...(m.pits || []).map((p) => ({ x: p.x, z: p.z, half: PIT_HALF })), ...(m.stairs || []).map((st) => ({ x: st.x, z: st.z, half: CELL_SIZE / 2 - 0.05 }))];

  // Un étage entier : sol, plafond, murs, néons, meubles, cassettes, objets, ascenseur… dans un groupe à sa hauteur
  function buildFloor(map, fi) {
    const group = new THREE.Group();
    group.position.y = -fi * FLOOR_DY;
    scene.add(group);
    const W = map.W;
    const H = map.H;

    // --- Éclairage cuit des néons ---
    // RB texels par case. Rouge : la lumière des néons, arrêtée par les murs (un rayon par texel) ; vert : l'ombre de
    // contact au pied des murs. Un néon qui grésille garde sa propre empreinte, ajoutée selon son éclat du moment.
    const BW = W * RB;
    const BH = H * RB;
    const TX = CELL_SIZE / RB;
    const isWall = (x, z) => x < 0 || z < 0 || x >= W || z >= H || map.grid[z * W + x] === T.WALL;
    const base = new Float32Array(BW * BH);
    const live = new Float32Array(BW * BH);
    const bakeData = new Uint8Array(BW * BH * 4);
    const bakeTex = new THREE.DataTexture(bakeData, BW, BH, THREE.RGBAFormat);
    bakeTex.magFilter = THREE.LinearFilter;
    bakeTex.minFilter = THREE.LinearFilter;
    const bakeUniforms = {
      uBake: { value: bakeTex },
      uBakeScale: { value: new THREE.Vector2(1 / (W * CELL_SIZE), 1 / (H * CELL_SIZE)) },
      uBakeTint: { value: L1 ? new THREE.Color(0.86, 0.98, 1.12) : new THREE.Color(1.12, 1.04, 0.8) },
      uBakeY: { value: -fi * FLOOR_DY },
      uCeil: { value: CEIL },
      uDamp: { value: L1 ? 0.6 : 1 },
    };
    const LR = LIGHT_R * CELL_SIZE;
    // un texel est-il éclairé par ce néon ? Le rayon ne doit traverser aucun mur, sauf, pour un texel de mur,
    // les 70 premiers centimètres de son propre mur (la face tournée vers le néon)
    const seen = (lx, lz, px, pz) => {
      const gx = Math.floor(px / CELL_SIZE);
      const gz = Math.floor(pz / CELL_SIZE);
      const own = isWall(gx, gz);
      const d = Math.hypot(px - lx, pz - lz);
      const n = Math.ceil(d / 0.2);
      let inOwn = 0;
      for (let i = 1; i < n; i++) {
        const x = lx + ((px - lx) * i) / n;
        const z = lz + ((pz - lz) * i) / n;
        const cx = Math.floor(x / CELL_SIZE);
        const cz = Math.floor(z / CELL_SIZE);
        if (!isWall(cx, cz)) continue;
        if (!own || cx !== gx || cz !== gz) return false;
        inOwn += d / n;
      }
      return inOwn < 0.7;
    };
    const footprint = (l) => {
      const out = [];
      const r = Math.ceil(LR / TX);
      const tx0 = Math.floor(l.x / TX);
      const tz0 = Math.floor(l.z / TX);
      for (let tz = tz0 - r; tz <= tz0 + r; tz++) {
        for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
          if (tx < 0 || tz < 0 || tx >= BW || tz >= BH) continue;
          const px = (tx + 0.5) * TX;
          const pz = (tz + 0.5) * TX;
          const d = Math.hypot(px - l.x, pz - l.z);
          if (d > LR || !seen(l.x, l.z, px, pz)) continue;
          out.push(tz * BW + tx, Math.pow(1 - d / LR, 1.4) * 0.55);
        }
      }
      return out;
    };
    const addPrint = (arr, fp, k) => {
      for (let i = 0; i < fp.length; i += 2) arr[fp[i]] += fp[i + 1] * k;
    };
    for (const l of map.lights) if (l.state === 'on') addPrint(base, footprint(l), 1);
    const flickers = map.lights.filter((l) => l.state === 'flicker').map((l) => ({ l, k: 1, fp: footprint(l) }));
    // ombre de contact : plus sombre à moins de AO_R d'un mur
    for (let tz = 0; tz < BH; tz++) {
      for (let tx = 0; tx < BW; tx++) {
        const px = (tx + 0.5) * TX;
        const pz = (tz + 0.5) * TX;
        const gx = Math.floor(px / CELL_SIZE);
        const gz = Math.floor(pz / CELL_SIZE);
        let d = AO_R;
        if (!isWall(gx, gz)) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!(dx || dz) || !isWall(gx + dx, gz + dz)) continue;
              const x0 = (gx + dx) * CELL_SIZE;
              const z0 = (gz + dz) * CELL_SIZE;
              const ex = Math.max(x0 - px, 0, px - (x0 + CELL_SIZE));
              const ez = Math.max(z0 - pz, 0, pz - (z0 + CELL_SIZE));
              d = Math.min(d, Math.hypot(ex, ez));
            }
          }
        }
        const t = d / AO_R;
        bakeData[(tz * BW + tx) * 4 + 1] = Math.round((0.42 + 0.58 * t * t * (3 - 2 * t)) * 255);
      }
    }
    // power : 1 néons allumés, 0 coupure de courant (seule reste une lueur à peine visible)
    let power = 1;
    const writeBake = () => {
      live.set(base);
      for (const f of flickers) if (f.k > 0) addPrint(live, f.fp, f.k);
      for (let i = 0; i < BW * BH; i++) {
        const v = Math.min(1, AMBIENT * (power ? 1 : 0.25) + live[i] * 0.3 * power); // stocké à moitié : jusqu'à 2 de lumière
        bakeData[i * 4] = Math.round(v * 255);
      }
      bakeTex.needsUpdate = true;
    };
    writeBake();
    // lumière reçue en un point (pour l'exposition automatique du caméscope)
    const lightAt = (x, z) => {
      const tx = Math.floor(x / TX);
      const tz = Math.floor(z / TX);
      if (tx < 0 || tz < 0 || tx >= BW || tz >= BH) return 0;
      return power ? live[tz * BW + tx] : 0;
    };

    // ajoute la lumière cuite de cet étage à un matériau Lambert
    const baked = (mat) => {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, bakeUniforms);
        sh.vertexShader = 'varying vec3 vBakeP;\nvarying vec3 vBakeN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 bakeWP = vec4(transformed, 1.0);
          vec3 bakeN = objectNormal;
          #ifdef USE_INSTANCING
            bakeWP = instanceMatrix * bakeWP;
            bakeN = mat3(instanceMatrix) * bakeN;
          #endif
          vBakeP = (modelMatrix * bakeWP).xyz;
          vBakeN = normalize(mat3(modelMatrix) * bakeN);`);
        sh.fragmentShader = `uniform sampler2D uBake;
uniform vec2 uBakeScale;
uniform vec3 uBakeTint;
uniform float uBakeY;
uniform float uCeil;
uniform float uDamp;
varying vec3 vBakeP;
varying vec3 vBakeN;
float bkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bkNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bkHash(i), bkHash(i + vec2(1.0, 0.0)), f.x), mix(bkHash(i + vec2(0.0, 1.0)), bkHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float bkFbm(vec2 p) { return bkNoise(p) * 0.55 + bkNoise(p * 2.13 + 7.1) * 0.3 + bkNoise(p * 4.7 + 3.3) * 0.15; }
` +
          sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // les néons sont au plafond : un mur s'assombrit vers le bas, et plus encore au ras du sol et sous le plafond ;
          // le sol et le plafond s'assombrissent au pied des murs
          vec4 bk = texture2D(uBake, vBakeP.xz * uBakeScale);
          float by = vBakeP.y - uBakeY;
          float ny = vBakeN.y;
          float side = mix(0.5, 1.12, smoothstep(0.0, uCeil, by)) * mix(0.5, 1.0, smoothstep(0.0, 0.4, by)) * mix(0.72, 1.0, smoothstep(0.0, 0.3, uCeil - by));
          float flat2 = ny > 0.0 ? bk.g : mix(0.7, 1.0, bk.g) * 0.85;
          float shape = mix(side, flat2, smoothstep(0.5, 0.8, abs(ny)));
          // humidité : la moquette détrempée par plaques, l'eau qui remonte au pied des murs
          float wet = smoothstep(0.52, 0.72, bkFbm(vBakeP.xz * 0.17 + 11.0)) * uDamp;
          float rise = (1.0 - smoothstep(0.05, 0.45 + bkFbm(vBakeP.xz * 0.9 + vBakeP.y) * 0.5, by)) * smoothstep(0.3, 0.7, bkFbm(vBakeP.xz * 0.3 + 5.0)) * uDamp;
          // auréoles d'eau, au plafond (des dalles entières) et sur les murs : un cerne plus foncé autour d'une tache pâle
          float n2 = bkFbm(vec2(vBakeP.x + vBakeP.z * 0.37, vBakeP.y * (abs(ny) < 0.5 ? 1.0 : 0.0) + vBakeP.z) * 0.45 + 31.0);
          float ring = smoothstep(0.6, 0.66, n2) * (1.0 - smoothstep(0.68, 0.75, n2)) * 0.8 + smoothstep(0.66, 0.75, n2) * 0.3;
          float stain = ny < -0.5 ? ring : (abs(ny) < 0.5 ? ring * 0.6 : 0.0);
          diffuseColor.rgb *= mix(1.0, 0.62, ny > 0.5 ? wet : (abs(ny) < 0.5 ? rise : 0.0));
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.66, 0.45), stain * uDamp);
          totalEmissiveRadiance += diffuseColor.rgb * uBakeTint * bk.r * 2.0 * shape;`);
      };
      return mat;
    };

    // 1. Sol en moquette humide (une répétition de texture par case), percé des trous et des cages d'escalier
    const carpet = textures.carpet.clone();
    carpet.needsUpdate = true;
    carpet.repeat.set(W, H);
    textures.ready.then(() => {
      carpet.needsUpdate = true;
    });
    const floorMat = baked(new THREE.MeshLambertMaterial({ map: carpet }));
    const holes = holesOf(map);
    if (holes.length) {
      floorMat.alphaMap = holeMask(W, H, holes, true);
      floorMat.alphaTest = 0.5;
      // les bords des trous : l'épaisseur de la dalle
      const edgeMat = baked(new THREE.MeshLambertMaterial({ color: '#5e5434' }));
      const edges = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, SLAB), edgeMat, holes.length * 4);
      holes.forEach((h, i) => {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], k) => {
          dummy.position.set(h.x + dx * h.half, -SLAB / 2, h.z + dz * h.half);
          dummy.rotation.set(0, Math.atan2(-dx, -dz), 0); // la paroi regarde l'intérieur du trou
          dummy.scale.set(h.half * 2, 1, 1);
          dummy.updateMatrix();
          edges.setMatrixAt(i * 4 + k, dummy.matrix);
        });
      });
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      group.add(edges);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL_SIZE, H * CELL_SIZE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((W * CELL_SIZE) / 2, 0, (H * CELL_SIZE) / 2);
    group.add(floor);

    // 2. Faux plafond à dalles (percé là où l'étage du dessus a ses trous et ses escaliers)
    const ceilTex = textures.ceiling.clone();
    ceilTex.needsUpdate = true;
    ceilTex.repeat.set(W, H);
    textures.ready.then(() => {
      ceilTex.needsUpdate = true;
    });
    const ceilMat = baked(new THREE.MeshLambertMaterial({ map: ceilTex }));
    const above = fi > 0 ? floors[fi - 1] : null;
    if (above && holesOf(above).length) {
      ceilMat.alphaMap = holeMask(W, H, holesOf(above), false);
      ceilMat.alphaTest = 0.5;
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL_SIZE, H * CELL_SIZE), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((W * CELL_SIZE) / 2, CEIL, (H * CELL_SIZE) / 2);
    group.add(ceiling);

    // 3. Murs au papier peint jaune
    let wallCount = 0;
    for (let i = 0; i < W * H; i++) if (map.grid[i] === T.WALL) wallCount++;
    const wallMat = baked(new THREE.MeshLambertMaterial({ map: textures.wall }));
    const wallsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, CEIL, CELL_SIZE), wallMat, wallCount);
    let idx = 0;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (map.grid[z * W + x] !== T.WALL) continue;
        dummy.position.set((x + 0.5) * CELL_SIZE, CEIL / 2, (z + 0.5) * CELL_SIZE);
        dummy.updateMatrix();
        wallsMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    wallsMesh.instanceMatrix.needsUpdate = true;
    group.add(wallsMesh);

    // 4. Néons au plafond (les morts sont gris, ceux qui grésillent clignotent)
    const ON = new THREE.Color(L1 ? '#eef6ff' : '#fffbe2').multiplyScalar(3.2); // plus fort que le blanc : le caméscope sature et ils bavent
    const OFF = new THREE.Color('#4a473c');
    const fixtures = new THREE.InstancedMesh(L1 ? new THREE.BoxGeometry(1.6, 0.06, 0.18) : new THREE.BoxGeometry(1.22, 0.04, 0.62), new THREE.MeshBasicMaterial({ color: '#ffffff', map: L1 ? null : textures.lamp }), map.lights.length);
    map.lights.forEach((l, i) => {
      dummy.position.set(l.x, CEIL - (L1 ? 0.45 : 0.025), l.z); // au Level 1, les tubes pendent sous le plafond
      dummy.updateMatrix();
      fixtures.setMatrixAt(i, dummy.matrix);
      fixtures.setColorAt(i, l.state === 'off' ? OFF : ON);
      l.index = i;
    });
    fixtures.instanceMatrix.needsUpdate = true;
    group.add(fixtures);

    // 5. Objets abandonnés (modèles Poly Haven CC0), un InstancedMesh par morceau ; leur photo de couleur est gardée
    const propMats = new Map();
    const propMat = (src) => {
      const key = src.uuid;
      if (!propMats.has(key)) {
        const c = src.color ? src.color.clone().multiplyScalar(0.8) : new THREE.Color('#888');
        if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
        propMats.set(key, baked(new THREE.MeshLambertMaterial({ color: c, map: src.map || null, side: src.side })));
      }
      return propMats.get(key);
    };
    const kinds = new Map(map.props.map((p) => [p.m, { m: p.m, h: p.h }]));
    for (const kind of kinds.values()) {
      const list = map.props.filter((p) => p.m === kind.m);
      if (!list.length) continue;
      loader.load(MODELS + kind.m + '.glb', (g) => {
        const root = g.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const c = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(c);
        const k = kind.h / (size.y || 1);
        const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
        const place = list.map((p) => {
          const m = new THREE.Matrix4().makeTranslation(p.x, p.tipped ? (size.x * k) / 2 : 0, p.z).multiply(new THREE.Matrix4().makeRotationY(p.rot));
          if (p.tipped) m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
          return m.multiply(fix);
        });
        root.traverse((o) => {
          if (!o.isMesh) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          const inst = new THREE.InstancedMesh(o.geometry, propMat(src), list.length);
          place.forEach((m, i) => inst.setMatrixAt(i, m.clone().multiply(o.matrixWorld)));
          inst.instanceMatrix.needsUpdate = true;
          inst.frustumCulled = false;
          group.add(inst);
        });
      }, undefined, () => {});
    }

    // 5b. Ce qui est fixé aux murs et au plafond : prises électriques, détecteurs incendie, boîtiers électriques,
    // horloges arrêtées, grilles d'aération. Tirés d'une graine propre à l'étage (même décor chez tout le monde).
    let ds = 1234567 + fi * 7919 + (map.level || 0) * 104729 + (map.spawn ? Math.round(map.spawn.x * 13 + map.spawn.z * 7) : 0);
    const drnd = () => ((ds = (ds * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pitCells = new Set((map.pits || []).map((p) => Math.floor(p.z / CELL_SIZE) * W + Math.floor(p.x / CELL_SIZE)));
    const stairCells = new Set((map.stairs || []).map((st) => st.gz * W + st.gx));
    const wallSpots = { outlet: [], fire_alarm: [], power_box_01: [], wall_clock: [] };
    const ceilSpots = [];
    const rates = L1 ? { outlet: 0.02, fire_alarm: 0.01, power_box_01: 0.012, wall_clock: 0 } : { outlet: 0.05, fire_alarm: 0.008, power_box_01: 0.003, wall_clock: 0.004 };
    const heights = { outlet: 0.32, fire_alarm: 2.15, power_box_01: 1.35, wall_clock: 2.25 };
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (map.grid[i] === T.WALL || pitCells.has(i) || stairCells.has(i)) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || map.grid[nz * W + nx] !== T.WALL) continue;
          for (const k in rates) {
            if (drnd() >= rates[k]) continue;
            const along = (drnd() - 0.5) * (CELL_SIZE - 0.8);
            wallSpots[k].push({
              x: (x + 0.5) * CELL_SIZE + dx * (CELL_SIZE / 2 - 0.004) + (dz ? along : 0),
              z: (z + 0.5) * CELL_SIZE + dz * (CELL_SIZE / 2 - 0.004) + (dx ? along : 0),
              rot: Math.atan2(-dx, -dz), // l'objet regarde la pièce
            });
            break;
          }
        }
        if (!L1 && drnd() < 0.045) ceilSpots.push({ x: (x + 0.5) * CELL_SIZE + (drnd() - 0.5) * 1.2, z: (z + 0.5) * CELL_SIZE + (drnd() - 0.5) * 1.2, rot: drnd() < 0.5 ? 0 : Math.PI / 2 });
      }
    }
    // prises : une petite plaque blanche jaunie à deux trous
    if (wallSpots.outlet.length) {
      const om = baked(new THREE.MeshLambertMaterial({ map: textures.outlet }));
      const outlets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.115, 0.012), om, wallSpots.outlet.length);
      wallSpots.outlet.forEach((s, i) => {
        dummy.position.set(s.x, heights.outlet, s.z);
        dummy.rotation.set(0, s.rot, 0);
        dummy.updateMatrix();
        outlets.setMatrixAt(i, dummy.matrix);
      });
      dummy.rotation.set(0, 0, 0);
      outlets.instanceMatrix.needsUpdate = true;
      group.add(outlets);
    }
    // grilles d'aération du faux plafond
    if (ceilSpots.length) {
      const vm = baked(new THREE.MeshLambertMaterial({ map: textures.vent }));
      const vents = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.6), vm, ceilSpots.length);
      ceilSpots.forEach((s, i) => {
        dummy.position.set(s.x, CEIL - 0.006, s.z);
        dummy.rotation.set(Math.PI / 2, 0, s.rot);
        dummy.updateMatrix();
        vents.setMatrixAt(i, dummy.matrix);
      });
      dummy.rotation.set(0, 0, 0);
      vents.instanceMatrix.needsUpdate = true;
      group.add(vents);
    }
    // modèles collés au mur (leur dos est à z = 0 et ils regardent +z)
    for (const name of ['fire_alarm', 'power_box_01', 'wall_clock']) {
      const spots = wallSpots[name];
      if (!spots.length) continue;
      loader.load(MODELS + name + '.glb', (g) => {
        const root = g.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const fix = new THREE.Matrix4().makeTranslation(0, 0, -box.min.z);
        root.traverse((o) => {
          if (!o.isMesh) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          const inst = new THREE.InstancedMesh(o.geometry, propMat(src), spots.length);
          spots.forEach((s, i) => {
            const m = new THREE.Matrix4().makeTranslation(s.x, heights[name], s.z).multiply(new THREE.Matrix4().makeRotationY(s.rot)).multiply(fix);
            inst.setMatrixAt(i, m.multiply(o.matrixWorld));
          });
          inst.instanceMatrix.needsUpdate = true;
          inst.frustumCulled = false;
          group.add(inst);
        });
      }, undefined, () => {});
    }

    // 6. Les cassettes VHS de cet étage
    const cassetteGeo = new THREE.BoxGeometry(0.38, 0.22, 0.06);
    const cassetteMat = new THREE.MeshLambertMaterial({ map: textures.vhs, emissive: '#d97706', emissiveIntensity: 0.35 });
    const cassetteMeshes = [];
    for (const cas of map.cassettes || []) {
      const cg = new THREE.Group();
      cg.add(new THREE.Mesh(cassetteGeo, cassetteMat));
      cg.add(new THREE.PointLight('#f5a524', 2.2, 5, 1.6));
      cg.position.set(cas.x, cas.high ? NICHE_Y : 0.85, cas.z);
      group.add(cg);
      cassetteMeshes.push({ id: cas.id, cas, group: cg });
    }

    // 6b. Le renfoncement dans le mur, la cassette posée dedans, et l'échelle une fois posée
    const N = map.niche;
    let placedLadder = null;
    const railMat = baked(new THREE.MeshLambertMaterial({ color: '#8a8f94' }));
    const makeLadder = (h) => {
      const g = new THREE.Group();
      for (const sx of [-0.22, 0.22]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), railMat);
        rail.position.set(sx, h / 2, 0);
        g.add(rail);
      }
      for (let y = 0.3; y < h - 0.1; y += 0.3) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.035, 0.035), railMat);
        rung.position.set(0, y, 0);
        g.add(rung);
      }
      return g;
    };
    if (N) {
      const wx = (N.gx + 0.5) * CELL_SIZE + N.dx * (CELL_SIZE / 2 - 0.012);
      const wz = (N.gz + 0.5) * CELL_SIZE + N.dz * (CELL_SIZE / 2 - 0.012);
      const face = Math.atan2(-N.dx, -N.dz); // regarde la pièce
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), new THREE.MeshBasicMaterial({ color: '#0d0b07' }));
      hole.position.set(wx, NICHE_Y + 0.12, wz);
      hole.rotation.y = face;
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.28), wallMat);
      ledge.position.set(wx - N.dx * 0.12, NICHE_Y - 0.2, wz - N.dz * 0.12);
      ledge.rotation.y = face;
      group.add(hole, ledge);
      // l'échelle posée : appuyée au mur, sous le renfoncement
      placedLadder = makeLadder(2.3);
      placedLadder.position.set(N.baseX + N.dx * 0.25, 0, N.baseZ + N.dz * 0.25);
      placedLadder.rotation.set(0, face, 0);
      placedLadder.rotateX(-0.22);
      placedLadder.visible = false;
      group.add(placedLadder);
    }

    // 7. Objets au sol : eau d'amande, piles, échelle (un maillage par objet, créé à la demande)
    const itemMeshes = [];
    const glassMat = baked(new THREE.MeshLambertMaterial({ color: '#e8efe6', transparent: true, opacity: 0.75 }));
    const capMat = baked(new THREE.MeshLambertMaterial({ color: '#2f6fb0' }));
    const labelMat = baked(new THREE.MeshLambertMaterial({ map: textures.label }));
    const makeBottle = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), glassMat);
      body.position.y = 0.13;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.1, 12, 1, true), labelMat);
      label.position.y = 0.12;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.06, 10), glassMat);
      neck.position.y = 0.29;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 10), capMat);
      cap.position.y = 0.335;
      g.add(body, label, neck, cap);
      return g;
    };
    const cellMat = baked(new THREE.MeshLambertMaterial({ color: '#1d1d1d' }));
    const capCopper = baked(new THREE.MeshLambertMaterial({ color: '#c98a2b', emissive: '#5a3a08', emissiveIntensity: 0.6 }));
    const makeBattery = () => {
      const g = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), cellMat);
        cell.rotation.z = Math.PI / 2;
        cell.position.set(0, 0.045, i * 0.1 - 0.05);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.07, 10), capCopper);
        top.rotation.z = Math.PI / 2;
        top.position.set(0.07, 0.045, i * 0.1 - 0.05);
        g.add(cell, top);
      }
      return g;
    };
    // l'échelle au sol : couchée
    const makeFloorLadder = () => {
      const g = new THREE.Group();
      const l = makeLadder(2.2);
      l.rotation.x = -Math.PI / 2;
      l.position.set(0, 0.04, 1.1);
      g.add(l);
      return g;
    };
    const addItemMesh = (it) => {
      const g = it.kind === 'bottle' ? makeBottle() : it.kind === 'battery' ? makeBattery() : makeFloorLadder();
      g.position.set(it.x, 0, it.z);
      g.rotation.y = it.id * 1.7;
      group.add(g);
      itemMeshes.push({ it, g });
    };
    for (const it of map.items || []) addItemMesh(it);

    // 8. Escaliers : en bas, des marches qui montent jusqu'à la trémie ; en haut, un garde-corps autour de la trémie
    const stairMat = baked(new THREE.MeshLambertMaterial({ color: '#7a7058' }));
    const railStair = baked(new THREE.MeshLambertMaterial({ color: '#3a3a36' }));
    for (const st of map.stairs || []) {
      if (fi > 0 || floors.length === 1) {
        // les marches montent vers (dx, dz), sur toute la hauteur d'un étage
        const n = 14;
        const run = CELL_SIZE - 0.2;
        for (let i = 0; i < n; i++) {
          const h = ((i + 1) * FLOOR_DY) / n;
          const step = new THREE.Mesh(new THREE.BoxGeometry(st.dx ? run / n : 1.7, h, st.dz ? run / n : 1.7), stairMat);
          const o = -run / 2 + (i + 0.5) * (run / n);
          step.position.set(st.x + st.dx * o, h / 2, st.z + st.dz * o);
          group.add(step);
        }
      } else {
        // garde-corps sur les deux côtés parallèles à la montée, bande jaune et noire au bord
        for (const s of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(st.dz ? 0.06 : CELL_SIZE - 0.1, 1.0, st.dx ? 0.06 : CELL_SIZE - 0.1), railStair);
          rail.position.set(st.x + (st.dz ? s * (CELL_SIZE / 2 - 0.05) : 0), 0.5, st.z + (st.dx ? s * (CELL_SIZE / 2 - 0.05) : 0));
          group.add(rail);
        }
      }
    }

    // 9. Level 1 : rayonnages métalliques (montants bleus, lisses orange, plateaux), panneau de fond et marchandises
    if (map.shelves && map.shelves.length) {
      const n = map.shelves.length;
      const SH = Math.min(CEIL - 0.5, 3.4); // hauteur d'un rack
      const DECKS = [0.12, 1.15, 2.2, SH - 0.05];
      const upright = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, SH, 0.09), baked(new THREE.MeshLambertMaterial({ color: '#2d5b8c' })), n * 4);
      const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, 0.11, 0.06), baked(new THREE.MeshLambertMaterial({ color: '#d4661a' })), n * DECKS.length * 2);
      const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, 0.04, CELL_SIZE - 0.2), baked(new THREE.MeshLambertMaterial({ color: '#5d6266' })), n * DECKS.length);
      const back = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, SH, 0.05), baked(new THREE.MeshLambertMaterial({ color: '#33373b' })), n);
      let goodsCount = 0;
      for (const sh of map.shelves) goodsCount += sh.goods.length * 2;
      const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), baked(new THREE.MeshLambertMaterial({ map: textures.crate })), goodsCount);
      const cartons = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), baked(new THREE.MeshLambertMaterial({ color: '#8c6e48' })), goodsCount);
      const barrels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), baked(new THREE.MeshLambertMaterial({ color: '#1f4f7a' })), goodsCount);
      const goodsMesh = [crates, cartons, barrels];
      const goodsIdx = [0, 0, 0];
      let ui = 0;
      let bi = 0;
      let di = 0;
      const half = CELL_SIZE / 2 - 0.08;
      map.shelves.forEach((sh, i) => {
        const cx = (sh.gx + 0.5) * CELL_SIZE;
        const cz = (sh.gz + 0.5) * CELL_SIZE;
        const rot = sh.alongX ? 0 : Math.PI / 2; // la rangée court le long de x (sinon de z)
        const put = (mesh, k, lx, y, lz, sx = 1, sy = 1, sz = 1) => {
          dummy.position.set(cx + Math.cos(rot) * lx + Math.sin(rot) * lz, y, cz - Math.sin(rot) * lx + Math.cos(rot) * lz);
          dummy.rotation.set(0, rot, 0);
          dummy.scale.set(sx, sy, sz);
          dummy.updateMatrix();
          mesh.setMatrixAt(k, dummy.matrix);
        };
        for (const [ux, uz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) put(upright, ui++, ux, SH / 2, uz);
        for (const y of DECKS) {
          put(deck, di++, 0, y, 0);
          put(beam, bi++, 0, y + 0.03, -half);
          put(beam, bi++, 0, y + 0.03, half);
        }
        put(back, i, 0, SH / 2, 0);
        // marchandises des deux côtés du panneau de fond
        sh.goods.forEach((g, j) => {
          const y0 = DECKS[g.lvl] + 0.03;
          for (const side of [-1, 1]) {
            const kind = (g.kind + (side > 0 ? j : 0)) % 3;
            const m = goodsMesh[kind];
            const w = g.w;
            const h = Math.min(g.h, DECKS[g.lvl + 1] - DECKS[g.lvl] - 0.12);
            put(m, goodsIdx[kind]++, g.off * side, y0 + h / 2, side * 0.62, kind === 2 ? 0.7 : w, h, kind === 2 ? 0.7 : 0.9);
          }
        });
      });
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      goodsMesh.forEach((m, k) => {
        m.count = goodsIdx[k];
      });
      for (const m of [upright, beam, deck, back, ...goodsMesh]) {
        m.instanceMatrix.needsUpdate = true;
        group.add(m);
      }
    }

    // 10. Fusibles (Level 1) : un gros fusible céramique aux bouts de cuivre, lueur ambrée
    const fuseMeshes = [];
    const fuseBody = new THREE.MeshLambertMaterial({ color: '#efe9dc', emissive: '#4a3a20', emissiveIntensity: 0.5 });
    const fuseCap = new THREE.MeshLambertMaterial({ color: '#c98a2b', emissive: '#7a4a10', emissiveIntensity: 0.7 });
    for (const f of map.fuses || []) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), fuseBody);
      body.rotation.z = Math.PI / 2;
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), fuseCap);
      c1.rotation.z = Math.PI / 2;
      c1.position.x = 0.15;
      const c2 = c1.clone();
      c2.position.x = -0.15;
      g.add(body, c1, c2, new THREE.PointLight('#ffb347', 2, 4.5, 1.6));
      g.position.set(f.x, 0.9, f.z);
      group.add(g);
      fuseMeshes.push({ f, g });
    }

    // 11. Brouillard froid au ras du sol (Level 1) : deux nappes qui glissent lentement et suivent la caméra
    const fogLayers = [];
    if (L1) {
      for (const [y, o, rep, sp] of [[0.15, 0.55, 9, 0.012], [0.5, 0.3, 6, -0.008]]) {
        const t = textures.fog.clone();
        t.needsUpdate = true;
        t.repeat.set(rep, rep);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: t, color: '#3e4850', transparent: true, opacity: o, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = y;
        m.renderOrder = 2;
        group.add(m);
        fogLayers.push({ m, t, o, sp, rep });
      }
    }

    // 12. L'ascenseur (monte-charge au Level 1) : cabine creusée dans le mur, portes coulissantes, voyant rouge ou vert.
    // Au Level 0, le faux ascenseur se referme en mur jaune une fois les cassettes trouvées.
    const E = map.elevator;
    const exitGroup = new THREE.Group();
    const doors = [];
    const signMat = new THREE.MeshBasicMaterial({ color: '#ff3030' });
    const fuseLamps = [];
    let fakeWall = null;
    if (E) {
      // repère local : -z regarde l'entrée, la cabine est vers +z
      const at = new THREE.Group();
      at.position.set(E.x - E.dx * (CELL_SIZE / 2), 0, E.z - E.dz * (CELL_SIZE / 2));
      at.rotation.y = Math.atan2(E.dx, E.dz);
      at.add(exitGroup);
      group.add(at);
      const steelMat = baked(new THREE.MeshLambertMaterial({ map: textures.steel }));
      const DW = 1.3; // largeur de la baie
      const DH = 2.3;
      const side = (CELL_SIZE - DW) / 2;
      // façade autour de la baie, du même revêtement que les murs
      const pl = new THREE.Mesh(new THREE.BoxGeometry(side, CEIL, 0.12), wallMat);
      pl.position.set(-(DW / 2 + side / 2), CEIL / 2, 0.06);
      const pr = pl.clone();
      pr.position.x = DW / 2 + side / 2;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(DW, CEIL - DH, 0.12), wallMat);
      lintel.position.set(0, DH + (CEIL - DH) / 2, 0.06);
      // encadrement d'inox
      const frameMat = baked(new THREE.MeshLambertMaterial({ color: '#6f757b' }));
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.1, DH + 0.1, 0.16), frameMat);
      fl.position.set(-DW / 2 - 0.05, DH / 2, 0);
      const fr = fl.clone();
      fr.position.x = DW / 2 + 0.05;
      const ft = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.2, 0.1, 0.16), frameMat);
      ft.position.set(0, DH + 0.05, 0);
      exitGroup.add(pl, pr, lintel, fl, fr, ft);
      // les deux vantaux
      for (const sgn of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(DW / 2, DH, 0.05), steelMat);
        d.position.set(sgn * (DW / 4), DH / 2, 0.1);
        exitGroup.add(d);
        doors.push({ d, sgn });
      }
      // cabine : une boîte vue de l'intérieur (l'avant s'efface depuis le couloir)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE - 0.1, 2.7, CELL_SIZE - 0.2), new THREE.MeshLambertMaterial({ map: textures.steel, side: THREE.BackSide, emissive: '#3a3d40', emissiveIntensity: 0.6 }));
      cabin.position.set(0, 1.35, CELL_SIZE / 2 + 0.05);
      const cabinLight = new THREE.PointLight('#f4f1e0', 2.5, 4, 1.5);
      cabinLight.position.set(0, 2.5, CELL_SIZE / 2);
      exitGroup.add(cabin, cabinLight);
      // voyant au-dessus des portes, et boîte à boutons (au Level 1 : le panneau aux 3 fusibles)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(L1 ? 0.5 : 0.7, 0.2), signMat);
      sign.position.set(0, DH + 0.3, -0.01);
      sign.rotation.y = Math.PI;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, L1 ? 0.6 : 0.4, 0.08), baked(new THREE.MeshLambertMaterial({ color: L1 ? '#3b4a2f' : '#55595e' })));
      panel.position.set(DW / 2 + 0.35, 1.3, -0.04);
      exitGroup.add(sign, panel);
      if (L1) {
        for (let i = 0; i < FUSES; i++) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), new THREE.MeshBasicMaterial({ color: '#331010' }));
          lamp.position.set(DW / 2 + 0.35, 1.45 - i * 0.15, -0.09);
          exitGroup.add(lamp);
          fuseLamps.push(lamp);
        }
      }
      // le mur qui prend sa place s'il est faux
      fakeWall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, CEIL, 0.14), wallMat);
      fakeWall.position.set(0, CEIL / 2, 0.07);
      fakeWall.visible = false;
      at.add(fakeWall);
    }
    const exitLight = new THREE.PointLight('#ff2020', 3, 8, 1.6);
    exitLight.position.set(map.exit.x, 2.4, map.exit.z);
    group.add(exitLight);
    let doorOpen = 0;

    // 13. Table des lampes torches au départ (étage du haut, construite au premier rendu : c'est le moteur qui la place)
    let tableBuilt = fi > 0;
    const lampMeshes = [];
    let addLamp = null;
    const buildTable = (sim) => {
      tableBuilt = true;
      const T0 = sim.table;
      if (!T0) return;
      const g = new THREE.Group();
      g.position.set(T0.x, 0, T0.z);
      g.rotation.y = T0.rot;
      const wood = baked(new THREE.MeshLambertMaterial({ color: '#5b4128' }));
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.75), wood);
      top.position.y = 0.76;
      g.add(top);
      for (const [lx, lz] of [[-0.78, -0.31], [0.78, -0.31], [-0.78, 0.31], [0.78, 0.31]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), wood);
        leg.position.set(lx, 0.37, lz);
        g.add(leg);
      }
      // une petite lumière chaude au-dessus pour qu'on la repère tout de suite
      const glow = new THREE.PointLight('#ffd9a0', 2.2, 5, 1.6);
      glow.position.set(0, 1.6, 0);
      g.add(glow);
      group.add(g);
      // les lampes, couchées en travers de la table
      const body = new THREE.MeshLambertMaterial({ color: '#1c1d20' });
      const ring = new THREE.MeshLambertMaterial({ color: '#b8bcc2' });
      const lens = new THREE.MeshBasicMaterial({ color: '#fff3c8' });
      addLamp = (l) => {
        const m = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), body);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.04, 0.08, 12), ring);
        h.position.y = 0.16;
        const le = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), lens);
        le.position.y = 0.201;
        le.rotation.x = -Math.PI / 2;
        m.add(b, h, le);
        m.rotation.x = Math.PI / 2; // couchée en travers de la table
        m.position.y = 0.83;
        const wrap = new THREE.Group();
        wrap.position.set(l.x, 0, l.z);
        wrap.rotation.y = T0.rot + (l.id % 2 ? 0.25 : -0.2);
        wrap.add(m);
        group.add(wrap);
        lampMeshes.push({ l, m: wrap });
      };
      for (const l of sim.lamps) addLamp(l);
    };

    let lit = true;
    let powerFlick = 0;
    let flickT = 0;
    const setPower = (v) => {
      if (v === power) return;
      power = v;
      ambient.intensity = v ? 0.05 : 0;
      for (const l of map.lights) fixtures.setColorAt(l.index, power && l.state !== 'off' ? ON : OFF);
      fixtures.instanceColor.needsUpdate = true;
      writeBake();
    };

    return {
      lightAt,
      // une image : objets, cassettes, ascenseur, néons de cet étage
      update(sim, P, time, dt) {
        if (!tableBuilt) buildTable(sim);
        // une lampe de plus si un joueur arrive en cours de partie
        if (addLamp && sim.lamps.length > lampMeshes.length) for (const l of sim.lamps.slice(lampMeshes.length)) addLamp(l);
        for (const lm of lampMeshes) lm.m.visible = !lm.l.taken;

        // Coupure de courant : les néons meurent d'un coup, puis reviennent en grésillant
        const want = !(sim.blackout > 0);
        if (want !== lit) {
          lit = want;
          powerFlick = want ? 0.9 : 0;
          setPower(want ? 1 : 0);
        }
        if (powerFlick > 0) {
          powerFlick -= dt;
          setPower(powerFlick <= 0 || Math.random() < 0.55 ? 1 : 0);
        }

        // Cassettes et objets
        for (const cm of cassetteMeshes) {
          cm.group.visible = !cm.cas.collected;
          if (cm.group.visible && cm.cas.high) {
            // dans le renfoncement : elle ne tourne pas, elle regarde la pièce
            cm.group.rotation.y = Math.atan2(-N.dx, -N.dz);
          } else if (cm.group.visible) {
            cm.group.rotation.y = time * 1.6;
            cm.group.position.y = 0.85 + Math.sin(time * 2.5 + cm.id) * 0.08;
          }
        }
        // objets au sol (ceux qu'un échange a posés apparaissent)
        const items = map.items || [];
        for (let i = itemMeshes.length; i < items.length; i++) addItemMesh(items[i]);
        for (const im of itemMeshes) im.g.visible = !im.it.taken;
        if (placedLadder) placedLadder.visible = !!(N && N.ladder);

        // Ascenseur : rouge verrouillé, vert ouvert ; le faux devient un mur
        const fake = !!(E && E.fake);
        const open = sim.open && !fake;
        exitGroup.visible = !fake;
        if (fakeWall) fakeWall.visible = fake;
        exitLight.visible = !fake;
        exitLight.color.set(open ? '#22c55e' : '#ef4444');
        exitLight.intensity = open ? 6 : 2.5;
        signMat.color.set(open ? '#4ade80' : '#ff3030');
        // les portes s'ouvrent quand l'ascenseur est alimenté, se referment au départ
        const doorWant = open && !(sim.departT > 0) ? 1 : 0;
        doorOpen += Math.sign(doorWant - doorOpen) * Math.min(Math.abs(doorWant - doorOpen), dt / 1.2);
        for (const { d, sgn } of doors) d.position.x = sgn * (0.325 + doorOpen * 0.6);
        fuseLamps.forEach((l, i) => l.material.color.set(sim.powered ? '#22c55e' : i < sim.fuses ? '#ffb020' : '#331010'));
        for (const fm of fuseMeshes) {
          fm.g.visible = !fm.f.taken;
          if (fm.g.visible) {
            fm.g.rotation.y = time * 1.4;
            fm.g.position.y = 0.9 + Math.sin(time * 2.2 + fm.f.id) * 0.07;
          }
        }
        // nappes de brouillard : elles suivent la caméra et pâlissent dans le noir
        for (const L of fogLayers) {
          L.m.position.x = P.x;
          L.m.position.z = P.z;
          L.t.offset.set((P.x / 70) * L.rep + time * L.sp, (-P.z / 70) * L.rep + time * L.sp * 0.6);
          L.m.material.opacity = L.o * (power ? 1 : 0.1);
        }

        // Néons qui grésillent (une quinzaine de fois par seconde)
        flickT -= dt;
        if (flickT <= 0 && flickers.length && power && powerFlick <= 0) {
          flickT = 1 / 15;
          let changed = false;
          for (const f of flickers) {
            if (Math.random() < 0.12) {
              const k = Math.random() < 0.45 ? 0 : 0.6 + Math.random() * 0.4;
              if (k !== f.k) {
                f.k = k;
                fixtures.setColorAt(f.l.index, k > 0 ? ON : OFF);
                changed = true;
              }
            }
          }
          if (changed) {
            fixtures.instanceColor.needsUpdate = true;
            writeBake();
          }
        }
      },
    };
  }
  const floorViews = floors.map((m, fi) => buildFloor(m, fi));

  // Lampe torche du joueur (attachée à la caméra)
  const flashLight = new THREE.SpotLight('#fff1d0', 20, 24, Math.PI / 6.5, 0.45, 1.5);
  flashLight.position.set(0.15, -0.12, 0);
  camera.add(flashLight);
  const flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, -0.2, -5);
  camera.add(flashTarget);
  flashLight.target = flashTarget;
  scene.add(camera);

  // Les autres joueurs : une silhouette au caméscope, et le faisceau de leur lampe
  const avatars = new Map();
  const avatarMat = new THREE.MeshLambertMaterial({ color: '#2b2f36' });
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1c9', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const avatarOf = (P) => {
    let a = avatars.get(P.id);
    if (!a) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), avatarMat);
      body.position.y = 0.85;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: '#c9a989' }));
      head.position.y = 1.6;
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), new THREE.MeshLambertMaterial({ color: '#111' }));
      cam.position.set(0.18, 1.45, -0.18);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 16, 1, true), beamMat);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(0.18, 1.45, -3.6);
      g.add(body, head, cam, beam);
      scene.add(g);
      a = { g, beam };
      avatars.set(P.id, a);
    }
    return a;
  };

  // L'entité : une image plate qui fait toujours face au joueur. Tant qu'elle n'est pas chargée (ou s'il n'y a
  // pas d'image), une silhouette noire aux yeux rouges la remplace.
  const monsterGroup = new THREE.Group();
  const shadow = new THREE.Group();
  const blackMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const mBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.3, 12), blackMat);
  mBody.position.y = 1.15;
  const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), blackMat);
  mHead.position.y = 2.4;
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff0033' });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeL.position.set(0.1, 2.43, 0.27);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.1;
  shadow.add(mBody, mHead, eyeL, eyeR);
  monsterGroup.add(shadow);

  const face = new THREE.Group();
  const faceGlitch = { value: 1 };
  const faceTime = { value: 0 };
  // au Level 1, l'image de la planche affichée : décalage et taille dans la texture (xy, zw)
  const faceFrame = { value: new THREE.Vector4(0, 0, 1, 1) };
  const anim = L1 ? ENTITY_ANIM : null;
  face.visible = false;
  monsterGroup.add(face);
  new THREE.TextureLoader().load(anim ? anim.url : ENTITY_IMG, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const h = anim ? 2.8 : 2.15; // au Level 1, il est immense (le plafond de l'entrepôt est à 4,2 m)
    const w = anim ? h * anim.aspect : Math.min(2.3, (h * t.image.width) / t.image.height);
    if (anim) faceFrame.value.set(0, 0, 1 / anim.cols, 1 / anim.rows);
    const mat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, color: anim ? '#463e37' : '#e6dccb' }); // au Level 1, une silhouette sombre
    // brouillage de l'image : bandes décalées, couleurs qui bavent, neige et lignes manquantes (uGlitch de 0 à 1)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlitch = faceGlitch;
      sh.uniforms.uGTime = faceTime;
      sh.uniforms.uFrame = faceFrame;
      sh.fragmentShader = `uniform float uGlitch;
uniform float uGTime;
uniform vec4 uFrame;
float ghash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
  vec2 guv = vMapUv;
  vec2 gpad = 0.5 / (vec2(textureSize(map, 0)) * uFrame.zw); // sans déborder sur l'image voisine de la planche
  float gt = floor(uGTime * 15.0);
  float gb = floor(guv.y * 30.0);
  guv.x += step(1.0 - uGlitch * 0.6, ghash(vec2(gb, gt))) * (ghash(vec2(gb, gt + 7.0)) - 0.5) * 0.4 * uGlitch;
  guv.x += (ghash(vec2(floor(guv.y * 220.0), gt)) - 0.5) * 0.025 * uGlitch;
  float gca = 0.03 * uGlitch;
  #define GUV(u) (uFrame.xy + clamp(u, gpad, 1.0 - gpad) * uFrame.zw)
  vec4 gc = texture2D(map, GUV(guv));
  gc.r = texture2D(map, GUV(guv + vec2(gca, 0.0))).r;
  gc.b = texture2D(map, GUV(guv - vec2(gca, 0.0))).b;
  gc.rgb = mix(gc.rgb, vec3(ghash(guv * 420.0 + uGTime)), uGlitch * 0.4);
  if (ghash(vec2(gb * 3.1, floor(uGTime * 20.0))) < uGlitch * 0.2) gc.a = 0.0;
  diffuseColor *= gc;
`);
    };
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.y = h / 2 + 0.25; // elle flotte au-dessus de la moquette
    plane.position.x = anim ? 0 : (0.5 - 0.6) * w; // la tête (à 60 % de la largeur de la photo) dans l'axe de l'entité
    if (anim) plane.position.y = h / 2 + 0.02; // lui marche par terre
    face.add(plane);
    face.visible = true;
    shadow.visible = false;
  });

  const monsterAura = new THREE.PointLight('#ff1a1a', 2.5, 6, 1.6);
  monsterAura.position.set(0, 1.6, 0.6);
  monsterGroup.add(monsterAura);
  monsterGroup.position.set(map0.monsterSpawn.x, 0, map0.monsterSpawn.z);
  scene.add(monsterGroup);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    vhs.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  let lastTime = 0;
  let bob = 0;
  let eyeY = 1.6; // hauteur des yeux : elle suit les chutes, les escaliers et l'échelle
  let exposure = 1.2; // exposition du caméscope : elle rattrape la lumière en une seconde environ
  let lightNow = 0.5; // lumière des néons là où l'on est (pour le grésillement)

  return {
    level: map0.level || 0,
    map: map0,
    floors,
    scene,
    camera,
    renderer,
    monsterGroup,
    vhs,
    get lightHere() {
      return lightNow;
    },

    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },

    // Rendu d'une frame
    render(sim, time) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      // la caméra suit le joueur de cet écran, ou celui qu'il regarde quand il est spectateur
      const P = sim.viewPlayer(sim.spectate || 0);
      for (const fv of floorViews) fv.update(sim, P, time, dt);

      // 1. Caméra : balancement lent de la marche, plus marqué en courant ; une chute la fait plonger d'un étage
      if (P.moving) bob += dt * (P.running ? 9 : 5.5);
      const want = 1.6 - (P.floor || 0) * FLOOR_DY + (P.onLadder ? 1.0 : 0);
      const fall = want < eyeY - 0.5;
      eyeY += (want - eyeY) * Math.min(1, dt * (fall ? 9 : 4));
      camera.position.set(P.x, eyeY + (P.moving ? Math.sin(bob * 2) * (P.running ? 0.05 : 0.025) : 0), P.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = P.yaw;
      camera.rotation.x = P.pitch;
      camera.rotation.z = (P.moving ? Math.sin(bob) * 0.006 : 0) - (P.tilt || 0) * 0.5; // on tangue sur l'arête
      // caméra tenue à la main : elle ne reste jamais tout à fait immobile, et tremble davantage en courant
      const hand = (P.moving ? (P.running ? 2.4 : 1.4) : 1) * 0.0035;
      camera.rotation.x += (Math.sin(time * 0.83) * 0.6 + Math.sin(time * 2.17 + 1.3) * 0.3 + Math.sin(time * 5.3) * 0.1) * hand;
      camera.rotation.y += (Math.sin(time * 0.61 + 2.1) * 0.6 + Math.sin(time * 1.73) * 0.3 + Math.sin(time * 4.7 + 0.4) * 0.1) * hand;
      camera.rotation.z += Math.sin(time * 0.47 + 0.7) * hand * 0.8;

      // tremblement quand l'entité est tout près
      const danger = sim.hasMonster ? sim.monster.danger : 0;
      const calm = 1 - THREE.MathUtils.smoothstep(danger, 0.72, 0.92);
      if (danger > 0.3) {
        const shake = (danger - 0.3) * 0.035 * calm;
        camera.rotation.z += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }

      flashLight.visible = P.flashlight && P.status === 'alive';
      // pile faible : la lampe faiblit et clignote
      const bat = P.battery ?? 100;
      flashLight.intensity = 20 * (bat < 15 ? 0.45 + (Math.random() < 0.12 ? -0.4 : 0.15) : bat < 35 ? 0.75 : 1);

      // 2. L'entité fait face au joueur et tressaute quand elle le traque
      if (sim.hasMonster) {
        const M = sim.monster;
        monsterGroup.visible = true;
        const chase = M.mode === 'chase';
        // plus elle est proche, moins elle est brouillée : nette à moins de 2,5 m
        const g = THREE.MathUtils.clamp((Math.hypot(P.x - M.x, P.z - M.z) - 2.5) / 14, 0, 1);
        faceGlitch.value = anim ? g * 0.3 : g; // au Level 1, sombre mais net : à peine brouillé
        faceTime.value = time;
        if (anim) {
          const f = Math.floor(time * anim.fps) % anim.frames;
          // la planche se lit de haut en bas, la texture de bas en haut
          faceFrame.value.x = (f % anim.cols) / anim.cols;
          faceFrame.value.y = 1 - (Math.floor(f / anim.cols) + 1) / anim.rows;
        }
        const j = (chase ? 0.12 : 0.04) * faceGlitch.value;
        const my = -(M.floor || 0) * FLOOR_DY;
        monsterGroup.position.set(M.x + (Math.random() - 0.5) * j, my + (chase ? Math.abs(Math.sin(time * 9)) * 0.08 : Math.sin(time * 2) * 0.03), M.z + (Math.random() - 0.5) * j);
        monsterGroup.rotation.y = Math.atan2(P.x - M.x, P.z - M.z);
        face.scale.set(1 + (Math.random() - 0.5) * 0.08 * faceGlitch.value, 1 + Math.sin(time * 18) * 0.04 * faceGlitch.value, 1);
        monsterAura.intensity = (chase ? 3 : 1.5) + Math.random() * 1.2;
      } else {
        monsterGroup.visible = false;
      }

      // 3. Les autres joueurs encore dehors
      for (const Q of sim.players) {
        const show = Q !== P && Q.status === 'alive';
        if (!show && !avatars.has(Q.id)) continue;
        const a = avatarOf(Q);
        a.g.visible = show;
        if (!show) continue;
        a.g.position.set(Q.x, -(Q.floor || 0) * FLOOR_DY + (Q.onLadder ? 1.0 : Q.moving ? Math.abs(Math.sin(time * 8)) * 0.04 : 0), Q.z);
        a.g.rotation.set(0, Q.yaw, 0);
        a.g.rotateZ(-(Q.tilt || 0) * 0.6);
        a.beam.visible = Q.flashlight;
      }

      // exposition automatique : le caméscope s'ouvre dans le noir (image plus claire et plus granuleuse) et se
      // referme sous les néons, avec un temps de retard
      const fv = floorViews[P.floor || 0];
      lightNow = fv ? fv.lightAt(P.x, P.z) : 0.5;
      const lightHere = lightNow + (flashLight.visible ? 0.3 : 0);
      const wantExp = THREE.MathUtils.clamp(0.5 / (0.12 + lightHere), 0.95, 1.8);
      exposure += (wantExp - exposure) * Math.min(1, dt * 1.1);
      vhs.render(scene, camera, time, danger * calm, exposure);
    },
  };
}
