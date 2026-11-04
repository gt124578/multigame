// Fichiers texte (.csv, .tsv, .txt) : encodage, séparateur, lecture et écriture « à la française »
// (point-virgule, virgule décimale, UTF-8 avec BOM : ce qu'Excel en français attend).

/** Texte d'un fichier : UTF-8 (avec ou sans BOM), sinon Windows-1252 ; ou l'encodage demandé. */
export function decoderTexte(octets, encodage = 'auto') {
  const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (encodage === 'auto') {
    if (u8[0] === 0xff && u8[1] === 0xfe) return { texte: new TextDecoder('utf-16le').decode(u8.subarray(2)), encodage: 'utf-16le' };
    if (u8[0] === 0xfe && u8[1] === 0xff) return { texte: new TextDecoder('utf-16be').decode(u8.subarray(2)), encodage: 'utf-16be' };
    try { return { texte: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''), encodage: 'utf-8' }; }
    catch { return { texte: new TextDecoder('windows-1252').decode(u8), encodage: 'windows-1252' }; }
  }
  return { texte: new TextDecoder(encodage).decode(u8).replace(/^﻿/, ''), encodage };
}

/** Découpe un texte CSV (guillemets « " » doublés, retours à la ligne dans les champs). */
export function analyserCsv(texte, sep, max = Infinity) {
  const lignes = [];
  let ligne = [], champ = '', guil = false, i = 0;
  const n = texte.length;
  while (i < n && lignes.length < max) {
    const ch = texte[i];
    if (guil) {
      if (ch === '"') { if (texte[i + 1] === '"') { champ += '"'; i += 2; continue; } guil = false; i++; continue; }
      champ += ch; i++; continue;
    }
    if (ch === '"' && champ === '') { guil = true; i++; continue; }
    if (ch === sep) { ligne.push(champ); champ = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; i += ch === '\r' && texte[i + 1] === '\n' ? 2 : 1; continue; }
    champ += ch; i++;
  }
  if ((champ !== '' || ligne.length) && lignes.length < max) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

/** Séparateur le plus probable : celui qui donne le même nombre de colonnes (> 1) sur les premières lignes. */
export function detecterSeparateur(texte) {
  const extrait = texte.slice(0, 20000);
  let meilleur = ';', score = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const l = analyserCsv(extrait, sep, 30).filter((x) => x.length > 1 || x[0] !== '');
    if (!l.length) continue;
    const nb = l.map((x) => x.length), m = nb[0];
    if (m < 2) continue;
    const reg = nb.filter((x) => x === m).length / nb.length;
    const s = reg * 10 + Math.min(m, 20) / 20;
    if (s > score) { score = s; meilleur = sep; }
  }
  return meilleur;
}

/** Virgule décimale (12,5) ou point (12.5) : d'après les nombres qu'on trouve. */
export function detecterDecimale(lignes) {
  let virgule = 0, point = 0;
  for (const l of lignes.slice(0, 200)) for (const v of l) { const t = v.trim(); if (/^-?\d+,\d+$/.test(t)) virgule++; else if (/^-?\d+\.\d+$/.test(t)) point++; }
  return point > virgule ? '.' : ',';
}

/** Écrit une feuille en CSV : valeurs affichées, « ; » entre colonnes, guillemets si besoin. */
export function ecrireCsv(lignes, sep = ';') {
  const q = (v) => { const t = String(v ?? ''); return /["\r\n]/.test(t) || t.includes(sep) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return lignes.map((l) => l.map(q).join(sep)).join('\r\n') + '\r\n';
}
