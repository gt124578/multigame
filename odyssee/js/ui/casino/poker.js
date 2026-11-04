// odyssee/js/ui/casino/poker.js — la table de Texas Hold'em : quatre places autour d'un tapis ovale (toi en bas,
// Gérard, Mimi et le Baron), deux cartes en main, le flop, le turn et la river au centre, les mises devant chacun,
// le pot, le bouton du donneur ; on se couche, on parle ou on suit, on relance du montant choisi (↑ ↓), ou on fait tapis.
import * as H from '../../core/holdem.js';
import { rng } from '../../core/casino.js';
import { texte, ease, clamp, etiquette } from '../pixel.js';
import { moquette, tableOvale, perso, piles, boutonDonneur, tour, emplacement } from './dessin.js';
import { ouvrir, fr, Cartes } from './commun.js';
import { esc } from '../ui.js';

const ADVERSAIRES = [
  { nom: 'Gérard', sprite: 'montagnard', style: { serre: 0.55, agressif: 0.35, bluff: 0.04 } },
  { nom: 'Mimi', sprite: 'habitante', style: { serre: 0.25, agressif: 0.75, bluff: 0.12 } },
  { nom: 'Le Baron', sprite: 'topdresseur', style: { serre: 0.6, agressif: 0.6, bluff: 0.07 } },
];
const CAVE_IA = 150, PETITE = 1, GROSSE = 2;
// places : cartes, mise, plaque, bouton du donneur, bulle
const PLACES = [
  { cartes: [[166, 182], [192, 182]], mise: [248, 176], plaque: [312, 196], bouton: [230, 192], bulle: [200, 172], petit: false },
  { cartes: [[64, 104], [74, 108]], mise: [104, 140], plaque: [40, 140], bouton: [92, 92], bulle: [40, 74] },
  { cartes: [[184, 52], [200, 52]], mise: [200, 86], plaque: [262, 22], bouton: [232, 66], bulle: [200, 14] },
  { cartes: [[318, 104], [328, 108]], mise: [296, 140], plaque: [360, 140], bouton: [308, 92], bulle: [360, 74] },
];
const BOARD = [0, 1, 2, 3, 4].map((k) => [138 + k * 25, 96]), PAQUET = [200, 70];

function fondPoker() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
  moquette(g, 0, 0, 400, 240);
  // les adversaires assis autour de la table (dessinés avant elle : la table cache leurs jambes)
  perso(g, ADVERSAIRES[1].sprite, 'right', 24, 136);
  perso(g, ADVERSAIRES[2].sprite, 'down', 200, 64);
  perso(g, ADVERSAIRES[0].sprite, 'left', 376, 136);
  tableOvale(g, 200, 118, 156, 64);
  texte(g, 'TEXAS HOLD\'EM', 200, 136, '#2f9a58', { a: 'c' });
  BOARD.forEach(([x, y]) => emplacement(g, x, y));
  return c;
}

export async function pokerTable(game) {
  const T = await ouvrir(game, 'poker', 'Poker — Texas Hold\'em'), st = T.st, g = T.g, fond = fondPoker();
  // ordre des places à l'écran : 0 toi, 1 à gauche (Mimi), 2 en face (Le Baron), 3 à droite (Gérard)
  const ia = [ADVERSAIRES[1], ADVERSAIRES[2], ADVERSAIRES[0]];
  const caves = [20, 50, 100, 200, 500].filter((n) => n <= st.jetons);
  if (!caves.length) { T.msg('Il faut au moins 20 jetons pour s\'asseoir. Le comptoir est à l\'entrée.'); await T.choisir([{ id: 'ok', label: 'D\'accord' }], { cancel: 'ok' }); T.fermer(); return; }
  T.msg('Blindes 1 / 2. Avec combien de jetons t\'assieds-tu ?');
  const cv = await T.choisir([...caves.map((n) => ({ id: n, html: `<b>${n}</b> jetons` })), { id: 0, label: 'Partir' }], { start: caves[Math.min(2, caves.length - 1)], cancel: 0 });
  if (!cv) { T.fermer(); return; }
  st.jetons -= cv; st.jetonsTable = cv; T.majJetons();
  const r = rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const t = H.creerTable({ joueurs: [{ nom: st.name, jetons: cv }, ...ia.map((a) => ({ nom: a.nom, jetons: CAVE_IA, ia: true, style: a.style }))], petite: PETITE, grosse: GROSSE, bouton: Math.floor(r() * 4) });
  const cartes = new Cartes();
  let sprites = [[], [], [], []], spBoard = [], potVol = null, montrer = false, gagnants = new Set();
  const plaques = PLACES.map((P, i) => etiquette(T, 'pxs-plaque', P.plaque[0], P.plaque[1]));
  const bulles = PLACES.map((P) => etiquette(T, 'pxs-bulle', P.bulle[0], P.bulle[1]));
  const dire = (i, txt) => { const b = bulles[i]; b.texte(esc(txt)); b.classList.add('on'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 1500); };
  const majPlaques = () => t.joueurs.forEach((p, i) => {
    plaques[i].texte(`${esc(i ? p.nom : 'Toi')}<b>${fr(p.jetons)}</b>`);
    plaques[i].classList.toggle('actif', t.courant === i && !t.fini); plaques[i].classList.toggle('couche', p.couche && p.assis && !t.fini);
  });
  const enJetonsTable = () => { st.jetonsTable = t.joueurs[0].jetons; };

  T.boucle((now) => {
    g.drawImage(fond, 0, 0);
    // mises de ce tour devant chacun, pot au centre
    const enCours = t.joueurs.reduce((a, p) => a + p.mise, 0), pot = H.pot(t) - enCours;
    if (!t.fini || potVol) {
      if (potVol) { const p = ease.inOut((now - potVol.t0) / 650); potVol.parts.forEach(([i, n]) => piles(g, n, 200 + (PLACES[i].mise[0] - 200) * p, 152 + (PLACES[i].mise[1] - 152) * p, { coul: '#8aff9a' })); }
      else if (pot > 0) { piles(g, pot, 200, 152, { etiquette: false }); texte(g, `POT ${pot}`, 200, 154, '#ffe070', { a: 'c', ombre: '#000' }); }
    }
    t.joueurs.forEach((p, i) => { if (p.mise > 0) piles(g, p.mise, PLACES[i].mise[0], PLACES[i].mise[1]); });
    if (t.mains) boutonDonneur(g, ...PLACES[t.bouton].bouton);
    cartes.dessine(g, now);
    if (t.courant >= 0 && !t.fini) { const [x, y] = PLACES[t.courant].cartes[0]; tour(g, x - 6, y + 8, now); }
    // nom de la main du joueur
    const moi = t.joueurs[0];
    if (moi.main.length === 2 && !moi.couche && t.board.length) texte(g, H.nomScore(H.score([...moi.main, ...t.board])).toUpperCase(), 222, 206, '#f8f0c0', { ombre: '#000' });
    // à l'abattage : le nom de la main des adversaires
    if (montrer && t.resultats?.abattage) t.joueurs.forEach((p, i) => { if (i && !p.couche && p.assis) { const [x, y] = PLACES[i].cartes[0]; texte(g, H.nomScore(t.resultats.scores[i]).toUpperCase(), x + 12, y + 26, gagnants.has(i) ? '#ffe070' : '#d8e0f0', { a: 'c', ombre: '#000' }); } });
    majPlaques();
  });

  /** distribue les cartes du joueur i (face visible pour toi, dos pour les autres) */
  const donner = async () => {
    cartes.vide(); sprites = [[], [], [], []]; spBoard = []; montrer = false; gagnants = new Set();
    for (let k = 0; k < 2; k++) for (let n = 1; n <= 4; n++) {
      const i = (t.bouton + n) % 4, p = t.joueurs[i]; if (!p.assis) continue;
      const [x, y] = PLACES[i].cartes[k];
      sprites[i].push(cartes.ajoute(p.main[k], x, y, { de: PAQUET, face: i === 0, petit: i !== 0, z: k })); T.sfx('blip'); await T.pause(110);
    }
    await cartes.attend();
  };
  const majBoard = async () => {
    while (spBoard.length < t.board.length) {
      const k = spBoard.length; spBoard.push(cartes.ajoute(t.board[k], ...BOARD[k], { de: PAQUET, face: false, dur: 220 }));
      await T.pause(240); cartes.retourne(spBoard[k], 200); T.sfx('select'); await T.pause(k < 2 ? 120 : 380);
    }
  };
  const coucher = (i) => { for (const sp of sprites[i]) { cartes.deplace(sp, PAQUET[0] - 8, PAQUET[1] - 10, 300); sp.eteinte = true; } setTimeout(() => sprites[i].forEach((sp) => cartes.retire(sp)), 320); };
  const dit = (j) => (j.type === 'coucher' ? 'Je me couche.' : j.type === 'parole' ? 'Parole.' : j.type === 'suivre' ? (j.tapis ? `Je suis : tapis !` : `Je suis (${j.montant}).`) : j.type === 'miser' ? (j.tapis ? `Tapis ! (${j.montant})` : `Je mise ${j.montant}.`) : (j.tapis ? `Tapis ! (${j.montant})` : `Relance à ${j.montant} !`));

  /** le choix du joueur (relance : montant ajustable) */
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
        { id: 'coucher', label: 'Se coucher', off: A.parole && false },
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
  while (!quitter) {
    // un adversaire ruiné se refait une cave ; toi, tu peux recaver ou partir
    t.joueurs.forEach((p, i) => { if (i && p.jetons < GROSSE) { p.jetons = CAVE_IA; dire(i, 'Je me refais une cave !'); } });
    if (t.joueurs[0].jetons <= 0) {
      const re = [20, 50, 100, 200].filter((n) => n <= st.jetons);
      T.msg('Tu n\'as plus de jetons sur la table.');
      const id = await T.choisir([...re.map((n) => ({ id: n, html: `Recaver <b>${n}</b>` })), { id: 0, label: 'Quitter la table' }], { cancel: 0 });
      if (!id) break;
      st.jetons -= id; t.joueurs[0].jetons = id; enJetonsTable(); T.majJetons();
    }
    T.msg(''); vise = 0;
    H.nouvelleMain(t, r);
    await donner();
    let vus = t.journal.length;
    const lireJournal = () => { for (; vus < t.journal.length; vus++) { const j = t.journal[vus]; if (j.type === 'blinde') continue; dire(j.i, dit(j)); if (j.type === 'coucher') coucher(j.i); T.sfx(j.type === 'relancer' || j.type === 'miser' ? 'select' : j.type === 'coucher' ? 'cancel' : 'blip'); } };
    lireJournal();
    while (!t.fini) {
      const i = t.courant; let a;
      if (i === 0) { a = await choixJoueur(); if (!a) { quitter = true; break; } }
      else { await T.pause(t.joueurs[0].couche ? 260 : 550 + r() * 500); a = H.decisionIA(t, i, r); }   // plus vite quand tu t'es couché
      if (!H.agir(t, a)) H.agir(t, { type: H.actionsPossibles(t).parole ? 'parole' : 'coucher' });
      lireJournal(); enJetonsTable();
      await majBoard();
    }
    if (quitter) break;
    await majBoard();
    // abattage : on retourne les cartes de ceux qui restent, on éclaire la main gagnante
    const R = t.resultats;
    gagnants = new Set(R.pots.flatMap((p) => p.gagnants));
    if (R.abattage) {
      montrer = true;
      t.joueurs.forEach((p, i) => { if (i && !p.couche && p.assis) sprites[i].forEach((sp, k) => { cartes.retourne(sp); const [x, y] = PLACES[i].cartes[k]; cartes.deplace(sp, x + (k ? 6 : -4), y - 4, 200); }); });
      T.sfx('select'); await T.pause(450);
      const g0 = [...gagnants][0], best = H.meilleures5([...t.joueurs[g0].main, ...t.board]);
      for (const sp of [...spBoard, ...sprites[g0]]) sp.lumiere = best.includes(sp.c);
    }
    // le pot part vers le(s) gagnant(s)
    const parts = R.gains.map((n, i) => [i, n]).filter(([, n]) => n > 0);
    potVol = { t0: performance.now(), parts }; T.sfx(R.gains[0] > 0 ? 'item' : 'bump');
    const noms = (l) => l.map((i) => (i ? t.joueurs[i].nom : 'toi')).join(' et ');
    const desc = R.pots.map((p, k) => `${R.pots.length > 1 ? (k ? 'Pot annexe' : 'Pot principal') + ' : ' : ''}${noms(p.gagnants)}${p.gagnants.length > 1 ? ' partagent' : p.gagnants[0] === 0 ? ' gagnes' : ' gagne'} ${fr(p.montant)}${p.score != null ? ` (${H.nomScore(p.score).toLowerCase()})` : ''}`).join(' · ');
    T.msg(desc.charAt(0).toUpperCase() + desc.slice(1) + '.');
    await T.pause(700); potVol = null;
    enJetonsTable();
    const id = await T.choisir([{ id: 'suite', html: '<b>Main suivante</b>', cls: 'vert' }, { id: 'quitter', label: 'Quitter la table' }], { start: 'suite', cancel: 'quitter' });
    if (id !== 'suite') quitter = true;
  }
  // on se lève : les jetons de la table reviennent dans la poche
  st.jetons += t.joueurs[0].jetons; st.jetonsTable = 0;
  T.fermer();
}
