/* Système universel de journalisation des Crashs & Expulsions de joueurs (Hub + tous les jeux).
   Capture automatiquement :
   - Les crashs de jeu (erreurs JS non gérées, promesses rejetées, perte du contexte WebGL 3D, gel de boucle).
   - Les expulsions et déconnexions de joueurs (kick par l'hôte, salon complet, arrêt de partie par l'hôte,
     migration d'hôte, timeout réseau WebSocket 30s, onglet en arrière-plan bridé par le navigateur, saturation tampon).
   Persiste les événements dans localStorage ('dd_crash_logs_v1'), les remonte au Hub parent via postMessage,
   et les envoie à POST /api/log (écrit dans logs/crash/ sur le serveur local ou relais). */
(function () {
  if (window.DDLogger) return;

  const STORAGE_KEY = 'dd_crash_logs_v1';
  const MAX_LOCAL_LOGS = 200;
  const ORIGIN = location.origin === 'null' ? '*' : location.origin;
  const isEmbedded = (() => { try { return window.parent && window.parent !== window; } catch (e) { return false; } })();

  // Détection automatique du contexte (Hub ou identifiant du jeu)
  function detectGameId() {
    try {
      if (window.HubBridge && window.HubBridge.info && window.HubBridge.info.game) return window.HubBridge.info.game;
      const qs = new URLSearchParams(location.search);
      if (qs.get('game')) return qs.get('game');
      // jeu ouvert seul (hors du Hub) : son dossier, un par entrée de hub/games.js
      if (/\/odyssee\/test(?:\/|$)/i.test(location.pathname)) return 'odysseetest';
      const m = /\/(bastion|calcul|cartes|dogfight|convoy|david|drift|filrouge|golf|kart|minigolf|mollo|mystery|odyssee|odysseetest|outbreak|pokemon|royale|sitenoir)(?:\/|$)/i.exec(location.pathname);
      if (m) return m[1].toLowerCase();
    } catch (e) {}
    return 'hub';
  }

  // Catalogue officiel des codes de crash et d'expulsion
  const REASONS = {
    // --- CRASHS DE JEU ---
    CRASH_JS_ERROR: {
      category: 'CRASH',
      severity: 'critical',
      title: 'Erreur JavaScript fatale en cours de partie',
      cause: 'Exception non interceptée (TypeError / ReferenceError / RangeError) dans la boucle de simulation ou de rendu.',
    },
    CRASH_UNHANDLED_REJECTION: {
      category: 'CRASH',
      severity: 'error',
      title: 'Promesse rejetée non gérée (chargement / réseau / audio)',
      cause: 'Échec asynchrone lors du chargement d\'un asset (texture, modèle 3D, carte JSON, police ou WebAudio).',
    },
    CRASH_WEBGL_CONTEXT_LOST: {
      category: 'CRASH',
      severity: 'critical',
      title: 'Perte du contexte graphique 3D / WebGL (écran noir ou figé)',
      cause: 'Le pilote GPU du navigateur a réinitialisé WebGL (mémoire vidéo saturée, trop d\'onglets 3D ou mise en veille GPU).',
    },
    CRASH_ASSET_LOAD_ERROR: {
      category: 'CRASH',
      severity: 'error',
      title: 'Échec de chargement d\'un fichier critique du jeu',
      cause: 'Un script, module ES, spritesheet ou tileset requis par le jeu n\'a pas pu être téléchargé (404 ou coupure réseau).',
    },
    CRASH_IFRAME_LOAD_FAIL: {
      category: 'CRASH',
      severity: 'critical',
      title: 'Le jeu n\'a pas répondu au démarrage dans le Hub',
      cause: 'L\'iframe du jeu n\'a pas envoyé le signal "hello" au Hub (erreur d\'initialisation ou blocage réseau).',
    },

    // --- EXPULSIONS & DÉCONNEXIONS DE JOUEURS ---
    EXP_HOST_KICK: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Joueur expulsé manuellement par l\'hôte (Kick)',
      cause: 'L\'hôte du salon ou de la partie a exécuté room.kick(id) / Net.drop(cid) pour exclure ce joueur.',
    },
    EXP_ROOM_FULL: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Expulsé à la connexion : salon ou partie complète',
      cause: 'Le salon a atteint sa capacité maximale (6 joueurs sur le Hub, ou 4 à 5 joueurs selon le jeu comme Duo Drift, Bastion, Golf ou Outbreak).',
    },
    EXP_HOST_STOPPED_GAME: {
      category: 'EXPULSION',
      severity: 'info',
      title: 'Partie arrêtée par l\'hôte (retour forcé au salon)',
      cause: 'L\'hôte a quitté la partie ou cliqué sur « Arrêter pour tout le monde » (room.setGame(null)), fermant l\'iframe chez tous les invités.',
    },
    EXP_HOST_NOT_READY_DESYNC: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Expulsé de la manche : l\'hôte a quitté ou rechargé le jeu (!hostReady)',
      cause: 'Dans shared/bridge.js (patchNet), l\'état readyMap[hostId] est passé à null/autre jeu, déclenchant cb.close() et le retour au salon.',
    },
    EXP_HOST_MIGRATION_RESET: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Expulsé ou manche interrompue suite au départ de l\'hôte (migration)',
      cause: 'L\'hôte a perdu sa connexion WebSocket (host_left). Le salon migre vers un nouvel hôte ; les jeux sans reprise d\'état complet (ex. Duo Drift) ferment la course.',
    },
    EXP_WS_KEEPALIVE_TIMEOUT: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Joueur expulsé par le serveur relais (timeout WebSocket 30 s)',
      cause: 'Le serveur WebSocket (server/server.js) n\'a pas reçu de pong pendant 30 s (coupure Wi-Fi/4G ou appareil mobile verrouillé) et a coupé la socket (ws.terminate).',
    },
    EXP_TAB_BACKGROUND_THROTTLE: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Joueur déconnecté / remplacé par IA : onglet en arrière-plan (bridage navigateur)',
      cause: 'L\'onglet du joueur était caché (document.hidden = true, diag.hid = 1) : le navigateur a suspendu ses timers réseau/jeu au-delà du seuil de présence.',
    },
    EXP_SLOW_CLIENT_OVERFLOW: {
      category: 'EXPULSION',
      severity: 'warn',
      title: 'Joueur désynchronisé / expulsé : connexion saturée ou PC trop lent',
      cause: 'Le tampon WebSocket a dépassé 96 Ko (SLOW_CLIENT_BYTES) ou la boucle d\'affichage a accumulé un retard critique (diag.lag > 60 ms).',
    },
    EXP_PEER_LEFT_MIDGAME: {
      category: 'EXPULSION',
      severity: 'info',
      title: 'Déconnexion d\'un joueur en pleine partie (peer_left)',
      cause: 'La connexion WebSocket de l\'invité s\'est fermée pendant une partie active. Le salon garde sa place réservée (cid = null) en attendant sa reconnexion.',
    },
  };

  function loadLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveLogs(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_LOCAL_LOGS)));
    } catch (e) {}
  }

  function getContextMeta(extra) {
    const game = (extra && extra.game) || detectGameId();
    const hb = window.HubBridge && window.HubBridge.info ? window.HubBridge.info : {};
    const rm = window.__room || {};
    let playerName = (extra && extra.player) || null;
    if (!playerName) {
      try { playerName = JSON.parse(localStorage.getItem('dd_name')); } catch (e) {}
    }
    return {
      game,
      roomCode: (extra && extra.roomCode) || hb.code || rm.code || null,
      role: (extra && extra.role) || hb.role || rm.mode || 'solo',
      myId: extra && extra.myId != null ? extra.myId : (hb.myId != null ? hb.myId : rm.myId),
      player: playerName || 'Anonyme',
      url: location.pathname + location.search,
      hidden: typeof document !== 'undefined' ? !!document.hidden : false,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };
  }

  // Diagnostic précis de la cause d'expulsion/déconnexion d'un joueur à partir de son ping et de diag (hid, lag, net)
  function diagnoseDisconnect(ping, diag, inGame) {
    if (diag && diag.hid) {
      return {
        code: 'EXP_TAB_BACKGROUND_THROTTLE',
        detail: `Onglet en arrière-plan ou écran verrouillé (hid=1${ping ? `, dernier ping ${Math.round(ping)} ms` : ''}). Le navigateur a suspendu l'exécution réseau du joueur.`,
      };
    }
    if (diag && diag.lag > 60) {
      return {
        code: 'EXP_SLOW_CLIENT_OVERFLOW',
        detail: `PC du joueur saturé (${diag.lag} ms de retard par image${ping ? `, ping ${Math.round(ping)} ms` : ''}), provoquant une accumulation dans le tampon WebSocket.`,
      };
    }
    if (ping != null && ping > 600) {
      return {
        code: 'EXP_WS_KEEPALIVE_TIMEOUT',
        detail: `Latence réseau critique (${Math.round(ping)} ms aller-retour, réseau=${(diag && diag.net) || '?'} ms) ayant entraîné une coupure du relais WebSocket.`,
      };
    }
    if (inGame) {
      return {
        code: 'EXP_PEER_LEFT_MIDGAME',
        detail: `Fermeture soudaine du canal WebSocket en pleine partie (${ping != null ? `dernier ping ${Math.round(ping)} ms` : 'aucun ping récent'}) : coupure Wi-Fi/4G, fermeture d'onglet ou timeout relais 30 s.`,
      };
    }
    return {
      code: 'EXP_PEER_LEFT_MIDGAME',
      detail: `Déconnexion du salon (${ping != null ? `dernier ping ${Math.round(ping)} ms` : 'départ volontaire ou fermeture d\'onglet'}).`,
    };
  }

  function persistAndSend(entry) {
    const list = loadLogs();
    // Évite les doublons identiques à moins de 2 secondes d'intervalle
    const dup = list[0] && list[0].code === entry.code && list[0].game === entry.game && list[0].message === entry.message && (entry.ts - list[0].ts < 2000);
    if (dup) return list[0];

    list.unshift(entry);
    saveLogs(list);

    // Si on est dans une iframe de jeu, on remonte aussi l'événement au Hub parent
    if (isEmbedded) {
      try { window.parent.postMessage({ dd: 'hub', k: 'log', entry }, ORIGIN); } catch (e) {}
    }

    // Envoi asynchrone au serveur local (tools/serve.mjs) ou relais (server/server.js) pour écriture dans logs/crash/
    if (typeof fetch === 'function' && typeof location !== 'undefined' && location.protocol && location.protocol.startsWith('http')) {
      try {
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          keepalive: true,
        }).catch(() => {});
      } catch (e) {}
    }

    try {
      window.dispatchEvent(new CustomEvent('dd:log', { detail: entry }));
    } catch (e) {}
    return entry;
  }

  function log(code, message, extra = {}) {
    const def = REASONS[code] || {
      category: String(code).startsWith('EXP_') ? 'EXPULSION' : 'CRASH',
      severity: 'error',
      title: code,
      cause: 'Événement enregistré par DDLogger.',
    };
    const meta = getContextMeta(extra);
    const now = Date.now();
    const entry = {
      id: 'log-' + now + '-' + Math.random().toString(36).slice(2, 7),
      ts: now,
      iso: new Date(now).toISOString(),
      code,
      category: extra.category || def.category,
      severity: extra.severity || def.severity,
      title: extra.title || def.title,
      cause: extra.cause || def.cause,
      message: String(message || def.title),
      game: meta.game,
      roomCode: meta.roomCode,
      role: meta.role,
      player: extra.targetPlayer || meta.player,
      by: extra.by || null,
      stack: extra.stack || null,
      file: extra.file || null,
      line: extra.line || null,
      diagnostics: extra.diagnostics || {
        hidden: meta.hidden,
        url: meta.url,
      },
    };
    return persistAndSend(entry);
  }

  function logCrash(code, message, extra = {}) {
    return log(code || 'CRASH_JS_ERROR', message, { ...extra, category: 'CRASH' });
  }

  function logExpulsion(code, message, extra = {}) {
    return log(code || 'EXP_PEER_LEFT_MIDGAME', message, { ...extra, category: 'EXPULSION' });
  }

  // --- INTERCEPTION AUTOMATIQUE DES CRASHS (JS, PROMESSES, ASSETS, WEBGL) ---
  window.addEventListener('error', (ev) => {
    // Erreur de chargement de balise <script>, <img>, <audio>
    if (ev.target && ev.target !== window && (ev.target.tagName === 'SCRIPT' || ev.target.tagName === 'IMG')) {
      const src = ev.target.src || ev.target.href || '';
      if (ev.target.tagName === 'SCRIPT') {
        logCrash('CRASH_ASSET_LOAD_ERROR', `Échec de chargement du script : ${src}`, {
          file: src,
          cause: 'Fichier script introuvable (404) ou bloqué par le réseau.',
        });
      }
      return;
    }
    const err = ev.error;
    logCrash('CRASH_JS_ERROR', ev.message || (err && err.message) || 'Erreur JavaScript non gérée', {
      file: ev.filename || null,
      line: ev.lineno ? `${ev.lineno}:${ev.colno || 0}` : null,
      stack: err && err.stack ? String(err.stack).slice(0, 1200) : null,
    });
  }, true);

  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    const msg = r ? (r.message || String(r)) : 'Promesse rejetée sans motif';
    // Ignore les rejets bénins d'autoplay audio ou de presse-papier
    if (/play\(\) failed|NotAllowedError|clipboard/i.test(msg)) return;
    logCrash('CRASH_UNHANDLED_REJECTION', msg, {
      stack: r && r.stack ? String(r.stack).slice(0, 1200) : null,
    });
  });

  // Surveillance automatique de la perte de contexte WebGL sur tous les canvas présents et futurs
  const watchedCanvases = new WeakSet();
  function watchCanvases() {
    if (typeof document === 'undefined') return;
    for (const c of document.querySelectorAll('canvas')) {
      if (watchedCanvases.has(c)) continue;
      watchedCanvases.add(c);
      c.addEventListener('webglcontextlost', (e) => {
        logCrash('CRASH_WEBGL_CONTEXT_LOST', `Perte du contexte WebGL sur le canvas (${c.width}×${c.height})`, {
          diagnostics: { width: c.width, height: c.height, defaultPrevented: e.defaultPrevented, hidden: !!document.hidden },
        });
      });
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchCanvases);
    else watchCanvases();
    setInterval(watchCanvases, 3000);
  }

  window.DDLogger = {
    REASONS,
    log,
    logCrash,
    logExpulsion,
    diagnoseDisconnect,
    getAll: loadLogs,
    clear() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} },
    receiveFromChild(entry) {
      if (!entry || typeof entry !== 'object') return;
      persistAndSend(entry);
    },
  };
})();
