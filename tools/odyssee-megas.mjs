// tools/odyssee-megas.mjs — Méga-Évolutions d'Odyssée, tirées des données PokeAPI (dépôt GitHub PokeAPI/api-data) :
// toutes les Méga dont le Pokémon de base existe dans Odyssée (générations 1 à 6), y compris celles de Légendes Z-A.
// Écrit odyssee/js/data/megas.js (statistiques de base, types, talent, noms français, Méga-Gemme) et copie dans le dépôt
// les sprites (face, dos, chromatiques, icône) des formes Méga et l'icône de chaque Méga-Gemme (odyssee/img/pokeapi/).
// Copie aussi les cris des Pokémon (odyssee/snd/cris/<n°>.ogg) : le jeu n'a plus besoin d'Internet pour eux.
//   node tools/odyssee-megas.mjs [--sans-cris]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data';
const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { SPECIES } = await import('../odyssee/js/data/species.js');

// curl passe par le proxy de l'environnement (fetch de Node ne le fait pas toujours)
const get = (url) => { try { return execFileSync('curl', ['-sfL', url], { maxBuffer: 64 << 20 }); } catch { return null; } };
const json = (p) => { const b = get(API + p); return b ? JSON.parse(b.toString()) : null; };
const fr = (names) => (names || []).find((n) => n.language.name === 'fr')?.name;
const save = (rel, url) => {
  const out = path.join(ROOT, rel);
  if (fs.existsSync(out)) return true;
  const b = get(url); if (!b) return false;
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, b); return true;
};

const idx = json('/api/v2/pokemon/index.json').results.filter((x) => /-mega/.test(x.name));
const items = json('/api/v2/item/index.json').results;
const itemByName = new Map(items.map((x) => [x.name, x.url.match(/(\d+)\/?$/)[1]]));
const STONE_OF = (name) => {   // venusaur-mega → venusaurite ; charizard-mega-x → charizardite-x ; absol-mega-z → absolite-z
  const cands = items.map((x) => x.name).filter((n) => /ite(-[xyz])?$/.test(n));
  const [base, , suf] = name.replace('-male', '').replace('-female', '').match(/^(.*?)-mega(-[xyz])?$/) || [];
  const want = cands.filter((c) => (suf ? c.endsWith('ite' + suf) : /ite$/.test(c)));
  // le nom de la gemme reprend le début du nom anglais du Pokémon (« gyarad-osite », « blastoi-sinite », « sable-nite »)
  let best = null, bestLen = 0;
  for (const c of want) { let k = 0; while (k < base.length && c[k] === base[k]) k++; if (k > bestLen && k >= 4) { best = c; bestLen = k; } }
  return best;
};

const forms = {}, abilities = {}, missing = [];
for (const { name, url } of idx) {
  const pid = +url.match(/(\d+)\/?$/)[1];
  if (/meowstic-female|magearna-original|tatsugiri-(droopy|stretchy)/.test(name)) continue;   // doublons d'une même Méga
  const P = json(`/api/v2/pokemon/${pid}/index.json`); if (!P) { missing.push(name + ' (données)'); continue; }
  const base = +P.species.url.match(/(\d+)\/?$/)[1];
  if (!SPECIES[base]) continue;                                    // Pokémon absent d'Odyssée (7e génération et après)
  const stone = STONE_OF(name);
  if (!stone) { missing.push(name + ' (pas de Méga-Gemme : Méga-Évolution par une attaque)'); continue; }
  const I = json(`/api/v2/item/${itemByName.get(stone)}/index.json`);
  const ab = P.abilities[0]?.ability?.name || null;   // sans talent renseigné : la Méga garde celui de sa forme de base
  if (ab && !abilities[ab]) { const A = json(`/api/v2/ability/${ab}/index.json`); abilities[ab] = [fr(A?.names) || ab, (A?.flavor_text_entries || []).filter((f) => f.language.name === 'fr').pop()?.flavor_text?.replace(/\s+/g, ' ') || '']; }
  const suf = (name.match(/-mega-([xyz])$/) || [])[1];
  const sprites = { f: `pokemon/${pid}.png`, b: `pokemon/back/${pid}.png`, fs: `pokemon/shiny/${pid}.png`, bs: `pokemon/back/shiny/${pid}.png`, i: `pokemon/versions/generation-vii/icons/${pid}.png` };
  const got = Object.fromEntries(Object.entries(sprites).map(([k, rel]) => [k, save('odyssee/img/pokeapi/' + rel, SPR + rel)]));
  if (!got.f || !got.b) { missing.push(name + ' (sprite de face ou de dos)'); continue; }
  const stoneIcon = save(`odyssee/img/pokeapi/items/${stone}.png`, `${SPR}items/${stone}.png`);
  forms[pid] = {
    base, key: name, n: `Méga-${SPECIES[base].n}${suf ? ' ' + suf.toUpperCase() : ''}`,
    t: P.types.map((t) => t.type.name), b: P.stats.map((s) => s.base_stat), ab,
    stone, stoneName: fr(I?.names) || stone, stoneDesc: (I?.flavor_text_entries || []).filter((f) => f.language.name === 'fr').pop()?.text?.replace(/\s+/g, ' ') || `Une Méga-Gemme. Tenue par ${SPECIES[base].n}, elle lui permet de méga-évoluer.`,
    shiny: got.fs && got.bs, icon: got.i, stoneIcon,
  };
  process.stdout.write('.');
}
console.log();
const head = `// odyssee/js/data/megas.js — généré par tools/odyssee-megas.mjs (données PokeAPI) : ne pas modifier à la main.
// Méga-Évolutions : forme (n° PokeAPI) → espèce de base, nom, types, statistiques de base, talent, Méga-Gemme.\n`;
fs.writeFileSync(path.join(ROOT, 'odyssee/js/data/megas.js'), head
  + `export const MEGA_FORMS = ${JSON.stringify(forms)};\n`
  + `export const MEGA_ABILITIES = ${JSON.stringify(abilities)};\n`);
console.log(`${Object.keys(forms).length} Méga-Évolutions écrites.`);
if (missing.length) console.log('Laissées de côté :', missing.join(' · '));

if (!process.argv.includes('--sans-cris')) {
  let ok = 0, ko = [];
  const ids = Object.keys(SPECIES).map(Number).filter((i) => i < 1000);
  for (const id of ids) (save(`odyssee/snd/cris/${id}.ogg`, `${CRIES}${id}.ogg`) ? ok++ : ko.push(id));
  for (const pid of Object.keys(forms)) save(`odyssee/snd/cris/${pid}.ogg`, `${CRIES}${pid}.ogg`);
  console.log(`Cris : ${ok}/${ids.length}${ko.length ? ' (absents : ' + ko.join(', ') + ')' : ''}`);
}
