// odyssee/js/render/arenes-tex.js — pixel art des arènes dessinées dans un plan (world/arenes-plans.js), à 32 px par case,
// lumière en haut à gauche, contours sombres comme sur DS.
//   tuiles (atlas du décor, posées à plat) : sols des nouvelles arènes, dalles, vannes, pontons, radeaux, téléporteurs,
//     fosses, gouffres, ciel, passerelles, tapis roulants, rayon de lumière, dalles d'argile, passerelles d'ombre…
//   sprites (planche des sprites) : leviers, statues, vitrines, canons, miroirs, cristaux, haies et grilles fermées…
// Appelé par buildAtlas (texturesArenes) et buildSprites (spritesArenes) de textures.js.

const rgba = (h) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255];
};
/** toile w × h et ses pinceaux */
function toile(w, h, draw, graine = 12345) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data;
  const p = (i, j, col) => {
    i = Math.round(i); j = Math.round(j);
    if (i < 0 || j < 0 || i >= w || j >= h || !col) return;
    const [r, g, b, a] = rgba(col), k = (j * w + i) * 4;
    if (a >= 255 || !d[k + 3]) { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a; return; }
    const t = a / 255; d[k] = d[k] * (1 - t) + r * t; d[k + 1] = d[k + 1] * (1 - t) + g * t; d[k + 2] = d[k + 2] * (1 - t) + b * t; d[k + 3] = Math.max(d[k + 3], a);
  };
  const rect = (x0, y0, ww, hh, col) => { for (let j = y0; j < y0 + hh; j++) for (let i = x0; i < x0 + ww; i++) p(i, j, col); };
  const cadre = (x0, y0, ww, hh, col) => { rect(x0, y0, ww, 1, col); rect(x0, y0 + hh - 1, ww, 1, col); rect(x0, y0, 1, hh, col); rect(x0 + ww - 1, y0, 1, hh, col); };
  const disque = (cx, cy, rx, ry, col, f) => {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
      const q = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2;
      if (q <= 1) p(i, j, f ? f(i, j, q) : col);
    }
  };
  const ligne = (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let k = 0; k <= n; k++) p(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, col); };
  let s = graine;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  draw({ p, rect, cadre, disque, ligne, rnd, w, h });
  x.putImageData(im, 0, 0);
  return c;
}
/** tourne une toile carrée d'un quart de tour (q fois, sens horaire) */
function tourne(c, q) {
  if (!q) return c;
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'); x.imageSmoothingEnabled = false;
  x.translate(c.width / 2, c.height / 2); x.rotate(q * Math.PI / 2); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
const SENS = ['up', 'right', 'down', 'left'];
/** pose les quatre sens d'une tuile dessinée vers le haut */
const quatreSens = (putImg, k, c) => SENS.forEach((d, q) => putImg(`${k}_${d}`, tourne(c, q)));

/* ------------------------------------------------------------------ motifs communs */
const eauBord = (T, fond = '#4a90d0') => { T.rect(0, 0, 32, 32, fond); for (let k = 0; k < 14; k++) { const x = Math.floor(T.rnd() * 28), y = Math.floor(T.rnd() * 30); T.rect(x, y, 4, 1, '#8ac4f0'); } };
const grain = (T, n, cols) => { for (let k = 0; k < n; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), cols[k % cols.length]); };
/** vide : un fond presque noir, quelques points de lumière (étoiles, braises, poussière) */
const vide = (T, fond, points) => {
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) T.p(i, j, fond[(i * 7 + j * 13 + ((i * j) % 5)) % fond.length]);
  for (let k = 0; k < 5; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), points[k % points.length]);
};

/* ------------------------------------------------------------------ tuiles à plat */
export function texturesArenes(putImg) {
  // sols des arènes qui n'en avaient pas
  putImg('floor_gymGalerie', toile(32, 32, (T) => {      // parquet en chevrons, cire chaude
    T.rect(0, 0, 32, 32, '#c89058');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const b = Math.floor((i + (Math.floor(j / 8) % 2 ? 4 : 0)) / 8);
      if ((i + (Math.floor(j / 8) % 2 ? 4 : 0)) % 8 === 0) T.p(i, j, '#8a5a32');
      else if (j % 8 === 0) T.p(i, j, '#a87040');
      else if ((b + Math.floor(j / 8)) % 2) T.p(i, j, '#d49c62');
    }
    grain(T, 14, ['#e0b078', '#b88048']);
  }));
  putImg('floor_gymCiel', toile(32, 32, (T) => {         // dalles de nuage, joints bleu ciel
    T.rect(0, 0, 32, 32, '#eef6ff');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#b8d8f4'); else if (i % 16 === 15 || j % 16 === 15) T.p(i, j, '#d4e6f8'); }
    T.disque(8, 7, 4, 2.5, '#ffffff'); T.disque(23, 22, 5, 2.5, '#ffffff');
  }));
  putImg('floor_gymMarais', toile(32, 32, (T) => {       // tourbe sombre et mousse
    T.rect(0, 0, 32, 32, '#3e4a2c');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const v = (i * 31 + j * 17 + i * j) % 23; if (v < 3) T.p(i, j, '#4e5c36'); else if (v === 7) T.p(i, j, '#2e381e'); }
    for (let k = 0; k < 4; k++) { const x = Math.floor(T.rnd() * 26), y = Math.floor(T.rnd() * 26); T.disque(x + 3, y + 3, 3, 2, '#566a3a'); T.p(x + 2, y + 2, '#7a8c4a'); }
  }));
  putImg('floor_gymDunes', toile(32, 32, (T) => {        // terre battue ocre, fines rides
    T.rect(0, 0, 32, 32, '#d8b070');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if ((j + Math.round(Math.sin(i / 4) * 1.5)) % 7 === 0) T.p(i, j, '#c49a5a');
    grain(T, 22, ['#e8c890', '#b88a4a', '#f0d8a8']);
  }));
  putImg('floor_gymAcier', toile(32, 32, (T) => {        // tôles rivetées
    T.rect(0, 0, 32, 32, '#8e98a6');
    for (const [x0, y0] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
      T.rect(x0 + 1, y0 + 1, 14, 14, (x0 + y0) % 32 ? '#9aa4b2' : '#8892a0'); T.rect(x0 + 1, y0 + 1, 14, 1, '#b8c2ce'); T.rect(x0 + 1, y0 + 14, 14, 1, '#6c7684');
      for (const [a, b] of [[3, 3], [12, 3], [3, 12], [12, 12]]) { T.p(x0 + a, y0 + b, '#d0d8e0'); T.p(x0 + a + 1, y0 + b + 1, '#5a6472'); }
    }
  }));
  putImg('floor_gymCristal', toile(32, 32, (T) => {      // dallage rose nacré en losanges
    T.rect(0, 0, 32, 32, '#f6dcea');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const u = (i + j) % 16, v = (i - j + 32) % 16; if (u === 0 || v === 0) T.p(i, j, '#e4b8d0'); else if (u === 1 || v === 1) T.p(i, j, '#fff4fa'); }
    grain(T, 8, ['#ffffff', '#eac4da']);
  }));
  putImg('floor_gymAbime', toile(32, 32, (T) => {        // pierre noire veinée de violet
    T.rect(0, 0, 32, 32, '#2a2434');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#1a1622'); else if ((i * 5 + j * 3) % 29 === 0) T.p(i, j, '#4a3a62'); }
    T.ligne(3, 5, 12, 11, '#3a3050'); T.ligne(20, 18, 28, 27, '#3a3050');
  }));

  // ------- Sylvebourg (Insecte) : alvéoles (le vide entre les îles), murs de cire fondus
  putImg('dec_alveoles', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6a4410');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const r = Math.floor(j / 8), x = (i + (r % 2 ? 4 : 0)) % 8, y = j % 8;
      const bord = x === 0 || y === 0 || (x === 7 && y < 2);
      T.p(i, j, bord ? '#4a2c08' : y < 3 ? '#e8a830' : y < 6 ? '#c88418' : '#a86410');
    }
  }));
  for (const [k, c] of CIRE.entries()) putImg('dec_cire_ouverte_' + k, toile(32, 32, (T) => { for (let n = 0; n < 9; n++) T.disque(4 + (n * 11) % 25, 4 + (n * 7) % 25, 2.5, 1.6, c[0] + '90'); T.rect(0, 0, 32, 2, c[1] + '80'); T.rect(0, 30, 32, 2, c[1] + '80'); }));

  // ------- Port-Azur (Eau) : pontons, radeaux, vannes
  putImg('dec_ponton', toile(32, 32, (T) => {
    eauBord(T);
    T.rect(2, 3, 28, 26, '#6a6a72'); T.rect(3, 4, 26, 24, '#9a9aa4'); T.rect(3, 4, 26, 2, '#c4c4cc'); T.rect(3, 26, 26, 2, '#7a7a84');
    T.ligne(10, 6, 14, 18, '#7e7e88'); T.ligne(20, 12, 24, 25, '#7e7e88');
  }, 7));
  putImg('dec_radeau', toile(32, 32, (T) => {
    eauBord(T);
    for (let k = 0; k < 5; k++) { const x = 2 + k * 6; T.rect(x, 3, 5, 26, '#8a5a30'); T.rect(x + 1, 3, 3, 26, '#b07a44'); T.rect(x + 1, 3, 1, 26, '#d09a60'); }
    T.rect(2, 8, 28, 2, '#5a3a1c'); T.rect(2, 22, 28, 2, '#5a3a1c');
  }, 9));
  // vannes : un bassin (0 ouest, bleu ; 1 est, vert) et un niveau (0 bas, 1 moyen, 2 haut) — clé dec_vanne_<bassin><niveau>
  for (const [b, anneau] of [[0, '#2a6ac8'], [1, '#2a9a5a']]) for (const [g, col] of [[0, '#8ad0f8'], [1, '#3a90e0'], [2, '#1a4aa0']]) putImg(`dec_vanne_${b}${g}`, toile(32, 32, (T) => {
    T.disque(16, 16, 14, 14, '#3a3a44'); T.disque(16, 16, 12.5, 12.5, anneau); T.disque(16, 16, 10.5, 10.5, '#c8c8d0');
    T.disque(16, 16, 8, 8, null, (i, j, q) => (q > 0.75 ? '#8a8a96' : '#d8d8e0'));
    for (let a = 0; a < 4; a++) { const c = Math.cos(a * Math.PI / 2 + 0.4), s2 = Math.sin(a * Math.PI / 2 + 0.4); T.ligne(16, 16, 16 + c * 9, 16 + s2 * 9, '#6a6a76'); }
    T.disque(16, 16, 4, 4, col); T.p(15, 15, '#ffffff');
    for (let k = 0; k <= g; k++) T.rect(9 + k * 5, 27, 4, 3, col);
  }));
  putImg('dec_passerelle_bois', toile(32, 32, (T) => {
    eauBord(T);
    T.rect(0, 5, 32, 22, '#6a4422'); for (let i = 0; i < 32; i += 6) { T.rect(i, 6, 5, 20, '#a8743e'); T.rect(i, 6, 5, 2, '#c8945a'); T.rect(i, 24, 5, 2, '#7a5028'); }
    T.rect(0, 5, 32, 1, '#3a2410'); T.rect(0, 26, 32, 1, '#3a2410');
  }, 13));

  // ------- Voltacité (Électrik) : dalle-éclair, sol de la porte du générateur
  putImg('dec_eclair', toile(32, 32, (T) => {
    T.rect(3, 3, 26, 26, '#3a3a44'); T.rect(4, 4, 24, 24, '#f0d040'); T.rect(4, 4, 24, 2, '#fff4a0'); T.rect(4, 26, 24, 2, '#b89a20');
    const Z = [[18, 6], [11, 16], [16, 16], [12, 26], [22, 13], [17, 13], [21, 6]];
    for (let j = 6; j < 27; j++) for (let i = 8; i < 24; i++) {
      let dans = false; for (let a = 0, b = Z.length - 1; a < Z.length; b = a++) { const [xa, ya] = Z[a], [xb, yb] = Z[b]; if ((ya > j) !== (yb > j) && i < (xb - xa) * (j - ya) / (yb - ya) + xa) dans = !dans; }
      if (dans) T.p(i, j, '#2a2a34');
    }
  }));
  putImg('dec_tapis_metal', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#5a626e'); for (let j = 1; j < 32; j += 4) T.rect(1, j, 30, 2, '#7a8490'); T.rect(0, 0, 32, 1, '#3a4048'); T.rect(0, 31, 32, 1, '#3a4048'); }));

  // ------- Floralia (Plante) : dalles-pétales, parterres, fleurs du carré de la Reine, arche de la haie ouverte
  putImg('dec_dalle_petale', toile(32, 32, (T) => {
    T.disque(16, 16, 13, 13, '#7a4a6a'); T.disque(16, 16, 12, 12, '#f4c8dc');
    for (let a = 0; a < 5; a++) { const c = Math.cos(a * 1.2566 - 1.57), s = Math.sin(a * 1.2566 - 1.57); T.disque(16 + c * 6, 16 + s * 6, 4, 4, null, (i, j, q) => (q > 0.6 ? '#e888b0' : '#ffb0d0')); }
    T.disque(16, 16, 3, 3, '#f6d040'); T.p(15, 15, '#fff8c0');
  }));
  putImg('dec_parterre', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6a4a2a'); T.rect(1, 1, 30, 30, '#7a5632');
    grain(T, 40, ['#8a6640', '#5a3a20', '#946e44']);
    T.cadre(0, 0, 32, 32, '#4a7a3a'); T.rect(0, 0, 32, 2, '#5a9a4a');
  }));
  const fleur = (T, ouverte, cx = 16, cy = 16, r = 1) => {
    T.ligne(cx, cy + 4 * r, cx, cy + 11 * r, '#3a8a3a'); T.disque(cx - 3 * r, cy + 8 * r, 3 * r, 1.6 * r, '#4aa04a'); T.disque(cx + 3 * r, cy + 9 * r, 3 * r, 1.6 * r, '#3a903e');
    if (ouverte) {
      for (let a = 0; a < 6; a++) { const c = Math.cos(a * 1.047), s = Math.sin(a * 1.047); T.disque(cx + c * 4.5 * r, cy + s * 4.5 * r, 3.2 * r, 3.2 * r, null, (i, j, q) => (q > 0.7 ? '#d84a7a' : '#ff8ab0')); }
      T.disque(cx, cy, 2.6 * r, 2.6 * r, '#f6d040'); T.p(cx - 1, cy - 1, '#fff8c0');
    } else {
      T.disque(cx, cy, 3 * r, 4 * r, null, (i, j, q) => (q > 0.65 ? '#2e7a32' : j < cy ? '#d8a0b8' : '#5aa850'));
    }
  };
  putImg('dec_fleur_bouton', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#8ac06a'); T.cadre(0, 0, 32, 32, '#5a9048'); grain(T, 10, ['#9ad07a', '#78ac5a']); fleur(T, false, 16, 12); }));
  putImg('dec_fleur_ouverte', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#9ad07a'); T.cadre(0, 0, 32, 32, '#d880a8'); grain(T, 10, ['#b0e090', '#ffd0e0']); fleur(T, true, 16, 12); }));
  putImg('dec_arche_fleurie', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#7ab05a'); for (let k = 0; k < 6; k++) { const x = 3 + k * 5; T.rect(x, 2, 2, 2, ['#ff8ab0', '#f6d040', '#ffffff'][k % 3]); T.rect(x + 1, 28, 2, 2, ['#ffffff', '#ff8ab0', '#f6d040'][k % 3]); } grain(T, 12, ['#8ac06a', '#6a9a4a']); }));

  // ------- Mirage (Psy) : téléporteurs de lune et de soleil (allumés / éteints), points d'arrivée
  const tele = (T, c1, c2, c3, on) => {
    T.disque(16, 16, 14, 14, '#2a2238'); T.disque(16, 16, 12, 12, on ? c1 : '#4a4458');
    T.disque(16, 16, 8, 8, on ? c2 : '#5a5468'); T.disque(16, 16, 4, 4, on ? c3 : '#6a6478');
    if (on) for (let a = 0; a < 8; a++) T.p(16 + Math.cos(a * 0.785) * 10, 16 + Math.sin(a * 0.785) * 10, '#ffffff');
  };
  putImg('dec_tp_lune', toile(32, 32, (T) => { tele(T, '#7a5ad0', '#a88af0', '#e8dcff', true); T.disque(17, 15, 3, 3, '#7a5ad0'); }));
  putImg('dec_tp_lune_off', toile(32, 32, (T) => tele(T, '', '', '', false)));
  putImg('dec_tp_soleil', toile(32, 32, (T) => { tele(T, '#e09a20', '#f6c84a', '#fff4c0', true); }));
  putImg('dec_tp_soleil_off', toile(32, 32, (T) => tele(T, '', '', '', false)));
  putImg('dec_tp_etoile', toile(32, 32, (T) => { tele(T, '#2a6ad0', '#5aa0f0', '#d8f0ff', true); for (let k = 0; k < 5; k++) { const a = -1.57 + k * 1.2566; T.ligne(16, 16, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, '#ffffff'); } }));
  putImg('dec_tp_etoile_off', toile(32, 32, (T) => tele(T, '', '', '', false)));
  putImg('dec_arrivee', toile(32, 32, (T) => { for (let a = 0; a < 16; a++) T.p(16 + Math.cos(a * 0.393) * 11, 16 + Math.sin(a * 0.393) * 11, '#c8b8f0'); for (let a = 0; a < 8; a++) T.p(16 + Math.cos(a * 0.785) * 6, 16 + Math.sin(a * 0.785) * 6, '#e8e0ff'); }));

  // ------- Port-Granit (Roche) : fosses vides et comblées
  putImg('dec_fosse', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#5a4a3a'); T.rect(2, 2, 28, 28, '#1a1410'); T.rect(2, 2, 28, 5, '#3a2e24'); T.rect(3, 3, 26, 2, '#4a3c2e'); grain(T, 6, ['#2a201a']); }));
  putImg('dec_fosse_pleine', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#7a6a58'); for (let k = 0; k < 9; k++) { const x = 3 + (k % 3) * 9, y = 3 + Math.floor(k / 3) * 9; T.disque(x + 4, y + 4, 4, 3.5, null, (i, j, q) => (q > 0.7 ? '#5a4c3e' : j < y + 3 ? '#b4a28a' : '#968670')); } }));

  // ------- Cendrelune (Feu) : lave figée, trous dans le sol, cendres
  putImg('dec_lave_figee', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#3a2a26'); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const v = (i * 13 + j * 7 + ((i ^ j) & 7)) % 19; if (v === 0) T.p(i, j, '#e05a1a'); else if (v < 3) T.p(i, j, '#4e3a34'); else if (v === 5) T.p(i, j, '#2a1c18'); } T.ligne(4, 9, 14, 13, '#c04a14'); T.ligne(18, 22, 28, 18, '#c04a14'); }));
  putImg('dec_lave_figee2', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#1e1a24'); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const v = (i * 11 + j * 5 + ((i ^ j) & 7)) % 17; if (v === 0) T.p(i, j, '#8a5ae0'); else if (v < 3) T.p(i, j, '#2c2636'); else if (v === 5) T.p(i, j, '#0e0c12'); } T.ligne(5, 8, 13, 14, '#6a3ac0'); T.ligne(19, 23, 27, 17, '#6a3ac0'); }));
  putImg('dec_trou_forge', toile(32, 32, (T) => { T.disque(16, 17, 14, 12, '#5a3a2a'); T.disque(16, 17, 12, 10, '#0e0806'); T.disque(16, 13, 10, 5, '#2a1810'); for (let a = 0; a < 7; a++) T.p(8 + a * 3, 27 + (a % 2), '#ff7a20'); }));
  putImg('dec_cendres', toile(32, 32, (T) => { grain(T, 26, ['#6a6460', '#8a8480', '#4a4440']); T.disque(16, 16, 6, 3, '#5a544e80'); }));

  // ------- Fort-Écaille (Dragon) : gouffre, pivots et bras des ponts-dragons
  putImg('dec_gouffre', toile(32, 32, (T) => vide(T, ['#0c0a14', '#100e1a', '#0a0810'], ['#3a2a5a', '#2a2040'])));
  putImg('dec_pivot_dragon', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#0c0a14'); T.disque(16, 16, 15, 15, '#3a3448'); T.disque(16, 16, 13, 13, '#8a7ab0'); T.disque(16, 16, 10, 10, '#b8a8d8');
    T.disque(16, 16, 5, 5, '#e05050'); T.p(15, 14, '#ffa0a0');
    for (let a = 0; a < 8; a++) T.p(16 + Math.cos(a * 0.785) * 8, 16 + Math.sin(a * 0.785) * 8, '#6a5a90');
  }));
  quatreSens(putImg, 'dec_pont_dragon', toile(32, 32, (T) => {   // bras vers le haut (le pivot est en dessous)
    T.rect(0, 0, 32, 32, '#0c0a14');
    T.rect(6, 0, 20, 32, '#5a4a7a'); T.rect(8, 0, 16, 32, '#9a8ac0'); T.rect(8, 0, 2, 32, '#c8baf0');
    for (let j = 2; j < 32; j += 6) { T.rect(8, j, 16, 1, '#7a6aa0'); T.disque(16, j + 3, 2, 1.5, '#b0a0d8'); }
    T.rect(6, 0, 20, 2, '#e0d4ff');
  }));

  // ------- Métropole (Normal) : porte de salle ouverte
  putImg('dec_porte_ouverte', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#a82a2a'); T.rect(2, 0, 28, 32, '#c83a3a'); for (let j = 0; j < 32; j += 4) T.rect(4, j, 24, 1, '#e05a5a'); T.rect(0, 0, 2, 32, '#e8c040'); T.rect(30, 0, 2, 32, '#e8c040'); }));

  // ------- Port-Lisière (Vol) : ciel, passerelles, arrivées des canons
  putImg('dec_ciel', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) T.p(i, j, '#9ad0f6');
    for (let k = 0; k < 3; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), '#b8e0fa');
  }, 31));
  // nuages qui passent sous les îles (une case sur quelques-unes, voir la vue)
  putImg('dec_nuage', toile(32, 32, (T) => { for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) T.p(i, j, '#9ad0f6'); T.disque(14, 16, 12, 5, '#f4faff'); T.disque(20, 13, 7, 4, '#ffffff'); T.disque(9, 18, 6, 3, '#e4f2fc'); }));
  putImg('dec_passerelle_ciel', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) T.p(i, j, '#7ab8ec');
    T.rect(4, 0, 24, 32, '#8a5a30'); for (let j = 0; j < 32; j += 5) { T.rect(4, j, 24, 4, '#c08a50'); T.rect(4, j, 24, 1, '#e0aa70'); }
    T.rect(3, 0, 2, 32, '#f0f0f0'); T.rect(27, 0, 2, 32, '#f0f0f0');
  }));
  putImg('dec_arrivee_vent', toile(32, 32, (T) => { for (let a = 0; a < 20; a++) { const r = 4 + a * 0.5, t = a * 0.7; T.p(16 + Math.cos(t) * r, 16 + Math.sin(t) * r, '#ffffff'); T.p(16 + Math.cos(t) * r + 1, 16 + Math.sin(t) * r, '#b8dcf8'); } }));

  // ------- Marais-Noir (Poison) : murs révélés, vase toxique
  putImg('dec_mur_marais', toile(32, 32, (T) => { T.rect(2, 2, 28, 28, '#6af08a40'); T.cadre(2, 2, 28, 28, '#8affa8c0'); T.cadre(4, 4, 24, 24, '#5ad07a80'); for (let k = 0; k < 6; k++) T.p(6 + k * 4, 16 + (k % 2) * 3, '#c8ffd8c0'); }));
  putImg('dec_vase', toile(32, 32, (T) => {
    T.disque(16, 16, 15, 13, null, (i, j, q) => (q > 0.85 ? '#3a2a4a' : q > 0.6 ? '#7a3a9a' : '#9a4ac0'));
    for (const [x, y, r] of [[11, 12, 2.5], [20, 18, 2], [15, 21, 1.5], [21, 10, 1.4]]) { T.disque(x, y, r, r, '#c88ae8'); T.p(x - 1, y - 1, '#f0d0ff'); }
  }));

  putImg('dec_grille_ouverte', toile(32, 32, (T) => { T.rect(0, 0, 32, 3, '#4a4a54'); T.rect(0, 29, 32, 3, '#4a4a54'); for (let i = 2; i < 32; i += 5) { T.rect(i, 0, 3, 3, '#7a7a88'); T.rect(i, 29, 3, 3, '#7a7a88'); } }));

  // ------- Dunes d'Ocre (Sol) : sable qui glisse, dalles d'argile, toboggan
  putImg('dec_sable_glissant', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#e8c880'); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const r = (j * 2 + Math.round(Math.sin((i + j) / 3) * 2)) % 9; if (r === 0) T.p(i, j, '#f8e0a8'); else if (r === 1) T.p(i, j, '#d0aa64'); } }, 5));
  const argile = (T, fendue) => {
    T.rect(0, 0, 32, 32, '#7a4a2a'); T.rect(1, 1, 30, 30, fendue ? '#a8683a' : '#c07a44'); T.rect(1, 1, 30, 2, fendue ? '#c08048' : '#e09a60'); T.rect(1, 29, 30, 2, '#8a5430');
    if (fendue) { T.ligne(6, 4, 14, 14, '#3a1e10'); T.ligne(14, 14, 11, 22, '#3a1e10'); T.ligne(14, 14, 25, 18, '#3a1e10'); T.ligne(25, 18, 27, 28, '#3a1e10'); T.ligne(11, 22, 5, 27, '#3a1e10'); }
    else for (let k = 0; k < 5; k++) T.p(5 + k * 5, 8 + (k % 3) * 6, '#d89060');
  };
  putImg('dec_fragile', toile(32, 32, (T) => argile(T, false)));
  putImg('dec_fendue', toile(32, 32, (T) => argile(T, true)));
  putImg('dec_porte_sable_ouverte', toile(32, 32, (T) => { T.rect(0, 0, 32, 32, '#c8a060'); T.rect(0, 0, 3, 32, '#8a6a3a'); T.rect(29, 0, 3, 32, '#8a6a3a'); grain(T, 16, ['#d8b878', '#b08850']); }));
  putImg('dec_toboggan', toile(32, 32, (T) => { T.disque(16, 16, 14, 14, '#8a6a3a'); T.disque(16, 16, 12, 12, null, (i, j, q) => (q > 0.6 ? '#c09a5a' : q > 0.3 ? '#8a6a38' : '#3a2a18')); for (let a = 0; a < 12; a++) T.p(16 + Math.cos(a * 0.9) * (11 - a * 0.7), 16 + Math.sin(a * 0.9) * (11 - a * 0.7), '#e8c888'); }));

  // ------- Forge-Acier (Acier) : tapis roulants rouges et bleus
  for (const [nom, c1, c2, c3] of [['rouge', '#b83a3a', '#e86060', '#ffd0c0'], ['bleu', '#2a5ab8', '#5a8ae8', '#d0e4ff']]) quatreSens(putImg, 'dec_tapis_' + nom, toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#3a3e48'); T.rect(3, 0, 26, 32, c1); T.rect(3, 0, 2, 32, '#2a2e36'); T.rect(27, 0, 2, 32, '#2a2e36');
    for (let k = 0; k < 2; k++) for (let i = 0; i < 9; i++) { const y = 6 + k * 14; T.p(16 - i, y + i, c3); T.p(16 + i, y + i, c3); T.p(16 - i, y + i + 1, c2); T.p(16 + i, y + i + 1, c2); }
  }));

  // ------- Rosebrume (Fée) : le rayon de lumière (horizontal, vertical, sur un miroir, croisé)
  const rayon = (T, h, v) => {
    if (h) { T.rect(0, 9, 32, 14, '#ff9ad060'); T.rect(0, 12, 32, 8, '#ff7ac0c0'); T.rect(0, 14, 32, 4, '#ffd0ec'); T.rect(0, 15, 32, 2, '#ffffff'); }
    if (v) { T.rect(9, 0, 14, 32, '#ff9ad060'); T.rect(12, 0, 8, 32, '#ff7ac0c0'); T.rect(14, 0, 4, 32, '#ffd0ec'); T.rect(15, 0, 2, 32, '#ffffff'); }
  };
  putImg('dec_rayon_h', toile(32, 32, (T) => rayon(T, true, false)));
  putImg('dec_rayon_v', toile(32, 32, (T) => rayon(T, false, true)));
  putImg('dec_rayon_x', toile(32, 32, (T) => rayon(T, true, true)));
  putImg('dec_rayon_m', toile(32, 32, (T) => T.disque(16, 16, 13, 13, null, (i, j, q) => (q > 0.6 ? '#ff7ac090' : q > 0.25 ? '#ffd0ec' : '#ffffff'))));

  // ------- Ombreval (Ténèbres) : l'abîme, les passerelles d'ombre éclairées
  putImg('dec_abime', toile(32, 32, (T) => vide(T, ['#06040a', '#08060e', '#050308'], ['#2a1a3a', '#1a1028'])));
  putImg('dec_pont_ombre', toile(32, 32, (T) => { vide(T, ['#06040a', '#08060e'], ['#2a1a3a']); T.rect(2, 2, 28, 28, '#5a3a8a90'); T.cadre(2, 2, 28, 28, '#c08af0c0'); T.cadre(5, 5, 22, 22, '#8a5ac080'); }));
}

/* ------------------------------------------------------------------ sprites (debout) */
const SPR = {
  // Voltacité : machine (transformateur), armoire à fusibles, porte du générateur
  machine: [32, 40, (T) => {
    T.rect(2, 10, 28, 28, '#4a525e'); T.rect(3, 11, 26, 26, '#7a8492'); T.rect(3, 11, 26, 2, '#a8b2c0');
    for (let k = 0; k < 4; k++) T.rect(6 + k * 6, 16, 3, 16, '#5a6270');
    T.rect(8, 2, 4, 9, '#c8a040'); T.rect(20, 2, 4, 9, '#c8a040'); T.disque(10, 3, 3, 2, '#f0d060'); T.disque(22, 3, 3, 2, '#f0d060');
    T.rect(12, 34, 8, 2, '#f0d040');
  }],
  armoire_elec: [32, 44, (T) => {
    T.rect(4, 4, 24, 38, '#3a4250'); T.rect(5, 5, 22, 36, '#9aa4b2'); T.rect(5, 5, 22, 2, '#c8d0dc');
    T.rect(8, 10, 16, 12, '#2a3038'); T.rect(9, 11, 6, 10, '#e8c040'); T.rect(17, 11, 6, 10, '#606870'); T.p(11, 13, '#fff4a0');
    T.disque(16, 30, 4, 4, '#e04040'); T.p(15, 29, '#ffa0a0');
    for (let j = 25; j < 40; j += 3) T.rect(7, j, 4, 1, '#6a7480');
  }],
  porte_gen: [32, 48, (T) => {
    T.rect(0, 2, 32, 46, '#2a3038'); T.rect(2, 4, 28, 44, '#6a7482'); T.rect(2, 4, 28, 2, '#9aa4b2');
    for (let j = 10; j < 46; j += 8) T.rect(2, j, 28, 2, '#4a525e');
    T.rect(14, 4, 4, 44, '#f0d040'); for (let j = 6; j < 46; j += 6) T.rect(14, j, 4, 3, '#2a2a30');
    T.disque(8, 8, 2, 2, '#40e070'); T.disque(24, 8, 2, 2, '#40e070');
  }],
  // Floralia : fleurs sur leur parterre, haie fermée
  fleur_bouton: [32, 34, (T) => { T.ligne(16, 16, 16, 32, '#2e7a32'); T.disque(11, 26, 5, 2.4, '#4aa04a'); T.disque(21, 28, 5, 2.4, '#3a903e'); T.disque(16, 11, 5, 7, null, (i, j, q) => (q > 0.65 ? '#2e7a32' : j < 9 ? '#e8a8c0' : '#5aa850')); }],
  fleur_ouverte: [32, 34, (T) => {
    T.ligne(16, 16, 16, 32, '#2e7a32'); T.disque(11, 26, 5, 2.4, '#4aa04a'); T.disque(21, 28, 5, 2.4, '#3a903e');
    for (let a = 0; a < 6; a++) { const c = Math.cos(a * 1.047), s = Math.sin(a * 1.047); T.disque(16 + c * 7, 11 + s * 7, 5, 5, null, (i, j, q) => (q > 0.7 ? '#d84a7a' : '#ff8ab0')); }
    T.disque(16, 11, 4, 4, '#f6d040'); T.p(15, 10, '#fff8c0'); T.p(14, 9, '#fff8c0');
  }],
  haie: [32, 40, (T) => {
    T.disque(16, 20, 16, 18, null, (i, j, q) => (q > 0.88 ? '#1e4a24' : j < 12 ? '#6ab85a' : (i * 3 + j * 5) % 11 === 0 ? '#2e6a34' : '#3e8a44'));
    for (let k = 0; k < 7; k++) { const x = 5 + (k * 9) % 22, y = 8 + (k * 7) % 22; T.p(x, y, '#ff8ab0'); T.p(x + 1, y, '#ff8ab0'); T.p(x, y + 1, '#ffd0e0'); }
    T.rect(4, 36, 24, 4, '#2a4a2a');
  }],
  // Mirage : orbe de cristal sur son socle
  orbe: [32, 44, (T) => {
    T.rect(9, 32, 14, 10, '#5a4a7a'); T.rect(9, 32, 14, 2, '#8a7ab0'); T.rect(6, 40, 20, 4, '#3a2e52');
    T.disque(16, 18, 13, 13, null, (i, j, q) => (q > 0.85 ? '#5a3ab0' : q > 0.5 ? '#9a7ae8' : '#d8c8ff'));
    T.disque(12, 13, 3, 2.5, '#ffffff'); T.p(20, 24, '#ffffff');
  }],
  // Port-Granit : roche de la carrière
  roche_gym: [32, 34, (T) => {
    T.disque(16, 20, 15, 13, null, (i, j, q) => (q > 0.82 ? '#4a3e32' : j < 14 && i < 18 ? '#c8b49a' : j > 24 ? '#7a6a56' : '#a8967c'));
    T.ligne(9, 12, 14, 22, '#6a5a48'); T.ligne(20, 14, 24, 26, '#6a5a48'); T.disque(10, 12, 3, 2, '#dccab0');
  }],
  // Cendrelune : vanne de la lave
  vanne_lave: [32, 40, (T) => {
    T.rect(13, 18, 6, 20, '#4a3a34'); T.rect(14, 18, 2, 20, '#7a6a60'); T.rect(8, 36, 16, 4, '#2a201c');
    T.disque(16, 14, 12, 12, '#2a2020'); T.disque(16, 14, 10, 10, '#c84a20'); T.disque(16, 14, 7, 7, '#2a2020');
    for (let a = 0; a < 4; a++) T.ligne(16, 14, 16 + Math.cos(a * 1.57 + 0.4) * 9, 14 + Math.sin(a * 1.57 + 0.4) * 9, '#e86a30');
    T.disque(16, 14, 2.5, 2.5, '#f0a040');
  }],
  vanne_lave2: [32, 40, (T) => {
    T.rect(13, 18, 6, 20, '#2a2a34'); T.rect(14, 18, 2, 20, '#5a5a6a'); T.rect(8, 36, 16, 4, '#141418');
    T.disque(16, 14, 12, 12, '#141418'); T.disque(16, 14, 10, 10, '#4a4a5a'); T.disque(16, 14, 7, 7, '#141418');
    for (let a = 0; a < 4; a++) T.ligne(16, 14, 16 + Math.cos(a * 1.57 + 0.4) * 9, 14 + Math.sin(a * 1.57 + 0.4) * 9, '#8a5ae0');
    T.disque(16, 14, 2.5, 2.5, '#b08af0');
  }],
  // Fort-Écaille : statue de dragon
  statue_pont: [32, 48, (T) => {
    T.rect(4, 38, 24, 10, '#4a4258'); T.rect(4, 38, 24, 2, '#7a7290');
    T.disque(16, 26, 10, 12, null, (i, j, q) => (q > 0.8 ? '#3a3448' : i < 14 ? '#9a90b8' : '#6e6688'));
    T.disque(16, 11, 8, 7, null, (i, j, q) => (q > 0.8 ? '#3a3448' : i < 14 ? '#aaa0c8' : '#7a7298'));
    T.ligne(10, 6, 6, 0, '#7a7298'); T.ligne(22, 6, 26, 0, '#7a7298'); T.rect(12, 9, 3, 2, '#e05050'); T.rect(18, 9, 3, 2, '#e05050');
    T.ligne(6, 22, 1, 14, '#7a7298'); T.ligne(26, 22, 31, 14, '#7a7298');
  }],
  // Métropole : vitrine, tableau sur chevalet, socle, porte de salle fermée
  vitrine: [32, 44, (T) => {
    T.rect(4, 26, 24, 18, '#7a4a2a'); T.rect(4, 26, 24, 2, '#a86a40'); T.rect(6, 30, 20, 12, '#5a3420');
    T.rect(5, 4, 22, 22, '#c8e8f8a0'); T.cadre(5, 4, 22, 22, '#d0a050'); T.ligne(8, 8, 12, 4, '#ffffff'); T.ligne(8, 12, 16, 4, '#ffffffa0');
    T.disque(16, 18, 5, 5, '#e0a040'); T.p(15, 17, '#fff0a0');
  }],
  tableau: [32, 44, (T) => {
    T.ligne(8, 30, 4, 44, '#6a4a2a'); T.ligne(24, 30, 28, 44, '#6a4a2a'); T.ligne(16, 30, 16, 44, '#5a3a1c');
    T.rect(2, 2, 28, 28, '#c89a40'); T.rect(4, 4, 24, 24, '#e8c860'); T.rect(5, 5, 22, 22, '#5a8ac8');
    T.rect(5, 18, 22, 9, '#5aa850'); T.disque(21, 10, 3, 3, '#f6e080'); T.disque(12, 18, 4, 3, '#e8e0d0');
  }],
  socle_musee: [32, 44, (T) => {
    T.rect(7, 20, 18, 22, '#e8e4dc'); T.rect(7, 20, 4, 22, '#ffffff'); T.rect(21, 20, 4, 22, '#b8b4ac'); T.rect(5, 40, 22, 4, '#a8a49c'); T.rect(5, 18, 22, 3, '#d8d4cc');
    T.disque(16, 12, 6, 6, null, (i, j, q) => (q > 0.7 ? '#a07a20' : i < 15 ? '#f6d860' : '#d0a830'));
  }],
  porte_galerie: [32, 48, (T) => {
    T.rect(0, 0, 32, 48, '#5a3a20'); T.rect(2, 2, 28, 46, '#8a5a30'); T.rect(4, 4, 11, 42, '#a06a3a'); T.rect(17, 4, 11, 42, '#a06a3a');
    T.cadre(6, 8, 7, 14, '#6a4220'); T.cadre(19, 8, 7, 14, '#6a4220'); T.cadre(6, 28, 7, 14, '#6a4220'); T.cadre(19, 28, 7, 14, '#6a4220');
    T.disque(14, 26, 1.5, 1.5, '#f0c040'); T.disque(18, 26, 1.5, 1.5, '#f0c040');
  }],
  // Port-Lisière : canon à vent (un par sens), manivelle
  canon_up: [32, 40, (T) => canon(T, 'up')], canon_right: [32, 40, (T) => canon(T, 'right')], canon_down: [32, 40, (T) => canon(T, 'down')], canon_left: [32, 40, (T) => canon(T, 'left')],
  manivelle: [32, 36, (T) => {
    T.rect(12, 14, 8, 20, '#6a6a76'); T.rect(12, 14, 2, 20, '#9a9aa6'); T.rect(8, 32, 16, 4, '#3a3a44');
    T.disque(16, 12, 9, 9, '#3a3a44'); T.disque(16, 12, 7, 7, '#c8c8d0'); T.disque(16, 12, 3, 3, '#3a3a44');
    T.ligne(16, 12, 25, 6, '#7a4a2a'); T.disque(25, 6, 2.5, 2.5, '#c03a3a');
  }],
  // Marais-Noir : roseaux, lanternes, grille fermée
  roseaux: [32, 40, (T) => {
    for (let k = 0; k < 6; k++) { const x = 6 + k * 4, h = 20 + (k * 7) % 14; T.ligne(x, 40, x + (k % 2 ? 2 : -2), 40 - h, k % 2 ? '#5a7a3a' : '#7a9a4a'); T.disque(x + (k % 2 ? 2 : -2), 40 - h + 3, 1.5, 3.5, '#7a5a3a'); }
    T.disque(16, 38, 12, 2.5, '#2e3a22');
  }],
  lanterne_marais: [32, 44, (T) => lanterne(T, false)],
  lanterne_marais_on: [32, 44, (T) => lanterne(T, true)],
  grille_marais: [32, 48, (T) => grille(T, '#3a4a2a', '#6a8a4a', '#9ac070')],
  grille_cristal: [32, 48, (T) => grille(T, '#b06a90', '#e8a8d0', '#fff0f8')],
  grille_ombre: [32, 48, (T) => grille(T, '#1a1426', '#4a3a6a', '#8a6ac0')],
  // Dunes d'Ocre : rocher de grès, porte de pierre
  rocher_sable: [32, 32, (T) => {
    T.disque(16, 19, 15, 12, null, (i, j, q) => (q > 0.82 ? '#7a5428' : j < 14 && i < 18 ? '#f0c888' : j > 24 ? '#b08048' : '#d8a868'));
    for (let j = 12; j < 30; j += 4) T.ligne(4, j, 28, j + 1, '#c09058');
  }],
  porte_sable: [32, 48, (T) => {
    T.rect(0, 0, 32, 48, '#8a6a3a'); T.rect(2, 2, 28, 46, '#c8a060'); T.rect(2, 2, 28, 3, '#e8c888');
    for (let j = 8; j < 46; j += 8) T.rect(2, j, 28, 1, '#a8804a'); T.disque(16, 22, 6, 6, '#a8804a'); T.disque(16, 22, 4, 4, '#e8c060');
  }],
  // Forge-Acier : leviers rouge et bleu
  levier_rouge: [32, 40, (T) => levier(T, '#c83a3a', '#ff8080')],
  levier_bleu: [32, 40, (T) => levier(T, '#2a5ac8', '#8ab0ff')],
  // Rosebrume : rosier, miroirs (deux sens), source et cristal
  buisson_rose: [32, 36, (T) => {
    T.disque(16, 20, 15, 14, null, (i, j, q) => (q > 0.86 ? '#2a5a34' : j < 12 ? '#6ab86a' : (i + j * 3) % 9 === 0 ? '#2e6a3a' : '#4a9a52'));
    for (let k = 0; k < 8; k++) { const x = 5 + (k * 11) % 22, y = 8 + (k * 5) % 18; T.disque(x, y, 2, 2, k % 2 ? '#ff7ab0' : '#ffb0d0'); T.p(x, y, '#fff0f6'); }
  }],
  miroir_a: [32, 44, (T) => miroir(T, '/')],
  miroir_b: [32, 44, (T) => miroir(T, '\\')],
  source: [32, 40, (T) => {
    T.rect(6, 28, 20, 12, '#d8c8d8'); T.rect(6, 28, 20, 2, '#ffffff'); T.rect(4, 38, 24, 2, '#a898a8');
    T.disque(16, 16, 11, 13, null, (i, j, q) => (q > 0.8 ? '#e070b0' : q > 0.4 ? '#ffb0d8' : '#ffffff'));
    for (let a = 0; a < 8; a++) T.ligne(16 + Math.cos(a * 0.785) * 12, 16 + Math.sin(a * 0.785) * 12, 16 + Math.cos(a * 0.785) * 15, 16 + Math.sin(a * 0.785) * 15, '#fff0f8');
  }],
  cristal_cible: [32, 44, (T) => cristal(T, false)],
  cristal_cible_on: [32, 44, (T) => cristal(T, true)],
  // Ombreval : torches
  torche_ombre: [32, 44, (T) => torche(T, false)],
  torche_ombre_on: [32, 44, (T) => torche(T, true)],
};
const CIRE = [['#f0b030', '#a86a10', '#ffe08a'], ['#e05040', '#902818', '#ffa090'], ['#58b048', '#2e6a24', '#b0f0a0'], ['#4a8ae0', '#24508a', '#b0d0ff'], ['#a060d0', '#5a2a88', '#e0c0ff']];
CIRE.forEach(([c, s2, h], k) => {
  SPR['cire_' + k] = [32, 40, (T) => {
    for (let j = 4; j < 40; j++) for (let i = 1; i < 31; i++) {
      const r = Math.floor(j / 7), x = (i + (r % 2 ? 4 : 0)) % 8, y = j % 7;
      T.p(i, j, x === 0 || y === 0 ? s2 : y < 3 ? h : c);
    }
    T.rect(1, 4, 30, 2, h); T.rect(1, 38, 30, 2, s2);
  }];
});
// ruchers : une ruche de bois, des bandes de la couleur des murs qu'elle commande (toutes les combinaisons d'une à trois couleurs)
for (let a = 0; a < 5; a++) for (let b = a; b < 5; b++) for (let c2 = b; c2 < 5; c2++) {
  const fl = [...new Set([a, b, c2])]; const code = fl.join('');
  if (SPR['ruche_' + code]) continue;
  SPR['ruche_' + code] = [32, 44, (T) => {
    T.rect(13, 34, 6, 10, '#5a3a1c'); T.rect(8, 42, 16, 2, '#3a240e');
    T.rect(6, 6, 20, 30, '#7a4e22'); T.rect(7, 7, 18, 28, '#b8843e'); T.rect(5, 4, 22, 4, '#5a3a1c'); T.rect(5, 4, 22, 1, '#d4a060');
    fl.forEach((k, n) => { const y = 11 + n * 7; T.rect(7, y, 18, 4, CIRE[k][0]); T.rect(7, y, 18, 1, CIRE[k][2]); T.rect(7, y + 3, 18, 1, CIRE[k][1]); });
    T.disque(16, 32, 2.5, 1.5, '#2a1808');
    for (const [x, y] of [[4, 14], [27, 20], [25, 6]]) { T.disque(x, y, 1.5, 1.2, '#f0c030'); T.p(x, y, '#2a1808'); }
  }];
}
function canon(T, d) {
  T.rect(6, 30, 20, 8, '#4a3a2a'); T.rect(6, 30, 20, 2, '#7a6040'); T.disque(9, 37, 3, 3, '#2a2018'); T.disque(23, 37, 3, 3, '#2a2018');
  const [dx, dy] = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[d];
  T.disque(16, 22, 9, 8, null, (i, j, q) => (q > 0.75 ? '#2a4a7a' : i < 14 ? '#8ab8e8' : '#5a8ac0'));
  for (let k = 0; k < 11; k++) T.disque(16 + dx * k, 20 + dy * k * 0.7, 5, 4.5, null, (i, j, q) => (q > 0.7 ? '#2a4a7a' : '#7aa8d8'));
  T.disque(16 + dx * 11, 20 + dy * 7.7, 4, 3.5, '#1a2a44'); T.disque(16 + dx * 11, 20 + dy * 7.7, 2.5, 2, '#e8f4ff');
  T.disque(16, 22, 3, 3, '#f0c040');
}
function lanterne(T, on) {
  if (on) T.disque(16, 14, 15, 14, null, (i, j, q) => (q > 0.5 ? '#80ff9a30' : '#a0ffb860'));
  T.rect(15, 22, 2, 20, '#3a3a2a'); T.rect(10, 41, 12, 3, '#2a2a1e');
  T.rect(9, 6, 14, 16, '#2a3a24'); T.rect(10, 7, 12, 14, on ? '#a8ffb0' : '#4a5a40'); T.rect(9, 4, 14, 3, '#3a4a2e');
  if (on) { T.disque(16, 14, 3, 4, '#ffffff'); T.p(16, 9, '#e0ffe8'); }
  T.rect(15, 21, 2, 2, '#5a6a4a');
}
function grille(T, c1, c2, c3) {
  T.rect(0, 0, 32, 4, c1); T.rect(0, 44, 32, 4, c1); T.rect(0, 0, 32, 1, c3);
  for (let i = 2; i < 32; i += 5) { T.rect(i, 2, 3, 44, c1); T.rect(i, 2, 1, 44, c2); T.disque(i + 1, 3, 2, 2, c2); }
  T.rect(0, 22, 32, 3, c1); T.rect(0, 22, 32, 1, c3);
}
function levier(T, c1, c2) {
  T.rect(7, 26, 18, 12, '#3a3e48'); T.rect(7, 26, 18, 2, '#6a707c'); T.rect(5, 37, 22, 3, '#2a2e36');
  T.rect(12, 22, 8, 5, '#5a5e68'); T.ligne(16, 24, 23, 6, '#9aa0aa'); T.ligne(17, 24, 24, 6, '#6a707a');
  T.disque(23, 6, 4, 4, c1); T.p(22, 5, c2); T.rect(9, 30, 14, 4, c1); T.rect(9, 30, 14, 1, c2);
}
function miroir(T, sens) {
  T.rect(13, 32, 6, 8, '#a898b0'); T.rect(8, 39, 16, 4, '#7a6a88');
  T.disque(16, 18, 13, 15, null, (i, j, q) => (q > 0.82 ? '#c8a040' : '#d8f0ff'));
  for (let k = -9; k <= 9; k++) { const x = 16 + k, y = 18 + (sens === '/' ? -k : k); T.p(x, y, '#ffffff'); T.p(x, y + 1, '#ffffff'); T.p(x + 1, y, '#e0d0ff'); }
  T.disque(10, 10, 2, 2, '#ffffff');
}
function cristal(T, on) {
  if (on) T.disque(16, 18, 15, 17, null, (i, j, q) => (q > 0.5 ? '#ffc0e840' : '#ffe0f480'));
  T.rect(8, 38, 16, 6, '#7a5a7a'); T.rect(8, 38, 16, 2, '#a888a8');
  const pts = [[16, 2], [26, 16], [20, 38], [12, 38], [6, 16]];
  for (let j = 2; j < 38; j++) for (let i = 4; i < 28; i++) {
    let dans = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > j) !== (yb > j) && i < (xb - xa) * (j - ya) / (yb - ya) + xa) dans = !dans; }
    if (dans) T.p(i, j, on ? (i < 16 ? '#ffe0f4' : '#ff9ad0') : (i < 16 ? '#c8a8c0' : '#8a6a88'));
  }
  T.ligne(16, 2, 16, 38, on ? '#ffffff' : '#a888a8');
}
function torche(T, on) {
  if (on) T.disque(16, 10, 15, 13, null, (i, j, q) => (q > 0.5 ? '#c080ff30' : '#e0b0ff60'));
  T.rect(14, 16, 4, 26, '#3a2a4a'); T.rect(14, 16, 1, 26, '#5a4a6a'); T.rect(9, 41, 14, 3, '#1a1222');
  T.rect(10, 12, 12, 5, '#4a3a5a'); T.rect(10, 12, 12, 1, '#7a6a8a');
  if (on) { T.disque(16, 7, 5, 7, null, (i, j, q) => (q > 0.5 ? '#9a4ae0' : q > 0.2 ? '#c88aff' : '#ffffff')); T.p(14, 2, '#e0c0ff'); }
  else T.disque(16, 10, 4, 2, '#2a2034');
}
/** pose les sprites des arènes dans la planche (zone libre du bas) ; add(k, x, y, w, h, densité) */
export function spritesArenes(ctx, add, x0 = 0, y0 = 1900, largeur = 2048) {
  let x = x0, y = y0;
  for (const [k, [w, h, draw]] of Object.entries(SPR)) {
    if (x + w > largeur) { x = x0; y += 52; }
    ctx.drawImage(toile(w, h, draw), x, y);
    add(k, x, y, w, h, 2);
    x += w + 2;
  }
}
