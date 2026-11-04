// Mise en page (marges, papier, échelle, en-têtes et pieds, sauts de page, options d'impression) et protection
// des feuilles dans les .xlsx : SheetJS ne les lit ni ne les écrit.

import { mp, CODES_PAPIER, versExcel, depuisExcel } from './impression.js';

const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const ech = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (xml, nom) => { const m = new RegExp('\\s' + nom + '="([^"]*)"').exec(xml); return m ? entites(m[1]) : null; };
const PAPIERS_INV = Object.fromEntries(Object.entries(CODES_PAPIER).map(([k, v]) => [v, k]));
const POUCE = 2.54;

// Ordre des éléments d'une feuille (le format l'impose)
const ORDRE = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate',
  'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks',
  'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
function retirer(xml, nom) { return xml.replace(new RegExp('<' + nom + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + nom + '>)', 'g'), ''); }
function poser(xml, nom, el) {
  xml = retirer(xml, nom);
  const apres = ORDRE.slice(ORDRE.indexOf(nom) + 1);
  let pos = -1;
  for (const s of apres) { const i = xml.search(new RegExp('<' + s + '[\\s/>]')); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if (pos < 0) pos = xml.lastIndexOf('</worksheet>');
  return xml.slice(0, pos) + el + xml.slice(pos);
}

/** Hachage historique d'Excel pour les mots de passe de feuille (16 bits, en hexadécimal). */
export function hacherMotDePasse(mdp) {
  let h = 0;
  for (let i = mdp.length - 1; i >= 0; i--) { h = ((h >> 14) & 1) | ((h << 1) & 0x7fff); h ^= mdp.charCodeAt(i); }
  h = ((h >> 14) & 1) | ((h << 1) & 0x7fff); h ^= mdp.length; h ^= 0xce4b;
  return h.toString(16).toUpperCase().padStart(4, '0');
}

// Droits laissés aux utilisateurs quand la feuille est protégée (attributs de <sheetProtection> : « 0 » = autorisé)
export const DROITS = [['selectionVerrouillees', 'selectLockedCells', 'Sélectionner les cellules verrouillées', true], ['selectionDeverrouillees', 'selectUnlockedCells', 'Sélectionner les cellules déverrouillées', true],
  ['formatCellules', 'formatCells', 'Format de cellule', false], ['formatColonnes', 'formatColumns', 'Format de colonne', false], ['formatLignes', 'formatRows', 'Format de ligne', false],
  ['insererColonnes', 'insertColumns', 'Insérer des colonnes', false], ['insererLignes', 'insertRows', 'Insérer des lignes', false], ['supprimerColonnes', 'deleteColumns', 'Supprimer des colonnes', false],
  ['supprimerLignes', 'deleteRows', 'Supprimer des lignes', false], ['trier', 'sort', 'Trier', false], ['filtrer', 'autoFilter', 'Utiliser le filtre automatique', false], ['objets', 'objects', 'Modifier les objets', false]];

export function ecrirePageXlsx(XLSX, octets, classeur) {
  if (!classeur.feuilles.some((f) => f.miseEnPage || (f.protection && f.protection.active) || (f.sparklines && f.sparklines.length))) return octets;
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const norm = (p) => p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase();
  classeur.feuilles.forEach((f, k) => {
    const i = cfb.FullPaths.findIndex((p) => norm(p) === 'xl/worksheets/sheet' + (k + 1) + '.xml');
    if (i < 0) return;
    let xml = dec(Uint8Array.from(cfb.FileIndex[i].content));
    if (f.miseEnPage) {
      const R = mp(f), m = R.marges;
      const opts = [R.quadrillage && 'gridLines="1"', R.entetes && 'headings="1"', R.centrerH && 'horizontalCentered="1"', R.centrerV && 'verticalCentered="1"'].filter(Boolean);
      if (opts.length) xml = poser(xml, 'printOptions', '<printOptions ' + opts.join(' ') + '/>');
      const po = (cm) => +(cm / POUCE).toFixed(4);
      xml = poser(xml, 'pageMargins', `<pageMargins left="${po(m.g)}" right="${po(m.d)}" top="${po(m.h)}" bottom="${po(m.b)}" header="${po(m.entete)}" footer="${po(m.pied)}"/>`);
      xml = poser(xml, 'pageSetup', '<pageSetup paperSize="' + (CODES_PAPIER[R.papier] || 9) + '"' + (R.ajuster ? '' : ' scale="' + Math.round(+R.echelle || 100) + '"')
        + (R.ajuster ? ' fitToWidth="' + (+R.ajuster.l || 0) + '" fitToHeight="' + (+R.ajuster.h || 0) + '"' : '') + (R.ordre === 'droite' ? ' pageOrder="overThenDown"' : '') + ' orientation="' + (R.orientation === 'paysage' ? 'landscape' : 'portrait') + '"/>');
      const eh = versExcel(R.entete), pi = versExcel(R.pied);
      if (eh || pi) xml = poser(xml, 'headerFooter', '<headerFooter>' + (eh ? '<oddHeader>' + ech(eh) + '</oddHeader>' : '') + (pi ? '<oddFooter>' + ech(pi) + '</oddFooter>' : '') + '</headerFooter>');
      const sauts = (liste, nom, max) => (liste && liste.length ? '<' + nom + ' count="' + liste.length + '" manualBreakCount="' + liste.length + '">' + liste.map((x) => '<brk id="' + x + '" max="' + max + '" man="1"/>').join('') + '</' + nom + '>' : '');
      if (R.sautsLignes.length) xml = poser(xml, 'rowBreaks', sauts(R.sautsLignes, 'rowBreaks', 16383));
      if (R.sautsColonnes.length) xml = poser(xml, 'colBreaks', sauts(R.sautsColonnes, 'colBreaks', 1048575));
      // « Ajuster à » : drapeau dans sheetPr
      if (R.ajuster) {
        const el = '<pageSetUpPr fitToPage="1"/>';
        if (/<sheetPr\b[^>]*\/>/.test(xml)) xml = xml.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1>' + el + '</sheetPr>');
        else if (/<sheetPr\b[^>]*>/.test(xml)) xml = xml.replace('</sheetPr>', el + '</sheetPr>');
        else xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr>' + el + '</sheetPr>');
      }
    }
    const pr = f.protection;
    if (pr && pr.active) {
      const droits = pr.autoriser || {};
      let el = '<sheetProtection' + (pr.hash ? ' password="' + pr.hash + '"' : '') + (pr.sha ? ' algorithmName="' + ech(pr.sha.algo) + '" hashValue="' + ech(pr.sha.hash) + '" saltValue="' + ech(pr.sha.sel) + '" spinCount="' + pr.sha.tours + '"' : '') + ' sheet="1"';
      for (const [cle, xmlNom, , defaut] of DROITS) {
        const permis = droits[cle] ?? defaut;
        // Les deux sélections : attribut « 1 » = interdit ; les autres : « 0 » = autorisé (et par défaut interdit)
        if (xmlNom.startsWith('select')) { if (!permis) el += ' ' + xmlNom + '="1"'; }
        else if (xmlNom === 'objects') el += permis ? '' : ' objects="1" scenarios="1"';
        else if (permis) el += ' ' + xmlNom + '="0"';
      }
      xml = poser(xml, 'sheetProtection', el + '/>');
    }
    if (f.sparklines && f.sparklines.length) {
      const nf = /^[A-Za-z_][\w.]*$/.test(f.nom) ? f.nom : "'" + f.nom.replace(/'/g, "''") + "'";
      const groupes = new Map();
      for (const sp of f.sparklines) { const k = sp.groupe || 'g'; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(sp); }
      const rgb = (c, d) => 'FF' + String(c || d).replace('#', '').toUpperCase();
      const lettres = (c) => { let t = ''; c++; while (c > 0) { const m = (c - 1) % 26; t = String.fromCharCode(65 + m) + t; c = Math.floor((c - 1) / 26); } return t; };
      let grp = '';
      for (const liste of groupes.values()) {
        const m = liste[0];
        grp += '<x14:sparklineGroup' + (m.type === 'colonne' ? ' type="column"' : m.type === 'gainperte' ? ' type="stacked"' : '') + ' displayEmptyCellsAs="gap"'
          + ['marqueurs:markers', 'haut:high', 'bas:low', 'premier:first', 'dernier:last', 'negatifs:negative'].map((x) => { const [a, b] = x.split(':'); return m[a] ? ' ' + b + '="1"' : ''; }).join('') + '>'
          + '<x14:colorSeries rgb="' + rgb(m.couleur, '#376092') + '"/><x14:colorNegative rgb="' + rgb(m.couleurNeg, '#D00000') + '"/><x14:colorAxis rgb="FF000000"/><x14:colorMarkers rgb="' + rgb(m.couleurNeg, '#D00000') + '"/>'
          + '<x14:colorFirst rgb="' + rgb(m.couleurNeg, '#D00000') + '"/><x14:colorLast rgb="' + rgb(m.couleurNeg, '#D00000') + '"/><x14:colorHigh rgb="' + rgb(m.couleurNeg, '#D00000') + '"/><x14:colorLow rgb="' + rgb(m.couleurNeg, '#D00000') + '"/>'
          + '<x14:sparklines>' + liste.map((sp) => '<x14:sparkline><xm:f>' + ech(String(sp.donnees).includes('!') ? sp.donnees : nf + '!' + sp.donnees) + '</xm:f><xm:sqref>' + lettres(sp.c) + (sp.r + 1) + '</xm:sqref></x14:sparkline>').join('') + '</x14:sparklines></x14:sparklineGroup>';
      }
      const ext = '<ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">' + grp + '</x14:sparklineGroups></ext>';
      xml = xml.includes('</extLst>') ? xml.replace('</extLst>', ext + '</extLst>') : xml.replace('</worksheet>', '<extLst>' + ext + '</extLst></worksheet>');
    }
    cfb.FileIndex[i].content = enc(xml);
  });
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}

/** Map chemin de feuille → { miseEnPage, protection } (les zones et titres d'impression viennent des noms définis). */
export function lirePageXlsx(XLSX, octets) {
  const out = new Map();
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const norm = (p) => p.replace(/^Root Entry\//, '').replace(/^\//, '').toLowerCase();
  const lire = (ch) => { const i = cfb.FullPaths.findIndex((p) => norm(p) === ch.toLowerCase()); return i < 0 ? null : dec(Uint8Array.from(cfb.FileIndex[i].content)); };
  const wb = lire('xl/workbook.xml'), rels = lire('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return out;
  const cibles = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) cibles.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    let t = cibles.get(attr(m[0], 'r:id')); if (!t) continue;
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const xml = lire(t); if (!xml) continue;
    const res = {};
    const R = {};
    const po = /<printOptions\b[^>]*>/.exec(xml);
    if (po) { const v = (n) => /^(1|true)$/.test(attr(po[0], n) || ''); R.quadrillage = v('gridLines'); R.entetes = v('headings'); R.centrerH = v('horizontalCentered'); R.centrerV = v('verticalCentered'); }
    const pm = /<pageMargins\b[^>]*>/.exec(xml);
    if (pm) { const cm = (n, d) => +((+(attr(pm[0], n) ?? d)) * POUCE).toFixed(2); R.marges = { g: cm('left', 0.7), d: cm('right', 0.7), h: cm('top', 0.75), b: cm('bottom', 0.75), entete: cm('header', 0.3), pied: cm('footer', 0.3) }; }
    const ps = /<pageSetup\b[^>]*>/.exec(xml);
    const ajuste = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(xml);
    if (ps) {
      R.papier = PAPIERS_INV[+(attr(ps[0], 'paperSize') || 9)] || 'A4';
      R.orientation = attr(ps[0], 'orientation') === 'landscape' ? 'paysage' : 'portrait';
      if (attr(ps[0], 'scale')) R.echelle = +attr(ps[0], 'scale');
      if (ajuste) R.ajuster = { l: +(attr(ps[0], 'fitToWidth') ?? 1), h: +(attr(ps[0], 'fitToHeight') ?? 1) };
      if (attr(ps[0], 'pageOrder') === 'overThenDown') R.ordre = 'droite';
    }
    const oh = /<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(xml), of = /<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(xml);
    if (oh) R.entete = depuisExcel(entites(oh[1]));
    if (of) R.pied = depuisExcel(entites(of[1]));
    const brk = (nom) => { const b = new RegExp('<' + nom + '\\b[^>]*>([\\s\\S]*?)</' + nom + '>').exec(xml); return b ? [...b[1].matchAll(/<brk\b[^>]*>/g)].filter((x) => attr(x[0], 'man') !== '0').map((x) => +attr(x[0], 'id')).filter((x) => x > 0) : []; };
    const sl = brk('rowBreaks'), sc = brk('colBreaks');
    if (sl.length) R.sautsLignes = sl;
    if (sc.length) R.sautsColonnes = sc;
    if (Object.keys(R).length) res.miseEnPage = R;
    const sp = /<sheetProtection\b[^>]*>/.exec(xml);
    if (sp && /^(1|true)$/.test(attr(sp[0], 'sheet') || '')) {
      const p = { active: true, autoriser: {} };
      if (attr(sp[0], 'password')) p.hash = attr(sp[0], 'password').toUpperCase();
      if (attr(sp[0], 'hashValue')) p.sha = { algo: attr(sp[0], 'algorithmName') || 'SHA-512', hash: attr(sp[0], 'hashValue'), sel: attr(sp[0], 'saltValue') || '', tours: +(attr(sp[0], 'spinCount') || 100000) };
      for (const [cle, xmlNom, , defaut] of DROITS) {
        const v = attr(sp[0], xmlNom);
        if (xmlNom.startsWith('select')) p.autoriser[cle] = !(v === '1' || v === 'true');
        else if (xmlNom === 'objects') p.autoriser[cle] = !(v === '1' || v === 'true');
        else p.autoriser[cle] = v === '0' || v === 'false' ? true : v == null ? defaut : false;
      }
      res.protection = p;
    }
    // Graphiques sparkline (extension x14)
    const sparks = [];
    for (const gm of xml.matchAll(/<x14:sparklineGroup\b([^>]*)>([\s\S]*?)<\/x14:sparklineGroup>/g)) {
      const tete = '<g ' + gm[1] + '>', corps = gm[2], groupe = 'sp' + Math.random().toString(36).slice(2, 8);
      const couleur = (nom) => { const c = new RegExp('<x14:' + nom + '\\b[^>]*rgb="([0-9A-Fa-f]{6,8})"').exec(corps); return c ? '#' + c[1].slice(-6).toLowerCase() : null; };
      const oui = (n) => /^(1|true)$/.test(attr(tete, n) || '');
      const modele = { type: attr(tete, 'type') === 'column' ? 'colonne' : attr(tete, 'type') === 'stacked' ? 'gainperte' : 'ligne', couleur: couleur('colorSeries') || '#376092', couleurNeg: couleur('colorNegative') || '#d00000',
        marqueurs: oui('markers'), haut: oui('high'), bas: oui('low'), premier: oui('first'), dernier: oui('last'), negatifs: oui('negative'), groupe };
      for (const sm of corps.matchAll(/<x14:sparkline>[\s\S]*?<xm:f>([\s\S]*?)<\/xm:f>[\s\S]*?<xm:sqref>([\s\S]*?)<\/xm:sqref>[\s\S]*?<\/x14:sparkline>/g)) {
        const cible = /^([A-Z]+)(\d+)$/.exec(sm[2].trim().replace(/\$/g, ''));
        if (!cible) continue;
        const c = cible[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const donnees = entites(sm[1]).replace(/\$/g, ''), nomF = attr(m[0], 'name') || '';
        const local = donnees.replace(/^'?(.*?)'?!/, (t, n) => (n.replace(/''/g, "'").toLowerCase() === nomF.toLowerCase() ? '' : t));
        sparks.push({ ...modele, r: +cible[2] - 1, c, donnees: local });
      }
    }
    if (sparks.length) res.sparklines = sparks;
    if (Object.keys(res).length) out.set(attr(m[0], 'name'), res);
  }
  return out;
}

/** Vérifie un mot de passe contre un hachage moderne d'Excel (SHA-512, sel, itérations). */
export function verifierShaMotDePasse(mdp, { algo = 'SHA-512', hash, sel, tours = 100000 }, sha) {
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const u16 = new Uint8Array(mdp.length * 2);
  for (let i = 0; i < mdp.length; i++) { u16[2 * i] = mdp.charCodeAt(i) & 255; u16[2 * i + 1] = mdp.charCodeAt(i) >> 8; }
  const s = b64(sel || '');
  let h = sha[algo] ? sha[algo](concat(s, u16)) : null;
  if (!h) return false;
  for (let i = 0; i < tours; i++) h = sha[algo](concat(h, new Uint8Array([i & 255, (i >> 8) & 255, (i >> 16) & 255, (i >>> 24) & 255])));
  return btoa(String.fromCharCode(...h)) === hash;
}
function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
