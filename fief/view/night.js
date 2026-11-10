// Fief Maudit : le jour, le crépuscule et la nuit. Couleurs du ciel (le dôme de Birdie Party), du soleil puis de la
// lune, de la lumière d'ambiance et du brouillard, en fondu selon `darkness` (0 le jour, 1 la nuit). La brume : trois
// nappes qui épousent le sol, ajourées autour du feu de camp et des braseros allumés. Les braseros : un fût de pierre,
// une vasque de fer, des braises et des flammes dont la taille suit le bois qu'il reste, et leur lumière.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { LIGHT_R, FIRE_LIGHT_R } from '../engine/map.js';
import { FUEL } from '../engine/sim.js';

const C = (h) => new THREE.Color(h);
// trois moments : jour, crépuscule, nuit
const KEYS = [
  { zen: 0x2f66bd, hor: 0xd8e2e6, gro: 0xa9bccd, sun: 0xfff0d6, shade: 0xa7b3c4, lit: 0xffffff, glow: 1, stars: 0,
    dir: [-0.5, 0.62, 0.6], sunC: 0xffe8c8, sunI: 3.4, hemS: 0xc8d8ec, hemG: 0x3b4a24, hemI: 0.55, exp: 1.0, env: 0.45, fog: 0xb6c6cc, near: 70, far: 330 },
  { zen: 0x2c4a8c, hor: 0xf4a46c, gro: 0x9a7868, sun: 0xffb46a, shade: 0x9a6a70, lit: 0xffcfa2, glow: 1.5, stars: 0.2,
    dir: [-0.62, 0.2, -0.76], sunC: 0xffa45c, sunI: 2.2, hemS: 0xf2b88e, hemG: 0x3a2e1e, hemI: 0.4, exp: 1.0, env: 0.3, fog: 0x9c7a78, near: 40, far: 200 },
  { zen: 0x070d22, hor: 0x24304e, gro: 0x121722, sun: 0xdce6ff, shade: 0x1c2238, lit: 0x5c6a90, glow: 0.3, stars: 1,
    dir: [0.36, 0.62, -0.7], sunC: 0x8ea6ff, sunI: 0.5, hemS: 0x3c4c78, hemG: 0x0a0c12, hemI: 0.42, exp: 1.12, env: 0.1, fog: 0x161d2c, near: 6, far: 70 },
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const mixC = (a, b, t, out) => out.copy(tmpA.setHex(a)).lerp(tmpB.setHex(b), t);
const mixN = (a, b, t) => a + (b - a) * t;

export function createNight({ scene, renderer, sky, sun, hemi, map, noise, peaks }) {
  const U = sky.material.uniforms;
  const dir = new THREE.Vector3(), da = new THREE.Vector3(), db = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  let lastD = -1;
  function setDarkness(d) {
    if (Math.abs(d - lastD) < 0.002) return;
    lastD = d;
    const [a, b, t] = d < 0.5 ? [KEYS[0], KEYS[1], d * 2] : [KEYS[1], KEYS[2], (d - 0.5) * 2];
    mixC(a.zen, b.zen, t, U.uZen.value); mixC(a.hor, b.hor, t, U.uHor.value); mixC(a.gro, b.gro, t, U.uGround.value);
    mixC(a.sun, b.sun, t, U.uSun.value); mixC(a.shade, b.shade, t, U.uShade.value); mixC(a.lit, b.lit, t, U.uLit.value);
    U.uGlow.value = mixN(a.glow, b.glow, t); U.uNight.value = mixN(a.stars, b.stars, t);
    dir.copy(da.set(...a.dir).normalize()).lerp(db.set(...b.dir).normalize(), t).normalize();
    U.uSunDir.value.copy(dir); sunDir.copy(dir);
    mixC(a.sunC, b.sunC, t, sun.color); sun.intensity = mixN(a.sunI, b.sunI, t);
    mixC(a.hemS, b.hemS, t, hemi.color); mixC(a.hemG, b.hemG, t, hemi.groundColor); hemi.intensity = mixN(a.hemI, b.hemI, t);
    renderer.toneMappingExposure = mixN(a.exp, b.exp, t);
    scene.environmentIntensity = mixN(a.env, b.env, t);
    mixC(a.fog, b.fog, t, scene.fog.color); scene.fog.near = mixN(a.near, b.near, t); scene.fog.far = mixN(a.far, b.far, t);
    if (peaks) peaks.visible = d < 0.55;
    fog.U.uNight.value = d;
  }

  // ------------------------------------------------------------------ brume
  const LIGHTS = 1 + map.braziers.length;
  const fogU = { uT: { value: 0 }, uNight: { value: 0 }, uNoise: { value: noise }, uColor: { value: C(0x7f90aa) }, uL: { value: Array.from({ length: LIGHTS }, () => new THREE.Vector3()) } };
  const fogMat = new THREE.ShaderMaterial({
    uniforms: fogU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vW; varying float vD;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vW; varying float vD; uniform float uT; uniform float uNight; uniform sampler2D uNoise; uniform vec3 uColor; uniform vec3 uL[${LIGHTS}];
      void main(){
        float n = texture2D(uNoise, vW.xz * 0.018 + vec2(uT * 0.006, uT * 0.004)).r * 0.6 + texture2D(uNoise, vW.xz * 0.05 - vec2(uT * 0.011, -uT * 0.007)).g * 0.4;
        float a = smoothstep(0.32, 0.8, n) * 0.55 + 0.12;
        // trouée autour des lumières
        float hole = 1.0;
        for (int i = 0; i < ${LIGHTS}; i++) { if (uL[i].z > 0.0) hole *= smoothstep(uL[i].z * 0.75, uL[i].z * 1.15, distance(vW.xz, uL[i].xy)); }
        a *= hole * smoothstep(0.6, 1.0, uNight) * (0.25 + 0.75 * smoothstep(5.0, 16.0, vD)) * (1.0 - smoothstep(55.0, 80.0, vD));
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * (0.7 + 0.4 * n), a * 0.42);
      }`,
  });
  // nappes posées sur le relief, jusqu'à 72 m du village
  const R = 72, step = 3, n = R * 2 / step;
  const base = new THREE.PlaneGeometry(R * 2, R * 2, n, n).rotateX(-Math.PI / 2);
  const group = new THREE.Group(); group.visible = false;
  for (const h of [0.2, 0.55, 1.05]) {
    const g = base.clone(), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, map.heightAt(pos.getX(i), pos.getZ(i)) + h);
    const m = new THREE.Mesh(g, fogMat); m.renderOrder = 5; m.frustumCulled = false; group.add(m);
  }
  scene.add(group);
  const fog = { U: fogU, group };

  // ------------------------------------------------------------------ braseros
  const flameTex = (() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 92, 2, 32, 80, 60); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(62, 80, 32, 124); x.quadraticCurveTo(2, 80, 32, 4); x.fill(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const fmat = new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.9, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2926, roughness: 0.6, metalness: 0.6 });
  const coal = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff5a14, emissiveIntensity: 1.5, roughness: 1 });
  const braziers = map.braziers.map((b) => {
    const g = new THREE.Group(), y = map.heightAt(b.x, b.z);
    g.position.set(b.x, y, b.z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.9, 7), stone); foot.position.y = 0.45; foot.castShadow = foot.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.12, 7), stone); cap.position.y = 0.96; cap.castShadow = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.32, 0.36, 12, 1, true), iron); bowl.position.y = 1.2; bowl.castShadow = true; bowl.material.side = THREE.DoubleSide;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 18).rotateX(Math.PI / 2), iron); rim.position.y = 1.38;
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), coal); coals.position.y = 1.3;
    g.add(foot, cap, bowl, rim, coals);
    // quatre pieds de fer qui tiennent la vasque
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), iron); leg.position.set(Math.sin(a) * 0.45, 1.08, Math.cos(a) * 0.45); leg.rotation.z = Math.sin(a) * 0.35; leg.rotation.x = -Math.cos(a) * 0.35; g.add(leg); }
    const flames = [];
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(fmat); s.position.set(Math.sin(i * 1.7) * 0.18, 1.6, Math.cos(i * 1.7) * 0.18); g.add(s); flames.push(s); }
    const light = new THREE.PointLight(0xff8a3a, 0, LIGHT_R * 1.7, 1.5); light.position.y = 2; g.add(light);
    scene.add(g);
    return { g, flames, light, coals, b };
  });

  function update(sim, t) {
    const d = sim.darkness;
    setDarkness(d);
    fogU.uT.value = t;
    group.visible = d > 0.55;
    const c = map.campfire;
    fogU.uL.value[0].set(c.x, c.z, FIRE_LIGHT_R);
    braziers.forEach((B, i) => {
      const fuel = sim.braziers[B.b.id].fuel, on = fuel > 0, k = Math.min(1, fuel / FUEL.log);
      fogU.uL.value[i + 1].set(B.b.x, B.b.z, on ? LIGHT_R : 0);
      // le jour, le brasero chargé fume doucement ; il flambe à la tombée de la nuit
      const lit = on && d > 0.3;
      B.flames.forEach((f, j) => { f.visible = lit; const w = (0.75 + 0.25 * Math.sin(t * (9 + j) + j * 2)) * (0.55 + 0.45 * k); f.scale.set(0.6 * w, 1.3 * w, 1); f.position.y = 1.35 + 0.55 * w; });
      B.light.intensity = lit ? (6 + Math.sin(t * 11 + i) * 0.9 + Math.sin(t * 6.7 + i * 3) * 1.1) * (0.6 + 0.4 * k) * Math.min(1, (d - 0.3) * 2) : 0;
      B.coals.material = on ? coal : iron;
    });
    coal.emissiveIntensity = 0.2 + 1.3 * d;
  }
  return { update, braziers, sunDir, force() { lastD = -1; }, layers(n) { group.children.forEach((m, i) => { m.visible = i >= 3 - n; }); } };
}
