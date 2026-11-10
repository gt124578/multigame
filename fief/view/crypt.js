// Fief Maudit : la crypte sous le château, en 3D. Murs de briques du MegaKit posés sur les bords de la grille du moteur
// (engine/crypt.js), dalles, voûte sombre, torches (un petit lot de lumières qui suit les torches les plus proches de
// la caméra), herse qui remonte, deux leviers, couloir de brume, trône et tapis du Roi. Plus les effets des capacités
// des métiers, visibles partout : fusées éclairantes, barricades, Rempart, Prière, Grand coup.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { Batch, WALL_H } from './village.js';
import { ABILITY } from '../engine/sim.js';
import { TORCH_R } from '../engine/crypt.js';

export const CEIL = 4.2;
const POOL = 6;   // lumières de torches allumées à la fois

const flameTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(32, 92, 2, 32, 80, 60); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  x.fillStyle = gr; x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(62, 80, 32, 124); x.quadraticCurveTo(2, 80, 32, 4); x.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const glowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const iron = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.55, metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6a4626, roughness: 0.9 });

export function createCrypt3D({ scene, kit, map, noise }) {
  const K = map.crypt, Y = K.y;
  const at = (c, r) => (K.plan[r] && K.plan[r][c]) || '#';
  const solid = (ch) => ch === '#' || ch === 'T';
  const cx = (c) => K.x0 + c * 2 + 1, cz = (r) => K.z0 + r * 2 + 1;
  const group = new THREE.Group(); group.visible = false; scene.add(group);

  // ---------------------------------------------------------------- murs, dalles, voûte
  const B = new Batch(kit);
  const sy = CEIL / WALL_H;
  for (let r = 0; r < K.rows; r++) for (let c = 0; c < K.cols; c++) {
    if (solid(at(c, r))) continue;
    B.add('Floor_Brick', cx(c), Y + 0.01, cz(r), ((c * 7 + r * 3) % 4) * Math.PI / 2);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!solid(at(c + dc, r + dr))) continue;
      // le pan se pose sur le bord commun, face décorée vers la salle
      const dx = -dc, dz = -dr, ex = cx(c) + dc, ez = cz(r) + dr;
      B.add('Wall_UnevenBrick_Straight', ex - dx * 0.09, Y, ez - dz * 0.09, Math.atan2(dx, dz), 1, sy, 1);
    }
  }
  // l'escalier qui descend du donjon, au nord de l'arrivée
  B.add('Stairs_Exterior_Straight', K.spawn.x, Y, K.z0 + 2.2, 0, 1, 1, 1);
  group.add(B.build());
  {
    const w = K.x1 - K.x0, d = K.z1 - K.z0;
    const ceilTex = noise.clone(); ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(6, 8); ceilTex.needsUpdate = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 1, map: ceilTex }));
    ceil.position.set((K.x0 + K.x1) / 2, Y + CEIL, (K.z0 + K.z1) / 2); group.add(ceil);
    // un fond noir sous les dalles : jamais de ciel par une fente
    const under = new THREE.Mesh(new THREE.PlaneGeometry(w + 20, d + 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    under.position.set((K.x0 + K.x1) / 2, Y - 0.05, (K.z0 + K.z1) / 2); group.add(under);
  }

  // ---------------------------------------------------------------- torches
  const fmat = new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const torches = K.torches.map((t) => {
    const c = Math.round((t.x - K.x0 - 1) / 2), r = Math.round((t.z - K.z0 - 1) / 2);
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => !solid(at(c + dc, r + dr))) || [0, 1];
    const g = new THREE.Group(); g.position.set(t.x + n[0] * 1.02, Y, t.z + n[1] * 1.02); g.rotation.y = Math.atan2(n[0], n[1]);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.45), iron); arm.position.set(0, 2.2, 0.2); g.add(arm);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.22, 8), iron); cup.position.set(0, 2.32, 0.42); g.add(cup);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), wood); stick.position.set(0, 2.42, 0.42); g.add(stick);
    const flames = [0, 1].map((i) => { const s = new THREE.Sprite(fmat); s.position.set(0, 2.75, 0.42); g.add(s); return s; });
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3a3a3a, transparent: true, opacity: 0.0, depthWrite: false })); smoke.position.set(0, 2.8, 0.42); smoke.scale.setScalar(0.5); g.add(smoke);
    group.add(g);
    return { t, g, flames, smoke, lx: t.x + n[0] * 1.5, lz: t.z + n[1] * 1.5 };
  });
  const lights = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xff8a3a, 0, TORCH_R * 2.8, 1.3); l.visible = false; scene.add(l); return l; });

  // ---------------------------------------------------------------- herse et leviers
  const gate = new THREE.Group();
  {
    const G = K.gate, w = G.x1 - G.x0, z = (G.z0 + G.z1) / 2;
    for (let i = 0; i <= 8; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, CEIL, 6), iron); b.position.set(G.x0 + i * w / 8, CEIL / 2, 0); b.castShadow = true; gate.add(b); }
    for (const y of [0.9, 2.2, 3.5]) { const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.1), iron); h.position.set((G.x0 + G.x1) / 2, y, 0); gate.add(h); }
    for (let i = 0; i <= 8; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), iron); p.rotation.x = Math.PI; p.position.set(G.x0 + i * w / 8, 0.05, 0); gate.add(p); }
    gate.position.set(0, Y, z); group.add(gate);
  }
  const levers = K.levers.map((l) => {
    const g = new THREE.Group(); g.position.set(l.x + l.wall * 0.88, Y + 1.25, l.z); g.rotation.y = -l.wall * Math.PI / 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.12), iron); g.add(plate);
    const piv = new THREE.Group(); piv.position.z = 0.1; g.add(piv);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6), wood); handle.position.y = 0.36; piv.add(handle);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), iron); knob.position.y = 0.74; piv.add(knob);
    piv.rotation.x = -0.7;
    group.add(g);
    return { l, piv, k: 0 };
  });

  // ---------------------------------------------------------------- trône, tapis, os
  {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.85, flatShading: true });
    const purple = new THREE.MeshStandardMaterial({ color: 0x3a1858, roughness: 0.9, side: THREE.DoubleSide });
    const red = new THREE.MeshStandardMaterial({ color: 0x5a1414, roughness: 1 });
    const T = new THREE.Group(); T.position.set(K.king.x, Y, K.king.z + 1.9);
    const box = (w, h, d, x, y, z, m = stone) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; T.add(o); return o; };
    box(3.2, 0.35, 2.4, 0, 0.17, 0); box(2.6, 0.3, 2.0, 0, 0.5, 0);           // marches
    box(1.6, 0.6, 1.1, 0, 0.95, 0.1);                                           // assise
    box(1.8, 3.4, 0.35, 0, 2.3, 0.6);                                          // dossier
    box(0.3, 0.9, 1.1, -0.85, 1.2, 0.1); box(0.3, 0.9, 1.1, 0.85, 1.2, 0.1);  // accoudoirs
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), stone); top.position.set(0, 4.25, 0.6); top.rotation.y = Math.PI / 4; T.add(top);
    for (const s of [-1, 1]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), stone); sp.position.set(s * 0.8, 4.2, 0.6); T.add(sp); }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), purple); banner.position.set(0, 2.5, 0.42); banner.rotation.y = Math.PI; T.add(banner);
    group.add(T);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 12).rotateX(-Math.PI / 2), red); carpet.position.set(K.king.x, Y + 0.03, K.king.z - 5.5); carpet.receiveShadow = true; group.add(carpet);
    // des os et des crânes qui traînent
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.7 });
    const rr = (k) => { const v = Math.sin(k * 127.1) * 43758.5; return v - Math.floor(v); };
    for (let i = 0; i < 70; i++) {
      const c = Math.floor(rr(i) * K.cols), r = Math.floor(rr(i + 0.5) * K.rows);
      if (solid(at(c, r)) || at(c, r) === 'G' || at(c, r) === 'S') continue;
      const x = cx(c) + (rr(i + 1) - 0.5) * 1.6, z = cz(r) + (rr(i + 2) - 0.5) * 1.6;
      if (Math.hypot(x - K.king.x, z - K.king.z - 1.9) < 2.4) continue;
      const o = rr(i + 3) < 0.25 ? new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), bone) : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.45, 5), bone);
      o.position.set(x, Y + 0.07, z); o.rotation.set(Math.PI / 2, rr(i + 4) * 6.28, 0); if (o.geometry.type === 'SphereGeometry') o.rotation.set(0, 0, 0);
      group.add(o);
    }
  }

  // ---------------------------------------------------------------- brume du couloir
  const brumeU = { uT: { value: 0 }, uNoise: { value: noise } };
  {
    const Z = K.halls.brume, mat = new THREE.ShaderMaterial({
      uniforms: brumeU, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float uT; uniform sampler2D uNoise;
        void main(){ float n = texture2D(uNoise, vW.xz * 0.06 + vec2(uT * 0.01, uT * 0.017)).r * 0.6 + texture2D(uNoise, vW.xz * 0.13 - vec2(uT * 0.02, -uT * 0.009)).g * 0.4;
          float a = smoothstep(0.25, 0.85, n) * 0.5 + 0.12; gl_FragColor = vec4(vec3(0.42, 0.48, 0.6) * (0.6 + 0.5 * n), a * 0.32); }`,
    });
    // seulement sur les cases du couloir
    const bx = K.brumeCells.map((c) => c.x), bz = K.brumeCells.map((c) => c.z);
    const x0 = Math.min(...bx) - 1, x1 = Math.max(...bx) + 1, z0 = Math.min(...bz) - 1, z1 = Math.max(...bz) + 1;
    for (const h of [0.2, 0.6, 1.1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat); m.position.set((x0 + x1) / 2, Y + h, (z0 + z1) / 2); m.renderOrder = 5; group.add(m); }
  }

  // ---------------------------------------------------------------- chaque image
  const tmp = [];
  function update(sim, t, camera, inside) {
    group.visible = inside || sim.crypt.open && Math.hypot(camera.position.x - K.spawn.x, camera.position.z - K.spawn.z) < 80;
    brumeU.uT.value = t;
    // la herse remonte en une seconde et demie
    const gy = sim.crypt.gate ? 3.6 : 0; gate.position.y += (Y + gy - gate.position.y) * 0.04;
    for (const L of levers) {
      const on = sim.crypt.gate || sim.players.some((p) => p.lever === L.l.id);
      L.k += ((on ? 1 : 0) - L.k) * 0.15; L.piv.rotation.x = -0.7 + L.k * 1.4;
    }
    tmp.length = 0;
    torches.forEach((T, i) => {
      const lit = sim.torchLit(T.t.id);
      T.flames.forEach((f, j) => { f.visible = lit; const w = 0.8 + 0.22 * Math.sin(t * (10 + j * 3) + i * 1.7); f.scale.set(0.42 * w, 0.85 * w, 1); f.position.y = 2.68 + 0.08 * w + j * 0.06; });
      T.smoke.material.opacity = lit ? 0 : 0.25 + 0.1 * Math.sin(t * 2 + i);
      if (lit && inside) tmp.push({ T, d: Math.hypot(T.lx - camera.position.x, T.lz - camera.position.z) });
    });
    tmp.sort((a, b) => a.d - b.d);
    lights.forEach((l, i) => {
      const e = tmp[i]; l.visible = inside;
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.T.lx, Y + 2.6, e.T.lz);
      l.intensity = (9 + Math.sin(t * 11 + i) * 0.8 + Math.sin(t * 6.3 + i * 2) * 1.0);
    });
  }
  return { update, group };
}

// ------------------------------------------------------------------ effets des capacités (partout)
export function createAbilityFx(scene, map) {
  const group = new THREE.Group(); scene.add(group);
  // fusées : une boule rouge qui grésille, et sa lumière (deux au plus)
  const flareMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flares = [0, 1].map(() => {
    const s = new THREE.Sprite(flareMat); s.visible = false; group.add(s);
    const l = new THREE.PointLight(0xff7a4a, 0, ABILITY.fusee.r * 2.2, 1.3); scene.add(l);
    return { s, l };
  });
  // barricades : chevaux de frise en rondins taillés en pointe
  const bars = new Map();
  function makeBar(b) {
    const g = new THREE.Group();
    for (const [a, y] of [[0.7, 0.55], [-0.7, 0.55], [0, 0.3]]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.4, 7), wood);
      log.rotation.z = Math.PI / 2; log.rotation.y = a; log.position.y = y; log.castShadow = true; g.add(log);
      for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 7), wood); tip.position.set(Math.cos(a) * s * 1.37, y, -Math.sin(a) * s * 1.37); tip.rotation.z = -s * Math.PI / 2; tip.rotation.y = a; g.add(tip); }
    }
    for (const s of [-1, 1]) { const x = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.5, 6), wood); x.position.set(s * 0.7, 0.55, 0); x.rotation.x = s * 0.9; x.castShadow = true; g.add(x); }
    g.position.set(b.x, map.heightAt(b.x, b.z), b.z); g.rotation.y = b.rot + Math.PI / 2;
    group.add(g); return g;
  }
  // anneaux : Rempart (sous le chevalier), Prière et Grand coup (une onde qui s'élargit)
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  const guards = new Map(), waves = [];
  const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  function wave(x, z, r, color, dur = 0.7) {
    const m = new THREE.Mesh(ringGeo, ringMat(color)); m.position.set(x, map.heightAt(x, z) + 0.15, z); group.add(m);
    waves.push({ m, r, t: 0, dur });
  }
  function event(e, sim) {
    if (e.t !== 'abilityHit') return;
    if (e.ab === 'priere') wave(e.x, e.z, ABILITY.priere.r, 0xffe9a0, 1.0);
    else if (e.ab === 'grandcoup') wave(e.x, e.z, ABILITY.grandcoup.r, 0xd8b890, 0.45);
    else if (e.ab === 'rempart') wave(e.x, e.z, ABILITY.rempart.r, 0x8ab8ff, 0.8);
  }
  function update(sim, dt, t) {
    flares.forEach((F, i) => {
      const f = sim.flares[i];
      F.s.visible = !!f;
      if (!f) { F.l.intensity = 0; return; }
      const y = map.heightAt(f.x, f.z) + 2.2 + Math.sin(t * 3 + i) * 0.1;
      F.s.position.set(f.x, y, f.z); F.s.scale.setScalar(1.1 + Math.sin(t * 23 + i) * 0.15);
      F.l.position.set(f.x, y + 0.5, f.z); F.l.intensity = 9 + Math.sin(t * 31 + i) * 2;
    });
    const seen = new Set();
    for (const b of sim.bars) { seen.add(b.id); if (!bars.has(b.id)) bars.set(b.id, makeBar(b)); const g = bars.get(b.id); g.scale.y = Math.min(1, g.scale.y + dt * 4); }
    for (const [id, g] of bars) if (!seen.has(id)) { g.position.y -= dt * 2; g.scale.y -= dt * 2; if (g.scale.y <= 0.05) { group.remove(g); bars.delete(id); } }
    for (const p of sim.players) {
      let r = guards.get(p.id);
      if (p.guardT > 0) {
        if (!r) { r = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32).rotateX(-Math.PI / 2), ringMat(0x8ab8ff)); group.add(r); guards.set(p.id, r); }
        r.position.set(p.x, p.y + 0.08, p.z); r.material.opacity = 0.45 + 0.25 * Math.sin(t * 8); r.rotation.y = t;
      } else if (r) { group.remove(r); guards.delete(p.id); }
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.t += dt; const k = w.t / w.dur;
      w.m.scale.setScalar(0.3 + k * w.r); w.m.material.opacity = 0.75 * (1 - k);
      if (k >= 1) { group.remove(w.m); waves.splice(i, 1); }
    }
  }
  return { update, event };
}
