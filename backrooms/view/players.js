// The Backrooms - Les autres joueurs : des explorateurs en combinaison jaune à capuche, masque à gaz, gants et bottes
// noirs, animés : attente, marche, course, accroupis, assis au poste de garde ; la lampe tenue devant soi.
// Modèle : « Hazmat Suit » de Cj.savage (CC BY 4.0, https://sketchfab.com/3d-models/hazmat-suit-2819a9b345fb44958fc025fb52610526),
// squelette et poids ajoutés par tools/rig-hazmat.mjs (models/hazmat_suit.glb) ; les mouvements sont calculés ici.
// Leur lampe éclaire vraiment devant eux (un projecteur doux qui part de la main), sans cône dessiné dans l'air.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';

const MODEL = new URL('../models/hazmat_suit.glb', import.meta.url).href;
const HEIGHT = 1.78; // taille d'un explorateur, capuche comprise
// le reflet des lampes sur la combinaison (couleur spéculaire) ; en vue subjective, sa propre lampe part de la caméra,
// à quelques centimètres des bras : un reflet bien plus faible
const SHEEN = 0.16;
const SHEEN_FP = 0.004;

// Leurs lampes : six joueurs au plus (hub/games.js). three.js compte toutes les lumières de la scène, même éteintes :
// en ajouter une en cours de partie recompile tous les matériaux éclairés (le jeu se fige une à deux secondes à la
// première image d'une partie à plusieurs, la première fois qu'un coéquipier nous filme). Elles sont donc toutes posées d'avance, éteintes, avant la compilation des matériaux
// (scene.js), et chaque explorateur en prend une.
const LAMPS = 6;

// copie d'un objet animé avec son propre squelette (comme SkeletonUtils.clone)
function cloneSkinned(src) {
  const clone = src.clone(true);
  const map = new Map();
  const walk = (a, b) => {
    map.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
  };
  walk(src, clone);
  clone.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let s = null;
    for (const [a, b] of map) if (b === o) s = a;
    const sk = s.skeleton.clone();
    sk.bones = s.skeleton.bones.map((b) => map.get(b));
    o.bind(sk, s.bindMatrix);
  });
  return clone;
}

let source = null;
let scale = 1;
const loading = new GLTFLoader().loadAsync(MODEL).then((g) => {
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  g.scene.traverse((o) => {
    if (o.isMesh) box.expandByObject(o);
  });
  scale = HEIGHT / (box.max.y - box.min.y || 1);
  source = g;
}, () => {});

// la combinaison : la texture d'origine. Les néons sont cuits dans le décor, pas des lumières : leur éclairage passe par
// l'émissive (même image), modelée comme une lumière qui tombe du plafond (le dessus des épaules et des plis plus clair
// que le dessous, le bas du corps un peu plus sombre) ; sans ça, une teinte plate et sans ombre. Les bottes brunes du
// modèle deviennent noires (le cuir brun, au pied). Rendue des deux côtés (là où la manche touchait le flanc, le tissu
// a été séparé : tools/rig-hazmat.mjs), l'envers du tissu un peu dans l'ombre. Un reflet sous les lampes : vif sur le
// caoutchouc noir des gants et des bottes, doux sur le plastique de la combinaison. La texture (4096) est filtrée de
// biais (anisotrope) : ses propres bras, vus en vue subjective, restent nets
function suitMaterial(map) {
  if (map) map.anisotropy = 16; // (three.js le ramène au maximum de la carte graphique)
  const m = new THREE.MeshPhongMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0, side: THREE.DoubleSide, specular: '#ffffff', shininess: 34 });
  m.specular.setScalar(SHEEN);
  // vu de tout près (vue subjective), le scan montre ses taches d'ombre orange : le tissu y est ramené à moitié vers un
  // jaune uni, ses plis gardés (0 : la texture telle quelle)
  m.userData.flat = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bkFlat = m.userData.flat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRestY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vRestY;
        uniform float bkFlat;
        vec3 bkFlatten(vec3 c) {
          float y = smoothstep(0.08, 0.3, min(c.r, c.g) - c.b) * bkFlat;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          return mix(c, vec3(0.98, 0.74, 0.012) * mix(1.0, clamp(l / 0.74, 0.6, 1.05), 0.35), y);
        }
        vec3 bkRubber(vec3 c, float r) {
          return mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), r * 0.85) * mix(1.0, 0.6, r);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // le caoutchouc (gants, bottes, masque) : les texels sombres, plus noirs, gris neutre (le scan les teintait de
        // brun) et plus brillants que le tissu
        float bkRub = 1.0 - smoothstep(0.035, 0.12, max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b)));
        diffuseColor.rgb = bkRubber(bkFlatten(diffuseColor.rgb), bkRub);
        float bkBoot = 0.0;
        if (vRestY < 0.17) {
          // brun (peu de vert pour le rouge, en linéaire) : le jaune de la combinaison en a bien plus
          float gr = diffuseColor.g / max(diffuseColor.r, 1e-3);
          bkBoot = smoothstep(0.55, 0.42, gr) * (1.0 - smoothstep(0.13, 0.17, vRestY));
          vec3 cuir = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.3, 0.29, 0.28);
          diffuseColor.rgb = mix(diffuseColor.rgb, cuir, bkBoot);
        }
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.6;`,
      )
      .replace(
        '#include <specularmap_fragment>',
        `#include <specularmap_fragment>
        specularStrength = mix(0.3, 1.0, bkRub) * (gl_FrontFacing ? 1.0 : 0.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          totalEmissiveRadiance = emissive * bkRubber(bkFlatten(emissiveColor.rgb), bkRub);
          vec3 bkWN = inverseTransformDirection(normal, viewMatrix);
          float bkSky = 0.22 + 0.78 * clamp(0.5 + 0.5 * bkWN.y, 0.0, 1.0);
          float bkLow = 0.5 + 0.5 * smoothstep(0.0, 1.55, vRestY);
          totalEmissiveRadiance *= bkSky * bkSky * bkLow * (1.0 - bkBoot * 0.85) * (gl_FrontFacing ? 1.0 : 0.45);
        }`,
      );
  };
  return m;
}

// leur lampe : la torche jaune de Poly Haven (small_plastic_torch, CC0), la même que la nôtre
let torchSrc = null;
const torchLoading = new GLTFLoader().loadAsync(new URL('../models/small_plastic_torch.glb', import.meta.url).href).then((g) => {
  const body = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#4a3a10', emissiveIntensity: 0.6 });
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/glass/.test(o.material.name || '')) o.userData.glass = true;
    else {
      body.map = o.material.map;
      o.material = body;
    }
  });
  torchSrc = g.scene;
}, () => {});

function makeTorch(mat) {
  const g = new THREE.Group();
  if (torchSrc) {
    const m = torchSrc.clone(true);
    m.traverse((o) => {
      if (o.isMesh && o.userData.glass) o.material = mat.lens;
    });
    m.rotation.z = -Math.PI / 2;
    g.add(m);
    return g;
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), mat.dark);
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.024, 0.05, 12), mat.dark);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.12;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), mat.lens);
  lens.position.z = 0.146;
  g.add(body, head, lens);
  return g;
}

// ---------------------------------------------------------------- Les mouvements
// Les os tournent dans le repère de leur parent ; au repos ils sont tous alignés sur le modèle (x : la gauche du
// personnage, y : le haut, z : devant). Cuisse ou bras vers l'avant : rotation x négative ; genou : le tibia part vers
// l'arrière (x positif) ; coude : l'avant-bras vers l'avant (x négatif) ; buste penché en avant : x positif.
const BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'HandL', 'UpperArmR', 'LowerArmR', 'HandR', 'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR'];
// les doigts : trois phalanges chacun (os Index1R… Pinky3R), le pouce deux (Thumb1R, Thumb2R) ; au bout, un repère
// (IndexTipR…) qui n'est pas un os
const FING = ['Index', 'Middle', 'Ring', 'Pinky'];
for (const sd of ['L', 'R']) {
  for (const f of FING) BONES.push(f + '1' + sd, f + '2' + sd, f + '3' + sd);
  BONES.push('Thumb1' + sd, 'Thumb2' + sd);
}
const SEAT_Y = 0.43; // assis au poste : hauteur du bassin (le fauteuil du poste)
const ease = (k, want, dt, rate) => k + (want - k) * Math.min(1, dt * rate);

function animate(a, Q, dt, time) {
  const B = a.bones;
  const st = a.anim;
  // la vitesse se mesure sur la position affichée (lissée) : les pieds suivent le sol, ils ne glissent pas
  if (dt > 0) {
    const d = Math.hypot(a.g.position.x - st.px, a.g.position.z - st.pz);
    const v = d / dt < 8 ? d / dt : 0; // un saut de position (étage, rattrapage) n'est pas une course
    st.spd = ease(st.spd, Q.moving ? v : 0, dt, 6);
  }
  st.px = a.g.position.x;
  st.pz = a.g.position.z;
  const sit = Q.desk ? 1 : 0;
  st.run = ease(st.run, Q.running && !sit ? 1 : 0, dt, 5);
  st.cr = ease(st.cr, Q.crouch && !sit ? 1 : 0, dt, 7);
  st.sit = ease(st.sit, sit, dt, 5);
  st.aim = ease(st.aim, Q.flashlight && !sit ? 1 : 0, dt, 6);
  const g = Math.min(1, st.spd / 0.9) * (1 - st.sit); // l'ampleur du pas
  const run = st.run;
  const cr = st.cr;
  const si = st.sit;
  // un cycle = deux pas : 1,45 m en marchant, 2,5 m en courant, plus court accroupi
  const cycle = (1.45 + (2.5 - 1.45) * run) * (1 - 0.4 * cr);
  st.ph += (dt * st.spd * Math.PI * 2) / cycle;
  const ph = st.ph;
  const pitch = Q.pitch || 0;
  const breath = Math.sin(time * 1.7);

  // les jambes (gauche : phase ph, droite : ph + π)
  const legAmp = g * (0.42 + 0.36 * run) * (1 - 0.4 * cr);
  for (const [side, p] of [['L', ph], ['R', ph + Math.PI]]) {
    const sw = Math.sin(p);
    const lift = Math.pow(Math.max(0, Math.cos(p)), 1.5); // la jambe qui revient vers l'avant plie le genou
    let thigh = -legAmp * sw;
    let knee = g * (0.08 + 0.27 * run + (0.75 + 0.6 * run) * lift);
    // accroupi, puis assis : cuisses vers l'avant, genoux pliés
    thigh += -1.15 * cr - 1.5 * si;
    knee += 2.0 * cr + 1.38 * si;
    let foot = -(thigh + knee) * 0.75 * (1 - si) + 0.3 * g * Math.max(0, -sw) * (1 - cr) - 0.1 * si;
    B['UpperLeg' + side].rotation.set(thigh, 0, (side === 'L' ? 0.03 : -0.03) * (1 + si * 2));
    B['LowerLeg' + side].rotation.set(knee, 0, 0);
    B['Foot' + side].rotation.set(foot, 0, 0);
  }
  // le bassin : il descend entre deux pas, tourne un peu avec les jambes ; accroupi ou assis, il descend
  const bob = g * (0.022 + 0.03 * run) * Math.sin(ph) * Math.sin(ph);
  B.Hips.position.set(st.hip.x, st.hip.y - bob - 0.25 * cr - (st.hip.y - SEAT_Y) * si, st.hip.z - 0.06 * cr - 0.04 * si);
  B.Hips.rotation.set(0, -0.07 * g * Math.sin(ph), 0.03 * g * Math.cos(ph));
  // le buste : penché en courant, accroupi, assis devant les écrans ; il respire
  const lean = 0.05 * g + 0.2 * run + 0.38 * cr + 0.12 * si;
  B.Spine.rotation.set(lean * 0.6, 0.05 * g * Math.sin(ph), 0);
  B.Chest.rotation.set(lean * 0.4 + 0.012 * breath, 0.06 * g * Math.sin(ph), 0);
  // la tête suit le regard, bien visible : vers le haut ou le bas (x négatif : vers le haut ; le buste s'y met un peu
  // pour les grands angles), et de côté jusqu'à 70° quand le corps ne s'est pas encore tourné (st.look, update). Les
  // coéquipiers voient où chacun regarde. Elle se redresse quand le buste penche
  const look = st.look;
  B.Chest.rotation.x -= pitch * 0.12;
  B.Chest.rotation.y += look * 0.15;
  B.Neck.rotation.set(-lean * 0.35 - pitch * 0.33, look * 0.35, 0);
  B.Head.rotation.set(-lean * 0.45 - pitch * 0.55, look * 0.5, 0);
  // les bras : ils balancent à l'opposé des jambes, coudes pliés en courant ; assis, les mains sur le bureau
  const armAmp = g * (0.3 + 0.35 * run);
  for (const [side, p, sd] of [['L', ph, 1], ['R', ph + Math.PI, -1]]) {
    let up = armAmp * Math.sin(p) - 0.15 * cr - 0.55 * si;
    let fore = -(0.18 + 0.12 * g + 1.15 * run + 0.35 * cr + 0.85 * si);
    let out = sd * (0.07 + 0.06 * run + 0.1 * cr + 0.06 * si + 0.01 * breath);
    if (side === 'R' && st.aim > 0) {
      // la lampe tenue devant soi : l'avant-bras pointe où il regarde (bras + coude + buste = -π/2 - regard)
      const k = st.aim;
      const upA = -0.62 - pitch * 0.55;
      const foreA = -Math.PI / 2 - pitch - upA - lean;
      up += (upA - up) * k;
      fore += (foreA - fore) * k;
      out += (-0.16 - out) * k;
    }
    B['UpperArm' + side].rotation.set(up, 0, out);
    B['LowerArm' + side].rotation.set(fore, 0, 0);
    B['Hand' + side].rotation.set(-0.1 * run, 0, 0);
  }
}

// ---------------------------------------------------------------- Les mains
// Ce qu'une main serre : r, le rayon de l'objet sous les doigts (m) ; tilt, son biais dans le poing (0 : en travers de
// la paume ; une lampe se tient en diagonale, la tête qui sort entre le pouce et l'index, vers le bout des doigts) ;
// thumb : où le pouce se pose, le long de l'objet vers sa tête (m) ; wrap : le pouce fait le tour de l'objet (une
// bouteille, trop grosse pour qu'il se couche dessus), ses deux phalanges collées à la paroi, en face des doigts
const HOLD = {
  torch: { r: 0.021, tilt: 0.75, thumb: 0.035 },
  bottle: { r: 0.043, tilt: 0.05, thumb: 0.012, wrap: true },
  battery: { r: 0.017, tilt: 0.3, thumb: 0.015 },
};
// Pour chaque main et chaque objet, calculé une fois sur le modèle au repos (repère de l'os Hand) : l'axe de l'objet
// posé contre la paume, juste au-dessus des jointures (C, A ; B = x × A), l'angle de chaque phalange (chaque doigt se
// replie jusqu'à toucher l'objet), la rotation du pouce (couché sur l'objet, vers sa tête). « none » : main détendue
let GRIPS = null;
function solveGrips(root) {
  const V = THREE.Vector3;
  const Z = new V(0, 0, 1);
  const w0 = new V();
  const dw = new V();
  // distance d'un segment [s, e] à l'axe de l'objet (passe par c, sens a)
  const segDist = (s, e, c, a) => {
    w0.copy(s).sub(c);
    w0.addScaledVector(a, -w0.dot(a));
    dw.copy(e).sub(s);
    dw.addScaledVector(a, -dw.dot(a));
    const dd = dw.lengthSq();
    const u = dd > 1e-12 ? Math.min(1, Math.max(0, -w0.dot(dw) / dd)) : 0;
    return w0.addScaledVector(dw, u).length();
  };
  const out = {};
  for (const sd of ['L', 'R']) {
    const sg = sd === 'R' ? 1 : -1; // la paume regarde +x (main droite), -x (gauche) ; les doigts se replient vers elle
    const get = (n) => root.getObjectByName(n + sd);
    const ex = get('Hand').userData || {};
    const palm = ex.palm ?? sg * 0.04;
    const thick = ex.thick ?? 0.036;
    const F = FING.map((f) => {
      const M = get(f + '1').position.clone();
      const P = M.clone().add(get(f + '2').position);
      const D = P.clone().add(get(f + '3').position);
      return [M, P, D, D.clone().add(get(f + 'Tip').position)];
    });
    const mY = F.reduce((t, f) => t + f[0].y, 0) / 4;
    const mZ = F.reduce((t, f) => t + f[0].z, 0) / 4;
    const T0 = get('Thumb1').position.clone();
    const T2 = T0.clone().add(get('Thumb2').position).add(get('ThumbTip').position);
    const d1 = get('Thumb2').position.clone(); // la première phalange du pouce, au repos (repère de la main)
    const L1 = d1.length();
    d1.divideScalar(L1);
    const d2 = get('ThumbTip').position.clone(); // la seconde
    const L2 = d2.length();
    d2.divideScalar(L2);
    const res = {};
    for (const kind in HOLD) {
      const { r, tilt, thumb } = HOLD[kind];
      const A = new V(0, -Math.sin(tilt), Math.cos(tilt));
      const C = new V(palm + sg * (r + 0.004), mY + 0.012, mZ);
      const ang = F.map((pts) => {
        const a = [];
        let phi = 0;
        const S = pts[0].clone();
        const E = new V();
        for (let j = 0; j < 3; j++) {
          const v = pts[j + 1].clone().sub(pts[j]);
          const lim = [1.6, 1.9, 1.4][j];
          const need = r + thick * (j === 2 ? 0.42 : 0.5);
          let th = 0;
          for (; th < lim; th += 0.02) {
            E.copy(v).applyAxisAngle(Z, sg * (phi + th)).add(S);
            if (segDist(S, E, C, A) <= need) break;
          }
          th = Math.min(th, lim);
          a.push(th);
          phi += th;
          S.add(v.applyAxisAngle(Z, sg * phi));
        }
        return a;
      });
      // le pouce : de sa base au-dessus de l'objet (côté poignet), le bout posé dessus, vers la tête
      const N = new V(0, Math.cos(tilt), Math.sin(tilt));
      let qT, qT2 = new THREE.Quaternion();
      if (HOLD[kind].wrap) {
        // autour d'une bouteille : la jointure (J) puis le bout (K) sur le cercle que suit l'axe du pouce, de plus en
        // plus loin de la paume, en descendant un peu vers `thumb`. U : vers la paume, V : vers le poignet
        const R = r + thick * 0.45;
        const U = new V(-sg, 0, 0);
        const W = N.clone().addScaledVector(A, -N.dot(A)).normalize();
        const at = (phi, z) => C.clone().addScaledVector(A, z).addScaledVector(U, R * Math.cos(phi)).addScaledVector(W, R * Math.sin(phi));
        const b = T0.clone().sub(C);
        const z0 = b.dot(A);
        let phi = Math.atan2(b.dot(W), b.dot(U));
        // le premier point du cercle à `len` de `from`, en tournant dans le sens du pouce
        const walk = (from, len, z) => {
          let p = at(phi, z);
          for (let i = 0; i < 400 && p.distanceTo(from) < len; i++) p = at((phi += 0.01), z);
          return p;
        };
        const J = walk(T0, L1, z0 + (thumb - z0) * 0.6);
        const K = walk(J, L2, thumb);
        qT = new THREE.Quaternion().setFromUnitVectors(d1, J.sub(T0).normalize());
        // la seconde phalange, dans le repère de la première
        const w = K.sub(T0.clone().addScaledVector(J, L1)).normalize().applyQuaternion(qT.clone().invert());
        qT2 = new THREE.Quaternion().setFromUnitVectors(d2, w);
      } else {
        const tgt = C.clone().addScaledVector(A, thumb).addScaledVector(N, r + thick * 0.45);
        qT = new THREE.Quaternion().setFromUnitVectors(T2.clone().sub(T0).normalize(), tgt.sub(T0).normalize());
      }
      res[kind] = { ang, qT, qT2, C, A, B: new V(1, 0, 0).cross(A) };
    }
    res.none = { ang: F.map(() => [0.12, 0.2, 0.12]), qT: new THREE.Quaternion(), qT2: new THREE.Quaternion(), C: null, A: null, B: null };
    out[sd] = res;
  }
  return out;
}

export function createPlayerAvatars(scene, lamps = LAMPS) {
  const avatars = new Map();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const qView = new THREE.Quaternion();
  const qAim = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  // la lampe levée d'un coéquipier : où il la tient, dans les axes de son regard (droite, haut, arrière)
  const AIM_AT = new THREE.Vector3(0.17, -0.2, -0.42);
  const qG = new THREE.Quaternion();
  const eView = new THREE.Euler();
  // la lampe : un vrai projecteur à bord doux. Il reste dans la scène même caché (sa puissance tombe à 0) : le nombre
  // de lumières ne change pas, les matériaux ne se recompilent pas
  const newLamp = () => {
    const light = new THREE.SpotLight('#fff1d0', 0, 20, Math.PI / 7.5, 0.8, 1.6);
    light.target = new THREE.Object3D();
    scene.add(light, light.target);
    return light;
  };
  const spare = []; // les lampes libres
  for (let i = 0; i < lamps; i++) spare.push(newLamp());
  // une sphère qui contient le corps dans toutes ses poses : les explorateurs hors du champ ne sont pas dessinés
  const bounds = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);

  const build = (a) => {
    const mat = a.mat || {
      suit: null,
      dark: new THREE.MeshLambertMaterial({ color: '#141414', emissive: '#303030', emissiveIntensity: 0 }),
      lens: new THREE.MeshBasicMaterial({ color: '#2a2620' }),
    };
    a.mat = mat;
    const body = new THREE.Group();
    body.rotation.y = Math.PI; // le modèle regarde +z, le joueur -z
    a.g.add(body);
    if (source) {
      const root = cloneSkinned(source.scene);
      root.scale.setScalar(scale);
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (!mat.suit) mat.suit = suitMaterial(o.material.map);
        o.material = mat.suit;
        o.boundingSphere = bounds;
      });
      body.add(root);
      a.root = root;
      a.bones = {};
      for (const n of BONES) a.bones[n] = root.getObjectByName(n);
      // la tête et le cou : d'abord tournés de côté, puis levés ou baissés (dans ce repère tourné)
      a.bones.Neck.rotation.order = 'YXZ';
      a.bones.Head.rotation.order = 'YXZ';
      // le sens de chaque os de bras, de son articulation à la suivante (pour les mains qui vont chercher un objet)
      a.along = {};
      for (const sd of ['L', 'R']) {
        a.along['UpperArm' + sd] = a.bones['LowerArm' + sd].position.clone().normalize();
        a.along['LowerArm' + sd] = a.bones['Hand' + sd].position.clone().normalize();
        a.along['Hand' + sd] = a.bones['Middle1' + sd].position.clone().normalize();
      }
      const hip = a.bones.Hips.position;
      a.anim = { ph: 0, spd: 0, run: 0, cr: 0, sit: 0, aim: 0, look: 0, px: 0, pz: 0, hip: { x: hip.x, y: hip.y, z: hip.z } };
      if (!GRIPS) GRIPS = solveGrips(source.scene);
      // les doigts de chaque main (ils vont doucement vers la prise voulue)
      a.hp = {};
      for (const sd of ['L', 'R']) a.hp[sd] = { ang: FING.map(() => [0.12, 0.2, 0.12]), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
      // la lampe, serrée dans le poing droit : son axe sur celui de la prise (la tête vers le pouce), l'interrupteur
      // sous le pouce, tenue un peu avant son milieu
      const G = GRIPS.R.torch;
      a.mount = new THREE.Object3D();
      a.mount.position.copy(G.C);
      a.mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(G.B.clone().negate(), new THREE.Vector3().crossVectors(G.A, G.B.clone().negate()), G.A));
      a.bones.HandR.add(a.mount);
    } else {
      // le modèle n'est pas encore là : une silhouette en combinaison
      if (!mat.suit) mat.suit = new THREE.MeshLambertMaterial({ color: '#d9a91a', emissive: '#d9a91a', emissiveIntensity: 0 });
      const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), mat.suit);
      capsule.position.y = 0.85;
      body.add(capsule);
    }
    a.torch = makeTorch(mat);
    (a.mount || a.g).add(a.torch);
    // le voyant rouge du caméscope, à hauteur du visage, quand il filme (V)
    a.rec = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }));
    a.rec.position.set(-0.12, 1.62, -0.3);
    a.rec.visible = false;
    a.g.add(a.rec);
  };

  const get = (P) => {
    let a = avatars.get(P.id);
    if (!a) {
      a = { g: new THREE.Group() };
      scene.add(a.g);
      build(a);
      avatars.set(P.id, a);
      if (!torchSrc) torchLoading.then(() => {
        // la torche vient d'arriver : on la met dans sa main
        if (!torchSrc || !a.torch) return;
        a.torch.removeFromParent();
        a.torch = makeTorch(a.mat);
        (a.mount || a.g).add(a.torch);
      });
      if (!source) loading.then(() => {
        // le modèle vient d'arriver : on refait l'explorateur (sa silhouette d'attente avait son propre matériau)
        if (!source || a.root) return;
        a.g.clear();
        a.mat.suit = null;
        build(a);
      });
    }
    // sa lampe : une de celles posées d'avance (une nouvelle seulement si toutes sont prises : les matériaux se
    // recompilent alors, mais il a bien sa lampe)
    if (!a.light) a.light = spare.pop() || newLamp();
    return a;
  };

  const qP = new THREE.Quaternion();
  const qC = new THREE.Quaternion();
  const vDown = new THREE.Vector3(0, -1, 0);
  const hinge = new THREE.Vector3();
  const vTp = new THREE.Vector3();
  const vC = new THREE.Vector3();
  // un os tourné vers un repère monde (x, y, z) : son -y y suit son sens réel (vers l'articulation suivante)
  const setBasis = (b, along, x, y, z) => {
    qW.setFromRotationMatrix(mB.makeBasis(x, y, z));
    qC.setFromUnitVectors(vDown, along).invert();
    b.parent.getWorldQuaternion(qP);
    b.quaternion.copy(qP.invert().multiply(qW).multiply(qC));
    b.updateMatrixWorld(true);
  };
  // le bras (épaule, coude) jusqu'au poignet voulu, dans le plan qui tourne le coude vers `pole` ; renvoie le poignet
  // atteint (au bout des deux os s'il est trop loin)
  const vS = new THREE.Vector3();
  const vE = new THREE.Vector3();
  const vW = new THREE.Vector3();
  const vT = new THREE.Vector3();
  const vN = new THREE.Vector3();
  const vP = new THREE.Vector3();
  const reach = (a, sd, wrist, pole, thumb = null) => {
    const up = a.bones['UpperArm' + sd];
    const lo = a.bones['LowerArm' + sd];
    up.getWorldPosition(vS);
    lo.getWorldPosition(vE);
    a.bones['Hand' + sd].getWorldPosition(vW);
    const l1 = vS.distanceTo(vE);
    const l2 = vE.distanceTo(vW);
    vN.copy(wrist).sub(vS);
    const d = Math.min((l1 + l2) * 0.995, Math.max(Math.abs(l1 - l2) + 0.01, vN.length()));
    vN.normalize();
    vT.copy(vS).addScaledVector(vN, d);
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    vP.copy(pole).addScaledVector(vN, -pole.dot(vN)).normalize();
    vE.copy(vS).addScaledVector(vN, l1 * cosA).addScaledVector(vP, l1 * Math.sqrt(1 - cosA * cosA));
    // le coude plie comme une charnière (autour de l'axe x de l'os, l'avant-bras vers son +z) : le bras ne vrille pas
    vY.copy(vE).sub(vS).normalize().negate();
    vZ.copy(vT).sub(vE);
    vZ.addScaledVector(vY, -vZ.dot(vY));
    if (vZ.lengthSq() < 1e-8) vZ.copy(vP).negate();
    vZ.normalize();
    vXb.crossVectors(vY, vZ);
    setBasis(up, a.along['UpperArm' + sd], vXb, vY, vZ);
    hinge.copy(vXb);
    vY.copy(vT).sub(vE).normalize().negate();
    vXb.copy(hinge).addScaledVector(vY, -hinge.dot(vY)).normalize();
    vZ.crossVectors(vXb, vY);
    // l'avant-bras tourne sur lui-même vers le pouce voulu (la moitié du chemin : l'autre moitié au poignet)
    if (thumb) {
      vTp.copy(thumb).addScaledVector(vY, -thumb.dot(vY));
      if (vTp.lengthSq() > 1e-6) {
        vTp.normalize();
        const phi = Math.atan2(vC.crossVectors(vZ, vTp).dot(vY), vZ.dot(vTp)) * 0.5;
        vZ.applyAxisAngle(vY, phi);
        vXb.applyAxisAngle(vY, phi);
      }
    }
    setBasis(lo, a.along['LowerArm' + sd], vXb, vY, vZ);
    return vT;
  };
  const vF = new THREE.Vector3();
  const vR = new THREE.Vector3();
  const vO = new THREE.Vector3();
  const vH = new THREE.Vector3();
  const vX = new THREE.Vector3();
  const vCu = new THREE.Vector3();
  const vTh = new THREE.Vector3();
  const vY = new THREE.Vector3();
  const vZ = new THREE.Vector3();
  const vXb = new THREE.Vector3();
  const mB = new THREE.Matrix4();
  const qW = new THREE.Quaternion();
  const EYE = new THREE.Vector3(0, 0.12, 0.11); // les yeux, depuis l'articulation de la tête (repère du modèle)
  // Les doigts vont doucement vers la prise de `kind` (lampe, bouteille, piles ; null : main détendue)
  const poseHand = (a, sd, kind, dt) => {
    const G = GRIPS[sd][kind || 'none'];
    const h = a.hp[sd];
    const k = Math.min(1, dt * 14);
    const sg = sd === 'R' ? 1 : -1;
    FING.forEach((f, i) => {
      for (let j = 0; j < 3; j++) {
        h.ang[i][j] += (G.ang[i][j] - h.ang[i][j]) * k;
        a.bones[f + (j + 1) + sd].rotation.set(0, 0, sg * h.ang[i][j]);
      }
    });
    h.q.slerp(G.qT, k);
    h.q2.slerp(G.qT2, k);
    a.bones['Thumb1' + sd].quaternion.copy(h.q);
    a.bones['Thumb2' + sd].quaternion.copy(h.q2);
  };
  // un os tourné vers une orientation monde
  const setWorldQuat = (b, q) => {
    b.parent.getWorldQuaternion(qP);
    b.quaternion.copy(qP.invert().multiply(q));
    b.updateMatrixWorld(true);
  };
  // La main `sd` qui tient l'objet `kind` : son axe (le côté de la tête) sur `axis`, le point serré sur `pos` (monde),
  // la paume tournée vers `palm` ; le bras va la chercher (coude vers `pole`). Renvoie le point serré atteint (le bras
  // peut être trop court), dans `out`
  const mH = new THREE.Matrix4();
  const mL = new THREE.Matrix4();
  const qH = new THREE.Quaternion();
  const vA = new THREE.Vector3();
  const vBw = new THREE.Vector3();
  const vXw = new THREE.Vector3();
  const vWr = new THREE.Vector3();
  const X1 = new THREE.Vector3(1, 0, 0);
  const holdAt = (a, sd, kind, pos, axis, palm, pole, out) => {
    const G = GRIPS[sd][kind];
    const sg = sd === 'R' ? 1 : -1;
    vA.copy(axis).normalize();
    vXw.copy(palm).multiplyScalar(sg);
    vXw.addScaledVector(vA, -vXw.dot(vA)).normalize();
    vBw.crossVectors(vXw, vA);
    mH.makeBasis(vA, vBw, vXw);
    mL.makeBasis(G.A, G.B, X1).transpose();
    qH.setFromRotationMatrix(mH.multiply(mL));
    a.g.getWorldQuaternion(qG);
    const hand = a.bones['Hand' + sd];
    // le pouce de la main (pour la vrille de l'avant-bras) : le +z de l'os
    vTh.set(0, 0, 1).applyQuaternion(qH);
    // le poignet : le point serré, moins le creux de la main tourné comme elle (le bras peut ne pas y arriver)
    vWr.copy(G.C).multiplyScalar(scale).applyQuaternion(qH);
    vWr.subVectors(pos, vWr);
    reach(a, sd, vWr, pole, vTh);
    setWorldQuat(hand, qH);
    hand.getWorldPosition(out);
    return out.add(vWr.copy(G.C).multiplyScalar(scale).applyQuaternion(qH));
  };
  // où la paume regarde, dans les axes de la caméra (droite, haut, arrière) pour la main droite ; la gauche en miroir.
  // La lampe : paume vers le bas et le dedans (le dos de la main en haut, vu de dessus) ; la bouteille : debout dans le
  // poing, paume vers le dedans, pouce en haut ; les piles : dans le creux de la main, paume vers le haut
  const PALM = { torch: [-0.75, -0.6, 0.1], bottle: [-0.95, 0.05, 0.25], battery: [-0.3, 0.85, 0.3] };
  const vPalm = new THREE.Vector3();
  const palmDir = (sd, kind, out) => {
    const p = PALM[kind];
    return out.set(0, 0, 0).addScaledVector(vR, p[0] * (sd === 'R' ? 1 : -1)).addScaledVector(vCu, p[1]).addScaledVector(vF, -p[2]);
  };
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

  // place, anime et éclaire un explorateur ; fp : la vue subjective (voir firstPerson)
  const place = (a, Q, y, light, dt, time, fp) => {
    // revenu après une vraie absence (pas un masquage le temps d'une autre prise de vue, dans la même image)
    const fresh = !(a.seenAt > time - 0.4);
    a.seenAt = time;
    a.g.visible = true;
    a.g.position.set(Q.x, y, Q.z);
    // le corps et le regard : en marchant (ou lampe levée), le corps suit le regard ; à l'arrêt, la tête tourne seule
    // jusqu'à 70°, puis le corps rattrape. En vue subjective, le corps est toujours dans l'axe
    if (fresh || a.yawB === undefined || fp) a.yawB = Q.yaw;
    else {
      const dy = wrap(Q.yaw - a.yawB);
      const free = 1.2;
      if ((a.anim && a.anim.spd > 0.3) || Q.flashlight) a.yawB += dy * Math.min(1, dt * 6);
      else if (Math.abs(dy) > free) a.yawB += (dy - Math.sign(dy) * free) * Math.min(1, dt * 10);
    }
    const look = wrap(Q.yaw - a.yawB);
    a.g.rotation.set(0, a.yawB, 0);
    a.g.rotateZ(-(Q.tilt || 0) * 0.6);
    // la combinaison prend la lumière des néons d'où il est (les néons sont cuits dans le décor, pas des lumières)
    const k = Math.min(1.5, 0.05 + light * 0.95);
    // en vue subjective, sa propre lampe part de la caméra, à quelques centimètres des bras : elle les brûlerait. Le
    // corps ne prend alors que la lumière d'où il est, plus une lueur de sa lampe allumée. Vu par les autres, sous une
    // lampe : le jaune du scan, très clair, est un peu atténué (sinon, à deux mètres d'une lampe, il brillait comme un néon)
    a.mat.suit.color.setScalar(fp ? 0.04 : 0.62);
    if (a.mat.suit.specular) a.mat.suit.specular.setScalar(fp ? SHEEN_FP : SHEEN);
    if (a.mat.suit.userData.flat) a.mat.suit.userData.flat.value = fp ? 0.55 : 0;
    a.mat.suit.emissiveIntensity = fp ? k * 0.9 + (Q.flashlight ? 0.3 : 0) : k;
    a.mat.dark.emissiveIntensity = k;
    if (a.bones) {
      // revenu dans le champ après une absence : pas d'élan pris sur le saut de position
      if (fresh) {
        a.anim.px = Q.x;
        a.anim.pz = Q.z;
      }
      a.anim.look = ease(a.anim.look, Math.max(-1.25, Math.min(1.25, look)), dt, 12);
      animate(a, Q, dt, time);
      a.bones.Head.scale.setScalar(1);
      // les doigts : la lampe dans la main droite ; à gauche, en vue subjective, l'objet de la case choisie
      poseHand(a, 'R', Q.hasLamp ? 'torch' : null, dt);
      poseHand(a, 'L', fp && fp.grips.L ? fp.grips.L.kind : null, dt);
    }
    a.g.updateMatrixWorld(true);
    a.reached = null;
    if (fp && a.bones) {
      // la caméra à la place des yeux : le corps glisse sous elle (de côté et en hauteur : accroupi, la caméra descend
      // plus bas que la tête de l'explorateur) ; puis la tête disparaît (la caméra est dedans)
      vH.copy(EYE).divideScalar(scale);
      a.bones.Head.localToWorld(vH);
      vO.copy(fp.cam.position).sub(vH);
      a.g.position.add(vO);
      a.bones.Head.scale.setScalar(1e-3);
      a.g.updateMatrixWorld(true);
      // les axes de la caméra, et les mains qui vont serrer ce qu'elles tiennent : la lampe en diagonale dans le poing
      // droit (la tête vers l'avant, le dos de la main vers le dehors), l'objet de gauche tenu droit, pouce en haut
      mB.makeRotationFromQuaternion(fp.frame);
      mB.extractBasis(vR, vCu, vF);
      vF.negate();
      a.reached = a.reached0 || (a.reached0 = { R: new THREE.Vector3(), L: new THREE.Vector3() });
      const got = { R: null, L: null };
      for (const sd of ['R', 'L']) {
        const want = fp.grips[sd];
        if (!want) continue;
        // le coude : écarté du corps, un peu bas et en arrière (les bras ne mangent pas l'écran)
        vX.copy(vR).multiplyScalar(sd === 'R' ? 0.7 : -0.7).addScaledVector(vCu, -0.6).addScaledVector(vF, -0.35);
        got[sd] = holdAt(a, sd, want.kind, want.pos, want.axis, palmDir(sd, want.kind, vPalm), vX, a.reached[sd]);
      }
      a.reached = got;
    }
    // la lampe des autres, serrée dans le poing droit ; allumée, le bras la lève et la pointe où il regarde (le bras va
    // la chercher devant la poitrine, comme en vue subjective) ; le faisceau part d'elle
    const pitch = Q.pitch || 0;
    if (!fp && a.bones && Q.hasLamp && a.anim.aim > 0.01) {
      const B = a.bones;
      // la pose animée (bras qui balance), pour le fondu
      qAim[0].copy(B.UpperArmR.quaternion);
      qAim[1].copy(B.LowerArmR.quaternion);
      qAim[2].copy(B.HandR.quaternion);
      // les yeux et le regard : la caméra qu'il aurait en vue subjective
      vH.copy(EYE).divideScalar(scale);
      B.Head.localToWorld(vH);
      qView.setFromEuler(eView.set(pitch > -0.35 ? pitch * (pitch > 0 ? 0.85 : 1) : -0.35 + (pitch + 0.35) * 0.3, Q.yaw, 0, 'YXZ'));
      mB.makeRotationFromQuaternion(qView);
      mB.extractBasis(vR, vCu, vF);
      vF.negate();
      tmp.copy(AIM_AT).applyQuaternion(qView).add(vH);
      dir.copy(vF).addScaledVector(vCu, pitch * 0.15);
      vX.copy(vR).multiplyScalar(0.7).addScaledVector(vCu, -0.6).addScaledVector(vF, -0.35);
      holdAt(a, 'R', 'torch', tmp, dir, palmDir('R', 'torch', vPalm), vX, vO);
      const k = a.anim.aim;
      if (k < 0.999) {
        B.UpperArmR.quaternion.slerpQuaternions(qAim[0], B.UpperArmR.quaternion.clone(), k);
        B.LowerArmR.quaternion.slerpQuaternions(qAim[1], B.LowerArmR.quaternion.clone(), k);
        B.HandR.quaternion.slerpQuaternions(qAim[2], B.HandR.quaternion.clone(), k);
      }
    }
    // en vue subjective, la lampe à l'écran est celle de la caméra (scene.js), posée dans cette main
    a.torch.visible = !fp && !!Q.hasLamp;
    a.g.updateMatrixWorld(true);
    a.torch.getWorldPosition(a.light.position);
    a.torch.getWorldDirection(dir);
    a.light.target.position.copy(a.light.position).addScaledVector(dir, 6);
    a.light.target.updateMatrixWorld();
    a.light.intensity = Q.flashlight && !fp ? 14 : 0;
    if (a.rec) a.rec.visible = !fp && !!Q.cam && (performance.now() % 1200) < 700;
    a.mat.lens.color.setHex(Q.flashlight ? 0xfff6dc : 0x2a2620); // en nombre : pas de texte à relire à chaque image
  };

  return {
    has: (id) => avatars.has(id),
    // cache (ou remontre) le corps d'un joueur le temps d'une prise de vue depuis sa tête ; renvoie l'état d'avant
    setShown(id, v) {
      const a = avatars.get(id);
      if (!a) return false;
      const was = a.g.visible;
      a.g.visible = v;
      return was;
    },
    // Q : le joueur ; y : hauteur des pieds ; light : lumière des néons là où il est ; dt : durée de l'image
    update(Q, show, y, light, dt, time = performance.now() / 1000) {
      if (!show) {
        const a = avatars.get(Q.id);
        if (a) {
          a.g.visible = false;
          if (a.light) a.light.intensity = 0;
        }
        return;
      }
      place(get(Q), Q, y, light, dt, time, null);
    },
    // Vue subjective : son propre corps, sans la tête, sous la caméra (regard vers le bas : le buste, les bras, les
    // jambes, les pieds). cam : la caméra (sa place) ; frame : le repère des mains (le regard, adouci vers le bas) ;
    // grips : où l'on voudrait les mains, en monde
    // ({ R, L } : la lampe, l'objet de la case choisie ; null : main libre). Les bras vont les chercher (aussi loin
    // qu'ils portent) ; renvoie où chaque main est arrivée (le creux de la main), ou null tant que le modèle manque.
    // Sa lampe à lui reste éteinte : c'est celle de la caméra qui éclaire.
    firstPerson(Q, y, light, dt, time, cam, frame, grips) {
      const a = get(Q);
      if (!a.bones) return null;
      place(a, Q, y, light, dt, time, { cam, frame, grips });
      return a.reached;
    },
    // ceux qui ne sont plus dans la partie (partis, déconnectés) : sinon ils restent figés sur place, lampe allumée.
    // Ils se cachent et leur lampe retourne dans la réserve
    hideGone(players) {
      avatars.forEach((a, id) => {
        if (!a.light) return;
        for (let i = 0; i < players.length; i++) if (players[i].id === id) return;
        a.g.visible = false;
        a.light.intensity = 0;
        spare.push(a.light);
        a.light = null;
      });
    },
  };
}
