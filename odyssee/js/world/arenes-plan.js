// odyssee/js/world/arenes-plan.js — arènes dessinées à la main dans un plan ASCII (toutes sauf Sylvebourg, qui a son propre
// fichier) : construction de la carte, mécanismes partagés par le jeu (game.js) et par le solveur des tests.
//
// Un plan = des lignes de caractères (25 de large), une légende propre à l'arène qui complète la légende commune, des
// registres (petits nombres qui disent l'état de l'arène : niveau de l'eau, polarité, fleurs ouvertes, ponts, engrenages,
// miroirs…) et des mécanismes :
//   portes      cases ouvertes ou fermées selon une condition sur les registres (barrière, eau, lave, ronces…)
//   reg         interrupteur : au pas (dalle) ou en interagissant (levier, statue, coffre, miroir) → change les registres
//   fleches     tapis, courants, vents ; leur sens peut tourner avec un registre (engrenages)
//   glace       on glisse jusqu'au premier obstacle          tp     téléporteur vers une autre case
//   chute       trou : on tombe vers une autre case (étage du dessous, début d'une allée)
//   tourniquets portillons à bras qui tournent d'un quart de tour quand on pousse un bras
//   rochers     on les pousse (sans Force dans l'arène) ; un rocher poussé dans une fosse la comble
//   lasers      un rayon part d'une source, tourne sur les miroirs, ouvre une porte s'il touche son cristal
//   fragiles    dalles qui se fendent au premier pas et cèdent au second ; toutes fendues, la salle s'ouvre
//   canons      canons à vent : ils tirent vers l'île visée puis pivotent d'un quart de tour
//   verrous     quand une condition devient vraie, un registre se fixe (un parterre fleuri garde sa haie ouverte)
//   remise      pupitre qui remet l'arène comme au début (le joueur revient à l'entrée)
// Le solveur (resoudre) parcourt tous les états (zone où le joueur circule librement, registres, rochers) avec ces
// mêmes règles ; le jeu les applique dans js/arenes-jeu.js, et tools/test-odyssee-arenes-jeu.mjs vérifie qu'ils s'accordent.
import { T, DIRS, walkable } from './tiles.js';
import { GameMap } from './mapgen.js';

export const SENS = ['up', 'right', 'down', 'left'];
export const tourne = (d, q) => SENS[(((SENS.indexOf(d) + q) % 4) + 4) % 4];
const k2 = (x, y) => x + ',' + y;
const DV = Object.values(DIRS), DE = Object.entries(DIRS);

/* ------------------------------------------------------------------ registres : conditions et actions */
/** condition d'une porte : { r, eq | ne | le | ge | dans } sur un registre, { tous: [r…], eq } ou { rayon: n } */
export function cond(c, regs, m) {
  if (!c) return true;
  if (c.tous) return c.tous.every((i) => regs[i] === (c.eq ?? 1));
  if (c.rayon != null) return !!rayons(m, regs)[c.rayon]?.touche;
  if (c.non) return !cond(c.non, regs, m);
  const v = regs[c.r];
  if (c.eq != null) return v === c.eq;
  if (c.ne != null) return v !== c.ne;
  if (c.le != null) return v <= c.le;
  if (c.ge != null) return v >= c.ge;
  if (c.dans) return c.dans.includes(v);
  return !!v;
}
/** action d'un interrupteur : { set: [r, v] }, { inc: [r, modulo] }, { flip: [r…] }, { seq: [r, n] } (n-ième d'une suite) */
export function agir(a, regs, m = null) {
  if (a.sauf && cond(a.sauf, regs, m)) return regs.slice();   // interrupteur verrouillé
  const R = regs.slice();
  if (a.set) R[a.set[0]] = a.set[1];
  if (a.inc) R[a.inc[0]] = (R[a.inc[0]] + 1) % a.inc[1];
  if (a.flip) for (const i of a.flip) R[i] ^= 1;
  if (a.seq) { const [i, n] = a.seq; R[i] = R[i] === n - 1 ? n : n === 1 ? 1 : 0; }
  if (a.puis) return agir(a.puis, R, m);
  return m ? verrous(m, R) : R;
}
/** verrous de l'arène : quand une condition devient vraie, un registre se fixe (un parterre fleuri ouvre sa haie pour de bon) */
export function verrous(m, R) {
  for (const v of m.planArene?.verrous || []) if (cond(v.si, R, m)) { if (R[v.set[0]] !== v.set[1]) { R = R.slice(); R[v.set[0]] = v.set[1]; } }
  return R;
}

/* ------------------------------------------------------------------ tapis, tourniquets, rayons */
/** sens d'un tapis : sa flèche de base, tournée d'autant de quarts de tour que son registre */
export const sensFleche = (o, regs) => (o.r != null ? tourne(o.base, regs[o.r] * (o.mul || 1)) : o.dir);
/** bras d'un tourniquet : [x, y, sens] de chaque bras */
export function bras(t, regs) {
  const q = regs[t.r] || 0;
  return t.bras.map((d) => { const s = tourne(d, q), [dx, dy] = DIRS[s]; return [t.x + dx, t.y + dy, s]; });
}
/** cases libres pour un bras qui tourne : du sol, sans personne */
function libreBras(m, x, y, occupe) { const t = m.get(x, y); return (t === T.FLOOR || (m.etat?.armes?.has(k2(x, y)) && t === T.BLOCK)) && !occupe(x, y); }
/** pousser le bras d'un tourniquet : le joueur en (px, py) avance vers dir ; renvoie les nouveaux registres ou null */
export function pousserTourniquet(m, regs, px, py, dir, occupe = () => false) {
  const [dx, dy] = DIRS[dir], ax = px + dx, ay = py + dy;
  for (const t of m.etat?.tourniquets || []) {
    const B = bras(t, regs), b = B.find(([x, y]) => x === ax && y === ay); if (!b) continue;
    const [vx, vy] = DIRS[b[2]], z = vx * dy - vy * dx;   // couple : sens de rotation
    if (!z) return null;                                   // on pousse le bras dans sa longueur : rien ne bouge
    const q = z > 0 ? 1 : -1, R = regs.slice(); R[t.r] = (((R[t.r] || 0) + q) % 4 + 4) % 4;
    const mien = new Set(B.map(([x, y]) => k2(x, y)));
    for (const [x, y] of bras(t, R)) if (!mien.has(k2(x, y)) && !libreBras(m, x, y, occupe)) return null;
    return R;
  }
  return null;
}
/** est-ce un bras de tourniquet (dans l'état regs) ? */
export function estBras(m, regs, x, y) { return (m.etat?.tourniquets || []).some((t) => bras(t, regs).some(([a, b]) => a === x && b === y)); }
/** rayons des sources lumineuses : cases traversées et cristal touché */
export function rayons(m, regs) {
  const L = m.etat?.lasers || []; if (!L.length) return [];
  const mir = new Map((m.etat.miroirs || []).map((q) => [k2(q.x, q.y), q]));
  return L.map((l) => {
    let [x, y] = [l.x, l.y], d = l.dir; const cases = [];
    for (let n = 0; n < 200; n++) {
      const [dx, dy] = DIRS[d]; x += dx; y += dy;
      if (l.cible && x === l.cible[0] && y === l.cible[1]) return { cases, touche: true };
      const q = mir.get(k2(x, y));
      if (q) {
        const f = (q.base === '/') !== !!(regs[q.r] % 2);   // le registre retourne le miroir
        d = f ? { up: 'right', right: 'up', down: 'left', left: 'down' }[d] : { up: 'left', left: 'up', down: 'right', right: 'down' }[d];
        cases.push([x, y, 'm']); continue;
      }
      const t = m.get(x, y), porte = m.etat.portesK?.has(k2(x, y));
      if (!m.in(x, y) || t === T.WALL || (t === T.BLOCK && !porte) || t === T.SIGN) break;
      cases.push([x, y, d === 'up' || d === 'down' ? 'v' : 'h']);
    }
    return { cases, touche: false };
  });
}

/** canon (arène Vol) : il tire dans le sens où il pointe, puis pivote d'un quart de tour ; vers le vide, il ne tire pas */
export function tirCanon(o, regs) {
  const d = SENS[(regs[o.r] || 0) % 4], v = o.vers?.[d]; if (!v) return null;
  const R = regs.slice(); R[o.r] = ((R[o.r] || 0) + 1) % 4;
  return { vers: v, R, dir: d };
}

/* ------------------------------------------------------------------ état appliqué à la carte */
/**
 * met la carte dans l'état des registres : portes, bras des tourniquets, sens des tapis, miroirs, rayons.
 * joueur : [x, y] (une porte ne se referme pas sous ses pieds). Renvoie les cases changées (à redessiner).
 */
export function appliquerEtat(m, regs, joueur = null) {
  const E = m.etat; if (!E) return [];
  const chg = [];
  const pose = (x, y, t) => { if (m.get(x, y) !== t) { if (joueur && t !== T.FLOOR && joueur[0] === x && joueur[1] === y) return; m.set(x, y, t); chg.push([x, y]); } };
  for (const p of E.portes) pose(p.x, p.y, cond(p.c, regs, m) ? p.ouvert ?? T.FLOOR : p.ferme);
  if (E.tourniquets.length) {
    const arm = new Set(); for (const t of E.tourniquets) for (const [x, y] of bras(t, regs)) arm.add(k2(x, y));
    for (const k of E.armes) { const [x, y] = k.split(',').map(Number); pose(x, y, arm.has(k) ? T.BLOCK : T.FLOOR); }
  }
  for (const o of E.fleches) { const d = sensFleche(o, regs); if (o.dir !== d) { o.dir = d; if (o.deco) o.deco.dir = d; chg.push([o.x, o.y]); } }
  for (const q of E.miroirs) { const f = regs[q.r] % 2; if (q.deco.f !== f) { q.deco.f = f; chg.push([q.x, q.y]); } }
  for (const o of E.canons || []) { const d = SENS[(regs[o.r] || 0) % 4]; if (o.deco.dir !== d) { o.deco.dir = d; chg.push([o.x, o.y]); } }
  for (const f of E.fleurs) { if (f.deco.v !== regs[f.r]) { f.deco.v = regs[f.r]; chg.push([f.x, f.y]); } }
  if (E.lasers.length) {
    const avant = m.rayon || new Map(), apres = new Map();
    for (const r of rayons(m, regs)) for (const [x, y, o] of r.cases) apres.set(k2(x, y), apres.has(k2(x, y)) && apres.get(k2(x, y)) !== o ? 'x' : o);
    for (const k of new Set([...avant.keys(), ...apres.keys()])) if (avant.get(k) !== apres.get(k)) chg.push(k.split(',').map(Number));
    m.rayon = apres;
    for (const [i, r] of rayons(m, regs).entries()) { const c = E.lasers[i].cibleDeco; if (c && c.on !== r.touche) { c.on = r.touche; chg.push([E.lasers[i].cible[0], E.lasers[i].cible[1]]); } }
  }
  m.regs = regs.slice();
  return chg;
}

/* ------------------------------------------------------------------ construction */
// légende commune ; chaque arène la complète (ou la remplace caractère par caractère)
const COMMUNE = {
  '#': { t: 'mur' }, '.': { t: 'sol' }, ' ': { t: 'sol' },
  E: { t: 'sortie' }, S: { role: 'panneau' }, G: { role: 'guide' }, C: { role: 'champion', deco: 'estrade' },
  g: { prop: 'gymstatue' }, p: { prop: 'plant' }, _: { deco: 'estrade' }, w: { deco: 'tapis' },
  K: { role: 'savoir' }, o: { role: 'objet' }, Z: { remise: true, prop: 'pupitre' },
  '*': { glace: true }, L: { t: 'lave' }, '~': { t: 'eau' }, R: { rocher: true }, i: { t: 'invis' },
};
/** construit l'arène d'après son plan ; renvoie ce que region.js y pose (dresseurs, guide, Champion, gardiens) */
export function construireArene(id, gym, def, name) {
  const P = def.plan, H = P.length, W = P[0].length;
  const m = new GameMap(id, W, H, { outdoor: false, fill: T.FLOOR, floor: def.sol, music: 'gym', name, battleBg: 'gym', wallStyle: def.mur || 'wall_gym' });
  m.gymLock = gym; m.arene = def.type; m.cloisons = true; m.pushFree = true; m.planArene = def;
  if (def.noir) m.dark = 'arene';
  if (def.bloc) m.bloc = def.bloc;
  const E = m.etat = { portes: [], portesK: new Set(), tourniquets: [], armes: new Set(), fleches: [], miroirs: [], fleurs: [], lasers: [], fosses: [], fragiles: {}, remises: [], canons: [] };
  const L = { ...COMMUNE, ...(def.legende || {}) };
  const ou = {};   // caractère → cases
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) (ou[P[y][x]] ||= []).push([x, y]);
  const une = (c) => { const q = ou[c]; if (!q || q.length !== 1) throw new Error(`arène ${def.type} : « ${c} » doit être unique (${q?.length || 0})`); return q[0]; };
  const res = { map: m, quiz: [], spots: [], objets: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = P[y][x], s = L[c];
    if (!s && !/[1-9]/.test(c)) throw new Error(`arène ${def.type} : caractère inconnu « ${c} » en ${x},${y}`);
    if (/[1-9]/.test(c) && !s) { const d = def.dresseurs?.[+c - 1] || {}; res.spots[+c - 1] = [x, y, d.dir || 'down', d.vue ?? 3]; continue; }
    // sol de base
    if (s.t === 'mur') { m.set(x, y, T.WALL); continue; }
    if (s.t === 'sortie') { m.set(x, y, T.MAT); m.exitX = x; m.exitY = y; continue; }
    if (s.t === 'lave') m.set(x, y, T.LAVA);
    else if (s.t === 'eau') m.set(x, y, T.WATER);
    else if (s.t === 'bloc') m.set(x, y, T.BLOCK);
    else if (s.t === 'invis') { m.under.set(k2(x, y), T.FLOOR); m.set(x, y, T.BLOCK); }
    else m.set(x, y, T.FLOOR);
    if (s.sol) m.deco.push({ k: s.sol, x, y });                         // décalque sous ce qui est posé (alvéoles, eau…)
    if (s.deco) m.deco.push(typeof s.deco === 'string' ? { k: s.deco, x, y } : { ...s.deco, x, y });
    if (s.role === 'panneau') m.sign(x, y, def.regles);
    else if (s.panneau) m.sign(x, y, [].concat(s.panneau));
    else if (s.role === 'guide') res.guide = [x, y];
    else if (s.role === 'champion') res.leader = [x, y];
    else if (s.role === 'savoir') res.quiz.push([x, y]);
    else if (s.role === 'objet') res.objets.push([x, y]);
    if (s.prop) m.prop(s.prop, x, y, true, s.propO || {});
    if (s.libre) m.prop(s.libre, x, y, false, s.propO || {});
    if (s.rocher) m.set(x, y, T.BOULDER);
    if (s.glace) { m.deco.push({ k: def.glace || 'glace', x, y }); m.object(x, y, { type: 'glace' }); }
    if (s.fleche) {
      const deco = { k: s.decoFleche || def.fleche || 'fleche', x, y, dir: s.fleche };
      if (s.fondFleche || def.fondFleche) m.deco.push({ k: s.fondFleche || def.fondFleche, x, y });
      m.deco.push(deco);
      const o = { type: 'fleche', dir: s.fleche, base: s.fleche, r: s.r, mul: s.mul, x, y, deco }; m.object(x, y, o); E.fleches.push(o);
    }
    if (s.porte) {
      const ferme = { r: T.BARRIER_R, b: T.BARRIER_B, lave: T.LAVA, eau: T.WATER, bloc: T.BLOCK }[s.ferme || 'r'];
      E.portes.push({ x, y, c: s.porte, ferme }); E.portesK.add(k2(x, y));
      if (s.o || s.f) m.deco.push({ k: 'etat', x, y, o: s.o, f: s.f, dir: s.dirDeco });
      else if (s.ferme === 'r' || s.ferme === 'b' || !s.ferme) m.deco.push({ k: 'socle', x, y, g: s.ferme || 'r' });
    }
    if (s.reg) {
      const o = { type: 'reg', a: s.reg, pas: !s.use, actionne: !!s.use, msg: s.msg, son: s.son, x, y };
      m.object(x, y, o);
      if (s.pad) m.deco.push({ k: s.pad, x, y, g: s.g, dir: s.dirDeco });
    }
    if (s.fleur != null) { const d = { k: 'fleur_gym', x, y, v: 0, r: s.fleur }; m.deco.push(d); E.fleurs.push({ x, y, r: s.fleur, deco: d }); }
    if (s.miroir) { const d = { k: 'miroir', x, y, base: s.miroir, f: 0 }; m.prop('miroir', x, y, true, {}); m.deco.pop(); m.deco.push(d); E.miroirs.push({ x, y, base: s.miroir, r: s.r, deco: d }); m.object(x, y, { type: 'reg', x, y, a: { inc: [s.r, 2] }, actionne: true, msg: 'Le miroir pivote d\'un quart de tour.', son: 'select' }); }
    if (s.canon) { const d = { k: 'canon', x, y, r: s.canon.r, dir: 'up' }; m.deco.push(d); const o = { type: 'canon', r: s.canon.r, cibles: s.canon.cibles, x, y, deco: d }; m.object(x, y, o); E.canons.push(o); }
    if (s.tp) m.object(x, y, { type: 'tp', cible: s.tp, dir: s.dirTp });
    if (s.tp && s.pad !== false) m.deco.push({ k: s.padTp || 'tp', x, y });
    if (s.chute) { m.object(x, y, { type: 'chute', cible: s.chute, msg: s.msg }); if (s.vide !== false) m.deco.push({ k: s.decoChute || 'vide', x, y }); }
    if (s.fosse) { m.set(x, y, T.BLOCK); E.fosses.push([x, y]); m.deco.push({ k: 'etat', x, y, o: 'fosse_pleine', f: 'fosse' }); }
    if (s.fragile) { const f = E.fragiles[s.fragile] ||= { cases: [], ...(def.fragiles?.[s.fragile] || {}) }; f.cases.push([x, y]); m.object(x, y, { type: 'fragile', salle: s.fragile }); m.deco.push({ k: 'fragile', x, y, salle: s.fragile }); }
    if (s.remise) { E.remises.push([x, y]); m.object(x, y, { type: 'remise', x, y, actionne: true }); }
  }
  // cibles des téléporteurs et des chutes (un caractère unique dans le plan)
  for (const o of m.objects.values()) if ((o.type === 'tp' || o.type === 'chute') && typeof o.cible === 'string') o.to = une(o.cible);
  for (const o of E.canons) { o.vers = {}; for (const [d, c] of Object.entries(o.cibles)) o.vers[d] = une(c); }
  // tourniquets : pivot (prop) et bras
  for (const t of def.tourniquets || []) {
    const [x, y] = une(t.c), q = { x, y, bras: t.bras, r: t.r };
    E.tourniquets.push(q); m.prop(def.pivot || 'pivot', x, y, true);
    for (const d of SENS) { const [dx, dy] = DIRS[d]; E.armes.add(k2(x + dx, y + dy)); m.deco.push({ k: 'etat', x: x + dx, y: y + dy, f: d === 'up' || d === 'down' ? 'bras_v' : 'bras_h', bras: true }); }
  }
  // sources lumineuses et cristaux
  for (const l of def.lasers || []) {
    const [x, y] = une(l.c), [cx, cy] = une(l.cible), d = { k: 'cristal_cible', x: cx, y: cy, on: false };
    m.prop('source', x, y, true, { dir: l.dir }); m.prop('cristal_cible', cx, cy, true); m.deco.pop(); m.deco.push(d);
    E.lasers.push({ x, y, dir: l.dir, cible: [cx, cy], cibleDeco: d });
  }
  m.regs0 = (def.regs || []).slice();
  appliquerEtat(m, m.regs0);
  // un rocher posé sur le plan (R) garde son sol : on le pousse sur des cases de sol
  return res;
}

/* ------------------------------------------------------------------ dalles fragiles : un chemin qui passe une seule fois partout */
/** existe-t-il un chemin qui part de dep (case de la salle), passe une fois sur chaque dalle et finit sur une case de fin ? */
export function cheminFragile(cases, dep, fins) {
  const S = new Set(cases.map(([x, y]) => k2(x, y))), fin = new Set(fins.map(([x, y]) => k2(x, y))), vu = new Set([k2(...dep)]);
  const n = S.size;
  const dfs = (x, y) => {
    if (vu.size === n) return fin.has(k2(x, y)) ? [[x, y]] : null;
    for (const [dx, dy] of Object.values(DIRS)) {
      const k = k2(x + dx, y + dy); if (!S.has(k) || vu.has(k)) continue;
      vu.add(k); const r = dfs(x + dx, y + dy); vu.delete(k); if (r) return [[x, y], ...r];
    }
    return null;
  };
  return dfs(...dep);
}

/* ------------------------------------------------------------------ solveur */
/**
 * parcourt tous les états de l'arène depuis l'entrée : place du joueur, registres, rochers.
 * o.npcs : cases occupées (dresseurs, guide, Champion) ; o.but(x, y) : arrivée. Renvoie le nombre d'états, la longueur
 * du plus court parcours (en pas et en actions), et les états d'où l'on ne peut plus ressortir.
 */
export function resoudre(m, o = {}) {
  const E = m.etat, npcs = o.npcs || new Set(), regs0 = m.regs0.slice();
  const fosses = new Set(E.fosses.map(([x, y]) => k2(x, y))), roc0 = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.BOULDER) roc0.push(k2(x, y));
  const rocBase = new Set(roc0), portes = new Map(E.portes.map((p) => [k2(p.x, p.y), p]));
  const fragDep = new Map(); for (const [id, f] of Object.entries(E.fragiles)) fragDep.set(k2(...f.entree), id);
  // nature fixe de chaque case : 0 jamais, 1 sol, 2 fosse, 3 porte, 4 bras possible ; PNJ à part
  const W0 = m.w, NAT = new Int8Array(m.w * m.h), PNJ = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const k = k2(x, y), i = y * W0 + x;
    NAT[i] = fosses.has(k) ? 2 : portes.has(k) ? 3 : E.armes.has(k) ? 4 : rocBase.has(k) || walkable(m.get(x, y)) ? 1 : 0;
    if (npcs.has(k)) PNJ[i] = 1;
  }
  // rochers de l'état en cours, marqués dans un tableau (bien plus rapide qu'un Set de chaînes)
  const ROC = new Int32Array(m.w * m.h); let rocTour = 0, rocsVus = null;
  const marquerRocs = (rocs) => { rocsVus = rocs; rocTour++; for (const k of rocs) { const [x, y] = k.split(',').map(Number); ROC[y * W0 + x] = rocTour; } };
  // bras des tourniquets pour les registres en cours
  const ARM = new Int32Array(m.w * m.h); let armTour = 0, armR = null;
  const marquerBras = (R) => { armR = R; armTour++; for (const t of E.tourniquets) for (const [x, y] of bras(t, R)) ARM[y * W0 + x] = armTour; };
  // rayons qui barrent le passage (arène Fée) : cases du rayon pour les registres en cours
  const RAY = new Int32Array(m.w * m.h); let rayTour = 0, rayR = null;
  const bloqueRayon = !!m.planArene?.rayonBloque && E.lasers.length;
  const marquerRayons = (R) => { rayR = R; rayTour++; for (const r of rayons(m, R)) for (const [x, y] of r.cases) RAY[y * W0 + x] = rayTour; };
  const libre = (x, y, R, rocs, comb) => {
    if (x < 0 || y < 0 || x >= W0 || y >= m.h) return false;
    const i = y * W0 + x, n = NAT[i]; if (!n || PNJ[i]) return false;
    if (bloqueRayon) { if (R !== rayR) marquerRayons(R); if (RAY[i] === rayTour) return false; }
    if (rocs.size) { if (rocs !== rocsVus) marquerRocs(rocs); if (ROC[i] === rocTour) return false; }
    if (n === 1) return true;
    if (n === 2) return comb.has(k2(x, y));
    if (n === 3) return cond(portes.get(k2(x, y)).c, R, m);
    if (R !== armR) marquerBras(R);
    return ARM[i] !== armTour;
  };
  // effets d'arrivée sur une case (après un pas ou une glissade)
  const arrive = (x, y, R, rocs, comb, glisse) => {
    for (let n = 0; n < 60; n++) {
      const ob = m.objectAt(x, y);
      if (!ob) break;
      if (!glisse && (ob.type === 'glace' || ob.type === 'fleche')) {
        let d = ob.type === 'fleche' ? sensFleche(ob, R) : arrive.dir;
        for (let g = 0; g < 200; g++) {
          const o2 = m.objectAt(x, y); if (o2?.type === 'fleche') d = sensFleche(o2, R); else if (o2?.type !== 'glace') break;
          const [dx, dy] = DIRS[d]; if (!libre(x + dx, y + dy, R, rocs, comb)) break; x += dx; y += dy;
        }
        glisse = true; continue;
      }
      if (ob.type === 'tp' && !glisse) { [x, y] = ob.to; glisse = true; continue; }
      if (ob.type === 'canon' && !glisse) { const t = tirCanon(ob, R); if (t) { [x, y] = t.vers; R = t.R; glisse = true; continue; } break; }
      if (ob.type === 'chute') { [x, y] = ob.to; glisse = true; continue; }
      if (ob.type === 'reg' && ob.pas) R = agir(ob.a, R, m);
      break;
    }
    return [x, y, R];
  };
  const dep = o.depart || [m.exitX, m.exitY - 1];
  // états « normalisés » : on ne garde que la zone où le joueur circule librement (sans toucher à rien) ; les pas
  // libres n'y sont pas comptés, seuls les coups (pousser, actionner, glisser, se téléporter) font changer d'état.
  const W = m.w, OB = new Array(m.w * m.h).fill(null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) OB[y * W + x] = m.objectAt(x, y) || null;
  const obj = (x, y) => (m.in(x, y) ? OB[y * W + x] : null);
  const marque = new Int32Array(m.w * m.h), marque2 = new Int32Array(m.w * m.h); let tour = 0;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], DN = ['up', 'right', 'down', 'left'];
  const FRAG = new Uint8Array(m.w * m.h); for (const k of fragDep.keys()) { const [x, y] = k.split(',').map(Number); FRAG[y * W + x] = 1; }
  // cases d'où l'on peut actionner quelque chose (levier, miroir, pupitre…)
  const USE = new Array(m.w * m.h).fill(null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) for (let d = 0; d < 4; d++) {
    const ob = obj(x + DX[d], y + DY[d]); if (ob && ((ob.type === 'reg' && ob.actionne) || ob.type === 'remise')) (USE[y * W + x] ||= []).push(ob);
  }
  const plaine = (x, y, R, rocs, comb) => !OB[y * W + x] && !FRAG[y * W + x] && libre(x, y, R, rocs, comb);
  /** zone de libre circulation depuis (x, y) : indices des cases, marquées « tour » dans mk */
  const zone = (x, y, R, rocs, comb, mk = marque) => {
    const t = ++tour, z = [y * W + x]; mk[z[0]] = t;
    for (let i = 0; i < z.length; i++) {
      const cx = z[i] % W, cy = (z[i] - cx) / W;
      for (let d = 0; d < 4; d++) {
        const a = cx + DX[d], b = cy + DY[d];
        if (a < 0 || b < 0 || a >= W || b >= m.h) continue;
        const j = b * W + a; if (mk[j] === t || !NAT[j]) continue;
        if (plaine(a, b, R, rocs, comb)) { mk[j] = t; z.push(j); }
      }
    }
    return z;
  };
  const env = (R, rocs, comb) => `${R.join(',')}|${[...rocs].sort().join(';')}|${[...comb].sort().join(';')}`;
  const canon = (x, y, R, rocs, comb) => {
    if (OB[y * W + x]) return 'o' + (y * W + x);
    const z = zone(x, y, R, rocs, comb, marque2); let best = z[0];
    for (const q of z) if (q < best) best = q;
    return String(best);
  };
  const s0 = [dep[0], dep[1], regs0, new Set(roc0), new Set()];
  const vus = new Map(), file = [], succ = new Map();
  let coup = null;   // le coup qui mène à l'état ajouté : [x, y, sens | 'A'] (pour rejouer la solution dans le jeu)
  const enfile = (s, prev, act, ek = env(s[2], s[3], s[4])) => {
    const k = canon(s[0], s[1], s[2], s[3], s[4]) + '|' + ek;
    if (!vus.has(k)) { const p = prev ? vus.get(prev) : null; vus.set(k, { s, ek, prev, coup, pas: p ? p.pas + 1 : 0, act: p ? p.act + act : 0, dep: false }); file.push(k); }
    return k;
  };
  enfile(s0, null, 0);
  let arrivee = null;
  for (let fi = 0; fi < file.length; fi++) {
    const ks = file[fi], info = vus.get(ks), [x0, y0, R, rocs, comb] = info.s, suivants = [], tente = new Set();
    const z = zone(x0, y0, R, rocs, comb), tz = tour, idep = dep[1] * W + dep[0];
    for (const i of z) { if (i === idep) info.dep = true; if (!arrivee && o.but?.(i % W, (i - (i % W)) / W)) arrivee = ks; }
    const ajoute = (n, act) => suivants.push(enfile(n, ks, act, n[2] === R && n[3] === rocs && n[4] === comb ? info.ek : undefined));
    const dep0 = OB[y0 * W + x0] ? y0 * W + x0 : -1;   // on peut remarcher sur la case d'où l'on part
    for (const iz of z) {
      const x = iz % W, y = (iz - x) / W;
      for (let di = 0; di < 4; di++) {
        const nx = x + DX[di], ny = y + DY[di], d = DN[di], dx = DX[di], dy = DY[di];
        coup = [x, y, d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue;
        const ni = ny * W + nx;
        if (!NAT[ni] || (marque[ni] === tz && ni !== dep0)) continue;
        const kn = k2(nx, ny);
        // pousser un rocher (dans une fosse : il la comble)
        if (rocs.has(kn)) {
          const bx = nx + dx, by = ny + dy, kb = k2(bx, by);
          if (fosses.has(kb) && !comb.has(kb) && !npcs.has(kb)) { const r2 = new Set(rocs); r2.delete(kn); const c2 = new Set(comb); c2.add(kb); ajoute([nx, ny, R, r2, c2], 1); }
          else if (libre(bx, by, R, rocs, comb) && !m.objectAt(bx, by)) { const r2 = new Set(rocs); r2.delete(kn); r2.add(kb); ajoute([nx, ny, R, r2, comb], 1); }
          continue;
        }
        // pousser un bras de tourniquet
        if (NAT[ni] === 4 && !libre(nx, ny, R, new Set(), comb)) { const R2 = pousserTourniquet(m, R, x, y, d, (a, b) => npcs.has(k2(a, b))); if (R2) ajoute([nx, ny, R2, rocs, comb], 1); continue; }
        const ob = obj(nx, ny), kt = ob?.type === 'glace' ? kn + d : kn;
        if (tente.has(kt)) continue;
        tente.add(kt);
        if (!libre(nx, ny, R, rocs, comb)) continue;
        // salle aux dalles fragiles : on la traverse d'un coup si un chemin passe une fois partout
        if (fragDep.has(kn)) {
          const f = E.fragiles[fragDep.get(kn)], ch = cheminFragile(f.cases, f.entree, f.fins || f.cases);
          if (ch && !R[f.r]) { const R2 = R.slice(); R2[f.r] = 1; const [ex, ey] = ch[ch.length - 1]; ajoute([ex, ey, R2, rocs, comb], 1); }
          if (!R[f.r]) continue;   // salle pas encore réussie : on ne fait qu'y entrer d'un coup ; réussie, ses dalles tiennent
        }
        arrive.dir = d;
        const [ax, ay, R2] = arrive(nx, ny, R, rocs, comb, false);
        ajoute([ax, ay, R2, rocs, comb], R2 !== R && R2.join() !== R.join() ? 1 : 0);
      }
      // interagir avec ce qui est autour (leviers, statues, miroirs, coffres)
      for (const ob of USE[iz] || []) {
        coup = [x, y, 'A', ob.x ?? null, ob.y ?? null];
        if (ob.type === 'reg') {
          const R2 = agir(ob.a, R, m); if (R2.join() === R.join()) continue;
          if (bloqueRayon) { marquerRayons(R2); if (RAY[iz] === rayTour) continue; }   // le rayon ne passe pas à travers le joueur
          ajoute([x, y, R2, rocs, comb], 1);
        }
        else ajoute(s0, 0);   // le pupitre remet l'arène comme au début (joueur à l'entrée)
      }
    }
    succ.set(ks, suivants);
  }
  // états d'où l'on peut encore ressortir (remonter depuis les états dont la zone touche la sortie)
  const pred = new Map(); for (const [a, L2] of succ) for (const b of L2) (pred.get(b) || pred.set(b, []).get(b)).push(a);
  const peut = new Set([...vus.keys()].filter((k) => vus.get(k).dep)), f2 = [...peut];
  while (f2.length) { const k = f2.pop(); for (const p of pred.get(k) || []) if (!peut.has(p)) { peut.add(p); f2.push(p); } }
  const coinces = [...vus.keys()].filter((k) => !peut.has(k));
  let chemin = null;
  let coups = null;
  if (arrivee) { chemin = []; coups = []; for (let k = arrivee; k; k = vus.get(k).prev) { chemin.push(vus.get(k).s); coups.push(vus.get(k).coup); } chemin.reverse(); coups.reverse(); }
  return { coups, etats: vus.size, ok: !!arrivee, pas: arrivee ? vus.get(arrivee).pas : null, actions: arrivee ? vus.get(arrivee).act : null, chemin, coinces, retour: arrivee ? peut.has(arrivee) : false };
}
