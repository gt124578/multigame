import { fileURLToPath } from 'node:url';
// Tests du serveur relais : ancien protocole, places qui survivent aux coupures (protocole 3) et amis.
// node tools/test-relay.mjs      (prérequis : cd server && npm install)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { WebSocket } = createRequire(new URL('../server/package.json', import.meta.url))('ws');

const PORT = 8187, URL_WS = 'ws://127.0.0.1:' + PORT;
const RELAY_LOG_DIR = mkdtempSync(join(tmpdir(), 'relais-logs-')); // pas dans logs/crash du dépôt
const srv = spawn('node', [fileURLToPath(new URL('../server/server.js', import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), RELAY_GRACE_MS: '1500', RELAY_AWAY_MS: '300', RELAY_LOG_DIR }, stdio: ['ignore', 'ignore', 'inherit'],
});
await new Promise((r) => setTimeout(r, 500));

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Client de test : garde tous les messages reçus
function client() {
  return new Promise((res) => {
    const ws = new WebSocket(URL_WS);
    const c = { ws, got: [], send: (o) => ws.send(JSON.stringify(o)), frame: (h, d) => ws.send('#' + JSON.stringify(h) + '\n' + JSON.stringify(d)) };
    c.wait = async (pred, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = c.got.find(pred); if (m) return m; await sleep(10); } return null; };
    c.take = (pred) => c.got.filter(pred);
    ws.on('message', (d) => c.got.push(JSON.parse(d.toString())));
    ws.on('open', () => res(c));
  });
}
const relays = (c, pred = () => true) => c.got.filter((m) => m.type === 'relay' && pred(m.data)).map((m) => m.data);

/* ---------- 1. ancien protocole (pages restées en cache) ---------- */
{
  const room = 'old-' + Date.now();
  const H = await client(), G = await client();
  H.send({ type: 'join_room', roomId: room, role: 'host', maxPeers: 5 });
  const hj = await H.wait((m) => m.type === 'room_joined');
  ok(hj && hj.proto === 2 && !hj.sid, 'ancien hôte : protocole 2, pas de session');
  G.send({ type: 'join_room', roomId: room, role: 'guest' });
  const gj = await G.wait((m) => m.type === 'room_joined');
  ok(gj && gj.cid && gj.cid !== 'host', 'ancien invité : cid attribué');
  G.frame({ to: 'host' }, { n: 1 });
  const r = await H.wait((m) => m.type === 'relay');
  ok(r && r.from === gj.cid && r.data.n === 1 && r.s === undefined, 'relais sans numéro pour l\'ancien protocole');
  G.ws.terminate();
  ok(await H.wait((m) => m.type === 'peer_left'), 'ancien invité coupé : départ immédiat');
  H.ws.close();
}

/* ---------- 2. protocole 3 : coupure d'un invité ---------- */
{
  const room = 'v3-' + Date.now();
  const H = await client();
  H.send({ type: 'join_room', roomId: room, role: 'host', maxPeers: 5, proto: 3 });
  const hj = await H.wait((m) => m.type === 'room_joined');
  ok(hj && hj.proto === 3 && hj.sid && hj.key, 'hôte v3 : session ouverte');
  let G = await client();
  G.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  const gj = await G.wait((m) => m.type === 'room_joined');
  ok(gj && gj.sid && /^c[0-9a-f]{8}$/.test(gj.cid), 'invité v3 : session et cid aléatoire');
  G.frame({ to: 'host', c: 1 }, { n: 1 });
  G.frame({ to: 'host', c: 2 }, { n: 2 });
  H.frame({ to: gj.cid, c: 1 }, { k: 1 });
  await G.wait((m) => m.type === 'relay' && m.data.k === 1);
  const first = G.got.find((m) => m.type === 'relay');
  ok(first.s === 1, 'messages numérotés vers l\'invité');
  G.send({ type: 'ping', ts: 1, ack: 1 });
  const pong = await G.wait((m) => m.type === 'pong');
  ok(pong && pong.ack === 2, 'le serveur accuse réception des messages de l\'invité');
  // coupure brutale
  G.ws.terminate();
  ok(await H.wait((m) => m.type === 'peer_away' && m.cid === gj.cid), 'hôte prévenu de la coupure');
  ok(!H.got.some((m) => m.type === 'peer_left'), 'pas de départ pendant la coupure');
  for (let k = 2; k <= 5; k++) H.frame({ to: gj.cid, c: k }, { k });
  H.frame({ to: gj.cid, v: 1 }, { vol: 1 });
  await sleep(100);
  // retour : ack 1, renvoie 2 (déjà reçu) et 3 (nouveau)
  G = await client();
  G.send({ type: 'resume', sid: gj.sid, key: gj.key, ack: 1 });
  const rs = await G.wait((m) => m.type === 'resumed');
  ok(rs && rs.ack === 2 && rs.cid === gj.cid, 'reprise : même cid, le serveur dit ce qu\'il a reçu');
  await G.wait((m) => m.type === 'relay' && m.data.k === 5);
  ok(JSON.stringify(relays(G).map((d) => d.k)) === '[2,3,4,5]', 'messages manqués renvoyés dans l\'ordre, sans les volatils : ' + JSON.stringify(relays(G)));
  G.frame({ to: 'host', c: 2 }, { n: 2 });
  G.frame({ to: 'host', c: 3 }, { n: 3 });
  await H.wait((m) => m.type === 'relay' && m.data.n === 3);
  ok(JSON.stringify(relays(H).map((d) => d.n)) === '[1,2,3]', 'doublons écartés après la reprise : ' + JSON.stringify(relays(H)));
  ok(await H.wait((m) => m.type === 'peer_back' && m.cid === gj.cid), 'hôte prévenu du retour');
  // mauvaise clé
  const X = await client();
  X.send({ type: 'resume', sid: gj.sid, key: 'nope', ack: 0 });
  const xf = await X.wait((m) => m.type === 'resume_failed');
  ok(xf && xf.reason === 'unknown', 'reprise refusée sans la bonne clé');
  // coupure trop longue
  G.ws.terminate();
  await sleep(1800);
  ok(H.got.some((m) => m.type === 'peer_left' && m.cid === gj.cid), 'coupure trop longue : départ annoncé');
  const G2 = await client();
  G2.send({ type: 'resume', sid: gj.sid, key: gj.key, ack: 99 });
  const ef = await G2.wait((m) => m.type === 'resume_failed');
  ok(ef && ef.reason === 'expired', 'reprise après expiration : raison « expired »');
  X.ws.close(); G2.ws.close(); H.ws.close();
}

/* ---------- 3. protocole 3 : coupure de l'hôte, connexion morte sans fermeture ---------- */
{
  const room = 'v3h-' + Date.now();
  let H = await client();
  H.send({ type: 'join_room', roomId: room, role: 'host', maxPeers: 5, proto: 3 });
  const hj = await H.wait((m) => m.type === 'room_joined');
  const G = await client();
  G.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  const gj = await G.wait((m) => m.type === 'room_joined');
  const H0 = H;
  H.ws.terminate();
  ok(await G.wait((m) => m.type === 'host_away'), 'invité prévenu de la coupure de l\'hôte');
  G.frame({ to: 'host', c: 1 }, { hi: 1 });
  // un nouvel invité peut entrer pendant la coupure de l'hôte
  const N = await client();
  N.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  ok(await N.wait((m) => m.type === 'room_joined'), 'entrée possible pendant la coupure de l\'hôte');
  // un autre ne peut pas prendre la place d'hôte
  const T = await client();
  T.send({ type: 'join_room', roomId: room, role: 'host', proto: 3 });
  ok(await T.wait((m) => m.type === 'error' && m.reason === 'unavailable-id'), 'place d\'hôte réservée pendant la coupure');
  H = await client();
  H.send({ type: 'resume', sid: hj.sid, key: hj.key, ack: 0 });
  ok(await H.wait((m) => m.type === 'resumed'), 'hôte : reprise');
  ok(await H.wait((m) => m.type === 'relay' && m.data.hi === 1 && m.from === gj.cid), 'hôte : message de l\'invité reçu après la reprise');
  ok(await G.wait((m) => m.type === 'host_back'), 'invité prévenu du retour de l\'hôte');
  // reprise alors que l'ancienne connexion semble encore ouverte (connexion à moitié morte)
  const H2 = await client();
  H2.send({ type: 'resume', sid: hj.sid, key: hj.key, ack: H.got.reduce((a, m) => Math.max(a, m.s || 0), 0) });
  ok(await H2.wait((m) => m.type === 'resumed'), 'reprise par une 2e connexion');
  await sleep(100);
  ok(H.ws.readyState !== WebSocket.OPEN, 'l\'ancienne connexion est fermée par le serveur');
  ok(!G.got.some((m) => m.type === 'host_left'), 'aucune migration déclenchée');
  // départ volontaire de l'hôte : annoncé tout de suite
  H2.send({ type: 'leave_room', roomId: room });
  ok(await G.wait((m) => m.type === 'host_left'), 'départ volontaire de l\'hôte annoncé');
  for (const c of [G, N, T, H0, H2]) c.ws.close();
}

/* ---------- 4. amis ---------- */
{
  const A = await client(), B = await client(), C = await client();
  const keyA = 'a'.repeat(20) + Date.now(), keyB = 'b'.repeat(20) + Date.now(), keyC = 'c'.repeat(20) + Date.now();
  A.send({ type: 'p_hello', key: keyA, name: 'Alice', color: '#2b8cff', st: { w: 'menu' }, friends: [] });
  B.send({ type: 'p_hello', key: keyB, name: 'Bob', color: '#ff4b2b', st: { w: 'menu' }, friends: [] });
  C.send({ type: 'p_hello', key: keyC, name: 'Chloé', color: '#2fbf71', st: { w: 'menu' }, friends: [] });
  const fa = (await A.wait((m) => m.type === 'p_me')).fid, fb = (await B.wait((m) => m.type === 'p_me')).fid, fc = (await C.wait((m) => m.type === 'p_me')).fid;
  ok(/^[A-Z2-9]{8}$/.test(fa) && fa !== fb, 'codes amis tirés des clés');
  // même clé = même code (personne d'autre ne peut l'obtenir)
  const A2 = await client(); A2.send({ type: 'p_hello', key: keyA, name: 'Alice', color: '#2b8cff', friends: [] });
  ok((await A2.wait((m) => m.type === 'p_me')).fid === fa, 'même clé, même code ami');
  A2.ws.close();
  // C force une acceptation sans demande : ignorée
  C.send({ type: 'p_accept', to: fa });
  await sleep(150);
  ok(!A.got.some((m) => m.type === 'p_ok'), 'acceptation sans demande ignorée');
  // A demande B, B accepte
  A.send({ type: 'p_req', to: fb });
  ok(await A.wait((m) => m.type === 'p_sent' && m.to === fb), 'demande envoyée');
  const req = await B.wait((m) => m.type === 'p_req');
  ok(req && req.from === fa && req.name === 'Alice', 'demande reçue');
  B.send({ type: 'p_friends', friends: [fa] });
  B.send({ type: 'p_accept', to: fa });
  ok(await A.wait((m) => m.type === 'p_ok' && m.from === fb), 'acceptation transmise');
  await sleep(100);
  ok(!B.got.some((m) => m.type === 'p_up'), 'pas de présence tant que l\'amitié n\'est pas mutuelle');
  A.send({ type: 'p_friends', friends: [fb] });
  ok(await A.wait((m) => m.type === 'p_up' && m.fid === fb), 'A voit B en ligne');
  ok(await B.wait((m) => m.type === 'p_up' && m.fid === fa), 'B voit A en ligne');
  A.send({ type: 'p_state', name: 'Alice', color: '#2b8cff', st: { w: 'room', code: 'K7QM', game: 'kart', n: 2, max: 6, play: true } });
  const up = await B.wait((m) => m.type === 'p_up' && m.st && m.st.code === 'K7QM');
  ok(up && up.st.game === 'kart' && up.st.n === 2 && up.st.play === 1, 'B voit le salon de A');
  // C (non ami, même s'il ajoute A) ne voit rien
  C.send({ type: 'p_friends', friends: [fa] });
  await sleep(150);
  ok(!C.got.some((m) => m.type === 'p_up'), 'un non-ami ne voit pas le salon');
  C.send({ type: 'p_invite', to: fa, code: 'ZZZZ', game: 'kart' });
  await sleep(100);
  ok(!A.got.some((m) => m.type === 'p_invite'), 'invitation d\'un non-ami bloquée');
  B.send({ type: 'p_invite', to: fa, code: 'WXYZ', game: 'golf' });
  const inv = await A.wait((m) => m.type === 'p_invite');
  ok(inv && inv.from === fb && inv.code === 'WXYZ' && inv.game === 'golf', 'invitation d\'un ami transmise');
  C.send({ type: 'p_req', to: 'ZZZZZZZZ' });
  ok(await C.wait((m) => m.type === 'p_err' && m.reason === 'offline'), 'demande à un joueur hors ligne refusée');
  // B se reconnecte : A le revoit avec la liste
  B.ws.close();
  ok(await A.wait((m) => m.type === 'p_down' && m.fid === fb, 2000), 'A voit B partir');
  const B2 = await client();
  B2.send({ type: 'p_hello', key: keyB, name: 'Bob', color: '#ff4b2b', st: { w: 'menu' }, friends: [fa] });
  const list = await B2.wait((m) => m.type === 'p_list');
  ok(list && list.list.some((c) => c.fid === fa && c.st.code === 'K7QM'), 'au retour, B reçoit l\'état de ses amis');
  for (const c of [A, B2, C]) c.ws.close();
}

/* ---------- 5. garde-fous : client muet, message géant, inondation, logs ---------- */
{
  // limites réelles : la rafale de renvoi au retour d'une coupure (jusqu'à 3000 messages, OUTBOX_MAX de net.js) passe
  const room = 'rafale-' + Date.now();
  const H = await client(), G = await client();
  H.send({ type: 'join_room', roomId: room, role: 'host', proto: 3 });
  await H.wait((m) => m.type === 'room_joined');
  G.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  await G.wait((m) => m.type === 'room_joined');
  let closed = false; G.ws.on('close', () => { closed = true; });
  for (let k = 1; k <= 3000; k++) G.frame({ to: 'host', c: k }, { k, pad: 'x'.repeat(200) });
  await H.wait((m) => m.type === 'relay' && m.data.k === 3000, 5000);
  ok(!closed && relays(H).length === 3000, 'rafale de 3000 messages au retour d\'une coupure : rien n\'est coupé');
  for (const c of [H, G]) c.ws.close();
}
{
  // second serveur aux limites réduites (connexion muette repérée en 2 × 300 ms)
  const P2 = PORT + 1, U2 = 'ws://127.0.0.1:' + P2, H2 = 'http://127.0.0.1:' + P2;
  const srv2 = spawn('node', [fileURLToPath(new URL('../server/server.js', import.meta.url))], {
    env: { ...process.env, PORT: String(P2), RELAY_PING_MS: '300', RELAY_MAX_FRAME: '4096', RELAY_RATE_MSGS: '50', LOGS_TOKEN: 'secret-de-test', RELAY_LOG_DIR },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let srvErr = ''; srv2.stderr.on('data', (d) => { srvErr += d; });
  let exited = false; srv2.on('exit', () => { exited = true; });
  await sleep(500);
  // (serveur tombé : la connexion échoue et le test s'arrête là, au lieu d'attendre indéfiniment)
  const open = (opts) => new Promise((res, rej) => { const ws = new WebSocket(U2, opts); const c = { ws, got: [], code: null }; ws.on('message', (d) => c.got.push(JSON.parse(d.toString()))); ws.on('close', (code) => { c.code = code; }); ws.on('error', rej); ws.on('open', () => { ws.removeListener('error', rej); ws.on('error', () => {}); res(c); }); });
  const status = async () => (await fetch(H2 + '/status')).json();

  // un salon qui doit survivre à tout ce qui suit
  const H = await open(), G = await open();
  H.ws.send(JSON.stringify({ type: 'join_room', roomId: 'garde', role: 'host', proto: 3 }));
  await sleep(100);
  G.ws.send(JSON.stringify({ type: 'join_room', roomId: 'garde', role: 'guest', proto: 3 }));
  await sleep(100);

  // client qui ne répond plus aux pings (téléphone en veille) : connexion amis, puis place dans le salon
  const muteP = await open({ autoPong: false });
  muteP.ws.send(JSON.stringify({ type: 'p_hello', key: 'k'.repeat(20), name: 'Muet' }));
  const muteR = await open({ autoPong: false });
  muteR.ws.send(JSON.stringify({ type: 'join_room', roomId: 'garde', role: 'guest', proto: 3 }));
  await sleep(1200);
  ok(!exited && !/ReferenceError/.test(srvErr), 'un client muet ne fait plus tomber le serveur' + (exited ? ' :\n' + srvErr.split('\n').slice(0, 6).join('\n') : ''));
  if (exited) { srv.kill(); console.log(`\n${fails} échec(s), ${passes} réussis`); process.exit(1); }
  ok(muteP.code === 1006 && muteR.code === 1006, 'les connexions muettes sont fermées');

  // message plus gros que la limite
  const big = await open();
  big.ws.send('#' + JSON.stringify({ to: 'host' }) + '\n' + JSON.stringify({ x: 'a'.repeat(5000) }));
  await sleep(200);
  ok(big.code === 1009, 'message trop gros : connexion fermée (1009)');

  // inondation
  const flood = await open();
  for (let k = 0; k < 1000; k++) flood.ws.send(JSON.stringify({ type: 'pong' })); // au-delà de la réserve (50/s × 15 s)
  await sleep(200);
  ok(flood.code === 1008, 'trop de messages en une seconde : connexion fermée (1008)');

  // le salon continue de fonctionner
  G.ws.send('#' + JSON.stringify({ to: 'host', c: 1 }) + '\n' + JSON.stringify({ n: 7 }));
  await sleep(150);
  ok(H.got.some((m) => m.type === 'relay' && m.data.n === 7), 'le salon des autres continue de fonctionner');
  const st = await status();
  ok(st.closedFlood === 1 && st.closedBig === 1 && st.maxFrame > 0 && st.maxFrame <= 4096 && st.peakMsgs > 50, '/status compte les fermetures et les pics : ' + JSON.stringify(st));

  // logs : lecture réservée, envois plafonnés
  ok((await fetch(H2 + '/api/logs')).status === 403, 'GET /api/logs sans jeton refusé');
  ok((await fetch(H2 + '/api/logs?token=faux-jeton-de-test')).status === 403, 'GET /api/logs avec un mauvais jeton refusé');
  ok((await fetch(H2 + '/api/logs', { headers: { Authorization: 'Bearer secret-de-test' } })).status === 200, 'GET /api/logs avec le jeton accepté');
  const codes = [];
  for (let k = 0; k < 61; k++) codes.push((await fetch(H2 + '/api/log', { method: 'POST', body: JSON.stringify({ code: 'TEST', k }) })).status);
  ok(codes.slice(0, 60).every((c) => c === 200 || c === 400) && codes[60] === 429, 'POST /api/log plafonné par adresse (429)');

  for (const c of [H, G]) c.ws.close();
  srv2.kill();
}

/* ---------- 6. un invité ne parle qu'à l'hôte : il ne peut pas écrire aux autres en se faisant passer pour lui ---------- */
{
  const room = 'hote-seul-' + Date.now();
  const H = await client(), G1 = await client(), G2 = await client();
  H.send({ type: 'join_room', roomId: room, role: 'host', proto: 3 });
  await H.wait((m) => m.type === 'room_joined');
  G1.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  await G1.wait((m) => m.type === 'room_joined');
  G2.send({ type: 'join_room', roomId: room, role: 'guest', proto: 3 });
  const j2 = await G2.wait((m) => m.type === 'room_joined');
  // faux départ de l'hôte et faux renvoi, au salon entier ou directement à l'autre invité, trames compactes ou ancien format
  G1.frame({ to: 'all', c: 1 }, { t: 'bye' });
  G1.frame({ to: j2.cid, c: 2 }, { t: 'kicked' });
  G1.send({ type: 'relay', roomId: room, data: { t: 'bye' } });
  G1.send({ type: 'relay', roomId: room, to: j2.cid, data: { t: 'kicked' } });
  G1.frame({ to: 'host', c: 3 }, { n: 1 });
  await H.wait((m) => m.type === 'relay' && m.data.n === 1);
  await sleep(150);
  ok(!relays(G2).length, 'un invité ne peut écrire ni à tout le salon ni à un autre invité : ' + JSON.stringify(relays(G2)));
  ok(relays(H).length === 1 && relays(H)[0].n === 1, 'ses messages à l\'hôte passent, et eux seuls : ' + JSON.stringify(relays(H)));
  G1.send({ type: 'ping', ts: 1, ack: 0 });
  const pg = await G1.wait((m) => m.type === 'pong');
  ok(pg && pg.ack === 3, 'les messages refusés sont tout de même accusés (pas renvoyés sans fin) : ack ' + (pg && pg.ack));
  H.frame({ to: 'all', c: 1 }, { k: 1 });
  H.frame({ to: j2.cid, c: 2 }, { k: 2 });
  await G2.wait((m) => m.type === 'relay' && m.data.k === 2);
  await G1.wait((m) => m.type === 'relay' && m.data.k === 1);
  const fromHost = [...G1.got, ...G2.got].filter((m) => m.type === 'relay');
  ok(relays(G2).length === 2 && relays(G1).length === 1 && fromHost.every((m) => m.from === 'host'), 'l\'hôte écrit au salon et à chacun, ses messages marqués « host » : ' + JSON.stringify(fromHost.map((m) => m.from)));
  for (const c of [H, G1, G2]) c.ws.close();
}

srv.kill();
console.log(fails ? `\n${fails} échec(s), ${passes} réussis` : `Relais : ${passes} vérifications réussies`);
process.exit(fails ? 1 : 0);
