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
import { DEMO } from './demo.js';
import {
  MAISON_1F, MAISON_2F, LABO, MAISON, CENTRE, CENTRE_B1F, BOUTIQUE, ACAJOU_1, ACAJOU_2, ACAJOU_3,
  ZONES_INTERIEURS, ZONES_ACAJOU, maisonHGSS, centreHGSS, boutiqueHGSS,
} from './interieurs.js';
import { BLOCS_DEHORS, MONDE_JOHTO, ZONES_DEHORS } from './johto-dehors.js';

// ——— outils ———
/** une pièce au centre d'un bloc vide */
function piece(lignes, ox, oy) {
  const plan = [];
  for (let y = 0; y < 32; y++) { const l = lignes[y - oy]; plan.push(l === undefined ? '' : ' '.repeat(ox) + l); }
  return plan;
}
/** coordonnées d'une case d'une pièce */
const pc = (ox, oy) => (x, y) => ({ x: x + ox, y: y + oy });

// ——— intérieurs ———
// Centre POKéMON, boutique et maisons : intérieurs de HGSS aux coordonnées du jeu (interieurs.js)

const POSTE = bloc({ plan: piece([
  'WWWWWWWWWW',
  'W;;;;;;;;W',
  'W;;;;;;;;W',
  'W;;;;;;;;W',
  'W;;;;m;;;W',
  'WWWWWWWWWW',
], 11, 10) });
const Po = pc(11, 10);

// poste de garde traversé d'ouest en est : un tapis de chaque côté
const POSTE_EO = bloc({ plan: piece([
  'WWWWWWWWWWWW',
  'W;;;;;;;;;;W',
  'W;;;;;;;;;;W',
  '[;;;;;;;;;;]',
  'W;;;;;;;;;;W',
  'WWWWWWWWWWWW',
], 10, 10), legende: { '[': { sol: 'tapis', mb: 15 }, ']': { sol: 'tapis', mb: 16 } } });
const PE = pc(10, 10);

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

const maison = maisonHGSS;
const boutique = boutiqueHGSS;

const ZONES = {
  // — Bourg Geon et ses maisons : ceux de la démo —
  BOURG_GEON: { ...DEMO.zones.BOURG_GEON, scripts: DEMO.zones.BOURG_GEON.scripts + `
script PanneauLabo
  message "LABO POKéMON DU PR ORME"
  fin
script BoiteJoueur
  message "Maison de {JOUEUR}"
  fin
script BoiteRival
  message "Maison de la famille de PAULIN"
  fin
script Costaud
  regarder_joueur
  message "On sent le vent de la mer, ici. C'est revigorant !"
  liberer
  fin
` },
  MAISON_RIVAL: maison('Bourg Geon', 'BOURG_GEON', 3, { sprite: 'dame', script: 'MereRival' }, `
script MereRival
  regarder_joueur
  message "Mon fils PAULIN est parti à l'aventure avant toi.\\nIl ne tient pas en place !"
  liberer
  fin
`),
  MAISON_1F: ZONES_INTERIEURS.MAISON_1F,
  MAISON_2F: ZONES_INTERIEURS.MAISON_2F,
  LABO_ORME: ZONES_INTERIEURS.LABO_ORME,
  MAISON_VOISIN: { ...DEMO.zones.MAISON_VOISIN, warps: [{ x: 4, y: 8, vers: 'BOURG_GEON', n: 2 }],
    objets: [{ ...DEMO.zones.MAISON_VOISIN.objets[0], x: 5, y: 5 }] },

  ROUTE_29: {
    nom: 'Route 29', musique: 'route29', camera: 'dehors',
    rencontres: {
      herbe: { taux: 25, especes: [
        { espece: 'Fouinette', poids: 35, niveaux: [2, 4] }, { espece: 'Roucool', poids: 35, niveaux: [2, 4] },
        { espece: 'Rattata', poids: 20, niveaux: [2, 3] }, { espece: 'Hoothoot', poids: 10, niveaux: [2, 3] },
      ] },
    },
    scripts: `
script PanneauR29Est
  message "ROUTE 29\\n→ BOURG GEON"
  fin
script GaminR29
  regarder_joueur
  message "Les rebords, on les saute vers le bas.\\nPour remonter, il faut faire le tour !"
  liberer
  fin
script CostaudR29
  regarder_joueur
  message "Ce poste mène à la ROUTE 46. Elle est fermée pour l'instant."
  liberer
  fin
script MonsieurR29
  regarder_joueur
  message "Tu veux attraper des POKéMON ? Marche dans les hautes herbes !"
  liberer
  fin
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
  POSTE_31: {
    nom: 'Route 31', annonce: false, musique: 'route30', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...PE(0, 3), vers: 'MAUVILLE', n: 7 }, { ...PE(11, 3), vers: 'ROUTE_31', n: 1 }],
    objets: [{ id: 'garde', ...PE(5, 1), sprite: 'garde', dir: BAS, script: 'GardePoste31' }],
    scripts: `
script GardePoste31
  regarder_joueur
  message "À l'ouest, MAUVILLE. À l'est, la ROUTE 31."
  liberer
  fin
`,
  },
  POSTE_36: {
    nom: 'Mauville', annonce: false, musique: 'mauville', camera: 'interieur', interieur: true, velo: false,
    warps: [{ ...PE(11, 3), vers: 'MAUVILLE', n: 9 }],
    objets: [{ id: 'garde', ...PE(2, 3), sprite: 'garde', dir: DROITE, script: 'GardePoste36' }],
    scripts: `
script GardePoste36
  regarder_joueur
  message "Un arbre étrange bloque la ROUTE 36. On ne passe pas !"
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
script PanneauGuide
  message "Maison du GUIDE"
  fin
script PassanteGriotte
  regarder_joueur
  message "Le CENTRE POKéMON soigne tes POKéMON gratuitement !"
  liberer
  fin
`,
  },
  ...centreHGSS('CENTRE_GRIOTTE', 'Ville Griotte', 'VILLE_GRIOTTE', 0),
  BOUTIQUE_GRIOTTE: boutique('Ville Griotte', 'VILLE_GRIOTTE', 1, 'potion antidote paralyze-heal poke-ball'),
  MAISON_GRIOTTE: maison('Ville Griotte', 'VILLE_GRIOTTE', 2, { sprite: 'dame', script: 'Dame' }, `
script Dame
  regarder_joueur
  message "Mon mari est parti pêcher. Il rentre toujours bredouille !"
  liberer
  fin
`),
  MAISON_GRIOTTE_SE: maison('Ville Griotte', 'VILLE_GRIOTTE', 4, { sprite: 'marin', script: 'MarinGriotte' }, `
script MarinGriotte
  regarder_joueur
  message "Les bateaux ne passent plus par ici depuis longtemps."
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
script PanneauR30Conseil
  message "CONSEIL DU DRESSEUR\\nRegarde bien qui te regarde : un dresseur te défie dès qu'il te voit."
  fin
script MonsieurR30
  regarder_joueur
  message "M. POKéMON habite au bout de la route. Un drôle de type !"
  liberer
  fin
script FilleR30
  regarder_joueur
  message "J'aime regarder les combats des autres dresseurs."
  liberer
  fin
script GaminR30
  regarder_joueur
  message "Les arbres à baies donnent des fruits différents."
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
script PanneauAntre
  message "ANTRE NOIR"
  fin
script CostaudR31
  regarder_joueur
  message "Tu vas à MAUVILLE ? Passe par le poste à l'ouest."
  liberer
  fin
script GaminR31
  regarder_joueur
  message "Mon CHÉTIFLOR se balance tout le temps !"
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
script PanneauEcole
  message "ÉCOLE DES DRESSEURS"
  fin
script PanneauMauville
  message "MAUVILLE\\nLa ville au parfum de nostalgie."
  fin
script PanneauArene
  message "ARÈNE POKéMON DE MAUVILLE\\nChampion : ALBERT"
  fin
script PanneauTour
  message "TOUR CHÉTIFLOR\\nOn y forme les POKéMON."
  fin
script MonsieurMauville
  regarder_joueur
  message "Le pilier de la TOUR CHÉTIFLOR bouge tout seul, dit-on."
  liberer
  fin
script CostaudMauville
  regarder_joueur
  message "J'ai perdu contre ALBERT. Ses oiseaux sont trop rapides !"
  liberer
  fin
script Jongleur
  regarder_joueur
  message "Je m'entraîne à jongler avec des POKé BALLS. Hop !"
  liberer
  fin
`,
  },
  ...centreHGSS('CENTRE_MAUVILLE', 'Mauville', 'MAUVILLE', 1, {
    // l'Arène d'Acajou est construite seule pour l'instant : un voyageur y emmène
    objets: [{ id: 'voyageur', x: 3, y: 9, sprite: 'montagnard', dir: BAS, script: 'VersAcajou' }],
    scripts: `
script VersAcajou
  regarder_joueur
  message "Je viens d'ACAJOU, au pied du LAC COLÈRE.\\nSon ARÈNE est en glace : on y glisse partout !"
  message "Veux-tu que je t'y emmène ?"
  oui_non
  si resultat = 0 aller VersAcajou_Non
  message "Accroche-toi !"
  fondu_noir
  teleporter ARENE_ACAJOU_1 0
  liberer
  fin
VersAcajou_Non:
  message "Quand tu veux !"
  liberer
  fin
`,
  }),
  ...ZONES_ACAJOU,
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

for (const [id, z] of Object.entries(ZONES_DEHORS)) ZONES[id] = { ...ZONES[id], ...z };

const interieur = (bloc, zone) => mondeSimple(bloc, zone);

export const JOHTO = {
  sols: SOLS,
  blocs: {
    ...BLOCS_DEHORS,
    maison_1f: MAISON_1F, maison_2f: MAISON_2F, labo: LABO, voisin: MAISON, centre: CENTRE, centre_b1f: CENTRE_B1F, boutique: BOUTIQUE,
    poste: POSTE, poste_eo: POSTE_EO, acajou_1: ACAJOU_1, acajou_2: ACAJOU_2, acajou_3: ACAJOU_3,
    tour_1: TOUR_1, tour_2: TOUR_2, tour_3: TOUR_3, arene: ARENE, ecole: ECOLE, antre: ANTRE,
  },
  mondes: {
    johto: MONDE_JOHTO,
    maison_1f: interieur('maison_1f', 'MAISON_1F'), maison_2f: interieur('maison_2f', 'MAISON_2F'),
    labo: interieur('labo', 'LABO_ORME'), voisin: interieur('voisin', 'MAISON_VOISIN'), maison_rival: interieur('voisin', 'MAISON_RIVAL'),
    poste_46: interieur('poste', 'POSTE_46'), poste_31: interieur('poste_eo', 'POSTE_31'), poste_36: interieur('poste_eo', 'POSTE_36'),
    centre_griotte: interieur('centre', 'CENTRE_GRIOTTE'), centre_griotte_b1f: interieur('centre_b1f', 'CENTRE_GRIOTTE_B1F'), boutique_griotte: interieur('boutique', 'BOUTIQUE_GRIOTTE'),
    maison_griotte: interieur('voisin', 'MAISON_GRIOTTE'), maison_guide: interieur('voisin', 'MAISON_GUIDE'), maison_griotte_se: interieur('voisin', 'MAISON_GRIOTTE_SE'),
    maison_baies: interieur('voisin', 'MAISON_BAIES'), m_pokemon: interieur('voisin', 'M_POKEMON'),
    antre_noir: interieur('antre', 'ANTRE_NOIR'),
    centre_mauville: interieur('centre', 'CENTRE_MAUVILLE'), centre_mauville_b1f: interieur('centre_b1f', 'CENTRE_MAUVILLE_B1F'), boutique_mauville: interieur('boutique', 'BOUTIQUE_MAUVILLE'),
    maison_mauville_1: interieur('voisin', 'MAISON_MAUVILLE_1'), maison_mauville_2: interieur('voisin', 'MAISON_MAUVILLE_2'),
    tour_1f: interieur('tour_1', 'TOUR_1F'), tour_2f: interieur('tour_2', 'TOUR_2F'), tour_3f: interieur('tour_3', 'TOUR_3F'),
    arene_mauville: interieur('arene', 'ARENE_MAUVILLE'), ecole: interieur('ecole', 'ECOLE'),
    acajou_1: interieur('acajou_1', 'ARENE_ACAJOU_1'), acajou_2: interieur('acajou_2', 'ARENE_ACAJOU_2'), acajou_3: interieur('acajou_3', 'ARENE_ACAJOU_3'),
  },
  zones: ZONES,
};
export const DEPART = { zone: 'MAISON_2F', x: 5, y: 7, dir: BAS };
