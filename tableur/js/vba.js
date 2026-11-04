// Interpréteur VBA (sous-ensemble) pour le Tableur. Sans DOM.
//
// Pris en charge : Sub / Function (ByVal, Optional), Dim / ReDim [Preserve] / Const,
// tableaux à 1 ou 2 dimensions, If / ElseIf / Else, Select Case, For / Next, For Each,
// Do While / Until / Loop, While / Wend, Exit, With, GoTo (étiquettes), On Error Resume Next
// et On Error GoTo, Err, MsgBox / InputBox / Debug.Print, Collection, Scripting.Dictionary,
// le modèle objet Excel : Application, ThisWorkbook, Worksheets / Sheets, ActiveSheet,
// Range, Cells, Rows, Columns, Offset, Resize, Value, Formula, Text, Font, Interior,
// NumberFormat, UsedRange, End(xlUp…), WorksheetFunction (toutes les fonctions du moteur de formules).

import { fonction as fonctionFeuille, Plage, ErreurFormule, versNombre, adresse, parsePlage, colVersLettres, lettresVersCol, formater, formaterDate, formaterNombre, dateVersSerie, serieVersDate, nombreVersTexte, OPTIONS } from './formules.js';

// ---------------------------------------------------------------------------
// Erreurs d'exécution
// ---------------------------------------------------------------------------

export class ErreurVBA extends Error {
  constructor(numero, description, ligne) {
    super((ligne ? 'ligne ' + ligne + ' : ' : '') + description);
    this.numero = numero;
    this.description = description;
    this.ligne = ligne;
  }
}
const erreur = (num, desc, ligne) => new ErreurVBA(num, desc, ligne);
const E_TYPE = 13, E_INDICE = 9, E_OBJET = 91, E_DIV0 = 11, E_DEBORD = 6, E_ARG = 5, E_MEMBRE = 438, E_NOM = 1004;

// Signaux de contrôle (Exit, GoTo)
class SignalExit { constructor(quoi) { this.quoi = quoi; } }
class SignalGoTo { constructor(label) { this.label = label; } }

// ---------------------------------------------------------------------------
// Valeurs
// ---------------------------------------------------------------------------

export const Nothing = Symbol('Nothing');
export const Empty = undefined;
export const Null = null;

export class TableauVBA {
  /** dims : [{lb, ub}, …] */
  constructor(dims, base = 0) {
    this.dims = dims.map((d) => ({ lb: d.lb ?? base, ub: d.ub }));
    const n = this.dims.reduce((p, d) => p * Math.max(0, d.ub - d.lb + 1), 1);
    this.data = new Array(n).fill(undefined);
  }
  static depuisListe(liste, base = 0) {
    const t = new TableauVBA([{ lb: base, ub: base + liste.length - 1 }]);
    t.data = [...liste];
    return t;
  }
  static depuisMatrice(m) {
    const t = new TableauVBA([{ lb: 1, ub: m.length }, { lb: 1, ub: (m[0] || []).length }]);
    for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) t.data[i * t.dims[1].ub + j] = m[i][j];
    return t;
  }
  pos(idx) {
    if (idx.length !== this.dims.length) throw erreur(E_INDICE, 'L\'indice n\'appartient pas à la sélection');
    let p = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = Math.trunc(idx[k]), d = this.dims[k];
      if (i < d.lb || i > d.ub) throw erreur(E_INDICE, 'L\'indice n\'appartient pas à la sélection');
      p = p * (d.ub - d.lb + 1) + (i - d.lb);
    }
    return p;
  }
  get(idx) { return this.data[this.pos(idx)]; }
  set(idx, v) { this.data[this.pos(idx)] = v; }
  lbound(d = 1) { return this.dims[d - 1].lb; }
  ubound(d = 1) { return this.dims[d - 1].ub; }
  liste() { return this.data; }
  matrice() {
    if (this.dims.length === 1) return [this.data.slice()];
    const l = this.dims[0].ub - this.dims[0].lb + 1, c = this.dims[1].ub - this.dims[1].lb + 1;
    const out = [];
    for (let i = 0; i < l; i++) out.push(this.data.slice(i * c, i * c + c));
    return out;
  }
}

function remplirDefaut(t, seulementVides = false) {
  const type = (t.type || '').toUpperCase();
  let d;
  if (['INTEGER', 'LONG', 'DOUBLE', 'SINGLE', 'CURRENCY', 'BYTE', 'LONGLONG', 'DECIMAL', 'DATE'].includes(type)) d = 0;
  else if (type === 'STRING') d = '';
  else if (type === 'BOOLEAN') d = false;
  else return;
  for (let i = 0; i < t.data.length; i++) if (!seulementVides || t.data[i] === undefined) t.data[i] = d;
}

export class CollectionVBA {
  constructor() { this.items = []; this.cles = []; }
  add(item, cle, avant, apres) {
    if (cle !== undefined) { cle = String(cle); if (this.cles.some((k) => k != null && k.toLowerCase() === cle.toLowerCase())) throw erreur(457, 'Cette clé est déjà associée à un élément de cette collection'); }
    let pos = this.items.length;
    if (avant !== undefined) pos = this.indexDe(avant);
    else if (apres !== undefined) pos = this.indexDe(apres) + 1;
    this.items.splice(pos, 0, item);
    this.cles.splice(pos, 0, cle);
  }
  indexDe(x) {
    if (typeof x === 'number') { if (x < 1 || x > this.items.length) throw erreur(E_INDICE, 'L\'indice n\'appartient pas à la sélection'); return x - 1; }
    const i = this.cles.findIndex((k) => k != null && k.toLowerCase() === String(x).toLowerCase());
    if (i < 0) throw erreur(E_INDICE, 'L\'indice n\'appartient pas à la sélection');
    return i;
  }
  item(x) { return this.items[this.indexDe(x)]; }
  remove(x) { const i = this.indexDe(x); this.items.splice(i, 1); this.cles.splice(i, 1); }
  get count() { return this.items.length; }
}

export class DictionnaireVBA {
  constructor() { this.map = new Map(); this.compareMode = 0; }
  cle(k) { return this.compareMode === 1 && typeof k === 'string' ? k.toLowerCase() : (typeof k === 'number' ? k : String(k)); }
  add(k, v) { if (this.map.has(this.cle(k))) throw erreur(457, 'Cette clé est déjà associée à un élément de cette collection'); this.map.set(this.cle(k), { k, v }); }
  exists(k) { return this.map.has(this.cle(k)); }
  item(k) { const e = this.map.get(this.cle(k)); return e ? e.v : undefined; }
  setItem(k, v) { const c = this.cle(k); if (this.map.has(c)) this.map.get(c).v = v; else this.map.set(c, { k, v }); }
  remove(k) { if (!this.map.delete(this.cle(k))) throw erreur(32811, 'Clé introuvable'); }
  removeAll() { this.map.clear(); }
  keys() { return TableauVBA.depuisListe([...this.map.values()].map((e) => e.k)); }
  items() { return TableauVBA.depuisListe([...this.map.values()].map((e) => e.v)); }
  get count() { return this.map.size; }
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function estObjet(v) { return v !== null && typeof v === 'object' && !(v instanceof TableauVBA); }

function nombre(v, ligne) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? -1 : 0;
  if (v === undefined || v === null) return 0;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (s === '') return 0;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
    if (/^&[hH][0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
    throw erreur(E_TYPE, 'Type incompatible : « ' + v + ' » n\'est pas un nombre', ligne);
  }
  if (v instanceof ErreurFormule) throw erreur(E_TYPE, 'Type incompatible : ' + v.code, ligne);
  if (v instanceof ObjetVBA) { const d = v.defaut(); if (d !== v) return nombre(d, ligne); }
  throw erreur(E_TYPE, 'Type incompatible', ligne);
}

function texte(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Vrai' : 'Faux';
  if (typeof v === 'number') return nombreVersTexte(v).replace('.', OPTIONS.decimal);
  if (v instanceof ErreurFormule) return 'Erreur ' + v.code;
  if (v instanceof ObjetVBA) { const d = v.defaut(); if (d !== v) return texte(d); return v.typeName; }
  if (v === Nothing) return 'Nothing';
  return String(v);
}

function booleen(v, ligne) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'vrai') return true;
    if (s === 'false' || s === 'faux') return false;
    return nombre(v, ligne) !== 0;
  }
  if (v instanceof ObjetVBA) { const d = v.defaut(); if (d !== v) return booleen(d, ligne); }
  throw erreur(E_TYPE, 'Type incompatible', ligne);
}

function scalaire(v) {
  if (v instanceof ObjetVBA) { const d = v.defaut(); if (d !== v) return d; }
  return v;
}

function comparerVBA(a, b, op, ligne) {
  a = scalaire(a); b = scalaire(b);
  if (a === null || b === null) return null; // Null se propage
  let c;
  if (typeof a === 'string' && typeof b === 'string') c = a < b ? -1 : a > b ? 1 : 0; // Option Compare Binary
  else if (typeof a === 'string' && (b === undefined)) c = a === '' ? 0 : 1;
  else if (typeof b === 'string' && (a === undefined)) c = b === '' ? 0 : -1;
  else if (typeof a === 'string' || typeof b === 'string') {
    // Un texte et un nombre : VBA compare en texte si le texte n'est pas numérique, sinon en nombre
    let x, y;
    try { x = nombre(a, ligne); y = nombre(b, ligne); c = x < y ? -1 : x > y ? 1 : 0; }
    catch { const s = texte(a), t = texte(b); c = s < t ? -1 : s > t ? 1 : 0; }
  } else { const x = nombre(a, ligne), y = nombre(b, ligne); c = x < y ? -1 : x > y ? 1 : 0; }
  switch (op) {
    case '=': return c === 0; case '<>': return c !== 0; case '<': return c < 0;
    case '>': return c > 0; case '<=': return c <= 0; case '>=': return c >= 0;
  }
  return false;
}

function like(s, motif) {
  let re = '^';
  for (let i = 0; i < motif.length; i++) {
    const ch = motif[i];
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if (ch === '#') re += '\\d';
    else if (ch === '[') { const j = motif.indexOf(']', i); if (j < 0) { re += '\\['; continue; } let cls = motif.slice(i + 1, j); if (cls.startsWith('!')) cls = '^' + cls.slice(1); re += '[' + cls.replace(/\\/g, '\\\\') + ']'; i = j; }
    else re += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(re + '$').test(s);
}

// Arrondi bancaire de VBA (Round(2.5) = 2)
function arrondiBancaire(x, n = 0) {
  const f = Math.pow(10, n);
  const y = x * f;
  const r = Math.round(y);
  if (Math.abs(y - Math.trunc(y)) === 0.5 && r % 2 !== 0) return (r - Math.sign(y)) / f;
  return r / f;
}

// ---------------------------------------------------------------------------
// Analyse lexicale
// ---------------------------------------------------------------------------

const MOTS_CLES = new Set(['AND', 'OR', 'NOT', 'XOR', 'EQV', 'IMP', 'MOD', 'IS', 'LIKE', 'NEW', 'TO', 'STEP', 'THEN', 'ELSE', 'ELSEIF',
  'IF', 'END', 'SUB', 'FUNCTION', 'DIM', 'AS', 'FOR', 'EACH', 'IN', 'NEXT', 'DO', 'LOOP', 'WHILE', 'UNTIL', 'WEND', 'SELECT', 'CASE',
  'EXIT', 'SET', 'LET', 'CALL', 'WITH', 'CONST', 'REDIM', 'PRESERVE', 'PUBLIC', 'PRIVATE', 'STATIC', 'OPTIONAL', 'BYVAL', 'BYREF',
  'PARAMARRAY', 'ON', 'ERROR', 'GOTO', 'RESUME', 'OPTION', 'EXPLICIT', 'BASE', 'TRUE', 'FALSE', 'NOTHING', 'EMPTY', 'NULL', 'ERASE',
  'TYPE', 'ENUM', 'DECLARE', 'PROPERTY', 'GET', 'STOP', 'ATTRIBUTE', 'COMPARE', 'GLOBAL', 'FRIEND']);

function tokeniserVBA(src) {
  const toks = [];
  const lignes = src.replace(/\r\n?/g, '\n').split('\n');
  let ligne = 0;
  let courante = '';
  let debut = 1;
  const flush = (texteLigne, numero) => {
    let i = 0;
    const s = texteLigne;
    let dernierSep = true;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (ch === "'") break; // commentaire
      if (dernierSep && /^rem\b/i.test(s.slice(i))) break;
      if (ch === '"') {
        let j = i + 1, v = '';
        for (;;) {
          if (j >= s.length) throw erreur(E_ARG, 'Chaîne non terminée', numero);
          if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; }
          v += s[j++];
        }
        toks.push({ t: 'str', v, l: numero }); i = j + 1; dernierSep = false; continue;
      }
      if (ch === '#') {
        const j = s.indexOf('#', i + 1);
        if (j > 0 && /\d/.test(s.slice(i + 1, j))) {
          const d = parseDateLitterale(s.slice(i + 1, j), numero);
          toks.push({ t: 'num', v: d, l: numero }); i = j + 1; dernierSep = false; continue;
        }
      }
      let m;
      if ((m = /^&[hH][0-9a-fA-F]+[&%]?/.exec(s.slice(i)))) { toks.push({ t: 'num', v: parseInt(m[0].slice(2).replace(/[&%]$/, ''), 16), l: numero }); i += m[0].length; dernierSep = false; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[%&!#@]?/.exec(s.slice(i)))) { toks.push({ t: 'num', v: parseFloat(m[0].replace(/[%&!#@]$/, '')), l: numero }); i += m[0].length; dernierSep = false; continue; }
      if ((m = /^\[([^\]]+)\]/.exec(s.slice(i)))) { toks.push({ t: 'id', v: m[1], l: numero }); i += m[0].length; dernierSep = false; continue; }
      if ((m = /^[A-Za-z_À-ſ][\wÀ-ſ]*[$%&!#@]?/.exec(s.slice(i)))) {
        let nom = m[0].replace(/[$%&!#@]$/, '');
        const up = nom.toUpperCase();
        toks.push({ t: MOTS_CLES.has(up) ? 'kw' : 'id', v: MOTS_CLES.has(up) ? up : nom, l: numero });
        i += m[0].length; dernierSep = false; continue;
      }
      if ((m = /^(:=|<=|>=|<>|=<|=>|><|[-+*/\\^&=<>(),.;:])/.exec(s.slice(i)))) {
        let op = m[0];
        if (op === '=<') op = '<='; if (op === '=>') op = '>='; if (op === '><') op = '<>';
        if (op === ':') { toks.push({ t: 'nl', l: numero, sep: true }); dernierSep = true; }
        else { toks.push({ t: 'op', v: op, l: numero }); dernierSep = false; }
        i += m[0].length; continue;
      }
      throw erreur(E_ARG, 'Caractère inattendu « ' + ch + ' »', numero);
    }
    toks.push({ t: 'nl', l: numero });
  };
  for (const l of lignes) {
    ligne++;
    const sansComm = l.replace(/^(\s*)'.*$/, '$1');
    // Continuation de ligne : un « _ » en fin de ligne
    if (/\s_\s*$/.test(sansComm) && !/^\s*'/.test(l)) { courante += sansComm.replace(/\s_\s*$/, ' '); if (!courante.trim()) debut = ligne + 1; continue; }
    const complet = courante + l;
    if (!courante) debut = ligne;
    courante = '';
    if (complet.trim() === '') continue;
    flush(complet, debut);
  }
  if (courante.trim()) flush(courante, debut);
  return toks;
}

function parseDateLitterale(s, ligne) {
  let m;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    // Format VBA : mois/jour/année
    const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    return dateVersSerie(d);
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return dateVersSerie(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  throw erreur(E_ARG, 'Date invalide #' + s + '#', ligne);
}

// ---------------------------------------------------------------------------
// Analyse syntaxique
// ---------------------------------------------------------------------------

class ParseurVBA {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek(k = 0) { return this.toks[this.i + k] || { t: 'eof' }; }
  next() { return this.toks[this.i++] || { t: 'eof' }; }
  estKw(v, k = 0) { const t = this.peek(k); return t.t === 'kw' && t.v === v; }
  estOp(v, k = 0) { const t = this.peek(k); return t.t === 'op' && t.v === v; }
  estId(v, k = 0) { const t = this.peek(k); return t.t === 'id' && (v === undefined || t.v.toUpperCase() === v); }
  attendreKw(v) { const t = this.next(); if (t.t !== 'kw' || t.v !== v) throw erreur(E_ARG, 'Attendu « ' + v + ' »', t.l); return t; }
  attendreOp(v) { const t = this.next(); if (t.t !== 'op' || t.v !== v) throw erreur(E_ARG, 'Attendu « ' + v + ' »', t.l); return t; }
  attendreId() { const t = this.next(); if (t.t !== 'id') throw erreur(E_ARG, 'Nom attendu', t.l); return t.v; }
  finLigne() { while (this.peek().t === 'nl') this.next(); }
  attendreNl() { const t = this.peek(); if (t.t !== 'nl' && t.t !== 'eof') throw erreur(E_ARG, 'Fin d\'instruction attendue, trouvé « ' + (t.v ?? t.t) + ' »', t.l); this.finLigne(); }

  programme() {
    const prog = { procedures: new Map(), globales: [], base: 0, explicit: false };
    this.finLigne();
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (t.t === 'kw' && t.v === 'OPTION') {
        this.next();
        if (this.estKw('EXPLICIT')) { this.next(); prog.explicit = true; }
        else if (this.estKw('BASE')) { this.next(); prog.base = nombre(this.next().v); }
        else { while (this.peek().t !== 'nl' && this.peek().t !== 'eof') this.next(); }
        this.attendreNl(); continue;
      }
      if (t.t === 'kw' && t.v === 'ATTRIBUTE') { while (this.peek().t !== 'nl' && this.peek().t !== 'eof') this.next(); this.attendreNl(); continue; }
      // Modificateurs
      let modif = null;
      while (this.estKw('PUBLIC') || this.estKw('PRIVATE') || this.estKw('STATIC') || this.estKw('GLOBAL') || this.estKw('FRIEND')) modif = this.next().v;
      if (this.estKw('SUB') || this.estKw('FUNCTION') || (this.estKw('PROPERTY'))) { const p = this.procedure(); prog.procedures.set(p.nom.toUpperCase(), p); continue; }
      if (this.estKw('DECLARE')) { while (this.peek().t !== 'nl' && this.peek().t !== 'eof') this.next(); this.attendreNl(); continue; }
      if (this.estKw('TYPE') || this.estKw('ENUM')) { // Type / Enum : on garde les constantes d'un Enum
        const quoi = this.next().v; const nom = this.attendreId(); this.attendreNl();
        let val = 0;
        while (!(this.estKw('END') && this.estKw(quoi, 1))) {
          if (this.peek().t === 'eof') throw erreur(E_ARG, 'End ' + quoi + ' manquant');
          if (quoi === 'ENUM') { const id = this.attendreId(); if (this.estOp('=')) { this.next(); val = nombre(this.constante()); } prog.globales.push({ k: 'const', nom: id, expr: { k: 'lit', v: val }, l: this.peek().l }); val++; }
          else while (this.peek().t !== 'nl') this.next();
          this.attendreNl();
        }
        this.next(); this.next(); this.attendreNl(); continue;
      }
      if (this.estKw('DIM') || this.estKw('CONST') || (modif && (this.peek().t === 'id'))) {
        if (this.estKw('DIM')) this.next();
        if (this.estKw('CONST')) { this.next(); prog.globales.push(...this.declarationsConst()); }
        else prog.globales.push(...this.declarationsDim());
        this.attendreNl(); continue;
      }
      throw erreur(E_ARG, 'Instruction inattendue hors d\'une procédure : « ' + (t.v ?? t.t) + ' »', t.l);
    }
    return prog;
  }

  constante() {
    const t = this.next();
    if (t.t === 'num') return t.v;
    if (t.t === 'str') return t.v;
    if (t.t === 'op' && t.v === '-') return -nombre(this.constante());
    throw erreur(E_ARG, 'Constante attendue', t.l);
  }

  procedure() {
    const genre = this.next().v; // SUB | FUNCTION | PROPERTY
    if (genre === 'PROPERTY') this.next(); // Get/Let/Set
    const ligne = this.peek().l;
    const nom = this.attendreId();
    const params = [];
    if (this.estOp('(')) {
      this.next();
      while (!this.estOp(')')) {
        const p = { nom: '', optional: false, byVal: false, paramArray: false, defaut: null };
        for (;;) {
          if (this.estKw('OPTIONAL')) { this.next(); p.optional = true; }
          else if (this.estKw('BYVAL')) { this.next(); p.byVal = true; }
          else if (this.estKw('BYREF')) { this.next(); }
          else if (this.estKw('PARAMARRAY')) { this.next(); p.paramArray = true; }
          else break;
        }
        p.nom = this.attendreId();
        if (this.estOp('(')) { this.next(); this.attendreOp(')'); }
        if (this.estKw('AS')) { this.next(); this.typeNom(); }
        if (this.estOp('=')) { this.next(); p.defaut = this.expression(); }
        params.push(p);
        if (this.estOp(',')) this.next();
      }
      this.attendreOp(')');
    }
    if (this.estKw('AS')) { this.next(); this.typeNom(); }
    this.attendreNl();
    const corps = this.bloc(() => this.estKw('END') && (this.estKw('SUB', 1) || this.estKw('FUNCTION', 1) || this.estKw('PROPERTY', 1)));
    this.next(); this.next();
    this.attendreNl();
    return { nom, params, corps, fonction: genre !== 'SUB', ligne };
  }

  typeNom() {
    if (this.estKw('NEW')) this.next();
    const t = this.next();
    if (t.t !== 'id' && t.t !== 'kw') throw erreur(E_ARG, 'Type attendu', t.l);
    let nom = t.v;
    while (this.estOp('.')) { this.next(); nom += '.' + this.next().v; }
    return nom;
  }

  /** Lit des instructions jusqu'à ce que stop() soit vrai (sans consommer le terminateur). */
  bloc(stop) {
    const out = [];
    this.finLigne();
    while (!stop()) {
      if (this.peek().t === 'eof') throw erreur(E_ARG, 'Fin de bloc manquante (End If, Next, Loop, End Sub…)', this.toks[this.toks.length - 1]?.l);
      const s = this.instruction();
      if (s) out.push(s);
      this.finLigne();
    }
    return out;
  }

  declarationsDim() {
    const decls = [];
    for (;;) {
      const l = this.peek().l;
      const nom = this.attendreId();
      let dims = null;
      if (this.estOp('(')) {
        this.next(); dims = [];
        while (!this.estOp(')')) {
          const a = this.expression();
          if (this.estKw('TO')) { this.next(); dims.push({ lb: a, ub: this.expression() }); } else dims.push({ lb: null, ub: a });
          if (this.estOp(',')) this.next();
        }
        this.attendreOp(')');
      }
      let type = null, nouveau = false;
      if (this.estKw('AS')) { this.next(); if (this.estKw('NEW')) { nouveau = true; } type = this.typeNom(); }
      decls.push({ k: 'dim', nom, dims, type, nouveau, l });
      if (this.estOp(',')) { this.next(); continue; }
      break;
    }
    return decls;
  }

  declarationsConst() {
    const decls = [];
    for (;;) {
      const l = this.peek().l;
      const nom = this.attendreId();
      if (this.estKw('AS')) { this.next(); this.typeNom(); }
      this.attendreOp('=');
      decls.push({ k: 'const', nom, expr: this.expression(), l });
      if (this.estOp(',')) { this.next(); continue; }
      break;
    }
    return decls;
  }

  instruction() {
    const t = this.peek();
    const l = t.l;
    // Étiquette « nom: » en début de ligne
    if (t.t === 'id' && this.peek(1).t === 'nl' && this.peek(1).sep && this.estEtiquette()) {
      this.next(); this.next();
      return { k: 'label', nom: t.v.toUpperCase(), l };
    }
    if (t.t === 'num' && this.peek(1).t === 'nl' && this.peek(1).sep) { this.next(); return { k: 'label', nom: String(t.v), l }; }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'DIM': case 'STATIC': case 'PRIVATE': case 'PUBLIC': { this.next(); if (this.estKw('CONST')) { this.next(); const d = this.declarationsConst(); this.attendreNl(); return { k: 'bloc', corps: d }; } const d = this.declarationsDim(); this.attendreNl(); return { k: 'bloc', corps: d }; }
        case 'CONST': { this.next(); const d = this.declarationsConst(); this.attendreNl(); return { k: 'bloc', corps: d }; }
        case 'REDIM': {
          this.next();
          let preserve = false;
          if (this.estKw('PRESERVE')) { this.next(); preserve = true; }
          const cibles = [];
          for (;;) {
            const cible = this.postfixe();
            cibles.push(cible);
            if (this.estOp(',')) { this.next(); continue; }
            break;
          }
          if (this.estKw('AS')) { this.next(); this.typeNom(); }
          this.attendreNl();
          return { k: 'redim', cibles, preserve, l };
        }
        case 'ERASE': { this.next(); const cible = this.postfixe(); this.attendreNl(); return { k: 'erase', cible, l }; }
        case 'IF': return this.si();
        case 'SELECT': return this.selectCase();
        case 'FOR': return this.pour();
        case 'DO': return this.faire();
        case 'WHILE': { this.next(); const cond = this.expression(); this.attendreNl(); const corps = this.bloc(() => this.estKw('WEND')); this.next(); this.attendreNl(); return { k: 'do', avant: { cond, until: false }, corps, l }; }
        case 'WITH': { this.next(); const objet = this.expression(); this.attendreNl(); const corps = this.bloc(() => this.estKw('END') && this.estKw('WITH', 1)); this.next(); this.next(); this.attendreNl(); return { k: 'with', objet, corps, l }; }
        case 'EXIT': { this.next(); const quoi = this.next().v; this.attendreNl(); return { k: 'exit', quoi, l }; }
        case 'SET': case 'LET': { this.next(); const cible = this.postfixe(); this.attendreOp('='); const expr = this.expression(); this.attendreNl(); return { k: 'affect', cible, expr, set: t.v === 'SET', l }; }
        case 'CALL': { this.next(); const expr = this.postfixe(); this.attendreNl(); return { k: 'appel', expr, l }; }
        case 'ON': {
          this.next();
          if (this.estKw('ERROR')) {
            this.next();
            if (this.estKw('RESUME')) { this.next(); this.next(); this.attendreNl(); return { k: 'onerror', mode: 'resume', l }; }
            if (this.estKw('GOTO')) { this.next(); const c = this.next(); this.attendreNl(); return { k: 'onerror', mode: c.v === 0 || c.v === '0' ? 'off' : 'goto', label: String(c.v).toUpperCase(), l }; }
          }
          throw erreur(E_ARG, 'Instruction On non reconnue', l);
        }
        case 'GOTO': { this.next(); const c = this.next(); this.attendreNl(); return { k: 'goto', label: String(c.v).toUpperCase(), l }; }
        case 'RESUME': { this.next(); let mode = 'suivant'; if (this.estId('NEXT') || this.peek().t === 'kw' && this.peek().v === 'NEXT') { this.next(); } else if (this.peek().t !== 'nl') { mode = String(this.next().v).toUpperCase(); } this.attendreNl(); return { k: 'resume', mode, l }; }
        case 'STOP': { this.next(); this.attendreNl(); return null; }
        case 'END': {
          if (this.peek(1).t === 'nl' || this.peek(1).t === 'eof') { this.next(); this.attendreNl(); return { k: 'exit', quoi: 'PROGRAMME', l }; }
          throw erreur(E_ARG, 'End ' + (this.peek(1).v || '') + ' inattendu : un bloc n\'est pas fermé (Next, Loop, End If, End With, End Select)', l);
        }
        default: break;
      }
    }
    // Debug.Print avec « ; »
    if (t.t === 'id' && t.v.toUpperCase() === 'DEBUG' && this.estOp('.', 1) && this.estId('PRINT', 2)) {
      this.next(); this.next(); this.next();
      const args = [];
      while (this.peek().t !== 'nl' && this.peek().t !== 'eof') {
        if (this.estOp(';') || this.estOp(',')) { this.next(); continue; }
        args.push(this.expression());
      }
      this.attendreNl();
      return { k: 'print', args, l };
    }
    // Affectation ou appel
    const cible = this.postfixe();
    if (this.estOp('=')) {
      this.next();
      const expr = this.expression();
      this.attendreNl();
      return { k: 'affect', cible, expr, set: false, l };
    }
    // Appel sans parenthèses : nom arg1, arg2
    if (this.peek().t !== 'nl' && this.peek().t !== 'eof') {
      const args = this.arguments(true);
      this.attendreNl();
      return { k: 'appel', expr: cible, args, l };
    }
    this.attendreNl();
    return { k: 'appel', expr: cible, l };
  }

  estEtiquette() {
    // « nom » suivi d'un « : » (tokenisé comme nl) sur la même ligne, et pas une instruction connue.
    const t = this.peek();
    const nom = t.v.toUpperCase();
    if (['MSGBOX', 'RANDOMIZE', 'BEEP', 'DOEVENTS'].includes(nom)) return false;
    return true;
  }

  si() {
    const l = this.next().l; // IF
    const cond = this.expression();
    this.attendreKw('THEN');
    if (this.peek().t !== 'nl') {
      // If sur une ligne
      const alors = [], sinon = [];
      const lire = (dest) => {
        for (;;) {
          if (this.estKw('ELSE') || this.estKw('NEXT') || this.estKw('LOOP') || this.estKw('WEND') || (this.estKw('END') && this.peek(1).t === 'kw')) break;
          const s = this.instructionLigne();
          if (s) dest.push(s);
          if (this.peek().t === 'nl' && this.peek().sep) { this.next(); continue; }
          break;
        }
      };
      lire(alors);
      if (this.estKw('ELSE')) { this.next(); lire(sinon); }
      this.attendreNl();
      return { k: 'if', branches: [{ cond, corps: alors }], sinon, l };
    }
    this.attendreNl();
    const branches = [{ cond, corps: [] }];
    let sinon = [];
    let courant = branches[0].corps;
    for (;;) {
      const stop = () => (this.estKw('ELSEIF') || this.estKw('ELSE') || (this.estKw('END') && this.estKw('IF', 1)));
      courant.push(...this.bloc(stop));
      if (this.estKw('ELSEIF')) { this.next(); const c = this.expression(); this.attendreKw('THEN'); this.attendreNl(); const b = { cond: c, corps: [] }; branches.push(b); courant = b.corps; continue; }
      if (this.estKw('ELSE')) { this.next(); this.attendreNl(); courant = sinon; continue; }
      this.next(); this.next(); this.attendreNl();
      break;
    }
    return { k: 'if', branches, sinon, l };
  }

  instructionLigne() {
    // Une instruction qui ne doit pas consommer le saut de ligne final (If sur une ligne).
    const sauve = this.attendreNl;
    this.attendreNl = () => {};
    try { return this.instruction(); } finally { this.attendreNl = sauve; }
  }

  selectCase() {
    const l = this.next().l; this.attendreKw('CASE');
    const expr = this.expression();
    this.attendreNl();
    const cas = [];
    let sinon = null;
    while (!(this.estKw('END') && this.estKw('SELECT', 1))) {
      if (this.peek().t === 'eof') throw erreur(E_ARG, 'End Select manquant', l);
      this.attendreKw('CASE');
      if (this.estKw('ELSE')) { this.next(); this.attendreNl(); sinon = this.bloc(() => this.estKw('CASE') || (this.estKw('END') && this.estKw('SELECT', 1))); continue; }
      const tests = [];
      for (;;) {
        if (this.estKw('IS')) { this.next(); const op = this.next().v; tests.push({ k: 'is', op, expr: this.expression() }); }
        else {
          const a = this.expression();
          if (this.estKw('TO')) { this.next(); tests.push({ k: 'plage', a, b: this.expression() }); } else tests.push({ k: 'val', a });
        }
        if (this.estOp(',')) { this.next(); continue; }
        break;
      }
      this.attendreNl();
      const corps = this.bloc(() => this.estKw('CASE') || (this.estKw('END') && this.estKw('SELECT', 1)));
      cas.push({ tests, corps });
    }
    this.next(); this.next(); this.attendreNl();
    return { k: 'select', expr, cas, sinon, l };
  }

  pour() {
    const l = this.next().l;
    if (this.estKw('EACH')) {
      this.next();
      const variable = this.postfixe();
      this.attendreKw('IN');
      const coll = this.expression();
      this.attendreNl();
      const corps = this.bloc(() => this.estKw('NEXT'));
      this.next(); if (this.peek().t !== 'nl') this.postfixe();
      this.attendreNl();
      return { k: 'foreach', variable, coll, corps, l };
    }
    const variable = this.postfixe();
    this.attendreOp('=');
    const debut = this.expression();
    this.attendreKw('TO');
    const fin = this.expression();
    let pas = null;
    if (this.estKw('STEP')) { this.next(); pas = this.expression(); }
    this.attendreNl();
    const corps = this.bloc(() => this.estKw('NEXT'));
    this.next(); if (this.peek().t !== 'nl') this.postfixe();
    this.attendreNl();
    return { k: 'for', variable, debut, fin, pas, corps, l };
  }

  faire() {
    const l = this.next().l;
    let avant = null, apres = null;
    if (this.estKw('WHILE') || this.estKw('UNTIL')) { const until = this.next().v === 'UNTIL'; avant = { cond: this.expression(), until }; }
    this.attendreNl();
    const corps = this.bloc(() => this.estKw('LOOP'));
    this.next();
    if (this.estKw('WHILE') || this.estKw('UNTIL')) { const until = this.next().v === 'UNTIL'; apres = { cond: this.expression(), until }; }
    this.attendreNl();
    return { k: 'do', avant, apres, corps, l };
  }

  /** Liste d'arguments : positionnels, nommés (nom:=expr) et omis (, ,). */
  arguments(sansParentheses) {
    const args = [];
    const fin = () => sansParentheses ? (this.peek().t === 'nl' || this.peek().t === 'eof' || this.estKw('ELSE')) : this.estOp(')');
    while (!fin()) {
      if (this.estOp(',')) { this.next(); args.push({ k: 'omis' }); continue; }
      if (this.peek().t === 'id' && this.estOp(':=', 1)) { const nom = this.next().v; this.next(); args.push({ k: 'nomme', nom: nom.toUpperCase(), expr: this.expression() }); }
      else {
        const e = this.expression();
        if (this.estKw('TO')) { this.next(); args.push({ k: 'plageDim', lb: e, ub: this.expression() }); }
        else args.push(e);
      }
      if (this.estOp(',')) { this.next(); if (fin()) args.push({ k: 'omis' }); }
      else break;
    }
    return args;
  }

  // ----- Expressions -----
  expression() { return this.imp(); }
  imp() { let a = this.eqv(); while (this.estKw('IMP')) { this.next(); a = { k: 'bin', op: 'IMP', a, b: this.eqv() }; } return a; }
  eqv() { let a = this.xor(); while (this.estKw('EQV')) { this.next(); a = { k: 'bin', op: 'EQV', a, b: this.xor() }; } return a; }
  xor() { let a = this.ou(); while (this.estKw('XOR')) { this.next(); a = { k: 'bin', op: 'XOR', a, b: this.ou() }; } return a; }
  ou() { let a = this.et(); while (this.estKw('OR')) { this.next(); a = { k: 'bin', op: 'OR', a, b: this.et() }; } return a; }
  et() { let a = this.non(); while (this.estKw('AND')) { this.next(); a = { k: 'bin', op: 'AND', a, b: this.non() }; } return a; }
  non() { if (this.estKw('NOT')) { const l = this.next().l; return { k: 'not', a: this.non(), l }; } return this.comparaison(); }
  comparaison() {
    let a = this.concat();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) { this.next(); a = { k: 'cmp', op: t.v, a, b: this.concat(), l: t.l }; }
      else if (t.t === 'kw' && t.v === 'IS') { this.next(); a = { k: 'is', a, b: this.concat(), l: t.l }; }
      else if (t.t === 'kw' && t.v === 'LIKE') { this.next(); a = { k: 'like', a, b: this.concat(), l: t.l }; }
      else break;
    }
    return a;
  }
  concat() { let a = this.additif(); while (this.estOp('&')) { const l = this.next().l; a = { k: 'bin', op: '&', a, b: this.additif(), l }; } return a; }
  additif() { let a = this.mod(); while (this.estOp('+') || this.estOp('-')) { const t = this.next(); a = { k: 'bin', op: t.v, a, b: this.mod(), l: t.l }; } return a; }
  mod() { let a = this.divEnt(); while (this.estKw('MOD')) { const l = this.next().l; a = { k: 'bin', op: 'MOD', a, b: this.divEnt(), l }; } return a; }
  divEnt() { let a = this.multiplicatif(); while (this.estOp('\\')) { const l = this.next().l; a = { k: 'bin', op: '\\', a, b: this.multiplicatif(), l }; } return a; }
  multiplicatif() { let a = this.unaire(); while (this.estOp('*') || this.estOp('/')) { const t = this.next(); a = { k: 'bin', op: t.v, a, b: this.unaire(), l: t.l }; } return a; }
  unaire() {
    if (this.estOp('-')) { const l = this.next().l; return { k: 'neg', a: this.unaire(), l }; }
    if (this.estOp('+')) { this.next(); return this.unaire(); }
    return this.puissance();
  }
  puissance() { let a = this.postfixe(); while (this.estOp('^')) { const l = this.next().l; a = { k: 'bin', op: '^', a, b: this.unaire(), l }; } return a; }

  /** Chaîne primaire.membre(args).membre… */
  postfixe() {
    const t = this.peek();
    const l = t.l;
    let base;
    if (t.t === 'num') { this.next(); base = { k: 'lit', v: t.v }; }
    else if (t.t === 'str') { this.next(); base = { k: 'lit', v: t.v }; }
    else if (t.t === 'kw' && t.v === 'TRUE') { this.next(); base = { k: 'lit', v: true }; }
    else if (t.t === 'kw' && t.v === 'FALSE') { this.next(); base = { k: 'lit', v: false }; }
    else if (t.t === 'kw' && t.v === 'NOTHING') { this.next(); base = { k: 'lit', v: Nothing }; }
    else if (t.t === 'kw' && t.v === 'EMPTY') { this.next(); base = { k: 'lit', v: undefined }; }
    else if (t.t === 'kw' && t.v === 'NULL') { this.next(); base = { k: 'lit', v: null }; }
    else if (t.t === 'kw' && t.v === 'NEW') { this.next(); const type = this.typeNom(); base = { k: 'new', type, l }; }
    else if (t.t === 'op' && t.v === '(') { this.next(); const e = this.expression(); this.attendreOp(')'); base = { k: 'paren', e }; }
    else if (t.t === 'op' && t.v === '.') { base = { k: 'with', l }; }
    else if (t.t === 'id') { this.next(); base = { k: 'id', nom: t.v, l }; }
    else if (t.t === 'kw' && ['ERROR', 'PROPERTY', 'GET', 'TYPE', 'BASE', 'COMPARE', 'STEP', 'IN', 'EXPLICIT'].includes(t.v)) { this.next(); base = { k: 'id', nom: t.v, l }; }
    else throw erreur(E_ARG, 'Expression attendue, trouvé « ' + (t.v ?? t.t) + ' »', l);
    const chaine = [];
    for (;;) {
      if (this.estOp('.')) {
        this.next();
        const n = this.next();
        if (n.t !== 'id' && n.t !== 'kw') throw erreur(E_ARG, 'Nom de membre attendu', n.l);
        let args;
        if (this.estOp('(')) { this.next(); args = this.arguments(false); this.attendreOp(')'); }
        chaine.push({ nom: n.v, args, l: n.l });
      } else if (this.estOp('(') && (chaine.length || base.k === 'id' || base.k === 'paren' || base.k === 'with')) {
        this.next(); const args = this.arguments(false); this.attendreOp(')');
        chaine.push({ args, l });
      } else if (this.estOp('!')) { this.next(); const n = this.next(); chaine.push({ args: [{ k: 'lit', v: n.v }], l }); }
      else break;
    }
    if (base.k === 'with' && !chaine.length) throw erreur(E_ARG, 'Membre attendu après « . »', l);
    return { k: 'chaine', base, chaine, l };
  }
}

export function analyserVBA(src) {
  const p = new ParseurVBA(tokeniserVBA(src));
  return p.programme();
}

// ---------------------------------------------------------------------------
// Modèle objet
// ---------------------------------------------------------------------------

export class ObjetVBA {
  get typeName() { return 'Object'; }
  defaut() { return this; }
  get(nom, args, it) { throw erreur(E_MEMBRE, 'Propriété ou méthode non gérée par cet objet : ' + nom); }
  set(nom, args, v, it) { throw erreur(E_MEMBRE, 'Propriété non modifiable : ' + nom); }
  index(args, it) { throw erreur(E_MEMBRE, 'Objet non indexable'); }
  setIndex(args, v, it) { throw erreur(E_MEMBRE, 'Objet non indexable'); }
  *iterer() { throw erreur(E_MEMBRE, 'Cet objet ne prend pas en charge l\'énumération'); }
}

const posArgs = (args) => args.filter((a) => !a.nomme);
function argNomme(args, nom, pos) {
  const n = args.find((a) => a.nomme === nom);
  if (n) return n.v;
  const p = posArgs(args)[pos];
  return p === undefined ? undefined : p.v;
}

class RangeVBA extends ObjetVBA {
  constructor(it, feuilleIdx, r1, c1, r2, c2) {
    super();
    this.it = it;
    this.f = feuilleIdx;
    this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2);
    this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2);
    if (this.r1 < 0 || this.c1 < 0) throw erreur(E_NOM, 'Erreur définie par l\'application ou par l\'objet (référence hors feuille)');
  }
  get typeName() { return 'Range'; }
  get classeur() { return this.it.classeur; }
  get feuille() { return this.classeur.feuilles[this.f]; }
  get lignes() { return this.r2 - this.r1 + 1; }
  get colonnes() { return this.c2 - this.c1 + 1; }
  get count() { return this.lignes * this.colonnes; }
  bornes() {
    // Lignes/colonnes entières : ramenées à la zone utilisée.
    const z = this.feuille.zone;
    return { r1: this.r1, c1: this.c1, r2: this.r2 >= 1048575 ? Math.max(z.r2, this.r1) : this.r2, c2: this.c2 >= 16383 ? Math.max(z.c2, this.c1) : this.c2 };
  }
  defaut() { return this.valeur(); }
  valeur() {
    if (this.lignes === 1 && this.colonnes === 1) return this.celValeur(this.r1, this.c1);
    const b = this.bornes();
    const t = new TableauVBA([{ lb: 1, ub: b.r2 - b.r1 + 1 }, { lb: 1, ub: b.c2 - b.c1 + 1 }]);
    let k = 0;
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) t.data[k++] = this.celValeur(r, c);
    return t;
  }
  celValeur(r, c) {
    const v = this.classeur.valeur(this.f, r, c);
    if (v === null || v === undefined) return undefined;
    return v;
  }
  poser(v, formule = false) {
    const b = this.bornes();
    if (v instanceof TableauVBA) {
      const m = v.matrice();
      for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
        const x = m[(r - b.r1) % m.length] ? m[(r - b.r1) % m.length][(c - b.c1) % m[0].length] : undefined;
        this.poserUne(r, c, x, formule);
      }
      return;
    }
    if (v instanceof RangeVBA) { this.poser(v.valeur(), formule); return; }
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) this.poserUne(r, c, v, formule);
  }
  poserUne(r, c, v, formule) {
    if (v instanceof ObjetVBA) v = scalaire(v);
    if (v === undefined || v === null || v === Nothing) { this.classeur.poserValeur(this.f, r, c, null); return; }
    if (formule) { const s = texte(v); if (s.startsWith('=')) this.classeur.poserValeur(this.f, r, c, s); else this.classeur.saisir(this.f, r, c, s); return; }
    if (typeof v === 'string' && v.startsWith('=')) { this.classeur.poserValeur(this.f, r, c, v); return; }
    this.classeur.poserValeur(this.f, r, c, v);
  }
  cellule(r, c) { return new RangeVBA(this.it, this.f, this.r1 + r - 1, this.c1 + c - 1, this.r1 + r - 1, this.c1 + c - 1); }
  adresse(absolue = true) {
    const a = adresse(this.r1, this.c1, absolue, absolue);
    if (this.lignes === 1 && this.colonnes === 1) return a;
    return a + ':' + adresse(this.r2, this.c2, absolue, absolue);
  }
  *iterer() {
    const b = this.bornes();
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) yield new RangeVBA(this.it, this.f, r, c, r, c);
  }
  index(args, it) {
    const p = posArgs(args).map((a) => a.v);
    if (p.length === 1) { // Cells(n) : n-ième cellule
      const n = nombre(p[0]) - 1;
      return this.cellule(Math.floor(n / this.colonnes) + 1, (n % this.colonnes) + 1);
    }
    return this.cellule(nombre(p[0]), nombre(p[1]));
  }
  setIndex(args, v) { this.index(args).poser(v); }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    const p = args ? posArgs(args).map((a) => a.v) : [];
    switch (N) {
      case 'VALUE': case 'VALUE2': return this.valeur();
      case 'TEXT': return this.classeur.texte(this.f, this.r1, this.c1);
      case 'FORMULA': case 'FORMULAR1C1': case 'FORMULALOCAL': {
        if (this.lignes === 1 && this.colonnes === 1) { const cel = this.classeur.cellule(this.f, this.r1, this.c1); return cel ? (cel.f != null ? cel.f : this.classeur.saisie(this.f, this.r1, this.c1)) : ''; }
        const m = [];
        for (let r = this.r1; r <= this.r2; r++) { const l = []; for (let c = this.c1; c <= this.c2; c++) l.push(this.classeur.saisie(this.f, r, c)); m.push(l); }
        return TableauVBA.depuisMatrice(m);
      }
      case 'HASFORMULA': { const cel = this.classeur.cellule(this.f, this.r1, this.c1); return !!(cel && cel.f != null); }
      case 'ROW': return this.r1 + 1;
      case 'COLUMN': return this.c1 + 1;
      case 'ROWS': { const b = this.bornes(); const rg = new RangeVBA(it, this.f, b.r1, b.c1, b.r2, b.c2); rg.modeLignes = true; if (p.length) return new RangeVBA(it, this.f, this.r1 + nombre(p[0]) - 1, b.c1, this.r1 + nombre(p[0]) - 1, b.c2); return rg; }
      case 'COLUMNS': { const b = this.bornes(); const rg = new RangeVBA(it, this.f, b.r1, b.c1, b.r2, b.c2); rg.modeColonnes = true; if (p.length) return new RangeVBA(it, this.f, b.r1, this.c1 + nombre(p[0]) - 1, b.r2, this.c1 + nombre(p[0]) - 1); return rg; }
      case 'COUNT': case 'COUNTLARGE': { const b = this.bornes(); if (this.modeLignes) return b.r2 - b.r1 + 1; if (this.modeColonnes) return b.c2 - b.c1 + 1; return (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1); }
      case 'CELLS': { if (!args || !p.length) return new RangeVBA(it, this.f, this.r1, this.c1, this.r2, this.c2); return this.index(args, it); }
      case 'ITEM': return this.index(args, it);
      case 'RANGE': { const a = texte(p[0]); const pl = parsePlage(a.replace(/\$/g, '')); if (!pl) throw erreur(E_NOM, 'Plage invalide : ' + a); if (p.length > 1) { const q = parsePlage(texte(p[1]).replace(/\$/g, '')); return new RangeVBA(it, this.f, this.r1 + pl.r1, this.c1 + pl.c1, this.r1 + q.r2, this.c1 + q.c2); } return new RangeVBA(it, this.f, this.r1 + pl.r1, this.c1 + pl.c1, this.r1 + pl.r2, this.c1 + pl.c2); }
      case 'OFFSET': { const dr = p[0] === undefined ? 0 : nombre(p[0]), dc = p[1] === undefined ? 0 : nombre(p[1]); return new RangeVBA(it, this.f, this.r1 + dr, this.c1 + dc, this.r2 + dr, this.c2 + dc); }
      case 'RESIZE': { const b = this.bornes(); const nl = p[0] === undefined ? b.r2 - b.r1 + 1 : nombre(p[0]), nc = p[1] === undefined ? b.c2 - b.c1 + 1 : nombre(p[1]); return new RangeVBA(it, this.f, this.r1, this.c1, this.r1 + nl - 1, this.c1 + nc - 1); }
      case 'ADDRESS': { const abs = p[0] === undefined || booleen(p[0]); const ext = p[2] !== undefined && booleen(p[2]); const a = this.adresse(abs); return ext ? this.feuille.nom + '!' + a : a; }
      case 'WORKSHEET': case 'PARENT': return new WorksheetVBA(it, this.f);
      case 'ENTIREROW': return new RangeVBA(it, this.f, this.r1, 0, this.r2, 16383);
      case 'ENTIRECOLUMN': return new RangeVBA(it, this.f, 0, this.c1, 1048575, this.c2);
      case 'END': {
        const dir = nombre(p[0]);
        const z = this.feuille.zone;
        const vide = (r, c) => { const v = this.classeur.cellule(this.f, r, c); return !v || (v.v == null && v.f == null); };
        let r = this.r1, c = this.c1;
        const dr = dir === -4162 ? -1 : dir === -4121 ? 1 : 0, dc = dir === -4159 ? -1 : dir === -4161 ? 1 : 0;
        const limR = dr < 0 ? 0 : Math.max(z.r2, 0), limC = dc < 0 ? 0 : Math.max(z.c2, 0);
        const dansLimite = (r, c) => dr !== 0 ? (dr < 0 ? r > limR : r < limR) : (dc < 0 ? c > limC : c < limC);
        if (!dansLimite(r, c)) return new RangeVBA(it, this.f, dr < 0 ? 0 : (dr > 0 ? Math.max(z.r2, 0) : r), dc < 0 ? 0 : (dc > 0 ? Math.max(z.c2, 0) : c), dr < 0 ? 0 : (dr > 0 ? Math.max(z.r2, 0) : r), dc < 0 ? 0 : (dc > 0 ? Math.max(z.c2, 0) : c));
        if (!vide(r, c) && !vide(r + dr, c + dc)) { while (dansLimite(r, c) && !vide(r + dr, c + dc)) { r += dr; c += dc; } }
        else { r += dr; c += dc; while (dansLimite(r, c) && vide(r, c)) { r += dr; c += dc; } if (vide(r, c) && !dansLimite(r, c)) { r = dr < 0 ? 0 : dr > 0 ? Math.max(z.r2, 0) : r; c = dc < 0 ? 0 : dc > 0 ? Math.max(z.c2, 0) : c; } }
        return new RangeVBA(it, this.f, r, c, r, c);
      }
      case 'FONT': return new StyleVBA(this, 'font');
      case 'INTERIOR': return new StyleVBA(this, 'interior');
      case 'BORDERS': return new StyleVBA(this, 'borders');
      case 'NUMBERFORMAT': case 'NUMBERFORMATLOCAL': { const cel = this.classeur.cellule(this.f, this.r1, this.c1); return cel && cel.z ? cel.z : 'General'; }
      case 'HORIZONTALALIGNMENT': { const cel = this.classeur.cellule(this.f, this.r1, this.c1); const a = cel && cel.s && cel.s.align; return a === 'center' ? -4108 : a === 'right' ? -4152 : a === 'left' ? -4131 : 1; }
      case 'NAME': return this.adresse(true);
      case 'CURRENTREGION': {
        const vide = (r, c) => { if (r < 0 || c < 0) return true; const v = this.classeur.cellule(this.f, r, c); return !v || (v.v == null && v.f == null); };
        let r1 = this.r1, c1 = this.c1, r2 = this.r1, c2 = this.c1, change = true;
        while (change) {
          change = false;
          for (let c = c1 - 1; c <= c2 + 1; c++) { if (r1 > 0 && !vide(r1 - 1, c)) { r1--; change = true; break; } }
          for (let c = c1 - 1; c <= c2 + 1; c++) { if (!vide(r2 + 1, c)) { r2++; change = true; break; } }
          for (let r = r1 - 1; r <= r2 + 1; r++) { if (c1 > 0 && !vide(r, c1 - 1)) { c1--; change = true; break; } }
          for (let r = r1 - 1; r <= r2 + 1; r++) { if (!vide(r, c2 + 1)) { c2++; change = true; break; } }
        }
        return new RangeVBA(it, this.f, r1, c1, r2, c2);
      }
      case 'MERGECELLS': return false;
      case 'HIDDEN': case 'LOCKED': case 'WRAPTEXT': return false;
      case 'COLUMNWIDTH': return (this.feuille.largeurs[this.c1] || 80) / 7;
      case 'ROWHEIGHT': return (this.feuille.hauteurs[this.r1] || 24) * 0.75;
      case 'APPLICATION': return it.application;
      // ----- Méthodes -----
      case 'SELECT': case 'ACTIVATE': it.selection = this; it.classeur.active = this.f; return undefined;
      case 'CLEAR': { const b = this.bornes(); this.classeur.effacer(this.f, b.r1, b.c1, b.r2, b.c2, true); return undefined; }
      case 'CLEARCONTENTS': { const b = this.bornes(); this.classeur.effacer(this.f, b.r1, b.c1, b.r2, b.c2, false); return undefined; }
      case 'CLEARFORMATS': { const b = this.bornes(); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cel = this.classeur.cellule(this.f, r, c); if (cel) { delete cel.s; delete cel.z; } } this.classeur.modifie(); return undefined; }
      case 'COPY': {
        const dest = argNomme(args || [], 'DESTINATION', 0);
        if (dest instanceof RangeVBA) { const b = this.bornes(); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cel = this.classeur.cellule(this.f, r, c); const dr = dest.r1 - b.r1, dc = dest.c1 - b.c1; dest.feuille.set(r + dr, c + dc, cel ? { ...cel } : null); } this.classeur.modifie(); }
        else it.pressePapier = this;
        return undefined;
      }
      case 'PASTESPECIAL': case 'PASTE': { if (it.pressePapier) it.pressePapier.get('COPY', [{ v: this }], it); return undefined; }
      case 'DELETE': {
        const b = this.bornes();
        if (this.c2 >= 16383 || this.modeLignes || (p[0] !== undefined && nombre(p[0]) === -4162)) this.classeur.supprimerLignes(this.f, b.r1, b.r2 - b.r1 + 1);
        else if (this.r2 >= 1048575 || this.modeColonnes || (p[0] !== undefined && nombre(p[0]) === -4159)) this.classeur.supprimerColonnes(this.f, b.c1, b.c2 - b.c1 + 1);
        else this.classeur.effacer(this.f, b.r1, b.c1, b.r2, b.c2, true);
        return undefined;
      }
      case 'INSERT': {
        const b = this.bornes();
        if (this.c2 >= 16383 || this.modeLignes) this.classeur.insererLignes(this.f, b.r1, b.r2 - b.r1 + 1);
        else if (this.r2 >= 1048575 || this.modeColonnes) this.classeur.insererColonnes(this.f, b.c1, b.c2 - b.c1 + 1);
        else this.classeur.insererLignes(this.f, b.r1, b.r2 - b.r1 + 1);
        return undefined;
      }
      case 'AUTOFIT': case 'CALCULATE': case 'MERGE': case 'UNMERGE': return undefined;
      case 'FIND': {
        const quoi = argNomme(args || [], 'WHAT', 0);
        for (const cel of this.iterer()) { const v = cel.celValeur(cel.r1, cel.c1); if (v !== undefined && texte(v).toLowerCase().includes(texte(quoi).toLowerCase())) return cel; }
        return Nothing;
      }
      case 'SORT': {
        const cle = argNomme(args || [], 'KEY1', 0);
        const ordre = argNomme(args || [], 'ORDER1', 1);
        const entete = argNomme(args || [], 'HEADER', 2);
        const b = this.bornes();
        const colCle = cle instanceof RangeVBA ? cle.c1 : b.c1;
        const debut = entete !== undefined && nombre(entete) === 1 ? b.r1 + 1 : b.r1;
        const lignes = [];
        for (let r = debut; r <= b.r2; r++) { const l = []; for (let c = b.c1; c <= b.c2; c++) l.push(this.classeur.cellule(this.f, r, c)); lignes.push({ l, k: this.classeur.valeur(this.f, r, colCle) }); }
        const sens = ordre !== undefined && nombre(ordre) === 2 ? -1 : 1;
        lignes.sort((x, y) => { if (x.k == null) return 1; if (y.k == null) return -1; return sens * (typeof x.k === 'number' && typeof y.k === 'number' ? x.k - y.k : texte(x.k).localeCompare(texte(y.k))); });
        lignes.forEach((lg, i) => lg.l.forEach((cel, j) => this.feuille.set(debut + i, b.c1 + j, cel ? { ...cel } : null)));
        this.classeur.modifie();
        return undefined;
      }
    }
    throw erreur(E_MEMBRE, 'Propriété ou méthode de Range non gérée : ' + nom);
  }
  set(nom, args, v, it) {
    const N = nom.toUpperCase();
    v = scalaire(v);
    switch (N) {
      case 'VALUE': case 'VALUE2': this.poser(v); return;
      case 'FORMULA': case 'FORMULAR1C1': case 'FORMULALOCAL': {
        const b = this.bornes();
        for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
          const s = texte(v instanceof TableauVBA ? v.matrice()[r - b.r1][c - b.c1] : v);
          if (N === 'FORMULAR1C1' && s.startsWith('=')) this.classeur.poserValeur(this.f, r, c, r1c1VersA1(s, r, c));
          else if (s.startsWith('=')) this.classeur.poserValeur(this.f, r, c, s);
          else this.classeur.saisir(this.f, r, c, s);
        }
        return;
      }
      case 'TEXT': this.poser(texte(v)); return;
      case 'NUMBERFORMAT': case 'NUMBERFORMATLOCAL': { const b = this.bornes(); const z = texte(v); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) this.classeur.format(this.f, r, c, z === 'General' || z === 'Standard' ? null : z); return; }
      case 'HORIZONTALALIGNMENT': { const n = nombre(v); const align = n === -4108 ? 'center' : n === -4152 ? 'right' : n === -4131 ? 'left' : null; const b = this.bornes(); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) this.classeur.style(this.f, r, c, { align }); return; }
      case 'COLUMNWIDTH': { for (let c = this.c1; c <= Math.min(this.c2, this.feuille.zone.c2 + 10); c++) this.feuille.largeurs[c] = Math.round(nombre(v) * 7 + 5); this.classeur.modifie(); return; }
      case 'ROWHEIGHT': { for (let r = this.r1; r <= Math.min(this.r2, this.feuille.zone.r2 + 10); r++) this.feuille.hauteurs[r] = Math.round(nombre(v) / 0.75); this.classeur.modifie(); return; }
      case 'NAME': this.classeur.definirNom(texte(v), this.feuille.nom + '!' + this.adresse(true)); return;
      case 'WRAPTEXT': case 'LOCKED': case 'HIDDEN': case 'MERGECELLS': return;
    }
    throw erreur(E_MEMBRE, 'Propriété de Range non modifiable : ' + nom);
  }
}

// Conversion R1C1 → A1 relative à une cellule
function r1c1VersA1(s, r, c) {
  return s.replace(/R(\[(-?\d+)\]|\d+)?C(\[(-?\d+)\]|\d+)?/gi, (m, R, Rrel, C, Crel) => {
    let rr, cc, absR = false, absC = false;
    if (R === undefined) rr = r; else if (Rrel !== undefined) rr = r + +Rrel; else { rr = +R - 1; absR = true; }
    if (C === undefined) cc = c; else if (Crel !== undefined) cc = c + +Crel; else { cc = +C - 1; absC = true; }
    return adresse(rr, cc, absR, absC);
  });
}

function couleurVBA(v) {
  const n = nombre(v) >>> 0;
  const r = n & 255, g = (n >> 8) & 255, b = (n >> 16) & 255;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function couleurVersVBA(hex) {
  if (!hex) return 0;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  return parseInt(m[1], 16) + parseInt(m[2], 16) * 256 + parseInt(m[3], 16) * 65536;
}
const COULEURS_INDEX = { 1: '#000000', 2: '#ffffff', 3: '#ff0000', 4: '#00ff00', 5: '#0000ff', 6: '#ffff00', 7: '#ff00ff', 8: '#00ffff', 9: '#800000', 10: '#008000', 11: '#000080', 12: '#808000', 13: '#800080', 14: '#008080', 15: '#c0c0c0', 16: '#808080', 36: '#ffff99', 37: '#99ccff', 40: '#ffcc99', 44: '#ffcc00', 45: '#ff9900', 46: '#ff6600' };

class StyleVBA extends ObjetVBA {
  constructor(range, genre) { super(); this.range = range; this.genre = genre; }
  get typeName() { return this.genre === 'font' ? 'Font' : 'Interior'; }
  appliquer(patch) { const b = this.range.bornes(); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) this.range.classeur.style(this.range.f, r, c, patch); }
  premier() { const cel = this.range.classeur.cellule(this.range.f, this.range.r1, this.range.c1); return (cel && cel.s) || {}; }
  get(nom) {
    const N = nom.toUpperCase(), s = this.premier();
    if (this.genre === 'font') {
      if (N === 'BOLD') return !!s.gras; if (N === 'ITALIC') return !!s.italique; if (N === 'UNDERLINE') return s.souligne ? 2 : -4142;
      if (N === 'COLOR') return couleurVersVBA(s.couleur); if (N === 'COLORINDEX') return s.couleur ? 1 : -4105; if (N === 'SIZE') return s.taille || 11; if (N === 'NAME') return 'Calibri';
    } else if (this.genre === 'interior') {
      if (N === 'COLOR') return couleurVersVBA(s.fond || '#ffffff'); if (N === 'COLORINDEX') return s.fond ? 1 : -4142; if (N === 'PATTERN') return s.fond ? 1 : -4142;
    } else {
      if (N === 'LINESTYLE') return s.bordure ? 1 : -4142; if (N === 'WEIGHT') return 2; if (N === 'COLOR') return 0;
      if (N === 'ITEM') return this;
    }
    throw erreur(E_MEMBRE, 'Propriété non gérée : ' + nom);
  }
  index() { return this; }
  set(nom, args, v) {
    const N = nom.toUpperCase();
    v = scalaire(v);
    if (this.genre === 'font') {
      if (N === 'BOLD') return this.appliquer({ gras: booleen(v) });
      if (N === 'ITALIC') return this.appliquer({ italique: booleen(v) });
      if (N === 'UNDERLINE') return this.appliquer({ souligne: typeof v === 'boolean' ? v : nombre(v) !== -4142 });
      if (N === 'COLOR') return this.appliquer({ couleur: couleurVBA(v) });
      if (N === 'COLORINDEX') return this.appliquer({ couleur: nombre(v) === -4105 ? null : (COULEURS_INDEX[nombre(v)] || '#000000') });
      if (N === 'SIZE') return this.appliquer({ taille: nombre(v) });
      if (N === 'NAME' || N === 'STRIKETHROUGH') return;
    } else if (this.genre === 'interior') {
      if (N === 'COLOR') return this.appliquer({ fond: couleurVBA(v) });
      if (N === 'COLORINDEX') return this.appliquer({ fond: nombre(v) === -4142 ? null : (COULEURS_INDEX[nombre(v)] || '#ffff00') });
      if (N === 'PATTERN') { if (nombre(v) === -4142) return this.appliquer({ fond: null }); return; }
      if (N === 'TINTANDSHADE' || N === 'PATTERNCOLORINDEX' || N === 'THEMECOLOR') return;
    } else {
      if (N === 'LINESTYLE') return this.appliquer({ bordure: nombre(v) !== -4142 });
      if (N === 'WEIGHT' || N === 'COLOR' || N === 'COLORINDEX') return;
    }
    throw erreur(E_MEMBRE, 'Propriété non modifiable : ' + nom);
  }
}

class WorksheetVBA extends ObjetVBA {
  constructor(it, idx) { super(); this.it = it; this.idx = idx; }
  get typeName() { return 'Worksheet'; }
  get feuille() { const f = this.it.classeur.feuilles[this.idx]; if (!f) throw erreur(E_OBJET, 'Feuille supprimée'); return f; }
  plageDepuis(p) {
    if (p[0] instanceof RangeVBA) { if (p[1] instanceof RangeVBA) return new RangeVBA(this.it, this.idx, Math.min(p[0].r1, p[1].r1), Math.min(p[0].c1, p[1].c1), Math.max(p[0].r2, p[1].r2), Math.max(p[0].c2, p[1].c2)); return p[0]; }
    let a = texte(p[0]);
    if (a.includes('!')) a = a.slice(a.lastIndexOf('!') + 1);
    a = a.replace(/\$/g, '');
    let m;
    if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(a))) return new RangeVBA(this.it, this.idx, 0, lettresVersCol(m[1]), 1048575, lettresVersCol(m[2]));
    if ((m = /^(\d+):(\d+)$/.exec(a))) return new RangeVBA(this.it, this.idx, +m[1] - 1, 0, +m[2] - 1, 16383);
    let pl = parsePlage(a);
    if (!pl) {
      const def = this.it.classeur.nom(a);
      if (def) { const s = def.replace(/\$/g, ''); const k = s.lastIndexOf('!'); const nomF = k >= 0 ? s.slice(0, k).replace(/^'|'$/g, '') : null; const fi = nomF ? this.it.classeur.indexFeuille(nomF) : this.idx; pl = parsePlage(k >= 0 ? s.slice(k + 1) : s); if (pl && fi >= 0) return new RangeVBA(this.it, fi, pl.r1, pl.c1, pl.r2, pl.c2); }
      throw erreur(E_NOM, 'La méthode Range de l\'objet Worksheet a échoué : « ' + texte(p[0]) + ' »');
    }
    if (p.length > 1) { const q = parsePlage(texte(p[1]).replace(/\$/g, '')); if (!q) throw erreur(E_NOM, 'Plage invalide'); return new RangeVBA(this.it, this.idx, pl.r1, pl.c1, q.r2, q.c2); }
    return new RangeVBA(this.it, this.idx, pl.r1, pl.c1, pl.r2, pl.c2);
  }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    const p = args ? posArgs(args).map((a) => a.v) : [];
    switch (N) {
      case 'NAME': return this.feuille.nom;
      case 'INDEX': return this.idx + 1;
      case 'RANGE': return this.plageDepuis(p);
      case 'CELLS': { if (!p.length) return new RangeVBA(it, this.idx, 0, 0, 1048575, 16383); if (p.length === 1) { const n = nombre(p[0]) - 1; return new RangeVBA(it, this.idx, Math.floor(n / 16384), n % 16384, Math.floor(n / 16384), n % 16384); } const r = nombre(p[0]) - 1, c = typeof p[1] === 'string' && !/^\d+$/.test(p[1]) ? lettresVersCol(p[1]) : nombre(p[1]) - 1; return new RangeVBA(it, this.idx, r, c, r, c); }
      case 'ROWS': { if (!p.length) { const rg = new RangeVBA(it, this.idx, 0, 0, 1048575, 16383); rg.modeLignes = true; return rg; } const a = texte(p[0]); if (a.includes(':')) { const [x, y] = a.split(':'); return new RangeVBA(it, this.idx, +x - 1, 0, +y - 1, 16383); } const r = nombre(p[0]) - 1; return new RangeVBA(it, this.idx, r, 0, r, 16383); }
      case 'COLUMNS': { if (!p.length) { const rg = new RangeVBA(it, this.idx, 0, 0, 1048575, 16383); rg.modeColonnes = true; return rg; } const a = p[0]; const c = typeof a === 'string' && !/^\d+$/.test(a) ? lettresVersCol(a.split(':')[0]) : nombre(a) - 1; const c2 = typeof a === 'string' && a.includes(':') ? lettresVersCol(a.split(':')[1]) : c; return new RangeVBA(it, this.idx, 0, c, 1048575, c2); }
      case 'USEDRANGE': { const z = this.feuille.zone; let r1 = Infinity, c1 = Infinity; this.feuille.chaque((r, c) => { if (r < r1) r1 = r; if (c < c1) c1 = c; }); if (z.r2 < 0) return new RangeVBA(it, this.idx, 0, 0, 0, 0); return new RangeVBA(it, this.idx, r1, c1, z.r2, z.c2); }
      case 'ACTIVATE': case 'SELECT': it.classeur.active = this.idx; return undefined;
      case 'DELETE': it.classeur.supprimerFeuille(this.idx); return undefined;
      case 'CALCULATE': return undefined;
      case 'VISIBLE': return this.feuille.cachee ? 0 : -1;
      case 'PARENT': return it.classeurVBA;
      case 'APPLICATION': return it.application;
      case 'COPY': case 'MOVE': {
        const avant = args ? argNomme(args, 'BEFORE', 0) : undefined, apres = args ? argNomme(args, 'AFTER', 1) : undefined;
        const pos = avant instanceof WorksheetVBA ? avant.idx : apres instanceof WorksheetVBA ? apres.idx + 1 : it.classeur.feuilles.length;
        if (N === 'MOVE') { it.classeur.deplacerFeuille(this.idx, pos > this.idx ? pos - 1 : pos); return undefined; }
        const copie = it.classeur.ajouterFeuille(it.classeur.nomLibre(this.feuille.nom + ' ('), pos);
        this.feuille.chaque((r, c, cel) => copie.set(r, c, { ...cel }));
        return undefined;
      }
      case 'EVALUATE': return it.evaluerFormule(texte(p[0]), this.idx);
      case 'PROTECT': case 'UNPROTECT': return undefined;
    }
    throw erreur(E_MEMBRE, 'Propriété ou méthode de Worksheet non gérée : ' + nom);
  }
  set(nom, args, v, it) {
    const N = nom.toUpperCase();
    if (N === 'NAME') { it.classeur.renommerFeuille(this.idx, texte(v)); return; }
    if (N === 'VISIBLE') { this.feuille.cachee = nombre(scalaire(v)) === 0; return; }
    throw erreur(E_MEMBRE, 'Propriété de Worksheet non modifiable : ' + nom);
  }
}

class WorksheetsVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; }
  get typeName() { return 'Sheets'; }
  trouver(x) {
    x = scalaire(x);
    if (typeof x === 'number') { if (x < 1 || x > this.it.classeur.feuilles.length) throw erreur(E_INDICE, 'L\'indice n\'appartient pas à la sélection'); return new WorksheetVBA(this.it, x - 1); }
    const i = this.it.classeur.indexFeuille(texte(x));
    if (i < 0) throw erreur(E_INDICE, 'La feuille « ' + texte(x) + ' » n\'existe pas');
    return new WorksheetVBA(this.it, i);
  }
  index(args) { return this.trouver(posArgs(args)[0].v); }
  *iterer() { for (let i = 0; i < this.it.classeur.feuilles.length; i++) yield new WorksheetVBA(this.it, i); }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    if (N === 'COUNT') return it.classeur.feuilles.length;
    if (N === 'ITEM') return this.index(args);
    if (N === 'ADD') {
      const avant = args ? argNomme(args, 'BEFORE', 0) : undefined, apres = args ? argNomme(args, 'AFTER', 1) : undefined;
      const n = args ? argNomme(args, 'COUNT', 2) : undefined;
      let pos = avant instanceof WorksheetVBA ? avant.idx : apres instanceof WorksheetVBA ? apres.idx + 1 : it.classeur.active;
      let f;
      for (let k = 0; k < (n === undefined ? 1 : nombre(n)); k++) f = it.classeur.ajouterFeuille(null, pos + k);
      const idx = it.classeur.feuilles.indexOf(f);
      it.classeur.active = idx;
      return new WorksheetVBA(it, idx);
    }
    if (N === 'PARENT') return it.classeurVBA;
    throw erreur(E_MEMBRE, 'Membre de Worksheets non géré : ' + nom);
  }
}

class WorkbookVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; }
  get typeName() { return 'Workbook'; }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    switch (N) {
      case 'WORKSHEETS': case 'SHEETS': { const ws = new WorksheetsVBA(it); return args && posArgs(args).length ? ws.index(args) : ws; }
      case 'NAME': return it.classeur.nomFichier;
      case 'FULLNAME': case 'PATH': return it.classeur.nomFichier;
      case 'ACTIVESHEET': return new WorksheetVBA(it, it.classeur.active);
      case 'SAVE': case 'SAVEAS': case 'CLOSE': case 'ACTIVATE': if (it.hote.enregistrer) it.hote.enregistrer(); return undefined;
      case 'NAMES': return new NamesVBA(it);
      case 'APPLICATION': case 'PARENT': return it.application;
      case 'SAVED': return true;
    }
    throw erreur(E_MEMBRE, 'Membre de Workbook non géré : ' + nom);
  }
}

class NamesVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; }
  get typeName() { return 'Names'; }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    if (N === 'COUNT') return it.classeur.noms.size;
    if (N === 'ADD') { const n = argNomme(args, 'NAME', 0), ref = argNomme(args, 'REFERSTO', 1); it.classeur.definirNom(texte(n), texte(ref instanceof RangeVBA ? '=' + ref.feuille.nom + '!' + ref.adresse(true) : ref).replace(/^=/, '')); return undefined; }
    if (N === 'ITEM') return this.index(args);
    throw erreur(E_MEMBRE, 'Membre de Names non géré : ' + nom);
  }
  index(args) { const k = scalaire(posArgs(args)[0].v); const d = typeof k === 'number' ? [...this.it.classeur.noms.values()][k - 1] : this.it.classeur.noms.get(texte(k).toUpperCase()); if (!d) throw erreur(E_INDICE, 'Nom introuvable'); return new NameVBA(this.it, d); }
  *iterer() { for (const d of this.it.classeur.noms.values()) yield new NameVBA(this.it, d); }
}
class NameVBA extends ObjetVBA {
  constructor(it, d) { super(); this.it = it; this.d = d; }
  get typeName() { return 'Name'; }
  get(nom) { const N = nom.toUpperCase(); if (N === 'NAME') return this.d.nom; if (N === 'REFERSTO') return '=' + this.d.ref; if (N === 'REFERSTORANGE') { const s = this.d.ref.replace(/\$/g, ''); const k = s.lastIndexOf('!'); const fi = k >= 0 ? this.it.classeur.indexFeuille(s.slice(0, k).replace(/^'|'$/g, '')) : this.it.classeur.active; const pl = parsePlage(k >= 0 ? s.slice(k + 1) : s); if (!pl) throw erreur(E_NOM, 'Le nom ne désigne pas une plage'); return new RangeVBA(this.it, fi, pl.r1, pl.c1, pl.r2, pl.c2); } if (N === 'DELETE') { this.it.classeur.supprimerNom(this.d.nom); return undefined; } throw erreur(E_MEMBRE, 'Membre de Name non géré : ' + nom); }
  set(nom, args, v) { if (nom.toUpperCase() === 'REFERSTO') { this.d.ref = texte(v).replace(/^=/, ''); return; } throw erreur(E_MEMBRE, 'Propriété non modifiable : ' + nom); }
}

class WorksheetFunctionVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; }
  get typeName() { return 'WorksheetFunction'; }
  get(nom, args, it) {
    const def = fonctionFeuille(nom.replace(/_/g, '.'));
    if (!def) throw erreur(E_MEMBRE, 'Fonction de feuille inconnue : ' + nom);
    const ev = it.classeur.evaluateur;
    const conv = (v) => {
      if (v instanceof RangeVBA) { const b = v.bornes(); return new Plage(ev, v.f, b.r1, b.c1, b.r2, b.c2); }
      if (v instanceof TableauVBA) return v.matrice();
      if (v === undefined) return undefined;
      return scalaire(v);
    };
    const a = (args || []).map((x) => (x.k === 'omis' ? undefined : conv(x.v)));
    try {
      const sauve = ev.courant;
      ev.courant = { feuille: it.classeur.active, r: 0, c: 0 };
      let r;
      try { r = def.paresseux ? def.fn(a.map((v) => ({ k: 'lit', v })), (n) => n.v, ev) : def.fn(a, ev); } finally { ev.courant = sauve; }
      if (r instanceof Plage) r = r.taille === 1 ? r.valeur(0, 0) : r.matrice();
      if (Array.isArray(r)) return TableauVBA.depuisMatrice(r);
      if (r instanceof ErreurFormule) throw erreur(E_NOM, 'Erreur de la fonction ' + nom + ' : ' + r.code);
      return r === null ? undefined : r;
    } catch (e) {
      if (e instanceof ErreurFormule) throw erreur(E_NOM, 'Erreur de la fonction ' + nom + ' : ' + e.code);
      throw e;
    }
  }
}

class ApplicationVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; this.props = { ScreenUpdating: true, Calculation: -4105, EnableEvents: true, DisplayAlerts: true, StatusBar: false, Cursor: -4143 }; }
  get typeName() { return 'Application'; }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    switch (N) {
      case 'WORKSHEETFUNCTION': return new WorksheetFunctionVBA(it);
      case 'ACTIVESHEET': return new WorksheetVBA(it, it.classeur.active);
      case 'ACTIVEWORKBOOK': case 'THISWORKBOOK': return it.classeurVBA;
      case 'WORKBOOKS': return it.classeurVBA;
      case 'WORKSHEETS': case 'SHEETS': return it.classeurVBA.get(N, args, it);
      case 'ACTIVECELL': return it.selection ? it.selection.cellule(1, 1) : new RangeVBA(it, it.classeur.active, 0, 0, 0, 0);
      case 'SELECTION': return it.selection || new RangeVBA(it, it.classeur.active, 0, 0, 0, 0);
      case 'RANGE': case 'CELLS': case 'ROWS': case 'COLUMNS': return new WorksheetVBA(it, it.classeur.active).get(N, args, it);
      case 'CALCULATE': case 'CALCULATEFULL': case 'VOLATILE': case 'WAIT': case 'DOEVENTS': return undefined;
      case 'EVALUATE': return it.evaluerFormule(texte(posArgs(args)[0].v), it.classeur.active);
      case 'INPUTBOX': return it.inputBox(args);
      case 'VERSION': return '16.0';
      case 'NAME': return 'Tableur Arcadia';
      case 'USERNAME': return 'Utilisateur';
      case 'PI': return Math.PI;
      case 'INTERNATIONAL': return 1;
      case 'MATCH': case 'VLOOKUP': case 'SUM': case 'MAX': case 'MIN': case 'COUNTA': case 'COUNTIF': case 'SUMIF': case 'AVERAGE': case 'ROUND': case 'INDEX': case 'TRANSPOSE': case 'SUMPRODUCT':
        return new WorksheetFunctionVBA(it).get(N, args, it);
    }
    if (N in this.props || Object.keys(this.props).some((k) => k.toUpperCase() === N)) return this.props[Object.keys(this.props).find((k) => k.toUpperCase() === N)];
    throw erreur(E_MEMBRE, 'Membre d\'Application non géré : ' + nom);
  }
  set(nom, args, v) {
    const k = Object.keys(this.props).find((x) => x.toUpperCase() === nom.toUpperCase());
    if (k) { this.props[k] = scalaire(v); return; }
    if (['CURSOR', 'STATUSBAR', 'CALCULATEBEFORESAVE', 'ITERATION', 'MAXITERATIONS', 'MAXCHANGE', 'DECIMALSEPARATOR', 'USESYSTEMSEPARATORS'].includes(nom.toUpperCase())) return;
    throw erreur(E_MEMBRE, 'Propriété d\'Application non modifiable : ' + nom);
  }
}

class ErrVBA extends ObjetVBA {
  constructor() { super(); this.clear(); }
  get typeName() { return 'ErrObject'; }
  clear() { this.number = 0; this.description = ''; this.source = ''; }
  defaut() { return this.number; }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    if (N === 'NUMBER') return this.number;
    if (N === 'DESCRIPTION') return this.description;
    if (N === 'SOURCE') return this.source;
    if (N === 'CLEAR') { this.clear(); return undefined; }
    if (N === 'RAISE') { const num = argNomme(args || [], 'NUMBER', 0), desc = argNomme(args || [], 'DESCRIPTION', 2); throw erreur(nombre(num), desc !== undefined ? texte(desc) : 'Erreur définie par l\'application ou par l\'objet'); }
    throw erreur(E_MEMBRE, 'Membre de Err non géré : ' + nom);
  }
  set(nom, args, v) { const N = nom.toUpperCase(); if (N === 'NUMBER') this.number = nombre(v); else if (N === 'DESCRIPTION') this.description = texte(v); else if (N === 'SOURCE') this.source = texte(v); else throw erreur(E_MEMBRE, 'Propriété non modifiable : ' + nom); }
}

class CollectionObj extends ObjetVBA {
  constructor() { super(); this.c = new CollectionVBA(); }
  get typeName() { return 'Collection'; }
  index(args) { return this.c.item(scalaire(posArgs(args)[0].v)); }
  *iterer() { yield* this.c.items; }
  get(nom, args) {
    const N = nom.toUpperCase();
    if (N === 'COUNT') return this.c.count;
    if (N === 'ITEM') return this.index(args);
    if (N === 'ADD') { this.c.add(argNomme(args, 'ITEM', 0), argNomme(args, 'KEY', 1), argNomme(args, 'BEFORE', 2), argNomme(args, 'AFTER', 3)); return undefined; }
    if (N === 'REMOVE') { this.c.remove(scalaire(posArgs(args)[0].v)); return undefined; }
    throw erreur(E_MEMBRE, 'Membre de Collection non géré : ' + nom);
  }
}

class DictionnaireObj extends ObjetVBA {
  constructor() { super(); this.d = new DictionnaireVBA(); }
  get typeName() { return 'Dictionary'; }
  index(args) { return this.d.item(scalaire(posArgs(args)[0].v)); }
  setIndex(args, v) { this.d.setItem(scalaire(posArgs(args)[0].v), v); }
  *iterer() { for (const e of this.d.map.values()) yield e.k; }
  get(nom, args) {
    const N = nom.toUpperCase();
    const p = args ? posArgs(args).map((a) => scalaire(a.v)) : [];
    switch (N) {
      case 'COUNT': return this.d.count;
      case 'ADD': this.d.add(argNomme(args, 'KEY', 0), argNomme(args, 'ITEM', 1)); return undefined;
      case 'EXISTS': return this.d.exists(p[0]);
      case 'ITEM': return this.d.item(p[0]);
      case 'ITEMS': return this.d.items();
      case 'KEYS': return this.d.keys();
      case 'REMOVE': this.d.remove(p[0]); return undefined;
      case 'REMOVEALL': this.d.removeAll(); return undefined;
      case 'COMPAREMODE': return this.d.compareMode;
      case 'KEY': return p[0];
    }
    throw erreur(E_MEMBRE, 'Membre de Dictionary non géré : ' + nom);
  }
  set(nom, args, v) {
    const N = nom.toUpperCase();
    if (N === 'ITEM') { this.d.setItem(scalaire(posArgs(args)[0].v), v); return; }
    if (N === 'COMPAREMODE') { this.d.compareMode = nombre(v); return; }
    if (N === 'KEY') { const anc = scalaire(posArgs(args)[0].v); const val = this.d.item(anc); this.d.remove(anc); this.d.add(v, val); return; }
    throw erreur(E_MEMBRE, 'Propriété non modifiable : ' + nom);
  }
}

class DebugVBA extends ObjetVBA {
  constructor(it) { super(); this.it = it; }
  get typeName() { return 'Debug'; }
  get(nom, args, it) {
    const N = nom.toUpperCase();
    if (N === 'PRINT') { it.log((args || []).map((a) => texte(scalaire(a.v))).join(' ')); return undefined; }
    if (N === 'ASSERT') return undefined;
    throw erreur(E_MEMBRE, 'Membre de Debug non géré : ' + nom);
  }
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CONSTANTES = {
  VBCRLF: '\r\n', VBCR: '\r', VBLF: '\n', VBNEWLINE: '\n', VBTAB: '\t', VBNULLSTRING: '', VBNULLCHAR: '\0', VBBACK: '\b',
  VBOKONLY: 0, VBOKCANCEL: 1, VBABORTRETRYIGNORE: 2, VBYESNOCANCEL: 3, VBYESNO: 4, VBRETRYCANCEL: 5,
  VBCRITICAL: 16, VBQUESTION: 32, VBEXCLAMATION: 48, VBINFORMATION: 64, VBDEFAULTBUTTON2: 256,
  VBOK: 1, VBCANCEL: 2, VBABORT: 3, VBRETRY: 4, VBIGNORE: 5, VBYES: 6, VBNO: 7,
  VBBLACK: 0, VBRED: 255, VBGREEN: 65280, VBYELLOW: 65535, VBBLUE: 16711680, VBMAGENTA: 16711935, VBCYAN: 16776960, VBWHITE: 16777215,
  XLUP: -4162, XLDOWN: -4121, XLTOLEFT: -4159, XLTORIGHT: -4161, XLNONE: -4142, XLCENTER: -4108, XLLEFT: -4131, XLRIGHT: -4152, XLGENERAL: 1,
  XLCALCULATIONAUTOMATIC: -4105, XLCALCULATIONMANUAL: -4135, XLASCENDING: 1, XLDESCENDING: 2, XLYES: 1, XLNO: 2, XLGUESS: 0,
  XLCONTINUOUS: 1, XLTHIN: 2, XLTHICK: 4, XLMEDIUM: -4138, XLSOLID: 1, XLAUTOMATIC: -4105, XLSHEETVISIBLE: -1, XLSHEETHIDDEN: 0, XLSHEETVERYHIDDEN: 2,
  XLVALUES: -4163, XLFORMULAS: -4123, XLWHOLE: 1, XLPART: 2, XLBYROWS: 1, XLBYCOLUMNS: 2, XLPASTEVALUES: -4163, XLPASTEALL: -4104, XLPASTEFORMULAS: -4123, XLPASTEFORMATS: -4122,
  XLSHIFTDOWN: -4121, XLSHIFTTORIGHT: -4161, XLSHIFTUP: -4162, XLSHIFTTOLEFT: -4159, XLCELLTYPELASTCELL: 11, XLCELLTYPEBLANKS: 4, XLCELLTYPECONSTANTS: 2, XLCELLTYPEFORMULAS: -4123,
  VBBINARYCOMPARE: 0, VBTEXTCOMPARE: 1, VBUSESYSTEM: 0, VBSUNDAY: 1, VBMONDAY: 2, VBTUESDAY: 3, VBWEDNESDAY: 4, VBTHURSDAY: 5, VBFRIDAY: 6, VBSATURDAY: 7,
  VBEMPTY: 0, VBNULL: 1, VBINTEGER: 2, VBLONG: 3, VBSINGLE: 4, VBDOUBLE: 5, VBCURRENCY: 6, VBDATE: 7, VBSTRING: 8, VBOBJECT: 9, VBERROR: 10, VBBOOLEAN: 11, VBVARIANT: 12, VBARRAY: 8192,
  VBGENERALDATE: 0, VBLONGDATE: 1, VBSHORTDATE: 2, VBLONGTIME: 3, VBSHORTTIME: 4, VBUPPERCASE: 1, VBLOWERCASE: 2, VBPROPERCASE: 3,
  XLEDGELEFT: 7, XLEDGETOP: 8, XLEDGEBOTTOM: 9, XLEDGERIGHT: 10, XLINSIDEVERTICAL: 11, XLINSIDEHORIZONTAL: 12, XLDIAGONALDOWN: 5, XLDIAGONALUP: 6,
  XLSRCRANGE: 1, XLDATABASE: 1, XLCOLUMNCLUSTERED: 51, XLLINE: 4, XLPIE: 5, XLXYSCATTER: -4169,
};

// ---------------------------------------------------------------------------
// Fonctions intégrées
// ---------------------------------------------------------------------------

function dateLocale() { const d = new Date(); return dateVersSerie(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))); }
function partiesDate(s) { const d = serieVersDate(s); return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, j: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), se: d.getUTCSeconds(), js: d.getUTCDay(), d }; }
function dateSerial(a, m, j) { return dateVersSerie(new Date(Date.UTC(a, m - 1, j))); }

function formatVBA(v, fmt, it) {
  v = scalaire(v);
  if (fmt === undefined || fmt === '') return texte(v);
  const F = String(fmt);
  const U = F.toUpperCase();
  const nommes = {
    'GENERAL NUMBER': () => texte(nombre(v)), 'CURRENCY': () => formaterNombre(nombre(v), '#,##0.00 €'), 'FIXED': () => formaterNombre(nombre(v), '0.00'),
    'STANDARD': () => formaterNombre(nombre(v), '#,##0.00'), 'PERCENT': () => formaterNombre(nombre(v), '0.00%'), 'SCIENTIFIC': () => formaterNombre(nombre(v), '0.00E+00'),
    'YES/NO': () => (booleen(v) ? 'Oui' : 'Non'), 'TRUE/FALSE': () => (booleen(v) ? 'Vrai' : 'Faux'), 'ON/OFF': () => (booleen(v) ? 'Activé' : 'Désactivé'),
    'GENERAL DATE': () => formaterDate(nombre(v), nombre(v) % 1 ? 'dd/mm/yyyy hh:mm:ss' : 'dd/mm/yyyy'), 'LONG DATE': () => formaterDate(nombre(v), 'dddd d mmmm yyyy'),
    'MEDIUM DATE': () => formaterDate(nombre(v), 'dd-mmm-yy'), 'SHORT DATE': () => formaterDate(nombre(v), 'dd/mm/yyyy'), 'LONG TIME': () => formaterDate(nombre(v), 'hh:mm:ss'),
    'MEDIUM TIME': () => formaterDate(nombre(v), 'hh:mm AM/PM'), 'SHORT TIME': () => formaterDate(nombre(v), 'hh:mm'),
  };
  if (nommes[U]) return nommes[U]();
  if (/^[@&<>!]+$/.test(F)) { const s = texte(v); return F.includes('<') ? s.toLowerCase() : F.includes('>') ? s.toUpperCase() : s; }
  if (typeof v === 'string' && /[@&]/.test(F)) { let i = 0; return F.replace(/[@&]/g, () => v[i++] ?? ''); }
  if (/[dmyhsnq]/i.test(F.replace(/"[^"]*"/g, '')) && !/[0#]/.test(F)) return formaterDate(nombre(v), F.replace(/n/g, 'm').replace(/N/g, 'M'));
  return formaterNombre(nombre(v), F);
}

const FONCTIONS_VBA = {
  ABS: (a) => Math.abs(nombre(a[0])), INT: (a) => Math.floor(nombre(a[0])), FIX: (a) => Math.trunc(nombre(a[0])), SQR: (a) => { const x = nombre(a[0]); if (x < 0) throw erreur(E_ARG, 'Appel de procédure ou argument incorrect (Sqr)'); return Math.sqrt(x); },
  EXP: (a) => Math.exp(nombre(a[0])), LOG: (a) => { const x = nombre(a[0]); if (x <= 0) throw erreur(E_ARG, 'Appel de procédure ou argument incorrect (Log)'); return Math.log(x); },
  SGN: (a) => Math.sign(nombre(a[0])), ATN: (a) => Math.atan(nombre(a[0])), COS: (a) => Math.cos(nombre(a[0])), SIN: (a) => Math.sin(nombre(a[0])), TAN: (a) => Math.tan(nombre(a[0])),
  ROUND: (a) => arrondiBancaire(nombre(a[0]), a[1] === undefined ? 0 : nombre(a[1])),
  RND: () => Math.random(), RANDOMIZE: () => undefined, TIMER: () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000; },
  LEN: (a) => (a[0] instanceof TableauVBA ? a[0].data.length : texte(a[0]).length), LENB: (a) => texte(a[0]).length * 2,
  LEFT: (a) => texte(a[0]).slice(0, Math.max(0, nombre(a[1]))), RIGHT: (a) => { const n = Math.max(0, nombre(a[1])); return n ? texte(a[0]).slice(-n) : ''; },
  MID: (a) => { const s = texte(a[0]), d = nombre(a[1]); if (d < 1) throw erreur(E_ARG, 'Appel de procédure ou argument incorrect (Mid)'); return a[2] === undefined ? s.slice(d - 1) : s.substr(d - 1, nombre(a[2])); },
  UCASE: (a) => texte(a[0]).toUpperCase(), LCASE: (a) => texte(a[0]).toLowerCase(), TRIM: (a) => texte(a[0]).trim(), LTRIM: (a) => texte(a[0]).replace(/^\s+/, ''), RTRIM: (a) => texte(a[0]).replace(/\s+$/, ''),
  STR: (a) => { const n = nombre(a[0]); return (n >= 0 ? ' ' : '') + nombreVersTexte(n); }, CSTR: (a) => texte(a[0]), STRING: (a) => texte(a[1]).charAt(0).repeat(Math.max(0, nombre(a[0]))), SPACE: (a) => ' '.repeat(Math.max(0, nombre(a[0]))),
  CINT: (a) => { const n = arrondiBancaire(nombre(a[0])); if (n < -32768 || n > 32767) throw erreur(E_DEBORD, 'Dépassement de capacité'); return n; },
  CLNG: (a) => { const n = arrondiBancaire(nombre(a[0])); if (Math.abs(n) > 2147483647) throw erreur(E_DEBORD, 'Dépassement de capacité'); return n; },
  CLNGLNG: (a) => arrondiBancaire(nombre(a[0])), CDBL: (a) => nombre(a[0]), CSNG: (a) => Math.fround(nombre(a[0])), CCUR: (a) => Math.round(nombre(a[0]) * 10000) / 10000, CDEC: (a) => nombre(a[0]), CVAR: (a) => a[0], CBYTE: (a) => { const n = arrondiBancaire(nombre(a[0])); if (n < 0 || n > 255) throw erreur(E_DEBORD, 'Dépassement de capacité'); return n; },
  CBOOL: (a) => booleen(a[0]), CDATE: (a) => { const v = a[0]; if (typeof v === 'number') return v; const s = texte(v); let m; if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return dateSerial(+m[3], +m[2], +m[1]); if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return dateSerial(+m[1], +m[2], +m[3]); const d = Date.parse(s); if (Number.isNaN(d)) throw erreur(E_TYPE, 'Type incompatible (CDate)'); return dateVersSerie(new Date(d)); },
  VAL: (a) => { const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(texte(a[0]).replace(/\s+/g, '')); return m ? parseFloat(m[0]) : 0; },
  ISNUMERIC: (a) => { const v = scalaire(a[0]); if (typeof v === 'number' || typeof v === 'boolean') return true; if (typeof v !== 'string') return false; return /^\s*[-+]?(\d+[.,]?\d*|[.,]\d+)([eE][-+]?\d+)?\s*%?\s*$/.test(v); },
  ISEMPTY: (a) => scalaire(a[0]) === undefined, ISNULL: (a) => scalaire(a[0]) === null, ISARRAY: (a) => a[0] instanceof TableauVBA, ISOBJECT: (a) => estObjet(a[0]) || a[0] === Nothing, ISMISSING: (a) => a[0] === undefined,
  ISDATE: (a) => { const v = scalaire(a[0]); if (typeof v === 'number') return true; try { FONCTIONS_VBA.CDATE([v]); return true; } catch { return false; } },
  ISERROR: (a) => a[0] instanceof ErreurFormule,
  INSTR: (a) => { let d = 1, s, sub, mode = 0; if (typeof a[0] === 'number' && a.length >= 3) { d = a[0]; s = texte(a[1]); sub = texte(a[2]); mode = a[3] === undefined ? 0 : nombre(a[3]); } else { s = texte(a[0]); sub = texte(a[1]); mode = a[2] === undefined ? 0 : nombre(a[2]); } if (mode === 1) { s = s.toLowerCase(); sub = sub.toLowerCase(); } return s.indexOf(sub, d - 1) + 1; },
  INSTRREV: (a) => { let s = texte(a[0]), sub = texte(a[1]); const d = a[2] === undefined || a[2] === -1 ? s.length : nombre(a[2]); if ((a[3] !== undefined ? nombre(a[3]) : 0) === 1) { s = s.toLowerCase(); sub = sub.toLowerCase(); } return s.lastIndexOf(sub, d - sub.length) + 1; },
  REPLACE: (a) => { const s = texte(a[0]), anc = texte(a[1]), nouv = texte(a[2]); const d = a[3] === undefined ? 1 : nombre(a[3]); let n = a[4] === undefined ? -1 : nombre(a[4]); const mode = a[5] === undefined ? 0 : nombre(a[5]); let out = s.slice(d - 1); if (!anc) return out; const re = new RegExp(anc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mode === 1 ? 'gi' : 'g'); return out.replace(re, (m) => (n === 0 ? m : (n--, nouv))); },
  STRCOMP: (a) => { let x = texte(a[0]), y = texte(a[1]); if (a[2] !== undefined && nombre(a[2]) === 1) { x = x.toLowerCase(); y = y.toLowerCase(); } return x < y ? -1 : x > y ? 1 : 0; },
  STRREVERSE: (a) => [...texte(a[0])].reverse().join(''), CHR: (a) => String.fromCharCode(nombre(a[0])), CHRW: (a) => String.fromCharCode(nombre(a[0])), ASC: (a) => { const s = texte(a[0]); if (!s) throw erreur(E_ARG, 'Appel de procédure ou argument incorrect (Asc)'); return s.charCodeAt(0); }, ASCW: (a) => texte(a[0]).charCodeAt(0),
  HEX: (a) => Math.trunc(nombre(a[0])).toString(16).toUpperCase(), OCT: (a) => Math.trunc(nombre(a[0])).toString(8),
  FORMAT: (a, it) => formatVBA(a[0], a[1], it), FORMATNUMBER: (a) => formaterNombre(nombre(a[0]), '#,##0.' + '0'.repeat(a[1] === undefined ? 2 : nombre(a[1]))), FORMATPERCENT: (a) => formaterNombre(nombre(a[0]), '0.' + '0'.repeat(a[1] === undefined ? 2 : nombre(a[1])) + '%'), FORMATCURRENCY: (a) => formaterNombre(nombre(a[0]), '#,##0.' + '0'.repeat(a[1] === undefined ? 2 : nombre(a[1])) + ' €'), FORMATDATETIME: (a) => formatVBA(a[0], ['General Date', 'Long Date', 'Short Date', 'Long Time', 'Short Time'][a[1] === undefined ? 0 : nombre(a[1])]),
  NOW: () => dateLocale(), DATE: () => Math.floor(dateLocale()), TIME: () => dateLocale() % 1,
  YEAR: (a) => partiesDate(nombre(a[0])).a, MONTH: (a) => partiesDate(nombre(a[0])).m, DAY: (a) => partiesDate(nombre(a[0])).j, HOUR: (a) => partiesDate(nombre(a[0])).h, MINUTE: (a) => partiesDate(nombre(a[0])).mi, SECOND: (a) => partiesDate(nombre(a[0])).se,
  WEEKDAY: (a) => { const js = partiesDate(nombre(a[0])).js; const premier = a[1] === undefined ? 1 : nombre(a[1]); return ((js - (premier - 1) + 7) % 7) + 1; },
  WEEKDAYNAME: (a) => ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][(nombre(a[0]) - 1 + (a[2] === undefined ? 0 : nombre(a[2]) - 1)) % 7],
  MONTHNAME: (a) => ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][nombre(a[0]) - 1],
  DATESERIAL: (a) => { let an = nombre(a[0]); if (an < 100) an += an < 30 ? 2000 : 1900; return dateVersSerie(new Date(Date.UTC(an, nombre(a[1]) - 1, nombre(a[2])))); },
  TIMESERIAL: (a) => (nombre(a[0]) * 3600 + nombre(a[1]) * 60 + nombre(a[2])) / 86400, DATEVALUE: (a) => Math.floor(FONCTIONS_VBA.CDATE(a)), TIMEVALUE: (a) => { const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(texte(a[0])); if (!m) throw erreur(E_TYPE, 'Type incompatible'); return (+m[1] * 3600 + +m[2] * 60 + +(m[3] || 0)) / 86400; },
  DATEADD: (a) => { const u = texte(a[0]).toLowerCase(), n = nombre(a[1]), d = nombre(a[2]); const p = partiesDate(d); switch (u) { case 'yyyy': return dateVersSerie(new Date(Date.UTC(p.a + n, p.m - 1, Math.min(p.j, new Date(Date.UTC(p.a + n, p.m, 0)).getUTCDate())))) + d % 1; case 'q': case 'm': { const mois = p.m - 1 + n * (u === 'q' ? 3 : 1); const an = p.a + Math.floor(mois / 12), mo = ((mois % 12) + 12) % 12; return dateVersSerie(new Date(Date.UTC(an, mo, Math.min(p.j, new Date(Date.UTC(an, mo + 1, 0)).getUTCDate())))) + d % 1; } case 'y': case 'd': case 'w': return d + n; case 'ww': return d + 7 * n; case 'h': return d + n / 24; case 'n': return d + n / 1440; case 's': return d + n / 86400; } throw erreur(E_ARG, 'Intervalle DateAdd inconnu'); },
  DATEDIFF: (a) => { const u = texte(a[0]).toLowerCase(), d1 = nombre(a[1]), d2 = nombre(a[2]); const p1 = partiesDate(d1), p2 = partiesDate(d2); switch (u) { case 'yyyy': return p2.a - p1.a; case 'q': return (p2.a - p1.a) * 4 + Math.floor((p2.m - 1) / 3) - Math.floor((p1.m - 1) / 3); case 'm': return (p2.a - p1.a) * 12 + p2.m - p1.m; case 'y': case 'd': return Math.floor(d2) - Math.floor(d1); case 'w': return Math.floor((Math.floor(d2) - Math.floor(d1)) / 7); case 'ww': { const dim1 = Math.floor(d1) + (7 - p1.js) % 7; return dim1 > Math.floor(d2) ? 0 : Math.floor((Math.floor(d2) - dim1) / 7) + 1; } case 'h': return Math.floor((d2 - d1) * 24 + 1e-9); case 'n': return Math.floor((d2 - d1) * 1440 + 1e-9); case 's': return Math.round((d2 - d1) * 86400); } throw erreur(E_ARG, 'Intervalle DateDiff inconnu'); },
  DATEPART: (a) => { const u = texte(a[0]).toLowerCase(), p = partiesDate(nombre(a[1])); switch (u) { case 'yyyy': return p.a; case 'q': return Math.floor((p.m - 1) / 3) + 1; case 'm': return p.m; case 'd': return p.j; case 'y': return Math.floor(nombre(a[1])) - dateSerial(p.a, 1, 1) + 1; case 'w': return p.js + 1; case 'ww': return Math.floor((Math.floor(nombre(a[1])) - dateSerial(p.a, 1, 1) + partiesDate(dateSerial(p.a, 1, 1)).js) / 7) + 1; case 'h': return p.h; case 'n': return p.mi; case 's': return p.se; } throw erreur(E_ARG, 'Intervalle DatePart inconnu'); },
  ARRAY: (a, it) => TableauVBA.depuisListe(a.map(scalaire), it.prog.base),
  SPLIT: (a) => { const s = texte(a[0]); const d = a[1] === undefined ? ' ' : texte(a[1]); const n = a[2] === undefined ? -1 : nombre(a[2]); let parts = d === '' ? [s] : s.split(d); if (n > 0 && parts.length > n) parts = [...parts.slice(0, n - 1), parts.slice(n - 1).join(d)]; return TableauVBA.depuisListe(parts, 0); },
  JOIN: (a) => { if (!(a[0] instanceof TableauVBA)) throw erreur(E_TYPE, 'Type incompatible (Join)'); return a[0].data.map(texte).join(a[1] === undefined ? ' ' : texte(a[1])); },
  FILTER: (a) => { const inc = a[2] === undefined ? true : booleen(a[2]); const m = texte(a[1]).toLowerCase(); return TableauVBA.depuisListe(a[0].data.filter((x) => texte(x).toLowerCase().includes(m) === inc), 0); },
  UBOUND: (a) => { if (!(a[0] instanceof TableauVBA)) throw erreur(E_TYPE, 'Type incompatible (UBound)'); return a[0].ubound(a[1] === undefined ? 1 : nombre(a[1])); },
  LBOUND: (a) => { if (!(a[0] instanceof TableauVBA)) throw erreur(E_TYPE, 'Type incompatible (LBound)'); return a[0].lbound(a[1] === undefined ? 1 : nombre(a[1])); },
  IIF: (a) => (booleen(a[0]) ? a[1] : a[2]), CHOOSE: (a) => a[nombre(a[0])], SWITCH: (a) => { for (let i = 0; i + 1 < a.length; i += 2) if (booleen(a[i])) return a[i + 1]; return null; },
  TYPENAME: (a) => { const v = a[0]; if (v === undefined) return 'Empty'; if (v === null) return 'Null'; if (v === Nothing) return 'Nothing'; if (typeof v === 'boolean') return 'Boolean'; if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 2147483648 ? 'Long' : 'Double'; if (typeof v === 'string') return 'String'; if (v instanceof TableauVBA) return 'Variant()'; if (v instanceof ObjetVBA) return v.typeName; return 'Object'; },
  VARTYPE: (a) => { const v = a[0]; if (v === undefined) return 0; if (v === null) return 1; if (typeof v === 'boolean') return 11; if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 2147483648 ? 3 : 5; if (typeof v === 'string') return 8; if (v instanceof TableauVBA) return 8204; return 9; },
  CREATEOBJECT: (a) => { const n = texte(a[0]).toLowerCase(); if (n === 'scripting.dictionary') return new DictionnaireObj(); if (n === 'collection' || n === 'vba.collection') return new CollectionObj(); throw erreur(429, 'Un composant ActiveX ne peut pas créer l\'objet : ' + texte(a[0])); },
  ERROR: (a, it) => (a.length ? 'Erreur ' + nombre(a[0]) : it.err.description), ENVIRON: () => '', COMMAND: () => '', DOEVENTS: () => 0, BEEP: () => undefined, SENDKEYS: () => undefined,
  MSGBOX: (a, it, args) => it.msgBox(args), INPUTBOX: (a, it, args) => it.inputBox(args),
  NZ: (a) => (a[0] === undefined || a[0] === null ? (a[1] === undefined ? 0 : a[1]) : a[0]),
  EVALUATE: (a, it) => it.evaluerFormule(texte(a[0]), it.classeur.active),
  RGB: (a) => nombre(a[0]) + nombre(a[1]) * 256 + nombre(a[2]) * 65536,
  PARTITION: (a) => { const x = nombre(a[0]), d = nombre(a[1]), f = nombre(a[2]), i = nombre(a[3]); if (x < d) return ':' + (d - 1); if (x > f) return (f + 1) + ':'; const k = Math.floor((x - d) / i); const lo = d + k * i, hi = Math.min(f, lo + i - 1); return lo + ':' + hi; },
};

// ---------------------------------------------------------------------------
// Interpréteur
// ---------------------------------------------------------------------------

export class InterpreteurVBA {
  /**
   * @param classeur instance de Classeur
   * @param hote { log(texte), msgBox(texte, boutons, titre) → nombre, inputBox(invite, titre, defaut) → chaîne|null, enregistrer() }
   */
  constructor(classeur, hote = {}) {
    this.classeur = classeur;
    this.hote = hote;
    this.sortie = [];
    this.err = new ErrVBA();
    this.application = new ApplicationVBA(this);
    this.classeurVBA = new WorkbookVBA(this);
    this.debug = new DebugVBA(this);
    this.globales = new Map();
    this.prog = { procedures: new Map(), globales: [], base: 0, explicit: false };
    this.limitePas = 5_000_000;
    this.pas = 0;
    this.selection = null;
    this.pressePapier = null;
  }

  log(t) { this.sortie.push(t); if (this.hote.log) this.hote.log(t); }

  msgBox(args) {
    const prompt = argNomme(args, 'PROMPT', 0), boutons = argNomme(args, 'BUTTONS', 1), titre = argNomme(args, 'TITLE', 2);
    const t = texte(scalaire(prompt));
    this.log('[MsgBox] ' + t);
    if (this.hote.msgBox) { const r = this.hote.msgBox(t, boutons === undefined ? 0 : nombre(boutons), titre === undefined ? 'Tableur' : texte(titre)); return r === undefined ? 1 : nombre(r); }
    const b = boutons === undefined ? 0 : nombre(boutons) & 15;
    return b === 4 || b === 3 ? 6 : 1; // Oui par défaut
  }
  inputBox(args) {
    const prompt = argNomme(args, 'PROMPT', 0), titre = argNomme(args, 'TITLE', 1), defaut = argNomme(args, 'DEFAULT', 2);
    if (this.hote.inputBox) { const r = this.hote.inputBox(texte(scalaire(prompt)), titre === undefined ? 'Tableur' : texte(titre), defaut === undefined ? '' : texte(defaut)); return r === null || r === undefined ? '' : r; }
    return defaut === undefined ? '' : texte(defaut);
  }

  evaluerFormule(f, feuille) {
    const v = this.classeur.evaluateur.evaluerFormule(f.startsWith('=') ? f : '=' + f, feuille, 0, 0);
    if (v instanceof ErreurFormule) throw erreur(E_NOM, 'Evaluate : ' + v.code);
    if (Array.isArray(v)) return TableauVBA.depuisMatrice(v);
    return v === null ? undefined : v;
  }

  /** Charge (analyse) un module de code. Les procédures s'ajoutent à celles déjà chargées. */
  charger(src) {
    const prog = analyserVBA(src);
    for (const [k, p] of prog.procedures) this.prog.procedures.set(k, p);
    this.prog.base = prog.base;
    this.prog.explicit = prog.explicit;
    const portee = { vars: this.globales, parent: null };
    for (const g of prog.globales) this.executer(g, portee);
    return prog;
  }

  listerProcedures() { return [...this.prog.procedures.values()].filter((p) => !p.fonction && !p.params.length).map((p) => p.nom); }

  /** Exécute une procédure par son nom avec des arguments déjà évalués. */
  executerProcedure(nom, args = []) {
    const p = this.prog.procedures.get(nom.toUpperCase());
    if (!p) throw erreur(35, 'Sub ou Function non définie : ' + nom);
    this.pas = 0;
    this.err.clear();
    return this.appelerProcedure(p, args.map((v) => ({ v })));
  }

  appelerProcedure(p, args) {
    const portee = { vars: new Map(), parent: null, fonction: p.fonction ? p.nom : null, with: [], onError: null };
    const pos = args.filter((a) => !a.nomme);
    let k = 0;
    for (const param of p.params) {
      let val;
      const nomme = args.find((a) => a.nomme === param.nom.toUpperCase());
      if (param.paramArray) { val = TableauVBA.depuisListe(pos.slice(k).map((a) => a.v), 0); k = pos.length; }
      else if (nomme) val = nomme.v;
      else if (k < pos.length && pos[k].k !== 'omis') { val = pos[k].v; k++; }
      else { k++; if (!param.optional) throw erreur(449, 'Argument non facultatif : ' + param.nom + ' (' + p.nom + ')'); val = param.defaut ? this.evaluer(param.defaut, portee) : undefined; }
      // ByRef : on garde la référence vers la variable appelante
      if (!param.byVal && !nomme && pos[k - 1] && pos[k - 1].ref) portee.vars.set(param.nom.toUpperCase(), { ref: pos[k - 1].ref });
      else portee.vars.set(param.nom.toUpperCase(), { v: val });
    }
    if (p.fonction) portee.vars.set(p.nom.toUpperCase(), { v: undefined });
    try {
      this.executerBloc(p.corps, portee);
    } catch (e) {
      if (e instanceof SignalExit && (e.quoi === 'SUB' || e.quoi === 'FUNCTION' || e.quoi === 'PROPERTY')) { /* sortie normale */ }
      else throw e;
    }
    return p.fonction ? this.lire(portee, p.nom) : undefined;
  }

  // ----- Variables -----
  chercher(portee, nom) {
    const N = nom.toUpperCase();
    for (let p = portee; p; p = p.parent) if (p.vars.has(N)) return p.vars.get(N);
    if (this.globales.has(N)) return this.globales.get(N);
    return null;
  }
  lire(portee, nom) {
    const slot = this.chercher(portee, nom);
    if (!slot) return undefined;
    return slot.ref ? slot.ref.get() : slot.v;
  }
  ecrire(portee, nom, v, ligne) {
    let slot = this.chercher(portee, nom);
    if (!slot) {
      if (this.prog.explicit) throw erreur(E_NOM, 'Variable non définie : ' + nom, ligne);
      slot = { v: undefined };
      portee.vars.set(nom.toUpperCase(), slot);
    }
    if (slot.const) throw erreur(E_ARG, 'Affectation à une constante : ' + nom, ligne);
    if (slot.ref) slot.ref.set(v); else slot.v = v;
  }

  // ----- Exécution -----
  executerBloc(corps, portee) {
    // Les étiquettes du bloc (pour GoTo / On Error GoTo)
    const labels = new Map();
    corps.forEach((s, i) => { if (s.k === 'label') labels.set(s.nom, i); });
    let i = 0;
    while (i < corps.length) {
      const s = corps[i];
      try {
        this.executer(s, portee);
        i++;
      } catch (e) {
        if (e instanceof SignalGoTo) {
          if (!labels.has(e.label)) throw e; // remonte vers le bloc qui contient l'étiquette
          i = labels.get(e.label);
          continue;
        }
        if (e instanceof ErreurVBA || e instanceof ErreurFormule || e instanceof RangeError || e instanceof TypeError) {
          const erreurVBA = e instanceof ErreurVBA ? e : erreur(e instanceof ErreurFormule ? E_NOM : E_ARG, e instanceof RangeError ? 'Espace pile insuffisant (récursion trop profonde)' : e.message, s.l);
          if (!erreurVBA.ligne) erreurVBA.ligne = s.l;
          const racine = this.porteeProcedure(portee);
          const mode = racine.onError;
          if (mode && !racine.enErreur) {
            this.err.number = erreurVBA.numero; this.err.description = erreurVBA.description;
            if (mode === 'resume') { i++; continue; }
            // On Error GoTo label
            racine.enErreur = true;
            if (labels.has(mode)) { i = labels.get(mode); continue; }
            throw new SignalGoTo(mode);
          }
          throw erreurVBA;
        }
        throw e;
      }
    }
  }

  porteeProcedure(portee) { let p = portee; while (p.parent) p = p.parent; return p; }

  executer(s, portee) {
    if (++this.pas > this.limitePas) throw erreur(E_ARG, 'La macro a dépassé ' + this.limitePas.toLocaleString('fr-FR') + ' instructions (boucle infinie ?)', s.l);
    switch (s.k) {
      case 'label': return;
      case 'bloc': for (const d of s.corps) this.executer(d, portee); return;
      case 'dim': {
        let v;
        if (s.dims) {
          if (s.dims.length === 0) v = new TableauVBA([{ lb: 0, ub: -1 }]); // tableau dynamique
          else v = new TableauVBA(s.dims.map((d) => ({ lb: d.lb ? nombre(this.evaluer(d.lb, portee)) : this.prog.base, ub: nombre(this.evaluer(d.ub, portee)) })));
          v.type = s.type;
          remplirDefaut(v);
        } else if (s.nouveau) v = this.creerObjet(s.type, s.l);
        else v = this.valeurDefaut(s.type);
        portee.vars.set(s.nom.toUpperCase(), { v, type: s.type });
        return;
      }
      case 'const': portee.vars.set(s.nom.toUpperCase(), { v: this.evaluer(s.expr, portee), const: true }); return;
      case 'redim': {
        for (const cible of s.cibles) {
          const dernier = cible.chaine[cible.chaine.length - 1];
          if (!dernier || !dernier.args) throw erreur(E_ARG, 'ReDim attend des dimensions', s.l);
          const nouvelles = dernier.args.map((d) => (d.k === 'plageDim'
            ? { lb: nombre(this.evaluer(d.lb, portee), s.l), ub: nombre(this.evaluer(d.ub, portee), s.l) }
            : { lb: this.prog.base, ub: nombre(this.evaluer(d, portee), s.l) }));
          const sansIndex = { ...cible, chaine: cible.chaine.slice(0, -1) };
          let ancien;
          try { ancien = this.evaluer(sansIndex, portee); } catch { ancien = undefined; }
          const t = new TableauVBA(nouvelles);
          if (s.preserve && ancien instanceof TableauVBA) {
            if (ancien.dims.length === 1 && t.dims.length === 1) { for (let i = t.dims[0].lb; i <= t.dims[0].ub; i++) if (i >= ancien.dims[0].lb && i <= ancien.dims[0].ub) t.set([i], ancien.get([i])); }
            else if (ancien.dims.length === 2 && t.dims.length === 2) { for (let i = t.dims[0].lb; i <= t.dims[0].ub; i++) for (let j = t.dims[1].lb; j <= t.dims[1].ub; j++) if (i >= ancien.dims[0].lb && i <= ancien.dims[0].ub && j >= ancien.dims[1].lb && j <= ancien.dims[1].ub) t.set([i, j], ancien.get([i, j])); }
          }
          if (ancien instanceof TableauVBA) t.type = ancien.type;
          remplirDefaut(t, s.preserve && ancien instanceof TableauVBA);
          this.affecter(sansIndex, t, portee, s.l, true);
        }
        return;
      }
      case 'erase': { const sansIndex = s.cible; const v = this.evaluer(sansIndex, portee); if (v instanceof TableauVBA) { if (v.dims.length === 1 && v.dims[0].ub === -1) return; v.data.fill(undefined); } return; }
      case 'affect': {
        const v = this.evaluer(s.expr, portee);
        this.affecter(s.cible, s.set ? v : (v instanceof RangeVBA ? v.valeur() : v), portee, s.l, s.set);
        return;
      }
      case 'appel': {
        const args = s.args ? this.evaluerArgs(s.args, portee) : null;
        this.evaluerChaine(s.expr, portee, args, true);
        return;
      }
      case 'print': this.log(s.args.map((a) => texte(scalaire(this.evaluer(a, portee)))).join(' ')); return;
      case 'if': {
        for (const b of s.branches) if (booleen(this.evaluer(b.cond, portee), s.l)) { this.executerBloc(b.corps, portee); return; }
        this.executerBloc(s.sinon, portee);
        return;
      }
      case 'select': {
        const v = scalaire(this.evaluer(s.expr, portee));
        for (const c of s.cas) {
          for (const t of c.tests) {
            let ok = false;
            if (t.k === 'val') ok = comparerVBA(v, this.evaluer(t.a, portee), '=', s.l) === true;
            else if (t.k === 'plage') ok = comparerVBA(v, this.evaluer(t.a, portee), '>=', s.l) === true && comparerVBA(v, this.evaluer(t.b, portee), '<=', s.l) === true;
            else ok = comparerVBA(v, this.evaluer(t.expr, portee), t.op, s.l) === true;
            if (ok) { this.executerBloc(c.corps, portee); return; }
          }
        }
        if (s.sinon) this.executerBloc(s.sinon, portee);
        return;
      }
      case 'for': {
        const debut = nombre(this.evaluer(s.debut, portee), s.l), fin = nombre(this.evaluer(s.fin, portee), s.l);
        const pas = s.pas ? nombre(this.evaluer(s.pas, portee), s.l) : 1;
        if (pas === 0) throw erreur(E_ARG, 'Step 0 : boucle infinie', s.l);
        this.affecter(s.variable, debut, portee, s.l);
        try {
          for (;;) {
            const i = nombre(this.evaluer(s.variable, portee), s.l);
            if (pas > 0 ? i > fin : i < fin) break;
            this.executerBloc(s.corps, portee);
            this.affecter(s.variable, nombre(this.evaluer(s.variable, portee), s.l) + pas, portee, s.l);
          }
        } catch (e) { if (e instanceof SignalExit && e.quoi === 'FOR') return; throw e; }
        return;
      }
      case 'foreach': {
        const coll = this.evaluer(s.coll, portee);
        let iter;
        if (coll instanceof TableauVBA) iter = coll.data;
        else if (coll instanceof ObjetVBA) iter = coll.iterer();
        else throw erreur(E_TYPE, 'For Each attend un tableau ou une collection', s.l);
        try {
          for (const x of iter) { this.affecter(s.variable, x, portee, s.l, true); this.executerBloc(s.corps, portee); }
        } catch (e) { if (e instanceof SignalExit && e.quoi === 'FOR') return; throw e; }
        return;
      }
      case 'do': {
        try {
          for (;;) {
            if (s.avant) { const c = booleen(this.evaluer(s.avant.cond, portee), s.l); if (s.avant.until ? c : !c) break; }
            this.executerBloc(s.corps, portee);
            if (s.apres) { const c = booleen(this.evaluer(s.apres.cond, portee), s.l); if (s.apres.until ? c : !c) break; }
            if (++this.pas > this.limitePas) throw erreur(E_ARG, 'Boucle trop longue', s.l);
          }
        } catch (e) { if (e instanceof SignalExit && e.quoi === 'DO') return; throw e; }
        return;
      }
      case 'with': {
        const objet = this.evaluer(s.objet, portee);
        const racine = this.porteeProcedure(portee);
        racine.with = racine.with || [];
        racine.with.push(objet);
        try { this.executerBloc(s.corps, portee); } finally { racine.with.pop(); }
        return;
      }
      case 'exit': {
        if (s.quoi === 'PROGRAMME') throw new SignalExit('SUB');
        throw new SignalExit(s.quoi);
      }
      case 'onerror': { const racine = this.porteeProcedure(portee); racine.onError = s.mode === 'off' ? null : (s.mode === 'resume' ? 'resume' : s.label); racine.enErreur = false; if (s.mode !== 'off') this.err.clear(); return; }
      case 'goto': throw new SignalGoTo(s.label);
      case 'resume': { const racine = this.porteeProcedure(portee); racine.enErreur = false; this.err.clear(); if (s.mode !== 'suivant') throw new SignalGoTo(s.mode); return; }
    }
    throw erreur(E_ARG, 'Instruction non gérée : ' + s.k, s.l);
  }

  valeurDefaut(type) {
    if (!type) return undefined;
    const t = type.toUpperCase();
    if (['INTEGER', 'LONG', 'DOUBLE', 'SINGLE', 'CURRENCY', 'BYTE', 'LONGLONG', 'DECIMAL', 'DATE'].includes(t)) return 0;
    if (t === 'STRING') return '';
    if (t === 'BOOLEAN') return false;
    if (t === 'VARIANT') return undefined;
    return Nothing; // objets
  }

  creerObjet(type, ligne) {
    const t = type.toUpperCase().replace(/^(VBA|SCRIPTING|EXCEL)\./, '');
    if (t === 'COLLECTION') return new CollectionObj();
    if (t === 'DICTIONARY') return new DictionnaireObj();
    throw erreur(429, 'Impossible de créer un objet de type ' + type, ligne);
  }

  evaluerArgs(args, portee) {
    return args.map((a) => {
      if (a.k === 'omis') return { k: 'omis', v: undefined };
      if (a.k === 'plageDim') throw erreur(E_ARG, '« To » inattendu dans une liste d\'arguments');
      if (a.k === 'nomme') return { nomme: a.nom, v: this.evaluer(a.expr, portee) };
      const v = this.evaluer(a, portee);
      // Référence pour ByRef : variable simple
      let ref = null;
      if (a.k === 'chaine' && a.base.k === 'id' && !a.chaine.length) {
        const slot = this.chercher(portee, a.base.nom);
        if (slot && !slot.const) ref = { get: () => (slot.ref ? slot.ref.get() : slot.v), set: (x) => { if (slot.ref) slot.ref.set(x); else slot.v = x; } };
      }
      return { v, ref };
    });
  }

  evaluer(n, portee) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'paren': return this.evaluer(n.e, portee);
      case 'new': return this.creerObjet(n.type, n.l);
      case 'chaine': return this.evaluerChaine(n, portee, null, false);
      case 'neg': return -nombre(this.evaluer(n.a, portee), n.l);
      case 'not': { const v = scalaire(this.evaluer(n.a, portee)); if (typeof v === 'boolean') return !v; if (v === null) return null; return ~Math.trunc(nombre(v, n.l)); }
      case 'cmp': return comparerVBA(this.evaluer(n.a, portee), this.evaluer(n.b, portee), n.op, n.l);
      case 'is': { const a = this.evaluer(n.a, portee), b = this.evaluer(n.b, portee); if (a === Nothing || b === Nothing) return a === b; if (a instanceof RangeVBA && b instanceof RangeVBA) return a.f === b.f && a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2; if (a instanceof WorksheetVBA && b instanceof WorksheetVBA) return a.idx === b.idx; return a === b; }
      case 'like': return like(texte(scalaire(this.evaluer(n.a, portee))), texte(scalaire(this.evaluer(n.b, portee))));
      case 'bin': {
        const a = scalaire(this.evaluer(n.a, portee)), b = scalaire(this.evaluer(n.b, portee));
        switch (n.op) {
          case '&': return (a === null && b === null) ? null : texte(a) + texte(b);
          case '+': {
            if (a === null || b === null) return null;
            if (typeof a === 'string' && typeof b === 'string') return a + b;
            if (typeof a === 'string' && b === undefined) return a;
            if (typeof b === 'string' && a === undefined) return b;
            return nombre(a, n.l) + nombre(b, n.l);
          }
          case '-': if (a === null || b === null) return null; return nombre(a, n.l) - nombre(b, n.l);
          case '*': if (a === null || b === null) return null; return nombre(a, n.l) * nombre(b, n.l);
          case '/': { if (a === null || b === null) return null; const d = nombre(b, n.l); if (d === 0) throw erreur(E_DIV0, 'Division par zéro', n.l); return nombre(a, n.l) / d; }
          case '\\': { if (a === null || b === null) return null; const d = Math.trunc(nombre(b, n.l)); if (d === 0) throw erreur(E_DIV0, 'Division par zéro', n.l); return Math.trunc(Math.trunc(nombre(a, n.l)) / d); }
          case 'MOD': { if (a === null || b === null) return null; const d = Math.trunc(nombre(b, n.l)); if (d === 0) throw erreur(E_DIV0, 'Division par zéro', n.l); const x = Math.trunc(nombre(a, n.l)); return x - d * Math.trunc(x / d); }
          case '^': { if (a === null || b === null) return null; const r = Math.pow(nombre(a, n.l), nombre(b, n.l)); if (!Number.isFinite(r)) throw erreur(E_DEBORD, 'Dépassement de capacité', n.l); return r; }
          case 'AND': { if (typeof a === 'boolean' && typeof b === 'boolean') return a && b; if (a === null || b === null) return (a === false || b === false) ? false : null; if (typeof a === 'boolean' || typeof b === 'boolean') return booleen(a, n.l) && booleen(b, n.l); return Math.trunc(nombre(a, n.l)) & Math.trunc(nombre(b, n.l)); }
          case 'OR': { if (typeof a === 'boolean' && typeof b === 'boolean') return a || b; if (a === null || b === null) return (a === true || b === true) ? true : null; if (typeof a === 'boolean' || typeof b === 'boolean') return booleen(a, n.l) || booleen(b, n.l); return Math.trunc(nombre(a, n.l)) | Math.trunc(nombre(b, n.l)); }
          case 'XOR': { if (typeof a === 'boolean' && typeof b === 'boolean') return a !== b; if (a === null || b === null) return null; return Math.trunc(nombre(a, n.l)) ^ Math.trunc(nombre(b, n.l)); }
          case 'EQV': { if (typeof a === 'boolean' && typeof b === 'boolean') return a === b; return ~(Math.trunc(nombre(a, n.l)) ^ Math.trunc(nombre(b, n.l))); }
          case 'IMP': { if (typeof a === 'boolean' && typeof b === 'boolean') return !a || b; return ~Math.trunc(nombre(a, n.l)) | Math.trunc(nombre(b, n.l)); }
        }
        throw erreur(E_ARG, 'Opérateur inconnu ' + n.op, n.l);
      }
    }
    throw erreur(E_ARG, 'Expression non gérée : ' + n.k, n.l);
  }

  /** Objets globaux accessibles sans préfixe. */
  objetGlobal(nom, args, portee, ligne) {
    const N = nom.toUpperCase();
    switch (N) {
      case 'APPLICATION': return { trouve: true, v: this.application };
      case 'THISWORKBOOK': case 'ACTIVEWORKBOOK': return { trouve: true, v: this.classeurVBA };
      case 'WORKSHEETS': case 'SHEETS': case 'ACTIVESHEET': case 'ACTIVECELL': case 'SELECTION': case 'RANGE': case 'CELLS': case 'ROWS': case 'COLUMNS': case 'EVALUATE': case 'NAMES': case 'WORKBOOKS':
        if (N === 'NAMES') return { trouve: true, v: this.classeurVBA.get('NAMES', args, this) };
        return { trouve: true, v: this.application.get(N, args, this) };
      case 'WORKSHEETFUNCTION': return { trouve: true, v: new WorksheetFunctionVBA(this) };
      case 'ERR': return { trouve: true, v: this.err };
      case 'DEBUG': return { trouve: true, v: this.debug };
      case 'ME': return { trouve: true, v: new WorksheetVBA(this, this.classeur.active) };
    }
    return { trouve: false };
  }

  /**
   * Évalue une chaîne base.membre(args)… ; si `argsFinals` est fourni (appel sans parenthèses),
   * ils s'appliquent au dernier élément. `instruction` : appel en tant qu'instruction (résultat ignoré).
   */
  evaluerChaine(n, portee, argsFinals, instruction) {
    let courant;
    let chaine = n.chaine.slice();
    const l = n.l;
    if (n.base.k === 'with') {
      const racine = this.porteeProcedure(portee);
      if (!racine.with || !racine.with.length) throw erreur(E_ARG, 'Référence « . » hors d\'un bloc With', l);
      courant = racine.with[racine.with.length - 1];
    } else if (n.base.k === 'id') {
      const nom = n.base.nom;
      const N = nom.toUpperCase();
      // Premier élément : (args) directement sur l'identifiant ?
      const premierArgs = chaine.length && !chaine[0].nom ? chaine[0].args : null;
      const argsEval = () => this.evaluerArgs(premierArgs ? premierArgs : (chaine.length === 0 && argsFinals ? [] : []), portee);
      const slot = this.chercher(portee, nom);
      const valeurSlot = slot ? (slot.ref ? slot.ref.get() : slot.v) : undefined;
      if (slot && !(premierArgs && this.prog.procedures.has(N) && !(valeurSlot instanceof TableauVBA) && !(valeurSlot instanceof ObjetVBA))) {
        courant = valeurSlot;
      } else if (this.prog.procedures.has(N)) {
        const p = this.prog.procedures.get(N);
        let args;
        if (premierArgs) { args = this.evaluerArgs(premierArgs, portee); chaine.shift(); }
        else if (!chaine.length && argsFinals) { args = argsFinals; argsFinals = null; }
        else args = [];
        courant = this.appelerProcedure(p, args);
        if (premierArgs === null && chaine.length === 0 && instruction) return courant;
      } else if (FONCTIONS_VBA[N]) {
        let args;
        if (premierArgs) { args = this.evaluerArgs(premierArgs, portee); chaine.shift(); }
        else if (!chaine.length && argsFinals) { args = argsFinals; argsFinals = null; }
        else args = [];
        courant = FONCTIONS_VBA[N](args.map((a) => (a.k === 'omis' ? undefined : a.v)), this, args);
      } else {
        let args = null;
        if (premierArgs) { args = this.evaluerArgs(premierArgs, portee); }
        else if (!chaine.length && argsFinals) { args = argsFinals; argsFinals = null; }
        const g = this.objetGlobal(nom, args, portee, l);
        if (g.trouve) { courant = g.v; if (premierArgs && ['WORKSHEETS', 'SHEETS', 'RANGE', 'CELLS', 'ROWS', 'COLUMNS', 'EVALUATE', 'NAMES'].includes(N)) chaine.shift(); else if (premierArgs && courant instanceof ObjetVBA) { courant = courant.index(args, this); chaine.shift(); } }
        else if (N in CONSTANTES) courant = CONSTANTES[N];
        else if (this.prog.explicit) throw erreur(E_NOM, 'Variable non définie : ' + nom, l);
        else { if (chaine.length || argsFinals) throw erreur(E_NOM, 'Sub, Function ou variable non définie : ' + nom, l); portee.vars.set(N, { v: undefined }); courant = undefined; }
      }
    } else courant = this.evaluer(n.base, portee);

    for (let i = 0; i < chaine.length; i++) {
      const e = chaine[i];
      const dernier = i === chaine.length - 1;
      let args = e.args ? this.evaluerArgs(e.args, portee) : null;
      if (dernier && argsFinals) { args = argsFinals; }
      if (e.nom) {
        if (courant === Nothing || courant === undefined || courant === null) throw erreur(E_OBJET, 'Variable objet ou variable de bloc With non définie (membre « ' + e.nom + ' »)', e.l);
        if (courant instanceof ObjetVBA) courant = courant.get(e.nom, args, this);
        else if (typeof courant === 'string' || typeof courant === 'number' || typeof courant === 'boolean') {
          // « x.Value » sur une valeur simple : VBA renvoie l'objet lui-même pour Value
          if (e.nom.toUpperCase() === 'VALUE' || e.nom.toUpperCase() === 'TEXT') courant = courant; else throw erreur(E_MEMBRE, 'Propriété ou méthode non gérée par cet objet : ' + e.nom, e.l);
        } else if (courant instanceof TableauVBA) {
          const N = e.nom.toUpperCase();
          if (N === 'COUNT' || N === 'LENGTH') courant = courant.data.length; else throw erreur(E_MEMBRE, 'Un tableau n\'a pas de membre ' + e.nom, e.l);
        } else throw erreur(E_MEMBRE, 'Propriété ou méthode non gérée par cet objet : ' + e.nom, e.l);
      } else {
        // Indexation
        if (courant instanceof TableauVBA) courant = courant.get(args.map((a) => nombre(a.v, e.l)));
        else if (courant instanceof ObjetVBA) courant = courant.index(args, this);
        else if (typeof courant === 'function') courant = courant(args);
        else throw erreur(E_INDICE, 'Cette valeur n\'est pas un tableau ni une collection', e.l);
      }
    }
    return courant;
  }

  affecter(cible, v, portee, ligne, set = false) {
    if (cible.k !== 'chaine') throw erreur(E_ARG, 'Cible d\'affectation invalide', ligne);
    if (cible.base.k === 'id' && !cible.chaine.length) {
      const N = cible.base.nom.toUpperCase();
      // Nom de la fonction courante → valeur de retour
      const racine = this.porteeProcedure(portee);
      if (racine.fonction && racine.fonction.toUpperCase() === N) { racine.vars.get(N).v = v; return; }
      const slot = this.chercher(portee, cible.base.nom);
      if (!slot) {
        const g = this.objetGlobal(cible.base.nom, null, portee, ligne);
        if (g.trouve) { if (g.v instanceof ObjetVBA) { g.v.set('VALUE', null, v, this); return; } }
      }
      if (slot && slot.type && !set) {
        const t = slot.type.toUpperCase();
        if (t === 'STRING') v = texte(scalaire(v));
        else if (['INTEGER', 'LONG', 'BYTE', 'LONGLONG'].includes(t)) v = arrondiBancaire(nombre(scalaire(v), ligne));
        else if (['DOUBLE', 'SINGLE', 'CURRENCY', 'DECIMAL', 'DATE'].includes(t)) v = nombre(scalaire(v), ligne);
        else if (t === 'BOOLEAN') v = booleen(scalaire(v), ligne);
        else if (v instanceof RangeVBA && t === 'VARIANT') v = v.valeur();
      } else if (slot && slot.type && set && v instanceof RangeVBA && slot.type.toUpperCase() === 'VARIANT') { /* Set x = Range : garde l'objet */ }
      this.ecrire(portee, cible.base.nom, v, ligne);
      return;
    }
    // Chaîne : évaluer tout sauf le dernier élément
    const dernier = cible.chaine[cible.chaine.length - 1];
    const sans = { ...cible, chaine: cible.chaine.slice(0, -1) };
    let objet;
    if (!sans.chaine.length && sans.base.k === 'id') {
      const slot = this.chercher(portee, sans.base.nom);
      if (slot) objet = slot.ref ? slot.ref.get() : slot.v;
      else {
        const g = this.objetGlobal(sans.base.nom, dernier.args && !dernier.nom ? this.evaluerArgs(dernier.args, portee) : null, portee, ligne);
        if (g.trouve) {
          objet = g.v;
          if (!dernier.nom && ['RANGE', 'CELLS', 'WORKSHEETS', 'SHEETS', 'ROWS', 'COLUMNS'].includes(sans.base.nom.toUpperCase())) { if (objet instanceof RangeVBA) { objet.poser(v); return; } throw erreur(E_ARG, 'Affectation impossible', ligne); }
        } else if (this.prog.procedures.has(sans.base.nom.toUpperCase())) objet = this.appelerProcedure(this.prog.procedures.get(sans.base.nom.toUpperCase()), []);
        else throw erreur(E_NOM, 'Variable non définie : ' + sans.base.nom, ligne);
      }
    } else objet = this.evaluerChaine(sans, portee, null, false);
    const args = dernier.args ? this.evaluerArgs(dernier.args, portee) : null;
    if (dernier.nom) {
      if (objet === Nothing || objet == null) throw erreur(E_OBJET, 'Variable objet ou variable de bloc With non définie', ligne);
      if (!(objet instanceof ObjetVBA)) throw erreur(E_MEMBRE, 'Propriété non gérée : ' + dernier.nom, ligne);
      objet.set(dernier.nom, args, v, this);
    } else {
      if (objet instanceof TableauVBA) objet.set(args.map((a) => nombre(a.v, ligne)), v);
      else if (objet instanceof ObjetVBA) objet.setIndex(args, v, this);
      else throw erreur(E_INDICE, 'Cette variable n\'est pas un tableau', ligne);
    }
  }
}

/**
 * Raccourci : charge le code, exécute une procédure et renvoie { resultat, sortie, erreur }.
 */
export function executerMacro(classeur, code, nomProcedure, hote = {}) {
  const it = new InterpreteurVBA(classeur, hote);
  try {
    it.charger(code);
    const nom = nomProcedure || it.listerProcedures()[0];
    if (!nom) throw erreur(35, 'Aucune procédure Sub sans paramètre à exécuter');
    const resultat = it.executerProcedure(nom);
    return { resultat, sortie: it.sortie, erreur: null, interpreteur: it };
  } catch (e) {
    if (e instanceof ErreurVBA) return { resultat: undefined, sortie: it.sortie, erreur: e, interpreteur: it };
    if (e instanceof SignalExit) return { resultat: undefined, sortie: it.sortie, erreur: null, interpreteur: it };
    if (e instanceof SignalGoTo) return { resultat: undefined, sortie: it.sortie, erreur: erreur(E_ARG, 'Étiquette introuvable : ' + e.label), interpreteur: it };
    throw e;
  }
}

export { RangeVBA, WorksheetVBA, texte as texteVBA, nombre as nombreVBA };
