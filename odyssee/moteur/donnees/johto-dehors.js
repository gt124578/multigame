// odyssee/moteur/donnees/johto-dehors.js — le dehors du début de HeartGold / SoulSilver, aux positions réelles.
//
// Les positions viennent des données publiques de la décompilation (pret/pokeheartgold : matrice du monde et
// événements de chaque zone : portes, personnages, panneaux, déclencheurs) ; elles sont recopiées ici à la main,
// comme on relève un plan. Les bâtiments sont posés par leur porte, avec l'emprise de leur vrai modèle 3D.
// Le sol (herbe, chemins, hautes herbes, rebords, eau) n'est PAS dans ces données (il est dans la ROM) : il est
// redessiné autour de ces repères, d'après le jeu.
//
// Coordonnées réelles : x de 448 (ouest de Mauville) à 735, z de 224 à 447 ; le monde du moteur commence au coin
// (448, 224) : R(x, z) convertit.
//   colonnes de la matrice : 14 15 | 16 17 | 18 19 20 | 21 | 22
//   ligne 7  : Mauville Mauville  .  .  ...
//   ligne 8  : Mauville Mauville  Route31 Route31
//   lignes 9 à 11 :                     .  Route30
//   ligne 12 :                    Griotte Griotte  Route29 ×3  BourgGeon  mer
//   ligne 13 : mer

import { Peintre } from './peintre.js';
import { BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';

export const OX = 448, OY = 224;
export const R = (x, y) => ({ x: x - OX, y: y - OY });
const P = new Peintre(OX, OY, 9, 7, 'T');

// ——— mer et rivages au sud et à l'est ———
P.rect('≈', 448, 416, 735, 447);          // ligne 13 : la mer (on n'y va pas)
P.rect('≈', 704, 224, 735, 447);          // colonne 22 : vers la Route 27

// ——— Bourg Geon (672-703 × 384-415) ———
P.rect('.', 674, 386, 700, 413);
P.rect('.', 672, 396, 673, 402);          // sortie ouest (7 cases, comme le déclencheur du jeu)
P.rect('~', 701, 386, 703, 413);          // l'eau à l'est
P.rect('S', 700, 386, 700, 413);
P.rect('F', 686, 399, 688, 401);
P.rect('F', 697, 408, 699, 410);
P.batiment('wk_labo', 684, 393, { modele: 'labo' });
P.batiment('wk_hhouse', 695, 396);
P.batiment('wk_h01', 679, 405);
P.batiment('wk_h02', 690, 407);
for (const [x, y] of [[682, 393], [693, 396], [685, 400], [688, 407]]) P.point('p', x, y);

// ——— Route 29 (576-671 × 384-415) ———
P.rect('.', 576, 394, 671, 404);          // bande principale
P.rect('=', 576, 397, 671, 400);          // le chemin
P.rect('=', 664, 396, 671, 402);
P.rect('.', 588, 386, 662, 393);          // partie nord, au-dessus des rebords
P.rect('"', 596, 387, 612, 392);
P.rect('"', 640, 387, 656, 392);
P.rect('v', 588, 393, 620, 393);          // rebords : on saute vers le sud, on ne remonte que par le passage du poste
P.rect('v', 633, 393, 662, 393);
P.rect('.', 586, 405, 662, 412);          // partie sud
P.rect('"', 594, 406, 616, 411);
P.rect('"', 634, 406, 652, 411);
P.rect('T', 618, 408, 621, 412);
P.point('A', 596, 392);                    // arbre à noigrumes (ici : arbre à baies)
for (const [x, y] of [[581, 397], [662, 397]]) P.point('p', x, y);
P.rect('.', 622, 386, 631, 393);
P.batiment('gate_a', 626, 389, { large: 2, modele: 'poste' });   // poste de garde vers la Route 46

// ——— Ville Griotte (512-575 × 384-415) ———
P.rect('.', 542, 386, 573, 409);
P.rect('.', 547, 384, 550, 385);          // sortie nord vers la Route 30
P.rect('.', 566, 393, 575, 400);          // sortie est vers la Route 29
P.rect('P', 542, 393, 573, 396);          // la rue
P.rect('P', 547, 384, 550, 392);
P.rect('S', 530, 386, 541, 409);          // la plage, la baie
P.rect('S', 530, 410, 575, 411);
P.rect('~', 512, 386, 529, 415);
P.rect('~', 530, 412, 575, 415);
P.rect('_', 526, 405, 531, 406);          // ponton
P.batiment('pc', 564, 391, { modele: 'centre' });
P.batiment('fs', 555, 391, { modele: 'boutique' });
P.batiment('yo_h01', 547, 399);
P.batiment('yo_h02', 558, 401);
P.batiment('yo_h01', 567, 405);
for (const [x, y] of [[556, 401], [554, 396]]) P.point('p', x, y);

// ——— Route 30 (544-575 × 288-383) ———
P.rect('.', 546, 290, 571, 381);
P.rect('=', 547, 358, 550, 383);          // chemin depuis Griotte
P.rect('=', 547, 356, 552, 359);
P.rect('=', 549, 288, 552, 357);          // puis vers le nord
P.rect('"', 556, 336, 563, 347);
P.rect('"', 546, 310, 548, 322);
P.rect('"', 555, 300, 560, 310);
P.rect('"', 553, 366, 556, 378);
P.rect('"', 558, 368, 566, 378);
P.rect('v', 555, 350, 570, 350);
P.rect('T', 564, 320, 571, 330);
P.rect('T', 546, 340, 547, 352);
P.rect('.', 553, 293, 573, 299);
P.rect('=', 553, 295, 568, 296);
P.batiment('r30_h01', 568, 294);          // maison de M. POKéMON
P.batiment('r30_h01', 555, 355);          // maison aux noigrumes
for (const [x, y] of [[553, 355], [562, 293]]) P.point('A', x, y);
for (const [x, y] of [[554, 363], [561, 332], [548, 319], [566, 294]]) P.point('p', x, y);

// ——— Route 31 (512-575 × 256-287) ———
P.rect('.', 520, 263, 570, 284);
P.rect('=', 549, 268, 552, 287);
P.rect('=', 519, 269, 552, 272);
P.rect('"', 530, 276, 546, 283);
P.rect('"', 556, 276, 567, 283);
P.rect('T', 524, 263, 534, 266);
P.point('A', 538, 271);
for (const [x, y] of [[522, 268], [563, 270]]) P.point('p', x, y);
P.boite('grotte', 564, 267, 3, 3, 1);     // l'Antre Noir (porte en 565, 269)
P.emprise('gate_a', 512, 266, 517, 273, { rot: 90 });   // poste de garde vers Mauville
P.point('D', 518, 269); P.point('D', 518, 270);

// ——— Mauville (448-511 × 224-287) ———
P.rect('.', 450, 226, 509, 285);
P.rect('w', 474, 224, 500, 241);          // l'étang de la Tour Chétiflor
P.rect('.', 479, 224, 496, 233);
P.rect('_', 486, 234, 488, 241);          // le pont
P.rect('P', 452, 258, 509, 261);
P.rect('P', 486, 242, 489, 285);
P.rect('P', 489, 264, 510, 266);
P.rect('P', 503, 266, 510, 271);
P.batiment('kk_mada', 487, 228, { modele: 'tour' });
P.batiment('kk_gym', 479, 257, { modele: 'arene' });
P.batiment('kk_school', 495, 257, { modele: 'ecole' });
P.batiment('kk_fs', 469, 257, { modele: 'boutique' });
P.batiment('kk_pc', 497, 271, { modele: 'centre' });
P.batiment('kk_h01', 459, 254);
P.batiment('kk_h01', 484, 277);
for (const [x, y] of [[491, 257], [488, 263], [475, 257], [485, 230]]) P.point('p', x, y);
P.point('o', 503, 261);
P.rect('.', 510, 269, 511, 270);
P.point('D', 511, 269); P.point('D', 511, 270);
P.emprise('gate_a', 448, 243, 453, 250, { rot: 90 });   // poste de garde vers la Route 36
P.point('D', 454, 246); P.point('D', 454, 247);

export const LEGENDE_DEHORS = {
  '≈': { col: 1, sol: 'eau_profonde' },
  '%': { col: 1, sol: 'herbe' },
  'D': { sol: 'herbe', mb: 12 },
};
export const BLOCS_DEHORS = P.blocs('jo', LEGENDE_DEHORS);

/** zone de chaque case de la matrice (9 × 7, ligne par ligne) */
const Z = { M: 'MAUVILLE', R31: 'ROUTE_31', R30: 'ROUTE_30', G: 'VILLE_GRIOTTE', R29: 'ROUTE_29', B: 'BOURG_GEON' };
const GRILLE = [
  ['M', 'M', null, null, null, null, null, null, null],
  ['M', 'M', 'R31', 'R31', null, null, null, null, null],
  [null, null, null, 'R30', null, null, null, null, null],
  [null, null, null, 'R30', null, null, null, null, null],
  [null, null, null, 'R30', null, null, null, null, null],
  [null, null, 'G', 'G', 'R29', 'R29', 'R29', 'B', null],
  [null, null, null, null, null, null, null, null, null],
];
export const MONDE_JOHTO = {
  largeur: 9, hauteur: 7,
  blocs: GRILLE.flatMap((l, by) => l.map((_, bx) => `jo_${bx}_${by}`)),
  zones: GRILLE.flat().map((k) => (k ? Z[k] : null)),
};

const A = (x, y, baie) => ({ ...R(x, y), script: 'ArbreBaies', baie });

/** événements des zones du dehors (positions réelles) ; scripts et rencontres restent dans johto.js */
export const ZONES_DEHORS = {
  BOURG_GEON: {
    warps: [
      { ...R(684, 393), vers: 'LABO_ORME', n: 0 },
      { ...R(695, 396), vers: 'MAISON_1F', n: 0 },
      { ...R(679, 405), vers: 'MAISON_VOISIN', n: 0 },
      { ...R(690, 407), vers: 'MAISON_RIVAL', n: 0 },
    ],
    panneaux: [
      { ...R(682, 393), depuis: HAUT, script: 'PanneauLabo' },
      { ...R(693, 396), depuis: HAUT, script: 'BoiteJoueur' },
      { ...R(685, 400), depuis: HAUT, script: 'PanneauBourg' },
      { ...R(688, 407), depuis: HAUT, script: 'BoiteRival' },
    ],
    declencheurs: [{ ...R(676, 396), l: 1, h: 7, var: 'ORME_POKEMON', val: 0, script: 'PasSansPokemon' }],
    objets: [
      { id: 'fillette', ...R(683, 399), sprite: 'habitante', mouvement: 'regard_alea', script: 'Fillette' },
      { id: 'costaud', ...R(685, 408), sprite: 'habitant', mouvement: 'errance', rayon: 1, script: 'Costaud' },
      { id: 'pecheur', ...R(699, 404), sprite: 'pecheur', dir: DROITE, mouvement: 'regard_hb', script: 'Pecheur' },
    ],
  },
  ROUTE_29: {
    warps: [{ ...R(626, 389), vers: 'POSTE_46', n: 0 }, { ...R(627, 389), vers: 'POSTE_46', n: 0 }],
    panneaux: [
      { ...R(581, 397), depuis: HAUT, script: 'PanneauR29' },
      { ...R(662, 397), depuis: HAUT, script: 'PanneauR29Est' },
      A(596, 392, 'oran-berry'),
    ],
    objets: [
      { id: 'gamin_r29', ...R(626, 410), sprite: 'gamin', mouvement: 'errance_hb', rayon: 1, script: 'GaminR29' },
      { id: 'costaud_r29', ...R(622, 392), sprite: 'montagnard', dir: BAS, script: 'CostaudR29' },
      { id: 'monsieur_r29', ...R(600, 395), sprite: 'habitant', dir: BAS, script: 'MonsieurR29' },
      { id: 'randonneuse', ...R(608, 404), sprite: 'randonneuse', mouvement: 'errance_gd', rayon: 1, script: 'Randonneuse' },
      { id: 'arbre_a', type: 'arbre_coupe', ...R(629, 401), sprite: 'arbre_coupe' },
      { id: 'arbre_b', type: 'arbre_coupe', ...R(619, 405), sprite: 'arbre_coupe' },
      { id: 'potion_r29', type: 'objet', ...R(654, 386), sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R29_POTION' },
    ],
  },
  VILLE_GRIOTTE: {
    warps: [
      { ...R(564, 391), vers: 'CENTRE_GRIOTTE', n: 0 },
      { ...R(555, 391), vers: 'BOUTIQUE_GRIOTTE', n: 0 },
      { ...R(547, 399), vers: 'MAISON_GRIOTTE', n: 0 },
      { ...R(558, 401), vers: 'MAISON_GUIDE', n: 0 },
      { ...R(567, 405), vers: 'MAISON_GRIOTTE_SE', n: 0 },
    ],
    panneaux: [{ ...R(554, 396), depuis: HAUT, script: 'PanneauGriotte' }, { ...R(556, 401), depuis: HAUT, script: 'PanneauGuide' }],
    objets: [
      { id: 'guide', ...R(566, 396), sprite: 'vieil_homme', dir: BAS, mouvement: 'regard_gd', script: 'Guide' },
      { id: 'fillette', ...R(554, 399), sprite: 'gamin', mouvement: 'errance_hb', rayon: 1, script: 'FilletteGriotte' },
      { id: 'passante', ...R(561, 407), sprite: 'habitante', mouvement: 'errance_gd', rayon: 1, script: 'PassanteGriotte' },
      { id: 'pecheur', ...R(530, 406), sprite: 'pecheur', dir: GAUCHE, script: 'PecheurGriotte' },
    ],
  },
  ROUTE_30: {
    warps: [{ ...R(555, 355), vers: 'MAISON_BAIES', n: 0 }, { ...R(568, 294), vers: 'M_POKEMON', n: 0 }],
    panneaux: [
      { ...R(554, 363), depuis: HAUT, script: 'PanneauR30' },
      { ...R(561, 332), depuis: HAUT, script: 'PanneauR30Nord' },
      { ...R(548, 319), depuis: HAUT, script: 'PanneauR30Conseil' },
      { ...R(566, 294), depuis: HAUT, script: 'PanneauMPokemon' },
      A(553, 355, 'pecha-berry'), A(562, 293, 'cheri-berry'),
    ],
    objets: [
      { id: 'joey', ...R(553, 332), sprite: 'gamin', dir: GAUCHE, nom: 'Gamin Joey',
        dresseur: { portee: 4, script: 'Joey_Defi', apres: 'Joey_Apres', equipe: [{ espece: 'Rattata', niveau: 4 }] } },
      { id: 'mikey', ...R(552, 325), sprite: 'gamin', dir: BAS, nom: 'Gamin Mikey',
        dresseur: { portee: 3, script: 'Mikey_Defi', apres: 'Mikey_Apres', equipe: [{ espece: 'Roucool', niveau: 2 }, { espece: 'Rattata', niveau: 4 }] } },
      { id: 'don', ...R(550, 298), sprite: 'insectomane', dir: DROITE, nom: 'Insectomane Don',
        dresseur: { portee: 3, script: 'Don_Defi', apres: 'Don_Apres', equipe: [{ espece: 'Chenipan', niveau: 3 }, { espece: 'Chenipan', niveau: 3 }] } },
      { id: 'monsieur_r30', ...R(554, 335), sprite: 'habitant', mouvement: 'errance_gd', rayon: 1, script: 'MonsieurR30' },
      { id: 'fille_r30', ...R(548, 306), sprite: 'fillette', dir: BAS, script: 'FilleR30' },
      { id: 'gamin_r30', ...R(557, 366), sprite: 'gamin', mouvement: 'errance_hb', rayon: 1, script: 'GaminR30' },
      { id: 'antidote_r30', type: 'objet', ...R(554, 342), sprite: 'objet', objet: 'antidote', drapeau: 'OBJ_R30_ANTIDOTE' },
      { id: 'potion_r30', type: 'objet', ...R(564, 369), sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R30_POTION' },
    ],
  },
  ROUTE_31: {
    warps: [
      { ...R(565, 269), vers: 'ANTRE_NOIR', n: 0 },
      { ...R(518, 269), vers: 'POSTE_31', n: 1, sortie: DROITE },
      { ...R(518, 270), vers: 'POSTE_31', n: 1, sortie: DROITE },
    ],
    panneaux: [{ ...R(522, 268), depuis: HAUT, script: 'PanneauR31' }, { ...R(563, 270), depuis: HAUT, script: 'PanneauAntre' }, A(538, 271, 'oran-berry')],
    objets: [
      { id: 'wade', ...R(540, 279), sprite: 'insectomane', dir: HAUT, nom: 'Insectomane Wade',
        dresseur: { portee: 4, script: 'Wade_Defi', apres: 'Wade_Apres', equipe: [{ espece: 'Chenipan', niveau: 2 }, { espece: 'Aspicot', niveau: 3 }, { espece: 'Chrysacier', niveau: 4 }] } },
      { id: 'montagnard', ...R(564, 273), sprite: 'montagnard', mouvement: 'errance', rayon: 1, script: 'Montagnard' },
      { id: 'costaud_r31', ...R(540, 271), sprite: 'habitant', dir: HAUT, script: 'CostaudR31' },
      { id: 'gamin_r31', ...R(528, 268), sprite: 'enfant', mouvement: 'errance', rayon: 1, script: 'GaminR31' },
      { id: 'arbre', type: 'arbre_coupe', ...R(552, 277), sprite: 'arbre_coupe' },
      { id: 'arbre_b', type: 'arbre_coupe', ...R(533, 268), sprite: 'arbre_coupe' },
      { id: 'potion_r31', type: 'objet', ...R(557, 269), sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R31_POTION' },
      { id: 'ball_r31', type: 'objet', ...R(545, 281), sprite: 'objet', objet: 'poke-ball', drapeau: 'OBJ_R31_BALL' },
    ],
  },
  MAUVILLE: {
    warps: [
      { ...R(487, 228), vers: 'TOUR_1F', n: 0 },
      { ...R(497, 271), vers: 'CENTRE_MAUVILLE', n: 0 },
      { ...R(469, 257), vers: 'BOUTIQUE_MAUVILLE', n: 0 },
      { ...R(479, 257), vers: 'ARENE_MAUVILLE', n: 0 },
      { ...R(495, 257), vers: 'ECOLE', n: 0 },
      { ...R(459, 254), vers: 'MAISON_MAUVILLE_1', n: 0 },
      { ...R(484, 277), vers: 'MAISON_MAUVILLE_2', n: 0 },
      { ...R(511, 269), vers: 'POSTE_31', n: 0, sortie: GAUCHE },
      { ...R(511, 270), vers: 'POSTE_31', n: 0, sortie: GAUCHE },
      { ...R(454, 246), vers: 'POSTE_36', n: 0, sortie: DROITE },
      { ...R(454, 247), vers: 'POSTE_36', n: 0, sortie: DROITE },
    ],
    panneaux: [
      { ...R(491, 257), depuis: HAUT, script: 'PanneauEcole' },
      { ...R(488, 263), depuis: HAUT, script: 'PanneauMauville' },
      { ...R(475, 257), depuis: HAUT, script: 'PanneauArene' },
      { ...R(485, 230), depuis: HAUT, script: 'PanneauTour' },
    ],
    objets: [
      { id: 'vieux', ...R(479, 263), sprite: 'vieil_homme', mouvement: 'errance_gd', rayon: 1, script: 'VieuxTour' },
      { id: 'passante', ...R(492, 275), sprite: 'habitante', mouvement: 'errance', rayon: 1, script: 'Passante' },
      { id: 'gamin', ...R(462, 259), sprite: 'enfant', mouvement: 'regard_alea', script: 'GaminMauville' },
      { id: 'monsieur', ...R(489, 254), sprite: 'habitant', mouvement: 'errance', rayon: 1, script: 'MonsieurMauville' },
      { id: 'costaud', ...R(474, 252), sprite: 'montagnard', mouvement: 'regard_alea', script: 'CostaudMauville' },
      { id: 'jongleur', ...R(500, 272), sprite: 'topdresseur', dir: BAS, script: 'Jongleur' },
      { id: 'objet_m1', type: 'objet', ...R(504, 237), sprite: 'objet', objet: 'potion', drapeau: 'OBJ_MAUVILLE_1' },
      { id: 'objet_m2', type: 'objet', ...R(459, 229), sprite: 'objet', objet: 'awakening', drapeau: 'OBJ_MAUVILLE_2' },
    ],
    declencheurs: [],
  },
};
