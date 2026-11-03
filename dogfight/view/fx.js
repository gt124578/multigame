// Effets de Dogfight 3D : traçantes, fumées, vapeur d'ailes, explosions, missiles et leurres.
// Tout est dans des tampons fixes réutilisés : rien n'est créé ni jeté pendant le vol.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { BULLET_SPEED, BULLET_LIFETIME, BULLET_GRAVITY, FIRE_RATE } from '../engine/weapons.js';
import { GUNS } from './plane.js';

const MAX_TRACERS = 320, MAX_PUFFS = 1400;
const TRAIL_STEP = 5;   // une bouffée tous les 5 m : la traînée reste continue quelle que soit la cadence d'images
const tmpO = new THREE.Object3D(), up = new THREE.Vector3(0, 0, 1), dirV = new THREE.Vector3();

export class FxManager {
  constructor(scene, camera) {
    this.camera = camera;
    this.time = 0;

    // Traçantes : une seule géométrie instanciée
    const tg = new THREE.CylinderGeometry(0.11, 0.05, 5, 5); tg.rotateX(Math.PI / 2);
    this.tracers = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffdf7a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), MAX_TRACERS);
    this.tracers.frustumCulled = false; this.tracers.count = 0; scene.add(this.tracers);
    this.bullets = [];
    this.fireAcc = new Map();

    // Bouffées : fumée, vapeur, feu. position + taille, couleur + alpha
    this.puffs = Array.from({ length: MAX_PUFFS }, () => ({ life: 0 }));
    this.puffHead = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pPos = new Float32Array(MAX_PUFFS * 4); this.pCol = new Float32Array(MAX_PUFFS * 4);
    g.setAttribute('iP', new THREE.InstancedBufferAttribute(this.pPos, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.pGeo = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: 'attribute vec4 iP; attribute vec4 iC; varying vec2 vQ; varying vec4 vC; void main(){ vec4 mv=modelViewMatrix*vec4(iP.xyz,1.); mv.xy+=position.xy*iP.w; vQ=position.xy; vC=iC; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec2 vQ; varying vec4 vC; void main(){ float r=dot(vQ,vQ); float a=smoothstep(1.,.15,r)*vC.a; if(a<.004)discard; gl_FragColor=vec4(vC.rgb*a,a); }',
    });
    this.pMesh = new THREE.Mesh(g, m); this.pMesh.frustumCulled = false; this.pMesh.renderOrder = 6; scene.add(this.pMesh);

    // Missiles
    const mg = new THREE.CylinderGeometry(0.16, 0.16, 3, 6); mg.rotateX(Math.PI / 2);
    this.missileGeo = mg; this.missileMat = new THREE.MeshBasicMaterial({ color: 0xe9edf2 });
    this.missiles = new Map();
    this.scene = scene;
    this.emitT = 0;
  }

  puff(x, y, z, size, grow, life, r, g, b, a, vx = 0, vy = 0, vz = 0) {
    const p = this.puffs[this.puffHead]; this.puffHead = (this.puffHead + 1) % MAX_PUFFS;
    p.x = x; p.y = y; p.z = z; p.s = size; p.grow = grow; p.life = life; p.max = life; p.r = r; p.g = g; p.b = b; p.a = a; p.vx = vx; p.vy = vy; p.vz = vz;
  }

  explosion(x, y, z, big = true) {
    const n = big ? 38 : 8, sp = big ? 46 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = (Math.random() - 0.5) * Math.PI, s = sp * (0.3 + Math.random()), fire = i < n * 0.55;
      if (fire) this.puff(x, y, z, big ? 4 + Math.random() * 3 : 1.5, big ? 10 : 3, 0.5 + Math.random() * 0.4, 1, 0.55 + Math.random() * 0.25, 0.18, 0.95, Math.cos(e) * Math.cos(a) * s, Math.sin(e) * s, Math.cos(e) * Math.sin(a) * s);
      else this.puff(x, y, z, big ? 6 : 2, big ? 8 : 3, 1.2 + Math.random() * 1.1, 0.13, 0.13, 0.14, 0.7, Math.cos(e) * Math.cos(a) * s * 0.5, Math.sin(e) * s * 0.5 + 3, Math.cos(e) * Math.sin(a) * s * 0.5);
    }
  }

  hitSpark(x, y, z) { for (let i = 0; i < 3; i++) this.puff(x, y, z, 0.8, 2, 0.18, 1, 0.8, 0.4, 0.95, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30); }
  dust(x, y, z) { this.puff(x, y + 1, z, 2, 5, 0.7, 0.55, 0.5, 0.4, 0.5, 0, 3, 0); }
  flare(x, y, z, vx, vy, vz) { for (let i = 0; i < 4; i++) this.puff(x, y, z, 1.6, 0.5, 1.4, 1, 0.92, 0.7, 1, vx * 0.4 + (i - 1.5) * 14, vy * 0.4 - 12, vz * 0.4 + (Math.random() - 0.5) * 12); }

  // Traçantes tirées par `p` (même balistique que le moteur), une sur deux visible
  emitTracers(p, dt) {
    let acc = (this.fireAcc.get(p.id) || 0) + dt * FIRE_RATE * 0.5;
    const G = GUNS[p.type] || GUNS.f16;
    while (acc >= 1) {
      acc -= 1;
      if (this.bullets.length >= MAX_TRACERS) this.bullets.shift();
      const j = 0.004;
      const dx = p.fx + (Math.random() - 0.5) * j, dy = p.fy + (Math.random() - 0.5) * j, dz = p.fz + (Math.random() - 0.5) * j;
      this.bullets.push({ x: p.x + p.fx * G[2] + p.lx * G[0] + p.ux * G[1], y: p.y + p.fy * G[2] + p.ly * G[0] + p.uy * G[1], z: p.z + p.fz * G[2] + p.lz * G[0] + p.uz * G[1], vx: dx * BULLET_SPEED + p.fx * p.speed, vy: dy * BULLET_SPEED + p.fy * p.speed, vz: dz * BULLET_SPEED + p.fz * p.speed, age: 0 });
    }
    this.fireAcc.set(p.id, acc);
  }

  // missiles : liste [{ key, x, y, z }]
  syncMissiles(list, dt) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.key);
      let q = this.missiles.get(m.key);
      if (!q) { q = new THREE.Mesh(this.missileGeo, this.missileMat); this.scene.add(q); this.missiles.set(m.key, q); q.position.set(m.x, m.y, m.z); q.userData.acc = 0; }
      dirV.set(m.x - q.position.x, m.y - q.position.y, m.z - q.position.z);
      const seg = dirV.length();
      if (seg > 0.01) {
        dirV.multiplyScalar(1 / seg);
        q.quaternion.setFromUnitVectors(up, dirV);
        let d = TRAIL_STEP - q.userData.acc;
        for (; d <= seg; d += TRAIL_STEP) this.puff(q.position.x + dirV.x * d, q.position.y + dirV.y * d, q.position.z + dirV.z * d, 1.5, 2.6, 1.1, 0.82, 0.83, 0.85, 0.42);
        q.userData.acc = (q.userData.acc + seg) % TRAIL_STEP;
      }
      q.position.set(m.x, m.y, m.z);
      this.puff(m.x, m.y, m.z, 0.9, 0.3, 0.07, 1, 0.75, 0.4, 1);
    }
    for (const [k, q] of this.missiles) if (!seen.has(k)) { this.scene.remove(q); this.missiles.delete(k); }
  }

  update(dt, planes, world) {
    this.time += dt;

    // traçantes
    for (const p of planes) if (p.alive && p.firing) this.emitTracers(p, dt);
    let nt = 0;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      if (b.age >= BULLET_LIFETIME || (b.y < 130 && world && b.y <= world.obstacleAt(b.x, b.z))) { this.bullets.splice(i, 1); continue; }
      b.vy -= BULLET_GRAVITY * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      tmpO.position.set(b.x, b.y, b.z);
      tmpO.quaternion.setFromUnitVectors(up, dirV.set(b.vx, b.vy, b.vz).normalize());
      tmpO.updateMatrix();
      this.tracers.setMatrixAt(nt++, tmpO.matrix);
    }
    this.tracers.count = nt;
    if (nt) this.tracers.instanceMatrix.needsUpdate = true;

    // vapeur d'ailes dans les virages serrés, fumée des avions touchés
    this.emitT += dt;
    if (this.emitT > 0.035) {
      this.emitT = 0;
      for (const p of planes) {
        if (!p.alive) continue;
        if (p.load > 9) { for (const s of [-1, 1]) this.puff(p.x + p.lx * s * 4.7 - p.fx * 2, p.y + p.ly * s * 4.7 - p.fy * 2, p.z + p.lz * s * 4.7 - p.fz * 2, 0.35, 1.4, 0.45, 0.95, 0.96, 0.98, 0.42); }
        if (p.health < p.maxHp * 0.45 || p.dE > 0.3) { const k = p.health < p.maxHp * 0.25 ? 0.12 : 0.4; this.puff(p.x - p.fx * 7.5 - p.ux * 0.9, p.y - p.fy * 7.5 - p.uy * 0.9, p.z - p.fz * 7.5 - p.uz * 0.9, 1.1, 4, 1.3, k, k, k + 0.01, 0.55, 0, 2, 0); }
      }
    }

    // bouffées
    let n = 0;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const f = p.life / p.max, age = 1 - f;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
      this.pPos[n * 4] = p.x; this.pPos[n * 4 + 1] = p.y; this.pPos[n * 4 + 2] = p.z; this.pPos[n * 4 + 3] = p.s + p.grow * age;
      this.pCol[n * 4] = p.r; this.pCol[n * 4 + 1] = p.g; this.pCol[n * 4 + 2] = p.b; this.pCol[n * 4 + 3] = p.a * f;
      n++;
    }
    this.pGeo.instanceCount = n;
    if (n) { this.pGeo.attributes.iP.needsUpdate = true; this.pGeo.attributes.iC.needsUpdate = true; }
  }

  dispose() {
    this.tracers.geometry.dispose(); this.tracers.material.dispose(); this.pGeo.dispose(); this.pMesh.material.dispose(); this.missileGeo.dispose(); this.missileMat.dispose();
  }
}
