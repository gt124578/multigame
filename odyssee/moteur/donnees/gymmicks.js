// odyssee/moteur/donnees/gymmicks.js — les mécanismes d'arène que le jeu code en C (src/field/gymmick/ de la décompilation),
// et que ses scripts appellent par des commandes à part (AzaleaGymSpinarak, AzaleaGymSwitch…).
// Rien ici ne touche au DOM.

/**
 * L'énigme, telle que le jeu la code : 12 stations (trois par rangée), 4 chariots MIMIGAL, 2 aiguillages.
 * Les chariots des rangées 31 et 16 partent vers le nord (le joueur monte depuis la case au sud) ; ceux des rangées
 * 24 et 9 repartent à reculons (on monte depuis la station même, on descend une case au sud de l'arrivée).
 * routes[s][aiguillage] = { vers, noeuds } (null : l'aiguillage n'y mène pas).
 */
const T15 = [[3, 31], [3, 29], [9, 29], [9, 27], [15, 28], [15, 25], [9, 25], [9, 24]];
const T26 = [[9, 31], [9, 29], [3, 29], [3, 27], [9, 26], [9, 25], [15, 25], [15, 24]];
const T34 = [[15, 31], [15, 28], [9, 27], [9, 26], [3, 27], [3, 24]];
const T7_10 = [[3, 16], [3, 12], [9, 13], [9, 10], [3, 10], [3, 9]];
const T7_11 = [[3, 16], [3, 12], [9, 13], [9, 9]];
const T8_10 = [[9, 16], [9, 14], [15, 14], [15, 11], [9, 12], [9, 10], [3, 10], [3, 9]];
const T8_12 = [[9, 16], [9, 14], [15, 14], [15, 9]];
const T8_11 = [[9, 16], [9, 14], [15, 14], [15, 11], [9, 12], [9, 9]];
const r = (vers, noeuds) => ({ vers, noeuds });
const tous = (x) => [x, x, x, x];
export const RAILS_ECORCIA = {
  stations: [[3, 31], [9, 31], [15, 31], [3, 24], [9, 24], [15, 24], [3, 16], [9, 16], [15, 16], [3, 9], [9, 9], [15, 9]],
  depart: [0, 1, 2, 7],
  inverses: [3, 4, 5, 9, 10, 11],
  routes: {
    0: tous(r(4, T15)), 1: tous(r(5, T26)), 2: tous(r(3, T34)),
    3: tous(r(2, T34)), 4: tous(r(0, T15)), 5: tous(r(1, T26)),
    6: [null, r(9, T7_10), null, r(10, T7_11)],
    7: [r(9, T8_10), r(11, T8_12), r(10, T8_11), r(11, T8_12)],
    9: [r(7, T8_10), r(6, T7_10), null, null],
    10: [null, null, r(7, T8_11), r(6, T7_11)],
    11: [null, r(7, T8_12), null, r(7, T8_12)],
  },
};

