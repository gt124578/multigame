// odyssee/js/world/quetes.js — l'histoire secondaire d'Odyssée : la Brume, une organisation qui vole les Pokémon et
// cherche à réveiller Groudon, et les lieux qu'on découvre en la pourchassant (Lac Miroir et sa Grotte des Marées,
// Jardin des Songes, Forêt des Torii et Temple Kagura, Île du Magma). Chaque quête est une suite d'étapes rangée dans
// `flags['Q:id']` (1, 2, 3… puis 'fin') ; ses PNJ apparaissent et disparaissent selon l'étape (`when`), ses scripts
// (`talk`, `use`, `onWin`, `after`) reçoivent les outils de game.api().
import { T, walkable } from './tiles.js';
import { GameMap, carveRoute, along, nearestWalkable, rng, GRAND } from './mapgen.js';
import { room, caveMap } from './interiors.js';
import { plateau, rectangle, sinueuse } from './relief.js';
import { ITEMS } from '../core/items.js';
import { enrichirTout } from './rencontres.js';
import { addCendree } from './cendree.js';
import { tourDoree } from './tourdoree.js';

/* ---------------- objets de quête ---------------- */
Object.assign(ITEMS, {
  'insigne-brume': { pocket: 'cles', price: 0, key: true, icon: 'dark-gem', name: 'Insigne Brume', desc: 'Un insigne gris frappé d\'un nuage. Les sbires de la Brume le portent au col. Au dos : « Lac Miroir ».' },
  'plume-lune': { pocket: 'cles', price: 0, key: true, icon: 'lunar-wing', name: 'Plume Lune', desc: 'Une plume qui brille comme un croissant de lune. Elle chasse les cauchemars.' },
  talisman: { pocket: 'cles', price: 0, key: true, icon: 'spell-tag', name: 'Talisman Kagura', desc: 'Un talisman de papier du Temple Kagura. Il en faut trois pour réveiller la cloche.' },
  'orbe-rouge': { pocket: 'cles', price: 0, key: true, icon: 'red-orb', name: 'Orbe Rouge', desc: 'Un orbe brûlant. Il calme Groudon... ou le réveille.' },
  'lettre-facteur': { pocket: 'cles', price: 0, key: true, icon: 'air-mail', name: 'Lettre', desc: 'Du courrier que le facteur de Port-Azur n\'a pas pu distribuer.' },
  'vieil-ambre': { pocket: 'cles', price: 0, key: true, icon: 'old-amber', name: 'Vieil Ambre', desc: 'Un morceau d\'ambre ancien. Un Pokémon d\'avant l\'histoire y dort peut-être.' },
  'eclat-etoile': { pocket: 'cles', price: 0, key: true, icon: 'star-piece', name: 'Éclat d\'Étoile', desc: 'Un éclat qui scintille même en plein jour. La fontaine du Jardin des Songes en réclame sept.' },
  'cle-base': { pocket: 'cles', price: 0, key: true, icon: 'secret-key', name: 'Passe de la Brume', desc: 'La carte magnétique qui ouvre la salle du chef de la Brume.' },
});

/* ---------------- rencontres des nouveaux lieux ---------------- */
const ENC = {
  lac: [[183, 14, 18, 15], [270, 14, 17, 12], [283, 15, 18, 10], [399, 14, 17, 15], [418, 15, 18, 10], [54, 15, 18, 10], [60, 14, 17, 10], [193, 16, 18, 5], [298, 14, 16, 8], [580, 16, 18, 5]],
  lacEau: [[54, 25, 32, 20], [118, 25, 32, 20], [183, 25, 30, 15], [419, 30, 33, 6], [131, 30, 34, 3], [226, 28, 32, 6], [340, 30, 33, 8], [222, 28, 32, 8], [592, 28, 32, 6]],
  marees: [[41, 32, 36, 20], [42, 35, 38, 10], [86, 32, 35, 10], [90, 32, 35, 10], [120, 32, 36, 10], [222, 32, 35, 10], [339, 32, 35, 10], [369, 34, 37, 3], [564, 33, 36, 4]],
  mareesEau: [[90, 32, 36, 20], [120, 32, 36, 15], [222, 33, 36, 15], [339, 32, 36, 15], [369, 35, 38, 5], [131, 35, 38, 3], [366, 33, 36, 10]],
  jardin: [[315, 22, 26, 15], [187, 21, 24, 10], [191, 21, 24, 8], [669, 22, 26, 15], [546, 22, 25, 10], [548, 22, 25, 10], [280, 22, 25, 8], [39, 22, 25, 8], [427, 22, 25, 10], [406, 21, 24, 6]],
  torii: [[92, 34, 37, 15], [93, 37, 39, 4], [200, 34, 38, 10], [355, 34, 37, 10], [198, 34, 37, 10], [123, 36, 38, 4], [570, 35, 37, 4], [607, 34, 37, 8], [302, 35, 38, 5], [163, 34, 37, 10], [177, 34, 37, 10], [433, 35, 38, 6]],
  magma: [[322, 52, 56, 18], [218, 52, 56, 15], [240, 52, 55, 8], [126, 55, 58, 5], [324, 53, 57, 10], [75, 53, 57, 10], [228, 52, 56, 10], [631, 54, 57, 8], [636, 55, 57, 3], [667, 53, 56, 8]],
  caverne: [[219, 58, 62, 15], [323, 60, 63, 10], [229, 58, 62, 10], [75, 58, 61, 15], [76, 61, 64, 5], [112, 60, 63, 8], [554, 58, 61, 10], [327, 58, 61, 6], [632, 60, 62, 6]],
};
enrichirTout(ENC);

const key = (x, y) => x + ',' + y;
const night = (g) => { const h = g.hour(); return h >= 20 || h < 5; };

export function buildQuests(ctx) {
  const { W, maps, towns, routes, legends, docks, buildTown, trainerNpc, offRoute } = ctx;
  const quests = {};
  const Q = (id, o) => { quests[id] = o; return o; };
  const st = (f, id) => f['Q:' + id] || 0;
  const done = (f, id) => f['Q:' + id] === 'fin';
  const between = (f, id, a, b) => { const s = st(f, id); return s !== 'fin' && s >= a && s <= b; };
  const legend = (o) => { legends.push(o); return o; };
  const routePts = (id) => routes.find((r) => r.id === id).pts;

  /** carte annexe (en plein air) */
  const outdoor = (id, w, h, o) => { const m = new GameMap(id, w, h, { outdoor: true, fill: o.fill ?? T.TREE, name: o.name, music: o.music || 'route' }); maps[id] = m; return m; };
  /** passage dans les arbres depuis une route du monde vers une carte annexe : un sentier qui s'enfonce dans la
   *  forêt, la dernière case fait changer de carte (et inversement) */
  const passage = (routeId, ts, sides, len, dest, label) => {
    const pts = routePts(routeId);
    for (const t of ts) for (const side of sides) {
      const p = along(pts, t);
      let x = p.x + 0.5, y = p.y + 0.5, k = 0;
      // direction perpendiculaire à la route, ramenée à l'axe dominant (routes sinueuses)
      const ax = Math.abs(p.nx) >= Math.abs(p.ny), nx = ax ? Math.sign(p.nx * side) : 0, ny = ax ? 0 : Math.sign(p.ny * side);
      if (!nx === !ny) continue;
      // jusqu'à la lisière
      let cx = Math.floor(x), cy = Math.floor(y);
      while (k++ < 14 && walkable(W.get(cx, cy))) { cx += nx; cy += ny; }
      const start = [cx, cy], cells = [];
      if (W.items.some((it) => it.x === cx - nx && it.y === cy - ny) || W.npcs.some((n) => n.x === cx - nx && n.y === cy - ny)) continue;
      let ok = true;
      for (let i = 0; i < len; i++) {
        const tx = start[0] + nx * i, ty = start[1] + ny * i;
        if (!W.in(tx, ty)) { ok = false; break; }
        // couloir de deux cases de large : la case et sa voisine sur le côté
        const sx = ny ? 1 : 0, sy = nx ? 1 : 0;
        for (const [ax, ay] of [[tx, ty], [tx + sx, ty + sy]]) { const q = W.get(ax, ay); if (q !== T.TREE && q !== T.PINE) ok = false; }
        cells.push([tx, ty], [tx + sx, ty + sy]);
      }
      // la sortie touche la route (case praticable juste avant le couloir) et le fond reste dans la forêt
      const after = W.get(start[0] + nx * len, start[1] + ny * len);
      if (!ok || (after !== T.TREE && after !== T.PINE)) continue;
      // le passage prend la hauteur du bord de la route d'où il part (butte, talus)
      const hp = W.height(start[0] - nx, start[1] - ny);
      for (const [ax, ay] of cells) { W.set(ax, ay, T.PATH); W.setHeight(ax, ay, hp); }
      const last = [cells[cells.length - 2], cells[cells.length - 1]], back = [cells[cells.length - 4], cells[cells.length - 3]];
      const dir = nx > 0 ? 'right' : nx < 0 ? 'left' : ny > 0 ? 'down' : 'up', opp = { right: 'left', left: 'right', down: 'up', up: 'down' }[dir];
      for (const [ax, ay] of last) W.warp(ax, ay, { map: dest.map, x: dest.x, y: dest.y, dir: dest.dir, step: true });
      W.prop('torii', start[0] + (ny ? 0 : 0), start[1], false, { dz: 0.95, w: ny ? 2 : 1 });
      W.sign(...nearestWalkable(W, start[0] - nx * 2 + (ny ? -1 : 0), start[1] - ny * 2 + (nx ? -1 : 0), new Set(cells.map(([a, b]) => key(a, b)))), label);
      return { back: { map: 'monde', x: back[0][0], y: back[0][1], dir: opp }, at: start };
    }
    throw new Error('pas de passage pour ' + routeId);
  };
  /** clairière dans les arbres au bout d'un court sentier, à côté d'une route du monde */
  const clairiere = (routeId, ts, sides, depth, w, h) => {
    const pts = routePts(routeId);
    for (const t of ts) for (const side of sides) {
      const p = along(pts, t);
      // direction perpendiculaire à la route, ramenée à l'axe dominant (routes sinueuses)
      const ax = Math.abs(p.nx) >= Math.abs(p.ny), nx = ax ? Math.sign(p.nx * side) : 0, ny = ax ? 0 : Math.sign(p.ny * side);
      if (!nx === !ny) continue;
      let cx = Math.floor(p.x + 0.5), cy = Math.floor(p.y + 0.5), k = 0;
      while (k++ < 14 && walkable(W.get(cx, cy))) { cx += nx; cy += ny; }
      // rectangle de la clairière au bout du sentier
      // l'entrée du sentier reste libre (pas d'objet ni d'habitant juste devant)
      if (W.items.some((it) => it.x === cx - nx && it.y === cy - ny) || W.npcs.some((n) => n.x === cx - nx && n.y === cy - ny)) continue;
      const ex = cx + nx * depth, ey = cy + ny * depth;
      const x0 = nx ? (nx > 0 ? ex : ex - w + 1) : ex - (w >> 1), y0 = ny ? (ny > 0 ? ey : ey - h + 1) : ey - (h >> 1);
      let ok = true;
      for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) { const q = W.get(x, y); if (!W.in(x, y) || (q !== T.TREE && q !== T.PINE)) ok = false; }
      for (let i = 0; i < depth; i++) { const q = W.get(cx + nx * i, cy + ny * i); if (q !== T.TREE && q !== T.PINE) ok = false; }
      if (!ok) continue;
      const hc = W.height(cx - nx, cy - ny);
      for (let i = 0; i < depth; i++) { W.set(cx + nx * i, cy + ny * i, T.PATH); W.setHeight(cx + nx * i, cy + ny * i, hc); }
      W.rect(x0, y0, x0 + w - 1, y0 + h - 1, T.GRASS);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) W.setHeight(x, y, hc);
      return { x0, y0, w, h, cx: x0 + (w >> 1), cy: y0 + (h >> 1), nx, ny };
    }
    throw new Error('pas de clairière pour ' + routeId);
  };
  /** case libre près d'un point (pas sur un PNJ déjà posé) */
  const spot = (m, x, y) => { const used = new Set(m.npcs.map((n) => key(n.x, n.y))); for (const d of m.deco) used.add(key(d.x, d.y)); return nearestWalkable(m, x, y, used); };
  /** PNJ de quête */
  const pnj = (m, id, x, y, o) => { const [px, py] = spot(m, x, y); return m.npc({ id, x: px, y: py, dir: 'down', ...o }); };
  /** dresseur de quête (n'apparaît qu'à certaines étapes) */
  const sbire = (m, id, x, y, dir, cls, name, team, o = {}) => {
    const [px, py] = spot(m, x, y);
    const n = trainerNpc(m, px, py, dir, cls, name, team, { id, ...o });
    if (o.when) n.when = o.when;
    return n;
  };
  const pocketTown = (m, def) => { buildTown(m, maps, def); return def; };
  /** porte de grotte posée sur une carte, reliée à une carte de grotte (entrée en bas de la grotte) */
  const caveLink = (m, x, y, cave, cx, cy) => {
    const out = m.building('cave', x, y);
    cave.set(cx, cy + 1, T.CAVEDOOR); cave.set(cx, cy, T.CAVE); cave.set(cx, cy + 2, T.CAVEWALL);
    cave.warp(cx, cy + 1, { map: m.id, x: out.doorX, y: out.doorY + 1, dir: 'down' });
    m.warp(out.doorX, out.doorY, { map: cave.id, x: cx, y: cy, dir: 'up' });
    cave.deco.push({ k: 'exitlight', x: cx, y: cy + 1 });
    cave.outside = { map: m.id, x: out.doorX, y: out.doorY + 1 };
    return out;
  };
  /** objet avec lequel on interagit */
  const chose = (m, prop, x, y, o, block = true) => { m.prop(prop, x, y, block); m.object(x, y, o); };

  /* ====================================================================================================
     Quête 1 · Le Ponyta de Lucie (Sylvebourg, après le badge d'Hector) — première apparition de la Brume
     ==================================================================================================== */
  const SYL = towns.B || Object.values(towns).find((t) => t.id === 'sylve');
  Q('ponyta', {
    name: 'Le Ponyta de Lucie', where: 'Sylvebourg',
    steps: (f) => [
      `Interroger les habitants de Sylvebourg sur le voleur en noir (${['tPain', 'tEnfant', 'tMamie'].filter((k) => f[k]).length} / 3 témoins).`,
      'Le voleur a filé vers le Bois Murmure. Le retrouver.',
      'Le sbire a parlé d\'une clairière cachée à l\'est du Bois Murmure : délivrer Ponyta.',
      'Ramener Ponyta à Lucie, à Sylvebourg.',
    ],
    end: 'Lucie a retrouvé son Ponyta. Mais qui est cette « Brume » ?',
  });
  {
    const sx = SYL.x, sy = SYL.y;
    pnj(W, 'q:lucie', sx + 24, sy + 15, { sprite: 'lucie', talk: async (A) => {
      const s = A.step('ponyta'), who = 'Lucie';
      if (s === 'fin') { await A.say(['Ponyta va beaucoup mieux, merci encore !', 'Prends soin d\'Évoli, d\'accord ?'], who); return; }
      if (!s) {
        if (A.badges() < 1) { await A.say(['Ponyta... mon Ponyta a disparu cette nuit...', 'Il faudrait un vrai dresseur pour m\'aider. Quelqu\'un qui a déjà battu Hector...'], who); return; }
        await A.say(['Oh, tu as le badge d\'Hector ! S\'il te plaît, aide-moi !', 'Cette nuit, quelqu\'un a ouvert l\'enclos et a emmené mon Ponyta.', 'Il était tout en noir... Les voisins ont peut-être vu quelque chose.', 'Le boulanger se lève très tôt, Tom joue toujours dehors, et Mamie Rose ne dort jamais !'], who);
        await A.set('ponyta', 1); return;
      }
      if (s < 4) { await A.say(s === 1 ? 'Les voisins ont forcément vu quelque chose... Le boulanger, Tom, Mamie Rose...' : 'Tu as une piste ? Oh, je t\'en supplie, ramène-le-moi !', who); return; }
      await A.say(['PONYTA ! Tu es là ! Oh, merci, merci, merci !', 'Ces gens de la « Brume »... Qu\'est-ce qu\'ils peuvent bien vouloir à nos Pokémon ?', 'Tiens. Mon Évoli a toujours rêvé de voyager. Avec toi, il verra du pays.'], who);
      await A.giveMon(133, 12, { met: 'Sylvebourg' });
      await A.give('rare-candy', 2);
      await A.set('ponyta', 'fin');
      await A.say(['Au fait... le voleur a laissé tomber ceci dans l\'enclos. Un insigne, avec écrit « Lac Miroir » au dos.', 'On raconte que le lac est au nord de la route 3, dans la forêt. Je me demande ce qu\'ils y fabriquent.'], who);
    } });
    const temoin = (id, x, y, sprite, flag, lines, after) => pnj(W, 'q:' + id, sx + x, sy + y, { sprite, move: 'turn', talk: async (A) => {
      const s = A.step('ponyta');
      if (s !== 1) { await A.say(after); return; }
      await A.say(lines);
      if (!A.f[flag]) { A.f[flag] = true; if (['tPain', 'tEnfant', 'tMamie'].every((k) => A.f[k])) { await A.say('Le voleur est parti vers le Bois Murmure, au nord-est...'); await A.set('ponyta', 2); } }
    } });
    temoin('pain', 6, 11, 'habitant', 'tPain', ['Un homme en noir ? Oui ! Il est passé devant la boulangerie à l\'aube.', 'Il tirait un Ponyta au bout d\'une corde. La pauvre bête ne voulait pas avancer.'], ['Mes croissants sont les meilleurs de Sylvebourg !']);
    temoin('enfant', 20, 18, 'enfant', 'tEnfant', ['Le monsieur en noir avait un nuage dessiné sur son T-shirt !', 'Il a crié « Pour la Brume ! » quand le Ponyta lui a mordu la main. Ha ha !'], ['Je veux devenir dresseur comme toi !']);
    temoin('mamie', 28, 9, 'dame', 'tMamie', ['À mon âge, on dort peu, mon petit. Je l\'ai vu de ma fenêtre.', 'Il est parti vers le nord, vers le Bois Murmure. Avec un Ponyta, il n\'ira pas bien loin dans les fourrés.'], ['Le thé est prêt, tu en veux ?']);
    // Bois Murmure : le voleur, puis la clairière cachée
    const [vx, vy] = offRoute('bois', 0.32, -1, 3);
    sbire(W, 'q:voleur', vx, vy, 'down', 'Voleur', 'Rodrigue', [[19, 12], [41, 13], [109, 13]], {
      sight: 0, when: (f) => st(f, 'ponyta') === 2, bs: 'voleur',
      intro: ['Quoi ?! Tu m\'as suivi jusqu\'ici ?', 'Le Ponyta ? Je l\'ai déjà confié aux autres. Tu ne le reverras jamais !'], lose: 'Grr... Fichue gamine de Sylvebourg !',
      onWin: async (A) => {
        await A.say(['Bon, bon... Il est à la clairière cachée, à l\'est du bois.', 'Mais mes collègues de la Brume ne te laisseront pas passer !', 'Tiens, prends ce truc et fiche-moi la paix !'], 'Voleur Rodrigue');
        await A.give('insigne-brume'); await A.set('ponyta', 3);
      },
    });
    const c = clairiere('bois', [0.62, 0.55, 0.7, 0.45, 0.78, 0.35, 0.85, 0.25, 0.9, 0.15], [1, -1], 4, 7, 5);
    W.zone(c.x0 - 1, c.y0 - 1, c.x0 + c.w, c.y0 + c.h, { name: 'Clairière cachée', music: 'forest', prio: 2 });
    W.prop('caisse', c.x0 + 1, c.y0 + 1); W.prop('caisses', c.x0 + c.w - 2, c.y0 + 1); W.prop('tonneau', c.x0 + c.w - 2, c.y0 + c.h - 2);
    const g1 = sbire(W, 'q:brume1', c.cx - 1, c.cy, 'down', 'Sbire de la Brume', 'Sbire', [[261, 13], [19, 14]], { sight: 3, when: (f) => st(f, 'ponyta') >= 3, intro: 'Halte ! Cette clairière appartient à la Brume !', lose: 'Je vais me faire gronder...', after: 'La Brume est partout, tu sais.' });
    const g2 = sbire(W, 'q:brume2', c.cx + 1, c.cy, 'down', 'Sbire', 'Sbire', [[41, 14], [109, 14]], { sight: 3, when: (f) => st(f, 'ponyta') >= 3, bs: 'brume_f', intro: 'Tu veux le Ponyta ? Viens le chercher !', lose: 'Pfff... La chef ne va pas être contente.', after: 'Notre chef, Nox, a de grands projets...' });
    // la caisse, au fond de la clairière (à l'opposé du sentier qui y entre)
    const [kx, ky] = c.ny > 0 ? [c.cx, c.y0 + c.h - 1] : c.nx > 0 ? [c.x0 + c.w - 1, c.cy] : c.nx < 0 ? [c.x0, c.cy] : [c.cx, c.y0];
    chose(W, 'caisse', kx, ky, { use: async (A) => {
      const s = A.step('ponyta');
      if (s !== 3) { await A.say(s === 'fin' || s === 4 ? 'Une caisse vide. Ponyta est rentré chez lui.' : 'Une grosse caisse en bois. On entend quelque chose bouger dedans...'); return; }
      if (!A.f['T:' + g1.id] || !A.f['T:' + g2.id]) { await A.say(['Une grosse caisse en bois. Un Ponyta hennit à l\'intérieur !', 'Les sbires de la Brume ne te laisseront pas l\'ouvrir.']); return; }
      A.cry(77); await A.say(['Tu soulèves le couvercle...', 'Ponyta bondit hors de la caisse ! Il frotte sa tête contre toi.', 'Il faut le ramener à Lucie, à Sylvebourg.']);
      await A.set('ponyta', 4);
    } });
  }

  /* ====================================================================================================
     Lac Miroir (au nord de la route 3) et Rive-Claire · Grotte des Marées (en surfant)
     ==================================================================================================== */
  const LAC = outdoor('lac', 70, 58, { name: 'Lac Miroir', music: 'route2' });
  {
    const m = LAC;
    // rive herbeuse, puis le lac ; l'îlot de Cresselia à l'ouest, le rocher de la grotte à l'est
    m.blob(35, 17, 24, 14, T.GRASS, rng(81));
    m.blob(35, 17, 20, 10.5, T.WATER, rng(82), [T.GRASS]);
    m.rect(20, 12, 30, 22, T.WATER); m.blob(25, 17, 2.6, 2, T.GRASS, rng(83), [T.WATER]); m.rect(24, 16, 26, 18, T.FLOWER, [T.GRASS]);
    m.rect(43, 10, 53, 19, T.WATER); m.rect(45, 12, 51, 17, T.SAND);
    carveRoute(m, [[34.5, 37], [34.5, 31], [13, 28], [8, 16], [14, 4], [35, 2.5], [56, 4], [62, 16], [56, 28], [36.5, 31]], { seed: 777, w: 7, grass: 1.1, trees: 0.05, flowers: 0.04, taperStart: false, taperEnd: false });
    // Rive-Claire
    pocketTown(m, {
      id: 'rive', name: 'Rive-Claire', x: 21, y: 36, w: 28, h: 20, exits: [['s', 13], ['n', 13]], stock: 3, music: 'town',
      roads: [[2, 9, 25, 10, T.PATH], [13, 2, 14, 17, T.PATH]],
      deco: [['flowers', 3, 13, 8, 15], ['flowers', 19, 13, 24, 15], ['lamp', 12, 8], ['lamp', 15, 8], ['sign', 11, 11, 'RIVE-CLAIRE\nLe hameau du Lac Miroir.'], ['banc', 17, 7]],
      buildings: [
        { kind: 'center', x: 3, y: 2 },
        { kind: 'house', x: 18, y: 2, roof: 'teal', name: 'Maison de la Rive', npcs: [{ x: 4, y: 4, sprite: 'habitante', text: ['Avant, l\'eau du lac était si claire qu\'on s\'y voyait comme dans un miroir.', 'Depuis que ces machines sont arrivées, elle devient trouble...'] }] },
        { kind: 'house', x: 3, y: 13, roof: 'brown', name: 'Cabane du Passeur', npcs: [{ x: 2, y: 4, sprite: 'vieil_homme', text: ['L\'îlot à l\'ouest du lac... Les soirs de pleine lune, une créature y danse.', 'On ne peut y aller qu\'en surfant.'] }] },
      ],
      npcs: [{ id: 'gamin', x: 20, y: 16, sprite: 'gamin', move: 'wander', text: ['Mon grand frère dit qu\'il y a une grotte dans le lac.', 'Il faut surfer pour y aller !'] }],
    });
    // entrée depuis la route 3 du monde (au nord)
    const entree = passage('r3', [0.5, 0.4, 0.6, 0.3, 0.7, 0.2], [1, -1], 6, { map: 'lac', x: 34, y: 56, dir: 'up' }, 'LAC MIROIR ↑\nHameau de Rive-Claire.');
    m.rect(34, 53, 35, 57, T.PATH); m.warp(34, 57, { ...entree.back, step: true }); m.warp(35, 57, { ...entree.back, step: true });
    m.outside = { map: 'monde', x: entree.at[0], y: entree.at[1] };
    m.zone(0, 0, 69, 57, { name: 'Lac Miroir', music: 'route2', enc: ENC.lac, surfEnc: ENC.lacEau, route: 'lac', prio: 0 });
    m.zone(21, 36, 48, 55, { name: 'Rive-Claire', music: 'town', town: 'rive' });
    m.item(...spot(m, 8, 10), 'super-potion', 2); m.item(...spot(m, 61, 9), 'great-ball', 3); m.item(...spot(m, 25, 16), 'eclat-etoile', 1, 'etoile:lac1'); m.item(...spot(m, 62, 26), 'eclat-etoile', 1, 'etoile:lac2');
    // dresseurs du tour du lac
    trainerNpc(m, ...spot(m, 12, 22), 'right', 'Pêcheur', 'Marius', [[118, 17], [129, 15], [60, 18]], { sight: 3 });
    trainerNpc(m, ...spot(m, 60, 21), 'left', 'Fillette', 'Ondine', [[183, 18], [270, 17]], { sight: 3 });
    trainerNpc(m, ...spot(m, 22, 3), 'down', 'Randonneuse', 'Maëlle', [[283, 18], [399, 18], [298, 17]], { sight: 3 });
  }
  Q('lac', {
    name: 'Les eaux troubles du Lac Miroir', where: 'Rive-Claire',
    steps: (f) => [
      `Arrêter les trois pompes de la Brume autour du Lac Miroir (${[1, 2, 3].filter((k) => f['pompe' + k]).length} / 3).`,
      'Un admin de la Brume surveille le nord du lac. L\'affronter.',
      'L\'admin Sylas a fui vers la Grotte des Marées, au milieu du lac : y aller en surfant (Badge Mirage).',
      'Une présence s\'éveille au fond de la Grotte des Marées...',
      'Raconter à Gaston ce qui s\'est passé dans la grotte.',
    ],
    end: 'Le Lac Miroir a retrouvé son eau claire. Gaston t\'a confié son Lokhlass.',
  });
  {
    const m = LAC;
    pnj(m, 'q:gaston', 34, 32, { sprite: 'pecheur', talk: async (A) => {
      const s = A.step('lac'), who = 'Gaston';
      if (s === 'fin') { await A.say(['Regarde l\'eau : on y voit les nuages ! Le lac est redevenu un miroir.', 'Prends soin de mon Lokhlass, hein.'], who); return; }
      if (!s) {
        await A.say(['Bah alors, un dresseur ? Tu tombes bien.', 'Il y a une semaine, des types en gris ont planté trois grosses pompes au bord du lac.', 'Depuis, l\'eau se trouble et les Pokémon du lac sont nerveux.', 'Ils pompent quelque chose au fond... Moi, je suis trop vieux pour les chasser. Tu veux bien t\'en charger ?'], who);
        await A.set('lac', 1); return;
      }
      if (s === 1) { await A.say('Il y a une pompe à l\'ouest, une au nord et une à l\'est du lac. Chacune est gardée.', who); return; }
      if (s === 2) { await A.say('Les pompes sont coupées ! Mais leur chef traîne encore au nord du lac...', who); return; }
      if (s === 3 || s === 4) { await A.say(A.badges() >= 5 ? ['La Grotte des Marées est sur le rocher, à l\'est du lac.', 'Avec Surf, tu y seras en un rien de temps.'] : ['La Grotte des Marées est sur un rocher au milieu de l\'eau.', 'Il faudrait savoir surfer... On dit que la Championne de Mirage enseigne Surf.'], who); return; }
      await A.say(['Mesprit ? La gardienne du lac ? Tu l\'as vue de tes yeux ?', 'Mon grand-père disait qu\'elle vivait au fond de la grotte et qu\'elle gardait l\'eau claire.', 'C\'est donc ça que la Brume cherchait... pompait l\'eau pour la forcer à sortir.', 'Tiens. Mon vieux Lokhlass m\'a porté sur ce lac pendant trente ans. Il a envie de voir la mer.'], who);
      await A.giveMon(131, 35, { met: 'Lac Miroir' });
      await A.set('lac', 'fin');
    } });
    // trois pompes, chacune gardée
    const pompes = [[15, 17, 'right'], [35, 5, 'down'], [57, 17, 'left']];
    pompes.forEach(([px, py, dir], i) => {
      const [x, y] = spot(m, px, py);
      const g = sbire(m, 'q:pompe' + (i + 1), ...spot(m, x + (dir === 'down' ? 1 : 0), y + (dir === 'down' ? 0 : 1)), dir, i === 1 ? 'Sbire' : 'Sbire de la Brume', 'Sbire', [[[42, 19], [109, 20]], [[261, 20], [198, 19]], [[110, 21], [41, 19], [19, 20]]][i], {
        sight: 3, when: (f) => st(f, 'lac') >= 1, bs: i === 1 ? 'brume_f' : 'brume', ow: i === 1 ? 'brume_f' : 'brume',
        intro: ['Ne touche pas à la pompe !', 'Hé, toi, au pied du lac, tu n\'as rien à faire là !', 'Le chef Sylas veut ce qui dort au fond. On ne s\'arrêtera pas !'][i],
        lose: 'Mince... La pompe...', after: 'Coupe-la si tu veux. Ça ne changera rien.',
      });
      chose(m, 'console', x, y, { use: async (A) => {
        if (A.f['pompe' + (i + 1)]) { await A.say('La pompe est arrêtée. L\'eau autour redevient claire.'); return; }
        if (A.step('lac') !== 1) { await A.say('Une grosse machine qui ronronne. Un tuyau plonge dans le lac.'); return; }
        if (!A.f['T:' + g.id]) { await A.say('Le sbire de la Brume ne te laissera pas approcher de la pompe.'); return; }
        A.sfx('pc'); await A.say(['Tu trouves l\'interrupteur et tu le bascules...', 'La pompe hoquette, puis s\'arrête !']);
        A.f['pompe' + (i + 1)] = true;
        if ([1, 2, 3].every((k) => A.f['pompe' + k])) { await A.say('Les trois pompes sont arrêtées. Mais quelqu\'un s\'agite au nord du lac...'); await A.set('lac', 2); }
        else await A.set('lac', 1, true);
      } });
    });
    pnj(m, 'q:sylas1', 44, 4, { sprite: 'sylas', when: (f) => st(f, 'lac') === 2, talk: async (A) => {
      const r = await A.fight({ cls: 'Admin de la Brume', name: 'Sylas', bs: 'sylas', prize: 60, team: [[42, 22], [110, 23], [319, 24]], intro: ['Alors c\'est toi qui as coupé mes pompes ?', 'Je suis Sylas, admin de la Brume. Ce lac cache une gardienne, et la Brume en a besoin.', 'Tu veux jouer les héros ? Très bien !'], lose: 'Tch... Pas mal.' });
      if (r !== 'win') return;
      await A.say(['Garde ton lac. Nous, on prend ce qu\'il y a dessous.', 'La Grotte des Marées nous attend. Et toi, sans Surf, tu ne pourras même pas nous suivre !'], 'Sylas');
      await A.set('lac', 3);
    } });
  }
  // Grotte des Marées
  const MAREES = (() => {
    const m = new GameMap('marees', 42, 32, { outdoor: false, fill: T.CAVEWALL, floor: 'cave', music: 'cave', name: 'Grotte des Marées', battleBg: 'cave' });
    m.edge = T.CAVEWALL; m.surf = true; maps.marees = m;
    m.rect(14, 21, 27, 29, T.CAVE); m.rect(18, 19, 23, 21, T.CAVE);
    m.blob(21, 14, 16, 6.5, T.WATER, rng(91));
    m.rect(7, 2, 34, 8, T.CAVE); m.blob(10, 5, 4, 3, T.CAVE, rng(92)); m.blob(32, 5, 4, 3, T.CAVE, rng(93));
    m.rect(4, 12, 7, 18, T.CAVE); m.rect(34, 11, 37, 16, T.CAVE);  // deux grèves au bord du lac souterrain
    for (const [x, y] of [[9, 3], [33, 7], [15, 26], [26, 22], [5, 17], [36, 11]]) m.prop('caverock', x, y);
    m.prop('cristal', 20, 2); m.prop('cristal', 22, 2); m.prop('stalag', 8, 7); m.prop('stalag', 34, 3);
    m.encounter = ENC.marees; m.surfEnc = ENC.mareesEau;
    m.item(5, 13, 'vieil-ambre', 1, 'ambre:marees'); m.item(36, 15, 'eclat-etoile', 1, 'etoile:marees'); m.item(30, 4, 'ultra-ball', 3); m.item(16, 27, 'hyper-potion', 2);
    return m;
  })();
  {
    const m = LAC;
    caveLink(m, 46, 12, MAREES, 20, 29);
    const c = MAREES;
    sbire(c, 'q:marees1', 12, 6, 'right', 'Sbire de la Brume', 'Sbire', [[42, 37], [110, 38]], { sight: 3, when: (f) => st(f, 'lac') >= 3, intro: 'Tu as traversé le lac ? Impressionnant... mais inutile !' });
    sbire(c, 'q:marees2', 29, 6, 'left', 'Sbire', 'Sbire', [[229, 38], [262, 37]], { sight: 3, bs: 'brume_f', ow: 'brume_f', when: (f) => st(f, 'lac') >= 3, intro: 'Le chef est juste derrière. Tu n\'iras pas plus loin !' });
    pnj(c, 'q:sylas2', 21, 4, { sprite: 'sylas', dir: 'up', when: (f) => st(f, 'lac') === 3, talk: async (A) => {
      const r = await A.fight({ cls: 'Admin de la Brume', name: 'Sylas', bs: 'sylas', prize: 120, team: [[169, 40], [110, 40], [319, 41], [430, 42]], intro: ['Encore toi ?! Tu ne lâches donc jamais ?', 'Regarde : la gardienne est là, sous l\'eau. Il ne manque plus qu\'elle se montre...', 'Hors de mon chemin !'], lose: 'Comment... ?' });
      if (r !== 'win') return;
      await A.say(['La gardienne du lac ne m\'intéresse plus. Le chef Nox voulait juste savoir si elle existait.', 'Son vrai trésor, c\'est l\'Orbe Rouge... et ce qu\'il réveille, sur l\'île de feu.', 'Tu entendras encore parler de la Brume, gamin.'], 'Sylas');
      await A.walk('q:sylas2', 'down', 3, true);
      A.flash('#c8e8ff'); A.cry(481);
      await A.say(['L\'eau du lac souterrain se met à briller...', 'Une petite silhouette rose flotte au-dessus des vagues !']);
      await A.set('lac', 4);
    } });
    legend({ id: 'mesprit', sp: 481, lvl: 40, map: 'marees', x: 21, y: 3, cond: (f) => st(f, 'lac') === 4 || (done(f, 'lac') && f['L:mesprit'] !== 'caught'), intro: ['Mesprit, la gardienne du Lac Miroir, te regarde.', 'Elle semble te remercier.'],
      after: async (A, res) => { if (res !== 'lose' && A.step('lac') === 4) await A.set('lac', 5); } });
  }

  /* ====================================================================================================
     Quête · Le courrier perdu (Port-Azur, facteur) : quatre lettres dans quatre lieux
     ==================================================================================================== */
  Q('courrier', {
    name: 'Le courrier perdu', where: 'Port-Azur',
    steps: (f) => [`Distribuer les lettres du facteur (${['L:lucie', 'L:gaston', 'L:jardin', 'L:pretre'].filter((k) => f['C' + k]).length} / 4) : Lucie à Sylvebourg, Gaston à Rive-Claire, le jardinier du Jardin des Songes, le prêtre du Temple Kagura.`, 'Revenir voir le facteur à Port-Azur.'],
    end: 'Toutes les lettres sont arrivées.',
  });
  {
    const AZ = Object.values(towns).find((t) => t.id === 'azur');
    pnj(W, 'q:facteur', AZ.x + 24, AZ.y + 16, { sprite: 'facteur', talk: async (A) => {
      const s = A.step('courrier'), who = 'Facteur Basile';
      if (s === 'fin') { await A.say('Grâce à toi, la tournée est bouclée. Le courrier, c\'est sacré !', who); return; }
      if (!s) {
        await A.say(['Aïe aïe aïe... Mon Roucarnage a la grippe, et j\'ai quatre lettres qui partent loin.', 'Lucie à Sylvebourg, Gaston au Lac Miroir, le jardinier du Jardin des Songes et le prêtre du Temple Kagura.', 'Tu voyages beaucoup, toi. Tu veux bien les porter ?'], who);
        await A.give('lettre-facteur', 4); await A.set('courrier', 1); return;
      }
      if (s === 1) { await A.say('Il te reste des lettres à distribuer. Courage !', who); return; }
      await A.say(['Toutes livrées ? Formidable !', 'Voici ta paie de facteur. Et un souvenir de la poste.'], who);
      await A.money(3000); await A.give('rare-candy', 3); await A.give('shiny-stone');
      await A.set('courrier', 'fin');
    } });
  }
  /** un destinataire de lettre : remet la lettre, puis continue avec sa propre conversation */
  const lettre = (who, k) => async (A) => {
    if (A.step('courrier') === 1 && !A.f['CL:' + k] && A.has('lettre-facteur')) {
      A.take('lettre-facteur'); A.f['CL:' + k] = true; A.sfx('item');
      await A.say([`${A.name} remet une lettre à ${who}.`, 'Oh ! Une lettre pour moi ? Merci beaucoup !']);
      if (['lucie', 'gaston', 'jardin', 'pretre'].every((q) => A.f['CL:' + q])) await A.set('courrier', 2);
      return true;
    }
    return false;
  };
  for (const [npcId, mapId, who, k] of [['q:lucie', 'monde', 'Lucie', 'lucie'], ['q:gaston', 'lac', 'Gaston', 'gaston']]) {
    const n = maps[mapId].npcs.find((q) => q.id === npcId), base = n.talk;
    n.talk = async (A, nn) => { if (await lettre(who, k)(A)) return; await base(A, nn); };
  }

  /* ====================================================================================================
     Jardin des Songes (au sud de la route 6) · Quête : Les nuits blanches de Floralia (Cresselia, Darkrai)
     ==================================================================================================== */
  const JAR = outdoor('jardin', 46, 40, { name: 'Jardin des Songes', music: 'route2' });
  {
    const m = JAR;
    m.rect(3, 3, 42, 36, T.GRASS);
    // haies, allées pavées en croix, la fontaine au centre
    m.rect(3, 3, 42, 3, T.BUSH); m.rect(3, 36, 21, 36, T.BUSH); m.rect(24, 36, 42, 36, T.BUSH); m.rect(3, 3, 3, 36, T.BUSH); m.rect(42, 3, 42, 36, T.BUSH);
    m.rect(22, 4, 23, 39, T.PAVE); m.rect(4, 19, 41, 20, T.PAVE);
    m.rect(19, 16, 26, 23, T.PAVE);
    m.prop('fontaine', 22, 19, true, { w: 2, dz: 0.95 }); m.set(23, 19, T.BLOCK); m.set(22, 18, T.BLOCK); m.set(23, 18, T.BLOCK);
    m.under.set(key(23, 19), T.PAVE); m.under.set(key(22, 18), T.PAVE); m.under.set(key(23, 18), T.PAVE);
    m.object(22, 19, { use: async (A) => fontaine(A) }); m.object(23, 19, { use: async (A) => fontaine(A) }); m.object(22, 18, { use: async (A) => fontaine(A) }); m.object(23, 18, { use: async (A) => fontaine(A) });
    // parterres de fleurs
    for (const [x0, y0, x1, y1] of [[6, 6, 12, 10], [32, 6, 38, 10], [6, 25, 12, 31], [32, 25, 38, 31], [15, 8, 19, 11], [26, 8, 30, 11], [15, 27, 19, 30], [26, 27, 30, 30]]) m.rect(x0, y0, x1, y1, T.FLOWER);
    // cerisiers, bancs, lanternes, l'étang
    for (const [x, y] of [[5, 13], [40, 13], [5, 23], [40, 23], [14, 5], [31, 5]]) m.prop('cerisier', x, y);
    for (const [x, y] of [[18, 14], [27, 14], [18, 25], [27, 25]]) m.prop('banc', x, y);
    for (const [x, y] of [[21, 15], [24, 15], [21, 24], [24, 24]]) m.prop('lanterne', x, y);
    m.blob(34, 17, 4.5, 2.5, T.WATER, rng(71), [T.GRASS]);
    m.rect(22, 37, 23, 39, T.PATH);
    m.zone(0, 0, 45, 39, { name: 'Jardin des Songes', music: 'route2', enc: ENC.jardin, theme: 'jardin' });
    m.rect(8, 15, 12, 17, T.TALL); m.rect(33, 21, 39, 23, T.TALL); m.rect(14, 32, 19, 34, T.TALL); m.rect(27, 32, 33, 34, T.TALL);
    m.item(...spot(m, 40, 34), 'eclat-etoile', 1, 'etoile:jardin'); m.item(...spot(m, 5, 34), 'max-potion');
    const entree = passage('r6', [0.35, 0.45, 0.25, 0.55, 0.65], [1, -1], 6, { map: 'jardin', x: 22, y: 38, dir: 'up' }, 'JARDIN DES SONGES ↓\nUn jardin de fleurs et de rêves.');
    m.warp(22, 39, { ...entree.back, step: true }); m.warp(23, 39, { ...entree.back, step: true });
    m.outside = { map: 'monde', x: entree.at[0], y: entree.at[1] };
    trainerNpc(m, ...spot(m, 9, 20), 'right', 'Fillette', 'Capucine', [[315, 24], [669, 25]], { sight: 3, intro: 'Mes fleurs sont les plus belles du jardin !' });
    trainerNpc(m, ...spot(m, 36, 20), 'left', 'Topdresseuse', 'Rosalie', [[548, 25], [187, 25], [280, 26]], { sight: 3 });
  }
  Q('songes', {
    name: 'Les nuits blanches de Floralia', where: 'Floralia',
    steps: [
      'Demander conseil au jardinier du Jardin des Songes (au sud de la route 6).',
      'Trouver la créature de l\'îlot du Lac Miroir et rapporter une Plume Lune (Surf).',
      'Rapporter la Plume Lune à Hélène, à Floralia.',
      'Surveiller le Jardin des Songes la nuit (de 20 h à 5 h).',
      'Ariane a emporté son projecteur au Temple Kagura, dans la Forêt des Torii (à l\'ouest de la route 7).',
      'Darkrai rôde dans le sanctuaire du Temple Kagura...',
      'Retourner voir Hélène à Floralia.',
    ],
    end: 'Malo et les enfants de Floralia dorment à nouveau sur leurs deux oreilles.',
  });
  {
    const FL = Object.values(towns).find((t) => t.id === 'flora');
    pnj(W, 'q:helene', FL.x + 30, FL.y + 21, { sprite: 'dame', talk: async (A) => {
      const s = A.step('songes'), who = 'Hélène';
      if (s === 'fin') { await A.say(['Malo dort comme un bébé, maintenant. Et il ne parle plus que de toi !'], who); return; }
      if (!s) {
        if (A.badges() < 4) { await A.say(['Mon fils Malo ne se réveille plus le matin... Il fait des cauchemars terribles.', 'Les médecins ne savent pas quoi faire. Il faudrait quelqu\'un de courageux...'], who); return; }
        await A.say(['Excuse-moi... tu as l\'air d\'un dresseur aguerri.', 'Depuis deux semaines, mon fils Malo et trois autres enfants de Floralia font les mêmes cauchemars.', 'Ils dorment, mais ne se réveillent pas vraiment. Ils parlent d\'une ombre aux yeux bleus...', 'Le vieux jardinier du Jardin des Songes connaît les légendes du sommeil. Va le voir, je t\'en prie.'], who);
        await A.set('songes', 1); return;
      }
      if (s === 3 && A.has('plume-lune')) {
        A.flash('#e0e8ff');
        await A.say(['Une Plume Lune ! Pose-la sur l\'oreiller de Malo...', '...', 'Il ouvre les yeux ! Malo ! Tu m\'entends ?'], who);
        await A.say(['Maman... J\'ai rêvé d\'un homme en noir dans le jardin, la nuit. Avec une grosse lampe violette.', 'Elle faisait venir l\'ombre...'], 'Malo');
        await A.say(['Un homme en noir dans le jardin ? La nuit ?', 'Je t\'en prie, va voir ce qui se passe au Jardin des Songes cette nuit.'], who);
        await A.set('songes', 4); return;
      }
      if (s === 7) {
        await A.say(['Tu as chassé l\'ombre ? Tous les enfants se sont réveillés ce matin, en riant !', 'Je ne sais pas comment te remercier... Prends ceci, c\'était à mon père, un grand dresseur.'], who);
        await A.give('rare-candy', 3); await A.give('full-restore', 2); await A.give('dusk-stone');
        await A.set('songes', 'fin'); return;
      }
      await A.say(['Malo dort toujours si mal...', ['', 'Le jardinier saura sûrement quoi faire.', 'Une Plume Lune... sur l\'îlot du Lac Miroir, c\'est ça ?', '', 'Le jardin, la nuit... sois prudent.', 'Le Temple Kagura... c\'est loin, au sud-ouest de Mirage.', 'Tu y es presque !'][s]].filter(Boolean), who);
    } });
    const m = JAR;
    pnj(m, 'q:jardinier', 20, 12, { sprite: 'jardinier', talk: async (A) => {
      if (await lettre('le jardinier', 'jardin')(A)) return;
      const s = A.step('songes'), who = 'Jardinier Firmin';
      if (s === 1) {
        await A.say(['Des cauchemars qui ne finissent pas ? Une ombre aux yeux bleus ?', 'Hmm... Ça ressemble à Darkrai, le seigneur des cauchemars. Mais il ne vient jamais sans raison.', 'Ce qui chasse ses cauchemars, c\'est une Plume Lune, la plume de Cresselia.', 'Les soirs clairs, Cresselia danse sur l\'îlot du Lac Miroir. Il faut surfer pour y aller.'], who);
        await A.set('songes', 2); return;
      }
      if (s === 2) { await A.say('Cresselia danse sur l\'îlot, à l\'ouest du Lac Miroir. Avec Surf, tu la trouveras.', who); return; }
      if (s === 4) { await A.say(night(A.game) ? 'Chut... J\'ai entendu des pas près de la fontaine.' : 'Les gens en noir ? Ils viennent après la tombée de la nuit, je crois. Reviens ce soir.', who); return; }
      await A.say(['Ce jardin, je l\'ai planté avec ma femme, il y a cinquante ans.', 'On dit qu\'il fait faire de beaux rêves à qui s\'y promène.'], who);
    } });
    sbire(m, 'q:jardin1', 25, 22, 'left', 'Sbire de la Brume', 'Sbire', [[435, 36], [198, 36]], { sight: 3, when: (f, g) => st(f, 'songes') === 4 && night(g), intro: 'Le jardin est fermé la nuit ! Dégage !' });
    pnj(m, 'q:ariane1', 20, 21, { sprite: 'ariane', dir: 'right', when: (f, g) => st(f, 'songes') === 4 && night(g), talk: async (A) => {
      const r = await A.fight({ cls: 'Admin de la Brume', name: 'Ariane', bs: 'ariane', prize: 100, team: [[429, 38], [510, 38], [24, 39]], intro: ['Tiens, tiens. Un petit curieux.', 'Mon projecteur attire Darkrai, le maître des cauchemars. Les rêves de ces enfants sont l\'appât.', 'Darkrai obéira bientôt à la Brume. Et toi, tu vas faire de beaux cauchemars !'], lose: 'Grr... Mon projecteur...' });
      if (r !== 'win') return;
      await A.say(['Peu importe ! Darkrai a déjà senti l\'appel.', 'J\'emporte le projecteur au Temple Kagura. Dans le sanctuaire, son pouvoir sera cent fois plus fort.', 'Au revoir, petit héros.'], 'Ariane');
      await A.walk('q:ariane1', 'down', 4, true);
      await A.set('songes', 5);
    } });
  }
  // Cresselia sur l'îlot du lac
  legend({ id: 'cresselia', sp: 488, lvl: 45, map: 'lac', x: 25, y: 17, cond: (f) => st(f, 'songes') >= 2, intro: ['Une créature aux ailes de lune danse au-dessus des fleurs...', 'C\'est Cresselia !'],
    after: async (A, res) => {
      if (res === 'lose' || A.has('plume-lune') || A.step('songes') !== 2) return;
      await A.say('Une plume scintillante est restée sur l\'îlot...'); await A.give('plume-lune'); await A.set('songes', 3);
    } });

  /** la fontaine du jardin : les sept Éclats d'Étoile (Jirachi) */
  const fontaine = async (A) => {
    const n = A.st.bag['eclat-etoile'] || 0, s = A.step('voeu');
    if (s === 'fin' || A.f.jirachiCall) { await A.say('L\'eau de la fontaine scintille comme un ciel étoilé.'); return; }
    if (!s) {
      await A.say(['Une plaque est gravée au bord de la fontaine :', '« Qui jettera sept éclats d\'étoile dans cette eau verra son vœu s\'éveiller. »']);
      await A.set('voeu', 1); return;
    }
    if (n < 7) { await A.say(`Il te faut sept Éclats d'Étoile. Tu en as ${n}.`); return; }
    if (!(await A.yesNo('Jeter les sept Éclats d\'Étoile dans la fontaine ?'))) return;
    A.take('eclat-etoile', 7); A.flash('#fff8c0'); A.sfx('heal');
    await A.say(['Les éclats s\'enfoncent dans l\'eau en tournoyant...', 'Une petite étoile s\'élève de la fontaine et se pose sur le banc !']);
    A.f.jirachiCall = true; await A.set('voeu', 2);
  };
  Q('voeu', {
    name: 'Le vœu de la fontaine', where: 'Jardin des Songes',
    steps: (f, g) => [`Trouver sept Éclats d'Étoile cachés dans les nouveaux lieux de la région (${g?.state?.bag?.['eclat-etoile'] || 0} / 7) et les jeter dans la fontaine.`, 'Une petite étoile attend sur un banc du jardin.'],
    end: 'Le vœu s\'est réalisé.',
  });
  legend({ id: 'jirachi', sp: 385, lvl: 30, map: 'jardin', x: 18, y: 15, cond: (f) => !!f.jirachiCall, intro: ['Une petite créature dort, une étoile sur la tête...', 'Jirachi ouvre un œil !'],
    after: async (A, res) => { if (res !== 'lose') await A.set('voeu', 'fin'); } });
  // Créfadet : quand les trois gardiens des lacs se sont montrés
  legend({ id: 'azelf', sp: 482, lvl: 50, map: 'jardin', x: 34, y: 14, cond: (f) => !!f['L:mesprit'] && !!f['L:uxie'], intro: ['Une silhouette bleue flotte au-dessus de l\'étang...', 'Créfadet, le troisième gardien, a senti ses deux frères.'] });

  /* ====================================================================================================
     Forêt des Torii et Temple Kagura (au sud-ouest de Mirage, à l'ouest de la route 7, sur la carte du monde)
     Quêtes : talismans, Darkrai, Créhelf. Un sentier sinueux sous les érables d'automne, une allée de torii
     qui monte vers l'enceinte du temple, perchée sur une butte (escalier de pierre) : jardin japonais, étang
     aux carpes et pont rouge, gravier ratissé, mousse, lanternes de pierre.
     ==================================================================================================== */
  const TOR = W;
  const sanctuaire = room('kagura:sanctuaire', 11, 9, { floor: 'temple', music: 'mystic', name: 'Sanctuaire Kagura', wall: 'wall_league' });
  maps[sanctuaire.id] = sanctuaire;
  const KX = 205, KY = 157;   // enceinte du temple (34 × 26) ; l'allée des torii descend de sa porte sud
  // la forêt est construite dans son ancien repère (x 158 → 275) ; sur la grande carte, l'atelier la pose décalée
  // (ctx.atelierTorii, world/atelier.js) : DT est ce décalage, pour ce qui se pose ensuite sur la carte du monde
  const DT = ctx.decalTorii || [0, 0];
  const construireTorii = (W) => {
    const toriiXY = {};
    {
      const m = W;
      // la forêt : des érables partout (les arbres de la zone prennent leurs couleurs d'automne)
      m.zone(204, 152, 275, 197, { name: 'Forêt des Torii', music: 'forest', enc: ENC.torii, theme: 'automne', route: 'torii', prio: 0 });
      // le sentier, depuis la route 7 : il serpente vers le sud-ouest, longe la côte et rejoint l'allée des torii
      const path = sinueuse([[276, 164.5], [271, 168], [266, 167.5], [259, 171], [252, 179], [244, 184], [236, 189.5], [229, 191.5], [222.5, 191.5]], 2.5);
      carveRoute(m, path, { seed: 4242, w: 9, grass: 1.0, tall: T.TALL, trees: 0.06, flowers: 0.01, taperStart: true, taperEnd: false });
      routes.push({ id: 'torii', name: 'Forêt des Torii', pts: path });
      m.sign(280, 162, 'FORÊT DES TORII ←\nTemple Kagura · Tour Dorée · Tour Cendrée.');
      // l'allée des torii : du bout du sentier jusqu'au pied de l'escalier du temple, un portique toutes les deux rangées
      m.rect(219, 183, 224, 193, T.GRASS, [T.TREE, T.TALL, T.FLOWER]); m.rect(221, 183, 222, 193, T.PATH);
      for (const y of [184, 186, 188, 190, 192]) {
        m.prop('torii', 221, y, false, { dz: 0.95, w: 2 });
        for (const x of [220, 223]) { m.under.set(key(x, y), T.GRASS); m.set(x, y, T.BLOCK); }
      }
      for (const y of [185, 189, 193]) for (const x of [219, 224]) m.prop('lanterne', x, y);
      toriiXY.allee = [221, 192];
      // un ruisseau qui descend vers la mer et, à l'écart du sentier, une source et sa stèle (un talisman y est caché)
      m.blob(264.5, 184, 3.2, 2, T.WATER, rng(5), [T.TREE, T.GRASS, T.TALL]);
      m.rect(262, 186, 263, 188, T.WATER, [T.TREE, T.GRASS]);
      m.rect(258, 179, 268, 182, T.GRASS, [T.TREE]); m.rect(259, 180, 266, 180, T.PATH, [T.GRASS]);
      m.prop('stele', 267, 181);
      for (const [x, y] of [[258, 182], [268, 183], [261, 178]]) if (m.get(x, y) === T.TREE) m.prop('rocher_grand', x, y);
      // l'enceinte du temple, sur sa butte : au fond, dans l'axe de l'allée des torii, la Tour Dorée (l'ancienne Tour de la
      // Grue, voisine de la Tour Cendrée) ; à gauche, le pavillon du Temple Kagura ; à droite, le jardin sec et la cloche ;
      // devant, l'étang aux carpes (à gauche de l'allée) et le Centre de soins (à droite)
      const K = { id: 'kagura', name: 'Temple Kagura', x: KX, y: KY, w: 34, h: 26, exits: [['s', 16]], stock: 6, music: 'mystic', theme: 'automne',
        roads: [[16, 13, 17, 25, T.PAVE], [11, 13, 22, 14, T.PAVE], [5, 10, 6, 14, T.PATH], [7, 13, 10, 14, T.PATH], [23, 13, 27, 13, T.PATH], [18, 22, 27, 22, T.PAVE]],
        deco: [
          // lanternes de pierre : au pied de la tour et le long de l'allée
          ['lanterne', 12, 15], ['lanterne', 21, 15], ['lanterne', 14, 17], ['lanterne', 19, 17], ['lanterne', 14, 20], ['lanterne', 19, 20], ['lanterne', 14, 23], ['lanterne', 19, 23],
          // jardin sec (gravier ratissé et rochers) à l'est de la tour, bordé de mousse
          ['sand', 23, 3, 30, 8], ['rocher_grand', 25, 4], ['rocher_grand', 28, 7], ['butte', 24, 7],
          ['flowers', 23, 9, 30, 9], ['flowers', 31, 3, 31, 8],
          // l'étang aux carpes, au sud-ouest, et son pont rouge
          ['water', 7, 18, 3.6, 2.2],
          // érables et cerisiers du jardin
          ['trees', 2, 21, 3, 23], ['trees', 30, 10, 31, 12],
          ['erable', 10, 2], ['erable', 22, 2], ['arbre_automne', 12, 20], ['erable', 22, 17], ['arbre_automne', 7, 23], ['cerisier', 30, 15], ['erable', 2, 15],
          ['sign', 15, 14, 'TOUR DORÉE\nAutrefois appelée Tour de la Grue.\nLà où l\'oiseau arc-en-ciel se posait jadis.'],
          ['sign', 8, 11, 'TEMPLE KAGURA\nOn y prie pour les rêves paisibles.'],
          ['sign', 15, 23, 'TEMPLE KAGURA\n↑ Tour Dorée · ← Temple · → Centre de soins']],
        buildings: [
          tourDoree(ctx, 11, 2),
          // le temple garde son intérieur (et son identifiant de carte) : pavillon de bois rouge à double toit
          { kind: 'tower', ...GRAND.pavillon, x: 2, y: 3, roof: 'red', opts: { toit: '#7a3a2a' }, name: 'Temple Kagura', mapId: 'kagura:tower13', interior: (id) => templeInterior(id) },
          { kind: 'center', ...GRAND.center, x: 24, y: 17 },
        ],
        npcs: [{ id: 'moine', x: 9, y: 12, sprite: 'pretre', move: 'turn', text: ['Le temple garde la mémoire des rêves de la région.', 'Au fond, derrière l\'autel, se trouve le sanctuaire. Seul le Grand Prêtre peut l\'ouvrir.', 'La tour dorée, à côté, appartient aux Sages. Ils ne laissent monter que ceux qui viennent en paix.'] }],
      };
      buildTown(m, maps, K);
      // pont rouge en travers de l'étang (d'une rive à l'autre), puis un chemin jusqu'à l'allée
      for (let x = KX + 2; x <= KX + 12; x++) if (m.get(x, KY + 18) === T.WATER) m.set(x, KY + 18, T.BRIDGE);
      m.rect(KX + 12, KY + 18, KX + 15, KY + 18, T.PATH, [T.GRASS, T.FLOWER, T.SAND]);
      // coussins de mousse sous les érables et au bord de l'étang
      for (const [x, y, rx, ry] of [[3.5, 12, 1.6, 1], [12.5, 17, 1.4, 1], [21, 19.5, 1.4, 1.1], [29, 14.5, 1.2, 1.4], [11, 22, 2, 1], [27, 10.5, 2.4, 0.8]]) m.blob(KX + x, KY + y, rx, ry, T.FLOWER, rng(x * 13 + y), [T.GRASS]);
      // des carpes koï dans l'étang
      for (const [x, y] of [[KX + 5, KY + 17], [KX + 9, KY + 19], [KX + 8, KY + 17], [KX + 6, KY + 19]]) if (m.get(x, y) === T.WATER) m.deco.push({ k: 'koi', x, y });
      // la butte : toute l'enceinte est un niveau plus haut, l'escalier de pierre descend vers l'allée des torii
      plateau(m, rectangle(KX, KY, KX + 33, KY + 24), 1);   // la paroi prend la rangée du bas de l'enceinte
      // la cloche, à l'est de la cour (entre le jardin sec et le Centre de soins)
      chose(m, 'cloche', KX + 28, KY + 11, { use: async (A) => cloche(A) });
      m.item(...spot(m, 274, 176), 'eclat-etoile', 1, 'etoile:torii1'); m.item(...spot(m, KX + 3, KY + 13), 'eclat-etoile', 1, 'etoile:torii2');
      m.item(...spot(m, 247, 177), 'ultra-ball', 2); m.item(...spot(m, 233, 186), 'max-repel');
      trainerNpc(m, ...spot(m, 270, 172), 'left', 'Médium', 'Ombeline', [[92, 35], [200, 36]], { sight: 4 });
      trainerNpc(m, ...spot(m, 251, 183), 'right', 'Moine', 'Jōkan', [[163, 36], [177, 36], [302, 37]], { sight: 4, intro: 'La forêt éprouve ceux qui marchent vers le temple.' });
      trainerNpc(m, ...spot(m, 224, 189), 'left', 'Dame Kimono', 'Sakura', [[196, 37], [197, 37]], { sight: 2, intro: 'Je danse pour les esprits de la forêt. Danse avec moi !' });
    }
    // la forêt agrandie vers l'ouest, ses sentiers, son relief, et la Tour Cendrée (world/cendree.js)
    addCendree({ W, maps, trainerNpc, spot, enc: ENC.torii });
  };
  (ctx.atelierTorii || ((f) => f(W)))(construireTorii);
  function templeInterior(id) {
    const m = room(id, 13, 10, { floor: 'temple', music: 'mystic', name: 'Temple Kagura', wall: 'wall_league' });
    m.prop('brasero', 2, 2); m.prop('brasero', 10, 2); m.prop('statue_dragon', 1, 5); m.prop('statue_dragon', 11, 5);
    m.prop('coussin', 4, 6, false); m.prop('coussin', 8, 6, false);
    // l'autel et, derrière, la porte du sanctuaire (case qui fait changer de carte)
    m.prop('sanctuaire', 6, 2); m.set(6, 3, T.FLOOR);
    m.warp(6, 3, { map: sanctuaire.id, x: 5, y: 7, dir: 'up', step: true });
    m.npc({ id: id + ':portier', x: 6, y: 4, sprite: 'pretre', dir: 'down', gate: { open: (f) => st(f, 'songes') >= 5, tiles: [[6, 3]] }, text: ['Derrière moi se trouve le sanctuaire du temple.', 'Seuls ceux que les rêves appellent peuvent y entrer.'] });
    m.gates.push({ npc: id + ':portier', open: (f) => st(f, 'songes') >= 5, tiles: [[6, 3]] });
    m.npc({ id: id + ':pretre', x: 3, y: 4, sprite: 'pretre', dir: 'right', talk: async (A) => pretre(A) });
    sanctuaire.warp(sanctuaire.exitX, sanctuaire.exitY, { map: id, x: 6, y: 5, dir: 'down' });
    sanctuaire.outside = { map: id, x: 6, y: 5 };
    return m;
  }
  {
    const s = sanctuaire;
    s.prop('statue_dragon', 2, 2); s.prop('statue_dragon', 8, 2); s.prop('brasero', 1, 6); s.prop('brasero', 9, 6);
    pnj(s, 'q:ariane2', 5, 5, { sprite: 'ariane', dir: 'up', when: (f) => st(f, 'songes') === 5, talk: async (A) => {
      const r = await A.fight({ cls: 'Admin de la Brume', name: 'Ariane', bs: 'ariane', prize: 140, team: [[429, 44], [510, 43], [24, 43], [442, 45]], intro: ['Encore toi ?! Regarde, il arrive...', 'Quand Darkrai sera à nous, la Brume régnera sur les rêves de toute la région !'], lose: 'Non... Le projecteur s\'éteint...' });
      if (r !== 'win') return;
      await A.say(['Le projecteur est fichu. Darkrai ne nous obéira jamais...', 'Nox va être furieux. Mais il a l\'Orbe Rouge, lui. Le reste n\'a plus d\'importance.'], 'Ariane');
      await A.walk('q:ariane2', 'down', 2, true);
      A.flash('#202040'); A.cry(491);
      await A.say(['Les braseros vacillent. Une ombre se lève au fond du sanctuaire...']);
      await A.set('songes', 6);
    } });
    legend({ id: 'darkrai', sp: 491, lvl: 50, map: s.id, x: 5, y: 3, cond: (f) => st(f, 'songes') === 6 || (done(f, 'songes') && f['L:darkrai'] !== 'caught'), intro: ['Une ombre aux yeux bleus te fixe.', 'Darkrai, le seigneur des cauchemars...'],
      after: async (A, res) => { if (res !== 'lose' && A.step('songes') === 6) { await A.say('L\'air du sanctuaire devient léger, comme au réveil d\'un long rêve.'); await A.set('songes', 7); } } });
  }
  Q('kagura', {
    name: 'Les talismans du Temple Kagura', where: 'Mirage',
    steps: (f, g) => [
      `Retrouver les trois talismans volés dans la Forêt des Torii (${g?.state?.bag?.talisman || 0} / 3).`,
      'Rapporter les talismans au Grand Prêtre du Temple Kagura.',
      'Faire sonner la cloche du temple, à l\'est de la cour.',
    ],
    end: 'La cloche du Temple Kagura chante de nouveau. La Brume, elle, a emporté l\'Orbe Rouge.',
  });
  {
    const MI = Object.values(towns).find((t) => t.id === 'mirage');
    pnj(W, 'q:sakura', MI.x + 8, MI.y + 18, { sprite: 'kimono', talk: async (A) => {
      const s = A.step('kagura'), who = 'Dame Kimono Hana';
      if (s === 'fin') { await A.say('La cloche du temple sonne chaque matin, maintenant. Merci, voyageur.', who); return; }
      if (!s) {
        if (A.badges() < 5) { await A.say(['Je viens du Temple Kagura, dans la Forêt des Torii, au sud-ouest de Mirage.', 'Il s\'y passe des choses terribles... Mais il faudrait un dresseur plus aguerri.'], who); return; }
        await A.say(['Voyageur... tu portes le badge de Sibylle. Écoute-moi.', 'Des gens en gris ont pillé le Temple Kagura, dans la Forêt des Torii, au sud-ouest.', 'Ils ont volé les trois talismans qui éveillent la cloche, et ils fouillent la forêt.', 'Sans la cloche, les esprits de la forêt s\'agitent. Peux-tu retrouver les talismans ?'], who);
        await A.set('kagura', 1); return;
      }
      await A.say('La Forêt des Torii s\'ouvre à l\'ouest de la route 7. Sois prudent.', who);
    } });
    const m = W;
    const tal = async (A) => { if ((A.st.bag.talisman || 0) < 3) { await A.give('talisman'); if ((A.st.bag.talisman || 0) >= 3) { await A.say('Les trois talismans sont réunis ! Il faut les rapporter au Grand Prêtre.'); await A.set('kagura', 2); } } };
    sbire(m, 'q:tor1', 262 + DT[0], 170 + DT[1], 'left', 'Sbire de la Brume', 'Sbire', [[262, 36], [42, 37], [110, 37]], { sight: 4, when: (f) => st(f, 'kagura') >= 1, intro: 'Un talisman ? Il est à la Brume, maintenant !', lose: 'Rah... Prends-le, ton bout de papier !', onWin: tal });
    sbire(m, 'q:tor2', 241 + DT[0], 188 + DT[1], 'down', 'Sbire', 'Sbire', [[198, 37], [435, 38]], { sight: 4, bs: 'brume_f', ow: 'brume_f', when: (f) => st(f, 'kagura') >= 1, intro: 'On cherche un orbe, pas des talismans. Mais je garde celui-là !', lose: 'Bon, bon...', onWin: tal });
    m.object(267 + DT[0], 181 + DT[1], { use: async (A) => {
      if (A.step('kagura') !== 1 || A.f.talCascade) { await A.say('« Ici, l\'eau chante pour les esprits. »'); return; }
      A.f.talCascade = true; await A.say(['Une stèle couverte de mousse. Quelque chose est coincé derrière...', 'Un talisman ! Un sbire a dû le cacher là.']); await tal(A);
    } });
  }
  /** le Grand Prêtre (talismans, cloche, lettre du facteur) */
  async function pretre(A) {
    if (await lettre('le Grand Prêtre', 'pretre')(A)) return;
    const s = A.step('kagura'), who = 'Grand Prêtre Ōmi';
    if (s === 2 && A.has('talisman', 3)) {
      A.take('talisman', 3);
      await A.say(['Les trois talismans ! Les esprits t\'ont guidé.', 'Accroche-les à la cloche, dans la cour, et fais-la sonner. Elle apaisera la forêt.', 'Mais les voleurs ont aussi pris ce que nous gardions depuis mille ans : l\'Orbe Rouge.', 'Il calme Groudon, le géant des terres, endormi sous un volcan loin à l\'est.', 'Entre de mauvaises mains, il peut aussi le réveiller...'], who);
      await A.set('kagura', 3); return;
    }
    if (s === 3) { await A.say('La cloche est dans la cour, à l\'est du temple.', who); return; }
    if (s === 'fin') { await A.say(['Les esprits sont apaisés. Mais l\'Orbe Rouge...', A.f.champion ? 'Tu es Maître de la Ligue, maintenant. Le capitaine de l\'Embarcadère pourra te mener à l\'Île du Magma.' : 'Quand tu seras Maître de la Ligue, va voir le capitaine de l\'Embarcadère. Il connaît la route de l\'île de feu.'], who); return; }
    if (A.step('songes') === 5) { await A.say(['Une femme en noir est entrée dans le sanctuaire avec une machine...', 'Le sanctuaire t\'est ouvert. Va, et chasse l\'ombre.'], who); return; }
    await A.say(['Bienvenue au Temple Kagura.', 'Ici, on prie pour que les rêves des enfants restent doux.'], who);
  }
  async function cloche(A) {
    if (A.step('kagura') !== 3) { await A.say(A.step('kagura') === 'fin' ? 'La cloche vibre doucement au vent.' : 'Une grande cloche de bronze. Sans ses talismans, elle reste muette.'); return; }
    A.sfx('badge'); A.flash('#fff4c0');
    await A.say(['Tu accroches les talismans et tu tires la corde...', 'DOOONG... Le son roule dans toute la forêt.', 'Près de l\'étang du temple, quelque chose remue...']);
    await A.give('ultra-ball', 5);
    await A.set('kagura', 'fin');
  }
  legend({ id: 'uxie', sp: 480, lvl: 45, map: 'monde', x: KX + 7 + DT[0], y: KY + 15 + DT[1], cond: (f) => done(f, 'kagura'), intro: ['Une créature jaune médite au bord de l\'étang, les yeux clos.', 'Créhelf, le gardien du savoir.'] });

  /* ====================================================================================================
     Île du Magma (bateau de l'Embarcadère, pour le Maître) · Quête : Le cœur du volcan (Groudon, Heatran)
     ==================================================================================================== */
  const MAG = outdoor('magma', 80, 72, { name: 'Île du Magma', music: 'island', fill: T.WATER });
  {
    const m = MAG;
    m.blob(40, 38, 33, 30, T.TREE, rng(13));
    m.blob(40, 30, 22, 18, T.ASH, rng(14), [T.TREE]);
    // Fumerolle, le village du port
    buildTown(m, maps, {
      id: 'fumerolle', name: 'Fumerolle', x: 10, y: 44, w: 30, h: 18, exits: [['n', 14], ['e', 8]], stock: 7, music: 'island', ground: T.ASH, theme: 'volcanic',
      roads: [[2, 8, 27, 9, T.PATH], [14, 2, 15, 15, T.PATH]],
      deco: [['lamp', 13, 7], ['lamp', 16, 7], ['sign', 12, 10, 'FUMEROLLE\nLe village au pied du volcan.'], ['brasero', 9, 12], ['brasero', 20, 12]],
      buildings: [
        { kind: 'center', x: 3, y: 2 }, { kind: 'mart', x: 9, y: 2 },
        { kind: 'house', x: 21, y: 2, roof: 'orange', id: 'ancien', name: 'Maison de l\'Ancien', npcs: [{ id: 'ancien', x: 4, y: 4, sprite: 'vieil_homme', talk: async (A) => ancien(A) }] },
        { kind: 'house', x: 21, y: 11, roof: 'gray', id: 'volcanologue', npcs: [{ x: 2, y: 4, sprite: 'montagnard', text: ['Le volcan gronde depuis l\'arrivée des gens en gris.', 'Ils ont construit une base au nord, juste sous le cratère.'] }] },
      ],
      npcs: [{ id: 'enfant', x: 6, y: 12, sprite: 'enfant', move: 'wander', text: ['La terre est chaude, ici ! On peut faire cuire des œufs dans le sable !'] }],
    });
    // quai
    m.rect(10, 52, 12, 53, T.PATH, [T.TREE, T.WATER]);
    for (let x = 4; x <= 9; x++) if (m.get(x, 53) === T.WATER || m.get(x, 53) === T.TREE) m.set(x, 53, T.BRIDGE);
    for (let x = 3; x <= 9; x++) for (const y of [52, 54]) if (m.get(x, y) === T.TREE) m.set(x, y, T.WATER);
    m.npc({ id: 'quai:magma', x: 4, y: 53, dir: 'right', sprite: 'capitaine', script: 'ferry', dock: 'magma' });
    docks.magma = { name: 'Île du Magma (Fumerolle)', map: 'magma', x: 6, y: 53, dir: 'right', badges: 8, show: (f) => !!f.champion };
    // Sentier des Cendres jusqu'au pied du volcan
    carveRoute(m, [[24.5, 44], [24.5, 34], [36, 26], [48, 22], [56, 20]], { seed: 99, w: 9, grass: 0.8, tall: T.TALL, trees: 0.02, rocks: 0.05, overwrite: false, ground: T.ASH, taperStart: false });
    for (const [x, y, rx, ry] of [[30, 28, 3.5, 2.5], [46, 30, 4, 2.5], [36, 36, 3, 2], [20, 30, 2.5, 3], [50, 24, 3, 2]]) m.blob(x, y, rx, ry, T.TALL, rng(x * 7 + y), [T.ASH]);
    m.zone(0, 0, 79, 71, { name: 'Sentier des Cendres', music: 'volcano', enc: ENC.magma, theme: 'volcanic', route: 'magma', prio: 0 });
    m.zone(10, 44, 39, 61, { name: 'Fumerolle', music: 'island', town: 'fumerolle', theme: 'volcanic' });
    m.item(...spot(m, 30, 32), 'eclat-etoile', 1, 'etoile:magma'); m.item(...spot(m, 44, 28), 'max-potion', 2); m.item(...spot(m, 20, 36), 'full-restore');
    trainerNpc(m, ...spot(m, 30, 30), 'right', 'Karatéka', 'Dante', [[68, 56], [297, 56], [454, 57]], { sight: 4 });
    trainerNpc(m, ...spot(m, 42, 24), 'down', 'Montagnard', 'Tobias', [[76, 57], [324, 57], [112, 58]], { sight: 4 });
    m.outside = { map: 'monde', x: 56, y: 214 };
  }
  // la base de la Brume (au bout du sentier) et la Caverne du Magma (derrière)
  const base = room('magma:base', 15, 12, { floor: 'base', music: 'tower', name: 'Base de la Brume', wall: 'wall_gym' });
  maps[base.id] = base;
  {
    const m = MAG, b = base;
    const B = m.building('bighouse', 53, 14, { roof: 'gray', name: 'Base de la Brume' });
    b.outside = { map: 'magma', x: B.doorX, y: B.doorY + 1, dir: 'down' };
    b.warp(b.exitX, b.exitY, b.outside); m.warp(B.doorX, B.doorY, { map: b.id, x: b.exitX, y: b.exitY, dir: 'up' });
    for (let y = B.doorY + 1; y < B.doorY + 6; y++) { if (m.get(B.doorX, y) === T.PATH) break; m.set(B.doorX, y, T.PATH); }
    for (const [x, y, k] of [[1, 2, 'console'], [3, 2, 'ecran_carte'], [11, 2, 'cuve'], [13, 2, 'cuve'], [1, 9, 'caisses'], [13, 9, 'caisses'], [9, 2, 'machine_labo']]) b.prop(k, x, y);
    sbire(b, 'q:base1', 4, 8, 'right', 'Sbire de la Brume', 'Sbire', [[262, 57], [110, 57], [42, 58]], { sight: 4, when: (fl) => st(fl, 'magma') >= 1 });
    sbire(b, 'q:base2', 10, 8, 'left', 'Sbire', 'Sbire', [[435, 58], [229, 58]], { sight: 4, bs: 'brume_f', ow: 'brume_f', when: (fl) => st(fl, 'magma') >= 1 });
    sbire(b, 'q:base3', 4, 5, 'right', 'Sbire de la Brume', 'Sbire', [[560, 58], [454, 58], [169, 59]], { sight: 4, when: (fl) => st(fl, 'magma') >= 1 });
    sbire(b, 'q:base4', 10, 5, 'left', 'Sbire', 'Sbire', [[510, 59], [430, 59]], { sight: 4, bs: 'brume_f', ow: 'brume_f', when: (fl) => st(fl, 'magma') >= 1 });
    pnj(b, 'q:sylas3', 7, 4, { sprite: 'sylas', when: (fl) => st(fl, 'magma') === 1 && !fl.sylas3, talk: async (A) => {
      const r = await A.fight({ cls: 'Admin de la Brume', name: 'Sylas', bs: 'sylas', prize: 200, team: [[169, 60], [110, 60], [319, 61], [430, 61], [452, 62]], intro: ['Le Maître de la Ligue en personne ! Je savais qu\'on se reverrait.', 'Le chef Nox est juste derrière moi, avec l\'Orbe Rouge. Ce soir, Groudon se réveille !'], lose: 'C\'est fini pour moi...' });
      if (r !== 'win') return;
      await A.say(['Je... je n\'ai jamais voulu réveiller un volcan, moi.', 'Prends ce passe. Arrête-le avant qu\'il ne fasse sauter l\'île.'], 'Sylas');
      await A.give('cle-base'); A.f.sylas3 = true; A.game.refreshNpcs();
    } });
    pnj(b, 'q:nox1', 7, 2, { sprite: 'nox', when: (fl) => st(fl, 'magma') === 1 && fl.sylas3, talk: async (A) => {
      const r = await A.fight({ cls: 'Chef de la Brume', name: 'Nox', bs: 'nox', prize: 300, team: [[553, 63], [229, 63], [461, 64], [452, 64], [248, 65]], intro: ['Alors c\'est toi, l\'enfant qui défait chacun de mes plans.', 'Ponyta, le lac, les talismans, Darkrai... Des broutilles.', 'Ce qui compte, c\'est ceci : l\'Orbe Rouge. Avec lui, Groudon m\'obéira, et cette région sera à la Brume !'], lose: 'Impossible...' });
      if (r !== 'win') return;
      await A.say(['Tu es fort. Mais l\'Orbe est déjà chaud. Le géant s\'éveille.', 'Rejoins-moi au fond de la Caverne du Magma, si tu l\'oses !'], 'Nox');
      await A.walk('q:nox1', 'up', 0, true);
      await A.set('magma', 2);
    } });
  }
  const caverne = caveMap('magma:caverne', 48, 34, 6161, [{ x: 6, y: 29 }], { name: 'Caverne du Magma', via: [{ x: 16, y: 10 }, { x: 32, y: 22 }, { x: 40, y: 6 }] });
  caverne.encounter = ENC.caverne; maps[caverne.id] = caverne;
  {
    const m = MAG, c = caverne;
    caveLink(m, 42, 10, c, 6, 29);
    for (let y = 13; y < 22; y++) { if (m.get(44, y) === T.PATH) break; if (m.get(44, y) === T.TREE || m.get(44, y) === T.ASH) m.set(44, y, T.PATH); }
    c.rect(36, 2, 45, 9, T.CAVE); c.prop('brasero', 37, 3); c.prop('brasero', 44, 3);
    pnj(c, 'q:nox2', 40, 6, { sprite: 'nox', dir: 'up', when: (fl) => st(fl, 'magma') === 2, talk: async (A) => {
      const r = await A.fight({ cls: 'Chef de la Brume', name: 'Nox', bs: 'nox', prize: 500, team: [[553, 67], [229, 67], [461, 68], [452, 68], [635, 69], [248, 70]], intro: ['Tu es venu... Parfait. Regarde !', 'L\'Orbe Rouge brille. La lave monte. GROUDON, RÉVEILLE-TOI !'], lose: 'Le volcan... ne m\'écoute pas...' });
      if (r !== 'win') return;
      await A.say(['L\'Orbe... il m\'échappe !', 'Groudon ne m\'obéit pas. Il ne m\'a jamais obéi.', '... La Brume est finie. Fais ce que tu veux.'], 'Nox');
      await A.walk('q:nox2', 'down', 3, true);
      await A.give('orbe-rouge');
      A.flash('#ff8040'); A.cry(383);
      await A.say(['La caverne tremble. Une masse rouge émerge de la lave...']);
      await A.set('magma', 3);
    } });
    legend({ id: 'groudon', sp: 383, lvl: 70, map: c.id, x: 40, y: 3, cond: (fl) => st(fl, 'magma') === 3 || (done(fl, 'magma') && fl['L:groudon'] !== 'caught'), intro: ['Groudon, le géant des terres, pose sur toi un regard brûlant.', 'L\'Orbe Rouge pulse dans ton sac...'],
      after: async (A, res) => { if (res !== 'lose' && A.step('magma') === 3) { await A.say('Le grondement du volcan s\'apaise peu à peu.'); await A.set('magma', 4); } } });
    caveItems(c, ['max-revive' in ITEMS ? 'max-revive' : 'revive', 'ultra-ball', 'max-potion', 'full-heal', 'fire-stone'], 61);
    // Cratère Ardent : à l'est du sentier, fermé tant que la Brume tient l'île
    m.rect(59, 28, 72, 40, T.TREE); m.rect(61, 30, 70, 38, T.ASH); m.rect(56, 33, 60, 34, T.PATH);
    m.prop('rocher_grand', 61, 31); m.prop('rocher_grand', 69, 36); m.prop('brasero', 62, 37);
    const g = m.npc({ id: 'magma:garde-cratere', x: 58, y: 35, dir: 'left', sprite: 'montagnard', gate: { open: (fl) => done(fl, 'magma'), tiles: [[57, 33], [57, 34]] }, text: ['Le Cratère Ardent est trop dangereux tant que le volcan gronde.', 'Les gens en gris l\'ont réveillé. Il faudrait les chasser de l\'île.'] });
    m.gates.push({ npc: g.id, open: (fl) => done(fl, 'magma'), tiles: [[57, 33], [57, 34]] });
    m.zone(58, 29, 72, 40, { name: 'Cratère Ardent', music: 'mystic', theme: 'volcanic' });
    legend({ id: 'heatran', sp: 485, lvl: 68, map: 'magma', x: 66, y: 33, cond: (fl) => done(fl, 'magma'), intro: ['La roche fond sous de lourdes pattes de métal...', 'Heatran sort du cratère !'] });
  }
  async function ancien(A) {
    const s = A.step('magma'), who = 'Ancien de Fumerolle';
    if (s === 'fin') { await A.say(['L\'île respire à nouveau. Tu as fait plus que tous les Maîtres avant toi.', 'On dit que dans le Cratère Ardent, à l\'est, vit un gardien de métal et de feu...'], who); return; }
    if (!s) {
      await A.say(['Le Maître de la Ligue, chez nous ? Les esprits ont entendu nos prières.', 'Des gens en gris ont pris le volcan. La Brume, qu\'ils s\'appellent.', 'Leur base est au nord, au bout du Sentier des Cendres. Ils veulent réveiller ce qui dort sous la montagne.', 'Je t\'en prie, arrête-les.'], who);
      await A.set('magma', 1); return;
    }
    if (s === 4) {
      await A.say(['Le volcan s\'est tu. Et Groudon... tu l\'as vu ?', 'L\'Orbe Rouge doit rester ici, sur son île. Garde-le précieusement.', 'Accepte ceci : la dernière Master Ball de notre village. Elle attendait un vrai Maître.'], who);
      if (!ITEMS['master-ball']) ITEMS['master-ball'] = { pocket: 'balls', price: 0, ball: 255, desc: 'La meilleure Ball qui soit. Elle capture à coup sûr.' };
      await A.give('master-ball'); await A.give('rare-candy', 5);
      await A.set('magma', 'fin'); return;
    }
    await A.say(s === 1 ? 'La base de la Brume est au nord du village, au pied du volcan.' : 'Le chef de la Brume s\'est enfui dans la Caverne du Magma ? Dépêche-toi !', who);
  }
  Q('magma', {
    name: 'Le cœur du volcan', where: 'Île du Magma',
    steps: ['Entrer dans la Base de la Brume, au nord de Fumerolle, et arrêter son chef.', 'Nox a fui dans la Caverne du Magma : le rattraper.', 'Groudon s\'est réveillé au fond de la Caverne du Magma...', 'Retourner voir l\'Ancien de Fumerolle.'],
    end: 'La Brume est dissoute. Le volcan dort de nouveau.',
  });

  /* ====================================================================================================
     Quête · Le dragon de pierre (Musée des Dragons, Fort-Écaille) : le Vieil Ambre de la Grotte des Marées
     ==================================================================================================== */
  Q('fossile', {
    name: 'Le dragon de pierre', where: 'Fort-Écaille',
    steps: ['Trouver un morceau d\'ambre ancien. On dit que la Grotte des Marées en cache un.', 'Rapporter le Vieil Ambre au savant du Musée des Dragons.'],
    end: 'Le savant a ranimé un Ptéra, un dragon d\'avant l\'histoire.',
  });
  {
    const musee = Object.values(maps).find((mm) => mm.name === 'Musée des Dragons');
    if (musee) {
      musee.prop('squelette', 3, 6, true, { w: 4 }); for (let x = 4; x <= 6; x++) musee.set(x, 6, T.BLOCK);
      musee.prop('fossile', 8, 6); musee.prop('statue_dragon', 9, 2);
      pnj(musee, 'q:savant', 2, 4, { sprite: 'savant', talk: async (A) => {
        const s = A.step('fossile'), who = 'Savant Ambroise';
        if (s === 'fin') { await A.say('Ptéra va bien ? Quel spectacle, un dragon d\'avant l\'histoire qui vole de nouveau !', who); return; }
        if (A.has('vieil-ambre')) {
          A.take('vieil-ambre');
          await A.say(['Du Vieil Ambre ! Et d\'une telle qualité !', 'Ma machine peut ranimer le Pokémon qui y dort. Patiente un instant...', '...', 'Voilà ! Un Ptéra ! Il est à toi : c\'est toi qui l\'as trouvé.'], who);
          await A.giveMon(142, 40, { met: 'Musée des Dragons' }); await A.set('fossile', 'fin'); return;
        }
        if (!s) { await A.say(['Bienvenue au Musée ! Ce squelette est celui d\'un dragon d\'avant l\'histoire.', 'Je rêve de ranimer un tel Pokémon. Il me faudrait du Vieil Ambre...', 'On dit que les grottes au bord de l\'eau en cachent parfois. La Grotte des Marées, peut-être ?'], who); await A.set('fossile', 1); return; }
        await A.say('Du Vieil Ambre... La Grotte des Marées, au milieu du Lac Miroir, en cache peut-être.', who);
      } });
    }
  }

  return quests;
}

function caveItems(m, items, seed) {
  const r = rng(seed); const floors = [];
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.get(x, y) === T.CAVE) floors.push([x, y]);
  for (const it of items) { const [x, y] = floors[Math.floor(r() * floors.length)]; m.item(x, y, it); }
}
