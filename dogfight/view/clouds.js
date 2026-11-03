// Les nuages en volume de Dogfight 3D (qualités Moyen et Élevé). Une marche de rayons, à basse définition, dans les dômes
// des nuages du moteur (ceux où l'on se cache), creusés par deux bruits 3D : Perlin-Worley pour les bourgeons, Worley
// pour les bords effilochés. Le soleil les éclaire (diffusion multiple approchée, lobe avant pour le liseré argenté),
// le ciel aussi (plus au sommet qu'à la base). Chaque image ne tire qu'une partie des échantillons : l'image d'avant,
// reprojetée, lisse le reste. Le relief arrête les rayons (les sommets percent la mer de nuages), et la composition
// écrit la profondeur des nuages : avions, fumées et traçantes passent devant ou derrière.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { SUN, HAZE, FOG_DENSITY, cloudShadow } from './sky.js';
import { CLOUD_FAR } from '../engine/world.js';

const half = THREE.DataUtils.toHalfFloat;
const rnd = (k, s) => { let h = Math.imul(k ^ Math.imul(s + 1, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------- bruits 3D périodiques
// Worley : 1 sur un point tiré au hasard dans chaque cellule (F³ cellules), 0 à une cellule de là
function worley(F, seed) {
  const pts = new Float32Array(F * F * F * 3);
  for (let k = 0; k < F * F * F; k++) for (let a = 0; a < 3; a++) pts[k * 3 + a] = rnd(k, seed * 3 + a);
  return (x, y, z) => {
    const px = x * F, py = y * F, pz = z * F, ci = Math.floor(px), cj = Math.floor(py), ck = Math.floor(pz);
    let m = 9;
    for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const i = ci + a, j = cj + b, k = ck + c, w = (((i % F) + F) % F) + (((j % F) + F) % F) * F + (((k % F) + F) % F) * F * F;
      const dx = i + pts[w * 3] - px, dy = j + pts[w * 3 + 1] - py, dz = k + pts[w * 3 + 2] - pz, d = dx * dx + dy * dy + dz * dz;
      if (d < m) m = d;
    }
    return Math.max(0, 1 - Math.sqrt(m));
  };
}
// Perlin : gradients au hasard sur une grille de F³ points, entre -1 et 1 environ
function perlin(F, seed) {
  const g = new Float32Array(F * F * F * 3);
  for (let k = 0; k < F * F * F; k++) {
    const u = rnd(k, seed) * 2 - 1, a = rnd(k, seed + 1) * 6.2832, s = Math.sqrt(1 - u * u);
    g[k * 3] = s * Math.cos(a); g[k * 3 + 1] = s * Math.sin(a); g[k * 3 + 2] = u;
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z) => {
    const px = x * F, py = y * F, pz = z * F, i0 = Math.floor(px), j0 = Math.floor(py), k0 = Math.floor(pz), fx = px - i0, fy = py - j0, fz = pz - k0;
    const ux = fade(fx), uy = fade(fy), uz = fade(fz);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const a = c & 1, b = (c >> 1) & 1, e = (c >> 2) & 1, w = ((i0 + a) % F) + ((j0 + b) % F) * F + ((k0 + e) % F) * F * F;
      r += (g[w * 3] * (fx - a) + g[w * 3 + 1] * (fy - b) + g[w * 3 + 2] * (fz - e)) * (a ? ux : 1 - ux) * (b ? uy : 1 - uy) * (e ? uz : 1 - uz);
    }
    return r;
  };
}
function volume(n, f) {
  const v = new Float32Array(n * n * n);
  for (let z = 0, k = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++, k++) v[k] = f(x / n, y / n, z / n);
  // étalé du 2e au 98e centile : tout l'écart sert
  const sorted = v.slice().sort(), lo = sorted[Math.floor(v.length * 0.02)], hi = sorted[Math.floor(v.length * 0.98)], b = new Uint8Array(n * n * n);
  for (let k = 0; k < b.length; k++) b[k] = Math.round(Math.min(1, Math.max(0, (v[k] - lo) / (hi - lo))) * 255);
  const t = new THREE.Data3DTexture(b, n, n, n);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
// la forme : des boules de Worley sur trois tailles (les bourgeons du chou-fleur), un peu de Perlin pour casser leur régularité
export function shapeNoise(n = 64) {
  const p1 = perlin(4, 11), p2 = perlin(8, 13), w1 = worley(5, 1), w2 = worley(10, 2), w3 = worley(20, 3);
  return volume(n, (x, y, z) => (p1(x, y, z) * 0.7 + p2(x, y, z) * 0.3) * 0.35 + w1(x, y, z) * 0.6 + w2(x, y, z) * 0.28 + w3(x, y, z) * 0.12);
}
// les bords : un Worley plus fin
export function detailNoise(n = 32) {
  const w1 = worley(2, 4), w2 = worley(4, 5), w3 = worley(8, 6);
  return volume(n, (x, y, z) => w1(x, y, z) * 0.625 + w2(x, y, z) * 0.25 + w3(x, y, z) * 0.125);
}

// ---------------------------------------------------------------- les dômes du moteur, mis à plat
// Carte de N × N cases sur le carré (x0, z0, size) : sommet (m), base (m), distance au nuage le plus proche (m),
// et, dans un nuage, distance à son bord (m)
export function envelope(clouds, x0, z0, size, N) {
  const top = new Float32Array(N * N), base = new Float32Array(N * N).fill(-1), px = size / N;
  for (const c of clouds) {
    const r = c.R * 1.3, i0 = Math.max(0, Math.floor((c.x - r - x0) / px)), i1 = Math.min(N - 1, Math.floor((c.x + r - x0) / px));
    const j0 = Math.max(0, Math.floor((c.z - r - z0) / px)), j1 = Math.min(N - 1, Math.floor((c.z + r - z0) / px)), R2 = c.R * c.R;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = x0 + (i + 0.5) * px - c.x, dz = z0 + (j + 0.5) * px - c.z, d2 = (dx * dx + dz * dz) / R2, k = j * N + i;
      if (d2 < 1) { const t = c.base + c.H * Math.pow(1 - d2, c.p); if (t > top[k]) { top[k] = t; base[k] = c.base; } }
      else if (d2 < 1.69 && base[k] < 0) base[k] = c.base;   // la base déborde : le bord d'un nuage reste à plat
    }
  }
  // distances (chanfrein) jusqu'au nuage le plus proche, pour sauter le vide, et jusqu'au bord, pour effilocher les flancs
  const out = chamfer(N, (k) => top[k] > 0), inner = chamfer(N, (k) => top[k] <= 0);
  const data = new Uint16Array(N * N * 4);
  for (let k = 0; k < N * N; k++) { data[k * 4] = half(top[k]); data[k * 4 + 1] = half(Math.max(0, base[k])); data[k * 4 + 2] = half(Math.min(60000, Math.max(0, out[k] - 1.5) * px)); data[k * 4 + 3] = half(Math.min(60000, inner[k] * px)); }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
function chamfer(N, seed) {
  const D = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) D[k] = seed(k) ? 0 : 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let d = D[k];
    if (i > 0) d = Math.min(d, D[k - 1] + 1); if (j > 0) d = Math.min(d, D[k - N] + 1);
    if (i > 0 && j > 0) d = Math.min(d, D[k - N - 1] + 1.414); if (i < N - 1 && j > 0) d = Math.min(d, D[k - N + 1] + 1.414);
    D[k] = d;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let d = D[k];
    if (i < N - 1) d = Math.min(d, D[k + 1] + 1); if (j < N - 1) d = Math.min(d, D[k + N] + 1);
    if (i < N - 1 && j < N - 1) d = Math.min(d, D[k + N + 1] + 1.414); if (i > 0 && j < N - 1) d = Math.min(d, D[k + N - 1] + 1.414);
    D[k] = d;
  }
  return D;
}
// le relief, pour arrêter les rayons
function heightTexture(h, n) {
  const d = new Uint16Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = half(Math.max(-50, h[k]));
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- shaders
const QUAD_VERTEX = 'varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }';
// sortie : lumière du soleil, lumière du ciel (déjà pondérées par l'opacité), distance du nuage, opacité
const MARCH = (lo, hi) => `
uniform sampler3D uShape,uDetail; uniform sampler2D uEnv,uEnvF,uHgt,uHgtF;
uniform vec3 uEA,uEFA,uHA,uHFA,uCam,uSun,uWind; uniform mat4 uInv; uniform float uFrame; uniform int uSteps,uLight; uniform vec2 uMS;
varying vec2 vUv;
#define LO ${lo.toFixed(1)}
#define HI ${hi.toFixed(1)}
#define SIGMA .075
#define FAR ${(CLOUD_FAR * 1.35).toFixed(1)}
bool inside(vec2 q){ return q.x>0.&&q.y>0.&&q.x<1.&&q.y<1.; }
vec4 env(vec2 xz){ vec2 q=(xz-uEA.xy)*uEA.z; if(inside(q)) return texture(uEnv,q); q=(xz-uEFA.xy)*uEFA.z; return inside(q)?texture(uEnvF,q):vec4(0.,0.,4000.,0.); }
float ground(vec2 xz){ vec2 q=(xz-uHA.xy)*uHA.z; if(inside(q)) return texture(uHgt,q).r; q=(xz-uHFA.xy)*uHFA.z; return inside(q)?texture(uHgtF,q).r:-50.; }
float dens(vec3 p,vec4 e,bool fine){
  if(p.y>=e.x||p.y<=e.y) return 0.;
  float n=texture(uShape,(p+uWind)*(1./1000.)).r, th=e.x-e.y;
  float v=min(clamp((e.x-p.y)/clamp(th*.4,60.,900.),0.,1.),clamp(e.w/340.,0.,1.))*clamp((p.y-e.y-(1.-n)*min(110.,th*.2))/50.,0.,1.);
  float d=clamp((n+v*1.25-1.)*3.2,0.,1.);
  if(!fine||d<=0.) return d;
  float h=(p.y-e.y)/max(th,1.), dn=texture(uDetail,(p+uWind*1.7)*(1./230.)).r, m=mix(1.-dn,dn,clamp(h*5.,0.,1.))*.45;
  return clamp((d-m)/(1.-m),0.,1.);
}
float HG(float c,float g){ float g2=g*g; return (1.-g2)/pow(1.+g2-2.*g*c,1.5); }
void main(){
  vec4 f=uInv*vec4(vUv*2.-1.,1.,1.); vec3 rd=normalize(f.xyz/f.w-uCam),ro=uCam;
  float t0,t1;
  if(abs(rd.y)<1e-5){ if(ro.y<LO||ro.y>HI){ gl_FragColor=vec4(0.,0.,FAR,0.); return; } t0=0.; t1=FAR; }
  else { float a=(LO-ro.y)/rd.y,b=(HI-ro.y)/rd.y; t0=max(min(a,b),0.); t1=min(max(a,b),FAR); }
  if(t1<=t0){ gl_FragColor=vec4(0.,0.,FAR,0.); return; }
  float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy+5.588238*uFrame,vec2(.06711056,.00583715))));
  float hl=max(length(rd.xz),.02), cs=dot(rd,uSun), T=1.,S=0.,Am=0.,dep=-1.,first=-1.;
  float ph0=mix(HG(cs,.62),HG(cs,-.28),.32), ph1=mix(HG(cs,.31),HG(cs,-.14),.32), ph2=mix(HG(cs,.15),HG(cs,-.07),.32);
  float t=t0+ign*max(10.,t0*.01);
  for(int i=0;i<400;i++){
    if(i>=uSteps||t>t1) break;
    vec3 p=ro+rd*t;
    if(p.y<ground(p.xz)) break;
    vec4 e=env(p.xz); float dt=max(9.,t*.0095);
    if(e.x<=0.){ t+=max(e.z/hl,dt*1.5)+ign*dt; continue; }
    float d=dens(p,e,t<11000.)*smoothstep(5.,45.,t);
    if(d>.002){
      if(first<0.) first=t;
      float tau=0.,s=12.; vec3 q=p;
      for(int j=0;j<8;j++){ if(j>=uLight) break; q+=uSun*s; tau+=dens(q,env(q.xz),j<2)*s; s*=1.8; }
      tau*=SIGMA;
      float sun=ph0*exp(-tau)+uMS.x*ph1*exp(-tau*.3)+uMS.y*ph2*exp(-tau*.1);
      sun*=1.-.55*exp(-d*7.)*(1.-.5*max(cs,0.));                     // poudre : les bords minces, moins remplis de lumière
      float h=clamp((p.y-e.y)/max(e.x-e.y,1.),0.,1.), amb=mix(.55,1.,pow(h,.6));
      float a=1.-exp(-d*SIGMA*dt);
      S+=T*a*sun; Am+=T*a*amb; T*=1.-a;
      if(dep<0.&&T<.72) dep=t;
      if(T<.012) break;
    }
    t+=dt;
  }
  float al=1.-T;
  gl_FragColor=vec4(S,Am,al<.004?FAR:(dep>0.?dep:max(first,0.)),al);
}`;
// reprojette l'image d'avant et la mêle à la nouvelle, bornée par le voisinage (pas de traînées)
const RESOLVE = `uniform sampler2D uCur,uHist; uniform mat4 uPrev,uInv; uniform vec3 uCam; uniform float uBlend; varying vec2 vUv;
void main(){
  vec2 px=1./vec2(textureSize(uCur,0)); vec4 c=texture(uCur,vUv),mn=c,mx=c;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec4 s=texture(uCur,vUv+vec2(i,j)*px); mn=min(mn,s); mx=max(mx,s); }
  vec4 f=uInv*vec4(vUv*2.-1.,1.,1.); vec3 rd=normalize(f.xyz/f.w-uCam);
  vec4 pc=uPrev*vec4(uCam+rd*c.b,1.); vec2 pu=pc.xy/pc.w*.5+.5;
  if(uBlend>=1.||pc.w<=0.||pu.x<0.||pu.y<0.||pu.x>1.||pu.y>1.){ gl_FragColor=c; return; }
  vec4 h=clamp(texture(uHist,pu),mn,mx);
  gl_FragColor=mix(h,c,uBlend);
}`;
// la composition, à pleine définition : couleur, voile de l'air, et la profondeur du nuage
const COMPOSE = (depthOnly) => `uniform sampler2D uT; uniform mat4 uVP,uInv; uniform vec3 uCam,uSunC,uAmbT,uAmbB,uHaze; uniform float uFog; varying vec2 vUv;
void main(){
  vec4 s=texture(uT,vUv);
  if(s.a<${depthOnly ? '.5' : '.004'}) discard;
  vec4 f=uInv*vec4(vUv*2.-1.,1.,1.); vec3 rd=normalize(f.xyz/f.w-uCam);
  vec4 cp=uVP*vec4(uCam+rd*s.b,1.); gl_FragDepth=clamp(cp.z/cp.w*.5+.5,0.,.9999999);
  ${depthOnly ? 'gl_FragColor=vec4(0.);' : `
  vec3 c=(s.r*uSunC+s.g*mix(uAmbB,uAmbT,clamp(.5+rd.y*2.,0.,1.)))/s.a;
  float fg=1.-exp(-pow(uFog*s.b,2.)); c=mix(c,uHaze,fg);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor=vec4(gl_FragColor.rgb*s.a,s.a);`}
}`;

// ---------------------------------------------------------------- le tout
// opts : scale (définition de la marche), steps (pas au plus), light (pas vers le soleil)
export function buildVolumetric(renderer, scene, world, opts = {}) {
  const A = world.archi, clouds = world.clouds;
  let lo = Infinity, hi = 0;
  for (const c of clouds) { lo = Math.min(lo, c.base); hi = Math.max(hi, c.base + c.H); }
  lo -= 5; hi += 5;
  const nearX = A.x0 - 1500, nearZ = A.z0 - 1500, nearS = A.size + 3000, farS = CLOUD_FAR * 2 + 3000, farX = A.zone.x - farS / 2, farZ = A.zone.z - farS / 2;
  const tex = {
    shape: shapeNoise(64), detail: detailNoise(32),
    env: envelope(clouds, nearX, nearZ, nearS, 1024), envF: envelope(clouds.filter((c) => c.R > 60), farX, farZ, farS, 512),
    hgt: heightTexture(A.h, A.n), hgtF: heightTexture(A.far.h, A.far.n),
  };
  const F = A.far;
  const U = {
    uShape: { value: tex.shape }, uDetail: { value: tex.detail }, uEnv: { value: tex.env }, uEnvF: { value: tex.envF }, uHgt: { value: tex.hgt }, uHgtF: { value: tex.hgtF },
    uEA: { value: new THREE.Vector3(nearX, nearZ, 1 / nearS) }, uEFA: { value: new THREE.Vector3(farX, farZ, 1 / farS) },
    uHA: { value: new THREE.Vector3(A.x0 - A.step / 2, A.z0 - A.step / 2, 1 / (A.n * A.step)) }, uHFA: { value: new THREE.Vector3(F.x0 - F.step / 2, F.z0 - F.step / 2, 1 / (F.n * F.step)) },
    uCam: { value: new THREE.Vector3() }, uSun: { value: SUN }, uWind: { value: new THREE.Vector3() }, uInv: { value: new THREE.Matrix4() }, uFrame: { value: 0 },
    uSteps: { value: 128 }, uLight: { value: 5 }, uMS: { value: new THREE.Vector2(0.4, 0.22) },
  };
  const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = (material) => { const m = new THREE.Mesh(tri, material); m.frustumCulled = false; return m; };
  const march = quad(new THREE.ShaderMaterial({ uniforms: U, vertexShader: QUAD_VERTEX, fragmentShader: MARCH(lo, hi), depthTest: false, depthWrite: false }));
  const RU = { uCur: { value: null }, uHist: { value: null }, uPrev: { value: new THREE.Matrix4() }, uInv: U.uInv, uCam: U.uCam, uBlend: { value: 1 } };
  const resolve = quad(new THREE.ShaderMaterial({ uniforms: RU, vertexShader: QUAD_VERTEX, fragmentShader: RESOLVE, depthTest: false, depthWrite: false }));
  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const cur = new THREE.WebGLRenderTarget(2, 2, rtOpts), hist = [new THREE.WebGLRenderTarget(2, 2, rtOpts), new THREE.WebGLRenderTarget(2, 2, rtOpts)];
  const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), qs = new THREE.Scene();

  // la composition vit dans la scène : juste après les objets opaques, avant les fumées, traçantes et verrières
  const CU = {
    uT: { value: hist[0].texture }, uVP: { value: new THREE.Matrix4() }, uInv: U.uInv, uCam: U.uCam, uFog: { value: FOG_DENSITY }, uHaze: { value: HAZE },
    uSunC: { value: new THREE.Vector3(1.0, 0.95, 0.88).multiplyScalar(0.8) }, uAmbT: { value: new THREE.Vector3(0.5, 0.6, 0.78).multiplyScalar(0.55) }, uAmbB: { value: new THREE.Vector3(0.44, 0.47, 0.52).multiplyScalar(0.72) },
  };
  const blend = { transparent: true, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
  const compose = quad(new THREE.ShaderMaterial({ uniforms: CU, vertexShader: QUAD_VERTEX, fragmentShader: COMPOSE(false), ...blend }));
  const depth = quad(new THREE.ShaderMaterial({ uniforms: CU, vertexShader: QUAD_VERTEX, fragmentShader: COMPOSE(true), transparent: true, colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.LessEqualDepth }));
  compose.renderOrder = -2; depth.renderOrder = -1;
  scene.add(compose, depth);
  // l'ombre sur le sol : la carte proche, lue à la hauteur courante des bases
  const bases = clouds.filter((c) => !c.far).map((c) => c.base).sort((a, b) => a - b);
  const shadow = (on) => { cloudShadow.uCS.value = on ? tex.env : cloudShadow.blank; cloudShadow.uCSA.value.set(nearX, nearZ, 1 / nearS, on ? 1 : 0); cloudShadow.uCSY.value = bases[bases.length >> 1] + 120; };
  shadow(true);

  const size = new THREE.Vector2(), vp = new THREE.Matrix4(), prevVP = new THREE.Matrix4(), prevCam = new THREE.Vector3();
  let scale = 0.33, frame = 0, ping = 0, fresh = true, active = true;
  const api = {
    setOptions({ scale: s = 0.33, steps = 128, light = 5 } = {}) { scale = s; U.uSteps.value = steps; U.uLight.value = light; api.resize(); },
    setActive(v) { active = v; compose.visible = depth.visible = v; fresh = true; shadow(v); },
    get active() { return active; },
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(2, Math.round(size.x * scale)), h = Math.max(2, Math.round(size.y * scale));
      cur.setSize(w, h); hist[0].setSize(w, h); hist[1].setSize(w, h); fresh = true;
    },
    // avant le rendu de la scène : la marche, puis le mélange avec l'image d'avant
    pre(camera, time) {
      if (!active) return;
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      U.uInv.value.copy(vp).invert(); U.uCam.value.copy(camera.position); CU.uVP.value.copy(vp);
      U.uWind.value.set(time * 4, time * 0.6, time * 2.5); U.uFrame.value = frame++ % 64;
      if (prevCam.distanceToSquared(camera.position) > 300 * 300) fresh = true;
      const prevTarget = renderer.getRenderTarget(), auto = renderer.autoClear;
      renderer.autoClear = true;
      qs.add(march); renderer.setRenderTarget(cur); renderer.render(qs, ocam); qs.remove(march);
      const out = hist[ping], last = hist[1 - ping];
      RU.uCur.value = cur.texture; RU.uHist.value = last.texture; RU.uPrev.value.copy(prevVP); RU.uBlend.value = fresh ? 1 : 0.14;
      qs.add(resolve); renderer.setRenderTarget(out); renderer.render(qs, ocam); qs.remove(resolve);
      renderer.setRenderTarget(prevTarget); renderer.autoClear = auto;
      CU.uT.value = out.texture; ping = 1 - ping; fresh = false;
      prevVP.copy(vp); prevCam.copy(camera.position);
    },
    dispose() {
      shadow(false); scene.remove(compose, depth);
      for (const t of Object.values(tex)) t.dispose();
      cur.dispose(); hist[0].dispose(); hist[1].dispose(); tri.dispose();
      for (const m of [march, resolve, compose, depth]) m.material.dispose();
    },
  };
  api.setOptions(opts);
  return api;
}
