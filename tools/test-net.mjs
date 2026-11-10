import { fileURLToPath } from 'node:url';
// Tests de bout en bout de la connexion : shared/net.js et shared/room.js tournent dans de faux navigateurs, reliés au
// vrai serveur relais par des mandataires TCP que l'on coupe, fige ou bloque, comme un wifi capricieux.
// node tools/test-net.mjs      (prérequis : cd server && npm install)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const { WebSocket: NodeWS } = createRequire(new URL('../server/package.json', import.meta.url))('ws');
// comme dans un navigateur, une erreur de connexion n'est qu'un événement (suivi de la fermeture)
class WebSocket extends NodeWS { constructor(u) { super(u); this.on('error', () => {}); } }

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT_TMP = path.join(tmpdir(), 'relais-logs-'); // logs du serveur hors du dépôt
const SPORT = 8188;
let srv = null;
const startServer = async () => {
  srv = spawn('node', [path.join(ROOT, 'server', 'server.js')], { env: { ...process.env, PORT: String(SPORT), RELAY_GRACE_MS: '2500', RELAY_LOG_DIR: fs.mkdtempSync(ROOT_TMP) }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(400);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const until = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (pred()) return true; await sleep(20); } return false; };

// Mandataire TCP : cut() coupe net, freeze() fige les connexions en cours (rien ne passe, rien ne se ferme), block() refuse tout,
// throttle(o/s) limite le débit montant (joueur → serveur), comme une ligne trop juste pour ce que le joueur envoie
function proxy(port) {
  const P = { pairs: new Set(), blocked: false, rate: 0 };
  P.server = net.createServer((c) => {
    if (P.blocked) { c.destroy(); return; }
    const up = net.connect(SPORT, '127.0.0.1');
    const pair = { c, up, frozen: false, q: [] };
    P.pairs.add(pair);
    c.on('data', (d) => { if (pair.frozen) return; if (P.rate || pair.q.length) pair.q.push(d); else up.write(d); });
    // débit limité : la file se vide à P.rate octets par seconde (d'un coup quand la limite est levée)
    pair.iv = setInterval(() => {
      let budget = P.rate ? P.rate / 20 : Infinity;
      while (pair.q.length && budget > 0) {
        const d = pair.q[0];
        if (d.length <= budget) { pair.q.shift(); budget -= d.length; up.write(d); } else { up.write(d.subarray(0, budget)); pair.q[0] = d.subarray(budget); budget = 0; }
      }
    }, 50);
    up.on('data', (d) => { if (!pair.frozen) c.write(d); });
    const end = () => { clearInterval(pair.iv); c.destroy(); up.destroy(); P.pairs.delete(pair); };
    for (const s of [c, up]) { s.on('close', end); s.on('error', end); }
  }).listen(port);
  P.cut = () => { for (const p of P.pairs) { p.c.destroy(); p.up.destroy(); } };
  P.freeze = () => { for (const p of P.pairs) p.frozen = true; };
  P.block = (b) => { P.blocked = b; if (b) P.cut(); };
  P.throttle = (rate) => { P.rate = rate; };
  return P;
}

// Onglet caché depuis longtemps : ses minuteries ne se réveillent qu'aux multiples de `slot` ms (Chrome : une minute).
// Un Worker, lui, n'est jamais ralenti (FakeWorker reprend le protocole des minuteries de net.js).
function hiddenTab(slot) {
  const T = { on: false };
  const wait = (ms) => (T.on ? Math.max(ms, slot - (Date.now() % slot)) : ms);
  const timers = {
    setTimeout: (fn, ms, ...a) => setTimeout(() => (T.on ? setTimeout(() => fn(...a), wait(0)) : fn(...a)), ms),
    setInterval: (fn, ms, ...a) => { const h = { stop: false }; const go = () => { if (!h.stop) h.t = setTimeout(() => { fn(...a); go(); }, wait(ms)); }; go(); return h; },
    clearTimeout: (t) => clearTimeout(t),
    clearInterval: (h) => { if (h && typeof h === 'object') { h.stop = true; clearTimeout(h.t); } else clearInterval(h); },
  };
  class FakeWorker {
    constructor() { this.t = new Map(); }
    postMessage([k, id, ms]) {
      if (k === 'c') { clearTimeout(this.t.get(id)); clearInterval(this.t.get(id)); this.t.delete(id); }
      else if (k === 't') this.t.set(id, setTimeout(() => { this.t.delete(id); this.onmessage({ data: id }); }, ms));
      else this.t.set(id, setInterval(() => this.onmessage({ data: id }), ms));
    }
  }
  return { T, env: { ...timers, Worker: FakeWorker, Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} } } };
}

// Faux navigateur : un contexte isolé par joueur (comme un onglet), avec net.js et room.js
const SRC = ['shared/net.js', 'shared/room.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
function browser(port, env = {}) {
  const L = {};
  const w = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance, URLSearchParams, BroadcastChannel, MessageChannel, crypto: globalThis.crypto,
    location: { search: `?ws=ws://127.0.0.1:${port}`, origin: 'http://localhost', pathname: '/' },
    fetch: () => Promise.resolve(), WebSocket,
    document: { hidden: false, addEventListener: () => {} },
    addEventListener: (k, fn) => { (L[k] = L[k] || []).push(fn); },
    ...env,
  };
  w.window = w; w.fire = (k) => (L[k] || []).forEach((f) => f());
  vm.createContext(w);
  for (const s of SRC) vm.runInContext(s, w);
  return w;
}
function player(port, name, uid, env) {
  const b = browser(port, env), log = { got: [], from: [], ev: [] }, nets = [];
  const mk = b.DDNet.create; b.DDNet.create = (o) => { const n = mk(o); nets.push(n); return n; };
  const R = b.DDRoom.create({
    joined() { log.ev.push('joined'); }, update() {}, chat() {}, results() {}, left(p) { log.ev.push('left:' + p.name); },
    game(from, m) { log.got.push(m); log.from.push(from); },
    error(m) { log.ev.push('error:' + m); }, closed(m) { log.ev.push('closed:' + m); },
    migrating() { log.ev.push('migrating'); }, migrated() { log.ev.push('migrated'); }, net(s) { log.ev.push('net:' + s); },
  });
  return { b, R, log, nets, me: { name, color: '#2b8cff', lvl: 1, uid } };
}
const ids = (R) => R.players.map((p) => p.id).sort().join(',');
const seqOf = (log, tag) => log.got.filter((m) => m.tag === tag).map((m) => m.k);
const inOrder = (a, n) => a.length === n && a.every((k, i) => k === i + 1);
// rafale de messages pendant une coupure
async function burst(from, to, tag, n) { for (let k = 1; k <= n; k++) { from.R.sendGame(to, { tag, k }); await sleep(15); } }

await startServer();
const pH = proxy(8201), p1 = proxy(8202), p2 = proxy(8203);
const HT = hiddenTab(5000); // l'hôte pourra « cacher son onglet » (scénario 3c)
const H = player(8201, 'Hôte', 'uidhost001', HT.env), A = player(8202, 'Alice', 'uidalice01'), B = player(8203, 'Bob', 'uidbobbb01');

/* ---------- salon ---------- */
H.R.host(H.me);
ok(await until(() => H.R.code), 'salon ouvert');
A.R.join(H.R.code, A.me); B.R.join(H.R.code, B.me);
ok(await until(() => H.R.players.length === 3 && A.R.myId > 0 && B.R.myId > 0 && A.R.players.length === 3), 'deux invités entrent');
const idA = A.R.myId, idB = B.R.myId;
ok(H.b.DDRoom && A.R.netStats().proto === 3, 'protocole 3 négocié');

/* ---------- 0. page figée (un jeu qui construit son décor) : pas de fausse coupure ---------- */
// la page fige juste après l'envoi d'une sonde (avec un vrai réseau, il y en a presque toujours une en route)
await sleep(800);
const ev0 = [H, A, B].map((P) => P.log.ev.length), rc0 = [H, A, B].map((P) => P.R.netStats().reconnects);
await until(() => A.nets.some((n) => n.probeAt), 3000);
const tf = Date.now(); while (Date.now() - tf < 6500) { /* tout le fil d'exécution est bloqué, comme un onglet occupé */ }
await sleep(1500);
ok([H, A, B].every((P, k) => !P.log.ev.slice(ev0[k]).includes('net:down') && P.R.netStats().reconnects === rc0[k]), 'page figée 6 s : pas de fausse coupure ' + JSON.stringify([H, A, B].map((P, k) => [P.log.ev.slice(ev0[k]), P.R.netStats().reconnects - rc0[k]])));

/* ---------- 1. coupure nette d'un invité ---------- */
p1.cut();
await Promise.all([burst(H, idA, 'c1', 30), burst(A, 'host', 'c1', 30)]);
ok(await until(() => inOrder(seqOf(A.log, 'c1'), 30) && inOrder(seqOf(H.log, 'c1'), 30)), 'coupure nette : tous les messages arrivent, dans l\'ordre, sans doublon ' + JSON.stringify([seqOf(A.log, 'c1').length, seqOf(H.log, 'c1').length]));
ok(ids(H.R) === `0,${idA},${idB}`.split(',').sort().join(',') && !H.log.ev.some((e) => e.startsWith('left')), 'coupure nette : personne ne quitte le salon');
ok(A.R.netStats().resumed >= 1, 'coupure nette : place reprise sur le serveur');

/* ---------- 2. connexion figée (wifi mort sans fermeture) ---------- */
p2.freeze();
await Promise.all([burst(H, idB, 'c2', 20), burst(B, 'host', 'c2', 20)]);
// une sonde sans réponse pendant 14 s (DEAD_MS) signe une connexion morte : on laisse le temps de la détecter et de reprendre
ok(await until(() => inOrder(seqOf(B.log, 'c2'), 20) && inOrder(seqOf(H.log, 'c2'), 20), 24000), 'connexion figée : détectée et reprise, messages complets ' + JSON.stringify([seqOf(B.log, 'c2'), seqOf(H.log, 'c2').length]));
ok(B.log.ev.includes('net:down') && B.log.ev.includes('net:up'), 'connexion figée : le joueur voit la coupure puis le retour');
ok(H.R.players.length === 3 && !H.R.players.some((p) => p.away), 'connexion figée : même salon, plus personne en reconnexion');

/* ---------- 3. coupure de l'hôte ---------- */
pH.cut();
await Promise.all([burst(H, 'all', 'c3h', 20), burst(A, 'host', 'c3a', 20)]);
ok(await until(() => inOrder(seqOf(A.log, 'c3h'), 20) && inOrder(seqOf(B.log, 'c3h'), 20) && inOrder(seqOf(H.log, 'c3a'), 20)), 'coupure de l\'hôte : tout arrive ' + JSON.stringify([seqOf(A.log, 'c3h').length, seqOf(B.log, 'c3h').length, seqOf(H.log, 'c3a').length]));
ok(!A.log.ev.includes('migrating') && !B.log.ev.includes('migrating'), 'coupure de l\'hôte : pas de migration');

/* ---------- 3b. débit montant de l'hôte trop juste : ses instantanés volatils sautent, pas de fausse coupure ---------- */
// L'hôte diffuse plus d'instantanés que sa ligne n'en laisse passer. Les volatils doivent sauter (avant, ceux qu'il
// envoyait par le salon partaient comme des messages garantis : la file grossissait jusqu'à ce que sa sonde tarde
// 14 s, il se croyait coupé et les invités voyaient « Coupure chez l'hôte »)
{
  const evH = H.log.ev.length, rcH = H.R.netStats().reconnects, drH = H.R.netStats().dropped, pad = 'x'.repeat(3000);
  let sawAway = false, k = 0;
  pH.throttle(24 * 1024); // 24 Ko/s montants, pour 60 Ko/s d'instantanés
  const t0 = Date.now();
  while (Date.now() - t0 < 18000) {
    H.R.sendGame('all', { tag: 'c3s', d: pad }, true);
    H.R.sendGame('all', { tag: 'c3e', k: ++k });       // un petit événement garanti avec chaque instantané
    A.R.sendGame('host', { tag: 'c3i' }, true);        // les commandes de l'invité
    if (A.R.hostAway) sawAway = true;
    await sleep(50);
  }
  pH.throttle(0);
  ok(await until(() => inOrder(seqOf(A.log, 'c3e'), k), 10000), 'débit montant saturé : tous les événements garantis arrivent ' + JSON.stringify([seqOf(A.log, 'c3e').length, k]));
  ok(H.R.netStats().dropped > drH, 'débit montant saturé : l\'hôte saute ses instantanés volatils');
  ok(!H.log.ev.slice(evH).includes('net:down') && H.R.netStats().reconnects === rcH && !sawAway, 'débit montant saturé : pas de fausse coupure de l\'hôte ' + JSON.stringify([H.log.ev.slice(evH), H.R.netStats().reconnects - rcH, sawAway]));
}

/* ---------- 3c. onglet de l'hôte caché depuis longtemps, micro-coupure : il revient aussitôt ---------- */
// Ses minuteries ne se réveillent plus que toutes les 5 s (Chrome : une minute), au-delà des 2,5 s pendant lesquelles
// le serveur de test lui garde sa place. Celles du réseau passent par un Worker : il se reconnecte tout de suite et
// garde le salon (avant, il revenait trop tard, sa place était perdue et un invité reprenait le salon).
{
  const evA = A.log.ev.length, evB = B.log.ev.length, rcH = H.R.netStats().reconnects;
  HT.T.on = true;
  await sleep(300);
  pH.cut();
  ok(await until(() => H.R.netStats().reconnects > rcH && !A.R.hostAway && !B.R.hostAway, 2000), 'onglet de l\'hôte caché : il se reconnecte aussitôt ' + JSON.stringify([H.R.netStats().reconnects - rcH, A.R.hostAway]));
  await burst(H, 'all', 'c3c', 10);
  ok(await until(() => inOrder(seqOf(A.log, 'c3c'), 10) && inOrder(seqOf(B.log, 'c3c'), 10)), 'onglet de l\'hôte caché : les messages circulent');
  ok(![...A.log.ev.slice(evA), ...B.log.ev.slice(evB)].includes('migrating') && H.R.isHost, 'onglet de l\'hôte caché : il garde le salon');
  HT.T.on = false;
}

/* ---------- 4. partie en cours : coupure trop longue d'un invité ---------- */
H.R.setGame('drift', {});
await until(() => A.R.game && B.R.game);
p2.block(true);
ok(await until(() => H.R.players.find((p) => p.id === idB)?.away, 5000), 'coupure longue : joueur marqué en reconnexion');
await sleep(3500); // la place expire sur le serveur
ok(H.R.players.some((p) => p.id === idB && !p.cid), 'coupure longue en partie : le joueur reste dans la partie');
p2.block(false);
ok(await until(() => H.R.players.find((p) => p.id === idB)?.cid && !H.R.players.find((p) => p.id === idB).away, 10000), 'coupure longue : il revient à sa place');
ok(B.R.myId === idB && H.R.players.length === 3, 'coupure longue : même numéro, pas de doublon ' + ids(H.R));
await burst(H, idB, 'c4', 10);
ok(await until(() => inOrder(seqOf(B.log, 'c4'), 10)), 'coupure longue : la partie reprend');

/* ---------- 5. salon sans partie : coupure trop longue ---------- */
H.R.setGame(null);
await until(() => !A.R.game);
p1.block(true);
await sleep(3500);
p1.block(false);
ok(await until(() => H.R.players.length === 3 && H.R.players.find((p) => p.id === idA)?.cid && A.R.players.length === 3, 10000), 'salon : retour après une longue coupure, même numéro ' + ids(H.R));
ok(A.R.myId === idA, 'salon : le joueur garde son numéro');

/* ---------- 6. redémarrage du serveur ---------- */
const before = { a: A.log.ev.length, b: B.log.ev.length };
srv.kill(); await sleep(300); await startServer();
ok(await until(() => H.R.players.length === 3 && H.R.players.every((p) => p.id === 0 || p.cid) && A.R.players.length === 3 && B.R.players.length === 3, 15000), 'redémarrage du serveur : tout le monde revient ' + ids(H.R));
ok(H.R.code && A.R.code === H.R.code && B.R.code === H.R.code, 'redémarrage du serveur : même code de salon');
ok(![...A.log.ev.slice(before.a), ...B.log.ev.slice(before.b)].some((e) => e.startsWith('closed') || e === 'migrating'), 'redémarrage du serveur : ni fermeture ni migration');
await Promise.all([burst(H, 'all', 'c6h', 10), burst(B, 'host', 'c6b', 10)]);
ok(await until(() => inOrder(seqOf(A.log, 'c6h'), 10) && inOrder(seqOf(H.log, 'c6b'), 10)), 'redémarrage du serveur : les messages circulent');

/* ---------- 7. l'hôte disparaît trop longtemps : les autres migrent, il les retrouve ---------- */
pH.block(true);
ok(await until(() => A.R.isHost || B.R.isHost, 12000), 'hôte injoignable : un invité reprend le salon');
pH.block(false);
ok(await until(() => { const N = A.R.isHost ? A : B; return N.R.players.length === 3 && H.R.mode === 'guest' && H.R.players.length === 3; }, 20000),
  'l\'ancien hôte rejoint le salon migré ' + JSON.stringify([A.R.players.length, B.R.players.length, H.R.mode, H.R.players.length]));
ok(H.R.myId === 0 && H.R.code === A.R.code && A.R.code === B.R.code, 'l\'ancien hôte garde son numéro');
const NH = A.R.isHost ? A : B;
await burst(NH, 0, 'c7', 10);
ok(await until(() => inOrder(seqOf(H.log, 'c7'), 10)), 'l\'ancien hôte reçoit de nouveau les messages');

/* ---------- 8. départ réel de l'hôte : migration ---------- */
const [X, Y] = NH === A ? [A, B] : [B, A]; // X est l'hôte actuel
X.R.leave();
ok(await until(() => H.R.isHost || Y.R.isHost, 8000), 'l\'hôte part : un invité reprend le salon');
ok(await until(() => H.R.players.length === 2 && Y.R.players.length === 2, 8000), 'migration : les deux restants se retrouvent');
for (const p of [H, Y]) p.R.leave();

// un salon neuf de n joueurs (chacun derrière son mandataire), tous entrés
async function newRoom(names, port) {
  const px = names.map((_, k) => proxy(port + k));
  const ps = names.map((n, k) => player(port + k, n, ('uid' + n.toLowerCase() + 'xxxxxxx').slice(0, 10)));
  ps[0].R.host(ps[0].me);
  await until(() => ps[0].R.code);
  for (const p of ps.slice(1)) { p.R.join(ps[0].R.code, p.me); await until(() => p.R.myId > 0); }
  await until(() => ps.every((p) => p.R.players.length === ps.length));
  return { px, ps, close: () => { for (const p of ps) p.R.leave(); for (const x of px) x.server.close(); } };
}

/* ---------- 9. partie en cours : l'hôte absent plus longtemps que sa place gardée rejoint le nouvel hôte ---------- */
// (avant, il gardait sa place d'hôte pendant une partie : il rouvrait l'ancien code et restait seul, avec une
// seconde partie, pendant que les autres jouaient chez le nouvel hôte)
{
  const S = await newRoom(['Hote', 'Ines', 'Jules'], 8211), [H9, A9, B9] = S.ps;
  H9.R.setGame('backrooms', {});
  await until(() => A9.R.game && B9.R.game);
  S.px[0].block(true);
  ok(await until(() => A9.R.isHost || B9.R.isHost, 12000), 'partie en cours, hôte injoignable : un invité reprend le salon');
  await sleep(1000);
  S.px[0].block(false);
  const N9 = A9.R.isHost ? A9 : B9;
  ok(await until(() => H9.R.mode === 'guest' && H9.R.code === N9.R.code && N9.R.players.length === 3, 20000),
    'partie en cours : l\'ancien hôte rejoint le nouveau salon, pas de second salon ' + JSON.stringify([H9.R.mode, H9.R.code, N9.R.code, N9.R.players.length]));
  ok(H9.R.myId === 0 && H9.R.game && H9.R.game.id === 'backrooms', 'partie en cours : l\'ancien hôte garde son numéro et retrouve la partie');
  S.close();
}

/* ---------- 9b. même coupure, mais plus personne de présent : l'hôte garde son salon ---------- */
// (Léa a fermé son onglet en pleine partie : personne n'a repris le salon, l'hôte ne doit pas partir l'attendre ailleurs)
{
  const S = await newRoom(['Hote', 'Lea'], 8216), [H9b, L9b] = S.ps, code = H9b.R.code;
  H9b.R.setGame('backrooms', {});
  await until(() => L9b.R.game);
  L9b.R.leave();
  await until(() => H9b.R.players.find((p) => p.id === 1)?.away, 5000);
  S.px[0].block(true);
  await sleep(4000); // plus que la place gardée par le relais de test (2,5 s)
  S.px[0].block(false);
  ok(await until(() => H9b.log.ev.includes('net:up'), 10000) && H9b.R.isHost && H9b.R.code === code && !H9b.log.ev.some((e) => /^(migrating|closed)/.test(e)),
    'seul en partie : l\'hôte revenu d\'une longue coupure garde son salon ' + JSON.stringify([H9b.R.mode, H9b.log.ev]));
  L9b.R.join(code, L9b.me);
  ok(await until(() => L9b.R.myId === 1 && H9b.R.players.some((p) => p.id === 1 && p.cid && !p.away), 8000), 'seul en partie : le salon est bien rouvert, Léa y retrouve sa place');
  S.close();
}

/* ---------- 10. élection du successeur : ni un joueur en coupure, ni un joueur resté au salon ---------- */
// Ines (plus petit numéro) a fermé son onglet en pleine partie, Jules est resté au salon, Kim joue : c'est Kim qui
// reprend (avant : tout le monde attendait Ines, puis « Impossible de joindre le nouvel hôte » ; ou Jules reprenait
// sans avoir la partie, et ceux qui jouaient restaient sans hôte)
{
  const S = await newRoom(['Hote', 'Ines', 'Jules', 'Kim'], 8221), [H10, I10, J10, K10] = S.ps;
  H10.R.setGame('backrooms', {});
  await until(() => S.ps.every((p) => p.R.game));
  I10.R.setReady('backrooms'); K10.R.setReady('backrooms');
  await until(() => S.ps.every((p) => p.R.ready[I10.R.myId] === 'backrooms' && p.R.ready[K10.R.myId] === 'backrooms'));
  I10.R.leave();
  ok(await until(() => [H10, J10, K10].every((p) => p.R.players.find((q) => q.id === I10.R.myId)?.away), 5000), 'élection : le joueur parti est vu en reconnexion par tous');
  const code = H10.R.successorCode(), t0 = Date.now();
  H10.R.leave();
  ok(await until(() => K10.R.isHost && J10.R.mode === 'guest' && J10.R.code === K10.R.code && K10.R.players.length === 2, 8000),
    'élection : le joueur en partie reprend le salon, celui resté au salon le rejoint ' + JSON.stringify([K10.R.mode, J10.R.mode, J10.R.code, K10.R.code]));
  ok(Date.now() - t0 < 5000 && !J10.log.ev.some((e) => e.startsWith('closed')), 'élection : migration en quelques secondes, personne n\'est renvoyé ' + (Date.now() - t0) + ' ms');
  ok(code === K10.R.code, 'élection : successorCode() de l\'hôte donne le code du salon migré ' + JSON.stringify([code, K10.R.code]));
  S.close();
}

/* ---------- 11. usurpation : un invité ne peut pas se faire passer pour l'hôte ---------- */
{
  const S = await newRoom(['Hote', 'Mallory', 'Bob'], 8231), [H11, M11, B11] = S.ps;
  H11.R.setGame('backrooms', {});
  await until(() => B11.R.game);
  const evil = M11.nets[M11.nets.length - 1], bob = B11.nets[B11.nets.length - 1];
  const bobCid = H11.R.players.find((p) => p.id === B11.R.myId).cid;
  const got0 = B11.log.got.length;
  // par le relais : à tout le salon et directement à Bob (faux message de jeu, faux départ, faux renvoi)
  for (const to of ['all', bobCid]) {
    evil._relay(to, { t: 'g', from: 0, m: { tag: 'faux' } });
    evil._relay(to, { t: 'kicked', by: 'Hote', reason: 'faux' });
    evil._relay(to, { t: 'bye' });
    evil._relay(to, { _ctrl: 'bye' });
  }
  await sleep(1500);
  ok(B11.log.got.length === got0 && B11.R.mode === 'guest' && B11.R.code === H11.R.code && !B11.log.ev.some((e) => /^(migrating|closed)/.test(e)),
    'usurpation : rien n\'arrive à Bob, qui reste chez le vrai hôte ' + JSON.stringify([B11.log.got.length - got0, B11.R.mode, B11.log.ev]));
  // une page à jour ignore aussi ce qu'un relais plus ancien laisserait passer : seul ce qui vient de 'host' compte
  bob._onMsg(JSON.stringify({ type: 'relay', from: 'cdeadbeef', data: { t: 'bye' } }));
  bob._onMsg(JSON.stringify({ type: 'relay', from: 'cdeadbeef', data: { t: 'g', from: 0, m: { tag: 'faux' } } }));
  await sleep(600);
  ok(B11.log.got.length === got0 && B11.R.mode === 'guest' && !B11.log.ev.some((e) => /^(migrating|closed)/.test(e)), 'usurpation : la page de l\'invité écarte les messages d\'un autre joueur');
  H11.R.sendGame(B11.R.myId, { tag: 'vrai' });
  M11.R.sendGame('all', { tag: 'via-hote' }); // un invité passe par l'hôte, qui fait suivre
  ok(await until(() => B11.log.got.some((m) => m.tag === 'vrai') && B11.log.got.some((m) => m.tag === 'via-hote')), 'usurpation : les vrais messages, de l\'hôte et relayés par lui, passent toujours');
  S.close();
}

/* ---------- 12. vol de place : sans hello, une connexion ne prend pas la place d'un joueur encore connecté ---------- */
// Un invité qui a perdu sa place sur le relais revient sous une nouvelle connexion. Ses premiers messages (jeu, ping)
// peuvent arriver avant son hello : l'hôte le retrouve par le numéro qu'ils portent (fromId). Avant, il le faisait même
// quand le joueur était encore là : une seconde connexion d'un client modifié, annoncée sous le numéro de Bob, prenait
// sa place, recevait ce qui n'était destiné qu'à lui (sa fiche de rôle dans Mystère Mystère…) et parlait en son nom.
{
  const S = await newRoom(['Hote', 'Mallory', 'Bob'], 8241), [H12, M12, B12] = S.ps;
  H12.R.setGame('mystery', {});
  await until(() => M12.R.game && B12.R.game);
  const idB = B12.R.myId, cidB = H12.R.players.find((p) => p.id === idB).cid;
  const got = [], evil = M12.b.DDNet.create({ prefix: 'ddhub-v1-', maxPeers: 5 });
  evil.join(H12.R.code, { open() {}, msg: (m) => got.push(m), close() {}, error() {} });
  ok(await until(() => evil.opened), 'vol de place : la seconde connexion de Mallory entre dans le salon, sans dire bonjour');
  evil.toHost({ t: 'ping', ts: 1, fromId: idB });
  evil.toHost({ t: 'g', fromId: idB, to: 'host', m: { tag: 'vol' } });
  await sleep(600);
  H12.R.sendGame(idB, { tag: 'fiche' });
  await until(() => B12.log.got.some((m) => m.tag === 'fiche'), 3000);
  const stolen = got.some((m) => m.t === 'g' && m.m && m.m.tag === 'fiche');
  ok(H12.R.players.find((p) => p.id === idB).cid === cidB && B12.log.got.some((m) => m.tag === 'fiche') && !stolen && !H12.log.got.some((m) => m.tag === 'vol'),
    'vol de place : Bob garde sa place, ce qui lui est destiné n\'arrive qu\'à lui, l\'intrus ne parle pas en son nom '
    + JSON.stringify([H12.R.players.find((p) => p.id === idB).cid === cidB, B12.log.got.some((m) => m.tag === 'fiche'), stolen, H12.log.got.some((m) => m.tag === 'vol')]));
  evil.close();
  S.close();
}

/* ---------- 12b. reprise normale : un invité dont la place s'est libérée la retrouve par son numéro ---------- */
// Zoé perd sa place sur le relais en pleine partie ; ce que son jeu envoie dès son retour, avant même que son hello
// ne soit arrivé, parvient à l'hôte sous son nom : sa place est libre, son numéro suffit
{
  const S = await newRoom(['Hote', 'Zoe'], 8246), [H12b, Z12b] = S.ps, idZ = Z12b.R.myId;
  H12b.R.setGame('mystery', {});
  await until(() => Z12b.R.game);
  const zoe = Z12b.nets[Z12b.nets.length - 1], onMsg = zoe._onMsg;
  let early = false;
  zoe._onMsg = function (raw) { onMsg.call(this, raw); if (!early && /"type":"room_joined"/.test(raw)) { early = true; Z12b.R.sendGame('host', { tag: 'tot' }); } };
  S.px[1].block(true);
  ok(await until(() => H12b.R.players.find((p) => p.id === idZ && !p.cid), 6000), 'reprise normale : la place de Zoé se libère quand sa coupure dure trop');
  S.px[1].block(false);
  ok(await until(() => { const k = H12b.log.got.findIndex((m) => m.tag === 'tot'); return k >= 0 && H12b.log.from[k] === idZ; }, 10000) && early,
    'reprise normale : le premier message de Zoé, parti avant son hello, arrive à l\'hôte sous son nom ' + JSON.stringify([early, H12b.log.from[H12b.log.got.findIndex((m) => m.tag === 'tot')]]));
  ok(await until(() => Z12b.R.myId === idZ && H12b.R.players.some((p) => p.id === idZ && p.cid && !p.away) && H12b.R.players.length === 2, 8000), 'reprise normale : Zoé retrouve sa place, même numéro');
  H12b.R.sendGame(idZ, { tag: 'fiche' });
  ok(await until(() => Z12b.log.got.some((m) => m.tag === 'fiche')), 'reprise normale : l\'hôte écrit de nouveau à Zoé');
  S.close();
}

/* ---------- 13. file d'envoi de l'hôte débordée pendant une coupure : il suit le successeur ---------- */
// Coupé, l'hôte garde ses messages pour les renvoyer à la reprise ; au-delà de 3000, il renonce à reprendre sa place.
// Avant, il relançait join_room tant que le relais la gardait encore ('unavailable-id'), puis rouvrait seul l'ancien
// code dès qu'elle avait expiré, alors que les invités étaient déjà partis chez le successeur : deux parties.
{
  const S = await newRoom(['Hote', 'Nina', 'Omar'], 8251), [H13, A13, B13] = S.ps, code = H13.R.code;
  H13.R.setGame('backrooms', {});
  await until(() => A13.R.game && B13.R.game);
  S.px[0].block(true);
  for (let k = 1; k <= 3001; k++) H13.R.sendGame('all', { tag: 'c13', k }); // plus que la file d'envoi n'en garde
  ok(!H13.nets[0].sid, 'file débordée : l\'hôte renonce à reprendre sa place');
  await sleep(800); // il revient avant que le relais de test (2,5 s) n'ait libéré son ancienne place
  S.px[0].block(false);
  const N13 = () => [A13, B13].find((p) => p.R.isHost);
  ok(await until(() => N13() && H13.R.mode === 'guest' && H13.R.code === N13().R.code && N13().R.players.length === 3, 20000),
    'file débordée : l\'ancien hôte rejoint le successeur au lieu de rouvrir seul son code ' + JSON.stringify([H13.R.mode, H13.R.code === code, A13.R.mode, B13.R.mode, N13() && N13().R.players.length]));
  ok(H13.R.myId === 0 && H13.R.code === A13.R.code && A13.R.code === B13.R.code && N13()?.R.players.some((p) => p.id === 0 && p.cid) && H13.R.game?.id === 'backrooms',
    'file débordée : l\'ancien hôte garde son numéro et retrouve la partie');
  S.close();
}

/* ---------- 13b. même débordement, mais personne d'autre de présent : l'hôte garde son salon ---------- */
// (Paul est lui aussi coupé : personne ne reprendra le salon, l'hôte rouvre son code et Paul y revient, comme en 9b)
{
  const S = await newRoom(['Hote', 'Paul'], 8256), [H13b, P13b] = S.ps, code = H13b.R.code;
  H13b.R.setGame('backrooms', {});
  await until(() => P13b.R.game);
  S.px[1].block(true);
  await until(() => H13b.R.players.find((p) => p.id === 1)?.away, 5000);
  S.px[0].block(true);
  for (let k = 1; k <= 3001; k++) H13b.R.sendGame('all', { tag: 'c13b', k });
  ok(!H13b.nets[0].sid, 'file débordée, seul en partie : l\'hôte renonce à reprendre sa place');
  await sleep(800);
  S.px[0].block(false);
  ok(await until(() => H13b.log.ev.includes('net:up'), 10000) && H13b.R.isHost && H13b.R.code === code && !H13b.log.ev.some((e) => /^(migrating|closed)/.test(e)),
    'file débordée, seul en partie : l\'hôte garde son salon ' + JSON.stringify([H13b.R.mode, H13b.log.ev]));
  S.px[1].block(false);
  ok(await until(() => P13b.R.myId === 1 && P13b.R.code === code && H13b.R.players.some((p) => p.id === 1 && p.cid && !p.away), 10000), 'file débordée, seul en partie : Paul retrouve sa place dans le salon rouvert');
  S.close();
}

srv.kill();
for (const p of [pH, p1, p2]) p.server.close();
console.log(fails ? `\n${fails} échec(s), ${passes} réussis` : `Connexion : ${passes} vérifications réussies`);
process.exit(fails ? 1 : 0);
