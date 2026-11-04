// odyssee/js/world/cendree.js — la Tour Cendrée et la Forêt des Torii agrandie (sans DOM).
// À l'ouest du Temple Kagura, la forêt d'automne s'étend jusqu'aux abords de Floralia (x 166 → 204) : une butte en
// terrasses porte la Tour Cendrée, l'ancienne tour de bois qui a brûlé (rez-de-chaussée en ruine, sous-sol où dorment
// trois Pokémon : l'évènement des bêtes, drapeau `beasts`, se joue en y descendant). Un réseau de sentiers relie le tout :
// la corniche qui longe le haut de l'enceinte du temple, le palier et le jardin du nord-est, la descente de la tour,
// le sentier de l'ouest et son petit sanctuaire, le ravin qui rejoint l'allée des torii, un ruisseau et ses ponts.
// Le relief passe par relief.js : plateaux (parois au sud, marches là où un sentier franchit un bord), puis boucher().
import { T } from './tiles.js';
import { carveRoute, rng, GRAND } from './mapgen.js';
import { room } from './interiors.js';
import { plateau, rectangle, polygone, sinueuse, boucher } from './relief.js';

const key = (x, y) => x + ',' + y;
/** Tour Cendrée : porte de la tour (coin haut-gauche du bâtiment en TX, TY) */
export const TOUR_CENDREE = { x: 179, y: 157 };

/**
 * ctx : { W, maps, trainerNpc, spot, ENC } — W est la carte du monde, spot(m, x, y) une case libre près d'un point.
 * Renvoie { rdc, sous } (les deux salles de la tour).
 */
export function addCendree({ W, maps, trainerNpc, spot, enc }) {
  const m = W, r = rng(1789);
  const TX = TOUR_CENDREE.x, TY = TOUR_CENDREE.y, DX = TX + 5;   // porte de la tour : (DX, TY + 10)
  const cells = new Set();   // cases taillées (pour boucher les recoins)
  const garde = (x, y) => cells.add(key(x, y));

  /** sentier : couloir d'herbe et chemin de deux cases le long d'une ligne lissée ; ponts sur le ruisseau */
  const sentier = (pts, o = {}) => {
    const p = o.lisse === false ? pts : sinueuse(pts, 2.5);
    const res = carveRoute(m, p, { seed: o.seed || 31, w: o.w || 6, grass: o.grass ?? 0.7, tall: T.TALL, trees: o.trees ?? 0.04, flowers: 0.02, rocks: 0.01, bridge: true, taperStart: false, taperEnd: false });
    for (const k of res.info.keys()) cells.add(k);
    return p;
  };
  /** clairière (herbe), sans toucher au décor déjà posé */
  const clairiere = (x0, y0, x1, y1) => { m.rect(x0, y0, x1, y1, T.GRASS, [T.TREE, T.PINE]); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) garde(x, y); };
  /** coussin de mousse (le thème d'automne dessine les fleurs en mousse) */
  const mousse = (cx, cy, rx, ry, s) => m.blob(cx, cy, rx, ry, T.FLOWER, rng(s), [T.GRASS]);

  /* ------------------------------------------------------------------ la forêt agrandie */
  // les arbres de toute la zone prennent leurs couleurs d'automne (thème de la zone) ; la zone du temple et l'ancienne
  // forêt (x ≥ 204) gardent leurs réglages
  m.zone(166, 152, 203, 197, { name: 'Forêt des Torii', music: 'forest', enc, theme: 'automne', route: 'torii', prio: 0 });

  /* ------------------------------------------------------------------ la butte de la tour */
  clairiere(170, 154, 199, 177);
  // le bâtiment, puis le chemin de la porte jusqu'en bas de la butte (les marches seront taillées dans les parois)
  const B = m.building('tower', TX, TY, { ...GRAND.tourCendree, roof: 'brown', name: 'Tour Cendrée' });
  // terrasse haute : cendres au pied de la tour, souches calcinées, herbes folles qui repoussent
  m.rect(TX - 2, TY + 11, TX + 12, TY + 13, T.GRASS);
  m.rect(DX, B.doorY + 1, DX + 1, 181, T.PATH);
  for (const [x, y, rx, ry] of [[TX - 1.5, TY + 3, 1.6, 4], [TX + 12.5, TY + 4, 1.5, 3.5], [TX + 2, TY + 12, 2.2, 1], [TX + 9, TY + 12, 2.2, 1]]) m.blob(x, y, rx, ry, T.ASH, rng(x * 7 + y), [T.GRASS]);
  for (const [x, y] of [[TX - 2, TY + 1], [TX + 12, TY + 7], [TX - 1, TY + 9], [TX + 13, TY + 2]]) m.prop('souche_brulee', x, y);
  for (const [x, y] of [[TX + 1, TY + 12], [TX + 9, TY + 12]]) m.prop('lanterne', x, y);
  m.sign(DX + 2, B.doorY + 2, 'TOUR CENDRÉE\nL\'ancienne tour de bois. Elle a brûlé il y a bien longtemps.');
  // corniche du nord : elle part de la terrasse haute et longe le haut de l'enceinte du temple (x 194 → 238)
  m.rect(TX - 4, 154, TX + 14, 155, T.GRASS); m.rect(TX + 12, 154, 238, 155, T.PATH);
  m.rect(194, 156, 238, 156, T.GRASS, [T.TREE]);
  for (let x = 196; x <= 236; x += 6) m.prop('lanterne', x, 156);
  for (const x of [200, 214, 228]) mousse(x + 2, 153.5, 2.2, 0.7, x);
  m.rect(194, 153, 238, 153, T.TREE);
  for (let x = 194; x <= 238; x++) for (let y = 154; y <= 156; y++) garde(x, y);
  // au milieu de la corniche, une stèle entre deux lanternes, tournée vers la tour
  m.prop('stele', 221, 156); m.object(221, 156, { use: async (A) => A.say(['Une stèle noircie, tournée vers la tour.', '« Pour les trois qui sont tombés dans les flammes, et pour l\'oiseau qui les a relevés. »']) });
  // sentier de l'ouest : il quitte la terrasse haute par un escalier, longe la falaise et descend au pied de la butte
  m.rect(TX - 4, TY + 12, TX - 1, TY + 12, T.PATH); m.rect(TX - 9, TY + 12, TX - 5, TY + 12, T.PATH);
  m.rect(TX - 11, TY + 12, TX - 10, TY + 12, T.PATH);

  // bosquets d'érables sur la butte, en laissant libres les sentiers et le tour de la terrasse haute
  for (const [x0, y0, x1, y1] of [[195, 158, 199, 165], [196, 166, 199, 170], [171, 173, 177, 176], [192, 173, 198, 176], [171, 154, 173, 165]]) m.rect(x0, y0, x1, y1, T.TREE);
  m.prop('erable', 180, 174); m.prop('arbre_automne', 189, 175); m.prop('lanterne', 183, 176); m.prop('lanterne', 186, 176);

  /* ------------------------------------------------------------------ le ruisseau, l'étang */
  // il naît d'une source au nord-ouest, longe le pied de la butte puis tourne vers l'est jusqu'à l'étang aux koï
  const RU = [[166, 155], [165.5, 162], [166, 170], [165.5, 177], [167, 182.5], [172, 183.5], [178, 183], [184, 183.5], [189, 184.5]];
  {
    const p = sinueuse(RU, 2);
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n); m.set(x, y, T.WATER); garde(x, y); }
    }
    clairiere(163, 153, 169, 158); m.blob(166, 155.2, 1.8, 1.3, T.WATER, rng(3));
    m.prop('rocher_grand', 164, 156); m.prop('rocher_grand', 169, 153);
    // l'étang aux koï, entre la descente de la tour et le ravin
    clairiere(186, 182, 195, 188);
    m.blob(192, 185, 3.6, 2, T.WATER, rng(11), [T.GRASS]);
    m.rect(187, 184, 189, 184, T.WATER);
    for (const [x, y] of [[191, 185], [193, 184], [194, 186]]) if (m.get(x, y) === T.WATER) m.deco.push({ k: 'koi', x, y });
    mousse(189, 187, 2, 0.8, 5); mousse(194.5, 183, 1.2, 1, 6);
    m.prop('lanterne', 195, 186); m.prop('erable', 187, 182, true);
  }

  /* ------------------------------------------------------------------ sentiers */
  // le sentier de l'ouest : du pied de la butte jusqu'au petit sanctuaire, en passant le ruisseau sur un pont
  sentier([[168.5, TY + 12], [168.5, 176], [170.5, 181], [171.5, 186]], { seed: 41, w: 5, grass: 0.9 });
  // la descente de la tour : de l'escalier jusqu'au carrefour du sud (pont sur le ruisseau)
  sentier([[DX + 0.5, 179], [DX + 0.5, 186], [DX - 0.5, 191]], { seed: 43, w: 5, grass: 0.6, trees: 0.02 });
  // le sanctuaire de l'ouest et la boucle qui revient au carrefour
  clairiere(166, 185, 176, 191);
  sentier([[172, 189], [177, 191.5], [DX - 0.5, 191]], { seed: 47, w: 5, grass: 1.0 });
  // le ravin : du carrefour à l'allée des torii, entre deux terrasses
  sentier([[DX - 0.5, 191], [194, 191.5], [203, 190], [211, 190.5], [218, 190.5]], { seed: 53, w: 6, grass: 0.8, trees: 0.02 });
  m.rect(219, 190, 219, 191, T.GRASS, [T.TREE, T.TALL]); m.set(219, 190, T.PATH); m.set(219, 191, T.PATH);
  // la petite montée du belvédère (au-dessus du ravin)
  clairiere(197, 183, 204, 187); m.rect(200, 185, 201, 189, T.PATH);
  for (const [x, y] of [[198, 185], [203, 185]]) m.prop('lanterne', x, y);
  m.prop('erable', 197, 183); mousse(198.5, 186.5, 1.2, 0.7, 9); mousse(203.5, 186.5, 1.2, 0.7, 10);
  // le sanctuaire de l'ouest : torii, autel, lanternes, gravier ratissé
  {
    m.rect(168, 186, 174, 190, T.GRASS);
    m.rect(169, 186, 173, 187, T.SAND);
    m.prop('rocher_grand', 169, 186); m.prop('butte', 173, 186, true);
    m.rect(171, 188, 171, 191, T.PATH); m.rect(172, 189, 174, 189, T.PATH);
    m.prop('stele', 171, 186); m.object(171, 186, { use: async (A) => A.say(['Un petit autel, couvert de feuilles rouges.', 'Quelqu\'un y a laissé une offrande de baies encore fraîches.']) });
    m.prop('lanterne', 170, 188); m.prop('lanterne', 172, 188);
    m.prop('torii', 171, 190, false, { dz: 0.95, w: 1 });
    mousse(167.5, 189, 1.4, 1.2, 12); mousse(175, 187, 1.2, 1, 13);
  }
  // le nord-est : du sentier principal au palier, et un jardin d'érables, de mousse et de gravier
  sentier([[259, 170.5], [253, 167], [247.5, 164], [246.5, 160.5]], { seed: 59, w: 5, grass: 0.8 });
  clairiere(239, 153, 250, 162);
  m.rect(246, 155, 247, 162, T.PATH); m.rect(239, 154, 245, 155, T.PATH);
  // (le jardin reste à trois rangées d'arbres de la route 6, qui passe juste au nord : aucun raccourci)
  sentier([[265, 167.5], [264.5, 163], [261, 160], [255, 159.5], [251, 158.5]], { seed: 61, w: 4, grass: 0.7 });
  clairiere(254, 157, 271, 162);
  {
    m.rect(257, 157, 261, 158, T.SAND); m.prop('rocher_grand', 258, 157); m.prop('rocher_grand', 260, 158);
    m.blob(267.5, 159, 2.4, 1.4, T.WATER, rng(17), [T.GRASS]);
    for (const [x, y] of [[267, 159], [266, 160]]) if (m.get(x, y) === T.WATER) m.deco.push({ k: 'koi', x, y });
    mousse(264, 161.6, 1.6, 0.8, 21); mousse(270.5, 161.5, 1, 1, 22); mousse(256.5, 161.5, 1.4, 0.8, 23);
    for (const [x, y] of [[263, 157], [256, 159], [270, 157]]) m.prop('lanterne', x, y);
    m.prop('erable', 271, 160); m.prop('cerisier', 254, 157); m.prop('arbre_automne', 265, 157);
    m.prop('erable', 241, 158); m.prop('arbre_automne', 249, 155); m.prop('lanterne', 244, 157); m.prop('lanterne', 249, 160);
  }

  /* ------------------------------------------------------------------ relief */
  // du plus bas au plus haut : un plateau tient compte des hauteurs déjà posées autour de lui
  plateau(m, rectangle(239, 153, 250, 162), 1);                                            // palier du nord-est
  plateau(m, polygone([[170.6, 153.5], [199.5, 153.5], [199.5, 172], [196, 177.5], [175, 177.5], [170.6, 173]]), 1);   // la butte
  plateau(m, rectangle(197, 183, 204, 187), 1);                                            // belvédère au-dessus du ravin
  plateau(m, rectangle(197, 193, 215, 194), 1, { marches: false });                        // rive sud du ravin
  plateau(m, rectangle(TX - 4, 153, TX + 14, TY + 14), 2);                                 // terrasse haute de la tour
  plateau(m, rectangle(TX + 15, 153, 238, 156), 2);                                         // la corniche
  // marches de l'ouest (terrasse haute → butte → sol) : posées à la main sur les bords est-ouest
  for (const [x, y] of [[TX - 4, TY + 12], [TX - 8, TY + 12]]) m.set(x, y, T.STAIRS);
  // marches restées au milieu d'un même niveau (un plateau plus haut a recouvert le bord d'un plus bas) : du chemin
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number); if (m.get(x, y) !== T.STAIRS) continue;
    const h = m.height(x, y), autour = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => m.get(x + a, y + b) !== T.TREE && m.get(x + a, y + b) !== T.CLIFF);
    if (autour.every(([a, b]) => m.height(x + a, y + b) === h)) m.set(x, y, T.PATH);
  }
  // une ceinture d'arbres sépare toujours la forêt de Floralia et de la route 6, au nord
  for (let x = 160; x <= 275; x++) for (let y = 150; y <= (x >= 251 ? 155 : 152); y++) if (m.zoneAt(x, y)?.route === 'torii' || y >= 152) { if (m.get(x, y) !== T.CLIFF) m.set(x, y, T.TREE); }
  // boucher : les recoins que le relief a isolés redeviennent de la forêt
  boucher(m, cells, [DX, B.doorY + 1]);

  /* ------------------------------------------------------------------ dresseurs, objets, panneaux */
  const t = (id, x, y, dir, cls, name, team, o) => trainerNpc(m, ...spot(m, x, y), dir, cls, name, team, { id: 'cendree:' + id, sight: 4, ...o });
  t('sage', DX - 3, TY + 13, 'right', 'Sage', 'Ignace', [[92, 36], [93, 37], [200, 37]], { intro: 'Le vent passe encore entre les poutres brûlées. Écoute... Il parle de feu.', after: 'La tour n\'a jamais été reconstruite. Certains disent qu\'elle attend quelqu\'un.' });
  t('medium', 210, 155, 'left', 'Médium', 'Cendrine', [[198, 36], [200, 37], [94, 38]], { intro: 'D\'ici, on voit toute la forêt. Et toi, je te voyais venir depuis longtemps.' });
  t('moine', 174, 189, 'left', 'Moine', 'Kōen', [[58, 36], [77, 37], [126, 38]], { intro: 'Ce petit autel est plus vieux que le temple. Respecte-le, et bats-toi bien.' });
  t('kimono', 262, 162, 'left', 'Dame Kimono', 'Momiji', [[196, 37], [197, 37], [38, 38]], { sight: 3, intro: 'Les érables rougissent pour la danse. Danse avec moi !' });
  t('alpiniste', 203, 189, 'right', 'Alpiniste', 'Basile', [[75, 37], [111, 37], [95, 38]], { sight: 5, intro: 'Ce ravin, je le remonte tous les matins. Toi, tu le remontes en combattant !' });
  t('karateka', 181, 174, 'right', 'Karatéka', 'Daigo', [[107, 37], [106, 37], [68, 38]], { sight: 3, intro: 'Ces marches sont mon terrain d\'entraînement !' });
  m.item(...spot(m, TX + 12, TY + 5), 'ultra-ball', 2);
  m.item(...spot(m, 232, 156), 'revive');
  m.item(...spot(m, 202, 184), 'hyper-potion', 2);
  m.item(...spot(m, 167, 189), 'full-heal', 2);
  m.item(...spot(m, 270, 161), 'fire-stone');
  m.item(...spot(m, 168, 170), 'max-repel');
  m.sign(217, 189, 'FORÊT DES TORII\n← Tour Cendrée · Temple Kagura →');
  m.sign(258, 172, 'FORÊT DES TORII\n↑ Jardin des érables · ← Tour Cendrée par la corniche');
  m.zone(TX - 4, 153, TX + 14, TY + 14, { name: 'Tour Cendrée', music: 'forest', theme: 'automne', route: 'torii', prio: 0 });

  /* ------------------------------------------------------------------ l'intérieur */
  const rdc = room('cendree:rdc', 15, 12, { floor: 'cendre', music: 'tower', wall: 'wall_cendre', name: 'Tour Cendrée' });
  const sous = room('cendree:sous-sol', 15, 12, { floor: 'pierre', music: 'mystic', wall: 'wall_cendre', name: 'Tour Cendrée — sous-sol' });
  sous.set(sous.exitX, sous.exitY, T.FLOOR);   // pas de porte au sous-sol
  maps[rdc.id] = rdc; maps[sous.id] = sous;
  rdc.outside = { map: 'monde', x: B.doorX, y: B.doorY + 1, dir: 'down' };
  rdc.warp(rdc.exitX, rdc.exitY, rdc.outside);
  m.warp(B.doorX, B.doorY, { map: rdc.id, x: rdc.exitX, y: rdc.exitY, dir: 'up' });
  sous.outside = rdc.outside;
  // rez-de-chaussée en ruine : plancher troué, poutres tombées, gravats, piliers calcinés
  for (const [x, y] of [[3, 4], [11, 4], [3, 8], [11, 8]]) rdc.prop('pilier_brule', x, y);
  for (const [x, y] of [[5, 6], [6, 6], [9, 9], [2, 6], [13, 7], [8, 3]]) { rdc.under.set(key(x, y), T.FLOOR); rdc.set(x, y, T.BLOCK); rdc.deco.push({ k: 'trou', x, y }); }
  rdc.prop('poutre_brulee', 8, 6, true, { w: 2 }); rdc.set(9, 6, T.BLOCK);
  for (const [x, y] of [[1, 2], [5, 2], [13, 2], [1, 10], [13, 10], [6, 9]]) rdc.prop('gravats', x, y);
  rdc.item(2, 9, 'charcoal');
  rdc.npc({ id: 'cendree:historien', x: 4, y: 7, sprite: 'savant', dir: 'right', text: ['Cette tour était la sœur de la Tour de la Grue, sur son île.', 'Un soir d\'orage, la foudre l\'a frappée. Elle a brûlé trois jours et trois nuits.', 'Depuis, personne n\'ose descendre en bas... Il paraît qu\'on y entend respirer.'] });
  // le trou avec son échelle (vers le sous-sol), et l'échelle qui remonte
  rdc.deco.push({ k: 'echelle', x: 12, y: 3 }); rdc.warp(12, 3, { map: sous.id, x: 2, y: 4, dir: 'down', step: true });
  sous.deco.push({ k: 'echelle_jour', x: 2, y: 3 }); sous.warp(2, 3, { map: rdc.id, x: 12, y: 4, dir: 'down', step: true });
  // sous-sol : piliers de pierre noircis, débris tombés d'en haut ; au centre, la place des trois bêtes
  for (const [x, y] of [[4, 5], [10, 5], [4, 9], [10, 9]]) sous.prop('pilier_brule', x, y);
  for (const [x, y] of [[1, 9], [13, 3], [12, 10], [6, 2]]) sous.prop('gravats', x, y);
  sous.prop('poutre_brulee', 1, 6, true, { w: 2 }); sous.set(2, 6, T.BLOCK);
  sous.item(12, 3, 'rare-candy');
  for (const [x, y] of [[12, 8], [3, 10], [8, 2]]) sous.prop('gravats', x, y);
  rdc.prop('gravats', 3, 10); sous.prop('poutre_brulee', 7, 10, true, { w: 2 }); sous.set(8, 10, T.BLOCK);
  // évènement des trois bêtes (game.js, onEnterMap) : Raikou, Entei, Suicune, et la case où chacun se tient
  sous.betes = [[243, 5, 7], [244, 7, 6], [245, 9, 7]]; sous.betesSortie = [2, 3];
  return { rdc, sous, porte: [B.doorX, B.doorY] };
}
