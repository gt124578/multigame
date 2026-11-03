// Le décor de l'archipel : groupe naval, chalutiers, base aérienne. Positions et tailles viennent du moteur
// (les mêmes boîtes servent aux collisions). Chaque objet a une maquette dessinée ici ; un vrai modèle 3D la remplace
// quand il existe (MODELS), chargé à la demande.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';
import { buildArchipel } from '../engine/archipel.js';

// kind → fichier, longueur réelle à donner au modèle, cap du modèle (rad, son axe long vers +X), enfoncement dans l'eau
export const MODELS = {};

// éclairées par le même ciel que les avions : les faces à l'ombre ne virent pas au noir
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...extra });
const GREY = mat(0x7d8790), DARK = mat(0x3f454b), DECK = mat(0x4a4f55), WHITE = mat(0xe9ecee), GLASS = mat(0x2c3c4c), RED = mat(0x8e3a32), CONCRETE = mat(0xb8b4aa), RUST = mat(0x6e4a3a);

// Coque vue du dessus : poupe carrée, étrave en pointe ; extrudée vers le haut
function hull(len, wid, h, bow = 0.22, m = GREY) {
  const s = new THREE.Shape(), L = len / 2, W = wid / 2, B = L - len * bow;
  s.moveTo(-L, -W * 0.9); s.lineTo(B, -W); s.quadraticCurveTo(L * 0.97, -W * 0.6, L, 0); s.quadraticCurveTo(L * 0.97, W * 0.6, B, W); s.lineTo(-L, W * 0.9); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, m);
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return o; };
const cyl = (r0, r1, h, m, x = 0, y = 0, z = 0, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y + h / 2, z); return o; };

// Pont d'envol peint : piste oblique, lignes, numéro
function deckTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3d4247'; x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 1024, Math.random() * 256, 40, 3); }
  x.save(); x.translate(380, 150); x.rotate(-0.16);
  x.strokeStyle = '#e8e8e2'; x.lineWidth = 3; x.strokeRect(-360, -34, 720, 68);
  x.setLineDash([26, 22]); x.beginPath(); x.moveTo(-340, 0); x.lineTo(340, 0); x.stroke(); x.setLineDash([]);
  x.strokeStyle = '#d9b33a'; x.lineWidth = 2; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-300 + k * 18, -34); x.lineTo(-300 + k * 18, 34); x.stroke(); }
  x.restore();
  x.strokeStyle = '#d9b33a'; x.lineWidth = 2;
  for (const y of [70, 110]) { x.beginPath(); x.moveTo(620, y); x.lineTo(1010, y - 10); x.stroke(); }
  x.fillStyle = '#e8e8e2'; x.font = 'bold 64px sans-serif'; x.save(); x.translate(960, 160); x.rotate(Math.PI / 2); x.fillText('78', -30, 20); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function carrier(s) {
  const g = new THREE.Group(), L = s.len, W = s.wid;
  g.add(hull(L * 0.94, W * 0.5, 19, 0.2));
  const deckMat = mat(0xffffff, { map: deckTexture(), roughness: 0.9, metalness: 0 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, W * 0.88), [GREY, GREY, deckMat, GREY, GREY, GREY]);
  deck.position.set(0, 20, -W * 0.06); g.add(deck);
  // l'îlot à tribord, avec sa passerelle et son mât
  const isl = new THREE.Group(); isl.position.set(-L * 0.08, 20.8, W * 0.34);
  isl.add(box(34, 14, 9, GREY), box(30, 3.2, 10, GLASS, 1, 14), box(22, 5, 7, GREY, 2, 17.2), cyl(0.7, 0.9, 16, DARK, 4, 22), box(8, 1, 1, DARK, 4, 30));
  g.add(isl);
  // quelques avions parqués à l'avant
  for (let k = 0; k < 6; k++) { const p = new THREE.Group(); p.add(box(15, 2, 2.4, DARK), box(4, 0.5, 10, DARK, -1, 0.8), box(2.5, 3, 0.5, DARK, -6, 1.5)); p.position.set(L * 0.28 - k * 13, 20.8, W * 0.27); p.rotation.y = 0.7; g.add(p); }
  return g;
}
function destroyer(s) {
  const g = new THREE.Group(), L = s.len, W = s.wid;
  g.add(hull(L, W, 7, 0.26));
  g.add(box(L * 0.32, 7, W * 0.62, GREY, -L * 0.05, 7), box(L * 0.14, 5, W * 0.5, GREY, L * 0.02, 14), box(L * 0.08, 2.4, W * 0.52, GLASS, L * 0.06, 14.5));
  g.add(cyl(0.6, 0.9, 13, DARK, -L * 0.02, 19), box(L * 0.12, 6, W * 0.45, GREY, -L * 0.28, 7));
  g.add(cyl(2, 2.4, 2.2, GREY, L * 0.3, 7), box(7, 0.8, 0.8, DARK, L * 0.33, 8.4));
  return g;
}
function trawler(s) {
  const g = new THREE.Group(), L = s.len, W = s.wid;
  g.add(hull(L, W, 3.5, 0.3, RED));
  g.add(box(L * 0.28, 4, W * 0.7, WHITE, L * 0.12, 3.5), box(L * 0.24, 1.2, W * 0.72, GLASS, L * 0.13, 6.3));
  g.add(cyl(0.25, 0.3, 9, DARK, L * 0.32, 3.5), cyl(0.25, 0.3, 7, DARK, -L * 0.25, 3.5), box(L * 0.4, 0.3, 0.3, DARK, -L * 0.1, 9.5));
  return g;
}
function hangar(s) {
  const g = new THREE.Group(), L = s.len, W = s.wid, R = W / 2;
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24, 1, true, -Math.PI / 2, Math.PI), mat(0x8c9488, { side: THREE.DoubleSide }));
  arch.rotation.z = Math.PI / 2; arch.scale.set(s.h / R, 1, 1); g.add(arch);
  const end = new THREE.Mesh(new THREE.CircleGeometry(R, 24, 0, Math.PI), mat(0x737a70, { side: THREE.DoubleSide }));
  end.scale.set(1, s.h / R, 1); end.rotation.y = Math.PI / 2;
  const back = end.clone(); end.position.x = L / 2; back.position.x = -L / 2; g.add(end, back);
  g.add(box(0.4, s.h * 0.62, W * 0.6, DARK, L / 2 + 0.3, 0));
  return g;
}
function tower(s) {
  const g = new THREE.Group();
  g.add(cyl(3.2, 3.8, s.h - 6, CONCRETE), cyl(6, 5, 4.5, GLASS, 0, s.h - 6, 0, 8), cyl(6.4, 6.4, 0.8, CONCRETE, 0, s.h - 1.5, 0, 8), cyl(0.2, 0.2, 5, DARK, 0, s.h - 0.7));
  g.add(box(26, 7, 14, CONCRETE, 0, 0, -12));
  return g;
}
const BUILDERS = { porteavions: carrier, destroyer, chalutier: trawler, hangar, tour: tower };

export function buildDecor(scene, env) {
  const A = buildArchipel(), group = new THREE.Group(), items = [];
  for (const s of A.structures) {
    const make = BUILDERS[s.kind]; if (!make) continue;
    const o = make(s);
    o.position.set(s.x, s.y, s.z);
    o.rotation.y = -(s.rot || 0);
    group.add(o); items.push({ s, o });
  }
  group.traverse((c) => { if (c.isMesh) for (const m of [].concat(c.material)) { m.envMap = env || null; m.needsUpdate = true; } });
  scene.add(group);
  // les vrais modèles, quand il y en a, remplacent les maquettes
  const loader = new GLTFLoader(), base = new URL('../', import.meta.url);
  for (const [kind, M] of Object.entries(MODELS)) {
    loader.load(new URL(M.url, base).href, (gltf) => {
      const src = gltf.scene, bb = new THREE.Box3().setFromObject(src), size = bb.getSize(new THREE.Vector3()), k = M.len / Math.max(size.x, size.z);
      src.traverse((c) => { if (c.isMesh) { c.material.envMap = env || null; c.frustumCulled = true; } });
      for (const it of items) {
        if (it.s.kind !== kind) continue;
        const m = src.clone(true), holder = new THREE.Group();
        m.scale.setScalar(k); m.rotation.y = M.yaw || 0;
        const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
        m.position.set(-c.x, -b2.min.y - (M.sink || 0), -c.z);
        holder.add(m); holder.position.copy(it.o.position); holder.rotation.copy(it.o.rotation);
        group.remove(it.o); group.add(holder); it.o = holder;
      }
    }, undefined, (e) => console.warn('Modèle indisponible :', M.url, e));
  }
  return {
    update() {},
    dispose() { scene.remove(group); group.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); } }); },
  };
}
