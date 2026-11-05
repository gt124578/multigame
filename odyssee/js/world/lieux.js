// odyssee/js/world/lieux.js — les grands vides entre les routes. Une fois tout le reste posé, chaque bloc de 24 × 24 cases
// resté en pleine forêt devient :
//   - un lieu à découvrir s'il touche une route : un sentier s'enfonce dans les arbres depuis la route et mène à une
//     clairière habitée ou remarquable (hameau, ferme, lac, marais, ruines, colline où l'on grimpe, verger, campement,
//     source, cabane, prairie fleurie), avec ses habitants, ses dresseurs et un objet à trouver ;
//   - sinon un paysage vu de loin : lac caché, piton rocheux, colline boisée, pinède.
// Un lieu reste dans son bloc, à trois cases du bord au moins : il ne relie jamais deux routes entre elles. Les PNJ et les
// objets ont des identifiants fixes (`lieu:<bloc>:…`), tirés dans l'ordre des blocs.
import { T, walkable } from './tiles.js';
import { rng } from './mapgen.js';
import { plateau, massif, sinueuse } from './relief.js';
import { bruit } from './quartiers.js';
import { houseInterior } from './interiors.js';
import { ROUTES, PRENOMS } from './voix.js';

const B = 24, N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPR = ['randonneuse', 'montagnard', 'vieil_homme', 'gamin', 'fillette', 'habitante', 'habitant', 'dame', 'pecheur', 'jardinier'];
const LOTS = ['super-potion', 'great-ball', 'ether', 'revive', 'full-heal', 'hyper-potion', 'ultra-ball', 'rare-candy', 'max-repel', 'elixir', 'oran-berry', 'sitrus-berry'];
const NOMS = {
  hameau: ['Hameau des Saules', 'Hameau du Puits', 'Les Trois Toits', 'Hameau des Brumes', 'Hameau de la Combe'],
  ferme: ['Ferme des Écrémeuh', 'Ferme du Vallon', 'Ferme des Moissons', 'Ferme aux Ponchiot'],
  lac: ['Lac Dormant', 'Étang aux Carpes', 'Lac des Lucioles', 'Lac du Héron', 'Étang Secret'],
  marais: ['Marais aux Grenouilles', 'Tourbière', 'Marais des Roseaux'],
  ruines: ['Ruines Oubliées', 'Vieux Temple', 'Cercle de Pierres', 'Ruines du Guet'],
  colline: ['Colline du Vent', 'Butte aux Fées', 'Mont Rond', 'Colline des Ancêtres'],
};

export function lieux(W, { maps, trainerNpc, ENC }) {
  const C = Math.floor(W.w / B), R = Math.floor(W.h / B), r = rng(90210);
  const pick = (L) => L[Math.floor(r() * L.length)];
  const FORET = (t) => t === T.TREE || t === T.PINE;
  // 1. les blocs de pleine forêt (pas une case d'autre chose, pas de zone de ville)
  const libre = new Uint8Array(C * R);
  for (let rr = 0; rr < R; rr++) for (let c = 0; c < C; c++) {
    let ok = true;
    for (let y = rr * B; y < (rr + 1) * B && ok; y++) for (let x = c * B; x < (c + 1) * B; x++) if (!FORET(W.get(x, y)) || W.height(x, y) !== 0) { ok = false; break; }
    if (ok && W.zones.some((z) => z.town && z.x0 <= (c + 1) * B && z.x1 >= c * B && z.y0 <= (rr + 1) * B && z.y1 >= rr * B)) ok = false;
    libre[rr * C + c] = ok ? 1 : 0;
  }
  const occ = new Set([...W.npcs.map((n) => n.x + ',' + n.y), ...W.items.map((i) => i.x + ',' + i.y)]);
  let nLieux = 0, nFond = 0;
  for (let rr = 0; rr < R; rr++) for (let c = 0; c < C; c++) {
    if (!libre[rr * C + c]) continue;
    const bx = c * B, by = rr * B, cx = bx + 12, cy = by + 12;
    // 2. une route à côté ? la case de route praticable (au niveau 0, dans une zone de route) la plus proche du centre
    let depart = null, bd = 1e9;
    for (const [dc, dr] of N4) {
      const nc = c + dc, nr = rr + dr; if (nc < 0 || nr < 0 || nc >= C || nr >= R || libre[nr * C + nc]) continue;
      for (let y = Math.max(0, by - 9); y < Math.min(W.h, by + B + 9); y++) for (let x = Math.max(0, bx - 9); x < Math.min(W.w, bx + B + 9); x++) {
        if (x >= bx && x < bx + B && y >= by && y < by + B) continue;
        if (Math.floor(x / B) !== nc || Math.floor(y / B) !== nr) continue;
        const t = W.get(x, y);
        if (!(t === T.GRASS || t === T.PATH || t === T.FLOWER) || W.height(x, y) !== 0 || occ.has(x + ',' + y)) continue;
        const z = W.zoneAt(x, y); if (!z || !z.route || z.town || z.sea) continue;
        const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; depart = { x, y, z }; }
      }
    }
    const id = `lieu:${c},${rr}`;
    if (depart && bd < 26) { if (lieu(id, c, rr, depart)) { nLieux++; libre[rr * C + c] = 2; continue; } }
    nFond++;
  }
  fondDePaysage();
  return { lieux: nLieux, fond: nFond };

  /** les blocs restés en forêt, vus de loin (on n'y entre pas) : de grandes formes qui débordent d'un bloc à l'autre —
   *  lacs cachés, crêtes rocheuses en gradins, collines boisées, pinèdes — à quatre cases au moins de tout passage */
  function fondDePaysage() {
    const w = W.w, h = W.h, d = new Float32Array(w * h).fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const b = libre[Math.floor(y / B) * C + Math.floor(x / B)]; d[y * w + x] = b === 1 && FORET(W.get(x, y)) ? 1e9 : 0; }
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (!d[p]) continue; d[p] = Math.min(d[p], d[p - 1] + 1, d[p - w] + 1, d[p - w - 1] + 1.41, d[p - w + 1] + 1.41); }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) { const p = y * w + x; if (!d[p]) continue; d[p] = Math.min(d[p], d[p + 1] + 1, d[p + w] + 1, d[p + w + 1] + 1.41, d[p + w - 1] + 1.41); }
    const roche = [], butte = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (d[p] < 4 || d[p] > 1e8) continue;
      const lac = bruit(x, y, 34, 11) * 0.8 + bruit(x, y, 8, 12) * 0.2;
      if (lac > 0.74 && d[p] >= 5) { W.set(x, y, T.WATER); continue; }
      const crete = 1 - Math.abs(2 * bruit(x, y, 28, 21) - 1) + (bruit(x, y, 6, 22) - 0.5) * 0.12;
      if (crete > 0.9 && d[p] >= 4) { roche.push([x, y]); continue; }
      if (bruit(x, y, 22, 31) > 0.72 && d[p] >= 5) butte.push([x, y]);
    }
    // des pinèdes partout dans la forêt (grandes taches, sans tenir compte des blocs)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (W.get(x, y) === T.TREE && bruit(x, y, 16, 41) > 0.58 && !W.zoneAt(x, y)?.town) W.set(x, y, T.PINE);
    massif(W, roche, { pas: 2, max: 4 });
    if (butte.length) plateau(W, butte, 1);
  }

  /** un lieu à découvrir au bout d'un sentier */
  function lieu(id, c, rr, D) {
    const bx = c * B, by = rr * B, z = D.z;
    const X = bx + 12 + Math.round((r() - 0.5) * 3), Y = by + 12 + Math.round((r() - 0.5) * 3);
    const dedans = (x, y) => x >= bx + 3 && y >= by + 3 && x < bx + B - 3 && y < by + B - 3;
    // le sentier : de la route au centre du bloc, en serpentant un peu ; il ne touche que de la forêt
    const P = sinueuse([[D.x + 0.5, D.y + 0.5], [(D.x + X) / 2 + (r() - 0.5) * 5, (D.y + Y) / 2 + (r() - 0.5) * 5], [X + 0.5, Y + 0.5]], 2);
    const sentier = [];
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [qx, qy] = P[i], n = Math.ceil(Math.hypot(qx - ax, qy - ay) * 2);
      for (let k = 0; k <= n; k++) { const x = Math.floor(ax + (qx - ax) * k / n), y = Math.floor(ay + (qy - ay) * k / n); if (!sentier.length || sentier[sentier.length - 1][0] !== x || sentier[sentier.length - 1][1] !== y) sentier.push([x, y]); }
    }
    // 4-connexe
    const s4 = [];
    for (const [x, y] of sentier) { const p = s4[s4.length - 1]; if (p && p[0] !== x && p[1] !== y) s4.push([x, p[1]]); s4.push([x, y]); }
    for (const [x, y] of s4) { const t = W.get(x, y); if (!(FORET(t) || walkable(t)) || (W.height(x, y) !== 0)) return false; }
    // la clairière : une forme naturelle au milieu du bloc
    const kind = choisir(z);
    const rx = kind === 'lac' || kind === 'hameau' || kind === 'ferme' ? 8.5 : 7, ry = kind === 'lac' || kind === 'hameau' || kind === 'ferme' ? 7.5 : 6;
    const clair = [];
    for (let y = by + 3; y < by + B - 3; y++) for (let x = bx + 3; x < bx + B - 3; x++) {
      const q = ((x - X) / rx) ** 2 + ((y - Y) / ry) ** 2 + (bruit(x, y, 4, c * 7 + rr) - 0.5) * 0.45;
      if (q <= 1 && FORET(W.get(x, y))) clair.push([x, y]);
    }
    if (clair.length < 60) return false;
    for (const [x, y] of s4) if (FORET(W.get(x, y))) { W.set(x, y, T.PATH); }
    // le sentier s'élargit un peu (bords d'herbe)
    for (const [x, y] of s4) for (const [a, b] of N4) if (FORET(W.get(x + a, y + b)) && bruit(x + a, y + b, 2, 31) > 0.5 && (dedans(x + a, y + b) || Math.floor((x + a) / B) !== c || Math.floor((y + b) / B) !== rr)) W.set(x + a, y + b, T.GRASS);
    for (const [x, y] of clair) W.set(x, y, T.GRASS);
    W.zone(bx, by, bx + B - 1, by + B - 1, { name: NOMS[kind] ? NOMS[kind][(c * 7 + rr * 3) % NOMS[kind].length] : z.name, music: z.music, enc: z.enc, theme: z.theme, route: z.route, prio: 0, ombre: z.ombre });
    let no = 0, np = 0;
    const objet = (x, y, item = pick(LOTS)) => { const p = proche(x, y); if (p) { W.item(p[0], p[1], item, 1, `${id}:o${no++}`); occ.add(p.join(',')); } };
    const pnj = (x, y, o = {}) => { const p = proche(x, y); if (!p) return null; occ.add(p.join(',')); return W.npc({ id: `${id}:p${np++}`, x: p[0], y: p[1], dir: o.dir || 'down', sprite: o.sprite || pick(SPR), move: o.move || 'turn', text: o.text || pick([...ROUTES.general, ...(ROUTES[o.voix] || [])]) }); };
    const proche = (x, y) => { for (let d = 0; d < 6; d++) for (let j = -d; j <= d; j++) for (const i of [-d, d]) for (const [u, v] of [[x + i, y + j], [x + j, y + i]]) { const t = W.get(u, v); if (dedans(u, v) && (t === T.GRASS || t === T.PATH || t === T.FLOWER || t === T.SAND) && !occ.has(u + ',' + v) && !W.warpAt(u, v) && W.get(u, v - 1) !== T.DOOR) return [u, v]; } return null; };
    const prop = (k, x, y) => { if (dedans(x, y) && W.get(x, y) === T.GRASS && !occ.has(x + ',' + y)) { W.prop(k, x, y); return true; } return false; };
    const maison = (x, y, o = {}) => {
      const w = o.w || 5, d = o.d || 5;
      for (let j = -1; j <= d; j++) for (let i = -1; i <= w; i++) if (!dedans(x + i, y + j) || W.get(x + i, y + j) !== T.GRASS || occ.has((x + i) + ',' + (y + j))) return null;
      const Bt = W.building('house', x, y, { w, d, door: o.door ?? 1, modele: o.modele || 'chalet', name: o.name || 'Maison', roof: o.roof || pick(['brown', 'red', 'green', 'gray']) });
      const mid = `${id}:m${no++}`, ins = houseInterior(mid, o.name || 'Maison', { w: 9, h: 8, kitchen: true });
      ins.outside = { map: W.id, x: Bt.doorX, y: Bt.doorY + 1, dir: 'down' }; ins.warp(ins.exitX, ins.exitY, ins.outside);
      W.warp(Bt.doorX, Bt.doorY, { map: mid, x: ins.exitX, y: ins.exitY, dir: 'up' });
      W.set(Bt.doorX, Bt.doorY + 1, T.PATH);
      ins.npc({ id: mid + ':hote', x: 3, y: 4, sprite: o.sprite || pick(SPR), move: 'turn', text: o.text || pick([...ROUTES.general]) });
      if (o.objet) ins.item(6, 3, o.objet, 1, mid + ':o0');
      maps[mid] = ins;
      return Bt;
    };
    const decor = (modele, x, y, w, d, h = 3) => {
      for (let j = -1; j <= d; j++) for (let i = -1; i <= w; i++) if (!dedans(x + i, y + j) || W.get(x + i, y + j) !== T.GRASS || occ.has((x + i) + ',' + (y + j))) return null;
      return W.building('tower', x, y, { w, d, h, door: -1, modele, name: modele, roof: 'gray' });
    };
    const enc = z.enc || [];
    const dresseur = (x, y, dir) => {
      if (!enc.length || !trainerNpc) return;
      const p = proche(x, y); if (!p) return;
      const lv = Math.max(...enc.map((e) => e[2] || e[1] || 5)), team = [];
      for (let i = 0; i < 1 + Math.floor(r() * 3); i++) { const e = pick(enc); team.push([e[0], Math.min(100, lv + Math.floor(r() * 2))]); }
      occ.add(p.join(','));
      trainerNpc(W, p[0], p[1], dir || 'down', pick(['Randonneuse', 'Montagnard', 'Topdresseur', 'Topdresseuse', 'Insectomane', 'Gamin', 'Karatéka']), pick(PRENOMS), team, { id: `${id}:d${np++}`, sight: 3 });
    };
    // le contenu
    if (kind === 'hameau') {
      const L = [[X - 7, Y - 6], [X + 2, Y - 6], [X - 3, Y + 1]];
      let n = 0;
      for (const [x, y] of L) if (maison(x, y, { name: 'Maison', modele: pick(['chalet', 'chalet', 'maisonL']), door: 1 })) n++;
      decor('puits', X - 1, Y - 1, 2, 2, 2);
      for (let x = X - 8; x <= X + 8; x++) if (W.get(x, Y + 7) === T.GRASS && (x + Y) % 5) W.set(x, Y + 7, T.FENCE);
      prop('tonneau', X + 5, Y + 2); prop('caisses', X - 6, Y + 3);
      pnj(X + 1, Y + 2, { move: 'wander', text: ['Bienvenue au hameau ! On n\'a pas beaucoup de visiteurs, par ici.', 'Les gens de la ville ignorent jusqu\'à notre existence.'] });
      objet(X + 6, Y + 5);
      if (!n) return true;
    } else if (kind === 'ferme') {
      decor('grange', X - 7, Y - 6, 6, 5, 4) || decor('moulin', X - 6, Y - 5, 4, 4, 6);
      maison(X + 1, Y - 6, { name: 'Ferme', modele: 'maisonExt', w: 7, d: 4, door: 1, sprite: 'montagnard', text: ['La terre est bonne, par ici. Mes Ponchiot creusent les sillons pour moi.'] });
      for (let y = Y + 1; y <= Y + 6; y += 2) for (let x = X - 7; x <= X + 7; x++) if (W.get(x, y) === T.GRASS && x !== X) W.set(x, y, T.FLOWER);
      for (let x = X - 8; x <= X + 8; x++) if (W.get(x, Y) === T.GRASS && Math.abs(x - X) > 2 && Math.abs(x - X) < 7) W.set(x, Y, T.FENCE);
      pnj(X + 2, Y + 1, { sprite: 'jardinier', text: ['Attention où tu marches, ce sont mes navets !'] });
      objet(X - 4, Y + 6, pick(['oran-berry', 'sitrus-berry', 'oran-berry']));
    } else if (kind === 'lac') {
      W.blob(X + 0.5, Y - 0.5, 5.5, 3.8, T.WATER, r, [T.GRASS]);
      let x = X, y = Y + 5; while (W.get(x, y - 1) === T.WATER || W.get(x, y) === T.WATER) { if (W.get(x, y) === T.WATER) W.set(x, y, T.BRIDGE); y--; if (y < Y - 4) break; }
      for (let k = 0; k < 8; k++) { const a = r() * 6.28; const u = Math.round(X + Math.cos(a) * 7.5), v = Math.round(Y + Math.sin(a) * 6); if (W.get(u, v) === T.GRASS && r() < 0.6) W.set(u, v, T.FLOWER); }
      pnj(X + 1, Y + 6, { sprite: 'pecheur', text: ['Ce lac n\'est sur aucune carte. Garde le secret, d\'accord ?', 'Il paraît qu\'un Pokémon très rare remonte à la surface les nuits de pleine lune.'] });
      prop('bateau', X - 6, Y + 1);
      objet(X - 6, Y + 5);
    } else if (kind === 'marais') {
      const sec = new Set(); for (const [x, y] of s4) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) sec.add((x + a) + ',' + (y + b));
      for (let y = Y - 5; y <= Y + 5; y++) for (let x = X - 7; x <= X + 7; x++) { if (W.get(x, y) !== T.GRASS || sec.has(x + ',' + y) || Math.abs(x - X) + Math.abs(y - Y) < 3) continue; const q = bruit(x, y, 3, c * 3 + rr); if (q > 0.62) W.set(x, y, T.WATER); else if (q > 0.38) W.set(x, y, T.DARKTALL); }
      dresseur(X, Y - 1, 'left'); objet(X + 1, Y + 1, pick(['antidote', 'full-heal', 'ultra-ball']));
    } else if (kind === 'ruines') {
      for (const [a, b] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [-2, -4], [2, -4]]) prop(r() < 0.65 ? 'colonne' : 'rocher_grand', X + a, Y + b);
      prop('stele', X, Y - 2); W.object(X, Y - 2, { use: async (A) => A.say(pick([['Une pierre usée. On devine des silhouettes de Pokémon gravées tout autour.'], ['« Les voyageurs passent, la pierre demeure. »'], ['Des marques étranges, comme des yeux… Elles semblent suivre ton regard.']])) });
      for (let y = Y - 4; y <= Y + 4; y++) for (let x = X - 5; x <= X + 5; x++) if (W.get(x, y) === T.GRASS && bruit(x, y, 2, 7) > 0.6) W.set(x, y, T.PATH);
      objet(X, Y + 1, pick(['rare-candy', 'revive', 'ultra-ball', 'elixir'])); dresseur(X + 3, Y + 1, 'left');
    } else if (kind === 'colline') {
      // une colline d'herbe où l'on grimpe par des marches ; un objet au sommet
      const haut = clair.filter(([x, y]) => ((x - X) / 4.6) ** 2 + ((y - Y + 1) / 3.6) ** 2 <= 1);
      for (let y = Y - 1; y <= Y + 7; y++) if (W.get(X, y) === T.GRASS) W.set(X, y, T.PATH);
      plateau(W, haut, 1);
      prop('rocher_grand', X - 3, Y - 2);
      objet(X, Y - 2, pick(['rare-candy', 'elixir', 'ultra-ball', 'revive']));
      dresseur(X + 3, Y + 5, 'up');
    } else if (kind === 'verger') {
      for (let y = Y - 5; y <= Y + 5; y += 3) for (let x = X - 6 + ((y - Y + 6) % 2) * 2; x <= X + 6; x += 4) prop(pick(['erable', 'cerisier']), x, y);
      objet(X, Y, pick(['oran-berry', 'sitrus-berry']));
      pnj(X + 2, Y + 2, { sprite: 'jardinier', text: ['Ces arbres ont été plantés par mon grand-père. Les baies sont pour les voyageurs.'] });
    } else if (kind === 'cabane') {
      maison(X - 2, Y - 4, { name: 'Cabane', modele: pick(['chalet', 'cabaneChasseur']), w: 5, d: 5, door: 1, objet: pick(LOTS) });
      prop('tonneau', X + 4, Y); prop('caisses', X - 4, Y + 1);
      dresseur(X + 2, Y + 4, 'up');
    } else if (kind === 'source') {
      W.blob(X + 0.5, Y - 1, 3, 2, T.WATER, r, [T.GRASS]);
      prop('stele', X - 4, Y); objet(X + 4, Y + 2);
      for (let k = 0; k < 10; k++) { const u = X - 6 + Math.floor(r() * 13), v = Y - 5 + Math.floor(r() * 11); if (W.get(u, v) === T.GRASS) W.set(u, v, T.FLOWER); }
    } else if (kind === 'campement') {
      prop('caisses', X - 2, Y - 2); prop('tonneau', X + 2, Y - 2); prop('caisse', X + 3, Y - 1);
      pnj(X, Y + 1, { sprite: pick(['randonneuse', 'montagnard', 'gamin']), text: ['On campe ici depuis trois jours. Personne ne trouve cet endroit !'] });
      dresseur(X - 3, Y + 3, 'right'); objet(X + 1, Y + 4);
    } else {
      // prairie fleurie : herbes hautes en carrés, fleurs, un arbre isolé
      for (let y = Y - 5; y <= Y + 5; y++) for (let x = X - 6; x <= X + 6; x++) { if (W.get(x, y) !== T.GRASS) continue; const q = bruit(x, y, 3, c + rr * 5); if (q > 0.62) W.set(x, y, T.FLOWER); else if (q < 0.3 && Math.abs(x - X) > 1) W.set(x, y, T.TALL); }
      W.set(X + 3, Y - 3, T.TREE); objet(X - 3, Y + 2); dresseur(X + 2, Y + 3, 'left');
    }
    // contrôle : tout ce qui a été posé est atteignable depuis la route (sinon on le rapproche du sentier)
    verifier(W, D, bx, by, id, s4);
    return true;
  }
  function choisir(z) {
    const th = z.theme || '';
    const L = /montagne/.test(th) ? ['colline', 'ruines', 'campement', 'source', 'cabane', 'lac']
      : /forest|bois/.test(th) || z.ombre ? ['cabane', 'ruines', 'source', 'marais', 'campement', 'prairie']
        : /desert|canyon/.test(th) ? ['ruines', 'campement', 'source']
          : ['hameau', 'ferme', 'lac', 'colline', 'verger', 'ruines', 'prairie', 'marais', 'cabane', 'campement', 'source', 'hameau', 'lac', 'ferme'];
    return pick(L);
  }
}

/** ce qui a été posé dans le lieu et qu'on n'atteint pas depuis la route est déplacé à côté du chemin le plus proche */
function verifier(W, D, bx, by, id, s4) {
  const x0 = bx - 12, y0 = by - 12, w = 48, h = 48, at = (x, y) => (y - y0) * w + (x - x0), seen = new Uint8Array(w * h);
  const dedans = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
  const bloq = new Set([...W.npcs.filter((n) => dedans(n.x, n.y)).map((n) => n.x + ',' + n.y), ...W.items.filter((i) => dedans(i.x, i.y)).map((i) => i.x + ',' + i.y)]);
  const q = [[D.x, D.y]]; seen[at(D.x, D.y)] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [a, b] of N4) {
      const u = x + a, v = y + b; if (!dedans(u, v) || seen[at(u, v)]) continue;
      const t = W.get(u, v); if (!walkable(t) || bloq.has(u + ',' + v) || !W.canStep(x, y, u, v)) continue;
      seen[at(u, v)] = 1; q.push([u, v]);
    }
  }
  const ok = (x, y) => [[0, 0], ...N4].some(([a, b]) => dedans(x + a, y + b) && seen[at(x + a, y + b)]);
  for (const o of [...W.items, ...W.npcs]) {
    if (!o.id?.startsWith(id + ':') || ok(o.x, o.y)) continue;
    // la case atteinte libre la plus proche (pas devant une porte, pas sur un passage étroit du sentier)
    let best = null, bd = 1e9;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!seen[at(x, y)] || bloq.has(x + ',' + y) || W.warpAt(x, y) || W.get(x, y - 1) === T.DOOR || !(W.get(x, y) === T.GRASS || W.get(x, y) === T.FLOWER)) continue;
      const libres = N4.filter(([a, b]) => dedans(x + a, y + b) && seen[at(x + a, y + b)] && !bloq.has((x + a) + ',' + (y + b))).length;
      if (libres < 3) continue;
      const d = Math.abs(x - o.x) + Math.abs(y - o.y); if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { bloq.delete(o.x + ',' + o.y); [o.x, o.y] = best; bloq.add(best.join(',')); }
  }
}
