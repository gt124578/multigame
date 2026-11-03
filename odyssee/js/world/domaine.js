// odyssee/js/world/domaine.js — le Domaine : un très grand terrain desséché derrière la maison de Bourg-Aube, acheté grâce
// à l'aimant du frigo. On le fait revivre comme dans Pokémon Pokopia : on récolte bois, pierre, fibres et graines,
// on restaure le sol, on bâtit, et les Pokémon viennent s'installer quand leur habitat est prêt ; chacun apprend un
// talent qui débloque de nouvelles constructions. Sans DOM : la carte, le catalogue, les habitants et la reconstruction
// à partir de l'état (state.domaine : travaux, récoltes, matériaux, résidents, talents).
import { T } from './tiles.js';
import { GameMap, rng } from './mapgen.js';
import { applyOps } from './retouches.js';

export const DOMAINE = 'domaine';
export const DOMAINE_W = 64, DOMAINE_H = 48;
export const PRIX_TERRAIN = 50000;
// la porte du jardin, dans la maison de Bourg-Aube (et la case où l'on arrive en revenant)
export const PORTE_MAISON = { map: 'aube:maison', x: 7, y: 6, arrivee: [6, 6] };
export const ENTREE = { x: 32, y: 46, arrivee: [32, 44] };
export const REPOUSSE = 20 * 3600 * 1000;   // une souche, un rocher ou une broussaille récoltés repoussent en 20 h

export const MATERIAUX = [['bois', '🪵', 'Bois'], ['pierre', '🪨', 'Pierre'], ['fibre', '🌾', 'Fibres'], ['graines', '🌱', 'Graines']];
export const TALENTS = {
  verdure: { nom: 'Verdure', de: 'Bulbizarre', desc: 'faire repousser l\'herbe, les fleurs et les arbres' },
  eau: { nom: 'Pistolet à O', de: 'Carapuce', desc: 'creuser des bassins et des fontaines' },
  pierre: { nom: 'Taille de pierre', de: 'Racaillou', desc: 'paver, poser des rochers et des statues' },
  charpente: { nom: 'Charpente', de: 'Machoc', desc: 'bâtir bancs, ponts et maisons' },
  etincelle: { nom: 'Étincelle', de: 'Pikachu', desc: 'allumer des lampadaires et ouvrir un Centre de soins' },
  accueil: { nom: 'Accueil', de: 'Évoli', desc: 'inviter des habitants dans les maisons' },
};

/** le catalogue : ce que coûte chaque élément (matériaux) et le talent qu'il demande */
export const CATALOGUE = [
  { cat: 'Sols', id: 'chemin', nom: 'Chemin de terre', cout: { pierre: 1 }, t: T.PATH },
  { cat: 'Sols', id: 'herbe', nom: 'Herbe (restaurer le sol)', cout: { graines: 1 }, t: T.GRASS, talent: 'verdure' },
  { cat: 'Sols', id: 'paves', nom: 'Pavés', cout: { pierre: 2 }, t: T.PAVE, talent: 'pierre' },
  { cat: 'Sols', id: 'sable', nom: 'Sable', cout: { pierre: 1, fibre: 1 }, t: T.SAND, talent: 'pierre' },
  { cat: 'Jardin', id: 'fleurs', nom: 'Massif de fleurs', cout: { graines: 1, fibre: 1 }, t: T.FLOWER, talent: 'verdure' },
  { cat: 'Jardin', id: 'hautes', nom: 'Hautes herbes', cout: { fibre: 2 }, t: T.TALL, talent: 'verdure' },
  { cat: 'Jardin', id: 'arbre', nom: 'Arbre', cout: { graines: 2, bois: 1 }, t: T.TREE, talent: 'verdure' },
  { cat: 'Jardin', id: 'sapin', nom: 'Sapin', cout: { graines: 2, bois: 1 }, t: T.PINE, talent: 'verdure' },
  { cat: 'Jardin', id: 'buisson', nom: 'Buisson', cout: { graines: 1, fibre: 1 }, t: T.BUSH, talent: 'verdure' },
  { cat: 'Jardin', id: 'eau', nom: 'Bassin (eau)', cout: { pierre: 1 }, t: T.WATER, talent: 'eau' },
  { cat: 'Jardin', id: 'pont', nom: 'Pont de bois', cout: { bois: 2 }, t: T.BRIDGE, talent: 'charpente' },
  { cat: 'Jardin', id: 'rocher', nom: 'Rocher décoratif', cout: { pierre: 2 }, t: T.ROCK, talent: 'pierre' },
  { cat: 'Jardin', id: 'cloture', nom: 'Clôture', cout: { bois: 1 }, t: T.FENCE },
  { cat: 'Décor', id: 'caisse', nom: 'Caisse', cout: { bois: 2 }, p: 'caisse' },
  { cat: 'Décor', id: 'tonneau', nom: 'Tonneau', cout: { bois: 2 }, p: 'tonneau' },
  { cat: 'Décor', id: 'pot', nom: 'Pot de fleurs', cout: { pierre: 1, graines: 1 }, p: 'pot', talent: 'verdure' },
  { cat: 'Décor', id: 'banc', nom: 'Banc', cout: { bois: 3 }, p: 'banc', talent: 'charpente' },
  { cat: 'Décor', id: 'parasol', nom: 'Parasol', cout: { bois: 2, fibre: 3 }, p: 'parasol', talent: 'charpente' },
  { cat: 'Décor', id: 'lamp', nom: 'Lampadaire', cout: { pierre: 2, bois: 1 }, p: 'lamp', talent: 'etincelle' },
  { cat: 'Décor', id: 'lanterne', nom: 'Lanterne', cout: { pierre: 1, bois: 1, fibre: 1 }, p: 'lanterne', talent: 'etincelle' },
  { cat: 'Décor', id: 'fontaine', nom: 'Fontaine', cout: { pierre: 20 }, p: 'fontaine', talent: 'eau' },
  { cat: 'Décor', id: 'statue', nom: 'Statue', cout: { pierre: 12 }, p: 'gymstatue', talent: 'pierre' },
  { cat: 'Décor', id: 'torii', nom: 'Portique torii', cout: { bois: 20, pierre: 5 }, p: 'torii', talent: 'charpente' },
  { cat: 'Décor', id: 'panneau', nom: 'Panneau', cout: { bois: 1 }, s: true },
  { cat: 'Bâtiments', id: 'house', nom: 'Maison', cout: { bois: 30, pierre: 20 }, b: 'house', taille: [4, 3], talent: 'charpente' },
  { cat: 'Bâtiments', id: 'house2', nom: 'Grande maison', cout: { bois: 45, pierre: 30 }, b: 'house2', taille: [5, 3], talent: 'charpente' },
  { cat: 'Bâtiments', id: 'bighouse', nom: 'Résidence', cout: { bois: 70, pierre: 50 }, b: 'bighouse', taille: [6, 4], talent: 'charpente' },
  { cat: 'Bâtiments', id: 'center', nom: 'Centre de soins', cout: { bois: 60, pierre: 60 }, b: 'center', taille: [5, 4], talent: 'etincelle' },
  { cat: 'Bâtiments', id: 'mart', nom: 'Boutique', cout: { bois: 50, pierre: 40 }, b: 'mart', taille: [4, 4], talent: 'charpente' },
  { cat: 'Habitants', id: 'habitant', nom: 'Inviter un habitant (une maison par habitant)', cout: {}, n: true, talent: 'accueil' },
];
export const ARTICLE = Object.fromEntries(CATALOGUE.map((c) => [c.id, c]));
export const TOITS = ['red', 'blue', 'green', 'brown', 'gray', 'teal', 'purple', 'orange'];
export const HABITANTS = ['habitant', 'habitante', 'vieil_homme', 'dame', 'gamin', 'fillette', 'enfant', 'pecheur', 'jardinier', 'montagnard', 'randonneuse', 'marin', 'scientifique', 'kimono', 'karateka', 'insectomane'];
const PAROLES = [
  'Quel joli coin ! Merci de m\'avoir invité.', 'Ici, on se sent comme à la maison.', 'J\'adore me promener dans ton jardin.',
  'Tu as l\'œil pour la décoration, dis donc !', 'Il fait bon vivre dans ton domaine.', 'Un jour, ce sera la plus belle ville de la région !',
];
export const parole = (i) => PAROLES[Math.abs(i) % PAROLES.length];

/**
 * les Pokémon qui viennent vivre au Domaine : la condition de leur habitat (comptée sur la carte), le talent qu'ils
 * apprennent, et ce qu'ils disent. c = comptes de la carte (voir compter).
 */
export const RESIDENTS = [
  { sp: 1, nom: 'Bulbizarre', talent: 'verdure', habitat: 'Dès ton arrivée', cond: () => true, dit: 'Bulbi ! Ce terrain a soif… Avec ma Verdure, on peut faire repousser l\'herbe !' },
  { sp: 7, nom: 'Carapuce', talent: 'eau', habitat: '20 cases d\'herbe et 4 massifs de fleurs', cond: (c) => c.herbe >= 20 && c.fleurs >= 4, dit: 'Cara ! Que d\'herbe fraîche ! Je peux creuser des bassins, si tu veux.' },
  { sp: 74, nom: 'Racaillou', talent: 'pierre', habitat: '15 cases de chemin et 1 bassin', cond: (c) => c.chemin >= 15 && c.eau >= 1, dit: 'Racaillou ! De bons chemins bien tassés… Je sais tailler la pierre, moi.' },
  { sp: 66, nom: 'Machoc', talent: 'charpente', habitat: '6 cases d\'eau, 4 arbres et 10 pavés', cond: (c) => c.eau >= 6 && c.arbres >= 4 && c.paves >= 10, dit: 'Machoc ! Envie de construire ? Je porte les poutres !' },
  { sp: 25, nom: 'Pikachu', talent: 'etincelle', habitat: 'une maison et 3 bancs', cond: (c) => c.maisons >= 1 && c.bancs >= 3, dit: 'Pika pika ! Il manque un peu de lumière ici, non ?' },
  { sp: 133, nom: 'Évoli', talent: 'accueil', habitat: '2 maisons, 3 lampadaires et 12 massifs de fleurs', cond: (c) => c.maisons >= 2 && c.lampes >= 3 && c.fleurs >= 12, dit: 'Évoli ! Ton domaine est si accueillant… On pourrait inviter des gens !' },
  { sp: 16, nom: 'Roucool', habitat: '8 cases de hautes herbes', cond: (c) => c.hautes >= 8, dit: 'Roucool ! Ces hautes herbes sont parfaites pour se cacher.' },
  { sp: 19, nom: 'Rattata', habitat: '4 cases de hautes herbes et 2 caisses', cond: (c) => c.hautes >= 4 && c.caisses >= 2, dit: 'Rattata ! Des caisses ! J\'adore grignoter dans les coins.' },
  { sp: 10, nom: 'Chenipan', habitat: '8 arbres', cond: (c) => c.arbres >= 8, dit: 'Cheniii ! Que de feuilles à croquer !' },
  { sp: 43, nom: 'Mystherbe', habitat: '25 massifs de fleurs', cond: (c) => c.fleurs >= 25, dit: 'Mystherbe ! Ce parfum de fleurs…' },
  { sp: 54, nom: 'Psykokwak', habitat: '15 cases d\'eau', cond: (c) => c.eau >= 15, dit: 'Psy… kokwak ? J\'ai mal à la tête, mais l\'eau est bonne.' },
  { sp: 60, nom: 'Ptitard', habitat: 'une fontaine', cond: (c) => c.fontaines >= 1, dit: 'Ptitard ! Une fontaine rien que pour moi ?' },
  { sp: 50, nom: 'Taupiqueur', habitat: '40 cases de chemin', cond: (c) => c.chemin >= 40, dit: 'Taupiqueur ! Que de terre retournée, c\'est le paradis !' },
  { sp: 37, nom: 'Goupix', habitat: '2 lanternes et 10 arbres', cond: (c) => c.lanternes >= 2 && c.arbres >= 10, dit: 'Goupix ! La lueur des lanternes dans les arbres… c\'est beau.' },
  { sp: 52, nom: 'Miaouss', habitat: 'une boutique', cond: (c) => c.boutiques >= 1, dit: 'Miaouss ! Une boutique ! On va faire des affaires, toi et moi.' },
  { sp: 143, nom: 'Ronflex', habitat: '6 bancs et un Centre de soins', cond: (c) => c.bancs >= 6 && c.centres >= 1, dit: 'Ronfl… zzz… Ronflex ! (Il a l\'air d\'adorer tes bancs.)' },
];
export const RESIDENT = Object.fromEntries(RESIDENTS.map((r) => [r.sp, r]));
/** le rang du village, selon le nombre de Pokémon et de maisons */
export function rang(dom, c) {
  const n = (dom?.res || []).length + (c?.maisons || 0);
  return n >= 18 ? 'Grande ville' : n >= 13 ? 'Ville' : n >= 8 ? 'Village' : n >= 4 ? 'Hameau' : 'Terre desséchée';
}

/* ---------------- la carte ---------------- */
const interieur = (x, y) => x >= 2 && y >= 2 && x <= DOMAINE_W - 3 && y <= DOMAINE_H - 3;
/** cases interdites : la bordure, l'allée d'entrée, le panneau et l'architecte */
export function caseLibre(x, y) {
  if (!interieur(x, y)) return false;
  if (x === ENTREE.x && y >= ENTREE.y - 2) return false;
  if ((x === ENTREE.x - 2 || x === ENTREE.x + 2) && y === ENTREE.y - 2) return false;
  return true;
}
/** les ressources du terrain desséché : toujours les mêmes cases (souches mortes, rochers, broussailles) */
export function ressources() {
  const r = rng(424242), out = [];
  for (let y = 2; y <= DOMAINE_H - 3; y++) for (let x = 2; x <= DOMAINE_W - 3; x++) {
    if (!caseLibre(x, y) || (Math.abs(x - ENTREE.x) <= 2 && y >= ENTREE.y - 4)) { r(); continue; }
    const v = r();
    if (v < 0.05) out.push({ x, y, k: 'souche' }); else if (v < 0.085) out.push({ x, y, k: 'rocher' }); else if (v < 0.15) out.push({ x, y, k: 'broussaille' });
  }
  return out;
}
export const RECOLTE = { souche: { bois: 3, graines: 1 }, rocher: { pierre: 3 }, broussaille: { fibre: 2, graines: 1 } };

/** la carte vierge : une grande terre desséchée bordée d'arbres, l'entrée en bas, le panneau et l'architecte */
export function domaineVierge(nom = 'Ton Domaine', recolte = {}, now = Date.now()) {
  const m = new GameMap(DOMAINE, DOMAINE_W, DOMAINE_H, { fill: T.ASH, name: nom, music: 'town' });
  m.rect(0, 0, DOMAINE_W - 1, 1, T.TREE); m.rect(0, DOMAINE_H - 2, DOMAINE_W - 1, DOMAINE_H - 1, T.TREE);
  m.rect(0, 0, 1, DOMAINE_H - 1, T.TREE); m.rect(DOMAINE_W - 2, 0, DOMAINE_W - 1, DOMAINE_H - 1, T.TREE);
  m.rect(ENTREE.x, ENTREE.y - 2, ENTREE.x, DOMAINE_H - 1, T.PATH);
  const retour = { map: PORTE_MAISON.map, x: PORTE_MAISON.arrivee[0], y: PORTE_MAISON.arrivee[1], dir: 'left' };
  m.warp(ENTREE.x, ENTREE.y, retour); m.warp(ENTREE.x, ENTREE.y + 1, retour);
  m.sign(ENTREE.x - 2, ENTREE.y - 2, `${nom.toUpperCase()}\nUne terre desséchée à faire revivre.\nRécolte, bâtis, et les Pokémon viendront s'installer !`);
  m.npc({ id: 'domaine:architecte', x: ENTREE.x + 2, y: ENTREE.y - 2, sprite: 'topdresseur', dir: 'down', move: 'turn', script: 'architecte' });
  for (const q of ressources()) {
    const k = q.x + ',' + q.y, t = recolte[k];
    if (t && now - t < REPOUSSE) continue;
    if (q.k === 'souche') m.prop('deadtree', q.x, q.y, true);
    else if (q.k === 'rocher') m.set(q.x, q.y, T.ROCK);
    else m.set(q.x, q.y, T.DARKTALL);
    m.object(q.x, q.y, { recolte: q.k, use: (api) => api.game.recolter(q.x, q.y, q.k) });
  }
  m.zone(0, 0, DOMAINE_W - 1, DOMAINE_H - 1, { name: nom, music: 'town', enc: [[16, 3, 7, 25], [19, 3, 7, 25], [10, 3, 6, 15], [13, 3, 6, 15], [161, 3, 7, 10], [263, 3, 7, 10]] });
  return m;
}
/** les comptes qui décident des habitats (sur la carte bâtie) */
export function compter(m) {
  const c = { herbe: 0, fleurs: 0, hautes: 0, eau: 0, arbres: 0, chemin: 0, paves: 0, maisons: 0, centres: 0, boutiques: 0, bancs: 0, lampes: 0, lanternes: 0, caisses: 0, fontaines: 0 };
  for (let y = 2; y < m.h - 2; y++) for (let x = 2; x < m.w - 2; x++) {
    const t = m.get(x, y);
    if (t === T.GRASS) c.herbe++; else if (t === T.FLOWER) c.fleurs++; else if (t === T.TALL) c.hautes++; else if (t === T.WATER) c.eau++;
    else if (t === T.TREE || t === T.PINE) c.arbres++; else if (t === T.PATH && !(x === ENTREE.x && y >= ENTREE.y - 2)) c.chemin++; else if (t === T.PAVE) c.paves++;
  }
  for (const b of m.buildings) { if (b.kind === 'center') c.centres++; else if (b.kind === 'mart') c.boutiques++; else c.maisons++; }
  for (const d of m.deco) { if (d.k === 'banc') c.bancs++; else if (d.k === 'lamp') c.lampes++; else if (d.k === 'lanterne') c.lanternes++; else if (d.k === 'caisse' || d.k === 'tonneau') c.caisses++; else if (d.k === 'fontaine') c.fontaines++; }
  return c;
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
/** l'état du Domaine, complété pour les parties d'avant la seconde partie */
export function etatDomaine(d) {
  if (!d) return d;
  d.travaux ||= []; d.recolte ||= {}; d.res ||= []; d.talents ||= [];
  d.mat = { bois: 0, pierre: 0, fibre: 0, graines: 0, ...(d.mat || {}) };
  if (!d.res.includes(1)) d.res.unshift(1);
  for (const sp of d.res) { const t = RESIDENT[sp]?.talent; if (t && !d.talents.includes(t)) d.talents.push(t); }
  return d;
}
/** reconstruit le Domaine : la terre desséchée, les travaux dans l'ordre, puis les Pokémon installés ; renvoie la carte */
export function batirDomaine(maps, domaine, now = Date.now()) {
  for (const id of Object.keys(maps)) if (id.startsWith(DOMAINE + ':')) delete maps[id];
  const d = etatDomaine(domaine) || {};
  const m = domaineVierge(d.nom, d.recolte, now);
  const ops = [];
  for (const t of d.travaux || []) { const art = ARTICLE[t.a]; const op = art && opPour(art, t.x, t.y, t); if (op) ops.push(op); }
  applyOps(m, ops, maps);
  // une ressource recouverte par un travail n'est plus récoltable
  for (const [k, o] of [...m.objects]) {
    if (!o.recolte) continue;
    const [x, y] = k.split(',').map(Number), t = m.get(x, y);
    const encore = o.recolte === 'souche' ? m.deco.some((q) => q.x === x && q.y === y && q.k === 'deadtree') : o.recolte === 'rocher' ? t === T.ROCK : t === T.DARKTALL;
    if (!encore) m.objects.delete(k);
  }
  // les Pokémon installés se promènent près de l'entrée, chacun à sa place
  const libres = [];
  for (let y = 4; y < m.h - 4; y++) for (let x = 4; x < m.w - 4; x++) if ([T.GRASS, T.ASH, T.PATH, T.PAVE, T.FLOWER, T.SAND].includes(m.get(x, y)) && !m.objectAt(x, y)) libres.push([x, y]);
  libres.sort((a, b) => Math.hypot(a[0] - ENTREE.x, a[1] - ENTREE.y + 8) - Math.hypot(b[0] - ENTREE.x, b[1] - ENTREE.y + 8));
  (d.res || []).forEach((sp, i) => {
    const p = libres[Math.min(libres.length - 1, i * 7 + 3)]; if (!p) return;
    m.npc({ id: 'domaine:poke' + sp, x: p[0], y: p[1], sprite: 'poke:' + sp, dir: 'down', move: 'wander', script: 'resident', sp });
  });
  maps[DOMAINE] = m;
  return m;
}
