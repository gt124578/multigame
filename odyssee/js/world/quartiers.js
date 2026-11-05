// odyssee/js/world/quartiers.js — les villes agrandies, façon HeartGold / SoulSilver en plus grand : l'ancienne ville devient
// le centre (ses bâtiments, ses habitants, ses identifiants ne bougent pas), et tout autour poussent des quartiers.
//
// Une ville n'est pas un carré : son contour suit le terrain (lisière de forêt qui avance et recule, côte et plage, berges
// d'une rivière qui la traverse), elle a ses niveaux (une ville haute sur une colline, où l'on monte par des escaliers),
// ses rues tracées (chaussées asphaltées et trottoirs dans les grandes villes, rues de terre battue dans les villages),
// ses îlots de maisons avec jardin, clôture, haie, potager et verger, sa place centrale et son monument, son marché, ses
// parcs, ses bâtiments remarquables (auberge, boulangerie, chapelle, mairie, gare, maison de thé, moulin, phare) et des
// quartiers propres à son thème (port, carrière, jardin zen, oasis, usines, champs de fleurs…). Les espaces restés vides
// sont comblés (squares, bosquets), et tout reste relié (vérifié à la fin : rien d'isolé, aucune porte fermée).
//
// grandeVille(W, maps, def, V, outils) — def : la ville d'avant (centre), V : la grande ville (plan.js) :
//   x, y, w, h       rectangle de la ville (cases) ; cx, cy : coin du centre dans ce rectangle
//   sorties          [{ dir: 'n'|'s'|'e'|'w', k, garde: id du garde du centre à poster là, coupe: true }]
//   theme            voix, décor et forme (THEMES ci-dessous) ; sol, rue : sols ; mer : côté ouvert sur la mer ('n', 's'…)
//   quartiers        poids des sortes de quartier { maisons, parc, place, marche, jardins, ferme, affaires… }
//   graine           tirages
import { T, walkable } from './tiles.js';
import { rng } from './mapgen.js';
import { plateau } from './relief.js';
import { GENERAL, VILLES, ETALS } from './voix.js';

const TOITS = ['red', 'blue', 'green', 'brown', 'teal', 'orange', 'purple', 'gray'];
const SPRITES = ['habitante', 'habitant', 'vieil_homme', 'dame', 'gamin', 'fillette', 'enfant', 'topdresseur', 'topdresseuse', 'scientifique', 'randonneuse', 'montagnard', 'pecheur', 'jardinier'];
/** maisons visitables : sorte, largeur, profondeur, réglages du modèle */
const MAISONS = [
  { kind: 'house', w: 4, d: 3 }, { kind: 'house2', w: 5, d: 3 }, { kind: 'house', w: 4, d: 3 }, { kind: 'bighouse', w: 6, d: 4 },
  { kind: 'house2', w: 5, d: 3 }, { kind: 'house', w: 5, d: 5, door: 1, modele: 'chalet' }, { kind: 'house', w: 7, d: 4, door: 1, modele: 'maisonExt' },
  { kind: 'house', w: 5, d: 5, door: 3, modele: 'maisonL' }, { kind: 'house', w: 4, d: 4, door: 1, modele: 'maisonHaute' },
];
const CHALETS = [{ kind: 'house', w: 5, d: 5, door: 1, modele: 'chalet' }, { kind: 'house', w: 5, d: 5, door: 1, modele: 'chalet' }, { kind: 'house', w: 4, d: 3 }, { kind: 'house', w: 7, d: 4, door: 1, modele: 'maisonExt' }];
/** bâtiments remarquables (modèles 3D), visitables */
const REPERES = {
  auberge: { kind: 'bighouse', w: 6, d: 5, door: 2, modele: 'auberge', name: 'Auberge', sprite: 'dame', text: ['Bienvenue à l\'auberge ! Les voyageurs s\'y reposent avant de reprendre la route.', 'On raconte de drôles d\'histoires au coin du feu, le soir.'] },
  boulangerie: { kind: 'house', w: 4, d: 4, door: 1, modele: 'boulangerie', name: 'Boulangerie', sprite: 'habitante', text: ['Le pain sort du four à l\'aube. Mon Chartor surveille la cuisson !', 'Les dresseurs pressés prennent un croissant pour la route.'] },
  chapelle: { kind: 'bighouse', w: 4, d: 7, door: 1, modele: 'chapelle', name: 'Chapelle', sprite: 'vieil_homme', text: ['Une chapelle très ancienne. Les pierres du fond seraient plus vieilles que la ville elle-même.', 'Le silence ici fait du bien, n\'est-ce pas ?'] },
  mairie: { kind: 'bighouse', w: 9, d: 5, door: 4, modele: 'mairie', name: 'Mairie', sprite: 'scientifique', text: ['La mairie est ouverte à tous. Le maire aime qu\'on lui parle des routes qui mènent à la ville.', 'Les plans de la ville sont affichés au mur : elle a beaucoup grandi.'] },
  gare: { kind: 'bighouse', w: 8, d: 4, door: 3, modele: 'gare', name: 'Gare', sprite: 'habitant', text: ['Les trains ne circulent plus depuis l\'éboulement de la ligne.', 'Un jour, ils relieront toutes les villes de la région. En attendant… on marche !'] },
  the: { kind: 'house', w: 5, d: 5, door: 2, modele: 'maisonThe', name: 'Maison de thé', sprite: 'kimono', text: ['Un thé au jasmin ? Il éclaircit l\'esprit avant un combat.', 'Le jardin de pierres se ratisse chaque matin, à la main.'] },
};
/** décor bâti sans porte : [largeur, profondeur, hauteur] */
const DECORS = { moulin: [4, 4, 6], grange: [6, 5, 4], phare: [3, 3, 8], cabanePecheur: [5, 4, 3], puits: [2, 2, 2], kiosque: [4, 5, 3], fontaine: [3, 3, 2], etal: [2, 2, 2], cabaneChasseur: [4, 3, 3] };

/**
 * Identité de chaque ville. style : 'ville' (chaussées asphaltées et trottoirs, îlots de pelouse) ou 'village' (rues de
 * terre battue) ; riviere : 'ns' | 'ew' (une rivière la traverse, ponts sur les rues) ; colline : nombre de niveaux de
 * la ville haute (roche : falaise de pierre au lieu d'un talus d'herbe) ; reperes : bâtiments remarquables ; decor :
 * décor bâti ; q : quartiers en plus de ceux de plan.js ; amp : amplitude de la lisière ; maisons : 'chalet' (bois).
 */
const THEMES = {
  aube: { riviere: 'ns', q: { ferme: 2, verger: 1, jardins: 1 }, reperes: ['boulangerie'], decor: ['moulin'], amp: 9 },
  sylve: { riviere: 'ew', colline: 1, maisons: 'chalet', reperes: ['auberge', 'chapelle'], decor: ['cabaneChasseur'], q: { verger: 1, bosquet: 2 }, amp: 12 },
  pierre: { colline: 2, roche: true, reperes: ['auberge', 'boulangerie'], decor: ['puits'], q: { carriere: 2 }, amp: 8 },
  azur: { riviere: 'ns', reperes: ['auberge', 'boulangerie'], decor: ['phare', 'cabanePecheur'], q: { verger: 0 }, amp: 7 },
  volta: { style: 'ville', reperes: ['gare', 'mairie'], q: { centrale: 1 }, amp: 5 },
  flora: { riviere: 'ns', colline: 1, reperes: ['boulangerie', 'chapelle'], decor: ['moulin'], q: { jardins: 2, verger: 1, fleurs: 3 }, amp: 11 },
  mirage: { colline: 1, reperes: ['the', 'the'], q: { zen: 3 }, amp: 10 },
  granit: { colline: 1, roche: true, reperes: ['auberge'], decor: ['phare'], q: { carriere: 1 }, amp: 7 },
  cendre: { colline: 1, roche: true, reperes: ['auberge'], q: { carriere: 1 }, amp: 8 },
  ecaille: { colline: 1, reperes: ['auberge', 'mairie'], decor: ['phare'], q: { verger: 1 }, amp: 8 },
  cime: { colline: 2, roche: true, reperes: ['chapelle', 'auberge'], q: { zen: 1 }, amp: 9 },
  plateau: { amp: 0 },
  metro: { style: 'ville', reperes: ['gare', 'mairie'], q: {}, amp: 4 },
  lisiere: { colline: 1, roche: true, reperes: ['auberge', 'boulangerie'], decor: ['phare', 'cabanePecheur'], q: {}, amp: 8 },
  marais: { riviere: 'ew', reperes: ['auberge'], decor: ['cabanePecheur'], q: { etang: 2 }, amp: 12 },
  dunes: { reperes: ['auberge'], q: { oasis: 2 }, amp: 9 },
  forge: { style: 'ville', reperes: ['gare'], q: { usine: 3 }, amp: 5 },
  rose: { riviere: 'ns', reperes: ['chapelle', 'boulangerie'], decor: ['moulin'], q: { fleurs: 2, jardins: 1 }, amp: 10 },
  ombre: { colline: 1, reperes: ['chapelle'], q: { bosquet: 1, zen: 1 }, amp: 11 },
};
/** noms de rues (panneaux aux carrefours) */
const RUES = ['Rue des Tilleuls', 'Rue du Moulin', 'Allée des Roucool', 'Rue de la Fontaine', 'Avenue des Dresseurs', 'Rue des Baies', 'Rue du Vieux Puits', 'Rue des Lilas', 'Rue Haute', 'Rue Basse', 'Rue des Artisans', 'Chemin des Écoliers', 'Rue du Marché', 'Rue des Pêcheurs', 'Rue des Glycines', 'Avenue du Champion', 'Rue des Lampions', 'Rue des Jardins', 'Rue de l\'Étang', 'Rue Pierre-Lune', 'Rue des Potiers', 'Impasse des Chats', 'Rue des Saules', 'Rue du Pont'];

function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
/** bruit lisse dans [0, 1] (valeurs sur une grille de s cases, interpolées) */
export function bruit(x, y, s, g) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, g), b = hash(ix + 1, iy, g), c = hash(ix, iy + 1, g), d = hash(ix + 1, iy + 1, g);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

export function grandeVille(W, maps, def, V, { buildTown, poserBatiment }) {
  const graine = V.graine || (V.x * 131 + V.y * 71 + 7);
  const r = rng(graine);
  const pick = (L) => L[Math.floor(r() * L.length)];
  const TH = THEMES[V.theme] || {};
  const X = V.x, Y = V.y, w = V.w, h = V.h, X1 = X + w - 1, Y1 = Y + h - 1;
  const ville = (TH.style || (V.releve ? 'ville' : 'village')) === 'ville';
  const sol = V.sol ?? def.ground ?? T.GRASS, rue = V.rue ?? (ville || sol === T.PAVE ? T.PAVE : T.PATH);
  const ep = V.bord ?? 3;
  const arbresV = V.arbres || ['erable', 'cerisier'];
  def.x = X + V.cx; def.y = Y + V.cy; def.fermer = false; def.ville = { x: X, y: Y, w, h };
  const voix = [...(VILLES[V.theme] || []), ...(VILLES[V.theme] || []), ...GENERAL];
  let nv = Math.floor(r() * voix.length);
  const parole = () => voix[nv++ % voix.length];
  const C = { x0: def.x, y0: def.y, x1: def.x + def.w - 1, y1: def.y + def.h - 1 };
  const R = { x0: C.x0 - 2, y0: C.y0 - 2, x1: C.x1 + 2, y1: C.y1 + 2 };   // le centre et son boulevard
  const dansR = (x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;
  const at = (x, y) => (y - Y) * w + (x - X);
  const dansRect = (x, y) => x >= X && y >= Y && x <= X1 && y <= Y1;

  /* 1. le contour : la lisière avance et recule (bruit), la côte ondule, le centre et les portes restent dedans */
  const M = new Uint8Array(w * h);        // 1 : dans la ville
  const riv = new Uint8Array(w * h);      // 1 : la rivière
  const amp = V.organique === false ? Math.min(4, TH.amp ?? 4) : (TH.amp ?? 8);
  const marge = (x, y) => ep + 1 + Math.round(amp * bruit(x, y, 19, graine) + 3 * bruit(x, y, 7, graine + 1) * (amp > 2 ? 1 : 0));
  const mer = V.mer || '';
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
    const dn = y - Y, ds = Y1 - y, dw = x - X, de = X1 - x, d = Math.min(dn, ds, dw, de);
    const cote = d === dn ? 'n' : d === ds ? 's' : d === dw ? 'w' : 'e';
    if (mer.includes(cote)) {
      const lim = ep + 5 + Math.round(7 * bruit(x, y, 15, graine + 2));
      if (d < lim) { W.set(x, y, V.digue && d === 0 ? T.ROCK : T.WATER); continue; }
      M[at(x, y)] = 1; W.set(x, y, d < lim + 3 && !dansR(x, y) ? T.SAND : sol); continue;
    }
    const proche = x >= R.x0 - 5 && x <= R.x1 + 5 && y >= R.y0 - 5 && y <= R.y1 + 5;
    if (d >= ep && (proche || d >= marge(x, y))) { M[at(x, y)] = 1; W.set(x, y, sol); }
    else W.set(x, y, T.TREE);
  }
  const dans = (x, y) => dansRect(x, y) && M[at(x, y)] === 1;
  W.zone(X, Y, X1, Y1, { name: def.name, music: def.music || 'town', town: def.id, theme: def.theme });

  /* 2. les portes : un couloir de la lisière jusque dans la ville ; le garde à côté du couloir */
  const sorties = [], rues = new Set();   // les cases de rue (index de la ville) : on n'y bâtit rien
  const posRue = (x, y, t = rue) => { if (!dansRect(x, y)) return; if (riv[at(x, y)] || W.get(x, y) === T.WATER) W.set(x, y, T.BRIDGE); else W.set(x, y, t); rues.add(at(x, y)); M[at(x, y)] = 1; };
  for (const s of V.sorties || []) {
    const { dir, k } = s, cells = [], ext = [];
    for (let i = 0; i < 60; i++) {
      let fini = i >= ep + 4;
      for (const j of [0, 1]) {
        const [x, y] = dir === 'n' ? [X + k + j, Y + i] : dir === 's' ? [X + k + j, Y1 - i] : dir === 'w' ? [X + i, Y + k + j] : [X1 - i, Y + k + j];
        if (i >= ep + 4 && !(i > 1 && dans(x, y) && W.get(x, y) !== T.TREE)) fini = false;
        posRue(x, y); cells.push([x, y]);
      }
      if (fini && i > ep + 6) break;
    }
    for (const j of [0, 1]) ext.push(dir === 'n' ? [X + k + j, Y - 1] : dir === 's' ? [X + k + j, Y1 + 1] : dir === 'w' ? [X - 1, Y + k + j] : [X1 + 1, Y + k + j]);
    // la rangée gardée (dans la ceinture) et la case du garde (juste à l'intérieur)
    const g = ep - 1, tiles = [0, 1].map((j) => dir === 'n' ? [X + k + j, Y + g] : dir === 's' ? [X + k + j, Y1 - g] : dir === 'w' ? [X + g, Y + k + j] : [X1 - g, Y + k + j]);
    const poste = dir === 'n' ? [X + k + 2, Y + ep] : dir === 's' ? [X + k + 2, Y1 - ep] : dir === 'w' ? [X + ep, Y + k + 2] : [X1 - ep, Y + k + 2];
    W.set(poste[0], poste[1], rue); rues.add(at(...poste));
    const S = { ...s, cells, ext, tiles, poste, entree: ext[0], interieur: cells[cells.length - 2] };
    sorties.push(S);
    if (s.coupe) for (const [x, y] of tiles) W.set(x, y, T.CUT);
    if (s.garde) {
      const n = (def.npcs || []).find((q) => q.id === s.garde);
      if (n) {
        n.x = poste[0] - def.x; n.y = poste[1] - def.y; n.dir = { n: 'down', s: 'up', w: 'right', e: 'left' }[dir];
        if (n.gate) n.gate = { ...n.gate, tiles: tiles.map(([x, y]) => [x - def.x, y - def.y]) };
      }
    }
  }
  def.sorties = sorties;
  for (const d of def.deco || []) if (d[0] === 'cut') d[0] = 'flowers_cut';
  def.deco = (def.deco || []).filter((d) => d[0] !== 'flowers_cut');

  /* 3. la rivière : elle sort de la forêt, passe à côté du centre, repart dans la forêt ; ponts là où passent les rues */
  if (TH.riviere && !V.pasRiviere) {
    const ns = TH.riviere === 'ns', L = ns ? h : w, Lt = ns ? w : h;
    // côté du centre le plus large
    const c0 = ns ? R.x0 - X : R.y0 - Y, c1 = ns ? X1 - R.x1 : Y1 - R.y1;
    const pos = c0 > c1 ? Math.max(ep + 8, Math.round(c0 * 0.55)) : Lt - Math.max(ep + 8, Math.round(c1 * 0.55));
    const ph = r() * 6, a1 = 4 + r() * 4;
    for (let u = ep; u < L - ep; u++) {
      const c = pos + a1 * Math.sin(u * 0.045 + ph) + 2 * Math.sin(u * 0.13 + 2 * ph), lg = 1.6 + 0.9 * Math.sin(u * 0.07 + ph);
      for (let v = Math.floor(c - lg); v <= Math.ceil(c + lg); v++) {
        const x = ns ? X + v : X + u, y = ns ? Y + u : Y + v;
        if (!dansRect(x, y) || dansR(x, y) || x < X + ep || y < Y + ep || x > X1 - ep || y > Y1 - ep) continue;
        if (Math.abs(v - c) > lg + 0.2) continue;
        if (rues.has(at(x, y))) { W.set(x, y, T.BRIDGE); continue; }
        if (W.get(x, y) === T.WATER) continue;
        riv[at(x, y)] = 1; W.set(x, y, T.WATER);
      }
    }
  }

  /* 4. le centre (l'ancienne ville) */
  buildTown(W, maps, def);

  /* 5. les rues : boulevard autour du centre, rues en grille irrégulière (larges chaussées en ville), avenues des portes */
  const libreRue = (x, y) => { if (!dans(x, y) || dansR(x, y)) return false; const t = W.get(x, y); return t === T.TREE || t === sol || t === T.GRASS || t === T.FLOWER || t === T.SAND || t === T.PAVE || t === T.PATH || (t === T.WATER && riv[at(x, y)]) || t === T.BRIDGE; };
  const posee = (x, y, t = rue) => { if (libreRue(x, y)) posRue(x, y, t); };
  for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (x < C.x0 || x > C.x1 || y < C.y0 || y > C.y1) { const t = W.get(x, y); if (t === T.TREE || t === sol || t === T.GRASS || t === T.FLOWER || t === T.SAND) { W.set(x, y, rue); rues.add(at(x, y)); } else if (t === T.WATER) { W.set(x, y, T.BRIDGE); rues.add(at(x, y)); } }
  const RW = ville ? 4 : 2;   // largeur d'une rue (en ville : trottoir, deux voies, trottoir)
  const lignes = (a, b, pas0, pas1, evite0, evite1) => {
    const out = []; let v = a + 10 + Math.floor(r() * 6);
    while (v < b - 10) {
      out.push(v);
      v += pas0 + Math.floor(r() * (pas1 - pas0 + 1));
    }
    return out;
  };
  const ib = ep + 1;
  const xs = lignes(X + ib, X1 - ib, V.pasX?.[0] ?? (ville ? 22 : 20), V.pasX?.[1] ?? (ville ? 30 : 28), R.x0, R.x1);
  const ys = lignes(Y + ib, Y1 - ib, V.pasY?.[0] ?? (ville ? 18 : 16), V.pasY?.[1] ?? (ville ? 24 : 22), R.y0, R.y1);
  // tronçons sautés : de plus grands îlots, des rues qui s'arrêtent (jamais tout un côté)
  const saute = new Set();
  const asph = new Map();   // case de chaussée → marquage
  for (const x of xs) for (let y = Y + ib; y <= Y1 - ib; y++) {
    if (dansR(x, y) || dansR(x + RW - 1, y) || (y >= R.y0 - 1 && y <= R.y1 + 1 && x > R.x0 - 9 - RW && x < R.x1 + 9)) continue;
    const seg = 'v' + x + ',' + ys.filter((q) => q < y).length;
    if (!saute.has(seg + '?')) { saute.add(seg + '?'); if (r() < 0.16) saute.add(seg); }
    if (saute.has(seg)) continue;
    for (let i = 0; i < RW; i++) posee(x + i, y);
    if (ville && dans(x + 1, y) && dans(x + 2, y)) { asph.set(at(x + 1, y), 'e'); asph.set(at(x + 2, y), 'w'); }
  }
  for (const y of ys) for (let x = X + ib; x <= X1 - ib; x++) {
    if (dansR(x, y) || dansR(x, y + RW - 1) || (x >= R.x0 - 1 && x <= R.x1 + 1 && y > R.y0 - 9 - RW && y < R.y1 + 9)) continue;
    const seg = 'h' + y + ',' + xs.filter((q) => q < x).length;
    if (!saute.has(seg + '?')) { saute.add(seg + '?'); if (r() < 0.16) saute.add(seg); }
    if (saute.has(seg)) continue;
    for (let i = 0; i < RW; i++) posee(x, y + i);
    if (ville && dans(x, y + 1) && dans(x, y + 2)) {
      for (const [yy, m] of [[y + 1, 's'], [y + 2, 'n']]) { const k = at(x, yy), p = asph.get(k); asph.set(k, p && p !== 'x' ? '' : m); }
    }
  }
  // avenues : de chaque porte jusqu'à une rue
  const avenue = (x, y, dx, dy) => { for (let i = 0; i < 400; i++) { if (!W.in(x, y) || (i > 2 && rues.has(at(x, y)) && !sorties.some((s) => s.cells.some(([a, b]) => a === x && b === y)))) break; if (dansRect(x, y)) { posRue(x, y); posRue(x + dy, y + dx); } x += dx; y += dy; } };
  for (const s of sorties) { const [x, y] = s.interieur, v = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[s.dir]; avenue(x, y, v[0], v[1]); }
  // chaussées : marquage au sol, passages piétons à la sortie des carrefours
  if (ville) {
    for (const [k, m] of asph) {
      const x = X + (k % w), y = Y + Math.floor(k / w);
      if (W.get(x, y) !== T.PAVE) continue;
      const vertical = m === 'e' || m === 'w', inter = m === '';
      let v = inter ? null : m;
      if (!inter && [1, 2].some((d) => (vertical ? [asph.get(at(x, y - d)), asph.get(at(x, y + d))] : [asph.get(at(x - d, y)), asph.get(at(x + d, y))]).includes(''))) v = 'x';
      W.deco.push(v ? { k: 'asph', x, y, v } : { k: 'asph', x, y });
    }
  }

  /* 6. la ville haute : une colline (un ou deux niveaux), loin du centre ; marches là où les rues franchissent le bord */
  const haut = new Set();
  if (TH.colline && !V.releve && V.theme !== 'plateau') {
    // la zone de la ville la plus loin du centre et des portes, dans un coin
    let best = null;
    for (const [fx, fy] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {
      const cx = X + Math.round(w * fx), cy = Y + Math.round(h * fy);
      if (!dans(cx, cy)) continue;
      const dC = Math.min(Math.abs(cx - (R.x0 + R.x1) / 2) - (R.x1 - R.x0) / 2, 99) + Math.min(Math.abs(cy - (R.y0 + R.y1) / 2) - (R.y1 - R.y0) / 2, 99);
      const dP = Math.min(...sorties.map((s) => Math.hypot(s.cells[0][0] - cx, s.cells[0][1] - cy)), 999);
      const sc = dC + dP * 0.5 + (mer && ((mer.includes('n') && fy < 0.5) || (mer.includes('s') && fy > 0.5)) ? -200 : 0) + r() * 6;
      if (!best || sc > best.sc) best = { cx, cy, sc };
    }
    if (best) {
      const rx = Math.min(w, h) * 0.24, ry = rx * 0.8;
      for (let niv = 1; niv <= TH.colline; niv++) {
        const k = niv === 1 ? 1 : 0.55, cells = [];
        for (let y = Math.floor(best.cy - ry * k - 4); y <= best.cy + ry * k + 4; y++) for (let x = Math.floor(best.cx - rx * k - 4); x <= best.cx + rx * k + 4; x++) {
          const q = ((x - best.cx) / (rx * k)) ** 2 + ((y - best.cy) / (ry * k)) ** 2 + (bruit(x, y, 9, graine + 7 + niv) - 0.5) * 0.5;
          if (q > 1 || !dans(x, y) || dansR(x, y) || riv[at(x, y)] || W.get(x, y) === T.WATER || W.get(x, y) === T.BRIDGE) continue;
          if (niv > 1 && !haut.has(at(x, y))) continue;
          if (sorties.some((s) => s.cells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3))) continue;
          cells.push([x, y]);
        }
        if (cells.length < 40) break;
        const Rh = plateau(W, cells, niv, TH.roche ? { roche: true } : {});
        for (const kk of Rh) { const [x, y] = kk.split(',').map(Number); if (dansRect(x, y)) haut.add(at(x, y)); }
      }
      def.villeHaute = { x: best.cx, y: best.cy, niv: TH.colline };
    }
  }

  /* 7. les îlots : les morceaux d'un seul tenant (même niveau) entre les rues ; les trop grands sont recoupés par des
   *  ruelles (pavées en ville), jusqu'à des îlots de taille humaine */
  const reg = new Int32Array(w * h);
  let cur = 0;
  const caseIlot = (x, y) => { if (!dans(x, y) || rues.has(at(x, y)) || dansR(x, y)) return false; const t = W.get(x, y); return t === sol || t === T.GRASS || t === T.FLOWER || t === T.SAND || t === T.PAVE || t === T.PATH; };
  const regions = () => {
    reg.fill(0); const out = []; let id = 0; const q = [];
    for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
      if (reg[at(x, y)] || !caseIlot(x, y)) continue;
      id++; reg[at(x, y)] = id; q.length = 0; q.push(x, y);
      const b = { id, x0: x, y0: y, x1: x, y1: y, n: 0, eau: 0 };
      while (q.length) {
        const yy = q.pop(), xx = q.pop(); b.n++;
        if (xx < b.x0) b.x0 = xx; if (xx > b.x1) b.x1 = xx; if (yy < b.y0) b.y0 = yy; if (yy > b.y1) b.y1 = yy;
        for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const u = xx + a, v = yy + c;
          if (!dansRect(u, v)) continue;
          if (W.get(u, v) === T.WATER && !riv[at(u, v)]) b.eau++;
          if (reg[at(u, v)] || !caseIlot(u, v) || W.height(u, v) !== W.height(xx, yy)) continue;
          reg[at(u, v)] = id; q.push(u, v);
        }
      }
      b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; b.aire = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1); b.plein = b.n / b.aire;
      out.push(b);
    }
    return out;
  };
  const LMAX = ville ? 34 : 30, HMAX = ville ? 26 : 22;
  let ilots = regions();
  for (let passe = 0; passe < 5; passe++) {
    let coupe = false;
    for (const b of ilots) {
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      if (b.n < 120 || (bw <= LMAX && bh <= HMAX)) continue;
      const lw = ville ? 2 : 2, t = ville ? T.PAVE : T.PATH;
      if (bw / LMAX >= bh / HMAX) {
        const xc = Math.round(b.x0 + bw * (0.4 + r() * 0.2));
        for (let y = b.y0; y <= b.y1; y++) for (let i = 0; i < lw; i++) if (reg[at(xc + i, y)] === b.id) { W.set(xc + i, y, t); rues.add(at(xc + i, y)); }
      } else {
        const yc = Math.round(b.y0 + bh * (0.4 + r() * 0.2));
        for (let x = b.x0; x <= b.x1; x++) for (let i = 0; i < lw; i++) if (reg[at(x, yc + i)] === b.id) { W.set(x, yc + i, t); rues.add(at(x, yc + i)); }
      }
      coupe = true;
    }
    if (!coupe) break;
    ilots = regions();
  }
  ilots = ilots.filter((b) => b.n >= 24 || b.eau > 4);

  /* 8. outils de pose */
  let nb = 0, nn = 0, no = 0;
  const occ = new Set(W.npcs.filter((n) => n.x >= X && n.y >= Y && n.x <= X1 && n.y <= Y1).map((n) => n.x + ',' + n.y));
  const SOLS = new Set([sol, T.GRASS, T.FLOWER, T.PAVE, T.PATH, T.SAND]);
  const libre = (x0, y0, x1, y1) => {
    const hh = W.height(x0, y0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = W.get(x, y); if (!dans(x, y) || (cur && reg[at(x, y)] !== cur) || !SOLS.has(t) || occ.has(x + ',' + y) || rues.has(at(x, y)) || W.height(x, y) !== hh || (W.pentes && W.pentes[y * W.w + x] && W.height(x, y + 1) !== hh)) return false; }
    // devant (la rangée sous la porte) : au même niveau
    for (let x = x0; x <= x1; x++) { const t = W.get(x, y1 + 1); if (W.height(x, y1 + 1) !== hh || !dans(x, y1 + 1) || !(SOLS.has(t) || t === T.BRIDGE || t === T.FENCE || t === T.BUSH)) return false; }
    return true;
  };
  const toits = V.toits || TOITS;
  const maison = (x, y, Mo, o = {}) => {
    if (!libre(x, y, x + Mo.w - 1, y + Mo.d - 1)) return null;
    const npcs = o.vide ? [] : [{ x: 3, y: 4, sprite: o.sprite || pick(SPRITES), move: 'turn', text: o.text || parole() }];
    return poserBatiment(W, maps, def, { ...Mo, x: x - def.x, y: y - def.y, roof: o.roof || pick(toits), id: 'q' + nb++, name: o.name || Mo.name, npcs });
  };
  const decor = (modele, x, y, wd, dd, o = {}) => {
    if (!libre(x, y, x + wd - 1, y + dd - 1)) return null;
    return W.building('tower', x, y, { w: wd, d: dd, h: o.h ?? 3, door: -1, modele, name: o.name || modele, roof: o.roof || 'gray', opts: o.opts });
  };
  const pnj = (x, y, o = {}) => {
    const t = W.get(x, y); if (!walkable(t) || t === T.DOOR || t === T.STAIRS || t === T.BRIDGE || occ.has(x + ',' + y) || W.warpAt(x, y) || [1, 2, 3].some((k) => W.get(x, y - k) === T.DOOR)) return null;
    occ.add(x + ',' + y);
    return W.npc({ id: `${def.id}:h${nn++}`, x, y, dir: o.dir || pick(['down', 'left', 'right', 'up']), sprite: o.sprite || pick(SPRITES), move: o.move || pick(['wander', 'turn', 'turn']), text: o.text || parole() });
  };
  const peutPoser = (x, y) => { const t = W.get(x, y); return dans(x, y) && (!cur || reg[at(x, y)] === cur) && SOLS.has(t) && !occ.has(x + ',' + y) && !rues.has(at(x, y)) && !W.signs.has(x + ',' + y) && W.get(x, y + 1) !== T.DOOR && !W.warpAt(x, y); };
  const prop = (k, x, y, o) => { if (peutPoser(x, y)) { W.prop(k, x, y, true, o); return true; } return false; };
  const arbre = (x, y) => { if (r() < 0.4) prop(pick(arbresV), x, y); else if (peutPoser(x, y) && W.get(x, y) !== T.PAVE) W.set(x, y, T.TREE); };
  const objet = (x, y, item, qty = 1) => { if (walkable(W.get(x, y)) && W.get(x, y) !== T.DOOR) W.item(x, y, item, qty, `${def.id}:o${no++}`); };
  const rect = (x0, y0, x1, y1, t, only) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dans(x, y) && (!cur || reg[at(x, y)] === cur) && !rues.has(at(x, y)) && (!only || only.includes(W.get(x, y)))) W.set(x, y, t); };
  const haie = (x, y) => { if (peutPoser(x, y) && W.get(x, y) !== T.PAVE) W.set(x, y, T.BUSH); };
  const cloture = (x, y) => { if (peutPoser(x, y)) W.set(x, y, T.FENCE); };

  /* 9. les quartiers */
  const Q = { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 1, ferme: 0, affaires: 0, ...(V.quartiers || {}) };
  for (const [k, v] of Object.entries(TH.q || {})) Q[k] = (Q[k] || 0) + v;
  ilots.sort((a, b) => b.aire - a.aire);
  const pres = (b) => Math.hypot(b.cx - (C.x0 + C.x1) / 2, b.cy - (C.y0 + C.y1) / 2);
  for (const b of ilots) if (b.eau > 4) b.sorte = 'port';
  const reste = () => ilots.filter((b) => !b.sorte && b.plein > 0.6 && b.n > 80);
  const prendre = (sorte, n, tri) => { const L = reste().sort(tri); for (let i = 0; i < n && i < L.length; i++) L[i].sorte = sorte; };
  if (Q.place) prendre('place', Q.place, (a, b) => pres(a) - pres(b));
  if (Q.marche) prendre('marche', Q.marche, (a, b) => pres(a) - pres(b));
  if (Q.parc) prendre('parc', Q.parc, (a, b) => b.aire - a.aire);
  // les bâtiments remarquables : dans les îlots proches du centre (un par îlot, avec des maisons autour)
  const reperes = [...(TH.reperes || [])];
  { const L = reste().sort((a, b) => pres(a) - pres(b)); for (const b of L) { if (!reperes.length) break; if (b.x1 - b.x0 >= 14 && b.y1 - b.y0 >= 9) b.repere = reperes.shift(); } }
  const sortes = [];
  for (const [s, k] of Object.entries(Q)) if (!['parc', 'place', 'marche', 'maisons'].includes(s)) for (let i = 0; i < k; i++) sortes.push(s);
  // les quartiers à thème loin du centre (fermes, carrières, vergers…), les maisons partout ailleurs
  const L2 = reste().sort((a, b) => pres(b) - pres(a));
  for (const b of L2) { if (b.repere) continue; if (sortes.length && (r() < 0.45 || L2.indexOf(b) < sortes.length)) b.sorte = sortes.splice(Math.floor(r() * sortes.length), 1)[0]; }
  for (const b of ilots) if (!b.sorte) b.sorte = b.plein > 0.55 || b.n > 220 ? (V.defaut || 'maisons') : 'lisiere';
  const decors = [...(TH.decor || [])];

  const fond = (b) => { if (ville) rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE]); };
  const QUARTIERS = {
    maisons(b) {
      fond(b);
      // le bâtiment remarquable de l'îlot, au bord de la rue du bas, avec un parvis
      if (b.repere) {
        const P = REPERES[b.repere], x = Math.round(b.cx - P.w / 2), y = b.y1 - P.d;
        rect(x - 2, b.y1 - P.d - 1, x + P.w + 1, b.y1, T.PAVE, [sol, T.GRASS, T.FLOWER]);
        const B = maison(x, y, P, { sprite: P.sprite, text: P.text, name: P.name });
        if (B) { prop('lamp', x - 2, b.y1); prop('lamp', x + P.w + 1, b.y1); prop(r() < 0.5 ? 'pot' : 'banc', x - 1, b.y1 - 1); prop('pot', x + P.w, b.y1 - 1); }
        // de part et d'autre, des maisons
        rangee(b, b.x0 + 1, x - 4, b.y1); rangee(b, x + P.w + 3, b.x1 - 1, b.y1);
        jardinsDuHaut(b, b.y1 - P.d - 3);
      } else {
        let yd = b.y1 - 1;
        for (let rang = 0; rang < 6; rang++) {
          if (rang > 0) { for (let x = b.x0; x <= b.x1; x++) if (peutPoser(x, yd + 1) || W.get(x, yd + 1) === T.FENCE || W.get(x, yd + 1) === T.BUSH) { W.set(x, yd + 1, T.PATH); } }
          const hmax = rangee(b, b.x0 + 1, b.x1 - 1, yd + 1);
          if (!hmax) break;
          yd = yd - hmax - 4;
          if (yd - 3 < b.y0 + 1) break;
        }
        jardinsDuHaut(b, yd + 1);
      }
      if (r() < 0.7) pnj(Math.round(b.cx), b.y1, { move: 'wander' });
    },
    parc(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PATH, T.PAVE, T.SAND]);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      // allées qui serpentent (en croix, ondulées), une petite place au milieu avec sa fontaine
      for (let x = b.x0; x <= b.x1; x++) { const y = my + Math.round(1.5 * Math.sin(x * 0.25)); rect(x, y, x, y + 1, T.PATH, [T.GRASS]); }
      for (let y = b.y0; y <= b.y1; y++) { const x = mx + Math.round(1.5 * Math.sin(y * 0.3 + 1)); rect(x, y, x + 1, y, T.PATH, [T.GRASS]); }
      rect(mx - 3, my - 3, mx + 4, my + 4, T.PAVE);
      decor('fontaine', mx - 1, my - 1, 3, 3, { h: 2 }) || prop(V.statue || 'statue', mx, my);
      const coins = [[b.x0 + 1, b.y0 + 1, mx - 5, my - 4], [mx + 6, b.y0 + 1, b.x1 - 1, my - 4], [b.x0 + 1, my + 6, mx - 5, b.y1 - 1], [mx + 6, my + 6, b.x1 - 1, b.y1 - 1]];
      const kinds = [0, 1, 2, 3].sort(() => r() - 0.5);
      coins.forEach(([x0, y0, x1, y1], i) => {
        if (x1 - x0 < 3 || y1 - y0 < 2) return;
        const q = kinds[i];
        if (q === 0 && x1 - x0 >= 5 && y1 - y0 >= 4) {
          const ray = Math.min((x1 - x0) / 2 - 0.5, (y1 - y0) / 2 + 1.5);
          W.blob((x0 + x1) / 2, (y0 + y1) / 2, ray, Math.min(ray * 0.7, (y1 - y0) / 2 - 0.5), T.WATER, r, [T.GRASS]);
          prop('banc', x0, y1); if (r() < 0.6) pnj(x1, y1, { sprite: 'pecheur', move: 'turn' });
          if (V.theme === 'mirage' || V.theme === 'flora' || V.theme === 'rose') for (let k = 0; k < 3; k++) { const kx = Math.round((x0 + x1) / 2 + (r() - 0.5) * 3), ky = Math.round((y0 + y1) / 2 + (r() - 0.5) * 2); if (W.get(kx, ky) === T.WATER) W.deco.push({ k: 'koi', x: kx, y: ky }); }
        } else if (q === 1) {
          W.blob((x0 + x1) / 2, (y0 + y1) / 2, Math.max(1.2, (x1 - x0) / 2 - 1), Math.max(1, (y1 - y0) / 2 - 1), T.TREE, r, [T.GRASS]);
          for (let k = 0; k < 4; k++) prop(pick(arbresV), x0 + Math.floor(r() * (x1 - x0 + 1)), y0 + Math.floor(r() * (y1 - y0 + 1)));
        } else if (q === 2) {
          // parterres de fleurs en bandes, bordés de haies basses
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (W.get(x, y) === T.GRASS) W.set(x, y, (x + y) % 4 === 0 ? T.GRASS : T.FLOWER);
          for (let x = x0; x <= x1; x += 2) haie(x, y0 - 1 >= b.y0 ? y0 : y1);
        } else {
          // une pelouse plantée d'arbres d'ornement en quinconce, des bancs à l'ombre, un kiosque si la place le permet
          if (!(x1 - x0 >= 6 && y1 - y0 >= 6 && decor('kiosque', Math.round((x0 + x1) / 2) - 2, Math.round((y0 + y1) / 2) - 2, 4, 5, { h: 3 })))
            for (let y = y0; y <= y1; y += 3) for (let x = x0 + (y % 2) * 2; x <= x1; x += 4) prop(pick(arbresV), x, y);
          prop('banc', x0 + 1, y1);
        }
      });
      for (const [x, y] of [[mx - 1, my - 4], [mx + 2, my - 4], [mx - 4, my + 5], [mx + 5, my + 5]]) prop('banc', x, y);
      for (const [x, y] of [[mx - 3, my - 3], [mx + 4, my - 3], [mx - 3, my + 4], [mx + 4, my + 4]]) prop('lamp', x, y);
      // une haie tout autour, ouverte sur les allées
      for (let x = b.x0; x <= b.x1; x++) for (const y of [b.y0, b.y1]) if (W.get(x, y) === T.GRASS && Math.abs(x - mx) > 2 && x % 7 !== 3) haie(x, y);
      pnj(mx - 2, my + 3, { sprite: 'enfant', move: 'wander' }); pnj(mx + 3, my - 2, { sprite: pick(['fillette', 'gamin']), move: 'wander' });
      pnj(mx + 3, my + 3, { sprite: 'vieil_homme', move: 'turn' });
      if (r() < 0.7) objet(b.x1 - 1, b.y0 + 1, pick(['potion', 'super-potion', 'poke-ball', 'great-ball', 'repel']));
    },
    place(b) {
      // la grande place : un dallage, le monument de la ville au milieu, des arbres en bacs, des bancs, des terrasses
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      // un cercle de pavés plus clairs (parterre de fleurs) autour du monument
      for (let y = my - 3; y <= my + 3; y++) for (let x = mx - 4; x <= mx + 4; x++) { const q = ((x - mx) / 4.2) ** 2 + ((y - my) / 3.2) ** 2; if (q <= 1 && q > 0.45) rect(x, y, x, y, T.FLOWER, [T.PAVE]); }
      if (V.statue) { prop(V.statue, mx, my); prop('lamp', mx - 2, my - 2); prop('lamp', mx + 2, my - 2); }
      else if (!decor('fontaine', mx - 1, my - 1, 3, 3, { h: 2 })) prop('statue', mx, my);
      for (const [x, y] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 1, b.y0 + 1], [b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 1]]) prop('lamp', x, y);
      for (const [x, y] of [[mx - 6, my + 3], [mx + 6, my + 3], [mx - 6, my - 3], [mx + 6, my - 3]]) prop(r() < 0.6 ? 'banc' : 'pot', x, y);
      for (let x = b.x0 + 3; x < b.x1 - 2; x += 4) prop(pick(arbresV), x, b.y0 + 1);
      // terrasses de café : parasols et tables
      for (let x = b.x0 + 3; x < b.x1 - 3; x += 5) if (Math.abs(x - mx) > 6) prop('parasol', x, b.y1 - 2);
      if (b.aire > 260) for (let y = b.y0 + 4; y <= b.y1 - 4; y += 4) for (let x = b.x0 + 3 + (y % 2) * 2; x <= b.x1 - 3; x += 6)
        if (Math.abs(x - mx) > 7 || Math.abs(y - my) > 5) prop(pick(arbresV), x, y);
      pnj(mx - 2, my + 4); pnj(mx + 3, my - 4); if (b.aire > 200) pnj(b.x0 + 3, my, { move: 'wander' }); pnj(mx + 7, my + 1, { move: 'wander' });
      W.sign(b.x0 + 1, b.y1, `PLACE DE ${def.name.toUpperCase()}\n${V.devise || ''}`);
    },
    marche(b) {
      // la place du marché : des rangées d'étals sous leurs auvents, un marchand derrière chacun, des caisses, une fontaine
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      const stores = ['#d84a3a', '#3a78c8', '#e8b030', '#4a9a5a', '#c85aa0', '#e07a2a'];
      let n = 0;
      for (let yr = b.y0 + 1; yr + 3 <= b.y1; yr += 6) {
        for (let x = b.x0 + 2; x + 1 <= b.x1 - 2 && n < 14; x += 5) {
          if (decor('etal', x, yr + 1, 2, 2, { h: 2, opts: { store: pick(stores) } })) {
            n++;
            pnj(x, yr, { sprite: pick(['vendeur', 'habitante', 'habitant', 'dame', 'pecheur', 'montagnard']), dir: 'down', move: 'static', text: pick(ETALS) });
            if (n % 2) prop(pick(['tonneau', 'caisse', 'caisses']), x + 2, yr + 1);
            if (n % 3 === 0) pnj(x + 1, yr + 3, { move: 'wander' });
          }
        }
      }
      if (b.y1 - b.y0 >= 14) decor('fontaine', Math.round(b.cx) - 1, b.y1 - 4, 3, 3, { h: 2 });
      for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) prop('lamp', x, y);
      W.sign(b.x0 + 1, b.y1, `MARCHÉ DE ${def.name.toUpperCase()}\nProduits frais tous les matins.`);
    },
    jardins(b) {
      // jardins ouvriers : des parcelles cultivées bordées de barrières, des allées, une cabane à outils, un puits
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PATH, T.PAVE, T.SAND]);
      const mx = Math.round(b.cx);
      rect(mx, b.y0, mx, b.y1, T.PATH); rect(b.x0, Math.round(b.cy), b.x1, Math.round(b.cy), T.PATH);
      for (let y = b.y0 + 1; y + 3 <= b.y1 - 1; y += 5) for (let x = b.x0 + 1; x + 4 <= b.x1 - 1; x += 6) {
        if (x <= mx && x + 4 >= mx || y <= Math.round(b.cy) && y + 3 >= Math.round(b.cy)) continue;
        rect(x + 1, y + 1, x + 3, y + 2, T.FLOWER);
        for (let i = x; i <= x + 4; i++) if (i !== x + 2) cloture(i, y + 3);
        if (r() < 0.5) prop(pick(['pot', 'tonneau']), x, y);
      }
      decor('cabaneChasseur', b.x1 - 4, b.y0 + 1, 4, 3, { h: 3, name: 'Cabane à outils' }) || decor('puits', b.x1 - 3, b.y0 + 1, 2, 2, { h: 2 });
      decor('puits', b.x0 + 1, b.y1 - 2, 2, 2, { h: 2 });
      pnj(mx + 1, Math.round(b.cy) + 1, { sprite: 'jardinier', move: 'turn', text: ['Mes tomates poussent mieux depuis que mon Mystherbe dort à côté.', 'Il paraît que ça les rassure.'] });
      if (r() < 0.6) objet(mx - 1, b.y1, pick(['oran-berry', 'potion', 'antidote']));
    },
    ferme(b) {
      // une ferme : la grange, le moulin, la maison du fermier, des champs en sillons derrière leurs clôtures, un enclos
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE]);
      decor('grange', b.x0 + 1, b.y0 + 1, 6, 5, { h: 4 });
      if (b.x1 - b.x0 > 14) decor(decors.includes('moulin') ? (decors.splice(decors.indexOf('moulin'), 1), 'moulin') : 'moulin', b.x1 - 4, b.y0 + 1, 4, 4, { h: 6 });
      maison(b.x0 + 9, b.y0 + 2, { kind: 'house', w: 7, d: 4, door: 1, modele: 'maisonExt' }, { sprite: 'montagnard', text: ['La ferme nourrit toute la ville. Les Écrémeuh donnent du lait matin et soir.'], name: 'Ferme' });
      for (let y = b.y0 + 8; y <= b.y1 - 1; y += 2) for (let x = b.x0 + 1; x <= b.x1 - 1; x++) if (W.get(x, y) === T.GRASS && (x - b.x0) % 9 !== 4) W.set(x, y, T.FLOWER);
      for (let x = b.x0; x <= b.x1; x++) if (W.get(x, b.y0 + 7) === T.GRASS && (x - b.x0) % 9 !== 4) cloture(x, b.y0 + 7);
      for (let k = 0; k < 3; k++) prop(pick(['tonneau', 'caisses', 'caisse']), b.x0 + 8 + k * 2, b.y0 + 6);
      pnj(b.x0 + 4, b.y0 + 6, { sprite: 'montagnard', move: 'turn', text: ['Les champs donnent bien cette année. Les Pokémon Plante y sont pour quelque chose !'] });
    },
    verger(b) {
      // un verger : des arbres fruitiers en rangées, de l'herbe haute entre eux (sans rencontre : c'est en ville), des paniers
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE, T.PATH]);
      for (let y = b.y0 + 1; y <= b.y1 - 1; y += 3) for (let x = b.x0 + 1 + ((y - b.y0) % 2) * 2; x <= b.x1 - 1; x += 4) prop(pick([...arbresV, 'erable', 'cerisier']), x, y);
      for (let x = b.x0; x <= b.x1; x++) if (x % 6) cloture(x, b.y0);
      prop('tonneau', b.x1 - 1, b.y1); prop('caisses', b.x0 + 1, b.y1);
      pnj(Math.round(b.cx), b.y1 - 1, { sprite: 'jardinier', move: 'turn', text: ['Les baies de ce verger sont les meilleures de la région.', 'Sers-toi, il y en a pour tout le monde… enfin, pas trop quand même !'] });
      if (r() < 0.8) objet(Math.round(b.cx) + 2, Math.round(b.cy), pick(['oran-berry', 'sitrus-berry', 'oran-berry']));
    },
    bosquet(b) {
      // un bois dans la ville : des arbres serrés, un sentier qui le traverse, une clairière avec un banc
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE]);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (W.get(x, y) === T.GRASS && bruit(x, y, 4, graine + 31) > 0.42 && Math.hypot(x - mx, y - my) > 3) W.set(x, y, T.TREE);
      for (let x = b.x0; x <= b.x1; x++) { const y = my + Math.round(2 * Math.sin(x * 0.2)); rect(x, y, x, y, T.PATH, [T.TREE, T.GRASS]); }
      prop('banc', mx, my - 1); prop(pick(arbresV), mx + 2, my + 1);
      pnj(mx - 1, my + 1, { sprite: pick(['insectomane', 'gamin', 'randonneuse']), move: 'turn', text: ['Ce petit bois est plein de Chenipan au printemps.', 'Chut… j\'écoute les arbres.'] });
    },
    fleurs(b) {
      // un champ de fleurs en bandes de couleurs, un sentier, une serre (kiosque vitré)
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE, T.PATH]);
      for (let y = b.y0 + 1; y <= b.y1 - 1; y++) for (let x = b.x0 + 1; x <= b.x1 - 1; x++) if (W.get(x, y) === T.GRASS && (y - b.y0) % 3 !== 0) W.set(x, y, T.FLOWER);
      rect(Math.round(b.cx), b.y0, Math.round(b.cx), b.y1, T.PATH, [T.FLOWER, T.GRASS]);
      decor('kiosque', b.x1 - 5, b.y0 + 1, 4, 5, { h: 3, name: 'Serre' });
      for (let x = b.x0; x <= b.x1; x += 3) haie(x, b.y1);
      pnj(Math.round(b.cx) + 1, Math.round(b.cy), { sprite: 'jardinier', move: 'turn', text: ['Chaque couleur a sa saison. Reviens dans quelques semaines, tout aura changé !'] });
    },
    zen(b) {
      // un jardin japonais : gravier ratissé (sable), pierres dressées, lanternes, un étang aux carpes, un torii
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE, T.PATH]);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      rect(b.x0 + 2, b.y0 + 2, mx - 1, b.y1 - 2, T.SAND, [T.GRASS]);
      for (let k = 0; k < 3; k++) { const x = b.x0 + 3 + Math.floor(r() * Math.max(1, mx - b.x0 - 5)), y = b.y0 + 3 + Math.floor(r() * Math.max(1, b.y1 - b.y0 - 5)); prop(r() < 0.5 ? 'rocher_grand' : 'stele', x, y); }
      if (b.x1 - mx >= 7) { W.blob(mx + (b.x1 - mx) / 2, my, Math.min(4, (b.x1 - mx) / 2 - 1), Math.min(3, (b.y1 - b.y0) / 2 - 1), T.WATER, r, [T.GRASS]); for (let k = 0; k < 3; k++) { const kx = Math.round(mx + (b.x1 - mx) / 2 + (r() - 0.5) * 3), ky = Math.round(my + (r() - 0.5) * 2); if (W.get(kx, ky) === T.WATER) W.deco.push({ k: 'koi', x: kx, y: ky }); } }
      for (const [x, y] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 1, b.y0 + 1], [b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 1]]) prop('lanterne', x, y);
      prop('torii', mx, b.y1 - 1);
      for (let k = 0; k < 4; k++) prop('cerisier', mx + 1 + Math.floor(r() * Math.max(1, b.x1 - mx - 2)), b.y0 + 1 + Math.floor(r() * 2));
      pnj(mx, my + 2, { sprite: pick(['kimono', 'vieil_homme']), move: 'turn', text: ['Le sable ratissé figure la mer, les pierres les îles.', 'Regarde longtemps, et le jardin se met à bouger.'] });
    },
    carriere(b) {
      // une carrière : roche à nu, blocs taillés, wagonnets et caisses, une grue de bois (étais)
      rect(b.x0, b.y0, b.x1, b.y1, T.PATH, [sol, T.GRASS, T.PAVE]);
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (W.get(x, y) === T.PATH && bruit(x, y, 5, graine + 41) > 0.68 && Math.hypot(x - b.cx, y - b.cy) > 3) W.set(x, y, T.ROCK);
      for (let k = 0; k < 5; k++) prop(pick(['rocher_grand', 'caisses', 'wagonnet', 'tonneau', 'minerai']), b.x0 + 1 + Math.floor(r() * (b.x1 - b.x0 - 1)), b.y0 + 1 + Math.floor(r() * (b.y1 - b.y0 - 1)));
      decor('cabaneChasseur', b.x0 + 1, b.y0 + 1, 4, 3, { h: 3, name: 'Baraque de chantier' });
      pnj(Math.round(b.cx), Math.round(b.cy), { sprite: 'montagnard', move: 'turn', text: ['Toute la ville est bâtie avec la pierre de cette carrière.', 'Mes Racaillou font le travail de dix ouvriers.'] });
      if (r() < 0.7) objet(b.x1 - 1, b.y1 - 1, pick(['hard-stone', 'great-ball', 'super-potion']));
    },
    etang(b) {
      // un étang au milieu des roseaux, des pontons, des cabanes de pêcheurs
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PAVE, T.PATH]);
      W.blob(b.cx, b.cy, Math.max(2, (b.x1 - b.x0) / 2 - 2), Math.max(2, (b.y1 - b.y0) / 2 - 2), T.WATER, r, [T.GRASS]);
      for (let x = Math.round(b.cx) - 1; x <= Math.round(b.cx); x++) for (let y = b.y1 - 1; y > b.cy; y--) if (W.get(x, y) === T.WATER) W.set(x, y, T.BRIDGE);
      for (let k = 0; k < 6; k++) { const x = b.x0 + Math.floor(r() * (b.x1 - b.x0 + 1)), y = b.y0 + Math.floor(r() * (b.y1 - b.y0 + 1)); if (W.get(x, y) === T.GRASS) W.set(x, y, T.FLOWER); }
      prop('bateau', Math.round(b.cx) + 2, Math.round(b.cy) + 1);
      pnj(Math.round(b.cx), b.y1 - 1, { sprite: 'pecheur', move: 'turn', text: ['Il y a des Barloche dans la vase. Énormes, les Barloche.'] });
    },
    oasis(b) {
      // une oasis : un bassin bordé de palmiers, un marché de tentes (parasols), des tapis
      rect(b.x0, b.y0, b.x1, b.y1, T.SAND, [sol, T.GRASS, T.PAVE, T.PATH]);
      W.blob(b.cx, b.cy, Math.max(2, (b.x1 - b.x0) / 3), Math.max(2, (b.y1 - b.y0) / 3), T.WATER, r, [T.SAND]);
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, rr = Math.max(3, (b.x1 - b.x0) / 3 + 1.5); prop(pick(['palm', 'palm', 'cactus']), Math.round(b.cx + Math.cos(a) * rr), Math.round(b.cy + Math.sin(a) * rr * 0.7)); }
      for (let x = b.x0 + 2; x < b.x1 - 1; x += 4) prop('parasol', x, b.y1 - 1);
      pnj(Math.round(b.cx) + 3, b.y1 - 2, { sprite: pick(['randonneuse', 'habitante']), move: 'turn', text: ['L\'eau de l\'oasis ne tarit jamais. Les anciens disent qu\'un Pokémon la garde.'] });
    },
    usine(b) {
      // la zone industrielle : hangars (tours basses), cuves, caisses empilées, tonneaux
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE, [sol, T.GRASS]);
      let x = b.x0 + 1;
      while (x + 7 < b.x1) { const tw = 7 + Math.floor(r() * 3), td = Math.min(6, b.y1 - b.y0 - 4); if (td >= 4 && libre(x, b.y0 + 1, x + tw - 1, b.y0 + td)) W.building('tower', x, b.y0 + 1, { w: tw, d: td, h: 4 + Math.floor(r() * 3), door: -1, kit: 'gc' + Math.floor(r() * 4), flat: true, name: 'Tour', roof: 'gray' }); x += tw + 3; }
      for (let xx = b.x0 + 1; xx < b.x1; xx += 3) prop(pick(['cuve', 'caisses', 'tonneau', 'caisse']), xx, b.y1 - 1);
      pnj(Math.round(b.cx), b.y1 - 2, { sprite: pick(['scientifique', 'montagnard']), move: 'wander', text: ['Les machines tournent jour et nuit. Les Magnéti adorent l\'ambiance.'] });
    },
    centrale(b) {
      // la centrale : des cuves et des transformateurs derrière un grillage, des lampadaires partout
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE, [sol, T.GRASS]);
      for (let y = b.y0 + 2; y <= b.y1 - 2; y += 3) for (let x = b.x0 + 2; x <= b.x1 - 2; x += 3) prop(((x + y) % 2) ? 'cuve' : 'borne', x, y);
      for (let x = b.x0; x <= b.x1; x++) if (x !== Math.round(b.cx)) { cloture(x, b.y0); cloture(x, b.y1); }
      pnj(Math.round(b.cx), b.y1 - 1, { sprite: 'scientifique', move: 'turn', text: ['La centrale alimente toute la ville. Ne touche à rien, ça pique !'] });
    },
    affaires(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      for (let y0 = b.y0 + 1; y0 + 4 <= b.y1 - 1;) {
        const td = Math.min(6, b.y1 - 1 - y0);
        if (td < 4) break;
        let x = b.x0 + 1;
        while (x < b.x1 - 5) {
          const tw = 6 + Math.floor(r() * 4);
          if (x + tw - 1 > b.x1 - 1) break;
          if (libre(x, y0, x + tw - 1, y0 + td - 1)) W.building('tower', x, y0, { w: tw, d: td, h: 7 + Math.floor(r() * 8), door: -1, kit: 'gc' + Math.floor(r() * 4), flat: true, name: 'Tour', roof: 'gray' });
          x += tw + 2;
        }
        for (let xx = b.x0 + 2; xx < b.x1; xx += 5) if (y0 + td + 1 < b.y1) prop(r() < 0.5 ? pick(arbresV) : 'lamp', xx, y0 + td + 1);
        y0 += td + 4;
      }
      for (let xx = b.x0 + 2; xx < b.x1; xx += 5) prop(r() < 0.5 ? pick(arbresV) : 'lamp', xx, b.y1);
      pnj(Math.round(b.cx), b.y1 - 1, { sprite: pick(['topdresseur', 'topdresseuse', 'scientifique']), move: 'wander' });
    },
    esplanade(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      for (let x = b.x0 + 2; x <= b.x1 - 2; x += 6) prop('colonne', x, b.y0);
      const mx = Math.round(b.cx), my = Math.round(b.cy), large = b.x1 - b.x0 >= b.y1 - b.y0;
      const [px0, py0, px1, py1] = large ? [b.x0 + 4, my - 1, b.x1 - 4, my + 1] : [mx - 1, b.y0 + 4, mx + 1, b.y1 - 4];
      if (px1 - px0 >= 2 && py1 - py0 >= 2) {
        rect(px0, py0, px1, py1, T.GRASS); rect(px0 + 1, py0 + 1, px1 - 1, py1 - 1, T.FLOWER);
        prop(pick(['gymstatue', 'statue']), large ? px0 - 2 : mx, large ? my : py0 - 2);
        prop(pick(['gymstatue', 'statue']), large ? px1 + 2 : mx, large ? my : py1 + 2);
      }
      if (b.aire > 400) { rect(mx - 3, my - 3, mx + 3, my + 3, T.PAVE); decor('fontaine', mx - 1, my - 1, 3, 3, { h: 2 }); }
      for (const [x, y] of [[b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 1]]) prop('lamp', x, y);
      pnj(Math.round(b.cx) + 2, Math.round(b.cy) + 2, { sprite: pick(['topdresseur', 'topdresseuse', 'vieil_homme']), move: 'wander' });
    },
    port(b) {
      // quai pavé au bord de l'eau, pontons de bois, bateaux, caisses, pêcheurs ; une cabane de pêcheur, un phare
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        if (W.get(x, y) === T.WATER) continue;
        const bord = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, c]) => W.get(x + a, y + c) === T.WATER && !riv[at(x + a, y + c)]);
        if (bord && dans(x, y)) W.set(x, y, T.PAVE);
      }
      let pontons = 0;
      for (let x = b.x0 + 2; x <= b.x1 - 2; x += 6) {
        let y = b.y1; while (y > b.y0 && W.get(x, y) !== T.WATER) y--;
        const dy = W.get(x, y) === T.WATER ? -1 : 0; if (!dy) { y = b.y0; while (y < b.y1 && W.get(x, y) !== T.WATER) y++; }
        const sens = W.get(x, y - 1) === T.WATER ? -1 : 1;
        if (W.get(x, y) !== T.WATER) continue;
        let L = 0; for (let k = 0; k < 5 && W.get(x, y + sens * k) === T.WATER; k++) { W.set(x, y + sens * k, T.BRIDGE); L++; }
        if (L >= 3) { pontons++; if (W.get(x + 1, y + sens * 2) === T.WATER) prop('bateau', x + 1, y + sens * 2); if (r() < 0.5) pnj(x, y + sens * (L - 1), { sprite: 'pecheur', move: 'turn', text: pick([['Ça mord, ça mord !'], ['Le meilleur moment pour pêcher, c\'est quand on devrait être ailleurs.'], ['Les Magicarpe sont nombreux ici. Les Léviator… beaucoup moins.']]) }); }
      }
      for (let k = 0; k < 6; k++) { const x = b.x0 + Math.floor(r() * (b.x1 - b.x0 + 1)), y = b.y0 + Math.floor(r() * (b.y1 - b.y0 + 1)); if (W.get(x, y) === T.PAVE) prop(pick(['caisse', 'tonneau', 'caisses', 'bouee']), x, y); }
      const d = decors.includes('phare') ? 'phare' : decors.includes('cabanePecheur') ? 'cabanePecheur' : null;
      if (d) for (let y = b.y0; y <= b.y1 - DECORS[d][1] && decors.includes(d); y++) for (let x = b.x0; x <= b.x1 - DECORS[d][0]; x++) if (decor(d, x, y, DECORS[d][0], DECORS[d][1], { h: DECORS[d][2], name: d === 'phare' ? 'Phare' : 'Cabane de pêcheur' })) { decors.splice(decors.indexOf(d), 1); break; }
      if (pontons) pnj(Math.round(b.cx), Math.round(b.cy), { sprite: 'marin', move: 'wander' });
    },
    lisiere(b) {
      // îlot à cheval sur la lisière : quelques arbres d'ornement, un banc, des fleurs
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (peutPoser(x, y) && W.get(x, y) !== T.PAVE) { const q = bruit(x, y, 5, graine + 51); if (q > 0.62) W.set(x, y, T.TREE); else if (q < 0.25) W.set(x, y, T.FLOWER); }
      if (r() < 0.5) prop('banc', Math.round(b.cx), b.y1);
    },
  };
  /** une rangée de maisons tournées vers le sud, porte sur la rangée yRue - 1 (yRue : la rue ou la ruelle devant) ;
   *  chaque maison a son jardin : clôture sur rue (portillon devant la porte), haie entre voisins, potager ou arbres ;
   *  renvoie la profondeur de la plus grande maison posée */
  function rangee(b, xa, xb, yRue) {
    let x = xa + Math.floor(r() * 2), hmax = 0;
    const yd = yRue - 2;   // la rangée de la porte (une rangée de jardin de devant entre la porte et la rue)
    while (x <= xb - 3) {
      const Mo = pick(TH.maisons === 'chalet' ? CHALETS : (V.maisons || MAISONS));
      const top = yd - (Mo.d - 1);
      if (top < b.y0 + 1 || x + Mo.w - 1 > xb) { x++; continue; }
      if (r() < 0.1) {
        // un terrain resté en jardin : un arbre, des fleurs, un banc
        rect(x, top + 1, x + 2, yd + 1, T.FLOWER, [sol, T.GRASS]); arbre(x + 1, top); prop('banc', x + 1, yd + 1);
        x += 5; continue;
      }
      const B = maison(x, top, Mo);
      if (B) {
        hmax = Math.max(hmax, Mo.d);
        // le jardin de devant : une clôture le long de la rue, ouverte devant la porte ; des fleurs au pied de la façade
        const portail = B.doorX;
        for (let xx = x - 1; xx <= x + Mo.w; xx++) {
          if (Math.abs(xx - portail) <= 0) { if (peutPoser(xx, yd + 1)) W.set(xx, yd + 1, T.PATH); continue; }
          if (ville ? r() < 0.6 : r() < 0.85) { if (V.theme === 'mirage' || V.theme === 'ombre') haie(xx, yd + 1); else cloture(xx, yd + 1); }
        }
        // entre deux maisons : une haie qui descend vers la rue ; derrière : potager, arbres fruitiers ou cabane
        const gx = x + Mo.w + 1;
        for (let yy = top; yy <= yd; yy++) if (r() < 0.8) haie(gx - 1 + (Mo.w % 2), yy);
        const derriere = top - 2;
        if (derriere > b.y0) {
          const q = r();
          if (q < 0.35) { for (let xx = x; xx < x + Mo.w; xx++) { rect(xx, derriere - 1, xx, derriere, T.FLOWER, [sol, T.GRASS]); } for (let xx = x - 1; xx <= x + Mo.w; xx++) cloture(xx, derriere - 2); }
          else if (q < 0.7) { arbre(x, derriere); arbre(x + Mo.w - 1, derriere - 1); }
          else if (q < 0.8) prop(pick(['tonneau', 'caisses', 'pot']), x + 1, derriere);
        }
        x += Mo.w + 2 + Math.floor(r() * 2);
      } else x++;
    }
    return hmax;
  }
  /** le haut d'un îlot de maisons (au-dessus de la dernière rangée) : potagers clôturés, vergers, pelouses, aires de jeu */
  function jardinsDuHaut(b, yLim) {
    const y1 = Math.min(yLim, b.y1);
    if (y1 - b.y0 < 2) return;
    const q = r();
    for (let y = b.y0; y <= y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      if (!peutPoser(x, y) || W.get(x, y) === T.PAVE && !ville) continue;
      const n = bruit(x, y, 6, graine + 61);
      if (q < 0.4) { if ((y - b.y0) % 3 === 1 && x % 7 !== 0) W.set(x, y, T.FLOWER); else if ((y - b.y0) % 3 === 2 && n > 0.55) W.set(x, y, T.TREE); }
      else if (q < 0.75) { if ((x + y * 3) % 5 === 0 && (y - b.y0) % 2 === 0) arbre(x, y); }
      else if (n > 0.6) W.set(x, y, T.FLOWER);
    }
    if (q >= 0.75 && y1 - b.y0 >= 3) { prop('banc', Math.round(b.cx), b.y0 + 1); pnj(Math.round(b.cx) + 2, b.y0 + 2, { sprite: pick(['gamin', 'fillette', 'enfant']), move: 'wander' }); }
  }
  if (globalThis.__DBGV === V.theme) console.log(V.theme, 'xs', xs.map((q) => q - X), 'ys', ys.map((q) => q - Y), ilots.map((b) => `${b.sorte}${b.repere ? '+' + b.repere : ''}[${b.x0 - X},${b.y0 - Y} ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1} p${b.plein.toFixed(2)}]`).join(' '));
  for (const b of ilots) { cur = b.id; (QUARTIERS[b.sorte] || QUARTIERS.maisons)(b); }
  cur = 0;

  /* 10. au bord de l'eau (rivière, côte) : une promenade plantée, des bancs, des pêcheurs */
  {
    let k = 0;
    for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
      if (!dans(x, y) || rues.has(at(x, y))) continue;
      const t = W.get(x, y); if (!(t === sol || t === T.GRASS || t === T.SAND)) continue;
      const eau = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => W.get(x + a, y + c) === T.WATER);
      if (!eau) continue;
      k++;
      if (k % 9 === 0) prop(pick(arbresV), x, y); else if (k % 13 === 0) prop('banc', x, y); else if (k % 17 === 0) prop('lamp', x, y);
      else if (k % 61 === 0) pnj(x, y, { sprite: 'pecheur', move: 'turn', text: pick([['La rivière descend des montagnes. L\'eau est glacée même en été.'], ['Ça mord !'], ['Un Poissirène m\'a volé mon appât. Encore.']]) });
    }
  }
  // les décors bâtis restants (moulin, phare…) : là où il y a de la place, en bord de ville
  for (const d of decors) {
    const [dw, dd, dh] = DECORS[d] || [4, 4, 3];
    for (let essai = 0; essai < 400; essai++) {
      const x = X + ep + Math.floor(r() * (w - dw - 2 * ep)), y = Y + ep + Math.floor(r() * (h - dd - 2 * ep));
      if (dansR(x, y)) continue;
      if (decor(d, x, y, dw, dd, { h: dh, name: d === 'phare' ? 'Phare' : d })) break;
    }
  }

  /* 11. le long des rues : lampadaires, arbres d'alignement, panneaux aux carrefours, passants */
  {
    const devantPorte = (x, y) => { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 2; c++) { const t = W.get(x + a, y + c); if (t === T.DOOR || t === T.CAVEDOOR || W.warpAt(x + a, y + c)) return true; } return false; };
    const borde = (x, y, k) => { if (!dans(x, y) || dansR(x, y) || devantPorte(x, y) || !peutPoser(x, y)) return; prop(k, x, y); };
    for (const x of xs) for (let y = Y + ib + 3; y <= Y1 - ib - 3; y += 8) { borde(x - 1, y, (y / 8) % 2 ? 'lamp' : pick(arbresV)); borde(x + RW, y + 4, (y / 8) % 2 ? pick(arbresV) : 'lamp'); }
    for (const y of ys) for (let x = X + ib + 3; x <= X1 - ib - 3; x += 8) { borde(x, y - 1, (x / 8) % 2 ? 'lamp' : pick(arbresV)); borde(x + 4, y + RW, (x / 8) % 2 ? pick(arbresV) : 'lamp'); }
    // panneaux de rue
    let nr = Math.floor(r() * RUES.length);
    for (const x of xs) for (const y of ys) {
      if (r() < 0.45) continue;
      const px = x - 1, py = y - 1;
      if (dans(px, py) && peutPoser(px, py) && !devantPorte(px, py) && rues.has(at(px + 1, py)) === false && (rues.has(at(px + 1, py + 1)) || rues.has(at(px, py + 1)))) W.sign(px, py, `${RUES[nr++ % RUES.length].toUpperCase()}\n${def.name}`);
    }
    // passants
    const ruesL = [...rues];
    for (let k = 0; k < Math.round(w * h / 1400); k++) { const i = ruesL[Math.floor(r() * ruesL.length)]; pnj(X + (i % w), Y + Math.floor(i / w), { move: 'wander' }); }
  }
  // lampadaires à l'entrée des avenues ; panneau de bienvenue à chaque porte
  for (const s of sorties) { const [x, y] = s.interieur; for (const [a, c] of [[-1, 0], [2, 0], [0, -1], [0, 2]]) if (dans(x + a, y + c)) prop('lamp', x + a, y + c); }
  for (const s of sorties) {
    const [x, y] = s.cells[ep + 1] || s.interieur, v = s.dir === 'n' || s.dir === 's' ? [2, 0] : [0, 2];
    const px = x + v[0], py = y + v[1];
    if (walkable(W.get(px, py)) && !W.signs.has(px + ',' + py)) W.sign(px, py, `${def.name.toUpperCase()}\n${V.devise || 'Bienvenue !'}`);
  }

  /* 12. les grands vides (dans le centre aussi) : squares, bosquets, parterres — en laissant toujours un passage autour */
  combler(W, X, Y, X1, Y1, { dans, rues: (x, y) => rues.has(at(x, y)), r, arbres: arbresV, prop, pnj, haie, sol });

  /* 13. tout relier : chaque porte, chaque habitant et chaque objet rejoint les rues ; les recoins isolés se referment */
  relier(W, X, Y, X1, Y1, sorties.length ? sorties.flatMap((q) => q.cells) : [[def.x, def.y]], rue);
  return def;
}

/** les grands aplats vides d'une ville (sol nu sur plus de 8 × 6 cases, sans rien autour) deviennent des squares : une
 *  pelouse bordée de haies, des arbres d'ornement, un banc, des fleurs ; on garde une case de passage tout autour */
function combler(W, X, Y, X1, Y1, o) {
  const w = X1 - X + 1, h = Y1 - Y + 1, pris = new Uint8Array(w * h), at = (x, y) => (y - Y) * w + (x - X);
  const proche = new Set();
  for (const n of W.npcs) if (n.x >= X - 2 && n.x <= X1 + 2 && n.y >= Y - 2 && n.y <= Y1 + 2) for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) proche.add((n.x + a) + ',' + (n.y + c));
  for (const i of W.items) if (i.x >= X && i.x <= X1 && i.y >= Y && i.y <= Y1) for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) proche.add((i.x + a) + ',' + (i.y + c));
  for (const k of W.warps.keys()) { const [x, y] = k.split(',').map(Number); if (x >= X && x <= X1 && y >= Y && y <= Y1) for (let a = -2; a <= 2; a++) for (let c = -1; c <= 3; c++) proche.add((x + a) + ',' + (y + c)); }
  for (const k of W.signs.keys()) { const [x, y] = k.split(',').map(Number); if (x >= X && x <= X1 && y >= Y && y <= Y1) for (let a = -1; a <= 1; a++) for (let c = -1; c <= 2; c++) proche.add((x + a) + ',' + (y + c)); }
  const vide = (x, y) => { if (!o.dans(x, y) || o.rues(x, y) || pris[at(x, y)] || proche.has(x + ',' + y)) return false; const t = W.get(x, y); return (t === o.sol || t === T.GRASS || t === T.PAVE || t === T.SAND) && W.get(x, y - 1) !== T.BUILD; };
  const decoAt = new Set(W.deco.filter((d) => d.x >= X && d.x <= X1 && d.y >= Y && d.y <= Y1).map((d) => d.x + ',' + d.y));
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
    if (!vide(x, y) || decoAt.has(x + ',' + y)) continue;
    // le plus grand rectangle vide à partir de là (jusqu'à 14 × 10)
    let wx = 0; while (wx < 14 && vide(x + wx, y) && !decoAt.has((x + wx) + ',' + y)) wx++;
    let hy = 1;
    while (hy < 10) { let ok = true; for (let i = 0; i < wx; i++) if (!vide(x + i, y + hy) || decoAt.has((x + i) + ',' + (y + hy))) { ok = false; break; } if (!ok) break; hy++; }
    if (wx < 8 || hy < 6) { pris[at(x, y)] = 1; continue; }
    for (let j = 0; j < hy; j++) for (let i = 0; i < wx; i++) pris[at(x + i, y + j)] = 1;
    // le square : on garde une case de bord (passage)
    const x0 = x + 1, y0 = y + 1, x1 = x + wx - 2, y1 = y + hy - 2, mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
    const pave = W.get(x, y) === T.PAVE;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) W.set(xx, yy, T.GRASS);
    const q = o.r();
    if (q < 0.35) {
      for (let xx = x0; xx <= x1; xx++) { if (xx !== mx) { o.haie(xx, y0); o.haie(xx, y1); } }
      for (let yy = y0 + 1; yy < y1; yy++) for (let xx = x0 + 1; xx < x1; xx++) if ((xx + yy) % 3) W.set(xx, yy, T.FLOWER);
      o.prop(o.arbres[0], mx, my);
    } else if (q < 0.7) {
      for (let yy = y0; yy <= y1; yy += 2) for (let xx = x0 + ((yy - y0) % 4 ? 1 : 0); xx <= x1; xx += 3) o.prop(o.arbres[Math.floor(o.r() * o.arbres.length)], xx, yy);
      W.set(mx, my, T.PATH);
    } else {
      if (pave) for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) W.set(xx, yy, T.PAVE);
      o.prop(o.r() < 0.5 ? 'fontaine' : 'statue', mx, my) || o.prop('pot', mx, my);
      for (const [a, c] of [[-2, 0], [2, 0]]) o.prop('banc', mx + a, my + c);
      for (const [a, c] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) o.prop(o.arbres[Math.floor(o.r() * o.arbres.length)], a, c);
    }
  }
}

/** relie à la ville tout ce qui doit l'être (devants de porte, habitants, objets) en taillant une ruelle droite vers la
 *  case reliée la plus proche ; ce qui reste isolé (bouts d'herbe) se referme en bosquet */
export function relier(W, X, Y, X1, Y1, departs, rue = T.PATH) {
  const wW = X1 - X + 1, hH = Y1 - Y + 1, at = (x, y) => (y - Y) * wW + (x - X);
  const dedans = (x, y) => x >= X && y >= Y && x <= X1 && y <= Y1;
  const bloque = new Set([...W.npcs.filter((n) => dedans(n.x, n.y) && !n.gate).map((n) => n.x + ',' + n.y), ...W.items.filter((i) => dedans(i.x, i.y)).map((i) => i.x + ',' + i.y)]);
  // les obstacles qu'une capacité ouvre (petit arbre, rocher fissuré) comptent comme un passage
  const passe = (x, y) => { const t = W.get(x, y); return (walkable(t) || t === T.CUT || t === T.SMASH || t === T.BOULDER) && t !== T.DOOR && !bloque.has(x + ',' + y); };
  const vu = new Uint8Array(wW * hH);
  const remplir = (sx, sy) => {
    if (!dedans(sx, sy) || !passe(sx, sy) || vu[at(sx, sy)]) return; const q = [[sx, sy]]; vu[at(sx, sy)] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = x + a, v = y + b; if (dedans(u, v) && !vu[at(u, v)] && passe(u, v) && W.canStep(x, y, u, v)) { vu[at(u, v)] = 1; q.push([u, v]); } } }
  };
  for (const [x, y] of departs) remplir(x, y);
  const besoins = [];
  for (const b of W.buildings) if (b.door >= 0 && dedans(b.doorX, b.doorY + 1)) besoins.push([b.doorX, b.doorY + 1]);
  for (const n of W.npcs) if (dedans(n.x, n.y)) besoins.push([n.x, n.y, 1]);
  for (const it of W.items) if (dedans(it.x, it.y)) besoins.push([it.x, it.y, 1]);
  const dec = new Set(W.deco.filter((d) => dedans(d.x, d.y)).map((d) => d.x + ',' + d.y));
  const garde = new Set([...W.items.filter((i) => dedans(i.x, i.y)).map((i) => i.x + ',' + i.y), ...W.npcs.filter((n) => dedans(n.x, n.y)).map((n) => n.x + ',' + n.y)]);
  const touche = (x, y, voisin) => (voisin ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]]).some(([a, b]) => dedans(x + a, y + b) && vu[at(x + a, y + b)]);
  const CREUSABLE = new Set([T.GRASS, T.FLOWER, T.TREE, T.FENCE, T.TALL, T.SAND, T.ASH, T.SNOW, T.PAVE, T.PATH, T.BUSH, T.PINE]);
  const bat = new Set(); for (const b of W.buildings) if (b.x + b.w >= X && b.x <= X1 && b.y + (b.d || 1) >= Y && b.y <= Y1) for (let j = 0; j < (b.d || 1); j++) for (let i = 0; i < b.w; i++) bat.add((b.x + i) + ',' + (b.y + j));
  /** chemin le plus court (largeur d'abord, au même niveau) d'une case vers une case reliée, par des cases praticables ou
   *  dégageables (herbe, arbres, barrières, haies), sans passer sur un bâtiment, un décor, un habitant ou un objet */
  const cheminVers = (sx, sy) => {
    const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]], hh = W.height(sx, sy);
    for (let i = 0; i < q.length && i < 6000; i++) {
      const [x, y] = q[i];
      if (vu[at(x, y)] && (x !== sx || y !== sy)) { const out = []; let k = prev.get(x + ',' + y); while (k) { out.push(k.split(',').map(Number)); k = prev.get(k); } return out.slice(0, -1); }
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const u = x + a, v = y + b, k = u + ',' + v;
        if (!dedans(u, v) || prev.has(k) || bat.has(k) || W.height(u, v) !== hh) continue;
        const t = W.get(u, v);
        if (vu[at(u, v)]) { prev.set(k, x + ',' + y); q.push([u, v]); continue; }
        if (dec.has(k) || garde.has(k) || t === T.DOOR || !(walkable(t) || CREUSABLE.has(t))) continue;
        prev.set(k, x + ',' + y); q.push([u, v]);
      }
    }
    return null;
  };
  for (const [x, y, voisin] of besoins) {
    if (touche(x, y, voisin)) continue;
    // le plus court chemin (cases praticables ou qu'on peut dégager) vers une case déjà reliée, puis on le dégage
    const L = cheminVers(x, y);
    if (!L) continue;
    for (const [u, v] of L) if (!walkable(W.get(u, v))) { W.set(u, v, rue); W.setHeight(u, v, W.height(x, y)); }
    if (!walkable(W.get(x, y))) W.set(x, y, rue);
    remplir(x, y);
  }
  // bouts d'herbe isolés : un bosquet
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
    const t = W.get(x, y);
    if (!vu[at(x, y)] && (t === T.GRASS || t === T.FLOWER || t === T.PATH || t === T.PAVE || t === T.SAND) && !garde.has(x + ',' + y) && !W.signs.has(x + ',' + y) && !dec.has(x + ',' + y)) W.set(x, y, T.TREE);
  }
}
