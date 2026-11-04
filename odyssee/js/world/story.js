// odyssee/js/world/story.js — l'histoire principale posée sur la carte : la Team Éclipse, Lugia Obscur, le Conseil 4,
// les CS de l'histoire (Flash et Force) avec leurs recoins cachés, et les quêtes annexes. Sans DOM.
// Les scènes elles-mêmes (dialogues, combats enchaînés) sont jouées par js/story.js.
//
// Fil de l'histoire, dans l'ordre des arènes :
//   Bois Murmure (1 badge)   — le Dr Lumen est menacé par deux sbires ; il donne Flash.
//   Grotte Lunaire           — Erèbe, Admin Éclipse, pille les Pierres Lune (la grotte est plongée dans le noir).
//   Port-Azur (Marine)       — Nyx interroge le vieux marin sur le Sanctuaire des Marées.
//   Voltacité (Volta)        — la Centrale est occupée et l'Arène fermée ; l'ingénieur donne Force.
//   Route 6 (Coupe)          — le repaire de la Team Éclipse ; Nocturne vaincu, la nuit violette tombe sur la région
//                              et les sbires qui bloquaient Mirage s'en vont.
//   Mirage (Sibylle, Surf)   — la voyante donne la Plume Argentée ; au sud du Cap Mirage, l'Îlot des Marées et son
//                              Sanctuaire : Nocturne y réveille Lugia Obscur. Capturé, le Prof. Saule ouvre son cœur ;
//                              vaincu, il s'envole vers la Grotte des Tourbillons (Île Givrée) où on peut le retrouver.
//   La Route Victoire reste fermée tant que dure l'Éclipse ; à la Ligue, le Conseil 4 précède Célestine.
import { T, walkable } from './tiles.js';
import { GameMap, along, rng } from './mapgen.js';
import { room, leagueInterior } from './interiors.js';
import { SPECIES } from '../data/species.js';

const key = (x, y) => x + ',' + y;

/* ---------------- équipes ---------------- */
// Team Éclipse : des Pokémon officiels (la Brume, elle, garde les créatures de la région)
const GRUNT = {
  a: [[19, 10], [41, 11]], b: [[23, 11], [109, 10]],                                            // Bois Murmure
  c: [[41, 13], [74, 14]], d: [[109, 13], [19, 14]], erebe1: [[41, 15], [109, 15], [198, 17]],  // Grotte Lunaire
  e: [[20, 18], [109, 19]], nyx1: [[41, 20], [228, 21], [215, 22]],                             // Port-Azur
  f: [[81, 24], [100, 24]], g: [[110, 25], [42, 25]], erebe2: [[42, 26], [110, 26], [82, 26], [198, 28]], // Centrale
  h: [[20, 29], [24, 29]], i: [[42, 30], [215, 30]], j: [[110, 30], [89, 31]], k: [[24, 31], [228, 31]], l: [[198, 31], [20, 31]],
  nyx2: [[42, 33], [215, 33], [229, 34], [24, 35]],
  boss1: [[197, 35], [110, 35], [215, 36], [229, 38]],                                          // repaire
  m: [[89, 39], [24, 40], [229, 40]], n: [[42, 40], [110, 40], [215, 41]],
  nyx3: [[169, 41], [215, 41], [229, 42], [24, 42]], erebe3: [[42, 41], [89, 41], [110, 42], [198, 43]],
  boss2: [[197, 43], [215, 43], [94, 44], [110, 43], [229, 45]],                                // Sanctuaire
};
export const ELITE = [
  { id: 'c4:1', name: 'Frimas', ow: 'frimas', bs: 'frimas', team: [[87, 73], [91, 73], [221, 74], [124, 74], [131, 75]], room: 'Salle de Glace', floor: 'gymWater', deco: 'statue',
    intro: 'Bienvenue au Conseil 4. Je suis Frimas. Mon cœur s\'est figé il y a bien longtemps... Le tien tiendra-t-il face au froid ?', lose: 'Ta flamme a fait fondre ma glace. Passe, la salle suivante t\'attend.' },
  { id: 'c4:2', name: 'Spectrel', ow: 'spectrel', bs: 'spectrel', team: [[93, 74], [200, 74], [1023, 75], [94, 76]], room: 'Salle des Ombres', floor: 'gymPsy', deco: 'gymstatue',
    intro: 'Chut... Les esprits me murmurent ton nom depuis que tu es entré. Ils ont hâte de jouer avec toi.', lose: 'Les esprits se taisent... Tu les as impressionnés.' },
  { id: 'c4:3', name: 'Brutus', ow: 'brutus', bs: 'brutus', team: [[237, 75], [106, 75], [107, 75], [1033, 76], [68, 77]], room: 'Salle du Poing', floor: 'gymRock', deco: 'statue',
    intro: 'Je suis Brutus ! J\'ai entraîné mes muscles et ceux de mes Pokémon chaque jour de ma vie. Hoo ! Hah !', lose: 'Ma force n\'a pas suffi... Va. Tu le mérites.' },
  { id: 'c4:4', name: 'Ombrelle', ow: 'ombrelle', bs: 'ombrelle', team: [[197, 76], [198, 76], [215, 77], [229, 77], [248, 78]], room: 'Salle de la Nuit', floor: 'gymDragon', deco: 'gymstatue',
    intro: 'Je suis Ombrelle, la dernière du Conseil 4. Les gentils Pokémon, les méchants Pokémon... Seuls les dresseurs comptent. Montre-moi ce que tu vaux.', lose: 'Tu es fort, et tu aimes tes Pokémon. C\'est ce qui fait un vrai dresseur. Célestine t\'attend.' },
];

/* ---------------- rencontres du Sanctuaire ---------------- */
const SANCT = [[73, 40, 44, 25], [130, 40, 44, 10], [171, 40, 44, 15], [226, 40, 44, 15], [42, 40, 44, 20], [198, 40, 43, 10], [1031, 40, 44, 5]];

/** Lugia Obscur : où il dort, sur l'autel du Sanctuaire */
export const LUGIA_ALTAR = { map: 'sanctuaire', x: 12, y: 4 };

export function addStory({ W, maps, towns, routes, legends, trainerNpc }) {
  const R = routes;
  /** case libre la plus proche (praticable, sans PNJ, objet ni porte) ; évite les sentiers quand c'est possible */
  const free = (m, x, y, avoidPath = true) => {
    let best = null;
    for (let r = 0; r < 10 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const a = x + dx, b = y + dy, t = m.get(a, b);
      if (!m.in(a, b) || !walkable(t) || t === T.DOOR || t === T.MAT || t === T.CAVEDOOR || t === T.STAIRS) continue;
      if (m.npcs.some((n) => n.x === a && n.y === b) || m.items.some((n) => n.x === a && n.y === b) || m.warpAt(a, b) || m.objectAt(a, b)) continue;
      // jamais juste devant une porte
      if (m.get(a, b - 1) === T.DOOR) continue;
      if (avoidPath && (t === T.PATH || t === T.PAVE || t === T.BRIDGE)) { best = best || null; continue; }
      best = [a, b]; break;
    }
    return best || (avoidPath ? free(m, x, y, false) : [x, y]);
  };
  const npcAt = (m, x, y, o) => { const [a, b] = free(m, x, y); return m.npc({ ...o, x: a, y: b }); };
  const tn = (t, lx, ly, o) => npcAt(W, t.x + lx, t.y + ly, { ...o, id: `${t.id}:${o.id}` });
  const grunt = (map, x, y, dir, id, team, o = {}) => {
    const [a, b] = o.exact ? [x, y] : free(map, x, y, false);
    return Object.assign(trainerNpc(map, a, b, dir, 'Sbire', 'de la Team Éclipse', team, {
      id, sight: o.sight ?? 3, ow: o.f ? 'eclipse_f' : 'eclipse_m', bs: o.f ? 'eclipse_f' : 'eclipse_m', prize: 40 + team[0][1] * 2,
      intro: o.intro || 'Hé ! La Team Éclipse est occupée ici. Dégage, ou je te fais tâter de mes Pokémon !',
      lose: o.lose || 'Gnn... Pas possible !', after: o.after || 'La Team Éclipse ne se laissera pas faire...',
    }), { vanish: o.vanish ?? true, music: 'eclipse' });
  };
  const admin = (map, x, y, dir, id, who, team, o) => {
    const [a, b] = free(map, x, y, false);
    return Object.assign(trainerNpc(map, a, b, dir, 'Admin Éclipse', who === 'nyx' ? 'Nyx' : 'Erèbe', team, {
      id, sight: o.sight ?? 3, ow: who, bs: who === 'nyx' ? 'nyx' : 'erebe', prize: 70, ai: 'smart', items: { 'super-potion': 1, 'hyper-potion': team[0][1] > 30 ? 1 : 0 }, intro: o.intro, lose: o.lose, after: o.after || '...',
    }), { vanish: true, music: 'eclipse', winScript: o.win });
  };
  const spot = (pts, t, side, off) => { const p = along(pts, t); return free(W, Math.round(p.x + p.nx * side * off), Math.round(p.y + p.ny * side * off)); };

  /* ======================== Acte 1 · Bois Murmure ======================== */
  {
    const [lx, ly] = spot(R.bois, 0.5, -1, 3);
    W.npc({ id: 'lumen-bois', x: lx, y: ly, sprite: 'lumen', dir: 'left', script: 'lumenBois', move: 'static' });
    const [ax, ay] = spot(R.bois, 0.46, 1, 1), [bx, by] = spot(R.bois, 0.54, -1, 1);
    grunt(W, ax, ay, 'down', 'ecl:bois1', GRUNT.a, { sight: 4, intro: 'Ce scientifique sait des choses sur les Plumes Argentées. Toi, ne te mêle pas de ça !' });
    grunt(W, bx, by, 'up', 'ecl:bois2', GRUNT.b, { f: 1, sight: 4, intro: 'Le Chef Nocturne veut ces données. Personne ne nous arrêtera !' });
  }

  /* ======================== Acte 2 · Grotte Lunaire (sombre) ======================== */
  {
    const g = maps.grotte; g.dark = true;
    const [ex, ey] = nearestCave(g, 30, 20);
    admin(g, ex, ey, 'left', 'ecl:erebe1', 'erebe', GRUNT.erebe1, {
      intro: 'Tiens, un gamin. Je suis Erèbe, Admin de la Team Éclipse. Ces Pierres Lune nourriront le Prisme Noir. Ne te mets pas en travers de notre chemin.',
      lose: 'Intéressant... Tu as du cran. Mais le Prisme est presque prêt.',
    });
    const [ax, ay] = nearestCave(g, 14, 8), [bx, by] = nearestCave(g, 36, 7);
    grunt(g, ax, ay, 'down', 'ecl:grotte1', GRUNT.c, { exact: 1, intro: 'On creuse pour le Chef ! Tu tombes mal, gamin !' });
    grunt(g, bx, by, 'left', 'ecl:grotte2', GRUNT.d, { exact: 1, f: 1, intro: 'Ces cailloux brillent dans le noir... Le Chef va adorer. Mais toi, tu vas disparaître !' });
  }

  /* ======================== Acte 3 · Port-Azur ======================== */
  {
    const D = towns.D;
    admin(W, D.x + 20, D.y + 5, 'down', 'ecl:nyx1', 'nyx', GRUNT.nyx1, {
      intro: 'Oh, un petit curieux ! Je suis Nyx, Admin de la Team Éclipse. On cherche le Sanctuaire des Marées... et ce vieux marin refuse de parler. Tu veux payer à sa place ?',
      lose: 'Pfff, quelle plaie ! On trouvera le Sanctuaire sans lui. Ciao !',
    });
    grunt(W, D.x + 12, D.y + 5, 'down', 'ecl:azur1', GRUNT.e, { sight: 2, intro: 'Le ponton est réquisitionné par la Team Éclipse !' });
    // le vieux marin remercie le joueur une fois Nyx chassée
    const marin = W.npcs.find((n) => n.id === 'azur:marin');
    Object.assign(marin, { script: 'gift', move: 'static', dir: 'down', text: null, gift: {
      item: 'max-repel', qty: 3, flag: 'giftMarin', who: 'Vieux marin', need: (st) => st.flags['T:ecl:nyx1'],
      pre: ['Ahoy... Ces gens en noir veulent savoir où dort le gardien des mers.', 'Jamais je ne leur dirai !'],
      give: ['Merci de m\'avoir débarrassé de cette Nyx, petit. Tiens, ça éloigne les créatures sauvages en mer.'],
      got: ['Le gardien des mers, c\'est Lugia. Les anciens disent qu\'il dort dans un sanctuaire, sur un îlot au sud du Cap Mirage.', 'Et regarde l\'îlot, là-bas, au bout du port : un jour, avec Surf, va donc voir ce qu\'il cache.'],
      done: ['Bon vent, petit ! Les marées te seront favorables.'] } });
    // le pêcheur : montre-moi un Magicarpe
    const pe = W.npcs.find((n) => n.id === 'azur:pecheur');
    Object.assign(pe, { script: 'show', move: 'turn', text: null, show: {
      flag: 'qMagicarpe', who: 'Pêcheur', test: (m) => m.sp === 129, reward: [['rare-candy', 2]],
      ask: ['Les Racaillou se cachent parmi les galets, méfie-toi en marchant sur la plage.', 'Dis, tu me montrerais un Magicarpe ? Juste pour le voir. On en trouve en surfant.'],
      thanks: ['Ooooh ! Un Magicarpe ! Ses écailles brillent, c\'est un beau spécimen.', 'Tiens, pour ta peine.'], done: ['Un jour, ton Magicarpe deviendra un Léviator. Patience !'] } });
    // îlot caché au bout du port, accessible avec Surf
    W.rect(D.x + 24, D.y + 1, D.x + 27, D.y + 2, T.SAND);
    W.item(D.x + 26, D.y + 1, 'rare-candy'); W.item(D.x + 24, D.y + 2, 'water-stone');
  }

  /* ======================== Acte 4 · Voltacité, la Centrale ======================== */
  {
    const E = towns.E, cen = maps['volta:tower17'];
    cen.npcs.length = 0; cen.name = 'Centrale de Voltacité'; cen.music = 'hideout';
    const fl = (x, y) => free(cen, x, y, false);
    const [ix, iy] = fl(2, 6);
    cen.npc({ id: 'volta:ingenieur', x: ix, y: iy, sprite: 'scientifique', dir: 'right', script: 'gift', gift: {
      item: 'cs-force', flag: 'giftForce', who: 'Ingénieur', need: (st) => st.flags['T:ecl:erebe2'],
      pre: ['Ils ont pris le contrôle des générateurs ! Ils volent l\'électricité de toute la région pour leur Prisme Noir...', 'Leur chef, Erèbe, est au fond de la salle. Je t\'en prie, chasse-les !'],
      give: ['Les générateurs repartent ! Tu nous as sauvés. Prends ceci, ça devrait t\'aider dans ton voyage.'],
      got: ['La CS06 contient Force. Avec le Badge Volt, ton Pokémon pourra pousser les gros rochers qui bloquent certains recoins.', 'Volta t\'attend à l\'Arène, maintenant que tout est rentré dans l\'ordre.'],
      done: ['Les Magnéti sont revenus se blottir contre les générateurs. Tout va bien !'] } });
    { const [x, y] = fl(4, 6); grunt(cen, x, y, 'left', 'ecl:volta1', GRUNT.f, { exact: 1, sight: 2, intro: 'Bzzt ! Accès interdit ! La Centrale appartient à la Team Éclipse !' }); }
    { const [x, y] = fl(8, 5); grunt(cen, x, y, 'left', 'ecl:volta2', GRUNT.g, { exact: 1, f: 1, sight: 2, intro: 'Chaque watt de cette ville sert le Prisme Noir. Recule !' }); }
    admin(cen, 7, 3, 'down', 'ecl:erebe2', 'erebe', GRUNT.erebe2, {
      sight: 2, intro: 'Encore toi. Le Prisme Noir a besoin d\'énergie pour « fermer le cœur » d\'un Pokémon légendaire. Lorsque Lugia sera à nous, la région plongera dans une nuit éternelle.',
      lose: 'Hmph. Ce n\'est qu\'un contretemps. Le Chef Nocturne a déjà ce qu\'il lui faut. Nous nous retirons.',
    });
    { const [x, y] = fl(9, 6); cen.item(x, y, 'thunder-stone'); }
    // l'Arène est fermée tant que la Centrale est occupée
    const [dx, dy] = E.gymDoor;
    const [gx, gy] = free(W, dx + 1, dy + 1, false);
    const n = W.npc({ id: 'volta:arene-fermee', x: gx, y: gy, sprite: 'vendeur', dir: 'left', text: ['L\'Arène est fermée ! La Team Éclipse a envahi la Centrale, et Volta refuse de combattre tant qu\'elle est occupée.', 'La Centrale, c\'est la grande tour dorée au nord.'] });
    n.gate = { open: (f) => !!f['T:ecl:erebe2'], badges: 2, tiles: [[dx, dy + 1]] };
    W.gates.push({ npc: n.id, ...n.gate });
  }

  /* ======================== Acte 5 · le repaire (route 6) ======================== */
  {
    const door = cavePortal(W, R.r6, 0.5);
    const rep = room('repaire', 23, 16, { floor: 'lab', music: 'hideout', wall: 'wall_mart', name: 'Repaire Éclipse', exitX: 11 });
    // rangées de machines qui forment un petit labyrinthe
    const wall = (y, gap) => { for (let x = 1; x < 22; x++) if (x !== gap && x !== gap + 1) rep.prop((x + y) % 4 === 0 ? 'pc' : 'labmachine', x, y); };
    wall(12, 5); wall(8, 16); wall(4, 10);
    rep.prop('pc', 9, 2); rep.prop('pc', 13, 2); rep.prop('labmachine', 8, 2); rep.prop('labmachine', 14, 2);
    rep.outside = { map: 'monde', x: door.x, y: door.y + 1, dir: 'down' };
    rep.warp(rep.exitX, rep.exitY, rep.outside);
    W.warp(door.x, door.y, { map: 'repaire', x: rep.exitX, y: rep.exitY, dir: 'up' });
    grunt(rep, 9, 13, 'left', 'ecl:rep1', GRUNT.h, { exact: 1, vanish: false, after: 'Le Chef est tout là-haut... mais tu n\'arriveras jamais jusqu\'à lui.' });
    grunt(rep, 12, 10, 'down', 'ecl:rep2', GRUNT.i, { exact: 1, f: 1, sight: 1, vanish: false, after: 'Le Prisme Noir... j\'en ai froid dans le dos.' });
    grunt(rep, 14, 9, 'left', 'ecl:rep3', GRUNT.j, { exact: 1, sight: 3, vanish: false });
    grunt(rep, 14, 6, 'right', 'ecl:rep4', GRUNT.k, { exact: 1, sight: 2, vanish: false });
    grunt(rep, 8, 6, 'right', 'ecl:rep5', GRUNT.l, { exact: 1, f: 1, sight: 3, vanish: false });
    admin(rep, 19, 10, 'left', 'ecl:nyx2', 'nyx', GRUNT.nyx2, { sight: 2,
      intro: 'Toi, ici ?! Tu es vraiment collant. Le Chef est en train d\'achever le Prisme Noir. Je ne te laisserai pas le déranger !', lose: 'Non, non, NON ! ... Bon, vas-y. De toute façon, il est trop tard.' });
    const boss = trainerNpc(rep, 11, 3, 'down', 'Chef Éclipse', 'Nocturne', GRUNT.boss1, { id: 'ecl:boss1', sight: 1, ow: 'nocturne', bs: 'nocturne', prize: 120, ai: 'smart', items: { 'hyper-potion': 2 },
      intro: 'Je suis Nocturne, chef de la Team Éclipse. Le jour rend les gens faibles et bruyants. Sous une nuit éternelle, tout serait enfin calme... Le Prisme Noir fermera le cœur de Lugia, et Lugia obéira. Toi, tu n\'es qu\'un grain de sable.',
      lose: 'Impressionnant. Mais il est trop tard : le Prisme Noir est déjà au Sanctuaire des Marées.', after: '...' });
    Object.assign(boss, { vanish: true, music: 'eclipse', winScript: 'boss1' });
    rep.item(2, 6, 'ultra-ball', 2); rep.item(20, 10, 'full-heal'); rep.item(20, 14, 'hyper-potion');
    maps.repaire = rep;
    // des sbires bloquent l'entrée de Mirage tant que le Chef n'est pas battu
    const G = towns.G;
    const gt = W.npc({ id: 'mirage:sbire-garde', x: G.x + 2, y: G.y + 9, sprite: 'eclipse_m', dir: 'left', text: ['Halte ! Mirage est sous le contrôle de la Team Éclipse.', 'Personne ne passe tant que le Chef n\'en a pas fini dans notre repaire, là-bas, sur la route 6 !'] });
    // toute la lisière ouest de la ville est gardée (la route 6 y arrive en large)
    const west = []; for (let y = G.y; y < G.y + G.h; y++) if (walkable(W.get(G.x, y))) west.push([G.x, y]);
    gt.gate = { open: (f) => !!f.eclipse, badges: 4, tiles: west };
    W.gates.push({ npc: gt.id, ...gt.gate });
    const gt2 = W.npc({ id: 'mirage:sbire-garde2', x: G.x + 2, y: G.y + 12, sprite: 'eclipse_f', dir: 'left', text: ['Le Chef Nocturne prépare quelque chose d\'énorme. Circule !'] });
    gt2.gate = { open: (f) => !!f.eclipse, badges: 4, tiles: [] };
  }

  /* ======================== Acte 6 · le Sanctuaire des Marées ======================== */
  {
    // îlot au sud du Cap Mirage, entre le continent et l'archipel : on y va en surfant
    W.blob(280.5, 207, 7, 4.5, T.SAND, rng(99), [T.WATER]);
    const b = W.building('cave', 278, 203);
    W.rect(b.doorX - 1, b.doorY + 1, b.doorX + 1, b.doorY + 3, T.SAND);
    W.prop('statue', b.doorX - 2, b.doorY + 2); W.prop('statue', b.doorX + 2, b.doorY + 2);
    W.zone(271, 200, 290, 213, { name: 'Îlot des Marées', music: 'sanctuary' });
    const s = new GameMap('sanctuaire', 25, 34, { outdoor: false, fill: T.CAVEWALL, floor: 'cave', music: 'sanctuary', name: 'Sanctuaire des Marées', battleBg: 'cave' });
    s.edge = T.CAVEWALL;
    s.rect(11, 24, 13, 31, T.CAVE); s.rect(3, 16, 21, 26, T.CAVE); s.rect(11, 11, 13, 16, T.CAVE); s.set(12, 10, T.CAVE); s.rect(5, 2, 19, 9, T.CAVE);
    s.rect(4, 18, 7, 22, T.WATER); s.rect(17, 18, 20, 22, T.WATER); s.rect(5, 3, 8, 7, T.WATER); s.rect(16, 3, 19, 7, T.WATER);
    for (const [x, y] of [[9, 3], [15, 3], [9, 6], [15, 6], [3, 25], [21, 25], [9, 17], [15, 17]]) s.prop('statue', x, y);
    for (const [x, y] of [[4, 24], [20, 16], [6, 25], [18, 25]]) s.prop('stalag', x, y);
    for (const p of s.deco) s.under.set(key(p.x, p.y), T.CAVE);
    s.set(12, 32, T.CAVEDOOR); s.set(12, 33, T.CAVEWALL);
    s.deco.push({ k: 'exitlight', x: 12, y: 32 });
    s.outside = { map: 'monde', x: b.doorX, y: b.doorY + 1, dir: 'down' };
    s.warp(12, 32, s.outside);
    W.warp(b.doorX, b.doorY, { map: 'sanctuaire', x: 12, y: 31, dir: 'up', need: 'plume-argent' });
    s.encounter = SANCT;
    s.zone(11, 26, 13, 27, { name: s.name, music: 'sanctuary', trigger: 'lumenSanct' });
    // Lugia Obscur repose sur l'autel
    s.under.set(key(12, 4), T.CAVE); s.set(12, 4, T.BLOCK); s.object(12, 4, { type: 'lugia' });
    s.npc({ id: 'lumen-sanct', x: 13, y: 29, sprite: 'lumen', dir: 'left', script: 'lumenSanct' });
    grunt(s, 8, 24, 'right', 'ecl:sanct1', GRUNT.m, { exact: 1, sight: 4, intro: 'Le rituel a commencé ! Tu ne passeras pas !' });
    grunt(s, 16, 20, 'left', 'ecl:sanct2', GRUNT.n, { exact: 1, f: 1, sight: 4, intro: 'Tu entends ? C\'est Lugia qui gronde sous nos pieds...' });
    admin(s, 11, 14, 'right', 'ecl:nyx3', 'nyx', GRUNT.nyx3, { sight: 2, intro: 'Encore toi ! Tu ne comprends donc rien ? Quand Lugia ouvrira les yeux, plus rien ne pourra l\'arrêter !', lose: 'Ce gamin... c\'est un vrai cauchemar.' });
    admin(s, 13, 12, 'left', 'ecl:erebe3', 'erebe', GRUNT.erebe3, { sight: 2, intro: 'Tu es arrivé jusqu\'ici. Alors je vais devoir être sérieux.', lose: 'Je... Peut-être que la nuit éternelle n\'était pas une si bonne idée.' });
    const boss = trainerNpc(s, 12, 8, 'down', 'Chef Éclipse', 'Nocturne', GRUNT.boss2, { id: 'ecl:boss2', sight: 2, ow: 'nocturne', bs: 'nocturne', prize: 200, ai: 'smart', items: { 'hyper-potion': 2, 'full-restore': 1 },
      intro: 'Te voilà enfin. Regarde. Lugia dort encore, mais le Prisme Noir a déjà refermé son cœur. Dans un instant, il se réveillera, et il m\'obéira. Rien ne peut plus empêcher l\'Éclipse.',
      lose: 'Impossible... Battu par un enfant, ici, au moment de mon triomphe...', after: '...' });
    Object.assign(boss, { vanish: true, music: 'eclipse', winScript: 'boss2' });
    s.item(3, 16, 'revive', 2); s.item(21, 17, 'full-restore');
    maps.sanctuaire = s;
    // Lugia de la Grotte des Tourbillons : s'il a été vaincu (et non capturé) au Sanctuaire, il s'y réfugie
    const lg = legends.find((L) => L.id === 'lugia');
    if (lg) { lg.cond = (f) => !!f.lugia; lg.intro = ['L\'eau se met à tourbillonner...', 'Lugia, apaisé, s\'est réfugié ici. Il te reconnaît !']; }
  }

  /* ======================== Ligue : le Conseil 4, puis la Maître ======================== */
  {
    const rooms = ['plateau:ligue', 'ligue:c2', 'ligue:c3', 'ligue:c4', 'ligue:maitre'];
    const hall = maps['plateau:ligue'];
    const champ = hall.npcs.find((n) => n.champion);
    hall.npcs.splice(hall.npcs.indexOf(champ), 1);
    const garde = hall.npcs.find((n) => n.id === 'ligue-garde'); if (garde) garde.text = ['Bienvenue à la Ligue Céleste.', 'Le Conseil 4 t\'attend : quatre salles, quatre combats. Puis Célestine, la Maître.', 'Une fois la première porte franchie, tu ne pourras plus revenir en arrière avant la fin !'];
    for (let i = 1; i < rooms.length; i++) {
      const m = leagueInterior(rooms[i]);
      m.townId = 'plateau'; m.outside = hall.outside;
      // pas de retour en arrière : la seule sortie de la dernière salle ramène dehors (après le combat)
      if (i < rooms.length - 1) m.set(m.exitX, m.exitY, T.FLOOR);
      else m.warp(m.exitX, m.exitY, hall.outside);
      m.exitY = 15;
      maps[rooms[i]] = m;
    }
    ELITE.forEach((e, i) => {
      const m = maps[rooms[i]]; if (i) m.name = e.room;
      m.floor = e.floor;
      for (const y of [3, 7, 11, 15]) { m.prop(e.deco, 1, y); m.prop(e.deco, 13, y); }
      const n = trainerNpc(m, 7, 3, 'down', 'Conseil 4', e.name, e.team, { id: e.id, sight: 0, ow: e.ow, bs: e.bs, prize: 150, ai: 'smart', items: { 'hyper-potion': 2, 'full-heal': 1 }, intro: e.intro, lose: e.lose, after: 'Avance. La salle suivante t\'attend.' });
      Object.assign(n, { beatenPos: [9, 3], music: 'leader' });
      // porte du fond vers la salle suivante, ouverte une fois le membre du Conseil battu
      m.set(7, 1, T.DOOR); m.warp(7, 1, { map: rooms[i + 1], x: 7, y: 15, dir: 'up' });
      m.gates.push({ npc: n.id, open: (f) => !!f['T:' + e.id], badges: 8, tiles: [[7, 1]] });
    });
    const M = maps['ligue:maitre']; M.name = 'Salle de la Maître'; M.music = 'league';
    M.npcs.push({ ...champ, x: 7, y: 3 });
  }

  /* ======================== recoins cachés (Coupe ou Force) ======================== */
  {
    const pockets = [
      [R.r1, 0.42, 1, T.CUT, [['great-ball', 3]]], [R.r2, 0.55, -1, T.CUT, [['rare-candy', 1]]], [R.bois, 0.62, -1, T.CUT, [['medaillon', 1]]],
      [R.r3a, 0.5, -1, T.BOULDER, [['moon-stone', 1]]], [R.r4, 0.5, 1, T.CUT, [['ultra-ball', 2]]], [R.r5, 0.38, 1, T.BOULDER, [['rare-candy', 1], ['max-repel', 1]]],
      [R.r6, 0.75, -1, T.CUT, [['full-heal', 2]]], [R.r7, 0.35, 1, T.BOULDER, [['max-potion', 1]]], [R.r10, 0.55, -1, T.BOULDER, [['full-restore', 1]]],
      [R.r1, 0.75, -1, T.BOULDER, [['sun-stone', 1]]],
    ];
    W.pockets = [];
    for (const [pts, t, side, obs, items] of pockets) {
      let p = null;
      for (const [dt, sd] of [[0, side], [0, -side], [0.15, side], [-0.15, side], [0.15, -side], [-0.15, -side], [0.3, side], [-0.3, -side]]) {
        if (t + dt < 0.05 || t + dt > 0.95) continue;
        p = secretPocket(W, pts, t + dt, sd, obs, items); if (p) break;
      }
      if (p) W.pockets.push(p);
    }
  }

  /* ======================== quêtes annexes ======================== */
  {
    const { A, B, C, D, E, F, G, H, I } = towns;
    // (Margaux, pas Lucie : Lucie est déjà la fille au Ponyta de Sylvebourg, dans l'histoire de la Brume)
    tn(B, 26, 14, { id: 'medaillon', sprite: 'fillette2', dir: 'down', move: 'turn', script: 'deliver', deliver: {
      item: 'medaillon', flag: 'qMedaillon', who: 'Margaux', reward: [['rare-candy', 1], ['super-potion', 3]],
      ask: ['Snif... J\'ai perdu le médaillon de ma grand-mère en jouant dans le Bois Murmure.', 'Il est sûrement tombé derrière un petit arbre... Je n\'arrive pas à passer !'],
      thanks: ['Mon médaillon ! Tu l\'as retrouvé ! Merci, merci, merci !', 'Tiens, c\'est tout ce que j\'ai. Grand-mère dit que ça rend les Pokémon plus forts.'], done: ['Je ne le quitterai plus jamais !'] } });
    tn(C, 8, 13, { id: 'geologue', sprite: 'montagnard', dir: 'down', script: 'show', show: {
      flag: 'qRoche', who: 'Géologue', test: (m) => SPECIES[m.sp].t.includes('rock'), reward: [['great-ball', 4]],
      ask: ['Je collectionne les observations de Pokémon Roche.', 'Montre-m\'en un, n\'importe lequel, et je te récompenserai !'],
      thanks: ['Magnifique ! Regarde-moi cette carapace minérale...', 'Voilà pour toi, comme promis.'], done: ['La Grotte Lunaire regorge de Pokémon Roche. Et de Pierres Lune !'] } });
    tn(E, 26, 15, { id: 'echange', sprite: 'gamin', dir: 'down', script: 'trade', trade: {
      flag: 'qEchange', who: 'Bastien', want: 16, give: 81, lvl: 18, nick: 'Boulon',
      ask: ['J\'adore les Pokémon Vol ! Tu n\'aurais pas un Roucool ?', 'Je te l\'échange contre mon Magnéti, Boulon !'],
      thanks: ['Génial ! Prends soin de Boulon, il adore les néons de la ville.'], done: ['Mon Roucool vole déjà comme un pro !'] } });
    { const m = maps['flora:bighouse21']; const [x, y] = free(m, 8, 3, false);
      m.npc({ id: 'flora:evoli', x, y, sprite: 'dame', dir: 'down', script: 'giftmon', giftmon: {
        sp: 133, lvl: 20, flag: 'giftEvoli', who: 'Éleveuse',
        ask: ['Mon Évoli a eu des petits, et ils cherchent tous un dresseur attentionné.', 'Tu veux bien en adopter un ?'],
        got: ['Évoli peut évoluer de bien des façons... Avec une pierre, par exemple !'], done: ['Ton Évoli a l\'air heureux avec toi. Ça me fait chaud au cœur.'] } }); }
    tn(G, 24, 13, { id: 'dexpert', sprite: 'savant', dir: 'down', script: 'dexq', dexq: { who: 'Chercheur', tiers: [[25, 'ultra-ball', 5], [50, 'rare-candy', 3], [80, 'master-ball', 1]] } });
    tn(H, 27, 5, { id: 'sources', sprite: 'montagnard', dir: 'down', script: 'show', show: {
      flag: 'qNiveau', who: 'Vétéran', test: (m) => m.lvl >= 40, reward: [['full-restore', 2]],
      ask: ['Les sources chaudes de Cendrelune n\'acceptent que les Pokémon aguerris.', 'Montre-moi un Pokémon de niveau 40 au moins !'],
      thanks: ['Ça, c\'est un Pokémon bien entraîné ! Prends ces Guérisons, tu les mérites.'], done: ['Reviens te baigner quand tu veux !'] } });
    tn(I, 24, 11, { id: 'ancien', sprite: 'vieil_homme', dir: 'down', script: 'giftmon', giftmon: {
      sp: 147, lvl: 30, flag: 'giftMinidraco', who: 'Ancien du clan', need: (st) => st.badges[7],
      pre: ['Seuls ceux que Drakos a reconnus peuvent recevoir l\'héritage du clan des dragons.'],
      ask: ['Tu portes le Badge Écaille... Drakos t\'a reconnu.', 'Alors accepte ce Minidraco. Il deviendra un jour un puissant Dracolosse.'],
      got: ['Traite-le avec respect, et il te le rendra au centuple.'], done: ['Les dragons veillent sur toi, jeune dresseur.'] } });
    // pendant l'Éclipse, les habitants s'inquiètent
    const worry = [
      [A, 9, 15, 'Il fait nuit en plein jour... Les Pokémon de la route 1 ne sortent plus de leurs terriers.', 'habitante'],
      [D, 6, 14, 'La mer est noire comme de l\'encre depuis que le ciel s\'est éteint. Les marins ne veulent plus sortir.', 'marin'],
      [F, 14, 14, 'Mes fleurs se referment toutes... Elles croient que c\'est la nuit. Elles ont raison, d\'ailleurs.', 'jardinier'],
      [E, 5, 13, 'Même les néons de Voltacité n\'arrivent plus à percer ce ciel violet...', 'habitant'],
      [I, 25, 11, 'Les dragons de Cimelune s\'agitent. Ils sentent la présence d\'un Pokémon immense, quelque part au sud du Cap Mirage.', 'enfant'],
    ];
    worry.forEach(([t, lx, ly, line, sprite], i) => tn(t, lx, ly, { id: 'eclipse' + i, sprite, dir: 'down', move: 'turn', showIf: 'eclipse', hideIf: 'lugia', text: [line] }));
    // la voyante de Mirage connaît la légende et garde la Plume Argentée
    const voy = W.npcs.find((n) => n.id === 'mirage:voyante');
    Object.assign(voy, { script: 'gift', text: null, gift: {
      item: 'plume-argent', flag: 'giftPlume', set: 'plumeArgent', who: 'Voyante', need: (st) => st.flags.eclipse && st.badges[4],
      pre: (st) => (st.flags.eclipse ? ['Le ciel s\'est éteint... Je vois une grande ombre sous les vagues.', 'Bats d\'abord Sibylle, à l\'Arène. Ensuite, reviens me voir.'] : ['Je vois... trois îles, trois frères.', 'Et une vieille rancune qui gronde comme un volcan.']),
      give: ['Tu as le Badge Mirage. Écoute-moi bien.', 'Lugia, le gardien des marées, dort dans le Sanctuaire des Marées, sur un îlot au sud du Cap Mirage.', 'La Team Éclipse a fermé son cœur avec le Prisme Noir. S\'il se réveille ainsi, la nuit ne finira jamais.', 'Cette Plume Argentée ouvre le Sanctuaire. Surfe depuis le Cap Mirage, vers le sud. Va, vite !'],
      got: ['Le Cap Mirage est au bout de la route 7, au sud de la ville.'], done: (st) => (st.flags.lugia ? ['Le jour est revenu... Je savais que tu y arriverais.'] : ['Le Sanctuaire t\'attend, au sud du Cap Mirage...']) } });
    // la Route Victoire reste fermée tant que dure l'Éclipse
    const vg = W.npcs.find((n) => n.id === 'cime:garde');
    if (vg) { vg.script = 'victoireGate'; vg.gate.open = (f, g) => g.badgeCount() >= 15 && (!f.eclipse || !!f.lugia); W.gates.find((q) => q.npc === vg.id).open = vg.gate.open; }
  }
}

/* ---------------- outils de construction ---------------- */
function nearestCave(m, x, y) {
  for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const a = x + dx, b = y + dy;
    // une salle assez large (3 × 3 de sol) pour ne pas boucher une galerie
    let ok = true; for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (m.get(a + i, b + j) !== T.CAVE) { ok = false; break; }
    if (ok && !m.npcs.some((n) => Math.abs(n.x - a) + Math.abs(n.y - b) < 2) && !m.items.some((n) => n.x === a && n.y === b) && !m.warpAt(a, b)) return [a, b];
  }
  return [x, y];
}

/** entrée de grotte creusée dans les arbres au bord d'une route, reliée au sentier par un chemin */
function cavePortal(W, pts, t0) {
  for (let tries = 0; tries < 30; tries++) {
    const t = t0 + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.02;
    const p = along(pts, t);
    // on remonte vers le nord depuis le sentier jusqu'à la lisière
    let x = Math.round(p.x), y = Math.round(p.y), k = 0;
    while (k++ < 12 && W.get(x, y) !== T.TREE && W.get(x, y) !== T.PINE) y--;
    if (k >= 12) continue;
    // 5 × 4 cases d'arbres pour l'entrée (et un rang d'arbres derrière)
    const bx = x - 2, by = y - 3;
    let ok = true;
    for (let j = -1; j < 3 && ok; j++) for (let i = -1; i < 6; i++) { const tt = W.get(bx + i, by + j); if (tt !== T.TREE && tt !== T.PINE) { ok = false; break; } }
    if (!ok || W.zones.some((z) => z.town && x >= z.x0 - 3 && x <= z.x1 + 3 && y >= z.y0 - 3 && y <= z.y1 + 3)) continue;
    const b = W.building('cave', bx, by);
    for (let yy = b.doorY + 1; yy < b.doorY + 14; yy++) { if (walkable(W.get(b.doorX, yy))) break; W.set(b.doorX, yy, T.PATH); }
    return { x: b.doorX, y: b.doorY };
  }
  throw new Error('repaire : pas de place pour l\'entrée');
}

/**
 * Recoin secret derrière un obstacle (petit arbre à couper ou rocher à pousser), creusé dans la forêt au bord d'une route :
 * obstacle, couloir de 3 tuiles, clairière 3 × 3 avec les objets. Ne creuse que des arbres et ne touche aucune autre zone.
 */
function secretPocket(W, pts, t0, side, obs, items) {
  for (let tries = 0; tries < 24; tries++) {
    const t = t0 + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.015;
    const p = along(pts, t);
    let dx = p.nx * side, dy = p.ny * side;
    if (Math.abs(dx) > Math.abs(dy)) { dx = Math.sign(dx); dy = 0; } else { dy = Math.sign(dy); dx = 0; }
    let x = Math.round(p.x), y = Math.round(p.y), k = 0;
    while (k++ < 14 && W.get(x, y) !== T.TREE && W.get(x, y) !== T.PINE) { x += dx; y += dy; }
    const before = W.get(x - dx, y - dy);
    if (k >= 14 || !walkable(before) || before === T.TALL || before === T.DARKTALL) continue;
    const ex = x, ey = y;
    const set = [];
    for (let i = 1; i <= 3; i++) set.push([ex + dx * i, ey + dy * i]);
    const cx = ex + dx * 5, cy = ey + dy * 5;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) set.push([cx + i, cy + j]);
    const inSet = new Set(set.map(([a, b]) => key(a, b)));
    let ok = W.in(cx - 3, cy - 3) && W.in(cx + 3, cy + 3);
    for (const [a, b] of set) {
      if (!ok) break;
      if (W.get(a, b) !== T.TREE && W.get(a, b) !== T.PINE) ok = false;
      if (W.height(a, b) !== W.height(ex - dx, ey - dy)) ok = false;   // le recoin reste au niveau du sentier (relief)
      for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) {
        const q = key(a + i, b + j); if (inSet.has(q) || (a + i === ex && b + j === ey)) continue;
        const tt = W.get(a + i, b + j); if (tt !== T.TREE && tt !== T.PINE && tt !== T.WATER) { ok = false; break; }
      }
    }
    for (const [i, j] of [[dy, dx], [-dy, -dx]]) { const tt = W.get(ex + i, ey + j); if (tt !== T.TREE && tt !== T.PINE) ok = false; }
    if (!ok || W.zones.some((z) => z.town && cx >= z.x0 - 2 && cx <= z.x1 + 2 && cy >= z.y0 - 2 && cy <= z.y1 + 2)) continue;
    for (const [a, b] of set) W.set(a, b, T.GRASS);
    W.set(ex, ey, obs);
    // un rocher poussé finit au fond de la clairière : les objets sont posés sur le côté
    const spots = dx ? [[cx, cy - 1], [cx + dx, cy - 1]] : [[cx - 1, cy], [cx + 1, cy]];
    items.forEach(([it, q], i) => W.item(spots[i][0], spots[i][1], it, q));
    return { x: ex, y: ey, dx, dy, obs, items: items.map((i) => i[0]), clearing: [cx, cy] };
  }
  return null;
}
