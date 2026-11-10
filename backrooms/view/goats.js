// The Backrooms (Level 2) - Les chèvres du troupeau. Le modèle (models/chevre.glb) est un seul maillage, sans
// squelette : on l'anime dans le shader. Les pattes balancent par paires diagonales au trot et ensemble au galop de la
// charge, le sabot avant gratte le sol avant de charger, la tête broute, se dresse quand elle repère quelqu'un, se
// baisse pour foncer et secoue quand elle s'est assommée. Ses yeux renvoient la lumière de la lampe torche.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

const MODEL = new URL('../models/chevre.glb', import.meta.url).href;
const SCALE = 0.64; // le modèle fait 2 unités de haut : 1,25 m jusqu'au haut de la tête
const FOOT = 1.0; // le bas des sabots, sous l'origine du modèle
const EYES = [[0.19, 0.56, 0.84], [-0.21, 0.56, 0.83]]; // les yeux, dans le repère du modèle
const ALPHA_SCALE = 1.3; // le bouc alpha : plus grand, plus sombre, une cloche au cou, les yeux rouges quand il enrage
const BELL = [0, 0.06, 0.56]; // la cloche, sous le cou (repère du modèle)

// la déformation, dans le repère du modèle (y en haut, la tête vers +z)
const DEFORM = /* glsl */ `
uniform float uPhase;
uniform float uAmp;
uniform float uGallop;
uniform float uHead;
uniform float uShake;
uniform float uPaw;
vec2 gRot(vec2 p, vec2 piv, float a) {
  vec2 d = p - piv;
  return piv + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
}
vec3 goatDeform(vec3 p) {
  // les pattes : balancier autour de l'épaule ou de la hanche
  float w = smoothstep(-0.32, -0.62, p.y);
  if (w > 0.0) {
    bool front = p.z > -0.22;
    bool left = p.x > -0.02;
    vec2 piv = front ? vec2(-0.36, 0.06) : vec2(-0.40, -0.60);
    float trot = (front == left) ? 0.0 : 3.14159;
    float gal = front ? (left ? 0.0 : 0.35) : (left ? 2.4 : 2.75);
    float ph = uPhase + mix(trot, gal, uGallop);
    float a = sin(ph) * uAmp * (0.45 + uGallop * 0.3);
    // le sabot qui gratte le sol avant la charge (avant gauche)
    if (front && left) a += uPaw;
    vec2 yz = gRot(vec2(p.y, p.z), piv, a * w);
    p.y = yz.x + max(0.0, cos(ph)) * 0.08 * uAmp * w;
    p.z = yz.y;
  }
  // la tête et le cou : baissés (broute, charge) ou dressés, secoués quand elle est sonnée
  float hw = smoothstep(0.12, 0.42, p.z) * smoothstep(-0.3, 0.05, p.y);
  if (hw > 0.0) {
    vec2 yz = gRot(vec2(p.y, p.z), vec2(0.1, 0.25), -uHead * hw);
    p.y = yz.x;
    p.z = yz.y;
    vec2 xz = gRot(vec2(p.x, p.z), vec2(0.0, 0.25), uShake * hw);
    p.x = xz.x;
    p.z = xz.y;
  }
  return p;
}
`;

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function eyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  r.addColorStop(0, 'rgba(255,255,235,1)');
  r.addColorStop(0.25, 'rgba(225,255,170,0.9)');
  r.addColorStop(1, 'rgba(120,200,60,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGoatHerd(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const goats = []; // vues, une par chèvre du moteur
  let geo = null;
  let map = null;
  new GLTFLoader().load(MODEL, (g) => {
    g.scene.traverse((o) => {
      if (!o.isMesh || geo) return;
      geo = o.geometry;
      map = o.material.map;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
    });
    for (const v of goats) v.attach();
  });
  const shadowMap = shadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1.5, 1.9);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
  const eyeMap = eyeTexture();

  const bellMat = new THREE.MeshLambertMaterial({ color: '#8c6a2c', emissive: '#3a2a10', emissiveIntensity: 0.3 });
  const bellGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.16, 12, 1, true);
  const makeView = (alpha = false) => {
    const sc = SCALE * (alpha ? ALPHA_SCALE : 1);
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(sc);
    body.position.y = FOOT * sc;
    root.add(body);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.012;
    root.add(shadow);
    const u = {
      uPhase: { value: Math.random() * 6 },
      uAmp: { value: 0 },
      uGallop: { value: 0 },
      uHead: { value: 0 },
      uShake: { value: 0 },
      uPaw: { value: 0 },
    };
    const eyeMat = new THREE.SpriteMaterial({ map: eyeMap, color: alpha ? '#ff3a22' : '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const eyes = EYES.map(([x, y, z]) => {
      const s = new THREE.Sprite(eyeMat);
      s.position.set(x, y, z + 0.03);
      s.scale.setScalar(0.09);
      body.add(s);
      return s;
    });
    let bell = null;
    if (alpha) {
      bell = new THREE.Group();
      const cup = new THREE.Mesh(bellGeo, bellMat);
      bell.add(cup);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), new THREE.MeshLambertMaterial({ color: '#2a1d14' }));
      strap.position.y = 0.17;
      strap.rotation.x = Math.PI / 2;
      strap.scale.set(1, 1.15, 1);
      bell.add(strap);
      body.add(bell);
    }
    if (alpha) shadow.scale.setScalar(ALPHA_SCALE);
    group.add(root);
    const v = {
      root,
      body,
      alpha,
      bell,
      sc,
      u,
      eyeMat,
      eyes,
      mat: null,
      x: null,
      z: null,
      yaw: 0,
      speed: 0,
      head: 0,
      shake: 0,
      attach() {
        if (!geo || v.mat) return;
        v.mat = new THREE.MeshLambertMaterial({ map, color: alpha ? '#6e625c' : '#ffffff', emissive: alpha ? '#b0a090' : '#ffffff', emissiveMap: map, emissiveIntensity: 0 });
        v.mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, u);
          sh.vertexShader = DEFORM + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = goatDeform(position);');
        };
        v.mat.customProgramCacheKey = () => 'goat';
        const mesh = new THREE.Mesh(geo, v.mat);
        mesh.frustumCulled = false;
        body.add(mesh);
      },
    };
    v.attach();
    return v;
  };

  const tmp = new THREE.Vector3();
  // percuté : une chèvre fonce droit dans la caméra, tête la première
  let scareT = 0;
  let scareView = null;
  const camDir = new THREE.Vector3();
  return {
    group,
    scare() {
      scareT = 0.85;
      if (!scareView) scareView = makeView();
    },
    // sim : le moteur ; P : le joueur suivi par la caméra ; camera ; lightAt(x, z) : la lumière des lampes à cet
    // endroit ; lampOn : la lampe torche de ce joueur est allumée
    update(sim, P, camera, lightAt, lampOn, dt, time) {
      const list = sim.goats || [];
      while (goats.length < list.length) goats.push(makeView(!!(list[goats.length] && list[goats.length].alpha)));
      if (scareView) {
        scareT = Math.max(0, scareT - dt);
        scareView.root.visible = scareT > 0;
        if (scareT > 0) {
          camera.getWorldDirection(camDir);
          const l = Math.hypot(camDir.x, camDir.z) || 1;
          const d = 0.25 + scareT * 2.6;
          scareView.root.position.set(camera.position.x + (camDir.x / l) * d, camera.position.y - 1.25, camera.position.z + (camDir.z / l) * d);
          scareView.root.rotation.set(0, Math.atan2(-camDir.x, -camDir.z), 0);
          scareView.u.uPhase.value += dt * 26;
          scareView.u.uAmp.value = 1;
          scareView.u.uGallop.value = 1;
          scareView.u.uHead.value = -0.05;
          scareView.u.uShake.value = Math.sin(time * 40) * 0.08;
          scareView.eyeMat.opacity = 1;
          if (scareView.mat) scareView.mat.emissiveIntensity = 0.35;
        }
      }
      group.visible = list.length > 0;
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      goats.forEach((v, i) => {
        const g = list[i];
        v.root.visible = !!g;
        if (!g) return;
        // la position suit le moteur en douceur (les instantanés de l'hôte arrivent 20 fois par seconde)
        if (v.x === null || Math.hypot(g.x - v.x, g.z - v.z) > 4) {
          v.x = g.x;
          v.z = g.z;
          v.yaw = g.yaw;
        }
        const k = Math.min(1, dt * (g.mode === 'charge' ? 20 : 10));
        const px = v.x;
        const pz = v.z;
        v.x += (g.x - v.x) * k;
        v.z += (g.z - v.z) * k;
        let dy = g.yaw - v.yaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        v.yaw += dy * Math.min(1, dt * (g.mode === 'charge' || g.mode === 'windup' ? 14 : 6));
        const sp = dt > 0 ? Math.hypot(v.x - px, v.z - pz) / dt : 0;
        v.speed += (Math.min(9, sp) - v.speed) * Math.min(1, dt * 8);

        // l'allure : la foulée s'allonge avec la vitesse ; au-delà de 3 m/s, elle galope
        const gallop = THREE.MathUtils.smoothstep(v.speed, 2.6, 4.5);
        const stride = THREE.MathUtils.lerp(1.0, 2.3, gallop);
        v.u.uPhase.value += (dt * v.speed * Math.PI * 2) / stride;
        v.u.uAmp.value = THREE.MathUtils.clamp(v.speed / 1.1, 0, 1);
        v.u.uGallop.value = gallop;
        // la tête : broute à l'arrêt, dressée quand elle traque, baissée pour charger, secouée quand elle est sonnée
        const grazing = g.mode === 'roam' && v.speed < 0.3;
        const wantHead = g.mode === 'charge' || g.mode === 'windup' ? 0.55 : g.mode === 'stun' ? 0.2 : grazing ? 0.75 + Math.sin(time * 0.7 + i) * 0.08 : g.mode === 'stalk' || g.mode === 'lurk' ? -0.12 : 0.15;
        v.head += (wantHead - v.head) * Math.min(1, dt * 5);
        v.u.uHead.value = v.head;
        v.u.uShake.value = g.mode === 'stun' ? Math.sin(time * 19) * 0.45 : g.mode === 'lurk' ? Math.sin(time * 1.1 + i * 2) * 0.12 : 0;
        v.u.uPaw.value = g.mode === 'windup' ? Math.max(0, Math.sin(time * 13 + i)) * -0.7 : 0;

        v.root.position.set(v.x, Math.abs(Math.sin(v.u.uPhase.value)) * 0.035 * v.u.uAmp.value, v.z);
        v.root.rotation.set(0, v.yaw, 0);
        // en pleine charge, elle plonge en avant ; sonnée, elle titube
        v.body.rotation.x = g.mode === 'charge' ? 0.08 : 0;
        v.body.rotation.z = g.mode === 'stun' ? Math.sin(time * 7) * 0.12 : 0;

        // la lumière des lampes là où elle est (le pelage noir reste sombre)
        if (v.mat) v.mat.emissiveIntensity = Math.min(0.5, lightAt(v.x, v.z) * 0.32) + 0.02;
        // les yeux brillent dans le faisceau de la lampe torche
        const ex = v.x - P.x;
        const ez = v.z - P.z;
        const d = Math.hypot(ex, ez);
        const inBeam = d > 0.01 ? (ex * fx + ez * fz) / d : 0;
        const shine = lampOn ? THREE.MathUtils.smoothstep(inBeam, 0.86, 0.97) * THREE.MathUtils.clamp(1.15 - d / 24, 0, 1) : 0;
        // et seulement si elle regarde vers nous
        tmp.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        const looks = d > 0.01 ? THREE.MathUtils.smoothstep(-(tmp.x * ex + tmp.z * ez) / d, 0.1, 0.6) : 0;
        // le bouc enragé : ses yeux rougeoient dans le noir, même sans lampe
        const glare = v.alpha && g.rage ? (0.55 + Math.sin(time * 3) * 0.1) * THREE.MathUtils.clamp(1.3 - d / 26, 0, 1) : 0;
        v.eyeMat.opacity = Math.max(shine, glare) * looks;
        const es = 0.07 + d * 0.004;
        // les yeux suivent la tête (même rotation que le shader)
        const a = -v.head;
        const sh = v.u.uShake.value;
        v.eyes.forEach((e, j) => {
          const [x0, y0, z0] = EYES[j];
          const dy = y0 - 0.1;
          const dz = z0 + 0.03 - 0.25;
          const y1 = 0.1 + dy * Math.cos(a) - dz * Math.sin(a);
          const z1 = 0.25 + dy * Math.sin(a) + dz * Math.cos(a);
          e.position.set(x0 * Math.cos(sh) - (z1 - 0.25) * Math.sin(sh), y1, 0.25 + x0 * Math.sin(sh) + (z1 - 0.25) * Math.cos(sh));
          e.scale.setScalar(es / v.sc);
        });
        if (v.bell) {
          // la cloche suit le cou et ballotte
          const [, y0, z0] = BELL;
          const dy = y0 - 0.1;
          const dz = z0 - 0.25;
          v.bell.position.set(0, 0.1 + dy * Math.cos(a) - dz * Math.sin(a), 0.25 + dy * Math.sin(a) + dz * Math.cos(a));
          v.bell.rotation.set(Math.sin(v.u.uPhase.value * 2) * 0.35 * v.u.uAmp.value - a * 0.5, 0, Math.sin(time * 2 + i) * 0.08);
          bellMat.emissiveIntensity = 0.15 + Math.min(0.6, lightAt(v.x, v.z) * 0.4);
        }
      });
    },
  };
}
