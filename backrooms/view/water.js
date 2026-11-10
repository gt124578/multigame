// The Backrooms (Level 37, les Poolrooms) - Le rendu des salles préfabriquées : sols en relief qui suivent la forme
// des bassins (bords courbes, îlots, margelles), cloisons percées de portes en plein cintre, plafonds (plats, voûtes
// d'arêtes, berceaux à arcs, verrière), colonnes, échelles chromées, hublots, et l'eau : limpide, vert d'eau, plus
// sombre avec la profondeur, avec les ronds des pas. Et deux choses qu'on n'est jamais sûr d'avoir vues : l'eau qui
// monte ou descend de quelques centimètres quand on ne la regarde pas, et une ombre longue au fond d'un bassin.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { CELL_SIZE } from '../engine/map.js';
import { POOL_CEIL, WALL_T, MOUTH, roomDepth, poolSdf, islandSdf } from '../engine/poolrooms.js';

const C = CELL_SIZE;
const SPLASHES = 8;
const BOTTOM = -1.3; // les murs descendent jusque-là, sous les bassins
const GROIN = { spring: POOL_CEIL - 2.2, rise: 2.2 };
const BARREL = { spring: POOL_CEIL - 2.5, r: 2.5 };
const RIDGE = 7.5; // faîtage de la verrière

// géométrie à partir de listes : positions, uv (et une valeur par sommet, en option)
function geometry(pos, uv, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (extra) g.setAttribute(extra.name, new THREE.Float32BufferAttribute(extra.data, 1));
  g.computeVertexNormals();
  return g;
}

export function buildWater({ map, group, baked, textures, bake, fog }) {
  const mosaic = baked(new THREE.MeshLambertMaterial({ map: textures.mosaic, side: THREE.DoubleSide }));
  const wallMat = baked(new THREE.MeshLambertMaterial({ map: textures.mosaic }));
  const mats = {
    dry: baked(new THREE.MeshLambertMaterial({ map: textures.carpet })),
    pool: baked(new THREE.MeshLambertMaterial({ map: textures.pool, side: THREE.DoubleSide })),
    coping: baked(new THREE.MeshLambertMaterial({ color: '#f1f3ef' })),
  };
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    group.add(m);
    return m;
  };

  // --- 1. Sols en relief et surface de l'eau, salle par salle ---
  const fl = { dry: [[], []], pool: [[], []], coping: [[], []] };
  const wPos = [];
  const wDep = [];
  const deepSpots = [];
  const waterSpots = [];
  for (const r of map.rooms) {
    let x0 = r.x0;
    let x1 = r.x1;
    let z0 = r.z0;
    let z1 = r.z1;
    // un couloir n'occupe que le milieu de son module (5 m)
    if (r.axis === 'x') {
      z0 += C;
      z1 -= C;
    } else if (r.axis === 'z') {
      x0 += C;
      x1 -= C;
    }
    const step = r.flat !== undefined ? 1.25 : 0.25;
    const nx = Math.round((x1 - x0) / step);
    const nz = Math.round((z1 - z0) / step);
    // les points proches d'un bord (le bassin, la margelle, un îlot) sont recalés dessus : des bords bien ronds
    const COP = 0.32;
    const snap = (x, z, f, off) => {
      const v = f(x, z) - off;
      if (!(Math.abs(v) < step * 0.75)) return null;
      const e = 0.02;
      const gx = (f(x + e, z) - f(x - e, z)) / (2 * e);
      const gz = (f(x, z + e) - f(x, z - e)) / (2 * e);
      const g2 = gx * gx + gz * gz || 1;
      return [x - (v * gx) / g2, z - (v * gz) / g2];
    };
    const ps = (x, z) => poolSdf(r, x, z);
    const is = (x, z) => islandSdf(r, x, z);
    const P = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        let x = x0 + i * step;
        let z = z0 + j * step;
        // pas les points du bord de la salle (ils touchent les murs)
        if (r.flat === undefined && i > 0 && j > 0 && i < nx && j < nz) {
          const q = ((r.islands || []).length ? snap(x, z, is, 0) : null) || snap(x, z, ps, 0) || snap(x, z, ps, COP);
          if (q) [x, z] = q;
        }
        const d = roomDepth(r, x, z);
        P.push({ x, z, d });
        if (d >= 1) deepSpots.push({ x, z, d });
        if (d > 0 && (i + j) % 4 === 0) waterSpots.push({ x, z });
      }
    }
    const at = (i, j) => P[j * (nx + 1) + i];
    const tri = (a, b, c) => {
      // le genre du triangle se lit en son centre
      const mx = (a.x + b.x + c.x) / 3;
      const mz = (a.z + b.z + c.z) / 3;
      const md = roomDepth(r, mx, mz);
      const sd = r.flat === undefined ? poolSdf(r, mx, mz) : null;
      const wet = md > 0.01 || (sd !== null && sd < 0 && is(mx, mz) > 0);
      const cop = !wet && sd !== null && sd >= 0 && sd < COP;
      const k = r.flat !== undefined ? 'dry' : wet ? 'pool' : cop ? 'coping' : 'dry';
      const [pos, uv] = fl[k];
      for (const v of [a, b, c]) {
        pos.push(v.x, cop ? 0.045 : -v.d, v.z);
        uv.push(v.x / C, v.z / C);
      }
      if (wet || r.flat) for (const v of [a, b, c]) wPos.push(v.x, 0, v.z), wDep.push(v.d);
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        tri(at(i, j), at(i, j + 1), at(i + 1, j + 1));
        tri(at(i, j), at(i + 1, j + 1), at(i + 1, j));
      }
    }
  }
  for (const k of ['dry', 'pool', 'coping']) if (fl[k][0].length) add(geometry(fl[k][0], fl[k][1]), mats[k]);

  // --- 2. Cloisons entre les salles : un pan par bord commun, percé de ses portes en plein cintre ---
  const runs = new Map();
  for (const e of map.edges) {
    const line = e.along === 'x' ? e.z0 : e.x0;
    const key = `${e.along}:${line.toFixed(2)}`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(e.along === 'x' ? [e.x0, e.x1] : [e.z0, e.z1]);
  }
  const DW = map.doors.length ? map.doors[0].w / 2 : 1.5;
  const SPRING = 1.7; // naissance de l'arc des portes (clé à 3,20 m)
  const thresholds = [];
  for (const [key, list] of runs) {
    const [along, ls] = key.split(':');
    const line = +ls;
    list.sort((a, b) => a[0] - b[0]);
    // bords contigus regroupés en pans
    const spans = [];
    for (const [a, b] of list) {
      const last = spans[spans.length - 1];
      if (last && Math.abs(last[1] - a) < 0.01) last[1] = b;
      else spans.push([a, b]);
    }
    for (const [u0, u1] of spans) {
      const ds = map.doors.filter((d) => d.along === along && Math.abs((along === 'x' ? d.pz : d.px) - line) < 0.01).map((d) => (along === 'x' ? d.px : d.pz)).filter((c) => c > u0 && c < u1).sort((a, b) => a - b);
      const sh = new THREE.Shape();
      sh.moveTo(u0, BOTTOM);
      for (const c of ds) {
        sh.lineTo(c - DW, BOTTOM);
        sh.lineTo(c - DW, SPRING);
        for (let k = 1; k <= 16; k++) {
          const a = Math.PI - (k / 16) * Math.PI;
          sh.lineTo(c + DW * Math.cos(a), SPRING + DW * Math.sin(a));
        }
        sh.lineTo(c + DW, BOTTOM);
        // le seuil de la porte : le sol entre les deux salles, à la hauteur de la plus profonde
        const px = along === 'x' ? c : line;
        const pz = along === 'x' ? line : c;
        const off = 0.6;
        const da = map.depthAt(along === 'x' ? px : px - off, along === 'x' ? pz - off : pz);
        const db = map.depthAt(along === 'x' ? px : px + off, along === 'x' ? pz + off : pz);
        thresholds.push({ px, pz, along, d: Math.max(da, db) });
      }
      sh.lineTo(u1, BOTTOM);
      sh.lineTo(u1, POOL_CEIL);
      sh.lineTo(u0, POOL_CEIL);
      sh.lineTo(u0, BOTTOM);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: WALL_T, bevelEnabled: false, curveSegments: 4 });
      // la mosaïque : 2,5 m par répétition
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / C, uv.getY(i) / C);
      geo.translate(0, 0, -WALL_T / 2);
      const m = add(geo, wallMat);
      if (along === 'x') m.position.set(0, 0, line);
      else {
        m.rotation.y = -Math.PI / 2;
        m.position.set(line, 0, 0);
      }
    }
  }
  for (const t of thresholds) {
    const g = new THREE.BoxGeometry(t.along === 'x' ? DW * 2 : WALL_T + 0.02, -t.d - BOTTOM, t.along === 'x' ? WALL_T + 0.02 : DW * 2);
    const m = add(g, mats.dry);
    m.position.set(t.px, (BOTTOM - t.d) / 2, t.pz);
    if (t.d > 0) {
      // l'eau passe sous la porte
      const hw = t.along === 'x' ? DW : WALL_T / 2 + 0.05;
      const hd = t.along === 'x' ? WALL_T / 2 + 0.05 : DW;
      wPos.push(t.px - hw, 0, t.pz - hd, t.px - hw, 0, t.pz + hd, t.px + hw, 0, t.pz + hd, t.px - hw, 0, t.pz - hd, t.px + hw, 0, t.pz + hd, t.px + hw, 0, t.pz - hd);
      for (let i = 0; i < 6; i++) wDep.push(t.d);
    }
  }

  // --- 3. Plafonds : plats, bas (locaux techniques), voûtes d'arêtes, berceaux à arcs, verrière ---
  const flatCeil = [[], []];
  const quad = (out, ax, az, bx, bz, y) => {
    const [pos, uv] = out;
    for (const [x, z] of [[ax, az], [ax, bz], [bx, bz], [ax, az], [bx, bz], [bx, az]]) {
      pos.push(x, y, z);
      uv.push(x / C, z / C);
    }
  };
  const groin = [[], []];
  const barrel = [[], []];
  const ribs = [[], []];
  const glass = [];
  const beams = [];
  const gables = [[], []];
  for (const r of map.rooms) {
    if (r.ceil === 'flat') quad(flatCeil, r.x0, r.z0, r.x1, r.z1, POOL_CEIL);
    else if (r.ceil === 'low') {
      quad(flatCeil, r.x0, r.z0, r.x1, r.z1, 3.2);
      // sous le plafond bas d'un local technique, un caisson ferme le haut des murs
      for (const [ax, az, bx, bz] of [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]]) {
        const [pos, uv] = gables;
        const L = Math.hypot(bx - ax, bz - az);
        for (const [x, z, y, u] of [[ax, az, 3.2, 0], [bx, bz, 3.2, L], [bx, bz, POOL_CEIL, L], [ax, az, 3.2, 0], [bx, bz, POOL_CEIL, L], [ax, az, POOL_CEIL, 0]]) {
          pos.push(x, y, z);
          uv.push(u / C, y / C);
        }
      }
    } else if (r.ceil === 'groin') {
      const N = 16;
      for (const b of r.bays) {
        const pt = (i, j) => {
          const u = (i / N) * 2 - 1;
          const v = (j / N) * 2 - 1;
          const x = b.x0 + ((u + 1) / 2) * (b.x1 - b.x0);
          const z = b.z0 + ((v + 1) / 2) * (b.z1 - b.z0);
          const y = GROIN.spring + GROIN.rise * Math.max(Math.sqrt(Math.max(0, 1 - u * u)), Math.sqrt(Math.max(0, 1 - v * v)));
          return [x, y, z];
        };
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            for (const [a, c] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) {
              const [x, y, z] = pt(i + a, j + c);
              groin[0].push(x, y, z);
              groin[1].push((x + (y - GROIN.spring) * 0.6) / C, (z + (y - GROIN.spring) * 0.6) / C);
            }
          }
        }
      }
    } else if (r.ceil === 'barrel') {
      // berceau sur 5 m de large, le long du couloir, et un arc doubleau tous les 2,5 m
      const ax = r.axis === 'x';
      const len = ax ? r.w : r.h;
      const a0 = ax ? r.x0 : r.z0;
      const mid = ax ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      const SEG = 20;
      const p = (u, t, R) => {
        const lat = -R * Math.cos(t);
        const y = BARREL.spring + R * Math.sin(t);
        return ax ? [a0 + u, y, mid + lat] : [mid + lat, y, a0 + u];
      };
      for (let k = 0; k < SEG; k++) {
        const t0 = (k / SEG) * Math.PI;
        const t1 = ((k + 1) / SEG) * Math.PI;
        for (const [u, t] of [[0, t0], [len, t0], [len, t1], [0, t0], [len, t1], [0, t1]]) {
          barrel[0].push(...p(u, t, BARREL.r));
          barrel[1].push(u / C, (t * BARREL.r) / C);
        }
        for (let u = C / 2; u < len; u += C) {
          for (const [du, t] of [[-0.18, t0], [0.18, t0], [0.18, t1], [-0.18, t0], [0.18, t1], [-0.18, t1]]) {
            ribs[0].push(...p(u + du, t, BARREL.r - 0.14));
            ribs[1].push((u + du) / C, (t * BARREL.r) / C);
          }
        }
      }
    } else if (r.ceil === 'sky') {
      // verrière à deux pans : de l'égout (4,5 m) au faîtage (7,5 m), le long de la grande longueur
      const ax = r.long === 'x';
      const L = ax ? r.w : r.h;
      const S = ax ? r.h : r.w;
      const a0 = ax ? r.x0 : r.z0;
      const s0 = ax ? r.z0 : r.x0;
      const P = (u, v, y) => (ax ? [a0 + u, y, s0 + v] : [s0 + v, y, a0 + u]);
      for (const [v0, v1] of [[0, S / 2], [S, S / 2]]) {
        glass.push(...P(0, v0, POOL_CEIL), ...P(L, v0, POOL_CEIL), ...P(L, v1, RIDGE), ...P(0, v0, POOL_CEIL), ...P(L, v1, RIDGE), ...P(0, v1, RIDGE));
      }
      for (let u = 0; u <= L + 0.01; u += C) beams.push({ P, u, S, ax });
      // les pignons (triangles carrelés aux deux bouts)
      for (const u of [0, L]) {
        const tri = [P(u, 0, POOL_CEIL), P(u, S, POOL_CEIL), P(u, S / 2, RIDGE)];
        for (const [x, y, z] of tri) {
          gables[0].push(x, y, z);
          gables[1].push((ax ? z : x) / C, y / C);
        }
      }
    }
  }
  if (flatCeil[0].length) add(geometry(flatCeil[0], flatCeil[1]), mosaic);
  if (groin[0].length) add(geometry(groin[0], groin[1]), mosaic);
  if (barrel[0].length) add(geometry(barrel[0], barrel[1]), mosaic);
  if (ribs[0].length) add(geometry(ribs[0], ribs[1]), baked(new THREE.MeshLambertMaterial({ map: textures.mosaic, color: '#cddcda', side: THREE.DoubleSide })));
  if (gables[0].length) add(geometry(gables[0], gables[1]), mosaic);
  if (glass.length) {
    // le verre laiteux : il éclaire (il ne prend pas la lumière, il la donne)
    add(geometry(glass), new THREE.MeshBasicMaterial({ color: '#d9e8e6', side: THREE.DoubleSide, fog: false }));
    const beamMat = new THREE.MeshLambertMaterial({ color: '#4a5658', emissive: '#4a5658', emissiveIntensity: 0.5 });
    for (const b of beams) {
      // une poutre de chaque côté, de l'égout au faîtage
      for (const [v0, v1] of [[0, b.S / 2], [b.S, b.S / 2]]) {
        const a = new THREE.Vector3(...b.P(b.u, v0, POOL_CEIL));
        const c = new THREE.Vector3(...b.P(b.u, v1, RIDGE));
        const len = a.distanceTo(c);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, len), beamMat);
        m.position.copy(a).add(c).multiplyScalar(0.5);
        m.lookAt(c);
        m.position.y -= 0.12;
        group.add(m);
      }
    }
  }

  // --- 4. Colonnes, carrelées de mosaïque, du fond des bassins au plafond ---
  const colKinds = new Map();
  for (const c of map.cols) {
    const key = c.r.toFixed(2);
    if (!colKinds.has(key)) colKinds.set(key, []);
    colKinds.get(key).push(c);
  }
  const dummy = new THREE.Object3D();
  for (const [key, list] of colKinds) {
    const r = +key;
    const h = POOL_CEIL - BOTTOM;
    const geo = new THREE.CylinderGeometry(r, r, h, 28, 1, true);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / C, (uv.getY(i) * h) / C);
    const inst = new THREE.InstancedMesh(geo, mosaic, list.length);
    list.forEach((c, i) => {
      dummy.position.set(c.x, (POOL_CEIL + BOTTOM) / 2, c.z);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.frustumCulled = false;
    group.add(inst);
  }

  // --- 5. Hublots ronds sur les longs murs des halles sous verrière ---
  const portMat = new THREE.MeshBasicMaterial({ color: '#8fb7b8' }); // le verre des hublots, un peu sombre
  const chrome = baked(new THREE.MeshLambertMaterial({ color: '#dfe5e8', emissive: '#596066', emissiveIntensity: 0.4 }));
  const portGeo = new THREE.CircleGeometry(0.34, 24);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.04, 6, 24);
  for (const r of map.rooms) {
    if (r.ceil !== 'sky') continue;
    const ax = r.long === 'x';
    const L = ax ? r.w : r.h;
    for (let u = C / 2; u < L; u += C) {
      for (const [side, n] of [[0, 1], [1, -1]]) {
        const x = ax ? r.x0 + u : side ? r.x1 - 0.02 : r.x0 + 0.02;
        const z = ax ? (side ? r.z1 - 0.02 : r.z0 + 0.02) : r.z0 + u;
        if (map.doors.some((d) => Math.hypot(d.px - x, d.pz - z) < 2.2)) continue;
        if (map.collide(x + (ax ? 0 : n * 0.3), z + (ax ? n * 0.3 : 0), 0.05)) continue;
        for (const [geo, mat, dz] of [[portGeo, portMat, 0.005], [ringGeo, chrome, 0.01]]) {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x + (ax ? 0 : n * dz), 2.3, z + (ax ? n * dz : 0));
          m.rotation.y = ax ? (n > 0 ? 0 : Math.PI) : n > 0 ? Math.PI / 2 : -Math.PI / 2;
          group.add(m);
        }
      }
    }
  }

  // --- 6. Échelles chromées : deux montants recourbés au-dessus de la margelle, trois marches sous l'eau ---
  for (const l of map.ladders || []) {
    const g = new THREE.Group();
    for (const side of [-0.26, 0.26]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, 0, -0.5),
        new THREE.Vector3(side, 0.7, -0.45),
        new THREE.Vector3(side, 0.95, -0.2),
        new THREE.Vector3(side, 0.8, 0.07),
        new THREE.Vector3(side, 0.1, 0.13),
        new THREE.Vector3(side, -0.9, 0.13),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.025, 8, false), chrome));
    }
    for (const y of [-0.22, -0.48, -0.74]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.09), chrome);
      st.position.set(0, y, 0.15);
      g.add(st);
    }
    g.position.set(l.x, 0, l.z);
    g.rotation.y = Math.atan2(l.dx, l.dz); // +z local = vers l'eau
    group.add(g);
  }

  // --- 6b. Les toboggans : un gros tube coloré qui sort du mur au ras du sol, et son tuyau qui monte le long du mur
  // puis replonge dedans sous le plafond ; une grille le ferme tant que les volants ne sont pas tous trouvés (et
  // quand un autre toboggan a été pris) ---
  const slideMeshes = [];
  const metal = baked(new THREE.MeshLambertMaterial({ color: '#8e979c' }));
  const R = MOUTH.r;
  for (const sl of map.slides || []) {
    const g = new THREE.Group();
    g.position.set(sl.x, 0, sl.z);
    g.rotation.y = Math.atan2(-sl.dx, -sl.dz); // +z local = vers la salle
    const plastic = baked(new THREE.MeshLambertMaterial({ color: sl.hex, emissive: sl.hex, emissiveIntensity: 0.12, side: THREE.DoubleSide }));
    // la bouche : un court tronçon de tube et son bourrelet
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.55, 32, 1, true).rotateX(Math.PI / 2), plastic);
    mouth.position.set(0, MOUTH.y, 0.275);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 10, 32), plastic);
    lip.position.set(0, MOUTH.y, 0.55);
    // le fond : le noir du tube qui s'enfonce dans le mur
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cg = cv.getContext('2d');
    const grad = cg.createRadialGradient(32, 30, 2, 32, 32, 32);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.55, '#020304');
    grad.addColorStop(1, new THREE.Color(sl.hex).multiplyScalar(0.35).getStyle());
    cg.fillStyle = grad;
    cg.fillRect(0, 0, 64, 64);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(R - 0.005, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    hole.position.set(0, MOUTH.y, 0.02);
    // le tuyau : il monte au-dessus de la bouche, longe le mur sous le plafond et y rentre
    const side = sl.id % 2 ? 1 : -1;
    const top = MOUTH.y + R;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, top - 0.25, 0.3),
      new THREE.Vector3(0, top + 0.5, 0.33),
      new THREE.Vector3(0, 2.8, 0.33),
      new THREE.Vector3(side * 0.7, 3.55, 0.33),
      new THREE.Vector3(side * 1.9, 3.75, 0.33),
      new THREE.Vector3(side * 2.9, 3.8, 0.22),
      new THREE.Vector3(side * 3.3, 3.8, -0.35),
    ]);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.3, 16, false), plastic);
    // deux colliers de métal sur la montée
    const rings = [2.0, 2.7].map((y) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 20).rotateX(Math.PI / 2), metal);
      m.position.set(0, y, 0.33);
      return m;
    });
    // la grille : barreaux devant la bouche
    const grate = new THREE.Group();
    for (let k = -2; k <= 2; k++) {
      const x = k * 0.22;
      const h = 2 * Math.sqrt(Math.max(0, R * R - x * x));
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, h, 6), metal);
      bar.position.set(x, MOUTH.y, 0.5);
      grate.add(bar);
    }
    for (const y of [-0.25, 0.25]) {
      const w = 2 * Math.sqrt(R * R - y * y);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, w, 6).rotateZ(Math.PI / 2), metal);
      bar.position.set(0, MOUTH.y + y, 0.5);
      grate.add(bar);
    }
    g.add(mouth, lip, hole, pipe, ...rings, grate);
    group.add(g);
    slideMeshes.push({ sl, grate });
  }

  // --- 7. La surface de l'eau ---
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(wDep, 1));
  const splash = Array.from({ length: SPLASHES }, () => new THREE.Vector4(0, 0, -100, 0));
  const uniforms = {
    uTime: { value: 0 },
    uBake: bake.uBake,
    uBakeScale: bake.uBakeScale,
    uFogColor: { value: fog.color },
    uFogDensity: { value: fog.density },
    uSplash: { value: splash },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float aDepth;
varying float vDepth;
varying vec3 vWorld;
void main() {
  vDepth = aDepth;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `uniform float uTime;
uniform sampler2D uBake;
uniform vec2 uBakeScale;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uSplash[${SPLASHES}];
varying float vDepth;
varying vec3 vWorld;
float hgt(vec2 p) {
  // l'eau est presque immobile : deux houles très lentes et une ride fine
  float h = sin(p.x * 1.3 + uTime * 0.6) * 0.012 + sin(p.y * 1.7 - uTime * 0.5) * 0.010;
  h += sin((p.x + p.y) * 4.1 + uTime * 1.3) * 0.004 + sin((p.x - p.y) * 5.3 - uTime * 1.1) * 0.003;
  // les ronds des pas
  for (int i = 0; i < ${SPLASHES}; i++) {
    vec4 s = uSplash[i];
    float age = uTime - s.z;
    if (age < 0.0 || age > 3.0) continue;
    float d = distance(p, s.xy);
    float r = age * 0.9;
    h += sin((d - r) * 22.0) * exp(-age * 1.4) * exp(-abs(d - r) * 5.0) * 0.02 * s.w;
  }
  return h;
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.04;
  vec3 n = normalize(vec3(-(hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0))) / (2.0 * e), 1.0, -(hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e))) / (2.0 * e)));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float light = texture2D(uBake, p * uBakeScale).r * 2.0;
  float k = clamp(vDepth / 1.2, 0.0, 1.0);
  // vert d'eau peu profond, puis bleu-vert sombre : l'absorption de l'eau
  vec3 body = mix(vec3(0.6, 0.9, 0.84), vec3(0.04, 0.36, 0.42), k);
  vec3 sky = vec3(0.92, 0.97, 0.97) * (0.55 + light * 0.5);
  float glint = pow(max(dot(reflect(-v, n), vec3(0.0, 1.0, 0.0)), 0.0), 60.0) * 0.35;
  vec3 col = mix(body * (0.45 + light * 0.55), sky, fres) + glint;
  float alpha = clamp(mix(0.22, 0.72, k) + fres * 0.5, 0.0, 0.95);
  float fd = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * fd * fd);
  gl_FragColor = vec4(mix(col, uFogColor, fogF), alpha);
}`,
  });
  const surface = new THREE.Mesh(geo, mat);
  const BASE = -0.03;
  surface.position.y = BASE;
  surface.renderOrder = 3;
  surface.frustumCulled = false;
  group.add(surface);

  // --- 8. L'ombre au fond des bassins profonds ---
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 64;
  const sg = sc.getContext('2d');
  sg.filter = 'blur(6px)';
  sg.fillStyle = '#000';
  sg.beginPath();
  sg.ellipse(110, 32, 80, 15, 0, 0, Math.PI * 2); // le corps
  sg.fill();
  sg.beginPath();
  sg.moveTo(180, 32);
  sg.quadraticCurveTo(220, 22, 250, 30); // la queue
  sg.quadraticCurveTo(220, 40, 180, 34);
  sg.fill();
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: new THREE.CanvasTexture(sc), transparent: true, opacity: 0, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9).rotateX(-Math.PI / 2), shadowMat);
  shadow.renderOrder = 2;
  group.add(shadow);
  const ghostSpots = deepSpots.filter((_, i) => i % 7 === 0);
  let ghost = null;
  let nextGhost = 25 + Math.random() * 20;

  // --- 9. L'eau qui change de niveau quand on ne la regarde pas ---
  let level = BASE;
  let levelWant = BASE;
  let nextShift = 30 + Math.random() * 30;
  const fwd = new THREE.Vector3();
  const steps = new Map();
  let si = 0;

  return {
    get level() {
      return level;
    },
    update(sim, P, time, dt, camera) {
      uniforms.uTime.value = time;
      // les grilles des toboggans : levées quand les volants sont trouvés, sauf sur les toboggans qu'on n'a pas pris
      for (const { sl, grate } of slideMeshes) grate.visible = !sim.open || (sim.slide >= 0 && sim.slide !== sl.id);
      // un rond dans l'eau à chaque pas de chaque joueur qui marche dans l'eau
      for (const Q of sim.players) {
        if (Q.status !== 'alive' || !Q.moving || map.depthAt(Q.x, Q.z) <= 0) continue;
        const last = steps.get(Q.id) || 0;
        if (time - last < (Q.running ? 0.3 : 0.45)) continue;
        steps.set(Q.id, time);
        splash[si].set(Q.x, Q.z, time, Q.running ? 1.4 : 1);
        si = (si + 1) % SPLASHES;
      }
      // le niveau de l'eau bouge de quelques centimètres, seulement quand le joueur regarde ailleurs
      nextShift -= dt;
      camera.getWorldDirection(fwd);
      if (nextShift <= 0 && waterSpots.length) {
        let near = null;
        for (const w of waterSpots) {
          const d = Math.hypot(w.x - P.x, w.z - P.z);
          if (!near || d < near.d) near = { w, d };
        }
        const away = fwd.y > 0.25 || (fwd.x * (near.w.x - P.x) + fwd.z * (near.w.z - P.z)) / Math.max(0.1, near.d) < 0;
        if (away) {
          levelWant = Math.random() < 0.3 ? BASE : BASE + (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.04);
          nextShift = 25 + Math.random() * 35;
        }
      }
      level += Math.sign(levelWant - level) * Math.min(Math.abs(levelWant - level), dt * 0.03);
      surface.position.y = level;
      // l'ombre : de temps en temps, elle traverse le fond d'un bassin profond pas trop loin, puis disparaît
      nextGhost -= dt;
      if (!ghost && nextGhost <= 0 && ghostSpots.length) {
        const near = ghostSpots.filter((c) => {
          const d = Math.hypot(c.x - P.x, c.z - P.z);
          return d > 5 && d < 20;
        });
        if (near.length) {
          const c = near[Math.floor(Math.random() * near.length)];
          ghost = { x: c.x, z: c.z, y: -c.d + 0.06, a: Math.random() * Math.PI * 2, t: 0, len: 4 + Math.random() * 2 };
        }
        nextGhost = 30 + Math.random() * 40;
      }
      if (ghost) {
        ghost.t += dt;
        const f = ghost.t / ghost.len;
        const travel = (0.5 - f) * 3.2; // la tête (côté -x de l'image) devant
        shadow.position.set(ghost.x + Math.cos(ghost.a) * travel, ghost.y, ghost.z + Math.sin(ghost.a) * travel);
        shadow.rotation.y = -ghost.a;
        shadowMat.opacity = Math.sin(Math.min(1, f) * Math.PI) * 0.6;
        if (f >= 1) {
          ghost = null;
          shadowMat.opacity = 0;
        }
      }
    },
  };
}
