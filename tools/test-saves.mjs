import { fileURLToPath } from 'node:url';
// tools/test-saves.mjs — sauvegardes en ligne du serveur relais (server/saves.js), contre une fausse API GitHub.
// Usage : node tools/test-saves.mjs   (le serveur ws doit être installé : cd server && npm install)
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
  const p = spawn('node', [fileURLToPath(new URL('../server/server.js', import.meta.url))], { env: { ...process.env, PORT: String(port), RELAY_LOG_DIR: '/tmp/ddtest-saves-logs', ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
  return p;
};
const srv = start(8131, { GITHUB_TOKEN: 'jeton-test', SAVES_REPO: 'o/r', SAVES_API: `http://127.0.0.1:${apiPort}`, SAVES_GAP_MS: '400' });
const off = start(8132, { GITHUB_TOKEN: '' });
await sleep(700);
const post = async (port, path, o) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: typeof o === 'string' ? o : JSON.stringify(o) }); return { status: r.status, json: await r.json().catch(() => null), cors: r.headers.get('access-control-allow-origin') }; };

try {
  const st = await (await fetch('http://127.0.0.1:8131/save/status')).json();
  ok(st.on === true, 'statut : sauvegarde en ligne active');
  const st2 = await (await fetch('http://127.0.0.1:8132/save/status')).json();
  ok(st2.on === false, 'statut : inactive sans jeton');
  ok((await post(8132, '/save/odyssee/get', { key: 'k'.repeat(36) })).status === 503, 'sans jeton : 503');

  const key = crypto.randomBytes(18).toString('hex');
  let r = await post(8131, '/save/odyssee/get', { key });
  ok(r.status === 200 && r.json.save === null && /^[A-Z2-9]{8}$/.test(r.json.fid), 'pas encore de sauvegarde');
  ok(r.cors === '*', 'en-tête CORS présent');
  ok(refs.saves === undefined, 'la branche n\'est pas créée pour une simple lecture');

  r = await post(8131, '/save/odyssee/put', { key, code: 'ODY1.abc.def', meta: { name: 'Amiel<b>', badges: 3, dex: 40, time: 3600 } });
  ok(r.status === 200 && r.json.saved, 'première sauvegarde écrite');
  ok(refs.saves === 'abc', 'branche saves créée depuis main');
  const file = [...store.keys()][0];
  ok(file === `saves/odyssee/${r.json.fid}.json`, 'fichier rangé sous le code ami : ' + file);
  const data = JSON.parse(Buffer.from(store.get(file).content, 'base64').toString());
  ok(data.name === 'Amielb' && data.badges === 3 && data.code === 'ODY1.abc.def' && !JSON.stringify(data).includes(key), 'contenu nettoyé, clé jamais écrite');

  r = await post(8131, '/save/odyssee/get', { key });
  ok(r.json.save && r.json.save.code === 'ODY1.abc.def', 'relecture de la sauvegarde');
  r = await post(8131, '/save/odyssee/get', { key: crypto.randomBytes(18).toString('hex') });
  ok(r.json.save === null, 'une autre clé ne voit pas cette sauvegarde');

  // écritures rapprochées : regroupées, la dernière l'emporte
  const before = puts;
  const rs = await Promise.all([1, 2, 3].map((i) => post(8131, '/save/odyssee/put', { key, code: 'ODY1.v' + i + '.x', meta: { name: 'A' } })));
  ok(rs.every((x) => x.status === 200), 'trois sauvegardes rapprochées acceptées');
  await sleep(1200);
  const last = JSON.parse(Buffer.from(store.get(file).content, 'base64').toString());
  ok(last.code === 'ODY1.v3.x', 'la plus récente est gardée');
  ok(puts - before <= 2, `écritures regroupées (${puts - before} écriture(s) GitHub pour 3 sauvegardes)`);

  // sha périmé (quelqu'un a modifié le fichier à côté) : relu et réécrit
  store.get(file).sha = 'autre';
  await sleep(500);
  r = await post(8131, '/save/odyssee/put', { key, code: 'ODY1.v4.x', meta: {} });
  await sleep(600);
  ok(JSON.parse(Buffer.from(store.get(file).content, 'base64').toString()).code === 'ODY1.v4.x', 'conflit de version : relu et réécrit');

  ok((await post(8131, '/save/odyssee/put', { key, code: 'pas un code' })).status === 400, 'code invalide refusé');
  ok((await post(8131, '/save/odyssee/put', { key: 'court', code: 'ODY1.a.b' })).status === 400, 'clé invalide refusée');
  ok((await post(8131, '/save/autre/put', { key, code: 'ODY1.a.b' })).status === 404, 'jeu inconnu refusé');
  ok((await post(8131, '/save/odyssee/put', '{pas du json')).status === 400, 'JSON invalide refusé');
  ok((await post(8131, '/save/odyssee/put', { key, code: 'ODY1.' + 'x'.repeat(500 * 1024) })).status === 413, 'sauvegarde trop grosse refusée');
  const ws = await fetch('http://127.0.0.1:8131/status'); ok(ws.status === 200, 'le relais répond toujours');
} finally {
  srv.kill(); off.kill(); api.close();
}
console.log(fails ? `${fails} échec(s)` : 'Sauvegardes en ligne : tout est bon.');
process.exit(fails ? 1 : 0);
