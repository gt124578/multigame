// odyssee/js/world/faune.js — Pokémon en liberté dans les villes (posés à la création du monde ; leur comportement : vie.js)
import { T, walkable } from './tiles.js';
import { along, nearestWalkable } from './mapgen.js';
import { ITEMS } from '../core/items.js';

/* ================= fossiles (trouvés en fouillant les grottes, ranimés par le Dr Silex à Pierrefort) ================= */
export const FOSSILES = {
  'fossile-nautile': [138, 'helix-fossil', 'Fossile Nautile', 'un coquillage en spirale'], 'fossile-racine': [345, 'root-fossil', 'Fossile Racine', 'des racines pétrifiées'],
  'fossile-griffe': [347, 'claw-fossil', 'Fossile Griffe', 'une griffe acérée'], 'fossile-crane': [408, 'skull-fossil', 'Fossile Crâne', 'un crâne très dur'],
  'fossile-armure': [410, 'armor-fossil', 'Fossile Armure', 'une plaque de cuirasse'], 'fossile-couvercle': [564, 'cover-fossil', 'Fossile Couvercle', 'une carapace bombée'],
  'fossile-plume': [566, 'plume-fossil', 'Fossile Plume', 'une plume figée dans la pierre'], 'fossile-machoire': [696, 'jaw-fossil', 'Fossile Mâchoire', 'une mâchoire de prédateur'],
  'fossile-nageoire': [698, 'sail-fossil', 'Fossile Nageoire', 'une nageoire en éventail'],
};
for (const [k, [sp, icon, name, quoi]] of Object.entries(FOSSILES)) ITEMS[k] ||= { pocket: 'objets', price: 3000, icon, name, desc: `Un fossile : ${quoi}. Le Dr Silex, à la mine de Pierrefort, sait ranimer le Pokémon qui y dort.` };

/* ================= Pokémon des villes (création du monde) ================= */
// espèces qui ont un sprite de marche (planche des suiveurs), réparties par décor de ville
const FAUNE_VILLE = {
  defaut: [16, 19, 25, 52, 133, 10, 43],
  mer: [54, 60, 7, 158, 16, 52], feu: [37, 4, 155, 74, 66], froid: [133, 7, 158, 143, 54],
  sable: [50, 74, 66, 37, 4], vert: [43, 1, 152, 10, 16, 25], ville: [25, 52, 66, 19, 133], roche: [74, 66, 50, 143],
};
const DECOR = {
  azur: 'mer', ecaille: 'mer', marais: 'mer', volcanic: 'feu', forge: 'feu', cendre: 'feu', snow: 'froid', cime: 'froid',
  desert: 'sable', dunes: 'sable', mirage: 'sable', canyon: 'sable', jardin: 'vert', flora: 'vert', rose: 'vert', sylve: 'vert', forest: 'vert',
  lisiere: 'vert', automne: 'vert', metro: 'ville', volta: 'ville', granit: 'roche', pierre: 'roche', montagne: 'roche',
};
export const PHRASES = [
  (n) => `${n} te regarde avec curiosité.`, (n) => `${n} a l'air de bien se plaire ici.`, (n) => `${n} cherche quelque chose à grignoter.`,
  (n) => `${n} joue avec les enfants du quartier.`, (n) => `${n} se laisse caresser, tout content.`, (n) => `${n} fait la sieste au soleil… ou presque.`,
];
const h32 = (a, b, s) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

/** pose 3 à 6 Pokémon en liberté dans chaque ville de la grande carte, sur des cases dégagées (jamais devant une porte) */
export function addFauneVilles(W) {
  const pris = new Set(W.npcs.map((n) => n.x + ',' + n.y));
  const libre = (x, y) => [T.GRASS, T.FLOWER, T.PATH, T.PAVE, T.SAND, T.SNOW].includes(W.get(x, y)) && !pris.has(x + ',' + y) && !W.objectAt?.(x, y)
    && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].every(([dx, dy]) => walkable(W.get(x + dx, y + dy)) && W.get(x + dx, y + dy) !== T.DOOR && W.get(x + dx, y + dy) !== T.MAT);
  W.zones.filter((z) => z.town).forEach((z, zi) => {
    const liste = FAUNE_VILLE[DECOR[z.theme] || 'defaut'];
    const n = Math.max(3, Math.min(6, Math.round((z.x1 - z.x0) * (z.y1 - z.y0) / 900)));
    let posees = 0;
    for (let essai = 0; essai < 400 && posees < n; essai++) {
      const x = Math.round(z.x0 + 2 + h32(zi, essai, 1) * (z.x1 - z.x0 - 4)), y = Math.round(z.y0 + 2 + h32(zi, essai, 2) * (z.y1 - z.y0 - 4));
      if (!libre(x, y)) continue;
      const sp = liste[Math.floor(h32(zi, essai, 3) * liste.length)];
      pris.add(x + ',' + y);
      W.npc({ id: `faune:${z.id || zi}:${posees}`, x, y, sprite: 'poke:' + sp, dir: 'down', move: 'wander', script: 'faune', sp, roam: 3,
        phrase: Math.floor(h32(zi, essai, 4) * PHRASES.length) });
      posees++;
    }
  });
}


/* ================= routes : colporteurs, voyageurs, arbres à baies ================= */

const STOCK_DEBUT = ['potion', 'super-potion', 'poke-ball', 'great-ball', 'repel', 'oran-berry', 'ether'];
const STOCK_FIN = ['hyper-potion', 'great-ball', 'ultra-ball', 'super-repel', 'revive', 'sitrus-berry', 'lum-berry'];
const PIERRES = ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'dusk-stone', 'dawn-stone', 'shiny-stone', 'ice-stone'];
const VOYAGEURS = [
  { sprite: 'habitant', name: 'Peintre', text: (r) => [`Je peins la ${r} depuis ce matin.`, 'La lumière change tout le temps… Je n\'arrive jamais à finir !'] },
  { sprite: 'montagnard', name: 'Randonneur', text: (r) => [`La ${r}, je la connais par cœur. Chaque saison, elle a une autre tête.`, 'Prends le temps de regarder autour de toi, gamin !'] },
  { sprite: 'scientifique', name: 'Ornithologue', text: (r) => ['Chut… J\'observe les Pokémon Oiseau.', 'Le matin, ils chantent tous en même temps. Le soir, ce sont d\'autres qui sortent.'] },
  { sprite: 'vieil_homme', name: 'Promeneur', text: (r) => [`Je fais le tour de la ${r} tous les jours. Bon pour les jambes !`, 'Si tu vois un arbre plein de baies, sers-toi : elles repoussent chaque jour.'] },
];

/** pose les PNJ des routes (colporteur sur une route sur trois, un voyageur sur les autres) et deux arbres à baies par route */
export function addVieRoutes(W, routes) {
  const pris = new Set(W.npcs.map((n) => n.x + ',' + n.y));
  const bon = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => walkable(W.get(x + dx, y + dy)) && ![T.DOOR, T.MAT, T.TALL, T.DARKTALL].includes(W.get(x + dx, y + dy)));
  const poser = (r, t, side) => {
    for (let k = 0; k < 12; k++) {
      const q = along(r.pts, Math.min(0.95, t + k * 0.03));
      const [x, y] = nearestWalkable(W, q.x + 0.5 + q.nx * side * 2, q.y + 0.5 + q.ny * side * 2, pris);
      if (x == null || pris.has(x + ',' + y) || !bon(x, y) || W.zoneAt(x, y)?.town) continue;
      pris.add(x + ',' + y); return [x, y];
    }
    return null;
  };
  routes.forEach((r, i) => {
    if (!r.pts || r.pts.length < 6) return;
    const nom = r.name || 'route';
    if (i % 3 === 1) {
      const p = poser(r, 0.45, 1); if (!p) return;
      const fin = i > routes.length / 2;
      W.npc({ id: 'colporteur:' + r.id, x: p[0], y: p[1], sprite: 'montagnard', dir: 'down', move: 'turn', name: 'Colporteur', script: 'colporteur',
        stock: [...(fin ? STOCK_FIN : STOCK_DEBUT), PIERRES[i % PIERRES.length]] });
    } else {
      const p = poser(r, 0.3 + (i % 4) * 0.1, i % 2 ? 1 : -1); if (!p) return;
      const v = VOYAGEURS[i % VOYAGEURS.length];
      W.npc({ id: 'voyageur:' + r.id, x: p[0], y: p[1], sprite: v.sprite, dir: 'down', move: 'wander', roam: 3, name: v.name, text: v.text(nom) });
    }
    // arbres à baies : un arbre en lisière, juste au-dessus d'une case où l'on peut se tenir
    let n = 0;
    for (let k = 1; k < 40 && n < 2; k++) {
      const q = along(r.pts, ((k * 0.37) % 1)), cx = Math.round(q.x), cy = Math.round(q.y);
      for (let d = 1; d <= 4 && n < 2; d++) for (const s of [1, -1]) {
        const x = Math.round(cx + q.nx * d * s), y = Math.round(cy + q.ny * d * s);
        if (W.get(x, y) !== T.TREE || !walkable(W.get(x, y + 1)) || isGrass(W.get(x, y + 1)) || W.objectAt(x, y) || W.zoneAt(x, y)?.town) continue;
        W.object(x, y, { type: 'baies', id: `baies:${r.id}:${n}`, baie: ['oran-berry', 'oran-berry', 'sitrus-berry', 'lum-berry'][(i + n) % 4] });
        n++; break;
      }
    }
  });
}
const isGrass = (t) => t === T.TALL || t === T.DARKTALL;

/** marché du week-end : un marchand au centre des villes à arène, présent le samedi et le dimanche */
export function addMarches(W, towns) {
  const pris = new Set(W.npcs.map((n) => n.x + ',' + n.y));
  Object.values(towns).filter((t) => t.gym != null).forEach((t, i) => {
    const [x, y] = nearestWalkable(W, t.x + t.w / 2 + 2, t.y + t.h / 2 + 2, pris);
    if (x == null) return;
    pris.add(x + ',' + y);
    W.npc({ id: 'marche:' + t.id, x, y, sprite: 'habitant', dir: 'down', move: 'turn', name: 'Marchande', script: 'marche',
      when: (f, g) => { const d = (g?.jour?.() ?? new Date()).getDay(); return d === 0 || d === 6; },
      stock: ['rare-candy', 'max-potion', 'lum-berry', 'ultra-ball', PIERRES[i % PIERRES.length], PIERRES[(i + 4) % PIERRES.length], PIERRES[(i + 7) % PIERRES.length]] });
  });
}

/** grottes : trois parois qui brillent, à fouiller une fois par jour */
export function addFouilles(maps) {
  for (const m of Object.values(maps)) {
    if (m.floor !== 'cave') continue;
    const cands = [];
    for (let y = 1; y < m.h - 2; y++) for (let x = 1; x < m.w - 1; x++)
      if (m.get(x, y) === T.CAVEWALL && m.get(x, y + 1) === T.CAVE && !m.objectAt(x, y) && !m.objectAt(x, y + 1)) cands.push([x, y]);
    if (!cands.length) continue;
    const n = Math.min(3, Math.max(1, Math.floor(cands.length / 40)));
    for (let k = 0; k < n; k++) {
      const [x, y] = cands[Math.floor(h32(m.w * 31 + k, m.h, 9) * cands.length)];
      if (m.objectAt(x, y)) continue;
      m.object(x, y, { type: 'fouille', id: `fouille:${m.id}:${k}` });
    }
  }
}

/* ================= voisinage : Psykokwak perdu, échanges, bancs, panneaux, relais, cyclistes, mineurs ================= */
export const ECHANGES = [
  { town: 'sylve', who: 'Gaspard', want: [16, 19, 10, 13], give: [133, 15, 'Plume'] },
  { town: 'volta', who: 'Ingrid', want: [81, 100, 172, 25], give: [147, 25, 'Tonnerre'] },
  { town: 'granit', who: 'Matelot Yann', want: [129, 118, 72], give: [131, 30, 'Bleuet'] },
  { town: 'cendre', who: 'Forgeronne Alma', want: [58, 37, 4, 218], give: [246, 30, 'Braise'] },
];
const HISTOIRES = [
  (r) => [`${r} — Autrefois, les marchands de sel passaient ici avec leurs Tauros.`, 'On voit encore les ornières de leurs charrettes dans la terre.'],
  (r) => [`${r} — Ici, en l'an 812, deux dresseurs se sont affrontés trois jours durant.`, 'Personne ne se souvient de qui a gagné.'],
  (r) => [`${r} — Un vieil arbre de ce bord de route aurait été planté par un Celebi.`, 'Les anciens disent qu\'il fleurit hors saison quand le temps se trouble.'],
  (r) => [`${r} — Point de vue. Par temps clair, on aperçoit les îles du large.`, 'Les Roucool du coin viennent y regarder le coucher du soleil.'],
];

/** Psykokwak perdu (mission mPsyko), quatre échangeurs, et le mobilier des routes */
export function addVoisinage(W, maps, routes, towns) {
  const pris = new Set(W.npcs.map((n) => n.x + ',' + n.y));
  const tout = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = W.get(x + dx, y + dy); if (!walkable(t) || [T.DOOR, T.MAT, T.TALL, T.DARKTALL, T.BRIDGE].includes(t) || pris.has((x + dx) + ',' + (y + dy)) || W.objectAt(x + dx, y + dy)) return false; } return true; };
  const pres = (pts, t, side, off, r = 1) => {
    for (let k = 0; k < 16; k++) {
      const q = along(pts, Math.min(0.97, Math.max(0.03, t + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.02)));
      const x = Math.round(q.x + q.nx * side * off), y = Math.round(q.y + q.ny * side * off);
      if (tout(x, y, r) && !W.zoneAt(x, y)?.town) { pris.add(x + ',' + y); return [x, y]; }
    }
    return null;
  };
  const R = (id) => routes.find((r) => r.id === id);
  // le Psykokwak de Papi Octave, sur la route 5, tant qu'on ne l'a pas retrouvé
  const r5 = R('r5'); const pp = r5 && pres(r5.pts, 0.6, 1, 3);
  if (pp) W.npc({ id: 'psyko-perdu', x: pp[0], y: pp[1], sprite: 'poke:54', dir: 'down', move: 'turn', sp: 54,
    when: (f) => !!f['A:mPsyko'] && !f.psykoRetrouve,
    talk: async (A) => { A.game.vieMonde?.cri(54); await A.say(['Psy… ? Psykokwak se tient la tête et te regarde.', 'Il a l\'air soulagé de voir quelqu\'un ! Psykokwak décide de rentrer à Floralia tout seul.']); A.flag('psykoRetrouve'); } });
  // échanges en jeu
  for (const E of ECHANGES) {
    const t = Object.values(towns).find((q) => q.id === E.town); if (!t) continue;
    const [x, y] = nearestWalkable(W, t.x + Math.round(t.w * 0.3), t.y + Math.round(t.h * 0.7), pris); if (x == null) continue;
    pris.add(x + ',' + y);
    W.npc({ id: 'echange:' + E.town, x, y, sprite: 'habitant', dir: 'down', move: 'turn', name: E.who, script: 'echange', trade: E });
  }
  // routes : un banc avec vue, un panneau d'histoire, un relais toutes les quatre routes, un cycliste sur les longues
  routes.forEach((r, i) => {
    if (!r.pts || r.pts.length < 10) return;
    const nom = r.name || 'Route';
    const b = pres(r.pts, 0.22 + (i % 3) * 0.05, i % 2 ? -1 : 1, 3); if (b) W.prop('banc', b[0], b[1]);
    const s = pres(r.pts, 0.7, i % 2 ? 1 : -1, 2); if (s) W.sign(s[0], s[1], HISTOIRES[i % HISTOIRES.length](nom));
    if (i % 4 === 2) { const p = pres(r.pts, 0.55, i % 2 ? -1 : 1, 3); if (p) W.npc({ id: 'relais:' + r.id, x: p[0], y: p[1], sprite: 'habitante', dir: 'down', move: 'turn', name: 'Gardienne du relais', script: 'relais' }); }
    if (r.pts.length > 40 && i % 3 === 0) { const p = pres(r.pts, 0.35, i % 2 ? 1 : -1, 2); if (p) W.npc({ id: 'cycliste:' + r.id, x: p[0], y: p[1], sprite: i % 2 ? 'topdresseuse' : 'topdresseur', dir: 'down', move: 'wander', roam: 6, name: 'Cycliste',
      text: ['Je fais toute la région à vélo ! Rien de tel pour sentir le vent.', `La ${nom}, c'est ma préférée : ça descend dans un sens… et ça monte dans l'autre.`] }); }
  });
  // grottes : un mineur ou une exploratrice
  for (const m of Object.values(maps)) {
    if (m.floor !== 'cave') continue;
    const ok = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m.get(x + dx, y + dy) !== T.CAVE || m.objectAt(x + dx, y + dy) || m.npcs.some((n) => Math.abs(n.x - x - dx) + Math.abs(n.y - y - dy) === 0) || m.warpAt?.(x + dx, y + dy)) return false; return true; };
    for (let k = 0; k < 300; k++) {
      const x = 2 + Math.floor(h32(m.w, k, 21) * (m.w - 4)), y = 2 + Math.floor(h32(m.h, k, 22) * (m.h - 4));
      if (!ok(x, y)) continue;
      const mineur = h32(x, y, 3) < 0.5;
      m.npc({ id: m.id + ':explo', x, y, sprite: mineur ? 'montagnard' : 'randonneuse', dir: 'down', move: 'wander', name: mineur ? 'Mineur' : 'Exploratrice',
        text: mineur ? ['Tu vois les parois qui scintillent ? Gratte-les : on y trouve des pierres, et parfois un fossile !', 'Le Dr Silex, à Pierrefort, sait ranimer les fossiles.']
          : ['Je cartographie les grottes de la région. Celle-ci n\'est pas la plus profonde…', 'Écoute bien : quand la roche gronde, éloigne-toi des parois !'] });
      break;
    }
  }
}

/* ================= concours Pokémon (Floralia) et fête de village ================= */
/** la fête : le vendredi et le samedi, de 18 h à minuit, dans les villages sans arène */
export const enFete = (g) => { const d = (g?.jour?.() ?? new Date()).getDay(), h = g?.hour?.() ?? new Date().getHours(); return (d === 5 || d === 6) && h >= 18; };
export function addFetes(W, towns) {
  const pris = new Set(W.npcs.map((n) => n.x + ',' + n.y));
  const T0 = Object.values(towns);
  const flora = T0.find((t) => t.id === 'flora');
  if (flora) { const [x, y] = nearestWalkable(W, flora.x + Math.round(flora.w * 0.6), flora.y + Math.round(flora.h * 0.4), pris); if (x != null) { pris.add(x + ',' + y); W.npc({ id: 'concours:flora', x, y, sprite: 'dame', dir: 'down', move: 'turn', name: 'Présentatrice', script: 'concours' }); } }
  for (const t of T0.filter((q) => q.gym == null && ['aube', 'cime', 'orage', 'grue', 'givre'].includes(q.id))) {
    const cx = t.x + Math.round(t.w / 2), cy = t.y + Math.round(t.h / 2);
    const place = (dx, dy) => { const [x, y] = nearestWalkable(W, cx + dx, cy + dy, pris); if (x == null) return null; pris.add(x + ',' + y); return [x, y]; };
    const when = (f, g) => enFete(g);
    let p = place(-2, 1); if (p) W.npc({ id: 'fete:' + t.id + ':musicien', x: p[0], y: p[1], sprite: 'kimono', dir: 'down', move: 'turn', name: 'Musicien', when, script: 'musicien' });
    p = place(3, 1); if (p) W.npc({ id: 'fete:' + t.id + ':loterie', x: p[0], y: p[1], sprite: 'croupier', dir: 'down', move: 'static', name: 'Stand de loterie', when, script: 'loterie' });
    p = place(0, 3); if (p) W.npc({ id: 'fete:' + t.id + ':danse1', x: p[0], y: p[1], sprite: 'fillette', dir: 'down', move: 'wander', when, text: ['C\'est la fête du village ! On danse jusqu\'à minuit !'] });
    p = place(2, 4); if (p) W.npc({ id: 'fete:' + t.id + ':danse2', x: p[0], y: p[1], sprite: 'gamin', dir: 'down', move: 'wander', when, text: ['J\'ai gagné un ballon à la loterie ! Enfin… presque.'] });
  }
}
