// Moteur de formules du Tableur : analyse, évaluation, bibliothèque de fonctions.
// Sans DOM : utilisable dans le navigateur et dans Node (tools/test-tableur.mjs).
//
// Une formule est une chaîne commençant par « = ». Les fonctions sont acceptées
// sous leur nom anglais (SUM) et français (SOMME) ; les arguments se séparent
// par « , » ou « ; ». Les références : A1, $A$1, A1:B3, A:A, 1:1,
// Feuil1!A1, 'Ma feuille'!A1:B2, et les noms définis.

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export class ErreurFormule extends Error {
  constructor(code, detail) {
    super(code + (detail ? ' ' + detail : ''));
    this.code = code;
    this.detail = detail || '';
  }
}

export const ERR = {
  DIV0: '#DIV/0!',
  VALEUR: '#VALUE!',
  REF: '#REF!',
  NOM: '#NAME?',
  NA: '#N/A',
  NUM: '#NUM!',
  NUL: '#NULL!',
  CYCLE: '#CYCLE!',
  DEBORD: '#SPILL!',   // #PROPAGATION! dans Excel en français : le résultat ne peut pas déborder
};

const err = (code, d) => new ErreurFormule(code, d);
const x0 = (cel) => !!(cel && cel.f != null);
const a1 = (t) => { const m = /^([A-Z]+)(\d+)$/.exec(t); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2] - 1, c - 1]; };
export const estErreur = (v) => v instanceof ErreurFormule;

// ---------------------------------------------------------------------------
// Coordonnées
// ---------------------------------------------------------------------------

export function colVersLettres(c) {
  let s = '';
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export function lettresVersCol(l) {
  let c = 0;
  for (const ch of l.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}

export function adresse(r, c, absR = false, absC = false) {
  return (absC ? '$' : '') + colVersLettres(c) + (absR ? '$' : '') + (r + 1);
}

const RE_A1 = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

/** « B7 » → { r: 6, c: 1 } (ou null si ce n'est pas une adresse). */
export function parseAdresse(s) {
  const m = RE_A1.exec(s.trim());
  if (!m) return null;
  return { r: parseInt(m[4], 10) - 1, c: lettresVersCol(m[2]), absC: !!m[1], absR: !!m[3] };
}

/** « A1:B3 » ou « A1 » → { r1, c1, r2, c2 } (0-based), ou null. */
export function parsePlage(s) {
  const parts = s.split(':');
  if (parts.length === 1) {
    const a = parseAdresse(parts[0]);
    return a ? { r1: a.r, c1: a.c, r2: a.r, c2: a.c } : null;
  }
  if (parts.length !== 2) return null;
  const a = parseAdresse(parts[0]), b = parseAdresse(parts[1]);
  if (!a || !b) return null;
  return {
    r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
  };
}

// ---------------------------------------------------------------------------
// Plage (référence à un rectangle de cellules, évaluée à la demande)
// ---------------------------------------------------------------------------

export class Plage {
  constructor(ctx, feuille, r1, c1, r2, c2) {
    this.ctx = ctx;
    this.feuille = feuille;
    this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2);
    this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2);
  }
  get lignes() { return this.r2 - this.r1 + 1; }
  get colonnes() { return this.c2 - this.c1 + 1; }
  get taille() { return this.lignes * this.colonnes; }
  /** Bornes effectives : les lignes/colonnes entières sont ramenées à la zone utilisée. */
  bornes() {
    const u = this.ctx.zoneUtilisee(this.feuille);
    return {
      r1: this.r1, c1: this.c1,
      r2: Math.min(this.r2, Math.max(u.r2, this.r1)),
      c2: Math.min(this.c2, Math.max(u.c2, this.c1)),
    };
  }
  valeur(r, c) { return this.ctx.valeur(this.feuille, this.r1 + r, this.c1 + c); }
  /** Tableau 2D des valeurs. */
  matrice() {
    const b = this.bornes();
    const m = [];
    for (let r = b.r1; r <= b.r2; r++) {
      const ligne = [];
      for (let c = b.c1; c <= b.c2; c++) ligne.push(this.ctx.valeur(this.feuille, r, c));
      m.push(ligne);
    }
    return m;
  }
  /** Valeurs à plat (ordre ligne par ligne). */
  aplat() { return this.matrice().flat(); }
  /** Une plage d'une seule cellule se comporte comme sa valeur. */
  scalaire() {
    if (this.r1 === this.r2 && this.c1 === this.c2) return this.valeur(0, 0);
    // Intersection implicite avec la ligne / colonne courante.
    const { r, c } = this.ctx.courant;
    if (this.c1 === this.c2 && r >= this.r1 && r <= this.r2) return this.ctx.valeur(this.feuille, r, this.c1);
    if (this.r1 === this.r2 && c >= this.c1 && c <= this.c2) return this.ctx.valeur(this.feuille, this.r1, c);
    throw err(ERR.VALEUR, 'plage utilisée comme valeur');
  }
  decaler(dr, dc, nl, nc) {
    const r1 = this.r1 + dr, c1 = this.c1 + dc;
    if (r1 < 0 || c1 < 0) throw err(ERR.REF);
    const l = nl == null ? this.lignes : nl, k = nc == null ? this.colonnes : nc;
    if (l < 1 || k < 1) throw err(ERR.REF);
    return new Plage(this.ctx, this.feuille, r1, c1, r1 + l - 1, c1 + k - 1);
  }
}

// ---------------------------------------------------------------------------
// Analyse lexicale
// ---------------------------------------------------------------------------

const T = {
  NOMBRE: 'nombre', CHAINE: 'chaine', REF: 'ref', NOM: 'nom', FONCTION: 'fonction', TREF: 'tref',
  OP: 'op', PARO: '(', PARF: ')', SEP: 'sep', ACCO: '{', ACCF: '}', BOOL: 'bool', ERREUR: 'erreur',
};

const RE_REF = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_\u00C0-\u017F][\w.\u00C0-\u017F]*))!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![\w(\[])/;
const RE_ERREUR = /^#(?:DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CYCLE!)/i;

// Fin d'un groupe entre crochets (imbriqués), « ' » échappe le caractère suivant : Tableau1[[#Tout];[Prix '[HT']]]
function finCrochets(src, i) {
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "'") { j++; continue; }
    if (ch === '[') prof++;
    else if (ch === ']' && --prof === 0) return j + 1;
  }
  throw err(ERR.REF, 'crochet manquant');
}

// Mots spéciaux des références structurées, en français et en anglais
const MOTS_TABLEAU = { tout: 'tout', all: 'tout', 'données': 'donnees', donnees: 'donnees', data: 'donnees', 'en-têtes': 'entetes', 'en-tetes': 'entetes', headers: 'entetes',
  totaux: 'totaux', totals: 'totaux', 'cette ligne': 'ligne', 'this row': 'ligne' };
const MOTS_FR = { tout: '#Tout', donnees: '#Données', entetes: '#En-têtes', totaux: '#Totaux', ligne: '#Cette ligne' };
const MOTS_EN = { tout: '#All', donnees: '#Data', entetes: '#Headers', totaux: '#Totals', ligne: '#This Row' };
const desechapper = (s) => s.replace(/'(.)/g, '$1');
const echapperCol = (s) => s.replace(/([\[\]#'])/g, "'$1");

/**
 * Lit la partie entre crochets d'une référence structurée.
 * → { zones: ['donnees'|'tout'|'entetes'|'totaux'|'ligne'], col1, col2 } (col1/col2 : noms de colonnes ou null)
 */
export function lireSpec(spec) {
  let inner = spec.slice(1, -1).trim();
  const out = { zones: [], col1: null, col2: null };
  const element = (x) => {
    x = x.trim();
    if (x.startsWith('#')) { const k = MOTS_TABLEAU[x.slice(1).trim().toLowerCase()]; if (!k) throw err(ERR.REF, x); out.zones.push(k); return; }
    if (out.col1 == null) out.col1 = desechapper(x); else out.col2 = desechapper(x);
  };
  if (inner.startsWith('@')) { out.zones.push('ligne'); inner = inner.slice(1).trim(); if (!inner) return out; if (!inner.startsWith('[')) { out.col1 = desechapper(inner); return out; } }
  if (!inner.startsWith('[')) { if (inner) element(inner); }
  else {
    // Suite de [..] séparés par , ; ou :
    let j = 0;
    while (j < inner.length) {
      const ch = inner[j];
      if (ch === '[') { const fin = finCrochets(inner, j); element(inner.slice(j + 1, fin - 1)); j = fin; }
      else if (ch === '@') { out.zones.push('ligne'); j++; }
      else j++;
    }
  }
  if (!out.zones.length) out.zones.push('donnees');
  return out;
}

/** Réécrit une partie entre crochets dans une langue ('fr' : #Tout, [@Col], « ; » ; 'en' : #All, [#This Row], « , »). */
export function ecrireSpec(spec, sens) {
  let o;
  try { o = lireSpec(spec); } catch { return spec; }
  const mots = sens === 'en' ? MOTS_EN : MOTS_FR, sep = sens === 'en' ? ',' : ';';
  const cols = o.col1 == null ? '' : '[' + echapperCol(o.col1) + ']' + (o.col2 != null ? ':[' + echapperCol(o.col2) + ']' : '');
  const zones = o.zones.filter((z) => !(z === 'donnees' && o.zones.length === 1 && !spec.includes('#')));
  if (sens !== 'en' && zones.length === 1 && zones[0] === 'ligne') return o.col1 == null ? '[@]' : o.col2 == null && !/[\s\[\]#'@,;:]/.test(o.col1) ? '[@' + o.col1 + ']' : '[@' + cols + ']';
  if (!zones.length) return o.col2 == null && o.col1 != null ? '[' + echapperCol(o.col1) + ']' : '[' + cols + ']';
  const parts = zones.map((z) => '[' + mots[z] + ']');
  if (!cols) return parts.length === 1 ? parts[0] : '[' + parts.join(sep) + ']';
  return '[' + parts.join(sep) + sep + cols + ']';
}

export function tokeniser(src, langue) {
  const toks = [];
  let i = 0;
  // En notation française, « ; » sépare les arguments et « , » peut être la virgule décimale.
  // Sans « ; », une virgule qui n'apparaît qu'entre deux chiffres est aussi lue comme décimale (=A1*1,5).
  const sansChaines = src.replace(/"(?:[^"]|"")*"/g, '""');
  // langue : 'en' (formule d'un fichier Excel : « , » sépare toujours) ou 'fr' ; sinon on devine
  const francais = langue === 'en' ? false : langue === 'fr' ? true : sansChaines.includes(';') || (sansChaines.includes(',') && !/[^\d],|,[^\d]/.test(sansChaines.replace(/\{[^}]*\}/g, '')));
  let accolades = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    const reste = src.slice(i);
    let m;
    if (ch === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw err(ERR.VALEUR, 'chaîne non terminée');
        if (src[j] === '"') {
          if (src[j + 1] === '"') { s += '"'; j += 2; continue; }
          break;
        }
        s += src[j++];
      }
      toks.push({ t: T.CHAINE, v: s, pos: i, fin: j + 1 }); i = j + 1; continue;
    }
    if ((m = RE_ERREUR.exec(reste))) {
      toks.push({ t: T.ERREUR, v: m[0].toUpperCase(), pos: i, fin: i + m[0].length }); i += m[0].length; continue;
    }
    if ((m = RE_REF.exec(reste))) {
      const feuille = m[1] != null ? m[1].replace(/''/g, "'") : (m[2] ?? null);
      // « A1# » : toute la plage où déborde le résultat de A1
      const debord = src[i + m[0].length] === '#' && /^\$?[A-Za-z]{1,3}\$?\d+$/.test(m[3]);
      toks.push({ t: T.REF, feuille, v: m[3], debord, pos: i, fin: i + m[0].length + (debord ? 1 : 0) }); i += m[0].length + (debord ? 1 : 0); continue;
    }
    if ((m = (francais && !accolades ? /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?|^[.,]\d+(?:[eE][+-]?\d+)?/ : /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|^\.\d+(?:[eE][+-]?\d+)?/).exec(reste))) {
      toks.push({ t: T.NOMBRE, v: parseFloat(m[0].replace(',', '.')), pos: i, fin: i + m[0].length }); i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_\u00C0-\u017F][\w.\u00C0-\u017F]*/.exec(reste))) {
      const nom = m[0];
      let j = i + nom.length;
      while (src[j] === ' ') j++;
      if (src[j] === '(') {
        toks.push({ t: T.FONCTION, v: nom.toUpperCase(), pos: i, fin: j + 1 }); i = j + 1; continue;
      }
      if (src[i + nom.length] === '[') { // référence structurée : Tableau1[Ventes], Tableau1[[#Tout];[Ventes]]
        const fin = finCrochets(src, i + nom.length);
        toks.push({ t: T.TREF, table: nom, spec: src.slice(i + nom.length, fin), pos: i, fin }); i = fin; continue;
      }
      const up = nom.toUpperCase();
      if (up === 'TRUE' || up === 'VRAI') toks.push({ t: T.BOOL, v: true, pos: i, fin: i + nom.length });
      else if (up === 'FALSE' || up === 'FAUX') toks.push({ t: T.BOOL, v: false, pos: i, fin: i + nom.length });
      else toks.push({ t: T.NOM, v: nom, pos: i, fin: i + nom.length });
      i += nom.length; continue;
    }
    if ((m = /^(<=|>=|<>|[-+*/^&=<>%:@])/.exec(reste))) {
      toks.push({ t: T.OP, v: m[0], pos: i, fin: i + m[0].length }); i += m[0].length; continue;
    }
    if (ch === '[') { const fin = finCrochets(src, i); toks.push({ t: T.TREF, table: null, spec: src.slice(i, fin), pos: i, fin }); i = fin; continue; }
    if (ch === '(') { toks.push({ t: T.PARO, pos: i, fin: i + 1 }); i++; continue; }
    if (ch === ')') { toks.push({ t: T.PARF, pos: i, fin: i + 1 }); i++; continue; }
    if (ch === '{') { accolades++; toks.push({ t: T.ACCO, pos: i, fin: i + 1 }); i++; continue; }
    if (ch === '}') { accolades--; toks.push({ t: T.ACCF, pos: i, fin: i + 1 }); i++; continue; }
    if (ch === ',' || ch === ';') { toks.push({ t: T.SEP, v: ch, pos: i, fin: i + 1 }); i++; continue; }
    throw err(ERR.VALEUR, 'caractère inattendu « ' + ch + ' »');
  }
  return toks;
}

// ---------------------------------------------------------------------------
// Analyse syntaxique → arbre
// ---------------------------------------------------------------------------
// Nœuds : {k:'num',v} {k:'str',v} {k:'bool',v} {k:'err',v} {k:'ref',feuille,plage}
//         {k:'nom',v} {k:'fn',nom,args} {k:'bin',op,a,b} {k:'un',op,a} {k:'pct',a} {k:'tab',lignes}

class Parseur {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  fini() { return this.i >= this.toks.length; }
  attendre(t) {
    const k = this.next();
    if (!k || k.t !== t) throw err(ERR.VALEUR, 'attendu ' + t);
    return k;
  }
  estOp(...ops) { const k = this.peek(); return k && k.t === T.OP && ops.includes(k.v); }

  expression() { return this.comparaison(); }
  comparaison() {
    let a = this.concat();
    while (this.estOp('=', '<>', '<', '>', '<=', '>=')) { const op = this.next().v; a = { k: 'bin', op, a, b: this.concat() }; }
    return a;
  }
  concat() {
    let a = this.additif();
    while (this.estOp('&')) { this.next(); a = { k: 'bin', op: '&', a, b: this.additif() }; }
    return a;
  }
  additif() {
    let a = this.multiplicatif();
    while (this.estOp('+', '-')) { const op = this.next().v; a = { k: 'bin', op, a, b: this.multiplicatif() }; }
    return a;
  }
  multiplicatif() {
    let a = this.puissance();
    while (this.estOp('*', '/')) { const op = this.next().v; a = { k: 'bin', op, a, b: this.puissance() }; }
    return a;
  }
  puissance() {
    let a = this.unaire();
    while (this.estOp('^')) { this.next(); a = { k: 'bin', op: '^', a, b: this.unaire() }; }
    return a;
  }
  unaire() {
    if (this.estOp('-')) { this.next(); return { k: 'un', op: '-', a: this.unaire() }; }
    if (this.estOp('+')) { this.next(); return this.unaire(); }
    if (this.estOp('@')) { this.next(); return { k: 'inter', a: this.unaire() }; } // intersection implicite (=@A1:A9)
    return this.pourcent();
  }
  pourcent() {
    let a = this.plageOp();
    while (this.estOp('%')) { this.next(); a = { k: 'pct', a }; }
    return a;
  }
  // « : » entre deux expressions (INDEX(...):A5, par exemple)
  plageOp() {
    let a = this.primaire();
    while (this.estOp(':')) { this.next(); a = { k: 'bin', op: ':', a, b: this.primaire() }; }
    return a;
  }
  primaire() {
    const k = this.next();
    if (!k) throw err(ERR.VALEUR, 'expression incomplète');
    switch (k.t) {
      case T.NOMBRE: return { k: 'num', v: k.v };
      case T.CHAINE: return { k: 'str', v: k.v };
      case T.BOOL: return { k: 'bool', v: k.v };
      case T.ERREUR: return { k: 'err', v: k.v };
      case T.REF: return { k: 'ref', feuille: k.feuille, plage: k.v, debord: k.debord };
      case T.NOM: return { k: 'nom', v: k.v };
      case T.TREF: return { k: 'tref', table: k.table, spec: k.spec };
      case T.FONCTION: {
        const args = [];
        if (this.peek() && this.peek().t === T.PARF) { this.next(); return { k: 'fn', nom: k.v, args }; }
        for (;;) {
          const p = this.peek();
          if (p && (p.t === T.SEP || p.t === T.PARF)) args.push({ k: 'vide' });
          else args.push(this.expression());
          const s = this.next();
          if (!s) throw err(ERR.VALEUR, 'parenthèse manquante');
          if (s.t === T.PARF) break;
          if (s.t !== T.SEP) throw err(ERR.VALEUR, 'séparateur attendu');
        }
        return { k: 'fn', nom: k.v, args };
      }
      case T.PARO: {
        const e = this.expression();
        this.attendre(T.PARF);
        return e;
      }
      case T.ACCO: {
        // Constante matricielle {1,2;3,4}
        const lignes = [[]];
        for (;;) {
          const p = this.peek();
          if (!p) throw err(ERR.VALEUR, 'accolade manquante');
          if (p.t === T.ACCF) { this.next(); break; }
          if (p.t === T.SEP) { this.next(); if (p.v === ';') lignes.push([]); continue; }
          lignes[lignes.length - 1].push(this.expression());
        }
        return { k: 'tab', lignes };
      }
      default: throw err(ERR.VALEUR, 'inattendu');
    }
  }
}

const cacheArbres = new Map();

export function analyser(formule) {
  const src = formule.startsWith('=') ? formule.slice(1) : formule;
  let arbre = cacheArbres.get(src);
  if (arbre) return arbre;
  const p = new Parseur(tokeniser(src));
  arbre = p.expression();
  if (!p.fini()) throw err(ERR.VALEUR, 'texte en trop après l\'expression');
  if (cacheArbres.size > 5000) cacheArbres.clear();
  cacheArbres.set(src, arbre);
  return arbre;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

const EPOQUE = Date.UTC(1899, 11, 30);
export const dateVersSerie = (d) => (d.getTime() - EPOQUE) / 86400000;
export const serieVersDate = (n) => new Date(EPOQUE + n * 86400000);

export function versNombre(v) {
  if (v instanceof ErreurFormule) throw v;
  if (v instanceof Plage) return versNombre(v.scalaire());
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw err(ERR.NUM); return v; }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null || v === '') return 0;
  if (typeof v === 'string') {
    let s = v.trim();
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
    s = s.replace(/\s/g, '');
    if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) { const n = parseFloat(s); return pct ? n / 100 : n; }
    const d = Date.parse(v);
    if (!Number.isNaN(d) && /\d{4}-\d{2}-\d{2}/.test(v)) return dateVersSerie(new Date(d));
    // Date écrite à la française (« 1/1/2020 », « 15/03/26 », « 15/03/2026 14:30 ») : comme Excel, elle compte comme sa date
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
    if (m) {
      const j = +m[1], mo = +m[2]; let a = +m[3]; if (m[3].length === 2) a += a < 30 ? 2000 : 1900;
      if (mo >= 1 && mo <= 12 && j >= 1 && j <= new Date(Date.UTC(a, mo, 0)).getUTCDate()) return Math.round(dateVersSerie(new Date(Date.UTC(a, mo - 1, j)))) + ((+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) / 86400;
    }
    m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
    if (m && +m[2] < 60) return (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400;
    throw err(ERR.VALEUR, '« ' + v + ' » n\'est pas un nombre');
  }
  if (Array.isArray(v)) return versNombre(v[0] && v[0][0]);
  throw err(ERR.VALEUR);
}

export function versBool(v) {
  if (v instanceof ErreurFormule) throw v;
  if (v instanceof Plage) return versBool(v.scalaire());
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v == null || v === '') return false;
  if (typeof v === 'string') {
    const u = v.trim().toUpperCase();
    if (u === 'TRUE' || u === 'VRAI') return true;
    if (u === 'FALSE' || u === 'FAUX') return false;
    throw err(ERR.VALEUR);
  }
  if (Array.isArray(v)) return versBool(v[0] && v[0][0]);
  throw err(ERR.VALEUR);
}

export function versTexte(v) {
  if (v instanceof ErreurFormule) throw v;
  if (v instanceof Plage) return versTexte(v.scalaire());
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return nombreVersTexte(v);
  if (Array.isArray(v)) return versTexte(v[0] && v[0][0]);
  return String(v);
}

/** Séparateurs d'affichage (français par défaut) ; utilisés par formater, TEXTE et Format. */
export const OPTIONS = { decimal: ',', milliers: '\u202f' };

export function nombreVersTexte(n) {
  if (Number.isInteger(n)) return String(n);
  // 15 chiffres significatifs comme Excel
  let s = n.toPrecision(15);
  if (s.includes('e')) return String(parseFloat(s));
  s = s.replace(/\.?0+$/, '');
  return s;
}

/** Ramène une valeur scalaire (déplie une plage d'une cellule, un tableau 1×1). */
function scal(v) {
  if (v instanceof Plage) return v.scalaire();
  if (Array.isArray(v)) return v[0] && v[0][0] !== undefined ? v[0][0] : null;
  return v;
}

/** Tableau 2D de valeurs à partir d'une plage, d'un tableau ou d'un scalaire. */
function matrice(v) {
  if (v instanceof Plage) return v.matrice();
  if (Array.isArray(v)) return v;
  return [[v]];
}

/** Toutes les valeurs à plat (plages dépliées). */
function aplat(args) {
  const out = [];
  for (const a of args) {
    if (a instanceof Plage) out.push(...a.aplat());
    else if (Array.isArray(a)) out.push(...a.flat());
    else out.push(a);
  }
  return out;
}

/** Nombres pour les fonctions d'agrégat : dans les plages, seules les valeurs numériques comptent ;
 *  les arguments directs sont convertis (« 3 » → 3, VRAI → 1). */
function nombres(args) {
  const out = [];
  for (const a of args) {
    if (a instanceof Plage || Array.isArray(a)) {
      for (const v of (a instanceof Plage ? a.aplat() : a.flat())) {
        if (v instanceof ErreurFormule) throw v;
        if (typeof v === 'number') out.push(v);
      }
    } else if (a !== null && a !== undefined && a !== '') {
      out.push(versNombre(a));
    }
  }
  return out;
}

function rangDeType(v) {
  if (typeof v === 'number') return 0;
  if (typeof v === 'string') return 1;
  if (typeof v === 'boolean') return 2;
  return 0;
}

/** Comparaison Excel : nombres < textes < booléens ; textes insensibles à la casse ; vide = 0 = "". */
export function comparer(a, b) {
  a = scal(a); b = scal(b);
  if (a instanceof ErreurFormule) throw a;
  if (b instanceof ErreurFormule) throw b;
  if (a == null) a = typeof b === 'string' ? '' : (typeof b === 'boolean' ? false : 0);
  if (b == null) b = typeof a === 'string' ? '' : (typeof a === 'boolean' ? false : 0);
  const ta = rangDeType(a), tb = rangDeType(b);
  if (ta !== tb) return ta - tb;
  if (ta === 1) {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (ta === 2) return (a ? 1 : 0) - (b ? 1 : 0);
  return a < b ? -1 : a > b ? 1 : 0;
}

// Critères « >5 », « <>x », « a* » des fonctions SI.
function compilerCritere(crit) {
  crit = scal(crit);
  if (crit instanceof ErreurFormule) throw crit;
  let op = '=', val = crit;
  if (typeof crit === 'string') {
    const m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(crit);
    if (m) { op = m[1]; val = m[2]; }
    if (typeof val === 'string') {
      const t = val.trim();
      if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?%?$/.test(t)) val = versNombre(t);
      else if (/^(TRUE|VRAI)$/i.test(t)) val = true;
      else if (/^(FALSE|FAUX)$/i.test(t)) val = false;
    }
  }
  if (typeof val === 'string' && (op === '=' || op === '<>') && /[*?]/.test(val)) {
    const re = new RegExp('^' + val.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~?\*/g, '.*').replace(/~?\?/g, '.') + '$', 'i');
    return (v) => (op === '=') === re.test(v == null ? '' : String(v));
  }
  if (typeof val === 'string' && val === '' ) {
    if (op === '=') return (v) => v == null || v === '';
    if (op === '<>') return (v) => !(v == null || v === '');
  }
  return (v) => {
    if (v == null && op !== '=' && op !== '<>') return false;
    if (typeof val === 'number' && typeof v !== 'number') return op === '<>';
    if (typeof val === 'string' && typeof v !== 'string') return op === '<>';
    if (typeof val === 'boolean' && typeof v !== 'boolean') return op === '<>';
    const c = comparer(v, val);
    switch (op) {
      case '=': return c === 0; case '<>': return c !== 0; case '<': return c < 0;
      case '>': return c > 0; case '<=': return c <= 0; case '>=': return c >= 0;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Mathématiques utiles (statistiques, finance)
// ---------------------------------------------------------------------------

function lnGamma(x) {
  // Lanczos
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// erfc par développement de Tchebychev (Numerical Recipes 3e éd.), précision ~1e-16
const COF_ERFC = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
  4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9,
  -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15, -9.4e-17, 1.21e-16, -2.8e-17];
function erfcTcheb(z) {
  const t = 2 / (2 + z), ty = 4 * t - 2;
  let d = 0, dd = 0;
  for (let j = COF_ERFC.length - 1; j > 0; j--) { const tmp = d; d = ty * d - dd + COF_ERFC[j]; dd = tmp; }
  return t * Math.exp(-z * z + 0.5 * (COF_ERFC[0] + ty * d) - dd);
}
function erfc(x) { return x >= 0 ? erfcTcheb(x) : 2 - erfcTcheb(-x); }
function erf(x) { return 1 - erfc(x); }

function normSDist(z) { return 0.5 * erfc(-z / Math.SQRT2); }
function normSPdf(z) { return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }

function normSInv(p) {
  // Acklam, puis un pas de Newton
  if (p <= 0 || p >= 1) throw err(ERR.NUM);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= ph) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normSDist(x) - p;
  x -= e / normSPdf(x);
  return x;
}

function gammaIncReg(s, x) {
  // P(s, x) régularisée : série ou fraction continue
  if (x <= 0) return 0;
  if (x < s + 1) {
    let sum = 1 / s, term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (s + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + s * Math.log(x) - lnGamma(s));
  }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h;
}

function betaIncReg(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (a, b, x) => {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  };
  if (x < (a + 1) / (a + b + 2)) return bt * cf(a, b, x) / a;
  return 1 - bt * cf(b, a, 1 - x) / b;
}

/** Recherche de racine (Newton puis dichotomie) pour TAUX, TRI… */
function resoudre(f, x0, basse = -0.999999, haute = 1e6) {
  let x = x0;
  for (let i = 0; i < 100; i++) {
    const y = f(x);
    if (!Number.isFinite(y)) break;
    if (Math.abs(y) < 1e-12) return x;
    const h = Math.max(1e-7, Math.abs(x) * 1e-7);
    const dy = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(dy) || dy === 0) break;
    const nx = x - y / dy;
    if (Math.abs(nx - x) < 1e-14) return nx;
    x = nx;
  }
  // Dichotomie sur un encadrement trouvé par balayage
  let a = basse, b = haute, fa = f(a);
  const pas = [-0.9, -0.5, -0.2, -0.1, -0.05, 0, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100];
  let trouve = false;
  for (let i = 0; i < pas.length - 1; i++) {
    const f1 = f(pas[i]), f2 = f(pas[i + 1]);
    if (Number.isFinite(f1) && Number.isFinite(f2) && f1 * f2 <= 0) { a = pas[i]; b = pas[i + 1]; fa = f1; trouve = true; break; }
  }
  if (!trouve) throw err(ERR.NUM);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (Math.abs(fm) < 1e-13 || (b - a) < 1e-15) return m;
    if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

// Flux d'annuités : valeur actuelle de pv, versements pmt, valeur future fv à taux r sur n périodes.
function vanAnnuite(r, n, pmt, pv, fv, type) {
  if (r === 0) return pv + pmt * n + fv;
  const k = Math.pow(1 + r, n);
  return pv * k + pmt * (1 + r * type) * (k - 1) / r + fv;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function dateUTC(serie) {
  const d = serieVersDate(Math.floor(serie));
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, j: d.getUTCDate(), d };
}
function serie(a, m, j) { return dateVersSerie(new Date(Date.UTC(a, m - 1, j))); }
function joursDansMois(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }

function fractionAnnee(d1, d2, base) {
  if (d1 > d2) [d1, d2] = [d2, d1];
  const A = dateUTC(d1), B = dateUTC(d2);
  switch (base) {
    case 1: {
      const jours = d2 - d1;
      let annees = B.a - A.a + 1, somme = 0;
      for (let y = A.a; y <= B.a; y++) somme += joursDansMois(y, 2) === 29 ? 366 : 365;
      if (A.a === B.a || (B.a - A.a === 1 && (B.m < A.m || (B.m === A.m && B.j <= A.j)))) {
        // Moins d'un an : 366 si un 29 février est inclus.
        let base365 = 365;
        for (let y = A.a; y <= B.a; y++) { const bis = serie(y, 2, 29); if (joursDansMois(y, 2) === 29 && bis >= d1 && bis <= d2) base365 = 366; }
        return jours / base365;
      }
      return jours / (somme / annees);
    }
    case 2: return (d2 - d1) / 360;
    case 3: return (d2 - d1) / 365;
    case 4: { // 30E/360
      const j1 = Math.min(A.j, 30), j2 = Math.min(B.j, 30);
      return ((B.a - A.a) * 360 + (B.m - A.m) * 30 + (j2 - j1)) / 360;
    }
    default: { // 30US/360
      let j1 = A.j, j2 = B.j;
      const finFevA = A.m === 2 && A.j === joursDansMois(A.a, 2);
      const finFevB = B.m === 2 && B.j === joursDansMois(B.a, 2);
      if (finFevA && finFevB) j2 = 30;
      if (finFevA) j1 = 30;
      if (j2 === 31 && j1 >= 30) j2 = 30;
      if (j1 === 31) j1 = 30;
      return ((B.a - A.a) * 360 + (B.m - A.m) * 30 + (j2 - j1)) / 360;
    }
  }
}

// ---------------------------------------------------------------------------
// Bibliothèque de fonctions
// ---------------------------------------------------------------------------
// Chaque fonction reçoit (args, ctx). Les fonctions « paresseuses » reçoivent
// les nœuds non évalués et une fonction eval.

const N = versNombre, S = versTexte, B = versBool;
const opt = (a, def) => (a === undefined || a === null || (a && a.k === 'vide') ? def : a);
const entier = (v) => Math.trunc(N(v));

function arrondi(x, n, mode) {
  n = Math.trunc(n);
  const f = Math.pow(10, n);
  const y = Math.abs(x) * f;
  let r;
  // Correction des flottants : 2.675 * 100 = 267.49999…
  const yy = parseFloat(y.toPrecision(15));
  if (mode === 'up') r = Math.ceil(yy - 1e-12);
  else if (mode === 'down') r = Math.floor(yy + 1e-12);
  else r = Math.floor(yy + 0.5);
  r = r / f;
  return x < 0 ? -r : r;
}

function rechercheV(val, table, idx, approx, horizontal) {
  let m = matrice(table);
  if (horizontal) m = transposer(m);
  idx = entier(idx);
  if (idx < 1 || idx > (m[0] || []).length) throw err(ERR.REF);
  val = scal(val);
  if (approx) {
    // Recherche binaire sur la première colonne triée (dernière valeur ≤ cherchée)
    let lo = 0, hi = m.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const k = m[mid][0];
      let c;
      try { c = (k == null) ? 1 : comparer(k, val); } catch { c = 1; }
      if (c <= 0) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) throw err(ERR.NA);
    return m[best][idx - 1] ?? null;
  }
  const test = compilerCritere(typeof val === 'string' ? val : val);
  for (const ligne of m) if (test(ligne[0])) return ligne[idx - 1] ?? null;
  throw err(ERR.NA);
}

function equiv(val, plage, mode) {
  const liste = aplat([plage]);
  val = scal(val);
  mode = mode === undefined ? 1 : entier(mode);
  if (mode === 0) {
    const test = compilerCritere(val);
    for (let i = 0; i < liste.length; i++) if (test(liste[i])) return i + 1;
    throw err(ERR.NA);
  }
  let best = -1;
  for (let i = 0; i < liste.length; i++) {
    if (liste[i] == null) continue;
    let c;
    try { c = comparer(liste[i], val); } catch { continue; }
    if (mode === 1) { if (c <= 0) best = i; else break; }
    else { if (c >= 0) best = i; else break; }
  }
  if (best < 0) throw err(ERR.NA);
  return best + 1;
}

function transposer(m) {
  const out = [];
  for (let c = 0; c < (m[0] || []).length; c++) { const l = []; for (let r = 0; r < m.length; r++) l.push(m[r][c]); out.push(l); }
  return out;
}

function matNombres(v) { return matrice(v).map((l) => l.map((x) => N(x))); }

function inverser(m) {
  const n = m.length;
  if (n === 0 || m.some((l) => l.length !== n)) throw err(ERR.VALEUR);
  const a = m.map((l, i) => [...l, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-300) throw err(ERR.NUM);
    [a[c], a[p]] = [a[p], a[c]];
    const piv = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= piv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((l) => l.slice(n));
}

function determinant(m) {
  const n = m.length;
  if (n === 0 || m.some((l) => l.length !== n)) throw err(ERR.VALEUR);
  const a = m.map((l) => [...l]);
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-300) return 0;
    if (p !== c) { [a[c], a[p]] = [a[p], a[c]]; det = -det; }
    det *= a[c][c];
    for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let j = c; j < n; j++) a[r][j] -= f * a[c][j]; }
  }
  return det;
}

function statsXY(ys, xs) {
  const Y = aplat([ys]), X = aplat([xs]);
  if (Y.length !== X.length) throw err(ERR.NA);
  const px = [], py = [];
  for (let i = 0; i < Y.length; i++) if (typeof Y[i] === 'number' && typeof X[i] === 'number') { py.push(Y[i]); px.push(X[i]); }
  const n = px.length;
  if (n < 2) throw err(ERR.DIV0);
  const mx = px.reduce((a, b) => a + b, 0) / n, my = py.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (px[i] - mx) * (py[i] - my); sxx += (px[i] - mx) ** 2; syy += (py[i] - my) ** 2; }
  return { n, mx, my, sxy, sxx, syy };
}

function variance(vals, population) {
  const n = vals.length;
  if (n < (population ? 1 : 2)) throw err(ERR.DIV0);
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const s = vals.reduce((a, b) => a + (b - m) ** 2, 0);
  return s / (population ? n : n - 1);
}

function quantile(vals, p, exclusif) {
  vals = [...vals].sort((a, b) => a - b);
  const n = vals.length;
  if (!n || p < 0 || p > 1) throw err(ERR.NUM);
  let h;
  if (exclusif) { h = p * (n + 1) - 1; if (h < 0 || h > n - 1) throw err(ERR.NUM); }
  else h = p * (n - 1);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return vals[lo] + (h - lo) * (vals[hi] - vals[lo]);
}

function texteFormat(v, fmt) {
  // Sous-ensemble de TEXTE : 0, 0.00, #,##0.00, 0%, dates jj/mm/aaaa.
  if (/[dmyjah]/i.test(fmt) && !/[0#]/.test(fmt)) return formaterDate(N(v), fmt);
  return formaterNombre(N(v), fmt);
}

/** Formate un numéro de série selon un motif de date (jj/mm/aaaa, dd-mmm-yyyy, hh:mm…). */
export function formaterDate(serie, fmt) {
  // Arrondi à la seconde, comme Excel (0,4583333 s'affiche 11:00 et non 10:59)
  const d = serieVersDate(Math.round(serie * 86400) / 86400);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  // Durées : [h], [mm], [ss] comptent au-delà de 24 h / 60 min (total des heures d'une semaine)
  const totalSec = Math.round(Math.abs(serie) * 86400), ecoule = [];
  const sansDurees = fmt.split(';')[0].replace(/\[(h+|m+|s+)\]/gi, (x, u) => {
    const k = u[0].toLowerCase(), n = k === 'h' ? Math.floor(totalSec / 3600) : k === 'm' ? Math.floor(totalSec / 60) : totalSec;
    ecoule.push((serie < 0 && !ecoule.length ? '-' : '') + pad(n, u.length));
    return k === 'h' ? '\u0003' : k === 'm' ? '\u0004' : '\u0005';
  });
  const moisNoms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const joursNoms = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const h24 = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
  // Textes entre guillemets et caractères échappés : mis de côté pour que leurs lettres ne soient pas lues (« [h]"h"mm »)
  const litteraux = [], noms = [];
  // Noms de mois et de jours : posés à part, sinon le « m » de « novembre » ou le « d » de « décembre » serait remplacé
  const nom = (t) => '\u0007' + String.fromCharCode(0xe000 + noms.push(t) - 1);
  let f = sansDurees.replace(/"([^"]*)"|\\(.)/g, (x, a, b) => { litteraux.push(a ?? b); return '\u0006'; }).replace(/\[[^\]]*\]/g, '');
  // AM/PM : heures sur 12 ; le marqueur est mis de côté pour que ses lettres ne soient pas prises pour des mois
  const ampm = /AM\/PM|A\/P/i.exec(f);
  if (ampm) f = f.replace(ampm[0], '\u0002');
  const h = ampm ? (h24 % 12 || 12) : h24;
  // Les « m » juste après « h » ou avant « s » sont des minutes.
  f = f.replace(/([h\u0003]+[:.\s\u0006]*)m+/gi, (x) => x.replace(/m+/i, (mm) => '§'.repeat(mm.length)));
  f = f.replace(/m+(?=[:.\s]*s)/gi, (mm) => '§'.repeat(mm.length));
  return f
    .replace(/yyyy|aaaa/gi, String(d.getUTCFullYear()))
    .replace(/yy|aa/gi, pad(d.getUTCFullYear() % 100))
    .replace(/mmmm/gi, () => nom(moisNoms[d.getUTCMonth()]))
    .replace(/mmm/gi, () => nom(moisNoms[d.getUTCMonth()].slice(0, 3)))
    .replace(/mm/gi, pad(d.getUTCMonth() + 1))
    .replace(/(?<![a§])m(?![a§])/gi, String(d.getUTCMonth() + 1))
    .replace(/dddd|jjjj/gi, () => nom(joursNoms[d.getUTCDay()]))
    .replace(/ddd|jjj/gi, () => nom(joursNoms[d.getUTCDay()].slice(0, 3)))
    .replace(/dd|jj/gi, pad(d.getUTCDate()))
    .replace(/(?<![a-z§])[dj](?![a-z§])/gi, String(d.getUTCDate()))
    .replace(/hh/gi, pad(h)).replace(/(?<![a-z])h(?![a-z])/gi, String(h))
    .replace(/§§/g, pad(mi)).replace(/§/g, String(mi))
    .replace(/ss/gi, pad(s)).replace(/(?<![a-z])s(?![a-z])/gi, String(s))
    .replace('\u0002', ampm ? (ampm[0].length > 3 ? (h24 < 12 ? 'AM' : 'PM') : (h24 < 12 ? 'A' : 'P')) : '')
    .replace(/[\u0003-\u0005]/g, () => ecoule.shift() ?? '')
    .replace(/\u0006/g, () => litteraux.shift() ?? '')
    .replace(/\u0007([\ue000-\uefff])/g, (x, k) => noms[k.charCodeAt(0) - 0xe000] ?? '');
}

// Couleurs des formats de nombre (« [Rouge] », « [Red] », « [Couleur10] »…)
const COULEURS_FORMAT = { red: '#ff0000', rouge: '#ff0000', blue: '#0000ff', bleu: '#0000ff', green: '#008000', vert: '#008000', magenta: '#ff00ff', cyan: '#00ffff', yellow: '#c8a800', jaune: '#c8a800', black: '#000000', noir: '#000000', white: '#ffffff', blanc: '#ffffff' };
const PALETTE_FORMAT = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0', '#808080'];
/** Couleur imposée par le format de nombre pour cette valeur (section choisie comme pour l'affichage), ou null. */
export function couleurFormat(v, z) {
  if (typeof v !== 'number' || !z || !z.includes('[')) return null;
  const f = sectionPour(v, z).f;
  const m = /\[([A-Za-zéè]+)(\d*)\]/.exec(f);
  if (!m) return null;
  const nom = m[1].toLowerCase();
  if ((nom === 'color' || nom === 'couleur') && m[2]) return PALETTE_FORMAT[(+m[2] - 1) % 16] || null;
  return COULEURS_FORMAT[nom] || null;
}

// Fractions : « # ?/? », « # ??/?? », « ?/4 »
function formaterFraction(n, f) {
  const m = /^(#+\s+|0\s+)?([?#0]+)\/([?#0]+|\d+)$/.exec(f.trim());
  if (!m) return null;
  const neg = n < 0; let x = Math.abs(n);
  let entier = 0;
  if (m[1]) { entier = Math.floor(x); x -= entier; }
  let num, den;
  if (/^\d+$/.test(m[3])) { den = +m[3]; num = Math.round(x * den); }
  else {
    const max = Math.pow(10, m[3].length) - 1;
    let best = [0, 1, Infinity];
    for (let d = 1; d <= max; d++) { const k = Math.round(x * d), e = Math.abs(x - k / d); if (e < best[2] - 1e-12) best = [k, d, e]; }
    [num, den] = best;
  }
  if (m[1] && num === den) { entier++; num = 0; }
  const fr = num ? num + '/' + den : '';
  const txt = m[1] ? (entier || !fr ? String(entier) : '') + (entier && fr ? ' ' : '') + fr : (num + '/' + den);
  return (neg ? '-' : '') + (txt || '0');
}

/** Formate un nombre selon un motif Excel simple (0.00, #,##0, 0%, 0.0E+00, « # ##0,00 € »). */
// Sections d'un format, sans couper dans les textes entre guillemets
function sectionsFormat(fmt) {
  const out = []; let cur = '', g = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '"') g = !g;
    if (ch === '\\' && !g) { cur += ch + (fmt[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !g) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const RE_CONDITION = /\[(<=|>=|<>|<|>|=)\s*(-?[\d.]+)\]/;
/** Section d'un format pour une valeur : positif;négatif;zéro;texte, ou conditions « [<1000]0;[>=1000]#,##0,"k" ». */
export function sectionPour(n, fmt) {
  const sections = sectionsFormat(fmt);
  if (sections.some((x) => RE_CONDITION.test(x))) {
    const teste = (x) => { const m = RE_CONDITION.exec(x); if (!m) return null; const v = +m[2]; return { '<': n < v, '>': n > v, '=': n === v, '<=': n <= v, '>=': n >= v, '<>': n !== v }[m[1]]; };
    for (let i = 0; i < Math.min(2, sections.length); i++) if (teste(sections[i])) return { f: sections[i].replace(RE_CONDITION, ''), signe: true };
    const autre = sections.length > 2 ? sections[2] : sections.find((x) => !RE_CONDITION.test(x)) ?? sections[sections.length - 1];
    return { f: autre.replace(RE_CONDITION, ''), signe: true };
  }
  if (sections.length > 1 && n < 0) return { f: sections[1], abs: true };
  if (sections.length > 2 && n === 0) return { f: sections[2] };
  return { f: sections[0] };
}
export function formaterNombre(n, fmt) {
  if (typeof n !== 'number') return versTexte(n);
  // Sections : positif;négatif;zéro (ou à conditions)
  const choix = sectionPour(n, fmt);
  let f = choix.f;
  let neg = n < 0;
  if (choix.abs) { neg = false; n = -n; }
  if (f === 'General' || f === 'Standard' || f === '') return nombreVersTexte(neg ? -Math.abs(n) : n).replace('.', OPTIONS.decimal);
  f = f.replace(/\[[^\]]*\]/g, '').replace(/_./g, ' ').replace(/\*./g, '');
  if (f.includes('/') && /[?#0]\s*\/\s*[?#0\d]/.test(f)) { const fr = formaterFraction(neg ? -Math.abs(n) : n, f); if (fr !== null) return fr; }
  const litteraux = [];
  f = f.replace(/"([^"]*)"|\\(.)/g, (m, a, b) => { litteraux.push(a ?? b); return '\u0001'; });
  const premier = f.search(/[0#?]/);
  if (premier < 0) return (litteraux.length ? f.replace(/\u0001/g, () => litteraux.shift() ?? '') : f);
  let dernier = premier;
  for (let i = f.length - 1; i >= 0; i--) if (/[0#?]/.test(f[i])) { dernier = i; break; }
  let prefixe = f.slice(0, premier), coeur = f.slice(premier, dernier + 1), suffixe = f.slice(dernier + 1);
  let x = Math.abs(n);
  // Virgules après le dernier chiffre : divisent par 1 000 chacune (« #,##0,, » affiche des millions)
  const echelle = /^,+/.exec(suffixe);
  if (echelle) { x /= Math.pow(1000, echelle[0].length); suffixe = suffixe.slice(echelle[0].length); }
  const echelleDec = /,+(?=\.)/.exec(coeur);
  if (echelleDec) { x /= Math.pow(1000, echelleDec[0].length); coeur = coeur.replace(/,+(?=\.)/, ''); }
  const pct = f.includes('%');
  if (pct) x *= 100;
  // Notation scientifique : le E+00 se trouve dans le cœur ou le suffixe
  let exp = 0; const sci = /E([+-])(0+)$/i.exec(coeur + suffixe);
  if (sci) {
    exp = x === 0 ? 0 : Math.floor(Math.log10(x)); x /= Math.pow(10, exp);
    const tout = coeur + suffixe; const sansSci = tout.slice(0, tout.length - sci[0].length);
    coeur = sansSci; suffixe = '';
    const d2 = coeur.search(/[0#?][^0#?]*$/); if (d2 >= 0) { suffixe = coeur.slice(d2 + 1); coeur = coeur.slice(0, d2 + 1); }
  }
  // Séparateur décimal du motif : « . », ou une virgule suivie de 1 ou 2 chiffres en fin (motif français « 0,00 »)
  let sepDecMotif = '.';
  if (!coeur.includes('.')) { const m = /,([0#?]{1,2})$/.exec(coeur); if (m) sepDecMotif = ','; }
  const idx = coeur.indexOf(sepDecMotif === ',' ? ',' : '.');
  const pos = sepDecMotif === ',' ? coeur.lastIndexOf(',') : idx;
  const entiers = pos >= 0 ? coeur.slice(0, pos) : coeur, dec = pos >= 0 ? coeur.slice(pos + 1) : '';
  const nbDec = (dec.match(/[0#?]/g) || []).length;
  const milliers = /[0#?][, ][0#?]/.test(entiers);
  let [ip, dp = ''] = x.toFixed(nbDec).split('.');
  const minEnt = (entiers.match(/0/g) || []).length;
  ip = ip.padStart(minEnt, '0');
  // « ? » : un espace à la place d'un chiffre absent (alignement des colonnes, zéro comptable « "-"?? »)
  const interro = (entiers.match(/\?/g) || []).length;
  if (minEnt === 0 && ip === '0') ip = '';
  if (interro && ip.length < interro + minEnt) ip = ip.padStart(interro + minEnt, ' ');
  if (milliers) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, OPTIONS.milliers);
  const decMotif = dec.replace(/[^0#?]/g, '');
  let dpOut = dp;
  for (let i = decMotif.length - 1; i >= 0; i--) { if (decMotif[i] === '#' && dpOut[i] === '0' && dpOut.length === i + 1) dpOut = dpOut.slice(0, -1); else break; }
  if (decMotif.includes('?')) { let k = dpOut.length - 1; const t = dpOut.split(''); while (k >= 0 && decMotif[k] === '?' && t[k] === '0') { t[k] = ' '; k--; } dpOut = t.join(''); }
  let out = prefixe + ip + (dpOut ? OPTIONS.decimal + dpOut : '') + suffixe;
  if (sci) out += (exp < 0 ? 'E-' : 'E+') + String(Math.abs(exp)).padStart(sci[2].length, '0');
  out = out.replace(/\u0001/g, () => litteraux.shift() ?? '');
  return (neg ? '-' : '') + out;
}

/** Affichage d'une valeur avec son format de nombre (z) : pour l'interface. */
export function formater(v, z) {
  if (v instanceof ErreurFormule) return v.code;
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
  if (typeof v === 'number') {
    if (z && z !== 'General') {
      try {
        if (/[dmyjhs]/i.test(z.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')) && !/[0#]\.|^[0#]/.test(z)) return formaterDate(v, z);
        return formaterNombre(v, z);
      } catch { /* on retombe sur l'affichage brut */ }
    }
    return nombreVersTexte(v).replace('.', OPTIONS.decimal);
  }
  return String(v);
}

const FONCTIONS = {
  // ----- Logique -----
  IF: { paresseux: true, fn: (args, ev) => {
    const cond = ev(args[0]);
    if (Array.isArray(cond) || (cond instanceof Plage && cond.taille > 1)) {
      const m = matrice(cond);
      const oui = args.length > 1 ? matrice(ev(args[1])) : [[true]], non = args.length > 2 ? matrice(ev(args[2])) : [[false]];
      const prendre = (t, i, j) => { const l = t[t.length === 1 ? 0 : i]; return l ? l[l.length === 1 ? 0 : j] : err(ERR.NA); };
      return m.map((l, i) => l.map((x, j) => { try { return B(x) ? prendre(oui, i, j) : prendre(non, i, j); } catch (e) { if (e instanceof ErreurFormule) return e; throw e; } }));
    }
    return B(cond) ? (args.length > 1 ? ev(args[1]) : true) : (args.length > 2 ? ev(args[2]) : false);
  } },
  IFS: { paresseux: true, fn: (args, ev) => { for (let i = 0; i + 1 < args.length; i += 2) if (B(ev(args[i]))) return ev(args[i + 1]); throw err(ERR.NA); } },
  IFERROR: { paresseux: true, fn: (args, ev) => { try { const v = scal(ev(args[0])); if (v instanceof ErreurFormule) throw v; return v; } catch (e) { if (e instanceof ErreurFormule) return ev(args[1]); throw e; } } },
  IFNA: { paresseux: true, fn: (args, ev) => { try { const v = scal(ev(args[0])); if (v instanceof ErreurFormule) throw v; return v; } catch (e) { if (e instanceof ErreurFormule && e.code === ERR.NA) return ev(args[1]); throw e; } } },
  CHOOSE: { paresseux: true, fn: (args, ev) => { const i = entier(ev(args[0])); if (i < 1 || i >= args.length) throw err(ERR.VALEUR); return ev(args[i]); } },
  SWITCH: { paresseux: true, fn: (args, ev) => { const v = scal(ev(args[0])); let i = 1; for (; i + 1 < args.length; i += 2) if (comparer(v, ev(args[i])) === 0) return ev(args[i + 1]); if (i < args.length) return ev(args[i]); throw err(ERR.NA); } },
  AND: { fn: (a) => { const v = aplat(a).filter((x) => x != null && x !== ''); if (!v.length) throw err(ERR.VALEUR); return v.every((x) => typeof x === 'string' && !/^(true|false|vrai|faux)$/i.test(x) ? true : B(x)); } },
  OR: { fn: (a) => { const v = aplat(a).filter((x) => x != null && x !== ''); if (!v.length) throw err(ERR.VALEUR); return v.some((x) => typeof x === 'string' && !/^(true|false|vrai|faux)$/i.test(x) ? false : B(x)); } },
  XOR: { fn: (a) => aplat(a).filter((x) => x != null && x !== '').reduce((acc, x) => acc !== B(x), false) },
  NOT: { fn: (a) => !B(a[0]) },
  TRUE: { fn: () => true },
  FALSE: { fn: () => false },
  ISBLANK: { fn: (a) => { const v = scal(a[0]); return v == null || v === ''; } },
  ISNUMBER: { fn: (a) => { try { return typeof scal(a[0]) === 'number'; } catch { return false; } } },
  ISTEXT: { fn: (a) => typeof scal(a[0]) === 'string' },
  ISNONTEXT: { fn: (a) => typeof scal(a[0]) !== 'string' },
  ISLOGICAL: { fn: (a) => typeof scal(a[0]) === 'boolean' },
  ISERROR: { paresseux: true, fn: (args, ev) => { try { return scal(ev(args[0])) instanceof ErreurFormule; } catch (e) { if (e instanceof ErreurFormule) return true; throw e; } } },
  ISERR: { paresseux: true, fn: (args, ev) => { try { const v = scal(ev(args[0])); return v instanceof ErreurFormule && v.code !== ERR.NA; } catch (e) { if (e instanceof ErreurFormule) return e.code !== ERR.NA; throw e; } } },
  ISNA: { paresseux: true, fn: (args, ev) => { try { const v = scal(ev(args[0])); return v instanceof ErreurFormule && v.code === ERR.NA; } catch (e) { if (e instanceof ErreurFormule) return e.code === ERR.NA; throw e; } } },
  ISEVEN: { fn: (a) => entier(a[0]) % 2 === 0 },
  ISODD: { fn: (a) => Math.abs(entier(a[0]) % 2) === 1 },
  NA: { fn: () => { throw err(ERR.NA); } },
  N: { fn: (a) => { const v = scal(a[0]); return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; } },
  TYPE: { fn: (a) => { const v = a[0]; if (v instanceof Plage && v.taille > 1 || Array.isArray(v)) return 64; const s = scal(v); return typeof s === 'number' || s == null ? 1 : typeof s === 'string' ? 2 : typeof s === 'boolean' ? 4 : 16; } },

  // ----- Mathématiques -----
  SUM: { fn: (a) => nombres(a).reduce((x, y) => x + y, 0) },
  PRODUCT: { fn: (a) => nombres(a).reduce((x, y) => x * y, 1) },
  SUMSQ: { fn: (a) => nombres(a).reduce((x, y) => x + y * y, 0) },
  ABS: { fn: (a) => Math.abs(N(a[0])) },
  SIGN: { fn: (a) => Math.sign(N(a[0])) },
  SQRT: { fn: (a) => { const x = N(a[0]); if (x < 0) throw err(ERR.NUM); return Math.sqrt(x); } },
  SQRTPI: { fn: (a) => Math.sqrt(N(a[0]) * Math.PI) },
  EXP: { fn: (a) => Math.exp(N(a[0])) },
  LN: { fn: (a) => { const x = N(a[0]); if (x <= 0) throw err(ERR.NUM); return Math.log(x); } },
  LOG: { fn: (a) => { const x = N(a[0]), b = N(opt(a[1], 10)); if (x <= 0 || b <= 0 || b === 1) throw err(ERR.NUM); return Math.log(x) / Math.log(b); } },
  LOG10: { fn: (a) => { const x = N(a[0]); if (x <= 0) throw err(ERR.NUM); return Math.log10(x); } },
  POWER: { fn: (a) => { const r = Math.pow(N(a[0]), N(a[1])); if (!Number.isFinite(r)) throw err(ERR.NUM); return r; } },
  MOD: { fn: (a) => { const x = N(a[0]), d = N(a[1]); if (d === 0) throw err(ERR.DIV0); return x - d * Math.floor(x / d); } },
  QUOTIENT: { fn: (a) => { const d = N(a[1]); if (d === 0) throw err(ERR.DIV0); return Math.trunc(N(a[0]) / d); } },
  INT: { fn: (a) => Math.floor(N(a[0])) },
  TRUNC: { fn: (a) => arrondi(N(a[0]), N(opt(a[1], 0)), 'down') },
  ROUND: { fn: (a) => arrondi(N(a[0]), N(opt(a[1], 0)), 'near') },
  ROUNDUP: { fn: (a) => arrondi(N(a[0]), N(opt(a[1], 0)), 'up') },
  ROUNDDOWN: { fn: (a) => arrondi(N(a[0]), N(opt(a[1], 0)), 'down') },
  MROUND: { fn: (a) => { const m = N(a[1]); if (m === 0) return 0; return Math.round(N(a[0]) / m) * m; } },
  CEILING: { fn: (a) => { const x = N(a[0]), s = N(opt(a[1], 1)); if (s === 0) return 0; return Math.ceil(x / s - 1e-12) * s; } },
  'CEILING.MATH': { fn: (a) => { const x = N(a[0]), s = Math.abs(N(opt(a[1], 1))) || 1; return Math.ceil(x / s - 1e-12) * s; } },
  FLOOR: { fn: (a) => { const x = N(a[0]), s = N(opt(a[1], 1)); if (s === 0) throw err(ERR.DIV0); return Math.floor(x / s + 1e-12) * s; } },
  'FLOOR.MATH': { fn: (a) => { const x = N(a[0]), s = Math.abs(N(opt(a[1], 1))) || 1; return Math.floor(x / s + 1e-12) * s; } },
  EVEN: { fn: (a) => { const x = N(a[0]); const r = Math.ceil(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; } },
  ODD: { fn: (a) => { const x = N(a[0]); let r = Math.ceil(Math.abs(x)); if (r % 2 === 0) r++; return x < 0 ? -r : r; } },
  PI: { fn: () => Math.PI },
  RAND: { volatile: true, fn: () => Math.random() },
  RANDBETWEEN: { volatile: true, fn: (a) => { const lo = Math.ceil(N(a[0])), hi = Math.floor(N(a[1])); return lo + Math.floor(Math.random() * (hi - lo + 1)); } },
  FACT: { fn: (a) => { const n = entier(a[0]); if (n < 0 || n > 170) throw err(ERR.NUM); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; } },
  FACTDOUBLE: { fn: (a) => { const n = entier(a[0]); if (n < 0) throw err(ERR.NUM); let r = 1; for (let i = n; i > 1; i -= 2) r *= i; return r; } },
  COMBIN: { fn: (a) => { const n = entier(a[0]), k = entier(a[1]); if (k < 0 || n < k) throw err(ERR.NUM); return Math.round(Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1))); } },
  PERMUT: { fn: (a) => { const n = entier(a[0]), k = entier(a[1]); if (k < 0 || n < k) throw err(ERR.NUM); return Math.round(Math.exp(lnGamma(n + 1) - lnGamma(n - k + 1))); } },
  GCD: { fn: (a) => nombres(a).map((x) => Math.trunc(Math.abs(x))).reduce((x, y) => { while (y) [x, y] = [y, x % y]; return x; }) },
  LCM: { fn: (a) => nombres(a).map((x) => Math.trunc(Math.abs(x))).reduce((x, y) => { let g = x, h = y; while (h) [g, h] = [h, g % h]; return (x * y) / g; }) },
  SIN: { fn: (a) => Math.sin(N(a[0])) }, COS: { fn: (a) => Math.cos(N(a[0])) }, TAN: { fn: (a) => Math.tan(N(a[0])) },
  ASIN: { fn: (a) => Math.asin(N(a[0])) }, ACOS: { fn: (a) => Math.acos(N(a[0])) }, ATAN: { fn: (a) => Math.atan(N(a[0])) },
  ATAN2: { fn: (a) => Math.atan2(N(a[1]), N(a[0])) },
  SINH: { fn: (a) => Math.sinh(N(a[0])) }, COSH: { fn: (a) => Math.cosh(N(a[0])) }, TANH: { fn: (a) => Math.tanh(N(a[0])) },
  DEGREES: { fn: (a) => N(a[0]) * 180 / Math.PI }, RADIANS: { fn: (a) => N(a[0]) * Math.PI / 180 },
  SUMPRODUCT: { fn: (a) => {
    const ms = a.map(matrice);
    const l = ms[0].length, c = (ms[0][0] || []).length;
    if (ms.some((m) => m.length !== l || (m[0] || []).length !== c)) throw err(ERR.VALEUR);
    let s = 0;
    for (let i = 0; i < l; i++) for (let j = 0; j < c; j++) {
      let p = 1;
      for (const m of ms) { const v = m[i][j]; if (v instanceof ErreurFormule) throw v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; }
      s += p;
    }
    return s;
  } },
  SUMIF: { fn: (a) => {
    const crit = compilerCritere(a[1]);
    const mC = matrice(a[0]);
    let mS = mC;
    if (a[2] !== undefined) mS = a[2] instanceof Plage ? a[2].decaler(0, 0, mC.length, (mC[0] || []).length).matrice() : matrice(a[2]);
    let s = 0;
    for (let i = 0; i < mC.length; i++) for (let j = 0; j < mC[i].length; j++) if (crit(mC[i][j])) { const v = mS[i] && mS[i][j]; if (typeof v === 'number') s += v; }
    return s;
  } },
  SUMIFS: { fn: (a) => {
    const mS = matrice(a[0]);
    const tests = [];
    for (let i = 1; i + 1 < a.length; i += 2) tests.push([matrice(a[i]), compilerCritere(a[i + 1])]);
    let s = 0;
    for (let i = 0; i < mS.length; i++) for (let j = 0; j < mS[i].length; j++) {
      if (tests.every(([m, t]) => m[i] && t(m[i][j]))) { const v = mS[i][j]; if (typeof v === 'number') s += v; }
    }
    return s;
  } },
  COUNTIF: { fn: (a) => { const t = compilerCritere(a[1]); return aplat([a[0]]).filter(t).length; } },
  COUNTIFS: { fn: (a) => {
    const ms = [];
    for (let i = 0; i + 1 < a.length; i += 2) ms.push([matrice(a[i]), compilerCritere(a[i + 1])]);
    const [m0] = ms[0];
    let n = 0;
    for (let i = 0; i < m0.length; i++) for (let j = 0; j < m0[i].length; j++) if (ms.every(([m, t]) => m[i] && t(m[i][j]))) n++;
    return n;
  } },
  AVERAGEIF: { fn: (a) => {
    const crit = compilerCritere(a[1]);
    const mC = matrice(a[0]), mS = a[2] ? matrice(a[2]) : mC;
    let s = 0, n = 0;
    for (let i = 0; i < mC.length; i++) for (let j = 0; j < mC[i].length; j++) if (crit(mC[i][j])) { const v = mS[i] && mS[i][j]; if (typeof v === 'number') { s += v; n++; } }
    if (!n) throw err(ERR.DIV0);
    return s / n;
  } },
  AVERAGEIFS: { fn: (a) => {
    const mS = matrice(a[0]);
    const tests = [];
    for (let i = 1; i + 1 < a.length; i += 2) tests.push([matrice(a[i]), compilerCritere(a[i + 1])]);
    let s = 0, n = 0;
    for (let i = 0; i < mS.length; i++) for (let j = 0; j < mS[i].length; j++) if (tests.every(([m, t]) => m[i] && t(m[i][j]))) { const v = mS[i][j]; if (typeof v === 'number') { s += v; n++; } }
    if (!n) throw err(ERR.DIV0);
    return s / n;
  } },
  MINIFS: { fn: (a) => {
    const mS = matrice(a[0]); const tests = [];
    for (let i = 1; i + 1 < a.length; i += 2) tests.push([matrice(a[i]), compilerCritere(a[i + 1])]);
    let r = Infinity;
    for (let i = 0; i < mS.length; i++) for (let j = 0; j < mS[i].length; j++) if (tests.every(([m, t]) => m[i] && t(m[i][j]))) { const v = mS[i][j]; if (typeof v === 'number') r = Math.min(r, v); }
    return r === Infinity ? 0 : r;
  } },
  MAXIFS: { fn: (a) => {
    const mS = matrice(a[0]); const tests = [];
    for (let i = 1; i + 1 < a.length; i += 2) tests.push([matrice(a[i]), compilerCritere(a[i + 1])]);
    let r = -Infinity;
    for (let i = 0; i < mS.length; i++) for (let j = 0; j < mS[i].length; j++) if (tests.every(([m, t]) => m[i] && t(m[i][j]))) { const v = mS[i][j]; if (typeof v === 'number') r = Math.max(r, v); }
    return r === -Infinity ? 0 : r;
  } },
  SERIESSUM: { fn: (a) => { const x = N(a[0]), n = N(a[1]), m = N(a[2]); const co = nombres([a[3]]); return co.reduce((s, c, i) => s + c * Math.pow(x, n + i * m), 0); } },
  SUMX2MY2: { fn: (a) => { const X = nombres([a[0]]), Y = nombres([a[1]]); if (X.length !== Y.length) throw err(ERR.NA); return X.reduce((s, x, i) => s + x * x - Y[i] * Y[i], 0); } },
  SUMX2PY2: { fn: (a) => { const X = nombres([a[0]]), Y = nombres([a[1]]); if (X.length !== Y.length) throw err(ERR.NA); return X.reduce((s, x, i) => s + x * x + Y[i] * Y[i], 0); } },
  SUMXMY2: { fn: (a) => { const X = nombres([a[0]]), Y = nombres([a[1]]); if (X.length !== Y.length) throw err(ERR.NA); return X.reduce((s, x, i) => s + (x - Y[i]) ** 2, 0); } },
  MMULT: { fn: (a) => {
    const A = matNombres(a[0]), Bm = matNombres(a[1]);
    if (A[0].length !== Bm.length) throw err(ERR.VALEUR);
    return A.map((l) => Bm[0].map((_, j) => l.reduce((s, x, k) => s + x * Bm[k][j], 0)));
  } },
  TRANSPOSE: { fn: (a) => transposer(matrice(a[0])) },
  MINVERSE: { fn: (a) => inverser(matNombres(a[0])) },
  MDETERM: { fn: (a) => determinant(matNombres(a[0])) },
  MUNIT: { fn: (a) => { const n = entier(a[0]); return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); } },
  SUBTOTAL: { fn: (a) => { const code = entier(a[0]) % 100; const noms = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' }; const f = FONCTIONS[noms[code]]; if (!f) throw err(ERR.VALEUR); return f.fn(a.slice(1)); } },
  AGGREGATE: { fn: (a) => { const code = entier(a[0]); const noms = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP', 12: 'MEDIAN', 14: 'LARGE', 15: 'SMALL' }; const f = FONCTIONS[noms[code]]; if (!f) throw err(ERR.VALEUR); return f.fn(a.slice(2)); } },

  // ----- Statistiques -----
  AVERAGE: { fn: (a) => { const v = nombres(a); if (!v.length) throw err(ERR.DIV0); return v.reduce((x, y) => x + y, 0) / v.length; } },
  AVERAGEA: { fn: (a) => { const v = aplat(a).filter((x) => x != null && x !== '').map((x) => typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0); if (!v.length) throw err(ERR.DIV0); return v.reduce((x, y) => x + y, 0) / v.length; } },
  MEDIAN: { fn: (a) => { const v = nombres(a); if (!v.length) throw err(ERR.NUM); return quantile(v, 0.5, false); } },
  MODE: { fn: (a) => { const v = nombres(a); const cnt = new Map(); let best = null, bn = 1; for (const x of v) { const n = (cnt.get(x) || 0) + 1; cnt.set(x, n); if (n > bn) { bn = n; best = x; } } if (best === null) throw err(ERR.NA); return best; } },
  'MODE.SNGL': { fn: (a) => FONCTIONS.MODE.fn(a) },
  MIN: { fn: (a) => { const v = nombres(a); return v.length ? Math.min(...v) : 0; } },
  MAX: { fn: (a) => { const v = nombres(a); return v.length ? Math.max(...v) : 0; } },
  MINA: { fn: (a) => { const v = aplat(a).filter((x) => x != null && x !== '').map((x) => typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0); return v.length ? Math.min(...v) : 0; } },
  MAXA: { fn: (a) => { const v = aplat(a).filter((x) => x != null && x !== '').map((x) => typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0); return v.length ? Math.max(...v) : 0; } },
  COUNT: { fn: (a) => { let n = 0; for (const x of a) { if (x instanceof Plage || Array.isArray(x)) { for (const v of aplat([x])) if (typeof v === 'number') n++; } else { try { versNombre(x); if (x !== null && x !== '') n++; } catch { /* non numérique */ } } } return n; } },
  COUNTA: { fn: (a) => aplat(a).filter((x) => x != null && x !== '').length },
  COUNTBLANK: { fn: (a) => aplat(a).filter((x) => x == null || x === '').length },
  LARGE: { fn: (a) => { const v = nombres([a[0]]).sort((x, y) => y - x); const k = entier(a[1]); if (k < 1 || k > v.length) throw err(ERR.NUM); return v[k - 1]; } },
  SMALL: { fn: (a) => { const v = nombres([a[0]]).sort((x, y) => x - y); const k = entier(a[1]); if (k < 1 || k > v.length) throw err(ERR.NUM); return v[k - 1]; } },
  RANK: { fn: (a) => { const x = N(a[0]); const v = nombres([a[1]]); const asc = a[2] !== undefined && B(a[2]); if (!v.includes(x)) throw err(ERR.NA); return 1 + v.filter((y) => (asc ? y < x : y > x)).length; } },
  'RANK.EQ': { fn: (a) => FONCTIONS.RANK.fn(a) },
  'RANK.AVG': { fn: (a) => { const x = N(a[0]); const v = nombres([a[1]]); const asc = a[2] !== undefined && B(a[2]); const n = v.filter((y) => y === x).length; if (!n) throw err(ERR.NA); const r = 1 + v.filter((y) => (asc ? y < x : y > x)).length; return r + (n - 1) / 2; } },
  PERCENTILE: { fn: (a) => quantile(nombres([a[0]]), N(a[1]), false) },
  'PERCENTILE.INC': { fn: (a) => quantile(nombres([a[0]]), N(a[1]), false) },
  'PERCENTILE.EXC': { fn: (a) => quantile(nombres([a[0]]), N(a[1]), true) },
  QUARTILE: { fn: (a) => quantile(nombres([a[0]]), entier(a[1]) / 4, false) },
  'QUARTILE.INC': { fn: (a) => quantile(nombres([a[0]]), entier(a[1]) / 4, false) },
  'QUARTILE.EXC': { fn: (a) => quantile(nombres([a[0]]), entier(a[1]) / 4, true) },
  PERCENTRANK: { fn: (a) => { const v = nombres([a[0]]).sort((x, y) => x - y), x = N(a[1]); const n = v.length; if (x < v[0] || x > v[n - 1]) throw err(ERR.NA); let i = 0; while (i < n - 1 && v[i + 1] <= x) i++; if (v[i] === x) return i / (n - 1); const lo = v[i], hi = v[i + 1]; return (i + (x - lo) / (hi - lo)) / (n - 1); } },
  VAR: { fn: (a) => variance(nombres(a), false) }, 'VAR.S': { fn: (a) => variance(nombres(a), false) },
  VARP: { fn: (a) => variance(nombres(a), true) }, 'VAR.P': { fn: (a) => variance(nombres(a), true) },
  STDEV: { fn: (a) => Math.sqrt(variance(nombres(a), false)) }, 'STDEV.S': { fn: (a) => Math.sqrt(variance(nombres(a), false)) },
  STDEVP: { fn: (a) => Math.sqrt(variance(nombres(a), true)) }, 'STDEV.P': { fn: (a) => Math.sqrt(variance(nombres(a), true)) },
  DEVSQ: { fn: (a) => { const v = nombres(a); const m = v.reduce((x, y) => x + y, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 2, 0); } },
  AVEDEV: { fn: (a) => { const v = nombres(a); const m = v.reduce((x, y) => x + y, 0) / v.length; return v.reduce((s, x) => s + Math.abs(x - m), 0) / v.length; } },
  GEOMEAN: { fn: (a) => { const v = nombres(a); if (v.some((x) => x <= 0)) throw err(ERR.NUM); return Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length); } },
  HARMEAN: { fn: (a) => { const v = nombres(a); if (v.some((x) => x <= 0)) throw err(ERR.NUM); return v.length / v.reduce((s, x) => s + 1 / x, 0); } },
  TRIMMEAN: { fn: (a) => { const v = nombres([a[0]]).sort((x, y) => x - y); const p = N(a[1]); const k = Math.floor(v.length * p / 2); const t = v.slice(k, v.length - k); return t.reduce((x, y) => x + y, 0) / t.length; } },
  SKEW: { fn: (a) => { const v = nombres(a), n = v.length; if (n < 3) throw err(ERR.DIV0); const m = v.reduce((x, y) => x + y, 0) / n; const s = Math.sqrt(variance(v, false)); return n / ((n - 1) * (n - 2)) * v.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0); } },
  KURT: { fn: (a) => { const v = nombres(a), n = v.length; if (n < 4) throw err(ERR.DIV0); const m = v.reduce((x, y) => x + y, 0) / n; const s = Math.sqrt(variance(v, false)); const s4 = v.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0); return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * s4 - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)); } },
  CORREL: { fn: (a) => { const s = statsXY(a[0], a[1]); if (!s.sxx || !s.syy) throw err(ERR.DIV0); return s.sxy / Math.sqrt(s.sxx * s.syy); } },
  PEARSON: { fn: (a) => FONCTIONS.CORREL.fn(a) },
  RSQ: { fn: (a) => FONCTIONS.CORREL.fn(a) ** 2 },
  'COVARIANCE.P': { fn: (a) => { const s = statsXY(a[0], a[1]); return s.sxy / s.n; } },
  'COVARIANCE.S': { fn: (a) => { const s = statsXY(a[0], a[1]); return s.sxy / (s.n - 1); } },
  COVAR: { fn: (a) => FONCTIONS['COVARIANCE.P'].fn(a) },
  SLOPE: { fn: (a) => { const s = statsXY(a[0], a[1]); if (!s.sxx) throw err(ERR.DIV0); return s.sxy / s.sxx; } },
  INTERCEPT: { fn: (a) => { const s = statsXY(a[0], a[1]); if (!s.sxx) throw err(ERR.DIV0); return s.my - (s.sxy / s.sxx) * s.mx; } },
  FORECAST: { fn: (a) => { const s = statsXY(a[1], a[2]); if (!s.sxx) throw err(ERR.DIV0); const b = s.sxy / s.sxx; return s.my - b * s.mx + b * N(a[0]); } },
  'FORECAST.LINEAR': { fn: (a) => FONCTIONS.FORECAST.fn(a) },
  STEYX: { fn: (a) => { const s = statsXY(a[0], a[1]); if (s.n < 3) throw err(ERR.DIV0); return Math.sqrt((s.syy - s.sxy * s.sxy / s.sxx) / (s.n - 2)); } },
  STANDARDIZE: { fn: (a) => { const s = N(a[2]); if (s <= 0) throw err(ERR.NUM); return (N(a[0]) - N(a[1])) / s; } },
  FREQUENCY: { fn: (a) => { const d = nombres([a[0]]), b = nombres([a[1]]).sort((x, y) => x - y); const out = Array(b.length + 1).fill(0); for (const x of d) { let i = 0; while (i < b.length && x > b[i]) i++; out[i]++; } return out.map((x) => [x]); } },
  'NORM.S.DIST': { fn: (a) => { const z = N(a[0]); return (a[1] === undefined || B(a[1])) ? normSDist(z) : normSPdf(z); } },
  NORMSDIST: { fn: (a) => normSDist(N(a[0])) },
  'NORM.DIST': { fn: (a) => { const x = N(a[0]), m = N(a[1]), s = N(a[2]); if (s <= 0) throw err(ERR.NUM); return B(a[3]) ? normSDist((x - m) / s) : normSPdf((x - m) / s) / s; } },
  NORMDIST: { fn: (a) => FONCTIONS['NORM.DIST'].fn(a) },
  'NORM.S.INV': { fn: (a) => normSInv(N(a[0])) },
  NORMSINV: { fn: (a) => normSInv(N(a[0])) },
  'NORM.INV': { fn: (a) => { const s = N(a[2]); if (s <= 0) throw err(ERR.NUM); return N(a[1]) + s * normSInv(N(a[0])); } },
  NORMINV: { fn: (a) => FONCTIONS['NORM.INV'].fn(a) },
  PHI: { fn: (a) => normSPdf(N(a[0])) },
  GAUSS: { fn: (a) => normSDist(N(a[0])) - 0.5 },
  'LOGNORM.DIST': { fn: (a) => { const x = N(a[0]), m = N(a[1]), s = N(a[2]); if (x <= 0 || s <= 0) throw err(ERR.NUM); const z = (Math.log(x) - m) / s; return B(a[3]) ? normSDist(z) : normSPdf(z) / (x * s); } },
  LOGNORMDIST: { fn: (a) => FONCTIONS['LOGNORM.DIST'].fn([a[0], a[1], a[2], true]) },
  'LOGNORM.INV': { fn: (a) => Math.exp(N(a[1]) + N(a[2]) * normSInv(N(a[0]))) },
  'EXPON.DIST': { fn: (a) => { const x = N(a[0]), l = N(a[1]); if (x < 0 || l <= 0) throw err(ERR.NUM); return B(a[2]) ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x); } },
  EXPONDIST: { fn: (a) => FONCTIONS['EXPON.DIST'].fn(a) },
  'POISSON.DIST': { fn: (a) => { const k = Math.floor(N(a[0])), l = N(a[1]); if (k < 0 || l < 0) throw err(ERR.NUM); const p = (i) => Math.exp(-l + i * Math.log(l) - lnGamma(i + 1)); if (!B(a[2])) return l === 0 ? (k === 0 ? 1 : 0) : p(k); let s = 0; for (let i = 0; i <= k; i++) s += l === 0 ? (i === 0 ? 1 : 0) : p(i); return Math.min(1, s); } },
  POISSON: { fn: (a) => FONCTIONS['POISSON.DIST'].fn(a) },
  'BINOM.DIST': { fn: (a) => { const k = Math.floor(N(a[0])), n = Math.floor(N(a[1])), p = N(a[2]); if (k < 0 || k > n || p < 0 || p > 1) throw err(ERR.NUM); const pm = (i) => Math.exp(lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(n - i + 1) + (i ? i * Math.log(p) : 0) + (n - i ? (n - i) * Math.log(1 - p) : 0)); if (!B(a[3])) return pm(k); let s = 0; for (let i = 0; i <= k; i++) s += pm(i); return Math.min(1, s); } },
  BINOMDIST: { fn: (a) => FONCTIONS['BINOM.DIST'].fn(a) },
  'GAMMA.DIST': { fn: (a) => { const x = N(a[0]), al = N(a[1]), be = N(a[2]); if (x < 0 || al <= 0 || be <= 0) throw err(ERR.NUM); if (B(a[3])) return gammaIncReg(al, x / be); return Math.exp((al - 1) * Math.log(x) - x / be - lnGamma(al) - al * Math.log(be)); } },
  GAMMADIST: { fn: (a) => FONCTIONS['GAMMA.DIST'].fn(a) },
  'CHISQ.DIST': { fn: (a) => { const x = N(a[0]), k = N(a[1]); if (x < 0 || k < 1) throw err(ERR.NUM); if (B(a[2])) return gammaIncReg(k / 2, x / 2); return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - lnGamma(k / 2) - (k / 2) * Math.LN2); } },
  'CHISQ.DIST.RT': { fn: (a) => 1 - gammaIncReg(N(a[1]) / 2, N(a[0]) / 2) },
  CHIDIST: { fn: (a) => 1 - gammaIncReg(N(a[1]) / 2, N(a[0]) / 2) },
  'T.DIST': { fn: (a) => { const t = N(a[0]), k = N(a[1]); const x = k / (k + t * t); const cdf = t >= 0 ? 1 - 0.5 * betaIncReg(k / 2, 0.5, x) : 0.5 * betaIncReg(k / 2, 0.5, x); if (B(a[2])) return cdf; return Math.exp(lnGamma((k + 1) / 2) - lnGamma(k / 2)) / Math.sqrt(k * Math.PI) * Math.pow(1 + t * t / k, -(k + 1) / 2); } },
  'T.DIST.2T': { fn: (a) => { const t = Math.abs(N(a[0])), k = N(a[1]); return betaIncReg(k / 2, 0.5, k / (k + t * t)); } },
  'T.DIST.RT': { fn: (a) => 1 - FONCTIONS['T.DIST'].fn([a[0], a[1], true]) },
  TDIST: { fn: (a) => { const t = Math.abs(N(a[0])), k = N(a[1]), q = entier(a[2]); const p2 = betaIncReg(k / 2, 0.5, k / (k + t * t)); return q === 1 ? p2 / 2 : p2; } },
  'BETA.DIST': { fn: (a) => { const x = N(a[0]), al = N(a[1]), be = N(a[2]); const A = a[4] !== undefined ? N(a[4]) : 0, Bb = a[5] !== undefined ? N(a[5]) : 1; const u = (x - A) / (Bb - A); if (B(a[3])) return betaIncReg(al, be, u); return Math.exp((al - 1) * Math.log(u) + (be - 1) * Math.log(1 - u) + lnGamma(al + be) - lnGamma(al) - lnGamma(be)) / (Bb - A); } },
  'WEIBULL.DIST': { fn: (a) => { const x = N(a[0]), k = N(a[1]), l = N(a[2]); if (x < 0 || k <= 0 || l <= 0) throw err(ERR.NUM); return B(a[3]) ? 1 - Math.exp(-Math.pow(x / l, k)) : (k / l) * Math.pow(x / l, k - 1) * Math.exp(-Math.pow(x / l, k)); } },
  WEIBULL: { fn: (a) => FONCTIONS['WEIBULL.DIST'].fn(a) },
  GAMMALN: { fn: (a) => { const x = N(a[0]); if (x <= 0) throw err(ERR.NUM); return lnGamma(x); } },
  'GAMMALN.PRECISE': { fn: (a) => lnGamma(N(a[0])) },
  GAMMA: { fn: (a) => { const x = N(a[0]); if (x === 0 || (x < 0 && Number.isInteger(x))) throw err(ERR.NUM); const g = Math.exp(lnGamma(x)); return x < 0 && Math.floor(x) % 2 !== 0 ? -g : g; } },
  ERF: { fn: (a) => a[1] === undefined ? erf(N(a[0])) : erf(N(a[1])) - erf(N(a[0])) },
  ERFC: { fn: (a) => erfc(N(a[0])) },
  'CONFIDENCE.NORM': { fn: (a) => normSInv(1 - N(a[0]) / 2) * N(a[1]) / Math.sqrt(N(a[2])) },
  CONFIDENCE: { fn: (a) => FONCTIONS['CONFIDENCE.NORM'].fn(a) },

  // ----- Finance -----
  PV: { fn: (a) => { const r = N(a[0]), n = N(a[1]), p = N(a[2]), fv = N(opt(a[3], 0)), t = N(opt(a[4], 0)) ? 1 : 0; if (r === 0) return -(p * n + fv); const k = Math.pow(1 + r, n); return -(fv + p * (1 + r * t) * (k - 1) / r) / k; } },
  FV: { fn: (a) => { const r = N(a[0]), n = N(a[1]), p = N(a[2]), pv = N(opt(a[3], 0)), t = N(opt(a[4], 0)) ? 1 : 0; return -vanAnnuite(r, n, p, pv, 0, t); } },
  PMT: { fn: (a) => { const r = N(a[0]), n = N(a[1]), pv = N(a[2]), fv = N(opt(a[3], 0)), t = N(opt(a[4], 0)) ? 1 : 0; if (n === 0) throw err(ERR.NUM); if (r === 0) return -(pv + fv) / n; const k = Math.pow(1 + r, n); return -(pv * k + fv) * r / ((1 + r * t) * (k - 1)); } },
  NPER: { fn: (a) => { const r = N(a[0]), p = N(a[1]), pv = N(a[2]), fv = N(opt(a[3], 0)), t = N(opt(a[4], 0)) ? 1 : 0; if (r === 0) { if (p === 0) throw err(ERR.NUM); return -(pv + fv) / p; } const q = p * (1 + r * t) / r; const x = (q - fv) / (pv + q); if (x <= 0) throw err(ERR.NUM); return Math.log(x) / Math.log(1 + r); } },
  RATE: { fn: (a) => { const n = N(a[0]), p = N(a[1]), pv = N(a[2]), fv = N(opt(a[3], 0)), t = N(opt(a[4], 0)) ? 1 : 0, g = N(opt(a[5], 0.1)); return resoudre((r) => vanAnnuite(r, n, p, pv, fv, t), g); } },
  IPMT: { fn: (a) => { const r = N(a[0]), per = N(a[1]), n = N(a[2]), pv = N(a[3]), fv = N(opt(a[4], 0)), t = N(opt(a[5], 0)) ? 1 : 0; if (per < 1 || per > n) throw err(ERR.NUM); const pmt = FONCTIONS.PMT.fn([r, n, pv, fv, t]); let i = -vanAnnuite(r, per - 1, pmt, pv, 0, t) * r; if (t === 1) { if (per === 1) return 0; i = -(vanAnnuite(r, per - 2, pmt, pv, 0, t) + pmt) * r; } return i; } },
  PPMT: { fn: (a) => { const r = N(a[0]), per = N(a[1]), n = N(a[2]), pv = N(a[3]), fv = N(opt(a[4], 0)), t = N(opt(a[5], 0)) ? 1 : 0; return FONCTIONS.PMT.fn([r, n, pv, fv, t]) - FONCTIONS.IPMT.fn([r, per, n, pv, fv, t]); } },
  CUMIPMT: { fn: (a) => { const r = N(a[0]), n = N(a[1]), pv = N(a[2]), d = entier(a[3]), f = entier(a[4]), t = N(a[5]) ? 1 : 0; let s = 0; for (let p = d; p <= f; p++) s += FONCTIONS.IPMT.fn([r, p, n, pv, 0, t]); return s; } },
  CUMPRINC: { fn: (a) => { const r = N(a[0]), n = N(a[1]), pv = N(a[2]), d = entier(a[3]), f = entier(a[4]), t = N(a[5]) ? 1 : 0; let s = 0; for (let p = d; p <= f; p++) s += FONCTIONS.PPMT.fn([r, p, n, pv, 0, t]); return s; } },
  NPV: { fn: (a) => { const r = N(a[0]); const flux = nombres(a.slice(1)); return flux.reduce((s, f, i) => s + f / Math.pow(1 + r, i + 1), 0); } },
  IRR: { fn: (a) => { const flux = nombres([a[0]]); const g = N(opt(a[1], 0.1)); if (!flux.some((f) => f > 0) || !flux.some((f) => f < 0)) throw err(ERR.NUM); return resoudre((r) => flux.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0), g); } },
  MIRR: { fn: (a) => { const flux = nombres([a[0]]), rf = N(a[1]), rr = N(a[2]); const n = flux.length; const neg = flux.reduce((s, f, i) => s + (f < 0 ? f / Math.pow(1 + rf, i) : 0), 0); const pos = flux.reduce((s, f, i) => s + (f > 0 ? f * Math.pow(1 + rr, n - 1 - i) : 0), 0); if (!neg || !pos) throw err(ERR.DIV0); return Math.pow(-pos / neg, 1 / (n - 1)) - 1; } },
  XNPV: { fn: (a) => { const r = N(a[0]); const flux = nombres([a[1]]), dates = nombres([a[2]]); if (flux.length !== dates.length) throw err(ERR.NUM); const d0 = dates[0]; return flux.reduce((s, f, i) => s + f / Math.pow(1 + r, (dates[i] - d0) / 365), 0); } },
  XIRR: { fn: (a) => { const flux = nombres([a[0]]), dates = nombres([a[1]]); const g = N(opt(a[2], 0.1)); if (flux.length !== dates.length) throw err(ERR.NUM); const d0 = dates[0]; return resoudre((r) => flux.reduce((s, f, i) => s + f / Math.pow(1 + r, (dates[i] - d0) / 365), 0), g); } },
  EFFECT: { fn: (a) => { const r = N(a[0]), n = Math.trunc(N(a[1])); if (r <= 0 || n < 1) throw err(ERR.NUM); return Math.pow(1 + r / n, n) - 1; } },
  NOMINAL: { fn: (a) => { const r = N(a[0]), n = Math.trunc(N(a[1])); if (r <= 0 || n < 1) throw err(ERR.NUM); return n * (Math.pow(1 + r, 1 / n) - 1); } },
  RRI: { fn: (a) => Math.pow(N(a[2]) / N(a[1]), 1 / N(a[0])) - 1 },
  PDURATION: { fn: (a) => Math.log(N(a[2]) / N(a[1])) / Math.log(1 + N(a[0])) },
  FVSCHEDULE: { fn: (a) => nombres([a[1]]).reduce((v, r) => v * (1 + r), N(a[0])) },
  SLN: { fn: (a) => { const d = N(a[2]); if (d === 0) throw err(ERR.DIV0); return (N(a[0]) - N(a[1])) / d; } },
  SYD: { fn: (a) => { const c = N(a[0]), s = N(a[1]), n = N(a[2]), p = N(a[3]); return (c - s) * (n - p + 1) * 2 / (n * (n + 1)); } },
  DB: { fn: (a) => { const c = N(a[0]), s = N(a[1]), n = N(a[2]), p = N(a[3]), m = N(opt(a[4], 12)); const taux = Math.round((1 - Math.pow(s / c, 1 / n)) * 1000) / 1000; let val = c, amort = 0; for (let i = 1; i <= p; i++) { amort = i === 1 ? val * taux * m / 12 : (i === n + 1 ? val * taux * (12 - m) / 12 : val * taux); val -= amort; } return amort; } },
  DDB: { fn: (a) => { const c = N(a[0]), s = N(a[1]), n = N(a[2]), p = N(a[3]), f = N(opt(a[4], 2)); let val = c, amort = 0; for (let i = 1; i <= p; i++) { amort = Math.min(val * f / n, Math.max(0, val - s)); val -= amort; } return amort; } },

  // ----- Recherche -----
  VLOOKUP: { fn: (a) => rechercheV(a[0], a[1], a[2], a[3] === undefined ? true : B(a[3]), false) },
  HLOOKUP: { fn: (a) => rechercheV(a[0], a[1], a[2], a[3] === undefined ? true : B(a[3]), true) },
  LOOKUP: { fn: (a) => { const i = equiv(a[0], a[1], 1); const res = a[2] ? aplat([a[2]]) : aplat([a[1]]); return res[i - 1] ?? null; } },
  XLOOKUP: { fn: (a) => { const cle = aplat([a[1]]), res = matrice(a[2]); const val = scal(a[0]); let i = -1; const mode = a[4] === undefined ? 0 : entier(a[4]); if (mode === 0) { const t = compilerCritere(val); i = cle.findIndex(t); } else { let best = null; for (let k = 0; k < cle.length; k++) { if (cle[k] == null) continue; let c; try { c = comparer(cle[k], val); } catch { continue; } if (c === 0) { i = k; break; } if (mode === -1 && c < 0 && (best === null || comparer(cle[k], cle[best]) > 0)) best = k; if (mode === 1 && c > 0 && (best === null || comparer(cle[k], cle[best]) < 0)) best = k; } if (i < 0 && best !== null) i = best; } if (i < 0) { if (a[3] !== undefined && !(a[3] && a[3].k === 'vide')) return scal(a[3]); throw err(ERR.NA); } if (res.length === cle.length) return res[i].length === 1 ? res[i][0] : [res[i]]; return res.map((l) => [l[i]]); } },
  MATCH: { fn: (a) => equiv(a[0], a[1], a[2]) },
  XMATCH: { fn: (a) => equiv(a[0], a[1], a[2] === undefined ? 0 : a[2]) },
  INDEX: { fn: (a) => {
    const m = matrice(a[0]);
    const r = a[1] === undefined ? 0 : entier(a[1]), c = a[2] === undefined ? 0 : entier(a[2]);
    if (a[0] instanceof Plage) {
      const p = a[0];
      if (r === 0 && c === 0) return p;
      if (r === 0) return new Plage(p.ctx, p.feuille, p.r1, p.c1 + c - 1, p.r2, p.c1 + c - 1);
      if (c === 0) { if (p.lignes === 1 && m[0].length > 1) return new Plage(p.ctx, p.feuille, p.r1, p.c1 + r - 1, p.r1, p.c1 + r - 1); return new Plage(p.ctx, p.feuille, p.r1 + r - 1, p.c1, p.r1 + r - 1, p.c2); }
      if (r > p.lignes || c > p.colonnes) throw err(ERR.REF);
      return new Plage(p.ctx, p.feuille, p.r1 + r - 1, p.c1 + c - 1, p.r1 + r - 1, p.c1 + c - 1);
    }
    if (r === 0 && c === 0) return m;
    if (m.length === 1 && c === 0) return m[0][r - 1];
    if (r === 0) return m.length === 1 ? m[0][c - 1] : m.map((l) => [l[c - 1]]);
    if (c === 0) return m[0].length === 1 ? m[r - 1][0] : [m[r - 1]];
    const v = m[r - 1] && m[r - 1][c - 1];
    if (v === undefined) throw err(ERR.REF);
    return v;
  } },
  OFFSET: { fn: (a) => { const p = a[0]; if (!(p instanceof Plage)) throw err(ERR.VALEUR); const nl = a[3] === undefined || (a[3] && a[3].k === 'vide') ? undefined : entier(a[3]); const nc = a[4] === undefined || (a[4] && a[4].k === 'vide') ? undefined : entier(a[4]); return p.decaler(entier(a[1]), entier(a[2]), nl, nc); } },
  ROW: { fn: (a, ctx) => (a.length && a[0] instanceof Plage ? (a[0].lignes === 1 ? a[0].r1 + 1 : Array.from({ length: a[0].lignes }, (_, i) => [a[0].r1 + 1 + i])) : ctx.courant.r + 1) },
  COLUMN: { fn: (a, ctx) => (a.length && a[0] instanceof Plage ? (a[0].colonnes === 1 ? a[0].c1 + 1 : [Array.from({ length: a[0].colonnes }, (_, i) => a[0].c1 + 1 + i)]) : ctx.courant.c + 1) },
  ROWS: { fn: (a) => (a[0] instanceof Plage ? a[0].lignes : matrice(a[0]).length) },
  COLUMNS: { fn: (a) => (a[0] instanceof Plage ? a[0].colonnes : (matrice(a[0])[0] || []).length) },
  ADDRESS: { fn: (a) => { const r = entier(a[0]) - 1, c = entier(a[1]) - 1, mode = a[2] === undefined ? 1 : entier(a[2]); const f = a[4] !== undefined ? S(a[4]) : null; const s = adresse(r, c, mode === 1 || mode === 2, mode === 1 || mode === 3); return f ? (/[^\w]/.test(f) ? `'${f}'!` : f + '!') + s : s; } },
  INDIRECT: { fn: (a, ctx) => { const s = S(a[0]); const toks = tokeniser(s); if (toks.length !== 1 || toks[0].t !== T.REF) throw err(ERR.REF); return ctx.plageDepuisToken(toks[0]); } },
  AREAS: { fn: () => 1 },
  HYPERLINK: { fn: (a) => (a.length > 1 ? scal(a[1]) : S(a[0])) },
  UNIQUE: { fn: (a) => { const m = matrice(a[0]); const vus = []; for (const l of m) if (!vus.some((v) => v.length === l.length && v.every((x, i) => comparer(x, l[i]) === 0))) vus.push(l); return vus; } },
  SORT: { fn: (a) => { const m = matrice(a[0]).map((l) => [...l]); const col = a[1] === undefined ? 0 : entier(a[1]) - 1; const ordre = a[2] === undefined ? 1 : entier(a[2]); return m.sort((x, y) => ordre * comparer(x[col], y[col])); } },
  FILTER: { fn: (a) => { const m = matrice(a[0]), crit = aplat([a[1]]); const out = m.filter((_, i) => B(crit[i])); if (!out.length) { if (a[2] !== undefined) return scal(a[2]); throw err(ERR.VALEUR); } return out; } },
  SEQUENCE: { fn: (a) => { const l = entier(a[0]), c = a[1] === undefined ? 1 : entier(a[1]), d = a[2] === undefined ? 1 : N(a[2]), p = a[3] === undefined ? 1 : N(a[3]); return Array.from({ length: l }, (_, i) => Array.from({ length: c }, (_, j) => d + (i * c + j) * p)); } },

  // ----- Texte -----
  CONCATENATE: { fn: (a) => a.map((x) => S(x)).join('') },
  CONCAT: { fn: (a) => aplat(a).map((x) => (x == null ? '' : versTexte(x))).join('') },
  TEXTJOIN: { fn: (a) => { const sep = S(a[0]), vide = B(a[1]); return aplat(a.slice(2)).filter((x) => !vide || (x != null && x !== '')).map((x) => (x == null ? '' : versTexte(x))).join(sep); } },
  LEFT: { fn: (a) => S(a[0]).slice(0, Math.max(0, entier(opt(a[1], 1)))) },
  RIGHT: { fn: (a) => { const s = S(a[0]), n = Math.max(0, entier(opt(a[1], 1))); return n ? s.slice(-n) : ''; } },
  MID: { fn: (a) => { const s = S(a[0]), d = entier(a[1]), n = entier(a[2]); if (d < 1 || n < 0) throw err(ERR.VALEUR); return s.substr(d - 1, n); } },
  LEN: { fn: (a) => S(a[0]).length },
  UPPER: { fn: (a) => S(a[0]).toUpperCase() },
  LOWER: { fn: (a) => S(a[0]).toLowerCase() },
  PROPER: { fn: (a) => S(a[0]).toLowerCase().replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase()) },
  TRIM: { fn: (a) => S(a[0]).trim().replace(/\s+/g, ' ') },
  CLEAN: { fn: (a) => S(a[0]).replace(/[\x00-\x1F]/g, '') },
  VALUE: { fn: (a) => N(a[0]) },
  NUMBERVALUE: { fn: (a) => { let s = S(a[0]); const dec = a[1] !== undefined ? S(a[1]) : '.', grp = a[2] !== undefined ? S(a[2]) : ','; s = s.split(grp).join('').replace(dec, '.').replace(/\s/g, ''); return N(s); } },
  TEXT: { fn: (a) => texteFormat(a[0], S(a[1])) },
  FIXED: { fn: (a) => formaterNombre(N(a[0]), (a[2] !== undefined && B(a[2]) ? '0' : '#,##0') + (entier(opt(a[1], 2)) > 0 ? '.' + '0'.repeat(entier(opt(a[1], 2))) : '')) },
  DOLLAR: { fn: (a) => formaterNombre(N(a[0]), '#,##0.' + '0'.repeat(entier(opt(a[1], 2))) + ' €') },
  FIND: { fn: (a) => { const i = S(a[1]).indexOf(S(a[0]), entier(opt(a[2], 1)) - 1); if (i < 0) throw err(ERR.VALEUR); return i + 1; } },
  SEARCH: { fn: (a) => { const motif = S(a[0]).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~?\*/g, '.*').replace(/~?\?/g, '.'); const s = S(a[1]); const d = entier(opt(a[2], 1)) - 1; const m = new RegExp(motif, 'i').exec(s.slice(d)); if (!m) throw err(ERR.VALEUR); return d + m.index + 1; } },
  SUBSTITUTE: { fn: (a) => { const s = S(a[0]), anc = S(a[1]), nouv = S(a[2]); if (!anc) return s; if (a[3] === undefined) return s.split(anc).join(nouv); const k = entier(a[3]); let i = -1, n = 0; while ((i = s.indexOf(anc, i + 1)) >= 0) { if (++n === k) return s.slice(0, i) + nouv + s.slice(i + anc.length); } return s; } },
  REPLACE: { fn: (a) => { const s = S(a[0]), d = entier(a[1]), n = entier(a[2]); return s.slice(0, d - 1) + S(a[3]) + s.slice(d - 1 + n); } },
  REPT: { fn: (a) => S(a[0]).repeat(Math.max(0, entier(a[1]))) },
  EXACT: { fn: (a) => S(a[0]) === S(a[1]) },
  CHAR: { fn: (a) => String.fromCharCode(entier(a[0])) },
  CODE: { fn: (a) => { const s = S(a[0]); if (!s) throw err(ERR.VALEUR); return s.charCodeAt(0); } },
  UNICHAR: { fn: (a) => String.fromCodePoint(entier(a[0])) },
  UNICODE: { fn: (a) => { const s = S(a[0]); if (!s) throw err(ERR.VALEUR); return s.codePointAt(0); } },
  T: { fn: (a) => { const v = scal(a[0]); return typeof v === 'string' ? v : ''; } },
  TEXTBEFORE: { fn: (a) => { const s = S(a[0]), d = S(a[1]); const i = s.indexOf(d); if (i < 0) throw err(ERR.NA); return s.slice(0, i); } },
  TEXTAFTER: { fn: (a) => { const s = S(a[0]), d = S(a[1]); const i = s.indexOf(d); if (i < 0) throw err(ERR.NA); return s.slice(i + d.length); } },
  TEXTSPLIT: { fn: (a) => { const s = S(a[0]), d = S(a[1]); return [s.split(d)]; } },

  // ----- Dates -----
  TODAY: { volatile: true, fn: () => { const d = new Date(); return serie(d.getFullYear(), d.getMonth() + 1, d.getDate()); } },
  NOW: { volatile: true, fn: () => { const d = new Date(); return serie(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; } },
  DATE: { fn: (a) => { let an = entier(a[0]); if (an < 1900) an += 1900; return serie(an, entier(a[1]), entier(a[2])); } },
  DATEVALUE: { fn: (a) => { const s = S(a[0]); let m; if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) { let an = +m[3]; if (an < 100) an += an < 30 ? 2000 : 1900; return serie(an, +m[2], +m[1]); } if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return serie(+m[1], +m[2], +m[3]); throw err(ERR.VALEUR); } },
  TIME: { fn: (a) => ((entier(a[0]) * 3600 + entier(a[1]) * 60 + entier(a[2])) % 86400) / 86400 },
  YEAR: { fn: (a) => dateUTC(N(a[0])).a },
  MONTH: { fn: (a) => dateUTC(N(a[0])).m },
  DAY: { fn: (a) => dateUTC(N(a[0])).j },
  HOUR: { fn: (a) => Math.floor((N(a[0]) % 1) * 24) },
  MINUTE: { fn: (a) => Math.floor(((N(a[0]) % 1) * 1440) % 60) },
  SECOND: { fn: (a) => Math.round(((N(a[0]) % 1) * 86400) % 60) },
  WEEKDAY: { fn: (a) => { const d = dateUTC(N(a[0])).d.getUTCDay(); const t = entier(opt(a[1], 1)); if (t === 1) return d + 1; if (t === 2 || t === 11) return ((d + 6) % 7) + 1; if (t === 3) return (d + 6) % 7; return d + 1; } },
  WEEKNUM: { fn: (a) => { const s = N(a[0]); const { a: an } = dateUTC(s); const j1 = serie(an, 1, 1); const d1 = dateUTC(j1).d.getUTCDay(); return Math.floor((s - j1 + d1) / 7) + 1; } },
  ISOWEEKNUM: { fn: (a) => { const d = dateUTC(N(a[0])).d; const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const jour = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - jour); const an1 = Date.UTC(t.getUTCFullYear(), 0, 1); return Math.ceil(((t - an1) / 86400000 + 1) / 7); } },
  DAYS: { fn: (a) => Math.floor(N(a[0])) - Math.floor(N(a[1])) },
  DAYS360: { fn: (a) => Math.round(fractionAnnee(N(a[0]), N(a[1]), a[2] !== undefined && B(a[2]) ? 4 : 0) * 360) * (N(a[1]) < N(a[0]) ? -1 : 1) },
  EDATE: { fn: (a) => { const d = dateUTC(N(a[0])); const m = entier(a[1]); const tot = d.m - 1 + m; const an = d.a + Math.floor(tot / 12), mo = ((tot % 12) + 12) % 12 + 1; return serie(an, mo, Math.min(d.j, joursDansMois(an, mo))); } },
  EOMONTH: { fn: (a) => { const d = dateUTC(N(a[0])); const m = entier(a[1]); const tot = d.m - 1 + m; const an = d.a + Math.floor(tot / 12), mo = ((tot % 12) + 12) % 12 + 1; return serie(an, mo, joursDansMois(an, mo)); } },
  YEARFRAC: { fn: (a) => fractionAnnee(N(a[0]), N(a[1]), entier(opt(a[2], 0))) },
  DATEDIF: { fn: (a) => { const d1 = N(a[0]), d2 = N(a[1]); if (d1 > d2) throw err(ERR.NUM); const A = dateUTC(d1), Bd = dateUTC(d2); const u = S(a[2]).toUpperCase(); let mois = (Bd.a - A.a) * 12 + (Bd.m - A.m) - (Bd.j < A.j ? 1 : 0); switch (u) { case 'Y': return Math.floor(mois / 12); case 'M': return mois; case 'D': return Math.floor(d2) - Math.floor(d1); case 'YM': return mois % 12; case 'YD': { const s = serie(Bd.a - (Bd.m < A.m || (Bd.m === A.m && Bd.j < A.j) ? 1 : 0), A.m, A.j); return Math.floor(d2) - s; } case 'MD': { let dd = Bd.j - A.j; if (dd < 0) dd += joursDansMois(Bd.a, Bd.m - 1 || 12); return dd; } } throw err(ERR.NUM); } },
  NETWORKDAYS: { fn: (a) => { let d1 = Math.floor(N(a[0])), d2 = Math.floor(N(a[1])); const feries = new Set(a[2] ? nombres([a[2]]).map(Math.floor) : []); const signe = d1 > d2 ? -1 : 1; if (d1 > d2) [d1, d2] = [d2, d1]; let n = 0; for (let d = d1; d <= d2; d++) { const w = dateUTC(d).d.getUTCDay(); if (w !== 0 && w !== 6 && !feries.has(d)) n++; } return n * signe; } },
  WORKDAY: { fn: (a) => { let d = Math.floor(N(a[0])); let n = entier(a[1]); const feries = new Set(a[2] ? nombres([a[2]]).map(Math.floor) : []); const pas = n < 0 ? -1 : 1; n = Math.abs(n); while (n > 0) { d += pas; const w = dateUTC(d).d.getUTCDay(); if (w !== 0 && w !== 6 && !feries.has(d)) n--; } return d; } },

  // ----- Informations -----
  CELL: { fn: (a, ctx) => { const t = S(a[0]).toLowerCase(); const p = a[1] instanceof Plage ? a[1] : null; const r = p ? p.r1 : ctx.courant.r, c = p ? p.c1 : ctx.courant.c; if (t === 'row') return r + 1; if (t === 'col') return c + 1; if (t === 'address') return adresse(r, c, true, true); if (t === 'contents') return ctx.valeur(p ? p.feuille : ctx.courant.feuille, r, c); throw err(ERR.VALEUR); } },
  SHEET: { fn: (a, ctx) => (a[0] instanceof Plage ? a[0].feuille : ctx.courant.feuille) + 1 },
  SHEETS: { fn: (a, ctx) => ctx.nbFeuilles() },
};

// ---------------------------------------------------------------------------
// Fonctions pour la finance, l'actuariat et la comptabilité (titres, coupons, amortissements),
// lois inverses et tests, régression, LET / LAMBDA, tableaux dynamiques, bases de données
// ---------------------------------------------------------------------------

// Inverse d'une fonction de répartition croissante (dichotomie sur [lo, hi], élargi au besoin)
function inverseCdf(cdf, p, lo, hi) {
  if (!(p >= 0 && p <= 1)) throw err(ERR.NUM);
  let a = lo, b = hi;
  for (let k = 0; k < 200 && cdf(b) < p; k++) { a = b; b *= 2; }
  for (let i = 0; i < 300; i++) {
    const m = (a + b) / 2;
    if (cdf(m) < p) a = m; else b = m;
    if (b - a < 1e-15 * Math.max(1, Math.abs(m))) break;
  }
  return (a + b) / 2;
}
const tCdf = (t, k) => { const x = k / (k + t * t); return t >= 0 ? 1 - 0.5 * betaIncReg(k / 2, 0.5, x) : 0.5 * betaIncReg(k / 2, 0.5, x); };
function tInv(p, k) {
  if (p <= 0 || p >= 1 || k < 1) throw err(ERR.NUM);
  if (p === 0.5) return 0;
  const x = inverseCdf((t) => tCdf(t, k), Math.max(p, 1 - p), 0, 10);
  return p < 0.5 ? -x : x;
}
const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betaIncReg(d1 / 2, d2 / 2, d1 * x / (d1 * x + d2)));
const chiCdf = (x, k) => gammaIncReg(k / 2, x / 2);
const lnComb = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
const valeursNum = (v) => aplat([v]).filter((x) => typeof x === 'number');

// Dates des coupons : on recule depuis l'échéance par pas de 12 / fréquence mois (fin de mois gardée)
function dateCoupon(maturite, mois) {
  const d = dateUTC(maturite), fin = d.j === joursDansMois(d.a, d.m);
  const tot = d.m - 1 + mois, an = d.a + Math.floor(tot / 12), mo = ((tot % 12) + 12) % 12 + 1;
  return serie(an, mo, fin ? joursDansMois(an, mo) : Math.min(d.j, joursDansMois(an, mo)));
}
function coupons(a) {
  const s = Math.floor(N(a[0])), m = Math.floor(N(a[1])), f = entier(a[2]), base = entier(opt(a[3], 0));
  if (![1, 2, 4].includes(f) || base < 0 || base > 4 || s >= m) throw err(ERR.NUM);
  const pas = 12 / f;
  let k = 1, pcd = dateCoupon(m, -pas);
  while (pcd > s) { k++; pcd = dateCoupon(m, -pas * k); }
  const ncd = dateCoupon(m, -pas * (k - 1));
  const jours360 = (d1, d2, europe) => fractionAnnee(d1, d2, europe ? 4 : 0) * 360;
  const E = base === 1 ? ncd - pcd : base === 3 ? 365 / f : 360 / f;
  const A = base === 0 ? jours360(pcd, s, false) : base === 4 ? jours360(pcd, s, true) : s - pcd;
  const DSC = base === 0 || base === 4 ? E - A : ncd - s;
  return { s, m, f, base, n: k, pcd, ncd, E, A, DSC };
}
function prixTitre(c, taux, rend, rembourse) {
  const { n, E, A, DSC, f } = c, cp = 100 * taux / f;
  if (n === 1) return (rembourse + cp) / (1 + DSC / E * rend / f) - cp * A / E;
  let p = rembourse / Math.pow(1 + rend / f, n - 1 + DSC / E);
  for (let k = 1; k <= n; k++) p += cp / Math.pow(1 + rend / f, k - 1 + DSC / E);
  return p - cp * A / E;
}
function dureeTitre(c, taux, rend) {
  const { n, E, DSC, f } = c, cp = 100 * taux / f;
  let pv = 0, t = 0;
  for (let k = 1; k <= n; k++) {
    const tk = (k - 1 + DSC / E), flux = cp + (k === n ? 100 : 0), v = flux / Math.pow(1 + rend / f, tk);
    pv += v; t += tk * v;
  }
  return t / pv / f;
}
const fa = (d1, d2, base) => fractionAnnee(Math.floor(N(d1)), Math.floor(N(d2)), base);

// Amortissement dégressif à taux variable (VDB) : tableau des dotations par période, puis la part de [début, fin]
function vdb(cout, residu, duree, debut, fin, facteur, sansBascule) {
  if (cout < 0 || residu < 0 || duree <= 0 || debut < 0 || fin < debut || fin > duree || facteur <= 0) throw err(ERR.NUM);
  const n = Math.ceil(duree), dot = [];
  let valeur = cout;
  for (let p = 0; p < n; p++) {
    const restant = duree - p;
    let d = Math.min(valeur * facteur / duree, Math.max(0, valeur - residu));
    if (!sansBascule) { const lin = restant > 0 ? (valeur - residu) / restant : 0; if (lin > d) d = lin; }
    d = Math.max(0, Math.min(d, valeur - residu));
    dot.push(d); valeur -= d;
  }
  let total = 0;
  for (let p = 0; p < n; p++) { const part = Math.max(0, Math.min(fin, p + 1) - Math.max(debut, p)); total += dot[p] * part; }
  return total;
}

// Week-ends de NB.JOURS.OUVRES.INTL : numéro (1 à 7, 11 à 17) ou chaîne « 0000011 » (lundi → dimanche)
function weekEnd(x) {
  const ferme = new Set(); // jours JS (0 = dimanche)
  if (x === undefined || x === null) return new Set([0, 6]);
  if (typeof x === 'string') {
    if (!/^[01]{7}$/.test(x) || x === '1111111') throw err(ERR.VALEUR);
    for (let i = 0; i < 7; i++) if (x[i] === '1') ferme.add((i + 1) % 7);
    return ferme;
  }
  const n = entier(x);
  const paires = { 1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6] };
  if (paires[n]) return new Set(paires[n]);
  if (n >= 11 && n <= 17) return new Set([n - 11]);
  throw err(ERR.NUM);
}

// Régression multiple par les moindres carrés (DROITEREG, TENDANCE…) : X sans la colonne de constante
function regression(ys, xs, constante) {
  const Y = matrice(ys).flat().map((v) => N(v));
  let X;
  if (xs === undefined || xs === null) X = Y.map((_, i) => [i + 1]);
  else {
    const m = matNombres(xs), ly = matrice(ys).length;
    X = m.length === Y.length ? m : m[0].length === Y.length && ly === 1 ? transposer(m) : m.length === 1 && m[0].length === Y.length ? transposer(m) : m;
    if (X.length !== Y.length) throw err(ERR.REF);
  }
  const n = Y.length, k = X[0].length;
  const Xc = X.map((l) => (constante ? [...l, 1] : [...l]));
  const p = Xc[0].length;
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => Xc.reduce((s, l) => s + l[i] * l[j], 0)));
  const XtY = Array.from({ length: p }, (_, i) => Xc.reduce((s, l, r) => s + l[i] * Y[r], 0));
  const inv = inverser(XtX);
  const b = inv.map((l) => l.reduce((s, x, j) => s + x * XtY[j], 0));
  const pred = Xc.map((l) => l.reduce((s, x, j) => s + x * b[j], 0));
  const my = Y.reduce((s, y) => s + y, 0) / n;
  const ssres = Y.reduce((s, y, i) => s + (y - pred[i]) ** 2, 0);
  const sstot = constante ? Y.reduce((s, y) => s + (y - my) ** 2, 0) : Y.reduce((s, y) => s + y * y, 0);
  const df = n - k - (constante ? 1 : 0);
  const sey = df > 0 ? Math.sqrt(ssres / df) : 0;
  const se = inv.map((l, i) => Math.sqrt(Math.max(0, l[i])) * sey);
  return { b, se, r2: sstot ? 1 - ssres / sstot : 1, sey, F: df > 0 && ssres > 0 ? ((sstot - ssres) / k) / (ssres / df) : Infinity, df, ssreg: sstot - ssres, ssres, k, X };
}
function droitereg(a, logarithme) {
  const constante = a[2] === undefined ? true : B(a[2]), stats = a[3] === undefined ? false : B(a[3]);
  const ys = logarithme ? matrice(a[0]).map((l) => l.map((v) => { const x = N(v); if (x <= 0) throw err(ERR.NUM); return Math.log(x); })) : a[0];
  const r = regression(ys, a[1], constante);
  const coef = [...r.b.slice(0, r.k).reverse(), constante ? r.b[r.k] : 0];
  const ser = [...r.se.slice(0, r.k).reverse(), constante ? r.se[r.k] : err(ERR.NA)];
  const out = [logarithme ? coef.map(Math.exp) : coef];
  if (stats) {
    const NA = err(ERR.NA), w = coef.length, ligne = (...v) => [...v, ...Array(w - v.length).fill(NA)];
    out.push(ser, ligne(r.r2, r.sey), ligne(r.F, r.df), ligne(r.ssreg, r.ssres));
  }
  return out;
}
function tendance(a, croissance) {
  const constante = a[3] === undefined ? true : B(a[3]);
  const ys = croissance ? matrice(a[0]).map((l) => l.map((v) => Math.log(N(v)))) : a[0];
  const r = regression(ys, a[1], constante);
  const nx = a[2] === undefined ? r.X : (() => { const m = matNombres(a[2]); return m[0].length === r.k ? m : transposer(m); })();
  const vals = nx.map((l) => { let s = constante ? r.b[r.k] : 0; for (let j = 0; j < r.k; j++) s += l[j] * r.b[j]; return croissance ? Math.exp(s) : s; });
  const forme = a[2] !== undefined ? matrice(a[2]) : matrice(a[0]);
  return forme.length === 1 && r.k === 1 ? [vals] : vals.map((v) => [v]);
}

// Fonctions de base de données (BDSOMME…) : base avec ligne d'en-têtes, champ (nom ou numéro), critères (OU entre lignes)
function bd(a) {
  const base = matrice(a[0]), crit = matrice(a[2]);
  if (base.length < 1 || crit.length < 1) throw err(ERR.VALEUR);
  const entetes = base[0].map((x) => String(x ?? '').trim().toLowerCase());
  let col = -1;
  if (a[1] !== undefined && a[1] !== null) {
    const f = scal(a[1]);
    col = typeof f === 'number' ? f - 1 : entetes.indexOf(String(f).trim().toLowerCase());
    if (col < 0 || col >= entetes.length) throw err(ERR.VALEUR);
  }
  const cc = crit[0].map((x) => entetes.indexOf(String(x ?? '').trim().toLowerCase()));
  const lignesCrit = crit.slice(1).map((l) => l.map((x, j) => (x === null || x === '' || cc[j] < 0 ? null : { j: cc[j], t: compilerCritere(x) })).filter(Boolean));
  const garde = base.slice(1).filter((l) => !lignesCrit.length || lignesCrit.some((cs) => cs.every((c) => c.t(l[c.j]))));
  return { lignes: garde, col };
}
const bdValeurs = (a) => { const { lignes, col } = bd(a); return col < 0 ? lignes.map(() => 1) : lignes.map((l) => l[col]); };
const bdNombres = (a) => bdValeurs(a).filter((x) => typeof x === 'number');

// Conversion d'unités (CONVERT) : facteurs vers une unité de base par famille ; préfixes du système international
const UNITES = {
  masse: { g: 1, kg: 1000, lbm: 453.59237, ozm: 28.349523125, u: 1.66053906660e-24, grain: 0.06479891, stone: 6350.29318, ton: 907184.74, uk_ton: 1016046.9088, LTON: 1016046.9088, sg: 14593.90294 },
  distance: { m: 1, mi: 1609.344, Nmi: 1852, in: 0.0254, ft: 0.3048, yd: 0.9144, ang: 1e-10, ell: 1.143, ly: 9.4607304725808e15, parsec: 3.08567758149137e16, pc: 3.08567758149137e16, Pica: 0.0254 / 6, survey_mi: 1609.347219 },
  temps: { sec: 1, s: 1, mn: 60, min: 60, hr: 3600, day: 86400, d: 86400, yr: 31557600 },
  pression: { Pa: 1, p: 1, atm: 101325, at: 101325, mmHg: 133.322, psi: 6894.757293, Torr: 133.3223684 },
  force: { N: 1, dyn: 1e-5, dy: 1e-5, lbf: 4.4482216152605, pond: 0.00980665 },
  energie: { J: 1, e: 1e-7, c: 4.184, cal: 4.1868, eV: 1.602176634e-19, ev: 1.602176634e-19, HPh: 2684519.537696, hh: 2684519.537696, Wh: 3600, wh: 3600, flb: 0.0421401100938, BTU: 1055.05585262, btu: 1055.05585262 },
  puissance: { W: 1, w: 1, HP: 745.69987158227, h: 745.69987158227, PS: 735.49875 },
  volume: { l: 0.001, L: 0.001, lt: 0.001, m3: 1, tsp: 4.92892159375e-6, tbs: 1.478676478125e-5, oz: 2.95735295625e-5, cup: 2.365882365e-4, pt: 4.73176473e-4, us_pt: 4.73176473e-4, uk_pt: 5.6826125e-4, qt: 9.46352946e-4, uk_qt: 1.1365225e-3, gal: 3.785411784e-3, uk_gal: 4.54609e-3, barrel: 0.158987294928, bushel: 0.03523907016688, ft3: 0.028316846592, in3: 1.6387064e-5, yd3: 0.764554857984, mi3: 4.16818182544058e9 },
  surface: { m2: 1, ha: 10000, ar: 100, uk_acre: 4046.8564224, us_acre: 4046.87260987425, ft2: 0.09290304, in2: 6.4516e-4, yd2: 0.83612736, mi2: 2589988.110336, Nmi2: 3429904 },
  vitesse: { 'm/s': 1, 'm/sec': 1, 'm/h': 1 / 3600, 'm/hr': 1 / 3600, mph: 0.44704, kn: 1852 / 3600, admkn: 0.514773333 },
  information: { bit: 1, byte: 8 },
};
const PREFIXES = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24, ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
function unite(u) {
  for (const [fam, t] of Object.entries(UNITES)) if (t[u] !== undefined) return { fam, k: t[u] };
  for (const [p, k] of Object.entries(PREFIXES)) if (u.startsWith(p)) { const r = u.slice(p.length); for (const [fam, t] of Object.entries(UNITES)) if (t[r] !== undefined) { const puiss = /2$/.test(r) && fam === 'surface' ? 2 : /3$/.test(r) && fam === 'volume' ? 3 : 1; return { fam, k: t[r] * Math.pow(k, puiss) }; } }
  return null;
}
function convertirUnite(x, de, vers) {
  const temp = { C: (v) => v, cel: (v) => v, F: (v) => (v - 32) * 5 / 9, fah: (v) => (v - 32) * 5 / 9, K: (v) => v - 273.15, kel: (v) => v - 273.15, Rank: (v) => (v - 491.67) * 5 / 9, Reau: (v) => v * 1.25 };
  const tempInv = { C: (v) => v, cel: (v) => v, F: (v) => v * 9 / 5 + 32, fah: (v) => v * 9 / 5 + 32, K: (v) => v + 273.15, kel: (v) => v + 273.15, Rank: (v) => (v + 273.15) * 9 / 5, Reau: (v) => v * 0.8 };
  if (temp[de] || temp[vers]) { if (!temp[de] || !tempInv[vers]) throw err(ERR.NA); return tempInv[vers](temp[de](x)); }
  const a = unite(de), b = unite(vers);
  if (!a || !b || a.fam !== b.fam) throw err(ERR.NA);
  return x * a.k / b.k;
}

// LAMBDA : une fonction écrite dans la formule, avec ses paramètres et les variables visibles à sa création
class Lambda {
  constructor(params, corps, portees) { this.params = params; this.corps = corps; this.portees = portees; }
}
const NON_FOURNI = Symbol('omis');
function appelerLambda(ctx, f, valeurs) {
  if (!(f instanceof Lambda)) throw err(ERR.VALEUR);
  if (valeurs.length > f.params.length) throw err(ERR.VALEUR);
  const portee = new Map();
  f.params.forEach((p, i) => portee.set(p, i < valeurs.length ? valeurs[i] : NON_FOURNI));
  const sauve = ctx.portees;
  ctx.portees = [...f.portees, portee];
  try { return ctx.evaluer(f.corps); } finally { ctx.portees = sauve; }
}
const nomParam = (n) => {
  if (n && n.k === 'tref' && !n.table && /^\[[^\[\]]+\]$/.test(n.spec)) return n.spec.slice(1, -1).trim().toUpperCase(); // paramètre facultatif [b]
  if (!n || n.k !== 'nom') throw err(ERR.VALEUR);
  return n.v.toUpperCase();
};
// Valeur d'un élément pour un appel de lambda : un nombre, un texte… (pas une plage)
const element = (v) => (v instanceof Plage ? v.scalaire() : v);

// Sous-total : sans les autres SOUS.TOTAL de la plage ; 101 à 111 laissent aussi de côté les lignes masquées
function valeursSousTotal(args, sansMasquees) {
  const out = [];
  for (const p of args) {
    if (!(p instanceof Plage)) { out.push(...aplat([p])); continue; }
    const ctx = p.ctx, C = ctx.classeur, fe = C.feuilles && C.feuilles[p.feuille], b = p.bornes();
    for (let r = b.r1; r <= b.r2; r++) {
      if (fe && fe.filtrees && fe.filtrees.has(r)) continue;
      if (sansMasquees && fe && fe.hauteurs && fe.hauteurs[r] === 0) continue;
      for (let c = b.c1; c <= b.c2; c++) {
        const cel = C.cellule(p.feuille, r, c);
        if (cel && cel.f != null && /\b(SUBTOTAL|SOUS\.TOTAL|AGGREGATE|AGREGAT)\s*\(/i.test(cel.f)) continue;
        out.push(ctx.valeur(p.feuille, r, c));
      }
    }
  }
  return [out];
}

Object.assign(FONCTIONS, {
  SUBTOTAL: { fn: (a) => { const n = entier(a[0]), code = n % 100; const noms = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' }; const f = FONCTIONS[noms[code]]; if (!f || (n > 11 && n < 101) || n > 111) throw err(ERR.VALEUR); return f.fn(valeursSousTotal(a.slice(1), n > 100)); } },
  // ----- Titres, coupons, escompte -----
  COUPPCD: { fn: (a) => coupons(a).pcd },
  COUPNCD: { fn: (a) => coupons(a).ncd },
  COUPNUM: { fn: (a) => coupons(a).n },
  COUPDAYS: { fn: (a) => coupons(a).E },
  COUPDAYBS: { fn: (a) => coupons(a).A },
  COUPDAYSNC: { fn: (a) => coupons(a).DSC },
  PRICE: { fn: (a) => { const t = N(a[2]), y = N(a[3]), rd = N(a[4]); if (t < 0 || y < 0 || rd <= 0) throw err(ERR.NUM); return prixTitre(coupons([a[0], a[1], a[5], a[6]]), t, y, rd); } },
  YIELD: { fn: (a) => { const t = N(a[2]), pr = N(a[3]), rd = N(a[4]); if (t < 0 || pr <= 0 || rd <= 0) throw err(ERR.NUM); const c = coupons([a[0], a[1], a[5], a[6]]); return resoudre((y) => prixTitre(c, t, y, rd) - pr, t || 0.05, -0.99, 10); } },
  DURATION: { fn: (a) => { const t = N(a[2]), y = N(a[3]); if (t < 0 || y < 0) throw err(ERR.NUM); return dureeTitre(coupons([a[0], a[1], a[4], a[5]]), t, y); } },
  MDURATION: { fn: (a) => { const t = N(a[2]), y = N(a[3]), f = entier(a[4]); if (t < 0 || y < 0) throw err(ERR.NUM); return dureeTitre(coupons([a[0], a[1], a[4], a[5]]), t, y) / (1 + y / f); } },
  ACCRINT: { fn: (a) => { const taux = N(a[3]), par = a[4] === undefined ? 1000 : N(a[4]); if (taux <= 0 || par <= 0) throw err(ERR.NUM); const base = entier(opt(a[6], 0)); return par * taux * fa(a[0], a[2], base); } },
  ACCRINTM: { fn: (a) => { const taux = N(a[2]), par = a[3] === undefined ? 1000 : N(a[3]); if (taux <= 0 || par <= 0) throw err(ERR.NUM); return par * taux * fa(a[0], a[1], entier(opt(a[4], 0))); } },
  DISC: { fn: (a) => { const pr = N(a[2]), rd = N(a[3]); if (pr <= 0 || rd <= 0) throw err(ERR.NUM); return (rd - pr) / rd / fa(a[0], a[1], entier(opt(a[4], 0))); } },
  INTRATE: { fn: (a) => { const inv = N(a[2]), rd = N(a[3]); if (inv <= 0 || rd <= 0) throw err(ERR.NUM); return (rd - inv) / inv / fa(a[0], a[1], entier(opt(a[4], 0))); } },
  RECEIVED: { fn: (a) => { const inv = N(a[2]), d = N(a[3]); const x = 1 - d * fa(a[0], a[1], entier(opt(a[4], 0))); if (inv <= 0 || d <= 0 || x <= 0) throw err(ERR.NUM); return inv / x; } },
  PRICEDISC: { fn: (a) => { const d = N(a[2]), rd = N(a[3]); if (d <= 0 || rd <= 0) throw err(ERR.NUM); return rd - d * rd * fa(a[0], a[1], entier(opt(a[4], 0))); } },
  YIELDDISC: { fn: (a) => { const pr = N(a[2]), rd = N(a[3]); if (pr <= 0 || rd <= 0) throw err(ERR.NUM); return (rd - pr) / pr / fa(a[0], a[1], entier(opt(a[4], 0))); } },
  PRICEMAT: { fn: (a) => { const base = entier(opt(a[5], 0)), t = N(a[3]), y = N(a[4]); const dim = fa(a[2], a[1], base), dsm = fa(a[0], a[1], base), ac = fa(a[2], a[0], base); return (100 + dim * t * 100) / (1 + dsm * y) - ac * t * 100; } },
  YIELDMAT: { fn: (a) => { const base = entier(opt(a[5], 0)), t = N(a[3]), pr = N(a[4]); const dim = fa(a[2], a[1], base), dsm = fa(a[0], a[1], base), ac = fa(a[2], a[0], base); return ((1 + dim * t) - (pr / 100 + ac * t)) / (pr / 100 + ac * t) / dsm; } },
  TBILLPRICE: { fn: (a) => { const dsm = Math.floor(N(a[1])) - Math.floor(N(a[0])), d = N(a[2]); if (dsm <= 0 || dsm > 365 || d <= 0) throw err(ERR.NUM); return 100 * (1 - d * dsm / 360); } },
  TBILLYIELD: { fn: (a) => { const dsm = Math.floor(N(a[1])) - Math.floor(N(a[0])), pr = N(a[2]); if (dsm <= 0 || dsm > 365 || pr <= 0) throw err(ERR.NUM); return (100 - pr) / pr * 360 / dsm; } },
  TBILLEQ: { fn: (a) => { const dsm = Math.floor(N(a[1])) - Math.floor(N(a[0])), d = N(a[2]); if (dsm <= 0 || dsm > 365 || d <= 0) throw err(ERR.NUM); if (dsm <= 182) return 365 * d / (360 - d * dsm); const pr = 100 * (1 - d * dsm / 360), t = dsm / 365; return (-2 * t + 2 * Math.sqrt(t * t - (2 * t - 1) * (1 - 100 / pr))) / (2 * t - 1); } },
  DOLLARDE: { fn: (a) => { const x = N(a[0]), f = entier(a[1]); if (f < 0) throw err(ERR.NUM); if (f === 0) throw err(ERR.DIV0); const e = Math.trunc(x), p = Math.pow(10, Math.ceil(Math.log10(f))); return e + (x - e) * p / f; } },
  DOLLARFR: { fn: (a) => { const x = N(a[0]), f = entier(a[1]); if (f < 0) throw err(ERR.NUM); if (f === 0) throw err(ERR.DIV0); const e = Math.trunc(x), p = Math.pow(10, Math.ceil(Math.log10(f))); return e + (x - e) * f / p; } },
  ISPMT: { fn: (a) => { const r = N(a[0]), p = N(a[1]), n = N(a[2]), pv = N(a[3]); if (!n) throw err(ERR.DIV0); return pv * r * (p / n - 1); } },
  // ----- Amortissements -----
  VDB: { fn: (a) => vdb(N(a[0]), N(a[1]), N(a[2]), N(a[3]), N(a[4]), a[5] === undefined ? 2 : N(a[5]), a[6] === undefined ? false : B(a[6])) },
  AMORLINC: { fn: (a) => {
    const cout = N(a[0]), achat = Math.floor(N(a[1])), premiere = Math.floor(N(a[2])), residu = N(a[3]), per = entier(a[4]), taux = N(a[5]), base = entier(opt(a[6], 0));
    if (cout < 0 || residu < 0 || taux <= 0 || per < 0 || residu > cout) throw err(ERR.NUM);
    const annuite = cout * taux, premier = fractionAnnee(achat, premiere, base) * taux * cout;
    const pleines = Math.floor((cout - residu - premier) / annuite);
    if (per === 0) return premier;
    if (per <= pleines) return annuite;
    if (per === pleines + 1) return Math.max(0, cout - residu - annuite * pleines - premier);
    return 0;
  } },
  AMORDEGRC: { fn: (a) => {
    let cout = N(a[0]); const achat = Math.floor(N(a[1])), premiere = Math.floor(N(a[2])), residu = N(a[3]), per = entier(a[4]), base = entier(opt(a[6], 0));
    let taux = N(a[5]);
    if (cout < 0 || residu < 0 || taux <= 0 || per < 0) throw err(ERR.NUM);
    const vie = 1 / taux, coef = vie < 3 ? 1 : vie < 5 ? 1.5 : vie <= 6 ? 2 : 2.5;
    taux *= coef;
    let dot = Math.round(fractionAnnee(achat, premiere, base) * taux * cout);
    cout -= dot;
    let reste = cout - residu;
    for (let n = 0; n < per; n++) {
      dot = Math.round(taux * cout);
      reste -= dot;
      if (reste < 0) return per - n <= 1 ? Math.round(cout * 0.5) : 0;
      cout -= dot;
    }
    return dot;
  } },
  // ----- Jours ouvrés avec week-ends au choix -----
  'NETWORKDAYS.INTL': { fn: (a) => { let d1 = Math.floor(N(a[0])), d2 = Math.floor(N(a[1])); const we = weekEnd(a[2] === undefined ? undefined : scal(a[2])), feries = new Set(a[3] ? nombres([a[3]]).map(Math.floor) : []); const signe = d1 > d2 ? -1 : 1; if (d1 > d2) [d1, d2] = [d2, d1]; let n = 0; for (let d = d1; d <= d2; d++) if (!we.has(dateUTC(d).d.getUTCDay()) && !feries.has(d)) n++; return n * signe; } },
  'WORKDAY.INTL': { fn: (a) => { let d = Math.floor(N(a[0])), n = entier(a[1]); const we = weekEnd(a[2] === undefined ? undefined : scal(a[2])), feries = new Set(a[3] ? nombres([a[3]]).map(Math.floor) : []); const pas = n < 0 ? -1 : 1; n = Math.abs(n); while (n > 0) { d += pas; if (!we.has(dateUTC(d).d.getUTCDay()) && !feries.has(d)) n--; } return d; } },
  // ----- Lois inverses, autres lois -----
  'T.INV': { fn: (a) => tInv(N(a[0]), N(a[1])) },
  'T.INV.2T': { fn: (a) => { const p = N(a[0]); if (p <= 0 || p > 1) throw err(ERR.NUM); return Math.abs(tInv(p / 2, N(a[1]))); } },
  TINV: { fn: (a) => FONCTIONS['T.INV.2T'].fn(a) },
  'CHISQ.INV': { fn: (a) => { const p = N(a[0]), k = N(a[1]); if (p < 0 || p >= 1 || k < 1) throw err(ERR.NUM); return inverseCdf((x) => chiCdf(x, k), p, 0, Math.max(10, k * 4)); } },
  'CHISQ.INV.RT': { fn: (a) => { const p = N(a[0]); if (p <= 0 || p > 1) throw err(ERR.NUM); return FONCTIONS['CHISQ.INV'].fn([1 - p, a[1]]); } },
  CHIINV: { fn: (a) => FONCTIONS['CHISQ.INV.RT'].fn(a) },
  'F.DIST': { fn: (a) => { const x = N(a[0]), d1 = N(a[1]), d2 = N(a[2]); if (x < 0 || d1 < 1 || d2 < 1) throw err(ERR.NUM); if (B(a[3])) return fCdf(x, d1, d2); if (x === 0) return d1 < 2 ? Infinity : d1 === 2 ? 1 : 0; return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2))); } },
  'F.DIST.RT': { fn: (a) => { const x = N(a[0]), d1 = N(a[1]), d2 = N(a[2]); if (x < 0 || d1 < 1 || d2 < 1) throw err(ERR.NUM); return 1 - fCdf(x, d1, d2); } },
  FDIST: { fn: (a) => FONCTIONS['F.DIST.RT'].fn(a) },
  'F.INV': { fn: (a) => { const p = N(a[0]), d1 = N(a[1]), d2 = N(a[2]); if (p < 0 || p >= 1 || d1 < 1 || d2 < 1) throw err(ERR.NUM); return inverseCdf((x) => fCdf(x, d1, d2), p, 0, 10); } },
  'F.INV.RT': { fn: (a) => { const p = N(a[0]); if (p <= 0 || p > 1) throw err(ERR.NUM); return FONCTIONS['F.INV'].fn([1 - p, a[1], a[2]]); } },
  FINV: { fn: (a) => FONCTIONS['F.INV.RT'].fn(a) },
  'GAMMA.INV': { fn: (a) => { const p = N(a[0]), al = N(a[1]), be = N(a[2]); if (p < 0 || p >= 1 || al <= 0 || be <= 0) throw err(ERR.NUM); return inverseCdf((x) => gammaIncReg(al, x / be), p, 0, al * be * 4 + 10); } },
  GAMMAINV: { fn: (a) => FONCTIONS['GAMMA.INV'].fn(a) },
  'BETA.INV': { fn: (a) => { const p = N(a[0]), al = N(a[1]), be = N(a[2]), A = a[3] === undefined ? 0 : N(a[3]), Bb = a[4] === undefined ? 1 : N(a[4]); if (p < 0 || p > 1 || al <= 0 || be <= 0 || A >= Bb) throw err(ERR.NUM); let lo = 0, hi = 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (betaIncReg(al, be, m) < p) lo = m; else hi = m; } return A + (lo + hi) / 2 * (Bb - A); } },
  BETAINV: { fn: (a) => FONCTIONS['BETA.INV'].fn(a) },
  BETADIST: { fn: (a) => FONCTIONS['BETA.DIST'].fn([a[0], a[1], a[2], true, a[3], a[4]]) },
  'BINOM.INV': { fn: (a) => { const n = Math.floor(N(a[0])), p = N(a[1]), al = N(a[2]); if (n < 0 || p < 0 || p > 1 || al <= 0 || al >= 1) throw err(ERR.NUM); let s = 0; for (let k = 0; k <= n; k++) { s += Math.exp(lnComb(n, k) + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log(1 - p) : 0)); if (s >= al - 1e-12) return k; } return n; } },
  CRITBINOM: { fn: (a) => FONCTIONS['BINOM.INV'].fn(a) },
  'BINOM.DIST.RANGE': { fn: (a) => { const n = Math.floor(N(a[0])), p = N(a[1]), s1 = Math.floor(N(a[2])), s2 = a[3] === undefined ? s1 : Math.floor(N(a[3])); if (p < 0 || p > 1 || s1 < 0 || s2 > n || s1 > s2) throw err(ERR.NUM); let t = 0; for (let k = s1; k <= s2; k++) t += Math.exp(lnComb(n, k) + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log(1 - p) : 0)); return t; } },
  'NEGBINOM.DIST': { fn: (a) => { const f = Math.floor(N(a[0])), s = Math.floor(N(a[1])), p = N(a[2]); if (f < 0 || s < 1 || p < 0 || p > 1) throw err(ERR.NUM); if (B(a[3])) return betaIncReg(s, f + 1, p); return Math.exp(lnComb(f + s - 1, s - 1) + s * Math.log(p) + (f ? f * Math.log(1 - p) : 0)); } },
  NEGBINOMDIST: { fn: (a) => FONCTIONS['NEGBINOM.DIST'].fn([a[0], a[1], a[2], false]) },
  'HYPGEOM.DIST': { fn: (a) => { const k = Math.floor(N(a[0])), n = Math.floor(N(a[1])), K = Math.floor(N(a[2])), Np = Math.floor(N(a[3])); if (k < 0 || n < 0 || K < 0 || n > Np || K > Np || k > n || k > K) throw err(ERR.NUM); const pm = (i) => (i < Math.max(0, n - Np + K) ? 0 : Math.exp(lnComb(K, i) + lnComb(Np - K, n - i) - lnComb(Np, n))); if (!B(a[4])) return pm(k); let s = 0; for (let i = 0; i <= k; i++) s += pm(i); return Math.min(1, s); } },
  HYPGEOMDIST: { fn: (a) => FONCTIONS['HYPGEOM.DIST'].fn([a[0], a[1], a[2], a[3], false]) },
  LOGINV: { fn: (a) => FONCTIONS['LOGNORM.INV'].fn(a) },
  'CONFIDENCE.T': { fn: (a) => { const al = N(a[0]), s = N(a[1]), n = Math.floor(N(a[2])); if (al <= 0 || al >= 1 || s <= 0 || n < 2) throw err(n === 1 ? ERR.DIV0 : ERR.NUM); return Math.abs(tInv(al / 2, n - 1)) * s / Math.sqrt(n); } },
  // ----- Tests -----
  'Z.TEST': { fn: (a) => { const v = nombres([a[0]]), x = N(a[1]); const n = v.length; if (n < 2) throw err(ERR.DIV0); const m = v.reduce((s, y) => s + y, 0) / n; const s = a[2] === undefined ? Math.sqrt(variance(v, false)) : N(a[2]); return 1 - normSDist((m - x) / (s / Math.sqrt(n))); } },
  ZTEST: { fn: (a) => FONCTIONS['Z.TEST'].fn(a) },
  'T.TEST': { fn: (a) => {
    const queues = entier(a[2]), type = entier(a[3]);
    if (![1, 2].includes(queues) || ![1, 2, 3].includes(type)) throw err(ERR.NUM);
    let t, df;
    if (type === 1) {
      const x = aplat([a[0]]), y = aplat([a[1]]); if (x.length !== y.length) throw err(ERR.NA);
      const d = []; for (let i = 0; i < x.length; i++) if (typeof x[i] === 'number' && typeof y[i] === 'number') d.push(x[i] - y[i]);
      const n = d.length; if (n < 2) throw err(ERR.DIV0); const m = d.reduce((s, v) => s + v, 0) / n; t = m / Math.sqrt(variance(d, false) / n); df = n - 1;
    } else {
      const x = nombres([a[0]]), y = nombres([a[1]]), n1 = x.length, n2 = y.length; if (n1 < 2 || n2 < 2) throw err(ERR.DIV0);
      const m1 = x.reduce((s, v) => s + v, 0) / n1, m2 = y.reduce((s, v) => s + v, 0) / n2, v1 = variance(x, false), v2 = variance(y, false);
      if (type === 2) { const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); t = (m1 - m2) / Math.sqrt(sp * (1 / n1 + 1 / n2)); df = n1 + n2 - 2; }
      else { const q1 = v1 / n1, q2 = v2 / n2; t = (m1 - m2) / Math.sqrt(q1 + q2); df = (q1 + q2) ** 2 / (q1 * q1 / (n1 - 1) + q2 * q2 / (n2 - 1)); }
    }
    const p1 = 1 - tCdf(Math.abs(t), df);
    return queues === 1 ? p1 : 2 * p1;
  } },
  TTEST: { fn: (a) => FONCTIONS['T.TEST'].fn(a) },
  'F.TEST': { fn: (a) => { const x = nombres([a[0]]), y = nombres([a[1]]); if (x.length < 2 || y.length < 2) throw err(ERR.DIV0); const v1 = variance(x, false), v2 = variance(y, false); if (!v2 || !v1) throw err(ERR.DIV0); const c = fCdf(v1 / v2, x.length - 1, y.length - 1); return 2 * Math.min(c, 1 - c); } },
  FTEST: { fn: (a) => FONCTIONS['F.TEST'].fn(a) },
  'CHISQ.TEST': { fn: (a) => { const A = matrice(a[0]), E = matrice(a[1]); if (A.length !== E.length || A[0].length !== E[0].length) throw err(ERR.NA); let x = 0; for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) { const e = N(E[i][j]); if (e <= 0) throw err(ERR.DIV0); x += (N(A[i][j]) - e) ** 2 / e; } const r = A.length, c = A[0].length, df = r > 1 && c > 1 ? (r - 1) * (c - 1) : r * c - 1; if (df < 1) throw err(ERR.NA); return 1 - chiCdf(x, df); } },
  CHITEST: { fn: (a) => FONCTIONS['CHISQ.TEST'].fn(a) },
  'PERCENTRANK.INC': { fn: (a) => { const r = FONCTIONS.PERCENTRANK.fn(a.slice(0, 2)); const k = a[2] === undefined ? 3 : entier(a[2]); if (k < 1) throw err(ERR.NUM); return Math.floor(r * 10 ** k + 1e-9) / 10 ** k; } },
  'PERCENTRANK.EXC': { fn: (a) => { const v = nombres([a[0]]).sort((x, y) => x - y), x = N(a[1]), n = v.length; if (!n || x < v[0] || x > v[n - 1]) throw err(ERR.NA); let i = 0; while (i < n - 1 && v[i + 1] <= x) i++; const pos = v[i] === x ? i + 1 : i + 1 + (x - v[i]) / (v[i + 1] - v[i]); const k = a[2] === undefined ? 3 : entier(a[2]); return Math.floor(pos / (n + 1) * 10 ** k + 1e-9) / 10 ** k; } },
  PROB: { fn: (a) => { const x = aplat([a[0]]), p = aplat([a[1]]); if (x.length !== p.length) throw err(ERR.NA); const lo = N(a[2]), hi = a[3] === undefined ? lo : N(a[3]); let tot = 0, s = 0; for (let i = 0; i < x.length; i++) { const q = N(p[i]); if (q < 0 || q > 1) throw err(ERR.NUM); tot += q; if (typeof x[i] === 'number' && x[i] >= lo && x[i] <= hi) s += q; } if (Math.abs(tot - 1) > 1e-7) throw err(ERR.NUM); return s; } },
  // ----- Régression -----
  LINEST: { fn: (a) => droitereg(a, false) },
  LOGEST: { fn: (a) => droitereg(a, true) },
  TREND: { fn: (a) => tendance(a, false) },
  GROWTH: { fn: (a) => tendance(a, true) },
  // ----- Bases de données -----
  DSUM: { fn: (a) => bdNombres(a).reduce((s, x) => s + x, 0) },
  DAVERAGE: { fn: (a) => { const v = bdNombres(a); if (!v.length) throw err(ERR.DIV0); return v.reduce((s, x) => s + x, 0) / v.length; } },
  DCOUNT: { fn: (a) => (a[1] === undefined || a[1] === null ? bd(a).lignes.filter((l) => l.some((x) => typeof x === 'number')).length : bdNombres(a).length) },
  DCOUNTA: { fn: (a) => (a[1] === undefined || a[1] === null ? bd(a).lignes.length : bdValeurs(a).filter((x) => x !== null && x !== '').length) },
  DMAX: { fn: (a) => { const v = bdNombres(a); return v.length ? Math.max(...v) : 0; } },
  DMIN: { fn: (a) => { const v = bdNombres(a); return v.length ? Math.min(...v) : 0; } },
  DPRODUCT: { fn: (a) => bdNombres(a).reduce((s, x) => s * x, 1) },
  DGET: { fn: (a) => { const v = bdValeurs(a); if (!v.length) throw err(ERR.VALEUR); if (v.length > 1) throw err(ERR.NUM); return v[0]; } },
  DSTDEV: { fn: (a) => Math.sqrt(variance(bdNombres(a), false)) },
  DSTDEVP: { fn: (a) => Math.sqrt(variance(bdNombres(a), true)) },
  DVAR: { fn: (a) => variance(bdNombres(a), false) },
  DVARP: { fn: (a) => variance(bdNombres(a), true) },
  // ----- Tableaux -----
  RANDARRAY: { volatile: true, fn: (a) => { const l = a[0] === undefined ? 1 : entier(a[0]), c = a[1] === undefined ? 1 : entier(a[1]), mi = a[2] === undefined ? 0 : N(a[2]), ma = a[3] === undefined ? 1 : N(a[3]), ent = a[4] === undefined ? false : B(a[4]); if (l < 1 || c < 1 || mi > ma) throw err(ERR.VALEUR); return Array.from({ length: l }, () => Array.from({ length: c }, () => (ent ? Math.floor(mi + Math.random() * (Math.floor(ma) - Math.ceil(mi) + 1)) : mi + Math.random() * (ma - mi)))); } },
  SORTBY: { fn: (a) => { const m = matrice(a[0]); const cles = []; for (let i = 1; i < a.length; i += 2) cles.push({ v: aplat([a[i]]), o: a[i + 1] === undefined ? 1 : entier(a[i + 1]) }); for (const k of cles) if (k.v.length !== m.length && !(m.length === 1 && k.v.length === m[0].length)) throw err(ERR.VALEUR); if (m.length === 1 && m[0].length > 1 && cles[0] && cles[0].v.length === m[0].length) { const idx = m[0].map((_, i) => i).sort((x, y) => { for (const k of cles) { const c = comparer(k.v[x], k.v[y]); if (c) return c * k.o; } return x - y; }); return [idx.map((i) => m[0][i])]; } const idx = m.map((_, i) => i).sort((x, y) => { for (const k of cles) { const c = comparer(k.v[x], k.v[y]); if (c) return c * k.o; } return x - y; }); return idx.map((i) => m[i]); } },
  TAKE: { fn: (a) => { const m = matrice(a[0]); const l = a[1] === undefined ? m.length : entier(a[1]), c = a[2] === undefined ? m[0].length : entier(a[2]); if (!l || !c) throw err(ERR.VALEUR); const lignes = l > 0 ? m.slice(0, l) : m.slice(l); return lignes.map((x) => (c > 0 ? x.slice(0, c) : x.slice(c))); } },
  DROP: { fn: (a) => { const m = matrice(a[0]); const l = a[1] === undefined ? 0 : entier(a[1]), c = a[2] === undefined ? 0 : entier(a[2]); const lignes = l >= 0 ? m.slice(l) : m.slice(0, l); const out = lignes.map((x) => (c >= 0 ? x.slice(c) : x.slice(0, c))); if (!out.length || !out[0].length) throw err(ERR.VALEUR); return out; } },
  VSTACK: { fn: (a) => { const ms = a.filter((x) => x !== undefined).map(matrice); const w = Math.max(...ms.map((m) => Math.max(...m.map((l) => l.length)))); return ms.flatMap((m) => m.map((l) => [...l, ...Array(w - l.length).fill(err(ERR.NA))])); } },
  HSTACK: { fn: (a) => { const ms = a.filter((x) => x !== undefined).map(matrice); const h = Math.max(...ms.map((m) => m.length)); return Array.from({ length: h }, (_, i) => ms.flatMap((m) => (m[i] ? m[i] : Array(m[0].length).fill(err(ERR.NA))))); } },
  TOCOL: { fn: (a) => { let m = matrice(a[0]); const ign = a[1] === undefined ? 0 : entier(a[1]), parCol = a[2] === undefined ? false : B(a[2]); if (parCol) m = transposer(m); return m.flat().filter((v) => !((ign === 1 || ign === 3) && (v === null || v === '')) && !((ign === 2 || ign === 3) && v instanceof ErreurFormule)).map((v) => [v]); } },
  TOROW: { fn: (a) => [FONCTIONS.TOCOL.fn(a).map((l) => l[0])] },
  WRAPROWS: { fn: (a) => { const v = matrice(a[0]).flat(), n = entier(a[1]), pad = a[2] === undefined ? err(ERR.NA) : scal(a[2]); if (n < 1) throw err(ERR.NUM); const out = []; for (let i = 0; i < v.length; i += n) { const l = v.slice(i, i + n); while (l.length < n) l.push(pad); out.push(l); } return out; } },
  WRAPCOLS: { fn: (a) => transposer(FONCTIONS.WRAPROWS.fn(a)) },
  CHOOSECOLS: { fn: (a) => { const m = matrice(a[0]), w = m[0].length; const cs = a.slice(1).flatMap((x) => aplat([x])).map((x) => { const k = entier(x); if (!k || Math.abs(k) > w) throw err(ERR.VALEUR); return k > 0 ? k - 1 : w + k; }); return m.map((l) => cs.map((c) => l[c])); } },
  CHOOSEROWS: { fn: (a) => { const m = matrice(a[0]), h = m.length; return a.slice(1).flatMap((x) => aplat([x])).map((x) => { const k = entier(x); if (!k || Math.abs(k) > h) throw err(ERR.VALEUR); return m[k > 0 ? k - 1 : h + k]; }); } },
  EXPAND: { fn: (a) => { const m = matrice(a[0]); const l = a[1] === undefined || a[1] === null ? m.length : entier(a[1]), c = a[2] === undefined || a[2] === null ? m[0].length : entier(a[2]); if (l < m.length || c < m[0].length) throw err(ERR.VALEUR); const pad = a[3] === undefined ? err(ERR.NA) : scal(a[3]); return Array.from({ length: l }, (_, i) => Array.from({ length: c }, (_, j) => (m[i] && j < m[i].length ? m[i][j] : pad))); } },
  // ----- LET, LAMBDA et leurs compagnes -----
  LET: { paresseux: true, fn: (args, ev, ctx) => {
    if (args.length < 3 || args.length % 2 === 0) throw err(ERR.VALEUR);
    const portee = new Map(), sauve = ctx.portees;
    ctx.portees = [...(sauve || []), portee];
    try {
      for (let i = 0; i < args.length - 1; i += 2) portee.set(nomParam(args[i]), ev(args[i + 1]));
      return ev(args[args.length - 1]);
    } finally { ctx.portees = sauve; }
  } },
  LAMBDA: { paresseux: true, fn: (args, ev, ctx) => { if (!args.length) throw err(ERR.VALEUR); return new Lambda(args.slice(0, -1).map(nomParam), args[args.length - 1], [...(ctx.portees || [])]); } },
  ISOMITTED: { paresseux: true, fn: (args, ev, ctx) => { const n = args[0]; if (!n || n.k !== 'nom') return false; for (let i = (ctx.portees || []).length - 1; i >= 0; i--) { const p = ctx.portees[i]; if (p.has(n.v.toUpperCase())) return p.get(n.v.toUpperCase()) === NON_FOURNI; } return false; } },
  MAP: { paresseux: true, fn: (args, ev, ctx) => { const f = ev(args[args.length - 1]); const ms = args.slice(0, -1).map((x) => matrice(ev(x))); const h = Math.max(...ms.map((m) => m.length)), w = Math.max(...ms.map((m) => m[0].length)); return Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => { try { return scal(appelerLambda(ctx, f, ms.map((m) => (m[i] && m[i][j] !== undefined ? m[i][j] : (m.length === 1 && m[0].length === 1 ? m[0][0] : err(ERR.NA)))))); } catch (e) { if (e instanceof ErreurFormule) return e; throw e; } })); } },
  REDUCE: { paresseux: true, fn: (args, ev, ctx) => { let acc = args[0] && args[0].k !== 'vide' ? ev(args[0]) : 0; const m = matrice(ev(args[1])), f = ev(args[2]); for (const l of m) for (const v of l) acc = appelerLambda(ctx, f, [acc, v]); return acc; } },
  SCAN: { paresseux: true, fn: (args, ev, ctx) => { let acc = args[0] && args[0].k !== 'vide' ? ev(args[0]) : 0; const m = matrice(ev(args[1])), f = ev(args[2]); return m.map((l) => l.map((v) => { acc = scal(appelerLambda(ctx, f, [acc, v])); return acc; })); } },
  BYROW: { paresseux: true, fn: (args, ev, ctx) => { const m = matrice(ev(args[0])), f = ev(args[1]); return m.map((l) => [scal(appelerLambda(ctx, f, [[l]]))]); } },
  BYCOL: { paresseux: true, fn: (args, ev, ctx) => { const m = matrice(ev(args[0])), f = ev(args[1]); return [m[0].map((_, j) => scal(appelerLambda(ctx, f, [m.map((l) => [l[j]])])))]; } },
  MAKEARRAY: { paresseux: true, fn: (args, ev, ctx) => { const l = entier(ev(args[0])), c = entier(ev(args[1])), f = ev(args[2]); if (l < 1 || c < 1) throw err(ERR.VALEUR); return Array.from({ length: l }, (_, i) => Array.from({ length: c }, (_, j) => scal(appelerLambda(ctx, f, [i + 1, j + 1])))); } },
  // ----- Informations, conversions -----
  FORMULATEXT: { fn: (a, ctx) => { const p = a[0]; if (!(p instanceof Plage)) throw err(ERR.NA); const cel = ctx.classeur.cellule(p.feuille, p.r1, p.c1); if (!cel || cel.f == null) throw err(ERR.NA); return cel.f; } },
  ISFORMULA: { fn: (a, ctx) => { const p = a[0]; if (!(p instanceof Plage)) return false; const cel = ctx.classeur.cellule(p.feuille, p.r1, p.c1); return !!(cel && cel.f != null); } },
  'ERROR.TYPE': { fn: (a) => { const v = scal(a[0]); if (!(v instanceof ErreurFormule)) throw err(ERR.NA); return { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CYCLE!': 14 }[v.code] || 8; } },
  CONVERT: { fn: (a) => convertirUnite(N(a[0]), S(a[1]), S(a[2])) },
  PERCENTOF: { fn: (a) => { const t = nombres([a[1]]).reduce((s, x) => s + x, 0); if (!t) throw err(ERR.DIV0); return nombres([a[0]]).reduce((s, x) => s + x, 0) / t; } },
});
/** Outils statistiques pour l'utilitaire d'analyse (lois et inverses, régression). */
export const STATS = { tInv, tCdf, fCdf, chiCdf, normSInv, normSDist, lnGamma, inverser, regression, quantile, variance };
// Les fonctions qui reçoivent une erreur en argument (TYPE.ERREUR) ne doivent pas la propager
FONCTIONS['ERROR.TYPE'].paresseux = true;
FONCTIONS['ERROR.TYPE'].fn = (args, ev) => { let v; try { v = scal(ev(args[0])); } catch (e) { if (e instanceof ErreurFormule) v = e; else throw e; } if (!(v instanceof ErreurFormule)) throw err(ERR.NA); return { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CYCLE!': 14 }[v.code] || 8; };

/** Noms français → anglais. */
export const ALIAS = {
  SI: 'IF', 'SI.CONDITIONS': 'IFS', SIERREUR: 'IFERROR', 'SI.NON.DISP': 'IFNA', CHOISIR: 'CHOOSE', 'SI.MULTIPLE': 'SWITCH',
  ET: 'AND', OU: 'OR', OUX: 'XOR', NON: 'NOT', VRAI: 'TRUE', FAUX: 'FALSE',
  ESTVIDE: 'ISBLANK', ESTNUM: 'ISNUMBER', ESTTEXTE: 'ISTEXT', ESTNONTEXTE: 'ISNONTEXT', ESTLOGIQUE: 'ISLOGICAL',
  ESTERREUR: 'ISERROR', ESTERR: 'ISERR', ESTNA: 'ISNA', 'EST.PAIR': 'ISEVEN', 'EST.IMPAIR': 'ISODD', NA: 'NA',
  SOMME: 'SUM', PRODUIT: 'PRODUCT', 'SOMME.CARRES': 'SUMSQ', SIGNE: 'SIGN', RACINE: 'SQRT', 'RACINE.PI': 'SQRTPI',
  PUISSANCE: 'POWER', ENT: 'INT', TRONQUE: 'TRUNC', ARRONDI: 'ROUND', 'ARRONDI.SUP': 'ROUNDUP', 'ARRONDI.INF': 'ROUNDDOWN',
  'ARRONDI.AU.MULTIPLE': 'MROUND', PLAFOND: 'CEILING', 'PLAFOND.MATH': 'CEILING.MATH', PLANCHER: 'FLOOR', 'PLANCHER.MATH': 'FLOOR.MATH',
  PAIR: 'EVEN', IMPAIR: 'ODD', ALEA: 'RAND', 'ALEA.ENTRE.BORNES': 'RANDBETWEEN', FACTDOUBLE: 'FACTDOUBLE', COMBIN: 'COMBIN', PERMUTATION: 'PERMUT',
  PGCD: 'GCD', PPCM: 'LCM', DEGRES: 'DEGREES', SOMMEPROD: 'SUMPRODUCT', 'SOMME.SI': 'SUMIF', 'SOMME.SI.ENS': 'SUMIFS',
  'NB.SI': 'COUNTIF', 'NB.SI.ENS': 'COUNTIFS', 'MOYENNE.SI': 'AVERAGEIF', 'MOYENNE.SI.ENS': 'AVERAGEIFS', 'MIN.SI.ENS': 'MINIFS', 'MAX.SI.ENS': 'MAXIFS',
  'SOMME.SERIES': 'SERIESSUM', 'SOMME.X2MY2': 'SUMX2MY2', 'SOMME.X2PY2': 'SUMX2PY2', 'SOMME.XMY2': 'SUMXMY2',
  PRODUITMAT: 'MMULT', TRANSPOSE: 'TRANSPOSE', INVERSEMAT: 'MINVERSE', DETERMAT: 'MDETERM', 'MATRICE.UNITAIRE': 'MUNIT', 'SOUS.TOTAL': 'SUBTOTAL', AGREGAT: 'AGGREGATE',
  MOYENNE: 'AVERAGE', AVERAGEA: 'AVERAGEA', MEDIANE: 'MEDIAN', MODE: 'MODE', 'MODE.SIMPLE': 'MODE.SNGL', MINA: 'MINA', MAXA: 'MAXA',
  NB: 'COUNT', NBVAL: 'COUNTA', 'NB.VIDE': 'COUNTBLANK', 'GRANDE.VALEUR': 'LARGE', 'PETITE.VALEUR': 'SMALL', RANG: 'RANK', 'EQUATION.RANG': 'RANK.EQ', 'MOYENNE.RANG': 'RANK.AVG',
  CENTILE: 'PERCENTILE', 'CENTILE.INCLURE': 'PERCENTILE.INC', 'CENTILE.EXCLURE': 'PERCENTILE.EXC', QUARTILE: 'QUARTILE', 'QUARTILE.INCLURE': 'QUARTILE.INC', 'QUARTILE.EXCLURE': 'QUARTILE.EXC', 'RANG.POURCENTAGE': 'PERCENTRANK',
  VAR: 'VAR', 'VAR.S': 'VAR.S', 'VAR.P': 'VAR.P', 'VAR.P.N': 'VAR.P', VARP: 'VARP', ECARTYPE: 'STDEV', 'ECARTYPE.STANDARD': 'STDEV.S', ECARTYPEP: 'STDEVP', 'ECARTYPE.PEARSON': 'STDEV.P',
  'SOMME.CARRES.ECARTS': 'DEVSQ', 'ECART.MOYEN': 'AVEDEV', 'MOYENNE.GEOMETRIQUE': 'GEOMEAN', 'MOYENNE.HARMONIQUE': 'HARMEAN', 'MOYENNE.REDUITE': 'TRIMMEAN',
  'COEFFICIENT.ASYMETRIE': 'SKEW', KURTOSIS: 'KURT', 'COEFFICIENT.CORRELATION': 'CORREL', PEARSON: 'PEARSON', 'COEFFICIENT.DETERMINATION': 'RSQ',
  'COVARIANCE.PEARSON': 'COVARIANCE.P', 'COVARIANCE.STANDARD': 'COVARIANCE.S', COVARIANCE: 'COVAR', PENTE: 'SLOPE', 'ORDONNEE.ORIGINE': 'INTERCEPT', PREVISION: 'FORECAST', 'PREVISION.LINEAIRE': 'FORECAST.LINEAR', 'ERREUR.TYPE.XY': 'STEYX', 'CENTREE.REDUITE': 'STANDARDIZE', FREQUENCE: 'FREQUENCY',
  'LOI.NORMALE.STANDARD.N': 'NORM.S.DIST', 'LOI.NORMALE.STANDARD': 'NORMSDIST', 'LOI.NORMALE.N': 'NORM.DIST', 'LOI.NORMALE': 'NORMDIST',
  'LOI.NORMALE.STANDARD.INVERSE.N': 'NORM.S.INV', 'LOI.NORMALE.STANDARD.INVERSE': 'NORMSINV', 'LOI.NORMALE.INVERSE.N': 'NORM.INV', 'LOI.NORMALE.INVERSE': 'NORMINV',
  'LOI.LOGNORMALE.N': 'LOGNORM.DIST', 'LOI.LOGNORMALE': 'LOGNORMDIST', 'LOI.LOGNORMALE.INVERSE.N': 'LOGNORM.INV', 'LOI.EXPONENTIELLE.N': 'EXPON.DIST', 'LOI.EXPONENTIELLE': 'EXPONDIST',
  'LOI.POISSON.N': 'POISSON.DIST', 'LOI.POISSON': 'POISSON', 'LOI.BINOMIALE.N': 'BINOM.DIST', 'LOI.BINOMIALE': 'BINOMDIST', 'LOI.GAMMA.N': 'GAMMA.DIST', 'LOI.GAMMA': 'GAMMADIST',
  'LOI.KHIDEUX.N': 'CHISQ.DIST', 'LOI.KHIDEUX.DROITE': 'CHISQ.DIST.RT', 'LOI.KHIDEUX': 'CHIDIST', 'LOI.STUDENT.N': 'T.DIST', 'LOI.STUDENT.BILATERALE': 'T.DIST.2T', 'LOI.STUDENT.DROITE': 'T.DIST.RT', 'LOI.STUDENT': 'TDIST',
  'LOI.BETA.N': 'BETA.DIST', 'LOI.WEIBULL.N': 'WEIBULL.DIST', 'LOI.WEIBULL': 'WEIBULL', LNGAMMA: 'GAMMALN', 'LNGAMMA.PRECIS': 'GAMMALN.PRECISE', GAMMA: 'GAMMA', ERF: 'ERF', ERFC: 'ERFC',
  'INTERVALLE.CONFIANCE.NORMAL': 'CONFIDENCE.NORM', 'INTERVALLE.CONFIANCE': 'CONFIDENCE',
  VA: 'PV', VC: 'FV', VPM: 'PMT', NPM: 'NPER', TAUX: 'RATE', INTPER: 'IPMT', PRINCPER: 'PPMT', 'CUMUL.INTER': 'CUMIPMT', 'CUMUL.PRINCPER': 'CUMPRINC',
  VAN: 'NPV', TRI: 'IRR', TRIM: 'MIRR', 'VAN.PAIEMENTS': 'XNPV', 'TRI.PAIEMENTS': 'XIRR', 'TAUX.EFFECTIF': 'EFFECT', 'TAUX.NOMINAL': 'NOMINAL', 'TAUX.INT.EQUIV': 'RRI', 'DUREE.PAIEMENT': 'PDURATION',
  'VC.PAIEMENTS': 'FVSCHEDULE', AMORLIN: 'SLN', SYD: 'SYD', DB: 'DB', DDB: 'DDB',
  RECHERCHEV: 'VLOOKUP', RECHERCHEH: 'HLOOKUP', RECHERCHE: 'LOOKUP', RECHERCHEX: 'XLOOKUP', EQUIV: 'MATCH', EQUIVX: 'XMATCH', INDEX: 'INDEX', DECALER: 'OFFSET',
  LIGNE: 'ROW', COLONNE: 'COLUMN', LIGNES: 'ROWS', COLONNES: 'COLUMNS', ADRESSE: 'ADDRESS', INDIRECT: 'INDIRECT', ZONES: 'AREAS', LIEN_HYPERTEXTE: 'HYPERLINK',
  UNIQUE: 'UNIQUE', TRIER: 'SORT', FILTRE: 'FILTER', SEQUENCE: 'SEQUENCE',
  CONCATENER: 'CONCATENATE', CONCAT: 'CONCAT', 'JOINDRE.TEXTE': 'TEXTJOIN', GAUCHE: 'LEFT', DROITE: 'RIGHT', STXT: 'MID', NBCAR: 'LEN', MAJUSCULE: 'UPPER', MINUSCULE: 'LOWER',
  NOMPROPRE: 'PROPER', SUPPRESPACE: 'TRIM', EPURAGE: 'CLEAN', CNUM: 'VALUE', 'VALEURNOMBRE': 'NUMBERVALUE', TEXTE: 'TEXT', CTXT: 'FIXED', DEVISE: 'DOLLAR',
  TROUVE: 'FIND', CHERCHE: 'SEARCH', SUBSTITUE: 'SUBSTITUTE', REMPLACER: 'REPLACE', REPT: 'REPT', EXACT: 'EXACT', CAR: 'CHAR', CODE: 'CODE', UNICAR: 'UNICHAR', UNICODE: 'UNICODE',
  'TEXTE.AVANT': 'TEXTBEFORE', 'TEXTE.APRES': 'TEXTAFTER', 'FRACTIONNER.TEXTE': 'TEXTSPLIT',
  AUJOURDHUI: 'TODAY', MAINTENANT: 'NOW', DATE: 'DATE', DATEVAL: 'DATEVALUE', TEMPS: 'TIME', ANNEE: 'YEAR', MOIS: 'MONTH', JOUR: 'DAY', HEURE: 'HOUR', MINUTE: 'MINUTE', SECONDE: 'SECOND',
  JOURSEM: 'WEEKDAY', 'NO.SEMAINE': 'WEEKNUM', 'NO.SEMAINE.ISO': 'ISOWEEKNUM', JOURS: 'DAYS', JOURS360: 'DAYS360', 'MOIS.DECALER': 'EDATE', 'FIN.MOIS': 'EOMONTH',
  'FRACTION.ANNEE': 'YEARFRAC', DATEDIF: 'DATEDIF', 'NB.JOURS.OUVRES': 'NETWORKDAYS', 'SERIE.JOUR.OUVRE': 'WORKDAY',
  CELLULE: 'CELL', FEUILLE: 'SHEET', FEUILLES: 'SHEETS', TYPE: 'TYPE', N: 'N', T: 'T',
};

Object.assign(ALIAS, {
  'TRI.MODIFIE': 'MIRR', 'INTERET.ACC': 'ACCRINT', 'INTERET.ACC.MAT': 'ACCRINTM', 'PRIX.TITRE': 'PRICE', 'RENDEMENT.TITRE': 'YIELD', DUREE: 'DURATION', 'DUREE.MODIFIEE': 'MDURATION',
  'VALEUR.ENCAISSEMENT': 'PRICEDISC', 'PRIX.TITRE.ECHEANCE': 'PRICEMAT', 'RENDEMENT.SIMPLE': 'YIELDDISC', 'RENDEMENT.TITRE.ECHEANCE': 'YIELDMAT', 'TAUX.ESCOMPTE': 'DISC',
  'TAUX.INTERET': 'INTRATE', 'VALEUR.NOMINALE': 'RECEIVED', 'TAUX.ESCOMPTE.R': 'TBILLEQ', 'PRIX.BON.TRESOR': 'TBILLPRICE', 'RENDEMENT.BON.TRESOR': 'TBILLYIELD',
  'NB.JOURS.COUPON.PREC': 'COUPDAYBS', 'NB.JOURS.COUPONS': 'COUPDAYS', 'NB.JOURS.COUPON.SUIV': 'COUPDAYSNC', 'DATE.COUPON.SUIV': 'COUPNCD', 'NB.COUPONS': 'COUPNUM', 'DATE.COUPON.PREC': 'COUPPCD',
  'PRIX.DEC': 'DOLLARDE', 'PRIX.FRAC': 'DOLLARFR', ISPMT: 'ISPMT', VDB: 'VDB', AMORLINC: 'AMORLINC', AMORDEGRC: 'AMORDEGRC',
  'NB.JOURS.OUVRES.INTL': 'NETWORKDAYS.INTL', 'SERIE.JOUR.OUVRE.INTL': 'WORKDAY.INTL',
  'LOI.STUDENT.INVERSE.N': 'T.INV', 'LOI.STUDENT.INVERSE.BILATERALE': 'T.INV.2T', 'LOI.STUDENT.INVERSE': 'TINV', 'TEST.STUDENT': 'TTEST',
  'LOI.KHIDEUX.INVERSE': 'CHISQ.INV', 'LOI.KHIDEUX.INVERSE.DROITE': 'CHISQ.INV.RT', 'KHIDEUX.INVERSE': 'CHIINV', 'TEST.KHIDEUX': 'CHITEST',
  'LOI.F.N': 'F.DIST', 'LOI.F.DROITE': 'F.DIST.RT', 'LOI.F': 'FDIST', 'INVERSE.LOI.F.N': 'F.INV', 'INVERSE.LOI.F.DROITE': 'F.INV.RT', 'INVERSE.LOI.F': 'FINV', 'TEST.F': 'FTEST',
  'LOI.GAMMA.INVERSE.N': 'GAMMA.INV', 'LOI.GAMMA.INVERSE': 'GAMMAINV', 'BETA.INVERSE.N': 'BETA.INV', 'BETA.INVERSE': 'BETAINV', 'LOI.BETA': 'BETADIST',
  'LOI.BINOMIALE.INVERSE': 'BINOM.INV', 'CRITERE.LOI.BINOMIALE': 'CRITBINOM', 'LOI.BINOMIALE.SERIE': 'BINOM.DIST.RANGE', 'LOI.BINOMIALE.NEG.N': 'NEGBINOM.DIST', 'LOI.BINOMIALE.NEG': 'NEGBINOMDIST',
  'LOI.HYPERGEOMETRIQUE.N': 'HYPGEOM.DIST', 'LOI.HYPERGEOMETRIQUE': 'HYPGEOMDIST', 'LOI.LOGNORMALE.INVERSE': 'LOGINV', 'INTERVALLE.CONFIANCE.STUDENT': 'CONFIDENCE.T', 'TEST.Z': 'ZTEST',
  TENDANCE: 'TREND', CROISSANCE: 'GROWTH', DROITEREG: 'LINEST', LOGREG: 'LOGEST', 'RANG.POURCENTAGE.INCLURE': 'PERCENTRANK.INC', 'RANG.POURCENTAGE.EXCLURE': 'PERCENTRANK.EXC', PROBABILITE: 'PROB',
  BDSOMME: 'DSUM', BDMOYENNE: 'DAVERAGE', BDNB: 'DCOUNT', BDNBVAL: 'DCOUNTA', BDMAX: 'DMAX', BDMIN: 'DMIN', BDLIRE: 'DGET', BDPRODUIT: 'DPRODUCT', BDECARTYPE: 'DSTDEV', BDECARTYPEP: 'DSTDEVP', BDVAR: 'DVAR', BDVARP: 'DVARP',
  'TABLEAU.ALEA': 'RANDARRAY', TRIERPAR: 'SORTBY', PRENDRE: 'TAKE', EXCLURE: 'DROP', 'ASSEMB.V': 'VSTACK', 'ASSEMB.H': 'HSTACK', 'ORGA.LIGNES': 'WRAPROWS', 'ORGA.COLS': 'WRAPCOLS',
  CHOISIRCOLS: 'CHOOSECOLS', CHOISIRLIGNES: 'CHOOSEROWS', DEVELOPPER: 'EXPAND', 'DÉVELOPPER': 'EXPAND', ESTOMIS: 'ISOMITTED',
  FORMULETEXTE: 'FORMULATEXT', ESTFORMULE: 'ISFORMULA', 'TYPE.ERREUR': 'ERROR.TYPE', CONVERT: 'CONVERT', POURCENTAGEDE: 'PERCENTOF',
});

/** Résout un nom de fonction (anglais, français, préfixe _xlfn.) vers sa définition. */
/** Le nom tel qu'Excel en français l'écrit (SOMME, MAX, DUREE) : une Function VBA de ce nom n'y serait pas appelée. */
export function estNomFrancais(nom) {
  const n = String(nom).toUpperCase().replace(/^_XLFN\.|^_XLWS\./, '');
  return ALIAS[n] !== undefined || (FONCTIONS[n] !== undefined && !ALIAS_INVERSE[n]);
}
export function fonction(nom) {
  let n = nom.toUpperCase();
  if (n.startsWith('_XLFN.')) n = n.slice(6);
  if (n.startsWith('_XLWS.')) n = n.slice(6);
  if (!FONCTIONS[n] && ALIAS[n]) n = ALIAS[n];
  return FONCTIONS[n] ? { nom: n, ...FONCTIONS[n] } : null;
}

export const NOMS_FONCTIONS = Object.keys(FONCTIONS).sort();
export const NOMS_FONCTIONS_FR = Object.keys(ALIAS).sort();

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

/**
 * Contexte d'évaluation. Le classeur fournit :
 *   nbFeuilles(), indexFeuille(nom) → idx ou -1, nomFeuille(idx),
 *   cellule(f, r, c) → { v, f } ou undefined, zoneUtilisee(f) → { r2, c2 },
 *   nom(nomDefini) → chaîne de référence (« Feuil1!$A$1:$B$3 ») ou undefined.
 */
// Formules qui peuvent renvoyer plusieurs valeurs (plages, matrices, fonctions de tableaux dynamiques)
const PEUT_DEBORDER = /[:#{]|\b(FILTER|FILTRE|SORT|TRIER|SORTBY|TRIERPAR|UNIQUE|SEQUENCE|S[EÉ]QUENCE|RANDARRAY|TABLEAU\.ALEA|TRANSPOSE|MMULT|PRODUITMAT|MINVERSE|INVERSEMAT|FREQUENCY|FREQUENCE|LINEST|DROITEREG|CHOOSECOLS|CHOOSEROWS|CHOISIRCOLS|CHOISIRLIGNES|TAKE|PRENDRE|DROP|EXCLURE|HSTACK|ASSEMB\.H|VSTACK|ASSEMB\.V|TEXTSPLIT|FRACTIONNER\.TEXTE|TOCOL|TOROW|ANSICOL|ANSILIGNE|WRAPROWS|WRAPCOLS|EXPAND|DEVELOPPER|INDIRECT|OFFSET|DECALER|INDEX|IF|SI|CHOOSE|CHOISIR|LET|LAMBDA|MAP|BYROW|BYCOL|MAKEARRAY|SCAN|REDUCE)\s*\(/i;

export class Evaluateur {
  constructor(classeur) {
    this.classeur = classeur;
    this.cache = new Map();     // "f,r,c" → valeur calculée
    this.enCours = new Set();   // détection des cycles
    this.courant = { feuille: 0, r: 0, c: 0 };
    this.debords = new Map();   // "f,r,c" → { h, w, m, bloque } : formules dont le résultat déborde (tableaux dynamiques)
    this.index = new Map();     // feuille → [{ r, c, h, w }] : zones de débordement connues
    this.indexPret = false;
    this.enConstruction = new Set();
  }

  invalider() { if (this.classeur.calculManuel && !this.forcer) return; this.cache.clear(); this.debords.clear(); this.index.clear(); this.indexPret = false; if (this.gardees) this.gardees.clear(); }
  /** Erreur VBA masquée par la valeur enregistrée dans le fichier (voir valeurBrute), pour la signaler sur la cellule. */
  erreurGardee(f, r, c) { return this.gardees ? this.gardees.get(f + ',' + r + ',' + c) || null : null; }
  recalculerTout() { this.forcer = true; try { this.invalider(); } finally { this.forcer = false; } }

  /**
   * Repère les formules qui débordent (tableaux dynamiques) dans tout le classeur, une fois par version.
   * Une zone peut dépendre d'une autre (=TRIER(A1#)) : quelques passes, jusqu'à ce que les zones ne bougent plus.
   */
  construireIndex() {
    if (this.indexPret || this.enConstruction.size) return;
    this.enConstruction.add('*');
    try {
      let avant = '';
      for (let passe = 0; passe < 4; passe++) {
        const nouvel = new Map();
        this.classeur.feuilles.forEach((feuille, f) => {
          const liste = [];
          feuille.chaque((r, c, cel) => {
            if (cel.f == null || !PEUT_DEBORDER.test(cel.f)) return;
            this.valeur(f, r, c);
            const d = this.debords.get(f + ',' + r + ',' + c);
            if (d && !d.bloque) liste.push({ r, c, h: d.h, w: d.w });
          });
          if (liste.length) nouvel.set(f, liste);
        });
        this.index = nouvel;
        const sig = JSON.stringify([...nouvel]);
        if (!nouvel.size || sig === avant) break;
        avant = sig; this.cache.clear(); this.debords.clear();
      }
      this.indexPret = true;
    } finally { this.enConstruction.delete('*'); }
  }
  /** Zones de débordement d'une feuille. */
  zonesDebord(f) {
    if (!this.indexPret && !this.enCours.size) this.construireIndex();
    return this.index.get(f) || [];
  }
  /** Zone de débordement qui couvre une cellule (ou null). */
  zoneDe(f, r, c) {
    const zs = this.zonesDebord(f);
    if (!zs) return null;
    return zs.find((z) => r >= z.r && r < z.r + z.h && c >= z.c && c < z.c + z.w) || null;
  }

  nbFeuilles() { return this.classeur.nbFeuilles(); }

  zoneUtilisee(f) {
    const z = this.classeur.zoneUtilisee(f), zs = this.index.get(f);
    if (!zs || !zs.length) return z;
    let r2 = z.r2, c2 = z.c2;
    for (const q of zs) { r2 = Math.max(r2, q.r + q.h - 1); c2 = Math.max(c2, q.c + q.w - 1); }
    return { r2, c2 };
  }

  /**
   * Valeur d'une cellule (formule évaluée si besoin). Avec le calcul itératif (classeur.iteration.actif), une référence
   * circulaire reprend la valeur du tour précédent, et le calcul recommence jusqu'à ce que les valeurs ne bougent plus
   * (écart maximal) ou jusqu'au nombre de tours permis, comme dans Excel.
   */
  valeur(f, r, c) {
    if (this.enCours.size) return this.valeurBrute(f, r, c);
    this.cycleVu = false;
    let v = this.valeurBrute(f, r, c);
    const it = this.classeur.iteration;
    if (this.cycleVu && it && it.actif) {
      const max = Math.max(1, Math.min(32767, +it.max || 100)), seuil = it.ecart === undefined ? 0.001 : +it.ecart;
      for (let n = 1; n < max; n++) {
        const avant = new Map(this.cache);
        this.precedents = avant; this.cache.clear(); this.cycleVu = false;
        v = this.valeurBrute(f, r, c);
        let ecart = 0;
        for (const [k, x] of this.cache) { const y = avant.get(k); if (typeof x === 'number' && typeof y === 'number') ecart = Math.max(ecart, Math.abs(x - y)); }
        if (ecart < seuil) break;
      }
      this.dernierCycle = this.precedents;
      this.precedents = null; this.cycleVu = false;
    }
    return v;
  }

  valeurBrute(f, r, c) {
    if (!this.indexPret && !this.enCours.size && !this.enConstruction.size) this.construireIndex();
    const cel = this.classeur.cellule(f, r, c);
    // Cellule vide (ou valeur gardée d'une ancienne formule matricielle) : peut-être dans le débordement d'une formule
    if (!cel || (cel.f == null && (cel.v === null || cel.v === undefined || cel.v === '' || cel.couverte))) {
      const z = this.zoneDe(f, r, c);
      if (z && (z.r !== r || z.c !== c)) {
        if (!this.debords.has(f + ',' + z.r + ',' + z.c)) this.valeur(f, z.r, z.c);
        const d = this.debords.get(f + ',' + z.r + ',' + z.c);
        if (d && !d.bloque && d.m[r - z.r]) { const v = d.m[r - z.r][c - z.c]; return v === undefined ? null : v; }
      }
    }
    if (!cel) return null;
    if (cel.f == null) return cel.v === undefined ? null : cel.v;
    const cle = f + ',' + r + ',' + c;
    if (this.cache.has(cle)) return this.cache.get(cle);
    if (this.enCours.has(cle)) {
      const it = this.classeur.iteration;
      if (it && it.actif) { this.cycleVu = true; const p = (this.precedents && this.precedents.get(cle)) ?? (this.dernierCycle && this.dernierCycle.get(cle)); return typeof p === 'number' ? p : typeof cel.cache === 'number' ? cel.cache : 0; }
      return err(ERR.CYCLE, 'référence circulaire : la formule de ' + adresse(r, c) + ' dépend de son propre résultat (elle cite, directement ou non, une plage qui la contient)');
    }
    this.enCours.add(cle);
    const sauve = this.courant;
    let v;
    try {
      this.courant = { feuille: f, r, c };
      v = this.evaluer(analyser(cel.f));
      // Résultat de plusieurs cellules : il déborde vers la droite et le bas (tableaux dynamiques d'Excel)
      let m = null;
      if (v instanceof Plage && v.taille > 1) m = v.matrice();
      else if (Array.isArray(v) && (v.length > 1 || (v[0] && v[0].length > 1))) m = v;
      if (m && m.length && m[0].length) {
        const h = m.length, w = Math.max(...m.map((l) => l.length));
        let bloque = false, gene = null;
        for (let i = 0; i < h && !bloque; i++) for (let j = 0; j < w; j++) {
          if (!i && !j) continue;
          const x = this.classeur.cellule(f, r + i, c + j);
          if (x && !(x.f == null && (x.v === null || x.v === undefined || x.v === '' || x.couverte))) { bloque = true; gene = adresse(r + i, c + j); break; }
        }
        this.debords.set(cle, { h, w, m, bloque });
        if (bloque && cel.cache === undefined) v = err(ERR.DEBORD, 'le résultat (' + h + ' × ' + w + ') doit remplir ' + adresse(r, c) + ':' + adresse(r + h - 1, c + w - 1) + ', mais ' + gene + ' n\'est pas vide' + (x0(this.classeur.cellule(f, ...a1(gene))) ? ' (elle contient aussi une formule : effacez-la, ou validez la formule avec Ctrl+Maj+Entrée sur la plage choisie)' : ''));
        else if (bloque) v = v instanceof Plage ? v.scalaire() : m[0][0]; // ancienne formule d'un fichier Excel : intersection implicite
        else v = m[0][0];
      } else {
        if (v instanceof Plage) v = v.scalaire();
        if (Array.isArray(v)) v = v[0] && v[0][0] !== undefined ? v[0][0] : null;
      }
      if (v instanceof Plage) v = v.scalaire();
      if (v instanceof Lambda) v = err(ERR.VALEUR, 'LAMBDA sans appel');
      if (v === undefined) v = null;
    } catch (e) {
      if (e instanceof ErreurFormule) v = e;
      else if (e instanceof RangeError) v = err(ERR.CYCLE);
      else throw e;
    } finally {
      this.courant = sauve;
      this.enCours.delete(cle);
    }
    // Une fonction VBA qui ne peut pas encore répondre (table pas chargée, macro absente) : comme Excel à l'ouverture,
    // on garde la valeur enregistrée dans le fichier tant que la cellule n'a pas été recalculée pour de bon.
    // Seulement tant que le code VBA est celui du fichier : une fois le code modifié ici, l'erreur se voit (comme Excel,
    // qui remet le projet à zéro quand on modifie le code).
    const codeDuFichier = !this.classeur.vbaCode || this.classeur._codeFichier === undefined || this.classeur.vbaCode === this.classeur._codeFichier;
    if (v instanceof ErreurFormule && v.vba && codeDuFichier && cel.cache !== undefined && cel.cache !== null && !(cel.cache instanceof ErreurFormule)) {
      (this.gardees || (this.gardees = new Map())).set(cle, v);
      v = cel.cache;
    } else if (this.gardees) this.gardees.delete(cle);
    this.cache.set(cle, v);
    return v;
  }

  /** Évalue une formule isolée (texte) dans le contexte d'une cellule. */
  evaluerFormule(formule, feuille = 0, r = 0, c = 0) {
    const sauve = this.courant;
    this.courant = { feuille, r, c };
    try {
      let v = this.evaluer(analyser(formule));
      if (v instanceof Plage) v = v.taille === 1 ? v.valeur(0, 0) : v.matrice();
      return v;
    } catch (e) {
      if (e instanceof ErreurFormule) return e;
      throw e;
    } finally { this.courant = sauve; }
  }

  plageDepuisToken(tok) {
    let f = this.courant.feuille;
    if (tok.feuille != null) {
      f = this.classeur.indexFeuille(tok.feuille);
      if (f < 0) throw err(ERR.REF, 'feuille ' + tok.feuille);
    }
    if (tok.debord) {
      const a = parseAdresse(tok.v.replace(/\$/g, ''));
      if (!a) throw err(ERR.REF);
      this.valeur(f, a.r, a.c);
      const d = this.debords.get(f + ',' + a.r + ',' + a.c);
      if (!d) { const cel = this.classeur.cellule(f, a.r, a.c); if (!cel || cel.f == null) throw err(ERR.REF); return new Plage(this, f, a.r, a.c, a.r, a.c); }
      if (d.bloque) throw err(ERR.DEBORD);
      return new Plage(this, f, a.r, a.c, a.r + d.h - 1, a.c + d.w - 1);
    }
    return this.plageDepuisTexte(tok.v, f);
  }

  /** Plage d'une référence structurée (Tableau1[Ventes], [@Prix], Tableau1[[#Tout];[A]:[C]]). */
  plageTableau(nom, spec) {
    const C = this.classeur;
    if (!C.tableau) throw err(ERR.NOM);
    const { feuille, r, c } = this.courant;
    const x = nom ? C.tableau(nom) : C.tableauEn(feuille, r, c);
    if (!x) throw err(nom ? ERR.NOM : ERR.REF, nom || spec);
    const { fi, t } = x, o = lireSpec(spec);
    const cols = C.nomsColonnes(fi, t);
    const idx = (n) => { const i = cols.findIndex((k) => k.toLowerCase() === String(n).trim().toLowerCase()); if (i < 0) throw err(ERR.REF, n); return t.c1 + i; };
    let c1 = t.c1, c2 = t.c2;
    if (o.col1 != null) { c1 = idx(o.col1); c2 = o.col2 != null ? idx(o.col2) : c1; if (c2 < c1) [c1, c2] = [c2, c1]; }
    const haut = t.entete === false ? null : t.r1, d1 = t.entete === false ? t.r1 : t.r1 + 1, d2 = t.totaux ? t.r2 - 1 : t.r2, tot = t.totaux ? t.r2 : null;
    let r1 = Infinity, r2 = -Infinity;
    const prendre = (a, b) => { if (a == null) return; r1 = Math.min(r1, a); r2 = Math.max(r2, b); };
    for (const z of o.zones) {
      if (z === 'tout') prendre(t.r1, t.r2);
      else if (z === 'donnees') prendre(d1, Math.max(d1, d2));
      else if (z === 'entetes') prendre(haut, haut);
      else if (z === 'totaux') prendre(tot, tot);
      else if (z === 'ligne') { if (fi !== feuille || r < d1 || r > d2) throw err(ERR.VALEUR); prendre(r, r); }
    }
    if (r1 === Infinity) throw err(ERR.REF);
    return new Plage(this, fi, r1, c1, r2, c2);
  }

  plageDepuisTexte(texte, f) {
    const s = texte.replace(/\$/g, '');
    let m;
    if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(s))) return new Plage(this, f, 0, lettresVersCol(m[1]), 1048575, lettresVersCol(m[2]));
    if ((m = /^(\d+):(\d+)$/.exec(s))) return new Plage(this, f, +m[1] - 1, 0, +m[2] - 1, 16383);
    const p = parsePlage(s);
    if (!p) throw err(ERR.REF);
    return new Plage(this, f, p.r1, p.c1, p.r2, p.c2);
  }

  evaluer(n) {
    switch (n.k) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'vide': return null;
      case 'err': throw err(n.v);
      case 'ref': return this.plageDepuisToken({ feuille: n.feuille, v: n.plage, debord: n.debord });
      case 'nom': {
        // Variable de LET ou paramètre de LAMBDA
        if (this.portees && this.portees.length) { const k = n.v.toUpperCase(); for (let i = this.portees.length - 1; i >= 0; i--) if (this.portees[i].has(k)) { const v = this.portees[i].get(k); if (v === NON_FOURNI) return null; return v; } }
        const def = this.classeur.nom(n.v, this.courant.feuille);
        if (def === undefined && this.classeur.tableau && this.classeur.tableau(n.v)) return this.plageTableau(n.v, '[#Données]');
        if (def === undefined) throw err(ERR.NOM, n.v);
        if (typeof def === 'number' || typeof def === 'boolean') return def;
        return this.evaluer(analyser(String(def).startsWith('=') ? def : '=' + def));
      }
      case 'tref': return this.plageTableau(n.table, n.spec);
      case 'tab': return n.lignes.map((l) => l.map((x) => scal(this.evaluer(x))));
      case 'pct': return N(this.evaluer(n.a)) / 100;
      case 'un': return -N(this.evaluer(n.a));
      case 'inter': { const v = this.evaluer(n.a); if (v instanceof Plage) return v.scalaire(); if (Array.isArray(v)) return v[0] && v[0][0] !== undefined ? v[0][0] : null; return v; }
      case 'bin': return this.binaire(n);
      case 'fn': {
        // Une Function VBA du classeur passe avant la fonction d'Excel du même nom anglais
        // (dans Excel en français, « =Duration(…) » appelle la fonction VBA : DURATION s'y écrit DUREE)
        if (!this.classeur.udf && !this.classeur._udfEssaye && this.classeur.constructor.chargeurUDF) this.classeur.constructor.chargeurUDF(this.classeur);
        let def = this.classeur.udf && !estNomFrancais(n.nom) ? (() => { const u = this.classeur.udf(n.nom); return u ? { nom: n.nom, fn: u } : null; })() : null;
        if (!def) def = fonction(n.nom);
        // Une LAMBDA rangée dans une variable de LET ou dans un nom défini s'appelle comme une fonction
        if (!def) {
          let f = null;
          const k = n.nom.toUpperCase();
          if (this.portees) for (let i = this.portees.length - 1; i >= 0 && !f; i--) if (this.portees[i].has(k)) f = this.portees[i].get(k);
          if (!f) { const d = this.classeur.nom(n.nom, this.courant.feuille); if (typeof d === 'string' && /^=?\s*(_xlfn\.)?LAMBDA\s*\(/i.test(d)) f = this.evaluer(analyser(d.startsWith('=') ? d : '=' + d)); }
          if (f instanceof Lambda) return appelerLambda(this, f, n.args.map((a) => (a.k === 'vide' ? null : this.evaluer(a))));
        }
        if (!def && this.classeur.udf) { const u = this.classeur.udf(n.nom); if (u) def = { nom: n.nom, fn: u }; }
        if (!def) { const e = err(ERR.NOM, n.nom); if (this.classeur.macros) e.vba = true; throw e; }
        // Dans les arguments d'une fonction, les plages s'évaluent en tableau (pas d'intersection implicite).
        this.profondeurFn = (this.profondeurFn || 0) + 1;
        try {
          if (def.paresseux) return def.fn(n.args, (x) => this.evaluer(x), this);
          const args = n.args.map((a) => (a.k === 'vide' ? undefined : this.evaluer(a)));
          return def.fn(args, this);
        } finally { this.profondeurFn--; }
      }
    }
    throw err(ERR.VALEUR);
  }

  binaire(n) {
    if (n.op === ':') {
      const a = this.evaluer(n.a), b = this.evaluer(n.b);
      if (!(a instanceof Plage) || !(b instanceof Plage)) throw err(ERR.VALEUR);
      return new Plage(this, a.feuille, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2));
    }
    let a = this.evaluer(n.a), b = this.evaluer(n.b);
    // Opérations élément par élément sur les tableaux
    const estTab = (v) => Array.isArray(v) || (v instanceof Plage && v.taille > 1 && (this.profondeurFn > 0 || !this.intersectionPossible(v)));
    if (estTab(a) || estTab(b)) {
      const A = matrice(a), Bm = matrice(b);
      const l = Math.max(A.length, Bm.length), c = Math.max((A[0] || []).length, (Bm[0] || []).length);
      const out = [];
      for (let i = 0; i < l; i++) {
        const ligne = [];
        for (let j = 0; j < c; j++) {
          const x = A[A.length === 1 ? 0 : i], y = Bm[Bm.length === 1 ? 0 : i];
          const xv = x ? x[x.length === 1 ? 0 : j] : undefined, yv = y ? y[y.length === 1 ? 0 : j] : undefined;
          try { ligne.push(xv === undefined || yv === undefined ? err(ERR.NA) : this.opScalaire(n.op, xv, yv)); }
          catch (e) { if (e instanceof ErreurFormule) ligne.push(e); else throw e; }
        }
        out.push(ligne);
      }
      return out;
    }
    return this.opScalaire(n.op, scal(a), scal(b));
  }

  intersectionPossible(p) {
    const { r, c } = this.courant;
    return (p.c1 === p.c2 && r >= p.r1 && r <= p.r2) || (p.r1 === p.r2 && c >= p.c1 && c <= p.c2);
  }

  opScalaire(op, a, b) {
    if (a instanceof ErreurFormule) throw a;
    if (b instanceof ErreurFormule) throw b;
    switch (op) {
      case '+': return N(a) + N(b);
      case '-': return N(a) - N(b);
      case '*': return N(a) * N(b);
      case '/': { const d = N(b); if (d === 0) throw err(ERR.DIV0); return N(a) / d; }
      case '^': { const r = Math.pow(N(a), N(b)); if (!Number.isFinite(r)) throw err(ERR.NUM); return r; }
      case '&': return versTexte(a) + versTexte(b);
      case '=': return comparer(a, b) === 0;
      case '<>': return comparer(a, b) !== 0;
      case '<': return comparer(a, b) < 0;
      case '>': return comparer(a, b) > 0;
      case '<=': return comparer(a, b) <= 0;
      case '>=': return comparer(a, b) >= 0;
    }
    throw err(ERR.VALEUR);
  }
}

// ---------------------------------------------------------------------------
// Décalage des références (copier-coller, recopie)
// ---------------------------------------------------------------------------

/** Décale les références relatives d'une formule de dr lignes et dc colonnes. */
export function decalerFormule(formule, dr, dc) {
  if (!formule || !formule.startsWith('=') || (dr === 0 && dc === 0)) return formule;
  const src = formule.slice(1);
  let toks;
  try { toks = tokeniser(src); } catch { return formule; }
  let out = '', pos = 0;
  for (const t of toks) {
    out += src.slice(pos, t.pos);
    if (t.t === T.REF) {
      const prefixe = src.slice(t.pos, t.fin).split('!').length > 1 ? src.slice(t.pos, t.fin).slice(0, src.slice(t.pos, t.fin).lastIndexOf('!') + 1) : '';
      out += prefixe + decalerRef(t.v, dr, dc) + (t.debord ? '#' : '');
    } else out += src.slice(t.pos, t.fin);
    pos = t.fin;
  }
  out += src.slice(pos);
  return '=' + out;
}

function decalerRef(ref, dr, dc) {
  return ref.split(':').map((part) => {
    let m;
    if ((m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(part))) {
      let c = lettresVersCol(m[2]), r = +m[4] - 1;
      if (!m[1]) c += dc;
      if (!m[3]) r += dr;
      if (r < 0 || c < 0) return '#REF!';
      return m[1] + colVersLettres(c) + m[3] + (r + 1);
    }
    if ((m = /^(\$?)([A-Za-z]{1,3})$/.exec(part))) {
      let c = lettresVersCol(m[2]);
      if (!m[1]) c += dc;
      return c < 0 ? '#REF!' : m[1] + colVersLettres(c);
    }
    if ((m = /^(\$?)(\d+)$/.exec(part))) {
      let r = +m[2] - 1;
      if (!m[1]) r += dr;
      return r < 0 ? '#REF!' : m[1] + (r + 1);
    }
    return part;
  }).join(':');
}

// Fonctions récentes qu'Excel attend préfixées par _xlfn. dans le fichier
const XLFN = new Set(['IFS', 'SWITCH', 'IFNA', 'XLOOKUP', 'XMATCH', 'MAXIFS', 'MINIFS', 'TEXTJOIN', 'CONCAT', 'UNIQUE', 'SORT', 'FILTER', 'SEQUENCE',
  'DAYS', 'ISOWEEKNUM', 'NUMBERVALUE', 'UNICHAR', 'UNICODE', 'GAUSS', 'PHI', 'RRI', 'PDURATION', 'AGGREGATE', 'MUNIT', 'GAMMA', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT',
  'FORECAST.LINEAR', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'NORM.DIST', 'NORM.INV', 'NORM.S.DIST', 'NORM.S.INV', 'LOGNORM.DIST', 'LOGNORM.INV', 'EXPON.DIST',
  'POISSON.DIST', 'BINOM.DIST', 'GAMMA.DIST', 'CHISQ.DIST', 'CHISQ.DIST.RT', 'T.DIST', 'T.DIST.2T', 'T.DIST.RT', 'BETA.DIST', 'WEIBULL.DIST', 'GAMMALN.PRECISE',
  'CONFIDENCE.NORM', 'PERCENTILE.INC', 'PERCENTILE.EXC', 'QUARTILE.INC', 'QUARTILE.EXC', 'RANK.EQ', 'RANK.AVG', 'MODE.SNGL', 'CEILING.MATH', 'FLOOR.MATH',
  'COVARIANCE.P', 'COVARIANCE.S', 'NETWORKDAYS.INTL', 'WORKDAY.INTL', 'T.INV', 'T.INV.2T', 'T.TEST', 'CHISQ.INV', 'CHISQ.INV.RT', 'CHISQ.TEST', 'F.DIST', 'F.DIST.RT',
  'F.INV', 'F.INV.RT', 'F.TEST', 'GAMMA.INV', 'BETA.INV', 'BINOM.INV', 'NEGBINOM.DIST', 'HYPGEOM.DIST', 'CONFIDENCE.T', 'Z.TEST', 'PERCENTRANK.INC', 'PERCENTRANK.EXC',
  'BINOM.DIST.RANGE', 'LET', 'LAMBDA', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED', 'RANDARRAY', 'SORTBY', 'TAKE', 'DROP', 'VSTACK', 'HSTACK',
  'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'CHOOSECOLS', 'CHOOSEROWS', 'EXPAND', 'FORMULATEXT', 'ISFORMULA', 'PERCENTOF']);
const ALIAS_INVERSE = {};
for (const [fr, en] of Object.entries(ALIAS)) if (!ALIAS_INVERSE[en] && !FONCTIONS[fr]) ALIAS_INVERSE[en] = fr;

/**
 * Convertit une formule entre la syntaxe des fichiers Excel (noms anglais, « , » entre arguments, « . » décimal)
 * et la syntaxe française de l'interface (noms français, « ; », virgule décimale acceptée).
 * sens : 'fr' (fichier → interface) ou 'en' (interface → fichier).
 */
export function convertirFormule(formule, sens, ctx = {}) {
  if (!formule || !formule.startsWith('=')) return formule;
  const src = formule.slice(1);
  let toks;
  try { toks = tokeniser(src, sens === 'fr' ? 'en' : undefined); } catch { return formule; }
  // Paramètres de LET et LAMBDA : Excel les écrit « _xlpm.x » dans le fichier
  const params = sens === 'en' && /\b(LET|LAMBDA)\s*\(/i.test(src) ? parametresLambda(toks) : null;
  let out = '', pos = 0, accolades = 0;
  for (const t of toks) {
    if (t.t === T.NOM && sens === 'fr' && /^_xlpm\./i.test(t.v)) { out += src.slice(pos, t.pos) + t.v.slice(6); pos = t.fin; continue; }
    if (t.t === T.NOM && params && params.has(t.v.toUpperCase())) { out += src.slice(pos, t.pos) + '_xlpm.' + t.v; pos = t.fin; continue; }
    out += src.slice(pos, t.pos);
    const brut = src.slice(t.pos, t.fin);
    if (t.t === T.ACCO) accolades++; else if (t.t === T.ACCF) accolades--;
    if (t.t === T.SEP && accolades > 0) out += brut; // constante {1,2;3,4} : même écriture dans les deux langues
    else if (t.t === T.SEP) out += sens === 'fr' ? ';' : ',';
    else if (t.t === T.NOMBRE) out += sens === 'fr' ? brut : brut.replace(',', '.');
    else if (t.t === T.BOOL) out += sens === 'fr' ? (t.v ? 'VRAI' : 'FAUX') : (t.v ? 'TRUE' : 'FALSE');
    else if (t.t === T.TREF) out += (t.table || (sens === 'en' && ctx.table) || '') + ecrireSpec(t.spec, sens);
    else if (t.t === T.FONCTION) {
      let nom = t.v.replace(/^_XLFN\.|^_XLWS\./, '');
      const ecrit = brut.replace(/\s*\($/, '').replace(/^_xlfn\.|^_xlws\./i, '');
      // Une fonction VBA garde son nom tel quel : Excel écrit ses fonctions en majuscules (DURATION), une Function VBA
      // comme elle est déclarée (Duration) ; dans l'autre sens, un nom anglais qui est aussi une Function VBA du classeur reste anglais
      const vba = sens === 'fr' ? /[a-z]/.test(ecrit) || (ctx.udf && ctx.udf(nom)) : ctx.udf && !estNomFrancais(nom) && ctx.udf(nom);
      if (vba) nom = ecrit;
      else if (sens === 'fr') nom = ALIAS_INVERSE[nom] || ecrit;
      else { const def = fonction(nom); if (def) { nom = def.nom; if (XLFN.has(nom)) nom = '_xlfn.' + nom; } else nom = ecrit; }
      out += nom + '(';
    } else out += brut;
    pos = t.fin;
  }
  out += src.slice(pos);
  return '=' + out;
}

// Noms des paramètres déclarés par LET (arguments impairs sauf le dernier) et LAMBDA (tous sauf le dernier)
function parametresLambda(toks) {
  const params = new Set(), pile = [];
  toks.forEach((t, i) => {
    if (t.t === T.FONCTION) { pile.push({ nom: t.v.replace(/^_XLFN\./, ''), arg: 0, debut: i + 1 }); return; }
    if (t.t === T.PARO) { pile.push({ nom: '(', arg: 0 }); return; }
    const haut = pile[pile.length - 1];
    if (!haut) return;
    const fin = t.t === T.SEP || t.t === T.PARF;
    if (fin && (haut.nom === 'LET' || haut.nom === 'LAMBDA')) {
      const seul = i - haut.debut === 1 && toks[haut.debut].t === T.NOM;
      if (seul && t.t === T.SEP && (haut.nom === 'LAMBDA' || haut.arg % 2 === 0)) params.add(toks[haut.debut].v.toUpperCase());
    }
    if (t.t === T.SEP) { haut.arg++; haut.debut = i + 1; }
    if (t.t === T.PARF) pile.pop();
  });
  return params;
}

/** Remplace les références structurées d'une formule : fn(table, spec) → texte (ou null pour garder). */
export function remplacerTref(formule, fn) {
  const src = formule.startsWith('=') ? formule.slice(1) : formule;
  const toks = tokeniser(src);
  let out = '', pos = 0;
  for (const t of toks) {
    out += src.slice(pos, t.pos);
    const brut = src.slice(t.pos, t.fin);
    if (t.t === T.TREF) { const x = fn(t.table, t.spec); out += x == null ? brut : x; } else out += brut;
    pos = t.fin;
  }
  return (formule.startsWith('=') ? '=' : '') + out + src.slice(pos);
}

/** Renvoie les références (plages) utilisées par une formule : pour la coloration. */
export function referencesDe(formule) {
  try {
    return tokeniser(formule.startsWith('=') ? formule.slice(1) : formule).filter((t) => t.t === T.REF).map((t) => ({ feuille: t.feuille, ref: t.v, pos: t.pos + 1, fin: t.fin + 1 }));
  } catch { return []; }
}
