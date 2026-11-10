// The Backrooms - Les modèles Poly Haven (CC0) posés en grand nombre : chaque nœud racine d'un .glb est un morceau
// (un tuyau droit, un coude, une vanne…) que l'on place autant de fois qu'on veut. Seuls les exemplaires proches de
// la caméra, et pas dans son dos, sont dessinés à chaque image : des milliers de pièces pour le prix de quelques
// centaines.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

const MODELS = new URL('../models/', import.meta.url).href;
const loader = new GLTFLoader();
const cache = new Map();

// name → Promise(Map(morceau → [{ geo, mat, m }])) ; m place le maillage dans le repère du morceau (son origine,
// sans le décalage qui range les morceaux côte à côte dans le fichier)
export function loadKit(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      new Promise((resolve) =>
        loader.load(
          MODELS + name + '.glb',
          (g) => {
            const pieces = new Map();
            g.scene.updateMatrixWorld(true);
            for (const root of g.scene.children) {
              const back = new THREE.Matrix4().makeTranslation(-root.position.x, -root.position.y, -root.position.z);
              const parts = [];
              root.traverse((o) => {
                if (!o.isMesh) return;
                const mat = Array.isArray(o.material) ? o.material[0] : o.material;
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                parts.push({ geo: o.geometry, mat, m: back.clone().multiply(o.matrixWorld) });
              });
              pieces.set(root.name, parts);
            }
            resolve(pieces);
          },
          undefined,
          () => resolve(new Map()),
        ),
      ),
    );
  }
  return cache.get(name);
}

// convert(mat, kitName, pieceName, variant) → { mat, glass } : la matière de la scène pour une matière du modèle ;
// glass : une vitre qui s'allume (sa couleur vient de l'exemplaire : glow(item) → THREE.Color ou null). Un morceau
// nommé "piece@variante" est le même maillage avec une autre matière (un tuyau peint en rouge, une tige rouillée…).
export function createKitInstancer({ group, convert }) {
  const lists = new Map(); // "kit|morceau" → exemplaires
  const sets = [];
  const add = (kit, piece, matrix, extra = {}) => {
    const key = kit + '|' + piece;
    if (!lists.has(key)) lists.set(key, []);
    const e = matrix.elements;
    lists.get(key).push({ m: matrix.clone(), x: e[12], z: e[14], ...extra });
  };
  // un morceau posé : position, rotation autour de y, échelle (nombre ou [x, y, z]), et rotations en plus
  const tmp = new THREE.Object3D();
  const put = (kit, piece, x, y, z, ry = 0, s = 1, extra, rx = 0, rz = 0) => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(rx, ry, rz, 'YXZ');
    if (Array.isArray(s)) tmp.scale.set(s[0], s[1], s[2]);
    else tmp.scale.setScalar(s);
    tmp.updateMatrix();
    add(kit, piece, tmp.matrix, extra);
  };
  const build = (glow) => {
    const kits = new Set([...lists.keys()].map((k) => k.split('|')[0]));
    for (const kit of kits) {
      loadKit(kit).then((pieces) => {
        for (const [key, items] of lists) {
          const [k, pv] = key.split('|');
          const [piece, variant = ''] = pv.split('@');
          if (k !== kit || !pieces.has(piece)) continue;
          for (const part of pieces.get(piece)) {
            const { mat, glass } = convert(part.mat, kit, piece, variant);
            const mesh = new THREE.InstancedMesh(part.geo, mat, items.length);
            mesh.frustumCulled = false;
            mesh.count = 0;
            if (glass) mesh.setColorAt(0, new THREE.Color());
            const mats = new Float32Array(items.length * 16);
            const tmpM = new THREE.Matrix4();
            items.forEach((it, i) => tmpM.copy(it.m).multiply(part.m).toArray(mats, i * 16));
            group.add(mesh);
            sets.push({ mesh, items, mats, glass, glow });
          }
        }
      });
    }
  };
  // à chaque image : seuls les exemplaires à moins de R mètres, et pas loin derrière la caméra
  const update = (cx, cz, fx, fz, R = 38) => {
    const R2 = R * R;
    for (const s of sets) {
      const arr = s.mesh.instanceMatrix.array;
      const mats = s.mats;
      let n = 0;
      for (let i = 0; i < s.items.length; i++) {
        const it = s.items[i];
        const dx = it.x - cx;
        const dz = it.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        if (d2 > 30 && dx * fx + dz * fz < -0.4 * Math.sqrt(d2)) continue;
        // sa matrice (16 nombres), recopiée à la main : subarray créerait une vue par exemplaire visible, à chaque
        // image (des milliers dans les Tuyauteries, autant de déchets pour le ramasse-miettes)
        const o = n * 16;
        const m = i * 16;
        for (let k = 0; k < 16; k++) arr[o + k] = mats[m + k];
        if (s.glass) {
          const c = s.glow(it);
          s.mesh.instanceColor.setXYZ(n, c.r, c.g, c.b);
        }
        n++;
      }
      s.mesh.count = n;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (s.glass) s.mesh.instanceColor.needsUpdate = true;
    }
  };
  return { add, put, build, update };
}
