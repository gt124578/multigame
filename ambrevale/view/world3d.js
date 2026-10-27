// Rendu 3D d'une carte façon DS : sol en cases texturées, falaises, bâtiments en volume,
// arbres et personnages en sprites plats tournés vers la caméra.
import * as THREE from 'three';
import { GR, OB } from '../engine/world.js';
import { TileAtlas, cliffTexture, cliffLipTexture, treeSprite, propSprite, shadowSprite, caveMouthSprite } from '../gfx/tiletex.js';
import { facadeTexture, sideTexture, roofTexture, fountainTop } from '../gfx/buildtex.js';
import { furnitureFaces } from '../gfx/furniture.js';
import { personSheet, FW, FH } from '../gfx/people.js';
import { creatureSprite } from '../gfx/creatures.js';
import { species } from '../engine/species.js';

export const CH = 1.0;          // hauteur d'un niveau de falaise
export const PITCH = 0.92;      // inclinaison de la caméra (radians sous l'horizontale)
const FOV = 22, DIST = 30;

function tex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function mat(t, o = {}) { return new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: o.double ? THREE.DoubleSide : THREE.FrontSide, fog: true, ...o.extra }); }

const SPRITE_OF = {
  [OB.TREE]: 'tree', [OB.PINE]: 'pine', [OB.SNOWPINE]: 'snowpine', [OB.PALM]: 'palm', [OB.DEADTREE]: 'deadtree',
  [OB.ROCK]: 'rock', [OB.BUSH]: 'bush', [OB.SIGN]: 'sign', [OB.FENCE]: 'fence', [OB.LAMP]: 'lamp', [OB.POT]: 'pot', [OB.STATUE]: 'statue',
  [OB.MAILBOX]: 'mailbox', [OB.BOULDER]: 'boulder', [OB.CRYSTAL]: 'crystal', [OB.BARREL]: 'barrel', [OB.CRATE]: 'crate', [OB.BENCH]: 'bench', [OB.STALAG]: 'stalag',
};
const TREES = new Set(['tree', 'pine', 'snowpine', 'palm', 'deadtree']);

export class WorldView {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 256 / 192, 1, 140);
    this.atlas = new TileAtlas();
    this.atlasTex = tex(this.atlas.c);
    this.groundMat = mat(this.atlasTex);
    this.spriteTex = {}; this.spriteMat = {};
    this.cliffMats = {};
    this.group = null; this.actors = new Map();
    this.shadowTex = tex(shadowSprite(16, 8));
    this.tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PITCH);
    this.animT = 0; this.animF = 0;
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
  }

  sprite(kind) {
    if (!this.spriteMat[kind]) {
      const c = TREES.has(kind) ? treeSprite(kind) : kind === 'cavemouth' ? caveMouthSprite() : propSprite(kind);
      const t = tex(c); this.spriteTex[kind] = t;
      this.spriteMat[kind] = { mat: mat(t), w: c.width / 16, h: c.height / 16 };
    }
    return this.spriteMat[kind];
  }
  cliffMat(kind, lip) {
    const key = kind + (lip ? 'L' : '');
    if (!this.cliffMats[key]) this.cliffMats[key] = mat(tex(lip ? cliffLipTexture(kind) : cliffTexture(kind), true));
    return this.cliffMats[key];
  }

  /** construit la scène de la carte */
  load(map) {
    if (this.group) { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    for (const a of this.actors.values()) a.dispose?.();
    this.actors.clear();
    this.map = map;
    const G = this.group = new THREE.Group();
    this.scene.add(G);
    this.scene.background = new THREE.Color(map.outdoor ? '#000000' : '#000000');
    this.buildGround(map);
    this.buildCliffs(map);
    this.buildProps(map);
    for (const b of map.buildings) this.buildBuilding(b, map);
    for (const f of map.furniture) this.buildFurniture(f, map);
    for (const d of map.decor || []) {
      if (d.kind === 'cavemouth') {
        const S = this.sprite('cavemouth');
        const m = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), S.mat);
        m.position.set(d.x + 0.5, map.e(d.x, d.y) * CH - S.h / 2 + 0.02, d.y + 1.01);
        G.add(m);
      }
    }
    this.itemMeshes = [];
    for (const it of map.items) this.addItemMesh(it);
  }

  addItemMesh(it) {
    const S = this.sprite('item');
    const g = new THREE.PlaneGeometry(0.8, 0.8); g.translate(0, 0.4, 0);
    const m = new THREE.Mesh(g, S.mat);
    m.quaternion.copy(this.tiltQ); m.position.set(it.x + 0.5, 0, it.y + 0.55);
    m.userData.item = it;
    this.group.add(m); this.itemMeshes.push(m);
  }
  setItemsVisible(fn) { for (const m of this.itemMeshes) m.visible = fn(m.userData.item); }

  buildGround(map) {
    const CS = 32;
    const nb = (x, y) => (dx, dy) => map.g(x + dx, y + dy);
    for (let cy = 0; cy < map.h; cy += CS) for (let cx = 0; cx < map.w; cx += CS) {
      const pos = [], uv = [], idx = [];
      let n = 0;
      for (let y = cy; y < Math.min(map.h, cy + CS); y++) for (let x = cx; x < Math.min(map.w, cx + CS); x++) {
        const g = map.g(x, y); if (g === GR.VOID) continue;
        const s = this.atlas.ground(g, x, y, nb(x, y), map.theme || {});
        const e = map.e(x, y) * CH + (map.ledge[map.i(x, y)] ? 0.3 : 0);
        pos.push(x, e, y, x + 1, e, y, x + 1, e, y + 1, x, e, y + 1);
        uv.push(s.u0, s.v1, s.u1, s.v1, s.u1, s.v0, s.u0, s.v0);
        idx.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
      }
      if (!n) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeBoundingSphere();
      this.group.add(new THREE.Mesh(geo, this.groundMat));
    }
    this.atlasTex.needsUpdate = true;
  }

  buildCliffs(map) {
    // faces verticales là où une case est plus haute que sa voisine (sud, est, ouest)
    const buckets = {};
    const push = (key, quad) => { (buckets[key] ||= []).push(quad); };
    const kindOf = (x, y) => { const g = map.g(x, y); return map.cave ? 'cave' : g === GR.SNOW || g === GR.SNOWTALL || g === GR.SNOWPATH ? 'snow' : 'grass'; };
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const e = map.e(x, y), i = map.i(x, y);
      const ledgeH = map.ledge[i] ? 0.3 : 0;
      const top = e * CH + ledgeH;
      if (top <= 0) continue;
      const kind = kindOf(x, y);
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        const ne = map.inb(nx, ny) ? map.e(nx, ny) * CH + (map.ledge[map.i(nx, ny)] ? 0.3 : 0) : 0;
        if (ne >= top) continue;
        if (!map.inb(nx, ny) && dy === 0) continue;
        // un segment par unité de hauteur ; le plus haut a la lèvre d'herbe
        for (let h = top; h > ne + 0.001; h -= CH) {
          const h0 = Math.max(ne, h - CH), lip = h === top;
          let q;
          if (dy === 1) q = [x, h, y + 1, x + 1, h, y + 1, x + 1, h0, y + 1, x, h0, y + 1];
          else if (dx === 1) q = [x + 1, h, y + 1, x + 1, h, y, x + 1, h0, y, x + 1, h0, y + 1];
          else q = [x, h, y, x, h, y + 1, x, h0, y + 1, x, h0, y];
          push(kind + (lip ? 'L' : ''), [q, h - h0]);
        }
      }
    }
    for (const [key, quads] of Object.entries(buckets)) {
      const pos = [], uv = [], idx = []; let n = 0;
      for (const [q, hh] of quads) {
        pos.push(...q); uv.push(0, 1, 1, 1, 1, 1 - hh, 0, 1 - hh);
        idx.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeBoundingSphere();
      const lip = key.endsWith('L');
      this.group.add(new THREE.Mesh(geo, this.cliffMat(lip ? key.slice(0, -1) : key, lip)));
    }
  }

  buildProps(map) {
    const lists = {};
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const o = map.o(x, y), g = map.g(x, y);
      if (o && SPRITE_OF[o]) (lists[SPRITE_OF[o]] ||= []).push([x, y]);
      if (g === GR.TALL && !o) (lists.tallgrass ||= []).push([x, y]);
      if (g === GR.SNOWTALL && !o) (lists.snowtall ||= []).push([x, y]);
    }
    const m4 = new THREE.Matrix4(), q = this.tiltQ, s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const shadows = [];
    for (const [kind, cells] of Object.entries(lists)) {
      const S = this.sprite(kind);
      const geo = new THREE.PlaneGeometry(S.w, S.h); geo.translate(0, S.h / 2, 0);
      const inst = new THREE.InstancedMesh(geo, S.mat, cells.length);
      const isTree = TREES.has(kind), grass = kind === 'tallgrass' || kind === 'snowtall';
      cells.forEach(([x, y], k) => {
        const e = map.e(x, y) * CH;
        const jitter = isTree ? ((x * 13 + y * 7) % 5 - 2) * 0.03 : 0;
        p.set(x + 0.5 + jitter, e - (grass ? 0.02 : 0), y + (grass ? 0.92 : isTree ? 0.62 : 0.55));
        m4.compose(p, q, s); inst.setMatrixAt(k, m4);
        if (isTree || kind === 'rock' || kind === 'boulder' || kind === 'statue' || kind === 'lamp') shadows.push([x + (isTree ? 0.62 : 0.55), e + 0.012, y + 0.68, isTree ? 1.5 : 0.9]);
      });
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
    if (shadows.length) {
      const geo = new THREE.PlaneGeometry(1, 0.55); geo.rotateX(-Math.PI / 2);
      const sm = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, fog: true });
      const inst = new THREE.InstancedMesh(geo, sm, shadows.length);
      const sc = new THREE.Vector3(), id = new THREE.Quaternion();
      shadows.forEach(([x, y, z, w], k) => { p.set(x, y, z); sc.set(w, 1, w); m4.compose(p, id, sc); inst.setMatrixAt(k, m4); });
      inst.renderOrder = 1;
      this.group.add(inst);
    }
  }

  buildBuilding(b, map) {
    const G = new THREE.Group();
    const H = b.h, x0 = b.x, x1 = b.x + b.w, z0 = b.y, z1 = b.y + b.d;
    if (b.kind === 'fountain') {
      const top = tex(fountainTop(b.w * 16, b.d * 16));
      this.fountainTex = top; this.fountainB = b;
      const tm = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), mat(top)); tm.rotation.x = -Math.PI / 2; tm.position.set(x0 + b.w / 2, H, z0 + b.d / 2); G.add(tm);
      const side = tex(sideTexture(b, b.w)); const fm = new THREE.Mesh(new THREE.PlaneGeometry(b.w, H), mat(side)); fm.position.set(x0 + b.w / 2, H / 2, z1); G.add(fm);
      for (const sx of [x0, x1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(b.d, H), mat(side)); m.rotation.y = sx === x0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(sx, H / 2, z0 + b.d / 2); G.add(m); }
      this.group.add(G); return;
    }
    // murs
    const front = new THREE.Mesh(new THREE.PlaneGeometry(b.w, H), mat(tex(facadeTexture(b))));
    front.position.set(x0 + b.w / 2, H / 2, z1); G.add(front);
    const sideT = tex(sideTexture(b, b.d));
    for (const sx of [x0, x1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.d, H), mat(sideT));
      m.rotation.y = sx === x0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(sx, H / 2, z0 + b.d / 2); G.add(m);
    }
    // toit
    const snow = b.snow || (map.g(b.x, b.y + b.d) === GR.SNOW || map.g(b.x, b.y + b.d) === GR.SNOWPATH);
    const ov = 0.28;
    if (b.kind === 'tower' || b.kind === 'lighthouse') {
      const R = b.kind === 'lighthouse' ? 1.6 : 2.2, cx = x0 + b.w / 2, cz = z0 + b.d / 2;
      const rt = tex(roofTexture(b, b.w * 16, 32, snow));
      const pts = [[x0 - ov, z1 + ov], [x1 + ov, z1 + ov], [x1 + ov, z0 - ov], [x0 - ov, z0 - ov]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % 4];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([ax, H, az, bx, H, bz, cx, H + R, cz], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        G.add(new THREE.Mesh(geo, mat(rt, { double: true })));
      }
      if (b.kind === 'lighthouse') { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshBasicMaterial({ color: '#fff4a0' })); lamp.position.set(cx, H + 0.2, cz); G.add(lamp); }
    } else {
      const R = Math.min(1.3, b.d * 0.32) * (b.kind === 'gym' || b.kind === 'league' ? 0.8 : 1);
      const zr = z0 + b.d / 2;
      const slopeL = Math.hypot(b.d / 2 + ov, R);
      const rt = tex(roofTexture(b, Math.round((b.w + ov * 2) * 16), Math.round(slopeL * 16), snow));
      const mk = (zA, zB) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([x0 - ov, H + R, zr, x1 + ov, H + R, zr, x1 + ov, H - 0.12, zB, x0 - ov, H - 0.12, zB], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
        geo.setIndex(zB > zr ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
        G.add(new THREE.Mesh(geo, mat(rt, { double: true })));
      };
      mk(zr, z1 + ov); mk(zr, z0 - ov);
      // pignons
      const gt = tex(sideTexture({ ...b, h: R + 0.1 }, b.d));
      for (const sx of [x0, x1]) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([sx, H, z1, sx, H, z0, sx, H + R, zr], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        G.add(new THREE.Mesh(geo, mat(gt, { double: true })));
      }
    }
    // ombre portée au sol
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 0.6, 0.7), new THREE.MeshBasicMaterial({ color: '#102018', transparent: true, opacity: 0.22, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(x0 + b.w / 2 + 0.2, 0.01, z1 + 0.3); G.add(sh);
    this.group.add(G);
  }

  buildFurniture(f, map) {
    const F = furnitureFaces(f);
    const x0 = f.x, z0 = f.y, W = f.w || 1, D = f.d || 1, H = f.h || 1;
    if (F.sprite) {
      const S = this.sprite(F.sprite);
      const geo = new THREE.PlaneGeometry(S.w, S.h); geo.translate(0, S.h / 2, 0);
      for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
        const m = new THREE.Mesh(geo, S.mat); m.quaternion.copy(this.tiltQ); m.position.set(x0 + x + 0.5, 0, z0 + y + 0.6); this.group.add(m);
      }
      return;
    }
    if (F.top) {
      const tm = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(tex(F.top), { extra: { polygonOffset: true, polygonOffsetFactor: -1 } }));
      tm.rotation.x = -Math.PI / 2; tm.position.set(x0 + W / 2, H + 0.002, z0 + D / 2); this.group.add(tm);
      if (F.anim) this.animFurniture = (this.animFurniture || []).concat([{ mesh: tm, F }]);
    }
    if (F.front && H > 0.05) { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(tex(F.front))); m.position.set(x0 + W / 2, H / 2, z0 + D); this.group.add(m); }
    if (F.side && H > 0.05 && f.kind !== 'wall') for (const sx of [x0, x0 + W]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(D, H), mat(tex(F.side))); m.rotation.y = sx === x0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(sx, H / 2, z0 + D / 2); this.group.add(m); }
  }

  // ------------------------------------------------------------ personnages
  addActor(id, o) {
    let a = this.actors.get(id);
    if (a) return a;
    a = new Actor(this, o);
    this.actors.set(id, a);
    this.group.add(a.obj);
    return a;
  }
  addFollower(id, spId, f) {
    const a = new Follower(this, spId, f);
    this.actors.set(id, a); this.group.add(a.obj);
    return a;
  }
  removeActor(id) { const a = this.actors.get(id); if (a) { this.group.remove(a.obj); this.actors.delete(id); } }

  // ------------------------------------------------------------ boucle
  update(dt, tx, tz, ty = 0) {
    this.animT += dt;
    if (this.animT > 0.22) { this.animT = 0; this.animF = (this.animF + 1) % 8; this.atlas.tick(this.animF); this.atlasTex.needsUpdate = true;
      if (this.fountainTex) { const c = fountainTop(this.fountainB.w * 16, this.fountainB.d * 16, this.animF); this.fountainTex.image = c; this.fountainTex.needsUpdate = true; } }
    this.camTarget.set(tx, ty, tz);
    const cam = this.camera;
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= 0.85; if (this.shake < 0.01) this.shake = 0; }
    cam.position.set(tx + sx, ty + DIST * Math.sin(PITCH) + sy, tz + DIST * Math.cos(PITCH));
    cam.lookAt(tx + sx, ty + sy, tz);
    for (const a of this.actors.values()) a.update(dt);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

// ------------------------------------------------------------ personnage (sprite 4 directions)
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
class Actor {
  constructor(view, o) {
    this.view = view; this.look = o.look; this.creature = o.creature;
    this.obj = new THREE.Group();
    let t, w = 1, h = 1.5;
    if (o.creature) {
      const sp = species(o.creature);
      const c = creatureSprite(o.creature, sp.sp, 'front', 64);
      t = tex(c); w = 3.2; h = 3.2;
      this.static = true;
    } else {
      t = tex(personSheet(o.look));
      t.repeat.set(1 / 3, 1 / 4);
    }
    this.tex = t;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, fog: true }));
    this.mesh.quaternion.copy(view.tiltQ);
    this.obj.add(this.mesh);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.42), new THREE.MeshBasicMaterial({ map: view.shadowTex, transparent: true, depthWrite: false, fog: true }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.015, 0.05); sh.renderOrder = 1;
    this.obj.add(sh); this.shadow = sh;
    this.dir = o.dir || 'down'; this.frame = 0; this.jump = 0;
    this.setPos(o.x, o.y, 0);
    this.setFrame();
  }
  setPos(x, y, z = 0) { this.x = x; this.y = y; this.obj.position.set(x + 0.5, z, y + 0.5); }
  setDir(d) { if (d !== this.dir) { this.dir = d; this.setFrame(); } }
  setStep(f) { if (f !== this.frame) { this.frame = f; this.setFrame(); } }
  setFrame() {
    if (this.static) return;
    const row = DIR_ROW[this.dir] ?? 0;
    this.tex.offset.set(this.frame / 3, 1 - (row + 1) / 4);
  }
  setVisible(v) { this.obj.visible = v; }
  update() {
    this.mesh.position.y = this.jump;
    this.shadow.scale.setScalar(1 - Math.min(0.4, this.jump * 0.6));
  }
}

// ------------------------------------------------------------ créature qui suit le joueur
class Follower {
  constructor(view, spId, f) {
    this.view = view;
    const sp = species(spId).sp;
    this.front = tex(creatureSprite(spId, sp, 'front', 32));
    this.back = tex(creatureSprite(spId, sp, 'back', 32));
    this.obj = new THREE.Group();
    const geo = new THREE.PlaneGeometry(2, 2); geo.translate(0, 0.96, 0);
    this.mat = new THREE.MeshBasicMaterial({ map: this.front, alphaTest: 0.5, fog: true });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.quaternion.copy(view.tiltQ);
    this.obj.add(this.mesh);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: view.shadowTex, transparent: true, depthWrite: false, fog: true }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.015, 0.05); sh.renderOrder = 1; this.obj.add(sh);
    this.hop = 0; this.dir = 'down';
    this.setPos(f.x, f.y); this.setDir(f.dir);
  }
  setPos(x, y) { this.obj.position.set(x + 0.5, 0, y + 0.45); }
  setDir(d) {
    this.dir = d;
    this.mat.map = d === 'up' ? this.back : this.front; this.mat.needsUpdate = true;
    // la face regarde vers la gauche ; on retourne le sprite pour aller à droite
    this.mesh.scale.x = d === 'right' ? -1 : d === 'up' ? -1 : 1;
  }
  setStep() {}
  setVisible(v) { this.obj.visible = v; }
  update() { this.mesh.position.y = this.hop; }
}
