// Tableaux structurés dans les .xlsx (xl/tables/tableN.xml) : SheetJS ne les lit ni ne les écrit.

import { convertirFormule, parsePlage, adresse } from './formules.js';

const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const ech = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const REL_TABLE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function zip(XLSX, octets) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const norm = (p) => p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase();
  const index = (chemin) => cfb.FullPaths.findIndex((p) => norm(p) === chemin.toLowerCase());
  return {
    cfb, index,
    lire(chemin) { const i = index(chemin); return i < 0 ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); },
    ecrire(chemin, texte) { const i = index(chemin); if (i >= 0) cfb.FileIndex[i].content = enc(texte); else XLSX.CFB.utils.cfb_add(cfb, '/' + chemin, enc(texte)); },
  };
}
// Chemin relatif d'une relation → chemin dans le zip
function resoudre(base, cible) {
  if (cible.startsWith('/')) return cible.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const p of cible.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
}

/** Lit les tableaux et les tables de données : Map nomFeuille → { tableaux: [...], tablesDonnees: [...] }. */
export function lireTableauxXlsx(XLSX, octets) {
  const out = new Map();
  const z = zip(XLSX, octets);
  const wb = z.lire('xl/workbook.xml'), rels = z.lire('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return out;
  const cibles = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) cibles.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const t = cibles.get(attr(m[0], 'r:id')); if (!t) continue;
    const chemin = resoudre('xl/workbook.xml', t);
    const nomF = attr(m[0], 'name'), res = { tableaux: [], tablesDonnees: [] };
    // Tables de données : <f t="dataTable" ref="B4:C8" dt2D="1" dtr="1" r1="B1" r2="B2"/>
    const feuilleXml = z.lire(chemin) || '';
    for (const d of feuilleXml.matchAll(/<f\b[^>]*\bt="dataTable"[^>]*>/g)) {
      const ref = parsePlage(String(attr(d[0], 'ref') || '').replace(/\$/g, '')), c1 = attr(d[0], 'r1'), c2 = attr(d[0], 'r2');
      if (!ref || !c1) continue;
      const a1 = parsePlage(c1.replace(/\$/g, '')), a2 = c2 ? parsePlage(c2.replace(/\$/g, '')) : null;
      const cel = (p) => (p ? { r: p.r1, c: p.c1 } : null);
      const deuxD = attr(d[0], 'dt2D') === '1', ligne = attr(d[0], 'dtr') === '1';
      res.tablesDonnees.push({ plage: { r1: ref.r1 - 1, c1: ref.c1 - 1, r2: ref.r2, c2: ref.c2 }, ligne: deuxD ? cel(a1) : ligne ? cel(a1) : null, colonne: deuxD ? cel(a2) : ligne ? null : cel(a1) });
    }
    if (res.tablesDonnees.length) out.set(nomF, res);
    const relsF = z.lire(chemin.replace(/([^/]+)$/, '_rels/$1.rels'));
    if (!relsF) continue;
    const liste = res.tableaux;
    for (const r of relsF.matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(r[0], 'Type') !== REL_TABLE) continue;
      const xml = z.lire(resoudre(chemin, attr(r[0], 'Target')));
      const tb = xml && lireTable(xml);
      if (tb) liste.push(tb);
    }
    if (liste.length) out.set(nomF, res);
  }
  return out;
}

function lireTable(xml) {
  const tete = /<table\b[^>]*>/.exec(xml);
  if (!tete) return null;
  const p = parsePlage(String(attr(tete[0], 'ref') || '').replace(/\$/g, ''));
  if (!p) return null;
  const st = /<tableStyleInfo\b[^>]*>/.exec(xml);
  const t = {
    nom: attr(tete[0], 'displayName') || attr(tete[0], 'name') || 'Tableau1', r1: p.r1, c1: p.c1, r2: p.r2, c2: p.c2,
    entete: attr(tete[0], 'headerRowCount') !== '0', totaux: +(attr(tete[0], 'totalsRowCount') || 0) > 0,
    style: st ? attr(st[0], 'name') || 'TableStyleMedium2' : 'TableStyleMedium2', bandes: st ? attr(st[0], 'showRowStripes') !== '0' : true, calculees: {}, colonnes: [],
  };
  if (st && attr(st[0], 'showFirstColumn') === '1') t.premiereColonne = true;
  if (st && attr(st[0], 'showLastColumn') === '1') t.derniereColonne = true;
  let k = 0;
  for (const m of xml.matchAll(/<tableColumn\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tableColumn>)/g)) {
    t.colonnes.push(attr(m[0], 'name') || 'Colonne' + (k + 1));
    const f = m[2] && /<calculatedColumnFormula[^>]*>([\s\S]*?)<\/calculatedColumnFormula>/.exec(m[2]);
    if (f) t.calculees[k] = convertirFormule('=' + entites(f[1]), 'fr');
    k++;
  }
  return t;
}

/** Écrit les tableaux des feuilles (formules en anglais dans les colonnes calculées et la ligne de total). */
export function ecrireTableauxXlsx(XLSX, octets, classeur) {
  if (!classeur.feuilles.some((f) => (f.tableaux && f.tableaux.length) || (f.tablesDonnees && f.tablesDonnees.length))) return octets;
  const z = zip(XLSX, octets);
  let types = z.lire('[Content_Types].xml');
  if (!types) return octets;
  let n = 0;
  while (z.index('xl/tables/table' + (n + 1) + '.xml') >= 0) n++;
  classeur.feuilles.forEach((f, k) => {
    const cheminFeuille = 'xl/worksheets/sheet' + (k + 1) + '.xml';
    // Tables de données : la formule TABLE() d'Excel, posée sur la première cellule des résultats
    if (f.tablesDonnees && f.tablesDonnees.length) {
      let xml = z.lire(cheminFeuille);
      if (xml) {
        for (const td of f.tablesDonnees) {
          const p = td.plage, a = adresse(p.r1 + 1, p.c1 + 1);
          const deuxD = !!(td.ligne && td.colonne);
          const f2 = '<f t="dataTable" ref="' + a + ':' + adresse(p.r2, p.c2) + '" dt2D="' + (deuxD ? 1 : 0) + '" dtr="' + (deuxD || td.ligne ? 1 : 0) + '" r1="' + (deuxD || td.ligne ? adresse(td.ligne.r, td.ligne.c) : adresse(td.colonne.r, td.colonne.c)) + '"' + (deuxD ? ' r2="' + adresse(td.colonne.r, td.colonne.c) + '"' : '') + '/>';
          const re = new RegExp('<c r="' + a + '"([^>]*?)(/>|>)');
          xml = re.test(xml) ? xml.replace(re, (t, at, fin) => '<c r="' + a + '"' + at + '>' + f2 + (fin === '/>' ? '</c>' : '')) : xml;
        }
        z.ecrire(cheminFeuille, xml);
      }
    }
    if (!f.tableaux || !f.tableaux.length) return;
    let xml = z.lire(cheminFeuille);
    if (!xml || xml.includes('<tableParts')) return;
    const cheminRels = 'xl/worksheets/_rels/sheet' + (k + 1) + '.xml.rels';
    let rels = z.lire(cheminRels) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const parts = [];
    for (const t of f.tableaux) {
      n++;
      const noms = classeur.nomsColonnes(k, t);
      const cols = noms.map((nom, i) => {
        let x = '<tableColumn id="' + (i + 1) + '" name="' + ech(nom) + '"';
        let corps = '';
        if (t.totaux) {
          const cel = f.get(t.r2, t.c1 + i);
          if (cel && cel.f != null) { x += ' totalsRowFunction="custom"'; corps += '<totalsRowFormula>' + ech(convertirFormule(cel.f, 'en', { table: t.nom }).slice(1)) + '</totalsRowFormula>'; }
          else if (cel && cel.v != null && cel.v !== '') x += ' totalsRowLabel="' + ech(String(cel.v)) + '"';
        }
        const calc = t.calculees && t.calculees[i];
        if (calc) corps = '<calculatedColumnFormula>' + ech(convertirFormule(calc, 'en', { table: t.nom }).slice(1)) + '</calculatedColumnFormula>' + corps;
        return x + (corps ? '>' + corps + '</tableColumn>' : '/>');
      }).join('');
      const ref = adresse(t.r1, t.c1) + ':' + adresse(t.r2, t.c2);
      const refFiltre = adresse(t.r1, t.c1) + ':' + adresse(t.totaux ? t.r2 - 1 : t.r2, t.c2);
      const corps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + n + '" name="' + ech(t.nom) + '" displayName="' + ech(t.nom) + '" ref="' + ref + '"'
        + (t.entete === false ? ' headerRowCount="0"' : '') + (t.totaux ? ' totalsRowCount="1"' : ' totalsRowShown="0"') + '>'
        + (t.entete === false ? '' : '<autoFilter ref="' + refFiltre + '"/>')
        + '<tableColumns count="' + noms.length + '">' + cols + '</tableColumns>'
        + '<tableStyleInfo name="' + ech(t.style || 'TableStyleMedium2') + '" showFirstColumn="' + (t.premiereColonne ? 1 : 0) + '" showLastColumn="' + (t.derniereColonne ? 1 : 0) + '" showRowStripes="' + (t.bandes === false ? 0 : 1) + '" showColumnStripes="0"/></table>';
      z.ecrire('xl/tables/table' + n + '.xml', corps);
      types = types.replace('</Types>', '<Override PartName="/xl/tables/table' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>');
      let id = 'rIdTable' + n; while (rels.includes('Id="' + id + '"')) id += 'b';
      rels = rels.replace('</Relationships>', '<Relationship Id="' + id + '" Type="' + REL_TABLE + '" Target="../tables/table' + n + '.xml"/></Relationships>');
      parts.push('<tablePart r:id="' + id + '"/>');
    }
    z.ecrire(cheminRels, rels);
    if (!/xmlns:r=/.test(xml.slice(0, 600))) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="' + NS_R + '" ');
    // Le filtre automatique d'un tableau est dans le tableau : celui de la feuille, s'il couvre la même plage, est retiré
    for (const t of f.tableaux) {
      const ref = adresse(t.r1, t.c1) + ':' + adresse(t.totaux ? t.r2 - 1 : t.r2, t.c2);
      xml = xml.replace(new RegExp('<autoFilter ref="' + ref + '"(?:/>|>[\\s\\S]*?</autoFilter>)'), '');
    }
    const el = '<tableParts count="' + parts.length + '">' + parts.join('') + '</tableParts>';
    const ext = xml.indexOf('<extLst');
    xml = ext >= 0 ? xml.slice(0, ext) + el + xml.slice(ext) : xml.replace('</worksheet>', el + '</worksheet>');
    z.ecrire(cheminFeuille, xml);
  });
  z.ecrire('[Content_Types].xml', types);
  return new Uint8Array(XLSX.CFB.write(z.cfb, { fileType: 'zip', type: 'array' }));
}
