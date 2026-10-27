// Petits outils pour dessiner en pixel art sur des canvas.

export function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur ; les ombres glissent vers le bleu-violet comme en pixel art. */
export function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  let [h, s, l] = rgbToHsl(r, g, b);
  if (k < 0) {
    l = l * (1 + k);
    // décalage de teinte vers le violet dans l'ombre
    const target = 0.72;
    let dh = target - h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    h = (h + dh * Math.min(0.18, -k * 0.3) + 1) % 1;
    s = Math.min(1, s * (1 - k * 0.15));
  } else {
    l = l + (1 - l) * k;
    let dh = 0.15 - h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    h = (h + dh * Math.min(0.08, k * 0.12) + 1) % 1;
    s = s * (1 - k * 0.25);
  }
  return rgbToHex(...hslToRgb(h, s, Math.max(0, Math.min(1, l))));
}

/** Rampe de 5 tons : [contour, ombre, base, clair, reflet] */
export function ramp(hex) {
  return [shade(hex, -0.68), shade(hex, -0.28), hex, shade(hex, 0.32), shade(hex, 0.62)];
}

/** Aléa reproductible (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Dessine une grille de caractères avec une palette : rows = ['..aab', ...], pal = { a: '#hex' } */
export function drawGrid(ctx, rows, pal, ox = 0, oy = 0, flip = false) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const k = r[x]; const col = pal[k];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + (flip ? r.length - 1 - x : x), oy + y, 1, 1);
    }
  }
}

/** Ajoute un contour d'un pixel autour des pixels opaques (dans les pixels vides voisins). */
export function outlineCanvas(c, color = '#202028') {
  const ctx = c.getContext('2d'), w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const [r, g, b] = hexToRgb(color);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) add.push(y * w + x);
  }
  for (const i of add) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

/** Bruit de valeur 2D simple, déterministe, pour les textures */
export function noise2(x, y, seed = 0) {
  let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
