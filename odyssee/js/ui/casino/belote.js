// odyssee/js/ui/casino/belote.js — la table de belote : Mamie Rose en face (ta partenaire), le Marquis à gauche,
// Fernand à droite ; la carte retournée au centre pendant les enchères, tes huit cartes en éventail (les cartes
// injouables sont grisées), le pli qui se forme au milieu et part chez celui qui le remporte, le score des deux équipes.
import * as C from '../../core/casino.js';
import { texte, pave, rect, etiquette } from '../pixel.js';
import { moquette, tableOvale, perso, tour } from './dessin.js';
import { ouvrir, fr, Cartes } from './commun.js';
import { esc } from '../ui.js';

const NOMS = ['Toi', 'Le Marquis', 'Mamie Rose', 'Fernand'];
const SPRITES = [null, 'savant', 'dame', 'vieil_homme'];
// où se pose la carte jouée par chacun, d'où elle part, où partent les plis gagnés
const PLI = [[188, 118], [150, 98], [188, 70], [226, 98]];
const MAIN = [[200, 214], [50, 112], [200, 34], [350, 112]];
const PLAQUE = [[312, 200], [40, 160], [262, 14], [360, 160]];
const BULLE = [[200, 170], [44, 70], [200, 10], [356, 70]];
const AT_SYM = { '♠': '<span class="suit-n">♠</span>', '♣': '<span class="suit-n">♣</span>', '♥': '<span class="suit-r">♥</span>', '♦': '<span class="suit-r">♦</span>' };
const trier = (main) => main.slice().sort((a, b) => a.s.localeCompare(b.s) || a.r - b.r);

function fondBelote() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
  moquette(g, 0, 0, 400, 240);
  perso(g, SPRITES[1], 'right', 24, 136); perso(g, SPRITES[2], 'down', 200, 62); perso(g, SPRITES[3], 'left', 376, 136);
  tableOvale(g, 200, 116, 156, 66, { feutre: '#1d5a8a', trame: '#22669a', bord: '#143e60', filet: '#3a86c0' });
  texte(g, 'BELOTE', 200, 150, '#3a86c0', { a: 'c' });
  return c;
}

export async function beloteTable(game) {
  const T = await ouvrir(game, 'belote', 'Belote'), st = T.st, g = T.g, fond = fondBelote();
  NOMS[0] = 'Toi';
  T.msg('Toi et Mamie Rose contre le Marquis et Fernand. Première équipe à 501 points.');
  const choix = [10, 25, 50, 100].filter((n) => n <= st.jetons);
  if (!choix.length) { T.fermer(); return; }
  const mise = await T.choisir([...choix.map((n) => ({ id: n, html: `Miser <b>${n}</b>` })), { id: 0, label: 'Partir' }], { cancel: 0, start: choix[0] });
  if (!mise) { T.fermer(); return; }
  st.jetons -= mise; T.majJetons();
  const cartes = new Cartes();
  const score = [0, 0]; let donneur = Math.floor(Math.random() * 4), d = null, curseur = 0, jouables = null, attendJoueur = false, actif = -1, spMain = [], spPli = [], spRet = null;
  const r = C.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const plaques = PLAQUE.map(([x, y]) => etiquette(T, 'pxs-plaque', x, y));
  const bulles = BULLE.map(([x, y]) => etiquette(T, 'pxs-bulle', x, y));
  const tableau = etiquette(T, 'pxs-plaque score-b', 50, 200);
  const dire = (i, txt) => { const b = bulles[i]; b.texte(esc(txt)); b.classList.add('on'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 1400); };
  const majInfos = () => {
    plaques.forEach((p, i) => { p.texte(`${esc(NOMS[i])}${d?.preneur === i ? '<b>preneur</b>' : ''}`); p.classList.toggle('actif', actif === i); });
    tableau.texte(`Nous <b style="display:inline">${score[0]}</b> · Eux <b style="display:inline">${score[1]}</b>${d?.atout ? `<br>Atout ${AT_SYM[d.atout]}` : ''}`);
  };
  /** l'éventail de tes cartes, en bas */
  const placerMain = () => {
    const main = trier(d.mains[0]), n = main.length, pas = Math.min(26, 230 / Math.max(1, n));
    spMain = spMain.filter((sp) => main.some((c) => c === sp.c));
    main.forEach((c, k) => {
      let sp = spMain.find((s) => s.c === c);
      const x = 200 - 12 - ((n - 1) * pas) / 2 + k * pas, y = 190;
      if (!sp) { sp = cartes.ajoute(c, x, y, { de: [200, 120], z: 10 + k }); spMain.push(sp); } else { cartes.deplace(sp, x, y, 180); sp.z = 10 + k; }
    });
    spMain.sort((a, b) => a.z - b.z);
  };

  const dosMini = (() => { const c = document.createElement('canvas'); c.width = 12; c.height = 16; const x = c.getContext('2d'); pave(x, 0, 0, 12, 16, '#f0f0f8', '#2a2a34'); rect(x, 2, 2, 8, 12, '#24408c'); rect(x, 5, 6, 2, 4, '#e83030'); return c; })();
  T.boucle((now) => {
    g.drawImage(fond, 0, 0);
    // dos des cartes des adversaires
    if (d) for (const j of [1, 2, 3]) { const n = d.mains[j].length; for (let k = 0; k < n; k++) { const [mx, my] = MAIN[j]; if (j === 2) { g.drawImage(dosMini, mx - 4 * n + k * 8 - 4, my + 14); } else g.drawImage(dosMini, mx + (j === 1 ? 14 : -26), my - 8 + k * 5); } }
    // tes cartes : jouables levées, les autres grisées ; curseur
    spMain.forEach((sp, k) => {
      const ok = !jouables || jouables.some((c) => c.r === sp.c.r && c.s === sp.c.s);
      sp.eteinte = attendJoueur && !ok; sp.leve = attendJoueur && ok ? (k === curseur ? 9 : 4) : 0; sp.lumiere = attendJoueur && k === curseur;
      const [x, y] = cartes.pos(sp, now), w = k === spMain.length - 1 ? 24 : Math.min(24, (spMain[k + 1] ? cartes.pos(spMain[k + 1], now)[0] - x : 24));
      if (attendJoueur) T.zone(x, y - 10, w, 44, () => { curseur = k; if (ok) T.resoudre('carte'); else T.sfx('bump'); }, 'c' + k);
    });
    cartes.dessine(g, now);
    if (actif > 0) { const [x, y] = MAIN[actif]; tour(g, x, y + 30, now); }
    majInfos();
  });

  const jouerJoueur = async () => {
    jouables = C.jouables(d.mains[0], d.pli, d.atout, 0);
    const main = trier(d.mains[0]);
    curseur = Math.max(0, main.findIndex((c) => jouables.some((x) => x.r === c.r && x.s === c.s)));
    attendJoueur = true; T.msg('À toi de jouer : ← → puis A, ou clique sur une carte.');
    for (;;) {
      const id = await T.choisir([{ id: 'carte', html: '<b>Jouer cette carte</b>', cls: 'vert' }], {
        onKey: (k) => { if (k === 'left' || k === 'right') { curseur = (curseur + (k === 'left' ? -1 : 1) + main.length) % main.length; T.sfx('blip'); return true; } return false; },
      });
      if (id === undefined) return null;
      const c = main[curseur];
      if (jouables.some((x) => x.r === c.r && x.s === c.s)) { attendJoueur = false; jouables = null; T.msg(''); return c; }
      T.sfx('bump'); T.msg(d.pli.length ? 'Tu dois fournir à la couleur demandée (ou couper à l\'atout).' : 'Cette carte ne peut pas être jouée.');
    }
  };

  while (score[0] < 501 && score[1] < 501) {
    donneur = (donneur + 1) % 4; d = C.donneBelote(r, donneur); actif = -1;
    cartes.vide(); spMain = []; spPli = [];
    placerMain(); T.sfx('blip'); await cartes.attend();
    spRet = cartes.ajoute(d.retournee, 188, 98, { de: [200, 60] }); await cartes.attend();
    // enchères : premier tour à la couleur retournée, second tour à une autre couleur
    let preneur = -1, atout = null;
    for (let tourE = 1; tourE <= 2 && preneur < 0; tourE++) for (let k = 0; k < 4 && preneur < 0; k++) {
      const j = (donneur + 1 + k) % 4; actif = j;
      if (j === 0) {
        T.msg(tourE === 1 ? `Prends-tu à ${C.NOM_COULEUR[d.retournee.s]} ?` : 'Second tour : choisis une autre couleur, ou passe.');
        const opts = tourE === 1 ? [{ id: d.retournee.s, html: `<b>Je prends</b> ${AT_SYM[d.retournee.s]}`, cls: 'vert' }] : C.COULEURS.filter((c) => c !== d.retournee.s).map((c) => ({ id: c, html: `À ${AT_SYM[c]}`, cls: 'vert' }));
        const id = await T.choisir([...opts, { id: 'passe', label: 'Je passe' }, ...(tourE === 1 && score[0] + score[1] === 0 ? [] : [])], { start: 'passe' });
        if (id === undefined) { T.fermer(); return; }
        if (id !== 'passe') { preneur = 0; atout = id; dire(0, `Je prends à ${C.NOM_COULEUR[id]} !`); } else dire(0, 'Je passe.');
      } else {
        await T.pause(500);
        if (tourE === 1 && C.evalPrise(d.mains[j], d.retournee.s, d.retournee) >= C.SEUIL_PRISE) { preneur = j; atout = d.retournee.s; }
        if (tourE === 2) for (const c of C.COULEURS) if (c !== d.retournee.s && C.evalPrise(d.mains[j], c) >= C.SEUIL_PRISE + 6) { preneur = j; atout = c; break; }
        dire(j, preneur === j ? `Je prends à ${C.NOM_COULEUR[atout]} !` : 'Je passe.');
      }
    }
    if (preneur < 0) { T.msg('Tout le monde passe : on redistribue.'); await T.pause(1100); continue; }
    T.msg(`${preneur ? NOMS[preneur] : 'Tu'} ${preneur ? 'prend' : 'prends'} à ${C.NOM_COULEUR[atout]}.`);
    // la retournée part chez le preneur, on complète les mains
    cartes.deplace(spRet, ...MAIN[preneur], 300); await T.pause(320); cartes.retire(spRet);
    C.distribuerReste(d, preneur, atout); placerMain(); await cartes.attend();
    for (let t = 0; t < 8; t++) {
      for (let k = 0; k < 4; k++) {
        const j = (d.entame + k) % 4; actif = j; let c;
        if (j === 0) { c = await jouerJoueur(); if (!c) { T.fermer(); return; } }
        else { await T.pause(480); c = C.choixIA(d, j); }
        const belote = d.belote === j && c.s === d.atout && (c.r === 12 || c.r === 13);
        // la carte part de la main vers le centre
        let sp; if (j === 0) { sp = spMain.find((s) => s.c === c); spMain = spMain.filter((s) => s !== sp); cartes.deplace(sp, ...PLI[0], 220); sp.leve = 0; sp.lumiere = false; sp.z = 40 + k; }
        else sp = cartes.ajoute(c, ...PLI[j], { de: MAIN[j], z: 40 + k, dur: 240 });
        spPli.push(sp); T.sfx('blip');
        const g2 = C.jouerCarte(d, j, c);
        if (j === 0) placerMain();
        if (belote) dire(j, d.mains[j].some((x) => x.s === d.atout && (x.r === 12 || x.r === 13)) ? 'Belote !' : 'Rebelote !');
        await cartes.attend();
        if (g2 != null) {
          actif = -1; await T.pause(650);
          T.msg(`${g2 ? NOMS[g2] + ' remporte' : 'Tu remportes'} le pli.`);
          for (const s of spPli) cartes.deplace(s, ...MAIN[g2], 320);
          T.sfx(g2 % 2 === 0 ? 'select' : 'cancel'); await T.pause(340); spPli.forEach((s) => cartes.retire(s)); spPli = [];
        }
      }
    }
    actif = -1;
    const res = C.compterBelote(d); score[0] += res.pts[0]; score[1] += res.pts[1];
    T.msg(`Donne : nous <b>${res.pts[0]}</b>, eux <b>${res.pts[1]}</b>${res.dedans ? ' — le preneur est dedans !' : ''}${res.capot ? ' — capot !' : ''}`);
    T.sfx(res.pts[0] > res.pts[1] ? 'item' : 'bump');
    const id = await T.choisir([{ id: 'suite', html: score[0] >= 501 || score[1] >= 501 ? '<b>Voir le résultat</b>' : '<b>Donne suivante</b>', cls: 'vert' }, { id: 'abandon', label: 'Abandonner la partie' }], { start: 'suite' });
    if (id === undefined) { T.fermer(); return; }
    if (id === 'abandon') { score[1] = Math.max(score[1], 501); score[0] = Math.min(score[0], score[1] - 1); break; }
  }
  const gagne = score[0] > score[1];
  if (gagne) { st.jetons += mise * 2; T.sfx('levelup'); } else T.sfx('bump');
  T.majJetons();
  T.msg(gagne ? `Partie gagnée, ${score[0]} à ${score[1]} ! Tu remportes <b>${fr(mise * 2)}</b> jetons.` : `Partie perdue, ${score[0]} à ${score[1]}… Mamie Rose te console d'une tape sur l'épaule.`);
  await T.choisir([{ id: 'ok', html: '<b>Quitter la table</b>' }], { cancel: 'ok' });
  T.fermer();
}
