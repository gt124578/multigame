// Belote classique à 4 (deux équipes : sièges 0 et 2 contre 1 et 3). Règles pures, sans DOM ni réseau.
// Distribution 3 + 2, retourne, deux tours d'enchères (prendre à la retourne, puis à une autre couleur), 3 cartes
// de plus (2 pour le preneur), huit plis. Obligations : fournir à la couleur, monter à l'atout, couper quand on ne
// peut pas fournir (sauf si le partenaire est maître), dix de der, belote-rebelote, capot, « dedans » sous 82.
import { rngOf } from './rng.js';
import { deck32, shuffled, suitOf, rankOf, SUIT_NAME, label } from './deck.js';

const TRUMP_ORDER = ['7', '8', 'Q', 'K', 'T', 'A', '9', 'J']; // du plus faible au plus fort
const PLAIN_ORDER = ['7', '8', '9', 'J', 'Q', 'K', 'T', 'A'];
const TRUMP_PTS = { J: 20, '9': 14, A: 11, T: 10, K: 4, Q: 3, '8': 0, '7': 0 };
const PLAIN_PTS = { A: 11, T: 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };

export const teamOf = (seat) => seat % 2;
export const TEAM_NAMES = ['Nous', 'Eux'];
export function points(card, trump) { return suitOf(card) === trump ? TRUMP_PTS[rankOf(card)] : PLAIN_PTS[rankOf(card)]; }
export function power(card, trump) {
  // force relative : atout > couleur demandée > autres
  return suitOf(card) === trump ? 100 + TRUMP_ORDER.indexOf(rankOf(card)) : PLAIN_ORDER.indexOf(rankOf(card));
}

export function createBelote({ seed, players, target = 501 }) {
  if (players.length !== 4) throw new Error('La belote se joue à 4');
  return {
    game: 'belote', seed, phase: 'lobby', target, startedAt: Date.now(), dealNo: 0,
    players: players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, level: p.level || 'normal', seat: i, hand: [], belote: false })),
    scores: [0, 0], dealer: 3, turn: -1, stage: 'bid', bidRound: 1, upcard: null, trump: null, taker: -1,
    trick: [], tricks: [[], []], lastTrick: null, trickLeader: -1, dealScore: null, ranking: [], log: [],
  };
}
function note(s, text) { s.log.push(text); if (s.log.length > 12) s.log.shift(); }

export function startDeal(s) {
  const rng = rngOf(s);
  s.dealNo++;
  s.phase = 'hand'; s.stage = 'bid'; s.bidRound = 1; s.trump = null; s.taker = -1; s.trick = []; s.tricks = [[], []]; s.lastTrick = null; s.dealScore = null;
  s.dealer = (s.dealer + 1) % 4;
  const deck = shuffled(rng, deck32());
  for (const p of s.players) { p.hand = []; p.belote = false; p.beloteSaid = 0; }
  for (let k = 1; k <= 4; k++) s.players[(s.dealer + k) % 4].hand.push(deck.pop(), deck.pop(), deck.pop());
  for (let k = 1; k <= 4; k++) s.players[(s.dealer + k) % 4].hand.push(deck.pop(), deck.pop());
  s.upcard = deck.pop();
  s.deck = deck;
  s.turn = (s.dealer + 1) % 4;
  note(s, `Donne n° ${s.dealNo} — ${s.players[s.dealer].name} distribue, retourne : ${label(s.upcard)}`);
  return s;
}

// Enchères : { a: 'take' } au premier tour, { a: 'take', suit } au second, { a: 'pass' }
export function bid(s, seat, action) {
  if (s.phase !== 'hand' || s.stage !== 'bid' || s.turn !== seat) return { ok: false, msg: 'Ce n\'est pas à toi d\'annoncer' };
  const p = s.players[seat];
  if (action.a === 'take') {
    const suit = s.bidRound === 1 ? suitOf(s.upcard) : action.suit;
    if (!['S', 'H', 'D', 'C'].includes(suit) || (s.bidRound === 2 && suit === suitOf(s.upcard))) return { ok: false, msg: 'Couleur impossible' };
    s.trump = suit; s.taker = seat; s.stage = 'play';
    note(s, `${p.name} prend à ${SUIT_NAME[suit]}`);
    // distribution du reste : le preneur reçoit la retourne + 2, les autres 3
    p.hand.push(s.upcard);
    for (let k = 1; k <= 4; k++) { const q = s.players[(s.dealer + k) % 4]; const n = q === p ? 2 : 3; for (let i = 0; i < n; i++) q.hand.push(s.deck.pop()); }
    s.deck = [];
    for (const q of s.players) q.belote = q.hand.includes('K' + suit) && q.hand.includes('Q' + suit);
    s.trickLeader = (s.dealer + 1) % 4; s.turn = s.trickLeader; s.trick = [];
    return { ok: true };
  }
  if (action.a !== 'pass') return { ok: false, msg: 'Annonce inconnue' };
  p.lastAct = 'passe';
  const next = (seat + 1) % 4;
  if (next === (s.dealer + 1) % 4) {
    if (s.bidRound === 1) { s.bidRound = 2; s.turn = next; note(s, 'Tout le monde passe : deuxième tour'); }
    else { note(s, 'Personne ne prend : on redistribue'); s.stage = 'redeal'; s.turn = -1; }
  } else s.turn = next;
  return { ok: true };
}

export function trickWinner(trick, trump) {
  const led = suitOf(trick[0].card);
  let best = trick[0];
  for (const t of trick) {
    const b = suitOf(best.card) === trump ? power(best.card, trump) : suitOf(best.card) === led ? power(best.card, trump) : -1;
    const c = suitOf(t.card) === trump ? power(t.card, trump) : suitOf(t.card) === led ? power(t.card, trump) : -1;
    if (c > b) best = t;
  }
  return best.seat;
}

// Cartes jouables par ce joueur sur le pli en cours
export function legalCards(s, seat) {
  const p = s.players[seat];
  const hand = p.hand;
  if (s.trick.length === 0) return hand.slice();
  const trump = s.trump;
  const led = suitOf(s.trick[0].card);
  const winnerSeat = trickWinner(s.trick, trump);
  const winning = s.trick.find((t) => t.seat === winnerSeat).card;
  const partnerMaster = teamOf(winnerSeat) === teamOf(seat);
  const trumps = hand.filter((c) => suitOf(c) === trump);
  const higherTrumps = (ref) => trumps.filter((c) => power(c, trump) > power(ref, trump));
  const same = hand.filter((c) => suitOf(c) === led);
  if (led === trump) {
    // à l'atout : monter si possible
    const up = higherTrumps(winning);
    if (up.length) return up;
    if (trumps.length) return trumps;
    return hand.slice();
  }
  if (same.length) return same;
  if (partnerMaster) return hand.slice(); // le partenaire est maître : libre de défausser
  if (trumps.length) {
    // le pli est-il déjà coupé ? il faut surcouper si on peut
    if (suitOf(winning) === trump) { const up = higherTrumps(winning); return up.length ? up : trumps; }
    return trumps;
  }
  return hand.slice();
}

export function play(s, seat, card) {
  if (s.phase !== 'hand' || s.stage !== 'play' || s.turn !== seat) return { ok: false, msg: 'Ce n\'est pas à toi de jouer' };
  const legal = legalCards(s, seat);
  if (!legal.includes(card)) return { ok: false, msg: 'Cette carte n\'est pas jouable ici' };
  const p = s.players[seat];
  p.hand.splice(p.hand.indexOf(card), 1);
  if (p.belote && (card === 'K' + s.trump || card === 'Q' + s.trump)) { p.beloteSaid++; note(s, `${p.name} : ${p.beloteSaid === 1 ? 'belote' : 'rebelote'}`); }
  s.trick.push({ seat, card });
  if (s.trick.length < 4) { s.turn = (seat + 1) % 4; return { ok: true }; }
  const w = trickWinner(s.trick, s.trump);
  s.tricks[teamOf(w)].push(...s.trick.map((t) => t.card));
  s.lastTrick = { cards: s.trick.slice(), winner: w };
  s.trick = [];
  s.trickLeader = w; s.turn = w;
  if (s.players.every((q) => q.hand.length === 0)) scoreDeal(s, w);
  return { ok: true };
}

function scoreDeal(s, lastWinner) {
  const t = s.trump;
  const raw = [0, 1].map((team) => s.tricks[team].reduce((a, c) => a + points(c, t), 0));
  raw[teamOf(lastWinner)] += 10; // dix de der
  const beloteTeam = s.players.findIndex((p) => p.belote);
  const bel = [0, 0]; if (beloteTeam >= 0) bel[teamOf(beloteTeam)] = 20;
  const takerTeam = teamOf(s.taker), defTeam = 1 - takerTeam;
  const capot = s.tricks[defTeam].length === 0 ? takerTeam : s.tricks[takerTeam].length === 0 ? defTeam : -1;
  const gained = [0, 0];
  let verdict;
  if (capot >= 0) { gained[capot] = 252; verdict = `Capot pour ${TEAM_NAMES[capot]} !`; }
  else if (raw[takerTeam] >= 82) { gained[takerTeam] = raw[takerTeam]; gained[defTeam] = raw[defTeam]; verdict = `Contrat réussi (${raw[takerTeam]} points)`; }
  else { gained[defTeam] = 162; verdict = `Dedans ! ${raw[takerTeam]} points seulement`; }
  gained[0] += bel[0]; gained[1] += bel[1];
  s.scores[0] += gained[0]; s.scores[1] += gained[1];
  s.dealScore = { raw, gained, belote: bel, verdict, takerTeam, capot };
  s.stage = 'scored'; s.turn = -1;
  note(s, `${verdict} — ${gained[0]} / ${gained[1]}`);
  if (s.scores[0] >= s.target || s.scores[1] >= s.target) s.over = true;
}

// Après le délai d'affichage du score (ou une redistribution) : donne suivante ou fin
export function nextDealOrFinish(s) {
  if (s.over) return finish(s);
  return startDeal(s);
}

function finish(s) {
  s.phase = 'over';
  const win = s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1;
  s.winnerTeam = win;
  s.ranking = s.players.slice().sort((a, b) => (teamOf(b.seat) === win ? 1 : 0) - (teamOf(a.seat) === win ? 1 : 0)).map((p) => p.id);
  return s;
}

export function publicState(s) {
  return {
    game: 'belote', phase: s.phase, stage: s.stage, dealNo: s.dealNo, target: s.target, scores: s.scores, dealer: s.dealer, turn: s.turn, bidRound: s.bidRound,
    upcard: s.stage === 'bid' ? s.upcard : null, trump: s.trump, taker: s.taker, trick: s.trick, lastTrick: s.lastTrick, trickLeader: s.trickLeader,
    dealScore: s.dealScore, winnerTeam: s.winnerTeam, showLast: !!s.shownTrick, ranking: s.ranking, log: s.log, startedAt: s.startedAt, endsAt: s.endsAt || 0, turnStarted: s.turnStarted || 0,
    tricksWon: [s.tricks[0].length / 4, s.tricks[1].length / 4],
    players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, seat: p.seat, cards: p.hand.length, lastAct: p.lastAct || '', beloteSaid: p.beloteSaid || 0 })),
  };
}

export function privateState(s, id) {
  const p = s.players.find((q) => q.id === id);
  if (!p) return { hand: [] };
  const hand = p.hand.slice().sort((a, b) => sortKey(a, s.trump) - sortKey(b, s.trump));
  const legal = s.stage === 'play' && s.turn === p.seat ? legalCards(s, p.seat) : [];
  return { hand, legal, belote: p.belote };
}

const SUIT_POS = { S: 0, H: 1, C: 2, D: 3 }; // alternance noir / rouge
export function sortKey(card, trump) {
  const su = suitOf(card);
  const pos = su === trump ? -1 : SUIT_POS[su];
  const order = su === trump ? TRUMP_ORDER : PLAIN_ORDER;
  return pos * 10 + (7 - order.indexOf(rankOf(card)));
}
