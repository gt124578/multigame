// Le ciel de Dogfight 3D : dégradé profond, voile clair à l'horizon, cirrus peints, et, en qualité Basse, des cumulus en
// bouffées éclairées (sommets éclatants, dessous gris-bleu). Les nuages viennent du moteur : les mêmes chez tous les joueurs.
// Les nuages en volume (Moyen, Élevé) sont dans clouds.js.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

export const HAZE = new THREE.Color(0xb4c8da);
export const FOG_DENSITY = 0.00008;
// le soleil au sud-est, haut : comme sur la vue satellite des cartes (prise en milieu de matinée), les ombres concordent
export const SUN = new THREE.Vector3(0.48, 0.67, 0.57).normalize();

// L'ombre des nuages sur le sol et la mer : la carte des nuages en volume (clouds.js), lue le long du rayon du soleil
// à la hauteur des bases. Sans nuages en volume (qualité Basse), pas d'ombre.
const blank = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType); blank.needsUpdate = true;
export const cloudShadow = { uCS: { value: blank }, uCSA: { value: new THREE.Vector4(0, 0, 1, 0) }, uCSY: { value: 700 }, blank };
export const CLOUD_SHADOW = `uniform sampler2D uCS; uniform vec4 uCSA; uniform float uCSY;
float cloudShade(vec3 w){ if(uCSA.w<.5) return 1.; vec2 q=(w.xz+uSun.xz*((uCSY-w.y)/uSun.y)-uCSA.xy)*uCSA.z; if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) return 1.;
  vec4 e=texture2D(uCS,q); return 1.-.58*smoothstep(25.,170.,max(e.r-max(e.g,w.y),0.)*min(e.a/110.,1.)); }`;

export const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function tile2D(size, oct = 5, base = 4) {
  const d = new Float32Array(size * size);
  for (let o = 0, f = base, a = 0.5; o < oct; o++, f *= 2, a *= 0.5) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * f, v = y / size * f, i = Math.floor(u), j = Math.floor(v), tx = u - i, ty = v - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const H = (a2, b2) => hash((a2 % f + f) % f + o * 37, (b2 % f + f) % f + o * 91);
    d[y * size + x] += a * (H(i, j) * (1 - sx) * (1 - sy) + H(i + 1, j) * sx * (1 - sy) + H(i, j + 1) * (1 - sx) * sy + H(i + 1, j + 1) * sx * sy);
  }
  return d;
}
let cachedNoise = null;
export const noiseData = () => cachedNoise || (cachedNoise = tile2D(256));
export function noiseTexture() {
  const n = noiseData(), b = new Uint8Array(256 * 256);
  for (let i = 0; i < b.length; i++) b[i] = Math.round(Math.min(1, n[i]) * 255);
  const t = new THREE.DataTexture(b, 256, 256, THREE.RedFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export function buildSky(scene, noiseTex, getCamera) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUN }, uHaze: { value: HAZE }, uN: { value: noiseTex } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_Position.z=gl_Position.w; }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun,uHaze; uniform sampler2D uN; void main(){ vec3 d=normalize(vD); float h=d.y;
      vec3 c=mix(uHaze,vec3(.075,.23,.52),pow(smoothstep(0.,.62,h),.62)); c=mix(c,uHaze*.8,smoothstep(0.,-.12,h));
      float s=max(dot(d,uSun),0.); c+=vec3(1.,.94,.82)*(pow(s,1400.)*7.+pow(s,60.)*.22+pow(s,7.)*.1);
      if(h>0.){ vec2 cp=d.xz/(h+.16); float n=texture2D(uN,cp*vec2(.05,.16)+.13).r*.7+texture2D(uN,cp*vec2(.13,.42)).r*.3; c=mix(c,vec3(.92,.94,.97),smoothstep(.5,.72,n)*smoothstep(.015,.2,h)*.55); }
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  sky.onBeforeRender = () => sky.position.copy(getCamera().position);
  scene.add(sky);
  return sky;
}

function puffTexture() {
  const S = 128, data = new Uint8Array(S * S * 4), nn = tile2D(128, 4, 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * 2 - 1, v = y / S * 2 - 1, r = Math.sqrt(u * u + v * v), n = nn[y * S + x], k = (y * S + x) * 4;
    const a = Math.max(0, Math.min(1, (1 - r) * 3.2 + (n - 0.5) * 2.4 - 0.32));
    data[k] = Math.round(n * 255); data[k + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// Une bouffée par sprite, triées d'arrière en avant quelques fois par seconde. density : part des bouffées affichées (0 à 1)
export function buildClouds(scene, clouds) {
  const items = [];
  for (const c of clouds) {
    if (c.far) continue;
    for (let p = 0, count = 3 + Math.floor(c.R / (c.bank ? 5 : 22)); p < count; p++) {
      const a = hash(c.i, p + 10) * 6.283, rr = Math.sqrt(hash(c.i, p + 50)) * c.R, e = Math.pow(1 - (rr / c.R) * (rr / c.R), c.p), up = Math.pow(hash(c.i, p + 90), 0.8);
      const sz = (c.R * 0.3 + 11) * (0.7 + hash(c.i, p + 130) * 0.9) * (1.15 - up * 0.5), h = e * c.H * up, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr * 0.85, side = (ox * SUN.x + oz * SUN.z) / c.R;
      items.push({ x: c.x + ox, y: c.base + sz * 0.42 + h, z: c.z + oz, s: sz, l: Math.max(0, Math.min(1, 0.22 + 0.72 * (h / c.H) + 0.22 * side)), rot: hash(c.i, p + 170) * 6.283, keep: hash(c.i, p + 210), b: c.base });
    }
  }
  const n = items.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const ip = new Float32Array(n * 4), il = new Float32Array(n * 3);
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(ip, 4)); g.setAttribute('iL', new THREE.InstancedBufferAttribute(il, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uT: { value: puffTexture() }, uHaze: { value: HAZE }, uSun: { value: SUN } },
    vertexShader: `attribute vec4 iP; attribute vec3 iL; uniform vec3 uSun; varying vec2 vU; varying vec2 vQ; varying float vL; varying float vF; varying float vY; varying float vB; varying float vNear; varying vec3 vSun; void main(){ vB=iL.z; vec4 mv=modelViewMatrix*vec4(iP.xyz,1.); float c=cos(iL.y),s=sin(iL.y); vec2 q=position.xy; vec2 r=vec2(q.x*c-q.y*s,q.x*s+q.y*c); mv.xy+=q*iP.w; vU=r*.5+.5; vQ=q; vL=iL.x; vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]),ri=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]); vY=iP.y+(q.x*ri.y+q.y*up.y)*iP.w; vSun=normalize((viewMatrix*vec4(uSun,0.)).xyz); float d=length(mv.xyz); vF=1.-exp(-pow(d*.00024,1.5)); vNear=smoothstep(iP.w*.35,iP.w*1.6,d); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uT; uniform vec3 uHaze; varying vec2 vU; varying vec2 vQ; varying float vL; varying float vF; varying float vY; varying float vB; varying float vNear; varying vec3 vSun; void main(){ vec4 t=texture2D(uT,vU); float b=vB+(t.r-.5)*50.; float a=t.a*smoothstep(b-6.,b+26.,vY)*vNear; if(a<.006)discard; float r2=dot(vQ,vQ); vec3 n=normalize(vec3(vQ,sqrt(max(1.-r2,.04)))); float lam=dot(n,vSun)*.5+.5; lam+=(t.r-.5)*.55; float v=clamp(vL*.52+lam*.66-.1,0.,1.); vec3 shade=vec3(.17,.23,.34),mid=vec3(.5,.56,.66),lit=vec3(1.,.99,.97); vec3 c=v<.5?mix(shade,mid,v*2.):mix(mid,lit,(v-.5)*2.); c=mix(c,uHaze,vF*.9); a*=.92; gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      gl_FragColor=vec4(gl_FragColor.rgb*a,a);
    }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);

  const order = items.map((_, i) => i), dist = new Float32Array(n);
  let frame = 0, shown = n, density = 1;
  const pick = () => { const list = items.map((it, i) => (it.keep <= density ? i : -1)).filter((i) => i >= 0); order.length = 0; order.push(...list); shown = list.length; g.instanceCount = shown; frame = 0; };
  const api = {
    mesh, total: n,
    setDensity(f) { density = f; pick(); },
    setVisible(v) { mesh.visible = v; },
    update(cam) {
      if (frame++ % 20 || !mesh.visible) return;
      const cx = cam.x, cy = cam.y, cz = cam.z;
      for (let i = 0; i < n; i++) { const it = items[i]; dist[i] = (it.x - cx) ** 2 + (it.y - cy) ** 2 + (it.z - cz) ** 2; }
      order.sort((a, b) => dist[b] - dist[a]);
      for (let k = 0; k < shown; k++) { const it = items[order[k]]; ip[k * 4] = it.x; ip[k * 4 + 1] = it.y; ip[k * 4 + 2] = it.z; ip[k * 4 + 3] = it.s; il[k * 3] = it.l; il[k * 3 + 1] = it.rot; il[k * 3 + 2] = it.b; }
      g.attributes.iP.needsUpdate = true; g.attributes.iL.needsUpdate = true;
    },
    dispose() { g.dispose(); mat.dispose(); mat.uniforms.uT.value.dispose(); },
  };
  g.instanceCount = n;
  return api;
}
