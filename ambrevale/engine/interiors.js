// Construction des intérieurs à partir de leur définition (posée par towns.js) et des grottes.
import { GameMap, GR, OB, addFurniture } from './world.js';
import { GYMS, CHAMPION } from './gyms.js';
import { fbm } from './region.js';

const WALLS = { house: '#e8d8b8', center: '#f4ece0', shop: '#e6ecf2', lab: '#eef0f2', gym: '#8a7a68', league: '#d8c8a8' };

function room(id, w, h, o) {
  const M = new GameMap(id, w, h, { fill: o.floor ?? GR.WOOD, music: o.music || 'house', name: o.name, theme: o.theme || {} });
  M.theme = o.theme || {};
  M.wallColor = o.wall || '#e8d8b8';
  addFurniture(M, { kind: 'wall', x: 0, y: 0, w, d: 1, h: o.wallH ?? 2.4, color: M.wallColor, pattern: o.wallPattern || 'paper' });
  // tapis de sortie
  const dx = Math.floor(w / 2);
  M.entry = { x: dx, y: h - 1, dir: 'up' };
  M.addWarp(dx, h - 1, { map: 'world', x: o.exit.x, y: o.exit.y, dir: 'down', kind: 'exit' });
  addFurniture(M, { kind: 'mat', x: dx, y: h - 1, w: 1, d: 1, h: 0.02, solid: false });
  return M;
}
function N(M, o) { const n = { id: M.id + ':n' + M.npcs.length, dir: 'down', move: 'static', ...o }; M.npcs.push(n); return n; }

export function buildInterior(def) {
  switch (def.kind) {
    case 'house': return house(def);
    case 'center': return center(def);
    case 'shop': return shop(def);
    case 'lab': return lab(def);
    case 'gym': return gym(def);
    case 'league': return league(def);
    default: return house(def);
  }
}

function house(def) {
  const big = def.slot === 'club';
  const M = room(def.id, big ? 11 : 9, 8, { name: def.name || 'Maison', exit: def.exit, wall: def.home ? '#f0e0c0' : WALLS.house, theme: { wood: def.home ? 'h' : '' } });
  addFurniture(M, { kind: 'bookcase', x: 0, y: 1, w: 2, d: 1, h: 1.9 });
  addFurniture(M, { kind: 'tv', x: 3, y: 1, w: 1, d: 1, h: 1.0 });
  addFurniture(M, { kind: 'plant', x: M.w - 1, y: 1, w: 1, d: 1, h: 1.2 });
  addFurniture(M, { kind: 'table', x: 3, y: 3, w: 3, d: 2, h: 0.7 });
  addFurniture(M, { kind: 'rug', x: 2, y: 6, w: 5, d: 1, h: 0.02, solid: false, color: def.home ? '#5a8ad0' : '#c86a5a' });
  if (def.home) { addFurniture(M, { kind: 'bed', x: 7, y: 1, w: 2, d: 2, h: 0.6 }); addFurniture(M, { kind: 'pc', x: 5, y: 1, w: 1, d: 1, h: 1.0 }); }
  else addFurniture(M, { kind: 'fridge', x: M.w - 3, y: 1, w: 1, d: 1, h: 1.8 });
  for (const n of def.npcs || []) N(M, n);
  M.music = def.home ? 'hameau' : 'house';
  return M;
}

function center(def) {
  const M = room(def.id, 13, 9, { name: def.name, exit: def.exit, wall: WALLS.center, floor: GR.TILEF, theme: { tileA: '#f2ece2', tileB: '#e2d8c8', tile: 'c' }, music: 'center' });
  addFurniture(M, { kind: 'counter', x: 3, y: 2, w: 7, d: 1, h: 0.5, color: '#e86a6a' });
  addFurniture(M, { kind: 'healer', x: 8, y: 1, w: 1, d: 1, h: 1.2 });
  addFurniture(M, { kind: 'pc', x: 11, y: 1, w: 1, d: 1, h: 1.1 });
  addFurniture(M, { kind: 'plant', x: 0, y: 1, w: 1, d: 1, h: 1.2 });
  addFurniture(M, { kind: 'plant', x: 12, y: 7, w: 1, d: 1, h: 1.2 });
  addFurniture(M, { kind: 'sofa', x: 0, y: 5, w: 1, d: 3, h: 0.7, color: '#d05a5a' });
  addFurniture(M, { kind: 'table', x: 1, y: 6, w: 1, d: 1, h: 0.55 });
  addFurniture(M, { kind: 'rug', x: 5, y: 4, w: 3, d: 4, h: 0.02, solid: false, color: '#e86a6a' });
  N(M, { look: 'nurse', x: 6, y: 1, dir: 'down', script: 'heal', counter: true });
  N(M, { look: 'sailor', x: 11, y: 4, dir: 'left', script: 'fly', talk: ['Service Envol ! Je peux t\'emmener dans n\'importe quelle ville que tu as déjà visitée.'] });
  N(M, { look: ['youngster', 'lass', 'oldman', 'acef', 'hiker'][(def.town || '').length % 5], x: 2, y: 4, dir: 'right', move: 'wander', talk: [CENTER_TIPS[(def.town || '').length % CENTER_TIPS.length]] });
  return M;
}
const CENTER_TIPS = [
  'L\'infirmière soigne tes créatures gratuitement. Profites-en !',
  'Une créature endormie ou paralysée est bien plus facile à capturer.',
  'Les Super Sphères sont plus efficaces que les Sphères classiques.',
  'Si toute ton équipe est K.O., tu te réveilles au dernier Centre de Soin visité.',
  'Appuie sur Maj pour courir plus vite !',
  'Les créatures sauvages fuient parfois. Il faut être rapide !',
];

function shop(def) {
  const M = room(def.id, 11, 8, { name: def.name, exit: def.exit, wall: WALLS.shop, floor: GR.TILEF, theme: { tileA: '#e8ecf0', tileB: '#d0d8e2', tile: 's' }, music: 'center' });
  addFurniture(M, { kind: 'counter', x: 2, y: 2, w: 1, d: 3, h: 0.5, color: '#5a8ad0' });
  addFurniture(M, { kind: 'shelf', x: 5, y: 2, w: 5, d: 1, h: 1.4 });
  addFurniture(M, { kind: 'shelf', x: 5, y: 5, w: 5, d: 1, h: 1.4 });
  addFurniture(M, { kind: 'shelf', x: 0, y: 1, w: 2, d: 1, h: 1.7 });
  addFurniture(M, { kind: 'shelf', x: 8, y: 1, w: 3, d: 1, h: 1.7 });
  N(M, { look: 'clerk', x: 1, y: 3, dir: 'right', script: 'shop', stock: def.stock, counter: true });
  N(M, { look: 'kid', x: 7, y: 4, dir: 'up', move: 'wander', talk: ['J\'économise pour m\'acheter une Hyper Sphère !'] });
  return M;
}

function lab(def) {
  const M = room(def.id, 13, 10, { name: def.name, exit: def.exit, wall: WALLS.lab, floor: GR.TILEF, theme: { tileA: '#f4f4f0', tileB: '#e0e2e0', tile: 'l' }, music: 'lab' });
  addFurniture(M, { kind: 'bookcase', x: 0, y: 1, w: 3, d: 1, h: 1.9 });
  addFurniture(M, { kind: 'bookcase', x: 10, y: 1, w: 3, d: 1, h: 1.9 });
  addFurniture(M, { kind: 'machine', x: 4, y: 1, w: 2, d: 1, h: 1.5 });
  addFurniture(M, { kind: 'pc', x: 8, y: 1, w: 1, d: 1, h: 1.1 });
  addFurniture(M, { kind: 'starter', x: 5, y: 4, w: 3, d: 1, h: 0.8 });
  addFurniture(M, { kind: 'bookcase', x: 0, y: 6, w: 3, d: 1, h: 1.6 });
  addFurniture(M, { kind: 'bookcase', x: 10, y: 6, w: 3, d: 1, h: 1.6 });
  addFurniture(M, { kind: 'plant', x: 0, y: 8, w: 1, d: 1, h: 1.2 });
  addFurniture(M, { kind: 'plant', x: 12, y: 8, w: 1, d: 1, h: 1.2 });
  N(M, { id: 'prof', look: 'prof', x: 6, y: 3, dir: 'down', script: 'prof' });
  N(M, { id: 'rival_lab', look: 'rival', x: 4, y: 5, dir: 'up', script: 'rivalLab', hideFlag: 'rival1' });
  N(M, { look: 'scientist', x: 10, y: 4, dir: 'left', move: 'wander', talk: ['Le Professeur étudie le lien entre les créatures et les dresseurs.', 'Il dit que l\'amitié rend les créatures plus fortes. Joli, non ?'] });
  // les trois Sphères des départs sont gérées par le script du professeur
  M.starterTable = { x: 5, y: 4 };
  return M;
}

function gym(def) {
  const G = GYMS[def.gym];
  const w = 13, h = 15;
  const M = room(def.id, w, h, { name: def.name, exit: def.exit, wall: G.wall, floor: GR.GYM, theme: { ...G.floor }, music: 'gym', wallPattern: 'stone' });
  M.dark = G.dark || 0;
  M.gym = def.gym;
  // tapis central jusqu'au champion
  addFurniture(M, { kind: 'rug', x: 6, y: 2, w: 1, d: h - 3, h: 0.02, solid: false, color: '#c8a040' });
  // obstacles thématiques en couloirs
  const ob = G.obstacle;
  const walls = [[1, 10, 4], [8, 10, 4], [3, 6, 3], [7, 6, 3]];
  for (const [x, y, len] of walls) for (let k = 0; k < len; k++) addFurniture(M, { kind: 'obstacle', style: ob, x: x + k, y, w: 1, d: 1, h: ob === 'pool' || ob === 'lava' || ob === 'ice' ? 0.15 : ob === 'plant' ? 1.1 : 1.0 });
  addFurniture(M, { kind: 'statue', x: 4, y: h - 3, w: 1, d: 1, h: 1.6, color: G.wall });
  addFurniture(M, { kind: 'statue', x: 8, y: h - 3, w: 1, d: 1, h: 1.6, color: G.wall });
  // champion
  N(M, { id: 'leader_' + def.gym, look: G.leader.look, x: 6, y: 2, dir: 'down', trainer: { ...G.leader, id: 'leader_' + def.gym, sight: 0, leader: def.gym }, script: 'leader' });
  // dresseurs
  G.trainers.forEach((t, k) => N(M, { id: 'gt_' + def.gym + k, look: t.look, x: k === 0 ? 2 : 10, y: k === 0 ? 8 : 4, dir: k === 0 ? 'right' : 'left', trainer: { ...t, id: 'gt_' + def.gym + k, sight: 4, money: 40 } }));
  // conseiller
  N(M, { look: 'youngster', x: 5, y: h - 2, dir: 'down', talk: GUIDE[def.gym] });
  return M;
}
const GUIDE = {
  roche: ['Salut, futur champion ! Petit conseil :', 'les créatures Roche craignent l\'Eau, la Plante, le Combat, le Sol et l\'Acier !'],
  plante: ['Ici, c\'est la serre d\'Iris.', 'Le Feu, la Glace, le Vol, le Poison et l\'Insecte brûlent ses plantes !'],
  spectre: ['Brr... Il fait sombre ici.', 'Contre les Spectre, utilise des attaques Spectre ou Ténèbres. Les coups Normal ne les touchent pas !'],
  elec: ['Attention, ça grésille !', 'Les créatures Sol ne craignent pas l\'électricité. C\'est l\'idéal ici !'],
  eau: ['Plouf ! L\'arène de Maëlle est une piscine géante.', 'Les attaques Plante et Électrik sont redoutables contre l\'Eau.'],
  feu: ['Ouf, quelle chaleur !', 'L\'Eau, la Roche et le Sol éteignent les flammes d\'Aldo.'],
  glace: ['Attention, ça glisse !', 'Le Feu, le Combat, la Roche et l\'Acier font fondre la glace.'],
  dragon: ['Le temple des dragons...', 'Les dragons craignent la Glace, la Fée et les autres Dragons.'],
};

function league(def) {
  const w = 13, h = 18;
  const M = room(def.id, w, h, { name: def.name, exit: def.exit, wall: WALLS.league, floor: GR.TILEF, theme: { tileA: '#e8dcc0', tileB: '#d4c4a0', tile: 'L' }, music: 'league', wallPattern: 'stone', wallH: 3 });
  addFurniture(M, { kind: 'rug', x: 5, y: 2, w: 3, d: h - 3, h: 0.02, solid: false, color: '#c83a3a' });
  for (let y = 4; y < h - 2; y += 3) { addFurniture(M, { kind: 'pillar', x: 2, y, w: 1, d: 1, h: 2.6 }); addFurniture(M, { kind: 'pillar', x: 10, y, w: 1, d: 1, h: 2.6 }); }
  N(M, { id: 'champion', look: CHAMPION.look, x: 6, y: 2, dir: 'down', trainer: { ...CHAMPION, id: 'champion', sight: 0, champion: true }, script: 'champion' });
  N(M, { look: 'guard', x: 4, y: h - 2, dir: 'down', talk: ['Au bout de cette salle t\'attend le Maître de la Ligue.', 'Prépare bien ton équipe : il n\'y aura pas de retour en arrière pendant le combat.'] });
  return M;
}

// ---------------------------------------------------------------- grottes
export function buildCave(id) {
  if (id === 'grotte') {
    const w = 60, h = 20;
    const M = new GameMap('grotte', w, h, { fill: GR.CAVE, music: 'cave', name: 'Grotte Cendrée', theme: {} });
    M.cave = true; M.dark = 0.25;
    // tout en roche, puis on creuse une galerie sinueuse
    for (let i = 0; i < w * h; i++) M.elev[i] = 2;
    const dig = (x, y) => { if (M.inb(x, y)) { M.setE(x, y, 0); M.setG(x, y, GR.CAVE); } };
    for (let x = 1; x < w - 1; x++) {
      const cy = 10 + Math.sin(x * 0.18) * 4 + Math.sin(x * 0.07 + 1) * 2;
      const half = 2.2 + fbm(x, 0, 55) * 3.2;
      for (let y = 1; y < h - 1; y++) if (Math.abs(y - cy) < half) dig(x, y);
    }
    // salles
    for (const [cx, cy, r] of [[14, 9, 4.5], [30, 11, 5], [45, 8, 4.5]]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x - cx) / r, (y - cy) / (r * 0.8)) + (fbm(x, y, 3) - 0.5) * 0.5 < 1) dig(x, y);
    // couloirs de sortie vers le bas
    for (let y = 8; y < h; y++) for (let x = 2; x <= 4; x++) dig(x, y);
    for (let y = 8; y < h; y++) for (let x = 55; x <= 57; x++) dig(x, y);
    for (let x = 2; x <= 4; x++) M.setE(x, h - 1, 0);
    for (let x = 55; x <= 57; x++) M.setE(x, h - 1, 0);
    M.addWarp(3, h - 1, { map: 'world', x: 149, y: 129, dir: 'down', kind: 'exit' });
    M.addWarp(56, h - 1, { map: 'world', x: 185, y: 129, dir: 'down', kind: 'exit' });
    M.entry = { x: 3, y: h - 3, dir: 'up' };
    // rochers et cristaux
    for (let k = 0; k < 90; k++) {
      const x = 5 + ((k * 37) % 50), y = 1 + ((k * 53) % 18);
      if (M.e(x, y) === 0 && M.e(x, y + 1) === 0 && !(x >= 2 && x <= 4) && !(x >= 55 && x <= 57) && (k % 3 === 0)) M.setO(x, y, k % 2 ? OB.BOULDER : OB.CRYSTAL);
    }
    M.items.push({ x: 30, y: 11, item: 'hyperpotion', n: 1, flag: 'it_grotte1' }, { x: 45, y: 8, item: 'rappel', n: 1, flag: 'it_grotte2' }, { x: 14, y: 8, item: 'hypersphere', n: 1, flag: 'it_grotte3' });
    M.npcs.push({ id: 'cave_hiker', x: 30, y: 9, dir: 'left', look: 'hiker', move: 'static', trainer: { id: 'cave_hiker', name: 'Gaspard', cls: 'Montagnard', team: [['rocharde', 30], ['fournelle', 30], ['taupix', 31]], sight: 4, money: 40, intro: 'Tu oses traverser ma grotte ?', lose: 'Bien joué, petit !', after: 'Forgeval est à l\'est, Roc-Marbre à l\'ouest.' } });
    M.encounters = [['galetin', 22, 26, 25], ['rocharde', 26, 30, 10], ['taupix', 22, 26, 20], ['fournelle', 23, 27, 15], ['spectrelle', 23, 27, 15], ['ferrolin', 24, 28, 15]];
    return M;
  }
  if (id === 'antre') {
    const w = 19, h = 18;
    const M = new GameMap('antre', w, h, { fill: GR.CAVE, music: 'legend', name: 'Antre d\'Ambre' });
    M.cave = true; M.dark = 0.35;
    for (let i = 0; i < w * h; i++) M.elev[i] = 2;
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) if (Math.hypot((x - 9) / 8, (y - 9) / 8) + (fbm(x, y, 77) - 0.5) * 0.4 < 1) { M.setE(x, y, 0); }
    for (let y = 12; y < h; y++) for (let x = 8; x <= 10; x++) M.setE(x, y, 0);
    M.addWarp(9, h - 1, { map: 'world', x: 201, y: 14, dir: 'down', kind: 'exit' });
    M.entry = { x: 9, y: h - 2, dir: 'up' };
    for (const [x, y] of [[4, 6], [14, 6], [5, 12], [13, 12], [3, 9], [15, 9]]) M.setO(x, y, OB.CRYSTAL);
    M.npcs.push({ id: 'legend', x: 9, y: 4, dir: 'down', creature: 'ambrion', level: 60, script: 'legend', hideFlag: 'legend' });
    return M;
  }
  return null;
}
