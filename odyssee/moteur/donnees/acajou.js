// odyssee/moteur/donnees/acajou.js — Acajou (Mahogany Town), aux positions réelles de HeartGold / SoulSilver :
// un bloc de la matrice de Johto (x 512 à 543, z 160 à 191). Portes de l'arène, du Centre POKéMON, de la boutique de
// souvenirs et de la maison de l'est, panneaux et habitants relevés dans les événements de la zone T28 de la
// décompilation ; bâtiments = vrais modèles (ch_gym, ch_h01, pc, poste de la Route 43), posés par leur porte.
// Les routes 42, 43 et 44 ne sont pas encore construites : leurs sorties sont fermées par la forêt.

import { Peintre, MODELES } from './peintre.js';
import { LEGENDE_DEHORS } from './johto-dehors.js';
import { BAS, GAUCHE } from '../engine/const.js';

export const AX = 512, AY = 160;
const A = (x, y) => ({ x: x - AX, y: y - AY });

// les modèles d'Acajou ont les mesures de ceux de Mauville (même géométrie) : relevées sur les modèles
MODELES.ch_gym = { x: [-3.6, 3.76], z: [-2.5, 2.5], porte: 0, facade: 1.37 };
MODELES.ch_h01 = { x: [-2.13, 2.5], z: [-1.75, 2], porte: -0.5, facade: 1.2 };

const P = new Peintre(AX, AY, 1, 1, 'T');
P.rect('.', 514, 167, 541, 189);
P.rect('=', 514, 176, 541, 177);            // la grand-rue, d'ouest en est
P.rect('=', 524, 166, 525, 179);            // vers le poste de la Route 43, au nord
P.rect('=', 523, 178, 535, 179);            // devant l'arène et le Centre
P.rect('F', 515, 186, 518, 188);
P.rect('F', 538, 186, 541, 188);
P.rect('T', 514, 167, 521, 169);
P.rect('T', 528, 167, 541, 169);
P.rect('T', 514, 189, 541, 189);
P.emprise('gate_a', 522, 160, 527, 165, { dz: 0.3, modele: 'poste' });   // poste de la Route 43 (fermé pour l'instant)
P.batiment('ch_gym', 523, 183, { modele: 'arene' });
P.batiment('pc', 534, 183, { modele: 'centre' });
P.batiment('ch_h01', 528, 174);             // boutique de souvenirs
P.batiment('ch_h01', 537, 174);             // maison de l'est
for (const [x, y] of [[516, 172], [526, 174], [520, 184]]) P.point('p', x, y);

export const BLOCS_ACAJOU = P.blocs('acajou', LEGENDE_DEHORS);
export const MONDE_ACAJOU = { largeur: 1, hauteur: 1, blocs: ['acajou_0_0'], zones: ['ACAJOU'] };

export const ZONE_ACAJOU = {
  nom: 'Acajou', musique: 'griotte', camera: 'dehors',
  warps: [
    { ...A(523, 183), vers: 'ARENE_ACAJOU_1', n: 0 },
    { ...A(534, 183), vers: 'CENTRE_ACAJOU', n: 0 },
    { ...A(528, 174), vers: 'BOUTIQUE_ACAJOU', n: 0 },
    { ...A(537, 174), vers: 'MAISON_ACAJOU', n: 0 },
  ],
  panneaux: [
    { ...A(516, 172), script: 'PanneauAcajou' },
    { ...A(526, 174), script: 'PanneauSouvenirs' },
    { ...A(520, 184), script: 'PanneauArene' },
  ],
  objets: [
    { id: 'vieil_homme', ...A(523, 175), sprite: 'vieil_homme', dir: BAS, mouvement: 'regard_alea', script: 'VieilAcajou' },
    { id: 'fillette', ...A(530, 175), sprite: 'fillette', dir: BAS, mouvement: 'errance', rayon: 1, script: 'FilletteAcajou' },
    { id: 'monsieur', ...A(540, 175), sprite: 'habitant', dir: GAUCHE, script: 'MonsieurAcajou' },
  ],
  scripts: `
script PanneauAcajou
  message "ACAJOU\\nBienvenue au pays des ninjas !"
  fin
script PanneauSouvenirs
  message "BOUTIQUE DE SOUVENIRS D'ACAJOU"
  fin
script PanneauArene
  message "ARÈNE POKéMON D'ACAJOU\\nCHAMPION : FRIGO\\nLe Champion à la sagesse de l'hiver"
  fin
script VieilAcajou
  regarder_joueur
  message "Le LAC COLÈRE est au nord, par la ROUTE 43.\\nOn dit qu'un LÉVIATOR rouge y a été vu…"
  liberer
  fin
script FilletteAcajou
  regarder_joueur
  message "FRIGO est le plus vieux Champion de JOHTO.\\nIl adore les POKéMON Glace !"
  liberer
  fin
script MonsieurAcajou
  regarder_joueur
  message "La ROUTE 44 mène à la ROUTE DE GLACE.\\nElle n'est pas encore ouverte."
  liberer
  fin
`,
};
