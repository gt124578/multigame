const WS_SERVER_URL = "wss://duo-drift-relay.onrender.com";

/* Réseau en étoile entre amis, via serveur relais WebSocket.
   L'hôte ouvre un salon <préfixe><CODE> ; les invités s'y connectent ; le serveur relaie les paquets.
   ?local dans l'adresse : remplace WebSocket par un BroadcastChannel pour tester entre onglets.
   ?ws=wss://... : surcharge l'URL du serveur relais.
   Usage : const net = DDNet.create({ prefix: 'ddhub-v1-', maxPeers: 5 }); net.host(cb) / net.join(code, cb).

   Messages « volatils » (to / toHost / bcast avec vol = true) : instantanés d'état envoyés en continu, dont seul le plus
   récent compte. Quand la connexion sature (tampon d'envoi plein), on les saute au lieu de les empiler : sinon la file
   d'attente grossit et le joueur se retrouve avec des secondes de retard (ping à 1 500 ms) alors que sa connexion est bonne.
   Le serveur relais fait de même pour chaque destinataire.

   Coupures (protocole 3) : le serveur garde notre place une vingtaine de secondes. On s'en aperçoit vite (sonde sans
   réponse, retour du réseau, onglet qui revient au premier plan), on se reconnecte et on reprend la place : le serveur
   renvoie ce qu'on a manqué, on renvoie ce qu'il n'a pas reçu (messages numérotés, accusés de réception dans les sondes).
   Le salon et la partie continuent sans rien remarquer. Si la place est perdue, l'invité rentre à nouveau dans le salon
   (cb.open est rappelé) et l'hôte rouvre le même code (cb.reset), ou laisse cb.lost décider.
   Rappels facultatifs : cb.status('down' | 'up'), hôte : cb.away(cid, coupé ?), invité : cb.hostAway(coupé ?). */
(function () {
  // Minuteries de la connexion (sonde, reconnexion, reprise de place) : un onglet caché depuis quelques minutes ne
  // réveille plus ses minuteries qu'une fois par minute (Chrome). L'hôte qui attend son tour dans un autre onglet
  // dépassait alors les 20 s pendant lesquelles le relais lui garde sa place, et le salon cassait à la moindre
  // micro-coupure. Elles passent par un Worker, que les navigateurs ne brident pas (repli : minuteries de la page).
  const { setTimeout, setInterval, clearTimeout, clearInterval } = (function workerTimers() {
    const native = { setTimeout: window.setTimeout.bind(window), setInterval: window.setInterval.bind(window), clearTimeout: window.clearTimeout.bind(window), clearInterval: window.clearInterval.bind(window) };
    let w;
    try {
      const src = 'const t=new Map();onmessage=(e)=>{const[k,id,ms]=e.data;'
        + 'if(k==="c"){clearTimeout(t.get(id));clearInterval(t.get(id));t.delete(id);}'
        + 'else if(k==="t"){t.set(id,setTimeout(()=>{t.delete(id);postMessage(id);},ms));}'
        + 'else{t.set(id,setInterval(()=>postMessage(id),ms));}};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url);
      URL.revokeObjectURL(url);
    } catch (e) { return native; }
    const jobs = new Map();
    let seq = 0;
    w.onmessage = (e) => {
      const j = jobs.get(e.data); if (!j) return;
      if (!j.repeat) jobs.delete(e.data);
      try { j.fn(); } catch (err) { console.error(err); }
    };
    const add = (repeat) => (fn, ms) => { const id = ++seq; jobs.set(id, { fn, repeat }); w.postMessage([repeat ? 'i' : 't', id, Math.max(0, Number(ms) || 0)]); return id; };
    const clear = (id) => { if (id && jobs.delete(id)) w.postMessage(['c', id]); };
    return { setTimeout: add(false), setInterval: add(true), clearTimeout: clear, clearInterval: clear };
  })();
  const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const genCode = () => Array.from({ length: 4 }, () => CODE_ALPHA[(Math.random() * CODE_ALPHA.length) | 0]).join('');
  const QS = new URLSearchParams(location.search);
  const LOCAL_TEST = QS.has('local');
  const getWsUrl = () => QS.get('ws') || WS_SERVER_URL;
  const getHttpUrl = () => getWsUrl().replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');

  // Réveil automatique du serveur Render dès l'ouverture de la page (évite l'attente de 50s à la création du salon)
  function wakeServer() {
    if (LOCAL_TEST) return;
    try { fetch(getHttpUrl(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {}
  }
  wakeServer();

  const BLOCKED = "Impossible de joindre le serveur relais WebSocket. Vérifie ta connexion internet ou réessaie dans quelques secondes.";
  const SEND_BUFFER_MAX = 48 * 1024; // au-delà, la connexion n'arrive plus à suivre : les messages volatils attendront le suivant
  // volatil : true, 1 (ce que passe le salon de l'hôte) ou { volatile: true }. Sans le 1, tous les instantanés de l'hôte
  // partaient comme des messages garantis : jamais sautés quand sa connexion sature, renvoyés par milliers à la reprise
  const isVol = (o) => (o && typeof o === 'object' ? !!o.volatile : !!o);
  const PROTO = 3;
  const OUTBOX_MAX = 3000;   // messages gardés en attendant l'accusé de réception du serveur
  const DEAD_MS = 14000;      // sonde sans réponse : connexion morte, on en ouvre une autre
  const FROZEN_MS = 2000;    // la sonde n'a pas pu tourner pendant ce temps : c'est la page qui était figée
  const GIVE_UP_MS = 90000;  // serveur injoignable depuis une minute : on abandonne
  const REJOIN_MS = 25000;   // place perdue : le temps que l'hôte rouvre son salon

  // Réseau revenu ou onglet de nouveau au premier plan : on vérifie tout de suite la connexion de chaque salon
  const nets = new Set();
  const checkAll = () => { for (const n of nets) n._check(); };
  addEventListener('online', checkAll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAll(); });

  function create({ prefix, maxPeers = 5 }) {
    const net = {
      ws: null, bc: null, links: new Map(), hostLink: null, cb: null, cidc: 0, role: null, code: null, roomId: null, pingIv: null, retryTo: null,
      proto: 1, stats: { sent: 0, dropped: 0, resumed: 0, reconnects: 0 },
      gen: 0, up: false, established: false, opened: false, dead: false, lostAt: 0, downs: 0, wasDown: false,
      sid: null, skey: null, rseq: 0, ackSent: 0, cseq: 0, outbox: [], rejoinUntil: 0,

      _reset() {
        this.gen++; this._stopKeepAlive(); clearTimeout(this.retryTo); clearTimeout(this.joinTo); clearTimeout(this.rejoinTo);
        const w = this.ws;
        if (w) { w.onclose = w.onmessage = w.onopen = null; try { w.close(); } catch (e) {} }
        this.ws = null; this.up = false; this.established = false; this.opened = false; this.dead = false;
        this.lostAt = 0; this.downs = 0; this.wasDown = false; this.signaled = false;
        this.sid = null; this.skey = null; this.rseq = 0; this.ackSent = 0; this.cseq = 0; this.outbox = []; this.rejoinUntil = 0; this.placeLost = false;
      },
      // fixedCode : code imposé (migration d'hôte) ; sinon un code au hasard
      host(cb, fixedCode) {
        this._reset();
        this.role = 'host'; this.cb = cb; this.links = new Map();
        const code = fixedCode || genCode(); this.code = code; this.fixed = !!fixedCode;
        const roomId = prefix + code; this.roomId = roomId;
        if (LOCAL_TEST) {
          const bc = new BroadcastChannel(roomId); this.bc = bc; setTimeout(() => cb.ready(code), 30);
          bc.onmessage = (e) => {
            const m = e.data; if (!m) return;
            if (m.k === 'hi') {
              if (this.links.size >= maxPeers) { bc.postMessage({ k: 'full', to: m.cid }); return; }
              const cid = m.cid;
              this.links.set(cid, { send: (x) => bc.postMessage({ k: 'd', to: cid, m: x }), close: () => bc.postMessage({ k: 'bye', to: cid }) });
              bc.postMessage({ k: 'ok', to: cid }); cb.join(cid);
            } else if (m.to === 'host') {
              if (m.k === 'd') { if (this.links.has(m.from)) cb.msg(m.from, m.m); } else if (m.k === 'bye') this._drop(m.from);
            }
          };
          return;
        }
        nets.add(this);
        this.deadline = Date.now() + 60000;
        this._open();
      },
      join(code, cb, timeout = 60000) {
        this._reset();
        this.role = 'guest'; this.cb = cb; this.code = code;
        const roomId = prefix + code; this.roomId = roomId;
        this.deadline = Date.now() + timeout;
        this.joinTo = setTimeout(() => this._fail(this.signaled ? "Aucun salon avec ce code ou l'hôte ne répond pas." : BLOCKED), timeout);
        if (LOCAL_TEST) {
          const cid = 'g' + Math.random().toString(36).slice(2, 9), bc = new BroadcastChannel(roomId); this.bc = bc; let closed = false;
          this.hostLink = { send: (x) => bc.postMessage({ k: 'd', to: 'host', from: cid, m: x }), close: () => bc.postMessage({ k: 'bye', to: 'host', from: cid }) };
          bc.onmessage = (e) => {
            const m = e.data; if (!m || m.to !== cid) return;
            if (m.k === 'ok') this._opened();
            else if (m.k === 'full') this._fail(`Le salon est complet (${maxPeers + 1} joueurs max).`);
            else if (m.k === 'd') cb.msg(m.m);
            else if (m.k === 'bye' && !closed) { closed = true; cb.close(); }
          };
          bc.postMessage({ k: 'hi', cid }); return;
        }
        this.hostLink = {
          send: (x, v) => this._relay('host', x, v),
          close: () => this._relay('host', { _ctrl: 'bye' }),
        };
        nets.add(this);
        this._open();
      },

      /* ---------- connexion ---------- */
      _open() {
        const gen = ++this.gen;
        clearTimeout(this.retryTo);
        wakeServer();
        let ws;
        try { ws = new WebSocket(getWsUrl()); } catch (e) { this._down(gen); return; }
        this.ws = ws; this.up = false;
        ws.onopen = () => {
          if (gen !== this.gen) return;
          this.signaled = true;
          this._startKeepAlive(ws);
          if (this.sid) this._raw({ type: 'resume', sid: this.sid, key: this.skey, ack: this.rseq });
          else if (this.placeLost) { this.placeLost = false; this._lost('expired'); } // hôte dont la file a débordé (_overflow)
          else this._joinRoom();
        };
        ws.onmessage = (ev) => { if (gen === this.gen) { this.lastIn = performance.now(); this._onMsg(ev.data); } };
        ws.onclose = () => this._down(gen);
      },
      _joinRoom() {
        this._raw(this.role === 'host'
          ? { type: 'join_room', roomId: this.roomId, role: 'host', maxPeers, proto: PROTO }
          : { type: 'join_room', roomId: this.roomId, role: 'guest', proto: PROTO });
      },
      // La connexion en cours est tombée (ou jugée morte) : on en rouvre une
      _down(gen) {
        if (gen !== this.gen || !this.role || this.dead) return;
        this.gen++; this._stopKeepAlive();
        const ws = this.ws; this.ws = null; this.up = false;
        if (ws) { ws.onclose = ws.onmessage = ws.onopen = null; try { ws.close(); } catch (e) {} }
        if (!this.established && !this.opened) {
          if (Date.now() < this.deadline) this.retryTo = setTimeout(() => this._open(), 2500);
          else this._fail(BLOCKED);
          return;
        }
        if (!this.wasDown) { this.wasDown = true; this._status('down'); }
        if (!this.lostAt) this.lostAt = Date.now();
        if (Date.now() - this.lostAt > GIVE_UP_MS) { this._giveUp(); return; }
        this.stats.reconnects++;
        this.retryTo = setTimeout(() => this._open(), this.downs++ < 2 ? 250 : 1500);
      },
      _up() {
        this.up = true; this.lostAt = 0; this.downs = 0;
        if (this.wasDown) { this.wasDown = false; this._status('up'); }
      },
      _status(s) { if (this.cb && this.cb.status) this.cb.status(s); },
      _check() {
        if (!this.role || this.dead || LOCAL_TEST) return;
        if (!this.ws) { if (this.retryTo) { clearTimeout(this.retryTo); this._open(); } return; }
        // sonde immédiate, jugée plus sévèrement
        if (this.ws.readyState === WebSocket.OPEN && !this.probeAt) this._probe(this.ws);
        this.fastCheck = performance.now();
      },
      _giveUp() {
        const cb = this.cb, role = this.role;
        this.dead = true; this.gen++; this._stopKeepAlive(); clearTimeout(this.retryTo);
        if (role === 'host') cb.error(BLOCKED);
        else if (cb.close) cb.close();
      },
      _fail(msg) {
        if (this.opened || this.dead) return;
        this.dead = true; this.gen++; this._stopKeepAlive(); clearTimeout(this.retryTo); clearTimeout(this.joinTo);
        const ws = this.ws; this.ws = null;
        if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch (e) {} }
        this.cb.error(msg);
      },
      _opened() {
        clearTimeout(this.joinTo);
        this.opened = true;
        this.cb.open();
      },
      // L'hôte est parti (ou nous a renvoyés) : l'invité le signale une seule fois
      _closed() {
        if (this.dead) return;
        this.dead = true; this.gen++; this._stopKeepAlive(); clearTimeout(this.retryTo); clearTimeout(this.rejoinTo);
        if (this.cb && this.cb.close) this.cb.close();
      },

      _onMsg(raw) {
        let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.s) {
          if (msg.s <= this.rseq) return; // déjà reçu avant la coupure
          this.rseq = msg.s;
          if (this.rseq - this.ackSent >= 64) { this.ackSent = this.rseq; this._raw({ type: 'ack', a: this.rseq }); }
        }
        switch (msg.type) {
          case 'pong': this._pong(msg.ts); if (msg.ack != null) this._acked(msg.ack); return;
          case 'ping': this._raw({ type: 'pong', roomId: this.roomId, ts: msg.ts }); return;
          case 'room_joined':
            this.proto = msg.proto || 1; // 2 : relais sans relecture des données ; 3 : places qui survivent aux coupures
            if (this.proto >= 3 && msg.sid) { this.sid = msg.sid; this.skey = msg.key; } else { this.sid = null; this.skey = null; }
            this.rseq = 0; this.ackSent = 0; this.cseq = 0; this.outbox = [];
            this._up();
            if (this.role === 'host') {
              const first = !this.established; this.established = true;
              if (first) this.cb.ready(this.code);
              else if (this.cb.reset) this.cb.reset();
            } else this._relay('host', { _ctrl: 'hi' });
            return;
          case 'resumed':
            this.stats.resumed++;
            this._acked(msg.ack);
            for (const [, f] of this.outbox) this._sendFrame(f); // avant tout nouveau message, pour garder l'ordre
            this._up();
            return;
          case 'resume_failed': this._lost(msg.reason); return;
          case 'error': this._onError(msg); return;
          case 'host_left':
            if (this.role !== 'guest') return;
            if (!this.opened) this._fail("Aucun salon avec ce code. Vérifie-le avec ton pote.");
            else this._closed();
            return;
          case 'host_away': case 'host_back':
            if (this.role === 'guest' && this.cb.hostAway) this.cb.hostAway(msg.type === 'host_away');
            return;
          case 'peer_away': case 'peer_back':
            if (this.role === 'host' && msg.cid && this.cb.away) this.cb.away(msg.cid, msg.type === 'peer_away');
            return;
          case 'peer_left': if (this.role === 'host' && msg.cid) this._drop(msg.cid); return;
          // un invité n'écoute que l'hôte : le relais marque ses messages from 'host', ce qu'aucun autre joueur ne peut
          // imiter (sinon un client modifié enverrait aux autres de faux départs, de fausses parties ou de faux renvois)
          case 'relay': if (msg.data) { if (this.role === 'host') this._hostData(msg.from, msg.data); else if (msg.from === 'host') this._guestData(msg.data); } return;
        }
      },
      _onError(msg) {
        if (this.role === 'host') {
          if (msg.reason === 'unavailable-id') {
            if (!this.established && !this.fixed) {
              // code déjà pris : on en tire un autre
              this.code = genCode(); this.roomId = prefix + this.code; this._joinRoom();
              return;
            }
            if (this.established) {
              // L'hôte rouvre son code alors que le relais lui garde encore l'ancienne place, qu'il ne peut pas reprendre
              // (par exemple file d'envoi débordée, et personne pour reprendre le salon) : on réessaie jusqu'à ce qu'elle expire
              if (!this.rejoinUntil) this.rejoinUntil = Date.now() + 25000;
              if (Date.now() < this.rejoinUntil) {
                this.retryTo = setTimeout(() => this._joinRoom(), 1200);
                return;
              }
            }
          }
          this.dead = true; this.gen++; this._stopKeepAlive();
          this.cb.error(msg.reason === 'unavailable-id' ? 'Code indisponible.' : msg.message || 'Erreur de connexion.');
          return;
        }
        if (msg.reason === 'room-not-found' && this.opened) {
          // place perdue pendant que l'hôte rouvre son salon : on réessaie un moment
          if (Date.now() < this.rejoinUntil) { this.rejoinTo = setTimeout(() => this._joinRoom(), 1000); return; }
          this._closed(); return;
        }
        const full = `Le salon est complet (${maxPeers + 1} joueurs max).`;
        if (this.opened) { this._closed(); return; }
        this._fail(msg.reason === 'room-not-found' ? "Aucun salon avec ce code. Vérifie-le avec ton pote." : msg.reason === 'room-full' ? full : msg.message || 'Erreur de connexion.');
      },
      // Trop de messages en attente d'accusé de réception (OUTBOX_MAX) : on ne pourra plus renvoyer ce qui manque, on
      // renonce à reprendre la place et on rentrera à neuf. L'hôte ne peut pas pour autant rouvrir son code : le relais
      // lui garde l'ancienne place jusqu'à la fin de la coupure, puis annonce son départ, et les invités partent chez le
      // successeur. À sa reconnexion, il fait donc comme si sa place avait expiré (cb.lost) : il les suit, ou rouvre son
      // code si personne d'autre n'est là pour reprendre le salon (avant, il le rouvrait toujours : deux parties).
      _overflow() {
        this.sid = null; this.outbox = [];
        if (this.role === 'host') this.placeLost = true;
      },
      // Le serveur ne nous a pas gardé notre place (redémarrage, ou coupure trop longue)
      _lost(reason) {
        this.sid = null; this.skey = null; this.rseq = 0; this.ackSent = 0; this.cseq = 0; this.outbox = [];
        if (this.role === 'host') {
          this.links = new Map();
          if (this.cb.lost && this.cb.lost(reason)) return; // le salon a déjà migré : l'appelant s'en occupe
          this.rejoinUntil = Date.now() + REJOIN_MS;
          this._joinRoom(); // même code : les invités reviennent d'eux-mêmes
        } else {
          this.rejoinUntil = Date.now() + REJOIN_MS;
          this._joinRoom();
        }
      },
      _hostData(cid, d) {
        if (!cid) return;
        if (d._ctrl === 'hi') {
          if (!this.links.has(cid) && this.links.size >= maxPeers) { this._relay(cid, { _ctrl: 'full' }); return; }
          this._link(cid);
          this._relay(cid, { _ctrl: 'ok' });
          this.cb.join(cid);
          return;
        }
        if (d._ctrl === 'bye') { this._drop(cid); return; }
        if (!this.links.has(cid)) { this._link(cid); this.cb.join(cid); }
        this.cb.msg(cid, d);
      },
      _link(cid) {
        this.links.set(cid, {
          send: (x, v) => this._relay(cid, x, v),
          close: () => this._relay(cid, { _ctrl: 'bye' }),
        });
      },
      _guestData(d) {
        if (d._ctrl === 'ok') { this._opened(); return; }
        if (d._ctrl === 'full' || d.t === 'full') {
          if (this.opened) this._closed(); else this._fail(`Le salon est complet (${maxPeers + 1} joueurs max).`);
          return;
        }
        if (d._ctrl === 'bye') { this._closed(); return; }
        if (!this.opened) this._opened();
        this.cb.msg(d);
      },
      _drop(cid) { if (!this.links.has(cid)) return; this.links.delete(cid); if (this.cb && this.cb.leave) this.cb.leave(cid); },
      drop(cid) {
        const L = this.links.get(cid); if (!L) return;
        try { L.send({ t: 'bye' }); } catch (e) {}
        setTimeout(() => { try { L.close(); } catch (e) {} }, 80); this._drop(cid);
      },
      _raw(obj) {
        const ws = this.ws;
        if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
      },
      _sendFrame(f) {
        const ws = this.ws;
        if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(f); } catch (e) {} }
      },
      _acked(a) {
        if (!Number.isFinite(a)) return;
        let k = 0; while (k < this.outbox.length && this.outbox[k][0] <= a) k++;
        if (k) this.outbox.splice(0, k);
      },
      // Paquet de jeu vers 'host', un invité (cid) ou 'all' (except : cid exclu)
      _relay(to, data, vol, except) {
        const ws = this.ws;
        const open = this.up && ws && ws.readyState === WebSocket.OPEN;
        const v = isVol(vol);
        if (v && (!open || ws.bufferedAmount > SEND_BUFFER_MAX || this._lagging())) { this.stats.dropped++; return; }
        if (!open && !this.sid) return;
        this.stats.sent++;
        try {
          if (this.proto >= 2) {
            // trame compacte : en-tête court + données brutes, que le serveur retransmet sans les relire
            const h = { to }; if (except) h.x = except; if (v) h.v = 1;
            if (!v && this.sid) h.c = ++this.cseq;
            const f = '#' + JSON.stringify(h) + '\n' + JSON.stringify(data);
            if (h.c) {
              // gardé jusqu'à l'accusé de réception ; pendant une coupure, il partira à la reprise
              this.outbox.push([h.c, f]);
              if (this.outbox.length > OUTBOX_MAX) this._overflow();
            }
            if (open) ws.send(f);
          } else if (open) ws.send(JSON.stringify({ type: 'relay', roomId: this.roomId, to: to === 'all' ? undefined : to, except: except || undefined, v: v ? 1 : undefined, data }));
        } catch (e) {}
      },
      // Sonde vers le relais toutes les 250 ms (garde aussi la connexion ouverte, porte nos accusés de réception).
      // Si la réponse tarde nettement plus que d'habitude, nos envois s'empilent : on saute les instantanés d'état le
      // temps que la file se vide. Plus de réponse du tout depuis quelques secondes : la connexion est morte.
      // Sauf si c'est la page qui était figée (un jeu qui construit son décor, une machine lente) : la réponse est
      // peut-être arrivée et attend son tour ; on ne conclut rien et on refait une sonde. Sauf aussi si des messages
      // arrivent encore : la sonde attend derrière nos propres envois (débit montant trop juste), la connexion vit ;
      // la couper ne ferait que tout renvoyer.
      _startKeepAlive(ws) {
        this._stopKeepAlive();
        this.probeAt = 0; this.lats = []; this.fastCheck = 0;
        const gen = this.gen;
        let tick = performance.now();
        this.lastIn = tick;
        this.pingIv = setInterval(() => {
          if (gen !== this.gen || ws.readyState !== WebSocket.OPEN) return;
          const now = performance.now(), frozen = now - tick > FROZEN_MS; tick = now;
          if (frozen) { this.probeAt = 0; this.fastCheck = 0; }
          if (this.probeAt) {
            const late = now - this.probeAt, quiet = now - this.lastIn;
            if ((late > DEAD_MS && quiet > DEAD_MS) || (this.fastCheck && late > 6000 && quiet > 6000)) this._down(gen);
            return;
          }
          this._probe(ws);
        }, 250);
      },
      _probe(ws) {
        this.probeAt = performance.now();
        const m = { type: 'ping', roomId: this.roomId, ts: this.probeAt };
        if (this.sid) { m.ack = this.rseq; this.ackSent = this.rseq; }
        try { ws.send(JSON.stringify(m)); } catch (e) {}
      },
      _pong(ts) {
        if (!ts) return;
        const lat = Math.max(1, Math.round(performance.now() - ts));
        this.rtt = lat;
        if (ts === this.probeAt) { this.probeAt = 0; this.fastCheck = 0; }
        this.lats.push(lat); if (this.lats.length > 40) this.lats.shift();
        this.baseLat = Math.min(...this.lats);
      },
      _lagging() {
        const base = this.baseLat == null ? 150 : this.baseLat;
        if (this.probeAt && performance.now() - this.probeAt > base + 150) return true;
        return this.rtt != null && this.rtt > base + 150;
      },
      _stopKeepAlive() {
        if (this.pingIv) { clearInterval(this.pingIv); this.pingIv = null; }
        this.probeAt = 0;
      },
      toHost(m, vol) { this.hostLink && this.hostLink.send(m, vol); },
      to(cid, m, vol) { const L = this.links.get(cid); L && L.send(m, vol); },
      bcast(m, except, vol) {
        if (LOCAL_TEST) {
          for (const [cid, L] of this.links) if (cid !== except) L.send(m);
          return;
        }
        if (this.links.size > 0) this._relay('all', m, vol, except);
      },
      // taille du tampon d'envoi (diagnostic)
      get buffered() { return this.ws ? this.ws.bufferedAmount : 0; },
      get connected() { return LOCAL_TEST ? !!this.role : this.up; },
      close() {
        nets.delete(this);
        this.gen++; this._stopKeepAlive();
        clearTimeout(this.retryTo); clearTimeout(this.joinTo); clearTimeout(this.rejoinTo);
        const w = this.ws, b = this.bc, roomId = this.roomId;
        if (w) { w.onclose = w.onmessage = w.onopen = null; }
        if (this.role === 'host') {
          if (LOCAL_TEST) {
            const ls = [...this.links.values()]; for (const L of ls) L.send({ t: 'bye' });
            setTimeout(() => ls.forEach((L) => L.close()), 80);
          } else if (w && w.readyState === WebSocket.OPEN) {
            try { w.send(JSON.stringify({ type: 'relay', roomId, data: { t: 'bye' } })); } catch (e) {}
            try { w.send(JSON.stringify({ type: 'leave_room', roomId })); } catch (e) {}
          }
          this.links = new Map();
        } else if (this.hostLink) {
          if (LOCAL_TEST) { const L = this.hostLink; L.send({ t: 'bye' }); setTimeout(() => L.close(), 60); }
          else if (w && w.readyState === WebSocket.OPEN) {
            try { w.send(JSON.stringify({ type: 'relay', roomId, to: 'host', data: { t: 'bye' } })); } catch (e) {}
            try { w.send(JSON.stringify({ type: 'leave_room', roomId })); } catch (e) {}
          }
        }
        this.hostLink = null; this.ws = null; this.bc = null; this.role = null; this.cb = null; this.code = null; this.roomId = null;
        this.up = false; this.sid = null; this.outbox = [];
        setTimeout(() => { try { w && w.close(); } catch (e) {} try { b && b.close(); } catch (e) {} }, 150);
      },
    };
    return net;
  }

  window.WS_SERVER_URL = WS_SERVER_URL;
  // timers : les minuteries ci-dessus, pour le salon (relances après une coupure ou une migration)
  window.DDNet = { create, LOCAL_TEST, BLOCKED, getWsUrl, wakeServer, WS_SERVER_URL, timers: { setTimeout, clearTimeout } };
})();
