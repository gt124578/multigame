// odyssee/js/world/montagnes.js — montagnes à gravir (sans DOM), façon Mont Argenté / route 45 de HeartGold : un sentier en
// lacets sur plusieurs paliers, des marches taillées dans la roche, des corniches, des ravins qu'on franchit sur des
// passerelles de bois, un belvédère au sommet. Le plan de chaque montagne est dessiné case par case (montagne() de
// relief.js : lettres minuscules = sentier et sa hauteur, '+' = roche, '=' marches, 'v' ravin, '#' passerelle) ; les gradins
// de roche sont rendus comme les parois des grottes (bords en pente, world3d.js).
// Les dresseurs et les objets ont des identifiants fixes (ils ne décalent pas ceux des autres dresseurs de la région).
// Chaque montagne est notée dans W.montagnes (pied, sommet, passerelles), que les tests parcourent.
import { T } from './tiles.js';
import { montagne } from './relief.js';

/**
 * Le Mont Lunaire (au-dessus de la Grotte Lunaire, route 3) : on y monte depuis le plateau de la route 3 ouest, juste
 * au-dessus de l'entrée de la grotte. Des marches mènent au premier palier ; paliers à 3, 5, 7, 9 et le sommet à 11 : on longe la falaise vers l'est, on passe le ravin sur la
 * passerelle du bas, on remonte au bout, on revient vers l'ouest par une corniche et la passerelle du haut, puis la
 * corniche du bord de mer mène au sommet, qui regarde la mer. Le sentier ne redescend pas de l'autre côté : la grotte reste
 * le seul passage vers la route 3 est.
 */
export function montLunaire({ W, trainerNpc }) {
  const plan = [
    '   +++++++iiiii++++++++++++++JJJJJJJJJJ',   // y 20 : la corniche et le sommet, au bord de la mer
    '  +++++iiiiiiiiiiiiiiiiiiiii=kkkkkkkkk+',   // y 21
    '  ++++++=+++++++++iii+vv+++++kkkkkkkkk ',   // y 22
    ' +++++++=+++gggg+++++vvvv+++++++++++++ ',   // y 23
    ' ++++++gggggggggggggg####gggggggggggg+ ',   // y 24 : la passerelle du haut, la corniche au-dessus du ravin
    '+++++++gggggggggg++++vvvv++++++++gggg+ ',   // y 25
    '++++++++++++++++++++vvvvv++++++++++=++ ',   // y 26
    ' ++++++++++++eeeee++vvvvvvee+++++++=+  ',   // y 27
    ' ++++++++++eeeeeeeeee####eeeeeeeeeee+  ',   // y 28 : la passerelle du bas
    ' ++++++++eeeeeeeee++evvvveeeeeeeeeee+  ',   // y 29
    '  ++++++++++++=+++++++vvv++++eeee++++  ',   // y 30
    '  +++++cccc+++=+++++++vv++++++++++++   ',   // y 31
    '  +ccccccccccccc+++++++++++++++++++    ',   // y 32 : le premier palier
    '   ccccccccccc+++++++++++++++++++++    ',   // y 33
    '   ++==+++++++++++++++++++++++++++     ',   // y 34
    '   ++aa++++++++++++++++++++++++++      ',   // y 35
    '     aa  ++++++++++++++++++++++++      ',   // y 36 : l'entrée, au-dessus de la Grotte Lunaire
    '     aa   ++++++++++++++++++++++       ',   // y 37
  ];
  montagne(W, 143, 20, plan, { herbe: [[172, 21, 180, 22]] });
  W.zone(143, 19, 181, 37, { name: 'Mont Lunaire', music: 'route', prio: 1 });
  W.sign(150, 36, 'MONT LUNAIRE\nSentier du sommet. Gare au ravin : on passe sur les passerelles !');
  // dresseurs le long du sentier : chacun se tient dans un renfoncement, jamais en travers du passage
  trainerNpc(W, 159, 27, 'down', 'Randonneuse', 'Ondine', [[35, 13], [41, 12], [27, 13]], { id: 'lunaire:ondine', sight: 3, intro: 'On dit que la nuit, des Mélofée dansent au sommet. Je monte voir !', lose: 'Bon, je redescends... par les marches.' });
  trainerNpc(W, 172, 30, 'up', 'Montagnard', 'Firmin', [[74, 12], [95, 13]], { id: 'lunaire:firmin', sight: 3, intro: 'Ho ! Tu as traversé la passerelle sans regarder en bas ? Moi, j\'ai encore les jambes qui tremblent !', lose: 'Le vertige, ça se soigne en grimpant encore.' });
  trainerNpc(W, 156, 23, 'down', 'Montagnard', 'Bastien', [[66, 13], [74, 13], [95, 14]], { id: 'lunaire:bastien', sight: 3, intro: 'La corniche du haut longe la mer. Si tu passes, le sommet est à toi.', lose: 'Va voir la mer de là-haut. Ça vaut toutes les montées.' });
  trainerNpc(W, 155, 20, 'down', 'Randonneuse', 'Nadège', [[35, 14], [39, 14]], { id: 'lunaire:nadege', sight: 2, intro: 'Chut ! Le vent souffle fort ici... Un combat pour se réchauffer ?', lose: 'Brr. Le sommet est tout près, à l\'est.' });
  // objets : un au bout du premier palier, un dans le renfoncement du palier 3, un au bout de la corniche, la Pierre Lune au sommet
  W.item(146, 32, 'escape-rope', 1, 'lunaire:corde');
  W.item(175, 30, 'ether', 1, 'lunaire:ether');
  W.item(179, 25, 'elixir', 1, 'lunaire:elixir');
  W.item(180, 22, 'moon-stone', 1, 'lunaire:pierre-lune');
  // le belvédère : une longue-vue tournée vers la mer, un banc, le guetteur
  W.sign(176, 21, 'Une longue-vue, tournée vers le large.\nOn voit la mer jusqu\'à l\'horizon, et tout au nord-est, la neige d\'une île.', 'telescope');
  W.prop('banc', 173, 21);
  W.npc({ id: 'lunaire:guetteur', x: 178, y: 21, sprite: 'montagnard', dir: 'up', text: ['D\'ici, on voit toute la mer du Nord. Par beau temps, la neige de l\'Île Givrée brille au loin.', 'On raconte qu\'une pierre tombée du ciel dort sur ce sommet. Regarde bien autour de toi !'] });
  (W.montagnes ||= []).push({ nom: 'Mont Lunaire', sommet: [176, 22], pied: [148, 37], passerelles: [[164, 28, 167, 28], [164, 24, 167, 24]] });
}

/**
 * Le Mont Givré (Île Givrée, au nord du Rivage Gelé) : la montagne enneigée de l'île, façon Mont Argenté. On y monte depuis
 * le Rivage Gelé par une volée de marches ; paliers à 2, 4, 6 et 8 (de l'est à l'ouest et retour), une fente du nord au
 * sud qu'on passe sur une passerelle, puis une corniche au bord du ravin et une passerelle nord-sud au-dessus du gouffre
 * mènent au plateau du sommet ; le belvédère (10) regarde la mer de l'Est. Montagne en cul-de-sac : elle n'ouvre aucun
 * autre passage (la Cime Givrée se gagne toujours par la Pente Givrée).
 */
export function montGivre({ W, trainerNpc, ENC }) {
  const plan = [
    '            ++++++++++++++++++++++++++++++++++++jjjjjjj++',   // y 22 : le belvédère du sommet (à l'est), la mer derrière
    '      ++++++++++++hhhhhhhhhhhhhhhhhhhhhhhhhhhhh=jjjjjjj++',   // y 23 : le plateau du sommet
    '  ++++++++++++hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh=jjjjjjj++',   // y 24
    ' ++++++++++++++++++++vvvvvvvvvvv#vvvvvvvvvvv++++jjjjjjj++',   // y 25 : le ravin tourne vers l'est ; passerelle nord-sud
    '++++++++++++++++++++vvvvvvvvvvvv#vvvvvvvvvvvv++++++++++++',   // y 26
    '+++++++++++++++++++++vvvvvvvvvvv#vvvvvvvvvv++++++++++++++',   // y 27
    '+++++++++++++++++++++vvvvhhhhhhhhhhhhhhhhhhhhhhhh++++++++',   // y 28 : palier 4, corniche au bord du ravin
    '+++++++++++++++++++++vvvv++++++++++++++++hhhhhhhh++++++++',   // y 29
    '++++++++++++++++++++++vvv++++++++++++++++++++++==++++++++',   // y 30 : marches
    '++++++++ffff+++++++++vvvv+++++++++fffff++++++++==++++++++',   // y 31
    '++++++fffffffffffffff####ffffffffffffffffffffffff++++++++',   // y 32 : palier 3 et la passerelle sur la fente
    '++++++fffffffffffffffvvvvvfffffffffffffffffffffff++++++++',   // y 33
    '+++++++=++++++++++++++vvv++++++++++++++++++++++++++++++++',   // y 34 : marches
    '++++++d=d+++++++++ddddd+++++++++++++++++++++++++++++++++ ',   // y 35
    '++++++ddddddddddddddddddddddddd++++++++++++++++++++++++  ',   // y 36 : palier 2 (herbes enneigées)
    ' +++++ddddddddddddddddddddddddd+++++++++++++++++++++++   ',   // y 37
    ' ++++++++++++++++++++++++++++==+++++++++++++++++++++     ',   // y 38 : marches
    '  +++++++++++bbbb++++++++++++==+++++++++++++++++++       ',   // y 39
    '  ++bbbbbbbbbbbbbbbbbbbbbbbbbbb+++++++++++++++           ',   // y 40 : palier 1
    '   +bbbbbbbbbbbbbbbbbbbbbbbbbbb++++++++++                ',   // y 41
    ' +++++++==+++++++++                                      ',   // y 42 : l'entrée, depuis le Rivage Gelé
  ];
  montagne(W, 380, 22, plan, { sentier: T.SNOW, herbeT: T.SNOW });
  // hautes herbes enneigées sur les paliers larges (rencontres de l'île)
  for (const [x0, y0, x1, y1] of [[391, 36, 396, 37], [406, 32, 411, 33], [413, 23, 418, 24]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (W.get(x, y) === T.SNOW) W.set(x, y, T.TALL);
  W.zone(380, 21, 436, 41, { name: 'Mont Givré', music: 'snow', theme: 'snow', roche: 'mer', enc: ENC.givre, prio: 1 });
  W.sign(390, 43, 'MONT GIVRÉ\nSentier du belvédère. Passerelles glissantes : tenez la corde !');
  trainerNpc(W, 394, 39, 'down', 'Randonneuse', 'Solène', [[220, 38], [225, 39]], { id: 'givre:solene', sight: 2, intro: 'Le Mont Givré ! Il paraît que du belvédère, on voit jusqu\'aux îles du Sud.', lose: 'Je vais finir la montée tout doucement...' });
  trainerNpc(W, 400, 35, 'down', 'Montagnard', 'Armand', [[75, 39], [361, 39], [95, 40]], { id: 'givre:armand', sight: 2, intro: 'Ici, la roche est gelée jusqu\'au cœur. Mes Pokémon aussi sont durs comme la pierre !', lose: 'Fondu... comme neige au soleil.' });
  trainerNpc(W, 416, 31, 'down', 'Montagnard', 'Hugues', [[221, 40], [208, 41]], { id: 'givre:hugues', sight: 2, intro: 'Tu as passé la passerelle ? Moi, j\'ai fermé les yeux !', lose: 'La corniche du haut est encore plus étroite. Courage !' });
  trainerNpc(W, 423, 29, 'up', 'Randonneuse', 'Iris', [[124, 41], [362, 41]], { id: 'givre:iris', sight: 2, intro: 'Le vent du ravin hurle ici... Tu l\'entends ?', lose: 'Le sommet est juste de l\'autre côté du gouffre.' });
  trainerNpc(W, 399, 23, 'right', 'Montagnard', 'Edgar', [[76, 42], [460, 42]], { id: 'givre:edgar', sight: 3, intro: 'Personne ne passe sur le plateau sans m\'avoir battu !', lose: 'Va donc voir la mer depuis le belvédère.' });
  W.item(384, 40, 'max-repel', 1, 'givre:mont-repousse');
  W.item(386, 35, 'never-melt-ice', 1, 'givre:mont-glace-eternelle');
  W.item(388, 31, 'ultra-ball', 2, 'givre:mont-ultra');
  W.item(394, 24, 'rare-candy', 1, 'givre:mont-bonbon');
  W.item(434, 25, 'ice-stone', 1, 'givre:mont-pierre-glace');
  // le belvédère : une longue-vue tournée vers la mer de l'Est, un banc, une guetteuse
  W.sign(434, 23, 'Une longue-vue, braquée sur la mer de l\'Est.\nLes tourbillons du large tournent sans fin ; au sud, on devine la côte de l\'Île Orageuse.', 'telescope');
  W.prop('banc', 430, 22);
  W.npc({ id: 'givre:guetteuse', x: 432, y: 24, sprite: 'randonneuse', dir: 'right', text: ['Chaque matin, je monte voir le soleil se lever sur la mer de l\'Est.', 'Les gens d\'ici disent qu\'Artikodin passe au-dessus du mont avant de rejoindre la Cime Givrée.'] });
  (W.montagnes ||= []).push({ nom: 'Mont Givré', sommet: [431, 24], pied: [388, 43], passerelles: [[401, 32, 404, 32], [412, 25, 412, 27]] });
}
