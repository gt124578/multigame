// The Backrooms (Level 2) - L'habillage des galeries de service : faisceaux de tuyaux au plafond (calorifuge, acier
// galvanisé, cuivre, fonte, sprinklers, chemin de câbles) sur leurs suspentes, lampes grillagées au mur et leur gaine,
// portes métalliques, plaques, grilles à barreaux blanches (fermées : une cage d'une case qu'on ne traverse pas ;
// ouvertes : le battant rabattu contre le mur), chaudières, vannes à volant et manomètres, et la vapeur (les jets qui
// traversent les couloirs, les fuites, le nuage devant l'ascenseur tant que les vannes sont ouvertes).
// Tout est dessiné dans le code et tiré d'une graine propre à la carte : chacun voit les mêmes galeries.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { CELL_SIZE, T } from '../engine/map.js';
import { Z } from '../engine/level2.js';
import { createKitInstancer, loadKit } from './kit.js';

const C = CELL_SIZE;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// --- Objets dessinés dans le code (posés comme les modèles : dos au mur vers -z, ils regardent +z) ---

// Un fagot de tubes électriques (les tubes du kit Poly Haven « modular_pipes ») appuyé au mur : pied loin du mur,
// tête contre le mur (-z) ; deux sont teintés comme les gaines bleue et orange. Le modèle se charge : une promesse.
export function makeConduits() {
  return loadKit('modular_pipes').then((pieces) => {
    const g = new THREE.Group();
    const parts = pieces.get('pipe_thin_200cm_metal') || [];
    const L = 2.4;
    const tints = [null, null, null, null, null, [0.35, 0.5, 1.1], [1.15, 0.6, 0.3]];
    const tmp = new THREE.Matrix4();
    tints.forEach((tint, i) => {
      const x = (i - 3) * 0.035 + Math.sin(i * 7.1) * 0.02;
      const bz = 0.22 + Math.sin(i * 3.3) * 0.04;
      const tilt = Math.asin((bz + 0.16) / L) * (i < 5 ? 1 : 0.8);
      const r = i < 5 ? 0.42 : 0.3;
      for (const p of parts) {
        const mat = p.mat.clone();
        if (tint) mat.color.multiply(new THREE.Color(...tint));
        const m = new THREE.Mesh(p.geo, mat);
        tmp.makeTranslation(x, 0, bz).multiply(new THREE.Matrix4().makeRotationX(-tilt)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(L / 2, r, r)).multiply(p.m);
        m.applyMatrix4(tmp);
        g.add(m);
      }
    });
    return g;
  });
}

export function makeBucket() {
  const g = new THREE.Group();
  const y = new THREE.MeshPhongMaterial({ color: '#c99a14', shininess: 30 });
  const grey = new THREE.MeshLambertMaterial({ color: '#4d4f50' });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 18, 1, true), y);
  b.position.y = 0.17;
  b.material.side = THREE.DoubleSide;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 18), y);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.025;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), new THREE.MeshLambertMaterial({ color: '#3d3a2c' }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.2;
  const wr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), grey);
  wr.position.set(0, 0.33, -0.05);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), grey);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * 0.12, 0.025, 0.1);
    g.add(w);
  }
  g.add(b, bottom, water, wr);
  return g;
}

// rouille d'un fer à béton : orange brun, les nervures en biais plus sombres
let rustTex = null;
function rebarTexture() {
  if (rustTex) return rustTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, '#3a1d0e');
  g.addColorStop(0.5, '#8a4724');
  g.addColorStop(1, '#3a1d0e');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 128);
  x.strokeStyle = 'rgba(30, 14, 6, 0.75)';
  x.lineWidth = 3;
  for (let y = -16; y < 144; y += 9) {
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(32, y + 7);
    x.stroke();
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(160, 80, 30, 0.5)' : 'rgba(40, 22, 12, 0.5)';
    x.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 6);
  }
  rustTex = new THREE.CanvasTexture(c);
  rustTex.wrapS = rustTex.wrapT = THREE.RepeatWrapping;
  rustTex.repeat.set(1, 14);
  return rustTex;
}

// Fagot de fers à béton rouillés (armatures) appuyé contre le mur
export function makeRebar() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: rebarTexture() });
  const L = 2.6;
  for (let i = 0; i < 9; i++) {
    const r = 0.007 + (i % 3) * 0.002;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), mat);
    const x = (i - 4) * 0.022 + Math.sin(i * 5.3) * 0.015;
    const bz = 0.3 + Math.sin(i * 2.7) * 0.06;
    m.position.set(x, (L / 2) * 0.98, (bz - 0.12) / 2);
    m.rotation.x = -Math.asin((bz + 0.12) / L);
    m.rotation.z = Math.sin(i * 1.9) * 0.02;
    g.add(m);
  }
  // un fil de ligature
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.004, 4, 16), new THREE.MeshLambertMaterial({ color: '#2c2a26' }));
  tie.position.set(0, 1.6, 0.06);
  tie.rotation.x = Math.PI / 2 - 0.12;
  tie.scale.set(1, 0.35, 1);
  g.add(tie);
  return g;
}

// un bloc de béton cassé (sommets bousculés, facettes)
function chunk(size, mat, rng) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + rng() * 0.6), p.getY(i) * (0.45 + rng() * 0.4), p.getZ(i) * (0.7 + rng() * 0.6));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Gravats tombés du plafond : blocs de béton, éclats de carrelage, fers tordus
export function makeRubble() {
  let s = 7;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new THREE.Group();
  const conc = new THREE.MeshLambertMaterial({ color: '#7d776c', flatShading: true });
  const conc2 = new THREE.MeshLambertMaterial({ color: '#5f5a52', flatShading: true });
  for (let i = 0; i < 14; i++) {
    const sz = i < 3 ? 0.16 + rng() * 0.08 : 0.04 + rng() * 0.07;
    const m = chunk(sz, i % 3 ? conc : conc2, rng);
    const a = rng() * Math.PI * 2;
    const d = i < 3 ? rng() * 0.12 : 0.1 + rng() * 0.4;
    m.position.set(Math.cos(a) * d, sz * 0.35, Math.sin(a) * d);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(m);
  }
  const tiles = [new THREE.MeshLambertMaterial({ color: '#b48a46' }), new THREE.MeshLambertMaterial({ color: '#6e4a2c' })];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05 + rng() * 0.08, 0.008, 0.04 + rng() * 0.06), tiles[i % 2]);
    const a = rng() * Math.PI * 2;
    const d = 0.15 + rng() * 0.45;
    m.position.set(Math.cos(a) * d, 0.006, Math.sin(a) * d);
    m.rotation.set((rng() - 0.5) * 0.3, rng() * 3, (rng() - 0.5) * 0.3);
    g.add(m);
  }
  const rust = new THREE.MeshLambertMaterial({ map: rebarTexture() });
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), rust);
    a.position.y = 0.25;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), rust);
    b.position.set(0.15, 0.5, 0);
    b.rotation.z = Math.PI / 2 + 0.4;
    bar.add(a, b);
    bar.position.set((rng() - 0.5) * 0.3, 0.05, (rng() - 0.5) * 0.3);
    bar.rotation.set((rng() - 0.5) * 1.6, rng() * 6, (rng() - 0.5) * 1.6);
    g.add(bar);
  }
  return g;
}

// Déchets au sol : feuilles de papier, boulettes froissées, un carton aplati, des mégots
export function makeLitter() {
  let s = 11;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new THREE.Group();
  const paper = [new THREE.MeshLambertMaterial({ color: '#d9d3c2', side: THREE.DoubleSide }), new THREE.MeshLambertMaterial({ color: '#c7b98f', side: THREE.DoubleSide })];
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.PlaneGeometry(0.21, 0.297, 3, 3);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, (rng() - 0.5) * 0.02);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paper[i % 2]);
    m.rotation.set(-Math.PI / 2 + (rng() - 0.5) * 0.1, 0, rng() * 6);
    m.position.set((rng() - 0.5) * 0.7, 0.004 + i * 0.002, (rng() - 0.5) * 0.5);
    g.add(m);
  }
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.IcosahedronGeometry(0.035, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.7 + rng() * 0.5), p.getY(k) * (0.6 + rng() * 0.4), p.getZ(k) * (0.7 + rng() * 0.5));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paper[0]);
    m.position.set((rng() - 0.5) * 0.8, 0.025, (rng() - 0.5) * 0.6);
    g.add(m);
  }
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.006, 0.3), new THREE.MeshLambertMaterial({ color: '#8a6a43' }));
  card.position.set(0.25, 0.003, -0.15);
  card.rotation.y = 0.6;
  g.add(card);
  const butt = new THREE.MeshLambertMaterial({ color: '#c8a26a' });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), butt);
    m.rotation.set(Math.PI / 2, 0, rng() * 6);
    m.position.set((rng() - 0.5) * 0.6, 0.004, (rng() - 0.5) * 0.5);
    g.add(m);
  }
  return g;
}

// de la paille : brins clairs et sombres en tous sens sur un fond transparent (opaque : un tas de foin)
const strawTex = {};
export function strawTexture(opaque = false) {
  if (strawTex[opaque]) return strawTex[opaque];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (opaque) {
    g.fillStyle = '#6b5326';
    g.fillRect(0, 0, 256, 256);
  }
  for (let i = 0; i < (opaque ? 1400 : 700); i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    // les brins se raréfient vers le bord d'une plaque (posée par terre)
    if (!opaque && Math.hypot(x - 128, y - 128) > 60 + Math.random() * 70) continue;
    const a = Math.random() * Math.PI;
    const l = 10 + Math.random() * 26;
    const v = Math.random();
    g.strokeStyle = v < 0.6 ? `rgba(${200 + v * 50}, ${165 + v * 50}, ${80 + v * 40}, 0.95)` : `rgba(${110 + v * 30}, ${85 + v * 20}, ${40}, 0.9)`;
    g.lineWidth = 1 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  strawTex[opaque] = t;
  return t;
}

// Une auge de la bergerie : demi-tube de tôle galvanisée sur deux pieds, du foin dedans (dos au mur vers -z)
export function makeTrough() {
  const g = new THREE.Group();
  const tin = new THREE.MeshPhongMaterial({ color: '#8c8e86', shininess: 40, specular: '#444', side: THREE.DoubleSide });
  const rust = new THREE.MeshLambertMaterial({ color: '#5a3a24' });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.15, 18, 1, true, Math.PI / 2, Math.PI), tin);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.38;
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18, Math.PI, Math.PI), tin);
    end.rotation.y = Math.PI / 2;
    end.position.set(sx * 0.575, 0.38, 0);
    g.add(end);
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), rust);
      leg.position.set(sx * 0.45, 0.17, sz * 0.12);
      leg.rotation.x = sz * 0.25;
      g.add(leg);
    }
  }
  const hay = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: strawTexture(true) }));
  hay.scale.set(0.52, 0.12, 0.16);
  hay.position.y = 0.3;
  g.add(body, hay);
  return g;
}

export const L2_PROC = { conduits: makeConduits, bucket: makeBucket, rebar: makeRebar, rubble: makeRubble, litter: makeLitter, trough: makeTrough };

// une tache douce pour la vapeur et les halos
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const px = 64 + (Math.random() - 0.5) * 50;
    const py = 64 + (Math.random() - 0.5) * 50;
    const r = 20 + Math.random() * 34;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  }
  // bords toujours transparents
  x.globalCompositeOperation = 'destination-in';
  const m = x.createRadialGradient(64, 64, 30, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = m;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// map, group : l'étage ; baked(mat, { spec, gloss }) ajoute l'éclairage cuit ; tx : textures du Level 2
export function buildPipes({ map, group, baked, CEIL, tx, camera }) {
  const W = map.W;
  const H = map.H;
  const grid = map.grid;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? T.WALL : grid[z * W + x]);
  const zoneAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? 0 : map.zone[z * W + x]);
  let s = 5150 + Math.round(map.spawn.x * 29 + map.spawn.z * 13);
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (a, b) => ((((a * 73856093) ^ (b * 19349663) ^ 0x5bd1e995) >>> 0) % 1000) / 1000;
  const lambert = (o) => baked(new THREE.MeshLambertMaterial(o));
  const phong = (o, spec = 0.4, gloss = 40) => baked(new THREE.MeshPhongMaterial({ specular: '#222222', shininess: 30, ...o }), { spec, gloss });

  // Instances regroupées par maillage (matrices empilées, maillages créés à la fin)
  const bins = new Map();
  const bin = (key, geo, mat) => {
    if (!bins.has(key)) bins.set(key, { geo, mat, m: [] });
    return bins.get(key);
  };
  const dummy = new THREE.Object3D();
  const put = (b, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    b.m.push(dummy.matrix.clone());
  };
  // un cylindre d'axe x, y ou z (unité : rayon 1, longueur 1)
  const cyl = (b, axis, x, y, z, r, len) => {
    if (axis === 'x') put(b, x, y, z, r, len, r, 0, 0, Math.PI / 2);
    else if (axis === 'z') put(b, x, y, z, r, len, r, Math.PI / 2, 0, 0);
    else put(b, x, y, z, r, len, r);
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const M = {
    galv: phong({ map: tx.pipe.galv, shininess: 60, specular: '#555' }, 0.5, 50),
    copper: phong({ map: tx.pipe.copper, shininess: 70, specular: '#6a4630' }, 0.5, 60),
    iron: phong({ map: tx.pipe.iron, shininess: 20, specular: '#222' }, 0.15, 20),
    bars: phong({ color: '#d8d6cc', shininess: 40, specular: '#444' }, 0.35, 30),
    lampMetal: phong({ color: '#3a3833', shininess: 40, specular: '#333' }, 0.3, 30),
    cage: lambert({ color: '#2a2925' }),
    door: phong({ map: tx.pipe.steel, shininess: 40, specular: '#333' }, 0.35, 30),
    frame: phong({ color: '#5c5a52', shininess: 40, specular: '#333' }, 0.3, 30),
    handle: phong({ color: '#a6a69e', shininess: 90, specular: '#888' }, 0.8, 80),
    boiler: phong({ map: tx.pipe.boiler, shininess: 25, specular: '#333' }, 0.25, 20),
    concrete: lambert({ color: '#6e6a62' }),
    wheel: phong({ color: '#9c1b12', shininess: 50, specular: '#553333' }, 0.4, 40),
    tank: phong({ map: tx.pipe.boiler, color: '#9aa58f', shininess: 25, specular: '#333' }, 0.25, 20),
    straw: baked(new THREE.MeshLambertMaterial({ map: strawTexture(false), alphaTest: 0.4 })),
  };
  const signMats = new Map();
  const signMat = (i) => {
    if (!signMats.has(i)) {
      const t = tx.signs.clone();
      t.needsUpdate = true;
      t.repeat.set(0.25, 0.5);
      t.offset.set((i % 4) * 0.25, 0.5 - Math.floor(i / 4) * 0.5);
      signMats.set(i, lambert({ map: t }));
    }
    return signMats.get(i);
  };
  const signGeo = new THREE.PlaneGeometry(1, 0.5);

  // Les modèles Poly Haven (lampes, tuyaux en fonte, gaines, grilles d'égout, caméras…) : métal luisant, sauf les
  // sacs ; les vitres des lampes s'allument selon leur lampe
  const kitMats = new Map();
  // les variantes : la même photo de métal, teintée (peinture rouge des sprinklers, cuivre, fonte, rouille)
  const TINT = { red: [0.85, 0.17, 0.12], copper: [1.05, 0.62, 0.4], dark: [0.42, 0.4, 0.37], rust: [0.62, 0.33, 0.18], grime: [0.82, 0.78, 0.68] };
  const kit = createKitInstancer({
    group,
    convert: (src, kitName, piece, variant) => {
      const key = src.uuid + '@' + variant;
      if (!kitMats.has(key)) {
        if (/glass/i.test(src.name || '') && /lamp|light/.test(kitName)) kitMats.set(key, { mat: new THREE.MeshBasicMaterial({ color: '#ffffff' }), glass: true });
        else {
          const soft = /bag|broom/.test(kitName);
          const c = src.color.clone().multiplyScalar(src.map ? 0.9 : 0.75);
          if (TINT[variant]) c.multiply(new THREE.Color(...TINT[variant]));
          const shiny = variant === 'red' || variant === 'copper' ? 55 : variant === 'rust' || variant === 'dark' ? 14 : 40;
          const o = { map: src.map || null, color: c, side: src.side, shininess: soft ? 8 : shiny, specular: soft ? '#0c0c0c' : '#383838' };
          kitMats.set(key, { mat: phong(o, soft ? 0.05 : variant === 'rust' ? 0.12 : 0.45, soft ? 10 : 45) });
        }
      }
      return kitMats.get(key);
    },
  });
  const BULB_ON = new THREE.Color('#ffc27a').multiplyScalar(2.6);
  const TUBE_ON = new THREE.Color('#e4f0ff').multiplyScalar(2.4);
  const GLASS_OFF = new THREE.Color('#2e2a24');
  const glowCol = new THREE.Color();
  const glassGlow = (it) => {
    const l = it.light;
    const k = !l || l.state === 'off' ? 0 : l.k === undefined ? 1 : l.k;
    return k > 0 ? glowCol.copy(l.kind === 'tube' ? TUBE_ON : BULB_ON).multiplyScalar(0.4 + 0.6 * k) : GLASS_OFF;
  };
  const PIPEKIT = 'modular_industrial_pipes_01';
  const pk = (n) => PIPEKIT + '_pipe0' + n;
  // une colonne de tuyaux en fonte du sol au plafond, contre un mur, une vanne à volant rouge à mi-hauteur (ou pas)
  const riser = (x, z, ry, valve) => {
    if (valve) {
      kit.put(PIPEKIT, pk(1), x, 0.43, z, ry);
      kit.put(PIPEKIT, pk(8), x, 0.86 + 0.19, z, ry);
      kit.put(PIPEKIT, pk(2), x, 1.24 + (CEIL - 1.3) / 2, z, ry, [1, (CEIL - 1.3) / 1.95, 1]);
    } else {
      kit.put(PIPEKIT, pk(2), x, 0.975, z, ry);
      kit.put(PIPEKIT, pk(1), x, 1.95 + 0.43, z, ry);
      kit.put(PIPEKIT, pk(1), x, 2.81 + 0.25, z, ry, [1, 0.56, 1]);
    }
  };

  // --- 1. Faisceaux de tuyaux le long des galeries ---
  const nicheCells = new Set((map.niches || []).map((n) => n.gz * W + n.gx));
  const corr = (x, z) => {
    const v = at(x, z);
    if ((v !== T.FLOOR && v !== T.GATE) || nicheCells.has(z * W + x)) return false;
    const zn = zoneAt(x, z);
    return zn !== Z.BRICK && zn !== Z.BOILER && zn !== Z.HALL;
  };
  // --- 0. La dalle nervurée au-dessus des tuyaux : des poutres en béton tous les 5 m dans les deux sens, et entre
  // elles des nervures croisées qui dessinent des caissons ; le béton est celui du plafond, plaqué en coordonnées du
  // monde. Les poutres et les nervures traversent toute la carte (dans les murs, on ne les voit pas).
  const BEAM = 0.26; // retombée des poutres
  const RIB = 0.12; // retombée des nervures
  const DOWN = 0.14; // de combien les tuyaux descendent pour passer sous les poutres
  {
    const P = [];
    const N = [];
    const UV = [];
    const IDX = [];
    // une boîte alignée sur les axes, sans sa face du haut (collée à la dalle)
    const box = (x0, x1, y0, y1, z0, z1) => {
      const quad = (a, b, c, d, n, uv) => {
        const i = P.length / 3;
        for (const v of [a, b, c, d]) {
          P.push(...v);
          N.push(...n);
          UV.push(...uv(v));
        }
        IDX.push(i, i + 1, i + 2, i, i + 2, i + 3);
      };
      const xz = (v) => [v[0] / C, v[2] / C];
      const zy = (v) => [v[2] / C, v[1] / C];
      const xy = (v) => [v[0] / C, v[1] / C];
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], xz);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], zy);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], zy);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], xy);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], xy);
    };
    const X1 = W * C;
    const Z1 = H * C;
    for (let k = 2; k < W; k += 2) box(k * C - 0.15, k * C + 0.15, CEIL - BEAM, CEIL, 0, Z1);
    for (let k = 2; k < H; k += 2) box(0, X1, CEIL - BEAM - 0.004, CEIL, k * C - 0.15, k * C + 0.15);
    for (let k = 0; k < W; k++) for (const f of [1 / 6, 1 / 2, 5 / 6]) box((k + f) * C - 0.05, (k + f) * C + 0.05, CEIL - RIB, CEIL, 0, Z1);
    for (let k = 0; k < H; k++) for (const f of [1 / 6, 1 / 2, 5 / 6]) box(0, X1, CEIL - RIB - 0.004, CEIL, (k + f) * C - 0.05, (k + f) * C + 0.05);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(IDX);
    const slabTex = tx.ceiling.clone();
    slabTex.needsUpdate = true;
    tx.ready.then(() => {
      slabTex.needsUpdate = true;
    });
    const slab = new THREE.Mesh(g, lambert({ map: slabTex, color: '#a39e92' }));
    slab.frustumCulled = false;
    group.add(slab);
  }

  // Le faisceau, tout en modèles Poly Haven : tuyaux du kit « modular_pipes » (métal galvanisé, PVC gris pour les
  // conduites calorifugées, teintés pour le cuivre, la fonte et les sprinklers rouges), conduite en fonte à brides du
  // kit industriel, colliers de suspension et tiges filetées du même kit, gaines électriques et boîtes de dérivation.
  // o : décalage en travers (signé par le côté du faisceau), d : profondeur de l'axe sous le plafond, kind : la pièce,
  // r : facteur de diamètre (le kit fait 10 cm, 6 cm pour les fins), v : la teinte
  const MP = 'modular_pipes';
  const EC = 'modular_electric_cables';
  const RD = 'modular_airduct_rectangular_01';
  const PIPES = [
    // (ceux du haut reposent sur la traverse haute, dont le dessus est à 0,40 m sous la dalle ; deux sur la basse)
    { o: 0.86, d: 0.285, kind: 'pvc', r: 2.3, keep: 0.85 },
    { o: 0.58, d: 0.325, kind: 'metal', r: 1.5, keep: 0.85, valve: true },
    { o: 0.34, d: 0.296, kind: 'ind', r: 2.08, keep: 0.7 },
    { o: 0.15, d: 0.38, kind: 'thin', r: 0.6, v: 'copper', keep: 0.8 },
    { o: 0.06, d: 0.385, kind: 'thin', r: 0.48, v: 'copper', keep: 0.75 },
    { o: -0.12, d: 0.35, kind: 'metal', r: 1.0, v: 'dark', keep: 0.75 },
    { o: -0.34, d: 0.17, kind: 'thin', r: 0.75, v: 'red', keep: 0.7 },
    { o: -0.58, d: 0.555, kind: 'pvc', r: 1.7, keep: 0.6 },
    { o: -0.86, d: 0.58, kind: 'metal', r: 1.15, keep: 0.6 },
  ];
  // les câbles qui pendent entre deux traverses : une chaînette (de 0 à 1 en x, flèche f) ; et ceux qui descendent
  // le long d'un mur, en boucles molles
  const sagGeo = (f) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector3(t, -f * 4 * t * (1 - t), Math.sin(t * 9.4) * 0.006));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.006, 5, false);
  };
  const SAG = [sagGeo(0.1), sagGeo(0.22), sagGeo(0.38)];
  const dropGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new THREE.Vector3(Math.sin(t * 5.5) * 0.05 + t * 0.12, -t, 0.02 + Math.sin(t * 3.1) * 0.03 + t * t * 0.08));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006, 5, false);
  })();
  const WIRE = [lambert({ color: '#1d4fb0' }), lambert({ color: '#c8581a' }), lambert({ color: '#c9a321' }), lambert({ color: '#161616' }), lambert({ color: '#9a1d18' })];
  const runs = [];
  const leaks = []; // points des fuites (petites vapeurs) sur les tuyaux
  const HALF = Math.PI / 2;
  const layRun = (axis, line, a, b, room = false) => {
    const L = (b - a + 1) * C;
    const u0 = a * C;
    const u1 = (b + 1) * C;
    const cl = (line + 0.5) * C;
    const ax = axis === 'x';
    const side = hash(line, ax ? 11 : 17) < 0.5 ? 1 : -1;
    // tout passe sous les poutres de la dalle (DOWN) ; les galeries nord-sud passent sous les autres aux croisements
    const drop = DOWN + (ax ? 0 : 0.22);
    const pos = (along, lat) => (ax ? [along, cl + lat] : [cl + lat, along]);
    // rotations : un morceau dressé selon y couché le long de la galerie ; un collier dont le bras monte au plafond
    const lieRy = ax ? 0 : -HALF;
    const hangRy = ax ? HALF : 0;
    const thinRy = ax ? 0 : -HALF;
    // une gaine d'aération (une galerie sur trois) prend la place des tuyaux de son côté
    const duct = !room && hash(line, 47 + (ax ? 0 : 1)) < 0.36 && L > 5;
    const rect = duct && hash(line, 53 + (ax ? 0 : 1)) < 0.5;
    const list = room ? PIPES.filter((p, i) => i === 0 || i === 1 || i === 5) : PIPES.filter((p) => (!duct || p.o > -0.4) && hash(line * 7 + a, p.o * 100 + (ax ? 1 : 2)) < p.keep);
    // une suspente : le collier autour du tuyau et la tige filetée jusqu'au plafond
    const hanger = (u, lat, y, r, thin) => {
      const [x, z] = pos(u, lat);
      const top = y + 0.1 * r;
      kit.put(MP, thin ? 'pipe_thin_support_metal' : 'pipe_support_metal', x, top, z, thin ? thinRy : hangRy, r, undefined, HALF, 0);
      if (CEIL - top > 0.02) kit.put(MP, 'pipe_support_extension_long_metal', x, CEIL, z, hangRy, [0.8, 0.8, (CEIL - top) / 0.3], undefined, HALF, 0);
    };
    // les traverses : une cornière d'acier sombre en travers de la galerie, pendue à deux tiges filetées ; deux
    // étages (sous les tuyaux hauts, sous les tuyaux bas), et des câbles qui pendent de l'une à l'autre
    if (!room) {
      // (une gaine d'aération coupe la traverse haute : elle ne couvre plus que le côté des tuyaux, et la gaine
      // ronde, plus basse, supprime la traverse basse)
      const tiers = [{ d: 0.44, c: duct ? side * 0.6 : 0, w: duct ? 1.25 : 2.3, step: 3.2, o: 0.5 }];
      if (!duct || rect) tiers.push({ d: 0.68, c: 0, w: 2.3, step: 3.2, o: 2.1 });
      for (const t of tiers) {
        const ty = CEIL - t.d - drop;
        let prev = null;
        for (let u = u0 + t.o + hash(line, t.d * 10) * 0.6; u < u1 - 0.3; u += t.step) {
          const [x, z] = pos(u, t.c);
          kit.put(RD, 'modular_airduct_rectangular_01_brace_01@dark', x, ty, z, hangRy, [t.w / 0.69, 1.3, 1.3]);
          for (const e of [-1, 1]) {
            const [rx, rz] = pos(u, t.c + e * (t.w / 2 - 0.07));
            kit.put(MP, 'pipe_support_extension_long_metal@dark', rx, CEIL, rz, hangRy, [0.75, 0.75, (CEIL - ty) / 0.3], undefined, HALF, 0);
          }
          // câbles mous jusqu'à la traverse précédente
          if (prev !== null && hash(u * 7, line) < 0.55) {
            const k = 1 + Math.floor(hash(u, line * 3) * 2.5);
            for (let c = 0; c < k; c++) {
              const lat = t.c + (hash(u + c, line + 9) - 0.5) * (t.w - 0.4);
              const [cx, cz] = pos(prev, lat);
              const g = Math.floor(hash(c, u * 3) * 3);
              dummy.position.set(cx, ty + 0.02, cz);
              dummy.rotation.set(0, ax ? 0 : -HALF, 0);
              dummy.scale.set(u - prev, 1, 1);
              dummy.updateMatrix();
              bin('wire' + g + '_' + ((c + Math.floor(u)) % 5), SAG[g], WIRE[(c + Math.floor(u)) % 5]).m.push(dummy.matrix.clone());
            }
          }
          prev = u;
        }
      }
      // des câbles qui ont lâché et descendent le long d'un mur
      for (let u = u0 + 1 + hash(line, a + 2) * 4; u < u1 - 0.5; u += 7 + hash(u, line) * 9) {
        const wSide = hash(u, line + 4) < 0.5 ? 1 : -1;
        const [x, z] = pos(u, wSide * 1.2);
        const len = 1.2 + hash(line, u) * 1.4;
        for (let c = 0; c < 2 + Math.floor(hash(u, a) * 3); c++) {
          dummy.position.set(x + (ax ? c * 0.035 : 0), CEIL - 0.1, z + (ax ? 0 : c * 0.035));
          dummy.rotation.set(0, (ax ? 0 : HALF) + (wSide > 0 ? Math.PI : 0) + c * 0.5, 0);
          dummy.scale.set(1, len - c * 0.15, 1);
          dummy.updateMatrix();
          bin('wdrop' + ((c + a) % 5), dropGeo, WIRE[(c + a) % 5]).m.push(dummy.matrix.clone());
        }
      }
    }
    for (const p of list) {
      const lat = side * p.o * (room ? 0.8 : 1);
      const y = CEIL - p.d - drop;
      const thin = p.kind === 'thin';
      const sfx = p.v ? '@' + p.v : '';
      // le tuyau, en tronçons de 2 m au plus (étirés pour tomber juste)
      const len0 = p.kind === 'ind' ? 1.955 : 2;
      const n = Math.max(1, Math.ceil(L / (p.kind === 'ind' ? 2 : 2.5)));
      const seg = L / n;
      for (let i = 0; i < n; i++) {
        const u = u0 + i * seg;
        if (p.kind === 'ind') {
          const [x, z] = pos(u + seg / 2, lat);
          kit.put(PIPEKIT, pk(2), x, y, z, lieRy, [1, seg / len0, 1], undefined, 0, -HALF);
        } else if (thin) {
          const [x, z] = pos(u, lat);
          kit.put(MP, 'pipe_thin_200cm_metal' + sfx, x, y, z, thinRy, [seg / len0, p.r, p.r]);
        } else {
          const [x, z] = pos(u, lat);
          kit.put(MP, (p.kind === 'pvc' ? 'pipe_200cm_pvc' : 'pipe_200cm_metal') + sfx, x, y, z, lieRy, [p.r, seg / len0, p.r], undefined, 0, -HALF);
        }
      }
      // les colliers, un par case, décalés d'un tuyau à l'autre
      const off = 0.4 + hash(line, p.o * 40) * 1.6;
      for (let u = u0 + off; u < u1 - 0.2; u += C) hanger(u, lat, y, p.kind === 'ind' ? 2.1 : p.r, thin);
      // manchons de dilatation sur l'acier, et parfois une vanne à volant, tournée vers le bas
      if (p.kind === 'metal' && L > 5) {
        for (let u = u0 + 1.6 + hash(line, p.o * 70) * 2; u < u1 - 0.6; u += 5 + hash(u, line) * 3) {
          const [x, z] = pos(u, lat);
          kit.put(MP, 'pipe_chamber_small_metal' + sfx, x, y, z, lieRy, p.r, undefined, 0, -HALF);
        }
        if (p.valve && hash(line * 3 + a, 91) < 0.45) {
          const [x, z] = pos(u0 + L * (0.3 + hash(a, line) * 0.4), lat);
          kit.put(MP, 'pipe_valve_small_1_metal' + sfx, x, y, z, hangRy, p.r, undefined, HALF, 0);
        }
      }
      if (thin && p.v === 'red' && L > 5 && hash(line, a * 5 + 3) < 0.5) {
        const [x, z] = pos(u0 + L * (0.25 + hash(line, a) * 0.5), lat);
        kit.put(MP, 'pipe_thin_valve_1_metal@red', x, y, z, thinRy, p.r, undefined, HALF, 0);
      }
      if ((p.kind === 'metal' || p.kind === 'ind') && rnd() < 0.25 && L > 6) {
        const [x, z] = pos(u0 + 1 + rnd() * (L - 2), lat);
        leaks.push({ x, y: y - 0.05 * p.r, z });
      }
    }
    if (room) {
      runs.push({ axis, line, a, b });
      return;
    }
    // gaines électriques, côte à côte sous les poutres, une boîte de dérivation de temps en temps
    const cLat = side * 1.02;
    const nC = Math.max(1, Math.ceil(L / 2.5));
    for (const [k, e] of [[0, 0], [1, 0.09]]) {
      if (k && hash(line, a + 77) > 0.6) continue;
      for (let i = 0; i < nC; i++) {
        const [x, z] = pos(u0 + (i * L) / nC, cLat + side * e);
        kit.put(EC, k ? 'cable_straight_long' : 'cable_double_alt_long', x, CEIL - BEAM - (ax ? 0 : 0.05), z, hangRy, [1, L / nC / 0.61, 1], undefined, HALF, 0);
      }
    }
    for (let u = u0 + 2 + hash(line, a + 5) * 3; u < u1 - 1; u += 6 + hash(u, a) * 5) {
      const [x, z] = pos(u, cLat);
      kit.put(EC, 'cable_box_4way', x, CEIL - BEAM - (ax ? 0 : 0.05), z, hangRy, 1.3, undefined, HALF, 0);
    }
    // une gaine d'aération, de l'autre côté du faisceau (une galerie sur trois) : ronde sur ses colliers, ou
    // rectangulaire sur ses traverses pendues à deux fils
    if (duct && !rect) {
      const dLat = -side * 0.68;
      const dy = CEIL - 0.5 - drop + 0.04;
      const n = Math.ceil(L / 1.42);
      const seg = L / n;
      for (let i = 0; i < n; i++) {
        const [x, z] = pos(u0 + i * seg, dLat);
        kit.put('modular_airduct_circular_01', 'modular_airduct_circular_triple', x, dy, z, hangRy, [1, 1, seg / 1.42]);
        if (i % 2 === 0) {
          const [bx, bz] = pos(u0 + i * seg + 0.35, dLat);
          kit.put('modular_airduct_circular_01', 'modular_airduct_circular_brace', bx, dy, bz, hangRy);
        }
      }
    }
    if (rect) {
      const s = 0.78;
      const dLat = -side * 0.62;
      const dy = CEIL - 0.12 - 0.256 * s - drop;
      const n = Math.ceil(L / 1.8);
      const seg = L / n;
      const bottom = dy - 0.256 * s - 0.03;
      for (let i = 0; i < n; i++) {
        const [x, z] = pos(u0 + i * seg, dLat);
        kit.put(RD, 'modular_airduct_rectangular_01_tripple_01', x, dy, z, hangRy, [s, s, seg / 1.8]);
        const [bx, bz] = pos(u0 + i * seg + 0.5, dLat);
        kit.put(RD, 'modular_airduct_rectangular_01_brace_01', bx, bottom, bz, hangRy, [s, 1, 1]);
        kit.put(RD, 'modular_airduct_rectangular_01_brace_wire_01', bx, (bottom + CEIL) / 2, bz, hangRy, [s, (CEIL - bottom) / 1.098, 1]);
      }
    }
    runs.push({ axis, line, a, b });
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; ) {
      if (!corr(x, z) || !corr(x + 1, z)) {
        x++;
        continue;
      }
      let e = x;
      while (corr(e + 1, z)) e++;
      layRun('x', z, x, e);
      x = e + 1;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < H; ) {
      if (!corr(x, z) || !corr(x, z + 1)) {
        z++;
        continue;
      }
      let e = z;
      while (corr(x, e + 1)) e++;
      layRun('z', x, z, e);
      z = e + 1;
    }
  }
  // dans les pièces : deux ou trois tuyaux dans le sens de la longueur ; dans les halles, des faisceaux entiers entre
  // les rangées de piliers (une travée sur deux en travers)
  for (const r of map.rooms || []) {
    if (r.type === 'hall') {
      const st = r.st || 3;
      let k = 0;
      for (let z = r.pz - st + 1; z <= r.z1; z += st, k++) if (z >= r.z0) layRun('x', z, r.x0, r.x1, k % 2 === 1);
      k = 0;
      for (let x = r.px - st + 1; x <= r.x1; x += st, k++) if (x >= r.x0 && k % 2 === 0) layRun('z', x, r.z0, r.z1, true);
      continue;
    }
    if (r.x1 - r.x0 >= r.z1 - r.z0) layRun('x', Math.round((r.z0 + r.z1) / 2), r.x0, r.x1, true);
    else layRun('z', Math.round((r.x0 + r.x1) / 2), r.z0, r.z1, true);
  }

  // une gaine électrique vissée au mur (fx, fz : la face ; ry : tournée vers le couloir), de y0 jusqu'au plafond,
  // avec sa boîte de dérivation à la hauteur yBox
  const wallConduit = (fx, fz, ry, y0, yBox, box) => {
    kit.put(EC, 'cable_straight_long', fx, y0, fz, ry, [1.2, (CEIL - y0) / 0.607, 1.2]);
    kit.put(EC, box, fx, yBox, fz, ry, 1.35);
  };

  // --- 2. Lampes grillagées au mur (le globe allumé est dans la scène) : platine, cage, gaine jusqu'au plafond ---
  const lampFaces = new Set();
  for (const l of map.lights) {
    if (l.kind !== 'bulb' || !l.wall) continue;
    const [dx, dz] = l.wall;
    lampFaces.add(`${l.gx},${l.gz},${dx},${dz}`);
    const fx = l.x + dx * 0.2; // la face du mur
    const fz = l.z + dz * 0.2;
    // la lampe hublot grillagée (modèle Poly Haven), dos au mur
    kit.put('industrial_wall_lamp', 'industrial_wall_lamp', fx, l.y, fz, Math.atan2(-dx, -dz), 1, { light: l });
    // gaine électrique vissée au mur jusqu'au plafond, et sa boîte de dérivation (modèles Poly Haven)
    wallConduit(fx, fz, Math.atan2(-dx, -dz), l.y + 0.18, l.y + 0.42, 'cable_box_double');
  }
  // les néons des réserves : deux réglettes côte à côte sous un réflecteur, pendues à deux tiges filetées
  for (const l of map.lights) {
    if (l.kind !== 'tube') continue;
    const ax = l.alongX;
    put(bin('treflect', unitBox, M.frame), l.x, l.y + 0.05, l.z, ax ? 1.6 : 0.2, 0.04, ax ? 0.2 : 1.6);
    for (const e of [-0.05, 0.05]) kit.put('mounted_fluorescent_lights', 'mounted_fluorescent_lights_d', l.x + (ax ? 0 : e), l.y, l.z + (ax ? e : 0), ax ? 0 : Math.PI / 2, [1.6, 1, 1], { light: l });
    for (const e of [-0.55, 0.55]) kit.put(MP, 'pipe_support_extension_long_metal', l.x + (ax ? e : 0), CEIL, l.z + (ax ? 0 : e), 0, [0.5, 0.5, (CEIL - l.y - 0.07) / 0.3], undefined, HALF, 0);
  }

  // une grille d'aération à lames (modèle Poly Haven) sur un fond noir (centre x, y, z sur la face du mur)
  const vent = (x, y, z, dx, dz, w, h) => {
    const lw = (a, b) => (dz ? [a, b] : [b, a]); // (le long du mur, épaisseur) → (taille x, taille z)
    const [bx, bz] = lw(w * 0.9, 0.02);
    put(bin('ventBack', unitBox, M.cage), x, y, z, bx, h * 0.88, bz);
    kit.put(RD, 'modular_airduct_rectangular_01_vent_0' + (h > 0.3 ? 1 : 2), x + dx * 0.024, y, z + dz * 0.024, Math.atan2(-dx, -dz), [w / 0.552, h / 0.42, 1]);
  };

  // --- 3. Ce qui est fixé aux murs des galeries : portes métalliques, plaques, colonnes, grilles, caméras ---
  const valveFaces = new Set([...(map.valves || []), ...(map.breakers || [])].map((v) => `${v.gx},${v.gz},${v.dx},${v.dz}`));
  const jetCells = new Set((map.jets || []).map((j) => j.gz * W + j.gx));
  const gateCells = new Set((map.gates || []).map((g) => g.gz * W + g.gx));
  const E = map.elevator;
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, z) !== T.FLOOR || jetCells.has(z * W + x) || gateCells.has(z * W + x)) continue;
      if (E && Math.abs(E.gx - x) + Math.abs(E.gz - z) <= 2) continue;
      const room = zoneAt(x, z) === Z.BRICK || zoneAt(x, z) === Z.BOILER;
      for (const [dx, dz] of DIRS) {
        if (at(x + dx, z + dz) !== T.WALL) continue;
        const key = `${x},${z},${dx},${dz}`;
        if (lampFaces.has(key) || valveFaces.has(key)) continue;
        const fx = (x + 0.5) * C + dx * (C / 2);
        const fz = (z + 0.5) * C + dz * (C / 2);
        const ry = Math.atan2(-dx, -dz); // regarde le couloir
        const q = rnd();
        const boiler = zoneAt(x, z) === Z.BOILER;
        if (!room && q < 0.03 && rnd() < 0.45) {
          // rideau métallique d'un local de service (modèle Poly Haven), et sa plaque
          const lat = (rnd() - 0.5) * 0.9;
          kit.put('rollershutter_door', 'rollershutter_door', fx + (dz ? lat : 0), 0, fz + (dx ? lat : 0), ry, [1, 0.92, 1]);
          const si = [1, 5, 6][Math.floor(rnd() * 3)];
          put(bin('sign' + si, signGeo, signMat(si)), fx - dx * 0.008 + (dz ? lat + 0.85 : 0), 1.5, fz - dz * 0.008 + (dx ? lat + 0.85 : 0), 0.42, 0.42, 1, 0, ry, 0);
        } else if (!room && q < 0.03) {
          // porte métallique peinte : battant, chambranle, poignée à béquille, plaque
          const lat = (rnd() - 0.5) * 0.6;
          const ox = dz ? lat : 0;
          const oz = dx ? lat : 0;
          put(bin('door', unitBox, M.door), fx - dx * 0.02 + ox, 1.06, fz - dz * 0.02 + oz, dz ? 0.95 : 0.04, 2.12, dz ? 0.04 : 0.95);
          for (const e of [-0.51, 0.51]) put(bin('dframe', unitBox, M.frame), fx - dx * 0.03 + ox + (dz ? e : 0), 1.1, fz - dz * 0.03 + oz + (dx ? e : 0), dz ? 0.07 : 0.06, 2.2, dz ? 0.06 : 0.07);
          put(bin('dframe', unitBox, M.frame), fx - dx * 0.03 + ox, 2.21, fz - dz * 0.03 + oz, dz ? 1.09 : 0.06, 0.07, dz ? 0.06 : 1.09);
          const hs = rnd() < 0.5 ? 1 : -1;
          put(bin('handle', unitBox, M.handle), fx - dx * 0.075 + ox + (dz ? hs * 0.36 : 0), 1.02, fz - dz * 0.075 + oz + (dx ? hs * 0.36 : 0), dz ? 0.13 : 0.022, 0.022, dz ? 0.022 : 0.13);
          put(bin('handle', unitBox, M.handle), fx - dx * 0.055 + ox + (dz ? hs * 0.42 : 0), 1.02, fz - dz * 0.055 + oz + (dx ? hs * 0.42 : 0), 0.03, 0.03, 0.03);
          const si = [1, 2, 5, 6][Math.floor(rnd() * 4)];
          put(bin('sign' + si, signGeo, signMat(si)), fx - dx * 0.045 + ox, 1.62, fz - dz * 0.045 + oz, 0.42, 0.42, 1, 0, ry, 0);
        } else if (!room && q < 0.045) {
          const si = [3, 4, 7, 1][Math.floor(rnd() * 4)];
          put(bin('sign' + si, signGeo, signMat(si)), fx - dx * 0.008 + (dz ? (rnd() - 0.5) * 1.2 : 0), 1.55 + rnd() * 0.2, fz - dz * 0.008 + (dx ? (rnd() - 0.5) * 1.2 : 0), 0.5, 0.5, 1, 0, ry, 0);
        } else if (q < 0.065) {
          // gaine verticale et boîte de dérivation (modèles Poly Haven)
          const lat = (rnd() - 0.5) * 1.8;
          wallConduit(fx + (dz ? lat : 0), fz + (dx ? lat : 0), ry, 1.55, 1.3, rnd() < 0.5 ? 'cable_box_4way' : 'cable_box_3way');
        } else if (q < (boiler ? 0.3 : room ? 0.07 : 0.11)) {
          // colonne de tuyaux en fonte (une ou deux), parfois avec sa vanne
          const lat = (rnd() - 0.5) * 1.6;
          const two = rnd() < 0.35;
          for (const e of two ? [-0.16, 0.16] : [0]) riser(fx - dx * 0.16 + (dz ? lat + e : 0), fz - dz * 0.16 + (dx ? lat + e : 0), ry, rnd() < (boiler ? 0.6 : 0.3));
        } else if (q < (room ? 0.1 : 0.14)) {
          // grille d'aération : au ras du sol ou sous le plafond
          const high = rnd() < 0.5;
          const lat = (rnd() - 0.5) * 1.4;
          vent(fx - dx * 0.012 + (dz ? lat : 0), high ? 2.72 : 0.32, fz - dz * 0.012 + (dx ? lat : 0), dx, dz, high ? 0.62 : 0.5, high ? 0.36 : 0.26);
        } else if (!room && q > 0.988) {
          // caméra de surveillance, haut sur le mur, qui regarde le couloir
          kit.put('security_camera_01', 'security_camera_01', fx - dx * 0.26, 2.78, fz - dz * 0.26, Math.atan2(dx, dz), 1);
        } else if (!room && q > 0.968) {
          // extincteur sur son socle, contre le mur, et au-dessus le déclencheur manuel d'alarme incendie (modèles Poly Haven)
          const lat = (rnd() - 0.5) * 1.2;
          const ox = dz ? lat : 0;
          const oz = dx ? lat : 0;
          kit.put('korean_fire_extinguisher_01', 'korean_fire_extinguisher_01', fx - dx * 0.14 + ox, 0, fz - dz * 0.14 + oz, ry, 1);
          const ax2 = dz ? 0.3 : 0;
          const az2 = dx ? 0.3 : 0;
          kit.put('fire_alarm', 'fire_alarm', fx - dx * 0.002 + ox + ax2, 1.4, fz - dz * 0.002 + oz + az2, ry, 1.2);
          kit.put('fire_alarm', 'fire_alarm_lever', fx - dx * 0.014 + ox + ax2, 1.4 - 0.036, fz - dz * 0.014 + oz + az2, ry, 1.2);
        }
      }
    }
  }

  // --- 3b. Grilles d'égout : une dans chaque chaufferie, sous les jets de vapeur, quelques-unes dans les galeries ---
  const drains = [];
  for (const r of map.rooms || []) {
    if (r.type !== 'boiler') continue;
    const cx = Math.round((r.x0 + r.x1) / 2);
    const cz = Math.round((r.z0 + r.z1) / 2);
    if (at(cx, cz) === T.FLOOR) drains.push([(cx + 0.5) * C + (rnd() - 0.5) * 0.8, (cz + 0.5) * C + (rnd() - 0.5) * 0.8]);
  }
  for (const j of map.jets || []) drains.push([j.x + (j.axis === 'x' ? 0.6 : 0), j.z + (j.axis === 'z' ? 0.6 : 0)]);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (corr(x, z) && at(x, z) === T.FLOOR && !jetCells.has(z * W + x) && hash(x * 3, z * 5) < 0.018) drains.push([(x + 0.5) * C, (z + 0.5) * C]);
  for (const [x, z] of drains) {
    const ry = rnd() * Math.PI * 2;
    kit.put('water_manhole_cover', 'water_manhole_cover_frame', x, -0.012, z, ry, [0.72, 0.5, 0.72]);
    kit.put('water_manhole_cover', 'water_manhole_cover', x, -0.012, z, ry, [0.72, 0.5, 0.72]);
  }

  // --- 3c. Armatures à nu : le béton du plafond a éclaté, les fers rouillés pendent ---
  const spallTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    // une plaque aux bords déchiquetés
    x.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 92 + Math.sin(a * 3 + 1) * 14 + (Math.random() - 0.5) * 26;
      x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    x.closePath();
    x.fillStyle = '#6d675e';
    x.fill();
    x.save();
    x.clip();
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(${Math.random() < 0.5 ? '40,36,30' : '150,144,132'}, ${Math.random() * 0.35})`;
      const s = 2 + Math.random() * 7;
      x.fillRect(Math.random() * 256, Math.random() * 256, s, s * (0.5 + Math.random()));
    }
    // les fers : un quadrillage rouillé, et la rouille qui a coulé
    for (let k = 0; k < 2; k++) {
      for (let p = 38 + Math.random() * 10; p < 230; p += 44 + Math.random() * 8) {
        const g = k ? x.createLinearGradient(0, p - 5, 0, p + 5) : x.createLinearGradient(p - 5, 0, p + 5, 0);
        g.addColorStop(0, '#2a140a');
        g.addColorStop(0.4, '#a2522a');
        g.addColorStop(0.6, '#7b3a1b');
        g.addColorStop(1, '#22100a');
        x.fillStyle = g;
        if (k) x.fillRect(0, p - 5, 256, 10);
        else x.fillRect(p - 5, 0, 10, 256);
        x.fillStyle = 'rgba(120, 58, 24, 0.25)';
        if (k) x.fillRect(0, p + 5, 256, 10 + Math.random() * 14);
        else x.fillRect(p + 5, 0, 8 + Math.random() * 10, 256);
      }
    }
    x.restore();
    x.strokeStyle = 'rgba(25, 20, 15, 0.8)';
    x.lineWidth = 4;
    x.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const spallMat = lambert({ map: spallTex, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  const spallGeo = new THREE.PlaneGeometry(1, 1);
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, z) !== T.FLOOR || hash(x * 7 + 3, z * 11 + 1) > 0.045) continue;
      const sx = (x + 0.5) * C + (rnd() - 0.5) * 0.8;
      const sz = (z + 0.5) * C + (rnd() - 0.5) * 0.8;
      const s = 0.9 + rnd() * 0.8;
      put(bin('spall', spallGeo, spallMat), sx, CEIL - 0.004, sz, s, s, 1, Math.PI / 2, 0, rnd() * 6.28);
      // des bouts de fer rouillés qui pendent (tiges du kit modular_pipes, teintées rouille)
      for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
        const len = 0.15 + rnd() * 0.5;
        kit.put(MP, 'pipe_support_extension_long_metal@rust', sx + (rnd() - 0.5) * s * 0.6, CEIL, sz + (rnd() - 0.5) * s * 0.6, rnd() * 6.28, [0.6, 0.6, len / 0.3], undefined, HALF - 0.45 + rnd() * 0.9, 0);
      }
    }
  }

  // --- 4. Grilles à barreaux blanches ---
  // repère d'une grille : u le long du couloir, v en travers (-C/2 à C/2)
  const gateBars = bin('bars', unitBox, M.bars);
  for (const g of map.gates || []) {
    const ax = g.axis === 'x';
    const P = (u, v) => (ax ? [g.x + u, g.z + v] : [g.x + v, g.z + u]);
    const bar = (u, v, y, su, sy, sv) => {
      const [x, z] = P(u, v);
      put(gateBars, x, y, z, ax ? su : sv, sy, ax ? sv : su);
    };
    // un panneau de barreaux en travers, à la position u, de v0 à v1, du sol (ou de y0) au plafond
    const panel = (u, v0, v1, y0 = 0, y1 = CEIL) => {
      for (let v = v0 + 0.06; v < v1 - 0.03; v += 0.115) bar(u, v, (y0 + y1) / 2, 0.022, y1 - y0, 0.022);
      for (const y of [y0 + 0.1, y0 + 1.0, Math.min(y1 - 0.06, y0 + 2.05), y1 - 0.05]) if (y < y1) bar(u, (v0 + v1) / 2, y, 0.03, 0.04, v1 - v0);
      bar(u, v0 + 0.02, (y0 + y1) / 2, 0.05, y1 - y0, 0.05);
      bar(u, v1 - 0.02, (y0 + y1) / 2, 0.05, y1 - y0, 0.05);
    };
    if (!g.open) {
      // une cage d'une case : une grille à chaque bout, cadenas et chaîne, la plaque OUT OF BOUNDS
      for (const u of [-C / 2 + 0.04, C / 2 - 0.04]) panel(u, -C / 2, C / 2);
      const su = C / 2 - 0.04;
      const [lx, lz] = P(-su - 0.03, 0.05);
      put(bin('lock', unitBox, M.lampMetal), lx, 1.05, lz, ax ? 0.04 : 0.1, 0.12, ax ? 0.1 : 0.04);
      const [cx2, cz2] = P(-su - 0.05, 0.05);
      put(bin('padlock', unitBox, M.handle), cx2, 0.95, cz2, ax ? 0.03 : 0.06, 0.07, ax ? 0.06 : 0.03);
      const [sx2, sz2] = P(-su - 0.035, -0.62);
      put(bin('sign0', signGeo, signMat(0)), sx2, 1.75, sz2, 0.5, 0.5, 1, 0, ax ? -Math.PI / 2 : Math.PI, 0);
      const [sx3, sz3] = P(su + 0.035, 0.62);
      put(bin('sign0', signGeo, signMat(0)), sx3, 1.75, sz3, 0.5, 0.5, 1, 0, ax ? Math.PI / 2 : 0, 0);
    } else {
      // ouverte : un panneau fixe d'un côté, l'imposte au-dessus, et le battant rabattu contre le mur d'en face
      const sd = g.side || 1;
      const fixed = [sd * (C / 2), sd * (C / 2 - 0.72)].sort((a, b) => a - b);
      panel(0, fixed[0], fixed[1]);
      panel(0, -C / 2, C / 2, 2.32, CEIL);
      const hingeV = -sd * (C / 2 - 0.07);
      const leafLen = C - 0.72 - 0.08;
      // battant à plat le long du mur, du gond vers +u
      for (let k = 0.05; k < leafLen; k += 0.115) bar(k, hingeV, 1.16, 0.022, 2.3, 0.022);
      for (const y of [0.1, 1.0, 2.05, 2.28]) bar(leafLen / 2, hingeV, y, leafLen, 0.035, 0.03);
      bar(0.02, hingeV, 1.16, 0.05, 2.3, 0.05);
      bar(leafLen, hingeV, 1.16, 0.05, 2.3, 0.05);
      const [sx2, sz2] = P(-0.04, (fixed[0] + fixed[1]) / 2);
      put(bin('sign0', signGeo, signMat(0)), sx2, 1.6, sz2, 0.5, 0.5, 1, 0, ax ? -Math.PI / 2 : Math.PI, 0);
    }
  }

  // --- 5. Chaudières : socle, corps riveté, dôme, cerclages, conduit de fumée, brûleur et sa lucarne ---
  const burners = [];
  for (const b of map.boilers || []) {
    put(bin('bpad', unitBox, M.concrete), b.x, 0.05, b.z, 2.25, 0.1, 2.25);
    cyl(bin('bbody', new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), M.boiler), 'y', b.x, 1.17, b.z, 0.9, 2.15);
    put(bin('bdome', new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.boiler), b.x, 2.24, b.z, 0.9, 0.32, 0.9);
    for (const y of [0.35, 1.2, 2.05]) put(bin('bring', new THREE.TorusGeometry(1, 0.025, 6, 28), M.iron), b.x, y, b.z, 0.905, 0.905, 0.905, Math.PI / 2, 0, 0);
    kit.put(PIPEKIT, pk(2), b.x + 0.2, (2.45 + CEIL) / 2, b.z - 0.15, 0, [1.5, (CEIL - 2.45) / 1.955, 1.5]);
    kit.put(MP, 'pipe_valve_small_1_metal@dark', b.x - 0.35, 2.48, b.z + 0.2, rnd() * 6.28, 0.8);
    // le brûleur : du côté le plus dégagé
    const d = DIRS.map(([dx, dz]) => [dx, dz, at(b.gx + dx, b.gz + dz) === T.FLOOR ? 1 : 0]).sort((p, q) => q[2] - p[2])[0];
    const bx = b.x + d[0] * 0.92;
    const bz = b.z + d[1] * 0.92;
    put(bin('burner', unitBox, M.lampMetal), bx, 0.42, bz, d[1] ? 0.62 : 0.28, 0.5, d[1] ? 0.28 : 0.62);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ color: '#ff8a2a' }));
    win.position.set(bx + d[0] * 0.145, 0.45, bz + d[1] * 0.145);
    win.rotation.y = Math.atan2(d[0], d[1]);
    group.add(win);
    burners.push({ win, ph: rnd() * 10, x: bx, z: bz });
    // manomètre sur le corps
    const gm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20), lambert({ map: tx.gauge }));
    gm.position.set(b.x + d[0] * 0.93, 1.55, b.z + d[1] * 0.93);
    gm.rotation.set(Math.PI / 2, 0, 0);
    gm.rotation.order = 'YXZ';
    gm.rotation.y = Math.atan2(d[0], d[1]);
    group.add(gm);
  }

  // --- 5b. Les cuves de la halle des machines : socle, grand corps peint cerclé, dôme, échelle, piquages jusqu'au
  // plafond et vidange au sol ; et la paille de la bergerie ---
  for (const t of map.tanks || []) {
    const r = Math.min(t.r, 2.05);
    const h = Math.min(t.h, 2.3);
    put(bin('tpad', new THREE.CylinderGeometry(1, 1, 1, 28), M.concrete), t.x, 0.06, t.z, r + 0.12, 0.12, r + 0.12);
    cyl(bin('tbody', new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), M.tank), 'y', t.x, 0.12 + h / 2, t.z, r, h);
    put(bin('tdome', new THREE.SphereGeometry(1, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.tank), t.x, 0.12 + h, t.z, r, 0.22, r);
    for (const y of [0.45, 0.12 + h * 0.5, 0.05 + h]) put(bin('tring', new THREE.TorusGeometry(1, 0.03, 6, 32), M.iron), t.x, y, t.z, r + 0.01, r + 0.01, r + 0.01, Math.PI / 2, 0, 0);
    // l'échelle à crinoline, du côté le plus dégagé ; un trou d'homme boulonné de l'autre
    const a = rnd() * Math.PI * 2;
    const lx = t.x + Math.sin(a) * (r + 0.18);
    const lz = t.z + Math.cos(a) * (r + 0.18);
    for (const e of [-0.2, 0.2]) put(bin('lrail', unitBox, M.frame), lx + Math.cos(a) * e, (0.12 + h + 0.3) / 2, lz - Math.sin(a) * e, 0.04, 0.12 + h + 0.3, 0.04, 0, a, 0);
    for (let y = 0.35; y < h; y += 0.3) put(bin('lrung', unitBox, M.frame), lx, y, lz, 0.4, 0.03, 0.03, 0, a, 0);
    const mx = t.x - Math.sin(a) * (r + 0.02);
    const mz = t.z - Math.cos(a) * (r + 0.02);
    put(bin('tman', new THREE.CylinderGeometry(1, 1, 1, 20), M.iron), mx, 0.75, mz, 0.3, 0.06, 0.3, Math.PI / 2, a, 0);
    // piquages : un tuyau du dôme au plafond, une vanne au pied
    kit.put(PIPEKIT, pk(2), t.x + 0.4, (0.12 + h + 0.15 + CEIL) / 2, t.z - 0.3, 0, [1.4, (CEIL - h - 0.27) / 1.955, 1.4]);
    kit.put(MP, 'pipe_valve_small_1_metal@dark', mx + Math.sin(a) * 0.1, 0.3, mz + Math.cos(a) * 0.1, a, 1);
  }
  for (const st of map.straw || []) put(bin('straw', new THREE.PlaneGeometry(1, 1), M.straw), st.x, 0.008 + (st.r % 0.01) * 0.3, st.z, st.r * 2, st.r * 2, 1, -Math.PI / 2, 0, st.rot);

  // --- 6. Les vannes : collecteur vertical, corps, chapeau, volant rouge qui tourne, manomètre, voyant ---
  const valveViews = [];
  for (const v of map.valves || []) {
    const vg = new THREE.Group();
    // origine : la face du mur, au droit de la case ; +z sort du mur
    vg.position.set((v.gx + 0.5) * C + v.dx * (C / 2), 0, (v.gz + 0.5) * C + v.dz * (C / 2));
    vg.rotation.y = Math.atan2(-v.dx, -v.dz);
    group.add(vg);
    const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      vg.add(m);
      return m;
    };
    const pipeR = 0.075;
    mesh(new THREE.CylinderGeometry(pipeR, pipeR, CEIL - 1.25, 16), M.galv, 0, (CEIL + 1.25) / 2, 0.22);
    mesh(new THREE.CylinderGeometry(pipeR, pipeR, 0.22, 16), M.galv, 0, 1.0, 0.11, Math.PI / 2);
    mesh(new THREE.CylinderGeometry(pipeR * 1.5, pipeR * 1.5, 0.04, 16), M.iron, 0, 1.6, 0.22);
    mesh(new THREE.CylinderGeometry(pipeR * 1.5, pipeR * 1.5, 0.04, 16), M.iron, 0, 0.9 + 0.32, 0.22);
    // corps de la vanne et coude vers le mur
    mesh(new THREE.SphereGeometry(0.13, 18, 12), M.iron, 0, 1.05, 0.22).scale.set(1, 0.85, 1);
    mesh(new THREE.CylinderGeometry(pipeR, pipeR, 0.2, 16), M.galv, 0, 1.05, 0.22).scale.set(1, 1, 1);
    mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 14), M.iron, 0, 1.05, 0.4, Math.PI / 2);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), M.handle, 0, 1.05, 0.55, Math.PI / 2);
    // le volant
    const wheel = new THREE.Group();
    wheel.position.set(0, 1.05, 0.6);
    vg.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.019, 8, 28), M.wheel);
    wheel.add(rim);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.38, 6), M.wheel);
      sp.rotation.z = (i / 4) * Math.PI;
      wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), M.wheel);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    // manomètre sur une dérivation
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), M.copper, 0.15, 1.45, 0.22, 0, 0, Math.PI / 2);
    const dial = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), M.iron, 0.32, 1.45, 0.25, Math.PI / 2);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.088, 24), lambert({ map: tx.gauge }));
    face.position.set(0.32, 1.45, 0.278);
    vg.add(face);
    void dial;
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.075, 0.004), new THREE.MeshBasicMaterial({ color: '#111' }));
    needle.geometry.translate(0, 0.03, 0);
    needle.position.set(0.32, 1.45, 0.283);
    vg.add(needle);
    // voyant : rouge tant que la vanne est ouverte, vert fermée
    const lamp = mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), -0.32, 1.62, 0.06);
    mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), M.lampMetal, -0.32, 1.62, 0.02);
    // la plaque au-dessus
    const sign = new THREE.Mesh(signGeo, signMat(3));
    sign.position.set(0, 1.95, 0.012);
    sign.scale.set(0.5, 0.5, 1);
    vg.add(sign);
    valveViews.push({ v, wheel, needle, lamp, angle: 0, lastTurn: 0 });
  }

  // --- 6b. Les disjoncteurs : armoire électrique grise, gaine vers le plafond, levier (en bas : déclenché), voyant ---
  const breakerViews = [];
  const ledOff = new THREE.Color('#2a0806');
  for (const b of map.breakers || []) {
    const bg = new THREE.Group();
    bg.position.set((b.gx + 0.5) * C + b.dx * (C / 2), 0, (b.gz + 0.5) * C + b.dz * (C / 2));
    bg.rotation.y = Math.atan2(-b.dx, -b.dz);
    group.add(bg);
    const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = bg) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    mesh(new THREE.BoxGeometry(0.56, 0.78, 0.17), M.door, 0, 1.38, 0.085);
    mesh(new THREE.BoxGeometry(0.5, 0.72, 0.012), M.frame, 0, 1.38, 0.176);
    mesh(new THREE.BoxGeometry(0.04, 0.12, 0.02), M.handle, -0.2, 1.38, 0.19); // loquet
    // gaine électrique vers le plafond, et sa boîte de dérivation
    mesh(new THREE.CylinderGeometry(0.025, 0.025, CEIL - 1.77, 10), M.galv, 0.2, (CEIL + 1.77) / 2, 0.05);
    mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), M.frame, 0.2, 2.3, 0.05);
    // le levier, sur le côté droit
    const lever = new THREE.Group();
    lever.position.set(0.31, 1.32, 0.09);
    bg.add(lever);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), M.iron, 0.0, 0, 0, 0, 0, Math.PI / 2, lever);
    mesh(new THREE.BoxGeometry(0.025, 0.26, 0.025), M.handle, 0.03, 0.13, 0, 0, 0, 0, lever);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), M.wheel, 0.03, 0.27, 0, 0, 0, Math.PI / 2, lever);
    // voyant, et la plaque « ELECTRICAL » au-dessus
    mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), M.lampMetal, 0.17, 1.66, 0.19);
    const led = mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 0.17, 1.66, 0.21);
    const sign = new THREE.Mesh(signGeo, signMat(6));
    sign.position.set(-0.1, 1.98, 0.012);
    sign.scale.set(0.46, 0.46, 1);
    bg.add(sign);
    breakerViews.push({ b, lever, led, a: 0 });
  }

  // --- 7. Flaques sous les fuites et les jets ---
  const puddleTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const px = 64 + (Math.random() - 0.5) * 50;
      const py = 64 + (Math.random() - 0.5) * 50;
      const r = 20 + Math.random() * 30;
      const g = x.createRadialGradient(px, py, r * 0.6, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(c);
  })();
  const puddleMat = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: puddleTex, transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const puddles = [...(map.jets || []).map((j) => ({ x: j.x, z: j.z, r: 1.1 })), ...leaks.map((l) => ({ x: l.x, z: l.z, r: 0.6 }))];
  if (puddles.length) {
    const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puddleMat, puddles.length);
    puddles.forEach((p, i) => {
      dummy.position.set(p.x, 0.004, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, i * 1.3);
      dummy.scale.set(p.r * 2, p.r * 2, 1);
      dummy.updateMatrix();
      pm.setMatrixAt(i, dummy.matrix);
    });
    pm.frustumCulled = false;
    group.add(pm);
  }

  // --- Création des maillages ---
  kit.build(glassGlow);
  for (const b of bins.values()) {
    if (!b.m.length) continue;
    const inst = new THREE.InstancedMesh(b.geo, b.mat, b.m.length);
    b.m.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // --- 8. Halos des lampes : une lueur douce autour de chaque globe allumé (elle suit le grésillement) ---
  const glowLights = map.lights.filter((l) => (l.base || l.state) !== 'off'); // (un secteur peut sauter, puis revenir)
  const gPos = new Float32Array(glowLights.length * 3);
  const gCol = new Float32Array(glowLights.length * 3);
  glowLights.forEach((l, i) => {
    const w = l.wall || [0, 0];
    gPos.set([l.x - w[0] * 0.05, l.kind === 'tube' ? l.y - 0.06 : l.y, l.z - w[1] * 0.05], i * 3);
  });
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const glow = new THREE.Points(gGeo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.9, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  glow.frustumCulled = false;
  group.add(glow);
  const WARM = new THREE.Color('#ffc477');
  const COOL = new THREE.Color('#cfe4ff');

  // --- 9. La vapeur : des bouffées en billboard, éclairées par les lampes et la lampe torche ---
  const MAXP = 900;
  const pGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  pGeo.index = quad.index;
  pGeo.setAttribute('position', quad.attributes.position);
  pGeo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('iPos', iPos);
  pGeo.setAttribute('iData', iData);
  pGeo.instanceCount = 0;
  const steamU = {
    map: { value: puffTexture() },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uFlashPos: { value: new THREE.Vector3() },
    uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
    uFlashOn: { value: 0 },
    uFog: { value: 0.034 },
    uFogColor: { value: new THREE.Color('#0b0806') },
  };
  const steamMat = new THREE.ShaderMaterial({
    uniforms: steamU,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 iPos;
      attribute vec4 iData; // taille, opacité, rotation, lumière reçue
      uniform vec3 uRight;
      uniform vec3 uUp;
      varying vec2 vUv;
      varying vec4 vData;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        float c = cos(iData.z), s = sin(iData.z);
        vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
        vec3 p = iPos + (uRight * q.x + uUp * q.y) * iData.x;
        vUv = uv;
        vData = iData;
        vWorld = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 uFlashPos;
      uniform vec3 uFlashDir;
      uniform float uFlashOn;
      uniform float uFog;
      uniform vec3 uFogColor;
      varying vec2 vUv;
      varying vec4 vData;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        float a = texture2D(map, vUv).a * vData.y;
        vec3 d = vWorld - uFlashPos;
        float dl = length(d);
        float cone = smoothstep(0.86, 0.97, dot(d / max(dl, 0.001), uFlashDir)) * uFlashOn / (1.0 + dl * dl * 0.04);
        vec3 col = vec3(0.86, 0.84, 0.8) * (0.06 + vData.w * 0.7 + cone * 0.75);
        float f = 1.0 - exp(-uFog * uFog * vDepth * vDepth);
        col = mix(col, uFogColor, f);
        a *= 1.0 - f * 0.8;
        // tout près de l'objectif, elle s'efface (on la traverse sans voir un mur blanc)
        a *= smoothstep(0.15, 0.7, vDepth);
        if (a < 0.003) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const steam = new THREE.Mesh(pGeo, steamMat);
  steam.frustumCulled = false;
  steam.renderOrder = 3;
  group.add(steam);
  const P_ = { x: new Float32Array(MAXP), y: new Float32Array(MAXP), z: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), vz: new Float32Array(MAXP), age: new Float32Array(MAXP), life: new Float32Array(MAXP), s0: new Float32Array(MAXP), s1: new Float32Array(MAXP), a: new Float32Array(MAXP), rot: new Float32Array(MAXP), spin: new Float32Array(MAXP) };
  let np = 0;
  const emit = (x, y, z, vx, vy, vz, life, s0, s1, a) => {
    if (np >= MAXP) return;
    const i = np++;
    P_.x[i] = x;
    P_.y[i] = y;
    P_.z[i] = z;
    P_.vx[i] = vx;
    P_.vy[i] = vy;
    P_.vz[i] = vz;
    P_.age[i] = 0;
    P_.life[i] = life;
    P_.s0[i] = s0;
    P_.s1[i] = s1;
    P_.a[i] = a;
    P_.rot[i] = Math.random() * 6.28;
    P_.spin[i] = (Math.random() - 0.5) * 1.2;
  };
  const acc = new Map(); // reste de particules à émettre par émetteur
  const rate = (key, perSec, dt) => {
    const v = (acc.get(key) || 0) + perSec * dt;
    const n = Math.floor(v);
    acc.set(key, v - n);
    return n;
  };
  const rightV = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let exitSteam = 1;

  return {
    setFog(fog) {
      steamU.uFog.value = fog.density;
      steamU.uFogColor.value.copy(fog.color);
    },
    // une image : vannes, brûleurs, halos, vapeur. lightAt(x, z) : la lumière cuite en un point (0 à ~2)
    update(sim, P, time, dt, lightAt, flashOn) {
      // modèles : seuls ceux qui sont près de la caméra et devant elle
      camera.matrixWorld.extractBasis(rightV, upV, fwd);
      const fl = Math.hypot(fwd.x, fwd.z) || 1;
      kit.update(P.x, P.z, -fwd.x / fl, -fwd.z / fl);
      // vannes : le volant tourne avec l'avancée, l'aiguille tombe quand la vanne est fermée
      for (const vv of valveViews) {
        const want = vv.v.closed ? 1 : vv.v.turn;
        vv.angle += (want * Math.PI * 4 - vv.angle) * Math.min(1, dt * 8);
        vv.wheel.rotation.z = -vv.angle;
        const pr = vv.v.closed ? 0.04 : 0.82 - vv.v.turn * 0.45 + Math.sin(time * 9 + vv.v.id) * 0.015;
        vv.needle.rotation.z = Math.PI * 0.75 - pr * Math.PI * 1.5;
        vv.lamp.material.color.set(vv.v.closed ? '#2bff6a' : vv.v.turn > 0 ? (Math.sin(time * 14) > 0 ? '#ffb020' : '#ff2a1a') : '#ff2a1a');
      }
      // brûleurs : la flamme danse derrière la lucarne
      for (const b of burners) {
        const k = 0.55 + Math.sin(time * 7 + b.ph) * 0.15 + Math.sin(time * 23 + b.ph * 3) * 0.1 + Math.random() * 0.1;
        b.win.material.color.setRGB(1.6 * k, 0.62 * k, 0.15 * k);
      }
      // disjoncteurs : levier en bas et voyant rouge qui clignote quand le secteur est noir, vert une fois réarmé
      for (const bv of breakerViews) {
        const v = (map.valves || [])[bv.b.sector];
        const dark = v && v.power === 2;
        const want = bv.b.done || !v || !v.power ? 1 : dark ? bv.b.turn : 1;
        bv.a += (want - bv.a) * Math.min(1, dt * 10);
        bv.lever.rotation.x = (1 - bv.a) * Math.PI; // de pointe en bas (déclenché) à pointe en haut, en passant vers nous
        if (bv.b.done) bv.led.material.color.set('#2bff6a');
        else if (dark) bv.led.material.color.set(bv.b.turn > 0 ? (Math.sin(time * 14) > 0 ? '#ffb020' : '#ff2a1a') : Math.sin(time * 5) > 0 ? '#ff2a1a' : ledOff);
        else if (v && v.power === 1) bv.led.material.color.set(Math.random() < 0.5 ? '#ff2a1a' : ledOff);
        else bv.led.material.color.set('#3a8a3a');
      }
      // halos : la couleur suit l'éclat du moment de chaque lampe
      glowLights.forEach((l, i) => {
        const k = l.state === 'off' ? 0 : l.k === undefined ? 1 : l.k;
        const c = l.kind === 'tube' ? COOL : WARM;
        const m = (l.kind === 'tube' ? 0.35 : 0.8) * k;
        gCol[i * 3] = c.r * m;
        gCol[i * 3 + 1] = c.g * m;
        gCol[i * 3 + 2] = c.b * m;
      });
      gGeo.attributes.color.needsUpdate = true;

      // vapeur : émetteurs proches seulement
      const near = (x, z, r) => Math.abs(x - P.x) < r && Math.abs(z - P.z) < r;
      for (const j of map.jets || []) {
        if (!near(j.x, j.z, 34)) continue;
        const st = sim.jetOn(j);
        if (!st) continue;
        // la fuite : sur le mur, d'où le jet part vers le mur d'en face
        const px = j.axis === 'x' ? 0 : j.side;
        const pz = j.axis === 'x' ? j.side : 0;
        const nx = j.x + px * (C / 2 - 0.1);
        const nz = j.z + pz * (C / 2 - 0.1);
        const n = rate('j' + j.id, st === 2 ? 120 : 12, dt);
        for (let k = 0; k < n; k++) {
          const sp = st === 2 ? 5 + Math.random() * 3 : 1 + Math.random();
          const spread = st === 2 ? 0.7 : 0.4;
          const ua = (Math.random() - 0.5) * spread; // le long du couloir
          emit(nx, j.y + (Math.random() - 0.5) * 0.08, nz, -px * sp + (j.axis === 'x' ? ua * sp : 0), (Math.random() - 0.3) * 0.6, -pz * sp + (j.axis === 'z' ? ua * sp : 0), st === 2 ? 0.8 + Math.random() * 0.7 : 0.6, 0.12, st === 2 ? 1.1 : 0.5, st === 2 ? 0.2 : 0.16);
        }
      }
      for (const [i, l] of leaks.entries()) {
        if (!near(l.x, l.z, 22)) continue;
        for (let k = rate('l' + i, 2.5, dt); k > 0; k--) emit(l.x, l.y, l.z, (Math.random() - 0.5) * 0.2, -0.15 - Math.random() * 0.2, (Math.random() - 0.5) * 0.2, 2.6, 0.08, 0.7, 0.22);
      }
      // devant l'ascenseur : un épais nuage tant que les 4 vannes ne sont pas fermées
      exitSteam += ((sim.open ? 0 : 1) - exitSteam) * Math.min(1, dt * 0.6);
      if (E && exitSteam > 0.02 && near(E.x, E.z, 30)) {
        const ox = E.x - E.dx * (C / 2 + 0.05);
        const oz = E.z - E.dz * (C / 2 + 0.05);
        for (let k = rate('exit', 55 * exitSteam, dt); k > 0; k--) emit(ox + (E.dz ? (Math.random() - 0.5) * 1.6 : 0), 2.5, oz + (E.dx ? (Math.random() - 0.5) * 1.6 : 0), -E.dx * (0.6 + Math.random()), -0.4 - Math.random() * 0.4, -E.dz * (0.6 + Math.random()), 3, 0.4, 2.2, 0.32 * exitSteam);
      }
      // soupapes des chaudières : une bouffée de temps en temps
      for (const b of map.boilers || []) {
        if (!near(b.x, b.z, 25)) continue;
        if (Math.sin(time * 0.37 + b.gx * 1.7) > 0.985) for (let k = rate('b' + b.gx + ',' + b.gz, 40, dt); k > 0; k--) emit(b.x - 0.35, 2.7, b.z + 0.2, (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4, 1.4, 0.12, 0.9, 0.3);
      }

      // déplacement : freinage, la vapeur monte un peu, elle s'écrase sur les murs
      for (let i = 0; i < np; ) {
        P_.age[i] += dt;
        if (P_.age[i] >= P_.life[i]) {
          np--;
          for (const k in P_) P_[k][i] = P_[k][np];
          continue;
        }
        const drag = Math.exp(-2.4 * dt);
        P_.vx[i] *= drag;
        P_.vz[i] *= drag;
        P_.vy[i] = P_.vy[i] * drag + 0.5 * dt;
        let x = P_.x[i] + P_.vx[i] * dt;
        let z = P_.z[i] + P_.vz[i] * dt;
        const gx = Math.floor(x / C);
        const gz = Math.floor(z / C);
        if (at(gx, gz) === T.WALL || at(gx, gz) === T.MACHINE) {
          // contre un mur : elle s'étale
          if (Math.floor(P_.x[i] / C) !== gx) P_.vx[i] *= -0.15;
          if (Math.floor(P_.z[i] / C) !== gz) P_.vz[i] *= -0.15;
          x = P_.x[i];
          z = P_.z[i];
          P_.vx[i] += (Math.random() - 0.5) * 1.5;
          P_.vz[i] += (Math.random() - 0.5) * 1.5;
        }
        P_.x[i] = x;
        P_.z[i] = z;
        P_.y[i] = Math.min(CEIL - 0.1, Math.max(0.1, P_.y[i] + P_.vy[i] * dt));
        P_.rot[i] += P_.spin[i] * dt;
        i++;
      }
      for (let i = 0; i < np; i++) {
        const f = P_.age[i] / P_.life[i];
        iPos.array[i * 3] = P_.x[i];
        iPos.array[i * 3 + 1] = P_.y[i];
        iPos.array[i * 3 + 2] = P_.z[i];
        iData.array[i * 4] = P_.s0[i] + (P_.s1[i] - P_.s0[i]) * Math.sqrt(f);
        iData.array[i * 4 + 1] = P_.a[i] * Math.min(1, f * 8) * (1 - f) * (1 - f);
        iData.array[i * 4 + 2] = P_.rot[i];
        iData.array[i * 4 + 3] = Math.min(1.4, lightAt(P_.x[i], P_.z[i]));
      }
      pGeo.instanceCount = np;
      iPos.needsUpdate = true;
      iData.needsUpdate = true;
      camera.matrixWorld.extractBasis(rightV, upV, fwd);
      steamU.uRight.value.copy(rightV);
      steamU.uUp.value.copy(upV);
      steamU.uFlashPos.value.setFromMatrixPosition(camera.matrixWorld);
      steamU.uFlashDir.value.copy(fwd).negate();
      steamU.uFlashOn.value = flashOn ? 1 : 0;
    },
  };
}
