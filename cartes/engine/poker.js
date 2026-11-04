// Texas Hold'em sans limite : règles pures, sans DOM ni réseau. L'hôte applique les actions, les invités n'envoient
// que des intentions. Les mains ne quittent jamais l'état complet : publicState() les retire (sauf à l'abattage).
import { rngOf } from './rng.js';
import { deck52, shuffled } from './deck.js';
import { evaluate } from './hands.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];
export const STREET_NAMES = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Tournant', river: 'Rivière', showdown: 'Abattage' };

export function createPoker({ seed, players, stack = 1000, blind = 10, hands = 0 }) {
  return {
    game: 'poker', seed, phase: 'lobby', handNo: 0, maxHands: hands, startedAt: Date.now(),
    blinds: { sb: Math.max(1, Math.floor(blind / 2)), bb: blind },
    players: players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, level: p.level || 'normal', stack, bet: 0, total: 0, folded: true, allin: false, out: false, acted: false, hand: [], rankOut: 0, lastAct: '' })),
    dealer: -1, turn: -1, street: 'preflop', board: [], deck: [], pot: 0, currentBet: 0, minRaise: blind,
    result: null, ranking: [], log: [],
  };
}

const alive = (s) => s.players.filter((p) => !p.out);
const inHand = (s) => s.players.filter((p) => !p.out && !p.folded);
const canAct = (p) => !p.out && !p.folded && !p.allin;
function nextIdx(s, from, pred) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pred(s.players[i])) return i; }
  return -1;
}
function note(s, text) { s.log.push(text); if (s.log.length > 12) s.log.shift(); }

export function startHand(s) {
  if (alive(s).length < 2) return finish(s);
  if (s.maxHands && s.handNo >= s.maxHands) return finish(s);
  const rng = rngOf(s);
  s.handNo++;
  s.phase = 'hand'; s.street = 'preflop'; s.board = []; s.result = null; s.pot = 0; s.currentBet = 0; s.minRaise = s.blinds.bb;
  s.deck = shuffled(rng, deck52());
  for (const p of s.players) { p.bet = 0; p.total = 0; p.allin = false; p.acted = false; p.hand = []; p.lastAct = ''; p.folded = p.out; }
  for (const p of s.players) if (!p.out) p.hand = [s.deck.pop(), s.deck.pop()];
  s.dealer = nextIdx(s, s.dealer < 0 ? s.players.length - 1 : s.dealer, (p) => !p.out);
  const heads = alive(s).length === 2;
  const sb = heads ? s.dealer : nextIdx(s, s.dealer, (p) => !p.out);
  const bb = nextIdx(s, sb, (p) => !p.out);
  pay(s, sb, s.blinds.sb); pay(s, bb, s.blinds.bb);
  s.players[sb].lastAct = 'petite blinde'; s.players[bb].lastAct = 'grosse blinde';
  s.currentBet = s.blinds.bb;
  s.turn = nextIdx(s, bb, canAct);
  s.bbIdx = bb;
  note(s, `Main n° ${s.handNo} — ${s.players[s.dealer].name} distribue`);
  settleIfNeeded(s);
  return s;
}

function pay(s, i, amount) {
  const p = s.players[i];
  const a = Math.min(amount, p.stack);
  p.stack -= a; p.bet += a; p.total += a; s.pot += a;
  if (p.stack === 0) p.allin = true;
  return a;
}

// Ce qu'un joueur a le droit de faire maintenant
export function legalActions(s, idx) {
  const p = s.players[idx];
  if (s.phase !== 'hand' || s.turn !== idx || !canAct(p)) return null;
  const toCall = Math.min(s.currentBet - p.bet, p.stack);
  const maxTo = p.bet + p.stack; // mise totale si tapis
  const minTo = Math.min(maxTo, s.currentBet + s.minRaise);
  return {
    fold: true,
    check: toCall === 0,
    call: toCall > 0 ? toCall : 0,
    raise: maxTo > s.currentBet ? { min: minTo, max: maxTo } : null, // mise totale sur ce tour
    allin: maxTo,
  };
}

// action : { a: 'fold' | 'check' | 'call' | 'raise', to } — `to` = mise totale voulue sur ce tour (raise)
export function act(s, idx, action) {
  const L = legalActions(s, idx);
  if (!L) return { ok: false, msg: 'Ce n\'est pas à toi de jouer' };
  const p = s.players[idx];
  const a = action && action.a;
  if (a === 'fold') { p.folded = true; p.lastAct = 'se couche'; }
  else if (a === 'check') { if (!L.check) return { ok: false, msg: 'Impossible de checker : il faut suivre' }; p.lastAct = 'check'; }
  else if (a === 'call') {
    if (!L.call) return { ok: false, msg: 'Rien à suivre' };
    pay(s, idx, L.call); p.lastAct = p.allin ? 'tapis' : 'suit';
  } else if (a === 'raise') {
    if (!L.raise) return { ok: false, msg: 'Relance impossible' };
    let to = Math.floor(Number(action.to));
    if (!Number.isFinite(to)) return { ok: false, msg: 'Montant invalide' };
    to = Math.max(L.raise.min, Math.min(L.raise.max, to));
    const raiseBy = to - s.currentBet;
    const wasBet = s.currentBet === 0;
    pay(s, idx, to - p.bet);
    if (p.bet > s.currentBet) {
      if (raiseBy >= s.minRaise) s.minRaise = raiseBy;
      s.currentBet = p.bet;
      for (const q of s.players) if (q !== p) q.acted = false; // les autres doivent se reprononcer
    }
    p.lastAct = p.allin ? 'tapis' : wasBet ? `mise ${p.bet}` : `relance à ${p.bet}`;
  } else return { ok: false, msg: 'Action inconnue' };
  p.acted = true;
  advance(s, idx);
  return { ok: true };
}

// Qui doit encore se prononcer sur ce tour de mise ? Personne si un seul joueur peut agir et qu'il est déjà à hauteur.
function pending(s) {
  const actors = s.players.filter(canAct);
  if (actors.length === 0) return [];
  if (actors.length === 1 && actors[0].bet >= s.currentBet) return [];
  return actors.filter((p) => !p.acted || p.bet < s.currentBet);
}

function advance(s, from) {
  if (inHand(s).length === 1) return endHand(s);
  const todo = pending(s);
  if (todo.length === 0) return nextStreet(s);
  s.turn = nextIdx(s, from, (p) => todo.includes(p));
}

function nextStreet(s) {
  for (const p of s.players) { p.bet = 0; p.acted = false; }
  s.currentBet = 0; s.minRaise = s.blinds.bb;
  const i = STREETS.indexOf(s.street);
  s.street = STREETS[i + 1];
  if (s.street === 'flop') s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
  else if (s.street === 'turn' || s.street === 'river') s.board.push(s.deck.pop());
  else return endHand(s);
  s.turn = nextIdx(s, s.dealer, canAct);
  settleIfNeeded(s);
}

// Plus personne à faire parler (tous à tapis, ou un seul encore debout) : on déroule jusqu'à l'abattage
function settleIfNeeded(s) {
  if (s.phase !== 'hand') return;
  if (inHand(s).length === 1) return endHand(s);
  const todo = pending(s);
  if (todo.length === 0) return nextStreet(s);
  if (!todo.includes(s.players[s.turn])) s.turn = nextIdx(s, s.turn, (p) => todo.includes(p));
}

// Abattage : pots secondaires selon ce que chacun a engagé
function endHand(s) {
  const contenders = inHand(s);
  const result = { winners: [], shows: [], pots: [] };
  if (contenders.length === 1) {
    const w = contenders[0];
    w.stack += s.pot;
    result.winners.push({ id: w.id, amount: s.pot, name: null });
    result.pots.push({ amount: s.pot, winners: [w.id] });
    note(s, `${w.name} remporte ${s.pot}`);
  } else {
    const evals = new Map();
    for (const p of contenders) { const e = evaluate(p.hand.concat(s.board)); evals.set(p.id, e); result.shows.push({ id: p.id, hand: p.hand.slice(), name: e.name, best: e.best }); }
    // paliers de mise : chaque niveau de total engagé crée un pot
    const levels = [...new Set(s.players.filter((p) => p.total > 0).map((p) => p.total))].sort((a, b) => a - b);
    let prev = 0;
    const won = new Map();
    for (const lv of levels) {
      let amount = 0;
      for (const p of s.players) amount += Math.max(0, Math.min(p.total, lv) - prev);
      const elig = contenders.filter((p) => p.total >= lv);
      if (amount > 0 && elig.length) {
        const bestScore = Math.max(...elig.map((p) => evals.get(p.id).score));
        const ws = elig.filter((p) => evals.get(p.id).score === bestScore);
        const share = Math.floor(amount / ws.length);
        let rest = amount - share * ws.length;
        // le reste va au premier à gauche du donneur
        const order = ws.slice().sort((a, b) => ((s.players.indexOf(a) - s.dealer + s.players.length) % s.players.length) - ((s.players.indexOf(b) - s.dealer + s.players.length) % s.players.length));
        for (const w of order) { const g = share + (rest > 0 ? 1 : 0); rest = Math.max(0, rest - 1); w.stack += g; won.set(w.id, (won.get(w.id) || 0) + g); }
        result.pots.push({ amount, winners: ws.map((w) => w.id) });
      }
      prev = lv;
    }
    for (const [id, amount] of won) { const p = s.players.find((q) => q.id === id); result.winners.push({ id, amount, name: evals.get(id).name }); note(s, `${p.name} gagne ${amount} avec ${evals.get(id).name.toLowerCase()}`); }
  }
  s.pot = 0;
  s.result = result;
  s.phase = 'showdown';
  s.turn = -1;
  // éliminations
  let outRank = s.players.filter((p) => p.out).length;
  const busted = s.players.filter((p) => !p.out && p.stack === 0);
  for (const p of busted) { p.out = true; outRank++; p.rankOut = outRank; note(s, `${p.name} est éliminé`); }
  if (alive(s).length < 2 || (s.maxHands && s.handNo >= s.maxHands)) s.over = true;
}

export function nextHandOrFinish(s) {
  if (s.over) return finish(s);
  return startHand(s);
}

function finish(s) {
  s.phase = 'over';
  const n = s.players.length;
  const sorted = s.players.slice().sort((a, b) => (b.out ? b.rankOut : n + 1 + b.stack) - (a.out ? a.rankOut : n + 1 + a.stack));
  // les vivants d'abord par tapis décroissant, puis les éliminés : le dernier sorti devant
  const living = s.players.filter((p) => !p.out).sort((a, b) => b.stack - a.stack);
  const dead = s.players.filter((p) => p.out).sort((a, b) => b.rankOut - a.rankOut);
  s.ranking = living.concat(dead).map((p) => p.id);
  void sorted;
  return s;
}

export function removePlayer(s, id) {
  const p = s.players.find((q) => q.id === id);
  if (!p || p.out) return;
  if (s.phase === 'hand' && !p.folded) {
    const wasTurn = s.turn === s.players.indexOf(p);
    p.folded = true; p.lastAct = 'parti';
    p.stack = 0; p.out = true; p.rankOut = s.players.filter((q) => q.out).length;
    if (inHand(s).length <= 1) endHand(s);
    else if (wasTurn) advance(s, s.players.indexOf(p));
  } else { p.stack = 0; p.out = true; p.rankOut = s.players.filter((q) => q.out).length; }
}

// État visible par tout le monde : pas de paquet, pas de mains (sauf celles montrées à l'abattage)
export function publicState(s) {
  return {
    game: 'poker', phase: s.phase, handNo: s.handNo, maxHands: s.maxHands, blinds: s.blinds, dealer: s.dealer, turn: s.turn, street: s.street,
    board: s.board, pot: s.pot, currentBet: s.currentBet, minRaise: s.minRaise, log: s.log, ranking: s.ranking, startedAt: s.startedAt, endsAt: s.endsAt || 0, turnStarted: s.turnStarted || 0,
    players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, stack: p.stack, bet: p.bet, total: p.total, folded: p.folded, allin: p.allin, out: p.out, lastAct: p.lastAct, cards: p.out ? 0 : p.hand.length })),
    result: s.result,
  };
}

// Ce que seul ce joueur reçoit
export function privateState(s, id) {
  const p = s.players.find((q) => q.id === id);
  if (!p) return { hand: [] };
  const hand = p.hand.slice();
  const e = hand.length ? evaluate(hand.concat(s.board)) : null;
  return { hand, name: e ? e.name : '', best: e ? e.best : [] };
}
