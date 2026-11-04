// The Backrooms - Textures du Level 0 (moquette, papier peint) et du Level 1 (béton de l'entrepôt)
// Motifs dessinés au canvas, salis par des photos CC0 de Poly Haven dès qu'elles sont chargées :
// backrooms/tex/ pour le Level 0, les bétons de kart/tex/ (déjà sur le site) pour le Level 1.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const TEX = new URL('../tex/', import.meta.url).href;
const KART_TEX = new URL('../../kart/tex/', import.meta.url).href;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function loadImage(name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = name.startsWith('kart:') ? KART_TEX + name.slice(5) : TEX + name;
  });
}

function noise(ctx, w, h, amount) {
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  ctx.putImageData(d, 0, 0);
}

// Papier peint jaune pâle des films : fines rayures verticales et motif en chevrons à peine visible, un peu jauni,
// cloqué par l'humidité, avec sa plinthe (une face de mur = 2,5 m × 3 m)
function drawWallpaper(ctx, S, grime) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#d4c37a';
  ctx.fillRect(0, 0, S, S);
  const band = S / 16; // 16 lés de rayures par face
  for (let i = 0; i < 16; i++) {
    const x = i * band;
    ctx.fillStyle = 'rgba(150, 128, 52, 0.16)';
    ctx.fillRect(x, 0, band * 0.5, S);
    ctx.fillStyle = 'rgba(110, 92, 36, 0.22)';
    ctx.fillRect(x, 0, 1.2, S);
    ctx.fillRect(x + band * 0.5, 0, 1, S);
    // chevrons pointés vers le haut, au milieu de la rayure claire
    ctx.strokeStyle = 'rgba(140, 118, 46, 0.32)';
    ctx.lineWidth = 1.4;
    const cx = x + band * 0.75;
    for (let y = (i % 2) * 9; y < S; y += 18) {
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + 5);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx + 6, y + 5);
      ctx.stroke();
    }
  }
  // le papier jauni, plus clair au milieu des lés
  if (grime) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(grime, 0, 0, S, S);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // coulures depuis le plafond
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * S;
    const len = S * (0.1 + Math.random() * 0.3);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(105, 82, 30, 0.28)');
    g.addColorStop(1, 'rgba(105, 82, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 3 + Math.random() * 10, len);
  }
  // salissures au ras de la plinthe
  const dirt = ctx.createLinearGradient(0, S * 0.82, 0, S * 0.955);
  dirt.addColorStop(0, 'rgba(90, 70, 30, 0)');
  dirt.addColorStop(1, 'rgba(90, 70, 30, 0.3)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, S * 0.82, S, S * 0.14);
  // plinthe en vinyle brun, éraflée
  ctx.fillStyle = '#6b5a35';
  ctx.fillRect(0, S * 0.955, S, S * 0.045);
  ctx.fillStyle = 'rgba(255,240,200,0.12)';
  ctx.fillRect(0, S * 0.955, S, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, S * 0.951, S, 2);
  noise(ctx, S, S, 10);
}

// Moquette humide jaunâtre : la photo est recolorée, sinon une trame de bruit
function drawCarpet(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  if (photo) {
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = '#9c8a3c';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = '#5f5226';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.fillStyle = '#8f7d45';
    ctx.fillRect(0, 0, S, S);
    noise(ctx, S, S, 36);
  }
}

// Dalles de faux plafond (4 × 4 par case), salies par la photo
function drawCeiling(ctx, S, grime) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ddd6bd';
  ctx.fillRect(0, 0, S, S);
  if (grime) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(grime, 0, 0, S, S);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // trous des dalles acoustiques
  ctx.fillStyle = 'rgba(90, 80, 60, 0.18)';
  for (let i = 0; i < 1400; i++) ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
  // rails de la grille métallique
  const n = 4;
  ctx.fillStyle = '#9c957e';
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * S;
    ctx.fillRect(p - 2, 0, 4, S);
    ctx.fillRect(0, p - 2, S, 4);
  }
}

// Level 1 : béton brut humide, coulures sombres au pied, bande jaune et noire de sécurité
function drawConcreteWall(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#77776f';
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.globalCompositeOperation = 'luminosity';
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#9da3a6';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  } else noise(ctx, S, S, 40);
  // joints des banches
  ctx.fillStyle = 'rgba(30, 32, 34, 0.35)';
  ctx.fillRect(0, S * 0.33, S, 3);
  ctx.fillRect(0, S * 0.66, S, 3);
  // humidité qui remonte
  const g = ctx.createLinearGradient(0, S * 0.55, 0, S);
  g.addColorStop(0, 'rgba(20, 24, 26, 0)');
  g.addColorStop(1, 'rgba(20, 24, 26, 0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * S;
    const w = 4 + Math.random() * 10;
    const gg = ctx.createLinearGradient(0, 0, 0, S * (0.4 + Math.random() * 0.4));
    gg.addColorStop(0, 'rgba(25, 28, 30, 0.35)');
    gg.addColorStop(1, 'rgba(25, 28, 30, 0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x, 0, w, S);
  }
  // bande de sécurité au pied
  const y0 = S * 0.93;
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, y0, S, S - y0);
  ctx.fillStyle = '#16181a';
  for (let x = -S; x < S * 2; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, S);
    ctx.lineTo(x + 20, S);
    ctx.lineTo(x + 20 + (S - y0), y0);
    ctx.lineTo(x + (S - y0), y0);
    ctx.fill();
  }
}

// Dalle de béton lissé, taches d'huile et flaques ; une ligne jaune délavée au bord de chaque case
function drawConcreteFloor(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5b5d5c';
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.globalCompositeOperation = 'luminosity';
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#7d8486';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  } else noise(ctx, S, S, 30);
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 20 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(12, 14, 16, 0.4)');
    g.addColorStop(1, 'rgba(12, 14, 16, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.fillStyle = 'rgba(201, 162, 39, 0.28)';
  ctx.fillRect(0, 0, S, 7);
}

// Plafond de béton sombre avec un chemin de câbles
function drawConcreteCeiling(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#3c3f40';
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = '#26292b';
  ctx.fillRect(S * 0.45, 0, S * 0.1, S);
  ctx.fillStyle = '#4b5052';
  for (let y = 0; y < S; y += 32) ctx.fillRect(S * 0.45, y, S * 0.1, 4);
}

export function createBackroomsTextures(level = 0) {
  const S = 512;
  const L1 = level === 1;
  const [wallCanvas, wctx] = canvas(S);
  const [carpetCanvas, cctx] = canvas(S);
  const [ceilCanvas, clctx] = canvas(S);
  const drawW = L1 ? drawConcreteWall : drawWallpaper;
  const drawF = L1 ? drawConcreteFloor : drawCarpet;
  const drawC = L1 ? drawConcreteCeiling : drawCeiling;
  drawW(wctx, S, null);
  drawF(cctx, S, null);
  drawC(clctx, S, null);

  const wall = tex(wallCanvas);
  const carpet = tex(carpetCanvas);
  const ceiling = tex(ceilCanvas);

  // les photos arrivent un peu plus tard : on redessine par-dessus
  const files = L1 ? ['kart:cwall.jpg', 'kart:concrete.jpg', 'kart:concrete.jpg'] : ['papier.jpg', 'moquette.jpg', 'plafond.jpg'];
  const ready = Promise.all(files.map(loadImage)).then(([pap, moq, pla]) => {
    if (pap) { drawW(wctx, S, pap); wall.needsUpdate = true; }
    if (moq) { drawF(cctx, S, moq); carpet.needsUpdate = true; }
    if (pla) { drawC(clctx, S, pla); ceiling.needsUpdate = true; }
  });

  // Portes d'ascenseur en inox brossé
  const [doorCanvas, dctx] = canvas(128, 256);
  dctx.fillStyle = '#8e9398';
  dctx.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x++) {
    dctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'}, ${Math.random() * 0.08})`;
    dctx.fillRect(x, 0, 1, 256);
  }
  dctx.fillStyle = 'rgba(0,0,0,0.25)';
  dctx.fillRect(0, 0, 3, 256);
  dctx.fillRect(125, 0, 3, 256);
  const steel = tex(doorCanvas);
  steel.wrapS = steel.wrapT = THREE.ClampToEdgeWrapping;

  // Caisse en bois des étagères
  const [crateCanvas, kctx] = canvas(128);
  kctx.fillStyle = '#8a6a3f';
  kctx.fillRect(0, 0, 128, 128);
  noise(kctx, 128, 128, 30);
  kctx.fillStyle = '#5e4526';
  for (let y = 0; y < 128; y += 32) kctx.fillRect(0, y, 128, 3);
  kctx.lineWidth = 10;
  kctx.strokeStyle = '#6d5030';
  kctx.strokeRect(5, 5, 118, 118);
  kctx.beginPath();
  kctx.moveTo(8, 8);
  kctx.lineTo(120, 120);
  kctx.stroke();
  const crate = tex(crateCanvas);

  // Nappe de brouillard au ras du sol (taches douces, transparentes)
  const [fogCanvas, fctx] = canvas(256);
  fctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 20 + Math.random() * 60;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const g = fctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      fctx.fillStyle = g;
      fctx.fillRect(0, 0, 256, 256);
    }
  }
  const fog = new THREE.CanvasTexture(fogCanvas);
  fog.wrapS = fog.wrapT = THREE.RepeatWrapping;

  // Cassette VHS
  const [vhsCanvas, vctx] = canvas(256, 160);
  vctx.fillStyle = '#1c1b18';
  vctx.fillRect(0, 0, 256, 160);
  vctx.fillStyle = '#e5dfcc';
  vctx.fillRect(20, 20, 216, 65);
  vctx.fillStyle = '#0a0a09';
  vctx.fillRect(40, 100, 176, 40);
  vctx.fillStyle = '#555';
  vctx.beginPath();
  vctx.arc(80, 120, 14, 0, Math.PI * 2);
  vctx.arc(176, 120, 14, 0, Math.PI * 2);
  vctx.fill();
  vctx.fillStyle = '#9b1c1c';
  vctx.font = 'bold 20px monospace';
  vctx.fillText('BACKROOMS // TAPE', 30, 48);
  vctx.fillStyle = '#333';
  vctx.font = '16px monospace';
  vctx.fillText('NE PAS EFFACER', 30, 72);
  const vhs = tex(vhsCanvas);
  vhs.wrapS = vhs.wrapT = THREE.ClampToEdgeWrapping;

  // Porte de sortie métallique (sans le panneau, posé à part)
  const [exitCanvas, ectx] = canvas(256, 512);
  ectx.fillStyle = '#3b3f45';
  ectx.fillRect(0, 0, 256, 512);
  ectx.strokeStyle = '#25282c';
  ectx.lineWidth = 6;
  ectx.strokeRect(24, 24, 208, 200);
  ectx.strokeRect(24, 260, 208, 220);
  ectx.fillStyle = '#9aa0a8';
  ectx.fillRect(196, 250, 40, 14); // barre anti-panique
  ectx.fillStyle = '#d97706';
  ectx.fillRect(0, 488, 256, 24);
  ectx.fillStyle = '#000';
  for (let x = -24; x < 256; x += 32) {
    ectx.beginPath();
    ectx.moveTo(x, 512);
    ectx.lineTo(x + 16, 512);
    ectx.lineTo(x + 40, 488);
    ectx.lineTo(x + 24, 488);
    ectx.fill();
  }
  noise(ectx, 256, 512, 18);
  const exit = tex(exitCanvas);
  exit.wrapS = exit.wrapT = THREE.ClampToEdgeWrapping;

  // Panneau EXIT lumineux
  const [signCanvas, sctx] = canvas(256, 96);
  sctx.fillStyle = '#0b0b0b';
  sctx.fillRect(0, 0, 256, 96);
  sctx.fillStyle = '#fff';
  sctx.font = 'bold 64px sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText('EXIT', 128, 50);
  const sign = tex(signCanvas);
  sign.wrapS = sign.wrapT = THREE.ClampToEdgeWrapping;

  // Étiquette de l'eau d'amande
  const [labelCanvas, lctx] = canvas(128, 64);
  lctx.fillStyle = '#f1e7c9';
  lctx.fillRect(0, 0, 128, 64);
  lctx.fillStyle = '#7a4a1a';
  lctx.font = 'bold 15px sans-serif';
  lctx.textAlign = 'center';
  lctx.fillText("EAU", 64, 26);
  lctx.fillText("D'AMANDE", 64, 46);
  const label = tex(labelCanvas);

  // Pavé lumineux encastré (diffuseur prismatique dans son cadre) ; au Level 1, un tube nu sous sa réglette
  const [lampCanvas, pctx] = canvas(128, 64);
  pctx.fillStyle = '#3a3a36';
  pctx.fillRect(0, 0, 128, 64);
  pctx.fillStyle = '#ffffff';
  pctx.fillRect(5, 5, 118, 54);
  pctx.fillStyle = 'rgba(160, 150, 120, 0.35)';
  for (let x = 5; x < 123; x += 3) pctx.fillRect(x, 5, 1, 54);
  for (let y = 5; y < 59; y += 3) pctx.fillRect(5, y, 118, 1);
  pctx.fillStyle = 'rgba(60, 58, 50, 0.6)';
  pctx.fillRect(5, 30, 118, 3); // la barre du milieu
  const lamp = tex(lampCanvas);
  lamp.wrapS = lamp.wrapT = THREE.ClampToEdgeWrapping;

  // Prise électrique : plaque jaunie, deux trous ronds
  const [outCanvas, octx] = canvas(64, 96);
  octx.fillStyle = '#e4dcc4';
  octx.fillRect(0, 0, 64, 96);
  octx.strokeStyle = 'rgba(80, 70, 50, 0.5)';
  octx.lineWidth = 3;
  octx.strokeRect(2, 2, 60, 92);
  octx.fillStyle = '#d6ccb0';
  octx.beginPath();
  octx.arc(32, 48, 17, 0, Math.PI * 2);
  octx.fill();
  octx.fillStyle = '#1c1a16';
  for (const x of [25, 39]) {
    octx.beginPath();
    octx.arc(x, 48, 3.2, 0, Math.PI * 2);
    octx.fill();
  }
  octx.fillStyle = '#8a8270';
  octx.fillRect(30, 12, 4, 4);
  octx.fillRect(30, 80, 4, 4);
  noise(octx, 64, 96, 10);
  const outlet = tex(outCanvas);
  outlet.wrapS = outlet.wrapT = THREE.ClampToEdgeWrapping;

  // Grille d'aération du faux plafond : lames grises et poussière noire entre elles
  const [ventCanvas, vtctx] = canvas(128);
  vtctx.fillStyle = '#c9c4b2';
  vtctx.fillRect(0, 0, 128, 128);
  vtctx.fillStyle = '#9b9584';
  vtctx.fillRect(6, 6, 116, 116);
  for (let y = 12; y < 118; y += 9) {
    vtctx.fillStyle = '#26241e';
    vtctx.fillRect(12, y, 104, 4);
    vtctx.fillStyle = '#d5d0bf';
    vtctx.fillRect(12, y + 4, 104, 2);
  }
  noise(vtctx, 128, 128, 16);
  const vent = tex(ventCanvas);
  vent.wrapS = vent.wrapT = THREE.ClampToEdgeWrapping;

  return { wall, carpet, ceiling, vhs, exit, sign, label, steel, crate, fog, lamp, outlet, vent, ready };
}
