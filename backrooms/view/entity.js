// backrooms/view/entity.js — l'entité « classique » des Backrooms, dessinée dans le code (mode normal).
// Une silhouette noire, filiforme, aux membres trop longs et aux deux yeux blancs, qui ondule.
// Elle remplace les monstres du mode VIP pour tout le monde : même format que leurs fichiers
// (une image fixe pour le Level 0, une planche d'images pour le Level 1), et un grognement synthétisé à la place de la voix.

const FW = 246, FH = 400;                 // une image de la planche (même proportion que celle du mode VIP)
const COLS = 8, ROWS = 4, FRAMES = 32;    // 32 images, 12 par seconde : un peu moins de 3 s de boucle

// petit hasard reproductible : la même image à chaque chargement
function rnd(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** dessine l'entité dans un rectangle w × h ; t de 0 à 1 : la phase de sa boucle */
function drawEntity(g, w, h, t) {
  const fr = Math.floor(t * 32);
  // mouvements saccadés : elle tient la pose, puis se tord d'un coup
  const jerk = rnd(fr) < 0.18 ? (rnd(fr + 50) - 0.5) * 2 : 0;
  const s = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 4);
  const cx = w * 0.5 + jerk * w * 0.03;
  const P = (x, y) => [x * w, y * h];
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  // fumée noire qui s'effiloche vers le haut, autour de tout le corps
  for (let i = 0; i < 0; i++) {
    const y0 = 0.08 + rnd(i) * 0.88, side = rnd(i + 9) < 0.5 ? -1 : 1;
    const rise = ((t + rnd(i + 3)) % 1);
    const x0 = cx + side * w * (0.04 + rnd(i + 5) * 0.16) + Math.sin(rise * 6 + i) * w * 0.03;
    g.globalAlpha = 0.35 * (1 - rise);
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(x0, (y0 - rise * 0.12) * h, w * (0.012 + rnd(i + 7) * 0.03), h * (0.01 + rnd(i + 8) * 0.025), 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#030303'; g.strokeStyle = '#030303';
  g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = w * 0.06;
  // colonne voûtée, penchée vers l'avant et sur le côté
  const neck = [cx + w * 0.05 + jerk * w * 0.04, h * 0.16], hip = [cx - w * 0.02, h * 0.56];
  // jambes trop longues, genoux qui plient à l'envers
  g.lineWidth = w * 0.045;
  for (const k of [-1, 1]) {
    const knee = [hip[0] + k * w * 0.11, h * (0.74 + (k > 0 ? 0.02 : -0.01))];
    g.beginPath(); g.moveTo(hip[0] + k * w * 0.03, hip[1]); g.lineTo(knee[0], knee[1]); g.lineTo(hip[0] + k * w * 0.05, h * 0.99); g.stroke();
  }
  // torse décharné : côtes creuses et ventre aspiré
  g.beginPath();
  g.moveTo(hip[0] - w * 0.06, hip[1]);
  g.bezierCurveTo(hip[0] - w * 0.11, h * 0.42, neck[0] - w * 0.1, h * 0.26, neck[0] - w * 0.045, neck[1] + h * 0.02);
  g.lineTo(neck[0] + w * 0.05, neck[1] + h * 0.03);
  g.bezierCurveTo(neck[0] + w * 0.07, h * 0.3, hip[0] + w * 0.02, h * 0.45, hip[0] + w * 0.06, hip[1]);
  g.closePath(); g.fill();
  // bras inégaux : le gauche traîne presque au sol, le droit se tend en avant, doigts interminables
  const arms = [
    { k: -1, el: [-0.2, 0.4], ha: [-0.24, 0.86], sw: s },
    { k: 1, el: [0.24, 0.32], ha: [0.3, 0.62], sw: -s + jerk * 1.5 },
  ];
  for (const A of arms) {
    const sh = [neck[0] + A.k * w * 0.06, neck[1] + h * 0.04];
    const el = [cx + A.el[0] * w + A.sw * w * 0.02, A.el[1] * h];
    const ha = [cx + A.ha[0] * w + A.sw * w * 0.04, A.ha[1] * h];
    g.lineWidth = w * 0.032;
    g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.lineTo(ha[0], ha[1]); g.stroke();
    g.lineWidth = w * 0.011;
    for (let f = 0; f < 4; f++) {
      const ang = Math.PI / 2 + (f - 1.5) * 0.35 + A.k * 0.2 + (rnd(fr * 4 + f) - 0.5) * 0.25;
      const L = h * (0.07 + rnd(f + 20) * 0.04);
      const m = [ha[0] + Math.cos(ang) * L * 0.55, ha[1] + Math.sin(ang) * L * 0.55];
      g.beginPath(); g.moveTo(ha[0], ha[1]); g.lineTo(m[0], m[1]);
      g.lineTo(m[0] + Math.cos(ang + A.k * 0.6) * L * 0.5, m[1] + Math.sin(ang + A.k * 0.6) * L * 0.5); g.stroke();
    }
  }
  // tête allongée, penchée à un angle impossible
  g.lineWidth = w * 0.025;
  const hx = neck[0] + w * 0.03, hy = h * 0.085;
  g.beginPath(); g.moveTo(neck[0], neck[1] + h * 0.02); g.lineTo(hx, hy + h * 0.03); g.stroke();
  g.save(); g.translate(hx, hy); g.rotate(0.45 + jerk * 0.5 + s * 0.05);
  g.beginPath(); g.ellipse(0, 0, w * 0.06, h * 0.07, 0, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  // bouche béante, trop grande, qui s'ouvre et se referme
  const open = 0.5 + 0.5 * Math.max(0, Math.sin(t * Math.PI * 2 - 1));
  g.fillStyle = '#2a0000';
  g.beginPath(); g.ellipse(w * 0.003, h * 0.03, w * 0.03, h * (0.012 + 0.03 * open), 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(230,225,210,0.85)'; g.lineWidth = w * 0.004;
  for (let i = -3; i <= 3; i++) {
    const tx = w * (0.003 + i * 0.008);
    g.beginPath(); g.moveTo(tx, h * (0.03 - 0.012 - 0.026 * open)); g.lineTo(tx + w * 0.002, h * (0.03 - 0.004 - 0.018 * open)); g.stroke();
    g.beginPath(); g.moveTo(tx, h * (0.03 + 0.012 + 0.026 * open)); g.lineTo(tx - w * 0.002, h * (0.03 + 0.004 + 0.018 * open)); g.stroke();
  }
  // yeux blancs, vides, de tailles différentes
  g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = w * 0.04;
  g.fillStyle = '#ffffff';
  const blink = rnd(fr + 99) < 0.06 ? 0.15 : 1;
  g.beginPath(); g.ellipse(-w * 0.024, -h * 0.018, w * 0.014, h * 0.011 * blink, -0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(w * 0.026, -h * 0.022, w * 0.01, h * 0.007 * blink, 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
  g.restore();
  void c; void P;
}

// bruit de valeur lissé (fbm) : la matière organique de l'entité
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed) { return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.15; }

/** transforme le dessin net en chair : contour déchiqueté qui s'effiloche vers le haut, volume, peau marbrée, grain */
function texturize(cv, seed) {
  const W = cv.width, H = cv.height, g = cv.getContext('2d');
  const src = g.getImageData(0, 0, W, H).data;
  // carte de volume : le dessin flouté (centre du corps = 1, bords = 0)
  const bl = canvas(W, H), bg = bl.getContext('2d');
  bg.filter = `blur(${Math.round(W * 0.03)}px)`; bg.drawImage(cv, 0, 0);
  const vol = bg.getImageData(0, 0, W, H).data;
  const out = g.createImageData(W, H), o = out.data;
  const sc = 9 / W, warp = W * 0.035;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = fbm(x * sc, y * sc, seed) - 0.5, ny = fbm(x * sc + 7.3, y * sc + 3.1, seed);
    // on lit le dessin un peu à côté et plus bas : les bords se déchirent et filent vers le haut comme une fumée
    const sx = Math.min(W - 1, Math.max(0, Math.round(x + nx * warp * 2))), sy = Math.min(H - 1, Math.max(0, Math.round(y + ny * warp * 2.2)));
    const k = (sy * W + sx) * 4, i = (y * W + x) * 4;
    let r = src[k], gg = src[k + 1], b = src[k + 2], al = src[k + 3];
    const lum = (r + gg + b) / 3;
    const grain = (Math.random() - 0.5) * 18;
    if (lum < 40) {
      // peau : noir qui n'est pas noir, marbré de veines grises, éclairé par le haut et le bord gauche
      const vv = vol[(y * W + x) * 4 + 3] / 255;
      const vein = Math.pow(1 - Math.abs(fbm(x * sc * 5, y * sc * 5, seed + 5) - 0.5) * 2, 8);
      const rim = Math.max(0, 1 - vv * 1.6) * (x < W / 2 ? 1 : 0.4) * (1 - y / H * 0.5);
      const base = 10 + fbm(x * sc * 3, y * sc * 3, seed + 9) * 22 + vein * 30 + rim * 45;
      r = base * 1.05 + grain; gg = base * 0.97 + grain; b = base * 0.9 + grain;
      al = al > 0 ? Math.min(255, al * (0.55 + vv * 2.5 + nx * 1.2)) : 0; // plein au cœur, effiloché au bord
    } else { r += grain; gg += grain; b += grain; }
    o[i] = r; o[i + 1] = gg; o[i + 2] = b; o[i + 3] = al;
  }
  g.putImageData(out, 0, 0);
}

function canvas(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  return cv;
}

let cached = null;
/** { img, anim } : image fixe (Level 0) et planche animée (Level 1), en adresses data: utilisables partout */
export function classicEntity() {
  if (cached) return cached;
  if (typeof document === 'undefined') return (cached = { img: '', anim: { url: '', frames: 1, cols: 1, rows: 1, fps: 12, aspect: FW / FH, tint: '#ffffff' } });
  const one = canvas(FW * 2, FH * 2);
  drawEntity(one.getContext('2d'), one.width, one.height, 0.3);
  texturize(one, 3);
  const sheet = canvas(FW * COLS, FH * ROWS), g = sheet.getContext('2d');
  for (let f = 0; f < FRAMES; f++) {
    g.save(); g.translate((f % COLS) * FW, Math.floor(f / COLS) * FH);
    g.beginPath(); g.rect(0, 0, FW, FH); g.clip();
    drawEntity(g, FW, FH, f / FRAMES);
    g.restore();
  }
  for (let f = 0; f < FRAMES; f++) {
    const cell = canvas(FW, FH), cg = cell.getContext('2d');
    cg.drawImage(sheet, -(f % COLS) * FW, -Math.floor(f / COLS) * FH);
    texturize(cell, 3 + (f % 4) * 0.13); // la matière grouille d'une image à l'autre
    g.clearRect((f % COLS) * FW, Math.floor(f / COLS) * FH, FW, FH);
    g.drawImage(cell, (f % COLS) * FW, Math.floor(f / COLS) * FH);
  }
  cached = {
    img: one.toDataURL('image/png'),
    anim: { url: sheet.toDataURL('image/png'), frames: FRAMES, cols: COLS, rows: ROWS, fps: 12, aspect: FW / FH, tint: '#ffffff' },
  };
  return cached;
}

/** grognement grave en boucle (≈ 3 s) : deux souffles bruités sous un râle basse fréquence */
export function growlBuffer(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * 3.2), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let lp = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // deux expirations par boucle, qui montent puis retombent
    const env = Math.pow(Math.max(0, Math.sin((t / 3.2) * Math.PI * 2 - 0.4)), 1.6) * 0.9 + 0.08;
    const f = 52 + 14 * Math.sin(t * 2.3) + 6 * Math.sin(t * 17);
    ph += (2 * Math.PI * f) / sr;
    const rasp = Math.sign(Math.sin(ph)) * 0.35 + Math.sin(ph * 0.5) * 0.4;   // râle : onde carrée sourde
    lp += ((Math.random() * 2 - 1) - lp) * 0.06;                             // souffle : bruit filtré
    d[i] = (rasp * (0.6 + 0.4 * Math.sin(t * 31)) * 0.55 + lp * 1.6) * env * 0.6;
  }
  // fondu aux bords : la boucle ne claque pas
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[n - 1 - i] *= i / fade; }
  return buf;
}
