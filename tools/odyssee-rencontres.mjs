// tools/odyssee-rencontres.mjs
// Génère odyssee/js/data/rencontres.js à partir des tables CSV de PokeAPI et des tiers de Pokémon Showdown :
//  * RENCONTRES : pour chaque zone d'Odyssée, les Pokémon qu'on croise dans les jeux officiels (Rouge / Bleu à X / Y,
//    Rubis Oméga / Saphir Alpha compris) AU MÊME MOMENT DE L'AVENTURE, c'est-à-dire entre les mêmes badges :
//      - chaque lieu officiel est rangé dans son « tronçon » : 0 = avant le 1er badge, k = entre le k-ième et le (k+1)-ième,
//        8 = Route Victoire, 9 = après la Ligue (tables SEGMENTS, jeu par jeu) ;
//      - chaque zone d'Odyssée a aussi son tronçon (badges qu'il faut pour y aller) et son milieu (route, forêt, grotte,
//        mer) et parfois un thème (volcan, glace, tour, centrale, grotte marine, désert…) : elle reçoit les Pokémon des lieux
//        officiels du même tronçon et du même milieu, et ceux des lieux du même thème autour de ce tronçon ;
//      - les Terres du Sud (badges 9 à 15, niveaux 50 à 74) reçoivent les Pokémon d'après la Ligue des jeux officiels,
//        rangés par puissance : les plus faibles sur la route 13, les plus forts sur la route 20 ;
//      - la puissance vient des tiers de Pokémon Showdown (6e génération) : un Pokémon puissant (ou d'une lignée puissante,
//        comme Embrylex) est plus rare ; un Pokémon trop peu évolué pour le niveau de la zone y évolue (Rattata → Rattatac).
//    Chaque jeu officiel compte autant que les autres. Pas de légendaires.
//  * EFFORT : les points d'effort (EV) que donne chaque Pokémon vaincu, comme dans les jeux.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi /tmp/pokeapi
//   (cd /tmp/pokeapi && git sparse-checkout set data/v2/csv)
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/smogon/pokemon-showdown /tmp/showdown
//   (cd /tmp/showdown && git sparse-checkout set --no-cone /data/pokedex.ts /data/mods/gen6/formats-data.ts)
//   node tools/odyssee-rencontres.mjs /tmp/pokeapi/data/v2/csv /tmp/showdown/data [rapport.json]
import fs from 'node:fs';
import path from 'node:path';
import { SPECIES } from '../odyssee/js/data/species.js';

const CSV = process.argv[2], SD = process.argv[3], RAPPORT = process.argv[4];
if (!CSV || !SD) { console.error('usage : node tools/odyssee-rencontres.mjs <csv PokeAPI> <data Showdown> [rapport.json]'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'odyssee', 'js', 'data', 'rencontres.js');

function parseCSV(file) {
  const txt = fs.readFileSync(path.join(CSV, file + '.csv'), 'utf8').replace(/\r/g, '');
  const lines = txt.split('\n').filter(Boolean), head = lines.shift().split(',');
  return lines.map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}

/* ---------------- jeux officiels et tronçons entre les badges ---------------- */
const GROUPES = {
  kanto: ['red', 'blue', 'yellow', 'firered', 'leafgreen'],
  johto: ['gold', 'silver', 'crystal', 'heartgold', 'soulsilver'],
  hoenn: ['ruby', 'sapphire', 'emerald', 'omega-ruby', 'alpha-sapphire'],
  sinnoh: ['diamond', 'pearl', 'platinum'],
  unys: ['black', 'white'],
  unys2: ['black-2', 'white-2'],
  kalos: ['x', 'y'],
};
// lieu → tronçon (0 = avant le 1er badge … 7 = entre le 7e et le 8e, 8 = Route Victoire) ; un lieu absent = après la Ligue (9)
const SEGMENTS = {
  kanto: [
    ['pallet-town', 'viridian-city', 'kanto-route-1', 'kanto-route-2', 'kanto-route-22', 'viridian-forest', 'pewter-city'],
    ['kanto-route-3', 'mt-moon', 'kanto-route-4', 'cerulean-city', 'kanto-route-24', 'kanto-route-25'],
    ['kanto-route-5', 'kanto-route-6', 'vermilion-city', 'ss-anne', 'kanto-route-11', 'digletts-cave', 'kanto-underground-path'],
    ['kanto-route-9', 'kanto-route-10', 'rock-tunnel', 'kanto-route-8', 'kanto-route-7', 'celadon-city'],
    ['pokemon-tower', 'kanto-route-12', 'kanto-route-13', 'kanto-route-14', 'kanto-route-15', 'kanto-route-16', 'kanto-route-17', 'kanto-route-18', 'fuchsia-city', 'kanto-safari-zone'],
    ['kanto-power-plant', 'kanto-sea-route-19', 'kanto-sea-route-20', 'seafoam-islands', 'saffron-city'],
    ['cinnabar-island', 'pokemon-mansion'],
    ['kanto-sea-route-21', 'one-island', 'kindle-road', 'mt-ember', 'treasure-beach', 'cape-brink', 'three-isle-port', 'bond-bridge', 'berry-forest'],
    ['kanto-route-23', 'kanto-victory-road-2'],
  ],
  johto: [
    ['new-bark-town', 'johto-route-29', 'cherrygrove-city', 'johto-route-30', 'johto-route-31', 'dark-cave', 'sprout-tower', 'violet-city', 'johto-route-46'],
    ['johto-route-32', 'ruins-of-alph', 'union-cave', 'johto-route-33', 'slowpoke-well', 'azalea-town'],
    ['ilex-forest', 'johto-route-34', 'goldenrod-city', 'johto-route-35', 'national-park'],
    ['johto-route-36', 'johto-route-37', 'ecruteak-city', 'burned-tower', 'johto-route-38', 'johto-route-39', 'olivine-city'],
    ['johto-sea-route-40', 'johto-sea-route-41', 'cianwood-city', 'whirl-islands'],
    ['johto-route-42', 'mt-mortar', 'johto-route-47', 'johto-route-48', 'johto-safari-zone', 'safari-zone-gate', 'embedded-tower'],
    ['johto-route-43', 'lake-of-rage', 'team-rocket-hq'],
    ['johto-route-44', 'ice-path', 'blackthorn-city', 'bell-tower'],
    ['dragons-den', 'johto-route-45', 'kanto-route-26', 'kanto-route-27', 'tohjo-falls', 'kanto-victory-road-1'],
  ],
  hoenn: [
    ['littleroot-town', 'hoenn-route-101', 'hoenn-route-102', 'hoenn-route-103', 'petalburg-city', 'hoenn-route-104', 'petalburg-woods', 'rustboro-city', 'hoenn-route-116'],
    ['rusturf-tunnel', 'dewford-town', 'granite-cave', 'hoenn-route-106'],
    ['hoenn-route-109', 'slateport-city', 'hoenn-route-110', 'hoenn-route-117'],
    ['hoenn-route-111', 'hoenn-route-112', 'fiery-path', 'hoenn-route-113', 'fallarbor-town', 'hoenn-route-114', 'meteor-falls', 'hoenn-route-115', 'jagged-pass', 'lavaridge-town', 'verdanturf-town'],
    ['mirage-tower'],
    ['hoenn-route-118', 'hoenn-route-119', 'hoenn-route-105', 'hoenn-route-107', 'hoenn-route-108', 'abandoned-ship', 'new-mauville', 'fortree-city'],
    ['hoenn-route-120', 'scorched-slab', 'hoenn-route-121', 'hoenn-safari-zone', 'lilycove-city', 'mt-pyre', 'hoenn-route-122', 'hoenn-route-123', 'team-magma-hideout', 'team-aqua-hideout', 'magma-hideout', 'hoenn-route-124', 'mossdeep-city', 'hoenn-route-125', 'shoal-cave'],
    ['hoenn-route-126', 'hoenn-route-127', 'hoenn-route-128', 'seafloor-cavern', 'sootopolis-city', 'cave-of-origin', 'hoenn-route-129', 'hoenn-route-130', 'hoenn-route-131', 'pacifidlog-town', 'sky-pillar', 'hoenn-route-132', 'hoenn-route-133', 'hoenn-route-134'],
    ['ever-grande-city', 'hoenn-victory-road'],
  ],
  sinnoh: [
    ['twinleaf-town', 'sinnoh-route-201', 'lake-verity', 'sinnoh-route-202', 'sinnoh-route-203', 'oreburgh-gate', 'oreburgh-city', 'oreburgh-mine', 'sinnoh-route-204'],
    ['ravaged-path', 'floaroma-meadow', 'valley-windworks', 'sinnoh-route-205', 'eterna-forest', 'old-chateau', 'eterna-city'],
    ['sinnoh-route-211', 'sinnoh-route-206', 'wayward-cave', 'sinnoh-route-207', 'mt-coronet', 'sinnoh-route-208', 'hearthome-city', 'sinnoh-route-209', 'lost-tower', 'solaceon-ruins', 'sinnoh-route-210', 'sinnoh-route-215', 'veilstone-city'],
    ['sinnoh-route-214', 'valor-lakefront', 'ruin-maniac-cave', 'maniac-tunnel', 'sinnoh-route-213', 'pastoria-city', 'great-marsh', 'sinnoh-route-212'],
    ['celestic-town', 'trophy-garden'],
    ['sinnoh-route-218', 'canalave-city', 'iron-island', 'sinnoh-route-219', 'sinnoh-sea-route-220', 'sinnoh-route-221', 'lake-valor', 'fuego-ironworks'],
    ['sinnoh-route-216', 'sinnoh-route-217', 'acuity-lakefront', 'snowpoint-city', 'lake-acuity'],
    ['spear-pillar', 'sinnoh-route-222', 'sunyshore-city'],
    ['sinnoh-sea-route-223', 'sinnoh-victory-road', 'sinnoh-pokemon-league'],
  ],
  unys: [
    ['nuvema-town', 'unova-route-1', 'unova-route-2', 'striaton-city', 'dreamyard'],
    ['unova-route-3', 'wellspring-cave', 'nacrene-city'],
    ['pinwheel-forest', 'castelia-city'],
    ['unova-route-4', 'desert-resort', 'relic-castle'],
    ['unova-route-5', 'driftveil-drawbridge', 'driftveil-city', 'cold-storage', 'unova-route-16', 'lostlorn-forest'],
    ['unova-route-6', 'chargestone-cave'],
    ['unova-route-7', 'celestial-tower', 'twist-mountain', 'icirrus-city', 'mistralton-cave'],
    ['dragonspiral-tower', 'unova-route-8', 'moor-of-icirrus', 'unova-route-9'],
    ['unova-route-10', 'unova-victory-road', 'ns-castle'],
  ],
  unys2: [
    ['aspertia-city', 'unova-route-19', 'floccesy-town', 'unova-route-20', 'floccesy-ranch'],
    ['virbank-city', 'virbank-complex'],
    ['castelia-city', 'castelia-sewers'],
    ['unova-route-4', 'desert-resort', 'relic-castle', 'unova-route-16', 'lostlorn-forest'],
    ['unova-route-5', 'driftveil-drawbridge', 'driftveil-city', 'relic-passage'],
    ['unova-route-6', 'chargestone-cave'],
    ['unova-route-7', 'celestial-tower', 'reversal-mountain', 'strange-house', 'undella-town', 'undella-bay', 'unova-route-13', 'unova-route-12', 'village-bridge', 'unova-route-11', 'twist-mountain'],
    ['unova-route-9', 'humilau-city', 'unova-route-21', 'unova-route-22', 'seaside-cave'],
    ['unova-route-23', 'unova-victory-road', 'unova-victory-road-2', 'giant-chasm'],
  ],
  kalos: [
    ['aquacorde-town', 'kalos-route-2', 'santalune-forest', 'kalos-route-3', 'kalos-route-22'],
    ['kalos-route-4', 'lumiose-city', 'kalos-route-5', 'kalos-route-6', 'parfum-palace', 'kalos-route-7', 'kalos-berry-fields', 'connecting-cave', 'kalos-route-8', 'ambrette-town', 'kalos-route-9', 'glittering-cave', 'cyllage-city'],
    ['kalos-route-10', 'kalos-route-11', 'reflection-cave', 'shalour-city', 'tower-of-mastery'],
    ['kalos-route-12', 'azure-bay'],
    ['kalos-route-13'],
    ['kalos-route-14', 'laverre-city'],
    ['kalos-route-15', 'kalos-route-16', 'lost-hotel', 'frost-cavern', 'kalos-route-17'],
    ['kalos-route-18', 'terminus-cave', 'couriway-town', 'kalos-route-19', 'kalos-route-20', 'pokemon-village', 'kalos-route-21'],
    ['kalos-victory-road'],
  ],
};
const IGNORER = /^roaming-|pokemart|pokecenter|unknown-all|hall-of-origin|distortion-world|team-flare|friend-safari|battle-frontier|trainer-tower/;

// milieu d'un lieu (la mer, elle, vient du mode de rencontre : surf, canne)
const GROTTE = /cave|tunnel|^mt-|mountain|cavern|mine$|chamber|ruins|well$|den$|underpass|chasm|sewers|complex|tomb|pillar|fiery-path|ravaged-path|gate$|islands?$|tower|victory-road|hideout|ship$|power-plant|mansion|ss-anne|ironworks|windworks|storage|castle|chateau|hotel|labyrinth|room$|relic|strange-house|canyon/;
const FORET = /forest|woods/;
const milieu = (loc) => (FORET.test(loc) ? 'forest' : GROTTE.test(loc) ? 'cave' : 'route');
// thèmes : lieux officiels dont l'ambiance correspond à une zone d'Odyssée
const THEMES = {
  electric: ['kanto-power-plant', 'new-mauville', 'sea-mauville', 'valley-windworks', 'chargestone-cave', 'kalos-route-13'],
  tower: ['sprout-tower', 'burned-tower', 'bell-tower', 'pokemon-tower', 'mt-pyre', 'lost-tower', 'old-chateau', 'celestial-tower', 'strange-house', 'lost-hotel', 'kalos-route-16'],
  volcano: ['fiery-path', 'jagged-pass', 'mt-ember', 'kindle-road', 'stark-mountain', 'magma-hideout', 'team-magma-hideout', 'reversal-mountain', 'hoenn-route-113', 'scorched-slab'],
  ice: ['ice-path', 'seafoam-islands', 'shoal-cave', 'icefall-cave', 'sinnoh-route-216', 'sinnoh-route-217', 'acuity-lakefront', 'snowpoint-city', 'lake-acuity', 'twist-mountain', 'frost-cavern', 'kalos-route-17', 'glacier-room', 'snowpoint-temple'],
  seacave: ['whirl-islands', 'seafloor-cavern', 'cave-of-origin', 'seaside-cave', 'sea-spirits-den', 'shoal-cave', 'marine-cave', 'seafoam-islands', 'abandoned-ship'],
  rock: ['rock-tunnel', 'mt-mortar', 'granite-cave', 'iron-island', 'terminus-cave', 'glittering-cave', 'clay-tunnel', 'mt-coronet', 'oreburgh-mine', 'meteor-falls', 'rusturf-tunnel', 'wayward-cave', 'kalos-route-18', 'cerulean-cave'],
  flower: ['floaroma-meadow', 'flower-paradise', 'kalos-berry-fields', 'trophy-garden', 'kalos-route-7', 'national-park', 'five-isle-meadow', 'berry-forest', 'pattern-bush', 'kalos-route-4', 'hoenn-route-119', 'unova-route-14'],
  lake: ['lake-of-rage', 'lake-verity', 'lake-valor', 'lake-acuity', 'valor-lakefront', 'acuity-lakefront', 'sendoff-spring', 'kalos-route-14', 'johto-route-43', 'unova-route-14'],
  desert: ['hoenn-route-111', 'desert-resort', 'desert-underpass', 'desert-ruins', 'mirage-tower', 'unova-route-4', 'kalos-route-13', 'relic-castle'],
  marsh: ['great-marsh', 'moor-of-icirrus', 'kalos-route-14', 'johto-route-48', 'hoenn-route-120', 'sinnoh-route-212', 'kalos-route-19'],
  canyon: ['sevault-canyon', 'canyon-entrance', 'ruin-valley', 'mt-coronet', 'sinnoh-route-211', 'kalos-route-18', 'reversal-mountain', 'unova-route-23', 'hoenn-route-112', 'mt-silver', 'rocky-mountain-room', 'kalos-route-10', 'unova-route-9'],
  forest: ['viridian-forest', 'ilex-forest', 'petalburg-woods', 'eterna-forest', 'pinwheel-forest', 'santalune-forest', 'lostlorn-forest', 'berry-forest', 'kalos-route-20', 'trackless-forest', 'unova-route-15'],
};

/* ---------------- zones d'Odyssée : tronçon, milieu(x), thème, niveaux ---------------- */
// tronçon = badges qu'il faut pour y aller (gardes, bateau, CS) ; 8 à 15 : Terres du Sud et Route Victoire (15 badges)
const ZONES = {
  r1: { seg: 0, hab: { route: 1 }, lvl: [2, 4] },
  r2: { seg: 1, hab: { route: 1 }, lvl: [4, 7] },
  bois: { seg: 1, hab: { forest: 1 }, lvl: [6, 9] },
  r3: { seg: 1, hab: { route: 1 }, lvl: [8, 11] },
  grotte: { seg: 1, hab: { cave: 1 }, lvl: [9, 14] },
  lac: { seg: 2, hab: { route: 1 }, theme: 'lake', lvl: [14, 18] },
  r4: { seg: 2, hab: { route: 1 }, lvl: [13, 17] },
  orage: { seg: 2, hab: { route: 1 }, theme: 'electric', lvl: [20, 26] },
  r5: { seg: 3, hab: { route: 1 }, lvl: [16, 21] },
  grue: { seg: 3, hab: { route: 1 }, theme: 'tower', lvl: [27, 32] },
  brasier: { seg: 3, hab: { route: 1 }, theme: 'volcano', lvl: [28, 33] },
  r6: { seg: 4, hab: { route: 1 }, lvl: [21, 26] },
  jardin: { seg: 4, hab: { route: 1 }, theme: 'flower', lvl: [21, 26] },
  torii: { seg: 4, hab: { forest: 1 }, theme: 'forest', lvl: [34, 39] },
  r7: { seg: 5, hab: { route: 1 }, lvl: [26, 30] },
  r10: { seg: 5, hab: { route: 1 }, lvl: [33, 37] },
  granit: { seg: 5, hab: { cave: 1 }, theme: 'rock', lvl: [34, 39] },
  givre: { seg: 5, hab: { route: 1 }, theme: 'ice', lvl: [37, 42] },
  tourbillons: { seg: 5, hab: { cave: 1 }, theme: 'seacave', lvl: [40, 44] },
  marees: { seg: 5, hab: { cave: 1 }, theme: 'seacave', lvl: [32, 38] },
  mer: { seg: 5, water: true, lvl: [25, 34] },
  est: { seg: 6, water: true, lvl: [30, 38] },
  lacEau: { seg: 5, water: true, theme: 'lake', lvl: [25, 34] },
  mareesEau: { seg: 5, water: true, theme: 'seacave', lvl: [32, 38] },
  cendre: { seg: 6, hab: { cave: 1 }, theme: 'volcano', lvl: [38, 43] },
  ecaille: { seg: 7, hab: { route: 1, forest: 1 }, lvl: [40, 47] },
  // Terres du Sud : les Pokémon d'après la Ligue, du plus faible (route 13) au plus fort (route 20)
  r13: { seg: 8, sud: 0, hab: { route: 1 }, lvl: [50, 55] },
  r14: { seg: 9, sud: 1, hab: { route: 1 }, lvl: [52, 57] },
  r15: { seg: 10, sud: 2, hab: { route: 1, forest: 1 }, theme: 'marsh', lvl: [55, 59] },
  magma: { seg: 10, sud: 2, hab: { route: 1 }, theme: 'volcano', lvl: [52, 58] },
  r16: { seg: 11, sud: 3, hab: { route: 1 }, theme: 'desert', lvl: [58, 62] },
  caverne: { seg: 11, sud: 3, hab: { cave: 1 }, theme: 'volcano', lvl: [58, 64] },
  r17: { seg: 12, sud: 4, hab: { route: 1, cave: 1 }, theme: 'canyon', lvl: [61, 65] },
  r18: { seg: 13, sud: 5, hab: { route: 1 }, theme: 'flower', lvl: [64, 68] },
  r19: { seg: 14, sud: 6, hab: { forest: 1, route: 1 }, theme: 'forest', lvl: [67, 71] },
  r20: { seg: 15, sud: 7, hab: { route: 1 }, lvl: [70, 74] },
  // Route Victoire et Route Céleste, Grotte Victoire : la Route Victoire des jeux officiels (tronçon 8)
  r9: { seg: 15, vr: true, hab: { route: 1 }, lvl: [34, 38] },
  victoire: { seg: 15, vr: true, hab: { cave: 1 }, lvl: [36, 42] },
};

/* ---------------- données ---------------- */
const versions = Object.fromEntries(parseCSV('versions').map((v) => [v.id, v.identifier]));
const groupeDe = {}; for (const [g, vs] of Object.entries(GROUPES)) for (const v of vs) groupeDe[v] = g;
const locs = Object.fromEntries(parseCSV('locations').map((l) => [l.id, l.identifier]));
const areaLoc = Object.fromEntries(parseCSV('location_areas').map((a) => [a.id, locs[a.location_id]]));
const methods = Object.fromEntries(parseCSV('encounter_methods').map((m) => [m.id, m.identifier]));
const slots = Object.fromEntries(parseCSV('encounter_slots').map((s) => [s.id, { method: methods[s.encounter_method_id], rarity: +s.rarity || 1 }]));
const pokeSpecies = Object.fromEntries(parseCSV('pokemon').map((p) => [p.id, +p.species_id]));
const legend = new Set(parseCSV('pokemon_species').filter((s) => s.is_legendary === '1' || s.is_mythical === '1').map((s) => +s.id));
// rencontres dans l'herbe, les grottes, le sable (Éclate-Roc et Coup d'Boule, qui ne donnent que deux ou trois espèces, sont laissés de côté)
const LAND = new Set(['walk', 'dark-grass', 'grass-spots', 'cave-spots', 'bridge-spots', 'yellow-flowers', 'purple-flowers', 'red-flowers', 'rough-terrain', 'sand-spots', 'tall-grass']);
// Zarbi (ses 28 formes et ses ruines) reste propre aux Ruines
const EXCLUS = new Set([201]);
const WATER = new Set(['surf', 'surf-spots', 'good-rod', 'super-rod', 'super-rod-spots', 'old-rod', 'good-rod-spots', 'old-rod-spots']);

const segDe = {}; // groupe|lieu → tronçon
for (const [g, segs] of Object.entries(SEGMENTS)) segs.forEach((l, k) => { for (const loc of l) segDe[g + '|' + loc] = k; });
const themeDe = {}; for (const [t, l] of Object.entries(THEMES)) for (const loc of l) (themeDe[loc] ||= new Set()).add(t);

// tables officielles : groupe|lieu|eau-ou-terre → { version|aire : { espèce : rareté } }
const tables = {};
const vus = {}; // lieux rencontrés par groupe (pour le rapport)
for (const e of parseCSV('encounters')) {
  const v = versions[e.version_id], g = groupeDe[v]; if (!g) continue;
  const loc = areaLoc[e.location_area_id], s = slots[e.encounter_slot_id]; if (!loc || !s || IGNORER.test(loc)) continue;
  const kind = LAND.has(s.method) ? 'land' : WATER.has(s.method) ? 'water' : null; if (!kind) continue;
  const sp = pokeSpecies[e.pokemon_id]; if (!sp || sp > 721 || legend.has(sp) || EXCLUS.has(sp)) continue;
  (vus[g] ||= new Set()).add(loc);
  const key = g + '|' + loc + '|' + kind, sub = v + '|' + e.location_area_id;
  ((tables[key] ||= {})[sub] ||= {})[sp] = (tables[key][sub][sp] || 0) + s.rarity;
}
const LIEUX = Object.keys(tables).map((k) => { const [g, loc, kind] = k.split('|'); return { key: k, g, loc, kind, seg: segDe[g + '|' + loc] ?? 9, hab: milieu(loc), themes: themeDe[loc] || new Set() }; });

/** part de chaque espèce dans un lieu (moyenne de ses tables, version par version) */
function partsLieu(key) {
  const subs = Object.values(tables[key]), w = {};
  for (const t of subs) { const tot = Object.values(t).reduce((a, x) => a + x, 0); for (const [sp, r] of Object.entries(t)) w[sp] = (w[sp] || 0) + r / tot / subs.length; }
  return w;
}
/** réserve de Pokémon des lieux qui passent le filtre : chaque jeu (groupe) compte autant, chaque lieu autant dans son jeu ;
 *  un jeu qui n'a qu'un ou deux lieux dans le tronçon compte moins (un seul lieu ne doit pas faire la loi) */
function reserve(filtre) {
  const parG = {};
  for (const L of LIEUX) if (filtre(L)) (parG[L.g] ||= []).push(L.key);
  const w = {}, gs = Object.keys(parG), poids = Object.fromEntries(gs.map((g) => [g, Math.min(1, parG[g].length / 3)]));
  const totP = Object.values(poids).reduce((a, b) => a + b, 0) || 1;
  for (const g of gs) for (const key of parG[g]) for (const [sp, x] of Object.entries(partsLieu(key))) w[sp] = (w[sp] || 0) + x / parG[g].length * poids[g] / totP;
  return { w, groupes: gs.length, lieux: Object.values(parG).flat().length };
}
/** aucune espèce ne prend plus de `max` des rencontres d'une zone (le surplus est réparti sur les autres) */
function plafonner(l, max) {
  for (let k = 0; k < 20; k++) {
    const tot = l.reduce((a, e) => a + e[1], 0); let surplus = 0, libres = 0;
    for (const e of l) { if (e[1] / tot > max) { surplus += e[1] - max * tot; e[1] = max * tot; } else libres += e[1]; }
    if (surplus <= 1e-9 || !libres) break;
    for (const e of l) if (e[1] < max * tot) e[1] += surplus * e[1] / libres;
  }
  return l;
}
const melanger = (parts) => { const w = {}; for (const [r, k] of parts) for (const [sp, x] of Object.entries(r.w)) w[sp] = (w[sp] || 0) + x * k; return { w }; };

/* ---------------- puissance (Pokémon Showdown, 6e génération) ---------------- */
const SCORE = { Uber: 8, OU: 7, '(OU)': 7, UUBL: 6.5, UU: 6, RUBL: 5.5, RU: 5, NUBL: 4.5, NU: 4, PUBL: 3.5, PU: 3, ZUBL: 2.5, ZU: 2, NFE: 1.5, LC: 1 };
const tiers = {};
{ const txt = fs.readFileSync(path.join(SD, 'mods', 'gen6', 'formats-data.ts'), 'utf8'); for (const m of txt.matchAll(/\n\t([a-z0-9]+): \{([^}]*)\}/g)) { const t = /tier: "([^"]+)"/.exec(m[2]); if (t) tiers[m[1]] = t[1]; } }
const dex = {}; // n° → { key, bst }
{ const txt = fs.readFileSync(path.join(SD, 'pokedex.ts'), 'utf8');
  for (const m of txt.matchAll(/\n\t([a-z0-9]+): \{([\s\S]*?)\n\t\},/g)) {
    const num = +(/num: (-?\d+)/.exec(m[2])?.[1]); if (!(num > 0 && num <= 721) || /forme: /.test(m[2]) || dex[num]) continue;
    const bs = /baseStats: \{([^}]*)\}/.exec(m[2])[1].match(/\d+/g).map(Number); dex[num] = { key: m[1], bst: bs.reduce((a, b) => a + b, 0) };
  } }
const propre = (sp) => (SCORE[tiers[dex[sp]?.key]] ?? 4) + (dex[sp]?.bst || 400) / 1000;
const finales = (sp, seen = new Set()) => { const ev = SPECIES[sp]?.ev?.filter((e) => e.to <= 721) || []; if (!ev.length || seen.has(sp)) return [sp]; seen.add(sp); return ev.flatMap((e) => finales(e.to, seen)); };
/** puissance : la sienne, ou presque celle de sa lignée (un Embrylex vaut presque un Tyranocif) */
const puissance = (sp) => Math.max(propre(sp), ...finales(+sp).map((f) => propre(f) - 1.5));
/** plus un Pokémon est puissant, plus il est rare */
const rarete = (p) => 1 / (1 + 0.3 * Math.max(0, p - 2.5));

/* ---------------- évolutions selon le niveau de la zone ---------------- */
// un Pokémon trop peu évolué pour la zone y évolue : par niveau si le niveau de la zone dépasse d'au moins 5 celui de
// l'évolution, par pierre, échange ou amitié à partir du niveau 45 (une lignée qui se sépare garde la première branche)
function evoluer(sp, lo) {
  for (let k = 0; k < 3; k++) {
    const ev = (SPECIES[sp]?.ev || []).filter((e) => e.to <= 721 && !legend.has(e.to)); if (!ev.length) break;
    const e = ev[0];
    if (e.lvl ? lo >= e.lvl + 5 : lo >= 45) sp = e.to; else break;
  }
  return sp;
}

/* ---------------- construction des zones ---------------- */
const out = {}, rapport = {};
const terre = (L) => L.kind === 'land', eau = (L) => L.kind === 'water';
// Terres du Sud : toutes les rencontres d'après la Ligue (sur terre), rangées par puissance
const SUD = reserve((L) => terre(L) && L.seg === 9);
const sudPuissance = {}; { const l = Object.keys(SUD.w).map((sp) => [sp, puissance(evoluer(+sp, 60))]).sort((a, b) => a[1] - b[1]); l.forEach(([sp], i) => { sudPuissance[sp] = (i + 0.5) / l.length; }); }

for (const [z, Z] of Object.entries(ZONES)) {
  let parts = [], detail = '';
  const officiel = Z.vr ? 8 : Z.sud != null ? 9 : Z.seg;
  if (Z.water) {
    const r = reserve((L) => eau(L) && Math.abs(L.seg - officiel) <= 1);
    parts.push([r, Z.theme ? 0.4 : 1]); detail = `mer, tronçons ${officiel - 1} à ${officiel + 1} (${r.lieux} lieux, ${r.groupes} jeux)`;
  } else {
    for (const [h, k] of Object.entries(Z.hab)) {
      let r = reserve((L) => terre(L) && L.seg === officiel && L.hab === h);
      // peu de jeux ont ce milieu à ce moment-là : on y ajoute les tronçons voisins (le tronçon exact compte double)
      if (r.groupes < 4) {
        const v = reserve((L) => terre(L) && Math.abs(L.seg - officiel) <= 1 && L.hab === h);
        r = { ...melanger([[r, 2], [v, 1]]), groupes: v.groupes, lieux: v.lieux };
      }
      if (!Object.keys(r.w).length) r = reserve((L) => terre(L) && L.seg === officiel);
      parts.push([r, k * (Z.theme ? 0.4 : 1)]); detail += `${h} : tronçon ${officiel} (${r.lieux} lieux, ${r.groupes} jeux) ; `;
    }
    const tot = Object.values(Z.hab).reduce((a, b) => a + b, 0); parts = parts.map(([r, k]) => [r, k / tot]);
  }
  if (Z.theme) {
    const okKind = Z.water ? eau : terre;
    let r = reserve((L) => okKind(L) && L.themes.has(Z.theme) && Math.abs(L.seg - officiel) <= 2);
    if (Object.keys(r.w).length < 12) r = reserve((L) => okKind(L) && L.themes.has(Z.theme));
    parts.push([r, 0.6]); detail += `thème ${Z.theme} (${r.lieux} lieux, ${r.groupes} jeux)`;
  }
  const brut = melanger(parts).w;
  // évolution au niveau de la zone, puis rareté selon la puissance, puis (Sud) bande de puissance de la route
  const w = {};
  for (const [sp0, x] of Object.entries(brut)) {
    const sp = evoluer(+sp0, Z.lvl[0]);
    let k = x * rarete(puissance(sp));
    if (Z.sud != null) { const q = sudPuissance[sp0] ?? 0.5, c = (Z.sud + 0.5) / 8; k *= Math.exp(-(((q - c) / 0.14) ** 2)); }
    w[sp] = (w[sp] || 0) + k;
  }
  const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let l = Object.entries(w).map(([sp, x]) => [+sp, x / tot]).sort((a, b) => b[1] - a[1]);
  if (Z.sud != null) l = l.slice(0, 45);            // une route du Sud garde ses 45 Pokémon les plus présents
  l = l.filter(([, x], i) => x >= 0.0005 || i < 12);  // les espèces vraiment marginales (moins de 0,05 %) disparaissent
  plafonner(l, Z.water ? 0.18 : 0.1);
  const t2 = l.reduce((a, e) => a + e[1], 0);
  out[z] = l.map(([sp, x]) => [sp, Math.max(1, Math.round((x / t2) * 1000))]);
  rapport[z] = { troncon: Z.seg, officiel, detail, especes: out[z].length, top: out[z].slice(0, 8).map(([sp, x]) => `${SPECIES[sp]?.n} ${x / 10}%`) };
}

// lieux des jeux rangés nulle part (après la Ligue par défaut) et lieux des tables absents des données
const manquants = []; for (const [g, segs] of Object.entries(SEGMENTS)) for (const l of segs.flat()) if (!vus[g]?.has(l)) manquants.push(g + ':' + l);

/* ---------------- points d'effort, légendaires, formes d'avant (inchangés) ---------------- */
const effort = {};
for (const s of parseCSV('pokemon_stats')) { const sp = +s.pokemon_id; if (sp > 721 || !+s.effort) continue; (effort[sp] ||= [0, 0, 0, 0, 0, 0])[+s.stat_id - 1] = +s.effort; }
const effortTxt = JSON.stringify(Object.fromEntries(Object.entries(effort).map(([k, v]) => [k, v.join('')])));
const prevo = {}; for (const [id, S] of Object.entries(SPECIES)) for (const e of S.ev || []) if (!prevo[e.to]) prevo[e.to] = { from: +id, lvl: e.lvl || null };

const lines = Object.entries(out).map(([z, l]) => `  ${z}: ${JSON.stringify(l)},`);
fs.writeFileSync(OUT, `// Généré par tools/odyssee-rencontres.mjs (PokeAPI et tiers de Pokémon Showdown) — ne pas modifier à la main.
// RENCONTRES : zone d'Odyssée → [espèce, poids pour mille] des lieux des jeux officiels (Rouge à X / Y) au même moment de
// l'aventure, entre les mêmes badges ; un Pokémon puissant est plus rare ; Terres du Sud rangées par puissance.
// EFFORT : points d'effort donnés par chaque Pokémon vaincu (PV, Atq, Déf, Atq Spé, Déf Spé, Vit), un chiffre par stat.
export const RENCONTRES = {
${lines.join('\n')}
};
export const EFFORT = ${effortTxt};
export const LEGENDAIRES = ${JSON.stringify([...legend].filter((x) => x <= 721).sort((a, b) => a - b))};
/** forme d'avant (pour les Pokémon trop évolués à bas niveau) : espèce → [forme d'avant, niveau d'évolution] */
export const AVANT = ${JSON.stringify(Object.fromEntries(Object.entries(prevo).filter(([to, p]) => +to <= 721 && p.from <= 721).map(([to, p]) => [to, [p.from, p.lvl || 0]])))};
`);
for (const [z, r] of Object.entries(rapport)) console.log(`${z.padEnd(12)} tronçon ${String(r.troncon).padStart(2)} (officiel ${r.officiel}) ${String(r.especes).padStart(3)} espèces — ${r.top.slice(0, 5).join(', ')}`);
if (manquants.length) console.log('lieux sans rencontre dans PokeAPI :', manquants.join(' '));
if (RAPPORT) fs.writeFileSync(RAPPORT, JSON.stringify({ rapport, segments: SEGMENTS }, null, 1));
console.log('→', path.relative(process.cwd(), OUT));
