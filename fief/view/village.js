// Fief Maudit : le village assemblé avec les pièces du Medieval Village MegaKit (Quaternius, CC0, models/village.glb).
// Un pan de mur fait 2 m de large et 3,12 m de haut ; sa face extérieure regarde +z. Chaque bâtiment est un rectangle
// (côtés multiples de 2 m) : on pose les pans tout autour, les angles, la porte, les fenêtres, le toit et ses pignons.
// Les ruines (fondations à relever) gardent des pans entiers, des pans écroulés à mi-hauteur et des trous, sans toit,
// avec du lierre, des briques tombées et une poutre effondrée. Toutes les pièces identiques sont dessinées en instances.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

export const WALL_H = 3.12;
const DOOR = 'Door_8_Round';
const hash = (n) => { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const strHash = (s) => { let h = 7; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h; };

export async function loadKit(url) {
  const g = await new GLTFLoader().loadAsync(url);
  g.scene.updateMatrixWorld(true);
  const pieces = new Map();
  for (const node of g.scene.children) {
    const parts = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      // les feuilles du lierre sont découpées dans leur texture
      if (m.map && /vine/i.test(m.name || '')) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      m.envMapIntensity = 0.55;
      parts.push({ geo: o.geometry, mat: m, local: o.matrixWorld.clone() });
    });
    pieces.set(node.name, parts);
  }
  return pieces;
}

// file d'attente de pièces à poser : nom → liste de matrices
export class Batch {
  constructor(kit) { this.kit = kit; this.list = new Map(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); }
  add(name, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    if (!this.kit.has(name)) { console.warn('pièce absente', name); return; }
    this.e.set(rx, ry, rz, 'YXZ'); this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    if (!this.list.has(name)) this.list.set(name, []);
    this.list.get(name).push(m);
  }
  build() {
    const g = new THREE.Group(), tmp = new THREE.Matrix4();
    for (const [name, mats] of this.list) {
      for (const part of this.kit.get(name)) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, mats.length);
        mats.forEach((m, i) => { tmp.multiplyMatrices(m, part.local); im.setMatrixAt(i, tmp); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
        im.name = name;
        g.add(im);
      }
    }
    return g;
  }
}

// côté d'un rectangle : centre du côté, direction le long du côté, rotation pour que +z regarde dehors
function sides(b) {
  const hw = b.w / 2, hd = b.d / 2;
  return {
    s: { cx: b.x, cz: b.z + hd, ux: 1, uz: 0, ry: 0, len: b.w },
    n: { cx: b.x, cz: b.z - hd, ux: -1, uz: 0, ry: Math.PI, len: b.w },
    e: { cx: b.x + hw, cz: b.z, ux: 0, uz: -1, ry: Math.PI / 2, len: b.d },
    w: { cx: b.x - hw, cz: b.z, ux: 0, uz: 1, ry: -Math.PI / 2, len: b.d },
  };
}

// pose un bâtiment ; ground(x, z) : hauteur du sol
function placeBuilding(B, b, ground, { rubble } = {}) {
  const H0 = ground(b.x, b.z);
  const ruin = b.state !== 'debout', tall = b.tall || 1;
  const brick = b.style === 'brick';
  const W = brick ? 'Wall_UnevenBrick_' : 'Wall_Plaster_';
  const seed = strHash(b.id);
  const S = sides(b);
  let k = 0;
  for (const [side, s] of Object.entries(S)) {
    const n = Math.round(s.len / 2);
    for (let i = 0; i < n; i++) {
      const off = -s.len / 2 + 1 + i * 2;
      // pan posé juste à l'intérieur du bord : sa face extérieure (+0,09) affleure le rectangle
      const x = s.cx + s.ux * off - Math.sin(s.ry) * 0.09, z = s.cz + s.uz * off - Math.cos(s.ry) * 0.09;
      const isDoor = side === b.door && i === Math.floor((n - 1) / 2);
      for (let lv = 0; lv < tall; lv++) {
        const y = H0 + lv * WALL_H;
        const r = hash(seed + k++ * 31);
        if (ruin) {
          // ruines : un soubassement de pierre (plus d'étage), des pans entiers, d'autres écroulés à mi-hauteur, des trous
          if (lv > 0 && (r < 0.55 || lv === tall - 1 && r < 0.8) && !isDoor) continue;
          const RW = lv === 0 ? 'Wall_UnevenBrick_' : W;
          if (r < 0.14 && !isDoor) continue;
          let name = RW + 'Straight';
          if (isDoor && lv === 0) name = RW + 'Door_Round';
          else if (r > 0.7) name = RW + 'Window_Wide_Round';
          else if (!brick && lv > 0 && r > 0.5) name = 'Wall_Plaster_WoodGrid';
          const low = !isDoor && r < 0.6;
          B.add(name, x, y, z, s.ry, 1, low ? 0.22 + hash(seed + k * 7) * 0.4 : 1, 1);
          if (!low && r > 0.5 && hash(seed + k * 13) > 0.4) B.add(hash(seed + k) > 0.5 ? 'Prop_Vine1' : 'Prop_Vine2', x + Math.sin(s.ry) * 0.12, y + 2.6, z + Math.cos(s.ry) * 0.12, s.ry);
        } else {
          let name = W + 'Straight';
          if (isDoor && lv === 0) name = W + 'Door_Round';
          else if (side !== b.door && i % 2 === 1 && lv === 0) name = W + 'Window_Wide_Round';
          else if (!brick && lv > 0) name = 'Wall_Plaster_WoodGrid';
          B.add(name, x, y, z, s.ry);
          if (name.includes('Window')) {
            B.add('Window_Wide_Round1', x, y, z, s.ry);
            B.add('WindowShutters_Wide_Round_Open', x, y, z, s.ry);
          }
          if (isDoor && lv === 0) {
            // battant de porte (pivot sur son bord gauche) dans son cadre
            const lx = -0.53;
            B.add(DOOR, x + Math.cos(s.ry) * lx - Math.sin(s.ry) * 0.02, y, z - Math.sin(s.ry) * lx - Math.cos(s.ry) * 0.02, s.ry);
            B.add(brick ? 'DoorFrame_Round_Brick' : 'DoorFrame_Round_WoodDark', x + Math.sin(s.ry) * 0.06, y, z + Math.cos(s.ry) * 0.06, s.ry);
          }
        }
      }
    }
  }
  // angles : un poteau d'angle à chaque coin (brique ou bois), sur toute la hauteur
  const hw = b.w / 2, hd = b.d / 2;
  const corners = [[b.x + hw, b.z + hd, Math.PI / 2], [b.x - hw, b.z + hd, 0], [b.x - hw, b.z - hd, -Math.PI / 2], [b.x + hw, b.z - hd, Math.PI]];
  for (const [i, [cx, cz, ry]] of corners.entries()) {
    const levels = ruin ? Math.max(1, tall - (hash(seed + i * 5) < 0.5 ? 1 : 0)) : tall;
    for (let lv = 0; lv < levels; lv++) {
      const sy = ruin && lv === levels - 1 ? 0.45 + hash(seed + i * 3 + lv) * 0.55 : 1;
      B.add(brick || (ruin && lv === 0) ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood', cx, H0 + lv * WALL_H, cz, ry, 1, sy, 1);
    }
  }
  if (!ruin) {
    // toit en tuiles (faîtage dans le sens de la longueur) et pignons en brique
    const top = H0 + tall * WALL_H;
    const along = b.d >= b.w;
    const a = Math.min(b.w, b.d), l = Math.max(b.w, b.d);
    const name = `Roof_RoundTiles_${a}x${l}`;
    B.add(name, b.x, top, b.z, along ? 0 : Math.PI / 2);
    const gable = `Roof_Front_Brick${a}`;
    if (along) { B.add(gable, b.x, top, b.z + hd - 0.15, 0); B.add(gable, b.x, top, b.z - hd + 0.15, Math.PI); }
    else { B.add(gable, b.x + hw - 0.15, top, b.z, Math.PI / 2); B.add(gable, b.x - hw + 0.15, top, b.z, -Math.PI / 2); }
    B.add('Prop_Chimney', b.x + (along ? hw * 0.45 : 0), top + 0.4, b.z + (along ? 0 : hd * 0.45), 0);
  } else {
    // sol intérieur en pavés disjoints, une poutre du toit tombée en travers
    for (let x = -hw + 1; x < hw; x += 2) for (let z = -hd + 1; z < hd; z += 2) if (hash(seed + x * 17 + z * 131) > 0.3) B.add('Floor_UnevenBrick', b.x + x, H0 + 0.02, b.z + z, 0);
    const along = b.d >= b.w;
    if (b.state === 'chantier') {
      // échafaudage : des poteaux aux angles et des poutres neuves au pied des murs
      for (const [cx, cz] of [[b.x + hw - 0.5, b.z + hd - 0.5], [b.x - hw + 0.5, b.z + hd - 0.5], [b.x - hw + 0.5, b.z - hd + 0.5], [b.x + hw - 0.5, b.z - hd + 0.5]]) B.add('Prop_Support', cx, H0, cz, 0, 1, 1.6, 1);
      B.add('Prop_Crate', b.x + hw + 0.9, H0, b.z + hd * 0.4, 0.3, 0.8, 0.8, 0.8);
      B.add('Roof_Log', b.x + (along ? hw + 1.2 : 0), H0 - 3.95 + 0.25, b.z + (along ? 0 : hd + 1.2), along ? 0 : Math.PI / 2, 0.6, 0.6, 0.35);
    } else {
      // poutres tombées en travers
      B.add('Prop_Support', b.x - 0.4, H0 + 0.1, b.z, along ? 0.3 : 1.9, 1, 1, 1, 0, 1.25);
    }
    if (rubble && b.state === 'ruine') for (const r of rubble) if (Math.abs(r.x - b.x) < b.w && Math.abs(r.z - b.z) < b.d) B.add('Prop_Brick' + r.v, r.x, r.y + 0.08, r.z, r.rot, 1.6, 1.6, 1.6, r.tilt, 0);
  }
}

// tout le village et le château
export function buildVillage(kit, map, states = null) {
  const B = new Batch(kit);
  const ground = (x, z) => {
    // on cale le bâtiment sur le point le plus bas de son emprise : les murs s'enfoncent un peu plutôt que de flotter
    let m = Infinity; for (const [dx, dz] of [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]]) m = Math.min(m, map.heightAt(x + dx, z + dz));
    return m - 0.06;
  };
  // l'état de chaque bâtiment vient du moteur (ruine, chantier, debout) quand on le connaît
  for (const b of map.buildings) placeBuilding(B, { ...b, state: (states && states[b.id] && states[b.id].state) || b.state }, ground, { rubble: map.rubble });
  for (const b of map.castle) placeBuilding(B, b, ground, { rubble: map.rubble });
  // bordure de pierre autour de la place du feu
  for (const p of map.props) {
    if (p.kind === 'wagon') B.add('Prop_Wagon', p.x, p.y, p.z, p.rot);
    else if (p.kind === 'crate') B.add('Prop_Crate', p.x, p.y, p.z, p.rot, p.s, p.s, p.s);
    else if (p.kind === 'fence') B.add('Prop_WoodenFence_Single', p.x, p.y, p.z, p.rot);
  }
  return B.build();
}
