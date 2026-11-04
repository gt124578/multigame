// odyssee/js/ui/casino/machine.js — la machine à sous : trois rouleaux qui tournent et s'arrêtent l'un après l'autre,
// une ligne de paiement, des ampoules qui clignotent, un levier (clic ou touche A), les gains qui tombent dans le bac.
import * as C from '../../core/casino.js';
import { texte, rect, pave, ellipse, trame, ease, clamp } from '../pixel.js';
import { symbole, moquette } from './dessin.js';
import { ouvrir, fr } from './commun.js';

const MISES = [1, 2, 3, 5, 10];
// bande de chaque rouleau : chaque symbole autant de fois que son poids (le tirage, lui, vient du moteur)
const BANDE = ['7', 'Baie', 'Poké Ball', 'Baie', 'Étoile', 'Pierre Lune', 'Baie', 'BAR', 'Poké Ball', 'Baie', 'Pierre Lune', 'Étoile', 'Poké Ball', 'Baie', 'BAR', 'Pierre Lune', 'Poké Ball', 'Étoile', 'Baie', 'Pierre Lune'];
const PAYE = [['7', 100], ['BAR', 30], ['Étoile', 15], ['Poké Ball', 10], ['Pierre Lune', 8], ['Baie', 4]];
const MX = 120, MW = 160, RX = [136, 182, 228], RY = 50, RH = 72;

export async function machineASous(game) {
  const T = await ouvrir(game, 'slots', 'Machine à sous'), st = T.st, g = T.g;
  let mise = Math.min(st.jetons, 1), gain = 0, affGain = 0, enJeu = false, tGain = 0, levier = 0, pieces = [];
  const rou = [0, 1, 2].map((k) => ({ pos: k * 7 + 3, v: 0, tween: null }));
  // décor fixe : mur de velours, moquette, machines voisines dans la pénombre
  const [fond, fg] = (() => { const c = document.createElement('canvas'); c.width = 400; c.height = 240; return [c, c.getContext('2d')]; })();
  trame(fg, 0, 0, 400, 190, '#2a0a12', '#34101a', 4, 3);
  for (let x = 0; x < 400; x += 20) rect(fg, x, 0, 1, 190, '#20060c');
  rect(fg, 0, 186, 400, 4, '#7a5a20'); moquette(fg, 0, 190, 400, 50);
  for (const x of [-60, 300]) { pave(fg, x + 20, 30, 120, 170, '#1c1418', '#0c080a'); rect(fg, x + 34, 60, 92, 50, '#100c10'); rect(fg, x + 34, 140, 92, 30, '#16101a'); }
  const ampoule = (x, y, on) => { rect(g, x, y, 3, 3, on ? '#fff6b0' : '#8a6a20'); if (on) { rect(g, x + 1, y + 1, 1, 1, '#ffffff'); g.fillStyle = 'rgba(255,240,140,.25)'; g.fillRect(x - 1, y - 1, 5, 5); } };

  const dessine = (now, dt) => {
    g.drawImage(fond, 0, 0);
    // corps de la machine
    pave(g, MX - 4, 10, MW + 8, 226, '#3a2a10', '#120c04');
    pave(g, MX, 12, MW, 222, '#c8a040', '#5a3a10');
    rect(g, MX + 3, 14, MW - 6, 2, '#ffe090'); rect(g, MX + 2, 16, 2, 210, '#e8c060'); rect(g, MX + MW - 4, 16, 2, 210, '#8a6020');
    // fronton : JACKPOT et ampoules
    pave(g, MX + 8, 18, MW - 16, 26, '#7a0c18', '#2a0408');
    const clign = Math.floor(now / (tGain > 0 ? 90 : 400));
    for (let i = 0; i < 18; i++) { ampoule(MX + 10 + i * 8, 15, (i + clign) % 3 === 0); ampoule(MX + 10 + i * 8, 44, (i + clign) % 3 === 1); }
    texte(g, tGain > 0 && gain >= 30 * mise ? 'JACKPOT !' : 'JACKPOT', 200, 24, Math.floor(now / 150) % 2 && tGain > 0 ? '#ffffff' : '#ffd23f', { a: 'c', e: 2, ombre: '#3a0000' });
    // fenêtre des rouleaux
    pave(g, MX + 8, RY - 4, MW - 16, RH + 8, '#d8d8e0', '#40404a'); rect(g, MX + 10, RY - 2, MW - 20, 1, '#ffffff');
    rou.forEach((R, k) => {
      const x = RX[k];
      rect(g, x, RY, 36, RH, '#f8f6f0');
      g.save(); g.beginPath(); g.rect(x, RY, 36, RH); g.clip();
      const base = Math.floor(R.pos);
      for (let i = base - 2; i <= base + 2; i++) {
        const sym = BANDE[((i % BANDE.length) + BANDE.length) % BANDE.length], y = RY + RH / 2 - 12 + (R.pos - i) * 24;
        if (R.v > 6) { g.globalAlpha = 0.35; g.drawImage(symbole(sym), x + 6, Math.round(y - 6)); g.globalAlpha = 1; }
        g.drawImage(symbole(sym), x + 6, Math.round(y));
      }
      g.restore();
      // ombre de courbure du cylindre
      for (let j = 0; j < 10; j++) { g.fillStyle = `rgba(30,20,10,${0.5 - j * 0.05})`; g.fillRect(x, RY + j, 36, 1); g.fillRect(x, RY + RH - 1 - j, 36, 1); }
      rect(g, x - 1, RY, 1, RH, '#60606a'); rect(g, x + 36, RY, 1, RH, '#60606a');
    });
    // ligne de paiement
    const ly = RY + RH / 2;
    rect(g, MX + 10, ly, MW - 20, 1, tGain > 0 && Math.floor(now / 120) % 2 ? '#ffffff' : 'rgba(230,30,40,.85)');
    g.fillStyle = '#e01c28'; for (let j = -3; j <= 3; j++) { g.fillRect(MX + 9, ly + j, 3 - Math.abs(j), 1); g.fillRect(MX + MW - 9 - (3 - Math.abs(j)), ly + j, 3 - Math.abs(j), 1); }
    // compteurs à diodes
    const led = (x, w, titre, v) => { texte(g, titre, x + w / 2, 128, '#3a2408', { a: 'c' }); pave(g, x, 136, w, 13, '#120404', '#000'); texte(g, String(v), x + w - 3, 139, '#ff3a2a', { a: 'd' }); };
    led(MX + 10, 54, 'JETONS', st.jetons); led(MX + 68, 30, 'MISE', mise); led(MX + 102, 48, 'GAIN', Math.round(affGain));
    // table des gains
    pave(g, MX + 8, 154, MW - 16, 56, '#1a1020', '#000');
    PAYE.forEach(([s, m], i) => {
      const cx = MX + 12 + (i % 2) * 72, cy = 157 + Math.floor(i / 2) * 15;
      for (let k = 0; k < 3; k++) g.drawImage(symbole(s), 0, 0, 24, 24, cx + k * 13, cy, 12, 12);
      texte(g, '×' + m, cx + 66, cy + 3, '#ffd23f', { a: 'd' });
    });
    texte(g, '1 BAIE ×1  2 BAIES ×2', 200, 201, '#c8b8e0', { a: 'c' });
    // bac à pièces
    pave(g, MX + 24, 213, MW - 48, 17, '#30303a', '#0a0a10'); rect(g, MX + 26, 215, MW - 52, 4, '#101016');
    for (const p of pieces) { p.vy += 400 * dt; p.y = Math.min(p.sol, p.y + p.vy * dt); if (p.y >= p.sol) p.vy = 0; ellipse(g, p.x, p.y, 2, 1, '#f0c030'); rect(g, p.x - 1, p.y - 1, 2, 1, '#fff0a0'); }
    // le levier (cliquable)
    const lv = ease.out(levier), hy = 70 + lv * 60;
    rect(g, MX + MW + 4, 120, 8, 22, '#5a5a66'); rect(g, MX + MW + 5, 121, 6, 20, '#9a9aa8');
    rect(g, MX + MW + 7, Math.min(hy, 126), 3, Math.abs(126 - hy) + 1, '#c8c8d4');
    ellipse(g, MX + MW + 8, hy, 6, 6, '#7a0810'); ellipse(g, MX + MW + 8, hy - 1, 5, 5, '#e02030'); rect(g, MX + MW + 6, hy - 4, 2, 2, '#ff9a9a');
    T.zone(MX + MW, 60, 24, 90, () => { if (!enJeu) T.resoudre('lancer'); });
    T.zone(MX + 8, RY - 4, MW - 16, RH + 8, () => { if (!enJeu) T.resoudre('lancer'); });
    // les rouleaux avancent
    for (const R of rou) {
      if (R.tween) { const tw = R.tween, p = clamp((now - tw.t0) / tw.dur, 0, 1); R.pos = tw.p0 + (tw.cible - tw.p0) * ease.back(p); R.v = (1 - p) * 10; if (p >= 1) { R.pos = tw.cible; R.tween = null; R.v = 0; tw.fin(); } }
      else R.pos += R.v * dt;
    }
    if (levier > 0 && !enJeu) levier = Math.max(0, levier - dt * 3);
    if (tGain > 0) { tGain -= dt; affGain = Math.min(gain, affGain + Math.max(1, gain) * dt * 1.5); }
  };
  T.boucle(dessine);
  T.msg('Aligne trois symboles sur la ligne rouge. ↑ ↓ : changer la mise.');

  const arreter = (R, sym) => new Promise((fin) => {
    const choix = BANDE.map((s, i) => (s === sym ? i : -1)).filter((i) => i >= 0), idx = choix[Math.floor(Math.random() * choix.length)];
    let cible = Math.ceil(R.pos) + 3; while (((cible % BANDE.length) + BANDE.length) % BANDE.length !== idx) cible++;
    R.tween = { p0: R.pos, cible, t0: performance.now(), dur: 380 + (cible - R.pos) * 30, fin };
  });
  for (;;) {
    T.majJetons();
    const peut = st.jetons > 0 && mise > 0 && mise <= st.jetons;
    const id = await T.choisir([
      { id: 'moins', label: '− Mise', off: MISES.indexOf(mise) <= 0 },
      { id: 'plus', label: '+ Mise', off: !MISES.some((m) => m > mise && m <= st.jetons) },
      { id: 'lancer', html: `<b>Lancer !</b> <small>${mise} jeton${mise > 1 ? 's' : ''}</small>`, off: !peut, cls: 'fort' },
      { id: 'quitter', label: 'Quitter' },
    ], { start: 'lancer', cancel: 'quitter', cls: 'gauche', onKey: (k) => { if (k === 'up') { T.resoudre('plus'); return true; } if (k === 'down') { T.resoudre('moins'); return true; } return false; } });
    if (id === 'quitter' || id === undefined) break;
    if (id === 'plus') { const m = MISES.find((x) => x > mise && x <= st.jetons); if (m) { mise = m; T.sfx('blip'); } continue; }
    if (id === 'moins') { const m = [...MISES].reverse().find((x) => x < mise); if (m) { mise = m; T.sfx('blip'); } continue; }
    if (!peut) { if (st.jetons <= 0) { T.msg('Plus de jetons ! Le comptoir est à l\'entrée.'); } continue; }
    // on tire le levier
    enJeu = true; gain = 0; affGain = 0; tGain = 0; pieces = [];
    st.jetons -= mise; T.majJetons(); T.msg('');
    for (let i = 0; i <= 10; i++) { levier = i / 10; await T.pause(16); }
    const fin = C.tirerRouleaux(C.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    rou.forEach((R) => { R.v = 16 + Math.random() * 4; });
    const tic = setInterval(() => T.sfx('blip'), 110);
    for (let k = 0; k < 3; k++) { await T.pause(k ? 380 : 650); await arreter(rou[k], fin[k]); T.sfx('bump'); }
    clearInterval(tic);
    gain = C.gainMachine(fin, mise); st.jetons += gain; T.majJetons();
    if (gain) {
      tGain = 2.2; T.sfx(gain >= 30 * mise ? 'levelup' : 'item');
      for (let i = 0; i < Math.min(30, gain); i++) pieces.push({ x: MX + 32 + Math.random() * (MW - 64), y: 200 - Math.random() * 30, vy: 0, sol: 223 + Math.random() * 5 });
      T.msg(`${gain >= 30 * mise ? '<b>Jackpot !</b> ' : ''}Gagné : <b>${fr(gain)}</b> jeton${gain > 1 ? 's' : ''} !`);
    } else T.msg('Perdu… Retente ta chance !');
    enJeu = false;
    if (mise > st.jetons) mise = [...MISES].reverse().find((m) => m <= st.jetons) || 0;
  }
  T.fermer();
}
