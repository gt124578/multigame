// tools/test-vip.mjs — comptes VIP (hub/vip.js) : jeux, réglages et options réservés cachés aux autres joueurs.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('ÉCHEC :', m); } else console.log('ok -', m); };
const code = fs.readFileSync(new URL('../hub/vip.js', import.meta.url), 'utf8')
  .replace(/    \/\/ empreintes des identifiants VIP \(tools\/vip-add\.mjs\)\r?\n/, (m) => m + `    '${crypto.createHash('sha256').update('arcadia-vip:testvip').digest('hex')}',\n`);
const GAMES = [
  { id: 'a', title: 'Normal', settings: [{ key: 'mode', options: [['n', 'Normal'], ['s', 'Secret', { vip: true }]], def: 'n' }, { key: 'x', vip: true, options: [[1, 'Un']], def: 1 }] },
  { id: 'b', title: 'Jeu VIP', vip: true, settings: [] },
];
const run = (user) => {
  const w = { HUB_GAMES: GAMES, HubAccount: { session: () => (user ? { user } : null) }, TextEncoder };
  vm.runInNewContext(code, { window: w, TextEncoder });
  return w;
};
const v = run('testvip');
ok(v.HubVIP.is() && v.HUB_GAMES.length === 2 && v.HUB_GAMES[0].settings[0].options.length === 2, 'le VIP voit tout');
for (const who of ['nico', null]) {
  const n = run(who);
  ok(!n.HubVIP.is(), `${who || 'sans compte'} n'est pas VIP`);
  ok(n.HUB_GAMES.length === 1 && n.HUB_GAMES[0].id === 'a', 'le jeu VIP est caché');
  ok(n.HUB_GAMES[0].settings.length === 1 && n.HUB_GAMES[0].settings[0].options.map((o) => o[0]).join() === 'n', 'réglage et option VIP cachés');
  ok(n.HUB_GAMES_ALL.length === 2, 'le jeu reste lançable si un VIP le choisit dans son salon');
}
const w = run(null);
for (const s of ['', 'amiel', 'é' + 'x'.repeat(70)]) ok(w.HubVIP.hash(s) === crypto.createHash('sha256').update('arcadia-vip:' + s.toLowerCase()).digest('hex'), `empreinte identique à Node (${s.length} car.)`);
// les comptes déjà inscrits (nom de fichier = server/accounts.js pathOf)
const { pathOf } = await import('../server/accounts.js').catch(() => ({}));
const acc = run('amiel'); ok(acc.HubVIP.is(), 'compte inscrit « amiel » reconnu VIP par son fichier');
if (pathOf) ok(pathOf('amiel') === 'accounts/171379463336fbba34735af308802c65.json', 'même empreinte que le serveur');
if (fails) process.exit(1);
console.log('\nCOMPTES VIP : TOUS LES TESTS SONT AU VERT');
