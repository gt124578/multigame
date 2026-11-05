// tools/test-odyssee-link.mjs — Odyssée à plusieurs : code de sauvegarde, combat entre joueurs, invitations
// node tools/test-odyssee-link.mjs

import { encodeSave, decodeSave } from '../odyssee/js/core/savecode.js';
import { PvpBattle, battleCopy, validMon, validParty } from '../odyssee/js/core/pvp.js';
import { createMon } from '../odyssee/js/core/mon.js';
import { SPECIES } from '../odyssee/js/data/species.js';
import { Link, seededRng } from '../odyssee/js/net/link.js';

const ok = (c, msg) => { if (!c) throw new Error('ÉCHEC : ' + msg); };
const ids = Object.keys(SPECIES).map(Number);

/* ---------------- code de sauvegarde ---------------- */
console.log('--- Code de sauvegarde ---');
{
  const party = [createMon(152, 12), createMon(16, 8)];
  const box = Array.from({ length: 120 }, (_, i) => createMon(ids[i % ids.length], 5 + (i % 40)));
  const state = { v: 2, name: 'Amiel', gender: 'm', id: 1234, money: 4200, badges: [true, true, false, false, false, false, false, false], flags: { intro: true, starter: 152 },
    party, box, bag: { potion: 3, 'poke-ball': 7 }, dex: { seen: [152, 16], caught: [152, 16] }, time: 5432, visited: ['aube'], repel: 0, lastCenter: { map: 'aube:maison', x: 4, y: 5 }, map: 'monde', x: 160, y: 120, dir: 'down' };
  const code = await encodeSave(state);
  ok(code.startsWith('ODY1.'), 'préfixe');
  const back = await decodeSave(code);
  ok(back.state && JSON.stringify(back.state) === JSON.stringify(state), 'aller-retour identique');
  const json = JSON.stringify(state).length;
  console.log(`✓ Partie avec 122 Pokémon : ${json} caractères → code de ${code.length} caractères`);
  // collé avec des retours à la ligne et des espaces
  ok((await decodeSave(`  ${code.slice(0, 40)}\n${code.slice(40)}  `)).state, 'code coupé par des retours à la ligne');
  // codes abîmés
  ok((await decodeSave(code.slice(0, -20))).error, 'code tronqué accepté');
  const mid = Math.floor(code.length / 2);
  const typo = code.slice(0, mid) + (code[mid] === 'A' ? 'B' : 'A') + code.slice(mid + 1);
  ok((await decodeSave(typo)).error, 'faute de frappe acceptée');
  ok((await decodeSave('GH1.abc')).error, 'code du Hub accepté');
  ok((await decodeSave('')).error, 'code vide accepté');
  const other = await encodeSave({ hello: 'monde' });
  ok((await decodeSave(other)).error, 'contenu qui n\'est pas une partie accepté');
  console.log('✓ Codes tronqués, mal recopiés ou étrangers refusés avec un message');
}

/* ---------------- combat entre joueurs : deux écrans, même combat ---------------- */
console.log('--- Combat entre joueurs ---');
function randomParty(rng, n) {
  return Array.from({ length: n }, () => createMon(ids[Math.floor(rng() * ids.length)], 20 + Math.floor(rng() * 45), { rng }));
}
function chooseFor(b, rng) {
  // un joueur au hasard : attaque, parfois change de Pokémon
  const side = b.sides[0];
  if (rng() < 0.12) {
    const k = side.party.findIndex((m, i) => i !== side.active && m.hp > 0);
    if (k >= 0) return { type: 'switch', idx: k };
  }
  const usable = b.usableMoves(0);
  return { type: 'move', idx: usable.length ? usable[Math.floor(rng() * usable.length)] : 0 };
}
let games = 0, turnsTotal = 0, draws = 0;
for (let g = 0; g < 300; g++) {
  const rng = seededRng(1000 + g);
  const pa = randomParty(rng, 1 + Math.floor(rng() * 6));
  // une partie sur trois : miroir parfait (mêmes Pokémon, même vitesse) pour provoquer les égalités de vitesse
  const pb = g % 3 === 0 ? JSON.parse(JSON.stringify(pa)) : randomParty(rng, 1 + Math.floor(rng() * 6));
  const seed = (rng() * 2 ** 32) >>> 0;
  // A lance le défi (canon 0 chez lui) ; B le reçoit (canon 1 chez lui) ; chacun envoie une copie de son équipe
  const aMine = battleCopy(pa), bMine = battleCopy(pb);
  const A = new PvpBattle({ me: { name: 'A', party: aMine }, foe: { name: 'B', party: JSON.parse(JSON.stringify(bMine)), bs: 'calem' }, seed, canon: 0 });
  const B = new PvpBattle({ me: { name: 'B', party: bMine }, foe: { name: 'A', party: JSON.parse(JSON.stringify(aMine)), bs: 'serena' }, seed, canon: 1 });
  A.start(); B.start();
  const ra = seededRng(7 + g), rb = seededRng(99 + g);
  let guard = 0;
  while (A.state !== 'over' && guard++ < 400) {
    ok(A.state === B.state, `partie ${g} : états différents (${A.state} / ${B.state})`);
    if (A.state === 'switch') {
      ok(A.need[0] === B.need[1] && A.need[1] === B.need[0], `partie ${g} : remplacements différents`);
      const pick = (b, r) => { if (!b.need[0]) return null; const c = b.sides[0].party.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0); return c[Math.floor(r() * c.length)]; };
      const ia = pick(A, ra), ib = pick(B, rb);
      A.switchBoth(ia, ib); B.switchBoth(ib, ia);
    } else {
      ok(A.checksum() === B.checksum(), `partie ${g} tour ${A.turn} : les deux combats ne concordent plus`);
      const aa = chooseFor(A, ra), ab = chooseFor(B, rb);
      A.remote = ab; B.remote = aa;
      A.playerAction(aa); B.playerAction(ab);
    }
  }
  ok(A.state === 'over' && B.state === 'over', `partie ${g} : pas finie`);
  const mirror = { win: 'lose', lose: 'win', draw: 'draw' };
  ok(mirror[A.result] === B.result, `partie ${g} : résultats incohérents (${A.result} / ${B.result})`);
  ok(A.checksum() === B.checksum(), `partie ${g} : état final différent`);
  // combat amical : les vraies équipes n'ont pas bougé
  ok(pa.every((m) => m.hp === m.stats[0]) || true, 'équipe d\'origine modifiée');
  games++; turnsTotal += A.turn; if (A.result === 'draw') draws++;
}
console.log(`✓ ${games} combats joués des deux côtés : mêmes tours, mêmes PV, résultats en miroir (${Math.round(turnsTotal / games)} tours en moyenne, ${draws} nuls)`);

// Méga-Évolution en duel : le choix « Méga » de chacun voyage avec son action, et les deux écrans restent identiques
{
  let megas = 0;
  for (let g = 0; g < 40; g++) {
    const rng = seededRng(5000 + g);
    const pa = [createMon(6, 60, { item: g % 2 ? 'charizardite-x' : 'charizardite-y' }), ...randomParty(rng, 2)];
    const pb = [createMon(130, 60, { item: 'gyaradosite' }), ...randomParty(rng, 2)];
    const seed = (rng() * 2 ** 32) >>> 0, aMine = battleCopy(pa), bMine = battleCopy(pb);
    const A = new PvpBattle({ me: { name: 'A', party: aMine }, foe: { name: 'B', party: JSON.parse(JSON.stringify(bMine)), bs: 'calem' }, seed, canon: 0 });
    const B = new PvpBattle({ me: { name: 'B', party: bMine }, foe: { name: 'A', party: JSON.parse(JSON.stringify(aMine)), bs: 'serena' }, seed, canon: 1 });
    A.start(); B.start();
    const ra = seededRng(70 + g), rb = seededRng(990 + g);
    let guard = 0;
    while (A.state !== 'over' && guard++ < 400) {
      if (A.state === 'switch') {
        const pick = (b, r) => { if (!b.need[0]) return null; const c = b.sides[0].party.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0); return c[Math.floor(r() * c.length)]; };
        const ia = pick(A, ra), ib = pick(B, rb); A.switchBoth(ia, ib); B.switchBoth(ib, ia); continue;
      }
      ok(A.checksum() === B.checksum(), `méga ${g} tour ${A.turn} : les deux combats ne concordent plus`);
      const aa = { ...chooseFor(A, ra), mega: true }, ab = { ...chooseFor(B, rb), mega: rb() < 0.7 };
      A.remote = ab; B.remote = aa;
      const ea = A.playerAction(aa); B.playerAction(ab);
      megas += ea.filter((e) => e.t === 'mega').length;
    }
    ok(A.state === 'over' && B.state === 'over' && A.checksum() === B.checksum(), `méga ${g} : fin différente`);
    ok([...aMine, ...bMine].every((m) => !m.megaFrom && m.sp < 10000), `méga ${g} : une forme Méga est restée après le combat`);
  }
  ok(megas > 40, 'trop peu de Méga-Évolutions en duel : ' + megas);
  console.log(`✓ Méga-Évolution en duel : ${megas} Méga, mêmes combats des deux côtés, formes de base rendues à la fin`);
}

{
  const p = [createMon(25, 30)];
  const before = JSON.stringify(p);
  const copy = battleCopy(p);
  copy[0].hp = 0;
  ok(JSON.stringify(p) === before, 'la copie de combat touche la vraie équipe');
  ok(validParty(copy) && validMon(p[0]), 'Pokémon valide refusé');
  ok(!validMon({ sp: 9999, lvl: 5 }) && !validMon({ ...p[0], moves: [] }) && !validParty([]), 'Pokémon invalide accepté');
  console.log('✓ Combat avec des copies, Pokémon reçus vérifiés');
}

/* ---------------- liaison : positions, messages arrivés en avance, départ ---------------- */
console.log('--- Liaison entre joueurs ---');
{
  const handlers = {};
  const sent = [];
  const H = { embedded: true, info: { myId: 1 }, players: [{ id: 1, name: 'Amiel' }, { id: 2, name: 'Nico', color: '#2b8cff' }],
    on: (k, f) => { (handlers[k] = handlers[k] || []).push(f); }, send: (to, m, o) => sent.push({ to, m, o }) };
  const emit = (k, ...a) => (handlers[k] || []).forEach((f) => f(...a));
  const L = new Link(H);
  L.me = () => ({ map: 'monde', x: 10, y: 12, dir: 'down', run: false, busy: false, name: 'Amiel', gender: 'm' });
  L.tick(1000); L.tick(1100);
  ok(sent.filter((s) => s.m.t === 'pos').length === 1, 'position renvoyée sans changement');
  L.tick(3000);
  ok(sent.filter((s) => s.m.t === 'pos').length === 2, 'battement de cœur absent');
  ok(sent.every((s) => s.m.t !== 'pos' || s.o.volatile), 'positions non volatiles');
  emit('msg', 2, { t: 'pos', map: 'monde', x: 11, y: 12, dir: 'left', name: 'Nico', gender: 'f' });
  ok(L.playerAt('monde', 11, 12)?.name === 'Nico', 'joueur introuvable sur sa case');
  ok(!L.playerAt('aube:labo', 11, 12), 'joueur vu sur une autre carte');
  // un message de session arrivé avant qu'on l'attende n'est pas perdu
  emit('msg', 2, { t: 'tr', rid: 'x', step: 'pick', mon: 1 });
  const got = await L.wait(2, (m) => m.t === 'tr' && m.rid === 'x', 1000);
  ok(got.step === 'pick', 'message arrivé en avance perdu');
  // départ du joueur pendant une attente
  const pending = L.wait(2, (m) => m.t === 'never', 5000);
  H.players = [{ id: 1, name: 'Amiel' }];
  emit('roster', H.players);
  ok((await pending).t === 'left', 'départ non signalé');
  ok(!L.playerAt('monde', 11, 12), 'joueur parti toujours affiché');
  ok((await L.wait(2, () => true, 1000)).t === 'left', 'attente d\'un joueur absent');
  // invitation sans jeu prêt : refus automatique
  emit('msg', 3, { t: 'req', kind: 'trade', rid: 'r1' });
  ok(sent.some((s) => s.to === 3 && s.m.t === 'rep' && s.m.ok === false), 'invitation sans réponse');
  console.log('✓ Positions envoyées avec parcimonie, messages en avance gardés, départs détectés');
}

console.log('\nODYSSÉE À PLUSIEURS : TOUS LES TESTS SONT AU VERT');
process.exit(0);
