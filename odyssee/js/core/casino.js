// odyssee/js/core/casino.js — le Casino de Métropole (moteur sans DOM, testé par tools/test-odyssee-casino.mjs).
// Machine à sous, blackjack, roulette européenne et belote classique à quatre (deux équipes, prise au premier ou au
// second tour) ; le poker Texas Hold'em est dans holdem.js, les bornes d'arcade dans arcade.js.
// On joue avec des jetons achetés en Pokédollars au comptoir.

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export const melanger = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const COULEURS = ['♠', '♥', '♦', '♣'], NOM_COULEUR = { '♠': 'pique', '♥': 'cœur', '♦': 'carreau', '♣': 'trèfle' };
export const rouge = (c) => c.s === '♥' || c.s === '♦';
/** carte : { r: rang (2..14, as = 14), s: couleur } ; nom court : « 10♥ », « R♠ » */
export const NOM_RANG = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
export const nomCarte = (c) => (NOM_RANG[c.r] || String(c.r)) + c.s;
export function jeu52() { const d = []; for (const s of COULEURS) for (let r = 2; r <= 14; r++) d.push({ r, s }); return d; }
export function jeu32() { const d = []; for (const s of COULEURS) for (const r of [7, 8, 9, 10, 11, 12, 13, 14]) d.push({ r, s }); return d; }

/* ======================= MACHINE À SOUS ======================= */
export const SYMBOLES = ['7', 'BAR', 'Poké Ball', 'Baie', 'Pierre Lune', 'Étoile'];
// poids sur chaque rouleau (le 7 est rare) et gains pour trois symboles identiques sur la ligne (× la mise)
const POIDS = [1, 2, 4, 6, 4, 3], GAINS = { 7: 100, BAR: 30, 'Poké Ball': 10, Baie: 4, 'Pierre Lune': 8, Étoile: 15 };
export function tirerRouleaux(r) {
  const tot = POIDS.reduce((a, b) => a + b, 0);
  const un = () => { let x = r() * tot; for (let i = 0; i < POIDS.length; i++) { x -= POIDS[i]; if (x < 0) return SYMBOLES[i]; } return SYMBOLES[5]; };
  return [un(), un(), un()];
}
/** gain d'un tirage pour une mise : trois identiques, ou deux Baies au début (on récupère la mise ×2), une Baie (×1) */
export function gainMachine(rou, mise) {
  if (rou[0] === rou[1] && rou[1] === rou[2]) return GAINS[rou[0]] * mise;
  if (rou[0] === 'Baie' && rou[1] === 'Baie') return 2 * mise;
  if (rou[0] === 'Baie') return mise;
  return 0;
}
export const TABLE_MACHINE = Object.entries(GAINS).map(([k, v]) => `${k} ${k} ${k} : ×${v}`).concat(['Baie Baie … : ×2', 'Baie … … : ×1']);

/* ======================= BLACKJACK ======================= */
export const valeurBJ = (c) => (c.r === 14 ? 11 : Math.min(10, c.r));
/** total d'une main (les as valent 1 si besoin) ; souple : un as compte encore pour 11 */
export function totalBJ(main) {
  let t = 0, as = 0; for (const c of main) { t += valeurBJ(c); if (c.r === 14) as++; }
  while (t > 21 && as) { t -= 10; as--; }
  return { t, souple: as > 0 };
}
export const blackjack = (main) => main.length === 2 && totalBJ(main).t === 21;
/** nouvelle donne : sabot de 4 jeux, deux cartes chacun (la seconde du croupier est cachée) */
export function donneBJ(r, mise) {
  const sabot = melanger([...jeu52(), ...jeu52(), ...jeu52(), ...jeu52()], r);
  const j = [sabot.pop(), sabot.pop()], c = [sabot.pop(), sabot.pop()];
  return { sabot, joueur: j, croupier: c, mise, fini: false, double: false, resultat: null };
}
export function tirerBJ(p) { p.joueur.push(p.sabot.pop()); if (totalBJ(p.joueur).t >= 21) finirBJ(p); return p; }   // à 21, on reste d'office
export function doublerBJ(p) { p.mise *= 2; p.double = true; p.joueur.push(p.sabot.pop()); return finirBJ(p); }
/** le croupier tire jusqu'à 17 (il reste sur 17, même souple), puis on compare ; gain net en jetons (mise rendue comprise) */
export function finirBJ(p) {
  const tj = totalBJ(p.joueur).t;
  if (tj <= 21 && !blackjack(p.joueur)) while (totalBJ(p.croupier).t < 17) p.croupier.push(p.sabot.pop());
  const tc = totalBJ(p.croupier).t;
  let res, rendu;
  if (tj > 21) { res = 'Tu dépasses 21.'; rendu = 0; }
  else if (blackjack(p.joueur) && !blackjack(p.croupier)) { res = 'Blackjack !'; rendu = Math.floor(p.mise * 2.5); }
  else if (blackjack(p.croupier) && !blackjack(p.joueur)) { res = 'Blackjack du croupier.'; rendu = 0; }
  else if (tc > 21) { res = 'Le croupier dépasse 21 !'; rendu = p.mise * 2; }
  else if (tj > tc) { res = 'Gagné !'; rendu = p.mise * 2; }
  else if (tj === tc) { res = 'Égalité : mise rendue.'; rendu = p.mise; }
  else { res = 'Le croupier gagne.'; rendu = 0; }
  p.fini = true; p.resultat = res; p.rendu = rendu;
  return p;
}

/* ======================= ROULETTE (européenne, un seul zéro) ======================= */
export const ROUGES = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** paris : type et paramètre ; gain (mise rendue comprise) */
export const PARIS = {
  plein: { nom: 'Plein (un numéro)', paye: 36, gagne: (n, v) => n === v },
  rouge: { nom: 'Rouge', paye: 2, gagne: (n) => ROUGES.has(n) },
  noir: { nom: 'Noir', paye: 2, gagne: (n) => n > 0 && !ROUGES.has(n) },
  pair: { nom: 'Pair', paye: 2, gagne: (n) => n > 0 && n % 2 === 0 },
  impair: { nom: 'Impair', paye: 2, gagne: (n) => n % 2 === 1 },
  manque: { nom: 'Manque (1 à 18)', paye: 2, gagne: (n) => n >= 1 && n <= 18 },
  passe: { nom: 'Passe (19 à 36)', paye: 2, gagne: (n) => n >= 19 },
  douzaine: { nom: 'Douzaine', paye: 3, gagne: (n, v) => n > 0 && Math.ceil(n / 12) === v },
  colonne: { nom: 'Colonne', paye: 3, gagne: (n, v) => n > 0 && ((n - 1) % 3) + 1 === v },
};
export const tirerRoulette = (r) => Math.floor(r() * 37);
export function gainRoulette(paris, n) { let g = 0; for (const p of paris) if (PARIS[p.type].gagne(n, p.v)) g += p.mise * PARIS[p.type].paye; return g; }

/* ======================= MAINS DE POKER (cinq cartes) ======================= */
const CAT = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
/** force d'une main de 5 cartes : [catégorie, départages…] (comparaison lexicographique) ; sert de référence aux tests du Hold'em */
export function forcePoker(main) {
  const rs = main.map((c) => c.r).sort((a, b) => b - a);
  const cnt = {}; for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groupes = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const couleur = main.every((c) => c.s === main[0].s);
  const uniq = [...new Set(rs)];
  let haut = 0;
  if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) haut = uniq[0]; else if (uniq.join() === '14,5,4,3,2') haut = 5; }
  const ordre = groupes.map((g) => g[1]);
  if (haut && couleur) return [8, haut];
  if (groupes[0][0] === 4) return [7, ...ordre];
  if (groupes[0][0] === 3 && groupes[1][0] === 2) return [6, ...ordre];
  if (couleur) return [5, ...rs];
  if (haut) return [4, haut];
  if (groupes[0][0] === 3) return [3, ...ordre];
  if (groupes[0][0] === 2 && groupes[1][0] === 2) return [2, ...ordre];
  if (groupes[0][0] === 2) return [1, ...ordre];
  return [0, ...rs];
}
export const nomMain = (f) => CAT[f[0]];
export function compare(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }

/* ======================= BELOTE CLASSIQUE ======================= */
// rangs de la belote : 7 8 9 10 V D R A ; valeurs à l'atout et hors atout
const PTS_ATOUT = { 11: 20, 9: 14, 14: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0 };
const PTS = { 14: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0 };
const ORD_ATOUT = [7, 8, 12, 13, 10, 14, 9, 11], ORD = [7, 8, 9, 11, 12, 13, 10, 14];
export const NOM_BELOTE = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
export const nomBelote = (c) => (NOM_BELOTE[c.r] || String(c.r)) + c.s;
export const points = (c, atout) => (c.s === atout ? PTS_ATOUT[c.r] : PTS[c.r]);
const force = (c, atout, demandee) => (c.s === atout ? 100 + ORD_ATOUT.indexOf(c.r) : c.s === demandee ? ORD.indexOf(c.r) : -1);
/** carte qui remporte le pli (index dans le pli) */
export function maitre(pli, atout) {
  const dem = pli[0].c.s; let b = 0;
  for (let i = 1; i < pli.length; i++) if (force(pli[i].c, atout, dem) > force(pli[b].c, atout, dem)) b = i;
  return b;
}
/** cartes jouables : fournir à la couleur demandée ; sinon couper (sauf si le partenaire est maître), et monter à l'atout si possible */
export function jouables(main, pli, atout, joueur) {
  if (!pli.length) return main.slice();
  const dem = pli[0].c.s, b = maitre(pli, atout), partenaireMaitre = pli[b].j % 2 === joueur % 2;
  const plusFortAtout = Math.max(-1, ...pli.filter((x) => x.c.s === atout).map((x) => ORD_ATOUT.indexOf(x.c.r)));
  const atouts = main.filter((c) => c.s === atout), monter = atouts.filter((c) => ORD_ATOUT.indexOf(c.r) > plusFortAtout);
  if (dem === atout) return atouts.length ? (monter.length ? monter : atouts) : main.slice();
  const suit = main.filter((c) => c.s === dem);
  if (suit.length) return suit;
  if (partenaireMaitre) return main.slice();
  if (atouts.length) return monter.length ? monter : atouts;   // couper, en montant si on peut (sinon on sous-coupe)
  return main.slice();
}
/** donne : 5 cartes chacun, une carte retournée ; le donneur tourne à chaque donne */
export function donneBelote(r, donneur) {
  const p = melanger(jeu32(), r), mains = [[], [], [], []];
  for (let k = 0; k < 4; k++) mains[(donneur + 1 + k) % 4].push(...p.splice(0, 3));
  for (let k = 0; k < 4; k++) mains[(donneur + 1 + k) % 4].push(...p.splice(0, 2));
  return { paquet: p, mains, retournee: p.shift(), donneur, atout: null, preneur: null, plis: [[], []], pli: [], belote: null, entame: (donneur + 1) % 4 };
}
/** force d'une main pour un atout donné (pour savoir si l'ordinateur prend) */
export function evalPrise(main, atout, retournee) {
  const cs = retournee ? [...main, retournee] : main;
  let v = 0; for (const c of cs) { if (c.s === atout) v += PTS_ATOUT[c.r] + 4; else if (c.r === 14) v += 9; else if (c.r === 10) v += 3; }
  if (cs.some((c) => c.s === atout && c.r === 11)) v += 8;
  return v;
}
export const SEUIL_PRISE = 58;
/** après la prise : le preneur reçoit la retournée et 2 cartes, les autres 3 */
export function distribuerReste(d, preneur, atout) {
  d.atout = atout; d.preneur = preneur;
  for (let k = 0; k < 4; k++) {
    const j = (d.donneur + 1 + k) % 4;
    if (j === preneur) { d.mains[j].push(d.retournee, ...d.paquet.splice(0, 2)); } else d.mains[j].push(...d.paquet.splice(0, 3));
  }
  // belote et rebelote : le roi et la dame d'atout dans la même main
  for (let j = 0; j < 4; j++) if (d.mains[j].some((c) => c.s === atout && c.r === 13) && d.mains[j].some((c) => c.s === atout && c.r === 12)) d.belote = j;
}
/** l'ordinateur choisit sa carte : entame avec un as, charge son partenaire maître, prend le pli au plus juste, sinon se défausse petit */
export function choixIA(d, j) {
  const main = d.mains[j], L = jouables(main, d.pli, d.atout, j), at = d.atout;
  const val = (c) => points(c, at);
  const petit = (cs) => cs.slice().sort((a, b) => val(a) - val(b) || (a.s === at) - (b.s === at))[0];
  if (!d.pli.length) {
    const as = L.filter((c) => c.r === 14 && c.s !== at); if (as.length) return as[0];
    if (d.preneur % 2 === j % 2) { const va = L.find((c) => c.s === at && c.r === 11); if (va) return va; }
    return petit(L);
  }
  const b = maitre(d.pli, at), dem = d.pli[0].c.s;
  if (d.pli[b].j % 2 === j % 2) {
    // partenaire maître : on charge (si on n'est pas dernier, seulement si sa carte est forte)
    const sur = d.pli.length === 3 || force(d.pli[b].c, at, dem) >= (d.pli[b].c.s === at ? 104 : 7);
    if (sur) return L.filter((c) => c.s !== at || L.every((x) => x.s === at)).sort((a, c2) => val(c2) - val(a))[0] || petit(L);
    return petit(L);
  }
  const gagnantes = L.filter((c) => force(c, at, dem) > force(d.pli[b].c, at, dem)).sort((a, c2) => force(a, at, dem) - force(c2, at, dem));
  if (gagnantes.length) return gagnantes[0];
  return petit(L);
}
/** joue une carte ; si le pli est complet, le ramasse ; renvoie le gagnant du pli (ou null) */
export function jouerCarte(d, j, c) {
  const i = d.mains[j].findIndex((x) => x.r === c.r && x.s === c.s); d.mains[j].splice(i, 1);
  d.pli.push({ j, c });
  if (d.pli.length < 4) return null;
  const g = d.pli[maitre(d.pli, d.atout)].j;
  d.plis[g % 2].push(...d.pli.map((x) => x.c)); d.dernier = g % 2; d.pli = []; d.entame = g;
  return g;
}
/** décompte d'une donne : points des plis + dix de der + belote ; « dedans » si le preneur ne fait pas plus que la défense */
export function compterBelote(d) {
  const pts = [0, 0];
  for (const e of [0, 1]) for (const c of d.plis[e]) pts[e] += points(c, d.atout);
  pts[d.dernier] += 10;
  const capot = d.plis[0].length === 0 ? 1 : d.plis[1].length === 0 ? 0 : -1;
  if (capot >= 0) { pts[capot] = 252; pts[1 - capot] = 0; }
  const bel = d.belote != null ? d.belote % 2 : -1;
  if (bel >= 0) pts[bel] += 20;
  const pe = d.preneur % 2, de = 1 - pe;
  let dedans = false;
  if (pts[pe] <= pts[de]) { dedans = true; pts[de] = 162 + (capot === de ? 90 : 0) + (bel === de ? 20 : 0); pts[pe] = bel === pe ? 20 : 0; }
  return { pts, dedans, capot: capot >= 0 };
}
