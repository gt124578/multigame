// tools/odyssee-schema-import.mjs — relit un schéma de carte corrigé (dessiné par-dessus les images de odyssee-schema.mjs)
// et en tire les retouches du jeu (odyssee/js/world/retouches.js) :
//   node tools/odyssee-schema-import.mjs <carte> <schema.png | -> [hauteurs.png] [--appliquer] [--base <dossier>]
//                                        [--sans-parois] [--json <fichier>]
//   <carte>        identifiant de la carte (monde, grotte, victoire, magma:caverne ou magma-caverne…)
//   <schema.png>   le schéma corrigé (1 pixel = 1 case, ou la version ×8, ou un agrandissement entier) ; « - » : aucun
//   [hauteurs.png] la carte des hauteurs corrigée, en gris (dehors seulement)
//   --appliquer    ajoute les retouches dans retouches.js (sans toucher aux autres), puis lance tools/test-odyssee.mjs ;
//                  si le test échoue, retouches.js est remis comme avant
//   --base <dossier>  l'export d'où partent les dessins (sinon : la carte telle qu'elle est maintenant dans le jeu)
//   --sans-parois  ne pose pas les falaises sous les bords sud rehaussés (elles sont alors seulement signalées)
//   --json <fichier>  écrit aussi les retouches dans un fichier
// Sans --appliquer, rien n'est écrit dans le jeu : rapport et JSON seulement.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { buildWorld } from '../odyssee/js/world/region.js';
import { applyOps, RETOUCHES } from '../odyssee/js/world/retouches.js';
import {
  T, walkable, PALETTE, PAR_TYPE, FIXES, nomType, dist, grisDe, hauteurDe, hauteursCarte, schema8, chargerImage,
  echelleDe, nomFichier, estGrotte, ECHELLE,
} from './odyssee-schema-commun.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER_RETOUCHES = join(RACINE, 'odyssee/js/world/retouches.js');

/* ---------------------------------------------------------------- lecture du schéma ---------------------------------- */
// types qu'on peut reconnaître sur une carte : ceux qu'elle porte déjà, plus les sols de son genre (dehors ou grotte) ;
// les cases fixes restent reconnaissables (pour signaler qu'on ne les pose pas) ; ceux des maisons seulement s'ils y sont
const DEHORS = ['GRASS', 'PATH', 'TALL', 'TREE', 'WATER', 'SAND', 'FLOWER', 'FENCE', 'ROCK', 'LEDGE', 'LEDGE_E', 'LEDGE_W', 'PAVE', 'BRIDGE',
  'STAIRS', 'ASH', 'PINE', 'BUSH', 'SNOW', 'DARKTALL', 'CUT', 'SMASH', 'BOULDER', 'CLIFF', 'WHIRL', 'CAVEWALL'];
const GROTTE = ['CAVE', 'CAVEWALL', 'WATER', 'SMASH', 'BOULDER', 'STAIRS', 'BRIDGE', 'SAND', 'PATH'];
function typesPermis(m) {
  const s = new Set(m.t);
  for (const k of m.outdoor ? DEHORS : GROTTE) s.add(T[k]);
  for (const p of PALETTE) if (p.fixe) s.add(p.t);
  return PALETTE.filter((p) => s.has(p.t));
}
const KEEP_C = 14, SUR_C = 16;   // distance à la couleur d'origine sous laquelle rien ne change ; distance d'une couleur « franche »

/** l'image a-t-elle perdu en qualité (JPEG…) ? Les pixels restés à leur couleur d'origine n'y ont plus une couleur unie
 *  par type de case (un décalage de couleur uniforme, lui, ne compte pas) */
function abime(img, n, refRGB) {
  const groupes = new Map(); let proches = 0;
  for (let i = 0; i < n; i += 3) {
    const o = i * 4; if (img.d[o + 3] < 128) continue;
    const c = refRGB(i); if (dist(img.d[o], img.d[o + 1], img.d[o + 2], ...c) >= KEEP_C) continue;
    proches++; const k = c.join(','), v = img.d[o] + ',' + img.d[o + 1] + ',' + img.d[o + 2];
    if (!groupes.has(k)) groupes.set(k, new Map()); const g = groupes.get(k); g.set(v, (g.get(v) || 0) + 1);
  }
  let unis = 0; for (const g of groupes.values()) unis += Math.max(...g.values());
  return proches > 0 && unis / proches < 0.98;
}
/** la couleur p s'explique-t-elle mieux par un mélange de deux couleurs de V que par la couleur c ? */
function melange(p, V, c, marge = 0) {
  const dc = dist(...p, ...c) - marge;
  for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) {
    const A = V[a], B = V[b], AB = [0, 1, 2].map((k) => B[k] - A[k]), l2 = AB.reduce((q, v) => q + v * v, 0) || 1;
    const t = Math.max(0, Math.min(1, AB.reduce((q, v, k) => q + v * (p[k] - A[k]), 0) / l2)), M = A.map((v, k) => v + AB[k] * t);
    if (dist(...p, ...M) < dc) return t < 0.5 ? a : b;
  }
  return -1;
}
const voisins8 = (m, i, f) => { const x = i % m.w, y = (i / m.w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if ((dx || dy) && a >= 0 && b >= 0 && a < m.w && b < m.h) f(b * m.w + a, dx, dy); } };

/** quel type de case l'image donne à chaque case ; base : types de départ ; ref8 : l'image ×8 d'origine (grille, noms…) */
export function lireSchema(img, m, base, ref8 = null) {
  const s = echelleDe(img, m), perm = typesPermis(m), n = m.w * m.h;
  const proche = (r, g, b) => { let best = null, bd = 1e9; for (const p of perm) { const d = dist(r, g, b, ...p.rgb); if (d < bd) { bd = d; best = p; } } return [best.t, bd]; };
  const couleur = (t) => PAR_TYPE.get(t).rgb;
  const out = Uint8Array.from(base);
  if (s === 1) {
    // 1 pixel = 1 case : franche → son type ; mélangée (bord de pinceau, JPEG) → le type voisin franc le plus proche
    const cls = new Int16Array(n).fill(-1), sur = new Uint8Array(n), raw = [];
    for (let i = 0; i < n; i++) {
      const o = i * 4, [r, g, b, a] = [img.d[o], img.d[o + 1], img.d[o + 2], img.d[o + 3]];
      raw.push([r, g, b]);
      if (a < 128 || dist(r, g, b, ...couleur(base[i])) < KEEP_C) { cls[i] = base[i]; sur[i] = 1; continue; }
      const [t, d] = proche(r, g, b); if (d < SUR_C) { cls[i] = t; sur[i] = 1; }
    }
    for (let i = 0; i < n; i++) {
      if (sur[i]) { out[i] = cls[i]; continue; }
      const x = i % m.w, y = (i / m.w) | 0, cands = new Set([base[i]]);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, b = y + dy; if ((dx || dy) && a >= 0 && b >= 0 && a < m.w && b < m.h && sur[b * m.w + a]) cands.add(cls[b * m.w + a]); }
      let best = base[i], bd = 1e9; for (const t of cands) { const d = dist(...raw[i], ...couleur(t)); if (d < bd) { bd = d; best = t; } }
      out[i] = best;
    }
    if (!abime(img, n, (i) => couleur(base[i]))) {
      // image sans perte : un pixel nouveau isolé dont la couleur est un mélange de deux voisins (halo d'anticrénelage)
      // est rendu à l'un d'eux
      for (let i = 0; i < n; i++) {
        if (out[i] === base[i]) continue;
        const V = new Set([base[i]]); let pareil = 0;
        voisins8(m, i, (j) => { if (out[j] === out[i]) pareil++; else V.add(out[j]); });
        if (pareil) continue;
        const L = [...V], k = melange(raw[i], L.map(couleur), couleur(out[i])); if (k >= 0) out[i] = L[k];
      }
      return { types: out, echelle: 1, abime: false };
    }
    // image abîmée (JPEG) : à 1 pixel par case, les couleurs y sont moyennées sur 2 × 2 cases et des cases entières
    // changent de couleur (essayé : des centaines de cases fausses) ; on refuse plutôt que d'abîmer la carte
    throw new Error('ce schéma 1 pixel = 1 case a perdu ses couleurs exactes (JPEG ?) : renvoie-le en PNG, ou renvoie la version ×8 (même en JPEG)');
  }
  // image agrandie : chaque bloc de s × s pixels vote ; un pixel resté comme à l'origine vote pour la case d'origine.
  // Version ×8 : les pixels de la grille, des écritures et des repères (et deux pixels autour, que le JPEG brouille)
  // ne votent pas, sauf s'il ne reste presque rien du bloc
  const ref = s === ECHELLE && ref8 && ref8.w === img.w ? ref8 : null;
  let sale = null;
  if (ref) {
    const W = img.w, H = img.h; sale = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = couleur(base[((y / s) | 0) * m.w + ((x / s) | 0)]), o = (y * W + x) * 3;
      if (ref.d[o] !== c[0] || ref.d[o + 1] !== c[1] || ref.d[o + 2] !== c[2]) sale[y * W + x] = 1;
    }
    const t = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -2; d <= 2 && !v; d++) { const a = x + d; if (a >= 0 && a < W && sale[y * W + a]) v = 1; } t[y * W + x] = v; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -2; d <= 2 && !v; d++) { const b = y + d; if (b >= 0 && b < H && t[b * W + x]) v = 1; } sale[y * W + x] = v; }
    // le pourtour de chaque bloc se mélange aux cases voisines (sous-échantillonnage des couleurs du JPEG) : il ne vote pas
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x % s === 0 || y % s === 0 || x % s === s - 1 || y % s === s - 1) sale[y * W + x] = 1;
  }
  const inner = (cx, cy, f) => { for (let y = cy * s; y < (cy + 1) * s; y++) for (let x = cx * s; x < (cx + 1) * s; x++) f(x, y, (y * img.w + x) * 4); };
  const pareilRef = (x, y, o) => { const rc = ref ? [ref.d[(y * ref.w + x) * 3], ref.d[(y * ref.w + x) * 3 + 1], ref.d[(y * ref.w + x) * 3 + 2]] : null; return rc && dist(img.d[o], img.d[o + 1], img.d[o + 2], ...rc) < KEEP_C; };
  // 1re passe : couleurs posées franchement (presque pures) dans chaque bloc, pour reconnaître ensuite les mélanges
  const pures = new Map();
  for (let cy = 0; cy < m.h; cy++) for (let cx = 0; cx < m.w; cx++) {
    const i = cy * m.w + cx;
    inner(cx, cy, (x, y, o) => {
      if (img.d[o + 3] < 128 || pareilRef(x, y, o)) return;
      const [t, d] = proche(img.d[o], img.d[o + 1], img.d[o + 2]); if (d < 8 && t !== base[i]) { if (!pures.has(i)) pures.set(i, new Set()); pures.get(i).add(t); }
    });
  }
  // la couleur la plus probable d'un pixel : une couleur de la palette, ou le bout le plus proche d'un mélange de deux
  // couleurs voisines (bord adouci du pinceau, JPEG) s'il l'explique nettement mieux
  const choisir = (p, V) => {
    let best = null, bd = 1e9;
    for (const u of V) { const d = dist(...p, ...couleur(u)); if (d < bd) { bd = d; best = u; } }
    const L = [...V], k = melange(p, L.map(couleur), couleur(best), 3);
    return k >= 0 ? L[k] : best;
  };
  for (let cy = 0; cy < m.h; cy++) for (let cx = 0; cx < m.w; cx++) {
    const i = cy * m.w + cx;
    let propres = s * s;
    if (sale) { propres = 0; inner(cx, cy, (x, y) => { if (!sale[y * img.w + x]) propres++; }); }
    // bloc presque tout couvert d'écritures : il ne change que repeint presque en entier d'une couleur franche
    if (sale && propres < Math.max(4, (s * s) >> 3)) {
      const v = new Map();
      inner(cx, cy, (x, y, o) => {
        if (img.d[o + 3] < 128 || pareilRef(x, y, o)) return;
        const [t, d] = proche(img.d[o], img.d[o + 1], img.d[o + 2]); if (d < SUR_C) v.set(t, (v.get(t) || 0) + 1);
      });
      for (const [t, c] of v) if (t !== base[i] && c >= 0.75 * s * s) out[i] = t;
      continue;
    }
    const V = new Set([base[i]]);
    for (let b = cy - 1; b <= cy + 1; b++) for (let a = cx - 1; a <= cx + 1; a++) if (m.in(a, b)) { for (const t of pures.get(b * m.w + a) || []) V.add(t); if (a === cx || b === cy) V.add(base[b * m.w + a]); }
    const votes = new Map(), vote = (t) => votes.set(t, (votes.get(t) || 0) + 1), nets = new Map();
    inner(cx, cy, (x, y, o) => {
      if (sale && sale[y * img.w + x]) return;
      const p = [img.d[o], img.d[o + 1], img.d[o + 2]];
      if (img.d[o + 3] < 128 || pareilRef(x, y, o) || dist(...p, ...couleur(base[i])) < KEEP_C) { vote(base[i]); return; }
      const [t, d] = proche(...p);
      const c = choisir(p, d < SUR_C ? new Set([...V, t]) : V); vote(c);
      if (c === t && d < 10) nets.set(t, (nets.get(t) || 0) + 1);
    });
    // la case change si une autre couleur a plus de la moitié des voix, dont au moins un quart de pixels nets (une couleur
    // vraiment posée, pas le halo d'une écriture ou d'un bord passé au JPEG)
    let tot = 0; for (const v of votes.values()) tot += v;
    for (const [t, v] of votes) if (t !== base[i] && v * 2 > tot && (nets.get(t) || 0) * 4 >= Math.max(4, tot)) out[i] = t;
  }
  return { types: out, echelle: s };
}

/* ---------------------------------------------------------------- lecture des hauteurs ------------------------------- */
const RAVIN = -1;
/** hauteur que l'image donne à chaque case (RAVIN pour un ravin) ; base : hauteurs de départ ({ h, rav }) */
export function lireHauteurs(img, m, base) {
  const s = echelleDe(img, m), n = m.w * m.h, out = new Int16Array(n);
  const ref = (i) => grisDe(base.h[i], base.rav[i]), depart = (i) => (base.rav[i] ? RAVIN : base.h[i]);
  const gDe = (h) => (h === RAVIN ? grisDe(0, true) : grisDe(h));
  // une image en couleurs n'est pas une carte des hauteurs (la version ×8 colorée, ou la normal map)
  let couleur = 0, vus = 0;
  for (let k = 0; k < img.w * img.h; k += 7) { const o = k * 4; if (img.d[o + 3] < 128) continue; vus++; if (Math.max(img.d[o], img.d[o + 1], img.d[o + 2]) - Math.min(img.d[o], img.d[o + 1], img.d[o + 2]) > 40) couleur++; }
  if (vus && couleur / vus > 0.2) throw new Error('la carte des hauteurs doit être en gris (<carte>_hauteurs.png) : la version ×8 colorée et la normal map ne se relisent pas');
  const lire = (o, i) => {
    if (img.d[o + 3] < 128) return [depart(i), true, ref(i), 0];
    const g = (img.d[o] + img.d[o + 1] + img.d[o + 2]) / 3;
    if (Math.abs(g - ref(i)) < 10) return [depart(i), true, g, 0];
    const [h, e] = hauteurDe(g); return [h === 'ravin' ? RAVIN : h, e <= 4, g, e];
  };
  if (s === 1) {
    const val = new Int16Array(n), sur = new Uint8Array(n), gris = new Float32Array(n), ecart = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [h, ok, g, e] = lire(i * 4, i); val[i] = h; sur[i] = ok ? 1 : 0; gris[i] = g; ecart[i] = e; }
    for (let i = 0; i < n; i++) {
      if (sur[i]) { out[i] = val[i]; continue; }
      const x = i % m.w, y = (i / m.w) | 0, cands = new Set([depart(i)]);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, b = y + dy; if ((dx || dy) && a >= 0 && b >= 0 && a < m.w && b < m.h && sur[b * m.w + a]) cands.add(val[b * m.w + a]); }
      let best = depart(i), bd = 1e9; for (const h of cands) { const d = Math.abs(gris[i] - gDe(h)); if (d < bd) { bd = d; best = h; } }
      out[i] = best;
    }
    const perte = abime(img, n, (i) => { const g = ref(i); return [g, g, g]; });
    if (perte) {
      // JPEG : un changement n'est sûr que s'il tombe juste sur un palier qu'aucune case voisine n'avait (sinon c'est
      // peut-être l'écho d'un bord) ; les autres ne tiennent que collés à un changement sûr
      const ok = new Uint8Array(n), q = [];
      for (let i = 0; i < n; i++) {
        if (out[i] === depart(i) || !sur[i]) continue;
        let lo = depart(i), hi = depart(i); voisins8(m, i, (j) => { lo = Math.min(lo, depart(j)); hi = Math.max(hi, depart(j)); });
        if (out[i] >= lo && out[i] <= hi) continue;
        ok[i] = 1; q.push(i);
      }
      while (q.length) { const i = q.pop(); voisins8(m, i, (j) => { if (!ok[j] && out[j] === out[i] && out[j] !== depart(j)) { ok[j] = 1; q.push(j); } }); }
      for (let i = 0; i < n; i++) if (!ok[i]) out[i] = depart(i);
    }
    // un gris intermédiaire au bord d'un coup de pinceau doux (ou un écho du JPEG) tombe sur un palier : une case changée
    // qui n'a pas au moins trois voisines (sur huit) changées au même niveau prend le niveau voisin le plus proche de son
    // gris (deux passes) ; sur une image sans perte, un gris exact (pinceau dur) est toujours pris tel quel
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      if (out[i] === depart(i) || (!perte && sur[i] && ecart[i] === 0 && out[i] === val[i])) continue;
      const cands = new Set([depart(i)]); let pareil = 0;
      voisins8(m, i, (j) => { const h = out[j]; if (h === depart(j)) return; if (h === out[i]) pareil++; else cands.add(h); });
      if (pareil >= 3) continue;
      let best = depart(i), bd = 1e9; for (const h of cands) { const d = Math.abs(gris[i] - gDe(h)); if (d < bd) { bd = d; best = h; } }
      out[i] = best;
    }
    return { h: out, echelle: 1, abime: perte };
  }
  for (let cy = 0; cy < m.h; cy++) for (let cx = 0; cx < m.w; cx++) {
    const i = cy * m.w + cx, votes = new Map();
    for (let y = cy * s; y < (cy + 1) * s; y++) for (let x = cx * s; x < (cx + 1) * s; x++) { const [h] = lire((y * img.w + x) * 4, i); votes.set(h, (votes.get(h) || 0) + 1); }
    let best = depart(i), bv = votes.get(best) || 0; for (const [h, v] of votes) if (v > bv) { best = h; bv = v; }
    out[i] = best;
  }
  return { h: out, echelle: s };
}

/* ---------------------------------------------------------------- accès ----------------------------------------------- */
const PASSE = (t) => walkable(t) || [T.CUT, T.SMASH, T.WATER, T.BOULDER, T.LEDGE, T.LEDGE_E, T.LEDGE_W].includes(t);
/** composantes de cases reliées (capacités de terrain comprises, rebords pris dans les deux sens), comme reach() du jeu */
function composantes(m) {
  const n = m.w * m.h, lab = new Int32Array(n).fill(-1); let k = 0;
  for (let s = 0; s < n; s++) {
    if (lab[s] >= 0 || !PASSE(m.t[s])) continue;
    lab[s] = k; const q = [s];
    while (q.length) {
      const i = q.pop(), x = i % m.w, y = (i / m.w) | 0;
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (a < 0 || b < 0 || a >= m.w || b >= m.h) continue;
        const j = b * m.w + a; if (lab[j] >= 0 || !PASSE(m.t[j])) continue;
        const dh = Math.abs(m.hg[j] - m.hg[i]);
        if (dh === 0 || ((m.t[i] === T.STAIRS || m.t[j] === T.STAIRS) && dh <= 1)) { lab[j] = k; q.push(j); }
      }
    }
    k++;
  }
  return lab;
}
/** points qui comptent : téléporteurs (portes, entrées), PNJ, objets, panneaux ; chacun lu sur sa case ou ses voisines */
function points(m) {
  const P = [];
  for (const k of m.warps.keys()) { const [x, y] = k.split(',').map(Number); P.push({ x, y, quoi: 'passage vers ' + m.warps.get(k).map }); }
  for (const n of m.npcs) P.push({ x: n.x, y: n.y, quoi: 'PNJ ' + (n.trainer ? `${n.trainer.cls} ${n.trainer.name}` : n.id || n.sprite) });
  for (const it of m.items) P.push({ x: it.x, y: it.y, quoi: 'objet ' + it.item });
  for (const k of m.signs.keys()) { const [x, y] = k.split(',').map(Number); P.push({ x, y, quoi: 'panneau' }); }
  return P;
}
function etiquettesDe(m, lab, p) {
  const i = p.y * m.w + p.x, out = new Set();
  if (m.in(p.x, p.y) && lab[i] >= 0) out.add(lab[i]);
  else for (const [a, b] of [[p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]]) if (m.in(a, b) && lab[b * m.w + a] >= 0) out.add(lab[b * m.w + a]);
  return out;
}

/* ---------------------------------------------------------------- analyse ---------------------------------------------- */
const PROTEGE = new Set([T.BUILD, T.DOOR, T.BRIDGE, T.CAVEDOOR, T.SIGN, T.MAT]);   // comme plateau() de relief.js
const MAX_LISTE = 40;

/**
 * compare le dessin au départ et donne les retouches. m : la carte (dans un monde construit pour l'analyse : elle est
 * modifiée à la fin pour vérifier les accès) ; base : { types, h, rav } de départ ; voulu : { types?, h? } lus.
 * Renvoie { ops, rapport (lignes), compte, problemes }.
 */
export function analyser(m, base, voulu, o = {}) {
  const n = m.w * m.h, W = m.w, R = [], pb = [], refus = [];
  const cle = (x, y) => x + ',' + y;
  const occupe = new Map();
  for (const k of m.warps.keys()) occupe.set(k, 'un passage');
  for (const q of m.npcs) occupe.set(cle(q.x, q.y), 'un PNJ');
  for (const it of m.items) occupe.set(cle(it.x, it.y), 'un objet');
  const T2 = Uint8Array.from(m.t), H2 = Int16Array.from(m.hg), explicite = new Uint8Array(n), hExpl = new Uint8Array(n);
  const ops = [], parType = new Map(), parH = new Map();
  // 1. terrain
  if (voulu.types) for (let i = 0; i < n; i++) {
    const t = voulu.types[i]; if (t === base.types[i]) continue;
    const x = i % W, y = (i / W) | 0, cur = m.t[i];
    if (t === cur) continue;
    if (FIXES.has(cur)) { refus.push([x, y, `case « ${nomType(cur)} » recouverte (dessin : ${nomType(t)})`]); continue; }
    if (FIXES.has(t)) { refus.push([x, y, `« ${nomType(t)} » ne se pose pas par l'image`]); continue; }
    if (occupe.has(cle(x, y)) && !walkable(t)) { refus.push([x, y, `la case porte ${occupe.get(cle(x, y))}, elle ne peut pas devenir « ${nomType(t)} »`]); continue; }
    T2[i] = t; explicite[i] = 1; ops.push(['t', x, y, t]);
    const k = `${nomType(cur)} → ${nomType(t)}`; parType.set(k, (parType.get(k) || 0) + 1);
  }
  // 2. hauteurs (dehors seulement)
  const pentes = m.pentes ? Uint8Array.from(m.pentes) : new Uint8Array(n), Pf = Uint8Array.from(pentes), mont = (i) => !!m.monts && m.monts[i] !== 0;
  let hIgnore = 0;
  if (voulu.h) for (let i = 0; i < n; i++) {
    const h = voulu.h[i], h0 = base.rav[i] ? RAVIN : base.h[i]; if (h === h0) continue;
    const x = i % W, y = (i / W) | 0;
    if (!m.outdoor) { hIgnore++; continue; }
    if (h === RAVIN || base.rav[i] || m.ravins?.[i]) { refus.push([x, y, 'les ravins ne se créent ni ne se comblent par l\'image']); continue; }
    if (h === m.hg[i]) continue;
    H2[i] = h; hExpl[i] = 1;
    const d = h - m.hg[i], k = `${d > 0 ? '+' : ''}${d} étage${Math.abs(d) > 1 ? 's' : ''}`; parH.set(k, (parH.get(k) || 0) + 1);
  }
  if (hIgnore) refus.push([null, null, `le relief d'une grotte suit sa roche (dessine-la sur le schéma) ; sa carte des hauteurs n'est pas relue (${hIgnore} case(s))`]);
  // marque « plateau d'herbe » (talus de pelouse au rendu) des cases dont la hauteur change
  for (let i = 0; i < n; i++) {
    if (!hExpl[i] || mont(i)) continue;
    const x = i % W, y = (i / W) | 0;
    if (H2[i] > 0 && m.hg[i] === 0) {
      let oui = 0, non = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (!m.in(a, b) || (!dx && !dy)) continue; const j = b * W + a; if (m.hg[j] === H2[i]) { if (pentes[j]) oui++; else non++; } }
      Pf[i] = oui || !non ? 1 : 0;
    } else if (H2[i] === 0 && T2[i] !== T.CLIFF) Pf[i] = 0;
  }
  // 3. falaises sous les bords sud rehaussés (comme plateau() : une case de paroi par étage d'écart)
  let parois = 0;
  const touche = (i) => hExpl[i] || explicite[i];
  for (let i = 0; i < n; i++) {
    const x = i % W, y = (i / W) | 0; if (y + 1 >= m.h || T2[i] === T.CLIFF) continue;
    const j = i + W, niv = H2[i], d = niv - H2[j];
    if (d <= 0 || !(hExpl[i] || hExpl[j]) || mont(i) || mont(j)) continue;
    for (let k = 1; k <= d; k++) {
      const yy = y + k, q = yy * W + x; if (yy >= m.h) break;
      const tq = T2[q], hq = niv - k;
      if (PROTEGE.has(tq) || H2[q] >= niv || occupe.has(cle(x, yy))) { if (k === 1 && !PROTEGE.has(tq)) pb.push(`${x},${yy} : sous un bord rehaussé (${niv}) mais porte ${occupe.get(cle(x, yy)) || 'une case aussi haute'} — pas de paroi`); break; }
      if (tq === T.STAIRS) { if (!hExpl[q]) { H2[q] = hq; Pf[q] = Pf[i]; } continue; }
      if (o.sansParois || (explicite[q] && tq !== T.CLIFF)) { pb.push(`${x},${yy} : différence d'étage sous ${x},${y} (${niv} → ${H2[j]}) sans paroi`); break; }
      if (tq === T.CLIFF && H2[q] <= hq) { H2[q] = hq; Pf[q] = Pf[i]; continue; }
      T2[q] = T.CLIFF; H2[q] = hq; Pf[q] = Pf[i]; parois++;
      ops.push(['t', x, yy, T.CLIFF]); hExpl[q] = 1;
    }
  }
  for (let i = 0; i < n; i++) if (H2[i] !== m.hg[i] || Pf[i] !== pentes[i]) {
    const op = ['h', i % W, (i / W) | 0, H2[i]]; if (Pf[i] !== pentes[i]) op.push(Pf[i]); ops.push(op);
  }
  // 4. vérifications : parois orphelines, marches trop hautes, bords sans paroi (près des cases touchées)
  const pres = (i) => { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (m.in(a, b) && (touche(b * W + a) || H2[b * W + a] !== m.hg[b * W + a])) return true; } return false; };
  for (let i = 0; i < n; i++) {
    if (!pres(i)) continue;
    const x = i % W, y = (i / W) | 0;
    if (T2[i] === T.CLIFF && !mont(i) && !(y > 0 && H2[i - W] > H2[i])) pb.push(`${x},${y} : falaise sans plateau plus haut au nord`);
    if (T2[i] === T.STAIRS) for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (m.in(a, b) && walkable(T2[b * W + a]) && Math.abs(H2[b * W + a] - H2[i]) > 1) { pb.push(`${x},${y} : marche trop haute (${H2[i]} → ${H2[b * W + a]} en ${a},${b})`); break; }
    if (y + 1 < m.h && H2[i] > H2[i + W] && !mont(i) && !mont(i + W) && ![T.CLIFF, T.STAIRS].includes(T2[i + W]) && !PROTEGE.has(T2[i + W]) && T2[i] !== T.CLIFF
      && !(m.hg[i] > m.hg[i + W] && m.t[i + W] === T2[i + W])) pb.push(`${x},${y + 1} : bord sud plus bas (${H2[i]} → ${H2[i + W]}) sans paroi`);
  }
  // 5. accès : ce qui était relié doit le rester
  const avant = composantes(m), P = points(m);
  for (const p of P) p.avant = etiquettesDe(m, avant, p);
  applyOps(m, ops, null);
  const apres = composantes(m);
  const groupes = new Map();
  for (const p of P) {
    p.apres = etiquettesDe(m, apres, p);
    if (!p.avant.size) continue;
    const g = [...p.avant][0]; if (!groupes.has(g)) groupes.set(g, []); groupes.get(g).push(p);
  }
  for (const pts of groupes.values()) {
    const parL = new Map();
    for (const p of pts) { const l = p.apres.size ? Math.min(...p.apres) : -1; if (!parL.has(l)) parL.set(l, []); parL.get(l).push(p); }
    if (parL.size < 2) continue;
    const grand = [...parL.entries()].filter(([l]) => l >= 0).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    for (const [l, q] of parL) if (l !== grand) for (const p of q) pb.push(`${p.x},${p.y} : ${p.quoi} ${l < 0 ? 'enfermé (plus aucune case praticable autour)' : 'coupé du reste (accès bloqué)'}`);
  }
  // rapport
  const nt = ops.filter((q) => q[0] === 't').length, nh = ops.filter((q) => q[0] === 'h').length;
  R.push(`Carte ${m.id} (${m.name}) : ${nt} case(s) de terrain${parois ? ` (dont ${parois} paroi(s) de falaise posée(s) sous les bords sud rehaussés)` : ''}, ${nh} retouche(s) de hauteur.`);
  if (parType.size) { R.push('Terrain :'); for (const [k, v] of [...parType].sort((a, b) => b[1] - a[1])) R.push(`  ${String(v).padStart(5)}  ${k}`); }
  if (parH.size) { R.push('Hauteurs (dessinées) :'); for (const [k, v] of [...parH].sort((a, b) => b[1] - a[1])) R.push(`  ${String(v).padStart(5)}  ${k}`); }
  const liste = (titre, l) => { if (!l.length) return; R.push(`${titre} (${l.length}) :`); for (const s of l.slice(0, MAX_LISTE)) R.push('  ' + s); if (l.length > MAX_LISTE) R.push(`  … et ${l.length - MAX_LISTE} de plus`); };
  // cases ignorées, rangées par raison
  const raisons = new Map(); for (const [x, y, r] of refus) { if (!raisons.has(r)) raisons.set(r, []); if (x !== null) raisons.get(r).push(`${x},${y}`); }
  if (refus.length) {
    R.push(`Ignoré (${refus.length}) :`);
    for (const [r, l] of raisons) R.push(`  ${r}${l.length ? ` : ${l.length} case(s) — ${l.slice(0, 12).join('  ')}${l.length > 12 ? ' …' : ''}` : ''}`);
  }
  liste('À vérifier', [...new Set(pb)]);
  if (!ops.length && !refus.length) R.push('Aucun changement.');
  return { ops, rapport: R, refus: refus.map(([x, y, r]) => (x === null ? r : `${x},${y} : ${r}`)), problemes: [...new Set(pb)], compte: { terrain: nt, hauteurs: nh, parois } };
}

/* ---------------------------------------------------------------- retouches.js ------------------------------------------ */
const sansDoublon = (ops) => {
  // une case touchée plusieurs fois : seule la dernière retouche de terrain (ou de hauteur) compte
  const vu = new Set(), out = [];
  for (let i = ops.length - 1; i >= 0; i--) { const q = ops[i]; if (q[0] === 't' || q[0] === 'h') { const k = q[0] + q[1] + ',' + q[2]; if (vu.has(k)) continue; vu.add(k); } out.push(q); }
  return out.reverse();
};
export function ecrireRetouches(id, ops, fichier = FICHIER_RETOUCHES) {
  const src = readFileSync(fichier, 'utf8');
  const a = src.indexOf('export const RETOUCHES = {'), b = src.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new Error('retouches.js : bloc RETOUCHES introuvable');
  if (/\/\/|\/\*/.test(src.slice(a, b))) throw new Error('retouches.js : le bloc RETOUCHES contient des commentaires, ajoute les retouches à la main (JSON ci-dessus)');
  const tout = { ...RETOUCHES }; tout[id] = sansDoublon([...(tout[id] || []), ...ops]);
  const corps = Object.entries(tout).filter(([, l]) => l.length).map(([k, l]) => `  ${JSON.stringify(k)}: [\n${l.map((q) => '    ' + JSON.stringify(q) + ',').join('\n')}\n  ],`).join('\n');
  writeFileSync(fichier, src.slice(0, a) + 'export const RETOUCHES = {\n' + corps + (corps ? '\n' : '') + src.slice(b + 1));
  return src;
}

/* ---------------------------------------------------------------- ligne de commande ------------------------------------- */
function main() {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const drapeau = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
  const appliquer = drapeau('--appliquer'), sansParois = drapeau('--sans-parois'), baseDir = opt('--base'), jsonOut = opt('--json');
  let [id, fSchema, fHaut] = args;
  if (!id || !fSchema) { console.log('usage : node tools/odyssee-schema-import.mjs <carte> <schema.png | -> [hauteurs.png] [--appliquer] [--base <dossier>] [--sans-parois] [--json <fichier>]'); process.exit(2); }
  // fichiers mal rangés : on se fie au nom
  if (fSchema !== '-' && /_hauteurs/.test(basename(fSchema)) && !fHaut) { fHaut = fSchema; fSchema = '-'; }
  for (const f of [fSchema, fHaut]) if (f && f !== '-' && /_normales/.test(basename(f))) { console.error('La normal map est tirée de la carte des hauteurs : elle ne se relit pas. Dessine le relief sur <carte>_hauteurs.png (en gris).'); process.exit(2); }

  const world = buildWorld();
  const m = world.maps[id] || Object.values(world.maps).find((c) => nomFichier(c.id) === id);
  if (!m) { console.error(`carte inconnue : ${id}`); process.exit(2); }
  if (!m.outdoor && !estGrotte(m)) console.warn(`(${m.id} n'est ni le dehors ni une grotte : on essaie quand même)`);
  // départ : l'export d'où partent les dessins, sinon la carte telle qu'elle est
  const H0 = hauteursCarte(m);
  const base = { types: Uint8Array.from(m.t), h: H0.h, rav: H0.rav };
  let ref8 = null;
  if (baseDir) {
    const f = nomFichier(m.id), s1 = join(baseDir, `${f}_schema.png`), h1 = join(baseDir, `${f}_hauteurs.png`), s8 = join(baseDir, `${f}_schema_x8.png`);
    if (existsSync(s1)) base.types = lireSchema(chargerImage(s1), m, base.types).types;
    if (existsSync(h1)) { const h = lireHauteurs(chargerImage(h1), m, base).h; base.h = Int16Array.from(h, (v) => Math.max(0, v)); base.rav = Uint8Array.from(h, (v) => (v === RAVIN ? 1 : 0)); }
    if (existsSync(s8)) { const im = chargerImage(s8); ref8 = { w: im.w, h: im.h, d: Uint8Array.from({ length: im.w * im.h * 3 }, (_, k) => im.d[((k / 3) | 0) * 4 + (k % 3)]) }; }
  }
  const voulu = {};
  if (fSchema && fSchema !== '-') {
    const img = chargerImage(fSchema);
    if (!ref8 && echelleDe(img, m) === ECHELLE) { const ancien = { ...m, t: base.types }; Object.setPrototypeOf(ancien, Object.getPrototypeOf(m)); ref8 = schema8(ancien, world); }
    const r = lireSchema(img, m, base.types, ref8); voulu.types = r.types;
    console.log(`Schéma lu : ${fSchema} (${img.w} × ${img.h}, ${r.echelle === 1 ? '1 pixel = 1 case' : `×${r.echelle}`})`);
  }
  if (fHaut) {
    const img = chargerImage(fHaut), r = lireHauteurs(img, m, base); voulu.h = r.h;
    console.log(`Hauteurs lues : ${fHaut} (${img.w} × ${img.h}, ${r.echelle === 1 ? '1 pixel = 1 case' : `×${r.echelle}`})`);
  }
  const res = analyser(m, base, voulu, { sansParois });
  console.log('\n' + res.rapport.join('\n'));
  const json = JSON.stringify({ [m.id]: res.ops });
  console.log('\nRetouches (à ajouter dans RETOUCHES de odyssee/js/world/retouches.js) :');
  console.log(res.ops.length > 400 ? json.slice(0, 2000) + ` … (${res.ops.length} retouches : voir --json)` : json);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ [m.id]: res.ops }, null, 0)); console.log(`(écrit dans ${jsonOut})`); }
  if (!appliquer) { if (res.ops.length) console.log('\nRien n\'est écrit : relance avec --appliquer pour les ajouter au jeu.'); return; }
  if (!res.ops.length) { console.log('\nRien à appliquer.'); return; }
  const avant = ecrireRetouches(m.id, res.ops);
  console.log(`\n${res.ops.length} retouche(s) ajoutée(s) à odyssee/js/world/retouches.js ; vérification : node tools/test-odyssee.mjs`);
  const t = spawnSync(process.execPath, [join(RACINE, 'tools/test-odyssee.mjs')], { stdio: 'inherit', cwd: RACINE });
  if (t.status !== 0) { writeFileSync(FICHIER_RETOUCHES, avant); console.error('\nLe test échoue : retouches.js est remis comme avant.'); process.exit(1); }
  console.log('\nCarte jouable : retouches gardées.');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error('Erreur : ' + e.message); process.exit(1); }
}
