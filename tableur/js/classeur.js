// Modèle de classeur : feuilles, cellules, noms définis, recalcul.
// Sans DOM. Les coordonnées sont 0-based (r = ligne, c = colonne).
//
// Cellule : { v: valeur calculée ou saisie, f: formule « =… » ou undefined,
//             z: format de nombre (ex. « 0.00% »), s: style { gras, italique, couleur, fond, align } }

import { serialiserProjet, appliquerProjet, nomVBAValide } from './projetvba.js';
import { decalerMfc } from './donnees.js';
import { Evaluateur, ErreurFormule, versNombre, parsePlage, colVersLettres, adresse, decalerFormule, formater, dateVersSerie, lireSpec, remplacerTref } from './formules.js';
import { styleTableau, styleCelluleTableau } from './tableaux.js';

// Applique une transformation au texte d'une formule, hors des chaînes entre guillemets
function horsChaines(f, fn) { return f.split(/("(?:[^"]|"")*")/).map((m, i) => (i % 2 ? m : fn(m))).join(''); }

/** Réglages de feuille (en JSON) gardés dans l'historique d'annulation et la sauvegarde du navigateur. */
export const PROPRIETES_FEUILLE = ['tableaux', 'protection', 'miseEnPage', 'tablesDonnees', 'sparklines', 'solveur', 'plan', 'scenarios', 'espions'];

export class Feuille {
  constructor(nom) {
    this.nom = nom;
    this.cellules = new Map(); // "r,c" → cellule
    this.largeurs = {};        // c → largeur en px
    this.hauteurs = {};        // r → hauteur en px
    this.fusions = [];         // { r1, c1, r2, c2 }
    this.graphiques = [];      // { id, type, plage: 'A1:C5', titre, x, y, w, h }
    this.boutons = [];         // { id, texte, macro, de: { r, c, dx, dy }, a: { r, c, dx, dy } }
    this.images = [];          // { id, src (data URL), de, a, transparentBlanc }
    this.noms = new Map();     // noms définis propres à cette feuille (NOM → { nom, ref })
    this.zone = { r2: -1, c2: -1 };
    this.cachee = false;
    this.codeNom = nom;        // nom de code VBA (Feuil1…), fixé par le classeur
    this.code = '';            // module de code VBA de la feuille
    this.figer = null;         // volets figés { r, c } : lignes 0..r-1 et colonnes 0..c-1 restent à l'écran
    this.mfc = [];             // mise en forme conditionnelle (règles, voir donnees.js)
    this.filtre = null;        // filtre automatique { r1, c1, r2, c2, criteres: { colonne: { visibles: [...], condition } } }
    this.filtrees = new Set(); // lignes masquées par le filtre (recalculées)
    this.validations = [];     // validation des données (règles, voir donnees.js)
    this.tcd = [];             // tableaux croisés dynamiques posés sur cette feuille (voir tcd.js)
    this.tableaux = [];        // tableaux structurés { nom, r1, c1, r2, c2, entete, totaux, style, bandes, colonnes, calculees }
  }
  static cle(r, c) { return r + ',' + c; }
  get(r, c) { return this.cellules.get(Feuille.cle(r, c)); }
  set(r, c, cel) {
    if (cel == null || (cel.v == null && cel.f == null && !cel.s && !cel.z)) {
      this.cellules.delete(Feuille.cle(r, c));
      return;
    }
    this.cellules.set(Feuille.cle(r, c), cel);
    if (r > this.zone.r2) this.zone.r2 = r;
    if (c > this.zone.c2) this.zone.c2 = c;
  }
  recalculerZone() {
    let r2 = -1, c2 = -1;
    for (const k of this.cellules.keys()) {
      const [r, c] = k.split(',').map(Number);
      if (r > r2) r2 = r;
      if (c > c2) c2 = c;
    }
    this.zone = { r2, c2 };
  }
  /** Itère sur les cellules : cb(r, c, cellule). */
  chaque(cb) {
    for (const [k, cel] of this.cellules) {
      const i = k.indexOf(',');
      cb(+k.slice(0, i), +k.slice(i + 1), cel);
    }
  }
}

export class Classeur {
  constructor() {
    this.feuilles = [];
    this.noms = new Map();   // NOM (majuscules) → { nom, ref }
    this.modules = [];       // modules VBA standard : { nom, code } (les modules de feuille sont sur chaque feuille)
    this.codeClasseur = '';  // module ThisWorkbook
    this.vbaBrut = null;     // vbaProject.bin d'origine (Uint8Array) pour le réécrire tel quel
    this.active = 0;
    this.nomFichier = 'Classeur1.xlsx';
    this.evaluateur = new Evaluateur(this);
    this.version = 0;
    this.udf = null;            // nom → fonction(args) pour les fonctions VBA utilisables dans les formules
  }

  // ----- Feuilles -----
  nbFeuilles() { return this.feuilles.length; }
  nomFeuille(i) { return this.feuilles[i] ? this.feuilles[i].nom : null; }
  indexFeuille(nom) {
    const n = String(nom).toLowerCase();
    return this.feuilles.findIndex((f) => f.nom.toLowerCase() === n);
  }
  feuille(x) {
    if (typeof x === 'number') return this.feuilles[x];
    const i = this.indexFeuille(x);
    return i < 0 ? undefined : this.feuilles[i];
  }
  nomLibre(base = 'Feuil') {
    let i = this.feuilles.length + 1;
    while (this.indexFeuille(base + i) >= 0) i++;
    return base + i;
  }
  ajouterFeuille(nom, position) {
    if (!nom) nom = this.nomLibre();
    if (this.indexFeuille(nom) >= 0) throw new Error('Une feuille « ' + nom + ' » existe déjà');
    const f = new Feuille(nom);
    f.codeNom = this.codeNomLibre();
    if (position == null || position >= this.feuilles.length) this.feuilles.push(f);
    else this.feuilles.splice(position, 0, f);
    this.modifie();
    return f;
  }
  supprimerFeuille(i) {
    if (this.feuilles.length <= 1) throw new Error('Un classeur garde au moins une feuille');
    this.feuilles.splice(i, 1);
    if (this.active >= this.feuilles.length) this.active = this.feuilles.length - 1;
    this.modifie();
  }
  renommerFeuille(i, nom) {
    nom = String(nom).trim();
    if (!nom || /[\[\]*?/\\:]/.test(nom) || nom.length > 31) throw new Error('Nom de feuille invalide');
    const j = this.indexFeuille(nom);
    if (j >= 0 && j !== i) throw new Error('Une feuille « ' + nom + ' » existe déjà');
    const ancien = this.feuilles[i].nom;
    this.feuilles[i].nom = nom;
    // Met à jour les formules qui citent l'ancien nom.
    const re = new RegExp("(^|[^\\w'])(?:'" + ancien.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''") + "'|" + ancien.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')!', 'gi');
    const nouveau = /[^\w]/.test(nom) ? "'" + nom.replace(/'/g, "''") + "'!" : nom + '!';
    for (const f of this.feuilles) f.chaque((r, c, cel) => { if (cel.f && re.test(cel.f)) cel.f = cel.f.replace(re, '$1' + nouveau); });
    for (const d of [...this.noms.values(), ...this.feuilles.flatMap((f) => [...f.noms.values()])]) if (re.test(d.ref)) d.ref = d.ref.replace(re, '$1' + nouveau);
    this.modifie();
  }
  deplacerFeuille(de, vers) {
    const [f] = this.feuilles.splice(de, 1);
    this.feuilles.splice(vers, 0, f);
    this.modifie();
  }

  // ----- Projet VBA : un module par feuille, ThisWorkbook, modules standard -----
  /** Tout le code VBA en un texte (avec un en-tête par module) ; l'affecter remplace tout le projet. */
  get macros() { return serialiserProjet(this); }
  set macros(texte) { appliquerProjet(this, texte); }

  /** Liste ordonnée des modules : { cle, genre: 'feuille'|'classeur'|'module', nom, libelle, code, feuille } */
  modulesVBA() {
    const out = this.feuilles.map((f) => ({ cle: 'feuille:' + f.codeNom, genre: 'feuille', nom: f.codeNom, libelle: f.codeNom + ' (' + f.nom + ')', code: f.code || '', feuille: f }));
    out.push({ cle: 'classeur', genre: 'classeur', nom: 'ThisWorkbook', libelle: 'ThisWorkbook', code: this.codeClasseur || '', feuille: null });
    for (const m of this.modules) out.push({ cle: 'module:' + m.nom, genre: 'module', nom: m.nom, libelle: m.nom, code: m.code || '', feuille: null });
    return out;
  }
  moduleVBA(cle) { return this.modulesVBA().find((m) => m.cle.toLowerCase() === String(cle).toLowerCase()) || null; }
  definirCodeModule(cle, code) {
    const m = this.moduleVBA(cle);
    if (!m) throw new Error('Module introuvable : ' + cle);
    if (m.genre === 'feuille') m.feuille.code = code;
    else if (m.genre === 'classeur') this.codeClasseur = code;
    else this.modules.find((x) => x.nom === m.nom).code = code;
    this.version++;
  }
  nomModulePris(nom, sauf = null) {
    const n = String(nom).toLowerCase();
    if (n === 'thisworkbook') return true;
    return this.feuilles.some((f) => f !== sauf && f.codeNom && f.codeNom.toLowerCase() === n) || this.modules.some((m) => m !== sauf && m.nom.toLowerCase() === n);
  }
  /** « Module1 », « Module2 »… ou « Calculs », « Calculs2 »… selon la base donnée. */
  nomModuleLibre(base = 'Module') {
    base = String(base).replace(/\d+$/, '') || 'Module';
    if (base !== 'Module' && !this.nomModulePris(base)) return base;
    let i = base === 'Module' ? 1 : 2;
    while (this.nomModulePris(base + i)) i++;
    return base + i;
  }
  codeNomLibre() {
    let i = 1;
    while (this.nomModulePris('Feuil' + i)) i++;
    return 'Feuil' + i;
  }
  /** Donne le nom de code `nom` à la feuille f (une autre feuille qui l'avait prend l'ancien nom de f). */
  changerCodeNom(f, nom) {
    if (f.codeNom === nom) return;
    const autre = this.feuilles.find((x) => x !== f && x.codeNom.toLowerCase() === String(nom).toLowerCase());
    if (autre) autre.codeNom = f.codeNom;
    else if (this.modules.some((m) => m.nom.toLowerCase() === String(nom).toLowerCase())) throw new Error('Le nom « ' + nom + ' » est déjà pris par un module');
    f.codeNom = nom;
  }
  ajouterModule(nom) {
    nom = nom ? String(nom).trim() : this.nomModuleLibre('Module');
    if (!nomVBAValide(nom)) throw new Error('Nom de module invalide : une lettre, puis des lettres, chiffres ou _ (31 caractères au plus), sans espace');
    if (this.nomModulePris(nom)) throw new Error('Le nom « ' + nom + ' » est déjà pris');
    this.modules.push({ nom, code: '' });
    this.version++;
    return nom;
  }
  renommerModule(ancien, nouveau) {
    nouveau = String(nouveau).trim();
    const m = this.modules.find((x) => x.nom.toLowerCase() === String(ancien).toLowerCase());
    if (!m) throw new Error('Module introuvable : ' + ancien);
    if (!nomVBAValide(nouveau)) throw new Error('Nom de module invalide : une lettre, puis des lettres, chiffres ou _ (31 caractères au plus), sans espace');
    if (this.nomModulePris(nouveau, m)) throw new Error('Le nom « ' + nouveau + ' » est déjà pris');
    m.nom = nouveau;
    this.version++;
    return nouveau;
  }
  supprimerModule(nom) {
    const i = this.modules.findIndex((x) => x.nom.toLowerCase() === String(nom).toLowerCase());
    if (i < 0) throw new Error('Module introuvable : ' + nom);
    this.modules.splice(i, 1);
    this.version++;
  }

  // ----- Tableaux structurés (Ctrl+L) -----
  /** Tableau par son nom → { fi, t } (ou null). */
  tableau(nom) {
    const n = String(nom).toLowerCase();
    for (let fi = 0; fi < this.feuilles.length; fi++) for (const t of this.feuilles[fi].tableaux || []) if (t.nom.toLowerCase() === n) return { fi, t };
    return null;
  }
  /** Tableau qui contient une cellule → { fi, t } (ou null). */
  tableauEn(fi, r, c) {
    const f = this.feuilles[fi];
    const t = f && (f.tableaux || []).find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
    return t ? { fi, t } : null;
  }
  /** Noms des colonnes d'un tableau : textes de sa ligne d'en-têtes. */
  nomsColonnes(fi, t) {
    const f = this.feuilles[fi], out = [];
    for (let c = t.c1; c <= t.c2; c++) {
      const cel = t.entete === false ? null : f.get(t.r1, c);
      let n = cel && cel.v != null && cel.v !== '' ? String(cel.v) : (t.colonnes && t.colonnes[c - t.c1]) || 'Colonne' + (c - t.c1 + 1);
      while (out.some((x) => x.toLowerCase() === n.toLowerCase())) n += '2';
      out.push(n);
    }
    return out;
  }
  nomTableauLibre(base = 'Tableau') {
    let i = 1;
    while (this.tableau(base + i) || this.nom(base + i) !== undefined) i++;
    return base + i;
  }
  /** Transforme une plage en tableau : en-têtes « Colonne1… » posés s'il en manque. */
  creerTableau(fi, p, { entete = true, style = 'TableStyleMedium7', nom } = {}) {
    const f = this.feuilles[fi];
    for (const t of f.tableaux) if (!(p.r2 < t.r1 || p.r1 > t.r2 || p.c2 < t.c1 || p.c1 > t.c2)) throw new Error('La plage chevauche le tableau ' + t.nom);
    let r1 = p.r1, r2 = p.r2;
    if (!entete) {
      // Pas d'en-têtes dans les données : on insère une ligne au-dessus, comme Excel
      if (r1 > 0 && !Array.from({ length: p.c2 - p.c1 + 1 }, (_, k) => f.get(r1 - 1, p.c1 + k)).some((x) => x && x.v != null && x.v !== '')) r1--;
      else { this.insererLignes(fi, r1, 1); r2++; }
    }
    const t = { nom: nom || this.nomTableauLibre(), r1, c1: p.c1, r2: Math.max(r2, r1 + 1), c2: p.c2, entete: true, totaux: false, style, bandes: true, calculees: {} };
    const pris = new Set();
    for (let c = t.c1; c <= t.c2; c++) {
      const cel = f.get(t.r1, c);
      let n = cel && cel.v != null && cel.v !== '' && cel.f == null ? String(cel.v) : 'Colonne' + (c - t.c1 + 1);
      while (pris.has(n.toLowerCase())) n += '2';
      pris.add(n.toLowerCase());
      if (!cel || cel.v !== n || cel.f != null) f.set(t.r1, c, { ...(cel || {}), f: undefined, v: n });
    }
    t.colonnes = this.nomsColonnes(fi, t);
    f.tableaux.push(t);
    this.modifie();
    return t;
  }
  /** Agrandit le tableau si on écrit juste dessous ou juste à droite (comme Excel). Renvoie le tableau agrandi. */
  etendreTableau(fi, r, c) {
    const f = this.feuilles[fi];
    for (const t of f.tableaux || []) {
      if (!t.totaux && r === t.r2 + 1 && c >= t.c1 && c <= t.c2) {
        t.r2++;
        this.remplirCalculees(fi, t, r);
        if (f.filtre && f.filtre.r1 === t.r1 && f.filtre.c1 === t.c1) f.filtre.r2 = t.r2;
        this.modifie();
        return t;
      }
      if (c === t.c2 + 1 && r >= t.r1 && r <= t.r2 && !(f.tableaux || []).some((x) => x !== t && c >= x.c1 && c <= x.c2 && !(t.r2 < x.r1 || t.r1 > x.r2))) {
        t.c2++;
        const h = f.get(t.r1, c);
        if (!h || h.v == null || h.v === '') { const noms = this.nomsColonnes(fi, { ...t, c2: t.c2 - 1 }); let n = 'Colonne' + (t.c2 - t.c1 + 1); while (noms.some((x) => x.toLowerCase() === n.toLowerCase())) n += '2'; f.set(t.r1, c, { ...(h || {}), v: n }); }
        t.colonnes = this.nomsColonnes(fi, t);
        if (f.filtre && f.filtre.r1 === t.r1 && f.filtre.c1 === t.c1) f.filtre.c2 = t.c2;
        this.modifie();
        return t;
      }
    }
    return null;
  }
  /** Colonne calculée : une formule saisie dans une colonne vide (ou déjà calculée) d'un tableau se recopie sur toute la colonne. */
  colonneCalculee(fi, r, c) {
    const x = this.tableauEn(fi, r, c), f = this.feuilles[fi];
    if (!x) return false;
    const t = x.t, d1 = t.r1 + 1, d2 = t.totaux ? t.r2 - 1 : t.r2;
    if (r < d1 || r > d2) return false;
    const cel = f.get(r, c);
    if (!cel || cel.f == null) { if (t.calculees) delete t.calculees[c - t.c1]; return false; }
    const ancienne = t.calculees && t.calculees[c - t.c1];
    for (let k = d1; k <= d2; k++) {
      if (k === r) continue;
      const o = f.get(k, c);
      if (!o || (o.v == null && o.f == null)) continue;
      if (o.f != null && ancienne && o.f === decalerFormule(ancienne, k - d1, 0)) continue;
      return false; // la colonne contient déjà d'autres données
    }
    const base = decalerFormule(cel.f, d1 - r, 0);
    t.calculees = { ...(t.calculees || {}), [c - t.c1]: base };
    for (let k = d1; k <= d2; k++) if (k !== r) { const o = f.get(k, c) || {}; f.set(k, c, { s: o.s, z: o.z || cel.z, f: decalerFormule(base, k - d1, 0) }); }
    this.modifie();
    return true;
  }
  remplirCalculees(fi, t, r) {
    const f = this.feuilles[fi];
    for (const [k, base] of Object.entries(t.calculees || {})) {
      const c = t.c1 + +k, o = f.get(r, c);
      if (!o || (o.v == null && o.f == null)) { const dessus = f.get(r - 1, c) || {}; f.set(r, c, { s: o && o.s, z: dessus.z, f: decalerFormule(base, r - t.r1 - 1, 0) }); }
    }
  }
  /** Ligne de total : ajoutée sous les données (SOUS.TOTAL de la dernière colonne de nombres) ou retirée. */
  ligneTotal(fi, t, oui) {
    const f = this.feuilles[fi];
    if (!!t.totaux === !!oui) return;
    if (oui) {
      const r = t.r2 + 1;
      if (Array.from({ length: t.c2 - t.c1 + 1 }, (_, k) => f.get(r, t.c1 + k)).some((x) => x && (x.v != null || x.f != null))) this.insererLignes(fi, r, 1);
      t.r2 = r; t.totaux = true;
      const noms = this.nomsColonnes(fi, t);
      let cible = -1;
      for (let c = t.c2; c > t.c1 && cible < 0; c--) for (let k = t.r1 + 1; k < r; k++) { if (typeof this.valeur(fi, k, c) === 'number') { cible = c; break; } }
      f.set(r, t.c1, { v: 'Total', s: { gras: true } });
      if (cible >= 0) f.set(r, cible, { f: '=SOUS.TOTAL(109;[' + noms[cible - t.c1].replace(/([\[\]#'])/g, "'$1") + '])', s: { gras: true }, z: (f.get(r - 1, cible) || {}).z });
    } else {
      for (let c = t.c1; c <= t.c2; c++) f.set(t.r2, c, null);
      t.r2--; t.totaux = false;
    }
    f.recalculerZone();
    this.modifie();
  }
  /** Renomme un tableau et met à jour les formules qui le citent. */
  renommerTableau(ancien, nouveau) {
    nouveau = String(nouveau).trim();
    if (!/^[A-Za-z_\u00C0-\u017F][\w.\u00C0-\u017F]*$/.test(nouveau) || parsePlage(nouveau) || /^[A-Za-z]{1,3}\d+$/.test(nouveau)) throw new Error('Nom de tableau invalide (une lettre, puis lettres, chiffres, _ ou .)');
    const x = this.tableau(ancien);
    if (!x) throw new Error('Tableau introuvable');
    const autre = this.tableau(nouveau);
    if ((autre && autre.t !== x.t) || this.nom(nouveau) !== undefined) throw new Error('Le nom « ' + nouveau + ' » est déjà pris');
    const re = new RegExp('(^|[^\\w.])' + x.t.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\[|[^\\w.(]|$)', 'gi');
    for (const f of this.feuilles) f.chaque((r, c, cel) => { if (cel.f) cel.f = horsChaines(cel.f, (m) => m.replace(re, '$1' + nouveau)); });
    x.t.nom = nouveau;
    this.modifie();
  }
  /** Quand l'en-tête d'une colonne change, les références structurées qui la citent suivent. */
  renommerColonne(fi, t, ancien, nouveau) {
    if (!ancien || !nouveau || ancien === nouveau) return;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = esc(ancien.replace(/([\[\]#'])/g, "'$1"));
    const re = new RegExp('(\\[@?)' + a + '(\\])', 'gi');
    const reNom = new RegExp('(^|[^\\w.])' + esc(t.nom) + '\\[', 'i');
    const fv = this.feuilles[fi];
    for (const [k, f] of this.feuilles.entries()) f.chaque((r, c, cel) => {
      if (!cel.f || !cel.f.includes('[')) return;
      const dedans = k === fi && r >= t.r1 && r <= t.r2 && c >= t.c1 && c <= t.c2;
      if (!dedans && !reNom.test(cel.f)) return;
      cel.f = cel.f.replace(re, '$1' + nouveau.replace(/([\[\]#'])/g, "'$1") + '$2');
      cel.f = cel.f.replace(/\[@\[([^\[\]\s#'@,;:]+)\]\]/g, '[@$1]');
    });
    void fv;
  }
  supprimerTableau(fi, t, { garderFormat = true } = {}) {
    const f = this.feuilles[fi];
    if (garderFormat) {
      // Convertir en plage : le style du tableau devient la mise en forme des cellules ; les références deviennent A1
      const st = styleTableau(t.style);
      for (let r = t.r1; r <= t.r2; r++) for (let c = t.c1; c <= t.c2; c++) { const x = styleCelluleTableau(t, r, c, st); if (x) this.style(fi, r, c, x); }
    }
    const nom = t.nom, d1 = t.r1 + 1, d2 = t.totaux ? t.r2 - 1 : t.r2, noms = this.nomsColonnes(fi, t);
    const plageA1 = (r1, c1, r2, c2) => adresse(r1, c1, true, true) + (r1 === r2 && c1 === c2 ? '' : ':' + adresse(r2, c2, true, true));
    for (const [k, fe] of this.feuilles.entries()) fe.chaque((r, c, cel) => {
      if (!cel.f || !cel.f.includes('[')) return;
      try {
        cel.f = remplacerTref(cel.f, (table, spec) => {
          if (table ? table.toLowerCase() !== nom.toLowerCase() : !(k === fi && r >= t.r1 && r <= t.r2 && c >= t.c1 && c <= t.c2)) return null;
          const o = lireSpec(spec);
          let c1 = t.c1, c2 = t.c2;
          const idx = (n) => t.c1 + noms.findIndex((x) => x.toLowerCase() === n.toLowerCase());
          if (o.col1 != null) { c1 = idx(o.col1); c2 = o.col2 != null ? idx(o.col2) : c1; }
          if (o.zones.includes('ligne')) return c1 === c2 ? adresse(r, c1) : adresse(r, c1) + ':' + adresse(r, c2);
          let r1 = Infinity, r2 = -Infinity;
          for (const z of o.zones) { const [a, b] = z === 'tout' ? [t.r1, t.r2] : z === 'entetes' ? [t.r1, t.r1] : z === 'totaux' ? [t.r2, t.r2] : [d1, d2]; r1 = Math.min(r1, a); r2 = Math.max(r2, b); }
          const pref = k === fi ? '' : (/^[A-Za-z_][\w.]*$/.test(f.nom) ? f.nom : "'" + f.nom.replace(/'/g, "''") + "'") + '!';
          return pref + plageA1(r1, c1, r2, c2);
        });
      } catch { /* formule illisible : laissée telle quelle */ }
    });
    f.tableaux = f.tableaux.filter((x) => x !== t);
    this.modifie();
  }

  // ----- Cellules -----
  cellule(f, r, c) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    return feuille ? feuille.get(r, c) : undefined;
  }
  zoneUtilisee(f) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    return feuille ? feuille.zone : { r2: -1, c2: -1 };
  }
  /** Référence d'un nom défini : d'abord ceux de la feuille (fi), puis ceux du classeur. */
  nom(n, fi) {
    const k = String(n).toUpperCase();
    const f = typeof fi === 'number' ? this.feuilles[fi] : null;
    const d = (f && f.noms.get(k)) || this.noms.get(k);
    return d ? d.ref : undefined;
  }
  definirNom(nom, ref, fi = null) {
    nom = String(nom).trim();
    if (!/^[A-Za-z_\\][\w.]*$/.test(nom) || parsePlage(nom)) throw new Error('Nom invalide');
    const cible = fi === null || fi === undefined ? this.noms : this.feuilles[fi].noms;
    cible.set(nom.toUpperCase(), { nom, ref: String(ref).replace(/^=/, '') });
    this.modifie();
  }
  supprimerNom(nom, fi = null) { (fi === null || fi === undefined ? this.noms : this.feuilles[fi].noms).delete(String(nom).toUpperCase()); this.modifie(); }

  /** Oublie les valeurs enregistrées dans le fichier : tout est recalculé (Ctrl+Alt+F9). */
  abandonnerCaches(fi = null) {
    for (const [i, f] of this.feuilles.entries()) if (fi === null || fi === i) f.chaque((r, c, cel) => { delete cel.cache; });
    this.modifie();
  }

  /** Valeur calculée d'une cellule. */
  valeur(f, r, c) {
    const i = typeof f === 'number' ? f : this.feuilles.indexOf(f);
    return this.evaluateur.valeur(i, r, c);
  }

  /** Texte affiché d'une cellule (valeur formatée). */
  texte(f, r, c) {
    const cel = this.cellule(f, r, c);
    if (!cel || (cel.v == null && cel.f == null)) {
      // cellule vide, mais peut-être couverte par le débordement d'une formule
      const i = typeof f === 'number' ? f : this.feuilles.indexOf(f);
      if (!this.evaluateur.zoneDe?.(i, r, c)) return '';
      return formater(this.valeur(f, r, c), cel?.z);
    }
    return formater(this.valeur(f, r, c), cel.z);
  }

  /** Ce qu'on voit dans la barre de formule : la formule ou la valeur saisie. */
  saisie(f, r, c) {
    const cel = this.cellule(f, r, c);
    if (!cel) return '';
    if (cel.f != null) return cel.f;
    const v = cel.v;
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    if (typeof v === 'number' && cel.z && /[dmyj]/i.test(cel.z) && !/[0#]/.test(cel.z)) return formater(v, cel.z);
    if (v instanceof ErreurFormule) return v.code;
    return String(v);
  }

  /**
   * Saisie d'un texte dans une cellule comme le ferait l'utilisateur :
   * « =A1+1 » → formule ; « 12,5 » / « 12.5 » → nombre ; « 10% » → 0,1 avec format ;
   * « VRAI » → booléen ; « 12/03/2024 » → date ; sinon texte. « ' » force le texte.
   */
  saisir(f, r, c, texte) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    const ancien = feuille.get(r, c) || {};
    const cel = { s: ancien.s, z: ancien.z };
    const t = texte == null ? '' : String(texte);
    // Une ancienne formule matricielle remplacée : les valeurs gardées dans sa plage disparaissent avec elle
    if (ancien.f != null) { const zone = this.evaluateur.debords.get((typeof f === 'number' ? f : this.feuilles.indexOf(f)) + ',' + r + ',' + c); if (zone) for (let i = 0; i < zone.h; i++) for (let j = 0; j < zone.w; j++) { const x = feuille.get(r + i, c + j); if ((i || j) && x && x.couverte) feuille.set(r + i, c + j, null); } }
    if (t === '') {
      if (!cel.s && !cel.z) feuille.set(r, c, null); else feuille.set(r, c, { s: cel.s, z: cel.z });
      this.modifie();
      return;
    }
    if (t.startsWith('=') && t.length > 1) cel.f = t;
    else if (t.startsWith("'")) cel.v = t.slice(1);
    else {
      const u = t.trim();
      let m;
      if (/^(VRAI|TRUE)$/i.test(u)) cel.v = true;
      else if (/^(FAUX|FALSE)$/i.test(u)) cel.v = false;
      else if (/^[-+]?(\d{1,3}([ \u202f]\d{3})*|\d+)([.,]\d+)?$/.test(u) && !/^[-+]?0\d/.test(u)) {
        cel.v = parseFloat(u.replace(/[ \u202f]/g, '').replace(',', '.'));
      } else if (/^[-+]?(\d+[.,]?\d*|[.,]\d+)[eE][-+]?\d+$/.test(u)) cel.v = parseFloat(u.replace(',', '.'));
      else if (/^[-+]?(\d+[.,]?\d*|[.,]\d+)\s?%$/.test(u)) { cel.v = parseFloat(u.replace(',', '.')) / 100; if (!cel.z || !cel.z.includes('%')) cel.z = '0%'; }
      else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(u))) {
        let an = +m[3]; if (an < 100) an += an < 30 ? 2000 : 1900;
        const d = new Date(Date.UTC(an, +m[2] - 1, +m[1]));
        if (d.getUTCMonth() === +m[2] - 1) { cel.v = dateVersSerie(d); if (!cel.z || !/[dmyj]/i.test(cel.z)) cel.z = 'dd/mm/yyyy'; } else cel.v = t;
      } else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(u))) { cel.v = dateVersSerie(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))); if (!cel.z || !/[dmyj]/i.test(cel.z)) cel.z = 'yyyy-mm-dd'; }
      else if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(u))) { cel.v = (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400; if (!cel.z || !/[hs]/i.test(cel.z)) cel.z = m[3] ? 'hh:mm:ss' : 'hh:mm'; }
      else cel.v = t;
    }
    feuille.set(r, c, cel);
    // En-tête de tableau modifié : les formules qui citent la colonne suivent
    const fiS = typeof f === 'number' ? f : this.feuilles.indexOf(f);
    const tb = (feuille.tableaux || []).find((x) => x.entete !== false && x.r1 === r && c >= x.c1 && c <= x.c2);
    if (tb) {
      if (cel.v != null && typeof cel.v !== 'string' && cel.f == null) feuille.set(r, c, { ...cel, v: t.trim() }); // les en-têtes sont des textes
      const avant = tb.colonnes && tb.colonnes[c - tb.c1];
      if (cel.v == null || cel.v === '' || cel.f != null) feuille.set(r, c, { ...cel, f: undefined, v: avant || 'Colonne' + (c - tb.c1 + 1) });
      const apres = this.nomsColonnes(fiS, tb)[c - tb.c1];
      this.renommerColonne(fiS, tb, avant, apres);
      tb.colonnes = this.nomsColonnes(fiS, tb);
    }
    this.modifie();
  }

  /** Pose directement une valeur (depuis VBA, l'import…) sans interprétation du texte. */
  poserValeur(f, r, c, v) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    const ancien = feuille.get(r, c) || {};
    if (typeof v === 'string' && v.startsWith('=')) feuille.set(r, c, { f: v, s: ancien.s, z: ancien.z });
    else feuille.set(r, c, { v: v === '' ? null : v, s: ancien.s, z: ancien.z });
    this.modifie();
  }

  effacer(f, r1, c1, r2, c2, toutStyle = false) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cel = feuille.get(r, c);
      if (!cel) continue;
      if (toutStyle) feuille.set(r, c, null);
      else feuille.set(r, c, { s: cel.s, z: cel.z });
    }
    feuille.recalculerZone();
    this.modifie();
  }

  style(f, r, c, patch) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    const cel = feuille.get(r, c) || {};
    cel.s = { ...(cel.s || {}), ...patch };
    for (const k of Object.keys(cel.s)) if (cel.s[k] == null || cel.s[k] === false) delete cel.s[k];
    if (!Object.keys(cel.s).length) delete cel.s;
    feuille.set(r, c, cel);
    this.modifie();
  }

  format(f, r, c, z) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    const cel = feuille.get(r, c) || {};
    if (z) cel.z = z; else delete cel.z;
    feuille.set(r, c, cel);
    this.modifie();
  }

  /** Copie un rectangle vers une destination, en décalant les références relatives. */
  copier(f, src, dest, couper = false) {
    const feuille = typeof f === 'number' ? this.feuilles[f] : f;
    const dr = dest.r - src.r1, dc = dest.c - src.c1;
    const bloc = [];
    for (let r = src.r1; r <= src.r2; r++) for (let c = src.c1; c <= src.c2; c++) {
      const cel = feuille.get(r, c);
      const copie = cel ? { ...cel, f: couper ? cel.f : decalerFormule(cel.f, dr, dc) } : null;
      if (copie && !couper) delete copie.cache;
      bloc.push({ r: r + dr, c: c + dc, cel: copie });
      if (couper) feuille.set(r, c, null);
    }
    for (const b of bloc) feuille.set(b.r, b.c, b.cel);
    feuille.recalculerZone();
    this.modifie();
  }

  insererLignes(f, r, n = 1) { this.decalerLignesColonnes(f, 'r', r, n); }
  supprimerLignes(f, r, n = 1) { this.decalerLignesColonnes(f, 'r', r, -n); }
  insererColonnes(f, c, n = 1) { this.decalerLignesColonnes(f, 'c', c, n); }
  supprimerColonnes(f, c, n = 1) { this.decalerLignesColonnes(f, 'c', c, -n); }

  decalerLignesColonnes(f, axe, idx, n) {
    const fi = typeof f === 'number' ? f : this.feuilles.indexOf(f);
    const feuille = this.feuilles[fi];
    const nouvelles = new Map();
    feuille.chaque((r, c, cel) => {
      const k = axe === 'r' ? r : c;
      if (n < 0 && k >= idx && k < idx - n) return; // supprimé
      const nk = k >= idx ? k + n : k;
      nouvelles.set(Feuille.cle(axe === 'r' ? nk : r, axe === 'r' ? c : nk), cel);
    });
    feuille.cellules = nouvelles;
    feuille.recalculerZone();
    // Largeurs / hauteurs (lignes et colonnes masquées comprises), filtre, mise en forme conditionnelle
    const tailles = axe === 'r' ? feuille.hauteurs : feuille.largeurs, nt = {};
    for (const [k, v] of Object.entries(tailles)) { const i = +k; if (n < 0 && i >= idx && i < idx - n) continue; nt[i >= idx ? i + n : i] = v; }
    if (axe === 'r') feuille.hauteurs = nt; else feuille.largeurs = nt;
    // Plan (niveaux de groupe, tailles gardées pendant le repli) : suit les lignes / colonnes
    if (feuille.plan) for (const k of axe === 'r' ? ['L', 'H'] : ['C', 'W']) {
      const m = feuille.plan[k]; if (!m) continue; const nm = {};
      for (const [x, v] of Object.entries(m)) { const i = +x; if (n < 0 && i >= idx && i < idx - n) continue; nm[i >= idx ? i + n : i] = v; }
      feuille.plan[k] = nm;
    }
    if (feuille.filtre) {
      const [a, b] = axe === 'r' ? ['r1', 'r2'] : ['c1', 'c2'], flt = feuille.filtre;
      if (n > 0) { if (flt[a] >= idx) flt[a] += n; if (flt[b] >= idx) flt[b] += n; }
      else { const fin = idx - n; if (flt[a] >= idx && flt[b] < fin) feuille.filtre = null; else { if (flt[a] >= fin) flt[a] += n; else if (flt[a] >= idx) flt[a] = idx; if (flt[b] >= fin) flt[b] += n; else if (flt[b] >= idx) flt[b] = idx - 1; } }
      if (feuille.filtre && axe === 'c') { const cr = {}; for (const [k, v] of Object.entries(feuille.filtre.criteres || {})) { const i = +k; if (n < 0 && i >= idx && i < idx - n) continue; cr[i >= idx ? i + n : i] = v; } feuille.filtre.criteres = cr; }
    }
    decalerMfc(feuille, axe, idx, n);
    decalerMfc(feuille, axe, idx, n, 'validations');
    // Tableaux structurés : insérer dedans les agrandit, supprimer dedans les réduit
    for (const t of feuille.tableaux || []) {
      const [a, b] = axe === 'r' ? ['r1', 'r2'] : ['c1', 'c2'];
      if (axe === 'c' && t.calculees) {
        // Colonnes calculées : repérées par leur rang dans le tableau
        const cc = {};
        for (const [k, v] of Object.entries(t.calculees)) { const col = t.c1 + +k; if (n < 0 && col >= idx && col < idx - n) continue; const nc = col >= idx ? col + n : col; const nc1 = t.c1 >= idx ? Math.max(idx, t.c1 + n) : t.c1; cc[nc - nc1] = v; }
        t.calculees = cc;
      }
      if (n > 0) { if (t[a] >= idx) t[a] += n; if (t[b] >= idx) t[b] += n; }
      else { const fin = idx - n; const na = t[a] >= fin ? t[a] + n : t[a] >= idx ? idx : t[a]; const nb = t[b] >= fin ? t[b] + n : t[b] >= idx ? idx - 1 : t[b]; t[a] = na; t[b] = nb; }
      if (axe === 'c') t.colonnes = undefined;
    }
    feuille.tableaux = (feuille.tableaux || []).filter((t) => t.r2 > t.r1 && t.c2 >= t.c1);
    for (const t of feuille.tableaux) if (!t.colonnes) t.colonnes = this.nomsColonnes(fi, t);
    // Graphiques sparkline : leur cellule et leurs données suivent
    if (feuille.sparklines) {
      feuille.sparklines = feuille.sparklines.filter((sp) => {
        const k = axe === 'r' ? 'r' : 'c';
        if (n < 0 && sp[k] >= idx && sp[k] < idx - n) return false;
        if (sp[k] >= idx) sp[k] += n;
        const d = ajusterReferences('=' + sp.donnees, !String(sp.donnees).includes('!'), feuille.nom, this, axe, idx, n).slice(1);
        if (d.includes('#REF!')) return false;
        sp.donnees = d;
        return true;
      });
    }
    // Tableaux croisés posés sur la feuille : leur coin et leur zone suivent
    for (const t of feuille.tcd || []) {
      const k = axe === 'r' ? 'r' : 'c';
      if (t.dest && t.dest[k] >= idx) t.dest[k] = Math.max(idx, t.dest[k] + n);
      if (t.zone) { const [a, b] = axe === 'r' ? ['r1', 'r2'] : ['c1', 'c2']; if (t.zone[a] >= idx) t.zone[a] = Math.max(idx, t.zone[a] + n); if (t.zone[b] >= idx) t.zone[b] = Math.max(t.zone[a], t.zone[b] + n); }
    }
    // Références dans toutes les formules du classeur
    for (let i = 0; i < this.feuilles.length; i++) {
      this.feuilles[i].chaque((r, c, cel) => {
        if (cel.f) cel.f = ajusterReferences(cel.f, i === fi, feuille.nom, this, axe, idx, n);
      });
    }
    for (const d of this.noms.values()) d.ref = ajusterReferences('=' + d.ref, false, feuille.nom, this, axe, idx, n).slice(1);
    for (const d of feuille.noms.values()) d.ref = ajusterReferences('=' + d.ref, true, feuille.nom, this, axe, idx, n).slice(1);
    this.modifie();
  }

  modifie() {
    this.version++;
    this.evaluateur.invalider();
  }

  /** Nettoyage complet. */
  vider() {
    this.feuilles = [];
    this.noms.clear();
    this.modules = [];
    this.codeClasseur = '';
    this.vbaBrut = null;
    this.active = 0;
    this.ajouterFeuille('Feuil1');
  }

  static nouveau() {
    const c = new Classeur();
    c.ajouterFeuille('Feuil1');
    return c;
  }
}

// Ajuste les références d'une formule après insertion/suppression de lignes ou colonnes.
function ajusterReferences(formule, memeFeuille, nomFeuille, classeur, axe, idx, n) {
  const re = /(?<![\w.])((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![\w(])/g;
  // On évite de toucher aux chaînes de caractères.
  const morceaux = formule.split(/("(?:[^"]|"")*"|\[(?:[^[\]]|\[(?:[^[\]]|\[[^[\]]*\])*\])*\])/);
  return morceaux.map((m, i) => {
    if (i % 2 === 1) return m;
    return m.replace(re, (tout, pref, ref) => {
      let concerne = memeFeuille;
      if (pref) {
        const nom = pref.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'");
        concerne = nom.toLowerCase() === nomFeuille.toLowerCase();
      }
      if (!concerne) return tout;
      const parts = ref.split(':');
      const dec = (part, debut) => {
        let m2;
        if ((m2 = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(part))) {
          let c = lettresVersColLocal(m2[2]), r = +m2[4] - 1;
          const k = axe === 'r' ? r : c;
          if (n < 0 && k >= idx && k < idx - n) { if (parts.length === 1) return null; return debut ? (axe === 'r' ? m2[1] + m2[2] + m2[3] + (idx + 1) : m2[1] + colVersLettres(idx) + m2[3] + m2[4]) : (axe === 'r' ? m2[1] + m2[2] + m2[3] + idx : m2[1] + colVersLettres(idx - 1) + m2[3] + m2[4]); }
          if (k >= idx) { if (axe === 'r') r += n; else c += n; }
          return m2[1] + colVersLettres(c) + m2[3] + (r + 1);
        }
        if (axe === 'c' && (m2 = /^(\$?)([A-Za-z]{1,3})$/.exec(part))) {
          let c = lettresVersColLocal(m2[2]);
          if (n < 0 && c >= idx && c < idx - n) return null;
          if (c >= idx) c += n;
          return m2[1] + colVersLettres(c);
        }
        if (axe === 'r' && (m2 = /^(\$?)(\d+)$/.exec(part))) {
          let r = +m2[2] - 1;
          if (n < 0 && r >= idx && r < idx - n) return null;
          if (r >= idx) r += n;
          return m2[1] + (r + 1);
        }
        return part;
      };
      const out = parts.map((p, j) => dec(p, j === 0));
      if (out.some((x) => x === null)) return (pref || '') + '#REF!';
      // Une plage dont les deux bouts se croisent après suppression → #REF!
      return (pref || '') + out.join(':');
    });
  }).join('');
}

function lettresVersColLocal(l) {
  let c = 0;
  for (const ch of l.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}

export { adresse, colVersLettres, versNombre, ErreurFormule };
