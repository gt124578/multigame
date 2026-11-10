// The Backrooms (Level 1) - L'habillage de l'entrepôt : rayonnages à palettes (échelles bleues percées, lisses orange,
// croisillons, planchers grillagés), marchandises sur palettes (cartons, films étirables, fûts, sacs de ciment, bacs),
// plafond à caissons, tuyaux, gaines de ventilation et grilles, réglettes suspendues, lignes peintes au sol, flaques,
// piliers balisés et numérotés, panneaux d'allée ; aux murs, postes d'incendie, coffrets électriques, caméras, horloges et
// quais condamnés. Dessiné dans le code (textures au canvas, palettes en planches de kart/tex/) ou tiré des modèles
// Poly Haven (CC0) de backrooms/models/, et tiré d'une graine propre à la carte : chacun voit le même entrepôt.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { mergeGeometries } from '../../shared/vendor/three/BufferGeometryUtils.js';
import { CELL_SIZE, T } from '../engine/map.js';
import { loadKit } from './kit.js';

const KART_TEX = new URL('../../kart/tex/', import.meta.url).href;
const C = CELL_SIZE;

// toiles deux fois plus fines que leur dessin (comme les petites textures du Level 0) : cartons, étiquettes, fûts,
// pochoirs et panneaux restent nets de près
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return [c, ctx];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function grain(ctx, w, h, amount, rnd) {
  // sur toute la toile (dessinée à l'échelle 2)
  w = ctx.canvas.width;
  h = ctx.canvas.height;
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

  // Repères de zone peints au pochoir sur les murs (« ZONE » et une lettre-chiffre, de A1 à D4) : 16 sur une planche
  // 4 × 4, peinture blanche un peu passée, écaillée
  {
    const [cv, ctx] = canvas(1024, 512);
    ctx.clearRect(0, 0, 1024, 512);
    for (let k = 0; k < 16; k++) {
      const ox = (k % 4) * 256;
      const oy = Math.floor(k / 4) * 128;
      stencil(ctx, 'ZONE', ox + 128, oy + 26, 24, 'rgba(232,230,220,0.82)', rnd);
      stencil(ctx, `${'ABCD'[k >> 2]}${(k & 3) + 1}`, ox + 128, oy + 80, 76, 'rgba(232,230,220,0.88)', rnd);
    }
    out.zones = tex(cv);
  }

  // Poste d'extincteur : le panneau rouge carré au pictogramme blanc (planche de gauche) et le fond peint en rouge
  // derrière l'appareil, cerné de blanc (planche de droite)
  {
    const [cv, ctx] = canvas(256, 128);
    ctx.fillStyle = '#b3201a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.fillStyle = '#f4f1ea';
    // l'extincteur : le corps, l'épaule, la tête, le tuyau
    ctx.beginPath();
    ctx.roundRect(46, 42, 30, 62, 8);
    ctx.fill();
    ctx.fillRect(54, 30, 14, 14);
    ctx.fillRect(48, 26, 30, 6);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.moveTo(76, 30);
    ctx.quadraticCurveTo(96, 34, 92, 70);
    ctx.stroke();
    // la flamme, à droite
    ctx.beginPath();
    ctx.moveTo(98, 104);
    ctx.quadraticCurveTo(84, 92, 96, 76);
    ctx.quadraticCurveTo(98, 88, 104, 84);
    ctx.quadraticCurveTo(116, 96, 98, 104);
    ctx.fill();
    // le fond rouge du poste : un aplat cerné d'un filet blanc, la peinture un peu usée
    ctx.fillStyle = '#a61d17';
    ctx.fillRect(128, 0, 128, 128);
    ctx.strokeStyle = 'rgba(240,236,228,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(131, 2, 122, 124);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '40,10,8' : '220,120,110'},${rnd() * 0.18})`;
      ctx.fillRect(128 + rnd() * 128, rnd() * 128, 1 + rnd() * 6, 1 + rnd() * 3);
    }
    out.fire = tex(cv);
  }

  // Siphon de sol : une grille de fonte carrée dans son cadre, un peu de rouille au fond des fentes
  {
    const [cv, ctx] = canvas(128);
    ctx.fillStyle = '#3c3e3f';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#56595b';
    ctx.fillRect(8, 8, 112, 112);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = '#0d0e0e';
      ctx.fillRect(18 + i * 11, 18, 5, 92);
      ctx.fillStyle = 'rgba(110,62,30,0.35)';
      ctx.fillRect(18 + i * 11, 96, 5, 14);
    }
    grain(ctx, 128, 128, 24, rnd);
    out.drain = tex(cv);
  }

  // Numéros d'allée peints au sol, à l'entrée de chaque allée (les mêmes que les panneaux suspendus) : 16, en jaune
  {
    const [cv, ctx] = canvas(512);
    ctx.clearRect(0, 0, 512, 512);
    for (let k = 0; k < 16; k++) {
      const x = (k % 4) * 128 + 64;
      const y = Math.floor(k / 4) * 128 + 64;
      stencil(ctx, String(k + 1).padStart(2, '0'), x, y + 4, 78, 'rgba(222,178,40,0.85)', rnd);
    }
    out.floorNum = tex(cv);
  }

  // Tôle laquée blanche des capots de réglettes, salie de poussière
  {
    const [cv, ctx] = canvas(64);
    ctx.fillStyle = '#d9dcd8';
    ctx.fillRect(0, 0, 64, 64);
    grain(ctx, 64, 64, 14, rnd);
    out.lacquer = tex(cv);
  }
  return out;
}

// les UV d'une boîte calées sur le monde : unit mètres par répétition de la texture, sur chaque face
function boxUV(geo, unit) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / unit, v / unit);
  }
  return geo;
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

export function buildWarehouse({ map, group, baked, CEIL, textures }) {
  const W = map.W;
  const H = map.H;
  const grid = map.grid;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? T.WALL : grid[z * W + x]);
  const solid = (x, z) => at(x, z) === T.WALL || at(x, z) === T.EXIT;
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
  const CH = 4 * C; // un morceau d'entrepôt (10 m de côté) : l'unité du tri des objets à dessiner

  // Instances regroupées par maillage : on empile les matrices (et les teintes), on crée les InstancedMesh à la fin
  const bins = new Map();
  const bin = (key, geo, mat) => {
    if (!bins.has(key)) bins.set(key, { geo, mat, m: [], c: [] });
    return bins.get(key);
  };
  const push = (b, m, shade = 1) => {
    b.m.push(m);
    b.c.push(shade);
  };
  // les modèles Poly Haven (CC0, backrooms/models/) posés un par un : kit → morceau ('*' : tous) → matrices et teintes
  // (l'ombre sous les rayonnages) ; ils sont chargés à la fin et rangés comme le reste par morceau d'entrepôt
  const kits = new Map();
  const kp = (kit, piece, m, shade = 1) => {
    if (!kits.has(kit)) kits.set(kit, new Map());
    const k = kits.get(kit);
    if (!k.has(piece)) k.set(piece, { m: [], c: [] });
    k.get(piece).m.push(m);
    k.get(piece).c.push(shade);
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
    const kind = r < 0.35 ? 'carton' : r < 0.42 ? 'model' : r < 0.58 ? 'wrap' : r < 0.72 ? 'drum' : r < 0.86 ? 'sack' : 'tote';
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
    } else if (kind === 'model') {
      // des modèles Poly Haven : caisses de bois clouées, grands bacs de plastique, sacs de terreau (détaillés : on en
      // met peu, ailleurs la palette reste vide)
      const m = rnd();
      if (m < 0.4 && hb > 0.5) {
        const n = hb > 0.98 && rnd() < 0.6 ? 2 : 1;
        for (let j = 0; j < n; j++) kp('wooden_crate_02', 'wooden_crate_02_crate', L(lx, y0 + j * 0.45, lz, 1, 1, 1, Math.PI / 2 + (rnd() - 0.5) * 0.05), shade);
        if (rnd() < 0.7) kp('wooden_crate_02', 'wooden_crate_02_lid', L(lx, y0 + n * 0.45 + 0.03, lz, 1, 1, 1, Math.PI / 2 + (rnd() - 0.5) * 0.08), shade);
      } else if (m < 0.7 && hb > 0.45) {
        const n = hb > 0.9 && rnd() < 0.5 ? 2 : 1;
        for (let j = 0; j < n; j++) kp('plastic_container', 'plastic_container', L(lx, y0 + j * 0.43, lz, 1, 1, 1, (rnd() - 0.5) * 0.06), shade);
      } else if (m < 0.85) {
        const n = rnd() < 0.5 ? 2 : 1;
        for (let j = 0; j < n; j++) kp('compost_bags', 'compost_bags_floorstacked', L(lx + (rnd() - 0.5) * 0.06, y0 + j * 0.175, lz, 1, 1, 1, (rnd() - 0.5) * 0.12 + (j % 2) * Math.PI), shade);
      }
    } else if (kind === 'drum') {
      // des fûts : 76 à 88 cm de place sous la lisse, ils sont un peu plus petits qu'un fût de 200 l
      if (hb < 0.6) return load(lx, y, lz, 0, shade);
      if (rnd() < 0.1) {
        // des fûts d'acier (Poly Haven, barrel_03)
        const k = Math.min(0.8, (hb - 0.02) / 0.93);
        for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) if (rnd() > 0.15) kp('barrel_03', 'barrel_03', L(lx + dx, y0, lz + dz, 0.8, k, 0.8, rnd() * 6), shade);
        return;
      }
      const v = drumB[Math.floor(rnd() * 4)];
      const dh = Math.min(0.88, hb - 0.02);
      for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
        if (rnd() < 0.15) continue;
        push(v, L(lx + dx, y0 + dh / 2, lz + dz, 0.56, dh, 0.56, rnd() * 6), shade * (0.8 + rnd() * 0.25));
      }
    } else if (kind === 'sack') {
      if (rnd() < 0.08) {
        // des sacs de ciment (Poly Haven, cement_bag), croisés d'un lit à l'autre
        const n = Math.min(5, Math.floor((hb * (0.5 + rnd() * 0.5)) / 0.135));
        for (let j = 0; j < n; j++) {
          const cross = j % 2 === 1;
          for (const o of [-0.25, 0.25]) kp('cement_bag', 'cement_bag', L(lx + (cross ? 0 : o * 1.1), y0 + j * 0.135, lz + (cross ? o : 0), 1.05, 0.75, 1.3, (cross ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.08), shade * (0.85 + rnd() * 0.2));
        }
        return;
      }
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
  const decal = (o) => lambert({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o });
  const numMat = decal({ map: tx.floorNum });
  const numB = [];
  for (let k = 0; k < 16; k++) numB.push(bin('num' + k, atlasGeo(new THREE.PlaneGeometry(1, 1), (k % 4) / 4, 0.75 - Math.floor(k / 4) / 4, 0.25, 0.25), numMat));
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
        // son numéro, peint au sol à l'entrée, lisible en y entrant
        dummy.position.set(px, 0.005, pz);
        dummy.rotation.set(-Math.PI / 2, ax ? Math.PI : -Math.PI / 2, 0);
        dummy.scale.set(0.95, 0.95, 1);
        dummy.updateMatrix();
        push(numB[aisleN % 16], dummy.matrix.clone());
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

  // --- Les murs : une gaine électrique grise court tout du long à 3 m (colliers, boîtes de dérivation), des repères de
  // zone peints au pochoir, des postes d'extincteur (fond rouge, panneau, l'appareil au pied). Sur les murs seulement,
  // pas sur les piliers isolés ; jamais sur la façade d'un ascenseur
  const lifts = new Set([map.exit && map.exit.gz * W + map.exit.gx, map.arrival && map.arrival.gz * W + map.arrival.gx]);
  const EC = 'modular_electric_cables'; // (Poly Haven, CC0) : goulotte, attaches, boîtes de dérivation
  const zoneMat = decal({ map: tx.zones });
  const zoneB = [];
  for (let k = 0; k < 16; k++) zoneB.push(bin('zone' + k, atlasGeo(new THREE.PlaneGeometry(1, 1), (k % 4) / 4, 0.75 - Math.floor(k / 4) / 4, 0.25, 0.25), zoneMat));
  const fireMat = decal({ map: tx.fire });
  const fireSignB = bin('fireSign', atlasGeo(new THREE.BoxGeometry(1, 1, 1), 0, 0, 0.5, 1), lambert({ map: tx.fire }));
  const firePanelB = bin('firePanel', atlasGeo(new THREE.PlaneGeometry(1, 1), 0.5, 0, 0.5, 1), fireMat);
  const stations = [];
  const shutters = [];
  const boxes = [];
  const cams = [];
  const clocks = [];
  const far = (list, x, z, d) => list.every((p) => Math.hypot(p[0] - x, p[1] - z) > d);
  const CY = 3.05; // hauteur de la gaine
  // posé contre le mur en (x, y, z), tourné de ry, à l'échelle (sx, sy, sz)
  const wallAt = (x, y, z, ry, sx, sy, sz) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  // poste d'extincteur au milieu de la face (fx, fz) d'un mur qui est en (+dx, +dz) : le fond rouge peint, le panneau
  // au-dessus, l'appareil posé au pied ; alarm : le déclencheur manuel d'alarme incendie à côté, à hauteur de main
  const station = (fx, fz, dx, dz, alarm) => {
    const ry = Math.atan2(-dx, -dz);
    stations.push([fx, fz]);
    push(firePanelB, wallAt(fx - dx * 0.004, 0.82, fz - dz * 0.004, ry, 0.62, 1.26, 1));
    push(fireSignB, wallAt(fx - dx * 0.008, 1.78, fz - dz * 0.008, ry, 0.32, 0.32, 0.012));
    kp('korean_fire_extinguisher_01', '*', new THREE.Matrix4().makeTranslation(fx - dx * 0.17, 0, fz - dz * 0.17).multiply(new THREE.Matrix4().makeRotationY(ry)));
    if (alarm) kp('fire_alarm', '*', wallAt(fx - dx * 0.002 + dz * 0.58, 1.45, fz - dz * 0.002 + dx * 0.58, ry, 1.25, 1.25, 1.25));
  };
  // les déclencheurs d'alarme du jeu (map.alarms, les mêmes chez tout le monde) et les caméras de surveillance qui
  // alimentent les écrans du poste de garde (map.cams)
  for (const a of map.alarms || []) station(a.x, a.z, -a.nx, -a.nz, true);
  for (const c of map.cams || []) {
    cams.push([c.x, c.z]);
    kp('security_camera_01', '*', wallAt(c.x, c.y - 0.2, c.z, c.yaw + Math.PI, 1.1, 1.1, 1.1));
  }
  const gameCams = !!map.cams;
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, z) !== T.FLOOR) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wx = x + dx;
        const wz = z + dz;
        if (at(wx, wz) !== T.WALL || lifts.has(wz * W + wx)) continue;
        // un mur, pas un pilier : il se prolonge d'un côté ou de l'autre
        if (!solid(wx + dz, wz + dx) && !solid(wx - dz, wz - dx)) continue;
        const fx = (x + 0.5) * C + dx * (C / 2); // le milieu de la face
        const fz = (z + 0.5) * C + dz * (C / 2);
        const ry = Math.atan2(-dx, -dz); // ce qui est posé dessus regarde la pièce
        const tx0 = dz; // le long du mur
        const tz0 = dx;
        // la gaine électrique contre le mur : quatre longueurs de goulotte par case (le morceau du kit est dressé, couché
        // ici le long du mur), une attache à chaque raccord, de temps en temps une boîte de dérivation
        const ax0 = -dz; // le sens du morceau couché (x local tourné de ry)
        const az0 = dx;
        for (let i = 0; i < 4; i++) {
          const o = -C / 2 + i * (C / 4);
          dummy.position.set(fx - dx * 0.003 + ax0 * o, CY, fz - dz * 0.003 + az0 * o);
          dummy.rotation.set(0, ry, -Math.PI / 2);
          dummy.scale.set(1.3, (C / 4) / 0.607, 1.3);
          dummy.updateMatrix();
          kp(EC, 'cable_straight_long', dummy.matrix.clone());
          dummy.scale.set(1.3, 1.3, 1.3);
          dummy.updateMatrix();
          kp(EC, 'cable_mount', dummy.matrix.clone());
        }
        if (rnd() < 0.16) {
          const o = (rnd() - 0.5) * 1.2;
          kp(EC, o > 0 ? 'cable_box_4way' : 'cable_box_double', wallAt(fx - dx * 0.003 + ax0 * o, CY - 0.13, fz - dz * 0.003 + az0 * o, ry, 1.3, 1.3, 1.3));
        }
        const r = rnd();
        if (r < 0.07 && stations.every((p) => Math.hypot(p[0] - fx, p[1] - fz) > 14) && far(cams, fx, fz, 2)) {
          // un poste d'extincteur sans alarme (les alarmes sont celles du jeu)
          station(fx, fz, dx, dz, false);
        } else if (r < 0.105 && (wx === 0 || wz === 0 || wx === W - 1 || wz === H - 1) && far(shutters, fx, fz, 20) && far(stations, fx, fz, 4)) {
          // un quai de chargement condamné sur le mur d'enceinte : le rideau métallique baissé, son caisson au-dessus
          shutters.push([fx, fz]);
          kp('rollershutter_door', rnd() < 0.3 ? 'rollershutter_door_graffiti' : 'rollershutter_door', wallAt(fx - dx * 0.006, 0, fz - dz * 0.006, ry, 2.15, 1.12, 1));
        } else if (r < 0.125 && far(boxes, fx, fz, 16) && far(stations, fx, fz, 4) && far(shutters, fx, fz, 4) && far(cams, fx, fz, 2)) {
          // un coffret électrique, sa porte entrouverte
          boxes.push([fx, fz]);
          kp('power_box_01', '*', wallAt(fx - dx * 0.05 + tx0 * 0.3, 1.5, fz - dz * 0.05 + tz0 * 0.3, ry, 1, 1, 1));
        } else if (!gameCams && r < 0.133 && cams.length < 8 && far(cams, fx, fz, 24)) {
          // une caméra de surveillance, sous la gaine, qui plonge vers l'allée
          cams.push([fx, fz]);
          kp('security_camera_01', '*', wallAt(fx - dx * 0.3, 2.62, fz - dz * 0.3, ry, 1.1, 1.1, 1.1));
        } else if (r < 0.138 && clocks.length < 3 && far(clocks, fx, fz, 30) && far(stations, fx, fz, 4)) {
          // une horloge arrêtée
          clocks.push([fx, fz]);
          kp('wall_clock', '*', wallAt(fx, 2.55, fz, ry, 1.3, 1.3, 1.3));
        } else if (r > 0.86) {
          // repère de zone : le quart de l'entrepôt (A à D) et son quart à lui (1 à 4)
          const qx = x < W / 2 ? 0 : 1;
          const qz = z < H / 2 ? 0 : 1;
          const sx = (x % (W / 2)) < W / 4 ? 0 : 1;
          const sz = (z % (H / 2)) < H / 4 ? 0 : 1;
          push(zoneB[(qx + qz * 2) * 4 + sx + sz * 2], wallAt(fx - dx * 0.006, 2.45, fz - dz * 0.006, ry, 1.15, 0.58, 1));
        }
      }
    }
  }

  // --- Siphons de sol dans les grandes allées (une grille de fonte, à plat) ---
  const drainB = bin('drain', new THREE.PlaneGeometry(0.42, 0.42), decal({ map: tx.drain, transparent: false }));
  for (let z = 2; z < H - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (at(x, z) !== T.FLOOR) continue;
      let open = true;
      for (let dz = -1; dz <= 1 && open; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== T.FLOOR) open = false;
      if (!open || rnd() > 0.025) continue;
      dummy.position.set((x + 0.5) * C, 0.004, (z + 0.5) * C);
      dummy.rotation.set(-Math.PI / 2, Math.floor(rnd() * 4) * (Math.PI / 2), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      push(drainB, dummy.matrix.clone());
    }
  }

  // --- Réglettes suspendues : un capot de tôle laquée blanche en auge au-dessus des deux tubes (dessus, deux flancs
  // évasés, deux embouts, les douilles), pendu à deux chaînettes. Les tubes eux-mêmes sont dans scene.js (ils
  // s'allument, grésillent, meurent)
  const TY = CEIL - 0.45; // l'axe des tubes
  const capGeo = (() => {
    const parts = [];
    const box = (sx, sy, sz, x, y, z, rx = 0) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (rx) g.rotateX(rx);
      g.translate(x, y, z);
      parts.push(g);
    };
    box(1.62, 0.012, 0.15, 0, 0.05, 0);
    for (const sz of [-1, 1]) box(1.62, 0.075, 0.006, 0, 0.012, sz * 0.09, -sz * 0.5);
    for (const sx of [-1, 1]) {
      box(0.012, 0.07, 0.17, sx * 0.81, 0.016, 0);
      for (const z of [-0.045, 0.045]) box(0.03, 0.03, 0.036, sx * 0.765, 0.002, z); // douilles
    }
    return mergeGeometries(parts);
  })();
  const housingB = bin('housing', capGeo, lambert({ map: tx.lacquer }));
  const chainB = bin('chain', new THREE.BoxGeometry(0.01, 1, 0.01), lambert({ color: '#3a3c3e' }));
  const chainLen = CEIL - (TY + 0.056);
  for (const l of map.lights) {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(l.x, TY, l.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    push(housingB, dummy.matrix.clone());
    for (const o of [-0.6, 0.6]) {
      dummy.position.set(l.x + o, CEIL - chainLen / 2, l.z);
      dummy.scale.set(1, chainLen, 1);
      dummy.updateMatrix();
      push(chainB, dummy.matrix.clone());
    }
  }

  // --- Plafond à caissons : la dalle porte sur des poutres de béton coulées avec elle. Les principales (40 cm de
  // retombée) courent le long de z toutes les 3 cases, les secondaires (30 cm) le long de x toutes les 2 cases : les
  // réglettes pendent au milieu des caissons, les gaines passent dessous, les tuyaux les traversent dans leurs fourreaux
  const concrete = textures ? textures.ceiling.clone() : null;
  if (concrete) {
    concrete.needsUpdate = true;
    concrete.repeat.set(1, 1);
    textures.ready.then(() => {
      concrete.needsUpdate = true;
    });
  }
  // (le dessous et les flancs des poutres reçoivent la lueur qui monte des réglettes voisines)
  const beamMat = baked(new THREE.MeshLambertMaterial({ map: concrete, color: '#f2f2ee' }), { gloss: 1 });
  const BD1 = 0.4;
  const BD2 = 0.3;
  const beamZ = bin('beamZ', boxUV(new THREE.BoxGeometry(0.42, BD1, C), C), beamMat);
  const beamX = bin('beamX', boxUV(new THREE.BoxGeometry(C, BD2, 0.32), C), beamMat);
  const put = (b, x, y, z) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    push(b, dummy.matrix.clone());
  };
  for (let gx = 3; gx < W - 1; gx += 3) for (let gz = 1; gz < H - 1; gz++) if (!(solid(gx - 1, gz) && solid(gx, gz))) put(beamZ, gx * C, CEIL - BD1 / 2, (gz + 0.5) * C);
  for (let gz = 2; gz < H - 1; gz += 2) for (let gx = 1; gx < W - 1; gx++) if (!(solid(gx, gz - 1) && solid(gx, gz))) put(beamX, (gx + 0.5) * C, CEIL - BD2 / 2, gz * C);

  // --- Réseaux au plafond : un faisceau de tuyaux le long de x (l'eau en acier galvanisé, les sprinklers peints en
  // rouge, le gaz peint en vert), tout en modèles Poly Haven (kit « modular_pipes », CC0) : tronçons bout à bout, un
  // manchon à chaque raccord, un collier par case et sa tige filetée jusqu'à la dalle (pas au droit d'une poutre), une
  // vanne sur la conduite des sprinklers. Ils traversent les poutres principales dans leurs fourreaux ; les gaines
  // passent dessous
  const len = W * C;
  const MP = 'modular_pipes';
  const HALF = Math.PI / 2;
  // r : le diamètre en dixièmes de mètre (celui du kit : 10 cm) ; v : la peinture
  const pipeDefs = [
    { r: 1.5, dz: 0, dy: 0.28, v: '' },
    { r: 1.0, dz: 0.32, dy: 0.22, v: 'red' },
    { r: 1.9, dz: 0.66, dy: 0.3, v: 'green' },
  ];
  // une pièce posée (rotations dans l'ordre y, x, z)
  const km = (x, y, z, ry, sx, sy, sz, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  const underBeam = (x) => Math.abs(x - Math.round(x / (3 * C)) * 3 * C) < 0.4;
  const pipeZ = []; // le milieu de chaque faisceau de tuyaux
  for (let gz = 4 + Math.floor(rnd() * 3); gz < H - 2; gz += 9 + Math.floor(rnd() * 4)) {
    const z0 = gz * C + 0.4;
    pipeZ.push(z0 + 0.38);
    for (const p of pipeDefs) {
      const sfx = p.v ? '@' + p.v : '';
      const y = CEIL - p.dy;
      const z = z0 + p.dz;
      // le tuyau (le morceau du kit est dressé selon y, de 0 à 2 m : couché le long de x), étiré pour tomber juste
      const n = Math.ceil(len / 2.4);
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        kp(MP, 'pipe_200cm_metal' + sfx, km(i * seg, y, z, 0, p.r, seg / 2, p.r, 0, -HALF));
        if (i > 0 && !underBeam(i * seg)) kp(MP, 'pipe_chamber_small_metal' + sfx, km(i * seg - 0.1, y, z, 0, p.r, 1, p.r, 0, -HALF));
      }
      // les colliers, un par case, décalés d'un tuyau à l'autre
      for (let x = C * (0.3 + p.dz); x < len - 0.2; x += C) {
        if (underBeam(x)) continue;
        const top = y + 0.1 * p.r;
        kp(MP, 'pipe_support_metal', km(x, top, z, HALF, p.r, p.r, p.r, HALF));
        kp(MP, 'pipe_support_extension_long_metal', km(x, CEIL, z, HALF, 0.8, 0.8, (CEIL - top) / 0.3, HALF));
      }
    }
    // la vanne des sprinklers (son volant tourné vers le bas), quelque part sur la longueur
    let xv = len * (0.25 + rnd() * 0.5);
    if (underBeam(xv)) xv += 1.2;
    kp(MP, 'pipe_valve_small_1_metal@red', km(xv, CEIL - pipeDefs[1].dy, z0 + pipeDefs[1].dz, HALF, 1, 1, 1, HALF));
  }
  // --- Ventilation (modèles Poly Haven, CC0) : des gaines principales de tôle nervurée le long de z, pendues à des
  // étriers tous les 1,8 m, des grilles sur leurs flancs ; des branches rondes en partent le long de x (un adaptateur
  // sur le flanc, des colliers, une bouche au bout) ; des grilles de reprise d'air dans la dalle, entre les poutres.
  // Tout passe sous les tuyaux et les poutres, au-dessus des rayonnages (3,40 m), et jamais près des ascenseurs
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  const RK = 'modular_airduct_rectangular_01';
  const CK = 'modular_airduct_circular_01';
  const DY = CEIL - 0.62; // l'axe des gaines
  const DS = 0.78; // la gaine du modèle (51 cm) ramenée à 40 cm de haut
  const SEG = 1.8;
  const liftCells = [map.exit, map.arrival, map.elevator].filter(Boolean);
  const nearLift = (x, z) => liftCells.some((c) => Math.abs(Math.floor(x / C) - c.gx) <= 1 && Math.abs(Math.floor(z / C) - c.gz) <= 1);
  const nearBeamX = (z) => Math.abs(z - Math.round(z / (2 * C)) * 2 * C) < 0.3;
  const nearBeamZ = (x) => Math.abs(x - Math.round(x / (3 * C)) * 3 * C) < 0.35;
  const trunks = [];
  // (les troncs viennent de la carte : l'entité s'y glisse ; jamais dans une colonne de réglettes : la gaine passerait
  // au travers de leur capot)
  const trunkX = map.ducts ? map.ducts.trunks : [];
  if (!map.ducts) for (let gx = 6 + Math.floor(rnd() * 4); gx < W - 3; gx += 13 + Math.floor(rnd() * 5)) trunkX.push((gx % 3 === 1 ? gx + 1 : gx) * C + 1.2);
  for (const x0 of trunkX) {
    trunks.push(x0);
    let n = 0;
    for (let z = C; z + SEG <= (H - 1) * C + 0.01; z += SEG, n++) {
      if (nearLift(x0, z) || nearLift(x0, z + SEG)) continue;
      kp(RK, RK + '_tripple_01', mat4(x0, DY, z, 0, 1, DS, 1));
      // l'étrier sous la gaine et ses deux tiges jusqu'à la dalle (pas au droit d'une poutre)
      if (z > C + 0.1 && !nearBeamX(z)) {
        const yb = DY - 0.26 * DS - 0.03;
        kp(RK, RK + '_brace_01', mat4(x0, yb, z));
        kp(RK, RK + '_brace_wire_01', mat4(x0, (yb + CEIL) / 2, z, 0, 1, (CEIL - yb) / 1.1, 1));
      }
      // une grille sur un flanc, un tronçon sur trois, d'un côté puis de l'autre
      if (n % 3 === 1) {
        const sd = n % 6 === 1 ? 1 : -1;
        kp(RK, RK + (rnd() < 0.5 ? '_vent_01' : '_vent_02'), mat4(x0 + sd * 0.3, DY, z + SEG / 2, sd * Math.PI / 2, 0.85, 0.85, 1));
      }
    }
  }
  // les branches rondes, le long de x, au milieu des rangées de caissons sans réglettes, loin des faisceaux de tuyaux
  for (const x0 of trunks) {
    for (let gz = 2; gz < H - 3; gz += 2) {
      const z = (gz + 0.5) * C;
      if (rnd() > 0.32 || !pipeZ.every((pz) => Math.abs(pz - z) > 1.6)) continue;
      const sd = rnd() < 0.5 ? 1 : -1;
      const xs = x0 + sd * (0.33 + 0.32);
      const want = 5 + Math.floor(rnd() * 5);
      let n = 0;
      while (n < want) {
        const xe = xs + sd * 1.42 * (n + 1);
        const cx2 = Math.floor(xe / C);
        if (solid(cx2, gz) || nearLift(xe, z) || trunks.some((t) => t !== x0 && Math.abs(t - xe) < 1.2)) break;
        n++;
      }
      if (n < 2 || nearLift(x0, z)) continue;
      kp(CK, 'modular_airduct_rectangular_converter', mat4(x0 + sd * 0.33, DY, z, sd * Math.PI / 2));
      for (let i = 0; i < n; i++) {
        const xa = xs + sd * 1.42 * i;
        kp(CK, 'modular_airduct_circular_triple', mat4(xa, DY, z, sd * Math.PI / 2));
        const xb = xa + sd * 0.71;
        if (!nearBeamZ(xb)) {
          kp(CK, 'modular_airduct_circular_brace', mat4(xb, DY, z, sd * Math.PI / 2));
          kp(CK, 'modular_airduct_circular_brace_extention_wires', mat4(xb, DY + 0.49, z, sd * Math.PI / 2, 1, (CEIL - DY - 0.49) / 0.6, 1));
        }
      }
      kp(CK, 'modular_airduct_circular_fan', mat4(xs + sd * 1.42 * n, DY, z, sd * Math.PI / 2, 0.75, 0.75, 1));
    }
  }
  // les grilles de reprise dans la dalle : au fond des caissons, à l'écart des réglettes, des tuyaux et des gaines
  for (let kx = 0; kx * 3 * C < W * C; kx++) {
    for (let kz = 0; kz * 2 * C < H * C; kz++) {
      for (const sd of [-1, 1]) {
        if (rnd() > 0.22) continue;
        const xg = kx * 3 * C + 1.5 * C + sd * 2.3;
        const zg = kz * 2 * C + C - 0.9;
        const cxg = Math.floor(xg / C);
        const czg = Math.floor(zg / C);
        if (at(cxg, czg) === T.WALL || at(cxg, czg) === T.EXIT || nearLift(xg, zg)) continue;
        if (!pipeZ.every((pz) => Math.abs(pz - zg) > 0.9) || !trunks.every((t) => Math.abs(t - xg) > 0.7)) continue;
        kp(RK, RK + (rnd() < 0.5 ? '_vent_01' : '_vent_02'), mat4(xg, CEIL - 0.004, zg, rnd() < 0.5 ? 0 : Math.PI / 2, 1.25, 1.25, 1, Math.PI / 2));
      }
    }
  }

  // --- Création des maillages, triés par morceau d'entrepôt (CH × CH m) ---
  // Des dizaines de milliers d'objets (près de 7 000 palettes de 250 triangles) : à chaque image, on ne dessine que les
  // morceaux que la caméra peut voir (ou le caméscope d'un coéquipier en médaillon), en deçà de son plan lointain. Chaque
  // morceau tient dans la sphère de la boîte qui contient tous ses objets : ceux qu'on saute ne changeraient pas un pixel
  const NX = Math.ceil((W * C) / CH);
  const NZ = Math.ceil((H * C) / CH);
  const NCH = NX * NZ;
  const lo = new Float32Array(NCH * 3).fill(Infinity);
  const hi = new Float32Array(NCH * 3).fill(-Infinity);
  const sc = new Float32Array(NCH * 4).fill(-1); // la sphère de chaque morceau (rayon négatif : morceau vide)
  const bb = new THREE.Box3();
  const sets = [];
  let nVis = -1;
  // un ensemble d'objets du même maillage (list : leurs matrices ; shades : leurs teintes, ou null), rangés par morceau ;
  // near : dessinés seulement dans les morceaux à moins de NEAR m (les modèles détaillés : plus loin, le brouillard en
  // laisse moins d'un millième, rien qu'un pixel puisse montrer)
  const addSet = (geo, mat, list, shades, near = false) => {
    const n = list.length;
    if (!n) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const key = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const e = list[i].elements;
      const k = Math.min(NX - 1, Math.max(0, Math.floor(e[12] / CH))) + NX * Math.min(NZ - 1, Math.max(0, Math.floor(e[14] / CH)));
      key[i] = k;
      bb.copy(geo.boundingBox).applyMatrix4(list[i]);
      lo[k * 3] = Math.min(lo[k * 3], bb.min.x);
      lo[k * 3 + 1] = Math.min(lo[k * 3 + 1], bb.min.y);
      lo[k * 3 + 2] = Math.min(lo[k * 3 + 2], bb.min.z);
      hi[k * 3] = Math.max(hi[k * 3], bb.max.x);
      hi[k * 3 + 1] = Math.max(hi[k * 3 + 1], bb.max.y);
      hi[k * 3 + 2] = Math.max(hi[k * 3 + 2], bb.max.z);
      for (let a = 0; a < 3; a++) sc[k * 4 + a] = (lo[k * 3 + a] + hi[k * 3 + a]) / 2;
      sc[k * 4 + 3] = 0.5 * Math.hypot(hi[k * 3] - lo[k * 3], hi[k * 3 + 1] - lo[k * 3 + 1], hi[k * 3 + 2] - lo[k * 3 + 2]) + 0.05;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, c) => key[a] - key[c] || a - c);
    const mats = new Float32Array(n * 16);
    const cols = shades && shades.some((v) => v !== 1) ? new Float32Array(n * 3) : null;
    const start = new Int32Array(NCH + 1); // les objets du morceau k : de start[k] à start[k + 1]
    order.forEach((i, j) => {
      list[i].toArray(mats, j * 16);
      if (cols) cols.fill(shades[i], j * 3, j * 3 + 3);
      start[key[i] + 1]++;
    });
    for (let k = 0; k < NCH; k++) start[k + 1] += start[k];
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.instanceMatrix.array.set(mats);
    inst.instanceMatrix.needsUpdate = true;
    if (cols) inst.instanceColor = new THREE.InstancedBufferAttribute(cols.slice(), 3);
    inst.frustumCulled = false;
    group.add(inst);
    sets.push({ inst, mats, cols, start, near });
    nVis = -1; // (un ensemble arrivé après coup : la prochaine image refait le tri)
  };
  for (const b of bins.values()) addSet(b.geo, b.mat, b.m, b.c);
  // les modèles posés un par un (Poly Haven, CC0), une fois chargés : une matière de la scène par matière du modèle
  const kitMats = new Map();
  // les variantes « morceau@peinture » : la même photo de métal, teintée
  const TINT = { red: [0.85, 0.17, 0.12], green: [0.42, 0.6, 0.36] };
  const kitMat = (src, variant = '') => {
    const key = src.uuid + '@' + variant;
    if (!kitMats.has(key)) {
      const color = src.color ? src.color.clone().multiplyScalar(0.85) : new THREE.Color('#888888');
      if (TINT[variant]) color.multiply(new THREE.Color(...TINT[variant]));
      kitMats.set(
        key,
        baked(
          new THREE.MeshLambertMaterial({
            map: src.map || null,
            color,
            alphaTest: src.alphaTest || (src.transparent || src.alphaMap ? 0.5 : 0),
            alphaMap: src.alphaMap || null,
            side: src.side,
          }),
        ),
      );
    }
    return kitMats.get(key);
  };
  for (const [name, places] of kits)
    loadKit(name).then((pieces) => {
      for (const [piece, list] of places) {
        const [pname, variant = ''] = piece.split('@');
        for (const [pn, parts] of pieces) {
          if (pname !== '*' && pn !== pname) continue;
          for (const part of parts) addSet(part.geo, kitMat(part.mat, variant), list.m.map((m) => m.clone().multiply(part.m)), list.c, true);
        }
      }
    });
  const NEAR = 50; // (brouillard exp² de densité 0,058, selon la profondeur de vue : à 50 m, il reste 0,02 % de l'objet)
  const vis = new Int32Array(NCH);
  const visN = new Int32Array(NCH); // ceux d'entre eux qui sont à moins de NEAR m
  let nNear = -1;
  const sph = new THREE.Sphere();
  // n morceaux visibles (vis), dont nn proches (visN) : on recopie leurs objets au début des tampons, et on n'envoie que
  // cette partie
  const fill = (n, nn) => {
    for (const S of sets) {
      const am = S.inst.instanceMatrix.array;
      const ac = S.cols && S.inst.instanceColor.array;
      const L = S.near ? visN : vis;
      const m = S.near ? nn : n;
      let o = 0;
      for (let j = 0; j < m; j++) {
        const a = S.start[L[j]];
        const b = S.start[L[j] + 1];
        if (b === a) continue;
        am.set(S.mats.subarray(a * 16, b * 16), o * 16);
        if (ac) ac.set(S.cols.subarray(a * 3, b * 3), o * 3);
        o += b - a;
      }
      S.inst.count = o;
      S.inst.instanceMatrix.clearUpdateRanges();
      S.inst.instanceMatrix.addUpdateRange(0, o * 16);
      S.inst.instanceMatrix.needsUpdate = true;
      if (ac) {
        S.inst.instanceColor.clearUpdateRanges();
        S.inst.instanceColor.addUpdateRange(0, o * 3);
        S.inst.instanceColor.needsUpdate = true;
      }
    }
  };
  const api = {
    off: false, // (?debug : tout dessiner, pour comparer l'image avec et sans le tri)
    // V : le point de vue (voir cullFor dans scene.js) ; here : la caméra est à cet étage ; insetHere : celle du médaillon
    cull(V, here = true, insetHere = false) {
      const gy = group.position.y;
      let n = 0;
      let nn = 0;
      let ch = false;
      for (let k = 0; k < NCH; k++) {
        const r = sc[k * 4 + 3];
        if (r < 0) continue;
        const x = sc[k * 4];
        const y = gy + sc[k * 4 + 1];
        const z = sc[k * 4 + 2];
        let ok = api.off;
        if (!ok && here && (x - V.cam.x) * V.fwd.x + (y - V.cam.y) * V.fwd.y + (z - V.cam.z) * V.fwd.z - r <= V.R) {
          sph.center.set(x, y, z);
          sph.radius = r;
          ok = V.fr.intersectsSphere(sph);
        }
        if (!ok && V.inset && insetHere) {
          sph.center.set(x, y, z);
          sph.radius = r;
          ok = V.ifr.intersectsSphere(sph);
        }
        if (!ok) continue;
        if (vis[n] !== k) ch = true;
        vis[n++] = k;
        // proche : la sphère du morceau entame les NEAR premiers mètres de profondeur de la caméra (c'est la profondeur,
        // pas la distance, qui règle le brouillard), ou le médaillon la voit
        const dc = (x - V.cam.x) * V.fwd.x + (y - V.cam.y) * V.fwd.y + (z - V.cam.z) * V.fwd.z - r;
        if (api.off || dc <= NEAR || (V.inset && insetHere && V.ifr.intersectsSphere(sph.set(sph.center.set(x, y, z), r)))) {
          if (visN[nn] !== k) ch = true;
          visN[nn++] = k;
        }
      }
      if (n !== nVis || nn !== nNear) ch = true;
      if (!ch) return;
      nVis = n;
      nNear = nn;
      fill(n, nn);
    },
  };
  return api;
}
