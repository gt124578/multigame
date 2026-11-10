// The Backrooms - Scène 3D Three.js : Level 0 (moquette, sur deux étages), Level 1 (entrepôt), ascenseurs, joueurs et entité
// L'éclairage des néons est « cuit » dans une petite texture par étage (une valeur par case) lue en coordonnées monde par
// tous les matériaux : des centaines de néons pour le prix d'aucune lumière. Seuls la lampe torche, les cassettes et
// les ascenseurs sont de vraies lumières. Les étages sont empilés (le second FLOOR_DY plus bas) : on voit l'étage du
// dessous par les trous et les cages d'escalier. L'image finale passe par le filtre de vieille caméra (vhs.js).
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { classicEntity } from './entity.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';
import { mergeGeometries } from '../../shared/vendor/three/BufferGeometryUtils.js';
import { CELL_SIZE, WALL_HEIGHT, T, PIT_HALF, NICHE_Y, NICHE_LO, NICHE_SIZE, NICHE_DEPTH, FLOOR_DY, DEEP_DEPTH, pillarDist, isChamfer, chamferSide } from '../engine/map.js';
import { FUSES, feetY, stairAt, PIPES_LEVEL, THIRST_BLUR, LIFT_SHUT_T, HOTEL_LEVEL, CCTV_FOV, DUCT_LAND } from '../engine/sim.js';
import { DUCT_LOW, DOCK_H, GUARD_T } from '../engine/level1.js';
import { createBackroomsTextures } from './textures.js';
import { createVhsFilter } from './vhs.js';
import { createInset } from './inset.js';
import { buildWarehouse } from './warehouse.js';
import { buildGear } from './gear.js';
import { createPlayerAvatars } from './players.js';
import { createBeast } from './beast.js';
import { buildWater } from './water.js';
import { buildHotel } from './hotel.js';
import { createHotelEntity } from './hotelEntity.js';
import { createGoatHerd } from './goats.js';
import { createPipesTextures } from './textures2.js';
import { buildPipes, L2_PROC } from './pipes.js';
import { hasLineOfSight, findPath } from '../engine/nav.js';
import { Z } from '../engine/level2.js';

const MODELS = new URL('../models/', import.meta.url).href; // modèles Poly Haven (CC0), voir models/LICENSE.txt
const VIP_IMG = new URL('../img/entite.png?v=2', import.meta.url).href; // ?v : image plus nette, ne pas garder l'ancienne en cache
// L'entité du Level 1 : une vidéo détourée, découpée en planche d'images (12 par seconde, 16 par rangée) jouée en boucle
const VIP_ANIM = { url: new URL('../monster/david.webp?v=2', import.meta.url).href, frames: 119, cols: 16, rows: 8, fps: 12, aspect: 246 / 400, tint: '#463e37', vip: true };
// mode normal : l'entité classique dessinée dans le code ; mode VIP : les monstres d'origine (réservés, choisis par l'hôte)
export let ENTITY_IMG = classicEntity().img;
export let ENTITY_ANIM = classicEntity().anim;
export let ENTITY_VIP = false;
export function setMonsterMode(vip) {
  ENTITY_VIP = !!vip;
  ENTITY_IMG = vip ? VIP_IMG : classicEntity().img;
  ENTITY_ANIM = vip ? VIP_ANIM : classicEntity().anim;
}

const LIGHT_R = 1.55; // portée d'un néon, en cases : une flaque de lumière nette, le noir juste à côté
const AMBIENT = 0.003; // lumière minimale dans les zones mortes (presque le noir complet)
const RB = 4; // finesse de l'éclairage cuit : texels par case (des flaques de lumière rondes, des ombres nettes au coin des murs)
const AO_R = 0.8; // portée de l'ombre de contact au pied des murs, en mètres
const SLAB = FLOOR_DY - WALL_HEIGHT; // épaisseur de la dalle entre deux étages

// Projecteur de chantier éteint : trépied noir, mât, barre et deux phares halogènes jaunes qui regardent +z
function makeWorklight() {
  const root = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: '#1d1c1a' });
  const yellow = new THREE.MeshLambertMaterial({ color: '#d29a12' });
  const glass = new THREE.MeshLambertMaterial({ color: '#4a4636' });
  const leg = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
  const hubY = 0.75;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const foot = new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    const top = new THREE.Vector3(0, hubY, 0);
    const m = new THREE.Mesh(leg, black);
    m.position.copy(foot).add(top).multiplyScalar(0.5);
    m.scale.y = foot.distanceTo(top);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    root.add(m);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.85, 8), black);
  mast.position.y = hubY + 0.42;
  root.add(mast);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.03), black);
  bar.position.y = 1.6;
  root.add(bar);
  for (const x of [-0.2, 0.2]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.11), yellow);
    head.position.set(x, 1.66, 0.04);
    head.rotation.x = 0.25;
    root.add(head);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.15, 0.01), glass);
    lens.position.set(0, 0, 0.058);
    head.add(lens);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.02), black);
    handle.position.set(0, 0.12, 0);
    head.add(handle);
  }
  return root;
}

// Cône de chantier orange à bande blanche, sur son socle noir
function makeCone() {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.36), new THREE.MeshLambertMaterial({ color: '#1b1a18' }));
  base.position.y = 0.015;
  root.add(base);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.15, 0.47, 14), new THREE.MeshLambertMaterial({ color: '#d4510f' }));
  cone.position.y = 0.265;
  root.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.09, 0.08, 14), new THREE.MeshLambertMaterial({ color: '#d8d6cc' }));
  band.position.y = 0.3;
  root.add(band);
  return root;
}

// Montre ou cache un groupe sans retirer ses lumières de la scène : une lumière cachée change le nombre de lumières,
// et three.js recompile alors tous les matériaux (le jeu se fige une à deux secondes chez tout le monde). Ici, ses
// lumières s'éteignent (puissance 0) et le reste se cache.
function showGroup(g, on) {
  for (const o of g.children) {
    if (o.isLight) {
      if (o.userData.on === undefined) o.userData.on = o.intensity;
      o.intensity = on ? o.userData.on : 0;
    } else o.visible = on;
  }
}

// Un seul moteur de rendu (un seul contexte WebGL) pour toute la session : chaque nouvel étage le réutilise. Avant,
// chaque étage en créait un, et le navigateur finissait par perdre les plus anciens (écran noir au 4e niveau).
let sharedRenderer = null;
function getRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    sharedRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); // les vrais pixels de l'écran (Retina compris)
  }
  return sharedRenderer;
}

// Réglages d'image du joueur (view/../app.js) : champ de vision, mouvements de caméra, luminosité, flashs, qualité
const OPTS = { fov: 72, motion: 1, brightness: 1, reduceFlashes: false, quality: 'auto' };
let liveScene = null;
export function setSceneOptions(o = {}) {
  Object.assign(OPTS, o);
  if (liveScene) liveScene.applyOptions();
}

// floors : les étages du niveau (une carte chacun)
// lamps : combien de lampes d'explorateurs poser d'avance (les joueurs de la partie)
// L'humidité de la moquette : un bruit de valeur sur un hachage entier, calculé pareil ici et sur la carte graphique
// (bkHashW, bkNoiseW, bkFbmW dans le shader du sol). Les taches sombres sont là où wetField dépasse 0,62 à 0,8 ; au
// cœur des plus grosses (au-delà de 0,8), une pellicule d'eau. Les mêmes chez tout le monde, sur les deux étages.
const wetHash = (x, y) => {
  let h = (Math.imul(x + 4096, 1597334677) ^ Math.imul(y + 4096, 3812015801)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
};
const wetNoise = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = wetHash(ix, iy);
  const b = wetHash(ix + 1, iy);
  const c = wetHash(ix, iy + 1);
  const d = wetHash(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};
const wetFbm = (x, y) => wetNoise(x, y) * 0.55 + wetNoise(x * 2.13 + 7.1, y * 2.13 + 7.1) * 0.3 + wetNoise(x * 4.7 + 3.3, y * 4.7 + 3.3) * 0.15;
export function wetField(x, z) {
  const qx = x * 0.17 + 11;
  const qz = z * 0.17 + 11;
  const wx = wetFbm(qx * 3.1 + 2, qz * 3.1 + 2) - 0.5;
  const wz = wetFbm(qx * 3.1 + 9, qz * 3.1 + 9) - 0.5;
  return wetFbm(qx + wx * 1.1, qz + wz * 1.1);
}
// la pellicule d'eau : 0 au sec, 1 en plein dedans (le même seuil que le shader)
export function filmAt(x, z) {
  const t = Math.min(1, Math.max(0, (wetField(x, z) - 0.8) / 0.035));
  return t * t * (3 - 2 * t);
}

// La matière de la brume : trois bruits doux qui se répètent sans couture (cinq octaves de bruit de valeur chacun),
// étirés sur toute la plage (sinon tout reste gris moyen et la brume paraît uniforme). Rouge : les bancs ; vert : les
// volutes ; bleu : des filaments (les crêtes d'un troisième bruit)
let fogNoiseTex = null;
function fogNoise() {
  if (fogNoiseTex) return fogNoiseTex;
  const S = 256;
  const field = () => {
    const out = new Float32Array(S * S);
    let amp = 1;
    for (const per of [4, 8, 16, 32, 64]) {
      const g = new Float32Array(per * per).map(() => Math.random());
      const at = (i, j) => g[(j % per) * per + (i % per)];
      for (let y = 0; y < S; y++) {
        const fy = (y / S) * per;
        const j = Math.floor(fy);
        let v = fy - j;
        v = v * v * (3 - 2 * v);
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * per;
          const i = Math.floor(fx);
          let u = fx - i;
          u = u * u * (3 - 2 * u);
          out[y * S + x] += amp * ((at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v);
        }
      }
      amp *= 0.5;
    }
    // étiré : 2 % des points tout en bas, 2 % tout en haut
    const sorted = Float32Array.from(out).sort();
    const lo = sorted[Math.floor(S * S * 0.02)];
    const hi = sorted[Math.floor(S * S * 0.98)];
    for (let i = 0; i < S * S; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) / (hi - lo)));
    return out;
  };
  const bank = field();
  const curl = field();
  const fil = field();
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const r = 1 - Math.abs(fil[i] * 2 - 1);
    data[i * 4] = Math.round(bank[i] * 255);
    data[i * 4 + 1] = Math.round(curl[i] * 255);
    data[i * 4 + 2] = Math.round(r * r * r * 255);
    data[i * 4 + 3] = 255;
  }
  fogNoiseTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  fogNoiseTex.wrapS = fogNoiseTex.wrapT = THREE.RepeatWrapping;
  fogNoiseTex.magFilter = THREE.LinearFilter;
  fogNoiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  fogNoiseTex.generateMipmaps = true;
  fogNoiseTex.needsUpdate = true;
  return fogNoiseTex;
}

export function createBackroomsScene(container, floors, lamps) {
  if (!Array.isArray(floors)) floors = [floors];
  const map0 = floors[0];
  const L1 = map0.level === 1;
  const L2 = map0.level === 2; // Level 37, les Poolrooms : clair, laiteux, carrelé, inondé
  const PIPES = map0.level === PIPES_LEVEL; // le Level 2, les Tuyauteries
  const L3 = map0.level === HOTEL_LEVEL; // Level 5, le Terror Hotel : pénombre chaude, boiseries, moquette rouge
  const L0 = !L1 && !L2 && !PIPES && !L3; // le Level 0 : la moquette, le papier peint jaune, les néons
  const CEIL = map0.ceil || WALL_HEIGHT;
  const scene = new THREE.Scene();
  // Level 1 : un froid bleuté, un brouillard plus épais ; Level 2 : une moiteur brune, chaude
  // (Level 1 : le fond a la couleur du brouillard, si épais qu'à 65 m tout s'y est fondu, même un néon allumé — à un
  // millionième près : on ne dessine rien au-delà, l'image n'en change pas d'un pixel)
  scene.background = new THREE.Color(L3 ? '#070403' : L2 ? '#d3e4e2' : L1 ? '#050608' : PIPES ? '#080604' : '#0d0b06');
  scene.fog = new THREE.FogExp2(L3 ? '#120a06' : L2 ? '#d3e4e2' : L1 ? '#050608' : PIPES ? '#0a0705' : '#080604', L3 ? 0.022 : L2 ? 0.022 : L1 ? 0.058 : PIPES ? 0.033 : 0.05);

  const camera = new THREE.PerspectiveCamera(OPTS.fov, window.innerWidth / window.innerHeight, 0.08, L1 ? 65 : 90);
  camera.position.set(map0.spawn.x, 1.6, map0.spawn.z);

  const renderer = getRenderer();
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  container.appendChild(renderer.domElement);
  const vhs = createVhsFilter(renderer);
  const inset = createInset(renderer, container);
  vhs.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

  const textures = createBackroomsTextures(PIPES ? 0 : map0.level || 0);
  const tx2 = PIPES ? createPipesTextures() : null;
  const AMB = L2 ? 0.045 : L3 ? 0.1 : 0.012; // l'hôtel : une pénombre chaude, mais on y voit
  const ambient = new THREE.AmbientLight(L3 ? '#ffcf96' : L2 ? '#eaf7f6' : L1 ? '#c9d8ff' : PIPES ? '#ffd9a8' : '#fff3c4', AMB);
  scene.add(ambient);
  const dummy = new THREE.Object3D();
  const loader = new GLTFLoader();
  // le cadenas de la porte de la cage d'escalier (Quaternius, CC0) : laiton patiné, anse d'acier, 10 cm de haut
  const padlockModel = new Promise((resolve) => {
    loader.load(MODELS + 'padlock.glb', (g) => {
      const root = g.scene;
      const box = new THREE.Box3().setFromObject(root);
      const k = 0.1 / Math.max(0.001, box.max.y - box.min.y);
      const brassM = new THREE.MeshPhongMaterial({ color: '#a8833a', specular: '#6b5a33', shininess: 60, emissive: '#2e2208', emissiveIntensity: 0.5 });
      const steelM = new THREE.MeshPhongMaterial({ color: '#8d9094', specular: '#777', shininess: 80, emissive: '#1c1d1e', emissiveIntensity: 0.5 });
      root.traverse((o) => {
        if (o.isMesh) o.material = /grey/i.test(o.material.name || '') ? brassM : steelM;
      });
      const holder = new THREE.Group();
      root.scale.multiplyScalar(k);
      const b2 = new THREE.Box3().setFromObject(root);
      root.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
      holder.add(root);
      resolve(holder);
    }, undefined, () => resolve(null));
  });
  // la pile AA (Poly by Google, CC-BY 3.0) : 1,4 × 5,2 cm, debout le long de y, centrée. On garde sa forme et son
  // étiquette ; chaque usage (au sol, en main) lui donne son matériau
  const batteryModel = new Promise((resolve) => {
    loader.load(MODELS + 'aa_battery.glb', (g) => {
      let src = null;
      g.scene.traverse((o) => {
        if (o.isMesh && !src) src = { geo: o.geometry, map: o.material.map };
      });
      resolve(src);
    }, undefined, () => resolve(null));
  });

  // masque de transparence d'un plan couché (sol ou plafond) : des trous rectangulaires (demi-côtés hx, hz). 16 texels par case (16 cm : de quoi
  // garder les arêtes de 50 cm entre les trous). flip : la ligne 0 du masque est au bord z max (sol) ou z 0 (plafond)
  const holeMask = (W, H, holes, flip) => {
    const R = 16;
    const mw = W * R;
    const mh = H * R;
    const mask = new Uint8Array(mw * mh * 4).fill(255);
    const tx = (v) => Math.round((v / CELL_SIZE) * R);
    for (const h of holes) {
      const x0 = tx(h.x - h.hx);
      const x1 = tx(h.x + h.hx);
      for (let zi = tx(h.z - h.hz); zi < tx(h.z + h.hz); zi++) {
        const row = flip ? mh - 1 - zi : zi;
        mask.fill(0, (row * mw + x0) * 4, (row * mw + x1) * 4);
      }
    }
    const t = new THREE.DataTexture(mask, mw, mh, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  // un dégradé vertical (haut de la toile = haut de la paroi) : stops [[0..1, couleur], …]
  const gradCanvas = (stops, h = 512) => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    for (const [at, col] of stops) g.addColorStop(at, col);
    x.fillStyle = g;
    x.fillRect(0, 0, 4, h);
    return c;
  };
  // les trous d'un étage (ceux du sol, par où l'on tombe) et ses cages d'escalier
  const holesOf = (m) => [
    ...(m.pits || []).map((p) => ({ x: p.x, z: p.z, hx: PIT_HALF, hz: PIT_HALF })),
    // la trémie de l'escalier : une seule ouverture sur ses deux cases (pas de poutre au milieu)
    ...(m.stairs || []).map((st) => ({ x: st.cx, z: st.cz, hx: (st.dx ? 1.5 : 1) * CELL_SIZE - 0.02, hz: (st.dz ? 1.5 : 1) * CELL_SIZE - 0.02 })),
  ];

  // le reflet d'un objet à ramasser (la clé, une cassette) dans le faisceau de la lampe : une étoile douce, éteinte
  // hors du faisceau (une texture pour tous, un matériau à chacun : chacun brille quand la lampe passe sur lui)
  let glintTex = null;
  const glintMat = () => {
    if (!glintTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 32;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,230,160,0.5)');
      gr.addColorStop(1, 'rgba(255,200,100,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
      glintTex = new THREE.CanvasTexture(cv);
    }
    return new THREE.SpriteMaterial({ map: glintTex, color: '#ffe7a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  };
  const glintIn = (sp, x, z, P, fi, time) => {
    const dx = x - P.x;
    const dz = z - P.z;
    const d = Math.hypot(dx, dz);
    let off = Math.atan2(-dx, -dz) - P.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    const inBeam = P.flashlight && (P.floor || 0) === fi && d < 16 && Math.abs(off) < 0.3;
    sp.material.opacity = inBeam ? 0.55 + 0.35 * Math.sin(time * 9 + x) * Math.sin(time * 3.7 + z) : 0.06;
  };

  // le panneau lumineux de l'escalier, au-dessus des portes de la cage : vert, un pictogramme de marches et STAIRS
  let exitSignM = null;
  const exitSignMat = () => {
    if (exitSignM) return exitSignM;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#0d7a3a';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = '#e8fff0';
    g.lineWidth = 4;
    g.strokeRect(5, 5, 246, 86);
    // les marches
    g.fillStyle = '#f2fff6';
    g.beginPath();
    g.moveTo(18, 78);
    for (let k = 0; k < 4; k++) {
      g.lineTo(18 + k * 15, 78 - (k + 1) * 14);
      g.lineTo(18 + (k + 1) * 15, 78 - (k + 1) * 14);
    }
    g.lineTo(78, 78);
    g.closePath();
    g.fill();
    g.font = 'bold 44px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('STAIRS', 92, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    exitSignM = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffffff').multiplyScalar(1.35) });
    return exitSignM;
  };

  // Un étage entier : sol, plafond, murs, néons, meubles, cassettes, objets, ascenseur… dans un groupe à sa hauteur
  function buildFloor(map, fi) {
    const LOW0 = L0 && fi === 1; // l'étage du bas du Level 0 : ambiance d'avant (papier peint doré, lumière chaude), même moquette qu'en haut
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
    // la cage d'escalier est fermée de murs : la lumière des néons n'y entre pas, elle éclaire ses murs du dehors
    const stairSet = new Set((map.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
    const isWall = (x, z) => x < 0 || z < 0 || x >= W || z >= H || map.grid[z * W + x] === T.WALL || stairSet.has(z * W + x);
    // Level 0 : les cloisons fines (12 cm de plâtre sur l'axe de la case, voir la carte)
    const thinAt = (x, z) => {
      const p = map.pillarAt && map.pillarAt(x, z);
      return p && p.rects ? p : null;
    };
    const EDGE = !!map.thinCount;
    // Level 0 : les murs en biais des couloirs en diagonale (la moitié pleine d'une case coupée)
    const CHAMF = !!(map.chamfers && map.chamfers.length);
    const diagAt = new Map(); // case pleine d'un couloir en diagonale -> ce couloir
    for (const dg of map.diags || []) for (const [x, z] of dg.cells) diagAt.set(z * W + x, dg);
    const chamfAt = (x, z) => {
      const p = map.pillarAt && map.pillarAt(x, z);
      return p && p.poly ? p : null;
    };
    // la lumière cuite est rangée en texels alignés sur la grille : contre un mur en biais, ceux de sa moitié pleine
    // (noirs) se mêlaient au sol, une ombre en dents de scie au pied du mur. Chacun prend la valeur de son reflet de
    // l'autre côté de la face : au ras du mur, le sol ne mélange plus que de la lumière du couloir. [cible, source] …
    const chamfMirror = [];
    if (CHAMF) {
      const RBc = Math.round(CELL_SIZE / TX);
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const p = chamfAt(x, z);
          if (!p) continue;
          const f = p.face;
          for (let j = 0; j < RBc; j++) {
            for (let i = 0; i < RBc; i++) {
              const tx = x * RBc + i;
              const tz = z * RBc + j;
              const px = (tx + 0.5) * TX;
              const pz = (tz + 0.5) * TX;
              const sd = (px - f.a[0]) * f.nx + (pz - f.a[1]) * f.nz;
              if (sd >= 0) continue;
              const qx = Math.floor((px - 2 * sd * f.nx) / TX);
              const qz = Math.floor((pz - 2 * sd * f.nz) / TX);
              if (qx < 0 || qz < 0 || qx >= BW || qz >= BH) continue;
              chamfMirror.push(tz * BW + tx, qz * BW + qx);
            }
          }
        }
      }
    }
    // Level 1 : les cloisons du poste de garde, sur les bords des cases (donc des texels) : la lumière cuite ne passe
    // pas dessous, comme sous les cloisons fines du Level 0
    const SEGS = !EDGE && map.segs && map.segs.length ? map.segs : null;
    const segGap = (sg, px, pz) => {
      const ex = sg.x1 - sg.x0;
      const ez = sg.z1 - sg.z0;
      const u = Math.max(0, Math.min(1, ((px - sg.x0) * ex + (pz - sg.z0) * ez) / (ex * ex + ez * ez || 1)));
      return Math.hypot(px - sg.x0 - ex * u, pz - sg.z0 - ez * u) - GUARD_T / 2;
    };
    const shaftViews = []; // les appliques des cages d'escalier (étage du bas), éteintes pendant les coupures
    // Level 2 : deux lumières de couleurs différentes, les ampoules chaudes des galeries (rouge) et les tubes froids
    // des réserves (bleu)
    const base = new Float32Array(BW * BH);
    const live = new Float32Array(BW * BH);
    const baseB = new Float32Array(BW * BH);
    const liveB = new Float32Array(BW * BH);
    const bakeData = new Uint8Array(BW * BH * 4);
    const bakeTex = new THREE.DataTexture(bakeData, BW, BH, THREE.RGBAFormat);
    bakeTex.magFilter = THREE.LinearFilter;
    bakeTex.minFilter = THREE.LinearFilter;
    const bakeUniforms = {
      uBake: { value: bakeTex },
      uBakeScale: { value: new THREE.Vector2(1 / (W * CELL_SIZE), 1 / (H * CELL_SIZE)) },
      uBakeTX: { value: TX },
      uBakeTint: { value: L3 ? new THREE.Color(1.2, 0.92, 0.62) : L2 ? new THREE.Color(1.0, 1.05, 1.07) : L1 ? new THREE.Color(0.86, 0.98, 1.12) : PIPES ? new THREE.Color(1.25, 0.98, 0.7) : LOW0 ? new THREE.Color(1.12, 1.04, 0.8) : new THREE.Color(1.05, 1.03, 0.83) }, // Level 0 : en haut une lumière blanche à peine chaude ; en bas, la lumière chaude d'avant
      uBakeTint2: { value: PIPES ? new THREE.Color(0.78, 0.95, 1.08) : L0 ? new THREE.Color(1.2, 0.72, 0.38) : new THREE.Color(0, 0, 0) }, // Level 0 : les lampadaires des recoins calmes
      uCeilB: { value: 1 }, // la part du second canal reçue par le plafond (la phase rouge : des feux qui éclairent vers le bas)
      uBakeY: { value: -fi * FLOOR_DY },
      uCeil: { value: CEIL },
      uDamp: { value: L3 ? 0.35 : L2 ? 0 : L1 ? 0.6 : PIPES ? 0.5 : 1 },
      // Poolrooms : sous la surface, le carrelage prend la teinte de l'eau et les caustiques dansent dessus
      uPool: { value: L2 ? 1 : 0 },
      uTime: { value: 0 },
      uWaterY: { value: -0.03 },
      uWallLamps: { value: PIPES ? 1 : 0 },
      uHaze: { value: PIPES ? 0.16 : 0 },
      // Level 0 : les néons éclairent le mur presque jusqu'au sol, et les auréoles du plafond restent discrètes
      uSideLo: { value: L0 ? 0.8 : 0.5 },
      uStain: { value: L0 ? 0.5 : 1 },
      uCeilStain: { value: L0 ? 0.55 : L1 ? 0.3 : 1 }, // Level 0 : les auréoles du plafond, encore plus pâles ; Level 1 : à peine
      // Level 0, étage du haut : des murs propres (presque pas d'auréoles ni d'humidité au pied) ; le bas reste défraîchi
      // Level 1 : des parpaings repeints, à peine marqués par l'humidité
      uWallDecay: { value: L0 && !LOW0 ? 0.15 : L1 ? 0.3 : 1 },
      uGlossH: { value: L1 ? CEIL - 0.45 : 3 }, // Level 1 : la hauteur des tubes, qui se reflètent dans le béton lissé
    };
    // reflets des lampes (Level 2) : les plus proches que la caméra voit, choisies à chaque image
    const NLAMP = 12;
    const lampU = {
      uLampPos: { value: Array.from({ length: NLAMP }, () => new THREE.Vector3(0, -100, 0)) },
      uLampCol: { value: Array.from({ length: NLAMP }, () => new THREE.Vector3()) },
    };
    // Level 0 : les diffuseurs qui se reflètent dans la pellicule d'eau (x, z, taille ; couleur selon leur état) ;
    // Level 1 : les réglettes qui se reflètent dans le béton et éclairent le plafond (plus nombreuses : on voit loin)
    const NFILM = L1 ? 18 : NLAMP;
    const filmU = {
      uFilmL: { value: Array.from({ length: NFILM }, () => new THREE.Vector3(-1000, -1000, 1)) },
      uFilmC: { value: Array.from({ length: NFILM }, () => new THREE.Vector3()) },
      uFilmR: { value: new Float32Array(NFILM) }, // Level 0 : l'angle du diffuseur (couché le long d'un couloir en diagonale)
    };
    // Level 1 : les feux de couleur (gyrophares des quais, flashs des alarmes, écrans du poste), les plus proches de la
    // caméra, choisis à chaque image. P : position et portée ; C : couleur et puissance ; N : vers où il éclaire et la
    // largeur de son lobe (rien : dans tous les sens)
    const NDYN = 8;
    const NSEG = 8; // les cloisons du poste de garde (Level 1)
    const OCC_GLSL = `
// la part de la lumière d'un feu (en lp) qui arrive en p (hauteurs comptées depuis le sol), case par case
uniform sampler2D uOcc;
uniform vec4 uOccInfo;
// les cloisons du poste de garde (x0, z0, x1, z1), la boîte qui les contient, la baie de la porte et (x : fermée,
// y : hauteur de la baie)
uniform vec4 uOccSeg[${NSEG}];
uniform vec4 uOccRoom;
uniform vec4 uOccDoor;
uniform vec2 uOccDoorK;
// le trajet a → b coupe-t-il le segment s ? (t : où, le long du trajet)
bool occSegHit(vec2 a, vec2 b, vec4 s, out float t) {
  vec2 d1 = b - a;
  vec2 d2 = s.zw - s.xy;
  float den = d1.x * d2.y - d1.y * d2.x;
  t = 0.0;
  if (abs(den) < 1e-7) return false;
  vec2 w = s.xy - a;
  t = (w.x * d2.y - w.y * d2.x) / den;
  float u = (w.x * d1.y - w.y * d1.x) / den;
  return t > 0.0 && t < 1.0 && u >= 0.0 && u <= 1.0;
}
float occRoom(vec3 p, vec3 lp) {
  vec2 lo = min(p.xz, lp.xz);
  vec2 hi = max(p.xz, lp.xz);
  if (hi.x < uOccRoom.x || lo.x > uOccRoom.z || hi.y < uOccRoom.y || lo.y > uOccRoom.w) return 1.0;
  float t;
  for (int i = 0; i < ${NSEG}; i++) if (occSegHit(p.xz, lp.xz, uOccSeg[i], t)) return 0.0;
  // la porte : fermée, elle arrête tout ; ouverte, seule l'imposte au-dessus de la baie
  if (occSegHit(p.xz, lp.xz, uOccDoor, t) && (uOccDoorK.x > 0.5 || mix(p.y, lp.y, t) > uOccDoorK.y)) return 0.0;
  return 1.0;
}
// ce qu'une case garde de la lumière qui la traverse entre t0 et t1 (a : départ, d : trajet, en cases)
float occCell(ivec2 c, vec2 a, vec2 d, float t0, float t1, vec3 p, vec3 lp, bool slabOnly) {
  vec4 o = texelFetch(uOcc, c, 0);
  if (o.r < 0.01 || slabOnly && o.a < 0.25) return 1.0;
  float y0 = mix(p.y, lp.y, t0);
  float y1 = mix(p.y, lp.y, t1);
  if (o.a > 0.25) {
    // une tôle mince au milieu de la case (le rideau d'un quai) : on ne la rencontre qu'en passant de l'autre côté
    // de son plan, à la hauteur où on le traverse
    bool alongZ = o.a > 0.75;
    float u0 = (alongZ ? a.x + d.x * t0 : a.y + d.y * t0) - (alongZ ? float(c.x) : float(c.y)) - 0.5;
    float u1 = (alongZ ? a.x + d.x * t1 : a.y + d.y * t1) - (alongZ ? float(c.x) : float(c.y)) - 0.5;
    if (u0 * u1 > 0.0) return 1.0;
    y0 = y1 = mix(y0, y1, clamp(u0 / (u0 - u1 + 1e-5), 0.0, 1.0));
  }
  if (max(y0, y1) > o.b * uOccInfo.y && min(y0, y1) < o.g * uOccInfo.y) return 1.0 - o.r;
  return 1.0;
}
float occVis(vec3 p, vec3 lp) {
  // (les cloisons du poste comptent même en qualité basse : la lumière des écrans ne passe pas les murs)
  float room = occRoom(p, lp);
  if (room < 0.5 || uOccInfo.w < 0.5) return room;
  vec2 a = p.xz / uOccInfo.x;
  vec2 b = lp.xz / uOccInfo.x;
  ivec2 c = ivec2(floor(a));
  ivec2 ce = ivec2(floor(b));
  vec2 d = b - a;
  if (c == ce) return occCell(c, a, d, 0.0, 1.0, p, lp, true);
  vec2 inv = 1.0 / max(abs(d), vec2(1e-5));
  ivec2 st = ivec2(d.x >= 0.0 ? 1 : -1, d.y >= 0.0 ? 1 : -1);
  vec2 tMax = vec2(d.x >= 0.0 ? float(c.x) + 1.0 - a.x : a.x - float(c.x), d.y >= 0.0 ? float(c.y) + 1.0 - a.y : a.y - float(c.y)) * inv;
  // la case de départ : seule une tôle y compte (le point peut être sous la baie d'un quai, derrière le rideau ; à
  // la surface d'un mur, il ne se fait pas d'ombre)
  float vis = occCell(c, a, d, 0.0, min(min(tMax.x, tMax.y), 1.0), p, lp, true);
  for (int k = 0; k < 14; k++) {
    if (vis < 0.01) return 0.0;
    float t0;
    if (tMax.x < tMax.y) { t0 = tMax.x; c.x += st.x; tMax.x += inv.x; }
    else { t0 = tMax.y; c.y += st.y; tMax.y += inv.y; }
    if (t0 >= 1.0) break;
    float t1 = min(min(tMax.x, tMax.y), 1.0);
    // (dans la case du feu, seule une tôle compte : un feu n'est jamais dans un mur)
    vis *= occCell(c, a, d, t0, t1, p, lp, c == ce);
    if (c == ce) break;
  }
  return vis;
}
`;
    const dynList = [];
    const dynU = {
      uDynP: { value: Array.from({ length: NDYN }, () => new THREE.Vector4(0, -100, 0, 0.001)) },
      uDynC: { value: Array.from({ length: NDYN }, () => new THREE.Vector3()) },
      uDynN: { value: Array.from({ length: NDYN }, () => new THREE.Vector4()) },
    };
    // leurs ombres : la grille des cases, parcourue case par case du point éclairé jusqu'au feu. Rouge : la part de
    // lumière arrêtée (mur, pilier : tout ; étagère chargée : la moitié) ; vert et bleu : le haut et le bas de ce qui
    // bloque (en part du plafond) ; alpha : une tôle mince au milieu de la case (le rideau d'un quai, sous son linteau ;
    // 128 : la tôle court le long de x, 255 : le long de z)
    const occData = L1 ? new Uint8Array(W * H * 4) : null;
    const occTex = L1 ? new THREE.DataTexture(occData, W, H, THREE.RGBAFormat) : null;
    if (L1) {
      const SHELF_TOP = Math.min(CEIL - 0.5, 3.4) / CEIL;
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const t = map.grid[z * W + x];
          const i = (z * W + x) * 4;
          if (t === T.WALL) occData.set([255, 255, 0, 0], i);
          else if (t === T.SHELF) occData.set([128, Math.round(SHELF_TOP * 255), 0, 0], i);
        }
      }
      occTex.magFilter = occTex.minFilter = THREE.NearestFilter;
      occTex.needsUpdate = true;
      dynU.uOcc = { value: occTex };
      dynU.uOccInfo = { value: new THREE.Vector4(CELL_SIZE, CEIL, W, 1) }; // (w : 0 en qualité basse, sans ombres)
      // les cloisons du poste de garde (vides : des segments nuls, une boîte qui ne contient rien)
      const segs = (map.segs || []).slice(0, NSEG);
      dynU.uOccSeg = { value: Array.from({ length: NSEG }, (_, i) => (segs[i] ? new THREE.Vector4(segs[i].x0, segs[i].z0, segs[i].x1, segs[i].z1) : new THREE.Vector4())) };
      const R = map.post && map.post.room;
      dynU.uOccRoom = { value: R && segs.length ? new THREE.Vector4(R.x0 - 0.3, R.z0 - 0.3, R.x1 + 0.3, R.z1 + 0.3) : new THREE.Vector4(1e9, 1e9, -1e9, -1e9) };
      const gd = map.guardDoor;
      const gh = gd ? gd.w / 2 : 0;
      dynU.uOccDoor = { value: gd ? (gd.nx ? new THREE.Vector4(gd.x, gd.z - gh, gd.x, gd.z + gh) : new THREE.Vector4(gd.x - gh, gd.z, gd.x + gh, gd.z)) : new THREE.Vector4() };
      dynU.uOccDoorK = { value: new THREE.Vector2(1, gd ? gd.h : 0) };
    }
    // les quais : leur rideau ferme la baie jusqu'en bas de sa course, le linteau au-dessus (refait quand il bouge)
    const occDocks = () => {
      let dirty = false;
      for (const d of map.docks || []) {
        const o = d.broken ? Math.min(d.o, 0.86) : d.o;
        const lo = Math.round(Math.min(1, (o * DOCK_H) / CEIL) * 255);
        for (const [gx, gz] of d.cells) {
          const i = (gz * W + gx) * 4;
          if (occData[i] === 255 && occData[i + 2] === lo) continue;
          occData.set([255, 255, lo, d.vert ? 255 : 128], i);
          dirty = true;
        }
      }
      if (dirty) occTex.needsUpdate = true;
    };
    // un texel est-il éclairé par ce néon ? Le rayon ne doit traverser aucun mur, sauf, pour un texel de mur,
    // les 70 premiers centimètres de son propre mur (la face tournée vers le néon)
    const seen = (lx, lz, px, pz) => {
      const gx = Math.floor(px / CELL_SIZE);
      const gz = Math.floor(pz / CELL_SIZE);
      // un texel dans la moitié pleine d'une case coupée en biais : comme pour un mur droit, les 70 premiers
      // centimètres derrière la face prennent la lumière de la face (sinon le mur en biais se marbre d'ombre)
      if (CHAMF) {
        const c = chamfAt(gx, gz);
        const f = c && c.face;
        const sd = f ? (px - f.a[0]) * f.nx + (pz - f.a[1]) * f.nz : 0;
        if (sd < 0) {
          if (sd < -0.7) return false;
          px += f.nx * (0.02 - sd);
          pz += f.nz * (0.02 - sd);
        }
      }
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
      // Poolrooms : la lumière ne traverse pas les cloisons minces entre deux salles
      return inOwn < 0.7 && !(map.lightBlocked && map.lightBlocked(lx, lz, px, pz));
    };
    // les néons des zones claires éclairent plus fort et plus loin
    // o (facultatif) : { r, fall, gain } imposés (les feux de secours de la phase rouge)
    const footprint = (l, o = null) => {
      const out = [];
      // Level 0 : les zones claires baignent dans la lumière des néons (comme dans les vidéos), sans flaque ni trou noir
      const LB = L0 && l.bright;
      // (Level 1 : des réglettes de 2 × 36 W, qui portent plus loin qu'un pavé de néon)
      const LR = o ? o.r : LB ? LIGHT_R * CELL_SIZE * 2.3 : l.bright ? LIGHT_R * CELL_SIZE * 1.55 : l.kind === 'bulb' ? 2.2 * CELL_SIZE : l.kind === 'tube' ? 2.3 * CELL_SIZE : LIGHT_R * CELL_SIZE * (L0 ? 1.15 : L1 ? 1.2 : 1);
      const gain = o ? o.gain : LB ? 1.42 : l.bright ? 1.3 : l.kind === 'bulb' ? 1.05 : l.kind === 'tube' ? 1.45 : L0 ? 0.97 : 1; // Level 0 : l'image environ 10 % moins lumineuse qu'au réglage du 7 novembre (la courbe du caméscope compresse : il faut baisser plus les néons)
      const fall = o ? o.fall : LB ? 1.5 : L1 ? 2.2 : 2.4;
      // Level 1 : la réglette n'est pas un point mais deux tubes de 1,5 m (le long de x) : sa flaque s'allonge d'autant
      const HX = L1 && !o ? 0.6 : 0;
      const r = Math.ceil(LR / TX);
      const rx = Math.ceil((LR + HX) / TX);
      const tx0 = Math.floor(l.x / TX);
      const tz0 = Math.floor(l.z / TX);
      for (let tz = tz0 - r; tz <= tz0 + r; tz++) {
        for (let tx = tx0 - rx; tx <= tx0 + rx; tx++) {
          if (tx < 0 || tz < 0 || tx >= BW || tz >= BH) continue;
          const px = (tx + 0.5) * TX;
          const pz = (tz + 0.5) * TX;
          const d = Math.hypot(Math.max(Math.abs(px - l.x) - HX, 0), pz - l.z);
          if (d > LR || !seen(l.x, l.z, px, pz)) continue;
          out.push(tz * BW + tx, Math.pow(1 - d / LR, fall) * 1.05 * gain);
        }
      }
      return out;
    };
    const addPrint = (arr, fp, k) => {
      for (let i = 0; i < fp.length; i += 2) arr[fp[i]] += fp[i + 1] * k;
    };
    const chan = (l) => (l.kind === 'tube' && PIPES ? 1 : 0); // 1 : le canal bleu (lumière froide)
    // l'empreinte de chaque lampe est gardée : au Level 2, un secteur qui saute ou se rallume refait la somme
    const fpOf = (l) => l.bakeFp || (l.bakeFp = footprint(l));
    let flickers = [];
    const sumLights = () => {
      base.fill(0);
      baseB.fill(0);
      for (const l of map.lights) if (l.state === 'on') addPrint(chan(l) ? baseB : base, fpOf(l), 1);
      flickers = map.lights.filter((l) => l.state === 'flicker').map((l) => ({ l, k: 1, fp: fpOf(l), ch: chan(l), calm: Math.random() * 4, burst: 0 }));
    };
    sumLights();
    let lightGen = map.lightGen || 0;
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
          // et au pied des cloisons fines
          if (SEGS) for (const sg of SEGS) d = Math.min(d, Math.max(0, segGap(sg, px, pz)));
          if (EDGE || CHAMF) {
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const p = thinAt(gx + dx, gz + dz) || (CHAMF && chamfAt(gx + dx, gz + dz));
                if (p) d = Math.min(d, pillarDist(p, px, pz));
              }
            }
          }
        }
        const t = d / AO_R;
        bakeData[(tz * BW + tx) * 4 + 1] = Math.round((0.42 + 0.58 * t * t * (3 - 2 * t)) * 255);
      }
    }
    for (let i = 0; i < chamfMirror.length; i += 2) bakeData[chamfMirror[i] * 4 + 1] = bakeData[chamfMirror[i + 1] * 4 + 1];
    // Les cloisons fines tombent sur des bords de texels (l'axe d'une case). Chaque texel note dans l'alpha les bords
    // que barre une cloison (1 : -x, 2 : +x, 4 : -z, 8 : +z) et, en seizièmes, sa proximité d'une cloison (3 : contre,
    // 2 et 1 : à un et deux texels) : le shader ne mélange pas la lumière à travers (elle passait dessous sur 30 cm) et
    // ne flou plus le plafond par-dessus
    if (EDGE || SEGS) {
      const flags = new Uint8Array(BW * BH);
      const mark = (tx, tz, bit) => {
        if (tx >= 0 && tz >= 0 && tx < BW && tz < BH) flags[tz * BW + tx] |= bit;
      };
      const edgeOf = (v) => Math.abs(v / CELL_SIZE - Math.round(v / CELL_SIZE)) < 1e-6; // sur une limite de cases
      // (les cloisons du poste : des rectangles de largeur nulle, sur leur ligne)
      const lists = SEGS ? [SEGS.map((sg) => [Math.min(sg.x0, sg.x1), Math.min(sg.z0, sg.z1), Math.max(sg.x0, sg.x1), Math.max(sg.z0, sg.z1)])] : [];
      if (EDGE) {
        for (let gz = 0; gz < H; gz++) {
          for (let gx = 0; gx < W; gx++) {
            const p = thinAt(gx, gz);
            if (p) lists.push(p.rects);
          }
        }
      }
      for (const r of lists.flat()) {
        const alongX = r[2] - r[0] >= r[3] - r[1];
        // a0, a1 : l'étendue le long de la cloison ; line : sa ligne (un bord de texels)
        const a0 = alongX ? r[0] : r[1];
        const a1 = alongX ? r[2] : r[3];
        const line = Math.round((alongX ? r[1] + r[3] : r[0] + r[2]) / 2 / TX);
        // un bout contre une autre case : le texel d'au-delà aussi (la face du mur voisin, à la jonction)
        const t0 = Math.floor(a0 / TX) - (edgeOf(a0) ? 1 : 0);
        const t1 = Math.ceil(a1 / TX) + (edgeOf(a1) ? 1 : 0);
        for (let t = t0; t < t1; t++) {
          const cover = Math.min(a1, (t + 1) * TX) - Math.max(a0, t * TX);
          if (cover < TX * 0.5 && !((edgeOf(a0) && t === t0) || (edgeOf(a1) && t === t1 - 1))) continue;
          if (alongX) {
            mark(t, line - 1, 8);
            mark(t, line, 4);
          } else {
            mark(line - 1, t, 2);
            mark(line, t, 1);
          }
        }
      }
      for (let tz = 0; tz < BH; tz++) {
        for (let tx = 0; tx < BW; tx++) {
          let near = 0;
          for (let dz = -2; dz <= 2 && near < 3; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const x = tx + dx;
              const z = tz + dz;
              if (x < 0 || z < 0 || x >= BW || z >= BH || !(flags[z * BW + x] & 15)) continue;
              near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dz)));
            }
          }
          bakeData[(tz * BW + tx) * 4 + 3] = ((flags[tz * BW + tx] & 15) + near * 16) * 4;
        }
      }
    }
    // power : 1 néons allumés, 0 coupure de courant (seule reste une lueur à peine visible)
    let power = 1;
    // Level 0, toutes les cassettes trouvées : la phase rouge. Plus aucune lumière blanche : les néons s'éteignent. Dans
    // chaque zone de 8,75 m de côté (zone) qui a un plafonnier, un seul devient un feu de secours rouge, même un néon
    // grillé (le feu de secours a sa batterie) : aucune région ne reste dans le noir pour de bon. Chaque feu éclaire
    // comme un néon ordinaire, même dans les zones claires, et il est à bout de souffle. Chacun vit à son rythme,
    // sans régularité : éteint un moment, il tente de se rallumer en claquant (allumé, éteint, sans entre-deux), tient
    // parfois une seconde, puis lâche de nouveau ; il lui arrive de rester à demi allumé. Le noir domine. Sa lumière
    // tombe vers le sol et éclaire peu le plafond (ceil). De temps en temps tout se coupe d'un coup, puis se rallume en
    // hoquetant. La lumière rouge passe par le second canal de la lumière cuite (liveB, teinte tint).
    // alarm : un par feu rouge
    let alarm = null;
    // juste avant la phase rouge, l'annonce : les néons s'éteignent un à un en vague qui arrive sur le joueur, puis le
    // noir complet un instant. casc : { live (la lumière qui reste), list : [[instant, néon, force]…], i, t, dark, end }
    let casc = null;
    // reach : la lumière d'un feu porte un quart plus loin qu'un néon ordinaire et s'éteint en pente douce (fall), sans
    // bord net
    const RED = { zone: 8.75, level: [0.65, 1], tint: [0.66, 0.038, 0.024], ceil: 0.22, reach: { r: LIGHT_R * CELL_SIZE * 1.15 * 1.28, fall: 1.65, gain: 0.9 } };
    const alarmOf = new Map();
    let redGlow = null; // les halos des feux rouges : [lueur au plafond, cône de lumière]
    let redDust = null; // la poussière qui flotte dans les cônes (un nuage de points, MOTES par feu)
    const MOTES = 260;
    const redU = { uRedT: { value: 0 } }; // l'horloge des halos : grésillement, volutes, poussière
    const nookLamps = []; // Level 0 : les lampadaires des recoins calmes (second canal, teinte chaude), { fp, k }
    const writeBake = () => {
      if (alarm) {
        live.fill(0);
        liveB.fill(0);
        for (const a of alarm) if (a.v > 0.01) addPrint(liveB, a.fp, a.v);
      } else if (casc) {
        live.set(casc.live);
        liveB.fill(0);
        if (!casc.dark) for (const v of nookLamps) if (v.k > 0.01) addPrint(liveB, v.fp, v.k);
      } else {
        live.set(base);
        liveB.set(baseB);
        for (const f of flickers) if (f.k > 0) addPrint(f.ch ? liveB : live, f.fp, f.k);
        for (const v of nookLamps) if (v.k > 0.01) addPrint(liveB, v.fp, v.k);
      }
      for (let i = 0; i < BW * BH; i++) {
        const v = Math.min(1, (L2 || PIPES ? 0.03 : L3 ? 0.09 : AMBIENT) * (power ? 1 : 0.25) + live[i] * 0.3 * power); // stocké à moitié : jusqu'à 2 de lumière
        bakeData[i * 4] = Math.round(v * 255);
        if (PIPES || alarm || nookLamps.length) bakeData[i * 4 + 2] = Math.round(Math.min(1, liveB[i] * 0.3 * power) * 255);
      }
      for (let i = 0; i < chamfMirror.length; i += 2) {
        bakeData[chamfMirror[i] * 4] = bakeData[chamfMirror[i + 1] * 4];
        bakeData[chamfMirror[i] * 4 + 2] = bakeData[chamfMirror[i + 1] * 4 + 2];
      }
      bakeTex.needsUpdate = true;
    };
    writeBake();
    // lumière reçue en un point (pour l'exposition automatique du caméscope)
    const lightAt = (x, z) => {
      const tx = Math.floor(x / TX);
      const tz = Math.floor(z / TX);
      if (tx < 0 || tz < 0 || tx >= BW || tz >= BH) return 0;
      return power ? live[tz * BW + tx] + liveB[tz * BW + tx] : 0;
    };

    // ajoute la lumière cuite de cet étage à un matériau Lambert (ou Phong). Au Level 2, opts.spec ajoute les reflets
    // des lampes voisines (carrelage émaillé, béton ciré, métal) : spec leur force, gloss leur netteté ; sur un
    // matériau à relief, seules les parties hautes du relief brillent (les carreaux, pas les joints)
    // Au Level 2, opts.grime salit les murs (coulures de rouille, crasse en plaques, pied du mur), opts.tile (la
    // hauteur d'une rangée de carreaux) fait tomber ou remplacer quelques carreaux ; tous les matériaux du niveau
    // baignent dans une brume que les lampes éclairent
    const baked = (mat, opts = null) => {
      const spec = PIPES && opts && opts.spec > 0;
      const grime = PIPES && opts && opts.grime;
      const tile = PIPES && opts && opts.tile;
      const specU = spec ? { uSpecK: { value: opts.spec }, uGloss: { value: opts.gloss || 40 }, uSpecMask: { value: opts.mask ?? (mat.bumpMap ? 1 : 0) } } : null;
      const tileU = tile ? { uTileRow: { value: opts.tile } } : null;
      const base = opts && opts.base; // une plinthe au pied du mur
      const film = L0 && opts && opts.film; // la pellicule d'eau au cœur des grosses taches (le sol du Level 0)
      const gloss = L1 && opts && opts.gloss; // le béton lissé du Level 1, où se reflètent les réglettes
      const bump = L1 && opts && opts.bump; // Level 1 : un relief (les joints des parpaings) que prennent aussi les feux de couleur
      const wall1 = L1 && opts && opts.wall1; // les murs du Level 1 : la poussière et la suie sous le plafond
      const push = opts && opts.push; // les murs en biais : la lumière lue un peu devant eux, dans le couloir (pas au coin des cases)
      if (spec || PIPES || base || EDGE || SEGS || film || gloss || L1 || push) mat.customProgramCacheKey = () => 'bk' + (push ? '-push' : '') + (spec ? '-spec' : '') + (grime ? '-grime' : '') + (tile ? '-tile' : '') + (PIPES ? '-pipes' : '') + (base ? '-base' : '') + (EDGE || SEGS ? '-edge' : '') + (film ? '-film' : '') + (gloss ? '-gloss' : '') + (L1 ? '-dyn' : '') + (bump ? '-bump' : '') + (wall1 ? '-wall1' : '');
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, bakeUniforms);
        if (L1) {
          Object.assign(sh.uniforms, dynU);
          sh.defines = { ...(sh.defines || {}), BK_DYN: 1 };
        }
        if (film) {
          Object.assign(sh.uniforms, filmU);
          sh.defines = { ...(sh.defines || {}), BK_FILM: 1 };
        }
        if (gloss) {
          Object.assign(sh.uniforms, filmU);
          sh.defines = { ...(sh.defines || {}), BK_GLOSS: 1 };
        }
        if (spec) {
          Object.assign(sh.uniforms, lampU, specU);
          sh.defines = { ...(sh.defines || {}), BK_SPEC: 1 };
        }
        if (grime) sh.defines = { ...(sh.defines || {}), BK_GRIME: 1 };
        if (bump) sh.defines = { ...(sh.defines || {}), BK_BUMP: 1 };
        if (wall1) sh.defines = { ...(sh.defines || {}), BK_WALL1: 1 };
        if (tile) {
          Object.assign(sh.uniforms, tileU);
          sh.defines = { ...(sh.defines || {}), BK_TILE: 1 };
        }
        if (PIPES) sh.defines = { ...(sh.defines || {}), BK_PIPES: 1 };
        if (base) sh.defines = { ...(sh.defines || {}), BK_BASE: 1 };
        if (push) sh.defines = { ...(sh.defines || {}), BK_PUSH: push.toFixed(3) };
        if (EDGE || SEGS) sh.defines = { ...(sh.defines || {}), BK_EDGE: 1 };
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
uniform float uBakeTX;
uniform vec3 uBakeTint;
uniform vec3 uBakeTint2;
uniform float uCeilB;
#ifdef BK_SPEC
uniform vec3 uLampPos[${NLAMP}];
uniform vec3 uLampCol[${NLAMP}];
uniform float uSpecK;
uniform float uGloss;
uniform float uSpecMask;
#endif
uniform float uBakeY;
uniform float uCeil;
uniform float uDamp;
uniform float uPool;
uniform float uTime;
uniform float uWaterY;
uniform float uHaze;
uniform float uSideLo;
uniform float uStain;
uniform float uCeilStain;
uniform float uWallDecay;
#ifdef BK_TILE
uniform float uTileRow;
#endif
#if defined(BK_FILM) || defined(BK_GLOSS)
uniform vec3 uFilmL[${NFILM}];
uniform vec3 uFilmC[${NFILM}];
uniform float uFilmR[${NFILM}];
#endif
uniform float uGlossH;
#ifdef BK_DYN
uniform vec4 uDynP[${NDYN}];
uniform vec3 uDynC[${NDYN}];
uniform vec4 uDynN[${NDYN}];
// la part d'un feu de couleur qui arrive en p (portée, recul en 1/d², lobe), sans l'angle de la surface
float bkDyn(int i, vec3 p, out vec3 dl) {
  vec3 dv = uDynP[i].xyz - p;
  float dd = length(dv);
  dl = dv / max(dd, 0.001);
  float r = uDynP[i].w;
  if (dd >= r) return 0.0;
  float fall = 1.0 - dd / r;
  float att = fall * fall / (1.0 + dd * dd * 0.18);
  if (dot(uDynN[i].xyz, uDynN[i].xyz) > 0.25) att *= smoothstep(uDynN[i].w - 0.3, uDynN[i].w + 0.3, dot(-dl, uDynN[i].xyz));
  return att;
}
${OCC_GLSL}
#endif
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
// l'humidité du sol : un hachage entier, refait à l'identique par le jeu (wetField) pour savoir où l'on marche dans l'eau
float bkHashW(vec2 p) {
  uvec2 q = uvec2(ivec2(p) + 4096);
  uint h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
  h ^= h >> 16;
  h *= 2246822519u;
  h ^= h >> 13;
  h *= 3266489917u;
  h ^= h >> 16;
  return float(h) / 4294967295.0;
}
float bkNoiseW(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bkHashW(i), bkHashW(i + vec2(1.0, 0.0)), f.x), mix(bkHashW(i + vec2(0.0, 1.0)), bkHashW(i + vec2(1.0, 1.0)), f.x), f.y);
}
float bkFbmW(vec2 p) { return bkNoiseW(p) * 0.55 + bkNoiseW(p * 2.13 + 7.1) * 0.3 + bkNoiseW(p * 4.7 + 3.3) * 0.15; }
// caustiques : le réseau lumineux que l'eau projette sur le fond
float bkCaust(vec2 uv, float t) {
  vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
` +
          sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // les néons sont au plafond : un mur s'assombrit vers le bas, et plus encore au ras du sol et sous le plafond ;
          // le sol et le plafond s'assombrissent au pied des murs
          vec2 bkUv = vBakeP.xz * uBakeScale;
          #ifdef BK_PUSH
          bkUv = (vBakeP.xz + vBakeN.xz * BK_PUSH) * uBakeScale;
          #endif
          float bkNear = 0.0; // près d'une cloison fine : 1 contre elle, 0 à trois texels et plus
          #ifdef BK_EDGE
          {
            // une cloison fine sur un bord du texel : on ne lit pas la lumière de l'autre côté
            vec2 bkT = vBakeP.xz / uBakeTX;
            vec2 bkI = floor(bkT);
            vec2 bkF = bkT - bkI;
            float bkA = floor(texture2D(uBake, (bkI + 0.5) * uBakeTX * uBakeScale).a * 63.75 + 0.5);
            float bkE = mod(bkA, 16.0);
            bkNear = floor(bkA / 16.0) / 3.0;
            if (bkE > 0.5) {
              if (mod(bkE, 2.0) > 0.5) bkF.x = max(bkF.x, 0.5);
              if (mod(floor(bkE * 0.5), 2.0) > 0.5) bkF.x = min(bkF.x, 0.5);
              if (mod(floor(bkE * 0.25), 2.0) > 0.5) bkF.y = max(bkF.y, 0.5);
              if (bkE > 7.5) bkF.y = min(bkF.y, 0.5);
              bkUv = (bkI + bkF) * uBakeTX * uBakeScale;
            }
          }
          #endif
          vec4 bk = texture2D(uBake, bkUv);
          float by = vBakeP.y - uBakeY;
          float ny = vBakeN.y;
          // le plafond n'est éclairé que par ricochet (les néons y sont encastrés) : sa lumière est très adoucie, sans les
          // ombres nettes en escalier de la grille d'éclairage (elles faisaient des plaques noires crénelées)
          if (ny < -0.5) {
            vec2 o1 = uBakeScale * 0.9;
            vec2 o2 = uBakeScale * 1.8;
            vec2 bkAcc = bk.rb * 3.0;
            bkAcc += texture2D(uBake, bkUv + vec2(o1.x, 0.0)).rb + texture2D(uBake, bkUv - vec2(o1.x, 0.0)).rb;
            bkAcc += texture2D(uBake, bkUv + vec2(0.0, o1.y)).rb + texture2D(uBake, bkUv - vec2(0.0, o1.y)).rb;
            bkAcc += texture2D(uBake, bkUv + o1 * 0.7).rb + texture2D(uBake, bkUv - o1 * 0.7).rb;
            bkAcc += texture2D(uBake, bkUv + vec2(o1.x, -o1.y) * 0.7).rb + texture2D(uBake, bkUv + vec2(-o1.x, o1.y) * 0.7).rb;
            bkAcc += (texture2D(uBake, bkUv + vec2(o2.x, 0.0)).rb + texture2D(uBake, bkUv - vec2(o2.x, 0.0)).rb + texture2D(uBake, bkUv + vec2(0.0, o2.y)).rb + texture2D(uBake, bkUv - vec2(0.0, o2.y)).rb) * 0.5;
            bk.rb = mix(bkAcc / 13.0, bk.rb, bkNear); // pas de flou à travers une cloison fine
          }
          float side = mix(uSideLo, 1.12, smoothstep(0.0, uCeil, by)) * mix(uSideLo * 0.85, 1.0, smoothstep(0.0, 0.4, by)) * mix(0.72, 1.0, smoothstep(0.0, 0.3, uCeil - by));
          float flat2 = ny > 0.0 ? bk.g : mix(0.7, 1.0, bk.g) * 0.85;
          float shape = mix(side, flat2, smoothstep(0.5, 0.8, abs(ny)));
          #ifdef BK_PIPES
          // le fond des caissons de la dalle, loin des lampes, reste plus sombre que le dessous des poutres
          if (ny < -0.5) shape *= mix(0.62, 1.15, smoothstep(0.0, 0.26, uCeil - by));
          #endif
          // humidité : la moquette détrempée par plaques, l'eau qui remonte au pied des murs
          // (des plaques éparses, environ un dixième du sol, déformées par un second bruit : des bords déchiquetés, jamais des ronds)
          vec2 wq = vBakeP.xz * 0.17 + 11.0;
          float wF = bkFbmW(wq + (vec2(bkFbmW(wq * 3.1 + 2.0), bkFbmW(wq * 3.1 + 9.0)) - 0.5) * 1.1);
          float wet = smoothstep(0.62, 0.8, wF) * uDamp;
          float rise = (1.0 - smoothstep(0.05, 0.45 + bkFbm(vBakeP.xz * 0.9 + vBakeP.y) * 0.5, by)) * smoothstep(0.3, 0.7, bkFbm(vBakeP.xz * 0.3 + 5.0)) * uDamp * uWallDecay;
          // auréoles d'eau sur les murs : un cerne plus foncé autour d'une tache pâle
          float n2 = bkFbm(vec2(vBakeP.x + vBakeP.z * 0.37, vBakeP.y + vBakeP.z) * 0.45 + 31.0);
          float ring = smoothstep(0.6, 0.66, n2) * (1.0 - smoothstep(0.68, 0.75, n2)) * 0.8 + smoothstep(0.66, 0.75, n2) * 0.3;
          // au plafond : une auréole par case au plus (une sur quatre), de forme irrégulière, qui ne sort jamais de sa
          // case. Les murs et les cloisons sont au bord des cases : une tache ne passe jamais d'une pièce à l'autre
          float cst = 0.0;
          if (ny < -0.5) {
            vec2 cq = vBakeP.xz / ${CELL_SIZE.toFixed(3)};
            vec2 ci = floor(cq);
            if (bkHash(ci + 41.3) < 0.26) {
              vec2 cc = ci + 0.5 + (vec2(bkHash(ci + 3.1), bkHash(ci + 8.7)) - 0.5) * 0.16;
              float ca = bkHash(ci + 2.9) * 6.2832;
              vec2 dv = mat2(cos(ca), sin(ca), -sin(ca), cos(ca)) * (cq - cc);
              dv /= (0.15 + 0.13 * bkHash(ci + 5.3)) * vec2(1.0, 0.7 + 0.3 * bkHash(ci + 6.1)); // 37 à 70 cm, ovale
              float d = length(dv) + (bkFbm(cq * 3.4 + ci * 1.7) - 0.5) * 0.55;
              float s = 1.0 - d;
              cst = smoothstep(-0.06, 0.02, s) * (1.0 - smoothstep(0.04, 0.16, s)) * 0.8 + smoothstep(0.02, 0.2, s) * 0.3;
            }
          }
          float stain = ny < -0.5 ? cst * uCeilStain : (abs(ny) < 0.5 ? ring * 0.6 * uWallDecay : 0.0);
          diffuseColor.rgb *= mix(1.0, 0.62, ny > 0.5 ? wet : (abs(ny) < 0.5 ? rise : 0.0));
          #ifdef BK_FILM
          if (ny > 0.5) {
            // au cœur des plus grosses taches, une fine pellicule d'eau : la moquette noyée, plus sombre, qui reflète le
            // plafond, les néons (ou les feux rouges) et la lampe torche ; vers le bord, des poils la percent
            float film = smoothstep(0.8, 0.835, wF) * uDamp;
            film *= smoothstep(0.3, 0.55, bkNoise(vBakeP.xz * 11.0) * 0.5 + 0.25 + (wF - 0.8) * 9.0);
            if (film > 0.001) {
              vec3 fE = cameraPosition - vBakeP;
              float fLen = length(fE);
              float fEy = max(fE.y, 0.04);
              // l'eau reflète peu vue d'en haut, beaucoup en rasant (Fresnel)
              float fFr = 0.03 + 0.97 * pow(1.0 - clamp(fEy / fLen, 0.0, 1.0), 5.0);
              // la surface n'est pas tout à fait plane : de petites ondulations brouillent le reflet, d'autant plus que le
              // plafond reflété est loin
              vec2 fRip = (vec2(bkNoise(vBakeP.xz * 5.0 + 3.0), bkNoise(vBakeP.xz * 5.0 + 41.0)) - 0.5) * 0.06;
              float fPath = (uCeil - by) * fLen / fEy;
              vec2 fHit = vBakeP.xz - fE.xz * ((uCeil - by) / fEy) + fRip * 2.0 * min(fPath, 14.0);
              // le plafond vu dans l'eau : la lumière qu'il reçoit là où le rayon réfléchi le touche
              vec4 fB = texture2D(uBake, clamp(fHit * uBakeScale, 0.0, 1.0));
              vec3 fRef = (uBakeTint * fB.r + uBakeTint2 * fB.b * uCeilB) * vec3(0.78, 0.72, 0.55) * 0.42; // les dalles crème du plafond
              // les diffuseurs eux-mêmes : nets de près, brouillés de loin, une petite auréole autour
              float fBlur = 0.03 + fPath * 0.018;
              for (int i = 0; i < ${NFILM}; i++) {
                vec2 fdv = fHit - uFilmL[i].xy;
                float fcR = cos(uFilmR[i]);
                float fsR = sin(uFilmR[i]);
                vec2 fq = abs(vec2(fdv.x * fcR - fdv.y * fsR, fdv.x * fsR + fdv.y * fcR)) - vec2(0.61, 0.31) * uFilmL[i].z;
                float fd = max(fq.x, fq.y);
                fRef += uFilmC[i] * ((1.0 - smoothstep(-fBlur, fBlur, fd)) * 3.0 + exp(-max(fd, 0.0) / (0.2 + fBlur * 2.0)) * 0.18);
              }
              // la lampe torche : un reflet vif là où le faisceau tombe sur l'eau
              vec3 fS = vec3(0.0);
              #if NUM_SPOT_LIGHTS > 0
              {
                vec3 fN = normalize(mat3(viewMatrix) * normalize(vec3(fRip.x * 2.0, 1.0, fRip.y * 2.0)));
                vec3 fV = normalize(vViewPosition);
                for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
                  vec3 fLv = spotLights[i].position + vViewPosition;
                  float fLd = length(fLv);
                  vec3 fL = fLv / fLd;
                  float fC = smoothstep(spotLights[i].coneCos, spotLights[i].penumbraCos, dot(fL, spotLights[i].direction));
                  float fH = max(dot(fN, normalize(fL + fV)), 0.0);
                  fS += spotLights[i].color * fC * getDistanceAttenuation(fLd, spotLights[i].distance, spotLights[i].decay) * (pow(fH, 600.0) * 5.0 + pow(fH, 60.0) * 0.25);
                }
              }
              #endif
              diffuseColor.rgb *= mix(1.0, 0.7 * (1.0 - fFr), film);
              // l'eau, teintée par la moquette dessous, assombrit un peu ce qu'elle reflète
              totalEmissiveRadiance += (fRef * vec3(0.95, 0.88, 0.72) * fFr * 1.25 + fS * max(fFr, 0.06)) * film;
            }
          }
          #endif
          #ifdef BK_GLOSS
          if (ny > 0.5 && by < 0.05) {
            // le béton lissé du Level 1 : de grandes plaques plus ou moins claires (talochées à des jours différents), plus
            // ou moins polies par le passage ; les réglettes s'y reflètent, floues, en traînées d'autant plus longues que
            // l'on regarde loin (la surface n'est pas un miroir)
            vec2 gq = vBakeP.xz;
            float gTone = bkFbm(gq * 0.11 + 4.0);
            diffuseColor.rgb *= mix(0.88, 1.1, gTone) * mix(1.0, 0.93, smoothstep(0.55, 0.8, bkFbm(gq * 0.45 + 21.0)));
            float gPol = smoothstep(0.3, 0.72, bkFbm(gq * 0.19 + 13.0));
            vec3 gE = cameraPosition - vBakeP;
            float gLen = length(gE);
            float gEy = max(gE.y, 0.03);
            float gSin = clamp(gEy / gLen, 0.04, 1.0); // le regard rase le sol quand il est petit
            float gFr = 0.035 + 0.965 * pow(1.0 - gSin, 5.0);
            vec2 gHit = gq - gE.xz * (uGlossH / gEy); // où le rayon réfléchi coupe le plan des réglettes
            vec2 gDir = normalize(gE.xz + vec2(1e-4));
            vec2 gPerp = vec2(-gDir.y, gDir.x);
            // la rugosité : un lobe de quelques degrés autour du reflet parfait. Sur le plan des réglettes, incliner la
            // micro-surface dans l'axe du regard déplace le reflet de 2a·h / sin² ; en travers, de 2a·h seulement. D'où,
            // de loin, les longues traînées verticales sous chaque réglette, et de près (on regarde à ses pieds) des
            // reflets ronds
            float gA = mix(0.038, 0.017, gPol);
            vec2 gs = vec2(2.0 * gA * uGlossH / (gSin * gSin), 2.0 * gA * uGlossH) + 0.04;
            float gAmp = 0.28 / (0.28 + 3.1416 * gs.x * gs.y); // la part du lobe que la réglette remplit
            // le grain du béton moucheture les traînées (de près seulement : de loin, il scintillerait)
            vec2 gN = (vec2(bkNoise(gq * 9.0), bkNoise(gq * 9.0 + 17.0)) - 0.5) * (1.0 - smoothstep(6.0, 14.0, gLen));
            vec2 gHj = gHit + (gDir * gN.x * gs.x + gPerp * gN.y * gs.y) * 0.5;
            vec2 gw = abs(gDir.x) * vec2(0.78, 0.09) + abs(gDir.y) * vec2(0.09, 0.78); // la réglette, dans ce repère
            vec3 gRef = vec3(0.0);
            for (int i = 0; i < ${NFILM}; i++) {
              vec2 gd = gHj - uFilmL[i].xy;
              vec2 gk = max(abs(vec2(dot(gd, gDir), dot(gd, gPerp))) - gw, 0.0) / gs;
              gRef += uFilmC[i] * exp(-dot(gk, gk));
            }
            // (les tubes sont bien plus lumineux que ce que l'écran peut montrer : d'où le gain, qui sature en douceur)
            totalEmissiveRadiance += (1.0 - exp(-gRef * gAmp * 10.0)) * gFr * mix(0.5, 1.0, gPol) * (1.0 + wet * 1.6);
            #ifdef BK_DYN
            {
              // les feux de couleur aussi : une traînée orange sous un gyrophare, rouge sous un flash d'alarme. Chacun à sa
              // hauteur (le rayon réfléchi les croise plus ou moins loin), petits et vifs
              vec3 dRef = vec3(0.0);
              for (int i = 0; i < ${NDYN}; i++) {
                float dh = uDynP[i].y - uBakeY;
                if (uDynP[i].w < 0.01 || dh < 0.1) continue;
                vec2 dHit = gq - gE.xz * (dh / gEy);
                vec2 ds = vec2(2.0 * gA * dh / (gSin * gSin), 2.0 * gA * dh) + 0.05;
                vec2 dd = dHit - uDynP[i].xz;
                vec2 dk = vec2(dot(dd, gDir), dot(dd, gPerp)) / ds;
                // son lobe tourné vers nous, vu dans le sol (vers notre reflet sous la dalle)
                float dOn = 1.0;
                if (dot(uDynN[i].xyz, uDynN[i].xyz) > 0.25) {
                  vec3 dm = normalize(vec3(cameraPosition.x, 2.0 * uBakeY - cameraPosition.y, cameraPosition.z) - uDynP[i].xyz);
                  dOn = smoothstep(uDynN[i].w - 0.3, uDynN[i].w + 0.3, dot(dm, uDynN[i].xyz));
                }
                float dG = exp(-dot(dk, dk)) * dOn;
                // (le feu doit voir ce coin du sol : pas de reflet d'un gyrophare caché derrière le mur)
                if (dG > 0.003) dRef += uDynC[i] * dG * (0.05 / (0.05 + 3.1416 * ds.x * ds.y)) * occVis(vec3(gq.x, 0.05, gq.y), vec3(uDynP[i].x, dh, uDynP[i].z));
              }
              totalEmissiveRadiance += (1.0 - exp(-dRef * 6.0)) * gFr * mix(0.5, 1.0, gPol) * (1.0 + wet * 1.6);
            }
            #endif
          } else if (by > uGlossH) {
            // au-dessus des réglettes (plafond, poutres) : la lumière qui fuit par les fentes du réflecteur, vers le haut ;
            // elle dessine un halo ovale au plafond autour de chacune, éclaire un peu le flanc des poutres voisines, et suit
            // l'état des néons (grésillement, coupure)
            vec3 hUp = vec3(0.0);
            float hY = by - uGlossH;
            for (int i = 0; i < ${NFILM}; i++) {
              vec2 hd = vBakeP.xz - clamp(vBakeP.xz, uFilmL[i].xy - vec2(0.78, 0.07), uFilmL[i].xy + vec2(0.78, 0.07));
              vec3 hL = vec3(-hd.x, -hY, -hd.y); // du point vers la réglette
              float hD2 = dot(hL, hL) + 0.09;
              hUp += uFilmC[i] * (max(dot(vBakeN, hL), 0.0) * hY / (hD2 * hD2));
            }
            totalEmissiveRadiance += diffuseColor.rgb * hUp * 0.6;
          }
          #endif
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.66, 0.45), stain * uDamp * uStain);
          #ifdef BK_BASE
          // la plinthe : une bande de bois peint brun-jaune, un peu plus claire sur son arête du haut
          if (abs(ny) < 0.5 && by < 0.105) {
            float bWu = vBakeP.x + vBakeP.z;
            diffuseColor.rgb = vec3(0.44, 0.35, 0.2) * (0.9 + 0.1 * bkNoise(vec2(bWu * 2.0, 3.0))) * mix(1.0, 1.25, smoothstep(0.09, 0.1, by)) * mix(0.75, 1.0, smoothstep(0.0, 0.05, by));
          }
          #endif
          float bkGloss = 1.0; // ce qui ternit le reflet (crasse, carreau tombé)
          #ifdef BK_TILE
          {
            // quelques carreaux tombés (la colle grise striée reste) ou remplacés par un carreau d'une autre teinte ;
            // le calepinage : 16 carreaux par case de 2,5 m, des rangées de uTileRow depuis le haut de la plinthe
            float tu = (vBakeP.x + vBakeP.z) / 0.15625;
            float tv = (by - 0.16) / uTileRow;
            vec2 cell = floor(vec2(tu, tv));
            vec2 fr = fract(vec2(tu, tv));
            float h = bkHash(cell + vec2(abs(vBakeN.x) * 31.0, 7.0));
            float inside = step(0.04, fr.x) * step(fr.x, 0.96) * step(0.06, fr.y) * step(fr.y, 0.94);
            if (by > 0.2 && by < 2.3 && abs(ny) < 0.5) {
              if (h < 0.003) {
                float comb = 0.8 + 0.2 * step(0.5, fract(fr.x * 7.0 + fr.y * 0.6));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.34, 0.3) * comb, inside);
                bkGloss *= 1.0 - inside;
              } else if (h < 0.012) {
                diffuseColor.rgb *= mix(vec3(1.0), vec3(1.12, 1.05, 0.86), inside);
              } else if (h < 0.02) {
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.84, 0.8), inside);
              }
            }
          }
          #endif
          #ifdef BK_GRIME
          if (abs(ny) < 0.5) {
            // coulures de rouille depuis les colliers et les fuites du plafond, crasse en plaques, pied du mur noirci
            float wu = vBakeP.x + vBakeP.z;
            float col = bkNoise(vec2(wu * 7.0, 3.7));
            float reach = 0.4 + bkNoise(vec2(wu * 1.9, 8.1)) * 2.0;
            float streak = smoothstep(0.62, 0.9, col) * (1.0 - smoothstep(0.0, reach, uCeil - by)) * (0.55 + 0.6 * bkNoise(vec2(wu * 45.0, by * 1.2)));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.5, 0.34), clamp(streak, 0.0, 1.0) * 0.7);
            float blot = smoothstep(0.5, 0.82, bkFbm(vec2(wu * 0.4, by * 0.55) + 17.0));
            diffuseColor.rgb *= mix(1.0, 0.8, blot);
            float foot = 1.0 - smoothstep(0.03, 0.35 + bkNoise(vec2(wu * 1.3, 1.0)) * 0.4, by);
            diffuseColor.rgb *= mix(1.0, 0.72, foot);
            bkGloss *= 1.0 - clamp(streak, 0.0, 1.0) * 0.5 - blot * 0.3;
          }
          #endif
          #ifdef BK_WALL1
          if (abs(ny) < 0.5) {
            // Level 1 : la poussière et la suie accrochées en haut des murs, sur une hauteur qui varie le long du mur,
            // et de rares coulures grises qui en descendent ; tirées du lieu (rien ne se répète d'un pan à l'autre)
            float wu = vBakeP.x + vBakeP.z;
            float topH = 0.35 + bkFbm(vec2(wu * 0.55, 2.0)) * 1.1;
            float top = 1.0 - smoothstep(0.0, topH, uCeil - by);
            diffuseColor.rgb *= mix(1.0, 0.72, top * (0.45 + 0.55 * bkFbm(vec2(wu * 2.1, by * 1.6) + 5.0)));
            float col = bkNoise(vec2(wu * 4.3, 9.3));
            float reach = 0.5 + bkNoise(vec2(wu * 1.7, 4.1)) * 2.6;
            float streak = smoothstep(0.74, 0.94, col) * (1.0 - smoothstep(0.0, reach, uCeil - by)) * (0.45 + 0.55 * bkNoise(vec2(wu * 36.0, by * 1.4)));
            diffuseColor.rgb *= mix(1.0, 0.8, clamp(streak, 0.0, 1.0));
            // et la peinture n'est pas uniforme : des reprises au rouleau, à peine plus claires ou plus ternes
            diffuseColor.rgb *= 0.94 + 0.12 * bkFbm(vec2(wu * 0.8, by * 0.5) + 31.0);
          }
          #endif
          #ifdef BK_GLOSS
          if (ny < 0.5) {
            // Level 1 : le béton du plafond et des poutres prend ses nuances au gré du lieu (reprises de coulage, plus ou
            // moins de laitance), au lieu des taches de la photo qui revenaient tous les 2,5 m
            diffuseColor.rgb *= 0.84 + 0.28 * bkFbm(vBakeP.xz * 0.3 + vBakeP.y * 0.7 + 3.0);
          }
          #endif
          #ifdef BK_BUMP
          // le relief (les joints des parpaings) : la lumière cuite vient d'en haut, la lèvre basse d'un joint, tournée
          // vers le haut, la prend, sa lèvre haute reste dans l'ombre
          vec3 bkNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          if (abs(ny) < 0.5) shape *= 1.0 + clamp((bkNW.y - vBakeN.y) * 1.5, -0.4, 0.3);
          #else
          vec3 bkNW = vBakeN;
          #endif
          // sous l'eau (Poolrooms) : teinte cyan qui fonce avec la profondeur, et les caustiques
          float sub = uPool * smoothstep(0.0, 0.06, uWaterY - by);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.9, 0.96) * mix(1.0, 0.6, clamp((uWaterY - by) / 1.2, 0.0, 1.0)), sub);
          totalEmissiveRadiance += diffuseColor.rgb * (uBakeTint * bk.r + uBakeTint2 * bk.b * (ny < -0.5 ? uCeilB : 1.0)) * 2.0 * shape;
          #ifdef BK_DYN
          {
            vec3 dAcc = vec3(0.0);
            for (int i = 0; i < ${NDYN}; i++) {
              vec3 dl;
              float a = bkDyn(i, vBakeP, dl) * max(dot(bkNW, dl), 0.0);
              // (le point, décollé de sa surface de quelques centimètres : un mur ne se fait pas d'ombre à lui-même)
              if (a > 0.0005) dAcc += uDynC[i] * a * occVis(vec3(vBakeP.x + vBakeN.x * 0.06, vBakeP.y - uBakeY, vBakeP.z + vBakeN.z * 0.06), vec3(uDynP[i].x, uDynP[i].y - uBakeY, uDynP[i].z));
            }
            totalEmissiveRadiance += diffuseColor.rgb * dAcc;
          }
          #endif
          totalEmissiveRadiance += vec3(0.8, 1.0, 1.0) * bkCaust(vBakeP.xz * 0.32, uTime * 0.45) * 0.55 * sub * (0.35 + bk.r * 1.6);
          #ifdef BK_SPEC
          {
            // reflets des lampes : Blinn-Phong en repère caméra, avec la normale du relief
            vec3 sV = normalize(vViewPosition);
            float sm = uSpecK * bkGloss;
            #ifdef USE_BUMPMAP
              sm *= mix(1.0, smoothstep(0.76, 0.83, texture2D(bumpMap, vBumpMapUv).r), uSpecMask);
            #endif
            // le sol : plus luisant là où il est humide, mat là où la poussière s'est déposée
            if (ny > 0.5) sm *= 0.45 + wet * 1.3 + bkFbm(vBakeP.xz * 0.6 + 3.0) * 0.5;
            // pas de reflet là où aucune lampe n'éclaire (un mur caché derrière un angle)
            sm *= mix(0.25, 1.0, smoothstep(0.0, 0.12, bk.r + bk.b));
            vec3 sAcc = vec3(0.0);
            for (int i = 0; i < ${NLAMP}; i++) {
              vec3 sLd = (viewMatrix * vec4(uLampPos[i], 1.0)).xyz + vViewPosition;
              float sD2 = dot(sLd, sLd);
              vec3 sL = sLd * inversesqrt(sD2);
              float sNl = max(dot(normal, sL), 0.0);
              float sH = max(dot(normal, normalize(sL + sV)), 0.0);
              sAcc += uLampCol[i] * (pow(sH, uGloss) + 0.05 * pow(sH, uGloss * 0.1)) * sNl / (1.0 + sD2 * 0.05); // un reflet net, et son halo
            }
            totalEmissiveRadiance += sAcc * sm * (uGloss + 8.0) * 0.04;
          }
          #endif`);
        // la brume (Level 2) : le brouillard prend la couleur de la lumière de l'endroit, les lampes au loin baignent
        // dans un halo chaud au lieu de se noyer dans le noir
        if (PIPES)
          sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
            #ifdef FOG_EXP2
              float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
            #else
              float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
            #endif
            gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor + (uBakeTint * bk.r + uBakeTint2 * bk.b) * uHaze, fogFactor );
          #endif`);
      };
      return mat;
    };

    // 1. Sol en moquette humide (une répétition de texture par case, une et demie au Level 0 : les poils de la moquette
    // rase restent assez gros pour se voir à hauteur d'homme), percé des trous et des cages d'escalier
    // (Level 2 : béton ciré, luisant d'humidité, qui reflète les lampes)
    const carpet = (PIPES ? tx2.floor : textures.carpet).clone();
    carpet.needsUpdate = true;
    carpet.repeat.set(W * (L0 ? 1.5 : L1 ? 0.5 : 1), H * (L0 ? 1.5 : L1 ? 0.5 : 1)); // Level 1 : une dalle de 5 m par répétition
    if (L1) carpet.anisotropy = renderer.capabilities.getMaxAnisotropy(); // les joints restent nets jusqu'au fond des allées
    if (L0) carpet.anisotropy = renderer.capabilities.getMaxAnisotropy(); // le grain reste net jusqu'au fond des couloirs
    (PIPES ? tx2.ready : textures.ready).then(() => {
      carpet.needsUpdate = true;
    });
    const floorMat = PIPES
      ? baked(new THREE.MeshPhongMaterial({ map: carpet, specular: '#3a342a', shininess: 70 }), { spec: 1.05, gloss: 1100 })
      : baked(new THREE.MeshLambertMaterial({ map: carpet }), L0 ? { film: 1 } : L1 ? { gloss: 1 } : null);
    const holes = holesOf(map);
    if (holes.length) {
      floorMat.alphaMap = holeMask(W, H, holes, true);
      floorMat.alphaTest = 0.5;
      // les parois des trous, éclairées d'en haut : claires au bord, de plus en plus sombres en descendant. Les trous du
      // haut traversent la dalle (on voit l'étage du dessous au fond) ; les puits sans fond de l'étage du bas descendent
      // bien plus bas que ce que laisse voir l'obscurité. Au Level 0, elles prennent la teinte du papier peint de l'étage
      // (stops : une fonction de sa couleur moyenne, recalculée quand la photo du papier arrive)
      const wallCv = L0 ? (LOW0 ? textures.wallLow : textures.wall).image : null;
      const wallRGB = () => {
        const d = wallCv.getContext('2d').getImageData(0, 0, wallCv.width, wallCv.height).data;
        const m = [0, 0, 0];
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 37) {
          m[0] += d[i];
          m[1] += d[i + 1];
          m[2] += d[i + 2];
          n++;
        }
        return m.map((v) => v / n);
      };
      const shade = (rgb, k) => `rgb(${rgb.map((v) => Math.min(255, Math.round(v * k))).join(', ')})`;
      const shaftWalls = (list, depth, stops) => {
        if (!list.length) return;
        const h = depth > 10 ? 2048 : 512;
        const cv = gradCanvas(typeof stops === 'function' ? stops(wallCv && wallRGB()) : stops, h);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (typeof stops === 'function' && wallCv)
          textures.ready.then(() => {
            cv.getContext('2d').drawImage(gradCanvas(stops(wallRGB()), h), 0, 0);
            tex.needsUpdate = true;
          });
        const mat = baked(new THREE.MeshLambertMaterial({ map: tex }));
        const walls = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, depth), mat, list.length * 4);
        list.forEach((h, i) => {
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], k) => {
            dummy.position.set(h.x + dx * h.hx, -depth / 2, h.z + dz * h.hz);
            dummy.rotation.set(0, Math.atan2(-dx, -dz), 0); // la paroi regarde l'intérieur du trou
            dummy.scale.set((dx ? h.hz : h.hx) * 2, 1, 1);
            dummy.updateMatrix();
            walls.setMatrixAt(i * 4 + k, dummy.matrix);
          });
        });
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        walls.instanceMatrix.needsUpdate = true;
        group.add(walls);
      };
      const deepSet = new Set((map.pits || []).filter((p) => p.deep).map((p) => p.id));
      const deep = (map.pits || []).filter((p) => deepSet.has(p.id)).map((p) => ({ x: p.x, z: p.z, hx: PIT_HALF, hz: PIT_HALF }));
      const shallow = holes.filter((h) => !deep.some((d) => d.x === h.x && d.z === h.z));
      shaftWalls(shallow, SLAB, L0 ? (c) => [[0, shade(c, 1.1)], [0.55, shade(c, 0.8)], [1, shade(c, 0.5)]] : [[0, '#5e5434'], [1, '#5e5434']]);
      // le noir arrive dès le premier mètre : debout au bord, on ne voit que le haut de la paroi, et il plonge déjà dans l'ombre
      const DEEP_FADE = [[0, 1.1], [0.004, 0.92], [0.012, 0.56], [0.024, 0.22], [0.04, 0.06]];
      shaftWalls(deep, DEEP_DEPTH, (c) => [...DEEP_FADE.map(([at, k]) => [at, shade(c || [137, 126, 84], k)]), [0.08, '#000000'], [1, '#000000']]);
      if (deep.length) {
        // le fond, si loin qu'on ne le voit jamais : du noir
        const bottom = new THREE.InstancedMesh(new THREE.PlaneGeometry(PIT_HALF * 2, PIT_HALF * 2), new THREE.MeshBasicMaterial({ color: '#000000' }), deep.length);
        deep.forEach((h, i) => {
          dummy.position.set(h.x, -DEEP_DEPTH, h.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.updateMatrix();
          bottom.setMatrixAt(i, dummy.matrix);
        });
        dummy.rotation.set(0, 0, 0);
        bottom.instanceMatrix.needsUpdate = true;
        group.add(bottom);
      }
    }
    let water = null;
    if (L2) {
      // Poolrooms : sols, bassins, parois des bassins, margelles et la surface de l'eau (view/water.js)
      water = buildWater({ map, group, baked, textures, bake: bakeUniforms, fog: scene.fog });
    } else {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL_SIZE, H * CELL_SIZE), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((W * CELL_SIZE) / 2, 0, (H * CELL_SIZE) / 2);
      group.add(floor);
    }

    // 2. Faux plafond à dalles (percé là où l'étage du dessus a ses trous et ses escaliers)
    const ceilTex = (PIPES ? tx2.ceiling : LOW0 ? textures.ceilingLow : textures.ceiling).clone();
    ceilTex.needsUpdate = true;
    ceilTex.repeat.set(W, H);
    (PIPES ? tx2.ready : textures.ready).then(() => {
      ceilTex.needsUpdate = true;
    });
    // (Level 2 : la dalle de béton, sombre, au-dessus des tuyaux)
    const ceilMat = baked(new THREE.MeshLambertMaterial({ map: ceilTex, color: PIPES ? '#9a958a' : '#ffffff' }), L1 ? { gloss: 1 } : null);
    const above = fi > 0 ? floors[fi - 1] : null;
    // (et là où passe un couloir en diagonale : son propre plafond, plus bas, prend la place)
    const diagHoles = L2 ? [] : (map.diags || []).flatMap((dg) => [...dg.cells, ...dg.cuts]).map(([x, z]) => ({ x: (x + 0.5) * CELL_SIZE, z: (z + 0.5) * CELL_SIZE, hx: CELL_SIZE / 2, hz: CELL_SIZE / 2 }));
    if ((above && holesOf(above).length) || diagHoles.length) {
      ceilMat.alphaMap = holeMask(W, H, [...(above ? holesOf(above) : []), ...diagHoles], false);
      ceilMat.alphaTest = 0.5;
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL_SIZE, H * CELL_SIZE), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((W * CELL_SIZE) / 2, CEIL, (H * CELL_SIZE) / 2);
    if (!L2) group.add(ceiling); // Poolrooms : chaque salle a son propre plafond (voir water.js)
    // Level 0 : le long d'un couloir en diagonale, les dalles suivent le couloir. Une pièce de faux plafond couvre ses
    // cases pleines et la moitié libre de ses cases coupées, ses dalles tournées dans l'axe (la même texture, une
    // répétition par 2,5 m, calée sur la ligne médiane du couloir) ; le plafond droit y est découpé
    if (map.diags && map.diags.length && !L2) {
      const pos = [];
      const uvs = [];
      const C = CELL_SIZE;
      // (jamais sous un trou de l'étage du dessus : la carte tient ses couloirs en diagonale loin des cases imposées)
      for (const dg of map.diags) {
        const tx = dg.sx / Math.SQRT2;
        const tz = 1 / Math.SQRT2;
        // la ligne médiane passe par les coins des cases pleines : (x, z) et (x + 1, z + 1) quand sx = 1
        const [x0, z0] = dg.cells[0];
        const ox = (dg.sx > 0 ? x0 : x0 + 1) * C;
        const oz = z0 * C;
        const uvOf = (x, z) => [((x - ox) * tx + (z - oz) * tz) / C, ((x - ox) * tz - (z - oz) * tx) / C];
        const tri = (a, b, c) => {
          for (const [x, z] of [a, b, c]) {
            pos.push(x, CEIL, z);
            uvs.push(...uvOf(x, z));
          }
        };
        for (const [x, z] of dg.cells) {
          const a = [x * C, z * C];
          const b = [(x + 1) * C, z * C];
          const c = [(x + 1) * C, (z + 1) * C];
          const d = [x * C, (z + 1) * C];
          tri(a, c, b);
          tri(a, d, c);
        }
        for (const [x, z] of dg.cuts) {
          const p = map.pillarAt(x, z);
          if (!p || !p.poly) continue;
          const [e1, opp, e2] = p.poly;
          // le coin libre : à l'opposé du coin plein
          const free = [2 * p.x - opp[0], 2 * p.z - opp[1]];
          tri(e1, free, e2);
        }
      }
      // (des triangles dans les deux sens : vus d'en dessous, quel que soit l'ordre)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? -1 : 0)), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const dTex = (LOW0 ? textures.ceilingLow : textures.ceiling).clone();
      dTex.wrapS = dTex.wrapT = THREE.RepeatWrapping;
      dTex.repeat.set(1, 1);
      dTex.needsUpdate = true;
      textures.ready.then(() => {
        dTex.needsUpdate = true;
      });
      const dMat = baked(new THREE.MeshLambertMaterial({ map: dTex, side: THREE.DoubleSide }));
      group.add(new THREE.Mesh(geo, dMat));
    }

    // 3. Murs au papier peint jaune
    let wallCount = 0;
    for (let i = 0; i < W * H; i++) if (map.grid[i] === T.WALL) wallCount++;
    const SUNK = L2 ? 1.3 : 0; // les murs des Poolrooms descendent sous l'eau
    let wallMat;
    let hallMat = null; // Level 2 : les parpaings peints des halles (murs et piliers)
    if (PIPES) {
      // Level 2 : une face par côté de mur visible, revêtue selon l'endroit (carrelage ocre ou brun des galeries,
      // brique des réserves, brique peinte des chaufferies) ; le carrelage émaillé brille, ses joints non
      const wallMats = {
        [Z.TILE]: baked(new THREE.MeshPhongMaterial({ map: tx2.tileA.map, bumpMap: tx2.tileA.bump, bumpScale: 1.0, specular: '#3d3628', shininess: 55 }), { spec: 1.3, gloss: 110, grime: true, tile: tx2.tileA.rowH }),
        [Z.TILE_DARK]: baked(new THREE.MeshPhongMaterial({ map: tx2.tileB.map, bumpMap: tx2.tileB.bump, bumpScale: 1.0, specular: '#3a3024', shininess: 55 }), { spec: 1.4, gloss: 110, grime: true, tile: tx2.tileB.rowH }),
        [Z.BRICK]: baked(new THREE.MeshPhongMaterial({ map: tx2.brick.map, bumpMap: tx2.brick.bump, bumpScale: 3, specular: '#111111', shininess: 10 }), { spec: 0.08, gloss: 12, mask: 0, grime: true }),
        [Z.BOILER]: baked(new THREE.MeshPhongMaterial({ map: tx2.boiler.map, bumpMap: tx2.boiler.bump, bumpScale: 2.5, specular: '#1c1a16', shininess: 25 }), { spec: 0.25, gloss: 30, mask: 0.6, grime: true }),
        [Z.HALL]: baked(new THREE.MeshPhongMaterial({ map: tx2.hall.map, bumpMap: tx2.hall.bump, bumpScale: 2, specular: '#1c1c1a', shininess: 20 }), { spec: 0.2, gloss: 25, mask: 0.4, grime: true }),
      };
      wallMat = wallMats[Z.TILE];
      hallMat = wallMats[Z.HALL];
      const faces = new Map();
      const open = (x, z) => x >= 0 && z >= 0 && x < W && z < H && map.grid[z * W + x] !== T.WALL;
      const zoneOf = (x, z) => {
        const zn = map.zone[z * W + x];
        if (zn) return zn;
        // une grille, une chaudière, l'ascenseur : le revêtement d'une case voisine
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + dx, z + dz) && map.zone[(z + dz) * W + x + dx]) return map.zone[(z + dz) * W + x + dx];
        return Z.TILE;
      };
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          if (!open(x, z) || map.grid[z * W + x] === T.EXIT) continue;
          const zn = zoneOf(x, z);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (open(x + dx, z + dz)) continue;
            if (!faces.has(zn)) faces.set(zn, []);
            faces.get(zn).push({ x: (x + 0.5) * CELL_SIZE + dx * (CELL_SIZE / 2), z: (z + 0.5) * CELL_SIZE + dz * (CELL_SIZE / 2), ry: Math.atan2(-dx, -dz) });
          }
        }
      }
      const faceGeo = new THREE.PlaneGeometry(CELL_SIZE, CEIL);
      for (const [zn, list] of faces) {
        const inst = new THREE.InstancedMesh(faceGeo, wallMats[zn] || wallMat, list.length);
        list.forEach((f, i) => {
          dummy.position.set(f.x, CEIL / 2, f.z);
          dummy.rotation.set(0, f.ry, 0);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        dummy.rotation.set(0, 0, 0);
        inst.instanceMatrix.needsUpdate = true;
        group.add(inst);
      }
    } else {
      // l'étage du bas du Level 0 : le même papier peint, délavé vers le gris
      // (Level 1 : le relief des parpaings, et la crasse du haut des murs)
      wallMat = baked(new THREE.MeshLambertMaterial({ map: L0 && fi === 1 ? textures.wallLow : textures.wall, ...(L1 && textures.wallBump ? { bumpMap: textures.wallBump, bumpScale: 1.6 } : null) }), L0 ? { base: true } : L1 ? { bump: !!textures.wallBump, wall1: true } : null);
      const wallsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, CEIL + SUNK, CELL_SIZE), wallMat, wallCount);
      // le mur percé du trou de la cassette perchée se construit à part (6b)
      const nicheWall = map.niche ? (map.niche.gz + map.niche.dz) * W + map.niche.gx + map.niche.dx : -1;
      // un bloc entouré de murs ne se voit de nulle part (le plein autour de l'étage du bas, plus petit) : on le saute
      const buried = (x, z) => {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < W && nz < H && map.grid[nz * W + nx] !== T.WALL) return false;
        }
        return true;
      };
      let idx = 0;
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          if (map.grid[z * W + x] !== T.WALL || z * W + x === nicheWall || buried(x, z)) continue;
          if (map.arrival && map.arrival.gx === x && map.arrival.gz === z) continue; // la gaine de l'ascenseur d'arrivée
          dummy.position.set((x + 0.5) * CELL_SIZE, (CEIL - SUNK) / 2, (z + 0.5) * CELL_SIZE);
          dummy.updateMatrix();
          wallsMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      wallsMesh.count = idx;
      wallsMesh.instanceMatrix.needsUpdate = true;
      group.add(wallsMesh);
    }

    // 3b. Piliers plus fins que la case : carrés ou ronds, de tailles variées, au même papier peint (motif à l'échelle)
    if (map.pillarAt) {
      const kinds = new Map();
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const p = map.pillarAt(x, z);
          if (!p || p.rects || p.poly) continue; // les cloisons fines (3c) et les murs en biais (3d) : plus bas
          const key = (p.round ? 'r' : 's') + p.h + (p.hall ? 'h' : '');
          if (!kinds.has(key)) kinds.set(key, { p, list: [] });
          kinds.get(key).list.push(p);
        }
      }
      for (const { p, list } of kinds.values()) {
        const geo = p.round ? new THREE.CylinderGeometry(p.h, p.h, CEIL + SUNK, 20, 1, true) : new THREE.BoxGeometry(p.h * 2, CEIL + SUNK, p.h * 2);
        // le papier peint garde la largeur de ses lés : la texture couvre 2,5 m de large sur un mur
        const span = p.round ? 2 * Math.PI * p.h : p.h * 2;
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (span / CELL_SIZE));
        const inst = new THREE.InstancedMesh(geo, (p.hall && hallMat) || wallMat, list.length);
        list.forEach((q, i) => {
          dummy.position.set(q.x, (CEIL - SUNK) / 2, q.z);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        group.add(inst);
      }
    }

    // 3c. Les cloisons fines (Level 0) : un seul maillage, le papier peint calé sur le monde (u le long du mur, une
    // répétition par case comme sur les murs pleins) ; pas de bout de cloison collé à un mur voisin ni de face à la
    // jonction d'un retour (cachés, ils scintilleraient)
    if (EDGE) {
      const pos = [];
      const nor = [];
      const uvs = [];
      const idx = [];
      const C = CELL_SIZE;
      const solidAt = (x, z) => x < 0 || z < 0 || x >= W || z >= H || map.grid[z * W + x] === T.WALL || map.grid[z * W + x] === T.EXIT || !!thinAt(x, z);
      // une face verticale du sol au plafond, de a à b (b à droite vu de devant), de normale (nx, nz)
      const quad = (ax, az, bx, bz, nx, nz) => {
        const uOf = (x, z) => (nz > 0.5 ? x : nz < -0.5 ? -x : nx > 0.5 ? -z : z) / C;
        const i = pos.length / 3;
        pos.push(ax, 0, az, bx, 0, bz, bx, CEIL, bz, ax, CEIL, az);
        for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
        const ua = uOf(ax, az);
        const ub = uOf(bx, bz);
        uvs.push(ua, 0, ub, 0, ub, 1, ua, 1);
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      };
      for (let gz = 0; gz < H; gz++) {
        for (let gx = 0; gx < W; gx++) {
          const p = thinAt(gx, gz);
          if (!p) continue;
          p.rects.forEach(([x0, z0, x1, z1], ri) => {
            const alongX = x1 - x0 >= z1 - z0;
            // un bout : sur la limite de la case, caché si la case voisine est un mur ; au milieu, caché s'il s'agit de
            // la jonction d'un retour (ri > 0) avec la cloison principale
            const showEnd = (v, lo) => {
              const edge = Math.abs(v / C - Math.round(v / C)) < 1e-6;
              if (!edge) return ri === 0;
              return alongX ? !solidAt(gx + (lo ? -1 : 1), gz) : !solidAt(gx, gz + (lo ? -1 : 1));
            };
            if (alongX) {
              quad(x0, z1, x1, z1, 0, 1);
              quad(x1, z0, x0, z0, 0, -1);
              if (showEnd(x0, true)) quad(x0, z0, x0, z1, -1, 0);
              if (showEnd(x1, false)) quad(x1, z1, x1, z0, 1, 0);
            } else {
              quad(x1, z1, x1, z0, 1, 0);
              quad(x0, z0, x0, z1, -1, 0);
              if (showEnd(z0, true)) quad(x1, z0, x0, z0, 0, -1);
              if (showEnd(z1, false)) quad(x0, z1, x1, z1, 0, 1);
            }
          });
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, wallMat));
    }

    // 3d. Les murs en biais des couloirs en diagonale : une face du sol au plafond, d'un coin à l'autre de la case
    // coupée, tournée vers le couloir ; le papier peint calé sur le monde le long du mur (une répétition par 2,5 m)
    if (CHAMF) {
      const pos = [];
      const nor = [];
      const uvs = [];
      const idx = [];
      // (au bout d'un couloir, la moitié pleine d'une case coupée peut border une case libre par un de ses côtés droits :
      // ce bout de mur-là aussi)
      const legs = [];
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          const v = map.grid[z * W + x];
          if (!isChamfer(v)) continue;
          const [fx, fz] = chamferSide(v);
          for (const [dx, dz] of [[-fx, 0], [0, -fz]]) {
            const n = map.grid[(z + dz) * W + x + dx];
            if (n === undefined || (n !== T.FLOOR && n !== T.PILLAR)) continue;
            const cx = (x + 0.5) * CELL_SIZE;
            const cz = (z + 0.5) * CELL_SIZE;
            const h = CELL_SIZE / 2;
            legs.push(dx ? { a: [cx + dx * h, cz - h], b: [cx + dx * h, cz + h], nx: dx, nz: 0 } : { a: [cx - h, cz + dz * h], b: [cx + h, cz + dz * h], nx: 0, nz: dz });
          }
        }
      }
      for (const f of [...map.chamfers, ...legs]) {
        // a à gauche, b à droite, vu du couloir (la normale vers soi)
        let [ax, az] = f.a;
        let [bx, bz] = f.b;
        if ((bx - ax) * f.nz - (bz - az) * f.nx < 0) [ax, az, bx, bz] = [bx, bz, ax, az]; // (la droite du regard : (nz, -nx))
        const tx = (bx - ax) / Math.hypot(bx - ax, bz - az);
        const tz = (bz - az) / Math.hypot(bx - ax, bz - az);
        const ua = (ax * tx + az * tz) / CELL_SIZE;
        const ub = (bx * tx + bz * tz) / CELL_SIZE;
        const i = pos.length / 3;
        pos.push(ax, 0, az, bx, 0, bz, bx, CEIL, bz, ax, CEIL, az);
        for (let k = 0; k < 4; k++) nor.push(f.nx, 0, f.nz);
        uvs.push(ua, 0, ub, 0, ub, 1, ua, 1);
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      group.add(new THREE.Mesh(geo, baked(new THREE.MeshLambertMaterial({ map: wallMat.map }), { base: true, push: 0.45 })));
    }

    // 4. Néons au plafond (les morts sont gris, ceux qui grésillent clignotent)
    const ON = new THREE.Color(L2 ? '#f2fbff' : L1 ? '#eef6ff' : LOW0 ? '#fffbe2' : '#fffaea').multiplyScalar(L2 ? 2.2 : 3.2); // plus fort que le blanc : le caméscope sature et ils bavent
    const OFF = new THREE.Color(L2 ? '#7d8b8d' : '#4a473c'); // aux Poolrooms, un diffuseur éteint reste gris-bleu
    // Level 2 : des globes de verre dépoli au mur (ampoules chaudes) et des tubes nus dans les réserves
    const ON_BULB = new THREE.Color('#ffc27a').multiplyScalar(3.4);
    const ON_TUBE = new THREE.Color('#e4f0ff').multiplyScalar(3.2);
    const OFF_BULB = new THREE.Color('#3d3328');
    const fixSets = [];
    const fixSet = (geo, mat, list, pose) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((l, i) => {
        pose(l);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        l.fix = { mesh, i };
      });
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      fixSets.push(mesh);
    };
    const ALARM = new THREE.Color('#ff2414').multiplyScalar(3.2);
    const onCol = (l) => (l.kind === 'bulb' ? ON_BULB : l.kind === 'tube' ? ON_TUBE : ON);
    const offCol = (l) => (l.kind === 'bulb' ? OFF_BULB : OFF);
    const fixTmp = new THREE.Color();
    const ALARM_OFF = new THREE.Color('#140807'); // dans le noir rouge, un diffuseur éteint ne se voit presque plus
    // pendant la phase rouge, un néon est éteint, ou rouge à la force de sa pulsation
    const fixColor = (l, on) => {
      if (!l.fix) return;
      if (casc && l.cascOff) on = false;
      const a = alarm && alarmOf.get(l);
      l.fix.mesh.setColorAt(l.fix.i, alarm ? (a && on ? fixTmp.copy(ALARM_OFF).lerp(ALARM, Math.min(1, a.v)) : ALARM_OFF) : on ? onCol(l) : offCol(l));
    };
    const fixDirty = () => {
      for (const m of fixSets) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    if (PIPES) {
      const bulbs = map.lights.filter((l) => l.kind === 'bulb');
      // l'ampoule, dans le hublot de verre de la lampe (pipes.js)
      fixSet(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), bulbs, (l) => {
        dummy.position.set(l.x + l.wall[0] * 0.13, l.y, l.z + l.wall[1] * 0.13);
        dummy.scale.set(1, 1.3, 1);
      });
      const tubes = map.lights.filter((l) => l.kind === 'tube');
      fixSet(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), tubes, (l) => {
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(l.alongX ? 0 : Math.PI / 2, 0, l.alongX ? Math.PI / 2 : 0);
      });
    } else {
      // Level 1 : deux tubes nus de 1,5 m, côte à côte sous le capot de la réglette (warehouse.js)
      const twin = () => mergeGeometries([-0.045, 0.045].map((z) => new THREE.CylinderGeometry(0.014, 0.014, 1.5, 10, 1, true).rotateZ(Math.PI / 2).translate(0, 0, z)));
      fixSet(L2 ? new THREE.BoxGeometry(1.3, 0.03, 1.3) : L1 ? twin() : new THREE.BoxGeometry(1.22, 0.04, 0.62), new THREE.MeshBasicMaterial({ color: '#ffffff', map: L1 || L2 ? null : textures.lamp }), map.lights, (l) => {
        dummy.position.set(l.x, l.fy !== undefined ? l.fy : CEIL - (L1 ? 0.45 : 0.025), l.z); // au Level 1, les tubes pendent sous le plafond
        dummy.rotation.set(0, l.rot || 0, 0); // Level 0 : couché le long d'un couloir en diagonale
        // Poolrooms : la lampe d'un couloir voûté est cachée dans la voûte ; sous une verrière, tout le plafond éclaire
        dummy.scale.setScalar(l.hidden ? 0.0001 : l.fs || 1);
      });
    }
    for (const l of map.lights) fixColor(l, l.state !== 'off');

    // 5. Objets abandonnés (modèles Poly Haven CC0), un InstancedMesh par morceau ; leur photo de couleur est gardée.
    // Ils sont détaillés (des dizaines de milliers de triangles chacun) : à chaque image, on ne dessine que ceux qu'on
    // peut voir (voir cullProps), le reste se perd de toute façon dans le brouillard ou est dans notre dos
    const propKinds = []; // par modèle : où sont ses exemplaires, lesquels sont visibles
    const propSets = []; // par morceau de modèle : son InstancedMesh et toutes ses matrices
    // par un trou du sol, ou par la cage d'escalier (ses portes ouvertes), on voit un peu de l'autre étage
    const seeHoles = floors.flatMap((m) => m.pits || []);
    const shafts = (floors[0].stairs || []).map((st) => ({ x: st.ox + st.dx * 1.5 * CELL_SIZE + st.px * CELL_SIZE, z: st.oz + st.dz * 1.5 * CELL_SIZE + st.pz * CELL_SIZE }));
    const seenFromAbove = (x, z) => seeHoles.some((h) => Math.hypot(h.x - x, h.z - z) < 10) || shafts.some((c) => Math.hypot(c.x - x, c.z - z) < 14);
    // un modèle posé à plusieurs endroits (places : ses matrices dans l'étage) : chaque exemplaire tient dans la sphère
    // de sa boîte une fois posé (le centre de la boîte, sa demi-diagonale, et un peu de marge)
    const cullKind = (box, places) => {
      const bb = new THREE.Box3();
      const c = new THREE.Vector3();
      const xs = [];
      const zs = [];
      const cys = [];
      let r = 0;
      for (const m of places) {
        bb.copy(box).applyMatrix4(m);
        bb.getCenter(c);
        xs.push(c.x);
        zs.push(c.z);
        cys.push(c.y);
        r = Math.max(r, 0.5 * bb.max.distanceTo(bb.min));
      }
      const K = { xs, zs, cys, r: r + 0.25, near: xs.map((x, i) => seenFromAbove(x, zs[i])), vis: new Int32Array(places.length), n: -1, changed: true };
      propKinds.push(K);
      return K;
    };
    // un morceau de ce modèle : son InstancedMesh, dont cull ne garde que les exemplaires visibles
    const cullSet = (o, mat, places, K) => {
      const inst = new THREE.InstancedMesh(o.geometry, mat, places.length);
      const mats = new Float32Array(places.length * 16);
      places.forEach((m, i) => m.clone().multiply(o.matrixWorld).toArray(mats, i * 16));
      inst.instanceMatrix.array.set(mats);
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      group.add(inst);
      inst.userData.allMats = mats; // (?debug : pour comparer l'image avec et sans le tri)
      propSets.push({ inst, mats, kind: K });
      return inst;
    };
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
    // un modèle à plusieurs pièces (deux poubelles, quatre sacs…) : p.node choisit la pièce
    const propKey = (p) => p.m + (p.node ? '#' + p.node : '');
    // (un fantôme : la seule emprise d'un meuble plus large que son cercle, rien à dessiner)
    const shownProps = map.props.filter((p) => !p.ghost);
    const kinds = new Map(shownProps.map((p) => [propKey(p), { m: p.m, node: p.node, h: p.h, proc: p.proc }]));
    for (const [key, kind] of kinds) {
      const list = shownProps.filter((p) => propKey(p) === key);
      if (!list.length) continue;
      const place = (root) => {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const c = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(c);
        const k = kind.h / (size.y || 1);
        const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
        const place = list.map((p) => {
          const m = new THREE.Matrix4().makeTranslation(p.x, (p.y || 0) + (p.tipped ? (size.x * k) / 2 : 0), p.z).multiply(new THREE.Matrix4().makeRotationY(p.rot));
          if (p.tipped) m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
          return m.multiply(fix);
        });
        // chaque exemplaire dans une sphère ; près d'un trou ou de la cage d'escalier, il peut se voir de l'autre étage
        const kindV = cullKind(box, place);
        root.traverse((o) => {
          if (!o.isMesh) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          cullSet(o, propMat(src), place, kindV);
        });
      };
      if (kind.proc) {
        const made = L2_PROC[kind.m] ? L2_PROC[kind.m]() : kind.m === 'cone' ? makeCone() : makeWorklight();
        if (made.then) made.then(place); // un objet fait de pièces de modèles : il se charge d'abord
        else place(made);
      }
      else
        loader.load(MODELS + kind.m + '.glb', (g) => {
          let root = g.scene;
          const piece = kind.node && root.getObjectByName(kind.node);
          if (piece) {
            piece.position.set(0, 0, 0);
            root = new THREE.Group();
            root.add(piece);
          }
          place(root);
        }, undefined, () => {});
    }

    // 5a. La rubalise des chantiers : arrachée, elle traîne à plat sur la moquette en ondulant (on marche dessus)
    if (map.tapes && map.tapes.length) {
      const pos = [];
      const uv = [];
      const W2 = 0.075; // largeur du ruban
      for (const t of map.tapes) {
        const L = Math.hypot(t.x2 - t.x1, t.z2 - t.z1);
        const ux = (t.x2 - t.x1) / L;
        const uz = (t.z2 - t.z1) / L;
        const w = t.wave || { amp: 0.2, freq: 2, ph: 0 };
        const N = 28;
        const pts = [];
        let u = 0;
        for (let i = 0; i <= N; i++) {
          const f = i / N;
          // le ruban serpente de part et d'autre de la ligne droite, plus librement vers le bout arraché
          const off = Math.sin(f * w.freq * Math.PI + w.ph) * w.amp * (0.4 + f * 0.6);
          const x = t.x1 + ux * f * L - uz * off;
          const z = t.z1 + uz * f * L + ux * off;
          if (i) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][2]) / 0.9;
          pts.push([x, 0.006 + (i % 3) * 0.0015, z, u]);
        }
        for (let i = 0; i < N; i++) {
          const [ax, ay, az, au] = pts[i];
          const [bx, by, bz, bu] = pts[i + 1];
          // à plat : la largeur du ruban est perpendiculaire à son trajet, sur le sol
          const dx = bx - ax;
          const dz = bz - az;
          const d = Math.hypot(dx, dz) || 1;
          const px = (-dz / d) * (W2 / 2);
          const pz = (dx / d) * (W2 / 2);
          pos.push(ax - px, ay, az - pz, bx - px, by, bz - pz, bx + px, by, bz + pz, ax - px, ay, az - pz, bx + px, by, bz + pz, ax + px, ay, az + pz);
          uv.push(au, 0, bu, 0, bu, 1, au, 0, bu, 1, au, 1);
        }
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      tg.computeVertexNormals();
      const tapeMat = baked(new THREE.MeshLambertMaterial({ map: textures.tape, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      group.add(new THREE.Mesh(tg, tapeMat));
    }

    // 5b. Ce qui est fixé aux murs et au plafond : prises électriques, détecteurs incendie, boîtiers électriques,
    // horloges arrêtées, grilles d'aération. Tirés d'une graine propre à l'étage (même décor chez tout le monde).
    let ds = 1234567 + fi * 7919 + (map.level || 0) * 104729 + (map.spawn ? Math.round(map.spawn.x * 13 + map.spawn.z * 7) : 0);
    const drnd = () => ((ds = (ds * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pitCells = new Set((map.pits || []).map((p) => Math.floor(p.z / CELL_SIZE) * W + Math.floor(p.x / CELL_SIZE)));
    const stairCells = new Set((map.stairs || []).flatMap((st) => st.cells.map((k) => k.gz * W + k.gx)));
    const wallSpots = { outlet: [], fire_alarm: [], power_box_01: [], wall_clock: [], drawing: [] };
    const ceilSpots = [];
    // le plafond est percé sous les trous et les trémies de l'étage du dessus : rien n'y est fixé
    const aboveHoles = fi > 0 ? holesOf(floors[fi - 1]) : [];
    const holeAbove = (x, z) => aboveHoles.some((h) => Math.abs((x + 0.5) * CELL_SIZE - h.x) < h.hx + 0.6 && Math.abs((z + 0.5) * CELL_SIZE - h.z) < h.hz + 0.6);
    // une grille (60 cm) garde au moins 20 cm entre elle et le diffuseur d'un plafonnier (1,22 m × 0,62 m)
    const ventFree = (vx, vz) =>
      map.lights.every((l) => {
        const k = l.fs || 1;
        return Math.abs(vx - l.x) >= 0.61 * k + 0.3 + 0.2 || Math.abs(vz - l.z) >= 0.31 * k + 0.3 + 0.2;
      });
    const rates = L2 || L3
      ? { outlet: 0, fire_alarm: 0, power_box_01: 0, wall_clock: 0, drawing: 0 }
      : L1
      ? { outlet: 0.02, fire_alarm: 0.01, power_box_01: 0.012, wall_clock: 0, drawing: 0 }
      : PIPES
        ? { outlet: 0.012, fire_alarm: 0.006, power_box_01: 0.008, wall_clock: 0, drawing: 0 }
        : { outlet: 0.05, fire_alarm: 0.008, power_box_01: 0.003, wall_clock: 0.004, drawing: 0.016 };
    const heights = { outlet: 0.32, fire_alarm: 2.15, power_box_01: 1.35, wall_clock: 2.25, drawing: 1.3 };
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (map.grid[i] === T.WALL || isChamfer(map.grid[i]) || pitCells.has(i) || stairCells.has(i) || thinAt(x, z)) continue;
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
        if (!L1 && !L2 && !L3 && !PIPES && drnd() < 0.045 && !holeAbove(x, z) && !diagAt.has(i)) {
          const ox = (drnd() - 0.5) * 1.2;
          const oz = (drnd() - 0.5) * 1.2;
          const rot = drnd() < 0.5 ? 0 : Math.PI / 2;
          // jamais sur un plafonnier ni contre lui : on essaie l'autre côté de la case, sinon pas de grille ici
          for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const vx = (x + 0.5) * CELL_SIZE + ox * sx;
            const vz = (z + 0.5) * CELL_SIZE + oz * sz;
            if (ventFree(vx, vz)) {
              ceilSpots.push({ x: vx, z: vz, rot });
              break;
            }
          }
        }
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
    // dessins sur les murs : un des 8 de la planche, de taille et de hauteur variables, un peu de travers
    if (wallSpots.drawing.length) {
      const dm = baked(new THREE.MeshLambertMaterial({ map: textures.drawings, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      for (let d = 0; d < 8; d++) {
        const spots = wallSpots.drawing.filter((_, i) => i % 8 === (d + fi * 3) % 8);
        if (!spots.length) continue;
        const pg = new THREE.PlaneGeometry(1, 1);
        const u0 = (d % 4) / 4;
        const v0 = 1 - (Math.floor(d / 4) + 1) / 2;
        const uvs = pg.attributes.uv;
        for (let i = 0; i < uvs.count; i++) uvs.setXY(i, u0 + uvs.getX(i) / 4, v0 + uvs.getY(i) / 2);
        const inst = new THREE.InstancedMesh(pg, dm, spots.length);
        spots.forEach((s, i) => {
          const sz = 0.7 + ((i * 37 + d * 11) % 10) * 0.06;
          dummy.position.set(s.x, heights.drawing + (((i * 53 + d) % 7) - 3) * 0.1, s.z);
          dummy.rotation.set(0, s.rot, (((i * 29 + d) % 5) - 2) * 0.05);
          dummy.scale.set(sz, sz, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        group.add(inst);
      }
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
        const places = spots.map((s) => new THREE.Matrix4().makeTranslation(s.x, heights[name], s.z).multiply(new THREE.Matrix4().makeRotationY(s.rot)).multiply(fix));
        const K = cullKind(box, places); // détaillés eux aussi : on ne dessine que ceux qu'on peut voir
        root.traverse((o) => {
          if (!o.isMesh) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          cullSet(o, propMat(src), places, K);
        });
      }, undefined, () => {});
    }

    // 6a. La moquette détrempée (Level 0) : des traces de pas mouillées qui mènent à une cassette (quelqu'un est passé
    // par là avant vous), et des fuites au plafond qui gouttent dans une flaque. Tirées de la carte : tout le monde les
    // voit au même endroit.
    const drips = [];
    if (L0 && map.walkable && map.walkable.length) {
      let rs = (map.W * 7919 + (map.cassettes || []).reduce((a, c) => a + c.gx * 31 + c.gz * 17, 0) + fi * 101) >>> 0 || 1;
      const rr = () => {
        rs = (rs + 0x6d2b79f5) >>> 0;
        let t = rs;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const free = (x, z) => !map.isWall(x, z) && !(map.pitAt && map.pitAt(x, z) >= 0) && !stairSet.has(z * W + x);
      // l'empreinte d'une semelle (pointe vers le haut de la toile), sur fond transparent
      const fc = document.createElement('canvas');
      fc.width = 64;
      fc.height = 128;
      const fg = fc.getContext('2d');
      fg.fillStyle = '#fff';
      fg.beginPath();
      fg.ellipse(32, 44, 21, 36, 0, 0, Math.PI * 2);
      fg.fill();
      fg.beginPath();
      fg.ellipse(32, 104, 15, 19, 0, 0, Math.PI * 2);
      fg.fill();
      fg.globalCompositeOperation = 'destination-out';
      for (let y = 14; y < 120; y += 9) fg.fillRect(0, y, 64, 3); // les crans de la semelle
      const footTex = new THREE.CanvasTexture(fc);
      const prints = [];
      for (const c of (map.cassettes || []).filter((q) => !q.high && !q.vault).slice(0, 2)) {
        let start = null;
        for (let i = 0; i < 60 && !start; i++) {
          const w = map.walkable[(rr() * map.walkable.length) | 0];
          const d = Math.abs(w.x - c.gx) + Math.abs(w.z - c.gz);
          if (d >= 7 && d <= 15 && free(w.x, w.z)) start = w;
        }
        if (!start) continue;
        const sx = (start.x + 0.5) * CELL_SIZE;
        const sz = (start.z + 0.5) * CELL_SIZE;
        const path = findPath(map, sx, sz, c.x, c.z);
        if (!path || path.length < 2) continue;
        const pts = [{ x: sx, z: sz }, ...path, { x: c.x, z: c.z }];
        let side = 1;
        let carry = 0;
        const list = [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const L = Math.hypot(b.x - a.x, b.z - a.z);
          if (L < 0.01) continue;
          const ux = (b.x - a.x) / L;
          const uz = (b.z - a.z) / L;
          let d = carry;
          for (; d < L; d += 0.4) {
            const px = a.x + ux * d - uz * 0.12 * side;
            const pz = a.z + uz * d + ux * 0.12 * side;
            if (Math.hypot(px - c.x, pz - c.z) < 1.1) break;
            list.push({ x: px, z: pz, ry: Math.atan2(-ux, -uz) + (rr() - 0.5) * 0.25, side });
            side = -side;
          }
          carry = d - L;
        }
        // les plus anciennes (au début de la piste) ont presque séché
        list.forEach((q, i) => prints.push({ ...q, k: 0.25 + 0.75 * (i / Math.max(1, list.length - 1)) }));
      }
      if (prints.length) {
        const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.28), new THREE.MeshBasicMaterial({ map: footTex, color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), prints.length);
        const wetC = new THREE.Color('#1e1708');
        const dryC = new THREE.Color('#6d5d2c');
        const m4 = new THREE.Matrix4();
        prints.forEach((q, i) => {
          m4.makeRotationY(q.ry).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(q.side, 1, 1));
          m4.setPosition(q.x, 0.006, q.z);
          pm.setMatrixAt(i, m4);
          pm.setColorAt(i, dryC.clone().lerp(wetC, q.k));
        });
        pm.instanceMatrix.needsUpdate = true;
        pm.instanceColor.needsUpdate = true;
        pm.frustumCulled = false;
        group.add(pm);
      }
      // les fuites : une auréole au plafond, une flaque dessous, une goutte qui tombe et fait des ronds
      // des taches irrégulières, jamais rondes : un contour qui ondule (quelques harmoniques au hasard), deux ou trois
      // coulées qui débordent, des bords flous. Trois dessins, tirés d'une graine fixe (les mêmes chez tout le monde)
      let bs = 0x5eed;
      const br = () => ((bs = (Math.imul(bs, 1103515245) + 12345) >>> 0) / 4294967296);
      const blot = (ring) => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const x = c.getContext('2d');
        x.filter = 'blur(5px)';
        const shape = (cx, cy, R) => {
          const h = [1, 2, 3, 5].map((k) => [k, (0.12 / k) * (0.5 + br()), br() * 6.2832]);
          x.beginPath();
          for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * 6.2832;
            const r = R * (1 + h.reduce((s, [k, amp, ph]) => s + amp * Math.sin(k * a + ph), 0));
            if (i) x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            else x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          x.closePath();
        };
        const n = 2 + ((br() * 2) | 0);
        const parts = [[128, 128, 60]];
        for (let i = 0; i < n; i++) {
          const a = br() * 6.2832;
          const d = 35 + br() * 25;
          parts.push([128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 15 + br() * 18]);
        }
        if (ring) {
          // l'auréole : un cerne plus foncé autour d'un cœur pâle
          x.globalAlpha = 0.55;
          x.fillStyle = '#fff';
          for (const p of parts) (shape(...p), x.fill());
          x.globalAlpha = 1;
          x.strokeStyle = '#fff';
          x.lineWidth = 7;
          shape(...parts[0]);
          x.stroke();
        } else {
          x.fillStyle = '#fff';
          for (const p of parts) (shape(...p), x.fill());
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const pudTex = [blot(false), blot(false), blot(false)];
      const stainTex = [blot(true), blot(true), blot(true)];
      const puddleMats = pudTex.map((map) => new THREE.MeshBasicMaterial({ map, color: '#1a1406', transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      const stainMats = stainTex.map((map) => new THREE.MeshBasicMaterial({ map, color: '#5a4720', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      const dropMat = new THREE.MeshBasicMaterial({ color: '#d8d2b8', transparent: true, opacity: 0.8 });
      const ringMat = new THREE.MeshBasicMaterial({ color: '#c9c0a0', transparent: true, opacity: 0.0, depthWrite: false });
      const dropGeo = new THREE.SphereGeometry(0.012, 6, 5);
      const ringGeo = new THREE.RingGeometry(0.85, 1, 24);
      for (let i = 0, tries = 0; i < 5 && tries < 200; tries++) {
        const w = map.walkable[(rr() * map.walkable.length) | 0];
        if (!free(w.x, w.z) || drips.some((d) => Math.abs(d.gx - w.x) + Math.abs(d.gz - w.z) < 6)) continue;
        const x = (w.x + 0.2 + rr() * 0.6) * CELL_SIZE;
        const z = (w.z + 0.2 + rr() * 0.6) * CELL_SIZE;
        const r = 0.35 + rr() * 0.35;
        // la flaque et son auréole restent dans leur case : jamais à travers un mur ou une cloison
        const room = Math.min(x - w.x * CELL_SIZE, (w.x + 1) * CELL_SIZE - x, z - w.z * CELL_SIZE, (w.z + 1) * CELL_SIZE - z) - 0.08;
        const rp = Math.min(r, room);
        const rs = Math.min(r * 1.2, room);
        const turn = (x * 7.31 + z * 3.17) % 6.2832;
        const pud = new THREE.Mesh(new THREE.PlaneGeometry(rp * 2, rp * 2 * (0.7 + 0.3 * ((x * 13.7) % 1))), puddleMats[i % 3]);
        pud.rotation.set(-Math.PI / 2, 0, turn);
        pud.position.set(x, 0.007, z);
        const st = new THREE.Mesh(new THREE.PlaneGeometry(rs * 2, rs * 2 * (0.75 + 0.25 * ((z * 11.3) % 1))), stainMats[(i + 1) % 3]);
        st.rotation.set(Math.PI / 2, 0, turn * 0.7 + 1);
        st.position.set(x, CEIL - 0.012, z);
        const drop = new THREE.Mesh(dropGeo, dropMat);
        drop.scale.set(1, 1.8, 1);
        const ring = new THREE.Mesh(ringGeo, ringMat.clone());
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.01, z);
        group.add(pud, st, drop, ring);
        drips.push({ gx: w.x, gz: w.z, x, z, drop, ring, period: 1.4 + rr() * 1.8, phase: rr() * 3, last: -1 });
        i++;
      }
    }

    // 6. Les cassettes VHS de cet étage : couchées sur la moquette, comme les piles et les bouteilles (F pour les
    // prendre). Pas de lumière à elles : la jaquette se devine à peine dans le noir, et la lampe y fait briller un
    // reflet sur le boîtier. Celle du renfoncement reste debout dans son trou, éclairée par sa petite lueur
    const cassetteGeo = new THREE.BoxGeometry(0.38, 0.22, 0.06);
    const flatGeo = new THREE.BoxGeometry(0.38, 0.22, 0.06).rotateX(-Math.PI / 2).translate(0, 0.031, 0);
    const cassetteMat = new THREE.MeshLambertMaterial({ map: textures.vhs, emissive: '#ffe2b8', emissiveMap: textures.vhs, emissiveIntensity: 0.42 });
    const flatMat = baked(new THREE.MeshLambertMaterial({ map: textures.vhs, emissive: '#ffe2b8', emissiveMap: textures.vhs, emissiveIntensity: 0.12 }));
    const cassetteMeshes = [];
    for (const cas of map.cassettes || []) {
      const cg = new THREE.Group();
      if (cas.high) {
        cg.add(new THREE.Mesh(cassetteGeo, cassetteMat));
        cg.add(new THREE.PointLight('#f5a524', 1.1, 3.5, 1.8));
        cg.position.set(cas.x, NICHE_Y, cas.z);
      } else {
        cg.add(new THREE.Mesh(flatGeo, flatMat));
        // le reflet du boîtier dans le faisceau de la lampe
        const glint = new THREE.Sprite(glintMat());
        glint.scale.setScalar(0.2);
        glint.position.set(0.1, 0.07, -0.05);
        cg.add(glint);
        cg.userData.glint = glint;
        cg.position.set(cas.x, 0, cas.z);
        // posée de travers, au hasard (mais pareil chez tout le monde)
        cg.rotation.y = ((cas.gx * 7 + cas.gz * 13 + cas.id * 5) % 12) * 0.52;
      }
      group.add(cg);
      cassetteMeshes.push({ id: cas.id, cas, group: cg });
    }

    // 6. bis Level 0 : la feuille d'un survivant scotchée au mur le plus proche du départ, de préférence celui qu'on a en
    // face en arrivant (vers -z) ; elle résume les règles du niveau sans sortir du jeu
    if (L0 && fi === 0 && map.spawn) {
      let best = null;
      for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        for (let k = 1; k <= 6; k++) {
          const x = map.spawn.gx + dx * k, z = map.spawn.gz + dz * k;
          if (map.grid[z * W + x] === T.FLOOR) continue;
          if (map.grid[z * W + x] === T.WALL && !stairSet.has(z * W + x) && (!best || k < best.k)) best = { k, x, z, dx, dz };
          break;
        }
      }
      if (best) {
        const tex = new THREE.TextureLoader().load(new URL('../img/note_level0.svg', import.meta.url).href);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const note = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.14), baked(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4 })));
        note.position.set((best.x + 0.5 - best.dx * 0.5) * CELL_SIZE - best.dx * 0.012, 1.5,(best.z + 0.5 - best.dz * 0.5) * CELL_SIZE - best.dz * 0.012);
        note.rotation.y = Math.atan2(-best.dx, -best.dz);
        group.add(note);
      }
    }

    // 6a. Les casiers métalliques où l'on peut se cacher (Level 1, Tuyauteries)
    if ((map.hides || []).length && !map.spots) { // les casiers (pas les lits et armoires de l'hôtel)
      const lockMat = baked(new THREE.MeshLambertMaterial({ color: PIPES ? '#6b6253' : '#55615a' }));
      const slitMat = new THREE.MeshBasicMaterial({ color: '#070707' });
      const body = new THREE.BoxGeometry(0.78, 1.95, 0.56);
      const slit = new THREE.BoxGeometry(0.42, 0.025, 0.01);
      const seam = new THREE.BoxGeometry(0.012, 1.85, 0.01);
      for (const h of map.hides) {
        const lg = new THREE.Group();
        const b = new THREE.Mesh(body, lockMat);
        b.position.y = 0.975;
        lg.add(b);
        // les fentes d'aération de la porte (on regarde dehors par là) et la jointure de la porte
        for (let i = 0; i < 5; i++) {
          const sl = new THREE.Mesh(slit, slitMat);
          sl.position.set(0, 1.42 + i * 0.065, 0.285);
          lg.add(sl);
        }
        const sm = new THREE.Mesh(seam, slitMat);
        sm.position.set(0.36, 0.975, 0.285);
        lg.add(sm);
        lg.position.set(h.x, 0, h.z);
        lg.rotation.y = h.ry;
        group.add(lg);
      }
    }

    // 6b. Le trou carré dans le mur, la cassette posée dedans, et l'échelle une fois posée
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
    // la case de mur du trou : ses quatre faces au papier peint (celle de la pièce percée d'un trou carré, son papier
    // peint calé comme sur les murs voisins), et l'intérieur du trou, sombre, que seule la lueur de la cassette éclaire
    const nicheWallMesh = (N) => {
      const C = CELL_SIZE;
      const cx = (N.gx + N.dx + 0.5) * C;
      const cz = (N.gz + N.dz + 0.5) * C;
      const out = { p: [], n: [], u: [] };
      const inn = { p: [], n: [], u: [] };
      // un quadrilatère o, o + e1, o + e1 + e2, o + e2 (vu de face : e1 vers la droite, e2 vers le haut)
      const quad = (t, o, e1, e2, uv) => {
        const nx = e1[1] * e2[2] - e1[2] * e2[1];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        const l = Math.hypot(nx, ny, nz) || 1;
        const v = [o, [o[0] + e1[0], o[1] + e1[1], o[2] + e1[2]], [o[0] + e1[0] + e2[0], o[1] + e1[1] + e2[1], o[2] + e1[2] + e2[2]], [o[0] + e2[0], o[1] + e2[1], o[2] + e2[2]]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          t.p.push(...v[k]);
          t.n.push(nx / l, ny / l, nz / l);
          t.u.push(...uv[k]);
        }
      };
      const A0 = C / 2 - NICHE_SIZE / 2;
      const A1 = C / 2 + NICHE_SIZE / 2;
      const B0 = NICHE_LO;
      const B1 = NICHE_LO + NICHE_SIZE;
      const D = NICHE_DEPTH;
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // la face qui regarde vers (sx, sz) ; r : sa droite vue de dehors ; c0 : son coin en bas à gauche
        const r = [sz, 0, -sx];
        const c0 = [cx + sx * (C / 2) - r[0] * (C / 2), 0, cz + sz * (C / 2) - r[2] * (C / 2)];
        const at = (a, b, d = 0) => [c0[0] + r[0] * a - sx * d, b, c0[2] + r[2] * a - sz * d];
        const rect = (a0, a1, b0, b1) => quad(out, at(a0, b0), [r[0] * (a1 - a0), 0, r[2] * (a1 - a0)], [0, b1 - b0, 0], [[a0 / C, b0 / CEIL], [a1 / C, b0 / CEIL], [a1 / C, b1 / CEIL], [a0 / C, b1 / CEIL]]);
        if (sx !== -N.dx || sz !== -N.dz) {
          rect(0, C, 0, CEIL);
          continue;
        }
        rect(0, C, 0, B0);
        rect(0, C, B1, CEIL);
        rect(0, A0, B0, B1);
        rect(A1, C, B0, B1);
        const S = NICHE_SIZE;
        const uvS = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
        quad(inn, at(A0, B0), [r[0] * S, 0, r[2] * S], [-sx * D, 0, -sz * D], uvS(1, D / S)); // le fond du trou (dessous)
        quad(inn, at(A0, B1, D), [r[0] * S, 0, r[2] * S], [sx * D, 0, sz * D], uvS(1, D / S)); // son plafond
        quad(inn, at(A0, B0), [-sx * D, 0, -sz * D], [0, S, 0], uvS(D / S, 1)); // côté gauche
        quad(inn, at(A1, B0, D), [sx * D, 0, sz * D], [0, S, 0], uvS(D / S, 1)); // côté droit
        quad(inn, at(A0, B0, D), [r[0] * S, 0, r[2] * S], [0, S, 0], uvS(1, 1)); // le fond
      }
      const geoOf = (t) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(t.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(t.u, 2));
        return g;
      };
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoOf(out), wallMat));
      // l'intérieur : du plâtre brut, poussiéreux (pas de lumière cuite : les néons n'y entrent pas)
      g.add(new THREE.Mesh(geoOf(inn), new THREE.MeshLambertMaterial({ color: '#7a6f58' })));
      return g;
    };
    if (N) {
      const face = Math.atan2(-N.dx, -N.dz); // regarde la pièce
      group.add(nicheWallMesh(N));
      // l'échelle posée : appuyée au mur, le haut juste sous le trou
      placedLadder = makeLadder(2.3);
      placedLadder.position.set(N.baseX + N.dx * 0.25, 0, N.baseZ + N.dz * 0.25);
      placedLadder.rotation.set(0, face, 0);
      placedLadder.rotateX(-0.195);
      placedLadder.visible = false;
      group.add(placedLadder);
    }

    // 7. Objets au sol : eau d'amande, piles, échelle (un maillage par objet, créé à la demande)
    const itemMeshes = [];
    const glassMat = baked(new THREE.MeshLambertMaterial({ color: '#eef3f6', transparent: true, opacity: 0.6 }));
    const capMat = baked(new THREE.MeshLambertMaterial({ color: '#f2f2ee' })); // bouchon blanc, comme sur la photo
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
    const capCopper = baked(new THREE.MeshLambertMaterial({ color: '#c98a2b', emissive: '#5a3a08', emissiveIntensity: 0.3 }));
    // les piles au sol : deux piles AA couchées, quatre fois plus grandes que nature pour qu'on les repère sur la
    // moquette ; deux cylindres noirs à bout cuivré en attendant le modèle
    const BATT_K = 4;
    let battMat = null;
    const makeBattery = () => {
      const g = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 10), cellMat);
        cell.rotation.z = Math.PI / 2;
        cell.position.set(0, 0.021, (i - 0.5) * 0.045);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0212, 0.04, 10), capCopper);
        top.rotation.z = Math.PI / 2;
        top.position.set(0.075, 0.021, (i - 0.5) * 0.045);
        g.add(cell, top);
      }
      batteryModel.then((src) => {
        if (!src) return;
        battMat = battMat || baked(new THREE.MeshLambertMaterial({ map: src.map }));
        g.clear();
        for (let i = 0; i < 2; i++) {
          const m = new THREE.Mesh(src.geo, battMat);
          m.scale.setScalar(BATT_K);
          m.rotation.set(0, i * 0.35, Math.PI / 2); // couchées, pas tout à fait parallèles
          m.position.set(0, 0.0071 * BATT_K, (i - 0.5) * 0.0155 * BATT_K);
          g.add(m);
        }
      });
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
    const makeItem = (it) => {
      const g = it.kind === 'bottle' ? makeBottle() : it.kind === 'battery' ? makeBattery() : makeFloorLadder();
      g.position.set(it.x, 0, it.z);
      g.rotation.y = it.id * 1.7;
      group.add(g);
      return g;
    };
    const addItemMesh = (it) => itemMeshes.push({ it, g: makeItem(it), kind: it.kind });
    // un objet du sol peut changer de genre (échangé contre celui de la case choisie) ou de place (posé avec G, ou
    // tombé des poches d'un mort) : son maillage suit
    const syncItemMesh = (im) => {
      const { it } = im;
      if (im.kind !== it.kind) {
        group.remove(im.g);
        im.g = makeItem(it);
        im.kind = it.kind;
      } else if (im.g.position.x !== it.x || im.g.position.z !== it.z) im.g.position.set(it.x, 0, it.z);
    };
    for (const it of map.items || []) addItemMesh(it);
    // la clé de l'escalier : un trousseau sur un carton, au fond du noir ; un reflet de laiton quand la lampe passe dessus
    let keyGroup = null;
    let keyGlint = null;
    if (map.key) {
      keyGroup = new THREE.Group();
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.36), baked(new THREE.MeshLambertMaterial({ color: '#8a6a3e' })));
      card.position.y = 0.17;
      const kb = new THREE.MeshLambertMaterial({ color: '#c9a03a', emissive: '#4a3508', emissiveIntensity: 0.5 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16), kb);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-0.05, 0.345, 0);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.014), kb);
      shaft.position.set(0.035, 0.345, 0);
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.03), kb);
      bit.position.set(0.08, 0.345, 0.012);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.035), new THREE.MeshLambertMaterial({ color: '#b3261e', emissive: '#300', emissiveIntensity: 0.4 }));
      tag.position.set(-0.11, 0.343, 0.02);
      tag.rotation.y = 0.4;
      keyGlint = new THREE.Sprite(glintMat());
      keyGlint.scale.setScalar(0.22);
      keyGlint.position.set(0.02, 0.37, 0);
      keyGroup.add(card, ring, shaft, bit, tag, keyGlint);
      keyGroup.position.set(map.key.x, 0, map.key.z);
      keyGroup.rotation.y = (map.key.gx * 7 + map.key.gz) % 6;
      group.add(keyGroup);
    }

    // 8. Cages d'escalier : un puits fermé de murs, du sol de l'étage du bas au plafond de celui du haut, ouvert par une
    // baie en bas de la première volée (étage du bas) et une en haut de la seconde (étage du haut). Dehors, le papier
    // peint et la lumière cuite de l'étage ; dedans, une peinture jaunie (soubassement plus foncé et filet rouge qui
    // suivent la pente des marches) éclairée par trois appliques (de vraies lumières pour le prix d'aucune : un calcul
    // dans le matériau). Deux volées de 16 marches de 20 cm reliées par un palier à mi-hauteur, mains courantes au mur,
    // garde-corps du côté du vide, colonne sèche et extincteur. Rien de solide ne dépasse le plan intérieur des murs
    // (sinon, éclairé par les appliques, il perçait le mur côté couloir) ; les pièces fixes sont fusionnées.
    const C = CELL_SIZE;
    const HALF = FLOOR_DY / 2;
    const TOP = FLOOR_DY + WALL_HEIGHT; // hauteur du puits depuis le sol du bas
    const DOOR_H = 2.4;
    const JAMB = 0.16; // le mur de part et d'autre de la baie
    const IN = 0.07; // le plan intérieur des murs du puits
    const zAxis = new THREE.Vector3(0, 0, 1);
    const lowerHere = fi > 0 || floors.length === 1;
    let innerMat = null;
    const stairDoors = [];
    // dehors : chambranles, seuils et boîtiers, sous la lumière cuite de l'étage (un matériau par étage)
    let trimM = null;
    const trimMat = () => trimM || (trimM = baked(new THREE.MeshLambertMaterial({ vertexColors: true })));
    // couleurs par sommet (une pièce fusionnée, un seul matériau)
    const tint = new THREE.Color();
    const paintGeo = (g, col) => {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      const faces = Array.isArray(col) ? col : null;
      if (!faces) tint.set(col);
      for (let i = 0; i < n; i++) {
        if (faces) tint.set(faces[Math.min(5, Math.floor(i / 4))]); // BoxGeometry : 4 sommets par face (+x, -x, +y, -y, +z, -z)
        arr[i * 3] = tint.r;
        arr[i * 3 + 1] = tint.g;
        arr[i * 3 + 2] = tint.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const STEP = { tread: '#7d725a', riser: '#9a8f72', nose: '#3d3a32', metal: '#4a4740', plate: '#2f2d29', casing: '#7a6640', sill: '#5b5a55', red: '#a8251c', black: '#1c1b19', sign: '#e9eae4' };
    for (const st of map.stairs || []) {
      // repère de la cage : u le long des volées, v en travers ; y depuis le sol de cet étage
      const wx = (u, v) => st.ox + st.dx * u + st.px * v;
      const wz = (u, v) => st.oz + st.dz * u + st.pz * v;
      const solid = []; // dedans : marches, palier, rampes, appliques… (éclairés par les appliques)
      const trims = []; // dehors : chambranles, seuils, boîtier du panneau (lumière cuite de l'étage)
      const boxGeo = (u, v, y, su, sy, sv, col) => paintGeo(new THREE.BoxGeometry(st.dx ? su : sv, sy, st.dx ? sv : su), col).translate(wx(u, v), y, wz(u, v));
      const box = (u, v, y, su, sy, sv, col, list = solid) => list.push(boxGeo(u, v, y, su, sy, sv, col));
      // un pan de mur plat, de a à b (u, v), de y0 à y1, tourné vers n (u, v) ; le motif garde l'échelle du papier peint
      const pane = (a, b, y0, y1, n, mat) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.01 || y1 - y0 < 0.01) return;
        const geo = new THREE.PlaneGeometry(len, y1 - y0);
        const uv = geo.attributes.uv;
        // dedans, la peinture sur un enduit : les lés verticaux du papier, sans ses bordures haut et bas
        const flat = mat === innerMat;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / C), flat ? 0.42 + uv.getY(i) * 0.16 : y0 / WALL_HEIGHT + uv.getY(i) * ((y1 - y0) / WALL_HEIGHT));
        const m = new THREE.Mesh(geo, mat);
        m.position.set(wx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (y0 + y1) / 2, wz((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
        const nx = st.dx * n[0] + st.px * n[1];
        const nz = st.dz * n[0] + st.pz * n[1];
        m.rotation.y = Math.atan2(nx, nz);
        group.add(m);
      };
      // les 4 côtés du puits, à l'intérieur de la cage : [a, b, normale vers l'intérieur]
      const sides = [
        [[0, 0], [3 * C, 0], [0, 1]],
        [[3 * C, 2 * C], [0, 2 * C], [0, -1]],
        [[3 * C, 0], [3 * C, 2 * C], [-1, 0]],
        [[0, 2 * C], [0, 0], [1, 0]],
      ];
      const inset = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d];
      // un côté, percé d'une baie (v de b0 à b1, y de 0 à DOOR_H depuis yDoor) sur le côté u = 0. trim : raccourci
      // d'autant à chaque bout (dedans : les pans s'arrêtent aux angles intérieurs, sans traverser le mur du dehors)
      const wallSide = (s, d, y0, y1, n, mat, door, trim = 0) => {
        let [a, b] = [inset(s[0], s[2], d), inset(s[1], s[2], d)];
        if (trim) {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const e = [((b[0] - a[0]) / L) * trim, ((b[1] - a[1]) / L) * trim];
          a = [a[0] + e[0], a[1] + e[1]];
          b = [b[0] - e[0], b[1] - e[1]];
        }
        if (!door) return pane(a, b, y0, y1, n, mat);
        // le côté u = 0 va de v = 2C à v = 0
        const at = (v) => [a[0], v];
        const [d0, d1, dy] = door;
        pane(at(2 * C), at(d1), y0, y1, n, mat);
        pane(at(d0), at(0), y0, y1, n, mat);
        pane(at(d1), at(d0), y0, Math.max(y0, dy), n, mat);
        pane(at(d1), at(d0), Math.min(y1, dy + DOOR_H), y1, n, mat);
      };
      // les baies : en bas de la première volée (v de 0 à C), en haut de la seconde (v de C à 2C)
      const doorLow = [JAMB, C - JAMB, 0];
      const doorUp = [C + JAMB, 2 * C - JAMB, FLOOR_DY];
      const [d0, d1] = lowerHere ? doorLow : doorUp;
      // dehors : le mur au papier peint de cet étage, juste à l'intérieur de la limite des cases. Il descend sous le
      // sol et monte au-dessus du plafond du couloir : la moquette et les dalles s'arrêtent à la limite des cases, et
      // par la fente entre elles et le mur, on voyait le puits éclairé (un liseré de lumière au pied du mur)
      sides.forEach((s, k) => {
        const out = [-s[2][0], -s[2][1]];
        wallSide(s, 0.012, -0.3, CEIL + 0.3, out, wallMat, k === 3 ? [d0, d1, 0] : null);
      });
      // l'encadrement de la baie de cet étage : chambranle de bois peint, l'épaisseur du mur dans la baie (le tableau)
      // et un seuil d'acier un peu en relief (il couvre la jointure entre la moquette et la première marche)
      box(0.0, d0 - 0.04, DOOR_H / 2, 0.06, DOOR_H, 0.08, STEP.casing, trims);
      box(0.0, d1 + 0.04, DOOR_H / 2, 0.06, DOOR_H, 0.08, STEP.casing, trims);
      box(0.0, (d0 + d1) / 2, DOOR_H + 0.04, 0.06, 0.08, d1 - d0 + 0.16, STEP.casing, trims);
      box(0.05, d0 - 0.005, DOOR_H / 2, 0.1, DOOR_H, 0.01, STEP.casing, trims);
      box(0.05, d1 + 0.005, DOOR_H / 2, 0.1, DOOR_H, 0.01, STEP.casing, trims);
      box(0.05, (d0 + d1) / 2, DOOR_H + 0.005, 0.1, 0.01, d1 - d0, STEP.casing, trims);
      box(0.04, (d0 + d1) / 2, -0.056, 0.09, 0.128, d1 - d0, STEP.sill, trims);
      // au-dessus de la porte, côté couloir : le panneau lumineux vert de l'escalier (il luit tout seul, sans lumière)
      box(-0.035, (d0 + d1) / 2, DOOR_H + 0.27, 0.07, 0.2, 0.5, STEP.sign, trims);
      {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.17), exitSignMat());
        face.position.set(wx(-0.0705, (d0 + d1) / 2), DOOR_H + 0.27, wz(-0.0705, (d0 + d1) / 2));
        face.rotation.y = Math.atan2(-st.dx, -st.dz);
        group.add(face);
      }
      // Level 0 : une porte coupe-feu dans la baie de chaque étage, fermée par une chaîne et un cadenas tant que
      // personne n'a trouvé une des deux clés ; ensuite elle reste grande ouverte, rabattue contre le mur du couloir
      if (map.key) {
        const w = d1 - d0;
        const pivot = new THREE.Group();
        pivot.position.set(wx(-0.02, d1), 0, wz(-0.02, d1));
        const base = Math.atan2(st.pz, -st.px); // le long de la porte : de la charnière (v = d1) vers v = d0
        const zs = st.pz * -st.dx + -st.px * -st.dz > 0 ? 1 : -1; // le côté du couloir, dans le repère de la porte
        const sgn = -zs; // elle s'ouvre vers le couloir
        pivot.rotation.y = base;
        // l'acier peint de la porte (photo Poly Haven) ; ses chants restent unis
        const fireTex = textures.fireDoor.clone();
        fireTex.needsUpdate = true;
        textures.metalReady.then(() => (fireTex.needsUpdate = true));
        const steel = baked(new THREE.MeshLambertMaterial({ map: fireTex }));
        const dark = baked(new THREE.MeshLambertMaterial({ color: '#2b2c28' }));
        const brass = new THREE.MeshLambertMaterial({ color: '#b8902e', emissive: '#3a2a08', emissiveIntensity: 0.4 });
        // le battant, percé d'un hublot (au milieu, pour que les deux faces tombent au même endroit) : ses deux grandes
        // faces sont découpées par un masque, ses chants restent pleins
        const GW = 0.3; // largeur et hauteur du hublot
        const GH = 0.56;
        const GY = 1.5; // hauteur du centre du hublot
        const LH = DOOR_H - 0.012; // presque jusqu'au seuil (en bas) ; en haut, la butée du dormant couvre le jour
        const holeCv = document.createElement('canvas');
        holeCv.width = 128;
        holeCv.height = 256;
        {
          const g = holeCv.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, 128, 256);
          g.fillStyle = '#000';
          g.fillRect(((0.5 - GW / 2 / w) * 128) | 0, ((1 - (GY + GH / 2) / LH) * 256) | 0, Math.round((GW / w) * 128), Math.round((GH / LH) * 256));
        }
        const holeTex = new THREE.CanvasTexture(holeCv);
        holeTex.magFilter = THREE.NearestFilter;
        holeTex.minFilter = THREE.NearestFilter;
        holeTex.generateMipmaps = false;
        const steelHoled = baked(new THREE.MeshLambertMaterial({ map: fireTex, alphaMap: holeTex, alphaTest: 0.5 }));
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, LH, 0.05), [steel, steel, steel, steel, steelHoled, steelHoled]);
        leaf.position.set(w / 2, 0.004 + LH / 2, 0);
        // le cadre du hublot (une parclose d'acier un peu en relief) et le verre armé : teinté, assez opaque, on
        // devine la cage derrière à travers son grillage
        const frameMat = baked(new THREE.MeshLambertMaterial({ color: '#4a4d45' }));
        const fr = new THREE.Group();
        fr.position.set(w / 2, GY, 0);
        for (const [fx, fy, fw, fh] of [[0, GH / 2 + 0.015, GW + 0.06, 0.03], [0, -GH / 2 - 0.015, GW + 0.06, 0.03], [GW / 2 + 0.015, 0, 0.03, GH], [-GW / 2 - 0.015, 0, 0.03, GH]]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.066), frameMat);
          b.position.set(fx, fy, 0);
          fr.add(b);
        }
        const wireCv = document.createElement('canvas');
        wireCv.width = wireCv.height = 128;
        {
          const g = wireCv.getContext('2d');
          g.fillStyle = '#a7b2a8';
          g.fillRect(0, 0, 128, 128);
          // poussière et traces de doigts
          for (let i = 0; i < 260; i++) {
            g.fillStyle = `rgba(90,85,70,${Math.random() * 0.12})`;
            g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 10, 2 + Math.random() * 6);
          }
          // le grillage : un maillage carré de fil d'acier noyé dans le verre
          g.strokeStyle = 'rgba(40,40,36,0.85)';
          g.lineWidth = 1.4;
          for (let k = 0; k <= 128; k += 16) {
            g.beginPath();
            g.moveTo(k, 0);
            g.lineTo(k, 128);
            g.moveTo(0, k);
            g.lineTo(128, k);
            g.stroke();
          }
        }
        const wireTex = new THREE.CanvasTexture(wireCv);
        wireTex.wrapS = wireTex.wrapT = THREE.RepeatWrapping;
        wireTex.repeat.set(GW / 0.12, GH / 0.12);
        wireTex.anisotropy = 4;
        // éclairé comme le reste (sombre dans le noir, il ne luit pas) : on y voit surtout la lumière de la cage derrière
        const glassMat = baked(new THREE.MeshLambertMaterial({ map: wireTex, color: '#7a8a80', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), glassMat);
        glass.renderOrder = 2;
        fr.add(glass);
        // la barre anti-panique côté cage, une poignée côté couloir
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.06, 0.06), dark);
        bar.position.set(w * 0.55, 1.0, -zs * 0.06);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.05), dark);
        handle.position.set(w - 0.12, 1.0, zs * 0.05);
        // la chaîne en X sur la poignée et le chambranle, et le cadenas qui pend
        const lock = new THREE.Group();
        const chainMat = new THREE.MeshLambertMaterial({ color: '#8d8a80', emissive: '#1a1a18' });
        for (const a of [0.5, -0.5]) {
          const ch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.025), chainMat);
          ch.position.set(w - 0.02, 1.0, zs * 0.075);
          ch.rotation.z = a;
          lock.add(ch);
        }
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.03), brass);
        body.position.set(w - 0.02, 0.86, zs * 0.085);
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), chainMat);
        shackle.position.set(w - 0.02, 0.905, zs * 0.085);
        lock.add(body, shackle);
        // le vrai cadenas (Quaternius, « Padlock », CC0) remplace la boîte dessinée dès qu'il est chargé
        padlockModel.then((src) => {
          if (!src) return;
          const pl = src.clone();
          pl.position.set(w - 0.02, 0.855, zs * 0.088);
          pl.rotation.y = zs > 0 ? 0 : Math.PI;
          body.visible = false;
          shackle.visible = false;
          lock.add(pl);
        });
        pivot.add(leaf, fr, bar, handle, lock);
        group.add(pivot);
        // les butées du dormant, côté cage, derrière les chants du battant : par le jour autour de la porte fermée, on
        // voyait la cage éclairée (un filet de lumière dans le noir)
        box(0.018, d0 + 0.0175, DOOR_H / 2, 0.024, DOOR_H, 0.035, STEP.casing, trims);
        box(0.018, d1 - 0.0175, DOOR_H / 2, 0.024, DOOR_H, 0.035, STEP.casing, trims);
        box(0.018, (d0 + d1) / 2, DOOR_H - 0.0175, 0.024, 0.035, d1 - d0, STEP.casing, trims);
        stairDoors.push({ pivot, lock, base, sgn, open: 0, map });
      }
      if (trims.length) group.add(new THREE.Mesh(mergeGeometries(trims), trimMat()));
      if (!lowerHere) continue;

      // dedans : les matériaux éclairés par les appliques du puits
      const G = group.position.y;
      const lampsUV = [
        [0.45, 0.1, 2.6], // en bas, au-dessus du départ de la première volée
        [3 * C - 0.1, C, HALF + 2.3], // au-dessus du palier
        [C * 1.0, 2 * C - 0.1, FLOOR_DY + 2.35], // en haut, près de la sortie
      ];
      const shaftU = {
        uShaftL: { value: lampsUV.map(([u, v, y]) => new THREE.Vector3(wx(u, v), G + y, wz(u, v))) },
        uShaftK: { value: 1 },
        // le repère de la cage (pour la peinture qui suit la pente des marches)
        uStO: { value: new THREE.Vector3(st.ox, G, st.oz) },
        uStD: { value: new THREE.Vector4(st.dx, st.dz, st.px, st.pz) },
      };
      const shaftLit = (mat, dado = false) => {
        mat.customProgramCacheKey = () => (dado ? 'shaftDado' : 'shaft');
        mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, shaftU);
          sh.vertexShader = 'varying vec3 vShP;\nvarying vec3 vShN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            vShP = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vShN = normalize(mat3(modelMatrix) * objectNormal);`);
          let fs = 'uniform vec3 uShaftL[3];\nuniform float uShaftK;\nuniform vec3 uStO;\nuniform vec4 uStD;\nvarying vec3 vShP;\nvarying vec3 vShN;\n' + sh.fragmentShader;
          if (dado)
            fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
            {
              // la hauteur des marches devant ce point du mur : la première volée monte de 0 à HALF, le palier, la
              // seconde volée de HALF à l'étage du haut ; soubassement foncé jusqu'à 1,05 m au-dessus, puis un filet rouge
              vec2 q = vShP.xz - uStO.xz;
              float su = dot(q, uStD.xy);
              float sv = dot(q, uStD.zw);
              float fy = su >= ${(2 * C).toFixed(3)} ? ${HALF.toFixed(3)} : sv < ${C.toFixed(3)} ? max(su, 0.0) / ${(2 * C).toFixed(3)} * ${HALF.toFixed(3)} : ${HALF.toFixed(3)} + (${(2 * C).toFixed(3)} - su) / ${(2 * C).toFixed(3)} * ${HALF.toFixed(3)};
              float h = vShP.y - uStO.y - fy;
              float lowP = 1.0 - smoothstep(1.04, 1.05, h);
              float stripe = smoothstep(1.05, 1.06, h) * (1.0 - smoothstep(1.11, 1.12, h));
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.62, 0.5), lowP);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.06, 0.03), stripe * 0.85);
            }`);
          sh.fragmentShader = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              vec3 shN = normalize(vShN) * (gl_FrontFacing ? 1.0 : -1.0);
              vec3 shAcc = vec3(0.0);
              for (int i = 0; i < 3; i++) {
                vec3 d = uShaftL[i] - vShP;
                float d2 = dot(d, d);
                float ndl = max(dot(shN, d * inversesqrt(d2)), 0.0);
                shAcc += vec3(1.0, 0.9, 0.68) * (0.3 + 0.7 * ndl) / (1.0 + d2 * 0.16);
              }
              totalEmissiveRadiance += diffuseColor.rgb * shAcc * uShaftK * 1.25;
            }`);
        };
        return mat;
      };
      const paint = textures.wall.clone();
      paint.needsUpdate = true;
      textures.ready.then(() => {
        paint.needsUpdate = true;
      });
      innerMat = shaftLit(new THREE.MeshLambertMaterial({ map: paint, color: '#c8bf9c' }), true);
      sides.slice(0, 3).forEach((s) => wallSide(s, IN, 0, TOP, s[2], innerMat, null, IN));
      // le côté des baies, dedans : deux baies l'une au-dessus de l'autre (en haut à gauche, en bas à droite)
      {
        const s = sides[3];
        const a = inset(s[0], s[2], IN);
        const at = (v) => [a[0], v];
        const n = s[2];
        pane(at(2 * C - IN), at(doorUp[1]), 0, TOP, n, innerMat);
        pane(at(doorUp[1]), at(doorUp[0]), 0, FLOOR_DY, n, innerMat);
        pane(at(doorUp[1]), at(doorUp[0]), FLOOR_DY + DOOR_H, TOP, n, innerMat);
        pane(at(doorUp[0]), at(doorLow[1]), 0, TOP, n, innerMat);
        pane(at(doorLow[1]), at(doorLow[0]), DOOR_H, TOP, n, innerMat);
        pane(at(doorLow[0]), at(IN), 0, TOP, n, innerMat);
      }
      // le plafond du puits : juste entre ses murs (au-delà, il perçait le mur du couloir d'en haut d'un liseré clair)
      const ceilShaft = new THREE.Mesh(new THREE.PlaneGeometry((st.dx ? 3 * C : 2 * C) - 2 * IN, (st.dx ? 2 * C : 3 * C) - 2 * IN), shaftLit(new THREE.MeshLambertMaterial({ color: '#a59d86' })));
      ceilShaft.rotation.x = Math.PI / 2;
      ceilShaft.position.set(wx(1.5 * C, C), TOP - 0.03, wz(1.5 * C, C));
      group.add(ceilShaft);

      // les marches : giron de béton peint, contremarche plus claire, nez de marche antidérapant (un peu en avant de
      // la contremarche : aucune face confondue avec elle). La première et la dernière s'arrêtent au plan du mur.
      const stepCols = [STEP.riser, STEP.riser, STEP.tread, STEP.riser, STEP.riser, STEP.riser];
      const n = 16;
      const run = (2 * C) / n;
      const WL = C - 2 * IN; // largeur d'une volée, entre le mur et le garde-corps
      for (let i = 0; i < n; i++) {
        const hA = ((i + 1) * HALF) / n;
        const a0 = i === 0 ? IN : i * run; // la première marche part du seuil
        box((a0 + (i + 1) * run) / 2, C / 2, hA / 2, (i + 1) * run - a0, hA, WL, stepCols);
        box(a0 + run * 0.05 - 0.002, C / 2, hA + 0.004, run * 0.1 + 0.004, 0.012, WL, STEP.nose);
        const hB = HALF + hA;
        const b0 = i === n - 1 ? IN : 2 * C - (i + 1) * run; // la dernière marche s'arrête au seuil d'en haut
        box((b0 + 2 * C - i * run) / 2, 1.5 * C, hB / 2, 2 * C - i * run - b0, hB, WL, stepCols);
        box(2 * C - i * run - run * 0.05 + 0.002, 1.5 * C, hB + 0.004, run * 0.1 + 0.004, 0.012, WL, STEP.nose);
      }
      // le palier, à mi-hauteur, et le muret qui sépare les deux volées sous la seconde
      box(2.5 * C - IN / 2, C, HALF / 2, C - IN, HALF, 2 * C - 2 * IN, stepCols);
      box((IN + 2 * C) / 2, C, HALF / 2, 2 * C - IN, HALF, 0.14, STEP.riser);

      // une barre entre deux points (u, v, y)
      const mtx = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const bar = (a, b, th, col) => {
        const A = new THREE.Vector3(wx(a[0], a[1]), a[2], wz(a[0], a[1]));
        const B = new THREE.Vector3(wx(b[0], b[1]), b[2], wz(b[0], b[1]));
        const d = B.clone().sub(A);
        const g = paintGeo(new THREE.BoxGeometry(th, th, d.length()), col);
        g.applyMatrix4(mtx.compose(A.add(B).multiplyScalar(0.5), qq.setFromUnitVectors(zAxis, d.normalize()), one));
        solid.push(g);
      };
      // main courante fixée au mur, à 8 cm de lui (w : vers le mur, en u, v), consoles tous les ~1,2 m
      const wallRail = (a, b, w) => {
        bar([a[0], a[1], a[2] + 0.9], [b[0], b[1], b[2] + 0.9], 0.045, STEP.metal);
        const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 1.2));
        for (let j = 0; j <= k; j++) {
          const f = j / k;
          const u = a[0] + (b[0] - a[0]) * f;
          const v = a[1] + (b[1] - a[1]) * f;
          const y = a[2] + (b[2] - a[2]) * f + 0.88;
          bar([u, v, y], [u + w[0] * 0.08, v + w[1] * 0.08, y], 0.025, STEP.metal);
        }
      };
      // garde-corps du côté du vide : main courante, lisse et barreaux
      const guard = (a, b) => {
        bar([a[0], a[1], a[2] + 1.0], [b[0], b[1], b[2] + 1.0], 0.05, STEP.metal);
        bar([a[0], a[1], a[2] + 0.12], [b[0], b[1], b[2] + 0.12], 0.04, STEP.metal);
        const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.13));
        for (let j = 0; j <= k; j++) {
          const f = j / k;
          const y = a[2] + (b[2] - a[2]) * f;
          box(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, y + 0.56, 0.018, 0.88, 0.018, STEP.metal);
        }
      };
      const wv = IN + 0.08; // à 8 cm du mur intérieur
      wallRail([0.3, wv, 0.3 * HALF / (2 * C)], [2 * C, wv, HALF], [0, -1]);
      wallRail([2 * C, 2 * C - wv, HALF], [0.3, 2 * C - wv, FLOOR_DY - 0.3 * HALF / (2 * C)], [0, 1]);
      wallRail([2 * C + 0.1, wv, HALF], [3 * C - wv, wv, HALF], [0, -1]);
      wallRail([3 * C - wv, wv + 0.1, HALF], [3 * C - wv, 2 * C - wv - 0.1, HALF], [1, 0]);
      wallRail([3 * C - wv - 0.1, 2 * C - wv, HALF], [2 * C, 2 * C - wv, HALF], [0, 1]);
      // la seconde volée surplombe la première : un garde-corps sur son bord, du palier à l'étage du haut. Il s'arrête
      // à 3 cm du mur intérieur (jusqu'à u = 0, ses derniers barreaux traversaient le mur à côté de la porte du haut)
      const gEnd = IN + 0.03;
      guard([2 * C, C + 0.04, HALF], [gEnd, C + 0.04, HALF + ((2 * C - gEnd) / (2 * C)) * HALF]);

      // la colonne sèche des pompiers, rouge, dans le coin du palier (du sol du bas au plafond), et ses colliers
      {
        const cu = 3 * C - IN - 0.075;
        const cv = 2 * C - IN - 0.075;
        const pipe = paintGeo(new THREE.CylinderGeometry(0.045, 0.045, TOP - 0.06, 12), STEP.red).translate(wx(cu, cv), (TOP - 0.06) / 2, wz(cu, cv));
        solid.push(pipe);
        for (const y of [0.5, HALF - 0.4, HALF + 1.4, FLOOR_DY + 1.2, TOP - 0.8]) solid.push(paintGeo(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12), STEP.metal).translate(wx(cu, cv), y, wz(cu, cv)));
        // la vanne de la colonne, au palier
        box(cu - 0.09, cv, HALF + 0.75, 0.14, 0.05, 0.05, STEP.red);
        solid.push(paintGeo(new THREE.TorusGeometry(0.06, 0.012, 6, 16), STEP.black).rotateY(st.dx ? Math.PI / 2 : 0).translate(wx(cu - 0.17, cv), HALF + 0.75, wz(cu - 0.17, cv)));
      }
      // l'extincteur sur le mur du palier, sur son support
      {
        const eu = 3 * C - IN - 0.1;
        const ev = IN + 0.55;
        solid.push(paintGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 14), STEP.red).translate(wx(eu, ev), HALF + 0.4, wz(eu, ev)));
        solid.push(paintGeo(new THREE.SphereGeometry(0.075, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), STEP.red).translate(wx(eu, ev), HALF + 0.63, wz(eu, ev)));
        solid.push(paintGeo(new THREE.CylinderGeometry(0.022, 0.03, 0.08, 8), STEP.black).translate(wx(eu, ev), HALF + 0.73, wz(eu, ev)));
        box(eu - 0.03, ev, HALF + 0.77, 0.12, 0.018, 0.03, STEP.black);
        box(3 * C - IN - 0.012, ev, HALF + 0.45, 0.024, 0.32, 0.12, STEP.metal);
      }

      // les appliques : un hublot de verre dépoli dans une cage, sur une platine
      const glassOn = new THREE.Color('#fff2cc').multiplyScalar(2.6);
      const glassMat = new THREE.MeshBasicMaterial({ color: glassOn });
      const globes = [];
      const lampM = new THREE.Matrix4();
      for (const [u, v, y] of lampsUV) {
        // vers l'intérieur du puits depuis le mur où elle est fixée
        const inU = u > 2.5 * C ? -1 : 0;
        const inV = v < 0.5 ? 1 : v > 2 * C - 0.5 ? -1 : 0;
        const pos = new THREE.Vector3(wx(u + inU * -0.03, v + inV * -0.03), y, wz(u + inU * -0.03, v + inV * -0.03));
        lampM.compose(pos, qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(st.dx * inU + st.px * inV, st.dz * inU + st.pz * inV)), one);
        // (la platine affleure le mur : elle n'en dépasse pas de l'autre côté)
        solid.push(paintGeo(new THREE.BoxGeometry(0.22, 0.3, 0.03), STEP.plate).translate(0, 0, 0.015).applyMatrix4(lampM));
        globes.push(new THREE.SphereGeometry(0.1, 14, 10).scale(0.85, 1.15, 0.55).translate(0, 0, 0.075).applyMatrix4(lampM));
        for (const yy of [-0.06, 0, 0.06]) {
          const cage = paintGeo(new THREE.TorusGeometry(0.095, 0.006, 4, 16, Math.PI), STEP.plate).scale(0.95, 1, 1 - Math.abs(yy) * 3).rotateX(Math.PI / 2).translate(0, yy, 0.035);
          solid.push(cage.applyMatrix4(lampM));
        }
      }
      group.add(new THREE.Mesh(mergeGeometries(globes), glassMat));
      group.add(new THREE.Mesh(mergeGeometries(solid), shaftLit(new THREE.MeshLambertMaterial({ vertexColors: true }))));
      // le numéro de l'étage au pochoir, sur le mur du palier
      {
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 256;
        const g = cv.getContext('2d');
        g.fillStyle = 'rgba(40,36,28,0.86)';
        g.font = 'bold 54px Impact, "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.fillText('▲ UPPER', 128, 92);
        g.fillText('▼ LOWER', 128, 190);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const stencil = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), shaftLit(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        stencil.position.set(wx(3 * C - IN - 0.003, C), HALF + 1.6, wz(3 * C - IN - 0.003, C));
        stencil.rotation.y = Math.atan2(-st.dx, -st.dz);
        group.add(stencil);
      }
      shaftViews.push({ u: shaftU, glassMat, glassOn });
    }

    // 9. Level 1 : l'habillage de l'entrepôt (rayonnages à palettes, marchandises, tuyaux, lignes au sol, piliers, panneaux)
    const wh = L1 ? buildWarehouse({ map, group, baked, CEIL, textures }) : null;
    if (wh) group.userData.wh = wh; // (?debug : wh.off dessine tout, pour comparer)
    const hotel = L3 ? buildHotel({ map, group, baked, CEIL }) : null;
    // 9a. Level 1 : le matériel du jeu qui bouge (rideaux des quais, cloches d'alarme, grilles des gaines, écrans du poste)
    const gear = L1 && map.docks ? buildGear({ map, group, baked, wallMat, CEIL }) : null;
    // 9b. Level 2 : tuyauteries, lampes grillagées, grilles, chaudières, vannes et vapeur
    const pipesView = PIPES ? buildPipes({ map, group, baked, CEIL, tx: tx2, camera }) : null;
    if (pipesView) pipesView.setFog(scene.fog);

    // 10. Fusibles (Level 1) : un gros fusible céramique aux bouts de cuivre, lueur ambrée
    const fuseMeshes = [];
    const fuseBody = new THREE.MeshLambertMaterial({ color: '#efe9dc', emissive: '#4a3a20', emissiveIntensity: 0.22 });
    const fuseCap = new THREE.MeshLambertMaterial({ color: '#c98a2b', emissive: '#7a4a10', emissiveIntensity: 0.32 });
    const valveMat = new THREE.MeshLambertMaterial({ color: '#c0261d', emissive: '#4a0c08', emissiveIntensity: 0.3 });
    for (const f of map.fuses || []) {
      if (L2) {
        // un volant de vanne rouge : la jante, quatre rayons, le moyeu
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 24), valveMat));
        for (let k = 0; k < 2; k++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.025), valveMat);
          spoke.rotation.z = (k * Math.PI) / 2;
          g.add(spoke);
        }
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12).rotateX(Math.PI / 2), valveMat));
        g.add(new THREE.PointLight('#ff5a3c', 0.9, 3, 1.8));
        g.position.set(f.x, 0.9, f.z);
        group.add(g);
        fuseMeshes.push({ f, g });
        continue;
      }
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), fuseBody);
      body.rotation.z = Math.PI / 2;
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), fuseCap);
      c1.rotation.z = Math.PI / 2;
      c1.position.x = 0.15;
      const c2 = c1.clone();
      c2.position.x = -0.15;
      g.add(body, c1, c2, new THREE.PointLight('#ffb347', 1.1, 3.2, 1.8));
      g.position.set(f.x, 0.9, f.z);
      group.add(g);
      fuseMeshes.push({ f, g });
    }

    // 11. Brouillard froid au ras du sol. Level 1 : une vraie brume en volume, calculée pour chaque point de l'image
    // le long du regard jusqu'à ce qu'il touche (la profondeur de la scène) : pas de nappe plate qui couperait les
    // étagères d'un trait. Sa hauteur ondule (des bancs qui montent jusqu'au genou, des creux où elle rase le sol),
    // ses volutes dérivent, elle s'allume sous les réglettes (la lumière cuite au sol), reste noire loin des lampes,
    // et le faisceau de la lampe torche s'y dessine. Poolrooms : deux nappes de vapeur claire sur l'eau
    const fogLayers = [];
    let groundFog = null;
    if (L1) {
      const fogU = {
        tDepth: { value: null },
        uNoise: { value: fogNoise() },
        uBake: bakeUniforms.uBake,
        uBakeScale: bakeUniforms.uBakeScale,
        uBakeTint: bakeUniforms.uBakeTint,
        uBakeTint2: bakeUniforms.uBakeTint2,
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uLampPos: { value: new THREE.Vector3() },
        uLampDir: { value: new THREE.Vector3(0, 0, -1) },
        uLamp: { value: 0 },
        uFogDensity: { value: scene.fog.density },
        uFloorY: { value: group.position.y },
        uGlow: { value: 1 }, // l'éclat qu'elle prend sous les lampes
        uBeam: { value: 0.8 }, // et dans le faisceau de la lampe torche
        ...dynU,
        uK: { value: 0.6 }, // épaisseur de la brume (par mètre traversé, là où elle est la plus dense)
        uHaze: { value: 0.006 }, // la poussière en suspension dans tout l'entrepôt : ce qu'elle renvoie de la lumière des feux
        uHazeLamp: { value: 0.0035 }, // et du faisceau de la lampe torche
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: fogU,
        vertexShader: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
        fragmentShader: `uniform sampler2D tDepth;
uniform sampler2D uNoise;
uniform sampler2D uBake;
uniform vec2 uBakeScale;
uniform vec3 uBakeTint;
uniform vec3 uBakeTint2;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uLampPos;
uniform vec3 uLampDir;
uniform float uLamp;
uniform float uFogDensity;
uniform float uFloorY;
uniform float uK;
uniform float uGlow;
uniform float uBeam;
uniform vec4 uDynP[${NDYN}];
uniform vec3 uDynC[${NDYN}];
uniform vec4 uDynN[${NDYN}];
uniform float uHaze;
uniform float uHazeLamp;
varying vec2 vUv;
const float TOP = 1.0; // au-dessus, plus rien
const int N = 20;
${OCC_GLSL}
void main() {
  // le point de la scène vu par ce pixel, remis dans le monde
  float d = texture2D(tDepth, vUv).x;
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 wp = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
  vec3 rd = wp - uCam;
  float tScene = length(rd);
  float tEnd = min(tScene, 28.0); // au-delà, le noir du fond l'a déjà mangée
  rd = normalize(rd);
  // départ décalé d'un pixel à l'autre (pas de strates visibles)
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // 1. La poussière dans l'air, sur toute la hauteur : ce qu'elle renvoie vers nous de la lumière des feux. Pour
  // chaque feu, le bout de regard qui passe à sa portée, jusqu'au mur ou au sol qu'on voit (rien derrière) ;
  // échantillons équiangulaires (Kulla et Fajardo : serrés là où le regard frôle le feu, la lumière en 1/d² y est la
  // plus vive), diffusion plutôt vers l'avant (poussière : Henyey-Greenstein, g = 0,35), et l'ombre des murs, des
  // étagères et des rideaux entre le feu et chaque point. C'est le halo d'une lampe dans l'air poussiéreux, le
  // faisceau d'un gyrophare qui balaie l'allée ; caché derrière un mur, un feu n'en fait pas
  vec3 hz = vec3(0.0);
  float tH = min(tScene, 40.0);
  for (int k = 0; k < ${NDYN}; k++) {
    if (uHaze <= 0.0) break;
    float r = uDynP[k].w;
    if (r < 0.01) continue;
    vec3 lp = uDynP[k].xyz;
    vec3 oc = lp - uCam;
    float tc = dot(oc, rd);
    float h2 = max(dot(oc, oc) - tc * tc, 0.0);
    if (h2 >= r * r) continue;
    float hc = sqrt(r * r - h2);
    float ta = max(0.0, tc - hc);
    float tb = min(tH, tc + hc);
    if (ta >= tb) continue;
    float hh = sqrt(h2 + 0.02);
    float a0 = atan(ta - tc, hh);
    float a1 = atan(tb - tc, hh);
    vec3 n = uDynN[k].xyz;
    bool lobed = dot(n, n) > 0.25;
    vec3 lpF = vec3(lp.x, lp.y - uFloorY, lp.z);
    float acc = 0.0;
    for (int m = 0; m < 6; m++) {
      float t = tc + hh * tan(mix(a0, a1, (float(m) + j) / 6.0));
      vec3 p = uCam + rd * t;
      vec3 dv = lp - p;
      float dd = length(dv);
      float fall = 1.0 - dd / r;
      if (fall <= 0.0) continue;
      vec3 dl = dv / max(dd, 0.001);
      float lobe = lobed ? smoothstep(uDynN[k].w - 0.3, uDynN[k].w + 0.3, dot(-dl, n)) : 1.0;
      if (lobe <= 0.0) continue;
      float ph = 0.8775 / pow(1.1225 - 0.7 * dot(dl, rd), 1.5);
      acc += lobe * fall * fall * ph * occVis(vec3(p.x, p.y - uFloorY, p.z), lpF);
    }
    float tm = clamp(tc, ta, tb);
    hz += uDynC[k] * acc * (a1 - a0) / (hh * 6.0) * exp(-uFogDensity * uFogDensity * tm * tm);
  }
  hz *= uHaze;
  // la lampe torche : son faisceau dans la poussière (on le voit surtout de biais), jusqu'à ce qu'il touche
  if (uLamp > 0.01 && uHazeLamp > 0.0) {
    vec3 oc = uLampPos - uCam;
    float tc = dot(oc, rd);
    float h2 = max(dot(oc, oc) - tc * tc, 0.0);
    float tb = min(tScene, 24.0);
    float hh = sqrt(h2 + 0.01);
    float a0 = atan(-tc, hh);
    float a1 = atan(tb - tc, hh);
    float acc = 0.0;
    for (int m = 0; m < 6; m++) {
      float t = tc + hh * tan(mix(a0, a1, (float(m) + j) / 6.0));
      vec3 lv = uCam + rd * t - uLampPos;
      float ld = length(lv);
      float c = dot(lv / max(ld, 0.001), uLampDir);
      acc += smoothstep(0.89, 0.978, c) * 0.8775 / pow(1.1225 + 0.7 * dot(lv / max(ld, 0.001), rd), 1.5);
    }
    hz += vec3(1.0, 0.93, 0.8) * uLamp * uHazeLamp * acc * (a1 - a0) / (hh * 6.0);
  }
  // 2. La brume au sol : la part du regard qui passe sous son haut
  float y0 = uCam.y - uFloorY;
  float t0 = 0.0;
  float t1 = tEnd;
  if (y0 > TOP) {
    if (rd.y > -0.0005) { gl_FragColor = vec4(hz, 0.0); return; }
    t0 = (TOP - y0) / rd.y;
  } else if (rd.y > 0.0005) t1 = min(t1, (TOP - y0) / rd.y);
  if (t0 >= t1) { gl_FragColor = vec4(hz, 0.0); return; }
  // les feux de couleur vus depuis le milieu de ce bout de brume : un feu caché derrière un mur ne l'allume pas
  float fv[${NDYN}];
  {
    vec3 pm = uCam + rd * (0.5 * (t0 + t1));
    vec3 pmF = vec3(pm.x, pm.y - uFloorY, pm.z);
    float reach = 0.5 * (t1 - t0);
    for (int k = 0; k < ${NDYN}; k++) {
      float r = uDynP[k].w;
      fv[k] = 0.0;
      if (r < 0.01 || distance(uDynP[k].xyz, pm) > r + reach) continue;
      fv[k] = occVis(pmF, vec3(uDynP[k].x, uDynP[k].y - uFloorY, uDynP[k].z));
    }
  }
  // des pas serrés près de soi (le détail des volutes), plus longs au loin
  float T = 1.0;
  vec3 S = vec3(0.0);
  float span = t1 - t0;
  float ta = t0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.0) / float(N);
    float tb = t0 + span * f * f;
    float dt = tb - ta;
    float t = ta + dt * j;
    ta = tb;
    vec3 p = uCam + rd * t;
    float h = p.y - uFloorY;
    vec2 q = p.xz;
    // les bancs (lents, larges) fixent la hauteur de la nappe : par endroits elle monte au genou, ailleurs elle
    // rase le sol ; les volutes (déformées par les bancs, elles tournoient) la creusent, les filaments l'effilochent
    float bank = texture2D(uNoise, q * 0.036 + vec2(uTime * 0.0035, uTime * 0.0022) + h * 0.03).r;
    vec2 w = vec2(bank - 0.5, texture2D(uNoise, q * 0.021 - vec2(uTime * 0.002, 0.0)).r - 0.5) * 0.55;
    float curl = texture2D(uNoise, q * 0.11 + w + vec2(-uTime * 0.0105, uTime * 0.0068) + vec2(h * 0.19, -h * 0.13)).g;
    float fil = texture2D(uNoise, q * 0.27 + w * 1.6 + vec2(uTime * 0.017, -uTime * 0.011) + h * 0.35).b;
    float top = 0.05 + 0.82 * smoothstep(0.34, 0.95, bank);
    float dens = pow(clamp(1.0 - h / top, 0.0, 1.0), 1.25) * smoothstep(0.3, 0.8, curl) * (0.55 + 0.9 * fil);
    dens *= uK;
    if (dens < 0.002) continue;
    vec4 bk = texture2D(uBake, q * uBakeScale);
    float L = bk.r * 3.3;
    // la lumière des réglettes qui tombe là (et celle des feux colorés), un fond très sombre ailleurs
    vec3 light = vec3(0.010, 0.012, 0.015) + (uBakeTint * L * 0.34 + uBakeTint2 * bk.b * 1.6) * uGlow;
    // la lampe torche : un cône doux, plus vif près de la lampe
    vec3 lv = p - uLampPos;
    float ld = length(lv);
    float c = dot(lv / max(ld, 0.001), uLampDir);
    light += vec3(1.0, 0.93, 0.8) * smoothstep(0.89, 0.978, c) * uLamp * uBeam / (1.0 + ld * ld * 0.08);
    // les feux de couleur : le faisceau d'un gyrophare qui balaie la brume, le flash rouge d'une alarme
    for (int k = 0; k < ${NDYN}; k++) {
      float r = uDynP[k].w;
      if (fv[k] < 0.01) continue;
      vec3 dv = uDynP[k].xyz - p;
      float dd = length(dv);
      if (dd >= r) continue;
      float fall = 1.0 - dd / r;
      float att = fall * fall / (1.0 + dd * dd * 0.18);
      vec3 n = uDynN[k].xyz;
      if (dot(n, n) > 0.25) att *= smoothstep(uDynN[k].w - 0.3, uDynN[k].w + 0.3, dot(-dv / max(dd, 0.001), n));
      light += uDynC[k] * att * 0.4 * fv[k];
    }
    // au loin, la brume se perd dans le noir comme le reste
    float far = exp(-uFogDensity * uFogDensity * t * t);
    float tr = exp(-dens * dt);
    S += T * (1.0 - tr) * light * far;
    T *= tr;
  }
  gl_FragColor = vec4(S + hz, 1.0 - T);
}`,
        depthTest: false,
        depthWrite: false,
      });
      const lampP = new THREE.Vector3();
      const lampT = new THREE.Vector3();
      vhs.setFog((cam, depth) => {
        fogU.tDepth.value = depth;
        fogU.uInvProj.value.copy(cam.projectionMatrixInverse);
        fogU.uCamWorld.value.copy(cam.matrixWorld);
        fogU.uCam.value.setFromMatrixPosition(cam.matrixWorld);
        fogU.uFogDensity.value = scene.fog.density;
        flashLight.getWorldPosition(lampP);
        flashLight.target.getWorldPosition(lampT);
        fogU.uLampPos.value.copy(lampP);
        fogU.uLampDir.value.subVectors(lampT, lampP).normalize();
        fogU.uLamp.value = Math.min(1.2, flashLight.intensity / 17);
        return mat;
      });
      groundFog = { u: fogU };
      // l'éblouissement des lumières vives (gyrophares, flashs, diodes) : large, comme dans l'optique du caméscope
      vhs.setGlare(0.9);
    }
    if (L2) {
      for (const [y, o, rep, sp] of [[0.06, 0.32, 8, 0.01], [0.32, 0.16, 5, -0.006]]) {
        const t = textures.fog.clone();
        t.needsUpdate = true;
        t.repeat.set(rep, rep);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshBasicMaterial({ map: t, color: L2 ? '#f3fbfa' : '#3e4850', transparent: true, opacity: o, depthWrite: false }));
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
    const signMat = new THREE.MeshBasicMaterial({ color: '#ff3030' });
    const callMat = new THREE.MeshBasicMaterial({ color: '#ffb347' }); // les boutons d'appel
    const fuseLamps = [];
    // un ascenseur : celui de la sortie, ou (Level 1) celui d'où l'on vient d'arriver, le même modèle
    const buildLift = (E, arrival) => {
      const exitGroup = new THREE.Group();
      const doors = [];
      const sMat = arrival ? new THREE.MeshBasicMaterial({ color: '#ffb020' }) : signMat;
      const cMat = arrival ? new THREE.MeshBasicMaterial({ color: '#c2701c' }) : callMat;
      // repère local : -z regarde le couloir, la cabine est vers +z ; la façade est au ras des murs voisins (z = 0)
      const at = new THREE.Group();
      at.position.set(E.x - E.dx * (CELL_SIZE / 2), 0, E.z - E.dz * (CELL_SIZE / 2));
      at.rotation.y = Math.atan2(E.dx, E.dz);
      at.add(exitGroup);
      group.add(at);
      const DW = 1.2; // largeur de la baie
      const DH = 2.25;
      const FW = 0.11; // largeur du cadre d'inox
      const ZD = 0.17; // les portes, en retrait derrière le cadre
      // la façade : des pans plats au papier peint, à la même échelle que les murs voisins (pas de pan écrasé)
      const facade = (x0, x1, y0, y1) => {
        const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + CELL_SIZE / 2 + uv.getX(i) * (x1 - x0)) / CELL_SIZE, (y0 + uv.getY(i) * (y1 - y0)) / CEIL);
        const m = new THREE.Mesh(geo, wallMat);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        m.rotation.y = Math.PI; // tournée vers le couloir (-z)
        exitGroup.add(m);
      };
      const XF = DW / 2 + FW - 0.01; // la façade s'arrête sous le cadre (aucune face confondue avec lui)
      facade(-CELL_SIZE / 2, -XF, 0, CEIL);
      facade(XF, CELL_SIZE / 2, 0, CEIL);
      facade(-XF, XF, DH + FW - 0.01, CEIL);
      // le cadre d'inox brossé, en saillie de 3,5 cm sur la façade, jusqu'aux portes
      const inox = baked(new THREE.MeshPhongMaterial({ color: '#8f959b', specular: '#4a4d50', shininess: 38 }));
      const frameBox = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, ZD + 0.035), inox);
        m.position.set(x, y, (ZD - 0.035) / 2);
        exitGroup.add(m);
      };
      frameBox(FW, DH + FW, -DW / 2 - FW / 2, (DH + FW) / 2);
      frameBox(FW, DH + FW, DW / 2 + FW / 2, (DH + FW) / 2);
      frameBox(DW, FW, 0, DH + FW / 2);
      // le seuil d'aluminium strié
      const sill = new THREE.Mesh(new THREE.BoxGeometry(DW + 2 * FW, 0.012, ZD + 0.06), baked(new THREE.MeshLambertMaterial({ color: '#7d7f80' })));
      sill.position.set(0, 0.006, (ZD - 0.06) / 2 + 0.005);
      exitGroup.add(sill);
      // les deux vantaux d'inox brossé, un joint sombre entre eux ; ils s'effacent derrière la façade
      const steel = textures.steel.clone();
      steel.needsUpdate = true;
      textures.ready.then(() => {
        steel.needsUpdate = true;
      });
      const leafMat = baked(new THREE.MeshPhongMaterial({ map: steel, color: '#c9ced3', specular: '#5a5d60', shininess: 30 }));
      for (const sgn of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(DW / 2 - 0.004, DH, 0.035), leafMat);
        d.position.set(sgn * (DW / 4), DH / 2, ZD + 0.02);
        // le joint de caoutchouc au bord du vantail de droite : portes fermées, il bouche la fente entre les deux (on
        // ne voit plus la lumière de la cabine filtrer au milieu)
        if (sgn > 0) {
          const seal = new THREE.Mesh(new THREE.BoxGeometry(0.009, DH - 0.004, 0.028), new THREE.MeshLambertMaterial({ color: '#141516' }));
          seal.position.x = -DW / 4;
          d.add(seal);
        }
        exitGroup.add(d);
        doors.push({ d, sgn });
      }
      // la cabine, vue de l'intérieur : parois d'inox, sol de caoutchouc, plafonnier, main courante
      const CW = CELL_SIZE - 0.12;
      const CD = CELL_SIZE - ZD - 0.12;
      const CZ = ZD + 0.04 + CD / 2;
      // la lumière de la cabine : celle de son plafonnier, une dalle de 90 × 55 cm tournée vers le bas (quatre points
      // qui la représentent). Pour chaque point des parois : éclairement en 1/d², angle d'arrivée sur la paroi, angle
      // de sortie de la dalle (rien au-dessus d'elle), un reflet dans l'inox brossé, et le peu de lumière que les
      // parois se renvoient. La texture reste visible sans la lampe torche (avant : un gris uni, sans relief).
      at.updateMatrixWorld(true);
      const cabP = [];
      for (const sx of [-0.225, 0.225]) for (const sz of [-0.1375, 0.1375]) cabP.push(at.localToWorld(new THREE.Vector3(sx, 2.595, CZ + sz)));
      const cabU = { uCabP: { value: cabP }, uCabTint: { value: new THREE.Color('#fff2da') }, uCabK: { value: arrival ? 2.5 : 1.6 } };
      // (sur une matière déjà éclairée autrement, les vantaux : la lumière de la cabine s'ajoute ; la face tournée vers
      // le couloir ne voit pas le plafonnier, elle n'en reçoit rien)
      const cabLit = (mat, spec = 0) => {
        const prev = mat.onBeforeCompile;
        const prevKey = mat.customProgramCacheKey;
        if (!prev || prev === THREE.Material.prototype.onBeforeCompile) mat.emissive?.set(0x000000);
        mat.onBeforeCompile = (sh, r) => {
          if (prev) prev.call(mat, sh, r);
          Object.assign(sh.uniforms, cabU);
          const dec = 'varying vec3 vCabW;\nvarying vec3 vCabN;\n';
          sh.vertexShader = dec + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vCabW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vCabN = normalize(mat3(modelMatrix) * objectNormal);`);
          sh.fragmentShader = dec + 'uniform vec3 uCabP[4];\nuniform vec3 uCabTint;\nuniform float uCabK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec3 cn = normalize(vCabN);
    vec3 cv = normalize(cameraPosition - vCabW);
    float cE = 0.0;
    float cS = 0.0;
    for (int i = 0; i < 4; i++) {
      vec3 v = uCabP[i] - vCabW;
      float d2 = dot(v, v) + 0.05;
      vec3 l = v * inversesqrt(d2);
      float c = max(dot(cn, l), 0.0) * max(l.y, 0.0) / d2;
      cE += c;
      ${spec > 0 ? 'cS += c * pow(max(dot(cn, normalize(l + cv)), 0.0), 26.0);' : ''}
    }
    float cy = clamp((vCabW.y - uCabP[0].y) / 2.6 + 1.0, 0.0, 1.0);
    // le renvoi des parois : un peu plus près du sol éclairé, moins dans les angles du plafond
    float cB = 0.045 * (1.15 - 0.35 * cy);
    totalEmissiveRadiance += uCabTint * uCabK * (diffuseColor.rgb * (cE * 0.25 + cB) + ${spec.toFixed(2)} * cS * 0.25);
  }`);
        };
        // (la clé dit tout ce qui change le programme : la matière d'avant et la force du reflet, écrite dans le shader)
        const own = prevKey && prevKey !== THREE.Material.prototype.customProgramCacheKey;
        mat.customProgramCacheKey = () => (own ? prevKey.call(mat) : '') + '-cab' + spec.toFixed(2);
        return mat;
      };
      cabLit(leafMat, 0.5);
      const cabMat = cabLit(new THREE.MeshLambertMaterial({ map: steel, color: '#b3b8bc' }), 0.55);
      const cabPane = (w, h, x, y, z, ry, mat) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        exitGroup.add(m);
        return m;
      };
      cabPane(CW, 2.6, 0, 1.3, CZ + CD / 2, Math.PI, cabMat);
      cabPane(CD, 2.6, -CW / 2, 1.3, CZ, Math.PI / 2, cabMat);
      cabPane(CD, 2.6, CW / 2, 1.3, CZ, -Math.PI / 2, cabMat);
      // le mur au-dessus de la baie, vu de la cabine, et ses deux pans de part et d'autre : les vantaux s'y rangent quand
      // ils s'ouvrent (sans eux, une fois les portes refermées, on voyait le couloir à travers l'envers de la façade)
      cabPane(CW, 2.6 - DH, 0, DH + (2.6 - DH) / 2, ZD + 0.04, 0, cabMat);
      for (const sx of [-1, 1]) cabPane(CW / 2 - DW / 2, DH, sx * (CW / 2 + DW / 2) / 2, DH / 2, ZD + 0.04, 0, cabMat);
      // le plancher de tôle larmée (photo Poly Haven), éclairé par le plafonnier
      const tread = textures.treadPlate.clone();
      tread.needsUpdate = true;
      tread.repeat.set(2, 2);
      textures.metalReady.then(() => (tread.needsUpdate = true));
      const cabFloor = new THREE.Mesh(new THREE.PlaneGeometry(CW, CD), cabLit(new THREE.MeshLambertMaterial({ map: tread, color: '#9a9d9f' }), 0.3));
      cabFloor.rotation.x = -Math.PI / 2;
      cabFloor.position.set(0, 0.004, CZ);
      const cabCeil = new THREE.Mesh(new THREE.PlaneGeometry(CW, CD), cabLit(new THREE.MeshLambertMaterial({ color: '#6c6e70' })));
      cabCeil.rotation.x = Math.PI / 2;
      cabCeil.position.set(0, 2.6, CZ);
      const cabLamp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6dc').multiplyScalar(2.2) }));
      cabLamp.rotation.x = Math.PI / 2;
      cabLamp.position.set(0, 2.595, CZ);
      const handrail = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.3, 0.04, 0.04), cabLit(new THREE.MeshLambertMaterial({ color: '#9aa0a6' }), 0.8));
      handrail.position.set(0, 0.92, CZ + CD / 2 - 0.06);
      exitGroup.add(cabFloor, cabCeil, cabLamp, handrail);
      // l'habillage de la cabine : joints entre les panneaux d'inox, plinthes d'acier foncé, cadre du plafonnier et
      // grilles d'aération (une seule pièce fusionnée, à couleurs par sommet)
      {
        const parts = [];
        const tint = new THREE.Color();
        const piece = (w, h, d, x, y, z, col) => {
          const g = new THREE.BoxGeometry(w, h, d);
          tint.set(col);
          const n = g.attributes.position.count;
          const arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) arr.set([tint.r, tint.g, tint.b], i * 3);
          g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
          parts.push(g.translate(x, y, z));
        };
        const back = CZ + CD / 2;
        // les joints verticaux (deux par paroi) et les plinthes
        for (const f of [-1 / 3, 1 / 3]) {
          piece(0.012, 2.6, 0.006, f * CW, 1.3, back - 0.004, '#1b1c1d');
          for (const sx of [-1, 1]) piece(0.006, 2.6, 0.012, sx * (CW / 2 - 0.004), 1.3, CZ + f * CD, '#1b1c1d');
        }
        piece(CW - 0.02, 0.16, 0.012, 0, 0.08, back - 0.007, '#4a4c4e');
        for (const sx of [-1, 1]) piece(0.012, 0.16, CD - 0.02, sx * (CW / 2 - 0.007), 0.08, CZ, '#4a4c4e');
        // le cadre du plafonnier et deux grilles d'aération au plafond
        piece(1.0, 0.025, 0.05, 0, 2.585, CZ - 0.3, '#8f959b');
        piece(1.0, 0.025, 0.05, 0, 2.585, CZ + 0.3, '#8f959b');
        piece(0.05, 0.025, 0.65, -0.475, 2.585, CZ, '#8f959b');
        piece(0.05, 0.025, 0.65, 0.475, 2.585, CZ, '#8f959b');
        for (const sz of [-1, 1]) for (let k = 0; k < 5; k++) piece(0.32, 0.01, 0.012, sz * 0.78, 2.594, CZ - 0.12 + k * 0.06, '#151617');
        const trim = new THREE.Mesh(mergeGeometries(parts), cabLit(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.3));
        exitGroup.add(trim);
      }
      // le tableau de commande, sur la paroi de droite près des portes : la plaque d'inox gravée (étages, alarme), le
      // voyant de l'étage au-dessus, et le bouton de la descente (F), qui s'allume une fois pressé
      const btnMat = new THREE.MeshBasicMaterial({ color: '#d8d4c4' });
      {
        const cv = document.createElement('canvas');
        cv.width = 128;
        cv.height = 384;
        const g = cv.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 128, 0);
        gr.addColorStop(0, '#9aa0a5');
        gr.addColorStop(0.5, '#c3c8cc');
        gr.addColorStop(1, '#8e9499');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 384);
        for (let i = 0; i < 160; i++) {
          g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
          g.fillRect(0, Math.random() * 384, 128, 1);
        }
        // l'écran de l'étage
        g.fillStyle = '#0b0b0b';
        g.fillRect(24, 22, 80, 54);
        g.fillStyle = '#ff3b2f';
        g.font = 'bold 40px "Courier New", monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(arrival ? '1' : L0 ? '0' : L1 ? '1' : L2 ? '37' : '2', 64, 50);
        // les boutons gravés (le dernier, la descente, est le vrai bouton en relief)
        g.strokeStyle = '#55595c';
        g.lineWidth = 3;
        g.fillStyle = '#2c2f31';
        g.font = 'bold 18px Arial, sans-serif';
        const labels = ['3', '2', '1', '0', '-1', '🔔'];
        labels.forEach((t, i) => {
          const x = i % 2 ? 88 : 40;
          const y = 120 + Math.floor(i / 2) * 58;
          g.beginPath();
          g.arc(x, y, 17, 0, Math.PI * 2);
          g.stroke();
          g.fillText(t, x, y + 1);
        });
        g.fillText('▼', 64, 344);
        g.beginPath();
        g.arc(64, 300, 24, 0, Math.PI * 2);
        g.stroke();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.6), cabLit(new THREE.MeshLambertMaterial({ map: tex }), 0.4));
        plate.position.set(CW / 2 - 0.014, 1.25, ZD + 0.42);
        plate.rotation.y = -Math.PI / 2;
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 20), btnMat);
        btn.rotation.z = Math.PI / 2;
        // (l'écran de l'étage au-dessus du bouton : en haut de la plaque ; le bouton, en bas)
        btn.position.set(CW / 2 - 0.02, 1.25 - 0.3 + (384 - 300) / 384 * 0.6, ZD + 0.42);
        exitGroup.add(plate, btn);
      }
      // une caméra de surveillance dans le coin du fond (Poly Haven, security_camera_01, CC0), braquée sur la porte
      loader.load(MODELS + 'security_camera_01.glb', (g) => {
        const cam = g.scene;
        cam.traverse((o) => {
          if (o.isMesh) o.material = cabLit(new THREE.MeshLambertMaterial({ map: o.material.map || null, color: o.material.map ? '#ffffff' : '#9a9a9a' }), 0.2);
        });
        const box = new THREE.Box3().setFromObject(cam);
        const k = 0.32 / Math.max(0.01, box.max.x - box.min.x, box.max.z - box.min.z);
        cam.scale.multiplyScalar(k);
        cam.position.set(CW / 2 - 0.16, 2.6 - (box.max.y - box.min.y) * k - 0.02, CZ + CD / 2 - 0.16);
        cam.rotation.y = Math.PI * 0.75;
        exitGroup.add(cam);
      }, undefined, () => {});
      if (!arrival) {
        const cabinLight = new THREE.PointLight('#f4f1e0', 2.5, 4, 1.5);
        cabinLight.name = 'cabin';
        cabinLight.position.set(0, 2.4, CZ);
        exitGroup.add(cabinLight);
      }
      // l'indicateur au-dessus des portes : un boîtier d'inox et sa vitre dépolie (flèches rouges, vertes une fois ouvert)
      const ind = document.createElement('canvas');
      ind.width = 128;
      ind.height = 48;
      const g = ind.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 48);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(34, 10);
      g.lineTo(50, 36);
      g.lineTo(18, 36);
      g.fill();
      g.beginPath();
      g.moveTo(94, 38);
      g.lineTo(110, 12);
      g.lineTo(78, 12);
      g.fill();
      const indTex = new THREE.CanvasTexture(ind);
      indTex.colorSpace = THREE.SRGBColorSpace;
      sMat.map = indTex;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 0.05), inox);
      housing.position.set(0, DH + FW + 0.2, -0.025);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.12), sMat);
      sign.position.set(0, DH + FW + 0.2, -0.051);
      sign.rotation.y = Math.PI;
      exitGroup.add(housing, sign);
      // la boîte à boutons (au Level 1 : le panneau aux 3 fusibles)
      if ((L1 || L2) && !arrival) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.08), baked(new THREE.MeshLambertMaterial({ color: '#3b4a2f' })));
        panel.position.set(DW / 2 + FW + 0.3, 1.3, -0.04);
        exitGroup.add(panel);
        for (let i = 0; i < FUSES; i++) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), new THREE.MeshBasicMaterial({ color: '#331010' }));
          lamp.position.set(DW / 2 + FW + 0.3, 1.45 - i * 0.15, -0.09);
          exitGroup.add(lamp);
          fuseLamps.push(lamp);
        }
      } else {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.012), inox);
        plate.position.set(DW / 2 + FW + 0.22, 1.12, -0.006);
        exitGroup.add(plate);
        for (const [y, i] of [[1.17, 0], [1.07, 1]]) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 16), cMat);
          b.rotation.x = Math.PI / 2;
          b.position.set(DW / 2 + FW + 0.22, y, -0.018);
          exitGroup.add(b);
        }
      }
      // le mur qui prend sa place s'il est faux
      // (la cabine d'arrivée descend encore, portes fermées)
      if (arrival) return { exitGroup, doors, fakeWall: null, open: 0, btnMat, cabU };
      const fakeWall = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, CEIL, 0.14), wallMat);
      fakeWall.position.set(0, CEIL / 2, 0.07);
      fakeWall.visible = false;
      at.add(fakeWall);
      return { exitGroup, doors, fakeWall, btnMat, cabU };
    };
    const lift = E && !E.fire ? buildLift(E, false) : null; // Level 5 : la porte de secours est dans view/hotel.js
    const exitGroup = lift ? lift.exitGroup : new THREE.Group();
    const doors = lift ? lift.doors : [];
    const fakeWall = lift ? lift.fakeWall : null;
    // Level 1 : l'ascenseur d'arrivée, portes ouvertes, qui se referment derrière les joueurs
    const arrivalLift = map.arrival ? buildLift(map.arrival, true) : null;
    // la lueur du voyant sur le couloir : discrète (elle ne teint plus tout le couloir en rouge)
    const exitLight = new THREE.PointLight('#ff2020', 1, 5, 1.8);
    exitLight.position.set(map.exit.x - (E ? E.dx : 0) * 1.6, 2.5, map.exit.z - (E ? E.dz : 0) * 1.6);
    group.add(exitLight);
    let doorOpen = 0;

    let lit = true;
    let powerFlick = 0;
    let flickT = 0;
    let alarmT = 0;
    let redCut = 0; // phase rouge : tout éteint encore tant de secondes
    let redNext = 6; // avant la prochaine coupure
    let redBack = 0; // le rallumage qui hoquette, au retour d'une coupure
    const setPower = (v) => {
      if (v === power) return;
      power = v;
      ambient.intensity = v ? AMB : 0;
      for (const l of map.lights) {
        fixColor(l, power && l.state !== 'off');
        l.k = power && l.state !== 'off' ? 1 : 0;
      }
      fixDirty();
      writeBake();
      for (const sv of shaftViews) {
        sv.u.uShaftK.value = v && !alarm ? 1 : 0.04;
        sv.glassMat.color.copy(v && !alarm ? sv.glassOn : new THREE.Color(alarm ? '#4a0805' : '#3a3528'));
      }
    };

    // --- Recoins calmes (Level 0) : un lampadaire de salon, un vieux fauteuil, une radio posée par terre. La lampe
    // éclaire pour de vrai, par le second canal de la lumière cuite (teinte chaude, arrêtée par les murs) : pas de
    // lumière en plus, qui ferait recompiler tous les matériaux. Quand le recoin s'use, la lampe grésille puis s'éteint
    const nooks = [];
    if (L0 && map.calm && map.calm.length) {
      const canvasTex = (w, h, draw) => {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        draw(cv.getContext('2d'), w, h);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };
      // l'abat-jour : un tissu crème plissé, éclairé par transparence, plus vif vers le bas où l'ampoule est proche
      const shadeTex = canvasTex(256, 64, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#c98a4c');
        gr.addColorStop(0.55, '#f1c58a');
        gr.addColorStop(1, '#ffe2b0');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 4) {
          g.fillStyle = `rgba(120, 70, 30, ${0.05 + ((x * 37) % 11) * 0.006})`;
          g.fillRect(x, 0, 1.5, h);
        }
        g.fillStyle = 'rgba(110, 64, 28, 0.35)';
        g.fillRect(0, 0, w, 3);
        g.fillRect(0, h - 3, w, 3);
      });
      // la toile du haut-parleur de la radio : une trame brune et des lattes
      const grilleTex = canvasTex(64, 64, (g, w, h) => {
        g.fillStyle = '#6b5236';
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 2) {
          g.fillStyle = 'rgba(40, 26, 14, 0.25)';
          g.fillRect(0, y, w, 1);
        }
        for (let x = 0; x < w; x += 2) {
          g.fillStyle = 'rgba(40, 26, 14, 0.18)';
          g.fillRect(x, 0, 1, h);
        }
        for (let x = 6; x < w; x += 13) {
          g.fillStyle = '#3a2614';
          g.fillRect(x, 0, 4, h);
        }
      });
      const brass = baked(new THREE.MeshLambertMaterial({ color: '#7a6644' }));
      const darkMetal = baked(new THREE.MeshLambertMaterial({ color: '#2e2a24' }));
      const walnut = baked(new THREE.MeshLambertMaterial({ color: '#5c3b22' }));
      const bakelite = baked(new THREE.MeshLambertMaterial({ color: '#241a12' }));
      const grilleMat = baked(new THREE.MeshLambertMaterial({ map: grilleTex }));
      const shadeGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.3, 40, 1, true);
      const chairs = [];
      for (const n of map.calm) {
        const g = new THREE.Group();
        // le fond du cul-de-sac : (dx, dz) pointe vers le mur du fond ; (sx, sz) sur le côté
        const sx = -n.dz;
        const sz = n.dx;
        const face = Math.atan2(-n.dx, -n.dz); // regarder l'entrée du recoin
        // le lampadaire, dans un coin du fond : pied lesté, tige à rotule, abat-jour de tissu, l'ampoule dessous
        const lx = n.x + n.dx * 0.85 + sx * 0.75;
        const lz = n.z + n.dz * 0.85 + sz * 0.75;
        const lamp = new THREE.Group();
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.035, 32), darkMetal);
        foot.position.y = 0.018;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMetal);
        dome.scale.y = 0.18;
        dome.position.y = 0.035;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 1.32, 10), brass);
        pole.position.y = 0.7;
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), brass);
        joint.position.y = 1.36;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), brass);
        neck.position.y = 1.44;
        const shadeMat = new THREE.MeshBasicMaterial({ map: shadeTex, color: '#ffffff', side: THREE.FrontSide });
        const innerMat = new THREE.MeshBasicMaterial({ color: '#fff0d0', side: THREE.BackSide });
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.y = 1.55;
        const inner = new THREE.Mesh(shadeGeo, innerMat);
        inner.position.y = 1.55;
        const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), bulbMat);
        bulb.position.y = 1.5;
        lamp.add(foot, dome, pole, joint, neck, shade, inner, bulb);
        lamp.position.set(lx, 0, lz);
        // la radio, par terre au pied de la lampe : caisse de noyer arrondie, toile, cadran qui luit, deux boutons
        const radio = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.15), walnut);
        box.position.y = 0.1;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.38, 16, 1, false, 0, Math.PI), walnut);
        top.rotation.z = Math.PI / 2; // le demi-cylindre couché sur la caisse : un dessus arrondi
        top.scale.x = 0.7;
        top.position.y = 0.2;
        const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), grilleMat);
        grille.position.set(-0.08, 0.11, 0.0755);
        const dialMat = new THREE.MeshBasicMaterial({ color: '#ffcc77' });
        const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045), dialMat);
        dial.position.set(0.1, 0.14, 0.0755);
        radio.add(box, top, grille, dial);
        for (const kx of [0.06, 0.14]) {
          const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.02, 14), bakelite);
          knob.rotation.x = Math.PI / 2;
          knob.position.set(kx, 0.065, 0.085);
          radio.add(knob);
        }
        radio.position.set(lx - sx * 0.45 - n.dx * 0.1, 0, lz - sz * 0.45 - n.dz * 0.1);
        radio.rotation.y = face + 0.25;
        g.add(lamp, radio);
        group.add(g);
        // le fauteuil, le dos au mur du fond, un peu de biais vers la lampe
        chairs.push({ x: n.x + n.dx * 0.5 - sx * 0.4, z: n.z + n.dz * 0.5 - sz * 0.4, rot: face - 0.4 });
        // la lumière de la lampe : chaude, assez forte tout près, éteinte vers 3,5 m ; les murs l'arrêtent
        const fp = footprint({ x: lx, z: lz }, { r: 3.8, fall: 2.3, gain: 1.6 });
        const v = { n, shadeMat, innerMat, bulbMat, dialMat, fp, on: 1, k: 1, baked: 1 };
        nooks.push(v);
        nookLamps.push(v);
      }
      // le fauteuil : le modèle Poly Haven des objets abandonnés, avec sa photo de couleur
      loader.load(MODELS + 'modern_arm_chair_01.glb', (gl) => {
        const root = gl.scene;
        root.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const c = new THREE.Vector3();
        bb.getSize(size);
        bb.getCenter(c);
        const k = 0.86 / (size.y || 1);
        const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z));
        const places = chairs.map((ch) => new THREE.Matrix4().makeTranslation(ch.x, 0, ch.z).multiply(new THREE.Matrix4().makeRotationY(ch.rot)).multiply(fix));
        const K = cullKind(bb, places);
        root.traverse((o) => {
          if (!o.isMesh) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          cullSet(o, propMat(src), places, K);
        });
      }, undefined, () => {});
      writeBake();
    }
    const shadeCol = new THREE.Color();
    const updateNooks = (time) => {
      let dirty = false;
      for (const v of nooks) {
        const w = v.n.wear || 0;
        // usé : la lampe grésille de plus en plus, puis s'éteint presque tout à fait
        let on = 1;
        if (alarm || (casc && casc.dark)) on = 0; // la phase rouge (et le noir qui l'annonce) : la lampe de salon s'éteint aussi
        else if (w >= 1) on = Math.random() < 0.04 ? 0.6 : 0.05;
        else if (w > 0.75) on = Math.random() < (w - 0.75) * 0.5 ? 0.25 : 1;
        v.on += (on - v.on) * 0.5;
        v.k = v.on;
        if (Math.abs(v.k - v.baked) > 0.02) dirty = true;
        const e = v.on;
        v.shadeMat.color.setRGB(0.1 + 0.95 * e, 0.09 + 0.88 * e, 0.08 + 0.8 * e);
        v.innerMat.color.copy(shadeCol.setRGB(1, 0.94, 0.82).multiplyScalar(0.12 + 1.1 * e));
        v.bulbMat.color.setRGB(0.15 + 1.2 * e, 0.13 + 1.15 * e, 0.1 + 1.0 * e);
        v.dialMat.color.setRGB(Math.max(0.15, e), 0.8 * Math.max(0.15, e), 0.45 * Math.max(0.15, e));
      }
      if (dirty && !alarm) {
        for (const v of nooks) v.baked = v.k;
        writeBake();
      }
    };

    // la couleur de la lumière reçue en un point (comme le shader la calcule pour les murs) : la lumière blanche des
    // néons et le second canal (les feux rouges de la fin, les tubes froids du Level 2), chacun dans sa teinte ; floor :
    // un plancher de lumière blanche (la cage d'escalier et ses appliques)
    const lightTmp = new THREE.Color();
    const lightColorAt = (x, z, out, floor = 0) => {
      const tx = Math.floor(x / TX);
      const tz = Math.floor(z / TX);
      const ok = power && tx >= 0 && tz >= 0 && tx < BW && tz < BH;
      const w = Math.max(floor, ok ? live[tz * BW + tx] : 0);
      const b = ok ? liveB[tz * BW + tx] : 0;
      out.copy(bakeUniforms.uBakeTint.value).multiplyScalar(0.07 + w * 1.1);
      return out.add(lightTmp.copy(bakeUniforms.uBakeTint2.value).multiplyScalar(b * 1.1));
    };

    // Les objets de cet étage que l'image peut montrer : dans le champ de la caméra (la vraie, après ses secousses), en
    // deçà de son plan lointain, et à cet étage (ou près d'un trou ou de la cage par où on voit l'autre) ; plus, s'il y
    // en a un, ceux que peut montrer le caméscope du coéquipier en médaillon. Les autres ne changeraient pas un pixel :
    // on ne les dessine pas. Les matrices ne sont renvoyées que si la liste a changé
    const cull = (V) => {
      const here = V.band === fi || V.shaft;
      const insetHere = V.inset && (V.iBand === fi || V.iAll);
      if (wh) wh.cull(V, here, insetHere);
      if (!propKinds.length) return;
      const gy = group.position.y;
      for (const K of propKinds) {
        let n = 0;
        let ch = false;
        for (let i = 0; i < K.xs.length; i++) {
          const x = K.xs[i];
          const y = gy + K.cys[i];
          const z = K.zs[i];
          let ok = false;
          if (here || K.near[i]) {
            const dx = x - V.cam.x;
            const dy = y - V.cam.y;
            const dz = z - V.cam.z;
            if (dx * V.fwd.x + dy * V.fwd.y + dz * V.fwd.z - K.r <= V.R) {
              V.sph.center.set(x, y, z);
              V.sph.radius = K.r;
              ok = V.fr.intersectsSphere(V.sph);
            }
          }
          if (!ok && V.inset && (insetHere || K.near[i])) {
            V.sph.center.set(x, y, z);
            V.sph.radius = K.r;
            ok = V.ifr.intersectsSphere(V.sph);
          }
          if (!ok) continue;
          if (K.vis[n] !== i) ch = true;
          K.vis[n++] = i;
        }
        if (n !== K.n) ch = true;
        K.n = n;
        K.changed = ch;
      }
      for (const S of propSets) {
        const K = S.kind;
        if (!K.changed && S.inst.count === K.n) continue;
        const arr = S.inst.instanceMatrix.array;
        for (let j = 0; j < K.n; j++) {
          const o = j * 16;
          const m = K.vis[j] * 16;
          for (let q = 0; q < 16; q++) arr[o + q] = S.mats[m + q];
        }
        S.inst.count = K.n;
        S.inst.instanceMatrix.needsUpdate = true;
      }
    };

    return {
      cull,
      lightAt,
      lightColorAt,
      // la phase rouge est lancée à cet étage (après la vague d'extinction) : les alarmes peuvent hurler
      get redOn() {
        return !!alarm;
      },
      // une image : objets, cassettes, ascenseur, néons de cet étage
      nooks,
      gear,
      // qualité basse : sans les ombres des feux de couleur ni la lumière renvoyée par la poussière (plus léger)
      lightQuality(low) {
        if (dynU.uOccInfo) dynU.uOccInfo.value.w = low ? 0 : 1;
        if (groundFog) {
          groundFog.u.uHaze.value = low ? 0 : 0.006;
          groundFog.u.uHazeLamp.value = low ? 0 : 0.0035;
        }
      },
      update(sim, P, time, dt) {
        bakeUniforms.uTime.value = time;
        if (gear) {
          gear.update(sim, P, time, dt);
          // les feux de couleur : les plus proches de la caméra (au bord de leur portée), dans les cases du shader
          dynList.length = 0;
          gear.lights(dynList);
          occDocks();
          if (dynU.uOccDoorK) dynU.uOccDoorK.value.x = gear.doorK > 0.25 ? 0 : 1;
          // l'ascenseur d'arrivée, portes ouvertes : la lumière de sa cabine déborde sur le couloir
          if (arrivalLift && arrivalLift.open > 0.02) {
            const A = map.arrival;
            const k = arrivalLift.open;
            dynList.push({ x: A.x - A.dx * (CELL_SIZE / 2 + 0.2), y: 2.0, z: A.z - A.dz * (CELL_SIZE / 2 + 0.2), r: 1.25 * k, g: 1.15 * k, b: 0.95 * k, rad: 6, nx: -A.dx, ny: -0.35, nz: -A.dz, w: 0.05 });
          }
          const cx = camera.position.x;
          const cz = camera.position.z;
          for (const L of dynList) L.d = Math.hypot(L.x - cx, L.z - cz) - L.rad;
          dynList.sort((a, b) => a.d - b.d);
          for (let i = 0; i < NDYN; i++) {
            const L = dynList[i];
            if (L && L.d < 6) {
              dynU.uDynP.value[i].set(L.x, L.y + group.position.y, L.z, L.rad);
              dynU.uDynC.value[i].set(L.r, L.g, L.b);
              dynU.uDynN.value[i].set(L.nx, L.ny, L.nz, L.w);
            } else {
              dynU.uDynP.value[i].set(0, -100, 0, 0.001);
              dynU.uDynC.value[i].set(0, 0, 0);
            }
          }
        }
        // les gouttes : elles tombent du plafond (un peu plus d'une demi-seconde), puis des ronds dans la flaque
        for (const d of drips) {
          const u = (time + d.phase) / d.period;
          const n = Math.floor(u);
          const f = u - n;
          const fall = 0.62 / d.period;
          d.drop.visible = f < fall;
          if (f < fall) d.drop.position.set(d.x, CEIL - 0.03 - (CEIL - 0.03) * (f / fall) * (f / fall), d.z);
          const rf = (f - fall) / (1 - fall);
          d.ring.material.opacity = f >= fall ? 0.45 * (1 - rf) : 0;
          d.ring.scale.setScalar(0.03 + rf * 0.35);
          if (f >= fall && d.last !== n) {
            d.last = n;
            if (api.onDrip && (P.floor || 0) === fi && Math.hypot(P.x - d.x, P.z - d.z) < 14) api.onDrip({ x: d.x, z: d.z });
          }
        }
        if (nooks.length) updateNooks(time);
        if (water) {
          water.update(sim, P, time, dt, camera);
          bakeUniforms.uWaterY.value = water.level;
        }
        if (hotel) hotel.update(sim, P, time, dt);

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

        // Level 2 : un secteur dont les néons ont sauté (ou que son disjoncteur a rallumé)
        if ((map.lightGen || 0) !== lightGen) {
          lightGen = map.lightGen || 0;
          sumLights();
          for (const l of map.lights) {
            l.k = l.state !== 'off' ? 1 : 0;
            fixColor(l, power && l.state !== 'off');
          }
          fixDirty();
          writeBake();
        }

        // Cassettes et objets
        for (const cm of cassetteMeshes) {
          const here = !cm.cas.collected;
          if (cm.cas.high) showGroup(cm.group, here);
          else cm.group.visible = here;
          if (here && cm.cas.high) {
            // dans le renfoncement : elle ne tourne pas, elle regarde la pièce
            cm.group.rotation.y = Math.atan2(-N.dx, -N.dz);
          } else if (here && cm.group.userData.glint) glintIn(cm.group.userData.glint, cm.cas.x, cm.cas.z, P, fi, time);
        }
        // objets au sol (ceux qu'un échange a posés apparaissent)
        const items = map.items || [];
        for (let i = itemMeshes.length; i < items.length; i++) addItemMesh(items[i]);
        for (const im of itemMeshes) {
          if (!im.it.taken) syncItemMesh(im);
          im.g.visible = !im.it.taken;
        }
        // la clé, puis la porte de l'escalier qui s'ouvre (vite, d'un coup de pied) une fois la clé trouvée
        if (keyGroup) {
          keyGroup.visible = !map.key.taken;
          if (keyGlint && keyGroup.visible) glintIn(keyGlint, map.key.x, map.key.z, P, fi, time);
        }
        for (const D of stairDoors) {
          const want = D.map.key && !D.map.key.taken ? 0 : 1;
          D.open += Math.sign(want - D.open) * Math.min(Math.abs(want - D.open), dt / 0.7);
          D.lock.visible = D.open < 0.05;
          D.pivot.rotation.y = D.base + D.sgn * (1 - Math.pow(1 - D.open, 3)) * 1.75;
        }
        if (placedLadder) placedLadder.visible = !!(N && N.ladder);

        // Ascenseur : rouge verrouillé, vert ouvert ; le faux devient un mur (couleurs en nombres : à chaque image,
        // pas de texte à relire)
        const fake = !!(E && E.fake);
        const open = sim.open && !fake;
        showGroup(exitGroup, !fake);
        if (fakeWall) fakeWall.visible = fake;
        exitLight.color.setHex(open ? 0x22c55e : 0xef4444);
        exitLight.intensity = fake || !E ? 0 : open ? 3 : 1; // aux Poolrooms, pas d'ascenseur : les toboggans
        signMat.color.setHex(open ? 0x4ade80 : 0xff3030);
        callMat.color.setHex(open ? 0xf4f1e0 : 0xc2701c);
        // les portes s'ouvrent quand l'ascenseur est alimenté ; le bouton pressé dans la cabine, elles se referment
        // (en un peu moins de deux secondes) et l'ascenseur part
        const closing = sim.liftT > 0 || sim.departT > 0;
        const doorWant = open && !closing ? 1 : 0;
        doorOpen += Math.sign(doorWant - doorOpen) * Math.min(Math.abs(doorWant - doorOpen), dt / (doorWant ? 1.2 : LIFT_SHUT_T));
        for (const { d, sgn } of doors) d.position.x = sgn * (0.3 + doorOpen * 0.6);
        if (lift) lift.btnMat.color.setHex(closing ? 0xffb43a : 0xd8d4c4);
        if (arrivalLift) {
          // la cabine finit de descendre, portes fermées ; arrivée, elles s'ouvrent ; elles se referment pour de bon
          // quand tout le monde est sorti et s'est éloigné
          const want = sim.arriveT > 0 || sim.liftShut ? 0 : 1;
          arrivalLift.open += Math.sign(want - arrivalLift.open) * Math.min(Math.abs(want - arrivalLift.open), dt / 1.4);
          for (const { d, sgn } of arrivalLift.doors) d.position.x = sgn * (0.3 + arrivalLift.open * 0.6);
          arrivalLift.btnMat.color.setHex(sim.arriveT > 0 ? 0xffb43a : 0xd8d4c4);
        }
        fuseLamps.forEach((l, i) => l.material.color.setHex(sim.powered ? 0x22c55e : i < sim.fuses ? 0xffb020 : 0x331010));
        for (const fm of fuseMeshes) {
          showGroup(fm.g, !fm.f.taken);
          if (!fm.f.taken) {
            fm.g.rotation.y = time * 1.4;
            fm.g.position.y = 0.9 + Math.sin(time * 2.2 + fm.f.id) * 0.07;
          }
        }
        // brume en volume (Level 1) : ses volutes dérivent ; nappes de vapeur (Poolrooms) : elles suivent la caméra
        if (groundFog) groundFog.u.uTime.value = time;
        for (const L of fogLayers) {
          L.m.position.x = P.x;
          L.m.position.z = P.z;
          L.t.offset.set((P.x / 70) * L.rep + time * L.sp, (-P.z / 70) * L.rep + time * L.sp * 0.6);
          L.m.material.opacity = L.o * (power ? 1 : 0.1);
        }

        // Level 2 : les lampes qui se reflètent dans le carrelage et le sol ciré (les plus proches que l'on voit)
        if (PIPES) {
          const cand = [];
          for (const l of map.lights) {
            const k = power && l.state !== 'off' ? (l.k ?? 1) : 0;
            if (k <= 0) continue;
            const d = Math.abs(l.x - P.x) + Math.abs(l.z - P.z);
            if (d < 32) cand.push([d, l, k]);
          }
          cand.sort((a, b) => a[0] - b[0]);
          let n = 0;
          for (const [d, l, k] of cand) {
            if (n >= NLAMP) break;
            if (d > 4 && !hasLineOfSight(map, P.x, P.z, l.x, l.z)) continue;
            lampU.uLampPos.value[n].set(l.x, l.y + group.position.y, l.z);
            if (l.kind === 'tube') lampU.uLampCol.value[n].set(0.75, 0.88, 1.0).multiplyScalar(k);
            else lampU.uLampCol.value[n].set(1.0, 0.7, 0.4).multiplyScalar(1.5 * k);
            n++;
          }
          for (; n < NLAMP; n++) lampU.uLampCol.value[n].set(0, 0, 0);
        }
        if (pipesView) pipesView.update(sim, P, time, dt, lightAt, P.flashlight && P.status === 'alive');
        // Level 1 : les réglettes allumées qui se reflètent dans le béton lissé et éclairent le plafond, les plus proches
        // parmi celles qui sont devant (un reflet tombe entre l'œil et la lampe) ou juste derrière (leur halo au plafond)
        if (L1) {
          let n = 0;
          if ((P.floor || 0) === fi && power) {
            const cand = [];
            const fx = -Math.sin(P.yaw);
            const fz = -Math.cos(P.yaw);
            for (const l of map.lights) {
              const k = l.state !== 'off' ? (l.k ?? 1) : 0;
              if (k <= 0.01) continue;
              const dx = l.x - P.x;
              const dz = l.z - P.z;
              const d = Math.hypot(dx, dz);
              if (d < 40 && dx * fx + dz * fz > -3.5) cand.push([d, l, k]);
            }
            cand.sort((a, b) => a[0] - b[0]);
            const pick = [];
            let dCut = 40;
            for (const c of cand) {
              if (c[0] > 4 && !hasLineOfSight(map, P.x, P.z, c[1].x, c[1].z)) continue;
              if (pick.length === NFILM) {
                dCut = c[0];
                break;
              }
              pick.push(c);
            }
            // les dernières de la liste entrent et sortent en fondu (d'après la première laissée de côté) : aucun reflet
            // ni halo n'apparaît d'un coup quand on avance
            for (const [d, l, k] of pick) {
              filmU.uFilmL.value[n].set(l.x, l.z, 1);
              filmU.uFilmC.value[n].set(0.9, 0.96, 1.0).multiplyScalar(k * Math.min(1, (dCut - d) / 5));
              n++;
            }
          }
          for (; n < NFILM; n++) filmU.uFilmC.value[n].set(0, 0, 0);
        }
        // Level 0 : les néons allumés (ou les feux rouges) qui se reflètent dans la pellicule d'eau, les plus proches du
        // joueur que l'on voit ; à l'étage où il n'est pas, aucun
        if (L0) {
          let n = 0;
          if ((P.floor || 0) === fi && power) {
            const cand = [];
            for (const l of map.lights) {
              const a = alarm ? alarmOf.get(l) : null;
              const k = alarm ? (a ? a.v : 0) : l.state !== 'off' ? (l.k ?? 1) : 0;
              if (k <= 0.01) continue;
              const d = Math.abs(l.x - P.x) + Math.abs(l.z - P.z);
              if (d < 30) cand.push([d, l, k]);
            }
            cand.sort((a, b) => a[0] - b[0]);
            for (const [d, l, k] of cand) {
              if (n >= NLAMP) break;
              if (d > 4 && !hasLineOfSight(map, P.x, P.z, l.x, l.z)) continue;
              filmU.uFilmL.value[n].set(l.x, l.z, l.fs || 1);
              filmU.uFilmR.value[n] = l.rot || 0;
              if (alarm) filmU.uFilmC.value[n].set(1, 0.07, 0.04).multiplyScalar(k * 1.2);
              else filmU.uFilmC.value[n].set(1, LOW0 ? 0.93 : 0.97, LOW0 ? 0.74 : 0.84).multiplyScalar(k);
              n++;
            }
          }
          for (; n < NLAMP; n++) filmU.uFilmC.value[n].set(0, 0, 0);
        }

        // L'annonce de la phase rouge (la dernière cassette trouvée) : les néons s'éteignent un à un, les plus loin
        // d'abord, en vague qui arrive sur le joueur ; chacun claque (à portée d'oreille) ; puis le noir complet
        const hereF = (P.floor || 0) === fi;
        if (L0 && !alarm && !casc && sim.level === 0 && sim.open) {
          const fk = new Map(flickers.map((f) => [f.l, f.k]));
          const live0 = new Float32Array(BW * BH);
          live0.set(base);
          for (const f of flickers) if (f.k > 0) addPrint(live0, f.fp, f.k);
          const list = [];
          for (const l of map.lights) {
            const k = !power ? 0 : l.state === 'on' ? 1 : l.state === 'flicker' ? fk.get(l) || 0 : 0;
            if (k <= 0) continue;
            const d = Math.hypot(l.x - P.x, l.z - P.z);
            // au-delà de 42 m (dans le noir du brouillard), tout de suite ; plus près, de plus en plus tard
            list.push([d > 42 ? Math.random() * 0.4 : 0.45 + 2.7 * (1 - d / 42) + (Math.random() - 0.5) * 0.2, l, k]);
          }
          list.sort((a, b) => a[0] - b[0]);
          const last = list.length ? list[list.length - 1][0] : 0;
          casc = { live: live0, list, i: 0, t: 0, dark: false, last, end: last + 1.1 + Math.random() * 0.4 };
          if (hereF && api.onCascade) api.onCascade(null);
        }
        if (casc && !alarm) {
          casc.t += dt;
          let changed = false;
          while (casc.i < casc.list.length && casc.list[casc.i][0] <= casc.t) {
            const [, l, k] = casc.list[casc.i++];
            addPrint(casc.live, fpOf(l), -k);
            l.cascOff = true;
            fixColor(l, false);
            changed = true;
            if (hereF && api.onCascade && Math.hypot(l.x - P.x, l.z - P.z) < 16) api.onCascade({ x: l.x, z: l.z });
          }
          if (!casc.dark && casc.t >= casc.last) {
            // le noir : même les puits et la lumière d'ambiance
            casc.dark = true;
            casc.live.fill(0);
            ambient.intensity = AMB * 0.25;
            for (const sv of shaftViews) sv.u.uShaftK.value = 0.04;
            changed = true;
          }
          if (changed) {
            fixDirty();
            writeBake();
          }
        }

        // La phase rouge de la fin du Level 0 : une fois lancée, elle tient jusqu'au départ
        if (L0 && !alarm && casc && casc.t >= casc.end) {
          // les feux rouges, tirés d'après leur place (les mêmes chez tous les joueurs)
          const pick = (l, s) => (((Math.sin(l.x * 12.9898 + l.z * 78.233 + s) * 43758.5453) % 1) + 1) % 1;
          const zones = new Map(); // un feu par zone : le néon que le tirage met en tête
          for (const l of map.lights) {
            const key = Math.floor(l.x / RED.zone) + ',' + Math.floor(l.z / RED.zone);
            const cur = zones.get(key);
            if (!cur || pick(l, 1.7) < pick(cur, 1.7)) zones.set(key, l);
          }
          alarm = [...zones.values()].map((l) => {
            const base = RED.level[0] + (RED.level[1] - RED.level[0]) * pick(l, 3.3);
            const fp = footprint(l, RED.reach); // la même portée partout, même en zone claire
            // tous s'allument d'un coup (le premier pas les montre), puis chacun vit sa vie de feu défaillant
            return { l, fp, base, k: base, v: 0, mode: 'on', t: 1.2 + Math.random() * 1.8, n: 0 };
          });
          for (const a of alarm) alarmOf.set(a.l, a);
          // le halo de chaque feu : la lueur qu'il jette sur les dalles autour du diffuseur (un rectangle aux bords très
          // doux, de sa forme), et le cône de lumière qui descend dans l'air poussiéreux, vif sous le diffuseur, perdu
          // avant le sol. Leur force suit le feu (couleur d'instance) ; un appel de dessin pour chacun
          {
            const tex = (w, h, f) => {
              const cv = document.createElement('canvas');
              cv.width = w;
              cv.height = h;
              const g = cv.getContext('2d');
              const img = g.createImageData(w, h);
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const a = Math.max(0, Math.min(1, f((x + 0.5) / w, (y + 0.5) / h)));
                  const o = (y * w + x) * 4;
                  img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(a * 255);
                  img.data[o + 3] = 255;
                }
              }
              g.putImageData(img, 0, 0);
              const t = new THREE.CanvasTexture(cv);
              t.colorSpace = THREE.SRGBColorSpace;
              return t;
            };
            // au plafond : 3,2 × 2,4 m autour d'un diffuseur de 1,22 × 0,62 m ; la lueur décroît depuis son bord
            const GW = 3.2;
            const GD = 2.4;
            const ceilTex = tex(128, 96, (u, v) => {
              const dx = Math.max(0, Math.abs((u - 0.5) * GW) - 0.61);
              const dz = Math.max(0, Math.abs((v - 0.5) * GD) - 0.31);
              const d = Math.hypot(dx, dz);
              const edge = Math.min(1, (0.5 - Math.abs(u - 0.5)) * 8, (0.5 - Math.abs(v - 0.5)) * 8);
              return (0.75 * Math.exp(-d / 0.22) + 0.25 * Math.exp(-d / 0.7)) * Math.max(0, edge);
            });
            // le cône : le haut de la toile sous le diffuseur, le bas 2,3 m plus bas ; bords latéraux fondus, quelques
            // traînées plus claires (la poussière)
            const streak = Array.from({ length: 64 }, () => 0.75 + Math.random() * 0.25);
            const coneTex = tex(64, 128, (u, v) => {
              const side = Math.pow(Math.sin(Math.PI * u), 1.4);
              return Math.pow(1 - v, 2.4) * side * streak[Math.min(63, Math.floor(u * 64))];
            });
            const H = 2.3;
            const SP = 0.6; // de combien le cône s'élargit en descendant
            const pos = [];
            const uv = [];
            const top = [[-0.61, -0.31], [0.61, -0.31], [0.61, 0.31], [-0.61, 0.31]];
            const bot = top.map(([x, z]) => [x + Math.sign(x) * SP, z + Math.sign(z) * SP]);
            for (let k = 0; k < 4; k++) {
              const n = (k + 1) % 4;
              const q = [[top[k][0], 0, top[k][1], 0, 1], [top[n][0], 0, top[n][1], 1, 1], [bot[n][0], -H, bot[n][1], 1, 0], [bot[k][0], -H, bot[k][1], 0, 0]];
              for (const ix of [0, 1, 2, 0, 2, 3]) {
                pos.push(q[ix][0], q[ix][1], q[ix][2]);
                uv.push(q[ix][3], q[ix][4]);
              }
            }
            const coneGeo = new THREE.BufferGeometry();
            coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            coneGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
            // les halos vivent : le tube grésille (de petits sauts d'intensité, irréguliers, propres à chaque feu) et,
            // dans le cône, la poussière fait des volutes qui dérivent lentement
            const RD_NOISE = `
              float rdHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
              float rdH3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
              float rdNoise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(rdH3(i), rdH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rdH3(i + vec3(0.0, 1.0, 0.0)), rdH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                  mix(mix(rdH3(i + vec3(0.0, 0.0, 1.0)), rdH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rdH3(i + vec3(0.0, 1.0, 1.0)), rdH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
              }
            `;
            const alive = (mat, dust) => {
              mat.customProgramCacheKey = () => (dust ? 'redCone' : 'redGlow');
              mat.onBeforeCompile = (sh) => {
                sh.uniforms.uRedT = redU.uRedT;
                sh.vertexShader = 'uniform float uRedT;\nvarying vec3 vRdP;\nvarying float vRdPh;\n' + RD_NOISE + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                  #ifdef USE_INSTANCING
                    vRdPh = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 2.11;
                  #else
                    vRdPh = 0.0;
                  #endif
                  ${dust ? `// le bas du cône ondule : l'air chargé de poussière le déforme sans cesse
                  {
                    float rdDown = clamp(-transformed.y / 2.3, 0.0, 1.0);
                    vec3 rdW = vec3(rdNoise(vec3(transformed.xz * 0.8, uRedT * 0.45 + vRdPh)), 0.0, rdNoise(vec3(transformed.xz * 0.8 + 5.0, uRedT * 0.4 + vRdPh))) - vec3(0.5, 0.0, 0.5);
                    transformed += rdW * rdDown * 0.55;
                  }` : ''}
                  vec4 rdP = vec4(transformed, 1.0);
                  #ifdef USE_INSTANCING
                    rdP = instanceMatrix * rdP;
                  #endif
                  vRdP = (modelMatrix * rdP).xyz;`);
                sh.fragmentShader = 'uniform float uRedT;\nvarying vec3 vRdP;\nvarying float vRdPh;\n' + RD_NOISE + sh.fragmentShader.replace('#include <map_fragment>', `
                  // la lueur respire et se déforme : la texture est lue à travers un remous qui bouge
                  vec2 rdUv = vMapUv;
                  {
                    vec3 rdA = vec3(vMapUv * ${dust ? 'vec2(4.0, 2.2)' : 'vec2(3.0, 2.4)'}, uRedT * ${dust ? '0.55' : '0.35'} + vRdPh);
                    rdUv += (vec2(rdNoise(rdA), rdNoise(rdA + 9.7)) - 0.5) * ${dust ? 'vec2(0.22, 0.1)' : 'vec2(0.09, 0.09)'};
                  }
                  diffuseColor *= texture2D(map, rdUv);
                  {
                    float rdS = floor(uRedT * 23.0 + fract(vRdPh) * 9.0);
                    float rdJ = 0.84 + 0.18 * rdHash(vec2(rdS, fract(vRdPh * 0.37) * 61.0));
                    ${dust ? `// des volutes de brume traversent le faisceau : elles montent, dérivent et se tordent
                    vec3 rdQ = vRdP * vec3(1.5, 1.0, 1.5) + vec3(uRedT * 0.16, -uRedT * 0.28, -uRedT * 0.11);
                    rdQ += (vec3(rdNoise(rdQ * 0.6 + uRedT * 0.12), rdNoise(rdQ * 0.6 + 4.0), rdNoise(rdQ * 0.6 - uRedT * 0.1)) - 0.5) * 1.8;
                    float rdM = rdNoise(rdQ) * 0.65 + rdNoise(rdQ * 2.7 + 3.0) * 0.35;
                    rdJ *= 0.15 + 1.7 * pow(rdM, 1.6);` : `vec3 rdQ = vec3(vRdP.xz * 1.2, uRedT * 0.5 + vRdPh);
                    rdJ *= 0.7 + 0.6 * rdNoise(rdQ);`}
                    diffuseColor.rgb *= rdJ;
                  }`);
              };
              return mat;
            };
            const ceilGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(GW, GD), alive(new THREE.MeshBasicMaterial({ map: ceilTex, opacity: 0.55, ...add }), false), alarm.length);
            const cone = new THREE.InstancedMesh(coneGeo, alive(new THREE.MeshBasicMaterial({ map: coneTex, opacity: 0.16, ...add }), true), alarm.length);
            alarm.forEach((a, i) => {
              const y = a.l.fy !== undefined ? a.l.fy : CEIL - 0.025;
              const fs = a.l.fs || 1;
              dummy.scale.set(fs, fs, 1);
              dummy.position.set(a.l.x, CEIL - 0.008, a.l.z);
              dummy.rotation.set(Math.PI / 2, 0, -(a.l.rot || 0)); // tournée vers le bas (et dans l'axe du diffuseur)
              dummy.updateMatrix();
              ceilGlow.setMatrixAt(i, dummy.matrix);
              dummy.scale.set(fs, 1, fs);
              dummy.position.set(a.l.x, y - 0.02, a.l.z);
              dummy.rotation.set(0, a.l.rot || 0, 0);
              dummy.updateMatrix();
              cone.setMatrixAt(i, dummy.matrix);
              ceilGlow.setColorAt(i, fixTmp.setRGB(0, 0, 0));
              cone.setColorAt(i, fixTmp);
            });
            dummy.scale.set(1, 1, 1);
            for (const m of [ceilGlow, cone]) {
              m.frustumCulled = false;
              m.instanceMatrix.needsUpdate = true;
              group.add(m);
            }
            redGlow = [ceilGlow, cone];
            // la poussière dans la lumière : des grains qui descendent lentement en tournoyant (quelques-uns
            // remontent), scintillent quand ils tournent, s'éteignent avec leur feu ; tout est calculé sur la carte
            // graphique, seul l'éclat de chaque feu (aV) change, au rythme des claquements
            const nM = alarm.length * MOTES;
            const mBase = new Float32Array(nM * 4);
            const mSeed = new Float32Array(nM * 4);
            alarm.forEach((a, i) => {
              const y = a.l.fy !== undefined ? a.l.fy : CEIL - 0.025;
              for (let m = 0; m < MOTES; m++) {
                const o = (i * MOTES + m) * 4;
                mBase.set([a.l.x, y - 0.03, a.l.z, a.l.fs || 1], o);
                const up = Math.random() < 0.4 ? -1 : 1;
                mSeed.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random(), up * (0.004 + Math.random() * 0.018)], o);
              }
            });
            const dGeo = new THREE.BufferGeometry();
            dGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nM * 3), 3));
            dGeo.setAttribute('aBase', new THREE.Float32BufferAttribute(mBase, 4));
            dGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(mSeed, 4));
            dGeo.setAttribute('aV', new THREE.Float32BufferAttribute(new Float32Array(nM), 1));
            redDust = new THREE.Points(
              dGeo,
              new THREE.ShaderMaterial({
                uniforms: { uT: redU.uRedT, uFog: { value: scene.fog ? scene.fog.density : 0 } },
                vertexShader: `
                  attribute vec4 aBase;
                  attribute vec4 aSeed;
                  attribute float aV;
                  uniform float uT;
                  uniform float uFog;
                  varying float vB;
                  void main() {
                    if (aV < 0.01) {
                      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                      gl_PointSize = 0.0;
                      vB = 0.0;
                      return;
                    }
                    // de la vraie poussière : en suspension, presque immobile. Chaque grain descend ou monte très
                    // lentement et se laisse porter par les courants d'air, les mêmes pour ses voisins (le remous dépend
                    // de l'endroit), avec un léger tremblement à lui ; il ne scintille pas
                    float t = fract(aSeed.z + uT * aSeed.w / 2.3);
                    float w = (0.61 + 0.6 * t) * aBase.w * 0.9;
                    float d = (0.31 + 0.6 * t) * aBase.w * 0.9;
                    vec3 p0 = vec3(aBase.x + aSeed.x * w, aBase.y - t * 2.3, aBase.z + aSeed.y * d);
                    vec3 air = vec3(
                      sin(uT * 0.11 + p0.y * 1.9 + p0.z * 1.3) + 0.6 * sin(uT * 0.23 + p0.z * 3.1 - p0.y * 0.7),
                      0.5 * sin(uT * 0.09 + p0.x * 2.3 + p0.z * 1.1),
                      sin(uT * 0.13 + p0.x * 1.7 - p0.y * 1.5) + 0.6 * sin(uT * 0.19 + p0.x * 2.9 + p0.y * 0.9)
                    ) * 0.09;
                    float ph = aSeed.z * 40.0 + aSeed.x * 7.0;
                    vec3 own = vec3(sin(uT * 0.31 + ph), sin(uT * 0.27 + ph * 1.7), cos(uT * 0.35 + ph * 1.3)) * 0.015;
                    vec3 p = p0 + air + own;
                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * mv;
                    float dist = max(0.2, -mv.z);
                    // un grain minuscule : un seul point de l'image (qui est en basse définition, comme une bande VHS),
                    // très pâle, qui s'efface vite en s'éloignant (il couvre une part de plus en plus petite du point) ;
                    // jamais assez vif pour baver
                    gl_PointSize = 1.0;
                    float side = (1.0 - aSeed.x * aSeed.x * 0.55) * (1.0 - aSeed.y * aSeed.y * 0.55);
                    // la poussière renvoie surtout la lumière vers l'avant : elle brille quand on regarde vers le feu à
                    // travers elle
                    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
                    vec3 lp = (modelMatrix * vec4(aBase.xyz, 1.0)).xyz;
                    float fwd = max(dot(normalize(lp - wp), normalize(wp - cameraPosition)), 0.0);
                    float fog = exp(-uFog * uFog * dist * dist);
                    vB = aV * pow(1.0 - t, 1.5) * smoothstep(0.0, 0.05, t) * side * (0.3 + 1.4 * pow(fwd, 3.0)) * fog * min(1.0, 1.2 / (dist * dist)) * 0.32;
                  }`,
                fragmentShader: `
                  varying float vB;
                  void main() {
                    float a = 1.0; // un grain d'un pixel
                    gl_FragColor = vec4(vec3(1.0, 0.1, 0.06) * min(vB, 0.3) * a, 1.0);
                  }`,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              }),
            );
            redDust.frustumCulled = false;
            group.add(redDust);
          }
          bakeUniforms.uBakeTint.value.setRGB(0.8, 0.08, 0.05); // le peu de lumière qui reste dans le noir : rouge aussi
          bakeUniforms.uBakeTint2.value.setRGB(...RED.tint);
          bakeUniforms.uCeilB.value = RED.ceil;
          ambient.color.set('#ff1408');
          exitLight.color.set('#ff1408');
          const cab = exitGroup.getObjectByName('cabin');
          if (cab) cab.color.set('#ff2a14');
          if (lift) lift.cabU.uCabTint.value.set('#ff2a14');
          for (const sv of shaftViews) {
            sv.u.uShaftK.value = 0.04;
            sv.glassMat.color.set('#4a0805');
          }
          ambient.intensity = power ? AMB : 0;
          for (const l of map.lights) l.cascOff = false;
          casc = null;
          for (const l of map.lights) fixColor(l, power > 0 && l.state !== 'off');
          fixDirty();
          writeBake();
          // les feux rouges s'allument d'un coup : le bruit qui surprend, puis les alarmes
          if (hereF && api.onRedStart) api.onRedStart();
        }
        if (alarm) {
          redU.uRedT.value = time % 3600;
          alarmT -= dt;
          if (alarmT <= 0 && power && powerFlick <= 0) {
            const st = 1 / 20;
            alarmT = st;
            // de temps en temps, tout se coupe d'un coup ; au retour, les feux se rallument en hoquetant
            let all = null; // null : chacun sa vie ; 0 : tout éteint ; sinon, le hoquet du rallumage
            const here = (P.floor || 0) === fi; // le joueur est à cet étage : il entend les coupures et les claquements
            if (redCut > 0) {
              redCut -= st;
              all = 0;
              if (redCut <= 0) {
                redBack = 0.2 + Math.random() * 0.35;
                if (here && api.onRedCut) api.onRedCut(false);
              }
            } else if (redBack > 0) {
              redBack -= st;
              all = Math.random() < 0.5 ? 0 : 1;
            } else if ((redNext -= st) <= 0) {
              redCut = 0.3 + Math.random() * 1.1;
              redNext = 9 + Math.random() * 12;
              all = 0;
              if (here && api.onRedCut) api.onRedCut(true);
            }
            let changed = false;
            for (const a of alarm) {
              a.t -= st;
              let k = a.k;
              if (a.mode === 'off') {
                // éteint ; parfois une lueur à peine visible, le tube qui n'amorce pas
                if (a.t <= 0) {
                  a.mode = 'try';
                  a.n = 2 + Math.floor(Math.random() * 6);
                  a.t = 0;
                } else k = Math.random() < 0.02 ? a.base * 0.2 : k > 0 && k < a.base * 0.3 ? k : 0;
              }
              if (a.mode === 'try' && a.t <= 0) {
                // il tente de s'allumer : des claquements de longueurs inégales
                if (a.n-- > 0) {
                  const on = k < a.base * 0.5;
                  k = on ? (Math.random() < 0.25 ? a.base * 0.35 : a.base) : 0;
                  a.t = on ? 0.04 + Math.random() * 0.14 : 0.03 + Math.random() * 0.2;
                } else if (Math.random() < 0.5) {
                  a.mode = 'on'; // il tient… un peu
                  k = Math.random() < 0.3 ? a.base * 0.45 : a.base;
                  a.t = 0.25 + Math.random() * 1.2;
                } else {
                  a.mode = 'off';
                  k = 0;
                  a.t = 0.4 + Math.random() * 3.2;
                }
              } else if (a.mode === 'on') {
                if (a.t <= 0) {
                  a.mode = 'off';
                  k = 0;
                  a.t = 0.5 + Math.random() * 3.5;
                } else if (Math.random() < 0.06) k = k > 0 ? 0 : a.base; // un trou d'une fraction de seconde
              }
              a.k = k;
              const shown = all !== null ? (all ? k || a.base * 0.6 : 0) : k;
              if (shown !== a.v) {
                // le claquement du starter, à portée d'oreille (pas pendant une coupure : elle a son propre bruit)
                if (here && all !== 0 && api.onRedFlick && Math.hypot(P.x - a.l.x, P.z - a.l.z) < 13) api.onRedFlick({ x: a.l.x, z: a.l.z }, shown > a.v);
                a.v = shown; // ce qui se voit (k, sauf pendant une coupure générale)
                changed = true;
                fixColor(a.l, true);
              }
            }
            if (changed) {
              fixDirty();
              writeBake();
              alarm.forEach((a, i) => {
                fixTmp.setRGB(1, 0.07, 0.04).multiplyScalar(a.v);
                for (const m of redGlow) m.setColorAt(i, fixTmp);
              });
              for (const m of redGlow) m.instanceColor.needsUpdate = true;
              const av = redDust.geometry.attributes.aV;
              alarm.forEach((a, i) => av.array.fill(a.v, i * MOTES, (i + 1) * MOTES));
              av.needsUpdate = true;
            }
          }
        }

        // Néons qui grésillent (une quinzaine de fois par seconde)
        flickT -= dt;
        if (!alarm && !casc && flickT <= 0 && flickers.length && power && powerFlick <= 0) {
          flickT = 1 / 15;
          let changed = false;
          for (const f of flickers) {
            // un tube fatigué : allumé longtemps, puis une rafale de claquements (0,2 à 0,9 s), parfois éteint un moment
            let k = f.k;
            if (f.burst > 0) {
              f.burst -= 1 / 15;
              k = Math.random() < 0.5 ? 0 : 0.55 + Math.random() * 0.45;
              if (f.burst <= 0) {
                f.calm = 1.2 + Math.random() * 5;
                k = Math.random() < 0.18 ? 0 : 1; // parfois il reste éteint jusqu'à la prochaine rafale
              }
            } else {
              f.calm -= 1 / 15;
              if (f.calm <= 0) f.burst = 0.2 + Math.random() * 0.7;
            }
            if (k !== f.k) {
              f.k = k;
              f.l.k = k;
              fixColor(f.l, k > 0);
              changed = true;
            }
          }
          if (changed) {
            fixDirty();
            writeBake();
          }
        }
      },
    };
  }
  const floorViews = floors.map((m, fi) => buildFloor(m, fi));
  // le point de vue de l'image (voir cull, dans buildFloor) : le champ exact de la caméra, son plan lointain (au-delà,
  // rien n'est dessiné), l'étage où elle se trouve, et dans la cage ? Plus celui du médaillon, s'il y en a un
  const cullV = { fr: new THREE.Frustum(), m: new THREE.Matrix4(), sph: new THREE.Sphere(), cam: new THREE.Vector3(), fwd: new THREE.Vector3(), R: Infinity, band: 0, shaft: false, inset: false, ifr: null, iBand: 0, iAll: false };
  const insetFr = new THREE.Frustum();
  // l'étage dont la caméra est dans la pièce (-1 : dans l'épaisseur d'un plancher, où l'on voit le dessous de l'un et
  // le dessus de l'autre)
  const bandOf = (y) => {
    if (floors.length === 1) return 0;
    for (let f = 0; f < floors.length; f++) {
      const gy = -f * FLOOR_DY;
      if (y > gy + 0.1 && y < gy + CEIL - 0.1) return f;
    }
    return -1;
  };
  // dans la cage d'escalier (ou tout près) : on y voit les deux étages
  const inShaft = (x, z) =>
    (floors[0].stairs || []).some((st) => {
      const qx = x - st.ox;
      const qz = z - st.oz;
      const u = qx * st.dx + qz * st.dz;
      const v = qx * st.px + qz * st.pz;
      return u > -1 && u < 3 * CELL_SIZE + 1 && v > -1 && v < 2 * CELL_SIZE + 1;
    });
  // eye : l'œil du coéquipier dont le caméscope passe en médaillon (et son champ, plan lointain compris), ou null si le
  // médaillon ne se refait pas à cette image
  const cullFor = (eye) => {
    const V = cullV;
    camera.updateWorldMatrix(true, false);
    V.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    V.fr.setFromProjectionMatrix(V.m);
    camera.getWorldPosition(V.cam);
    camera.getWorldDirection(V.fwd);
    // (le brouillard noie tout bien avant, mais pas forcément pile dans la couleur du fond : on garde jusqu'au bout)
    V.R = camera.far;
    V.band = bandOf(V.cam.y);
    V.shaft = V.band < 0 || inShaft(V.cam.x, V.cam.z);
    V.inset = !!eye;
    if (eye) {
      V.ifr = eye.fr;
      V.iBand = bandOf(eye.y);
      V.iAll = V.iBand < 0 || inShaft(eye.x, eye.z);
    }
    for (const fv of floorViews) if (fv.cull) fv.cull(V);
  };
  let viewFloor = 0; // l'étage du joueur regardé (pour savoir si la phase rouge a commencé chez lui)

  // Lampe torche du joueur (attachée à la caméra)
  // un faisceau serré au bord très doux, et un halo large et faible autour (comme une vraie torche) : pas de disque net
  const flashLight = new THREE.SpotLight('#fff1d0', 17, 24, Math.PI / 8, 0.85, 1.5);
  flashLight.position.set(0.15, -0.12, 0);
  camera.add(flashLight);
  const flashSpill = new THREE.SpotLight('#ffe9c4', 4, 14, Math.PI / 4.2, 1, 1.8);
  flashSpill.position.set(0.15, -0.12, 0);
  camera.add(flashSpill);
  const flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, -0.2, -5);
  camera.add(flashTarget);
  flashLight.target = flashTarget;
  flashSpill.target = flashTarget;
  scene.add(camera);

  // Ce que l'on tient devant soi : la lampe torche dans la main droite, et dans la main gauche l'objet de la case
  // choisie (eau d'amande ou piles ; l'échelle, trop grande, reste dans le sac). Ils suivent la caméra et prennent
  // la lumière d'où l'on est (néons autour, lampe allumée).
  const held = new THREE.Group();
  let scareFx = null; // Level 5 : le screamer en cours
  camera.add(held);
  const heldMats = [];
  const heldCol = new THREE.Color(); // la lumière qui tombe sur ce que l'on tient
  const hmat = (opts) => {
    const m = new THREE.MeshBasicMaterial(opts);
    m.userData.base = m.color.clone();
    heldMats.push(m);
    return m;
  };
  const along = (geo) => geo.rotateX(Math.PI / 2); // un cylindre couché dans l'axe du regard
  // la lampe : corps noir strié, tête chromée, verre qui s'allume
  const heldLamp = new THREE.Group();
  const lampBody = hmat({ color: '#2a2b2e' });
  const lampRing = hmat({ color: '#5d6066' });
  heldLamp.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.021, 0.021, 0.19, 14)), lampBody));
  for (const z of [-0.03, 0, 0.03]) {
    const grip = new THREE.Mesh(along(new THREE.CylinderGeometry(0.0225, 0.0225, 0.012, 14)), lampRing);
    grip.position.z = z + 0.02;
    heldLamp.add(grip);
  }
  const lampHead = new THREE.Mesh(along(new THREE.CylinderGeometry(0.034, 0.024, 0.055, 16)), lampRing);
  lampHead.position.z = -0.12;
  heldLamp.add(lampHead);
  const lensMat = new THREE.MeshBasicMaterial({ color: '#2c2b26' });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.031, 16), lensMat);
  lens.position.z = -0.148;
  heldLamp.add(lens);
  heldLamp.position.set(0.21, -0.2, -0.5);
  heldLamp.rotation.set(0.08, 0.18, 0);
  held.add(heldLamp);
  // la vraie lampe : la torche en plastique jaune usée de Poly Haven (small_plastic_torch, CC0) ; la lampe dessinée
  // ci-dessus ne sert qu'en attendant qu'elle arrive. Son verre s'allume avec elle.
  loader.load(MODELS + 'small_plastic_torch.glb', (g) => {
    const m = g.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.material = /glass/.test(o.material.name || '') ? lensMat : hmat({ map: o.material.map });
    });
    m.rotation.set(0, Math.PI, -Math.PI / 2); // le verre vers l'avant (-z), l'interrupteur sur le dessus
    for (const c of heldLamp.children) c.visible = false;
    heldLamp.add(m);
  }, undefined, () => {});
  // l'eau d'amande : la même bouteille qu'au sol, avec son étiquette
  const heldBottle = new THREE.Group();
  const hGlass = hmat({ color: '#e6eef2', transparent: true, opacity: 0.7 });
  const hBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 16), hGlass);
  hBody.position.y = 0.13;
  const hLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.0715, 0.0715, 0.1, 16, 1, true), hmat({ map: textures.label }));
  hLabel.position.y = 0.12;
  hLabel.rotation.y = Math.PI * 0.85; // le logo vers soi
  const hNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.06, 12), hGlass);
  hNeck.position.y = 0.29;
  const hCap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 12), hmat({ color: '#f2f2ee' }));
  hCap.position.y = 0.335;
  heldBottle.add(hBody, hLabel, hNeck, hCap);
  heldBottle.scale.setScalar(0.62);
  heldBottle.position.set(-0.22, -0.33, -0.5);
  heldBottle.rotation.set(0.12, 0, 0.18);
  held.add(heldBottle);
  // les piles : deux grosses piles noires à bout cuivré, dans la paume
  const heldBattery = new THREE.Group();
  const hCell = hmat({ color: '#1e1e1e' });
  const hCopper = hmat({ color: '#c98a2b' });
  for (let i = 0; i < 2; i++) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 12), hCell);
    cell.rotation.z = Math.PI / 2;
    cell.position.set(0, 0, i * 0.036 - 0.018);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.022, 12), hCopper);
    top.rotation.z = Math.PI / 2;
    top.position.set(0.026, 0, i * 0.036 - 0.018);
    heldBattery.add(cell, top);
  }
  heldBattery.position.set(-0.2, -0.22, -0.45);
  heldBattery.rotation.set(0.5, 0.35, 0.1);
  held.add(heldBattery);
  // puis les vraies : deux piles AA (le même modèle qu'au sol), un peu plus grandes que nature à cette distance
  batteryModel.then((src) => {
    if (!src) return;
    const hm = hmat({ map: src.map });
    for (const c of heldBattery.children) c.visible = false;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(src.geo, hm);
      m.frustumCulled = false;
      m.scale.setScalar(1.4);
      m.rotation.z = -Math.PI / 2; // couchées, le plot + vers la droite
      m.position.set(0.01, 0, (i - 0.5) * 0.021);
      heldBattery.add(m);
    }
  });

  // Les autres joueurs : des explorateurs en combinaison jaune (view/players.js). Leurs lampes sont posées dès
  // maintenant, éteintes, pour que la compilation des matériaux (à la fin) les compte déjà
  const avatars = createPlayerAvatars(scene, lamps);
  // Vue subjective : son propre explorateur sous la caméra (on voit son buste, ses bras et ses jambes en baissant les
  // yeux), et ce que l'on tient est dans ses mains. Chaque objet a sa place à l'écran (HOME, ROT, plus SHIFT avec le
  // corps) ; HOLD est l'endroit où la main le serre (repère de l'objet), l'axe de l'objet (le côté de sa tête : il
  // sort du poing côté pouce) et la prise (players.js). En baissant ou levant les yeux, les mains ne suivent qu'une
  // part du regard (devant le ventre, pas dedans)
  const FP_HOME = { lamp: heldLamp.position.clone(), bottle: heldBottle.position.clone(), battery: heldBattery.position.clone() };
  const FP_ROT = { lamp: heldLamp.quaternion.clone(), bottle: heldBottle.quaternion.clone(), battery: heldBattery.quaternion.clone() };
  // en vue subjective, les objets un peu plus haut et plus près du centre que sans bras
  const FP_SHIFT = { lamp: new THREE.Vector3(-0.035, 0.03, 0.02), bottle: new THREE.Vector3(0.04, 0.05, 0.02), battery: new THREE.Vector3(0.03, 0.03, 0) };
  const FP_HOLD = {
    lamp: { at: new THREE.Vector3(0, 0, 0.01), axis: new THREE.Vector3(0, 0, -1), kind: 'torch' },
    bottle: { at: new THREE.Vector3(0, 0.13, 0), axis: new THREE.Vector3(0, 1, 0), kind: 'bottle' },
    battery: { at: new THREE.Vector3(0, 0, 0), axis: new THREE.Vector3(0, 0, -1), kind: 'battery' },
  };
  const fpQ = new THREE.Quaternion();
  const fpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const fpV = new THREE.Vector3();
  const fpC = new THREE.Quaternion();
  const fpWant = { R: { pos: new THREE.Vector3(), axis: new THREE.Vector3(), kind: '', at: new THREE.Vector3(), q: new THREE.Quaternion() }, L: { pos: new THREE.Vector3(), axis: new THREE.Vector3(), kind: '', at: new THREE.Vector3(), q: new THREE.Quaternion() } };
  // ce que la main doit serrer : l'objet à sa place (monde : at, q), le point serré et son axe
  const fpGrip = (item, kind, w) => {
    w.at.copy(FP_HOME[kind]).add(FP_SHIFT[kind]).applyQuaternion(fpQ).add(camera.position);
    w.q.copy(fpQ).multiply(FP_ROT[kind]);
    w.pos.copy(FP_HOLD[kind].at).multiplyScalar(item.scale.x).applyQuaternion(w.q).add(w.at);
    w.axis.copy(FP_HOLD[kind].axis).applyQuaternion(w.q);
    w.kind = FP_HOLD[kind].kind;
    return w;
  };
  // un objet tenu : à sa place, décalé de ce qui manque à la main pour l'atteindre (got : le point serré atteint) ;
  // sans main, à sa place d'origine
  const fpPlace = (item, kind, w, got) => {
    if (!got) {
      item.quaternion.copy(FP_ROT[kind]);
      return item.position.copy(FP_HOME[kind]);
    }
    fpV.copy(w.at).add(got).sub(w.pos);
    item.position.copy(camera.worldToLocal(fpV));
    camera.getWorldQuaternion(fpC);
    return item.quaternion.copy(fpC.invert().multiply(w.q));
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
  const anim = L1 || L2 || PIPES ? ENTITY_ANIM : null; // aux Poolrooms, la même entité qu'au Level 1
  face.visible = false;
  monsterGroup.add(face);
  // l'entité en 3D, animée (view/beast.js) ; au Level 1 en mode VIP : la vidéo d'origine
  // mode VIP au Level 0 : le même corps, avec le visage de la photo de l'entité d'origine
  // Level 5 : l'entité de l'hôtel, un modèle humain animé os par os (view/hotelEntity.js)
  const beast = L3 ? createHotelEntity() : !ENTITY_VIP ? createBeast({ wiry: !(L1 || L2) }) : !(L1 || L2) ? createBeast({ wiry: true, photo: { url: VIP_IMG, crop: [490, 20, 300, 375] } }) : null;
  if (beast) {
    monsterGroup.add(beast.group);
    shadow.visible = false;
  }
  if (!beast) new THREE.TextureLoader().load(anim ? anim.url : ENTITY_IMG, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const h = anim ? 2.8 : 2.15; // au Level 1, il est immense (le plafond de l'entrepôt est à 4,2 m)
    const w = anim ? h * anim.aspect : Math.min(2.3, (h * t.image.width) / t.image.height);
    if (anim) faceFrame.value.set(0, 0, 1 / anim.cols, 1 / anim.rows);
    const mat = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, color: anim ? anim.tint : (ENTITY_VIP ? '#e6dccb' : '#ffffff') }); // au Level 1, une silhouette sombre
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
    plane.position.x = anim || !ENTITY_VIP ? 0 : (0.5 - 0.6) * w; // la tête (à 60 % de la largeur de la photo) dans l'axe de l'entité
    if (anim) plane.position.y = h / 2 + 0.02; // lui marche par terre
    face.add(plane);
    face.visible = true;
    shadow.visible = false;
  });

  monsterGroup.position.set(map0.monsterSpawn.x, 0, map0.monsterSpawn.z);
  scene.add(monsterGroup);
  // l'événement rare : une silhouette immobile au bout du couloir, qui n'est plus là quand on s'approche
  const figure = new THREE.Group();
  const figMat = new THREE.MeshBasicMaterial({ color: '#030303', fog: true });
  const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.75, 10), figMat);
  fb.position.y = 0.95;
  const fh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), figMat);
  fh.position.y = 1.95;
  figure.add(fb, fh);
  figure.visible = false;
  scene.add(figure);
  let figT = 0;
  // Level 2 : pas d'entité, le troupeau de chèvres (view/goats.js)
  const goatHerd = PIPES ? createGoatHerd(scene) : null;

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
  let crouchY = 0;
  let grabYaw = 0;
  let eyeY = 1.6; // hauteur des yeux : elle suit les chutes, les escaliers et l'échelle
  let fallV = 0; // vitesse de chute de la caméra
  let landShake = 0; // le choc à l'arrivée d'une chute (1 : tout juste tombé)
  let exposure = 1.2; // exposition du caméscope : elle rattrape la lumière en une seconde environ
  let lightNow = 0.5; // lumière des néons là où l'on est (pour le grésillement)
  let camT = 0; // caméscope sorti (0 à 1, la transition vers le 4:3)
  let camZoomWant = 1.5; // zoom de l'objectif (molette), de 1,5 à 12
  let camZoomNow = 1.5;
  let nightT = 0; // son mode nuit (0 à 1)
  let lampCutT = 0; // la lampe (et l'infrarouge du caméscope) coupée par sa présence : secondes restantes
  // la phase rouge (fin du Level 0) : la lampe aussi est à bout, et plus faible. Elle joue une suite d'à-coups
  // (failSeq : [force, durée]…) tirée parmi plusieurs pannes, puis un court répit, puis une autre panne ; failStep :
  // secondes avant le prochain à-coup ; failK : sa force
  const FAIL_LOW = 0.5; // pendant toute la phase, la torche n'éclaire plus qu'à moitié
  let failMode = 'ok';
  let failStep = 0;
  let failK = 1;
  let failSeq = [];
  const failScript = () => {
    const seq = [];
    const add = (k, d) => seq.push([k, d]);
    const r = Math.random();
    if (r < 0.18) {
      // elle claque : des coups secs, irréguliers
      for (let t = 0, end = 0.4 + Math.random() * 1.2; t < end; ) {
        const d = 0.03 + Math.random() * 0.12;
        add(Math.random() < 0.5 ? 0 : Math.random() < 0.4 ? 0.35 : 1, d);
        t += d;
      }
    } else if (r < 0.34) {
      // des salves : quelques éclairs brefs, un trou noir, encore
      for (let b = 0, nb = 2 + Math.floor(Math.random() * 3); b < nb; b++) {
        for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
          add(0.6 + Math.random() * 0.4, 0.035 + Math.random() * 0.06);
          add(0, 0.05 + Math.random() * 0.15);
        }
        add(0, 0.25 + Math.random() * 0.6);
      }
    } else if (r < 0.5) {
      // elle lâche, puis revient en hoquetant
      add(0, 0.8 + Math.random() * 2.2);
      for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
        add(0.3 + Math.random() * 0.7, 0.03 + Math.random() * 0.1);
        add(0, 0.04 + Math.random() * 0.25);
      }
    } else if (r < 0.64) {
      // elle faiblit par paliers jusqu'à s'éteindre (avec des trous), puis revient d'un coup
      for (let k = 0.8; k > 0.08; k *= 0.45 + Math.random() * 0.3) {
        add(k, 0.15 + Math.random() * 0.45);
        if (Math.random() < 0.3) add(0, 0.04 + Math.random() * 0.06);
      }
      add(0, 0.3 + Math.random() * 1.2);
    } else if (r < 0.76) {
      // le faux contact qui grésille : un battement rapide et inégal
      for (let t = 0, end = 0.3 + Math.random() * 0.8; t < end; ) {
        const d = 0.025 + Math.random() * 0.035;
        add(Math.random() < 0.5 ? 0.12 : 0.7, d);
        t += d;
      }
    } else if (r < 0.86) {
      // un éclair trop fort, puis le noir, puis deux hoquets
      add(1.6, 0.05 + Math.random() * 0.05);
      add(0, 0.4 + Math.random() * 1.1);
      for (let i = 0; i < 2; i++) {
        add(0.5, 0.04);
        add(0, 0.08 + Math.random() * 0.2);
      }
    } else {
      // presque morte : une lueur faible qui tremble et s'éteint par moments
      for (let t = 0, end = 1 + Math.random() * 2.5; t < end; ) {
        const d = 0.06 + Math.random() * 0.2;
        add(Math.random() < 0.15 ? 0 : 0.12 + Math.random() * 0.14, d);
        t += d;
      }
    }
    return seq;
  };
  let lampCutLen = 0;

  // effets de bande en cours (secondes restantes), jumpscare, résolution dynamique, mise au point
  const fx = { splice: 0, loss: 0, bars: 0, grab: 0 };
  let scareT = 0;
  const SCARE_T = 1.6; // durée du jumpscare : 0,2 s de noir et de silence, puis elle
  const SCARE_CUT = 0.2;
  let scareJ = 0; // prochaine saccade de sa tête (image par image)
  const scareOff = new THREE.Vector3();
  const scareV = new THREE.Vector3();
  // la chute dans un puits sans fond : la caméra plonge au milieu du puits, le regard remonte vers le carré de lumière
  // qui rapetisse, puis il n'y a plus que le noir
  const PLUNGE_T = 3.2;
  let plunge = null;
  let ductDrop = 0; // Level 1 : l'entité qui se laisse tomber d'une bouche de gaine (le temps qui reste)
  let cctvWas = -1; // au poste de garde : la caméra affichée à l'image précédente (-1 : pas au poste)
  let frameAvg = 16;
  let lines = 2880; // résolution dynamique : commence au plus haut (ramené tout de suite au plus que permet l'écran)
  let qualityWas = null; // la qualité déjà appliquée au filtre (il ne retaille l'image que si elle change)
  const camState = { t: 0, night: 0, bars: 0 }; // api.cam, lu à chaque image : le même objet, remis à jour
  const avatarPos = new Map(); // position affichée de chaque coéquipier (sa piste interpolée)
  let focusT = 0;
  let focusPulse = 0; // temps restant de la « chasse » de mise au point en cours
  let focusWait = 3 + Math.random() * 4; // secondes de course avant la prochaine
  let lastExp = 1.2;
  const api = {
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
    onDrip: null, // une goutte tombe dans une flaque près du joueur ({ x, z }) : l'application la fait entendre
    onCascade: null, // l'annonce de la phase rouge : null quand le courant commence à tomber, puis { x, z } pour chaque néon qui s'éteint près du joueur
    onRedStart: null, // les feux rouges s'allument d'un coup, après le noir (l'application fait le bruit qui surprend)
    // la phase rouge a commencé à l'étage du joueur (avant, pendant la vague d'extinction, pas d'alarme)
    get redOn() {
      const f = floorViews[viewFloor] || floorViews[0];
      return !!f && f.redOn;
    },
    onRedCut: null, // phase rouge : tout le courant tombe (true) ou revient (false) à l'étage du joueur
    onRedFlick: null, // phase rouge : un feu claque près du joueur ({ x, z }, s'allume ou non)
    // Level 0 : la pellicule d'eau au cœur des grosses taches de la moquette, en { x, z } (0 au sec, 1 en plein dedans) :
    // l'application y fait entendre des pas mouillés
    filmAt: (x, z) => (L0 ? filmAt(x, z) : 0),
    // un pied de l'entité touche le sol ('L' ou 'R'), au moment de l'animation : l'application fait entendre le pas
    onMonsterStep: null,
    hasBeast: !!beast, // l'entité est animée en 3D (sinon, pas d'animation pour caler ses pas)
    // le zoom de l'objectif du caméscope (molette), de 1,5 à 12
    setCamZoom(z) {
      camZoomWant = z;
    },
    // le caméscope : où il en est (0 à 1), son mode nuit, et la largeur des bandes noires (px). Toujours le même
    // objet (lu par le HUD à chaque image) : le lire tout de suite, ne pas le garder
    get cam() {
      camState.t = camT;
      camState.night = nightT;
      camState.bars = vhs.bars || 0;
      return camState;
    },
    // Level 2 : percuté par une chèvre
    goatScare() {
      if (goatHerd) goatHerd.scare();
    },

    // Level 5 : le screamer de la mort (l'entité 3D se jette sur la caméra)
    scare() {
      if (!L3 || !beast || !beast.scarePose) return;
      scareFx = { t0: null, x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y };
    },

    dispose() {
      window.removeEventListener('resize', onResize);
      if (liveScene === api) liveScene = null;
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) {
          seen.add(o.geometry);
          o.geometry.dispose();
        }
        for (const m of [].concat(o.material || [])) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const k in m) if (m[k] && m[k].isTexture && !seen.has(m[k])) {
            seen.add(m[k]);
            m[k].dispose();
          }
          m.dispose();
        }
      });
      vhs.dispose?.();
      inset.dispose();
      renderer.renderLists.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },

    // les réglages d'image du joueur
    applyOptions() {
      camera.fov = OPTS.fov;
      camera.updateProjectionMatrix();
      vhs.setFx?.({ brightness: OPTS.brightness, reduceFlashes: OPTS.reduceFlashes });
      // « auto » : la bande de la qualité haute (720 lignes, halo), puis la résolution dynamique (dans render) ajuste
      // les lignes. Avant, « auto » ne rappelait pas setQuality : revenir de « basse » à « auto » restait en basse.
      // Seulement quand la qualité change : setQuality remet les lignes au maximum et retaille l'image
      if (OPTS.quality !== qualityWas) {
        qualityWas = OPTS.quality;
        vhs.setQuality?.(OPTS.quality === 'auto' ? 'high' : OPTS.quality);
        // Level 1, qualité basse : ni ombres des feux de couleur, ni lumière dans la poussière
        const low = OPTS.quality === 'low';
        for (const fl of floorViews) fl.lightQuality?.(low);
      }
    },

    // un effet de bande passager : 'splice' (raccord), 'loss' (perte du signal), 'bars' (mire), 'grab' (la prise)
    tape(kind, len = 1) {
      fx[kind] = Math.max(fx[kind] || 0, len);
    },

    // Level 1 : un événement du matériel (un rideau qui encaisse, une cloche fracassée) ; l'entité qui sort d'une gaine
    // se laisse tomber de la bouche
    gearEvent(ev) {
      for (const fv of floorViews) if (fv.gear) fv.gear.event(ev);
      if (ev.type === 'ductOut') ductDrop = DUCT_LAND;
    },

    // tombé dans un puits sans fond (x, z : le milieu du puits)
    abyss(x, z, floor, yaw, pitch) {
      plunge = { t: 0, x, z, floor, yaw, pitch: pitch || 0, P: { x, z, yaw, pitch: pitch || 0, floor, status: 'dead', moving: false, crouch: false, hidden: -1, grabT: 0, tilt: 0 } };
    },
    get plunging() {
      return !!plunge;
    },

    // elle apparaît ou disparaît tout près : la lampe hoquette et meurt t secondes (l'infrarouge du caméscope aussi)
    lampCut(t) {
      if (t > lampCutT) {
        lampCutT = t;
        lampCutLen = t;
      }
    },

    // L'entité surgit devant l'objectif (en 3D, dans la scène) pendant un instant
    jumpscare() {
      scareT = SCARE_T;
      scareJ = 0;
    },

    // la silhouette au bout du couloir (quelques secondes, ou jusqu'à ce qu'on s'en approche)
    figure(x, z) {
      figure.position.set(x, 0, z);
      figure.visible = true;
      figT = 7;
    },

    // pause : l'image se fige (sur la dernière trame)
    freeze(on) {
      vhs.setFx?.({ freeze: !!on });
    },

    // Rendu d'une frame
    render(sim, time) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      const nowS = performance.now() / 1000; // l'horloge des pistes d'affichage des coéquipiers (sim.netSample)
      // la caméra suit le joueur de cet écran, ou celui qu'il regarde quand il est spectateur
      // la chute dure le temps de passer la main à un coéquipier encore en vie ; seul, on reste dans le noir du puits
      if (plunge && (plunge.t += dt) > PLUNGE_T && sim.players.some((p) => p.status === 'alive')) plunge = null;
      const P = plunge ? plunge.P : sim.viewPlayer(sim.spectate || 0);
      viewFloor = P.floor || 0;
      for (const fv of floorViews) fv.update(sim, P, time, dt);

      // 1. Caméra : balancement lent de la marche, plus marqué en courant ; une chute la fait plonger d'un étage
      if (P.moving) bob += dt * (P.running ? 9 : 5.5);
      const pm = sim.fm(P.floor || 0);
      let want = 1.6 + feetY(sim.stairs, P.x, P.z, P.floor) + (P.onLadder ? 1.0 : 0) - (pm.depthAt ? pm.depthAt(P.x, P.z) : 0);
      // Level 5 : sous le lit, au ras du sol ; dans l'armoire, debout ; accroupi, plus bas
      const low = (P.hidden >= 0 && pm.spots) || P.crouch;
      if (P.hidden >= 0 && pm.spots) want = pm.spots[P.hidden].kind === 'bed' ? 0.28 : 1.5;
      else if (P.crouch) want -= 0.62;
      // une chute : on tombe vraiment (gravité), puis le choc secoue la caméra
      if ((want < eyeY - 0.5 && !low) || fallV > 0) {
        fallV += 9.8 * dt;
        eyeY -= fallV * dt;
        if (eyeY <= want) {
          eyeY = want;
          landShake = Math.min(1, fallV / 10);
          fallV = 0;
        }
      } else eyeY += (want - eyeY) * Math.min(1, dt * 10);
      landShake = Math.max(0, landShake - dt * 0.9);
      const mo = OPTS.motion; // 0 : caméra stable (réglage), 1 : caméra à l'épaule
      const shake = landShake * landShake * Math.max(0.3, mo);
      // accroupi, la caméra descend ; dans un casier, elle est fixe
      crouchY += ((P.crouch ? -0.55 : 0) - crouchY) * Math.min(1, dt * 8);
      const still = P.hidden >= 0;
      camera.position.set(P.x, eyeY + crouchY + (P.jy || 0) + (P.moving && !(P.jy > 0) && !still ? Math.sin(bob * 2) * (P.running ? 0.05 : 0.025) * mo : 0), P.z);
      camera.rotation.order = 'YXZ';
      // agrippé : le regard est tiré vers l'entité
      let yaw = P.yaw;
      let pitch = P.pitch;
      if (P.grabT > 0 && sim.monster) {
        const M = sim.monster;
        const a = Math.atan2(-(M.x - P.x), -(M.z - P.z));
        let d = a - yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        grabYaw += (d - grabYaw) * Math.min(1, dt * 10);
        yaw += grabYaw;
        pitch = 0.12;
      } else grabYaw *= Math.max(0, 1 - dt * 6);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.rotation.z = (P.moving ? Math.sin(bob) * 0.006 * mo : 0) - (P.tilt || 0) * 0.5 + shake * 0.35; // on tangue sur l'arête ; sonné après une chute
      camera.rotation.x += shake * (Math.sin(time * 31) * 0.05 - 0.35);
      camera.position.y -= shake * 0.9;
      // caméra tenue à la main : elle ne reste jamais tout à fait immobile, et tremble davantage en courant
      const hand = (P.moving ? (P.running ? 2.4 : 1.4) : 1) * 0.0035 * mo * (P.grabT > 0 ? 4 : 1);
      camera.rotation.x += (Math.sin(time * 0.83) * 0.6 + Math.sin(time * 2.17 + 1.3) * 0.3 + Math.sin(time * 5.3) * 0.1) * hand;
      camera.rotation.y += (Math.sin(time * 0.61 + 2.1) * 0.6 + Math.sin(time * 1.73) * 0.3 + Math.sin(time * 4.7 + 0.4) * 0.1) * hand;
      camera.rotation.z += Math.sin(time * 0.47 + 0.7) * hand * 0.8;

      // tremblement quand l'entité est tout près
      const danger = sim.hasMonster ? sim.monster.danger : 0;
      // tout près, le tremblement se calme un peu (on ne voit plus rien sinon) ; le filtre, lui, continue de monter
      const calm = 1 - THREE.MathUtils.smoothstep(danger, 0.72, 0.92) * 0.6;
      if (danger > 0.3) {
        const sh = (danger - 0.3) * 0.035 * calm * mo;
        camera.rotation.z += (Math.random() - 0.5) * sh;
        camera.position.y += (Math.random() - 0.5) * sh;
      }

      if (plunge) {
        // la chute : on bascule en avant, puis on tombe (gravité), en tournant lentement sur soi, les yeux vers le haut
        const t = plunge.t;
        const tip = Math.min(1, t / 0.35);
        const fall = Math.min(DEEP_DEPTH - 6, 0.5 * 9.8 * Math.max(0, t - 0.15) * Math.max(0, t - 0.15));
        camera.position.set(plunge.x + Math.sin(t * 2.1) * 0.12, feetY(sim.stairs, plunge.x, plunge.z, plunge.floor) + 1.6 - tip * 0.6 - fall, plunge.z + Math.cos(t * 1.7) * 0.12);
        const up = 1 - Math.exp(-Math.max(0, t - 0.25) * 2.2);
        camera.rotation.set(plunge.pitch + (-0.9 - plunge.pitch) * tip * (1 - up) + 1.35 * up, plunge.yaw + t * 0.5, Math.sin(t * 1.3) * 0.25 * up, 'YXZ');
        eyeY = 1.6 + feetY(sim.stairs, plunge.x, plunge.z, plunge.floor);
        fallV = 0;
      }
      // Level 1, assis au poste de garde : l'image est celle de la caméra de surveillance choisie (fixe, au plafond)
      const cams = sim.map.cams;
      const cctvCam = !plunge && P === sim.player && P.desk && P.status === 'alive' && cams && cams.length ? cams[(P.camSel || 0) % cams.length] : null;
      // la lumière de ce qu'elle filme (à quelques mètres devant elle) : dans le noir, son infrarouge prend le relais
      const cctvLight = cctvCam && floorViews[0] ? floorViews[0].lightAt(cctvCam.x - Math.sin(cctvCam.yaw) * 6, cctvCam.z - Math.cos(cctvCam.yaw) * 6) : 0.4;
      if (cctvCam) {
        camera.position.set(cctvCam.x - Math.sin(cctvCam.yaw) * 0.32, cctvCam.y, cctvCam.z - Math.cos(cctvCam.yaw) * 0.32);
        camera.rotation.set(cctvCam.pitch, cctvCam.yaw, 0, 'YXZ');
        // en changeant de caméra : un bref décrochage de l'image
        if (cctvWas >= 0 && cctvWas !== cctvCam.id) fx.loss = Math.max(fx.loss || 0, 0.16);
        cctvWas = cctvCam.id;
      } else cctvWas = -1;

      // allumer ou éteindre la lampe ne change pas le nombre de lumières (sinon tous les matériaux se recompilent)
      const lampOn = P.flashlight && P.status === 'alive';
      // pile faible : la lampe faiblit et clignote
      const bat = P.battery ?? 100;
      flashLight.intensity = !lampOn ? 0 : 17 * (bat < 15 ? 0.45 + (Math.random() < 0.12 ? -0.4 : 0.15) : bat < 35 ? 0.75 : 1);
      // sa présence la coupe : deux hoquets, puis plus rien, puis elle revient en tremblant
      let cut = 1;
      if (lampCutT > 0) {
        lampCutT = Math.max(0, lampCutT - dt);
        const e = lampCutLen - lampCutT;
        cut = e < 0.14 ? (Math.random() < 0.5 ? 0.35 : 0) : lampCutT < 0.08 ? Math.random() * 0.6 : 0;
        flashLight.intensity *= cut;
      }
      // la phase rouge : la lampe, plus faible, claque, faiblit, lâche, sans régularité et par à-coups (jamais de
      // fondu) ; entre deux pannes, un répit court et pas tout à fait stable. Elle reste blanche
      if (sim.level === 0 && sim.open && lampOn) {
        failStep -= dt;
        for (let guard = 0; failStep <= 0 && guard < 50; guard++) {
          if (!failSeq.length) {
            if (failMode === 'ok') {
              failMode = 'fail';
              failSeq = failScript();
            } else {
              failMode = 'ok';
              for (let t = 0, calm = 0.6 + Math.random() * 2.4; t < calm; ) {
                const d = 0.08 + Math.random() * 0.3;
                failSeq.push([Math.random() < 0.1 ? 0.3 : 0.8 + Math.random() * 0.2, d]);
                t += d;
              }
            }
          }
          const [k, d] = failSeq.shift();
          failK = k;
          failStep += d;
        }
        flashLight.intensity *= failK * FAIL_LOW;
        cut *= Math.min(1, failK) * FAIL_LOW;
      } else failK = 1;
      flashSpill.intensity = flashLight.intensity * 0.24;
      // le caméscope (V) : il sort en un tiers de seconde ; dans le noir, s'il reste de la pile, il passe en mode nuit
      // et sa lampe infrarouge éclaire devant (pour l'image seulement : l'entité ne la voit pas)
      const camWant = !cctvCam && P.cam && P.status === 'alive' ? 1 : 0;
      camT += (camWant - camT) * Math.min(1, dt * 9);
      if (camT < 0.002) camT = 0;
      const nightWant = cctvCam ? THREE.MathUtils.clamp((0.34 - cctvLight) / 0.22, 0, 1) : camWant && bat > 0 ? THREE.MathUtils.clamp((0.34 - lightNow - (lampOn ? 0.3 : 0)) / 0.22, 0, 1) : 0;
      nightT += (nightWant - nightT) * Math.min(1, dt * 3);
      flashSpill.intensity += nightT * 3.2 * cut;
      // le caméscope zoome (×1,3) : son objectif est plus serré que l'œil
      camZoomNow += (camZoomWant - camZoomNow) * Math.min(1, dt * 7); // l'objectif glisse, il ne saute pas
      const camFov = cctvCam ? CCTV_FOV : (2 * Math.atan(Math.tan((OPTS.fov * Math.PI) / 360) / (1 + (camZoomNow - 1) * camT)) * 180) / Math.PI;
      if (Math.abs(camera.fov - camFov) > 0.01) {
        camera.fov = camFov;
        camera.updateProjectionMatrix();
      }

      // les objets en main : la lampe dès qu'on l'a, l'objet de la case choisie s'il y en a un (pas l'échelle)
      const alive = P.status === 'alive' && !P.onLadder && !(P.hidden >= 0);
      const inHand = alive ? P.inv && P.inv[(P.sel || 1) - 1] : null;
      heldLamp.visible = alive && !!P.hasLamp;
      heldBottle.visible = inHand === 'bottle';
      heldBattery.visible = inHand === 'battery';
      // éclairés par la lumière d'où l'on est, dans sa couleur (blanc chaud sous les néons, rouge sombre à la fin, noir
      // quand tout s'éteint) ; la lampe allumée n'y ajoute qu'un reflet de son faisceau, qui faiblit avec elle
      {
        const hv = floorViews[P.floor || 0];
        const stairs = stairAt(sim.stairs, P.x, P.z) && !(sim.blackout > 0) ? 0.55 : 0;
        if (hv) hv.lightColorAt(P.x, P.z, heldCol, stairs);
        else heldCol.setScalar(0.5);
        const spill = lampOn ? 0.12 * Math.min(1, failK) * (sim.level === 0 && sim.open ? FAIL_LOW : 1) : 0;
        heldCol.r = Math.min(1.05, heldCol.r + spill);
        heldCol.g = Math.min(1.05, heldCol.g + spill * 0.95);
        heldCol.b = Math.min(1.05, heldCol.b + spill * 0.85);
        for (const m of heldMats) m.color.copy(m.userData.base).multiply(heldCol);
      }
      lensMat.color.setHex(lampOn && failK > 0.2 ? 0xfff6d8 : 0x2c2b26);
      // ils suivent le pas, un peu en retard sur la tête
      const sway = P.moving ? (P.running ? 1.6 : 1) : 0.25;
      held.position.set(Math.cos(bob) * 0.007 * sway, Math.sin(bob * 2) * 0.006 * sway - (P.running ? 0.02 : 0), 0);
      held.visible = !(scareT > 0) && !cctvCam; // rien dans les mains pendant le jumpscare : elle seule à l'image
      held.rotation.set(Math.sin(bob * 2) * 0.01 * sway, Math.cos(bob) * 0.015 * sway, 0);

      // 2. L'entité fait face au joueur et tressaute quand elle le traque (Level 2 : le troupeau)
      if (goatHerd && sim.goats) {
        monsterGroup.visible = false;
        const gv = floorViews[0];
        goatHerd.update(sim, P, camera, gv ? gv.lightAt : () => 0.3, lampOn, dt, time);
      } else if (sim.hasMonster) {
        const M = sim.monster;
        monsterGroup.visible = !M.away && !M.inDuct; // le prélude (avant la première cassette) : elle n'est pas là ; dans les gaines non plus
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
        // la hauteur de ses pieds : les marches de l'escalier, la chute dans un trou ; aux Poolrooms, le fond de l'eau ;
        // sortie d'une gaine, elle se laisse tomber de la bouche (les jambes d'abord : le reste est encore au-dessus du plafond)
        const mm = sim.fm(M.floor || 0);
        let my = (M.y ?? -(M.floor || 0) * FLOOR_DY) - (mm.depthAt ? mm.depthAt(M.x, M.z) : 0);
        if (ductDrop > 0) {
          ductDrop = Math.max(0, ductDrop - dt);
          const t = 1 - ductDrop / DUCT_LAND;
          my += (DUCT_LOW - 0.25) * (1 - t * t);
        }
        if (beast) {
          // en 3D : elle regarde où elle va (ou le joueur qu'elle observe), et marche vraiment
          monsterGroup.position.set(M.x + (Math.random() - 0.5) * j * 0.3, my, M.z + (Math.random() - 0.5) * j * 0.3);
          monsterGroup.rotation.y = M.yaw || 0;
          const mv = floorViews[M.floor || 0];
          const foot = beast.update(M, chase, mv ? mv.lightAt(M.x, M.z) : 0.3, dt, time, camera.position);
          if (foot && api.onMonsterStep) api.onMonsterStep(foot);
        } else {
          monsterGroup.position.set(M.x + (Math.random() - 0.5) * j, my + (chase ? Math.abs(Math.sin(time * 9)) * 0.08 : Math.sin(time * 2) * 0.03), M.z + (Math.random() - 0.5) * j);
          monsterGroup.rotation.y = Math.atan2(P.x - M.x, P.z - M.z);
          face.scale.set(1 + (Math.random() - 0.5) * 0.08 * faceGlitch.value, 1 + Math.sin(time * 18) * 0.04 * faceGlitch.value, 1);
        }
      } else {
        monsterGroup.visible = false;
      }
      if (figT > 0) {
        figT -= dt;
        const d = Math.hypot(figure.position.x - P.x, figure.position.z - P.z);
        // elle disparaît quand on s'approche… ou dès que la lampe la touche (l'écart d'angle ramené entre -pi et pi :
        // le regard n'est jamais ramené, il compte les tours)
        const fa = Math.atan2(-(figure.position.x - P.x), -(figure.position.z - P.z)) - P.yaw;
        const lit = lampOn && d < 22 && Math.abs(Math.atan2(Math.sin(fa), Math.cos(fa))) < 0.12;
        if (figT <= 0 || d < 9 || lit) {
          figT = 0;
          figure.visible = false;
        }
      }
      // le jumpscare : un noir d'un cinquième de seconde (le son coupe aussi), puis son visage fonce sur l'objectif à
      // hauteur des yeux (elle se plie : elle est bien plus grande que toi), s'y colle et tressaute image par image
      if (scareT > 0 && !goatHerd) {
        scareT -= dt;
        const e = SCARE_T - scareT - SCARE_CUT;
        if (e < 0) monsterGroup.visible = false;
        else {
          const fx0 = -Math.sin(camera.rotation.y);
          const fz0 = -Math.cos(camera.rotation.y);
          const lunge = Math.min(1, e / 0.09);
          scareJ -= dt;
          if (scareJ <= 0) {
            scareJ = 0.04 + Math.random() * 0.08;
            scareOff.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.5);
          }
          const near = 1.9 - 1.62 * lunge * lunge + Math.max(0, e - 1.0) * 0.5 + scareOff.y;
          monsterGroup.visible = true;
          monsterGroup.position.set(camera.position.x + fx0 * near, 0, camera.position.z + fz0 * near);
          monsterGroup.rotation.set(0, Math.atan2(fx0, fz0) + Math.PI, 0);
          const faceObj = beast && beast.scareFace();
          if (faceObj) {
            // le visage pile dans l'axe de l'objectif, à `near` mètres
            monsterGroup.updateMatrixWorld(true);
            faceObj.getWorldPosition(scareV);
            monsterGroup.position.x += camera.position.x + fx0 * near - scareV.x + scareOff.x * fz0;
            monsterGroup.position.y += camera.position.y - scareV.y;
            monsterGroup.position.z += camera.position.z + fz0 * near - scareV.z - scareOff.x * fx0;
          } else monsterGroup.position.y = camera.position.y - 2.05;
          monsterGroup.rotation.z = scareOff.z * 0.3;
          // le choc, puis un tremblement qui ne se calme qu'à peine
          const amp = (lunge < 1 ? 0.03 : 0.09 * Math.max(0.25, 1 - e / 1.2)) * Math.max(0.3, mo);
          camera.rotation.z += (Math.random() - 0.5) * amp * 1.6 + scareOff.z * 0.15;
          camera.rotation.x += (Math.random() - 0.5) * amp;
          camera.rotation.y += (Math.random() - 0.5) * amp * 0.6;
        }
      }

      // 3. Les autres joueurs encore dehors
      for (const Q of sim.players) {
        if (Q === P) continue; // soi-même : plus bas (vue subjective)
        const show = Q.status === 'alive' && !(Q.hidden >= 0); // un coéquipier caché dans un casier ne se voit pas
        if (!show && !avatars.has(Q.id)) continue;
        // à l'écran, chacun suit sa piste : les positions reçues (20 par seconde), interpolées un peu dans le passé,
        // donc un mouvement régulier ; un vrai saut (chute, étage, rattrapage) reste net
        let S = avatarPos.get(Q.id);
        if (!S) avatarPos.set(Q.id, (S = { x: 0, z: 0, yaw: 0, f: 0 }));
        if (!sim.netSample(Q.id, nowS, S, Q)) {
          S.x = Q.x;
          S.z = Q.z;
          S.yaw = Q.yaw;
        }
        S.f = Q.floor || 0;
        const D = { ...Q, x: S.x, z: S.z, yaw: S.yaw };
        const qv = floorViews[Q.floor || 0];
        const qm = sim.fm(Q.floor || 0);
        const y = feetY(sim.stairs, D.x, D.z, D.floor) + (D.onLadder ? 1.0 : 0) + (D.jy || 0) - (qm.depthAt ? qm.depthAt(D.x, D.z) : 0);
        avatars.update(D, show, y, qv ? qv.lightAt(D.x, D.z) : 0.3, dt, time);
      }
      // … et ceux qui ont quitté la partie : la boucle ne les voit plus, ils resteraient figés là, lampe allumée
      avatars.hideGone(sim.players);

      // exposition automatique : le caméscope s'ouvre dans le noir (image plus claire et plus granuleuse) et se
      // referme sous les néons, avec un temps de retard
      const fv = floorViews[P.floor || 0];
      lightNow = fv ? fv.lightAt(P.x, P.z) : 0.5;
      // la caméra de surveillance règle son gain sur ce qu'elle filme (elle voit loin dans le noir, en gros grain)
      const cctvExp = cctvCam ? THREE.MathUtils.clamp(0.55 / (0.12 + cctvLight + nightT * 0.25), 1.1, 2.1) : 0;
      if (stairAt(sim.stairs, P.x, P.z)) lightNow = Math.max(lightNow, sim.blackout > 0 ? 0 : 0.55); // dans la cage : ses appliques
      // 3 bis. Soi-même, en vue subjective (voir FP_HOME) : le corps sous la caméra, la lampe et l'objet choisi dans ses
      // mains. Pas dans un casier, sur l'échelle, mort, au poste ni pendant le screamer : là, rien dans les mains
      {
        let got = null;
        if (alive && held.visible && !P.desk) {
          held.position.set(0, 0, 0);
          held.rotation.set(0, 0, 0);
          camera.updateMatrixWorld(true);
          // le repère des mains : le regard, mais vers le bas il ne suit qu'en partie (on baisse les yeux sur ses mains,
          // qui tiennent les objets devant le ventre, et sur ses jambes qui marchent)
          const cp = camera.rotation.x;
          fpQ.setFromEuler(fpE.set(cp > -0.35 ? cp * (cp > 0 ? 0.85 : 1) : -0.35 + (cp + 0.35) * 0.3, camera.rotation.y, 0));
          const left = heldBottle.visible ? 'bottle' : heldBattery.visible ? 'battery' : null;
          const pm = sim.fm(P.floor || 0);
          const fy = feetY(sim.stairs, P.x, P.z, P.floor || 0) + (P.jy || 0) - (pm.depthAt ? pm.depthAt(P.x, P.z) : 0);
          const leftItem = left === 'bottle' ? heldBottle : heldBattery;
          got = avatars.firstPerson(P, fy, lightNow, dt, time, camera, fpQ, {
            R: heldLamp.visible ? fpGrip(heldLamp, 'lamp', fpWant.R) : null,
            L: left ? fpGrip(leftItem, left, fpWant.L) : null,
          });
          if (got) {
            if (got.R) fpPlace(heldLamp, 'lamp', fpWant.R, got.R);
            if (left && got.L) fpPlace(leftItem, left, fpWant.L, got.L);
          }
        }
        if (!got) {
          // sans corps (modèle pas encore chargé, ou pas de vue subjective) : les objets reprennent leur place
          avatars.update(P, false);
          fpPlace(heldLamp, 'lamp', null);
          fpPlace(heldBottle, 'bottle', null);
          fpPlace(heldBattery, 'battery', null);
        }
      }
      const lightHere = lightNow + (lampOn ? 0.3 : 0);
      const wantExp = THREE.MathUtils.clamp(0.45 / (0.15 + lightHere), 0.9, 1.4);
      // il s'ouvre lentement dans le noir, se referme vite sous la lumière (comme un vrai caméscope)
      exposure += (wantExp - exposure) * Math.min(1, dt * (wantExp > exposure ? 0.65 : 2.4));
      // la mise au point ne décroche qu'en courant (la caméra secouée), et seulement par à-coups : de temps en temps
      // l'autofocus « chasse » une demi-seconde puis se raccroche ; au pas ou à l'arrêt, l'image reste nette
      lastExp = exposure;
      const runs = P.running && P.moving && P.status === 'alive';
      if (focusPulse > 0) focusPulse = Math.max(0, focusPulse - dt);
      else if (runs && (focusWait -= dt) <= 0) {
        focusPulse = 0.45 + Math.random() * 0.4;
        focusWait = 4 + Math.random() * 7;
      }
      if (focusPulse > 0 && runs) focusT = Math.min(0.42, focusT + dt * 2.4);
      else focusT = Math.max(0, focusT - dt * 1.4);
      // balance des blancs automatique : un peu bleue dans le noir, chaude sous les néons
      const wb = THREE.MathUtils.clamp(lightHere, 0, 1);
      // Level 0, étage du haut : un étalonnage moins vert, un peu plus jaune (rouge +4 %, vert et bleu −5 %)
      const up0 = L0 && (P.floor || 0) === 0;
      const white = L2 ? [1, 1, 1] : [(0.96 + wb * 0.06) * (up0 ? 1.04 : 1), up0 ? 0.95 : 1, (1.07 - wb * 0.1) * (up0 ? 0.95 : 1)];

      // les effets de bande du moment : raccord, perte de signal (mort), mire, la prise de l'entité
      for (const k in fx) fx[k] = Math.max(0, fx[k] - dt);
      const grabbed = P.grabT > 0 && P.status === 'alive';
      const dark = sim.blackout > 0;
      // la soif : sous le seuil, la vue se brouille de plus en plus, par vagues, jusqu'à l'évanouissement
      const wat = P.status === 'alive' ? P.water ?? 100 : 100;
      const thirst = wat < THIRST_BLUR ? Math.pow((THIRST_BLUR - wat) / THIRST_BLUR, 0.8) : 0;
      const haze = thirst ? thirst * (0.7 + 0.3 * Math.sin(time * 0.8) * Math.sin(time * 0.31 + 1.3)) : 0;
      vhs.setFx?.({
        tracking: cctvCam ? 0.03 + Math.min(1, fx.grab) * 0.3 : Math.min(1, (dark ? 0.25 : 0) + (grabbed ? 0.75 : 0) + Math.min(1, fx.grab) * 0.6 + (scareT > 0 ? 0.45 : 0)),
        splice: Math.min(1, fx.splice * 1.5),
        signalLoss: Math.min(1, fx.loss * 0.8),
        bars: Math.min(1, fx.bars),
        chroma: scareT > 0 ? 0.7 : grabbed ? 0.6 : 0,
        focus: cctvCam ? 0 : Math.min(1, focusT + (grabbed ? 0.35 : 0) + haze),
        white: cctvCam ? [1, 1, 1] : white,
        cam: cctvCam ? 1 : camT,
        night: nightT,
        cctv: cctvCam ? 1 : 0,
      });

      // résolution dynamique : moins de lignes quand l'image peine, plus quand elle est à l'aise
      frameAvg += (dt * 1000 - frameAvg) * 0.05;
      // (jusqu'à la pleine définition de l'écran à l'œil nu, aux lignes de la bande au caméscope)
      if (OPTS.quality === 'auto' && vhs.setLines) {
        const top = vhs.maxLines || 720;
        if (frameAvg > 24 && lines > 360) lines -= Math.max(8, Math.round(lines * 0.03));
        else if (frameAvg < 15 && lines < top) lines += Math.max(4, Math.round(lines * 0.015));
        lines = Math.min(lines, Math.max(360, top));
        vhs.setLines(lines);
      }
      // Level 5 : le screamer. La caméra reste où l'on est mort ; l'entité surgit à 2,40 m et se jette à 55 cm du
      // visage en un quart de seconde, puis reste là, tremblante, pendant que l'image saute
      let glitch = danger;
      if (scareFx) {
        if (scareFx.t0 === null) scareFx.t0 = time;
        const k = time - scareFx.t0;
        if (k > 1.5) {
          scareFx = null;
          held.visible = true;
        } else {
          const c = scareFx;
          const fx = -Math.sin(c.yaw);
          const fz = -Math.cos(c.yaw);
          const d = THREE.MathUtils.lerp(2.4, 0.55, Math.pow(Math.min(1, k / 0.24), 0.55));
          const sh = k < 0.24 ? 0.015 : 0.05 * (1 - k / 1.6);
          const r = () => (Math.random() - 0.5) * sh;
          camera.position.set(c.x + r(), c.y + r(), c.z + r());
          camera.rotation.order = 'YXZ';
          camera.rotation.set(0.05 + r() * 0.8, c.yaw + r() * 0.8, r() * 1.6);
          held.visible = false;
          monsterGroup.visible = true;
          monsterGroup.position.set(c.x + fx * d, c.y - 1.8, c.z + fz * d);
          monsterGroup.rotation.y = Math.atan2(c.x - monsterGroup.position.x, c.z - monsterGroup.position.z);
          beast.update(sim.monster, true, 1, dt, time, 1);
          glitch = 1;
          exposure = 1.25;
        }
      }
      // le caméscope d'un coéquipier qui filme, en médaillon (vivant, au même étage, pas soi-même)
      const camQ = P === sim.player && P.status === 'alive' ? sim.players.find((q) => q !== P && q.cam && q.status === 'alive' && (q.floor || 0) === (P.floor || 0) && !(q.hidden >= 0)) : null;
      const S = camQ && (avatarPos.get(camQ.id) || camQ);
      const qm = camQ && sim.fm(camQ.floor || 0);
      const ey = camQ ? feetY(sim.stairs, S.x, S.z, camQ.floor || 0) + (camQ.crouch ? 1.05 : 1.6) + (camQ.jy || 0) - (qm.depthAt ? qm.depthAt(S.x, S.z) : 0) : 0;
      const fov = (2 * Math.atan(Math.tan((OPTS.fov * Math.PI) / 360) / 1.5) * 180) / Math.PI;
      const shotQ = camQ && (S.yaw !== undefined ? { ...camQ, yaw: S.yaw } : camQ); // son regard suit la même piste que son corps (sans à-coups)
      const eyeQ = camQ && { x: S.x, y: ey, z: S.z };
      cullFor(inset.due(shotQ) ? { x: S.x, y: ey, z: S.z, fr: inset.frustum(shotQ, eyeQ, fov, insetFr) } : null);
      // au poste : on se voit soi-même, assis, sur la caméra qui filme le poste
      if (cctvCam) avatars.update(P, true, feetY(sim.stairs, P.x, P.z, P.floor || 0), lightNow, dt, time);
      vhs.render(scene, camera, time, glitch, cctvCam ? cctvExp : exposure * (1 + nightT * 1.6));
      if (cctvCam) avatars.update(P, false);

      if (camQ) {
        const pm = sim.fm(P.floor || 0);
        let heldWas = true;
        let lampWas = 0;
        let spillWas = 0;
        const py = feetY(sim.stairs, P.x, P.z, P.floor || 0) + (P.onLadder ? 1.0 : 0) + (P.jy || 0) - (pm.depthAt ? pm.depthAt(P.x, P.z) : 0);
        inset.render(shotQ, eyeQ, fov, scene, avatars, time, dt, {
          show() {
            heldWas = held.visible;
            held.visible = false;
            // vue par lui, notre lampe est celle de notre explorateur (dans sa main) : celles de notre caméra
            // s'éteignent le temps de sa prise de vue (sinon elle éclaire deux fois). On remet ensuite les puissances
            // de cette image-ci, déjà calculées plus haut (pile faible, coupure par sa présence, infrarouge)
            lampWas = flashLight.intensity;
            spillWas = flashSpill.intensity;
            flashLight.intensity = 0;
            flashSpill.intensity = 0;
            avatars.update(P, true, py, lightNow, 0, time);
          },
          hide() {
            held.visible = heldWas;
            flashLight.intensity = lampWas;
            flashSpill.intensity = spillWas;
            avatars.update(P, false); // caché, et sa lampe éteinte (setShown ne cache que le corps)
          },
        });
      } else inset.render(null);
    },
  };
  liveScene = api;
  api.applyOptions();
  // les matériaux se compilent en arrière-plan avant la première image (sinon le jeu se fige au premier regard)
  try {
    renderer.compileAsync?.(scene, camera)?.catch?.(() => {});
  } catch (e) {}
  return api;
}
