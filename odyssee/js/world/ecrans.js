// odyssee/js/world/ecrans.js — des écrans de verdure entre les zones. L'écran montre environ 13 cases de chaque côté du
// joueur, 10 vers le haut et 8 vers le bas : depuis une case d'une zone (ville, route, lieu), on ne doit jamais voir une
// case d'une autre zone qu'on ne peut pas rejoindre de près (marcher, sauter un rebord, nager, couper, briser). Ce qui sépare
// deux zones doit donc être épais : forêt, montagne ou eau (on voit l'autre rive d'un lac, c'est permis).
//
// vues(W) mesure : pour chaque case praticable, la première case d'une autre zone qu'on voit sans pouvoir la rejoindre
// dans les environs (recherche locale, marge de 16 cases autour de la fenêtre de vue). ecrans(W) corrige : les cases
// de décor (herbe, fleurs, hautes herbes, sable) les plus exposées, au bord de la forêt, deviennent des arbres, rangée par
// rangée, sans jamais toucher un chemin, une porte, un panneau, un habitant, un objet, ni couper un passage.
import { T, walkable } from './tiles.js';

export const VUE = { x: 13, haut: 10, bas: 8 };
const M = 16, G = 8;
const LEDGES = new Set([T.LEDGE, T.LEDGE_E, T.LEDGE_W]);
const passe = (q) => walkable(q) || q === T.WATER || q === T.CUT || q === T.SMASH || q === T.BOULDER || LEDGES.has(q);

/** la zone de chaque case praticable (-1 : pas de zone qui compte : mer, rien) ; noms */
function zonesDe(W) {
  const w = W.w, h = W.h, zid = new Int32Array(w * h).fill(-1), noms = new Map(), nom = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!walkable(W.t[y * w + x])) continue;
    const z = W.zoneAt(x, y); if (!z || (z.sea && !z.town)) continue;
    const k = z.town ? 'ville ' + z.town : z.name;
    if (!noms.has(k)) { noms.set(k, nom.length); nom.push(k); }
    zid[y * w + x] = noms.get(k);
  }
  return { zid, nom };
}

/**
 * Les cases d'où l'on voit une autre zone. groupes : liste de groupes 8 × 8 à examiner (tous par défaut).
 * Renvoie { n (cases fautives), expose (Uint8Array : cases vues ou qui voient), fautes (Map 'A → B' → { n, ex }), groupes }.
 */
export function vues(W, Z = zonesDe(W), groupes = null, tous = false) {
  const w = W.w, h = W.h, { zid, nom } = Z, VX = VUE.x, VH = VUE.haut, VB = VUE.bas;
  const pas = (x0, y0, x1, y1) => { const a = W.height(x0, y0), b = W.height(x1, y1); return a === b || (Math.abs(a - b) <= 1 && (W.get(x0, y0) === T.STAIRS || W.get(x1, y1) === T.STAIRS || LEDGES.has(W.get(x0, y0)) || LEDGES.has(W.get(x1, y1)))); };
  const parEau = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); let k = 0; for (let i = 1; i < n; i++) { const q = W.get(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)); if (q === T.WATER || q === T.WHIRL) k++; } return k >= 3; };
  // zones présentes dans chaque bloc 8 × 8 (pour sauter les endroits où il n'y en a qu'une)
  const cw = Math.ceil(w / G), ch = Math.ceil(h / G), blocZ = new Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const z = zid[y * w + x]; if (z < 0) continue; const k = (y >> 3) * cw + (x >> 3); const L = blocZ[k] || (blocZ[k] = []); if (!L.includes(z)) L.push(z); }
  const BW = G + 2 * (VX + M), BH = G + VH + VB + 2 * M, lab = new Int32Array(BW * BH), pile = new Int32Array(BW * BH * 2);
  const expose = new Uint8Array(w * h), fautes = new Map(), touches = [];
  let n = 0;
  const liste = groupes || (() => { const L = []; for (let gy = 0; gy < ch; gy++) for (let gx = 0; gx < cw; gx++) L.push(gy * cw + gx); return L; })();
  for (const gk of liste) {
    const gx = (gk % cw) * G, gy = Math.floor(gk / cw) * G;
    if (!blocZ[gk]) continue;
    // plusieurs zones à portée de vue ?
    const zs = new Set();
    for (let by = Math.max(0, (gy - VH) >> 3); by <= Math.min(ch - 1, (gy + G + VB) >> 3); by++) for (let bx = Math.max(0, (gx - VX) >> 3); bx <= Math.min(cw - 1, (gx + G + VX) >> 3); bx++) for (const z of blocZ[by * cw + bx] || []) zs.add(z);
    if (zs.size < 2) continue;
    const X0 = gx - VX - M, Y0 = gy - VH - M;
    lab.fill(0); let nl = 0;
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
      if (!W.in(x, y) || lab[(y - Y0) * BW + (x - X0)] || !passe(W.get(x, y))) continue;
      nl++; let np = 0; pile[np++] = x; pile[np++] = y; lab[(y - Y0) * BW + (x - X0)] = nl;
      while (np) {
        const cy = pile[--np], cx = pile[--np];
        for (let d = 0; d < 4; d++) {
          const u = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), v = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (u < X0 || v < Y0 || u >= X0 + BW || v >= Y0 + BH || !W.in(u, v) || lab[(v - Y0) * BW + (u - X0)] || !passe(W.get(u, v)) || !pas(cx, cy, u, v)) continue;
          lab[(v - Y0) * BW + (u - X0)] = nl; pile[np++] = u; pile[np++] = v;
        }
      }
    }
    let faute = false;
    for (let py = gy; py < gy + G && py < h; py++) for (let px = gx; px < gx + G && px < w; px++) {
      const zp = zid[py * w + px]; if (zp < 0) continue;
      const lp = lab[(py - Y0) * BW + (px - X0)];
      let vu = -1;
      for (let y = Math.max(0, py - VH); y <= Math.min(h - 1, py + VB); y++) for (let x = Math.max(0, px - VX); x <= Math.min(w - 1, px + VX); x++) {
        const zq = zid[y * w + x]; if (zq < 0 || zq === zp || lab[(y - Y0) * BW + (x - X0)] === lp || parEau(px, py, x, y)) continue;
        expose[y * w + x] = 1;
        if (vu < 0) { vu = zq; const k = nom[zp] + ' → ' + nom[zq]; if (!fautes.has(k)) fautes.set(k, { n: 0, ex: [px, py, x, y] }); fautes.get(k).n++; }
        if (!tous) break;
      }
      if (vu >= 0) { n++; expose[py * w + px] = 1; faute = true; }
    }
    if (faute) touches.push(gk);
  }
  return { n, expose, fautes, groupes: touches, cw };
}

/** plante des arbres sur le bord exposé des zones, rangée par rangée, tant que ça sert (iter : rangées au plus) */
export function ecrans(W, iter = 10) {
  const w = W.w, h = W.h, Z = zonesDe(W);
  const DECOR = new Set([T.GRASS, T.FLOWER, T.TALL, T.DARKTALL, T.SAND, T.ASH, T.SNOW]);
  // cases à ne jamais boucher : autour des habitants, objets, panneaux, portes, passages
  const garde = new Uint8Array(w * h);
  const marque = (x, y, r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (W.in(x + a, y + b)) garde[(y + b) * w + x + a] = 1; };
  for (const n of W.npcs) { marque(n.x, n.y, 1); if (n.trainer) { const s = n.trainer.sight ?? 4, d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[n.dir] || [0, 1]; for (let k = 1; k <= s; k++) marque(n.x + d[0] * k, n.y + d[1] * k, 0); } }
  for (const it of W.items) marque(it.x, it.y, 1);
  for (const k of W.signs.keys()) { const [x, y] = k.split(',').map(Number); marque(x, y, 1); }
  for (const k of W.warps.keys()) { const [x, y] = k.split(',').map(Number); marque(x, y, 2); }
  for (const g of W.gates) for (const [x, y] of g.tiles) marque(x, y, 1);
  for (const d of W.deco) if (d.k !== 'asph') marque(d.x, d.y, 0);
  let res = vues(W, Z), plantes = 0, groupes = null;
  for (let it = 0; it < iter && res.n; it++) {
    const L = [];
    for (let i = 0; i < w * h; i++) {
      if (!res.expose[i] || garde[i] || !DECOR.has(W.t[i])) continue;
      const x = i % w, y = (i / w) | 0;
      // au bord : une voisine qui n'est pas praticable (on épaissit la lisière, sans trouer les prés) ; jamais sur une
      // montagne ni près d'une marche, d'un rebord ou d'un changement de niveau
      if (W.monts?.[i] || W.ravins?.[i]) continue;
      let bord = false, relief = false;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const q = W.get(x + a, y + b);
        if (q === T.STAIRS || LEDGES.has(q) || q === T.CLIFF || (walkable(q) && W.height(x + a, y + b) !== W.height(x, y))) relief = true;
        if ((a === 0) !== (b === 0) && !walkable(q) && q !== T.WATER) bord = true;
      }
      if (!bord || relief) continue;
      L.push(i);
    }
    let k = 0;
    for (const i of L) {
      const x = i % w, y = (i / w) | 0;
      if (!simple(W, x, y)) continue;
      W.t[i] = T.TREE; Z.zid[i] = -1; k++;
    }
    plantes += k;
    if (!k) break;
    // on ne refait que les groupes fautifs et leurs voisins
    const S = new Set(); for (const g of res.groupes) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) S.add(g + b * res.cw + a);
    groupes = [...S].filter((g) => g >= 0);
    const r2 = vues(W, Z, groupes);
    res = r2;
  }
  return { plantes };
}

/** la case peut-elle devenir un arbre sans couper ses voisines praticables les unes des autres ? (point simple) */
function simple(W, x, y) {
  const N8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const ok = N8.map(([a, b]) => passe(W.get(x + a, y + b)) && W.height(x + a, y + b) === W.height(x, y));
  // les voisines praticables (4-voisinage) doivent rester reliées par l'anneau des 8 voisines
  const comp = []; let cur = -1;
  for (let i = 0; i < 8; i++) {
    if (!ok[i]) { cur = -1; continue; }
    if (cur < 0) { cur = comp.length; comp.push([]); }
    comp[cur].push(i);
  }
  if (comp.length > 1 && ok[0] && ok[7]) { const last = comp.pop(); comp[0].push(...last); }
  const ortho = comp.filter((c) => c.some((i) => i % 2 === 1));
  return ortho.length <= 1;
}
