// Formes et zones de texte posées sur la feuille (sans DOM) : dessin SVG, réglages par défaut,
// correspondance avec les formes prédéfinies d'Excel (DrawingML, prstGeom).
//
// Une forme est rangée avec les images de la feuille (f.images), avec « forme » au lieu de « src » :
//   { id, forme, de, a | w, h, fond, trait, epaisseur, texte, couleurTexte, taille, gras, italique, souligne, police, align, valign }
//   forme  : texte (zone de texte) | rect | arrondi | ellipse | triangle | losange | fleche | ligne | etoile | bulle
//   fond, trait : couleur '#rrggbb' ou 'aucun' ; epaisseur : du trait, en px ; taille : du texte, en px (13 = 10 pt)
//   align : left | center | right ; valign : top | middle | bottom

export const FORMES = [
  ['texte', 'Zone de texte', '🅰'], ['rect', 'Rectangle', '▭'], ['arrondi', 'Rectangle arrondi', '▢'], ['ellipse', 'Ellipse', '◯'],
  ['triangle', 'Triangle', '△'], ['losange', 'Losange', '◇'], ['fleche', 'Flèche', '➜'], ['ligne', 'Trait', '╲'], ['etoile', 'Étoile', '☆'], ['bulle', 'Bulle', '💬'],
];
/** Formes prédéfinies d'Excel (a:prstGeom) */
export const PRST = { texte: 'rect', rect: 'rect', arrondi: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', losange: 'diamond', fleche: 'rightArrow', ligne: 'line', etoile: 'star5', bulle: 'wedgeRoundRectCallout' };
export const DEPUIS_PRST = { rect: 'rect', roundRect: 'arrondi', ellipse: 'ellipse', triangle: 'triangle', diamond: 'losange', rightArrow: 'fleche', line: 'ligne', straightConnector1: 'ligne', star5: 'etoile', wedgeRoundRectCallout: 'bulle', wedgeRectCallout: 'bulle', flowChartProcess: 'rect', flowChartAlternateProcess: 'arrondi' };

export const COULEURS_FORMES = ['#4472c4', '#ed7d31', '#70ad47', '#ffc000', '#5b9bd5', '#c00000', '#7030a0', '#ffffff', '#f2f2f2', '#000000'];

/** Réglages d'une nouvelle forme (taille en px à 100 %). */
export function nouvelleForme(forme) {
  if (forme === 'texte') return { forme, w: 200, h: 60, fond: '#ffffff', trait: '#595959', epaisseur: 1, texte: '', couleurTexte: '#000000', taille: 15, align: 'left', valign: 'top' };
  if (forme === 'ligne') return { forme, w: 160, h: 0, fond: 'aucun', trait: '#4472c4', epaisseur: 2, texte: '' };
  return { forme, w: forme === 'fleche' ? 150 : 140, h: forme === 'fleche' ? 70 : 90, fond: '#4472c4', trait: '#2f528f', epaisseur: 1, texte: '', couleurTexte: '#ffffff', taille: 15, align: 'center', valign: 'middle' };
}

const ech = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const peint = (c) => (!c || c === 'aucun' ? 'none' : c);

/** Contour SVG de la forme dans un rectangle w × h (px). */
function chemin(o, w, h, e) {
  const m = e / 2, W = Math.max(1, w - e), H = Math.max(1, h - e), x0 = m, y0 = m;
  switch (o.forme) {
    case 'ellipse': return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${W / 2}" ry="${H / 2}"/>`;
    case 'arrondi': { const r = Math.min(W, H) * 0.16; return `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${r}" ry="${r}"/>`; }
    case 'triangle': return `<polygon points="${w / 2},${y0} ${x0 + W},${y0 + H} ${x0},${y0 + H}"/>`;
    case 'losange': return `<polygon points="${w / 2},${y0} ${x0 + W},${h / 2} ${w / 2},${y0 + H} ${x0},${h / 2}"/>`;
    case 'fleche': { const pointe = Math.min(W * 0.45, H), t1 = y0 + H * 0.25, t2 = y0 + H * 0.75; return `<polygon points="${x0},${t1} ${x0 + W - pointe},${t1} ${x0 + W - pointe},${y0} ${x0 + W},${h / 2} ${x0 + W - pointe},${y0 + H} ${x0 + W - pointe},${t2} ${x0},${t2}"/>`; }
    case 'etoile': {
      const cx = w / 2, cy = h / 2, R = [W / 2, H / 2], r = [W * 0.19, H * 0.19], p = [];
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, q = k % 2 ? r : R; p.push((cx + q[0] * Math.cos(a)).toFixed(1) + ',' + (cy + q[1] * Math.sin(a)).toFixed(1)); }
      return `<polygon points="${p.join(' ')}"/>`;
    }
    case 'bulle': {
      const b = y0 + H * 0.75, r = Math.min(W, H) * 0.12;
      return `<path d="M${x0 + r},${y0} H${x0 + W - r} Q${x0 + W},${y0} ${x0 + W},${y0 + r} V${b - r} Q${x0 + W},${b} ${x0 + W - r},${b} H${x0 + W * 0.42} L${x0 + W * 0.2},${y0 + H} L${x0 + W * 0.26},${b} H${x0 + r} Q${x0},${b} ${x0},${b - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z"/>`;
    }
    case 'ligne': return o.inverse ? `<line x1="${x0}" y1="${h - m}" x2="${w - m}" y2="${m}"/>` : `<line x1="${x0}" y1="${m}" x2="${w - m}" y2="${h - m}"/>`;
    default: return `<rect x="${x0}" y="${y0}" width="${W}" height="${H}"/>`;
  }
}

/**
 * HTML d'une forme (SVG + texte) à la taille w × h ; z : zoom (épaisseur et texte suivent).
 * Le texte est dans .forme-texte, à part, pour être modifié en place.
 */
export function formeHTML(o, w, h, z = 1) {
  const e = o.trait === 'aucun' ? 0 : Math.max(0.5, (+o.epaisseur || 1) * z);
  const ligne = o.forme === 'ligne';
  const svg = `<svg class="forme-svg" width="${Math.max(1, w)}" height="${Math.max(1, h)}" viewBox="0 0 ${Math.max(1, w)} ${Math.max(1, h)}" style="position:absolute;left:0;top:0;overflow:visible" xmlns="http://www.w3.org/2000/svg">`
    + `<g fill="${ligne ? 'none' : peint(o.fond)}" stroke="${peint(o.trait)}" stroke-width="${e}" stroke-linejoin="round">${chemin(o, w, h, ligne ? 0 : e)}</g></svg>`;
  if (ligne) return svg;
  const vert = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[o.valign || 'middle'];
  const marge = (o.forme === 'ellipse' || o.forme === 'losange' ? 0.16 : o.forme === 'triangle' ? 0.22 : 0) * Math.min(w, h);
  const st = `position:absolute;inset:${Math.round(marge + 4 * z)}px;${o.forme === 'bulle' ? 'bottom:' + Math.round(h * 0.25 + 4 * z) + 'px;' : ''}display:flex;flex-direction:column;justify-content:${vert};align-items:stretch;text-align:${o.align || 'center'};`
    + `font-size:${(o.taille || 15) * z}px;color:${o.couleurTexte || '#000'};${o.gras ? 'font-weight:bold;' : ''}${o.italique ? 'font-style:italic;' : ''}${o.souligne ? 'text-decoration:underline;' : ''}${o.police ? 'font-family:' + ech(o.police) + ';' : ''}`
    + `white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden;line-height:1.25;`;
  return svg + `<div class="forme-texte" style="${st}"><div>${ech(o.texte || '')}</div></div>`;
}
