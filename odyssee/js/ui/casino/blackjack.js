// odyssee/js/ui/casino/blackjack.js — la table de blackjack : le croupier derrière son demi-cercle de feutre, le sabot,
// les cartes qui glissent jusqu'aux places, la carte cachée qui se retourne, les jetons sur le cercle de mise.
import * as C from '../../core/casino.js';
import { texte, rect, pave } from '../pixel.js';
import { moquette, perso, piles, jeton } from './dessin.js';
import { ouvrir, fr, pastille, Cartes } from './commun.js';

const SABOT = [318, 54], DX = 15;
const JETONS = [1, 5, 10, 25, 50];

function fondTable() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
  moquette(g, 0, 0, 400, 240);
  // le croupier, debout derrière la table
  perso(g, 'croupier', 'down', 200, 76);
  // demi-cercle de feutre : le bord droit côté croupier, l'arrondi côté joueurs
  const cx = 200, cy = 46, rx = 186, ry = 186;
  const demi = (r1, r2, col) => { g.fillStyle = col; for (let y = 0; y <= r2; y++) { const w = Math.round(r1 * Math.sqrt(Math.max(0, 1 - (y * y) / (r2 * r2)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
  demi(rx + 10, ry + 10, '#2a140a'); demi(rx + 9, ry + 9, '#6a3a1a'); demi(rx + 7, ry + 7, '#8a5028'); demi(rx + 3, ry + 3, '#4a2810'); demi(rx + 2, ry + 2, '#145a30'); demi(rx, ry, '#1d7a42');
  g.fillStyle = '#22844a'; for (let y = 0; y < ry; y++) { const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry))); for (let x = -w + (y & 1); x <= w; x += 3) if (((x * 7 + y * 13) & 7) < 3) g.fillRect(cx + x, cy + y, 1, 1); }
  rect(g, cx - rx - 10, cy - 4, (rx + 10) * 2 + 1, 5, '#2a140a'); rect(g, cx - rx - 9, cy - 3, (rx + 9) * 2 - 1, 2, '#6a3a1a');
  // inscriptions sur le feutre
  g.fillStyle = '#3aa860'; for (let a = 0.12; a < Math.PI - 0.12; a += 0.006) g.fillRect(Math.round(cx + Math.cos(a) * 120), Math.round(cy + Math.sin(a) * 112), 1, 1);
  texte(g, 'LE BLACKJACK PAIE 3 CONTRE 2', 200, 110, '#e8d070', { a: 'c' });
  texte(g, 'LE CROUPIER TIRE JUSQU\'A 16 ET RESTE A 17', 200, 120, '#a8d8b0', { a: 'c' });
  // cercle de mise du joueur
  for (let a = 0; a < 6.283; a += 0.03) g.fillRect(Math.round(200 + Math.cos(a) * 20), Math.round(198 + Math.sin(a) * 9), 1, 1);
  g.fillStyle = '#e8d070'; for (let a = 0; a < 6.283; a += 0.03) g.fillRect(Math.round(200 + Math.cos(a) * 20), Math.round(198 + Math.sin(a) * 9), 1, 1);
  // sabot et défausse
  pave(g, 300, 46, 36, 24, '#3a2010', '#120804'); rect(g, 304, 49, 24, 14, '#24408c'); for (let i = 0; i < 6; i++) rect(g, 305 + i * 4, 50, 1, 12, '#3a5cc0'); rect(g, 300, 64, 36, 6, '#5a3418');
  pave(g, 64, 46, 30, 18, '#3a2010', '#120804'); rect(g, 68, 49, 22, 10, '#e8e4d8'); rect(g, 68, 56, 22, 1, '#c8c0a8');
  // le râtelier de jetons du croupier
  pave(g, 160, 44, 80, 12, '#2a1a10', '#0c0604');
  [100, 25, 25, 5, 5, 1, 1].forEach((v, i) => { for (let k = 0; k < 3; k++) jeton(g, 163 + i * 11, 47 + 2 - k, v); });
  return c;
}

export async function blackjackTable(game) {
  const T = await ouvrir(game, 'bj', 'Blackjack'), st = T.st, g = T.g, fond = fondTable();
  const cartes = new Cartes();
  let mise = 0, derniere = 0, p = null, totaux = null, enJeu = 0, gainAff = 0, perdue = 0;
  T.boucle((now) => {
    g.drawImage(fond, 0, 0);
    cartes.dessine(g, now);
    // les totaux
    if (totaux) {
      const badge = (x, y, v, col) => { const w = 7 + String(v).length * 6; pave(g, x - w / 2, y, w, 11, col, '#000'); texte(g, String(v), x, y + 2, '#fff', { a: 'c' }); };
      if (totaux.c != null) badge(200, 96, totaux.c, totaux.c > 21 ? '#a01818' : '#283850');
      if (totaux.j != null) badge(200, 172, totaux.j, totaux.j > 21 ? '#a01818' : totaux.j === 21 ? '#1e8a3a' : '#283850');
    }
    // jetons misés sur le cercle, gains à côté
    if (enJeu) piles(g, enJeu, 200, 200, { etiquette: true });
    if (gainAff) piles(g, gainAff, 236, 204, { coul: '#8aff9a' });
    if (perdue) { piles(g, perdue, 250, 62, { etiquette: false }); }
  });

  for (;;) {
    T.majJetons();
    // les mises
    if (derniere && derniere <= st.jetons && !mise) { mise = derniere; }
    if (mise > st.jetons) mise = 0;
    enJeu = mise;
    if (!p) T.msg('Choisis ta mise avec les jetons, puis distribue.');
    const id = await T.choisir([
      ...JETONS.map((v) => ({ id: 'j' + v, html: pastille(v), cls: 'jeton', off: mise + v > st.jetons, titre: `Ajouter ${v}` })),
      { id: 'effacer', label: 'Effacer', off: !mise },
      { id: 'donner', html: `<b>Distribuer</b> <small>${mise}</small>`, cls: 'fort', off: !mise },
      { id: 'quitter', label: 'Quitter' },
    ], { start: mise ? 'donner' : 'j1', cancel: 'quitter' });
    if (id === 'quitter' || id === undefined) break;
    if (id === 'effacer') { mise = 0; T.sfx('cancel'); continue; }
    if (id[0] === 'j') { mise += +id.slice(1); T.sfx('blip'); p = null; totaux = null; gainAff = 0; perdue = 0; cartes.vide(); continue; }
    // la donne
    derniere = mise; st.jetons -= mise; T.majJetons(); enJeu = mise; gainAff = 0; perdue = 0;
    cartes.vide(); T.msg('');
    p = C.donneBJ(C.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0), mise);
    const spJ = [], spC = [];
    const posJ = (i, n) => [200 - 12 - ((n - 1) * DX) / 2 + i * DX, 134 - i * 2];
    const posC = (i, n) => [200 - 12 - ((n - 1) * DX) / 2 + i * DX, 58];
    const recadre = () => { spJ.forEach((sp, i) => { const [x, y] = posJ(i, spJ.length); cartes.deplace(sp, x, y, 200); }); spC.forEach((sp, i) => { const [x, y] = posC(i, spC.length); cartes.deplace(sp, x, y, 200); }); };
    const donneJ = async () => { const i = spJ.length; spJ.push(cartes.ajoute(p.joueur[i], ...posJ(i, i + 1), { de: SABOT, z: i })); recadre(); T.sfx('blip'); await T.pause(300); };
    const donneC = async (face = true) => { const i = spC.length; spC.push(cartes.ajoute(p.croupier[i], ...posC(i, i + 1), { de: SABOT, face, z: i })); recadre(); T.sfx('blip'); await T.pause(300); };
    await donneJ(); await donneC(); await donneJ(); await donneC(false);
    const majTotaux = (tout) => { totaux = { j: C.totalBJ(p.joueur).t, c: tout ? C.totalBJ(p.croupier).t : C.totalBJ([p.croupier[0]]).t }; };
    majTotaux(false);
    if (C.blackjack(p.joueur) || C.blackjack(p.croupier)) C.finirBJ(p);
    while (!p.fini) {
      const peutDoubler = p.joueur.length === 2 && st.jetons >= p.mise;
      T.msg(`Tu as <b>${C.totalBJ(p.joueur).t}</b>. Le croupier montre ${C.nomCarte(p.croupier[0]).replace(/[♠♥♦♣]/, '')}.`);
      const a = await T.choisir([
        { id: 'tirer', html: '<b>Tirer</b>', cls: 'vert' },
        { id: 'rester', html: '<b>Rester</b>', cls: 'fort' },
        { id: 'doubler', html: `Doubler <small>+${p.mise}</small>`, off: !peutDoubler },
      ], { start: 'tirer' });
      if (a === undefined) break;
      if (a === 'tirer') { C.tirerBJ(p); await donneJ(); majTotaux(false); }
      else if (a === 'rester') C.finirBJ(p);
      else { st.jetons -= p.mise; enJeu = p.mise * 2; T.majJetons(); p.mise *= 2; p.double = true; p.joueur.push(p.sabot.pop()); await donneJ(); C.finirBJ(p); }
    }
    if (!p.fini) break;
    // le croupier retourne sa carte et tire
    T.msg('');
    const tj = C.totalBJ(p.joueur).t;
    while (spJ.length < p.joueur.length) await donneJ();
    cartes.retourne(spC[1]); T.sfx('select'); await T.pause(420); majTotaux(true);
    while (spC.length < p.croupier.length) { await T.pause(250); await donneC(); majTotaux(true); }
    await T.pause(250);
    st.jetons += p.rendu; T.majJetons();
    if (p.rendu > p.mise) { gainAff = p.rendu - p.mise; T.sfx('item'); }
    else if (p.rendu === 0) { perdue = enJeu; enJeu = 0; T.sfx('bump'); }
    else T.sfx('blip');
    T.msg(`<b>${p.resultat}</b>${p.rendu > p.mise ? ` +${fr(p.rendu - p.mise)} jetons` : ''}${tj > 21 ? '' : ` (${tj} contre ${C.totalBJ(p.croupier).t})`}`);
    mise = derniere <= st.jetons ? derniere : 0;
  }
  T.fermer();
}
