// odyssee/moteur/engine/carte.js — format des cartes, façon HeartGold / SoulSilver (sans DOM).
//
//   monde (« matrice »)  : une grille de blocs ; chaque case de la grille dit quel bloc s'y trouve, à quelle zone elle
//                          appartient et à quelle altitude elle est posée. Le dehors est UN monde : on y circule sans
//                          chargement, la zone change seulement (nom, musique, météo, caméra, rencontres).
//   bloc (« land data ») : 32 × 32 cases ; pour chaque case une permission (col : bloquée ou non), un comportement (mb,
//                          voir const.js), une hauteur (h, en niveaux) et un sol (pour le rendu), plus le décor posé.
//   zone (« en-tête »)   : nom, musique, météo, caméra, rencontres, règles (vélo, course, fuite), scripts et événements :
//                          objets (PNJ, dresseurs, objets au sol), panneaux, téléporteurs, déclencheurs au sol.
//
// Les événements d'une zone sont en coordonnées du monde. Un téléporteur renvoie à un téléporteur d'une autre zone par
// son numéro, comme dans HGSS : déplacer une porte ne casse jamais le chemin du retour.

import { BLOC, MB, PROPS } from './const.js';

const N = BLOC * BLOC;

/** un bloc prêt à l'emploi : tableaux typés de 32 × 32 cases */
export function preparerBloc(b) {
  const t = (v, T) => {
    if (v instanceof T) return v;
    const a = new T(N);
    if (Array.isArray(v)) a.set(v.slice(0, N)); else if (typeof v === 'number') a.fill(v);
    return a;
  };
  return {
    id: b.id,
    col: t(b.col ?? 0, Uint8Array),
    mb: t(b.mb ?? 0, Uint8Array),
    h: t(b.h ?? 0, Int8Array),
    sol: t(b.sol ?? 0, Uint16Array),
    decor: b.decor || [],
    batiments: b.batiments || [],
  };
}

const VIDE = preparerBloc({ id: '(vide)', col: 1 });

/** un monde chargé : les blocs, les zones, et tous les événements de ses zones, rangés par case */
export class Monde {
  constructor(donnees, id) {
    const m = donnees.mondes[id];
    if (!m) throw new Error(`monde inconnu : ${id}`);
    this.id = id;
    this.donnees = donnees;
    this.lb = m.largeur; this.hb = m.hauteur;
    this.largeur = m.largeur * BLOC; this.hauteur = m.hauteur * BLOC;
    this.blocs = m.blocs.map((b) => (b ? donnees.blocsPrets[b] : null));
    this.zonesBloc = m.zones;
    this.altitudes = m.altitudes || m.blocs.map(() => 0);
    this.zones = [...new Set(m.zones.filter(Boolean))].map((z) => donnees.zones[z]);
    // événements de toutes les zones du monde, par case
    this.warps = new Map(); this.panneaux = new Map(); this.declencheurs = []; this.objets = [];
    for (const z of this.zones) {
      (z.warps || []).forEach((w, i) => this.warps.set(this.cle(w.x, w.y), { ...w, zone: z.id, indice: i }));
      for (const p of z.panneaux || []) this.panneaux.set(this.cle(p.x, p.y), { ...p, zone: z.id });
      for (const d of z.declencheurs || []) this.declencheurs.push({ l: 1, h: 1, ...d, zone: z.id });
      for (const o of z.objets || []) this.objets.push({ ...o, zone: z.id });
    }
  }
  cle(x, y) { return y * this.largeur + x; }
  dedans(x, y) { return x >= 0 && y >= 0 && x < this.largeur && y < this.hauteur; }
  /** le bloc et la case dans le bloc */
  _b(x, y) {
    if (!this.dedans(x, y)) return [VIDE, 0, 0];
    const bx = (x / BLOC) | 0, by = (y / BLOC) | 0, i = by * this.lb + bx;
    return [this.blocs[i] || VIDE, (y - by * BLOC) * BLOC + (x - bx * BLOC), i];
  }
  /** la case est-elle bloquée par sa permission ? (hors du monde : oui) */
  bloquee(x, y) { const [b, k] = this._b(x, y); return b.col[k] !== 0; }
  mb(x, y) { const [b, k] = this._b(x, y); return b.mb[k]; }
  props(x, y) { return PROPS[this.mb(x, y)]; }
  /** hauteur en niveaux : celle du bloc plus l'altitude de la case de la matrice */
  hauteurCase(x, y) { const [b, k, i] = this._b(x, y); return b.h[k] + (this.altitudes[i] || 0); }
  sol(x, y) { const [b, k] = this._b(x, y); return b.sol[k]; }
  /** zone (en-tête) de la case */
  zone(x, y) {
    if (!this.dedans(x, y)) return null;
    const i = ((y / BLOC) | 0) * this.lb + ((x / BLOC) | 0);
    const id = this.zonesBloc[i];
    return id ? this.donnees.zones[id] : null;
  }
  warp(x, y) { return this.warps.get(this.cle(x, y)) || null; }
  panneau(x, y) { return this.panneaux.get(this.cle(x, y)) || null; }
  declencheursEn(x, y) {
    return this.declencheurs.filter((d) => x >= d.x && y >= d.y && x < d.x + d.l && y < d.y + d.h);
  }
}

/** prépare un paquet de données : blocs en tableaux typés, mondes de chaque zone retrouvés */
export function preparer(donnees) {
  const d = { ...donnees, blocsPrets: {}, zones: {} };
  for (const [id, z] of Object.entries(donnees.zones)) d.zones[id] = { ...z, id };
  for (const [id, b] of Object.entries(donnees.blocs)) d.blocsPrets[id] = preparerBloc({ id, ...b });
  // chaque zone sait dans quel monde elle se trouve (la première case de matrice qui la nomme)
  d.mondeDeZone = {};
  for (const [mid, m] of Object.entries(donnees.mondes))
    for (const z of m.zones) if (z && !d.mondeDeZone[z]) d.mondeDeZone[z] = mid;
  return d;
}

/**
 * Vérifie un paquet de données : blocs et zones qui existent, téléporteurs qui mènent à une case libre et dont la
 * destination existe, objets et panneaux dans leur zone, scripts nommés qui existent. Rend la liste des problèmes.
 * `scriptsConnus(zone)` rend l'ensemble des noms de scripts de la zone (fourni par le moteur de scripts).
 */
export function valider(donnees, scriptsConnus = () => null) {
  const d = donnees.blocsPrets ? donnees : preparer(donnees);
  const err = [];
  const mondes = {};
  for (const [mid, m] of Object.entries(d.mondes)) {
    if (m.blocs.length !== m.largeur * m.hauteur) err.push(`${mid} : ${m.blocs.length} blocs pour ${m.largeur} × ${m.hauteur}`);
    if (m.zones.length !== m.blocs.length) err.push(`${mid} : la grille des zones n'a pas la taille de celle des blocs`);
    m.blocs.forEach((b, i) => { if (b && !d.blocs[b]) err.push(`${mid} : bloc inconnu ${b} (case ${i})`); });
    m.zones.forEach((z, i) => { if (z && !d.zones[z]) err.push(`${mid} : zone inconnue ${z} (case ${i})`); });
    try { mondes[mid] = new Monde(d, mid); } catch (e) { err.push(`${mid} : ${e.message}`); }
  }
  const dansZone = (M, z, x, y) => M.zone(x, y)?.id === z;
  for (const [zid, z] of Object.entries(d.zones)) {
    const mid = d.mondeDeZone[zid];
    if (!mid) { err.push(`zone ${zid} : posée dans aucun monde`); continue; }
    const M = mondes[mid]; if (!M) continue;
    const noms = scriptsConnus(z);
    const script = (qui, nom) => {
      if (!nom) return;
      if (noms && !noms.has(nom)) err.push(`${zid} : ${qui} appelle le script inconnu « ${nom} »`);
    };
    (z.warps || []).forEach((w, i) => {
      const q = `téléporteur ${i} (${w.x},${w.y})`;
      if (!dansZone(M, zid, w.x, w.y)) err.push(`${zid} : ${q} hors de la zone`);
      const cible = d.zones[w.vers];
      if (!cible) { err.push(`${zid} : ${q} vers une zone inconnue ${w.vers}`); return; }
      const wc = (cible.warps || [])[w.n ?? 0];
      if (!wc) { err.push(`${zid} : ${q} vers ${w.vers}#${w.n ?? 0}, qui n'existe pas`); return; }
      const Mc = mondes[d.mondeDeZone[w.vers]];
      if (Mc && Mc.bloquee(wc.x, wc.y)) err.push(`${zid} : ${q} dépose sur une case bloquée de ${w.vers} (${wc.x},${wc.y})`);
      const p = PROPS[M.mb(w.x, w.y)];
      if (!p.warp && !p.tapis) err.push(`${zid} : ${q} sur une case sans porte, escalier ni tapis`);
    });
    for (const o of z.objets || []) {
      const q = `objet ${o.id} (${o.x},${o.y})`;
      if (!dansZone(M, zid, o.x, o.y)) err.push(`${zid} : ${q} hors de la zone`);
      if (M.bloquee(o.x, o.y)) err.push(`${zid} : ${q} sur une case bloquée`);
      script(q, o.script);
      if (o.dresseur) script(q, o.dresseur.script);
    }
    const ids = (z.objets || []).map((o) => o.id);
    const dbl = ids.filter((v, i) => ids.indexOf(v) !== i);
    if (dbl.length) err.push(`${zid} : identifiants d'objets en double : ${[...new Set(dbl)].join(', ')}`);
    for (const p of z.panneaux || []) {
      if (!dansZone(M, zid, p.x, p.y)) err.push(`${zid} : panneau (${p.x},${p.y}) hors de la zone`);
      script(`panneau (${p.x},${p.y})`, p.script);
    }
    for (const t of z.declencheurs || []) script(`déclencheur (${t.x},${t.y})`, t.script);
    for (const t of z.niveau?.image || []) script('script de niveau', t.script);
    script('script de chargement', z.niveau?.chargement);
    script('script de transition', z.niveau?.transition);
  }
  return err;
}

export { MB };
