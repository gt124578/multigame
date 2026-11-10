// Journal des versions automatique.
// Lancé par .github/workflows/changelog.yml à chaque push sur main : si les commits poussés n'ont pas touché
// CHANGELOG.md (autre compte, autre IA, oubli), on ajoute une entrée rédigée à partir des messages de commit
// et on monte la version du Hub (3.0 → 3.1). Si le journal a été écrit à la main, on vérifie seulement que
// la version affichée par le Hub correspond à la dernière entrée.
//
//   node tools/changelog-auto.mjs <sha avant> <sha après> [--dry-run]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHANGELOG = join(ROOT, 'CHANGELOG.md'), HUB = join(ROOT, 'hub/hub.js');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

const ZERO = /^0+$/;
let [before, after] = args;
after = after || 'HEAD';
if (!before || ZERO.test(before)) before = git('rev-parse', `${after}~1`);
try { git('cat-file', '-e', before + '^{commit}'); } catch { before = git('rev-parse', `${after}~1`); }

// ------------------------------------------------------------------ version
const hubSrc = readFileSync(HUB, 'utf8');
const hubVer = (hubSrc.match(/const VERSION = '([\d.]+)'/) || [])[1];
const log = readFileSync(CHANGELOG, 'utf8');
const topVer = (log.match(/^## ([\d.]+)/m) || [])[1];
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); };
const setHubVersion = (v) => {
  if (v === hubVer) return false;
  if (!DRY) writeFileSync(HUB, hubSrc.replace(/const VERSION = '[\d.]+'/, `const VERSION = '${v}'`));
  // même numéro dans les liens des pages (?v=…) : les navigateurs rechargent les fichiers à chaque version
  if (!DRY) for (const page of ['index.html', 'apropos.html']) {
    try { const f = new URL('../' + page, import.meta.url); writeFileSync(f, readFileSync(f, 'utf8').replace(/\?v=[\d.]+"/g, `?v=${v}"`)); } catch (e) {}
  }
  console.log(`Version du Hub : ${hubVer} → ${v}`);
  return true;
};

const touched = git('diff', '--name-only', before, after).split('\n').filter(Boolean);
if (touched.includes('CHANGELOG.md')) {
  // journal écrit à la main : on aligne seulement la version affichée
  if (topVer && hubVer && cmp(topVer, hubVer) !== 0) setHubVersion(topVer);
  else console.log('CHANGELOG.md déjà mis à jour dans ce push : rien à faire.');
  process.exit(0);
}

// ------------------------------------------------------------------ commits
const SEP = '\u001f', END = '\u001e';
const raw = git('log', '--no-merges', `--format=%H${SEP}%an${SEP}%s${SEP}%b${END}`, `${before}..${after}`);
const commits = raw.split(END).map((c) => c.trim()).filter(Boolean).map((c) => {
  const [sha, author, subject, body] = c.split(SEP);
  const files = git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean);
  return { sha, author, subject: subject.trim(), body: (body || '').trim(), files };
}).reverse();

const GAMES = {
  drift: 'Duo Drift', david: 'DavidSimulator', monopoly: 'DavidSimulator', calcul: 'Tête de Calcul',
  bastion: 'Bastion Clash', outbreak: 'Outbreak', filrouge: 'Fil Rouge', kart: 'Cyber Kart GP', convoy: 'Convoy Storm', fief: 'Fief Maudit', golf: 'Birdie Party', minigolf: 'Mini-Golf Party', royale: 'Island Rush', dogfight: 'Dogfight 3D', mollo: 'Mollo !', sitenoir: 'Site Noir', hub: 'Hub', shared: 'Hub', server: 'Serveur', relay: 'Serveur',
};
const NOT_FOR_PLAYERS = /^(\.github\/|docs\/|tools\/|AGENTS\.md$|CLAUDE\.md$|GEMINI\.md$|README\.md$)/;
const TYPES = { feat: 'nouveau', fix: 'correction', perf: 'plus rapide', revert: 'retour en arrière' };
const TECH = ['refactor', 'style', 'chore', 'docs', 'test', 'ci', 'build'];

function gameOf(scope, files) {
  if (scope && GAMES[scope.toLowerCase()]) return GAMES[scope.toLowerCase()];
  const set = new Set(files.filter((f) => !NOT_FOR_PLAYERS.test(f)).map((f) => (f === 'index.html' ? 'hub' : f.split('/')[0])).map((d) => GAMES[d]).filter(Boolean));
  return set.size === 1 ? [...set][0] : null;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) => cap(s.replace(/\s+/g, ' ').replace(/[.;\s]+$/, '').trim());

const bullets = [];
let techCount = 0;
const authors = new Set();
for (const c of commits) {
  if (/\[skip changelog\]/i.test(c.subject + c.body) || /^changelog\b/i.test(c.subject)) continue;
  if (c.files.length && c.files.every((f) => NOT_FOR_PLAYERS.test(f))) continue;
  const m = c.subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  const type = m ? m[1].toLowerCase() : null, scope = m ? m[2] : null, text = m ? m[3] : c.subject;
  if (type && TECH.includes(type)) { techCount++; authors.add(c.author); continue; }
  const game = gameOf(scope, c.files);
  const kind = type && TYPES[type] ? `${TYPES[type]} : ` : '';
  const head = `${game ? `**${game}** — ` : ''}${cap(kind)}${kind ? text.replace(/\s+/g, ' ').replace(/[.;\s]+$/, '').trim() : clean(text)}`;
  const subs = c.body.split('\n').map((l) => l.match(/^\s*[-*•]\s+(.+)/)).filter(Boolean).map((x) => clean(x[1])).slice(0, 6);
  bullets.push(`- ${head}${c.author ? ` (${c.author})` : ''}` + subs.map((s) => `\n  - ${s}`).join(''));
  authors.add(c.author);
}
if (techCount) bullets.push(`- Améliorations techniques sous le capot (${techCount} modification${techCount > 1 ? 's' : ''}).`);
if (!bullets.length) { console.log('Aucun changement visible par les joueurs : journal inchangé.'); process.exit(0); }

// ------------------------------------------------------------------ nouvelle entrée
const base = [hubVer, topVer].filter(Boolean).sort(cmp).pop() || '2.0';
const [maj, min] = base.split('.').map(Number);
const next = `${maj}.${(min || 0) + 1}`;
const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const entry = `## ${next} — ${date}\n${bullets.join('\n')}\n`;

const at = log.search(/^## /m);
const out = at < 0 ? `${log.trimEnd()}\n\n${entry}` : `${log.slice(0, at)}${entry}\n${log.slice(at)}`;
if (DRY) { console.log(entry); process.exit(0); }
writeFileSync(CHANGELOG, out);
setHubVersion(next);
console.log(`Entrée ${next} ajoutée (${bullets.length} ligne${bullets.length > 1 ? 's' : ''}, ${[...authors].join(', ')}).`);
