// Les avions de Dogfight 3D : F-16 et F-22 chargés une fois, clonés par joueur, avec un modèle très simple au loin,
// reflets du ciel, flamme de postcombustion, éclair du canon et couleur d'escadron.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

// fins et tips : sommet des dérives et bouts d'ailes, relevés sur les modèles
// nozzles : centre de chaque tuyère, un peu à l'intérieur pour que la flamme en sorte, et demi-largeur, demi-hauteur de son ouverture
const FILES = {
  f16: { url: 'f-16.glb', len: 15.09, fins: [[0, 2.47, -6.9]], tip: [4.66, -0.66, -2.4], nozzles: [[0, -0.7, -6.85, 0.34, 0.34]] },
  f22: { url: 'f-22.glb', len: 18.99, fins: [[2.93, 1.93, -5.55], [-2.93, 1.93, -5.55]], tip: [6.7, -1.18, -3.7], nozzles: [[0.65, -1.1, -6.85, 0.42, 0.14], [-0.65, -1.1, -6.85, 0.42, 0.14]] },
};
// La bouche du canon, relevée sur les modèles : à gauche du fuselage sur le F-16, à droite sur le F-22
export const GUNS = { f16: [0.52, 0.1, 3], f22: [-0.58, -0.2, 4], cargo: [0, 0, 0] };
const FAR_LOD = 480;   // au-delà : modèle simple
const templates = {};
let skyEnv = null;

// Les deux modèles viennent de Sketchfab : axe du nez sur +X, envergure sur Z. Une rotation de -90° autour de Y met le nez sur +Z.
function prepare(gltf, def, env) {
  const r = gltf.scene, box = new THREE.Box3().setFromObject(r), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  r.traverse((o) => {
    if (o.name && o.name.includes('landingOn')) o.visible = false;
    if (o.isMesh && o.material) {
      o.material.envMap = env; o.material.envMapIntensity = 1.15;
      if (o.material.name === 'Glass') { o.material.transparent = true; o.material.opacity = 0.55; o.material.roughness = 0.05; o.material.metalness = 0.9; }
      else { o.material.roughness = Math.max(0.42, o.material.roughness ?? 0.5); o.material.metalness = Math.min(0.45, o.material.metalness ?? 0.3); }
    }
  });
  const pivot = new THREE.Group(), s = def.len / sz.x;
  r.rotation.y = -Math.PI / 2; r.scale.setScalar(s); r.position.set(c.z * s, -c.y * s, -c.x * s);
  pivot.add(r);
  return pivot;
}

export function loadPlanes(env, onProgress) {
  skyEnv = env;
  const loader = new GLTFLoader();
  return Promise.all(Object.entries(FILES).map(([type, def]) => new Promise((resolve) => {
    loader.load(def.url, (gltf) => { templates[type] = prepare(gltf, def, env); if (onProgress) onProgress(type); resolve(); }, undefined, (err) => { console.warn(`Modèle ${def.url} indisponible, modèle simple utilisé :`, err); resolve(); });
  })));
}

// Le modèle simple : quelques triangles, partagés entre tous les avions lointains
let farGeo = null, farMat = null;
function farModel() {
  if (!farGeo) {
    const body = new THREE.ConeGeometry(0.8, 15, 5); body.rotateX(Math.PI / 2);
    const wings = new THREE.BufferGeometry();
    wings.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 2, 5, 0, -3, -5, 0, -3, 0, 0, 2, -5, 0, -3, 5, 0, -3, 0, 0, -3, 0, 3, -7, 0, 0, -7, 0, 0, -3, 0, 0, -7, 0, 3, -7], 3));
    wings.setAttribute('normal', new THREE.Float32BufferAttribute(Array(36).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const merged = new THREE.BufferGeometry(), a = body.toNonIndexed(), n = a.attributes.position.count + 12, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    pos.set(a.attributes.position.array); nor.set(a.attributes.normal.array); pos.set(wings.attributes.position.array, a.attributes.position.count * 3); nor.set(wings.attributes.normal.array, a.attributes.position.count * 3);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    farGeo = merged; farMat = new THREE.MeshLambertMaterial({ color: 0x6f7a84, side: THREE.DoubleSide });
  }
  return new THREE.Mesh(farGeo, farMat);
}

// La flamme : des cônes sans fond qui s'estompent vers le bout et sur les bords, et une lueur au fond de la tuyère.
// Le rayon vaut 1 : chaque tuyère les met à l'échelle de son ouverture.
const flameCone = (r, len) => { const g = new THREE.ConeGeometry(r, len, 18, 3, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2); return g; };
const flameGeoA = flameCone(0.72, 2.2), flameGeoB = flameCone(1, 3.8);
const glowGeo = new THREE.CircleGeometry(1, 20); glowGeo.rotateY(Math.PI);
const FLAME_VERTEX = 'varying vec2 vU; varying float vF; void main(){ vU=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vF=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz))); gl_Position=projectionMatrix*mv; }';
const flameMat = (core, tip, gain) => new THREE.ShaderMaterial({
  uniforms: { uCore: { value: new THREE.Color(core) }, uTip: { value: new THREE.Color(tip) }, uGain: { value: gain } },
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexShader: FLAME_VERTEX,
  fragmentShader: 'varying vec2 vU; varying float vF; uniform vec3 uCore,uTip; uniform float uGain; void main(){ float t=vU.y; float k=pow(1.-t,1.4)*pow(vF,.6)*(.86+.14*cos(t*26.))*uGain; gl_FragColor=vec4(mix(uCore,uTip,sqrt(t)),k); }',
});
const flameA = flameMat(0xfff0d8, 0xffa060, 1.15);
const flameB = flameMat(0xffc090, 0xff5a3c, 0.75);
const glowMat = new THREE.ShaderMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexShader: 'varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec2 vU; void main(){ float r=length(vU-.5)*2.; gl_FragColor=vec4(mix(vec3(1.,.92,.78),vec3(1.,.42,.2),r),smoothstep(1.,.35,r)*.95); }',
});
const flashGeo = new THREE.SphereGeometry(0.2, 6, 6);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffea70, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const finGeo = new THREE.BoxGeometry(0.1, 0.2, 1);
const tipGeo = new THREE.BoxGeometry(0.13, 0.08, 1.15);

// Le transport d'Escorte : quatre moteurs à hélices, une aile haute, une grosse dérive. Nez sur +Z, comme les chasseurs
let cargoParts = null;
function cargoGeometry() {
  if (cargoParts) return cargoParts;
  const cyl = (r0, r1, len) => { const g = new THREE.CylinderGeometry(r0, r1, len, 12); g.rotateX(Math.PI / 2); return g; };
  cargoParts = {
    body: cyl(2.7, 2.7, 22), nose: cyl(0.9, 2.7, 5).translate(0, -0.25, 13.5), tail: cyl(2.7, 0.7, 9).translate(0, 0.9, -15.5),
    wing: new THREE.BoxGeometry(42, 0.55, 6).translate(0, 2.7, 2), fin: new THREE.BoxGeometry(0.5, 8.5, 5.5).translate(0, 6, -17.5), stab: new THREE.BoxGeometry(15, 0.4, 3.6).translate(0, 1.4, -18),
    pod: cyl(0.75, 0.95, 4.4), disc: new THREE.CircleGeometry(1.9, 18), glass: new THREE.BoxGeometry(2.8, 0.8, 1.7).translate(0, 1.2, 12.6),
  };
  return cargoParts;
}
function buildCargo(color) {
  const G = cargoGeometry(), root = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xc2c9cf, roughness: 0.6, metalness: 0.1, envMap: skyEnv, envMapIntensity: 0.75 }), band = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0.3 });
  const blade = new THREE.MeshBasicMaterial({ color: 0x20252b, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), dark = new THREE.MeshStandardMaterial({ color: 0x17222e, roughness: 0.2, metalness: 0.5, envMap: skyEnv });
  const add = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); root.add(o); return o; };
  add(G.body, hull); add(G.nose, hull); add(G.tail, hull); add(G.wing, hull); add(G.fin, band); add(G.stab, hull); add(G.glass, dark);
  for (const x of [-14, -7, 7, 14]) { add(G.pod, hull, x, 2.2, 3.8); add(G.disc, blade, x, 2.2, 6.1); }
  return { root, type: 'cargo', setBoost() {}, setFiring() {}, dispose() { hull.dispose(); band.dispose(); blade.dispose(); dark.dispose(); } };
}

export function buildPlane(type, color) {
  if (type === 'cargo') return buildCargo(color);
  const def = FILES[type] || FILES.f16, tpl = templates[type] || templates.f16;
  const root = new THREE.Group(), lod = new THREE.LOD();
  root.add(lod);
  const near = new THREE.Group();
  if (tpl) near.add(tpl.clone(true));
  else near.add(farModel());
  lod.addLevel(near, 0);
  lod.addLevel(farModel(), FAR_LOD);

  // couleur d'escadron : haut de dérive et bouts d'ailes
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
  for (const f of def.fins) { const fin = new THREE.Mesh(finGeo, accent); fin.position.set(f[0], f[1], f[2]); near.add(fin); }
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(tipGeo, accent); tip.position.set(s * def.tip[0], def.tip[1], def.tip[2]); near.add(tip); }

  const flames = def.nozzles.map((n) => {
    const flame = new THREE.Group(); flame.position.set(n[0], n[1], n[2]); flame.scale.set(n[3], n[4], 1); flame.visible = false;
    flame.add(new THREE.Mesh(flameGeoA, flameA), new THREE.Mesh(flameGeoB, flameB), new THREE.Mesh(glowGeo, glowMat));
    root.add(flame);
    return flame;
  });
  const flash = new THREE.Mesh(flashGeo, flashMat); flash.position.fromArray(GUNS[type] || GUNS.f16); flash.visible = false; root.add(flash);

  let flashT = 0, burn = 0;
  return {
    root, type,
    // la postcombustion s'allume en un quart de seconde et s'éteint un peu plus vite
    setBoost(on, dt) {
      burn += ((on ? 1 : 0) - burn) * Math.min(1, dt * (on ? 9 : 13));
      for (const f of flames) { f.visible = burn > 0.03; f.scale.z = burn * (0.85 + Math.random() * 0.3); }
    },
    setFiring(on, dt) { if (on) flashT = 0.03; else if (flashT > 0) flashT -= dt; flash.visible = flashT > 0; },
    dispose() { accent.dispose(); },
  };
}

// Environnement pour les reflets : le ciel, une fois pour toutes
export function makeEnvironment(renderer, skyMesh) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene(), copy = new THREE.Mesh(skyMesh.geometry, skyMesh.material);
  s.add(copy);
  const rt = pm.fromScene(s, 0, 1, 7000);
  pm.dispose();
  return rt.texture;
}
