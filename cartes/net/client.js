// Invité de Tapis Vert : envoie ses intentions à l'hôte, reçoit l'état public et, en privé, ses propres cartes.
export function startClient({ bridge, onState, onSetup, onError }) {
  let state = null, mine = { hand: [] };
  bridge.on('msg', (from, m) => {
    if (from !== bridge.info.hostId || !m || typeof m !== 'object') return;
    if (m.t === 'st' && m.s) { state = m.s; onState(state, mine, (m.now || Date.now()) - Date.now()); }
    else if (m.t === 'me' && m.p) { mine = m.p; if (state) onState(state, mine, 0); }
    else if (m.t === 'setup' && m.s && (!state || state.phase === 'over')) { state = null; onSetup(m.s); }
    else if (m.t === 'err') onError(m.msg, true);
  });
  // nouvel hôte (migration) : on lui redemande l'état complet
  let hostSeen = bridge.info.hostId;
  bridge.on('roster', () => { if (bridge.info.hostId !== hostSeen) { hostSeen = bridge.info.hostId; setTimeout(() => bridge.send('host', { t: 'sync' }), 300); } });
  let got = false;
  const ask = setInterval(() => { if (got) clearInterval(ask); else bridge.send('host', { t: 'sync' }); }, 1500);
  const origSetup = onSetup; onSetup = (s) => { got = true; origSetup(s); };
  const origState = onState; onState = (s, p, o) => { got = true; origState(s, p, o); };
  return {
    start() {},
    act(a) { bridge.send('host', { t: 'act', a }); },
    get state() { return state; },
    teardown() { clearInterval(ask); },
  };
}
