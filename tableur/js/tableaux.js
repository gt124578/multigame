// Styles des tableaux structurés (Ctrl+L), aux noms d'Excel (TableStyleMedium2…) pour que le fichier garde le même rendu.
// Sans DOM.

// Couleurs des thèmes Office : accent 1 à 6 et leur teinte claire (lignes à bandes)
const ACCENTS = [
  ['#000000', '#d9d9d9'], ['#4472c4', '#d9e1f2'], ['#ed7d31', '#fce4d6'], ['#a5a5a5', '#ededed'],
  ['#ffc000', '#fff2cc'], ['#5b9bd5', '#ddebf7'], ['#70ad47', '#e2efda'],
];

/** Styles proposés : 7 clairs à en-tête plein, 7 moyens, 7 clairs à bandes. */
export const STYLES_TABLEAU = [
  ...ACCENTS.map((_, i) => 'TableStyleMedium' + (i + 1)),
  ...ACCENTS.map((_, i) => 'TableStyleLight' + (i + 8)),
  ...ACCENTS.map((_, i) => 'TableStyleLight' + (i + 15)),
];

/** Description d'un style : { genre: 'moyen'|'plein'|'leger', accent, bande } */
export function styleTableau(nom) {
  const m = /^TableStyle(Medium|Light|Dark)(\d+)$/.exec(nom || '');
  if (!m) return { genre: 'moyen', accent: ACCENTS[6][0], bande: ACCENTS[6][1] };
  const n = +m[2];
  if (m[1] === 'Medium') { const [accent, bande] = ACCENTS[(n - 1) % 7]; return { genre: 'moyen', accent, bande }; }
  if (m[1] === 'Dark') { const [accent] = ACCENTS[(n - 1) % 7]; return { genre: 'sombre', accent, bande: '#595959' }; }
  if (n >= 15) { const [accent, bande] = ACCENTS[(n - 15) % 7]; return { genre: 'leger', accent, bande }; }
  if (n >= 8) { const [accent, bande] = ACCENTS[(n - 8) % 7]; return { genre: 'plein', accent, bande }; }
  const [accent, bande] = ACCENTS[(n - 1) % 7];
  return { genre: 'leger', accent, bande };
}

/** Style d'une cellule d'après le tableau qui la contient (la mise en forme propre à la cellule passe par-dessus). */
export function styleCelluleTableau(t, r, c, st = styleTableau(t.style)) {
  const entete = t.entete !== false && r === t.r1;
  const total = t.totaux && r === t.r2;
  const premiere = t.entete === false ? t.r1 : t.r1 + 1;
  const s = {};
  if (entete) {
    s.gras = true;
    if (st.genre === 'leger') s.bordures = { b: 'thin' };
    else { s.fond = st.accent; s.couleur = '#ffffff'; }
    s.bordCouleur = st.accent;
    return s;
  }
  if (total) { s.gras = true; s.bordures = { h: 'medium' }; s.bordCouleur = st.accent; if (st.genre === 'sombre') { s.fond = '#262626'; s.couleur = '#ffffff'; } return s; }
  const bande = t.bandes !== false && (r - premiere) % 2 === 0;
  if (st.genre === 'sombre') { s.fond = bande ? '#737373' : '#595959'; s.couleur = '#ffffff'; }
  else if (st.genre === 'plein') { s.bordures = { h: 'thin', b: 'thin' }; s.bordCouleur = st.accent; if (bande) s.fond = st.bande; }
  else if (bande) s.fond = st.bande;
  if (st.genre === 'moyen' && r === t.r2) { s.bordures = { b: 'thin' }; s.bordCouleur = st.accent; }
  if (t.premiereColonne && c === t.c1) s.gras = true;
  if (t.derniereColonne && c === t.c2) s.gras = true;
  return Object.keys(s).length ? s : null;
}

/** Aperçu d'un style (petit dessin SVG pour la galerie). */
export function apercuStyle(nom) {
  const st = styleTableau(nom), w = 46, h = 34, lh = h / 5;
  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#fff"/>`;
  for (let i = 0; i < 5; i++) {
    const y = i * lh;
    const s = styleCelluleTableau({ r1: 0, r2: 4, c1: 0, c2: 2, bandes: true, style: nom }, i, 0, st) || {};
    if (s.fond) svg += `<rect y="${y}" width="${w}" height="${lh}" fill="${s.fond}"/>`;
    if (s.bordures && s.bordures.b) svg += `<rect y="${y + lh - 1}" width="${w}" height="1" fill="${s.bordCouleur}"/>`;
    if (s.bordures && s.bordures.h) svg += `<rect y="${y}" width="${w}" height="1" fill="${s.bordCouleur}"/>`;
    for (let k = 0; k < 3; k++) svg += `<rect x="${3 + k * 15}" y="${y + lh / 2 - 1}" width="10" height="2" fill="${i === 0 && st.genre !== 'leger' ? '#fff' : s.couleur || '#555'}" opacity=".7"/>`;
  }
  svg += `<rect width="${w}" height="${h}" fill="none" stroke="${st.accent}" stroke-width="${st.genre === 'leger' ? 1 : 0}"/></svg>`;
  return svg;
}
