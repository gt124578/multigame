// Les lieux de la carte, tirés d'OpenStreetMap (relief/<carte>-osm.json, voir tools/osm-dogfight.py ; © les contributeurs
// d'OpenStreetMap, ODbL) : les routes, pistes et sentiers, les champs, vergers, vignes et serres, les ruisseaux et l'ombre
// des maisons sont peints au sol dans deux cartes de détail que lit le relief (archipel.js) : une fine (1 m le pixel)
// autour de la caméra, repeinte quand elle s'éloigne, et une pour toute la carte (7 m le pixel). Les maisons, les grands
// bâtiments et les ponts sont en relief ; des arbres poussent dans les jardins, aucun sur les routes ni dans les maisons.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { heightAt, runwayLocal, PLATFORM } from '../engine/archipel.js';

const NEAR = 2048, NEAR_M = 2048;     // carte fine : pixels, mètres couverts
const FAR = 2048;                     // carte entière
const MOVE = 320;                     // on repeint la carte fine quand la caméra s'est éloignée de tant de son centre
const BLOCK = 4;                      // la grille où les arbres n'ont pas le droit de pousser (m)
const LEVEL = 3;                      // hauteur d'un étage (m)
// demi-largeur (m) et calque de chaque classe de route : route principale, route, piste, sentier ; ruisseau, rivière ; haie
const ROAD_W = [4, 2.6, 1.6, 0.75], WATER_W = [1.1, 4];
const L_AREA = 1, L_SHADOW = 2, L_EDGE = 3, L_WATER = 4, L_ROAD = [8, 7, 6, 5];
// couleurs par défaut des maisons (une carte les change dans look.osm)
// dry : les ruisseaux et canaux sont des lits de cailloux (îles arides), pas de l'eau
const STYLE = { walls: [0xe9e4d8, 0xdccfb2, 0xcfc6b4], roofs: [0x9a5440, 0x7c4636, 0x5e5f60], flat: [0xb9b3a6, 0xa49e92], pitched: 0.5, garden: 0.5, dirt: [0.17, 0.14, 0.1], dry: false };

const h32 = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 144665) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

const PAINT_VERTEX = `attribute vec2 aDir, aCorner; attribute float aW, aK, aS; uniform float uMinW; varying vec3 vL; varying float vK;
void main(){ float W=max(aW,uMinW); vec2 n=vec2(-aDir.y,aDir.x), p=position.xy+n*aCorner.x*W+aDir*aCorner.y*W;
  vL=vec3(aCorner.x,aS+aCorner.y*W,aW/W); vK=aK; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,position.z,1.); }`;
// les traits : routes (asphalte, bas-côtés, ligne blanche de près), pistes (deux ornières), sentiers, ruisseaux, haies et murets
const LINE_FRAGMENT = `uniform sampler2D uN; uniform vec3 uDirt; uniform float uFine, uDry; varying vec3 vL; varying float vK;
void main(){
  float v=abs(vL.x), s=vL.y, aa=1.-smoothstep(1.-fwidth(vL.x)*1.5,1.,v), n=texture2D(uN,vec2(s*.013,vL.x*.1+vK*.17)).r; int k=int(vK+.5);
  vec3 c; float a;
  if(k==0){ c=vec3(.042,.042,.043)*(.9+.2*n); a=1.; c=mix(c,vec3(.3,.3,.28),uFine*(step(.8,v)*step(v,.9)+step(v,.06)*step(.55,fract(s/12.)))); }
  else if(k==1){ c=vec3(.05,.049,.047)*(.88+.24*n); a=1.; c=mix(c,uDirt*1.2,smoothstep(.75,1.,v)*.6); }
  else if(k==2){ c=uDirt*(.85+.3*n); a=.85; c*=1.-.3*smoothstep(.22,0.,abs(v-.55)); }
  else if(k==3){ c=uDirt*1.25*(.9+.2*n); a=.75*(1.-smoothstep(.5,1.,v)); }
  else if(k==4){ c=mix(vec3(.012,.022,.018),uDirt*1.6*(.8+.4*n),uDry); a=mix(.5,.45,uDry)*(1.-v*v); }
  else if(k==5){ c=mix(vec3(.014,.034,.036),uDirt*1.7*(.8+.4*n),uDry); a=mix(.9,.6,uDry)*(1.-uDry*v*v); }
  else { c=vec3(.016,.024,.01)*(.8+.4*n); a=.55*(.6+.4*n); }
  a*=aa*vL.z; if(a<.004) discard;
  gl_FragColor=vec4(c*a,a);
}`;
const AREA_VERTEX = `attribute float aK, aA, aH; varying vec2 vP; varying float vK, vA, vH;
void main(){ vP=position.xy; vK=aK; vA=aA; vH=aH; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
// les surfaces : parcelles (teinte et sillons), vergers (rangs d'arbres), vignes, prés, serres, villages, carrières, cimetières, bassins ;
// et l'ombre des maisons
const AREA_FRAGMENT = `uniform sampler2D uN; uniform vec3 uDirt; uniform float uFine; varying vec2 vP; varying float vK, vA, vH;
void main(){
  vec2 d=vec2(cos(vA),sin(vA)); float u=dot(vP,d), w=dot(vP,vec2(-d.y,d.x)), n=texture2D(uN,vP*.011).r; int k=int(vK+.5);
  vec3 c; float a;
  if(k==0){ vec3 t=vH<.33?vec3(.07,.06,.028):vH<.66?vec3(.04,.055,.022):vec3(.075,.068,.04); float f=.5+.5*sin(u*3.9);
    c=mix(t,t*.6,f*uFine); a=.3+.08*n; }
  else if(k==1){ vec2 g=fract(vec2(u,w)/5.5)-.5; float t=smoothstep(.34,.22,length(g)); c=mix(uDirt*.9,vec3(.012,.026,.01),t); a=mix(.2,.75,t); }
  else if(k==2){ float r=smoothstep(.32,.12,abs(fract(w/2.3)-.5)); c=mix(uDirt*1.1,vec3(.02,.03,.012),r); a=mix(.25,.6,r); }
  else if(k==3){ c=mix(vec3(.05,.065,.025),vec3(.07,.07,.03),n); a=.16; }
  else if(k==4){ float p=step(.93,fract(u/4.))+step(.96,fract(w/9.)); c=vec3(.42,.43,.42)*(1.-.25*p)*(.9+.2*n); a=.92; }
  else if(k==5){ c=vec3(.075,.07,.062)*(.8+.4*n); a=.22; }
  else if(k==6){ c=vec3(.13,.12,.1)*(.85+.3*n); a=.45; }
  else if(k==7){ vec2 g=fract(vec2(u,w)/vec2(2.2,3.))-.5; c=mix(vec3(.05,.06,.03),vec3(.2,.2,.19),step(abs(g.x),.2)*step(abs(g.y),.3)); a=.5; }
  else if(k==8){ c=vec3(.014,.03,.032); a=.9; }
  else { c=vec3(0.); a=.42; }
  gl_FragColor=vec4(c*a,a);
}`;

// Une ligne décodée : écarts en demi-mètres → points du monde [x, z, x, z…]
function decode(rec, from, unit, cx, cz) {
  const out = [];
  let x = 0, z = 0;
  for (let i = from; i < rec.length; i += 2) { x += rec[i]; z += rec[i + 1]; out.push(cx + x * unit, cz + z * unit); }
  return out;
}

export function loadPlaces(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} : ${r.status}`); return r.json(); });
}

// `data` : le fichier de la carte ; `look` : la carte (look.osm pour ses maisons) ; `shade` : l'ombre des montagnes (texture, zone)
export function buildPlaces(scene, A, data, { look, sun, noiseTex, shade, shadeArea }) {
  const S = { ...STYLE, ...(look.osm || {}) }, u = data.unit, cx = A.x0 + A.size / 2, cz = A.z0 + A.size / 2, W = A.runway;
  // ni sur l'île d'Island Rush, ni sur la base
  const away = (x, z) => {
    if (x > -80 && x < 1680 && z > -80 && z < 1680) return false;
    const q = runwayLocal(W, x, z);
    return !(Math.abs(q.a) < W.len / 2 + PLATFORM.end + 80 && q.b > -PLATFORM.side - 80 && q.b < PLATFORM.apron + 80);
  };
  const inMap = (x, z) => x > A.x0 && z > A.z0 && x < A.x0 + A.size && z < A.z0 + A.size;
  // la grille interdite aux arbres : routes, pistes, bâtiments
  const bn = Math.ceil(A.size / BLOCK), block = new Uint8Array(bn * bn);
  const stamp = (x, z, r) => {
    const i0 = Math.max(0, Math.floor((x - r - A.x0) / BLOCK)), i1 = Math.min(bn - 1, Math.floor((x + r - A.x0) / BLOCK));
    const j0 = Math.max(0, Math.floor((z - r - A.z0) / BLOCK)), j1 = Math.min(bn - 1, Math.floor((z + r - A.z0) / BLOCK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j * bn + i] = 1;
  };
  const blocked = (x, z) => { const i = Math.floor((x - A.x0) / BLOCK), j = Math.floor((z - A.z0) / BLOCK); return i >= 0 && j >= 0 && i < bn && j < bn && block[j * bn + i] > 0; };

  // ---------------------------------------------------------------- les traits (routes, cours d'eau, haies)
  const LP = [], LD = [], LC = [], LW = [], LK = [], LS = [], LI = [];
  function line(pts, hw, kind, layer) {
    let s = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05 || !away((x0 + x1) / 2, (z0 + z1) / 2)) { s += len; continue; }
      const tx = (x1 - x0) / len, tz = (z1 - z0) / len, b = LP.length / 3;
      for (const [cx_, cz_, side, end, ss] of [[x0, z0, -1, -1, s], [x0, z0, 1, -1, s], [x1, z1, -1, 1, s + len], [x1, z1, 1, 1, s + len]]) {
        LP.push(cx_, cz_, layer); LD.push(tx, tz); LC.push(side, end); LW.push(hw); LK.push(kind); LS.push(ss);
      }
      LI.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      s += len;
    }
  }
  // ---------------------------------------------------------------- les surfaces
  const AP = [], AK = [], AA = [], AH = [], AI = [];
  function area(pts, kind, layer, ang, hv, dx = 0, dz = 0) {
    const contour = [];
    for (let i = 0; i < pts.length; i += 2) contour.push(new THREE.Vector2(pts[i] + dx, pts[i + 1] + dz));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return; }
    const b = AP.length / 3;
    for (const p of contour) { AP.push(p.x, p.y, layer); AK.push(kind); AA.push(ang); AH.push(hv); }
    for (const t of tris) AI.push(b + t[0], b + t[1], b + t[2]);
  }
  const longest = (pts) => {
    let best = 0, ang = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length, dx = pts[j] - pts[i], dz = pts[j + 1] - pts[i + 1], l = dx * dx + dz * dz;
      if (l > best) { best = l; ang = Math.atan2(dz, dx); }
    }
    return ang;
  };
  const centroid = (pts) => { let x = 0, z = 0; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; z += pts[i + 1]; } return [x / (pts.length / 2), z / (pts.length / 2)]; };

  data.areas.forEach((rec, n) => {
    const pts = decode(rec, 1, u, cx, cz), [mx, mz] = centroid(pts);
    if (!away(mx, mz)) return;
    area(pts, rec[0], L_AREA, longest(pts), h32(n, rec[0], 3));
    // les bords des parcelles, des vergers et des vignes : haies, murets, terrasses
    if (rec[0] <= 2) line([...pts, pts[0], pts[1]], 0.6, 6, L_EDGE);
  });
  for (const rec of data.water) line(decode(rec, 1, u, cx, cz), WATER_W[rec[0]], 4 + rec[0], L_WATER);

  // ---------------------------------------------------------------- les bâtiments et les ponts, en relief
  // couleur par sommet ; `win` : des fenêtres sur ce mur
  const BP = [], BC = [], BW = [], col = new THREE.Color(), pick = (list, v) => col.setHex(list[Math.floor(v * list.length) % list.length]).clone();
  const push = (p, cc, k, w) => { BP.push(...p); BC.push(cc.r * k, cc.g * k, cc.b * k); BW.push(w); };
  const quad = (a, b, c, d, cc, win = 0) => { for (const p of [a, b, c, a, c, d]) push(p, cc, 1, win); };
  const tri = (a, b, c, cc, k = 1) => { for (const p of [a, b, c]) push(p, cc, k, 0); };
  // un mur, plus sombre à son pied (l'ombre du sol et des voisins)
  const wallQuad = (a, b, c, d, cc, win) => { for (const [p, k] of [[a, 0.55], [b, 1], [c, 1], [a, 0.55], [c, 1], [d, 0.55]]) push(p, cc, k, win); };
  const hl = Math.hypot(sun.x, sun.z), shx = -sun.x / hl, shz = -sun.z / hl, shL = hl / sun.y;
  const gardens = [];
  data.buildings.forEach((rec, n) => {
    const kind = rec[0], pts = decode(rec, 2, u, cx, cz), [mx, mz] = centroid(pts), m = pts.length / 2;
    if (!away(mx, mz) || !inMap(mx, mz)) return;
    // sens des aiguilles d'une montre vu d'en haut (x à l'est, z au sud) : les murs regardent dehors
    let sa = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; sa += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; }
    if (sa < 0) { const r = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts.splice(0, pts.length, ...r); }
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < pts.length; i += 2) { const y = heightAt(A, pts[i], pts[i + 1]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi < 0.3) return;
    const v = h32(n, kind, 11), lv = rec[1] || (kind === 1 ? 2 : kind === 4 ? 3 : v < 0.55 ? 1 : 2);
    const tall = kind === 2 ? 4 : kind === 3 ? 2.6 : lv * LEVEL, y0 = Math.max(0, lo) - 1.5, y1 = Math.max(hi + 1.8, (lo + hi) / 2 + tall);
    const wall = kind === 2 ? col.setHex(0xd2d6d2).clone() : pick(S.walls, h32(n, 5, 13)), roofCol = kind === 2 ? col.setHex(0xc4c9c6).clone() : null;
    const win = kind <= 1 || kind === 4 ? 1 : 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      wallQuad([pts[i], y0, pts[i + 1]], [pts[i], y1, pts[i + 1]], [pts[j], y1, pts[j + 1]], [pts[j], y0, pts[j + 1]], wall, win);
    }
    // toit à deux pans sur les maisons rectangulaires, en terrasse ailleurs
    const sides = m === 4 && [0, 2, 4, 6].map((i) => Math.hypot(pts[(i + 2) % 8] - pts[i], pts[(i + 3) % 8] - pts[i + 1]));
    const square = sides && Math.abs(sides[0] - sides[2]) < 0.15 * sides[0] && Math.abs(sides[1] - sides[3]) < 0.15 * sides[1];
    if (square && (kind === 0 || kind === 4) && h32(n, 6, 17) < S.pitched) {
      const r = pick(S.roofs, h32(n, 7, 19)), o = sides[0] >= sides[1] ? 0 : 2, P = (k) => [pts[(o + k * 2) % 8], y1, pts[(o + k * 2 + 1) % 8]];
      const a = P(0), b = P(1), c = P(2), d = P(3), rh = Math.min(sides[0], sides[1]) * 0.36;
      const e = [(a[0] + d[0]) / 2, y1 + rh, (a[2] + d[2]) / 2], f = [(b[0] + c[0]) / 2, y1 + rh, (b[2] + c[2]) / 2];
      quad(a, e, f, b, r); quad(c, f, e, d, r); tri(b, f, c, wall); tri(d, e, a, wall);
    } else {
      const r = roofCol || pick(S.flat, h32(n, 7, 19)), contour = [];
      for (let i = 0; i < pts.length; i += 2) contour.push(new THREE.Vector2(pts[i], pts[i + 1]));
      let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { /* contour tordu : pas de toit */ }
      for (const t of tris) tri(...t.map((k) => [contour[k].x, y1, contour[k].y]), r, 1.3);   // les terrasses, en plein soleil, plus claires que les murs
    }
    // l'ombre au sol, et la place gardée
    const len = (y1 - Math.max(0, lo)) * shL;
    for (let t = 1; t <= 4; t++) area(pts, 9, L_SHADOW, 0, 0, shx * len * t / 4, shz * len * t / 4);
    let rad = 0; for (let i = 0; i < pts.length; i += 2) { stamp(pts[i], pts[i + 1], 2); rad = Math.max(rad, Math.hypot(pts[i] - mx, pts[i + 1] - mz)); }
    stamp(mx, mz, rad * 0.7);
    if (kind === 0 && h32(n, 8, 23) < S.garden) gardens.push([mx, mz, rad, n]);
  });

  // les routes : peintes au sol, sauf les ponts, en relief
  for (const rec of data.roads) {
    const cls = rec[0] & 3, bridge = rec[0] >= 4, pts = decode(rec, 1, u, cx, cz), hw = ROAD_W[cls];
    if (!bridge) {
      line(pts, hw, cls, L_ROAD[cls]);
      if (cls < 3) for (let i = 0; i + 3 < pts.length; i += 2) {
        const l = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]), k = Math.max(1, Math.ceil(l / 3));
        for (let s = 0; s <= k; s++) stamp(pts[i] + (pts[i + 2] - pts[i]) * s / k, pts[i + 1] + (pts[i + 3] - pts[i + 1]) * s / k, hw + 1.5);
      }
      continue;
    }
    // le tablier, droit d'une rive à l'autre (au moins 3 m au-dessus de l'eau)
    if (!away(pts[0], pts[1])) continue;
    const ya = heightAt(A, pts[0], pts[1]), yb = heightAt(A, pts.at(-2), pts.at(-1)), total = pts.reduce((acc, _, i) => i >= 2 && i % 2 === 0 ? acc + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]) : acc, 0) || 1;
    const deck = col.setHex(0x55575a).clone(), side = col.setHex(0x9a9890).clone();
    let s = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3], l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * (hw + 0.6), nz = (x1 - x0) / l * (hw + 0.6);
      const ya0 = Math.max(3, ya + (yb - ya) * s / total) + 0.4, ya1 = Math.max(3, ya + (yb - ya) * (s + l) / total) + 0.4; s += l;
      quad([x0 - nx, ya0, z0 - nz], [x1 - nx, ya1, z1 - nz], [x1 + nx, ya1, z1 + nz], [x0 + nx, ya0, z0 + nz], deck);
      for (const g of [-1, 1]) quad([x0 + g * nx, ya0 - 1.4, z0 + g * nz], [x0 + g * nx, ya0 + 0.9, z0 + g * nz], [x1 + g * nx, ya1 + 0.9, z1 + g * nz], [x1 + g * nx, ya1 - 1.4, z1 + g * nz], side);
    }
  }

  // les arbres des jardins, à côté des maisons (pas dedans, pas sur la route)
  const extra = [];
  for (const [mx, mz, rad, n] of gardens) {
    const k = 1 + (h32(n, 9, 29) < 0.4 ? 1 : 0);
    for (let t = 0; t < k; t++) {
      const ang = h32(n, 10 + t, 31) * 6.283, d = rad + 3.5 + h32(n, 12 + t, 37) * 4, x = mx + Math.cos(ang) * d, z = mz + Math.sin(ang) * d;
      if (!blocked(x, z)) extra.push(x, z);
    }
  }

  // ---------------------------------------------------------------- les mailles
  const shared = { uN: { value: noiseTex }, uDirt: { value: new THREE.Vector3(...S.dirt) }, uFine: { value: 1 }, uMinW: { value: 0.4 }, uDry: { value: S.dry ? 1 : 0 } };
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3)); lineGeo.setAttribute('aDir', new THREE.Float32BufferAttribute(LD, 2));
  lineGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(LC, 2)); lineGeo.setAttribute('aW', new THREE.Float32BufferAttribute(LW, 1));
  lineGeo.setAttribute('aK', new THREE.Float32BufferAttribute(LK, 1)); lineGeo.setAttribute('aS', new THREE.Float32BufferAttribute(LS, 1)); lineGeo.setIndex(LI);
  const areaGeo = new THREE.BufferGeometry();
  areaGeo.setAttribute('position', new THREE.Float32BufferAttribute(AP, 3)); areaGeo.setAttribute('aK', new THREE.Float32BufferAttribute(AK, 1));
  areaGeo.setAttribute('aA', new THREE.Float32BufferAttribute(AA, 1)); areaGeo.setAttribute('aH', new THREE.Float32BufferAttribute(AH, 1)); areaGeo.setIndex(AI);
  // mélange « par-dessus », couleur prémultipliée ; deux morceaux du même calque ne se superposent pas (test de profondeur strict)
  const paintMat = (vs, fs, uniforms) => new THREE.ShaderMaterial({
    uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: true, depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const lineMat = paintMat(PAINT_VERTEX, LINE_FRAGMENT, shared), areaMat = paintMat(AREA_VERTEX, AREA_FRAGMENT, shared);
  const paint = new THREE.Scene(), lines = new THREE.Mesh(lineGeo, lineMat), areas = new THREE.Mesh(areaGeo, areaMat);
  lines.frustumCulled = areas.frustumCulled = false; areas.renderOrder = 0; lines.renderOrder = 1;
  paint.add(areas, lines);
  const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -20, 20);
  const target = (n) => {
    const rt = new THREE.WebGLRenderTarget(n, n, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.anisotropy = 8;
    return rt;
  };
  const nearRT = target(NEAR), farRT = target(FAR);
  const nearA = new THREE.Vector3(1e9, 1e9, NEAR_M), farA = new THREE.Vector3(A.x0, A.z0, A.size);
  // la caméra du dessin regarde le sol d'en haut ; le texel (0, 0) est au nord-ouest de la zone, comme le lit le relief
  function draw(renderer, rt, x0, z0, size, fine) {
    cam.left = x0; cam.right = x0 + size; cam.bottom = z0; cam.top = z0 + size; cam.updateProjectionMatrix();
    shared.uFine.value = fine ? 1 : 0; shared.uMinW.value = fine ? 0.4 : size / FAR * 0.6;
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(paint, cam);
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  }

  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3)); bGeo.setAttribute('color', new THREE.Float32BufferAttribute(BC, 3));
  bGeo.setAttribute('aWin', new THREE.Float32BufferAttribute(BW, 1)); bGeo.computeVertexNormals();
  const bMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0xd0d0d0 });
  // l'ombre des montagnes sur les murs, comme sur le relief ; un peu de lumière renvoyée par le sol sur les murs à l'ombre ;
  // des fenêtres par étage, qui s'effacent au loin
  bMat.onBeforeCompile = (sh) => {
    sh.uniforms.uShade = { value: shade }; sh.uniforms.uShadeA = { value: shadeArea };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uShade; uniform vec3 uShadeA; attribute float aWin; varying float vShadeB, vWin; varying vec3 vWP, vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wpB=modelMatrix*vec4(position,1.); vWP=wpB.xyz; vWN=normal; vWin=aWin; vShadeB=texture2D(uShade,(wpB.xz-uShadeA.xy)/uShadeA.z).r;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShadeB, vWin; varying vec3 vWP, vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if(vWin>.5){ vec2 t=normalize(vec2(-vWN.z,vWN.x)+1e-5); float u=dot(vWP.xz,t)/2.9, y=vWP.y/${LEVEL}.;
          float wnd=step(.3,fract(u))*step(fract(u),.68)*step(.36,fract(y))*step(fract(y),.76)*(1.-smoothstep(.12,.35,fwidth(u)+fwidth(y)));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.035,.045,.055),wnd*.85); }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse *= vShadeB; totalEmissiveRadiance += diffuseColor.rgb * .16;');
  };
  bMat.customProgramCacheKey = () => 'dogfight-batiments-3';
  const buildings = new THREE.Mesh(bGeo, bMat);
  scene.add(buildings);

  let farDone = false;
  const stats = { roads: data.roads.length, buildings: BP.length / 18 | 0, areas: data.areas.length, gardens: extra.length / 2 };
  return {
    stats, extra, blocked, nearTex: nearRT.texture, farTex: farRT.texture, nearA, farA,
    // repeint la carte fine autour de la caméra quand elle s'en éloigne ; la carte entière, une fois
    update(renderer, camPos) {
      if (!farDone) { draw(renderer, farRT, A.x0, A.z0, A.size, false); farDone = true; }
      const ox = nearA.x + NEAR_M / 2, oz = nearA.y + NEAR_M / 2;
      if (Math.hypot(camPos.x - ox, camPos.z - oz) > MOVE) {
        nearA.x = Math.round(camPos.x / 64) * 64 - NEAR_M / 2; nearA.y = Math.round(camPos.z / 64) * 64 - NEAR_M / 2;
        draw(renderer, nearRT, nearA.x, nearA.y, NEAR_M, true);
      }
    },
    dispose() {
      scene.remove(buildings); bGeo.dispose(); bMat.dispose(); lineGeo.dispose(); areaGeo.dispose(); lineMat.dispose(); areaMat.dispose(); nearRT.dispose(); farRT.dispose();
    },
  };
}
