// Talents des Pokémon d'Odyssée tirés des tables de PokeAPI (data/v2/csv : pokemon_abilities, abilities, ability_names,
// ability_flavor_text) : odyssee/js/data/talents.js. Usage : node tools/odyssee-talents.mjs <dossier csv de PokeAPI>
import fs from 'node:fs';
import { SPECIES } from '../odyssee/js/data/species.js';
const dir = process.argv[2] || 'pokeapi/data/v2/csv';
const csv = (f) => { const [h, ...rows] = fs.readFileSync(`${dir}/${f}.csv`, 'utf8').replace(/\r/g, '').trim().split('\n'); const ks = h.split(',');
  return rows.map((r) => { const out = []; let cur = '', q = false; for (const c of r) { if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return Object.fromEntries(ks.map((k, i) => [k, out[i]])); }); };
const slug = Object.fromEntries(csv('abilities').map((a) => [a.id, a.identifier]));
const name = {}; for (const a of csv('ability_names')) if (a.local_language_id === '5') name[a.ability_id] = a.name;
const desc = {}, dv = {}; for (const a of csv('ability_flavor_text')) if (a.language_id === '5' && +a.version_group_id >= (dv[a.ability_id] || 0)) { dv[a.ability_id] = +a.version_group_id; desc[a.ability_id] = a.flavor_text.replace(/\\-\s*/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(); }
const per = {}; for (const r of csv('pokemon_abilities')) { const p = +r.pokemon_id; if (!SPECIES[p]) continue; (per[p] ||= [null, null, null])[r.is_hidden === '1' ? 2 : +r.slot - 1] = slug[r.ability_id]; }
const used = new Set(Object.values(per).flat().filter(Boolean));
const T = {}; for (const [id, s] of Object.entries(slug)) if (used.has(s)) T[s] = [name[id] || s, desc[id] || ''];
let out = '// Généré par tools/odyssee-talents.mjs (tables de PokeAPI) — ne pas modifier à la main.\n';
out += `/** talent : [nom, description] */\nexport const TALENTS = ${JSON.stringify(T)};\n`;
out += `/** espèce : [talent 1, talent 2, talent caché] */\nexport const TALENTS_ESPECES = ${JSON.stringify(per)};\n`;
fs.writeFileSync('odyssee/js/data/talents.js', out);
console.log(Object.keys(per).length, 'espèces,', Object.keys(T).length, 'talents');
