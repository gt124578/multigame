// Odyssée — PixelForge : aperçu du sol généré du jeu (odyssee/js/render/solgen.js) hors navigateur.
//   node tools/pixelforge/solgen-apercu.mjs [carte] [bloc x] [bloc y] [nb x] [nb y] [image] [sortie.png]
//   node tools/pixelforge/solgen-apercu.mjs monde 1 12 3 2 0 /tmp/route1.png
// Les blocs (16 × 16 cases) sont assemblés comme en jeu ; le transparent (sol gardé par le jeu) est montré en magenta.
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { buildWorld } from '../../odyssee/js/world/region.js';
import { rendreBloc, zoneBloc, LUT, CELL } from '../../odyssee/js/render/solgen.js';

const [id = 'monde', ci0 = '1', cj0 = '12', ni = '3', nj = '2', frame = '0', out = 'sol-apercu.png'] = process.argv.slice(2);
const caveBiome = (m) => {   // même règle que world3d.js (qui charge three, absent de Node)
  const s = (m.id || '') + (m.name || '').toLowerCase();
  if (m.biome) return m.biome;
  if (/marees|maree|marée|tourbillon|sanctuaire/.test(s)) return 'mer';
  if (/magma|volcan/.test(s)) return 'magma';
  if (/givr|glace|neige/.test(s)) return 'glace';
  if (/victoire|mont/.test(s)) return 'montagne';
  return 'terre';
};
globalThis.TALUS_STYLE = process.env.TALUS || 'actuel';
const w = buildWorld(), m = (w.maps || w)[id];
if (!m) { console.error('carte inconnue :', id); process.exit(1); }
const CH = 16, W = +ni * CH * CELL, H = +nj * CH * CELL, rgba = new Uint32Array(W * H).fill(0xffff00ff);
let ms = 0;
for (let j = 0; j < +nj; j++) for (let i = 0; i < +ni; i++) {
  if ((+ci0 + i) * CH >= m.w || (+cj0 + j) * CH >= m.h) continue;
  const z = zoneBloc(m, +ci0 + i, +cj0 + j, CH), t0 = performance.now();
  const fr = rendreBloc({ ...z, seed: 7, cave: m.outdoor ? null : caveBiome(m) });
  ms += performance.now() - t0;
  const im = fr[Math.min(+frame, fr.length - 1)], bw = z.bw * CELL;
  for (let y = 0; y < z.bh * CELL; y++) for (let x = 0; x < bw; x++) {
    const v = LUT[im[y * bw + x]]; if (v) rgba[(j * CH * CELL + y) * W + i * CH * CELL + x] = v;
  }
}
// PNG minimal (RGBA 8 bits)
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
const raw = Buffer.alloc((W * 4 + 1) * H), px = Buffer.from(rgba.buffer);
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out} : ${W}x${H}, ${(ms / (+ni * +nj)).toFixed(0)} ms par bloc`);
