// Les avions de Dogfight 3D : F-16 et F-22 (Sketchfab), et les autres tirés de STL de Thingiverse par
// tools/avions-dogfight.mjs ; chargés une fois, clonés par joueur, avec un modèle très simple au loin, reflets du ciel,
// flamme de postcombustion, éclair du canon et couleur d'escadron.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

// fins et tips : sommet des dérives et bouts d'ailes, relevés sur les modèles
// nozzles : centre de chaque tuyère, un peu à l'intérieur pour que la flamme en sorte, et demi-largeur, demi-hauteur de son ouverture
const FILES = {
  f16: { url: 'f-16.glb', len: 15.09, fins: [[0, 2.47, -6.9]], tip: [4.66, -0.66, -2.4], nozzles: [[0, -0.7, -6.85, 0.34, 0.34]] },
  f22: { url: 'f-22.glb', len: 18.99, fins: [[2.93, 1.93, -5.55], [-2.93, 1.93, -5.55]], tip: [6.7, -1.18, -3.7], nozzles: [[0.65, -1.1, -6.85, 0.42, 0.14], [-0.65, -1.1, -6.85, 0.42, 0.14]] },
};
// Les modèles venus de STL : déjà à l'échelle, nez sur +Z, gauche sur +X, sans couleurs : le jeu les peint.
// paint : dessus, dessous, et pour un camouflage deux teintes de plus ; fin : la couleur d'escadron au-dessus de fin[0]
// (sur les gros porteurs, une bande entre fin[0] et fin[1], à moins de fin[2] de l'axe) ; tip : et au-delà de cet écart
// de l'axe (bouts d'ailes) ; win : pare-brise peint, un bandeau [hauteur, début en z, demi-largeur, demi-hauteur] ;
// props : hélices [x, y, z, rayon, sens]
const pair = (x, y, z, r) => [[x, y, z, r, r], [-x, y, z, r, r]];
const STL = {
  rafale: { len: 15.27, paint: [0x67737f, 0x8a949e], fin: [2.5], tip: 5, nozzles: pair(0.57, -0.1, -6.75, 0.36), gun: [-0.75, -0.45, 1.5] },
  su35: { len: 21.9, paint: [0x7d91a3, 0xa8b6c1, 0x4f6c88, 0x667a8b], fin: [2.9], tip: 6.8, nozzles: pair(1.18, -0.47, -9.3, 0.4), gun: [-1.1, 0, 3.5] },
  f18: { len: 18.31, paint: [0x66707a, 0x9ca3aa], fin: [2], tip: 5.9, nozzles: pair(0.48, -0.3, -8.2, 0.4), gun: [0, 0.2, 8.4] },
  a10: { len: 16.26, paint: [0x596064, 0x7c8388], fin: [1.7], tip: 8.2, nozzles: pair(1.46, 0.65, -4.85, 0.42), gun: [0.07, -0.74, 8.3] },
};
const CARGO = {
  c17: { len: 53.04, paint: [0x5d6469, 0x6b7277], fin: [9.5, 11, 1], win: [2.4, 23.7, 1.9, 0.32] },
  a400m: { len: 45.1, paint: [0x667075, 0x7a8287], fin: [6.8, 8.2, 1], win: [0.95, 20.2, 1.8, 0.3],
    props: [[6.6, 1.06, 10.7, 2.65, -1], [-6.6, 1.06, 10.7, 2.65, 1], [12.6, 0.9, 9.4, 2.65, 1], [-12.6, 0.9, 9.4, 2.65, -1]] },
};
// La bouche du canon, relevée sur les modèles : à gauche du fuselage sur le F-16, à droite sur le F-22
export const GUNS = { f16: [0.52, 0.1, 3], f22: [-0.58, -0.2, 4], cargo: [0, 0, 0], ...Object.fromEntries(Object.entries(STL).map(([k, d]) => [k, d.gun])) };
const DEFS = { ...FILES, ...STL };
export const planeLength = (type) => (DEFS[type] || FILES.f16).len;
const FAR_LOD = 480;   // au-delà : modèle simple
const templates = {};
let skyEnv = null, glassMat = null, metalMat = null;

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

// Les modèles venus de STL : positions quantifiées sur 16 bits, remises en mètres une fois pour toutes ; trois maillages,
// la peau (peinte par avion), la verrière et le métal des tuyères (partagés)
function prepareSTL(gltf) {
  const root = new THREE.Group(), v = new THREE.Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, f = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray(f, i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(f, 3)); g.setAttribute('normal', o.geometry.attributes.normal); g.setIndex(o.geometry.index); g.computeBoundingSphere();
    const kind = o.material.name, m = new THREE.Mesh(g, kind === 'glass' ? glassMat : kind === 'metal' ? metalMat : null);
    m.name = kind; root.add(m);
  });
  return root;
}

export function loadPlanes(env, onProgress) {
  skyEnv = env;
  glassMat = new THREE.MeshStandardMaterial({ color: 0x1d2f3f, roughness: 0.06, metalness: 0.9, envMap: env, envMapIntensity: 1.4 });
  metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.45, metalness: 0.8, envMap: env });
  const loader = new GLTFLoader(), files = [...Object.entries(FILES).map(([type, def]) => [type, def.url, (g) => prepare(g, def, env)]),
    ...[...Object.keys(STL), ...Object.keys(CARGO)].map((type) => [type, `avions/${type}.glb`, prepareSTL])];
  return Promise.all(files.map(([type, url, make]) => new Promise((resolve) => {
    loader.load(url, (gltf) => { templates[type] = make(gltf); if (onProgress) onProgress(type); resolve(); }, undefined, (err) => { console.warn(`Modèle ${url} indisponible, modèle simple utilisé :`, err); resolve(); });
  })));
}

// La peinture des modèles venus de STL, faite au pixel près dans leur repère : dessus et dessous, camouflage en taches,
// un peu d'usure, la couleur d'escadron (dérives, bouts d'ailes) et le pare-brise des gros porteurs
const SKIN_GLSL = `uniform vec3 uTop,uUnder,uCamo,uCamo2,uTeam,uFin,uWinR; uniform float uCamoOn,uTip,uPanel; uniform vec4 uWinC; varying vec3 vOP; varying vec3 vON;
float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float paint(out vec3 c){
  vec3 n=normalize(vON),p=vOP,col=uTop;
  if(uCamoOn>.5){ float a=n3(p*.3)*.65+n3(p*.8+7.)*.35,b=n3(p*.26+19.)*.65+n3(p*.7+3.)*.35; col=mix(col,uCamo,smoothstep(.55,.58,a)); col=mix(col,uCamo2,smoothstep(.6,.63,b)); }
  col=mix(col,uUnder,smoothstep(.1,-.35,n.y))*(.94+.1*n3(p*1.7));
  // lignes de panneaux : des cadres en travers et des lisses en long (tous les 1,6 m environ sur un chasseur, plus
  // espacées sur un gros porteur), fines, sans crénelage, et qui s'effacent quand elles deviennent trop serrées à l'écran
  vec3 k=p*vec3(.7,.5,.62)*uPanel,fw=max(fwidth(k),1e-4),e=abs(fract(k+.5)-.5)/fw;
  col*=1.-.2*(1.-min(min(e.x,e.z),1.))*(1.-smoothstep(.08,.25,max(fw.x,fw.z)));
  col=mix(col,uTeam,max(step(uFin.x,p.y)*step(p.y,uFin.y)*step(abs(p.x),uFin.z),step(uTip,abs(p.x))));
  // pare-brise : un bandeau autour du nez, coupé de montants
  float win=uWinC.z*step(abs(p.y-uWinC.x),uWinR.y)*step(uWinC.y,p.z)*step(abs(p.x),uWinR.x)*step(0.,n.z)*step(.12,fract(p.x*1.15+.5));
  c=mix(col,vec3(.02,.03,.04),win); return win;
}`;
function skinMaterial(def, team) {
  const P = def.paint, W = def.win, F = def.fin.length > 1 ? def.fin : [def.fin[0], 1e4, 1e4];
  const U = {
    uTop: { value: new THREE.Color(P[0]) }, uUnder: { value: new THREE.Color(P[1]) }, uCamo: { value: new THREE.Color(P[2] ?? P[0]) }, uCamo2: { value: new THREE.Color(P[3] ?? P[0]) },
    uCamoOn: { value: P.length > 2 ? 1 : 0 }, uPanel: { value: def.len > 30 ? 0.45 : 1 }, uTeam: { value: new THREE.Color(team) }, uFin: { value: new THREE.Vector3(...F) }, uTip: { value: def.tip ?? 1e4 },
    uWinC: { value: new THREE.Vector4(W ? W[0] : 0, W ? W[1] : 0, W ? 1 : 0, 0) }, uWinR: { value: new THREE.Vector3(W ? W[2] : 1, W ? W[3] : 1, 0) },
  };
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25, envMap: skyEnv, envMapIntensity: 0.8 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP=position; vON=normal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${SKIN_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 paintC; float win=paint(paintC); diffuseColor.rgb=paintC;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.08,win);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.85,win);');
  };
  m.customProgramCacheKey = () => 'dogfight-skin';
  return m;
}
// Un modèle venu de STL, cloné, avec sa peau peinte à la couleur de l'escadron
function paintedClone(type, def, team) {
  const tpl = templates[type], skin = skinMaterial(def, team);
  if (!tpl) return { obj: farModel(), skin };
  const obj = tpl.clone(true);
  obj.traverse((o) => { if (o.isMesh && o.name === 'skin') o.material = skin; });
  return { obj, skin };
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

// Les hélices de l'A400M : un disque flou, huit pales et un cône, qui tournent
const bladeGeo = new THREE.BoxGeometry(0.16, 1, 0.05).translate(0, 0.5, 0), spinnerGeo = new THREE.SphereGeometry(0.45, 10, 8).scale(1, 1, 1.6);
function propeller([x, y, z, r, dir]) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.userData.dir = dir;
  g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
  for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(bladeGeo, metalMat); b.scale.y = r * 0.95; b.rotation.z = k * Math.PI / 4; g.add(b); }
  g.add(new THREE.Mesh(spinnerGeo, metalMat));
  return g;
}

// Le transport d'Escorte, C-17 ou A400M selon la route ; une bande de sa dérive à la couleur du camp, ses hélices qui tournent
function buildCargo(color, model) {
  const def = CARGO[model] ? CARGO[model] : CARGO.a400m, type = CARGO[model] ? model : 'a400m', { obj, skin } = paintedClone(type, def, color);
  if (!templates[type]) obj.scale.setScalar(3.5);
  const root = new THREE.Group(), spin = (def.props || []).map(propeller);
  root.add(obj, ...spin);
  return {
    root, type: 'cargo', model, setFiring() {},
    setBoost(on, dt) { for (const g of spin) g.rotation.z += dt * 24 * g.userData.dir; },
    dispose() { skin.dispose(); for (const g of spin) { g.children[0].geometry.dispose(); g.children[0].material.dispose(); } },
  };
}

export function buildPlane(type, color, model) {
  if (type === 'cargo') return buildCargo(color, model);
  if (!DEFS[type]) type = 'f16';
  const def = DEFS[type], root = new THREE.Group(), lod = new THREE.LOD();
  root.add(lod);
  const near = new THREE.Group();
  lod.addLevel(near, 0);
  lod.addLevel(farModel(), FAR_LOD);

  // couleur d'escadron : haut de dérive et bouts d'ailes (peints sur les modèles venus de STL)
  let accent = null;
  if (STL[type]) { const c = paintedClone(type, def, color); near.add(c.obj); accent = c.skin; }
  else {
    const tpl = templates[type] || templates.f16;
    near.add(tpl ? tpl.clone(true) : farModel());
    accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
    for (const f of def.fins) { const fin = new THREE.Mesh(finGeo, accent); fin.position.set(f[0], f[1], f[2]); near.add(fin); }
    for (const s of [-1, 1]) { const tip = new THREE.Mesh(tipGeo, accent); tip.position.set(s * def.tip[0], def.tip[1], def.tip[2]); near.add(tip); }
  }

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
