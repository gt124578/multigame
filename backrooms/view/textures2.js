// The Backrooms (Level 2) - Textures des galeries de service : carrelage émaillé ocre ou brun dessiné au canvas
// (avec son relief : joints creux, chanfreins), brique rouge des réserves, brique peinte des chaufferies, béton ciré
// du sol, dalle peinte qui s'écaille au plafond. Le sol et le plafond sont salis par les photos CC0 de Poly Haven
// déjà utilisées au Level 1 (backrooms/tex/l1_*). Chaque mur fait une face de case : 2,5 m de large, 3,3 m de haut.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const TEX = new URL('../tex/', import.meta.url).href;
const FW = 768; // une face de mur : 2,5 m
const FH = 1024; // 3,3 m
const PX = FW / 2.5; // pixels par mètre (en largeur ; en hauteur c'est presque pareil : 310)
const PY = FH / 3.3;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function loadImage(name) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = TEX + name;
  });
}

const R = Math.random;
const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
// hauteur (m, depuis le sol) → ligne du canvas
const yAt = (m) => FH - m * PY;

// grain fin, en ajoutant ou retranchant la même valeur aux trois canaux
function grain(ctx, w, h, amount) {
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (R() - 0.5) * amount;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  ctx.putImageData(d, 0, 0);
}

// taches douces (multiplication ou éclaircissement), coulures depuis le haut, crasse au pied du mur
function blotches(ctx, w, h, n, color, rMin, rMax, yMin = 0, yMax = h) {
  for (let i = 0; i < n; i++) {
    const x = R() * w;
    const y = yMin + R() * (yMax - yMin);
    const r = rMin + R() * (rMax - rMin);
    for (const ox of [-w, 0, w]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
}

function drips(ctx, n, color, maxLen) {
  for (let i = 0; i < n; i++) {
    const x = R() * FW;
    const w = 2 + R() * 9;
    const len = maxLen * (0.3 + R() * 0.7);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w * 0.6 + (R() - 0.5) * 4, len);
    ctx.lineTo(x + w * 0.3, len);
    ctx.fill();
  }
}

// Carrelage émaillé. pal : { h, s, l, var, grout, cove, rowH (m), cols }. Renvoie la couleur et le relief.
function tileWall(pal) {
  const [cv, ctx] = canvas(FW, FH);
  const [bv, btx] = canvas(FW, FH);
  // relief : 0 au fond des joints, haut sur l'émail (et l'émail brille : le reflet suit le relief)
  btx.fillStyle = '#404040';
  btx.fillRect(0, 0, FW, FH);

  // au-dessus du carrelage : enduit peint crème, sale, qui monte jusqu'au plafond
  const top = 2.47;
  ctx.fillStyle = hsl(44, 18, 66);
  ctx.fillRect(0, 0, FW, yAt(top));
  blotches(ctx, FW, yAt(top), 40, 'rgba(70, 60, 40, 0.16)', 20, 90);
  drips(ctx, 26, 'rgba(92, 64, 34, 0.32)', yAt(top) * 0.95);
  btx.fillStyle = '#7a7a7a';
  btx.fillRect(0, 0, FW, yAt(top));

  // le carrelage du mur
  const tw = FW / pal.cols;
  const th = pal.rowH * PY;
  const y0 = yAt(0.16); // haut de la plinthe à gorge
  ctx.fillStyle = pal.grout;
  ctx.fillRect(0, yAt(top), FW, y0 - yAt(top));
  const rows = Math.floor((y0 - yAt(top - 0.07)) / th);
  const tile = (x, y, w, h, l, cap = false) => {
    const jit = (R() - 0.5) * pal.var;
    const L = l + jit + (R() < 0.04 ? (R() - 0.5) * 14 : 0); // carreau de remplacement, un peu d'une autre teinte
    const hh = pal.h + (R() - 0.5) * 4;
    const ss = pal.s + (R() - 0.5) * 8;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, hsl(hh, ss, L + 3.5));
    g.addColorStop(0.55, hsl(hh, ss, L));
    g.addColorStop(1, hsl(hh, ss + 2, L - 4));
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    // l'émail s'amasse et fonce au bord, le chanfrein du haut accroche la lumière
    ctx.fillStyle = hsl(hh, ss, L + 9, 0.55);
    ctx.fillRect(x + 3, y + 2, w - 6, 2);
    ctx.fillStyle = hsl(hh, ss + 5, L - 8, 0.35);
    ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
    ctx.fillRect(x + w - 4, y + 2, 2, h - 4);
    // reflet diffus en biais
    if (R() < 0.6) {
      const sg = ctx.createLinearGradient(x, y, x + w, y + h);
      sg.addColorStop(0, 'rgba(255, 250, 230, 0)');
      sg.addColorStop(0.45, `rgba(255, 250, 230, ${0.04 + R() * 0.05})`);
      sg.addColorStop(0.6, 'rgba(255, 250, 230, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
    // fissures et éclats
    if (R() < 0.035) {
      ctx.strokeStyle = 'rgba(30, 22, 12, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let px = x + 3 + R() * (w - 6);
      let py = y + 2;
      ctx.moveTo(px, py);
      while (py < y + h - 3) {
        px += (R() - 0.5) * 8;
        py += 3 + R() * 6;
        ctx.lineTo(Math.max(x + 2, Math.min(x + w - 2, px)), Math.min(y + h - 2, py));
      }
      ctx.stroke();
    }
    if (R() < 0.025) {
      ctx.fillStyle = pal.grout;
      const cx = R() < 0.5 ? x + 2 : x + w - 9;
      const cy = R() < 0.5 ? y + 2 : y + h - 8;
      ctx.beginPath();
      ctx.ellipse(cx + 3.5, cy + 3, 4 + R() * 4, 3 + R() * 3, R(), 0, Math.PI * 2);
      ctx.fill();
    }
    // relief
    const bg = btx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#b8b8b8');
    bg.addColorStop(0.08, '#d6d6d6');
    bg.addColorStop(0.92, '#d6d6d6');
    bg.addColorStop(1, '#a8a8a8');
    btx.fillStyle = bg;
    btx.fillRect(x + 2, y + 2, w - 4, h - 4);
    if (cap) {
      btx.fillStyle = '#e8e8e8';
      btx.fillRect(x + 2, y + h * 0.35, w - 4, h * 0.3);
    }
  };
  for (let r = 0; r < rows; r++) {
    const y = y0 - (r + 1) * th;
    for (let c = 0; c < pal.cols; c++) tile(c * tw, y, tw, th, pal.l);
  }
  // rangée de couronnement arrondie
  const capY = y0 - rows * th - 0.065 * PY;
  for (let c = 0; c < pal.cols; c++) tile(c * tw, capY, tw, 0.065 * PY, pal.l - 6, true);
  ctx.fillStyle = 'rgba(20, 14, 8, 0.35)';
  ctx.fillRect(0, capY - 3, FW, 3);
  // plinthe à gorge, plus sombre
  for (let c = 0; c < pal.cols / 2; c++) {
    const x = c * tw * 2;
    const g = ctx.createLinearGradient(0, y0, 0, FH);
    g.addColorStop(0, hsl(pal.cove[0], pal.cove[1], pal.cove[2] + 10));
    g.addColorStop(0.2, hsl(pal.cove[0], pal.cove[1], pal.cove[2]));
    g.addColorStop(1, hsl(pal.cove[0], pal.cove[1], pal.cove[2] - 5));
    ctx.fillStyle = pal.grout;
    ctx.fillRect(x, y0, tw * 2, FH - y0);
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, y0 + 2, tw * 2 - 4, FH - y0 - 2);
    btx.fillStyle = '#d0d0d0';
    btx.fillRect(x + 2, y0 + 2, tw * 2 - 4, FH - y0 - 2);
  }

  // salissures : crasse au pied, traînées de rouille depuis les tuyaux, chocs de chariots, marbrures
  const foot = ctx.createLinearGradient(0, yAt(0.7), 0, FH);
  foot.addColorStop(0, 'rgba(40, 30, 18, 0)');
  foot.addColorStop(1, 'rgba(40, 30, 18, 0.32)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, yAt(0.7), FW, FH - yAt(0.7));
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  blotches(ctx, FW, FH, 18, 'rgba(150, 128, 96, 0.22)', 40, 160);
  ctx.restore();
  drips(ctx, 12, 'rgba(110, 58, 22, 0.28)', FH * 0.55);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(30, 22, 14, ${0.08 + R() * 0.12})`;
    const y = yAt(0.85 + R() * 0.25);
    ctx.fillRect(R() * FW, y, 30 + R() * 140, 2 + R() * 4);
  }
  grain(ctx, FW, FH, 9);
  grain(btx, FW, FH, 6);
  return { map: tex(cv), bump: tex(bv, false), rowH: pal.rowH };
}

// Brique rouge (réserves) ; painted : soubassement peint vert sombre et haut peint crème (chaufferies)
function brickWall(painted = false) {
  const [cv, ctx] = canvas(FW, FH);
  const [bv, btx] = canvas(FW, FH);
  drawBricks(ctx, btx, painted, null, null);
  const map = tex(cv);
  const bump = tex(bv, false);
  // les photos arrivent : la vraie brique (et sa profondeur) remplace le dessin, salie de la même façon
  const redraw = (photo, relief) => {
    if (!photo) return;
    drawBricks(ctx, btx, painted, photo, relief);
    map.needsUpdate = true;
    bump.needsUpdate = true;
  };
  return { map, bump, redraw };
}

// une photo répétée sur toute la face, w × h pixels par répétition (calée sur le pied du mur)
function tilePhoto(ctx, img, w, h) {
  for (let y = FH; y > -h; y -= h) for (let x = 0; x < FW; x += w) ctx.drawImage(img, x, y - h, w + 0.5, h + 0.5);
}

// photo : Poly Haven red_brick_03 ou painted_worn_brick (déjà peinte en crème) ; relief : sa
// carte de profondeur, qui sert de relief (joints creux, briques bombées, écailles)
function drawBricks(ctx, btx, painted, photo, relief) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  btx.globalCompositeOperation = 'source-over';
  btx.globalAlpha = 1;
  if (photo) {
    // un nombre entier de répétitions sur la largeur d'une face (2,5 m) : pas de raccord d'une case à l'autre
    // (0,83 m pour la brique rouge, 1,25 m pour la peinte, un peu plus petites que nature)
    const w = FW / (painted ? 2 : 3);
    const h = (w * PY) / PX;
    tilePhoto(ctx, photo, w, h);
    btx.fillStyle = '#808080';
    btx.fillRect(0, 0, FW, FH);
    if (relief) tilePhoto(btx, relief, w, h);
    // la photo est propre et claire : l'âge des réserves (tons plus sombres, moins saturés)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = painted ? 'rgb(214, 208, 190)' : 'rgb(178, 160, 150)';
    ctx.fillRect(0, 0, FW, FH);
    ctx.globalCompositeOperation = 'source-over';
    bricksGrime(ctx, painted, true);
    grain(ctx, FW, FH, 6);
    grain(btx, FW, FH, 6);
    return;
  }
  const course = 0.075 * PY;
  const len = 0.225 * PX;
  const mortar = 3;
  ctx.fillStyle = '#5e574b';
  ctx.fillRect(0, 0, FW, FH);
  btx.fillStyle = '#4a4a4a';
  btx.fillRect(0, 0, FW, FH);
  const tones = [[12, 42, 27], [16, 45, 30], [10, 38, 22], [20, 40, 33], [8, 30, 18]];
  for (let r = 0, y = FH; y > -course; r++, y -= course) {
    const off = r % 2 ? len / 2 : 0;
    for (let x = -off; x < FW; x += len) {
      const t = tones[Math.floor(R() * tones.length)];
      const L = t[2] + (R() - 0.5) * 6;
      ctx.fillStyle = hsl(t[0], t[1], L);
      ctx.fillRect(x + mortar / 2, y - course + mortar / 2, len - mortar, course - mortar);
      // grain de la brique, arêtes émoussées, éclats
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = R() < 0.5 ? `rgba(0,0,0,${R() * 0.18})` : `rgba(255,220,190,${R() * 0.08})`;
        ctx.fillRect(x + R() * len, y - course + R() * course, 1 + R() * 4, 1 + R() * 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + mortar / 2, y - mortar / 2 - 2, len - mortar, 2);
      if (R() < 0.05) {
        ctx.fillStyle = hsl(t[0] + 6, t[1] - 10, L + 12, 0.7);
        ctx.fillRect(x + R() * len * 0.7, y - course + 2, 8 + R() * 14, course * 0.6);
      }
      btx.fillStyle = `rgb(${170 + R() * 30 | 0},${170 + R() * 30 | 0},${170 + R() * 30 | 0})`;
      btx.fillRect(x + mortar / 2 + 1, y - course + mortar / 2 + 1, len - mortar - 2, course - mortar - 2);
    }
  }
  bricksGrime(ctx, painted, false);
  grain(ctx, FW, FH, 12);
  grain(btx, FW, FH, 20);
}

// suie en haut, humidité et salpêtre blanc au pied ; painted : soubassement vert sombre sous le crème, écaillé
function bricksGrime(ctx, painted, photo) {
  const soot = ctx.createLinearGradient(0, 0, 0, FH * 0.35);
  soot.addColorStop(0, 'rgba(12, 10, 8, 0.45)');
  soot.addColorStop(1, 'rgba(12, 10, 8, 0)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, FW, FH * 0.35);
  const damp = ctx.createLinearGradient(0, yAt(0.9), 0, FH);
  damp.addColorStop(0, 'rgba(14, 12, 10, 0)');
  damp.addColorStop(1, 'rgba(14, 12, 10, 0.45)');
  ctx.fillStyle = damp;
  ctx.fillRect(0, yAt(0.9), FW, FH - yAt(0.9));
  blotches(ctx, FW, FH, 14, 'rgba(225, 222, 205, 0.22)', 20, 70, yAt(0.6), FH);
  drips(ctx, 10, 'rgba(20, 16, 12, 0.3)', FH * 0.6);
  if (painted && photo) {
    // la photo est déjà peinte en crème, écaillée : le soubassement vert sombre se peint par-dessus (le relief de la
    // brique et les écailles restent visibles au travers)
    const band = yAt(1.3);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = hsl(140, 22, 36);
    ctx.fillRect(0, band, FW, FH - band);
    ctx.restore();
    ctx.fillStyle = hsl(40, 30, 30, 0.9);
    ctx.fillRect(0, band - 4, FW, 5);
    drips(ctx, 16, 'rgba(100, 60, 25, 0.3)', FH * 0.7);
  } else if (painted) {
    // brique peinte : crème en haut, vert sombre brillant en bas, écaillée par endroits
    const band = yAt(1.3);
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = hsl(46, 20, 62);
    ctx.fillRect(0, 0, FW, band);
    ctx.fillStyle = hsl(140, 12, 24);
    ctx.fillRect(0, band, FW, FH - band);
    ctx.restore();
    ctx.fillStyle = hsl(40, 30, 30, 0.9);
    ctx.fillRect(0, band - 4, FW, 5);
    // écailles : la brique réapparaît
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    blotches(ctx, FW, FH, 30, 'rgba(160, 90, 70, 0.55)', 6, 26);
    ctx.restore();
    blotches(ctx, FW, band, 18, 'rgba(60, 50, 30, 0.2)', 30, 120);
    drips(ctx, 16, 'rgba(100, 60, 25, 0.3)', FH * 0.7);
  }
}

// Béton ciré du sol (une case : 2,5 m) : la photo de dalle usée, adoucie et éclaircie, granulats, traces de
// talochage, taches, un trait de sciage au bord
function drawFloor(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#a69f8e';
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.globalAlpha = 0.4;
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#e6dcc6';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = R() < 0.5 ? `rgba(40, 36, 30, ${R() * 0.25})` : `rgba(230, 222, 205, ${R() * 0.2})`;
    ctx.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
  }
  blotches(ctx, S, S, 5, 'rgba(30, 24, 16, 0.22)', 20, 70);
  ctx.fillStyle = 'rgba(20, 18, 14, 0.55)';
  ctx.fillRect(0, 0, S, 2);
  ctx.fillRect(0, 0, 2, S);
}

// Dalle de béton peinte au plafond : la peinture blanchâtre s'écaille et montre le béton, auréoles d'eau, suie
function drawCeiling(ctx, S, photo) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5c5850';
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.drawImage(photo, 0, 0, S, S);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#9a958a';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }
  // couche de peinture, trouée là où elle est tombée
  const [pv, ptx] = canvas(S);
  ptx.fillStyle = '#b9b4a5';
  ptx.fillRect(0, 0, S, S);
  blotches(ptx, S, S, 16, 'rgba(90, 80, 60, 0.25)', 30, 120);
  ptx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 22; i++) {
    const x = R() * S;
    const y = R() * S;
    ptx.beginPath();
    const n = 9;
    const rr = 8 + R() * 40;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = rr * (0.5 + R() * 0.7);
      if (k) ptx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ptx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ptx.fill();
  }
  ptx.globalCompositeOperation = 'source-over';
  // bord des écailles : ombre portée sous la peinture qui rebique
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(pv, 0, 0);
  ctx.shadowColor = 'transparent';
  // auréoles et suie
  for (let i = 0; i < 3; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 30 + R() * 80;
    ctx.strokeStyle = 'rgba(110, 80, 40, 0.3)';
    ctx.lineWidth = 3 + R() * 4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  blotches(ctx, S, S, 6, 'rgba(20, 16, 12, 0.3)', 30, 110);
  // le joint des banches
  ctx.fillStyle = 'rgba(20, 18, 16, 0.4)';
  ctx.fillRect(0, S / 2 - 1, S, 3);
}

// Un atlas de plaques et de panneaux (8 sur 2 rangées de 4, chacune 256 × 128)
export const SIGNS = ['OUT OF BOUNDS', 'AUTHORIZED PERSONNEL ONLY', 'BOILER ROOM', 'CAUTION HOT PIPES', 'FLOOR LOAD LIMIT', 'STORAGE', 'ELECTRICAL', 'NO SMOKING'];
function drawSigns() {
  const [cv, ctx] = canvas(1024, 256);
  SIGNS.forEach((t, i) => {
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 128;
    const dark = i === 0 || i === 3;
    ctx.fillStyle = dark ? '#151512' : i === 1 || i === 7 ? '#a8231b' : '#dcd6c4';
    ctx.fillRect(x + 4, y + 4, 248, 120);
    ctx.strokeStyle = dark ? '#c9b33a' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 10, y + 10, 236, 108);
    ctx.fillStyle = dark ? '#e3c84a' : i === 1 || i === 7 ? '#f4efe2' : '#1f1d18';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = t === 'FLOOR LOAD LIMIT' ? ['BASEMENT', 'FLOOR LOAD LIMIT', '250 LBS / SQ FT'] : t.split(' ').length > 2 ? [t.split(' ').slice(0, 1).join(' '), t.split(' ').slice(1).join(' ')] : t.split(' ');
    const size = words.length > 2 ? 22 : 34;
    ctx.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
    words.forEach((w, k) => ctx.fillText(w, x + 128, y + 64 + (k - (words.length - 1) / 2) * (size + 6)));
    // vis, rouille, peinture usée
    ctx.fillStyle = '#6f6a5c';
    for (const [sx, sy] of [[16, 16], [240, 16], [16, 112], [240, 112]]) {
      ctx.beginPath();
      ctx.arc(x + sx, y + sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = `rgba(${R() < 0.5 ? '90,55,20' : '0,0,0'},${R() * 0.25})`;
      ctx.fillRect(x + 4 + R() * 248, y + 4 + R() * 120, 1 + R() * 5, 1 + R() * 3);
    }
  });
  const t = tex(cv);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Cadran de manomètre : graduations, zone rouge ; l'aiguille est à part
function drawGauge() {
  const [cv, ctx] = canvas(256);
  ctx.fillStyle = '#e9e4d4';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b2a26';
  ctx.stroke();
  ctx.strokeStyle = '#b3261e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 92, Math.PI * 0.25 - 0.6, Math.PI * 0.25);
  ctx.stroke();
  ctx.strokeStyle = '#222';
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
    ctx.lineWidth = i % 5 ? 2 : 4;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * (i % 5 ? 92 : 84), 128 + Math.sin(a) * (i % 5 ? 92 : 84));
    ctx.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
    ctx.stroke();
  }
  ctx.fillStyle = '#222';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('PSI', 128, 180);
  const g = ctx.createRadialGradient(90, 80, 10, 128, 128, 130);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(120,110,80,0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  const t = tex(cv);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Tuyaux : acier galvanisé marbré, calorifuge blanc aux joints de toile, cuivre oxydé, fonte noire rouillée,
// peinture rouge des sprinklers, tôle peinte des chaudières
function drawPipes() {
  const out = {};
  const make = (name, base, fn) => {
    const [cv, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    fn(ctx);
    grain(ctx, 256, 256, 10);
    out[name] = tex(cv);
  };
  make('galv', '#8d9193', (c) => {
    blotches(c, 256, 256, 20, 'rgba(60, 64, 66, 0.25)', 10, 40);
    blotches(c, 256, 256, 10, 'rgba(200, 205, 205, 0.2)', 8, 30);
    blotches(c, 256, 256, 6, 'rgba(120, 70, 30, 0.3)', 4, 14);
  });
  make('lagging', '#d8d4c8', (c) => {
    for (let x = 0; x < 256; x += 64) {
      c.fillStyle = 'rgba(60, 55, 45, 0.25)';
      c.fillRect(x, 0, 3, 256);
    }
    blotches(c, 256, 256, 14, 'rgba(110, 95, 70, 0.22)', 10, 50);
    blotches(c, 256, 256, 4, 'rgba(120, 80, 40, 0.3)', 6, 20);
  });
  make('copper', '#9a5a32', (c) => {
    blotches(c, 256, 256, 14, 'rgba(70, 130, 110, 0.28)', 6, 24);
    blotches(c, 256, 256, 14, 'rgba(50, 26, 12, 0.3)', 8, 30);
  });
  make('iron', '#2f2c29', (c) => {
    blotches(c, 256, 256, 22, 'rgba(110, 56, 22, 0.35)', 6, 26);
  });
  make('red', '#8a2219', (c) => {
    blotches(c, 256, 256, 14, 'rgba(40, 10, 6, 0.3)', 8, 30);
    blotches(c, 256, 256, 6, 'rgba(160, 140, 120, 0.2)', 4, 12);
  });
  make('boiler', '#4c5a52', (c) => {
    for (let y = 0; y < 256; y += 64) {
      c.fillStyle = 'rgba(20, 24, 22, 0.5)';
      c.fillRect(0, y, 256, 4);
      c.fillStyle = '#242826';
      for (let x = 6; x < 256; x += 16) {
        c.beginPath();
        c.arc(x, y + 10, 2.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    blotches(c, 256, 256, 18, 'rgba(110, 60, 25, 0.35)', 6, 30);
    drips(c, 0, '', 0);
  });
  make('steel', '#8a8778', (c) => {
    // porte métallique peinte, usée autour de la poignée
    blotches(c, 256, 256, 12, 'rgba(60, 56, 46, 0.25)', 10, 50);
    blotches(c, 256, 256, 5, 'rgba(110, 70, 30, 0.3)', 4, 12);
    c.fillStyle = 'rgba(40, 36, 30, 0.3)';
    c.fillRect(0, 230, 256, 26);
  });
  return out;
}

// Les halles : parpaings peints (gris clair en haut, gris-vert sombre en bas), une bande jaune et noire à hauteur de
// hanche (on y roule des chariots), crasse, coulures de rouille et chocs
function hallWall() {
  const [cv, ctx] = canvas(FW, FH);
  const [bv, btx] = canvas(FW, FH);
  const bw = 0.4 * PX;
  const bh = 0.2 * PY;
  ctx.fillStyle = hsl(40, 6, 56);
  ctx.fillRect(0, 0, FW, FH);
  btx.fillStyle = '#b4b4b4';
  btx.fillRect(0, 0, FW, FH);
  for (let r = 0, y = FH; y > -bh; r++, y -= bh) {
    const off = r % 2 ? bw / 2 : 0;
    for (let x = -off; x < FW; x += bw) {
      ctx.fillStyle = hsl(40, 5, 54 + (R() - 0.5) * 6, 0.6);
      ctx.fillRect(x + 2, y - bh + 2, bw - 4, bh - 4);
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = `rgba(0,0,0,${R() * 0.12})`;
        ctx.fillRect(x + R() * bw, y - bh + R() * bh, 1 + R() * 3, 1 + R() * 3);
      }
      // joints creux
      ctx.fillStyle = 'rgba(30, 28, 24, 0.35)';
      ctx.fillRect(x, y - 2, bw, 2);
      ctx.fillRect(x, y - bh, 2, bh);
      btx.fillStyle = '#5a5a5a';
      btx.fillRect(x, y - 3, bw, 3);
      btx.fillRect(x, y - bh, 3, bh);
    }
  }
  // soubassement peint sombre
  const band = yAt(1.15);
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = hsl(150, 8, 23);
  ctx.fillRect(0, band, FW, FH - band);
  ctx.restore();
  // la bande jaune et noire
  const y0 = yAt(1.0);
  const y1 = yAt(0.88);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, FW, y1 - y0);
  ctx.clip();
  ctx.fillStyle = hsl(45, 85, 48);
  ctx.fillRect(0, y0, FW, y1 - y0);
  ctx.fillStyle = '#1a1916';
  for (let x = -FW; x < FW * 2; x += 0.24 * PX) {
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x + 0.12 * PX, y1);
    ctx.lineTo(x + 0.12 * PX + (y1 - y0), y0);
    ctx.lineTo(x + (y1 - y0), y0);
    ctx.fill();
  }
  ctx.restore();
  // chocs : la peinture partie, le parpaing dessous
  blotches(ctx, FW, FH, 26, 'rgba(120, 116, 104, 0.55)', 4, 22, yAt(1.3), FH);
  // suie en haut, humidité au pied, rouille qui coule des fixations
  const soot = ctx.createLinearGradient(0, 0, 0, FH * 0.3);
  soot.addColorStop(0, 'rgba(14, 12, 10, 0.5)');
  soot.addColorStop(1, 'rgba(14, 12, 10, 0)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, FW, FH * 0.3);
  blotches(ctx, FW, band, 16, 'rgba(50, 45, 35, 0.22)', 30, 130);
  drips(ctx, 14, 'rgba(110, 62, 28, 0.32)', FH * 0.65);
  grain(ctx, FW, FH, 14);
  grain(btx, FW, FH, 20);
  return { map: tex(cv), bump: tex(bv, false) };
}

// La photo de béton brut (celle du plafond du Level 1) salit le carrelage et l'enduit comme le papier peint du
// Level 0 : marbrures, coulées, petits trous, en lumière douce par-dessus le dessin
function grime(t, photo) {
  const c = t.map.image;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(photo, 0, 0, FW, FW);
  ctx.drawImage(photo, 0, FW, FW, FW);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.22;
  ctx.drawImage(photo, -FW * 0.3, -FH * 0.2, FW * 1.6, FH * 1.6);
  ctx.restore();
  t.map.needsUpdate = true;
}

export function createPipesTextures() {
  const tileA = tileWall({ h: 44, s: 52, l: 55, var: 5, grout: '#b9ae90', cove: [24, 30, 11], rowH: 0.078, cols: 16 });
  const tileB = tileWall({ h: 27, s: 44, l: 31, var: 8, grout: '#57493a', cove: [22, 40, 13], rowH: 0.156, cols: 16 });
  const brick = brickWall(false);
  const boiler = brickWall(true);
  const S = 512;
  const [fc, fctx] = canvas(S);
  const [cc, cctx] = canvas(S);
  drawFloor(fctx, S, null);
  drawCeiling(cctx, S, null);
  const floor = tex(fc);
  const ceiling = tex(cc);
  const hall = hallWall();
  const ready = Promise.all(['l1_sol.jpg', 'l1_plafond.jpg', 'l2_brique.jpg', 'l2_brique_relief.jpg', 'l2_brique_peinte.jpg', 'l2_brique_peinte_relief.jpg'].map(loadImage)).then(([sol, pla, br, brR, bp, bpR]) => {
    brick.redraw(br, brR);
    boiler.redraw(bp, bpR);
    if (pla) for (const t of [tileA, tileB, hall]) grime(t, pla);
    if (sol) {
      drawFloor(fctx, S, sol);
      floor.needsUpdate = true;
    }
    if (pla) {
      drawCeiling(cctx, S, pla);
      ceiling.needsUpdate = true;
    }
  });
  return { tileA, tileB, brick, boiler, hall, floor, ceiling, signs: drawSigns(), gauge: drawGauge(), pipe: drawPipes(), ready };
}
