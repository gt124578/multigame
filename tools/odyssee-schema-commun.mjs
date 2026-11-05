// tools/odyssee-schema-commun.mjs — le schéma des cartes d'Odyssée, partagé par l'export (odyssee-schema.mjs) et
// l'import des corrections dessinées (odyssee-schema-import.mjs) : palette des cases, codage des hauteurs, lecture et
// écriture des PNG (sans dépendance : zlib de Node), dessin des images ×8 (grille, coordonnées, noms), normal map.
import { inflateSync, deflateSync } from 'zlib';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { T, walkable } from '../odyssee/js/world/tiles.js';
import { GLYPHES } from '../odyssee/js/ui/pixel.js';

/* =====================================================================================================================
   Palette : une couleur unie et unique par type de case (T de tiles.js). fixe : la case ne change pas par l'image
   (bâtiment, porte, panneau, décor, entrée de grotte, tapis de sortie) ; interieur : n'existe que dans les maisons.
   ===================================================================================================================== */
const P = [
  ['GRASS', 'herbe', '#80d060'], ['PATH', 'chemin (terre)', '#e0b46c'], ['TALL', 'hautes herbes', '#30a838'],
  ['TREE', 'arbres (forêt)', '#0a4614'], ['WATER', 'eau', '#2864e6'], ['SAND', 'sable', '#f6ec9c'],
  ['FLOWER', 'fleurs', '#f490d4'], ['FENCE', 'barrière', '#8a4a1c'], ['ROCK', 'rocher (décor)', '#acacac'],
  ['LEDGE', 'rebord : saut vers le sud', '#ec7414'], ['BUILD', 'bâtiment', '#d01e28', 'fixe'], ['DOOR', 'porte', '#ffe600', 'fixe'],
  ['PAVE', 'pavés', '#d4c4b8'], ['BRIDGE', 'pont, passerelle', '#a8683a'], ['SIGN', 'panneau', '#ff28c8', 'fixe'],
  ['CAVE', 'sol de grotte', '#a89070'], ['CAVEWALL', 'roche (grotte, montagne)', '#484848'], ['FLOOR', 'plancher', '#f0c8f0', 'interieur'],
  ['WALL', 'mur', '#24243c', 'interieur'], ['BLOCK', 'décor bloquant (lampadaire, statue…)', '#9632ff', 'fixe'],
  ['MAT', 'tapis de sortie', '#a0ffff', 'fixe'], ['STAIRS', 'marches', '#20d0d0'], ['ASH', 'cendre', '#8c8cb0'],
  ['PINE', 'sapins', '#145c58'], ['BUSH', 'buissons', '#8a9c28'], ['CAVEDOOR', 'entrée de grotte', '#501040', 'fixe'],
  ['SNOW', 'neige', '#e0ecff'], ['DARKTALL', 'hautes herbes sombres', '#3c8048'], ['LEDGE_E', 'rebord : saut vers l\'est', '#ffbe3c'],
  ['LEDGE_W', 'rebord : saut vers l\'ouest', '#ff9478'], ['CUT', 'petit arbre (Coupe)', '#c8f040'],
  ['SMASH', 'rocher fissuré (Éclate-Roc)', '#c8a0e8'], ['BOULDER', 'gros rocher (Force)', '#5c7890'],
  ['BARRIER_R', 'barrière rouge (arène)', '#ff6464', 'interieur'], ['BARRIER_B', 'barrière bleue (arène)', '#8080ff', 'interieur'],
  ['LAVA', 'lave', '#ff3c00', 'interieur'], ['CLIFF', 'falaise (paroi sous un bord sud)', '#8c3c78'], ['WHIRL', 'tourbillons', '#10208c'],
];
const rgbHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const PALETTE = P.map(([cle, nom, hex, statut]) => ({ t: T[cle], cle, nom, hex, rgb: rgbHex(hex), fixe: statut === 'fixe', interieur: statut === 'interieur' }));
export const PAR_TYPE = new Map(PALETTE.map((p) => [p.t, p]));
for (const k of Object.keys(T)) if (!PAR_TYPE.has(T[k])) throw new Error(`schéma : pas de couleur pour T.${k}`);
/** cases que l'image ne peut ni poser ni effacer */
export const FIXES = new Set(PALETTE.filter((p) => p.fixe).map((p) => p.t));
export const nomType = (t) => PAR_TYPE.get(t)?.nom ?? `type ${t}`;

/** distance entre deux couleurs (moyenne pondérée « redmean », à peu près perceptive ; ~0 à 255) */
export function dist(r1, g1, b1, r2, g2, b2) {
  const r = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db) / 3;
}

/* =====================================================================================================================
   Hauteurs : gris = 32 + 16 × hauteur (un étage = un palier de 16) ; ravin (fond d'un gouffre de montagne) = 0.
   La consigne d'origine (128 + 16 × h) ne tient pas : les sommets montent jusqu'au niveau 12 (128 + 192 > 255).
   ===================================================================================================================== */
export const GRIS0 = 32, PAS = 16, GRIS_RAVIN = 0, HMAX = 14;
export const grisDe = (h, rav = false) => (rav ? GRIS_RAVIN : Math.max(0, Math.min(255, GRIS0 + PAS * h)));
/** gris → [hauteur (ou 'ravin'), écart au palier exact] */
export function hauteurDe(g) {
  if (g < 16) return ['ravin', Math.abs(g - GRIS_RAVIN)];
  const h = Math.max(0, Math.min(HMAX, Math.round((g - GRIS0) / PAS)));
  return [h, Math.abs(g - grisDe(h))];
}

/** gradins des grottes (même calcul que caveTiers de odyssee/js/render/world3d.js, que l'on ne peut pas charger sans
 *  navigateur) : distance de la roche au sol le plus proche, plafonnée à 3 et au nombre de cases de roche au-dessus */
function gradinsGrotte(m) {
  const n = m.w * m.h, d = new Uint8Array(n).fill(255), q = [];
  for (let i = 0; i < n; i++) if (m.t[i] !== T.CAVEWALL) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % m.w, y = (i / m.w) | 0;
    for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (a < 0 || b < 0 || a >= m.w || b >= m.h) continue;
      const j = b * m.w + a; if (d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  for (let x = 0; x < m.w; x++) {
    let run = 3;
    for (let y = 0; y < m.h; y++) {
      const i = y * m.w + x;
      if (m.t[i] !== T.CAVEWALL) { run = 0; continue; }
      d[i] = Math.max(1, Math.min(3, d[i] === 255 ? 3 : d[i], run)); run++;
    }
  }
  return d;
}

/** hauteurs d'une carte, case par case : dehors, celles du jeu (GameMap.hg) ; grottes, les gradins du rendu */
export function hauteursCarte(m) {
  const n = m.w * m.h, h = new Int16Array(n), rav = new Uint8Array(n);
  if (m.outdoor) { for (let i = 0; i < n; i++) { h[i] = m.hg[i]; rav[i] = m.ravins?.[i] === 1 ? 1 : 0; } }
  else h.set(gradinsGrotte(m));
  return { h, rav, editable: !!m.outdoor };
}

/* =====================================================================================================================
   Cartes à exporter
   ===================================================================================================================== */
export const estGrotte = (m) => m.floor === 'cave';
export const nomFichier = (id) => id.replace(/[^a-zA-Z0-9_-]+/g, '-');
export function choisirCartes(world, quoi = 'tout') {
  const caves = Object.values(world.maps).filter(estGrotte);
  if (quoi === 'tout') return [world.maps.monde, ...caves];
  if (quoi === 'monde') return [world.maps.monde];
  if (quoi === 'grottes') return caves;
  const m = world.maps[quoi] || Object.values(world.maps).find((c) => nomFichier(c.id) === quoi);
  if (!m) throw new Error(`carte inconnue : « ${quoi} » (monde, grottes, tout, ou un identifiant : ${caves.map((c) => c.id).join(', ')}…)`);
  return [m];
}

/* =====================================================================================================================
   Images : { w, h, c (3 ou 4 canaux), d (Uint8Array) } ; PNG lus et écrits à la main
   ===================================================================================================================== */
export const image = (w, h, c = 3) => ({ w, h, c, d: new Uint8Array(w * h * c) });

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc(b) { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4);
  len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]);
}
/** encode une image en PNG (RVB ou RVBA 8 bits, filtre « Up » : les rangées répétées des images agrandies ne pèsent rien) */
export function pngDe(img) {
  const { w, h, c, d } = img, stride = w * c, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1), s = y * stride;
    raw[o] = y ? 2 : 0;
    if (!y) for (let i = 0; i < stride; i++) raw[o + 1 + i] = d[s + i];
    else for (let i = 0; i < stride; i++) raw[o + 1 + i] = (d[s + i] - d[s - stride + i]) & 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = c === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export const ecrirePNG = (fichier, img) => writeFileSync(fichier, pngDe(img));

/** lit un PNG (toutes profondeurs, palette, transparence, entrelacé ou non) → image RVBA 8 bits */
export function lirePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ce n\'est pas un PNG');
  let p = 8, w = 0, h = 0, depth = 8, ct = 6, inter = 0, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; inter = data[12]; }
    else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error(`PNG : type de couleur ${ct} inconnu`);
  const bits = ch * depth, bpp = Math.max(1, bits >> 3), raw = inflateSync(Buffer.concat(idat));
  const out = image(w, h, 4), max = (1 << depth) - 1;
  // rangée défiltrée → pixels (valeur brute de l'échantillon, puis ramenée sur 8 bits)
  const brut = (row, x, k) => {
    if (depth === 8) return row[x * ch + k];
    if (depth === 16) return row.readUInt16BE((x * ch + k) * 2);
    const bit = (x * ch + k) * depth; return (row[bit >> 3] >> (8 - depth - (bit & 7))) & max;
  };
  const sur8 = (v) => (depth === 16 ? v >> 8 : depth < 8 && ct !== 3 ? Math.round(v * 255 / max) : v);
  const poser = (row, x, X, Y) => {
    const o = (Y * w + X) * 4; let r, g, b, a = 255;
    if (ct === 0) { const v = brut(row, x, 0); r = g = b = sur8(v); if (trns && v === trns.readUInt16BE(0)) a = 0; }
    else if (ct === 2) {
      const R = brut(row, x, 0), G = brut(row, x, 1), B = brut(row, x, 2); r = sur8(R); g = sur8(G); b = sur8(B);
      if (trns && R === trns.readUInt16BE(0) && G === trns.readUInt16BE(2) && B === trns.readUInt16BE(4)) a = 0;
    } else if (ct === 3) { const i = brut(row, x, 0); r = pal[i * 3]; g = pal[i * 3 + 1]; b = pal[i * 3 + 2]; if (trns && i < trns.length) a = trns[i]; }
    else if (ct === 4) { r = g = b = sur8(brut(row, x, 0)); a = sur8(brut(row, x, 1)); }
    else { r = sur8(brut(row, x, 0)); g = sur8(brut(row, x, 1)); b = sur8(brut(row, x, 2)); a = sur8(brut(row, x, 3)); }
    out.d[o] = r; out.d[o + 1] = g; out.d[o + 2] = b; out.d[o + 3] = a;
  };
  let off = 0;
  const passe = (pw, ph, place) => {
    if (!pw || !ph) return;
    const stride = Math.ceil(pw * bits / 8); let prev = Buffer.alloc(stride);
    for (let y = 0; y < ph; y++) {
      const f = raw[off], row = Buffer.from(raw.subarray(off + 1, off + 1 + stride)); off += 1 + stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        if (f === 1) row[i] = (row[i] + a) & 255;
        else if (f === 2) row[i] = (row[i] + b) & 255;
        else if (f === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      }
      for (let x = 0; x < pw; x++) { const [X, Y] = place(x, y); poser(row, x, X, Y); }
      prev = row;
    }
  };
  if (!inter) passe(w, h, (x, y) => [x, y]);
  else for (const [xs, ys, dx, dy] of [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]) {
    passe(Math.ceil((w - xs) / dx), Math.ceil((h - ys) / dy), (x, y) => [xs + x * dx, ys + y * dy]);
  }
  return out;
}

/** charge une image : PNG lu directement ; JPEG, WebP… convertis en PNG par Python (Pillow) ou ImageMagick s'ils sont là */
export function chargerImage(fichier) {
  const buf = readFileSync(fichier);
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return lirePNG(buf);
  const dir = mkdtempSync(join(tmpdir(), 'schema-')), png = join(dir, 'image.png');
  try {
    const essais = [
      ['python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGBA").save(sys.argv[2])', fichier, png]],
      ['magick', [fichier, 'png32:' + png]], ['convert', [fichier, 'png32:' + png]],
    ];
    for (const [cmd, args] of essais) {
      const r = spawnSync(cmd, args, { stdio: 'pipe' });
      if (r.status === 0) { try { return lirePNG(readFileSync(png)); } catch { /* essai suivant */ } }
    }
    throw new Error(`${fichier} n'est pas un PNG et rien ne sait le convertir ici (Pillow ou ImageMagick) : renvoie-le en PNG`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* =====================================================================================================================
   Dessin : rectangles, mélange, texte (police 5 × 7 du jeu, odyssee/js/ui/pixel.js, plus quelques signes)
   ===================================================================================================================== */
const G5 = (...rangees) => rangees.join('');
const GL = { ...GLYPHES,
  '#': G5('.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'), '[': G5('.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'),
  ']': G5('.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'), '"': G5('.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'),
  ';': G5('.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'), '_': G5('.....', '.....', '.....', '.....', '.....', '.....', '#####'),
};
const ACC = { À: 'A', Â: 'A', Ä: 'A', Ç: 'C', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O', Ù: 'U', Û: 'U', Ü: 'U', Œ: 'OE', '—': '-', '–': '-', '’': "'", '→': '>', '…': '...' };
const norme = (s) => String(s).toUpperCase().replace(/[ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ—–’→…]/g, (c) => ACC[c]);
const avance = (ch) => (ch === ' ' ? 4 : '1I.:!\',;'.includes(ch) ? 5 : 6);
export const largeurTexte = (s, e = 1) => { let w = 0; for (const ch of norme(s)) w += avance(ch); return Math.max(0, w - 1) * e; };

export function px(img, x, y, col) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const o = (y * img.w + x) * img.c; img.d[o] = col[0]; img.d[o + 1] = col[1]; img.d[o + 2] = col[2]; if (img.c === 4) img.d[o + 3] = 255;
}
export function rect(img, x, y, w, h, col) { for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) px(img, i, j, col); }
/** mélange vers une couleur (a de 0 à 1) */
export function voile(img, x, y, w, h, col, a) {
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) {
    const o = (j * img.w + i) * img.c; for (let k = 0; k < 3; k++) img.d[o + k] = Math.round(img.d[o + k] * (1 - a) + col[k] * a);
  }
}
/** écrit un texte en majuscules ; o : { e: échelle, contour: couleur, a: 'c' centré } ; renvoie le rectangle occupé */
export function ecrire(img, s, x, y, col, o = {}) {
  const e = o.e || 1; s = norme(s);
  const W = largeurTexte(s, e); let cx = Math.round(o.a === 'c' ? x - W / 2 : x); y = Math.round(y);
  const x0 = cx, ep = o.contour ? Math.max(1, e >> 1) : 0;
  const glyphes = (dx, dy, c) => {
    let gx = cx;
    for (const ch of s) {
      const g = GL[ch];
      if (g) { const dec = avance(ch) === 5 ? -1 : 0; for (let i = 0; i < 35; i++) if (g[i] === '#') rect(img, gx + (i % 5 + dec) * e + dx, y + ((i / 5) | 0) * e + dy, e, e, c); }
      gx += avance(ch) * e;
    }
  };
  if (o.contour) for (const [dx, dy] of [[-ep, 0], [ep, 0], [0, -ep], [0, ep], [-ep, -ep], [ep, ep], [-ep, ep], [ep, -ep]]) glyphes(dx, dy, o.contour);
  glyphes(0, 0, col);
  return [x0 - ep, y - ep, W + 2 * ep, 7 * e + 2 * ep];
}
/** étiquettes qui ne se chevauchent pas (on essaie quelques décalages, sinon on renonce) */
export class Etiquettes {
  constructor(img) { this.img = img; this.pris = []; }
  libre([x, y, w, h]) { return x >= 0 && y >= 0 && x + w <= this.img.w && y + h <= this.img.h && !this.pris.some(([a, b, c, d]) => x < a + c + 3 && a < x + w + 3 && y < b + d + 3 && b < y + h + 3); }
  poser(s, x, y, col, o = {}) {
    const e = o.e || 1, W = largeurTexte(s, e) + 2 * Math.max(1, e >> 1), H = 7 * e + 2 * Math.max(1, e >> 1);
    for (const [dx, dy] of [[0, 0], [0, -1.4], [0, 1.4], [0, -2.8], [0, 2.8], [-0.6, 0], [0.6, 0], [-0.6, -1.4], [0.6, 1.4]]) {
      const X = Math.round((o.a === 'c' ? x - W / 2 : x) + dx * W), Y = Math.round(y + dy * H);
      if (this.libre([X, Y, W, H])) { ecrire(this.img, s, X + (W >> 1), Y + Math.max(1, e >> 1), col, { ...o, a: 'c' }); this.pris.push([X, Y, W, H]); return true; }
    }
    return e > 1 ? this.poser(s, x, y, col, { ...o, e: e - 1 }) : false;
  }
}

/* =====================================================================================================================
   Rendu des images
   ===================================================================================================================== */
export const ECHELLE = 8;
const BLANC = [255, 255, 255], NOIR = [0, 0, 0];

/** schéma 1 pixel = 1 case : la couleur du type de chaque case */
export function schema1(m) {
  const img = image(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) { const c = PAR_TYPE.get(m.t[i]).rgb; img.d[i * 3] = c[0]; img.d[i * 3 + 1] = c[1]; img.d[i * 3 + 2] = c[2]; }
  return img;
}
const luma = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

/** grille légère toutes les 8 cases, plus marquée toutes les 32 ; coordonnées sur les bords (16) et aux croisements (32) */
function grille(img, m, S) {
  const trait = (x, y, w, h, fort) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= img.w || j >= img.h) continue;
      const o = (j * img.w + i) * img.c, c = [img.d[o], img.d[o + 1], img.d[o + 2]], vers = luma(c) > 110 ? NOIR : BLANC;
      for (let k = 0; k < 3; k++) img.d[o + k] = Math.round(c[k] * (1 - fort) + vers[k] * fort);
    }
  };
  for (let x = 8; x < m.w; x += 8) trait(x * S, 0, x % 32 ? 1 : 2, img.h, x % 32 ? 0.22 : 0.4);
  for (let y = 8; y < m.h; y += 8) trait(0, y * S, img.w, y % 32 ? 1 : 2, y % 32 ? 0.22 : 0.4);
}
function coordonnees(img, m, S, E) {
  for (let x = 16; x < m.w; x += 16) E.poser(String(x), x * S + 3, 3, BLANC, { contour: NOIR });
  for (let y = 16; y < m.h; y += 16) E.poser(String(y), 3, y * S + 3, BLANC, { contour: NOIR });
  for (let y = 32; y < m.h; y += 32) for (let x = 32; x < m.w; x += 32) E.poser(`${x},${y}`, x * S + 4, y * S + 4, [255, 255, 200], { contour: NOIR });
}
/** noms : villes, zones (routes, forêts…), entrées des grottes et des autres cartes, sorties d'une grotte */
function noms(img, m, world, S, E) {
  for (const titre of [`${m.name} (${m.id}) - ${m.w} X ${m.h} CASES`, `${m.name} (${m.id})`, m.name, m.id]) if (E.poser(titre, 6, 6, [255, 255, 160], { e: 2, contour: NOIR })) break;
  if (m.id === 'monde') {
    for (const t of Object.values(world.towns)) E.poser(t.name, (t.x + t.w / 2) * S, (t.y + t.h / 2) * S - 10, BLANC, { e: 3, contour: NOIR, a: 'c' });
    // une étiquette par nom de zone (la plus grande), hors villes et mers
    const best = new Map();
    for (const z of m.zones) {
      if (!z.name || z.town || z.trigger || Object.values(world.towns).some((t) => t.name === z.name)) continue;
      const a = (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1); if (!best.has(z.name) || best.get(z.name).a < a) best.set(z.name, { z, a });
    }
    for (const { z } of [...best.values()].sort((p, q) => q.a - p.a)) E.poser(z.name, ((z.x0 + z.x1 + 1) / 2) * S, ((z.y0 + z.y1 + 1) / 2) * S, [255, 240, 150], { e: 2, contour: NOIR, a: 'c' });
  }
  // entrées vers une grotte ou une autre carte du dehors ; dans une grotte, ses sorties
  const vus = new Set();
  for (const [k, to] of m.warps) {
    const dest = world.maps[to.map]; if (!dest) continue;
    if (m.id === 'monde' && !(estGrotte(dest) || dest.outdoor)) continue;
    const [x, y] = k.split(',').map(Number), lieu = dest.zoneAt?.(to.x, to.y)?.name || dest.name, lab = estGrotte(m) ? `SORTIE > ${lieu} (${to.x},${to.y})` : '▼ ' + dest.name, cle = lab + Math.round(x / 4) + ',' + Math.round(y / 4);
    if (vus.has(cle)) continue; vus.add(cle);
    E.poser(lab, (x + 0.5) * S, y * S - 2 * 7 - 6, [255, 200, 255], { e: 2, contour: NOIR, a: 'c' });
  }
}
/** repères des PNJ (carré blanc cerclé de noir) et des objets (losange orange) : ils ne se modifient pas par l'image */
function reperes(img, m, S) {
  for (const n of m.npcs) { rect(img, n.x * S + 2, n.y * S + 2, 4, 4, NOIR); rect(img, n.x * S + 3, n.y * S + 3, 2, 2, BLANC); }
  for (const it of m.items) { const cx = it.x * S + 4, cy = it.y * S + 4; rect(img, cx - 1, cy - 2, 2, 4, [255, 120, 0]); rect(img, cx - 2, cy - 1, 4, 2, [255, 120, 0]); }
}

/** schéma agrandi ×8 sans lissage, avec grille, coordonnées, repères et noms : l'image à regarder */
export function schema8(m, world, S = ECHELLE) {
  const base = schema1(m), img = image(m.w * S, m.h * S);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (((y / S) | 0) * m.w + ((x / S) | 0)) * 3, o = (y * img.w + x) * 3;
    img.d[o] = base.d[s]; img.d[o + 1] = base.d[s + 1]; img.d[o + 2] = base.d[s + 2];
  }
  grille(img, m, S); reperes(img, m, S);
  const E = new Etiquettes(img);
  noms(img, m, world, S, E); coordonnees(img, m, S, E);
  return img;
}

/** carte des hauteurs en gris, 1 pixel = 1 case */
export function hauteurs1(m, H = hauteursCarte(m)) {
  const img = image(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) { const g = grisDe(H.h[i], H.rav[i]); img.d[i * 3] = img.d[i * 3 + 1] = img.d[i * 3 + 2] = g; }
  return img;
}

/** champ de hauteurs lissé (bilinéaire entre les centres des cases), échantillonné S fois par case */
function champ(m, H, S) {
  const W = m.w * S, Hh = m.h * S, f = new Float32Array(W * Hh);
  const at = (x, y) => H.h[Math.max(0, Math.min(m.h - 1, y)) * m.w + Math.max(0, Math.min(m.w - 1, x))];
  for (let y = 0; y < Hh; y++) {
    const fy = (y + 0.5) / S - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / S - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      f[y * W + x] = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    }
  }
  return { f, W, H: Hh };
}
/** normale (convention OpenGL : rouge = est, vert = nord, bleu = vers le haut) d'un champ de hauteurs ; pente : un étage par case */
function normale(f, W, Hh, x, y, parCase) {
  const g = (a, b) => f[Math.max(0, Math.min(Hh - 1, b)) * W + Math.max(0, Math.min(W - 1, a))];
  const gx = (g(x + 1, y) - g(x - 1, y)) / 2 * parCase, gy = (g(x, y + 1) - g(x, y - 1)) / 2 * parCase;
  const n = [-gx, gy, 1], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l];
}
export function normales(m, S = 1, H = hauteursCarte(m)) {
  const { f, W, H: Hh } = S === 1 ? { f: Float32Array.from(H.h), W: m.w, H: m.h } : champ(m, H, S), img = image(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const n = normale(f, W, Hh, x, y, S), o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) img.d[o + k] = Math.round((n[k] * 0.5 + 0.5) * 255);
  }
  return img;
}

/** teintes hypsométriques : vert en bas, puis jaune, brun, gris, blanc aux sommets */
const HYPSO = ['#5f9e4a', '#8cbc5a', '#b8d06a', '#dcd27a', '#e2b86a', '#d0965a', '#b8784c', '#9c624a', '#86584e', '#7a5c5e', '#8e8084', '#aaa2a6', '#c8c4c8', '#e4e2e6', '#ffffff'].map(rgbHex);
export const teinteNiveau = (h) => HYPSO[Math.max(0, Math.min(HYPSO.length - 1, h))];
/** hauteurs agrandies ×8 pour la lecture : teintes, ombrage, courbes de niveau, grille, noms, niveau des grands replats */
export function hauteurs8(m, world, S = ECHELLE, H = hauteursCarte(m)) {
  const img = image(m.w * S, m.h * S), { f, W } = champ(m, H, S), L = [-0.55, 0.55, 0.63];
  const l0 = L[2];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = ((y / S) | 0) * m.w + ((x / S) | 0), t = m.t[i];
    // un peu de la couleur du schéma (forêt, chemins, maisons) pour s'y retrouver
    const s = PAR_TYPE.get(t).rgb, b = H.rav[i] ? [42, 16, 48] : t === T.WATER || t === T.WHIRL ? [60, 120, 208] : teinteNiveau(H.h[i]);
    const c = H.rav[i] || t === T.WATER || t === T.WHIRL ? b : b.map((v, q) => v * 0.7 + s[q] * 0.3);
    const n = normale(f, W, img.h, x, y, S), k = Math.max(0.35, Math.min(1.35, 1 + 0.9 * (n[0] * L[0] + n[1] * L[1] + n[2] * L[2] - l0)));
    const o = (y * img.w + x) * 3; for (let q = 0; q < 3; q++) img.d[o + q] = Math.max(0, Math.min(255, Math.round(c[q] * k)));
  }
  // courbes de niveau : un trait sombre de chaque côté d'un bord entre deux hauteurs différentes (plus épais au-delà d'un étage)
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const h = H.h[y * m.w + x];
    if (x + 1 < m.w) { const d = Math.abs(H.h[y * m.w + x + 1] - h); if (d) voile(img, (x + 1) * S - (d > 1 ? 2 : 1), y * S, d > 1 ? 4 : 2, S, [30, 20, 10], 0.75); }
    if (y + 1 < m.h) { const d = Math.abs(H.h[(y + 1) * m.w + x] - h); if (d) voile(img, x * S, (y + 1) * S - (d > 1 ? 2 : 1), S, d > 1 ? 4 : 2, [30, 20, 10], 0.75); }
  }
  grille(img, m, S);
  const E = new Etiquettes(img);
  noms(img, m, world, S, E);
  // niveau des grands replats (au moins 40 cases d'un seul tenant), écrit sur la case la plus centrale
  const vu = new Uint8Array(m.w * m.h);
  for (let s = 0; s < m.w * m.h; s++) {
    if (vu[s] || H.h[s] === 0) continue;
    const h = H.h[s], comp = [s], q = [s]; vu[s] = 1;
    while (q.length) { const i = q.pop(), x = i % m.w, y = (i / m.w) | 0; for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (a < 0 || b < 0 || a >= m.w || b >= m.h) continue; const j = b * m.w + a; if (!vu[j] && H.h[j] === h) { vu[j] = 1; q.push(j); comp.push(j); } } }
    if (comp.length < 40) continue;
    let sx = 0, sy = 0; for (const i of comp) { sx += i % m.w; sy += (i / m.w) | 0; }
    sx /= comp.length; sy /= comp.length;
    let best = comp[0], bd = 1e9; for (const i of comp) { const d = Math.hypot(i % m.w - sx, ((i / m.w) | 0) - sy); if (d < bd) { bd = d; best = i; } }
    E.poser(`NIV ${h}`, ((best % m.w) + 0.5) * S, ((best / m.w) | 0) * S, BLANC, { e: 1, contour: NOIR, a: 'c' });
  }
  coordonnees(img, m, S, E);
  return img;
}

/* =====================================================================================================================
   Lecture des images rendues : quelle case, quelle hauteur
   ===================================================================================================================== */
/** taille de l'image par rapport à la carte : 1 (1 pixel = 1 case), un entier (agrandie), ou une erreur claire */
export function echelleDe(img, m) {
  if (img.w === m.w && img.h === m.h) return 1;
  const sx = img.w / m.w, sy = img.h / m.h;
  if (Number.isInteger(sx) && sx === sy) return sx;
  throw new Error(`l'image fait ${img.w} × ${img.h} pixels : la carte ${m.id} fait ${m.w} × ${m.h} cases ; renvoie l'image à sa taille d'origine (${m.w} × ${m.h}, ou exactement ×8 : ${m.w * 8} × ${m.h * 8}), sans la recadrer ni la redimensionner`);
}

export { T, walkable };
