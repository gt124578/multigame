// Birdie Party — arbres et herbes hautes. Feuillus : un tronc d'écorce et une trentaine de « cartes » de feuillage
// (grappes de feuilles transparentes) réparties dans une boule ; sapins : des étages de branches inclinées.
// Les normales du feuillage pointent hors de la couronne, pour une lumière douce et ronde. Tout est en instances :
// les arbres du parcours (qui arrêtent la balle, venus du moteur) et une forêt dense sur les collines au loin.
// (l'herbe en 3D est dans grass.js)
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { makeRng } from '../engine/rng.js';
import { leafTexture, needleTexture, barkTexture, frondTexture, palmBarkTexture, shadeTexture, cactusTexture } from './textures.js';
import { mergeGeometries } from '../../shared/vendor/three/BufferGeometryUtils.js';

// temps et vent partagés par tous les feuillages (le feuillage se balance)
export const SWAY = { uT: { value: 0 }, uWind: { value: 0.3 } };

// ------------------------------------------------------------------ fabrication des géométries (arbre de taille 1)
function builder() {
  const pos = [], nor = [], uv = [], idx = [], col = [];
  return {
    // carte rectangulaire : centre c, demi-axes u et v, normale n (pour l'éclairage), ao : ombre interne (0 → 1)
    card(c, u, v, n, ao = 1) {
      const b = pos.length / 3;
      for (const [su, sv, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
        pos.push(c.x + u.x * su + v.x * sv, c.y + u.y * su + v.y * sv, c.z + u.z * su + v.z * sv);
        nor.push(n.x, n.y, n.z); uv.push(tu, tv); col.push(ao, ao, ao);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    // branche de sapin : la tige part de `root` vers `tip`, la largeur s'étale de part et d'autre
    branch(root, tip, side, n, ao = 1) {
      const b = pos.length / 3;
      for (const [p, s, tu, tv, a] of [[root, -1, 0, 0, ao * 0.6], [tip, -1, 1, 0, ao], [tip, 1, 1, 1, ao], [root, 1, 0, 1, ao * 0.6]]) {
        pos.push(p.x + side.x * s, p.y + side.y * s, p.z + side.z * s);
        nor.push(n.x, n.y, n.z); uv.push(tu, tv); col.push(a, a, a);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
  };
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// feuillu : couronne ellipsoïdale (rx, ry) centrée à cy ; cards = nombre de grappes
function broadleafGeo(seed, { rx = 3.3, ry = 2.9, cy = 5.6, cards = 95, size = 1.55 } = {}) {
  const r = makeRng(seed), b = builder(), up = V3(0, 1, 0);
  for (let i = 0; i < cards; i++) {
    // direction au hasard, un peu plus vers le haut ; surtout près de la surface de la couronne
    const d = V3(r.range(-1, 1), r.range(-0.6, 1), r.range(-1, 1)).normalize();
    const k = i < cards * 0.2 ? r.range(0.15, 0.5) : r.range(0.6, 1.0);
    const c = V3(d.x * rx * k, cy + d.y * ry * k, d.z * rx * k);
    // la carte regarde à peu près vers l'extérieur, tournée au hasard autour de cette direction
    const nrm = d.clone().add(V3(r.range(-0.6, 0.6), r.range(-0.4, 0.6), r.range(-0.6, 0.6))).normalize();
    const t1 = Math.abs(nrm.y) > 0.9 ? V3(1, 0, 0) : up.clone();
    const u = V3().crossVectors(nrm, t1).normalize(), v = V3().crossVectors(nrm, u).normalize();
    const a = r.range(0, Math.PI), ca = Math.cos(a), sa = Math.sin(a);
    const s = size * r.range(0.8, 1.25);
    const uu = u.clone().multiplyScalar(ca).addScaledVector(v, sa).multiplyScalar(s), vv = v.clone().multiplyScalar(ca).addScaledVector(u, -sa).multiplyScalar(s);
    const light = d.clone().multiplyScalar(0.8).add(V3(0, 0.45, 0)).normalize();
    // ombre interne : cœur et dessous de la couronne plus sombres
    const ao = Math.min(1, 0.35 + 0.65 * k) * (0.72 + 0.28 * (d.y * 0.5 + 0.5));
    b.card(c, uu, vv, light, ao);
  }
  return b.geo();
}

// sapin : étages de branches inclinées vers le bas, de plus en plus courts vers la pointe
function pineGeo(seed, { height = 13, base = 1.2, radius = 3.4, tiers = 16, per = 9 } = {}) {
  const r = makeRng(seed), b = builder();
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = base + (height - base - 0.8) * f;
    const R = radius * Math.pow(1 - f, 0.85) + 0.35;
    const off = r.range(0, 6.283);
    const n = Math.max(4, Math.round(per * (1 - f * 0.4)));
    for (let k = 0; k < n; k++) {
      const a = off + k * (Math.PI * 2 / n) + r.range(-0.2, 0.2);
      const dx = Math.sin(a), dz = Math.cos(a), droop = R * r.range(0.35, 0.55);
      const root = V3(dx * 0.15, y + 0.25, dz * 0.15), tip = V3(dx * R, y - droop, dz * R);
      // largeur : à plat, perpendiculaire à la branche, avec un léger roulis
      const w = R * 0.85, roll = r.range(-0.35, 0.35);
      const side = V3(dz, roll, -dx).normalize().multiplyScalar(w);
      const nrm = V3(dx * 0.7, 0.75, dz * 0.7).normalize();
      b.branch(root, tip, side, nrm, 0.55 + 0.45 * f);
    }
  }
  // pointe
  b.branch(V3(0, height - 1.6, 0), V3(0, height + 0.3, 0), V3(0.45, 0, 0), V3(0, 1, 0));
  b.branch(V3(0, height - 1.6, 0), V3(0, height + 0.3, 0), V3(0, 0, 0.45), V3(0, 1, 0));
  return b.geo();
}

// palmier : tronc courbe annelé, couronne de palmes qui retombent
function palmGeo(seed, { height = 8, lean = 1.6, fronds = 10 } = {}) {
  const r = makeRng(seed);
  const curve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(lean * 0.25, height * 0.35, 0), V3(lean * 0.7, height * 0.7, 0), V3(lean, height, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 14, 0.22, 8, false);
  // tronc plus épais à la base
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = Math.min(1, Math.max(0, y / height)), c = curve.getPoint(t), k = 1.35 - 0.55 * t;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, y, c.z + (p.getZ(i) - c.z) * k);
  }
  trunk.computeVertexNormals();
  const top = curve.getPoint(1);
  const pos = [], nor = [], uv = [], idx = [], col = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + r.range(-0.2, 0.2), L = r.range(3.2, 4.2), up = r.range(0.3, 0.9), seg = 7;
    const dx = Math.sin(a), dz = Math.cos(a), sx = dz, sz = -dx;
    const b = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg, d = u * L, y = top.y + up * u * L * 0.6 - (u * u) * L * 0.9;
      const w = 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.08)) + 0.08;
      for (const side of [-1, 1]) {
        pos.push(top.x + dx * d + sx * w * side, y, top.z + dz * d + sz * w * side);
        nor.push(dx * 0.4, 0.9, dz * 0.4); uv.push(u, side < 0 ? 0 : 1); const ao = 0.6 + 0.4 * u; col.push(ao, ao, ao);
      }
      if (j < seg) { const k = b + j * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  crown.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  crown.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  crown.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  crown.setIndex(idx); crown.computeBoundingSphere();
  return { trunk, crown };
}

// cactus (saguaro) : un tronc à côtes et un à trois bras qui partent de côté puis remontent ; ~5 m de haut
function cactusGeo(seed) {
  const r = makeRng(seed), parts = [];
  const tube = (rad, h, x, y, z, rz = 0, ry = 0) => {
    const g = new THREE.CylinderGeometry(rad * 0.92, rad, h, 12, 1, true);
    g.translate(0, h / 2, 0); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); parts.push(g);
  };
  const cap = (rad, x, y, z) => { const g = new THREE.SphereGeometry(rad, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(x, y, z); parts.push(g); };
  const elbow = (rad, x, y, z) => { const g = new THREE.SphereGeometry(rad, 12, 8); g.translate(x, y, z); parts.push(g); };
  const H = r.range(4.2, 5.4), R = 0.42;
  tube(R, H, 0, -0.2, 0); cap(R * 0.92, 0, H - 0.2, 0);
  const arms = 1 + Math.floor(r.next() * 3);
  for (let i = 0; i < arms; i++) {
    const a = r.range(0, Math.PI * 2) + i * 2.1, y0 = r.range(1.6, 2.8), out = r.range(0.7, 1.1), up = r.range(1.0, 2.0), ar = R * 0.72;
    const dx = Math.cos(a), dz = Math.sin(a);
    // bras horizontal (couché vers l'extérieur), coude, puis la partie qui remonte
    const g = new THREE.CylinderGeometry(ar, ar, out, 10, 1, true); g.rotateZ(Math.PI / 2); g.translate(out / 2, 0, 0); g.rotateY(-a); g.translate(0, y0, 0); parts.push(g);
    elbow(ar, dx * out, y0, dz * out);
    tube(ar, up, dx * out, y0, dz * out); cap(ar * 0.92, dx * out, y0 + up, dz * out);
  }
  const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  geo.computeBoundingSphere();
  return geo;
}

function trunkGeo(h, r0) {
  const g = new THREE.CylinderGeometry(r0 * 0.6, r0, h, 9, 1, true).translate(0, h / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / 2);
  return g;
}

function foliageMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, vertexColors: true });
  // un peu de lumière qui traverse les feuilles côté soleil ; le feuillage se balance au vent (plus fort en haut)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SWAY);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 iw = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float k = max(0.0, transformed.y - 2.0) * (0.012 + uWind * 0.02);
        transformed.x += sin(uT * 1.4 + iw.x * 0.21 + transformed.y * 0.3) * k;
        transformed.z += cos(uT * 1.1 + iw.z * 0.17 + transformed.x * 0.4) * k * 0.8;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;');
  };
  m.customProgramCacheKey = () => 'golf-foliage-2';
  return m;
}

export const LEAF_TINTS = [0xf2f2e6, 0xdfe8cc, 0xcad8b4, 0xe8eed4, 0xbccca4, 0xd8d0b0];
export const PINE_TINTS = [0xd4e2d8, 0xb8ccbe, 0xa8bfb2, 0xc6d8cc];
const CACTUS_TINTS = [0xffffff, 0xe6eed2, 0xd6e2c0, 0xf2f0d8];

// ------------------------------------------------------------------ assemblage
export function createTreeKit() {
  const leaves = leafTexture(256, 5), leaves2 = leafTexture(256, 17), needles = needleTexture(256, 9), bark = barkTexture();
  const frond = frondTexture(), palmBark = palmBarkTexture(), shade = shadeTexture(), cactus = cactusTexture();
  const mats = {
    leaf: foliageMaterial(leaves), leaf2: foliageMaterial(leaves2), pine: foliageMaterial(needles), frond: foliageMaterial(frond),
    bark: new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }), palmBark: new THREE.MeshStandardMaterial({ map: palmBark, roughness: 0.9 }),
    cactus: new THREE.MeshStandardMaterial({ map: cactus, roughness: 0.75 }),
    shade: new THREE.MeshBasicMaterial({ color: 0x0c2a06, alphaMap: shade, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const palmA = palmGeo(51), palmB = palmGeo(77, { height: 9.5, lean: 2.4, fronds: 11 });
  const geos = {
    round: broadleafGeo(3), oak: broadleafGeo(8, { rx: 3.9, ry: 2.8, cy: 5.3, cards: 120, size: 1.65 }),
    pine: pineGeo(4), pineB: pineGeo(12, { height: 11, radius: 2.7, tiers: 10 }),
    roundLo: broadleafGeo(21, { cards: 22, size: 2.8 }), pineLo: pineGeo(30, { tiers: 10, per: 7, radius: 3.3 }),
    trunkRound: trunkGeo(5.2, 0.32), trunkOak: trunkGeo(4.8, 0.42), trunkPine: trunkGeo(11, 0.3),
    palmA: palmA.crown, palmB: palmB.crown, palmTrunkA: palmA.trunk, palmTrunkB: palmB.trunk,
    shade: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    cactusA: cactusGeo(3), cactusB: cactusGeo(19),
  };
  const textures = [leaves, leaves2, needles, bark, frond, palmBark, shade, cactus];

  // instances : items = [{ x, y, z, s, rot, kind, v }]
  function plant(items, { lo = false, shadows = true, dark = false } = {}) {
    const group = new THREE.Group();
    const byKind = { round: [], oak: [], pine: [], palm: [], cactus: [] };
    for (const it of items) (byKind[it.kind] || byKind.round).push(it);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const add = (geo, mat, list, tints, isFoliage) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot); p.set(it.x, it.y - 0.15, it.z); sc.setScalar(it.s); m.compose(p, q, sc); im.setMatrixAt(i, m);
        // hors du jeu, le feuillage est plus sombre (sous-bois)
        if (isFoliage) { col.setHex(tints[it.v % tints.length]); if (dark || it.dark) col.multiplyScalar(0.42); im.setColorAt(i, col); }
      });
      im.castShadow = shadows; im.receiveShadow = true; im.computeBoundingSphere();
      im.userData.shared = true;
      group.add(im);
    };
    const pines = byKind.pine, pinesA = pines.filter((t) => !(t.v & 1)), pinesB = pines.filter((t) => t.v & 1);
    if (lo) {
      add(geos.roundLo, mats.leaf, [...byKind.round, ...byKind.oak], LEAF_TINTS, true);
      add(geos.pineLo, mats.pine, pines, PINE_TINTS, true);
    } else {
      add(geos.round, mats.leaf, byKind.round, LEAF_TINTS, true);
      add(geos.oak, mats.leaf2, byKind.oak, LEAF_TINTS, true);
      add(geos.pine, mats.pine, pinesA, PINE_TINTS, true);
      add(geos.pineB, mats.pine, pinesB, PINE_TINTS, true);
    }
    const cactiA = byKind.cactus.filter((t) => !(t.v & 1)), cactiB = byKind.cactus.filter((t) => t.v & 1);
    add(geos.cactusA, mats.cactus, cactiA, CACTUS_TINTS, true); add(geos.cactusB, mats.cactus, cactiB, CACTUS_TINTS, true);
    const palmsA = byKind.palm.filter((t) => !(t.v & 1)), palmsB = byKind.palm.filter((t) => t.v & 1);
    add(geos.palmA, mats.frond, palmsA, LEAF_TINTS, true); add(geos.palmB, mats.frond, palmsB, LEAF_TINTS, true);
    add(geos.palmTrunkA, mats.palmBark, palmsA, null, false); add(geos.palmTrunkB, mats.palmBark, palmsB, null, false);
    add(geos.trunkRound, mats.bark, byKind.round, null, false);
    add(geos.trunkOak, mats.bark, byKind.oak, null, false);
    add(geos.trunkPine, mats.bark, pines, null, false);
    return group;
  }
  // ombre douce au pied des arbres du parcours, couchée sur la pente
  function shades(hole) {
    const list = hole.trees;
    const im = new THREE.InstancedMesh(geos.shade, mats.shade, Math.max(1, list.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    list.forEach((t, i) => {
      const [gx, gz] = hole.slopeAt(t.x, t.z, 1); n.set(-gx, 1, -gz).normalize(); q.setFromUnitVectors(up, n);
      p.set(t.x, hole.heightAt(t.x, t.z) + 0.06, t.z); sc.setScalar(t.r * (t.kind === 'pine' ? 1.05 : 1.2)); m.compose(p, q, sc); im.setMatrixAt(i, m);
    });
    im.count = list.length; im.renderOrder = 1; im.userData.shared = true; im.computeBoundingSphere();
    return im;
  }
  return {
    plant, shades, geos, mats,   // geos et mats : pour Dogfight 3D, qui plante ses propres forêts
    dispose() { for (const g of Object.values(geos)) g.dispose(); for (const m of Object.values(mats)) m.dispose(); for (const t of textures) t.dispose(); },
  };
}

// Forêt lointaine : des massifs de sapins et de feuillus sur les collines, au-delà de la zone de jeu
export function forestItems(hole, { count = 1700 } = {}) {
  const r = makeRng(hole.def.seed * 41 + 7), items = [];
  const B = hole.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  const near = 90;
  // densité en taches : forêts et clairières
  const dens = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.6) + 0.3 * Math.sin((x + z) * 0.029);
  // très long trou : la forêt s'étire avec lui (et compte plus d'arbres)
  const ex = hole.long ? Math.max(0, (B.x1 - B.x0) / 2 - 150) : 0, ez = hole.long ? Math.max(0, (B.z1 - B.z0) / 2 - 300) : 0;
  if (hole.long) count = Math.round(count * Math.min(1.8, 1 + (ex + ez) / 700));
  let tries = 0;
  while (items.length < count && tries++ < count * 12) {
    const a = r.range(0, Math.PI * 2), d = r.range(0, 720);
    const x = cx + Math.sin(a) * (d * 1.1 + ex), z = cz + Math.cos(a) * (d * 1.25 + ez);
    if (-hole.landSD(x, z) < near || r.next() > dens(x, z)) continue;
    if (hole.waters.some((w) => Math.hypot(x - w.x, z - w.z) < Math.max(w.rx, w.rz) * 1.6)) continue;
    if (hole.coast && hole.heightAt(x, z) < hole.coast.level + 2.5) continue;
    // essences selon le décor : sapins en montagne, palmiers et feuillus au bord de la mer
    // (au désert : des cactus clairsemés, et quelques palmiers)
    if (hole.theme === 'desert' && r.next() < 0.82) continue;
    const kind = hole.theme === 'montagne' ? (r.chance(0.88) ? 'pine' : 'round') : hole.theme === 'mer' ? r.pick(['palm', 'palm', 'round', 'oak']) : hole.theme === 'desert' ? (r.chance(0.92) ? 'cactus' : 'palm') : (r.chance(0.62) ? 'pine' : r.chance(0.5) ? 'round' : 'oak');
    items.push({ x, z, y: hole.heightAt(x, z), kind, s: r.range(0.9, 1.45), rot: r.range(0, 6.283), v: r.int(0, 7) });
  }
  return items;
}
