// Classeurs OpenDocument (.ods, LibreOffice) : écriture complète (valeurs, formules, formats de nombre, styles,
// largeurs, fusions, lignes et colonnes masquées, notes, liens) et lecture de la mise en forme
// (SheetJS lit déjà les valeurs et les formules d'un .ods, mais pas les styles).

import { ErreurFormule, convertirFormule, tokeniser, colVersLettres, serieVersDate, formater } from './formules.js';

const ech = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom.replace(':', '\\:') + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const enc = (s) => new TextEncoder().encode(s);
const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"';
const POUCE = 96; // px par pouce
const pouces = (px) => (px / POUCE).toFixed(4) + 'in';
const LARGEUR = 84, HAUTEUR = 24;

// ---------------------------------------------------------------------------
// Formules : syntaxe de l'interface → OpenFormula (of:=SOMME… → of:=SUM([.A1:.A9]; 2))
// ---------------------------------------------------------------------------
export function versOpenFormula(f) {
  const en = convertirFormule(f, 'en');
  const src = en.slice(1);
  let toks;
  try { toks = tokeniser(src, 'en'); } catch { return null; }
  let out = '', pos = 0;
  for (const t of toks) {
    out += src.slice(pos, t.pos);
    const brut = src.slice(t.pos, t.fin);
    if (t.t === 'tref') return null; // références de tableau : pas d'équivalent simple
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

// ---------------------------------------------------------------------------
// Formats de nombre → styles de données ODF
// ---------------------------------------------------------------------------
function styleDonnees(nom, z) {
  if (!z || z === 'General') return null;
  const sec = z.split(';')[0].replace(/\[(Red|Rouge|Color\d+|[A-Za-z]+)\]/gi, '');
  const rouge = /;\[(Red|Rouge)\]/i.test(z);
  if (/[dmyjhs]/i.test(sec.replace(/"[^"]*"/g, '')) && !/[0#]/.test(sec)) {
    // Date ou heure : on découpe le code en morceaux
    let x = '', i = 0;
    const s = sec.replace(/\\(.)/g, '"$1"');
    while (i < s.length) {
      const reste = s.slice(i);
      let m;
      if ((m = /^"([^"]*)"/.exec(reste))) { x += '<number:text>' + ech(m[1]) + '</number:text>'; i += m[0].length; continue; }
      if ((m = /^\[h+\]/i.exec(reste))) { x += '<number:hours number:style="long"/>'; i += m[0].length; continue; }
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
  const nombre = '<number:number number:decimal-places="' + dec + '" number:min-decimal-places="' + dec + '" number:min-integer-digits="1"' + groupe + '/>';
  if (/%/.test(sec)) return { type: 'percentage', xml: '<number:percentage-style style:name="' + nom + '">' + nombre + '<number:text>%</number:text></number:percentage-style>' };
  if (/E\+/i.test(sec)) return { type: 'float', xml: '<number:number-style style:name="' + nom + '"><number:scientific-number number:decimal-places="' + dec + '" number:min-integer-digits="1" number:min-exponent-digits="2"/></number:number-style>' };
  const devise = /€|\$|£|CHF/.exec(sec);
  if (devise) {
    const avant = sec.indexOf(devise[0]) < sec.search(/[0#]/);
    const sym = '<number:currency-symbol>' + ech(devise[0]) + '</number:currency-symbol>';
    const corps = (avant ? sym : '') + nombre + (avant ? '' : '<number:text> </number:text>' + sym);
    const neg = rouge ? '<number:currency-style style:name="' + nom + 'N"><style:text-properties fo:color="#ff0000"/><number:text>-</number:text>' + corps + '<style:map style:condition="value()&gt;=0" style:apply-style-name="' + nom + 'P"/></number:currency-style>' : '';
    return { type: 'currency', devise: devise[0] === '€' ? 'EUR' : devise[0] === '$' ? 'USD' : devise[0] === '£' ? 'GBP' : 'CHF', xml: '<number:currency-style style:name="' + nom + (rouge ? 'P' : '') + '">' + corps + '</number:currency-style>' + neg, nomFinal: rouge ? nom + 'N' : nom };
  }
  if (/^[#,0.]+$/.test(sec.trim()) || /0/.test(sec)) {
    if (rouge) return { type: 'float', nomFinal: nom + 'N', xml: '<number:number-style style:name="' + nom + 'P">' + nombre + '</number:number-style><number:number-style style:name="' + nom + 'N"><style:text-properties fo:color="#ff0000"/><number:text>-</number:text>' + nombre + '<style:map style:condition="value()&gt;=0" style:apply-style-name="' + nom + 'P"/></number:number-style>' };
    return { type: 'float', xml: '<number:number-style style:name="' + nom + '">' + nombre + '</number:number-style>' };
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
  autos += '<style:style style:name="ta1" style:family="table" style:master-page-name="Default"><style:table-properties table:display="true" style:writing-mode="lr-tb"/></style:style>';
  autos += '<style:style style:name="ta2" style:family="table" style:master-page-name="Default"><style:table-properties table:display="false" style:writing-mode="lr-tb"/></style:style>';
  let corps = '';
  classeur.feuilles.forEach((f, fi) => {
    const r2 = Math.max(0, f.zone.r2), c2 = Math.max(0, f.zone.c2);
    let t = '<table:table table:name="' + ech(f.nom) + '" table:style-name="' + (f.cachee ? 'ta2' : 'ta1') + '"' + (f.protection && f.protection.active ? ' table:protected="true"' : '') + '>';
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
      t += '<table:table-row table:style-name="' + styleLig(h === undefined || h === 0 ? HAUTEUR : h) + '"' + (h === 0 || (f.filtrees && f.filtrees.has(r)) ? ' table:visibility="' + (f.filtrees && f.filtrees.has(r) ? 'filter' : 'collapse') + '"' : '') + '>';
      let vides = 0;
      const viderVides = () => { if (vides) { t += '<table:table-cell' + (vides > 1 ? ' table:number-columns-repeated="' + vides + '"' : '') + '/>'; vides = 0; } };
      for (let k = 0; k <= c2; k++) {
        if (couvertes.has(r + ',' + k)) { viderVides(); t += '<table:covered-table-cell/>'; continue; }
        const cel = f.get(r, k);
        if (!cel) { vides++; continue; }
        viderVides();
        const st = styleCellule(cel.s, cel.z), d = cel.z ? donnees.get(cel.z) : null;
        const fus = f.fusions.find((m) => m.r1 === r && m.c1 === k);
        let a = (st ? ' table:style-name="' + st + '"' : '') + (fus ? ' table:number-columns-spanned="' + (fus.c2 - fus.c1 + 1) + '" table:number-rows-spanned="' + (fus.r2 - fus.r1 + 1) + '"' : '');
        let v = cel.f != null ? classeur.valeur(fi, r, k) : cel.v;
        if (cel.f != null) { const of = versOpenFormula(cel.f); if (of) a += ' table:formula="' + ech(of) + '"'; }
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
      t += '</table:table-row>';
    }
    corps += t + '</table:table>';
  });
  // Noms définis
  const noms = [...classeur.noms.values()].map((d) => {
    const of = versOpenFormula('=' + d.ref);
    if (!of) return '';
    const plage = /^of:=\[([^\]]+)\]$/.exec(of);
    return plage ? '<table:named-range table:name="' + ech(d.nom) + '" table:base-cell-address="$' + ech(classeur.feuilles[0].nom) + '.$A$1" table:cell-range-address="' + ech(plage[1].replace(/\.\$?/g, (m) => m)) + '"/>' : '<table:named-expression table:name="' + ech(d.nom) + '" table:base-cell-address="$' + ech(classeur.feuilles[0].nom) + '.$A$1" table:expression="' + ech(of) + '"/>';
  }).join('');
  const policesXml = '<office:font-face-decls>' + [...polices].map((p) => '<style:font-face style:name="' + ech(p) + '" svg:font-family="\'' + ech(p) + '\'"/>').join('') + '</office:font-face-decls>';
  const contenu = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ' + NS + ' office:version="1.3">' + policesXml + '<office:automatic-styles>' + autos + '</office:automatic-styles><office:body><office:spreadsheet>' + corps + (noms ? '<table:named-expressions>' + noms + '</table:named-expressions>' : '') + '</office:spreadsheet></office:body></office:document-content>';
  const stylesXml = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ' + NS + ' office:version="1.3"><office:font-face-decls><style:font-face style:name="Liberation Sans" svg:font-family="\'Liberation Sans\'" style:font-family-generic="swiss"/></office:font-face-decls>'
    + '<office:styles><style:default-style style:family="table-cell"><style:paragraph-properties style:tab-stop-distance="0.5in"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:language="fr" fo:country="FR"/></style:default-style><style:style style:name="Default" style:family="table-cell"/></office:styles>'
    + '<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.2681in" fo:page-height="11.6929in" style:print-orientation="portrait" fo:margin-top="0.3937in" fo:margin-bottom="0.3937in" fo:margin-left="0.3937in" fo:margin-right="0.3937in"/></style:page-layout></office:automatic-styles>'
    + '<office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
  const meta = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ' + NS + ' office:version="1.3"><office:meta><meta:generator>Sprezz</meta:generator><meta:creation-date>' + new Date().toISOString().slice(0, 19) + '</meta:creation-date></office:meta></office:document-meta>';
  const manifeste = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, 'mimetype', enc('application/vnd.oasis.opendocument.spreadsheet'));
  XLSX.CFB.utils.cfb_add(zip, 'META-INF/manifest.xml', enc(manifeste));
  XLSX.CFB.utils.cfb_add(zip, 'content.xml', enc(contenu));
  XLSX.CFB.utils.cfb_add(zip, 'styles.xml', enc(stylesXml));
  XLSX.CFB.utils.cfb_add(zip, 'meta.xml', enc(meta));
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
  const out = new Map();
  for (const m of xml.matchAll(/<number:(number|percentage|currency|date|time|text)-style\b([^>]*)>([\s\S]*?)<\/number:\1-style>/g)) {
    const nom = attr(m[0], 'style:name'), corps = m[3];
    if (m[1] === 'text') { out.set(nom, '@'); continue; }
    let code = '';
    for (const e of corps.matchAll(/<number:([a-z-]+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/number:\1>)/g)) {
      const [, el, at, txt] = e, long = /number:style="long"/.test(at);
      if (el === 'number' || el === 'scientific-number') {
        const d = +(attr(at, 'number:decimal-places') ?? 2), g = /number:grouping="true"/.test(at);
        code += (g ? '#,##0' : '0') + (d ? '.' + '0'.repeat(d) : '') + (el === 'scientific-number' ? 'E+00' : '');
      } else if (el === 'text') { const t = entites(txt || ''); code += /^[\s/.:,\-%€$]*$/.test(t) ? t : '"' + t + '"'; }
      else if (el === 'currency-symbol') code += entites(txt || '€');
      else if (el === 'day') code += long ? 'dd' : 'd';
      else if (el === 'month') code += /number:textual="true"/.test(at) ? (long ? 'mmmm' : 'mmm') : long ? 'mm' : 'm';
      else if (el === 'year') code += long ? 'yyyy' : 'yy';
      else if (el === 'day-of-week') code += long ? 'dddd' : 'ddd';
      else if (el === 'hours') code += long ? 'hh' : 'h';
      else if (el === 'minutes') code += 'mm';
      else if (el === 'seconds') code += long ? 'ss' : 's';
      else if (el === 'am-pm') code += 'AM/PM';
    }
    if (code) out.set(nom, code.trim());
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
/** Map nomFeuille → { cellules: Map 'r,c' → style, largeurs: { c: px }, hauteurs: { r: px } } */
export function lireStylesOds(XLSX, octets) {
  const out = new Map();
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const lire = (n) => { const i = cfb.FullPaths.findIndex((p) => p.toLowerCase().endsWith('/' + n)); return i < 0 ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); };
  const contenu = lire('content.xml');
  if (!contenu) return out;
  const st = lireStylesCellules((lire('styles.xml') || '') + contenu);
  const colStyles = new Map(), ligStyles = new Map();
  for (const m of contenu.matchAll(/<style:style\b[^>]*style:family="table-(column|row)"[^>]*>([\s\S]*?)<\/style:style>/g)) {
    const nom = attr(m[0], 'style:name');
    if (m[1] === 'column') { const w = PX(attr(m[2], 'style:column-width')); if (w) colStyles.set(nom, w); }
    else { const h = PX(attr(m[2], 'style:row-height')); if (h) ligStyles.set(nom, h); }
  }
  const styleDe = (nom) => { const x = st.get(nom); if (!x) return null; const base = x.parent && x.parent !== 'Default' ? styleDe(x.parent) : null; const o = { ...(base || {}), ...x.s }; if (x.z || (base && base._z)) o._z = x.z || base._z; return o; };
  for (const tm of contenu.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const nom = attr(tm[0], 'table:name'), corps = tm[2];
    const res = { cellules: new Map(), largeurs: {}, hauteurs: {}, formules: new Map() };
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
      if (n <= 50 && cellsXml) {
        let col = 0;
        for (const cm of cellsXml.matchAll(/<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>[\s\S]*?<\/table:\1>)/g)) {
          const rep = +(attr(cm[0], 'table:number-columns-repeated') || 1);
          const nomSt = attr(cm[0], 'table:style-name');
          if (cm[1] === 'table-cell' && rep <= 256) for (let k = 0; k < rep; k++) { const sx = styleDe(nomSt || defautCol[col + k]); if (sx && Object.keys(sx).length) for (let q = 0; q < n; q++) res.cellules.set((r + q) + ',' + (col + k), sx); }
          // Formule avec une autre feuille : SheetJS ne convertit pas [$Feuille.A1] ; on garde la nôtre
          const fo = attr(cm[0], 'table:formula');
          if (fo && /\[\$?'?[^.\]]+'?\./.test(fo)) for (let q = 0; q < n; q++) res.formules.set(r + q + ',' + col, depuisOpenFormula(fo, nom));
          col += rep;
        }
      }
      r += n;
    }
    out.set(nom, res);
  }
  return out;
}
export { colVersLettres };
