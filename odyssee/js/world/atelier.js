// odyssee/js/world/atelier.js — poser sur la grande carte un lieu fait main à ses anciennes coordonnées.
//
// Certains lieux (la Forêt des Torii et le Temple Kagura, la Tour Cendrée…) ont été dessinés case par case, avec des
// coordonnées absolues, sur l'ancienne carte du monde (440 × 520). Plutôt que de réécrire chacune de ces coordonnées,
// l'atelier construit le lieu tel quel sur une carte de brouillon de l'ancienne taille, qui porte le même identifiant
// ('monde'), puis le pose sur la grande carte, décalé de (dx, dy) : terrain, hauteurs, relief, décor, bâtiments, PNJ,
// objets, portes, panneaux, zones, gardes. Les objets gardent l'identifiant qu'ils avaient (calculé dans l'ancien repère,
// comme avant le remaniement) ; les cartes créées pendant la construction (intérieurs, étages) voient leurs sorties vers
// le dehors décalées, comme les légendaires, les tracés de route et les quais ajoutés au passage.
import { T } from './tiles.js';
import { GameMap } from './mapgen.js';

const key = (x, y) => x + ',' + y;

/**
 * ctx : { W, maps, legends, routes, docks } ; zone : [x0, y0, x1, y1] (ancien repère, bornes comprises) ; (dx, dy) :
 * décalage vers la grande carte ; fond : sol de départ du brouillon (forêt) ; construire(S) bâtit le lieu sur S.
 * Seules les cases de la zone sont recopiées ; tout ce qui a été posé (PNJ, objets…) l'est, où qu'il soit.
 */
export function atelier(ctx, zone, dx, dy, construire, o = {}) {
  const { W, maps, legends = [], routes = [], docks = {}, towns = {} } = ctx;
  const [x0, y0, x1, y1] = zone;
  const S = new GameMap(W.id, o.w || 440, o.h || 520, { outdoor: true, fill: o.fond ?? T.TREE, name: W.name });
  S.anciensObjets = W.anciensObjets;   // la même file d'anciens identifiants (mapgen.js, item)
  // copier : le brouillon part de ce que la grande carte porte déjà à cet endroit (terrain, hauteurs, relief)
  if (o.copier) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const X = x + dx, Y = y + dy; if (!W.in(X, Y) || !S.in(x, y)) continue;
    S.set(x, y, W.get(X, Y)); S.setHeight(x, y, W.height(X, Y));
    for (const nom of ['pentes', 'monts', 'ravins']) if (W[nom]) { S[nom] ||= new Uint8Array(S.w * S.h); S[nom][y * S.w + x] = W[nom][Y * W.w + X]; }
  }
  if (o.preparer) o.preparer(S);
  const avant = { maps: new Set(Object.keys(maps)), legends: legends.length, routes: routes.length, docks: new Set(Object.keys(docks)), towns: new Set(Object.keys(towns)) };
  const res = construire(S);

  /* le terrain de la zone */
  const tableau = (nom) => S[nom] && (W[nom] ||= new Uint8Array(W.w * W.h));
  for (const nom of ['pentes', 'monts', 'ravins']) tableau(nom);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const X = x + dx, Y = y + dy; if (!W.in(X, Y) || !S.in(x, y)) continue;
    W.set(X, Y, S.get(x, y)); W.setHeight(X, Y, S.height(x, y));
    for (const nom of ['pentes', 'monts', 'ravins']) if (S[nom]) W[nom][Y * W.w + X] = S[nom][y * S.w + x];
  }
  /* tout ce qui a été posé */
  const deja = new WeakSet();
  const decale = (p) => { if (p && typeof p === 'object' && !deja.has(p) && p.map === W.id && typeof p.x === 'number') { deja.add(p); p.x += dx; p.y += dy; } return p; };
  const cases = (L) => (L || []).map(([x, y]) => [x + dx, y + dy]);
  for (const d of S.deco) W.deco.push({ ...d, x: d.x + dx, y: d.y + dy });
  for (const b of S.buildings) {
    const c = { ...b, x: b.x + dx, y: b.y + dy, doorX: b.doorX + dx, doorY: b.doorY + dy };
    if (b.door2X !== undefined) c.door2X = b.door2X + dx;
    W.buildings.push(c);
  }
  for (const n of S.npcs) {
    n.x += dx; n.y += dy;
    if (n.gate?.tiles) n.gate.tiles = cases(n.gate.tiles);
    if (n.beatenPos) n.beatenPos = [n.beatenPos[0] + dx, n.beatenPos[1] + dy];
    W.npcs.push(n);
  }
  for (const it of S.items) { it.x += dx; it.y += dy; W.items.push(it); }
  for (const g of S.gates) { g.tiles = cases(g.tiles); W.gates.push(g); }
  for (const [k, v] of S.warps) { const [x, y] = k.split(',').map(Number); W.warps.set(key(x + dx, y + dy), decale(v)); }
  for (const [k, v] of S.signs) { const [x, y] = k.split(',').map(Number); W.signs.set(key(x + dx, y + dy), v); }
  for (const [k, v] of S.objects) { const [x, y] = k.split(',').map(Number); W.objects.set(key(x + dx, y + dy), v); }
  for (const [k, v] of S.under) { const [x, y] = k.split(',').map(Number); W.under.set(key(x + dx, y + dy), v); }
  for (const z of S.zones) W.zones.push({ ...z, x0: z.x0 + dx, y0: z.y0 + dy, x1: z.x1 + dx, y1: z.y1 + dy });
  for (const q of S.montagnes || []) (W.montagnes ||= []).push({ ...q, sommet: [q.sommet[0] + dx, q.sommet[1] + dy], pied: [q.pied[0] + dx, q.pied[1] + dy], passerelles: q.passerelles.map(([a, b, c, d]) => [a + dx, b + dy, c + dx, d + dy]) });
  for (const p of S.pockets || []) (W.pockets ||= []).push(p);
  /* les cartes, légendaires, tracés et quais nés pendant la construction */
  for (const id of Object.keys(maps)) {
    if (avant.maps.has(id)) continue;
    const m = maps[id]; decale(m.outside);
    for (const v of m.warps.values()) decale(v);
  }
  for (let i = avant.legends; i < legends.length; i++) decale(legends[i]);
  for (let i = avant.routes; i < routes.length; i++) routes[i].pts = routes[i].pts.map(([x, y]) => [x + dx, y + dy]);
  for (const k of Object.keys(docks)) if (!avant.docks.has(k)) decale(docks[k]);
  // les villes bâties dans le brouillon : leur coin et leurs portes repérées
  for (const k of Object.keys(towns)) {
    if (avant.towns.has(k)) continue;
    const t = towns[k]; t.x += dx; t.y += dy;
    for (const c of ['centerDoor', 'homeDoor', 'gymDoor']) if (t[c]) t[c] = [t[c][0] + dx, t[c][1] + dy];
  }
  return res;
}
