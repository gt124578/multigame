import { fileURLToPath } from 'node:url';
// Test de charge du serveur relais : un hôte envoie des instantanés de 20 Ko à 30 Hz ; l'invité B n'a que 400 Ko/s.
// node tools/relay-load.mjs old  → messages normaux (le retard de B s'accumule)
// node tools/relay-load.mjs vol  → messages volatils (le serveur saute les images périmées de B)
// Prérequis : cd server && npm install
import { createRequire } from 'node:module';
const { WebSocket } = createRequire(new URL('../server/package.json', import.meta.url))('ws');
import { spawn } from 'node:child_process';
const VOL = process.argv[2] === 'vol';
const srv = spawn('node', [fileURLToPath(new URL('../server/server.js', import.meta.url))], { env: { ...process.env, PORT: '8099' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const url = 'ws://127.0.0.1:8099', room = 'test-' + Date.now();
// mandataire TCP qui limite le débit descendant de B à 400 Ko/s (connexion correcte mais un peu juste pour ce flux)
import net from 'node:net';
const RATE = 400 * 1024;
const proxy = net.createServer((c) => {
  const up = net.connect(8099, '127.0.0.1'); c.pipe(up);
  const q = []; let qlen = 0;
  up.on('data', (d) => { q.push(d); qlen += d.length; if (qlen > 64 * 1024) up.pause(); });
  setInterval(() => { let budget = RATE / 50; while (q.length && budget > 0) { const d = q[0]; if (d.length <= budget) { c.write(q.shift()); budget -= d.length; qlen -= d.length; } else { c.write(d.subarray(0, budget)); q[0] = d.subarray(budget); qlen -= budget; budget = 0; } } if (qlen < 32 * 1024) up.resume(); }, 20);
}).listen(8098);
const open = (role, u = url) => new Promise((res) => { const ws = new WebSocket(u); ws.on('open', () => ws.send(JSON.stringify({ type: 'join_room', roomId: room, role }))); ws.on('message', function f(d) { const m = JSON.parse(d); if (m.type === 'room_joined') { ws.off('message', f); ws.cid = m.cid; ws.proto = m.proto; res(ws); } }); });
const host = await open('host'); const A = await open('guest'), B = await open('guest', 'ws://127.0.0.1:8098');
console.log('protocole annoncé par le serveur :', host.proto);
const send = (ws, to, data, v) => ws.send('#' + JSON.stringify(v ? { to, v: 1 } : { to }) + '\n' + JSON.stringify(data));
for (const g of [A, B]) g.on('message', (d) => { const m = JSON.parse(d); if (m.data && m.data.t === 'ping') send(g, 'host', { t: 'pong', ts: m.data.ts }); });
const rtt = { [A.cid]: [], [B.cid]: [] };
host.on('message', (d) => { const m = JSON.parse(d); if (m.data && m.data.t === 'pong') rtt[m.from].push(Date.now() - m.data.ts); });
const blob = 'x'.repeat(20000);
const snapIv = setInterval(() => send(host, 'all', { t: 'S', blob }, VOL), 33);
const pingIv = setInterval(() => send(host, 'all', { t: 'ping', ts: Date.now() }, false), 250);
setTimeout(() => {
  clearInterval(snapIv); clearInterval(pingIv);
  const tail = (a) => a.slice(-8); const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
  console.log(VOL ? 'AVEC messages volatils' : 'SANS (ancien comportement)');
  console.log('  invité A (normal) : ping moyen', avg(rtt[A.cid]), 'ms');
  console.log('  invité B (400 Ko/s pour un flux de 600 Ko/s) : derniers pings', tail(rtt[B.cid]).join(', '), 'ms');
  host.close(); A.close(); B.close(); srv.kill(); process.exit(0);
}, 9000);
