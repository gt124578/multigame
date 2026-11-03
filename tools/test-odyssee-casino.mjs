// tools/test-odyssee-casino.mjs — Casino et Bourse de Métropole : règles des jeux et pricers
import * as C from '../odyssee/js/core/casino.js';
import * as B from '../odyssee/js/core/bourse.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };
const near = (a, b, e) => Math.abs(a - b) <= e;

// poker : catégories et départages
const h = (s) => s.split(' ').map((t) => ({ r: { A: 14, R: 13, D: 12, V: 11 }[t.slice(0, -1)] || +t.slice(0, -1), s: t.slice(-1) }));
ok(C.nomMain(C.forcePoker(h('A♠ R♠ D♠ V♠ 10♠'))) === 'Quinte flush', 'quinte flush royale');
ok(C.nomMain(C.forcePoker(h('A♠ 2♥ 3♦ 4♣ 5♠'))) === 'Quinte', 'quinte blanche (as bas)');
ok(C.nomMain(C.forcePoker(h('9♠ 9♥ 9♦ 4♣ 4♠'))) === 'Full', 'full');
ok(C.compare(C.forcePoker(h('9♠ 9♥ 2♦ 4♣ 5♠')), C.forcePoker(h('9♣ 9♦ 2♣ 4♦ 6♠'))) < 0, 'paire de 9 : le kicker 6 bat le 5');
ok(C.compare(C.forcePoker(h('2♠ 2♥ 3♦ 3♣ 5♠')), C.forcePoker(h('A♣ A♦ 2♣ 4♦ 6♠'))) > 0, 'double paire bat paire');
ok(C.garderPoker(h('9♠ 9♥ 2♦ 4♣ 5♠')).length === 2, 'on garde sa paire');
// blackjack
ok(C.totalBJ(h('A♠ A♥ 9♦')).t === 21, 'as souples');
{ let gains = 0, mises = 0; for (let i = 0; i < 3000; i++) { const p = C.donneBJ(C.rng(i + 1), 10); mises += 10; while (C.totalBJ(p.joueur).t < 17 && !p.fini) C.tirerBJ(p); if (!p.fini) C.finirBJ(p); gains += p.rendu; } ok(gains / mises > 0.85 && gains / mises < 1.02, `blackjack : retour ${(gains / mises).toFixed(3)} (avantage au croupier, raisonnable)`); }
// roulette : espérance de -1/37
{ const r = C.rng(5); let g = 0; for (let i = 0; i < 37000; i++) g += C.gainRoulette([{ type: 'rouge', mise: 1 }], C.tirerRoulette(r)); ok(near(g / 37000, 36 / 37, 0.03), 'roulette : rouge rend ~97,3 %'); }
// machine à sous : retour inférieur à la mise
{ const r = C.rng(9); let g = 0; for (let i = 0; i < 50000; i++) g += C.gainMachine(C.tirerRouleaux(r), 1); ok(g / 50000 > 0.6 && g / 50000 < 1, `machine : retour ${(g / 50000).toFixed(3)}`); }
// belote : des donnes entières entre ordinateurs, règles respectées, 162 points par donne
{
  let donnes = 0;
  for (let s = 1; s <= 200; s++) {
    const r = C.rng(s), d = C.donneBelote(r, s % 4);
    let preneur = -1, atout = null;
    for (let k = 0; k < 4 && preneur < 0; k++) { const j = (d.donneur + 1 + k) % 4; if (C.evalPrise(d.mains[j], d.retournee.s, d.retournee) >= C.SEUIL_PRISE) { preneur = j; atout = d.retournee.s; } }
    for (let k = 0; k < 4 && preneur < 0; k++) { const j = (d.donneur + 1 + k) % 4; for (const c of C.COULEURS) if (c !== d.retournee.s && C.evalPrise(d.mains[j], c) >= C.SEUIL_PRISE + 6) { preneur = j; atout = c; break; } }
    if (preneur < 0) continue;
    C.distribuerReste(d, preneur, atout);
    ok(d.mains.every((m) => m.length === 8), 'huit cartes chacun après la prise');
    for (let t = 0; t < 8; t++) for (let k = 0; k < 4; k++) {
      const j = (d.entame + k) % 4, c = C.choixIA(d, j);
      ok(C.jouables(d.mains[j], d.pli, d.atout, j).some((x) => x.r === c.r && x.s === c.s), 'carte jouable');
      C.jouerCarte(d, j, c);
    }
    const res = C.compterBelote(d), tot = res.pts[0] + res.pts[1];
    ok(res.capot || res.dedans || tot === 162 || tot === 182, `donne ${s} : ${tot} points`);
    donnes++;
  }
  ok(donnes > 40, `assez de donnes jouées (${donnes})`);
}
// Bourse : pricers de référence
ok(near(B.blackScholes('call', 100, 100, 1, 0.05, 0.2), 10.4506, 1e-3), 'Black-Scholes call');
ok(near(B.americaine('put', 100, 100, 1, 0.05, 0.2), 6.09, 0.02), 'put américain (arbre)');
ok(B.americaine('put', 100, 100, 1, 0.05, 0.2) >= B.blackScholes('put', 100, 100, 1, 0.05, 0.2), 'américain ≥ européen');
ok(B.asiatique('call', 100, 100, 1, 0.05, 0.2) < B.blackScholes('call', 100, 100, 1, 0.05, 0.2), 'asiatique < européen');
ok(near(B.forward(100, 0.05, 1, 0.02), 100 * Math.exp(0.03), 1e-9), 'forward avec dividende');
{ const m = B.nouveauMarche(3); for (let i = 0; i < 1500; i++) B.seance(m); ok(Object.values(m.prix).every((p) => p > 0.01 && p < 1e5 && Number.isFinite(p)), 'cours raisonnables après 1500 séances');
  const qs = B.entretien(m, 11); ok(qs.length === 8 && qs.every((q) => q.choix.length === 4 && q.bonne >= 0 && q.bonne < 4), 'entretien : 8 questions à 4 réponses');
  const o = B.ordre(m, 'SYL', 3, 1e6); ok(o.ok && m.positions.SYL.qte === 3, 'achat'); const v = B.ordre(m, 'SYL', -3, 1e6); ok(v.ok && !m.positions.SYL, 'vente'); }
console.log(fails ? `${fails} échec(s)` : 'Casino et Bourse : OK');
process.exit(fails ? 1 : 0);
