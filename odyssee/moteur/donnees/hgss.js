// odyssee/moteur/donnees/hgss.js — les vraies cartes de HeartGold / SoulSilver, lues au chargement dans le dépôt public
// de la décompilation (pret/pokeheartgold, commit épinglé) : rien de Nintendo n'est copié ici.
//
// Le dépôt publie, tels qu'ils sont dans le jeu :
//   - files/a/0/6/5 : l'archive « land_data » (676 cartes de 32 × 32 cases : permissions et comportements de chaque case,
//     bâtiments posés, modèle 3D du sol, relief BDHC, sons d'ambiance) ;
//   - files/fielddata/mapmatrix : les matrices (le monde du dehors, 47 × 17 blocs, et une petite matrice par intérieur) ;
//   - files/a/0/4/2 (données de zone : jeu de textures, intérieur ou dehors) et files/a/0/4/4 (jeux de textures NSBTX) ;
//   - src/data/map_headers.h : l'en-tête de chaque carte (matrice, zone, événements, messages, musique, type).
// Ce module ne touche pas au DOM : `lire(chemin)` rend un Uint8Array (fetch dans le navigateur, fichier dans Node).

import { BLOC, MB } from '../engine/const.js';
import { SOLS } from './auteur.js';
import { lireBdhc } from './platine.js';

export const PRET_HG = 'https://raw.githubusercontent.com/pret/pokeheartgold/8946577385ef0e3b1a29f2f56c03db20fd675cb0/';
export const CHEMINS_HG = {
  terrains: 'files/a/0/6/5',
  zones: 'files/a/0/4/2',
  textures: 'files/a/0/4/4',
  matrice: (nom) => `files/fielddata/mapmatrix/map_matrix/${nom}.bin`,
  entetes: 'src/data/map_headers.h',
  cartes: 'include/constants/maps.h',
  evenements: (nom) => `files/fielddata/eventdata/zone_event/${nom}.json`,
  scripts: (nom) => `files/fielddata/script/scr_seq/${nom}.s`,
  dresseurs: 'files/poketool/trainer/trainers.json',
  constantesDresseurs: 'include/constants/trainers.h',
  personnages: 'include/constants/mmodel.h',
  personnage: (i) => `files/data/mmodel/mmodel/mmodel_${String(i).padStart(8, '0')}.NSBTX`,
  nomsObjets: 'files/msgdata/msg/msg_0222.json',
  nomsEspeces: 'files/msgdata/msg/msg_0237.json',
  nomsAttaques: 'files/msgdata/msg/msg_0750.json',
  constantesObjets: 'include/constants/items.h',
  rencontres: 'files/fielddata/encountdata/gs_enc_data.json',
  nouvellePartie: 'files/fielddata/script/scr_seq/scr_seq_0149.s',
  messages: (nom) => `files/msgdata/msg/${nom}.json`,
};

// ——— formats ———
/** archive NARC → liste de sous-tableaux (sans copie) */
export function lireNarcHG(b) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 16;
  const sz = d.getUint32(o + 4, true), n = d.getUint32(o + 8, true), fat = [];
  for (let i = 0; i < n; i++) fat.push([d.getUint32(o + 12 + 8 * i, true), d.getUint32(o + 16 + 8 * i, true)]);
  o += sz; o += d.getUint32(o + 4, true);
  const base = o + 8;
  return fat.map(([s, e]) => b.subarray(base + s, base + e));
}

/** carte de HGSS : en-tête (4 tailles, 0x1234, taille des sons d'ambiance), sons, permissions, bâtiments, modèle, relief */
export function lireTerrainHG(b) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const [nPerm, nBat, nMod, nBdhc] = [0, 4, 8, 12].map((k) => d.getUint32(k, true));
  const o = 20 + d.getUint16(18, true);
  const perm = new Uint16Array(1024);
  for (let i = 0; i < 1024; i++) perm[i] = d.getUint16(o + 2 * i, true);
  const batiments = [];
  for (let i = 0; i < nBat / 48; i++) {
    const q = o + nPerm + 48 * i, f = (k) => d.getInt32(q + 4 + 4 * k, true) / 65536;
    // position en cases depuis le centre de la carte ; y : hauteur absolue en cases
    batiments.push({ id: d.getUint32(q, true), x: f(0), y: f(1), z: f(2) });
  }
  const om = o + nPerm + nBat;
  return { perm, batiments, modele: b.subarray(om, om + nMod), relief: nBdhc ? lireBdhc(b.slice(om + nMod, om + nMod + nBdhc)) : null };
}

/** matrice : largeur, hauteur, [en-têtes de carte par bloc], [hauteurs], numéros de cartes (0xffff : rien) */
export function lireMatriceHG(b) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const l = b[0], h = b[1], aEntetes = b[2], aHauteurs = b[3], n = l * h;
  let p = 5 + b[4];
  const entetes = []; if (aEntetes) { for (let i = 0; i < n; i++) entetes.push(d.getUint16(p + 2 * i, true)); p += 2 * n; }
  const hauteurs = []; if (aHauteurs) { for (let i = 0; i < n; i++) hauteurs.push(b[p + i]); p += n; }
  const cartes = []; for (let i = 0; i < n; i++) cartes.push(d.getUint16(p + 2 * i, true));
  return { l, h, entetes, hauteurs, cartes };
}

/** numéros des cartes (include/constants/maps.h) : MAP_NEW_BARK = 60 … */
export function lireNumerosCartes(texte) {
  const num = {}, nom = {};
  for (const m of texte.matchAll(/#define MAP_(\w+)\s+(\d+)/g)) { num[m[1]] = +m[2]; nom[+m[2]] = m[1]; }
  return { num, nom };
}

/** en-têtes des cartes (src/data/map_headers.h) : { NOM: { matrice, zone, evenements, messages, musique, type, camera, velo, lieu } } */
export function lireEntetesHG(texte) {
  const out = {};
  for (const m of texte.matchAll(/\[MAP_(\w+)\] = \{([^}]*)\}/g)) {
    const c = {};
    for (const k of m[2].matchAll(/\.(\w+) = ([\w-]+)/g)) c[k[1]] = k[2];
    out[m[1]] = {
      matrice: (c.matrixId || '').replace(/^NARC_map_matrix_/, '').replace(/_bin$/, ''),
      zone: +c.areaDataBank,
      evenements: (c.eventsBank || '').replace(/^NARC_zone_event_/, '').replace(/_bin$/, ''),
      messages: c.msgBank, musique: c.dayMusicId, type: c.mapType, camera: +c.cameraType,
      scripts: (c.scriptsBank || '').replace(/_bin$/, ''), niveaux: (c.scriptHeaderBank || '').replace(/_bin$/, ''),
      rencontres: c.wildEncounterBank,
      velo: c.bikeAllowed === 'TRUE', lieu: c.mapsec, meteo: +c.weather,
    };
  }
  return out;
}

// ——— comportements des cases (include/constants/metatile_behavior.h) → ceux du moteur ———
const SOL_ = Object.fromEntries(SOLS.map((n, i) => [n, i]));
/** [comportement du moteur, sol de secours, case franchissable même marquée bloquée] */
export function comportementHG(v) {
  switch (v) {
    case 0x02: return [MB.HERBE, 'hautes_herbes'];
    case 0x03: return [MB.HERBE_DENSE, 'hautes_herbes'];
    case 0x10: case 0x15: case 0x12: case 0x14: return [MB.EAU, 'eau'];
    case 0x13: return [MB.CASCADE, 'eau'];
    case 0x16: case 0x17: case 0x1d: return [MB.FLAQUE, 'eau'];
    case 0x20: return [MB.GLACE, 'glace'];
    case 0x21: return [MB.SABLE, 'sable'];
    case 0xa8: return [MB.NEIGE, 'neige'];
    case 0x38: return [MB.REBORD_DROITE, 'rebord_d', true];
    case 0x39: return [MB.REBORD_GAUCHE, 'rebord_g', true];
    case 0x3a: return [MB.REBORD_HAUT, 'rebord', true];
    case 0x3b: return [MB.REBORD_BAS, 'rebord', true];
    case 0x3c: case 0x3d: case 0x3e: case 0x5e: case 0x5f: case 0x67: return [MB.ESCALIER, 'chemin', true];
    case 0x69: case 0x62: case 0x63: case 0x64: case 0x65: return [MB.PORTE, 'chemin', true];
    case 0x6c: return [MB.TAPIS_DROITE, 'tapis', true];
    case 0x6d: return [MB.TAPIS_GAUCHE, 'tapis', true];
    case 0x6e: return [MB.TAPIS_HAUT, 'tapis', true];
    case 0x6f: return [MB.TAPIS_BAS, 'tapis', true];
    case 0x40: return [MB.TAPIS_ROULANT_DROITE, 'glace'];
    case 0x41: return [MB.TAPIS_ROULANT_GAUCHE, 'glace'];
    case 0x42: return [MB.TAPIS_ROULANT_HAUT, 'glace'];
    case 0x43: return [MB.TAPIS_ROULANT_BAS, 'glace'];
    case 0x08: return [MB.NORMAL, 'grotte'];
    case 0x80: return [MB.COMPTOIR, 'herbe'];   // comptoir (Centres, boutiques) : on parle à qui est derrière
    default: return [MB.NORMAL, 'herbe'];
  }
}

/** une carte du jeu → un bloc du moteur (cases, hauteurs en demi-cases, rendu : son vrai modèle) */
export function blocHG(T, num, zone, interieur) {
  const N = BLOC * BLOC;
  const col = new Array(N), mb = new Array(N), h = new Array(N), sol = new Array(N);
  for (let k = 0; k < N; k++) {
    const v = T.perm[k];
    let [m, s, passe] = comportementHG(v & 0xff);
    // dehors, les entrées (grottes, postes de garde) se prennent en y entrant ; dedans, ce sont des tapis de sortie
    if (!interieur && m >= MB.TAPIS_BAS && m <= MB.TAPIS_DROITE) m = MB.PORTE;
    col[k] = (v & 0x8000) && !passe ? 1 : 0;
    mb[k] = m;
    sol[k] = SOL_[col[k] && s === 'herbe' ? (interieur ? 'mur' : 'herbe') : s];
    const x = k % BLOC, z = (k / BLOC) | 0;
    const ht = T.relief?.hauteur(x + 0.5, z + 0.5);
    h[k] = ht == null ? 0 : Math.round(ht * 2);
  }
  return { col, mb, h, sol, decor: [{ type: 'terrain_hg', carte: num, zone, batiments: T.batiments, interieur }] };
}

/**
 * Le dehors de Johto et de Kanto (matrice 0 : 47 × 17 blocs) en blocs du moteur, aux coordonnées du jeu (le coin
 * nord-ouest de la matrice est la case (0, 0)). `zoneDe(nomCarte)` rend l'identifiant de zone du moteur (ou null).
 */
export function dehorsHG(A, zoneDe) {
  const M = lireMatriceHG(A.matrice0), blocs = {}, noms = [], zones = [];
  for (let cy = 0; cy < M.h; cy++) for (let cx = 0; cx < M.l; cx++) {
    const i = cy * M.l + cx, num = M.cartes[i];
    if (num === 0xffff) { noms.push(null); zones.push(null); continue; }
    const carte = A.nomCarte[M.entetes[i]], e = A.entetes[carte];
    const nom = `hg_${cx}_${cy}`;
    blocs[nom] = blocHG(lireTerrainHG(A.terrains[num]), num, e?.zone ?? 0, false);
    noms.push(nom); zones.push(zoneDe(carte));
  }
  return { blocs, monde: { largeur: M.l, hauteur: M.h, blocs: noms, zones, pentes: true, niv: 0.5 } };
}

/** un intérieur (sa petite matrice) en blocs ; rend { blocs, monde } ou null si la carte manque */
export function interieurHG(A, carte, zone, matrice) {
  const e = A.entetes[carte];
  if (!e || !matrice) return null;
  const M = lireMatriceHG(matrice), blocs = {}, noms = [];
  const interieur = e.type !== 'MAP_TYPE_CITY_TOWN' && e.type !== 'MAP_TYPE_ROUTE';
  for (let i = 0; i < M.l * M.h; i++) {
    const num = M.cartes[i];
    if (num === 0xffff) { noms.push(null); continue; }
    const nom = `hg_${carte.toLowerCase()}_${i}`;
    blocs[nom] = blocHG(lireTerrainHG(A.terrains[num]), num, e.zone, interieur);
    noms.push(nom);
  }
  return { blocs, monde: { largeur: M.l, hauteur: M.h, blocs: noms, zones: noms.map((n) => (n ? zone : null)), pentes: true, niv: 0.5 } };
}

/** charge ce qu'il faut pour construire les cartes : `lire(chemin)` → Uint8Array */
export async function archivesHG(lire) {
  const txt = async (c) => new TextDecoder().decode(await lire(c));
  const [terrains, matrice0, entetes, numeros] = await Promise.all([
    lire(CHEMINS_HG.terrains), lire(CHEMINS_HG.matrice('map_matrix_0000_EVERYWHERE')), txt(CHEMINS_HG.entetes), txt(CHEMINS_HG.cartes),
  ]);
  const { num, nom } = lireNumerosCartes(numeros);
  return { brut: { terrains }, terrains: lireNarcHG(terrains), matrice0, entetes: lireEntetesHG(entetes), numCarte: num, nomCarte: nom };
}
