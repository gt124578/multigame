// Ouverture des classeurs protégés par mot de passe (chiffrement Office, MS-OFFCRYPTO).
// Pur JavaScript, synchrone, sans dépendance : AES (déchiffrement), SHA-1, SHA-256, SHA-384, SHA-512.
//
// Un .xlsx / .xlsm / .docx chiffré n'est plus un zip mais un conteneur CFB avec deux flux :
//   EncryptionInfo   : la méthode (« Agile » d'Excel 2010+, ou « Standard » d'Excel 2007 / LibreOffice)
//   EncryptedPackage : le zip chiffré (8 octets de taille, puis les données)

// ---------------------------------------------------------------------------
// AES
// ---------------------------------------------------------------------------

const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
(() => {
  // Construction de la S-box à partir de l'inverse dans GF(2^8)
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1 | q >> 7) & 0xff) ^ ((q << 2 | q >> 6) & 0xff) ^ ((q << 3 | q >> 5) & 0xff) ^ ((q << 4 | q >> 4) & 0xff);
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();
const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };
const M9 = new Uint8Array(256), M11 = new Uint8Array(256), M13 = new Uint8Array(256), M14 = new Uint8Array(256);
for (let i = 0; i < 256; i++) { M9[i] = mul(i, 9); M11[i] = mul(i, 11); M13[i] = mul(i, 13); M14[i] = mul(i, 14); }

function etendreCle(cle) {
  const nk = cle.length / 4, nr = nk + 6;
  if (![4, 6, 8].includes(nk)) throw new Error('Clé AES de taille invalide');
  const w = new Uint8Array(16 * (nr + 1));
  w.set(cle);
  let rcon = 1;
  for (let i = nk; i < 4 * (nr + 1); i++) {
    let t = w.slice(4 * (i - 1), 4 * i);
    if (i % nk === 0) { t = Uint8Array.of(SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]); rcon = xt(rcon); }
    else if (nk > 6 && i % nk === 4) t = t.map((b) => SBOX[b]);
    for (let j = 0; j < 4; j++) w[4 * i + j] = w[4 * (i - nk) + j] ^ t[j];
  }
  return { w, nr };
}

function dechiffrerBloc({ w, nr }, entree, sortie, off) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = entree[off + i] ^ w[16 * nr + i];
  const t = new Uint8Array(16);
  for (let r = nr - 1; r >= 0; r--) {
    // InvShiftRows + InvSubBytes
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) t[4 * c + l] = INV[s[4 * ((c - l + 4) % 4) + l]];
    for (let i = 0; i < 16; i++) t[i] ^= w[16 * r + i];
    if (r === 0) { sortie.set(t, off); return; }
    // InvMixColumns
    for (let c = 0; c < 4; c++) {
      const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
      s[4 * c] = M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3];
      s[4 * c + 1] = M9[a0] ^ M14[a1] ^ M11[a2] ^ M13[a3];
      s[4 * c + 2] = M13[a0] ^ M9[a1] ^ M14[a2] ^ M11[a3];
      s[4 * c + 3] = M11[a0] ^ M13[a1] ^ M9[a2] ^ M14[a3];
    }
  }
}

/** AES-ECB (sans bourrage). */
export function aesEcbDechiffrer(cle, donnees) {
  const k = etendreCle(cle);
  const n = donnees.length - (donnees.length % 16);
  const out = new Uint8Array(n);
  for (let off = 0; off < n; off += 16) dechiffrerBloc(k, donnees, out, off);
  return out;
}

/** AES-CBC (sans bourrage). */
export function aesCbcDechiffrer(cle, iv, donnees) {
  const k = etendreCle(cle);
  const n = donnees.length - (donnees.length % 16);
  const out = new Uint8Array(n);
  for (let off = 0; off < n; off += 16) {
    dechiffrerBloc(k, donnees, out, off);
    for (let i = 0; i < 16; i++) out[off + i] ^= off === 0 ? iv[i] : donnees[off - 16 + i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// SHA
// ---------------------------------------------------------------------------

function remplir(msg, tailleBloc, tailleLongueur) {
  const l = msg.length;
  const n = Math.ceil((l + 1 + tailleLongueur) / tailleBloc) * tailleBloc;
  const b = new Uint8Array(n);
  b.set(msg); b[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(b.buffer);
  dv.setUint32(n - 4, bits >>> 0);
  dv.setUint32(n - 8, Math.floor(bits / 0x100000000));
  return dv;
}

export function sha1(msg) {
  const dv = remplir(msg, 64, 8);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let o = 0; o < dv.byteLength; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i);
    for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? ((b & c) | (~b & d)) + 0x5a827999 : i < 40 ? (b ^ c ^ d) + 0x6ed9eba1 : i < 60 ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc : (b ^ c ^ d) + 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(20));
  [h0, h1, h2, h3, h4].forEach((h, i) => out.setUint32(4 * i, h));
  return new Uint8Array(out.buffer);
}

const K256 = Uint32Array.from([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export function sha256(msg) {
  const dv = remplir(msg, 64, 8);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < dv.byteLength; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new DataView(new ArrayBuffer(32));
  h.forEach((x, i) => out.setUint32(4 * i, x));
  return new Uint8Array(out.buffer);
}

// SHA-512 / SHA-384 avec des mots de 64 bits en deux moitiés de 32 bits
const K512 = (() => {
  const hex = ['428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118',
    'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694',
    'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
    '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70',
    '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b',
    'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
    '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3',
    '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec', '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b',
    'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
    '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817'];
  const k = new Uint32Array(160);
  hex.forEach((h, i) => { k[2 * i] = parseInt(h.slice(0, 8), 16); k[2 * i + 1] = parseInt(h.slice(8), 16); });
  return k;
})();
const enMots = (liste) => { const o = new Uint32Array(16); liste.forEach((x, i) => { o[2 * i] = parseInt(x.slice(0, 8), 16); o[2 * i + 1] = parseInt(x.slice(8), 16); }); return o; };
const IV512 = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'];
const IV384 = ['cbbb9d5dc1059ed8', '629a292a367cd507', '9159015a3070dd17', '152fecd8f70e5939', '67332667ffc00b31', '8eb44a8768581511', 'db0c2e0d64f98fa7', '47b5481dbefa4fa4'];

const W512 = new Uint32Array(160);
function sha512Base(msg, iv, tailleSortie) {
  const dv = remplir(msg, 128, 16);
  const h = iv.slice();
  const w = W512;
  for (let o = 0; o < dv.byteLength; o += 128) {
    for (let i = 0; i < 32; i++) w[i] = dv.getUint32(o + 4 * i);
    for (let i = 16; i < 80; i++) {
      // σ0 = rotr1 ^ rotr8 ^ shr7 ; σ1 = rotr19 ^ rotr61 ^ shr6
      const xh = w[2 * (i - 15)], xl = w[2 * (i - 15) + 1];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
      const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      const yh = w[2 * (i - 2)], yl = w[2 * (i - 2) + 1];
      const s1h = ((yh >>> 19) | (yl << 13)) ^ ((yl >>> 29) | (yh << 3)) ^ (yh >>> 6);
      const s1l = ((yl >>> 19) | (yh << 13)) ^ ((yh >>> 29) | (yl << 3)) ^ ((yl >>> 6) | (yh << 26));
      let l = (w[2 * (i - 16) + 1] >>> 0) + (s0l >>> 0) + (w[2 * (i - 7) + 1] >>> 0) + (s1l >>> 0);
      const hi = w[2 * (i - 16)] + s0h + w[2 * (i - 7)] + s1h + Math.floor(l / 0x100000000);
      w[2 * i] = hi >>> 0; w[2 * i + 1] = l >>> 0;
    }
    let ah = h[0], al = h[1], bh = h[2], bl = h[3], ch = h[4], cl = h[5], dh = h[6], dl = h[7];
    let eh = h[8], el = h[9], fh = h[10], fl = h[11], gh = h[12], gl = h[13], hh = h[14], hl = h[15];
    for (let i = 0; i < 80; i++) {
      // Σ1(e) = rotr14 ^ rotr18 ^ rotr41
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      let t1l = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + K512[2 * i + 1] + w[2 * i + 1];
      let t1h = hh + S1h + chh + K512[2 * i] + w[2 * i] + Math.floor(t1l / 0x100000000);
      t1l >>>= 0; t1h >>>= 0;
      // Σ0(a) = rotr28 ^ rotr34 ^ rotr39
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch), majl = (al & bl) ^ (al & cl) ^ (bl & cl);
      let t2l = (S0l >>> 0) + (majl >>> 0);
      let t2h = S0h + majh + Math.floor(t2l / 0x100000000);
      t2l >>>= 0; t2h >>>= 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      let nl = (dl >>> 0) + t1l; eh = (dh + t1h + Math.floor(nl / 0x100000000)) >>> 0; el = nl >>> 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      nl = t1l + t2l; ah = (t1h + t2h + Math.floor(nl / 0x100000000)) >>> 0; al = nl >>> 0;
    }
    const add = (i, xh, xl) => { const l = (h[2 * i + 1] >>> 0) + (xl >>> 0); h[2 * i] = (h[2 * i] + xh + Math.floor(l / 0x100000000)) >>> 0; h[2 * i + 1] = l >>> 0; };
    add(0, ah, al); add(1, bh, bl); add(2, ch, cl); add(3, dh, dl); add(4, eh, el); add(5, fh, fl); add(6, gh, gl); add(7, hh, hl);
  }
  const out = new DataView(new ArrayBuffer(64));
  h.forEach((x, i) => out.setUint32(4 * i, x));
  return new Uint8Array(out.buffer, 0, tailleSortie).slice();
}
const IV512M = enMots(IV512), IV384M = enMots(IV384);
export const sha512 = (m) => sha512Base(m, IV512M, 64);
export const sha384 = (m) => sha512Base(m, IV384M, 48);

const HACHAGES = { SHA1: sha1, 'SHA-1': sha1, SHA256: sha256, 'SHA-256': sha256, SHA384: sha384, 'SHA-384': sha384, SHA512: sha512, 'SHA-512': sha512 };

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const concat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const le32 = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
const utf16le = (s) => { const o = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o[2 * i] = c & 255; o[2 * i + 1] = c >> 8; } return o; };
const base64 = (s) => { const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
const egaux = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const ajuster = (b, n, rembourrage) => { if (b.length >= n) return b.slice(0, n); const o = new Uint8Array(n).fill(rembourrage); o.set(b); return o; };
const lireU64 = (b) => b[0] + b[1] * 256 + b[2] * 65536 + b[3] * 16777216 + (b[4] + b[5] * 256 + b[6] * 65536 + b[7] * 16777216) * 4294967296;

export class ErreurMotDePasse extends Error {
  constructor(message) { super(message); this.name = 'ErreurMotDePasse'; }
}

function fluxCFB(XLSX, cfb, nom) {
  const i = cfb.FullPaths.findIndex((p) => p.replace(/\/$/, '').split('/').pop().toLowerCase() === nom.toLowerCase());
  return i < 0 ? null : Uint8Array.from(cfb.FileIndex[i].content);
}

/** Vrai si les octets sont un document Office chiffré par mot de passe. */
export function estChiffre(XLSX, octets) {
  if (!(octets[0] === 0xd0 && octets[1] === 0xcf && octets[2] === 0x11 && octets[3] === 0xe0)) return false;
  try {
    const cfb = XLSX.CFB.read(octets, { type: 'array' });
    return !!fluxCFB(XLSX, cfb, 'EncryptionInfo') && !!fluxCFB(XLSX, cfb, 'EncryptedPackage');
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Méthode « Agile » (Excel 2010 et suivants)
// ---------------------------------------------------------------------------

function attributs(xml, balise) {
  const m = new RegExp('<(?:\\w+:)?' + balise + '\\b([^>]*)>').exec(xml);
  if (!m) return null;
  const o = {};
  for (const a of m[1].matchAll(/(\w+)="([^"]*)"/g)) o[a[1]] = a[2];
  return o;
}

function dechiffrerAgile(info, paquet, motDePasse) {
  const xml = new TextDecoder('utf-8').decode(info.subarray(8));
  const kd = attributs(xml, 'keyData');
  const ek = attributs(xml, 'encryptedKey');
  if (!kd || !ek) throw new Error('Informations de chiffrement illisibles');
  if ((ek.cipherAlgorithm || 'AES') !== 'AES' || (kd.cipherAlgorithm || 'AES') !== 'AES') throw new Error('Algorithme de chiffrement non pris en charge : ' + ek.cipherAlgorithm);
  const H = HACHAGES[ek.hashAlgorithm.toUpperCase()], Hd = HACHAGES[kd.hashAlgorithm.toUpperCase()];
  if (!H || !Hd) throw new Error('Hachage non pris en charge : ' + ek.hashAlgorithm);
  const sel = base64(ek.saltValue), tours = +ek.spinCount, tailleCle = +ek.keyBits / 8, bloc = +ek.blockSize;
  let h = H(concat(sel, utf16le(motDePasse)));
  const tampon = new Uint8Array(4 + h.length);
  for (let i = 0; i < tours; i++) { tampon.set(le32(i), 0); tampon.set(h, 4); h = H(tampon); }
  const cle = (bloc8) => ajuster(H(concat(h, bloc8)), tailleCle, 0x36);
  const iv = ajuster(sel, bloc, 0x36);
  const entree = aesCbcDechiffrer(cle(Uint8Array.of(0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79)), iv, base64(ek.encryptedVerifierHashInput)).subarray(0, +ek.saltSize);
  const attendu = aesCbcDechiffrer(cle(Uint8Array.of(0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e)), iv, base64(ek.encryptedVerifierHashValue)).subarray(0, +ek.hashSize);
  if (!egaux(H(entree).subarray(0, +ek.hashSize), attendu)) throw new ErreurMotDePasse('Mot de passe incorrect');
  const cleSecrete = aesCbcDechiffrer(cle(Uint8Array.of(0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6)), iv, base64(ek.encryptedKeyValue)).subarray(0, +kd.keyBits / 8);
  // Le paquet : segments de 4096 octets, chacun avec son propre vecteur d'initialisation
  const taille = lireU64(paquet);
  const selDonnees = base64(kd.saltValue), blocDonnees = +kd.blockSize;
  const out = new Uint8Array(taille);
  const donnees = paquet.subarray(8);
  for (let seg = 0, off = 0; off < donnees.length && off < taille; seg++, off += 4096) {
    const morceau = donnees.subarray(off, Math.min(off + 4096, donnees.length));
    const ivSeg = ajuster(Hd(concat(selDonnees, le32(seg))), blocDonnees, 0x36);
    const clair = aesCbcDechiffrer(cleSecrete, ivSeg, morceau);
    out.set(clair.subarray(0, Math.min(clair.length, taille - off)), off);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Méthode « Standard » (Excel 2007, LibreOffice)
// ---------------------------------------------------------------------------

function dechiffrerStandard(info, paquet, motDePasse) {
  const dv = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const tailleEntete = dv.getUint32(8, true);
  const entete = 12;
  const algId = dv.getUint32(entete + 8, true), hashId = dv.getUint32(entete + 12, true), bits = dv.getUint32(entete + 16, true) || 128;
  if (![0x660e, 0x660f, 0x6610].includes(algId)) throw new Error('Chiffrement non pris en charge (RC4 ou ancien format) : seuls les fichiers AES sont lus');
  if (hashId && hashId !== 0x8004) throw new Error('Hachage non pris en charge');
  let p = entete + tailleEntete;
  const tailleSel = dv.getUint32(p, true); p += 4;
  const sel = info.slice(p, p + tailleSel); p += tailleSel;
  const verifChiffre = info.slice(p, p + 16); p += 16;
  const tailleHash = dv.getUint32(p, true); p += 4;
  const hashChiffre = info.slice(p, p + 32);
  // Dérivation de la clé (MS-OFFCRYPTO 2.3.4.7)
  let h = sha1(concat(sel, utf16le(motDePasse)));
  const tampon = new Uint8Array(24);
  for (let i = 0; i < 50000; i++) { tampon.set(le32(i), 0); tampon.set(h, 4); h = sha1(tampon); }
  const hf = sha1(concat(h, le32(0)));
  const x = (c) => { const b = new Uint8Array(64).fill(c); for (let i = 0; i < hf.length; i++) b[i] ^= hf[i]; return sha1(b); };
  const cle = concat(x(0x36), x(0x5c)).subarray(0, bits / 8);
  const verif = aesEcbDechiffrer(cle, verifChiffre);
  const hashVerif = aesEcbDechiffrer(cle, hashChiffre).subarray(0, tailleHash);
  if (!egaux(sha1(verif), hashVerif)) throw new ErreurMotDePasse('Mot de passe incorrect');
  const taille = lireU64(paquet);
  return aesEcbDechiffrer(cle, paquet.subarray(8)).subarray(0, taille);
}

/**
 * Déchiffre un document Office protégé par mot de passe et renvoie les octets du zip (.xlsx, .xlsm, .docx).
 * Lève ErreurMotDePasse si le mot de passe est faux.
 */
export function dechiffrerOffice(XLSX, octets, motDePasse) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const info = fluxCFB(XLSX, cfb, 'EncryptionInfo'), paquet = fluxCFB(XLSX, cfb, 'EncryptedPackage');
  if (!info || !paquet) throw new Error('Ce fichier n\'est pas chiffré');
  const majeur = info[0] | (info[1] << 8), mineur = info[2] | (info[3] << 8);
  let zip;
  if (majeur === 4 && mineur === 4) zip = dechiffrerAgile(info, paquet, motDePasse);
  else if ((majeur === 2 || majeur === 3 || majeur === 4) && mineur === 2) zip = dechiffrerStandard(info, paquet, motDePasse);
  else throw new Error('Méthode de chiffrement inconnue (version ' + majeur + '.' + mineur + ')');
  if (!(zip[0] === 0x50 && zip[1] === 0x4b)) throw new ErreurMotDePasse('Mot de passe incorrect');
  return zip;
}
