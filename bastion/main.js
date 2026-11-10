// Bastion Clash : démarrage de partie, synchronisation réseau et boucle d'affichage.
'use strict';

initMap('vallee', 'ffa');


function switchMap(newMapId) {
  if (!MAP_DEFS[newMapId]) return;
  const base = (typeof lastBootInfo !== 'undefined' && lastBootInfo) || {};
  const baseSettings = base.settings || { mode: 'ffa', pace: 'standard', bots: 1, level: 'normal' };
  const info = { ...base, settings: { ...baseSettings, map: newMapId } };
  startMatch(info);
}


/* ============================================================================
   DÉMARRAGE DE PARTIE & SYNCHRONISATION RÉSEAU (HUB BRIDGE)
   ============================================================================ */
let lastBootInfo = null;
let netSyncTick = 0;
let pendingNetFx = [];


// Ce que voit un joueur : son équipe s'il est en jeu, tout s'il est spectateur ou éliminé
function viewerFor(id) {
  const p = state && state.players.find((q) => Number(q.id) === Number(id));
  return p && !p.dead && !p.spectator ? { team: p.team } : null;
}
function snapshotFor(id) {
  return packState(state, { viewer: viewerFor(id), ack: { [id]: clientAckSeq[id] || 0 }, pings: Object.fromEntries(state.players.map((p) => [p.id, getPlayerPing(p)])) });
}
// L'hôte envoie à chaque joueur connecté (et aux spectateurs) l'état vu par son équipe
function broadcastState(fx = []) {
  const H = window.HubBridge;
  if (!H || !H.embedded || role !== 'host' || !state) return;
  for (const p of H.players) {
    if (Number(p.id) === Number(myId)) continue;
    // instantané volatil : seul le plus récent compte, sauté si la connexion de l'hôte sature ; les effets partent à
    // part, petits et garantis
    H.send(p.id, { t: 'st', s: snapshotFor(p.id) }, { volatile: true });
    if (fx.length) H.send(p.id, { t: 'fx', fx });
  }
}

function reconcileGuestState(prev, incoming) {
  if (!incoming) return prev;
  const inLayout = incoming.mode === '2v2' || incoming.mode === '1v1' ? incoming.mode : 'ffa';
  if ((incoming.map && incoming.map !== activeMapId) || inLayout !== activeLayout) {
    initMap(incoming.map || activeMapId, inLayout);
    exploredGrid.fill(0);
  }
  if (!prev) return incoming;
  const oldPos = new Map();
  for (const u of prev.units) {
    oldPos.set(u.id, { x: u.x, y: u.y });
  }

  const acked = (incoming.ack && incoming.ack[myId]) || 0;
  const nowP = performance.now();
  while (pendingCmds.length && (pendingCmds[0].seq <= acked || nowP - pendingCmds[0].ts > 1500)) {
    pendingCmds.shift();
  }

  if (pendingCmds.length > 0) {
    const dummyFx = [];
    for (const pc of pendingCmds) {
      executeCommand(incoming, myId, pc.cmd, dummyFx);
    }
  }

  for (const u of incoming.units) {
    const o = oldPos.get(u.id);
    if (o) {
      const err = hypot(o.x, o.y, u.x, u.y);
      if (err > 0.3 && err < 95) {
        u.x = lerp(o.x, u.x, 0.45);
        u.y = lerp(o.y, u.y, 0.45);
      }
    }
  }
  return incoming;
}

// Minuterie de la simulation. Elle tourne dans un Worker : les navigateurs brident à ~1 appel par seconde
// (voire par minute) les minuteries d'un onglet caché, pas celles d'un Worker. Repli sur setInterval.
function startTicker(fn, ms) {
  try {
    const src = 'let id=null;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data);};';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = fn;
    w.postMessage(ms);
    return () => w.terminate();
  } catch (err) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}
let stopTicker = null;
if (window.HubBridge) window.HubBridge.ownBackgroundLoop = true; // notre simulation a déjà son Worker : le Hub n'a pas à relayer les images
const MAX_STEPS_PER_CALL = 60;       // 2 s de jeu rattrapées au plus d'un coup
const STEP_BUDGET_MS = 250;          // au-delà, on abandonne le retard plutôt que de geler la page

function startTickLoop(botEvery = 0) {
  if (stopTicker) stopTicker();
  const H = window.HubBridge;
  const stepMs = 1000 / TICK_RATE;
  let last = performance.now(), acc = 0, botAcc = 0;
  stopTicker = startTicker(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last), MAX_STEPS_PER_CALL * stepMs);
    last = now;
    if (!state || state.over) { acc = 0; return; }
    // La partie avance au rythme de l'horloge, même si les appels arrivent en retard (onglet caché, machine lente)
    const fx = [];
    let steps = 0, sendNow = false;
    const t0 = now;
    while (acc >= stepMs && !state.over) {
      stepWorld(state, TICK_DT, fx);
      acc -= stepMs;
      steps++;
      if (botEvery > 0) {
        botAcc += TICK_DT;
        if (botAcc >= botEvery) { botAcc = 0; runBots(state, fx); }
      }
      netSyncTick++;
      if (netSyncTick % 5 === 0) sendNow = true;
      if (performance.now() - t0 > STEP_BUDGET_MS) { acc = 0; break; }
    }
    if (!steps) return;
    handleFxEvents(fx);
    if (role === 'host' && H && H.embedded) {
      for (const e of fx) {
        if (e.k === 'ELIM' || e.k === 'PHASE') pendingNetFx.push(e);
      }
      if (sendNow || state.over) {
        broadcastState(pendingNetFx.splice(0));
        sendBackup();
      }
    }
  }, stepMs);
}

function startMatch(info) {
  lastBootInfo = info;
  reportedResult = false;
  selectedUnits.clear();
  selectedBlds.clear();
  buildMode = null;
  orderCursor = null;
  allyViews.clear();
  exploredGrid.fill(0);
  if (exploredCtx) exploredCtx.clearRect(0, 0, FOG_RES, FOG_RES);
  lastFogUpdate = 0;
  pendingCmds.length = 0;
  factionAutoSent = false;
  factionChosen = false;
  netSyncTick = 0;
  pendingNetFx = [];
  craters = [];
  particles = [];
  shockwaves = [];
  projectiles = [];
  beams = [];
  orderMarkers = [];

  if (stopTicker) { stopTicker(); stopTicker = null; }
  Sfx.wake();

  const H = window.HubBridge;
  role = H && H.embedded ? info.role : 'solo';
  myId = H && H.embedded ? info.myId : 0;

  if (role === 'guest') {
    startTickLoop();
    H.send('host', { t: 'sync' });
    return;
  }

  const settings = (info && info.settings) || { mode: 'ffa', pace: 'standard', bots: 1, level: 'normal' };
  const humans = H && H.embedded && Array.isArray(H.players) && H.players.length
    ? H.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: false }))
    : [{ id: 0, name: 'Commandant', color: PALETTE[0], bot: false }];

  // Duel : les deux premiers joueurs du salon s'affrontent (un bot si on est seul), les autres regardent
  const roster = settings.mode === '1v1' ? humans.slice(0, 2) : [...humans];
  const wantBots = settings.mode === '1v1' ? 2 - roster.length : role === 'solo'
    ? Math.max(1, Math.min(3, Number(settings.bots ?? 1)))
    : Math.max(0, Math.min(Number(settings.bots ?? 1), 4 - roster.length));
  const finalBots = roster.length + wantBots < 2 ? 2 - roster.length : wantBots;
  const usedColors = new Set(roster.map((p) => p.color));

  for (let k = 0; k < finalBots && roster.length < 4; k++) {
    const col = PALETTE.find((c) => !usedColors.has(c)) || PALETTE[roster.length % PALETTE.length];
    usedColors.add(col);
    roster.push({ id: 100 + k, name: BOT_NAMES[k], color: col, bot: true });
  }

  state = createInitialState(roster, settings);
  if (typeof setupThreeMapScenery === 'function' && threeScene) {
    setupThreeMapScenery(state.map || activeMapId);
  }
  updateFogCanvas(performance.now() + 100);
  centerOnMyHq();
  renderConsoleUI(true);
  updateHudUI();

  broadcastState();

  // Les bots réfléchissent au rythme du temps de jeu, dans la même boucle que la simulation
  const nowP = performance.now();
  for (const p of state.players) lastHeard[p.id] = nowP;
  startTickLoop(botEveryFor(settings.level));
}

/* ---------- Joueurs partis, déconnectés, de retour ; reprise par un nouvel hôte ----------
   Un joueur dont le jeu ne répond plus (8 s sans message, onglet fermé, retour au salon) est remplacé
   par un bot qui défend et développe sa base ; il reprend la main dès qu'il revient. */
const lastHeard = {};
const PRESENCE_TIMEOUT = 8000;
function botEveryFor(level) { return level === 'expert' ? 0.85 : level === 'facile' ? 2.0 : 1.25; }

function checkPresence() {
  const H = window.HubBridge;
  if (!H || !H.embedded || role !== 'host' || !state || state.over) return;
  const now = performance.now();
  const fx = [];
  for (const p of state.players) {
    if (p.bot || p.horde || p.dead || p.spectator || Number(p.id) === Number(myId)) continue;
    const inRoom = H.players.some((q) => Number(q.id) === Number(p.id));
    const inGame = !H.readyMap || H.readyMap[p.id] === H.info.game;
    const heard = lastHeard[p.id] != null && now - lastHeard[p.id] < PRESENCE_TIMEOUT;
    const here = inRoom && inGame && heard;
    if (!here && !p.afk) { p.afk = true; fx.push({ k: 'AFK', playerId: p.id, name: p.name }); }
    else if (here && p.afk) { p.afk = false; fx.push({ k: 'BACK', playerId: p.id, name: p.name }); }
  }
  if (fx.length) { handleFxEvents(fx); pendingNetFx.push(...fx); }
}

// Sauvegarde complète envoyée toutes les 2 s au seul joueur qui reprendrait la partie si l'hôte partait, choisi comme
// le fait le salon (successorOf dans shared/room.js) : un joueur présent (pas en reconnexion), de préférence l'un de
// ceux qui ont la partie ouverte, puis le plus petit numéro. Elle n'est pas affichée.
let backupState = null;
let lastBackupAt = 0;
function successorId() {
  const H = window.HubBridge;
  const others = H.players.filter((p) => Number(p.id) !== Number(myId));
  const here = others.filter((p) => !p.away);
  const inGame = here.filter((p) => H.readyMap && H.readyMap[p.id] === H.info.game);
  const pool = inGame.length ? inGame : here.length ? here : others;
  return pool.length ? Math.min(...pool.map((p) => Number(p.id))) : null;
}
function sendBackup() {
  const H = window.HubBridge;
  if (!H || !H.embedded || role !== 'host' || !state || performance.now() - lastBackupAt < 2000) return;
  lastBackupAt = performance.now();
  const id = successorId();
  if (id != null) H.send(id, { t: 'bk', s: packState(state, { viewer: null }) });
}
// État de reprise : l'état récent (vu par mon équipe) complété par la sauvegarde pour ce que je ne voyais pas
function mergeBackup(fresh, backup) {
  if (!backup) return fresh;
  const myTeam = (fresh.players.find((p) => Number(p.id) === Number(myId)) || {}).team;
  const merge = (now, old) => {
    const ids = new Set(now.map((e) => e.id));
    return [...now, ...old.filter((e) => !ids.has(e.id) && e.team !== myTeam)];
  };
  const players = fresh.players.map((p) => {
    const b = backup.players.find((q) => q.id === p.id);
    return b && p.team !== myTeam ? { ...p, minerals: b.minerals, gas: b.gas } : p;
  });
  return { ...fresh, players, units: merge(fresh.units, backup.units), buildings: merge(fresh.buildings, backup.buildings), scans: backup.scans || fresh.scans };
}

function becomeHost() {
  role = 'host';
  const H = window.HubBridge;
  myId = H.info.myId;
  pendingCmds.length = 0;
  for (const k of Object.keys(clientAckSeq)) delete clientAckSeq[k];
  const now = performance.now();
  if (!state) { startMatch({ ...(lastBootInfo || {}), role: 'host', myId }); return; }
  // On reprend depuis le dernier état reçu : il devient l'état complet de référence
  state = mergeBackup(state, backupState);
  state.partial = false;
  backupState = null;
  for (const p of state.players) lastHeard[p.id] = now;
  const settings = (lastBootInfo && lastBootInfo.settings) || {};
  startTickLoop(botEveryFor(settings.level || state.level));
  checkPresence();
  broadcastState([{ k: 'HOST_CHANGE', name: (state.players.find((p) => Number(p.id) === Number(myId)) || {}).name || '' }]);
  toast('L’hôte est parti : tu reprends la partie, elle continue.', 3600);
}

// Zone que je regarde, envoyée à mes alliés humains (cadre rose sur leur minimap) : dès qu'elle change, au plus
// 5 fois par seconde, et une fois par seconde quand elle ne bouge pas pour qu'ils sachent que je suis toujours là
let lastViewSent = { key: '', at: 0 };
function shareMyView() {
  const H = window.HubBridge;
  if (!H || !H.embedded || !state || isSpectatorView()) return;
  const allies = state.players.filter((p) => isAllyOf(p.id));
  if (!allies.length) return;
  const v = camViewRect();
  const msg = { t: 'cam', x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) };
  const key = `${msg.x},${msg.y},${msg.w},${msg.h}`;
  const now = performance.now();
  if (key === lastViewSent.key && now - lastViewSent.at < 1000) return;
  lastViewSent = { key, at: now };
  for (const p of allies) H.send(p.id, msg, { volatile: true });
}
function noteAllyView(from, m) {
  if (!isAllyOf(from) || ![m.x, m.y, m.w, m.h].every(Number.isFinite)) return;
  allyViews.set(Number(from), {
    x: clamp(m.x, 0, WORLD_SIZE), y: clamp(m.y, 0, WORLD_SIZE),
    w: clamp(m.w, 1, WORLD_SIZE * 2), h: clamp(m.h, 1, WORLD_SIZE * 2), at: performance.now(),
  });
}

if (window.HubBridge && HubBridge.embedded) {
  let centeredOnce = false;
  let lastStateAt = performance.now();

  HubBridge.on('init', (info) => {
    centeredOnce = false;
    lastStateAt = performance.now();
    if (info && info.pings) Object.assign(playerPings, info.pings);
    startMatch(info);
    HubBridge.signalReady();
  });

  HubBridge.on('pings', (pMap) => {
    if (pMap) Object.assign(playerPings, pMap);
  });

  // Le Hub a désigné ce joueur comme nouvel hôte (l'ancien est parti) : la partie reprend ici
  HubBridge.on('roster', () => {
    if (role === 'guest' && HubBridge.info.role === 'host') becomeHost();
    if (role === 'host') checkPresence();
  });

  setInterval(() => {
    if (!window.HubBridge || !HubBridge.embedded) return;
    if (HubBridge.pings) Object.assign(playerPings, HubBridge.pings);
    if (role === 'guest') {
      const now = performance.now();
      HubBridge.send('host', { t: 'gping', ts: now, myPing: playerPings[myId] });
      if (now - lastStateAt > 2500) {
        HubBridge.send('host', { t: 'sync' });
      }
    } else if (role === 'host') {
      checkPresence();
    }
  }, 1800);

  setInterval(shareMyView, 200);

  HubBridge.on('msg', (from, m) => {
    if (!m || typeof m !== 'object') return;
    // Zone regardée par un allié : elle vient directement de lui, pas de l'hôte
    if (m.t === 'cam') { noteAllyView(from, m); return; }
    if (role === 'host') {
      lastHeard[from] = performance.now();
      if (m.t === 'sync' && state) {
        checkPresence();
        HubBridge.send(from, { t: 'st', s: snapshotFor(from), fx: [] });
      } else if (m.t === 'gping') {
        if (Number.isFinite(m.myPing)) playerPings[from] = Math.max(1, Math.round(m.myPing));
        HubBridge.send(from, { t: 'gpong', ts: m.ts, pings: playerPings });
      } else if (m.t === 'cmd' && m.cmd && state) {
        if (m.seq) clientAckSeq[from] = Math.max(clientAckSeq[from] || 0, m.seq);
        const fx = [];
        const res = executeCommand(state, from, m.cmd, fx);
        if (res.ok) {
          handleFxEvents(fx);
          HubBridge.send('all', { t: 'rcmd', p: from, cmd: m.cmd, seq: m.seq });
        } else if (m.seq) {
          HubBridge.send(from, { t: 'rcmd', p: from, cmd: null, seq: m.seq });
        }
      }
    } else if (role === 'guest') {
      // Seul l'hôte fait autorité : un autre joueur ne peut pas imposer un état ni rejouer des commandes
      if (Number(from) !== Number(HubBridge.info.hostId)) return;
      if (m.t === 'gpong') {
        if (m.pings) Object.assign(playerPings, m.pings);
        if (m.ts) playerPings[myId] = Math.max(1, Math.round(performance.now() - m.ts));
      } else if (m.t === 'st' && m.s) {
        const incoming = unpackState(m.s);
        if (!incoming) return;
        lastStateAt = performance.now();
        for (const p of incoming.players || []) {
          if (!p.bot && p.ping && Number(p.id) !== Number(myId)) playerPings[p.id] = p.ping;
        }
        state = reconcileGuestState(state, incoming);
        if (!centeredOnce) {
          centeredOnce = true;
          centerOnMyHq();
          renderConsoleUI(true);
        }
        if (m.fx && m.fx.length) handleFxEvents(m.fx);
      } else if (m.t === 'fx' && Array.isArray(m.fx)) {
        if (state) handleFxEvents(m.fx);
      } else if (m.t === 'bk' && m.s) {
        backupState = unpackState(m.s);
      } else if (m.t === 'rcmd' && state) {
        lastStateAt = performance.now();
        if (Number(m.p) === Number(myId) && m.seq) {
          clientAckSeq[myId] = Math.max(clientAckSeq[myId] || 0, m.seq);
          while (pendingCmds.length && pendingCmds[0].seq <= m.seq) pendingCmds.shift();
        } else if (Number(m.p) !== Number(myId) && m.cmd) {
          const fx = [];
          executeCommand(state, m.p, m.cmd, fx, { authority: true });
          handleFxEvents(fx);
        }
      }
    }
  });
} else {
  startMatch({ role: 'solo', myId: 0, settings: { mode: 'ffa', pace: 'standard', bots: 1, level: 'normal' } });
}

let lastFrame = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  try {
    renderWorld(dt, now);
    updateHudUI();
  } catch (err) {
    console.error('Frame error:', err);
  }
}
requestAnimationFrame(loop);
