// Donne (ou retire) le grade VIP à un compte Arcadia : node tools/vip-add.mjs <identifiant> [--retirer]
// L'identifiant est celui du compte en ligne (celui qu'on tape pour se connecter, en minuscules).
// Seule son empreinte SHA-256 est écrite dans hub/vip.js : le dépôt ne dit pas qui est VIP.
import fs from 'node:fs';
import crypto from 'node:crypto';
const [user, flag] = process.argv.slice(2);
if (!user) { console.error('Usage : node tools/vip-add.mjs <identifiant> [--retirer]'); process.exit(1); }
const id = user.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
const h = crypto.createHash('sha256').update('arcadia-vip:' + id).digest('hex');
const p = new URL('../hub/vip.js', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const line = `    '${h}', // ${id.slice(0, 2)}…\n`;
if (flag === '--retirer') {
  s = s.replace(new RegExp(`    '${h}',.*\\n`), '');
  console.log(`Grade VIP retiré à « ${id} ».`);
} else if (s.includes(h)) {
  console.log(`« ${id} » est déjà VIP.`);
} else {
  s = s.replace('    // empreintes des identifiants VIP (tools/vip-add.mjs)\n', (m) => m + line);
  console.log(`« ${id} » est maintenant VIP.`);
}
fs.writeFileSync(p, s);
