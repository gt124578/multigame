// Graphiques du Tableur : rendu SVG (sans DOM) d'une plage de données.
// Types : barres, barres-empilees, courbes, aires, secteurs, anneau, nuage.
//
// spec : { type, titre, legende: true|false }
// donnees : matrice (valeurs déjà calculées). Première ligne = noms des séries si ce sont des textes,
// première colonne = catégories si ce sont des textes (ou les X pour un nuage).

const COULEURS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4b5563'];
const ech = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const TYPES_GRAPHIQUE = { barres: 'Barres', 'barres-empilees': 'Barres empilées', courbes: 'Courbes', aires: 'Aires', secteurs: 'Secteurs', anneau: 'Anneau', nuage: 'Nuage de points' };

/** Sépare en-têtes, catégories et séries numériques. */
export function preparerDonnees(m, type) {
  m = (m || []).map((l) => [...l]);
  if (!m.length || !m[0].length) return { series: [], categories: [] };
  const estTexte = (v) => typeof v === 'string' && v !== '';
  const nb = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : null);
  const enteteLigne = m[0].slice(m[0].length > 1 ? 1 : 0).some(estTexte) && m.length > 1;
  let enteteCol = m.length > (enteteLigne ? 1 : 0) && m.slice(enteteLigne ? 1 : 0).some((l) => estTexte(l[0])) && m[0].length > 1;
  // Première colonne d'entiers strictement croissants sous un en-tête (années, numéros) : des catégories, pas une série
  if (!enteteCol && enteteLigne && m[0].length > 1 && type !== 'nuage') {
    const col = m.slice(1).map((l) => l[0]);
    if (col.length >= 2 && col.every((v) => typeof v === 'number' && Number.isInteger(v)) && col.every((v, i) => i === 0 || v > col[i - 1])) enteteCol = true;
  }
  const corps = m.slice(enteteLigne ? 1 : 0);
  const categories = corps.map((l, i) => (enteteCol ? String(l[0] ?? '') : String(i + 1)));
  const debut = enteteCol ? 1 : 0;
  const noms = [];
  for (let c = debut; c < m[0].length; c++) noms.push(enteteLigne ? String(m[0][c] ?? '') : 'Série ' + (c - debut + 1));
  let series = noms.map((nom, k) => ({ nom, valeurs: corps.map((l) => nb(l[debut + k])) }));
  if (type === 'nuage') {
    // Première série = X ; sans en-tête de colonne, la première colonne numérique sert de X
    let xs;
    if (enteteCol) { xs = corps.map((l) => nb(l[0])); if (xs.every((x) => x === null)) xs = corps.map((_, i) => i + 1); }
    else if (series.length >= 2) { xs = series[0].valeurs; series = series.slice(1); }
    else xs = corps.map((_, i) => i + 1);
    return { series, categories, xs, nuage: true };
  }
  return { series, categories };
}

function echelle(min, max) {
  if (min === max) { max = min + 1; min = min - 1; }
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  const brut = (max - min) / 6;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= brut) || p * 10;
  return { min: Math.floor(min / pas) * pas, max: Math.ceil(max / pas) * pas, pas };
}

const fmt = (v) => {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k';
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
};

/** Rend le graphique en SVG (chaîne). */
export function rendreGraphiqueSVG(spec, matrice, largeur = 420, hauteur = 260) {
  const type = TYPES_GRAPHIQUE[spec.type] ? spec.type : 'barres';
  const d = preparerDonnees(matrice, type);
  const W = Math.max(120, largeur), H = Math.max(80, hauteur);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, system-ui, sans-serif" font-size="11">`;
  svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;
  let haut = 8;
  if (spec.titre) { svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">${ech(spec.titre)}</text>`; haut = 28; }
  if (!d.series.length || !d.series.some((s) => s.valeurs.some((v) => v !== null))) {
    return svg + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#6b7280">Aucune donnée numérique dans la plage</text></svg>`;
  }
  const legende = spec.legende !== false && (d.series.length > 1 || type === 'secteurs' || type === 'anneau');
  let largeurLegende = 0;
  if (legende) {
    const items = type === 'secteurs' || type === 'anneau' ? d.categories : d.series.map((s) => s.nom);
    largeurLegende = Math.min(W * 0.35, Math.max(...items.map((t) => t.length)) * 6.5 + 26);
    const lx = W - largeurLegende + 4;
    items.slice(0, 20).forEach((t, i) => {
      const y = haut + 6 + i * 16;
      if (y > H - 10) return;
      svg += `<rect x="${lx}" y="${y}" width="10" height="10" rx="2" fill="${COULEURS[i % COULEURS.length]}"/><text x="${lx + 15}" y="${y + 9}" fill="#374151">${ech(t.length > 24 ? t.slice(0, 23) + '…' : t)}</text>`;
    });
  }
  const zone = { x: 44, y: haut + 6, w: W - 44 - 10 - largeurLegende, h: H - haut - 6 - 28 };

  if (type === 'secteurs' || type === 'anneau') {
    const s = d.series[0];
    const total = s.valeurs.reduce((a, v) => a + Math.max(0, v || 0), 0);
    const cx = zone.x + zone.w / 2 - 20, cy = zone.y + zone.h / 2 + 10, R = Math.max(20, Math.min(zone.w, zone.h) / 2 - 4);
    const r0 = type === 'anneau' ? R * 0.55 : 0;
    let a = -Math.PI / 2;
    s.valeurs.forEach((v, i) => {
      const part = total ? Math.max(0, v || 0) / total : 0;
      if (!part) return;
      const a2 = a + part * 2 * Math.PI;
      const grand = part > 0.5 ? 1 : 0;
      const p = (ang, r) => `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
      const chemin = part >= 0.9999
        ? `M ${p(a, R)} A ${R} ${R} 0 1 1 ${p(a + Math.PI, R)} A ${R} ${R} 0 1 1 ${p(a, R)} ${r0 ? `M ${p(a, r0)} A ${r0} ${r0} 0 1 0 ${p(a + Math.PI, r0)} A ${r0} ${r0} 0 1 0 ${p(a, r0)}` : ''} Z`
        : `M ${p(a, r0)} L ${p(a, R)} A ${R} ${R} 0 ${grand} 1 ${p(a2, R)} L ${p(a2, r0)} ${r0 ? `A ${r0} ${r0} 0 ${grand} 0 ${p(a, r0)}` : ''} Z`;
      svg += `<path d="${chemin}" fill="${COULEURS[i % COULEURS.length]}" stroke="#fff" stroke-width="1.5" fill-rule="evenodd"><title>${ech(d.categories[i])} : ${fmt(v)} (${(part * 100).toFixed(1)} %)</title></path>`;
      if (part > 0.04) { const am = (a + a2) / 2, rl = (R + r0) / 2 + (r0 ? 0 : R * 0.15); svg += `<text x="${cx + rl * Math.cos(am)}" y="${cy + rl * Math.sin(am) + 4}" text-anchor="middle" fill="#fff" font-size="10" font-weight="600">${(part * 100).toFixed(0)} %</text>`; }
      a = a2;
    });
    return svg + '</svg>';
  }

  // Axes
  const empile = type === 'barres-empilees' || type === 'aires';
  let min = Infinity, max = -Infinity;
  const nbCat = d.series[0].valeurs.length;
  if (empile) {
    for (let i = 0; i < nbCat; i++) { let pos = 0, neg = 0; for (const s of d.series) { const v = s.valeurs[i] || 0; if (v >= 0) pos += v; else neg += v; } min = Math.min(min, neg); max = Math.max(max, pos); }
  } else for (const s of d.series) for (const v of s.valeurs) if (v !== null) { min = Math.min(min, v); max = Math.max(max, v); }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  const ey = echelle(min, max);
  const yDe = (v) => zone.y + zone.h - ((v - ey.min) / (ey.max - ey.min)) * zone.h;
  let xMin = 0, xMax = nbCat, ex = null;
  if (d.nuage) { const xs = d.xs.filter((x) => x !== null); xMin = Math.min(...xs); xMax = Math.max(...xs); ex = echelle(xMin === xMax ? xMin - 1 : xMin, xMax === xMin ? xMax + 1 : xMax); if (xMin >= 0 && ex.min < 0) ex.min = 0; }
  const xDe = (x) => (d.nuage ? zone.x + ((x - ex.min) / (ex.max - ex.min)) * zone.w : zone.x + ((x + 0.5) / nbCat) * zone.w);
  // Grille et graduations Y
  for (let v = ey.min; v <= ey.max + 1e-9; v += ey.pas) {
    const y = yDe(v);
    svg += `<line x1="${zone.x}" y1="${y}" x2="${zone.x + zone.w}" y2="${y}" stroke="${Math.abs(v) < 1e-12 ? '#9ca3af' : '#e5e7eb'}"/><text x="${zone.x - 4}" y="${y + 4}" text-anchor="end" fill="#6b7280" font-size="10">${fmt(v)}</text>`;
  }
  // Graduations X
  if (d.nuage) {
    for (let v = ex.min; v <= ex.max + 1e-9; v += ex.pas) { const x = xDe(v); svg += `<line x1="${x}" y1="${zone.y}" x2="${x}" y2="${zone.y + zone.h}" stroke="#f3f4f6"/><text x="${x}" y="${zone.y + zone.h + 14}" text-anchor="middle" fill="#6b7280" font-size="10">${fmt(v)}</text>`; }
  } else {
    const pas = Math.max(1, Math.ceil(nbCat / Math.max(1, Math.floor(zone.w / 48))));
    d.categories.forEach((cat, i) => { if (i % pas) return; const x = xDe(i); svg += `<text x="${x}" y="${zone.y + zone.h + 14}" text-anchor="middle" fill="#6b7280" font-size="10">${ech(cat.length > 12 ? cat.slice(0, 11) + '…' : cat)}</text>`; });
  }
  svg += `<line x1="${zone.x}" y1="${zone.y}" x2="${zone.x}" y2="${zone.y + zone.h}" stroke="#9ca3af"/>`;
  const y0 = yDe(0);
  if (type === 'barres' || type === 'barres-empilees') {
    const n = empile ? 1 : d.series.length;
    const largeurGroupe = zone.w / nbCat * 0.72, lb = largeurGroupe / n;
    const cumul = new Array(nbCat).fill(0), cumulNeg = new Array(nbCat).fill(0);
    d.series.forEach((s, k) => {
      s.valeurs.forEach((v, i) => {
        if (v === null) return;
        let y1, y2;
        if (empile) { if (v >= 0) { y1 = yDe(cumul[i] + v); y2 = yDe(cumul[i]); cumul[i] += v; } else { y1 = yDe(cumulNeg[i]); y2 = yDe(cumulNeg[i] + v); cumulNeg[i] += v; } }
        else { y1 = Math.min(yDe(v), y0); y2 = Math.max(yDe(v), y0); }
        const x = xDe(i) - largeurGroupe / 2 + (empile ? 0 : k * lb);
        svg += `<rect x="${x}" y="${y1}" width="${Math.max(1, lb - 1)}" height="${Math.max(0.5, y2 - y1)}" fill="${COULEURS[k % COULEURS.length]}" rx="1"><title>${ech(s.nom)} — ${ech(d.categories[i])} : ${fmt(v)}</title></rect>`;
      });
    });
  } else if (type === 'courbes' || type === 'aires' || type === 'nuage') {
    const cumul = new Array(nbCat).fill(0);
    d.series.forEach((s, k) => {
      const pts = [];
      s.valeurs.forEach((v, i) => {
        if (v === null) return;
        const x = d.nuage ? (d.xs[i] === null ? null : xDe(d.xs[i])) : xDe(i);
        if (x === null) return;
        const yv = type === 'aires' ? cumul[i] + v : v;
        if (type === 'aires') cumul[i] += v;
        pts.push([x, yDe(yv), v, i, yv]);
      });
      if (!pts.length) return;
      const couleur = COULEURS[k % COULEURS.length];
      if (d.nuage) pts.sort((a, b) => a[0] - b[0]);
      const trace = pts.map((p) => p[0] + ',' + p[1]).join(' ');
      if (type === 'aires') svg += `<polygon points="${pts[0][0]},${yDe(type === 'aires' ? pts[0][4] - pts[0][2] : 0)} ${trace} ${pts[pts.length - 1][0]},${y0}" fill="${couleur}" fill-opacity="0.25"/>`;
      if (type !== 'nuage' || spec.lignes) svg += `<polyline points="${trace}" fill="none" stroke="${couleur}" stroke-width="2" stroke-linejoin="round"/>`;
      for (const p of pts) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="${type === 'nuage' ? 3.5 : 2.5}" fill="${couleur}"><title>${ech(s.nom)} — ${d.nuage ? fmt(d.xs[p[3]]) : ech(d.categories[p[3]])} : ${fmt(p[2])}</title></circle>`;
    });
  }
  return svg + '</svg>';
}
