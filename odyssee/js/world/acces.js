// odyssee/js/world/acces.js — jusqu'où va le joueur, et avec combien de badges : une exploration de toute la région
// depuis Bourg-Aube, à travers les grottes, les maisons et le bateau. Pour chaque case, le rang = le nombre de badges
// qu'il faut pour l'atteindre (les gardes s'écartent à leur nombre de badges ; Force à 3, Coupe à 4, Surf à 5,
// Éclate-Roc à 6 ; le bateau dès 2 badges et selon son quai). 255 : jamais atteinte, même avec toutes les capacités.
// Sert au générateur (barème des objets ramassables, raccords des lieux) et à l'outil de contrôle tools/odyssee-acces.mjs.
import { T, walkable } from './tiles.js';

export const JAMAIS = 255;
/** au-delà de 15 badges (portes fermées pour de bon, garde de l'usine) : rang 16 */
const MAXR = 16;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** badges nécessaires pour franchir une case par une capacité de terrain (0 : rien de spécial, -1 : jamais) */
function besoinCase(t) {
  if (walkable(t)) return 0;
  if (t === T.BOULDER) return 3;
  if (t === T.CUT) return 4;
  if (t === T.WATER) return 5;
  if (t === T.SMASH) return 6;
  return -1;
}

/**
 * Rangs de toutes les cases de toutes les cartes atteintes depuis `depart` ({ map, x, y }).
 * o.bloquants : les PNJ (hors gardes) bloquent leur case (défaut true) ; o.objets : les objets posés aussi (défaut false :
 * on les ramasse) ; o.panneaux : les panneaux se traversent (pour savoir si un panneau coupe un passage) ;
 * o.capacites : false pour n'utiliser aucune capacité de terrain (ni bateau).
 * Renvoie Map id de carte → Uint8Array des rangs.
 */
export function rangs(maps, docks, depart, o = {}) {
  const bloquants = o.bloquants ?? true, objets = o.objets ?? false, panneaux = !!o.panneaux, capacites = o.capacites ?? true;
  const R = new Map(), files = new Map();
  const etat = (id) => {
    let e = files.get(id); if (e) return e;
    const m = maps[id]; if (!m) return null;
    const r = new Uint8Array(m.w * m.h).fill(JAMAIS);
    const garde = new Map(); for (const g of m.gates || []) for (const [x, y] of g.tiles) garde.set(y * m.w + x, Math.min(MAXR, g.badges));
    const bloc = new Set();
    if (bloquants) for (const n of m.npcs) if (!n.gate && m.in(n.x, n.y)) bloc.add(n.y * m.w + n.x);
    if (objets) for (const it of m.items) if (m.in(it.x, it.y)) bloc.add(it.y * m.w + it.x);
    const warps = new Map(); for (const [k, w] of m.warps) { const [x, y] = k.split(',').map(Number); if (m.in(x, y)) warps.set(y * m.w + x, w); }
    e = { id, m, r, garde, bloc, warps };
    R.set(id, r); files.set(id, e);
    return e;
  };
  // file à seaux (un par rang) : chaque case est traitée une fois, au plus petit rang qui l'atteint
  const seaux = Array.from({ length: MAXR + 1 }, () => []);
  const pousser = (id, x, y, c) => {
    const e = etat(id); if (!e || !e.m.in(x, y)) return;
    const i = y * e.m.w + x; if (c >= e.r[i]) return;
    e.r[i] = c; seaux[c].push(id, i);
  };
  const quais = Object.values(docks || {}).filter((d) => !d.show && maps[d.map]);
  const quaiDe = new Map(); for (const d of quais) { const k = d.map + ':' + (d.y * maps[d.map].w + d.x); quaiDe.set(k, d); }
  let bateau = JAMAIS;   // rang auquel on atteint un premier quai
  const bateauPart = (c) => {
    if (!capacites || c >= bateau) return; bateau = c;
    for (const d of quais) pousser(d.map, d.x, d.y, Math.max(c, 2, Math.min(MAXR, d.badges || 0)));
  };
  pousser(depart.map, depart.x, depart.y, 0);
  for (let c = 0; c <= MAXR; c++) {
    const S = seaux[c];
    while (S.length) {
      const i = S.pop(), id = S.pop(), e = files.get(id), { m, r } = e;
      if (r[i] !== c) continue;
      const x = i % m.w, y = (i - x) / m.w, t0 = m.t[i], h0 = m.hg[i];
      // un quai, une porte
      if (quaiDe.has(id + ':' + i)) bateauPart(c);
      const w = e.warps.get(i); if (w) entrer(w, c);
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy; if (!m.in(nx, ny)) continue;
        const n = ny * m.w + nx, t = m.t[n];
        if (r[n] <= c) continue;
        // porte d'à côté qu'on n'atteint pas à pied (entrée de grotte posée sur une case de bâtiment) : on y entre
        if (!walkable(t) && e.warps.has(n) && walkable(t0)) { entrer(e.warps.get(n), c); }
        // rebords : on saute par-dessus, dans leur sens
        if (t === T.LEDGE && dy === 1 && walkable(m.get(nx, ny + 1))) { voisin(e, nx, ny + 1, c, 0); continue; }
        if (t === T.LEDGE_E && dx === 1 && walkable(m.get(nx + 1, ny))) { voisin(e, nx + 1, ny, c, 0); continue; }
        if (t === T.LEDGE_W && dx === -1 && walkable(m.get(nx - 1, ny))) { voisin(e, nx - 1, ny, c, 0); continue; }
        let b = panneaux && t === T.SIGN ? 0 : besoinCase(t);
        if (b < 0 || (b > 0 && !capacites)) continue;
        if (t === T.STAIRS || t0 === T.STAIRS) { if (!walkable(t) || Math.abs(m.hg[n] - h0) > 1) continue; }
        else if (m.hg[n] !== h0) continue;
        if (t === T.BRIDGE && t0 === T.WATER) continue;   // en surf, on passe sous les ponts
        if (e.bloc.has(n)) continue;
        const g = e.garde.get(n); if (g !== undefined) b = Math.max(b, g);
        voisin(e, nx, ny, c, b);
      }
    }
  }
  return R;

  function voisin(e, x, y, c, b) {
    const n = y * e.m.w + x; if (e.bloc.has(n)) return;
    const g = e.garde.get(n); if (g !== undefined) b = Math.max(b, g);
    const nc = Math.max(c, b); if (nc < e.r[n]) { e.r[n] = nc; seaux[nc].push(e.id, n); }
  }
  function entrer(w, c) {
    const dst = maps[w.map]; if (!dst) return;
    pousser(w.map, w.x, w.y, c);
    // arrivée sur une case qu'on ne foule pas (seuil de grotte) : les cases voisines
    if (!walkable(dst.get(w.x, w.y))) for (const [dx, dy] of N4) if (walkable(dst.get(w.x + dx, w.y + dy))) pousser(w.map, w.x + dx, w.y + dy, c);
  }
}

/** rang d'une case et de ses voisines (un objet ou un PNJ se prend depuis la case d'à côté) */
export function rangAutour(m, r, x, y) {
  let best = JAMAIS;
  for (const [dx, dy] of [[0, 0], ...N4]) { const a = x + dx, b = y + dy; if (m.in(a, b) && r[b * m.w + a] < best) best = r[b * m.w + a]; }
  return best;
}

/* ======================================================================
   Finitions de la carte du dehors (fin de buildWorld) : bords, recoins inatteignables, passages bouchés
   ====================================================================== */

/** marge où le joueur ne doit jamais aller : la vue montre 14 cases de part et d'autre, 11 en haut et en bas */
export const MARGE_X = 14, MARGE_Y = 11;

/** la mer : l'eau (et les tourbillons) reliée au bord de la carte ; les lacs n'y touchent pas */
export function mers(W) {
  const w = W.w, h = W.h, mer = new Uint8Array(w * h), q = [];
  const eau = (i) => W.t[i] === T.WATER || W.t[i] === T.WHIRL;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (eau(i) && !mer[i]) { mer[i] = 1; q.push(i); } }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (eau(i) && !mer[i]) { mer[i] = 1; q.push(i); } }
  while (q.length) {
    const i = q.pop(), x = i % w, y = (i - x) / w;
    if (x > 0 && !mer[i - 1] && eau(i - 1)) { mer[i - 1] = 1; q.push(i - 1); }
    if (x < w - 1 && !mer[i + 1] && eau(i + 1)) { mer[i + 1] = 1; q.push(i + 1); }
    if (y > 0 && !mer[i - w] && eau(i - w)) { mer[i - w] = 1; q.push(i - w); }
    if (y < h - 1 && !mer[i + w] && eau(i + w)) { mer[i + w] = 1; q.push(i + w); }
  }
  return mer;
}

/** une case de nature sauvage qu'on peut laisser hors d'atteinte : sable du désert et des canyons, neige des cimes,
 *  cendre du volcan, plage au bord de la mer (pas la rive d'un lac) */
export function sauvage(W, mer, x, y) {
  const t = W.get(x, y), th = W.zoneAt(x, y)?.theme;
  if ((t === T.SAND || t === T.TALL) && (th === 'desert' || th === 'canyon')) return true;
  if (t === T.SNOW && th === 'snow') return true;
  if (t === T.ASH && th === 'volcanic') return true;
  if (t === T.SAND) for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const u = x + a, v = y + b; if (W.in(u, v) && mer[v * W.w + u]) return true; }
  return false;
}

/** une case de ville (emprise d'une zone de ville) */
export function enVille(W, x, y) {
  for (const z of W.zones) if (z.town && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true;
  return false;
}

/** une ligne de tourbillons au large, à la limite de la marge, sur la mer seulement : en surfant, on ne s'approche
 *  jamais assez du bord de la carte pour voir le vide ; là où la côte (plage, herbe) traverse cette limite, la forêt
 *  la ferme. Les villes n'y touchent pas. */
export function tourbillonsDuBord(W, mer) {
  const w = W.w, h = W.h, X0 = MARGE_X + 1, X1 = w - MARGE_X - 2, Y0 = MARGE_Y + 1, Y1 = h - MARGE_Y - 2;
  const villes = W.zones.filter((z) => z.town);
  const pris = new Set([...W.npcs.map((n) => n.y * w + n.x), ...W.items.map((i) => i.y * w + i.x)]);
  const TERRE = new Set([T.GRASS, T.SAND, T.TALL, T.FLOWER, T.DARKTALL, T.SNOW, T.ASH]);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = W.t[i];
    // distance au cadre, avec un peu de bruit pour que la ligne ne soit pas droite
    const d = Math.min(Math.abs(x - X0), Math.abs(x - X1), Math.abs(y - Y0), Math.abs(y - Y1));
    const e = 1 + (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 100 < 35 ? 1 : 0);
    if (d > e) continue;
    if (mer[i] && t === T.WATER) { W.t[i] = T.WHIRL; n++; }
    else if (TERRE.has(t) && !pris.has(i) && !villes.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1)) W.t[i] = T.TREE;
  }
  return n;
}

const SOL_AMENAGE = new Set([T.GRASS, T.TALL, T.FLOWER, T.DARKTALL, T.SAND, T.SNOW, T.ASH, T.PATH]);

/**
 * Ce qu'on n'atteint jamais (même avec toutes les capacités) et qui aurait l'air aménagé — clairières, rives de lacs,
 * bouts de sentier — redevient de la forêt (arbres ou pins comme autour), hors des villes. La nature sauvage (désert,
 * neige, plages de la mer) peut rester hors d'atteinte. Ne touche jamais une case qui porte quelque chose.
 * R : rangs de la carte (rangs()). Renvoie le nombre de cases rendues à la forêt.
 */
export function rendreALaForet(W, R, mer) {
  const w = W.w, h = W.h, pris = new Set();
  for (const n of W.npcs) pris.add(n.y * w + n.x);
  for (const it of W.items) pris.add(it.y * w + it.x);
  for (const k of [...W.warps.keys(), ...W.signs.keys(), ...W.objects.keys()]) { const [x, y] = k.split(',').map(Number); pris.add(y * w + x); }
  for (const d of W.deco) if (d.x != null) pris.add(d.y * w + d.x);
  const villes = W.zones.filter((z) => z.town);
  const ville = (x, y) => villes.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  const atteint = (x, y) => W.in(x, y) && R[y * w + x] !== JAMAIS;
  const change = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (R[i] !== JAMAIS || !SOL_AMENAGE.has(W.t[i]) || pris.has(i)) continue;
    // une case qu'on touche depuis une case atteinte (un objet, un PNJ s'y tient peut-être) : on la garde
    if (atteint(x - 1, y) || atteint(x + 1, y) || atteint(x, y - 1) || atteint(x, y + 1)) continue;
    if (sauvage(W, mer, x, y) || ville(x, y)) continue;
    change.push(i);
  }
  for (const i of change) {
    const x = i % w, y = (i - x) / w;
    let pins = 0, arbres = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const t = W.get(x + a, y + b); if (t === T.PINE) pins++; else if (t === T.TREE) arbres++; }
    W.t[i] = pins > arbres || W.zoneAt(x, y)?.theme === 'snow' ? T.PINE : T.TREE;
  }
  return change.length;
}

/**
 * Hors des villes, un PNJ (dresseur, promeneur), un objet posé ou un panneau ne doit jamais boucher un passage : s'il
 * sépare deux cases voisines qu'on ne relie plus autour de lui (dans un carré de 17 cases, les autres occupants
 * comptant comme des murs), on le déplace sur la case libre la plus proche où il ne gêne pas. Les gardes et les PNJ
 * qui n'apparaissent qu'à un moment de l'histoire (when, hideIf) restent où ils sont.
 * Renvoie la liste des déplacés [quoi, id, de, vers].
 */
export function degager(W) {
  const w = W.w, occ = new Map();
  const cle = (x, y) => y * w + x;
  for (const n of W.npcs) if (!n.gate) occ.set(cle(n.x, n.y), n);
  for (const it of W.items) occ.set(cle(it.x, it.y), it);
  for (const g of W.gates) for (const [x, y] of g.tiles) occ.set(cle(x, y), g);
  const villes = W.zones.filter((z) => z.town);
  const ville = (x, y) => villes.some((z) => x >= z.x0 - 2 && x <= z.x1 + 2 && y >= z.y0 - 2 && y <= z.y1 + 2);
  const marche = (x, y) => { const t = W.get(x, y); return W.in(x, y) && (walkable(t) || t === T.SIGN) && t !== T.SIGN; };
  const pas = (x0, y0, x1, y1) => {
    const a = W.get(x0, y0), b = W.get(x1, y1);
    if (a === T.STAIRS || b === T.STAIRS) return Math.abs(W.height(x0, y0) - W.height(x1, y1)) <= 1;
    return W.height(x0, y0) === W.height(x1, y1);
  };
  /** (x, y) bouche-t-il un passage ? les voisins praticables de la case sont-ils reliés sans elle, près d'elle ? */
  const R = 8;
  const bouche = (x, y) => {
    const vois = N4.map(([dx, dy]) => [x + dx, y + dy]).filter(([u, v]) => marche(u, v) && !occ.has(cle(u, v)) && pas(x, y, u, v));
    if (vois.length < 2) return false;
    const vu = new Set([cle(...vois[0])]), q = [vois[0]];
    while (q.length) {
      const [a, b] = q.pop();
      for (const [dx, dy] of N4) {
        const u = a + dx, v = b + dy, k = cle(u, v);
        if (Math.abs(u - x) > R || Math.abs(v - y) > R || vu.has(k) || (u === x && v === y) || !marche(u, v) || occ.has(k) || !pas(a, b, u, v)) continue;
        vu.add(k); q.push([u, v]);
      }
    }
    return vois.some(([u, v]) => !vu.has(cle(u, v)));
  };
  const SOLS = new Set([T.GRASS, T.PATH, T.SAND, T.FLOWER, T.SNOW, T.ASH, T.TALL, T.DARKTALL]);
  const libre = (x, y) => SOLS.has(W.get(x, y)) && !occ.has(cle(x, y)) && !W.warpAt(x, y) && !W.objectAt(x, y)
    && W.get(x, y - 1) !== T.DOOR && W.get(x, y + 1) !== T.DOOR && !bouche(x, y);
  const deplaces = [];
  const deplacer = (quoi, o, x, y, poser) => {
    // la case libre la plus proche, atteinte à pied depuis l'occupant (sans repasser par lui)
    const vu = new Set([cle(x, y)]), q = [[x, y, 0]];
    for (let i = 0; i < q.length; i++) {
      const [a, b, d] = q[i]; if (d > 10) break;
      for (const [dx, dy] of N4) {
        const u = a + dx, v = b + dy, k = cle(u, v);
        if (vu.has(k) || !marche(u, v) || !pas(a, b, u, v)) continue;
        vu.add(k);
        if (!occ.has(k)) { if (libre(u, v)) { poser(u, v); deplaces.push([quoi, o.id || o.item || '', [x, y], [u, v]]); return; } q.push([u, v, d + 1]); }
      }
    }
  };
  for (const n of W.npcs) {
    if (n.gate || n.when || n.hideIf || ville(n.x, n.y)) continue;
    occ.delete(cle(n.x, n.y)); const b = bouche(n.x, n.y); occ.set(cle(n.x, n.y), n);
    if (b) deplacer('PNJ', n, n.x, n.y, (u, v) => { occ.delete(cle(n.x, n.y)); n.x = u; n.y = v; if (n.home) n.home = [u, v]; occ.set(cle(u, v), n); });
  }
  for (const it of W.items) {
    if (ville(it.x, it.y)) continue;
    occ.delete(cle(it.x, it.y)); const b = bouche(it.x, it.y); occ.set(cle(it.x, it.y), it);
    if (b) deplacer('objet', it, it.x, it.y, (u, v) => { occ.delete(cle(it.x, it.y)); it.x = u; it.y = v; occ.set(cle(u, v), it); });
  }
  for (const [k, texte] of [...W.signs]) {
    const [x, y] = k.split(',').map(Number); if (ville(x, y)) continue;
    const sous = W.underAt(x, y) ?? T.GRASS;
    W.set(x, y, sous); const b = bouche(x, y); W.set(x, y, T.SIGN);
    if (!b) continue;
    deplacer('panneau', { id: String(texte).split('\n')[0] }, x, y, (u, v) => {
      const d = W.deco.find((q) => q.x === x && q.y === y && (q.k === 'sign' || q.k === 'telescope' || W.signs.has(k)));
      W.set(x, y, sous); W.under.delete(k); W.signs.delete(k);
      W.under.set(u + ',' + v, W.get(u, v)); W.set(u, v, T.SIGN); W.signs.set(u + ',' + v, texte);
      if (d) { d.x = u; d.y = v; }
    });
  }
  return deplaces;
}

/**
 * Le décor posé (tonneaux, caisses, colonnes, barque…) qu'on ne touche d'aucune case atteinte, après les écrans de
 * verdure qui ont pu refermer un bout de clairière : retiré (la case redevient forêt, ou eau).
 * La nature (arbres, rochers, cactus…) reste. Renvoie le nombre de décors retirés.
 */
const NATUREL = /^(palm|cactus|rocher|pin|arbre|erable|cerisier|tree|pine|bush|souche|tronc)/;
export function oterDecorIsole(W, R) {
  const w = W.w, atteint = (x, y) => W.in(x, y) && R[y * w + x] !== JAMAIS;
  const ota = new Set();
  for (const d of W.deco) {
    if (d.x == null || W.get(d.x, d.y) !== T.BLOCK || NATUREL.test(d.k) || W.objects.has(d.x + ',' + d.y)) continue;
    if (N4.some(([dx, dy]) => atteint(d.x + dx, d.y + dy)) || atteint(d.x, d.y)) continue;
    if (W.zones.some((z) => z.town && d.x >= z.x0 && d.x <= z.x1 && d.y >= z.y0 && d.y <= z.y1)) continue;
    ota.add(d);
  }
  if (!ota.size) return 0;
  W.deco = W.deco.filter((d) => !ota.has(d));
  for (const d of ota) { const k = d.x + ',' + d.y, u = W.under.get(k); W.set(d.x, d.y, u === T.WATER ? T.WATER : T.TREE); W.under.delete(k); }
  return ota.size;
}
