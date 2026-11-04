// Tests du moteur de Tapis Vert (poker et belote) : node tools/test-cartes.mjs
import assert from 'node:assert/strict';
import { evaluate } from '../cartes/engine/hands.js';
import { createPoker, startHand, act, legalActions, publicState, privateState, nextHandOrFinish, removePlayer } from '../cartes/engine/poker.js';
import { createBelote, startDeal, bid, play, legalCards, publicState as belotePublic, privateState as belotePrivate, nextDealOrFinish, trickWinner } from '../cartes/engine/belote.js';
import { pokerBotAction, beloteBotBid, beloteBotPlay } from '../cartes/engine/bots.js';
import { nextRandom } from '../cartes/engine/rng.js';

let seed = 12345;
const rand = () => { const o = nextRandom(seed); seed = o.seed; return o.value; };
let n = 0;
const ok = (msg) => { n++; };

/* ---------------------------------------------------------- combinaisons */
const cat = (cards) => evaluate(cards).cat;
assert.equal(cat(['AS', 'KS', 'QS', 'JS', 'TS']), 8); assert.equal(evaluate(['AS', 'KS', 'QS', 'JS', 'TS']).name, 'Quinte flush royale');
assert.equal(cat(['9S', '9H', '9D', '9C', '2S']), 7);
assert.equal(cat(['9S', '9H', '9D', '2C', '2S']), 6);
assert.equal(cat(['2S', '7S', '9S', 'JS', 'KS']), 5);
assert.equal(cat(['AS', '2H', '3D', '4C', '5S']), 4); // roue
assert.equal(cat(['9S', '9H', '9D', '4C', '2S']), 3);
assert.equal(cat(['9S', '9H', '4D', '4C', '2S']), 2);
assert.equal(cat(['9S', '9H', '4D', '7C', '2S']), 1);
assert.equal(cat(['9S', 'KH', '4D', '7C', '2S']), 0);
assert.ok(evaluate(['AS', 'AH', '2D', '3C', '4S']).score > evaluate(['KS', 'KH', 'AD', 'QC', 'JS']).score, 'paire d\'as > paire de rois');
assert.ok(evaluate(['6S', '7H', '8D', '9C', 'TS']).score > evaluate(['AS', '2H', '3D', '4C', '5S']).score, 'quinte au dix > roue');
// 7 cartes : la meilleure des 21 combinaisons
const e7 = evaluate(['AS', 'AH', 'KS', 'KH', 'KD', '2C', '3C']);
assert.equal(e7.cat, 6); assert.equal(e7.name, 'Full aux rois par les as');
ok('combinaisons');

/* ---------------------------------------------------------- poker : une partie entière entre bots */
function playPoker(nPlayers, level) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({ id: i, name: 'B' + i, color: '#000', bot: true, level }));
  const s = createPoker({ seed: 42 + nPlayers, players, stack: 500, blind: 10 });
  startHand(s);
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 20000) {
    if (s.phase === 'showdown') {
      // conservation des jetons
      const total = s.players.reduce((a, p) => a + p.stack, 0);
      assert.equal(total, 500 * nPlayers, 'les jetons ne se créent ni ne disparaissent');
      assert.ok(s.result && s.result.winners.length >= 1);
      nextHandOrFinish(s);
      continue;
    }
    assert.equal(s.phase, 'hand');
    const idx = s.turn;
    assert.ok(idx >= 0, 'un joueur doit agir');
    const L = legalActions(s, idx);
    assert.ok(L, 'actions légales pour le joueur au tour');
    // l'état public ne contient aucune main
    const pub = publicState(s);
    for (const p of pub.players) assert.equal(p.hand, undefined);
    assert.equal(pub.deck, undefined);
    const priv = privateState(s, idx);
    assert.equal(priv.hand.length, 2);
    const a = pokerBotAction(s, idx, rand);
    const r = act(s, idx, a);
    assert.ok(r.ok, r.msg);
  }
  assert.equal(s.phase, 'over', 'la partie se termine');
  assert.equal(s.ranking.length, nPlayers);
  assert.equal(s.players.find((p) => p.id === s.ranking[0]).stack, 500 * nPlayers, 'le vainqueur a tous les jetons');
  return s;
}
for (const np of [2, 3, 6]) for (const level of ['facile', 'normal', 'expert']) playPoker(np, level);
ok('poker : parties entre bots');

// refus : jouer hors de son tour, checker face à une mise
{
  const players = [0, 1, 2].map((i) => ({ id: i, name: 'P' + i, color: '#000' }));
  const s = createPoker({ seed: 7, players, stack: 100, blind: 10 });
  startHand(s);
  const other = (s.turn + 1) % 3;
  assert.equal(act(s, other, { a: 'fold' }).ok, false);
  assert.equal(act(s, s.turn, { a: 'check' }).ok, false, 'pas de check face à la grosse blinde');
  assert.equal(act(s, s.turn, { a: 'call' }).ok, true);
  // pots secondaires : tapis inégaux
  const s2 = createPoker({ seed: 9, players, stack: 100, blind: 10 });
  s2.players[0].stack = 30; s2.players[1].stack = 60; s2.players[2].stack = 100;
  startHand(s2);
  let guard = 0;
  while (s2.phase === 'hand' && guard++ < 20) act(s2, s2.turn, { a: 'raise', to: legalActions(s2, s2.turn).allin });
  assert.equal(s2.phase, 'showdown');
  assert.equal(s2.players.reduce((a, p) => a + p.stack, 0), 190);
  assert.ok(s2.result.pots.length >= 2, 'au moins deux pots');
  // départ d'un joueur en cours de main
  const s3 = createPoker({ seed: 11, players, stack: 100, blind: 10 });
  startHand(s3);
  removePlayer(s3, s3.turn);
  assert.ok(s3.players.filter((p) => p.out).length === 1);
  assert.ok(s3.phase === 'hand' || s3.phase === 'showdown');
}
ok('poker : refus, pots secondaires, départ');

/* ---------------------------------------------------------- belote */
// vainqueur d'un pli
assert.equal(trickWinner([{ seat: 0, card: 'AH' }, { seat: 1, card: '7S' }, { seat: 2, card: 'TH' }, { seat: 3, card: 'KH' }], 'C'), 0);
assert.equal(trickWinner([{ seat: 0, card: 'AH' }, { seat: 1, card: '7S' }, { seat: 2, card: 'TH' }, { seat: 3, card: 'KH' }], 'S'), 1, 'l\'atout coupe');
assert.equal(trickWinner([{ seat: 0, card: 'JS' }, { seat: 1, card: '9S' }, { seat: 2, card: 'AS' }, { seat: 3, card: 'KS' }], 'S'), 0, 'le valet d\'atout est maître');

// obligations
{
  const players = [0, 1, 2, 3].map((i) => ({ id: i, name: 'P' + i, color: '#000', bot: true, level: 'normal' }));
  const s = createBelote({ seed: 5, players, target: 501 });
  startDeal(s);
  s.trump = 'S'; s.stage = 'play'; s.taker = 0; s.trickLeader = 0; s.turn = 0; s.trick = [];
  s.players[0].hand = ['AH', '7C', '8C', '9C', 'TC', 'JC', 'QC', 'KC'];
  s.players[1].hand = ['7H', 'KH', '8H', '9H', '7S', 'TD', 'JD', 'QD'];
  s.players[2].hand = ['9S', 'JS', '7D', 'AD', 'KD', 'AC', '8D', '9D'];
  s.players[3].hand = ['TH', 'JH', 'QH', '8S', 'QS', 'KS', 'TS', 'AS'];
  assert.ok(play(s, 0, 'AH').ok);
  assert.deepEqual(legalCards(s, 1).sort(), ['7H', '8H', '9H', 'KH'], 'fournir à la couleur');
  assert.ok(play(s, 1, '7H').ok);
  // le siège 2 n'a pas de cœur, son partenaire (0) est maître : il peut tout jouer
  assert.equal(legalCards(s, 2).length, 8);
  assert.ok(play(s, 2, '7D').ok);
  assert.ok(play(s, 3, 'TH').ok);
  assert.equal(s.lastTrick.winner, 0);
  // siège 0 mène trèfle ; 1 n'en a pas, l'adversaire est maître : doit couper
  assert.ok(play(s, 0, 'KC').ok);
  assert.deepEqual(legalCards(s, 1), ['7S'], 'couper quand on ne peut pas fournir');
  assert.ok(play(s, 1, '7S').ok);
  // siège 2 a trèfle : doit fournir même si coupé
  assert.deepEqual(legalCards(s, 2), ['AC']);
  assert.ok(play(s, 2, 'AC').ok);
  // siège 3 : pas de trèfle, mais son partenaire (1) est maître avec le 7S : libre de jouer ce qu'il veut
  assert.equal(legalCards(s, 3).length, 7);
  assert.ok(play(s, 3, 'JH').ok);
  assert.equal(s.lastTrick.winner, 1);
  // siège 1 mène carreau ; le siège 2 fournit ; siège 3 n'a pas de carreau, l'adversaire (2) est maître : il doit couper
  assert.ok(play(s, 1, 'TD').ok);
  assert.ok(play(s, 2, 'AD').ok);
  assert.deepEqual(legalCards(s, 3).sort(), ['8S', 'AS', 'KS', 'QS', 'TS'].sort(), 'couper');
  assert.ok(play(s, 3, '8S').ok);
  // siège 0 n'a pas de carreau ; l'adversaire (3) a coupé avec le 8S et le siège 0 n'a pas d'atout : libre
  assert.equal(legalCards(s, 0).length, 6);
}
ok('belote : obligations');

function playBelote(target, level) {
  const players = [0, 1, 2, 3].map((i) => ({ id: i, name: 'B' + i, color: '#000', bot: true, level }));
  const s = createBelote({ seed: 77 + target, players, target });
  startDeal(s);
  let steps = 0, deals = 0;
  while (s.phase !== 'over' && steps++ < 50000) {
    if (s.stage === 'redeal') { nextDealOrFinish(s); continue; }
    if (s.stage === 'scored') {
      deals++;
      const d = s.dealScore;
      assert.ok(d.raw[0] + d.raw[1] === 162, 'les plis font 162 points avec le dix de der');
      assert.ok(d.gained[0] + d.gained[1] >= 162);
      const pub = belotePublic(s);
      assert.equal(pub.players[0].hand, undefined);
      nextDealOrFinish(s);
      continue;
    }
    const seat = s.turn;
    assert.ok(seat >= 0);
    if (s.stage === 'bid') { const r = bid(s, seat, beloteBotBid(s, seat, rand)); assert.ok(r.ok, r.msg); }
    else {
      const priv = belotePrivate(s, seat);
      assert.ok(priv.legal.length > 0);
      const c = beloteBotPlay(s, seat, rand);
      assert.ok(priv.legal.includes(c), 'le bot joue une carte légale');
      const r = play(s, seat, c); assert.ok(r.ok, r.msg);
    }
  }
  assert.equal(s.phase, 'over');
  assert.ok(deals >= 3, 'plusieurs donnes');
  assert.ok(Math.max(...s.scores) >= target);
  assert.equal(s.ranking.length, 4);
  return s;
}
for (const level of ['facile', 'normal', 'expert']) playBelote(501, level);
playBelote(1001, 'normal');
ok('belote : parties entre bots');

console.log(`OK — ${n} groupes de tests passés (tapis vert : combinaisons, poker, belote)`);
