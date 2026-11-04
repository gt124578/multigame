import { fileURLToPath } from 'node:url';
// tools/test-accounts.mjs — comptes Arcadia (identifiant + mot de passe) du serveur relais (server/accounts.js),
// contre une fausse API GitHub, avec le vrai code du navigateur (hub/account.js) exécuté sous Node.
// Usage : node tools/test-accounts.mjs   (le serveur ws doit être installé : cd server && npm install)
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('ÉCHEC :', msg); } else console.log('ok -', msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- fausse API GitHub : refs et contenus d'une seule branche ---------- */
const store = new Map(); let refs = { main: 'abc' }, puts = 0, delayPut = 0;
const api = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const u = new URL(req.url, 'http://x'), send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer jeton-test') return send(401, {});
    let m;
    if (req.method === 'GET' && (m = /^\/repos\/o\/r\/git\/ref\/heads\/(.+)$/.exec(u.pathname))) return refs[m[1]] ? send(200, { object: { sha: refs[m[1]] } }) : send(404, {});
    if (req.method === 'GET' && u.pathname === '/repos/o/r') return send(200, { default_branch: 'main' });
    if (req.method === 'POST' && u.pathname === '/repos/o/r/git/refs') { const b = JSON.parse(body); refs[b.ref.replace('refs/heads/', '')] = b.sha; return send(201, {}); }
    if ((m = /^\/repos\/o\/r\/contents\/(.+)$/.exec(u.pathname))) {
      const p = m[1];
      if (req.method === 'GET') { const f = store.get(p); return f ? send(200, { sha: f.sha, content: f.content }) : send(404, {}); }
      if (req.method === 'PUT') {
        const b = JSON.parse(body), f = store.get(p);
        if (b.branch !== 'saves' || !refs.saves) return send(422, {});
        if (f && b.sha !== f.sha) return send(409, {});
        if (delayPut) await sleep(delayPut);
        puts++; const sha = crypto.randomBytes(8).toString('hex'); store.set(p, { sha, content: b.content });
        return send(f ? 200 : 201, { content: { sha } });
      }
    }
    send(404, {});
  });
});
await new Promise((r) => api.listen(0, r));
const apiPort = api.address().port;

const start = (port, env) => {
  const p = spawn('node', [fileURLToPath(new URL('../server/server.js', import.meta.url))], { env: { ...process.env, PORT: String(port), RELAY_LOG_DIR: '/tmp/ddtest-accounts-logs', ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
  return p;
};
const srv = start(8141, { GITHUB_TOKEN: 'jeton-test', SAVES_REPO: 'o/r', SAVES_API: `http://127.0.0.1:${apiPort}`, SAVES_GAP_MS: '400' });
const off = start(8142, { GITHUB_TOKEN: '' });
await sleep(700);
const post = async (port, path, o) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: typeof o === 'string' ? o : JSON.stringify(o) }); return { status: r.status, json: await r.json().catch(() => null), cors: r.headers.get('access-control-allow-origin') }; };


// le module du navigateur, tel quel, avec un faux window / location / localStorage
import fs from 'node:fs';
const ls = new Map();
globalThis.window = globalThis;
globalThis.location = { search: '?ws=ws://127.0.0.1:8141' };
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
new Function(fs.readFileSync(new URL('../hub/account.js', import.meta.url), 'utf8'))();
const A = globalThis.HubAccount;

try {
  ok(A.normUser('Amiel') === 'amiel' && A.normUser('Élodie M') === 'elodie_m' && A.normUser('ab') === '', 'identifiants normalisés');
  ok(await A.status() === true, 'statut : comptes actifs');
  const profil = { v: 1, n: 'Amiel', c: '#2b8cff', u: 'abc123def', fr: { k: 'k'.repeat(36), f: [['ABCDEFGH', 'Nico', '#ff4b2b']] } };
  await A.create('Amiel', 'motdepasse1', profil);
  ok(A.session() && A.session().user === 'amiel', 'compte créé et connecté');
  // ce qui est rangé sur GitHub : chiffré, et le nom du fichier ne contient pas l'identifiant
  const files = [...store.keys()];
  ok(files.length === 1 && files[0].startsWith('accounts/') && !files[0].includes('amiel'), `fichier anonyme (${files[0]})`);
  const raw = Buffer.from(store.get(files[0]).content, 'base64').toString('utf8');
  ok(!raw.includes('Amiel') && !raw.includes('Nico') && !raw.includes('kkkk') && !raw.includes('motdepasse1'), 'rien de lisible sur GitHub (ni pseudo, ni amis, ni clé, ni mot de passe)');
  let e = await A.create('amiel', 'autre', profil).catch((x) => x);
  ok(e && e.code === 'taken', 'identifiant déjà pris');
  A.logout();
  ok(!A.session(), 'déconnecté');
  e = await A.login('amiel', 'mauvais').catch((x) => x);
  ok(e && e.code === 'auth', 'mauvais mot de passe refusé');
  const back = await A.login('AMIEL', 'motdepasse1');
  ok(back.n === 'Amiel' && back.fr.f[0][1] === 'Nico' && back.fr.k === profil.fr.k, 'connexion : profil retrouvé et déchiffré');
  await A.save({ ...profil, n: 'Amiel2', c: '#ffc531' });
  A.logout();
  const back2 = await A.login('amiel', 'motdepasse1');
  ok(back2.n === 'Amiel2' && back2.c === '#ffc531', 'mise à jour enregistrée');
  // essais à la chaîne : bloqués au bout de 8 ratés
  let codes = [];
  for (let i = 0; i < 9; i++) codes.push((await A.login('amiel', 'x' + i).catch((x) => x)).code);
  ok(codes.slice(0, 7).every((c) => c === 'auth') && codes.at(-1) === 'wait', `trop d'essais : attente (${codes.join(',')})`);
  // le serveur refuse une clé d'accès fausse même en écrivant directement
  const r = await post(8141, '/account/put', { user: 'zz_test', auth: '0'.repeat(64), blob: { iv: 'a', ct: 'b' } });
  ok(r.status === 403, 'écriture sans le bon mot de passe refusée');
  const r2 = await post(8142, '/account/login', { user: 'amiel', auth: '0'.repeat(64) });
  ok(r2.status === 503, 'sans jeton GitHub : 503');
} finally {
  srv.kill(); off.kill(); api.close();
}
if (fails) { console.error(`\n${fails} ÉCHEC(S)`); process.exit(1); }
console.log('\nCOMPTES ARCADIA : TOUS LES TESTS SONT AU VERT');
process.exit(0);
