// Les avions de Dogfight 3D tirés de modèles STL (Thingiverse, CC BY et CC BY-SA, voir dogfight/LICENSE.txt) :
// remis d'aplomb (nez sur +Z, gauche sur +X, haut sur +Y), à leur vraie longueur, allégés, lissés là où la surface
// est courbe et vive ailleurs, puis écrits en GLB. Trois matières : la peau, la verrière et le métal des tuyères,
// repérées par des volumes donnés plus bas. La peinture est faite par le jeu (view/plane.js).
//
// Usage : node tools/avions-dogfight.mjs dossier [avion…]     (dossier/<avion>/<fichier>.stl → dogfight/avions/<avion>.glb)
//         node tools/avions-dogfight.mjs dossier --profil avion  (profil du dessus et de l'arrière, pour placer les volumes)
// Prérequis : le paquet npm meshoptimizer (npm install meshoptimizer), ou son chemin dans la variable MESHOPT.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// up : axe du haut dans le fichier ; len : vraie longueur (m) ; tris : triangles gardés ; floor : hauteur du point le plus
// bas (les gros porteurs roulent 3 m au-dessus de la piste), sinon le centre des surfaces est mis à 0 ;
// glass : verrière, ellipsoïde [y, z, demi-largeur, demi-hauteur, demi-longueur] (le pare-brise des gros porteurs est peint
// par le jeu) ; nozzles : tuyères [x, y, z, rayon]
export const PLANES = {
  rafale: { file: 'rafale_B.stl', up: 'z', len: 15.27, tris: 4000, glass: [0.72, 3.45, 0.42, 0.42, 2.1], nozzles: [[0.57, -0.1, -6.75, 0.38], [-0.57, -0.1, -6.75, 0.38]] },
  su35: { file: 'Su-35_Flanker-E__FINAL_3D_STL.stl', up: 'z', len: 21.9, tris: 20000, glass: [0.95, 5.6, 0.5, 0.5, 1.9], nozzles: [[1.18, -0.47, -9.3, 0.4], [-1.18, -0.47, -9.3, 0.4]] },
  f18: { file: 'F_A-18E_v3.stl', up: 'y', len: 18.31, tris: 20000, glass: [0.9, 4.6, 0.48, 0.5, 1.8], nozzles: [[0.48, -0.3, -8.3, 0.42], [-0.48, -0.3, -8.3, 0.42]] },
  a10: { file: 'A-10_v2.stl', up: 'y', len: 16.26, tris: 20000, glass: [1.0, 5.2, 0.5, 0.55, 1.2], nozzles: [[1.46, 0.65, -4.95, 0.45], [-1.46, 0.65, -4.95, 0.45]] },
  c17: { file: 'C-17_Globemaster_III.stl', up: 'y', len: 53.04, tris: 40000, floor: -3.2, nozzles: [] },
  a400m: { file: 'a400m_v1.stl', up: 'y', len: 45.1, tris: 40000, floor: -3.2, nozzles: [] },
};
const CREASE = Math.cos(38 * Math.PI / 180);   // au-delà de cet angle entre deux faces, l'arête reste vive

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'dogfight', 'avions');

function readSTL(path) {
  const b = readFileSync(path), n = b.readUInt32LE(80);
  if (84 + 50 * n !== b.length) throw new Error(`${path} : STL binaire attendu`);
  const p = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) p[t * 9 + k] = b.readFloatLE(84 + t * 50 + 12 + k * 4);
  return p;
}

// soudure des sommets confondus, à 1/20 000 de la taille près
function weld(soup) {
  let lo = Infinity, hi = -Infinity;
  for (const v of soup) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const q = (hi - lo) / 20000, map = new Map(), pos = [], idx = new Uint32Array(soup.length / 3);
  for (let i = 0; i < idx.length; i++) {
    const x = soup[i * 3], y = soup[i * 3 + 1], z = soup[i * 3 + 2], key = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(x, y, z); }
    idx[i] = j;
  }
  // triangles dégénérés (deux coins soudés) : enlevés
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) if (idx[t] !== idx[t + 1] && idx[t + 1] !== idx[t + 2] && idx[t] !== idx[t + 2]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  return { pos: new Float32Array(pos), idx: new Uint32Array(keep) };
}

// Remise d'aplomb : la longueur est l'axe horizontal le plus long… sauf pour les gros porteurs, plus larges que longs :
// on prend celui qui n'est pas l'envergure, c'est-à-dire celui où la pièce la plus haute (la dérive) est au bout.
function orient(pos, idx, def) {
  const n = pos.length / 3, A = { x: 0, y: 1, z: 2 }, up = A[def.up], hz = [0, 1, 2].filter((a) => a !== up);
  const ext = (a) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const v = pos[i * 3 + a]; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
  const E = [0, 1, 2].map(ext);
  // la dérive : le point le plus haut ; il est au bout de l'axe de la longueur, au milieu de celui de l'envergure
  let top = 0; for (let i = 1; i < n; i++) if (pos[i * 3 + up] > pos[top * 3 + up]) top = i;
  const off = (a) => Math.abs(pos[top * 3 + a] - (E[a][0] + E[a][1]) / 2) / (E[a][1] - E[a][0]);
  const L = off(hz[0]) > off(hz[1]) ? hz[0] : hz[1], S = L === hz[0] ? hz[1] : hz[0];
  // le haut : du côté où le modèle s'étend le plus loin de son plan moyen (la dérive monte plus que le ventre ne descend)
  let mid = 0; for (let i = 0; i < n; i++) mid += pos[i * 3 + up]; mid /= n;
  const upSign = E[up][1] - mid > mid - E[up][0] ? 1 : -1;
  // le nez : à l'opposé de la dérive
  const noseSign = pos[top * 3 + L] > (E[L][0] + E[L][1]) / 2 ? -1 : 1;
  // centre : celui de la boîte en long et en large ; en hauteur, le centre des surfaces (le fuselage et les ailes,
  // pas le milieu entre le ventre et le haut de la dérive)
  const s = def.len / (E[L][1] - E[L][0]), c = [0, 1, 2].map((a) => (E[a][0] + E[a][1]) / 2);
  let area = 0, cy = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, d] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3], u = [0, 1, 2].map((k) => pos[b + k] - pos[a + k]), v = [0, 1, 2].map((k) => pos[d + k] - pos[a + k]);
    const ar = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    area += ar; cy += ar * (pos[a + up] + pos[b + up] + pos[d + up]) / 3;
  }
  c[up] = cy / area;
  // x = envergure (signe choisi pour garder un repère direct), y = haut, z = nez
  const out = new Float32Array(pos.length);
  const ey = [0, 0, 0], ez = [0, 0, 0]; ey[up] = upSign; ez[L] = noseSign;
  const ex = [ey[1] * ez[2] - ey[2] * ez[1], ey[2] * ez[0] - ey[0] * ez[2], ey[0] * ez[1] - ey[1] * ez[0]];
  for (let i = 0; i < n; i++) {
    const d = [0, 1, 2].map((a) => pos[i * 3 + a] - c[a]);
    out[i * 3] = (d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2]) * s;
    out[i * 3 + 1] = (d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2]) * s;
    out[i * 3 + 2] = (d[0] * ez[0] + d[1] * ez[1] + d[2] * ez[2]) * s;
  }
  if (def.floor !== undefined) { let lo = Infinity; for (let i = 1; i < out.length; i += 3) lo = Math.min(lo, out[i]); for (let i = 1; i < out.length; i += 3) out[i] += def.floor - lo; }
  return { pos: out, span: (E[S][1] - E[S][0]) * s, height: (E[up][1] - E[up][0]) * s };
}

// Normales : moyenne des faces voisines qui font moins de 38° avec la face ; les coins qui ont la même normale
// sont fusionnés, les autres dédoublés (arêtes vives)
function creased(pos, idx) {
  const nt = idx.length / 3, fn = new Float32Array(nt * 3), nv = pos.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;   // longueur = 2 × aire : pondère
  }
  const around = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) around[idx[t * 3 + k]].push(t);
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const outPos = [], outNor = [], outIdx = new Uint32Array(idx.length), seen = new Map();
  for (let t = 0; t < nt; t++) {
    const [fx, fy, fz] = unit(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]);
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      let sx = 0, sy = 0, sz = 0;
      for (const o of around[v]) {
        const [ox, oy, oz] = unit(fn[o * 3], fn[o * 3 + 1], fn[o * 3 + 2]);
        if (ox * fx + oy * fy + oz * fz >= CREASE) { sx += fn[o * 3]; sy += fn[o * 3 + 1]; sz += fn[o * 3 + 2]; }
      }
      const [nx, ny, nz] = unit(sx, sy, sz), key = `${v}|${Math.round(nx * 64)},${Math.round(ny * 64)},${Math.round(nz * 64)}`;
      let j = seen.get(key);
      if (j === undefined) { j = outPos.length / 3; seen.set(key, j); outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); outNor.push(nx, ny, nz); }
      outIdx[t * 3 + k] = j;
    }
  }
  return { pos: new Float32Array(outPos), nor: new Float32Array(outNor), idx: outIdx, fn };
}

// Matière de chaque triangle : 0 peau, 1 verrière, 2 métal des tuyères
function classify(pos, idx, fn, def) {
  const nt = idx.length / 3, mat = new Uint8Array(nt), [gy, gz, gx, gh, gl] = def.glass || [0, 0, 1e-9, 1e-9, 1e-9];
  for (let t = 0; t < nt; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k] * 3; cx += pos[v] / 3; cy += pos[v + 1] / 3; cz += pos[v + 2] / 3; }
    const ny = fn[t * 3 + 1] / (Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1);
    if (ny > 0.05 && (cx / gx) ** 2 + ((cy - gy) / gh) ** 2 + ((cz - gz) / gl) ** 2 < 1) mat[t] = 1;
    for (const [x, y, z, r] of def.nozzles) if ((cx - x) ** 2 + (cy - y) ** 2 < (r * 1.2) ** 2 && cz < z + 0.9 && cz > z - 0.6) mat[t] = 2;
  }
  return mat;
}

// GLB : un maillage, une primitive par matière, normales sur 8 bits (KHR_mesh_quantization)
function writeGLB(path, pos, nor, idx, mat) {
  const names = ['skin', 'glass', 'metal'], nv = pos.length / 3, big = nv > 65535;
  const n8 = new Int8Array(nv * 4);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) n8[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, nor[i * 3 + k])) * 127);
  const parts = names.map((_, m) => { const l = []; for (let t = 0; t < mat.length; t++) if (mat[t] === m) l.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]); return big ? new Uint32Array(l) : new Uint16Array(l); });
  const lo = [0, 1, 2].map((k) => { let v = Infinity; for (let i = 0; i < nv; i++) v = Math.min(v, pos[i * 3 + k]); return v; });
  const hi = [0, 1, 2].map((k) => { let v = -Infinity; for (let i = 0; i < nv; i++) v = Math.max(v, pos[i * 3 + k]); return v; });
  const chunks = [], views = [], accessors = [];
  let offset = 0;
  const add = (arr, target) => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target }); chunks.push(b); offset += b.length; const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; } return views.length - 1; };
  // positions sur 16 bits, ramenées à la boîte du modèle par l'échelle et la translation du nœud (échelle égale sur
  // les trois axes : les normales restent justes)
  const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), h = Math.max(...[0, 1, 2].map((k) => (hi[k] - lo[k]) / 2)), half = [h, h, h], p16 = new Int16Array(nv * 4);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) p16[i * 4 + k] = Math.round((pos[i * 3 + k] - mid[k]) / h * 32767);
  const pView = add(p16, 34962); views[pView].byteStride = 8;
  accessors.push({ bufferView: pView, componentType: 5122, normalized: true, count: nv, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] });
  const nView = add(n8, 34962); views[nView].byteStride = 4;
  accessors.push({ bufferView: nView, componentType: 5120, normalized: true, count: nv, type: 'VEC3' });
  const prims = [];
  parts.forEach((p, m) => { if (!p.length) return; accessors.push({ bufferView: add(p, 34963), componentType: big ? 5125 : 5123, count: p.length, type: 'SCALAR' }); prims.push({ attributes: { POSITION: 0, NORMAL: 1 }, indices: accessors.length - 1, material: m }); });
  const json = {
    asset: { version: '2.0', generator: 'tools/avions-dogfight.mjs' }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: mid, scale: half }], meshes: [{ primitives: prims }],
    materials: names.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [0.5, 0.53, 0.56, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } })),
    buffers: [{ byteLength: offset }], bufferViews: views, accessors,
  };
  let js = Buffer.from(JSON.stringify(json)); if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const bin = Buffer.concat(chunks), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([head, jh, js, bh, bin]));
  return parts.map((p) => p.length / 3);
}

async function build(dir, key, S, profil) {
  const def = PLANES[key], soup = readSTL(join(dir, key, def.file));
  const w = weld(soup), o = orient(w.pos, w.idx, def);
  let idx = w.idx;
  if (idx.length / 3 > def.tris) {
    const target = def.tris * 3;
    [idx] = S.simplify(idx, o.pos, 3, target, 0.02, []);
    if (idx.length > target * 1.1) [idx] = S.simplify(idx, o.pos, 3, target, 0.05, []);
  }
  // on ne garde que les sommets encore servis
  const remap = new Int32Array(o.pos.length / 3).fill(-1), cIdx = new Uint32Array(idx.length), kept = [];
  for (let i = 0; i < idx.length; i++) { if (remap[idx[i]] < 0) { remap[idx[i]] = kept.length / 3; kept.push(...o.pos.subarray(idx[i] * 3, idx[i] * 3 + 3)); } cIdx[i] = remap[idx[i]]; }
  const cPos = new Float32Array(kept);
  const c = creased(cPos, cIdx);
  if (profil) return profile(c.pos, c.idx, key, o);
  const mat = classify(c.pos, c.idx, c.fn, def);
  mkdirSync(OUT, { recursive: true });
  const counts = writeGLB(join(OUT, key + '.glb'), c.pos, c.nor, c.idx, mat);
  console.log(`${key} : ${w.idx.length / 3} → ${c.idx.length / 3} triangles (peau ${counts[0]}, verrière ${counts[1]}, tuyères ${counts[2]}), ${c.pos.length / 3} sommets, envergure ${o.span.toFixed(1)} m, hauteur ${o.height.toFixed(1)} m`);
}

// Profil : le dessus du fuselage (y max près de l'axe) le long de z, et ce qu'on trouve au bout arrière
function profile(pos, idx, key, o) {
  const nv = pos.length / 3; let zl = Infinity, zh = -Infinity, xh = 0, tipAt = 0, top = 0;
  for (let i = 0; i < nv; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; zl = Math.min(zl, z); zh = Math.max(zh, z); if (Math.abs(x) > xh) { xh = Math.abs(x); tipAt = i; } if (y > pos[top * 3 + 1]) top = i; }
  console.log(`${key} : z ${zl.toFixed(2)} … ${zh.toFixed(2)}, envergure ${o.span.toFixed(2)}, bout d'aile ${[...pos.subarray(tipAt * 3, tipAt * 3 + 3)].map((v) => v.toFixed(2))}, sommet ${[...pos.subarray(top * 3, top * 3 + 3)].map((v) => v.toFixed(2))}`);
  const rows = [];
  for (let z = Math.floor(zh); z >= zl; z -= 0.5) {
    let yt = -Infinity, yb = Infinity, w = 0;
    for (let i = 0; i < nv; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], zz = pos[i * 3 + 2]; if (Math.abs(zz - z) < 0.25) { if (Math.abs(x) < 0.3) { yt = Math.max(yt, y); yb = Math.min(yb, y); } w = Math.max(w, Math.abs(x)); } }
    rows.push(`${z.toFixed(1)}:${yt.toFixed(2)}/${yb.toFixed(2)}/${w.toFixed(1)}`);
  }
  console.log('  z:dessus/dessous/demi-largeur  ' + rows.join('  '));
  // l'arrière : les sommets du dernier mètre, par case de 20 cm en x, y
  const cells = new Map();
  for (let i = 0; i < nv; i++) { const z = pos[i * 3 + 2]; if (z < zl + 1.2) { const k = `${Math.round(pos[i * 3] * 5) / 5},${Math.round(pos[i * 3 + 1] * 5) / 5}`; cells.set(k, Math.min(cells.get(k) ?? Infinity, z)); } }
  console.log('  arrière (x,y→z) : ' + [...cells].sort((a, b) => a[1] - b[1]).slice(0, 40).map(([k, z]) => `${k}→${z.toFixed(2)}`).join(' '));
}

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.log('usage : node tools/avions-dogfight.mjs dossier [avion…] [--profil]'); process.exit(1); }
const profil = rest.includes('--profil'), keys = rest.filter((a) => a !== '--profil');
const mod = await import(process.env.MESHOPT ? pathToFileURL(process.env.MESHOPT).href : 'meshoptimizer');
const S = mod.MeshoptSimplifier; await S.ready;
for (const key of keys.length ? keys : Object.keys(PLANES)) await build(dir, key, S, profil);
