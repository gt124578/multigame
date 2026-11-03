// Talents d'Odyssée : chaque espèce a ses talents, et 2 000 combats où chaque Pokémon reçoit un talent au hasard
// (tous les talents y passent) se terminent sans erreur ni texte cassé. Usage : node tools/test-odyssee-talents.mjs
import { createMon } from '../odyssee/js/core/mon.js';
import { Battle } from '../odyssee/js/core/battle.js';
import { SPECIES } from '../odyssee/js/data/species.js';
import { ABILITIES, abilitiesOf, getAbility } from '../odyssee/js/data/abilities.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; if (fails < 20) console.log('ÉCHEC', m); } };
const rng = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
const ids = Object.keys(SPECIES).map(Number), keys = Object.keys(ABILITIES);
for (const sp of ids) { const l = abilitiesOf(sp); ok(l[0] || l[2], 'espèce ' + sp + ' sans talent'); ok(getAbility(createMon(sp, 5))?.name, 'nom du talent de ' + sp); }
const used = new Set(); let n2 = 0;
for (let k = 0; k < 2000; k++) {
  const R = rng(k + 77), pick = () => ids[Math.floor(R() * ids.length)];
  const mk = () => { const m = createMon(pick(), 5 + Math.floor(R() * 60), { rng: R }); m.ability = keys[Math.floor(R() * keys.length)]; used.add(m.ability); return m; };
  const party = [mk(), mk()], wild = k % 2 === 0, foeParty = wild ? [mk()] : [mk(), mk()];
  const b = new Battle({ rng: R, weather: ['none', 'rain', 'sun', 'sandstorm', 'hail'][k % 5], weatherTurns: 5, player: { name: 'Test', party, bag: { 'poke-ball': 5 } }, foe: { name: 'X', party: foeParty, trainer: wild ? null : { cls: 'Gamin', name: 'Léo', prize: 16, ai: 'smart', items: {} } } });
  let n = 0;
  try {
    for (const e of b.start()) if (e.t === 'msg') ok(!/undefined|NaN|null/.test(e.text), 'texte : ' + e.text);
    while (b.state !== 'over' && n < 400) {
      n++;
      if (b.state === 'switch') { b.playerSwitch(party.findIndex((m, j) => b.canSwitchTo(j))); continue; }
      const r = R(); let ev;
      if (wild && r < 0.05) ev = b.playerAction({ type: 'run' });
      else if (!wild && r < 0.08 && party.some((m, j) => b.canSwitchTo(j))) ev = b.playerAction({ type: 'switch', idx: party.findIndex((m, j) => b.canSwitchTo(j)) });
      else { const u = b.usableMoves(0); ev = b.playerAction({ type: 'move', idx: u.length ? u[Math.floor(R() * u.length)] : 0 }); }
      for (const e of ev) if (e.t === 'msg') ok(!/undefined|NaN|null/.test(e.text), 'texte : ' + e.text);
    }
  } catch (e) { fails++; console.log('EXCEPTION combat', k, e.stack); }
  ok(b.state === 'over', 'combat ' + k + ' terminé'); n2 += n;
  for (const m of party.concat(foeParty)) ok(m.hp >= 0 && m.hp <= m.stats[0] && Number.isFinite(m.hp), 'PV valides');
}
console.log(`${ids.length} espèces, ${used.size}/${keys.length} talents essayés, ${(n2 / 2000).toFixed(1)} tours en moyenne`);
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); } else console.log('Odyssée : talents OK');
