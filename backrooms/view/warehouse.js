// The Backrooms (Level 1) - L'habillage de l'entrepôt : rayonnages à palettes (échelles bleues percées, lisses orange,
// croisillons, planchers grillagés), marchandises sur palettes (cartons, films étirables, fûts, sacs de ciment, bacs),
// tuyaux et gaines au plafond, réglettes suspendues, lignes peintes au sol, flaques, piliers balisés et numérotés,
// panneaux d'allée. Tout est dessiné dans le code (textures au canvas, palettes en planches de kart/tex/, Poly Haven CC0)
// et tiré d'une graine propre à la carte : chacun voit le même entrepôt.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { mergeGeometries } from '../../shared/vendor/three/BufferGeometryUtils.js';
import { CELL_SIZE, T } from '../engine/map.js';

const KART_TEX = new URL('../../kart/tex/', import.meta.url).href;
const C = CELL_SIZE;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grain(ctx, w, h, amount, rnd) {
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  ctx.putImageData(d, 0, 0);
}

// une boîte (ou un cylindre) dont les UV visent une case d'une planche de textures
function atlasGeo(geo, u0, v0, du, dv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  return geo;
}

function stencil(ctx, text, x, y, size, color, rnd, font = 'bold') {
  ctx.font = `${font} ${size}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  // peinture écaillée
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`;
    ctx.fillRect(x - size * 2 + rnd() * size * 4, y - size / 2 + rnd() * size, 1 + rnd() * 4, 1 + rnd() * 3);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function makeTextures(rnd) {
  const out = {};

  // Cartons : 4 variantes sur une planche 2 × 2 (ruban adhésif, étiquette d'expédition, mentions imprimées)
  {
    const [cv, ctx] = canvas(512);
    const tones = ['#a77d4b', '#b8905d', '#957046', '#c2a271'];
    const prints = [['FRAGILE', '#9b1c16'], ['THIS SIDE UP', '#2a2420'], ['HANDLE WITH CARE', '#2a2420'], ['KEEP DRY', '#1d3557']];
    for (let k = 0; k < 4; k++) {
      const ox = (k % 2) * 256;
      const oy = Math.floor(k / 2) * 256;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, 256, 256);
      ctx.clip();
      ctx.fillStyle = tones[k];
      ctx.fillRect(ox, oy, 256, 256);
      // fibres et salissures
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '60,40,20' : '230,200,150'},${rnd() * 0.08})`;
        ctx.fillRect(ox + rnd() * 256, oy + rnd() * 256, 1 + rnd() * 30, 1);
      }
      // ruban au milieu
      ctx.fillStyle = 'rgba(214, 180, 120, 0.75)';
      ctx.fillRect(ox + 112, oy, 32, 256);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(ox + 116, oy, 6, 256);
      // mention imprimée
      const [txt, col] = prints[k];
      ctx.globalAlpha = 0.8;
      ctx.font = 'bold 26px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.fillText(txt, ox + 128, oy + 60);
      if (k === 1) {
        // flèches « haut »
        for (const ax of [60, 196]) {
          ctx.beginPath();
          ctx.moveTo(ox + ax, oy + 150);
          ctx.lineTo(ox + ax - 18, oy + 175);
          ctx.lineTo(ox + ax - 6, oy + 175);
          ctx.lineTo(ox + ax - 6, oy + 205);
          ctx.lineTo(ox + ax + 6, oy + 205);
          ctx.lineTo(ox + ax + 6, oy + 175);
          ctx.lineTo(ox + ax + 18, oy + 175);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // étiquette blanche avec code-barres
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(ox + 150, oy + 160, 84, 60);
      ctx.fillStyle = '#1a1a1a';
      for (let x = 0; x < 70; x += 2 + Math.floor(rnd() * 3)) ctx.fillRect(ox + 157 + x, oy + 168, 1 + Math.floor(rnd() * 2), 26);
      ctx.font = '10px monospace';
      ctx.fillText(`SKU ${100 + Math.floor(rnd() * 899)}-${10 + Math.floor(rnd() * 89)}`, ox + 192, oy + 208);
      // coin écrasé, humidité
      const g = ctx.createRadialGradient(ox + rnd() * 256, oy + 256, 0, ox + 128, oy + 256, 140);
      g.addColorStop(0, 'rgba(40, 25, 10, 0.4)');
      g.addColorStop(1, 'rgba(40, 25, 10, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, 256, 256);
      ctx.restore();
    }
    out.carton = tex(cv);
  }

  // Film étirable : voile blanchâtre strié
  {
    const [cv, ctx] = canvas(128);
    ctx.fillStyle = 'rgba(230, 236, 240, 0.5)';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.4})`;
      ctx.fillRect(0, rnd() * 128, 128, 1 + rnd() * 3);
    }
    out.wrap = tex(cv);
  }

  // Fûts métalliques : 4 couleurs sur une planche (cerclages, rouille, losange de danger)
  {
    const [cv, ctx] = canvas(512, 256);
    const cols = ['#1f4f86', '#8c1d18', '#3d4246', '#2f5a2c'];
    for (let k = 0; k < 4; k++) {
      const ox = k * 128;
      ctx.fillStyle = cols[k];
      ctx.fillRect(ox, 0, 128, 256);
      for (const y of [80, 170]) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(ox, y, 128, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(ox, y - 3, 128, 3);
      }
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(${110 + rnd() * 40},${55 + rnd() * 20},20,${rnd() * 0.5})`;
        ctx.fillRect(ox + rnd() * 128, rnd() * 256, 1 + rnd() * 6, 1 + rnd() * 10);
      }
      // losange orange de danger
      ctx.save();
      ctx.translate(ox + 64, 125);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#e07b16';
      ctx.fillRect(-16, -16, 32, 32);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(-13, -13, 26, 26);
      ctx.restore();
      const g = ctx.createLinearGradient(0, 200, 0, 256);
      g.addColorStop(0, 'rgba(60,30,10,0)');
      g.addColorStop(1, 'rgba(60,30,10,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, 0, 128, 256);
    }
    out.drum = tex(cv);
  }

  // Sacs de ciment en papier kraft
  {
    const [cv, ctx] = canvas(256);
    ctx.fillStyle = '#c9c0ad';
    ctx.fillRect(0, 0, 256, 256);
    grain(ctx, 256, 256, 26, rnd);
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(0, 70, 256, 40);
    ctx.font = 'bold 30px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2ede2';
    ctx.fillText('PORTLAND CEMENT', 128, 91);
    ctx.fillStyle = '#2a2622';
    ctx.font = 'bold 22px Impact, "Arial Black", sans-serif';
    ctx.fillText('25 KG', 128, 150);
    ctx.fillStyle = 'rgba(90, 90, 90, 0.35)';
    for (let i = 0; i < 6; i++) ctx.fillRect(rnd() * 256, rnd() * 256, 20 + rnd() * 50, 8 + rnd() * 20);
    out.sack = tex(cv);
  }

  // Bacs en plastique : bleu et gris, côtes verticales, poignée
  {
    const [cv, ctx] = canvas(256, 128);
    for (const [k, col] of [[0, '#1d4fa0'], [1, '#5c6166']]) {
      const ox = k * 128;
      ctx.fillStyle = col;
      ctx.fillRect(ox, 0, 128, 128);
      for (let x = 8; x < 128; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(ox + x, 30, 3, 98);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(ox + x + 3, 30, 2, 98);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(ox + 44, 10, 40, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(ox, 0, 128, 4);
    }
    out.tote = tex(cv);
  }

  // Échelles de rayonnage : bleu avec la double rangée de trous oblongs
  {
    const [cv, ctx] = canvas(64, 512);
    ctx.fillStyle = '#24548f';
    ctx.fillRect(0, 0, 64, 512);
    for (let y = 4; y < 512; y += 14) {
      ctx.fillStyle = '#0b1420';
      ctx.fillRect(14, y, 8, 9);
      ctx.fillRect(42, y, 8, 9);
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(200,210,220,${rnd() * 0.25})`;
      ctx.fillRect(rnd() * 64, rnd() * 512, 1 + rnd() * 3, 2 + rnd() * 12);
    }
    out.upright = tex(cv);
  }

  // Lisses orange, avec l'étiquette de charge
  {
    const [cv, ctx] = canvas(256, 32);
    ctx.fillStyle = '#d4661a';
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 28, 256, 4);
    ctx.fillStyle = '#efe9d8';
    ctx.fillRect(108, 7, 40, 17);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAX 1000KG', 128, 16);
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(50,30,20,${rnd() * 0.4})`;
      ctx.fillRect(rnd() * 256, rnd() * 32, 2 + rnd() * 10, 1 + rnd() * 3);
    }
    out.beam = tex(cv);
  }

  // Grillage (planchers des niveaux, panneau de fond) : transparent entre les fils
  {
    const [cv, ctx] = canvas(128);
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#6f7477';
    for (let i = 0; i < 128; i += 4) {
      ctx.fillRect(i, 0, 1, 128);
      ctx.fillRect(0, i, 128, 1);
    }
    out.mesh = tex(cv);
  }

  // Peinture jaune au sol, usée par les chariots
  {
    const [cv, ctx] = canvas(256, 16);
    ctx.fillStyle = '#d6ab21';
    ctx.fillRect(0, 0, 256, 16);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
      ctx.fillRect(rnd() * 256, rnd() * 16, 1 + rnd() * 10, 1 + rnd() * 4);
    }
    ctx.globalCompositeOperation = 'source-over';
    out.line = tex(cv);
  }

  // Bande de balisage jaune et noire (pied des piliers, protections des rayonnages)
  {
    const [cv, ctx] = canvas(256, 64);
    ctx.fillStyle = '#d9ac1f';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#141414';
    for (let x = -64; x < 320; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 24, 64);
      ctx.lineTo(x + 88, 0);
      ctx.lineTo(x + 64, 0);
      ctx.fill();
    }
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(90,90,85,${rnd() * 0.6})`;
      ctx.fillRect(rnd() * 256, rnd() * 64, 1 + rnd() * 8, 1 + rnd() * 3);
    }
    out.hazard = tex(cv);
  }

  // Numéros des piliers, au pochoir : 16 sur une planche 4 × 4
  {
    const [cv, ctx] = canvas(512);
    ctx.clearRect(0, 0, 512, 512);
    for (let k = 0; k < 16; k++) {
      const x = (k % 4) * 128 + 64;
      const y = Math.floor(k / 4) * 128 + 64;
      stencil(ctx, `${'ABCDEFGH'[k % 8]}-${String(3 + k * 2).padStart(2, '0')}`, x, y, 40, 'rgba(20,20,20,0.85)', rnd);
    }
    out.pillarTags = tex(cv);
  }

  // Panneaux d'allée suspendus : 16 sur une planche 2 × 8
  {
    const [cv, ctx] = canvas(512, 1024);
    for (let k = 0; k < 16; k++) {
      const ox = (k % 2) * 256;
      const oy = Math.floor(k / 2) * 128;
      ctx.fillStyle = '#d9ac1f';
      ctx.fillRect(ox, oy, 256, 128);
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 6;
      ctx.strokeRect(ox + 8, oy + 8, 240, 112);
      ctx.fillStyle = '#141414';
      ctx.font = 'bold 22px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AISLE', ox + 128, oy + 38);
      ctx.font = 'bold 52px Impact, "Arial Black", sans-serif';
      ctx.fillText(String(k + 1).padStart(2, '0'), ox + 128, oy + 84);
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(60,50,30,${rnd() * 0.35})`;
        ctx.fillRect(ox + rnd() * 256, oy + rnd() * 128, 2 + rnd() * 14, 1 + rnd() * 6);
      }
    }
    out.aisle = tex(cv);
  }

  // Taches au sol : huile (noire) et flaques (bord irrégulier)
  {
    const [cv, ctx] = canvas(128);
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) {
      const x = 40 + rnd() * 48;
      const y = 40 + rnd() * 48;
      const r = 14 + rnd() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    out.stain = new THREE.CanvasTexture(cv);
  }

  // Tôle galvanisée des gaines, avec la bride au bout de chaque tronçon
  {
    const [cv, ctx] = canvas(128);
    ctx.fillStyle = '#8b9094';
    ctx.fillRect(0, 0, 128, 128);
    grain(ctx, 128, 128, 22, rnd);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`;
      ctx.fillRect(rnd() * 128, rnd() * 128, 30 + rnd() * 60, 2 + rnd() * 6);
    }
    ctx.fillStyle = 'rgba(30,32,34,0.6)';
    ctx.fillRect(0, 0, 4, 128);
    ctx.fillRect(124, 0, 4, 128);
    out.duct = tex(cv);
  }

  // Bois des palettes : la photo des planches de kart/tex/, éclaircie (canvas en attendant)
  {
    const [cv, ctx] = canvas(256);
    ctx.fillStyle = '#9c7d55';
    ctx.fillRect(0, 0, 256, 256);
    grain(ctx, 256, 256, 30, rnd);
    out.wood = tex(cv);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 256, 256);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#d8c09a';
      ctx.fillRect(0, 0, 256, 256);
      ctx.globalCompositeOperation = 'source-over';
      out.wood.needsUpdate = true;
    };
    img.src = KART_TEX + 'planks.jpg';
  }
  return out;
}

// Palette Europe (1,2 m × 1 m × 14 cm) : 3 semelles, 9 dés, planches du dessus et du dessous, en un seul maillage
function palletGeometry() {
  const parts = [];
  const box = (sx, sy, sz, x, y, z) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (const z of [-0.43, 0, 0.43]) {
    box(1.2, 0.022, 0.14, 0, 0.011, z); // semelles
    for (const x of [-0.53, 0, 0.53]) box(0.14, 0.078, 0.14, x, 0.061, z); // dés
  }
  for (const x of [-0.53, 0, 0.53]) box(0.14, 0.022, 1.0, x, 0.111, 0); // traverses
  for (const z of [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45]) box(1.2, 0.022, 0.1, 0, 0.133, z); // planches du dessus
  return mergeGeometries(parts);
}

export function buildWarehouse({ map, group, baked, CEIL }) {
  const W = map.W;
  const H = map.H;
  const grid = map.grid;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? T.WALL : grid[z * W + x]);
  let s = 918273 + Math.round(map.spawn.x * 31 + map.spawn.z * 17);
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tx = makeTextures(rnd);
  const lambert = (o) => baked(new THREE.MeshLambertMaterial(o));

  // Instances regroupées par maillage : on empile les matrices (et les teintes), on crée les InstancedMesh à la fin
  const bins = new Map();
  const bin = (key, geo, mat) => {
    if (!bins.has(key)) bins.set(key, { geo, mat, m: [], c: [] });
    return bins.get(key);
  };
  const tint = new THREE.Color();
  const push = (b, m, shade = 1) => {
    b.m.push(m);
    b.c.push(shade);
  };
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  // repère d'une case de rayonnage : lx le long de la rangée, lz en travers
  let cx = 0;
  let cz = 0;
  let rot = 0;
  const L = (lx, y, lz, sx, sy, sz, ry = 0, rx = 0) => {
    dummy.position.set(cx + Math.cos(rot) * lx + Math.sin(rot) * lz, y, cz - Math.sin(rot) * lx + Math.cos(rot) * lz);
    dummy.rotation.set(rx, rot + ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };

  // --- Rayonnages à palettes ---
  const SH = Math.min(CEIL - 0.5, 3.4);
  const LEVELS = [0, 1.18, 2.26]; // dessus des planchers où sont posées les palettes
  const BEAMS = [1.1, 2.18, SH - 0.08];
  const half = C / 2 - 0.06;
  const FRONT = 1.17; // face avant des deux rayonnages dos à dos
  const BACK = 0.1;
  const uprightB = bin('upright', new THREE.BoxGeometry(0.09, 1, 0.07), lambert({ map: tx.upright }));
  const beamB = bin('beam', new THREE.BoxGeometry(1, 0.12, 0.05), lambert({ map: tx.beam }));
  const braceB = bin('brace', new THREE.BoxGeometry(0.035, 0.035, 1), lambert({ color: '#2b5a95' }));
  const meshMat = lambert({ map: tx.mesh, alphaTest: 0.5, side: THREE.DoubleSide });
  const deckB = bin('deck', new THREE.BoxGeometry(1, 0.025, 1), meshMat);
  const backB = bin('back', new THREE.PlaneGeometry(1, 1), meshMat);
  const guardB = bin('guard', new THREE.BoxGeometry(1, 1, 1), lambert({ map: tx.hazard }));
  const palletB = bin('pallet', palletGeometry(), lambert({ map: tx.wood }));
  const cartonMat = lambert({ map: tx.carton });
  const cartonB = [0, 1, 2, 3].map((k) => bin('carton' + k, atlasGeo(new THREE.BoxGeometry(1, 1, 1), (k % 2) / 2, 0.5 - Math.floor(k / 2) / 2, 0.5, 0.5), cartonMat));
  const wrapB = bin('wrap', new THREE.BoxGeometry(1, 1, 1), lambert({ map: tx.wrap, transparent: true, opacity: 0.4, depthWrite: false }));
  const drumMat = lambert({ map: tx.drum });
  const drumB = [0, 1, 2, 3].map((k) => bin('drum' + k, atlasGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), k / 4, 0, 0.25, 1), drumMat));
  const sackB = bin('sack', new THREE.BoxGeometry(1, 1, 1), lambert({ map: tx.sack }));
  const toteMat = lambert({ map: tx.tote });
  const toteB = [0, 1].map((k) => bin('tote' + k, atlasGeo(new THREE.BoxGeometry(1, 1, 1), k / 2, 0, 0.5, 1), toteMat));

  // une charge sur une palette : base de la palette en (lx, y, lz), hauteur disponible hb, ombre sh
  const load = (lx, y, lz, hb, shade) => {
    push(palletB, L(lx, y, lz, 1, 1, 1, 0), shade);
    const y0 = y + 0.144;
    const r = rnd();
    if (r < 0.08 || hb < 0.3) return; // palette vide
    const kind = r < 0.42 ? 'carton' : r < 0.58 ? 'wrap' : r < 0.72 ? 'drum' : r < 0.86 ? 'sack' : 'tote';
    if (kind === 'carton' || kind === 'wrap') {
      const sizes = [[0.38, 0.3, 0.32], [0.57, 0.4, 0.48], [0.39, 0.36, 0.49], [0.58, 0.28, 0.32]];
      const [bx, by, bz] = sizes[Math.floor(rnd() * sizes.length)];
      const nx = Math.floor(1.18 / bx);
      const nz = Math.floor(0.98 / bz);
      const ny = Math.max(1, Math.min(4, Math.floor((hb * (0.6 + rnd() * 0.4)) / by)));
      const v = cartonB[Math.floor(rnd() * 4)];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          for (let k = 0; k < nz; k++) {
            if (kind === 'carton' && j === ny - 1 && j > 0 && rnd() < 0.35) continue; // dernière rangée entamée
            const px = lx + (i - (nx - 1) / 2) * bx + (rnd() - 0.5) * 0.03;
            const pz = lz + (k - (nz - 1) / 2) * bz + (rnd() - 0.5) * 0.03;
            push(v, L(px, y0 + j * by + by / 2, pz, bx - 0.012, by - 0.006, bz - 0.012, (rnd() - 0.5) * 0.06), shade * (0.85 + rnd() * 0.2));
          }
        }
      }
      if (kind === 'wrap') push(wrapB, L(lx, y0 + (ny * by) / 2, lz, nx * bx + 0.03, ny * by + 0.02, nz * bz + 0.03), shade);
    } else if (kind === 'drum') {
      if (hb < 0.9) return load(lx, y, lz, 0, shade);
      const v = drumB[Math.floor(rnd() * 4)];
      for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
        if (rnd() < 0.15) continue;
        push(v, L(lx + dx, y0 + 0.44, lz + dz, 0.56, 0.88, 0.56, rnd() * 6), shade * (0.8 + rnd() * 0.25));
      }
    } else if (kind === 'sack') {
      const n = Math.min(7, Math.floor((hb * (0.5 + rnd() * 0.5)) / 0.13));
      for (let j = 0; j < n; j++) {
        const cross = j % 2 === 1;
        for (const o of [-0.26, 0.26]) {
          const px = lx + (cross ? 0 : o * 1.1);
          const pz = lz + (cross ? o : 0);
          push(sackB, L(px, y0 + 0.065 + j * 0.13, pz, cross ? 1.08 : 0.5, 0.13, cross ? 0.46 : 0.92, (rnd() - 0.5) * 0.08), shade * (0.85 + rnd() * 0.2));
        }
      }
    } else {
      const v = toteB[rnd() < 0.6 ? 0 : 1];
      const n = Math.max(1, Math.min(3, Math.floor(hb / 0.31)));
      for (const [dx, dz] of [[-0.29, -0.24], [0.29, -0.24], [-0.29, 0.24], [0.29, 0.24]]) {
        const m = Math.max(1, n - Math.floor(rnd() * 2));
        for (let j = 0; j < m; j++) push(v, L(lx + dx, y0 + 0.15 + j * 0.31, lz + dz, 0.55, 0.3, 0.45, (rnd() - 0.5) * 0.05), shade);
      }
    }
  };

  const isShelf = (x, z) => at(x, z) === T.SHELF;
  for (const sh of map.shelves || []) {
    cx = (sh.gx + 0.5) * C;
    cz = (sh.gz + 0.5) * C;
    rot = sh.alongX ? 0 : Math.PI / 2;
    const ax = sh.alongX ? 1 : 0;
    const az = sh.alongX ? 0 : 1;
    const endA = !isShelf(sh.gx - ax, sh.gz - az); // bout de rangée côté -lx
    const endB = !isShelf(sh.gx + ax, sh.gz + az);
    // deux rayonnages dos à dos : un de chaque côté du panneau grillagé central
    for (const side of [-1, 1]) {
      for (const lx of [-half, half]) {
        for (const lz of [side * FRONT, side * BACK]) push(uprightB, L(lx, SH / 2, lz, 1, SH, 1));
      }
      for (const y of BEAMS) push(beamB, L(0, y, side * FRONT, C, 1, 1));
      for (const y of BEAMS.slice(0, 2)) push(deckB, L(0, y + 0.07, side * (FRONT + BACK) / 2, C - 0.1, 1, FRONT - BACK));
      // croisillons de l'échelle (côté -lx de chaque case) : un zigzag entre l'avant et l'arrière
      const depth = FRONT - BACK;
      const step = 0.75;
      for (let y = 0.15; y + step <= SH; y += step) {
        const len = Math.hypot(depth, step);
        const ang = Math.atan2(step, depth);
        const up = Math.round((y - 0.15) / step) % 2 === 0;
        push(braceB, L(-half, y + step / 2, side * (FRONT + BACK) / 2, 1, 1, len, 0, side * (up ? -ang : ang)));
      }
      // protections jaunes et noires au pied des échelles en bout de rangée
      if (endA) push(guardB, L(-half - 0.02, 0.22, side * FRONT, 0.16, 0.44, 0.16));
      if (endB) push(guardB, L(half + 0.02, 0.22, side * FRONT, 0.16, 0.44, 0.16));
    }
    push(backB, L(0, SH / 2, 0, C - 0.1, SH - 0.1, 1));
    // marchandises : les places tirées par le moteur, deux palettes par niveau et par face
    for (const g of sh.goods) {
      const shade = g.lvl === 2 ? 0.95 : g.lvl === 1 ? 0.78 : 0.68;
      const hb = (g.lvl < 2 ? BEAMS[g.lvl] - LEVELS[g.lvl] : SH - 0.15 - LEVELS[g.lvl]) - 0.22;
      for (const side of [-1, 1]) {
        const lz = side * (FRONT + BACK) / 2;
        const both = g.w > 0.7 || rnd() < 0.4;
        if (both || g.off < 0) load(-0.62, LEVELS[g.lvl], lz, hb, shade);
        if (both || g.off >= 0) load(0.62, LEVELS[g.lvl], lz, hb, shade);
      }
    }
  }

  // --- Lignes jaunes peintes au sol le long des rayonnages, flaques et taches d'huile ---
  const lineB = bin('line', new THREE.PlaneGeometry(1, 1), lambert({ map: tx.line, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const stainMat = new THREE.MeshBasicMaterial({ color: '#030405', alphaMap: tx.stain, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const stainB = bin('stain', new THREE.PlaneGeometry(1, 1), stainMat);
  const flat = (x, y, z, sx, sz, ry) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(-Math.PI / 2, ry, 0);
    dummy.scale.set(sx, sz, 1);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (at(x, z) !== T.FLOOR) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isShelf(x + dx, z + dz)) continue;
        // à 15 cm du pied du rayonnage, sur toute la case
        const px = (x + 0.5) * C + dx * (C / 2 - 0.15);
        const pz = (z + 0.5) * C + dz * (C / 2 - 0.15);
        push(lineB, flat(px, 0.004, pz, dx ? 0.09 : C, dx ? C : 0.09, 0));
      }
      if (rnd() < 0.05) {
        const sz = 0.6 + rnd() * 1.6;
        push(stainB, flat((x + rnd()) * C, 0.006, (z + rnd()) * C, sz, sz * (0.6 + rnd() * 0.6), rnd() * 6));
      }
    }
  }

  // --- Piliers : bande de balisage au pied, numéro au pochoir sur chaque face ---
  const tagMat = lambert({ map: tx.pillarTags, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const tagB = [];
  for (let k = 0; k < 16; k++) tagB.push(bin('tag' + k, atlasGeo(new THREE.PlaneGeometry(1, 1), (k % 4) / 4, 0.75 - Math.floor(k / 4) / 4, 0.25, 0.25), tagMat));
  const bandB = bin('band', new THREE.BoxGeometry(1, 1, 1), lambert({ map: tx.hazard }));
  let pillarN = 0;
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, z) !== T.WALL) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => at(x + dx, z + dz) === T.WALL || at(x + dx, z + dz) === T.EXIT)) continue;
      const px = (x + 0.5) * C;
      const pz = (z + 0.5) * C;
      dummy.position.set(px, 0.5, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(C + 0.03, 1, C + 0.03);
      dummy.updateMatrix();
      push(bandB, dummy.matrix.clone());
      const tag = tagB[pillarN++ % 16];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        dummy.position.set(px + dx * (C / 2 + 0.006), 2.3, pz + dz * (C / 2 + 0.006));
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        dummy.scale.set(0.9, 0.9, 1);
        dummy.updateMatrix();
        push(tag, dummy.matrix.clone());
      }
    }
  }

  // --- Panneaux d'allée : à l'entrée de chaque allée étroite entre deux rayonnages ---
  const signMat = lambert({ map: tx.aisle });
  const signB = [];
  for (let k = 0; k < 16; k++) signB.push(bin('sign' + k, atlasGeo(new THREE.BoxGeometry(1, 1, 1), (k % 2) / 2, 1 - (Math.floor(k / 2) + 1) / 8, 0.5, 0.125), signMat));
  const rodB = bin('rod', new THREE.BoxGeometry(0.015, 1, 0.015), lambert({ color: '#2a2c2e' }));
  let aisleN = 0;
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      // allée selon z : rayonnage à gauche (x-1) et à droite (x+2), 2 cases de large ; entrée si la case d'avant n'en est pas une
      for (const [ax, az] of [[1, 0], [0, 1]]) {
        const inAisle = (gx, gz) => at(gx, gz) === T.FLOOR && at(gx + ax, gz + az) === T.FLOOR && isShelf(gx - ax, gz - az) && isShelf(gx + 2 * ax, gz + 2 * az);
        if (!inAisle(x, z)) continue;
        const bx = x - az;
        const bz = z - ax;
        if (inAisle(bx, bz)) continue; // pas l'entrée
        if (!inAisle(x + az, z + ax)) continue; // allée d'au moins deux cases
        const px = (x + 0.5) * C + ax * (C / 2);
        const pz = (z + 0.5) * C + az * (C / 2);
        const face = ax ? 0 : Math.PI / 2; // la pancarte barre l'entrée de l'allée
        const sb = signB[aisleN++ % 16];
        for (const flip of [0, Math.PI]) {
          dummy.position.set(px - az * (C / 2 - 0.3), CEIL - 1.05, pz - ax * (C / 2 - 0.3));
          dummy.rotation.set(0, face + flip, 0);
          dummy.scale.set(0.9, 0.45, 0.02);
          dummy.updateMatrix();
          push(sb, dummy.matrix.clone());
        }
        for (const o of [-0.38, 0.38]) {
          dummy.position.set(px - az * (C / 2 - 0.3) + (ax ? o : 0), CEIL - 0.41, pz - ax * (C / 2 - 0.3) + (az ? o : 0));
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 0.82, 1);
          dummy.updateMatrix();
          push(rodB, dummy.matrix.clone());
        }
      }
    }
  }

  // --- Réglettes suspendues : carter de tôle et deux chaînettes au-dessus de chaque tube ---
  const housingB = bin('housing', new THREE.BoxGeometry(1.7, 0.07, 0.24), lambert({ color: '#595e60' }));
  const chainB = bin('chain', new THREE.BoxGeometry(0.012, 1, 0.012), lambert({ color: '#3a3c3e' }));
  for (const l of map.lights) {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(l.x, CEIL - 0.39, l.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    push(housingB, dummy.matrix.clone());
    for (const o of [-0.65, 0.65]) {
      dummy.position.set(l.x + o, CEIL - 0.18, l.z);
      dummy.scale.set(1, 0.36, 1);
      dummy.updateMatrix();
      push(chainB, dummy.matrix.clone());
    }
  }

  // --- Réseaux au plafond : tuyaux le long de x (eau grise, sprinklers rouges, gaz vert), gaines le long de z ---
  const len = W * C;
  const pipeDefs = [
    { r: 0.075, dz: 0, dy: 0.28, col: '#6e7477' },
    { r: 0.05, dz: 0.32, dy: 0.22, col: '#8e2219' },
    { r: 0.095, dz: 0.66, dy: 0.32, col: '#4b5e47' },
  ];
  const strapB = bin('strap', new THREE.BoxGeometry(1, 0.02, 0.05), lambert({ color: '#3a3c3e' }));
  for (let gz = 4 + Math.floor(rnd() * 3); gz < H - 2; gz += 9 + Math.floor(rnd() * 4)) {
    const z0 = gz * C + 0.4;
    for (const p of pipeDefs) {
      const b = bin('pipe' + p.col, new THREE.CylinderGeometry(p.r, p.r, 1, 10), lambert({ color: p.col }));
      dummy.position.set(len / 2, CEIL - p.dy, z0 + p.dz);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, len, 1);
      dummy.updateMatrix();
      push(b, dummy.matrix.clone());
    }
    // colliers : une tige et une barre sous les tuyaux, tous les 2,5 m
    for (let x = C / 2; x < len; x += C) {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, CEIL - 0.4, z0 + 0.33);
      dummy.scale.set(1, 1, 18);
      dummy.updateMatrix();
      push(strapB, dummy.matrix.clone());
      for (const o of [-0.12, 0.8]) {
        dummy.position.set(x, CEIL - 0.2, z0 + o);
        dummy.scale.set(1, 0.4, 1);
        dummy.updateMatrix();
        push(rodB, dummy.matrix.clone());
      }
    }
  }
  const ductB = bin('duct', new THREE.BoxGeometry(0.7, 0.45, 1.2), lambert({ map: tx.duct }));
  for (let gx = 6 + Math.floor(rnd() * 4); gx < W - 3; gx += 13 + Math.floor(rnd() * 5)) {
    const x0 = gx * C + 1.2;
    for (let z = 0.6; z < H * C; z += 1.2) {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x0, CEIL - 0.6, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      push(ductB, dummy.matrix.clone());
    }
  }

  // --- Création des maillages ---
  for (const b of bins.values()) {
    if (!b.m.length) continue;
    const inst = new THREE.InstancedMesh(b.geo, b.mat, b.m.length);
    b.m.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      if (b.c[i] !== 1) inst.setColorAt(i, tint.setScalar(b.c[i]));
      else if (inst.instanceColor) inst.setColorAt(i, tint.setScalar(1));
    });
    if (b.c.some((v) => v !== 1)) {
      // les premières teintes à 1 ont été sautées avant que instanceColor n'existe
      b.m.forEach((_, i) => inst.setColorAt(i, tint.setScalar(b.c[i])));
      inst.instanceColor.needsUpdate = true;
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }
}
