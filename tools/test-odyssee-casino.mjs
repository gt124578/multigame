// tools/test-odyssee-casino.mjs — Casino et Bourse de Métropole : règles des jeux (dont le Texas Hold'em) et pricers
import * as C from '../odyssee/js/core/casino.js';
import * as H from '../odyssee/js/core/holdem.js';
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

/* ---------- Texas Hold'em ---------- */
// évaluation sur 7 cartes : même classement que la meilleure des 21 mains de cinq cartes
{
  const brute = (cs) => { let b = null; for (let a = 0; a < 7; a++) for (let c = a + 1; c < 7; c++) { const f = C.forcePoker(cs.filter((_, i) => i !== a && i !== c)); if (!b || C.compare(f, b) > 0) b = f; } return b; };
  const r = C.rng(77); let mauvais = 0;
  const tirer = () => C.melanger(C.jeu52(), r).slice(0, 7);
  for (let k = 0; k < 4000; k++) {
    const a = tirer(), b = tirer(), fa = brute(a), fb = brute(b), sa = H.score(a), sb = H.score(b);
    if (H.categorie(sa) !== fa[0] || Math.sign(sa - sb) !== Math.sign(C.compare(fa, fb))) mauvais++;
  }
  ok(mauvais === 0, `score sur 7 cartes = meilleure main de 5 (${mauvais} écart(s))`);
  ok(H.nomScore(H.score(h('A♠ 2♥ 3♦ 4♣ 5♠ R♥ R♦'))) === 'Quinte', 'quinte à l\'as bas sur 7 cartes');
  ok(H.nomScore(H.score(h('9♠ 9♥ 9♦ 4♣ 4♠ 4♥ 2♦'))) === 'Full', 'deux brelans = full');
  ok(H.score(h('9♠ 9♥ 9♦ 4♣ 4♠ 4♥ 2♦')) > H.score(h('8♠ 8♥ 8♦ A♣ A♠ R♥ 2♦')), 'full aux 9 bat full aux 8');
  ok(H.nomScore(H.score(h('2♥ 7♥ 9♥ V♥ R♥ 10♠ 8♠'))) === 'Couleur', 'couleur plutôt que quinte');
  ok(H.nomScore(H.score(h('5♣ 6♣ 7♣ 8♣ 9♣ 10♦ V♦'))) === 'Quinte flush', 'quinte flush');
  ok(H.score(h('A♠ A♥ A♦ A♣ R♠ 2♥ 3♦')) > H.score(h('A♠ A♥ A♦ A♣ D♠ 2♥ 3♦')), 'carré : le kicker compte');
  ok(H.score(h('A♠ R♠ 4♦ 4♣ 9♥ 9♦ 2♠')) === H.score(h('A♦ R♣ 4♥ 4♠ 9♣ 9♠ 3♣')), 'double paire : 5e carte identique, égalité');
  ok(H.meilleures5(h('A♠ R♠ D♠ V♠ 10♠ 2♥ 3♦')).every((c) => c.s === '♠'), 'les cinq cartes de la main gagnante');
  ok(H.chen(h('A♠ A♥')) > H.chen(h('A♠ R♠')) && H.chen(h('A♠ R♠')) > H.chen(h('7♦ 2♣')), 'mains de départ classées');
}
// pots annexes : trois tapis de tailles différentes
{
  const t = H.creerTable({ joueurs: [{ nom: 'A', jetons: 20 }, { nom: 'B', jetons: 50 }, { nom: 'C', jetons: 100 }], petite: 1, grosse: 2, bouton: 2 });
  H.nouvelleMain(t, C.rng(3));
  // bouton = C ; petite blinde A, grosse blinde B : C parle en premier
  ok(t.courant === 2 && t.joueurs[0].mise === 1 && t.joueurs[1].mise === 2, 'blindes et parole avant le flop');
  ok(!H.agir(t, { type: 'parole' }), 'parole refusée face à une mise');
  ok(!H.agir(t, { type: 'relancer', montant: 3 }), 'relance trop petite refusée');
  ok(H.agir(t, { type: 'relancer', montant: 100 }), 'C fait tapis');
  ok(H.agir(t, { type: 'suivre' }) && t.joueurs[0].tapis, 'A suit pour son tapis');
  ok(H.agir(t, { type: 'suivre' }) && t.fini && t.board.length === 5, 'B suit : on retourne tout le board');
  const pots = t.resultats.pots;
  ok(pots.length === 3 && pots[0].montant === 60 && pots[1].montant === 60 && pots[2].montant === 50, `pots ${pots.map((p) => p.montant).join(' / ')} (60 / 60 / 50 rendus à C)`);
  ok(t.joueurs.reduce((a, p) => a + p.jetons, 0) === 170, 'jetons conservés');
}
// égalité : le board fait la main de tout le monde, le pot est partagé
{
  const t = H.creerTable({ joueurs: [{ nom: 'A', jetons: 50 }, { nom: 'B', jetons: 50 }, { nom: 'C', jetons: 51 }], bouton: 0 });
  H.nouvelleMain(t, C.rng(1));
  t.joueurs[0].main = h('2♣ 3♦'); t.joueurs[1].main = h('2♦ 3♣'); t.joueurs[2].main = h('2♥ 4♦');
  t.paquet = h('9♦ 10♠ 9♣ V♠ 9♥ D♠ 9♠ R♠ 8♥ A♠');   // dans l'ordre inverse : brûle, flop A R D, brûle, V, brûle, 10
  while (!t.fini) H.agir(t, H.actionsPossibles(t).parole ? { type: 'parole' } : { type: 'suivre' });
  ok(t.resultats.pots.length === 1 && t.resultats.pots[0].gagnants.length === 3 && t.joueurs.every((p) => p.jetons === 50 || p.jetons === 49 || p.jetons === 51), 'quinte flush royale au board : partage à trois');
  ok(t.joueurs.reduce((a, p) => a + p.jetons, 0) === 151, 'partage : le jeton impair n\'est pas perdu');
}
// des centaines de mains entre ordinateurs (et un joueur qui agit au hasard) : jamais d'action interdite, jetons conservés
{
  let interdites = 0, fuites = 0, abattages = 0, annexes = 0, partages = 0, mains = 0, coupes = 0, tapis = 0, relances = 0;
  for (let g = 1; g <= 12; g++) {
    const r = C.rng(g * 101), ra = C.rng(g * 7);
    const t = H.creerTable({ joueurs: [{ nom: 'Hasard', jetons: 120 }, ...[0, 1, 2].map((k) => ({ nom: 'IA' + k, jetons: 120, ia: true, style: { serre: k * 0.4, agressif: 0.8 - k * 0.3, bluff: 0.03 + 0.04 * k } }))] });
    const total = 480;
    for (let m = 0; m < 40; m++) {
      if (!H.nouvelleMain(t, r)) break;
      mains++;
      for (let guard = 0; !t.fini && guard < 200; guard++) {
        const i = t.courant, A = H.actionsPossibles(t);
        let a;
        if (i === 0) {
          const x = ra();
          a = x < 0.15 ? { type: 'coucher' } : x < 0.6 ? { type: A.parole ? 'parole' : 'suivre' } : A.relance ? { type: 'relancer', montant: A.relance.min + Math.floor(ra() * (A.relance.max - A.relance.min + 1)) } : { type: A.parole ? 'parole' : 'suivre' };
        } else a = H.decisionIA(t, i, r);
        if (a.type === 'relancer') relances++;
        if (!H.agir(t, a)) { interdites++; H.agir(t, { type: 'coucher' }); }
        if (t.joueurs.reduce((s, p) => s + p.jetons + p.engage, 0) !== total && !t.fini) fuites++;
      }
      if (!t.fini) interdites++;
      if (t.joueurs.reduce((s, p) => s + p.jetons, 0) !== total) fuites++;
      if (t.resultats.abattage) abattages++; else coupes++;
      if (t.resultats.pots.length > 1) annexes++;
      if (t.resultats.pots.some((p) => p.gagnants.length > 1)) partages++;
      if (t.joueurs.some((p) => p.tapis)) tapis++;
      // un joueur ruiné revient avec une nouvelle cave (les jetons totaux ne bougent pas : on lui prend chez le plus riche)
      for (const p of t.joueurs) if (p.jetons === 0) { const riche = t.joueurs.reduce((a, b) => (b.jetons > a.jetons ? b : a)); const n = Math.min(60, Math.floor(riche.jetons / 2)); riche.jetons -= n; p.jetons += n; }
    }
  }
  ok(interdites === 0, `aucune action interdite des ordinateurs (${interdites})`);
  ok(fuites === 0, `jetons conservés à chaque action (${fuites} fuite(s))`);
  ok(abattages > 20 && coupes > 20, `mains jouées : ${mains}, abattages ${abattages}, gagnées sans abattage ${coupes}`);
  ok(tapis > 3 && annexes > 0, `tapis (${tapis}) et pots annexes (${annexes}) rencontrés`);
  console.log(`  Hold'em : ${mains} mains, ${abattages} abattages, ${annexes} pots annexes, ${partages} partages, ${relances} relances`);
}
// l'ordinateur ne se couche pas avec les meilleures mains et suit rarement avec rien
{
  const t = H.creerTable({ joueurs: [{ nom: 'A', jetons: 200 }, { nom: 'B', jetons: 200, ia: true, style: { serre: 0.5, agressif: 0.5, bluff: 0 } }], bouton: 0 });
  let couchesAs = 0, suitsRien = 0;
  for (let k = 0; k < 40; k++) {
    for (const p of t.joueurs) p.jetons = 200;
    t.mains = 0; t.bouton = 0;   // à deux : le bouton (A) parle en premier
    H.nouvelleMain(t, C.rng(k + 5));
    t.joueurs[1].main = k % 2 ? h('A♠ A♥') : h('7♦ 2♣');
    H.agir(t, { type: 'relancer', montant: 30 });
    const a = H.decisionIA(t, 1, C.rng(k));
    if (k % 2 && a.type === 'coucher') couchesAs++;
    if (!(k % 2) && a.type !== 'coucher') suitsRien++;
  }
  ok(couchesAs === 0, 'l\'ordinateur ne jette jamais une paire d\'as');
  ok(suitsRien <= 4, `7-2 face à une grosse relance : presque toujours couché (${suitsRien} / 20 suivis)`);
}
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
