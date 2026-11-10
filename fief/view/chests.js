// Fief Maudit : les coffres gardés des bois et la cloche du feu de camp.
// Un coffre fermé luit et lance un fin rai doré vers le ciel, visible de loin entre les arbres ; ouvert, son couvercle
// bascule et la lueur s'éteint. La cloche, sur son poteau près du feu, se balance quand quelqu'un la sonne.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.85 });
const dark = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.9 });
const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.75 });
const gold = new THREE.MeshStandardMaterial({ color: 0xd8a63a, roughness: 0.35, metalness: 0.8, emissive: 0x3a2400 });

const glowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128; const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,220,140,0)'); g.addColorStop(0.7, 'rgba(255,210,120,0.55)'); g.addColorStop(1, 'rgba(255,230,160,0.9)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 128);
  const h = x.createLinearGradient(0, 0, 32, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const beamMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });

function makeChest() {
  const g = new THREE.Group();
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  box(1.0, 0.5, 0.62, wood, 0, 0.25, 0);
  for (const x of [-0.36, 0.36]) box(0.08, 0.52, 0.64, iron, x, 0.26, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.31); g.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 1.0, 12, 1, false, 0, Math.PI), dark);
  top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2; top.position.set(0, 0, 0.31); top.castShadow = true; lid.add(top);
  for (const x of [-0.36, 0.36]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.08, 12, 1, false, 0, Math.PI), iron); s.rotation.z = Math.PI / 2; s.rotation.y = Math.PI / 2; s.position.set(x, 0, 0.31); lid.add(s); }
  box(0.14, 0.16, 0.05, gold, 0, 0.42, 0.33);
  // la lueur dorée qui s'échappe et le rai vers le ciel
  const light = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  light.position.set(0, 0.52, 0.32); g.add(light);
  const beam = new THREE.Group();
  for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 16), beamMat); p.position.y = 8.3; p.rotation.y = r; beam.add(p); }
  g.add(beam);
  return { g, lid, light, beam };
}

export function createChests(scene, map) {
  const group = new THREE.Group(); scene.add(group);
  const chests = new Map();
  // la cloche du feu de camp
  const bell = new THREE.Group();
  {
    const c = map.campfire, x = c.x - 2.3, z = c.z - 1.6, y = map.heightAt(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.6, 7), dark); post.position.set(x, y + 1.3, z); post.castShadow = true; group.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), dark); arm.position.set(x + 0.35, y + 2.5, z); group.add(arm);
    bell.position.set(x + 0.7, y + 2.45, z); group.add(bell);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.36, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide }));
    cup.position.y = -0.22; bell.add(cup);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), iron); tongue.position.y = -0.38; bell.add(tongue);
  }
  let swing = 0;
  function event(e) { if (e.t === 'bell') swing = 1; }
  function update(sim, dt, t) {
    const seen = new Set();
    for (const c of sim.chests) {
      seen.add(c.id);
      let C = chests.get(c.id);
      if (!C) { C = makeChest(); C.g.position.set(c.x, map.heightAt(c.x, c.z), c.z); C.g.rotation.y = c.rot; group.add(C.g); C.k = c.open ? 1 : 0; chests.set(c.id, C); }
      C.k += ((c.open ? 1 : 0) - C.k) * Math.min(1, dt * 5);
      C.lid.rotation.x = -C.k * 1.9;
      C.light.visible = C.beam.visible = C.k < 0.5;
      C.light.material.opacity = 0.6 + 0.3 * Math.sin(t * 3 + c.id);
      C.beam.children.forEach((p) => { p.material.opacity = 0.35 + 0.15 * Math.sin(t * 1.7 + c.id); });
      C.beam.rotation.y = -C.g.rotation.y + t * 0.2;
    }
    for (const [id, C] of chests) if (!seen.has(id)) { group.remove(C.g); chests.delete(id); }
    swing = Math.max(0, swing - dt * 0.35);
    bell.rotation.z = Math.sin(t * 9) * 0.5 * swing;
  }
  return { update, event };
}
