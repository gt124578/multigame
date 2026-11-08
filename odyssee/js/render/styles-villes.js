// odyssee/js/render/styles-villes.js — une architecture par ville pour les maisons ordinaires (le Centre, la boutique,
// l'arène et les bâtiments remarquables déjà modélisés gardent leur modèle). Chaque style donne plusieurs types de
// maisons, chacun avec ses variantes (toit, couleurs, cheminée, volets, avancée, ornements) ; la maison d'une case
// donnée est tirée de sa position, toujours la même d'une partie à l'autre. Les modèles sont construits par
// « maisonVille » (maisons-villes.js) à la taille exacte de l'emprise de la maison qu'ils remplacent.

/** style de chaque ville (identifiant de la ville dans les zones de la carte) */
export const VILLE_STYLE = {
  aube: 'aube', sylve: 'sylve', pierre: 'pierre', azur: 'azur', volta: 'volta', flora: 'flora', mirage: 'mirage',
  granit: 'granit', cendre: 'cendre', ecaille: 'ecaille', cime: 'cime', plateau: 'plateau', metro: 'metro',
  lisiere: 'lisiere', marais: 'marais', dunes: 'dunes', forge: 'forge', rose: 'rose', ombre: 'ombre',
  // petits lieux habités
  orage: 'azur', givre: 'cime', grue: 'mirage', kagura: 'mirage',
};

/** tirage stable à partir d'une graine (nombre) */
function tireur(g) {
  return (k, n) => {
    let h = (g * 374761393 + k * 668265263 + 0x2f6b) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0;
    return n === undefined ? h / 4294967296 : h % n;
  };
}
const graine = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
/** nombre de variantes par style et par emprise : chaque variante est un modèle construit une fois et partagé par toutes
 *  les maisons qui la tirent (mémoire et temps de pose comparables aux anciens modèles) */
export const NVAR = 4;
const un = (r, k, L) => L[r(k, L.length)];
const FLEURS = [['#f05a6a', '#fafaf2'], ['#f8d850', '#fafaf2'], ['#f05a6a', '#f8d850', '#fafaf2'], ['#e070c0', '#fafaf2'], ['#f08040', '#f8d850']];

/** gabarit commun : profondeur, recul, niveaux, annexe selon l'emprise */
function gabarit(F, { et = [1, 2], annexe = true, haut = false } = {}) {
  const { w, d, r } = F;
  const g = { prof: d, recul: 0, et: 1 };
  if (d >= 5) { g.prof = 3.6 + r(31, 3) * 0.2; g.recul = r(32, 2) * 0.3; }
  else if (d === 4 && w <= 4) g.prof = 3.6;
  // niveaux : les grandes emprises (6 × 4, 4 × 4, 5 × 5) montent plus haut
  const big = (w >= 6 && d >= 4) || (w === 4 && d === 4) || d >= 5;
  g.et = big ? et[et.length - 1] : et[r(33, et.length)];
  if (haut && w === 4 && d === 4) g.et = Math.max(g.et, 3);
  if (annexe && w >= 7) g.annexe = { cote: F.px < w / 2 ? 'd' : 'g', w: 2 };
  return g;
}

/* ===================================================================================================================
 * les styles. Un type : [poids, (F) => réglages]. F : { w, d, px, r } (emprise, milieu de la porte, tirage)
 * =================================================================================================================== */
export const STYLES = {
  /** Bourg-Aube : village de départ, campagne douce — colombages, enduits crème, pierre claire, tuiles rouges */
  aube: {
    nom: 'Village de campagne',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'colombage', c: un(r, 1, ['#f4ead2', '#f2e2c4', '#f6eee0']), c2: un(r, 2, ['#5a3a26', '#6a4430', '#4a3020']) }, toit: { f: '2p', m: 'canal', c: un(r, 3, ['#c05a40', '#b8603a', '#a84a32']), hr: 1.3 }, fen: { volets: un(r, 4, ['#3a6a5a', '#6a8a4a', '#8a4a2a']), fleurs: un(r, 5, FLEURS), rideau: '#f0d8b0' }, chem: [[un(r, 6, [0.2, 0.8]), '#b87a62']], lucarnes: r(7, 2), av: un(r, 8, ['auvent', 'auvent', 'porche', null]), orn: un(r, 9, [['pots'], ['banc'], ['pots', 'velo'], []]) })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#f2e6c8', '#efe0c4', '#f4ecd8']) }, chaine: '#d0c6b4', toit: { f: '2p', m: 'tuiles', c: un(r, 3, ['#c05a40', '#b85a3a', '#a8503a']), hr: 1.3 }, fen: { volets: un(r, 4, ['#4a7a9a', '#3a6a5a', '#a85a3a']), fleurs: un(r, 5, FLEURS) }, chem: [[un(r, 6, [0.25, 0.75]), '#b87a62']], av: un(r, 8, ['auvent', 'pergola', null]), orn: un(r, 9, [['pots'], ['lierre'], []]) })],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'pierre', c: un(r, 1, ['#d8ccb4', '#cdbfa8']) }, toit: { f: '2p', m: 'canal', c: un(r, 3, ['#b0583c', '#c06a48']), hr: 1.25 }, fen: { volets: un(r, 4, ['#6a8a5a', '#5a7a9a']), fleurs: un(r, 5, FLEURS) }, chem: [[0.2, '#a89a84']], av: 'auvent', orn: ['bucher'] })],
    ],
    mL: (r) => ({ toit: un(r, 1, ['#b85a3a', '#c05a40']), colombage: r(2, 2) === 0, mur: '#f2e6c8' }),
  },

  /** Sylvebourg : la forêt — chalets de bois, maisons de rondins, toits de bardeaux moussus */
  sylve: {
    nom: 'Chalets de la forêt',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), socle: 0.2, mur: { t: 'pierre', c: un(r, 1, ['#a8a49a', '#9a968c']) }, haut: { t: 'bardage', c: un(r, 2, ['#8a5a34', '#9a6a3a', '#6a4428', '#a8784a']) }, bandeau: '#5a3a20', toit: { f: 'rue', m: 'bardeaux', c: un(r, 3, ['#5a4a40', '#4a4038', '#5a5040']), hr: 1.0, deb: 0.7, faite: '#3a2a20' }, fen: { volets: un(r, 4, ['#6a8a3a', '#a83a2a', '#3a5a3a']), fleurs: un(r, 5, [['#e83a3a', '#f05a6a', '#fafaf2'], ['#e83a3a', '#fafaf2']]), cadre: '#e8dcc0' }, av: un(r, 6, ['galerie', 'galerie', 'auvent']), bois: '#7a4a2a', chem: [[0.7, '#9a948a']], orn: un(r, 7, [['bucher'], ['bucher', 'banc'], ['lanternes']]).filter((k) => k !== 'lanternes') })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), socle: 0.15, mur: { t: 'rondins', c: un(r, 1, ['#7a5232', '#8a6040', '#6a4a2e']) }, toit: { f: '2p', m: 'bardeaux', c: un(r, 3, ['#5a6a40', '#4a5a3a', '#5a4a3a']), hr: 1.15, deb: 0.45, faite: '#3a2a1a' }, fen: { t: 'petite', volets: un(r, 4, ['#3a5a3a', '#8a3a2a']), cadre: '#d8c8a0' }, chem: [[un(r, 6, [0.15, 0.85]), '#8a8478']], av: un(r, 8, ['auvent', 'porche', null]), bois: '#6a4428', orn: un(r, 9, [['bucher'], ['bucher', 'tonneaux'], ['banc']]) })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'pierre', c: un(r, 1, ['#b0a898', '#a8a08e']) }, haut: { t: 'planches', c: un(r, 2, ['#6a4a2e', '#5a4030']) }, toit: { f: '2p', m: 'bardeaux', c: un(r, 3, ['#4a4a3a', '#5a4a3a']), hr: 1.3, deb: 0.4, faite: '#2a2018' }, fen: { volets: un(r, 4, ['#3a5a3a', '#5a7a3a']), fleurs: un(r, 5, FLEURS) }, chem: [[0.25, '#9a948a']], lucarnes: r(7, 2), av: 'auvent', orn: ['bucher', 'lierre'] })],
    ],
    mL: (r) => ({ toit: '#5a4a40', colombage: true, mur: '#efe2c8', bois: '#4a3020' }),
  },

  /** Pierrefort : la roche et la carrière — maisons de moellons gris, toits de lauzes, ateliers de carriers */
  pierre: {
    nom: 'Maisons de carriers',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), socle: 0.1, mur: { t: 'moellons', c: un(r, 1, ['#9a948a', '#8a867e', '#a49c8e']) }, chaine: '#b8b0a0', toit: { f: '2p', m: 'lauze', c: un(r, 3, ['#7a7874', '#6e6a66', '#84807a']), hr: 1.1, deb: 0.3, faite: '#4a4644' }, fen: { t: 'petite', volets: un(r, 4, ['#7a5a3a', '#5a6a72', '#6a4a30']), linteau: '#b8b0a0' }, porte: { c: un(r, 5, ['#6a4a2a', '#5a5a5a']) }, chem: [[un(r, 6, [0.2, 0.8]), '#8a867e']], av: un(r, 8, ['perron', null]), socleCol: '#8a867e', orn: un(r, 9, [['tonneaux'], ['bucher'], []]) })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'pierre', c: un(r, 1, ['#c8bca4', '#bcb098']) }, toit: { f: '2p', m: 'ardoise', c: un(r, 3, ['#4a4e58', '#545862']), hr: 1.3 }, fen: { volets: un(r, 4, ['#5a5a5a', '#7a5a3a']), linteau: '#a8a090' }, lucarnes: 1 + r(7, 2), chem: [[0.75, '#8a867e']], av: 'perron', socle: 0.45, orn: [] })],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), mur: { t: 'moellons', c: '#8a867e' }, toit: { f: '2p', m: 'tole', c: '#7a7a76', hr: 0.9 }, fen: { t: 'petite', volets: '#5a6a72' }, annexe: { cote: F.px < F.w / 2 ? 'd' : 'g', w: F.w >= 7 ? 2 : 1.3, t: 'ondulee', c: '#8a8a86', toit: 'tole', toitC: '#7a5a4a' }, chem: [[0.5, '#7a7470']], orn: ['tonneaux'] })],
    ],
    mL: () => ({ toit: '#6e6a66', mur: '#c8bca4' }),
  },

  /** Port-Azur : le port, la plage, le phare — maisons de bord de mer de Bretagne, Normandie et Charentes */
  azur: {
    nom: 'Bord de mer (Bretagne, Normandie, Charentes)',
    types: [
      // penty breton : granit, ardoise, souches de cheminée sur les pignons, volets de couleur, casiers à homards
      [3, ({ r, ...F }) => { const v = un(r, 4, ['#2a5aa8', '#c83a32', '#2a8a6a', '#e8b030', '#3a6ac8']); return { ...gabarit({ ...F, r }, { et: [1, 1, 2] }), socle: 0.15, mur: { t: 'granit', c: un(r, 1, ['#a8a6a0', '#9a9894', '#b0aca4']) }, toit: { f: '2p', m: 'ardoise', c: un(r, 3, ['#3c4354', '#363c4a']), hr: 1.5, deb: 0.15, faite: '#2a2e38' }, fen: { volets: v, cadre: '#f4f2ec', fleurs: r(5, 3) === 0 ? un(r, 6, FLEURS) : null }, porte: { c: v, cadre: '#9a9894' }, chem: un(r, 7, [[['g', '#9a9890'], ['d', '#9a9890']], [['g', '#a8a6a0']], [['d', '#a8a6a0']]]), lucarnes: r(8, 3) === 0 ? 1 : 0, orn: un(r, 9, [['casiers', 'bouee'], ['casiers'], ['filet', 'rames'], ['bouee', 'pots']]) }; }],
      // maison blanche de la côte : enduit blanc, encadrements de granit, ardoise, volets bleus
      [3, ({ r, ...F }) => { const v = un(r, 4, ['#2a5aa8', '#3a8ab8', '#2a8a6a', '#5a9ad0']); return { ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#f8f6f0', '#f4f2ea', '#faf8f2']) }, chaine: un(r, 2, ['#a8a6a0', '#b0aca4']), toit: { f: '2p', m: 'ardoise', c: '#3c4354', hr: 1.35, deb: 0.2, faite: '#2a2e38' }, fen: { volets: v, cadre: '#f4f2ec', linteau: '#a8a6a0', fleurs: un(r, 5, [null, ['#f05a6a', '#fafaf2'], ['#e070c0', '#fafaf2']]) }, porte: { c: v }, chem: [['g', '#a8a6a0']], lucarnes: r(7, 2), av: un(r, 8, [null, 'auvent', 'porche']), bois: '#f4f2ec', orn: un(r, 9, [['pots', 'bouee'], ['rames'], ['velo'], []]) }; }],
      // normande : colombages serrés, toit de chaume ou de petites tuiles brunes
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'normand', c: un(r, 1, ['#f0e2c4', '#ead8b4', '#f4ead6']), c2: un(r, 2, ['#4a2e1c', '#5a3622', '#3a2418']) }, toit: r(3, 2) ? { f: '2p', m: 'chaume', c: un(r, 6, ['#b89a5a', '#a88a50']), hr: 1.6, deb: 0.4, faite: '#6a5a3a' } : { f: '2p', m: 'tuiles', c: '#9a4a32', hr: 1.5, deb: 0.3 }, fen: { volets: un(r, 4, ['#7a2a2a', '#3a5a3a', null]), fleurs: un(r, 5, FLEURS) }, chem: [[0.8, '#a86a52']], av: un(r, 8, ['auvent', null]), orn: un(r, 9, [['pots'], ['banc'], []]) })],
      // charentaise : basse, enduit crème, tuiles canal à faible pente, volets gris-bleu, treille
      [2, ({ r, ...F }) => { const v = un(r, 4, ['#8aaab8', '#9ab8a8', '#6a9ab8', '#b8c8c8']); return { ...gabarit({ ...F, r }, { et: [1] }), mur: { t: 'enduit', c: un(r, 1, ['#f2ead8', '#efe4cc', '#f6eedc']) }, chaine: '#dccfb4', toit: { f: '2p', m: 'canal', c: un(r, 3, ['#c0704a', '#c8805a', '#b8603a']), hr: 0.8, deb: 0.35 }, fen: { volets: v, linteau: '#dccfb4' }, porte: { c: v }, chem: [[un(r, 6, [0.15, 0.85]), '#dccfb4']], av: un(r, 8, ['pergola', null, 'auvent']), fleurPergola: '#6a4a8a', orn: un(r, 9, [['pots'], ['velo', 'pots'], ['banc']]) }; }],
    ],
    mL: (r) => ({ toit: '#3c4354', mur: '#f6f4ee', colombage: false }),
  },

  /** Voltacité : électrique, la gare, la centrale — maisons modernes à toit plat, briques et zinc, panneaux solaires */
  volta: {
    nom: 'Ville électrique moderne',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.12, mur: { t: 'enduit', c: un(r, 1, ['#f2f2ee', '#e8eaec', '#f4e8b8', '#dfe8ee']) }, toit: { f: 'plat', c: '#8a9098', acrotere: 0.25 }, fen: { t: 'baie', cadre: un(r, 4, ['#3a4048', '#2a5a8a']) }, porte: { t: 'coulissante', cadre: '#3a4048' }, av: 'marquise', orn: un(r, 9, [['solaire', 'neon'], ['solaire', 'clim'], ['neon', 'antenne'], ['solaire', 'parabole']]), ctx: { neon: un(r, 6, ['#60e0f0', '#f8e060', '#a0f070']) } })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), mur: { t: 'brique', c: un(r, 1, ['#b86a4a', '#c8a060', '#a85a40']) }, toit: { f: '2p', m: 'zinc', c: un(r, 3, ['#8a929a', '#7a828c']), hr: 1.0, deb: 0.15, faite: '#5a6068' }, fen: { cadre: '#f4f0e6', rideau: '#f0e8d0' }, porte: { c: un(r, 5, ['#2a3a5a', '#3a5a3a', '#f0c030']) }, chem: [[0.7, '#a85a40']], av: 'marquise', orn: un(r, 9, [['antenne', 'parabole'], ['antenne', 'clim'], ['velo']]) })],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'bardage', c: un(r, 1, ['#3a6ab0', '#e8b030', '#4a9a8a', '#d85a3a']) }, toit: { f: '2p', m: 'zinc', c: '#8a929a', hr: 0.9, zr: 0.75, deb: 0.2 }, fen: { t: 'baie', cadre: '#2a2e34' }, porte: { t: 'coulissante', cadre: '#2a2e34' }, orn: un(r, 8, [['neon'], ['antenne'], ['neon', 'clim']]) })],
    ],
    mL: () => ({ toit: '#7a828c', mur: '#f2f2ee' }),
  },

  /** Floralia : fleurs, serres, moulin — mas aux couleurs pastel, tuiles canal, glycines, serres de jardin */
  flora: {
    nom: 'Maisons fleuries (Provence)',
    types: [
      [3, ({ r, ...F }) => { const v = un(r, 4, ['#a890c8', '#8ab8a0', '#6a9ad0', '#c8a0c8', '#90c0b0']); return { ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#f4d8b8', '#f8e0a8', '#f2c8b8', '#f4e8c8', '#ecd0c0']) }, chaine: '#f2ead8', toit: { f: '2p', m: 'canal', c: un(r, 3, ['#d07a50', '#c8704a', '#d88a5a']), hr: 0.9, deb: 0.35 }, fen: { volets: v, fleurs: un(r, 5, [['#f05a6a', '#f8d850', '#fafaf2'], ['#e070c0', '#f8d850'], ['#f05a6a', '#e070c0', '#fafaf2']]), linteau: '#f2ead8' }, porte: { c: v }, av: un(r, 8, ['pergola', 'pergola', 'serre', 'auvent']), fleurPergola: un(r, 7, ['#b08ae0', '#c4a4ee', '#f08ab0']), chem: [[0.8, '#e0c8a8']], orn: un(r, 9, [['glycine', 'pots'], ['pots'], ['glycine', 'velo'], ['rosier']]), ctx: { rose: '#f06a8a' } }; }],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#faf6ee', '#f6f2e6']) }, toit: { f: '2p', m: 'tuiles', c: un(r, 3, ['#c86a4a', '#b85a3a']), hr: 1.2 }, fen: { volets: un(r, 4, ['#5a9a6a', '#a890c8', '#6a9ad0']), fleurs: un(r, 5, FLEURS) }, av: 'serre', lucarnes: r(7, 2), chem: [[0.2, '#d8c8b0']], orn: un(r, 9, [['pots', 'glycine'], ['lierre', 'pots']]) })],
    ],
    mL: (r) => ({ toit: '#d07a50', mur: un(r, 1, ['#f4d8b8', '#f8e0a8', '#f2c8b8']) }),
  },

  /** Mirage : japonaise, jardins zen, maison de thé — machiya, minka, réserves aux murs namako */
  mirage: {
    nom: 'Maisons japonaises',
    types: [
      // machiya : rez-de-chaussée de treillis sombre, étage blanc, petit avant-toit entre les deux, noren, lanternes
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), socle: 0.15, mur: { t: 'koshi', c: un(r, 1, ['#4a3020', '#3a2618', '#5a3a24']) }, haut: { t: 'enduit', c: un(r, 2, ['#f2eee4', '#ece4d4']) }, bandeau: '#3a2618', toit: { f: '2p', m: 'kawara', c: un(r, 3, ['#4a4e58', '#3e424c', '#5a5e68']), hr: 0.9, deb: 0.45, faite: '#2a2c32' }, av: 'hisashi', fen: { t: 'shoji', w: 0.7, h: 0.5, cadre: '#3a2414' }, porte: { t: 'koshi' }, orn: un(r, 9, [['lanternes', 'noren'], ['noren', 'bonsai'], ['lanternes', 'bambou'], ['noren']]), ctx: { noren: un(r, 6, ['#2a3a6a', '#6a2a2a', '#3a4a3a']) } })],
      // minka : un niveau, engawa, murs de shoji, toit aux coins relevés
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), socle: 0.4, mur: { t: 'enduit', c: '#efe6d2' }, toit: { f: 'jap', c: un(r, 3, ['#4a4e58', '#5a5048']), hr: 1.1, deb: 0.3, lift: 0.22 }, fen: { t: 'shoji', w: 0.9, h: 0.85, pas: 1.1 }, porte: { t: 'koshi' }, av: 'engawa', boisSol: '#9a7448', bois: '#4a3020', orn: un(r, 9, [['bonsai', 'bambou'], ['lanternes'], ['bambou']]) })],
      // réserve (kura) : murs blancs, soubassement namako, toit de tuiles sombres
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), socle: 0.1, mur: { t: 'namako', c: '#3a3e46' }, haut: { t: 'enduit', c: '#f4f2ec' }, bandeau: '#2a2c32', toit: { f: '2p', m: 'kawara', c: '#3e424c', hr: 1.0, deb: 0.35 }, fen: { t: 'petite', cadre: '#2a2c32', rideau: '#e8e0d0' }, porte: { c: '#2a2c32', cadre: '#f4f2ec' }, orn: ['noren'], ctx: { noren: '#2a3a6a' } })],
    ],
    mL: () => ({ toit: '#4a4e58', mur: '#f2eee4', colombage: true, bois: '#3a2618' }),
  },

  /** Port-Granit : île de granit rose — longères de granit, ardoise, encadrements blancs */
  granit: {
    nom: 'Granit rose des îles',
    types: [
      [3, ({ r, ...F }) => { const v = un(r, 4, ['#f4f2ec', '#2a5aa8', '#3a6a8a']); return { ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.1, mur: { t: 'granit', c: un(r, 1, ['#c8a49a', '#d0aca0', '#bc9a90']) }, toit: { f: '2p', m: 'ardoise', c: '#3c4354', hr: 1.45, deb: 0.15, faite: '#2a2e38' }, fen: { volets: v, cadre: '#f4f2ec', linteau: '#c8a49a' }, porte: { c: v === '#f4f2ec' ? '#3a6a8a' : v }, chem: [['g', '#c0a096'], ['d', '#c0a096']].slice(0, 1 + r(6, 2)), lucarnes: r(7, 2), orn: un(r, 9, [['casiers'], ['bouee'], ['pots'], []]) }; }],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'enduit', c: '#f6f4ee' }, chaine: un(r, 2, ['#c8a49a', '#bc9a90']), toit: { f: '2p', m: 'ardoise', c: '#3c4354', hr: 1.3, deb: 0.2 }, fen: { volets: un(r, 4, ['#3a6a8a', '#c8a49a']), linteau: '#c8a49a', fleurs: un(r, 5, [null, ['#f05a6a', '#fafaf2']]) }, chem: [['d', '#c8a49a']], av: un(r, 8, [null, 'porche']), orn: ['bouee'] })],
    ],
    mL: () => ({ toit: '#3c4354', mur: '#f6f4ee' }),
  },

  /** Cendrelune : île volcanique — basalte noir, murs chaulés à angles de lave, balcons de bois vert, toits rouges */
  cendre: {
    nom: 'Basalte et chaux (île volcanique)',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), socle: 0.12, mur: { t: 'moellons', c: un(r, 1, ['#4a4448', '#3e3a3e', '#545052']) }, chaine: '#e8e2d8', toit: { f: '2p', m: 'canal', c: un(r, 3, ['#8a3a2a', '#9a4a32', '#7a3428']), hr: 1.0, deb: 0.3 }, fen: { cadre: '#f2ece2', volets: un(r, 4, ['#3a6a4a', '#c8a050', null]), linteau: '#e8e2d8' }, porte: { c: un(r, 5, ['#3a6a4a', '#8a5a2a']) }, socleCol: '#3e3a3e', chem: [[0.8, '#4a4448']], orn: un(r, 9, [['jarres'], ['cactus'], []]) })],
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.25, socleCol: '#3e3a3e', mur: { t: 'enduit', c: un(r, 1, ['#f4f0e8', '#f0e8dc']) }, chaine: '#4a4448', toit: { f: 'plat', c: '#c8b8a8', acrotere: 0.2 }, fen: { cadre: '#4a4448', volets: un(r, 4, ['#3a6a4a', '#2a5a3a']), linteau: '#4a4448' }, porte: { c: '#3a6a4a', cadre: '#4a4448' }, av: un(r, 8, ['balcon', 'galerie', null]), bois: '#3a6a4a', fer: '#3a6a4a', orn: un(r, 9, [['jarres', 'cactus'], ['pots'], ['bougainvillee']]) })],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#c8784a', '#d8905a', '#b8603a']) }, socle: 0.35, socleCol: '#3e3a3e', toit: { f: '2p', m: 'canal', c: '#6a2a20', hr: 0.9 }, fen: { volets: '#3a3236', cadre: '#f2ece2' }, chem: [[0.3, '#4a4448']], orn: ['jarres'] })],
    ],
    mL: () => ({ toit: '#8a3a2a', mur: '#f4f0e8' }),
  },

  /** Fort-Écaille : capitale de l'archipel — cubes blancs, portes bleues, toits plats, coupoles, bougainvillées */
  ecaille: {
    nom: 'Archipel blanc et bleu',
    types: [
      [3, ({ r, ...F }) => { const b = un(r, 4, ['#2a62c0', '#3a8ad0', '#1a4aa0', '#2a9ab0']); return { ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.12, socleCol: '#e8e6e0', mur: { t: 'enduit', c: un(r, 1, ['#fafaf6', '#f6f6f2', '#f8f6f0']) }, toit: { f: 'plat', c: '#f2f2ee', acrotere: un(r, 2, [0.18, 0.3]) }, fen: { t: un(r, 3, ['std', 'arc']), volets: b, cadre: '#fafaf6', linteau: '#f2f2ee' }, porte: { c: b, cadre: '#fafaf6', t: un(r, 5, ['simple', 'arc']) }, orn: un(r, 9, [['bougainvillee', 'pots'], ['dome', 'pots'], ['bougainvillee'], ['dome', 'bougainvillee'], ['pots']]), ctx: { dome: b, mur: '#fafaf6' } }; }],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'enduit', c: un(r, 1, ['#f2d8a8', '#e8c8a0', '#f4e4c0']) }, toit: { f: '2p', m: 'canal', c: '#c8704a', hr: 0.8, deb: 0.3 }, fen: { volets: un(r, 4, ['#2a62c0', '#3a8a6a']), cadre: '#fafaf6' }, porte: { c: '#2a62c0' }, orn: ['bougainvillee', 'pots'] })],
    ],
    mL: () => ({ toit: '#c8704a', mur: '#fafaf6' }),
  },

  /** Cimelune : montagne, cité des dragons anciens — pierre et bois sombre, lauzes enneigées, têtes de dragon */
  cime: {
    nom: 'Montagne (pierre, lauzes enneigées)',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.1, mur: { t: 'moellons', c: un(r, 1, ['#a8a49c', '#9a968e']) }, haut: { t: 'bardage', c: un(r, 2, ['#5a3a24', '#4a3020']) }, bandeau: '#3a2414', toit: { f: '2p', m: un(r, 3, ['neige', 'neige', 'lauze']), c: '#6e6a66', hr: 1.0, deb: 0.5, faite: '#3a3634' }, fen: { t: 'petite', volets: un(r, 4, ['#8a2a22', '#3a4a5a']), cadre: '#e8dcc0' }, chem: [[un(r, 6, [0.2, 0.8]), '#8a8478']], orn: un(r, 9, [['bucher', 'dragon'], ['dragon'], ['bucher']]), ctx: { dragon: un(r, 7, ['#b8382a', '#c89a30']) } })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), socle: 0.1, mur: { t: 'moellons', c: '#8a867e' }, toit: { f: 'rue', m: 'neige', c: '#6e6a66', hr: 1.2, deb: 0.5, faite: '#3a3634' }, fen: { t: 'petite', volets: '#8a2a22' }, porte: { c: '#8a2a22', t: 'arc' }, chem: [[0.8, '#7a7470']], av: 'auvent', orn: ['dragon', 'bucher'], ctx: { dragon: '#b8382a' } })],
    ],
    mL: () => ({ toit: '#6e6a66', mur: '#a8a49c' }),
  },

  /** Plateau Céleste : la Ligue — pierre blanche et ardoise bleue (au cas où une maison y serait posée) */
  plateau: {
    nom: 'Pierre blanche de la Ligue',
    types: [[1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }), mur: { t: 'pierre', c: '#ecebe6' }, toit: { f: '4p', m: 'ardoise', c: '#3a4a7a', hr: 1.2 }, fen: { t: 'arc', linteau: '#d8d4c8' }, porte: { t: 'arc', c: '#3a4a7a' }, orn: ['pots'] })]],
    mL: () => ({ toit: '#3a4a7a', mur: '#ecebe6' }),
  },

  /** Métropole : grande ville — immeubles de pierre à mansardes, immeubles de brique, immeubles modernes */
  metro: {
    nom: 'Immeubles de la grande ville',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2, 3], annexe: false }), socle: 0.2, mur: { t: 'pierre', c: un(r, 1, ['#e8dcc0', '#ece4d0', '#dcd0b4']) }, toit: { f: 'mansarde', m: un(r, 3, ['zinc', 'ardoise']), c: un(r, 2, ['#7a8290', '#4a5060']), hr: 1.4 }, lucarnes: Math.max(1, Math.round(F.w / 2)), fen: { cadre: '#f4f0e6', linteau: '#d8ccb0', rideau: '#f0e8d0' }, porte: { t: 'double', c: un(r, 5, ['#2a3a5a', '#3a2a2a', '#2a4a3a']) }, av: 'balcon', fer: '#1e1e24', chem: [[0.15, '#d8ccb0']], orn: [] })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2, 3], annexe: false }), mur: { t: 'brique', c: un(r, 1, ['#9a4a34', '#a85a40', '#8a3e2e']) }, toit: { f: 'plat', c: '#5a5a5e', acrotere: 0.35 }, fen: { cadre: '#f4f0e6', linteau: '#e8e0d0' }, porte: { c: un(r, 5, ['#1e2a3a', '#3a2a2a']), cadre: '#f4f0e6' }, av: un(r, 8, ['perron', 'marquise']), socle: 0.5, orn: un(r, 9, [['clim'], ['antenne', 'clim'], ['enseigne']]) })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2, 3], annexe: false }), mur: { t: 'panneaux', c: un(r, 1, ['#e6e8ec', '#d8dee6', '#ece6dc']) }, toit: { f: 'plat', c: '#7a7e86', acrotere: 0.25 }, fen: { t: 'baie', cadre: '#3a4048' }, porte: { t: 'coulissante', cadre: '#3a4048' }, av: 'marquise', orn: un(r, 9, [['clim', 'solaire'], ['parabole'], ['neon']]), ctx: { neon: '#f0a0e0' } })],
    ],
    mL: () => ({ toit: '#4a5060', mur: '#e8dcc0' }),
  },

  /** Port-Lisière : port sur falaise — maisons basques blanches, colombages rouges ou verts, larges toits dissymétriques */
  lisiere: {
    nom: 'Maisons basques',
    types: [
      [3, ({ r, ...F }) => { const b = un(r, 2, ['#a0282a', '#a0282a', '#2a6a3a', '#2a4a8a']); return { ...gabarit({ ...F, r }, { et: [2] }), mur: { t: 'enduit', c: '#f6f2ea' }, haut: { t: 'basque', c: '#f6f2ea', c2: b }, bandeau: b, toit: { f: 'asym', m: 'canal', c: un(r, 3, ['#b85a3a', '#c06a48']), hr: 0.85, zr: un(r, 6, [0.4, 0.6]), deb: 0.55 }, fen: { volets: b, cadre: '#f6f2ea', fleurs: un(r, 5, [null, ['#f05a6a', '#fafaf2']]) }, porte: { c: b, t: un(r, 7, ['simple', 'arc']) }, av: un(r, 8, ['galerie', 'balcon', null]), bois: b, fer: b, orn: un(r, 9, [['pots'], ['banc'], ['bouee']]) }; }],
      [2, ({ r, ...F }) => { const b = un(r, 2, ['#a0282a', '#2a6a3a']); return { ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'basque', c: '#f6f2ea', c2: b }, toit: { f: '2p', m: 'canal', c: '#b85a3a', hr: 0.9, deb: 0.45 }, fen: { volets: b }, porte: { c: b }, chem: [[0.8, '#e8e0d4']], orn: un(r, 9, [['filet'], ['rames', 'bouee'], []]) }; }],
    ],
    mL: (r) => ({ toit: '#b85a3a', mur: '#f6f2ea', colombage: true, bois: '#a0282a' }),
  },

  /** Marais-Noir : marais — maisons sur pilotis, planches délavées, tôle rouillée, chaumières basses */
  marais: {
    nom: 'Maisons du marais',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1], annexe: false }), pilotis: 0.6, socle: 0, recul: 0.9, prof: Math.min(F.d - 0.9, 3.4), mur: { t: 'planches', c: un(r, 1, ['#7a9a8a', '#8aa0aa', '#a8a080', '#8a8a7a', '#9aaa88']) }, toit: { f: '2p', m: 'tole', c: un(r, 3, ['#9a6a4a', '#7a8a7a', '#8a5a42']), hr: 0.85, deb: 0.3, faite: '#4a3a2a' }, fen: { t: 'petite', volets: un(r, 4, ['#5a6a4a', '#4a5a6a', null]), cadre: '#d8d4c8' }, porte: { c: '#5a4a36', cadre: '#d8d4c8' }, av: 'auvent', boisSol: '#7a6a50', bois: '#5a4a36', orn: un(r, 9, [['lanterneFer', 'tonneaux'], ['lanterneFer'], ['tonneaux']]), ctx: { lueur: '#f0c060' } })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), socle: 0.15, mur: { t: 'enduit', c: un(r, 1, ['#ece6d6', '#e4dcc8']) }, toit: { f: '2p', m: 'chaume', c: un(r, 3, ['#8a7a4a', '#7a6c44']), hr: 1.5, deb: 0.45, faite: '#5a5030' }, fen: { t: 'petite', volets: '#4a5a4a' }, porte: { c: '#4a5a4a' }, chem: [[un(r, 6, [0.15, 0.85]), '#d8d0bc']], orn: un(r, 9, [['lierre', 'tonneaux'], ['banc'], ['lierre']]) })],
    ],
    mL: () => ({ toit: '#8a7a4a', mur: '#ece6d6' }),
  },

  /** Dunes d'Ocre : désert et oasis — terre crue, toits terrasses, bouts de poutres, coupoles, portes colorées */
  dunes: {
    nom: 'Terre crue du désert',
    types: [
      [3, ({ r, ...F }) => { const p = un(r, 4, ['#2a5ac0', '#2a8a7a', '#c8402a', '#e8b030']); return { ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.1, socleCol: '#b88a5a', mur: { t: 'adobe', c: un(r, 1, ['#d8a870', '#e0b480', '#cc9a64', '#e4c090']) }, toit: { f: 'plat', c: '#c89860', acrotere: 0.35, creneaux: r(2, 3) === 0 }, fen: { t: 'petite', cadre: p, linteau: '#b88a5a' }, porte: { c: p, t: 'arc', cadre: '#b88a5a' }, orn: un(r, 9, [['poutres', 'jarres'], ['poutres', 'cactus'], ['dome', 'jarres'], ['poutres', 'dome', 'cactus']]), ctx: { dome: un(r, 6, ['#f2e6d0', '#e8c890', '#3a8ab0']), mur: '#d8a870' } }; }],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1] }), socle: 0.1, mur: { t: 'adobe', c: '#f0e2c8' }, toit: { f: 'plat', c: '#e8d8b8', acrotere: 0.3 }, fen: { t: 'arc', cadre: '#3a6aa8', linteau: '#d8c8a8' }, porte: { c: '#3a6aa8', t: 'arc' }, orn: ['dome', 'jarres'], ctx: { dome: '#f2e6d0', mur: '#f0e2c8' } })],
    ],
    mL: () => ({ toit: '#c89860', mur: '#e0b480' }),
  },

  /** Forge-Acier : industrielle — corons de brique sombre, ardoise, ateliers de tôle, cheminées de fer */
  forge: {
    nom: 'Corons et ateliers',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), socle: 0.15, socleCol: '#5a5250', mur: { t: 'brique', c: un(r, 1, ['#7a3a2a', '#6a3428', '#8a4430']) }, toit: { f: '2p', m: 'ardoise', c: un(r, 3, ['#3a3e48', '#44464e']), hr: 1.2, deb: 0.15, faite: '#24262c' }, fen: { cadre: '#ece8e0', linteau: '#d8d0c4', rideau: '#e8e0c8' }, porte: { c: un(r, 5, ['#2a3a2a', '#3a2a2a', '#2a2e3a']), cadre: '#ece8e0' }, chem: [[0.3, '#6a3428'], [0.75, '#6a3428']].slice(0, 1 + r(6, 2)), orn: un(r, 9, [['velo'], ['tonneaux'], []]) })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'ondulee', c: un(r, 1, ['#7a7e82', '#6a7a7e', '#8a8478']) }, toit: { f: '2p', m: 'tole', c: '#6a6a6a', hr: 0.9, zr: 0.3, deb: 0.2 }, fen: { t: 'baie', cadre: '#2a2e34' }, porte: { c: '#4a4e54', cadre: '#2a2e34' }, orn: ['chemMetal', 'tuyaux'] })],
      [1, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), mur: { t: 'brique', c: '#5a2e24' }, toit: { f: 'plat', c: '#4a4a4e', acrotere: 0.3 }, fen: { cadre: '#3a3e44' }, porte: { c: '#3a3e44', t: 'double' }, orn: ['chemMetal', 'clim'] })],
    ],
    mL: () => ({ toit: '#3a3e48', mur: '#d8c8b4' }),
  },

  /** Rosebrume : romantique, fleurs, chapelle — chaumières pastel couvertes de rosiers, maisons victoriennes */
  rose: {
    nom: 'Cottages romantiques',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'enduit', c: un(r, 1, ['#f6d8dc', '#f8e0d0', '#f2e6f0', '#fbeee0', '#ecd8e8']) }, toit: { f: '2p', m: 'chaume', c: un(r, 3, ['#b89a5a', '#a88a52']), hr: 1.45, deb: 0.45, faite: '#6a5a3a' }, fen: { volets: un(r, 4, ['#f4f0f2', '#c8a0c0', '#a8c8b8', null]), fleurs: [['#f06a8a', '#fafaf2', '#e070c0']][0], rideau: '#f8e0e8' }, porte: { c: un(r, 5, ['#c8607a', '#7a9a8a', '#a080b8']), t: 'arc' }, av: un(r, 8, ['bowindow', 'pergola', null]), fleurPergola: '#f06a8a', orn: un(r, 9, [['rosier'], ['rosier', 'banc'], ['lierre', 'pots'], ['rosier', 'pots']]), ctx: { rose: un(r, 6, ['#f06a8a', '#e8405a', '#f8a0c0']) } })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), mur: { t: 'bardage', c: un(r, 1, ['#f2b8c8', '#c8d8f0', '#d8f0e0', '#f8e8b0', '#e0c8f0']) }, toit: { f: 'rue', m: 'ardoise', c: un(r, 3, ['#5a4a6a', '#4a4a5a']), hr: 1.6, deb: 0.3 }, fen: { cadre: '#ffffff', rideau: '#f8e0e8', fleurs: ['#f06a8a', '#fafaf2'] }, porte: { c: '#ffffff', cadre: '#c8607a' }, av: un(r, 8, ['bowindow', 'porche', 'balcon']), bois: '#ffffff', fer: '#ffffff', orn: un(r, 9, [['rosier'], ['pots'], ['rosier', 'lanternes'].slice(0, 1)]), ctx: { rose: '#f06a8a' } })],
    ],
    mL: () => ({ toit: '#5a4a6a', mur: '#f6d8dc' }),
  },

  /** Ombreval : sombre, mystérieux — pierre noire, pignons aigus d'ardoise, fenêtres en ogive, lanternes violettes */
  ombre: {
    nom: 'Maisons gothiques',
    types: [
      [3, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [2] }), socle: 0.2, socleCol: '#3a3640', mur: { t: 'pierre', c: un(r, 1, ['#5a5660', '#4e4a56', '#625c66']) }, toit: { f: 'rue', m: 'ardoise', c: un(r, 3, ['#3a3446', '#2e2a38', '#403a4e']), hr: un(r, 2, [2.0, 2.3]), deb: 0.25, faite: '#1e1a24' }, fen: { t: 'ogive', lueur: un(r, 4, ['#a070e0', '#70a0e0', '#e0a060']), linteau: '#4a4650', rideau: '#5a3a6a' }, porte: { c: '#2a2030', cadre: '#3a3640', t: 'arc' }, orn: un(r, 9, [['lanterneFer', 'lierre'], ['gargouille', 'lanterneFer'], ['lierre'], ['lanterneFer']]), ctx: { lueur: '#b090ff' } })],
      [2, ({ r, ...F }) => ({ ...gabarit({ ...F, r }, { et: [1, 2] }), mur: { t: 'colombage', c: un(r, 1, ['#8a8690', '#7a7680']), c2: '#1e1a22' }, toit: { f: '2p', m: 'ardoise', c: '#2e2a38', hr: 1.6, deb: 0.3, faite: '#1e1a24' }, fen: { t: 'petite', volets: '#2a2430', rideau: '#4a2a5a' }, porte: { c: '#2a2030' }, chem: [[un(r, 6, [0.2, 0.8]), '#4a4650']], orn: un(r, 9, [['lanterneFer'], ['lierre', 'lanterneFer']]), ctx: { lueur: '#b090ff' } })],
    ],
    mL: () => ({ toit: '#2e2a38', mur: '#8a8690', colombage: true, bois: '#1e1a22' }),
  },
};

/** modèles déjà posés par la carte qui sont des maisons ordinaires (remplacées par le style de la ville) */
const ORDINAIRES = new Set(['chalet', 'maisonHaute', 'maisonExt', 'maisonL']);

/**
 * Le modèle d'une maison ordinaire d'une ville, selon le style de la ville : { nom, o, libre } ou null (pas une maison
 * ordinaire, ou hors des villes).
 */
export function maisonDeVille(b, ville) {
  const st = STYLES[VILLE_STYLE[ville]];
  if (!st) return null;
  const ord = (b.kind === 'house' || b.kind === 'house2' || b.kind === 'bighouse') && (!b.modele || ORDINAIRES.has(b.modele));
  if (!ord || b.door < 0) return null;
  // la variante est tirée de la position ; ses réglages, de la ville, de l'emprise et du numéro de variante
  const v = tireur(b.x * 7919 + b.y * 104729)(11, NVAR);
  if (b.modele === 'maisonL' && b.door === 2 && b.w === 5 && b.d === 5) return { nom: 'maisonL', o: st.mL ? st.mL(tireur(graine(`${VILLE_STYLE[ville]}:L:${v}`))) : {} };
  return modeleStyle(VILLE_STYLE[ville], b.w, b.d, b.door, v);
}

/** la variante v (0 → NVAR - 1) d'un style pour une emprise w × d, porte en colonne door : { nom, o, libre } */
export function modeleStyle(style, w, d, door, v) {
  const st = STYLES[style], r = tireur(graine(`${style}:${w}x${d}:${door}:${v}`));
  let tot = 0; for (const [p] of st.types) tot += p;
  let k = r(11) * tot, fn = st.types[0][1];
  for (const [p, f] of st.types) { if (k < p) { fn = f; break; } k -= p; }
  const o = fn({ w, d, px: door + 0.5, r });
  return { nom: 'maisonVille', o: { w, d, px: door + 0.5, ...o }, libre: true };
}
