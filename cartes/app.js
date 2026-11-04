// Démarrage de Tapis Vert : rôle (hôte, invité, solo), session réseau et vue.
import { startHost } from './net/host.js';
import { startClient } from './net/client.js';
import { mountGame } from './view/game.js';

const H = window.HubBridge;
const root = document.getElementById('app');

function boot(info) {
  const role = H.embedded ? info.role : 'solo';
  const meP = H.players.find((p) => p.id === info.myId);
  const prof = (() => { try { return { name: JSON.parse(localStorage.getItem('dd_name')) || 'Moi', color: JSON.parse(localStorage.getItem('dd_color')) || '#ff4b2b' }; } catch (e) { return { name: 'Moi', color: '#ff4b2b' }; } })();
  const me = { id: H.embedded ? info.myId : 0, name: meP ? meP.name : prof.name, color: meP ? meP.color : prof.color };
  const qs = new URLSearchParams(location.search);
  // hors du Hub (cartes/?game=belote&bots=3) : réglages dans l'adresse
  const settings = H.embedded ? info.settings || {} : {
    mode: qs.get('game') || qs.get('mode') || 'poker', bots: qs.get('bots') ?? 3, level: qs.get('level') || 'normal',
    stack: qs.get('stack'), blind: qs.get('blind'), hands: qs.get('hands'), target: qs.get('target'), turn: qs.get('turn'),
  };
  let current = role, session;
  const view = mountGame(root, {
    me,
    act: (a) => session.act(a),
    start: () => session.start(),
    exit: () => { if (session.teardown) session.teardown(); if (H.embedded) H.exit(); else location.reload(); },
    isHost: () => current !== 'guest',
  });
  const handlers = { onState: (s, p, off) => view.update(s, p, off), onSetup: (s) => view.setup(s), onError: (msg) => view.error(msg) };
  if (role === 'guest') session = startClient({ bridge: H, me, ...handlers });
  else session = startHost({ bridge: H, solo: role === 'solo', settings, me, ...handlers });
  // L'hôte est parti et ce joueur reprend le salon : nouvelle main avec les tapis / scores connus
  H.on('roster', () => {
    if (current === 'guest' && H.info.role === 'host') {
      current = 'host';
      const last = session.state;
      session.teardown && session.teardown();
      session = startHost({ bridge: H, solo: false, settings, me, ...handlers, initial: last });
      view.toast(last ? 'Tu reprends la partie en tant qu\'hôte : on redistribue' : 'Tu es maintenant l\'hôte');
    }
  });
  H.signalReady();
  if (qs.has('debug')) window.__cartes = { get session() { return session; }, view };
}

if (H.embedded) H.on('init', boot);
else boot({ role: 'solo', myId: 0 });
