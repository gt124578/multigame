// odyssee/js/core/holdem.js — le poker Texas Hold'em du Casino de Métropole (moteur sans DOM, testé par
// tools/test-odyssee-casino.mjs). Deux cartes en main, cinq cartes communes (flop, turn, river), quatre tours
// d'enchères sans limite, blindes, tapis et pots annexes, abattage avec la meilleure main de cinq cartes parmi sept.
// L'ordinateur estime sa chance de gagner (tirages au hasard, avec sa propre graine), la compare aux cotes du pot,
// et bluffe un peu selon son caractère.
import { jeu52, melanger } from './casino.js';

export const CATEGORIES = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
export const ETAPES = ['preflop', 'flop', 'turn', 'river'];
export const NOM_ETAPE = { preflop: 'Avant le flop', flop: 'Flop', turn: 'Turn', river: 'River', abattage: 'Abattage' };

/* ======================= ÉVALUATION D'UNE MAIN (5 à 7 cartes) ======================= */
// score numérique : catégorie × 16⁵ + cinq départages de 4 bits (comparaison directe, sans tableau)
const pack = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) => ((((cat * 16 + a) * 16 + b) * 16 + c) * 16 + d) * 16 + e;
/** plus haute quinte dans un masque de rangs (bit r pour le rang r, as aussi en bit 1) ; 0 sinon */
function quinte(mask) {
  if (mask & (1 << 14)) mask |= 2;
  for (let h = 14; h >= 5; h--) { const m = 0x1f << (h - 4); if ((mask & m) === m) return h; }
  return 0;
}
/** score de la meilleure main de cinq cartes parmi 5 à 7 cartes */
export function score(cartes) {
  const cnt = new Array(15).fill(0), coul = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 }, mcoul = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
  let mask = 0;
  for (const c of cartes) { cnt[c.r]++; coul[c.s]++; mcoul[c.s] |= 1 << c.r; mask |= 1 << c.r; }
  // couleur (et quinte flush)
  let fl = null; for (const s in coul) if (coul[s] >= 5) fl = s;
  if (fl) { const q = quinte(mcoul[fl]); if (q) return pack(8, q); }
  // groupes : carrés, brelans, paires, cartes seules (du plus haut rang au plus bas)
  const quads = [], trips = [], paires = [], seules = [];
  for (let r = 14; r >= 2; r--) { const n = cnt[r]; if (n === 4) quads.push(r); else if (n === 3) trips.push(r); else if (n === 2) paires.push(r); else if (n === 1) seules.push(r); }
  if (quads.length) { const k = Math.max(...[...trips, ...paires, ...seules, ...quads.slice(1)], 0); return pack(7, quads[0], k); }
  if (trips.length && (trips.length > 1 || paires.length)) { const p = Math.max(trips[1] || 0, paires[0] || 0); return pack(6, trips[0], p); }
  if (fl) { const rs = []; for (let r = 14; r >= 2 && rs.length < 5; r--) if (mcoul[fl] & (1 << r)) rs.push(r); return pack(5, ...rs); }
  const q = quinte(mask); if (q) return pack(4, q);
  if (trips.length) { const k = [...paires, ...seules].sort((a, b) => b - a); return pack(3, trips[0], k[0], k[1]); }
  if (paires.length >= 2) { const k = Math.max(paires[2] || 0, seules[0] || 0); return pack(2, paires[0], paires[1], k); }
  if (paires.length) return pack(1, paires[0], seules[0], seules[1], seules[2]);
  return pack(0, seules[0], seules[1], seules[2], seules[3], seules[4]);
}
export const categorie = (sc) => Math.floor(sc / 1048576);
export const nomScore = (sc) => CATEGORIES[categorie(sc)];
/** les cinq cartes qui font la main (pour les mettre en avant à l'abattage) */
export function meilleures5(cartes) {
  const n = cartes.length; if (n <= 5) return cartes.slice();
  let best = -1, b = null;
  const essai = (cinq) => { const s = score(cinq); if (s > best) { best = s; b = cinq; } };
  if (n === 6) for (let a = 0; a < 6; a++) essai(cartes.filter((_, i) => i !== a));
  else for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) essai(cartes.filter((_, i) => i !== a && i !== c));
  return b;
}

/* ======================= LA TABLE ======================= */
/**
 * joueurs : [{ nom, jetons, ia, style }] ; le joueur humain est en général à la place 0.
 * style (ordinateur) : { serre: 0..1 (joue peu de mains), agressif: 0..1 (relance plus qu'il ne suit), bluff: 0..1 }
 */
export function creerTable({ joueurs, petite = 1, grosse = 2, bouton = 0 }) {
  return {
    joueurs: joueurs.map((j) => ({ nom: j.nom, jetons: j.jetons, ia: !!j.ia, style: j.style || { serre: 0.5, agressif: 0.5, bluff: 0.05 }, main: [], mise: 0, engage: 0, couche: true, tapis: false, aParle: false, assis: j.jetons > 0 })),
    petite, grosse, bouton, board: [], paquet: [], etape: null, courant: -1, miseMax: 0, relanceMin: grosse, journal: [], fini: true, mains: 0, resultats: null,
  };
}
const N = (t) => t.joueurs.length;
/** prochaine place (après i) qui vérifie f */
function suivant(t, i, f) { for (let k = 1; k <= N(t); k++) { const j = (i + k) % N(t); if (f(t.joueurs[j], j)) return j; } return -1; }
const enJeu = (p) => p.assis && !p.couche;
const peutAgir = (p) => enJeu(p) && !p.tapis;
export const pot = (t) => t.joueurs.reduce((a, p) => a + p.engage, 0);
function payer(t, p, n) { n = Math.min(n, p.jetons); p.jetons -= n; p.mise += n; p.engage += n; if (p.jetons === 0) p.tapis = true; return n; }

/** une nouvelle main : le bouton avance, blindes, deux cartes chacun ; renvoie false s'il n'y a plus assez de joueurs */
export function nouvelleMain(t, r) {
  for (const p of t.joueurs) { p.assis = p.jetons > 0; p.main = []; p.mise = 0; p.engage = 0; p.couche = !p.assis; p.tapis = false; p.aParle = false; }
  const assis = t.joueurs.filter((p) => p.assis).length;
  if (assis < 2) { t.fini = true; return false; }
  if (t.mains > 0 || !t.joueurs[t.bouton].assis) t.bouton = suivant(t, t.bouton, (p) => p.assis);
  t.mains++;
  t.paquet = melanger(jeu52(), r); t.board = []; t.journal = []; t.resultats = null; t.fini = false; t.etape = 'preflop';
  // à deux, le bouton paie la petite blinde et parle le premier avant le flop
  const sb = assis === 2 ? t.bouton : suivant(t, t.bouton, (p) => p.assis), bb = suivant(t, sb, (p) => p.assis);
  t.sb = sb; t.bb = bb;
  payer(t, t.joueurs[sb], t.petite); payer(t, t.joueurs[bb], t.grosse);
  t.journal.push({ i: sb, type: 'blinde', montant: t.joueurs[sb].mise }, { i: bb, type: 'blinde', montant: t.joueurs[bb].mise });
  t.miseMax = Math.max(t.joueurs[sb].mise, t.joueurs[bb].mise, t.grosse); t.relanceMin = t.grosse;
  for (let k = 0; k < 2; k++) { let i = sb; for (let n = 0; n < assis; n++) { t.joueurs[i].main.push(t.paquet.pop()); i = suivant(t, i, (p) => p.assis); } }
  t.courant = suivant(t, bb, peutAgir);
  if (t.courant < 0 || !besoinDeParler(t)) finTour(t);
  return true;
}
/** reste-t-il quelqu'un qui doit parler dans ce tour ? */
function besoinDeParler(t) {
  const actifs = t.joueurs.filter(peutAgir), vivants = t.joueurs.filter(enJeu);
  if (vivants.length < 2) return false;
  if (actifs.length === 0) return false;
  // un seul joueur peut encore miser et il a déjà égalé : rien à jouer
  if (actifs.length === 1 && actifs[0].mise >= t.miseMax) return false;
  return actifs.some((p) => !p.aParle || p.mise < t.miseMax);
}

/** ce que le joueur qui a la parole peut faire */
export function actionsPossibles(t, i = t.courant) {
  const p = t.joueurs[i]; if (!p || t.fini || i !== t.courant) return null;
  const aSuivre = Math.max(0, t.miseMax - p.mise);
  const maxA = p.mise + p.jetons;
  // relancer : seulement s'il reste des jetons après avoir suivi, et si personne n'a encore égalé une relance complète
  // après que ce joueur a parlé (un tapis trop court ne rouvre pas les relances)
  const autres = t.joueurs.some((q, j) => j !== i && peutAgir(q));
  let relance = null;
  if (p.jetons > aSuivre && (!p.aParle || p.mise >= t.miseMax) && autres) {
    const minA = t.miseMax + t.relanceMin;
    relance = { min: Math.min(minA, maxA), max: maxA };
  }
  return { aSuivre, parole: aSuivre === 0, suivre: Math.min(aSuivre, p.jetons), relance, tapis: maxA };
}

/** joue une action : { type: 'coucher' | 'parole' | 'suivre' | 'relancer', montant (relancer : niveau total visé) } ;
 *  renvoie false (sans rien changer) si elle est interdite */
export function agir(t, a) {
  const i = t.courant, p = t.joueurs[i], A = actionsPossibles(t, i);
  if (!A || !a) return false;
  if (a.type === 'coucher') { p.couche = true; t.journal.push({ i, type: 'coucher' }); }
  else if (a.type === 'parole') { if (!A.parole) return false; t.journal.push({ i, type: 'parole' }); }
  else if (a.type === 'suivre') { if (A.parole) return false; payer(t, p, A.suivre); t.journal.push({ i, type: 'suivre', montant: A.suivre, tapis: p.tapis }); }
  else if (a.type === 'relancer') {
    if (!A.relance) return false;
    const vise = Math.round(a.montant);
    if (!(vise >= A.relance.min && vise <= A.relance.max)) return false;
    const ecart = vise - t.miseMax, ouverture = t.miseMax === 0;
    payer(t, p, vise - p.mise);
    if (ecart >= t.relanceMin) { t.relanceMin = ecart; for (const q of t.joueurs) if (q !== p) q.aParle = false; }   // relance complète : tout le monde reparle
    t.miseMax = Math.max(t.miseMax, vise);
    t.journal.push({ i, type: ouverture ? 'miser' : 'relancer', montant: vise, tapis: p.tapis });
  } else return false;
  p.aParle = true;
  avancer(t);
  return true;
}
function avancer(t) {
  if (t.joueurs.filter(enJeu).length === 1) { finir(t); return; }
  if (besoinDeParler(t)) { t.courant = suivant(t, t.courant, (p) => peutAgir(p) && (!p.aParle || p.mise < t.miseMax)); return; }
  finTour(t);
}
/** le tour d'enchères est fini : on ramasse les mises et on retourne les cartes suivantes (toutes si plus personne ne peut miser) */
function finTour(t) {
  for (;;) {
    for (const p of t.joueurs) { p.mise = 0; p.aParle = false; }
    t.miseMax = 0; t.relanceMin = t.grosse;
    if (t.joueurs.filter(enJeu).length < 2) { finir(t); return; }
    if (t.etape === 'river') { abattage(t); return; }
    t.paquet.pop();   // carte brûlée
    if (t.etape === 'preflop') { t.board.push(t.paquet.pop(), t.paquet.pop(), t.paquet.pop()); t.etape = 'flop'; }
    else { t.board.push(t.paquet.pop()); t.etape = t.etape === 'flop' ? 'turn' : 'river'; }
    t.courant = suivant(t, t.bouton, peutAgir);
    if (t.courant >= 0 && besoinDeParler(t)) return;
  }
}
/** tout le monde s'est couché sauf un : il ramasse le pot sans montrer ses cartes */
function finir(t) {
  const g = t.joueurs.findIndex(enJeu), total = pot(t);
  t.joueurs[g].jetons += total;
  t.resultats = { abattage: false, pots: [{ montant: total, gagnants: [g], score: null }], gains: t.joueurs.map((_, i) => (i === g ? total : 0)) };
  t.fini = true; t.etape = 'fini'; t.courant = -1;
}
/** découpe les mises en pot principal et pots annexes : [{ montant, eligibles }] */
export function calculerPots(t) {
  const niveaux = [...new Set(t.joueurs.filter((p) => p.engage > 0).map((p) => p.engage))].sort((a, b) => a - b);
  const pots = []; let prec = 0;
  for (const L of niveaux) {
    let montant = 0; for (const p of t.joueurs) montant += Math.max(0, Math.min(p.engage, L) - prec);
    const eligibles = t.joueurs.map((p, i) => (enJeu(p) && p.engage >= L ? i : -1)).filter((i) => i >= 0);
    if (eligibles.length) pots.push({ montant, eligibles });
    else if (pots.length) pots[pots.length - 1].montant += montant;   // reste d'un joueur couché : au dernier pot
    prec = L;
  }
  // deux pots aux mêmes joueurs : on les fusionne (affichage plus simple)
  const out = [];
  for (const p of pots) { const d = out[out.length - 1]; if (d && d.eligibles.join() === p.eligibles.join()) d.montant += p.montant; else out.push(p); }
  return out;
}
/** abattage : chaque pot va à la meilleure main parmi ceux qui y ont droit ; partage à égalité (jeton restant au premier après le bouton) */
export function abattage(t) {
  const scores = t.joueurs.map((p) => (enJeu(p) ? score([...p.main, ...t.board]) : -1));
  const gains = t.joueurs.map(() => 0), pots = [];
  for (const P of calculerPots(t)) {
    const best = Math.max(...P.eligibles.map((i) => scores[i]));
    const g = P.eligibles.filter((i) => scores[i] === best);
    const part = Math.floor(P.montant / g.length); let reste = P.montant - part * g.length;
    for (const i of g) gains[i] += part;
    for (let k = 1; reste > 0 && k <= N(t); k++) { const i = (t.bouton + k) % N(t); if (g.includes(i)) { gains[i]++; reste--; } }
    pots.push({ montant: P.montant, gagnants: g, score: best });
  }
  t.joueurs.forEach((p, i) => { p.jetons += gains[i]; });
  t.resultats = { abattage: true, pots, gains, scores };
  t.fini = true; t.etape = 'abattage'; t.courant = -1;
}

/* ======================= L'ORDINATEUR ======================= */
/** chance de gagner (égalités comptées à moitié) contre n adversaires aux cartes inconnues, par tirages au hasard */
export function equite(main, board, n, r, tirages = 160) {
  if (n <= 0) return 1;
  const connues = new Set([...main, ...board].map((c) => c.r + c.s));
  const reste = jeu52().filter((c) => !connues.has(c.r + c.s));
  let gagne = 0;
  for (let k = 0; k < tirages; k++) {
    // tirage partiel de Fisher-Yates : les cartes manquantes du board, puis deux par adversaire
    const besoin = 5 - board.length + 2 * n;
    for (let i = 0; i < besoin; i++) { const j = i + Math.floor(r() * (reste.length - i)); const x = reste[i]; reste[i] = reste[j]; reste[j] = x; }
    const b = board.concat(reste.slice(0, 5 - board.length));
    const moi = score([...main, ...b]);
    let best = 0, egaux = 0, perdu = false;
    for (let a = 0; a < n; a++) {
      const o = 5 - board.length + 2 * a, s = score([reste[o], reste[o + 1], ...b]);
      if (s > moi) { perdu = true; break; }
      if (s === moi) egaux++;
      best = Math.max(best, s);
    }
    if (!perdu) gagne += egaux ? 1 / (egaux + 1) : 1;
  }
  return gagne / tirages;
}
/** force d'une main de départ (formule de Chen ramenée entre 0 et 1) : sert à trier les mains avant le flop */
export function chen(main) {
  const [a, b] = main.slice().sort((x, y) => y.r - x.r);
  const val = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = val(a.r);
  if (a.r === b.r) s = Math.max(5, s * 2);
  if (a.s === b.s) s += 2;
  const ecart = a.r - b.r - 1;
  if (a.r !== b.r) { s -= ecart <= 0 ? 0 : ecart === 1 ? 1 : ecart === 2 ? 2 : ecart === 3 ? 4 : 5; if (ecart <= 1 && a.r < 12) s += 1; }
  return Math.max(0, Math.min(1, (s + 1) / 21));
}
/** l'ordinateur choisit une action toujours permise (graine r : ses tirages et ses bluffs) */
export function decisionIA(t, i, r) {
  const p = t.joueurs[i], A = actionsPossibles(t, i);
  if (!A) return null;
  const st = p.style, adv = t.joueurs.filter((q, j) => j !== i && enJeu(q)).length;
  const P = pot(t), aSuivre = A.suivre, cote = aSuivre / (P + aSuivre || 1);
  const pile = p.jetons + p.mise;
  const lourd = aSuivre > pile * 0.45;   // suivre engagerait près de la moitié du tapis
  const relance = (vise) => (A.relance ? { type: 'relancer', montant: Math.max(A.relance.min, Math.min(A.relance.max, Math.round(vise))) } : null);
  const taille = (f) => relance(t.miseMax + Math.max(t.relanceMin, (P + aSuivre) * f));
  const tapisFaible = (a, seuil) => a && a.montant - p.mise >= p.jetons * 0.9 && seuil;
  if (t.etape === 'preflop') {
    // avant le flop : on trie les mains de départ (formule de Chen), plus ou moins serré selon le caractère
    const c = chen(p.main), jouer = 0.19 + st.serre * 0.16;
    const relances = t.journal.filter((j) => j.type === 'relancer').length;
    if (A.parole) {
      if (c > 0.5 - st.agressif * 0.1 && r() < 0.5 + st.agressif * 0.4) return relance(t.grosse * (3 + Math.floor(r() * 2))) || { type: 'parole' };
      return { type: 'parole' };
    }
    if (c >= 0.7 || (c >= 0.55 - st.agressif * 0.08 && relances < 2 && r() < 0.45 + st.agressif * 0.4)) {
      const a = relance(relances ? t.miseMax * 3 : t.grosse * (3 + Math.floor(r() * 2)));
      if (a && !tapisFaible(a, c < 0.75)) return a;
    }
    if (lourd) return c >= 0.6 - st.agressif * 0.05 ? { type: 'suivre' } : { type: 'coucher' };
    if (aSuivre > t.grosse * 4) return c >= jouer + 0.12 ? { type: 'suivre' } : { type: 'coucher' };
    if (c >= jouer) return { type: 'suivre' };
    // vol des blindes : de temps en temps, avec une main moyenne et personne n'a relancé
    if (!relances && c >= jouer - 0.08 && r() < st.bluff * 2) return relance(t.grosse * 3) || { type: 'coucher' };
    return { type: 'coucher' };
  }
  // après le flop : chance de gagner contre les adversaires restants, comparée aux cotes du pot
  const eq = equite(p.main, t.board, adv, r, 180);
  const rel = eq * (adv + 1);   // 1 = une main moyenne à cette table, 2 = deux fois plus de chances que la moyenne
  const bluffe = r() < st.bluff;
  if (A.parole) {
    if (rel > 1.4 - st.agressif * 0.3 && r() < 0.55 + st.agressif * 0.4) return taille(0.45 + r() * 0.4) || { type: 'parole' };
    if (bluffe && adv <= 2) return taille(0.5) || { type: 'parole' };
    return { type: 'parole' };
  }
  const marge = 0.05 + st.serre * 0.1 + (lourd ? 0.12 : 0);
  if (rel > 2 - st.agressif * 0.5 && eq > 0.35 && r() < 0.4 + st.agressif * 0.4) {
    const a = taille(0.6 + r() * 0.5); if (a && !tapisFaible(a, eq < 0.6)) return a;
  }
  if (eq > cote + marge) return { type: 'suivre' };
  if (bluffe && !lourd && adv === 1 && t.etape !== 'river') return taille(0.7) || { type: 'coucher' };
  return { type: 'coucher' };
}
