// Vue de Tapis Vert : la table (poker ou belote), les sièges, ma main (cachée par défaut), les actions, le podium.
import { cardEl } from './cards.js';
import { mountPeek } from './peek.js';
import { loadPrefs, savePrefs, CORNERS } from './prefs.js';
import { STREET_NAMES } from '../engine/poker.js';
import { teamOf } from '../engine/belote.js';
import { SUIT_SYMBOL, SUIT_NAME, label } from '../engine/deck.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SUITS_UI = [['S', '♠'], ['H', '♥'], ['D', '♦'], ['C', '♣']];

export function mountGame(root, { me, act, start, exit, isHost }) {
  const prefs = loadPrefs();
  root.className = '';
  root.innerHTML = `
  <div class="game">
    <div class="topbar">
      <div class="info"><b id="ttl">Tapis Vert</b><span id="sub"></span></div>
      <div class="tools"><button class="tool" id="tset" title="Réglages">⚙️</button><button class="tool quit" id="tquit">Quitter</button></div>
    </div>
    <div class="table" id="table"><div class="felt"><div class="center" id="center"></div></div><div id="seats"></div></div>
    <div class="mine" id="mine"></div>
    <div class="actions" id="actions" hidden></div>
    <div class="log" id="log"></div>
    <div class="toast" id="toast" hidden></div>
    <div class="overlay" id="overlay" hidden></div>
  </div>`;
  const peek = mountPeek($('.game', root), prefs);
  let state = null, mine = { hand: [] }, offset = 0, raf = 0, raiseTo = 0;

  /* ---------------------------------------------------------- réglages : son + coin de révélation */
  DDVolume.panel($('#tset'), {
    accent: '#2fbf71', kinds: ['fx'],
    sections: [{
      title: 'Discrétion (collègues qui regardent l\'écran)',
      items: [
        { label: 'Cartes cachées par défaut', get: () => prefs.hidden, set: (v) => { prefs.hidden = !!v; savePrefs(prefs); peek.enable(prefs.hidden); render(); } },
        { label: 'Coin de révélation', get: () => prefs.corner, set: (v) => { prefs.corner = v; savePrefs(prefs); peek.refresh(); renderMine(); }, options: CORNERS },
        { label: 'Taille du coup d\'œil', get: () => prefs.size, set: (v) => { prefs.size = v; savePrefs(prefs); peek.refresh(); }, options: [['small', 'Petit (discret)'], ['normal', 'Normal']] },
        { label: 'Coup d\'œil atténué (gris, peu contrasté)', get: () => prefs.dim, set: (v) => { prefs.dim = !!v; savePrefs(prefs); peek.refresh(); } },
        { label: 'Se referme seul après', get: () => prefs.autoHide, set: (v) => { prefs.autoHide = Number(v); savePrefs(prefs); }, options: [[0, 'Jamais'], [2, '2 s'], [4, '4 s'], [8, '8 s']] },
        { note: () => 'Maintiens l\'onglet 👁 du coin (ou la touche Espace) pour voir tes cartes. Les cartes des autres ne sont jamais envoyées à ton navigateur.' },
      ],
    }],
    hint: 'Espace : voir mes cartes',
  });
  $('#tquit').onclick = exit;
  peek.enable(prefs.hidden);

  let toastT = 0;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

  /* ---------------------------------------------------------- salle d'attente */
  function setup(s) {
    state = null; mine = { hand: [] }; peek.set({ hand: [] });
    $('#ttl').textContent = s.gameName; $('#sub').textContent = 'Avant la partie';
    $('#seats').innerHTML = ''; $('#center').innerHTML = ''; $('#mine').innerHTML = ''; $('#actions').hidden = true; $('#log').innerHTML = '';
    const ov = $('#overlay'); ov.hidden = false;
    const rules = s.game === 'poker'
      ? `Texas Hold'em sans limite. Tapis de départ ${s.cfg.stack}, blindes ${Math.floor(s.cfg.blind / 2)} / ${s.cfg.blind}${s.cfg.hands ? `, ${s.cfg.hands} mains` : ', jusqu\'au dernier'}.`
      : `Belote classique à 4, deux équipes, en ${s.cfg.target} points. Les humains sont assis face à face quand ils sont deux.`;
    ov.innerHTML = `<div class="panel">
      <h1>${esc(s.gameName)}</h1>
      <p>${rules}</p>
      <div class="lobby">${s.humans.map((p) => `<span class="chip" style="--pc:${esc(p.color || '#888')}">${esc(p.name)}</span>`).join('')}${Array.from({ length: s.bots }, (_, i) => `<span class="chip bot">🤖 bot ${i + 1}</span>`).join('')}</div>
      <p class="tip">🔒 Tes cartes restent cachées : maintiens l'onglet 👁 dans le coin ${CORNERS.find((c) => c[0] === prefs.corner)[1].toLowerCase()} (ou Espace) pour les voir. Change le coin dans ⚙️ Réglages.</p>
      <div class="row end">${isHost() ? `<button class="btn big primary" id="bstart" ${s.canStart ? '' : 'disabled'}>Distribuer</button>` : '<span class="wait">L\'hôte lance la partie…</span>'}</div>
    </div>`;
    const b = $('#bstart'); if (b) b.onclick = start;
  }

  /* ---------------------------------------------------------- état */
  function update(s, p, off) {
    state = s; mine = p || mine; offset = off || 0;
    render();
  }
  function render() {
    if (!state) return;
    const s = state;
    $('#overlay').hidden = true;
    const meIdx = s.players.findIndex((q) => q.id === me.id);
    $('#ttl').textContent = s.game === 'poker' ? 'Poker' : 'Belote';
    if (s.game === 'poker') $('#sub').textContent = s.phase === 'over' ? 'Partie terminée' : `Main ${s.handNo}${s.maxHands ? ' / ' + s.maxHands : ''} · ${STREET_NAMES[s.street]} · blindes ${s.blinds.sb}/${s.blinds.bb}`;
    else $('#sub').textContent = s.phase === 'over' ? 'Partie terminée' : `Donne ${s.dealNo} · ${s.trump ? 'atout ' + SUIT_SYMBOL[s.trump] + ' ' + SUIT_NAME[s.trump] : 'enchères'} · Nous ${s.scores[meIdx >= 0 ? teamOf(meIdx) : 0]} – Eux ${s.scores[meIdx >= 0 ? 1 - teamOf(meIdx) : 1]} (en ${s.target})`;
    renderSeats(meIdx);
    renderCenter(meIdx);
    renderMine();
    renderActions(meIdx);
    $('#log').innerHTML = s.log.slice(-4).map((l) => `<div>${esc(l)}</div>`).join('');
    if (s.phase === 'over') podium(meIdx);
    else if (s.game === 'belote' && s.stage === 'scored') scoreBoard(meIdx);
    cancelAnimationFrame(raf); if (s.endsAt) raf = requestAnimationFrame(tickTimer);
  }

  // sièges autour de l'ovale, moi en bas
  function seatPos(k, n) {
    const a = Math.PI / 2 + (k / n) * Math.PI * 2; // 0 = en bas, sens horaire
    return { x: 50 + 44 * Math.cos(a), y: 50 + 42 * Math.sin(a) };
  }
  function renderSeats(meIdx) {
    const s = state, n = s.players.length, box = $('#seats');
    box.innerHTML = '';
    const start = meIdx >= 0 ? meIdx : 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, p = s.players[i];
      const pos = seatPos(k, n);
      const el = document.createElement('div');
      el.className = 'seat' + (i === meIdx ? ' me' : '') + (s.turn === i && s.phase === 'hand' ? ' turn' : '') + (p.folded && !p.out && s.game === 'poker' ? ' folded' : '') + (p.out ? ' out' : '');
      el.style.left = pos.x + '%'; el.style.top = pos.y + '%'; el.style.setProperty('--pc', p.color);
      let badges = '';
      if (s.dealer === i) badges += '<span class="badge d" title="Donneur">D</span>';
      if (s.game === 'belote' && s.taker === i) badges += `<span class="badge t" title="Preneur">${SUIT_SYMBOL[s.trump] || '✋'}</span>`;
      if (s.game === 'belote') badges += `<span class="badge team ${teamOf(i) === (meIdx >= 0 ? teamOf(meIdx) : 0) ? 'us' : 'them'}">${teamOf(i) === (meIdx >= 0 ? teamOf(meIdx) : 0) ? 'Nous' : 'Eux'}</span>`;
      const money = s.game === 'poker' ? `<div class="stack">${p.out ? 'éliminé' : p.stack + (p.allin ? ' · tapis' : '')}</div>` : '';
      const bet = s.game === 'poker' && p.bet > 0 ? `<div class="bet">${p.bet}</div>` : '';
      const act = p.lastAct && s.game === 'poker' && s.phase !== 'over' ? `<div class="act">${esc(p.lastAct)}</div>` : '';
      // cartes des autres : dos (ou faces à l'abattage)
      let cards = '';
      if (i !== meIdx && !p.out) {
        const show = s.game === 'poker' && s.result && s.result.shows && s.result.shows.find((x) => x.id === p.id);
        if (show) cards = `<div class="hand tiny">${show.hand.map((c) => cardEl(c, { small: true }).outerHTML).join('')}</div><div class="hname">${esc(show.name)}</div>`;
        else if (p.cards && !p.folded) cards = `<div class="hand tiny backs">${Array.from({ length: Math.min(p.cards, 8) }, () => cardEl(null, { small: true, back: true }).outerHTML).join('')}</div>`;
      }
      const win = s.game === 'poker' && s.result && s.result.winners.find((w) => w.id === p.id);
      el.innerHTML = `<div class="plate">${badges}<div class="name">${esc(p.name)}${p.bot ? ' 🤖' : ''}</div>${money}${act}<div class="timer"><i></i></div></div>${cards}${bet}${win ? `<div class="win">+${win.amount}</div>` : ''}`;
      box.appendChild(el);
    }
  }

  function renderCenter(meIdx) {
    const s = state, c = $('#center');
    if (s.game === 'poker') {
      c.innerHTML = `<div class="board">${s.board.map((x) => cardEl(x).outerHTML).join('')}${Array.from({ length: 5 - s.board.length }, () => '<div class="card slot"></div>').join('')}</div>
        <div class="pot">${s.pot > 0 ? 'Pot ' + s.pot : s.result && s.result.pots.length ? 'Pot ' + s.result.pots.reduce((a, p) => a + p.amount, 0) : ''}</div>`;
      return;
    }
    // belote : la retourne pendant les enchères, puis le pli en cours (une carte du côté de chaque siège)
    const n = 4, start = meIdx >= 0 ? meIdx : 0;
    let html = '';
    if (s.stage === 'bid' && s.upcard) html += `<div class="upcard">${cardEl(s.upcard).outerHTML}<div class="pot">${s.bidRound === 1 ? 'Qui prend à ' + SUIT_SYMBOL[s.upcard[1]] + ' ?' : 'Deuxième tour : une autre couleur ?'}</div></div>`;
    const trick = s.trick.length ? s.trick : s.showLast && s.lastTrick ? s.lastTrick.cards : [];
    html += '<div class="trick">';
    for (const t of trick) {
      const k = (t.seat - start + n) % n; const pos = seatPos(k, n);
      const x = 50 + (pos.x - 50) * 0.42, y = 50 + (pos.y - 50) * 0.5;
      const winner = s.showLast && s.lastTrick && s.lastTrick.winner === t.seat;
      html += `<div class="tcard${winner ? ' winner' : ''}" style="left:${x}%;top:${y}%">${cardEl(t.card).outerHTML}</div>`;
    }
    html += '</div>';
    if (s.stage === 'play' && !trick.length) html += `<div class="pot">${s.tricksWon ? `Plis : ${s.tricksWon[meIdx >= 0 ? teamOf(meIdx) : 0]} – ${s.tricksWon[meIdx >= 0 ? 1 - teamOf(meIdx) : 1]}` : ''}</div>`;
    c.innerHTML = html;
  }

  /* ---------------------------------------------------------- ma main : cachée (dos) ou visible */
  function renderMine() {
    const s = state, box = $('#mine');
    if (!s) return;
    const hand = mine.hand || [];
    const legal = s.game === 'belote' && mine.legal && mine.legal.length ? mine.legal : null;
    const myTurn = s.players[s.turn] && s.players[s.turn].id === me.id;
    const pick = (c) => act({ a: 'card', card: c });
    const pokerTitle = s.game === 'poker' && mine.name ? mine.name : '';
    const beloteTitle = s.game === 'belote' && mine.belote ? 'Belote ♔♕ en main' : '';
    peek.set({ hand, legal: s.game === 'belote' && myTurn ? legal : null, title: pokerTitle || beloteTitle, onPick: pick,
      extra: s.game === 'belote' && legal && myTurn ? 'Clique une carte pour la jouer' : null });
    box.innerHTML = '';
    if (!hand.length) return;
    const w = document.createElement('div'); w.className = 'hand mine-hand';
    if (prefs.hidden) {
      w.classList.add('backs');
      for (const c of hand) w.appendChild(cardEl(null, { back: true }));
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.innerHTML = `🔒 ${hand.length} carte${hand.length > 1 ? 's' : ''} — maintiens 👁 ${CORNERS.find((c) => c[0] === prefs.corner)[1].replace(/^En /, '')} ou <kbd>Espace</kbd>`;
      box.appendChild(w); box.appendChild(hint);
    } else {
      for (const c of hand) {
        const el = cardEl(c);
        if (legal && myTurn) { if (legal.includes(c)) { el.classList.add('playable'); el.onclick = () => pick(c); } else el.classList.add('dead'); }
        w.appendChild(el);
      }
      box.appendChild(w);
      if (pokerTitle) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = pokerTitle; box.appendChild(h); }
    }
  }

  /* ---------------------------------------------------------- actions */
  function renderActions(meIdx) {
    const s = state, box = $('#actions');
    const myTurn = meIdx >= 0 && s.turn === meIdx && s.phase === 'hand';
    box.hidden = !myTurn;
    if (!myTurn) return;
    if (s.game === 'poker') {
      const p = s.players[meIdx];
      const toCall = Math.min(s.currentBet - p.bet, p.stack);
      const maxTo = p.bet + p.stack, minTo = Math.min(maxTo, s.currentBet + s.minRaise);
      if (raiseTo < minTo || raiseTo > maxTo) raiseTo = minTo;
      box.innerHTML = `<button class="btn ghost" data-a="fold">Se coucher</button>
        ${toCall === 0 ? '<button class="btn" data-a="check">Check</button>' : `<button class="btn" data-a="call">Suivre ${toCall}</button>`}
        ${maxTo > s.currentBet ? `<div class="raise"><input type="range" id="rr" min="${minTo}" max="${maxTo}" step="${Math.max(1, Math.floor(s.blinds.sb))}" value="${raiseTo}"><button class="btn yellow" data-a="raise">${s.currentBet ? 'Relancer à' : 'Miser'} <span id="rv">${raiseTo}</span></button></div>
        <button class="btn ghost" data-a="allin">Tapis ${maxTo}</button>` : ''}`;
      const rr = $('#rr'); if (rr) rr.oninput = () => { raiseTo = Number(rr.value); $('#rv').textContent = raiseTo; };
      for (const b of box.querySelectorAll('[data-a]')) b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'raise') act({ a: 'raise', to: raiseTo });
        else if (a === 'allin') act({ a: 'raise', to: maxTo });
        else act({ a });
      };
      return;
    }
    if (s.stage === 'bid') {
      if (s.bidRound === 1) box.innerHTML = `<button class="btn" data-a="take">Je prends à ${SUIT_SYMBOL[s.upcard[1]]}</button><button class="btn ghost" data-a="pass">Je passe</button>`;
      else box.innerHTML = SUITS_UI.filter(([su]) => su !== s.upcard[1]).map(([su, sym]) => `<button class="btn${su === 'H' || su === 'D' ? ' redsuit' : ''}" data-a="take" data-suit="${su}">${sym} ${SUIT_NAME[su]}</button>`).join('') + '<button class="btn ghost" data-a="pass">Je passe</button>';
      for (const b of box.querySelectorAll('[data-a]')) b.onclick = () => act(b.dataset.a === 'take' ? { a: 'take', suit: b.dataset.suit } : { a: 'pass' });
      return;
    }
    box.innerHTML = `<span class="turnmsg">À toi de jouer${prefs.hidden ? ' : ouvre 👁 et clique une carte' : ''}</span>`;
  }

  function tickTimer() {
    const s = state; if (!s || !s.endsAt) return;
    const p = s.players[s.turn]; if (!p) return;
    const el = $('#seats .seat.turn .timer i');
    if (el) {
      const total = (s.endsAt - (s.turnStarted || 0)) || 30000;
      const left = Math.max(0, s.endsAt - (Date.now() + offset));
      el.style.width = Math.min(100, (left / Math.min(total, 60000)) * 100) + '%';
      if (left > 0) raf = requestAnimationFrame(tickTimer);
    }
  }

  /* ---------------------------------------------------------- fin de donne, podium */
  function scoreBoard(meIdx) {
    const s = state, d = s.dealScore, us = meIdx >= 0 ? teamOf(meIdx) : 0, them = 1 - us;
    const ov = $('#overlay'); ov.hidden = false;
    ov.innerHTML = `<div class="panel score"><h1>${esc(d.verdict)}</h1>
      <table><tr><th></th><th>Nous</th><th>Eux</th></tr>
      <tr><td>Points des plis</td><td>${d.raw[us]}</td><td>${d.raw[them]}</td></tr>
      ${d.belote[0] || d.belote[1] ? `<tr><td>Belote</td><td>${d.belote[us]}</td><td>${d.belote[them]}</td></tr>` : ''}
      <tr class="tot"><td>Marqués</td><td>${d.gained[us]}</td><td>${d.gained[them]}</td></tr>
      <tr class="tot"><td>Total</td><td>${s.scores[us]}</td><td>${s.scores[them]}</td></tr></table>
      <p class="tip">Donne suivante dans un instant…</p></div>`;
  }

  function podium(meIdx) {
    const s = state, ov = $('#overlay'); ov.hidden = false;
    let rows;
    if (s.game === 'poker') rows = s.ranking.map((id, k) => { const p = s.players.find((q) => q.id === id); return `<li><b>${k + 1}</b> <span style="--pc:${esc(p.color)}" class="chip">${esc(p.name)}</span> <em>${p.stack} jetons</em></li>`; });
    else {
      const us = meIdx >= 0 ? teamOf(meIdx) : 0;
      const won = s.winnerTeam < 0 ? 'Égalité !' : s.winnerTeam === us ? 'Victoire de notre équipe !' : 'L\'autre équipe l\'emporte';
      rows = [`<li class="big">${won}</li>`, `<li>Nous : <b>${s.scores[us]}</b> — Eux : <b>${s.scores[1 - us]}</b></li>`];
    }
    ov.innerHTML = `<div class="panel"><h1>${s.game === 'poker' ? 'Fin de la partie' : 'Belote terminée'}</h1><ol class="podium">${rows.join('')}</ol>
      <div class="row end">${isHost() ? '<button class="btn big primary" id="bstart">Rejouer</button>' : ''}<button class="btn ghost big" id="bquit">Retour au salon</button></div></div>`;
    const b = $('#bstart'); if (b) b.onclick = start;
    $('#bquit').onclick = exit;
  }

  return { setup, update, toast, error: (msg) => toast(msg) };
}
