/* =============================================================================
   Golf Party — rendu 3D (Three.js r169)
   Ciel en dégradé, soleil avec ombres douces, réflexions du ciel, bloom, vignette,
   eau et lave animées, lumières des lanternes/torches, décors procéduraux, particules.
   ============================================================================= */
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { T, rng, signTex } from './textures.js';
import { kinPose, BALL_R, CUP_R } from './physics.js';

const V3 = THREE.Vector3;
const C = (c) => new THREE.Color(c);

/* ---------------------------------------------------------------- ambiances */
export const THEMES = {
  park: {
    sky: ['#3f8fe8', '#8cc6f5', '#e4f3ff'], fog: '#cfe6f7', fogNear: 60, fogFar: 260,
    sun: { color: '#fff3dc', int: 3.1, dir: [0.45, 0.85, 0.3] }, hemi: ['#cfe8ff', '#5d7d3a', 0.9],
    bloom: [0.22, 0.4, 0.92], exposure: 1.0, ground: 'grass', amb: 'butterflies', flag: '#e8433b', grade: [1.04, 1.0, 0.98], sat: 1.08,
  },
  pirate: {
    sky: ['#2a2a6e', '#d9668f', '#ffc07a'], fog: '#f0a07c', fogNear: 50, fogFar: 230,
    sun: { color: '#ffb06a', int: 3.4, dir: [-0.75, 0.32, 0.4] }, hemi: ['#ffc6a0', '#2b5e74', 0.75],
    bloom: [0.45, 0.5, 0.85], exposure: 1.02, ground: 'water', amb: 'gulls', flag: '#1d1d1d', grade: [1.06, 0.99, 0.94], sat: 1.12,
  },
  zen: {
    sky: ['#191b46', '#7a4d86', '#f3a27a'], fog: '#7b5978', fogNear: 35, fogFar: 190,
    sun: { color: '#ffae84', int: 2.6, dir: [0.6, 0.3, -0.55] }, hemi: ['#b3a6ec', '#4e5e36', 1.15],
    bloom: [0.6, 0.55, 0.8], exposure: 1.3, ground: 'moss', amb: 'petals', flag: '#e23b4e', grade: [1.03, 0.97, 1.04], sat: 1.06, night: 0.4,
  },
  forge: {
    sky: ['#050308', '#1c0a10', '#5a1a08'], fog: '#2a0d07', fogNear: 25, fogFar: 160,
    sun: { color: '#ffb08a', int: 1.5, dir: [0.3, 0.9, 0.2] }, hemi: ['#6a5a90', '#ff5a20', 0.7],
    bloom: [0.7, 0.55, 0.8], exposure: 1.0, ground: 'lava', amb: 'embers', flag: '#39e6ff', grade: [1.05, 0.96, 0.95], sat: 1.1, night: 1, stars: true,
  },
  canyon: {
    sky: ['#2f6fcc', '#8fbde8', '#f3d2a2'], fog: '#e8c49a', fogNear: 70, fogFar: 300,
    sun: { color: '#fff0d0', int: 3.4, dir: [-0.35, 0.8, 0.45] }, hemi: ['#cfe2ff', '#b06a3a', 0.85],
    bloom: [0.25, 0.4, 0.9], exposure: 1.0, ground: 'desert', amb: 'dust', flag: '#1d6fe0', grade: [1.05, 1.0, 0.95], sat: 1.1,
  },
  space: {
    sky: ['#020108', '#0b0a2a', '#241650'], fog: '#0c0a24', fogNear: 60, fogFar: 320,
    sun: { color: '#dfe8ff', int: 2.6, dir: [0.5, 0.7, -0.4] }, hemi: ['#6a6aff', '#2a1040', 0.8],
    bloom: [0.85, 0.6, 0.75], exposure: 1.05, ground: 'void', amb: 'stardust', flag: '#ff3fa8', grade: [1.0, 0.98, 1.06], sat: 1.12, night: 1, stars: true,
  },
  swamp: {
    sky: ['#17221c', '#3b5446', '#a3aa78'], fog: '#56705c', fogNear: 22, fogFar: 150,
    sun: { color: '#e8e0a0', int: 1.9, dir: [0.4, 0.45, 0.6] }, hemi: ['#9fb8a0', '#3a3a1a', 1.0],
    bloom: [0.7, 0.55, 0.78], exposure: 1.2, ground: 'swamp', amb: 'fireflies', flag: '#ffcf3a', grade: [1.0, 1.03, 0.96], sat: 1.0, night: 0.5,
  },
  ice: {
    sky: ['#3e86d8', '#a5d0f2', '#f4f9ff'], fog: '#dcecf8', fogNear: 60, fogFar: 260,
    sun: { color: '#ffffff', int: 3.0, dir: [0.3, 0.75, 0.5] }, hemi: ['#d8ecff', '#9ab0c8', 1.0],
    bloom: [0.3, 0.4, 0.9], exposure: 0.95, ground: 'snow', amb: 'snowfall', flag: '#e8433b', grade: [0.98, 1.0, 1.05], sat: 1.05,
  },
  candy: {
    sky: ['#e2479e', '#ff9fd2', '#ffe0b8'], fog: '#f6b8d8', fogNear: 70, fogFar: 300,
    sun: { color: '#fff0d8', int: 2.6, dir: [0.4, 0.65, 0.3] }, hemi: ['#ffd0ec', '#5ac8a8', 0.75],
    bloom: [0.3, 0.45, 0.9], exposure: 0.82, ground: 'candy', amb: 'confetti', flag: '#7a3cff', grade: [1.02, 0.99, 1.02], sat: 1.28,
  },
  // Le Marathon : grande campagne en fin d'après-midi, brouillard lointain pour voir loin le long des très longs trous
  marathon: {
    sky: ['#3a7fd6', '#93c3ee', '#ffe2b8'], fog: '#e6dcc8', fogNear: 120, fogFar: 470,
    sun: { color: '#ffe6c2', int: 3.0, dir: [0.5, 0.62, 0.35] }, hemi: ['#d6e8ff', '#5d7d3a', 0.9],
    bloom: [0.24, 0.4, 0.92], exposure: 1.0, ground: 'grass', amb: 'butterflies', flag: '#ff7a1a', grade: [1.05, 1.0, 0.96], sat: 1.1,
  },
};

/* ---------------------------------------------------------------- matériaux */
function std(o) { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }); }
function makeMats(themeId) {
  const M = {
    felt: std({ map: T.felt(), roughness: 0.95 }),
    turf: std({ map: T.felt(), roughness: 0.95 }),
    moss: std({ map: T.moss(), roughness: 0.95 }),
    plank: std({ map: T.plank(), roughness: 0.78 }),
    redwood: std({ map: T.plank('red'), roughness: 0.55 }),
    stone: std({ map: T.stone(), roughness: 0.85 }),
    metal: std({ map: T.metal(), roughness: 0.42, metalness: 0.65 }),
    grate: std({ map: T.grate(), emissiveMap: T.grateEm(), emissive: C('#ff5a12'), emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.5 }),
    sand: std({ map: T.sand(), roughness: 1 }),
    zen: std({ map: T.zen(), roughness: 1 }),
    beach: std({ map: T.beach(), roughness: 1 }),
    ice: std({ map: T.ice(), roughness: 0.08, metalness: 0.1 }),
    boost: std({ map: T.boost(), emissiveMap: T.boost(), emissive: C('#ffae20'), emissiveIntensity: 2.2, roughness: 0.4 }),
    conveyor: std({ map: T.conveyor(), roughness: 0.7 }),
    tramp: std({ map: T.tramp(), roughness: 0.6 }),
    lavarock: std({ map: T.rock(), roughness: 0.9 }),
    brick: std({ map: T.brick(), roughness: 0.9 }),
    stonecap: std({ map: T.stonecap(), roughness: 0.8 }),
    whitew: std({ map: T.whitew(), roughness: 0.6 }),
    wood: std({ map: T.wood(), roughness: 0.8 }),
    woodtrim: std({ map: T.wood(), color: C('#e9cfa8'), roughness: 0.7 }),
    hull: std({ map: T.wood(true), roughness: 0.8 }),
    stonew: std({ map: T.stonew(), roughness: 0.9 }),
    rock: std({ map: T.rock(), roughness: 0.95 }),
    metalw: std({ map: T.metalw(), roughness: 0.38, metalness: 0.75 }),
    neon: std({ color: C('#101418'), emissive: C(themeId === 'forge' ? '#39e6ff' : '#ff3fa8'), emissiveMap: T.neonEm(), emissiveIntensity: 3.2, roughness: 0.3 }),
    hazard: std({ map: T.hazard(), roughness: 0.5, metalness: 0.3 }),
    bamboo: std({ map: T.bamboo(), roughness: 0.6 }),
    bumper: std({ map: T.bumper(), roughness: 0.35, emissive: C('#ff2a20'), emissiveIntensity: 0.15 }),
    rubber: std({ color: C('#2a2a2e'), roughness: 0.9 }),
    redw: std({ map: T.redw(), roughness: 0.4 }),
    goldtrim: std({ color: C('#e8b84a'), roughness: 0.3, metalness: 0.9 }),
    glass: std({ color: C('#bfe8ff'), transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }),
    glassroof: std({ color: C('#bfe8ff'), transparent: true, opacity: 0.16, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    skirt: std({ map: T.brick(true), roughness: 0.95 }),
    skirtbrick: std({ map: T.brick(true), roughness: 0.95 }),
    skirtwood: std({ map: T.wood(true), roughness: 0.9 }),
    skirtrock: std({ map: T.rock(), roughness: 0.95 }),
    skirtstone: std({ map: T.stonew(), color: C('#c9c4bd'), roughness: 0.95 }),
    skirtmetal: std({ map: T.panel(), roughness: 0.6, metalness: 0.5 }),
    sandstone: std({ map: T.sandstone(), roughness: 0.9 }),
    redrock: std({ map: T.rock(), color: C('#d9875a'), roughness: 0.95 }),
    mud: std({ map: T.mud(), roughness: 0.35 }),
    snow: std({ map: T.snow(), roughness: 0.9 }),
    snowcap: std({ map: T.snow(), roughness: 0.9 }),
    snowpack: std({ map: T.snow(), color: C('#e4ecf6'), roughness: 0.8 }),
    icew: std({ map: T.icew(), roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.88 }),
    skirtice: std({ map: T.icew(), color: C('#b8d8f0'), roughness: 0.3 }),
    candy: std({ map: T.candy(), roughness: 0.45 }),
    candyw: std({ map: T.candyw(), roughness: 0.35 }),
    jelly: std({ color: C('#5ef0a0'), roughness: 0.15, transparent: true, opacity: 0.8, emissive: C('#20a060'), emissiveIntensity: 0.3 }),
    skirtcandy: std({ color: C('#6b3a22'), roughness: 0.6 }),
    magnet: std({ map: T.magnet(), emissiveMap: T.magnet(), emissive: C('#b36bff'), emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
    logf: std({ map: T.plank('dark'), roughness: 0.85 }),
    logw: std({ map: T.wood(), color: C('#9a7a5a'), roughness: 0.9 }),
  };
  if (themeId === 'forge') { M.metal.color = C('#c8c8cc'); }
  if (themeId === 'zen') { M.stone.color = C('#d4d0c8'); }
  return M;
}

/* ---------------------------------------------------------------- ciel */
function skyMaterial(th) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(th.sky[0]) }, mid: { value: C(th.sky[1]) }, hor: { value: C(th.sky[2]) }, sunDir: { value: new V3(...th.sun.dir).normalize() }, sunCol: { value: C(th.sun.color) }, night: { value: th.night || 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, hor, sunCol, sunDir; uniform float night; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.18, h)), top, smoothstep(0.18, 0.75, h)) : mix(hor, hor*0.55, smoothstep(0.0,-0.3,h));
        float s = max(dot(normalize(vD), sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 3.0 * (1.0-night) + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`,
  });
}

/* ---------------------------------------------------------------- particules */
class Particles {
  constructor(scene, max, tex, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.g = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max); this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 400 } }, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float scale; void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a);
#include <colorspace_fragment>
}`,
    });
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5;
    scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, col, size, life, g = 0, drag = 0, grow = 0) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 4] = col.r; this.c[i * 4 + 1] = col.g; this.c[i * 4 + 2] = col.b; this.a0[i] = col.a ?? 1; this.c[i * 4 + 3] = this.a0[i];
    this.s[i] = size; this.life[i] = life; this.age[i] = 0; this.g[i] = g; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.n--; this.copy(this.n, i); i--; continue; }
      const k = 1 - this.drag[i] * dt;
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.g[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const u = this.age[i] / this.life[i];
      this.c[i * 4 + 3] = this.a0[i] * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
      this.s[i] += this.grow[i] * dt;
    }
    const g = this.pts.geometry; g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
  copy(a, b) {
    for (let k = 0; k < 3; k++) { this.p[b * 3 + k] = this.p[a * 3 + k]; this.v[b * 3 + k] = this.v[a * 3 + k]; }
    for (let k = 0; k < 4; k++) this.c[b * 4 + k] = this.c[a * 4 + k];
    this.s[b] = this.s[a]; this.life[b] = this.life[a]; this.age[b] = this.age[a]; this.g[b] = this.g[a]; this.drag[b] = this.drag[a]; this.a0[b] = this.a0[a]; this.grow[b] = this.grow[a];
  }
}

/* ---------------------------------------------------------------- décor */
const flatMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: C(c), roughness: 0.85, flatShading: true, ...o });
const MC = new Map();
const mc = (c, o) => { const k = c + JSON.stringify(o || {}); if (!MC.has(k)) MC.set(k, flatMat(c, o)); return MC.get(k); };
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function ico(r, d = 1) { return new THREE.IcosahedronGeometry(r, d); }
function jitterGeo(geo, amt, R) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) * (1 + (R() - 0.5) * amt), p.getY(i) * (1 + (R() - 0.5) * amt), p.getZ(i) * (1 + (R() - 0.5) * amt)); } geo.computeVertexNormals(); return geo; }

const DECO = {
  tree(o, R) {
    const g = new THREE.Group(), s = o.s || (0.8 + R() * 0.6);
    g.add(mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.6 * s, 6), mc('#6b4a2b'), 0, 0.8 * s, 0));
    const greens = o.colors || ['#3f8f3a', '#4ea845', '#2f7a33', '#5cb84e'];
    for (let i = 0; i < 3; i++) g.add(mesh(jitterGeo(ico(0.8 * s * (1 - i * 0.18), 1), 0.25, R), mc(greens[(R() * greens.length) | 0]), (R() - 0.5) * 0.6 * s, (1.8 + i * 0.55) * s, (R() - 0.5) * 0.6 * s));
    return g;
  },
  pine(o, R) {
    const g = new THREE.Group(), s = o.s || (0.8 + R() * 0.7);
    g.add(mesh(new THREE.CylinderGeometry(0.1 * s, 0.15 * s, 1 * s, 6), mc('#5a3d24'), 0, 0.5 * s, 0));
    const col = o.color || ['#1f5e3a', '#2a6e42', '#245a35'][(R() * 3) | 0];
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry((1.0 - i * 0.25) * s, 1.3 * s, 7), mc(col), 0, (1.2 + i * 0.75) * s, 0));
    return g;
  },
  sakura(o, R) { return DECO.tree({ ...o, s: o.s || 1.25, colors: ['#ffb7d0', '#ff9ec2', '#ffc9dc', '#f58fb5'] }, R); },
  bush(o, R) { const g = new THREE.Group(); const s = o.s || (0.5 + R() * 0.5); for (let i = 0; i < 3; i++) g.add(mesh(jitterGeo(ico(0.45 * s, 1), 0.3, R), mc(o.color || ['#3c8a35', '#2f7a2f', '#4f9a3c'][i]), (R() - 0.5) * 0.6 * s, 0.3 * s, (R() - 0.5) * 0.6 * s)); return g; },
  flowers(o, R) {
    const g = new THREE.Group(), cols = ['#ff5a7a', '#ffd23f', '#ffffff', '#b06bff', '#ff8a3c'];
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.18, 10), mc('#5b3a22'), 0, 0.09, 0));
    for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = R() * 0.8; g.add(mesh(ico(0.09, 0), mc(cols[(R() * cols.length) | 0]), Math.cos(a) * r, 0.25 + R() * 0.1, Math.sin(a) * r)); }
    for (let i = 0; i < 8; i++) { const a = R() * 6.28, r = R() * 0.8; g.add(mesh(ico(0.14, 0), mc('#3c8a35'), Math.cos(a) * r, 0.2, Math.sin(a) * r)); }
    return g;
  },
  rock(o, R) { const s = o.s || (0.4 + R() * 1.0); const m = mesh(jitterGeo(new THREE.DodecahedronGeometry(s, 0), 0.4, R), mc(o.color || '#7c766e')); m.scale.y = 0.6 + R() * 0.4; m.position.y = s * 0.2; m.rotation.y = R() * 6; const g = new THREE.Group(); g.add(m); return g; },
  lamp(o) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8), mc('#2b2f36', { metalness: 0.6, roughness: 0.4 }), 0, 1.3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffe6a8', emissiveIntensity: 2.5 }), 0, 2.7, 0));
    return g;
  },
  sign(o) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), mc('#5a3d24'), -0.45, 0.6, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), mc('#5a3d24'), 0.45, 0.6, 0));
    const tex = signTex(o.n, o.hname || '', o.par || 2, { bg: '#f7f1df', ink: '#1d2b4f' });
    const board = mesh(new THREE.BoxGeometry(1.25, 0.78, 0.06), [mc('#5a3d24'), mc('#5a3d24'), mc('#5a3d24'), mc('#5a3d24'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })], 0, 1.25, 0);
    g.add(board); g.userData.dynamic = true;
    return g;
  },
  windmill(o) {
    const g = new THREE.Group(), w = o.w || 3.4, d = o.d || 2.2;
    const white = mc('#f4f1e8'), red = mc('#c8322c'), dark = mc('#3a2a20');
    g.add(mesh(new THREE.BoxGeometry(w, 1.6, d), white, 0, 0.64 + 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.64, d), white, 1.25 + 0.0, 0.32, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.64, d), white, -1.25, 0.32, 0));
    const roof = mesh(new THREE.ConeGeometry(w * 0.78, 1.6, 4), red, 0, 2.24 + 0.8, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), mc('#7fc8ff', { emissive: '#ffd27a', emissiveIntensity: 0.5 }), 0.9, 1.6, -d / 2 - 0.01));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), mc('#7fc8ff', { emissive: '#ffd27a', emissiveIntensity: 0.5 }), -0.9, 1.6, -d / 2 - 0.01));
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), dark, 0, 0.66, -d / 2 - 0.02));
    return g;
  },
  fountain(o) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 24), mc('#d8d2c6'), 0, 0.3, 0));
    const w = mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.05, 24), null, 0, 0.55, 0); w.userData.water = true; g.add(w);
    g.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 12), mc('#d8d2c6'), 0, 0.8, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.1, 0.5, 0.25, 16), mc('#d8d2c6'), 0, 1.65, 0));
    g.userData.emit = { type: 'fountain', y: 1.9 };
    return g;
  },
  clubhouse(o) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(8, 3.2, 5), mc('#f3ecdc'), 0, 1.6, 0));
    const roof = mesh(new THREE.CylinderGeometry(0.01, 6, 2.2, 4, 1), mc('#2f6b47'), 0, 4.3, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.66); g.add(roof);
    for (const x of [-2.6, 0, 2.6]) g.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 0.08), mc('#ffe3a0', { emissive: '#ffcf70', emissiveIntensity: 0.8 }), x, 1.8, 2.52));
    for (let i = 0; i < 10; i++) g.add(mesh(new THREE.BoxGeometry(0.8, 0.08, 1.4), mc(i % 2 ? '#ffffff' : '#2f6b47'), -3.6 + i * 0.8, 2.75, 3.1));
    g.add(mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), mc('#a0583c'), 2.5, 4.8, -1));
    return g;
  },
  island(o, R) {
    const g = new THREE.Group(), r = o.r || 4;
    const sand = mesh(jitterGeo(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, R), mc('#e9d39c', { flatShading: false }), 0, -0.6, 0);
    sand.scale.y = Math.min(0.28, 0.95 / r); g.add(sand);
    const grass = mesh(jitterGeo(new THREE.SphereGeometry(r * 0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, R), mc('#6fae4a'), 0, -0.45, 0); grass.scale.y = Math.min(0.3, 0.78 / (r * 0.62)); g.add(grass);
    for (let i = 0, k = 0; i < (o.palms || 0) && k < 30; k++) {
      const a = R() * 6.28, d = r * (0.25 + R() * 0.45), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (o.free && o.at && !o.free(o.at[0] + x, o.at[2] + z, 1.4)) continue;
      const p = DECO.palm({}, R); p.position.set(x, 0.2, z); p.rotation.y = R() * 6; g.add(p); i++;
    }
    for (let i = 0; i < 3; i++) { const rk = DECO.rock({ s: 0.3 + R() * 0.4 }, R); const a = R() * 6.28; rk.position.set(Math.cos(a) * r * 0.85, -0.1, Math.sin(a) * r * 0.85); g.add(rk); }
    return g;
  },
  palm(o, R) {
    const g = new THREE.Group(), n = 6, lean = 0.12 + R() * 0.15;
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { const seg = mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.62, 7), mc(i % 2 ? '#8a6a44' : '#7a5c3a'), x, y + 0.31, 0); seg.rotation.z = -lean * i * 0.4; g.add(seg); x += Math.sin(lean * i * 0.4) * 0.62; y += Math.cos(lean * i * 0.4) * 0.6; }
    const leafG = new THREE.ConeGeometry(0.35, 2.2, 4, 1, true); leafG.translate(0, 1.1, 0); leafG.scale(1, 1, 0.15);
    for (let i = 0; i < 7; i++) { const l = mesh(leafG, mc(i % 2 ? '#3f9a3a' : '#2f8a35', { side: THREE.DoubleSide }), x, y, 0); l.rotation.set(0, i / 7 * 6.28, 1.15 + R() * 0.3, 'YXZ'); g.add(l); }
    g.add(mesh(ico(0.13, 0), mc('#5a3d1a'), x + 0.1, y - 0.1, 0.1));
    return g;
  },
  shark(o) {
    const g = new THREE.Group();
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.5, 0); fin.quadraticCurveTo(0.1, 0.25, -0.15, 0.75); fin.lineTo(0, 0);
    const m = mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }), mc('#4a5560'));
    m.position.y = -0.05; const pivot = new THREE.Group(); m.position.x = 2.2; pivot.add(m); g.add(pivot);
    g.userData.anim = (t) => { pivot.rotation.y = -t * 0.6; m.position.y = -0.05 + Math.sin(t * 2) * 0.05; };
    g.userData.dynamic = true;
    return g;
  },
  kraken(o, R) {
    const g = new THREE.Group(), mat = mc('#8a3fa8', { flatShading: false, roughness: 0.6 }), parts = [];
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6, base = new V3(Math.cos(a) * 2.6, -0.3, Math.sin(a) * 2.6 - 1.2);
      const pts = []; for (let k = 0; k < 6; k++) pts.push(new V3(base.x * (1 - k * 0.08), base.y + k * 0.75, base.z + Math.sin(k * 0.9 + i) * 0.4));
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.18, 8);
      const pos = tg.attributes.position; for (let v = 0; v < pos.count; v++) { const yy = pos.getY(v); const k = 1 - (yy + 0.3) / 4.5; const cx = base.x, cz = base.z; pos.setX(v, cx + (pos.getX(v) - cx) * Math.max(0.25, k) ); pos.setZ(v, cz + (pos.getZ(v) - cz) * Math.max(0.25, k)); }
      tg.computeVertexNormals();
      const t = mesh(tg, mat); const piv = new THREE.Group(); piv.position.copy(base); t.position.sub(base); piv.add(t); g.add(piv); parts.push(piv);
    }
    g.userData.anim = (tt) => parts.forEach((p, i) => { p.rotation.z = Math.sin(tt * 0.9 + i) * 0.12; p.rotation.x = Math.cos(tt * 0.7 + i * 1.3) * 0.1; });
    g.userData.dynamic = true;
    return g;
  },
  chest() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), mc('#7a4a22'), 0, 0.23, 0));
    const lid = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 10, 1, false, 0, Math.PI), mc('#8a5a2a'), 0, 0.45, -0.1); lid.rotation.z = Math.PI / 2; lid.rotation.x = -0.6; g.add(lid);
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#ffb000', emissiveIntensity: 1.2, metalness: 1, roughness: 0.3 }), 0, 0.48, 0));
    return g;
  },
  torch() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.3, 6), mc('#4a3220'), 0, 0.65, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.18, 8), mc('#2a2a2a', { metalness: 0.6 }), 0, 1.35, 0));
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.spark(), color: '#ffb050', blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.y = 1.55; fl.scale.set(0.55, 0.8, 1); g.add(fl);
    g.userData.anim = (t) => { const k = 0.85 + Math.sin(t * 17 + g.id) * 0.08 + Math.sin(t * 7.3) * 0.07; fl.scale.set(0.5 * k, 0.8 * k, 1); };
    g.userData.dynamic = true; g.userData.emit = { type: 'flame', y: 1.6 };
    return g;
  },
  ship(o) {
    const g = new THREE.Group(), L = o.len || 9;
    const hullS = new THREE.Shape(); hullS.moveTo(-2.1, 0); hullS.lineTo(2.1, 0); hullS.lineTo(1.6, -1.5); hullS.lineTo(-1.6, -1.5); hullS.lineTo(-2.1, 0);
    const hg = new THREE.ExtrudeGeometry(hullS, { depth: L, bevelEnabled: false }); hg.translate(0, -0.08, -L / 2);
    g.add(mesh(hg, std({ map: T.wood(true), vertexColors: false, roughness: 0.8 })));
    const bow = mesh(new THREE.ConeGeometry(2.1, 3, 4, 1), std({ map: T.wood(true), vertexColors: false }), 0, -0.6, L / 2 + 1.2); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.55); g.add(bow);
    g.add(mesh(new THREE.BoxGeometry(4.4, 1.6, 2.2), std({ map: T.wood(true), vertexColors: false }), 0, 0.7, -L / 2 - 0.4));
    for (const [z, h] of [[-1.5, 6], [2.6, 5]]) {
      for (const sx of [1, -1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, h, 8), mc('#5a3d24'), sx * 1.75, h / 2, z));
        const sail = mesh(new THREE.PlaneGeometry(1.5, h * 0.42, 6, 4), mc('#f2e6c8', { side: THREE.DoubleSide, flatShading: false }), sx * 1.75 + sx * 0.05, h * 0.6, z + 0.05);
        sail.rotation.y = Math.PI / 2; const p = sail.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.cos(p.getX(i) * 2) * 0.2); sail.geometry.computeVertexNormals(); g.add(sail);
      }
    }
    const flag = mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: '#111', side: THREE.DoubleSide }), 1.75 + 0.45, 6.2, -1.5); g.add(flag);
    for (const sx of [1, -1]) for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8), mc('#222', { metalness: 0.7 }), sx * 2.1, -0.4, -2 + k * 2).rotateZ(Math.PI / 2));
    return g;
  },
  cliff(o, R) {
    const g = new THREE.Group(), r = o.r || 5, h = o.h || 4;
    const geo = jitterGeo(new THREE.CylinderGeometry(r * 0.8, r * 1.15, h + 0.6, 12, 4), 0.18, R);
    g.add(mesh(geo, mc('#7a6a5a'), 0, (h + 0.6) / 2 - 0.6, 0));
    g.add(mesh(jitterGeo(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.25, 12), 0.1, R), mc('#6fae4a'), 0, h + 0.05, 0));
    return g;
  },
  waterfall(o) {
    const g = new THREE.Group(), h = o.h || 4;
    const tex = T.waterfall().clone(); tex.needsUpdate = true; tex.repeat.set(1, 1.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.y = h / 2; g.add(m);
    g.userData.anim = (t) => { tex.offset.y = t * 1.2; };
    g.userData.dynamic = true; g.userData.emit = { type: 'foam', y: 0.1 };
    return g;
  },
  wreck(o, R) { const s = DECO.ship({ len: 8 }, R); s.rotation.z = 0.35; s.rotation.x = 0.15; s.position.y = -1.1; const g = new THREE.Group(); g.add(s); g.add(DECO.rock({ s: 1.6 }, R)); return g; },
  lantern(o) {
    const g = new THREE.Group(), st = mc('#8f8a82');
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 6), st, 0, 0.06, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6), st, 0, 0.37, 0));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffb050', emissiveIntensity: 2.6 }), 0, 0.74, 0));
    g.add(mesh(new THREE.ConeGeometry(0.32, 0.22, 4), st, 0, 0.97, 0).rotateY(Math.PI / 4));
    return g;
  },
  toro(o) { const g = DECO.lantern(o); g.scale.setScalar(2.0); return g; },
  pond(o) {
    const g = new THREE.Group(), w = o.w || 8, d = o.d || 5;
    const m = mesh(new THREE.CircleGeometry(1, 40), null, 0, 0.13, 0); m.rotation.x = -Math.PI / 2; m.scale.set(w / 2, d / 2, 1); m.userData.water = true; m.receiveShadow = true; m.castShadow = false; g.add(m);
    const bed = mesh(new THREE.CircleGeometry(1, 40), mc('#1d3a3a'), 0, 0.02, 0); bed.rotation.x = -Math.PI / 2; bed.scale.set(w / 2 + 0.2, d / 2 + 0.2, 1); g.add(bed);
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28; const rk = mesh(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.08, 0), mc('#8f8a82'), Math.cos(a) * (w / 2 + 0.15), 0.12, Math.sin(a) * (d / 2 + 0.15)); g.add(rk); }
    for (let i = 0; i < 4; i++) { const a = i * 1.7; const lp = mesh(new THREE.CircleGeometry(0.35, 10), mc('#3f8a3a', { side: THREE.DoubleSide }), Math.cos(a) * w * 0.25, 0.15, Math.sin(a) * d * 0.25); lp.rotation.x = -Math.PI / 2; g.add(lp); }
    g.userData.emit = { type: 'koi', w, d };
    return g;
  },
  bamboo(o, R) {
    const g = new THREE.Group(), n = o.n || 10, r = o.r || 1.2, mat = std({ map: T.bamboo(), vertexColors: false });
    for (let i = 0; i < n; i++) { const a = R() * 6.28, d = R() * r, h = 3 + R() * 3; const m = mesh(new THREE.CylinderGeometry(0.06, 0.07, h, 6), mat, Math.cos(a) * d, h / 2, Math.sin(a) * d); m.rotation.z = (R() - 0.5) * 0.1; g.add(m); g.add(mesh(new THREE.ConeGeometry(0.3, 0.8, 4), mc('#5fa83a'), Math.cos(a) * d, h, Math.sin(a) * d)); }
    return g;
  },
  pagoda() {
    const g = new THREE.Group(), red = mc('#b8262c'), dark = mc('#2a2228'), cream = mc('#efe2c6');
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const s = 3.6 - i * 0.7;
      g.add(mesh(new THREE.BoxGeometry(s, 1.4, s), i === 0 ? cream : red, 0, y + 0.7, 0));
      const roof = mesh(new THREE.ConeGeometry(s * 0.95, 0.9, 4), dark, 0, y + 1.75, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
      for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb050', emissiveIntensity: 1.8 }), Math.sin(k * 1.57) * (s / 2 + 0.01), y + 0.8, Math.cos(k * 1.57) * (s / 2 + 0.01)).rotateY(k * 1.57));
      y += 1.6;
    }
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.08, 2, 6), mc('#c9a24a', { metalness: 0.8 }), 0, y + 1.2, 0));
    return g;
  },
  torii() {
    const g = new THREE.Group(), red = mc('#d22f2a'), dark = mc('#1f1a1a');
    for (const x of [-1.6, 1.6]) g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 4, 10), red, x, 2, 0));
    g.add(mesh(new THREE.BoxGeometry(4.6, 0.3, 0.4), red, 0, 3.3, 0));
    const top = mesh(new THREE.BoxGeometry(5.4, 0.3, 0.5), dark, 0, 4.05, 0); g.add(top);
    return g;
  },
  dragon(o) {
    const g = new THREE.Group(), L = o.len || 5, mat = mc('#2f9a5a', { flatShading: false, roughness: 0.5 }), red = mc('#d63a2a');
    const pts = []; for (let k = 0; k <= 8; k++) { const s = k / 8; pts.push(new V3(Math.sin(s * 9) * 0.6, 0.85 + Math.sin(s * Math.PI) * 0.7, (s - 0.05) * L)); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.32, 10), mat));
    for (let k = 1; k < 8; k++) g.add(mesh(new THREE.ConeGeometry(0.14, 0.4, 4), red, pts[k].x, pts[k].y + 0.38, pts[k].z));
    const head = new THREE.Group(); head.position.set(0, 1.0, L + 0.3);
    head.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 1.1), mat));
    head.add(mesh(new THREE.BoxGeometry(0.8, 0.2, 0.7), mat, 0, -0.35, 0.3));
    for (const x of [-0.25, 0.25]) { head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffe23a', emissive: '#ffcc00', emissiveIntensity: 3 }), x, 0.15, 0.5)); head.add(mesh(new THREE.ConeGeometry(0.08, 0.6, 5), mc('#f2e6c8'), x * 1.4, 0.45, -0.2).rotateX(-0.6)); }
    g.add(head);
    g.userData.anim = (t) => { head.rotation.y = Math.sin(t * 0.8) * 0.15; head.rotation.x = Math.sin(t * 1.3) * 0.05; };
    g.userData.dynamic = true;
    return g;
  },
  gantry(o) {
    const g = new THREE.Group(), m = mc('#3a3e46', { metalness: 0.7, roughness: 0.4 }), h = o.h || 3;
    for (const x of [-1.6, 1.6]) g.add(mesh(new THREE.BoxGeometry(0.22, h, 0.22), m, x, h / 2 - 1.4, 0));
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 0.3), m, 0, h - 1.3, 0));
    return g;
  },
  volcano(o, R) {
    const g = new THREE.Group(), r = o.r || 8, h = o.h || 8;
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r * (1 - t * 0.78) + (R() - 0.5) * 0.6, t * h)); }
    pts.push(new THREE.Vector2(r * 0.18, h - 0.8));
    g.add(mesh(jitterGeo(new THREE.LatheGeometry(pts, 18), 0.06, R), mc('#2a1c18')));
    const glow = mesh(new THREE.CircleGeometry(r * 0.2, 16), new THREE.MeshBasicMaterial({ color: '#ff7a20' }), 0, h - 0.7, 0); glow.rotation.x = -Math.PI / 2; g.add(glow);
    g.userData.emit = { type: 'smoke', y: h };
    return g;
  },
  forgefire() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(2.6, 1.6, 1.6, 10), mc('#2a2c32', { metalness: 0.7, roughness: 0.4 }), 0, 0.8, 0));
    const fire = mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: '#ffb040' }), 0, 1.55, 0); fire.rotation.x = -Math.PI / 2; g.add(fire);
    for (const a of [0, 2.1, 4.2]) g.add(mesh(new THREE.BoxGeometry(0.3, 3, 0.3), mc('#3a3e46', { metalness: 0.7 }), Math.cos(a) * 2.6, 1.5, Math.sin(a) * 2.6));
    g.userData.emit = { type: 'bigfire', y: 1.6 };
    return g;
  },
  crystal(o, R) { const g = new THREE.Group(); const col = o.color || (R() > 0.5 ? '#ff5a1a' : '#ffae2a'); for (let i = 0; i < 4; i++) { const m = mesh(new THREE.OctahedronGeometry(0.3 + R() * 0.4, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, flatShading: true }), (R() - 0.5) * 0.8, 0.3, (R() - 0.5) * 0.8); m.scale.y = 2 + R() * 1.5; m.rotation.set(R() * 0.4, R() * 3, R() * 0.4); g.add(m); } return g; },
  pipe(o, R) { const g = new THREE.Group(), m = mc('#4a4e58', { metalness: 0.8, roughness: 0.35 }); const h = 2 + R() * 4; g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 10), m, 0, h / 2, 0)); g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10), mc('#c8322c'), 0, h * 0.7, 0)); return g; },
  buoy(o, R) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 10), mc(R() > 0.5 ? '#e8433b' : '#f2f2f2'), 0, 0.15, 0)); g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), mc('#333'), 0, 0.7, 0)); return g; },
  fence(o) { const g = new THREE.Group(), L = o.len || 3, m = mc('#f4f1e8'); for (let i = 0; i <= L; i++) g.add(mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), m, i - L / 2, 0.35, 0)); g.add(mesh(new THREE.BoxGeometry(L, 0.08, 0.06), m, 0, 0.55, 0)); g.add(mesh(new THREE.BoxGeometry(L, 0.08, 0.06), m, 0, 0.3, 0)); return g; },
  bench() { const g = new THREE.Group(), w = mc('#8a5a32'), k = mc('#2b2f36'); g.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45), w, 0, 0.45, 0)); g.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), w, 0, 0.75, -0.2)); for (const x of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), k, x, 0.22, 0)); return g; },
  /* ---- canyon ---- */
  cactus(o, R) {
    const g = new THREE.Group(), m = mc('#3f8a4a'), h = 1.6 + R() * 1.8;
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 8), m, 0, h / 2, 0));
    for (const s of [1, -1]) if (R() > 0.3) { const y = h * (0.35 + R() * 0.3); g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 7), m, s * 0.4, y, 0).rotateZ(s * Math.PI / 2)); g.add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.7, 7), m, s * 0.62, y + 0.35, 0)); }
    if (R() > 0.6) g.add(mesh(ico(0.12, 0), mc('#ff5a8a'), 0, h + 0.05, 0));
    return g;
  },
  mesa(o, R) {
    const g = new THREE.Group(), r = o.r || (3 + R() * 4), h = o.h || (5 + R() * 9);
    g.add(mesh(jitterGeo(new THREE.CylinderGeometry(r * 0.85, r * 1.1, h, 9, 5), 0.14, R), mc('#c77a4a'), 0, h / 2, 0));
    g.add(mesh(jitterGeo(new THREE.CylinderGeometry(r * 0.88, r * 0.85, 0.5, 9), 0.1, R), mc('#a85e34'), 0, h + 0.2, 0));
    for (let i = 1; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(r * (1.11 - i * 0.07), r * (1.12 - i * 0.07), 0.12, 9), mc('#e0a070'), 0, h * i / 4, 0));
    return g;
  },
  tumbleweed(o, R) { const g = new THREE.Group(); g.add(mesh(jitterGeo(ico(0.4, 1), 0.4, R), mc('#a8854a', { wireframe: true }), 0, 0.4, 0)); return g; },
  minecart(o) { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), mc('#6b4a2b'), 0, 0.55, 0)); for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10).rotateX(Math.PI / 2), mc('#2a2a2a'), x, 0.18, z)); g.add(mesh(new THREE.BoxGeometry(1, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#ffa000', emissiveIntensity: 0.8, metalness: 1, roughness: 0.3 }), 0, 0.85, 0)); return g; },
  /* ---- espace ---- */
  asteroid(o, R) { const g = new THREE.Group(), s = o.s || (0.6 + R() * 2.4); const m = mesh(jitterGeo(new THREE.DodecahedronGeometry(s, 1), 0.35, R), mc('#6a6070')); m.rotation.set(R() * 3, R() * 3, R() * 3); g.add(m); g.position.y = 0; g.userData.float = 3 + R() * 18; return g; },
  planet(o) { const g = new THREE.Group(), r = o.r || 30; g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshStandardMaterial({ color: o.color || '#5a7aff', roughness: 0.9, emissive: o.color || '#5a7aff', emissiveIntensity: 0.15, fog: false }))); const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.3, r * 1.9, 64), new THREE.MeshBasicMaterial({ color: '#d8c8ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false })); ring.rotation.x = 1.2; g.add(ring); return g; },
  satellite(o) { const g = new THREE.Group(), m = mc('#c8ccd8', { metalness: 0.7, roughness: 0.3 }); g.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 1.6), m, 0, 0, 0)); for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(3, 0.05, 1.2), mc('#2a3a8a', { metalness: 0.5, emissive: '#1a2a6a', emissiveIntensity: 0.4 }), s * 2.2, 0, 0)); g.add(mesh(new THREE.ConeGeometry(0.6, 0.5, 16, 1, true), m, 0, 0.9, 0)); g.userData.float = 8; return g; },
  /* ---- marais ---- */
  deadtree(o, R) {
    const g = new THREE.Group(), m = mc('#4a3a2a'), h = 2.5 + R() * 3;
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 6), m, 0, h / 2, 0));
    for (let i = 0; i < 4; i++) { const b = mesh(new THREE.CylinderGeometry(0.04, 0.1, 1.4, 5), m, 0, h * (0.5 + R() * 0.45), 0); b.rotation.set((R() - 0.5) * 2, R() * 6, 0.9 + R() * 0.5); b.translateY(0.6); g.add(b); }
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry(0.2, 1.2, 4, 1, true), mc('#6a7a4a', { side: THREE.DoubleSide }), (R() - 0.5) * 1.2, h * 0.6, (R() - 0.5) * 1.2).rotateZ(Math.PI));
    return g;
  },
  mushroom(o, R) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = 0.15 + R() * 0.25, x = (R() - 0.5) * 0.8, z = (R() - 0.5) * 0.8; g.add(mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.4, s * 2, 6), mc('#efe6d2'), x, s, z)); g.add(mesh(new THREE.SphereGeometry(s * 1.1, 10, 6, 0, 6.28, 0, 1.6), new THREE.MeshStandardMaterial({ color: '#7affd8', emissive: '#3affc0', emissiveIntensity: 1.4 }), x, s * 2, z)); } return g; },
  reeds(o, R) { const g = new THREE.Group(); for (let i = 0; i < 9; i++) { const h = 0.8 + R() * 1.2, a = R() * 6.28, d = R() * 0.5; const m = mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), mc('#7a8a3a'), Math.cos(a) * d, h / 2, Math.sin(a) * d); m.rotation.z = (R() - 0.5) * 0.3; g.add(m); if (R() > 0.5) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), mc('#5a3a20'), Math.cos(a) * d, h, Math.sin(a) * d)); } return g; },
  lilypad(o, R) { const g = new THREE.Group(); const m = mesh(new THREE.CircleGeometry(0.5 + R() * 0.5, 12, 0.3, 5.8), mc('#4a8a3a', { side: THREE.DoubleSide }), 0, 0.03, 0); m.rotation.x = -Math.PI / 2; g.add(m); if (R() > 0.6) g.add(mesh(ico(0.12, 0), mc('#ff9ad0'), 0, 0.12, 0)); return g; },
  stump(o, R) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 9), mc('#5a4030'), 0, 0.3, 0)); g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 9), mc('#c8a878'), 0, 0.61, 0)); return g; },
  hut(o) { const g = new THREE.Group(), w = mc('#5a4030'); for (const x of [-1.6, 1.6]) for (const z of [-1.6, 1.6]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 6), w, x, 1.2, z)); g.add(mesh(new THREE.BoxGeometry(3.6, 2, 3.6), mc('#6b5038'), 0, 3.4, 0)); const r = mesh(new THREE.ConeGeometry(3.2, 1.8, 4), mc('#4a5a2a'), 0, 5.3, 0); r.rotation.y = Math.PI / 4; g.add(r); g.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: '#ffd38a', emissive: '#ffb050', emissiveIntensity: 2 }), 0, 3.5, 1.82)); return g; },
  /* ---- glace ---- */
  snowpine(o, R) { const g = DECO.pine({ ...o, color: '#2a5a4a' }, R); g.children.slice(1).forEach((c, i) => { const cap = mesh(new THREE.ConeGeometry((1.0 - i * 0.25) * 0.75 * (o.s || 1), 0.5, 7), mc('#ffffff'), 0, c.position.y + 0.45, 0); g.add(cap); }); return g; },
  snowman(o) { const g = new THREE.Group(), w = mc('#ffffff', { flatShading: false }); g.add(mesh(new THREE.SphereGeometry(0.5, 14, 10), w, 0, 0.45, 0)); g.add(mesh(new THREE.SphereGeometry(0.35, 14, 10), w, 0, 1.15, 0)); g.add(mesh(new THREE.SphereGeometry(0.24, 14, 10), w, 0, 1.65, 0)); g.add(mesh(new THREE.ConeGeometry(0.05, 0.3, 6).rotateX(Math.PI / 2), mc('#ff8a1f'), 0, 1.65, 0.3)); g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10), mc('#1d1d1d'), 0, 1.95, 0)); return g; },
  icecrystal(o, R) { return DECO.crystal({ color: o.space ? (R() > 0.5 ? '#b36bff' : '#ff3fa8') : R() > 0.5 ? '#9fe0ff' : '#d8f4ff' }, R); },
  chalet(o) { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(7, 3.4, 5), mc('#8a5a32'), 0, 1.7, 0)); const r = mesh(new THREE.CylinderGeometry(0.01, 5.6, 2.6, 4, 1), mc('#ffffff'), 0, 4.6, 0); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.8); g.add(r); for (const x of [-2, 2]) g.add(mesh(new THREE.BoxGeometry(1.1, 1.1, 0.06), new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffcf70', emissiveIntensity: 1.2 }), x, 1.9, 2.52)); return g; },
  /* ---- fête foraine ---- */
  lollipop(o, R) { const g = new THREE.Group(), h = 2 + R() * 2.5; g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), mc('#ffffff'), 0, h / 2, 0)); const d = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.18, 24).rotateX(Math.PI / 2), mc(['#ff5a8a', '#5ab8ff', '#ffd23f', '#b06bff'][(R() * 4) | 0], { flatShading: false }), 0, h + 0.6, 0); g.add(d); g.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), mc('#ffffff'), 0, h + 0.6, 0.1)); return g; },
  candycane(o, R) { const g = new THREE.Group(), m = std({ map: T.candyw(), vertexColors: false }); g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 10), m, 0, 1.5, 0)); g.add(mesh(new THREE.TorusGeometry(0.45, 0.15, 8, 16, Math.PI), m, -0.45, 3, 0)); return g; },
  gumdrop(o, R) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.35 + R() * 0.25, 12, 8, 0, 6.28, 0, 1.7), new THREE.MeshStandardMaterial({ color: ['#ff5a8a', '#5af0a0', '#ffd23f', '#b06bff', '#5ab8ff'][(R() * 5) | 0], roughness: 0.2, transparent: true, opacity: 0.9 }), (R() - 0.5) * 1.4, 0, (R() - 0.5) * 1.4)); return g; },
  cupcake(o, R) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.9, 0.65, 0.9, 14), mc('#ff9ad0'), 0, 0.45, 0)); g.add(mesh(new THREE.SphereGeometry(0.95, 16, 10, 0, 6.28, 0, 1.6), mc('#fff4f8', { flatShading: false }), 0, 0.9, 0)); g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mc('#e8263c', { flatShading: false }), 0, 1.85, 0)); return g; },
  ferris(o) { const g = new THREE.Group(), m = mc('#ffffff', { metalness: 0.4 }), R0 = o.r || 9; const wheel = new THREE.Group(); wheel.add(mesh(new THREE.TorusGeometry(R0, 0.15, 6, 40), m)); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; const sp = mesh(new THREE.BoxGeometry(0.1, R0, 0.1), m, Math.sin(a) * R0 / 2, Math.cos(a) * R0 / 2, 0); sp.rotation.z = -a; wheel.add(sp); wheel.add(mesh(new THREE.BoxGeometry(1, 0.8, 0.8), mc(['#ff5a8a', '#5ab8ff', '#ffd23f', '#5af0a0'][i % 4]), Math.sin(a) * R0, Math.cos(a) * R0 - 0.6, 0)); } wheel.position.y = R0 + 1.5; g.add(wheel); for (const s of [1, -1]) g.add(mesh(new THREE.BoxGeometry(0.3, R0 + 1.8, 0.3), m, s * 1.6, (R0 + 1.5) / 2, 0).rotateZ(s * 0.18)); g.userData.anim = (t) => { wheel.rotation.z = t * 0.12; }; g.userData.dynamic = true; return g; },
  tent(o) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(4, 4, 3, 16), std({ map: T.candyw(), vertexColors: false }), 0, 1.5, 0)); g.add(mesh(new THREE.ConeGeometry(4.4, 3, 16), mc('#e8263c'), 0, 4.5, 0)); g.add(mesh(new THREE.ConeGeometry(0.2, 1, 6), mc('#ffd23f'), 0, 6.5, 0)); return g; },
};

/* scatter de décor par ambiance */
const SCATTER = {
  park: [['tree', 0.34], ['pine', 0.12], ['bush', 0.26], ['flowers', 0.14], ['rock', 0.06], ['bench', 0.04], ['lamp', 0.04]],
  pirate: [['rock', 0.35], ['buoy', 0.15], ['island', 0.5]],
  zen: [['sakura', 0.2], ['pine', 0.24], ['rock', 0.22], ['bush', 0.18], ['bamboo', 0.08], ['lantern', 0.08]],
  forge: [['rock', 0.5], ['crystal', 0.22], ['pipe', 0.16], ['rock', 0.12]],
  canyon: [['cactus', 0.32], ['rock', 0.3], ['mesa', 0.12], ['tumbleweed', 0.14], ['bush', 0.12]],
  space: [['asteroid', 0.85], ['satellite', 0.03], ['icecrystal', 0.12]],
  swamp: [['deadtree', 0.22], ['reeds', 0.28], ['lilypad', 0.24], ['mushroom', 0.12], ['stump', 0.14]],
  ice: [['snowpine', 0.48], ['rock', 0.2], ['icecrystal', 0.14], ['snowman', 0.06], ['bush', 0.12]],
  candy: [['lollipop', 0.26], ['candycane', 0.18], ['gumdrop', 0.3], ['cupcake', 0.16], ['tree', 0.1]],
  marathon: [['tree', 0.32], ['pine', 0.2], ['bush', 0.22], ['flowers', 0.1], ['rock', 0.1], ['fence', 0.03], ['bench', 0.03]],
};

/* ---------------------------------------------------------------- rendu */
export class Renderer {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 900);
    this.quality = 'high';
    this.balls = new Map(); this.kinObjs = []; this.anims = []; this.emitters = []; this.flags = []; this.holeGroups = [];
    this.time = 0; this.camMeshes = [];
    this.parts = new Particles(this.scene, 2500, T.spark(), true);
    this.partsN = new Particles(this.scene, 1500, T.spark(), false);
    this.petals = new Particles(this.scene, 500, T.petal(), false);
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); this.bloom.setSize(w / 2, h / 2); }
    this.parts.mat.uniforms.scale.value = this.partsN.mat.uniforms.scale.value = this.petals.mat.uniforms.scale.value = h * 0.5;
  }
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, this.touch ? 1.3 : 1.75));
    this.renderer.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (this.sun) { this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  /** Construit tout le parcours : ciel, lumières, sol, trous, décor */
  loadCourse(course, holes) {
    this.clear();
    const th = this.th = THEMES[course.theme], S = this.scene;
    this.course = course; this.holes = holes;
    this.mats = makeMats(course.theme);
    this.renderer.toneMappingExposure = th.exposure;
    // ciel + brouillard
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMaterial(th)); sky.renderOrder = -10; S.add(sky); this.sky = sky;
    S.fog = new THREE.Fog(C(th.fog), th.fogNear, th.fogFar);
    if (th.stars) { const n = 1500, p = new Float32Array(n * 3); const R = rng(9); for (let i = 0; i < n; i++) { const a = R() * 6.28, y = 0.1 + R() * 0.9, r = Math.sqrt(1 - y * y); p.set([Math.cos(a) * r * 480, y * 480, Math.sin(a) * r * 480], i * 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); S.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffd9c0', size: 1.6, sizeAttenuation: false, fog: false }))); }
    // reflets : environnement calculé depuis le ciel
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial(th)));
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: C(th.hemi[1]).multiplyScalar(0.6) })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; envScene.add(gnd);
    this.envTex = pm.fromScene(envScene, 0.03).texture; S.environment = this.envTex; S.environmentIntensity = th.night ? 0.5 : 0.8; pm.dispose();
    // lumières
    this.hemi = new THREE.HemisphereLight(C(th.hemi[0]), C(th.hemi[1]), th.hemi[2]); S.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(C(th.sun.color), th.sun.int);
    sun.castShadow = true; sun.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3; sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
    S.add(sun); S.add(sun.target);
    this.pointPool = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ffb35a', 0, 7, 1.6); S.add(l); this.pointPool.push(l); }
    // sol
    this.buildGround(course, holes);
    // empreinte des allées (le décor les évite)
    this.buildFoot(course, holes);
    // trous
    holes.forEach((h, i) => this.buildHole(h, i));
    // décor central + dispersé (fusionné pour limiter les appels de dessin)
    const statics = [];
    const R = rng(course.id.length * 7919 + 13);
    for (const d of course.center || []) this.placeDeco(d.type, d.p, d, R, statics);
    this.scatter(course, holes, R, statics);
    this.mergeStatics(statics);
    // post-traitement
    this.setupComposer(th);
    this.setHole(0);
  }
  clear() {
    const S = this.scene;
    for (const c of [...S.children]) if (![this.parts.pts, this.partsN.pts, this.petals.pts].includes(c)) { S.remove(c); c.traverse?.((o) => { o.geometry?.dispose?.(); }); }
    this.balls.clear(); this.kinObjs = []; this.anims = []; this.emitters = []; this.flags = []; this.holeGroups = []; this.waterMats = []; this.camMeshes = [];
    this.parts.n = this.partsN.n = this.petals.n = 0;
  }
  setupComposer(th) {
    const r = this.renderer;
    if (this.composer) this.composer.dispose?.();
    const comp = this.composer = new EffectComposer(r);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), th.bloom[0], th.bloom[1], th.bloom[2]);
    comp.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, tint: { value: new V3(...th.grade) }, sat: { value: th.sat }, vig: { value: 0.32 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 tint; uniform float sat, vig; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(.299,.587,.114)); c.rgb = mix(vec3(l), c.rgb, sat) * tint;
          vec2 d = vUv - .5; c.rgb *= 1.0 - vig * smoothstep(.25, .8, dot(d,d) * 2.2); gl_FragColor = c; }`,
    });
    comp.addPass(this.grade);
    comp.addPass(new OutputPass());
    this.resize();
  }

  buildGround(course, holes) {
    const th = this.th, y = course.groundY, size = course.groundSize || 900, rk = size / 900;   // le Marathon s'étend bien plus loin
    let geo = new THREE.PlaneGeometry(size, size, 1, 1); geo.rotateX(-Math.PI / 2);
    let mat;
    if (th.ground === 'water') {
      const n = T.waterN().clone(); n.needsUpdate = true; n.repeat.set(60 * rk, 60 * rk);
      mat = new THREE.MeshStandardMaterial({ color: '#2a8ea6', roughness: 0.22, metalness: 0.05, normalMap: n, normalScale: new THREE.Vector2(0.16, 0.16), envMapIntensity: 0.9 });
      this.waterNormal = n;
    } else if (th.ground === 'lava') {
      const t = T.lava().clone(); t.needsUpdate = true; t.repeat.set(22 * rk, 22 * rk);
      mat = new THREE.MeshStandardMaterial({ color: '#2a0a04', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.8, roughness: 0.9 });
      this.lavaTex = t;
    } else if (th.ground === 'swamp') {
      const n = T.waterN().clone(); n.needsUpdate = true; n.repeat.set(50 * rk, 50 * rk);
      const t = T.swampwater().clone(); t.needsUpdate = true; t.repeat.set(30 * rk, 30 * rk);
      mat = new THREE.MeshStandardMaterial({ map: t, color: '#8fa080', roughness: 0.3, metalness: 0.05, normalMap: n, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.6 });
      this.waterNormal = n;
    } else if (th.ground === 'void') {
      mat = null;
    } else {
      const src = { moss: T.moss, desert: T.desert, snow: T.snow, candy: T.candyground }[th.ground] || T.grass;
      const t = src().clone(); t.needsUpdate = true; t.repeat.set(140 * rk, 140 * rk);
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: th.ground === 'moss' ? '#9db48a' : '#ffffff' });
    }
    if (mat) { const g = new THREE.Mesh(geo, mat); g.position.y = y; g.receiveShadow = true; this.scene.add(g); this.ground = g; }
    else {   // l'espace : une nébuleuse lointaine sous les pieds
      const neb = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), new THREE.MeshBasicMaterial({ color: '#3a1a6a', transparent: true, opacity: 0.35, side: THREE.BackSide, fog: false, depthWrite: false }));
      this.scene.add(neb); this.ground = null;
    }
    // matériau d'eau pour les bassins
    const wn = T.waterN().clone(); wn.needsUpdate = true; wn.repeat.set(3, 3); this.pondNormal = wn;
    this.pondMat = new THREE.MeshStandardMaterial({ color: '#1d5a6a', roughness: 0.08, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.88 });
  }

  buildHole(h, i) {
    const grp = new THREE.Group(); grp.userData.hole = i;
    const floorSet = new Set(['felt', 'turf', 'moss', 'plank', 'redwood', 'stone', 'metal', 'grate', 'sand', 'zen', 'beach', 'ice', 'boost', 'conveyor', 'tramp', 'lavarock']);
    for (const gr of h.groups) {
      if (!gr.render) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(gr.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(gr.nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(gr.uv, 2));
      const col = new Float32Array(gr.ao.length * 3); for (let k = 0; k < gr.ao.length; k++) col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = gr.ao[k];
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.mats[gr.mat] || this.mats.skirt);
      m.receiveShadow = true; m.castShadow = !floorSet.has(gr.mat) || true;
      if (gr.mat === 'glassroof' || gr.mat === 'glass') m.castShadow = false;
      grp.add(m);
      if (gr.phys && gr.mat !== 'glassroof') m.userData.cam = true;
    }
    // trou + drapeau
    if (h.cup) {
      const disk = new THREE.Mesh(new THREE.CircleGeometry(CUP_R + 0.03, 32), new THREE.MeshBasicMaterial({ map: T.cup(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      disk.rotation.x = -Math.PI / 2; disk.position.set(h.cup[0], h.cup[1] + 0.004, h.cup[2]); disk.renderOrder = 2; grp.add(disk);
      const flag = new THREE.Group(); flag.position.set(h.cup[0], h.cup[1], h.cup[2]);
      const poleMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, metalness: 0.3, transparent: true });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 8), poleMat); pole.position.y = 0.95 - 0.1; pole.castShadow = true; flag.add(pole);
      const clothG = new THREE.PlaneGeometry(0.75, 0.48, 10, 4); clothG.translate(0.375, 0, 0);
      const clothM = new THREE.MeshStandardMaterial({ color: this.th.flag, side: THREE.DoubleSide, roughness: 0.7, transparent: true, emissive: this.th.flag, emissiveIntensity: this.th.night ? 0.6 : 0.05 });
      const cloth = new THREE.Mesh(clothG, clothM); cloth.position.y = 1.55; cloth.castShadow = true; flag.add(cloth);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R * 0.9, 3, 24, 1, true), new THREE.MeshBasicMaterial({ color: this.th.flag, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.5; flag.add(beam);
      grp.add(flag);
      this.flags.push({ hole: i, flag, cloth, base: clothG.attributes.position.array.slice(), mats: [poleMat, clothM], beam, cup: h.cup });
    }
    // départ
    if (h.tee) {
      const tm = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      tm.rotation.x = -Math.PI / 2; tm.position.set(h.tee[0], h.tee[1] - BALL_R + 0.006, h.tee[2]); grp.add(tm);
    }
    // obstacles mobiles
    for (const k of h.kin) this.buildKin(k, grp);
    // pilotis
    if (h.piles.length && h.groundType !== 'void') {
      const pm = this.course.theme === 'forge' ? mc('#2c2f36', { metalness: 0.7, roughness: 0.4 }) : mc('#4a3420');
      const geos = [];
      for (const p of h.piles) { const len = p[1] - h.groundY + 0.8; const g = new THREE.CylinderGeometry(0.13, 0.16, len, 8); g.translate(p[0], p[1] - len / 2, p[2]); geos.push(g); }
      const m = new THREE.Mesh(mergeGeometries(geos), pm); m.castShadow = true; grp.add(m);
    }
    // zones d'eau / lave posées en hauteur
    for (const z of h.zones) {
      if (z.type === 'slow' || z.type === 'antigrav') {
        const sx = z.max[0] - z.min[0], sy = z.max[1] - z.min[1], sz = z.max[2] - z.min[2];
        const col = z.type === 'slow' ? '#7fe05a' : '#b36bff';
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, transparent: true, opacity: z.type === 'slow' ? 0.32 : 0.1, depthWrite: false, roughness: 0.2, side: THREE.DoubleSide }));
        m.position.set((z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2, (z.min[2] + z.max[2]) / 2); m.renderOrder = 3; grp.add(m);
        const e = new THREE.Object3D(); e.position.copy(m.position); grp.add(e);
        this.emitters.push({ obj: e, type: z.type === 'slow' ? 'goo' : 'magfield', y: 0, sx, sy, sz });
        continue;
      }
      if (z.type !== 'water' && z.type !== 'lava') continue;
      if (h.decor.some((d) => d.type === 'pond')) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(z.max[0] - z.min[0], z.max[2] - z.min[2]).rotateX(-Math.PI / 2), this.pondMat);
      m.position.set((z.min[0] + z.max[0]) / 2, z.max[1] - 0.02, (z.min[2] + z.max[2]) / 2); grp.add(m);
    }
    // lumières du trou
    grp.userData.lights = h.lights;
    for (const L of h.lights) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.spark(), color: L.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      sp.position.set(...L.p); sp.scale.setScalar(1.3); grp.add(sp);
    }
    // décor spécifique du trou
    const statics = [];
    const R = rng(i * 131 + 7);
    for (const d of h.decor) {
      const extra = d.type === 'sign' ? { hname: h.name, par: h.par } : {};
      this.placeDeco(d.type, d.p, { ...d, ...extra }, R, statics, grp);
    }
    for (const s of statics) grp.add(s);
    this.scene.add(grp); this.holeGroups.push(grp);
    grp.traverse((o) => { if (o.userData.cam) this.camMeshes.push({ m: o, hole: i }); });
  }

  buildKin(k, grp) {
    const g = new THREE.Group();
    const looks = {
      blades: [mc('#7a5534'), mc('#efe6d2')], anchor: [mc('#2a2d33', { metalness: 0.8, roughness: 0.35 })], bamboo: [std({ map: T.bamboo(), vertexColors: false })],
      piston: [std({ map: T.hazard(), vertexColors: false, metalness: 0.3, roughness: 0.4 })],
      door: [std({ map: T.metalw(), vertexColors: false, metalness: 0.7, roughness: 0.35, emissive: C('#ff3fa8'), emissiveIntensity: 0.15 })],
      boulder: [mc('#b06a3a')], log: [std({ map: T.wood(), vertexColors: false })], wheel: [mc('#8a5a32')],
      gondola: [mc('#e8433b'), mc('#2b2f36', { metalness: 0.7 })], arm: [std({ map: T.candyw(), vertexColors: false })], ladle: [mc('#3a3a42', { metalness: 0.8 })],
      asteroid: [mc('#6a6070')], snowball: [mc('#ffffff')], jelly: [new THREE.MeshStandardMaterial({ color: '#5ef0a0', transparent: true, opacity: 0.85, roughness: 0.15 })], cross: [std({ map: T.hazard(), vertexColors: false })], hammer: [std({ map: T.hazard(), vertexColors: false }), mc('#3a3e46', { metalness: 0.8 })], bar: [std({ map: T.hazard(), vertexColors: false })],
    }[k.look] || [mc('#888')];
    k.boxes.forEach((b, bi) => {
      const m = mesh(new THREE.BoxGeometry(...b.s), looks[Math.min(bi, looks.length - 1)] || looks[0], ...b.c);
      if (b.yaw) m.rotation.y = b.yaw; g.add(m);
      if (k.look === 'blades') { const sail = mesh(new THREE.BoxGeometry(b.s[0] * 0.8, b.s[1] * 0.8, 0.02), looks[1], b.c[0], b.c[1], b.c[2] + 0.05); g.add(sail); }
    });
    if (k.look === 'blades') g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12).rotateX(Math.PI / 2), mc('#c8322c'), 0, 0, 0.05));
    if (k.look === 'anchor') { g.add(mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16, Math.PI), looks[0], 0, -2.2, 0).rotateZ(Math.PI)); g.add(mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12), looks[0], 0, -0.15, 0)); }
    grp.add(g); this.kinObjs.push({ k, g });
  }

  placeDeco(type, p, o, R, statics, parent) {
    const f = DECO[type]; if (!f) return null;
    const obj = f({ ...o, at: p, free: this.footFree }, R);
    obj.position.set(p[0], ['island', 'cliff', 'volcano', 'wreck'].includes(type) ? this.course.groundY : p[1], p[2]);
    if (obj.userData.float != null && this.course.groundType === 'void') obj.position.y = (o.y ?? 0) + (Math.random() - 0.4) * obj.userData.float * 2; if (o.yaw != null) obj.rotation.y = o.yaw; else if (!['sign', 'windmill', 'ship', 'dragon', 'gantry'].includes(type)) obj.rotation.y = R() * 6.28;
    const dynamic = obj.userData.dynamic || obj.userData.emit;
    obj.traverse((c) => { if (c.userData.water) c.material = this.pondMat; if (c.userData.anim) this.anims.push(c.userData.anim); if (c.userData.emit) this.emitters.push({ obj: c, ...c.userData.emit }); });
    if (dynamic || obj.children.some((c) => c.userData.water)) (parent || this.scene).add(obj);
    else statics.push(obj);
    return obj;
  }
  buildFoot(course, holes) {
    const cell = 3, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const add = (f) => { const r = f[2] + 2.5; for (let x = f[0] - r; x <= f[0] + r + cell; x += cell) for (let z = f[1] - r; z <= f[1] + r + cell; z += cell) { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(f); } };
    this.footAdd = add;
    for (const h of holes) for (const f of h.foot) add(f);
    this.footFree = (x, z, m) => { const l = grid.get(key(x, z)); if (!l) return true; return !l.some((f) => Math.hypot(f[0] - x, f[1] - z) < f[2] + m); };
  }
  scatter(course, holes, R, statics) {
    let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9;
    for (const h of holes) for (const f of h.foot) { mnx = Math.min(mnx, f[0]); mxx = Math.max(mxx, f[0]); mnz = Math.min(mnz, f[1]); mxz = Math.max(mxz, f[1]); }
    for (const h of holes) for (const d of h.decor) this.footAdd([d.p[0], d.p[2], d.r ? d.r + 1 : 2]);
    for (const d of course.center || []) this.footAdd([d.p[0], d.p[2], d.r ? d.r + 1 : 5]);
    const free = this.footFree, foot = { push: (f) => this.footAdd(f) };
    const list = SCATTER[course.theme], pad = 22;
    const area = (mxx - mnx + pad * 2) * (mxz - mnz + pad * 2), N = Math.min(course.scatterMax || 420, Math.floor(area / (course.theme === 'pirate' ? 70 : 22)));
    for (let i = 0; i < N; i++) {
      const x = mnx - pad + R() * (mxx - mnx + pad * 2), z = mnz - pad + R() * (mxz - mnz + pad * 2);
      let u = R(), type = list[0][0]; for (const [t, w] of list) { if (u < w) { type = t; break; } u -= w; }
      const big = type === 'island' ? 5 : type === 'tree' || type === 'sakura' ? 2.0 : 1.2;
      if (!free(x, z, big)) continue;
      const o = course.theme === 'space' ? { space: true } : type === 'island' ? { r: 2 + R() * 3, palms: 1 + ((R() * 3) | 0) } : type === 'rock' && course.theme === 'pirate' ? { s: 0.3 + R() * 0.8, color: '#6a645c' } : {};
      this.placeDeco(type, [x, course.groundType === 'void' ? 0 : course.groundY, z], o, R, statics);
      foot.push([x, z, big * 0.6]);
    }
  }
  mergeStatics(objs) {
    const byMat = new Map();
    for (const o of objs) {
      o.updateMatrixWorld(true);
      o.traverse((c) => {
        if (!c.isMesh || Array.isArray(c.material)) return;
        let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(c.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        const k = c.material.uuid; if (!byMat.has(k)) byMat.set(k, { mat: c.material, geos: [] }); byMat.get(k).geos.push(g);
      });
    }
    for (const { mat, geos } of byMat.values()) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
  }

  /** Trou actif : cadre des ombres, lumières proches */
  setHole(i) {
    this.hole = i; const h = this.holes[i]; if (!h) return;
    const c = new V3((h.bounds.min[0] + h.bounds.max[0]) / 2, (h.bounds.min[1] + h.bounds.max[1]) / 2, (h.bounds.min[2] + h.bounds.max[2]) / 2);
    let ext = Math.max(h.bounds.max[0] - h.bounds.min[0], h.bounds.max[2] - h.bounds.min[2]) / 2 + 6;
    // très long trou : une seule carte d'ombres sur 150 m serait floue ; elle suit la balle (update) sur 80 m de côté
    this.follow = ext > 46 ? { ext: 40, at: null, lightAt: 0 } : null;
    if (this.follow) ext = this.follow.ext;
    const d = new V3(...this.th.sun.dir).normalize();
    this.sun.position.copy(c).addScaledVector(d, 80); this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera; cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 20; cam.far = 160; cam.updateProjectionMatrix();
    this.hemi.position.copy(c);
    // lumières : les plus proches du trou
    const all = []; this.holes.forEach((hh) => hh.lights.forEach((L) => all.push(L)));
    all.sort((a, b) => c.distanceToSquared(new V3(...a.p)) - c.distanceToSquared(new V3(...b.p)));
    this.pointPool.forEach((l, k) => { const L = all[k]; if (!L) { l.intensity = 0; l.userData.base = 0; return; } l.position.set(...L.p); l.color.set(L.color); l.userData.base = L.intensity * 1.6; l.distance = L.dist * 1.4; l.intensity = l.userData.base; });
  }

  /** Très long trou : cadre des ombres recentré sur la balle (par pas d'un texel, sans scintillement), lumières les plus proches */
  followFocus(focus) {
    const F = this.follow, ext = F.ext, cell = (ext * 2) / this.sun.shadow.mapSize.x * 8;
    const c = new V3(Math.round(focus.x / cell) * cell, focus.y, Math.round(focus.z / cell) * cell);
    if (!F.at || F.at.distanceToSquared(c) > 1e-6) {
      F.at = c;
      const d = new V3(...this.th.sun.dir).normalize();
      this.sun.position.copy(c).addScaledVector(d, 80); this.sun.target.position.copy(c);
      this.sun.target.updateMatrixWorld(); this.hemi.position.copy(c);
    }
    if (this.time - F.lightAt > 0.5) {
      F.lightAt = this.time;
      const h = this.holes[this.hole]; if (!h) return;
      const all = h.lights.slice().sort((a, b) => focus.distanceToSquared(new V3(...a.p)) - focus.distanceToSquared(new V3(...b.p)));
      this.pointPool.forEach((l, k) => { const L = all[k]; if (!L) { l.intensity = 0; l.userData.base = 0; return; } l.position.set(...L.p); l.color.set(L.color); l.userData.base = L.intensity * 1.6; l.distance = L.dist * 1.4; });
    }
  }

  /* ---- balles ---- */
  addBall(id, color) {
    if (this.balls.has(id)) return this.balls.get(id);
    const col = C(color);
    const mat = new THREE.MeshPhysicalMaterial({ color: col.clone().lerp(C('#ffffff'), 0.35), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, normalMap: T.dimple(), normalScale: new THREE.Vector2(0.6, 0.6), emissive: col, emissiveIntensity: this.th?.night ? 0.35 : 0.06 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), mat); m.castShadow = true; m.receiveShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.spark(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.0 }));
    glow.scale.setScalar(0.55); m.add(glow);
    // traînée
    const N = 36, tp = new Float32Array(N * 2 * 3), ta = new Float32Array(N * 2);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('alpha', new THREE.BufferAttribute(ta, 1));
    const idx = []; for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); tg.setIndex(idx);
    const tm = new THREE.ShaderMaterial({ uniforms: { col: { value: col } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col * 1.4, vA * 0.75);
#include <colorspace_fragment>
}` });
    const trail = new THREE.Mesh(tg, tm); trail.frustumCulled = false;
    this.scene.add(m); this.scene.add(trail);
    const b = { id, m, glow, trail, hist: [], color: col, q: new THREE.Quaternion(), last: null, N };
    this.balls.set(id, b); return b;
  }
  removeBall(id) { const b = this.balls.get(id); if (!b) return; this.scene.remove(b.m); this.scene.remove(b.trail); this.balls.delete(id); }
  /** Position d'une balle ; fait rouler la sphère selon son déplacement */
  setBall(id, p, visible, o = {}) {
    const b = this.balls.get(id); if (!b) return;
    b.m.visible = visible; b.trail.visible = visible;
    if (!visible) { b.last = null; b.hist.length = 0; return; }
    const np = new V3(p[0], p[1], p[2]);
    if (b.last) {
      const d = np.clone().sub(b.last), dist = d.length();
      if (dist > 3) { b.hist.length = 0; }
      else if (dist > 1e-5) { const axis = new V3(d.z, 0, -d.x).normalize(); if (axis.lengthSq() > 0.5) { b.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R)); } }
      b.speed = dist / Math.max(1e-3, o.dt || 0.016);
    }
    b.last = np; b.m.position.copy(np); b.m.quaternion.copy(b.q);
    b.glow.material.opacity = o.active ? 0.22 + Math.sin(this.time * 4) * 0.08 : (this.th?.night ? 0.18 : 0.0);
    b.m.scale.setScalar(o.sink ? Math.max(0.01, 1 - o.sink) : 1);
    // historique de traînée
    if ((b.speed || 0) > 1.2) { b.hist.unshift(np.clone()); if (b.hist.length > b.N) b.hist.pop(); }
    else if (b.hist.length) b.hist.pop();
  }
  updateTrails() {
    const camPos = this.camera.position;
    for (const b of this.balls.values()) {
      const P = b.trail.geometry.attributes.position, A = b.trail.geometry.attributes.alpha, h = b.hist;
      for (let i = 0; i < b.N; i++) {
        const p = h[Math.min(i, h.length - 1)];
        if (!p || h.length < 2) { A.array[i * 2] = A.array[i * 2 + 1] = 0; continue; }
        const q = h[Math.min(i + 1, h.length - 1)] || p, dir = p.clone().sub(q), view = camPos.clone().sub(p);
        let side = dir.cross(view).normalize().multiplyScalar(BALL_R * 0.85 * (1 - i / b.N));
        if (!isFinite(side.x)) side.set(0, 0, 0);
        P.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z); P.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
        const a = (1 - i / Math.max(1, h.length - 1)) * (i < h.length ? 1 : 0); A.array[i * 2] = A.array[i * 2 + 1] = Math.max(0, a);
      }
      P.needsUpdate = true; A.needsUpdate = true;
    }
  }

  /* ---- visée ---- */
  aim(show, p, yaw, power, color, flip) {
    if (!this.aimObj) {
      const g = new THREE.Group();
      const shape = new THREE.Shape(); shape.moveTo(-0.07, 0); shape.lineTo(0.07, 0); shape.lineTo(0.07, 0.82); shape.lineTo(0.2, 0.82); shape.lineTo(0, 1); shape.lineTo(-0.2, 0.82); shape.lineTo(-0.07, 0.82); shape.lineTo(-0.07, 0);
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
      const mat = new THREE.ShaderMaterial({ uniforms: { pw: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `varying float vZ; void main(){ vZ = position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float pw; varying float vZ; void main(){ vec3 a = vec3(.25,.95,.45), b = vec3(1.,.85,.2), c = vec3(1.,.25,.2); float t = vZ * pw; vec3 col = t < .5 ? mix(a,b,t*2.) : mix(b,c,(t-.5)*2.); gl_FragColor = vec4(col, .85);
#include <colorspace_fragment>
}` });
      const arrow = new THREE.Mesh(geo, mat); arrow.renderOrder = 6; g.add(arrow);
      const dots = []; for (let i = 0; i < 7; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false })); d.renderOrder = 6; g.add(d); dots.push(d); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.21, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })); ring.renderOrder = 6; g.add(ring);
      this.scene.add(g); this.aimObj = { g, arrow, mat, dots, ring };
    }
    const A = this.aimObj; A.g.visible = show; if (!show) return;
    A.g.position.set(p[0], p[1] + (flip ? BALL_R - 0.02 : -BALL_R + 0.02), p[2]); A.g.rotation.set(0, yaw, flip ? Math.PI : 0);
    const len = 0.25 + power * 3.2;
    A.arrow.scale.set(1 + power * 0.6, 1, len); A.arrow.position.z = 0.22; A.arrow.visible = power > 0.005; A.mat.uniforms.pw.value = power;
    A.dots.forEach((d, i) => { d.position.set(0, 0, 0.3 + i * 0.32); d.visible = power < 0.005; d.material.opacity = 0.75 * (1 - i / 7); });
    A.ring.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
  }

  /* ---- effets ---- */
  fx(kind, p, o = {}) {
    const P = this.parts, N = this.partsN, R = Math.random;
    const col = (c, a = 1) => { const x = C(c); x.a = a; return x; };
    if (kind === 'water' || kind === 'splash') {
      for (let i = 0; i < 40; i++) { const a = R() * 6.28, s = 1 + R() * 3; N.emit(p[0], p[1], p[2], Math.cos(a) * s * 0.5, 2.5 + R() * 3.5, Math.sin(a) * s * 0.5, col('#dff4ff', 0.9), 0.08 + R() * 0.12, 0.7 + R() * 0.4, 9, 0.5); }
      for (let i = 0; i < 12; i++) { const a = R() * 6.28; N.emit(p[0] + Math.cos(a) * 0.2, p[1], p[2] + Math.sin(a) * 0.2, Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2, col('#ffffff', 0.6), 0.25, 0.8, 0, 2, 0.6); }
    } else if (kind === 'lava') {
      for (let i = 0; i < 50; i++) { const a = R() * 6.28, s = R() * 2.5; P.emit(p[0], p[1], p[2], Math.cos(a) * s, 2 + R() * 4, Math.sin(a) * s, col(R() > 0.5 ? '#ffb020' : '#ff4a10'), 0.08 + R() * 0.1, 0.6 + R() * 0.6, 8, 0.3); }
      for (let i = 0; i < 16; i++) N.emit(p[0] + (R() - 0.5) * 0.4, p[1] + 0.2, p[2] + (R() - 0.5) * 0.4, (R() - 0.5) * 0.4, 1 + R(), (R() - 0.5) * 0.4, col('#3a3030', 0.55), 0.35, 1.8, -0.3, 0.6, 0.6);
    } else if (kind === 'void') {
      for (let i = 0; i < 30; i++) { const a = R() * 6.28; P.emit(p[0], p[1], p[2], Math.cos(a) * 0.8, (R() - 0.5), Math.sin(a) * 0.8, col('#b36bff'), 0.08, 0.9, 0, 1); }
    } else if (kind === 'flip') {
      for (let i = 0; i < 24; i++) { const a = R() * 6.28; P.emit(p[0], p[1], p[2], Math.cos(a) * 1.5, (o.s || 1) * 2, Math.sin(a) * 1.5, col('#d39bff'), 0.07, 0.5, 0, 2); }
    } else if (kind === 'slow') {
      for (let i = 0; i < 16; i++) N.emit(p[0], p[1], p[2], (R() - 0.5), R() * 0.8, (R() - 0.5), col('#9cff6a', 0.8), 0.1, 0.7, 2, 1);
    } else if (kind === 'mud') {
      for (let i = 0; i < 18; i++) N.emit(p[0], p[1] - 0.05, p[2], (R() - 0.5) * 1.6, 1 + R() * 1.4, (R() - 0.5) * 1.6, col('#4a3020', 0.95), 0.08, 0.6, 8, 1);
    } else if (kind === 'out') {
      for (let i = 0; i < 20; i++) { const a = R() * 6.28; N.emit(p[0], p[1], p[2], Math.cos(a) * 1.5, 1 + R() * 2, Math.sin(a) * 1.5, col('#b9a586', 0.8), 0.12, 0.6, 6, 1); }
    } else if (kind === 'cup') {
      for (let i = 0; i < 60; i++) { const a = R() * 6.28, s = 0.5 + R() * 2; P.emit(p[0], p[1] + 0.1, p[2], Math.cos(a) * s, 3 + R() * 4, Math.sin(a) * s, col(['#ffd23f', '#ff5a7a', '#5ad1ff', '#7dff8a', '#ffffff'][(R() * 5) | 0]), 0.09 + R() * 0.08, 1.2 + R() * 0.6, 6, 0.8); }
    } else if (kind === 'ace') {
      for (let k = 0; k < 4; k++) for (let i = 0; i < 70; i++) { const a = R() * 6.28, s = 1 + R() * 3; P.emit(p[0], p[1] + 0.2, p[2], Math.cos(a) * s, 5 + R() * 5, Math.sin(a) * s, col(['#ffd23f', '#ff5a7a', '#5ad1ff', '#7dff8a', '#c58aff'][(R() * 5) | 0]), 0.1 + R() * 0.1, 1.6 + R(), 7, 0.6); }
    } else if (kind === 'hit' || kind === 'bumper') {
      const n = Math.min(7, Math.max(2, Math.round((o.s || 1) * 0.8)));
      for (let i = 0; i < n; i++) P.emit(p[0], p[1], p[2], (R() - 0.5) * 2, R() * 2, (R() - 0.5) * 2, col(kind === 'bumper' ? '#ff6a5a' : '#ffffff', 0.8), 0.05, 0.3, 4, 1);
    } else if (kind === 'sand') {
      for (let i = 0; i < 18; i++) N.emit(p[0], p[1] - 0.05, p[2], (R() - 0.5) * 1.5, 1 + R() * 1.5, (R() - 0.5) * 1.5, col('#e6cf98', 0.9), 0.07, 0.6, 7, 1);
    } else if (kind === 'boost') {
      for (let i = 0; i < 24; i++) P.emit(p[0], p[1], p[2], (R() - 0.5) * 1, R() * 1.5, (R() - 0.5) * 1, col('#ffb020'), 0.08, 0.5, 2, 1);
    } else if (kind === 'tramp') {
      for (let i = 0; i < 20; i++) { const a = R() * 6.28; P.emit(p[0], p[1], p[2], Math.cos(a) * 2, 0.5, Math.sin(a) * 2, col('#ff8a8a'), 0.08, 0.4, 0, 2); }
    } else if (kind === 'shot') {
      for (let i = 0; i < 10; i++) N.emit(p[0], p[1] - 0.08, p[2], (R() - 0.5) * 0.8, R() * 0.8, (R() - 0.5) * 0.8, col('#ffffff', 0.5), 0.1, 0.4, 1, 2, 0.3);
    } else if (kind === 'tele') {
      for (let i = 0; i < 40; i++) { const a = R() * 6.28; P.emit(p[0] + Math.cos(a) * 0.3, p[1], p[2] + Math.sin(a) * 0.3, 0, 1 + R() * 2, 0, col('#9a6bff'), 0.1, 0.6, 0, 1); }
    }
  }

  /** Courbe d'émission continue des décors (fumée, flammes, fontaine…) et ambiance */
  emitAmbient(dt, focus) {
    const P = this.parts, N = this.partsN, R = Math.random, col = (c, a = 1) => { const x = C(c); x.a = a; return x; };
    const wp = new V3();
    for (const e of this.emitters) {
      e.obj.getWorldPosition(wp);
      if (focus && wp.distanceTo(focus) > 70) continue;
      if (e.type === 'flame' && R() < dt * 14) P.emit(wp.x + (R() - 0.5) * 0.1, wp.y + e.y, wp.z + (R() - 0.5) * 0.1, (R() - 0.5) * 0.2, 0.8 + R() * 0.6, (R() - 0.5) * 0.2, col(R() > 0.4 ? '#ff9a30' : '#ffd060', 0.8), 0.12 + R() * 0.1, 0.5 + R() * 0.3, -0.5, 0.5, -0.15);
      if (e.type === 'fountain' && R() < dt * 40) { const a = R() * 6.28; N.emit(wp.x, wp.y + e.y, wp.z, Math.cos(a) * 0.9, 3 + R(), Math.sin(a) * 0.9, col('#e0f4ff', 0.75), 0.08, 1.1, 8, 0.2); }
      if (e.type === 'foam' && R() < dt * 20) N.emit(wp.x + (R() - 0.5) * 1.4, wp.y + 0.1, wp.z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.6, 0.6 + R() * 0.6, (R() - 0.5) * 0.6, col('#ffffff', 0.6), 0.3, 0.9, 1, 1, 0.5);
      if (e.type === 'smoke' && R() < dt * 6) N.emit(wp.x + (R() - 0.5) * 1.5, wp.y + e.y, wp.z + (R() - 0.5) * 1.5, (R() - 0.5) * 0.5, 1.2 + R(), (R() - 0.5) * 0.5, col('#3a2a28', 0.5), 1.4, 6, -0.1, 0.1, 0.9);
      if (e.type === 'goo' && R() < dt * 10) N.emit(wp.x + (R() - 0.5) * e.sx, wp.y - e.sy / 2 + 0.05, wp.z + (R() - 0.5) * e.sz, 0, 0.3 + R() * 0.3, 0, col('#9cff6a', 0.6), 0.12, 1.2, 0, 0.5, 0.05);
      if (e.type === 'magfield' && R() < dt * 26) P.emit(wp.x + (R() - 0.5) * e.sx, wp.y - e.sy / 2, wp.z + (R() - 0.5) * e.sz, 0, 1.2 + R(), 0, col(R() > 0.5 ? '#d39bff' : '#8a5aff', 0.8), 0.05, Math.max(0.4, e.sy / 1.8), 0, 0);
      if (e.type === 'bigfire' && R() < dt * 40) P.emit(wp.x + (R() - 0.5) * 3.5, wp.y + e.y, wp.z + (R() - 0.5) * 3.5, (R() - 0.5) * 0.4, 1.5 + R() * 2, (R() - 0.5) * 0.4, col(R() > 0.4 ? '#ff7a20' : '#ffc040', 0.85), 0.3 + R() * 0.3, 0.8 + R() * 0.5, -0.4, 0.4, -0.2);
    }
    if (!focus) return;
    const amb = this.th.amb;
    if (amb === 'embers' && R() < dt * 30) P.emit(focus.x + (R() - 0.5) * 30, this.course.groundY + 0.2, focus.z + (R() - 0.5) * 30, (R() - 0.5) * 0.4, 0.8 + R() * 1.4, (R() - 0.5) * 0.4, col(R() > 0.5 ? '#ff7a20' : '#ffb040'), 0.05 + R() * 0.06, 3 + R() * 3, -0.05, 0.1);
    if (amb === 'petals' && R() < dt * 9) this.petals.emit(focus.x + (R() - 0.5) * 26, focus.y + 6 + R() * 4, focus.z + (R() - 0.5) * 26, 0.4 + R() * 0.3, -0.5, (R() - 0.5) * 0.4, col('#ffffff', 0.95), 0.12, 9, 0, 0);
    if (amb === 'petals' && R() < dt * 6) P.emit(focus.x + (R() - 0.5) * 24, focus.y + 0.3 + R() * 2, focus.z + (R() - 0.5) * 24, (R() - 0.5) * 0.3, (R() - 0.5) * 0.2, (R() - 0.5) * 0.3, col('#d8ff6a', 0.9), 0.06, 4, 0, 0);
    if (amb === 'butterflies' && R() < dt * 1.5) P.emit(focus.x + (R() - 0.5) * 20, focus.y + 0.5 + R(), focus.z + (R() - 0.5) * 20, (R() - 0.5) * 0.8, (R() - 0.5) * 0.3, (R() - 0.5) * 0.8, col(['#ffd23f', '#ffffff', '#ff8ac8'][(R() * 3) | 0], 0.9), 0.07, 5, 0, 0);
    if (amb === 'dust' && R() < dt * 5) N.emit(focus.x + (R() - 0.5) * 30, focus.y + R() * 2, focus.z + (R() - 0.5) * 30, 0.8 + R(), 0, (R() - 0.5) * 0.3, col('#e8c49a', 0.35), 0.35, 4, 0, 0, 0.2);
    if (amb === 'stardust' && R() < dt * 12) P.emit(focus.x + (R() - 0.5) * 30, focus.y + (R() - 0.5) * 12, focus.z + (R() - 0.5) * 30, (R() - 0.5) * 0.2, (R() - 0.5) * 0.2, (R() - 0.5) * 0.2, col(R() > 0.5 ? '#ffffff' : '#9ab8ff', 0.8), 0.05, 4, 0, 0);
    if (amb === 'fireflies' && R() < dt * 10) P.emit(focus.x + (R() - 0.5) * 24, focus.y + 0.3 + R() * 2.5, focus.z + (R() - 0.5) * 24, (R() - 0.5) * 0.4, (R() - 0.5) * 0.2, (R() - 0.5) * 0.4, col('#d8ff6a', 0.95), 0.07, 4, 0, 0);
    if (amb === 'snowfall' && R() < dt * 40) N.emit(focus.x + (R() - 0.5) * 30, focus.y + 8 + R() * 4, focus.z + (R() - 0.5) * 30, 0.3, -1.1 - R() * 0.4, (R() - 0.5) * 0.3, col('#ffffff', 0.9), 0.07, 9, 0, 0);
    if (amb === 'confetti' && R() < dt * 6) N.emit(focus.x + (R() - 0.5) * 24, focus.y + 7 + R() * 3, focus.z + (R() - 0.5) * 24, (R() - 0.5) * 0.4, -0.9, (R() - 0.5) * 0.4, col(['#ff5a8a', '#ffd23f', '#5ab8ff', '#b06bff'][(R() * 4) | 0], 0.95), 0.08, 9, 0, 0);
    if (amb === 'gulls' && R() < dt * 4) N.emit(focus.x + (R() - 0.5) * 40, this.course.groundY + 0.05, focus.z + (R() - 0.5) * 40, (R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2, col('#ffffff', 0.35), 0.4, 2.5, 0, 0, 0.3);
  }

  /** Avance l'animation. kinT = temps des obstacles (synchronisé avec la physique) */
  update(dt, kinT, focus) {
    this.time += dt; const t = this.time;
    for (const { k, g } of this.kinObjs) {
      const P = kinPose(k, kinT), R = P.R;
      g.position.set(P.p[0], P.p[1], P.p[2]);
      _m4.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1); g.quaternion.setFromRotationMatrix(_m4);
    }
    for (const a of this.anims) a(t);
    for (const f of this.flags) {
      const pos = f.cloth.geometry.attributes.position, b = f.base;
      for (let i = 0; i < pos.count; i++) { const x = b[i * 3]; pos.setZ(i, Math.sin(x * 6 - t * 5 + f.hole) * 0.07 * x); pos.setY(i, b[i * 3 + 1] - x * x * 0.08); }
      pos.needsUpdate = true; f.cloth.geometry.computeVertexNormals();
      f.beam.material.opacity = (f.hole === this.hole ? 0.07 : 0.03) + Math.sin(t * 2) * 0.015;
    }
    if (this.waterNormal) { this.waterNormal.offset.x = t * 0.01; this.waterNormal.offset.y = t * 0.006; }
    if (this.pondNormal) { this.pondNormal.offset.x = t * 0.03; this.pondNormal.offset.y = -t * 0.02; }
    if (this.lavaTex) { this.lavaTex.offset.x = t * 0.004; this.lavaTex.offset.y = Math.sin(t * 0.2) * 0.02; this.ground.material.emissiveIntensity = 0.78 + Math.sin(t * 1.3) * 0.1; }
    if (this.mats) { this.mats.boost.map.offset.y = -t * 1.5; this.mats.conveyor.map.offset.y = t * 1.6; }
    for (const l of this.pointPool) if (l.userData.base) l.intensity = l.userData.base * (0.9 + Math.sin(t * 11 + l.id) * 0.05 + Math.sin(t * 5.7 + l.id * 3) * 0.05);
    if (this.sky) this.sky.position.copy(this.camera.position);   // le ciel reste centré sur la caméra, où qu'on soit sur la carte
    if (this.follow && focus) this.followFocus(focus);
    this.emitAmbient(dt, focus);
    this.parts.update(dt); this.partsN.update(dt); this.petals.update(dt);
    this.updateTrails();
  }
  /** Le drapeau s'efface quand la balle approche (pour voir le trou) */
  flagFade(hole, dist) {
    for (const f of this.flags) if (f.hole === hole) { const a = Math.max(0.12, Math.min(1, (dist - 1.2) / 2.5)); f.mats.forEach((m) => { m.opacity = a; m.depthWrite = a > 0.95; }); }
  }
  /** Caméra : recule si un mur se trouve entre la cible et la caméra */
  camClip(target, desired) {
    const dir = desired.clone().sub(target), len = dir.length(); if (len < 1e-3) return desired;
    dir.divideScalar(len);
    _ray.set(target, dir); _ray.far = len;
    const meshes = this.camMeshes.filter((c) => c.hole === this.hole).map((c) => c.m);
    const hit = _ray.intersectObjects(meshes, false)[0];
    if (hit && hit.distance < len) return target.clone().addScaledVector(dir, Math.max(0.35, hit.distance - 0.25));
    return desired;
  }
  project(p) { _v.set(p[0], p[1], p[2]).project(this.camera); return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2, front: _v.z < 1 && _v.z > -1 }; }
  render() {
    if (this.quality === 'low' || !this.composer) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
}
const _m4 = new THREE.Matrix4(), _v = new V3(), _ray = new THREE.Raycaster();
