// Prépare le personnage de The Backrooms : « Hazmat Suit » de Cj.savage (Sketchfab, CC BY 4.0,
// https://sketchfab.com/3d-models/hazmat-suit-2819a9b345fb44958fc025fb52610526).
// Le modèle d'origine n'a pas de squelette : on le met à l'échelle (1,78 m, pieds au sol, regard vers +z), on lui pose
// un squelette de 45 os (trois par doigt, deux au pouce, pour serrer la lampe) et on calcule le poids de chaque os sur
// chaque sommet. Maillage d'origine conservé (rien n'est simplifié) : les bras, collés au corps au scan, en sont
// détachés et les trous refermés (des pièces lissées sur les gants), le bout des manches est lissé. La texture est
// repeinte en jaune sous les bras et au bas des manches, où le scan n'avait vu que de l'ombre et de la crasse, les gants
// sont débarrassés de leurs taches jaunes, et elle est agrandie en 4096 (nette de près, en vue subjective).
//
//   node tools/rig-hazmat.mjs <hazmat_suit.glb de Sketchfab> [backrooms/models/hazmat_suit.glb]
//
// Les poids : chaque sommet va d'abord à une partie du corps (tronc, un bras, une jambe) selon sa distance à l'os
// rapportée à l'épaisseur du membre, et selon le sens de sa surface (la face d'un bras tournée vers le torse n'est pas
// du torse) ; puis, le long de la partie, il passe d'un os au suivant en douceur autour de chaque articulation ; enfin
// quelques passes de lissage sur le maillage gomment les marches.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '../backrooms/models/hazmat_suit.glb');
if (!SRC) {
  console.error('usage : node tools/rig-hazmat.mjs <source.glb> [sortie.glb]');
  process.exit(1);
}
const HEIGHT = 1.78;

// ---------- lecture du .glb ----------
function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un .glb');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl;
  const bin = buf.subarray(bo + 8, bo + 8 + buf.readUInt32LE(bo));
  return { json, bin };
}
const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(g, i) {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = NCOMP[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
  const out = new T(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset + off);
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const o = k * stride + c * T.BYTES_PER_ELEMENT;
      out[k * n + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint32Array ? dv.getUint32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : dv.getUint8(o);
    }
  }
  return out;
}

// ---------- matrices 4×4 (colonnes, comme glTF) ----------
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let rI = 0; rI < 4; rI++) for (let k = 0; k < 4; k++) r[c * 4 + rI] += a[k * 4 + rI] * b[c * 4 + k];
  return r;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// ---------- le maillage d'origine, dans le repère du monde ----------
const src = readGlb(fs.readFileSync(SRC));
const prims = [];
(function walk(list, parent) {
  for (const i of list) {
    const n = src.json.nodes[i];
    const M = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of src.json.meshes[n.mesh].primitives) {
        const pos = accessor(src, p.attributes.POSITION);
        const nrm = accessor(src, p.attributes.NORMAL);
        const uv = accessor(src, p.attributes.TEXCOORD_0);
        const idx = accessor(src, p.indices);
        const P = new Float32Array(pos.length);
        const N = new Float32Array(nrm.length);
        for (let k = 0; k < pos.length; k += 3) {
          const [x, y, z] = [pos[k], pos[k + 1], pos[k + 2]];
          P[k] = M[0] * x + M[4] * y + M[8] * z + M[12];
          P[k + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
          P[k + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
          const [a, b, c] = [nrm[k], nrm[k + 1], nrm[k + 2]];
          let nx = M[0] * a + M[4] * b + M[8] * c;
          let ny = M[1] * a + M[5] * b + M[9] * c;
          let nz = M[2] * a + M[6] * b + M[10] * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          N[k] = nx / l;
          N[k + 1] = ny / l;
          N[k + 2] = nz / l;
        }
        prims.push({ P, N, uv, idx, material: p.material });
      }
    }
    walk(n.children || [], M);
  }
})(src.json.scenes[src.json.scene || 0].nodes, ident());

// la texture, décodée par Python (PIL, comme tools/glb-webp.py) : la couleur sous chaque sommet dit où sont les gants
// noirs (une main posée contre la hanche y est soudée : sans ça, le bout des doigts resterait collé à la hanche)
const texImg = src.json.images[src.json.textures[src.json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
const texBv = src.json.bufferViews[texImg.bufferView];
const raw = execFileSync('python3', ['-I', '-c', 'import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB");sys.stdout.buffer.write(im.width.to_bytes(4,"little")+im.height.to_bytes(4,"little")+im.tobytes())'], { input: src.bin.subarray(texBv.byteOffset || 0, (texBv.byteOffset || 0) + texBv.byteLength), maxBuffer: 1 << 28 });
const TW = raw.readUInt32LE(0);
const TH = raw.readUInt32LE(4);
const texel = (u, v) => {
  const x = Math.min(TW - 1, Math.max(0, Math.floor((u - Math.floor(u)) * TW)));
  const y = Math.min(TH - 1, Math.max(0, Math.floor((v - Math.floor(v)) * TH)));
  const o = 8 + (y * TW + x) * 3;
  return [raw[o], raw[o + 1], raw[o + 2]];
};
for (const p of prims) {
  p.dark = new Uint8Array(p.P.length / 3);
  for (let k = 0; k < p.dark.length; k++) {
    const [r, g, b] = texel(p.uv[k * 2], p.uv[k * 2 + 1]);
    // le jaune de la combinaison a beaucoup de rouge et de vert ; le gant est gris-noir
    p.dark[k] = Math.max(r, g, b) < 150 && Math.max(r, g, b) - Math.min(r, g, b) < 50 ? 1 : 0;
  }
}

// à l'échelle : 1,78 m, pieds à y = 0 (les repères ci-dessous sont dans les unités d'origine, de -1 à 1)
let y0 = Infinity;
let y1 = -Infinity;
for (const p of prims) for (let k = 1; k < p.P.length; k += 3) {
  y0 = Math.min(y0, p.P[k]);
  y1 = Math.max(y1, p.P[k]);
}
const S = HEIGHT / (y1 - y0);
const toM = ([x, y, z]) => [x * S, (y - y0) * S, z * S];
for (const p of prims) for (let k = 0; k < p.P.length; k += 3) {
  p.P[k] *= S;
  p.P[k + 1] = (p.P[k + 1] - y0) * S;
  p.P[k + 2] *= S;
}

// ---------- le squelette ----------
// articulations relevées sur le modèle (unités d'origine ; gauche du personnage = +x)
const J = {
  pelvis: [0, -0.24, -0.06], spine: [0, -0.02, -0.06], chest: [0, 0.24, -0.07], neck: [0, 0.57, -0.08], head: [0, 0.68, -0.04], top: [0, 1.0, 0.0],
  shoulderL: [0.27, 0.47, -0.09], elbowL: [0.32, 0.22, -0.11], wristL: [0.33, -0.01, -0.05], tipL: [0.32, -0.22, 0.0],
  shoulderR: [-0.27, 0.47, -0.09], elbowR: [-0.33, 0.22, -0.11], wristR: [-0.34, -0.01, -0.05], tipR: [-0.33, -0.22, 0.0],
  hipL: [0.11, -0.27, -0.06], kneeL: [0.14, -0.59, -0.07], ankleL: [0.17, -0.87, -0.1], toeL: [0.19, -0.97, 0.15],
  hipR: [-0.12, -0.27, -0.06], kneeR: [-0.16, -0.59, -0.07], ankleR: [-0.19, -0.87, -0.1], toeR: [-0.21, -0.97, 0.15],
};
for (const k in J) J[k] = toM(J[k]);
// les jointures des doigts : un peu avant le milieu de la main (les doigts se replient d'un bloc, sur la lampe)
const knuckles = () => {
  for (const side of ['L', 'R']) {
    const w = J['wrist' + side];
    const t = J['tip' + side];
    J['knuckle' + side] = [w[0] + (t[0] - w[0]) * 0.45, w[1] + (t[1] - w[1]) * 0.45, w[2] + (t[2] - w[2]) * 0.45];
  }
};
knuckles();
// nom, tête, queue, parent, rayon (m), partie du corps
const s = (u) => u * S;
const BONES = [
  ['Hips', 'pelvis', 'spine', null, s(0.2), 'T'],
  ['Spine', 'spine', 'chest', 'Hips', s(0.21), 'T'],
  ['Chest', 'chest', 'neck', 'Spine', s(0.21), 'T'],
  ['Neck', 'neck', 'head', 'Chest', s(0.1), 'T'],
  ['Head', 'head', 'top', 'Neck', s(0.15), 'T'],
];
for (const side of ['L', 'R']) {
  BONES.push(
    ['UpperArm' + side, 'shoulder' + side, 'elbow' + side, 'Chest', s(0.075), 'A' + side],
    ['LowerArm' + side, 'elbow' + side, 'wrist' + side, 'UpperArm' + side, s(0.065), 'A' + side],
    ['Hand' + side, 'wrist' + side, 'knuckle' + side, 'LowerArm' + side, s(0.05), 'A' + side],
    ['Fingers' + side, 'knuckle' + side, 'tip' + side, 'Hand' + side, s(0.045), 'A' + side],
    ['UpperLeg' + side, 'hip' + side, 'knee' + side, 'Hips', s(0.14), 'L' + side],
    ['LowerLeg' + side, 'knee' + side, 'ankle' + side, 'UpperLeg' + side, s(0.11), 'L' + side],
    ['Foot' + side, 'ankle' + side, 'toe' + side, 'LowerLeg' + side, s(0.07), 'L' + side],
  );
}
let NB = BONES.length;
let BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// chaînes : la suite des os de chaque partie, et la demi-largeur du fondu à chaque articulation (m)
const CHAINS = {
  T: { bones: ['Hips', 'Spine', 'Chest', 'Neck', 'Head'], h: [s(0.08), s(0.1), s(0.04), s(0.04)] },
};
for (const side of ['L', 'R']) {
  CHAINS['A' + side] = { root: 'Chest', lat: side === 'L' ? 1 : -1, k: 1, h0: s(0.05), bones: ['UpperArm' + side, 'LowerArm' + side, 'Hand' + side, 'Fingers' + side], h: [s(0.05), s(0.03), s(0.025)] };
  CHAINS['L' + side] = { root: 'Hips', lat: side === 'L' ? 1 : -1, k: 0.5, h0: s(0.06), bones: ['UpperLeg' + side, 'LowerLeg' + side, 'Foot' + side], h: [s(0.06), s(0.035)] };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const head = (b) => J[BONES[BI[b]][1]];
const tail = (b) => J[BONES[BI[b]][2]];
const dirOf = (b) => norm(sub(tail(b), head(b)));

// la partie du corps d'un sommet : l'os le plus « proche » (distance / rayon), pénalisé si la surface lui tourne le dos
const PELVIS_Y = J.pelvis[1];
const CROTCH_Y = toM([0, -0.42, 0])[1];
function partOf(v, n, dark) {
  // un gant noir à hauteur des mains : c'est la main, même collée à la hanche
  if (dark && Math.abs(v[0]) > s(0.18) && v[1] < J.wristL[1] + s(0.06) && v[1] > J.tipL[1] - s(0.06)) return v[0] > 0 ? 'AL' : 'AR';
  let best = 0;
  let bc = Infinity;
  for (let i = 0; i < NB; i++) {
    const [name, a, c, , r, part] = BONES[i];
    const side = part[1];
    if (part[0] === 'L' && v[1] > PELVIS_Y + s(0.05)) continue; // pas de jambe au-dessus du bassin
    if (part === 'T' && v[1] < CROTCH_Y) continue; // ni de tronc sous l'entrejambe
    if (part[0] === 'A' && (v[1] < J.tipL[1] - s(0.05) || v[1] > J.neck[1] + s(0.05) || Math.abs(v[0]) < s(0.12))) continue;
    if (side && Math.abs(v[0]) > s(0.02) && (side === 'L') !== v[0] > 0) continue;
    const A = J[a];
    const AC = sub(J[c], A);
    const t = Math.min(1, Math.max(0, dot(sub(v, A), AC) / dot(AC, AC)));
    const q = [A[0] + AC[0] * t, A[1] + AC[1] * t, A[2] + AC[2] * t];
    const d = sub(v, q);
    const dl = Math.hypot(d[0], d[1], d[2]) || 1e-6;
    const vis = dot(n, d) / dl;
    const cost = dl / r + (vis < 0 ? -vis * 3.5 : 0);
    if (cost < bc) {
      bc = cost;
      best = i;
    }
    void name;
  }
  return BONES[best][5];
}

// le long d'une partie : un plan par articulation (bissectrice des deux os), un fondu de part et d'autre
function chainWeights(v, part, w) {
  const ch = CHAINS[part];
  const bs = ch.bones;
  const a = [];
  for (let j = 1; j < bs.length; j++) {
    const J0 = head(bs[j]);
    const nrm = norm([dirOf(bs[j - 1])[0] + dirOf(bs[j])[0], dirOf(bs[j - 1])[1] + dirOf(bs[j])[1], dirOf(bs[j - 1])[2] + dirOf(bs[j])[2]]);
    a.push(smooth(-ch.h[j - 1], ch.h[j - 1], dot(sub(v, J0), nrm)));
  }
  // a[j-1] : la part « passée » l'articulation j ; on la garde décroissante le long de la chaîne
  for (let j = 1; j < a.length; j++) a[j] = Math.min(a[j], a[j - 1]);
  const segW = [];
  segW.push(1 - (a[0] ?? 0));
  for (let j = 1; j < bs.length; j++) segW.push(a[j - 1] - (a[j] ?? 0));
  let k0 = 1;
  if (ch.root) {
    // l'attache au tronc (épaule, hanche) : plan entre la direction latérale et celle du membre
    const d = dirOf(bs[0]);
    const nrm = norm([ch.lat * ch.k + d[0], d[1], d[2]]);
    k0 = smooth(-ch.h0, ch.h0, dot(sub(v, head(bs[0])), nrm));
    w[BI[ch.root]] += 1 - k0;
  }
  for (let j = 0; j < bs.length; j++) w[BI[bs[j]]] += segW[j] * k0;
}

// ---------- les poids ----------
// sommets soudés par position (les coutures de texture dédoublent les sommets) : mêmes poids des deux côtés
const keyOf = (x, y, z) => `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
const weld = new Map();
const wpos = [];
const wnrm = [];
const wdark = [];
const wuv = [];
for (const p of prims) {
  p.wid = new Int32Array(p.P.length / 3);
  for (let k = 0; k < p.wid.length; k++) {
    const key = keyOf(p.P[k * 3], p.P[k * 3 + 1], p.P[k * 3 + 2]);
    let id = weld.get(key);
    if (id === undefined) {
      id = wpos.length;
      weld.set(key, id);
      wpos.push([p.P[k * 3], p.P[k * 3 + 1], p.P[k * 3 + 2]]);
      wnrm.push([0, 0, 0]);
      wdark.push(0);
      wuv.push([p.uv[k * 2], p.uv[k * 2 + 1]]);
    }
    if (p.dark[k]) wdark[id] = 1;
    const n = wnrm[id];
    n[0] += p.N[k * 3];
    n[1] += p.N[k * 3 + 1];
    n[2] += p.N[k * 3 + 2];
    p.wid[k] = id;
  }
}
const NW = wpos.length;
const WN = wnrm.map(norm);
const part = new Array(NW);
// voisins sur le maillage d'origine
const nbrAll = Array.from({ length: NW }, () => new Set());
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const a = p.wid[p.idx[t]];
  const b = p.wid[p.idx[t + 1]];
  const c = p.wid[p.idx[t + 2]];
  nbrAll[a].add(b).add(c);
  nbrAll[b].add(a).add(c);
  nbrAll[c].add(a).add(b);
}
const label = () => {
  for (let i = 0; i < NW; i++) part[i] = partOf(wpos[i], WN[i], wdark[i]);
  // les îlots : un sommet dont presque tous les voisins sont d'une autre partie la rejoint (quelques passes)
  for (let it = 0; it < 10; it++) {
    const nxt = part.slice();
    for (let i = 0; i < NW; i++) {
      const cnt = {};
      let n = 0;
      for (const j of nbrAll[i]) {
        cnt[part[j]] = (cnt[part[j]] || 0) + 1;
        n++;
      }
      for (const k in cnt) if (k !== part[i] && cnt[k] > n * 0.5 && !(wdark[i] && part[i][0] === 'A' && wpos[i][1] < J.wristL[1] + s(0.06))) nxt[i] = k;
    }
    for (let i = 0; i < NW; i++) part[i] = nxt[i];
  }
};
label();
// recalage des coudes, poignets, genoux, chevilles : au centre de la section du membre à l'articulation
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const REFINE = [
  ['elbow', 'UpperArm', 'LowerArm', 'A', true],
  ['wrist', 'LowerArm', 'Hand', 'A', false],
  ['knee', 'UpperLeg', 'LowerLeg', 'L', true],
  ['ankle', 'LowerLeg', 'LowerLeg', 'L', false],
];
for (let pass = 0; pass < 2; pass++) {
  for (const side of ['L', 'R']) {
    for (const [jn, b0, b1, P, bis] of REFINE) {
      const key = jn + side;
      const Jp = J[key];
      const nrm = bis ? norm(add(dirOf(b0 + side), dirOf(b1 + side))) : dirOf(b0 + side);
      const mn = [Infinity, Infinity, Infinity];
      const mx = [-Infinity, -Infinity, -Infinity];
      let cnt = 0;
      for (let i = 0; i < NW; i++) {
        if (part[i] !== P + side) continue;
        const v = wpos[i];
        const d = sub(v, Jp);
        if (Math.abs(dot(d, nrm)) > s(0.015) || Math.hypot(d[0], d[1], d[2]) > s(0.2)) continue;
        cnt++;
        for (let c = 0; c < 3; c++) {
          mn[c] = Math.min(mn[c], v[c]);
          mx[c] = Math.max(mx[c], v[c]);
        }
      }
      if (cnt > 20) J[key] = [(mn[0] + mx[0]) / 2, Jp[1], (mn[2] + mx[2]) / 2];
    }
  }
  knuckles();
  label();
}
const fromM = ([x, y, z]) => [x / S, y / S + y0, z / S].map((u) => +u.toFixed(3));
console.log('articulations recalées :', Object.fromEntries(['elbowL', 'wristL', 'kneeL', 'ankleL', 'elbowR', 'wristR', 'kneeR', 'ankleR'].map((k) => [k, fromM(J[k])])));

// le bout des manches : le modèle d'origine y a des pointes de tissu en dents de scie, bien visibles de près (ses
// propres poignets, au milieu de l'écran en vue subjective). Ce bord seul est lissé (Taubin : sans faire fondre la
// manche, les fronces restent), en fondu sur sa largeur ; ses normales sont recalculées
const CUFF = [-0.02, 0.0, 0.07, 0.1]; // le long de l'avant-bras, depuis le poignet vers le coude (m) : début, plein, plein, fin
const cuffW = new Float32Array(NW);
for (const side of ['L', 'R']) {
  const W0 = J['wrist' + side];
  const up = norm(sub(J['elbow' + side], W0));
  for (let i = 0; i < NW; i++) {
    if (part[i] !== 'A' + side || wdark[i]) continue; // le gant, dessous, ne bouge pas
    const d = sub(wpos[i], W0);
    const t = dot(d, up);
    const r = Math.hypot(d[0] - up[0] * t, d[1] - up[1] * t, d[2] - up[2] * t);
    if (t <= CUFF[0] || t >= CUFF[3] || r > 0.1) continue;
    cuffW[i] = smooth(CUFF[0], CUFF[1], t) * (1 - smooth(CUFF[2], CUFF[3], t));
  }
}
const cuffIds = [];
for (let i = 0; i < NW; i++) if (cuffW[i] > 0) cuffIds.push(i);
for (let it = 0; it < 24; it++) {
  const f = it % 2 ? -0.53 : 0.5;
  const lap = cuffIds.map((i) => {
    const c = [0, 0, 0];
    let n = 0;
    for (const j of nbrAll[i]) {
      c[0] += wpos[j][0];
      c[1] += wpos[j][1];
      c[2] += wpos[j][2];
      n++;
    }
    return n ? sub([c[0] / n, c[1] / n, c[2] / n], wpos[i]) : [0, 0, 0];
  });
  cuffIds.forEach((i, k) => {
    for (let c = 0; c < 3; c++) wpos[i][c] += lap[k][c] * f * cuffW[i];
  });
}
const cuffN = new Map(cuffIds.map((i) => [i, [0, 0, 0]]));
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const ids = [p.wid[p.idx[t]], p.wid[p.idx[t + 1]], p.wid[p.idx[t + 2]]];
  if (!ids.some((i) => cuffN.has(i))) continue;
  const e1 = sub(wpos[ids[1]], wpos[ids[0]]);
  const e2 = sub(wpos[ids[2]], wpos[ids[0]]);
  const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  for (const i of ids) if (cuffN.has(i)) for (let c = 0; c < 3; c++) cuffN.get(i)[c] += fn[c];
}
for (const [i, nv] of cuffN) {
  const nn = norm(nv);
  // l'ancienne normale se garde là où le bord n'est presque pas lissé
  WN[i] = norm(WN[i].map((x, c) => x * (1 - cuffW[i]) + nn[c] * cuffW[i]));
}
for (const p of prims) for (let k = 0; k < p.wid.length; k++) {
  const i = p.wid[k];
  if (!cuffW[i]) continue;
  for (let c = 0; c < 3; c++) {
    p.P[k * 3 + c] = wpos[i][c];
    p.N[k * 3 + c] = WN[i][c];
  }
}
console.log(`bout des manches lissé : ${cuffIds.length} sommets`);

// là où la combinaison se touche (avant-bras contre la hanche, main contre la cuisse), le maillage d'origine est soudé :
// ces triangles-là relieraient deux membres et s'étireraient en toile dès qu'ils bougent. On les retire (puis on
// referme les trous, plus bas). Ceux de l'aisselle et du haut du bras restent.
const cuts = (pa, pb, c) => {
  if (pa === pb) return false;
  const A = pa[0] === 'A' ? pa : pb[0] === 'A' ? pb : null;
  if (!A) return pa[0] === 'L' && pb[0] === 'L';
  const other = A === pa ? pb : pa;
  // la manche contre le flanc, au-dessus du coude : on garde le tissu, il s'étire comme une combinaison ample quand le
  // bras se lève ; l'avant-bras et la main contre la hanche : séparés
  if (other === 'T') return c[1] < J['elbow' + A[1]][1];
  return true;
};
let cut = 0;
const touched = new Uint8Array(NW);
for (const p of prims) {
  const keep = [];
  for (let t = 0; t < p.idx.length; t += 3) {
    const ids = [p.wid[p.idx[t]], p.wid[p.idx[t + 1]], p.wid[p.idx[t + 2]]];
    const c = [0, 1, 2].map((k) => (wpos[ids[0]][k] + wpos[ids[1]][k] + wpos[ids[2]][k]) / 3);
    if (cuts(part[ids[0]], part[ids[1]], c) || cuts(part[ids[1]], part[ids[2]], c) || cuts(part[ids[0]], part[ids[2]], c)) {
      cut++;
      for (const id of ids) touched[id] = 1;
      continue;
    }
    keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
  }
  p.idx = Uint32Array.from(keep);
}
console.log(`triangles de contact retirés : ${cut}`);

const W = new Float32Array(NW * NB);
for (let i = 0; i < NW; i++) {
  const w = new Float32Array(NB);
  chainWeights(wpos[i], part[i], w);
  W.set(w, i * NB);
}
// voisins sur le maillage, puis lissage (chaque passe étale d'une arête)
const nbr = Array.from({ length: NW }, () => new Set());
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const a = p.wid[p.idx[t]];
  const b = p.wid[p.idx[t + 1]];
  const c = p.wid[p.idx[t + 2]];
  nbr[a].add(b).add(c);
  nbr[b].add(a).add(c);
  nbr[c].add(a).add(b);
}
const NBR = nbr.map((st) => Int32Array.from(st));
let cur = W;
for (let it = 0; it < 6; it++) {
  const nxt = new Float32Array(cur.length);
  for (let i = 0; i < NW; i++) {
    const ns = NBR[i];
    for (let b = 0; b < NB; b++) {
      let acc = 0;
      for (let m = 0; m < ns.length; m++) acc += cur[ns[m] * NB + b];
      nxt[i * NB + b] = cur[i * NB + b] * 0.5 + (ns.length ? (acc / ns.length) * 0.5 : cur[i * NB + b] * 0.5);
    }
  }
  cur = nxt;
}
// ---------- les doigts et le pouce ----------
// Un seul os pour les quatre doigts, pliés d'un bloc : ils ne pouvaient pas s'enrouler autour de la lampe. Chaque doigt
// a maintenant ses trois phalanges, et le pouce deux : mesurés sur le gant (les doigts pendent, côte à côte en z ; le
// pouce devant, côté paume). La part de la main (os Hand et Fingers) est redistribuée : la paume, chaque phalange,
// le pouce, en fondu aux articulations. Mesures exportées (extras de l'os Hand) pour la prise des objets.
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const handInfo = {};
const kmeans1 = (vals, k) => {
  const v = vals.slice().sort((a, b) => a - b);
  const c = Array.from({ length: k }, (_, j) => v[Math.floor(((j + 0.5) / k) * v.length)]);
  for (let it = 0; it < 30; it++) {
    const sum = new Float64Array(k);
    const cnt = new Float64Array(k);
    for (const x of v) {
      let b = 0;
      for (let j = 1; j < k; j++) if (Math.abs(x - c[j]) < Math.abs(x - c[b])) b = j;
      sum[b] += x;
      cnt[b]++;
    }
    for (let j = 0; j < k; j++) if (cnt[j]) c[j] = sum[j] / cnt[j];
  }
  return c;
};
for (const side of ['L', 'R']) {
  const sg = side === 'R' ? 1 : -1; // la paume regarde +x (main droite), -x (main gauche)
  const Wr = J['wrist' + side];
  const ids = [];
  for (let i = 0; i < NW; i++) if (part[i] === 'A' + side && wpos[i][1] < Wr[1] - 0.005) ids.push(i);
  let yTip = Infinity;
  for (const i of ids) yTip = Math.min(yTip, wpos[i][1]);
  const yM = Wr[1] - 0.47 * (Wr[1] - yTip); // les jointures (articulation des doigts sur la main)
  const inw = (i) => sg * wpos[i][0]; // vers la paume
  const mid = ids.filter((i) => wpos[i][1] < yM - 0.02 && wpos[i][1] > yTip + 0.02);
  const xsF = mid.map((i) => inw(i)).sort((a, b) => a - b);
  const xF = xsF[xsF.length >> 1]; // la ligne des doigts
  // le pouce : nettement côté paume, au-dessus du bout des doigts (repliés, eux aussi côté paume)
  const zs = ids.map((i) => wpos[i][2]).sort((a, b) => a - b);
  const zMed = zs[zs.length >> 1];
  const core = ids.filter((i) => inw(i) - xF > 0.05 && wpos[i][1] > yM - 0.035 && wpos[i][1] < yM + 0.045 && wpos[i][2] > zMed + 0.02);
  const tc = [0, 0, 0];
  for (const i of core) for (let c = 0; c < 3; c++) tc[c] += wpos[i][c] / core.length;
  // son axe : la direction de plus grande étendue (itérations de puissance), orientée vers le bas
  let ax = [0, -1, 0];
  for (let it = 0; it < 30; it++) {
    const nx = [0, 0, 0];
    for (const i of core) {
      const d = sub(wpos[i], tc);
      const k = dot(d, ax);
      for (let c = 0; c < 3; c++) nx[c] += d[c] * k;
    }
    ax = norm(nx);
  }
  if (ax[1] > 0) ax = ax.map((x) => -x);
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const i of core) {
    const t = dot(sub(wpos[i], tc), ax);
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
  }
  const at = (t) => [tc[0] + ax[0] * t, tc[1] + ax[1] * t, tc[2] + ax[2] * t];
  J['thumb0' + side] = at(t0 - 0.015); // la base, dans l'éminence
  J['thumb1' + side] = at(t0 + 0.35 * (t1 - t0));
  J['thumb2' + side] = at(t1 - 0.006);
  const thumbOf = (i) => {
    const d = sub(wpos[i], J['thumb0' + side]);
    const t = dot(d, ax);
    const r = Math.hypot(d[0] - ax[0] * t, d[1] - ax[1] * t, d[2] - ax[2] * t);
    return (1 - smooth(0.018, 0.026, r)) * smooth(-0.005, 0.01, t) * smooth(0.028, 0.04, inw(i) - xF);
  };
  // les doigts : quatre bandes en z (k-moyennes), du plus en avant (l'index, côté pouce) au plus en arrière
  const fing = mid.filter((i) => thumbOf(i) < 0.3 && wpos[i][1] < yM - 0.025 && wpos[i][1] > yTip + 0.012);
  const zc = kmeans1(fing.map((i) => wpos[i][2]), 4).sort((a, b) => b - a);
  const near = (z) => {
    let b = 0;
    for (let j = 1; j < 4; j++) if (Math.abs(z - zc[j]) < Math.abs(z - zc[b])) b = j;
    return b;
  };
  const info = { sg, xF, zc, fingers: [] };
  FINGERS.forEach((F, k) => {
    const own = ids.filter((i) => wpos[i][1] < yM + 0.01 && thumbOf(i) < 0.3 && near(wpos[i][2]) === k);
    let tipY = Infinity;
    for (const i of own) tipY = Math.min(tipY, wpos[i][1]);
    // le milieu du doigt à une hauteur donnée : centre des sommets de ce doigt à ±3 mm (en remontant si trop peu)
    const centre = (y) => {
      for (const h of [0.003, 0.006, 0.012]) {
        const q = own.filter((i) => Math.abs(wpos[i][1] - y) < h);
        if (q.length >= 6) {
          let mn = Infinity;
          let mx = -Infinity;
          let zs = 0;
          for (const i of q) {
            mn = Math.min(mn, wpos[i][0]);
            mx = Math.max(mx, wpos[i][0]);
            zs += wpos[i][2];
          }
          return [(mn + mx) / 2, y, zs / q.length];
        }
      }
      return [sg * xF, y, zc[k]];
    };
    const yMk = yM + [0.002, 0, 0.004, 0.012][k]; // l'arc des jointures : l'auriculaire plus haut
    const len = yMk - tipY;
    const pts = [yMk, yMk - 0.46 * len, yMk - 0.75 * len, tipY + 0.008].map(centre);
    ['mcp', 'pip', 'dip', 'tip'].forEach((jn, j) => (J[jn + F + side] = pts[j]));
    // l'épaisseur du doigt (côté paume - dos), à mi-phalange
    // (au milieu de la phalange du milieu, en travers du doigt : il y est bien séparé de ses voisins)
    const dd = norm(sub(pts[2], pts[1]));
    const mp = [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2, zc[k]];
    const nn = norm([-dd[1], dd[0], 0]);
    let mn = Infinity;
    let mx = -Infinity;
    let nq = 0;
    for (const i of own) {
      const d = sub(wpos[i], mp);
      if (Math.abs(dot(d, dd)) > 0.004 || Math.abs(d[2]) > 0.012) continue;
      const e = dot(d, nn);
      mn = Math.min(mn, e);
      mx = Math.max(mx, e);
      nq++;
    }
    info.fingers.push({ name: F, thick: nq > 4 && mx - mn < 0.05 ? mx - mn : 0.032 });
  });
  // la paume : sa face, juste au-dessus des jointures (hors pouce)
  const palmV = ids.filter((i) => wpos[i][1] > yM && wpos[i][1] < yM + 0.035 && thumbOf(i) < 0.2).map((i) => inw(i)).sort((a, b) => a - b);
  info.palm = palmV.length ? palmV[Math.floor(palmV.length * 0.9)] : xF + 0.03;
  info.thumbOf = thumbOf;
  info.near = near;
  info.thumbAx = ax;
  handInfo[side] = info;
  console.log(`main ${side} : doigts en z ${zc.map((z) => z.toFixed(3)).join(' ')}, ligne x ${(sg * xF).toFixed(3)}, paume ${(sg * info.palm).toFixed(3)}, épaisseurs ${info.fingers.map((f) => f.thick.toFixed(3)).join(' ')}, pouce ${core.length} sommets`);
}
// les nouveaux os : à la place de Fingers, trois phalanges par doigt et deux pour le pouce
{
  const old = BONES.slice();
  const oldBI = BI;
  const nb = old.filter((b) => !/^Fingers[LR]$/.test(b[0]));
  for (const side of ['L', 'R']) {
    for (const F of FINGERS) {
      nb.push([F + '1' + side, 'mcp' + F + side, 'pip' + F + side, 'Hand' + side, s(0.02), 'A' + side]);
      nb.push([F + '2' + side, 'pip' + F + side, 'dip' + F + side, F + '1' + side, s(0.02), 'A' + side]);
      nb.push([F + '3' + side, 'dip' + F + side, 'tip' + F + side, F + '2' + side, s(0.02), 'A' + side]);
    }
    nb.push(['Thumb1' + side, 'thumb0' + side, 'thumb1' + side, 'Hand' + side, s(0.02), 'A' + side]);
    nb.push(['Thumb2' + side, 'thumb1' + side, 'thumb2' + side, 'Thumb1' + side, s(0.02), 'A' + side]);
  }
  const NB2 = nb.length;
  const BI2 = Object.fromEntries(nb.map((b, i) => [b[0], i]));
  const cur2 = new Float32Array(NW * NB2);
  const below = (y, j, hw) => smooth(j + hw, j - hw, y); // 0 au-dessus de l'articulation, 1 en dessous
  for (let i = 0; i < NW; i++) {
    for (const b of nb) if (oldBI[b[0]] !== undefined) cur2[i * NB2 + BI2[b[0]]] = cur[i * NB + oldBI[b[0]]];
    const side = part[i][0] === 'A' ? part[i][1] : null;
    if (!side) continue;
    const h = cur[i * NB + oldBI['Hand' + side]] + cur[i * NB + oldBI['Fingers' + side]];
    if (h <= 0) continue;
    const info = handInfo[side];
    const v = wpos[i];
    const mt = info.thumbOf(i);
    // le long du pouce
    const T0 = J['thumb0' + side];
    const tt = dot(sub(v, T0), info.thumbAx);
    const t1 = dot(sub(J['thumb1' + side], T0), info.thumbAx);
    const tb0 = smooth(-0.012, 0.012, tt);
    const tb1 = smooth(t1 - 0.008, t1 + 0.008, tt);
    // entre deux doigts : un fondu sur quelques millimètres
    const zc = info.zc;
    const g = zc.map((z) => Math.exp(-(((v[2] - z) / 0.009) ** 2)));
    const gs = g.reduce((a, x) => a + x, 0) || 1;
    let hand = mt * (1 - tb0);
    FINGERS.forEach((F, k) => {
      const a = (g[k] / gs) * (1 - mt);
      const bm = below(v[1], J['mcp' + F + side][1], 0.012);
      const bp = below(v[1], J['pip' + F + side][1], 0.008);
      const bd = below(v[1], J['dip' + F + side][1], 0.007);
      hand += a * (1 - bm);
      cur2[i * NB2 + BI2[F + '1' + side]] = h * a * (bm - bp);
      cur2[i * NB2 + BI2[F + '2' + side]] = h * a * (bp - bd);
      cur2[i * NB2 + BI2[F + '3' + side]] = h * a * bd;
    });
    cur2[i * NB2 + BI2['Hand' + side]] = h * hand;
    cur2[i * NB2 + BI2['Thumb1' + side]] = h * mt * (tb0 - tb1);
    cur2[i * NB2 + BI2['Thumb2' + side]] = h * mt * tb1;
  }
  BONES.length = 0;
  BONES.push(...nb);
  NB = NB2;
  BI = BI2;
  cur = cur2;
}
// les quatre os les plus forts, en octets dont la somme fait 255
function quant(wv, jOut, wOut, o) {
  const list = [];
  for (let b = 0; b < NB; b++) list.push([wv[b], b]);
  list.sort((x, y) => y[0] - x[0]);
  const top = list.slice(0, 4);
  const sum = top.reduce((acc, [x]) => acc + x, 0) || 1;
  const q = top.map(([x]) => Math.floor((x / sum) * 255));
  let rest = 255 - q.reduce((acc, x) => acc + x, 0);
  const frac = top.map(([x], k) => [(x / sum) * 255 - q[k], k]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; rest > 0; k = (k + 1) % 4, rest--) q[frac[k][1]]++;
  for (let k = 0; k < 4; k++) {
    jOut[o + k] = q[k] ? top[k][1] : 0;
    wOut[o + k] = q[k];
  }
}
const J4 = new Uint8Array(NW * 4);
const W4 = new Uint8Array(NW * 4);
for (let i = 0; i < NW; i++) quant(cur.subarray(i * NB, i * NB + NB), J4, W4, i * 4);

// ---------- sous les bras, le même jaune que partout ----------
// Le scan d'origine a été pris bras le long du corps : sous les bras (le flanc, la hanche sous la main, l'intérieur de
// la manche, la cuisse sous les doigts), la texture est un mélange brun d'ombre et de gant. Bras levé, ça se voyait :
// on y repeint, dans la texture, le jaune uni de la combinaison (les gants restent noirs).
const NEAR0 = 0.02; // jaune plein à moins de 2 cm de l'autre côté du contact
const NEAR1 = 0.045; // fondu jusqu'à 4,5 cm
const UNDER = J.shoulderL[1] - 0.05; // sous l'épaule seulement : la couture de l'épaule garde sa texture
const cellOf = (q) => `${Math.floor(q[0] / NEAR1)},${Math.floor(q[1] / NEAR1)},${Math.floor(q[2] / NEAR1)}`;
const gridOf = (keep) => {
  const g = new Map();
  for (let i = 0; i < NW; i++) if (keep(i)) {
    const k = cellOf(wpos[i]);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(i);
  }
  return g;
};
const gridArm = gridOf((i) => part[i][0] === 'A');
const gridBody = gridOf((i) => part[i][0] !== 'A');
const nearest = (g, q) => {
  let best = Infinity;
  const c = q.map((x) => Math.floor(x / NEAR1));
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const list = g.get(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`);
    if (list) for (const j of list) best = Math.min(best, Math.hypot(wpos[j][0] - q[0], wpos[j][1] - q[1], wpos[j][2] - q[2]));
  }
  return best;
};
const mV = new Float32Array(NW);
for (let i = 0; i < NW; i++) {
  // le gant reste noir (toute la main, sous le poignet, même un reflet clair) ; l'ombre sombre sur la hanche, elle, part
  if (part[i][0] === 'A' && (wdark[i] || wpos[i][1] < J['wrist' + part[i][1]][1] + 0.03)) continue;
  if (wpos[i][1] > UNDER) continue;
  const d = nearest(part[i][0] === 'A' ? gridBody : gridArm, wpos[i]);
  mV[i] = smooth(NEAR1, NEAR0, d);
}
// le jaune : la médiane du tissu du torse, loin des bras
const SUIT = [[], [], []];
for (let i = 0; i < NW; i++) if (part[i] === 'T' && !wdark[i] && mV[i] === 0 && wpos[i][1] > CROTCH_Y && wpos[i][1] < UNDER) {
  const t = texel(wuv[i][0], wuv[i][1]);
  for (let c = 0; c < 3; c++) SUIT[c].push(t[c]);
}
const YEL = SUIT.map((a) => a.sort((x, y) => x - y)[a.length >> 1]);
// Le scan réutilise par endroits les mêmes texels pour deux surfaces (sous la main, la hanche pointe dans l'image du
// gant) : on ne peint donc jamais un texel dont se sert un triangle hors contact. Les triangles entièrement sous le bras
// prennent un carré jaune réservé, dans un coin libre de la texture ; seul le fondu, sur le bord, est peint.
const raster = (p, t, fn) => {
  const ks = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
  const xy = ks.map((k) => [(p.uv[k * 2] - Math.floor(p.uv[k * 2])) * TW, (p.uv[k * 2 + 1] - Math.floor(p.uv[k * 2 + 1])) * TH]);
  const [[ax, ay], [bx, by], [cx, cy]] = xy;
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1);
  const x1 = Math.min(TW - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
  const yA = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1);
  const yB = Math.min(TH - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
  for (let y = yA; y <= yB; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5;
    const py = y + 0.5;
    const l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
    const l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
    const l2 = 1 - l0 - l1;
    if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
    fn(y * TW + x, l0, l1, l2);
  }
};
const FULL = 0.999;
const USED = new Uint8Array(TW * TH); // 1 : texel d'un triangle hors contact (à garder) ; 2 : d'un triangle en fondu
const MASK = new Float32Array(TW * TH);
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const m = [0, 1, 2].map((k) => mV[p.wid[p.idx[t + k]]]);
  if (Math.min(...m) >= FULL) continue;
  if (!(m[0] || m[1] || m[2])) raster(p, t, (o) => (USED[o] = 1));
}
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const m = [0, 1, 2].map((k) => mV[p.wid[p.idx[t + k]]]);
  if (Math.min(...m) >= FULL || !(m[0] || m[1] || m[2])) continue;
  raster(p, t, (o, l0, l1, l2) => {
    if (USED[o] === 1) return;
    USED[o] = 2;
    MASK[o] = Math.max(MASK[o], Math.min(1, Math.max(0, l0 * m[0] + l1 * m[1] + l2 * m[2])));
  });
}
// un texel de plus autour du fondu, seulement dans les marges libres (le filtrage lit les voisins), puis le jaune posé
const GROW = MASK.slice();
for (let y = 1; y < TH - 1; y++) for (let x = 1; x < TW - 1; x++) {
  const o = y * TW + x;
  if (USED[o]) continue;
  GROW[o] = Math.max(MASK[o - 1], MASK[o + 1], MASK[o - TW], MASK[o + TW]);
}
let painted = 0;
for (let o = 0; o < TW * TH; o++) {
  const m = GROW[o];
  if (!m) continue;
  painted++;
  for (let c = 0; c < 3; c++) raw[8 + o * 3 + c] = Math.round(raw[8 + o * 3 + c] * (1 - m) + YEL[c] * m);
}
// ---------- les gants sans taches jaunes ----------
// Main pendante contre la cuisse au scan : l'intérieur du pouce, la paume et le bout des doigts ont pris, dans la
// texture, le jaune de la cuisse. Sur la main (sous le poignet), un texel jaune prend la teinte du gant, assombri ou
// éclairci comme lui ; un texel que partage un triangle hors de la main n'est pas touché.
const lumT = (t) => t[0] * 0.3 + t[1] * 0.59 + t[2] * 0.11;
const isGlove = (i) => part[i][0] === 'A' && wpos[i][1] < J['wrist' + part[i][1]][1] - 0.01;
const NG = new Uint8Array(TW * TH);
const GLV = new Uint8Array(TW * TH);
const toYel = (p, t) => [0, 1, 2].every((k) => mV[p.wid[p.idx[t + k]]] >= FULL); // ira sur le carré jaune
const gloveT = (p, t) => [0, 1, 2].every((k) => isGlove(p.wid[p.idx[t + k]]));
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  if (toYel(p, t)) continue;
  const g = gloveT(p, t);
  raster(p, t, (o) => {
    if (g) GLV[o] = 1;
    else NG[o] = 1;
  });
}
// un triangle du gant dont l'image sert aussi à la hanche (le scan les a superposées) : il passe sur le carré gris du
// gant (plus bas), sans quoi il gardait le jaune du fondu et dessinait un liseré clair autour des pièces
const glvMove = new Set();
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  if (!gloveT(p, t)) continue;
  let shared = false;
  raster(p, t, (o) => (shared = shared || NG[o] === 1));
  if (shared) glvMove.add(p.idx[t] + ',' + p.idx[t + 1] + ',' + p.idx[t + 2] + ',' + prims.indexOf(p));
}
const chromaOf = (o) => Math.max(raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]) - Math.min(raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]);
const warm = (o) => raw[8 + o * 3] >= raw[8 + o * 3 + 2] && raw[8 + o * 3 + 1] >= raw[8 + o * 3 + 2];
const gGrey = [[], [], []];
const yLum = [];
for (let o = 0; o < TW * TH; o++) {
  if (!GLV[o] || NG[o]) continue;
  const t = [raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]];
  if (chromaOf(o) < 30) for (let c = 0; c < 3; c++) gGrey[c].push(t[c]);
  else if (warm(o)) yLum.push(lumT(t));
}
const GLOVE = gGrey.map((a) => a.sort((x, y) => x - y)[a.length >> 1]);
const LUMY = yLum.sort((x, y) => x - y)[yLum.length >> 1] || 1;
let deyel = 0;
for (let o = 0; o < TW * TH; o++) {
  if (!GLV[o] || NG[o] || !warm(o)) continue;
  const m = smooth(30, 70, chromaOf(o));
  if (!m) continue;
  const f = Math.min(1.25, Math.max(0.7, lumT([raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]]) / LUMY));
  for (let c = 0; c < 3; c++) raw[8 + o * 3 + c] = Math.round(raw[8 + o * 3 + c] * (1 - m) + Math.min(255, GLOVE[c] * f) * m);
  deyel++;
}
// La paume, plaquée contre la cuisse au scan, n'a qu'une texture en patchwork (plaques claires, grain sombre) : côté
// paume, le gant garde son grain mais ses écarts de teinte sont ramenés vers le gris du gant (le dos de la main, bien
// photographié, ne change pas)
// (le bord d'un contact compte aussi comme paume, deux rangs de triangles : sinon un liseré clair entourait les pièces)
const nearCut = new Uint8Array(NW);
for (let i = 0; i < NW; i++) if (touched[i]) {
  nearCut[i] = 1;
  for (const j of nbr[i]) nearCut[j] = 1;
}
const PAL = new Float32Array(TW * TH);
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const ids = [0, 1, 2].map((k) => p.wid[p.idx[t + k]]);
  if (!ids.every(isGlove)) continue;
  const e1 = sub(wpos[ids[1]], wpos[ids[0]]);
  const e2 = sub(wpos[ids[2]], wpos[ids[0]]);
  const nx = (e1[1] * e2[2] - e1[2] * e2[1]) / (Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) || 1);
  const w = ids.some((i) => nearCut[i]) ? 1 : smooth(0.05, 0.5, part[ids[0]][1] === 'R' ? nx : -nx);
  if (w) raster(p, t, (o) => {
    if (!NG[o]) PAL[o] = Math.max(PAL[o], w);
  });
}
const LG = lumT(GLOVE);
let calmed = 0;
for (let o = 0; o < TW * TH; o++) {
  const w = PAL[o];
  if (!w) continue;
  const c0 = [raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]];
  const f = Math.min(1.2, Math.max(0.75, 1 + 0.35 * (lumT(c0) / LG - 1)));
  for (let c = 0; c < 3; c++) raw[8 + o * 3 + c] = Math.round(c0[c] * (1 - w) + Math.min(255, GLOVE[c] * f) * w);
  calmed++;
}
console.log(`gants : ${deyel} texels jaunes passés au gris du gant (${GLOVE.join(', ')}), ${calmed} texels de paume adoucis, ${glvMove.size} triangles sur le carré gris`);
// ---------- le bas des manches, sans brûlure ----------
// Au scan, le bas de chaque manche, contre le gant, porte une crasse brun-orangé, comme brûlée : au poignet, de près
// (en vue subjective, ou la main d'un coéquipier), on aurait dit du rouge au talon de la main. Ce bandeau prend le jaune
// de la combinaison, assombri dans les plis comme elle ; le gant noir et le reste de la manche ne changent pas, ni un
// texel que partage un autre triangle.
const slvW = new Float32Array(NW);
for (const side of ['L', 'R']) {
  const W0 = J['wrist' + side];
  const up = norm(sub(J['elbow' + side], W0));
  for (let i = 0; i < NW; i++) {
    if (part[i] !== 'A' + side || isGlove(i)) continue;
    const t = dot(sub(wpos[i], W0), up);
    slvW[i] = smooth(-0.04, -0.02, t) * (1 - smooth(0.08, 0.12, t));
  }
}
const SLW = new Float32Array(TW * TH);
const KEEP = new Uint8Array(TW * TH);
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  if (toYel(p, t) || gloveT(p, t)) continue;
  const w = [0, 1, 2].map((k) => slvW[p.wid[p.idx[t + k]]]);
  if (Math.min(...w) > 0) raster(p, t, (o, l0, l1, l2) => (SLW[o] = Math.max(SLW[o], Math.min(1, l0 * w[0] + l1 * w[1] + l2 * w[2]))));
  else raster(p, t, (o) => (KEEP[o] = 1));
}
const hueW = (o) => {
  const [r, g, b] = [raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]];
  return r >= g && g >= b && r > b ? (60 * (g - b)) / (r - b) : -1;
};
const ySl = [];
for (let o = 0; o < TW * TH; o++) if (SLW[o] && !KEEP[o] && !GLV[o] && hueW(o) >= 47 && chromaOf(o) >= 60) ySl.push(lumT([raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]]));
const LYS = ySl.sort((x, y) => x - y)[ySl.length >> 1] || lumT(YEL);
let unburnt = 0;
for (let o = 0; o < TW * TH; o++) {
  if (!SLW[o] || KEEP[o] || GLV[o]) continue;
  const h = hueW(o);
  if (h < 0) continue;
  const m = SLW[o] * smooth(46, 36, h) * smooth(18, 45, chromaOf(o));
  if (!m) continue;
  const f = Math.min(1.05, Math.max(0.55, lumT([raw[8 + o * 3], raw[8 + o * 3 + 1], raw[8 + o * 3 + 2]]) / LYS));
  for (let c = 0; c < 3; c++) raw[8 + o * 3 + c] = Math.round(raw[8 + o * 3 + c] * (1 - m) + Math.min(255, YEL[c] * f) * m);
  unburnt++;
}
console.log(`bas des manches : ${unburnt} texels brun-orangé passés au jaune de la combinaison`);
// le carré jaune : un bloc de 16 texels (aligné sur ceux du JPEG) dont ni lui ni ses voisins ne servent à rien ; un
// deuxième, gris du gant, pour les pièces qui referment les trous des gants
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) raster(p, t, (o) => (USED[o] = USED[o] || 3));
const squares = [];
const freeSquare = (col) => {
  for (let by = 16; by < TH - 32; by += 16) for (let bx = 16; bx < TW - 32; bx += 16) {
    let free = true;
    for (let y = by - 16; y < by + 32 && free; y++) for (let x = bx - 16; x < bx + 32; x++) if (USED[y * TW + x]) {
      free = false;
      break;
    }
    if (!free) continue;
    for (let y = by - 8; y < by + 24; y++) for (let x = bx - 8; x < bx + 24; x++) {
      for (let c = 0; c < 3; c++) raw[8 + (y * TW + x) * 3 + c] = col[c];
      USED[y * TW + x] = 4;
    }
    squares.push([bx + 8, by + 8]);
    return [(bx + 8) / TW, (by + 8) / TH];
  }
  throw new Error('pas de coin libre dans la texture pour un carré de couleur unie');
};
const yellowUV = freeSquare(YEL);
const gloveSq = freeSquare(GLOVE);
// les triangles entièrement sous le bras passent dans un morceau à part, posé sur le carré (les autres morceaux gardent
// leurs sommets et leurs coordonnées : pas un de plus, les index restent sur 16 bits)
let toYellow = 0;
const yel = { P: [], N: [], uv: [], wid: [], idx: [], at: yellowUV };
const glv = { P: [], N: [], uv: [], wid: [], idx: [], at: gloveSq };
prims.forEach((p, pi) => {
  const keep = [];
  const seen = [new Map(), new Map()];
  for (let t = 0; t < p.idx.length; t += 3) {
    const y = [0, 1, 2].every((k) => mV[p.wid[p.idx[t + k]]] >= FULL);
    const g = !y && glvMove.has(p.idx[t] + ',' + p.idx[t + 1] + ',' + p.idx[t + 2] + ',' + pi);
    if (!y && !g) {
      keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
      continue;
    }
    if (y) toYellow++;
    const dst = y ? yel : glv;
    const sn = seen[y ? 0 : 1];
    for (let k = 0; k < 3; k++) {
      const v = p.idx[t + k];
      if (!sn.has(v)) {
        sn.set(v, dst.wid.length);
        dst.P.push(p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]);
        dst.N.push(p.N[v * 3], p.N[v * 3 + 1], p.N[v * 3 + 2]);
        dst.uv.push(dst.at[0], dst.at[1]);
        dst.wid.push(p.wid[v]);
      }
      dst.idx.push(sn.get(v));
    }
  }
  p.idx = Uint32Array.from(keep);
});
for (const d of [yel, glv]) if (d.idx.length) prims.push({ P: Float32Array.from(d.P), N: Float32Array.from(d.N), uv: Float32Array.from(d.uv), wid: Int32Array.from(d.wid), idx: Uint32Array.from(d.idx) });
// La texture, deux fois plus fine (4096 au lieu de 2048) : de près (ses propres bras en vue subjective), un texel
// d'origine couvrait deux à trois pixels d'écran, flou. Elle est agrandie au filtre de Lanczos puis avivée (masque
// flou), après que la couleur du bord de chaque îlot a été poussée dans le vide autour : sans ça, l'avivage et le
// sous-échantillonnage des couleurs du JPEG dessinaient un liseré le long des coutures. Le carré jaune compte comme
// utilisé (ses abords libres ne sont pas repeints par-dessus).
const UPSCALE_PY = `
import sys, io
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
d = sys.stdin.buffer.read()
w = int.from_bytes(d[0:4], 'little'); h = int.from_bytes(d[4:8], 'little')
col = np.frombuffer(d[8:8 + w * h * 3], np.uint8).reshape(h, w, 3).astype(np.float32)
m = np.frombuffer(d[8 + w * h * 3:8 + w * h * 4], np.uint8).reshape(h, w) > 0
k = np.ones((3, 3), np.float32)
for _ in range(16):
    n = ndimage.convolve(m.astype(np.float32), k, mode='wrap')
    grow = ~m & (n > 0)
    if not grow.any(): break
    for c in range(3):
        s = ndimage.convolve(col[..., c] * m, k, mode='wrap')
        col[..., c][grow] = s[grow] / n[grow]
    m |= grow
img = Image.fromarray(np.clip(np.rint(col), 0, 255).astype(np.uint8))
img = img.resize((w * 2, h * 2), Image.Resampling.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))
b = io.BytesIO(); img.save(b, 'JPEG', quality=93, subsampling=2, optimize=True)
sys.stdout.buffer.write(b.getvalue())
`;
const texIn = src.bin.subarray(texBv.byteOffset || 0, (texBv.byteOffset || 0) + texBv.byteLength);
const usedTex = Buffer.alloc(TW * TH);
for (let o = 0; o < TW * TH; o++) usedTex[o] = USED[o] ? 1 : 0;
for (const [cx, cy] of squares) for (let y = cy - 16; y < cy + 16; y++) for (let x = cx - 16; x < cx + 16; x++) usedTex[y * TW + x] = 1;
const texOut = execFileSync('python3', ['-I', '-c', UPSCALE_PY], { input: Buffer.concat([raw, usedTex]), maxBuffer: 1 << 28 });
console.log(`sous les bras : ${toYellow} triangles en jaune uni, ${painted} texels de fondu repeints (${YEL.join(', ')}) ; texture ${TW}×${TH} → ${TW * 2}×${TH * 2}, ${(texIn.length / 1e6).toFixed(2)} → ${(texOut.length / 1e6).toFixed(2)} Mo`);

// ---------- les trous laissés par la séparation, refermés ----------
// Le long d'un contact, le maillage d'origine n'a pas de tissu sous la manche ni sur l'intérieur du gant : une fois
// séparés, ce sont des trous (on voyait l'envers du tissu). Chaque bord de trou est refermé en éventail, de son côté
// (le flanc d'un côté, la manche de l'autre), d'une couleur unie prise sur son bord.
const dirE = new Map();
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const v = [p.wid[p.idx[t]], p.wid[p.idx[t + 1]], p.wid[p.idx[t + 2]]];
  for (let k = 0; k < 3; k++) {
    const key = v[k] * NW + v[(k + 1) % 3];
    dirE.set(key, (dirE.get(key) || 0) + 1);
  }
}
// une arête de bord : prise une fois de plus dans un sens que dans l'autre (le scan a, par endroits, un triangle
// retourné sur le bord d'un contact : l'arête y sert trois fois, deux dans un sens, une dans l'autre ; sans ce compte,
// le bord du trou s'y arrêtait et le trou restait ouvert, sous l'avant-bras gauche). Un bout de bord suffit qu'il
// touche un triangle retiré par l'un de ses deux sommets (là, le bord longe le triangle retourné)
const nextOf = new Map();
for (const [key, n] of dirE) {
  const a = Math.floor(key / NW);
  const b = key % NW;
  if (n - (dirE.get(b * NW + a) || 0) !== 1 || !(touched[a] || touched[b])) continue;
  if (!nextOf.has(a)) nextOf.set(a, []);
  nextOf.get(a).push(b);
}
const usedE = new Set();
const loops = [];
for (const [a0, list] of nextOf) {
  for (const b0 of list) {
    if (usedE.has(a0 * NW + b0)) continue;
    usedE.add(a0 * NW + b0);
    const loop = [a0];
    let c = b0;
    let guard = 0;
    while (c !== a0 && guard++ < 20000) {
      loop.push(c);
      const nx = (nextOf.get(c) || []).find((b) => !usedE.has(c * NW + b));
      if (nx === undefined) break;
      usedE.add(c * NW + nx);
      c = nx;
    }
    if (c === a0 && loop.length >= 3) loops.push(loop);
  }
}
const fill = { P: [], N: [], uv: [], j: [], w: [] };
let fillTris = 0;
const crossV = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
// un système linéaire plein (élimination de Gauss, pivot partiel), trois seconds membres (x, y, z)
function solveDense(A, B, m) {
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r * m + c]) > Math.abs(A[p * m + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < m; k++) [A[c * m + k], A[p * m + k]] = [A[p * m + k], A[c * m + k]];
      for (let k = 0; k < 3; k++) [B[c * 3 + k], B[p * 3 + k]] = [B[p * 3 + k], B[c * 3 + k]];
    }
    const d = A[c * m + c];
    if (Math.abs(d) < 1e-14) continue;
    for (let r = c + 1; r < m; r++) {
      const f = A[r * m + c] / d;
      if (!f) continue;
      for (let k = c; k < m; k++) A[r * m + k] -= f * A[c * m + k];
      for (let k = 0; k < 3; k++) B[r * 3 + k] -= f * B[c * 3 + k];
    }
  }
  for (let c = m - 1; c >= 0; c--) for (let k = 0; k < 3; k++) {
    let s = B[c * 3 + k];
    for (let j = c + 1; j < m; j++) s -= A[c * m + j] * B[j * 3 + k];
    B[c * 3 + k] = s / (A[c * m + c] || 1);
  }
}
// Un trou du gant (la paume contre la cuisse, le bout des doigts posés dessus) : un éventail plat y faisait une cuvette,
// en partie retournée (on voyait l'envers du gant, des trous). La pièce y est une vraie surface : triangulée sur son bord
// (aire minimale, face dehors comme le gant autour), raffinée jusqu'à la taille des triangles voisins (Liepa), puis
// tendue (bilaplacien, le bord et l'anneau de gant autour fixes) : elle prolonge la courbure du gant, bombée comme le
// talon de la paume ou la pulpe d'un doigt. Chaque arête du bord y est parcourue dans le sens opposé au gant voisin :
// même face dehors, sans retourner de triangle après coup.
let handPatches = 0;
let patchFlips = 0;
// la normale d'un sommet du bord venait encore des triangles collés à la cuisse (retirés) : un liseré clair longeait
// les pièces. Elle est refaite sur la surface finale : les faces du gant autour, plus celles de la pièce
const exN = Array.from({ length: NW }, () => [0, 0, 0]);
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => p.wid[p.idx[t + k]]);
  const fn = crossV(sub(wpos[b], wpos[a]), sub(wpos[c], wpos[a]));
  for (const v of [a, b, c]) for (let q = 0; q < 3; q++) exN[v][q] += fn[q];
}
const newN = new Map();
function fairPatch(loop) {
  const n = loop.length;
  const ring = loop.slice().reverse();
  const X = ring.map((v) => wpos[v].slice());
  const sig = ring.map((v) => {
    let s = 0;
    for (const u of nbr[v]) s += Math.hypot(...sub(wpos[u], wpos[v]));
    return nbr[v].size ? s / nbr[v].size : 0.004;
  });
  const tnorm = (a, b, c) => crossV(sub(X[b], X[a]), sub(X[c], X[a]));
  // 1) le polygone du bord, triangulé : aire minimale ; un triangle qui tourne le dos au gant autour coûte plus cher
  const cost = (a, b, c) => {
    const cr = tnorm(a, b, c);
    const ar = 0.5 * Math.hypot(...cr);
    const ne = norm(add(add(WN[ring[a]], WN[ring[b]]), WN[ring[c]]));
    const cs = ar > 1e-12 ? dot(cr, ne) / (2 * ar) : 0;
    return ar * (1 + 4 * (1 - cs));
  };
  const Wt = new Float64Array(n * n);
  const Ot = new Int32Array(n * n);
  for (let len = 2; len < n; len++) for (let i = 0; i + len < n; i++) {
    const j = i + len;
    let best = Infinity;
    for (let k = i + 1; k < j; k++) {
      const w = Wt[i * n + k] + Wt[k * n + j] + cost(i, k, j);
      if (w < best) {
        best = w;
        Ot[i * n + j] = k;
      }
    }
    Wt[i * n + j] = best;
  }
  const tris = [];
  const rec = (i, j) => {
    if (j - i < 2) return;
    const k = Ot[i * n + j];
    tris.push([i, k, j]);
    rec(i, k);
    rec(k, j);
  };
  rec(0, n - 1);
  // 2) raffinée : un triangle plus grand que ses voisins est coupé en trois à son centre, puis les arêtes intérieures
  // sont basculées vers des triangles plus réguliers (sans retourner la pièce)
  const key = (u, v) => u * 65536 + v;
  const ang = (o, a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(X[a], X[o])), norm(sub(X[b], X[o]))))));
  const relax = () => {
    for (let it = 0; it < 60; it++) {
      const E = new Map();
      tris.forEach((t, ti) => {
        for (let q = 0; q < 3; q++) E.set(key(t[q], t[(q + 1) % 3]), ti);
      });
      const done = new Uint8Array(tris.length);
      let flips = 0;
      for (let ti = 0; ti < tris.length; ti++) {
        for (let q = 0; q < 3 && !done[ti]; q++) {
          const [u, v, w] = [tris[ti][q], tris[ti][(q + 1) % 3], tris[ti][(q + 2) % 3]];
          const tj = E.get(key(v, u));
          if (tj === undefined || done[tj]) continue;
          const z = tris[tj].find((x) => x !== u && x !== v);
          if (E.has(key(w, z)) || E.has(key(z, w))) continue;
          if (ang(w, u, v) + ang(z, v, u) <= Math.PI + 1e-6) continue;
          const n0 = add(norm(tnorm(u, v, w)), norm(tnorm(v, u, z)));
          if (dot(tnorm(w, u, z), n0) <= 0 || dot(tnorm(z, v, w), n0) <= 0) continue;
          tris[ti] = [w, u, z];
          tris[tj] = [z, v, w];
          done[ti] = done[tj] = 1;
          flips++;
        }
      }
      if (!flips) break;
    }
  };
  // des triangles un peu plus fins que le gant autour : le bout d'un doigt refermé reste rond, sans facettes
  const FINE = 0.6;
  for (let pass = 0; pass < 30; pass++) {
    let split = 0;
    const nt = tris.length;
    for (let t = 0; t < nt; t++) {
      const [a, b, c] = tris[t];
      const p = [0, 1, 2].map((q) => (X[a][q] + X[b][q] + X[c][q]) / 3);
      const sp = (sig[a] + sig[b] + sig[c]) / 3;
      const big = [a, b, c].every((m) => {
        const d = Math.SQRT2 * Math.hypot(...sub(p, X[m]));
        return d > FINE * sp && d > FINE * sig[m];
      });
      if (!big) continue;
      const m = X.length;
      X.push(p);
      sig.push(sp);
      tris[t] = [a, b, m];
      tris.push([b, c, m], [c, a, m]);
      split++;
    }
    if (!split) break;
    relax();
  }
  // un triangle posé sur trois sommets du bord (au fond d'une fente du trou) ne bougerait pas avec la pièce : il y
  // restait parfois retourné. Coupé en trois à son centre, la pièce tendue le remet à l'endroit
  for (let t = tris.length - 1; t >= 0; t--) {
    const [a, b, c] = tris[t];
    if (a >= n || b >= n || c >= n) continue;
    const m = X.length;
    X.push([0, 1, 2].map((q) => (X[a][q] + X[b][q] + X[c][q]) / 3));
    sig.push((sig[a] + sig[b] + sig[c]) / 3);
    tris[t] = [a, b, m];
    tris.push([b, c, m], [c, a, m]);
  }
  // 3) tendue : bilaplacien nul à l'intérieur (laplacien uniforme), le bord et le premier anneau de gant autour fixes
  const NV = X.length;
  const nb = Array.from({ length: NV }, () => new Set());
  for (const [a, b, c] of tris) {
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  const loc = new Map(ring.map((v, q) => [v, q]));
  const ext = ring.map((v) => [...nbr[v]].filter((u) => !loc.has(u)).map((u) => wpos[u]));
  const deg = nb.map((s, i) => s.size + (i < n ? ext[i].length : 0));
  const Uc = [];
  const Ue = [];
  for (let k = 0; k < NV; k++) {
    const mp = new Map([[k, -1]]);
    for (const m of nb[k]) mp.set(m, (mp.get(m) || 0) + 1 / deg[k]);
    const e = [0, 0, 0];
    if (k < n) for (const pp of ext[k]) for (let q = 0; q < 3; q++) e[q] += pp[q] / deg[k];
    Uc.push(mp);
    Ue.push(e);
  }
  const NI = NV - n;
  if (NI > 0) {
    const A = new Float64Array(NI * NI);
    const B = new Float64Array(NI * 3);
    for (let i = n; i < NV; i++) {
      const r = i - n;
      const row = new Map();
      const cst = [0, 0, 0];
      const addU = (k, f) => {
        for (const [m, c] of Uc[k]) row.set(m, (row.get(m) || 0) + f * c);
        for (let q = 0; q < 3; q++) cst[q] += f * Ue[k][q];
      };
      for (const k of nb[i]) addU(k, 1 / deg[i]);
      addU(i, -1);
      for (const [m, c] of row) {
        if (m >= n) A[r * NI + m - n] += c;
        else for (let q = 0; q < 3; q++) B[r * 3 + q] -= c * X[m][q];
      }
      for (let q = 0; q < 3; q++) B[r * 3 + q] -= cst[q];
    }
    solveDense(A, B, NI);
    for (let i = n; i < NV; i++) for (let q = 0; q < 3; q++) X[i][q] = B[(i - n) * 3 + q];
  }
  // la peau : les poids du bord, étalés en douceur (harmoniques) vers l'intérieur
  const Wl = Array.from({ length: NV }, (_, i) => (i < n ? Float64Array.from(cur.subarray(ring[i] * NB, ring[i] * NB + NB)) : new Float64Array(NB)));
  const avg = new Float64Array(NB);
  for (let q = 0; q < n; q++) for (let b = 0; b < NB; b++) avg[b] += Wl[q][b] / n;
  for (let i = n; i < NV; i++) Wl[i].set(avg);
  for (let it = 0; it < 200; it++) for (let i = n; i < NV; i++) {
    const acc = new Float64Array(NB);
    for (const k of nb[i]) for (let b = 0; b < NB; b++) acc[b] += Wl[k][b];
    for (let b = 0; b < NB; b++) Wl[i][b] = acc[b] / nb[i].size;
  }
  const jq = new Uint8Array(NV * 4);
  const wq = new Uint8Array(NV * 4);
  for (let i = 0; i < NV; i++) {
    if (i < n) {
      jq.set(J4.subarray(ring[i] * 4, ring[i] * 4 + 4), i * 4);
      wq.set(W4.subarray(ring[i] * 4, ring[i] * 4 + 4), i * 4);
    } else quant(Wl[i], jq, wq, i * 4);
  }
  // normales : celles du gant sur le bord, celles de la pièce dedans
  const Nl = Array.from({ length: NV }, () => [0, 0, 0]);
  const sumN = () => {
    for (const v of Nl) v.fill(0);
    for (const [a, b, c] of tris) {
      const cr = tnorm(a, b, c);
      for (const v of [a, b, c]) for (let q = 0; q < 3; q++) Nl[v][q] += cr[q];
    }
  };
  sumN();
  // au fond d'une fente très étroite, la pièce tendue se plie : quelques triangles y restaient à l'envers et, vus de
  // dehors, montraient leur dos (un liseré clair près du pouce). Ils sont remis dans le sens de la surface autour
  for (let it = 0; it < 3; it++) {
    let flips = 0;
    for (const t of tris) {
      const ref = t.reduce((s, v) => add(s, v < n ? norm(add(Nl[v], exN[ring[v]])) : norm(Nl[v])), [0, 0, 0]);
      if (dot(tnorm(...t), ref) >= 0) continue;
      [t[1], t[2]] = [t[2], t[1]];
      flips++;
    }
    patchFlips += flips;
    if (!flips) break;
    sumN();
  }
  for (let q = 0; q < n; q++) newN.set(ring[q], norm(add(Nl[q], exN[ring[q]])));
  const uv = gloveSq;
  for (const t of tris) {
    for (const v of t) {
      fill.P.push(...X[v]);
      fill.N.push(...(v < n ? newN.get(ring[v]) : norm(Nl[v])));
      fill.uv.push(uv[0], uv[1]);
      fill.j.push(...jq.subarray(v * 4, v * 4 + 4));
      fill.w.push(...wq.subarray(v * 4, v * 4 + 4));
    }
    fillTris++;
  }
  handPatches++;
}
for (const loop of loops) {
  // un trou du gant seul : une pièce tendue (ci-dessus)
  const P0 = part[loop[0]];
  const cy = loop.reduce((s, v) => s + wpos[v][1], 0) / loop.length;
  if (P0[0] === 'A' && loop.every((v) => part[v] === P0) && cy < J['wrist' + P0[1]][1] + 0.03) {
    fairPatch(loop);
    continue;
  }
  // chaque partie qui borde le trou reçoit sa propre pièce, qui la suit. Le corps (flanc, cuisse) couvre tout le trou tel
  // qu'il est au repos : le bras parti, le flanc reste entier. Le bras ne couvre que son côté : chaque suite de ses
  // sommets le long du bord, refermée d'un bout à l'autre, en éventail autour de son centre. L'intérieur de la manche est
  // fermé (sans fente le long de l'avant-bras quand il s'écarte), sans aileron qui dépasse quand il se lève.
  const parts = [...new Set(loop.map((v) => part[v]))];
  const n = loop.length;
  const pieces = [];
  for (const P of parts) {
    if (P[0] !== 'A' || loop.every((v) => part[v] === P)) {
      pieces.push({ P, ring: loop, edges: loop.map((a, k) => [a, loop[(k + 1) % n]]) });
      continue;
    }
    for (let k = 0; k < n; k++) {
      if (part[loop[k]] !== P || part[loop[(k - 1 + n) % n]] === P) continue;
      const run = [];
      for (let m = k; part[loop[m % n]] === P && run.length < n; m++) run.push(loop[m % n]);
      if (run.length < 3) continue;
      const edges = run.slice(1).map((b, q) => [run[q], b]);
      edges.push([run[run.length - 1], run[0]]);
      pieces.push({ P, ring: run, edges });
    }
  }
  for (const { P, ring, edges } of pieces) {
    const own = ring.filter((v) => part[v] === P);
    if (own.length < 2) continue;
    const c = [0, 0, 0];
    for (const v of ring) for (let k = 0; k < 3; k++) c[k] += wpos[v][k] / ring.length;
    const wc = new Float32Array(NB);
    for (const v of own) for (let b = 0; b < NB; b++) wc[b] += cur[v * NB + b] / own.length;
    const jc = new Uint8Array(4);
    const wq = new Uint8Array(4);
    quant(wc, jc, wq, 0);
    // la couleur : le jaune uni de la combinaison, ou le gris du gant
    const glove = P[0] === 'A' && c[1] < J['wrist' + P[1]][1] + 0.03;
    const uv = glove ? gloveSq : yellowUV;
    // les triangles, chacun dans l'ordre opposé à celui du tissu voisin (b, a, …). Le corps : en éventail autour du
    // centre du trou. Un bras : recousu d'une lèvre à l'autre, en échelle depuis le bout ouvert (l'ouverture de
    // l'intérieur de la manche est une fente en C : un éventail depuis son centre passait dans le bras et en ressortait
    // en fils)
    const zip = P[0] === 'A' && ring !== loop;
    const tris = [];
    if (zip) {
      const d2 = (u, v) => {
        const d = sub(wpos[u], wpos[v]);
        return dot(d, d);
      };
      let i = 0;
      let j = ring.length - 1;
      while (j - i > 1) {
        if (d2(ring[i + 1], ring[j]) <= d2(ring[i], ring[j - 1])) {
          tris.push([ring[i + 1], ring[i], ring[j]]);
          i++;
        } else {
          tris.push([ring[i], ring[j], ring[j - 1]]);
          j--;
        }
      }
    } else for (const [ea, eb] of edges) tris.push([eb, ea, -1]); // -1 : le centre
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const at = (v) => (v < 0 ? c : wpos[v]);
    // l'orientation : la pièce regarde vers l'extérieur de sa partie (depuis l'axe de son os le plus lourd)
    let nAvg = [0, 0, 0];
    for (const [x, y, z] of tris) nAvg = add(nAvg, cross(sub(at(y), at(x)), sub(at(z), at(x))));
    nAvg = norm(nAvg);
    const bone = BONES[jc[0]];
    const A = J[bone[1]];
    const AC = sub(J[bone[2]], A);
    const t = Math.min(1, Math.max(0, dot(sub(c, A), AC) / dot(AC, AC)));
    const out = norm(sub(c, [A[0] + AC[0] * t, A[1] + AC[1] * t, A[2] + AC[2] * t]));
    const flip = dot(nAvg, out) < 0;
    const nf = flip ? nAvg.map((x) => -x) : nAvg;
    // le centre, rentré de 4 mm : la pièce ne perce pas la surface d'en face (le bout d'un gant posé sur la cuisse)
    const cin = c.map((x, k) => x - nf[k] * 0.004);
    const pos = (v) => (v < 0 ? cin : wpos[v]);
    const skin = (v) => (v >= 0 && part[v] === P ? [J4.subarray(v * 4, v * 4 + 4), W4.subarray(v * 4, v * 4 + 4)] : [jc, wq]);
    // normales : celles du bord (la pièce prolonge la courbure du tissu autour), celle de la pièce au centre
    const nOf = (v) => (v >= 0 && dot(WN[v], nf) > 0 ? WN[v] : nf);
    for (const t0 of tris) {
      const tri = flip ? [t0[1], t0[0], t0[2]] : [...t0];
      // un éventail d'un seul côté du trou peut tourner un triangle à l'envers : on le remet face dehors
      if (!zip && dot(cross(sub(pos(tri[1]), pos(tri[0])), sub(pos(tri[2]), pos(tri[0]))), nf) < 0) [tri[0], tri[1]] = [tri[1], tri[0]];
      for (const v of tri) {
        const [jj, ww] = skin(v);
        fill.P.push(...pos(v));
        fill.N.push(...nOf(v));
        fill.uv.push(uv[0], uv[1]);
        fill.j.push(...jj);
        fill.w.push(...ww);
      }
      fillTris++;
    }
  }
}
for (const p of prims) for (let k = 0; k < p.wid.length; k++) {
  const nn = newN.get(p.wid[k]);
  if (nn) for (let c = 0; c < 3; c++) p.N[k * 3 + c] = nn[c];
}
console.log(`trous refermés : ${loops.length} bords (${handPatches} sur les gants, en pièces tendues), ${fillTris} triangles`);
if (fillTris) {
  const nv = fill.P.length / 3;
  prims.push({ P: Float32Array.from(fill.P), N: Float32Array.from(fill.N), uv: Float32Array.from(fill.uv), idx: Uint32Array.from({ length: nv }, (_, i) => i), fillJ: Uint8Array.from(fill.j), fillW: Uint8Array.from(fill.w) });
}

// quelques minuscules triangles du scan tournaient le dos à leurs propres normales (des plis du tissu) : dans le jeu, on
// en voyait l'envers, un point clair ou sombre. Remis à l'endroit, ils prennent la teinte de la surface autour
let flipped = 0;
for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) {
  const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
  const at = (k) => [p.P[k * 3], p.P[k * 3 + 1], p.P[k * 3 + 2]];
  const fn = crossV(sub(at(b), at(a)), sub(at(c), at(a)));
  let d = 0;
  for (let q = 0; q < 3; q++) d += fn[q] * (p.N[a * 3 + q] + p.N[b * 3 + q] + p.N[c * 3 + q]);
  if (d >= 0) continue;
  p.idx[t + 1] = c;
  p.idx[t + 2] = b;
  flipped++;
}
console.log(`triangles remis à l'endroit : ${patchFlips} dans les pièces des gants, ${flipped} ailleurs`);

// ---------- écriture du .glb ----------
const chunks = [];
let blen = 0;
const views = [];
const accs = [];
function addView(bytes, target) {
  const pad = (4 - (blen % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    blen += pad;
  }
  views.push({ buffer: 0, byteOffset: blen, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  blen += bytes.byteLength;
  return views.length - 1;
}
function addAcc(arr, type, componentType, extra = {}, target) {
  const n = NCOMP[type];
  const a = { bufferView: addView(arr, target), componentType, count: arr.length / n, type, ...extra };
  accs.push(a);
  return accs.length - 1;
}
const primsOut = [];
for (const p of prims) {
  const nv = p.P.length / 3;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < nv; k++) for (let c = 0; c < 3; c++) {
    mn[c] = Math.min(mn[c], p.P[k * 3 + c]);
    mx[c] = Math.max(mx[c], p.P[k * 3 + c]);
  }
  const jj = new Uint8Array(nv * 4);
  const ww = new Uint8Array(nv * 4);
  if (p.fillJ) {
    jj.set(p.fillJ);
    ww.set(p.fillW);
  } else for (let k = 0; k < nv; k++) {
    jj.set(J4.subarray(p.wid[k] * 4, p.wid[k] * 4 + 4), k * 4);
    ww.set(W4.subarray(p.wid[k] * 4, p.wid[k] * 4 + 4), k * 4);
  }
  const idx = nv <= 65535 ? Uint16Array.from(p.idx) : Uint32Array.from(p.idx);
  primsOut.push({
    attributes: {
      POSITION: addAcc(p.P, 'VEC3', 5126, { min: mn, max: mx }, 34962),
      NORMAL: addAcc(p.N, 'VEC3', 5126, {}, 34962),
      TEXCOORD_0: addAcc(Float32Array.from(p.uv), 'VEC2', 5126, {}, 34962),
      JOINTS_0: addAcc(jj, 'VEC4', 5121, {}, 34962),
      WEIGHTS_0: addAcc(ww, 'VEC4', 5121, { normalized: true }, 34962),
    },
    indices: addAcc(idx, 'SCALAR', idx instanceof Uint16Array ? 5123 : 5125, {}, 34963),
    material: 0,
  });
}
// os : position relative au parent, sans rotation au repos ; matrices inverses de liaison = translations
const ibm = new Float32Array(NB * 16);
BONES.forEach((b, i) => {
  const m = ident();
  const h = J[b[1]];
  m[12] = -h[0];
  m[13] = -h[1];
  m[14] = -h[2];
  ibm.set(m, i * 16);
});
const ibmAcc = addAcc(ibm, 'MAT4', 5126);
// la texture d'origine, repeinte en jaune sous les bras
const img = src.json.images[src.json.textures[src.json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
const imgView = addView(texOut);

const BONE0 = 2;
const nodes = [
  { name: 'HazmatSuit', children: [1, BONE0] },
  { name: 'Body', mesh: 0, skin: 0 },
];
BONES.forEach(([name, a, , parent]) => {
  const h = J[a];
  const ph = parent ? J[BONES[BI[parent]][1]] : [0, 0, 0];
  nodes.push({ name, translation: sub(h, ph) });
});
BONES.forEach(([, , , parent], i) => {
  if (!parent) return;
  const pn = nodes[BONE0 + BI[parent]];
  (pn.children = pn.children || []).push(BONE0 + i);
});
// le bout des doigts et du pouce (pas des os : des repères pour la prise des objets), et les mesures de la main
const addEnd = (name, parent, at, from) => {
  nodes.push({ name, translation: sub(J[at], J[from]) });
  const pn = nodes[BONE0 + BI[parent]];
  (pn.children = pn.children || []).push(nodes.length - 1);
};
for (const side of ['L', 'R']) {
  for (const F of FINGERS) addEnd(F + 'Tip' + side, F + '3' + side, 'tip' + F + side, 'dip' + F + side);
  addEnd('ThumbTip' + side, 'Thumb2' + side, 'thumb2' + side, 'thumb1' + side);
  const info = handInfo[side];
  const th = info.fingers.reduce((a, f) => a + f.thick, 0) / info.fingers.length;
  // palm : la face de la paume (x, repère de la main) ; thick : l'épaisseur d'un doigt
  nodes[BONE0 + BI['Hand' + side]].extras = { palm: +(info.sg * info.palm - J['wrist' + side][0]).toFixed(4), thick: +th.toFixed(4) };
}
const binBuf = Buffer.concat(chunks);
const json = {
  asset: {
    version: '2.0',
    generator: 'tools/rig-hazmat.mjs',
    copyright: 'Cj.savage (https://sketchfab.com/Cj.savage), CC BY 4.0',
    extras: { title: 'Hazmat Suit', author: 'Cj.savage', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', source: 'https://sketchfab.com/3d-models/hazmat-suit-2819a9b345fb44958fc025fb52610526', changes: 'mis à l’échelle, squelette et poids ajoutés' },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  meshes: [{ name: 'Suit', primitives: primsOut }],
  skins: [{ joints: BONES.map((_, i) => BONE0 + i), inverseBindMatrices: ibmAcc, skeleton: BONE0 }],
  materials: [{ name: 'Suit', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 } }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: [{ bufferView: imgView, mimeType: 'image/jpeg' }],
  buffers: [{ byteLength: binBuf.length }],
  bufferViews: views,
  accessors: accs,
};
let js = Buffer.from(JSON.stringify(json), 'utf8');
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([binBuf, Buffer.alloc((4 - (binBuf.length % 4)) % 4)]);
const head12 = Buffer.alloc(12);
head12.writeUInt32LE(0x46546c67, 0);
head12.writeUInt32LE(2, 4);
head12.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
fs.writeFileSync(OUT, Buffer.concat([head12, ch(js.length, 0x4e4f534a), js, ch(binPad.length, 0x004e4942), binPad]));
const parts = {};
for (let i = 0; i < NW; i++) {
  const b = BONES[J4[i * 4]][0];
  parts[b] = (parts[b] || 0) + 1;
}
console.log(`${OUT} : ${(fs.statSync(OUT).size / 1e6).toFixed(2)} Mo, ${NW} sommets soudés, ${prims.reduce((a, p) => a + p.idx.length / 3, 0)} triangles`);
console.log('os dominants :', parts);
