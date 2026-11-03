// Fait jouer des bots hors navigateur : node tools/bench-dogfight.mjs [joueurs] [niveau] [objectif] [parties] [mode] [durée]
// Mesure le coût d'un pas, la durée de la partie, les éliminations, les crashs, la répartition des altitudes.
import { generateMap, ILE } from '../royale/engine/map.js';
import { createWorld } from '../dogfight/engine/world.js';
import { createGame, startCountdown, stepGame, drainEvents, DT } from '../dogfight/engine/rules.js';
import { CENTER } from '../dogfight/engine/flight.js';

const [n = 4, lvl = 'normal', kills = 8, runs = 3, mode = 'chacun', time = 600] = process.argv.slice(2).map((v, i) => (i === 1 || i === 4 ? v : Number(v)));
const world = createWorld(generateMap(ILE));
for (let r = 0; r < runs; r++) {
  const g = createGame({ settings: { kills, time, level: lvl, mode }, players: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, bot: true, lvl, type: i % 2 ? 'f22' : 'f16' })), world });
  startCountdown(g, world);
  const S = { hits: 0, kills: 0, crash: {}, msl: 0, shots: 0, cost: 0, steps: 0, worst: 0, maxD: 0, alt: [0, 0, 0, 0, 0], speed: 0, n: 0 };
  while (g.ph !== 'over') {
    const t = performance.now(); stepGame(g, DT, world); const c = performance.now() - t; S.cost += c; S.steps++; S.worst = Math.max(S.worst, c);
    for (const e of drainEvents(g)) { if (e.e === 'hit') S.hits++; if (e.e === 'kill') S.kills++; if (e.e === 'crash') S.crash[e.cause] = (S.crash[e.cause] || 0) + 0.5 * (e.cause === 'collision') + (e.cause !== 'collision'); if (e.e === 'mfire') S.msl++; if (e.e === 'zone') S.zones = (S.zones || 0) + 1; if (e.e === 'round') S.rounds = (S.rounds || 0) + 1; }
    for (const p of g.planes) if (p.alive) { S.n++; S.speed += p.speed; S.alt[p.y < 150 ? 0 : p.y < 300 ? 1 : p.y < 500 ? 2 : p.y < 800 ? 3 : 4]++; S.maxD = Math.max(S.maxD, Math.hypot(p.x - CENTER, p.z - CENTER)); if (p.firing) S.shots++; }
  }
  const pct = (v) => Math.round(v / S.n * 100);
  console.log(`partie ${r + 1} (${lvl}, ${n} avions) : ${(g.settings.time - g.left).toFixed(0)} s, ${S.kills} élim., crashs ${JSON.stringify(S.crash)}, ${S.hits} touches sur ${S.shots} tirs, ${S.msl} missiles, vitesse ${(S.speed / S.n * 3.6).toFixed(0)} km/h, distance max ${S.maxD.toFixed(0)} m${mode === 'chacun' ? '' : ` — ${mode} : score ${Math.round(g.tk[1])}-${Math.round(g.tk[2])}, équipe ${g.winTeam}, zones ${S.zones || 0}, manches ${S.rounds || 0}, vainqueur ${g.winner}, transport ${g.planes.filter((p) => p.type === 'cargo').map((p) => Math.round(p.health)).join('')}`}`);
  console.log(`  altitudes <150 ${pct(S.alt[0])} %, <300 ${pct(S.alt[1])} %, <500 ${pct(S.alt[2])} %, <800 ${pct(S.alt[3])} %, au-delà ${pct(S.alt[4])} % — pas ${(S.cost / S.steps * 1000).toFixed(0)} µs, pire ${S.worst.toFixed(2)} ms`);
}
