// Lecture et écriture de fichiers .xlsx / .xlsm / .csv avec SheetJS (passé en paramètre : window.XLSX ou require('xlsx')).

import { Classeur } from './classeur.js';
import { ErreurFormule, parseAdresse, colVersLettres, ERR, convertirFormule } from './formules.js';
import { extraireModulesVBA } from './vbaextract.js';

const FEUILLE_MACROS = '_MacrosTableur';

/** Lit un fichier (ArrayBuffer / Uint8Array) et renvoie un Classeur. */
export function lireClasseur(XLSX, donnees, nomFichier = 'Classeur.xlsx') {
  const wb = XLSX.read(donnees, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true, bookVBA: true, cellDates: false, dense: false, raw: false });
  const classeur = new Classeur();
  classeur.nomFichier = nomFichier;
  const infos = (wb.Workbook && wb.Workbook.Sheets) || [];
  const macrosLignes = [];
  wb.SheetNames.forEach((nom, i) => {
    const ws = wb.Sheets[nom];
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
    for (const k of Object.keys(ws)) {
      if (k[0] === '!') continue;
      const a = parseAdresse(k);
      if (!a) continue;
      const c = ws[k];
      const cel = {};
      if (c.f != null) cel.f = convertirFormule('=' + c.f, 'fr');
      if (c.z && c.z !== 'General') cel.z = c.z;
      switch (c.t) {
        case 'n': cel.v = c.v; break;
        case 's': case 'str': cel.v = c.v == null ? null : String(c.v); break;
        case 'b': cel.v = !!c.v; break;
        case 'd': cel.v = c.v instanceof Date ? (c.v.getTime() - Date.UTC(1899, 11, 30)) / 86400000 : c.v; if (!cel.z) cel.z = 'dd/mm/yyyy'; break;
        case 'e': cel.v = new ErreurFormule(c.w || ERR.VALEUR); break;
        default: cel.v = c.v ?? null;
      }
      if (cel.f) delete cel.v; // la valeur sera recalculée
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
    if (ws['!rows']) ws['!rows'].forEach((row, ri) => { if (!row) return; const px = row.hpx || (row.hpt ? Math.round(row.hpt / 0.75) : null); if (px) f.hauteurs[ri] = px; });
    if (ws['!merges']) f.fusions = ws['!merges'].map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
  });
  if (!classeur.feuilles.length) classeur.ajouterFeuille('Feuil1');
  // Noms définis
  if (wb.Workbook && wb.Workbook.Names) {
    for (const n of wb.Workbook.Names) {
      if (!n.Name || n.Name.startsWith('_xlnm.') || !n.Ref) continue;
      try { classeur.definirNom(n.Name, convertirFormule('=' + n.Ref, 'fr').slice(1)); } catch { /* nom non géré */ }
    }
  }
  // Macros
  if (macrosLignes.length) classeur.macros = macrosLignes.join('\n');
  if (wb.vbaraw) {
    classeur.vbaBrut = wb.vbaraw instanceof Uint8Array ? wb.vbaraw : new Uint8Array(wb.vbaraw);
    if (!classeur.macros) {
      try {
        const modules = extraireModulesVBA(XLSX.CFB, classeur.vbaBrut);
        classeur.macros = modules.filter((m) => m.code.trim()).map((m) => "' ===== Module " + m.nom + ' =====\n' + m.code.trim()).join('\n\n');
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
      ws[k] = o;
      if (r > r2) r2 = r;
      if (c > c2) c2 = c;
    });
    ws['!ref'] = 'A1:' + colVersLettres(Math.max(c2, 0)) + (Math.max(r2, 0) + 1);
    const cols = [];
    for (const [c, px] of Object.entries(f.largeurs)) cols[c] = px === 0 ? { hidden: true } : { wpx: px };
    if (cols.length) ws['!cols'] = cols;
    const rows = [];
    for (const [r, px] of Object.entries(f.hauteurs)) rows[r] = { hpx: px };
    if (rows.length) ws['!rows'] = rows;
    if (f.fusions.length) ws['!merges'] = f.fusions.map((m) => ({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }));
    XLSX.utils.book_append_sheet(wb, ws, f.nom);
    wb.Workbook.Sheets.push({ name: f.nom, Hidden: f.cachee ? 1 : 0 });
  });
  for (const d of classeur.noms.values()) wb.Workbook.Names.push({ Name: d.nom, Ref: convertirFormule('=' + d.ref, 'en').slice(1) });
  const macros = (classeur.macros || '').trim();
  if (macros) {
    const ws = {};
    const lignes = classeur.macros.replace(/\r\n?/g, '\n').split('\n');
    lignes.forEach((l, i) => { ws['A' + (i + 1)] = { t: 's', v: l }; });
    ws['!ref'] = 'A1:A' + lignes.length;
    XLSX.utils.book_append_sheet(wb, ws, FEUILLE_MACROS);
    wb.Workbook.Sheets.push({ name: FEUILLE_MACROS, Hidden: 2 });
  }
  let bookType = options.bookType || 'xlsx';
  if (classeur.vbaBrut && bookType === 'xlsm') wb.vbaraw = classeur.vbaBrut;
  if (bookType === 'csv') {
    const texte = XLSX.utils.sheet_to_csv(wb.Sheets[classeur.feuilles[classeur.active].nom], { FS: ';' });
    return new TextEncoder().encode('﻿' + texte);
  }
  const out = XLSX.write(wb, { bookType, type: 'array', compression: true });
  return new Uint8Array(out);
}

export { FEUILLE_MACROS };
