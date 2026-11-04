// Modèle de classeur : feuilles, cellules, noms définis, recalcul.
// Sans DOM. Les coordonnées sont 0-based (r = ligne, c = colonne).
//
// Cellule : { v: valeur calculée ou saisie, f: formule « =… » ou undefined,
//             z: format de nombre (ex. « 0.00% »), s: style { gras, italique, couleur, fond, align } }

import { serialiserProjet, appliquerProjet, nomVBAValide } from './projetvba.js';
import { decalerMfc } from './donnees.js';
import { Evaluateur, ErreurFormule, versNombre, parsePlage, colVersLettres, adresse, decalerFormule, formater, dateVersSerie } from './formules.js';

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
    if (feuille.filtre) {
      const [a, b] = axe === 'r' ? ['r1', 'r2'] : ['c1', 'c2'], flt = feuille.filtre;
      if (n > 0) { if (flt[a] >= idx) flt[a] += n; if (flt[b] >= idx) flt[b] += n; }
      else { const fin = idx - n; if (flt[a] >= idx && flt[b] < fin) feuille.filtre = null; else { if (flt[a] >= fin) flt[a] += n; else if (flt[a] >= idx) flt[a] = idx; if (flt[b] >= fin) flt[b] += n; else if (flt[b] >= idx) flt[b] = idx - 1; } }
      if (feuille.filtre && axe === 'c') { const cr = {}; for (const [k, v] of Object.entries(feuille.filtre.criteres || {})) { const i = +k; if (n < 0 && i >= idx && i < idx - n) continue; cr[i >= idx ? i + n : i] = v; } feuille.filtre.criteres = cr; }
    }
    decalerMfc(feuille, axe, idx, n);
    decalerMfc(feuille, axe, idx, n, 'validations');
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
  const re = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![\w(])/g;
  // On évite de toucher aux chaînes de caractères.
  const morceaux = formule.split(/("(?:[^"]|"")*")/);
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
