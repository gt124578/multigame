// odyssee/js/world/etages.js — salles à plusieurs niveaux (arènes dessinées dans un plan) : des paliers de hauteurs
// différentes dans la même salle, reliés par des marches, des passerelles sous lesquelles on passe, des plateformes
// qui montent et descendent avec un registre (monte-charge, ponton qui flotte sur un bassin dont le niveau change).
//
// La hauteur d'une case est celle de la carte (GameMap.hg, en niveaux entiers). En plus :
//   marches      une case de marches monte d'un niveau dans un sens : on n'y entre et on n'en sort que dans son axe
//                (sa hauteur est celle du bas ; au bout, le palier est un niveau plus haut)
//   ponts        une passerelle au-dessus d'une case : la case a deux étages, le sol (hg) et le tablier (h) ; on est
//                « dessus » si l'on y est entré depuis un palier à la hauteur du tablier, « dessous » sinon
//   plateformes  des cases dont la hauteur suit un registre (h[registre]) : le joueur monte et descend avec
//   bassins      de l'eau dont la surface suit un registre (on n'y marche pas : c'est le ponton qui flotte dessus)
// Les mêmes règles servent au jeu (GameMap.canStep de la salle), au dessin (hauteurVue) et au test
// (tools/test-odyssee-etages.mjs, qui parcourt tous les états de la salle d'essai).
import { T, DIRS, walkable } from './tiles.js';

const k2 = (x, y) => x + ',' + y;
/** hauteur d'un niveau à l'écran, en cases (une marche d'une case monte d'autant) */
export const NIVEAU_CASES = 0.75;

/** nombre de marches d'une case d'escalier */
export const MARCHES = 4;
/** installe les niveaux sur une carte : m.etages, et un canStep qui en tient compte */
export function installerEtages(m) {
  const E = m.etages = { marches: new Map(), ponts: new Map(), plateformes: [], bassins: [], mobile: new Map(), trace: new Map() };
  m.canStep = (x0, y0, x1, y1) => pasEtages(m, x0, y0, x1, y1, !!E.trace.get(k2(x0, y0))).ok;
  return E;
}
/** niveau (entier) de la surface où l'on se tient sur une case : le tablier si l'on est dessus, sinon le sol */
export function niveau(m, x, y, dessus = false) {
  const p = dessus && m.etages.ponts.get(k2(x, y));
  return p ? p.h : m.height(x, y);
}
/**
 * un pas de (x0, y0) vers la case voisine (x1, y1) ; dessus : on est sur le tablier d'une passerelle.
 * Renvoie { ok, dessus } : si le pas est permis, et si l'on arrive sur un tablier.
 */
export function pasEtages(m, x0, y0, x1, y1, dessus = false) {
  const E = m.etages, NON = { ok: false, dessus: false };
  if (!m.in(x1, y1)) return NON;
  const dx = x1 - x0, dy = y1 - y0, ka = k2(x0, y0), kb = k2(x1, y1);
  const sens = (d) => { const [vx, vy] = DIRS[d]; return vx === dx && vy === dy ? 1 : vx === -dx && vy === -dy ? -1 : 0; };
  const sur = dessus && E.ponts.has(ka);
  let S = sur ? E.ponts.get(ka).h : m.height(x0, y0);
  // on quitte des marches : seulement dans leur axe ; vers le haut, on arrive un niveau plus haut
  const ma = !sur && E.marches.get(ka);
  if (ma) { const s = sens(ma); if (!s) return NON; if (s > 0) S += 1; }
  // un tablier à notre hauteur : on passe dessus
  const pb = E.ponts.get(kb);
  if (pb && pb.h === S) return { ok: true, dessus: true };
  // le sol de la case d'arrivée
  const mb = E.marches.get(kb), hb = m.height(x1, y1);
  if (mb) { const s = sens(mb); return s > 0 && hb === S ? { ok: true, dessus: false } : s < 0 && hb + 1 === S ? { ok: true, dessus: false } : NON; }
  return hb === S ? { ok: true, dessus: false } : NON;
}
/**
 * en glissant (glace), on ne s'arrête pas au bord d'un palier : si la case d'après est plus basse (et que ce ne sont pas
 * des marches), on tombe dessus. Renvoie true si la glissade de (x0, y0) vers (x1, y1) est une chute.
 */
export function chuteGlissade(m, x0, y0, x1, y1) {
  const E = m.etages; if (!E || !m.in(x1, y1)) return false;
  if (E.marches.has(k2(x0, y0)) || E.marches.has(k2(x1, y1)) || E.ponts.has(k2(x1, y1))) return false;
  return m.height(x1, y1) < m.height(x0, y0);
}
/** élan : nombre de cases de glissade qu'il faut avoir derrière soi pour briser une boule de neige */
export const ELAN = 3;
/**
 * un rocher poussé depuis (x, y) dans le sens d : il avance d'une case ; sur la glace, il glisse jusqu'au premier
 * obstacle, s'arrête contre un gradin plus haut ou des marches, et tombe du bord d'un gradin sur celui du dessous (où il
 * continue de glisser s'il y a de la glace). libre(x, y) : un rocher peut-il occuper cette case ? Renvoie sa case
 * d'arrêt, ou null s'il ne bouge pas.
 */
export function glisseRocher(m, x, y, d, libre) {
  const [dx, dy] = DIRS[d], E = m.etages; let n = 0;
  for (let g = 0; g < 200; g++) {
    const a = x + dx, b = y + dy;
    if (!m.in(a, b) || !libre(a, b)) break;
    if (E && (E.marches.has(k2(a, b)) || E.ponts.has(k2(a, b)) || m.height(a, b) > m.height(x, y))) break;
    x = a; y = b; n++;
    if (m.objectAt(x, y)?.type !== 'glace') break;
  }
  return n ? [x, y] : null;
}
/** le joueur vient de faire un pas : on retient à quel étage il est sur ses dernières cases (lui, puis le Pokémon qui le suit) */
export function tracerPas(m, x0, y0, x1, y1) {
  const E = m.etages, r = pasEtages(m, x0, y0, x1, y1, !!E.trace.get(k2(x0, y0)));
  const garde = new Map([[k2(x0, y0), !!E.trace.get(k2(x0, y0))], [k2(x1, y1), r.dessus]]);
  if (E.avant) garde.set(E.avant, !!E.trace.get(E.avant));
  E.avant = k2(x0, y0); E.trace = garde;
}

/** hauteur dessinée (en niveaux, pas forcément entière) d'une case en un point : rampe des marches, plateformes en mouvement */
function sol(m, cx, cy, X, Z) {
  const E = m.etages, k = k2(cx, cy), mob = E.mobile.get(k);
  if (mob) return mob.hv;
  const h = m.height(cx, cy), d = E.marches.get(k);
  if (!d) return h;
  const f = d === 'up' ? cy + 1 - Z : d === 'down' ? Z - cy : d === 'right' ? X - cx : cx + 1 - X;
  return h + Math.max(0, Math.min(1, (Math.floor(f * MARCHES + 1e-6) + 1) / MARCHES));   // le dessus de la marche où l'on est
}
/** hauteur du sol d'une case (cx, cy) en un de ses points (X, Z) */
export const hauteurCase = sol;
/** hauteur où se tient un personnage en (X, Z) ; dessus : sur le tablier de la passerelle de cette case */
export function hauteurVue(m, X, Z, dessus = false) {
  const cx = Math.floor(X), cy = Math.floor(Z);
  if (!m.in(cx, cy)) return 0;
  const p = dessus && m.etages.ponts.get(k2(cx, cy));
  return p ? p.h : sol(m, cx, cy, X, Z);
}

/** met les plateformes et les bassins à la hauteur de leurs registres ; renvoie les cases dont la hauteur change */
export function appliquerEtages(m, regs) {
  const E = m.etages, chg = [];
  for (const P of E.plateformes) {
    const h = P.h[regs[P.r] || 0] ?? 0;
    P.cible = h; if (P.hv == null) P.hv = h;
    for (const [x, y] of P.cases) if (m.height(x, y) !== h) { m.setHeight(x, y, h); chg.push([x, y]); }
  }
  for (const B of E.bassins) { const h = B.h[regs[B.r] || 0] ?? 0; B.cible = h; if (B.hv == null) B.hv = h; }
  return chg;
}
/** les plateformes et bassins qui ne sont pas (encore) à leur hauteur : à animer */
export const enMouvement = (m) => [...m.etages.plateformes, ...m.etages.bassins].filter((P) => P.hv !== P.cible);
/** tout de suite à la bonne hauteur (entrée dans la salle, remise à zéro) */
export function poserEtages(m) { for (const P of [...m.etages.plateformes, ...m.etages.bassins]) P.hv = P.cible; m.etages.trace = new Map(); m.etages.avant = null; }

/**
 * lit les niveaux d'un plan d'arène : def.niveaux (une ligne de chiffres par ligne du plan), les marches et passerelles
 * de la légende (marche: sens où l'on monte, pont: hauteur du tablier), def.plateformes et def.bassins
 * ({ c: caractères du plan, r: registre, h: hauteur selon le registre }).
 */
export function lireEtages(m, def, legende) {
  const E = installerEtages(m), P = def.plan;
  E.theme = def.theme || '';   // habillage des flancs et des marches (pierre par défaut, « glace »)
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = P[y][x], s = legende[c] || {}, n = def.niveaux?.[y]?.[x];
    if (n >= '0' && n <= '9') m.setHeight(x, y, +n);
    if (s.marche) { m.set(x, y, T.STAIRS); E.marches.set(k2(x, y), s.marche); }
    if (s.pont != null) E.ponts.set(k2(x, y), { h: s.pont });
  }
  const cases = (cs) => { const L = []; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (cs.includes(P[y][x])) L.push([x, y]); return L; };
  for (const p of def.plateformes || []) { const o = { ...p, cases: cases(p.c), hv: null }; E.plateformes.push(o); for (const [x, y] of o.cases) E.mobile.set(k2(x, y), o); }
  for (const b of def.bassins || []) { const o = { ...b, cases: cases(b.c), hv: null, eau: true }; E.bassins.push(o); for (const [x, y] of o.cases) E.mobile.set(k2(x, y), o); }
  return E;
}

/* ------------------------------------------------------------------ la salle d'essai (Odyssée Test) */
/**
 * Salle d'essai des niveaux : quatre hauteurs, deux escaliers (un de face, un de côté), une passerelle sous laquelle
 * passe le couloir du milieu, un monte-charge à levier (rez-de-chaussée, estrade, mezzanine) et un bassin dont la
 * vanne fait monter l'eau : le ponton qui flotte dessus rejoint la corniche du fond.
 */
export function planEssai() {
  const W = 25, H = 22;
  const plan = Array.from({ length: H }, () => Array(W).fill('.')), niv = Array.from({ length: H }, () => Array(W).fill(0));
  const zone = (x0, y0, x1, y1, f) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(x, y); };
  const car = (x0, y0, x1, y1, c) => zone(x0, y0, x1, y1, (x, y) => { plan[y][x] = c; });
  const haut = (x0, y0, x1, y1, h) => zone(x0, y0, x1, y1, (x, y) => { niv[y][x] = h; });
  car(0, 0, W - 1, 1, '#'); car(0, 0, 0, H - 1, '#'); car(W - 1, 0, W - 1, H - 1, '#'); car(0, H - 1, W - 1, H - 1, '#');
  plan[H - 1][12] = 'E';
  // corniche du fond et mezzanines (niveau 3)
  haut(1, 2, 23, 3, 3); haut(1, 4, 7, 8, 3); haut(20, 4, 23, 11, 3);
  // estrades (niveau 2) ; celle de l'ouest se gagne par deux volées de marches et un palier (niveau 1)
  haut(1, 9, 7, 14, 2); haut(15, 4, 19, 13, 2);
  haut(3, 15, 5, 15, 1);
  plan[16][4] = '^'; niv[16][4] = 0; plan[14][4] = '^'; niv[14][4] = 1;   // hall → palier → estrade (de face)
  plan[8][2] = '^'; niv[8][2] = 2;                                         // estrade → mezzanine
  plan[12][15] = '>'; niv[12][15] = 0; plan[12][16] = '>'; niv[12][16] = 1; // couloir → estrade de l'est (de côté)
  // passerelle entre les deux estrades, deux niveaux au-dessus du couloir : on passe dessous sans se baisser
  car(8, 11, 14, 11, '=');
  // monte-charge et son levier
  car(20, 12, 21, 13, 'A'); plan[13][21] = 'a';
  // bassin, ponton et vanne
  car(8, 4, 14, 6, '~'); car(10, 4, 12, 6, 'P'); plan[5][12] = 'V';
  // panneaux, pupitre de remise, plantes
  plan[19][10] = 'S'; plan[19][14] = 'Z'; plan[9][22] = 'B'; plan[9][17] = 'p'; plan[10][2] = 'p';
  return {
    type: 'essai', version: 1, sol: 'floor', regs: [0, 0],
    plan: plan.map((l) => l.join('')), niveaux: niv.map((l) => l.join('')),
    regles: ['SALLE D\'ESSAI DES NIVEAUX', 'Quatre hauteurs : le hall, le palier, les estrades, la mezzanine.', 'Le levier rouge fait monter le monte-charge d\'un étage.', 'Au fond, la vanne bleue fait monter l\'eau : le ponton flotte dessus.', 'On passe sur la passerelle, ou dessous par le couloir.'],
    legende: {
      '^': { marche: 'up' }, '>': { marche: 'right' },
      '=': { pont: 2 },
      A: { deco: 'monte_charge' },
      a: { deco: 'monte_charge', prop: 'levier_rouge', reg: { inc: [0, 3] }, use: true, son: 'door' },
      P: { deco: 'ponton_etg' },
      V: { deco: 'ponton_etg', prop: 'levier_bleu', reg: { inc: [1, 4] }, use: true, son: 'splash' },
      B: { panneau: ['La mezzanine de l\'est : on y monte par le monte-charge, ou par la corniche du fond.'] },
    },
    plateformes: [{ c: 'Aa', r: 0, h: [0, 2, 3] }, { c: 'PV', r: 1, h: [0, 1, 2, 3] }],
    bassins: [{ c: '~', r: 1, h: [-0.3, 0.7, 1.7, 2.7] }],
  };
}

/**
 * Arène Glace à niveaux (essai) : le Glacier. Trois gradins de glace montent vers le fond.
 *  - on glisse jusqu'au premier obstacle (pic de glace, congère, rocher, paroi du gradin du dessus) ;
 *  - au bord d'un gradin, rien ne retient : on tombe sur celui du dessous (les gradins de Frimapic, dans Platine) ;
 *  - une boule de neige barre le pied de chaque escalier : on la brise en arrivant dessus avec de l'élan (trois cases de
 *    glissade au moins, comme les boules de neige de Frimapic) ;
 *  - les rochers de glace se poussent à l'arrêt : ils glissent jusqu'au premier obstacle et servent ensuite de butée ;
 *    poussé par-dessus le bord, un rocher tombe sur le gradin du dessous et y devient une butée (les rochers de la
 *    Route de Glace, dans HeartGold / SoulSilver).
 * Plan trouvé par recherche (25 coups au plus court dont 5 poussées, un rocher à faire tomber, aucune impasse) ; vérifié
 * par tools/test-odyssee-etages.mjs. Les marches se prennent par le bas, dans leur axe.
 */
export function planGlace() {
  return {
    type: 'ice', version: 2, sol: 'gymGlace', theme: 'glace', minActions: 0,
    plan: [
      '#########################',
      '#########################',
      '#.........g.B.g.........#',
      '#.......................#',
      '#.......................#',
      '#********************^**#',
      '#***********.********O**#',
      '#*********IIQ***********#',
      '#**********I********I***#',
      '#******I*****I*********Q#',
      '#*********.*************#',
      '#*********^*************#',
      '#****I****O**Q**********#',
      '#********************Q**#',
      '#***********************#',
      '#****************I*****.#',
      '#****.******************#',
      '#....^..................#',
      '#.........S...Z.........#',
      '#.......................#',
      '############E############'
],
    niveaux: [
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0333333333333333333333330',
      '0333333333333333333333330',
      '0333333333333333333333330',
      '0222222222222222222222220',
      '0222222222222222222222220',
      '0222222222222222222222220',
      '0222222222222222222222220',
      '0222222222222222222222220',
      '0222222222222222222222220',
      '0111111111111111111111110',
      '0111111111111111111111110',
      '0111111111111111111111110',
      '0111111111111111111111110',
      '0111111111111111111111110',
      '0111111111111111111111110',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000',
      '0000000000000000000000000'
],
    regles: ['ARÈNE DU GLACIER (essai)', 'Sur la glace, on glisse jusqu\'au premier obstacle. Au bord d\'un gradin, on tombe sur celui du dessous.', 'Une boule de neige se brise si l\'on arrive dessus avec de l\'élan : trois cases de glissade au moins.', 'Un rocher de glace se pousse à l\'arrêt : il glisse, tombe des gradins, et sert ensuite de butée.', 'Le pupitre remet tout en place.'],
    legende: {
      '^': { marche: 'up' }, I: { sol: 'glace', prop: 'pilier_glace' }, Q: { glace: true, rocher: true }, O: { boule: true },
      B: { panneau: ['Le sommet du Glacier ! Le Champion t\'attendrait ici.'] },
    },
    but: [12, 3],
  };
}
export { walkable };
