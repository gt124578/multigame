// Le ciel de Dogfight 3D : dégradé profond, voile clair à l'horizon, cirrus peints, et des cumulus en bouffées éclairées
// (sommets éclatants, dessous gris-bleu). Les nuages viennent du moteur : les mêmes chez tous les joueurs.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { CLOUD_BASE } from '../engine/world.js';

export const HAZE = new THREE.Color(0xb4c8da);
export const FOG_DENSITY = 0.00024;
export const SUN = new THREE.Vector3(0.72, 0.5, -0.32).normalize();

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
  const add = (c, count) => {
    for (let p = 0; p < count; p++) {
      const a = hash(c.i, p + 10) * 6.283, rr = Math.sqrt(hash(c.i, p + 50)) * c.R, e = 1 - (rr / c.R) * (rr / c.R), up = Math.pow(hash(c.i, p + 90), 0.8);
      const sz = (c.R * 0.15 + 11) * (0.7 + hash(c.i, p + 130) * 0.9) * (1.15 - up * 0.5), h = e * c.H * up, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr * 0.85, side = (ox * SUN.x + oz * SUN.z) / c.R;
      items.push({ x: c.x + ox, y: CLOUD_BASE + sz * 0.42 + h, z: c.z + oz, s: sz, l: Math.max(0, Math.min(1, 0.22 + 0.72 * (h / c.H) + 0.22 * side)), rot: hash(c.i, p + 170) * 6.283, keep: hash(c.i, p + 210) });
    }
  };
  for (const c of clouds) add(c, c.bank ? 60 + Math.floor(c.R / 5) : 10 + Math.floor(c.R / 7));
  const n = items.length;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const ip = new Float32Array(n * 4), il = new Float32Array(n * 2);
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(ip, 4)); g.setAttribute('iL', new THREE.InstancedBufferAttribute(il, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uT: { value: puffTexture() }, uHaze: { value: HAZE }, uSun: { value: SUN }, uBase: { value: CLOUD_BASE } },
    vertexShader: `attribute vec4 iP; attribute vec2 iL; uniform vec3 uSun; varying vec2 vU; varying vec2 vQ; varying float vL; varying float vF; varying float vY; varying float vNear; varying vec3 vSun; void main(){ vec4 mv=modelViewMatrix*vec4(iP.xyz,1.); float c=cos(iL.y),s=sin(iL.y); vec2 q=position.xy; vec2 r=vec2(q.x*c-q.y*s,q.x*s+q.y*c); mv.xy+=q*iP.w; vU=r*.5+.5; vQ=q; vL=iL.x; vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]),ri=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]); vY=iP.y+(q.x*ri.y+q.y*up.y)*iP.w; vSun=normalize((viewMatrix*vec4(uSun,0.)).xyz); float d=length(mv.xyz); vF=1.-exp(-pow(d*.00024,1.5)); vNear=smoothstep(iP.w*.35,iP.w*1.6,d); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uT; uniform vec3 uHaze; uniform float uBase; varying vec2 vU; varying vec2 vQ; varying float vL; varying float vF; varying float vY; varying float vNear; varying vec3 vSun; void main(){ vec4 t=texture2D(uT,vU); float b=uBase+(t.r-.5)*50.; float a=t.a*smoothstep(b-6.,b+26.,vY)*vNear; if(a<.006)discard; float r2=dot(vQ,vQ); vec3 n=normalize(vec3(vQ,sqrt(max(1.-r2,.04)))); float lam=dot(n,vSun)*.5+.5; lam+=(t.r-.5)*.55; float v=clamp(vL*.52+lam*.66-.1,0.,1.); vec3 shade=vec3(.17,.23,.34),mid=vec3(.5,.56,.66),lit=vec3(1.,.99,.97); vec3 c=v<.5?mix(shade,mid,v*2.):mix(mid,lit,(v-.5)*2.); c=mix(c,uHaze,vF*.9); a*=.92; gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      gl_FragColor=vec4(gl_FragColor.rgb*a,a);
    }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);

  const order = items.map((_, i) => i), dist = new Float32Array(n);
  let frame = 0, shown = n;
  const api = {
    mesh, total: n,
    setDensity(f) { const list = items.map((it, i) => (it.keep <= f ? i : -1)).filter((i) => i >= 0); order.length = 0; order.push(...list); shown = list.length; g.instanceCount = shown; frame = 0; },
    setVisible(v) { mesh.visible = v; },
    update(cam) {
      if (frame++ % 20 || !mesh.visible) return;
      const cx = cam.x, cy = cam.y, cz = cam.z;
      for (let i = 0; i < n; i++) { const it = items[i]; dist[i] = (it.x - cx) ** 2 + (it.y - cy) ** 2 + (it.z - cz) ** 2; }
      order.sort((a, b) => dist[b] - dist[a]);
      for (let k = 0; k < shown; k++) { const it = items[order[k]]; ip[k * 4] = it.x; ip[k * 4 + 1] = it.y; ip[k * 4 + 2] = it.z; ip[k * 4 + 3] = it.s; il[k * 2] = it.l; il[k * 2 + 1] = it.rot; }
      g.attributes.iP.needsUpdate = true; g.attributes.iL.needsUpdate = true;
    },
    dispose() { g.dispose(); mat.dispose(); mat.uniforms.uT.value.dispose(); },
  };
  g.instanceCount = n;
  return api;
}

// ---------------------------------------------------------------- nuages volumétriques (niveau Élevé)
// Marche de rayons à un tiers de la définition, sur une carte de couverture tirée des mêmes nuages que le moteur.
// La distance du premier nuage est écrite dans la profondeur : les avions passent devant ou derrière.
const COVER_ORIGIN = -3400, COVER_SPAN = 8400;
function coverageTexture(clouds) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (const q of clouds) {
    const x = (q.x - COVER_ORIGIN) / COVER_SPAN * S, y = (q.z - COVER_ORIGIN) / COVER_SPAN * S, r = q.R * 1.15 / COVER_SPAN * S, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    // la texture porte la hauteur du nuage : un dôme, à la hauteur propre de chaque nuage
    const peak = Math.min(1, q.H / 230);
    for (const [at, k] of [[0, 1], [0.5, 0.87], [0.8, 0.6], [0.95, 0.31], [1, 0]]) gr.addColorStop(at, `rgba(255,0,0,${peak * k})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
function noise3D(n) {
  const cells = 6, pts = [];
  for (let k = 0; k < cells; k++) for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + hash(i, j + k * 13)) / cells, (j + hash(j + 5, k + i * 7)) / cells, (k + hash(k + 9, i + j * 3)) / cells]);
  const d = new Uint8Array(n * n * n);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x / n, py = y / n, pz = z / n, ci = Math.floor(px * cells), cj = Math.floor(py * cells), ck = Math.floor(pz * cells); let m = 9;
    for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const i = (ci + a + cells) % cells, j = (cj + b + cells) % cells, k = (ck + c + cells) % cells, q = pts[k * cells * cells + j * cells + i];
      let dx = Math.abs(px - q[0]), dy = Math.abs(py - q[1]), dz = Math.abs(pz - q[2]); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy); dz = Math.min(dz, 1 - dz);
      const v = dx * dx + dy * dy + dz * dz; if (v < m) m = v;
    }
    d[z * n * n + y * n + x] = Math.round((1 - Math.min(1, Math.sqrt(m) * cells * 0.9)) * 255);
  }
  return d;
}

export function buildVolumetric(renderer, clouds, { scale = 0.28, steps = 44, light = 2 } = {}) {
  const n3 = 48, t3 = new THREE.Data3DTexture(noise3D(n3), n3, n3, n3);
  t3.format = THREE.RedFormat; t3.type = THREE.UnsignedByteType; t3.wrapS = t3.wrapT = t3.wrapR = THREE.RepeatWrapping; t3.minFilter = t3.magFilter = THREE.LinearFilter; t3.unpackAlignment = 1; t3.needsUpdate = true;
  const cover = coverageTexture(clouds);
  const TOP = CLOUD_BASE + 230;
  const size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round(size.x * scale)), Math.max(2, Math.round(size.y * scale)), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const U = { uN: { value: t3 }, uC: { value: cover }, uCam: { value: new THREE.Vector3() }, uInv: { value: new THREE.Matrix4() }, uSun: { value: SUN } };
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'in vec3 position; out vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `precision highp float; precision highp sampler3D; in vec2 vUv; out vec4 o; uniform sampler3D uN; uniform sampler2D uC; uniform vec3 uCam,uSun; uniform mat4 uInv;
      const float B=${CLOUD_BASE}.,T=${TOP}.; const int N=${steps},L=${light};
      float den(vec3 p,bool fine){ float h=(p.y-B)/(T-B); float c=texture(uC,(p.xz-vec2(${COVER_ORIGIN}.))/${COVER_SPAN}.).r; if(c<.02||h>c)return 0.; float b=1.2*smoothstep(0.,.06,h)*smoothstep(1.,.4,h/c); if(b<=0.)return 0.; if(!fine)return b; float d=texture(uN,p*.0052).r*.65+texture(uN,p*.017).r*.35; return clamp(b-(1.-d)*.86,0.,1.)*.07; }
      void main(){ vec4 f=uInv*vec4(vUv*2.-1.,1.,1.); vec3 rd=normalize(f.xyz/f.w-uCam),ro=uCam; float t0,t1; if(abs(rd.y)<1e-4){ if(ro.y<B||ro.y>T){o=vec4(0.);return;} t0=0.;t1=6000.; } else { float a=(B-ro.y)/rd.y,b=(T-ro.y)/rd.y; t0=max(min(a,b),0.);t1=min(max(a,b),6000.); } if(t1<=t0){o=vec4(0.);return;}
        float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))); float t=t0+ign*max(22.,t0*.018),tr=1.,lum=0.,firstT=-1.; float cosS=dot(rd,uSun); float hg=mix(.75,1.6,pow(max(cosS,0.),4.));
        for(int i=0;i<N&&t<t1;i++){ vec3 p=ro+rd*t; float dt=max(22.,t*.018); if(den(p,false)<=0.){ t+=dt*2.5; continue; } float d=den(p,true); if(d>.0005){ if(firstT<0.)firstT=t; float ls=0.,sd=38.; vec3 q=p; for(int j=0;j<L;j++){ q+=uSun*sd; ls+=den(q,true); sd*=1.7; } float beer=exp(-ls*38.); float pw=1.-exp(-d*90.); float e=(.28+beer*hg*.95)*mix(1.,pw,.5); float at=exp(-d*dt); lum+=tr*(1.-at)*e; tr*=at; if(tr<.02)break; } t+=dt; }
        float a=1.-tr; if(a<.004){o=vec4(0.);return;} float dist=firstT<0.?t1:firstT; o=vec4(lum/max(a,.001),a,dist,a); }`,
  });
  const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const qs = new THREE.Scene(), quad = new THREE.Mesh(tri, mat); quad.frustumCulled = false; qs.add(quad);
  const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cU = { uT: { value: rt.texture }, uPV: { value: new THREE.Matrix4() }, uInv: U.uInv, uCam: U.uCam, uFog: { value: HAZE } };
  const cm = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: cU, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: 'out vec2 vUv2; void main(){ vUv2=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `in vec2 vUv2; out vec4 oc; uniform sampler2D uT; uniform mat4 uPV,uInv; uniform vec3 uCam,uFog; void main(){ vec2 px=1./vec2(textureSize(uT,0)); vec4 s=texture(uT,vUv2); float dd=s.b; s=(s*2.+texture(uT,vUv2+px*vec2(1.2,.4))+texture(uT,vUv2+px*vec2(-.4,1.2))+texture(uT,vUv2+px*vec2(-1.2,-.4))+texture(uT,vUv2+px*vec2(.4,-1.2)))/6.; if(dd>0.)s.b=dd; if(s.a<.004)discard; vec4 f=uInv*vec4(vUv2*2.-1.,1.,1.); vec3 rd=normalize(f.xyz/f.w-uCam); vec4 cp=uPV*vec4(uCam+rd*s.b,1.); gl_FragDepth=clamp(cp.z/cp.w*.5+.5,0.,.999999); vec3 c=mix(vec3(.25,.31,.41),vec3(1.,.98,.95),clamp(s.r,0.,1.)); float fg=1.-exp(-pow(s.b*.00026,2.)); c=mix(c,uFog,fg); oc=vec4(pow(c,vec3(1./2.2))*s.g,s.g); }`,
  });
  const cq = new THREE.Mesh(tri, cm); cq.frustumCulled = false; const cs = new THREE.Scene(); cs.add(cq);
  const m = new THREE.Matrix4();
  return {
    pre(camera) { U.uCam.value.copy(camera.position); m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); cU.uPV.value.copy(m); U.uInv.value.copy(m).invert(); const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(qs, ocam); renderer.setRenderTarget(prev); },
    post() { const auto = renderer.autoClear; renderer.autoClear = false; renderer.render(cs, ocam); renderer.autoClear = auto; },
    resize() { renderer.getDrawingBufferSize(size); rt.setSize(Math.max(2, Math.round(size.x * scale)), Math.max(2, Math.round(size.y * scale))); },
    dispose() { rt.dispose(); t3.dispose(); cover.dispose(); tri.dispose(); mat.dispose(); cm.dispose(); },
  };
}
