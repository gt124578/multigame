// Bots : décisions au poker et à la belote. Trois niveaux : facile (joue large, bluffe peu), normal, expert (serré, agressif).
import { legalActions } from './poker.js';
import { evaluate } from './hands.js';
import { legalCards, trickWinner, power, points, teamOf } from './belote.js';
import { rankValue, suitOf, rankOf } from './deck.js';

export const BOT_LEVELS = ['facile', 'normal', 'expert'];
export const BOT_NAMES = ['Mamé Rose', 'Tonton Jojo', 'Lou Pitchoun', 'Cousin Marius', 'Tata Mireille', 'Papé Fernand', 'Prof Garibaldi'];

/* ------------------------------------------------------------------ poker */
// Force pré-flop d'une main de deux cartes, de 0 à 1 (approximation à la Chen)
function preflopStrength(hand) {
  const [a, b] = hand.map(rankValue).sort((x, y) => y - x);
  const suited = suitOf(hand[0]) === suitOf(hand[1]);
  let v = a >= 12 ? 10 : a === 11 ? 8 : a === 10 ? 7 : a === 9 ? 6 : (a + 2) / 2;
  if (a === b) v = Math.max(5, v * 2);
  if (suited) v += 2;
  const gap = a - b;
  if (a !== b) v -= gap === 1 ? 0 : gap === 2 ? 1 : gap === 3 ? 2 : gap === 4 ? 4 : 5;
  if (a !== b && gap <= 2 && a < 10) v += 1;
  return Math.max(0, Math.min(1, v / 20));
}

// Force après le flop : catégorie de la combinaison et hauteur, de 0 à 1
function postflopStrength(hand, board) {
  const e = evaluate(hand.concat(board));
  const own = evaluate(board.length >= 5 ? board : board.concat([]));
  // ne pas s'emballer si la combinaison est entièrement sur le tapis
  const boardOnly = board.length >= 3 && own.cat >= e.cat && own.cat > 0 ? 0.35 : 1;
  const base = [0.15, 0.35, 0.55, 0.7, 0.8, 0.85, 0.92, 0.97, 1][e.cat];
  const high = e.cat <= 1 ? (rankValue(hand[0]) + rankValue(hand[1])) / 24 * 0.15 : 0;
  return Math.min(1, (base + high) * boardOnly);
}

export function pokerBotAction(s, idx, rand) {
  const L = legalActions(s, idx);
  if (!L) return null;
  const p = s.players[idx];
  const level = p.level;
  const str = s.board.length ? postflopStrength(p.hand, s.board) : preflopStrength(p.hand);
  const potOdds = L.call / Math.max(1, s.pot + L.call);
  const loose = level === 'facile' ? 0.15 : level === 'normal' ? 0.05 : 0;
  const aggr = level === 'facile' ? 0.08 : level === 'normal' ? 0.14 : 0.2;
  const bluff = level === 'expert' ? 0.08 : level === 'normal' ? 0.05 : 0.02;
  const r = rand();
  const raiseTo = (frac) => Math.max(L.raise.min, Math.min(L.raise.max, Math.round((s.pot + L.call) * frac + s.currentBet)));
  if (L.raise && (str > 0.78 || (str > 0.6 && r < aggr * 2) || r < bluff)) return { a: 'raise', to: raiseTo(str > 0.9 ? 1 : 0.6) };
  if (L.call) {
    if (str + loose > potOdds + 0.25 || (str > 0.45 && potOdds < 0.2)) return { a: 'call' };
    if (L.call >= p.stack && str > 0.7) return { a: 'call' };
    return { a: 'fold' };
  }
  if (L.check) {
    if (L.raise && str > 0.6 && r < 0.5 + aggr) return { a: 'raise', to: raiseTo(0.5) };
    return { a: 'check' };
  }
  return { a: 'fold' };
}

/* ------------------------------------------------------------------ belote */
// Valeur d'une main si `suit` est l'atout : points d'atout + as hors atout + longueur
export function beloteHandValue(hand, suit) {
  let v = 0;
  const trumps = hand.filter((c) => suitOf(c) === suit);
  for (const c of trumps) v += points(c, suit);
  if (trumps.some((c) => rankOf(c) === 'J')) v += 6;
  if (trumps.some((c) => rankOf(c) === '9')) v += 4;
  v += trumps.length * 4;
  for (const c of hand) if (suitOf(c) !== suit && rankOf(c) === 'A') v += 7;
  for (const c of hand) if (suitOf(c) !== suit && rankOf(c) === 'T') v += 2;
  if (hand.includes('K' + suit) && hand.includes('Q' + suit)) v += 8;
  return v;
}

export function beloteBotBid(s, seat, rand) {
  const p = s.players[seat];
  const thr = p.level === 'facile' ? 30 : p.level === 'normal' ? 36 : 40;
  if (s.bidRound === 1) {
    const suit = suitOf(s.upcard);
    const v = beloteHandValue(p.hand.concat([s.upcard]), suit);
    return v + rand() * 6 >= thr ? { a: 'take' } : { a: 'pass' };
  }
  let best = null;
  for (const suit of ['S', 'H', 'D', 'C']) {
    if (suit === suitOf(s.upcard)) continue;
    const v = beloteHandValue(p.hand, suit);
    if (!best || v > best.v) best = { suit, v };
  }
  // au second tour, on prend un peu plus facilement quand on est dernier à parler (sinon on redistribue)
  const last = (seat + 1) % 4 === (s.dealer + 1) % 4;
  return best && best.v + rand() * 6 >= thr - (last ? 6 : 2) ? { a: 'take', suit: best.suit } : { a: 'pass' };
}

export function beloteBotPlay(s, seat, rand) {
  const legal = legalCards(s, seat);
  if (legal.length === 1) return legal[0];
  const p = s.players[seat];
  const trump = s.trump;
  const easy = p.level === 'facile';
  if (easy && rand() < 0.3) return legal[Math.floor(rand() * legal.length)];
  const byPower = (a, b) => power(a, trump) - power(b, trump);
  const played = new Set(s.tricks[0].concat(s.tricks[1], s.trick.map((t) => t.card)));
  const isMaster = (c) => {
    // plus forte carte restante de sa couleur ?
    const su = suitOf(c);
    const order = su === trump ? ['7', '8', 'Q', 'K', 'T', 'A', '9', 'J'] : ['7', '8', '9', 'J', 'Q', 'K', 'T', 'A'];
    for (let i = order.length - 1; i >= 0; i--) { const card = order[i] + su; if (card === c) return true; if (!played.has(card) && !p.hand.includes(card)) return false; }
    return true;
  };
  if (s.trick.length === 0) {
    // en main : un maître hors atout, sinon l'atout maître si preneur, sinon une petite carte
    const masters = legal.filter((c) => isMaster(c) && suitOf(c) !== trump);
    if (masters.length) return masters.sort((a, b) => points(b, trump) - points(a, trump))[0];
    const tm = legal.filter((c) => isMaster(c) && suitOf(c) === trump);
    if (tm.length && teamOf(seat) === teamOf(s.taker)) return tm[0];
    const plain = legal.filter((c) => suitOf(c) !== trump).sort((a, b) => points(a, trump) - points(b, trump));
    return plain.length ? plain[0] : legal.sort(byPower)[0];
  }
  const winnerSeat = trickWinner(s.trick, trump);
  const partnerMaster = teamOf(winnerSeat) === teamOf(seat);
  const trickPts = s.trick.reduce((a, t) => a + points(t.card, trump), 0);
  const winning = legal.filter((c) => trickWinner(s.trick.concat([{ seat, card: c }]), trump) === seat);
  const lowest = (arr) => arr.slice().sort((a, b) => points(a, trump) - points(b, trump) || byPower(a, b))[0];
  const highestPts = (arr) => arr.slice().sort((a, b) => points(b, trump) - points(a, trump))[0];
  if (partnerMaster) {
    // charger le pli du partenaire s'il est maître sûr, sinon se défausser au plus bas
    const sure = isMaster(s.trick.find((t) => t.seat === winnerSeat).card) || s.trick.length === 3;
    const same = legal.filter((c) => suitOf(c) === suitOf(s.trick[0].card));
    if (sure && same.length) return highestPts(same);
    return lowest(legal);
  }
  if (winning.length) {
    // dernier à jouer : prendre avec la moins chère qui gagne ; sinon ne prendre que si ça vaut le coup
    if (s.trick.length === 3 || trickPts >= 10 || !easy) return winning.sort(byPower)[0];
  }
  return lowest(legal);
}
