// odyssee/moteur/donnees/interieurs.js — intérieurs de HeartGold / SoulSilver aux coordonnées du jeu :
// maison du joueur (rez-de-chaussée et chambre), labo du Pr Orme, maison habitée, Centre POKéMON (et son sous-sol),
// boutique, et l'Arène d'Acajou (trois salles de glace).
//
// Ce qui vient des données publiques de la décompilation (pret/pokeheartgold, fichiers zone_event) : la taille des
// pièces déduite des événements, la place des portes, des escaliers, des personnages et des points d'intérêt
// (évier, télé, PC…), et dans l'arène la place des dresseurs, des blocs de glace, de FRIGO et des passages.
// Ce qui ne s'y trouve pas (le sol exact, la place des meubles, le tracé de la glace) est redessiné : les meubles
// sont les vrais modèles de HGSS (archive bm_room, lue à la volée), posés là où le jeu les montre ; les énigmes de
// glace ont été cherchées par un solveur autour des positions réelles, puis vérifiées (tools/test-moteur-hgss.mjs).

import { bloc, piecesHGSS } from './auteur.js';
import { MB, BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';

// ——— outils ———
/**
 * Une pièce : sol de (x1, y1) à (x2, y2), murs autour (le mur du fond monte jusqu'en haut du bloc).
 * Rend une grille de caractères à retoucher (`mettre`), puis `plan()`.
 */
function salle(x1, y1, x2, y2) {
  const g = [];
  for (let y = 0; y <= y2 + 1; y++) {
    const l = [];
    for (let x = 0; x <= x2 + 1; x++) l.push(x >= x1 && x <= x2 && y >= y1 && y <= y2 ? '.' : 'W');
    g.push(l);
  }
  return {
    g,
    mettre(x, y, c) { g[y][x] = c; return this; },
    plan() { return g.map((l) => l.join('')); },
  };
}
/** escalier de HGSS posé sur sa case de passage (x, y) ; la case voisine (côté `cote`) est bloquée */
const escalier = (s, m, x, y, cote = -1) => { s.mettre(x, y, 'E'); s.mettre(x + cote, y, '#'); return { m, x: Math.min(x, x + cote), y: y - 1, l: 2, p: 2, libre: true, creux: /_d0/.test(m) }; };

// ——— maison du joueur, rez-de-chaussée (T20R0201) ———
const s1 = salle(1, 3, 12, 10).mettre(3, 10, 'm');
const esc1 = escalier(s1, 'stair_u01', 3, 3);
export const MAISON_1F = bloc({ plan: s1.plan(), legende: piecesHGSS('parquet', 'mur'), meubles: [
  esc1,
  { m: 'sink01', x: 5, y: 3, l: 2, repli: 'cuisine' }, { m: 'tv01', x: 8, y: 3, l: 2, repli: 'tele' },
  { m: 'ref01', x: 11, y: 3 }, { m: 'plant01', x: 12, y: 3 },
  { m: 'table02_2', x: 7, y: 6, l: 2, p: 2, repli: 'table' },
  { m: 'chair01', x: 7, y: 5, libre: true }, { m: 'chair01', x: 8, y: 5, libre: true },
  { m: 'chair01', x: 7, y: 8, libre: true }, { m: 'chair01', x: 8, y: 8, libre: true },
  { m: 'clock01', x: 10, y: 2, mur: true, dy: 0.6 },
  { m: 'd_mat01', x: 3, y: 10, libre: true, dx: -0.5 },
] });

// ——— chambre (T20R0202) ———
const s2 = salle(1, 4, 10, 10);
const esc2 = escalier(s2, 'stair_d01', 3, 4);
export const MAISON_2F = bloc({ plan: s2.plan(), legende: piecesHGSS('parquet', 'mur'), meubles: [
  esc2,
  { m: 'table_l01', x: 5, y: 4, l: 2, repli: 'pc' }, { m: 'tv01', x: 8, y: 4, l: 2, repli: 'tele' },
  { m: 'game_h01', x: 8, y: 5, libre: true }, { m: 'plant01', x: 10, y: 4 },
  { m: 'bed_h01', x: 1, y: 8, l: 2, p: 3, dz: -0.25, repli: 'lit' },
  { m: 't_map01', x: 4, y: 3, mur: true, dy: 0.55 },
] });

// ——— labo du Pr Orme (T20R0101) ———
const sl = salle(1, 3, 12, 14).mettre(4, 14, 'm');
export const LABO = bloc({ plan: sl.plan(), legende: piecesHGSS('labo', 'mur_labo'), meubles: [
  { m: 'machine_l02', x: 1, y: 3, l: 2, p: 2, repli: 'machine' }, { m: 'machine_l01', x: 4, y: 3, repli: 'machine' },
  { m: 'pc04', x: 6, y: 3, repli: 'pc' }, { m: 'labo_select', x: 8, y: 3, l: 2, p: 2, repli: 'table_balls' },
  { m: 'kaifuku_lab01', x: 11, y: 3, l: 2, p: 2, repli: 'machine' },
  ...[1, 7, 9, 11].map((x) => ({ m: 'shelf01', x, y: 10, l: 2, repli: 'etagere' })),
  { m: 'plant01', x: 1, y: 13 }, { m: 'plant01', x: 12, y: 13 },
  { m: 'd_mat01', x: 4, y: 14, libre: true, dx: -0.5 },
] });

// ——— maison habitée (T20R0301 : celle de Bourg Geon ; les autres maisons du début la reprennent) ———
const sm = salle(1, 3, 8, 8).mettre(4, 8, 'm');
export const MAISON = bloc({ plan: sm.plan(), legende: piecesHGSS('parquet', 'mur'), meubles: [
  { m: 'tv01', x: 1, y: 3, l: 2, repli: 'tele' }, { m: 'window01', x: 3, y: 2, l: 2, mur: true, dy: 0.5 },
  { m: 'sink01', x: 5, y: 3, l: 2, repli: 'cuisine' }, { m: 'ref01', x: 7, y: 3 }, { m: 'plant01', x: 8, y: 3 },
  { m: 'table01_2', x: 2, y: 5, l: 2, repli: 'table' }, { m: 'chair01', x: 2, y: 6, libre: true }, { m: 'chair01', x: 3, y: 6, libre: true },
  { m: 'shelf02', x: 8, y: 6, p: 1, repli: 'etagere' },
  { m: 'd_mat01', x: 4, y: 8, libre: true, dx: -0.5 },
] });

// ——— Centre POKéMON, rez-de-chaussée (T21PC0101) ———
// en haut, les trois guichets du CLUB COM (hôtesses en y = 4) ; au milieu, le comptoir de l'infirmière (8, 11) ;
// le PC à droite ; l'escalier du sous-sol en (14, 17) ; la porte en (8, 19)
const sc = salle(1, 3, 15, 19).mettre(8, 19, 'm');
for (const x of [4, 8, 9, 13, 14, 15]) sc.mettre(x, 5, '#');
const escC = escalier(sc, 'stair_pc_d01', 14, 17, 1);
sc.mettre(14, 16, '#'); sc.mettre(15, 16, '#');
const C_ROUGE = ['#f4efe6', '#d84848', '#ffffff'], C_BLANC = ['#f4f0ea', '#e8e2d8', '#d84848'];
export const CENTRE = bloc({ plan: sc.plan(), legende: piecesHGSS('sol_centre', 'mur_centre'),
  caisses: [
    { x: 1, y: 5, l: 3, comptoir: true, couleurs: C_ROUGE }, { x: 5, y: 5, l: 3, comptoir: true, couleurs: C_ROUGE },
    { x: 10, y: 5, l: 3, comptoir: true, couleurs: C_ROUGE },
    { x: 5, y: 9, l: 7, haut: 1.1, couleurs: C_BLANC }, { x: 5, y: 10, p: 2, couleurs: C_BLANC }, { x: 11, y: 10, p: 2, couleurs: C_BLANC },
    { x: 5, y: 12, l: 7, comptoir: true, couleurs: C_ROUGE },
  ],
  meubles: [
    { m: 'machine_pc02', x: 6, y: 10, l: 2, p: 2 }, { m: 'flower_pc01', x: 9, y: 12, libre: true, dy: 0.8 },
    { m: 'pc02', x: 13, y: 11, repli: 'pc' },
    { m: 'shelf_pc01', x: 8, y: 5, l: 2 }, { m: 'shelf_pc01', x: 13, y: 5, l: 2 }, { m: 'plant03', x: 4, y: 5 }, { m: 'plant03', x: 15, y: 5 },
    { m: 'table_pc01', x: 2, y: 14, l: 2, p: 2 }, { m: 'chair_pc01', x: 1, y: 14, libre: true }, { m: 'chair_pc01', x: 4, y: 15, libre: true },
    { m: 'table_pc01', x: 11, y: 13, l: 2, p: 2 }, { m: 'chair_pc01', x: 13, y: 13, libre: true }, { m: 'chair_pc01', x: 10, y: 14, libre: true },
    { m: 'plant03', x: 1, y: 19 }, { m: 'plant03', x: 15, y: 19 },
    escC,
  ] });

// ——— Centre POKéMON, sous-sol (T21PC0102) : le CLUB COM ———
const sb = salle(1, 3, 15, 11);
for (const x of [1, 2, 6, 10, 14, 15]) sb.mettre(x, 5, '#');
const escB = escalier(sb, 'stair_pc_u01', 14, 10, 1);
sb.mettre(14, 9, '#'); sb.mettre(15, 9, '#');
export const CENTRE_B1F = bloc({ plan: sb.plan(), legende: piecesHGSS('sol_centre', 'mur_centre'),
  caisses: [3, 7, 11].map((x) => ({ x, y: 5, l: 3, comptoir: true, couleurs: ['#f4efe6', '#4878d8', '#ffffff'] })),
  meubles: [
    { m: 'plant03', x: 1, y: 5 }, { m: 'plant03', x: 15, y: 5 }, { m: 'shelf_pc01', x: 1, y: 3, l: 2 }, { m: 'shelf_pc01', x: 14, y: 3, l: 2 },
    { m: 'table_pc01', x: 4, y: 8, l: 2, p: 2 }, { m: 'table_pc01', x: 9, y: 8, l: 2, p: 2 },
    escB,
  ] });

// ——— boutique (T21FS0101) ———
// comptoir en x = 3, vendeurs derrière (2, 4) et (2, 6), porte en (4, 11)
const sf = salle(1, 3, 8, 11).mettre(4, 11, 'm');
export const BOUTIQUE = bloc({ plan: sf.plan(), legende: piecesHGSS('sol_boutique', 'mur_boutique'),
  caisses: [{ x: 3, y: 3, p: 5, comptoir: true, couleurs: ['#e8eef4', '#4878c8', '#ffffff'] }],
  meubles: [
    { m: 'shelf_fs04', x: 1, y: 8, l: 2, repli: 'etagere' }, { m: 'counter_fs01', x: 3, y: 5, libre: true, dy: 0.8 },
    { m: 'shelf_fs04', x: 5, y: 3, l: 2, repli: 'etagere' }, { m: 'shelf_fs05', x: 7, y: 3, l: 2, repli: 'etagere' },
    { m: 'shelf_fs02', x: 6, y: 6, p: 2, repli: 'etagere' }, { m: 'shelf_fs03', x: 8, y: 6, p: 2, repli: 'etagere' },
    { m: 'plant03', x: 8, y: 10 },
    { m: 'd_mat01', x: 4, y: 11, libre: true, dx: -0.5 },
  ] });

// ——— Arène d'Acajou : trois salles de glace (T28GYM0103 → T28GYM0102 → T28GYM0101) ———
// `I` glace, `.` sol de l'arène, `o` cristal de glace (bloque), `S` escalier qui monte, `E` escalier qui descend,
// `m` porte ; les lettres des personnages sont sur le sol (ils sont posés par la zone). Les blocs de glace de HGSS
// (objets « ice ») sont des objets : on bute dessus en glissant, comme sur les cristaux.
const GLACE = {
  ...piecesHGSS('neige', 'mur_glace'),
  '#': { col: 1, sol: 'mur_glace' },
  'I': { sol: 'glace', mb: MB.GLACE }, 'o': { col: 1, sol: 'glace', decor: 'cristal' }, 'b': { sol: 'glace', mb: MB.GLACE },
  'S': { sol: 'neige', mb: MB.ESCALIER }, 'E': { sol: 'neige', mb: MB.ESCALIER },
  'G': { sol: 'neige' }, 'T': { sol: 'neige' }, 'P': { sol: 'neige' }, 't': { sol: 'neige' }, 'u': { sol: 'neige' }, 's': { sol: 'neige' }, 'v': { sol: 'neige' },
};
// (les « b » sont les blocs de glace du jeu : sol de glace, un objet dessus)
export const ACAJOU_1 = bloc({ legende: GLACE, plan: [
  '#########',
  '#########',
  '###S#####',
  '#II.IoII#',
  '#IIIIIII#',
  '#IIIIIII#',
  '#oIIIIII#',
  '#IoIIIII#',
  '#IIobIII#',
  '#IIIIIII#',
  '#IIIIIII#',
  '#IIIoIII#',
  '#IIIbIII#',
  '#IIIIooI#',
  '#IIIIIII#',
  '#IIIIIII#',
  '#IIIIoII#',
  '#....G..#',
  '#.T...T.#',
  '#...m...#',
  '#########',
], meubles: [
  { m: 'stair_u01', x: 3, y: 1, l: 1, p: 2, libre: true, dx: 0 },
  { m: 'object01', x: 2, y: 18 }, { m: 'object01', x: 6, y: 18 },
] });
export const ACAJOU_2 = bloc({ legende: GLACE, plan: [
  '##############',
  '##############',
  '######S#######',
  '#IIIII.oIIIII#',
  '#IIIIIIIIIIII#',
  '#IIIIIoIIIoII#',
  '#IIIIIoIoIIII#',
  '#oIoIIIoIIIII#',
  '#IIIIIIIoIIII#',
  '#IIIIIIIIIIII#',
  '#IIoIboIbIIII#',
  '#IIIoIIIIoIII#',
  '#.t.IIIIIIIu.#',
  '#...IIIIIII..#',
  '#..........I.#',
  '#.....E......#',
  '##############',
], meubles: [
  { m: 'stair_u01', x: 6, y: 1, l: 1, p: 2, libre: true },
  { m: 'stair_d01', x: 6, y: 14, l: 1, p: 2, libre: true, creux: true },
] });
export const ACAJOU_3 = bloc({ legende: GLACE, plan: [
  '############',
  '############',
  '############',
  '#..........#',
  '#......P...#',
  '#IIIIII.III#',
  '#IIIIIIIIII#',
  '#IIIoIIIoII#',
  '#oo.IIoIIII#',
  '#IIsIIIIIII#',
  '#IIIIIIIoII#',
  '#IIIIIIoI.I#',
  '#IIIIIIIIuI#',
  '#IIobobIIII#',
  '#IIIIIIIIIo#',
  '#IIIIIIIIII#',
  '#.vIIIIIIbI#',
  '#..IIIIIIII#',
  '#..........#',
  '#....E.....#',
  '############',
], meubles: [
  { m: 'stair_d01', x: 5, y: 18, l: 1, p: 2, libre: true, creux: true },
  { m: 'object03', x: 1, y: 3 }, { m: 'object03', x: 10, y: 3 },
] });

// ——— zones ———
/** blocs de glace de l'arène (objets « ice » du jeu) */
const blocs = (...pos) => pos.map(([x, y], i) => ({ id: 'glace_' + i, x, y, sprite: 'bloc_glace', dir: BAS }));

export const ZONES_INTERIEURS = {
  MAISON_1F: {
    nom: 'Bourg Geon', annonce: false, musique: 'maison', camera: 'interieur', interieur: true, velo: false,
    warps: [
      { x: 3, y: 10, vers: 'BOURG_GEON', n: 1 },
      { x: 3, y: 3, vers: 'MAISON_2F', n: 0, sortie: BAS },
    ],
    panneaux: [
      { x: 5, y: 3, depuis: HAUT, script: 'Evier' }, { x: 6, y: 3, depuis: HAUT, script: 'Evier' },
      { x: 8, y: 3, depuis: HAUT, script: 'Tele1F' }, { x: 9, y: 3, depuis: HAUT, script: 'Tele1F' },
      { x: 11, y: 3, depuis: HAUT, script: 'Frigo' },
    ],
    objets: [{ id: 'maman', x: 6, y: 7, sprite: 'maman', dir: DROITE, script: 'Maman' }],
    niveau: { image: [{ var: 'MAMAN_ACCUEIL', val: 0, script: 'MamanAppelle' }] },
    scripts: `
script MamanAppelle
  exclamation maman
  regarder maman gauche
  message "Ah, {JOUEUR} ! Le PR ORME te cherchait.\\nIl a besoin d'aide au LABO."
  message "Tiens, prends tes CHAUSSURES DE COURSE.\\nGarde B (Maj) enfoncé pour courir deux fois plus vite !"
  drapeau CHAUSSURES
  var MAMAN_ACCUEIL 1
  liberer
  fin

script Maman
  regarder_joueur
  message "Sois prudent, mon chéri !\\nEt reviens vite me voir."
  liberer
  fin
script Evier
  message "L'évier brille de propreté."
  fin
script Tele1F
  message "Une émission sur les POKéMON de JOHTO.\\nÇa a l'air passionnant !"
  fin
script Frigo
  message "Il y a de l'EAU FRAÎCHE et de la LIMONADE."
  fin
`,
  },
  MAISON_2F: {
    nom: 'Bourg Geon', annonce: false, musique: 'maison', camera: 'interieur', interieur: true, velo: false,
    warps: [{ x: 3, y: 4, vers: 'MAISON_1F', n: 1, sortie: BAS }],
    panneaux: [
      { x: 5, y: 4, depuis: HAUT, script: 'Ordinateur' }, { x: 6, y: 4, depuis: HAUT, script: 'Ordinateur' },
      { x: 8, y: 4, depuis: HAUT, script: 'Tele' }, { x: 9, y: 4, depuis: HAUT, script: 'Tele' },
      { x: 4, y: 3, depuis: HAUT, script: 'Carte' },
    ],
    scripts: `
script Ordinateur
  message "{JOUEUR} allume le PC.\\nAucun courriel pour l'instant."
  fin
script Tele
  message "Un film passe à la télé : quatre garçons marchent le long de rails…\\nIl est temps d'y aller !"
  fin
script Carte
  message "C'est une carte de JOHTO."
  fin
`,
  },
  LABO_ORME: {
    nom: 'Bourg Geon', annonce: false, musique: 'labo', camera: 'interieur', interieur: true, velo: false,
    warps: [{ x: 4, y: 14, vers: 'BOURG_GEON', n: 0 }],
    panneaux: [
      { x: 6, y: 3, depuis: HAUT, script: 'OrdiLabo' }, { x: 4, y: 3, depuis: HAUT, script: 'MachineLabo' },
      ...[1, 2, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 10, depuis: HAUT, script: 'Livres' })),
    ],
    objets: [
      { id: 'orme', x: 6, y: 5, sprite: 'scientifique', dir: BAS, script: 'Orme' },
      { id: 'aide', x: 9, y: 12, sprite: 'savant', mouvement: 'errance', rayon: 2, script: 'Aide' },
    ],
    niveau: { image: [{ var: 'LABO_INTRO', val: 0, script: 'LaboIntro' }] },
    scripts: `
script LaboIntro
  exclamation orme
  message "Ah, {JOUEUR} ! Approche, approche !"
  mouvement joueur VersOrme
  attendre_mouvements
  var LABO_INTRO 1
  appeler OrmeChoix
  liberer
  fin
mouvement VersOrme
  droite 2
  haut 8
fin

script Orme
  regarder_joueur
  si drapeau A_POKEMON aller Orme_Deja
  appeler OrmeChoix
  liberer
  fin
Orme_Deja:
  message "Prends soin de ton POKéMON, {JOUEUR} !"
  liberer
  fin

OrmeChoix:
  message "J'ai trois POKéMON ici. Lequel veux-tu ?"
  choix "Germignon" "Héricendre" "Kaiminus"
  si resultat = 1 aller Orme_Feu
  si resultat = 2 aller Orme_Eau
  donner_pokemon Germignon 5
  aller Orme_Suite
Orme_Feu:
  donner_pokemon Héricendre 5
  aller Orme_Suite
Orme_Eau:
  donner_pokemon Kaiminus 5
Orme_Suite:
  drapeau A_POKEMON
  var ORME_POKEMON 1
  donner_objet pokedex
  message "Tu peux partir à l'aventure maintenant !"
  retour

script Aide
  regarder_joueur
  message "Le PR ORME dit que les POKéMON sauvages\\nvivent dans les hautes herbes."
  liberer
  fin
script OrdiLabo
  message "Des notes sur l'évolution des POKéMON…\\nC'est trop compliqué !"
  fin
script MachineLabo
  message "Une machine pour analyser les POKéMON."
  fin
script Livres
  message "Des livres savants sur les POKéMON."
  fin
`,
  },
};

/** une maison habitée : un habitant en (5, 5), la porte en (4, 8) */
export const maisonHGSS = (nom, vers, n, habitant, script, musique = 'maison') => ({
  nom, annonce: false, musique, camera: 'interieur', interieur: true, velo: false,
  warps: [{ x: 4, y: 8, vers, n }],
  objets: [{ id: 'habitant', x: 5, y: 5, dir: BAS, mouvement: 'regard_alea', ...habitant }],
  scripts: script,
});

/** Centre POKéMON d'une ville et son sous-sol (zone `id` + `id`_B1F) */
export function centreHGSS(id, nom, vers, n, plus = {}) {
  return {
    [id]: {
      nom, annonce: false, musique: 'centre', camera: 'interieur', interieur: true, velo: false,
      warps: [{ x: 8, y: 19, vers, n }, { x: 14, y: 17, vers: id + '_B1F', n: 0, sortie: BAS }],
      panneaux: [{ x: 13, y: 11, depuis: HAUT, script: 'PCdeLeo' }],
      objets: [
        { id: 'infirmiere', x: 8, y: 11, sprite: 'nurse', dir: BAS, script: 'Infirmiere' },
        ...[2, 6, 11].map((x, i) => ({ id: 'hotesse_' + i, x, y: 4, sprite: 'hotesse', dir: BAS, script: 'Hotesse' })),
        { id: 'visiteur', x: 6, y: 14, sprite: 'topdresseur', mouvement: 'errance', rayon: 1, script: 'Visiteur' },
        ...(plus.objets || []),
      ],
      scripts: `
script Visiteur
  regarder_joueur
  message "L'infirmière soigne tes POKéMON gratuitement.\\nC'est aussi ici que tu repars si tu es K.O."
  liberer
  fin
script Hotesse
  regarder_joueur
  message "Bienvenue au CLUB COM POKéMON !\\nLes échanges et les combats entre amis se font au sous-sol."
  liberer
  fin
` + (plus.scripts || ''),
    },
    [id + '_B1F']: {
      nom, annonce: false, musique: 'centre', camera: 'interieur', interieur: true, velo: false,
      warps: [{ x: 14, y: 10, vers: id, n: 1, sortie: BAS }],
      objets: [4, 8, 12].map((x, i) => ({ id: 'club_' + i, x, y: 4, sprite: 'hotesse', dir: BAS, script: 'Club' })),
      scripts: `
script Club
  regarder_joueur
  message "Ce guichet relie les joueurs entre eux.\\nIl ouvrira avec le jeu en réseau !"
  liberer
  fin
`,
    },
  };
}

/** boutique : vendeur derrière le comptoir en (2, 6), un second en (2, 4), porte en (4, 11) */
export const boutiqueHGSS = (nom, vers, n, articles) => ({
  nom, annonce: false, musique: 'boutique', camera: 'interieur', interieur: true, velo: false,
  warps: [{ x: 4, y: 11, vers, n }],
  objets: [
    { id: 'vendeur', x: 2, y: 6, sprite: 'vendeur', dir: DROITE, script: 'Vendeur' },
    { id: 'vendeur_2', x: 2, y: 4, sprite: 'vendeur', dir: DROITE, script: 'Vendeur2' },
    { id: 'client', x: 7, y: 9, sprite: 'enfant', mouvement: 'regard_alea', script: 'Client' },
  ],
  scripts: `
script Vendeur
  message "Bienvenue ! Que puis-je pour vous ?"
  boutique ${articles}
  message "Merci, à bientôt !"
  liberer
  fin
script Vendeur2
  message "Les CT arrivent bientôt dans les rayons !"
  liberer
  fin
script Client
  regarder_joueur
  message "Avec des POKé BALLS, on attrape des POKéMON !"
  liberer
  fin
`,
});

// ——— Arène d'Acajou ———
const ARENE = { nom: 'Acajou', annonce: false, musique: 'glace', camera: 'interieur', interieur: true, velo: false, course: false };
export const ZONES_ACAJOU = {
  ARENE_ACAJOU_1: {
    ...ARENE,
    warps: [{ x: 4, y: 19, vers: 'ACAJOU', n: 0 }, { x: 3, y: 2, vers: 'ARENE_ACAJOU_2', n: 0, sortie: BAS }],
    panneaux: [{ x: 2, y: 18, depuis: HAUT, script: 'Statue' }, { x: 6, y: 18, depuis: HAUT, script: 'Statue' }],
    objets: [
      { id: 'guide', x: 5, y: 17, sprite: 'lunettes', dir: BAS, script: 'GuideGlace' },
      ...blocs([4, 8], [4, 12]),
    ],
    scripts: `
script GuideGlace
  regarder_joueur
  si drapeau BADGE_GLACIER aller Guide_Bravo
  message "Yo, champion en herbe ! Le sol est gelé : on glisse jusqu'à buter sur quelque chose.\\nRegarde bien où s'arrêter avant de te lancer !"
  liberer
  fin
Guide_Bravo:
  message "Tu as battu FRIGO ! Quelle classe !"
  liberer
  fin
script Statue
  message "ARÈNE POKéMON D'ACAJOU\\nCHAMPION : FRIGO"
  fin
`,
  },
  ARENE_ACAJOU_2: {
    ...ARENE,
    warps: [{ x: 6, y: 15, vers: 'ARENE_ACAJOU_1', n: 1, sortie: HAUT }, { x: 6, y: 2, vers: 'ARENE_ACAJOU_3', n: 0, sortie: BAS }],
    objets: [
      ...blocs([5, 10], [8, 10]),
      { id: 'skieuse', x: 2, y: 12, sprite: 'skieuse', dir: DROITE, nom: 'Skieuse Rosa',
        dresseur: { portee: 2, portrait: 'lass', script: 'Skieuse_Defi', apres: 'Skieuse_Apres', equipe: [{ espece: 'Otaria', niveau: 25 }, { espece: 'Otaria', niveau: 25 }] } },
      { id: 'surfeur', x: 11, y: 12, sprite: 'surfeur', dir: GAUCHE, nom: 'Snowboardeur Marc',
        dresseur: { portee: 2, portrait: 'hiker', script: 'Surfeur_Defi', apres: 'Surfeur_Apres', equipe: [{ espece: 'Marcacrin', niveau: 26 }, { espece: 'Otaria', niveau: 26 }] } },
    ],
    scripts: `
script Skieuse_Defi
  message "Je glisse plus vite que toi !"
  combat_dresseur
  message "Patatras…"
  liberer
  fin
script Skieuse_Apres
  regarder_joueur
  message "FRIGO a passé sa vie au milieu des glaces."
  liberer
  fin
script Surfeur_Defi
  message "Tu vas finir dans la poudreuse !"
  combat_dresseur
  message "Gamelle…"
  liberer
  fin
script Surfeur_Apres
  regarder_joueur
  message "Sur la glace, on ne tourne qu'à l'arrêt !"
  liberer
  fin
`,
  },
  ARENE_ACAJOU_3: {
    ...ARENE,
    warps: [{ x: 5, y: 19, vers: 'ARENE_ACAJOU_2', n: 1, sortie: HAUT }],
    objets: [
      ...blocs([4, 13], [6, 13], [9, 16]),
      { id: 'frigo', x: 7, y: 4, sprite: 'frigo', dir: BAS, nom: 'Champion Frigo',
        dresseur: { portee: 0, champion: true, portrait: 'pryce', script: 'Frigo_Defi', apres: 'Frigo_Apres', prix: 3100,
          equipe: [{ espece: 'Otaria', niveau: 27 }, { espece: 'Lamantine', niveau: 29 }, { espece: 'Cochignon', niveau: 31 }] } },
      { id: 'skieuse', x: 3, y: 9, sprite: 'skieuse', dir: DROITE, nom: 'Skieuse Diane',
        dresseur: { portee: 2, portrait: 'lass', script: 'Diane_Defi', apres: 'Diane_Apres', equipe: [{ espece: 'Lamantine', niveau: 27 }] } },
      { id: 'surfeur_1', x: 2, y: 16, sprite: 'surfeur', dir: DROITE, mouvement: 'regard_alea', nom: 'Snowboardeur Paul',
        dresseur: { portee: 2, portrait: 'hiker', script: 'Paul_Defi', apres: 'Paul_Apres', equipe: [{ espece: 'Marcacrin', niveau: 26 }, { espece: 'Marcacrin', niveau: 26 }] } },
      { id: 'surfeur_2', x: 9, y: 12, sprite: 'surfeur', dir: GAUCHE, nom: 'Snowboardeur Gérard',
        dresseur: { portee: 2, portrait: 'hiker', script: 'Gerard_Defi', apres: 'Gerard_Apres', equipe: [{ espece: 'Cochignon', niveau: 28 }] } },
    ],
    scripts: `
script Frigo_Defi
  message "Je suis FRIGO, Champion d'ACAJOU.\\nCinquante hivers m'ont appris la patience… et le froid !"
  combat_dresseur
  message "Ah… Tu as la chaleur de la jeunesse. Voici le BADGE GLACIER."
  drapeau BADGE_GLACIER
  son fanfare
  message "{JOUEUR} reçoit le BADGE GLACIER !"
  liberer
  fin
script Frigo_Apres
  regarder_joueur
  message "La glace se brise, mais elle revient chaque hiver.\\nReste humble, {JOUEUR}."
  liberer
  fin
script Diane_Defi
  message "Tu es arrivé jusqu'ici en glissant ? Bravo !"
  combat_dresseur
  message "Je n'ai rien vu venir…"
  liberer
  fin
script Diane_Apres
  regarder_joueur
  message "FRIGO t'attend tout au fond."
  liberer
  fin
script Paul_Defi
  message "Personne ne passe sans affronter la tempête !"
  combat_dresseur
  message "Avalanche de défaites…"
  liberer
  fin
script Paul_Apres
  regarder_joueur
  message "Il paraît que FRIGO prend sa retraite… un jour."
  liberer
  fin
script Gerard_Defi
  message "Tu glisses, tu tombes, tu perds !"
  combat_dresseur
  message "C'est moi qui suis tombé…"
  liberer
  fin
script Gerard_Apres
  regarder_joueur
  message "La glace, ça ne pardonne pas."
  liberer
  fin
`,
  },
};
