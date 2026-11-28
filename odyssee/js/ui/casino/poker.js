// odyssee/js/ui/casino/poker.js — la table de Texas Hold'em : quatre places autour d'un tapis ovale (toi en bas,
// Gérard, Mimi et le Baron ou des amis en multijoueur), deux cartes en main, le flop, le turn et la river au centre,
// les mises devant chacun, le pot, le bouton du donneur ; on se couche, on parle ou on suit, on relance du montant choisi (↑ ↓), ou on fait tapis.
import * as H from '../../core/holdem.js';
import { rng } from '../../core/casino.js';
import { seededRng, newId } from '../../net/link.js';
import { texte, ease, clamp, etiquette } from '../pixel.js';
import { moquette, tableOvale, perso, piles, boutonDonneur, tour, emplacement } from './dessin.js';
import { ouvrir, fr, Cartes } from './commun.js';
import { esc, wait } from '../ui.js';

const ADVERSAIRES = [
  { nom: 'Gérard', sprite: 'montagnard', style: { serre: 0.55, agressif: 0.35, bluff: 0.04 } },
  { nom: 'Mimi', sprite: 'habitante', style: { serre: 0.25, agressif: 0.75, bluff: 0.12 } },
  { nom: 'Le Baron', sprite: 'topdresseur', style: { serre: 0.6, agressif: 0.6, bluff: 0.07 } },
];
const CAVE_IA = 150, PETITE = 1, GROSSE = 2;
// places : cartes, mise, plaque, bouton du donneur, bulle (indice 0 = en bas "Toi", puis gauche, face, droite)
const PLACES = [
  { cartes: [[166, 182], [192, 182]], mise: [248, 176], plaque: [312, 196], bouton: [230, 192], bulle: [200, 172], petit: false },
  { cartes: [[64, 104], [74, 108]], mise: [104, 140], plaque: [40, 140], bouton: [92, 92], bulle: [40, 74] },
  { cartes: [[184, 52], [200, 52]], mise: [200, 86], plaque: [262, 22], bouton: [232, 66], bulle: [200, 14] },
  { cartes: [[318, 104], [328, 108]], mise: [296, 140], plaque: [360, 140], bouton: [308, 92], bulle: [360, 74] },
];
const BOARD = [0, 1, 2, 3, 4].map((k) => [138 + k * 25, 96]), PAQUET = [200, 70];

export const rotateVisSeat = (canonSeat, mySeat = 0) => (canonSeat - mySeat + 4) % 4;
export const rotateCanonSeat = (visSeat, mySeat = 0) => (visSeat + mySeat) % 4;

function fondPoker(seatSprites = null, multi = false) {
  const sp = seatSprites || [ADVERSAIRES[1].sprite, ADVERSAIRES[2].sprite, ADVERSAIRES[0].sprite];
  const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
  moquette(g, 0, 0, 400, 240);
  // les joueurs assis autour de la table (dessinés avant elle : la table cache leurs jambes)
  perso(g, sp[0], 'right', 24, 136);
  perso(g, sp[1], 'down', 200, 64);
  perso(g, sp[2], 'left', 376, 136);
  tableOvale(g, 200, 118, 156, 64);
  texte(g, multi ? 'HOLD\'EM MÉTROPOLE · MULTI' : 'HOLD\'EM MÉTROPOLE', 200, 136, multi ? '#ffe070' : '#2f9a58', { a: 'c' });
  BOARD.forEach(([x, y]) => emplacement(g, x, y));
  return c;
}

/** Boucle partagée d'une table de Texas Hold'em (Solo ou Multijoueur à places tournantes) */
async function runPokerTableLoop(game, T, { mySeat = 0, joueurs, bouton = 0, rngFn, net = null, courtoisie = 0, amical = false, seatSprites = null }) {
  const st = T.st, g = T.g, fond = fondPoker(seatSprites, !!net);
  const vis = (canon) => rotateVisSeat(canon, mySeat);
  const t = H.creerTable({ joueurs, petite: PETITE, grosse: GROSSE, bouton });
  const cartes = new Cartes();
  let sprites = [[], [], [], []], spBoard = [], potVol = null, montrer = false, gagnants = new Set();
  const plaques = joueurs.map((_, i) => {
    const P = PLACES[vis(i)];
    return etiquette(T, 'pxs-plaque', P.plaque[0], P.plaque[1]);
  });
  const bulles = joueurs.map((_, i) => {
    const P = PLACES[vis(i)];
    return etiquette(T, 'pxs-bulle', P.bulle[0], P.bulle[1]);
  });
  const dire = (i, txt) => {
    const b = bulles[i]; if (!b) return;
    b.texte(esc(txt)); b.classList.add('on'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 1500);
  };
  const majPlaques = () => t.joueurs.forEach((p, i) => {
    const tag = net && !p.ia && i !== mySeat ? '🟢 ' : net && p.ia ? '🤖 ' : '';
    plaques[i].texte(`${tag}${esc(i === mySeat ? 'Toi' : p.nom)}<b>${fr(p.jetons)}</b>`);
    plaques[i].classList.toggle('actif', t.courant === i && !t.fini);
    plaques[i].classList.toggle('couche', p.couche && p.assis && !t.fini);
  });
  const enJetonsTable = () => { st.jetonsTable = amical ? 0 : Math.max(0, t.joueurs[mySeat].jetons - courtoisie); };

  T.boucle((now) => {
    g.drawImage(fond, 0, 0);
    const enCours = t.joueurs.reduce((a, p) => a + p.mise, 0), pot = H.pot(t) - enCours;
    if (!t.fini || potVol) {
      if (potVol) {
        const pr = ease.inOut((now - potVol.t0) / 650);
        potVol.parts.forEach(([i, n]) => piles(g, n, 200 + (PLACES[vis(i)].mise[0] - 200) * pr, 152 + (PLACES[vis(i)].mise[1] - 152) * pr, { coul: '#8aff9a' }));
      } else if (pot > 0) {
        piles(g, pot, 200, 152, { etiquette: false });
        texte(g, `POT ${pot}`, 200, 154, '#ffe070', { a: 'c', ombre: '#000' });
      }
    }
    t.joueurs.forEach((p, i) => { if (p.mise > 0) piles(g, p.mise, PLACES[vis(i)].mise[0], PLACES[vis(i)].mise[1]); });
    if (t.mains) boutonDonneur(g, ...PLACES[vis(t.bouton)].bouton);
    cartes.dessine(g, now);
    if (t.courant >= 0 && !t.fini) { const [x, y] = PLACES[vis(t.courant)].cartes[0]; tour(g, x - 6, y + 8, now); }
    const moi = t.joueurs[mySeat];
    if (moi.main.length === 2 && !moi.couche && t.board.length) {
      texte(g, H.nomScore(H.score([...moi.main, ...t.board])).toUpperCase(), 222, 206, '#f8f0c0', { ombre: '#000' });
    }
    if (montrer && t.resultats?.abattage) {
      t.joueurs.forEach((p, i) => {
        if (i !== mySeat && !p.couche && p.assis) {
          const [x, y] = PLACES[vis(i)].cartes[0];
          texte(g, H.nomScore(t.resultats.scores[i]).toUpperCase(), x + 12, y + 26, gagnants.has(i) ? '#ffe070' : '#d8e0f0', { a: 'c', ombre: '#000' });
        }
      });
    }
    majPlaques();
  });

  const donner = async () => {
    cartes.vide(); sprites = [[], [], [], []]; spBoard = []; montrer = false; gagnants = new Set();
    for (let k = 0; k < 2; k++) for (let n = 1; n <= 4; n++) {
      const i = (t.bouton + n) % 4, p = t.joueurs[i]; if (!p.assis) continue;
      const [x, y] = PLACES[vis(i)].cartes[k];
      sprites[i].push(cartes.ajoute(p.main[k], x, y, { de: PAQUET, face: i === mySeat, petit: i !== mySeat, z: k }));
      T.sfx('blip'); await T.pause(110);
    }
    await cartes.attend();
  };
  const majBoard = async () => {
    while (spBoard.length < t.board.length) {
      const k = spBoard.length;
      spBoard.push(cartes.ajoute(t.board[k], ...BOARD[k], { de: PAQUET, face: false, dur: 220 }));
      await T.pause(240); cartes.retourne(spBoard[k], 200); T.sfx('select'); await T.pause(k < 2 ? 120 : 380);
    }
  };
  const coucher = (i) => {
    for (const sp of sprites[i]) { cartes.deplace(sp, PAQUET[0] - 8, PAQUET[1] - 10, 300); sp.eteinte = true; }
    setTimeout(() => sprites[i].forEach((sp) => cartes.retire(sp)), 320);
  };
  const dit = (j) => (j.type === 'coucher' ? 'Je me couche.' : j.type === 'parole' ? 'Parole.' : j.type === 'suivre' ? (j.tapis ? 'Je suis : tapis !' : `Je suis (${j.montant}).`) : j.type === 'miser' ? (j.tapis ? `Tapis ! (${j.montant})` : `Je mise ${j.montant}.`) : (j.tapis ? `Tapis ! (${j.montant})` : `Relance à ${j.montant} !`));

  let vise = 0;
  const choixJoueur = async () => {
    const A = H.actionsPossibles(t), R = A.relance;
    if (R) vise = clamp(vise || R.min, R.min, R.max);
    const pas = Math.max(GROSSE, Math.round(H.pot(t) / 10 / GROSSE) * GROSSE);
    T.msg(A.parole ? 'À toi de parler.' : `À toi : <b>${A.aSuivre}</b> à suivre${A.suivre < A.aSuivre ? ' (tapis)' : ''}. Pot : ${H.pot(t)}.`);
    let start = A.parole ? 'parole' : 'suivre';
    for (;;) {
      const libRel = () => (R ? (vise >= R.max ? `<b>Tapis</b> <small>${R.max}</small>` : `<b>${t.miseMax ? 'Relancer' : 'Miser'}</b> <small>à ${vise} ▲▼</small>`) : 'Relancer');
      const id = await T.choisir([
        { id: 'coucher', label: 'Se coucher', off: false },
        A.parole ? { id: 'parole', html: '<b>Parole</b>', cls: 'vert' } : { id: 'suivre', html: `<b>Suivre</b> <small>${A.suivre}</small>`, cls: 'vert' },
        { id: 'moins', label: '−', off: !R || vise <= R.min },
        { id: 'relancer', html: libRel(), cls: 'fort', off: !R },
        { id: 'plus', label: '+', off: !R || vise >= R.max },
        { id: 'tapis', html: `Tapis <small>${A.tapis}</small>`, off: !R || vise >= R.max },
      ], {
        start,
        onKey: (k) => {
          if (!R || (k !== 'up' && k !== 'down')) return false;
          vise = clamp(vise + (k === 'up' ? pas : -pas), R.min, R.max); T.sfx('blip');
          T.majBouton('relancer', { html: libRel() }); T.majBouton('moins', { off: vise <= R.min }); T.majBouton('plus', { off: vise >= R.max }); T.majBouton('tapis', { off: vise >= R.max });
          return true;
        },
      });
      if (id === undefined) return null;
      if (id === 'moins' || id === 'plus') { vise = clamp(vise + (id === 'plus' ? pas : -pas), R.min, R.max); start = id; continue; }
      if (id === 'tapis') { vise = R.max; start = 'relancer'; continue; }
      if (id === 'coucher' && A.parole) { T.msg('Personne n\'a misé : tu peux parler sans rien payer.'); start = 'parole'; continue; }
      T.msg('');
      return id === 'relancer' ? { type: 'relancer', montant: vise } : { type: id };
    }
  };

  let quitter = false;
  let handNo = 0;
  try {
    while (!quitter) {
      handNo++;
      const handRng = net ? net.handRng(handNo) : rngFn;
      // En Solo les IA se recavent ; en Multi seul les sièges IA se recavent (synchronisé par handRng/règle fixe)
      t.joueurs.forEach((p, i) => {
        if (p.ia && p.assis !== false && p.jetons < GROSSE) {
          p.jetons = CAVE_IA;
          dire(i, 'Je me refais une cave !');
        }
      });
      if (!net && t.joueurs[mySeat].jetons <= 0) {
        const re = [20, 50, 100, 200].filter((n) => n <= st.jetons);
        T.msg('Tu n\'as plus de jetons sur la table.');
        const id = await T.choisir([...re.map((n) => ({ id: n, html: `Recaver <b>${n}</b>` })), { id: 0, label: 'Quitter la table' }], { cancel: 0 });
        if (!id) break;
        st.jetons -= id; t.joueurs[mySeat].jetons = id; enJetonsTable(); T.majJetons();
      }
      if (net) {
        const okHand = await net.syncStartHand(handNo, t.joueurs);
        if (!okHand) break;
        // plus un jeton : on reste à table pour regarder (on peut partir à la fin de chaque main) ;
        // une petite pile paie ce qu'elle peut de la blinde et joue à tapis
        if (t.joueurs[mySeat].jetons <= 0) { T.msg('Tu n\'as plus de jetons : tu regardes cette main.'); await T.pause(900); }
      }
      if (t.joueurs.filter((p) => p.jetons > 0).length < 2) {
        T.msg('Plus assez de joueurs avec des jetons.');
        await T.pause(1100);
        break;
      }

      T.msg(''); vise = 0;
      H.nouvelleMain(t, handRng);
      await donner();
      let vus = t.journal.length;
      const lireJournal = () => {
        for (; vus < t.journal.length; vus++) {
          const j = t.journal[vus]; if (j.type === 'blinde') continue;
          dire(j.i, dit(j));
          if (j.type === 'coucher') coucher(j.i);
          T.sfx(j.type === 'relancer' || j.type === 'miser' ? 'select' : j.type === 'coucher' ? 'cancel' : 'blip');
        }
      };
      lireJournal();

      let stepSeq = 0;
      while (!t.fini) {
        stepSeq++;
        const i = t.courant;
        const p = t.joueurs[i];
        let a;
        if (!net) {
          if (i === mySeat) { a = await choixJoueur(); if (!a) { quitter = true; break; } }
          else { await T.pause(t.joueurs[mySeat].couche ? 240 : 520 + handRng() * 480); a = H.decisionIA(t, i, handRng); }
        } else if (p.ia) {
          await T.pause(320);
          a = H.decisionIA(t, i, handRng);
        } else if (i === mySeat) {
          a = await choixJoueur();
          const wantLeave = !a;
          if (wantLeave) {
            a = { type: 'coucher' };
            quitter = true;
          }
          const relaye = await net.broadcastMyAction(handNo, stepSeq, i, a, wantLeave);
          if (!relaye && !wantLeave) { T.msg('La table a été fermée.'); await T.pause(900); quitter = true; break; }
          if (wantLeave) {
            t.joueurs[mySeat].ia = true;
            H.agir(t, a);
            lireJournal(); enJetonsTable();
            break;
          }
        } else {
          T.msg(`En attente de <b>${esc(p.nom)}</b>…`);
          const res = await net.waitSeatAction(handNo, stepSeq, i);
          if (res.abortTable) { quitter = true; break; }
          if (res.seatLeft) {
            t.joueurs[i].ia = true;
            dire(i, 'Déconnecté (IA)');
          }
          a = res.act || H.decisionIA(t, i, handRng);
        }

        if (!H.agir(t, a)) H.agir(t, { type: H.actionsPossibles(t).parole ? 'parole' : 'coucher' });
        lireJournal(); enJetonsTable();
        await majBoard();
      }
      if (quitter) break;

      await majBoard();
      const R = t.resultats;
      gagnants = new Set(R.pots.flatMap((p) => p.gagnants));
      if (R.abattage) {
        montrer = true;
        t.joueurs.forEach((p, i) => {
          if (i !== mySeat && !p.couche && p.assis) {
            sprites[i].forEach((sp, k) => {
              cartes.retourne(sp);
              const [x, y] = PLACES[vis(i)].cartes[k];
              cartes.deplace(sp, x + (k ? 6 : -4), y - 4, 200);
            });
          }
        });
        T.sfx('select'); await T.pause(450);
        const g0 = [...gagnants][0], best = H.meilleures5([...t.joueurs[g0].main, ...t.board]);
        for (const sp of [...spBoard, ...sprites[g0]]) sp.lumiere = best.includes(sp.c);
      }
      const parts = R.gains.map((n, i) => [i, n]).filter(([, n]) => n > 0);
      potVol = { t0: performance.now(), parts };
      T.sfx(R.gains[mySeat] > 0 ? 'item' : 'bump');
      const noms = (l) => l.map((i) => (i === mySeat ? 'toi' : t.joueurs[i].nom)).join(' et ');
      const desc = R.pots.map((p, k) => `${R.pots.length > 1 ? (k ? 'Pot annexe' : 'Pot principal') + ' : ' : ''}${noms(p.gagnants)}${p.gagnants.length > 1 ? ' partagent' : p.gagnants[0] === mySeat ? ' gagnes' : ' gagne'} ${fr(p.montant)}${p.score != null ? ` (${H.nomScore(p.score).toLowerCase()})` : ''}`).join(' · ');
      T.msg(desc.charAt(0).toUpperCase() + desc.slice(1) + '.');
      await T.pause(700); potVol = null;
      enJetonsTable();
      const id = await T.choisir([{ id: 'suite', html: '<b>Main suivante</b>', cls: 'vert' }, { id: 'quitter', label: 'Quitter la table' }], { start: 'suite', cancel: 'quitter' });
      const wantSuite = id === 'suite';
      if (net) {
        T.msg('En attente des autres joueurs…');
        const nextGo = await net.syncNextHand(handNo, wantSuite, mySeat);
        if (!wantSuite || !nextGo.ok) { quitter = true; break; }
        for (const leftSeat of nextGo.leftSeats || []) {
          t.joueurs[leftSeat].ia = true;
          t.joueurs[leftSeat].jetons = CAVE_IA;
        }
      } else if (!wantSuite) {
        quitter = true;
      }
    }
  } finally {
    net?.closeTable?.();
    if (!amical) st.jetons += Math.max(0, t.joueurs[mySeat].jetons - courtoisie);
    st.jetonsTable = 0;
    T.fermer();
  }
}

export async function pokerTable(game) {
  const freePeers = (game.link?.enabled ? [...game.link.others.values()] : []).filter((p) => !p.busy && !p.pvp);
  if (freePeers.length >= 1) {
    const mode = await game.ui.ask('À quelle table de Poker t\'asseoir ?', ['Table Solo (contre 3 IA)', 'Table Multijoueur (2 à 4 joueurs)', 'Annuler'], { speaker: 'Croupier' });
    if (mode === 1) return pokerTableMulti(game, freePeers);
    if (mode !== 0) return;
  }

  const T = await ouvrir(game, 'poker', 'Poker — Hold\'em de Métropole'), st = T.st;
  const ia = [ADVERSAIRES[1], ADVERSAIRES[2], ADVERSAIRES[0]];
  const caves = [20, 50, 100, 200, 500].filter((n) => n <= st.jetons);
  if (!caves.length) {
    T.msg('Il faut au moins 20 jetons pour s\'asseoir. Le comptoir est à l\'entrée.');
    await T.choisir([{ id: 'ok', label: 'D\'accord' }], { cancel: 'ok' });
    T.fermer(); return;
  }
  T.msg('Blindes 1 / 2. Avec combien de jetons t\'assieds-tu ?');
  const cv = await T.choisir([...caves.map((n) => ({ id: n, html: `<b>${n}</b> jetons` })), { id: 0, label: 'Partir' }], { start: caves[Math.min(2, caves.length - 1)], cancel: 0 });
  if (!cv) { T.fermer(); return; }
  st.jetons -= cv; st.jetonsTable = cv; T.majJetons();
  const r = rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  await runPokerTableLoop(game, T, {
    mySeat: 0,
    joueurs: [{ nom: st.name, jetons: cv }, ...ia.map((a) => ({ nom: a.nom, jetons: CAVE_IA, ia: true, style: a.style }))],
    bouton: Math.floor(r() * 4),
    rngFn: r,
  });
}

function buildPokerSeatSprites(seats, mySeat) {
  return [1, 2, 3].map((visIdx) => {
    const cSeat = rotateCanonSeat(visIdx, mySeat);
    const s = seats[cSeat];
    return s?.sprite || (s?.gender === 'f' ? 'player_f' : 'player_m');
  });
}

export function createPokerNet(game, { rid, isHost, hostId, peerIds, peerSeats, mySeat, seedBase }) {
  const link = game.link;
  const handRng = (handNo) => seededRng((seedBase ^ ((handNo + 1) * 0x9e3779b9)) >>> 0);
  let peers = peerIds.map((pid, idx) => ({ pid, seat: peerSeats[idx] }));
  const dropSeat = (seat) => { peers = peers.filter((q) => q.seat !== seat); };
  let quitte = false;   // départ déjà annoncé à l'hôte

  return {
    handRng,
    get activeCount() { return peers.length; },
    async syncStartHand(handNo, joueurs) {
      if (isHost) {
        if (!peers.length) return false;
        const stacks = joueurs.map((j) => j.jetons);
        for (const q of peers) link.send(q.pid, { t: 'poker', rid, step: 'hand', handNo, stacks });
        return true;
      }
      const msg = await link.wait(hostId, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'hand' && q.handNo === handNo) || q.step === 'close'), 60000);
      if (msg.t !== 'poker' || msg.step !== 'hand') return false;
      if (Array.isArray(msg.stacks)) msg.stacks.forEach((n, i) => { if (joueurs[i]) joueurs[i].jetons = n; });
      return true;
    },
    async broadcastMyAction(handNo, seq, seat, act, leave = false) {
      if (isHost) {
        for (const q of peers) link.send(q.pid, { t: 'poker', rid, step: 'act-go', handNo, seq, seat, act, seatLeft: leave });
      } else {
        link.send(hostId, { t: 'poker', rid, step: 'act', handNo, seq, seat, act, leave });
        if (leave) { quitte = true; return true; }
        // l'hôte relaie le coup à toute la table ; s'il ferme la table entre-temps, on ne l'attend pas
        const go = await link.wait(hostId, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'act-go' && q.handNo === handNo && q.seq === seq) || q.step === 'close'), 30000);
        return go.t === 'poker' && go.step === 'act-go';
      }
      return true;
    },
    async waitSeatAction(handNo, seq, seat) {
      if (isHost) {
        const entry = peers.find((q) => q.seat === seat);
        const msg = entry ? await link.wait(entry.pid, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'act' && q.handNo === handNo && q.seq === seq) || q.step === 'leave'), 90000) : { t: 'left' };
        const seatLeft = msg.t !== 'poker' || msg.step === 'leave' || !!msg.leave;
        const act = msg.t === 'poker' && msg.step === 'act' ? msg.act : null;
        if (seatLeft) dropSeat(seat);
        for (const q of peers) link.send(q.pid, { t: 'poker', rid, step: 'act-go', handNo, seq, seat, act, seatLeft });
        return { act, seatLeft };
      }
      const msg = await link.wait(hostId, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'act-go' && q.handNo === handNo && q.seq === seq) || q.step === 'close'), 120000);
      if (msg.t !== 'poker' || msg.step === 'close') return { abortTable: true };
      return { act: msg.act, seatLeft: !!msg.seatLeft };
    },
    async syncNextHand(handNo, wantStay, seat) {
      if (isHost) {
        const snapshot = [...peers];
        const res = await Promise.all(snapshot.map((entry) => link.wait(entry.pid, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'next' && q.handNo === handNo) || q.step === 'leave'), 60000).then((q) => ({ seat: entry.seat, pid: entry.pid, q }))));
        const leftSeats = [];
        let humanStayers = wantStay ? 1 : 0;
        for (const { seat: sl, q } of res) {
          if (q.t === 'poker' && q.step === 'next' && q.stay) humanStayers++;
          else leftSeats.push(sl);
        }
        const ok = wantStay && humanStayers >= 2;
        for (const entry of snapshot) link.send(entry.pid, { t: 'poker', rid, step: 'next-go', handNo, ok, leftSeats });
        for (const sl of leftSeats) dropSeat(sl);
        return { ok, leftSeats };
      }
      link.send(hostId, { t: 'poker', rid, step: 'next', handNo, seat, stay: wantStay });
      if (!wantStay) { quitte = true; return { ok: false, leftSeats: [] }; }
      const msg = await link.wait(hostId, (q) => q.t === 'poker' && q.rid === rid && ((q.step === 'next-go' && q.handNo === handNo) || q.step === 'close'), 65000);
      if (msg.t !== 'poker' || msg.step !== 'next-go') return { ok: false };
      return { ok: !!msg.ok && wantStay, leftSeats: msg.leftSeats || [] };
    },
    closeTable() {
      if (isHost) for (const q of peers) link.send(q.pid, { t: 'poker', rid, step: 'close' });
      // un invité qui part sans l'avoir annoncé (table fermée, erreur…) prévient l'hôte, qui ne l'attend plus
      else if (!quitte) { quitte = true; link.send(hostId, { t: 'poker', rid, step: 'leave', seat: mySeat }); }
    },
  };
}

/** Ouvre une table de Poker Texas Hold'em multijoueur (2 à 4 humains, IA sur les sièges restants) */
export async function pokerTableMulti(game, freePeersArg = null) {
  const st = game.state, ui = game.ui, link = game.link;
  const who = { speaker: 'Croupier Poker' };
  const freePeers = freePeersArg || (link?.enabled ? [...link.others.values()] : []).filter((p) => !p.busy && !p.pvp);
  if (!freePeers.length) {
    await ui.say('Aucun ami libre connecté pour rejoindre la table multijoueur.', who);
    return;
  }

  const maxInvite = Math.min(3, freePeers.length);
  const countPick = maxInvite === 1 ? 0 : await ui.list({
    title: 'Combien d\'amis inviter à la table ?',
    items: Array.from({ length: maxInvite }, (_, i) => ({ label: `${i + 1} ami${i > 0 ? 's' : ''} (${i + 2} joueurs)` })).concat([{ label: 'Annuler' }]),
    cancel: maxInvite,
  });
  if (countPick < 0 || countPick >= maxInvite) return;
  const needCount = countPick + 1;

  const selected = [];
  let remaining = [...freePeers];
  for (let k = 0; k < needCount; k++) {
    if (remaining.length === 1 && selected.length + 1 === needCount) { selected.push(remaining[0]); break; }
    const idx = await ui.list({ title: `Choisir le joueur ${k + 1}/${needCount}`, items: remaining.map((p) => ({ label: p.name })).concat([{ label: 'Annuler' }]), cancel: remaining.length });
    if (idx < 0 || idx >= remaining.length) return;
    selected.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  const rid = newId();
  const peerIds = selected.map((p) => p.id);
  for (const p of selected) link.send(p.id, { t: 'req', rid, kind: 'poker', name: st.name });

  const box = ui.dialogBox();
  ui.typePage(box, `Invitation Poker envoyée à ${selected.map((p) => p.name).join(', ')}…`, { last: true });
  await wait(30);
  const reps = await Promise.all(selected.map((p) => link.wait(p.id, (m) => m.t === 'poker-rep' && m.rid === rid, 30000).then((m) => ({ peer: p, m }))));
  ui.closeDialog();

  const joined = reps.filter(({ m }) => m.t === 'poker-rep' && m.ok);
  if (!joined.length) {
    for (const pid of peerIds) link.send(pid, { t: 'poker-cancel', rid });
    await ui.say('Personne n\'a rejoint la table de Poker.', who);
    return;
  }
  for (const { peer, m } of reps) {
    if (!(m.t === 'poker-rep' && m.ok)) link.send(peer.id, { t: 'poker-cancel', rid });
  }

  const amical = (st.jetons | 0) < 20;
  const buyin = amical ? 0 : Math.min(500, st.jetons | 0);
  const courtoisie = amical ? 50 : 0;
  const myStack = amical ? 50 : buyin;
  st.jetons -= buyin;
  st.jetonsTable = buyin;

  const humans = [
    { nom: st.name, jetons: myStack, sprite: st.gender === 'f' ? 'player_f' : 'player_m', gender: st.gender },
    ...joined.map(({ peer, m }) => ({ nom: m.name || peer.name, jetons: m.stack || 50, sprite: m.gender === 'f' ? 'player_f' : 'player_m', gender: m.gender })),
  ];
  const aiOrder = [ADVERSAIRES[1], ADVERSAIRES[2], ADVERSAIRES[0]];
  const seats = [...humans];
  let aiIdx = 0;
  while (seats.length < 4) {
    const a = aiOrder[aiIdx++];
    seats.push({ nom: a.nom, jetons: CAVE_IA, ia: true, style: a.style, sprite: a.sprite });
  }
  const seedBase = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const initRng = seededRng(seedBase);
  const bouton = Math.floor(initRng() * 4);
  const activePeerIds = joined.map(({ peer }) => peer.id);
  const peerSeats = joined.map((_, idx) => idx + 1);

  activePeerIds.forEach((pid, idx) => {
    link.send(pid, { t: 'poker', rid, step: 'start', seats, mySeat: idx + 1, bouton, seedBase });
  });

  game.busy = true;
  game.session = rid;
  try {
    const T = await ouvrir(game, 'poker', `Poker Multi (${joined.length + 1} joueurs)`);
    T.majJetons();
    await runPokerTableLoop(game, T, {
      mySeat: 0,
      joueurs: seats.map((s) => ({ ...s })),
      bouton,
      rngFn: initRng,
      courtoisie,
      amical,
      seatSprites: buildPokerSeatSprites(seats, 0),
      net: createPokerNet(game, { rid, isHost: true, hostId: link.myId, peerIds: activePeerIds, peerSeats, mySeat: 0, seedBase }),
    });
  } finally {
    game.busy = false;
    game.session = null;
  }
}

/** Réception d'une invitation à une table de Poker Texas Hold'em multijoueur */
export async function onPokerInvite(game, from, m) {
  const link = game.link, st = game.state, ui = game.ui;
  const free = st && game.player && !game.busy && game.input.free && !game.bv.alive && !game.session && !game.player.move;
  if (!free) { link.send(from, { t: 'poker-rep', rid: m.rid, ok: false }); return; }

  const name = String(m.name || link.nameOf(from)).slice(0, 12);
  game.busy = true;
  game.session = m.rid;
  try {
    let gone = false;
    void link.wait(from, (q) => q.t === 'poker-cancel' && q.rid === m.rid, 30000).then((r) => {
      gone = true;
      const open = ui.root.querySelector('.list.choice');
      if (open && open._close) open._close(1);
      return r;
    });
    ui.sound.sfx('bang');
    const yes = await ui.yesNo(`${name} t'invite à une table de Hold'em de Métropole multijoueur ! Rejoindre ?`, { speaker: name });
    if (gone) { ui.closeDialog(); await ui.say(`${name} a fermé l'invitation Poker.`); return; }
    link.abort(from);
    if (!yes) { link.send(from, { t: 'poker-rep', rid: m.rid, ok: false }); return; }

    const amical = (st.jetons | 0) < 20;
    const buyin = amical ? 0 : Math.min(500, st.jetons | 0);
    const courtoisie = amical ? 50 : 0;
    const myStack = amical ? 50 : buyin;
    st.jetons -= buyin;
    st.jetonsTable = buyin;
    link.send(from, { t: 'poker-rep', rid: m.rid, ok: true, name: st.name, gender: st.gender, stack: myStack });

    const startMsg = await link.wait(from, (q) => (q.t === 'poker' && q.rid === m.rid && q.step === 'start') || (q.t === 'poker-cancel' && q.rid === m.rid), 45000);
    if (startMsg.t !== 'poker' || startMsg.step !== 'start') {
      st.jetons += buyin; st.jetonsTable = 0;
      await ui.say('La table de Poker n\'a pas démarré.');
      return;
    }

    const T = await ouvrir(game, 'poker', 'Poker — Hold\'em Multi');
    T.majJetons();
    await runPokerTableLoop(game, T, {
      mySeat: startMsg.mySeat,
      joueurs: startMsg.seats.map((s) => ({ ...s })),
      bouton: startMsg.bouton,
      rngFn: seededRng(startMsg.seedBase >>> 0),
      courtoisie,
      amical,
      seatSprites: buildPokerSeatSprites(startMsg.seats, startMsg.mySeat),
      net: createPokerNet(game, { rid: m.rid, isHost: false, hostId: from, peerIds: [], peerSeats: [], mySeat: startMsg.mySeat, seedBase: startMsg.seedBase }),
    });
  } finally {
    game.busy = false;
    game.session = null;
  }
}
