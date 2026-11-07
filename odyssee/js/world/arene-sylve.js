// odyssee/js/world/arene-sylve.js — l'Arène de Sylvebourg (Insecte, premier badge) : une serre botanique en trois salles.
//
//   Salle 1, l'accueil : grande pièce claire, panneau des règles AU CENTRE (rien ne gêne à l'entrée), deux portes au fond.
//   Salle 2, la Grande Serre : deux demi-serres, une derrière chaque porte. Dans chacune, un bassin d'alvéoles de pollen
//     et un bloc de pollen trop collant pour être poussé à la main. Des souffleries sont posées sur la bordure du bassin ;
//     marcher sur la dalle-interrupteur derrière une soufflerie la met en marche : le premier bloc dans l'axe du souffle
//     glisse tout droit jusqu'à un obstacle (fleur géante, bordure, autre bloc). Un bloc qui passe sur la stèle-alvéole de
//     son côté (contre le mur, à gauche ou à droite) y tombe et l'allume. Les deux stèles allumées, le portail de lianes du
//     dôme s'ouvre. Deux dresseurs guettent les allées du bord : on ne les croise que si l'on va essayer les souffleries
//     qui ne servent à rien (on les évite en résolvant du premier coup). Un pupitre par demi-serre remet les blocs en place.
//   Salle 3, le dôme : salle ronde envahie de plantes, Hector sur l'estrade au fond.
//
// Le plan ci-dessous est la carte, case pour case (25 × 44) ; tools/test-odyssee-arene-sylve.mjs vérifie qu'il se résout.
import { T, DIRS } from './tiles.js';
import { GameMap } from './mapgen.js';

/* légende
   #  mur                         .  sol de la serre                ,  dalle d'alvéoles du bassin (le bloc y glisse)
   H  bordure du bassin           P  fleur géante (butée)          A  bloc de pollen
   < > ^ v  soufflerie (sens du souffle) ; la case derrière elle est sa dalle-interrupteur
   L R  stèle-alvéole gauche / droite        |  portail de lianes du dôme
   p  plante en pot              f  massif de fleurs               g  statue de l'arène
   _  estrade du Champion        w  tapis                          C  le Champion
   s  stèle de pierre (s'allume quand l'alvéole voisine est pleine)
   T  dresseur embusqué          o  objet                          K  pupitre de remise en place
   S  panneau des règles         G  guide                          E  sortie */
export const PLAN = [
  '#########################',
  '#########################',
  '#ffffff.._______..ffffff#',
  '#ffff...p___C___p...ffff#',
  '#ff......_______......ff#',
  '#f..........w..........f#',
  '#.......p...w...p.......#',
  '#....g......w......g....#',
  '#...........w...........#',
  '#f......p...w...p......f#',
  '#ff.........w.........ff#',
  '#ffff.......w.......ffff#',
  '############|############',
  '############|############',
  '#p....f...........f....p#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#p.HHHHvHH.ppp.HHvvHHH.p#',
  '#pTH,,,,,H.fff.H,,,,,HTp#',
  '#p.H,,,A,H.fff.>A,,P,H.p#',
  '#s.HP,,,,H.fff.H,,,,,<.p#',
  '#L.,,,,,,<.fff.H,,,,PH.s#',
  '#s.H,,,,,H.fff.>,,,,,,.R#',
  '#poH,,,,,<.fff.H,,,,,Hos#',
  '#p.>,,,P,H.fff.H,,,,,<.p#',
  '#p.H,,,,,H.fff.>,,,,,H.p#',
  '#p.H^H^HHH.fff.HHHHH^H.p#',
  '#..........fff..........#',
  '#..........fff..........#',
  '#..........fff..........#',
  '#........K.fff.K........#',
  '#######.#########.#######',
  '#######.#########.#######',
  '#p...p...p.....p...p...p#',
  '#.......................#',
  '#.......................#',
  '#...g...............g...#',
  '#.........f.S.f.........#',
  '#.......................#',
  '#.......................#',
  '#...............G.......#',
  '#p.....................p#',
  '############E############',
];
export const W = PLAN[0].length, H = PLAN.length;
const SENS = { '>': 'right', '<': 'left', v: 'down', '^': 'up' };
/** les deux demi-serres (colonnes) : chaque pupitre ne remet en place que la sienne */
export const MOITIES = { g: [1, 10], d: [14, 23] };
export const moitieDe = (x) => (x <= MOITIES.g[1] ? 'g' : x >= MOITIES.d[0] ? 'd' : null);

export const REGLES = [
  'ARÈNE DE SYLVEBOURG — LA GRANDE SERRE\nChampion : Hector, l\'observateur des insectes.',
  'Les blocs de pollen sont bien trop collants pour être poussés à la main.\nSeul un courant d\'air peut les déplacer.',
  'Marche sur la dalle placée derrière une soufflerie : elle souffle, et le premier bloc dans son axe glisse tout droit jusqu\'au premier obstacle.',
  'Fais tomber un bloc dans la stèle-alvéole de chaque côté de la serre : le portail du dôme s\'ouvrira.\nUn pupitre près de chaque porte remet les blocs en place.',
  'Conseil d\'Hector : « Les insectes ralentissent leurs proies avec leurs fils de soie. Un partenaire rapide, ou de type Feu, Vol ou Roche, fera la différence. »',
];

/** lit le plan : souffleries (et leur dalle), stèles, blocs, portail, places des personnages */
export function lirePlan(plan = PLAN) {
  const at = (x, y) => plan[y]?.[x] ?? '#';
  const P = { souffleries: [], steles: [], blocs: [], portail: [], dresseurs: [], objets: [], pupitres: [] };
  for (let y = 0; y < plan.length; y++) for (let x = 0; x < plan[y].length; x++) {
    const c = at(x, y);
    if (SENS[c]) { const [dx, dy] = DIRS[SENS[c]]; P.souffleries.push({ x, y, dir: SENS[c], sx: x - dx, sy: y - dy }); }
    else if (c === 'L' || c === 'R') P.steles.push({ x, y, cote: c === 'L' ? 'gauche' : 'droite' });
    else if (c === 'A') P.blocs.push([x, y]);
    else if (c === '|') P.portail.push([x, y]);
    else if (c === 'T') P.dresseurs.push([x, y]);
    else if (c === 'o') P.objets.push([x, y]);
    else if (c === 'K') P.pupitres.push([x, y]);
    else if (c === 'C') P.champion = [x, y];
    else if (c === 'G') P.guide = [x, y];
    else if (c === 'E') P.sortie = [x, y];
  }
  return P;
}

/**
 * Le souffle d'une soufflerie sur la carte (sans rien modifier) : le premier bloc dans l'axe glisse jusqu'au premier
 * obstacle, ou tombe dans une stèle sur son passage. Renvoie { de, chemin: [[x, y]…], stele } ou null (le souffle se
 * perd : rien dans l'axe avant un obstacle). occupe(x, y) : un personnage se tient là (il arrête le bloc).
 */
export function souffle(m, s, occupe = () => false) {
  const [dx, dy] = DIRS[s.dir], libre = (x, y) => m.get(x, y) === T.FLOOR && !occupe(x, y);
  let x = s.x + dx, y = s.y + dy;
  while (libre(x, y)) { x += dx; y += dy; }
  if (m.get(x, y) !== T.BOULDER || steleEn(m, x, y)) return null;   // un bloc déjà tombé dans sa stèle ne bouge plus
  const de = [x, y], chemin = [];
  for (;;) {
    if (steleEn(m, x, y) && chemin.length) return { de, chemin, stele: steleEn(m, x, y) };
    if (!libre(x + dx, y + dy)) break;
    x += dx; y += dy; chemin.push([x, y]);
  }
  return chemin.length ? { de, chemin, stele: null } : null;
}
export const steleEn = (m, x, y) => (m.serre?.steles || []).find((s) => s.x === x && s.y === y) || null;
/** les stèles sont-elles toutes remplies ? */
export const stelesPleines = (m) => (m.serre?.steles || []).every((s) => m.get(s.x, s.y) === T.BOULDER);

/* ------------------------------------------------------------------------------------------------ construction */
/** construit l'arène : la carte, et ce que region.js y pose (dresseurs, guide, Champion) */
export function areneSylve(id, name) {
  const P = lirePlan();
  const m = new GameMap(id, W, H, { outdoor: false, fill: T.FLOOR, floor: 'serre', music: 'gym', name, battleBg: 'gym', wallStyle: 'wall_serre' });
  m.gymLock = 0; m.arene = 'bug'; m.cloisons = true; m.bloc = 'bloc_pollen';
  m.serre = { souffleries: P.souffleries, steles: P.steles, portail: P.portail };
  const props = { H: 'jardiniere', P: 'fleur_geante', p: 'plant', f: 'massif', g: 'gymstatue' };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = PLAN[y][x];
    m.set(x, y, c === '#' ? T.WALL : T.FLOOR);
    // ce qui est posé dans le bassin garde ses alvéoles dessous
    const sol = c === 'P' ? 'pollen' : undefined;
    if (props[c]) m.prop(props[c], x, y, true, sol ? { sol } : {});
    else if (c === 's') { const st = P.steles.find((q) => Math.abs(q.x - x) + Math.abs(q.y - y) === 1); m.prop('stele_serre', x, y, true, { allume: st && [st.x, st.y] }); }
    else if (SENS[c]) m.prop('soufflerie', x, y, true, { dir: SENS[c] });
    else if (c === ',') m.deco.push({ k: 'pollen', x, y });
    else if (c === 'A') { m.deco.push({ k: 'pollen', x, y }); m.set(x, y, T.BOULDER); }
    else if (c === 'L' || c === 'R') m.deco.push({ k: 'alveole', x, y });
    else if (c === '|') { m.deco.push({ k: 'lianes', x, y }); m.set(x, y, T.BLOCK); }
    else if (c === '_' || c === 'C') m.deco.push({ k: 'estrade', x, y });
    else if (c === 'w') m.deco.push({ k: 'tapis', x, y });
    else if (c === 'E') { m.set(x, y, T.MAT); m.exitX = x; m.exitY = y; }
  }
  // dalles-interrupteurs, derrière chaque soufflerie
  P.souffleries.forEach((s, i) => { m.deco.push({ k: 'interrupteur', x: s.sx, y: s.sy, dir: s.dir }); m.object(s.sx, s.sy, { type: 'souffle', i }); });
  // pupitres de remise en place (un par demi-serre)
  for (const [x, y] of P.pupitres) {
    m.prop('pupitre', x, y, true);
    m.object(x, y, { type: 'pupitre', moitie: moitieDe(x), use: (A, o) => A.game.pupitreSerre(o.moitie) });
  }
  // panneau des règles au milieu de l'accueil
  const [sx, sy] = PLAN.reduce((r, row, y) => (row.indexOf('S') >= 0 ? [row.indexOf('S'), y] : r), null);
  m.sign(sx, sy, REGLES);
  // objets dans les allées gardées : une Potion à gauche, un Anti-Para à droite (utile contre Couverdure)
  const [o1, o2] = P.objets.sort((a, b) => a[0] - b[0]);
  m.item(o1[0], o1[1], 'potion', 1, `${id}:potion`); m.item(o2[0], o2[1], 'paralyze-heal', 1, `${id}:antipara`);
  const [d1, d2] = P.dresseurs.sort((a, b) => a[0] - b[0]);
  return {
    map: m, leader: P.champion, guide: P.guide, quiz: [], spots: [],
    // dresseurs optionnels (niveaux 12 à 14), tournés vers l'allée qu'ils gardent
    dresseurs: [
      { x: d1[0], y: d1[1], dir: 'down', cls: 'Insectomane', name: 'Lucas', team: [[13, 12], [265, 12], [1017, 13]], sight: 6,
        intro: 'Chut ! Tu vas effrayer mes insectes... Trop tard : combat !', after: 'Une fleur géante arrête un bloc net. Sers-t\'en comme d\'une butée !',
        gift: ['oran-berry', 2] },
      { x: d2[0], y: d2[1], dir: 'down', cls: 'Jardinière', name: 'Capucine', ow: 'randonneuse', team: [[540, 13], [401, 13], [1018, 14]], sight: 6,
        intro: 'Ne piétine pas mes alvéoles ! Mes Pokémon vont t\'apprendre les bonnes manières !', after: 'Parfois, un bloc doit faire un détour avant d\'arriver au bon endroit.',
        gift: ['potion', 2] },
    ],
  };
}
