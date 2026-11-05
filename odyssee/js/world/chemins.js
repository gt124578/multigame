// odyssee/js/world/chemins.js — les grandes routes : un sentier qui serpente de bloc en bloc dans le territoire de la route
// (blocs de 24 × 24 cases, plan.js), jamais en ligne droite, de sorte qu'on ne voie pas où l'on va. Le chemin passe par
// le centre (un peu décalé) de chaque bloc de son tracé : deux morceaux voisins du tracé restent séparés par une bande de
// forêt. Le long du chemin, le paysage change par tronçons (prairie, étang, rochers, fleurs, bosquet, rivière et son
// pont, butte où l'on monte par des marches, rebords) ; dans les blocs libres à côté, des impasses récompensées
// (clairière, cabane habitée, ruines, source, belvédère, campement, verger) ; parfois un raccourci à débloquer plus tard
// (Coupe, Éclate-Roc, Surf). Les dresseurs ajoutés ont des identifiants fixes (`route:dN`), les objets aussi (`route:oN`).
import { T, walkable } from './tiles.js';
import { carveRoute, along, nearestWalkable, caseLibre, rng, ledges as _ledges } from './mapgen.js';
import { plateau, sinueuse } from './relief.js';
import { houseInterior } from './interiors.js';
import { ROUTES, PRENOMS } from './voix.js';

export const BLOC = 24;
const key = (x, y) => x + ',' + y;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/** cases (blocs) d'un territoire : liste de rectangles [c0, r0, c1, r1] */
export function blocs(terr) { const S = new Set(); for (const [c0, r0, c1, r1] of terr) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) S.add(key(c, r)); return S; }

/** tracé de blocs de `de` à `vers` dans le territoire, d'une longueur proche de `long` (recherche en profondeur au hasard) */
export function trace(terr, de, vers, long, graine = 1) {
  const S = blocs(terr), [ec, er] = vers;
  if (!S.has(key(...de)) || !S.has(key(...vers))) throw new Error(`tracé : départ ${de} ou arrivée ${vers} hors du territoire`);
  let best = null;
  for (let essai = 0; essai < 60; essai++) {
    const r = rng(graine * 7919 + essai * 104729 + 1), vu = new Set([key(...de)]), chemin = [de];
    let budget = 20000, trouve = null;
    // l'arrivée reste-t-elle atteignable sans repasser par le chemin ?
    const atteignable = (c, rr) => {
      const q = [[c, rr]], v = new Set([key(c, rr)]);
      while (q.length) { const [a, b] = q.pop(); if (a === ec && b === er) return v.size; for (const [dx, dy] of N4) { const k = key(a + dx, b + dy); if (S.has(k) && !vu.has(k) && !v.has(k)) { v.add(k); q.push([a + dx, b + dy]); } } }
      return 0;
    };
    const cherche = () => {
      if (--budget < 0 || trouve) return;
      const [c, rr] = chemin[chemin.length - 1];
      if (c === ec && rr === er) { if (Math.abs(chemin.length - long) <= 1 || (!best || Math.abs(chemin.length - long) < Math.abs(best.length - long))) { if (!best || Math.abs(chemin.length - long) < Math.abs(best.length - long)) best = chemin.slice(); if (Math.abs(chemin.length - long) <= 1) trouve = best; } return; }
      if (chemin.length + Math.abs(c - ec) + Math.abs(rr - er) > long + 1) return;
      const opts = N4.map(([dx, dy]) => [c + dx, rr + dy]).filter(([a, b]) => S.has(key(a, b)) && !vu.has(key(a, b)));
      // un peu de hasard, et une préférence pour continuer tout droit (de longues lignes, puis des virages)
      const prev = chemin[chemin.length - 2];
      opts.sort(() => r() - 0.5);
      if (prev && r() < 0.45) opts.sort((p, q) => ((q[0] - c === c - prev[0] && q[1] - rr === rr - prev[1]) ? 1 : 0) - ((p[0] - c === c - prev[0] && p[1] - rr === rr - prev[1]) ? 1 : 0));
      for (const [a, b] of opts) {
        vu.add(key(a, b)); chemin.push([a, b]);
        if (!(a === ec && b === er) ? atteignable(a, b) : true) cherche();
        chemin.pop(); vu.delete(key(a, b));
        if (trouve) return;
      }
    };
    cherche();
    if (trouve) return trouve;
  }
  if (!best) throw new Error(`tracé impossible de ${de} à ${vers}`);
  return best;
}

/**
 * Taille une grande route. S : { id, nom, terr, de: { x, y, dir }, vers: { x, y, dir }, long (blocs), graine, w, grass, trees,
 * flowers, rocks, tall, treeT, theme, ombre, ground, paysages: [...], branches (0..1), raccourci ('coupe' | 'eclate' | 'surf'),
 * base (hauteur du sol de la route), enc (table de rencontres), musique }.
 * ctx : { routes, ENC, trainerNpc, maps } ; renvoie { pts, cells, chemin, cotes }.
 */
export function grandeRoute(W, S, ctx) {
  const r = rng(S.graine || 1), pick = (L) => L[Math.floor(r() * L.length)];
  const blocDe = (x, y) => [Math.floor(x / BLOC), Math.floor(y / BLOC)];
  const dd = DIR[S.de.dir], dv = DIR[S.vers.dir];
  const b0 = S.blocDe || blocDe(S.de.x + dd[0] * 14, S.de.y + dd[1] * 14);
  const b1 = S.blocVers || blocDe(S.vers.x - dv[0] * 14, S.vers.y - dv[1] * 14);
  const chemin = trace(S.terr, b0, b1, S.long, S.graine || 1);
  const centre = ([c, rr], i) => {
    const j = S.jitter ?? 3.5;
    return [c * BLOC + 12 + (i ? (r() - 0.5) * 2 * j : 0), rr * BLOC + 12 + (i ? (r() - 0.5) * 2 * j : 0)];
  };
  const P = [[S.de.x + 0.5 - dd[0] * 0.5, S.de.y + 0.5 - dd[1] * 0.5], [S.de.x + 0.5 + dd[0] * 6, S.de.y + 0.5 + dd[1] * 6]];
  chemin.forEach((b, i) => P.push(centre(b, i > 0 && i < chemin.length - 1 ? 1 : 0)));
  P.push([S.vers.x + 0.5 - dv[0] * 6, S.vers.y + 0.5 - dv[1] * 6], [S.vers.x + 0.5 + dv[0] * 0.5, S.vers.y + 0.5 + dv[1] * 0.5]);
  const pts = sinueuse(P, 3).map(([x, y]) => [x - 0.5, y - 0.5]);
  const res = carveRoute(W, pts, { seed: S.graine || 7, w: S.w || 11, grass: S.grass ?? 0.75, trees: S.trees ?? 0.04, flowers: S.flowers ?? 0.03, rocks: S.rocks ?? 0.01, tall: S.tall, treeT: S.treeT, ground: S.ground, overwrite: S.overwrite, bridge: S.bridge ?? true, taperStart: S.effile?.[0] ?? true, taperEnd: S.effile?.[1] ?? true });
  const cells = new Set(res.info.keys()), info = res.info;
  const base = S.base || 0;
  if (base) for (const k of cells) { const [x, y] = k.split(',').map(Number); W.setHeight(x, y, base); }
  const total = res.total, sDe = (x, y) => info.get(key(x, y))?.s ?? -1;
  // t (0..1) du centre de chaque bloc du tracé, pour placer les choses
  const echant = []; for (let i = 0; i <= 200; i++) echant.push(along(pts, i / 200));
  const tBloc = chemin.map(([c, rr]) => { let best = 0, bd = 1e9; for (let i = 0; i <= 200; i++) { const p = echant[i], d = Math.hypot(p.x - (c * BLOC + 12), p.y - (rr * BLOC + 12)); if (d < bd) { bd = d; best = i / 200; } } return best; });
  const dansBloc = ([c, rr], x, y) => x >= c * BLOC && y >= rr * BLOC && x < (c + 1) * BLOC && y < (rr + 1) * BLOC;
  const casesBloc = (b) => [...cells].map((k) => k.split(',').map(Number)).filter(([x, y]) => dansBloc(b, x, y));
  const loin = (x, y, d = 2.6) => { const v = info.get(key(x, y)); return v && v.d > d; };
  const herbe = S.ground ?? T.GRASS;

  const sentiersImpasses = new Set();
  /* impasses dans les blocs libres du territoire */
  const T0 = blocs(S.terr), pris = new Set(chemin.map((b) => key(...b))), cotes = [];
  const libres = [];
  chemin.forEach((b, i) => { if (i === 0 || i === chemin.length - 1) return; for (const [dx, dy] of N4) { const f = [b[0] + dx, b[1] + dy]; if (T0.has(key(...f)) && !pris.has(key(...f))) libres.push([b, f, i]); } });
  libres.sort(() => r() - 0.5);
  const KINDS = S.impasses || ['clairiere', 'cabane', 'ruines', 'source', 'belvedere', 'campement', 'verger'];
  let no = 0, nc = 0;
  const objet = (x, y, item, qty = 1) => { const [a, c] = caseLibre(W, x, y); W.item(a, c, item, qty, `${S.id}:o${no++}`); };
  const LOTS = S.lots || ['super-potion', 'great-ball', 'ether', 'revive', 'full-heal', 'hyper-potion', 'ultra-ball', 'rare-candy', 'max-repel', 'elixir'];
  for (const [b, f, i] of libres) {
    if (cotes.length >= Math.round(libres.length * (S.branches ?? 0.4)) || pris.has(key(...f))) continue;
    pris.add(key(...f));
    const p = along(pts, tBloc[i]), fx = f[0] * BLOC + 12 + (r() - 0.5) * 4, fy = f[1] * BLOC + 12 + (r() - 0.5) * 4;
    const sp = sinueuse([[p.x, p.y], [(p.x + fx) / 2 + (r() - 0.5) * 5, (p.y + fy) / 2 + (r() - 0.5) * 5], [fx, fy]], 2.5);
    const br = carveRoute(W, sp, { seed: (S.graine || 1) * 31 + cotes.length, w: 5, grass: 0.5, trees: 0.02, flowers: 0.04, tall: S.tall, treeT: S.treeT, ground: S.ground, taperStart: false, taperEnd: false, bridge: true });
    for (const [k, v] of br.info) { cells.add(k); if (v.d <= 1.05) sentiersImpasses.add(k); if (base) { const [x, y] = k.split(',').map(Number); W.setHeight(x, y, base); } }
    // la clairière du bout
    const kind = KINDS[(cotes.length + Math.floor(r() * KINDS.length)) % KINDS.length];
    for (let y = Math.floor(fy - 6); y <= fy + 6; y++) for (let x = Math.floor(fx - 7); x <= fx + 7; x++) {
      if (!dansBloc(f, x, y) || x <= f[0] * BLOC + 1 || y <= f[1] * BLOC + 1 || x >= (f[0] + 1) * BLOC - 2 || y >= (f[1] + 1) * BLOC - 2) continue;
      const q = ((x - fx) / 6.5) ** 2 + ((y - fy) / 5.2) ** 2 + (r() - 0.5) * 0.3;
      if (q <= 1 && (W.get(x, y) === T.TREE || W.get(x, y) === T.PINE)) { W.set(x, y, herbe); W.setHeight(x, y, base); cells.add(key(x, y)); }
    }
    const X = Math.round(fx), Y = Math.round(fy), C = { b: f, x: X, y: Y, kind };
    cotes.push(C);
    if (kind === 'cabane') {
      const B = W.building('house', X - 2, Y - 3, { w: 5, d: 5, door: 1, modele: S.cabane || 'chalet', name: 'Cabane', roof: 'brown' });
      const id = `${S.id}:cabane${nc++}`, inside = houseInterior(id, S.nomCabane || 'Cabane', { w: 9, h: 8, kitchen: true });
      inside.outside = { map: W.id, x: B.doorX, y: B.doorY + 1, dir: 'down' }; inside.warp(inside.exitX, inside.exitY, inside.outside);
      W.warp(B.doorX, B.doorY, { map: id, x: inside.exitX, y: inside.exitY, dir: 'up' });
      if (W.get(B.doorX, B.doorY + 1) !== herbe) W.set(B.doorX, B.doorY + 1, herbe);
      inside.npc({ id: id + ':hote', x: 3, y: 4, sprite: pick(['montagnard', 'vieil_homme', 'randonneuse', 'dame', 'pecheur']), move: 'turn', text: pick([...ROUTES.general, ...(ROUTES[S.voix] || [])]) });
      inside.item(6, 3, pick(LOTS), 1, id + ':o0');
      ctx.maps[id] = inside;
      W.prop('tonneau', X + 3, Y + 1); W.prop('caisses', X - 3, Y + 1);
    } else if (kind === 'ruines') {
      for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) if (W.get(X + dx, Y + dy) === herbe) W.prop(r() < 0.6 ? 'colonne' : 'rocher_grand', X + dx, Y + dy);
      W.prop('stele', X, Y - 2); W.object(X, Y - 2, { use: async (A) => A.say(pick([['Une pierre usée. On devine des silhouettes de Pokémon gravées tout autour.'], ['« Les voyageurs passent, la pierre demeure. »'], ['Des marques étranges, comme des yeux… Elles semblent suivre ton regard.']])) });
      objet(X, Y + 1, pick(LOTS));
    } else if (kind === 'source') {
      W.blob(X + 0.5, Y - 1, 2.6, 1.8, T.WATER, r, [herbe, T.TALL, T.FLOWER]);
      W.prop('stele', X - 4, Y); objet(X + 3, Y + 2, pick(LOTS));
    } else if (kind === 'belvedere') {
      const R = plateau(W, [...cells].map((k) => k.split(',').map(Number)).filter(([x, y]) => Math.hypot(x - X, y - Y) < 4.6 && W.get(x, y) !== T.WATER), base + 1);
      void R; W.sign(X, Y - 2, 'Une longue-vue tournée vers le lointain.\nLe chemin serpente sous les arbres, à perte de vue.', 'telescope');
      W.prop('banc', X + 2, Y - 2); objet(X - 2, Y, pick(LOTS));
    } else if (kind === 'campement') {
      W.prop('caisses', X - 2, Y - 2); W.prop('tonneau', X + 2, Y - 2); W.prop('caisse', X + 3, Y - 1);
      { const [cx, cy] = caseLibre(W, X, Y); W.npc({ id: `${S.id}:camp${cotes.length}`, x: cx, y: cy, dir: 'down', sprite: pick(['randonneuse', 'montagnard', 'gamin', 'fillette']), move: 'turn', text: pick([...ROUTES.general, ...(ROUTES[S.voix] || [])]) }); }
      objet(X + 1, Y + 2, pick(LOTS));
    } else if (kind === 'verger') {
      for (const [dx, dy] of [[-4, -2], [-1, -3], [2, -3], [4, -1], [-4, 2], [4, 2]]) if (W.get(X + dx, Y + dy) === herbe) W.prop(pick(S.arbres || ['erable', 'cerisier']), X + dx, Y + dy);
      objet(X, Y, pick(['oran-berry', ...LOTS]));
    } else {
      for (let y = Y - 2; y <= Y + 2; y++) for (let x = X - 3; x <= X + 3; x++) if (W.get(x, y) === herbe && r() < 0.4) W.set(x, y, T.FLOWER);
      objet(X, Y, pick(LOTS));
    }
  }

  /* paysages, tronçon par tronçon */
  const PAYS = (S.paysages || ['prairie', 'bosquet', 'fleurs', 'etang', 'rochers']).filter((q) => !S.monte || (q !== 'plateau' && q !== 'riviere'));
  let pays = pick(PAYS), reste = 2 + Math.floor(r() * 2);
  const marque = [];
  chemin.forEach((b, i) => {
    if (i === 0 || i === chemin.length - 1) return;
    if (--reste <= 0) { pays = pick(PAYS); reste = 2 + Math.floor(r() * 2); }
    const C = casesBloc(b), cx = b[0] * BLOC + 12, cy = b[1] * BLOC + 12;
    marque.push([b, pays]);
    if (pays === 'prairie') { for (const [x, y] of C) if (loin(x, y) && W.get(x, y) === herbe && r() < 0.45) W.set(x, y, S.tall ?? T.TALL); }
    else if (pays === 'bosquet') { for (const [x, y] of C) if (loin(x, y, 2.8) && W.get(x, y) === herbe && r() < 0.12) W.set(x, y, S.treeT ?? T.TREE); }
    else if (pays === 'fleurs') { for (const [x, y] of C) if (loin(x, y, 1.6) && W.get(x, y) === herbe && (Math.sin(x * 0.7) + Math.sin(y * 0.9)) > 0.6) W.set(x, y, T.FLOWER); }
    else if (pays === 'rochers') {
      for (const [x, y] of C) if (loin(x, y, 2.8) && W.get(x, y) === herbe && r() < 0.05) W.set(x, y, T.ROCK);
      for (let k = 0; k < 2; k++) { const [x, y] = pick(C); if (loin(x, y, 3) && W.get(x, y) === herbe) W.prop('rocher_grand', x, y); }
    } else if (pays === 'etang') {
      // un étang sur le côté du chemin, qui mord un peu dans la forêt
      const p = along(pts, tBloc[i]), s = r() < 0.5 ? 1 : -1, ex = p.x + p.nx * s * 7, ey = p.y + p.ny * s * 7;
      for (let y = Math.floor(ey - 5); y <= ey + 5; y++) for (let x = Math.floor(ex - 6); x <= ex + 6; x++) {
        if (!dansBloc(b, x, y)) continue;
        const q = ((x - ex) / 4.6) ** 2 + ((y - ey) / 3.4) ** 2 + (r() - 0.5) * 0.25;
        const v = info.get(key(x, y)); if ((v && v.d < 3.2) || sentiersImpasses.has(key(x, y))) continue;
        if (q <= 1 && [T.TREE, T.PINE, herbe, T.TALL, T.FLOWER].includes(W.get(x, y))) { W.set(x, y, T.WATER); W.setHeight(x, y, base); }
      }
    } else if (pays === 'riviere') {
      // une rivière traverse le bloc en travers du chemin ; on la passe sur un pont
      const p = along(pts, tBloc[i]), vertical = Math.abs(p.dx) > Math.abs(p.dy);
      for (let k = -1; k <= 1; k++) for (let u = 0; u < BLOC; u++) {
        const x = vertical ? Math.round(cx + k) : b[0] * BLOC + u, y = vertical ? b[1] * BLOC + u : Math.round(cy + k);
        const t = W.get(x, y), v = info.get(key(x, y));
        if ((v && v.d <= 1.05) || sentiersImpasses.has(key(x, y))) { W.set(x, y, T.BRIDGE); continue; }
        if ([T.TREE, T.PINE, herbe, T.TALL, T.FLOWER, T.ROCK].includes(t)) W.set(x, y, T.WATER);
      }
    } else if (pays === 'plateau') {
      const R = plateau(W, C.filter(([x, y]) => W.get(x, y) !== T.WATER), base + 1);
      for (const k of R) cells.add(k);
    } else if (pays === 'rebords') {
      _ledges(W, pts, [tBloc[i]], { reach: 6 });
    }
  });

  /* route qui grimpe (montagne) : chaque bloc du tracé un peu plus haut que le précédent, falaises de roche et marches */
  if (S.monte) {
    const niveaux = chemin.map((_, i) => base + Math.round(i * S.monte / Math.max(1, chemin.length - 1)));
    // chaque case du couloir prend le niveau du bloc du tracé le plus proche le long de la route (les bouts compris)
    const bornesT = tBloc.map((t, i) => (i + 1 < tBloc.length ? (t + tBloc[i + 1]) / 2 : 2));
    const groupes = chemin.map(() => []);
    for (const k of cells) { const v = info.get(k); if (!v) continue; let i = 0; while (i < bornesT.length - 1 && v.s > bornesT[i]) i++; const [x, y] = k.split(',').map(Number); if (W.get(x, y) !== T.WATER) groupes[i].push([x, y]); }
    groupes.forEach((g, i) => { if (niveaux[i] > base && g.length) plateau(W, g, niveaux[i], { roche: true }); });
    res.niveaux = niveaux;
  }

  /* un raccourci entre deux morceaux éloignés du tracé, fermé jusqu'à ce qu'on sache passer */
  if (S.raccourci) {
    const ix = new Map(chemin.map((b, i) => [key(...b), i]));
    let fait = false;
    for (let i = 1; i < chemin.length - 1 && !fait; i++) for (const [dx, dy] of N4) {
      const f = [chemin[i][0] + dx, chemin[i][1] + dy], j = ix.get(key(...f));
      if (j == null || j < i + 5 || j === chemin.length - 1) continue;
      const pa = along(pts, tBloc[i]), pb = along(pts, tBloc[j]);
      const ax = Math.round(pa.x), ay = Math.round(pa.y), bx = Math.round(pb.x), by = Math.round(pb.y);
      // couloir de deux cases, coudé, entre les deux morceaux
      const L = [];
      let x = ax, y = ay; const mx = dx ? Math.round((ax + bx) / 2) : ax, my = dy ? Math.round((ay + by) / 2) : ay;
      while (x !== bx || y !== by) {
        if (dx && x !== bx) x += Math.sign(bx - x); else if (dy && y !== by) y += Math.sign(by - y); else if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y);
        L.push([x, y]);
      }
      void mx; void my;
      const coupe = [];
      for (const [x2, y2] of L) for (const [a, c] of dx ? [[0, 0], [0, 1]] : [[0, 0], [1, 0]]) {
        const t = W.get(x2 + a, y2 + c); if (t === T.TREE || t === T.PINE || t === T.ROCK || t === T.TALL || t === herbe || t === T.FLOWER) { W.set(x2 + a, y2 + c, T.PATH); W.setHeight(x2 + a, y2 + c, base); cells.add(key(x2 + a, y2 + c)); }
        // le milieu du couloir : là où l'obstacle se pose
        if (!info.has(key(x2 + a, y2 + c)) && Math.abs(x2 - (ax + bx) / 2) + Math.abs(y2 - (ay + by) / 2) <= 1.5) coupe.push([x2 + a, y2 + c]);
      }
      const obst = S.raccourci === 'coupe' ? T.CUT : S.raccourci === 'eclate' ? T.SMASH : T.WATER;
      for (const [x2, y2] of coupe) W.set(x2, y2, obst);
      fait = true; break;
    }
  }

  /* dresseurs ajoutés (identifiants fixes) et promeneurs */
  const nd = S.dresseurs ?? Math.max(0, Math.round(chemin.length / 2.4) - (S.anciens || 0));
  const enc = (ctx.ENC?.[S.enc] || []).filter(([sp]) => sp < 1000 || sp >= 1000);
  const niv = S.niveaux || (enc.length ? [Math.min(...enc.map((e) => e[1])), Math.max(...enc.map((e) => e[2]))] : [5, 8]);
  const CLASSES = S.classes || ['Gamin', 'Fillette', 'Randonneuse', 'Montagnard', 'Topdresseur', 'Topdresseuse', 'Insectomane', 'Karatéka'];
  for (let k = 0; k < nd && enc.length; k++) {
    const t = (k + 0.5) / nd * 0.86 + 0.07 + (r() - 0.5) * 0.03;
    const p = along(pts, t), side = r() < 0.5 ? 1 : -1;
    const [x, y] = caseLibre(W, p.x + 0.5 + p.nx * side * 3, p.y + 0.5 + p.ny * side * 3);
    if (W.npcs.some((n) => n.x === x && n.y === y) || W.items.some((i) => i.x === x && i.y === y)) continue;
    const vx = -p.nx * side, vy = -p.ny * side;
    const dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    const n = 1 + Math.floor(r() * 3), team = [];
    for (let i = 0; i < n; i++) { const e = pick(enc); team.push([e[0], Math.min(100, niv[1] - 1 + Math.floor(r() * 3) - (n - 1))]); }
    ctx.trainerNpc(W, x, y, dir, pick(CLASSES), pick(PRENOMS), team, { id: `${S.id}:d${k}`, sight: 3 });
  }
  for (let k = 0; k < (S.promeneurs ?? 1); k++) {
    const p = along(pts, 0.2 + r() * 0.6), [x, y] = caseLibre(W, p.x + 0.5 + p.nx * 2, p.y + 0.5 + p.ny * 2);
    if (!W.npcs.some((n) => n.x === x && n.y === y)) W.npc({ id: `${S.id}:p${k}`, x, y, dir: 'down', sprite: pick(['randonneuse', 'montagnard', 'vieil_homme', 'gamin', 'fillette', 'habitante']), move: 'turn', text: pick([...ROUTES.general, ...(ROUTES[S.voix] || [])]) });
  }
  if (S.panneaux) {
    const [a, b2] = S.panneaux;
    if (a) { const p = along(pts, 0.03); W.sign(...nearestWalkable(W, p.x + 0.5 + p.nx * 2.2, p.y + 0.5 + p.ny * 2.2), a); }
    if (b2) { const p = along(pts, 0.97); W.sign(...nearestWalkable(W, p.x + 0.5 - p.nx * 2.2, p.y + 0.5 - p.ny * 2.2), b2); }
  }
  return { pts, cells, chemin, cotes, marque, total, tBloc, niveaux: res.niveaux };
}

/** les morceaux de la route devenus inaccessibles (relief, étangs) redeviennent forêt : exploration locale (le rectangle
 *  du territoire et une marge), avec toutes les capacités de terrain, depuis une case du chemin */
export function boucherLocal(W, cells, depart, rect, remplace = T.TREE, prefixe = null) {
  const [x0, y0, x1, y1] = rect, w = x1 - x0 + 1, hh = y1 - y0 + 1, at = (x, y) => (y - y0) * w + (x - x0);
  const dedans = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  const vu = new Uint8Array(w * hh), q = [depart]; if (!dedans(...depart)) return; vu[at(...depart)] = 1;
  const peut = (t) => walkable(t) || t === T.CUT || t === T.SMASH || t === T.WATER || t === T.BOULDER;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy; if (!dedans(nx, ny) || vu[at(nx, ny)]) continue;
      const t = W.get(nx, ny);
      let ok = peut(t) && W.height(nx, ny) === W.height(x, y);
      if (t === T.LEDGE && dy === 1 && walkable(W.get(nx, ny + 1))) { vu[at(nx, ny)] = 1; if (dedans(nx, ny + 1) && !vu[at(nx, ny + 1)]) { vu[at(nx, ny + 1)] = 1; q.push([nx, ny + 1]); } continue; }
      if (t === T.STAIRS || W.get(x, y) === T.STAIRS) ok = walkable(t) && Math.abs(W.height(nx, ny) - W.height(x, y)) <= 1;
      if (ok) { vu[at(nx, ny)] = 1; q.push([nx, ny]); }
    }
  }
  const pris = new Set([...W.npcs.map((n) => key(n.x, n.y)), ...W.items.map((i) => key(i.x, i.y))]);
  const SOL = new Set([T.GRASS, T.TALL, T.DARKTALL, T.FLOWER, T.PATH, T.SAND, T.SNOW, T.ASH]);
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    if (dedans(x, y) && !vu[at(x, y)] && SOL.has(W.get(x, y)) && !pris.has(k)) W.set(x, y, remplace);
  }
  // ce que la route a posé (objets, dresseurs, promeneurs) et qui s'est retrouvé isolé : ramené au plus près, sur le chemin
  if (prefixe) {
    const atteint = (x, y) => dedans(x, y) && vu[at(x, y)];
    const occ = new Set([...W.npcs.map((n) => key(n.x, n.y)), ...W.items.map((i) => key(i.x, i.y))]);
    const proche = (x, y) => { for (let r = 1; r < 30; r++) for (let j = -r; j <= r; j++) for (const i of [-r, r]) for (const [a, b] of [[x + i, y + j], [x + j, y + i]]) { const t = W.get(a, b); if (atteint(a, b) && walkable(t) && t !== T.DOOR && t !== T.STAIRS && t !== T.BRIDGE && !occ.has(key(a, b)) && !W.warpAt(a, b)) return [a, b]; } return null; };
    for (const q of [...W.items, ...W.npcs]) {
      if (!q.id?.startsWith(prefixe) || !dedans(q.x, q.y) || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => atteint(q.x + a, q.y + b))) continue;
      const p = proche(q.x, q.y); if (!p) continue;
      occ.delete(key(q.x, q.y)); [q.x, q.y] = p; occ.add(key(...p));
    }
  }
}
