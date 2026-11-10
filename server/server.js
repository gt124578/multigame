'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const saves = require('./saves');
const accounts = require('./accounts');

const PORT = process.env.PORT || 8080;
const PING_INTERVAL_MS = Number(process.env.RELAY_PING_MS) || 30000; // réglable pour les tests
// Protocole 2 : trames compactes « #{en-tête}\n<données> » retransmises sans relire les données,
// et messages volatils (instantanés d'état) sautés pour un destinataire dont la connexion n'arrive plus à suivre.
// Protocole 3 : une place dans un salon survit aux coupures. Chaque message non volatil envoyé à un joueur porte un
// numéro (s) et reste gardé jusqu'à ce que le joueur en accuse réception (ack, dans ses sondes) ; les siens portent un
// numéro (c) que l'on accuse dans les réponses. Si sa connexion tombe, sa place est gardée GRACE_MS : il revient avec
// « resume », on lui renvoie ce qu'il a manqué, il renvoie ce qui ne nous est pas parvenu. Les autres voient seulement
// « en reconnexion ». Les pages restées en cache (protocole 1 ou 2) gardent l'ancien fonctionnement.
const PROTO = 3;
const SLOW_CLIENT_BYTES = 96 * 1024; // tampon d'envoi au-delà duquel un destinataire ne reçoit plus les messages volatils
// Sonde de retard : un ping WebSocket toutes les 250 ms à chaque joueur. Le pong revient après tout ce qui le précède
// dans la file : s'il tarde nettement plus que d'habitude pour ce joueur, ses données s'empilent (connexion trop juste
// pour le flux, coupure wifi…) et on lui saute les instantanés d'état le temps que la file se vide.
const PROBE_MS = 250, LAG_MARGIN_MS = 150, PROBE_WINDOW = 40;
const DEAD_MS = 12000;                 // sonde sans réponse depuis 12 s : connexion morte (wifi coupé, téléphone en veille)
const GRACE_MS = Number(process.env.RELAY_GRACE_MS) || 20000; // place gardée après une coupure (réglable pour les tests)
const AWAY_MS = Number(process.env.RELAY_AWAY_MS) || 5000;    // ami déconnecté : annoncé hors ligne après ce délai
const OUT_MAX = 4000, OUT_MAX_BYTES = 4 * 1024 * 1024; // messages gardés pour un joueur qui n'a pas encore accusé réception
const TOMB_MS = 10 * 60000;            // on se souvient des places perdues, pour dire au joueur pourquoi la reprise échoue
// Garde-fous : un seul client, défaillant ou malveillant, ne doit pas pouvoir faire tomber les salons des autres.
// Les limites sont très au-dessus de ce qu'envoient les jeux (relevés dans /status : maxFrame, peakMsgs, peakBytes).
const MAX_FRAME = Number(process.env.RELAY_MAX_FRAME) || 1024 * 1024;        // plus gros message accepté (sinon fermeture 1009)
const RATE_MSGS = Number(process.env.RELAY_RATE_MSGS) || 1000;               // messages par seconde et par connexion, en continu
const RATE_BYTES = Number(process.env.RELAY_RATE_BYTES) || 8 * 1024 * 1024; // octets par seconde et par connexion, en continu
// réserve pour les rafales, en secondes : au retour d'une coupure, un navigateur renvoie d'un coup jusqu'à 3000 messages
// (OUTBOX_MAX de net.js) ; et quand ce serveur s'est figé quelques secondes (petite instance débordée), tout ce que les
// joueurs ont envoyé entre-temps arrive d'un bloc. Avec 4 s, un gel de 13 s suffisait à couper l'hôte pour
// « inondation », puis à chaque reprise : les invités l'attendaient indéfiniment. Un vrai flot continu est coupé quand même.
const BURST = Number(process.env.RELAY_BURST_S) || 15;
const BURST_BYTES = 4;
const LOG_FILE_MAX = 5 * 1024 * 1024;  // journal des crashs : au-delà, il passe en .1.jsonl et un nouveau commence
const LOG_WINDOW_MS = 10 * 60000, LOG_PER_IP = 60, LOG_ALL = 600; // envois de logs acceptés par fenêtre de 10 min
const LOGS_TOKEN = process.env.LOGS_TOKEN || ''; // lecture des logs (GET /api/logs) : fermée tant qu'il n'est pas défini
const stats = { maxFrame: 0, peakMsgs: 0, peakBytes: 0, closedFlood: 0, closedBig: 0 };
// Une erreur dans le traitement d'un message ou d'un minuteur est notée, sans arrêter le serveur (et tous les salons)
const safe = (fn) => (...a) => { try { fn(...a); } catch (e) { console.error(new Date().toISOString(), e); } };

const CRASH_DIR = process.env.RELAY_LOG_DIR || path.resolve(__dirname, '..', 'logs', 'crash'); // les tests écrivent ailleurs
const JSONL_FILE = path.join(CRASH_DIR, 'crash-events.jsonl');
const LATEST_FILE = path.join(CRASH_DIR, 'latest.json');

function appendServerLog(entry) {
  try {
    fs.mkdirSync(CRASH_DIR, { recursive: true });
    try { if (fs.statSync(JSONL_FILE).size > LOG_FILE_MAX) fs.renameSync(JSONL_FILE, JSONL_FILE.replace(/\.jsonl$/, '.1.jsonl')); } catch (e) {}
    fs.appendFileSync(JSONL_FILE, JSON.stringify(entry) + '\n', 'utf8');
    let list = [];
    if (fs.existsSync(LATEST_FILE)) {
      try { list = JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8')); } catch (e) { list = []; }
    }
    if (!Array.isArray(list)) list = [];
    list.unshift(entry);
    fs.writeFileSync(LATEST_FILE, JSON.stringify(list.slice(0, 200), null, 2) + '\n', 'utf8');
  } catch (e) {}
}

// Envois de logs : au plus LOG_PER_IP par adresse et LOG_ALL en tout sur 10 minutes (le disque ne se remplit pas)
const logHits = new Map(); let logAll = [];
function logAllowed(req) {
  const now = Date.now(), ip = String(req.headers['x-forwarded-for'] || '') + '|' + req.socket.remoteAddress;
  logAll = logAll.filter((t) => now - t < LOG_WINDOW_MS);
  const mine = (logHits.get(ip) || []).filter((t) => now - t < LOG_WINDOW_MS);
  if (mine.length >= LOG_PER_IP || logAll.length >= LOG_ALL) { logHits.set(ip, mine); return false; }
  mine.push(now); logAll.push(now); logHits.set(ip, mine);
  return true;
}
const logHitsInterval = setInterval(() => { const now = Date.now(); for (const [ip, l] of logHits) if (!l.some((t) => now - t < LOG_WINDOW_MS)) logHits.delete(ip); }, LOG_WINDOW_MS);
function tokenOk(req) {
  if (!LOGS_TOKEN) return false;
  const u = new URL(req.url, 'http://relais');
  const given = Buffer.from(String(u.searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer /, '')));
  const want = Buffer.from(LOGS_TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// Serveur HTTP minimal (healthchecks + API de collecte des logs de crash/expulsion)
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const route = req.url.split('?')[0];
  if (saves.handle(req, res, route)) return;
  if (accounts.handle(req, res, route)) return;

  if (route === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ proto: PROTO, rooms: rooms.size, sessions: sessions.size, online: people.size, ...stats }));
    return;
  }
  if (req.method === 'POST' && route === '/api/log') {
    if (!logAllowed(req)) {
      req.resume();
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"ok":false}');
      return;
    }
    let body = '';
    req.on('data', (c) => { if (body.length < 32768) body += c; });
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        if (entry && typeof entry === 'object') appendServerLog(entry);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"ok":false}');
      }
    });
    return;
  }
  if (req.method === 'GET' && route === '/api/logs') {
    // les logs contiennent codes de salon, pseudos et navigateurs : lecture réservée (LOGS_TOKEN)
    if (!tokenOk(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"ok":false}');
      return;
    }
    let list = [];
    try { if (fs.existsSync(LATEST_FILE)) list = JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8')); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(list));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Duo Drift WebSocket Relay Server OK\n');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME });

/* ------------------------------------------------------------ salons */
/**
 * rooms: Map<roomId, { id, host: Sess | null, guests: Map<cid, Sess>, maxPeers }>
 * Sess (une place dans un salon) : { sid, key, roomId, role, cid, ws (null pendant une coupure), v3,
 *   seq, out: [[s, chaîne]], outBytes, inSeq, awayT, gone }
 */
const rooms = new Map();
const sessions = new Map(); // sid → Sess (protocole 3)
const tombs = new Map();    // sid → fin de mémoire

// Envoi d'une chaîne déjà sérialisée (une seule sérialisation pour tous les destinataires).
// volatile : on saute le message si ce destinataire a déjà du retard, au lieu d'allonger sa file d'attente.
function lagging(ws) {
  const base = ws.baseLat == null ? 150 : ws.baseLat;
  if (ws.probeAt && Date.now() - ws.probeAt > base + LAG_MARGIN_MS) return true; // sonde en attente depuis trop longtemps
  return ws.lastLat != null && ws.lastLat > base + LAG_MARGIN_MS;
}
function sendRaw(ws, str, volatile) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (volatile && (ws.bufferedAmount > SLOW_CLIENT_BYTES || lagging(ws))) { ws.dropped = (ws.dropped || 0) + 1; return; }
  try { ws.send(str); } catch (e) {}
}

function sendJson(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {}
  }
}

// Message vers une place : un objet JSON déjà sérialisé. Non volatil et protocole 3 : numéroté et gardé jusqu'à
// l'accusé de réception, y compris pendant une coupure (il partira au retour du joueur).
function deliver(s, json, volatile) {
  if (!s || s.gone) return;
  if (volatile || !s.v3) { sendRaw(s.ws, json, volatile); return; }
  const n = ++s.seq;
  const str = '{"s":' + n + ',' + json.slice(1);
  s.out.push([n, str]); s.outBytes += str.length;
  if (s.out.length > OUT_MAX || s.outBytes > OUT_MAX_BYTES) {
    if (!s.ws) { leave(s); return; } // trop de retard accumulé pendant la coupure : la place est libérée
    while (s.out.length > OUT_MAX || s.outBytes > OUT_MAX_BYTES) s.outBytes -= s.out.shift()[1].length;
  }
  if (s.ws) sendRaw(s.ws, str, false);
}
function acked(s, a) {
  if (!s || !s.v3 || !Number.isFinite(a)) return;
  while (s.out.length && s.out[0][0] <= a) s.outBytes -= s.out.shift()[1].length;
}

const newId = (n) => crypto.randomBytes(n).toString('base64url');
function openSession(ws, room, role, v3) {
  const s = {
    sid: v3 ? newId(12) : null, key: v3 ? newId(18) : null,
    roomId: room.id, role, cid: role === 'host' ? 'host' : 'c' + crypto.randomBytes(4).toString('hex'),
    ws, v3, seq: 0, out: [], outBytes: 0, inSeq: 0, awayT: null, gone: false,
  };
  if (v3) sessions.set(s.sid, s);
  ws.sess = s;
  if (role === 'host') room.host = s; else room.guests.set(s.cid, s);
  return s;
}

// Départ définitif d'une place (volontaire, ou coupure qui a trop duré)
function leave(s) {
  if (!s || s.gone) return;
  s.gone = true; clearTimeout(s.awayT);
  if (s.sid) { sessions.delete(s.sid); tombs.set(s.sid, Date.now() + TOMB_MS); }
  if (s.ws && s.ws.sess === s) s.ws.sess = null;
  const room = rooms.get(s.roomId);
  if (!room) return;
  const rid = JSON.stringify(room.id);
  if (room.host === s) {
    room.host = null;
    // Prévenir tous les invités que l'hôte a quitté
    for (const g of room.guests.values()) deliver(g, '{"type":"host_left","roomId":' + rid + '}');
  } else if (room.guests.get(s.cid) === s) {
    room.guests.delete(s.cid);
    // Prévenir l'hôte que cet invité a quitté
    if (room.host) deliver(room.host, '{"type":"peer_left","roomId":' + rid + ',"cid":' + JSON.stringify(s.cid) + '}');
  }
  // Nettoyage automatique des salles vides
  if (!room.host && room.guests.size === 0) rooms.delete(room.id);
}

// Coupure (ou retour) d'un joueur : les autres sont prévenus, sa place reste réservée
function announce(s, away) {
  const room = rooms.get(s.roomId);
  if (!room) return;
  const rid = JSON.stringify(room.id);
  if (room.host === s) for (const g of room.guests.values()) deliver(g, '{"type":"' + (away ? 'host_away' : 'host_back') + '","roomId":' + rid + '}');
  else if (room.host) deliver(room.host, '{"type":"' + (away ? 'peer_away' : 'peer_back') + '","roomId":' + rid + ',"cid":' + JSON.stringify(s.cid) + '}');
}

// La connexion d'une place est tombée sans « leave_room »
function dropped(ws) {
  const s = ws.sess;
  ws.sess = null;
  if (!s || s.ws !== ws) return;
  s.ws = null;
  if (!s.v3) { leave(s); return; }
  announce(s, true);
  s.awayT = setTimeout(() => leave(s), GRACE_MS);
}

function resume(ws, msg) {
  const sid = String(msg.sid || '');
  const s = sessions.get(sid);
  if (!s || s.key !== msg.key) { sendJson(ws, { type: 'resume_failed', reason: tombs.has(sid) ? 'expired' : 'unknown' }); return; }
  const a = Number(msg.ack) || 0;
  const first = s.out.length ? s.out[0][0] : s.seq + 1;
  if (a + 1 < first || a > s.seq) { leave(s); sendJson(ws, { type: 'resume_failed', reason: 'expired' }); return; }
  if (ws.sess && ws.sess !== s) leave(ws.sess);
  const old = s.ws;
  if (old && old !== ws) { old.sess = null; try { old.terminate(); } catch (e) {} } // l'ancienne connexion était morte sans le savoir
  clearTimeout(s.awayT); s.awayT = null;
  s.ws = ws; ws.sess = s;
  acked(s, a);
  sendJson(ws, { type: 'resumed', roomId: s.roomId, cid: s.cid, ack: s.inSeq });
  for (const [, str] of s.out) sendRaw(ws, str, false);
  if (!old) announce(s, false);
}

// Relais d'un paquet de jeu : vers l'hôte, vers un invité (cid) ou à toute la salle (sauf l'expéditeur et `except`).
// `data` est le JSON des données, déjà sérialisé : le paquet sortant est construit une seule fois.
// Un invité ne parle qu'à l'hôte, qui fait suivre au reste du salon : un client modifié ne peut pas écrire directement
// aux autres invités pour se faire passer pour l'hôte (les pages restées en cache ne vérifient pas l'expéditeur).
function relay(s, to, except, volatile, data, c) {
  if (!s || s.gone) return;
  if (s.v3 && Number.isInteger(c)) { if (c <= s.inSeq) return; s.inSeq = c; } // renvoi d'un message déjà reçu
  const room = rooms.get(s.roomId);
  if (!room) return;
  const out = '{"type":"relay","roomId":' + JSON.stringify(room.id) + ',"from":' + JSON.stringify(s.cid) + ',"data":' + data + '}';
  if (to === 'host') {
    if (room.host && room.host !== s) deliver(room.host, out, volatile);
    return;
  }
  if (room.host !== s) return;
  if (typeof to === 'string' && to !== 'all') {
    const target = room.guests.get(to);
    if (target && target !== s) deliver(target, out, volatile);
    return;
  }
  if (room.host && room.host !== s) deliver(room.host, out, volatile);
  for (const g of room.guests.values()) if (g !== s && (!except || g.cid !== except)) deliver(g, out, volatile);
}

function joinRoom(ws, roomId, msg) {
  if (ws.sess) leave(ws.sess);
  const v3 = Number(msg.proto) >= 3;
  const role = msg.role === 'host' ? 'host' : 'guest';
  const joined = (s) => sendJson(ws, { type: 'room_joined', roomId, role, cid: s.cid, proto: v3 ? PROTO : 2, sid: s.sid || undefined, key: s.key || undefined });

  if (role === 'host') {
    const existing = rooms.get(roomId);
    // salon déjà tenu (y compris par un hôte en reconnexion)
    if (existing && existing.host) {
      sendJson(ws, { type: 'error', roomId, reason: 'unavailable-id', message: 'Ce code de salon est déjà utilisé.' });
      return;
    }
    const room = existing || { id: roomId, host: null, guests: new Map(), maxPeers: 5 };
    rooms.set(roomId, room);
    if (Number.isInteger(msg.maxPeers) && msg.maxPeers > 0) room.maxPeers = Math.min(msg.maxPeers, 15);
    joined(openSession(ws, room, 'host', v3));
    return;
  }

  // Invité (guest) : un hôte en reconnexion compte comme présent, ses messages l'attendront
  const room = rooms.get(roomId);
  if (!room || !room.host) {
    sendJson(ws, { type: 'error', roomId, reason: 'room-not-found', message: 'Aucun salon avec ce code.' });
    return;
  }
  if (room.guests.size >= room.maxPeers) {
    sendJson(ws, { type: 'error', roomId, reason: 'room-full', message: 'Le salon est complet.' });
    return;
  }
  joined(openSession(ws, room, 'guest', v3));
}

/* ------------------------------------------------------------ amis : présence en ligne */
// Chaque joueur a une clé secrète (gardée dans son navigateur) ; son code ami public en est tiré, personne ne peut
// donc se faire passer pour lui. On ne voit l'état d'un joueur (et le code de son salon) que si l'amitié est mutuelle.
const FID_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function fidOf(key) {
  const h = crypto.createHash('sha256').update('ddhub-friend:' + key).digest();
  let out = ''; for (let k = 0; k < 8; k++) out += FID_ALPHA[h[k] & 31];
  return out;
}
const isFid = (f) => typeof f === 'string' && /^[A-Z2-9]{8}$/.test(f);
const cleanTxt = (s, n) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, n);
const cleanColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ff4b2b');
function cleanState(st) {
  st = st && typeof st === 'object' ? st : {};
  const w = ['menu', 'room', 'solo'].includes(st.w) ? st.w : 'menu';
  const out = { w };
  if (typeof st.game === 'string' && /^[a-z0-9-]{1,16}$/.test(st.game)) out.game = st.game;
  if (w === 'room') {
    if (typeof st.code === 'string' && /^[A-Z0-9]{4}$/.test(st.code)) out.code = st.code;
    out.n = Math.max(1, Math.min(16, st.n | 0 || 1));
    out.max = Math.max(out.n, Math.min(16, st.max | 0 || 6));
    if (st.play) out.play = 1;
  }
  return out;
}

const people = new Map(); // fid → { fid, socks: Set<ws>, name, color, st, friends: Set<fid>, reqsIn: Map<fid, t>, downT }
const online = (p) => p && p.socks.size > 0;
const mutual = (a, b) => a.friends.has(b.fid) && b.friends.has(a.fid);
const card = (p) => ({ fid: p.fid, name: p.name, color: p.color, st: p.st });
function pushTo(p, payload) { const str = JSON.stringify(payload); for (const ws of p.socks) sendRaw(ws, str, false); }
function mutualsOnline(p) {
  const out = [];
  for (const f of p.friends) { const q = people.get(f); if (online(q) && q.friends.has(p.fid)) out.push(q); }
  return out;
}
function presence(ws, msg) {
  const t = msg.type;
  if (t === 'p_hello') {
    if (typeof msg.key !== 'string' || msg.key.length < 16 || msg.key.length > 64) return;
    const fid = fidOf(msg.key);
    if (ws.pfid && ws.pfid !== fid) presenceGone(ws);
    let p = people.get(fid);
    if (!p) { p = { fid, socks: new Set(), name: 'Joueur', color: '#ff4b2b', st: { w: 'menu' }, friends: new Set(), reqsIn: new Map(), downT: null }; people.set(fid, p); }
    clearTimeout(p.downT); p.downT = null;
    p.socks.add(ws); ws.pfid = fid;
    p.name = cleanTxt(msg.name, 12) || 'Joueur'; p.color = cleanColor(msg.color); p.st = cleanState(msg.st);
    if (Array.isArray(msg.friends)) p.friends = new Set(msg.friends.filter(isFid).slice(0, 300));
    sendJson(ws, { type: 'p_me', fid });
    const ms = mutualsOnline(p);
    sendJson(ws, { type: 'p_list', list: ms.map(card) });
    for (const q of ms) pushTo(q, { type: 'p_up', ...card(p) });
    return;
  }
  const p = ws.pfid && people.get(ws.pfid);
  if (!p) return;
  if (t === 'p_state') {
    if (msg.name !== undefined) p.name = cleanTxt(msg.name, 12) || 'Joueur';
    if (msg.color !== undefined) p.color = cleanColor(msg.color);
    p.st = cleanState(msg.st);
    for (const q of mutualsOnline(p)) pushTo(q, { type: 'p_up', ...card(p) });
  } else if (t === 'p_friends') {
    if (!Array.isArray(msg.friends)) return;
    const before = new Set(mutualsOnline(p));
    p.friends = new Set(msg.friends.filter(isFid).slice(0, 300));
    const after = mutualsOnline(p);
    for (const q of after) if (!before.has(q)) { pushTo(q, { type: 'p_up', ...card(p) }); pushTo(p, { type: 'p_up', ...card(q) }); }
    for (const q of before) if (!after.includes(q)) pushTo(q, { type: 'p_down', fid: p.fid });
  } else if (t === 'p_req' || t === 'p_accept' || t === 'p_invite') {
    const now = Date.now();
    ws.reqs = (ws.reqs || []).filter((x) => now - x < 60000);
    if (ws.reqs.length >= 30) return; // pas d'avalanche de demandes
    ws.reqs.push(now);
    const q = isFid(msg.to) && people.get(msg.to);
    if (t === 'p_req') {
      if (!online(q) || q === p) { sendJson(ws, { type: 'p_err', to: msg.to, reason: q === p ? 'self' : 'offline' }); return; }
      q.reqsIn.set(p.fid, now);
      pushTo(q, { type: 'p_req', from: p.fid, name: p.name, color: p.color });
      sendJson(ws, { type: 'p_sent', to: q.fid });
    } else if (t === 'p_accept') {
      // on n'accepte qu'une vraie demande : personne ne peut s'inviter dans la liste d'amis d'un autre
      const at = p.reqsIn.get(msg.to);
      if (!at || now - at > 30 * 60000) return;
      p.reqsIn.delete(msg.to);
      if (online(q)) pushTo(q, { type: 'p_ok', from: p.fid, name: p.name, color: p.color });
    } else if (online(q) && mutual(p, q) && typeof msg.code === 'string' && /^[A-Z0-9]{4}$/.test(msg.code)) {
      pushTo(q, { type: 'p_invite', from: p.fid, name: p.name, color: p.color, code: msg.code, game: cleanState({ w: 'menu', game: msg.game }).game });
    }
  }
}
function presenceGone(ws) {
  const p = ws.pfid && people.get(ws.pfid);
  ws.pfid = null;
  if (!p) return;
  p.socks.delete(ws);
  if (p.socks.size) return;
  // quelques secondes de répit : un rechargement de page ne fait pas clignoter « hors ligne » chez les amis
  clearTimeout(p.downT);
  p.downT = setTimeout(() => {
    if (p.socks.size) return;
    for (const q of mutualsOnline(p)) pushTo(q, { type: 'p_down', fid: p.fid });
    people.delete(p.fid);
  }, AWAY_MS);
}

/* ------------------------------------------------------------ connexions */
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.sess = null;
  ws.pfid = null;

  ws.on('pong', () => {
    ws.isAlive = true;
    if (ws.probeAt) {
      // retard de ce joueur ; sa base est le plus petit retard des 10 dernières secondes
      ws.lastLat = Date.now() - ws.probeAt; ws.probeAt = 0;
      (ws.lats = ws.lats || []).push(ws.lastLat); if (ws.lats.length > PROBE_WINDOW) ws.lats.shift();
      ws.baseLat = Math.min(...ws.lats);
    }
  });

  ws.on('message', safe((raw) => {
    if (ws.flooded) return; // déjà coupée pour inondation : les messages encore en file sont ignorés
    ws.isAlive = true; ws.lastMsg = Date.now();
    // débit de cette connexion (seau qui se remplit à RATE_* par seconde, jusqu'à BURST secondes de réserve) :
    // un client qui inonde le relais est coupé ; les pics seconde par seconde sont relevés pour /status
    const now = Date.now(), len = raw.length;
    if (ws.tokT == null) { ws.tokT = now; ws.tokN = RATE_MSGS * BURST; ws.tokB = RATE_BYTES * BURST_BYTES; }
    const dt = (now - ws.tokT) / 1000; ws.tokT = now;
    ws.tokN = Math.min(RATE_MSGS * BURST, ws.tokN + dt * RATE_MSGS) - 1;
    ws.tokB = Math.min(RATE_BYTES * BURST_BYTES, ws.tokB + dt * RATE_BYTES) - len;
    if (now - (ws.rateT || 0) >= 1000) { ws.rateT = now; ws.rateN = 0; ws.rateB = 0; }
    ws.rateN++; ws.rateB += len;
    if (len > stats.maxFrame) stats.maxFrame = len;
    if (ws.rateN > stats.peakMsgs) stats.peakMsgs = ws.rateN;
    if (ws.rateB > stats.peakBytes) stats.peakBytes = ws.rateB;
    if (ws.tokN < 0 || ws.tokB < 0) { ws.flooded = true; stats.closedFlood++; ws.close(1008, 'flood'); return; }
    const text = typeof raw === 'string' ? raw : raw.toString();
    // trame compacte de relais : seul l'en-tête est lu, les données repartent telles quelles
    if (text.charCodeAt(0) === 35 /* # */) {
      const nl = text.indexOf('\n');
      if (nl < 0) return;
      let h;
      try { h = JSON.parse(text.slice(1, nl)); } catch (e) { return; }
      if (!h || typeof h !== 'object') return;
      relay(ws.sess, h.to, typeof h.x === 'string' ? h.x : null, !!h.v, text.slice(nl + 1), h.c);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const action = msg.type;
    const s = ws.sess;

    // Keep-alive applicatif (et accusés de réception du protocole 3)
    if (action === 'ping') {
      if (s && s.v3) { acked(s, Number(msg.ack)); sendJson(ws, { type: 'pong', ts: msg.ts, ack: s.inSeq }); }
      else sendJson(ws, { type: 'pong', roomId: msg.roomId, ts: msg.ts });
      return;
    }
    if (action === 'ack') { acked(s, Number(msg.a)); return; }
    if (action === 'pong') return;
    if (typeof action === 'string' && action.startsWith('p_')) { presence(ws, msg); return; }

    // Retour après une coupure
    if (action === 'resume') { resume(ws, msg); return; }

    // Déconnexion volontaire d'un salon
    if (action === 'leave_room') {
      if (s) { ws.sess = null; leave(s); }
      return;
    }

    // Association d'un joueur à un salon
    if (action === 'join_room') {
      const roomId = typeof msg.roomId === 'string' ? msg.roomId.trim().slice(0, 64) : '';
      if (!roomId) {
        sendJson(ws, { type: 'error', reason: 'invalid-room', message: 'Identifiant de salon manquant.' });
        return;
      }
      joinRoom(ws, roomId, msg);
      return;
    }

    // Relais des paquets de jeu (ancien format JSON, gardé pour les pages restées en cache)
    if (action === 'relay') {
      if (msg.data === undefined) return;
      relay(s, msg.to, typeof msg.except === 'string' ? msg.except : null, !!msg.v, JSON.stringify(msg.data), msg.c);
    }
  }));

  const closed = safe((e) => { if (e && e.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') stats.closedBig++; dropped(ws); presenceGone(ws); });
  ws.on('close', closed);
  ws.on('error', closed);
});

// Ping/Pong (keep-alive toutes les 30 secondes) pour éviter les coupures des hébergeurs gratuits
// (Une connexion muette est fermée ; « close » fait le reste : place gardée ou libérée, amis prévenus.
// Avant la 3.2, cet endroit appelait une fonction inexistante et arrêtait tout le serveur.)
const keepAliveInterval = setInterval(safe(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      const s = ws.sess;
      if (s) {
        appendServerLog({
          id: 'srv-timeout-' + Date.now(),
          ts: Date.now(),
          iso: new Date().toISOString(),
          code: 'EXP_WS_KEEPALIVE_TIMEOUT',
          category: 'EXPULSION',
          severity: 'warn',
          title: 'Joueur expulsé par le serveur relais (timeout WebSocket 30 s)',
          cause: 'Aucune réponse au ping WebSocket pendant 30 s (coupure Wi-Fi/4G ou appareil mobile verrouillé).',
          message: `Client ${s.cid} déconnecté du salon ${s.roomId} après 30 s sans pong (paquets volatils sautés : ${ws.dropped || 0}).`,
          game: 'hub',
          roomCode: s.roomId,
          role: s.role,
          player: s.cid,
          diagnostics: { lastLat: ws.lastLat || null, baseLat: ws.baseLat || null, dropped: ws.dropped || 0, buffered: ws.bufferedAmount || 0 },
        });
      }
      try {
        ws.terminate();
      } catch (e) {}
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  }
}), PING_INTERVAL_MS);

const probeInterval = setInterval(safe(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (!ws.sess || ws.readyState !== WebSocket.OPEN) continue;
    if (ws.probeAt) {
      // plus aucune réponse : connexion morte sans avoir été fermée (wifi coupé, téléphone en veille). Tant que ses
      // messages arrivent, elle vit : la réponse attend derrière ses propres envois (débit montant trop juste)
      if (now - ws.probeAt > DEAD_MS && now - (ws.lastMsg || 0) > DEAD_MS) { try { ws.terminate(); } catch (e) {} }
      continue;
    }
    ws.probeAt = now;
    try { ws.ping(); } catch (e) {}
  }
}), PROBE_MS);

const tombInterval = setInterval(safe(() => {
  const now = Date.now();
  for (const [sid, t] of tombs) if (t < now) tombs.delete(sid);
}), 60000);

wss.on('close', () => {
  clearInterval(keepAliveInterval);
  clearInterval(probeInterval);
  clearInterval(tombInterval);
  clearInterval(logHitsInterval);
});

server.listen(PORT, () => {
  console.log(`Serveur relais WebSocket démarré sur le port ${PORT}`);
});
