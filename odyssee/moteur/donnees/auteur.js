// odyssee/moteur/donnees/auteur.js — outils d'écriture des cartes : un bloc se dessine en texte (32 lignes de 32
// caractères), chaque caractère renvoie à une entrée de la légende (permission, comportement, sol, décor). Les
// bâtiments se posent par-dessus : leur emprise devient bloquée, leur porte un téléporteur. Le résultat est le format
// brut du moteur (tableaux de 32 × 32), comme ce qu'exporterait un éditeur de cartes.

import { BLOC, MB } from '../engine/const.js';

/** sols connus du rendu (indice = valeur stockée dans le bloc) */
export const SOLS = ['vide', 'herbe', 'herbe2', 'hautes_herbes', 'chemin', 'eau', 'sable', 'fleurs', 'parquet', 'mur', 'tapis',
  'glace', 'grotte', 'paroi', 'rebord', 'falaise', 'marches', 'pave', 'carrelage', 'ponton', 'eau_profonde', 'labo',
  // ajoutés ensuite (toujours à la fin : les blocs stockent l'indice)
  'sol_centre', 'sol_boutique', 'plancher', 'neige', 'mur_centre', 'mur_boutique', 'mur_labo', 'mur_glace', 'rebord_g', 'rebord_d'];
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
  'A': { col: 1, sol: 'herbe', decor: 'baies' },        // arbre à baies (son panneau est ajouté par la zone)
  'H': { col: 1, sol: 'herbe', decor: 'haie' },
  'l': { col: 1, sol: 'pave', decor: 'boite' },
  'v': { sol: 'rebord', mb: MB.REBORD_BAS },
  '<': { sol: 'rebord_g', mb: MB.REBORD_GAUCHE },
  '>': { sol: 'rebord_d', mb: MB.REBORD_DROITE },
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
 * Légendes des intérieurs dessinés comme dans HGSS : `W` le mur (papier peint du lieu, seul le mur du fond se dresse),
 * `.` le sol du lieu, `m` le tapis de sortie, `E` un escalier (téléporteur), `#` une case bloquée sous un meuble.
 * Les meubles eux-mêmes (modèles de HGSS) se posent avec `meubles` : leur emprise devient bloquée.
 */
export const piecesHGSS = (sol, mur, plus = {}) => ({
  'W': { col: 1, sol: mur }, '.': { sol }, 'm': { sol, mb: MB.TAPIS_BAS }, 'E': { sol, mb: MB.ESCALIER },
  '#': { col: 1, sol }, ' ': { col: 1, sol: 'vide' }, ...plus,
});

/**
 * Construit un bloc à partir d'un plan.
 *   plan      : lignes de texte (32 au plus, complétées par du vide)
 *   hauteurs  : lignes de chiffres (optionnel ; une case sans chiffre = 0)
 *   legende   : caractères en plus
 *   batiments : [{ x, y, l, p, modele, toit, porte: dx }] — emprise bloquée, porte = case PORTE (dx depuis la gauche,
 *               sur la dernière rangée)
 *   decor     : décor posé à la main ({ type, x, y, … })
 *   meubles   : [{ m, x, y, l, p, mur, libre, repli }] — un modèle de l'archive des meubles de HGSS posé sur l'emprise
 *               (l × p cases, coin nord-ouest en x, y) ; l'emprise est bloquée, sauf `libre` (tapis, coussins) et `mur`
 *               (accroché au mur du fond : fenêtre, horloge…) ; `repli` : le dessin d'Odyssée si le modèle manque
 *   caisses   : [{ x, y, l, p, haut, couleurs, comptoir }] — comptoirs bâtis (bloqués ; `comptoir` : on parle par-dessus)
 */
export function bloc({ plan, hauteurs = [], legende = {}, batiments = [], decor = [], meubles = [], caisses = [], strict = false }) {
  const L = { ...LEGENDE, ...legende };
  const N = BLOC * BLOC;
  const col = new Array(N).fill(1), mb = new Array(N).fill(0), h = new Array(N).fill(0), sol = new Array(N).fill(0);
  const dec = [...decor];
  if (plan.length > BLOC || (strict && plan.length !== BLOC)) throw new Error(`plan de ${plan.length} lignes (${strict ? 'exactement' : 'au plus'} 32)`);
  for (let y = 0; y < BLOC; y++) {
    const ligne = plan[y] || '';
    if (ligne.length > BLOC || (strict && ligne.length !== BLOC)) throw new Error(`ligne ${y} : ${ligne.length} caractères (${strict ? 'exactement' : 'au plus'} 32) : « ${ligne} »`);
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
  for (const m of meubles) {
    if (!m.mur && !m.libre)
      for (let y = m.y; y < m.y + (m.p ?? 1); y++) for (let x = m.x; x < m.x + (m.l ?? 1); x++) col[y * BLOC + x] = 1;
    dec.push({ type: 'meuble', ...m });
  }
  for (const c of caisses) {
    for (let y = c.y; y < c.y + (c.p ?? 1); y++) for (let x = c.x; x < c.x + (c.l ?? 1); x++) {
      const k = y * BLOC + x; col[k] = 1; if (c.comptoir) mb[k] = MB.COMPTOIR;
    }
    dec.push({ type: 'caisse', ...c });
  }
  return { col, mb, h, sol, decor: dec };
}

/** un monde d'un seul bloc (intérieur) */
export const mondeSimple = (bloc, zone) => ({ largeur: 1, hauteur: 1, blocs: [bloc], zones: [zone] });
