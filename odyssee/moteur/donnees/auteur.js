// odyssee/moteur/donnees/auteur.js — outils d'écriture des cartes : un bloc se dessine en texte (32 lignes de 32
// caractères), chaque caractère renvoie à une entrée de la légende (permission, comportement, sol, décor). Les
// bâtiments se posent par-dessus : leur emprise devient bloquée, leur porte un téléporteur. Le résultat est le format
// brut du moteur (tableaux de 32 × 32), comme ce qu'exporterait un éditeur de cartes.

import { BLOC, MB } from '../engine/const.js';

/** sols connus du rendu (indice = valeur stockée dans le bloc) */
export const SOLS = ['vide', 'herbe', 'herbe2', 'hautes_herbes', 'chemin', 'eau', 'sable', 'fleurs', 'parquet', 'mur', 'tapis',
  'glace', 'grotte', 'paroi', 'rebord', 'falaise', 'marches', 'pave', 'carrelage', 'ponton', 'eau_profonde', 'labo'];
const S = Object.fromEntries(SOLS.map((n, i) => [n, i]));

/** légende commune ; chaque zone peut en ajouter */
export const LEGENDE = {
  ' ': { col: 1, sol: 'vide' },
  '.': { sol: 'herbe' },
  ',': { sol: 'herbe2' },
  '"': { sol: 'hautes_herbes', mb: MB.HERBE },
  '=': { sol: 'chemin' },
  'P': { sol: 'pave' },
  'F': { sol: 'fleurs' },
  'S': { sol: 'sable' },
  '~': { sol: 'eau', mb: MB.EAU },
  'w': { sol: 'eau_profonde', mb: MB.EAU },
  'T': { col: 1, sol: 'herbe', decor: 'arbre' },
  'Y': { col: 1, sol: 'herbe', decor: 'pin' },
  'b': { col: 1, sol: 'herbe', decor: 'barriere' },
  'o': { col: 1, sol: 'herbe', decor: 'rocher' },
  'p': { col: 1, sol: 'herbe', decor: 'panneau' },
  'l': { col: 1, sol: 'pave', decor: 'boite' },
  'v': { sol: 'rebord', mb: MB.REBORD_BAS },
  '<': { sol: 'rebord', mb: MB.REBORD_GAUCHE },
  '>': { sol: 'rebord', mb: MB.REBORD_DROITE },
  '#': { col: 1, sol: 'falaise' },
  '^': { sol: 'marches', mb: MB.MARCHES },
  '_': { sol: 'ponton' },
  // intérieurs
  'W': { col: 1, sol: 'mur' },
  ':': { sol: 'parquet' },
  ';': { sol: 'carrelage' },
  'L': { sol: 'labo' },
  'm': { sol: 'tapis', mb: MB.TAPIS_BAS },
  'E': { sol: 'parquet', mb: MB.ESCALIER, decor: 'escalier' },
  'c': { col: 1, sol: 'parquet', mb: MB.COMPTOIR, decor: 'comptoir' },
  't': { col: 1, sol: 'parquet', decor: 'table' },
  'k': { col: 1, sol: 'parquet', decor: 'cuisine' },
  'B': { col: 1, sol: 'parquet', decor: 'lit' },
  'R': { col: 1, sol: 'parquet', decor: 'etagere' },
  'V': { col: 1, sol: 'parquet', decor: 'tele' },
  'M': { col: 1, sol: 'labo', decor: 'machine' },
  '|': { col: 1, sol: 'parquet' },   // suite d'un meuble de plusieurs cases (le dessin est sur la première)
  '!': { col: 1, sol: 'labo' },
  'O': { col: 1, sol: 'parquet', decor: 'pc' },
  'X': { col: 1, sol: 'labo', decor: 'etagere' },
  'Q': { col: 1, sol: 'labo', decor: 'table_balls' },
  // grottes
  'g': { sol: 'grotte' },
  'G': { col: 1, sol: 'paroi' },
  'I': { sol: 'glace', mb: MB.GLACE },
  'q': { col: 1, sol: 'grotte', decor: 'rocher' },
  'u': { sol: 'grotte', mb: MB.ESCALIER, decor: 'echelle' },
  'n': { sol: 'tapis', mb: MB.TAPIS_BAS },
};

/**
 * Construit un bloc à partir d'un plan.
 *   plan      : lignes de texte (32 au plus, complétées par du vide)
 *   hauteurs  : lignes de chiffres (optionnel ; une case sans chiffre = 0)
 *   legende   : caractères en plus
 *   batiments : [{ x, y, l, p, modele, toit, porte: dx }] — emprise bloquée, porte = case PORTE (dx depuis la gauche,
 *               sur la dernière rangée)
 *   decor     : décor posé à la main ({ type, x, y, … })
 */
export function bloc({ plan, hauteurs = [], legende = {}, batiments = [], decor = [] }) {
  const L = { ...LEGENDE, ...legende };
  const N = BLOC * BLOC;
  const col = new Array(N).fill(1), mb = new Array(N).fill(0), h = new Array(N).fill(0), sol = new Array(N).fill(0);
  const dec = [...decor];
  if (plan.length > BLOC) throw new Error(`plan de ${plan.length} lignes (32 au plus)`);
  for (let y = 0; y < BLOC; y++) {
    const ligne = plan[y] || '';
    if (ligne.length > BLOC) throw new Error(`ligne ${y} : ${ligne.length} caractères (32 au plus) : « ${ligne} »`);
    for (let x = 0; x < BLOC; x++) {
      const c = ligne[x] ?? ' ';
      const e = L[c];
      if (!e) throw new Error(`ligne ${y}, colonne ${x} : caractère « ${c} » absent de la légende`);
      const k = y * BLOC + x;
      col[k] = e.col ? 1 : 0;
      mb[k] = e.mb ?? 0;
      sol[k] = S[e.sol] ?? (() => { throw new Error(`sol inconnu ${e.sol}`); })();
      if (e.decor) dec.push({ type: e.decor, x, y });
      const hc = hauteurs[y]?.[x];
      if (hc && hc !== ' ' && hc !== '.') h[k] = Number(hc);
    }
  }
  for (const b of batiments) {
    for (let y = b.y; y < b.y + b.p; y++)
      for (let x = b.x; x < b.x + b.l; x++) { const k = y * BLOC + x; col[k] = 1; mb[k] = 0; }
    if (b.porte !== undefined) {
      const k = (b.y + b.p - 1) * BLOC + b.x + b.porte;
      col[k] = 0; mb[k] = MB.PORTE;
    }
    dec.push({ type: 'batiment', ...b });
  }
  return { col, mb, h, sol, decor: dec };
}

/** un monde d'un seul bloc (intérieur) */
export const mondeSimple = (bloc, zone) => ({ largeur: 1, hauteur: 1, blocs: [bloc], zones: [zone] });
