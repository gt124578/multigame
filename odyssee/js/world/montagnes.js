// odyssee/js/world/montagnes.js — montagnes à gravir (sans DOM), façon Mont Argenté / route 45 de HeartGold : un sentier en
// lacets sur plusieurs paliers, des marches taillées dans la roche, des corniches, un ravin qu'on franchit sur des
// passerelles de bois, un belvédère au sommet. Le plan de chaque montagne est dessiné case par case (montagne() de
// relief.js) ; les gradins de roche sont rendus comme les parois des grottes (bords en pente).
import { montagne } from './relief.js';

/**
 * Le Mont Lunaire (au-dessus de la Grotte Lunaire, route 3) : on y monte depuis le plateau de la route 3 ouest, juste
 * au-dessus de l'entrée de la grotte ; cinq paliers, deux passerelles au-dessus du même ravin, le sommet regarde la mer.
 * Le sentier ne redescend pas de l'autre côté : la grotte reste le seul passage vers la route 3 est.
 */
export function montLunaire({ W, trainerNpc }) {
  // x 145 → 179, y 20 → 35 ; chiffres : roche, lettres : sentier (a = hauteur 1), majuscules : herbe rase, = marches,
  // v : ravin, # : passerelle
  const plan = [
    '66666666666555555555555555566666666',   // y 20 : le rebord du belvédère, la mer derrière
    '6655555555eeeEEEEEEEEEEEEe566655556',   // y 21 : le sommet (herbe rase)
    '5555555555eeeeeeeeeeeeeeeeee5555555',   // y 22
    '55555555555555555==5555555ee5555555',   // y 23 : marches vers le sommet
    '55444dddd55dddddddddd44444555544445',   // y 24 : 4e palier, corniche
    '44444dddddddddddddddd44444444444444',   // y 25
    '44444==4444444444444vvv444444444444',   // y 26 : marches ; le ravin s'ouvre
    '44333ccccccccccccccc###ccc4444cccc4',   // y 27 : 3e palier, passerelle du haut
    '33333ccccc333ccccccc###ccccccccccc3',   // y 28
    '33333333333333333333vvv333c3333==33',   // y 29 : le vide entre les deux passerelles ; marches
    '332222222222bbbbbbbb###bbb3333bbb23',   // y 30 : 2e palier, passerelle du bas
    '222222222222bbb222bb###bbbbbbbbbb22',   // y 31
    '222222222222==222222vvv222bbbb22222',   // y 32 : marches
    '22aaaaaaaaaaaa222222vvv222222222222',   // y 33 : 1er palier ; le fond du ravin
    '22aaaaaaaaaaaa222222222222222222222',   // y 34
    '222aa222222222222222222222222222222',   // y 35 : l'entrée, au-dessus de la Grotte Lunaire
    '222aa222222222222222222222222222222',   // y 36
    '   aa',                                  // y 37 : le chemin qui descend vers la route 3
  ];
  montagne(W, 145, 20, plan);
  W.zone(145, 20, 179, 36, { name: 'Mont Lunaire', music: 'route', prio: 1 });
  W.sign(162, 21, 'SOMMET DU MONT LUNAIRE\nPar temps clair, on voit la mer jusqu\'au bout du monde.\nNe vous penchez pas au-dessus du ravin !');
  // dresseurs le long du sentier (identifiants fixes : ils ne décalent pas ceux des autres dresseurs)
  trainerNpc(W, 170, 30, 'left', 'Montagnard', 'Firmin', [[74, 12], [95, 13]], { id: 'lunaire:firmin', sight: 4, intro: 'Ho ! Tu as traversé la passerelle sans regarder en bas ? Moi, j\'ai encore les jambes qui tremblent !', lose: 'Le vertige, ça se soigne en grimpant encore.' });
  trainerNpc(W, 160, 28, 'right', 'Randonneuse', 'Ondine', [[35, 13], [41, 12], [27, 13]], { id: 'lunaire:ondine', sight: 4, intro: 'On dit que la nuit, des Mélofée dansent au sommet. Je monte voir !', lose: 'Bon, je redescends... par l\'escalier.' });
  trainerNpc(W, 158, 25, 'left', 'Montagnard', 'Bastien', [[66, 13], [74, 13], [95, 14]], { id: 'lunaire:bastien', sight: 4, intro: 'La dernière corniche ! Si tu passes, le sommet est à toi.', lose: 'Va voir la mer de là-haut. Ça vaut toutes les montées.' });
  // objets : un au bout du premier palier, un au coin du troisième, la Pierre Lune au sommet
  W.item(147, 33, 'escape-rope', 1, 'lunaire:corde');
  W.item(178, 28, 'ether', 1, 'lunaire:ether');
  W.item(170, 21, 'moon-stone', 1, 'lunaire:pierre-lune');
  W.npc({ id: 'lunaire:guetteur', x: 157, y: 21, sprite: 'montagnard', dir: 'up', text: ['D\'ici, on voit les tourbillons du large et, par beau temps, les îles des trois frères.', 'On raconte qu\'une pierre tombée du ciel dort quelque part sur ce sommet.'] });
}
