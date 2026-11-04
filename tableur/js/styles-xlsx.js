// Styles de cellules (gras, italique, souligné, couleurs, alignement, bordures) dans les fichiers .xlsx :
// SheetJS (édition communautaire) ne les lit ni ne les écrit, alors on complète nous-mêmes
// xl/styles.xml et xl/worksheets/sheetN.xml dans le zip, lu et réécrit avec XLSX.CFB.
//
// Modèle de style d'une cellule (cel.s) :
//   { gras, italique, souligne, couleur: '#rrggbb', fond: '#rrggbb', taille, align: 'left'|'center'|'right',
//     valign: 'top'|'center', renvoi (renvoyer à la ligne automatiquement),
//     bordures: { h, b, g, d } avec 'thin' | 'medium' | 'thick' }

const dec = (u8) => new TextDecoder('utf-8').decode(u8);
const enc = (s) => new TextEncoder().encode(s);
const attr = (xml, nom) => { const m = new RegExp(nom + '="([^"]*)"').exec(xml); return m ? m[1] : null; };
const echXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fichierZip(cfb, chemin) {
  const i = cfb.FullPaths.findIndex((p) => p.toLowerCase().endsWith(chemin.toLowerCase()));
  return i < 0 ? null : { index: i, texte: dec(cfb.FileIndex[i].content) };
}

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------

const PALETTE_INDEXEE = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
const THEME_DEFAUT = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

export function lireTheme(cfb) {
  const f = fichierZip(cfb, 'xl/theme/theme1.xml');
  if (!f) return THEME_DEFAUT;
  const prendre = (nom) => {
    const m = new RegExp('<a:' + nom + '>(.*?)</a:' + nom + '>', 's').exec(f.texte);
    if (!m) return null;
    const c = /lastClr="([0-9A-Fa-f]{6})"/.exec(m[1]) || /val="([0-9A-Fa-f]{6})"/.exec(m[1]);
    return c ? c[1].toUpperCase() : null;
  };
  const noms = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  return noms.map((n, i) => prendre(n) || THEME_DEFAUT[i]);
}

function appliquerTeinte(hex, tint) {
  if (!tint) return hex;
  const t = parseFloat(tint);
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((x) => (t < 0 ? x * (1 + t) : x + (255 - x) * t)).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'));
  return out.join('').toUpperCase();
}

/** <color rgb=|theme=|indexed= …/> → '#rrggbb' ou null. */
export function lireCouleur(xml, theme) {
  if (!xml) return null;
  const rgb = attr(xml, 'rgb');
  if (rgb) return '#' + rgb.slice(-6).toLowerCase();
  const th = attr(xml, 'theme');
  if (th != null) { const base = theme[+th] || THEME_DEFAUT[+th] || '000000'; return '#' + appliquerTeinte(base, attr(xml, 'tint')).toLowerCase(); }
  const idx = attr(xml, 'indexed');
  if (idx != null) { const c = PALETTE_INDEXEE[+idx]; return c ? '#' + c.toLowerCase() : null; }
  return null;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Lit les styles d'un .xlsx : renvoie Map nomFeuille → Map adresse → style (seules les cellules stylées).
 */
export function lireStylesXlsx(XLSX, octets) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const styles = fichierZip(cfb, 'xl/styles.xml');
  const wb = fichierZip(cfb, 'xl/workbook.xml');
  const rels = fichierZip(cfb, 'xl/_rels/workbook.xml.rels');
  if (!styles || !wb || !rels) return new Map();
  const theme = lireTheme(cfb);
  const bloc = (nom) => { const m = new RegExp('<' + nom + '[^>]*>(.*?)</' + nom + '>', 's').exec(styles.texte); return m ? m[1] : ''; };
  const elements = (xml, nom) => { const out = []; const re = new RegExp('<' + nom + '(?:\\s[^>]*?)?(?:/>|>.*?</' + nom + '>)', 'gs'); let m; while ((m = re.exec(xml))) out.push(m[0]); return out; };
  const fonts = elements(bloc('fonts'), 'font').map((f) => {
    const s = {};
    if (/<b\b(?![^>]*val="0")/.test(f)) s.gras = true;
    if (/<i\b(?![^>]*val="0")/.test(f)) s.italique = true;
    if (/<u\b(?![^>]*val="none")/.test(f)) s.souligne = true;
    if (/<strike\b(?![^>]*val="(0|false)")/.test(f)) s.barre = true;
    const sz = /<sz val="([\d.]+)"/.exec(f); if (sz && Math.abs(+sz[1] - 11) > 0.5 && Math.abs(+sz[1] - 12) > 0.5) s.taille = Math.round(+sz[1] * 1.333);
    const col = /<color[^>]*\/>/.exec(f); const c = col ? lireCouleur(col[0], theme) : null; if (c && c !== '#000000') s.couleur = c;
    return s;
  });
  const fills = elements(bloc('fills'), 'fill').map((f) => {
    if (!/patternType="solid"/.test(f)) return null;
    const fg = /<fgColor[^>]*\/>/.exec(f);
    return fg ? lireCouleur(fg[0], theme) : null;
  });
  const borders = elements(bloc('borders'), 'border').map((b) => {
    const out = {};
    for (const [xmlNom, cle] of [['top', 'h'], ['bottom', 'b'], ['left', 'g'], ['right', 'd']]) {
      const m = new RegExp('<' + xmlNom + '[^>]*style="([^"]+)"').exec(b);
      if (!m) continue;
      const st = m[1];
      out[cle] = st === 'thick' || st === 'double' ? 'thick' : st === 'medium' || st === 'mediumDashed' ? 'medium' : 'thin';
    }
    return Object.keys(out).length ? out : null;
  });
  const xfs = elements(bloc('cellXfs'), 'xf').map((x) => {
    const s = { ...(fonts[+(attr(x, 'fontId') || 0)] || {}) };
    const fond = fills[+(attr(x, 'fillId') || 0)]; if (fond) s.fond = fond;
    const bord = borders[+(attr(x, 'borderId') || 0)]; if (bord) s.bordures = { ...bord };
    const al = /<alignment[^>]*horizontal="(left|center|right)"/.exec(x); if (al) s.align = al[1];
    const va = /<alignment[^>]*vertical="(top|center)"/.exec(x); if (va) s.valign = va[1];
    if (/<alignment[^>]*wrapText="(1|true)"/.test(x)) s.renvoi = true;
    const ind = /<alignment[^>]*indent="(\d+)"/.exec(x); if (ind && +ind[1]) s.retrait = +ind[1];
    return Object.keys(s).length ? s : null;
  });
  if (!xfs.some(Boolean)) return new Map();
  // Feuilles : nom → fichier
  const cibles = {};
  for (const r of elements(rels.texte, 'Relationship')) cibles[attr(r, 'Id')] = attr(r, 'Target');
  const resultat = new Map();
  for (const sh of elements(wb.texte, 'sheet')) {
    const nom = (attr(sh, 'name') || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const rid = attr(sh, 'r:id') || attr(sh, 'r:Id');
    let cible = cibles[rid]; if (!cible) continue;
    cible = cible.replace(/^\/?xl\//, '').replace(/^\//, '');
    const f = fichierZip(cfb, 'xl/' + cible) || fichierZip(cfb, cible);
    if (!f) continue;
    const cellules = new Map();
    const re = /<c r="([A-Z]+\d+)"[^>]*?\ss="(\d+)"/g;
    let m;
    while ((m = re.exec(f.texte))) { const s = xfs[+m[2]]; if (s) cellules.set(m[1], { ...s, bordures: s.bordures ? { ...s.bordures } : undefined }); }
    if (cellules.size) resultat.set(nom, cellules);
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function cleStyle(s) {
  if (!s) return '';
  const b = s.bordures || (s.bordure ? { h: 'thin', b: 'thin', g: 'thin', d: 'thin' } : null);
  return [s.gras ? 'B' : '', s.italique ? 'I' : '', s.souligne ? 'U' : '', s.couleur || '', s.fond || '', s.taille || '', s.align || '', s.valign || '', s.renvoi ? 'W' : '', s.barre ? 'S' : '', s.retrait || '',
    b ? ['h', 'b', 'g', 'd'].map((k) => b[k] || '-').join(',') : ''].join('|');
}

/**
 * Réécrit le .xlsx produit par SheetJS en y ajoutant les styles des cellules.
 * feuilles : les feuilles du classeur dans l'ordre d'écriture (sheet1.xml, sheet2.xml…).
 */
export function ecrireStylesXlsx(XLSX, octets, feuilles) {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const styles = fichierZip(cfb, 'xl/styles.xml');
  if (!styles) return octets;
  let xml = styles.texte;
  const section = (nom) => { const m = new RegExp('<' + nom + '[^>]*>(.*?)</' + nom + '>', 's').exec(xml); return m ? { tout: m[0], interieur: m[1] } : null; };
  const fontsS = section('fonts'), fillsS = section('fills'), bordersS = section('borders'), xfsS = section('cellXfs');
  if (!fontsS || !fillsS || !bordersS || !xfsS) return octets;
  const fonts = [...fontsS.interieur.matchAll(/<font>.*?<\/font>|<font\/>/gs)].map((m) => m[0]);
  const fills = [...fillsS.interieur.matchAll(/<fill>.*?<\/fill>|<fill\/>/gs)].map((m) => m[0]);
  const borders = [...bordersS.interieur.matchAll(/<border>.*?<\/border>|<border\/>/gs)].map((m) => m[0]);
  const xfs = [...xfsS.interieur.matchAll(/<xf\b[^>]*?(?:\/>|>.*?<\/xf>)/gs)].map((m) => m[0]);
  const police = fonts[0] || '<font><sz val="11"/><name val="Calibri"/></font>';
  const indexDe = (liste, xmlEl) => { let i = liste.indexOf(xmlEl); if (i < 0) { i = liste.length; liste.push(xmlEl); } return i; };
  const cache = new Map(); // (xfOrigine|cléStyle) → nouvel index
  const xfPour = (origine, s) => {
    const cle = origine + '|' + cleStyle(s);
    if (cache.has(cle)) return cache.get(cle);
    const base = xfs[origine] || xfs[0];
    const numFmtId = attr(base, 'numFmtId') || '0';
    let fontXml = police;
    if (s.gras || s.italique || s.souligne || s.barre || s.couleur || s.taille) {
      const sz = /<sz val="([\d.]+)"\/>/.exec(police);
      const taille = s.taille ? Math.round(s.taille * 0.75) : (sz ? sz[1] : 11);
      fontXml = '<font>' + (s.gras ? '<b/>' : '') + (s.italique ? '<i/>' : '') + (s.barre ? '<strike/>' : '') + (s.souligne ? '<u/>' : '') + '<sz val="' + taille + '"/>'
        + (s.couleur ? '<color rgb="FF' + s.couleur.slice(1).toUpperCase() + '"/>' : '<color theme="1"/>') + '<name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';
    }
    const fontId = indexDe(fonts, fontXml);
    const fillId = s.fond ? indexDe(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fond.slice(1).toUpperCase() + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
    const b = s.bordures || (s.bordure ? { h: 'thin', b: 'thin', g: 'thin', d: 'thin' } : null);
    let borderId = 0;
    if (b) {
      const cote = (nom, v) => (v ? '<' + nom + ' style="' + v + '"><color auto="1"/></' + nom + '>' : '<' + nom + '/>');
      borderId = indexDe(borders, '<border>' + cote('left', b.g) + cote('right', b.d) + cote('top', b.h) + cote('bottom', b.b) + '<diagonal/></border>');
    }
    const xf = '<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"'
      + (numFmtId !== '0' ? ' applyNumberFormat="1"' : '') + (fontId ? ' applyFont="1"' : '') + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '')
      + (s.align || s.valign || s.renvoi || s.retrait ? ' applyAlignment="1"><alignment' + (s.align ? ' horizontal="' + s.align + '"' : s.retrait ? ' horizontal="left"' : '') + (s.valign ? ' vertical="' + s.valign + '"' : '') + (s.renvoi ? ' wrapText="1"' : '') + (s.retrait ? ' indent="' + s.retrait + '"' : '') + '/></xf>' : '/>');
    const i = indexDe(xfs, xf);
    cache.set(cle, i);
    return i;
  };
  // Feuilles
  let modifie = false;
  feuilles.forEach((feuille, k) => {
    const f = fichierZip(cfb, 'xl/worksheets/sheet' + (k + 1) + '.xml');
    if (!f) return;
    const styleDe = new Map();
    feuille.chaque((r, c, cel) => { if (cel.s && cleStyle(cel.s)) styleDe.set(colVersLettresLocal(c) + (r + 1), cel.s); });
    if (!styleDe.size) return;
    let texte = f.texte;
    texte = texte.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/?)>/g, (tout, adr, attrs, fin) => {
      const s = styleDe.get(adr);
      if (!s) return tout;
      styleDe.delete(adr);
      const m = /\ss="(\d+)"/.exec(attrs);
      const origine = m ? +m[1] : 0;
      const idx = xfPour(origine, s);
      const reste = attrs.replace(/\ss="\d+"/, '');
      return '<c r="' + adr + '" s="' + idx + '"' + reste + fin + '>';
    });
    // Cellules stylées sans contenu : il faut les créer dans leur ligne
    if (styleDe.size) {
      const parLigne = new Map();
      for (const [adr, s] of styleDe) { const r = +adr.replace(/^[A-Z]+/, ''); if (!parLigne.has(r)) parLigne.set(r, []); parLigne.get(r).push([adr, s]); }
      for (const [r, cells] of parLigne) {
        const ajout = cells.map(([adr, s]) => '<c r="' + adr + '" s="' + xfPour(0, s) + '"/>').join('');
        const reLigne = new RegExp('(<row r="' + r + '"[^>]*>)(.*?)(</row>)', 's');
        if (reLigne.test(texte)) texte = texte.replace(reLigne, (t, a, b, c) => a + trierCellules(b + ajout) + c);
        else if (/<row r="\d+"[^>]*\/>/.test(texte) && false) { /* ligne vide : non généré par SheetJS */ }
        else {
          // Insère une nouvelle ligne au bon endroit de sheetData
          const lignes = [...texte.matchAll(/<row r="(\d+)"/g)].map((m) => +m[1]);
          const suivante = lignes.find((x) => x > r);
          const nouvelle = '<row r="' + r + '">' + ajout + '</row>';
          if (suivante) texte = texte.replace('<row r="' + suivante + '"', nouvelle + '<row r="' + suivante + '"');
          else if (texte.includes('</sheetData>')) texte = texte.replace('</sheetData>', nouvelle + '</sheetData>');
          else texte = texte.replace('<sheetData/>', '<sheetData>' + nouvelle + '</sheetData>');
        }
      }
    }
    cfb.FileIndex[f.index].content = enc(texte);
    modifie = true;
  });
  if (!modifie) return octets;
  xml = xml.replace(fontsS.tout, '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>')
    .replace(fillsS.tout, '<fills count="' + fills.length + '">' + fills.join('') + '</fills>')
    .replace(bordersS.tout, '<borders count="' + borders.length + '">' + borders.join('') + '</borders>')
    .replace(xfsS.tout, '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>');
  cfb.FileIndex[styles.index].content = enc(xml);
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }));
}

function trierCellules(interieur) {
  const cells = [...interieur.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>.*?<\/c>)/gs)];
  if (!cells.length) return interieur;
  const col = (l) => { let c = 0; for (const ch of l) c = c * 26 + (ch.charCodeAt(0) - 64); return c; };
  return cells.sort((a, b) => col(a[1]) - col(b[1])).map((m) => m[0]).join('');
}

function colVersLettresLocal(c) {
  let s = ''; c += 1;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

export { echXml };
