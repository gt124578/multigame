// Le sol vu du ciel : la vraie île d'Island Rush (relief, routes, bâtiments, arbres de Birdie Party), repeinte façon photo aérienne,
// posée en mer dans l'archipel (archipel.js), dont la mer l'entoure.
// Aucune copie du générateur : si l'île change dans Island Rush, Dogfight suit tout seul.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GR, CELL, STOREY, WATER } from '../../royale/engine/map.js';
import { terrainImage, drawMap } from '../../royale/view/maprender.js';
import { HAZE, FOG_DENSITY, noiseData, hash, cloudShadow, CLOUD_SHADOW } from './sky.js';

const TEX = 2048;
const FIELD_PALETTE = [0x8d9150, 0xa79c5f, 0x6e7e45, 0xb6a86c, 0x7b8a4d, 0x97864f, 0x5e7040, 0xab905a, 0x7f7f4c].map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
const cellHash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

// Les plaines deviennent des parcelles agricoles, avec haies et sillons
function paintFields(relief, map, grain) {
  const ctx = relief.getContext('2d'), W = relief.width, img = ctx.getImageData(0, 0, W, W), px = img.data, scale = map.size / W;
  const baseL = 0.3 * 0x8d + 0.59 * 0xbd + 0.11 * 0x52;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const wx = (x + 0.5) * scale, wz = (y + 0.5) * scale;
    if (map.groundAt(wx, wz) !== GR.PLAINE) continue;
    const k = (y * W + x) * 4, th = (cellHash(Math.floor(wx / 300) + 91, Math.floor(wz / 300) - 37) % 1000) / 1000 * 1.57, c = Math.cos(th), s = Math.sin(th);
    const u = wx * c + wz * s, w = -wx * s + wz * c, iu = Math.floor(u / 62), iw = Math.floor(w / 41), hh = cellHash(iu, iw), fu = u / 62 - iu, fw = w / 41 - iw;
    const p = FIELD_PALETTE[hh % FIELD_PALETTE.length], shade = Math.max(0.62, Math.min(1.25, (0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]) / baseL));
    const stripe = 0.965 + 0.035 * Math.sin((hh % 2 ? u : w) * 1.9), g = 0.94 + 0.12 * grain[(y % 256) * 256 + (x % 256)];
    const eu = Math.min(fu, 1 - fu) * 62, ew = Math.min(fw, 1 - fw) * 41, hedge = (eu < 1.5 && (hh >> 4) % 3) || (ew < 1.5 && (hh >> 6) % 3);
    const q = hedge ? [52, 66, 38] : p, f = shade * (hedge ? 1 : stripe * g);
    px[k] = q[0] * f; px[k + 1] = q[1] * f; px[k + 2] = q[2] * f;
  }
  ctx.putImageData(img, 0, 0);
}

// Longues ombres d'arbres et de bâtiments, peintes une fois pour toutes selon le soleil
function paintShadows(ctx, map, sun, k) {
  const h = Math.hypot(sun.x, sun.z), L = h / sun.y, dx = -sun.x / h, dz = -sun.z / h, ang = Math.atan2(dz, dx);
  ctx.save(); ctx.scale(k, k); ctx.fillStyle = 'rgba(16,24,18,.5)';
  for (const p of map.props) {
    if (p.kind !== 'arbre' && p.kind !== 'sapin') continue;
    const l = 9 * p.s * L;
    ctx.beginPath(); ctx.ellipse(p.x + dx * l * 0.5, p.z + dz * l * 0.5, l * 0.55, 2.8 * p.s, ang, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = 'rgba(16,22,26,.16)';
  for (const b of map.buildings) { const l = b.floors * STOREY * L; for (let t = 1; t <= 6; t++) ctx.fillRect(b.x0 * CELL + dx * l * t / 6, b.z0 * CELL + dz * l * t / 6, b.w * CELL, b.d * CELL); }
  ctx.restore();
}

// Étalonnage : couleurs sourdes, routes moins blanches
function grade(ctx) {
  const im = ctx.getImageData(0, 0, TEX, TEX), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = 0.3 * r + 0.59 * g + 0.11 * b, water = b > g && b > r, sat = water ? 0.62 : 0.66;
    let R = l + (r - l) * sat, G = l + (g - l) * sat, B = l + (b - l) * sat;
    if (!water) { const k = l > 165 ? 0.72 : 1; R *= 0.93 * k; G *= 0.92 * k; B *= 0.8 * k; } else { R *= 0.9; G *= 0.95; B *= 0.92; }
    d[i] = R; d[i + 1] = G; d[i + 2] = B;
  }
  ctx.putImageData(im, 0, 0);
}

export function paintIsland(map, sun) {
  const grain = noiseData();
  const relief = terrainImage(map, { ppm: 1 });
  paintFields(relief, map, grain);
  const cv = document.createElement('canvas'); cv.width = cv.height = TEX;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  drawMap(ctx, map, relief, { x: map.size / 2, z: map.size / 2, s: TEX / map.size, w: TEX, h: TEX, dpr: 1 }, { layers: { relief: true, routes: true, batiments: true, vegetation: false, vehicules: false, coffres: false, butin: false, noms: false, grille: false, tempete: false, vol: false }, level: 0 });
  paintShadows(ctx, map, sun, TEX / map.size);
  grade(ctx);
  return cv;
}

// l'île peinte, et son eau qui ondule et reflète le ciel
const GROUND_FRAGMENT = `varying vec2 vU; varying vec3 vW; uniform sampler2D uMap, uN; uniform vec3 uSun, uHaze, uCam; uniform float uFogD;
${CLOUD_SHADOW}
void main(){
  vec3 c=texture2D(uMap,vU).rgb; float wm=smoothstep(1.,1.07,c.b/max(c.g,.001));
  vec3 V=normalize(uCam-vW); float d=length(uCam-vW);
  c*=mix(.86+.28*texture2D(uN,vW.xz*.021).r,1.,wm);
  if(wm>0.){ vec2 p=vW.xz*.012; float n1=texture2D(uN,p).r-.5,n2=texture2D(uN,p*3.1+.3).r-.5; vec3 N=normalize(vec3((n1+n2*.5)*.09,1.,(n2+n1*.4)*.09)); float fr=pow(1.-max(dot(N,V),0.),3.5);
    vec3 R=reflect(-V,N); vec3 skyc=mix(uHaze,vec3(.13,.3,.55),smoothstep(0.,.5,R.y)); c=mix(c,skyc,(.12+.8*fr)*wm); c+=vec3(1.,.93,.8)*pow(max(dot(R,uSun),0.),260.)*1.6*wm; }
  c*=cloudShade(vW);
  float f=1.-exp(-pow(d*uFogD,1.45)); float sa=pow(max(dot(-V,uSun),0.),6.); vec3 h=mix(uHaze,vec3(1.,.93,.84),sa*.4); c=mix(c,h,f);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const GROUND_VERTEX = `varying vec2 vU; varying vec3 vW; void main(){ vU=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

function buildBuildings(map) {
  const P = [], C = [], col = new THREE.Color();
  const quad = (a, b, c, d, cc) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) C.push(cc.r, cc.g, cc.b); };
  const WALL = { pierre: 0xbdb6a6, bois: 0x8a7458, metal: 0x8f999d }, ROOF = { pente: { pierre: 0x9c5a46, bois: 0x6f5340, metal: 0x707f88 }, plat: { pierre: 0x9d9c97, bois: 0x8f7a60, metal: 0x88949b } };
  for (const b of map.buildings) {
    const x0 = b.x0 * CELL, z0 = b.z0 * CELL, x1 = (b.x0 + b.w) * CELL, z1 = (b.z0 + b.d) * CELL, y0 = b.y - 1, y1 = b.y + b.floors * STOREY;
    const w = col.clone().setHex(WALL[b.mat] ?? 0xbdb6a6), r = col.clone().setHex((ROOF[b.roof] || ROOF.pente)[b.mat] ?? 0x9c5a46);
    const A = [x0, y1, z0], B = [x1, y1, z0], Cc = [x1, y1, z1], D = [x0, y1, z1], a = [x0, y0, z0], bb = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1];
    quad(a, A, B, bb, w); quad(bb, B, Cc, c, w); quad(c, Cc, D, d, w); quad(d, D, A, a, w);
    if (b.roof === 'plat') quad(D, Cc, B, A, r);
    else {
      const rh = Math.min(x1 - x0, z1 - z0) * 0.35;
      if (x1 - x0 > z1 - z0) { const zm = (z0 + z1) / 2, E = [x0, y1 + rh, zm], F = [x1, y1 + rh, zm]; quad(A, E, F, B, r); quad(D, Cc, F, E, r); }
      else { const xm = (x0 + x1) / 2, E = [xm, y1 + rh, z0], F = [xm, y1 + rh, z1]; quad(A, D, F, E, r); quad(B, E, F, Cc, r); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// Les arbres de l'île : ceux de Birdie Party, comme sur l'archipel
function buildTrees(map, kit) {
  const items = map.props.filter((p) => p.kind === 'arbre' || p.kind === 'sapin').map((p, i) => ({
    x: p.x, y: map.heightAt(p.x, p.z), z: p.z, s: p.s * (0.9 + hash(i, 3) * 0.5), rot: i, v: i,
    kind: p.kind === 'sapin' ? 'pine' : hash(i, 7) < 0.5 ? 'round' : 'oak',
  }));
  const group = kit.plant(items, { shadows: false, dark: true }), meshes = group.children.map((im) => ({ im, n: im.count }));
  for (const { im } of meshes) im.frustumCulled = false;
  group.setDensity = (f) => { for (const m of meshes) m.im.count = Math.floor(m.n * f); };
  return group;
}

export function buildGround(scene, map, sun, noiseTex, anisotropy = 8, kit) {
  const canvas = paintIsland(map, sun);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  const shared = { uMap: { value: tex }, uN: { value: noiseTex }, uSun: { value: sun }, uHaze: { value: HAZE }, uCam: { value: new THREE.Vector3() }, uFogD: { value: FOG_DENSITY }, ...cloudShadow };
  const islandMat = new THREE.ShaderMaterial({ uniforms: shared, fog: false, vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT });

  // relief : une grille régulière, les lacs et rivières à plat à leur niveau ; la mer est celle de l'archipel (archipel.js),
  // qui passe par-dessus le fond
  const N = map.n, H = map.heights, W = map.water, WL = map.waterLevel, STEP = 4;
  const n = Math.floor((N - 1) / STEP) + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, k++) {
    const q = j * STEP * N + i * STEP, y = W[q] === WATER.MER ? Math.min(H[q], -0.6) : W[q] ? Math.max(WL[q], 0) : Math.max(H[q], 0.5);
    pos[k * 3] = i * STEP * 2; pos[k * 3 + 1] = y; pos[k * 3 + 2] = j * STEP * 2; uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = 1 - j / (n - 1);
  }
  k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const island = new THREE.Mesh(geo, islandMat);
  // la mer de l'archipel prend la couleur de l'eau au bord de l'île : pas de couture sur le rivage
  const [dr, dg, db] = canvas.getContext('2d').getImageData(1, 1, 1, 1).data;
  const deep = new THREE.Color().setRGB(dr / 255, dg / 255, db / 255, THREE.SRGBColorSpace);
  const buildings = buildBuildings(map), trees = buildTrees(map, kit);
  scene.add(island, buildings, trees);
  return { canvas, trees, deep, update(camPos) { shared.uCam.value.copy(camPos); }, dispose() { geo.dispose(); islandMat.dispose(); tex.dispose(); buildings.geometry.dispose(); buildings.material.dispose(); for (const im of trees.children) im.dispose(); scene.remove(island, buildings, trees); } };
}
