// odyssee/moteur/donnees/demo.js — zone d'essai du moteur, façon début de HeartGold / SoulSilver :
// un bourg au bord de la mer (labo, maison du joueur sur deux étages, maison voisine), une route à l'ouest en deux
// blocs (hautes herbes, rebords, plateau et marches, dresseur, objets) et une grotte de glace. Les dialogues sont
// écrits pour l'essai ; le but est de vérifier le moteur, pas de raconter une histoire.

import { bloc, mondeSimple, SOLS } from './auteur.js';
import { BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';

/** une pièce dessinée au centre d'un bloc vide ; rend le plan et le décalage */
function piece(lignes, ox = 11, oy = 10) {
  const plan = [];
  for (let y = 0; y < 32; y++) {
    const l = lignes[y - oy];
    plan.push(l === undefined ? '' : ' '.repeat(ox) + l);
  }
  return plan;
}
const OX = 11, OY = 10;
const P = (x, y) => ({ x: x + OX, y: y + OY });   // coordonnées d'une pièce

// ——— dehors : route 29 (deux blocs) puis Bourg Geon ———
export const ROUTE_A = bloc({
  plan: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TT.......TTTTTTTTTT...........TT',
    'TT.......TTTTTTTTTT...""""""..TT',
    'TT....................""""""..TT',
    'TT....................""""""..TT',
    'TT..............,.............TT',
    'TT.......""""".......TT.......TT',
    'TT.......""""".......TT.......TT',
    'TT.......""""".......TT.......TT',
    'TT............................TT',
    'TT............................TT',
    'TTb=============================',
    'TTb=============================',
    'TT............................TT',
    'TT......,,,,,,,,,,,,,,,.......TT',
    'TT......,"""""",,,,,,,,.......TT',
    'TT......,"""""",,TT,,,,.......TT',
    'TT......,"""""",,TT,,,,.......TT',
    'TT......,,,,,,,,,,,,,,,.......TT',
    'TT......,,,,,,,,,,,,,,,.......TT',
    'TT......,,,,,,,^,,,,,,,.......TT',
    'TT............................TT',
    'TT..........p.................TT',
    'TTTTTT....FF..........FF..TTTTTT',
    'TTTTTT....................TTTTTT',
    'TTTTTTTTT..............TTTTTTTTT',
    'TTTTTTTTTTTT.......TTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  hauteurs: [
    ...Array(15).fill(''),
    '        111111111111111',
    '        111111111111111',
    '        111111111111111',
    '        111111111111111',
    '        111111111111111',
    '        111111111111111',
    '        111111111111111',
  ],
  batiments: [{ x: 4, y: 3, l: 3, p: 2, modele: 'grotte', porte: 1 }],
});

export const ROUTE_B = bloc({
  plan: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTT....""""""""....TTTT......TT',
    'TTTT....""""""""....TTTT..o...TT',
    'TTTT....""""""""..............TT',
    'TTTT..........................TT',
    'TTTTvvvvvvvv.....vvvvvvvvvvvvvTT',
    'TT............................TT',
    'TT....FF..........p...........TT',
    'TT............................TT',
    'TT....TT...............TT.....TT',
    'TT....TT...............TT.....TT',
    '================================',
    '================================',
    'TT............................TT',
    'TT...""""""""""......"""""....TT',
    'TT...""""""""""......"""""....TT',
    'TT...""""""""""......"""""....TT',
    'TT...........................TTT',
    'TTvvvvvvvvvvvvvvvv....vvvvvvvTTT',
    'TT............................TT',
    'TT..FF.........,..........FF..TT',
    'TT............................TT',
    'TTTT.........TTTT.........TTTTTT',
    'TTTT.........TTTT.........TTTTTT',
    'TTTTTT..................TTTTTTTT',
    'TTTTTT.....""""""""".....TTTTTTT',
    'TTTTTT.....""""""""".....TTTTTTT',
    'TTTTTTTT..............TTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
});

export const BOURG = bloc({
  plan: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTSS~~~',
    'TT.......,..........,......SS~~~',
    'TT.........................SS~~~',
    'TT..............,..........SS~~~',
    'TT.........................SS~~~',
    'TT.........................SS~~~',
    'TT.........................SS~~~',
    'TT.........................SS~~~',
    'TT.....P............P......SS~~~',
    'TT.....P............P......SS~~~',
    'TT.....P....p.......P......SS~~~',
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPSS~~~',
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPSS~~~',
    'TT.........P...............SS~~~',
    'TT.........P...............SS~~~',
    'TT.........P.....FFFF......SS~~~',
    'TT.........P...............SS~~~',
    'TT.........P...............SS~~~',
    'TT.........P...............SS~~~',
    'TT.........P...............SS~~~',
    'TT..........................S~~~',
    'TT...FF............FF.......S~~~',
    'TT..........................S~~~',
    'TT..........................S~SS',
    'TT..........................S~SS',
    'TT..........................S~~~',
    'TT..........................S~~~',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  legende: { 'p': { col: 1, sol: 'herbe', decor: 'panneau' } },
  batiments: [
    { x: 3, y: 4, l: 8, p: 5, modele: 'labo', toit: 'gris', porte: 4, m3d: 'wk_labo' },
    { x: 17, y: 5, l: 7, p: 4, modele: 'maison', toit: 'rouge', porte: 3, m3d: 'wk_hhouse' },
    { x: 8, y: 17, l: 6, p: 4, modele: 'maison', toit: 'bleu', porte: 3, m3d: 'wk_h01' },
  ],
});
// Bourg Geon est le troisième bloc : x de 64 à 95
const BX = 64;

// ——— intérieurs ———
export const MAISON_1F = bloc({ plan: piece([
  'WWWWWWWWWW',
  'WVk|:::REW',
  'W::::::::W',
  'W::t|::::W',
  'W::||::::W',
  'W::::::::W',
  'W::::m:::W',
  'WWWWWWWWWW',
]) });
export const MAISON_2F = bloc({ plan: piece([
  'WWWWWWWWWW',
  'WOR::::VEW',
  'W::::::::W',
  'W::::::::W',
  'WB:::::::W',
  'W|:::::::W',
  'WWWWWWWWWW',
]) });
export const LABO = bloc({ plan: piece([
  'WWWWWWWWWWWWWW',
  'WX!M!::::M!X!W',
  'WLLLLLLLLLLLLW',
  'WLLLLLLLLQ!LLW',
  'WLLLLLLLLLLLLW',
  'WLLLLLLLLLLLLW',
  'WXLLLLLLLLLLXW',
  'WLLLLLLLLLLLLW',
  'WLLLLLmLLLLLLW',
  'WWWWWWWWWWWWWW',
], 9, 9) });
export const VOISIN = bloc({ plan: piece([
  'WWWWWWWWWW',
  'WR|::::VkW',
  'W::::::::W',
  'W::t|::::W',
  'W::||::::W',
  'W:::m::::W',
  'WWWWWWWWWW',
]) });
export const GROTTE = bloc({ plan: [
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGggggggggggggggggggggggGGGGG',
  'GGGGGgIIIIIIIIIIIIIIIIIIIIgGGGGG',
  'GGGGGgIIIIIIqIIIIIIIIIIIIIgGGGGG',
  'GGGGGgIIIIIIIIIIIIIIIIqIIIgGGGGG',
  'GGGGGgIIqIIIIIIIIIIIIIIIIIgGGGGG',
  'GGGGGgIIIIIIIIIIIIIIIIIIIIgGGGGG',
  'GGGGGgIIIIIIIIIIIqIIIIIIIIgGGGGG',
  'GGGGGgIIIIIIIIIIIIIIIIIIIIgGGGGG',
  'GGGGGggggggggggggggggggggggGGGGG',
  'GGGGGGGGGGGGGgggGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGgggGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGgggGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGnGGGGGGGGGGGGGGGGG',
  ...Array(17).fill('G'.repeat(32)),
] });

export const DEMO = {
  sols: SOLS,
  blocs: { route_a: ROUTE_A, route_b: ROUTE_B, bourg: BOURG, maison_1f: MAISON_1F, maison_2f: MAISON_2F, labo: LABO, voisin: VOISIN, grotte: GROTTE },
  mondes: {
    jotho: { largeur: 3, hauteur: 1, blocs: ['route_a', 'route_b', 'bourg'], zones: ['ROUTE_29', 'ROUTE_29', 'BOURG_GEON'] },
    maison_1f: mondeSimple('maison_1f', 'MAISON_1F'),
    maison_2f: mondeSimple('maison_2f', 'MAISON_2F'),
    labo: mondeSimple('labo', 'LABO_ORME'),
    voisin: mondeSimple('voisin', 'MAISON_VOISIN'),
    grotte: mondeSimple('grotte', 'GROTTE_GLACE'),
  },
  zones: {
    BOURG_GEON: {
      nom: 'Bourg Geon', musique: 'bourg', camera: 'ville', meteo: null,
      rencontres: { eau: { taux: 10, especes: [{ espece: 'Tentacool', niveaux: [10, 15] }] } },
      warps: [
        { x: BX + 7, y: 8, vers: 'LABO_ORME', n: 0 },
        { x: BX + 20, y: 8, vers: 'MAISON_1F', n: 0 },
        { x: BX + 11, y: 20, vers: 'MAISON_VOISIN', n: 0 },
      ],
      panneaux: [
        { x: BX + 12, y: 11, depuis: HAUT, script: 'PanneauBourg' },
      ],
      declencheurs: [
        { x: BX + 0, y: 12, l: 1, h: 2, var: 'ORME_POKEMON', val: 0, script: 'PasSansPokemon' },
      ],
      objets: [
        { id: 'pecheur', x: BX + 26, y: 22, sprite: 'pecheur', dir: DROITE, mouvement: 'regard_gd', script: 'Pecheur' },
        { id: 'fillette', x: BX + 15, y: 15, sprite: 'fillette', mouvement: 'errance', rayon: 3, script: 'Fillette' },
        { id: 'baie_ile', type: 'objet', x: BX + 31, y: 24, sprite: 'objet', objet: 'oran-berry', drapeau: 'OBJ_BOURG_BAIE' },
      ],
      scripts: `
script PanneauBourg
  message "BOURG GEON\\nLe vent du renouveau y souffle."
  fin

script PasSansPokemon
  message "Attends, {JOUEUR} ! Les hautes herbes sont pleines de POKéMON sauvages.\\nPasse d'abord au LABO du PR ORME."
  mouvement joueur Recule
  attendre_mouvements
  liberer
  fin
mouvement Recule
  droite
fin

script Pecheur
  regarder_joueur
  si drapeau CS_SURF aller Pecheur_Deja
  message "Tu vois l'îlot là-bas ? Il y pousse des baies.\\nTiens, avec ça tu pourras y aller."
  drapeau CS_SURF
  message "{JOUEUR} reçoit la CS SURF !\\nFace à l'eau, appuie sur A."
  liberer
  fin
Pecheur_Deja:
  message "Le SURF, c'est la liberté !"
  liberer
  fin

script Fillette
  regarder_joueur
  message "Le PR ORME étudie l'évolution des POKéMON.\\nIl est un peu distrait…"
  liberer
  fin
`,
    },
    ROUTE_29: {
      nom: 'Route 29', musique: 'route', camera: 'dehors',
      rencontres: {
        herbe: { taux: 25, especes: [
          { espece: 'Fouinette', poids: 40, niveaux: [2, 4] },
          { espece: 'Roucool', poids: 40, niveaux: [2, 4] },
          { espece: 'Hoothoot', poids: 20, niveaux: [3, 4] },
        ] },
      },
      warps: [{ x: 5, y: 4, vers: 'GROTTE_GLACE', n: 0 }],
      panneaux: [
        { x: 32 + 18, y: 8, depuis: HAUT, script: 'PanneauRoute' },
        { x: 12, y: 23, depuis: HAUT, script: 'PanneauPlateau' },
      ],
      objets: [
        { id: 'gamin', x: 32 + 15, y: 9, sprite: 'gamin', dir: BAS, nom: 'Gamin Tom',
          dresseur: { portee: 4, script: 'Gamin_Defi', apres: 'Gamin_Apres', equipe: [{ espece: 'Rattata', niveau: 3 }] } },
        { id: 'garde', x: 3, y: 13, sprite: 'garde', dir: DROITE, script: 'Garde' },
        { id: 'promeneuse', x: 32 + 24, y: 21, sprite: 'habitante', mouvement: 'errance_gd', rayon: 4, script: 'Promeneuse' },
        { id: 'potion', type: 'objet', x: 32 + 27, y: 21, sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R29_POTION' },
        { id: 'potion_plateau', type: 'objet', x: 20, y: 16, sprite: 'objet', objet: 'potion', drapeau: 'OBJ_R29_PLATEAU' },
      ],
      scripts: `
script PanneauRoute
  message "ROUTE 29\\nBOURG GEON → ville à l'ouest"
  fin
script PanneauPlateau
  message "Les marches mènent au plateau.\\nOn ne grimpe pas par les côtés !"
  fin

script Gamin_Defi
  message "Hé ! Toi aussi tu as un POKéMON ?\\nCombat !"
  combat_dresseur
  message "Ouah… Tu es fort !"
  liberer
  fin
script Gamin_Apres
  regarder_joueur
  message "Je vais m'entraîner dans les hautes herbes."
  liberer
  fin

script Garde
  regarder_joueur
  message "La route vers l'ouest est en travaux.\\nReviens plus tard !"
  liberer
  fin

script Promeneuse
  regarder_joueur
  message "Si tu sautes d'un rebord, tu ne peux pas remonter par là."
  liberer
  fin
`,
    },
    MAISON_1F: {
      nom: 'Bourg Geon', annonce: false, musique: 'maison', camera: 'interieur', interieur: true, velo: false,
      warps: [
        { ...P(5, 6), vers: 'BOURG_GEON', n: 1 },
        { ...P(8, 1), vers: 'MAISON_2F', n: 0, sortie: BAS },
      ],
      objets: [{ id: 'maman', ...P(5, 3), sprite: 'maman', dir: GAUCHE, script: 'Maman' }],
      niveau: { image: [{ var: 'MAMAN_ACCUEIL', val: 0, script: 'MamanAppelle' }] },
      scripts: `
script MamanAppelle
  exclamation maman
  regarder maman droite
  message "Ah, {JOUEUR} ! Le PR ORME te cherchait.\\nIl a besoin d'aide au LABO."
  message "Tiens, prends tes CHAUSSURES DE COURSE.\\nGarde B (Maj) enfoncé pour courir deux fois plus vite !"
  drapeau CHAUSSURES
  var MAMAN_ACCUEIL 1
  liberer
  fin

script Maman
  regarder_joueur
  si drapeau CHAUSSURES aller Maman_Deja
  message "Prends ces CHAUSSURES DE COURSE.\\nTiens B (Maj) enfoncé pour courir !"
  drapeau CHAUSSURES
  liberer
  fin
Maman_Deja:
  message "Sois prudent, mon chéri !"
  liberer
  fin
`,
    },
    MAISON_2F: {
      nom: 'Bourg Geon', annonce: false, musique: 'maison', camera: 'interieur', interieur: true, velo: false,
      warps: [{ ...P(8, 1), vers: 'MAISON_1F', n: 1, sortie: BAS }],
      panneaux: [{ ...P(1, 1), depuis: HAUT, script: 'Ordinateur' }, { ...P(7, 1), depuis: HAUT, script: 'Tele' }],
      scripts: `
script Ordinateur
  message "{JOUEUR} allume le PC.\\nAucun courriel pour l'instant."
  fin
script Tele
  message "Un film passe à la télé : quatre garçons marchent le long de rails…\\nIl est temps d'y aller !"
  fin
`,
    },
    LABO_ORME: {
      nom: 'Bourg Geon', annonce: false, musique: 'labo', camera: 'interieur', interieur: true, velo: false,
      warps: [{ ...P(6, 8), x: 9 + 6, y: 9 + 8, vers: 'BOURG_GEON', n: 0 }],
      objets: [
        { id: 'orme', x: 9 + 6, y: 9 + 2, sprite: 'scientifique', dir: BAS, script: 'Orme' },
        { id: 'aide', x: 9 + 3, y: 9 + 5, sprite: 'savant', mouvement: 'errance', rayon: 2, script: 'Aide' },
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
  haut 5
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
`,
    },
    MAISON_VOISIN: {
      nom: 'Bourg Geon', annonce: false, musique: 'maison', camera: 'interieur', interieur: true, velo: false,
      warps: [{ ...P(4, 5), vers: 'BOURG_GEON', n: 2 }],
      objets: [{ id: 'voisin', ...P(6, 2), sprite: 'vieil_homme', dir: BAS, mouvement: 'regard_alea', script: 'Voisin' }],
      scripts: `
script Voisin
  regarder_joueur
  si drapeau A_VELO aller Voisin_Deja
  si non drapeau A_POKEMON aller Voisin_Sans
  message "Tu pars en voyage ? Prends donc mon vieux VÉLO !"
  donner_objet velo
  drapeau A_VELO
  message "Appuie sur V pour l'enfourcher dehors."
  liberer
  fin
Voisin_Sans:
  message "Sans POKéMON, on ne va pas loin…"
  liberer
  fin
Voisin_Deja:
  message "Le vélo, ça ne s'oublie pas !"
  liberer
  fin
`,
    },
    GROTTE_GLACE: {
      nom: 'Grotte Glacée', musique: 'grotte', camera: 'grotte', velo: false, interieur: true,
      warps: [{ x: 14, y: 14, vers: 'ROUTE_29', n: 0 }],
      objets: [{ id: 'pokeball', type: 'objet', x: 17, y: 5, sprite: 'objet', objet: 'poke-ball', drapeau: 'OBJ_GROTTE_BALL' }],
    },
  },
};
