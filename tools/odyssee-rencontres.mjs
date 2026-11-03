// tools/odyssee-rencontres.mjs
// Génère odyssee/js/data/rencontres.js à partir des tables CSV de PokeAPI :
//  * RENCONTRES : pour chaque zone d'Odyssée, tous les Pokémon qu'on croise dans les lieux équivalents des jeux officiels,
//    de Rouge / Bleu à X / Y (Rubis Oméga / Saphir Alpha compris). Une zone d'Odyssée = une liste de lieux officiels
//    au même moment de l'aventure (premières routes, première forêt, première grotte…), un par région quand il existe.
//    Les niveaux restent ceux de la zone d'Odyssée ; un Pokémon trop évolué pour ces niveaux est remplacé par sa forme
//    d'avant (un Roucarnage des routes de fin de jeu devient un Roucool sur la route 1). Pas de légendaires.
//  * EFFORT : les points d'effort (EV) que donne chaque Pokémon vaincu, comme dans les jeux.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi /tmp/pokeapi
//   (cd /tmp/pokeapi && git sparse-checkout set data/v2/csv)
//   node tools/odyssee-rencontres.mjs /tmp/pokeapi/data/v2/csv
import fs from 'node:fs';
import path from 'node:path';
import { SPECIES } from '../odyssee/js/data/species.js';

const CSV = process.argv[2];
if (!CSV) { console.error('usage : node tools/odyssee-rencontres.mjs <dossier csv de PokeAPI>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'odyssee', 'js', 'data', 'rencontres.js');

function parseCSV(file) {
  const txt = fs.readFileSync(path.join(CSV, file + '.csv'), 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean), head = lines.shift().split(',');
  return lines.map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}

// jeux pris en compte : de Rouge à X / Y
const GAMES = new Set(['red', 'blue', 'yellow', 'gold', 'silver', 'crystal', 'ruby', 'sapphire', 'emerald', 'firered', 'leafgreen',
  'diamond', 'pearl', 'platinum', 'heartgold', 'soulsilver', 'black', 'white', 'black-2', 'white-2', 'x', 'y', 'omega-ruby', 'alpha-sapphire']);
const LAND = new Set(['walk', 'dark-grass', 'grass-spots', 'cave-spots', 'bridge-spots', 'yellow-flowers', 'purple-flowers', 'red-flowers', 'rough-terrain', 'headbutt', 'headbutt-low', 'headbutt-normal', 'headbutt-high', 'rock-smash']);
const WATER = new Set(['surf', 'surf-spots', 'good-rod', 'super-rod', 'super-rod-spots', 'old-rod']);

/* zone d'Odyssée → lieux officiels équivalents (identifiants PokeAPI) et type de rencontre */
const ZONES = {
  // continent, dans l'ordre de l'aventure
  r1: { land: ['kanto-route-1', 'johto-route-29', 'hoenn-route-101', 'sinnoh-route-201', 'unova-route-1', 'kalos-route-2'] },
  r2: { land: ['kanto-route-2', 'kanto-route-22', 'johto-route-30', 'johto-route-31', 'hoenn-route-102', 'hoenn-route-103', 'sinnoh-route-202', 'sinnoh-route-203', 'unova-route-2', 'unova-route-3', 'kalos-route-3'] },
  bois: { land: ['viridian-forest', 'ilex-forest', 'petalburg-woods', 'eterna-forest', 'pinwheel-forest', 'santalune-forest'] },
  r3: { land: ['kanto-route-3', 'kanto-route-4', 'johto-route-32', 'johto-route-33', 'hoenn-route-104', 'hoenn-route-116', 'sinnoh-route-204', 'sinnoh-route-205', 'unova-route-4', 'kalos-route-4', 'kalos-route-5'] },
  grotte: { land: ['mt-moon', 'union-cave', 'granite-cave', 'rusturf-tunnel', 'oreburgh-gate', 'ravaged-path', 'wellspring-cave', 'connecting-cave', 'glittering-cave'] },
  r4: { land: ['kanto-route-24', 'kanto-route-25', 'kanto-route-6', 'johto-route-34', 'johto-route-35', 'hoenn-route-110', 'hoenn-route-117', 'sinnoh-route-206', 'sinnoh-route-207', 'sinnoh-route-208', 'unova-route-5', 'kalos-route-6', 'kalos-route-7'] },
  r5: { land: ['kanto-route-11', 'kanto-route-9', 'johto-route-36', 'johto-route-37', 'johto-route-38', 'johto-route-39', 'hoenn-route-111', 'hoenn-route-112', 'hoenn-route-113', 'sinnoh-route-209', 'sinnoh-route-210', 'unova-route-6', 'unova-route-7', 'kalos-route-9', 'kalos-route-10', 'kalos-route-11'] },
  r6: { land: ['kanto-route-14', 'kanto-route-15', 'johto-route-42', 'johto-route-43', 'hoenn-route-119', 'hoenn-route-120', 'sinnoh-route-212', 'sinnoh-route-213', 'sinnoh-route-214', 'unova-route-12', 'unova-route-14', 'kalos-route-12', 'kalos-route-14'] },
  r7: { land: ['kanto-route-21', 'kanto-route-13', 'johto-route-44', 'johto-route-45', 'johto-route-46', 'hoenn-route-121', 'hoenn-route-123', 'sinnoh-route-215', 'sinnoh-route-221', 'unova-route-13', 'unova-route-15', 'kalos-route-15', 'kalos-route-16'] },
  r9: { land: ['kanto-route-23', 'kanto-route-26', 'kanto-route-27', 'hoenn-route-118', 'sinnoh-route-222', 'unova-route-10', 'kalos-route-21'] },
  r10: { land: ['kanto-route-16', 'kanto-route-17', 'kanto-route-18', 'johto-route-47', 'johto-route-48', 'hoenn-route-114', 'sinnoh-route-225', 'sinnoh-route-227', 'unova-route-11', 'unova-route-9', 'kalos-route-19', 'kalos-route-20'] },
  victoire: { land: ['kanto-victory-road-1', 'kanto-victory-road-2', 'mt-silver', 'hoenn-victory-road', 'sinnoh-victory-road', 'unova-victory-road', 'unova-victory-road-2', 'kalos-victory-road'] },
  // mer
  mer: { water: ['kanto-sea-route-19', 'kanto-sea-route-20', 'kanto-sea-route-21', 'johto-sea-route-40', 'johto-sea-route-41', 'hoenn-route-105', 'hoenn-route-106', 'hoenn-route-107', 'hoenn-route-108', 'hoenn-route-109', 'sinnoh-sea-route-220', 'sinnoh-sea-route-223', 'undella-bay', 'kalos-route-8'] },
  est: { water: ['hoenn-route-124', 'hoenn-route-126', 'hoenn-route-127', 'hoenn-route-128', 'hoenn-route-129', 'hoenn-route-131', 'hoenn-route-134', 'sinnoh-sea-route-226', 'sinnoh-sea-route-230', 'unova-route-17', 'unova-route-21', 'azure-bay'] },
  // archipel des trois frères
  granit: { land: ['rock-tunnel', 'mt-mortar', 'iron-island', 'chargestone-cave', 'terminus-cave', 'kalos-route-18'] },
  cendre: { land: ['mt-ember', 'kindle-road', 'burned-tower', 'fiery-path', 'hoenn-route-113', 'stark-mountain', 'reversal-mountain'] },
  ecaille: { land: ['dragons-den', 'meteor-falls', 'wayward-cave', 'dragonspiral-tower', 'kalos-route-14', 'kanto-safari-zone', 'johto-route-45'] },
  // îles du bateau
  orage: { land: ['kanto-power-plant', 'kanto-route-10', 'new-mauville', 'valley-windworks', 'sinnoh-route-222', 'unova-route-6', 'kalos-route-13'] },
  grue: { land: ['bell-tower', 'burned-tower', 'sprout-tower', 'mt-pyre', 'lost-tower', 'solaceon-ruins', 'celestial-tower', 'pokemon-tower', 'kalos-route-16'] },
  brasier: { land: ['mt-ember', 'kindle-road', 'fiery-path', 'jagged-pass', 'stark-mountain', 'reversal-mountain'] },
  givre: { land: ['ice-path', 'seafoam-islands', 'shoal-cave', 'sinnoh-route-216', 'sinnoh-route-217', 'acuity-lakefront', 'twist-mountain', 'kalos-route-17', 'frost-cavern'] },
  tourbillons: { land: ['whirl-islands', 'seafoam-islands', 'seafloor-cavern', 'cave-of-origin', 'seaside-cave', 'sea-spirits-den'] },
  // nouveaux lieux de l'histoire secondaire (world/quetes.js)
  lac: { land: ['lake-of-rage', 'valor-lakefront', 'lake-verity', 'unova-route-14', 'kalos-route-14'] },
  lacEau: { water: ['lake-of-rage', 'lake-valor', 'lake-acuity', 'lake-verity', 'unova-route-14', 'kalos-route-14'] },
  marees: { land: ['seafloor-cavern', 'seaside-cave', 'whirl-islands', 'shoal-cave', 'sea-spirits-den', 'cave-of-origin'] },
  mareesEau: { water: ['seafloor-cavern', 'seaside-cave', 'whirl-islands', 'shoal-cave', 'sea-spirits-den', 'cave-of-origin'] },
  jardin: { land: ['floaroma-meadow', 'trophy-garden', 'dreamyard', 'kalos-route-7', 'johto-route-36', 'kalos-berry-fields'] },
  torii: { land: ['lostlorn-forest', 'old-chateau', 'mt-pyre', 'kalos-route-16', 'national-park', 'ilex-forest'] },
  magma: { land: ['stark-mountain', 'mt-ember', 'reversal-mountain', 'fiery-path', 'hoenn-route-113', 'jagged-pass'] },
  caverne: { land: ['stark-mountain', 'mt-ember', 'magma-hideout', 'reversal-mountain', 'fiery-path'] },
};

const versions = Object.fromEntries(parseCSV('versions').map((v) => [v.id, v.identifier]));
const locs = Object.fromEntries(parseCSV('locations').map((l) => [l.id, l.identifier]));
const areaLoc = Object.fromEntries(parseCSV('location_areas').map((a) => [a.id, locs[a.location_id]]));
const methods = Object.fromEntries(parseCSV('encounter_methods').map((m) => [m.id, m.identifier]));
const slots = Object.fromEntries(parseCSV('encounter_slots').map((s) => [s.id, { method: methods[s.encounter_method_id], rarity: +s.rarity || 1 }]));
const pokeSpecies = Object.fromEntries(parseCSV('pokemon').map((p) => [p.id, +p.species_id]));
const legend = new Set(parseCSV('pokemon_species').filter((s) => s.is_legendary === '1' || s.is_mythical === '1').map((s) => +s.id));

// forme d'avant chaque espèce (d'après les évolutions du jeu)
const prevo = {};
for (const [id, S] of Object.entries(SPECIES)) for (const e of S.ev || []) if (!prevo[e.to]) prevo[e.to] = { from: +id, lvl: e.lvl || null };
/** forme jouable à ce niveau : on redescend la lignée tant que l'évolution demande un niveau plus haut */
function fit(sp, lvl) {
  for (let k = 0; k < 3; k++) {
    const p = prevo[sp]; if (!p || p.from > 1000) break;
    if (p.lvl ? lvl + 2 < p.lvl : lvl < 30) sp = p.from; else break;
  }
  return sp;
}

// poids de chaque espèce dans chaque lieu : la part des emplacements de rencontre qu'elle occupe, jeu par jeu
const perLoc = {}; // lieu|eau → { version|zone → { sp: rareté } }
for (const e of parseCSV('encounters')) {
  const v = versions[e.version_id]; if (!GAMES.has(v)) continue;
  const loc = areaLoc[e.location_area_id], s = slots[e.encounter_slot_id]; if (!loc || !s) continue;
  const kind = LAND.has(s.method) ? 'land' : WATER.has(s.method) ? 'water' : null; if (!kind) continue;
  const sp = pokeSpecies[e.pokemon_id]; if (!sp || sp > 721 || legend.has(sp)) continue;
  const key = loc + '|' + kind, sub = v + '|' + e.location_area_id;
  ((perLoc[key] ||= {})[sub] ||= {})[sp] = (perLoc[key][sub][sp] || 0) + s.rarity;
}

const out = {}, report = [];
for (const [zone, def] of Object.entries(ZONES)) {
  const kind = def.land ? 'land' : 'water', list = def.land || def.water;
  const w = {}; let found = 0;
  for (const loc of list) {
    const tables = perLoc[loc + '|' + kind]; if (!tables) { report.push(`  ${zone} : aucun Pokémon pour ${loc} (${kind})`); continue; }
    found++;
    const subs = Object.values(tables);
    for (const t of subs) {
      const tot = Object.values(t).reduce((a, x) => a + x, 0);
      for (const [sp, r] of Object.entries(t)) w[sp] = (w[sp] || 0) + (r / tot) / subs.length;
    }
  }
  out[zone] = Object.entries(w).map(([sp, x]) => [+sp, x / Math.max(1, found)]);
  report.push(`${zone} : ${out[zone].length} espèces (${found}/${list.length} lieux)`);
}

// points d'effort : stat → nombre de points (dans l'ordre PV, Atq, Déf, Atq Spé, Déf Spé, Vit)
const effort = {};
for (const s of parseCSV('pokemon_stats')) {
  const sp = +s.pokemon_id; if (sp > 721 || !+s.effort) continue;
  (effort[sp] ||= [0, 0, 0, 0, 0, 0])[+s.stat_id - 1] = +s.effort;
}
const effortTxt = JSON.stringify(Object.fromEntries(Object.entries(effort).map(([k, v]) => [k, v.join('')])));

// on garde le poids brut (part des rencontres, de 0 à 1) ; les niveaux et la forme sont ajustés au chargement selon la zone
const lines = Object.entries(out).map(([z, l]) => `  ${z}: ${JSON.stringify(l.sort((a, b) => b[1] - a[1]).map(([sp, x]) => [sp, Math.max(1, Math.round(x * 1000))]))},`);
fs.writeFileSync(OUT, `// Généré par tools/odyssee-rencontres.mjs à partir des données de PokeAPI — ne pas modifier à la main.
// RENCONTRES : zone d'Odyssée → [espèce, poids pour mille] des lieux équivalents des jeux, de Rouge à X / Y.
// EFFORT : points d'effort donnés par chaque Pokémon vaincu (PV, Atq, Déf, Atq Spé, Déf Spé, Vit), un chiffre par stat.
export const RENCONTRES = {
${lines.join('\n')}
};
export const EFFORT = ${effortTxt};
/** forme d'avant (pour les Pokémon trop évolués à bas niveau) : espèce → [forme d'avant, niveau d'évolution] */
export const LEGENDAIRES = ${JSON.stringify([...legend].filter((x) => x <= 721).sort((a, b) => a - b))};
export const AVANT = ${JSON.stringify(Object.fromEntries(Object.entries(prevo).filter(([to, p]) => +to <= 721 && p.from <= 721).map(([to, p]) => [to, [p.from, p.lvl || 0]])))};
`);
console.log(report.join('\n'));
console.log('→', path.relative(process.cwd(), OUT));
void fit;
