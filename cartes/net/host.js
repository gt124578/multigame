// Hôte de Tapis Vert : tient l'état complet (paquet et mains), applique les règles, fait jouer les bots.
// Il diffuse à tous l'état public (sans aucune main) et envoie à chaque joueur, en privé, ses propres cartes :
// un invité ne reçoit jamais les cartes des autres, même en fouillant le réseau ou la console.
import * as Poker from '../engine/poker.js';
import * as Belote from '../engine/belote.js';
import { pokerBotAction, beloteBotBid, beloteBotPlay, BOT_LEVELS, BOT_NAMES } from '../engine/bots.js';
import { randomSeed, nextRandom } from '../engine/rng.js';

const COLORS = ['#ff4b2b', '#2b8cff', '#ffc531', '#2fbf71', '#b45cff', '#ff5fa2', '#1fc7c1', '#ff8a1f'];
const ABSENT_MS = 15000;
export const GAME_NAMES = { poker: 'Poker (Texas Hold\'em)', belote: 'Belote' };

export function makeConfig(settings = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  return {
    game: (settings.mode || settings.game) === 'belote' ? 'belote' : 'poker',
    bots: num(settings.bots, 0),
    level: BOT_LEVELS.includes(settings.level) ? settings.level : 'normal',
    stack: num(settings.stack, 1000),
    blind: num(settings.blind, 10),
    hands: num(settings.hands, 0),
    target: num(settings.target, 501),
    turnTime: num(settings.turn, 30),
  };
}

export function startHost({ bridge, solo, settings, me, onState, onSetup, onError, initial = null }) {
  const cfg = makeConfig(settings);
  let state = null, timer = 0, botTimer = 0, reported = false, botSeed = randomSeed();
  const rand = () => { const o = nextRandom(botSeed); botSeed = o.seed; return o.value; };
  const absent = new Map();
  const humans = () => (solo ? [me] : bridge.players.map((p) => ({ id: p.id, name: p.name, color: p.color })));

  /* ---------------------------------------------------------- salle d'attente */
  function setupInfo() {
    const hs = humans();
    const need = cfg.game === 'belote' ? 4 : Math.max(2, hs.length + cfg.bots);
    const botsN = cfg.game === 'belote' ? Math.max(0, 4 - hs.length) : Math.min(cfg.bots, 6 - hs.length);
    return { game: cfg.game, gameName: GAME_NAMES[cfg.game], cfg, humans: hs, bots: botsN, canStart: cfg.game === 'belote' ? hs.length <= 4 : hs.length + botsN >= 2, need };
  }
  function sendSetup() {
    const s = setupInfo();
    if (!solo) bridge.send('all', { t: 'setup', s });
    onSetup(s);
  }

  function tablePlayers(prev = null) {
    const hs = humans();
    const list = hs.map((p, i) => ({ id: p.id, name: p.name, color: p.color || COLORS[i % COLORS.length], bot: false }));
    const botsN = cfg.game === 'belote' ? Math.max(0, 4 - list.length) : Math.min(cfg.bots, 6 - list.length);
    const names = BOT_NAMES.slice();
    for (let i = 0; i < botsN; i++) list.push({ id: 'bot' + i, name: names[(i + hs.length) % names.length], color: COLORS[(i + list.length) % COLORS.length], bot: true, level: cfg.level });
    if (cfg.game === 'belote' && list.length > 4) list.length = 4;
    if (cfg.game === 'belote') {
      // les humains en face les uns des autres quand ils sont deux (même équipe), sinon dans l'ordre
      if (hs.length === 2) [list[1], list[2]] = [list[2], list[1]];
    }
    // reprise après migration : on garde tapis / scores
    if (prev && prev.players) for (const p of list) { const q = prev.players.find((r) => r.id === p.id); if (q && q.stack != null) p.stack = q.stack; }
    return list;
  }

  function start() {
    if (state && state.phase !== 'over' && state.phase !== 'lobby') return;
    const info = setupInfo();
    if (!info.canStart) { onError(cfg.game === 'belote' ? 'La belote se joue à 4 au plus' : 'Il faut au moins 2 joueurs (ajoute des bots)'); return; }
    const players = tablePlayers();
    const seed = randomSeed();
    if (cfg.game === 'poker') {
      state = Poker.createPoker({ seed, players, stack: cfg.stack, blind: cfg.blind, hands: cfg.hands });
      Poker.startHand(state);
    } else {
      state = Belote.createBelote({ seed, players, target: cfg.target });
      Belote.startDeal(state);
    }
    reported = false;
    afterChange();
  }

  /* ---------------------------------------------------------- diffusion : public à tous, privé à chacun */
  function broadcast() {
    const E = engine();
    const pub = E.publicState(state);
    if (!solo) {
      bridge.send('all', { t: 'st', s: pub, now: Date.now() });
      for (const p of state.players) if (!p.bot && p.id !== me.id) bridge.send(p.id, { t: 'me', p: E.privateState(state, p.id) });
    }
    onState(pub, E.privateState(state, me.id), 0);
    if (state.phase === 'over' && !reported) { reported = true; report(); }
  }
  const engine = () => (state.game === 'poker' ? Poker : Belote);

  function report() {
    if (!bridge.embedded || !bridge.report) return;
    const ranking = state.ranking;
    bridge.report({
      id: `cartes-${state.startedAt}-${state.players.map((p) => p.id).join('.')}`,
      mode: GAME_NAMES[state.game],
      players: ranking.map((id, k) => {
        const p = state.players.find((q) => q.id === id);
        let rank = k + 1, score = 0;
        if (state.game === 'poker') score = p.stack;
        else { const team = Belote.teamOf(p.seat); score = state.scores[team]; rank = state.winnerTeam < 0 ? 1 : team === state.winnerTeam ? 1 : 2; }
        return { id: p.bot ? null : p.id, name: p.name, color: p.color, bot: p.bot, rank, score };
      }),
    });
  }

  /* ---------------------------------------------------------- déroulé : minuteurs */
  function afterChange() {
    clearTimeout(timer); clearTimeout(botTimer);
    if (!state) return;
    if (state.phase === 'over') { state.endsAt = 0; broadcast(); return; }
    if (state.game === 'poker') {
      if (state.phase === 'showdown') { state.endsAt = Date.now() + (state.result && state.result.shows.length ? 6500 : 3000); timer = setTimeout(() => { Poker.nextHandOrFinish(state); afterChange(); }, state.endsAt - Date.now()); }
      else planTurn();
    } else {
      if (state.stage === 'redeal') { state.endsAt = Date.now() + 2500; timer = setTimeout(() => { Belote.nextDealOrFinish(state); afterChange(); }, 2500); }
      else if (state.stage === 'scored') { state.endsAt = Date.now() + 8000; timer = setTimeout(() => { Belote.nextDealOrFinish(state); afterChange(); }, 8000); }
      else if (state.stage === 'play' && state.trick.length === 0 && state.lastTrick && !state.shownTrick) {
        // laisser voir le pli ramassé une seconde et demie
        state.shownTrick = true; state.endsAt = 0; broadcast();
        timer = setTimeout(() => { planTurn(); }, 1500);
        return;
      } else planTurn();
    }
    broadcast();
  }

  function planTurn() {
    const p = state.players[state.turn];
    if (!p) { broadcast(); return; }
    if (state.game === 'belote') state.shownTrick = false;
    if (p.bot) {
      state.endsAt = 0;
      const delay = 700 + rand() * 1100;
      botTimer = setTimeout(() => botPlay(state.turn), delay);
    } else if (cfg.turnTime > 0) {
      state.turnStarted = Date.now();
      state.endsAt = Date.now() + cfg.turnTime * 1000;
      timer = setTimeout(() => autoPlay(state.turn), cfg.turnTime * 1000);
    } else state.endsAt = 0;
    broadcast();
  }

  function botPlay(idx) {
    if (!state || state.turn !== idx) return;
    if (state.game === 'poker') Poker.act(state, idx, pokerBotAction(state, idx, rand));
    else if (state.stage === 'bid') Belote.bid(state, idx, beloteBotBid(state, idx, rand));
    else Belote.play(state, idx, beloteBotPlay(state, idx, rand));
    afterChange();
  }

  // temps écoulé : au poker on checke si possible sinon on se couche ; à la belote on passe ou on joue une carte légale
  function autoPlay(idx) {
    if (!state || state.turn !== idx) return;
    if (state.game === 'poker') { const L = Poker.legalActions(state, idx); Poker.act(state, idx, { a: L && L.check ? 'check' : 'fold' }); }
    else if (state.stage === 'bid') Belote.bid(state, idx, { a: 'pass' });
    else { const legal = Belote.legalCards(state, idx); Belote.play(state, idx, legal[Math.floor(rand() * legal.length)]); }
    afterChange();
  }

  /* ---------------------------------------------------------- actions des joueurs */
  function action(from, a) {
    if (!state || state.phase !== 'hand') return { ok: false, msg: 'Pas de main en cours' };
    const idx = state.players.findIndex((p) => p.id === from);
    if (idx < 0) return { ok: false, msg: 'Tu n\'es pas à la table' };
    let r;
    if (state.game === 'poker') r = Poker.act(state, idx, a);
    else if (a && a.a === 'card') r = Belote.play(state, idx, a.card);
    else r = Belote.bid(state, idx, a);
    if (r.ok) afterChange();
    return r;
  }

  /* ---------------------------------------------------------- réseau */
  if (!solo) {
    bridge.on('msg', (from, m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'sync') {
        if (state) { const E = engine(); bridge.send(from, { t: 'st', s: E.publicState(state), now: Date.now() }); bridge.send(from, { t: 'me', p: E.privateState(state, from) }); }
        else bridge.send(from, { t: 'setup', s: setupInfo() });
      } else if (m.t === 'act') {
        const r = action(from, m.a);
        if (!r.ok) bridge.send(from, { t: 'err', msg: r.msg });
      }
    });
    bridge.on('roster', () => {
      if (!state || state.phase === 'over') { sendSetup(); return; }
      const present = new Set(bridge.players.map((p) => p.id));
      for (const p of state.players) {
        if (p.bot) continue;
        if (present.has(p.id)) { absent.delete(p.id); continue; }
        if (!absent.has(p.id)) absent.set(p.id, setTimeout(() => leave(p.id), ABSENT_MS));
      }
    });
  }

  // un joueur parti pour de bon : au poker il quitte la table, à la belote un bot prend sa place
  function leave(id) {
    absent.delete(id);
    if (!state || state.phase === 'over') return;
    const p = state.players.find((q) => q.id === id);
    if (!p) return;
    if (state.game === 'poker') Poker.removePlayer(state, id);
    else { p.bot = true; p.name = p.name + ' (bot)'; p.level = cfg.level; }
    afterChange();
  }

  // migration d'hôte : on repart d'une nouvelle main avec les tapis / scores connus
  if (initial && initial.phase !== 'over' && initial.players) {
    const players = tablePlayers(initial);
    const seed = randomSeed();
    if (initial.game === 'poker') {
      state = Poker.createPoker({ seed, players, stack: cfg.stack, blind: cfg.blind, hands: cfg.hands });
      for (const p of state.players) { const q = initial.players.find((r) => r.id === p.id); if (q) { p.stack = q.stack; p.out = q.out || q.stack === 0; } }
      state.handNo = initial.handNo || 0;
      Poker.startHand(state);
    } else {
      state = Belote.createBelote({ seed, players, target: cfg.target });
      state.scores = (initial.scores || [0, 0]).slice(); state.dealNo = initial.dealNo || 0; state.dealer = initial.dealer ?? 3;
      Belote.startDeal(state);
    }
    afterChange();
  } else setTimeout(sendSetup, 0);

  return {
    start,
    act(a) { const r = action(me.id, a); if (!r.ok) onError(r.msg, true); },
    get state() { return state ? engine().publicState(state) : null; },
    get cfg() { return cfg; },
    teardown() { clearTimeout(timer); clearTimeout(botTimer); for (const t of absent.values()) clearTimeout(t); },
  };
}
