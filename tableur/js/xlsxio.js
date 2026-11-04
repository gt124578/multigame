// Lecture et écriture de fichiers .xlsx / .xlsm / .csv avec SheetJS (passé en paramètre : window.XLSX ou require('xlsx')).

import { Classeur } from './classeur.js';
import { ErreurFormule, parseAdresse, colVersLettres, ERR, convertirFormule, adresse } from './formules.js';
import { extraireModulesVBA } from './vbaextract.js';
import { lireStylesXlsx, ecrireStylesXlsx, lireRichesXlsx } from './styles-xlsx.js';
import { lireObjetsXlsx } from './objets-xlsx.js';
import { lireVuesXlsx, ecrireVuesXlsx } from './vues-xlsx.js';
import { lireTableauxXlsx, ecrireTableauxXlsx } from './tableaux-xlsx.js';
import { lirePageXlsx, ecrirePageXlsx } from './page-xlsx.js';
import { ecrireOds, lireStylesOds } from './ods.js';
import { ecrireCsv } from './csv.js';
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
  // .ods : mise en forme, largeurs et hauteurs lues dans content.xml
  if (/\.ods$/i.test(nomFichier) || (wb.bookType === 'ods')) {
    try {
      for (const [nom, res] of lireStylesOds(XLSX, donnees)) {
        const f = classeur.feuille(nom); if (!f) continue;
        Object.assign(f.largeurs, res.largeurs); Object.assign(f.hauteurs, res.hauteurs);
        for (const [k, st0] of res.cellules) {
          const { _z, ...st } = st0; const [r, c] = k.split(',').map(Number); const cel = f.get(r, c);
          if (cel) { if (Object.keys(st).length) cel.s = { ...st, ...(cel.s || {}) }; if (_z) cel.z = _z; } else if (Object.keys(st).length || _z) f.set(r, c, { ...(Object.keys(st).length ? { s: { ...st } } : {}), ...(_z ? { z: _z } : {}) });
        }
        for (const [k, fo] of res.formules) { const [r, c] = k.split(',').map(Number); const cel = f.get(r, c); if (cel) cel.f = convertirFormule(fo, 'fr'); }
        f.recalculerZone();
      }
    } catch (e) { console.warn('Styles .ods non lus :', e); }
  }
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
  // Texte riche (une partie du texte d'une cellule en gras, en couleur…)
  if (donnees.length > 4 && donnees[0] === 0x50 && donnees[1] === 0x4b) {
    try {
      for (const [nom, m] of lireRichesXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nom); if (!f) continue;
        for (const [adr, runs] of m) { const a = parseAdresse(adr), cel = a && f.get(a.r, a.c); if (cel && typeof cel.v === 'string' && runs.map((x) => x.t).join('') === cel.v) cel.riche = runs; }
      }
    } catch (e) { console.warn('Texte riche non lu :', e); }
  }
  // Volets figés, filtre automatique, mise en forme conditionnelle
  if (donnees.length > 4 && donnees[0] === 0x50 && donnees[1] === 0x4b) {
    try {
      for (const [nom, v] of lireVuesXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nom);
        if (!f) continue;
        if (v.figer) f.figer = v.figer;
        if (v.zoom) f.zoom = v.zoom;
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
    try {
      for (const [nom, res] of lireTableauxXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nom);
        if (!f) continue;
        f.tableaux = res.tableaux;
        if (res.tablesDonnees.length) f.tablesDonnees = res.tablesDonnees;
        const t = res.tableaux.find((x) => x.entete !== false);
        if (t && !f.filtre) { f.filtre = { r1: t.r1, c1: t.c1, r2: t.totaux ? t.r2 - 1 : t.r2, c2: t.c2, criteres: {} }; f.filtrees = new Set(); }
      }
    } catch (e) { console.warn('Tableaux non lus :', e); }
    try {
      for (const [nom, res] of lirePageXlsx(XLSX, donnees)) {
        const f = classeur.feuille(nom);
        if (!f) continue;
        if (res.miseEnPage) f.miseEnPage = { ...(f.miseEnPage || {}), ...res.miseEnPage };
        if (res.protection) f.protection = res.protection;
        if (res.sparklines) f.sparklines = res.sparklines;
      }
    } catch (e) { console.warn('Mise en page non lue :', e); }
  }
  // Noms définis
  if (wb.Workbook && wb.Workbook.Names) {
    for (const n of wb.Workbook.Names) {
      if (/^_xlnm\.Print_(Area|Titles)$/i.test(n.Name || '') && n.Ref && n.Sheet !== undefined && n.Sheet !== null) {
        // Zone d'impression et titres à répéter
        const f = classeur.feuille(wb.SheetNames[n.Sheet]);
        if (f) {
          const parts = String(n.Ref).split(',').map((x) => x.replace(/^.*!/, '').replace(/\$/g, ''));
          const R = f.miseEnPage || (f.miseEnPage = {});
          if (/Area$/i.test(n.Name)) R.zone = parts.join(';');
          else for (const x of parts) { if (/^\d+:\d+$/.test(x)) R.titresLignes = x; else if (/^[A-Z]+:[A-Z]+$/i.test(x)) R.titresColonnes = x.toUpperCase(); }
        }
        continue;
      }
      if (!n.Name || n.Name.startsWith('_xlnm.') || !n.Ref) continue;
      if (/^solver_/i.test(n.Name)) { lireNomSolveur(classeur, wb, n); continue; }
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
  if (options.bookType === 'ods') return ecrireOds(XLSX, classeur);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Sheets: [], Names: [], CalcPr: { fullCalcOnLoad: true }, Views: [{ activeTab: classeur.active }] };
  classeur.feuilles.forEach((f, fi) => {
    const ws = {};
    let r2 = -1, c2 = -1;
    f.chaque((r, c, cel) => {
      const k = colVersLettres(c) + (r + 1);
      const o = {};
      let v = cel.f != null ? classeur.valeur(fi, r, c) : cel.v;
      if (cel.f != null) { const tb = cel.f.includes('[') && classeur.tableauEn(fi, r, c); o.f = convertirFormule(cel.f, 'en', tb ? { table: tb.t.nom } : {}).slice(1); }
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
  classeur.feuilles.forEach((f, i) => { if (f.solveur && f.solveur.objectif) wb.Workbook.Names.push(...nomsSolveur(f, i)); });
  classeur.feuilles.forEach((f, i) => {
    const R = f.miseEnPage;
    if (!R) return;
    const nf = /^[A-Za-z_][\w.]*$/.test(f.nom) ? f.nom : "'" + f.nom.replace(/'/g, "''") + "'";
    const abs = (x) => x.split(':').map((y) => y.replace(/^([A-Z]*)(\d*)$/i, (t, a, b) => (a ? '$' + a.toUpperCase() : '') + (b ? '$' + b : ''))).join(':');
    const zones = String(R.zone || '').split(/[;,]/).map((x) => x.replace(/\$/g, '').trim()).filter(Boolean);
    if (zones.length) wb.Workbook.Names.push({ Name: '_xlnm.Print_Area', Ref: zones.map((z) => nf + '!' + abs(z)).join(','), Sheet: i });
    const titres = [R.titresLignes, R.titresColonnes].map((x) => String(x || '').replace(/\$/g, '').trim()).filter(Boolean);
    if (titres.length) wb.Workbook.Names.push({ Name: '_xlnm.Print_Titles', Ref: titres.map((z) => nf + '!' + abs(z)).join(','), Sheet: i });
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
    // Comme Excel en français : valeurs affichées, « ; », virgule décimale, UTF-8 avec BOM
    const fi = classeur.active, f = classeur.feuilles[fi], lignes = [];
    for (let r = 0; r <= f.zone.r2; r++) { const l = []; for (let c = 0; c <= f.zone.c2; c++) l.push(classeur.texte(fi, r, c)); lignes.push(l); }
    return new TextEncoder().encode('\uFEFF' + ecrireCsv(lignes, options.separateur || ';'));
  }
  let out = new Uint8Array(XLSX.write(wb, { bookType, type: 'array', compression: true }));
  try { out = ecrireStylesXlsx(XLSX, out, classeur.feuilles); } catch (e) { console.warn('Styles non écrits :', e); }
  try { out = ecrireVuesXlsx(XLSX, out, classeur.feuilles); } catch (e) { console.warn('Volets, filtre ou mise en forme conditionnelle non écrits :', e); }
  if (bookType !== 'csv') try { out = ecrireTableauxXlsx(XLSX, out, classeur); } catch (e) { console.warn('Tableaux non écrits :', e); }
  if (bookType !== 'csv') try { out = ecrirePageXlsx(XLSX, out, classeur); } catch (e) { console.warn('Mise en page non écrite :', e); }
  if (bookType !== 'csv') try { out = ecrireGraphiquesXlsx(XLSX, out, classeur); } catch (e) { console.warn('Graphiques Excel non écrits :', e); }
  return out;
}

/** Lit les tableaux d'un document Word (.docx) : chaque tableau devient une feuille. */
// ----- Modèle du Solveur : noms cachés solver_* propres à la feuille, comme Excel -----
const REL_SOLVEUR = { '<=': 1, '=': 2, '>=': 3, ent: 4, bin: 5 };
function nomsSolveur(f, i) {
  const m = f.solveur, nf = /^[A-Za-z_][\w.]*$/.test(f.nom) ? f.nom : "'" + f.nom.replace(/'/g, "''") + "'";
  const abs = (t) => String(t || '').replace(/\$/g, '').toUpperCase().split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((x) => nf + '!' + x.split(':').map((y) => y.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')).join(':')).join(',');
  const out = [['solver_opt', abs(m.objectif)], ['solver_typ', { max: 1, min: 2, valeur: 3 }[m.but] || 1], ['solver_val', +String(m.valeur || 0).replace(',', '.') || 0], ['solver_adj', abs(m.variables)],
    ['solver_neg', m.positives === false ? 2 : 1], ['solver_eng', { gr: 1, simplexe: 2 }[m.methode] || 1], ['solver_ver', 3]];
  const ks = (m.contraintes || []).filter((k) => k.g);
  out.push(['solver_num', ks.length]);
  ks.forEach((k, j) => {
    out.push(['solver_lhs' + (j + 1), abs(k.g)], ['solver_rel' + (j + 1), REL_SOLVEUR[k.op] || 1]);
    out.push(['solver_rhs' + (j + 1), k.op === 'ent' ? '"integer"' : k.op === 'bin' ? '"binary"' : /^[A-Za-z]{1,3}\$?\d/.test(String(k.d).replace(/\$/g, '')) ? abs(k.d) : +String(k.d).replace(',', '.') || 0]);
  });
  return out.filter(([, v]) => v !== '').map(([Name, v]) => ({ Name, Ref: String(v), Sheet: i, Hidden: true }));
}
function lireNomSolveur(classeur, wb, n) {
  const f = n.Sheet !== undefined && n.Sheet !== null ? classeur.feuille(wb.SheetNames[n.Sheet]) : classeur.feuilles[0];
  if (!f) return;
  const m = f.solveur || (f.solveur = { objectif: '', but: 'max', valeur: '0', variables: '', contraintes: [], positives: true, methode: 'auto' });
  const local = (r) => String(r).split(',').map((x) => x.replace(/^.*!/, '').replace(/\$/g, '')).join(';');
  const k = n.Name.toLowerCase(), v = String(n.Ref).replace(/^=/, '');
  const num = /\d+$/.exec(k), j = num ? +num[0] - 1 : -1;
  const ligne = () => (m.contraintes[j] = m.contraintes[j] || { g: '', op: '<=', d: '' });
  if (k === 'solver_opt') m.objectif = local(v);
  else if (k === 'solver_adj') m.variables = local(v);
  else if (k === 'solver_typ') m.but = { 1: 'max', 2: 'min', 3: 'valeur' }[+v] || 'max';
  else if (k === 'solver_val') m.valeur = String(+v || 0).replace('.', ',');
  else if (k === 'solver_neg') m.positives = +v !== 2;
  else if (k === 'solver_eng') m.methode = +v === 2 ? 'simplexe' : 'auto';
  else if (/^solver_lhs\d+$/.test(k)) ligne().g = local(v);
  else if (/^solver_rel\d+$/.test(k)) ligne().op = { 1: '<=', 2: '=', 3: '>=', 4: 'ent', 5: 'bin' }[+v] || '<=';
  else if (/^solver_rhs\d+$/.test(k)) ligne().d = /^"/.test(v) ? '' : /!/.test(v) ? local(v) : String(+v).replace('.', ',');
}

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
