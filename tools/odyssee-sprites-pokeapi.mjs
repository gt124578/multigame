// tools/odyssee-sprites-pokeapi.mjs — copie dans le dépôt les sprites des Pokémon utilisés par Odyssée
// (face, dos, chromatiques : HeartGold / SoulSilver jusqu'au n° 493, Noir / Blanc au-delà ; icônes de la 7e génération ;
// icônes des objets absents de odyssee/img/items/), depuis le dépôt PokeAPI/sprites.
// Le jeu les lit dans odyssee/img/pokeapi/ (même arborescence que PokeAPI) : il ne dépend plus d'Internet pour eux.
//   node tools/odyssee-sprites-pokeapi.mjs          → télécharge les fichiers manquants
//   node tools/odyssee-sprites-pokeapi.mjs --tout   → retélécharge tout
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'odyssee/img/pokeapi');
const SRC = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { SPECIES } = await import('../odyssee/js/data/species.js');
const { ITEMS } = await import('../odyssee/js/core/items.js');
const { SPRITES } = await import('../odyssee/js/data/sprites.js');

const HG = 'pokemon/versions/generation-iv/heartgold-soulsilver', BW = 'pokemon/versions/generation-v/black-white';
const files = new Set();
for (const id of Object.keys(SPECIES).map(Number).filter((i) => i < 1000)) {
  const g = id <= 493 ? HG : BW;
  for (const p of ['', '/shiny', '/back', '/back/shiny']) files.add(`${g}${p}/${id}.png`);
  files.add(`pokemon/versions/generation-vii/icons/${id}.png`);
}
const local = new Set(SPRITES.items);
for (const [k, d] of Object.entries(ITEMS)) { const ic = d.icon || k; if (!local.has(ic)) files.add(`items/${ic}.png`); }

const tout = process.argv.includes('--tout');
const todo = [...files].filter((f) => tout || !fs.existsSync(path.join(OUT, f)));
let ok = 0, absents = [];
for (let i = 0; i < todo.length; i += 16) {
  await Promise.all(todo.slice(i, i + 16).map(async (f) => {
    const r = await fetch(SRC + f).catch(() => null);
    if (!r || !r.ok) { absents.push(f); return; }
    fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
    fs.writeFileSync(path.join(OUT, f), Buffer.from(await r.arrayBuffer())); ok++;
  }));
}
console.log(`${files.size} fichiers attendus · ${ok} téléchargés · ${absents.length} absents de PokeAPI`);
if (absents.length) console.log('  absents :', absents.join(', '));
