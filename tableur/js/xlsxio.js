// Lecture et écriture de fichiers .xlsx / .xlsm / .csv avec SheetJS (passé en paramètre : window.XLSX ou require('xlsx')).

import { Classeur } from './classeur.js';
import { ErreurFormule, parseAdresse, colVersLettres, ERR, convertirFormule, adresse } from './formules.js';
import { extraireModulesVBA } from './vbaextract.js';
import { lireStylesXlsx, ecrireStylesXlsx } from './styles-xlsx.js';
import { lireObjetsXlsx } from './objets-xlsx.js';
import { lireVuesXlsx, ecrireVuesXlsx } from './vues-xlsx.js';
import { ecrireGraphiquesXlsx, specDepuisChartXml, positionAncre } from './graphiques-xlsx.js';

const FEUILLE_MACROS = '_MacrosTableur';
const FEUILLE_GRAPHIQUES = '_GraphiquesTableur';   // ancien format : graphiques seuls
const FEUILLE_OBJETS = '_ObjetsTableur';           // graphiques, boutons, images (une ligne par objet)
const TYPES_OBJETS = { graphique: 'graphiques', bouton: 'boutons', image: 'images', tcd: 'tcd' };

/** Lit un fichier (ArrayBuffer / Uint8Array) et renvoie un Classeur. */
export function lireClasseur(XLSX, donnees, nomFichier = 'Classeur.xlsx') {
  const wb = XLSX.read(donnees, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true, bookVBA: true, cellDates: false, dense: false, raw: false });
  const classeur = new Classeur();
  classeur.nomFichier = nomFichier;
  const infos = (wb.Workbook && wb.Workbook.Sheets) || [];
  const macrosLignes = [];
  const objets = []; // [nomFeuille, type, objet]
  wb.SheetNames.forEach((nom, i) => {
    const ws = wb.Sheets[nom];
    if (nom === FEUILLE_GRAPHIQUES) {
      for (let r = 1; r <= 1000; r++) { const a = ws['A' + r], b = ws['B' + r]; if (!a || !b) break; try { objets.push([String(a.v), 'graphique', JSON.parse(String(b.v))]); } catch { /* ligne illisible */ } }
      return;
    }
    if (nom === FEUILLE_OBJETS) {
      for (let r = 1; r <= 5000; r++) {
        const a = ws['A' + r], b = ws['B' + r]; if (!a || !b) break;
        let json = ''; for (let c = 2; c < 200; c++) { const x = ws[colVersLettres(c) + r]; if (!x) break; json += String(x.v); }
        try { objets.push([String(a.v), String(b.v), JSON.parse(json)]); } catch { /* ligne illisible */ }
      }
      return;
    }
    if (nom === FEUILLE_MACROS) {
      // Nos macros texte, une ligne de code par ligne de feuille
      const ref = ws['!ref'];
      if (ref) {
        const fin = parseAdresse(ref.split(':').pop());
        for (let r = 0; r <= fin.r; r++) { const c = ws['A' + (r + 1)]; macrosLignes.push(c && c.v != null ? String(c.v) : ''); }
      }
      return;
    }
    const f = classeur.ajouterFeuille(nom);
    if (infos[i] && infos[i].Hidden) f.cachee = true;
    if (infos[i] && infos[i].CodeName) { try { classeur.changerCodeNom(f, String(infos[i].CodeName)); } catch { /* nom déjà pris */ } }
    for (const k of Object.keys(ws)) {
      if (k[0] === '!') continue;
      const a = parseAdresse(k);
      if (!a) continue;
      const c = ws[k];
      const cel = {};
      if (c.f != null) cel.f = convertirFormule('=' + c.f, 'fr');
      // Formule matricielle (ou tableau dynamique) : les autres cellules de sa plage gardent juste la valeur calculée par Excel
      if (c.F && c.f == null) cel.couverte = true;
      if (c.z && c.z !== 'General') cel.z = c.z;
      switch (c.t) {
        case 'n': cel.v = c.v; break;
        case 's': case 'str': cel.v = c.v == null ? null : String(c.v); break;
        case 'b': cel.v = !!c.v; break;
        case 'd': cel.v = c.v instanceof Date ? (c.v.getTime() - Date.UTC(1899, 11, 30)) / 86400000 : c.v; if (!cel.z) cel.z = 'dd/mm/yyyy'; break;
        case 'e': cel.v = new ErreurFormule(c.w || ERR.VALEUR); break;
        default: cel.v = c.v ?? null;
      }
      if (cel.f) {
        // La valeur calculée par Excel est gardée de côté : elle sert tant qu'une fonction VBA ne peut pas répondre
        if (cel.v !== undefined && cel.v !== null && !(cel.v instanceof ErreurFormule)) cel.cache = cel.v;
        delete cel.v;
      }
      if (c.l && c.l.Target) cel.lien = String(c.l.Target).replace(/^#?/, (m) => (/^(https?:|mailto:|tel:|ftp:|file:)/i.test(String(c.l.Target)) ? '' : '#'));
      if (Array.isArray(c.c) && c.c.length) cel.note = c.c.map((x) => String(x.t || '').trim()).filter(Boolean).join('\n');
      if (c.s && typeof c.s === 'object') {
        const s = {};
        if (c.s.font) { if (c.s.font.bold) s.gras = true; if (c.s.font.italic) s.italique = true; if (c.s.font.color && c.s.font.color.rgb) s.couleur = '#' + c.s.font.color.rgb.slice(-6); }
        if (c.s.fill && c.s.fill.fgColor && c.s.fill.fgColor.rgb) s.fond = '#' + c.s.fill.fgColor.rgb.slice(-6);
        if (c.s.alignment && c.s.alignment.horizontal) s.align = c.s.alignment.horizontal;
        if (Object.keys(s).length) cel.s = s;
      }
      f.set(a.r, a.c, cel);
    }
    if (ws['!cols']) ws['!cols'].forEach((col, ci) => { if (!col) return; const px = col.wpx || (col.wch ? Math.round(col.wch * 7 + 5) : (col.width ? Math.round(col.width * 7 + 5) : null)); if (px) f.largeurs[ci] = px; if (col.hidden) f.largeurs[ci] = 0; });
    if (ws['!rows']) ws['!rows'].forEach((row, ri) => { if (!row) return; const px = row.hpx || (row.hpt ? Math.round(row.hpt / 0.75) : null); if (px) f.hauteurs[ri] = px; if (row.hidden) f.hauteurs[ri] = 0; });
    if (ws['!merges']) f.fusions = ws['!merges'].map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
  });
  if (!classeur.feuilles.length) classeur.ajouterFeuille('Feuil1');
  // Styles (gras, couleurs, bordures) : lus directement dans le zip
  if (donnees.length > 4 && donnees[0] === 0x50 && donnees[1] === 0x4b) {
    try {
      const styles = lireStylesXlsx(XLSX, donnees);
      for (const [nom, cellules] of styles) {
        const f = classeur.feuille(nom);
        if (!f) continue;
        for (const [adr, st] of cellules) {
          const a = parseAdresse(adr); if (!a) continue;
          const cel = f.get(a.r, a.c) || {};
          cel.s = { ...(cel.s || {}), ...st };
          for (const k of Object.keys(cel.s)) if (cel.s[k] === undefined) delete cel.s[k];
          f.set(a.r, a.c, cel);
        }
      }
    } catch (e) { console.warn('Styles non lus :', e); }
  }
  // Volets figés, filtre automatique, mise en forme conditionnelle
  if (donnees.length > 4 && donnees[0] === 0x50 && donnees[1] === 0x4b) {
    try {
      for (const [nom, v] of lireVuesXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nom);
        if (!f) continue;
        if (v.figer) f.figer = v.figer;
        if (v.couleur) f.couleur = v.couleur;
        if (v.mfc) f.mfc = v.mfc;
        if (v.validations) f.validations = v.validations;
        if (v.filtre) {
          f.filtre = v.filtre;
          // Les lignes masquées dans la plage du filtre sont celles que le filtre cache (Excel les enregistre ainsi)
          if (Object.keys(v.filtre.criteres).length) for (let r = v.filtre.r1 + 1; r <= v.filtre.r2; r++) if (f.hauteurs[r] === 0) { delete f.hauteurs[r]; f.filtrees.add(r); }
        }
      }
    } catch (e) { console.warn('Volets, filtre ou mise en forme conditionnelle non lus :', e); }
  }
  // Noms définis
  if (wb.Workbook && wb.Workbook.Names) {
    for (const n of wb.Workbook.Names) {
      if (!n.Name || n.Name.startsWith('_xlnm.') || !n.Ref) continue;
      // Un nom peut être propre à une feuille (même nom sur plusieurs feuilles, comme « MortTable »)
      const fi = n.Sheet !== undefined && n.Sheet !== null ? classeur.indexFeuille(wb.SheetNames[n.Sheet]) : null;
      try { classeur.definirNom(n.Name, convertirFormule('=' + n.Ref, 'fr').slice(1), fi !== null && fi >= 0 ? fi : null); } catch { /* nom non géré */ }
    }
  }
  // Boutons reliés à des macros et images posées sur les feuilles
  if (donnees.length > 4 && donnees[0] === 0x50 && donnees[1] === 0x4b) {
    try {
      for (const [nomF, o] of lireObjetsXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nomF);
        if (!f) continue;
        f.boutons.push(...o.boutons); f.images.push(...o.images);
        // Graphiques d'Excel : traduits dans le format du Tableur (ceux qu'il a écrits gardent leur identifiant)
        for (const gx of o.graphiques || []) {
          try { const g = specDepuisChartXml(gx.xml, nomF); if (!g) continue; if (gx.id) g.id = gx.id; Object.assign(g, positionAncre(f, gx)); f.graphiques.push(g); } catch (e) { console.warn('Graphique non lu :', e); }
        }
      }
    } catch (e) { console.warn('Objets non lus :', e); }
  }
  for (const [nomF, type, o] of objets) {
    const f = classeur.feuille(nomF);
    const cle = TYPES_OBJETS[type];
    if (!f || !cle) continue;
    // La description complète gardée par le Tableur remplace celle relue dans le graphique Excel
    const i = f[cle].findIndex((x) => x.id === o.id);
    if (i < 0) f[cle].push(o); else if (cle === 'graphiques') f[cle][i] = o;
  }
  // Macros
  if (macrosLignes.length) classeur.macros = macrosLignes.join('\n');
  if (wb.vbaraw) {
    classeur.vbaBrut = wb.vbaraw instanceof Uint8Array ? wb.vbaraw : new Uint8Array(wb.vbaraw);
    if (!classeur.macros) {
      try {
        const modules = extraireModulesVBA(XLSX.CFB, classeur.vbaBrut);
        const nomClasseur = wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.CodeName;
        // Modules de document : ThisWorkbook et un module par feuille (retrouvée par son nom de code)
        classeur.macros = modules.filter((m) => m.code.trim() || m.type === 'module').map((m) => {
          const num = /^(?:Sheet|Feuil|Tabelle|Hoja|Foglio|Blad)(\d+)$/i.exec(m.nom);
          const f = m.type === 'document' && (classeur.feuilles.find((x) => x.codeNom.toLowerCase() === m.nom.toLowerCase()) || (num && classeur.feuilles[num[1] - 1]));
          const entete = m.type === 'document' && (m.nom === nomClasseur || /^(ThisWorkbook|CeClasseur|DieseArbeitsmappe|EsteLibro)$/i.test(m.nom)) ? "' ===== ThisWorkbook ====="
            : f ? "' ===== Feuille " + m.nom + ' (' + f.nom + ') ====='
            : "' ===== Module " + m.nom + ' =====';
          return entete + '\n' + m.code.trim();
        }).join('\n\n');
      } catch (e) {
        classeur.macros = "' Le projet VBA du fichier n'a pas pu être lu : " + e.message;
      }
    }
  }
  const actif = wb.Workbook && wb.Workbook.Views && wb.Workbook.Views[0] && wb.Workbook.Views[0].activeTab;
  classeur.active = Math.min(actif || 0, classeur.feuilles.length - 1);
  classeur.modifie();
  return classeur;
}

/** Écrit le classeur : renvoie un Uint8Array (.xlsx, ou .xlsm si des macros ou un projet VBA existent). */
export function ecrireClasseur(XLSX, classeur, options = {}) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Sheets: [], Names: [], CalcPr: { fullCalcOnLoad: true }, Views: [{ activeTab: classeur.active }] };
  classeur.feuilles.forEach((f, fi) => {
    const ws = {};
    let r2 = -1, c2 = -1;
    f.chaque((r, c, cel) => {
      const k = colVersLettres(c) + (r + 1);
      const o = {};
      let v = cel.f != null ? classeur.valeur(fi, r, c) : cel.v;
      if (cel.f != null) o.f = convertirFormule(cel.f, 'en').slice(1);
      if (v instanceof ErreurFormule) { if (cel.f == null) { o.t = 'e'; o.v = 0; o.w = v.code; } else { o.t = 'n'; } }
      else if (v == null) { if (cel.f == null && !cel.z && !cel.s) return; o.t = cel.f != null ? 'n' : 'z'; }
      else if (typeof v === 'number') { o.t = 'n'; o.v = v; }
      else if (typeof v === 'boolean') { o.t = 'b'; o.v = v; }
      else { o.t = 's'; o.v = String(v); }
      if (cel.z) o.z = cel.z;
      if (cel.note) o.c = [{ a: 'Sprezz', t: cel.note }];
      if (cel.lien) o.l = { Target: cel.lien };
      ws[k] = o;
      if (r > r2) r2 = r;
      if (c > c2) c2 = c;
    });
    // Formules qui débordent : écrites comme formules matricielles sur leur plage, avec les valeurs (Excel les affiche telles quelles)
    for (const z of classeur.evaluateur.zonesDebord(fi) || []) {
      const ref = colVersLettres(z.c) + (z.r + 1) + ':' + colVersLettres(z.c + z.w - 1) + (z.r + z.h);
      for (let i = 0; i < z.h; i++) for (let j = 0; j < z.w; j++) {
        const k = colVersLettres(z.c + j) + (z.r + i + 1);
        if (!i && !j) { if (ws[k]) ws[k].F = ref; continue; }
        if (ws[k] && ws[k].f) continue;
        const v = classeur.valeur(fi, z.r + i, z.c + j);
        ws[k] = { ...(ws[k] || {}), F: ref, ...(typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : v == null || v instanceof ErreurFormule ? { t: 'n', v: 0 } : { t: 's', v: String(v) }) };
        if (z.r + i > r2) r2 = z.r + i; if (z.c + j > c2) c2 = z.c + j;
      }
    }
    ws['!ref'] = 'A1:' + colVersLettres(Math.max(c2, 0)) + (Math.max(r2, 0) + 1);
    const cols = [];
    for (const [c, px] of Object.entries(f.largeurs)) cols[c] = px === 0 ? { hidden: true } : { wpx: px };
    if (cols.length) ws['!cols'] = cols;
    const rows = [];
    for (const [r, px] of Object.entries(f.hauteurs)) rows[r] = px === 0 ? { hidden: true } : { hpx: px };
    for (const r of f.filtrees || []) rows[r] = { ...(rows[r] || {}), hidden: true };
    if (rows.length) ws['!rows'] = rows;
    if (f.filtre) ws['!autofilter'] = { ref: adresse(f.filtre.r1, f.filtre.c1) + ':' + adresse(f.filtre.r2, f.filtre.c2) };
    if (f.fusions.length) ws['!merges'] = f.fusions.map((m) => ({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }));
    XLSX.utils.book_append_sheet(wb, ws, f.nom);
    wb.Workbook.Sheets.push({ name: f.nom, Hidden: f.cachee ? 1 : 0 });
  });
  for (const d of classeur.noms.values()) wb.Workbook.Names.push({ Name: d.nom, Ref: convertirFormule('=' + d.ref, 'en').slice(1) });
  classeur.feuilles.forEach((f, i) => { for (const d of f.noms.values()) wb.Workbook.Names.push({ Name: d.nom, Ref: convertirFormule('=' + d.ref, 'en').slice(1), Sheet: i }); });
  const macros = (classeur.macros || '').trim();
  if (macros) {
    const ws = {};
    const lignes = classeur.macros.replace(/\r\n?/g, '\n').split('\n');
    lignes.forEach((l, i) => { ws['A' + (i + 1)] = { t: 's', v: l }; });
    ws['!ref'] = 'A1:A' + lignes.length;
    XLSX.utils.book_append_sheet(wb, ws, FEUILLE_MACROS);
    wb.Workbook.Sheets.push({ name: FEUILLE_MACROS, Hidden: 2 });
  }
  // Graphiques, boutons et images : une feuille masquée que ce tableur relit (Excel ne les affiche pas)
  const lignes = [];
  for (const f of classeur.feuilles) for (const [type, cle] of Object.entries(TYPES_OBJETS)) for (const o of f[cle] || []) lignes.push([f.nom, type, JSON.stringify(o)]);
  if (lignes.length) {
    const ws = {};
    let cmax = 2;
    lignes.forEach(([n, t, j], i) => {
      ws['A' + (i + 1)] = { t: 's', v: n }; ws['B' + (i + 1)] = { t: 's', v: t };
      // Une cellule Excel ne dépasse pas 32 767 caractères : les images sont coupées en morceaux
      for (let k = 0, c = 2; k < j.length; k += 30000, c++) { ws[colVersLettres(c) + (i + 1)] = { t: 's', v: j.slice(k, k + 30000) }; cmax = Math.max(cmax, c); }
    });
    ws['!ref'] = 'A1:' + colVersLettres(cmax) + lignes.length;
    XLSX.utils.book_append_sheet(wb, ws, FEUILLE_OBJETS);
    wb.Workbook.Sheets.push({ name: FEUILLE_OBJETS, Hidden: 2 });
  }
  let bookType = options.bookType || 'xlsx';
  if (classeur.vbaBrut && bookType === 'xlsm') wb.vbaraw = classeur.vbaBrut;
  if (bookType === 'csv') {
    const texte = XLSX.utils.sheet_to_csv(wb.Sheets[classeur.feuilles[classeur.active].nom], { FS: ';' });
    return new TextEncoder().encode('﻿' + texte);
  }
  let out = new Uint8Array(XLSX.write(wb, { bookType, type: 'array', compression: true }));
  try { out = ecrireStylesXlsx(XLSX, out, classeur.feuilles); } catch (e) { console.warn('Styles non écrits :', e); }
  try { out = ecrireVuesXlsx(XLSX, out, classeur.feuilles); } catch (e) { console.warn('Volets, filtre ou mise en forme conditionnelle non écrits :', e); }
  if (bookType !== 'csv') try { out = ecrireGraphiquesXlsx(XLSX, out, classeur); } catch (e) { console.warn('Graphiques Excel non écrits :', e); }
  return out;
}

/** Lit les tableaux d'un document Word (.docx) : chaque tableau devient une feuille. */
export function lireDocx(XLSX, octets, nomFichier = 'Document.docx') {
  const cfb = XLSX.CFB.read(octets, { type: 'array' });
  const i = cfb.FullPaths.findIndex((p) => p.toLowerCase().endsWith('word/document.xml'));
  if (i < 0) throw new Error('document.xml introuvable : ce n\'est pas un .docx');
  const xml = new TextDecoder('utf-8').decode(cfb.FileIndex[i].content);
  const entites = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
  const texteDe = (fragment) => entites(fragment.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>|<\/w:p>/g, '\n').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '$1').replace(/<[^>]+>/g, '')).replace(/\n+$/, '').trim();
  const classeur = new Classeur();
  classeur.nomFichier = nomFichier.replace(/\.docx$/i, '') + '.xlsx';
  const tableaux = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  tableaux.forEach((tbl, k) => {
    const f = classeur.ajouterFeuille('Tableau ' + (k + 1));
    const lignes = tbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
    lignes.forEach((tr, r) => {
      const cellules = tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      let c = 0;
      for (const tc of cellules) {
        const span = /<w:gridSpan w:val="(\d+)"/.exec(tc);
        classeur.saisir(f, r, c, texteDe(tc));
        c += span ? +span[1] : 1;
      }
    });
  });
  if (!tableaux.length) {
    const f = classeur.ajouterFeuille('Texte');
    const paragraphes = (xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(texteDe).filter(Boolean);
    paragraphes.forEach((t, r) => classeur.saisir(f, r, 0, t));
  }
  classeur.modifie();
  return classeur;
}

/** Nettoie un module VBA exporté (.bas, .cls, .frm) : en-tête et lignes Attribute. */
export function nettoyerModuleVBA(texte, nomFichier = '') {
  let t = texte.replace(/\r\n?/g, '\n');
  const vbNom = /^Attribute VB_Name\s*=\s*"([^"]+)"/m.exec(t);
  t = t.replace(/^VERSION [\d.]+ CLASS\n(?:BEGIN\n[\s\S]*?\nEND\n)?/i, '').replace(/^Attribute VB_.*$\n?/gm, '').trim();
  const nom = (vbNom ? vbNom[1] : nomFichier.replace(/^.*[\\/]/, '').replace(/\.(bas|cls|frm|txt|vba)$/i, '')).replace(/[^\wÀ-ÖØ-öø-ÿ]+/g, '_').replace(/^(\d)/, 'M$1').slice(0, 31);
  return (nom ? "' ===== Module " + nom + ' =====\n' : '') + t + '\n';
}

export { FEUILLE_MACROS, FEUILLE_GRAPHIQUES, FEUILLE_OBJETS };
