// The Backrooms (Level 1) - Le matériel du jeu qui bouge : les rideaux des quais du mur coupe-feu (ils montent,
// redescendent, se cabossent et cèdent sous les coups de l'entité), les cloches d'alarme incendie et leurs flashs, les
// grilles des bouches de gaine (elles tombent quand l'entité passe), la pièce du poste de garde (cloisons de
// parpaings, huisserie d'acier, la porte qui s'ouvre devant qui arrive), ses écrans et la diode rouge de la caméra
// regardée. Rideaux et grilles sont des modèles Poly Haven (CC0) de backrooms/models/, déjà dans le décor.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { CELL_SIZE } from '../engine/map.js';
import { DOCK_H, DUCT_LOW, GUARD_T } from '../engine/level1.js';
import { loadKit } from './kit.js';

const C = CELL_SIZE;
const RK = 'modular_airduct_rectangular_01';

function canvasTex(w, h, draw, repeat = false) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// le battant de la porte du poste : de la tôle peinte gris-vert au rouleau (des traînées verticales à peine visibles),
// usée autour de la poignée et au pied, la plaque de propreté d'inox brossé en bas ; u : la largeur, v : la hauteur
const doorTex = () =>
  canvasTex(256, 512, (g, w, h) => {
    let sd = 7;
    const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#6f7a72';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + r() * 0.02})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 30 + r() * 160);
    }
    // la crasse : plus sombre en bas (les coups de pied, l'eau du sol), des mains autour de la poignée (des deux côtés)
    const foot = g.createLinearGradient(0, h, 0, h * 0.72);
    foot.addColorStop(0, 'rgba(40,34,24,0.45)');
    foot.addColorStop(1, 'rgba(40,34,24,0)');
    g.fillStyle = foot;
    g.fillRect(0, h * 0.72, w, h * 0.28);
    for (const x of [w * 0.12, w * 0.88]) {
      const hand = g.createRadialGradient(x, h * 0.5, 2, x, h * 0.5, 46);
      hand.addColorStop(0, 'rgba(30,26,20,0.32)');
      hand.addColorStop(1, 'rgba(30,26,20,0)');
      g.fillStyle = hand;
      g.fillRect(x - 50, h * 0.5 - 50, 100, 100);
    }
    // des éraflures jusqu'au métal, des éclats de peinture
    for (let i = 0; i < 70; i++) {
      const x = r() * w;
      const y = h * (0.45 + r() * 0.5);
      g.strokeStyle = `rgba(${150 + r() * 40},${150 + r() * 40},${145 + r() * 40},${0.18 + r() * 0.3})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 6);
      g.stroke();
    }
    // la plaque de propreté (25 cm sur 2,07 m), vissée
    const ky = h * (1 - 0.25 / 2.07);
    const kick = g.createLinearGradient(0, ky, 0, h);
    kick.addColorStop(0, '#a7aaa6');
    kick.addColorStop(1, '#8a8c88');
    g.fillStyle = kick;
    g.fillRect(4, ky, w - 8, h - ky - 3);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`;
      g.fillRect(4 + r() * (w - 8), ky + r() * (h - ky), 20 + r() * 60, 1);
    }
    g.fillStyle = 'rgba(30,30,28,0.5)';
    g.fillRect(4, ky, w - 8, 1.5);
    for (const x of [12, w / 2, w - 12]) {
      g.beginPath();
      g.arc(x, ky + 7, 2, 0, Math.PI * 2);
      g.fill();
    }
  });

// la plaque vissée sur la porte, côté entrepôt
const securitySign = () =>
  canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#e9e4d6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d4f9a';
    g.fillRect(0, 0, w, 58);
    g.fillStyle = '#f4f1e8';
    g.font = 'bold 40px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SECURITY', w / 2, 31);
    g.fillStyle = '#1d1d1b';
    g.font = 'bold 21px Arial, sans-serif';
    g.fillText('AUTHORIZED', w / 2, 86);
    g.fillText('PERSONNEL ONLY', w / 2, 114);
    g.font = '14px Arial, sans-serif';
    g.fillText('KEEP DOOR CLOSED', w / 2, 142);
    // l'usure : des coulures, les coins jaunis
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(110,90,40,${0.03 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 14, 2 + Math.random() * 30);
    }
    g.strokeStyle = 'rgba(40,40,40,0.6)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });

// un disque doux (nuage de poussière)
const softDisc = () =>
  canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });

// des bandes jaunes et noires en biais (le bas des quais)
const hazardTex = () =>
  canvasTex(
    128,
    32,
    (g, w, h) => {
      g.fillStyle = '#d8a514';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16140f';
      for (let x = -h; x < w + h; x += 32) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 16, h);
        g.lineTo(x + 16 + h, 0);
        g.lineTo(x + h, 0);
        g.fill();
      }
      // usé : la peinture part par plaques
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,36,30' : '120,110,90'},${0.15 + Math.random() * 0.3})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 1 + Math.random() * 3);
      }
    },
    true,
  );

// Le tablier d'un rideau de quai : des lames de tôle galvanisée de 10 cm (le haut de chaque lame accroche la lumière,
// la rainure dessous reste noire), salies par le bas, piquées de rouille, rayées ; le relief (bump) a les mêmes lames.
// Une toile couvre une case de large (2,5 m) et toute la hauteur de la baie (30 lames)
function shutterTex() {
  const W = 512;
  const H = 1024;
  const N = 30;
  const lh = H / N;
  const color = canvasTex(W, H, (g) => {
    for (let k = 0; k < N; k++) {
      const y = k * lh;
      const gr = g.createLinearGradient(0, y, 0, y + lh);
      gr.addColorStop(0, '#2a2e31');
      gr.addColorStop(0.08, '#b9c0c4');
      gr.addColorStop(0.22, '#a3aaaf');
      gr.addColorStop(0.62, '#7d858a');
      gr.addColorStop(0.86, '#565d62');
      gr.addColorStop(0.94, '#2c3134');
      gr.addColorStop(1, '#16191b');
      g.fillStyle = gr;
      g.fillRect(0, y, W, lh);
    }
    // grain du métal
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // coulures de crasse depuis le haut, salissures du bas (les roues des transpalettes, l'eau du sol)
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * W;
      const len = 80 + Math.random() * 500;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(48, 38, 26, ${0.12 + Math.random() * 0.18})`);
      gr.addColorStop(1, 'rgba(48, 38, 26, 0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, 2 + Math.random() * 7, len);
    }
    const low = g.createLinearGradient(0, H * 0.72, 0, H);
    low.addColorStop(0, 'rgba(36, 30, 22, 0)');
    low.addColorStop(1, 'rgba(36, 30, 22, 0.55)');
    g.fillStyle = low;
    g.fillRect(0, H * 0.72, W, H * 0.28);
    // rouille : en grappes, surtout en bas et le long des rainures
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W;
      const y = H * (0.45 + Math.random() * 0.55);
      const r = 6 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120, 58, 22, 0.75)');
      gr.addColorStop(0.6, 'rgba(98, 50, 24, 0.35)');
      gr.addColorStop(1, 'rgba(98, 50, 24, 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r * 0.5, r * 2, r);
    }
    // rayures et chocs (les fourches des chariots)
    g.strokeStyle = 'rgba(215, 222, 226, 0.35)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * W;
      const y = H * (0.5 + Math.random() * 0.5);
      g.lineWidth = 0.6 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 14);
      g.stroke();
    }
    // le pochoir « KEEP CLEAR » sur la case de gauche, un peu effacé
    g.font = 'bold 64px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(214, 170, 30, 0.6)';
    g.fillText('KEEP', W * 0.5, H * 0.56);
    g.fillText('CLEAR', W * 0.5, H * 0.63);
  }, true);
  const bump = canvasTex(64, H, (g) => {
    for (let k = 0; k < N; k++) {
      const y = k * lh;
      const gr = g.createLinearGradient(0, y, 0, y + lh);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.1, '#fff');
      gr.addColorStop(0.5, '#c8c8c8');
      gr.addColorStop(0.9, '#6a6a6a');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.fillRect(0, y, 64, lh);
    }
  }, true);
  bump.colorSpace = THREE.NoColorSpace;
  return { color, bump };
}

// la plaque peinte au-dessus d'un quai
const dockSign = (n) =>
  canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#1b1a17';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8a514';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 56px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e9e3d2';
    g.fillText(`DOCK ${n}`, w / 2, h / 2 + 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.6})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 1 + Math.random() * 2);
    }
  });

// la vitre étoilée d'un déclencheur brisé
const crackTex = () =>
  canvasTex(64, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(235, 240, 245, 0.85)';
    g.lineWidth = 1.4;
    const cx = w * 0.45;
    const cy = h * 0.5;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      g.beginPath();
      g.moveTo(cx, cy);
      let x = cx;
      let y = cy;
      for (let s = 0; s < 4; s++) {
        x += Math.cos(a + (Math.random() - 0.5) * 0.6) * 12;
        y += Math.sin(a + (Math.random() - 0.5) * 0.6) * 12;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(10, 10, 10, 0.75)';
    g.beginPath();
    g.arc(cx, cy, 7, 0, Math.PI * 2);
    g.fill();
  });

export function buildGear({ map, group, baked, wallMat, CEIL }) {
  const disc = softDisc();
  const hazard = hazardTex();
  const slats = (map.docks || []).length ? shutterTex() : null;
  const lambert = (o) => baked(new THREE.MeshLambertMaterial(o));
  // les matières des modèles, éclairées comme le reste de l'entrepôt
  const kitMats = new Map();
  const kitMat = (src) => {
    if (!kitMats.has(src)) kitMats.set(src, lambert({ map: src.map || null, color: src.color ? src.color.clone().multiplyScalar(0.85) : '#888888', side: src.side }));
    return kitMats.get(src);
  };
  // un morceau de modèle dans un groupe (le repère du groupe est celui du morceau)
  const piece = (kit, name, parent) =>
    loadKit(kit).then((pieces) => {
      for (const p of pieces.get(name) || []) {
        const m = new THREE.Mesh(p.geo, kitMat(p.mat));
        m.matrixAutoUpdate = false;
        m.matrix.copy(p.m);
        parent.add(m);
      }
    });

  // ---------------------------------------------------------------- Les quais
  const dockSt = [];
  for (const d of map.docks || []) {
    // repère du quai : x le long de la baie, z en travers du mur (la normale)
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.vert ? Math.PI / 2 : 0;
    group.add(g);
    // le linteau de béton au-dessus de la baie (la texture des murs, à la même échelle)
    const lh = CEIL - DOCK_H;
    const lg = new THREE.BoxGeometry(2 * C, lh, C);
    {
      const pos = lg.attributes.position;
      const nor = lg.attributes.normal;
      const uv = lg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = DOCK_H + lh / 2 + pos.getY(i);
        const z = pos.getZ(i);
        if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / C, z / C);
        else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / C + 0.5, y / CEIL);
        else uv.setXY(i, x / C + 1, y / CEIL);
      }
    }
    const lintel = new THREE.Mesh(lg, wallMat);
    lintel.position.y = DOCK_H + lh / 2;
    g.add(lintel);
    // de chaque côté : la bande jaune et noire au bas du linteau, la plaque « DOCK n », le gyrophare
    const stripeMat = lambert({ map: hazard });
    const signMat = lambert({ map: dockSign(d.id + 1) });
    const beacons = [];
    for (const s of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2 * C, 0.2), stripeMat);
      stripe.material.map.repeat.set(10, 1);
      stripe.position.set(0, DOCK_H + 0.1, s * (C / 2 + 0.004));
      stripe.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(stripe);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.43), signMat);
      sign.position.set(-s * 0.55, DOCK_H + 0.62, s * (C / 2 + 0.006));
      sign.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sign);
      // le gyrophare orange : un dôme sur son socle, au coin du linteau
      const bx = s * (C - 0.32);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 14), lambert({ color: '#2a2724' }));
      base.position.set(bx, DOCK_H + 0.27, s * (C / 2 + 0.07));
      const domeMat = new THREE.MeshBasicMaterial({ color: '#5a2a08' });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      dome.position.set(bx, DOCK_H + 0.295, s * (C / 2 + 0.07));
      // (pas de disque d'éblouissement collé devant : le dôme lui-même devient plus lumineux que ce que l'écran peut
      // montrer, et c'est le caméscope qui en fait le halo ; la lumière dans l'air, c'est la poussière qui la renvoie)
      g.add(base, dome);
      // sa place dans le monde (le quai est tourné d'un quart de tour quand il est dans un mur nord-sud)
      const ry = d.vert ? Math.PI / 2 : 0;
      const lz = s * (C / 2 + 0.12);
      beacons.push({ domeMat, x: d.x + bx * Math.cos(ry) + lz * Math.sin(ry), y: DOCK_H + 0.31, z: d.z - bx * Math.sin(ry) + lz * Math.cos(ry), ph: s > 0 ? 0 : 2.1, k: 0, a: 0 });
    }
    // les bandes au sol, sous le rideau
    const floorStripe = new THREE.Mesh(new THREE.PlaneGeometry(2 * C, 0.36), lambert({ map: hazard, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    floorStripe.material.map = floorStripe.material.map.clone();
    floorStripe.material.map.needsUpdate = true;
    floorStripe.material.map.repeat.set(10, 1);
    floorStripe.rotation.x = -Math.PI / 2;
    floorStripe.position.y = 0.004;
    g.add(floorStripe);
    // le rideau : un tablier de lames de tôle d'une joue à l'autre, qui monte dans le linteau, sa lame finale (une
    // cornière lestée et son joint de caoutchouc) et ses poignées ; les deux glissières restent sur les joues
    const sh = new THREE.Group();
    g.add(sh);
    const leaf = new THREE.Group();
    sh.add(leaf);
    const slatMap = slats.color.clone();
    slatMap.needsUpdate = true;
    slatMap.repeat.set(2, 1);
    slatMap.offset.set(d.id * 0.37, 0);
    const slatBump = slats.bump.clone();
    slatBump.needsUpdate = true;
    const panelMat = lambert({ map: slatMap, bumpMap: slatBump, bumpScale: 2.2 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2 * C + 0.06, DOCK_H, 0.05), panelMat);
    panel.position.y = DOCK_H / 2 + 0.07;
    const steel = lambert({ color: '#3d4246' });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * C + 0.06, 0.09, 0.1), steel);
    bar.position.y = 0.07;
    const seal = new THREE.Mesh(new THREE.BoxGeometry(2 * C + 0.04, 0.03, 0.06), lambert({ color: '#111111' }));
    seal.position.y = 0.015;
    leaf.add(panel, bar, seal);
    for (const s of [-1, 1]) for (const x of [-0.7, 0.7]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04), steel);
      handle.position.set(x, 0.42, s * 0.05);
      leaf.add(handle);
    }
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, DOCK_H, 0.16), steel);
      rail.position.set(s * (C - 0.045), DOCK_H / 2, 0);
      g.add(rail);
    }
    const leaves = [leaf];
    // les boîtiers de commande, sur les joues de la baie (jaunes, deux boutons, un voyant)
    const lamps = [];
    for (const b of d.btn) {
      const box = new THREE.Group();
      box.position.set(b.x + b.nx * 0.036, 1.3, b.z + b.nz * 0.036);
      box.rotation.y = Math.atan2(b.nx, b.nz);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.27, 0.07), lambert({ color: '#c9971c' }));
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.024, 14).rotateX(Math.PI / 2), lambert({ color: '#2f8a3a', emissive: '#0d3013', emissiveIntensity: 0.6 }));
      up.position.set(0, 0.055, 0.042);
      const down = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.024, 14).rotateX(Math.PI / 2), lambert({ color: '#a8231c', emissive: '#3a0a07', emissiveIntensity: 0.6 }));
      down.position.set(0, -0.03, 0.042);
      const lampMat = new THREE.MeshBasicMaterial({ color: '#3a2a0c' });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 6), lampMat);
      lamp.position.set(0, 0.112, 0.036);
      box.add(shell, up, down, lamp);
      group.add(box);
      lamps.push(lampMat);
    }
    dockSt.push({ d, sh, leaves, beacons, lamps, o: d.o, shake: 0 });
  }

  // ---------------------------------------------------------------- Les cloches d'alarme
  const crack = crackTex();
  const alarmSt = [];
  for (const a of map.alarms || []) {
    // au-dessus du déclencheur (posé par le décor à 58 cm du milieu du poste d'incendie, le long du mur)
    const tx = -a.nz * 0.58;
    const tz = -a.nx * 0.58;
    const g = new THREE.Group();
    g.position.set(a.x + tx + a.nx * 0.004, 0, a.z + tz + a.nz * 0.004);
    g.rotation.y = Math.atan2(a.nx, a.nz); // z : hors du mur
    group.add(g);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20).rotateX(Math.PI / 2), lambert({ color: '#7a1712' }));
    plate.position.set(0, 2.3, 0.015);
    // le dôme de la sirène : un verre rouge avec sa lampe dedans, qui s'allume en alternance avec le flash (deux
    // voyants côte à côte : on s'attend à voir les deux s'allumer)
    const bellMat = lambert({ color: '#b3231b', emissive: '#ff0804', emissiveIntensity: 0.04 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), bellMat);
    dome.position.set(0, 2.3, 0.03);
    const striker = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), lambert({ color: '#3a3632' }));
    striker.position.set(0, 2.16, 0.05);
    // le flash : un pavé de plexiglas à côté de la cloche
    const flashMat = new THREE.MeshBasicMaterial({ color: '#4a1d1a' });
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), flashMat);
    flash.position.set(0.27, 2.3, 0.025);
    // (allumé, le plexiglas brille bien au-delà du blanc : le halo vient du caméscope, la lumière de lights)
    // la vitre brisée du déclencheur (à 1,45 m, sur sa face avant)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.15), new THREE.MeshBasicMaterial({ map: crack, transparent: true, depthWrite: false }));
    glass.position.set(0, 1.443, 0.042);
    glass.visible = false;
    g.add(plate, dome, striker, flash, glass);
    // le flash, dans le monde (x local : le long du mur ; z local : hors du mur)
    const fx = g.position.x + 0.27 * a.nz + 0.14 * a.nx;
    const fz = g.position.z - 0.27 * a.nx + 0.14 * a.nz;
    alarmSt.push({ a, dome, bellMat, flashMat, glass, dent: false, fx, fz, bx: g.position.x + 0.16 * a.nx, bz: g.position.z + 0.16 * a.nz, on: 0, on2: 0 });
  }

  // ---------------------------------------------------------------- Les bouches de gaine
  const ventSt = [];
  const holeMat = new THREE.MeshBasicMaterial({ color: '#030303' });
  const dustMat = new THREE.SpriteMaterial({ map: disc, color: '#8d877a', transparent: true, opacity: 0, depthWrite: false });
  for (const v of map.ducts ? map.ducts.vents : []) {
    const grille = new THREE.Group();
    group.add(grille);
    piece(RK, RK + '_vent_01', grille);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(v.x, DUCT_LOW - 0.003, v.z);
    hole.visible = false;
    group.add(hole);
    // là où la grille finit, par terre (toujours au même endroit pour tout le monde)
    const k = Math.sin(v.id * 12.9898 + v.x * 0.37) * 43758.5453;
    const r = k - Math.floor(k);
    const rest = { x: v.x + (r - 0.5) * 0.9, z: v.z + 0.35 + r * 0.4, ry: r * Math.PI * 2 };
    const st = { v, grille, hole, rest, mode: 'shut', t: 0, dust: null };
    const shut = () => {
      grille.position.set(v.x, DUCT_LOW + 0.03, v.z);
      grille.rotation.set(Math.PI / 2, 0, 0, 'YXZ');
    };
    st.shut = shut;
    shut();
    ventSt.push(st);
  }
  const lieDown = (st) => {
    st.grille.position.set(st.rest.x, -0.022, st.rest.z);
    st.grille.rotation.set(-Math.PI / 2, st.rest.ry, 0, 'YXZ');
  };

  // ---------------------------------------------------------------- Les écrans du poste et les caméras
  const cams = map.cams || [];
  const screens = [];
  // La dalle du téléviseur (Television_01, mesurée sur le modèle, une fois recentré et mis à 46 cm de haut comme dans
  // la scène) : à gauche des boutons, 30,1 × 29,2 cm, son centre à 6,6 cm à gauche du milieu et à 26,1 cm du bas ; le
  // verre est bombé, son bord à 19,3 cm devant le centre du poste et son milieu 2,3 cm plus en avant. L'image épouse
  // ce bombé, à 2 mm devant le verre
  const SCR = { x: -0.066, y: 0.261, w: 0.301, h: 0.292, z: 0.1953, bulge: 0.0232 };
  const screenGeo = new THREE.PlaneGeometry(SCR.w, SCR.h, 12, 12);
  {
    const pp = screenGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const ux = (2 * pp.getX(i)) / SCR.w;
      const uy = (2 * pp.getY(i)) / SCR.h;
      pp.setZ(i, SCR.bulge * (1 - ux * ux) * (1 - uy * uy));
    }
    screenGeo.computeVertexNormals();
  }
  for (const p of map.props || []) {
    if (p.screen === undefined) continue;
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 155; // (la dalle est presque carrée)
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex, color: '#d8dcd0' }));
    // dans le repère du téléviseur (sa face avant regarde +z), tourné comme lui
    const c = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    mesh.position.set(p.x + SCR.x * c + SCR.z * sn, (p.y || 0) + SCR.y, p.z - SCR.x * sn + SCR.z * c);
    mesh.rotation.y = p.rot;
    group.add(mesh);
    const nx = sn;
    const nz = c;
    screens.push({ i: p.screen, cv, ctx: cv.getContext('2d'), tex, mesh, nx, nz, lx: mesh.position.x + nx * 0.12, ly: mesh.position.y, lz: mesh.position.z + nz * 0.12, glow: 0.5 });
  }
  // la diode rouge des caméras : elle s'allume sur celle qu'un gardien regarde
  const tally = cams.map((c) => {
    const g = new THREE.Group();
    g.position.set(c.x, c.y - 0.2, c.z);
    g.rotation.y = c.yaw + Math.PI;
    g.scale.setScalar(1.1);
    // (une diode vive : plus lumineuse que le blanc de l'écran, elle fait son petit halo dans le caméscope)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(6) }));
    led.position.set(0.055, 0.215, 0.17);
    g.add(led);
    g.visible = false;
    group.add(g);
    return g;
  });


  // ---------------------------------------------------------------- La pièce du poste de garde
  // Les cloisons (parpaings peints, la texture des murs calée sur le monde, une rangée de blocs à la même hauteur que
  // sur les murs), l'imposte au-dessus de la baie, l'huisserie d'acier et la porte, qui pivote vers l'intérieur
  const gd = map.guardDoor;
  let doorK = 0; // 0 : fermée, 1 : grande ouverte
  let doorPivot = null;
  let doorSign = 1; // le sens où elle s'ouvre
  let doorBase = 0;
  if (gd && map.segs && map.segs.length) {
    const pos = [];
    const nor = [];
    const uvs = [];
    // une boîte (x0..x1, y0..y1, z0..z1) : ses faces, la texture des murs à l'échelle du monde (u le long, v en hauteur)
    const box = (x0, x1, y0, y1, z0, z1) => {
      const quad = (a, b, c, d, n, uv) => {
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let k = 0; k < 6; k++) nor.push(...n);
        const [ua, ub, uc, ud] = uv;
        uvs.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
      };
      const v = (y) => y / CEIL;
      // +z, -z
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / C, v(y0)], [x1 / C, v(y0)], [x1 / C, v(y1)], [x0 / C, v(y1)]]);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 / C, v(y0)], [-x0 / C, v(y0)], [-x0 / C, v(y1)], [-x1 / C, v(y1)]]);
      // +x, -x
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 / C, v(y0)], [-z0 / C, v(y0)], [-z0 / C, v(y1)], [-z1 / C, v(y1)]]);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / C, v(y0)], [z1 / C, v(y0)], [z1 / C, v(y1)], [z0 / C, v(y1)]]);
      // le dessous (l'imposte)
      if (y0 > 0.01) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 / C, z0 / C], [x1 / C, z0 / C], [x1 / C, z1 / C], [x0 / C, z1 / C]]);
    };
    const hT = GUARD_T / 2;
    const jamb = (x, z) => Math.abs(x - gd.x) + Math.abs(z - gd.z) < gd.w / 2 + 1e-4 && (gd.nx ? Math.abs(x - gd.x) < 1e-4 : Math.abs(z - gd.z) < 1e-4);
    for (const sg of map.segs) {
      const alongX = Math.abs(sg.z0 - sg.z1) < 1e-6;
      if (alongX) {
        const a0 = Math.min(sg.x0, sg.x1);
        const a1 = Math.max(sg.x0, sg.x1);
        // les cloisons le long de x couvrent les angles (celles le long de z s'y arrêtent) : pas de jour dans un coin
        box(a0 - (jamb(a0, sg.z0) ? 0 : hT), a1 + (jamb(a1, sg.z0) ? 0 : hT), 0, CEIL, sg.z0 - hT, sg.z0 + hT);
      } else {
        box(sg.x0 - hT, sg.x0 + hT, 0, CEIL, Math.min(sg.z0, sg.z1), Math.max(sg.z0, sg.z1));
      }
    }
    // l'imposte
    const gh = gd.w / 2;
    if (gd.nx) box(gd.x - hT, gd.x + hT, gd.h, CEIL, gd.z - gh, gd.z + gh);
    else box(gd.x - gh, gd.x + gh, gd.h, CEIL, gd.z - hT, gd.z + hT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, wallMat));

    // repère de la porte : x le long de la baie, z vers le dehors (la normale de la porte)
    const g = new THREE.Group();
    g.position.set(gd.x, 0, gd.z);
    g.rotation.y = Math.atan2(gd.nx, gd.nz);
    group.add(g);
    // l'huisserie : deux montants et la traverse, en acier peint, qui débordent un peu des deux faces
    const frameMat = lambert({ color: '#4c524d' });
    const FD = GUARD_T + 0.03;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, gd.h + 0.06, FD), frameMat);
      m.position.set(sx * (gh - 0.015), (gd.h + 0.06) / 2, 0);
      g.add(m);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(gd.w + 0.15, 0.09, FD), frameMat);
    head.position.set(0, gd.h + 0.015, 0);
    g.add(head);
    // le battant : sur ses gonds, côté pièce ; s'ouvre vers l'intérieur (z < 0 dans le repère de la porte)
    const LW = gd.w - 0.08;
    const LH = gd.h - 0.035;
    const LT = 0.045;
    // le gond : du côté le plus près du coin de la pièce (le battant ouvert se range le long de la cloison)
    const R = map.post.room;
    const ax = gd.nx ? 0 : 1; // le long de la baie, en x du monde ?
    const mid = ax ? (R.x0 + R.x1) / 2 : (R.z0 + R.z1) / 2;
    const along = ax ? gd.x : gd.z;
    // (le repère tourne de atan2(nx, nz) : son x local va vers (nz, -nx) dans le monde)
    const lx = ax ? gd.nz : -gd.nx; // l'x local, projeté sur l'axe de la baie
    const hingeS = Math.sign((along > mid ? 1 : -1) * lx) || 1;
    doorPivot = new THREE.Group();
    doorPivot.position.set(hingeS * (gh - 0.06), 0, -(hT - 0.035));
    g.add(doorPivot);
    const leafMat = lambert({ map: doorTex() });
    const edgeMat = lambert({ color: '#5d665f' });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(LW, LH, LT), [edgeMat, edgeMat, edgeMat, edgeMat, leafMat, leafMat]);
    leaf.position.set(-hingeS * (LW / 2), LH / 2 + 0.008, 0);
    doorPivot.add(leaf);
    // la plaque, côté entrepôt
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.21), lambert({ map: securitySign() }));
    sign.position.set(-hingeS * (LW / 2), 1.55, LT / 2 + 0.002);
    doorPivot.add(sign);
    // la béquille, des deux côtés, du côté libre ; la serrure
    const steel = lambert({ color: '#b4b6b1' });
    for (const sz of [1, -1]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), steel);
      rose.rotation.x = Math.PI / 2;
      rose.position.set(-hingeS * (LW - 0.075), 1.02, sz * (LT / 2 + 0.006));
      doorPivot.add(rose);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.018), steel);
      lever.position.set(-hingeS * (LW - 0.075 - 0.055), 1.02, sz * (LT / 2 + 0.045));
      doorPivot.add(lever);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8), steel);
      stem.rotation.x = Math.PI / 2;
      stem.position.set(-hingeS * (LW - 0.075), 1.02, sz * (LT / 2 + 0.025));
      doorPivot.add(stem);
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 12), steel);
      lock.rotation.x = Math.PI / 2;
      lock.position.set(-hingeS * (LW - 0.075), 0.86, sz * (LT / 2 + 0.005));
      doorPivot.add(lock);
    }
    // le ferme-porte, côté pièce, en haut près des gonds
    const closer = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.05), lambert({ color: '#3e3f3d' }));
    closer.position.set(-hingeS * 0.24, LH - 0.07, -(LT / 2 + 0.025));
    doorPivot.add(closer);
    // trois paumelles
    for (const y of [0.25, LH / 2 + 0.1, LH - 0.25]) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8), steel);
      k.position.set(hingeS * 0.004, y, -LT / 2);
      doorPivot.add(k);
    }
    // elle s'ouvre vers l'intérieur (-z local) : le côté libre (x = -hingeS·LW) part vers -z
    doorSign = hingeS;
    doorBase = 0;
  }

  let screenT = 0;
  const drawScreen = (s, cam, live, time) => {
    const g = s.ctx;
    const W = s.cv.width;
    const H = s.cv.height;
    // une image grise et granuleuse : le dessin d'une allée vue d'en haut (sol, deux rayonnages, le fond noir)
    const n = (cam ? cam.id : 0) + 1;
    g.fillStyle = '#1d211d';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2f342e';
    g.beginPath();
    g.moveTo(W * 0.5 - 8, H * 0.38);
    g.lineTo(W * 0.5 + 8, H * 0.38);
    g.lineTo(W * (0.86 + 0.02 * (n % 3)), H);
    g.lineTo(W * (0.14 - 0.02 * (n % 2)), H);
    g.fill();
    g.fillStyle = '#262a25';
    g.fillRect(0, H * 0.18, W * 0.3, H * 0.6);
    g.fillRect(W * 0.7, H * 0.2, W * 0.3, H * 0.58);
    const img = g.getImageData(0, 0, W, H);
    const px = img.data;
    for (let y = 0; y < H; y++) {
      const line = (y & 1 ? 0.82 : 1) * (Math.abs(((time * 40 + y) % H) - H / 2) < 3 ? 1.25 : 1);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = (px[i + 1] + (Math.random() - 0.5) * 34) * line;
        px[i] = v * 0.9;
        px[i + 1] = v;
        px[i + 2] = v * 0.9;
      }
    }
    g.putImageData(img, 0, 0);
    g.font = 'bold 11px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#e8eee0';
    g.fillText(cam ? `CAM ${String(n).padStart(2, '0')}` : 'NO VIDEO', 11, 10);
    if (cam) g.fillText(cam.name.slice(0, 22), 11, H - 22);
    if (live && Math.floor(time * 1.5) % 2 === 0) {
      g.fillStyle = '#ff3a2a';
      g.beginPath();
      g.arc(W - 15, 15, 4, 0, Math.PI * 2);
      g.fill();
    }
    // le tube : l'image s'assombrit vers les bords et les coins du verre
    if (!s.vig) {
      s.vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.52);
      s.vig.addColorStop(0, 'rgba(0,0,0,0)');
      s.vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    }
    g.fillStyle = s.vig;
    g.fillRect(0, 0, W, H);
    s.tex.needsUpdate = true;
  };

  return {
    // la porte du poste : 0 fermée, 1 grande ouverte
    get doorK() {
      return doorK;
    },
    update(sim, P, time, dt) {
      // les rideaux : ils suivent la partie (lissés chez un invité, qui ne les reçoit que 20 fois par seconde)
      for (const st of dockSt) {
        const d = st.d;
        st.o += (d.o - st.o) * Math.min(1, dt * 12);
        const shown = d.broken ? Math.min(st.o, 0.86) : st.o;
        st.sh.position.y = shown * DOCK_H;
        st.shake = Math.max(0, st.shake - dt);
        const bulge = st.shake > 0 ? Math.sin(st.shake * 70) * st.shake * 0.5 : 0;
        // arraché : le tablier pend de travers, plié vers l'extérieur
        st.leaves[0].rotation.set(bulge * 0.12 + (d.broken ? -0.14 : 0), 0, d.broken ? 0.07 : 0);
        st.leaves[0].position.set(d.broken ? 0.2 : 0, d.broken ? 0.12 : 0, bulge * 0.06);
        // le gyrophare tourne tant que le rideau bouge (il prend sa vitesse, puis ralentit en s'éteignant) : son
        // miroir balaie les murs d'un faisceau orange, et le dôme flamboie quand le faisceau passe sur nous
        const moving = d.dir !== 0;
        for (const b of st.beacons) {
          b.k += ((moving ? 1 : 0) - b.k) * Math.min(1, dt * (moving ? 6 : 3));
          b.a += dt * 7.5 * b.k;
          const dx = P.x - b.x;
          const dz = P.z - b.z;
          const dl = Math.hypot(dx, dz) || 1;
          const face = Math.pow(Math.max(0, (Math.cos(b.a + b.ph) * dx + Math.sin(b.a + b.ph) * dz) / dl), 4) * b.k;
          // l'ampoule derrière le miroir : face à nous, bien plus vive que le blanc de l'écran (halo du caméscope)
          const hot = face * 11 + b.k * 0.8;
          b.domeMat.color.setRGB(0.3 + hot, 0.12 + 0.4 * hot, 0.02 + 0.05 * hot);
        }
        for (const m of st.lamps) m.color.set(moving ? (Math.floor(time * 4) % 2 ? '#ffb43a' : '#5a3a0c') : d.broken ? '#6a0d08' : '#3a2a0c');
      }
      // les cloches : le flash bat deux fois par seconde, la cloche tremble
      for (const st of alarmSt) {
        const a = st.a;
        const ring = a.ringT > 0;
        st.glass.visible = !!a.used;
        const on = ring && time % 0.5 < 0.09;
        st.on = on ? 1 : 0;
        // le dôme rouge, à contretemps du flash (sa lampe chauffe et refroidit un peu : pas un simple clignotant)
        const ph = (time + 0.25 + st.a.id * 0.07) % 0.5;
        st.on2 = ring ? Math.max(0, 1 - Math.abs(ph - 0.08) / 0.09) : 0;
        st.bellMat.emissiveIntensity = 0.04 + st.on2 * 5;
        if (on) st.flashMat.color.setRGB(18, 10.5, 9.5); // le tube au xénon derrière le plexiglas
        else st.flashMat.color.set(ring ? '#8a2a22' : '#4a1d1a');
        st.dome.position.set(ring ? (Math.random() - 0.5) * 0.005 : 0, 2.3 + (st.dent ? -0.03 : 0), 0.03);
        st.dome.rotation.z = st.dent ? 0.5 : 0;
      }
      // les grilles : celle d'une bouche qui s'ouvre tombe (en tournoyant), puis reste par terre
      for (const st of ventSt) {
        const open = !!st.v.open;
        if (open && st.mode === 'shut') {
          st.mode = 'fall';
          st.t = 0;
          st.dust = st.dust || new THREE.Sprite(dustMat.clone());
          st.dust.position.set(st.v.x, DUCT_LOW - 0.3, st.v.z);
          st.dust.scale.setScalar(0.6);
          if (!st.dust.parent) group.add(st.dust);
          st.dustT = 0;
        } else if (!open && st.mode !== 'shut') {
          st.mode = 'shut';
          st.shut();
        }
        st.hole.visible = open;
        if (st.mode === 'fall') {
          st.t += dt;
          const y0 = DUCT_LOW + 0.03;
          const y = y0 - 4.9 * st.t * st.t;
          if (y <= 0.03) {
            st.mode = 'down';
            lieDown(st);
          } else {
            const k = 1 - y / y0;
            st.grille.position.set(st.v.x + (st.rest.x - st.v.x) * k, y, st.v.z + (st.rest.z - st.v.z) * k);
            st.grille.rotation.set(Math.PI / 2 - Math.PI * k + Math.sin(st.t * 17) * 0.3, st.rest.ry * k, Math.sin(st.t * 11) * 0.5, 'YXZ');
          }
        }
        if (st.dust && st.dust.visible !== false && st.dustT !== undefined) {
          st.dustT += dt;
          const e = st.dustT / 1.8;
          if (e >= 1) {
            st.dust.material.opacity = 0;
            st.dustT = undefined;
          } else {
            st.dust.material.opacity = 0.55 * (1 - e) * Math.min(1, e * 8);
            st.dust.scale.setScalar(0.6 + e * 2.2);
            st.dust.position.y = DUCT_LOW - 0.3 - e * 1.4;
          }
        }
      }
      // la porte du poste : elle s'ouvre vite (on la pousse), se referme doucement (le ferme-porte)
      if (doorPivot) {
        const want = gd.open ? 1 : 0;
        doorK = want > doorK ? Math.min(1, doorK + dt / 0.4) : Math.max(0, doorK - dt / 1.1);
        const e = doorK * doorK * (3 - 2 * doorK);
        doorPivot.rotation.y = doorBase - doorSign * e * 1.62;
      }
      // les écrans (de près seulement) et la diode de la caméra regardée
      const S = map.post;
      const guard = S && S.by >= 0 ? sim.players.find((q) => q.id === S.by && q.status === 'alive' && q.desk) : null;
      tally.forEach((g, i) => {
        g.visible = !!guard && (guard.camSel || 0) === i && Math.floor(time * 1.2) % 2 === 0;
      });
      if (screens.length && cams.length && S) {
        const near = Math.hypot(P.x - S.x, P.z - S.z) < 14 && (P.floor || 0) === 0;
        // la lueur des écrans bouge avec l'image (le défilement, le grain)
        for (const s of screens) s.glow = 0.46 + 0.05 * Math.sin(time * 7.3 + s.i * 1.7) + 0.03 * Math.random();
        screenT -= dt;
        if (near && screenT <= 0) {
          screenT = 1 / 8;
          const n = cams.length;
          const base = guard ? guard.camSel || 0 : Math.floor(time / 6);
          for (const s of screens) drawScreen(s, cams[(((base + s.i - 1) % n) + n) % n], !!guard && s.i === 1, time);
        }
      }
    },
    // les feux de couleur allumés en ce moment (x, y, z, couleur, portée, sens et lobe) : la scène garde les plus
    // proches de la caméra et en éclaire les murs, le sol, la brume
    lights(out) {
      for (const st of dockSt) {
        for (const b of st.beacons) {
          if (b.k < 0.02) continue;
          // un faisceau qui tourne (lobe large), et un peu de lumière tout autour (le dôme lui-même)
          out.push({ x: b.x, y: b.y, z: b.z, r: 2.6 * b.k, g: 1.05 * b.k, b: 0.12 * b.k, rad: 9, nx: Math.cos(b.a + b.ph), ny: -0.25, nz: Math.sin(b.a + b.ph), w: 0.55 });
          out.push({ x: b.x, y: b.y, z: b.z, r: 0.5 * b.k, g: 0.2 * b.k, b: 0.02 * b.k, rad: 3.5, nx: 0, ny: 0, nz: 0, w: 0 });
        }
      }
      for (const st of alarmSt) {
        if (!st.on) continue;
        // le flash : blanc rosé au cœur, rouge en s'éloignant (le plexiglas), vers la pièce (rien derrière le mur)
        out.push({ x: st.fx, y: 2.3, z: st.fz, r: 5.5, g: 1.2, b: 0.9, rad: 11, nx: st.a.nx, ny: 0, nz: st.a.nz, w: -0.55 });
      }
      for (const st of alarmSt) {
        if (st.on2 < 0.02) continue;
        // le dôme : rouge franc, moins fort que le flash
        const k = st.on2;
        out.push({ x: st.bx, y: 2.3, z: st.bz, r: 3.2 * k, g: 0.22 * k, b: 0.12 * k, rad: 8, nx: st.a.nx, ny: 0, nz: st.a.nz, w: -0.55 });
      }
      for (const s of screens) out.push({ x: s.lx, y: s.ly, z: s.lz, r: 0.6 * s.glow, g: 0.78 * s.glow, b: 0.66 * s.glow, rad: 2.8, nx: s.nx, ny: 0, nz: s.nz, w: -0.35 });
      return out;
    },
    // ce que les sons ne disent pas tout seuls : un rideau qui encaisse, une cloche qu'elle fracasse
    event(ev) {
      if (ev.type === 'dockBang') {
        const st = dockSt.find((s) => s.d.id === ev.id);
        if (st) st.shake = 0.3 + (ev.k || 0) * 0.2;
      } else if (ev.type === 'alarmSmash') {
        const st = alarmSt.find((s) => s.a.id === ev.id);
        if (st) st.dent = true;
      }
    },
  };
}
