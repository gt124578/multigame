// tools/odyssee-donnees.mjs
// Génère les données de l'aventure Odyssée (odyssee/js/data/*.js) à partir des tables CSV de PokeAPI.
// Les Pokémon ne servent que de remplaçants pour le prototype : changer de créatures = régénérer ces fichiers.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi /tmp/pokeapi
//   (cd /tmp/pokeapi && git sparse-checkout set data/v2/csv)
//   node tools/odyssee-donnees.mjs /tmp/pokeapi/data/v2/csv
//
// Règles de la 4e génération (HeartGold / SoulSilver) : types sans Fée, Acier qui résiste à Spectre et Ténèbres,
// statistiques et types d'avant la 6e génération, attaques apprises par niveau dans HGSS.

import fs from 'node:fs';
import path from 'node:path';

const CSV = process.argv[2];
if (!CSV) { console.error('usage : node tools/odyssee-donnees.mjs <dossier csv de PokeAPI>'); process.exit(1); }
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'odyssee', 'js', 'data');
const MAX_SPECIES = 251, VG = 10 /* heartgold-soulsilver */, FR = 5;

function parseCSV(file) {
  const txt = fs.readFileSync(path.join(CSV, file + '.csv'), 'utf8');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length >= head.length - 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const num = (v) => (v === '' || v == null ? null : +v);

const TYPES = {}; for (const t of parseCSV('types')) TYPES[t.id] = t.identifier;
const STAT = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }; // pv, atk, def, atkspé, défspé, vit

/* ---------------- espèces ---------------- */
const species = {};
for (const s of parseCSV('pokemon_species')) {
  const id = +s.id; if (id > MAX_SPECIES) continue;
  species[id] = { id, key: s.identifier, cr: +s.capture_rate, g: +s.growth_rate_id, gr: +s.gender_rate, from: num(s.evolves_from_species_id), leg: s.is_legendary === '1' || s.is_mythical === '1', b: [0, 0, 0, 0, 0, 0], t: [], ls: [], ev: [] };
}
for (const p of parseCSV('pokemon')) { const id = +p.id; if (species[id]) { species[id].xp = +p.base_experience; species[id].h = +p.height; species[id].w = +p.weight; } }
for (const st of parseCSV('pokemon_stats')) { const sp = species[+st.pokemon_id]; if (sp && STAT[st.stat_id] != null) sp.b[STAT[st.stat_id]] = +st.base_stat; }
// statistiques d'avant la 6e génération
const statsPast = {};
for (const st of parseCSV('pokemon_stats_past')) {
  const id = +st.pokemon_id, g = +st.generation_id; if (!species[id] || g < 4 || STAT[st.stat_id] == null) continue;
  (statsPast[id] ||= {})[st.stat_id] = statsPast[id][st.stat_id] && statsPast[id][st.stat_id].g <= g ? statsPast[id][st.stat_id] : { g, v: +st.base_stat };
}
for (const [id, m] of Object.entries(statsPast)) for (const [sid, o] of Object.entries(m)) species[id].b[STAT[sid]] = o.v;
const typesNow = {}, typesPast = {};
for (const t of parseCSV('pokemon_types')) { const id = +t.pokemon_id; if (species[id]) (typesNow[id] ||= [])[+t.slot - 1] = TYPES[t.type_id]; }
for (const t of parseCSV('pokemon_types_past')) { const id = +t.pokemon_id; if (species[id] && +t.generation_id >= 4) (typesPast[id] ||= [])[+t.slot - 1] = TYPES[t.type_id]; }
for (const id in species) species[id].t = (typesPast[id] || typesNow[id]).filter(Boolean);
for (const n of parseCSV('pokemon_species_names')) { const sp = species[+n.pokemon_species_id]; if (sp && +n.local_language_id === FR) { sp.n = n.name; sp.genus = n.genus; } }
// textes du Pokédex en français (X / Y)
const dexTxt = {};
for (const f of parseCSV('pokemon_species_flavor_text')) {
  const id = +f.species_id; if (!species[id] || +f.language_id !== FR) continue;
  const pr = { 24: 3, 23: 2, 26: 1, 25: 1 }[f.version_id] || 0;
  if (!dexTxt[id] || dexTxt[id].pr < pr) dexTxt[id] = { pr, t: f.flavor_text.replace(/[\s­]+/g, ' ').replace(/ ([!?;:»])/g, ' $1').trim() };
}
for (const id in species) species[id].dex = dexTxt[id]?.t || '';

/* ---------------- objets (pierres d'évolution) ---------------- */
const items = {}; for (const it of parseCSV('items')) items[it.id] = it.identifier;
const itemFR = {}; for (const n of parseCSV('item_names')) if (+n.local_language_id === FR) itemFR[items[n.item_id]] = n.name;

/* ---------------- évolutions ---------------- */
// niveau : tel quel ; échange → niveau 38 ; bonheur → niveau 22 ; pierre → objet ; autres → niveau 30
for (const e of parseCSV('pokemon_evolution')) {
  const to = +e.evolved_species_id; if (!species[to] || !species[to].from) continue;
  const from = species[species[to].from]; if (!from) continue;
  if (from.ev.some((x) => x.to === to)) continue;
  const trig = +e.evolution_trigger_id;
  let ev;
  if (trig === 1 && e.minimum_level) ev = { to, lvl: +e.minimum_level };
  else if (trig === 3 && e.trigger_item_id) ev = { to, item: items[e.trigger_item_id] };
  else if (trig === 2) ev = { to, lvl: 38 };
  else if (trig === 1 && e.minimum_happiness) ev = { to, lvl: 22 };
  else ev = { to, lvl: 30 };
  from.ev.push(ev);
}
// Évoli : une pierre par évolution ; Mentali / Noctali (bonheur jour / nuit) passent par Pierre Soleil / Pierre Lune ici
const evo = species[133]; if (evo) evo.ev = [{ to: 134, item: 'water-stone' }, { to: 135, item: 'thunder-stone' }, { to: 136, item: 'fire-stone' }, { to: 196, item: 'sun-stone' }, { to: 197, item: 'moon-stone' }];
// Tygnon / Kicklee / Kapoera : selon les stats en vrai, ici au hasard du niveau
if (species[236]) species[236].ev = [{ to: 106, lvl: 20 }];

/* ---------------- attaques ---------------- */
const moveNames = {}; for (const n of parseCSV('move_names')) if (+n.local_language_id === FR) moveNames[n.move_id] = n.name;
const meta = {}; for (const m of parseCSV('move_meta')) meta[m.move_id] = m;
const statCh = {}; for (const s of parseCSV('move_meta_stat_changes')) (statCh[s.move_id] ||= []).push([+s.stat_id, +s.change]);
const changelog = {};
for (const c of parseCSV('move_changelog')) { const vg = +c.changed_in_version_group_id; if (vg > VG && (!changelog[c.move_id] || +changelog[c.move_id].changed_in_version_group_id > vg)) changelog[c.move_id] = c; }
const CLASS = { 1: 'status', 2: 'physical', 3: 'special' };
const AIL = { 1: 'par', 2: 'slp', 3: 'frz', 4: 'brn', 5: 'psn', 6: 'conf', 8: 'trap', 18: 'seed' };
// attaques à effet unique gérées par le moteur
const UNIQUE = new Set(['dragon-rage', 'sonic-boom', 'seismic-toss', 'night-shade', 'super-fang', 'psywave', 'rest', 'protect', 'detect', 'struggle',
  'false-swipe', 'endeavor', 'flail', 'reversal', 'low-kick', 'return', 'frustration', 'facade', 'hidden-power', 'splash', 'pain-split', 'belly-drum', 'magnitude', 'present', 'counter', 'mirror-coat', 'teleport']);
const FIELD = new Set(['haze', 'reflect', 'light-screen', 'mist', 'safeguard', 'roar', 'whirlwind']);
const CHARGE = new Set(['solar-beam', 'razor-wind', 'sky-attack', 'skull-bash', 'fly', 'dig', 'dive', 'bounce']);
const moves = {}, allMoves = {};
for (const m of parseCSV('moves')) {
  const id = +m.id; if (id > 467) continue;
  const mt = meta[id] || {}, ch = changelog[id] || {};
  const pick = (k) => (ch[k] !== undefined && ch[k] !== '' ? +ch[k] : num(m[k]));
  const cat = num(mt.meta_category_id);
  const o = { id, key: m.identifier, n: moveNames[id] || m.identifier, t: TYPES[ch.type_id || m.type_id], c: CLASS[m.damage_class_id], p: pick('power') || 0, a: pick('accuracy'), pp: pick('pp'), pr: pick('priority') || 0, tg: +m.target_id };
  if (TYPES[m.type_id] === 'fairy') o.t = 'normal';
  const x = {};
  if (cat != null) x.cat = cat;
  if (+mt.meta_ailment_id > 0 && AIL[mt.meta_ailment_id]) { x.ail = AIL[mt.meta_ailment_id]; x.ailc = +mt.ailment_chance || (o.c === 'status' ? 100 : 0); }
  if (mt.min_hits) { x.h0 = +mt.min_hits; x.h1 = +mt.max_hits; }
  if (+mt.drain) x.drain = +mt.drain;
  if (+mt.healing) x.heal = +mt.healing;
  if (+mt.crit_rate) x.crit = +mt.crit_rate;
  if (+mt.flinch_chance) x.flinch = +mt.flinch_chance;
  if (statCh[id]) { x.st = statCh[id]; x.stc = +mt.stat_chance || (o.c === 'status' ? 100 : 0); }
  if (UNIQUE.has(m.identifier)) x.u = m.identifier;
  if (FIELD.has(m.identifier)) x.u = m.identifier;
  if (CHARGE.has(m.identifier)) x.charge = 1;
  if (['hyper-beam', 'giga-impact', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'roar-of-time', 'rock-wrecker'].includes(m.identifier)) x.recharge = 1;
  if (['explosion', 'self-destruct', 'memento'].includes(m.identifier)) x.boom = 1;
  if (['swift', 'aerial-ace', 'shock-wave', 'magical-leaf', 'shadow-punch', 'aura-sphere', 'faint-attack', 'vital-throw', 'magnet-bomb'].includes(m.identifier)) x.sure = 1;
  if (['thrash', 'outrage', 'petal-dance'].includes(m.identifier)) x.rampage = 1;
  if (m.identifier === 'quick-attack' || m.identifier === 'extreme-speed') o.pr = Math.max(o.pr, 1);
  if (Object.keys(x).length) o.m = x;
  // gérée ?
  const supported = x.u || [0, 1, 2, 3, 4, 6, 7, 8, 9].includes(cat) && !(cat === 1 && !x.ail && !x.st) && !(['transform', 'mimic', 'metronome', 'mirror-move', 'sketch', 'conversion', 'conversion-2', 'baton-pass', 'bide', 'rage', 'substitute', 'focus-punch', 'uproar', 'stockpile', 'spit-up', 'swallow', 'future-sight', 'doom-desire', 'trump-card', 'payback', 'assurance', 'avalanche', 'revenge', 'pursuit', 'u-turn', 'rapid-spin', 'beat-up', 'triple-kick', 'sucker-punch', 'snore', 'sleep-talk', 'dream-eater', 'nightmare', 'curse', 'spite', 'encore', 'torment', 'taunt', 'disable', 'attract', 'captivate', 'swagger', 'flatter', 'role-play', 'skill-swap', 'trick', 'switcheroo', 'thief', 'covet', 'knock-off', 'bug-bite', 'pluck', 'natural-gift', 'fling', 'gyro-ball', 'grass-knot', 'heavy-slam', 'crush-grip', 'wring-out', 'punishment', 'last-resort', 'me-first', 'copycat', 'assist', 'psych-up', 'power-trick', 'acupressure', 'lock-on', 'mind-reader', 'foresight', 'odor-sleuth', 'miracle-eye', 'yawn', 'perish-song', 'ingrain', 'aqua-ring', 'wish', 'heal-bell', 'aromatherapy', 'refresh', 'imprison', 'grudge', 'destiny-bond', 'endure', 'snatch', 'magic-coat', 'helping-hand', 'follow-me', 'gravity', 'trick-room', 'tailwind', 'lucky-chant', 'embargo', 'heal-block', 'fling', 'focus-energy', 'charge', 'defense-curl', 'minimize', 'weather-ball', 'brine', 'wake-up-slap', 'smelling-salts', 'secret-power', 'nature-power', 'camouflage', 'mud-sport', 'water-sport', 'rain-dance', 'sunny-day', 'sandstorm', 'hail', 'spikes', 'toxic-spikes', 'stealth-rock', 'block', 'mean-look', 'spider-web', 'feint', 'roost', 'healing-wish', 'lunar-dance', 'heal-order', 'power-swap', 'guard-swap', 'judgment', 'present'].includes(m.identifier) && !x.u);
  if (o.c === 'status' && cat === 0) continue;
  allMoves[id] = o;
  if (supported && o.pp) moves[id] = o;
}

/* ---------------- attaques apprises (HGSS, par niveau) ---------------- */
const tmp = {};
for (const pm of parseCSV('pokemon_moves')) {
  if (+pm.version_group_id !== VG || +pm.pokemon_move_method_id !== 1) continue;
  const id = +pm.pokemon_id; if (!species[id]) continue;
  const mv = +pm.move_id; if (!moves[mv]) continue;
  (tmp[id] ||= []).push([+pm.level, mv]);
}
const usedMoves = new Set();
for (const id in species) {
  const l = (tmp[id] || []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const seen = new Set(); species[id].ls = l.filter(([lv, mv]) => { const k = lv + ':' + mv; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!species[id].ls.length) species[id].ls = [[1, 33]];
  for (const [, mv] of species[id].ls) usedMoves.add(mv);
}
usedMoves.add(165); // Lutte
const outMoves = {}; for (const id of [...usedMoves].sort((a, b) => a - b)) if (moves[id] || allMoves[id]) outMoves[id] = moves[id] || allMoves[id];
outMoves[165] = { ...allMoves[165], m: { ...(allMoves[165].m || {}), u: 'struggle' } };

/* ---------------- table des types (4e génération) ---------------- */
const TYPE_LIST = Object.entries(TYPES).filter(([id]) => +id <= 17).map(([, t]) => t);
const chart = {};
for (const e of parseCSV('type_efficacy')) {
  const a = TYPES[e.damage_type_id], d = TYPES[e.target_type_id];
  if (!TYPE_LIST.includes(a) || !TYPE_LIST.includes(d)) continue;
  if (+e.damage_factor !== 100) (chart[a] ||= {})[d] = +e.damage_factor / 100;
}
for (const e of parseCSV('type_efficacy_past')) { if (+e.generation_id < 4) continue; const a = TYPES[e.damage_type_id], d = TYPES[e.target_type_id]; (chart[a] ||= {})[d] = +e.damage_factor / 100; }

/* ---------------- objets ---------------- */
const ITEM_KEYS = ['poke-ball', 'great-ball', 'ultra-ball', 'potion', 'super-potion', 'hyper-potion', 'max-potion', 'full-restore', 'revive', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'full-heal', 'escape-rope', 'repel', 'super-repel', 'max-repel', 'rare-candy', 'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'oran-berry', 'ether', 'elixir'];
const itemNames = Object.fromEntries(ITEM_KEYS.map((k) => [k, itemFR[k] || k]));

/* ---------------- écriture ---------------- */
fs.mkdirSync(OUT, { recursive: true });
const banner = '// Généré par tools/odyssee-donnees.mjs à partir des données de PokeAPI — ne pas modifier à la main.\n';
const spOut = {};
for (const id of Object.keys(species).map(Number).sort((a, b) => a - b)) {
  const s = species[id];
  spOut[id] = { n: s.n, k: s.key, t: s.t, b: s.b, cr: s.cr, xp: s.xp, g: s.g, gr: s.gr, ls: s.ls, ...(s.ev.length ? { ev: s.ev } : {}), ...(s.leg ? { leg: 1 } : {}), genus: s.genus, h: s.h, w: s.w, dex: s.dex };
}
// les créatures originales (data/creatures.js, écrites à la main) rejoignent la table des espèces
fs.writeFileSync(path.join(OUT, 'species.js'), banner + "import { CREATURES } from './creatures.js';\n" + 'export const SPECIES = ' + JSON.stringify(spOut).replace(/\},"/g, '},\n"') + ';\nObject.assign(SPECIES, CREATURES);\n');
fs.writeFileSync(path.join(OUT, 'moves.js'), banner + 'export const MOVES = ' + JSON.stringify(outMoves).replace(/\},"/g, '},\n"') + ';\n');
fs.writeFileSync(path.join(OUT, 'types.js'), banner + 'export const TYPE_LIST = ' + JSON.stringify(TYPE_LIST) + ';\nexport const TYPE_CHART = ' + JSON.stringify(chart) + ';\nexport const ITEM_NAMES = ' + JSON.stringify(itemNames, null, 0) + ';\n');
console.log('espèces', Object.keys(spOut).length, '· attaques', Object.keys(outMoves).length, '· sans attaque gérée', Object.values(spOut).filter((s) => s.ls.length === 1 && s.ls[0][1] === 33).map((s) => s.n).join(', '));
