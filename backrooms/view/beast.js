// The Backrooms - L'entité en 3D (mode normal) : une grande silhouette décharnée, voûtée, aux bras qui pendent
// jusqu'aux genoux, aux doigts interminables et au cou trop long, la tête penchée à un angle impossible. Elle porte le
// visage de l'entité classique (view/entity.js) : tête noire allongée, yeux blancs inégaux, bouche béante et dents.
// Le squelette et ses animations (attente, marche, course) viennent de models/hazmat.glb (Quaternius, CC0) ; le corps
// est fait de pièces dessinées dans le code, fixées aux os et rallongées.
// Par-dessus ces animations humaines, tout ce qui la rend fausse : une image tenue deux à quatre images puis qui
// saute (image par image, comme une pellicule abîmée), des genoux et des coudes qui plient à l'envers, des épaules
// de travers, des bras trop longs qui ballottent en retard, des doigts qui tressaillent, une tête cassée sur le côté
// qui change d'angle d'un coup, un cou qui s'étire vers toi quand elle regarde, une démarche boiteuse, une course
// penchée, trop rapide, bras en avant qui battent l'air ; et la ruée (M.rushT) : bouche béante, bras tendus, tout le
// corps qui tremble.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

const MODEL = new URL('../models/hazmat.glb', import.meta.url).href;
const SCALE = 1.5; // l'explorateur fait 1,78 m : elle, plus de 3 m une fois le cou et les jambes allongés (voûtée sous le plafond)
const LEG = 1.25; // jambes trop longues : tout le corps est soulevé d'autant
// les instants où un pied touche le sol, en fraction du cycle de chaque clip (mesurés sur la hauteur des pieds)
const FOOT_AT = { Run: [[0.17, 'R'], [0.71, 'L']], Walk: [[0.09, 'R'], [0.59, 'L']] };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function noise2(x, y, s) {
  const h = (i, j) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// peau : noir qui n'est pas noir, marbré de veines grises (comme l'entité classique)
function skinTexture() {
  const [c, g] = canvas(128, 256);
  const img = g.createImageData(128, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 128; x++) {
      const n = noise2(x / 14, y / 14, 3) * 0.6 + noise2(x / 5, y / 5, 4) * 0.4;
      const vein = Math.pow(1 - Math.abs(noise2(x / 9, y / 22, 7) - 0.5) * 2, 10);
      const v = 12 + n * 20 + vein * 34 + (Math.random() - 0.5) * 8;
      const i = (y * 128 + x) * 4;
      img.data[i] = v * 1.06;
      img.data[i + 1] = v * 0.96;
      img.data[i + 2] = v * 0.9;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// le visage de l'entité classique : yeux blancs vides de tailles différentes, bouche trop grande avec ses dents
// scare : le visage du jumpscare, vu à bout portant : peau blême veinée de noir, orbites creuses avec deux points de
// lumière, la bouche ouverte jusqu'aux yeux (le contraste se lit même à travers la bande qui saute)
function faceTexture(open, scare = false) {
  const W = 256;
  const H = 320;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  // la face, ovale, marbrée
  g.save();
  g.beginPath();
  g.ellipse(W / 2, H / 2, W * 0.47, H * 0.47, 0, 0, Math.PI * 2);
  g.clip();
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise2(x / 18, y / 18, 9) * 0.6 + noise2(x / 6, y / 6, 2) * 0.4;
      const vein = Math.pow(1 - Math.abs(noise2(x / 12, y / 30, 5) - 0.5) * 2, 10);
      const edge = Math.hypot((x - W / 2) / (W * 0.47), (y - H / 2) / (H * 0.47));
      const v = scare ? Math.max(8, (105 + n * 70 - vein * 85) * (1 - edge * 0.5)) : (10 + n * 18 + vein * 30) * (1 - edge * 0.6);
      const i = (y * W + x) * 4;
      img.data[i] = v * 1.06;
      img.data[i + 1] = v * 0.96;
      img.data[i + 2] = v * 0.9;
      img.data[i + 3] = edge < 1 ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  g.restore();
  // bouche béante
  const mx = W * 0.5;
  const my = H * 0.7;
  const rx = W * (scare ? 0.16 : 0.24); // le jumpscare : une mâchoire décrochée, plus étroite et bien plus haute
  const ry = H * (0.05 + 0.1 * open);
  g.fillStyle = '#2a0000';
  g.beginPath();
  g.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0a0000';
  g.beginPath();
  g.ellipse(mx, my + ry * 0.15, rx * 0.8, ry * 0.65, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(230,225,210,0.9)';
  g.lineWidth = 3;
  for (let i = -5; i <= 5; i++) {
    const tx = mx + i * rx * 0.17;
    const lift = Math.sqrt(Math.max(0, 1 - (i / 6) ** 2));
    // des dents inégales (au jumpscare : longues, de travers, il en manque)
    const ln = scare ? [0.5, 0.2, 0.62, 0, 0.35, 0.55, 0.28, 0.6, 0, 0.42, 0.3][i + 5] : 0.45;
    const lb = scare ? [0.25, 0.4, 0, 0.52, 0.3, 0.2, 0.48, 0, 0.36, 0.22, 0.4][i + 5] : 0.45;
    g.beginPath();
    g.moveTo(tx, my - ry * lift);
    g.lineTo(tx + (scare ? (i % 3) * 3 - 3 : 2), my - ry * lift + ry * ln);
    g.stroke();
    g.beginPath();
    g.moveTo(tx, my + ry * lift);
    g.lineTo(tx - 2, my + ry * lift - ry * lb);
    g.stroke();
  }
  if (scare) {
    // des coulures noires sous les yeux, jusqu'à la bouche
    g.strokeStyle = 'rgba(8,4,3,0.85)';
    for (const [x0, y0, w] of [[0.28, 0.42, 5], [0.35, 0.43, 3], [0.66, 0.4, 4], [0.72, 0.39, 2.5]]) {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(W * x0, H * y0);
      g.bezierCurveTo(W * (x0 + 0.01), H * (y0 + 0.08), W * (x0 - 0.015), H * (y0 + 0.14), W * (x0 + 0.005), H * (y0 + 0.22));
      g.stroke();
    }
    // des orbites noires, profondes, et tout au fond un point blanc qui te fixe
    for (const [ex, ey, er] of [[0.32, 0.38, 1], [0.69, 0.36, 0.8]]) {
      const gr = g.createRadialGradient(W * ex, H * ey, 0, W * ex, H * ey, W * 0.15 * er);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.7, 'rgba(0,0,0,0.92)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(W * ex, H * ey, W * 0.15 * er, H * 0.11 * er, 0, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = 'rgba(255,240,220,1)';
      g.shadowBlur = 10;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(W * ex + 2, H * ey + 3, W * 0.022 * er, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // yeux blancs, vides, l'un plus grand que l'autre, qui luisent
  g.shadowColor = 'rgba(255,255,255,1)';
  g.shadowBlur = 18;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(W * 0.32, H * 0.4, W * 0.11, H * 0.065, -0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(W * 0.7, H * 0.37, W * 0.075, H * 0.042, 0.3, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// mode VIP : le visage de la photo de l'entité d'origine (crop : x, y, largeur, hauteur dans l'image), en ovale aux bords
// fondus, plaqué sur la tête
function photoFace(url, crop, tex) {
  const W = 256;
  const H = 320;
  const [c, g] = canvas(W, H);
  const img = new Image();
  img.onload = () => {
    const [x, y, w, h] = crop;
    g.drawImage(img, x, y, w, h, 0, 0, W, H);
    g.globalCompositeOperation = 'destination-in';
    const r = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.5);
    r.addColorStop(0, 'rgba(0,0,0,1)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.scale(1, H / W);
    g.fillStyle = r;
    g.fillRect(0, 0, W, W);
    g.restore();
    tex.needsUpdate = true;
  };
  img.src = url;
  tex.image = c;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// copie d'un objet animé avec son propre squelette (comme SkeletonUtils.clone)
function cloneSkinned(src) {
  const clone = src.clone(true);
  const map = new Map();
  const walk = (a, b) => {
    map.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
  };
  walk(src, clone);
  clone.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let s = null;
    for (const [a, b] of map) if (b === o) s = a;
    const sk = s.skeleton.clone();
    sk.bones = s.skeleton.bones.map((b) => map.get(b));
    o.bind(sk, s.bindMatrix);
  });
  return clone;
}

// os, os enfant, rayon (m), allongement de l'os enfant
const L = ['L', 'R'];
const SEGMENTS = [
  ['Hips', 'Abdomen', 0.12, 1],
  ['Abdomen', 'Torso', 0.1, 1],
  ['Torso', 'Neck', 0.15, 1],
  ['Neck', 'Head', 0.035, 2.4], // cou interminable
  ...L.flatMap((s) => [
    ['Hips', `UpperLeg${s}`, 0.07, 1], // bassin
    [`Shoulder${s}`, `UpperArm${s}`, 0.06, 1],
    [`UpperArm${s}`, `LowerArm${s}`, 0.042, 1.45], // bras qui pendent jusqu'aux genoux
    [`LowerArm${s}`, `Middle1${s}`, 0.034, 1.5],
    ...['Index', 'Middle', 'Pinky'].flatMap((f) => [
      [`${f}1${s}`, `${f}2${s}`, 0.011, 2.4], // doigts trop longs
      [`${f}2${s}`, `${f}3${s}`, 0.009, 2.4],
      [`${f}3${s}`, `${f}3${s}_end`, 0.007, 2.6],
    ]),
    [`Thumb1${s}`, `Thumb2${s}`, 0.011, 1.8],
    [`UpperLeg${s}`, `LowerLeg${s}`, 0.06, LEG],
    [`LowerLeg${s}`, `LowerLeg${s}_end`, 0.045, LEG],
  ]),
];

// Level 0 (opts.wiry) : le corps de l'entité de la photo de référence. Tout en brins noirs filiformes, noueux et
// entortillés comme des branches mortes ou du fil de fer ; une barre d'épaules d'où pendent des bras qui touchent
// presque le sol, aux doigts écartés ; une petite tête ronde coiffée d'un large disque plat. On voit à travers.
// os, os enfant, rayon d'un brin (m), allongement de l'os enfant, nombre de brins
// os, os enfant, rayon d'un brin (m), allongement de l'os enfant, nombre de brins, cassures (coudes en zigzag)
const WIRY = [
  ['Hips', 'Abdomen', 0.026, 1, 4, 2.5],
  ['Abdomen', 'Torso', 0.024, 1, 4, 2.5],
  ['Torso', 'Neck', 0.024, 1, 3, 2],
  ['Neck', 'Head', 0.016, 1, 2, 1], // la tête posée presque sur la barre d'épaules
  ...L.flatMap((s) => [
    ['Hips', `UpperLeg${s}`, 0.022, 1, 3, 1.5],
    [`Shoulder${s}`, `UpperArm${s}`, 0.018, 1.7, 2, 1], // la barre d'épaules, trop large
    [`UpperArm${s}`, `LowerArm${s}`, 0.018, 1.8, 3, 1.4], // des bras qui pendent jusqu'au sol
    [`LowerArm${s}`, `Middle1${s}`, 0.016, 1.95, 3, 1.4],
    ...['Index', 'Middle', 'Pinky'].flatMap((f) => [
      [`${f}1${s}`, `${f}2${s}`, 0.009, 3, 1, 1], // doigts interminables, en baguettes
      [`${f}2${s}`, `${f}3${s}`, 0.008, 3, 1, 1],
      [`${f}3${s}`, `${f}3${s}_end`, 0.006, 3.2, 1, 1],
    ]),
    [`Thumb1${s}`, `Thumb2${s}`, 0.009, 2.2, 1, 1],
    [`UpperLeg${s}`, `LowerLeg${s}`, 0.024, LEG, 3, 3],
    [`LowerLeg${s}`, `LowerLeg${s}_end`, 0.02, LEG, 3, 3],
  ]),
];
// des rameaux qui partent de travers (os, os enfant, combien), comme les branches d'un bois mort
const TWIGS = [['Abdomen', 'Torso', 2], ['Torso', 'Neck', 1], ...L.flatMap((s) => [[`UpperLeg${s}`, `LowerLeg${s}`, 2], [`LowerLeg${s}`, `LowerLeg${s}_end`, 1], [`UpperArm${s}`, `LowerArm${s}`, 1]])];

// un petit hasard reproductible (la même silhouette à chaque partie)
function seeded(n) {
  let a = n >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// réunit des géométries (position, normale) en une seule : un membre = un seul objet à dessiner
function mergeGeos(geos) {
  let n = 0;
  let m = 0;
  for (const g of geos) {
    n += g.attributes.position.count;
    m += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const idx = new Uint32Array(m);
  let o = 0;
  let k = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.array[i] + o;
    else for (let i = 0; i < c; i++) idx[k++] = i + o;
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// un membre en brins : n fils entortillés le long de l'axe y (de -len/2 à len/2), qui se rejoignent aux articulations
// en un nœud ; r : l'épaisseur d'un brin
function strands(len, r, n, rnd, zig = 1) {
  const geos = [];
  for (let j = 0; j < n; j++) {
    const ph = rnd() * Math.PI * 2;
    const spread = r * (n > 1 ? rnd() * 1.6 + 0.8 : rnd() * 0.8);
    const turns = rnd() * 1.2 - 0.6;
    const pts = [];
    const K = Math.max(4, Math.min(9, Math.round(len / 0.12)));
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      // l'écart au milieu du membre, nul aux deux bouts ; des coudes au hasard le long du brin (bois tordu)
      const w = Math.sin(Math.PI * t) * spread + (i > 0 && i < K ? (rnd() - 0.5) * r * 1.6 * zig : 0);
      const a = ph + turns * Math.PI * 2 * t;
      pts.push(new THREE.Vector3(Math.cos(a) * w, -len / 2 + t * len, Math.sin(a) * w));
    }
    const rr = r * (0.55 + rnd() * 0.5);
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), K * 2, rr, 4, false));
  }
  // le nœud de l'articulation (en haut du membre)
  const knot = new THREE.SphereGeometry(r * (n > 1 ? 1.9 : 1.3), 6, 4);
  knot.translate(0, len / 2, 0);
  geos.push(knot);
  // sur les membres épais, des nœuds anguleux çà et là (comme des vertèbres, du bois noueux)
  if (r > 0.014) {
    for (let j = 0, nk = 1 + Math.floor(rnd() * 3); j < nk; j++) {
      const b = new THREE.BoxGeometry(r * (1.6 + rnd() * 1.6), r * (2.5 + rnd() * 4), r * (1.4 + rnd()));
      b.rotateY(rnd() * Math.PI);
      b.rotateZ((rnd() - 0.5) * 0.6);
      b.translate((rnd() - 0.5) * r * 2.5, -len / 2 + (0.2 + rnd() * 0.6) * len, (rnd() - 0.5) * r * 2.5);
      geos.push(b);
    }
  }
  return mergeGeos(geos);
}

let source = null;
const loading = new GLTFLoader().loadAsync(MODEL).then((g) => {
  source = g;
}, () => {});

// opts.photo : { url, crop } pour porter le visage d'une photo (mode VIP) au lieu de celui de l'entité classique
export function createBeast(opts = {}) {
  const group = new THREE.Group();
  const wiry = !!opts.wiry;
  // (mode VIP : le même corps, avec la photo du visage d'origine, toujours visible)
  const boneMat = new THREE.MeshLambertMaterial({ color: '#9a8f78' });
  // (la lueur qui l'éclaire dans la pénombre suit la texture de la peau : pas un aplat qui l'efface)
  const skinTex = skinTexture();
  const skinMat = new THREE.MeshLambertMaterial({ map: skinTex, emissive: '#fff2ec', emissiveMap: skinTex, emissiveIntensity: 0 });
  const photo = opts.photo ? photoFace(opts.photo.url, opts.photo.crop, new THREE.Texture()) : null;
  const faces = photo ? [photo, photo, photo, photo] : [faceTexture(0.25), faceTexture(1), faceTexture(1.7), faceTexture(2.1, true)];
  const faceMat = new THREE.MeshBasicMaterial({ map: faces[0], transparent: true, alphaTest: photo ? 0.05 : 0.3, color: photo ? '#d8cfc2' : '#cfcac4' });
  const st = {
    ready: false,
    w: { Idle: 1, Walk: 0, Run: 0 },
    last: { x: 0, z: 0, yaw: 0, ok: false },
    speed: 0,
    accel: 0,
    turn: 0,
    // image par image : la pose est tenue holdT secondes, le temps écoulé (acc) est rattrapé d'un coup
    holdT: 0,
    acc: 0,
    held: { x: 0, z: 0, yaw: 0, ok: false },
    // poids des états (0 à 1, lissés)
    k: { still: 0, run: 0, rush: 0, grab: 0, stun: 0 },
    // tête cassée sur le côté, qui change d'angle d'un coup ; petits tics quand elle observe
    tilt: 0.9,
    tiltT: 1,
    tickY: 0,
    tickX: 0,
    tickT: 0.5,
    // elle te suit des yeux (quand elle t'observe) : poids, et l'angle de la tête par rapport au corps
    look: 0,
    lookY: 0,
    lookX: 0,
    // sursauts : des ressorts (position, vitesse) qu'une secousse lance
    jerkT: 2,
    sp: { head: [0, 0], shL: [0, 0], shR: [0, 0], torso: [0, 0], armL: [0, 0], armR: [0, 0], swayL: [0, 0], swayR: [0, 0] },
    fingers: [],
    fl: 0, // phase des bras qui battent l'air
  };

  const build = () => {
    const root = cloneSkinned(source.scene);
    root.scale.multiplyScalar(SCALE);
    // le corps d'origine (la combinaison) disparaît : seul le squelette sert
    root.traverse((o) => {
      if (o.isMesh) o.visible = false;
    });
    root.updateMatrixWorld(true);
    const bones = {};
    root.traverse((o) => {
      if (o.isBone || o.type === 'Bone' || o.type === 'Object3D') bones[o.name] = o;
    });
    const Y = new THREE.Vector3(0, 1, 0);
    const ws = new THREE.Vector3();
    st.stretch = [];
    const wr = seeded(77);
    for (const [a, b, r, k, nb, zig] of wiry ? WIRY : SEGMENTS) {
      const A = bones[a];
      const B = bones[b];
      if (!A || !B) continue;
      A.getWorldScale(ws);
      const s = 1 / ws.x; // les os sont à l'échelle 100 : on dessine en mètres
      const rest = B.position.clone();
      if (k !== 1) st.stretch.push({ B, rest, k });
      const len = rest.length() * k * ws.x;
      const geo = wiry ? strands(len, r, nb, wr, zig) : new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 8);
      const m = new THREE.Mesh(geo, skinMat);
      m.frustumCulled = false;
      m.scale.setScalar(s);
      m.position.copy(rest).multiplyScalar(k / 2);
      m.quaternion.setFromUnitVectors(Y, rest.clone().normalize());
      A.add(m);
    }
    if (wiry) {
      // les rameaux de travers
      for (const [a, b, n] of TWIGS) {
        const A = bones[a];
        const B = bones[b];
        if (!A || !B) continue;
        A.getWorldScale(ws);
        const s = 1 / ws.x;
        const st0 = st.stretch.find((q) => q.B === B);
        const rest = B.position.clone();
        const k = st0 ? st0.k : 1;
        const axis = rest.clone().normalize();
        for (let i = 0; i < n; i++) {
          const len = 0.12 + wr() * 0.22;
          const perp = new THREE.Vector3(wr() - 0.5, wr() - 0.5, wr() - 0.5).projectOnPlane(axis).normalize();
          const dir = axis.clone().multiplyScalar(wr() < 0.5 ? 0.6 : -0.4).addScaledVector(perp, 1).normalize();
          const tw = new THREE.Mesh(strands(len, 0.009, 1, wr, 1.5), skinMat);
          tw.frustumCulled = false;
          tw.scale.setScalar(s);
          tw.quaternion.setFromUnitVectors(Y, dir);
          tw.position.copy(rest).multiplyScalar(k * (0.25 + wr() * 0.55)).addScaledVector(dir, (len / 2) * s);
          A.add(tw);
        }
      }
      // un bout d'os pâle dans le tronc, qui accroche la lumière
      const tor = bones.Torso;
      const nk = bones.Neck;
      if (tor && nk) {
        tor.getWorldScale(ws);
        const s = 1 / ws.x;
        const rest = nk.position.clone();
        const bone = new THREE.Mesh(strands(rest.length() * ws.x * 0.55, 0.02, 1, seeded(31), 0.5), boneMat);
        bone.frustumCulled = false;
        bone.scale.setScalar(s);
        bone.quaternion.setFromUnitVectors(Y, rest.clone().normalize());
        bone.position.copy(rest).multiplyScalar(0.45);
        bone.position.x += 0.045 * s;
        tor.add(bone);
      }
      // la barre d'épaules : une traverse droite et large, comme un cintre, d'où pendent les bras ; et sous elle, une
      // seconde plus courte, décalée
      const ua = bones.UpperArmL;
      const ub = bones.UpperArmR;
      if (tor && nk && ua && ub) {
        for (const q of st.stretch) q.B.position.copy(q.rest).multiplyScalar(q.k);
        root.updateMatrixWorld(true);
        const pa = ua.getWorldPosition(new THREE.Vector3());
        const pb = ub.getWorldPosition(new THREE.Vector3());
        const la = tor.worldToLocal(pa.clone());
        const lb = tor.worldToLocal(pb.clone());
        tor.getWorldScale(ws);
        const s = 1 / ws.x;
        const span = pa.distanceTo(pb);
        const across = lb.clone().sub(la).normalize();
        const down = nk.position.clone().normalize().negate();
        const bar = new THREE.Mesh(strands(span * 1.18, 0.016, 2, seeded(41), 1.2), skinMat);
        bar.frustumCulled = false;
        bar.scale.setScalar(s);
        bar.quaternion.setFromUnitVectors(Y, across);
        bar.position.copy(la).add(lb).multiplyScalar(0.5);
        tor.add(bar);
        const bar2 = new THREE.Mesh(strands(span * 0.45, 0.011, 1, seeded(43), 1.5), skinMat);
        bar2.frustumCulled = false;
        bar2.scale.setScalar(s);
        bar2.quaternion.setFromUnitVectors(Y, across.clone().addScaledVector(down, 0.08).normalize());
        bar2.position.copy(la).lerp(lb, 0.68).addScaledVector(down, 0.13 * s);
        tor.add(bar2);
      }
    }
    // côtes saillantes sur le torse
    const torso = bones.Torso;
    if (torso && !wiry) {
      torso.getWorldScale(ws);
      for (let i = 0; i < 4; i++) {
        // (Level 0 : un cadre de fils de fer, à peine plus large que la colonne, qu'on voit à travers)
        const rib = new THREE.Mesh(wiry ? new THREE.TorusGeometry(0.09 - i * 0.006, 0.008, 3, 10, Math.PI * 1.5) : new THREE.TorusGeometry(0.12 - i * 0.008, 0.012, 5, 14, Math.PI * 1.2), skinMat);
        rib.scale.setScalar(1 / ws.x);
        rib.rotation.set(Math.PI / 2, 0, -Math.PI * 0.1);
        rib.position.set(0, (0.04 + i * 0.05) / ws.x, 0.02 / ws.x);
        torso.add(rib);
      }
    }
    // la tête : un crâne allongé, et le visage tourné vers l'avant (là où regarde le modèle au repos)
    const head = bones.Head;
    if (head) {
      head.getWorldScale(ws);
      const s = 1 / ws.x;
      const q = new THREE.Quaternion();
      head.getWorldQuaternion(q);
      const rootQ = new THREE.Quaternion();
      root.getWorldQuaternion(rootQ);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).applyQuaternion(q.clone().invert()).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(wiry ? 0.11 : 0.15, 14, 12), skinMat);
      skull.scale.set(s * (wiry ? 1.25 : 1), s * (wiry ? 0.85 : 1.45), s * (wiry ? 1.15 : 1.1));
      skull.position.copy(up).multiplyScalar((wiry ? 0.11 : 0.17) * s);
      head.add(skull);
      if (wiry) {
        // un bord plat, mince et large, autour du bas de la tête (un chapeau vu presque de profil), un peu de travers,
        // son ourlet roulé, et une mèche de brins qui s'en échappe
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.012, 20), skinMat);
        brim.scale.set(s, s, s * 0.75);
        brim.position.copy(up).multiplyScalar(0.06 * s);
        brim.rotation.set(0.08, 0, -0.12);
        head.add(brim);
        const hem = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.012, 4, 24), skinMat);
        hem.scale.set(s, s * 0.75, s);
        hem.position.copy(brim.position);
        hem.rotation.set(Math.PI / 2 + 0.08, -0.12, 0);
        head.add(hem);
        const fray = new THREE.Mesh(strands(0.4, 0.006, 3, seeded(5)), skinMat);
        fray.scale.setScalar(s);
        fray.position.copy(up).multiplyScalar(0.05 * s);
        fray.rotation.set(0.1, 0.4, Math.PI / 2 - 0.15);
        head.add(fray);
      }
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.36), faceMat);
      face.scale.setScalar(s * (wiry ? 0.72 : 1));
      // (devant le bord plat : il ne le barre pas)
      if (wiry) face.position.copy(up).multiplyScalar(0.1 * s).addScaledVector(fwd, 0.215 * s);
      else face.position.copy(up).multiplyScalar(0.16 * s).addScaledVector(fwd, 0.162 * s);
      face.lookAt(face.position.clone().add(fwd)); // dans le repère de l'os : le plan regarde vers l'avant
      head.add(face);
      st.head = head;
      st.face = face;
      st.faceS = s * (wiry ? 0.72 : 1);
      st.faceY = face.position.clone();
      st.faceDown = up.clone().multiplyScalar(-0.035 * s);
    }
    st.torso = torso;
    st.neck = bones.Neck;
    st.b = bones;
    for (const s of L) {
      for (const f of ['Index', 'Middle', 'Pinky', 'Thumb']) {
        for (let i = 1; i <= 3; i++) {
          const o = bones[`${f}${i}${s}`];
          if (o) st.fingers.push({ o, c: 0.3, want: 0.3, t: Math.random(), thumb: f === 'Thumb' });
        }
      }
    }
    // la pose de repos de chaque os : on y revient avant chaque image, sinon les retouches (dos voûté, tête
    // penchée) s'ajoutent d'une image à l'autre sur les os que l'animation ne touche pas
    st.rest = [];
    st.R = {};
    root.traverse((o) => {
      if (o.isBone) {
        st.rest.push({ o, q: o.quaternion.clone() });
        st.R[o.name] = st.rest[st.rest.length - 1].q;
      }
    });
    st.mixer = new THREE.AnimationMixer(root);
    st.acts = {};
    for (const n of ['Idle', 'Walk', 'Run']) {
      const c = source.animations.find((a) => a.name.endsWith('|' + n));
      if (!c) continue;
      st.acts[n] = st.mixer.clipAction(c);
      st.acts[n].play();
      st.acts[n].weight = n === 'Idle' ? 1 : 0;
    }
    // les jambes rallongées : on soulève le corps pour que les pieds touchent le sol
    const legLen = ['UpperLegL', 'LowerLegL'].reduce((a, n) => {
      const b = bones[n];
      const c = b && b.children.find((o) => /LowerLeg|_end/.test(o.name));
      return a + (c ? c.position.length() * 100 : 0);
    }, 0);
    root.position.y = legLen * (LEG - 1) * SCALE;
    // un pied osseux au bout de chaque jambe
    for (const s of L) {
      const end = bones[`LowerLeg${s}_end`];
      if (!end) continue;
      end.getWorldScale(ws);
      const foot = new THREE.Mesh(wiry ? strands(0.22, 0.01, 2, seeded(11)) : new THREE.CapsuleGeometry(0.035, 0.18, 3, 8), skinMat);
      foot.scale.setScalar(1 / ws.x);
      foot.rotation.x = Math.PI / 2;
      end.add(foot);
    }
    group.add(root);
    st.ready = true;
  };
  if (source) build();
  else loading.then(() => source && build());

  // --- outils sans allocation ---
  const _q = new THREE.Quaternion();
  const _pq = new THREE.Quaternion();
  const _gq = new THREE.Quaternion();
  const _d = new THREE.Quaternion();
  const _ax = new THREE.Vector3();
  const rnd = (a, b) => a + Math.random() * (b - a);
  // tourne un os autour d'un axe du repère du corps (+x : sa gauche, +y : le haut, +z : devant elle), autour de son
  // articulation ; les os enfants suivent
  const rot = (bone, x, y, z, a) => {
    if (!bone || !a) return;
    _ax.set(x, y, z).applyQuaternion(_gq);
    bone.parent.getWorldQuaternion(_pq);
    _ax.applyQuaternion(_pq.invert());
    _q.setFromAxisAngle(_ax, a);
    bone.quaternion.premultiply(_q);
  };
  // exagère le mouvement que l'animation donne à un os (k > 1 : des enjambées et des gestes plus amples)
  const amp = (bone, k) => {
    if (!bone || k === 1) return;
    const rq = st.R[bone.name];
    _d.copy(rq).invert().multiply(bone.quaternion);
    if (_d.w < 0) _d.set(-_d.x, -_d.y, -_d.z, -_d.w);
    const w = Math.min(1, _d.w);
    const sn = Math.sqrt(1 - w * w);
    if (sn < 1e-4) return;
    _ax.set(_d.x / sn, _d.y / sn, _d.z / sn);
    _d.setFromAxisAngle(_ax, 2 * Math.acos(w) * k);
    bone.quaternion.copy(rq).multiply(_d);
  };
  // pointe un os (de son articulation vers celle de son os enfant) dans une direction du repère du corps : les bras
  // pendent selon la pesanteur, quel que soit l'angle du dos
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const aim = (bone, child, dir) => {
    if (!bone || !child) return;
    bone.getWorldPosition(_a);
    child.getWorldPosition(_b);
    _b.sub(_a);
    if (_b.lengthSq() < 1e-8) return;
    _b.normalize();
    _a.copy(dir).normalize().applyQuaternion(_gq);
    _q.setFromUnitVectors(_b, _a);
    bone.parent.getWorldQuaternion(_pq);
    // q (monde) ramené dans le repère du parent : P⁻¹ q P
    _d.copy(_pq).invert().multiply(_q).multiply(_pq);
    bone.quaternion.premultiply(_d);
  };
  // la direction d'un bras : a (autour de l'axe gauche-droite : > 0 vers l'arrière, < 0 vers l'avant), c (écarté du
  // corps, du côté side)
  const armDir = (a, c, side, out) => out.set(side * Math.cos(a) * Math.sin(c), -Math.cos(a) * Math.cos(c), -Math.sin(a));
  const _dir = new THREE.Vector3();
  // un ressort (sp = [position, vitesse]) : raide et peu amorti, il dépasse et revient d'un coup sec
  const spring = (sp, k, c, drive, dt) => {
    sp[1] += (-k * sp[0] - c * sp[1] + drive) * dt;
    sp[0] += sp[1] * dt;
  };
  const ease = (v, want, rate, dt) => v + (want - v) * Math.min(1, dt * rate);
  // entre deux poses, le corps reste là où il était (sauf un saut de plus de 2 m : changement d'étage, téléportation)
  const keepAt = (M) => {
    const H = st.held;
    const parent = group.parent;
    const dx = H.x - M.x;
    const dz = H.z - M.z;
    if (!H.ok || dx * dx + dz * dz > 4 || !parent) {
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      return;
    }
    const py = parent.rotation.y;
    const c = Math.cos(py);
    const sn = Math.sin(py);
    group.position.set(dx * c - dz * sn, 0, dx * sn + dz * c);
    let ry = H.yaw - py;
    ry = Math.atan2(Math.sin(ry), Math.cos(ry));
    group.rotation.set(0, ry, 0);
  };

  return {
    group,
    // le jumpscare : son visage le plus déformé, le corps recollé à son groupe ; rend le visage (pour le placer
    // juste devant l'objectif)
    scareFace() {
      faceMat.map = faces[3];
      if (st.face) st.face.visible = true;
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      return st.face || st.head || null;
    },
    // M : l'entité ; chase : elle poursuit ; light : lumière des néons là où elle est ; dt : durée de l'image ;
    // eye : la caméra de cet écran (elle la suit des yeux quand elle observe). Rend le pied qui vient de toucher le
    // sol ('L' ou 'R', pour faire entendre le pas à cet instant), sinon null
    update(M, chase, light, dt, time, eye = null) {
      // sa vitesse, d'après son déplacement (pareil chez l'hôte et chez les invités)
      const L0 = st.last;
      const yaw = M.yaw || 0;
      if (L0.ok && dt > 0) {
        const jump = Math.hypot(M.x - L0.x, M.z - L0.z);
        const v = jump > 3 ? st.speed : jump / dt; // téléportée (changement d'étage) : on ne compte pas le saut
        const old = st.speed;
        st.speed += (Math.min(9, v) - st.speed) * Math.min(1, dt * 6);
        st.accel = ease(st.accel, (st.speed - old) / dt, 8, dt);
        let dy = yaw - L0.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        st.turn = ease(st.turn, dy / dt, 8, dt);
      }
      L0.x = M.x;
      L0.z = M.z;
      L0.yaw = yaw;
      L0.ok = true;
      const rush = (M.rushT || M.rush || 0) > 0;
      skinMat.emissiveIntensity = Math.min(0.6, light * 0.25);
      faceMat.map = rush ? faces[2] : chase || M.mode === 'grab' ? faces[1] : faces[0];
      // Level 0 : une tête noire, sans visage ; la bouche n'apparaît que quand elle se rue ou qu'elle saisit
      if (wiry && st.face) st.face.visible = !!photo || rush || M.mode === 'grab';

      // image par image : entre deux poses, le corps ne bouge pas et reste là où il était (sauf un saut de plus de
      // 2 m : un changement d'étage, une téléportation)
      const H = st.held;
      const parent = group.parent;
      st.acc += dt;
      st.holdT -= dt;
      if (st.holdT > 0 && st.ready) {
        keepAt(M);
        // la ruée : tout le corps tremble, même entre deux poses
        if (st.k.rush > 0.05) {
          group.position.x += (Math.random() - 0.5) * 0.05 * st.k.rush;
          group.position.z += (Math.random() - 0.5) * 0.05 * st.k.rush;
          group.rotation.z = (Math.random() - 0.5) * 0.08 * st.k.rush;
        }
        return;
      }
      let step = st.acc;
      st.acc = 0;
      // la cadence : figée quand elle observe, saccadée en marchant, frénétique en courant
      const K = st.k;
      st.holdT = rush ? rnd(0.016, 0.034) : K.still > 0.5 ? rnd(0.06, 0.1) : K.run > 0.5 ? rnd(0.03, 0.05) : rnd(0.033, 0.07);
      // parfois une image manque : elle a bougé plus que le temps écoulé
      if (st.speed > 0.4 && Math.random() < (rush ? 0.08 : 0.035)) step += rnd(0.12, 0.3);
      H.x = M.x;
      H.z = M.z;
      H.yaw = parent ? parent.rotation.y : yaw;
      H.ok = true;
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      if (!st.ready) return;
      const sdt = Math.min(step, 0.4);

      // --- les états ---
      const mode = M.mode;
      const sp = st.speed;
      const grab = mode === 'grab';
      const stun = mode === 'stun';
      const stillWant = !rush && !grab && !stun && sp < 0.3 && mode !== 'chase' && mode !== 'flee' ? 1 : 0;
      K.still = ease(K.still, stillWant, 5, sdt);
      K.rush = ease(K.rush, rush ? 1 : 0, 10, sdt);
      K.grab = ease(K.grab, grab ? 1 : 0, 9, sdt);
      K.stun = ease(K.stun, stun ? 1 : 0, 9, sdt);

      const want = rush || sp > 2.4 ? 'Run' : sp < 0.25 ? 'Idle' : 'Walk';
      for (const n in st.acts) {
        st.w[n] = ease(st.w[n], n === want ? 1 : 0, 7, sdt);
        st.acts[n].weight = st.w[n];
      }
      K.run = ease(K.run, want === 'Run' ? 1 : 0, 7, sdt);
      // la marche boite : un pas rapide, un pas traîné
      const walk = st.acts.Walk;
      if (walk) {
        const ph = (walk.time / walk.getClip().duration) * Math.PI * 4;
        walk.timeScale = THREE.MathUtils.clamp(sp / 1.6, 0.55, 1.6) * (0.5 + 0.9 * (0.5 + 0.5 * Math.sin(ph)));
      }
      // la course : une cadence trop rapide pour sa taille. Vers 3,3 m/s, un pas toutes les 0,27 s : celle des pas
      // de l'enregistrement de la poursuite ; plus vite, les pas se serrent moins vite que la vitesse ne monte
      if (st.acts.Run) st.acts.Run.timeScale = rush ? 1.9 : THREE.MathUtils.clamp(1.32 * Math.sqrt(sp / 3.3), 1.0, 2.2);
      // immobile, elle ne respire pas
      if (st.acts.Idle) st.acts.Idle.timeScale = 1 - K.still * 0.97;

      // les pas : le pied qui touche le sol pendant cette pose (au plus un), d'après le clip qui domine
      const dom = (st.w.Run || 0) > 0.35 && (st.w.Run || 0) >= (st.w.Walk || 0) ? 'Run' : (st.w.Walk || 0) > 0.35 ? 'Walk' : null;
      const da = dom ? st.acts[dom] : null;
      const ph0 = da ? (da.time / da.getClip().duration) % 1 : 0;
      for (const r of st.rest) r.o.quaternion.copy(r.q);
      st.mixer.update(step);
      let foot = null;
      if (da && sp > 0.3) {
        const ph1 = (da.time / da.getClip().duration) % 1;
        for (const [p, side] of FOOT_AT[dom]) if (ph1 >= ph0 ? p > ph0 && p <= ph1 : p > ph0 || p <= ph1) foot = side;
      }
      for (const s of st.stretch) s.B.position.copy(s.rest).multiplyScalar(s.k);
      group.getWorldQuaternion(_gq);
      const B = st.b;

      // --- sursauts : une secousse de temps en temps (plus souvent quand elle chasse) ---
      st.jerkT -= sdt;
      if (st.jerkT <= 0) {
        st.jerkT = K.still > 0.5 ? rnd(1.2, 4.5) : chase || rush ? rnd(0.3, 1.2) : rnd(0.8, 3);
        const r = Math.random();
        const kick = rnd(14, 30) * (Math.random() < 0.5 ? -1 : 1);
        if (r < 0.3) st.sp.head[1] += kick;
        else if (r < 0.5) st.sp.shL[1] += kick;
        else if (r < 0.7) st.sp.shR[1] += kick;
        else if (r < 0.85) st.sp.torso[1] += kick * 0.6;
        else {
          st.sp.armL[1] += kick;
          st.sp.armR[1] -= kick * 0.7;
        }
        // et la tête casse d'un coup vers un autre angle impossible
        if (Math.random() < 0.45) st.tiltT = 0;
      }
      for (let t = sdt; t > 1e-4; t -= 1 / 60) {
        const h = Math.min(t, 1 / 60);
        spring(st.sp.head, 320, 9, 0, h);
        spring(st.sp.shL, 260, 8, 0, h);
        spring(st.sp.shR, 260, 8, 0, h);
        spring(st.sp.torso, 200, 10, 0, h);
        // les bras pendent et ballottent en retard : un pendule mou, poussé par les accélérations et les virages
        spring(st.sp.armL, 16, 1.4, -st.accel * 2.2, h);
        spring(st.sp.armR, 21, 1.7, -st.accel * 2.2, h);
        spring(st.sp.swayL, 14, 1.2, st.turn * sp * 1.4, h);
        spring(st.sp.swayR, 18, 1.5, st.turn * sp * 1.4, h);
      }
      const clampS = (v, m) => Math.max(-m, Math.min(m, v));

      // --- la tête : cassée sur le côté, elle change d'angle d'un coup ---
      st.tiltT -= sdt;
      if (st.tiltT <= 0) {
        st.tiltT = chase ? rnd(0.4, 1.4) : rnd(0.9, 4);
        const side = Math.random() < 0.7 ? Math.sign(st.tilt || 1) : -Math.sign(st.tilt || 1);
        st.tilt = side * rnd(0.55, 1.2);
      }
      st.tickT -= sdt;
      if (st.tickT <= 0) {
        st.tickT = rnd(0.25, 1.4);
        st.tickY = rnd(-0.14, 0.14);
        st.tickX = rnd(-0.08, 0.08);
      }

      const run = K.run;
      const rk = K.rush;
      const still = K.still;
      const gk = K.grab;
      const sk = K.stun;
      st.fl += sdt * (rush ? 17 : 11) * run;

      // --- le tronc : voûté, de travers, penché en avant pour courir ---
      // (Level 0 : droite et raide comme un épouvantail ; elle ne se penche que pour courir ou se ruer)
      const lean = wiry ? 0.03 + 0.28 * run + 0.35 * rk + 0.2 * gk - 0.55 * sk : 0.22 + 0.3 * run + 0.35 * rk + 0.12 * still + 0.25 * gk - 0.55 * sk;
      rot(B.Abdomen, 1, 0, 0, lean + clampS(st.sp.torso[0], 0.5) * 0.4);
      rot(B.Torso, 1, 0, 0, (wiry ? 0.02 : 0.22) + 0.1 * run);
      rot(B.Torso, 0, 0, 1, (wiry ? 0.02 : 0.13) + (st.w.Walk || 0) * 0.12 * Math.sin(st.acts.Walk ? (st.acts.Walk.time / st.acts.Walk.getClip().duration) * Math.PI * 2 : 0));
      rot(B.Torso, 0, 1, 0, run * 0.28 * Math.sin(st.fl) + (rush ? rnd(-0.12, 0.12) : 0));

      // --- les épaules : l'une remontée, l'autre tombante ---
      const shK = wiry ? 0.25 : 1; // la barre d'épaules reste droite
      rot(B.ShoulderL, 0, 0, 1, (0.3 + clampS(st.sp.shL[0], 0.6) * 0.6 + 0.12 * still) * shK);
      rot(B.ShoulderR, 0, 0, 1, (0.2 + clampS(st.sp.shR[0], 0.6) * 0.6) * shK);
      rot(B.ShoulderL, 1, 0, 0, 0.15 + 0.2 * rk);
      rot(B.ShoulderR, 1, 0, 0, 0.15 + 0.2 * rk);

      // --- les bras : pendants et ballants ; en course, tendus devant et battant l'air ; dans la ruée, raides devant ---
      for (const s of L) {
        const left = s === 'L';
        const ua = B[`UpperArm${s}`];
        const la = B[`LowerArm${s}`];
        const pend = clampS((left ? st.sp.armL : st.sp.armR)[0], 0.9);
        const sway = clampS((left ? st.sp.swayL : st.sp.swayR)[0], 0.6);
        const flail = run * (0.85 * Math.sin(st.fl + (left ? 0 : 2.3)) + 0.4 * Math.sin(st.fl * 2.7 + (left ? 1 : 0)));
        const reach = -0.45 * run - 1.3 * rk - 1.25 * gk - 2.3 * sk;
        const shake = rush || grab ? rnd(-0.16, 0.16) : 0;
        const side = left ? 1 : -1;
        // le bras : il pend (et ballotte), il bat l'air en courant, il se tend devant pour saisir
        const a = pend + flail * (1 - rk * 0.75) + reach + shake;
        const c = (wiry ? 0.03 : 0.1) + sway * 0.5 * side + 0.3 * run + 0.12 * rk - 0.22 * gk + 0.5 * sk + (rush ? rnd(-0.1, 0.1) : 0) + 0.08 * still * side;
        aim(ua, la, armDir(a, c, side, _dir));
        // l'avant-bras : le coude plie à l'envers (la main part vers l'arrière) ; il se casse quand elle bat l'air
        const bend = ((wiry ? 0.05 : 0.42) + 0.35 * run * (0.5 + 0.5 * Math.sin(st.fl * 1.7 + (left ? 0 : 1.1)))) * (1 - 0.85 * Math.max(rk, gk)) - 1.4 * sk;
        aim(la, B[`Middle1${s}`], armDir(a + bend, c + 0.1 * still, side, _dir));
      }

      // --- les doigts : ils tressaillent chacun de leur côté ; écartés et tremblants dans la ruée, serrés pour saisir ---
      for (const f of st.fingers) {
        f.t -= sdt;
        if (f.t <= 0) {
          f.t = rnd(0.08, chase ? 0.5 : 1.6);
          f.want = Math.random() < 0.25 ? rnd(-0.35, 1.0) : rnd(0.1, 0.45);
        }
        f.c = f.want;
        let c = f.c * (1 - rk - gk) + rk * (-0.12 + rnd(-0.2, 0.2)) + gk * 1.1;
        if (f.thumb) c *= 0.5;
        f.o.rotateX(c);
      }

      // --- le cou s'étire vers toi quand elle regarde ; la tête reste droite, verrouillée sur sa cible en courant ---
      // --- elle te suit des yeux quand elle t'observe (à l'affût, en rôdant au bord de la lumière, en approchant
      // dans l'ombre) : le cou puis la tête pivotent vers toi, d'une pose à l'autre, bien plus loin qu'un cou ne
      // devrait tourner. Le corps, lui, continue d'aller où il va ---
      const watching = eye && !rush && !grab && !stun && (mode === 'watch' || mode === 'stalk' || mode === 'ambush');
      let wantY = 0;
      let wantX = 0;
      if (eye) {
        const ex = eye.x - M.x;
        const ez = eye.z - M.z;
        const by = parent ? parent.rotation.y : yaw;
        let rel = Math.atan2(ex, ez) - by;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        wantY = clampS(rel, 2.1);
        // vers le bas, si tu es plus bas que sa tête (et tout près)
        wantX = clampS(Math.atan2((parent ? parent.position.y : 0) + 2.45 - eye.y, Math.max(0.6, Math.hypot(ex, ez))), 0.7);
      }
      st.look = ease(st.look, watching ? 1 : 0, watching ? 7 : 4, sdt);
      st.lookY = ease(st.lookY, wantY, 12, sdt);
      st.lookX = ease(st.lookX, wantX, 8, sdt);
      const lk = st.look;

      const crane = wiry ? 0.04 + 0.12 * still + 0.15 * run + 0.4 * rk + 0.45 * gk - 0.4 * sk : 0.18 + 0.75 * still + 0.25 * run + 0.4 * rk + 0.45 * gk - 0.4 * sk;
      rot(B.Neck, 1, 0, 0, crane);
      rot(B.Neck, 0, 1, 0, 0.4 * lk * st.lookY);
      const level = -(lean + (wiry ? 0.02 : 0.22) + crane) * (0.55 + 0.4 * Math.max(run, rk, still));
      rot(B.Head, 1, 0, 0, level + st.tickX * still + clampS(st.sp.head[0], 0.7) * 0.3 - 0.25 * sk + (rush ? rnd(-0.08, 0.08) : 0) + 0.6 * lk * st.lookX);
      const tilt = st.tilt * (wiry ? 0.3 : 1) * (1 - 0.45 * run) * (1 - 0.5 * rk) * (1 - 0.35 * lk) + clampS(st.sp.head[0], 0.8) * 0.7;
      rot(B.Head, 0, 0, 1, tilt + (rush ? rnd(-0.25, 0.25) : 0));
      rot(B.Head, 0, 1, 0, st.tickY * still * (1 - lk) + 0.9 * sk + 0.6 * lk * st.lookY);

      // --- les jambes : genoux qui plient à l'envers, une jambe raide qui traîne, des enjambées trop longues ---
      for (const s of L) {
        const left = s === 'L';
        amp(B[`UpperLeg${s}`], 1 + 0.45 * run + 0.25 * rk);
        amp(B[`LowerLeg${s}`], 1 + 0.3 * run);
        const limp = !left ? (st.w.Walk || 0) * (1 - run) : 0;
        rot(B[`LowerLeg${s}`], 1, 0, 0, -0.2 - 0.35 * limp - 0.1 * still);
        rot(B[`UpperLeg${s}`], 0, 0, 1, (left ? 1 : -1) * (0.05 + 0.1 * limp + 0.06 * still));
      }

      // --- la bouche s'ouvre en grand dans la ruée ---
      if (st.face) {
        const g = 1 + 0.4 * rk;
        st.face.scale.set(st.faceS * (1 + 0.06 * rk), st.faceS * g, st.faceS);
        st.face.position.copy(st.faceY).addScaledVector(st.faceDown, rk);
      }
      keepAt(M);
      return foot;
    },
  };
}
