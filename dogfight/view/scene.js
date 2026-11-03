// Scène de Dogfight 3D : rend la vraie île, le ciel, les avions et les effets, et gère la caméra de poursuite et la qualité.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { buildGround } from './ground.js';
import { buildSky, buildClouds, buildVolumetric, noiseTexture, HAZE, FOG_DENSITY, SUN } from './sky.js';
import { buildPlane, loadPlanes, makeEnvironment } from './plane.js';
import { FxManager } from './fx.js';
import { ZONE_CEIL } from '../engine/modes.js';

const QUALITY = {
  bas: { pr: 1, clouds: 0.33, trees: 0.5, vol: false },
  moyen: { pr: 1.5, clouds: 1, trees: 1, vol: false },
  eleve: { pr: 1.5, clouds: 0, trees: 1, vol: true },
};
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), basis = new THREE.Matrix4();
const worldUp = new THREE.Vector3(0, 1, 0);
const ZONE_COLORS = [[0.92, 0.93, 0.95], [0.31, 0.55, 1], [1, 0.35, 0.3]];
const ZONE_DEPTH = 60;   // la colonne s'enfonce sous le sol : le relief n'est pas plat sous une zone

export class DogfightScene {
  constructor(container, world) {
    this.container = container; this.world = world;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(HAZE, FOG_DENSITY);
    this.camera = new THREE.PerspectiveCamera(66, (container.clientWidth || innerWidth) / (container.clientHeight || innerHeight), 0.5, 14000);
    this.scene.add(new THREE.HemisphereLight(0xcfe0f2, 0x5f6650, 1.05));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.copy(SUN); this.scene.add(sun);

    this.noise = noiseTexture();
    this.sky = buildSky(this.scene, this.noise, () => this.camera);
    this.ground = buildGround(this.scene, world.map, SUN, this.noise, this.renderer.capabilities.getMaxAnisotropy());
    this.clouds = buildClouds(this.scene, world.clouds);
    this.env = makeEnvironment(this.renderer, this.sky);
    this.volumetric = null;
    this.ready = loadPlanes(this.env);
    this.fx = new FxManager(this.scene, this.camera);

    this.planes = new Map();
    this.camOffset = new THREE.Vector3(0, 6, -19);
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.camInit = false;
    this.shake = 0; this.orbit = 0;
    this.preview = null; this.previewType = null;
    this.quality = 'moyen'; this.prCap = 1.5;
    this.zones = new Map();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.volumetric) this.volumetric.resize();
  }

  setQuality(q) {
    const Q = QUALITY[q] || QUALITY.moyen;
    this.quality = QUALITY[q] ? q : 'moyen';
    this.prCap = Q.pr;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.prCap));
    this.ground.trees.setDensity(Q.trees);
    if (Q.vol) {
      try { if (!this.volumetric) this.volumetric = buildVolumetric(this.renderer, this.world.clouds); } catch (e) { console.warn('Nuages volumétriques indisponibles :', e); this.volumetric = null; return this.setQuality('moyen'); }
      this.clouds.setVisible(false);
    } else {
      this.clouds.setVisible(true);
      this.clouds.setDensity(Q.clouds);
    }
    this.resize();
    return this.quality;
  }

  // Qualité automatique : un cran plus bas, puis une image moins définie. Rend ce qui a changé, ou null
  lowerQuality() {
    if (this.quality === 'eleve') { this.setQuality('moyen'); return 'nuages en bouffées'; }
    if (this.quality === 'moyen') { this.setQuality('bas'); return 'moins de nuages et d\'arbres'; }
    if (this.prCap > 0.75) { this.prCap = 0.75; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.75)); this.resize(); return 'image moins définie'; }
    return null;
  }

  // Domination : une colonne translucide par zone, dont le haut marque le plafond de capture, à la couleur de son camp
  syncZones(zones) {
    if (!zones) { if (this.zones.size) { for (const m of this.zones.values()) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.zones.clear(); } return; }
    for (const z of zones) {
      let m = this.zones.get(z.id);
      if (!m) {
        const h = ZONE_CEIL + ZONE_DEPTH;
        m = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, h, 72, 1, true), new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uC: { value: new THREE.Vector3() }, uA: { value: 1 } },
          vertexShader: 'varying float vH; void main(){ vH=uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
          fragmentShader: 'varying float vH; uniform vec3 uC; uniform float uA; void main(){ float a=.03+.2*vH*vH+smoothstep(.975,.995,vH)*.75; gl_FragColor=vec4(uC,a*uA); }',
        }));
        m.position.set(z.x, z.y - ZONE_DEPTH + h / 2, z.z); m.renderOrder = 4; this.scene.add(m); this.zones.set(z.id, m);
      }
      const c = ZONE_COLORS[z.own] || ZONE_COLORS[0];
      m.material.uniforms.uC.value.set(c[0], c[1], c[2]);
    }
  }

  syncPlanes(list, dt = 0.016) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, m] of this.planes) if (!ids.has(id)) { this.scene.remove(m.root); m.dispose(); this.planes.delete(id); }
    for (const p of list) {
      let m = this.planes.get(p.id);
      const col = p.tagColor || p.color;
      if (!m || m.type !== p.type || m.col !== col) {
        if (m) { this.scene.remove(m.root); m.dispose(); }
        m = buildPlane(p.type, col); m.col = col; this.scene.add(m.root); this.planes.set(p.id, m);
      }
      m.root.visible = p.alive && (p.inv <= 0 || Math.floor(this.fx.time * 10) % 2 === 0 || !p.alive);
      if (!p.alive) continue;
      m.root.position.set(p.x, p.y, p.z);
      m.root.quaternion.set(p.qx, p.qy, p.qz, p.qw);
      m.setBoost(p.boosting, dt);
    }
  }
  firing(p, dt) { const m = this.planes.get(p.id); if (m) m.setFiring(p.firing, dt); }

  // Caméra de poursuite. La position suit l'avion sans retard ; seul l'angle autour de lui est amorti.
  updateCamera(me, aim, dt, boostAmt) {
    const fwd = v1.set(me.fx, me.fy, me.fz);
    const dir = aim ? v2.set(aim.x, aim.y, aim.z).lerp(fwd, 0.18).normalize() : v2.copy(fwd);
    const dist = (me.type === 'f22' ? 25 : 22) + boostAmt * 3, height = 6;
    const planeUp = v3.set(me.ux, me.uy, me.uz);
    const vert = Math.abs(fwd.y);
    const upW = 0.3 + 0.7 * THREE.MathUtils.smoothstep(vert, 0.6, 0.95);
    const up = new THREE.Vector3().copy(worldUp).lerp(planeUp, upW).normalize();
    this.camUp.lerp(up, Math.min(1, 7 * dt)).normalize();
    const want = dir.clone().multiplyScalar(-dist).addScaledVector(this.camUp, height);
    if (!this.camInit) { this.camOffset.copy(want); this.camInit = true; }
    else this.camOffset.lerp(want, Math.min(1, 6 * dt));
    this.camera.position.set(me.x, me.y, me.z).add(this.camOffset);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.2); const s = this.shake * 0.5; this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s; this.camera.position.z += (Math.random() - 0.5) * s; }
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(me.x + dir.x * 120 - this.camUp.x * 7, me.y + dir.y * 120 - this.camUp.y * 7, me.z + dir.z * 120 - this.camUp.z * 7);
    const fov = 66 + boostAmt * 8;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, 5 * dt); this.camera.updateProjectionMatrix(); }
    // évite de passer sous le sol
    const g = this.world.obstacleAt(this.camera.position.x, this.camera.position.z) + 1.5;
    if (this.camera.position.y < g) this.camera.position.y = g;
  }

  // À la mort : on regarde son tueur, ou l'épave
  watch(x, y, z, dt) {
    this.orbit += dt * 0.35;
    const r = 60;
    this.camera.position.lerp(v1.set(x + Math.cos(this.orbit) * r, Math.max(y + 22, this.world.obstacleAt(x, z) + 8), z + Math.sin(this.orbit) * r), Math.min(1, 3 * dt));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(x, y, z);
    this.camInit = false;
  }

  // Au hangar : l'avion choisi tourne au-dessus de l'île
  showPreview(type, color, dt) {
    if (this.previewType !== type) {
      if (this.preview) { this.scene.remove(this.preview.root); this.preview.dispose(); }
      this.preview = buildPlane(type, color); this.previewType = type; this.scene.add(this.preview.root);
      const { root } = this.preview; root.position.set(870, 215, 1050);
    }
    this.preview.root.visible = true;
    this.orbit += dt * 0.28;
    const r = 24, { position: p } = this.preview.root;
    this.preview.root.rotation.set(0, -0.9 + Math.sin(this.orbit * 0.7) * 0.08, Math.sin(this.orbit * 0.9) * 0.1);
    this.camera.position.set(p.x + Math.cos(this.orbit) * r, p.y + 6.5 + Math.sin(this.orbit * 0.6) * 2, p.z + Math.sin(this.orbit) * r);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(p.x, p.y + 0.4, p.z);
    if (this.camera.fov !== 50) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    this.camInit = false;
  }
  hidePreview() { if (this.preview) this.preview.root.visible = false; if (this.camera.fov === 50) { this.camera.fov = 66; this.camera.updateProjectionMatrix(); } }

  draw() {
    this.camera.updateMatrixWorld();
    this.ground.update(this.camera.position);
    this.clouds.update(this.camera.position);
    if (this.volumetric) this.volumetric.pre(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.volumetric) this.volumetric.post();
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    for (const m of this.planes.values()) m.dispose();
    this.fx.dispose(); this.ground.dispose(); this.clouds.dispose();
    if (this.volumetric) this.volumetric.dispose();
    this.noise.dispose(); this.env.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
