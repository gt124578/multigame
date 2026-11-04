// Réglages de feuille des .xlsx que SheetJS (édition communautaire) ne lit ni n'écrit :
// volets figés (<pane>), filtre automatique (<autoFilter> et ses critères) et mise en forme conditionnelle
// (<conditionalFormatting>, styles <dxfs> de xl/styles.xml). Lus et réécrits directement dans le zip.

import { lireTheme, lireCouleur } from './styles-xlsx.js';
import { convertirFormule, parsePlage, adresse, formater } from './formules.js';
import { plagesMfc } from './donnees.js';

const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const ech = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };

function fichiers(cfb) {
  const map = new Map();
  cfb.FullPaths.forEach((p, i) => map.set(p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase(), i));
  return {
    index: (chemin) => map.get(chemin.replace(/^\//, '').toLowerCase()),
    texte(chemin) { const i = this.index(chemin); return i === undefined ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); },
  };
}

function cheminsFeuilles(z) {
  const wb = z.texte('xl/workbook.xml'), rels = z.texte('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return [];
  const cibles = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) cibles.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    let t = cibles.get(attr(m[0], 'r:id')); if (!t) continue;
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    out.push({ nom: attr(m[0], 'name'), chemin: t });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const OPS = { greaterThan: '>', lessThan: '<', greaterThanOrEqual: '>=', lessThanOrEqual: '<=', equal: '=', notEqual: '<>', between: 'entre', notBetween: 'hors' };
const OPS_INV = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
const OPS_FILTRE = { equal: '=', notEqual: '<>', greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=' };

function lireDxfs(z, theme) {
  const st = z.texte('xl/styles.xml');
  const bloc = st && /<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/.exec(st);
  if (!bloc) return [];
  return [...bloc[1].matchAll(/<dxf>([\s\S]*?)<\/dxf>|<dxf\/>/g)].map((m) => {
    const x = m[1] || '', s = {};
    const font = /<font>([\s\S]*?)<\/font>/.exec(x);
    if (font) {
      if (/<b\b(?![^>]*val="0")/.test(font[1])) s.gras = true;
      if (/<i\b(?![^>]*val="0")/.test(font[1])) s.italique = true;
      const c = /<color[^>]*\/>/.exec(font[1]); if (c) { const k = lireCouleur(c[0], theme); if (k) s.couleur = k; }
    }
    const fill = /<fill>([\s\S]*?)<\/fill>/.exec(x);
    if (fill) { const c = /<bgColor[^>]*\/>/.exec(fill[1]) || /<fgColor[^>]*\/>/.exec(fill[1]); if (c) { const k = lireCouleur(c[0], theme); if (k) s.fond = k; } }
    return s;
  });
}

// Formule d'Excel (anglais, sans « = ») → valeur de règle : nombre, texte ou =formule en français
function valeurRegle(f) {
  if (f == null) return '';
  const t = entites(f).trim();
  if (/^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(t)) return t.replace('.', ',');
  const q = /^"((?:[^"]|"")*)"$/.exec(t);
  if (q) return q[1].replace(/""/g, '"');
  return convertirFormule('=' + t, 'fr');
}

const TYPES_DV = { list: 'liste', whole: 'entier', decimal: 'decimal', date: 'date', time: 'heure', textLength: 'longueur', custom: 'formule' };
const TYPES_DV_INV = Object.fromEntries(Object.entries(TYPES_DV).map(([k, v]) => [v, k]));
function lireValidation(tete, f1, f2, sqref) {
  const type = TYPES_DV[attr(tete, 'type') || 'none'];
  if (!type || !sqref) return null;
  const v = { id: 'dv' + Math.random().toString(36).slice(2, 9), plage: String(sqref).trim(), type };
  const borne = (f) => {
    if (f == null) return '';
    const t = entites(f).trim();
    if (/^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(t)) return type === 'date' ? formater(+t, 'dd/mm/yyyy') : type === 'heure' ? formater(+t, 'hh:mm') : t.replace('.', ',');
    return convertirFormule('=' + t, 'fr');
  };
  if (type === 'liste') {
    const t = entites(f1 || '').trim();
    const q = /^"((?:[^"]|"")*)"$/.exec(t);
    v.liste = q ? q[1].replace(/""/g, '"').split(',').map((x) => x.trim()).join(';') : convertirFormule('=' + t, 'fr');
  } else if (type === 'formule') v.v1 = convertirFormule('=' + entites(f1 || 'TRUE'), 'fr');
  else { v.op = OPS[attr(tete, 'operator') || 'between'] || 'entre'; v.v1 = borne(f1); if (v.op === 'entre' || v.op === 'hors') v.v2 = borne(f2); }
  if (attr(tete, 'allowBlank') !== '1' && attr(tete, 'allowBlank') !== 'true') v.vides = false;
  if (attr(tete, 'showDropDown') === '1') v.fleche = false; // attribut inversé dans le format d'Excel
  const titreM = attr(tete, 'promptTitle'), texteM = attr(tete, 'prompt');
  if ((titreM || texteM) && attr(tete, 'showInputMessage') !== '0') v.message = { titre: titreM || '', texte: texteM || '' };
  const style = { warning: 'avertissement', information: 'information' }[attr(tete, 'errorStyle')] || 'stop';
  if (attr(tete, 'showErrorMessage') === '0' || attr(tete, 'showErrorMessage') === null) v.erreur = { style: 'aucune' };
  else v.erreur = { style, titre: attr(tete, 'errorTitle') || '', texte: attr(tete, 'error') || '' };
  return v;
}

/** Map nomFeuille → { figer, filtre, mfc, validations }. */
export function lireVuesXlsx(XLSX, octets) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const z = fichiers(cfb);
  const theme = lireTheme(cfb);
  const dxfs = lireDxfs(z, theme);
  const out = new Map();
  for (const { nom, chemin } of cheminsFeuilles(z)) {
    const xml = z.texte(chemin);
    if (!xml) continue;
    const res = {};
    const tab = /<sheetPr\b[^>]*>[\s\S]*?<tabColor\b[^>]*>/.exec(xml);
    if (tab) { const c = lireCouleur(/<tabColor\b[^>]*>/.exec(tab[0])[0], theme); if (c) res.couleur = c; }
    const vue = /<sheetView\b[^>]*>/.exec(xml);
    if (vue && attr(vue[0], 'zoomScale') && +attr(vue[0], 'zoomScale') !== 100) res.zoom = Math.min(4, Math.max(0.1, +attr(vue[0], 'zoomScale') / 100));
    // Volets figés
    const pane = /<pane\b[^>]*>/.exec(xml);
    if (pane && /state="frozen(Split)?"/.test(pane[0])) {
      const r = Math.round(+(attr(pane[0], 'ySplit') || 0)), c = Math.round(+(attr(pane[0], 'xSplit') || 0));
      if (r || c) res.figer = { r, c };
    }
    // Filtre automatique
    const af = /<autoFilter\b([^>]*?)(?:\/>|>([\s\S]*?)<\/autoFilter>)/.exec(xml);
    if (af) {
      const p = parsePlage(attr(af[0], 'ref') || '');
      if (p) {
        const filtre = { r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2, criteres: {} };
        for (const fc of (af[2] || '').matchAll(/<filterColumn\b([^>]*)>([\s\S]*?)<\/filterColumn>/g)) {
          const c = p.c1 + +(attr(fc[0], 'colId') || 0);
          const filters = /<filters\b([^>]*)>([\s\S]*?)<\/filters>|<filters\b([^>]*)\/>/.exec(fc[2]);
          if (filters) {
            const visibles = [...(filters[2] || '').matchAll(/<filter\b[^>]*>/g)].map((m) => attr(m[0], 'val') ?? '');
            if (/blank="(1|true)"/.test(filters[0])) visibles.push('');
            filtre.criteres[c] = { visibles };
          }
          const cf = /<customFilter\b[^>]*>/.exec(fc[2]);
          if (cf) {
            let op = OPS_FILTRE[attr(cf[0], 'operator') || 'equal'] || '=', v = attr(cf[0], 'val') || '';
            if (/^\*.*\*$/.test(v) && v.length > 1) { op = op === '<>' ? 'necontientpas' : 'contient'; v = v.slice(1, -1); }
            else if (/\*$/.test(v)) { op = 'commence'; v = v.slice(0, -1); } else if (/^\*/.test(v)) { op = 'termine'; v = v.slice(1); }
            filtre.criteres[c] = { ...(filtre.criteres[c] || {}), condition: { op, valeur: v } };
          }
        }
        res.filtre = filtre;
      }
    }
    // Mise en forme conditionnelle
    const regles = [];
    for (const cf of xml.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g)) {
      const sqref = attr(cf[0], 'sqref') || '';
      for (const rm of cf[2].matchAll(/<cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cfRule>)/g)) {
        const tete = rm[0].slice(0, rm[0].indexOf('>') + 1), corps = rm[2] || '';
        const type = attr(tete, 'type'), prio = +(attr(tete, 'priority') || 999);
        const formules = [...corps.matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map((m) => m[1]);
        const dxf = attr(tete, 'dxfId'); const style = dxf != null && dxfs[+dxf] ? { ...dxfs[+dxf] } : {};
        const r = { id: 'mfc' + regles.length + '_' + Math.random().toString(36).slice(2, 7), plage: sqref, style, prio };
        if (attr(tete, 'stopIfTrue') === '1') r.arreter = true;
        if (type === 'cellIs') Object.assign(r, { type: 'valeur', op: OPS[attr(tete, 'operator')] || '=', v1: valeurRegle(formules[0]), v2: valeurRegle(formules[1]) });
        else if (type === 'containsText' || type === 'notContainsText' || type === 'beginsWith' || type === 'endsWith') Object.assign(r, { type: 'texte', op: { containsText: 'contient', notContainsText: 'necontientpas', beginsWith: 'commence', endsWith: 'termine' }[type], texte: attr(tete, 'text') || '' });
        else if (type === 'expression') Object.assign(r, { type: 'formule', formule: convertirFormule('=' + entites(formules[0] || 'FALSE'), 'fr') });
        else if (type === 'duplicateValues') r.type = 'doublons';
        else if (type === 'uniqueValues') r.type = 'uniques';
        else if (type === 'top10') Object.assign(r, { type: 'top', n: +(attr(tete, 'rank') || 10), bas: attr(tete, 'bottom') === '1', pct: attr(tete, 'percent') === '1' });
        else if (type === 'aboveAverage') Object.assign(r, { type: 'moyenne', dessous: attr(tete, 'aboveAverage') === '0' });
        else if (type === 'containsBlanks') r.type = 'vides';
        else if (type === 'notContainsBlanks') r.type = 'nonvides';
        else if (type === 'colorScale') { r.type = 'echelle'; r.couleurs = [...corps.matchAll(/<color[^>]*\/>/g)].map((m) => lireCouleur(m[0], theme)).filter(Boolean); delete r.style; }
        else if (type === 'iconSet') {
          const is = /<iconSet\b[^>]*>/.exec(corps);
          r.type = 'icones'; r.jeu = (is && attr(is[0], 'iconSet')) || '3TrafficLights1'; delete r.style;
          if (is && attr(is[0], 'reverse') === '1') r.inverse = true;
          if (is && attr(is[0], 'showValue') === '0') r.iconeSeule = true;
          const cfvos = [...corps.matchAll(/<cfvo\b[^>]*>/g)].slice(1).map((m) => (attr(m[0], 'type') === 'percent' ? +attr(m[0], 'val') : NaN));
          if (cfvos.length && cfvos.every((x) => !isNaN(x))) r.seuils = cfvos;
        }
        else if (type === 'dataBar') { r.type = 'barres'; const c = /<color[^>]*\/>/.exec(corps); r.couleur = c ? lireCouleur(c[0], theme) : '#638ec6'; delete r.style; }
        else continue;
        regles.push(r);
      }
    }
    if (regles.length) { regles.sort((a, b) => a.prio - b.prio); for (const r of regles) delete r.prio; res.mfc = regles; }
    // Validation des données (et sa variante Excel 2010, dans extLst, pour les listes prises sur une autre feuille)
    const validations = [];
    for (const dv of xml.matchAll(/<(x14:)?dataValidation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x14:)?dataValidation>)/g)) {
      const tete = dv[0].slice(0, dv[0].indexOf('>') + 1), corps = dv[3] || '';
      const f1 = /<(?:x14:)?formula1>(?:<xm:f>)?([\s\S]*?)(?:<\/xm:f>)?<\/(?:x14:)?formula1>/.exec(corps), f2 = /<(?:x14:)?formula2>(?:<xm:f>)?([\s\S]*?)(?:<\/xm:f>)?<\/(?:x14:)?formula2>/.exec(corps);
      const sqref = dv[1] ? (/<xm:sqref>([\s\S]*?)<\/xm:sqref>/.exec(corps) || [])[1] : attr(tete, 'sqref');
      const v = lireValidation(tete, f1 && f1[1], f2 && f2[1], sqref);
      if (v) validations.push(v);
    }
    if (validations.length) res.validations = validations;
    if (Object.keys(res).length) out.set(nom, res);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function premiereCellule(regle) { const p = plagesMfc(regle)[0]; return p ? adresse(p.r1, p.c1) : 'A1'; }
const enAnglais = (f) => convertirFormule(f.startsWith('=') ? f : '=' + f, 'en').slice(1);
function valeurXml(v) {
  const s = String(v ?? '').trim();
  if (s.startsWith('=')) return ech(enAnglais(s));
  if (s !== '' && !isNaN(+s.replace(',', '.'))) return String(+s.replace(',', '.'));
  return ech('"' + s.replace(/"/g, '""') + '"');
}
const hexArgb = (h) => 'FF' + String(h || '#000000').slice(1).toUpperCase();

function regleXml(r, prio, dxfId) {
  const a1 = premiereCellule(r), d = dxfId != null ? ' dxfId="' + dxfId + '"' : '', stop = r.arreter ? ' stopIfTrue="1"' : '';
  const t = ech(r.texte || ''), lit = ech('"' + String(r.texte || '').replace(/"/g, '""') + '"');
  switch (r.type) {
    case 'valeur': {
      const op = OPS_INV[r.op] || 'equal';
      return '<cfRule type="cellIs"' + d + ' priority="' + prio + '"' + stop + ' operator="' + op + '"><formula>' + valeurXml(r.v1) + '</formula>' + (op === 'between' || op === 'notBetween' ? '<formula>' + valeurXml(r.v2) + '</formula>' : '') + '</cfRule>';
    }
    case 'texte': {
      const type = { contient: 'containsText', necontientpas: 'notContainsText', commence: 'beginsWith', termine: 'endsWith' }[r.op || 'contient'];
      const op = { contient: 'containsText', necontientpas: 'notContains', commence: 'beginsWith', termine: 'endsWith' }[r.op || 'contient'];
      const f = { contient: 'NOT(ISERROR(SEARCH(' + lit + ',' + a1 + ')))', necontientpas: 'ISERROR(SEARCH(' + lit + ',' + a1 + '))', commence: 'LEFT(' + a1 + ',LEN(' + lit + '))=' + lit, termine: 'RIGHT(' + a1 + ',LEN(' + lit + '))=' + lit }[r.op || 'contient'];
      return '<cfRule type="' + type + '"' + d + ' priority="' + prio + '"' + stop + ' operator="' + op + '" text="' + t + '"><formula>' + f + '</formula></cfRule>';
    }
    case 'formule': return '<cfRule type="expression"' + d + ' priority="' + prio + '"' + stop + '><formula>' + ech(enAnglais(String(r.formule || 'FAUX'))) + '</formula></cfRule>';
    case 'doublons': return '<cfRule type="duplicateValues"' + d + ' priority="' + prio + '"' + stop + '/>';
    case 'uniques': return '<cfRule type="uniqueValues"' + d + ' priority="' + prio + '"' + stop + '/>';
    case 'top': return '<cfRule type="top10"' + d + ' priority="' + prio + '"' + stop + ' rank="' + (+r.n || 10) + '"' + (r.bas ? ' bottom="1"' : '') + (r.pct ? ' percent="1"' : '') + '/>';
    case 'moyenne': return '<cfRule type="aboveAverage"' + d + ' priority="' + prio + '"' + stop + (r.dessous ? ' aboveAverage="0"' : '') + '/>';
    case 'vides': return '<cfRule type="containsBlanks"' + d + ' priority="' + prio + '"' + stop + '><formula>LEN(TRIM(' + a1 + '))=0</formula></cfRule>';
    case 'nonvides': return '<cfRule type="notContainsBlanks"' + d + ' priority="' + prio + '"' + stop + '><formula>LEN(TRIM(' + a1 + '))&gt;0</formula></cfRule>';
    case 'echelle': {
      const c = r.couleurs && r.couleurs.length >= 2 ? r.couleurs : ['#f8696b', '#ffeb84', '#63be7b'];
      const cfvo = c.length > 2 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
      return '<cfRule type="colorScale" priority="' + prio + '"><colorScale>' + cfvo + c.map((x) => '<color rgb="' + hexArgb(x) + '"/>').join('') + '</colorScale></cfRule>';
    }
    case 'icones': {
      const jeu = r.jeu || '3Arrows', n = +jeu[0] || 3;
      const seuils = r.seuils && r.seuils.length === n - 1 ? r.seuils : Array.from({ length: n - 1 }, (_, k) => Math.round((100 * (k + 1)) / n));
      return '<cfRule type="iconSet" priority="' + prio + '"><iconSet iconSet="' + jeu + '"' + (r.inverse ? ' reverse="1"' : '') + (r.iconeSeule ? ' showValue="0"' : '') + '><cfvo type="percent" val="0"/>' + seuils.map((x) => '<cfvo type="percent" val="' + x + '"/>').join('') + '</iconSet></cfRule>';
    }
    case 'barres': return '<cfRule type="dataBar" priority="' + prio + '"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="' + hexArgb(r.couleur || '#638ec6') + '"/></dataBar></cfRule>';
  }
  return '';
}

function validationXml(v) {
  const type = TYPES_DV_INV[v.type];
  const sq = plagesMfc(v).map((p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2))).join(' ');
  if (!type || !sq) return '';
  const borne = (x) => {
    const s = String(x ?? '').trim();
    if (s.startsWith('=')) return ech(enAnglais(s));
    let m;
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) { let an = +m[3]; if (an < 100) an += an < 30 ? 2000 : 1900; return String((Date.UTC(an, +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000); }
    if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) return String((+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400);
    return String(+s.replace(/[\s\u202f]/g, '').replace(',', '.') || 0);
  };
  let f1 = '', f2 = '', op = '';
  if (v.type === 'liste') { const l = String(v.liste || '').trim(); f1 = l.startsWith('=') ? ech(enAnglais(l)) : ech('"' + l.split(/[;\n]/).map((x) => x.trim()).filter(Boolean).join(',').replace(/"/g, '""') + '"'); }
  else if (v.type === 'formule') f1 = ech(enAnglais(String(v.v1 || 'TRUE')));
  else { const o = OPS_INV[v.op || 'entre'] || 'between'; if (o !== 'between') op = ' operator="' + o + '"'; f1 = borne(v.v1); if (o === 'between' || o === 'notBetween') f2 = borne(v.v2); }
  const e = v.erreur || { style: 'stop' };
  return '<dataValidation type="' + type + '"' + (e.style === 'avertissement' ? ' errorStyle="warning"' : e.style === 'information' ? ' errorStyle="information"' : '') + op
    + (v.vides === false ? '' : ' allowBlank="1"') + (v.fleche === false && v.type === 'liste' ? ' showDropDown="1"' : '')
    + (v.message ? ' showInputMessage="1"' : '') + (e.style !== 'aucune' ? ' showErrorMessage="1"' : '')
    + (e.titre ? ' errorTitle="' + ech(e.titre) + '"' : '') + (e.texte ? ' error="' + ech(e.texte) + '"' : '')
    + (v.message && v.message.titre ? ' promptTitle="' + ech(v.message.titre) + '"' : '') + (v.message && v.message.texte ? ' prompt="' + ech(v.message.texte) + '"' : '')
    + ' sqref="' + sq + '"><formula1>' + f1 + '</formula1>' + (f2 ? '<formula2>' + f2 + '</formula2>' : '') + '</dataValidation>';
}

function dxfXml(s) {
  if (!s) return '<dxf/>';
  let font = '';
  if (s.gras) font += '<b/>'; if (s.italique) font += '<i/>'; if (s.couleur) font += '<color rgb="' + hexArgb(s.couleur) + '"/>';
  return '<dxf>' + (font ? '<font>' + font + '</font>' : '') + (s.fond ? '<fill><patternFill><bgColor rgb="' + hexArgb(s.fond) + '"/></patternFill></fill>' : '') + '</dxf>';
}

// Insère un élément avant le premier des éléments qui doivent le suivre dans <worksheet> (l'ordre compte pour Excel)
function inserer(xml, element, suivants) {
  let pos = -1;
  for (const s of suivants) { const i = xml.search(new RegExp('<' + s + '[\\s/>]')); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if (pos < 0) pos = xml.lastIndexOf('</worksheet>');
  return xml.slice(0, pos) + element + xml.slice(pos);
}
const APRES_CF = ['dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
const OPS_FILTRE_INV = Object.fromEntries(Object.entries(OPS_FILTRE).map(([k, v]) => [v, k]));

/**
 * Réécrit le .xlsx produit par SheetJS : volets figés, critères du filtre automatique et mise en forme conditionnelle.
 * Le filtre lui-même (<autoFilter ref>) est écrit par SheetJS (ws['!autofilter']), qui ajoute le nom _FilterDatabase.
 */
export function ecrireVuesXlsx(XLSX, octets, feuilles) {
  if (!feuilles.some((f) => f.zoom || (f.figer && (f.figer.r || f.figer.c)) || (f.mfc && f.mfc.length) || (f.validations && f.validations.length) || f.couleur || (f.filtre && Object.keys(f.filtre.criteres || {}).length))) return octets;
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const z = fichiers(cfb);
  const chemins = cheminsFeuilles(z);
  const styles = z.texte('xl/styles.xml');
  const dxfs = [];
  feuilles.forEach((f) => {
    const ch = chemins.find((x) => x.nom === f.nom);
    const idx = ch && z.index(ch.chemin);
    if (idx === undefined) return;
    let xml = dec(Uint8Array.from(cfb.FileIndex[idx].content));
    if (f.couleur) {
      const tc = '<tabColor rgb="FF' + f.couleur.slice(1).toUpperCase() + '"/>';
      if (/<sheetPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1>' + tc + '</sheetPr>');
      else if (/<sheetPr\b[^>]*>/.test(xml)) xml = xml.replace(/(<sheetPr\b[^>]*>)/, '$1' + tc);
      else xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr>' + tc + '</sheetPr>');
    }
    if (f.zoom && f.zoom !== 1) { const z = Math.round(f.zoom * 100); xml = xml.replace(/<sheetView\b/, '<sheetView zoomScale="' + z + '" zoomScaleNormal="' + z + '"'); }
    const g = f.figer;
    if (g && (g.r || g.c)) {
      const pane = g.r && g.c ? 'bottomRight' : g.r ? 'bottomLeft' : 'topRight';
      const el = '<pane' + (g.c ? ' xSplit="' + g.c + '"' : '') + (g.r ? ' ySplit="' + g.r + '"' : '') + ' topLeftCell="' + adresse(g.r, g.c) + '" activePane="' + pane + '" state="frozen"/><selection pane="' + pane + '"/>';
      xml = xml.replace(/<sheetView\b([^>]*?)\/>/, '<sheetView$1>' + el + '</sheetView>');
      if (!xml.includes('<pane')) xml = xml.replace(/(<sheetView\b[^>]*>)/, '$1' + el);
    }
    const flt = f.filtre;
    if (flt && Object.keys(flt.criteres || {}).length) {
      let cols = '';
      for (const [k, crit] of Object.entries(flt.criteres)) {
        if (!crit) continue;
        const colId = +k - flt.c1;
        if (crit.visibles) cols += '<filterColumn colId="' + colId + '"><filters' + (crit.visibles.includes('') ? ' blank="1"' : '') + '>' + crit.visibles.filter((v) => v !== '').map((v) => '<filter val="' + ech(v) + '"/>').join('') + '</filters></filterColumn>';
        else if (crit.condition) {
          const { op, valeur } = crit.condition;
          const v = { contient: '*' + valeur + '*', necontientpas: '*' + valeur + '*', commence: valeur + '*', termine: '*' + valeur }[op] ?? valeur;
          cols += '<filterColumn colId="' + colId + '"><customFilters><customFilter' + (op === 'necontientpas' ? ' operator="notEqual"' : OPS_FILTRE_INV[op] && op !== '=' ? ' operator="' + OPS_FILTRE_INV[op] + '"' : '') + ' val="' + ech(String(v).replace(',', '.')) + '"/></customFilters></filterColumn>';
        }
      }
      if (cols) xml = xml.replace(/<autoFilter\b([^>]*?)\/>/, '<autoFilter$1>' + cols + '</autoFilter>');
    }
    if (f.mfc && f.mfc.length) {
      let cf = '';
      f.mfc.forEach((r, i) => {
        let dxfId = null;
        if (!['echelle', 'barres', 'icones'].includes(r.type)) { dxfId = dxfs.length; dxfs.push(dxfXml(r.style)); }
        const sq = plagesMfc(r).map((p) => adresse(p.r1, p.c1) + (p.r1 === p.r2 && p.c1 === p.c2 ? '' : ':' + adresse(p.r2, p.c2))).join(' ');
        const corps = regleXml(r, i + 1, dxfId);
        if (sq && corps) cf += '<conditionalFormatting sqref="' + sq + '">' + corps + '</conditionalFormatting>';
      });
      if (cf) xml = inserer(xml, cf, APRES_CF);
    }
    if (f.validations && f.validations.length) {
      const dvs = f.validations.map(validationXml).filter(Boolean);
      if (dvs.length) xml = inserer(xml, '<dataValidations count="' + dvs.length + '">' + dvs.join('') + '</dataValidations>', APRES_CF.filter((x) => x !== 'dataValidations'));
    }
    cfb.FileIndex[idx].content = enc(xml);
  });
  if (dxfs.length && styles) {
    const iS = z.index('xl/styles.xml');
    let st = styles;
    const bloc = '<dxfs count="' + dxfs.length + '">' + dxfs.join('') + '</dxfs>';
    if (/<dxfs\b[^>]*\/>/.test(st)) st = st.replace(/<dxfs\b[^>]*\/>/, bloc);
    else if (/<dxfs\b[^>]*>[\s\S]*?<\/dxfs>/.test(st)) st = st.replace(/<dxfs\b[^>]*>[\s\S]*?<\/dxfs>/, bloc);
    else st = st.replace(/(<\/cellStyles>|<cellStyles\b[^>]*\/>)/, '$1' + bloc);
    cfb.FileIndex[iS].content = enc(st);
  }
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}

