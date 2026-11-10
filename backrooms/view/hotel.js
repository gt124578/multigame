// The Backrooms (Level 5, le Terror Hotel) - L'habillage de l'hôtel des années 1930 : portes de chambre numérotées,
// lits, armoires et bureaux, appliques Art déco du couloir, lustre et comptoir du hall, cadres aux murs, boîtes aux
// lettres (une par chambre), clavier à code et porte de l'escalier de secours, les lettres sur papier, et le code à 4
// chiffres qui s'allume au plafond du hall quand les 6 lettres sont postées.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { CELL_SIZE } from '../engine/map.js';
import { FURNITURE } from '../engine/hotel.js';

const C = CELL_SIZE;

// petite toile de texte (numéros, lettres, code)
function label(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHotel({ map, group, baked, CEIL }) {
  const lam = (o) => baked(new THREE.MeshLambertMaterial(o));
  const M = {
    wood: lam({ color: '#3b2314' }),
    darkWood: lam({ color: '#24150b' }),
    door: lam({ color: '#4a2c18' }),
    brass: lam({ color: '#a8823c', emissive: '#2a1c08', emissiveIntensity: 0.4 }),
    sheet: lam({ color: '#d9d0bd' }),
    blanket: lam({ color: '#6b1f1c' }),
    pillow: lam({ color: '#e6dccb' }),
    metal: lam({ color: '#5d5a55' }),
    fire: lam({ color: '#7a2a20' }),
    stair: new THREE.MeshLambertMaterial({ color: '#2a2724', side: THREE.BackSide, emissive: '#0d0b09', emissiveIntensity: 1 }),
    black: new THREE.MeshBasicMaterial({ color: '#050403' }),
  };
  const box = (w, h, d, mat, x, y, z, parent = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  // un repère tourné : +z local vers (dx, dz)
  const frame = (x, z, rot) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    group.add(g);
    return g;
  };

  // --- 1. Portes des chambres : linteau, battant entrouvert vers la chambre, plaque de laiton numérotée ---
  for (const r of map.rooms) {
    const { x, z } = r.door;
    const [dx, dz] = r.dir; // de la chambre vers le couloir
    const cx = (x + 0.5) * C;
    const cz = (z + 0.5) * C;
    const g = frame(cx, cz, Math.atan2(dx, dz)); // +z local : vers le couloir ; x local : le long du mur
    const jw = (C - map.doorW) / 2;
    for (const sx of [-1, 1]) box(jw, CEIL, C, M.darkWood, sx * (map.doorW / 2 + jw / 2), CEIL / 2, 0, g);
    box(map.doorW, CEIL - 2.25, C, M.darkWood, 0, 2.25 + (CEIL - 2.25) / 2, 0, g);
    // chambranle côté couloir
    for (const sx of [-1, 1]) box(0.09, 2.3, 0.06, M.wood, sx * (map.doorW / 2 + 0.045), 1.15, C / 2 + 0.03, g);
    box(map.doorW + 0.18, 0.1, 0.06, M.wood, 0, 2.3, C / 2 + 0.03, g);
    // le battant, ouvert dans la chambre contre le mur
    const leaf = new THREE.Group();
    leaf.position.set(-map.doorW / 2, 0, -C / 2);
    leaf.rotation.y = 1.45 + Math.random() * 0.25;
    box(map.doorW - 0.05, 2.22, 0.05, M.door, (map.doorW - 0.05) / 2, 1.11, 0, leaf);
    box(0.06, 0.06, 0.08, M.brass, map.doorW - 0.18, 1.0, 0, leaf);
    g.add(leaf);
    // la plaque du numéro
    const t = label(128, 64, (c, w, h) => {
      c.fillStyle = '#7a5a26';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e0c27a';
      c.lineWidth = 4;
      c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#f3e2b0';
      c.font = 'bold 40px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(r.num), w / 2, h / 2 + 2);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), baked(new THREE.MeshLambertMaterial({ map: t, emissive: '#6a5230', emissiveMap: t, emissiveIntensity: 0.6 })));
    plate.position.set(map.doorW / 2 + 0.3, 1.55, C / 2 + 0.065);
    g.add(plate);
  }

  // --- 2. Meubles : lit (cadre, matelas, couverture, oreiller, tête de lit), armoire, bureau et lampe ---
  const lampShades = [];
  for (const f of map.furniture) {
    const g = frame(f.x, f.z, f.rot); // +z local : vers la porte (l'avant du meuble)
    const F = FURNITURE[f.kind];
    if (f.kind === 'bed') {
      const W2 = F.hw * 2;
      const L = F.hd * 2;
      box(W2, 0.28, L, M.darkWood, 0, 0.2, 0, g);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, 0.2, 0.08, M.darkWood, sx * (F.hw - 0.05), 0.1, sz * (F.hd - 0.05), g);
      box(W2 - 0.08, 0.16, L - 0.12, M.sheet, 0, 0.42, 0.02, g);
      box(W2 - 0.02, 0.06, L * 0.62, M.blanket, 0, 0.52, L * 0.18, g);
      box(W2 * 0.7, 0.1, 0.35, M.pillow, 0, 0.55, -F.hd + 0.3, g);
      box(W2 + 0.06, 1.15, 0.08, M.wood, 0, 0.58, -F.hd - 0.02, g);
      box(W2 + 0.1, 0.06, 0.12, M.darkWood, 0, 1.18, -F.hd - 0.02, g);
      // dessous du lit : le noir
      box(W2 - 0.1, 0.02, L - 0.1, M.black, 0, 0.07, 0, g);
    } else if (f.kind === 'wardrobe') {
      const W2 = F.hw * 2;
      const D = F.hd * 2;
      box(W2, F.h, D, M.wood, 0, F.h / 2, 0, g);
      box(W2 + 0.06, 0.08, D + 0.06, M.darkWood, 0, F.h + 0.04, 0, g);
      for (const sx of [-1, 1]) {
        box(W2 / 2 - 0.05, F.h - 0.2, 0.03, M.door, sx * (W2 / 4), F.h / 2, D / 2 + 0.015, g);
        box(0.03, 0.14, 0.04, M.brass, sx * 0.07, F.h * 0.55, D / 2 + 0.04, g);
      }
    } else {
      const W2 = F.hw * 2;
      const D = F.hd * 2;
      box(W2, 0.05, D, M.wood, 0, F.h, 0, g);
      for (const sx of [-1, 1]) box(0.08, F.h, D - 0.06, M.darkWood, sx * (F.hw - 0.05), F.h / 2, 0, g);
      // la lampe de chevet
      const l = map.lights.find((q) => q.lamp && Math.hypot(q.x - f.x, q.z - f.z) < 0.1);
      box(0.12, 0.02, 0.12, M.brass, 0.25, F.h + 0.04, 0, g);
      box(0.03, 0.3, 0.03, M.brass, 0.25, F.h + 0.2, 0, g);
      const shadeMat = new THREE.MeshLambertMaterial({ color: '#d8b880', emissive: '#ffb860', emissiveIntensity: 0 });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 12, 1, true), shadeMat);
      shade.position.set(0.25, F.h + 0.4, 0);
      g.add(shade);
      if (l) lampShades.push({ l, mat: shadeMat, k: 1.2 });
    }
  }

  // --- 3. Appliques Art déco du couloir et lustre du hall ---
  for (const l of map.lights) {
    if (l.sconce) {
      const { dx, dz } = l.sconce;
      const g = frame(l.x + dx * 0.2, l.z + dz * 0.2, Math.atan2(-dx, -dz)); // +z local : vers le couloir
      const y = l.fy || 2.0;
      box(0.1, 0.22, 0.04, M.brass, 0, y, 0.02, g);
      const mat = new THREE.MeshLambertMaterial({ color: '#f0d8a8', emissive: '#ffc070', emissiveIntensity: 0 });
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.16, 6, 1, true), mat);
      glass.position.set(0, y + 0.08, 0.1);
      mat.side = THREE.DoubleSide;
      g.add(glass);
      lampShades.push({ l, mat, k: 1.6 });
    }
    // les lustres du hall sont des modèles (Chandelier_01, dans map.props)
  }

  // --- 4. Cadres aux murs du couloir : des portraits sombres et des paysages délavés ---
  let fs = 99;
  const frnd = () => ((fs = (fs * 16807) % 2147483647) / 2147483647);
  const paint = [0, 1, 2, 3].map((k) =>
    label(64, 80, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, ['#2b3a2a', '#3a2a22', '#1e2430', '#40362a'][k]);
      g.addColorStop(1, '#0e0b08');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(200, 180, 140, 0.18)';
      if (k % 2) {
        c.beginPath();
        c.ellipse(w / 2, h * 0.42, 12, 16, 0, 0, Math.PI * 2);
        c.fill();
        c.fillRect(w / 2 - 18, h * 0.6, 36, h * 0.4);
      } else c.fillRect(0, h * 0.62, w, 3);
    }),
  );
  for (const c of map.corridorCells) {
    if (frnd() > 0.22) continue;
    const wall = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dz]) => map.isWall(c.x + dx, c.z + dz) && !map.lights.some((l) => l.sconce && l.gx === c.x && l.gz === c.z));
    if (!wall) continue;
    const [dx, dz] = wall;
    const g = frame((c.x + 0.5 + dx * 0.5) * C - dx * 0.03, (c.z + 0.5 + dz * 0.5) * C - dz * 0.03, Math.atan2(-dx, -dz));
    const w = 0.5 + frnd() * 0.3;
    box(w + 0.08, w * 1.25 + 0.08, 0.04, M.brass, 0, 1.65, 0, g);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.25), baked(new THREE.MeshLambertMaterial({ map: paint[Math.floor(frnd() * 4)] })));
    pic.position.set(0, 1.65, 0.025);
    g.add(pic);
  }

  // --- 5. Le hall : comptoir de la réception, boîtes aux lettres, clavier, porte de l'escalier de secours ---
  const marble = lam({ color: '#d9d2c4' });
  for (const s of map.solids) {
    if (s.reception) {
      // le comptoir : façade à panneaux moulurés côté hall, plateau de marbre, plinthe, sonnette et registre
      box(s.hx * 2, 1.05, s.hz * 2, M.wood, s.x, 0.525, s.z);
      box(s.hx * 2 + 0.12, 0.06, s.hz * 2 + 0.12, marble, s.x, 1.08, s.z);
      box(s.hx * 2 + 0.04, 0.12, s.hz * 2 + 0.04, M.darkWood, s.x, 0.06, s.z);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const z = s.z - s.hz + ((i + 0.5) * s.hz * 2) / n;
        box(0.03, 0.62, (s.hz * 2) / n - 0.22, M.darkWood, s.x - s.hx - 0.015, 0.55, z);
        box(0.035, 0.5, (s.hz * 2) / n - 0.34, M.door, s.x - s.hx - 0.02, 0.55, z);
      }
      box(0.04, 0.1, s.hz * 2 + 0.04, M.brass, s.x - s.hx - 0.02, 0.95, s.z); // la frise de laiton
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
      bell.position.set(s.x - 0.2, 1.11, s.z - 0.4);
      group.add(bell);
      box(0.12, 0.012, 0.012, M.brass, s.x - 0.2, 1.18, s.z - 0.4);
      // le registre ouvert
      for (const sz of [-1, 1]) {
        const page = box(0.26, 0.02, 0.18, M.sheet, s.x - 0.15, 1.12, s.z + 0.95 + sz * 0.1);
        page.rotation.x = sz * 0.06;
      }
      box(0.28, 0.015, 0.4, M.blanket, s.x - 0.15, 1.105, s.z + 0.95);
      // le tableau des clés, au mur de part et d'autre de la vitrine : des casiers, une clé de laiton pendue sous chacun
      for (const side of [-1, 1]) {
        const kz = s.z + side * 1.65;
        const kx = s.x + s.hx + 1.15 - 0.03; // contre le mur est
        box(0.05, 0.9, 0.9, M.darkWood, kx, 1.75, kz);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const y = 2.1 - r * 0.22;
            const z = kz - 0.33 + c * 0.22;
            box(0.02, 0.17, 0.17, M.black, kx - 0.03, y, z);
            if ((r * 4 + c + side) % 3) box(0.01, 0.07, 0.02, M.brass, kx - 0.05, y - 0.11, z);
          }
        }
      }
    } else if (s.banquette) {
      // banquette ronde de velours vert, dossier central, socle de bois et frise de laiton
      const velvet = lam({ color: '#23432f' });
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.25, 0.42, 32), velvet);
      seat.position.set(s.x, 0.26, s.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.26, 0.06, 32), M.darkWood);
      base.position.set(s.x, 0.03, s.z);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 24), velvet);
      back.position.set(s.x, 0.72, s.z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.025, 6, 40), M.brass);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(s.x, 0.47, s.z);
      const tuft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), M.darkWood);
      tuft.position.set(s.x, 0.97, s.z);
      group.add(seat, base, back, rim, tuft);
    } else if (s.column) {
      // colonne de marbre, base et chapiteau de laiton
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, CEIL, 20), marble);
      shaft.position.set(s.x, CEIL / 2, s.z);
      group.add(shaft);
      box(0.72, 0.18, 0.72, M.darkWood, s.x, 0.09, s.z);
      box(0.66, 0.14, 0.66, M.brass, s.x, CEIL - 0.07, s.z);
      box(0.58, 0.05, 0.58, M.brass, s.x, 0.2, s.z);
    } else if (s.cart) {
      // le chariot à bagages : plateau de moquette rouge, deux arceaux de laiton, quatre roues
      box(s.hx * 2, 0.06, s.hz * 2, M.blanket, s.x, 0.29, s.z);
      box(s.hx * 2 + 0.04, 0.04, s.hz * 2 + 0.04, M.brass, s.x, 0.25, s.z);
      for (const sz of [-1, 1]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(s.hx, 0.022, 6, 24, Math.PI), M.brass);
        arch.position.set(s.x, 0.3, s.z + sz * (s.hz - 0.03));
        arch.scale.set(1, 3.4, 1);
        group.add(arch);
      }
      box(0.03, 0.03, s.hz * 2, M.brass, s.x, 0.3 + s.hx * 3.4, s.z);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), M.black);
          w.rotation.z = Math.PI / 2;
          w.position.set(s.x + sx * (s.hx - 0.08), 0.09, s.z + sz * (s.hz - 0.1));
          group.add(w);
        }
      }
    }
  }
  // les tapis : vert bouteille bordé d'or, sous le salon et devant la réception
  const rugTex = label(256, 256, (c, w, h) => {
    c.fillStyle = '#1f3a2c';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b08a3c';
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 3;
    c.strokeRect(34, 34, w - 68, h - 68);
    c.strokeStyle = 'rgba(176, 138, 60, 0.6)';
    c.beginPath();
    c.moveTo(w / 2, 50);
    c.lineTo(w - 50, h / 2);
    c.lineTo(w / 2, h - 50);
    c.lineTo(50, h / 2);
    c.closePath();
    c.stroke();
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  const L = map.lobby;
  for (const [x, z, w, d] of [
    [(L.x0 * C) + 5, (L.z1 + 1) * C - 2.6, 5.4, 3.8],
    [(L.x1 + 1) * C - 3.6, (L.z0 + 3.5) * C, 2.4, 5.4],
  ]) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baked(new THREE.MeshLambertMaterial({ map: rugTex, polygonOffset: true, polygonOffsetFactor: -2 })));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(x, 0.008, z);
    group.add(rug);
  }
  const mb = map.mailbox;
  const mg = frame(mb.x, 0, Math.PI / 2); // +z local : vers l'est (le hall), x local : vers -z monde
  mg.position.z = 0;
  const mbW = mb.z1 - mb.z0;
  // le meuble de casiers (le repère : x local = -z monde)
  const panel = box(mbW + 0.2, mb.y1 - mb.y0 + 0.25, 0.25, M.darkWood, -(mb.z0 + mb.z1) / 2, (mb.y0 + mb.y1) / 2, 0.125, mg);
  panel.userData.mail = true;
  const slots = [];
  for (const b of mb.boxes) {
    const t = label(96, 64, (c, w, h) => {
      c.fillStyle = '#5a3a1c';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c9a050';
      c.lineWidth = 3;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#111';
      c.fillRect(14, 10, w - 28, 8);
      c.fillStyle = '#e8cf8a';
      c.font = 'bold 22px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(String(b.num), w / 2, 48);
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), baked(new THREE.MeshLambertMaterial({ map: t, emissive: '#5a4020', emissiveMap: t, emissiveIntensity: 0.5 })));
    face.position.set(-b.z, b.y, 0.252);
    mg.add(face);
    // la lettre postée dépasse du casier
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), new THREE.MeshLambertMaterial({ color: '#efe6d2', emissive: '#ffffff', emissiveIntensity: 0.3 }));
    paper.position.set(-b.z, b.y + 0.17, 0.262);
    paper.visible = false;
    mg.add(paper);
    slots.push({ b, paper, char: '' });
  }
  // le clavier à code, à côté de la porte de secours
  const kp = map.keypad;
  const kg = frame(kp.x, kp.z, kp.rot);
  box(0.2, 0.3, 0.05, M.metal, 0, kp.y, 0.025, kg);
  const kscreenMat = new THREE.MeshBasicMaterial({ color: '#1e3a20' });
  box(0.14, 0.05, 0.01, kscreenMat, 0, kp.y + 0.09, 0.055, kg);
  for (let i = 0; i < 12; i++) box(0.035, 0.03, 0.012, M.sheet, ((i % 3) - 1) * 0.05, kp.y + 0.02 - Math.floor(i / 3) * 0.045, 0.055, kg);
  // la porte de secours : cadre, battant métallique peint, panneau EXIT, cage d'escalier sombre derrière
  const E = map.elevator;
  const eg = frame(E.x - E.dx * (C / 2), E.z - E.dz * (C / 2), Math.atan2(E.dx, E.dz)); // +z local : vers la cage
  const DW = 1.2;
  const DH = 2.2;
  const side = (C - DW) / 2;
  const wallMat = M.darkWood;
  box(side, CEIL, 0.12, wallMat, -(DW / 2 + side / 2), CEIL / 2, 0.06, eg);
  box(side, CEIL, 0.12, wallMat, DW / 2 + side / 2, CEIL / 2, 0.06, eg);
  box(DW, CEIL - DH, 0.12, wallMat, 0, DH + (CEIL - DH) / 2, 0.06, eg);
  const stair = new THREE.Mesh(new THREE.BoxGeometry(C - 0.1, CEIL, C - 0.2), M.stair);
  stair.position.set(0, CEIL / 2, C / 2 + 0.05);
  eg.add(stair);
  const hinge = new THREE.Group();
  hinge.position.set(-DW / 2, 0, 0.1);
  eg.add(hinge);
  box(DW - 0.04, DH - 0.04, 0.06, M.fire, (DW - 0.04) / 2, DH / 2, 0, hinge);
  box(DW * 0.7, 0.05, 0.08, M.metal, DW / 2, 1.05, -0.05, hinge); // la barre anti-panique
  const exitSign = label(128, 48, (c, w, h) => {
    c.fillStyle = '#0d3a14';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7dff8a';
    c.font = 'bold 34px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EXIT', w / 2, h / 2 + 1);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: exitSign }));
  sign.position.set(0, DH + 0.25, -0.01);
  sign.rotation.y = Math.PI;
  eg.add(sign);
  let doorOpen = 0;

  // --- 6. Le code au plafond du hall ---
  const codeTex = label(512, 192, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(20, 40, 60, 0.45)');
    g.addColorStop(1, 'rgba(20, 40, 60, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2fbff';
    c.shadowColor = '#5fd0ff';
    c.shadowBlur = 24;
    c.font = 'bold 130px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(map.code.split('').join(' '), w / 2, h / 2 + 6);
  });
  const codeMat = new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const codePlane = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.9), codeMat);
  codePlane.rotation.x = Math.PI / 2;
  // lisible en levant les yeux, face au nord (depuis le fond du hall)
  codePlane.position.set(map.lobbyCenter.x, CEIL - 0.02, map.lobbyCenter.z);
  group.add(codePlane);
  let codeK = 0;

  // --- 7. Les lettres sur papier : une feuille pliée, la lettre et le numéro de la chambre ---
  const papers = map.letters.map((L) => {
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.22 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = L.rot;
    m.position.set(L.x, L.y + 0.004, L.z);
    group.add(m);
    return { L, m, mat, char: null };
  });
  const paperTex = (ch, num) =>
    label(128, 96, (c, w, h) => {
      c.fillStyle = '#efe6d2';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120, 100, 70, 0.35)';
      c.beginPath();
      c.moveTo(w / 2, 0);
      c.lineTo(w / 2, h);
      c.stroke();
      c.fillStyle = '#2a1a10';
      c.font = 'bold 64px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(ch, w / 2, h / 2 - 4);
      c.font = '14px Georgia, serif';
      c.fillText(`ROOM ${num}`, w / 2, h - 12);
    });

  let flickT = 0;
  return {
    update(sim, P, time, dt) {
      // les lettres, une fois le mot connu (l'hôte l'envoie à ses invités)
      for (const p of papers) {
        const ch = sim.word[p.L.idx] || '?';
        if (p.char !== ch) {
          p.char = ch;
          if (p.mat.map) p.mat.map.dispose();
          p.mat.map = paperTex(ch, p.L.num);
          p.mat.emissiveMap = p.mat.map;
          p.mat.needsUpdate = true;
        }
        p.m.visible = !p.L.taken;
      }
      for (const s of slots) {
        const L = s.b.letter >= 0 ? map.letters[s.b.letter] : null;
        const show = !!(L && L.posted);
        s.paper.visible = show;
        const ch = L ? sim.word[L.idx] || '?' : '';
        if (show && s.char !== ch) {
          s.char = ch;
          s.paper.material.map = label(64, 48, (c, w, h) => {
            c.fillStyle = '#efe6d2';
            c.fillRect(0, 0, w, h);
            c.fillStyle = '#2a1a10';
            c.font = 'bold 36px Georgia, serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(ch, w / 2, h / 2 + 2);
          });
          s.paper.material.emissiveMap = s.paper.material.map;
          s.paper.material.needsUpdate = true;
        }
      }
      // les appliques et les lampes : allumées, mortes, ou qui grésillent
      flickT += dt;
      const tick = Math.floor(flickT * 12);
      for (const s of lampShades) {
        let on = s.l.state === 'on' ? 1 : 0;
        if (s.l.state === 'flicker') on = Math.sin(tick * 12.9898 + s.l.x * 78.233) * 43758.5453 % 1 > -0.2 ? 0.9 : 0.1;
        if (sim.blackout > 0) on = 0;
        s.mat.emissiveIntensity = on * s.k;
      }
      // le code au plafond, quand les 6 lettres sont postées : il s'allume en grésillant
      codeK = Math.min(1, codeK + (sim.codeShown ? dt * 0.4 : -dt));
      codeMat.opacity = Math.max(0, codeK) * (0.75 + Math.random() * 0.25);
      codePlane.visible = codeK > 0;
      kscreenMat.color.set(sim.open ? '#3cff6a' : sim.codeShown ? '#c9ff9a' : '#1e3a20');
      // la porte de secours s'ouvre quand le bon code est tapé
      const want = sim.open ? 1 : 0;
      doorOpen += Math.sign(want - doorOpen) * Math.min(Math.abs(want - doorOpen), dt / 1.4);
      hinge.rotation.y = -doorOpen * 1.6;
    },
  };
}
