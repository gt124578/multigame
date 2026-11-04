// odyssee/js/core/arcade.js — les bornes d'arcade de la salle de jeux du Casino de Métropole (moteurs sans DOM,
// testés par tools/test-odyssee-arcade.mjs). Quatre classiques : Tétra-Chute (des pièces de quatre carrés qui tombent),
// Invasion (des vagues d'envahisseurs, des abris qui s'effritent), Casse-Briques et Abo le Serpent.
// Tout se joue sur un écran de borne de 168 × 176 pixels ; chaque moteur avance par pas de temps (dt en secondes)
// avec une graine aléatoire à lui.
import { rng } from './casino.js';

export const ECRAN = { w: 168, h: 176 };

/** les bornes : nom affiché, couleurs du meuble, jetons gagnés selon le score */
export const JEUX = {
  tetris: { nom: 'TÉTRA-CHUTE', court: 'Tétra-Chute', couleurs: ['#3a5ad8', '#78a0ff', '#1c2a6a'], par: 1500, max: 30,
    aide: ['← → : déplacer', '↑ ou F : tourner', '↓ : descendre vite', 'Espace : lâcher'] },
  invaders: { nom: 'INVASION', court: 'Invasion', couleurs: ['#2a9a4a', '#7ae08a', '#0e3a1c'], par: 600, max: 30,
    aide: ['← → : déplacer le canon', 'F ou Espace : tirer', 'Les abris s\'effritent !'] },
  briques: { nom: 'CASSE-BRIQUES', court: 'Casse-Briques', couleurs: ['#d84a3a', '#ffa078', '#5a1a14'], par: 250, max: 30,
    aide: ['← → : déplacer la raquette', 'F ou Espace : lancer la balle'] },
  serpent: { nom: 'ABO LE SERPENT', court: 'Abo le Serpent', couleurs: ['#a050c8', '#e0a0ff', '#3a1450'], par: 60, max: 30,
    aide: ['Flèches : tourner', 'Mange les Baies,', 'évite ta queue et les murs'] },
};
/** jetons gagnés pour un score (un jeton tous les « par » points, plafonné) */
export const recompense = (jeu, score) => Math.min(JEUX[jeu].max, Math.floor(score / JEUX[jeu].par));
/** range un score dans le tableau des cinq meilleurs ; renvoie son rang (0 = record) ou -1 */
export function classer(scores, score) {
  if (score <= 0) return -1;
  scores.push(score); scores.sort((a, b) => b - a);
  const rang = scores.indexOf(score);
  scores.length = Math.min(scores.length, 5);
  return rang < 5 ? rang : -1;
}

/* =============================== TÉTRA-CHUTE =============================== */
// pièces dans leur boîte (4 × 4 pour la barre et le carré, 3 × 3 pour les autres), couleur = numéro (1 à 7)
export const PIECES = {
  I: { n: 4, c: 1, cases: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, c: 2, cases: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, c: 3, cases: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, c: 4, cases: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, c: 5, cases: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, c: 6, cases: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, c: 7, cases: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};
const ORDRE = Object.keys(PIECES);
/** cases d'une pièce après rot quarts de tour dans le sens des aiguilles d'une montre */
export function cellules(k, rot) {
  const P = PIECES[k]; let cs = P.cases.map((c) => c.slice());
  if (k === 'O') return cs;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cs = cs.map(([x, y]) => [P.n - 1 - y, x]);
  return cs;
}
const POINTS_LIGNES = [0, 100, 300, 500, 800];
/** secondes par ligne de chute selon le niveau */
export const vitesseTetris = (niveau) => Math.max(0.05, 0.8 * Math.pow(0.82, niveau - 1));
export function tetrisNouveau(graine = 1, niveau = 1) {
  const t = { w: 10, h: 20, grille: new Array(200).fill(0), r: rng(graine), sac: [], piece: null, suivante: null, score: 0, lignes: 0, niveau, depart: niveau,
    fini: false, tChute: 0, tPose: 0, reprises: 0, effaces: [], tEfface: 0, pieces: 0 };
  t.suivante = tirerPiece(t); nouvellePiece(t);
  return t;
}
function tirerPiece(t) { if (!t.sac.length) { t.sac = ORDRE.slice(); for (let i = 6; i > 0; i--) { const j = Math.floor(t.r() * (i + 1)); [t.sac[i], t.sac[j]] = [t.sac[j], t.sac[i]]; } } return t.sac.pop(); }
function nouvellePiece(t) {
  const k = t.suivante; t.suivante = tirerPiece(t);
  t.piece = { k, rot: 0, x: k === 'O' ? 3 : 3, y: k === 'I' ? -1 : 0 };
  t.tChute = 0; t.tPose = 0; t.reprises = 0; t.pieces++;
  if (!tetrisPeut(t, k, 0, t.piece.x, t.piece.y)) t.fini = true;
}
/** la pièce k tient-elle à cet endroit ? (au-dessus du haut de la grille, c'est permis) */
export function tetrisPeut(t, k, rot, x, y) {
  for (const [cx, cy] of cellules(k, rot)) {
    const gx = x + cx, gy = y + cy;
    if (gx < 0 || gx >= t.w || gy >= t.h) return false;
    if (gy >= 0 && t.grille[gy * t.w + gx]) return false;
  }
  return true;
}
const bougee = (t) => { if (t.tPose > 0 && t.reprises < 15) { t.tPose = 0; t.reprises++; } };
export function tetrisBouger(t, dx) {
  const p = t.piece; if (t.fini || !p) return false;
  if (!tetrisPeut(t, p.k, p.rot, p.x + dx, p.y)) return false;
  p.x += dx; bougee(t); return true;
}
/** rotation avec petits décalages si la pièce touche un mur ou le tas */
export function tetrisTourner(t, sens = 1) {
  const p = t.piece; if (t.fini || !p || p.k === 'O') return false;
  const rot = (p.rot + sens + 4) % 4;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [1, -1], [-1, -1]]) {
    if (tetrisPeut(t, p.k, rot, p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; p.rot = rot; bougee(t); return true; }
  }
  return false;
}
/** une ligne plus bas (appui sur bas : 1 point) ; si la pièce est posée, elle se fixe */
export function tetrisDescendre(t, manuel = false) {
  const p = t.piece; if (t.fini || !p) return false;
  if (tetrisPeut(t, p.k, p.rot, p.x, p.y + 1)) { p.y++; if (manuel) t.score += 1; t.tChute = 0; return true; }
  return false;
}
/** chute directe (2 points par ligne) */
export function tetrisLacher(t) {
  const p = t.piece; if (t.fini || !p) return 0;
  let n = 0; while (tetrisPeut(t, p.k, p.rot, p.x, p.y + 1)) { p.y++; n++; }
  t.score += 2 * n; poser(t); return n;
}
/** où la pièce tomberait (ombre) */
export function tetrisFantome(t) { const p = t.piece; let y = p.y; while (tetrisPeut(t, p.k, p.rot, p.x, y + 1)) y++; return y; }
function poser(t) {
  const p = t.piece; let dehors = false;
  for (const [cx, cy] of cellules(p.k, p.rot)) { const gx = p.x + cx, gy = p.y + cy; if (gy < 0) { dehors = true; continue; } t.grille[gy * t.w + gx] = PIECES[p.k].c; }
  t.piece = null;
  if (dehors) { t.fini = true; return; }
  const pleines = []; for (let y = 0; y < t.h; y++) { let n = 0; for (let x = 0; x < t.w; x++) if (t.grille[y * t.w + x]) n++; if (n === t.w) pleines.push(y); }
  if (pleines.length) { t.effaces = pleines; t.tEfface = 0.3; }   // les lignes clignotent avant de partir
  else nouvellePiece(t);
}
/** retire les lignes pleines (après leur clignotement) et compte les points */
export function effacerLignes(t, lignes = t.effaces) {
  const n = lignes.length; if (!n) return 0;
  const set = new Set(lignes), garde = [];
  for (let y = 0; y < t.h; y++) if (!set.has(y)) garde.push(t.grille.slice(y * t.w, (y + 1) * t.w));
  const vides = Array.from({ length: n }, () => new Array(t.w).fill(0));
  t.grille = [...vides, ...garde].flat();
  t.score += POINTS_LIGNES[Math.min(4, n)] * t.niveau;
  t.lignes += n; t.niveau = Math.max(t.depart, 1 + Math.floor(t.lignes / 10));
  t.effaces = []; t.tEfface = 0;
  return n;
}
/** avance le jeu ; touches : { bas } maintenu (les autres touches passent par bouger / tourner / lâcher) */
export function tetrisPas(t, dt, touches = {}) {
  if (t.fini) return;
  if (t.effaces.length) { t.tEfface -= dt; if (t.tEfface <= 0) { effacerLignes(t); nouvellePiece(t); } return; }
  const p = t.piece; if (!p) return;
  const inter = touches.bas ? Math.min(0.035, vitesseTetris(t.niveau)) : vitesseTetris(t.niveau);
  if (tetrisPeut(t, p.k, p.rot, p.x, p.y + 1)) {
    t.tPose = 0; t.tChute += dt;
    while (t.tChute >= inter && tetrisPeut(t, p.k, p.rot, p.x, p.y + 1)) { t.tChute -= inter; p.y++; if (touches.bas) t.score += 1; }
  } else {
    t.tPose += dt; t.tChute = 0;
    if (t.tPose >= 0.5) poser(t);
  }
}

/* =============================== INVASION =============================== */
// envahisseurs 8 × 8 en 5 rangs de 11, abris de 22 × 14 qui s'effritent pixel par pixel
export const ABRI = { w: 22, h: 14 };
const FORME_ABRI = [
  '....##############....',
  '...################...',
  '..##################..',
  '.####################.',
  '######################',
  '######################',
  '######################',
  '######################',
  '######################',
  '######################',
  '#######........#######',
  '######..........######',
  '#####............#####',
  '#####............#####',
];
export const POINTS_ALIEN = [30, 20, 20, 10, 10];
export function invadersNouveau(graine = 1) {
  const s = { w: ECRAN.w, h: ECRAN.h, r: rng(graine), score: 0, vague: 0, fini: false, vies: 3, joueur: { x: 78, y: ECRAN.h - 18, mort: 0 },
    aliens: [], dir: 1, tPas: 0, pas: 0, tirJ: null, tirsA: [], tTirA: 1, ovni: null, tOvni: 14, abris: [], explosions: [], tVague: 0, evenements: [] };
  nouvelleVague(s);
  return s;
}
function nouvelleVague(s) {
  s.vague++;
  const y0 = 26 + Math.min(5, s.vague - 1) * 5;
  s.aliens = [];
  for (let l = 0; l < 5; l++) for (let c = 0; c < 11; c++) s.aliens.push({ x: 18 + c * 12, y: y0 + l * 11, type: l === 0 ? 0 : l < 3 ? 1 : 2, l, c, vivant: true });
  s.dir = 1; s.tPas = 0; s.tirsA = []; s.tirJ = null;
  s.abris = [0, 1, 2, 3].map((k) => ({ x: 14 + k * 38, y: ECRAN.h - 46, bits: FORME_ABRI.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0))) }));
}
const vivants = (s) => s.aliens.filter((a) => a.vivant);
/** intervalle entre deux pas de la formation : plus il en reste, plus elle est lente */
export const intervalleInvaders = (s) => Math.max(0.025, (0.03 + 0.55 * vivants(s).length / 55) * Math.pow(0.9, s.vague - 1));
/** le pixel (x, y) touche-t-il un abri ? si oui, l'abri s'effrite autour (rayon r) */
export function abriTouche(s, x, y, rayon = 2) {
  for (const A of s.abris) {
    const lx = Math.floor(x - A.x), ly = Math.floor(y - A.y);
    if (lx < 0 || ly < 0 || lx >= ABRI.w || ly >= ABRI.h || !A.bits[ly][lx]) continue;
    for (let dy = -rayon; dy <= rayon; dy++) for (let dx = -rayon; dx <= rayon; dx++) {
      if (dx * dx + dy * dy > rayon * rayon + 1 || s.r() < 0.25) continue;
      const bx = lx + dx, by = ly + dy; if (bx >= 0 && by >= 0 && bx < ABRI.w && by < ABRI.h) A.bits[by][bx] = 0;
    }
    A.bits[ly][lx] = 0;
    return true;
  }
  return false;
}
const dans = (x, y, a, w = 8, h = 8) => x >= a.x - 1 && x <= a.x + w && y >= a.y && y <= a.y + h;
export function invadersPas(s, dt, touches = {}) {
  s.evenements = [];
  if (s.fini) return;
  for (const e of s.explosions) e.t -= dt; s.explosions = s.explosions.filter((e) => e.t > 0);
  if (s.tVague > 0) { s.tVague -= dt; if (s.tVague <= 0) nouvelleVague(s); return; }
  const J = s.joueur;
  // le canon
  if (J.mort > 0) { J.mort -= dt; if (J.mort <= 0) { if (s.vies <= 0) { s.fini = true; return; } J.x = 78; } }
  else {
    if (touches.gauche) J.x = Math.max(6, J.x - 72 * dt);
    if (touches.droite) J.x = Math.min(s.w - 17, J.x + 72 * dt);
    if (touches.tir && !s.tirJ) { s.tirJ = { x: J.x + 5, y: J.y - 3 }; s.evenements.push('tir'); }
  }
  // la formation avance par à-coups ; au bord, elle descend et repart dans l'autre sens
  s.tPas += dt;
  const inter = intervalleInvaders(s);
  while (s.tPas >= inter) {
    s.tPas -= inter; s.pas++;
    const V = vivants(s); if (!V.length) break;
    const minX = Math.min(...V.map((a) => a.x)), maxX = Math.max(...V.map((a) => a.x));
    if ((s.dir > 0 && maxX + 2 > s.w - 12) || (s.dir < 0 && minX - 2 < 4)) { for (const a of V) a.y += 6; s.dir = -s.dir; }
    else for (const a of V) a.x += 2 * s.dir;
    s.evenements.push('pas');
    // en descendant, les envahisseurs rongent les abris
    for (const a of V) for (let dx = 0; dx < 8; dx += 2) for (let dy = 0; dy < 8; dy += 3) abriTouche(s, a.x + dx, a.y + dy, 1);
    if (V.some((a) => a.y + 8 >= J.y)) { s.fini = true; s.vies = 0; s.evenements.push('perdu'); return; }
  }
  // tir du joueur
  if (s.tirJ) {
    const T = s.tirJ; let fin = false;
    for (let k = 0; k < 4 && !fin; k++) {   // sous-pas : le tir est rapide (180 px/s)
      T.y -= 45 * dt;
      if (T.y < 10) { fin = true; break; }
      const a = s.aliens.find((q) => q.vivant && dans(T.x, T.y, q));
      if (a) { a.vivant = false; s.score += POINTS_ALIEN[a.l]; s.explosions.push({ x: a.x, y: a.y, t: 0.25 }); s.evenements.push('touche'); fin = true; break; }
      if (s.ovni && T.x >= s.ovni.x && T.x <= s.ovni.x + 16 && T.y >= 10 && T.y <= 18) { const pts = [50, 100, 150, 300][Math.floor(s.r() * 4)]; s.score += pts; s.explosions.push({ x: s.ovni.x, y: 11, t: 0.6, pts }); s.ovni = null; s.evenements.push('ovni'); fin = true; break; }
      if (abriTouche(s, T.x, T.y)) { fin = true; break; }
      const b = s.tirsA.findIndex((q) => Math.abs(q.x - T.x) <= 2 && Math.abs(q.y - T.y) <= 4);
      if (b >= 0) { s.tirsA.splice(b, 1); fin = true; break; }
    }
    if (fin) s.tirJ = null;
  }
  // tirs des envahisseurs : un des plus bas d'une colonne au hasard (plus souvent au-dessus du canon)
  s.tTirA -= dt;
  const V = vivants(s);
  if (s.tTirA <= 0 && V.length && s.tirsA.length < 3 && J.mort <= 0) {
    const bas = new Map(); for (const a of V) if (!bas.has(a.c) || bas.get(a.c).y < a.y) bas.set(a.c, a);
    const cands = [...bas.values()];
    const vise = s.r() < 0.4 ? cands.reduce((m, a) => (Math.abs(a.x + 4 - J.x - 5) < Math.abs(m.x + 4 - J.x - 5) ? a : m)) : cands[Math.floor(s.r() * cands.length)];
    s.tirsA.push({ x: vise.x + 4, y: vise.y + 8, f: Math.floor(s.r() * 2) });
    s.tTirA = (0.5 + s.r() * 0.9) * Math.max(0.45, 1 - s.vague * 0.08);
  }
  for (const T of s.tirsA) {
    T.y += 62 * dt;
    if (T.y > s.h - 8) { T.mort = true; continue; }
    if (abriTouche(s, T.x, T.y + 3)) { T.mort = true; continue; }
    if (J.mort <= 0 && T.x >= J.x && T.x <= J.x + 11 && T.y + 3 >= J.y && T.y <= J.y + 6) {
      T.mort = true; s.vies--; J.mort = 1.4; s.explosions.push({ x: J.x, y: J.y, t: 1.2, joueur: true }); s.evenements.push('mort'); s.tirsA.forEach((q) => { q.mort = true; });
    }
  }
  s.tirsA = s.tirsA.filter((T) => !T.mort);
  // la soucoupe passe de temps en temps
  s.tOvni -= dt;
  if (!s.ovni && s.tOvni <= 0) { const d = s.r() < 0.5 ? 1 : -1; s.ovni = { x: d > 0 ? -16 : s.w, dir: d }; s.tOvni = 18 + s.r() * 10; }
  if (s.ovni) { s.ovni.x += s.ovni.dir * 34 * dt; if (s.ovni.x < -20 || s.ovni.x > s.w + 4) s.ovni = null; }
  if (!vivants(s).length) { s.tVague = 1.5; s.evenements.push('vague'); }
}

/* =============================== CASSE-BRIQUES =============================== */
export const BRIQUES = { cols: 10, rangs: 6, w: 15, h: 6, x0: 4, y0: 30 };
const POINTS_BRIQUE = [7, 7, 5, 5, 3, 1];
export function briquesNouveau(graine = 1) {
  const b = { w: ECRAN.w, h: ECRAN.h, r: rng(graine), score: 0, vies: 3, niveau: 0, fini: false, raquette: { x: 72, y: ECRAN.h - 16, w: 24 }, balle: null, briques: [], evenements: [], touches: 0 };
  niveauBriques(b);
  return b;
}
function niveauBriques(b) {
  b.niveau++;
  const B = BRIQUES; b.briques = [];
  for (let l = 0; l < B.rangs; l++) for (let c = 0; c < B.cols; c++) {
    // niveaux suivants : quelques trous, et des briques solides (deux coups) en haut
    if (b.niveau > 1 && (c + l + b.niveau) % 7 === 0) continue;
    b.briques.push({ x: B.x0 + c * (B.w + 1), y: B.y0 + l * (B.h + 1), l, vie: b.niveau > 2 && l < 2 ? 2 : 1 });
  }
  servir(b);
}
function servir(b) { b.balle = { x: b.raquette.x + b.raquette.w / 2 - 1, y: b.raquette.y - 3, vx: 0, vy: 0, colle: true, v: 85 + b.niveau * 8 }; b.touches = 0; }
const rebondRaquette = (b, B) => {
  const R = b.raquette, pos = Math.max(-1, Math.min(1, ((B.x + 1.5) - (R.x + R.w / 2)) / (R.w / 2)));
  const ang = pos * 1.05; B.v = Math.min(160, B.v + 2);
  B.vx = Math.sin(ang) * B.v; B.vy = -Math.abs(Math.cos(ang) * B.v); B.y = R.y - 3;
};
export function briquesPas(b, dt, touches = {}) {
  b.evenements = [];
  if (b.fini) return;
  const R = b.raquette, B = b.balle;
  if (touches.gauche) R.x = Math.max(4, R.x - 130 * dt);
  if (touches.droite) R.x = Math.min(b.w - 4 - R.w, R.x + 130 * dt);
  if (B.colle) { B.x = R.x + R.w / 2 - 1; B.y = R.y - 3; if (touches.tir) { B.colle = false; const a = (b.r() - 0.5) * 0.8; B.vx = Math.sin(a) * B.v; B.vy = -Math.cos(a) * B.v; b.evenements.push('lancer'); } return; }
  // sous-pas pour ne jamais traverser une brique
  const n = Math.ceil(Math.max(Math.abs(B.vx), Math.abs(B.vy)) * dt / 2);
  for (let k = 0; k < n; k++) {
    const sx = B.vx * dt / n, sy = B.vy * dt / n;
    B.x += sx;
    if (B.x < 4) { B.x = 4; B.vx = Math.abs(B.vx); b.evenements.push('mur'); }
    if (B.x > b.w - 7) { B.x = b.w - 7; B.vx = -Math.abs(B.vx); b.evenements.push('mur'); }
    let br = toucheBrique(b, B); if (br) { B.x -= sx; B.vx = -B.vx; casser(b, br); }
    B.y += sy;
    if (B.y < 16) { B.y = 16; B.vy = Math.abs(B.vy); b.evenements.push('mur'); }
    br = toucheBrique(b, B); if (br) { B.y -= sy; B.vy = -B.vy; casser(b, br); }
    if (B.vy > 0 && B.y + 3 >= R.y && B.y + 3 <= R.y + 4 && B.x + 3 >= R.x && B.x <= R.x + R.w) { rebondRaquette(b, B); b.evenements.push('raquette'); }
    if (B.y > b.h) { b.vies--; b.evenements.push('perdu'); if (b.vies <= 0) { b.fini = true; return; } servir(b); return; }
  }
  if (!b.briques.length) { b.evenements.push('niveau'); niveauBriques(b); }
}
function toucheBrique(b, B) { return b.briques.find((q) => B.x + 3 > q.x && B.x < q.x + BRIQUES.w && B.y + 3 > q.y && B.y < q.y + BRIQUES.h); }
function casser(b, q) {
  q.vie--; b.evenements.push(q.vie > 0 ? 'dur' : 'brique');
  if (q.vie > 0) return;
  b.briques.splice(b.briques.indexOf(q), 1); b.score += POINTS_BRIQUE[q.l] * b.niveau;
  b.touches++; if (b.touches % 6 === 0) b.balle.v = Math.min(160, b.balle.v + 6);
}

/* =============================== ABO LE SERPENT =============================== */
export const GRILLE_SERPENT = { cols: 21, rangs: 20, y0: 16 };
const DIRS = { haut: [0, -1], bas: [0, 1], gauche: [-1, 0], droite: [1, 0] };
export function serpentNouveau(graine = 1) {
  const s = { r: rng(graine), corps: [[10, 10], [9, 10], [8, 10], [7, 10]], dir: 'droite', file: [], tPas: 0, inter: 0.15, score: 0, baies: 0, fini: false, baie: null, bonus: null, grandir: 0, evenements: [] };
  s.baie = caseLibre(s);
  return s;
}
function caseLibre(s) {
  const G = GRILLE_SERPENT, pris = new Set(s.corps.map(([x, y]) => x + ',' + y));
  if (s.baie) pris.add(s.baie.join()); if (s.bonus) pris.add(s.bonus.x + ',' + s.bonus.y);
  for (let k = 0; k < 500; k++) { const x = Math.floor(s.r() * G.cols), y = Math.floor(s.r() * G.rangs); if (!pris.has(x + ',' + y)) return [x, y]; }
  return null;
}
/** demande un virage (gardé en file : deux au plus, jamais de demi-tour) */
export function serpentTourner(s, d) {
  const der = s.file.length ? s.file[s.file.length - 1] : s.dir;
  if (d === der || (DIRS[d][0] === -DIRS[der][0] && DIRS[d][1] === -DIRS[der][1])) return false;
  if (s.file.length < 2) s.file.push(d);
  return true;
}
export function serpentPas(s, dt) {
  s.evenements = [];
  if (s.fini) return;
  if (s.bonus) { s.bonus.t -= dt; if (s.bonus.t <= 0) s.bonus = null; }
  s.tPas += dt;
  while (s.tPas >= s.inter && !s.fini) { s.tPas -= s.inter; avancerSerpent(s); }
}
function avancerSerpent(s) {
  const G = GRILLE_SERPENT;
  if (s.file.length) s.dir = s.file.shift();
  const [dx, dy] = DIRS[s.dir], [hx, hy] = s.corps[0], tete = [hx + dx, hy + dy];
  const queue = s.grandir > 0 ? null : s.corps[s.corps.length - 1];
  if (tete[0] < 0 || tete[1] < 0 || tete[0] >= G.cols || tete[1] >= G.rangs || s.corps.some(([x, y]) => x === tete[0] && y === tete[1] && !(queue && x === queue[0] && y === queue[1]))) { s.fini = true; s.evenements.push('perdu'); return; }
  s.corps.unshift(tete);
  if (s.grandir > 0) s.grandir--; else s.corps.pop();
  if (s.baie && tete[0] === s.baie[0] && tete[1] === s.baie[1]) {
    s.baies++; s.score += 10; s.grandir += 2; s.inter = Math.max(0.06, s.inter - 0.004); s.evenements.push('baie');
    s.baie = caseLibre(s);
    if (s.baies % 5 === 0 && !s.bonus) { const c = caseLibre(s); if (c) s.bonus = { x: c[0], y: c[1], t: 6 }; }
  }
  if (s.bonus && tete[0] === s.bonus.x && tete[1] === s.bonus.y) { s.score += 50; s.grandir += 3; s.bonus = null; s.evenements.push('bonus'); }
}
