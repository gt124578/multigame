// Combats tirés au hasard dans le moteur d'Odyssée (espèces, attaques, talents, objets et météo au hasard) :
// aucune exception, des PV et des PP valides, pas de texte « undefined », et tout combat finit (Lutte comprise).
// node tools/fuzz-odyssee-combats.mjs [combats = 3000] [première graine = 0] ; TRACE=1 affiche la fin d'un combat.
const B = new URL('../odyssee/js/', import.meta.url).href;
const { createMon, healFull } = await import(B + 'core/mon.js');
const { Battle } = await import(B + 'core/battle.js');
const { SPECIES } = await import(B + 'data/species.js');
const { MOVES } = await import(B + 'data/moves.js');
const { ITEMS } = await import(B + 'core/items.js');
await import(B + 'core/mega.js').catch(() => {});
const { ABILITIES } = await import(B + 'data/abilities.js').catch(() => ({}));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const N = +(process.argv[2] || 3000), S0 = +(process.argv[3] || 0);
const ids = Object.keys(SPECIES).map(Number), mv = Object.keys(MOVES).map(Number), its = Object.keys(ITEMS), abs = ABILITIES ? Object.keys(ABILITIES) : [];
const pb = new Map(); const note = (k, d) => { if (!pb.has(k)) pb.set(k, { n: 0, d }); pb.get(k).n++; };
let nonFinis = 0;
for (let k = S0; k < S0 + N; k++) {
  const R = rng(k * 2654435761 + 17), pick = (a) => a[Math.floor(R() * a.length)];
  const mk = () => { const o = { rng: R }; if (R() < 0.6) o.moves = Array.from({ length: 1 + Math.floor(R() * 4) }, () => pick(mv)); const m = createMon(pick(ids), 1 + Math.floor(R() * 100), o); if (R() < 0.6) m.item = pick(its); if (abs.length && R() < 0.5) m.ability = pick(abs); return m; };
  let party, foe, b; const wild = R() < 0.4;
  const desc = () => `graine ${k} : ${party.map((m) => `${m.sp}/${m.ability || ''}/${m.item || ''}/[${m.moves.map((x) => x.id)}]`).join(' ; ')} VS ${foe.map((m) => `${m.sp}/${m.ability || ''}/${m.item || ''}/[${m.moves.map((x) => x.id)}]`).join(' ; ')}`;
  try {
    party = Array.from({ length: 1 + Math.floor(R() * 3) }, mk); foe = Array.from({ length: wild ? 1 : 1 + Math.floor(R() * 3) }, mk);
    const bag = {}; for (const i of its) if (R() < 0.3) bag[i] = 3; 
    b = new Battle({ rng: R, weather: pick(['none', 'none', 'rain', 'sun', 'sand', 'hail']), player: { name: 'Test', party, bag, mega: R() < 0.7 }, foe: { name: 'X', party: foe, trainer: wild ? null : { cls: 'Gamin', name: 'Léo', prize: 16, ai: pick(['smart', 'normal']), mega: R() < 0.5, items: { potion: 1, 'full-restore': 1 } } }, wild });
    b.start();
    let n = 0;
    while (b.state !== 'over' && n < 600) {
      n++;
      if (b.state === 'switch') { const i = party.findIndex((m, j) => b.canSwitchTo(j)); if (i < 0) { note('état switch sans remplaçant', desc()); break; } b.playerSwitch(i); continue; }
      const r = R(); let ev;
      const bagIt = Object.keys(b.bag || {}).filter((i) => b.bag[i] > 0);
      if (r < 0.07 && bagIt.length) ev = b.playerAction({ type: 'item', item: pick(bagIt), target: Math.floor(R() * party.length) });
      else if (r < 0.10) ev = b.playerAction({ type: 'run' });
      else if (r < 0.18) { const c = party.map((m, j) => j).filter((j) => b.canSwitchTo(j)); ev = c.length ? b.playerAction({ type: 'switch', idx: pick(c) }) : b.playerAction({ type: 'move' }); }
      else { const u = b.usableMoves(0); ev = b.playerAction({ type: 'move', idx: u.length ? pick(u) : undefined, mega: R() < 0.5 && b.canMega?.(0) }); }
      if (process.env.TRACE && n > 560) console.log(n, (ev||[]).filter(e=>e.t==='msg').map(e=>e.text).join(' / ').slice(0,400), party.map(m=>m.hp), foe.map(m=>m.hp));
      for (const e of ev || []) if (e.t === 'msg' && /undefined|NaN|\[object|null/.test(e.text)) note('texte : ' + e.text.replace(/\d+/g, '#').slice(0, 90), e.text + ' — ' + desc());
      for (const m of party.concat(foe)) { if (!(m.hp >= 0 && m.hp <= m.stats[0] && Number.isInteger(m.hp))) note('PV invalides', `${m.hp}/${m.stats[0]} ` + desc()); if (m.stats.some((x) => !Number.isFinite(x) || x <= 0)) note('stats invalides', JSON.stringify(m.stats) + desc()); for (const x of m.moves) if (!(x.pp >= 0) ) note('PP invalides', x.id + ' ' + x.pp + desc()); }
    }
    if (b.state !== 'over') { nonFinis++; if (nonFinis <= 8) note('combat sans fin (600 tours)', desc()); }
  } catch (e) { note('EXCEPTION ' + String(e.stack).split('\n').slice(0, 3).join(' | ').replace(/file:\/\/.*?\/odyssee\/js\//g, ''), desc()); }
}
console.log(N, 'combats ;', nonFinis, 'sans fin');
for (const [k, v] of [...pb].sort((a, b) => b[1].n - a[1].n)) console.log(`\n[${v.n}×] ${k}\n    ${v.d.slice(0, 420)}`);
if (pb.size) process.exit(1);
