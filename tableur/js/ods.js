// Classeurs OpenDocument (.ods, LibreOffice) : écriture complète (valeurs, formules, formats de nombre, styles,
// largeurs, fusions, lignes et colonnes masquées, notes, liens) et lecture de la mise en forme
// (SheetJS lit déjà les valeurs et les formules d'un .ods, mais pas les styles).

import { ErreurFormule, convertirFormule, tokeniser, colVersLettres, serieVersDate, formater, parsePlage, dateVersSerie } from './formules.js';
import { mp, PAPIERS } from './impression.js';
import { objetsOds, lireObjetsOds } from './ods-objets.js';

const ech = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom.replace(':', '\\:') + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const enc = (s) => new TextEncoder().encode(s);
const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"';
const POUCE = 96; // px par pouce
const pouces = (px) => (px / POUCE).toFixed(4) + 'in';
const LARGEUR = 84, HAUTEUR = 24;

// ---------------------------------------------------------------------------
// Formules : syntaxe de l'interface → OpenFormula (of:=SOMME… → of:=SUM([.A1:.A9]; 2))
// ---------------------------------------------------------------------------
export function versOpenFormula(f, resoudre = null) {
  const en = convertirFormule(f, 'en');
  const src = en.slice(1);
  let toks;
  try { toks = tokeniser(src, 'en'); } catch { return null; }
  let out = '', pos = 0;
  for (const t of toks) {
    out += src.slice(pos, t.pos);
    const brut = src.slice(t.pos, t.fin);
    if (t.t === 'tref') {
      // Référence de tableau (Dépenses[Réel], [@Prix]) : pas d'équivalent ODF, on écrit la plage qu'elle désigne
      const p = resoudre && resoudre(t.table, t.spec);
      if (!p) return null;
      const nomF = p.feuille ? (/^[\p{L}_][\p{L}\d_]*$/u.test(p.feuille) ? '$' + p.feuille : "$'" + p.feuille.replace(/'/g, "''") + "'") : '';
      const a1 = colVersLettres(p.c1) + (p.r1 + 1), a2 = colVersLettres(p.c2) + (p.r2 + 1);
      out += '[' + nomF + '.' + a1 + (a1 !== a2 ? ':' + nomF + '.' + a2 : '') + ']';
      pos = t.fin; continue;
    }
    if (t.t === 'ref') {
      const feuille = t.feuille != null ? (/^[\p{L}_][\p{L}\d_]*$/u.test(t.feuille) ? '$' + t.feuille : "$'" + t.feuille.replace(/'/g, "''") + "'") : '';
      const parts = t.v.split(':');
      out += '[' + parts.map((p, i) => (i === 0 ? feuille : feuille) + '.' + p).join(':') + ']' + (t.debord ? '#' : '');
    } else if (t.t === 'sep') out += ';';
    else if (t.t === 'fonction') out += t.v.replace(/^_XLFN\.|^_XLWS\./, '') + '(';
    else out += brut;
    pos = t.fin;
  }
  return 'of:=' + out + src.slice(pos);
}

// Plage désignée par une référence structurée, vue depuis la cellule (fi, r, c) : { feuille, r1, c1, r2, c2 } ou null
function plageStructuree(classeur, fi, r, c, table, spec) {
  const ev = classeur.evaluateur, sauve = ev.courant;
  try {
    ev.courant = { feuille: fi, r, c };
    const p = ev.plageTableau(table, spec);
    return { feuille: p.feuille === fi ? '' : classeur.feuilles[p.feuille].nom, r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2 };
  } catch { return null; } finally { ev.courant = sauve; }
}

// ---------------------------------------------------------------------------
// Formats de nombre → styles de données ODF
// ---------------------------------------------------------------------------
function styleDonnees(nom, z) {
  if (!z || z === 'General') return null;
  const sec = z.split(';')[0].replace(/\[(?![hms]+\])[^\]]*\]/gi, ''); // couleurs ôtées, durées [h] gardées
  const rouge = /;\[(Red|Rouge)\]/i.test(z);
  if (/[dmyjhs]/i.test(sec.replace(/"[^"]*"/g, '')) && !/[0#]/.test(sec)) {
    // Date ou heure : on découpe le code en morceaux
    let x = '', i = 0;
    const s = sec.replace(/\\(.)/g, '"$1"');
    while (i < s.length) {
      const reste = s.slice(i);
      let m;
      if ((m = /^"([^"]*)"/.exec(reste))) { x += '<number:text>' + ech(m[1]) + '</number:text>'; i += m[0].length; continue; }
      if ((m = /^\[(h+)\]/i.exec(reste))) { x += '<number:hours' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^\[(m+)\]/i.exec(reste))) { x += '<number:minutes' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(yyyy|aaaa|yy|aa)/i.exec(reste))) { x += '<number:year' + (m[1].length > 2 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(dddd|jjjj|ddd|jjj)/i.exec(reste))) { x += '<number:day-of-week' + (m[1].length > 3 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(dd|jj|d|j)/i.exec(reste))) { x += '<number:day' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(hh|h)/i.exec(reste))) { x += '<number:hours' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(ss|s)/i.exec(reste))) { x += '<number:seconds' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>'; i += m[0].length; continue; }
      if ((m = /^(mmmm|mmm|mm|m)/i.exec(reste))) {
        // « m » après des heures = minutes
        const minutes = /<number:hours[^>]*\/>(<number:text>[^<]*<\/number:text>)?$/.test(x);
        x += minutes ? '<number:minutes' + (m[1].length > 1 ? ' number:style="long"' : '') + '/>' : '<number:month' + (m[1].length > 2 ? ' number:textual="true"' : '') + (m[1].length === 2 || m[1].length === 4 ? ' number:style="long"' : '') + '/>';
        i += m[0].length; continue;
      }
      if ((m = /^AM\/PM/i.exec(reste))) { x += '<number:am-pm/>'; i += m[0].length; continue; }
      x += '<number:text>' + ech(s[i]) + '</number:text>'; i++;
    }
    const heure = /<number:(hours|minutes|seconds)/.test(x) && !/<number:(day|month|year)/.test(x);
    return { type: heure ? 'time' : 'date', xml: '<number:' + (heure ? 'time' : 'date') + '-style style:name="' + nom + '"' + (/\[h/i.test(sec) ? ' number:truncate-on-overflow="false"' : '') + '>' + x + '</number:' + (heure ? 'time' : 'date') + '-style>' };
  }
  const dec = (/\.(0+)/.exec(sec) || [, ''])[1].length;
  const groupe = /#,##0|0,000/.test(sec) ? ' number:grouping="true"' : '';
  // Virgules finales (« #,##0, ») : affichage en milliers, en millions…
  const echelle = (/[0#?](,+)(?![0#?])/.exec(sec.replace(/"[^"]*"/g, '')) || [, ''])[1].length;
  const nombre = '<number:number number:decimal-places="' + dec + '" number:min-decimal-places="' + dec + '" number:min-integer-digits="1"' + groupe + (echelle ? ' number:display-factor="' + 1000 ** echelle + '"' : '') + '/>';
  // Texte autour du nombre (« 0.0 "ans" », « "x" 0.00 ») gardé tel quel
  const autour = (s0) => {
    const t = s0.replace(/\[[^\]]*\]/g, '').replace(/\\(.)/g, '"$1"');
    const brut = t.replace(/"[^"]*"/g, (q) => '\u0001'.repeat(q.length));
    const i = brut.search(/[0#?]/), j = Math.max(brut.lastIndexOf('0'), brut.lastIndexOf('#'), brut.lastIndexOf('?'));
    if (i < 0) return ['', ''];
    const net = (x) => x.replace(/"([^"]*)"/g, '$1').replace(/^[,.]+/, '').replace(/_./g, ' ').replace(/\*./g, '');
    return [net(t.slice(0, i)), net(t.slice(j + 1))];
  };
  const texteNombre = (s0) => { const [a, b] = autour(s0); return (a ? '<number:text>' + ech(a) + '</number:text>' : '') + nombre + (b.trim() ? '<number:text>' + ech(b) + '</number:text>' : ''); };
  if (/%/.test(sec)) {
    // Pourcentage : texte avant le nombre (« +2,5 % »), section des négatifs (en rouge) si elle existe
    const avant = (s0) => { const t = s0.replace(/\[[^\]]*\]/g, '').replace(/"([^"]*)"/g, '$1'); const i = t.search(/[0#?]/); return i > 0 ? t.slice(0, i) : ''; };
    const corps = (s0) => (avant(s0) ? '<number:text>' + ech(avant(s0)) + '</number:text>' : '') + nombre + '<number:text>%</number:text>';
    const secs = z.split(';');
    if (secs.length > 1) {
      const neg = secs[1], r = /\[(Red|Rouge)\]/i.test(neg);
      return { type: 'percentage', nomFinal: nom + 'N', xml: '<number:percentage-style style:name="' + nom + 'P">' + corps(sec) + '</number:percentage-style><number:percentage-style style:name="' + nom + 'N">' + (r ? '<style:text-properties fo:color="#ff0000"/>' : '') + corps(neg) + '<style:map style:condition="value()&gt;=0" style:apply-style-name="' + nom + 'P"/></number:percentage-style>' };
    }
    return { type: 'percentage', xml: '<number:percentage-style style:name="' + nom + '">' + corps(sec) + '</number:percentage-style>' };
  }
  if (/E\+/i.test(sec)) return { type: 'float', xml: '<number:number-style style:name="' + nom + '"><number:scientific-number number:decimal-places="' + dec + '" number:min-integer-digits="1" number:min-exponent-digits="2"/></number:number-style>' };
  // Un symbole seul entre guillemets est une devise ; « "k€" » reste du texte
  const devise = /€|\$|£|CHF/.exec(sec.replace(/"([^"]*)"/g, (q, t) => (/^\s*(€|\$|£|CHF)\s*$/.test(t) ? t : '')));
  if (devise) {
    const avant = sec.indexOf(devise[0]) < sec.search(/[0#]/);
    const sym = '<number:currency-symbol>' + ech(devise[0]) + '</number:currency-symbol>';
    const corps = (avant ? sym : '') + nombre + (avant ? '' : '<number:text> </number:text>' + sym);
    const neg = rouge ? '<number:currency-style style:name="' + nom + 'N"><style:text-properties fo:color="#ff0000"/><number:text>-</number:text>' + corps + '<style:map style:condition="value()&gt;=0" style:apply-style-name="' + nom + 'P"/></number:currency-style>' : '';
    return { type: 'currency', devise: devise[0] === '€' ? 'EUR' : devise[0] === '$' ? 'USD' : devise[0] === '£' ? 'GBP' : 'CHF', xml: '<number:currency-style style:name="' + nom + (rouge ? 'P' : '') + '">' + corps + '</number:currency-style>' + neg, nomFinal: rouge ? nom + 'N' : nom };
  }
  if (/^[#,0.]+$/.test(sec.trim()) || /0/.test(sec)) {
    const secs = z.split(';');
    if (secs.length > 1) {
      // Sections des négatifs (« (#,##0) », en rouge…) et du zéro (« "-" ») comme dans Excel
      const net = (x) => x.replace(/\[[^\]]*\]/g, '');
      const negatif = /[0#?]/.test(net(secs[1])) ? texteNombre(net(secs[1])) : '<number:text>' + ech(net(secs[1]).replace(/"([^"]*)"/g, '$1')) + '</number:text>';
      const zero = secs[2] !== undefined ? (/[0#?]/.test(net(secs[2])) ? texteNombre(net(secs[2])) : '<number:text>' + ech(net(secs[2]).replace(/"([^"]*)"/g, '$1').replace(/_./g, ' ')) + '</number:text>') : '';
      const r = /\[(Red|Rouge)\]/i.test(secs[1]);
      return { type: 'float', nomFinal: nom + 'N', xml: '<number:number-style style:name="' + nom + 'P">' + texteNombre(sec) + '</number:number-style>'
        + (zero ? '<number:number-style style:name="' + nom + 'Z">' + zero + '</number:number-style>' : '')
        + '<number:number-style style:name="' + nom + 'N">' + (r ? '<style:text-properties fo:color="#ff0000"/>' : '') + negatif
        + (zero ? '<style:map style:condition="value()=0" style:apply-style-name="' + nom + 'Z"/>' : '')
        + '<style:map style:condition="value()&gt;' + (zero ? '' : '=') + '0" style:apply-style-name="' + nom + 'P"/></number:number-style>' };
    }
    return { type: 'float', xml: '<number:number-style style:name="' + nom + '">' + texteNombre(sec) + '</number:number-style>' };
  }
  if (z === '@') return { type: 'string', xml: '<number:text-style style:name="' + nom + '"><number:text-content/></number:text-style>' };
  return null;
}

const TRAITS = { thin: '0.75pt solid', medium: '1.75pt solid', thick: '2.5pt solid', double: '2.5pt double', dashed: '0.75pt dashed', mediumDashed: '1.75pt dashed', dotted: '0.75pt dotted', hair: '0.5pt dotted' };
function proprietesCellule(s) {
  let c = '', t = '', p = '';
  if (s.fond) c += ' fo:background-color="' + s.fond + '"';
  const b = s.bordures || (s.bordure ? { h: 'thin', b: 'thin', g: 'thin', d: 'thin' } : null);
  if (b) for (const [k, n] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) if (b[k]) c += ' fo:border-' + n + '="' + (TRAITS[b[k]] || TRAITS.thin) + ' ' + (s.bordCouleur || '#000000') + '"';
  if (s.renvoi) c += ' fo:wrap-option="wrap"';
  if (s.valign) c += ' style:vertical-align="' + (s.valign === 'top' ? 'top' : 'middle') + '"';
  if (s.align) { p += ' fo:text-align="' + { left: 'start', center: 'center', right: 'end' }[s.align] + '"'; c += ' style:text-align-source="fix"'; }
  if (s.retrait) p += ' fo:margin-left="' + (s.retrait * 0.0984).toFixed(4) + 'in"';
  if (s.deverrouille || s.masquee) c += ' style:cell-protect="' + (s.deverrouille && s.masquee ? 'formula-hidden' : s.deverrouille ? 'none' : 'protected formula-hidden') + '"';
  if (s.gras) t += ' fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"';
  if (s.italique) t += ' fo:font-style="italic"';
  if (s.souligne) t += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
  if (s.barre) t += ' style:text-line-through-style="solid"';
  if (s.couleur) t += ' fo:color="' + s.couleur + '"';
  if (s.taille) t += ' fo:font-size="' + Math.round(s.taille * 0.75) + 'pt"';
  if (s.police) t += ' style:font-name="' + ech(s.police) + '"';
  return (c ? '<style:table-cell-properties' + c + '/>' : '') + (p ? '<style:paragraph-properties' + p + '/>' : '') + (t ? '<style:text-properties' + t + '/>' : '');
}
function proprietesRun(s) {
  let t = '';
  if (s.gras !== undefined) t += ' fo:font-weight="' + (s.gras ? 'bold' : 'normal') + '"';
  if (s.italique !== undefined) t += ' fo:font-style="' + (s.italique ? 'italic' : 'normal') + '"';
  if (s.souligne) t += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
  if (s.barre) t += ' style:text-line-through-style="solid"';
  if (s.couleur) t += ' fo:color="' + s.couleur + '"';
  if (s.taille) t += ' fo:font-size="' + Math.round(s.taille * 0.75) + 'pt"';
  if (s.police) t += ' style:font-name="' + ech(s.police) + '"';
  return t;
}

// ---------------------------------------------------------------------------
// Validation des données, mise en forme conditionnelle, mise en page, volets figés (écriture)
// ---------------------------------------------------------------------------
const nomOds = (n) => (/^[\p{L}_][\p{L}\d_]*$/u.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");
const adrOds = (feuille, p) => { const a = colVersLettres(p.c1) + (p.r1 + 1), b = colVersLettres(p.c2) + (p.r2 + 1); return nomOds(feuille) + '.' + a + (a !== b ? ':' + nomOds(feuille) + '.' + b : ''); };
/** Plages d'une règle (« B2:B50 D2:D9 », colonnes entières comprises), bornées pour l'écriture. */
function plagesRegle(texte) {
  return String(texte || '').split(/[\s;]+/).filter(Boolean).map((t) => {
    const u = t.replace(/\$/g, '');
    let m;
    if ((m = /^([A-Z]{1,3}):([A-Z]{1,3})$/i.exec(u))) return { r1: 0, c1: lettresCol(m[1]), r2: 1048575, c2: lettresCol(m[2]) };
    if ((m = /^(\d+):(\d+)$/.exec(u))) return { r1: +m[1] - 1, c1: 0, r2: +m[2] - 1, c2: 16383 };
    return parsePlage(u);
  }).filter(Boolean);
}
const lettresCol = (l) => { let n = 0; for (const ch of l.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const expr = (f) => { const of = versOpenFormula(f.startsWith('=') ? f : '=' + f); return of ? of.replace(/^of:=/, '') : null; };
// Valeur d'une condition : nombre, =formule ou texte entre guillemets
function valeurCond(x) {
  const t = String(x ?? '').trim();
  if (t.startsWith('=')) return expr(t);
  const n = +t.replace(/\s/g, '').replace(',', '.');
  if (t !== '' && !isNaN(n)) return String(n);
  return '"' + t.replace(/"/g, '""') + '"';
}
// Borne d'une validation : nombre, date (jj/mm/aaaa), heure (hh:mm) ou =formule
function borneOds(x) {
  const t = String(x ?? '').trim();
  if (t === '') return null;
  if (t.startsWith('=')) return expr(t);
  let m;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) { let an = +m[3]; if (an < 100) an += an < 30 ? 2000 : 1900; return String(dateVersSerie(new Date(Date.UTC(an, +m[2] - 1, +m[1])))); }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t))) return String((+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400);
  const n = +t.replace(/\s/g, '').replace(',', '.');
  return isNaN(n) ? null : String(n);
}
const OPS_ODS = { '>': '>', '<': '<', '>=': '>=', '<=': '<=', '=': '=', '<>': '!=' };
function conditionValidation(v) {
  if (v.type === 'liste') {
    const src = String(v.liste || '').trim();
    if (src.startsWith('=')) { const e = expr(src); return e ? 'of:cell-content-is-in-list(' + e + ')' : null; }
    const el = src.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
    return 'of:cell-content-is-in-list(' + el.map((x) => '"' + x.replace(/"/g, '""') + '"').join(';') + ')';
  }
  if (v.type === 'formule') { const e = expr(String(v.formule || v.v1 || '')); return e ? 'of:is-true-formula(' + e + ')' : null; }
  const a = borneOds(v.v1), b = borneOds(v.v2), op = v.op || 'entre';
  const base = { entier: 'cell-content-is-whole-number()', decimal: 'cell-content-is-decimal-number()', date: 'cell-content-is-date()', heure: 'cell-content-is-time()' }[v.type];
  const longueur = v.type === 'longueur';
  if (!base && !longueur) return null;
  if (a === null) return base ? 'of:' + base : null;
  let c;
  if (op === 'entre' || op === 'hors') c = (longueur ? 'cell-content-text-length-is-' : 'cell-content-is-') + (op === 'hors' ? 'not-' : '') + 'between(' + a + ',' + (b ?? a) + ')';
  else c = (longueur ? 'cell-content-text-length()' : 'cell-content()') + OPS_ODS[op] + a;
  return 'of:' + (base ? base + ' and ' : '') + c;
}
function xmlValidation(nom, v, cond, feuille, p) {
  const err = v.erreur || {}, msg = v.message || {};
  const type = { stop: 'stop', avertissement: 'warning', information: 'information' }[err.style || 'stop'] || 'stop';
  return '<table:content-validation table:name="' + nom + '" table:condition="' + ech(cond) + '" table:allow-empty-cell="' + (v.vides !== false) + '"'
    + (v.type === 'liste' ? ' table:display-list="' + (v.fleche === false ? 'none' : 'unsorted') + '"' : '') + ' table:base-cell-address="' + ech(adrOds(feuille, { r1: p.r1, c1: p.c1, r2: p.r1, c2: p.c1 })) + '">'
    + (msg.titre || msg.texte ? '<table:help-message' + (msg.titre ? ' table:title="' + ech(msg.titre) + '"' : '') + ' table:display="true">' + (msg.texte ? String(msg.texte).split('\n').map((l) => '<text:p>' + ech(l) + '</text:p>').join('') : '') + '</table:help-message>' : '')
    + '<table:error-message table:message-type="' + type + '"' + (err.titre ? ' table:title="' + ech(err.titre) + '"' : '') + ' table:display="true">' + (err.texte ? String(err.texte).split('\n').map((l) => '<text:p>' + ech(l) + '</text:p>').join('') : '') + '</table:error-message></table:content-validation>';
}
// Une règle de mise en forme conditionnelle → contenu d'un <calcext:conditional-format> (styleCond donne le nom du style)
function xmlMfc(regle, base, styleCond) {
  const cond = (valeur) => '<calcext:condition calcext:apply-style-name="' + styleCond(regle.style || {}) + '" calcext:value="' + ech(valeur) + '" calcext:base-cell-address="' + ech(base) + '"/>';
  const premiere = base.slice(base.lastIndexOf('.') + 1);
  switch (regle.type) {
    case 'valeur': {
      const a = valeurCond(regle.v1), b = valeurCond(regle.v2);
      if (a === null) return null;
      if (regle.op === 'entre' || regle.op === 'hors') return b === null ? null : cond((regle.op === 'hors' ? 'not-' : '') + 'between(' + a + ',' + b + ')');
      return OPS_ODS[regle.op] ? cond(OPS_ODS[regle.op] + a) : null;
    }
    case 'texte': return cond({ contient: 'contains-text', necontientpas: 'not-contains-text', commence: 'begins-with', termine: 'ends-with' }[regle.op || 'contient'] + '("' + String(regle.texte || '').replace(/"/g, '""') + '")');
    case 'formule': { const e = expr(String(regle.formule || '')); return e ? cond('formula-is(' + e + ')') : null; }
    case 'doublons': return cond('duplicate');
    case 'uniques': return cond('unique');
    case 'top': return cond((regle.bas ? 'bottom' : 'top') + '-' + (regle.pct ? 'percent' : 'elements') + '(' + (+regle.n || 10) + ')');
    case 'moyenne': return cond(regle.dessous ? 'below-average' : 'above-average');
    case 'vides': return cond('formula-is(LEN(TRIM([.' + premiere + ']))=0)');
    case 'nonvides': return cond('formula-is(LEN(TRIM([.' + premiere + ']))>0)');
    case 'echelle': {
      const cols = regle.couleurs && regle.couleurs.length >= 2 ? regle.couleurs : ['#f8696b', '#ffeb84', '#63be7b'];
      const e = (type, val, c) => '<calcext:color-scale-entry calcext:value="' + val + '" calcext:type="' + type + '" calcext:color="' + c + '"/>';
      return '<calcext:color-scale>' + e('minimum', 0, cols[0]) + (cols.length > 2 ? e('percentile', 50, cols[1]) : '') + e('maximum', 0, cols[cols.length - 1]) + '</calcext:color-scale>';
    }
    case 'barres': return '<calcext:data-bar calcext:max-length="100" calcext:negative-color="#ff0000" calcext:positive-color="' + (regle.couleur || '#638ec6') + '" calcext:axis-color="#000000"><calcext:formatting-entry calcext:value="0" calcext:type="auto-minimum"/><calcext:formatting-entry calcext:value="0" calcext:type="auto-maximum"/></calcext:data-bar>';
    case 'icones': {
      const n = +((/^\d/.exec(regle.jeu || '3') || ['3'])[0]);
      const seuils = regle.seuils && regle.seuils.length === n - 1 ? regle.seuils.map(Number) : Array.from({ length: n - 1 }, (_, k) => Math.round((100 * (k + 1)) / n));
      return '<calcext:icon-set calcext:icon-set-type="' + ech(regle.jeu || '3Arrows') + '"' + (regle.iconeSeule ? ' calcext:show-value="false"' : '') + '>' + [0, ...seuils].map((v) => '<calcext:formatting-entry calcext:value="' + v + '" calcext:type="percent"/>').join('') + '</calcext:icon-set>';
    }
  }
  return null;
}
const PAPIER_POUCES = (nom) => (PAPIERS[nom] || PAPIERS.A4).map((mm) => mm / 25.4);
function proprietesPage(f) {
  const m = mp(f);
  let [w, h] = PAPIER_POUCES(m.papier);
  if (m.orientation === 'paysage') [w, h] = [h, w];
  const cm = (x) => (x / 2.54).toFixed(4) + 'in';
  let a = ' fo:page-width="' + w.toFixed(4) + 'in" fo:page-height="' + h.toFixed(4) + 'in" style:print-orientation="' + (m.orientation === 'paysage' ? 'landscape' : 'portrait') + '"'
    + ' fo:margin-top="' + cm(m.marges.h) + '" fo:margin-bottom="' + cm(m.marges.b) + '" fo:margin-left="' + cm(m.marges.g) + '" fo:margin-right="' + cm(m.marges.d) + '"'
    + ' style:print-page-order="' + (m.ordre === 'droite' ? 'ltr' : 'ttb') + '"';
  if (m.ajuster) a += ' style:scale-to-X="' + (+m.ajuster.l || 0) + '" style:scale-to-Y="' + (+m.ajuster.h || 0) + '"';
  else if (+m.echelle && +m.echelle !== 100) a += ' style:scale-to="' + Math.round(+m.echelle) + '%"';
  if (m.centrerH || m.centrerV) a += ' style:table-centering="' + (m.centrerH && m.centrerV ? 'both' : m.centrerH ? 'horizontal' : 'vertical') + '"';
  a += ' style:print="' + ['charts', 'drawings', 'objects', 'zero-values', ...(m.quadrillage ? ['grid'] : []), ...(m.entetes ? ['headers'] : [])].join(' ') + '"';
  return a;
}
function reglagesOds(classeur) {
  const item = (n, t, v) => '<config:config-item config:name="' + n + '" config:type="' + t + '">' + v + '</config:config-item>';
  const tables = classeur.feuilles.map((f) => {
    const g = f.figer || {}, r = +g.r || 0, c = +g.c || 0;
    return '<config:config-item-map-entry config:name="' + ech(f.nom) + '">' + item('CursorPositionX', 'int', c) + item('CursorPositionY', 'int', r)
      + item('HorizontalSplitMode', 'short', c ? 2 : 0) + item('VerticalSplitMode', 'short', r ? 2 : 0) + item('HorizontalSplitPosition', 'int', c) + item('VerticalSplitPosition', 'int', r)
      + item('ActiveSplitRange', 'short', r && c ? 3 : r ? 2 : c ? 3 : 2) + item('PositionLeft', 'int', 0) + item('PositionRight', 'int', c) + item('PositionTop', 'int', 0) + item('PositionBottom', 'int', r)
      + item('ZoomType', 'short', 0) + item('ZoomValue', 'int', Math.round((f.zoom || 1) * 100)) + item('ShowGrid', 'boolean', 'true') + '</config:config-item-map-entry>';
  }).join('');
  const active = classeur.feuilles[Math.min(classeur.active || 0, classeur.feuilles.length - 1)];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-settings ' + NS + ' office:version="1.3"><office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry>'
    + item('ViewId', 'string', 'view1') + '<config:config-item-map-named config:name="Tables">' + tables + '</config:config-item-map-named>' + item('ActiveTable', 'string', ech(active ? active.nom : ''))
    + '</config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings></office:document-settings>';
}

/** Écrit le classeur en .ods (octets). */
export function ecrireOds(XLSX, classeur) {
  const styles = new Map(), donnees = new Map(), colonnes = new Map(), lignes = new Map(), textes = new Map(), polices = new Set();
  let autos = '';
  const styleData = (z) => {
    if (!z || z === 'General') return null;
    if (donnees.has(z)) return donnees.get(z);
    const nom = 'N' + (donnees.size + 100);
    const d = styleDonnees(nom, z);
    if (d) { autos += d.xml; d.nom = d.nomFinal || nom; }
    donnees.set(z, d);
    return d;
  };
  const styleCellule = (s, z) => {
    const d = styleData(z), props = proprietesCellule(s || {});
    if (!props && !d) return null;
    const cle = props + '|' + (d ? d.nom : '');
    if (s && s.police) polices.add(s.police);
    if (!styles.has(cle)) { const nom = 'ce' + (styles.size + 1); styles.set(cle, nom); autos += '<style:style style:name="' + nom + '" style:family="table-cell" style:parent-style-name="Default"' + (d ? ' style:data-style-name="' + d.nom + '"' : '') + '>' + props + '</style:style>'; }
    return styles.get(cle);
  };
  const styleTexte = (s) => {
    const p = proprietesRun(s || {});
    if (!p) return null;
    if (s.police) polices.add(s.police);
    if (!textes.has(p)) { const nom = 'T' + (textes.size + 1); textes.set(p, nom); autos += '<style:style style:name="' + nom + '" style:family="text"><style:text-properties' + p + '/></style:style>'; }
    return textes.get(p);
  };
  const styleCol = (w) => { const k = Math.round(w); if (!colonnes.has(k)) { const nom = 'co' + (colonnes.size + 1); colonnes.set(k, nom); autos += '<style:style style:name="' + nom + '" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="' + pouces(k) + '"/></style:style>'; } return colonnes.get(k); };
  const styleLig = (h) => { const k = Math.round(h); if (!lignes.has(k)) { const nom = 'ro' + (lignes.size + 1); lignes.set(k, nom); autos += '<style:style style:name="' + nom + '" style:family="table-row"><style:table-row-properties fo:break-before="auto" style:row-height="' + pouces(k) + '" style:use-optimal-row-height="' + (k === HAUTEUR ? 'true' : 'false') + '"/></style:style>'; } return lignes.get(k); };
  // Mise en page : un style de page par réglage différent, un style de feuille par (style de page, visibilité)
  const pagesOds = new Map(), stylesFeuille = new Map();
  let pagesXml = '', maitresXml = '';
  const styleFeuille = (f) => {
    const props = proprietesPage(f);
    if (!pagesOds.has(props)) { const n = pagesOds.size + 1; pagesOds.set(props, n === 1 ? 'Default' : 'Page' + n); pagesXml += '<style:page-layout style:name="pm' + n + '"><style:page-layout-properties' + props + '/></style:page-layout>'; maitresXml += '<style:master-page style:name="' + pagesOds.get(props) + '" style:page-layout-name="pm' + n + '"/>'; }
    const cle = pagesOds.get(props) + '|' + !!f.cachee;
    if (!stylesFeuille.has(cle)) { const nom = 'ta' + (stylesFeuille.size + 1); stylesFeuille.set(cle, nom); autos += '<style:style style:name="' + nom + '" style:family="table" style:master-page-name="' + pagesOds.get(props) + '"><style:table-properties table:display="' + !f.cachee + '" style:writing-mode="lr-tb"/></style:style>'; }
    return stylesFeuille.get(cle);
  };
  // Styles des mises en forme conditionnelles (nommés : rangés dans styles.xml)
  const stylesCond = new Map();
  let condXml = '';
  const styleCond = (st) => { const p = proprietesCellule(st); if (!stylesCond.has(p)) { const nom = 'MFC' + (stylesCond.size + 1); stylesCond.set(p, nom); condXml += '<style:style style:name="' + nom + '" style:family="table-cell" style:parent-style-name="Default">' + p + '</style:style>'; } return stylesCond.get(p); };
  let validationsXml = '', nVal = 0;
  let corps = '';
  // Graphiques, images et formes : dessinés par LibreOffice (fichiers « Object N », « Pictures/ »)
  const compteurObjets = { objet: 0, image: 0, style: 0 }, fichiersObjets = [];
  classeur.feuilles.forEach((f, fi) => {
    let r2 = Math.max(0, f.zone.r2), c2 = Math.max(0, f.zone.c2);
    // Validation des données : une par règle, posée sur chaque cellule de ses plages (vides comprises)
    const vals = [];
    for (const v of f.validations || []) {
      const pl = plagesRegle(v.plage), cond = pl.length && conditionValidation(v);
      if (!cond) continue;
      const nom = 'val' + (++nVal);
      validationsXml += xmlValidation(nom, v, cond, f.nom, pl[0]);
      vals.push({ nom, plages: pl });
      for (const p of pl) { r2 = Math.max(r2, Math.min(p.r2, 1999)); c2 = Math.max(c2, Math.min(p.c2, 255)); }
    }
    const valEn = (r, c) => { for (const v of vals) if (v.plages.some((p) => r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2)) return v.nom; return null; };
    const m = mp(f);
    const zoneImp = m.zone && plagesRegle(m.zone)[0];
    const titres = /^\$?(\d+):\$?(\d+)$/.exec(String(m.titresLignes || '').trim());
    const tr1 = titres ? +titres[1] - 1 : -1, tr2 = titres ? +titres[2] - 1 : -1;
    let t = '<table:table table:name="' + ech(f.nom) + '" table:style-name="' + styleFeuille(f) + '"' + (f.protection && f.protection.active ? ' table:protected="true"' : '') + (zoneImp ? ' table:print-ranges="' + ech(adrOds(f.nom, zoneImp)) + '"' : '') + '>';
    try { const ob = objetsOds(classeur, f, compteurObjets, styleTexte, NS); autos += ob.styles; t += ob.shapes; fichiersObjets.push(...ob.fichiers); } catch (e) { console.warn('Objets non écrits dans le .ods :', e); }
    // Colonnes (groupées quand elles se suivent avec la même largeur)
    let c = 0;
    while (c <= c2) {
      const w = f.largeurs[c], cache = w === 0, larg = w === undefined || w === 0 ? LARGEUR : w;
      let n = 1; while (c + n <= c2 && f.largeurs[c + n] === w) n++;
      t += '<table:table-column table:style-name="' + styleCol(larg) + '"' + (n > 1 ? ' table:number-columns-repeated="' + n + '"' : '') + (cache ? ' table:visibility="collapse"' : '') + ' table:default-cell-style-name="Default"/>';
      c += n;
    }
    const couvertes = new Set();
    for (const m of f.fusions) for (let r = m.r1; r <= m.r2; r++) for (let k = m.c1; k <= m.c2; k++) if (r !== m.r1 || k !== m.c1) couvertes.add(r + ',' + k);
    for (let r = 0; r <= r2; r++) {
      const h = f.hauteurs[r];
      if (r === tr1 && tr2 >= tr1 && tr2 <= r2) t += '<table:table-header-rows>';
      t += '<table:table-row table:style-name="' + styleLig(h === undefined || h === 0 ? HAUTEUR : h) + '"' + (h === 0 || (f.filtrees && f.filtrees.has(r)) ? ' table:visibility="' + (f.filtrees && f.filtrees.has(r) ? 'filter' : 'collapse') + '"' : '') + '>';
      let vides = 0, videsVal = null;
      const viderVides = () => { if (vides) { t += '<table:table-cell' + (videsVal ? ' table:content-validation-name="' + videsVal + '"' : '') + (vides > 1 ? ' table:number-columns-repeated="' + vides + '"' : '') + '/>'; vides = 0; } };
      for (let k = 0; k <= c2; k++) {
        if (couvertes.has(r + ',' + k)) { viderVides(); t += '<table:covered-table-cell/>'; continue; }
        const cel = f.get(r, k), vn = vals.length ? valEn(r, k) : null;
        if (!cel) { if (vides && vn !== videsVal) viderVides(); videsVal = vn; vides++; continue; }
        viderVides();
        const st = styleCellule(cel.s, cel.z), d = cel.z ? donnees.get(cel.z) : null;
        const fus = f.fusions.find((m) => m.r1 === r && m.c1 === k);
        let a = (st ? ' table:style-name="' + st + '"' : '') + (vn ? ' table:content-validation-name="' + vn + '"' : '') + (fus ? ' table:number-columns-spanned="' + (fus.c2 - fus.c1 + 1) + '" table:number-rows-spanned="' + (fus.r2 - fus.r1 + 1) + '"' : '');
        let v = cel.f != null ? classeur.valeur(fi, r, k) : cel.v;
        if (cel.f != null) { const of = versOpenFormula(cel.f, (table, spec) => plageStructuree(classeur, fi, r, k, table, spec)); if (of) a += ' table:formula="' + ech(of) + '"'; }
        let contenu = '';
        if (v instanceof ErreurFormule) { a += ' office:value-type="string" office:string-value="" calcext:value-type="error"'; contenu = '<text:p>' + ech(v.code) + '</text:p>'; a = a.replace(' calcext:value-type="error"', ''); }
        else if (typeof v === 'number') {
          const type = d && d.type !== 'string' ? d.type : 'float';
          if (type === 'date') { const dt = serieVersDate(v); a += ' office:value-type="date" office:date-value="' + dt.toISOString().replace(/(\.000)?Z$/, '').replace(/T00:00:00$/, '') + '"'; }
          else if (type === 'time') { const sec = Math.round(v * 86400); a += ' office:value-type="time" office:time-value="PT' + Math.floor(sec / 3600) + 'H' + Math.floor((sec % 3600) / 60) + 'M' + (sec % 60) + 'S"'; }
          else if (type === 'percentage') a += ' office:value-type="percentage" office:value="' + v + '"';
          else if (type === 'currency') a += ' office:value-type="currency" office:currency="' + d.devise + '" office:value="' + v + '"';
          else a += ' office:value-type="float" office:value="' + v + '"';
          contenu = '<text:p>' + ech(formater(v, cel.z)) + '</text:p>';
        } else if (typeof v === 'boolean') { a += ' office:value-type="boolean" office:boolean-value="' + v + '"'; contenu = '<text:p>' + (v ? 'VRAI' : 'FAUX') + '</text:p>'; }
        else if (v != null && v !== '') {
          a += ' office:value-type="string"';
          const texte = String(v);
          const riche = cel.riche && cel.f == null && cel.riche.map((x) => x.t).join('') === texte;
          const span = (x) => { const n = styleTexte(x.s); return n ? '<text:span text:style-name="' + n + '">' + ech(x.t) + '</text:span>' : ech(x.t); };
          const paragraphes = riche ? decouperRuns(cel.riche).map((l) => l.map(span).join('')) : texte.split('\n').map(ech);
          contenu = paragraphes.map((p) => '<text:p>' + (cel.lien ? '<text:a xlink:type="simple" xlink:href="' + ech(cel.lien) + '">' + p + '</text:a>' : p) + '</text:p>').join('');
        }
        if (cel.note) contenu = '<office:annotation><text:p>' + ech(cel.note) + '</text:p></office:annotation>' + contenu;
        t += '<table:table-cell' + a + (contenu ? '>' + contenu + '</table:table-cell>' : '/>');
      }
      if (videsVal) viderVides(); // cellules vides validées en bout de ligne
      t += '</table:table-row>';
      if (r === tr2 && tr1 >= 0) t += '</table:table-header-rows>';
    }
    // Mise en forme conditionnelle (extension de LibreOffice, lue aussi par Calc et Excel via LibreOffice)
    let mfc = '';
    for (const regle of f.mfc || []) {
      const pl = plagesRegle(regle.plage);
      if (!pl.length) continue;
      const corpsMfc = xmlMfc(regle, adrOds(f.nom, { r1: pl[0].r1, c1: pl[0].c1, r2: pl[0].r1, c2: pl[0].c1 }), styleCond);
      if (corpsMfc) mfc += '<calcext:conditional-format calcext:target-range-address="' + ech(pl.map((p) => adrOds(f.nom, { ...p, r2: Math.min(p.r2, 1048575) })).join(' ')) + '">' + corpsMfc + '</calcext:conditional-format>';
    }
    if (mfc) t += '<calcext:conditional-formats>' + mfc + '</calcext:conditional-formats>';
    corps += t + '</table:table>';
  });
  // Graphiques, boutons, images, formes et macros : feuilles masquées relues par ce tableur (comme dans le .xlsx)
  const espaces = (t) => ech(t).replace(/\t/g, '<text:tab/>').replace(/^ /, '<text:s/>').replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>');
  const cellTexte = (t) => '<table:table-cell office:value-type="string"><text:p>' + espaces(t) + '</text:p></table:table-cell>';
  const objLignes = [];
  for (const f of classeur.feuilles) for (const [type, cle] of [['graphique', 'graphiques'], ['bouton', 'boutons'], ['image', 'images'], ['tcd', 'tcd']]) for (const o of f[cle] || []) objLignes.push([f.nom, type, JSON.stringify(o)]);
  if (objLignes.length) {
    corps += '<table:table table:name="_ObjetsTableur" table:style-name="' + styleFeuille({ cachee: true }) + '"><table:table-column table:number-columns-repeated="3"/>'
      + objLignes.map(([n, t, j]) => { let x = cellTexte(n) + cellTexte(t); for (let k = 0; k < j.length; k += 30000) x += cellTexte(j.slice(k, k + 30000)); return '<table:table-row>' + x + '</table:table-row>'; }).join('') + '</table:table>';
  }
  const macros = String(classeur.macros || '');
  if (macros.trim()) corps += '<table:table table:name="_MacrosTableur" table:style-name="' + styleFeuille({ cachee: true }) + '"><table:table-column/>' + macros.replace(/\r\n?/g, '\n').split('\n').map((l) => '<table:table-row>' + (l ? cellTexte(l) : '<table:table-cell/>') + '</table:table-row>').join('') + '</table:table>';
  // Noms définis
  const noms = [...classeur.noms.values()].map((d) => {
    const of = versOpenFormula('=' + d.ref);
    if (!of) return '';
    const plage = /^of:=\[([^\]]+)\]$/.exec(of);
    return plage ? '<table:named-range table:name="' + ech(d.nom) + '" table:base-cell-address="$' + ech(classeur.feuilles[0].nom) + '.$A$1" table:cell-range-address="' + ech(plage[1].replace(/\.\$?/g, (m) => m)) + '"/>' : '<table:named-expression table:name="' + ech(d.nom) + '" table:base-cell-address="$' + ech(classeur.feuilles[0].nom) + '.$A$1" table:expression="' + ech(of) + '"/>';
  }).join('');
  const policesXml = '<office:font-face-decls>' + [...polices].map((p) => '<style:font-face style:name="' + ech(p) + '" svg:font-family="\'' + ech(p) + '\'"/>').join('') + '</office:font-face-decls>';
  const contenu = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + NS + ' office:version="1.3">' + policesXml + '<office:automatic-styles>' + autos + '</office:automatic-styles><office:body><office:spreadsheet>' + (validationsXml ? '<table:content-validations>' + validationsXml + '</table:content-validations>' : '') + corps + (noms ? '<table:named-expressions>' + noms + '</table:named-expressions>' : '') + '</office:spreadsheet></office:body></office:document-content>';
  const stylesXml = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ' + NS + ' office:version="1.3"><office:font-face-decls><style:font-face style:name="Liberation Sans" svg:font-family="\'Liberation Sans\'" style:font-family-generic="swiss"/></office:font-face-decls>'
    + '<office:styles><style:default-style style:family="table-cell"><style:paragraph-properties style:tab-stop-distance="0.5in"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:language="fr" fo:country="FR"/></style:default-style><style:style style:name="Default" style:family="table-cell"/>' + condXml + '</office:styles>'
    + '<office:automatic-styles>' + pagesXml + '</office:automatic-styles>'
    + '<office:master-styles>' + maitresXml + '</office:master-styles></office:document-styles>';
  const meta = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ' + NS + ' office:version="1.3"><office:meta><meta:generator>Sprezz</meta:generator><meta:creation-date>' + new Date().toISOString().slice(0, 19) + '</meta:creation-date></office:meta></office:document-meta>';
  const manifeste = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/>' + fichiersObjets.map((x) => '<manifest:file-entry manifest:full-path="' + ech(x.chemin) + '"' + (x.dossier ? ' manifest:version="1.3"' : '') + ' manifest:media-type="' + x.type + '"/>').join('') + '</manifest:manifest>';
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, 'mimetype', enc('application/vnd.oasis.opendocument.spreadsheet'));
  XLSX.CFB.utils.cfb_add(zip, 'META-INF/manifest.xml', enc(manifeste));
  XLSX.CFB.utils.cfb_add(zip, 'content.xml', enc(contenu));
  XLSX.CFB.utils.cfb_add(zip, 'styles.xml', enc(stylesXml));
  XLSX.CFB.utils.cfb_add(zip, 'meta.xml', enc(meta));
  XLSX.CFB.utils.cfb_add(zip, 'settings.xml', enc(reglagesOds(classeur)));
  for (const x of fichiersObjets) if (!x.dossier) XLSX.CFB.utils.cfb_add(zip, x.chemin, x.octets || enc(x.texte));
  // Le fichier « mimetype » doit être le premier de l'archive
  const i = zip.FullPaths.findIndex((p) => /\/mimetype$/.test(p));
  if (i > 1) { const [p] = zip.FullPaths.splice(i, 1), [fi] = zip.FileIndex.splice(i, 1); zip.FullPaths.splice(1, 0, p); zip.FileIndex.splice(1, 0, fi); }
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array', compression: true }));
}
// Morceaux de texte riche → lignes (les retours à la ligne séparent les paragraphes)
function decouperRuns(runs) {
  const lignes = [[]];
  for (const x of runs) { const parts = x.t.split('\n'); parts.forEach((p, i) => { if (i) lignes.push([]); if (p) lignes[lignes.length - 1].push({ t: p, s: x.s }); }); }
  return lignes;
}

// ---------------------------------------------------------------------------
// Lecture de la mise en forme d'un .ods (les valeurs et formules viennent de SheetJS)
// ---------------------------------------------------------------------------
const PX = (v) => { const m = /^([\d.]+)(in|cm|mm|pt|px)?$/.exec(v || ''); if (!m) return null; const n = +m[1]; return Math.round(m[2] === 'cm' ? n / 2.54 * 96 : m[2] === 'mm' ? n / 25.4 * 96 : m[2] === 'pt' ? n * 96 / 72 : m[2] === 'px' ? n : n * 96); };
// Styles de données ODF → codes de format (dd/mm/yyyy, #,##0.00 €, 0%…)
function lireFormats(xml) {
  const out = new Map(), maps = [];
  for (const m of xml.matchAll(/<number:(number|percentage|currency|date|time|text)-style\b([^>]*)>([\s\S]*?)<\/number:\1-style>/g)) {
    const nom = attr(m[0], 'style:name'), corps = m[3];
    if (m[1] === 'text') { out.set(nom, '@'); continue; }
    let code = '';
    const duree = /number:truncate-on-overflow="false"/.test(m[2]);
    // Section des positifs rangée dans un autre style (« value()>=0 ») : ce style-ci est celui des négatifs
    const map = /<style:map\b[^>]*style:condition="value\(\)(?:&gt;|>)=?0"[^>]*style:apply-style-name="([^"]+)"/.exec(corps);
    const mapZero = /<style:map\b[^>]*style:condition="value\(\)=0"[^>]*style:apply-style-name="([^"]+)"/.exec(corps);
    const rouge = /<style:text-properties\b[^>]*fo:color="#ff0000"/i.test(corps);
    if (map) maps.push([nom, map[1], rouge, mapZero && mapZero[1]]);
    for (const e of corps.matchAll(/<number:([a-z-]+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/number:\1>)/g)) {
      const [, el, at, txt] = e, long = /number:style="long"/.test(at);
      if (el === 'number' || el === 'scientific-number') {
        const d = +(attr(at, 'number:decimal-places') ?? 2), g = /number:grouping="true"/.test(at);
        const fac = +(attr(at, 'number:display-factor') || 1), virg = fac > 1 ? ','.repeat(Math.round(Math.log10(fac) / 3)) : '';
        code += (g ? '#,##0' : '0') + (d ? '.' + '0'.repeat(d) : '') + virg + (el === 'scientific-number' ? 'E+00' : '');
      } else if (el === 'text') { const t = entites(txt || ''); code += /^[\s/.:,\-%€$]*$/.test(t) ? t : '"' + t + '"'; }
      else if (el === 'currency-symbol') code += entites(txt || '€');
      else if (el === 'day') code += long ? 'dd' : 'd';
      else if (el === 'month') code += /number:textual="true"/.test(at) ? (long ? 'mmmm' : 'mmm') : long ? 'mm' : 'm';
      else if (el === 'year') code += long ? 'yyyy' : 'yy';
      else if (el === 'day-of-week') code += long ? 'dddd' : 'ddd';
      else if (el === 'hours') code += duree && !/h/.test(code) ? (long ? '[hh]' : '[h]') : long ? 'hh' : 'h';
      else if (el === 'minutes') code += duree && !/h/.test(code) && !/\[m/.test(code) ? '[mm]' : 'mm';
      else if (el === 'seconds') code += long ? 'ss' : 's';
      else if (el === 'am-pm') code += 'AM/PM';
    }
    if (code) out.set(nom, code.trim());
  }
  for (const [nom, pos, rouge, zero] of maps) {
    const p = out.get(pos), n = out.get(nom), z = zero && out.get(zero);
    if (p && n) out.set(nom, p + ';' + (rouge ? '[Red]' : '') + n + (z ? ';' + z : ''));
  }
  return out;
}
function lireStylesCellules(xml) {
  const out = new Map();
  const formats = lireFormats(xml);
  // Police et taille par défaut du document : seules les différences sont gardées
  const defaut = /<style:default-style\b[^>]*style:family="table-cell"[^>]*>([\s\S]*?)<\/style:default-style>/.exec(xml);
  const dtx = defaut && /<style:text-properties\b[^>]*>/.exec(defaut[1]);
  const nomDefaut = /<style:style\b[^>]*style:name="Default"[^>]*>([\s\S]*?)<\/style:style>/.exec(xml);
  const ntx = nomDefaut && /<style:text-properties\b[^>]*>/.exec(nomDefaut[1]);
  const tailleDefaut = parseFloat((ntx && attr(ntx[0], 'fo:font-size')) || (dtx && attr(dtx[0], 'fo:font-size')) || '10');
  const policeDefaut = (ntx && attr(ntx[0], 'style:font-name')) || (dtx && attr(dtx[0], 'style:font-name')) || 'Liberation Sans';
  for (const m of xml.matchAll(/<style:style\b([^>]*?)(?:\/>|>([\s\S]*?)<\/style:style>)/g)) {
    if (attr(m[0], 'style:family') !== 'table-cell') continue;
    const corps = m[2] || '', s = {};
    const tc = /<style:table-cell-properties\b[^>]*>/.exec(corps), tx = /<style:text-properties\b[^>]*>/.exec(corps), pp = /<style:paragraph-properties\b[^>]*>/.exec(corps);
    if (tc) {
      const bg = attr(tc[0], 'fo:background-color'); if (bg && bg !== 'transparent') s.fond = bg.toLowerCase();
      const b = {};
      const tout = attr(tc[0], 'fo:border');
      for (const [k, n] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) {
        const v = attr(tc[0], 'fo:border-' + n) || tout;
        if (!v || v === 'none') continue;
        const ep = parseFloat(v), type = /double/.test(v) ? 'double' : /dashed/.test(v) ? 'dashed' : /dotted/.test(v) ? 'dotted' : null;
        b[k] = type || (ep >= 2.2 ? 'thick' : ep >= 1.2 ? 'medium' : 'thin');
        const coul = /#[0-9a-fA-F]{6}/.exec(v); if (coul && coul[0].toLowerCase() !== '#000000') s.bordCouleur = coul[0].toLowerCase();
      }
      if (Object.keys(b).length) s.bordures = b;
      if (attr(tc[0], 'fo:wrap-option') === 'wrap') s.renvoi = true;
      const va = attr(tc[0], 'style:vertical-align'); if (va === 'top') s.valign = 'top'; else if (va === 'middle') s.valign = 'center';
    }
    if (pp) { const al = attr(pp[0], 'fo:text-align'); if (al) { const a = { start: 'left', left: 'left', center: 'center', end: 'right', right: 'right' }[al]; if (a) s.align = a; } }
    if (tx) {
      if (/bold|[6-9]00/.test(attr(tx[0], 'fo:font-weight') || '')) s.gras = true;
      if (attr(tx[0], 'fo:font-style') === 'italic') s.italique = true;
      const u = attr(tx[0], 'style:text-underline-style'); if (u && u !== 'none') s.souligne = true;
      const lt = attr(tx[0], 'style:text-line-through-style'); if (lt && lt !== 'none') s.barre = true;
      const c = attr(tx[0], 'fo:color'); if (c && c.toLowerCase() !== '#000000') s.couleur = c.toLowerCase();
      const sz = parseFloat(attr(tx[0], 'fo:font-size') || ''); if (sz && Math.abs(sz - tailleDefaut) > 0.4) s.taille = Math.round(sz * 4 / 3);
      const p = attr(tx[0], 'style:font-name'); if (p && p !== policeDefaut && !/^(Liberation Sans|Arial)$/i.test(p)) s.police = p;
    }
    const ds = attr(m[0], 'style:data-style-name');
    out.set(attr(m[0], 'style:name'), { s, parent: attr(m[0], 'style:parent-style-name'), z: ds ? formats.get(ds) : undefined });
  }
  return out;
}
/** OpenFormula (of:=SUM([.A1:.A9]; [$Feuil2.B2])) → syntaxe Excel anglaise (=SUM(A1:A9,Feuil2!B2)). */
export function depuisOpenFormula(f, feuilleCourante = null) {
  let x = String(f).replace(/^(of|oooc):/, '');
  // Références entre crochets, hors des chaînes
  x = x.split(/("(?:[^"]|"")*")/).map((m, i) => (i % 2 ? m : m.replace(/\[([^\]]+)\]/g, (t, ref) => {
    const parts = ref.split(':').map((p) => {
      const k = p.lastIndexOf('.');
      if (k < 0) return { f: null, a: p };
      const fe = p.slice(0, k).replace(/^\$/, '');
      return { f: fe ? fe.replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : null, a: p.slice(k + 1) };
    });
    const nf = parts[0].f && feuilleCourante && parts[0].f.toLowerCase() === feuilleCourante.toLowerCase() ? null : parts[0].f;
    const pref = nf ? (/^[A-Za-z_][\w.]*$/.test(nf) ? nf : "'" + nf.replace(/'/g, "''") + "'") + '!' : '';
    return pref + parts.map((p) => p.a).join(':');
  }).replace(/;/g, ','))).join('');
  return x.startsWith('=') ? x : '=' + x;
}
// ---------------------------------------------------------------------------
// Lecture : validation, mise en forme conditionnelle, mise en page, volets figés
// ---------------------------------------------------------------------------
// Arguments au premier niveau (hors chaînes et parenthèses), séparés par « , » ou « ; »
function argumentsOds(t) {
  const out = []; let prof = 0, cur = '', chaine = false;
  for (const ch of t) {
    if (ch === '"') chaine = !chaine;
    if (!chaine) { if (ch === '(' || ch === '[') prof++; if (ch === ')' || ch === ']') prof--; if (prof === 0 && (ch === ',' || ch === ';')) { out.push(cur.trim()); cur = ''; continue; } }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}
// Valeur d'une condition lue : texte entre guillemets, nombre, ou =formule
function valeurLue(x, feuille) {
  const t = String(x || '').trim();
  let m;
  if ((m = /^"((?:[^"]|"")*)"$/.exec(t))) return m[1].replace(/""/g, '"');
  if (/^-?[\d.]+(E[+-]?\d+)?$/i.test(t)) return String(+t).replace('.', ',');
  return convertirFormule(depuisOpenFormula(t, feuille), 'fr');
}
const plageLue = (adr) => String(adr || '').split(/\s+/).filter(Boolean).map((p) => p.split(':').map((x) => x.slice(x.lastIndexOf('.') + 1).replace(/\$/g, '')).join(':')).map((p) => p.replace(/^([A-Z]+\d+):\1$/i, '$1')).join(' ');
function validationLue(cond, feuille) {
  const c = String(cond || '').replace(/^(of|oooc):/, '');
  let m;
  if ((m = /^cell-content-is-in-list\(([\s\S]*)\)$/.exec(c))) {
    const args = argumentsOds(m[1]);
    if (args.length === 1 && !/^"/.test(args[0])) return { type: 'liste', liste: convertirFormule(depuisOpenFormula(args[0], feuille), 'fr') };
    return { type: 'liste', liste: args.map((a) => valeurLue(a, feuille)).join(';') };
  }
  if ((m = /^is-true-formula\(([\s\S]*)\)$/.exec(c))) return { type: 'formule', formule: convertirFormule(depuisOpenFormula(m[1], feuille), 'fr') };
  const r = { type: /whole-number/.test(c) ? 'entier' : /decimal-number/.test(c) ? 'decimal' : /is-date\(/.test(c) ? 'date' : /is-time\(/.test(c) ? 'heure' : /text-length/.test(c) ? 'longueur' : null };
  if (!r.type) return null;
  if ((m = /(not-)?between\(([\s\S]*)\)\s*$/.exec(c))) { const a = argumentsOds(m[2]); r.op = m[1] ? 'hors' : 'entre'; r.v1 = valeurLue(a[0], feuille); r.v2 = valeurLue(a[1], feuille); }
  else if ((m = /(?:cell-content|cell-content-text-length)\(\)\s*(>=|<=|!=|<>|=|<|>)\s*([\s\S]+)$/.exec(c))) { r.op = { '!=': '<>' }[m[1]] || m[1]; r.v1 = valeurLue(m[2], feuille); }
  if ((r.type === 'date' || r.type === 'heure') && r.v1 && /^[\d,]+$/.test(r.v1)) for (const k of ['v1', 'v2']) if (r[k] && /^[\d,]+$/.test(r[k])) r[k] = formater(+r[k].replace(',', '.'), r.type === 'date' ? 'dd/mm/yyyy' : 'hh:mm');
  return r;
}
function mfcLue(xml, feuille, stylesNommes) {
  const regles = [];
  for (const fm of xml.matchAll(/<calcext:conditional-format\b([^>]*)>([\s\S]*?)<\/calcext:conditional-format>/g)) {
    const plage = plageLue(attr(fm[0], 'calcext:target-range-address')), corps = fm[2];
    if (!plage) continue;
    const id = () => 'o' + Math.random().toString(36).slice(2, 8);
    for (const cm of corps.matchAll(/<calcext:condition\b[^>]*\/?>/g)) {
      const v = attr(cm[0], 'calcext:value') || '', style = stylesNommes(attr(cm[0], 'calcext:apply-style-name')) || {};
      const r = { id: id(), plage, style }; let m;
      if ((m = /^(>=|<=|!=|=|<|>)([\s\S]+)$/.exec(v))) Object.assign(r, { type: 'valeur', op: { '!=': '<>' }[m[1]] || m[1], v1: valeurLue(m[2], feuille) });
      else if ((m = /^(not-)?between\(([\s\S]*)\)$/.exec(v))) { const a = argumentsOds(m[2]); Object.assign(r, { type: 'valeur', op: m[1] ? 'hors' : 'entre', v1: valeurLue(a[0], feuille), v2: valeurLue(a[1], feuille) }); }
      else if ((m = /^(contains-text|not-contains-text|begins-with|ends-with)\(([\s\S]*)\)$/.exec(v))) Object.assign(r, { type: 'texte', op: { 'contains-text': 'contient', 'not-contains-text': 'necontientpas', 'begins-with': 'commence', 'ends-with': 'termine' }[m[1]], texte: valeurLue(m[2], feuille) });
      else if ((m = /^formula-is\(([\s\S]*)\)$/.exec(v))) Object.assign(r, { type: 'formule', formule: convertirFormule(depuisOpenFormula(m[1], feuille), 'fr') });
      else if (v === 'duplicate' || v === 'unique') r.type = v === 'duplicate' ? 'doublons' : 'uniques';
      else if ((m = /^(top|bottom)-(elements|percent)\((\d+)\)$/.exec(v))) Object.assign(r, { type: 'top', bas: m[1] === 'bottom', pct: m[2] === 'percent', n: +m[3] });
      else if ((m = /^(above|below)(-equal)?-average$/.exec(v))) Object.assign(r, { type: 'moyenne', dessous: m[1] === 'below' });
      else continue;
      regles.push(r);
    }
    let m;
    if ((m = /<calcext:color-scale>([\s\S]*?)<\/calcext:color-scale>/.exec(corps))) regles.push({ id: id(), plage, type: 'echelle', couleurs: [...m[1].matchAll(/calcext:color="(#[0-9a-f]{6})"/gi)].map((x) => x[1].toLowerCase()) });
    if ((m = /<calcext:data-bar\b[^>]*>/.exec(corps))) regles.push({ id: id(), plage, type: 'barres', couleur: (attr(m[0], 'calcext:positive-color') || '#638ec6').toLowerCase() });
    if ((m = /<calcext:icon-set\b([^>]*)>([\s\S]*?)<\/calcext:icon-set>/.exec(corps))) {
      const val = [...m[2].matchAll(/calcext:value="([^"]*)"/g)].map((x) => +x[1]).slice(1);
      const r = { id: id(), plage, type: 'icones', jeu: attr(m[0], 'calcext:icon-set-type') || '3Arrows' };
      if (val.length && val.every((x) => !isNaN(x))) r.seuils = val;
      if (attr(m[0], 'calcext:show-value') === 'false') r.iconeSeule = true;
      regles.push(r);
    }
  }
  return regles;
}
// Plages occupées par un ensemble de cellules « r,c » : colonnes de cellules contiguës, regroupées si elles ont les mêmes lignes
function plagesDeCellules(cles) {
  const parCol = new Map();
  for (const k of cles) { const [r, c] = k.split(',').map(Number); if (!parCol.has(c)) parCol.set(c, []); parCol.get(c).push(r); }
  const segs = [];
  for (const [c, rs] of [...parCol].sort((a, b) => a[0] - b[0])) {
    rs.sort((a, b) => a - b);
    let d = rs[0], p = rs[0];
    for (const r of [...rs.slice(1), Infinity]) { if (r === p + 1) { p = r; continue; } segs.push({ r1: d, r2: p, c1: c, c2: c }); d = p = r; }
  }
  const out = [];
  for (const sg of segs) { const prec = out.find((o) => o.r1 === sg.r1 && o.r2 === sg.r2 && o.c2 === sg.c1 - 1); if (prec) prec.c2 = sg.c2; else out.push({ ...sg }); }
  return out.map((p) => { const a = colVersLettres(p.c1) + (p.r1 + 1), b = colVersLettres(p.c2) + (p.r2 + 1); return a === b ? a : a + ':' + b; }).join(' ');
}
function miseEnPageLue(props, extra) {
  const m = {}, pouce = (v) => { const n = PX(v); return n ? n / 96 : null; };
  if (attr(props, 'style:print-orientation') === 'landscape') m.orientation = 'paysage';
  const w = pouce(attr(props, 'fo:page-width')), h = pouce(attr(props, 'fo:page-height'));
  if (w && h) { const [a, b] = [Math.min(w, h) * 25.4, Math.max(w, h) * 25.4]; for (const [nom, [pw, ph]] of Object.entries(PAPIERS)) if (Math.abs(pw - a) < 3 && Math.abs(ph - b) < 3) { if (nom !== 'A4') m.papier = nom; break; } }
  const marges = {};
  for (const [k, n] of [['h', 'top'], ['b', 'bottom'], ['g', 'left'], ['d', 'right']]) { const v = pouce(attr(props, 'fo:margin-' + n)); if (v !== null) marges[k] = Math.round(v * 2.54 * 100) / 100; }
  // Marges : gardées seulement si elles diffèrent de celles par défaut (au millimètre près)
  const defaut = mp({}).marges;
  if (Object.entries(marges).some(([k, v]) => Math.abs(v - defaut[k]) > 0.05)) m.marges = marges;
  const x = attr(props, 'style:scale-to-X'), y = attr(props, 'style:scale-to-Y'), pages = attr(props, 'style:scale-to-pages'), ech0 = attr(props, 'style:scale-to');
  if (x !== null || y !== null) m.ajuster = { l: +x || 0, h: +y || 0 };
  else if (pages) m.ajuster = { l: +pages, h: +pages };
  else if (ech0 && parseFloat(ech0) !== 100) m.echelle = parseFloat(ech0);
  const centre = attr(props, 'style:table-centering');
  if (centre === 'horizontal' || centre === 'both') m.centrerH = true;
  if (centre === 'vertical' || centre === 'both') m.centrerV = true;
  const impr = attr(props, 'style:print') || '';
  if (/\bgrid\b/.test(impr)) m.quadrillage = true;
  if (/\bheaders\b/.test(impr)) m.entetes = true;
  if (attr(props, 'style:print-page-order') === 'ltr') m.ordre = 'droite';
  Object.assign(m, extra);
  return Object.keys(m).length ? m : null;
}
/** Map nomFeuille → { cellules: Map 'r,c' → style, largeurs: { c: px }, hauteurs: { r: px } } */
export function lireStylesOds(XLSX, octets) {
  const out = new Map();
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  // Fichiers à la racine de l'archive seulement (« Object 1/content.xml » est celui d'un graphique)
  const lire = (n) => { const i = cfb.FullPaths.findIndex((p) => p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase() === n); return i < 0 ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); };
  const contenu = lire('content.xml');
  if (!contenu) return out;
  const stylesXml = lire('styles.xml') || '';
  const lireBrut = (n) => { const i = cfb.FullPaths.findIndex((p) => p.replace(/^Root Entry\//, '').replace(/^\//, '') === n); return i < 0 ? null : Uint8Array.from(cfb.FileIndex[i].content); };
  // Styles des objets dessinés : graphiques (remplissage, trait), texte (police, couleur), paragraphes (alignement)
  const stylesGraphiques = new Map(), stylesTexteObj = new Map();
  for (const m of (stylesXml + contenu).matchAll(/<style:style\b([^>]*)>([\s\S]*?)<\/style:style>/g)) {
    const nom = attr(m[0], 'style:name'), fam = attr(m[0], 'style:family');
    if (fam === 'graphic') stylesGraphiques.set(nom, (/<style:graphic-properties\b[^>]*>/.exec(m[2]) || [''])[0]);
    else if (fam === 'text' || fam === 'paragraph') {
      const tp = (/<style:text-properties\b[^>]*>/.exec(m[2]) || [''])[0], s0 = {};
      const c = attr(tp, 'fo:color'); if (c) s0.couleur = c.toLowerCase();
      const t = attr(tp, 'fo:font-size'); if (t && /pt$/.test(t)) s0.taille = Math.round(parseFloat(t) / 0.75);
      if (attr(tp, 'fo:font-weight') === 'bold') s0.gras = true;
      if (attr(tp, 'fo:font-style') === 'italic') s0.italique = true;
      if ((attr(tp, 'style:text-underline-style') || 'none') !== 'none') s0.souligne = true;
      const pol = attr(tp, 'style:font-name'); if (pol) s0.police = pol;
      stylesTexteObj.set(nom, s0);
      const pp = /<style:paragraph-properties\b[^>]*>/.exec(m[2]), al = pp && attr(pp[0], 'fo:text-align');
      if (al) stylesTexteObj.set('§' + nom, { start: 'left', left: 'left', center: 'center', end: 'right', right: 'right' }[al] || 'center');
    }
  }
  const visibles = new Map();
  for (const m of contenu.matchAll(/<style:style\b[^>]*style:family="table"[^>]*>([\s\S]*?)<\/style:style>/g)) visibles.set(attr(m[0], 'style:name'), !/table:display="false"/.test(m[1]));
  // Filtres automatiques (plages de base de données avec boutons)
  const filtres = new Map();
  for (const m of contenu.matchAll(/<table:database-range\b[^>]*>/g)) {
    if (attr(m[0], 'table:display-filter-buttons') !== 'true') continue;
    const a = attr(m[0], 'table:target-range-address') || '', k = a.lastIndexOf('.', a.indexOf(':') > 0 ? a.indexOf(':') : a.length);
    const nomF = a.slice(0, a.indexOf('.')).replace(/^\$/, '').replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
    const p = plageLue(a); void k;
    if (nomF && p) filtres.set(nomF, p);
  }
  const st = lireStylesCellules(stylesXml + contenu);
  // Styles nommés (mises en forme conditionnelles) : désignés par leur nom affiché
  const nomsAffiches = new Map();
  for (const m of stylesXml.matchAll(/<style:style\b[^>]*>/g)) { const n = attr(m[0], 'style:name'), d = attr(m[0], 'style:display-name'); if (n) nomsAffiches.set(d || n, n); }
  const stylesNommes = (nom) => { const x = st.get(nomsAffiches.get(nom) || nom); return x ? { ...x.s } : null; };
  // Validations
  const validations = new Map();
  for (const m of contenu.matchAll(/<table:content-validation\b([^>]*)>([\s\S]*?)<\/table:content-validation>|<table:content-validation\b([^>]*)\/>/g)) {
    const tete = m[1] || m[3], corpsV = m[2] || '', nom = attr(' ' + tete, 'table:name');
    const base = attr(' ' + tete, 'table:base-cell-address') || '', feuilleV = base.slice(0, base.lastIndexOf('.')).replace(/^\$/, '').replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
    const r = validationLue(attr(' ' + tete, 'table:condition'), feuilleV);
    if (!r) continue;
    if (attr(' ' + tete, 'table:allow-empty-cell') === 'false') r.vides = false;
    if (attr(' ' + tete, 'table:display-list') === 'none') r.fleche = false;
    const em = /<table:error-message\b([^>]*)>([\s\S]*?)<\/table:error-message>|<table:error-message\b([^>]*)\/>/.exec(corpsV);
    if (em) { const a = ' ' + (em[1] || em[3]); r.erreur = { style: { warning: 'avertissement', information: 'information' }[attr(a, 'table:message-type')] || 'stop' }; const ti = attr(a, 'table:title'); if (ti) r.erreur.titre = ti; const tx = [...(em[2] || '').matchAll(/<text:p>([\s\S]*?)<\/text:p>/g)].map((x) => entites(x[1].replace(/<[^>]+>/g, ''))).join('\n'); if (tx) r.erreur.texte = tx; }
    const hm = /<table:help-message\b([^>]*)>([\s\S]*?)<\/table:help-message>/.exec(corpsV);
    if (hm) { const ti = attr(' ' + hm[1], 'table:title'), tx = [...hm[2].matchAll(/<text:p>([\s\S]*?)<\/text:p>/g)].map((x) => entites(x[1].replace(/<[^>]+>/g, ''))).join('\n'); if (ti || tx) r.message = { titre: ti || '', texte: tx }; }
    validations.set(nom, r);
  }
  // Mise en page : feuille → style de feuille → page maîtresse → mise en page
  const maitres = new Map(), mises = new Map(), feuillesSt = new Map();
  for (const m of stylesXml.matchAll(/<style:page-layout\b([^>]*)>([\s\S]*?)<\/style:page-layout>/g)) { const pp = /<style:page-layout-properties\b[^>]*>/.exec(m[2]); if (pp) mises.set(attr(m[0], 'style:name'), pp[0]); }
  for (const m of stylesXml.matchAll(/<style:master-page\b[^>]*>/g)) maitres.set(attr(m[0], 'style:name'), attr(m[0], 'style:page-layout-name'));
  for (const m of contenu.matchAll(/<style:style\b[^>]*style:family="table"[^>]*>/g)) feuillesSt.set(attr(m[0], 'style:name'), attr(m[0], 'style:master-page-name'));
  // Volets figés (settings.xml)
  const figes = new Map(), reglages = lire('settings.xml') || '';
  const tablesReg = /<config:config-item-map-named config:name="Tables">([\s\S]*?)<\/config:config-item-map-named>/.exec(reglages);
  if (tablesReg) for (const m of tablesReg[1].matchAll(/<config:config-item-map-entry config:name="([^"]*)">([\s\S]*?)<\/config:config-item-map-entry>/g)) {
    const val = (n) => { const x = new RegExp('config:name="' + n + '"[^>]*>([^<]*)<').exec(m[2]); return x ? +x[1] : 0; };
    const r = val('VerticalSplitMode') === 2 ? val('VerticalSplitPosition') : 0, c = val('HorizontalSplitMode') === 2 ? val('HorizontalSplitPosition') : 0;
    if (r || c) figes.set(entites(m[1]), { r, c });
  }
  const colStyles = new Map(), ligStyles = new Map();
  for (const m of contenu.matchAll(/<style:style\b[^>]*style:family="table-(column|row)"[^>]*>([\s\S]*?)<\/style:style>/g)) {
    const nom = attr(m[0], 'style:name');
    if (m[1] === 'column') { const w = PX(attr(m[2], 'style:column-width')); if (w) colStyles.set(nom, w); }
    else { const h = PX(attr(m[2], 'style:row-height')); if (h) ligStyles.set(nom, h); }
  }
  const styleDe = (nom) => { const x = st.get(nom); if (!x) return null; const base = x.parent && x.parent !== 'Default' ? styleDe(x.parent) : null; const o = { ...(base || {}), ...x.s }; if (x.z || (base && base._z)) o._z = x.z || base._z; return o; };
  for (const tm of contenu.matchAll(/<table:table\s([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const nom = attr(tm[0], 'table:name'), corps = tm[2];
    const res = { cellules: new Map(), largeurs: {}, hauteurs: {}, formules: new Map(), validations: [], mfc: mfcLue(corps, nom, stylesNommes), figer: figes.get(nom) || null, miseEnPage: null,
      cachee: visibles.get(attr(tm[0], 'table:style-name')) === false, filtre: filtres.get(nom) || null, graphiques: [], images: [] };
    const cadres = [];
    const DESSINS = /<draw:(frame|custom-shape|line|rect|ellipse|circle)\b[\s\S]*?<\/draw:\1>/g;
    const formesFeuille = /<table:shapes>([\s\S]*?)<\/table:shapes>/.exec(corps);
    if (formesFeuille) for (const d of formesFeuille[1].matchAll(DESSINS)) cadres.push({ xml: d[0] });
    const cellulesVal = new Map();
    // Mise en page, zone d'impression, lignes à répéter
    const extra = {};
    const zone = attr(tm[0], 'table:print-ranges');
    if (zone) extra.zone = plageLue(zone.split(/\s+/)[0]);
    const entete = corps.indexOf('<table:table-header-rows>');
    if (entete >= 0) {
      let n0 = 0;
      for (const rm of corps.slice(0, entete).matchAll(/<table:table-row\b[^>]*?(?:\/>|>[\s\S]*?<\/table:table-row>)/g)) n0 += +(attr(rm[0], 'table:number-rows-repeated') || 1);
      const fin = corps.indexOf('</table:table-header-rows>', entete);
      let n1 = 0;
      for (const rm of corps.slice(entete, fin).matchAll(/<table:table-row\b[^>]*?(?:\/>|>[\s\S]*?<\/table:table-row>)/g)) n1 += +(attr(rm[0], 'table:number-rows-repeated') || 1);
      if (n1) extra.titresLignes = (n0 + 1) + ':' + (n0 + n1);
    }
    const page = mises.get(maitres.get(feuillesSt.get(attr(tm[0], 'table:style-name'))));
    res.miseEnPage = page ? miseEnPageLue(page, extra) : Object.keys(extra).length ? extra : null;
    let c = 0;
    const defautCol = [];
    for (const cm of corps.matchAll(/<table:table-column\b[^>]*>/g)) {
      const n = +(attr(cm[0], 'table:number-columns-repeated') || 1), w = colStyles.get(attr(cm[0], 'table:style-name'));
      const cache = attr(cm[0], 'table:visibility') === 'collapse', def = attr(cm[0], 'table:default-cell-style-name');
      for (let k = 0; k < Math.min(n, 1024); k++) { if (cache) res.largeurs[c + k] = 0; else if (w && Math.abs(w - LARGEUR) > 3) res.largeurs[c + k] = w; defautCol[c + k] = def && def !== 'Default' ? def : null; }
      c += n;
    }
    let r = 0;
    for (const rm of corps.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const n = +(attr(rm[0], 'table:number-rows-repeated') || 1);
      if (r > 1048575) break;
      const h = ligStyles.get(attr(rm[0], 'table:style-name'));
      const cache = attr(rm[0], 'table:visibility') === 'collapse';
      const cellsXml = rm[2] || '';
      if (n <= 1000) for (let k = 0; k < n; k++) { if (cache) res.hauteurs[r + k] = 0; else if (h && Math.abs(h - HAUTEUR) > 3) res.hauteurs[r + k] = h; }
      // Rangées répétées (fréquent dans les fichiers de LibreOffice) : seulement les validations
      if (n > 50 && n <= 100000 && cellsXml.includes('content-validation-name')) {
        let col = 0;
        for (const cm of cellsXml.matchAll(/<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>[\s\S]*?<\/table:\1>)/g)) {
          const rep = +(attr(cm[0], 'table:number-columns-repeated') || 1), nv = attr(cm[0], 'table:content-validation-name');
          if (nv && validations.has(nv) && rep * n <= 200000) { if (!cellulesVal.has(nv)) cellulesVal.set(nv, []); for (let k = 0; k < rep; k++) for (let q = 0; q < n; q++) cellulesVal.get(nv).push((r + q) + ',' + (col + k)); }
          col += rep;
        }
      }
      if (n <= 50 && cellsXml) {
        let col = 0;
        for (const cm of cellsXml.matchAll(/<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>[\s\S]*?<\/table:\1>)/g)) {
          const rep = +(attr(cm[0], 'table:number-columns-repeated') || 1);
          const nomSt = attr(cm[0], 'table:style-name');
          if (cm[1] === 'table-cell' && rep <= 256) for (let k = 0; k < rep; k++) { const sx = styleDe(nomSt || defautCol[col + k]); if (sx && Object.keys(sx).length) for (let q = 0; q < n; q++) res.cellules.set((r + q) + ',' + (col + k), sx); }
          if (cm[0].includes('<draw:')) for (const d of cm[0].matchAll(DESSINS)) cadres.push({ r, c: col, xml: d[0] });
          const nv = attr(cm[0], 'table:content-validation-name');
          if (nv && validations.has(nv) && rep <= 1024) { if (!cellulesVal.has(nv)) cellulesVal.set(nv, []); for (let k = 0; k < rep; k++) for (let q = 0; q < n; q++) cellulesVal.get(nv).push((r + q) + ',' + (col + k)); }
          // Formule avec une autre feuille ou des références absolues : SheetJS ne convertit pas [$Feuille.A1] ni [.$B$4] ; on garde la nôtre
          const fo = attr(cm[0], 'table:formula');
          if (fo && /\[\$?'?[^.\]]+'?\.|\[[^\]]*\$/.test(fo)) for (let q = 0; q < n; q++) res.formules.set(r + q + ',' + col, depuisOpenFormula(fo, nom));
          col += rep;
        }
      }
      r += n;
    }
    if (cadres.length) try { Object.assign(res, lireObjetsOds(cadres, res, nom, lireBrut, stylesGraphiques, stylesTexteObj)); } catch (e) { console.warn('Objets du .ods non lus :', e); }
    for (const [nv, cles] of cellulesVal) res.validations.push({ id: 'v' + Math.random().toString(36).slice(2, 8), plage: plagesDeCellules(cles), ...JSON.parse(JSON.stringify(validations.get(nv))) });
    out.set(nom, res);
  }
  return out;
}
export { colVersLettres };
