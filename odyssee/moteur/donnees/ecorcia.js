// odyssee/moteur/donnees/ecorcia.js — de Mauville à la deuxième arène de HeartGold / SoulSilver :
// Route 32 (et son Centre POKéMON), Caves Jumelles, Route 33, Écorcia (Centre, boutique, maison de FARGAS,
// charbonnerie, poste du Bois aux Chênes), le Puits Ramoloss et la TEAM ROCKET, l'arène d'HECTOR et ses chariots.
//
// Ce qui vient des données publiques de la décompilation (pret/pokeheartgold) : la place des portes, des personnages,
// des dresseurs (et leurs équipes, trainers.json), des objets, des panneaux et des « coord events » de chaque zone
// (zone_event), l'enchaînement des scripts (scr_seq : le gardien du puits qui part quand FARGAS crie, les SBIRES
// cachés une fois le puits libéré, le rival à la sortie ouest après le badge), et l'énigme de l'arène : les douze
// stations, les tracés des chariots et les deux aiguillages (src/field/gymmick/azalea.c, gymmick_init.c).
// Ce qui ne s'y trouve pas (le sol, les grottes, les meubles) est redessiné autour de ces repères. Les dialogues sont
// traduits librement des textes du jeu (msgdata).

import { bloc, piecesHGSS } from './auteur.js';
import { Peintre } from './peintre.js';
import { centreHGSS, boutiqueHGSS } from './interieurs.js';
import { MB, BAS, HAUT, GAUCHE, DROITE } from '../engine/const.js';

// ——— outils ———
function salle(x1, y1, x2, y2) {
  const g = [];
  for (let y = 0; y <= y2 + 1; y++) {
    const l = [];
    for (let x = 0; x <= x2 + 1; x++) l.push(x >= x1 && x <= x2 && y >= y1 && y <= y2 ? '.' : 'W');
    g.push(l);
  }
  return { g, mettre(x, y, c) { g[y][x] = c; return this; }, plan() { return g.map((l) => l.join('')); } };
}
const ZI = (nom, plus = {}) => ({ nom, annonce: false, camera: 'interieur', interieur: true, velo: false, ...plus });

// ——— objets connus (noms français de HGSS) ———
export const OBJETS_ECORCIA = {
  'great-ball': { nom: 'une SUPER BALL', court: 'SUPER BALL', prix: 600 },
  'lure-ball': { nom: 'une APPÂT BALL', court: 'APPÂT BALL' },
  'miracle-seed': { nom: 'un GRAIN MIRACLE', court: 'GRAIN MIRACLE' },
  charcoal: { nom: 'un CHARBON', court: 'CHARBON' },
  'old-rod': { nom: 'une CANNE', court: 'CANNE' },
  tm05: { nom: 'la CT05 (HURLEMENT)', court: 'CT05' },
  tm09: { nom: 'la CT09 (BALLE GRAINE)', court: 'CT09' },
  tm89: { nom: 'la CT89 (DEMI-TOUR)', court: 'CT89' },
  'x-attack': { nom: 'une ATTAQUE +', court: 'ATTAQUE +', prix: 500 },
  'full-heal': { nom: 'un TOTAL SOIN', court: 'TOTAL SOIN', prix: 600 },
  'pnk-apricorn': { nom: 'une NOIGRUME ROSE', court: 'NOIGRUME ROSE' },
  'grn-apricorn': { nom: 'une NOIGRUME VERTE', court: 'NOIGRUME VERTE' },
  'blk-apricorn': { nom: 'une NOIGRUME NOIRE', court: 'NOIGRUME NOIRE' },
};

// ——— Caves Jumelles, 1er sous-sol (D25R0101 : 32 × 96 cases) ———
// entrée de la Route 32 en (27, 43), sortie vers la Route 33 en (27, 93) ; les échelles vers les étages du bas et
// les Ruines d'Alpha (nord) ne sont pas construites
const cv = new Peintre(0, 0, 1, 3, 'G');
cv.rect('g', 3, 22, 29, 40);                       // la salle du haut
cv.rect('G', 12, 22, 16, 25); cv.rect('G', 20, 34, 23, 37);
for (const [x, y] of [[10, 30], [18, 28], [25, 32], [6, 38]]) cv.point('q', x, y);
cv.rect('g', 26, 40, 28, 43); cv.point('n', 27, 43);   // l'entrée depuis la Route 32 (on sort vers le bas)
cv.rect('g', 3, 40, 9, 46);                         // le passage ouest
cv.rect('g', 2, 45, 30, 60);                        // la grande salle
cv.rect('w', 11, 51, 17, 57);
for (const [x, y] of [[24, 48], [8, 56], [27, 57], [21, 46]]) cv.point('q', x, y);
cv.rect('g', 2, 60, 9, 84);                         // couloir ouest
cv.rect('g', 20, 60, 30, 76);                       // couloir est
cv.rect('G', 24, 62, 26, 66);
cv.rect('g', 2, 77, 30, 93);                        // la salle du bas
cv.rect('w', 14, 83, 20, 89);
for (const [x, y] of [[6, 88], [25, 81], [10, 92]]) cv.point('q', x, y);
cv.point('n', 27, 93);                              // vers la Route 33
const BLOCS_CAVES = cv.blocs('caves');

// ——— Puits Ramoloss : l'entrée (D26R0101) et le 1er sous-sol (D26R0102, 44 × 30) ———
const pe = new Peintre(0, 0, 1, 1, 'G');
pe.rect('g', 8, 4, 20, 12);
pe.rect('w', 8, 10, 12, 12);
pe.point('u', 17, 5); pe.point('u', 11, 6);
const BLOCS_PUITS = pe.blocs('puits');

const pb = new Peintre(0, 0, 2, 1, 'G');
pb.rect('g', 38, 20, 43, 28);                       // le pied de l'échelle
pb.point('u', 42, 27);
pb.rect('g', 40, 4, 43, 20);                        // le couloir qui monte
pb.rect('g', 21, 2, 43, 9);                         // la galerie du haut
pb.rect('g', 20, 10, 23, 28);
pb.rect('w', 24, 11, 37, 18);
pb.rect('g', 24, 19, 37, 22); pb.rect('w', 24, 23, 34, 28);
pb.point('q', 23, 3);                               // rocher à pousser (FORCE) vers le 2e sous-sol
for (const [x, y] of [[33, 2], [40, 15]]) pb.point('q', x, y);
const BLOCS_PUITS_B1F = pb.blocs('puits_b1f');

// ——— maison de FARGAS (T23R0501) et charbonnerie (T23R0201) ———
const sk = salle(1, 3, 10, 9).mettre(4, 9, 'm');
const MAISON_FARGAS = bloc({ plan: sk.plan(), legende: piecesHGSS('parquet', 'mur'), meubles: [
  { m: 'shelf02', x: 1, y: 3, repli: 'etagere' }, { m: 'shelf02', x: 2, y: 3, repli: 'etagere' },
  { m: 'window01', x: 8, y: 2, l: 2, mur: true, dy: 0.5 }, { m: 'plant01', x: 10, y: 3 },
  { m: 'table01_2', x: 7, y: 7, l: 2, repli: 'table' }, { m: 'chair01', x: 7, y: 8, libre: true },
  { m: 'd_mat01', x: 4, y: 9, libre: true, dx: -0.5 },
] });
const sc = salle(1, 3, 10, 9).mettre(4, 9, 'm');
const CHARBONNERIE = bloc({ plan: sc.plan(), legende: piecesHGSS('parquet', 'mur'), meubles: [
  { m: 'shelf02', x: 6, y: 3, repli: 'etagere' }, { m: 'shelf02', x: 7, y: 3, repli: 'etagere' },
  { m: 'plant01', x: 1, y: 3 }, { m: 'table01_2', x: 2, y: 8, l: 2, repli: 'table' },
  { m: 'd_mat01', x: 4, y: 9, libre: true, dx: -0.5 },
] });

// ——— arène d'Écorcia : le hall (T23GYM0101) et la serre aux chariots (T23GYM0102, 19 × 38) ———
const sh = salle(1, 4, 13, 11).mettre(7, 11, 'm').mettre(7, 3, 'H').mettre(4, 9, 'S').mettre(10, 9, 'S');
const HALL = bloc({ plan: sh.plan(), legende: piecesHGSS('plancher', 'mur', {
  'H': { sol: 'plancher', mb: MB.ESCALIER }, 'S': { col: 1, sol: 'plancher', decor: 'statue' } }) });

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

const ga = new Peintre(0, 0, 1, 2, ' ');
ga.rect('W', 0, 0, 18, 37);
ga.rect('.', 1, 1, 17, 9);                          // en haut : trois replats séparés par des arbres
ga.rect('T', 6, 1, 6, 9); ga.rect('T', 12, 1, 12, 9);
ga.rect('x', 1, 10, 17, 16);                        // la fosse (on ne la traverse qu'en chariot)
ga.rect('.', 1, 17, 17, 24);                        // au milieu
ga.rect('x', 1, 25, 17, 31);
ga.rect('.', 1, 32, 17, 36);                        // l'entrée
ga.point('m', 9, 37);
// les toiles des chariots, tracées sur la fosse
const toile = (a, b) => {
  let [x, y] = a; const [x1, y1] = b, dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (ga.get(x, y) === 'x') ga.point('r', x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x += sx; }
    if (e2 <= dx) { e += dx; y += sy; }
  }
};
for (const t of [T15, T26, T34, T7_10, T7_11, T8_10, T8_12, T8_11]) for (let i = 0; i + 1 < t.length; i++) toile(t[i], t[i + 1]);
for (const [x, y] of [[4, 7], [11, 8], [11, 18], [2, 18]]) ga.point('k', x, y);   // les aiguillages
for (const [x, y] of [[1, 36], [17, 36], [1, 32], [17, 32], [5, 22], [13, 20]]) ga.point('F', x, y);
const BLOCS_ARENE = ga.blocs('arene_e', piecesHGSS('plancher', 'mur', {
  'x': { col: 1, sol: 'hautes_herbes' }, 'r': { col: 1, sol: 'ponton' },
  'T': { col: 1, sol: 'herbe', decor: 'arbre' }, 'k': { col: 1, sol: 'plancher', decor: 'machine' }, 'F': { sol: 'fleurs' },
}));

// ——— zones ———
const CAVES = { nom: 'Caves Jumelles', musique: 'grotte', camera: 'grotte', velo: false, interieur: true };
const PUITS = { nom: 'Puits Ramoloss', musique: 'grotte', camera: 'grotte', velo: false, interieur: true };
const PE = (x, y) => ({ x: x + 10, y: y + 10 });   // poste de garde est-ouest (POSTE_EO de johto.js)

export const ZONES_ECORCIA = {
  // ———————————————————————————— Route 32 ————————————————————————————
  ROUTE_32: {
    nom: 'Route 32', musique: 'route30', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Rattata', poids: 30, niveaux: [4, 6] }, { espece: 'Abo', poids: 20, niveaux: [4, 6] },
        { espece: 'Chétiflor', poids: 20, niveaux: [4, 6] }, { espece: 'Wattouat', poids: 15, niveaux: [4, 6] },
        { espece: 'Granivol', poids: 10, niveaux: [4, 5] }, { espece: 'Axoloto', poids: 5, niveaux: [5, 6] },
      ] },
      eau: { taux: 10, especes: [{ espece: 'Tentacool', poids: 60, niveaux: [15, 20] }, { espece: 'Axoloto', poids: 40, niveaux: [15, 20] }] },
    },
    scripts: `
script PanneauR32
  message "ROUTE 32\\n↑ MAUVILLE   ↓ ÉCORCIA"
  fin
script PanneauRuines
  message "RUINES D'ALPHA\\nEntrée est"
  fin
script PanneauCaves
  message "CAVES JUMELLES\\nDroit devant"
  fin

# l'homme qui attend au tournant : sans le BADGE ZÉPHYR, il renvoie vers l'arène de Mauville
script GrainMiracle_Arret
  exclamation grain
  message "Hé, attends !\\nPourquoi tant de hâte ?"
  joueur_regarde droite
  si drapeau BADGE_ZEPHYR aller GrainMiracle_Don
  message "Tu es allé à l'ARÈNE POKéMON ?\\nOn y met à l'épreuve ses POKéMON et soi-même."
  message "C'est un passage obligé pour tout dresseur !"
  mouvement joueur Recule
  attendre_mouvements
  liberer
  fin
GrainMiracle_Don:
  appeler GrainMiracle_Cadeau
  liberer
  fin
GrainMiracle_Cadeau:
  message "Tu as de bons POKéMON !\\nL'entraînement à MAUVILLE a payé, on dirait."
  message "En souvenir de MAUVILLE, prends ceci.\\nIl renforce les capacités de type PLANTE."
  donner_objet miracle-seed
  var R32_GRAIN 1
  retour
script GrainMiracle
  regarder_joueur
  si var R32_GRAIN = 1 aller GrainMiracle_Deja
  si non drapeau BADGE_ZEPHYR aller GrainMiracle_Sans
  appeler GrainMiracle_Cadeau
  liberer
  fin
GrainMiracle_Sans:
  message "Tu es allé à l'ARÈNE POKéMON ?\\nOn y met à l'épreuve ses POKéMON et soi-même."
  liberer
  fin
GrainMiracle_Deja:
  message "Ce que tu as vécu à MAUVILLE te servira\\npour la suite de ton voyage."
  liberer
  fin
mouvement Recule
  haut 2
  regard_bas
fin

script Rugissant
  regarder_joueur
  si drapeau A_CT05 aller Rugissant_Deja
  message "GRRROAAAR !\\nLES GENS FUIENT QUAND JE RUGIS !"
  message "MAIS TOI, TU ES VENU ME VOIR !\\nÇA ME PLAÎT ! TIENS, PRENDS ÇA !"
  donner_objet tm05
  drapeau A_CT05
  liberer
  fin
Rugissant_Deja:
  message "GRRROAAAR ! C'EST HURLEMENT !\\nMÊME LES POKéMON FUIENT DEVANT UN BON RUGISSEMENT !"
  liberer
  fin

script QueueRamoloss
  regarder_joueur
  message "Une bonne QUEUERAMOLOSS, savoureuse et\\nnourrissante ? Pour toi : 1 000 000 $ !"
  oui_non
  si resultat = 0 aller QueueRamoloss_Non
  message "Tss ! Je croyais que les jeunes d'aujourd'hui\\navaient les poches pleines…"
  liberer
  fin
QueueRamoloss_Non:
  message "Tu n'en veux pas ? Alors file. Ouste !"
  liberer
  fin

script Albert32_Defi
  message "Je ne sais pas si je suis fort ou faible.\\nVoyons voir !"
  combat_dresseur
  message "J'étais plus faible que je croyais…"
  liberer
  fin
script Albert32_Apres
  regarder_joueur
  message "J'essaie d'attraper toutes sortes de POKéMON.\\nLa ROUTE 32 en a plein !"
  liberer
  fin
script Liz_Defi
  message "Tu fais un pique-nique ?\\nAlors faisons un combat !"
  combat_dresseur
  message "Oh non ! J'ai perdu…"
  liberer
  fin
script Liz_Apres
  regarder_joueur
  message "On a de la chance qu'il fasse si beau aujourd'hui."
  liberer
  fin
script Henry_Defi
  message "Ma passion, c'est la pêche. Mais les combats\\nde POKéMON, j'aime bien aussi !"
  combat_dresseur
  message "Je me suis fait prendre comme un poisson…"
  liberer
  fin
script Henry_Apres
  regarder_joueur
  message "Les POKéMON qu'on pêche ici ne sont pas\\nceux des hautes herbes."
  liberer
  fin
script Justin_Defi
  message "Chut ! Tu vas faire fuir les poissons !"
  combat_dresseur
  message "Bon, tu as gagné. Ne fais plus de bruit."
  liberer
  fin
script Justin_Apres
  regarder_joueur
  message "La pêche demande de la patience.\\nComme l'élevage de MAGICARPE."
  liberer
  fin
script Ralph_Defi
  message "Une touche ! Tiens, c'est un dresseur !\\nAllez, au combat !"
  combat_dresseur
  message "Raté ! Pêche et combat, même combat…"
  liberer
  fin
script Ralph_Apres
  regarder_joueur
  message "On dit qu'un grand poisson rôde dans cet étang."
  liberer
  fin
script Roland_Defi
  message "Ce chemin mène aux CAVES JUMELLES.\\nMontre-moi si tu es prêt !"
  combat_dresseur
  message "Tu es plus fort que moi, c'est sûr."
  liberer
  fin
script Roland_Apres
  regarder_joueur
  message "On campe au bord de l'eau. C'est le meilleur endroit !"
  liberer
  fin
script Gordon_Defi
  message "J'ai attrapé un POKéMON génial !\\nTu veux le voir ?"
  combat_dresseur
  message "Je pensais vraiment qu'il était génial…"
  liberer
  fin
script Gordon_Apres
  regarder_joueur
  message "AXOLOTO adore l'eau. Il sort la nuit, surtout."
  liberer
  fin
script Peter_Defi
  message "Mes POKéMON oiseaux volent haut !\\nPeux-tu les suivre ?"
  combat_dresseur
  message "Ils sont redescendus bien vite…"
  liberer
  fin
script Peter_Apres
  regarder_joueur
  message "Les CAVES JUMELLES sont juste là.\\nIl y fait noir, mais on y passe sans FLASH."
  liberer
  fin
`,
  },
  POSTE_RUINES: ZI('Route 32', {
    musique: 'route30',
    warps: [{ ...PE(11, 3), vers: 'ROUTE_32', n: 0 }],
    objets: [{ id: 'garde', ...PE(2, 3), sprite: 'garde', dir: DROITE, script: 'GardeRuines' }],
    scripts: `
script GardeRuines
  regarder_joueur
  message "Les RUINES D'ALPHA sont fermées : des fouilles\\nsont en cours. Reviens plus tard !"
  liberer
  fin
`,
  }),
  ...centreHGSS('CENTRE_R32', 'Route 32', 'ROUTE_32', 2, {
    objets: [
      { id: 'pecheur_canne', x: 4, y: 15, sprite: 'pecheur2', dir: BAS, script: 'PecheurCanne' },
      { id: 'dame_r32', x: 12, y: 12, sprite: 'femme3', dir: BAS, script: 'DameR32' },
      { id: 'noigrumes', x: 1, y: 18, sprite: 'monsieur', dir: DROITE, script: 'AmateurNoigrumes' },
    ],
    scripts: `
script PecheurCanne
  regarder_joueur
  si drapeau A_CANNE aller PecheurCanne_Deja
  message "On pêche bien, par ici. À voir tous ces pêcheurs,\\nça ne t'a pas donné envie d'essayer ?"
  message "Tu veux une de mes CANNES ?"
  oui_non
  si resultat = 0 aller PecheurCanne_Non
  donner_objet old-rod
  drapeau A_CANNE
PecheurCanne_Deja:
  message "Pour pêcher, place-toi face à l'eau et sors ta\\nCANNE. Quand un « ! » apparaît, appuie vite sur A !"
  liberer
  fin
PecheurCanne_Non:
  message "Oh… C'est bien dommage…"
  liberer
  fin
script DameR32
  regarder_joueur
  message "Quel objet devrais-je faire tenir à mon POKéMON ?\\nPeut-être un qui augmente son ATTAQUE…"
  liberer
  fin
script AmateurNoigrumes
  regarder_joueur
  si drapeau A_APPAT_R32 aller AmateurNoigrumes_Deja
  message "Bonjour ! Tu ramasses des NOIGRUMES ?"
  message "Voilà une APPÂT BALL : elle sert à attraper les\\nPOKéMON qu'on pêche. Elle est faite d'une NOIGRUME !"
  donner_objet lure-ball
  drapeau A_APPAT_R32
AmateurNoigrumes_Deja:
  message "À ÉCORCIA, un certain FARGAS fabrique des BALLS\\navec les NOIGRUMES. Va le voir !"
  liberer
  fin
`,
  }),

  // ———————————————————————————— Caves Jumelles ————————————————————————————
  CAVES_1F: {
    ...CAVES,
    rencontres: { sol: { taux: 10, especes: [
      { espece: 'Racaillou', poids: 35, niveaux: [5, 8] }, { espece: 'Nosferapti', poids: 35, niveaux: [5, 8] },
      { espece: 'Sabelette', poids: 15, niveaux: [6, 8] }, { espece: 'Onix', poids: 10, niveaux: [6, 8] }, { espece: 'Rattata', poids: 5, niveaux: [5, 7] },
    ] }, eau: null },
    warps: [{ x: 27, y: 43, vers: 'ROUTE_32', n: 3 }, { x: 27, y: 93, vers: 'ROUTE_33', n: 0 }],
    objets: [
      { id: 'daniel', x: 5, y: 48, sprite: 'montagnard2', dir: DROITE, nom: 'Montagnard Daniel',
        dresseur: { portee: 3, script: 'Daniel_Defi', apres: 'Daniel_Apres', equipe: [{ espece: 'Onix', niveau: 11 }] } },
      { id: 'russel', x: 20, y: 51, sprite: 'montagnard2', dir: GAUCHE, nom: 'Montagnard Russel',
        dresseur: { portee: 3, script: 'Russel_Defi', apres: 'Russel_Apres', equipe: [{ espece: 'Racaillou', niveau: 4 }, { espece: 'Racaillou', niveau: 6 }, { espece: 'Racaillou', niveau: 8 }] } },
      { id: 'bill', x: 23, y: 69, sprite: 'cracheur', dir: DROITE, nom: 'Cracheur Bill',
        dresseur: { portee: 4, script: 'Bill_Defi', apres: 'Bill_Apres', equipe: [{ espece: 'Smogo', niveau: 6 }, { espece: 'Smogo', niveau: 6 }] } },
      { id: 'ray', x: 8, y: 26, sprite: 'cracheur', dir: BAS, nom: 'Cracheur Ray',
        dresseur: { portee: 3, script: 'Ray_Defi', apres: 'Ray_Apres', equipe: [{ espece: 'Goupix', niveau: 9 }] } },
      { id: 'larry', x: 12, y: 80, sprite: 'maniaque', dir: DROITE, nom: 'Pokémaniac Larry',
        dresseur: { portee: 2, script: 'Larry_Defi', apres: 'Larry_Apres', equipe: [{ espece: 'Ramoloss', niveau: 11 }] } },
      { id: 'attaque_caves', type: 'objet', x: 3, y: 34, sprite: 'objet', objet: 'x-attack', drapeau: 'OBJ_CAVES_ATTAQUE' },
      { id: 'superball_caves', type: 'objet', x: 29, y: 72, sprite: 'objet', objet: 'great-ball', drapeau: 'OBJ_CAVES_SUPERBALL' },
      { id: 'potion_caves', type: 'objet', x: 4, y: 67, sprite: 'objet', objet: 'potion', drapeau: 'OBJ_CAVES_POTION' },
      { id: 'reveil_caves', type: 'objet', x: 23, y: 93, sprite: 'objet', objet: 'awakening', drapeau: 'OBJ_CAVES_REVEIL' },
    ],
    scripts: `
script Daniel_Defi
  message "Tu sais combien de pas il y a d'ici\\nà la ROUTE 33 ? Moi, je les ai comptés !"
  combat_dresseur
  message "Je me suis trompé dans mes calculs…"
  liberer
  fin
script Daniel_Apres
  regarder_joueur
  message "ONIX est mon compagnon de randonnée.\\nIl creuse des galeries pour moi."
  liberer
  fin
script Russel_Defi
  message "Tu viens de MAUVILLE ? Moi, je vais à ÉCORCIA.\\nMais d'abord, un combat !"
  combat_dresseur
  message "Mes RACAILLOU ont roulé jusqu'en bas…"
  liberer
  fin
script Russel_Apres
  regarder_joueur
  message "Le vendredi, on entend un cri étrange\\ntout au fond des grottes…"
  liberer
  fin
script Bill_Defi
  message "Je suis venu m'entraîner à cracher du feu\\nici, où ça ne brûle rien !"
  combat_dresseur
  message "Pfff… Mon feu s'est éteint."
  liberer
  fin
script Bill_Apres
  regarder_joueur
  message "La TEAM ROCKET a disparu il y a trois ans.\\nMais j'ai vu des types louches passer par ici…"
  liberer
  fin
script Ray_Defi
  message "Si tu es là, c'est que tu veux te brûler !"
  combat_dresseur
  message "Tu es plus brûlant que moi !"
  liberer
  fin
script Ray_Apres
  regarder_joueur
  message "Le feu, c'est ma vie. GOUPIX aussi."
  liberer
  fin
script Larry_Defi
  message "Tu sais que les RAMOLOSS d'ÉCORCIA ont\\ndisparu ? On dit que des voleurs les ont pris…"
  combat_dresseur
  message "Ah ! Mon précieux RAMOLOSS…"
  liberer
  fin
script Larry_Apres
  regarder_joueur
  message "J'aime les POKéMON. Surtout ceux qui bâillent."
  liberer
  fin
`,
  },

  // ———————————————————————————— Route 33 ————————————————————————————
  ROUTE_33: {
    nom: 'Route 33', musique: 'route30', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Rattata', poids: 30, niveaux: [6, 7] }, { espece: 'Piafabec', poids: 25, niveaux: [6, 7] },
        { espece: 'Abo', poids: 20, niveaux: [6, 7] }, { espece: 'Granivol', poids: 10, niveaux: [6, 7] },
        { espece: 'Racaillou', poids: 10, niveaux: [6, 7] }, { espece: 'Nosferapti', poids: 5, niveaux: [6, 6] },
      ] },
    },
    scripts: `
script PanneauR33
  message "ROUTE 33\\n← ÉCORCIA"
  fin
script Essoufflee
  regarder_joueur
  message "Pfff, pfff… J'ai enfin traversé cette grotte.\\nElle était bien plus grande que je ne pensais !"
  message "J'étais trop fatiguée pour tout explorer,\\nalors je suis sortie."
  liberer
  fin
script Anthony_Defi
  message "Je viens de traverser les CAVES JUMELLES.\\nJe suis en pleine forme !"
  combat_dresseur
  message "Il est temps de faire une pause…"
  liberer
  fin
script Anthony_Apres
  regarder_joueur
  message "Il pleut souvent ici. ÉCORCIA est juste à côté."
  liberer
  fin
`,
  },

  // ———————————————————————————— Écorcia ————————————————————————————
  ECORCIA: {
    nom: 'Écorcia', musique: 'griotte', camera: 'ville',
    scripts: `
script PanneauEcorcia
  message "ÉCORCIA\\nLa ville où l'on vit en harmonie avec les POKéMON."
  fin
script PanneauFargas
  message "MAISON DE FARGAS\\nNoigrumes et rien d'autre. Le créateur têtu de POKé BALLS."
  fin
script PanneauArene
  message "ARÈNE POKéMON d'ÉCORCIA\\nChampion : HECTOR, l'encyclopédie vivante des insectes."
  fin
script PanneauPuits
  message "PUITS RAMOLOSS, aussi appelé « puits de la pluie »."
  message "On dit ici qu'un bâillement de RAMOLOSS fait pleuvoir.\\nIl y a 400 ans, l'un d'eux aurait mis fin à une sécheresse."
  fin
script PanneauCharbon
  message "CHARBONNERIE\\nNos CANARTICHO ramassent le bois pour le charbon !"
  fin
script PanneauBois
  message "BOIS AUX CHÊNES\\nEntrée par le poste."
  fin

script SbirePuits
  regarder_joueur
  message "Il ne se passe rien ici. C'est dangereux d'entrer,\\nalors je monte la garde pour que personne n'y aille."
  message "Je suis un bon samaritain, non ?"
  liberer
  fin
script SbireArene
  regarder_joueur
  message "Qui es-tu ? Tu ne nous connais pas ?\\nNous sommes… la TEAM ROCKET !"
  message "… Quoi ? Dissous ? N'importe quoi !\\nNous sommes revenus pour l'ambition de GIOVANNI !"
  message "Assez parlé. Dégage !"
  liberer
  fin
script VieuxEcorcia
  regarder_joueur
  message "Tu viens voir FARGAS pour qu'il te fasse des BALLS ?\\nBeaucoup de gens viennent pour ça."
  liberer
  fin
script FemmeEcorcia
  regarder_joueur
  si drapeau PUITS_LIBERE aller FemmeEcorcia_Apres
  message "Les RAMOLOSS ont disparu de la ville…\\nOn raconte que leurs queues sont vendues quelque part."
  liberer
  fin
FemmeEcorcia_Apres:
  message "Les RAMOLOSS sont revenus. Connaissant leur\\ncaractère, ils faisaient peut-être juste la sieste."
  liberer
  fin
script HommeEcorcia
  regarder_joueur
  message "Après ÉCORCIA, c'est le BOIS AUX CHÊNES.\\nLes arbres y sont si serrés qu'on ne passe pas."
  message "Les POKéMON du charbonnier savent couper les arbres."
  liberer
  fin
script MonsieurEcorcia
  regarder_joueur
  si drapeau PUITS_LIBERE aller MonsieurEcorcia_Apres
  message "Un dur à cuire vit ici : FARGAS.\\nIl devrait pouvoir régler cette affaire…"
  liberer
  fin
MonsieurEcorcia_Apres:
  message "Je savais qu'on pouvait compter sur FARGAS !"
  liberer
  fin
script RamolossEcorcia
  message "RAMOLOSS : …\\n……"
  message "… Bâââille ?"
  fin

# le rival : il surgit à la hauteur où l'on passe, à deux cases à l'ouest
script RivalEcorcia
  musique rival
  si var STARTER = 1 aller RivalE_Eau
  si var STARTER = 2 aller RivalE_Plante
  drapeau RIVAL_E_FEU
  placer_relatif rival_feu -2 0 droite
  appeler RivalE_Avant
  combat_dresseur rival_feu
  aller RivalE_Fin
RivalE_Eau:
  drapeau RIVAL_E_EAU
  placer_relatif rival_eau -2 0 droite
  appeler RivalE_Avant
  combat_dresseur rival_eau
  aller RivalE_Fin
RivalE_Plante:
  drapeau RIVAL_E_PLANTE
  placer_relatif rival_plante -2 0 droite
  appeler RivalE_Avant
  combat_dresseur rival_plante
RivalE_Fin:
  message "… Pff. Je déteste les faibles.\\nPOKéMON ou dresseurs, peu importe."
  message "La TEAM ROCKET aussi : en groupe, ils se croient\\nforts. Seuls, ce sont des minables. Je les hais tous."
  message "Ne te mets pas en travers de mon chemin."
  fondu_noir
  drapeau RIVAL_E_FAIT
  var RIVAL_ECORCIA 2
  fondu_retour
  musique_zone
  liberer
  fin
RivalE_Avant:
  joueur_regarde gauche
  exclamation joueur
  message "{JOUEUR}… Dis-moi une chose.\\nC'est vrai que la TEAM ROCKET est de retour ?"
  message "Quoi ? Tu les as battus ? Ha ! Arrête de mentir.\\nTu es sérieux ? Voyons ce que tu vaux, alors."
  retour
script RivalE_Rien
  fin
`,
  },
  POSTE_BOIS: ZI('Écorcia', {
    musique: 'griotte',
    warps: [{ ...PE(11, 3), vers: 'ECORCIA', n: 0 }],
    objets: [
      { id: 'garde', ...PE(1, 3), sprite: 'garde', dir: DROITE, script: 'GardeBois' },
      { id: 'vieille', ...PE(3, 1), sprite: 'vieille', dir: BAS, script: 'VieilleBois' },
    ],
    scripts: `
script GardeBois
  regarder_joueur
  message "Un grand arbre est tombé en travers du\\nBOIS AUX CHÊNES. On ne passe pas pour l'instant !"
  liberer
  fin
script VieilleBois
  regarder_joueur
  message "Le bois est veillé par son protecteur.\\nPas de bêtises là-dedans !"
  liberer
  fin
`,
  }),
  ...centreHGSS('CENTRE_ECORCIA', 'Écorcia', 'ECORCIA', 2, {
    objets: [
      { id: 'dame_e', x: 5, y: 16, sprite: 'dame_pc', mouvement: 'errance', rayon: 1, script: 'DameEcorcia' },
      { id: 'pecheur_e', x: 12, y: 12, sprite: 'pecheur2', dir: BAS, script: 'PecheurEcorcia' },
      { id: 'gentleman_e', x: 10, y: 15, sprite: 'gentleman', mouvement: 'regard_alea', script: 'GentlemanEcorcia' },
    ],
    scripts: `
script DameEcorcia
  regarder_joueur
  message "Tes POKéMON connaissent des capacités spéciales ?\\nMême K.O., un POKéMON peut s'en servir hors combat !"
  liberer
  fin
script PecheurEcorcia
  regarder_joueur
  message "Le PC de LÉO garde jusqu'à 30 POKéMON par boîte."
  liberer
  fin
script GentlemanEcorcia
  regarder_joueur
  message "Sais-tu ce qu'est une NOIGRUME ? On l'ouvre, on la\\nvide, et avec une machine, on en fait une BALL."
  message "Avant les POKé BALLS, tout le monde attrapait\\nles POKéMON avec des NOIGRUMES."
  liberer
  fin
`,
  }),
  BOUTIQUE_ECORCIA: boutiqueHGSS('Écorcia', 'ECORCIA', 3, 'poke-ball great-ball potion super-potion antidote paralyze-heal awakening repel'),
  CHARBONNERIE: ZI('Écorcia', {
    musique: 'maison',
    warps: [{ x: 4, y: 9, vers: 'ECORCIA', n: 4 }],
    objets: [
      { id: 'charbonnier', x: 2, y: 6, sprite: 'charbonnier', dir: DROITE, script: 'Charbonnier' },
      { id: 'apprenti', x: 5, y: 5, sprite: 'apprenti', mouvement: 'regard_alea', script: 'Apprenti' },
      { id: 'canarticho_1', x: 8, y: 7, sprite: 'canarticho', mouvement: 'errance', rayon: 1, script: 'Canarticho' },
      { id: 'canarticho_2', x: 9, y: 5, sprite: 'canarticho', mouvement: 'regard_alea', script: 'Canarticho' },
    ],
    scripts: `
script Charbonnier
  regarder_joueur
  si drapeau PUITS_LIBERE aller Charbonnier_Apres
  message "Tous les RAMOLOSS ont disparu de la ville.\\nLe protecteur du bois est peut-être fâché…"
  message "C'est peut-être un mauvais présage.\\nMieux vaut rester à l'intérieur."
  liberer
  fin
Charbonnier_Apres:
  message "Les RAMOLOSS sont revenus… Merci à toi !"
  si drapeau A_CHARBON aller Charbonnier_Fin
  message "Tiens, c'est du CHARBON de ma fabrication.\\nTenu par un POKéMON, il renforce le type FEU."
  donner_objet charcoal
  drapeau A_CHARBON
Charbonnier_Fin:
  liberer
  fin
script Apprenti
  regarder_joueur
  message "Où sont passés tous les RAMOLOSS ?\\nIls sont partis jouer quelque part ?"
  liberer
  fin
script Canarticho
  message "CANARTICHO : Kwaa !"
  fin
`,
  }),
  MAISON_FARGAS: ZI('Écorcia', {
    musique: 'maison',
    warps: [{ x: 4, y: 9, vers: 'ECORCIA', n: 6 }],
    panneaux: [{ x: 9, y: 2, script: 'PhotoFargas' }, { x: 6, y: 3, script: 'StatueBois' }],
    niveau: { image: [{ var: 'FARGAS_MERCI', val: 1, script: 'FargasMerci' }] },
    objets: [
      { id: 'fargas', x: 4, y: 4, sprite: 'fargas', dir: BAS, drapeau: 'FARGAS_PARTI', script: 'Fargas' },
      { id: 'petite_fille', x: 6, y: 5, sprite: 'jumelle', mouvement: 'regard_alea', script: 'PetiteFille' },
      { id: 'ramoloss_f', x: 7, y: 5, sprite: 'ramoloss', dir: BAS, siDrapeau: 'PUITS_LIBERE', script: 'RamolossFargas' },
    ],
    scripts: `
script Fargas
  regarder_joueur
  si drapeau PUITS_LIBERE aller Fargas_Apres
  message "Hm ? Qui es-tu ?\\n{JOUEUR}, hein ? Tu veux que je te fasse des BALLS ?"
  message "Désolé, ça va devoir attendre.\\nTu connais la TEAM ROCKET ?"
  message "C'est un gang qui se sert des POKéMON pour ses sales\\nbesognes. Elle était censée être dissoute depuis trois ans."
  message "Ces bandits coupent les queues des RAMOLOSS\\ndans le puits, pour les vendre !"
  message "Je vais leur donner une bonne leçon !\\nAttends-moi ici !"
  marcher_vers fargas 4 8 vite
  attendre_mouvements
  cacher fargas
  drapeau FARGAS_PARTI
  drapeau ROCKET_PUITS_PARTI
  liberer
  fin
Fargas_Apres:
  message "Je fabrique des POKé BALLS avec des NOIGRUMES.\\nCueille-les sur les arbres et apporte-les-moi."
  liberer
  fin
script FargasMerci
  verrouiller
  regarder fargas bas
  message "FARGAS : Salut, {JOUEUR} !\\nTu t'es conduit comme un vrai héros."
  message "La TEAM ROCKET avait été dissoute il y a trois ans\\npar un garçon nommé RED. S'ils sont de retour…"
  message "J'ai un mauvais pressentiment. En tout cas, ce serait\\nun plaisir de fabriquer des BALLS pour toi."
  message "Tiens, prends celle-ci : une APPÂT BALL, faite d'une\\nNOIGRUME. Elle attrape bien les POKéMON pêchés."
  donner_objet lure-ball
  var FARGAS_MERCI 2
  liberer
  fin
script PetiteFille
  regarder_joueur
  si drapeau PUITS_LIBERE aller PetiteFille_Apres
  si drapeau FARGAS_PARTI aller PetiteFille_Seule
  message "Les RAMOLOSS sont partis… Ce sont des méchants\\nqui les ont emmenés ?"
  liberer
  fin
PetiteFille_Seule:
  message "Grand-père est parti… Je suis toute seule…"
  liberer
  fin
PetiteFille_Apres:
  message "Le RAMOLOSS que papa m'a donné est revenu !\\nEt sa queue a repoussé !"
  liberer
  fin
script RamolossFargas
  message "RAMOLOSS : … Bâââille ?"
  fin
script PhotoFargas
  message "Une photo de trois personnes devant un paysage :\\nFARGAS, le PROF. CHEN et… une dame au regard décidé."
  fin
script StatueBois
  message "Une statue du protecteur du bois."
  fin
`,
  }),

  // ———————————————————————————— Puits Ramoloss ————————————————————————————
  PUITS: {
    ...PUITS,
    rencontres: { sol: { taux: 10, especes: [{ espece: 'Nosferapti', poids: 60, niveaux: [5, 8] }, { espece: 'Ramoloss', poids: 40, niveaux: [5, 8] }] }, eau: null },
    warps: [{ x: 17, y: 5, vers: 'ECORCIA', n: 7, sortie: BAS }, { x: 11, y: 6, vers: 'PUITS_B1F', n: 0, sortie: BAS }],
    objets: [{ id: 'fargas_puits', x: 17, y: 8, sprite: 'fargas', dir: HAUT, siDrapeau: 'FARGAS_PARTI', script: 'FargasPuits' }],
    scripts: `
script FargasPuits
  regarder_joueur
  message "FARGAS : Hé, {JOUEUR} ! Le garde là-haut a filé\\nquand je lui ai crié dessus."
  message "Mais après, j'ai fait une chute dans le puits.\\nJe me suis cogné le dos… je ne peux plus bouger."
  message "Bon sang ! Si j'étais en forme, mes POKéMON leur\\nauraient donné une leçon… Tant pis."
  message "{JOUEUR}, montre-leur de quoi tu es capable !"
  liberer
  fin
`,
  },
  PUITS_B1F: {
    ...PUITS,
    rencontres: { sol: { taux: 10, especes: [{ espece: 'Nosferapti', poids: 60, niveaux: [5, 8] }, { espece: 'Ramoloss', poids: 40, niveaux: [5, 8] }] }, eau: null },
    warps: [{ x: 42, y: 27, vers: 'PUITS', n: 1, sortie: HAUT }],
    objets: [
      { id: 'sbire_a', x: 42, y: 11, sprite: 'brume', dir: BAS, drapeau: 'PUITS_LIBERE', nom: 'Sbire',
        dresseur: { portee: 4, portrait: 'brume', script: 'SbireA_Defi', apres: 'SbireA_Apres', equipe: [{ espece: 'Rattata', niveau: 9 }, { espece: 'Rattata', niveau: 9 }] } },
      { id: 'sbire_b', x: 27, y: 9, sprite: 'brume', dir: DROITE, drapeau: 'PUITS_LIBERE', nom: 'Sbire',
        dresseur: { portee: 4, portrait: 'brume', script: 'SbireB_Defi', apres: 'SbireB_Apres',
          equipe: [{ espece: 'Rattata', niveau: 7 }, { espece: 'Nosferapti', niveau: 9 }, { espece: 'Nosferapti', niveau: 9 }] } },
      { id: 'sbire_c', x: 37, y: 7, sprite: 'brume_f', dir: GAUCHE, drapeau: 'PUITS_LIBERE', nom: 'Sbire',
        dresseur: { portee: 3, portrait: 'brume_f', script: 'SbireC_Defi', apres: 'SbireC_Apres', equipe: [{ espece: 'Nosferapti', niveau: 9 }, { espece: 'Abo', niveau: 11 }] } },
      { id: 'proton', x: 27, y: 3, sprite: 'proton', dir: BAS, drapeau: 'PUITS_LIBERE', nom: 'Proton',
        dresseur: { portee: 0, portrait: 'sylas', script: 'Proton', apres: 'Proton', drapeau: 'DRESSEUR_PROTON_PUITS',
          equipe: [{ espece: 'Nosferapti', niveau: 8 }, { espece: 'Smogo', niveau: 12 }] } },
      { id: 'ramoloss_a', x: 29, y: 3, sprite: 'ramoloss', dir: BAS, script: 'RamolossCoupe' },
      { id: 'ramoloss_b', x: 31, y: 6, sprite: 'ramoloss', dir: GAUCHE, script: 'RamolossCoupe' },
      { id: 'superpotion_puits', type: 'objet', x: 34, y: 5, sprite: 'objet', objet: 'super-potion', drapeau: 'OBJ_PUITS_SUPERPOTION' },
    ],
    scripts: `
script SbireA_Defi
  message "Hé ! Tu n'as rien à faire ici !\\nLes affaires de la TEAM ROCKET ne te regardent pas !"
  combat_dresseur
  message "Grr… Un gamin m'a battu…"
  liberer
  fin
script SbireA_Apres
  regarder_joueur
  message "Les queues de RAMOLOSS se vendent une fortune !"
  liberer
  fin
script SbireB_Defi
  message "On coupe les queues des RAMOLOSS pour les vendre.\\nTu comptes nous en empêcher ?"
  combat_dresseur
  message "Pas possible ! Battu par un mioche !"
  liberer
  fin
script SbireB_Apres
  regarder_joueur
  message "Ça repousse, une queue de RAMOLOSS.\\nOn ne fait rien de mal… Enfin, presque."
  liberer
  fin
script SbireC_Defi
  message "Arrête-toi là ! On ne passe pas !"
  combat_dresseur
  message "Ah ! Quelle horreur !"
  liberer
  fin
script SbireC_Apres
  regarder_joueur
  message "Si notre chef te trouve, tu vas le regretter."
  liberer
  fin
script Proton
  regarder_joueur
  message "PROTON : Qu'est-ce que nous avons là ?\\nOn me dit le plus cruel de toute la TEAM ROCKET…"
  message "Je te conseille vivement de ne pas te mêler\\nde nos affaires !"
  combat_dresseur proton
  message "PROTON : Hmph… La TEAM ROCKET a bien été dissoute il y\\na trois ans. Mais nous avons continué dans l'ombre."
  message "Un petit obstacle comme toi ne gênera pas notre mission.\\nJe te conseille d'avoir très peur de ce qui va suivre !"
  fondu_noir
  drapeau PUITS_LIBERE
  effacer FARGAS_PARTI
  var FARGAS_MERCI 1
  message "FARGAS : Bravo, {JOUEUR} ! La TEAM ROCKET a filé.\\nMon dos va mieux aussi. Sortons d'ici !"
  teleporter_xy MAISON_FARGAS 4 6 haut
  liberer
  fin
script RamolossCoupe
  message "Un RAMOLOSS à la queue coupée…"
  fin
`,
  },

  // ———————————————————————————— Arène d'Écorcia ————————————————————————————
  ARENE_ECORCIA_HALL: ZI('Écorcia', {
    musique: 'arene',
    warps: [{ x: 7, y: 11, vers: 'ECORCIA', n: 5 }, { x: 7, y: 3, vers: 'ARENE_ECORCIA', n: 0, sortie: BAS }],
    panneaux: [{ x: 4, y: 9, script: 'StatueArene' }, { x: 10, y: 9, script: 'StatueArene' }],
    objets: [{ id: 'guide', x: 9, y: 9, sprite: 'guide_arene', dir: BAS, script: 'GuideEcorcia' }],
    scripts: `
script GuideEcorcia
  regarder_joueur
  si drapeau BADGE_ESSAIM aller GuideEcorcia_Bravo
  message "Yo, champion en herbe ! HECTOR a fait de cette arène\\nun immense nid de POKéMON insectes."
  message "Il est jeune, mais c'est un maître des insectes !\\nVoyons… Ils craignent le FEU, et le VOL aussi."
  message "Au fond, des MIMIGAL tirent des chariots sur leurs toiles.\\nLes leviers changent leur chemin !"
  liberer
  fin
GuideEcorcia_Bravo:
  message "Bien joué ! Quel beau combat entre jeunes talents.\\nAvec des dresseurs comme toi, l'avenir est radieux !"
  liberer
  fin
script StatueArene
  si drapeau BADGE_ESSAIM aller StatueArene_Badge
  message "ARÈNE POKéMON d'ÉCORCIA"
  fin
StatueArene_Badge:
  message "ARÈNE POKéMON d'ÉCORCIA\\nChampion : HECTOR. Dresseur reconnu : {JOUEUR} !"
  fin
`,
  }),
  ARENE_ECORCIA: {
    nom: 'Écorcia', annonce: false, musique: 'arene', camera: 'interieur', interieur: true, velo: false,
    rails: RAILS_ECORCIA,
    niveau: { chargement: 'InitRails' },
    warps: [{ x: 9, y: 37, vers: 'ARENE_ECORCIA_HALL', n: 1 }],
    // les douze stations : on monte depuis la case au sud (rangées 31 et 16) ou depuis la station (rangées 24 et 9)
    declencheurs: RAILS_ECORCIA.stations.map(([x, y], s) => ({ x, y: RAILS_ECORCIA.inverses.includes(s) ? y : y + 1, l: 1, h: 1, script: 'Station' + s })),
    panneaux: [{ x: 4, y: 7, script: 'Levier0' }, { x: 11, y: 8, script: 'Levier0' }, { x: 11, y: 18, script: 'Levier0' }, { x: 2, y: 18, script: 'Levier1' }],
    objets: [
      ...RAILS_ECORCIA.depart.map((s, i) => ({ id: 'chariot_' + i, x: RAILS_ECORCIA.stations[s][0], y: RAILS_ECORCIA.stations[s][1], sprite: 'mimigal', dir: BAS, traversable: true })),
      { id: 'hector', x: 9, y: 5, sprite: 'hector', dir: BAS, nom: 'Champion Hector',
        dresseur: { portee: 0, champion: true, portrait: 'hector', script: 'Hector', apres: 'Hector', prix: 1700,
          equipe: [{ espece: 'Insécateur', niveau: 17 }, { espece: 'Coconfort', niveau: 15 }, { espece: 'Chrysacier', niveau: 15 }] } },
      { id: 'al', x: 15, y: 22, sprite: 'insecte_gamin', dir: BAS, nom: 'Insectomane Al',
        dresseur: { portee: 1, script: 'Al_Defi', apres: 'Al_Apres', drapeau: 'DRESSEUR_ARENE_E_AL', equipe: [{ espece: 'Chenipan', niveau: 12 }, { espece: 'Aspicot', niveau: 12 }] } },
      { id: 'benny', x: 7, y: 20, sprite: 'insecte_gamin', dir: DROITE, nom: 'Insectomane Benny',
        dresseur: { portee: 4, script: 'Benny_Defi', apres: 'Benny_Apres', drapeau: 'DRESSEUR_ARENE_E_BENNY',
          equipe: [{ espece: 'Aspicot', niveau: 7 }, { espece: 'Coconfort', niveau: 9 }, { espece: 'Dardargnan', niveau: 12 }] } },
      { id: 'josh', x: 15, y: 7, sprite: 'insecte_gamin', dir: BAS, nom: 'Insectomane Josh',
        dresseur: { portee: 1, script: 'Josh_Defi', apres: 'Josh_Apres', drapeau: 'DRESSEUR_ARENE_E_JOSH', equipe: [{ espece: 'Paras', niveau: 13 }] } },
      // les jumelles se battent à deux dans le jeu (combat double) ; ici, une seule équipe pour les deux
      { id: 'amy', x: 3, y: 7, sprite: 'jumelle', dir: BAS, nom: 'Jumelles Amy & Mimi',
        dresseur: { portee: 1, script: 'Jumelles_Defi', apres: 'Jumelles_Apres', drapeau: 'DRESSEUR_ARENE_E_JUMELLES',
          equipe: [{ espece: 'Mimigal', niveau: 10 }, { espece: 'Coxy', niveau: 10 }] } },
      { id: 'mimi', x: 2, y: 7, sprite: 'jumelle', dir: BAS, script: 'Mimi' },
    ],
    scripts: `
script InitRails
  rails_depart
  fin
${RAILS_ECORCIA.stations.map((_, s) => `script Station${s}\n  chariot ${s}\n  liberer\n  fin`).join('\n')}
script Levier0
  message "Un levier ! On l'abaisse ?"
  oui_non
  si resultat = 0 aller Levier_Non
  aiguillage 0
  message "Clac ! Les toiles ont changé de direction."
Levier_Non:
  liberer
  fin
script Levier1
  message "Un levier ! On l'abaisse ?"
  oui_non
  si resultat = 0 aller Levier_Non
  aiguillage 1
  message "Clac ! Les toiles ont changé de direction."
  liberer
  fin

script Hector
  regarder_joueur
  si drapeau BADGE_ESSAIM aller Hector_Apres
  message "HECTOR : Je suis HECTOR ! Je ne perds jamais\\nquand il s'agit de POKéMON insectes."
  message "Mes recherches feront de moi le grand spécialiste\\ndes insectes ! Laisse-moi te montrer ce que j'ai appris."
  combat_dresseur hector
  message "HECTOR : Ouah, incroyable ! Tu es un expert !\\nMes recherches ne sont pas finies. D'accord, tu as gagné."
  message "{JOUEUR} reçoit le BADGE ESSAIM de HECTOR !"
  son fanfare
  drapeau BADGE_ESSAIM
  drapeau DRESSEUR_ARENE_E_AL
  drapeau DRESSEUR_ARENE_E_BENNY
  drapeau DRESSEUR_ARENE_E_JOSH
  drapeau DRESSEUR_ARENE_E_JUMELLES
  var RIVAL_ECORCIA 1
  message "HECTOR : Avec le BADGE ESSAIM, les POKéMON jusqu'au\\nniveau 30 t'obéiront, même ceux qu'on t'a échangés."
  message "Et tes POKéMON pourront utiliser COUPE hors des combats.\\nTiens, je veux aussi te donner ceci."
  donner_objet tm89
  drapeau CS_COUPE
  message "HECTOR : La CT89, c'est DEMI-TOUR. Ton POKéMON attaque,\\npuis laisse sa place au suivant. Génial, non ?"
  liberer
  fin
Hector_Apres:
  message "HECTOR : Les POKéMON insectes sont fascinants.\\nIl reste tant de mystères à percer !"
  liberer
  fin

script Al_Defi
  message "Les POKéMON insectes sont cool et costauds !\\nJe vais te le prouver !"
  combat_dresseur
  message "Tu m'as prouvé que tu avais raison…"
  liberer
  fin
script Al_Apres
  regarder_joueur
  message "Les POKéMON insectes évoluent vite.\\nC'est leur point fort !"
  liberer
  fin
script Benny_Defi
  message "Les POKéMON insectes deviennent forts en évoluant.\\nRegarde bien !"
  combat_dresseur
  message "Avoir évolué ne suffit pas, alors…"
  liberer
  fin
script Benny_Apres
  regarder_joueur
  message "Les leviers ? Ils changent la route des chariots.\\nRegarde bien les toiles !"
  liberer
  fin
script Josh_Defi
  message "Tu as admiré la belle toile de l'arène ?\\nC'est mon PARAS qui va s'occuper de toi !"
  combat_dresseur
  message "Ma toile s'est déchirée…"
  liberer
  fin
script Josh_Apres
  regarder_joueur
  message "Chaque chariot a son propre chemin."
  liberer
  fin
script Jumelles_Defi
  message "AMY : Mimi et moi, on se bat ensemble !\\nMIMI : Ensemble !"
  combat_dresseur
  message "AMY & MIMI : Ooooh… On a perdu toutes les deux."
  liberer
  fin
script Jumelles_Apres
  regarder_joueur
  message "AMY : HECTOR est tout près. Prends le chariot du milieu !"
  liberer
  fin
script Mimi
  regarder_joueur
  message "MIMI : On fait tout ensemble, ma sœur et moi !"
  liberer
  fin
`,
  },
};

export const BLOCS_ECORCIA = {
  ...BLOCS_CAVES, ...BLOCS_PUITS, ...BLOCS_PUITS_B1F, ...BLOCS_ARENE,
  maison_fargas: MAISON_FARGAS, charbonnerie: CHARBONNERIE, hall_ecorcia: HALL,
};

const un = (b, z) => ({ largeur: 1, hauteur: 1, blocs: [b], zones: [z] });
export const MONDES_ECORCIA = {
  caves_1f: { largeur: 1, hauteur: 3, blocs: ['caves_0_0', 'caves_0_1', 'caves_0_2'], zones: ['CAVES_1F', 'CAVES_1F', 'CAVES_1F'] },
  puits: un('puits_0_0', 'PUITS'),
  puits_b1f: { largeur: 2, hauteur: 1, blocs: ['puits_b1f_0_0', 'puits_b1f_1_0'], zones: ['PUITS_B1F', 'PUITS_B1F'] },
  arene_ecorcia: { largeur: 1, hauteur: 2, blocs: ['arene_e_0_0', 'arene_e_0_1'], zones: ['ARENE_ECORCIA', 'ARENE_ECORCIA'] },
  hall_ecorcia: un('hall_ecorcia', 'ARENE_ECORCIA_HALL'),
  maison_fargas: un('maison_fargas', 'MAISON_FARGAS'), charbonnerie: un('charbonnerie', 'CHARBONNERIE'),
  centre_r32: un('centre', 'CENTRE_R32'), centre_r32_b1f: un('centre_b1f', 'CENTRE_R32_B1F'),
  centre_ecorcia: un('centre', 'CENTRE_ECORCIA'), centre_ecorcia_b1f: un('centre_b1f', 'CENTRE_ECORCIA_B1F'),
  boutique_ecorcia: un('boutique', 'BOUTIQUE_ECORCIA'),
  poste_ruines: un('poste_eo', 'POSTE_RUINES'), poste_bois: un('poste_eo', 'POSTE_BOIS'),
};
