// Plans des villes, PNJ, dresseurs des routes, gardes. Coordonnées absolues dans le monde (240 × 200).

import { GR, OB } from './world.js';

let NPC_SEQ = 0;
function npc(M, o) {
  const n = { id: o.id || 'n' + (++NPC_SEQ), dir: 'down', look: 'youngster', move: 'static', ...o };
  M.npcs.push(n);
  return n;
}
function trainer(M, o) {
  return npc(M, { move: 'static', ...o, trainer: { sight: 4, money: 30, ...o.trainer, id: o.id } });
}

/** bâtiment + porte vers un intérieur */
function door(api, T, b, def) {
  const B = api.addBuilding(b);
  if (B.door && def) {
    const id = T.id + ':' + (def.slot || b.kind);
    api.M.addWarp(B.door.x, B.door.y, { map: id, entry: true, kind: 'door' });
    api.M.interiors[id] = { kind: b.kind, town: T.id, townName: T.name, exit: { x: B.door.x, y: B.door.y + 1 }, ...def, id };
    // paillasson devant la porte
    api.clear(B.door.x, B.door.y + 1, null);
  }
  return B;
}
function fenceH(M, x0, x1, y) { for (let x = x0; x <= x1; x++) if (M.walkable(x, y)) M.setO(x, y, OB.FENCE); }
function fenceV(M, x, y0, y1) { for (let y = y0; y <= y1; y++) if (M.walkable(x, y)) M.setO(x, y, OB.FENCE); }
function flowers(M, x0, y0, x1, y1, every = 1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (M.walkable(x, y) && M.o(x, y) === OB.NONE && (x + y) % every === 0) M.setG(x, y, GR.FLOWER); }
function trees(M, list, kind = OB.TREE) { for (const [x, y] of list) { M.setO(x, y, kind); M.setE(x, y, 0); } }
function sign(M, x, y, text) { M.setO(x, y, OB.SIGN); M.signs.set(M.key(x, y), text); }
/** ferme une sortie de ville en ne laissant qu'une case, gardée */
function gate(api, x, y, horiz, half, o) {
  const { M } = api;
  for (let k = -half; k <= half; k++) { if (k === 0) continue; const gx = horiz ? x + k : x, gy = horiz ? y : y + k; if (M.inb(gx, gy)) { M.setO(gx, gy, OB.TREE); M.setE(gx, gy, 0); } }
  return npc(M, { x, y, look: 'guard', dir: o.dir || 'down', gate: { badges: o.badges, flag: o.flag }, talk: o.talk, ...o.extra });
}

// ---------------------------------------------------------------- villes
export const TOWNS_DATA = [
  // ================= Hameau des Brumes (départ)
  { id: 'hameau', name: 'Hameau des Brumes', rect: [104, 170, 131, 193], base: GR.GRASS, music: 'hameau', fly: [117, 180],
    build(api, T) {
      const { M } = api;
      api.rect(115, 171, 120, 181, GR.PATH);
      api.rect(108, 178, 125, 179, GR.PATH);
      api.rect(115, 182, 118, 188, GR.PATH);
      door(api, T, { kind: 'house', x: 107, y: 174, w: 5, d: 4, roof: '#d0503c', wall: '#f4ead2' }, { slot: 'maison', name: 'Ta maison', home: true,
        npcs: [{ look: 'mom', x: 2, y: 3, dir: 'right', script: 'mom', talk: ['Ah, te voilà ! Le Professeur Chêneblanc t\'attend à son laboratoire, au sud du village.'] }] });
      door(api, T, { kind: 'house', x: 120, y: 174, w: 5, d: 4, roof: '#3c78c8', wall: '#f0e8d8' }, { slot: 'rival', name: 'Maison de Noé',
        npcs: [{ look: 'oldwoman', x: 6, y: 3, dir: 'left', talk: ['Mon petit-fils Noé est parti au labo ce matin.', 'Il a toujours voulu devenir le meilleur dresseur d\'Ambrevale. Il a ça dans le sang, tu sais.'] }] });
      door(api, T, { kind: 'lab', x: 112, y: 182, w: 9, d: 5, roof: '#a8b4c0', wall: '#f6f6f2', h: 2.6 }, { slot: 'labo', name: 'Laboratoire de Chêneblanc' });
      trees(M, [[105, 186], [105, 188], [129, 173], [130, 176], [126, 190], [111, 190], [123, 190]]);
      fenceH(M, 109, 113, 189); fenceH(M, 120, 124, 189);
      flowers(M, 104, 180, 106, 183); flowers(M, 126, 181, 129, 186);
      M.setO(106, 177, OB.MAILBOX); M.setO(119, 177, OB.MAILBOX);
      sign(M, 114, 173, 'Hameau des Brumes\nLà où souffle le vent du large.');
      sign(M, 119, 187, 'Laboratoire du Professeur Chêneblanc');
      npc(M, { x: 110, y: 183, look: 'lass', move: 'wander', talk: ['On dit qu\'il y a des créatures cachées dans les hautes herbes.', 'Sans compagnon, c\'est bien trop dangereux d\'y aller !'] });
      npc(M, { x: 125, y: 192, look: 'oldman', dir: 'down', talk: ['Regarde cette mer... Les marins disent qu\'un gardien veille sur Ambrevale.', 'Ses ailes auraient la couleur de l\'ambre.'] });
      // Noé bloque la sortie nord tant que l'on n'a pas de compagnon
      npc(M, { id: 'kid_block', x: 117, y: 171, look: 'kid', dir: 'down', block: { untilFlag: 'starter' }, talk: ['Attends ! N\'entre pas dans les hautes herbes sans créature !', 'Va voir le Professeur au labo, au sud.'] });
    } },

  // ================= Roc-Marbre (Badge Galet)
  { id: 'rocmarbre', name: 'Roc-Marbre', rect: [100, 118, 137, 145], base: GR.GRASS, music: 'town', fly: [107, 127],
    build(api, T) {
      const { M } = api;
      api.rect(117, 119, 119, 145, GR.PATH);
      api.rect(100, 130, 137, 132, GR.PATH);
      api.rect(104, 126, 110, 129, GR.PATH); api.rect(124, 126, 130, 129, GR.PATH);
      door(api, T, { kind: 'center', x: 104, y: 121, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 124, y: 121, w: 6, d: 5 }, { name: 'Boutique', stock: ['sphere', 'potion', 'antidote', 'repousse'] });
      door(api, T, { kind: 'gym', x: 104, y: 134, w: 9, d: 6, roof: '#8c7c6a', wall: '#d8cfc0', h: 3 }, { name: 'Arène de Roc-Marbre', gym: 'roche' });
      door(api, T, { kind: 'house', x: 126, y: 134, w: 5, d: 4, roof: '#6c9a48' }, { slot: 'maison1', name: 'Maison',
        npcs: [{ look: 'hiker', x: 3, y: 3, dir: 'down', talk: ['Bastien, le champion de l\'arène, ne jure que par les créatures Roche.', 'Une attaque Eau ou Plante les fait fondre comme du sucre !'] }] });
      door(api, T, { kind: 'house', x: 110, y: 141, w: 5, d: 4, roof: '#c86a3a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'kid', x: 5, y: 3, dir: 'left', script: 'gift', gift: { item: 'potion', n: 3, flag: 'gift_roc' }, talk: ['Tiens, prends ça ! Maman en a plein le placard.'] }] });
      for (const [x, y] of [[113, 122], [113, 125], [121, 136], [121, 140], [134, 125], [101, 140]]) M.setO(x, y, OB.ROCK);
      trees(M, [[101, 119], [136, 119], [136, 140], [101, 144], [136, 144]]);
      flowers(M, 121, 141, 124, 144, 2);
      sign(M, 116, 143, 'Roc-Marbre\nLa ville taillée dans la pierre.');
      sign(M, 114, 139, 'Arène de Roc-Marbre\nChampion : Bastien, le roc inébranlable.');
      npc(M, { x: 122, y: 128, look: 'youngster', move: 'wander', talk: ['Quand ta créature est fatiguée, va au Centre de Soin. C\'est gratuit !'] });
      npc(M, { x: 132, y: 137, look: 'lass', move: 'wander', talk: ['Dans la Boutique, on trouve des Sphères pour capturer des créatures sauvages.', 'Affaiblis-les d\'abord : c\'est bien plus facile !'] });
      gate(api, 118, 118, true, 1, { badges: 4, dir: 'down', talk: ['Désolé, la Route 10 est en travaux.', 'Reviens quand tu auras au moins quatre badges : d\'ici là, ce sera fini.'] });
      gate(api, 137, 131, false, 1, { badges: 5, dir: 'left', talk: ['Halte ! La Grotte Cendrée est fermée : il y a eu un éboulement.', 'On rouvrira quand le passage sera sûr. Plus tard dans ton voyage, sans doute.'] });
    } },

  // ================= Jardibourg (Badge Feuille)
  { id: 'jardibourg', name: 'Jardibourg', rect: [28, 116, 61, 145], base: GR.GRASS, music: 'town', fly: [51, 127],
    build(api, T) {
      const { M } = api;
      api.rect(34, 130, 61, 132, GR.PATH);
      api.rect(43, 116, 45, 144, GR.PATH);
      api.rect(48, 126, 54, 129, GR.PATH); api.rect(31, 126, 37, 129, GR.PATH);
      door(api, T, { kind: 'center', x: 48, y: 121, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 31, y: 121, w: 6, d: 5 }, { name: 'Boutique', stock: ['sphere', 'potion', 'antidote', 'totalsoin', 'repousse'] });
      door(api, T, { kind: 'gym', x: 47, y: 135, w: 10, d: 7, roof: '#7cc8a0', wall: '#e8f2e0', h: 3, glass: true }, { name: 'Arène de Jardibourg', gym: 'plante' });
      door(api, T, { kind: 'house', x: 31, y: 134, w: 5, d: 4, roof: '#d0a040' }, { slot: 'maison1', name: 'Maison',
        npcs: [{ look: 'oldwoman', x: 3, y: 3, dir: 'down', talk: ['Iris, la championne, soigne ses plantes chaque matin à l\'aube.', 'Méfie-toi de ses spores : elles endorment les plus coriaces.'] }] });
      door(api, T, { kind: 'house', x: 36, y: 140, w: 5, d: 4, roof: '#c84a6a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'lass', x: 2, y: 3, dir: 'right', script: 'gift', gift: { item: 'supersphere', n: 2, flag: 'gift_jardi' }, talk: ['Tu collectionnes les créatures ? Prends ces Super Sphères, elles sont plus efficaces.'] }] });
      flowers(M, 54, 117, 60, 128); flowers(M, 28, 140, 33, 145); flowers(M, 38, 117, 41, 124);
      api.pond(57, 140, 2.6, 1.8);
      trees(M, [[29, 117], [29, 128], [60, 133], [60, 135], [46, 117], [41, 133]]);
      fenceH(M, 53, 60, 129);
      sign(M, 42, 142, 'Jardibourg\nLa ville aux mille fleurs.');
      sign(M, 46, 141, 'Arène de Jardibourg\nChampionne : Iris, la main verte.');
      npc(M, { x: 57, y: 124, look: 'lass', move: 'wander', talk: ['Ces fleurs embaument tout le quartier, tu ne trouves pas ?'] });
      npc(M, { x: 37, y: 131, look: 'oldman', move: 'wander', talk: ['La route au nord mène à Brumecourt. Là-bas, le brouillard ne se lève jamais.'] });
    } },

  // ================= Brumecourt (Badge Brume)
  { id: 'brumecourt', name: 'Brumecourt', rect: [26, 50, 63, 78], base: GR.DARKGRASS, music: 'mist', mist: 0.45, edgeObj: OB.DEADTREE, fly: [33, 72],
    build(api, T) {
      const { M } = api;
      api.rect(43, 51, 45, 78, GR.PATH);
      api.rect(30, 62, 63, 64, GR.PATH);
      api.rect(30, 71, 36, 72, GR.PATH); api.rect(49, 71, 55, 72, GR.PATH);
      door(api, T, { kind: 'center', x: 30, y: 66, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 49, y: 66, w: 6, d: 5 }, { name: 'Boutique', stock: ['sphere', 'supersphere', 'potion', 'superpotion', 'antidote', 'totalsoin', 'repousse'] });
      door(api, T, { kind: 'gym', x: 31, y: 53, w: 9, d: 6, roof: '#6a4c8a', wall: '#c8c0d4', h: 3.2 }, { name: 'Arène de Brumecourt', gym: 'spectre' });
      api.addBuilding({ kind: 'tower', x: 51, y: 52, w: 4, d: 4, roof: '#4a3a5c', wall: '#a8a0b0', h: 6.5, noDoor: true });
      door(api, T, { kind: 'house', x: 55, y: 72, w: 5, d: 4, roof: '#5a5a7a' }, { slot: 'maison1', name: 'Maison',
        npcs: [{ look: 'scientist', x: 4, y: 2, dir: 'down', talk: ['J\'étudie le brouillard. Il serait produit par les rêves des Songeau.', 'Ce n\'est qu\'une théorie, bien sûr. Une théorie magnifique.'] }] });
      door(api, T, { kind: 'house', x: 29, y: 73, w: 5, d: 4, roof: '#7a5a4a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'oldwoman', x: 2, y: 3, dir: 'right', talk: ['La nuit, on entend rire dans le cimetière.', 'Ce sont les Spectrelle. Elles ne sont pas méchantes... enfin, je crois.'] }] });
      // petit cimetière
      for (const [x, y] of [[37, 73], [39, 73], [41, 73], [37, 75], [39, 75], [41, 75]]) M.setO(x, y, OB.STATUE);
      fenceH(M, 36, 42, 77);
      for (const [x, y] of [[42, 60], [46, 60], [42, 66], [46, 66], [38, 61], [56, 61]]) M.setO(x, y, OB.LAMP);
      trees(M, [[27, 60], [61, 52], [61, 70], [27, 51], [48, 76]], OB.DEADTREE);
      sign(M, 47, 76, 'Brumecourt\nLa ville où le brouillard garde ses secrets.');
      sign(M, 41, 58, 'Arène de Brumecourt\nChampionne : Morgane, l\'ombre qui murmure.');
      npc(M, { x: 52, y: 63, look: 'youngster', move: 'wander', talk: ['La vieille tour ? Personne n\'a la clé depuis cent ans.'] });
      npc(M, { x: 35, y: 64, look: 'lass', move: 'wander', talk: ['Les créatures Spectre craignent les attaques Ténèbres et Spectre.', 'Mais les coups Normal ne leur font rien du tout !'] });
      gate(api, 44, 50, true, 1, { badges: 6, dir: 'down', talk: ['Le col enneigé vers Givrecime est dangereux.', 'Je ne laisse passer que les dresseurs qui ont six badges.'] });
    } },

  // ================= Volteville (Badge Volt)
  { id: 'volteville', name: 'Volteville', rect: [98, 44, 143, 80], base: GR.PAVE, music: 'city', fly: [103, 73],
    build(api, T) {
      const { M } = api;
      api.ground(98, 44, 143, 80, GR.PAVE);
      // îlots d'herbe
      for (const [x0, y0, x1, y1] of [[99, 45, 116, 59], [124, 45, 142, 59], [99, 67, 116, 79], [124, 67, 142, 79]]) api.ground(x0, y0, x1, y1, GR.GRASS);
      api.rect(117, 44, 123, 80, GR.PAVE); api.rect(98, 60, 143, 66, GR.PAVE);
      door(api, T, { kind: 'gym', x: 101, y: 47, w: 10, d: 7, roof: '#e8c030', wall: '#f0ecd8', h: 3.2 }, { name: 'Arène de Volteville', gym: 'elec' });
      door(api, T, { kind: 'center', x: 101, y: 69, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 125, y: 69, w: 6, d: 5 }, { name: 'Grand Magasin', stock: ['sphere', 'supersphere', 'potion', 'superpotion', 'antidote', 'totalsoin', 'repousse', 'rappel'] });
      api.addBuilding({ kind: 'tower', x: 136, y: 46, w: 5, d: 5, roof: '#8090a8', wall: '#c0c8d4', h: 7, noDoor: true, metal: true });
      door(api, T, { kind: 'house', x: 126, y: 47, w: 5, d: 4, roof: '#4a8ac8' }, { slot: 'maison1', name: 'Maison',
        npcs: [{ look: 'scientist', x: 3, y: 3, dir: 'down', talk: ['La Tour Volta alimente toute la ville.', 'Lionel, le champion, y passe ses nuits à bricoler des générateurs.'] }] });
      door(api, T, { kind: 'house', x: 110, y: 73, w: 5, d: 4, roof: '#c85a5a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'oldman', x: 2, y: 3, dir: 'right', script: 'gift', gift: { item: 'rappel', n: 1, flag: 'gift_volt' }, talk: ['Quand une créature est K.O., un Rappel la remet sur pied. Prends celui-ci.'] }] });
      door(api, T, { kind: 'house', x: 133, y: 72, w: 5, d: 4, roof: '#6aa060' }, { slot: 'maison3', name: 'Maison',
        npcs: [{ look: 'lass', x: 4, y: 3, dir: 'down', talk: ['Il paraît qu\'au-delà de Port-Azur, la route longe une plage magnifique.'] }] });
      door(api, T, { kind: 'house', x: 126, y: 54, w: 7, d: 4, roof: '#a05ac0', wall: '#ece2f2' }, { slot: 'club', name: 'Club des Dresseurs',
        npcs: [{ look: 'ace', x: 2, y: 3, dir: 'right', talk: ['Ici, on parle stratégie. Savais-tu qu\'une attaque du même type que son lanceur frappe plus fort ?'] },
          { look: 'acef', x: 6, y: 3, dir: 'left', talk: ['Les statuts comptent beaucoup : une créature paralysée est plus lente et facile à capturer.'] }] });
      api.addBuilding({ kind: 'fountain', x: 119, y: 54, w: 3, d: 3, noDoor: true, h: 0.6 });
      for (const [x, y] of [[116, 60], [124, 60], [116, 66], [124, 66], [108, 60], [132, 60], [108, 66], [132, 66]]) M.setO(x, y, OB.LAMP);
      trees(M, [[99, 59], [115, 45], [142, 59], [99, 67], [142, 79], [115, 79]]);
      flowers(M, 112, 46, 115, 52, 2); flowers(M, 136, 67, 141, 70, 2);
      sign(M, 116, 64, 'Volteville\nLa ville qui ne dort jamais.');
      sign(M, 112, 54, 'Arène de Volteville\nChampion : Lionel, le génie survolté.');
      npc(M, { x: 121, y: 70, look: 'youngster', move: 'wander', talk: ['Volteville, c\'est la plus grande ville d\'Ambrevale !'] });
      npc(M, { x: 108, y: 63, look: 'acef', move: 'wander', talk: ['Les créatures Sol ne craignent pas du tout l\'électricité.'] });
      npc(M, { x: 133, y: 64, look: 'oldwoman', move: 'wander', talk: ['À l\'est, le pont du Lac Miroir mène à Port-Azur.'] });
      // le rival attend devant l'arène (2e combat)
      npc(M, { id: 'rival_volt', x: 106, y: 57, look: 'rival', dir: 'down', script: 'rival', rival: 3, showIfBadges: 3, hideFlag: 'rival3' });
    } },

  // ================= Port-Azur (Badge Vague)
  { id: 'portazur', name: 'Port-Azur', rect: [194, 46, 225, 80], base: GR.PAVE, music: 'port', fly: [199, 58],
    build(api, T) {
      const { M } = api;
      api.ground(194, 46, 225, 80, GR.PAVE);
      for (const [x0, y0, x1, y1] of [[195, 47, 207, 60], [213, 47, 224, 60], [195, 66, 207, 79]]) api.ground(x0, y0, x1, y1, GR.GRASS);
      api.ground(213, 66, 225, 80, GR.SAND);
      api.rect(208, 46, 212, 80, GR.PAVE); api.rect(194, 61, 225, 65, GR.PAVE);
      // quais
      for (let x = 226; x <= 236; x++) for (const y of [55, 56, 71, 72]) api.clear(x, y, GR.DOCK);
      for (let x = 224; x <= 226; x++) for (let y = 47; y <= 80; y++) if (M.g(x, y) === GR.WATER || x >= 225) api.clear(x, y, M.g(x, y) === GR.WATER ? GR.WATER : GR.SAND);
      door(api, T, { kind: 'center', x: 196, y: 52, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 214, y: 52, w: 6, d: 5 }, { name: 'Boutique du Port', stock: ['sphere', 'supersphere', 'potion', 'superpotion', 'totalsoin', 'repousse', 'rappel'] });
      door(api, T, { kind: 'gym', x: 196, y: 67, w: 10, d: 7, roof: '#3c88d0', wall: '#e4eef6', h: 3 }, { name: 'Arène de Port-Azur', gym: 'eau' });
      api.addBuilding({ kind: 'lighthouse', x: 221, y: 47, w: 3, d: 3, roof: '#d04040', wall: '#f4f4f4', h: 8, noDoor: true });
      door(api, T, { kind: 'house', x: 214, y: 70, w: 5, d: 4, roof: '#2c6aa0' }, { slot: 'maison1', name: 'Maison du Pêcheur',
        npcs: [{ look: 'fisher', x: 3, y: 3, dir: 'down', talk: ['Maëlle, la championne, a grandi sur les quais. Elle nage mieux qu\'un Carpillon !', 'Ses créatures Eau détestent l\'électricité et les plantes.'] }] });
      door(api, T, { kind: 'house', x: 219, y: 75, w: 5, d: 4, roof: '#c07040' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'sailor', x: 2, y: 3, dir: 'right', talk: ['Un jour, je prendrai la mer jusqu\'aux îles lointaines.', 'Mais pour l\'instant, mon bateau prend l\'eau.'] }] });
      for (const [x, y] of [[207, 61], [213, 61], [207, 65], [213, 65]]) M.setO(x, y, OB.LAMP);
      for (const [x, y] of [[226, 57], [229, 57], [232, 54], [226, 70], [230, 73]]) if (M.g(x, y) === GR.DOCK) M.setO(x, y, OB.BARREL);
      for (const [x, y] of [[220, 66], [221, 67], [216, 79]]) M.setO(x, y, OB.CRATE);
      trees(M, [[195, 47], [206, 47], [195, 79]]);
      trees(M, [[214, 67], [224, 79]], OB.PALM);
      sign(M, 206, 64, 'Port-Azur\nLa porte de l\'océan.');
      sign(M, 207, 73, 'Arène de Port-Azur\nChampionne : Maëlle, la vague indomptable.');
      npc(M, { x: 231, y: 56, look: 'fisher', dir: 'up', talk: ['Ça ne mord pas aujourd\'hui...'] });
      npc(M, { x: 210, y: 68, look: 'sailor', move: 'wander', talk: ['Au sud, la Route 6 longe la plage jusqu\'à Forgeval, la ville du volcan.'] });
      npc(M, { x: 200, y: 63, look: 'lass', move: 'wander', talk: ['L\'air marin, il n\'y a rien de mieux !'] });
    } },

  // ================= Forgeval (Badge Braise)
  { id: 'forgeval', name: 'Forgeval', rect: [192, 118, 225, 148], base: GR.ASH, music: 'town', fly: [198, 127],
    build(api, T) {
      const { M } = api;
      api.rect(208, 118, 212, 148, GR.PATH);
      api.rect(192, 132, 225, 134, GR.PATH);
      for (const [x0, y0, x1, y1] of [[193, 119, 207, 131], [213, 119, 224, 131]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (api.hash2(x, y, 41) < 0.3) M.setG(x, y, GR.GRASS);
      door(api, T, { kind: 'center', x: 195, y: 121, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 214, y: 121, w: 6, d: 5 }, { name: 'Boutique', stock: ['supersphere', 'hypersphere', 'superpotion', 'hyperpotion', 'totalsoin', 'repousse', 'rappel'] });
      door(api, T, { kind: 'gym', x: 195, y: 136, w: 10, d: 7, roof: '#d0482c', wall: '#e8d4c0', h: 3 }, { name: 'Arène de Forgeval', gym: 'feu' });
      door(api, T, { kind: 'house', x: 215, y: 137, w: 5, d: 4, roof: '#8a4a3a' }, { slot: 'maison1', name: 'Forge',
        npcs: [{ look: 'hiker', x: 3, y: 2, dir: 'down', talk: ['Aldo, le champion, était forgeron avant d\'être dresseur.', 'Ses créatures Feu sont redoutables, mais l\'Eau, la Roche et le Sol les calment.'] }] });
      door(api, T, { kind: 'house', x: 219, y: 143, w: 5, d: 4, roof: '#a06a3a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'oldwoman', x: 2, y: 3, dir: 'right', talk: ['Les sources chaudes de Forgeval soignent tous les rhumatismes !'] }] });
      api.pond(219, 128, 3, 1.5);
      for (const [x, y] of [[214, 128], [224, 127], [193, 146], [206, 146]]) M.setO(x, y, OB.ROCK);
      trees(M, [[193, 119], [224, 119], [224, 131]], OB.DEADTREE);
      sign(M, 207, 131, 'Forgeval\nLa ville au cœur de braise.');
      sign(M, 206, 142, 'Arène de Forgeval\nChampion : Aldo, le marteau ardent.');
      npc(M, { x: 212, y: 128, look: 'hiker', move: 'wander', talk: ['La Grotte Cendrée, à l\'ouest, relie Forgeval à Roc-Marbre.'] });
      npc(M, { x: 202, y: 133, look: 'youngster', move: 'wander', talk: ['Il fait chaud ici, hein ? C\'est le volcan qui dort sous nos pieds.'] });
    } },

  // ================= Givrecime (Badge Givre)
  { id: 'givrecime', name: 'Givrecime', rect: [26, 8, 63, 34], base: GR.SNOW, music: 'snow', edgeObj: OB.SNOWPINE, fly: [32, 16],
    build(api, T) {
      const { M } = api;
      api.rect(43, 8, 45, 34, GR.SNOWPATH);
      api.rect(26, 19, 63, 21, GR.SNOWPATH);
      door(api, T, { kind: 'center', x: 29, y: 11, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 50, y: 11, w: 6, d: 5 }, { name: 'Boutique', stock: ['supersphere', 'hypersphere', 'superpotion', 'hyperpotion', 'totalsoin', 'repousse', 'rappel'] });
      door(api, T, { kind: 'gym', x: 29, y: 24, w: 10, d: 7, roof: '#a8d8f0', wall: '#eef6fa', h: 3 }, { name: 'Arène de Givrecime', gym: 'glace' });
      door(api, T, { kind: 'house', x: 50, y: 24, w: 5, d: 4, roof: '#d84a4a', snow: true }, { slot: 'maison1', name: 'Chalet',
        npcs: [{ look: 'oldman', x: 3, y: 3, dir: 'down', talk: ['Solène, la championne, médite chaque nuit sur le lac gelé.', 'Le Feu, le Combat, la Roche et l\'Acier percent sa glace.'] }] });
      door(api, T, { kind: 'house', x: 55, y: 29, w: 5, d: 4, roof: '#4a7ac8', snow: true }, { slot: 'maison2', name: 'Chalet',
        npcs: [{ look: 'kid', x: 2, y: 3, dir: 'right', script: 'gift', gift: { item: 'hypersphere', n: 2, flag: 'gift_givre' }, talk: ['J\'ai trouvé ces Hyper Sphères dans la neige. Je te les donne !'] }] });
      api.pond(56, 14, 3, 2);
      trees(M, [[27, 9], [62, 9], [62, 33], [27, 33], [40, 25], [48, 31]], OB.SNOWPINE);
      sign(M, 42, 32, 'Givrecime\nLa ville au sommet du monde.');
      sign(M, 40, 30, 'Arène de Givrecime\nChampionne : Solène, le cœur de glace.');
      npc(M, { x: 37, y: 20, look: 'acef', move: 'wander', talk: ['Brrr ! Même les Givrelin ont froid ce soir.'] });
      npc(M, { x: 50, y: 18, look: 'hiker', move: 'wander', talk: ['À l\'est, la route mène à la Cité Draconique, perchée sur les hauteurs.'] });
    } },

  // ================= Cité Draconique (Badge Écaille)
  { id: 'cite', name: 'Cité Draconique', rect: [100, 6, 139, 36], base: GR.ROCKY, music: 'city', fly: [105, 15],
    build(api, T) {
      const { M } = api;
      api.rect(118, 6, 122, 36, GR.PAVE);
      api.rect(100, 18, 139, 22, GR.PAVE);
      door(api, T, { kind: 'center', x: 102, y: 9, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 128, y: 9, w: 6, d: 5 }, { name: 'Boutique', stock: ['supersphere', 'hypersphere', 'superpotion', 'hyperpotion', 'totalsoin', 'repousse', 'rappel'] });
      door(api, T, { kind: 'gym', x: 109, y: 25, w: 11, d: 8, roof: '#5a3a8a', wall: '#d8d0c0', h: 3.6 }, { name: 'Temple de la Cité', gym: 'dragon' });
      door(api, T, { kind: 'house', x: 102, y: 27, w: 5, d: 4, roof: '#7a5a3a' }, { slot: 'maison1', name: 'Maison',
        npcs: [{ look: 'oldwoman', x: 3, y: 3, dir: 'down', talk: ['Valère, notre champion, descend d\'une longue lignée de dompteurs de dragons.', 'Seuls la Glace, le Dragon et la Fée blessent vraiment ses créatures.'] }] });
      door(api, T, { kind: 'house', x: 130, y: 27, w: 5, d: 4, roof: '#3a6a5a' }, { slot: 'maison2', name: 'Maison',
        npcs: [{ look: 'scientist', x: 2, y: 3, dir: 'right', talk: ['La légende parle d\'Ambrion, le gardien d\'ambre.', 'Il dormirait dans une grotte au-delà du Plateau des Champions.'] }] });
      for (const [x, y] of [[117, 10], [123, 10], [117, 15], [123, 15], [117, 25], [123, 25], [117, 31], [123, 31]]) M.setO(x, y, OB.STATUE);
      trees(M, [[101, 7], [138, 7], [138, 35], [101, 35], [110, 15], [131, 16]], OB.PINE);
      sign(M, 116, 34, 'Cité Draconique\nL\'antique berceau des dragons.');
      sign(M, 117, 22, 'Temple de la Cité\nChampion : Valère, le maître des dragons.');
      npc(M, { x: 125, y: 20, look: 'ace', move: 'wander', talk: ['Après ce temple, il ne reste que la Route Victoire et la Ligue.'] });
      gate(api, 139, 20, false, 2, { badges: 8, dir: 'left', talk: ['Seuls les dresseurs possédant les huit badges peuvent emprunter la Route Victoire.'] });
    } },

  // ================= Plateau des Champions (Ligue)
  { id: 'plateau', name: 'Plateau des Champions', rect: [172, 6, 205, 34], base: GR.PAVE, music: 'league', fly: [177, 30],
    build(api, T) {
      const { M } = api;
      api.ground(172, 6, 205, 34, GR.GRASS);
      api.rect(185, 17, 189, 34, GR.PAVE); api.rect(172, 19, 205, 21, GR.PAVE);
      door(api, T, { kind: 'league', x: 180, y: 8, w: 15, d: 9, roof: '#c84040', wall: '#f2ece0', h: 4.2 }, { name: 'Ligue d\'Ambrevale' });
      door(api, T, { kind: 'center', x: 174, y: 25, w: 7, d: 5 }, { name: 'Centre de Soin' });
      door(api, T, { kind: 'shop', x: 194, y: 25, w: 6, d: 5 }, { name: 'Boutique', stock: ['hypersphere', 'hyperpotion', 'totalsoin', 'rappel', 'repousse'] });
      for (const [x, y] of [[184, 22], [190, 22], [184, 28], [190, 28]]) M.setO(x, y, OB.STATUE);
      flowers(M, 173, 7, 178, 16); flowers(M, 196, 7, 203, 16);
      sign(M, 191, 32, 'Plateau des Champions\nLe sommet de tout dresseur.');
      npc(M, { x: 200, y: 20, look: 'guard', dir: 'left', block: { untilFlag: 'champion' }, talk: ['Ce passage mène à l\'Antre d\'Ambre. Seul le Champion peut y entrer.'] });
    } },
];

// ---------------------------------------------------------------- dresseurs et objets des routes
export function placeRouteStuff(api) {
  const { M } = api;
  const T = (o) => trainer(M, o);
  const item = (x, y, it, n = 1) => { M.items.push({ x, y, item: it, n, flag: 'it_' + x + '_' + y }); };

  // Route 1
  T({ id: 't_r1a', x: 114, y: 157, dir: 'right', look: 'youngster', trainer: { name: 'Léo', cls: 'Gamin', team: [['grignou', 3], ['piaffu', 3]], intro: 'Hé ! On dit que les dresseurs se battent quand leurs regards se croisent !', lose: 'Pfff... J\'aurais dû m\'entraîner plus.', after: 'Tu deviendras fort, toi.' } });
  T({ id: 't_r1b', x: 120, y: 149, dir: 'left', look: 'lass', trainer: { name: 'Julie', cls: 'Fillette', team: [['laineau', 4]], intro: 'Mon Laineau est tout doux, mais il sait se battre !', lose: 'Oh non, mon pauvre Laineau !', after: 'Je vais le brosser pour le consoler.' } });
  item(122, 164, 'potion'); item(111, 152, 'sphere', 2);
  npc(M, { x: 116, y: 166, look: 'oldman', move: 'wander', talk: ['Tu vois les hautes herbes ? Les créatures sauvages s\'y cachent.', 'Avance dedans et l\'une d\'elles finira par surgir.'] });

  // Route 2 / Bois Murmurant
  T({ id: 't_r2a', x: 93, y: 133, dir: 'up', look: 'bugcatcher', trainer: { name: 'Tom', cls: 'Scout', team: [['chenillo', 6], ['chenillo', 6]], intro: 'Mes insectes sont les meilleurs du monde !', lose: 'Mes insectes...', after: 'Le Bois Murmurant regorge d\'insectes.' } });
  T({ id: 't_r2b', x: 79, y: 130, dir: 'down', look: 'bugcatcher', trainer: { name: 'Lise', cls: 'Scout', team: [['dardillon', 7], ['chenillo', 7]], intro: 'Bzzz ! Tu entres dans mon territoire !', lose: 'Bzzz... perdu.', after: 'Attention aux Dardillon, ils piquent !' } });
  T({ id: 't_r2c', x: 67, y: 131, dir: 'right', look: 'lass', trainer: { name: 'Anaïs', cls: 'Cueilleuse', team: [['pousselin', 8], ['mousseron', 8]], intro: 'Je cherche des champignons. Et toi, tu cherches la bagarre ?', lose: 'Bien joué !', after: 'Jardibourg est juste à l\'ouest.' } });
  item(83, 135, 'antidote'); item(72, 126, 'sphere', 3);
  npc(M, { x: 97, y: 130, look: 'oldman', dir: 'left', talk: ['Le Bois Murmurant... on y entend chuchoter les arbres.', 'Ne t\'y perds pas, le chemin serpente beaucoup.'] });

  // Route 3
  T({ id: 't_r3a', x: 40, y: 104, dir: 'right', look: 'acef', trainer: { name: 'Clara', cls: 'Randonneuse', team: [['piaffu', 11], ['bulleau', 12]], intro: 'Une petite pause combat pendant ma randonnée ?', lose: 'Tu marches vite... et tu te bats bien !', after: 'Profite de la vue sur l\'étang.' } });
  T({ id: 't_r3b', x: 48, y: 93, dir: 'left', look: 'karate', trainer: { name: 'Hugo', cls: 'Karatéka', team: [['poingris', 13]], intro: 'Hiya ! Mes poings sont plus durs que la pierre !', lose: 'Ma garde... était trop basse.', after: 'Je dois encore m\'entraîner.' } });
  T({ id: 't_r3c', x: 43, y: 112, dir: 'up', look: 'youngster', trainer: { name: 'Max', cls: 'Gamin', team: [['grignou', 10], ['sinueuse', 11]], intro: 'J\'ai attrapé une Sinueuse ce matin ! Regarde !', lose: 'Elle a fait de son mieux...', after: 'Les Sinueuse aiment les hautes herbes près de l\'eau.' } });
  item(36, 97, 'superpotion'); item(52, 86, 'supersphere');
  npc(M, { id: 'rival_r3', x: 44, y: 86, look: 'rival', dir: 'down', script: 'rival', rival: 2, showIfBadges: 2, hideFlag: 'rival2' });

  // Route 4
  T({ id: 't_r4a', x: 70, y: 61, dir: 'down', look: 'hiker', trainer: { name: 'Bernard', cls: 'Montagnard', team: [['galetin', 15], ['taupix', 15], ['galetin', 16]], intro: 'Ho ho ! Mes cailloux vont t\'arrêter net !', lose: 'Éboulement total...', after: 'La montagne t\'a à l\'œil.' } });
  T({ id: 't_r4b', x: 81, y: 64, dir: 'up', look: 'acef', trainer: { name: 'Mila', cls: 'Médium', team: [['songeau', 17], ['spectrelle', 17]], intro: 'Je vois ton avenir... Il contient une défaite !', lose: 'Je ne l\'avais pas vu venir...', after: 'Les esprits t\'aiment bien.' } });
  T({ id: 't_r4c', x: 92, y: 62, dir: 'left', look: 'karate', trainer: { name: 'Ryo', cls: 'Karatéka', team: [['poingris', 18], ['poingris', 18]], intro: 'Deux poings valent mieux qu\'un !', lose: 'Aïe aïe aïe.', after: 'Volteville est juste à l\'est.' } });
  item(77, 59, 'totalsoin'); item(88, 66, 'supersphere', 2);

  // Route 10
  T({ id: 't_r10a', x: 123, y: 88, dir: 'left', look: 'scientist', trainer: { name: 'Paul', cls: 'Scientifique', team: [['ferrolin', 22], ['voltis', 22]], intro: 'Mes calculs sont formels : tu vas perdre.', lose: 'Erreur de calcul...', after: 'Je vais revoir mes équations.' } });
  T({ id: 't_r10b', x: 117, y: 107, dir: 'right', look: 'lass', trainer: { name: 'Zoé', cls: 'Éleveuse', team: [['laineau', 21], ['lumignon', 22], ['belinox', 24]], intro: 'Mes petits sont élevés avec amour !', lose: 'Vous avez été adorables quand même.', after: 'L\'amour ne suffit pas toujours, hein ?' } });
  item(126, 101, 'hyperpotion');

  // Route 5 (pont du Lac Miroir)
  T({ id: 't_r5a', x: 160, y: 62, dir: 'down', look: 'fisher', trainer: { name: 'Gérard', cls: 'Pêcheur', team: [['carpillon', 22], ['carpillon', 22], ['squalor', 24]], intro: 'Ça mord ! Ah non, c\'est un dresseur.', lose: 'J\'ai perdu le fil...', after: 'Le lac est profond, on y voit des Squalor.' } });
  T({ id: 't_r5b', x: 175, y: 64, dir: 'up', look: 'fisher', trainer: { name: 'Yves', cls: 'Pêcheur', team: [['bulleau', 24], ['nenufar', 25]], intro: 'Le calme du lac, puis la tempête du combat !', lose: 'Le calme revient...', after: 'Port-Azur est au bout du pont.' } });
  T({ id: 't_r5c', x: 188, y: 61, dir: 'left', look: 'ace', trainer: { name: 'Axel', cls: 'As', team: [['rapacier', 25], ['fulgurat', 26]], intro: 'Je ne perds jamais deux fois. Je n\'ai jamais perdu, d\'ailleurs.', lose: 'Bon... une première fois, alors.', after: 'Tu iras loin.' } });
  item(147, 58, 'superpotion', 2);

  // Route 6 (plage)
  T({ id: 't_r6a', x: 218, y: 88, dir: 'left', look: 'swimmer', trainer: { name: 'Léa', cls: 'Nageuse', team: [['bulleau', 29], ['ranatide', 30]], intro: 'L\'eau est bonne ! Un combat pour se réchauffer ?', lose: 'Je retourne nager...', after: 'Les vagues sont parfaites aujourd\'hui.' } });
  T({ id: 't_r6b', x: 207, y: 99, dir: 'right', look: 'sailor', trainer: { name: 'Marius', cls: 'Marin', team: [['squalor', 30], ['banquifoc', 30]], intro: 'Ohé matelot ! Prépare-toi à l\'abordage !', lose: 'Coulé...', after: 'Forgeval est au sud, ça sent le soufre.' } });
  T({ id: 't_r6c', x: 211, y: 112, dir: 'up', look: 'acef', trainer: { name: 'Inès', cls: 'Dresseuse Pro', team: [['nocturon', 31], ['fournelle', 31], ['viperonne', 32]], intro: 'Tu as l\'air doué. Voyons ça.', lose: 'Impressionnant.', after: 'Aldo, à Forgeval, est bien plus coriace que moi.' } });
  item(222, 94, 'hypersphere'); item(204, 107, 'rappel');

  // Route 7 (neige)
  T({ id: 't_r7a', x: 40, y: 46, dir: 'right', look: 'hiker', trainer: { name: 'Gaston', cls: 'Alpiniste', team: [['givrelin', 36], ['rocharde', 37]], intro: 'Le froid forge le caractère !', lose: 'Je suis gelé...', after: 'Givrecime est en haut du col.' } });
  T({ id: 't_r7b', x: 48, y: 38, dir: 'left', look: 'acef', trainer: { name: 'Nina', cls: 'Skieuse', team: [['banquifoc', 37], ['givrelin', 38]], intro: 'Attention, je descends à toute allure !', lose: 'Chute !', after: 'Il faut des chaussures adaptées, ici.' } });
  item(36, 41, 'hyperpotion');

  // Route 8
  T({ id: 't_r8a', x: 72, y: 17, dir: 'down', look: 'ace', trainer: { name: 'Hector', cls: 'As', team: [['frimastoc', 41], ['corbonuit', 42]], intro: 'Le vent glacé ne m\'arrête pas. Toi non plus.', lose: 'Tu es une vraie tempête.', after: 'La Cité Draconique t\'attend.' } });
  T({ id: 't_r8b', x: 85, y: 22, dir: 'up', look: 'acef', trainer: { name: 'Lou', cls: 'Dompteuse', team: [['dracolin', 41], ['dracomir', 43]], intro: 'Mes dragons ont faim de victoire !', lose: 'Ils sont rassasiés... de défaite.', after: 'Valère m\'a tout appris.' } });
  T({ id: 't_r8c', x: 95, y: 18, dir: 'left', look: 'hiker', trainer: { name: 'Roger', cls: 'Montagnard', team: [['montagor', 43]], intro: 'Mon Montagor est plus solide qu\'une montagne !', lose: 'La montagne a tremblé.', after: 'Pfiou.' } });
  item(77, 13, 'rappel'); item(90, 24, 'hypersphere', 2);

  // Route Victoire
  T({ id: 't_r9a', x: 146, y: 16, dir: 'down', look: 'ace', trainer: { name: 'Damien', cls: 'As', team: [['colossaing', 47], ['magnetor', 47]], intro: 'Ici, seuls les meilleurs passent.', lose: 'Tu es des leurs.', after: 'Bonne chance à la Ligue.' } });
  T({ id: 't_r9b', x: 155, y: 24, dir: 'up', look: 'acef', trainer: { name: 'Elsa', cls: 'As', team: [['feelune', 47], ['hantombre', 48], ['floreole', 47]], intro: 'Mon équipe est un bouquet de talents.', lose: 'Un bouquet fané...', after: 'Le Champion t\'attend au sommet.' } });
  T({ id: 't_r9c', x: 165, y: 17, dir: 'left', look: 'ace', trainer: { name: 'Victor', cls: 'As', team: [['wyvernor', 49]], intro: 'Mon dragon a vaincu cent dresseurs.', lose: 'Cent et un, alors.', after: '...' } });
  item(150, 25, 'hyperpotion', 2); item(161, 13, 'rappel', 2);
  npc(M, { id: 'rival_r9', x: 168, y: 20, look: 'rival', dir: 'left', script: 'rival', rival: 4, showIfBadges: 8, hideFlag: 'rival4' });

  // Lac & divers
  npc(M, { x: 150, y: 66, look: 'fisher', dir: 'right', talk: ['On appelle ce lac le Lac Miroir : par temps calme, le ciel s\'y reflète parfaitement.'] });
  npc(M, { x: 211, y: 84, look: 'swimmer', move: 'wander', talk: ['Plus au sud, ça sent le volcan. On y fait des œufs durs dans les sources !'] });
}
