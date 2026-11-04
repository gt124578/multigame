// odyssee/js/ui/arcade.js — les bornes d'arcade du Casino de Métropole : un meuble de borne dessiné (fronton éclairé,
// écran dans son cadre, manette et boutons qui s'enfoncent), l'écran du jeu en 168 × 176 avec ses lignes de balayage,
// les commandes au clavier et des boutons tactiles (croix et A / B) de chaque côté. Les règles sont dans core/arcade.js.
import * as A from '../core/arcade.js';
import { scene, etiquette, texte, largeur, rect, pave, ellipse, toile } from './pixel.js';
import { el, esc } from './ui.js';

const EW = A.ECRAN.w, EH = A.ECRAN.h, EX = 116, EY = 34;
// clavier de la borne : flèches / ZQSD, A = F ou Entrée, B = Espace, pause = Échap
const TOUCHES = {
  ArrowUp: 'haut', KeyW: 'haut', ArrowDown: 'bas', KeyS: 'bas', ArrowLeft: 'gauche', KeyA: 'gauche', ArrowRight: 'droite', KeyD: 'droite',
  KeyF: 'A', Enter: 'A', NumpadEnter: 'A', KeyE: 'A', KeyK: 'A', Space: 'B', KeyJ: 'B', KeyL: 'B',
  Escape: 'pause', Backspace: 'pause', KeyP: 'pause', KeyX: 'pause',
};

/* ---------------- sprites des jeux ---------------- */
const bm = (s) => s.split('|');
const ALIENS = [
  [bm('...##...|..####..|.######.|##.##.##|########|..#..#..|.#.##.#.|#.#..#.#'), bm('...##...|..####..|.######.|##.##.##|########|.#.##.#.|#......#|.#....#.')],
  [bm('.#....#.|..#..#..|.######.|##.##.##|########|#.####.#|#.#..#.#|...##...'), bm('.#....#.|#.#..#.#|#.####.#|##.##.##|########|.######.|.#....#.|#......#')],
  [bm('..####..|.######.|########|##.##.##|########|..#..#..|.##..##.|##....##'), bm('..####..|.######.|########|##.##.##|########|.##..##.|##.##.##|.#....#.')],
];
const CANON = bm('.....#.....|....###....|.#########.|###########|###########|###########');
const OVNI = bm('.....######.....|...##########...|..############..|.##.##.##.##.##.|################|..###..##..###..|...#........#...');
const BOUM = bm('#...#..#|.#..#.#.|..#...#.|##.....#|...#..##|.#..#...|#.#..#..|...#...#');
function sprite(g, rows, x, y, col) { g.fillStyle = col; for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '#') g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1); }
const COUL_T = [null, '#40d8f8', '#f8d840', '#b060f0', '#50d860', '#f05050', '#4870f0', '#f89830'];
function bloc(g, x, y, c, s = 8) {
  rect(g, x, y, s, s, c); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x, y, s, 1); g.fillRect(x, y, 1, s);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + s - 1, s, 1); g.fillRect(x + s - 1, y, 1, s); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 2, y + 2, 2, 2);
}
const nb = (n, l = 6) => String(Math.max(0, Math.floor(n))).padStart(l, '0');

/* ---------------- un jeu = moteur + dessin + commandes ---------------- */
const JEU = {
  tetris: {
    nouveau: (s) => A.tetrisNouveau(s),
    appui: (t, k) => { if (k === 'gauche') A.tetrisBouger(t, -1); else if (k === 'droite') A.tetrisBouger(t, 1); else if (k === 'haut' || k === 'A') return A.tetrisTourner(t, 1) && 'blip'; else if (k === 'B') { A.tetrisLacher(t); return 'bump'; } return null; },
    repete: ['gauche', 'droite'],
    pas: (t, dt, h) => { const l = t.lignes, p = t.pieces; A.tetrisPas(t, dt, { bas: h.bas }); return t.lignes > l ? (t.lignes - l >= 4 ? 'levelup' : 'select') : t.pieces > p ? 'bump' : null; },
    dessin(g, t, now, rec) {
      rect(g, 0, 0, EW, EH, '#0a0c1c');
      g.fillStyle = '#121838'; for (let y = 0; y < EH; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < EW; x += 8) g.fillRect(x, y, 1, 1);
      // le puits
      rect(g, 6, 6, 84, 164, '#5a6a9a'); rect(g, 7, 7, 82, 162, '#20284a'); rect(g, 8, 8, 80, 160, '#05060e');
      g.fillStyle = '#0c1024'; for (let x = 1; x < 10; x++) g.fillRect(8 + x * 8, 8, 1, 160); for (let y = 1; y < 20; y++) g.fillRect(8, 8 + y * 8, 80, 1);
      const flash = t.effaces.length && Math.floor(now / 60) % 2;
      for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) { const v = t.grille[y * 10 + x]; if (!v) continue; bloc(g, 8 + x * 8, 8 + y * 8, flash && t.effaces.includes(y) ? '#ffffff' : COUL_T[v]); }
      if (t.piece && !t.fini) {
        const P = t.piece, cs = A.cellules(P.k, P.rot), fy = A.tetrisFantome(t), col = COUL_T[A.PIECES[P.k].c];
        g.strokeStyle = col; g.globalAlpha = 0.45; for (const [cx, cy] of cs) if (fy + cy >= 0) g.strokeRect(8 + (P.x + cx) * 8 + 0.5, 8 + (fy + cy) * 8 + 0.5, 7, 7); g.globalAlpha = 1;
        for (const [cx, cy] of cs) if (P.y + cy >= 0) bloc(g, 8 + (P.x + cx) * 8, 8 + (P.y + cy) * 8, col);
      }
      // panneau de droite
      const cadre = (y, h, titre) => { rect(g, 96, y, 66, h, '#5a6a9a'); rect(g, 97, y + 1, 64, h - 2, '#101632'); texte(g, titre, 129, y + 3, '#8ab0ff', { a: 'c' }); };
      cadre(6, 44, 'SUIVANTE');
      const n = A.PIECES[t.suivante], cs = A.cellules(t.suivante, 0), mx = Math.min(...cs.map((c) => c[0])), Mx = Math.max(...cs.map((c) => c[0])), my = Math.min(...cs.map((c) => c[1])), My = Math.max(...cs.map((c) => c[1]));
      for (const [cx, cy] of cs) bloc(g, 129 - ((Mx - mx + 1) * 8) / 2 + (cx - mx) * 8, 30 - ((My - my + 1) * 8) / 2 + (cy - my) * 8 + 2, COUL_T[n.c]);
      cadre(56, 26, 'SCORE'); texte(g, nb(t.score, 7), 129, 70, '#ffffff', { a: 'c' });
      cadre(86, 26, 'NIVEAU'); texte(g, String(t.niveau), 129, 100, '#ffe060', { a: 'c' });
      cadre(116, 26, 'LIGNES'); texte(g, String(t.lignes), 129, 130, '#ffffff', { a: 'c' });
      cadre(146, 24, 'RECORD'); texte(g, nb(Math.max(rec, t.score), 7), 129, 158, '#ffa0a0', { a: 'c' });
    },
    titre(g, now) {
      rect(g, 0, 0, EW, EH, '#0a0c1c');
      const pcs = ['T', 'L', 'I', 'S', 'O', 'Z', 'J'];
      pcs.forEach((k, i) => { const y = ((now / 18 + i * 37) % 220) - 30; for (const [cx, cy] of A.cellules(k, Math.floor(now / 600 + i) % 4)) bloc(g, 10 + i * 22 + cx * 6, y + cy * 6, COUL_T[A.PIECES[k].c], 6); });
    },
  },
  invaders: {
    nouveau: (s) => A.invadersNouveau(s),
    appui: () => null, repete: [],
    pas: (s, dt, h) => { A.invadersPas(s, dt, { gauche: h.gauche, droite: h.droite, tir: h.A || h.B || h.haut }); const e = s.evenements; return e.includes('mort') || e.includes('perdu') ? 'hitstrong' : e.includes('ovni') ? 'levelup' : e.includes('touche') ? 'hitweak' : e.includes('tir') ? 'throw' : e.includes('vague') ? 'item' : null; },
    dessin(g, s, now, rec) {
      rect(g, 0, 0, EW, EH, '#020208');
      g.fillStyle = '#2a2a48'; for (let k = 0; k < 40; k++) g.fillRect((k * 97) % EW, (k * 61 + Math.floor(now / 400) * (k % 3 === 0 ? 1 : 0)) % EH, 1, 1);
      texte(g, 'SCORE ' + nb(s.score, 5), 3, 2, '#ffffff'); texte(g, 'REC ' + nb(Math.max(rec, s.score), 5), EW - 3, 2, '#ffa0a0', { a: 'd' });
      const f = s.pas % 2, couls = ['#ff70ff', '#60e0ff', '#70ff70'];
      for (const a of s.aliens) if (a.vivant) sprite(g, ALIENS[a.type][f], a.x, a.y, couls[a.type]);
      for (const e of s.explosions) { if (e.joueur) { if (Math.floor(now / 80) % 2) sprite(g, BOUM, s.joueur.x + 1, s.joueur.y - 2, '#70ff70'); } else if (e.pts) texte(g, String(e.pts), e.x + 8, e.y, '#ff6060', { a: 'c' }); else sprite(g, BOUM, e.x, e.y, '#ffffff'); }
      if (s.ovni) sprite(g, OVNI, s.ovni.x, 10, '#ff4040');
      for (const A2 of s.abris) for (let j = 0; j < A.ABRI.h; j++) for (let i = 0; i < A.ABRI.w; i++) if (A2.bits[j][i]) rect(g, A2.x + i, A2.y + j, 1, 1, '#40e040');
      if (s.joueur.mort <= 0 && !s.fini) sprite(g, CANON, s.joueur.x, s.joueur.y, '#50ff60');
      if (s.tirJ) rect(g, s.tirJ.x, s.tirJ.y, 1, 4, '#ffffff');
      for (const T2 of s.tirsA) { const z = Math.floor(T2.y / 3) % 2; rect(g, T2.x + (z ? 1 : 0), T2.y, 1, 1, '#ffe060'); rect(g, T2.x + (z ? 0 : 1), T2.y + 1, 1, 1, '#ffe060'); rect(g, T2.x + (z ? 1 : 0), T2.y + 2, 1, 1, '#ffe060'); }
      rect(g, 0, EH - 9, EW, 1, '#40e040');
      texte(g, String(Math.max(0, s.vies)), 4, EH - 8, '#ffffff'); for (let k = 0; k < Math.max(0, s.vies - 1); k++) sprite(g, CANON, 14 + k * 14, EH - 7, '#50ff60');
      texte(g, 'VAGUE ' + s.vague, EW - 3, EH - 8, '#a0a0ff', { a: 'd' });
      if (s.tVague > 0) texte(g, 'VAGUE SUIVANTE !', EW / 2, 80, '#ffe060', { a: 'c' });
    },
    titre(g, now) {
      rect(g, 0, 0, EW, EH, '#020208');
      ALIENS.forEach((a, k) => sprite(g, a[Math.floor(now / 500) % 2], 40 + k * 36 + Math.sin(now / 400 + k) * 4, 120, ['#ff70ff', '#60e0ff', '#70ff70'][k]));
      texte(g, '=30   =20   =10', 84, 132, '#a0a0c0', { a: 'c' });
    },
  },
  briques: {
    nouveau: (s) => A.briquesNouveau(s),
    appui: () => null, repete: [],
    pas: (b, dt, h) => { A.briquesPas(b, dt, { gauche: h.gauche, droite: h.droite, tir: h.A || h.B || h.haut }); const e = b.evenements; return e.includes('perdu') ? 'faint' : e.includes('niveau') ? 'levelup' : e.includes('brique') ? 'hitweak' : e.includes('dur') ? 'bump' : e.includes('raquette') ? 'blip' : null; },
    dessin(g, b, now, rec) {
      rect(g, 0, 0, EW, EH, '#0c0a24');
      g.fillStyle = '#16123a'; for (let y = 16; y < EH; y += 6) for (let x = (y % 12) ? 3 : 0; x < EW; x += 6) g.fillRect(x, y, 2, 1);
      rect(g, 0, 13, EW, 3, '#8a8aa8'); rect(g, 0, 13, 4, EH, '#8a8aa8'); rect(g, EW - 4, 13, 4, EH, '#8a8aa8'); rect(g, 1, 14, EW - 2, 1, '#c8c8e0');
      texte(g, nb(b.score, 5), 3, 3, '#ffffff'); texte(g, 'NIV ' + b.niveau, EW / 2, 3, '#ffe060', { a: 'c' }); texte(g, 'REC ' + nb(Math.max(rec, b.score), 5), EW - 3, 3, '#ffa0a0', { a: 'd' });
      const couls = ['#f04848', '#f89030', '#f8d838', '#58d860', '#4890f8', '#b060f0'];
      for (const q of b.briques) { const c = q.vie > 1 ? '#c0c0d0' : couls[q.l]; rect(g, q.x, q.y, A.BRIQUES.w, A.BRIQUES.h, c); rect(g, q.x, q.y, A.BRIQUES.w, 1, 'rgba(255,255,255,.5)'); rect(g, q.x, q.y + A.BRIQUES.h - 1, A.BRIQUES.w, 1, 'rgba(0,0,0,.4)'); }
      const R = b.raquette; pave(g, R.x, R.y, R.w, 4, '#e0e0f0', null); rect(g, R.x + 1, R.y, R.w - 2, 1, '#ffffff'); rect(g, R.x, R.y + 1, 3, 2, '#f04848'); rect(g, R.x + R.w - 3, R.y + 1, 3, 2, '#f04848');
      const B = b.balle; rect(g, B.x, B.y, 3, 3, '#ffffff'); rect(g, B.x, B.y, 1, 1, 'rgba(0,0,0,0)');
      for (let k = 0; k < b.vies - 1; k++) rect(g, 6 + k * 10, EH - 4, 8, 2, '#a0a0c0');
      if (B.colle && Math.floor(now / 400) % 2) texte(g, 'A : LANCER', EW / 2, 120, '#ffe060', { a: 'c' });
    },
    titre(g, now) {
      rect(g, 0, 0, EW, EH, '#0c0a24');
      const couls = ['#f04848', '#f89030', '#f8d838', '#58d860', '#4890f8', '#b060f0'];
      for (let l = 0; l < 6; l++) for (let c = 0; c < 10; c++) if ((c + l + Math.floor(now / 300)) % 5) rect(g, 4 + c * 16, 112 + l * 7, 15, 6, couls[l]);
    },
  },
  serpent: {
    nouveau: (s) => A.serpentNouveau(s),
    appui: (s, k) => { if (['haut', 'bas', 'gauche', 'droite'].includes(k)) A.serpentTourner(s, k); return null; },
    repete: [],
    pas: (s, dt) => { A.serpentPas(s, dt); const e = s.evenements; return e.includes('perdu') ? 'hitstrong' : e.includes('bonus') ? 'levelup' : e.includes('baie') ? 'select' : null; },
    dessin(g, s, now, rec) {
      const G = A.GRILLE_SERPENT;
      rect(g, 0, 0, EW, EH, '#0a1a0c');
      for (let y = 0; y < G.rangs; y++) for (let x = 0; x < G.cols; x++) rect(g, x * 8, G.y0 + y * 8, 8, 8, (x + y) % 2 ? '#1c4422' : '#204c26');
      texte(g, 'SCORE ' + nb(s.score, 4), 3, 4, '#ffffff'); texte(g, 'REC ' + nb(Math.max(rec, s.score), 4), EW - 3, 4, '#ffa0a0', { a: 'd' });
      // les baies : Oran (bleue) et, de temps en temps, une Sitrus dorée qui clignote
      const baie = (x, y, c, c2) => { ellipse(g, x * 8 + 4, G.y0 + y * 8 + 4, 3, 3, c); rect(g, x * 8 + 2, G.y0 + y * 8 + 2, 2, 1, c2); rect(g, x * 8 + 4, G.y0 + y * 8, 2, 2, '#40c040'); };
      if (s.baie) baie(s.baie[0], s.baie[1], '#3a7ae0', '#a0d0ff');
      if (s.bonus && (s.bonus.t > 2 || Math.floor(now / 120) % 2)) baie(s.bonus.x, s.bonus.y, '#f8c830', '#fff4a0');
      // Abo : violet, ventre jaune, la tête avec ses yeux
      s.corps.forEach(([x, y], i) => {
        const px = x * 8, py = G.y0 + y * 8;
        if (i === 0) { pave(g, px, py, 8, 8, '#b058e0', '#4a1868'); const d = s.dir; const ey = d === 'haut' ? 1 : d === 'bas' ? 5 : 2, ex = d === 'gauche' ? 1 : d === 'droite' ? 5 : 1; rect(g, px + (d === 'haut' || d === 'bas' ? 1 : ex), py + ey, 2, 2, '#ffffff'); rect(g, px + (d === 'haut' || d === 'bas' ? 5 : ex), py + (d === 'haut' || d === 'bas' ? ey : ey + 3), 2, 2, '#ffffff'); }
        else { pave(g, px, py, 8, 8, i % 3 === 0 ? '#e8d040' : '#9a48c8', '#3a1450'); rect(g, px + 2, py + 2, 2, 2, 'rgba(255,255,255,.25)'); }
      });
    },
    titre(g, now) {
      rect(g, 0, 0, EW, EH, '#0a1a0c');
      for (let i = 0; i < 18; i++) { const x = 20 + i * 7, y = 124 + Math.sin(now / 200 - i * 0.6) * 6; pave(g, x, y, 8, 8, i === 17 ? '#b058e0' : i % 3 ? '#9a48c8' : '#e8d040', '#3a1450'); }
    },
  },
};

/* ---------------- le meuble de la borne ---------------- */
function meuble(jeu) {
  const [c, g] = toile(400, 240), [base, clair, sombre] = A.JEUX[jeu].couleurs;
  // la salle : mur sombre, néons, sol en damier
  rect(g, 0, 0, 400, 240, '#0c0818'); for (let y = 0; y < 196; y++) { g.fillStyle = `rgba(80,40,140,${0.25 - y / 900})`; g.fillRect(0, y, 400, 1); }
  for (const [x, col] of [[0, '#ff40c0'], [300, '#40e0ff']]) { g.fillStyle = col + '40'; g.fillRect(x, 190, 100, 5); rect(g, x, 192, 100, 1, col); }
  for (let y = 196; y < 240; y += 6) for (let x = (y / 6) % 2 ? 6 : 0; x < 400; x += 12) rect(g, x, y, 6, 6, '#1a1428');
  // bornes voisines dans la pénombre
  for (const x of [56, 300]) { pave(g, x, 30, 46, 180, '#141020', '#08060c'); rect(g, x + 6, 50, 34, 30, '#0e1830'); rect(g, x + 4, 36, 38, 10, '#2a1a40'); }
  // le meuble
  pave(g, 104, 2, 192, 238, sombre, '#05040a');
  rect(g, 106, 4, 188, 236, base); rect(g, 106, 4, 6, 236, clair); rect(g, 288, 4, 6, 236, sombre);
  for (let y = 40; y < 200; y += 12) { rect(g, 107, y, 4, 6, sombre); rect(g, 289, y + 6, 4, 6, clair); }
  // fronton
  pave(g, 112, 6, 176, 24, '#05040a', null); rect(g, 114, 8, 172, 20, clair); rect(g, 114, 8, 172, 2, '#ffffff');
  const nom = A.JEUX[jeu].nom, e = largeur(nom, 2) <= 164 ? 2 : 1;
  texte(g, nom, 200, e === 2 ? 11 : 15, '#ffffff', { a: 'c', e, ombre: sombre });
  // cadre de l'écran
  pave(g, EX - 6, EY - 5, EW + 12, EH + 10, '#05040a', null); rect(g, EX - 4, EY - 3, EW + 8, EH + 6, '#2a2a34'); rect(g, EX - 4, EY - 3, EW + 8, 1, '#4a4a58');
  // tableau de commande
  rect(g, 104, 214, 192, 2, clair); rect(g, 104, 216, 192, 24, base); rect(g, 104, 232, 192, 8, sombre);
  return c;
}

export async function arcadeScreen(game, jeu) {
  const ui = game.ui, st = game.state, J = JEU[jeu], info = A.JEUX[jeu];
  if (!J) return;
  st.arcade ??= {}; const rec = (st.arcade[jeu] ??= { scores: [], parties: 0 });
  const T = scene(ui, 'arcade ' + jeu), g = T.g, fond = meuble(jeu);
  const [ecran, eg] = toile(EW, EH);
  let etat = 'titre', partie = null, tPause = 0, fin = null, acc = 0;
  const tenu = new Set(), appuis = [], rep = {};
  const record = () => rec.scores[0] || 0;
  // panneaux latéraux : aide, meilleurs scores, jetons
  const gauche = etiquette(T, 'pxs-info arc-gauche', 6, 18);
  const droite = etiquette(T, 'pxs-info arc-droite', 302, 18);
  const majPanneaux = () => {
    gauche.texte(`<b>${esc(info.court)}</b><br>${info.aide.map(esc).join('<br>')}<br>Échap : pause`);
    droite.texte(`<b>Meilleurs scores</b><br>${[0, 1, 2, 3, 4].map((k) => `${k + 1}. ${rec.scores[k] != null ? rec.scores[k].toLocaleString('fr-FR') : '—'}`).join('<br>')}<br><b>Jetons</b> ${(st.jetons || 0).toLocaleString('fr-FR')}`);
  };
  majPanneaux();
  // commandes tactiles : la croix à gauche, A / B et pause à droite
  const pad = el('div', 'arc-pad'), ab = el('div', 'arc-ab');
  for (const [k, lbl] of [['haut', '▲'], ['gauche', '◀'], ['droite', '▶'], ['bas', '▼']]) { const b = el('button', 'arc-btn d-' + k, lbl); b.type = 'button'; b.dataset.k = k; pad.appendChild(b); }
  for (const [k, lbl] of [['B', 'B'], ['A', 'A'], ['pause', 'II']]) { const b = el('button', 'arc-btn b-' + k, lbl); b.type = 'button'; b.dataset.k = k; ab.appendChild(b); }
  T.ov.append(pad, ab);
  const presse = (k) => { if (!tenu.has(k)) { tenu.add(k); appuis.push(k); rep[k] = 0; } };
  const lache = (k) => { tenu.delete(k); };
  for (const b of [...pad.children, ...ab.children]) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); presse(b.dataset.k); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { b.classList.remove('on'); lache(b.dataset.k); });
  }
  // le clavier : la borne prend toutes les touches tant qu'elle est ouverte
  const kd = (e) => { const k = TOUCHES[e.code]; if (!k) return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) presse(k); };
  const ku = (e) => { const k = TOUCHES[e.code]; if (k) lache(k); };
  addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
  const blur = () => tenu.clear(); addEventListener('blur', blur);

  let resoudre; const fini = new Promise((r) => { resoudre = r; });
  const quitter = () => { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); removeEventListener('blur', blur); ui.input.clearDirs(); T.fermer(); resoudre(); };
  const commencer = () => { partie = J.nouveau((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); etat = 'jeu'; acc = 0; fin = null; ui.sound.sfx('select'); appuis.length = 0; };
  const terminer = () => {
    etat = 'fin'; rec.parties = (rec.parties || 0) + 1;
    const rang = A.classer(rec.scores, partie.score), jetons = A.recompense(jeu, partie.score);
    st.jetons = (st.jetons || 0) + jetons;
    fin = { rang, jetons, t: performance.now() }; majPanneaux();
    ui.sound.sfx(rang === 0 ? 'levelup' : jetons ? 'item' : 'faint');
  };

  T.boucle((now, dt) => {
    // les touches du moment
    // (un appui très bref, relâché avant l'image, compte quand même pour cette image)
    const f = new Set(appuis), t = (k) => tenu.has(k) || f.has(k);
    const h = { haut: t('haut'), bas: t('bas'), gauche: t('gauche'), droite: t('droite'), A: t('A'), B: t('B') };
    while (appuis.length) {
      const k = appuis.shift();
      if (k === 'pause') { if (etat === 'jeu') { etat = 'pause'; ui.sound.sfx('cancel'); } else if (etat === 'pause' || etat === 'titre' || etat === 'fin') { quitter(); return; } continue; }
      if (etat === 'titre' && (k === 'A' || k === 'B')) { commencer(); continue; }
      if (etat === 'pause' && (k === 'A' || k === 'B')) { etat = 'jeu'; ui.sound.sfx('select'); continue; }
      if (etat === 'fin' && (k === 'A' || k === 'B') && now - fin.t > 700) { commencer(); continue; }
      if (etat === 'jeu') { const s = J.appui(partie, k); if (s) ui.sound.sfx(s); }
    }
    if (etat === 'jeu') {
      // répétition des déplacements tenus (Tétra-Chute)
      for (const k of J.repete) if (tenu.has(k)) { rep[k] += dt; if (rep[k] > 0.17) { rep[k] -= 0.05; J.appui(partie, k); } }
      acc += dt; let son = null;
      while (acc >= 1 / 60) { acc -= 1 / 60; son = J.pas(partie, 1 / 60, h) || son; if (partie.fini) break; }
      if (son) ui.sound.sfx(son);
      if (partie.fini) terminer();
    }
    // l'écran
    if (etat === 'titre') {
      J.titre(eg, now);
      texte(eg, info.nom, EW / 2, 30, '#ffffff', { a: 'c', e: largeur(info.nom, 2) <= EW - 8 ? 2 : 1, ombre: A.JEUX[jeu].couleurs[0] });
      if (Math.floor(now / 500) % 2) texte(eg, 'APPUIE SUR A', EW / 2, 70, '#ffe060', { a: 'c' });
      texte(eg, 'RECORD ' + nb(record(), 6), EW / 2, 90, '#ffa0a0', { a: 'c' });
      texte(eg, 'PARTIE GRATUITE', EW / 2, EH - 14, '#8090c0', { a: 'c' });
    } else {
      J.dessin(eg, partie, now, record());
      if (etat === 'pause') { eg.fillStyle = 'rgba(0,0,0,.6)'; eg.fillRect(0, 0, EW, EH); texte(eg, 'PAUSE', EW / 2, 70, '#ffffff', { a: 'c', e: 2 }); texte(eg, 'A : REPRENDRE', EW / 2, 96, '#ffe060', { a: 'c' }); texte(eg, 'ECHAP : QUITTER', EW / 2, 108, '#c0c0e0', { a: 'c' }); }
      if (etat === 'fin') {
        eg.fillStyle = 'rgba(0,0,0,.66)'; eg.fillRect(0, 40, EW, 96);
        texte(eg, 'PARTIE TERMINEE', EW / 2, 48, '#ff6060', { a: 'c' });
        texte(eg, 'SCORE ' + nb(partie.score, 6), EW / 2, 64, '#ffffff', { a: 'c' });
        if (fin.rang === 0) { if (Math.floor(now / 250) % 2) texte(eg, 'NOUVEAU RECORD !', EW / 2, 78, '#ffe060', { a: 'c' }); }
        else if (fin.rang > 0) texte(eg, `${fin.rang + 1}E MEILLEUR SCORE`, EW / 2, 78, '#ffe060', { a: 'c' });
        texte(eg, fin.jetons ? `+${fin.jetons} JETON${fin.jetons > 1 ? 'S' : ''}` : 'PAS DE JETON', EW / 2, 92, fin.jetons ? '#80ff80' : '#a0a0b0', { a: 'c' });
        texte(eg, 'A : REJOUER', EW / 2, 110, '#ffffff', { a: 'c' }); texte(eg, 'ECHAP : QUITTER', EW / 2, 122, '#c0c0e0', { a: 'c' });
      }
    }
    // lignes de balayage et léger reflet
    eg.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 1; y < EH; y += 2) eg.fillRect(0, y, EW, 1);
    g.drawImage(fond, 0, 0); g.drawImage(ecran, EX, EY);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(EX, EY, EW, 10);
    // la manette et les boutons du meuble suivent les touches
    const jx = 150 + (h.gauche ? -3 : h.droite ? 3 : 0), jy = 218 + (h.haut ? -2 : h.bas ? 2 : 0);
    rect(g, 149, 222, 3, 8, '#2a2a30'); rect(g, Math.min(150, jx), Math.min(222, jy + 4), Math.abs(jx - 150) + 1, Math.abs(jy + 4 - 222) + 1, '#9a9aa8');
    ellipse(g, jx, jy, 5, 4, '#8a0810'); ellipse(g, jx, jy - 1, 4, 3, '#e82030'); rect(g, jx - 2, jy - 3, 2, 1, '#ff9a9a');
    const bouton = (x, col, col2, on) => { ellipse(g, x, 225, 6, 3, '#101014'); ellipse(g, x, on ? 225 : 223, 5, 3, col2); ellipse(g, x, on ? 224 : 222, 4, 2, col); };
    bouton(232, '#ffe040', '#a08010', h.A); bouton(252, '#40a0ff', '#2050a0', h.B);
    texte(g, 'A', 230, 230, '#000'); texte(g, 'B', 250, 230, '#000');
    // un clic sur l'écran vaut A (pour commencer ou rejouer)
    T.zone(EX, EY, EW, EH, () => { if (etat !== 'jeu') { presse('A'); setTimeout(() => lache('A'), 60); } });
  });
  await fini;
}
