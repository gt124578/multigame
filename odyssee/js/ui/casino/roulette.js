// odyssee/js/ui/casino/roulette.js — la roulette européenne : la roue qui tourne (37 cases dans l'ordre du cylindre),
// la bille qui ralentit, rebondit et tombe dans sa case ; le tapis de mise cliquable (numéros pleins, colonnes,
// douzaines, chances simples) où l'on pose ses jetons, à la souris ou au clavier.
import * as C from '../../core/casino.js';
import { texte, rect, pave, ellipse, ease, clamp } from '../pixel.js';
import { moquette, jeton } from './dessin.js';
import { ouvrir, fr, pastille } from './commun.js';

const ORDRE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RX = 82, RY = 120, R_EXT = 66, R_CASES = 56, R_INT = 40;
const couleur = (n) => (n === 0 ? '#1e8f3e' : C.ROUGES.has(n) ? '#c41c26' : '#1c1c22');
const MISES = [1, 5, 10, 25, 50];

/* ---------- le tapis : chaque case est un pari (type, valeur) ---------- */
const TX = 166, TY = 44, CW = 15, CH = 18;
function casesTapis() {
  const L = [];
  L.push({ type: 'plein', v: 0, x: TX - 14, y: TY, w: 14, h: CH * 3, nom: '0' });
  for (let n = 1; n <= 36; n++) { const col = Math.floor((n - 1) / 3), rang = (n - 1) % 3; L.push({ type: 'plein', v: n, x: TX + col * CW, y: TY + (2 - rang) * CH, w: CW, h: CH, nom: String(n) }); }
  for (let k = 1; k <= 3; k++) L.push({ type: 'colonne', v: k, x: TX + 12 * CW, y: TY + (3 - k) * CH, w: 24, h: CH, nom: '2:1' });
  for (let k = 1; k <= 3; k++) L.push({ type: 'douzaine', v: k, x: TX + (k - 1) * 4 * CW, y: TY + 3 * CH, w: 4 * CW, h: 14, nom: ['1-12', '13-24', '25-36'][k - 1] });
  ['manque', 'pair', 'rouge', 'noir', 'impair', 'passe'].forEach((t, k) => L.push({ type: t, v: null, x: TX + k * 34, y: TY + 3 * CH + 14, w: 34, h: 14, nom: { manque: '1-18', pair: 'PAIR', rouge: '', noir: '', impair: 'IMPAIR', passe: '19-36' }[t] }));
  return L;
}
const CASES = casesTapis();
const cle = (c) => c.type + ':' + c.v;
/** navigation au clavier sur le tapis : la case voisine dans une direction (la plus proche par le centre) */
function voisine(c, dir) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2; let best = null, bd = Infinity;
  for (const o of CASES) {
    if (o === c) continue;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2, dx = ox - cx, dy = oy - cy;
    const ok = dir === 'left' ? dx < -1 && Math.abs(dy) < c.h / 2 + o.h / 2 : dir === 'right' ? dx > 1 && Math.abs(dy) < c.h / 2 + o.h / 2 : dir === 'up' ? dy < -1 : dy > 1;
    if (!ok) continue;
    const d = dir === 'left' || dir === 'right' ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 0.8;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function fondRoulette() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
  moquette(g, 0, 0, 400, 240);
  // la table : feutre vert sous la roue et le tapis
  pave(g, 4, 22, 392, 196, '#2a140a', '#120804'); pave(g, 7, 25, 386, 190, '#1d7a42', '#145a30');
  g.fillStyle = '#22844a'; for (let y = 26; y < 214; y++) for (let x = 8 + (y & 1); x < 392; x += 3) if (((x * 7 + y * 13) & 7) < 3) g.fillRect(x, y, 1, 1);
  // cuvette de la roue (bois)
  ellipse(g, RX, RY + 3, R_EXT + 8, R_EXT + 8, 'rgba(0,0,0,.4)');
  ellipse(g, RX, RY, R_EXT + 8, R_EXT + 8, '#3a1e0c'); ellipse(g, RX, RY, R_EXT + 6, R_EXT + 6, '#8a5028'); ellipse(g, RX, RY, R_EXT + 2, R_EXT + 2, '#5a3014');
  ellipse(g, RX, RY, R_EXT, R_EXT, '#2a160a');
  // le tapis
  for (const k of CASES) {
    const fondC = k.type === 'plein' ? couleur(k.v) : k.type === 'rouge' ? '#1d7a42' : k.type === 'noir' ? '#1d7a42' : '#1d7a42';
    rect(g, k.x, k.y, k.w, k.h, '#f0e8d0'); rect(g, k.x + 1, k.y + 1, k.w - 1, k.h - 1, fondC);
    if (k.type === 'rouge' || k.type === 'noir') { const cx = k.x + k.w / 2, cy = k.y + k.h / 2; g.fillStyle = k.type === 'rouge' ? '#c41c26' : '#1c1c22'; for (let j = -4; j <= 4; j++) { const w = 7 - Math.abs(j) * 1.6; g.fillRect(Math.round(cx - w), cy + j, Math.round(w * 2), 1); } }
    else texte(g, k.nom, k.x + k.w / 2 + 1, k.y + k.h / 2 - 3, '#f8f0e0', { a: 'c' });
  }
  rect(g, TX - 14, TY + CH * 3 + 28, 12 * CW + 39, 1, '#f0e8d0'); rect(g, TX + 12 * CW + 24, TY, 1, CH * 3 + 29, '#f0e8d0'); rect(g, TX + 4 * CW * 3, TY + CH * 3, 1, 14, '#f0e8d0');
  return c;
}
/** la roue dessinée au pixel près pour un angle donné (rendu dans une petite toile) */
function dessinerRoue(g, angle) {
  const S = R_CASES * 2 + 2, img = g.createImageData(S, S), d = img.data, o = R_CASES;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const cols = ORDRE.map((n) => hex(couleur(n))), sep = [200, 170, 90], cone = [[120, 70, 30], [150, 92, 44], [96, 54, 22]];
  for (let y = -o; y <= o; y++) for (let x = -o; x <= o; x++) {
    const r = Math.sqrt(x * x + y * y); if (r > R_CASES) continue;
    let a = Math.atan2(y, x) - angle; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const f = a / (Math.PI * 2) * 37, k = Math.floor(f), frac = f - k;
    let c;
    if (r > R_INT + 1) c = frac < 0.08 || r > R_CASES - 1 ? sep : cols[k];
    else if (r > R_INT - 1) c = sep;
    else { const b = Math.floor((a / (Math.PI * 2)) * 8 + r / 9) % 3; c = r < 8 ? [220, 180, 70] : cone[b]; }
    // lumière en haut à gauche
    const l = 1 + (-x - y) / (R_CASES * 6);
    const i = ((y + o) * S + (x + o)) * 4; d[i] = Math.min(255, c[0] * l); d[i + 1] = Math.min(255, c[1] * l); d[i + 2] = Math.min(255, c[2] * l); d[i + 3] = 255;
  }
  return img;
}

export async function rouletteTable(game) {
  const T = await ouvrir(game, 'roul', 'Roulette'), st = T.st, g = T.g, fond = fondRoulette();
  const [roue, rg] = (() => { const c = document.createElement('canvas'); c.width = c.height = R_CASES * 2 + 2; return [c, c.getContext('2d')]; })();
  let angle = 0, vRoue = 0.4, bille = null, tourne = false, gagnant = null, historique = [], valeur = 5, curseur = CASES.find((c) => c.type === 'rouge'), focus = 'tapis', clign = 0;
  const paris = new Map();   // cle → { type, v, mise }
  const totalParis = () => [...paris.values()].reduce((a, p) => a + p.mise, 0);
  const poser = (c) => {
    if (tourne) return;
    const v = Math.min(valeur, st.jetons); if (v <= 0) { T.msg('Plus de jetons : passe au comptoir.'); T.sfx('bump'); return; }
    const k = cle(c), p = paris.get(k) || { type: c.type, v: c.v, mise: 0 }; p.mise += v; paris.set(k, p);
    st.jetons -= v; T.majJetons(); T.sfx('blip'); gagnant = null; majBoutons();
  };
  const retirer = (c) => { const p = paris.get(cle(c)); if (!p) return; st.jetons += p.mise; paris.delete(cle(c)); T.majJetons(); T.sfx('cancel'); majBoutons(); };
  let majBoutons = () => {};

  T.boucle((now, dt) => {
    g.drawImage(fond, 0, 0);
    // la roue tourne (lentement au repos)
    angle += vRoue * dt;
    if (tourne) {
      const t = (now - bille.t0) / bille.dur;
      vRoue = Math.max(0.35, bille.v0 * (1 - ease.out(t)) + 0.35);
    }
    rg.putImageData(dessinerRoue(rg, angle), 0, 0);
    g.drawImage(roue, RX - R_CASES - 1, RY - R_CASES - 1);
    // croisillon doré au centre
    for (let k = 0; k < 4; k++) { const a = angle + k * Math.PI / 2; for (let r = 3; r < 16; r++) rect(g, Math.round(RX + Math.cos(a) * r), Math.round(RY + Math.sin(a) * r), 1, 1, r > 12 ? '#ffe9a0' : '#d8a830'); }
    ellipse(g, RX, RY, 3, 3, '#ffe9a0');
    // la bille
    if (bille) {
      const t = clamp((now - bille.t0) / bille.dur, 0, 1);
      // angle de la bille relatif à la roue : elle tourne à l'envers, ralentit, puis suit sa case
      const rel = bille.fin + bille.tours * Math.pow(1 - t, 3);
      const a = angle + rel;
      let r = t < 0.62 ? R_EXT - 4 : t < 0.86 ? (R_EXT - 4) - (R_EXT - 4 - (R_CASES - 7)) * ease.out((t - 0.62) / 0.24) : R_CASES - 7;
      if (t > 0.62 && t < 0.9) r += Math.abs(Math.sin((t - 0.62) * 50)) * 3 * (1 - (t - 0.62) / 0.28);   // rebonds sur les séparations
      const bx = RX + Math.cos(a) * r, by = RY + Math.sin(a) * r;
      ellipse(g, bx + 1, by + 1, 1, 1, 'rgba(0,0,0,.5)'); ellipse(g, bx, by, 1, 1, '#f8f8f8'); rect(g, Math.round(bx) - 1, Math.round(by) - 1, 1, 1, '#ffffff');
    }
    // le dernier numéro sorti, l'historique
    if (gagnant != null) {
      pave(g, RX - 14, 194, 28, 18, couleur(gagnant), '#f0e8d0'); texte(g, String(gagnant), RX, 196, '#fff', { a: 'c', e: 2, ombre: '#000' });
    }
    texte(g, 'DERNIERS :', TX - 14, 30, '#a8d8b0');
    historique.slice(-12).reverse().forEach((n, k) => { const x = TX + 50 + k * 14; pave(g, x, 28, 13, 11, couleur(n), k ? '#000' : '#ffe040'); texte(g, String(n), x + 7, 30, '#fff', { a: 'c' }); });
    // le tapis : survol, jetons posés, gagnants
    clign += dt;
    const sur = T.survol && T.survol.type ? T.survol : null;
    for (const c of CASES) {
      T.zone(c.x, c.y, c.w, c.h, (x, y, e) => { if (e.button === 2) retirer(c); else { curseur = c; poser(c); } }, c);
      const gagne = gagnant != null && C.PARIS[c.type].gagne(gagnant, c.v);
      if (gagne && Math.floor(clign * 4) % 2) { g.fillStyle = 'rgba(255,240,120,.45)'; g.fillRect(c.x + 1, c.y + 1, c.w - 1, c.h - 1); }
      if (c === sur || (focus === 'tapis' && c === curseur && !tourne)) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(c.x + 1, c.y + 1, c.w - 1, c.h - 1); }
      const p = paris.get(cle(c));
      if (p) { const jx = c.x + c.w / 2 - 5, jy = c.y + c.h / 2 - 2; const n = Math.min(5, Math.ceil(p.mise / 5)); for (let k = 0; k < n; k++) jeton(g, jx, jy - k * 2, p.mise >= 50 ? 50 : p.mise >= 25 ? 25 : p.mise >= 10 ? 10 : p.mise >= 5 ? 5 : 1); texte(g, String(p.mise), c.x + c.w / 2, jy - n * 2 - 7, '#fff', { a: 'c', ombre: '#000' }); }
    }
    if (focus === 'tapis' && !tourne) { const c = curseur; g.strokeStyle = '#ffe040'; g.lineWidth = 1; g.strokeRect(c.x + 0.5, c.y + 0.5, c.w, c.h); }
    // résumé des paris
    const tot = totalParis(); texte(g, `MISE TOTALE ${tot}`, TX - 14, TY + CH * 3 + 34, '#f8f0c0', { ombre: '#000' });
    texte(g, 'CLIC : MISER   CLIC DROIT : RETIRER', TX - 14, TY + CH * 3 + 44, '#a8d8b0');
  });

  const lancer = async () => {
    const n = C.tirerRoulette(C.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    const fin = (ORDRE.indexOf(n) + 0.5) / 37 * Math.PI * 2;
    // tours de la bille (relatifs à la roue, à l'envers), du lancer à l'arrêt
    bille = { t0: performance.now(), dur: 5200, fin, tours: -(Math.PI * 2) * (5 + Math.random()), v0: 2.2 }; tourne = true;
    gagnant = null; T.msg('Rien ne va plus !'); T.sfx('select');
    const tic = setInterval(() => T.sfx('blip'), 260);
    await T.pause(bille.dur * 0.62); clearInterval(tic);
    for (let i = 0; i < 5; i++) { T.sfx('bump'); await T.pause(220 - i * 30); }
    await T.pause(bille.dur * 0.38 - 700);
    gagnant = n; historique.push(n); clign = 0;
    const g2 = C.gainRoulette([...paris.values()], n);
    st.jetons += g2; T.majJetons();
    T.msg(`Le <b>${n}</b> ${n === 0 ? '(zéro)' : C.ROUGES.has(n) ? 'rouge' : 'noir'} ! ${g2 ? `Tu gagnes <b>${fr(g2)}</b> jetons.` : 'Rien pour cette fois…'}`);
    T.sfx(g2 ? 'item' : 'bump');
    await T.pause(600);
    tourne = false;   // la bille reste dans sa case jusqu'au prochain lancer
    paris.clear();
  };

  T.msg('Choisis un jeton, puis pose-le sur le tapis (flèches + A, ou clic).');
  for (;;) {
    T.majJetons();
    const defs = () => [
      ...MISES.map((v) => ({ id: 'v' + v, html: pastille(v), cls: 'jeton' + (v === valeur ? ' choisi' : ''), off: v > Math.max(st.jetons, 1) && v !== 1 })),
      { id: 'annuler', label: 'Tout reprendre', off: !paris.size },
      { id: 'lancer', html: '<b>Lancer la bille</b>', cls: 'fort', off: !paris.size },
      { id: 'quitter', label: 'Quitter' },
    ];
    majBoutons = () => { T.majBouton('annuler', { off: !paris.size }); T.majBouton('lancer', { off: !paris.size }); };
    focus = 'tapis'; T.barre.classList.add('inactif');
    const id = await T.choisir(defs(), {
      start: paris.size ? 'lancer' : 'v' + valeur, cancel: 'quitter',
      onKey: (k) => {
        if (focus !== 'tapis') { if (k === 'up') { focus = 'tapis'; T.barre.classList.add('inactif'); T.sfx('blip'); return true; } return false; }
        if (k === 'a') { poser(curseur); return true; }
        if (k === 'b') { if (paris.get(cle(curseur))) { retirer(curseur); return true; } return false; }
        if (k === 'down' && curseur.y + curseur.h >= TY + CH * 3 + 28) { focus = 'boutons'; T.barre.classList.remove('inactif'); T.sfx('blip'); return true; }
        const v = voisine(curseur, k); if (v) { curseur = v; T.sfx('blip'); }
        return true;
      },
    });
    if (id === 'quitter' || id === undefined) { for (const p of paris.values()) st.jetons += p.mise; paris.clear(); break; }
    if (id[0] === 'v') { valeur = +id.slice(1); T.sfx('select'); continue; }
    if (id === 'annuler') { for (const p of paris.values()) st.jetons += p.mise; paris.clear(); continue; }
    if (id === 'lancer') await lancer();
  }
  T.fermer();
}
