// odyssee/js/ui/metropole.js — écrans de Métropole : le Casino (machine à sous, blackjack, poker fermé, roulette,
// belote) et la Bourse (cotations, nouvelles, ordres, entretien d'embauche avec Pierre).
import { el, esc, wait } from './ui.js';
import * as C from '../core/casino.js';
import * as B from '../core/bourse.js';
import { itemName } from '../core/items.js';

const fr = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
function table(ui, cls, title) {
  const s = el('div', 'screen metro ' + cls);
  s.innerHTML = `<div class="scr-title">${esc(title)}</div><div class="metro-board"></div><div class="metro-msg box"></div>`;
  ui.root.appendChild(s);
  return { s, board: s.querySelector('.metro-board'), msg: (t) => { s.querySelector('.metro-msg').innerHTML = t; }, close: () => s.remove() };
}
const carteHtml = (c, cache = false, nom = C.nomCarte, extra = '') => (cache ? `<span class="carte dos ${extra}"></span>`
  : `<span class="carte ${C.rouge(c) ? 'r' : ''} ${extra}"><b>${esc(nom(c).slice(0, -1))}</b><i>${c.s}</i></span>`);

/* ============================== CASINO ============================== */
export const PRIX_JETON = 20;
const LOTS = [
  { k: 'rare-candy', jetons: 120 }, { k: 'ultra-ball', jetons: 40 }, { k: 'max-potion', jetons: 60 }, { k: 'full-restore', jetons: 90 },
  { k: 'moon-stone', jetons: 150 }, { k: 'fire-stone', jetons: 150 }, { k: 'water-stone', jetons: 150 }, { k: 'thunder-stone', jetons: 150 }, { k: 'leaf-stone', jetons: 150 },
];
const r0 = () => C.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);

/** comptoir du casino : achat de jetons, choix d'une table, échange contre des lots */
export async function casinoScreen(game, quoi = null) {
  const ui = game.ui, st = game.state;
  st.jetons ??= 0;
  const jeux = { machine: machineASous, blackjack: blackjackTable, poker: pokerTable, roulette: rouletteTable, belote: beloteTable };
  if (quoi && jeux[quoi]) { if (st.jetons <= 0) { await ui.say('Il te faut des jetons : le comptoir est à l\'entrée.'); return; } await jeux[quoi](game); return; }
  for (;;) {
    const items = [
      { label: `Acheter des jetons (${PRIX_JETON} ₽ pièce)`, right: `${fr(st.jetons)} jetons` },
      { label: 'Échanger des jetons contre des lots' },
      { label: 'Partir' },
    ];
    const k = await ui.list({ title: `CASINO DE MÉTROPOLE — ${fr(st.money)} ₽`, items, cls: 'shop', cancel: 2 });
    if (k === 0) {
      const max = Math.min(999, Math.floor(st.money / PRIX_JETON));
      if (!max) { await ui.say('Tu n\'as pas assez de Pokédollars.'); continue; }
      const choix = [10, 50, 100, 500].filter((n) => n <= max);
      const c = await ui.list({ title: 'Combien de jetons ?', items: choix.map((n) => ({ label: `${n} jetons`, right: `${fr(n * PRIX_JETON)} ₽` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: choix.length });
      if (c < 0 || c >= choix.length) continue;
      st.money -= choix[c] * PRIX_JETON; st.jetons += choix[c]; ui.sound.sfx('buy');
    } else if (k === 1) {
      const c = await ui.list({ title: `Lots — ${fr(st.jetons)} jetons`, items: LOTS.map((l) => ({ label: itemName(l.k), right: `${l.jetons} jetons`, disabled: st.jetons < l.jetons })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: LOTS.length });
      if (c < 0 || c >= LOTS.length) continue;
      st.jetons -= LOTS[c].jetons; game.give(LOTS[c].k, 1); ui.sound.sfx('item');
      await ui.say(formatObtainItem(st.name, LOTS[c].k, 1));
    } else return;
  }
}
async function choisirMise(ui, st, choix, titre = 'Mise') {
  const ok = choix.filter((n) => n <= st.jetons);
  if (!ok.length) { await ui.say('Tu n\'as plus de jetons.'); return 0; }
  const c = await ui.list({ title: `${titre} — ${fr(st.jetons)} jetons`, items: ok.map((n) => ({ label: `${n} jeton${n > 1 ? 's' : ''}` })).concat([{ label: 'Quitter la table' }]), cls: 'shop', cancel: ok.length });
  return c >= 0 && c < ok.length ? ok[c] : 0;
}

/* ---------- machine à sous ---------- */
async function machineASous(game) {
  const ui = game.ui, st = game.state, T = table(ui, 'slots', 'MACHINE À SOUS');
  const draw = (rou, gain) => { T.board.innerHTML = `<div class="rouleaux">${rou.map((s) => `<span class="rouleau s-${esc(s.replace(/\s/g, ''))}">${esc(s)}</span>`).join('')}</div><div class="gains">${C.TABLE_MACHINE.map(esc).join(' · ')}</div>${gain != null ? `<div class="res">${gain ? `Gagné : ${gain} jetons !` : 'Perdu…'}</div>` : ''}`; };
  draw(['7', '7', '7']); T.msg(`Jetons : <b>${fr(st.jetons)}</b>`);
  for (;;) {
    const mise = await choisirMise(ui, st, [1, 2, 3, 5]); if (!mise) break;
    st.jetons -= mise; const r = r0(), fin = C.tirerRouleaux(r);
    for (let i = 0; i < 14; i++) { draw([0, 1, 2].map((k) => (i > 6 + k * 3 ? fin[k] : C.SYMBOLES[Math.floor(Math.random() * C.SYMBOLES.length)]))); ui.sound.sfx('blip'); await wait(70); }
    const g = C.gainMachine(fin, mise); st.jetons += g; draw(fin, g); if (g) ui.sound.sfx(g >= 30 * mise ? 'levelup' : 'item');
    T.msg(`Jetons : <b>${fr(st.jetons)}</b>`);
  }
  T.close();
}

/* ---------- blackjack ---------- */
async function blackjackTable(game) {
  const ui = game.ui, st = game.state, T = table(ui, 'bj', 'BLACKJACK');
  const draw = (p, cache) => {
    const tj = C.totalBJ(p.joueur).t, tc = C.totalBJ(cache ? [p.croupier[0]] : p.croupier).t;
    T.board.innerHTML = `<div class="main-bj"><div class="who">Croupier ${cache ? '' : `(${tc})`}</div>${p.croupier.map((c, i) => carteHtml(c, cache && i === 1)).join('')}</div>
      <div class="main-bj"><div class="who">${esc(st.name)} (${tj}) — mise ${p.mise}</div>${p.joueur.map((c) => carteHtml(c)).join('')}</div>${p.fini ? `<div class="res">${esc(p.resultat)}</div>` : ''}`;
  };
  T.msg('Le croupier reste sur 17. Le blackjack paie 3 contre 2.');
  for (;;) {
    const mise = await choisirMise(ui, st, [1, 5, 10, 25, 50]); if (!mise) break;
    st.jetons -= mise; const p = C.donneBJ(r0(), mise);
    if (C.blackjack(p.joueur) || C.blackjack(p.croupier)) C.finirBJ(p);
    while (!p.fini) {
      draw(p, true);
      const peutDoubler = p.joueur.length === 2 && st.jetons >= mise;
      const acts = ['Tirer', 'Rester'].concat(peutDoubler ? ['Doubler'] : []);
      const a = await ui.list({ items: acts.map((label) => ({ label })), cls: 'choice metro-act', cancel: null, parent: T.s });
      if (a === 0) { C.tirerBJ(p); ui.sound.sfx('blip'); } else if (a === 1) C.finirBJ(p); else { st.jetons -= mise; C.doublerBJ(p); }
    }
    st.jetons += p.rendu; draw(p, false); ui.sound.sfx(p.rendu > p.mise ? 'item' : p.rendu ? 'blip' : 'bump');
    T.msg(`Jetons : <b>${fr(st.jetons)}</b>`);
  }
  T.close();
}

/* ---------- roulette ---------- */
async function rouletteTable(game) {
  const ui = game.ui, st = game.state, T = table(ui, 'roul', 'ROULETTE');
  let dernier = null;
  const draw = (paris, n) => {
    const coul = (x) => (x === 0 ? 'v' : C.ROUGES.has(x) ? 'r' : 'n');
    T.board.innerHTML = `<div class="tapis">${Array.from({ length: 37 }, (_, x) => `<span class="case ${coul(x)} ${x === n ? 'on' : ''}">${x}</span>`).join('')}</div>
      <div class="paris">${paris.length ? paris.map((p) => `${esc(C.PARIS[p.type].nom)}${p.v != null ? ' ' + p.v : ''} : ${p.mise}`).join(' · ') : 'Aucun pari'}</div>${n != null ? `<div class="res">Le ${n} ${n === 0 ? '(zéro)' : C.ROUGES.has(n) ? 'rouge' : 'noir'} !</div>` : ''}`;
  };
  for (;;) {
    const paris = []; draw(paris, dernier); T.msg(`Jetons : <b>${fr(st.jetons)}</b> — rouge, noir, pair, impair, manque, passe : ×2 · douzaine, colonne : ×3 · plein : ×36`);
    for (;;) {
      const types = Object.keys(C.PARIS);
      const items = types.map((t) => ({ label: C.PARIS[t].nom })).concat([{ label: paris.length ? 'Lancer la bille' : 'Quitter la table' }]);
      const k = await ui.list({ title: 'Faites vos jeux', items, cls: 'shop', cancel: types.length, parent: T.s });
      if (k < 0 || k === types.length) break;
      const type = types[k]; let v = null;
      if (type === 'plein') { const c = await ui.list({ title: 'Quel numéro ?', items: Array.from({ length: 37 }, (_, x) => ({ label: String(x) })), cls: 'shop numeros', cancel: -1, parent: T.s }); if (c < 0) continue; v = c; }
      if (type === 'douzaine' || type === 'colonne') { const c = await ui.list({ title: type === 'douzaine' ? 'Quelle douzaine ?' : 'Quelle colonne ?', items: [1, 2, 3].map((x) => ({ label: type === 'douzaine' ? `${x}ʳᵉ (${x * 12 - 11} à ${x * 12})` : `Colonne ${x}` })), cls: 'shop', cancel: -1, parent: T.s }); if (c < 0) continue; v = c + 1; }
      const mise = await choisirMise(ui, st, [1, 5, 10, 25, 50], 'Mise sur ce pari'); if (!mise) continue;
      st.jetons -= mise; paris.push({ type, v, mise }); draw(paris, dernier); ui.sound.sfx('blip');
    }
    if (!paris.length) break;
    const n = C.tirerRoulette(r0());
    for (let i = 0; i < 18; i++) { draw(paris, i === 17 ? n : Math.floor(Math.random() * 37)); await wait(40 + i * 8); }
    const g = C.gainRoulette(paris, n); st.jetons += g; dernier = n; draw(paris, n);
    ui.sound.sfx(g ? 'item' : 'bump'); await ui.say(g ? `Le ${n} ! Tu gagnes ${g} jetons.` : `Le ${n}… Rien pour cette fois.`);
  }
  T.close();
}

/* ---------- poker fermé ---------- */
const ADVERSAIRES = ['Gérard', 'Mimi', 'Le Baron'];
async function pokerTable(game) {
  const ui = game.ui, st = game.state, T = table(ui, 'poker', 'POKER FERMÉ');
  T.msg('Cinq cartes, un échange. Mise de 2 jetons avant l\'échange, 4 après, trois relances au plus. Ante : 1 jeton.');
  for (;;) {
    if (st.jetons < 1) { await ui.say('Il faut au moins un jeton pour l\'ante.'); break; }
    if ((await ui.ask('Une main de poker ?', ['Distribuer', 'Quitter la table'], { keep: false })) !== 0) break;
    st.jetons -= 1; const r = r0(), p = C.nouvellePartiePoker(r, 4); let montrer = false, sel = new Set();
    const draw = () => {
      T.board.innerHTML = [1, 2, 3].map((i) => `<div class="main-pk ${p.couche[i] ? 'out' : ''}"><div class="who">${ADVERSAIRES[i - 1]}${p.couche[i] ? ' (couché)' : ''}</div>${p.mains[i].map((c) => carteHtml(c, !montrer)).join('')}${montrer && !p.couche[i] ? `<em>${C.nomMain(C.forcePoker(p.mains[i]))}</em>` : ''}</div>`).join('')
        + `<div class="pot">Pot : ${p.pot} jetons</div><div class="main-pk moi"><div class="who">${esc(st.name)} — ${fr(st.jetons)} jetons</div>${p.mains[0].map((c, k) => carteHtml(c, false, C.nomCarte, sel.has(k) ? 'jete' : '')).join('')}<em>${C.nomMain(C.forcePoker(p.mains[0]))}</em></div>`;
    };
    const tourDeMise = async (taille) => {
      const contrib = [0, 0, 0, 0]; let niveau = 0, relances = 0;
      const actifs = () => [0, 1, 2, 3].filter((i) => !p.couche[i]);
      const aParle = new Set();
      for (let guard = 0; guard < 40; guard++) {
        if (actifs().length < 2) return;
        const qui = [0, 1, 2, 3].find((i) => !p.couche[i] && (!aParle.has(i) || contrib[i] < niveau));
        if (qui == null) return;
        const aSuivre = niveau - contrib[qui];
        let act;
        if (qui === 0) {
          draw();
          const opts = aSuivre ? [`Suivre (${aSuivre})`, ...(relances < 3 && st.jetons >= aSuivre + taille ? [`Relancer (+${taille})`] : []), 'Se coucher'] : ['Parole', ...(relances < 3 && st.jetons >= taille ? [`Miser (${taille})`] : []), 'Se coucher'];
          const k = await ui.list({ items: opts.map((label) => ({ label })), cls: 'choice metro-act', cancel: null, parent: T.s });
          act = opts[k].startsWith('Se') ? 'coucher' : opts[k].startsWith('Rel') || opts[k].startsWith('Mis') ? 'relancer' : 'suivre';
          if (act === 'suivre' && aSuivre > st.jetons) act = 'coucher';
        } else {
          act = C.decisionIA(p.mains[qui], p.tour, aSuivre, p.r);
          if (act === 'relancer' && relances >= 3) act = 'suivre';
          await wait(350);
        }
        if (act === 'coucher') { p.couche[qui] = true; if (qui) T.msg(`${ADVERSAIRES[qui - 1]} se couche.`); }
        else {
          const add = aSuivre + (act === 'relancer' ? taille : 0);
          if (act === 'relancer') { niveau += taille; relances++; if (qui) T.msg(`${ADVERSAIRES[qui - 1]} relance de ${taille}.`); }
          else if (qui) T.msg(`${ADVERSAIRES[qui - 1]} ${aSuivre ? 'suit' : 'parle'}.`);
          contrib[qui] += add; p.pot += add; if (qui === 0) st.jetons -= add;
        }
        aParle.add(qui); draw();
      }
    };
    draw();
    await tourDeMise(2);
    if (!p.couche[0] && [1, 2, 3].some((i) => !p.couche[i])) {
      // échange : on choisit les cartes à jeter
      sel = new Set(); draw();
      const garde = await new Promise((resolve) => {
        let i = 0;
        const items = () => p.mains[0].map((c, k) => ({ label: `${C.nomCarte(c)} — ${sel.has(k) ? 'à jeter' : 'gardée'}` })).concat([{ label: `Échanger ${sel.size} carte(s)` }]);
        const go = async () => {
          const k = await ui.list({ title: 'Échange (3 cartes au plus, 4 avec un as)', items: items(), cls: 'shop', cancel: null, start: i, parent: T.s });
          if (k === 5) { resolve([0, 1, 2, 3, 4].filter((x) => !sel.has(x))); return; }
          const max = p.mains[0].some((c, x) => c.r === 14 && !sel.has(x)) ? 4 : 3;
          if (sel.has(k)) sel.delete(k); else if (sel.size < max) sel.add(k);
          i = k; draw(); go();
        };
        go();
      });
      C.echangerPoker(p, 0, garde); sel = new Set();
      for (const i of [1, 2, 3]) if (!p.couche[i]) { const g = C.garderPoker(p.mains[i]); C.echangerPoker(p, i, g); T.msg(`${ADVERSAIRES[i - 1]} prend ${5 - g.length} carte(s).`); draw(); await wait(450); }
      p.tour = 2; await tourDeMise(4);
    }
    montrer = true; draw();
    const { gagnants, force } = C.abattage(p);
    const part = Math.floor(p.pot / gagnants.length);
    if (gagnants.includes(0)) { st.jetons += part; ui.sound.sfx('item'); }
    await ui.say(gagnants.length > 1 ? `Partage du pot (${C.nomMain(force)}).` : gagnants[0] === 0 ? `Tu remportes ${p.pot} jetons avec : ${C.nomMain(force)} !` : `${ADVERSAIRES[gagnants[0] - 1]} remporte le pot avec : ${C.nomMain(force)}.`);
  }
  T.close();
}

/* ---------- belote ---------- */
const NOMS_B = ['Toi', 'Le Marquis', 'Mamie Rose', 'Fernand'];
async function beloteTable(game) {
  const ui = game.ui, st = game.state, T = table(ui, 'belote', 'BELOTE');
  NOMS_B[0] = st.name;
  T.msg('Belote classique : toi et Mamie Rose contre le Marquis et Fernand. La première équipe à 501 points gagne.');
  const mise = await choisirMise(ui, st, [10, 25, 50, 100], 'Mise de la partie (×2 si tu gagnes)'); if (!mise) { T.close(); return; }
  st.jetons -= mise;
  const score = [0, 0]; let donneur = 3, r = r0();
  const draw = (d, info = '') => {
    const pos = ['sud', 'ouest', 'nord', 'est'];
    const pli = d.pli.map((x) => `<div class="pli-${pos[x.j]}">${carteHtml(x.c, false, C.nomBelote)}</div>`).join('');
    T.board.innerHTML = `<div class="score">Nous : ${score[0]} · Eux : ${score[1]}${d.atout ? ` · Atout ${d.atout} (pris par ${esc(NOMS_B[d.preneur])})` : ''}</div>
      ${[1, 2, 3].map((j) => `<div class="joueur-${pos[j]}"><span class="who">${esc(NOMS_B[j])}</span> ${'<span class="carte dos mini"></span>'.repeat(d.mains[j].length)}</div>`).join('')}
      <div class="tapis-b">${pli}${!d.atout && d.retournee ? `<div class="retournee">${carteHtml(d.retournee, false, C.nomBelote)}</div>` : ''}</div>
      <div class="main-b">${d.mains[0].slice().sort((a, b) => a.s.localeCompare(b.s) || a.r - b.r).map((c) => carteHtml(c, false, C.nomBelote)).join('')}</div>${info ? `<div class="res">${esc(info)}</div>` : ''}`;
  };
  while (score[0] < 501 && score[1] < 501) {
    donneur = (donneur + 1) % 4; const d = C.donneBelote(r, donneur); draw(d);
    // enchères : premier tour à la couleur retournée, second tour à une autre couleur
    let preneur = -1, atout = null;
    for (let tour = 1; tour <= 2 && preneur < 0; tour++) for (let k = 0; k < 4 && preneur < 0; k++) {
      const j = (donneur + 1 + k) % 4;
      if (j === 0) {
        draw(d, tour === 1 ? `Prends-tu à ${C.NOM_COULEUR[d.retournee.s]} ?` : 'Second tour : choisis une autre couleur ou passe.');
        const opts = tour === 1 ? [`Je prends (${d.retournee.s})`, 'Je passe'] : C.COULEURS.filter((c) => c !== d.retournee.s).map((c) => `À ${C.NOM_COULEUR[c]} (${c})`).concat(['Je passe']);
        const c = await ui.list({ items: opts.map((label) => ({ label })), cls: 'choice metro-act', cancel: null, parent: T.s });
        if (c < opts.length - 1) { preneur = 0; atout = tour === 1 ? d.retournee.s : C.COULEURS.filter((x) => x !== d.retournee.s)[c]; }
      } else {
        await wait(300);
        if (tour === 1 && C.evalPrise(d.mains[j], d.retournee.s, d.retournee) >= C.SEUIL_PRISE) { preneur = j; atout = d.retournee.s; }
        if (tour === 2) for (const c of C.COULEURS) if (c !== d.retournee.s && C.evalPrise(d.mains[j], c) >= C.SEUIL_PRISE + 6) { preneur = j; atout = c; break; }
        if (preneur < 0) T.msg(`${NOMS_B[j]} passe.`);
      }
    }
    if (preneur < 0) { await ui.say('Tout le monde passe : on redistribue.'); continue; }
    T.msg(`${NOMS_B[preneur]} prend à ${C.NOM_COULEUR[atout]}.`);
    C.distribuerReste(d, preneur, atout); draw(d);
    for (let t = 0; t < 8; t++) {
      for (let k = 0; k < 4; k++) {
        const j = (d.entame + k) % 4; let c;
        if (j === 0) {
          const L = C.jouables(d.mains[0], d.pli, d.atout, 0), main = d.mains[0].slice().sort((a, b) => a.s.localeCompare(b.s) || a.r - b.r);
          draw(d);
          const ok = (x) => L.some((y) => y.r === x.r && y.s === x.s);
          const n = await ui.list({ title: 'Quelle carte ?', items: main.map((x) => ({ html: carteHtml(x, false, C.nomBelote), disabled: !ok(x) })), cls: 'shop cartes-b', cancel: null, start: Math.max(0, main.findIndex(ok)), parent: T.s });
          c = main[n];
        } else { await wait(380); c = C.choixIA(d, j); }
        const belote = d.belote === j && c.s === d.atout && (c.r === 12 || c.r === 13);
        const g = C.jouerCarte(d, j, c); draw(d);
        if (belote) T.msg(`${NOMS_B[j]} : « ${d.mains[j].some((x) => x.s === d.atout && (x.r === 12 || x.r === 13)) ? 'Belote' : 'Rebelote'} ! »`);
        if (g != null) { await wait(600); T.msg(`${NOMS_B[g]} remporte le pli.`); }
      }
    }
    const res = C.compterBelote(d); score[0] += res.pts[0]; score[1] += res.pts[1];
    draw(d, `Donne : nous ${res.pts[0]}, eux ${res.pts[1]}${res.dedans ? ' — le preneur est dedans !' : ''}${res.capot ? ' — capot !' : ''}`);
    await ui.say(`Score : nous ${score[0]}, eux ${score[1]}.`);
  }
  const gagne = score[0] > score[1];
  if (gagne) { st.jetons += mise * 2; ui.sound.sfx('levelup'); }
  await ui.say(gagne ? `Partie gagnée ! Tu remportes ${mise * 2} jetons.` : 'Partie perdue… Mamie Rose te console d\'une tape sur l\'épaule.');
  T.close();
}

/* ============================== BOURSE ============================== */
/** marché de la partie : créé au premier passage, rattrapé selon le temps de jeu écoulé */
export function marche(game) {
  const st = game.state;
  if (!st.bourse) { st.bourse = B.nouveauMarche((st.id || 1) * 97 + 13); for (let i = 0; i < 60; i++) B.seance(st.bourse); }   // un marché qui a déjà vécu
  const m = st.bourse, now = (st.time || 0) * 1000;   // temps de jeu (secondes → ms)
  if (m.vu != null && now > m.vu) B.rattraper(m, now - m.vu);
  m.vu = now;
  return m;
}
function spark(h) {
  if (!h || h.length < 2) return '';
  const lo = Math.min(...h), hi = Math.max(...h), w = 90, ht = 22;
  const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(ht - (v - lo) / (hi - lo || 1) * ht).toFixed(1)}`).join(' ');
  return `<svg class="spark ${h[h.length - 1] >= h[0] ? 'up' : 'dn'}" viewBox="0 0 ${w} ${ht}"><polyline points="${pts}"/></svg>`;
}
/** terminal de cotations : liste des actifs (cours, variation, petite courbe), nouvelles, portefeuille ; ordres si embauché */
export async function bourseScreen(game) {
  const ui = game.ui, st = game.state, m = marche(game);
  const T = table(ui, 'bourse', 'BOURSE DE MÉTROPOLE');
  const ids = [B.INDICE.id, ...B.ACTIFS.map((a) => a.id)];
  const nom = (id) => (id === B.INDICE.id ? 'Tracker S&P Odyssée 500' : B.ACTIF[id].nom);
  const var_ = (id) => { const h = id === B.INDICE.id ? m.hist[id] : m.hist[id]; const a = h[Math.max(0, h.length - 21)], b = h[h.length - 1]; return (b / a - 1) * 100; };
  const draw = (sel) => {
    const v = B.valeur(m);
    T.board.innerHTML = `<div class="cotes">${ids.map((id) => { const vv = var_(id); return `<div class="cote ${id === sel ? 'on' : ''}"><span class="tick">${id}</span><span class="nm">${esc(nom(id))}</span><span class="px">${fr(B.prixDe(m, id), id === 'PDE' ? 4 : 2)}</span><span class="var ${vv >= 0 ? 'up' : 'dn'}">${vv >= 0 ? '+' : ''}${fr(vv, 1)} %</span>${spark(m.hist[id].slice(-40))}<span class="pos">${m.positions[id] ? '×' + m.positions[id].qte : ''}</span></div>`; }).join('')}</div>
      <div class="side"><div class="indice">S&P Odyssée 500 : <b>${fr(B.indice(m), 0)}</b> pts · 1 € = ${fr(m.prix.PDE, 4)} ₽</div>
      <div class="news"><b>Dernières nouvelles</b>${m.nouvelles.slice(0, 6).map((n) => `<p>${esc(n.texte)}</p>`).join('') || '<p>Rien de neuf.</p>'}</div>
      <div class="ptf">Portefeuille : <b>${fr(v.valeur)} ₽</b> · plus-value latente <b class="${v.plusValue >= 0 ? 'up' : 'dn'}">${v.plusValue >= 0 ? '+' : ''}${fr(v.plusValue)} ₽</b><br>Liquidités : ${fr(st.money)} ₽${m.embauche ? '' : '<br><i>Pierre ne t\'a pas encore ouvert de compte : tu peux seulement regarder.</i>'}</div></div>`;
  };
  T.msg('Haut / bas : choisir un titre · A : passer un ordre · B : quitter. Les cours bougent à chaque séance (30 secondes de jeu).');
  let i = 0; draw(ids[0]);
  const tick = setInterval(() => { B.seance(m); m.vu = (m.vu || 0) + B.SEANCE_MS; draw(ids[i]); }, 4000);
  for (;;) {
    const k = await new Promise((resolve) => {
      const pop = ui.input.push((key) => {
        if (key === 'up') { i = (i - 1 + ids.length) % ids.length; draw(ids[i]); ui.sound.sfx('blip'); }
        else if (key === 'down') { i = (i + 1) % ids.length; draw(ids[i]); ui.sound.sfx('blip'); }
        else if (key === 'a' || key === 'b') { pop(); resolve(key); }
      });
    });
    if (k === 'b') break;
    const id = ids[i], a = B.ACTIF[id];
    const info = id === B.INDICE.id ? 'Un panier des dix actions de la cote, pondéré par leur taille (1/10e de point d\'indice).' : `${a.desc || a.unite ? (a.desc || 'Cours pour ' + a.unite) : ''}${a.secteur ? ' Secteur : ' + B.SECTEURS[a.secteur] + '.' : ''}`;
    const pos = m.positions[id]?.qte || 0, px = B.prixDe(m, id);
    const c = await ui.list({ title: `${nom(id)} — ${fr(px, 2)} ₽${pos ? ` (tu en as ${pos})` : ''}`, items: [{ label: 'Acheter', disabled: !m.embauche }, { label: 'Vendre', disabled: !pos || !m.embauche }, { label: 'Pricer : dérivés sur ce titre' }, { label: 'Fiche' }, { label: 'Retour' }], cls: 'shop', cancel: 4, parent: T.s });
    if (c === 3) { await ui.say([`${nom(id)} : ${info}`, ...(m.embauche ? [] : ['Pour acheter et vendre, il faut un compte : va voir Pierre, au fond de la Bourse.'])]); continue; }
    if (c === 2) { await ui.list({ title: `Pricer — ${nom(id)}`, items: pricer(m, id).map(([label, right]) => ({ label, right })), cls: 'shop quiz', cancel: 0, parent: T.s }); continue; }
    if (c === 0) {
      const max = Math.min(99, Math.floor(st.money / (px * 1.002)));
      if (!max) { await ui.say('Pas assez de Pokédollars.'); continue; }
      const q = await ui.quantity(max, { price: Math.ceil(px * 1.002) }); if (!q) continue;
      const o = B.ordre(m, id, q, st.money); if (!o.ok) { await ui.say(o.err); continue; }
      st.money -= o.total; ui.sound.sfx('buy');
    } else if (c === 1) {
      const q = await ui.quantity(pos, { price: Math.floor(px * 0.998) }); if (!q) continue;
      const o = B.ordre(m, id, -q, Infinity); if (!o.ok) { await ui.say(o.err); continue; }
      st.money -= o.total; ui.sound.sfx('buy');
    }
    draw(ids[i]);
  }
  clearInterval(tick); T.close();
}

/** prix théoriques des produits dérivés sur un titre (6 mois, à la monnaie) : de quoi s'entraîner avant l'entretien */
function pricer(m, id) {
  const T = 0.5, r = B.R_PD;
  if (id === B.INDICE.id) { const S = B.prixDe(m, id), sig = 0.18; return [['Future 6 mois (tracker)', fr(B.forward(S, r, T, 0.02), 2) + ' ₽'], ['Call européen ATM', fr(B.blackScholes('call', S, S, T, r, sig, 0.02), 2) + ' ₽'], ['Put européen ATM', fr(B.blackScholes('put', S, S, T, r, sig, 0.02), 2) + ' ₽'], ['Call asiatique ATM', fr(B.asiatique('call', S, S, T, r, sig, 0.02, 6, 2000), 2) + ' ₽'], ['Retour', '']]; }
  const a = B.ACTIF[id], S = m.prix[id];
  if (a.fx) return [['Change à terme 6 mois', fr(B.changeATerme(S, r, B.R_PE, T), 4) + ' ₽'], ['Change à terme 1 an', fr(B.changeATerme(S, r, B.R_PE, 1), 4) + ' ₽'], ['Points de swap 1 an', fr(B.pointsSwap(S, r, B.R_PE, 1), 4) + ' ₽'], ['Taux de swap ₽ 5 ans', fr(B.tauxSwap(r, 5) * 100, 3) + ' %'], ['Call € ATM 6 mois (vol ' + Math.round(a.vol * 100) + ' %)', fr(B.blackScholes('call', S, S, T, r, a.vol, B.R_PE), 4) + ' ₽'], ['Retour', '']];
  const sig = B.volDe(a), q = a.q || 0, u = a.u || 0, y = a.y || 0, L = [];
  L.push([a.matiere ? 'Future 6 mois (stockage, rendement)' : 'Forward 6 mois (dividende)', fr(B.forward(S, r, T, q, u, y), 2) + ' ₽']);
  L.push([`Call européen ATM (vol ${Math.round(sig * 100)} %)`, fr(B.blackScholes('call', S, S, T, r, sig, q), 2) + ' ₽']);
  L.push(['Put européen ATM', fr(B.blackScholes('put', S, S, T, r, sig, q), 2) + ' ₽']);
  L.push(['Put américain ATM (arbre)', fr(B.americaine('put', S, S, T, r, sig, q, 120), 2) + ' ₽']);
  L.push(['Call asiatique ATM (Monte-Carlo)', fr(B.asiatique('call', S, S, T, r, sig, q, 6, 2000), 2) + ' ₽']);
  L.push(['Delta du call', fr(B.delta('call', S, S, T, r, sig, q), 3)]);
  if (a.lambda) L.push(['CDS 5 ans (récup. 40 %)', fr(B.primeCDS(a.lambda) * 1e4, 0) + ' pb/an'], ['Survie à 5 ans', fr(B.survie(a.lambda, 5) * 100, 1) + ' %']);
  L.push(['Retour', '']);
  return L;
}
/** Pierre, l'analyste : entretien de huit questions (forwards, change, swaps, CDS, options, corrélations) */
export async function entretienPierre(game) {
  const ui = game.ui, st = game.state, m = marche(game), sp = { speaker: 'Pierre' };
  if (m.embauche) {
    await ui.say(['Ah, mon analyste préféré !', 'Le terminal t\'attend au rez-de-chaussée. Achète bas, vends haut… et lis les nouvelles : un concurrent ne réagit pas comme son rival.'], sp);
    return;
  }
  await ui.say(['Pierre. Costume, cravate, et vingt ans de salle des marchés.', 'Je connais très bien les produits dérivés et les marchés de Métropole.', 'Tu veux un compte pour investir ? Il faut d\'abord me prouver que tu sais pricer.'], sp);
  if (!(await ui.yesNo('Huit questions. Six bonnes réponses et je t\'ouvre un compte. On y va ?', sp))) { await ui.say('Reviens quand tu veux. Les marchés ne dorment jamais.', sp); return; }
  const seed = ((st.id || 1) * 131 + (st.flags.pierreEssais || 0) * 7919) >>> 0;
  st.flags.pierreEssais = (st.flags.pierreEssais || 0) + 1;
  const qs = B.entretien(m, seed); let bon = 0;
  for (let n = 0; n < qs.length; n++) {
    const q = qs[n];
    await ui.say(`Question ${n + 1} / ${qs.length}.`, { ...sp, keep: true });
    const k = await ui.list({ title: q.q, items: q.choix.map((label) => ({ label })), cls: 'shop quiz', cancel: null });
    if (k === q.bonne) { bon++; ui.sound.sfx('select'); await ui.say(['Exact.', q.exp], sp); }
    else { ui.sound.sfx('bump'); await ui.say([`Non : c'était « ${q.choix[q.bonne]} ».`, q.exp], sp); }
  }
  if (bon >= B.SEUIL_EMBAUCHE) {
    m.embauche = true; st.flags.pierre = true; ui.sound.sfx('levelup');
    await ui.say([`${bon} sur ${qs.length}. Pas mal du tout !`, 'Je t\'ouvre un compte : tu peux acheter et vendre au terminal de la Bourse.', 'Un conseil : diversifie. Et ne mets jamais tout sur une rumeur de fusion.'], sp);
  } else await ui.say([`${bon} sur ${qs.length}. Il en faut ${B.SEUIL_EMBAUCHE}.`, 'Révise tes formules et reviens me voir. Les questions changeront.'], sp);
}
