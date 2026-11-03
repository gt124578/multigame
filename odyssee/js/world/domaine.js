// odyssee/js/world/domaine.js — le Domaine : un grand terrain derrière la maison de Bourg-Aube, acheté grâce à l'aimant
// du frigo, où le joueur bâtit son propre coin (chemins, jardin, arbres, maisons, Centre, boutique, habitants…).
// Sans DOM : la carte vierge, le catalogue des constructions et la reconstruction à partir de la liste des travaux
// (state.domaine.ops, au format des retouches de l'éditeur : voir world/retouches.js).
import { T } from './tiles.js';
import { GameMap } from './mapgen.js';
import { applyOps } from './retouches.js';

export const DOMAINE = 'domaine';
export const DOMAINE_W = 64, DOMAINE_H = 48;
export const PRIX_TERRAIN = 10000;
// la porte du jardin, dans la maison de Bourg-Aube (et la case où l'on arrive en revenant)
export const PORTE_MAISON = { map: 'aube:maison', x: 7, y: 6, arrivee: [6, 6] };
export const ENTREE = { x: 32, y: 46, arrivee: [32, 44] };

/** le catalogue : catégorie, nom, prix, et ce que pose l'élément (terrain, décor, bâtiment, habitant) */
export const CATALOGUE = [
  { cat: 'Sols', id: 'chemin', nom: 'Chemin de terre', prix: 20, t: T.PATH },
  { cat: 'Sols', id: 'paves', nom: 'Pavés', prix: 40, t: T.PAVE },
  { cat: 'Sols', id: 'sable', nom: 'Sable', prix: 30, t: T.SAND },
  { cat: 'Sols', id: 'herbe', nom: 'Herbe (remet à zéro)', prix: 0, t: T.GRASS },
  { cat: 'Jardin', id: 'fleurs', nom: 'Massif de fleurs', prix: 60, t: T.FLOWER },
  { cat: 'Jardin', id: 'hautes', nom: 'Hautes herbes (Pokémon sauvages)', prix: 50, t: T.TALL },
  { cat: 'Jardin', id: 'eau', nom: 'Bassin (eau)', prix: 120, t: T.WATER },
  { cat: 'Jardin', id: 'pont', nom: 'Pont de bois', prix: 150, t: T.BRIDGE },
  { cat: 'Jardin', id: 'arbre', nom: 'Arbre', prix: 150, t: T.TREE },
  { cat: 'Jardin', id: 'sapin', nom: 'Sapin', prix: 150, t: T.PINE },
  { cat: 'Jardin', id: 'buisson', nom: 'Buisson', prix: 80, t: T.BUSH },
  { cat: 'Jardin', id: 'rocher', nom: 'Rocher', prix: 100, t: T.ROCK },
  { cat: 'Jardin', id: 'cloture', nom: 'Clôture', prix: 40, t: T.FENCE },
  { cat: 'Décor', id: 'lamp', nom: 'Lampadaire', prix: 300, p: 'lamp' },
  { cat: 'Décor', id: 'banc', nom: 'Banc', prix: 250, p: 'banc' },
  { cat: 'Décor', id: 'pot', nom: 'Pot de fleurs', prix: 100, p: 'pot' },
  { cat: 'Décor', id: 'fontaine', nom: 'Fontaine', prix: 3000, p: 'fontaine' },
  { cat: 'Décor', id: 'statue', nom: 'Statue', prix: 2000, p: 'gymstatue' },
  { cat: 'Décor', id: 'lanterne', nom: 'Lanterne', prix: 400, p: 'lanterne' },
  { cat: 'Décor', id: 'parasol', nom: 'Parasol', prix: 350, p: 'parasol' },
  { cat: 'Décor', id: 'tonneau', nom: 'Tonneau', prix: 120, p: 'tonneau' },
  { cat: 'Décor', id: 'caisse', nom: 'Caisse', prix: 100, p: 'caisse' },
  { cat: 'Décor', id: 'torii', nom: 'Portique torii', prix: 5000, p: 'torii' },
  { cat: 'Décor', id: 'panneau', nom: 'Panneau', prix: 150, s: true },
  { cat: 'Bâtiments', id: 'house', nom: 'Maison', prix: 15000, b: 'house', taille: [4, 3] },
  { cat: 'Bâtiments', id: 'house2', nom: 'Grande maison', prix: 25000, b: 'house2', taille: [5, 3] },
  { cat: 'Bâtiments', id: 'bighouse', nom: 'Résidence', prix: 40000, b: 'bighouse', taille: [6, 4] },
  { cat: 'Bâtiments', id: 'center', nom: 'Centre de soins', prix: 50000, b: 'center', taille: [5, 4] },
  { cat: 'Bâtiments', id: 'mart', nom: 'Boutique', prix: 40000, b: 'mart', taille: [4, 4] },
  { cat: 'Habitants', id: 'habitant', nom: 'Inviter un habitant', prix: 5000, n: true },
];
export const ARTICLE = Object.fromEntries(CATALOGUE.map((c) => [c.id, c]));
export const TOITS = ['red', 'blue', 'green', 'brown', 'gray', 'teal', 'purple', 'orange'];
export const HABITANTS = ['habitant', 'habitante', 'vieil_homme', 'dame', 'gamin', 'fillette', 'enfant', 'pecheur', 'jardinier', 'montagnard', 'randonneuse', 'marin', 'scientifique', 'kimono', 'karateka', 'insectomane'];
const PAROLES = [
  'Quel joli coin ! Merci de m\'avoir invité.', 'Ici, on se sent comme à la maison.', 'J\'adore me promener dans ton jardin.',
  'Tu as l\'œil pour la décoration, dis donc !', 'Il fait bon vivre dans ton domaine.', 'Un jour, ce sera la plus belle ville de la région !',
];
export const parole = (i) => PAROLES[Math.abs(i) % PAROLES.length];

/** la carte vierge : une grande prairie bordée d'arbres, l'entrée en bas, le panneau et l'architecte */
export function domaineVierge(nom = 'Ton Domaine') {
  const m = new GameMap(DOMAINE, DOMAINE_W, DOMAINE_H, { fill: T.GRASS, name: nom, music: 'town' });
  m.rect(0, 0, DOMAINE_W - 1, 1, T.TREE); m.rect(0, DOMAINE_H - 2, DOMAINE_W - 1, DOMAINE_H - 1, T.TREE);
  m.rect(0, 0, 1, DOMAINE_H - 1, T.TREE); m.rect(DOMAINE_W - 2, 0, DOMAINE_W - 1, DOMAINE_H - 1, T.TREE);
  m.rect(ENTREE.x, ENTREE.y - 1, ENTREE.x, DOMAINE_H - 1, T.PATH);
  m.warp(ENTREE.x, ENTREE.y, { map: PORTE_MAISON.map, x: PORTE_MAISON.arrivee[0], y: PORTE_MAISON.arrivee[1], dir: 'left' });
  m.warp(ENTREE.x, ENTREE.y + 1, { map: PORTE_MAISON.map, x: PORTE_MAISON.arrivee[0], y: PORTE_MAISON.arrivee[1], dir: 'left' });
  m.sign(ENTREE.x - 2, ENTREE.y - 2, `${nom.toUpperCase()}\nTon terrain : bâtis-y ta ville !\nParle à l'architecte pour construire.`);
  m.npc({ id: 'domaine:architecte', x: ENTREE.x + 2, y: ENTREE.y - 2, sprite: 'topdresseur', dir: 'down', move: 'turn', script: 'architecte' });
  m.zone(0, 0, DOMAINE_W - 1, DOMAINE_H - 1, { name: nom, music: 'town', enc: [[16, 3, 7, 25], [19, 3, 7, 25], [10, 3, 6, 15], [13, 3, 6, 15], [161, 3, 7, 10], [263, 3, 7, 10]] });
  return m;
}
/** cases interdites : la bordure, l'allée d'entrée, le panneau et l'architecte */
export function caseLibre(x, y) {
  if (x < 2 || y < 2 || x > DOMAINE_W - 3 || y > DOMAINE_H - 3) return false;
  if (x === ENTREE.x && y >= ENTREE.y - 1) return false;
  if ((x === ENTREE.x - 2 || x === ENTREE.x + 2) && y === ENTREE.y - 2) return false;
  return true;
}
/** l'opération (format des retouches) qui pose un article sur une case */
export function opPour(art, x, y, o = {}) {
  if (art.t != null) return ['t', x, y, art.t];
  if (art.p) return ['p', art.p, x, y];
  if (art.s) return ['s', x, y, o.texte || 'PANNEAU'];
  if (art.b) return ['b', art.b, x, y, o.toit || 'red', o.nom || art.nom];
  if (art.n) return ['n', { id: `domaine:hab${o.k || 0}`, x, y, sprite: o.sprite || 'habitant', dir: 'down', text: [o.texte || parole(o.k || 0)] }];
  return null;
}
/** les cases que couvre un travail (un bâtiment couvre toute son emprise et la case devant sa porte) */
export function emprise(trav) {
  const art = ARTICLE[trav.a], { x, y } = trav;
  if (art?.b) { const [w, h] = art.taille; const out = []; for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]); return out; }
  return [[x, y]];
}
/** peut-on poser cet article ici ? (dans le terrain, sans chevaucher un bâtiment ni bloquer l'entrée) */
export function posable(trav, travaux, art = ARTICLE[trav.a]) {
  const cases = emprise({ ...trav, a: art.id });
  if (!cases.every(([x, y]) => caseLibre(x, y))) return false;
  const occ = new Set();
  for (const t of travaux) if (ARTICLE[t.a]?.b) for (const [x, y] of emprise(t)) occ.add(x + ',' + y);
  if (cases.some(([x, y]) => occ.has(x + ',' + y))) return false;
  if (art.b) { const pris = new Set(travaux.filter((t) => !ARTICLE[t.a]?.t && !ARTICLE[t.a]?.b).map((t) => t.x + ',' + t.y)); if (cases.some(([x, y]) => pris.has(x + ',' + y))) return false; }
  return true;
}
/** reconstruit le Domaine : la carte vierge, puis chaque travail dans l'ordre ; renvoie la carte (et ses intérieurs dans maps) */
export function batirDomaine(maps, domaine) {
  for (const id of Object.keys(maps)) if (id.startsWith(DOMAINE + ':')) delete maps[id];
  const m = domaineVierge(domaine?.nom);
  const ops = [];
  for (const t of domaine?.travaux || []) { const art = ARTICLE[t.a]; const op = art && opPour(art, t.x, t.y, t); if (op) ops.push(op); }
  applyOps(m, ops, maps);
  maps[DOMAINE] = m;
  return m;
}
