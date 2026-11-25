// odyssee/moteur/render/nsbmd.js — lecteur des modèles 3D de la DS (NARC, NSBMD : MDL0 + TEX0), sans three.js.
// Sert à montrer les vrais bâtiments de HeartGold / SoulSilver, lus À LA VOLÉE dans le dépôt public de la
// décompilation (pret/pokeheartgold) : rien n'est copié dans ce dépôt.
//
// Ce que fait le lecteur :
//   - NARC : l'archive (une liste de fichiers) ;
//   - MDL0 : les nœuds (translation, rotation, échelle), le bytecode de rendu (quel matériau, quelle forme, quelle
//     matrice), les matériaux (texture, palette, répétition, alpha, faces visibles), les formes (listes d'affichage
//     du processeur 3D de la DS : sommets, couleurs, coordonnées de texture, triangles, quadrilatères, bandes) ;
//   - TEX0 : les textures dans les 7 formats de la DS (A3I5, 4, 16 et 256 couleurs, 4 × 4 compressé, A5I3, direct).
// Résultat : pour chaque modèle, des lots de triangles par matériau (positions, coordonnées de texture, couleurs)
// et les textures décodées en RGBA. Unité : celle de la DS (16 unités = une case).

const fx = (v) => v / 4096;
const s16 = (v) => (v << 16) >> 16;
const s10 = (v) => (v << 22) >> 22;

class Lecteur {
  constructor(buf, off = 0) { this.d = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength); this.o = off; this.u8a = new Uint8Array(this.d.buffer, this.d.byteOffset, this.d.byteLength); }
  u8(o) { return this.d.getUint8(o); }
  u16(o) { return this.d.getUint16(o, true); }
  s16(o) { return this.d.getInt16(o, true); }
  u32(o) { return this.d.getUint32(o, true); }
  s32(o) { return this.d.getInt32(o, true); }
  tag(o) { return String.fromCharCode(this.u8(o), this.u8(o + 1), this.u8(o + 2), this.u8(o + 3)); }
  nom(o) { let s = ''; for (let i = 0; i < 16; i++) { const c = this.u8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; }
}

/** les fichiers d'une archive NARC */
export function lireNarc(buf) {
  const L = new Lecteur(buf);
  if (L.tag(0) !== 'NARC') throw new Error('pas une archive NARC');
  let o = 16;
  if (L.tag(o) !== 'BTAF') throw new Error('NARC : table des fichiers absente');
  const taille = L.u32(o + 4), n = L.u16(o + 8);
  const fat = [];
  for (let i = 0; i < n; i++) fat.push([L.u32(o + 12 + 8 * i), L.u32(o + 16 + 8 * i)]);
  o += taille;
  o += L.u32(o + 4);                       // BTNF (noms, inutiles ici)
  const img = o + 8;
  const u8 = L.u8a;
  return fat.map(([a, b]) => u8.slice(img + a, img + b));
}

/** dictionnaire NNS : [{ nom, o }] où o est l'adresse des données de l'entrée */
function dico(L, o) {
  const n = L.u8(o + 1);
  const data = o + L.u16(o + 6);
  const tailleEntree = L.u16(data);
  const noms = data + 4 + tailleEntree * n;
  const r = [];
  for (let i = 0; i < n; i++) r.push({ nom: L.nom(noms + 16 * i), o: data + 4 + tailleEntree * i });
  return r;
}

// ——— matrices 4 × 3 (lignes : 3 colonnes de rotation, puis la translation) ———
const ident = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function mult(a, b) {   // a * b, au sens DS (vecteur ligne : v * b * a)
  const r = new Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = b[i * 3] * a[j] + b[i * 3 + 1] * a[3 + j] + b[i * 3 + 2] * a[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = b[9] * a[j] + b[10] * a[3 + j] + b[11] * a[6 + j] + a[9 + j];
  return r;
}
const appliquer = (m, x, y, z) => [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];

/** un nœud : sa matrice locale (échelle, rotation, translation) */
function lireNoeud(L, o) {
  const f = L.u16(o);
  let p = o + 4;
  let t = [0, 0, 0], r = [1, 0, 0, 0, 1, 0, 0, 0, 1], s = [1, 1, 1];
  if (!(f & 1)) { t = [fx(L.s32(p)), fx(L.s32(p + 4)), fx(L.s32(p + 8))]; p += 12; }
  if (!(f & 2)) {
    if (f & 8) {
      // rotation « pivot » : une ligne et une colonne avec ±1, le reste vient de A et B
      const A = fx(L.s16(p)), B = fx(L.s16(p + 2)); p += 4;
      const piv = (f >> 4) & 15, neg = (f >> 8) & 15;
      const one = neg & 1 ? -1 : 1, c = neg & 2 ? -B : B, d = neg & 4 ? -A : A;
      const m = new Array(9).fill(0);
      m[piv] = one;
      const rows = [[4, 5, 7, 8], [3, 5, 6, 8], [3, 4, 6, 7], [1, 2, 7, 8], [0, 2, 6, 8], [0, 1, 6, 7], [1, 2, 4, 5], [0, 2, 3, 5], [0, 1, 3, 4]][piv];
      [m[rows[0]], m[rows[1]], m[rows[2]], m[rows[3]]] = [A, B, c, d];
      r = m;
    } else {
      r = [fx(L.s16(o + 2))];
      for (let i = 0; i < 8; i++) r.push(fx(L.s16(p + 2 * i)));
      p += 16;
    }
  }
  if (!(f & 4)) { s = [fx(L.s32(p)), fx(L.s32(p + 4)), fx(L.s32(p + 8))]; p += 24; }
  return [r[0] * s[0], r[1] * s[0], r[2] * s[0], r[3] * s[1], r[4] * s[1], r[5] * s[1], r[6] * s[2], r[7] * s[2], r[8] * s[2], t[0], t[1], t[2]];
}

const NB_PARAMS = { 0x00: 0, 0x10: 1, 0x11: 0, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 0, 0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9, 0x1b: 3, 0x1c: 3,
  0x20: 1, 0x21: 1, 0x22: 1, 0x23: 2, 0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1, 0x2a: 1, 0x2b: 1, 0x30: 1, 0x31: 1, 0x32: 1, 0x33: 1, 0x34: 32,
  0x40: 1, 0x41: 0, 0x50: 1, 0x60: 1, 0x70: 3, 0x71: 2, 0x72: 1 };

/** liste d'affichage → triangles (positions dans l'espace du modèle, après la matrice courante) */
function lireListe(L, o, taille, pile, mCourante, sortie) {
  const fin = o + taille;
  let m = mCourante, v = [0, 0, 0], st = [0, 0], col = null, mode = 0, tampon = [];
  const emettre = () => {
    const p = tampon;
    const tri = (a, b, c) => sortie.push(a, b, c);
    if (mode === 0) for (let i = 0; i + 2 < p.length; i += 3) tri(p[i], p[i + 1], p[i + 2]);
    else if (mode === 1) for (let i = 0; i + 3 < p.length; i += 4) { tri(p[i], p[i + 1], p[i + 2]); tri(p[i], p[i + 2], p[i + 3]); }
    else if (mode === 2) for (let i = 0; i + 2 < p.length; i++) (i & 1) ? tri(p[i + 1], p[i], p[i + 2]) : tri(p[i], p[i + 1], p[i + 2]);
    else if (mode === 3) for (let i = 0; i + 3 < p.length; i += 2) { tri(p[i], p[i + 1], p[i + 3]); tri(p[i], p[i + 3], p[i + 2]); }
    tampon = [];
  };
  const sommet = () => tampon.push({ p: appliquer(m, v[0], v[1], v[2]), st: [...st], col });
  while (o < fin) {
    const cmds = [L.u8(o), L.u8(o + 1), L.u8(o + 2), L.u8(o + 3)];
    o += 4;
    for (const c of cmds) {
      const n = NB_PARAMS[c] ?? 0;
      const P = (i) => L.u32(o + 4 * i);
      switch (c) {
        case 0x14: m = pile[P(0) & 31] || m; break;
        case 0x1b: { const sx = fx(L.s32(o)), sy = fx(L.s32(o + 4)), sz = fx(L.s32(o + 8)); m = mult(m, [sx, 0, 0, 0, sy, 0, 0, 0, sz, 0, 0, 0]); break; }
        case 0x20: { const w = P(0); col = [(w & 31) / 31, ((w >> 5) & 31) / 31, ((w >> 10) & 31) / 31]; break; }
        case 0x22: { const w = P(0); st = [s16(w & 0xffff) / 16, s16(w >>> 16) / 16]; break; }
        case 0x23: { const a = P(0), b = P(1); v = [fx(s16(a & 0xffff)), fx(s16(a >>> 16)), fx(s16(b & 0xffff))]; sommet(); break; }
        case 0x24: { const a = P(0); v = [s10(a & 1023) / 64, s10((a >> 10) & 1023) / 64, s10((a >> 20) & 1023) / 64]; sommet(); break; }
        case 0x25: { const a = P(0); v = [fx(s16(a & 0xffff)), fx(s16(a >>> 16)), v[2]]; sommet(); break; }
        case 0x26: { const a = P(0); v = [fx(s16(a & 0xffff)), v[1], fx(s16(a >>> 16))]; sommet(); break; }
        case 0x27: { const a = P(0); v = [v[0], fx(s16(a & 0xffff)), fx(s16(a >>> 16))]; sommet(); break; }
        case 0x28: { const a = P(0); v = [v[0] + s10(a & 1023) / 4096, v[1] + s10((a >> 10) & 1023) / 4096, v[2] + s10((a >> 20) & 1023) / 4096]; sommet(); break; }
        case 0x40: emettre(); mode = P(0) & 3; break;
        case 0x41: emettre(); break;
        default: break;
      }
      o += 4 * n;
    }
  }
  emettre();
}

/** un modèle du bloc MDL0 → { nom, lots: [{ materiau, sommets: [{ p, st, col }] }], boite } */
function lireModele(L, o, nom) {
  const ofsSbc = o + L.u32(o + 4), ofsMat = o + L.u32(o + 8), ofsShp = o + L.u32(o + 12), finSbc = ofsMat;
  const info = o + 0x14;
  const posScale = fx(L.s32(info + 8));
  const noeudsDico = dico(L, info + 0x2c);
  const noeuds = noeudsDico.map((e) => lireNoeud(L, info + 0x2c + L.u32(e.o)));
  // matériaux
  const matsDico = dico(L, ofsMat + 4);
  const materiaux = matsDico.map((e) => {
    const m = ofsMat + L.u32(e.o);
    const polyAttr = L.u32(m + 12), tip = L.u32(m + 20), flag = L.u16(m + 30);
    const larg = L.u16(m + 32), haut = L.u16(m + 34);
    let p = m + 44, sS = 1, sT = 1, tS = 0, tT = 0;
    if (flag & 1) {   // matrice de texture
      if (!(flag & 2)) { sS = fx(L.s32(p)); sT = fx(L.s32(p + 4)); p += 8; }
      if (!(flag & 4)) p += 8;
      if (!(flag & 8)) { tS = fx(L.s32(p)); tT = fx(L.s32(p + 4)); p += 8; }
    }
    return {
      nom: e.nom, alpha: ((polyAttr >> 16) & 31) / 31, faces: (polyAttr >> 6) & 3,
      repS: !!(tip & (1 << 16)), repT: !!(tip & (1 << 17)), miroirS: !!(tip & (1 << 18)), miroirT: !!(tip & (1 << 19)),
      larg, haut, sS, sT, tS, tT, diffuse: L.u32(m + 4) & 0x7fff, texture: null, palette: null,
    };
  });
  // texture et palette de chaque matériau
  const lier = (ofsDico, cle) => {
    for (const e of dico(L, ofsMat + ofsDico)) {
      const liste = ofsMat + L.u16(e.o), n = L.u8(e.o + 2);
      for (let i = 0; i < n; i++) { const mi = L.u8(liste + i); if (materiaux[mi]) materiaux[mi][cle] = e.nom; }
    }
  };
  lier(L.u16(ofsMat), 'texture');
  lier(L.u16(ofsMat + 2), 'palette');
  // formes
  const formes = dico(L, ofsShp).map((e) => {
    const s = ofsShp + L.u32(e.o);
    return { o: s + L.u32(s + 8), taille: L.u32(s + 12) };
  });
  // bytecode de rendu
  const pile = [], lots = new Map();
  let m = ident(), mat = 0, echelleVue = false;
  const monde = new Array(noeuds.length);
  for (let p = ofsSbc; p < finSbc;) {
    const op = L.u8(p), base = op & 0x1f, v = op >> 5;
    if (base === 0x01) break;
    switch (base) {
      case 0x00: p += 1; break;
      case 0x02: p += 3; break;
      case 0x03: m = pile[L.u8(p + 1)] || m; p += 2; break;
      case 0x04: mat = L.u8(p + 1); p += 2; break;
      case 0x05: {
        const f = formes[L.u8(p + 1)];
        if (f) { if (!lots.has(mat)) lots.set(mat, []); lireListe(L, f.o, f.taille, pile, m, lots.get(mat)); }
        p += 2; break;
      }
      case 0x06: {
        const id = L.u8(p + 1), parent = L.u8(p + 2);
        let q = p + 4;
        const dest = v & 1 ? L.u8(q++) : -1, src = v & 2 ? L.u8(q++) : -1;
        const pm = src >= 0 ? pile[src] || ident() : id === parent ? ident() : monde[parent] || ident();
        monde[id] = mult(pm, noeuds[id] || ident());
        m = monde[id];
        if (dest >= 0) pile[dest] = m;
        p = q; break;
      }
      case 0x07: case 0x08: p += 2 + (v & 1) + ((v >> 1) & 1); break;
      case 0x09: { const n = L.u8(p + 2); p += 3 + 3 * n; break; }
      case 0x0b: if (v === 0) { m = mult(m, [posScale, 0, 0, 0, posScale, 0, 0, 0, posScale, 0, 0, 0]); echelleVue = true; } p += 1; break;
      case 0x0c: case 0x0d: p += 3; break;
      default: p += 1; break;
    }
  }
  // sans commande d'échelle, on applique celle du modèle
  const k = echelleVue ? 1 : posScale;
  const sorties = [];
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const [mi, sommets] of lots) {
    for (const s of sommets) {
      s.p = s.p.map((c) => c * k);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], s.p[i]); max[i] = Math.max(max[i], s.p[i]); }
    }
    sorties.push({ materiau: materiaux[mi], sommets });
  }
  return { nom, lots: sorties, boite: { min, max } };
}

// ——— textures ———
const rgb555 = (c, a = 255) => [((c & 31) * 255 / 31) | 0, (((c >> 5) & 31) * 255 / 31) | 0, (((c >> 10) & 31) * 255 / 31) | 0, a];

function lireTextures(L, o) {
  const dicoTex = o + L.u16(o + 0x0e), donnees = o + L.u32(o + 0x14);
  const donnees4x4 = o + L.u32(o + 0x24), index4x4 = o + L.u32(o + 0x28);
  const dicoPal = o + L.u16(o + 0x34), donneesPal = o + L.u32(o + 0x38);
  const palettes = {};
  for (const e of dico(L, dicoPal)) palettes[e.nom] = donneesPal + (L.u16(e.o) << 3);
  const textures = {};
  for (const e of dico(L, dicoTex)) {
    const param = L.u32(e.o);
    textures[e.nom] = {
      ofs: (param & 0xffff) << 3, larg: 8 << ((param >> 20) & 7), haut: 8 << ((param >> 23) & 7),
      format: (param >> 26) & 7, transparent0: !!(param & (1 << 29)),
    };
  }
  /** décode une texture avec une palette → { larg, haut, rgba } */
  const decoder = (nomTex, nomPal, trans0 = false) => {
    const t0 = textures[nomTex], t = t0 && trans0 ? { ...t0, transparent0: true } : t0;
    if (!t) return null;
    const { larg, haut, format } = t, n = larg * haut, out = new Uint8Array(n * 4);
    const pal = nomPal != null ? palettes[nomPal] : null;
    const couleur = (i) => (pal == null ? [255, 0, 255, 255] : rgb555(L.u16(pal + 2 * i)));
    const put = (k, c) => out.set(c, k * 4);
    const base = donnees + t.ofs;
    switch (format) {
      case 1: for (let k = 0; k < n; k++) { const b = L.u8(base + k), c = couleur(b & 31); c[3] = (((b >> 5) * 4 + ((b >> 5) >> 1)) * 255 / 31) | 0; put(k, c); } break;
      case 2: for (let k = 0; k < n; k++) { const i = (L.u8(base + (k >> 2)) >> ((k & 3) * 2)) & 3; put(k, i === 0 && t.transparent0 ? [0, 0, 0, 0] : couleur(i)); } break;
      case 3: for (let k = 0; k < n; k++) { const i = (L.u8(base + (k >> 1)) >> ((k & 1) * 4)) & 15; put(k, i === 0 && t.transparent0 ? [0, 0, 0, 0] : couleur(i)); } break;
      case 4: for (let k = 0; k < n; k++) { const i = L.u8(base + k); put(k, i === 0 && t.transparent0 ? [0, 0, 0, 0] : couleur(i)); } break;
      case 6: for (let k = 0; k < n; k++) { const b = L.u8(base + k), c = couleur(b & 7); c[3] = ((b >> 3) * 255 / 31) | 0; put(k, c); } break;
      case 7: for (let k = 0; k < n; k++) { const v = L.u16(base + 2 * k); put(k, rgb555(v, v & 0x8000 ? 255 : 0)); } break;
      case 5: {
        const blocsL = larg / 4;
        for (let by = 0; by < haut / 4; by++) for (let bx = 0; bx < blocsL; bx++) {
          const b = by * blocsL + bx;
          const texels = L.u32(donnees4x4 + t.ofs + 4 * b);
          const idx = L.u16(index4x4 + (t.ofs >> 1) + 2 * b);
          const po = (idx & 0x3fff) * 2, modeB = idx >> 14;
          const c0 = couleur(po), c1 = couleur(po + 1);
          const mel = (a, b2, wa, wb) => [0, 1, 2].map((j) => ((a[j] * wa + b2[j] * wb) / (wa + wb)) | 0).concat(255);
          const cs = modeB === 0 ? [c0, c1, couleur(po + 2), [0, 0, 0, 0]]
            : modeB === 1 ? [c0, c1, mel(c0, c1, 1, 1), [0, 0, 0, 0]]
              : modeB === 2 ? [c0, c1, couleur(po + 2), couleur(po + 3)]
                : [c0, c1, mel(c0, c1, 5, 3), mel(c0, c1, 3, 5)];
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) put((by * 4 + y) * larg + bx * 4 + x, cs[(texels >> ((y * 4 + x) * 2)) & 3]);
        }
        break;
      }
      default: return null;
    }
    return { larg, haut, rgba: out };
  };
  return { textures, palettes, decoder };
}

/** un jeu de textures séparé (NSBTX, bloc BTX0 → TEX0) : celui des cartes de Platine → { decoder, textures } */
export function lireNsbtx(buf) {
  const L = new Lecteur(buf);
  if (L.tag(0) !== 'BTX0') throw new Error('pas un jeu de textures NSBTX');
  const o = L.u32(0x10);
  if (L.tag(o) !== 'TEX0') throw new Error('NSBTX sans TEX0');
  const T = lireTextures(L, o);
  return { decoder: T.decoder, textures: T.textures, palettes: T.palettes };
}

/** un fichier NSBMD → { modeles: [...], decoder(nomTex, nomPal) } */
export function lireNsbmd(buf) {
  const L = new Lecteur(buf);
  if (L.tag(0) !== 'BMD0') throw new Error('pas un modèle NSBMD');
  const nb = L.u16(0x0e);
  let mdl = null, tex = null;
  for (let i = 0; i < nb; i++) {
    const o = L.u32(0x10 + 4 * i), t = L.tag(o);
    if (t === 'MDL0') mdl = o; else if (t === 'TEX0') tex = o;
  }
  const modeles = mdl === null ? [] : dico(L, mdl + 8).map((e) => lireModele(L, mdl + L.u32(e.o), e.nom));
  const T = tex === null ? null : lireTextures(L, tex);
  return { modeles, decoder: T ? T.decoder : () => null, textures: T?.textures || {} };
}
