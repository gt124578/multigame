// odyssee/moteur/donnees/johto.js — le début de HeartGold / SoulSilver redessiné pour éprouver le moteur :
// Bourg Geon → Route 29 → Ville Griotte → Route 30 → Route 31 → Mauville, avec leurs intérieurs (Centres POKéMON,
// boutiques, maisons, M. POKéMON, Tour Chétiflor sur trois étages, arène, école, Antre Noir).
// Les plans sont dessinés à la main d'après la disposition des lieux du jeu (rien n'est extrait de la ROM) ;
// les dialogues sont écrits pour l'essai.
//
// Matrice du dehors (6 × 3 blocs de 32 cases) :
//   y0 : Mauville   | Route 31 | Route 30 (nord)
//   y1 :            |          | Route 30 (sud)
//   y2 :            |          | Ville Griotte | Route 29 (ouest) | Route 29 (est) | Bourg Geon

import { bloc, mondeSimple, SOLS } from './auteur.js';
import { BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';
import { DEMO, BOURG, ROUTE_B, MAISON_1F, MAISON_2F, LABO, VOISIN } from './demo.js';

const T32 = 'T'.repeat(32);

// ——— outils ———
/** décale tous les événements d'une zone (pour reprendre une zone de la démo à une autre place de la matrice) */
function decaler(z, dx, dy) {
  const d = (e) => ({ ...e, x: e.x + dx, y: e.y + dy });
  return { ...z, warps: (z.warps || []).map(d), panneaux: (z.panneaux || []).map(d), declencheurs: (z.declencheurs || []).map(d), objets: (z.objets || []).map(d) };
}
/** un panneau « arbre à baies » sur chaque arbre à baies d'un bloc */
function baies(b, ox, oy, baie = 'oran-berry') {
  return b.decor.filter((d) => d.type === 'baies').map((d) => ({ x: ox + d.x, y: oy + d.y, script: 'ArbreBaies', baie }));
}
/** une pièce au centre d'un bloc vide */
function piece(lignes, ox, oy) {
  const plan = [];
  for (let y = 0; y < 32; y++) { const l = lignes[y - oy]; plan.push(l === undefined ? '' : ' '.repeat(ox) + l); }
  return plan;
}
/** coordonnées d'une case d'une pièce */
const pc = (ox, oy) => (x, y) => ({ x: x + ox, y: y + oy });

// ——— dehors ———
const ROUTE29_OUEST = bloc({
  strict: true,
  plan: [
    T32, T32,
    'TTTTTTTTTTTT......TTTTTTTTTTTTTT',
    'TTTTTTTTTTTT......TTTTTTTTTTTTTT',
    'TTTT""""TTTT......TTTT""""""TTTT',
    'TTTT""""..............""""""TTTT',
    'TTTT""""..............""""""TTTT',
    'TTTT..........p...........,.TTTT',
    'TTTT........................TTTT',
    'TTvvvvvvvvvv.....vvvvvvvvvvvvvTT',
    'TT............................TT',
    'TT....A..............A........TT',
    '================================',
    '================================',
    'TT............................TT',
    'TT....""""""""""""".......TT..TT',
    'TT....""""""""""""".......TT..TT',
    'TT....""""""""""""".......TT..TT',
    'TT............................TT',
    'TTTT.........TT.........TTTTTTTT',
    'TTTTTT.......TT.........TTTTTTTT',
    'TTTTTTTTT..........TTTTTTTTTTTTT',
    ...Array(10).fill(T32),
  ],
  batiments: [{ x: 12, y: 0, l: 6, p: 3, modele: 'poste', toit: 'vert', porte: 2 }],
});

const GRIOTTE = bloc({
  strict: true,
  plan: [
    'TTTTTTTTTTTTTT....TTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTT....TTTTTTTTTTTTTT',
    'TT............PPPP............TT',
    'TT............PPPP............TT',
    'TT............PPPP............TT',
    'TT............PPPP............TT',
    'TT............PPPP............TT',
    'TT............PPPP............TT',
    'TT..PPPPP.....PPPP.....PPPPP..TT',
    'TT..PPPPP.....PPPP.....PPPPP..TT',
    'TT.....P......PPPP.......P....TT',
    'TT.....P......PPPP.......P....TT',
    'TT.....PPPPPPPPPPPPPPPPPPPPPPPPP',
    'TT.....PPPPPPPPPPPPPPPPPPPPPPPPP',
    'TT................P...........TT',
    'TT................P...........TT',
    'TT................P...........TT',
    'TT..PPPPP.........P....PPPPP..TT',
    'TT..PPPPP.........P....p......TT',
    'TT................P...........TT',
    'TT................P...........TT',
    'TTSSSSSSSSSSSSSSSSSSSSSSSSSSSSTT',
    'TTSSSSSSSSSSSSSSSSSSSSSSSSSSSSTT',
    ...Array(9).fill('w'.repeat(32)),
  ],
  batiments: [
    { x: 3, y: 4, l: 6, p: 4, modele: 'centre', toit: 'rouge', porte: 3 },
    { x: 22, y: 4, l: 6, p: 4, modele: 'boutique', toit: 'bleu', porte: 3 },
    { x: 3, y: 14, l: 5, p: 3, modele: 'maison', toit: 'vert', porte: 2 },
    { x: 22, y: 14, l: 5, p: 3, modele: 'maison', toit: 'rouge', porte: 2 },
  ],
});

const ROUTE30_SUD = bloc({
  strict: true,
  plan: [
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..A.......====.......A..TTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTT.......vvv====vvv.......TTTT',
    'TTTT..........====........""TTTT',
    'TTTT..p.......====........""TTTT',
    'TTTT""""""....====..""""""..TTTT',
    'TTTT""""""....====..""""""..TTTT',
    'TTTT""""""....====..""""""..TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTTTT........====........TTTTTT',
    'TTTTTT........====........TTTTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT""""""....====....""""""TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
  ],
  batiments: [{ x: 22, y: 16, l: 5, p: 3, modele: 'maison', toit: 'rouge', porte: 2 }],
});

const ROUTE30_NORD = bloc({
  strict: true,
  plan: [
    T32, T32,
    'TTTTTTTTTTTTTT====......TTTTTTTT',
    'TTTTTTTTTTTTTT====......TTTTTTTT',
    'TTTTTTTT......====..........TTTT',
    'TTTTTTTT......====..........TTTT',
    'TTTTTTTT..""""====FF........TTTT',
    'TTTTTTTT..""""====FF..p.....TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    '==================..........TTTT',
    '==================..........TTTT',
    'TTTT""""......====......""""TTTT',
    'TTTT""""......====......""""TTTT',
    'TTTT""""......====......""""TTTT',
    'TTTT..........====..........TTTT',
    'TTTTvvvvvvvvvv====vvvvvvvvvvTTTT',
    'TTTT..........====..........TTTT',
    'TTTT....o.....====.....A....TTTT',
    'TTTT..........====..........TTTT',
    'TTTTTTTT......====......TTTTTTTT',
    'TTTTTTTT""""..====..""""TTTTTTTT',
    'TTTTTTTT""""..====..""""TTTTTTTT',
    'TTTTTTTT......====......TTTTTTTT',
    'TTTT..........====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTT..p.......====..........TTTT',
    'TTTT..........====..........TTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTTTTTTTT....====....TTTTTTTTTT',
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTT====TTTTTTTTTTTTTT',
  ],
  batiments: [{ x: 19, y: 1, l: 5, p: 3, modele: 'maison', toit: 'bleu', porte: 2 }],
});

const ROUTE31 = bloc({
  strict: true,
  plan: [
    T32, T32, T32,
    'TTTT.....TTTTTTTTTTTTTTTTTTTTTTT',
    'TTTT.....TTTTTTTTTTT.....TTTTTTT',
    'TTTT.....TTTTTTTTTTT.....TTTTTTT',
    'TTTTTT.TTTTTTTTTTTTT.....TTTTTTT',
    'TTTT..........""""".......TTTTTT',
    'TTTT..........""""".......TTTTTT',
    'TTTT..........""""".........TTTT',
    'TTTT..............==============',
    'TTTT..............==============',
    'TTTT..A.....""""".=.........TTTT',
    'TTTT........""""".=....p....TTTT',
    '===================.........TTTT',
    '===================.........TTTT',
    'TTTT..........""""""........TTTT',
    'TTTT..........""""""........TTTT',
    'TTTTTTTTTT..................TTTT',
    'TTTTTTTTTT.....TTTTTTT......TTTT',
    ...Array(12).fill(T32),
  ],
  batiments: [{ x: 20, y: 3, l: 5, p: 2, modele: 'grotte', porte: 2 }],
});

const MAUVILLE = bloc({
  strict: true,
  plan: [
    T32, T32,
    'TTwwwwwwww..........wwwwwwwwwwTT',
    'TTwwwwwwww..........wwwwwwwwwwTT',
    'TTwwwwwwww..........wwwwwwwwwwTT',
    'TTwwwwwwww..........wwwwwwwwwwTT',
    'TTwwwwwwww..........wwwwwwwwwwTT',
    'TTwwwwwwwwwwww__wwwwwwwwwwwwwwTT',
    'TTwwwwwwwwwwww__wwwwwwwwwwwwwwTT',
    'TT............PP..............TT',
    'TT............PP..............TT',
    'TT..PPPPPPPPPPPPPPPPPPPPPPPP..TT',
    'TT..P...........P.........P...TT',
    'TT..P...........P.........P...TT',
    'TT..P...........P.........PPPPPP',
    'TT..PPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    'TT..P...........P.........P...TT',
    'TT..P...........P.........P...TT',
    'TT..P...........P.........P...TT',
    'TT..PPPPPPPPPPPPPPPPPPPPPPPP..TT',
    'TT............................TT',
    'TT..FF....................FF..TT',
    'TT............................TT',
    'TT............................TT',
    'TT............................TT',
    'TT............................TT',
    'TT....FF..............FF......TT',
    'TTTT........................TTTT',
    'TTTTTT....................TTTTTT',
    T32, T32, T32,
  ],
  batiments: [
    { x: 12, y: 2, l: 6, p: 4, modele: 'tour', toit: 'brun', porte: 3 },
    { x: 6, y: 12, l: 5, p: 3, modele: 'centre', toit: 'rouge', porte: 2 },
    { x: 18, y: 12, l: 4, p: 3, modele: 'boutique', toit: 'bleu', porte: 1 },
    { x: 6, y: 16, l: 6, p: 3, modele: 'arene', toit: 'gris', porte: 2 },
    { x: 18, y: 16, l: 6, p: 3, modele: 'ecole', toit: 'vert', porte: 2 },
    { x: 5, y: 21, l: 5, p: 3, modele: 'maison', toit: 'rouge', porte: 2 },
    { x: 20, y: 21, l: 5, p: 3, modele: 'maison', toit: 'bleu', porte: 2 },
  ],
});

// ——— intérieurs ———
const CENTRE = bloc({ plan: piece([
  'WWWWWWWWWWWWWW',
  'W;;;;;;;;;;;OW',
  'W;;;cccccc;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;t|;;;;;;;t|W',
  'W;||;;;;;;;||W',
  'W;;;;;;m;;;;;W',
  'WWWWWWWWWWWWWW',
], 9, 10), legende: { c: { col: 1, sol: 'carrelage', mb: 24, decor: 'comptoir' }, O: { col: 1, sol: 'carrelage', decor: 'pc' } } });
const C = pc(9, 10);

const BOUTIQUE = bloc({ plan: piece([
  'WWWWWWWWWW',
  'W;R|R|R|;W',
  'W|;;;;;;;W',
  'W;c;;;;;;W',
  'W;c;;;;;;W',
  'W|;;;;;;;W',
  'W;;;;m;;;W',
  'WWWWWWWWWW',
], 11, 10), legende: { c: { col: 1, sol: 'carrelage', mb: 24, decor: 'comptoir' } } });
const Bq = pc(11, 10);

const POSTE = bloc({ plan: piece([
  'WWWWWWWWWW',
  'W;;;;;;;;W',
  'W;;;;;;;;W',
  'W;;;;;;;;W',
  'W;;;;m;;;W',
  'WWWWWWWWWW',
], 11, 10) });
const Po = pc(11, 10);

const TOUR_1 = bloc({ plan: piece([
  'WWWWWWWWWWWW',
  'W:::::::::EW',
  'W::::::::::W',
  'W::::||::::W',
  'W::::||::::W',
  'W::::::::::W',
  'W::::::::::W',
  'W::::m:::::W',
  'WWWWWWWWWWWW',
], 10, 10) });
const TOUR_2 = bloc({ plan: piece([
  'WWWWWWWWWWWW',
  'W:::::::::EW',
  'W::::::::::W',
  'W::::||::::W',
  'W::::||::::W',
  'W::::::::::W',
  'WE:::::::::W',
  'W::::::::::W',
  'WWWWWWWWWWWW',
], 10, 10) });
const TOUR_3 = bloc({ plan: piece([
  'WWWWWWWWWWWW',
  'W::::::::::W',
  'W::::::::::W',
  'W::::||::::W',
  'W::::||::::W',
  'W::::::::::W',
  'WE:::::::::W',
  'W::::::::::W',
  'WWWWWWWWWWWW',
], 10, 10) });
const Tw = pc(10, 10);

const ARENE = bloc({ plan: piece([
  'WWWWWWWWWWWWWW',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;;;;;;;W',
  'W;;;;;;m;;;;;W',
  'WWWWWWWWWWWWWW',
], 9, 8) });
const Ar = pc(9, 8);

const ECOLE = bloc({ plan: piece([
  'WWWWWWWWWWWW',
  'W;;;R|R|;;;W',
  'W;;;;;;;;;;W',
  'W;t|;t|;t|;W',
  'W;||;||;||;W',
  'W;;;;;;;;;;W',
  'W;;;;m;;;;;W',
  'WWWWWWWWWWWW',
], 10, 10) });
const Ec = pc(10, 10);

function antre() {
  const p = [];
  for (let y = 0; y < 32; y++) p.push('G'.repeat(32).split(''));
  for (let y = 4; y <= 10; y++) for (let x = 4; x <= 24; x++) p[y][x] = 'g';
  for (let y = 11; y <= 13; y++) for (let x = 13; x <= 15; x++) p[y][x] = 'g';
  for (let x = 10; x <= 20; x++) p[7][x] = 'v';
  for (const [x, y] of [[13, 4], [7, 5], [21, 5], [9, 9], [18, 9]]) p[y][x] = 'q';
  p[14][14] = 'n';
  return p.map((l) => l.join(''));
}
const ANTRE = bloc({ plan: antre(), legende: { v: { sol: 'grotte', mb: 8 } } });

const V = pc(11, 10);   // pièces de la démo (maisons) : même décalage

// ——— zones ———
const DX = 96, DY = 64;   // la démo plaçait Bourg Geon et la Route 29 (est) en haut à gauche de sa matrice
const bourgDemo = decaler(DEMO.zones.BOURG_GEON, DX, DY);
const routeDemo = decaler(DEMO.zones.ROUTE_29, DX, DY);

/** une maison habitée (pièce de la démo « voisin »), un habitant et un script */
const maison = (nom, vers, n, habitant, script, musique = 'maison') => ({
  nom, annonce: false, musique, camera: 'interieur', interieur: true, velo: false,
  warps: [{ ...V(4, 5), vers, n }],
  objets: [{ id: 'habitant', ...V(6, 2), dir: BAS, mouvement: 'regard_alea', ...habitant }],
  scripts: script,
});
const centre = (nom, vers, n) => ({
  nom, annonce: false, musique: 'centre', camera: 'interieur', interieur: true, velo: false,
  warps: [{ ...C(7, 7), vers, n }],
  panneaux: [{ ...C(12, 1), depuis: HAUT, script: 'PCdeLeo' }],
  objets: [
    { id: 'infirmiere', ...C(6, 1), sprite: 'nurse', dir: BAS, script: 'Infirmiere' },
    { id: 'visiteur', ...C(10, 4), sprite: 'topdresseur', mouvement: 'errance', rayon: 1, script: 'Visiteur' },
  ],
  scripts: `
script Visiteur
  regarder_joueur
  message "L'infirmière soigne tes POKéMON gratuitement.\\nC'est aussi ici que tu repars si tu es K.O."
  liberer
  fin
`,
});
const boutique = (nom, vers, n, articles) => ({
  nom, annonce: false, musique: 'boutique', camera: 'interieur', interieur: true, velo: false,
  warps: [{ ...Bq(5, 6), vers, n }],
  objets: [{ id: 'vendeur', ...Bq(1, 3), sprite: 'vendeur', dir: DROITE, script: 'Vendeur' }],
  scripts: `
script Vendeur
  message "Bienvenue ! Que puis-je pour vous ?"
  boutique ${articles}
  message "Merci, à bientôt !"
  liberer
  fin
`,
});

const ZONES = {
  // — Bourg Geon et ses maisons : ceux de la démo —
  BOURG_GEON: bourgDemo,
  MAISON_1F: DEMO.zones.MAISON_1F,
  MAISON_2F: DEMO.zones.MAISON_2F,
  LABO_ORME: DEMO.zones.LABO_ORME,
  MAISON_VOISIN: DEMO.zones.MAISON_VOISIN,

  ROUTE_29: {
    nom: 'Route 29', musique: 'route29', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Fouinette', poids: 35, niveaux: [2, 4] }, { espece: 'Roucool', poids: 35, niveaux: [2, 4] },
        { espece: 'Rattata', poids: 20, niveaux: [2, 3] }, { espece: 'Hoothoot', poids: 10, niveaux: [2, 3] },
      ] },
    },
    warps: [{ x: 96 + 14, y: 64 + 2, vers: 'POSTE_46', n: 0 }],
    panneaux: [
      ...routeDemo.panneaux.filter((p) => p.x >= 128),
      { x: 96 + 14, y: 64 + 7, depuis: HAUT, script: 'PanneauR29' },
      ...baies(ROUTE29_OUEST, 96, 64, 'oran-berry'),
    ],
    objets: [
      ...routeDemo.objets.filter((o) => o.x >= 128),
      { id: 'randonneuse', x: 96 + 20, y: 64 + 16, sprite: 'randonneuse', mouvement: 'errance_gd', rayon: 3, script: 'Randonneuse' },
      { id: 'objet_r29', type: 'objet', x: 96 + 28, y: 64 + 16, sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R29_OUEST' },
    ],
    scripts: DEMO.zones.ROUTE_29.scripts + `
script PanneauR29
  message "ROUTE 29\\nVILLE GRIOTTE ← → BOURG GEON\\nLa ROUTE 46 est au nord, par le poste."
  fin
script Randonneuse
  regarder_joueur
  message "Les baies repoussent si tu marches un peu.\\nReviens les cueillir !"
  liberer
  fin
`,
  },
  POSTE_46: {
    nom: 'Route 29', annonce: false, musique: 'route29', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Po(5, 4), vers: 'ROUTE_29', n: 0 }],
    objets: [{ id: 'garde', ...Po(5, 1), sprite: 'garde', dir: BAS, script: 'GardePoste' }],
    scripts: `
script GardePoste
  message "La ROUTE 46 est fermée pour éboulement.\\nPasse par VILLE GRIOTTE !"
  liberer
  fin
`,
  },

  VILLE_GRIOTTE: {
    nom: 'Ville Griotte', musique: 'griotte', camera: 'ville',
    rencontres: { eau: { taux: 10, especes: [{ espece: 'Tentacool', niveaux: [15, 20] }, { espece: 'Ptitard', niveaux: [15, 20] }] } },
    warps: [
      { x: 64 + 6, y: 64 + 7, vers: 'CENTRE_GRIOTTE', n: 0 },
      { x: 64 + 25, y: 64 + 7, vers: 'BOUTIQUE_GRIOTTE', n: 0 },
      { x: 64 + 5, y: 64 + 16, vers: 'MAISON_GRIOTTE', n: 0 },
      { x: 64 + 24, y: 64 + 16, vers: 'MAISON_GUIDE', n: 0 },
    ],
    panneaux: [{ x: 64 + 23, y: 64 + 18, depuis: HAUT, script: 'PanneauGriotte' }],
    objets: [
      { id: 'guide', x: 64 + 28, y: 64 + 11, sprite: 'vieil_homme', dir: DROITE, mouvement: 'regard_hb', script: 'Guide' },
      { id: 'fillette', x: 64 + 12, y: 64 + 16, sprite: 'fillette2', mouvement: 'errance', rayon: 3, script: 'FilletteGriotte' },
      { id: 'pecheur', x: 64 + 10, y: 64 + 22, sprite: 'pecheur', dir: BAS, script: 'PecheurGriotte' },
    ],
    scripts: `
script PanneauGriotte
  message "VILLE GRIOTTE\\nLa ville au parfum de fleurs."
  fin
script Guide
  regarder_joueur
  si drapeau A_CARTE aller Guide_Deja
  message "Tu es nouveau ici, non ? Tiens, prends cette CARTE !\\nLe CENTRE POKéMON est à l'ouest, la BOUTIQUE à l'est."
  donner_objet carte
  drapeau A_CARTE
  liberer
  fin
Guide_Deja:
  message "La ROUTE 30 part vers le nord, jusqu'à MAUVILLE."
  liberer
  fin
script FilletteGriotte
  regarder_joueur
  message "La mer est belle aujourd'hui !"
  liberer
  fin
script PecheurGriotte
  regarder_joueur
  message "Avec SURF, on va sur la mer.\\nMais il faut d'abord le trouver !"
  liberer
  fin
`,
  },
  CENTRE_GRIOTTE: centre('Ville Griotte', 'VILLE_GRIOTTE', 0),
  BOUTIQUE_GRIOTTE: boutique('Ville Griotte', 'VILLE_GRIOTTE', 1, 'potion antidote paralyze-heal poke-ball'),
  MAISON_GRIOTTE: maison('Ville Griotte', 'VILLE_GRIOTTE', 2, { sprite: 'dame', script: 'Dame' }, `
script Dame
  regarder_joueur
  message "Mon mari est parti pêcher. Il rentre toujours bredouille !"
  liberer
  fin
`),
  MAISON_GUIDE: maison('Ville Griotte', 'VILLE_GRIOTTE', 3, { sprite: 'enfant', script: 'Enfant' }, `
script Enfant
  regarder_joueur
  message "Grand-père fait visiter la ville à tous les nouveaux."
  liberer
  fin
`),

  ROUTE_30: {
    nom: 'Route 30', musique: 'route30', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Chenipan', poids: 30, niveaux: [3, 4] }, { espece: 'Aspicot', poids: 30, niveaux: [3, 4] },
        { espece: 'Roucool', poids: 20, niveaux: [3, 4] }, { espece: 'Rattata', poids: 15, niveaux: [3, 4] }, { espece: 'Mimigal', poids: 5, niveaux: [3, 3] },
      ] },
    },
    warps: [
      { x: 64 + 24, y: 32 + 18, vers: 'MAISON_BAIES', n: 0 },
      { x: 64 + 21, y: 0 + 3, vers: 'M_POKEMON', n: 0 },
    ],
    panneaux: [
      { x: 64 + 6, y: 32 + 11, depuis: HAUT, script: 'PanneauR30' },
      { x: 64 + 22, y: 7, depuis: HAUT, script: 'PanneauMPokemon' },
      { x: 64 + 6, y: 26, depuis: HAUT, script: 'PanneauR30Nord' },
      ...baies(ROUTE30_SUD, 64, 32, 'pecha-berry'),
      ...baies(ROUTE30_NORD, 64, 0, 'cheri-berry'),
    ],
    objets: [
      { id: 'joey', x: 64 + 9, y: 32 + 20, sprite: 'gamin', dir: DROITE, nom: 'Gamin Joey',
        dresseur: { portee: 5, script: 'Joey_Defi', apres: 'Joey_Apres', equipe: [{ espece: 'Rattata', niveau: 4 }] } },
      { id: 'mikey', x: 64 + 22, y: 32 + 25, sprite: 'gamin', dir: GAUCHE, nom: 'Gamin Mikey',
        dresseur: { portee: 5, script: 'Mikey_Defi', apres: 'Mikey_Apres', equipe: [{ espece: 'Roucool', niveau: 2 }, { espece: 'Rattata', niveau: 4 }] } },
      { id: 'don', x: 64 + 11, y: 24, sprite: 'insectomane', dir: DROITE, nom: 'Insectomane Don',
        dresseur: { portee: 3, script: 'Don_Defi', apres: 'Don_Apres', equipe: [{ espece: 'Chenipan', niveau: 3 }, { espece: 'Chenipan', niveau: 3 }] } },
      { id: 'objet_r30', type: 'objet', x: 64 + 26, y: 32 + 3, sprite: 'objet', objet: 'antidote', drapeau: 'OBJ_R30_ANTIDOTE' },
    ],
    scripts: `
script PanneauR30
  message "ROUTE 30\\nMAUVILLE ↑ ↓ VILLE GRIOTTE"
  fin
script PanneauR30Nord
  message "ROUTE 30\\nLes rebords ne se remontent pas !"
  fin
script PanneauMPokemon
  message "MAISON DE M. POKéMON"
  fin
script Joey_Defi
  message "Mon RATTATA est dans le top des RATTATA !"
  combat_dresseur
  message "J'aurais dû choisir un autre POKéMON…"
  liberer
  fin
script Joey_Apres
  regarder_joueur
  message "On échange nos numéros ? … Non ? Tant pis."
  liberer
  fin
script Mikey_Defi
  message "Tu as des POKéMON ? Montre-moi ça !"
  combat_dresseur
  message "Pfff… J'ai perdu."
  liberer
  fin
script Mikey_Apres
  regarder_joueur
  message "Je dois m'entraîner davantage."
  liberer
  fin
script Don_Defi
  message "J'adore les POKéMON insectes ! Combat !"
  combat_dresseur
  message "Mes CHENIPAN ont besoin de repos…"
  liberer
  fin
script Don_Apres
  regarder_joueur
  message "Les insectes évoluent vite, tu sais."
  liberer
  fin
`,
  },
  MAISON_BAIES: maison('Route 30', 'ROUTE_30', 0, { sprite: 'jardinier', script: 'Jardinier' }, `
script Jardinier
  regarder_joueur
  si drapeau A_BAIES_R30 aller Jardinier_Deja
  message "Tu connais les baies ? Tiens, goûte celles-ci !"
  donner_objet oran-berry 3
  drapeau A_BAIES_R30
  liberer
  fin
Jardinier_Deja:
  message "Les arbres de la route donnent des baies tous les jours."
  liberer
  fin
`),
  M_POKEMON: maison('Route 30', 'ROUTE_30', 1, { sprite: 'savant', id: 'mpokemon', script: 'MPokemon' }, `
script MPokemon
  regarder_joueur
  si drapeau A_OEUF aller MPokemon_Deja
  si non drapeau A_POKEMON aller MPokemon_Sans
  message "Ah, tu viens de la part du PR ORME ?\\nVoici ce que j'ai trouvé : un ŒUF ! Rapporte-le-lui."
  donner_objet oeuf_mystere
  drapeau A_OEUF
  liberer
  fin
MPokemon_Sans:
  message "Je n'ouvre ma porte qu'aux dresseurs !"
  liberer
  fin
MPokemon_Deja:
  message "Le PR ORME saura quoi faire de cet ŒUF."
  liberer
  fin
`),

  ROUTE_31: {
    nom: 'Route 31', musique: 'route30', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Chétiflor', poids: 30, niveaux: [4, 5] }, { espece: 'Roucool', poids: 25, niveaux: [4, 5] },
        { espece: 'Rattata', poids: 20, niveaux: [4, 5] }, { espece: 'Chenipan', poids: 15, niveaux: [4, 4] }, { espece: 'Mimigal', poids: 10, niveaux: [4, 4] },
      ] },
    },
    warps: [{ x: 32 + 22, y: 4, vers: 'ANTRE_NOIR', n: 0 }],
    panneaux: [{ x: 32 + 23, y: 13, depuis: HAUT, script: 'PanneauR31' }, ...baies(ROUTE31, 32, 0, 'oran-berry')],
    objets: [
      { id: 'wade', x: 32 + 13, y: 7, sprite: 'insectomane', dir: BAS, nom: 'Insectomane Wade',
        dresseur: { portee: 3, script: 'Wade_Defi', apres: 'Wade_Apres', equipe: [{ espece: 'Chenipan', niveau: 2 }, { espece: 'Aspicot', niveau: 3 }, { espece: 'Chrysacier', niveau: 4 }] } },
      { id: 'arbre', type: 'arbre_coupe', x: 32 + 6, y: 6, sprite: 'arbre_coupe' },
      { id: 'cache', type: 'objet', x: 32 + 5, y: 4, sprite: 'objet', objet: 'super-potion', drapeau: 'OBJ_R31_CACHE' },
      { id: 'montagnard', x: 32 + 22, y: 6, sprite: 'montagnard', dir: BAS, script: 'Montagnard' },
    ],
    scripts: `
script PanneauR31
  message "ROUTE 31\\n← MAUVILLE"
  fin
script Wade_Defi
  message "Mes insectes sont prêts. Et toi ?"
  combat_dresseur
  message "Je les ai mal préparés…"
  liberer
  fin
script Wade_Apres
  regarder_joueur
  message "Il paraît qu'on trouve des baies tout près."
  liberer
  fin
script Montagnard
  regarder_joueur
  message "L'ANTRE NOIR est si sombre… Il faudrait FLASH."
  liberer
  fin
`,
  },
  ANTRE_NOIR: {
    nom: 'Antre Noir', musique: 'grotte', camera: 'grotte', velo: false, interieur: true,
    rencontres: { herbe: null },
    warps: [{ x: 14, y: 14, vers: 'ROUTE_31', n: 0 }],
    objets: [{ id: 'objet_antre', type: 'objet', x: 6, y: 4, sprite: 'objet', objet: 'awakening', drapeau: 'OBJ_ANTRE' }],
  },

  MAUVILLE: {
    nom: 'Mauville', musique: 'mauville', camera: 'ville',
    rencontres: { eau: { taux: 10, especes: [{ espece: 'Ptitard', niveaux: [10, 15] }, { espece: 'Magicarpe', niveaux: [5, 10] }] } },
    warps: [
      { x: 15, y: 5, vers: 'TOUR_1F', n: 0 },
      { x: 8, y: 14, vers: 'CENTRE_MAUVILLE', n: 0 },
      { x: 19, y: 14, vers: 'BOUTIQUE_MAUVILLE', n: 0 },
      { x: 8, y: 18, vers: 'ARENE_MAUVILLE', n: 0 },
      { x: 20, y: 18, vers: 'ECOLE', n: 0 },
      { x: 7, y: 23, vers: 'MAISON_MAUVILLE_1', n: 0 },
      { x: 22, y: 23, vers: 'MAISON_MAUVILLE_2', n: 0 },
    ],
    panneaux: [],
    objets: [
      { id: 'vieux', x: 13, y: 9, sprite: 'vieil_homme', dir: BAS, script: 'VieuxTour' },
      { id: 'passante', x: 24, y: 20, sprite: 'habitante', mouvement: 'errance', rayon: 3, script: 'Passante' },
      { id: 'gamin', x: 14, y: 24, sprite: 'enfant', mouvement: 'errance', rayon: 2, script: 'GaminMauville' },
    ],
    scripts: `
script VieuxTour
  regarder_joueur
  message "La TOUR CHÉTIFLOR oscille comme une tige au vent.\\nLes Sages s'y entraînent."
  liberer
  fin
script Passante
  regarder_joueur
  message "ALBERT, le Champion, adore les POKéMON oiseaux."
  liberer
  fin
script GaminMauville
  regarder_joueur
  message "À l'ÉCOLE, on apprend les types des POKéMON !"
  liberer
  fin
`,
  },
  CENTRE_MAUVILLE: centre('Mauville', 'MAUVILLE', 1),
  BOUTIQUE_MAUVILLE: boutique('Mauville', 'MAUVILLE', 2, 'potion super-potion antidote paralyze-heal awakening repel poke-ball'),
  MAISON_MAUVILLE_1: maison('Mauville', 'MAUVILLE', 5, { sprite: 'kimono', script: 'Kimono' }, `
script Kimono
  regarder_joueur
  message "On dit que les Sages de la TOUR gardent une CS précieuse."
  liberer
  fin
`),
  MAISON_MAUVILLE_2: maison('Mauville', 'MAUVILLE', 6, { sprite: 'marin', script: 'Marin' }, `
script Marin
  regarder_joueur
  message "Je suis marin, mais j'ai le mal de mer…"
  liberer
  fin
`),
  TOUR_1F: {
    nom: 'Tour Chétiflor', musique: 'tour', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Tw(5, 7), vers: 'MAUVILLE', n: 0 }, { ...Tw(10, 1), vers: 'TOUR_2F', n: 0, sortie: BAS }],
    objets: [{ id: 'sage_entree', ...Tw(2, 5), sprite: 'pretre', dir: DROITE, script: 'SageEntree' }],
    scripts: `
script SageEntree
  regarder_joueur
  message "Le pilier central de la tour est un CHÉTIFLOR géant.\\nIl l'empêche de tomber."
  liberer
  fin
`,
  },
  TOUR_2F: {
    nom: 'Tour Chétiflor', annonce: false, musique: 'tour', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Tw(10, 1), vers: 'TOUR_1F', n: 1, sortie: BAS }, { ...Tw(1, 6), vers: 'TOUR_3F', n: 0, sortie: BAS }],
    objets: [
      { id: 'sage_nico', ...Tw(8, 5), sprite: 'pretre', dir: GAUCHE, nom: 'Sage Nico',
        dresseur: { portee: 3, script: 'Nico_Defi', apres: 'Nico_Apres', equipe: [{ espece: 'Chétiflor', niveau: 3 }, { espece: 'Chétiflor', niveau: 3 }] } },
      { id: 'sage_chow', ...Tw(3, 2), sprite: 'pretre', dir: BAS, nom: 'Sage Chow',
        dresseur: { portee: 3, script: 'Chow_Defi', apres: 'Chow_Apres', equipe: [{ espece: 'Chétiflor', niveau: 3 }] } },
    ],
    scripts: `
script Nico_Defi
  message "Sois aussi souple qu'un CHÉTIFLOR !"
  combat_dresseur
  message "Tu plies sans rompre…"
  liberer
  fin
script Nico_Apres
  regarder_joueur
  message "Le Sage LI t'attend en haut."
  liberer
  fin
script Chow_Defi
  message "Nous nous entraînons ici jour et nuit."
  combat_dresseur
  message "Excellent !"
  liberer
  fin
script Chow_Apres
  regarder_joueur
  message "La tour oscille, mais ne tombe jamais."
  liberer
  fin
`,
  },
  TOUR_3F: {
    nom: 'Tour Chétiflor', annonce: false, musique: 'tour', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Tw(1, 6), vers: 'TOUR_2F', n: 1, sortie: BAS }],
    objets: [
      { id: 'sage_li', ...Tw(5, 1), sprite: 'pretre', dir: BAS, nom: 'Sage Li',
        dresseur: { portee: 0, script: 'Li_Defi', apres: 'Li_Apres', equipe: [{ espece: 'Chétiflor', niveau: 7 }, { espece: 'Chétiflor', niveau: 7 }, { espece: 'Hoothoot', niveau: 10 }] } },
    ],
    scripts: `
script Li_Defi
  message "Bienvenue au sommet. Montre-moi le lien qui t'unit à tes POKéMON."
  combat_dresseur
  message "Ce lien est solide. Prends cette CS FLASH."
  drapeau CS_FLASH
  liberer
  fin
script Li_Apres
  regarder_joueur
  message "FLASH éclaire les grottes les plus sombres."
  liberer
  fin
`,
  },
  ARENE_MAUVILLE: {
    nom: 'Mauville', annonce: false, musique: 'arene', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Ar(7, 9), vers: 'MAUVILLE', n: 3 }],
    objets: [
      { id: 'albert', ...Ar(6, 1), sprite: 'montagnard', dir: BAS, nom: 'Champion Albert',
        dresseur: { portee: 0, champion: true, script: 'Albert_Defi', apres: 'Albert_Apres', prix: 900, equipe: [{ espece: 'Roucool', niveau: 9 }, { espece: 'Roucoups', niveau: 13 }] } },
      { id: 'ornitho_1', ...Ar(3, 6), sprite: 'topdresseur', dir: DROITE, nom: 'Ornithologue Rod',
        dresseur: { portee: 3, script: 'Rod_Defi', apres: 'Rod_Apres', equipe: [{ espece: 'Roucool', niveau: 7 }, { espece: 'Roucool', niveau: 7 }] } },
      { id: 'ornitho_2', ...Ar(10, 4), sprite: 'topdresseuse', dir: GAUCHE, nom: 'Ornithologue Abe',
        dresseur: { portee: 3, script: 'Abe_Defi', apres: 'Abe_Apres', equipe: [{ espece: 'Piafabec', niveau: 9 }] } },
      { id: 'guide_arene', ...Ar(9, 8), sprite: 'habitant', dir: GAUCHE, script: 'GuideArene' },
    ],
    scripts: `
script Albert_Defi
  message "Je suis ALBERT, Champion de MAUVILLE.\\nLes POKéMON oiseaux sont les plus nobles qui soient !"
  combat_dresseur
  message "Mes oiseaux… vaincus ! Voici le BADGE ZÉPHYR."
  drapeau BADGE_ZEPHYR
  son fanfare
  message "{JOUEUR} reçoit le BADGE ZÉPHYR !"
  liberer
  fin
script Albert_Apres
  regarder_joueur
  message "Ce BADGE prouve ta valeur. Va, et reviens plus fort !"
  liberer
  fin
script Rod_Defi
  message "Les ailes de mes POKéMON sont mes ailes !"
  combat_dresseur
  message "Atterrissage forcé…"
  liberer
  fin
script Rod_Apres
  regarder_joueur
  message "ALBERT est bien plus fort que moi."
  liberer
  fin
script Abe_Defi
  message "Tu veux voir ALBERT ? Passe d'abord par moi !"
  combat_dresseur
  message "Bon, vas-y…"
  liberer
  fin
script Abe_Apres
  regarder_joueur
  message "Bonne chance !"
  liberer
  fin
script GuideArene
  regarder_joueur
  si drapeau BADGE_ZEPHYR aller GuideArene_Bravo
  message "Hé, futur Champion ! ALBERT utilise des POKéMON VOL.\\nLes types ÉLECTRIK et ROCHE font mouche !"
  liberer
  fin
GuideArene_Bravo:
  message "Bravo pour le BADGE ZÉPHYR !"
  liberer
  fin
`,
  },
  ECOLE: {
    nom: 'Mauville', annonce: false, musique: 'mauville', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...Ec(5, 6), vers: 'MAUVILLE', n: 4 }],
    objets: [
      { id: 'professeur', ...Ec(6, 2), sprite: 'savant', dir: BAS, script: 'Professeur' },
      { id: 'eleve', ...Ec(3, 5), sprite: 'gamin', dir: HAUT, script: 'Eleve' },
    ],
    scripts: `
script Professeur
  regarder_joueur
  si drapeau CS_COUPE aller Professeur_Deja
  message "Bienvenue à l'ÉCOLE ! Pour ta première leçon, prends cette CS COUPE.\\nFace à un petit arbre, appuie sur A."
  drapeau CS_COUPE
  liberer
  fin
Professeur_Deja:
  message "Un arbre coupé repel quand tu quittes la zone."
  liberer
  fin
script Eleve
  regarder_joueur
  message "J'apprends les faiblesses des types… c'est dur !"
  liberer
  fin
`,
  },
};

const interieur = (bloc, zone) => mondeSimple(bloc, zone);

export const JOHTO = {
  sols: SOLS,
  blocs: {
    bourg: BOURG, route29_est: ROUTE_B, route29_ouest: ROUTE29_OUEST, griotte: GRIOTTE, route30_sud: ROUTE30_SUD, route30_nord: ROUTE30_NORD,
    route31: ROUTE31, mauville: MAUVILLE,
    maison_1f: MAISON_1F, maison_2f: MAISON_2F, labo: LABO, voisin: VOISIN, centre: CENTRE, boutique: BOUTIQUE, poste: POSTE,
    tour_1: TOUR_1, tour_2: TOUR_2, tour_3: TOUR_3, arene: ARENE, ecole: ECOLE, antre: ANTRE,
  },
  mondes: {
    johto: {
      largeur: 6, hauteur: 3,
      blocs: ['mauville', 'route31', 'route30_nord', null, null, null,
        null, null, 'route30_sud', null, null, null,
        null, null, 'griotte', 'route29_ouest', 'route29_est', 'bourg'],
      zones: ['MAUVILLE', 'ROUTE_31', 'ROUTE_30', null, null, null,
        null, null, 'ROUTE_30', null, null, null,
        null, null, 'VILLE_GRIOTTE', 'ROUTE_29', 'ROUTE_29', 'BOURG_GEON'],
    },
    maison_1f: interieur('maison_1f', 'MAISON_1F'), maison_2f: interieur('maison_2f', 'MAISON_2F'),
    labo: interieur('labo', 'LABO_ORME'), voisin: interieur('voisin', 'MAISON_VOISIN'),
    poste_46: interieur('poste', 'POSTE_46'),
    centre_griotte: interieur('centre', 'CENTRE_GRIOTTE'), boutique_griotte: interieur('boutique', 'BOUTIQUE_GRIOTTE'),
    maison_griotte: interieur('voisin', 'MAISON_GRIOTTE'), maison_guide: interieur('voisin', 'MAISON_GUIDE'),
    maison_baies: interieur('voisin', 'MAISON_BAIES'), m_pokemon: interieur('voisin', 'M_POKEMON'),
    antre_noir: interieur('antre', 'ANTRE_NOIR'),
    centre_mauville: interieur('centre', 'CENTRE_MAUVILLE'), boutique_mauville: interieur('boutique', 'BOUTIQUE_MAUVILLE'),
    maison_mauville_1: interieur('voisin', 'MAISON_MAUVILLE_1'), maison_mauville_2: interieur('voisin', 'MAISON_MAUVILLE_2'),
    tour_1f: interieur('tour_1', 'TOUR_1F'), tour_2f: interieur('tour_2', 'TOUR_2F'), tour_3f: interieur('tour_3', 'TOUR_3F'),
    arene_mauville: interieur('arene', 'ARENE_MAUVILLE'), ecole: interieur('ecole', 'ECOLE'),
  },
  zones: ZONES,
};
/** départ d'une nouvelle partie : dans la chambre */
export const DEPART = { zone: 'MAISON_2F', x: 14, y: 13, dir: BAS };
