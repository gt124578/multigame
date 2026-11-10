// The Backrooms (Level 5, le Terror Hotel) - L'entité de l'hôtel : un modèle humain rigué (models/jeffrey_epstein_web.glb,
// livré en T-pose, sans animation), animé ici à la main, os par os : bras ramenés le long du corps, marche raide, course
// penchée en avant, au repos un balancement lent, et toujours la tête qui se penche et tressaute.
// Les rotations sont données dans le repère du modèle (x : sa droite, y : le haut, z : là où il regarde) et appliquées
// en espace monde, quel que soit le repère propre à chaque os : pas besoin de connaître les axes du squelette.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

const MODEL = new URL('../models/jeffrey_epstein_web.glb', import.meta.url).href;
const HEIGHT = 2.05; // un peu plus grand qu'un homme : il se baisse presque sous les lustres
let loading = null; // chargé à la première entité de l'hôtel seulement

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);

export function createHotelEntity() {
  const group = new THREE.Group();
  const st = { ready: false, speed: 0, last: null, phase: 0, run: 0, twitch: 0, twitchT: 1, mats: [] };
  const qRoot = new THREE.Quaternion();
  const qw = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  const qr = new THREE.Quaternion();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const axisW = new THREE.Vector3();

  // tourne un os d'un angle autour d'un axe du repère du modèle
  const turn = (bone, axis, angle) => {
    if (!bone || !angle) return;
    axisW.copy(axis).applyQuaternion(qRoot);
    qr.setFromAxisAngle(axisW, angle);
    bone.getWorldQuaternion(qw);
    bone.parent.getWorldQuaternion(qp);
    qw.premultiply(qr);
    bone.quaternion.copy(qp.invert().multiply(qw));
    bone.updateMatrixWorld(true);
  };
  // oriente un os (vers son enfant) dans une direction du repère du modèle
  const aim = (bone, child, dir) => {
    if (!bone || !child) return;
    bone.getWorldPosition(va);
    child.getWorldPosition(vb);
    vb.sub(va).normalize();
    axisW.copy(dir).applyQuaternion(qRoot).normalize();
    qr.setFromUnitVectors(vb, axisW);
    bone.getWorldQuaternion(qw);
    bone.parent.getWorldQuaternion(qp);
    qw.premultiply(qr);
    bone.quaternion.copy(qp.invert().multiply(qw));
    bone.updateMatrixWorld(true);
  };

  const build = (gltf) => {
    const root = gltf.scene;
    // à la bonne taille, les pieds au sol, centré
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const h = box.max.y - box.min.y || 1;
    root.scale.multiplyScalar(HEIGHT / h);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    root.position.y -= box.min.y;
    root.position.x -= (box.min.x + box.max.x) / 2;
    root.position.z -= (box.min.z + box.max.z) / 2;
    // matière mate, éclairée par la lampe torche et un peu par les appliques (comme le reste du décor)
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const old = o.material;
      const m = new THREE.MeshLambertMaterial({ map: old.map || null, color: old.color || '#ffffff', emissive: '#ffffff', emissiveMap: old.map || null, emissiveIntensity: 0 });
      o.material = m;
      st.mats.push(m);
    });
    const B = {};
    root.traverse((o) => {
      if (o.isBone) B[o.name.replace(/_\d+$/, '')] = o;
    });
    st.b = B;
    st.rest = [];
    root.traverse((o) => {
      if (o.isBone) st.rest.push({ o, q: o.quaternion.clone() });
    });
    group.add(root);
    st.root = root;
    st.ready = true;
  };
  if (!loading) loading = new GLTFLoader().loadAsync(MODEL);
  loading.then(build, () => {});

  return {
    group,
    // M : l'entité ; chase : elle poursuit ; light : lumière là où elle est ; dt : durée de l'image ;
    // scare : le screamer (elle se jette sur la caméra, bras tendus, tête secouée)
    update(M, chase, light, dt, time, scare = 0) {
      if (scare) return this.scarePose(light, time);
      if (st.last && dt > 0) {
        const v = Math.hypot(M.x - st.last.x, M.z - st.last.z) / dt;
        st.speed += (Math.min(6, v) - st.speed) * Math.min(1, dt * 6);
      }
      st.last = { x: M.x, z: M.z };
      if (!st.ready) return;
      for (const m of st.mats) m.emissiveIntensity = Math.min(0.35, 0.04 + light * 0.18);
      const B = st.b;
      const moving = st.speed > 0.25;
      st.run += ((st.speed > 2.6 ? 1 : 0) - st.run) * Math.min(1, dt * 5);
      // une foulée : la phase avance avec la distance parcourue
      st.phase += dt * (moving ? 2.4 + st.speed * 1.35 : 0);
      const ph = st.phase;
      const amp = moving ? 0.42 + st.run * 0.35 : 0;

      // repartir de la pose de repos (T-pose), puis construire la pose de cette image
      for (const r of st.rest) r.o.quaternion.copy(r.q);
      st.root.updateMatrixWorld(true);
      group.getWorldQuaternion(qRoot);

      // le buste : penché en avant (beaucoup en courant), un léger roulis à chaque pas ; au repos, il respire
      const lean = 0.08 + st.run * 0.32 + (moving ? 0 : Math.sin(time * 1.1) * 0.02);
      turn(B.spine_1, X, lean * 0.5);
      turn(B.spine_2, X, lean * 0.5);
      turn(B.spine_1, Z, Math.sin(ph) * 0.05 * (moving ? 1 : 0));
      // les bras : le long du corps, un peu en avant, raides ; ils balancent à contretemps des jambes
      for (const [s, side] of [['R', -1], ['L', 1]]) {
        const sw = Math.sin(ph + (s === 'R' ? 0 : Math.PI)) * amp * 0.9;
        aim(B[`upper_arm_${s}`], B[`lower_arm_${s}`], new THREE.Vector3(side * 0.12, -1, 0.08));
        turn(B[`upper_arm_${s}`], X, -sw);
        turn(B[`lower_arm_${s}`], X, -(0.15 + st.run * 0.9 + (moving ? 0 : Math.sin(time * 0.7 + side) * 0.05)));
        aim(B[`hand_${s}`], B[`hand_${s}`] && B[`hand_${s}`].children[0], new THREE.Vector3(side * 0.05, -1, 0.15));
      }
      // les jambes : cuisse vers l'avant et l'arrière, genou qui plie quand la jambe revient
      for (const s of ['R', 'L']) {
        const p = ph + (s === 'R' ? Math.PI : 0);
        turn(B[`upper_leg_${s}`], X, -Math.sin(p) * amp - st.run * 0.1);
        turn(B[`lower_leg_${s}`], X, Math.max(0, Math.cos(p)) * amp * 1.6 + st.run * 0.2);
        turn(B[`foot_${s}`], X, -Math.max(0, -Math.sin(p)) * amp * 0.4);
      }
      // la tête : penchée sur le côté, elle tressaute ; en chasse, plus souvent et plus fort
      st.twitchT -= dt;
      if (st.twitchT <= 0) {
        st.twitch = (Math.random() - 0.5) * (chase ? 1.2 : 0.6);
        st.twitchT = 0.12 + Math.random() * (chase ? 0.5 : 2.4);
      }
      turn(B.neck, X, 0.12 - st.run * 0.2);
      turn(B.head, Z, 0.32 + st.twitch * 0.45);
      turn(B.head, X, -0.08 + Math.sin(time * 1.3) * 0.04);
      // un petit rebond à chaque pas
      st.root.position.y += 0;
      group.position.y = moving ? Math.abs(Math.sin(ph)) * 0.04 * (1 + st.run) : 0;
    },

    // le screamer : penchée sur toi, les deux bras tendus vers ton visage, la tête qui tremble dans tous les sens
    scarePose(light, time) {
      if (!st.ready) return;
      const B = st.b;
      for (const m of st.mats) m.emissiveIntensity = 0.5 + Math.random() * 0.25;
      for (const r of st.rest) r.o.quaternion.copy(r.q);
      st.root.updateMatrixWorld(true);
      group.getWorldQuaternion(qRoot);
      group.position.y = 0;
      turn(B.spine_1, X, 0.18);
      turn(B.spine_2, X, 0.22);
      for (const [s, side] of [['R', -1], ['L', 1]]) {
        aim(B[`upper_arm_${s}`], B[`lower_arm_${s}`], new THREE.Vector3(side * 0.35, 0.3 + Math.sin(time * 40 + side) * 0.05, 1));
        aim(B[`lower_arm_${s}`], B[`hand_${s}`], new THREE.Vector3(-side * 0.15, 0.25, 1));
        aim(B[`hand_${s}`], B[`hand_${s}`] && B[`hand_${s}`].children[0], new THREE.Vector3(-side * 0.3, 0.6, 1));
      }
      const j = 0.35;
      turn(B.neck, X, -0.15 + (Math.random() - 0.5) * j);
      turn(B.head, Z, (Math.random() - 0.5) * j * 2);
      turn(B.head, X, -0.1 + (Math.random() - 0.5) * j);
    },
  };
}
