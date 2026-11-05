// odyssee/js/world/quartiers.js — les villes agrandies : l'ancienne ville devient le centre (ses bâtiments, ses habitants,
// ses identifiants ne bougent pas), et tout autour poussent des quartiers façon HeartGold, en plus grand : résidences
// (maisons visitables, jardins, boîtes aux lettres), place à fontaine, marché à étals, parc et son étang, jardins
// ouvriers, fermes, port et quais, quartier d'affaires. Rues en grille irrégulière, avenues des portes de la ville
// jusqu'au centre, boulevard autour du centre. Tout reste relié (vérifié à la fin : rien d'isolé, aucune porte fermée).
//
// grandeVille(W, maps, def, V, outils) — def : la ville d'avant (centre), V : la grande ville :
//   x, y, w, h       rectangle de la ville (cases) ; cx, cy : coin du centre dans ce rectangle
//   sorties          [{ dir: 'n'|'s'|'e'|'w', k, garde: id du garde du centre à poster là, coupe: true }]
//   theme            voix et décor (voix.js, VILLES) ; sol, rue : sols ; mer : côté ouvert sur la mer ('n', 's'…)
//   quartiers        poids des sortes de quartier { maisons, parc, place, marche, jardins, ferme, affaires }
//   graine           tirages
import { T, walkable } from './tiles.js';
import { rng } from './mapgen.js';
import { GENERAL, VILLES, ETALS } from './voix.js';

const TOITS = ['red', 'blue', 'green', 'brown', 'teal', 'orange', 'purple', 'gray'];
const SPRITES = ['habitante', 'habitant', 'vieil_homme', 'dame', 'gamin', 'fillette', 'enfant', 'topdresseur', 'topdresseuse', 'scientifique', 'randonneuse', 'montagnard', 'pecheur', 'jardinier'];
/** maisons visitables : sorte, largeur, profondeur, réglages du modèle */
const MAISONS = [
  { kind: 'house', w: 4, d: 3 }, { kind: 'house2', w: 5, d: 3 }, { kind: 'house', w: 4, d: 3 }, { kind: 'bighouse', w: 6, d: 4 },
  { kind: 'house2', w: 5, d: 3 }, { kind: 'house', w: 5, d: 5, door: 1, modele: 'chalet' }, { kind: 'house', w: 7, d: 4, door: 1, modele: 'maisonExt' },
];

export function grandeVille(W, maps, def, V, { buildTown, poserBatiment }) {
  const r = rng(V.graine || (V.x * 131 + V.y * 71 + 7));
  const pick = (L) => L[Math.floor(r() * L.length)];
  const X = V.x, Y = V.y, w = V.w, h = V.h, X1 = X + w - 1, Y1 = Y + h - 1;
  const sol = V.sol ?? def.ground ?? T.GRASS, rue = V.rue ?? (sol === T.PAVE ? T.PAVE : T.PATH);
  const ep = V.bord ?? 3;
  def.x = X + V.cx; def.y = Y + V.cy; def.fermer = false; def.ville = { x: X, y: Y, w, h };
  const voix = [...(VILLES[V.theme] || []), ...(VILLES[V.theme] || []), ...GENERAL];
  let nv = Math.floor(r() * voix.length);
  const parole = () => voix[nv++ % voix.length];
  const ib = ep + (V.organique === false ? 0 : 2);   // la ceinture et ses bosses : on bâtit au-delà
  const dans = (x, y) => x >= X + ib && y >= Y + ib && x <= X1 - ib && y <= Y1 - ib;
  const C = { x0: def.x, y0: def.y, x1: def.x + def.w - 1, y1: def.y + def.h - 1 };
  const R = { x0: C.x0 - 2, y0: C.y0 - 2, x1: C.x1 + 2, y1: C.y1 + 2 };   // le centre et son boulevard
  const dansR = (x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;

  /* 1. le sol, la ceinture d'arbres (ou la mer), les portes */
  const bosse = (x, y) => (V.organique === false ? 0 : Math.floor(((Math.sin(x * 0.37 + y * 0.11) + Math.sin(y * 0.29 - x * 0.07)) * 0.5 + 1) * 1.2));
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
    const dn = y - Y, ds = Y1 - y, dw = x - X, de = X1 - x, d = Math.min(dn, ds, dw, de);
    const cote = d === dn ? 'n' : d === ds ? 's' : d === dw ? 'w' : 'e';
    if (V.mer && V.mer.includes(cote) && d < ep + 6) { W.set(x, y, V.digue && d === 0 ? T.ROCK : T.WATER); continue; }
    W.set(x, y, d < ep + (dansR(x, y) ? 0 : bosse(x, y)) ? T.TREE : sol);
  }
  W.zone(X, Y, X1, Y1, { name: def.name, music: def.music || 'town', town: def.id, theme: def.theme });
  const sorties = [], rues = new Set();   // les cases de rue : on n'y bâtit rien
  for (const s of V.sorties || []) {
    const { dir, k } = s, cells = [], ext = [];
    for (let i = 0; i < ep + 4; i++) for (const j of [0, 1]) {
      const [x, y] = dir === 'n' ? [X + k + j, Y + i] : dir === 's' ? [X + k + j, Y1 - i] : dir === 'w' ? [X + i, Y + k + j] : [X1 - i, Y + k + j];
      W.set(x, y, rue); cells.push([x, y]); rues.add(x + ',' + y);
    }
    for (const j of [0, 1]) ext.push(dir === 'n' ? [X + k + j, Y - 1] : dir === 's' ? [X + k + j, Y1 + 1] : dir === 'w' ? [X - 1, Y + k + j] : [X1 + 1, Y + k + j]);
    // la rangée gardée (dans la ceinture) et la case du garde (juste à l'intérieur)
    const g = ep - 1, tiles = [0, 1].map((j) => dir === 'n' ? [X + k + j, Y + g] : dir === 's' ? [X + k + j, Y1 - g] : dir === 'w' ? [X + g, Y + k + j] : [X1 - g, Y + k + j]);
    const poste = dir === 'n' ? [X + k + 2, Y + ep] : dir === 's' ? [X + k + 2, Y1 - ep] : dir === 'w' ? [X + ep, Y + k + 2] : [X1 - ep, Y + k + 2];
    W.set(poste[0], poste[1], rue);   // la case du garde : à côté du couloir, toujours praticable
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
  // les sorties du centre qui ne mènent plus à rien : leur couloir reste une ruelle
  for (const d of def.deco || []) if (d[0] === 'cut') d[0] = 'flowers_cut';
  def.deco = (def.deco || []).filter((d) => d[0] !== 'flowers_cut');

  /* 2. le centre (l'ancienne ville) */
  buildTown(W, maps, def);

  /* 3. les rues : boulevard autour du centre, grille irrégulière, avenues depuis les portes */
  const posee = (x, y) => { if (!dans(x, y)) return; const t = W.get(x, y); if (t === T.TREE || t === sol || t === T.GRASS || t === T.FLOWER) { W.set(x, y, rue); rues.add(x + ',' + y); } };
  for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (x < C.x0 || x > C.x1 || y < C.y0 || y > C.y1) posee(x, y);
  const lignes = (a, b, pas0, pas1, evite0, evite1) => {
    const out = []; let v = a + 9 + Math.floor(r() * 5);
    while (v < b - 9) {
      if (!(v > evite0 - 7 && v < evite1 + 7)) out.push(v);
      v += pas0 + Math.floor(r() * (pas1 - pas0 + 1));
    }
    return out;
  };
  const xs = lignes(X + ib, X1 - ib, V.pasX?.[0] ?? 19, V.pasX?.[1] ?? 26, R.x0, R.x1);
  const ys = lignes(Y + ib, Y1 - ib, V.pasY?.[0] ?? 15, V.pasY?.[1] ?? 20, R.y0, R.y1);
  for (const x of xs) for (let y = Y + ib; y <= Y1 - ib; y++) if (!dansR(x, y) && !dansR(x + 1, y)) { posee(x, y); posee(x + 1, y); }
  for (const y of ys) for (let x = X + ib; x <= X1 - ib; x++) if (!dansR(x, y) && !dansR(x, y + 1)) { posee(x, y); posee(x, y + 1); }
  // rues qui s'arrêtent contre le boulevard : raccordées
  const avenue = (x, y, dx, dy) => { for (let i = 0; i < 400; i++) { if (!W.in(x, y) || (i > 2 && (W.get(x, y) === rue || W.get(x + dy, y + dx) === rue) && W.get(x, y) !== T.TREE)) break; if (dans(x, y) || dans(x + dy, y + dx)) { W.set(x, y, rue); W.set(x + dy, y + dx, rue); rues.add(x + ',' + y); rues.add((x + dy) + ',' + (y + dx)); } x += dx; y += dy; } };
  for (const s of sorties) { const [x, y] = s.interieur, v = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[s.dir]; avenue(x, y, v[0], v[1]); }

  /* 4. les îlots entre les rues */
  const bornes = (a, b, L) => { const o = []; let p = a; for (const v of L) { o.push([p, v - 1]); p = v + 2; } o.push([p, b]); return o; };
  const ilots = [];
  const ajoute = (b) => {
    if (b.x1 - b.x0 < 5 || b.y1 - b.y0 < 4) { for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (W.get(x, y) === sol && r() < 0.5) W.set(x, y, T.FLOWER); return; }
    // l'eau du port ne fait pas partie de l'îlot
    let eau = 0; for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (W.get(x, y) === T.WATER) eau++;
    b.eau = eau; b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; b.aire = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    ilots.push(b);
  };
  for (const [x0, x1] of bornes(X + ib, X1 - ib, xs)) for (const [y0, y1] of bornes(Y + ib, Y1 - ib, ys)) {
    if (x1 < R.x0 || x0 > R.x1 || y1 < R.y0 || y0 > R.y1) { ajoute({ x0, y0, x1, y1 }); continue; }
    // îlot entamé par le centre : les quatre morceaux autour (haut, bas, puis les côtés entre les deux)
    const hy0 = Math.max(y0, R.y0), hy1 = Math.min(y1, R.y1);
    for (const b of [{ x0, y0, x1, y1: R.y0 - 1 }, { x0, y0: R.y1 + 1, x1, y1 }, { x0, y0: hy0, x1: R.x0 - 1, y1: hy1 }, { x0: R.x1 + 1, y0: hy0, x1, y1: hy1 }])
      if (b.x1 >= b.x0 && b.y1 >= b.y0) ajoute(b);
  }

  /* 5. outils de pose */
  let nb = 0, nn = 0, no = 0;
  const occ = new Set(W.npcs.filter((n) => n.x >= X && n.y >= Y && n.x <= X1 && n.y <= Y1).map((n) => n.x + ',' + n.y));
  const libre = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = W.get(x, y); if (!(t === sol || t === T.GRASS || t === T.FLOWER || t === T.PAVE || t === T.PATH || t === T.SAND) || occ.has(x + ',' + y) || rues.has(x + ',' + y)) return false; } return true; };
  const maison = (x, y, M, o = {}) => {
    if (!libre(x, y, x + M.w - 1, y + M.d - 1)) return null;
    const npcs = o.vide ? [] : [{ x: 3, y: 4, sprite: o.sprite || pick(SPRITES), move: 'turn', text: o.text || parole() }];
    return poserBatiment(W, maps, def, { ...M, x: x - def.x, y: y - def.y, roof: o.roof || pick(V.toits || TOITS), id: 'q' + nb++, name: o.name, npcs });
  };
  const decor = (modele, x, y, wd, dd, o = {}) => {
    if (!libre(x, y, x + wd - 1, y + dd - 1)) return null;
    return W.building('tower', x, y, { w: wd, d: dd, h: o.h ?? 3, door: -1, modele, name: o.name || modele, roof: o.roof || 'gray', opts: o.opts });
  };
  const pnj = (x, y, o = {}) => {
    const t = W.get(x, y); if (!walkable(t) || t === T.DOOR || occ.has(x + ',' + y) || W.warpAt(x, y)) return null;
    occ.add(x + ',' + y);
    return W.npc({ id: `${def.id}:h${nn++}`, x, y, dir: o.dir || pick(['down', 'left', 'right', 'up']), sprite: o.sprite || pick(SPRITES), move: o.move || pick(['wander', 'turn', 'turn']), text: o.text || parole() });
  };
  // un arbre d'ornement de la ville (érable, cerisier…) une fois sur trois ; sinon un arbre ordinaire de la forêt
  const arbre = (x, y) => { if (r() < 0.35) prop(pick(V.arbres || ['erable', 'cerisier']), x, y); else { const t = W.get(x, y); if ((t === sol || t === T.GRASS || t === T.FLOWER) && !occ.has(x + ',' + y) && !rues.has(x + ',' + y)) W.set(x, y, T.TREE); } };
  const prop = (k, x, y, o) => { const t = W.get(x, y); if ((t === sol || t === T.GRASS || t === T.FLOWER || t === T.PAVE || t === T.PATH) && !occ.has(x + ',' + y) && !rues.has(x + ',' + y) && !W.signs.has(x + ',' + y)) W.prop(k, x, y, true, o); };
  const objet = (x, y, item, qty = 1) => { if (walkable(W.get(x, y)) && W.get(x, y) !== T.DOOR) W.item(x, y, item, qty, `${def.id}:o${no++}`); };
  const rect = (x0, y0, x1, y1, t, only) => W.rect(x0, y0, x1, y1, t, only);

  /* 6. les quartiers */
  const Q = { maisons: 6, parc: 1, place: 1, marche: 1, jardins: 1, ferme: 0, affaires: 0, ...(V.quartiers || {}) };
  const sortes = [];
  ilots.sort((a, b) => b.aire - a.aire);
  // les îlots du bord de mer deviennent le port ; puis un parc (le plus grand), une place et un marché près du centre
  const pres = (b) => Math.hypot(b.cx - (C.x0 + C.x1) / 2, b.cy - (C.y0 + C.y1) / 2);
  for (const b of ilots) if (b.eau > 4) b.sorte = 'port';
  const reste = () => ilots.filter((b) => !b.sorte);
  const prendre = (sorte, n, tri) => { const L = reste().sort(tri); for (let i = 0; i < n && i < L.length; i++) L[i].sorte = sorte; };
  if (Q.parc) prendre('parc', Q.parc, (a, b) => b.aire - a.aire);
  if (Q.place) prendre('place', Q.place, (a, b) => pres(a) - pres(b));
  if (Q.marche) prendre('marche', Q.marche, (a, b) => pres(a) - pres(b));
  for (const [s, k] of Object.entries(Q)) if (!['parc', 'place', 'marche', 'maisons'].includes(s)) for (let i = 0; i < k; i++) sortes.push(s);
  for (const b of reste()) b.sorte = sortes.length && r() < 0.3 ? sortes.splice(Math.floor(r() * sortes.length), 1)[0] : (V.defaut || 'maisons');

  const QUARTIERS = {
    maisons(b) {
      // une ou deux rangées de maisons tournées vers le sud (la seconde devant une ruelle), séparées par des jardins :
      // arbres, massifs de fleurs, bancs, lampadaires, parfois un terrain resté en jardin
      let yd = b.y1 - 1;
      for (let rang = 0; rang < 6; rang++) {
        let x = b.x0 + 1 + Math.floor(r() * 3), hmax = 0;
        if (rang > 0) rect(b.x0, yd + 1, b.x1, yd + 1, T.PATH);
        while (x < b.x1 - 3) {
          const M = pick(V.maisons || MAISONS);
          const top = yd - (M.d - 1);
          if (top < b.y0 + 1 || x + M.w - 1 > b.x1 - 1) { x++; if (x + 4 > b.x1) break; continue; }
          if (r() < 0.14) {
            // un terrain resté en jardin : un arbre, des fleurs, un banc
            rect(x, top + 1, x + 2, yd, T.FLOWER, [sol, T.GRASS]); arbre(x + 1, top); prop('banc', x + 1, yd);
            x += 5; continue;
          }
          if (maison(x, top, M)) {
            hmax = Math.max(hmax, M.d);
            // derrière la maison, une barrière de jardin
            if (r() < 0.5 && top - 1 >= b.y0) for (let xx = x; xx < x + M.w; xx++) if (W.get(xx, top - 1) === sol || W.get(xx, top - 1) === T.GRASS) W.set(xx, top - 1, T.FENCE);
            // le jardin d'à côté
            const gx = x + M.w, g = 2 + Math.floor(r() * 2);
            if (gx + g <= b.x1) {
              const q = r();
              if (q < 0.3) rect(gx, yd, gx + g - 2, yd, T.FLOWER, [sol, T.GRASS]);
              else if (q < 0.6) arbre(gx, top + Math.floor(r() * M.d));
              else if (q < 0.75) prop('lamp', gx, yd);
              else if (q < 0.85) prop('banc', gx, yd);
              else if (q < 0.92) prop('pot', gx, yd);
            }
            x += M.w + g;
          } else x++;
        }
        if (!hmax) break;
        yd = yd - hmax - 3;
        if (yd - 3 < b.y0 + 1) break;
      }
      // ce qui reste en haut de l'îlot : un verger ou une pelouse fleurie
      for (let k = 0; k < (b.x1 - b.x0) / 6; k++) { const x = b.x0 + 1 + Math.floor(r() * (b.x1 - b.x0 - 1)), y = b.y0 + Math.floor(r() * 2); arbre(x, y); }
      if (r() < 0.6) pnj(Math.round(b.cx), b.y1, { move: 'wander' });
    },
    parc(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PATH, T.PAVE]);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      // allées en croix, une petite place au milieu avec sa fontaine
      rect(b.x0, my, b.x1, my + 1, T.PATH); rect(mx, b.y0, mx + 1, b.y1, T.PATH);
      rect(mx - 3, my - 3, mx + 4, my + 4, T.PAVE);
      decor('fontaine', mx - 1, my - 1, 3, 3, { h: 2 });
      // l'étang dans un coin, des bosquets dans les autres
      const coins = [[b.x0 + 1, b.y0 + 1, mx - 5, my - 4], [mx + 6, b.y0 + 1, b.x1 - 1, my - 4], [b.x0 + 1, my + 6, mx - 5, b.y1 - 1], [mx + 6, my + 6, b.x1 - 1, b.y1 - 1]];
      coins.forEach(([x0, y0, x1, y1], i) => {
        if (x1 - x0 < 3 || y1 - y0 < 2) return;
        const q = (i + Math.floor(r() * 4)) % 4;
        if (q === 0 && x1 - x0 >= 5 && y1 - y0 >= 4) {
          const ray = Math.min((x1 - x0) / 2 - 0.5, (y1 - y0) / 2 + 1.5);
          W.blob((x0 + x1) / 2, (y0 + y1) / 2, ray, Math.min(ray * 0.7, (y1 - y0) / 2 - 0.5), T.WATER, r, [T.GRASS]);
          prop('banc', x0, y1); if (r() < 0.6) pnj(x1, y1, { sprite: 'pecheur', move: 'turn' });
        } else if (q === 1) {
          // un bosquet : des arbres serrés au milieu, quelques arbres d'ornement autour
          W.blob((x0 + x1) / 2, (y0 + y1) / 2, Math.max(1.2, (x1 - x0) / 2 - 1), Math.max(1, (y1 - y0) / 2 - 1), T.TREE, r, [T.GRASS]);
          for (let k = 0; k < 3; k++) prop(pick(V.arbres || ['erable', 'cerisier']), x0 + Math.floor(r() * (x1 - x0 + 1)), y0 + Math.floor(r() * (y1 - y0 + 1)));
        } else if (q === 2) {
          rect(x0, y0, x1, y1, T.FLOWER, [T.GRASS]); rect(Math.round((x0 + x1) / 2), y0, Math.round((x0 + x1) / 2), y1, T.PATH, [T.FLOWER]);
        } else {
          // une pelouse plantée d'arbres en quinconce, un banc à l'ombre
          for (let y = y0; y <= y1; y += 3) for (let x = x0 + (y % 2); x <= x1; x += 4) W.set(x, y, T.TREE);
          prop('banc', x0 + 1, y1);
        }
      });
      for (const [x, y] of [[mx - 1, my - 4], [mx + 2, my - 4], [mx - 4, my + 5], [mx + 5, my + 5]]) prop('banc', x, y);
      for (const [x, y] of [[mx - 3, my - 3], [mx + 4, my - 3], [mx - 3, my + 4], [mx + 4, my + 4]]) prop('lamp', x, y);
      pnj(mx - 2, my + 3, { sprite: 'enfant', move: 'wander' }); pnj(mx + 3, my - 2, { sprite: pick(['fillette', 'gamin']), move: 'wander' });
      pnj(mx + 3, my + 3, { sprite: 'vieil_homme', move: 'turn' });
      if (r() < 0.7) objet(b.x1 - 1, b.y0 + 1, pick(['potion', 'super-potion', 'poke-ball', 'great-ball', 'repel']));
    },
    place(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      const mx = Math.round(b.cx), my = Math.round(b.cy);
      if (b.x1 - b.x0 >= 14 && b.y1 - b.y0 >= 10 && r() < 0.5) decor('kiosque', mx - 1, my - 2, 4, 5, { h: 3 });
      else decor('fontaine', mx - 1, my - 1, 3, 3, { h: 2 });
      for (const [x, y] of [[b.x0 + 1, b.y0 + 1], [b.x1 - 1, b.y0 + 1], [b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 1]]) prop('lamp', x, y);
      for (const [x, y] of [[mx - 4, my + 3], [mx + 4, my + 3], [mx - 4, my - 3], [mx + 4, my - 3]]) prop(r() < 0.6 ? 'banc' : 'pot', x, y);
      for (let x = b.x0 + 3; x < b.x1 - 2; x += 4) { prop('pot', x, b.y0); }
      if (V.statue) prop(V.statue, mx, b.y0 + 1);
      pnj(mx - 2, my + 4); pnj(mx + 3, my - 3); if (b.aire > 200) pnj(b.x0 + 3, my, { move: 'wander' });
    },
    marche(b) {
      // la place du marché : deux rangées d'étals sous leurs auvents, un marchand derrière chacun, des caisses, une fontaine
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      const stores = ['#d84a3a', '#3a78c8', '#e8b030', '#4a9a5a', '#c85aa0', '#e07a2a'];
      let n = 0;
      for (const yr of [b.y0 + 1, b.y0 + 7]) {
        if (yr + 3 > b.y1) break;
        for (let x = b.x0 + 2; x + 1 <= b.x1 - 2 && n < 10; x += 6) {
          if (decor('etal', x, yr + 1, 2, 2, { h: 2, opts: { store: pick(stores) } })) {
            n++;
            pnj(x, yr, { sprite: pick(['vendeur', 'habitante', 'habitant', 'dame', 'pecheur', 'montagnard']), dir: 'down', move: 'static', text: pick(ETALS) });
            if (n % 2) prop(pick(['tonneau', 'caisse']), x + 2, yr + 1);
            if (n % 3 === 0) pnj(x + 1, yr + 3, { move: 'wander' });
          }
        }
      }
      if (b.y1 - b.y0 >= 14) decor('fontaine', Math.round(b.cx) - 1, b.y1 - 4, 3, 3, { h: 2 });
      for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) prop('lamp', x, y);
      W.sign(b.x0 + 1, b.y1, `MARCHÉ DE ${def.name.toUpperCase()}\nProduits frais tous les matins.`);
    },
    jardins(b) {
      // jardins ouvriers : des parcelles fleuries bordées de barrières, des allées, une cabane à outils, un puits
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol, T.PATH, T.PAVE]);
      const mx = Math.round(b.cx);
      rect(mx, b.y0, mx, b.y1, T.PATH); rect(b.x0, Math.round(b.cy), b.x1, Math.round(b.cy), T.PATH);
      for (let y = b.y0 + 1; y + 3 <= b.y1 - 1; y += 5) for (let x = b.x0 + 1; x + 4 <= b.x1 - 1; x += 6) {
        if (x <= mx && x + 4 >= mx || y <= Math.round(b.cy) && y + 3 >= Math.round(b.cy)) continue;
        rect(x + 1, y + 1, x + 3, y + 2, T.FLOWER);
        // une barrière basse devant et derrière la parcelle (jamais en colonne : de face, ce ne serait qu'un piquet)
        for (let i = x; i <= x + 4; i++) if (i !== x + 2) W.set(i, y + 3, T.FENCE);
        if (r() < 0.5) prop(pick(['pot', 'tonneau']), x, y);
      }
      decor('cabaneChasseur', b.x1 - 4, b.y0 + 1, 4, 3, { h: 3, name: 'Cabane à outils' }) || decor('puits', b.x1 - 3, b.y0 + 1, 2, 2, { h: 2 });
      decor('puits', b.x0 + 1, b.y1 - 2, 2, 2, { h: 2 });
      pnj(mx + 1, Math.round(b.cy) + 1, { sprite: 'jardinier', move: 'turn', text: ['Mes tomates poussent mieux depuis que mon Mystherbe dort à côté.', 'Il paraît que ça les rassure.'] });
      if (r() < 0.6) objet(mx - 1, b.y1, pick(['oran-berry', 'potion', 'antidote']));
    },
    ferme(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.GRASS, [sol]);
      decor('grange', b.x0 + 1, b.y0 + 1, 6, 5, { h: 4 });
      if (b.x1 - b.x0 > 14) decor('moulin', b.x1 - 4, b.y0 + 1, 4, 4, { h: 6 });
      for (let y = b.y0 + 7; y <= b.y1 - 1; y += 2) rect(b.x0 + 1, y, b.x1 - 1, y, T.FLOWER);
      for (let x = b.x0; x <= b.x1; x++) if (W.get(x, b.y0 + 6) === T.GRASS && (x - b.x0) % 6) W.set(x, b.y0 + 6, T.FENCE);
      pnj(b.x0 + 8, b.y0 + 3, { sprite: 'montagnard', move: 'turn', text: ['La ferme nourrit tout le bourg. Les Écrémeuh donnent du lait matin et soir.'] });
    },
    affaires(b) {
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      let x = b.x0 + 1;
      while (x < b.x1 - 5) {
        const tw = 6 + Math.floor(r() * 4), td = Math.min(6, b.y1 - b.y0 - 3);
        if (x + tw - 1 > b.x1 - 1 || td < 4) break;
        if (libre(x, b.y0 + 1, x + tw - 1, b.y0 + td)) W.building('tower', x, b.y0 + 1, { w: tw, d: td, h: 7 + Math.floor(r() * 8), door: -1, kit: 'gc' + Math.floor(r() * 4), flat: true, name: 'Tour', roof: 'gray' });
        x += tw + 2;
      }
      for (let xx = b.x0 + 2; xx < b.x1; xx += 5) prop(r() < 0.5 ? 'erable' : 'lamp', xx, b.y1);
      pnj(Math.round(b.cx), b.y1 - 1, { sprite: pick(['topdresseur', 'topdresseuse', 'scientifique']), move: 'wander' });
    },
    esplanade(b) {
      // une esplanade dallée, des colonnades, des statues, des parterres : la grandeur du Plateau Céleste
      rect(b.x0, b.y0, b.x1, b.y1, T.PAVE);
      for (let x = b.x0 + 1; x <= b.x1 - 1; x += 4) { prop('colonne', x, b.y0); prop('colonne', x, b.y1); }
      for (let y = b.y0 + 3; y <= b.y1 - 3; y += 5) for (let x = b.x0 + 3; x <= b.x1 - 3; x += 6) {
        if ((x + y) % 3 === 0) prop(pick(['gymstatue', 'statue']), x, y);
        else { rect(x - 1, y, x + 1, y + 1, T.FLOWER); }
      }
      if (b.aire > 180) decor('fontaine', Math.round(b.cx) - 1, Math.round(b.cy) - 1, 3, 3, { h: 2 });
      pnj(Math.round(b.cx) + 2, Math.round(b.cy) + 2, { sprite: pick(['topdresseur', 'topdresseuse', 'vieil_homme']), move: 'wander' });
    },
    port(b) {
      // quai pavé au bord de l'eau, pontons de bois, bateaux, caisses, pêcheurs ; une cabane de pêcheur, un phare au bout
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        if (W.get(x, y) === T.WATER) continue;
        const bord = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, c]) => W.get(x + a, y + c) === T.WATER);
        W.set(x, y, bord ? T.PAVE : W.get(x, y) === sol ? sol : W.get(x, y));
      }
      let pontons = 0;
      for (let x = b.x0 + 2; x <= b.x1 - 2; x += 6) {
        // un ponton s'avance vers le large depuis le quai
        let y = b.y1; while (y > b.y0 && W.get(x, y) !== T.WATER) y--;
        const dy = W.get(x, y) === T.WATER ? -1 : 0; if (!dy) { y = b.y0; while (y < b.y1 && W.get(x, y) !== T.WATER) y++; }
        const sens = W.get(x, y - 1) === T.WATER ? -1 : 1;
        if (W.get(x, y) !== T.WATER) continue;
        let L = 0; for (let k = 0; k < 5 && W.get(x, y + sens * k) === T.WATER; k++) { W.set(x, y + sens * k, T.BRIDGE); L++; }
        if (L >= 3) { pontons++; if (W.get(x + 1, y + sens * 2) === T.WATER) prop('bateau', x + 1, y + sens * 2); if (r() < 0.5) pnj(x, y + sens * (L - 1), { sprite: 'pecheur', move: 'turn', text: pick([['Ça mord, ça mord !'], ['Le meilleur moment pour pêcher, c\'est quand on devrait être ailleurs.'], ['Les Magicarpe sont nombreux ici. Les Léviator… beaucoup moins.']]) }); }
      }
      for (let k = 0; k < 4; k++) { const x = b.x0 + Math.floor(r() * (b.x1 - b.x0 + 1)), y = b.y0 + Math.floor(r() * (b.y1 - b.y0 + 1)); if (W.get(x, y) === T.PAVE) prop(pick(['caisse', 'tonneau', 'caisses', 'bouee']), x, y); }
      if (pontons) pnj(Math.round(b.cx), Math.round(b.cy), { sprite: 'marin', move: 'wander' });
    },
  };
  for (const b of ilots) (QUARTIERS[b.sorte] || QUARTIERS.maisons)(b);
  // des lampadaires le long des avenues
  for (const s of sorties) { const [x, y] = s.interieur; for (const [a, c] of [[-1, 0], [2, 0], [0, -1], [0, 2]]) if (dans(x + a, y + c)) prop('lamp', x + a, y + c); }
  // panneau de bienvenue à chaque porte
  for (const s of sorties) {
    const [x, y] = s.cells[ep + 1] || s.interieur, v = s.dir === 'n' || s.dir === 's' ? [2, 0] : [0, 2];
    const px = x + v[0], py = y + v[1];
    if (walkable(W.get(px, py)) && !W.signs.has(px + ',' + py)) W.sign(px, py, `${def.name.toUpperCase()}\n${V.devise || 'Bienvenue !'}`);
  }

  /* 7. tout relier : chaque porte, chaque habitant et chaque objet rejoint les rues ; les recoins isolés se referment */
  relier(W, X, Y, X1, Y1, sorties.length ? sorties.flatMap((q) => q.cells) : [[def.x, def.y]], rue);
  return def;
}

/** relie à la ville tout ce qui doit l'être (devants de porte, habitants, objets) en taillant une ruelle droite vers la
 *  case reliée la plus proche ; ce qui reste isolé (bouts d'herbe) se referme en bosquet */
export function relier(W, X, Y, X1, Y1, departs, rue = T.PATH) {
  const wW = X1 - X + 1, hH = Y1 - Y + 1, at = (x, y) => (y - Y) * wW + (x - X);
  const dedans = (x, y) => x >= X && y >= Y && x <= X1 && y <= Y1;
  const bloque = new Set(W.npcs.filter((n) => dedans(n.x, n.y) && n.move !== 'wander').map((n) => n.x + ',' + n.y));
  // les obstacles qu'une capacité ouvre (petit arbre, rocher fissuré) comptent comme un passage
  const passe = (x, y) => { const t = W.get(x, y); return (walkable(t) || t === T.CUT || t === T.SMASH || t === T.BOULDER) && t !== T.DOOR && !bloque.has(x + ',' + y); };
  const vu = new Uint8Array(wW * hH);
  const remplir = (sx, sy) => {
    if (!dedans(sx, sy) || !passe(sx, sy) || vu[at(sx, sy)]) return; const q = [[sx, sy]]; vu[at(sx, sy)] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = x + a, v = y + b; if (dedans(u, v) && !vu[at(u, v)] && passe(u, v) && W.height(u, v) === W.height(x, y)) { vu[at(u, v)] = 1; q.push([u, v]); } } }
  };
  for (const [x, y] of departs) remplir(x, y);
  const besoins = [];
  for (const b of W.buildings) if (b.door >= 0 && dedans(b.doorX, b.doorY + 1)) besoins.push([b.doorX, b.doorY + 1]);
  for (const n of W.npcs) if (dedans(n.x, n.y)) besoins.push([n.x, n.y, 1]);
  for (const it of W.items) if (dedans(it.x, it.y)) besoins.push([it.x, it.y, 1]);
  const dec = new Set(W.deco.filter((d) => dedans(d.x, d.y)).map((d) => d.x + ',' + d.y));
  const garde = new Set([...W.items.filter((i) => dedans(i.x, i.y)).map((i) => i.x + ',' + i.y), ...W.npcs.filter((n) => dedans(n.x, n.y)).map((n) => n.x + ',' + n.y)]);
  const touche = (x, y, voisin) => (voisin ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]]).some(([a, b]) => dedans(x + a, y + b) && vu[at(x + a, y + b)]);
  const CREUSABLE = new Set([T.GRASS, T.FLOWER, T.TREE, T.FENCE, T.TALL, T.SAND, T.ASH, T.SNOW, T.PAVE, T.PATH]);
  for (const [x, y, voisin] of besoins) {
    if (touche(x, y, voisin)) continue;
    // la case reliée la plus proche, cherchée en anneaux
    let cible = null;
    for (let d = 1; d < 40 && !cible; d++) for (let j = -d; j <= d && !cible; j++) for (const i of [-d, d]) for (const [u, v] of [[x + i, y + j], [x + j, y + i]]) if (dedans(u, v) && vu[at(u, v)]) { cible = [u, v]; break; }
    if (!cible) continue;
    // ruelle en L (d'abord horizontale, puis verticale) qui ne traverse aucun bâtiment
    const pas = [];
    let cx = x, cy = y; while (cx !== cible[0]) { cx += Math.sign(cible[0] - cx); pas.push([cx, cy]); } while (cy !== cible[1]) { cy += Math.sign(cible[1] - cy); pas.push([cx, cy]); }
    const pas2 = []; cx = x; cy = y; while (cy !== cible[1]) { cy += Math.sign(cible[1] - cy); pas2.push([cx, cy]); } while (cx !== cible[0]) { cx += Math.sign(cible[0] - cx); pas2.push([cx, cy]); }
    const ok = (L) => L.every(([u, v]) => walkable(W.get(u, v)) && W.get(u, v) !== T.DOOR || CREUSABLE.has(W.get(u, v)) && !dec.has(u + ',' + v));
    const L = ok(pas) ? pas : ok(pas2) ? pas2 : null;
    if (!L) continue;
    for (const [u, v] of L) if (!walkable(W.get(u, v))) W.set(u, v, rue);
    if (!walkable(W.get(x, y))) W.set(x, y, rue);
    remplir(x, y);
  }
  // bouts d'herbe isolés : un bosquet
  for (let y = Y; y <= Y1; y++) for (let x = X; x <= X1; x++) {
    const t = W.get(x, y);
    if (!vu[at(x, y)] && (t === T.GRASS || t === T.FLOWER || t === T.PATH || t === T.PAVE || t === T.SAND) && !garde.has(x + ',' + y) && !W.signs.has(x + ',' + y) && !dec.has(x + ',' + y)) W.set(x, y, T.TREE);
  }
}
