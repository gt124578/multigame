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
  // le Barrage (Port-Azur) : dalles bleu doux, joints à peine marqués (l'ancien damier bleu et blanc scintillait)
  putImg('floor_gymWater', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#5a9ad4');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#4f8cc6');
    grain(T, 14, ['#649fd8', '#5494cf']);
  }, 21));
  // le Jardin des Floraisons (Floralia) : grandes dalles de pierre de serre, joints envahis de mousse
  putImg('floor_gymGrass', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#b4b8a0'); grain(T, 18, ['#bcc0a8', '#a8ac94', '#c4c8b0']);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, (i * 5 + j * 3) % 7 < 4 ? '#5a8a4a' : '#7aa860');
    for (const [x, y] of [[1, 15], [15, 3], [17, 29], [30, 17], [16, 16]]) { T.p(x, y, '#4a7a3a'); T.p(x + 1, y, '#8ab870'); }
    T.p(6, 6, '#d0d4bc'); T.p(24, 22, '#d0d4bc');
  }, 23));
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

  // estrade d'Hector (la Ruche) : rayon de miel ambré cerclé de cire dorée
  putImg('dec_estrade_bug', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#8a5a14');
    for (let j = 1; j < 31; j++) for (let i = 1; i < 31; i++) {
      const r = Math.floor(j / 6), x = (i + (r % 2 ? 3 : 0)) % 6, y = j % 6;
      T.p(i, j, x === 0 || y === 0 ? '#b07818' : y < 3 ? '#f6c850' : '#e0a838');
    }
    T.cadre(0, 0, 32, 32, '#f0d070'); T.rect(0, 30, 32, 2, '#6a4410');
  }));

  // estrade de Volta (la Dynamo) : plaque d'acier striée, bande jaune et noire, rivets
  putImg('dec_estrade_elec', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#4a525e'); T.rect(1, 1, 30, 30, '#6a7482');
    for (let j = 4; j < 28; j += 4) for (let i = 3; i < 29; i += 6) { T.rect(i + (j % 8 ? 3 : 0), j, 2, 1, '#8a94a2'); }
    for (let i = 0; i < 32; i += 8) { T.rect(i, 0, 4, 3, '#f0d040'); T.rect(i + 4, 0, 4, 3, '#2a2a30'); T.rect(i, 29, 4, 3, '#2a2a30'); T.rect(i + 4, 29, 4, 3, '#f0d040'); }
    for (const [x, y] of [[3, 5], [28, 5], [3, 26], [28, 26]]) { T.p(x, y, '#b8c0cc'); T.p(x + 1, y + 1, '#3a4048'); }
  }));
  // estrade de Flora (le Jardin) : dalle de pierre claire bordée de mousse et de petites fleurs
  putImg('dec_estrade_grass', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#b8b098'); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#8a8470');
    T.cadre(0, 0, 32, 32, '#4a8a3a'); T.cadre(1, 1, 30, 30, '#6aaa4a');
    for (const [x, y, c] of [[4, 2, '#ff8ab0'], [14, 1, '#f6d040'], [25, 2, '#ff8ab0'], [2, 14, '#fff0f4'], [29, 20, '#f6d040'], [9, 29, '#fff0f4'], [21, 30, '#ff8ab0']]) { T.p(x, y, c); T.p(x + 1, y, c); }
    T.rect(0, 30, 32, 2, '#3a6a2a');
  }));
  // estrade de Sibylle (le Palais des Songes) : marbre lilas, cercle d'or, étoile au centre
  putImg('dec_estrade_psy', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6a5a9a'); T.rect(1, 1, 30, 30, '#8a7ab8');
    for (let i = 0; i < 32; i++) { const o = Math.round(10 + Math.sin(i * 0.35) * 6); T.p(i, o, '#a898d0'); T.p(i, o + 12, '#7a6aa8'); }
    T.disque(16, 16, 9, 9, null, (i, j, q) => (q > 0.85 ? '#e8c860' : null));
    T.p(16, 12, '#fff0b0'); T.p(16, 20, '#fff0b0'); T.p(12, 16, '#fff0b0'); T.p(20, 16, '#fff0b0'); T.rect(15, 15, 3, 3, '#f8e090');
    T.rect(0, 30, 32, 2, '#3a2e5a');
  }));

  // ------- les trois frères de l'archipel : leur estrade de Champion
  // estrade de Basalte (la Carrière) : dalle de granit taillé, veines sombres, cornières de fer aux angles
  putImg('dec_estrade_rock', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#8a7458'); T.rect(1, 1, 30, 30, '#b49c7a');
    for (let k = 0; k < 46; k++) { const x = 2 + Math.floor(T.rnd() * 28), y = 2 + Math.floor(T.rnd() * 28); T.p(x, y, T.rnd() < 0.5 ? '#c8b292' : '#96805e'); }
    T.ligne(3, 9, 13, 13, '#6a5a44'); T.ligne(13, 13, 17, 22, '#6a5a44'); T.ligne(20, 4, 28, 11, '#6a5a44'); T.ligne(6, 26, 12, 22, '#6a5a44');
    T.rect(1, 1, 30, 1, '#d8c4a2'); T.rect(0, 30, 32, 2, '#57442e');
    for (const [x, y] of [[0, 0], [27, 0], [0, 27], [27, 27]]) { T.rect(x, y, 5, 5, '#4a4a52'); T.p(x + 2, y + 2, '#c0c0cc'); }
  }));
  // estrade de Pyros (la Forge) : basalte noir craquelé, la braise affleure dans les fissures, liseré de lave
  putImg('dec_estrade_fire', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#b8320e'); T.rect(1, 1, 30, 30, '#ff8a2a'); T.rect(2, 2, 28, 28, '#2e2422');
    for (let k = 0; k < 30; k++) { const x = 3 + Math.floor(T.rnd() * 26), y = 3 + Math.floor(T.rnd() * 26); T.p(x, y, '#463633'); }
    for (const [x0, y0, x1, y1] of [[4, 8, 12, 12], [12, 12, 15, 20], [15, 20, 26, 23], [19, 4, 22, 13], [22, 13, 28, 15], [6, 26, 12, 21]]) { T.ligne(x0, y0, x1, y1, '#e8521e'); T.ligne(x0, y0 + 1, x1, y1 + 1, '#7a1e0a'); }
    T.p(12, 12, '#ffd060'); T.p(15, 20, '#ffd060'); T.p(22, 13, '#ffd060');
  }));
  // estrade de Drakos (la Tour) : écailles indigo imbriquées, cerclées d'or
  putImg('dec_estrade_dragon', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#231d3e');
    for (let j = 2; j < 30; j++) for (let i = 2; i < 30; i++) {
      const b = j % 8, a = (i + ((j >> 3) % 2 ? 4 : 0)) % 8 - 3.5, r = Math.sqrt(a * a + (b - 1) * (b - 1));
      T.p(i, j, r > 3.3 && r < 4.4 && b >= 1 ? '#1a1530' : b < 3 ? '#6a5cc0' : b < 6 ? '#4a3f96' : '#3a3078');
    }
    T.cadre(0, 0, 32, 32, '#8a6a2a'); T.cadre(1, 1, 30, 30, '#e8c860'); T.rect(0, 30, 32, 2, '#5a4418');
  }));
  // estrades des Champions du Sud (Normal, Vol, Poison, Sol, Acier, Fée, Ténèbres)
  putImg('dec_estrade_normal', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#d8d2c6'); T.cadre(0, 0, 32, 32, '#c8a440'); T.cadre(2, 2, 28, 28, '#efe8da');
    T.rect(0, 30, 32, 2, '#7a6638'); for (let i = 4; i < 32; i += 8) { T.p(i, 4, '#b8943a'); T.p(i, 27, '#b8943a'); }
  }));
  putImg('dec_estrade_flying', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#64a2e0'); T.cadre(0, 0, 32, 32, '#e4f4ff'); T.cadre(2, 2, 28, 28, '#9ed0fc');
    T.rect(0, 30, 32, 2, '#2d5c8c'); T.disque(16, 15, 7, 4, '#ffffffa0');
  }));
  putImg('dec_estrade_poison', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#2e223e'); T.cadre(0, 0, 32, 32, '#b064e0'); T.cadre(2, 2, 28, 28, '#54386c');
    T.rect(0, 30, 32, 2, '#1a1026'); for (const [x, y] of [[9, 10], [21, 12], [14, 22]]) { T.disque(x, y, 2, 2, '#9a4ac0'); T.p(x - 1, y - 1, '#e8b8ff'); }
  }));
  putImg('dec_estrade_ground', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#b88446'); T.cadre(0, 0, 32, 32, '#f0c878'); T.cadre(2, 2, 28, 28, '#8c5e28');
    T.rect(0, 30, 32, 2, '#5c3c18'); for (let j = 6; j < 28; j += 7) T.rect(5, j, 22, 1, '#d4a25e');
  }));
  putImg('dec_estrade_steel', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6e7684'); T.cadre(0, 0, 32, 32, '#d8e0ec'); T.cadre(2, 2, 28, 28, '#444a56');
    T.rect(0, 30, 32, 2, '#2c303a'); for (const [x, y] of [[4, 4], [26, 4], [4, 26], [26, 26]]) T.rect(x, y, 2, 2, '#eef4ff');
  }));
  putImg('dec_estrade_fairy', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#f4d2e4'); T.cadre(0, 0, 32, 32, '#e89ec0'); T.cadre(2, 2, 28, 28, '#ffffff');
    T.rect(0, 30, 32, 2, '#985070'); for (const [x, y] of [[16, 8], [8, 16], [24, 16], [16, 24]]) T.p(x, y, '#ffd860');
  }));
  putImg('dec_estrade_dark', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#181424'); T.cadre(0, 0, 32, 32, '#8a5ad0'); T.cadre(2, 2, 28, 28, '#32264a');
    T.rect(0, 30, 32, 2, '#0a0812'); T.disque(16, 16, 5, 5, '#5a3a90'); T.p(16, 16, '#e0b8ff');
  }));

  // ------- parois des arènes en relief (render/arenes-relief.js) : une tuile = une case d'écran de haut, calée en haut
  // au ras de la lave : la tranche de basalte des dalles, rougie par en dessous (les 8 premières lignes servent)
  putImg('arf_lave', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#1a1210'); T.rect(0, 0, 32, 1, '#5a4a44');
    for (let i = 0; i < 32; i++) { const f = (i * 7) % 5 === 0; T.p(i, 1, f ? '#2a1e1a' : '#3a2c28'); T.p(i, 2, '#2e2220'); T.p(i, 3, f ? '#5a2a18' : '#3a2420'); T.p(i, 4, '#8a3a14'); T.p(i, 5, '#c8521a'); T.p(i, 6, '#f08a2a'); T.p(i, 7, i % 3 ? '#ffb040' : '#ffe080'); }
    for (const x of [5, 14, 22, 29]) { T.p(x, 2, '#c8521a'); T.p(x, 3, '#f08a2a'); }
  }));
  // fosse de la carrière : front de taille, strates qui s'assombrissent (les 12 premières lignes servent)
  putImg('arf_fosse', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) { const c = ['#c8b49a', '#a8967c', '#a08c72', '#8a7860', '#84725a', '#74624c', '#6a5a46', '#5a4a3a', '#50422e', '#443828', '#3a2e22', '#2e241a'][Math.min(11, j)]; T.rect(0, j, 32, 1, c); }
    for (const [x, y, l] of [[3, 3, 7], [18, 2, 9], [9, 6, 11], [24, 7, 6], [1, 9, 8], [15, 10, 10]]) T.rect(x, y, l, 1, '#4a3c2c');
    for (const x of [7, 16, 27]) { T.p(x, 4, '#4a3c2c'); T.p(x, 5, '#4a3c2c'); T.p(x + 1, 8, '#3a2e22'); }
  }));
  // gouffre de la Tour de Drakos : trois assises de pierre indigo sous une lèvre claire, puis la paroi fond dans le noir
  const NUIT = ['#0c0a14', '#100e1a'];
  putImg('arf_gouffre', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const r = j >> 3, joint = j % 8 === 0 || (i + (r % 2 ? 8 : 0)) % 16 === 0, k = Math.min(1, j / 26);
      const mel = (a, b) => Math.round(a + (b - a) * k * k).toString(16).padStart(2, '0');
      const [cr, cg, cb] = joint ? [0x2a, 0x24, 0x48] : j % 8 === 1 ? [0x6a, 0x5e, 0xa8] : [0x4a, 0x40, 0x80];
      T.p(i, j, '#' + mel(cr, 0x0c) + mel(cg, 0x0a) + mel(cb, 0x14));
    }
    T.rect(0, 0, 32, 1, '#9a8ee0'); T.rect(0, 1, 32, 1, '#7a6ec0');
    for (let k = 0; k < 5; k++) T.p(3 + k * 7, 27 + (k % 2) * 2, '#3a2a5a');
  }));
  // pont-dragon : une dalle de quatre lignes (chant doré), et dessous l'ombre du gouffre
  putImg('arf_pont', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, NUIT[0]); for (let k = 0; k < 9; k++) T.p((k * 11 + 3) % 32, 8 + (k * 7) % 22, k % 3 ? NUIT[1] : '#2a2040');
    T.rect(0, 0, 32, 1, '#e8c860'); T.rect(0, 1, 32, 2, '#8a7ad0'); T.rect(0, 3, 32, 1, '#3a3078'); T.rect(0, 4, 32, 2, '#1a1530');
    for (let i = 3; i < 32; i += 8) T.p(i, 2, '#5a4ea0');
  }));
  // au ras des bassins (Port-Azur) : margelle claire puis carrelage humide et reflet d'écume (les 8 premières lignes servent)
  putImg('arf_eau', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#1e3a58');
    T.rect(0, 0, 32, 1, '#c4d4e4'); T.rect(0, 1, 32, 2, '#5a7c9c'); T.rect(0, 3, 32, 2, '#446484'); T.rect(0, 5, 32, 1, '#324e6e');
    for (let i = 0; i < 32; i += 8) { T.rect(i, 1, 1, 5, '#3a5878'); T.p(i + 4, 2, '#6e90b0'); }
    T.rect(0, 6, 32, 1, '#8cc4e8'); T.rect(0, 7, 32, 1, '#c8ecff');
    for (let i = 2; i < 32; i += 7) T.p(i, 6, '#b8e4fc');
  }));
  // Port-Lisière (Vol) : corniche nuageuse/blanche des îles flottantes qui fond dans le bleu du ciel (#9ad0f6)
  putImg('arf_ciel', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#9ad0f6');
    T.rect(0, 0, 32, 2, '#ffffff'); T.rect(0, 2, 32, 2, '#d8eefc'); T.rect(0, 4, 32, 3, '#98c8ee'); T.rect(0, 7, 32, 2, '#68a4dc');
    for (let i = 0; i < 32; i += 8) { T.rect(i + 2, 3, 4, 3, '#b8dcf6'); T.rect(i, 7, 2, 3, '#5490cc'); }
    for (let j = 9; j < 18; j++) for (let i = 0; i < 32; i++) if ((i + j) % 3 === 0) T.p(i, j, j < 13 ? '#80b8e8' : '#8ec6f2');
  }));
  // passerelle suspendue dans le ciel (Port-Lisière) : bois chaud liseré blanc, ciel dessous
  putImg('arf_pont_ciel', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#9ad0f6');
    T.rect(0, 0, 32, 1, '#f0f0f0'); T.rect(0, 1, 32, 2, '#c08a50'); T.rect(0, 3, 32, 1, '#8a5a30'); T.rect(0, 4, 32, 1, '#5a7ea8');
    for (let i = 4; i < 32; i += 6) T.p(i, 2, '#7a4a24');
  }));
  // abîme d'Ombreval : assises de pierre sombre violacée fondant vers #06040a (fond dec_abime)
  putImg('arf_abime', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const r = j >> 3, joint = j % 8 === 0 || (i + (r % 2 ? 8 : 0)) % 16 === 0, k = Math.min(1, j / 24);
      const mel = (a, b) => Math.round(a + (b - a) * k * k).toString(16).padStart(2, '0');
      const [cr, cg, cb] = joint ? [0x1c, 0x12, 0x2c] : j % 8 === 1 ? [0x58, 0x46, 0x78] : [0x38, 0x28, 0x54];
      T.p(i, j, '#' + mel(cr, 0x06) + mel(cg, 0x04) + mel(cb, 0x0a));
    }
    T.rect(0, 0, 32, 1, '#7a6898'); T.rect(0, 1, 32, 1, '#5a4a78');
  }));
  // passerelle d'ombre d'Ombreval : chant lumineux améthyste, noir de l'abîme dessous
  putImg('arf_pont_ombre', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#06040a');
    T.rect(0, 0, 32, 1, '#c08af0'); T.rect(0, 1, 32, 2, '#7a4ab8'); T.rect(0, 3, 32, 1, '#3a1e5a');
    for (let i = 2; i < 32; i += 6) T.p(i, 1, '#e0b8ff');
  }));
  // dessus lisible des gradins de la carrière (Port-Granit) : plateau de grès / calcaire aux strates nettes
  putImg('arf_carriere_haut', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#aa9274');
    T.rect(0, 0, 32, 2, '#d4be9e'); T.rect(0, 0, 2, 32, '#d4be9e');
    T.rect(0, 30, 32, 2, '#6a5640'); T.rect(30, 0, 2, 32, '#6a5640');
    for (const [x, y, l] of [[4, 7, 10], [17, 11, 9], [6, 18, 13], [19, 24, 8]]) T.rect(x, y, l, 1, '#7c664e');
    for (let k = 0; k < 14; k++) T.p(3 + (k * 7) % 25, 4 + (k * 11) % 24, k % 2 ? '#c4ac8c' : '#8c765c');
  }));

  // ------- Cimelune, le Musée des Dragons : estrade de marbre sous le squelette (gauche, milieu, droite), cordon de velours
  for (const [g, x0, x1] of [['g', 2, 32], ['m', 0, 32], ['d', 0, 30]]) putImg('dec_estrade_musee_' + g, toile(32, 32, (T) => {
    T.rect(x0, 3, x1 - x0, 27, '#6e2a3a'); T.rect(x0, 3, x1 - x0, 2, '#e8c860'); T.rect(x0, 28, x1 - x0, 2, '#4a1a26');
    for (let i = x0; i < x1; i += 4) T.p(i, 16 + (i % 8 ? 0 : 1), '#8a3a4c');
    if (g === 'g') { T.rect(2, 3, 2, 27, '#e8c860'); } if (g === 'd') { T.rect(28, 3, 2, 27, '#e8c860'); }
    T.rect(x0, 30, x1 - x0, 2, '#00000030');
  }));
  // ------- Fort-Écaille, la Caserne d'Écaille : dallage de pierre bleutée, tapis de garde indigo liseré d'or
  putImg('floor_caserne', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#7c7a8e');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const r = j >> 4, x = (i + (r % 2 ? 8 : 0)) % 16, y = j % 16; if (x === 0 || y === 0) T.p(i, j, '#585668'); else if (x === 1 || y === 1) T.p(i, j, '#9694a8'); }
    for (let k = 0; k < 26; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), T.rnd() < 0.5 ? '#8a889c' : '#6e6c80');
  }));
  putImg('dec_tapis_caserne', toile(32, 32, (T) => {
    T.rect(3, 0, 26, 32, '#3c3470'); T.rect(3, 0, 2, 32, '#d8b45a'); T.rect(27, 0, 2, 32, '#d8b45a'); T.rect(6, 0, 1, 32, '#5a4ea0'); T.rect(25, 0, 1, 32, '#5a4ea0');
    for (let j = 4; j < 32; j += 16) { T.ligne(16, j, 20, j + 4, '#8a7ad0'); T.ligne(20, j + 4, 16, j + 8, '#8a7ad0'); T.ligne(16, j + 8, 12, j + 4, '#8a7ad0'); T.ligne(12, j + 4, 16, j, '#8a7ad0'); }
  }));

  // ------- Forge-Acier, la Fonderie : dalles de béton noirci cerclées de fer, rigole où coule le métal en fusion
  putImg('floor_fonderie', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#4c4e56');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const x = i % 16, y = j % 16; if (x === 0 || y === 0) T.p(i, j, '#2c2e34'); else if (x === 1 || y === 1) T.p(i, j, '#62656e'); }
    for (const [x, y] of [[3, 3], [13, 3], [3, 13], [13, 13], [19, 19], [29, 19], [19, 29], [29, 29]]) T.p(x, y, '#8a8e98');
    for (let k = 0; k < 30; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), T.rnd() < 0.6 ? '#3e4048' : '#585a62');
    T.disque(22, 8, 4, 2.5, '#3a3a40'); T.disque(8, 24, 3, 2, '#40424a');
  }));
  // rigole de coulée : un canal de fonte creusé dans la dalle, des bras vers le nord, le sud, l'ouest ou l'est (clé : les
  // bras, « ns », « oe », « ne », « no », « o », « e »)
  for (const bras of ['ns', 'oe', 'ne', 'no', 'o', 'e']) putImg('dec_rigole_' + bras, toile(32, 32, (T) => {
    const dans = (i, j, m) => { const a = i >= 11 - m && i <= 20 + m, b = j >= 11 - m && j <= 20 + m; return (a && b) || (bras.includes('n') && a && j < 11) || (bras.includes('s') && a && j > 20) || (bras.includes('o') && b && i < 11) || (bras.includes('e') && b && i > 20); };
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      if (dans(i, j, -2)) T.p(i, j, (i + j) % 7 === 0 ? '#ffe080' : (i * 3 + j * 5) % 11 === 0 ? '#ffb030' : '#e8601a');
      else if (dans(i, j, 0)) T.p(i, j, '#1c1c20');
      else if (dans(i, j, 1)) T.p(i, j, '#787b84');
    }
  }));
  // ------- Métropole, le Casino : moquette bordeaux à losanges d'or ; tables de jeu d'acajou au tapis de feutre vert
  putImg('floor_casino', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#7c1828');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const a = Math.abs((i % 16) - 8) + Math.abs((j % 16) - 8); if (a === 7) T.p(i, j, '#a8303e'); else if (a === 0) T.p(i, j, '#e8c860'); else if (a === 1) T.p(i, j, '#b88a3a'); else if ((i + j) % 16 === 0 && a > 9) T.p(i, j, '#6a1020'); }
    for (let k = 0; k < 18; k++) T.p(Math.floor(T.rnd() * 32), Math.floor(T.rnd() * 32), '#8a2030');
  }));
  putImg('casinofront', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#4a2416'); T.rect(0, 0, 32, 3, '#e8c860'); T.rect(0, 3, 32, 1, '#8a6a2a'); T.rect(0, 27, 32, 5, '#2a120a'); T.rect(0, 27, 32, 1, '#6a3a24');
    for (const x0 of [0, 16]) { T.cadre(x0 + 2, 7, 12, 17, '#2e140c'); T.rect(x0 + 3, 8, 10, 1, '#7a4a30'); T.rect(x0 + 3, 8, 1, 15, '#7a4a30'); T.disque(x0 + 8, 15, 2, 2, '#e8c860'); T.p(x0 + 8, 15, '#fff0a0'); }
  }));
  putImg('countertop_feutre', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#1e7a4a'); T.rect(0, 0, 32, 3, '#5a2e1c'); T.rect(0, 29, 32, 3, '#5a2e1c'); T.rect(0, 3, 32, 1, '#e8c860'); T.rect(0, 28, 32, 1, '#e8c860');
    for (let k = 0; k < 40; k++) T.p(Math.floor(T.rnd() * 32), 4 + Math.floor(T.rnd() * 24), T.rnd() < 0.5 ? '#268a56' : '#186a3e');
    T.ligne(4, 16, 28, 16, '#3aa06a');
  }));
  // ------- Métropole, la Bourse : marbre clair en damier, cabochons bleu nuit ; pupitres de la corbeille
  putImg('floor_bourse', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const d = ((i >> 4) + (j >> 4)) % 2; T.p(i, j, d ? '#e4e8ec' : '#f4f6f8'); if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#c4cad2'); }
    for (const cx of [0, 16]) for (const cy of [0, 16]) for (const dx of [-1, 0]) for (const dy of [-1, 0]) T.p((cx + dx + 32) % 32, (cy + dy + 32) % 32, '#1c2c4c');
    for (let k = 0; k < 10; k++) { const x = Math.floor(T.rnd() * 28), y = Math.floor(T.rnd() * 28); T.ligne(x, y, x + 3, y + 2, '#d2d8de'); }
  }));
  putImg('boursefront', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#22304c'); T.rect(0, 0, 32, 3, '#d8b45a'); T.rect(0, 3, 32, 1, '#101a2c'); T.rect(0, 27, 32, 5, '#141e32'); T.rect(0, 27, 32, 1, '#3a4c70');
    for (const x0 of [0, 16]) { T.cadre(x0 + 2, 7, 12, 17, '#101a2c'); T.rect(x0 + 3, 8, 10, 1, '#3a4c70'); T.rect(x0 + 3, 8, 1, 15, '#3a4c70'); }
    for (let i = 4; i < 28; i += 3) T.p(i, 20 - ((i * 7) % 9), '#3ad07a');
  }));
  // ------- Métropole, la Boutique de mode : parquet clair en point de Hongrie, comptoir blanc et or
  putImg('floor_mode', toile(32, 32, (T) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const b = i >> 3, k = b % 2 ? (j + (i % 8)) % 8 : (j - (i % 8) + 32) % 8; T.p(i, j, i % 8 === 0 ? '#c8a878' : k === 0 ? '#d2b486' : (b + (j >> 3)) % 3 === 0 ? '#ecd6b0' : '#e6cea6'); }
  }));
  putImg('modefront', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#fbf7f4'); T.rect(0, 0, 32, 3, '#d8b45a'); T.rect(0, 3, 32, 1, '#b8a8a0'); T.rect(0, 27, 32, 5, '#e2a8be'); T.rect(0, 27, 32, 1, '#f4d0dc');
    for (const x0 of [0, 16]) { T.cadre(x0 + 2, 7, 12, 17, '#e0d4ce'); T.rect(x0 + 6, 13, 4, 4, '#e2a8be'); T.p(x0 + 7, 14, '#ffffff'); }
  }));
  putImg('dec_tapis_mode', toile(32, 32, (T) => {
    T.rect(4, 0, 24, 32, '#d87a9a'); T.rect(4, 0, 2, 32, '#f4d8e2'); T.rect(26, 0, 2, 32, '#f4d8e2'); T.rect(7, 0, 1, 32, '#b85a7c'); T.rect(24, 0, 1, 32, '#b85a7c');
    for (let j = 6; j < 32; j += 16) { T.disque(16, j, 2.5, 2.5, '#f8c8d8'); T.p(16, j, '#ffffff'); }
  }));

  // ------- lieux de l'histoire : la Centrale de Voltacité, le repaire de la Team Éclipse, le Sanctuaire des Marées
  // câble au sol (de la porte aux générateurs) et bande de sécurité jaune et noire
  putImg('dec_cable_sol', toile(32, 32, (T) => {
    for (const [x, c] of [[11, '#1e2228'], [16, '#2a3038'], [21, '#1e2228']]) { T.rect(x, 0, 3, 32, c); T.rect(x, 0, 1, 32, '#4a525e'); }
    for (let j = 4; j < 32; j += 12) T.rect(9, j, 16, 2, '#f0c838');
  }));
  putImg('dec_bande_danger', toile(32, 32, (T) => { for (let i = -32; i < 32; i += 8) for (let j = 0; j < 6; j++) { T.rect(i + j, 26 + j, 4, 1, '#f0c838'); T.rect(i + j + 4, 26 + j, 4, 1, '#22262c'); } }));
  // sol du repaire : dalles d'obsidienne polie, joints de métal sombre, éclat violet par endroits
  putImg('floor_eclipse', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#221c2e'); grain(T, 20, ['#2a2338', '#1c1726', '#2e2640']);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#3e3654');
    T.p(4, 3, '#6a4aa8'); T.p(5, 3, '#4a3478'); T.p(21, 19, '#6a4aa8'); T.p(22, 19, '#4a3478');
  }, 31));
  // lumière de sortie d'une grotte : flaque de jour, douce et transparente (posée par world3d.js sur 2,5 × 2,25 cases)
  putImg('dec_exitlight', toile(32, 32, (T) => T.disque(16, 18, 15, 13, null, (i, j, q) => '#fff4d0' + Math.round(70 * (1 - q) ** 1.5).toString(16).padStart(2, '0'))));
  // runes gravées autour de l'autel de Lugia : anneau de pierre bleu nuit, signe argenté
  for (let n = 0; n < 4; n++) putImg('dec_rune_' + (n + 1), toile(32, 32, (T) => {
    T.disque(16, 16, 13, 13, null, (i, j, q) => (q > 0.82 ? '#3a4a6a' : q > 0.7 ? '#8aa8d8' : null));
    const L = [[[16, 8, 16, 24], [10, 12, 22, 20]], [[10, 10, 22, 22], [22, 10, 10, 22]], [[16, 8, 9, 22], [16, 8, 23, 22], [12, 18, 20, 18]], [[10, 16, 22, 16], [16, 9, 16, 23], [12, 11, 20, 21]]][n];
    for (const [a, b, c, d] of L) { T.ligne(a, b, c, d, '#c8dcf8'); T.ligne(a + 1, b, c + 1, d, '#6a8ac080'); }
  }, 40 + n));

  // ------- Port-Azur (Eau) : pontons, radeaux, vannes
  // pontons et radeaux : couvrent toute la case (plus de bord d'eau figé à côté de l'eau animée) ; liseré à la couleur
  // de leur bassin, comme les vannes et le panneau : _0 OUEST (bleu), _1 EST (vert)
  const BASSIN = [['#2a6ac8', '#8ac0f8'], ['#2a9a5a', '#8ae0a8']];
  const ponton = (T, b) => {
    T.rect(0, 0, 32, 32, '#6a6a72'); T.rect(1, 1, 30, 30, '#9a9aa4'); T.rect(1, 1, 30, 2, '#c4c4cc'); T.rect(1, 29, 30, 2, '#7a7a84');
    T.ligne(10, 6, 14, 18, '#7e7e88'); T.ligne(20, 12, 24, 25, '#7e7e88');
    if (b != null) { const [c, l] = BASSIN[b]; T.cadre(3, 3, 26, 26, c); for (const [x, y] of [[3, 3], [27, 3], [3, 27], [27, 27]]) { T.rect(x, y, 2, 2, l); } }
  };
  const radeau = (T, b) => {
    for (let k = 0; k < 5; k++) { const x = 1 + k * 6; T.rect(x, 0, 6, 32, '#5a3a1c'); T.rect(x + 1, 0, 4, 32, '#8a5a30'); T.rect(x + 2, 0, 2, 32, '#b07a44'); T.p(x + 2, 3 + k * 5, '#d09a60'); }
    const c = b != null ? BASSIN[b][0] : '#5a3a1c', l = b != null ? BASSIN[b][1] : '#7a5028';
    for (const y of [6, 24]) { T.rect(0, y, 32, 2, c); T.rect(0, y, 32, 1, l); }
  };
  putImg('dec_ponton', toile(32, 32, (T) => ponton(T), 7));
  putImg('dec_radeau', toile(32, 32, (T) => radeau(T), 9));
  for (const b of [0, 1]) { putImg('dec_ponton_' + b, toile(32, 32, (T) => ponton(T, b), 7)); putImg('dec_radeau_' + b, toile(32, 32, (T) => radeau(T, b), 9)); }
  // estrade de Marine (le Barrage) : dalle de pierre bleue, liseré d'écume
  putImg('dec_estrade_water', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#3a6ea8');
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (i % 16 === 0 || j % 16 === 0) T.p(i, j, '#2c5a8c');
    for (let i = 0; i < 32; i++) { const o = Math.round(1.5 + Math.sin(i * 0.8) * 1.5); T.p(i, o, '#e8f6ff'); T.p(i, o + 1, '#a8d8f8'); }
    T.rect(0, 30, 32, 2, '#1e4270'); T.p(6, 9, '#6aa0d8'); T.p(22, 21, '#6aa0d8');
  }));
  // vannes : un bassin (0 ouest, bleu ; 1 est, vert) et un niveau (0 bas, 1 moyen, 2 haut) — clé dec_vanne_<bassin><niveau>
  for (const [b, anneau] of [[0, '#2a6ac8'], [1, '#2a9a5a']]) for (const [g, col] of [[0, '#8ad0f8'], [1, '#3a90e0'], [2, '#1a4aa0']]) putImg(`dec_vanne_${b}${g}`, toile(32, 32, (T) => {
    T.disque(16, 16, 14, 14, '#3a3a44'); T.disque(16, 16, 12.5, 12.5, anneau); T.disque(16, 16, 10.5, 10.5, '#c8c8d0');
    T.disque(16, 16, 8, 8, null, (i, j, q) => (q > 0.75 ? '#8a8a96' : '#d8d8e0'));
    for (let a = 0; a < 4; a++) { const c = Math.cos(a * Math.PI / 2 + 0.4), s2 = Math.sin(a * Math.PI / 2 + 0.4); T.ligne(16, 16, 16 + c * 9, 16 + s2 * 9, '#6a6a76'); }
    T.disque(16, 16, 4, 4, col); T.p(15, 15, '#ffffff');
    for (let k = 0; k <= g; k++) T.rect(9 + k * 5, 27, 4, 3, col);
  }));
  // passerelle de bois : planches en travers du passage, poutres le long ; _v pour un passage nord–sud
  putImg('dec_passerelle_bois', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6a4422'); for (let i = 0; i < 32; i += 6) { T.rect(i, 3, 5, 26, '#a8743e'); T.rect(i, 3, 5, 2, '#c8945a'); T.rect(i, 27, 5, 2, '#7a5028'); }
    T.rect(0, 0, 32, 3, '#3a2410'); T.rect(0, 29, 32, 3, '#3a2410');
  }, 13));
  putImg('dec_passerelle_bois_v', toile(32, 32, (T) => {
    T.rect(0, 0, 32, 32, '#6a4422'); for (let j = 0; j < 32; j += 6) { T.rect(3, j, 26, 5, '#a8743e'); T.rect(3, j, 26, 1, '#c8945a'); T.rect(3, j + 4, 26, 1, '#7a5028'); }
    T.rect(0, 0, 3, 32, '#3a2410'); T.rect(29, 0, 3, 32, '#3a2410');
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
  // parterre validé : la dalle ne répond plus (pétales refermés, cœur vert, liseré de feuilles)
  putImg('dec_dalle_petale_fige', toile(32, 32, (T) => {
    T.disque(16, 16, 13, 13, '#3a6a3a'); T.disque(16, 16, 12, 12, '#d8e8c8');
    for (let a = 0; a < 5; a++) { const c = Math.cos(a * 1.2566 - 1.57), s = Math.sin(a * 1.2566 - 1.57); T.disque(16 + c * 5, 16 + s * 5, 3, 3, null, (i, j, q) => (q > 0.6 ? '#b8a0b0' : '#e0d0d8')); }
    T.disque(16, 16, 3, 3, '#6aa850'); T.p(15, 15, '#c8f0a8');
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

  // ------- Mirage (Psy) : téléporteurs de lune, soleil et étoile (allumés / éteints), points d'arrivée
  const tele = (T, c1, c2, c3, on, offRing = '#3c384a') => {
    T.disque(16, 16, 14, 14, on ? '#2a2238' : offRing); T.disque(16, 16, 12, 12, on ? c1 : '#343040');
    T.disque(16, 16, 8, 8, on ? c2 : '#3f3a4e'); T.disque(16, 16, 4, 4, on ? c3 : '#4a455a');
    if (on) for (let a = 0; a < 8; a++) T.p(16 + Math.cos(a * 0.785) * 10, 16 + Math.sin(a * 0.785) * 10, '#ffffff');
  };
  putImg('dec_tp_lune', toile(32, 32, (T) => { tele(T, '#7a5ad0', '#a88af0', '#e8dcff', true); T.disque(18, 15, 3, 3, '#7a5ad0'); }));
  putImg('dec_tp_lune_off', toile(32, 32, (T) => { tele(T, '', '', '', false, '#6a4aa8'); T.disque(15, 16, 4, 4, '#9a80d0'); T.disque(17, 15, 3, 3, '#3f3a4e'); }));
  putImg('dec_tp_soleil', toile(32, 32, (T) => { tele(T, '#e09a20', '#f6c84a', '#fff4c0', true); }));
  putImg('dec_tp_soleil_off', toile(32, 32, (T) => { tele(T, '', '', '', false, '#a07228'); for (let k = 0; k < 4; k++) { const a = k * 1.57; T.ligne(16, 16, 16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, '#c29240'); } T.disque(16, 16, 3, 3, '#d4a654'); }));
  putImg('dec_tp_etoile', toile(32, 32, (T) => { tele(T, '#2a6ad0', '#5aa0f0', '#d8f0ff', true); for (let k = 0; k < 5; k++) { const a = -1.57 + k * 1.2566; T.ligne(16, 16, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, '#ffffff'); } }));
  putImg('dec_tp_etoile_off', toile(32, 32, (T) => { tele(T, '', '', '', false, '#3864a8'); for (let k = 0; k < 5; k++) { const a = -1.57 + k * 1.2566; T.ligne(16, 16, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, '#729ee0'); } }));
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
function armoire(T, on) {
  T.rect(4, 4, 24, 38, '#3a4250'); T.rect(5, 5, 22, 36, '#9aa4b2'); T.rect(5, 5, 22, 2, '#c8d0dc');
  T.rect(8, 10, 16, 12, '#2a3038');
  if (on) { T.rect(9, 15, 6, 6, '#e8c040'); T.rect(17, 11, 6, 10, '#3a9a5a'); T.rect(18, 12, 4, 2, '#8af0a8'); }
  else { T.rect(9, 11, 6, 10, '#e8c040'); T.rect(17, 11, 6, 10, '#606870'); T.p(11, 13, '#fff4a0'); }
  T.disque(16, 30, 4, 4, on ? '#30d060' : '#e04040'); T.p(15, 29, on ? '#c0ffd0' : '#ffa0a0');
  if (on) T.disque(16, 30, 6, 6, null, (i, j, q) => (q > 0.7 ? '#30d06040' : null));
  for (let j = 25; j < 40; j += 3) T.rect(7, j, 4, 1, '#6a7480');
}
function porteGen(T, n) {
  T.rect(0, 2, 32, 46, '#2a3038'); T.rect(2, 4, 28, 44, '#6a7482'); T.rect(2, 4, 28, 2, '#9aa4b2');
  for (let j = 10; j < 46; j += 8) T.rect(2, j, 28, 2, '#4a525e');
  T.rect(14, 4, 4, 44, '#f0d040'); for (let j = 6; j < 46; j += 6) T.rect(14, j, 4, 3, '#2a2a30');
  // trois voyants au-dessus de la porte : verts (fusible enclenché) ou rouges éteints
  T.rect(4, 0, 24, 6, '#1e2228');
  for (let k = 0; k < 3; k++) { const x = 8 + k * 8; T.disque(x, 3, 2.2, 2.2, k < n ? '#40e070' : '#6a2020'); if (k < n) T.p(x - 1, 2, '#c8ffd8'); }
}
function orbe(T, ph) {
  const [c0, c1, c2] = [['#5a3ab0', '#9a7ae8', '#d8c8ff'], ['#b07a10', '#f0c040', '#fff2b8'], ['#1a5ab0', '#5aa8f0', '#d0ecff']][ph];
  T.rect(9, 32, 14, 10, '#5a4a7a'); T.rect(9, 32, 14, 2, '#8a7ab0'); T.rect(6, 40, 20, 4, '#3a2e52');
  T.disque(16, 18, 15, 15, null, (i, j, q) => (q > 0.75 ? c1 + '30' : null));
  T.disque(16, 18, 13, 13, null, (i, j, q) => (q > 0.85 ? c0 : q > 0.5 ? c1 : c2));
  T.disque(12, 13, 3, 2.5, '#ffffff'); T.p(20, 24, '#ffffff');
}
const SPR = {
  // Voltacité : machine (transformateur), armoire à fusibles, porte du générateur
  machine: [32, 40, (T) => {
    T.rect(2, 10, 28, 28, '#4a525e'); T.rect(3, 11, 26, 26, '#7a8492'); T.rect(3, 11, 26, 2, '#a8b2c0');
    for (let k = 0; k < 4; k++) T.rect(6 + k * 6, 16, 3, 16, '#5a6270');
    T.rect(8, 2, 4, 9, '#c8a040'); T.rect(20, 2, 4, 9, '#c8a040'); T.disque(10, 3, 3, 2, '#f0d060'); T.disque(22, 3, 3, 2, '#f0d060');
    T.rect(12, 34, 8, 2, '#f0d040');
  }],
  armoire_elec: [32, 44, (T) => armoire(T, false)],
  // fusible enclenché : le levier abaissé, le voyant passe au vert
  armoire_elec_on: [32, 44, (T) => armoire(T, true)],
  // porte du générateur : un voyant vert par fusible enclenché (porte_gen_0 à porte_gen_3)
  porte_gen: [32, 48, (T) => porteGen(T, 0)],
  porte_gen_0: [32, 48, (T) => porteGen(T, 0)], porte_gen_1: [32, 48, (T) => porteGen(T, 1)], porte_gen_2: [32, 48, (T) => porteGen(T, 2)], porte_gen_3: [32, 48, (T) => porteGen(T, 3)],
  // Floralia : fleurs sur leur parterre, haie fermée
  fleur_bouton: [32, 34, (T) => { T.ligne(16, 16, 16, 32, '#2e7a32'); T.disque(11, 26, 5, 2.4, '#4aa04a'); T.disque(21, 28, 5, 2.4, '#3a903e'); T.disque(16, 11, 5, 7, null, (i, j, q) => (q > 0.65 ? '#2e7a32' : j < 9 ? '#e8a8c0' : '#5aa850')); }],
  fleur_ouverte: [32, 34, (T) => {
    T.ligne(16, 16, 16, 32, '#2e7a32'); T.disque(11, 26, 5, 2.4, '#4aa04a'); T.disque(21, 28, 5, 2.4, '#3a903e');
    for (let a = 0; a < 6; a++) { const c = Math.cos(a * 1.047), s = Math.sin(a * 1.047); T.disque(16 + c * 7, 11 + s * 7, 5, 5, null, (i, j, q) => (q > 0.7 ? '#d84a7a' : '#ff8ab0')); }
    T.disque(16, 11, 4, 4, '#f6d040'); T.p(15, 10, '#fff8c0'); T.p(14, 9, '#fff8c0');
  }],
  haie: [32, 40, (T) => {
    // contour sombre net, dessus éclairé, touffes de feuilles marquées : la haie se lit bien sur le sol clair de la serre
    T.disque(16, 20, 16, 18, null, (i, j, q) => (q > 0.86 ? '#163a1c' : j < 10 ? '#7ac86a' : j < 14 ? '#5aa850' : (i * 3 + j * 5) % 11 === 0 ? '#2a6030' : (i + j * 2) % 9 === 0 ? '#5aa850' : '#3a8440'));
    for (let k = 0; k < 6; k++) { const x = 6 + (k * 7) % 20, y = 14 + (k * 5) % 16; T.p(x, y, '#76c066'); T.p(x + 1, y - 1, '#76c066'); T.p(x + 1, y + 1, '#235a2a'); }
    for (let k = 0; k < 7; k++) { const x = 5 + (k * 9) % 22, y = 8 + (k * 7) % 22; T.p(x, y, '#ff8ab0'); T.p(x + 1, y, '#ff8ab0'); T.p(x, y + 1, '#ffd0e0'); }
    T.rect(4, 36, 24, 4, '#2a4a2a');
  }],
  // repaire de la Team Éclipse : console, bannière, pilier et le Prisme Noir sur son socle
  console_eclipse: [32, 40, (T) => {
    T.rect(2, 16, 28, 22, '#1a1626'); T.rect(3, 17, 26, 20, '#2e2840'); T.rect(3, 17, 26, 2, '#4a3e66');
    T.rect(5, 2, 22, 15, '#120e1a'); T.rect(6, 3, 20, 13, '#1e0e34');
    for (let i = 6; i < 26; i++) T.p(i, Math.round(9 + Math.sin(i * 0.6) * 3), '#b07af0');
    T.rect(6, 22, 4, 2, '#e04a8a'); T.rect(12, 22, 4, 2, '#b07af0'); T.rect(18, 22, 8, 2, '#6a5a8a');
    for (let i = 6; i < 26; i += 3) T.p(i, 28, '#8a5ad0');
  }],
  banniere_eclipse: [32, 48, (T) => {
    T.rect(4, 2, 24, 3, '#c8a040'); T.rect(6, 5, 20, 36, '#1e1630'); T.rect(6, 5, 2, 36, '#2e2448');
    for (let i = 0; i < 10; i++) { T.p(6 + i, 41 + Math.floor(i / 2), '#1e1630'); T.p(25 - i, 41 + Math.floor(i / 2), '#1e1630'); }
    T.disque(16, 20, 7, 7, '#e8c860'); T.disque(19, 18, 6, 6, '#1e1630');   // l'éclipse : un croissant d'or mangé par l'ombre
    T.rect(9, 32, 14, 1, '#8a5ad0'); T.rect(11, 35, 10, 1, '#8a5ad0');
  }],
  pilier_eclipse: [32, 48, (T) => {
    T.rect(9, 6, 14, 36, '#2a2438'); T.rect(9, 6, 3, 36, '#3e3654'); T.rect(20, 6, 3, 36, '#1a1626');
    T.rect(6, 2, 20, 5, '#3a3050'); T.rect(6, 42, 20, 5, '#3a3050'); T.rect(6, 2, 20, 1, '#6a5a8a');
    for (let j = 12; j < 40; j += 8) T.rect(15, j, 2, 4, '#b07af0');
  }],
  prisme_noir: [32, 48, (T) => {
    T.rect(6, 38, 20, 10, '#2a2438'); T.rect(6, 38, 20, 2, '#6a5a8a'); T.rect(9, 34, 14, 5, '#3a3050');
    T.disque(16, 18, 15, 16, null, (i, j, q) => (q > 0.6 ? '#9a5ae040' : null));
    for (let j = 2; j < 34; j++) { const h = j < 18 ? (j - 2) * 0.5 : (34 - j) * 0.5; for (let i = Math.round(16 - h); i <= Math.round(16 + h); i++) T.p(i, j, i < 16 ? '#2a1a44' : i === 16 ? '#c8a0ff' : '#140c24'); }
    T.ligne(16, 2, 16, 33, '#e0c8ff'); T.p(13, 12, '#ffffff');
  }],
  // Mirage : orbe de cristal sur son socle
  orbe: [32, 44, (T) => orbe(T, 0)],
  // la couleur de la phase du palais : lune (violet), soleil (or), étoile (bleu)
  orbe_0: [32, 44, (T) => orbe(T, 0)], orbe_1: [32, 44, (T) => orbe(T, 1)], orbe_2: [32, 44, (T) => orbe(T, 2)],
  // Port-Granit : roche de la carrière
  roche_gym: [32, 34, (T) => {
    T.disque(16, 20, 15, 13, null, (i, j, q) => (q > 0.82 ? '#4a3e32' : j < 14 && i < 18 ? '#c8b49a' : j > 24 ? '#7a6a56' : '#a8967c'));
    T.ligne(9, 12, 14, 22, '#6a5a48'); T.ligne(20, 14, 24, 26, '#6a5a48'); T.disque(10, 12, 3, 2, '#dccab0');
  }],
  // Cendrelune : vannes de la lave (rouge, noire) ; tournée, le volant a fait un quart de tour, son moyeu rougeoie
  // et la conduite au pied de la vanne s'emplit de lave
  vanne_lave: [32, 40, (T) => vanneLave(T, ['#4a3a34', '#7a6a60', '#2a201c', '#2a2020', '#c84a20', '#e86a30', '#f0a040'], false)],
  vanne_lave_on: [32, 40, (T) => vanneLave(T, ['#4a3a34', '#7a6a60', '#2a201c', '#2a2020', '#c84a20', '#e86a30', '#f0a040'], true)],
  vanne_lave2: [32, 40, (T) => vanneLave(T, ['#2a2a34', '#5a5a6a', '#141418', '#141418', '#4a4a5a', '#8a5ae0', '#b08af0'], false)],
  vanne_lave2_on: [32, 40, (T) => vanneLave(T, ['#2a2a34', '#5a5a6a', '#141418', '#141418', '#4a4a5a', '#8a5ae0', '#b08af0'], true)],
  // Fort-Écaille : statue de dragon ; à chaque rugissement ses yeux et la gemme de son poitrail changent de couleur
  // (statue_pont_1 à _3 : les trois autres orientations du pont), et un halo l'entoure
  statue_pont: [32, 48, (T) => statuePont(T, 0)],
  statue_pont_1: [32, 48, (T) => statuePont(T, 1)], statue_pont_2: [32, 48, (T) => statuePont(T, 2)], statue_pont_3: [32, 48, (T) => statuePont(T, 3)],
  // Cimelune, le Musée des Dragons : vitrine au crâne de dragon
  vitrine_dragon: [32, 44, (T) => {
    T.rect(3, 28, 26, 16, '#d8d4cc'); T.rect(3, 28, 26, 2, '#f4f0e8'); T.rect(3, 42, 26, 2, '#9a968e'); T.rect(11, 33, 10, 4, '#b08a3a'); T.rect(12, 34, 8, 1, '#e8c860');
    T.rect(4, 5, 24, 23, '#c8e8f870'); T.cadre(4, 5, 24, 23, '#b08a3a');
    // le crâne : museau, orbite, cornes, crocs
    T.disque(15, 19, 8, 5, null, (i, j, q) => (q > 0.78 ? '#a89a7c' : j < 18 ? '#f0e6cc' : '#d8caa8'));
    T.disque(22, 21, 4, 3, '#e4d8ba'); T.disque(13, 18, 2, 2, '#4a4032'); T.ligne(9, 15, 5, 9, '#e8dcc0'); T.ligne(13, 14, 11, 8, '#e8dcc0');
    for (const x of [17, 20, 23]) T.rect(x, 23, 1, 3, '#fffbee');
    T.ligne(7, 9, 11, 6, '#ffffff'); T.ligne(7, 13, 14, 6, '#ffffffa0');
  }],
  // Fort-Écaille, la Caserne d'Écaille : râtelier de hallebardes, armure de garde, mannequin d'entraînement, table d'état-major
  ratelier: [32, 46, (T) => {
    T.rect(2, 18, 28, 3, '#6a4a2a'); T.rect(2, 18, 28, 1, '#9a7448'); T.rect(2, 36, 28, 3, '#6a4a2a'); T.rect(2, 36, 28, 1, '#9a7448');
    T.rect(2, 16, 3, 30, '#4a3018'); T.rect(27, 16, 3, 30, '#4a3018');
    for (const [x, k] of [[8, 0], [14, 1], [20, 0], [25, 1]]) {
      T.rect(x, 6, 2, 38, '#8a6a44'); T.rect(x, 6, 1, 38, '#b08c5e');
      if (k) { T.rect(x - 2, 2, 6, 5, '#b8c0cc'); T.rect(x - 3, 3, 2, 3, '#8a929e'); T.p(x, 0, '#e0e6f0'); T.p(x, 1, '#e0e6f0'); }
      else { for (let j = 0; j < 7; j++) T.rect(x - Math.floor((6 - j) / 3), j, 2 + 2 * Math.floor((6 - j) / 3), 1, j < 2 ? '#e0e6f0' : '#b8c0cc'); }
      T.rect(x - 1, 9, 4, 2, '#3c3470');
    }
  }],
  armure: [32, 46, (T) => {
    T.rect(15, 26, 2, 16, '#4a3018'); T.rect(9, 42, 14, 3, '#3a2412'); T.rect(9, 42, 14, 1, '#6a4a2a');
    T.disque(16, 20, 8, 9, null, (i, j, q) => (q > 0.82 ? '#231d3e' : i < 13 ? '#7a6ed0' : '#4a3f96'));
    for (let j = 15; j < 27; j += 4) for (let i = 10; i < 23; i += 4) T.p(i + (j % 8 ? 2 : 0), j, '#2e2660');
    T.rect(6, 13, 5, 5, '#d8b45a'); T.rect(21, 13, 5, 5, '#d8b45a'); T.rect(6, 13, 5, 1, '#f4dc90'); T.rect(21, 13, 5, 1, '#f4dc90');
    T.disque(16, 7, 5, 6, null, (i, j, q) => (q > 0.8 ? '#231d3e' : i < 15 ? '#8a7ee0' : '#5a4eaa')); T.rect(12, 7, 8, 2, '#14101e');
    T.ligne(12, 3, 9, 0, '#d8b45a'); T.ligne(20, 3, 23, 0, '#d8b45a'); T.rect(14, 27, 4, 2, '#d8b45a');
  }],
  mannequin: [32, 44, (T) => {
    T.rect(15, 24, 2, 16, '#6a4a2a'); T.rect(8, 40, 16, 3, '#4a3018'); T.rect(8, 40, 16, 1, '#8a6a44');
    T.rect(4, 15, 24, 3, '#8a6a44'); T.rect(4, 15, 24, 1, '#b08c5e');
    T.disque(16, 20, 7, 8, null, (i, j, q) => (q > 0.8 ? '#7a5a2a' : i < 14 ? '#e8cc8a' : '#c8a862'));
    T.disque(16, 20, 4, 4, '#c03a3a'); T.disque(16, 20, 2.2, 2.2, '#f4f0e0'); T.p(16, 20, '#c03a3a');
    T.disque(16, 8, 5, 5, null, (i, j, q) => (q > 0.78 ? '#7a5a2a' : i < 15 ? '#e8cc8a' : '#c8a862')); T.ligne(12, 11, 20, 11, '#7a5a2a');
    T.ligne(6, 22, 11, 26, '#5a4a3a'); T.ligne(22, 12, 25, 17, '#5a4a3a');
  }],
  table_tactique: [32, 36, (T) => {
    T.rect(3, 30, 3, 6, '#3a2412'); T.rect(26, 30, 3, 6, '#3a2412'); T.rect(1, 12, 30, 19, '#5a3a20'); T.rect(1, 12, 30, 2, '#8a6034'); T.rect(1, 29, 30, 2, '#3a2412');
    // la carte de l'archipel : la mer, trois îles, les pions de la garde
    T.rect(4, 14, 24, 13, '#e8dcb8'); T.cadre(4, 14, 24, 13, '#b09a6a'); T.rect(5, 15, 22, 11, '#9ac4d8');
    T.disque(10, 20, 3, 2.5, '#b8a47a'); T.disque(17, 22, 3, 2, '#a85a3a'); T.disque(23, 18, 2.5, 3, '#6a5cc0');
    for (const [x, y, c] of [[9, 18, '#d8b45a'], [18, 20, '#d8b45a'], [22, 15, '#c03a3a']]) { T.rect(x, y, 2, 3, c); T.p(x, y - 1, '#ffffff'); }
    T.ligne(11, 20, 15, 22, '#3a3a4a'); T.ligne(19, 21, 22, 19, '#3a3a4a');
  }],
  // Métropole, la Salle des Marchés : borne de cote, écran de séance, coffre à indice (les trois sortes de « titres » à
  // consulter dans l'ordre ; leur version validée, _on, est plus bas), porte de parquet fermée
  vitrine: [32, 44, (T) => borneCote(T, false)],
  tableau: [32, 44, (T) => ecranSeance(T, false)],
  socle_musee: [32, 44, (T) => coffreIndice(T, false)],
  porte_galerie: [32, 48, (T) => {
    T.rect(0, 0, 32, 48, '#5a3a20'); T.rect(2, 2, 28, 46, '#8a5a30'); T.rect(4, 4, 11, 42, '#a06a3a'); T.rect(17, 4, 11, 42, '#a06a3a');
    T.cadre(6, 8, 7, 14, '#6a4220'); T.cadre(19, 8, 7, 14, '#6a4220'); T.cadre(6, 28, 7, 14, '#6a4220'); T.cadre(19, 28, 7, 14, '#6a4220');
    T.disque(14, 26, 1.5, 1.5, '#f0c040'); T.disque(18, 26, 1.5, 1.5, '#f0c040');
  }],
  // Port-Lisière : canon à vent (un par sens), manivelle
  canon_up: [32, 40, (T) => canon(T, 'up')], canon_right: [32, 40, (T) => canon(T, 'right')], canon_down: [32, 40, (T) => canon(T, 'down')], canon_left: [32, 40, (T) => canon(T, 'left')],
  manivelle: [32, 36, (T) => manivelle(T, 0)],
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
  // états des mécanismes du Sud : titre validé (borne, écran, coffre), levier abaissé, manivelle tournée d'un, deux ou trois quarts
  vitrine_on: [32, 44, (T) => borneCote(T, true)], tableau_on: [32, 44, (T) => ecranSeance(T, true)], socle_musee_on: [32, 44, (T) => coffreIndice(T, true)],
  levier_rouge_on: [32, 40, (T) => levier(T, '#c83a3a', '#ff8080', true)], levier_bleu_on: [32, 40, (T) => levier(T, '#2a5ac8', '#8ab0ff', true)],
  manivelle_1: [32, 36, (T) => manivelle(T, 1)], manivelle_2: [32, 36, (T) => manivelle(T, 2)], manivelle_3: [32, 36, (T) => manivelle(T, 3)],
  // Forge-Acier, la Fonderie : four de briques à la gueule ardente, creuset sur son trépied, enclume, établi, lingots
  four_fonderie: [32, 48, (T) => {
    T.rect(1, 12, 30, 34, '#6e3628'); T.rect(1, 12, 30, 2, '#9a5440'); T.rect(1, 44, 30, 4, '#2a2a30'); T.rect(1, 44, 30, 1, '#5a5c66');
    for (let j = 14; j < 44; j += 5) { T.rect(1, j, 30, 1, '#4a2018'); for (let i = (j % 10 ? 4 : 9); i < 31; i += 10) T.rect(i, j + 1, 1, 4, '#4a2018'); }
    T.rect(7, 0, 18, 10, '#32343c'); T.rect(7, 0, 2, 10, '#565a66'); T.rect(4, 9, 24, 4, '#24262c'); T.rect(4, 9, 24, 1, '#6a6e7a'); for (const x of [6, 12, 19, 25]) T.p(x, 11, '#8a8e98');
    // la gueule : arc de fer, cœur blanc, flammes
    T.disque(16, 30, 10, 11, '#24262c'); T.rect(6, 30, 20, 12, '#24262c');
    T.disque(16, 31, 8, 9, null, (i, j, q) => (q > 0.75 ? '#c83a10' : q > 0.4 ? '#ff7a1a' : q > 0.15 ? '#ffc040' : '#fff4c0')); T.rect(8, 31, 16, 10, '#e8601a');
    for (let i = 8; i < 24; i++) { const h = 3 + ((i * 7) % 5); T.rect(i, 41 - h, 1, h, i % 3 ? '#ffb030' : '#ffe890'); }
    T.rect(6, 41, 20, 2, '#3a3c44'); for (const x of [9, 13, 17, 21]) T.rect(x, 33, 1, 8, '#24262c');
  }],
  creuset: [32, 46, (T) => {
    T.ligne(6, 44, 12, 22, '#3a3c44'); T.ligne(26, 44, 20, 22, '#3a3c44'); T.ligne(16, 44, 16, 30, '#2a2c32'); T.rect(4, 43, 5, 2, '#24262c'); T.rect(23, 43, 5, 2, '#24262c');
    for (let j = 12; j < 30; j++) { const w = 9 - Math.floor((j - 12) / 4.5); T.rect(16 - w, j, 2 * w, 1, j < 14 ? '#7a7e8a' : '#454852'); T.p(16 - w, j, '#8a8e98'); T.p(15 + w, j, '#24262c'); }
    T.disque(16, 12, 8, 2.5, null, (i, j, q) => (q > 0.7 ? '#e8601a' : q > 0.3 ? '#ffb030' : '#fff0a0')); T.rect(5, 17, 22, 2, '#2a2c32'); T.rect(3, 16, 3, 4, '#5a5c66'); T.rect(26, 16, 3, 4, '#5a5c66');
    T.p(22, 14, '#ffb030'); T.p(23, 15, '#ff7a1a'); for (const [x, y] of [[10, 6], [19, 4], [14, 2], [22, 8]]) T.p(x, y, '#ffd06080');
  }],
  enclume: [32, 34, (T) => {
    T.rect(10, 20, 12, 12, '#6a4a2a'); T.rect(10, 20, 3, 12, '#8a6440'); T.rect(19, 20, 3, 12, '#4a3018'); T.rect(10, 20, 12, 1, '#a07c52'); T.rect(9, 31, 14, 2, '#3a2412');
    T.rect(6, 8, 20, 5, '#5c6068'); T.rect(6, 8, 20, 1, '#a8aeb8'); T.rect(6, 12, 20, 1, '#33363c'); T.rect(11, 13, 10, 4, '#484b53'); T.rect(8, 17, 16, 3, '#5c6068'); T.rect(8, 17, 16, 1, '#8a8e98');
    T.ligne(6, 9, 1, 10, '#8a8e98'); T.ligne(6, 10, 2, 11, '#5c6068'); T.ligne(6, 11, 3, 11, '#484b53');
    // le marteau posé dessus, un fer rougi
    T.rect(17, 3, 7, 4, '#3a3c44'); T.rect(17, 3, 7, 1, '#7a7e8a'); T.ligne(20, 7, 27, 16, '#8a6440'); T.rect(8, 6, 7, 2, '#ff8a20'); T.rect(8, 6, 3, 1, '#ffe080');
  }],
  etabli: [32, 40, (T) => {
    T.rect(2, 34, 3, 6, '#3a2412'); T.rect(27, 34, 3, 6, '#3a2412'); T.rect(3, 22, 2, 12, '#5a3a20'); T.rect(27, 22, 2, 12, '#5a3a20'); T.rect(3, 30, 26, 2, '#4a3018');
    T.rect(0, 16, 32, 6, '#7a5230'); T.rect(0, 16, 32, 2, '#a87a4c'); T.rect(0, 21, 32, 1, '#4a3018');
    // panneau d'outils : tenailles, marteau, limes
    T.rect(1, 0, 30, 14, '#4a3a30'); T.cadre(1, 0, 30, 14, '#2e221a');
    T.ligne(5, 3, 8, 11, '#a8aeb8'); T.ligne(9, 3, 6, 11, '#a8aeb8'); T.rect(13, 3, 5, 3, '#5c6068'); T.rect(15, 6, 1, 6, '#8a6440'); for (const x of [21, 24, 27]) { T.rect(x, 3, 1, 7, '#c8ccd4'); T.rect(x, 10, 1, 2, '#8a3a2a'); }
    // étau, pièce en cours
    T.rect(4, 11, 6, 5, '#3a4a6a'); T.rect(4, 11, 6, 1, '#6a80a8'); T.rect(18, 13, 9, 3, '#a8aeb8'); T.rect(18, 13, 9, 1, '#e0e6f0');
    T.rect(8, 24, 8, 6, '#3a3c44'); T.rect(18, 25, 7, 5, '#6a4a2a');
  }],
  lingots: [32, 28, (T) => {
    const L = (x, y, c, h, o) => { T.rect(x, y, 9, 5, c); T.rect(x + 1, y, 7, 1, h); T.rect(x, y + 4, 9, 1, o); T.p(x, y, o); T.p(x + 8, y, o); };
    for (const x of [2, 12, 22]) L(x, 22, '#8a909c', '#d0d6e0', '#4a4e58');
    L(7, 16, '#8a909c', '#d0d6e0', '#4a4e58'); L(17, 16, '#e8701a', '#ffd070', '#a83a0a'); L(12, 10, '#8a909c', '#d0d6e0', '#4a4e58');
  }],
  bac_trempe: [32, 32, (T) => {
    T.rect(3, 12, 26, 18, '#4a4e58'); T.rect(3, 12, 26, 2, '#8a909c'); T.rect(3, 12, 2, 18, '#6a707c'); T.rect(27, 12, 2, 18, '#2c2e34'); T.rect(2, 29, 28, 3, '#24262c');
    for (const x of [8, 16, 24]) T.rect(x, 15, 1, 13, '#383b43'); for (const [x, y] of [[5, 17], [26, 17], [5, 26], [26, 26]]) T.p(x, y, '#a8aeb8');
    T.disque(16, 12, 12, 3, null, (i, j, q) => (q > 0.75 ? '#2a5a7a' : i < 14 ? '#6ab0d8' : '#4a8ab8')); T.ligne(9, 11, 14, 11, '#c8e8f8');
    // la vapeur de la trempe, une barre de fer rougi qui dépasse
    for (const [x, y] of [[11, 7], [12, 5], [10, 3], [18, 6], [19, 4], [17, 2], [15, 8]]) T.p(x, y, '#e8f0f8a0');
    T.ligne(21, 12, 27, 4, '#8a8e98'); T.ligne(21, 11, 23, 9, '#ff8a20');
  }],
  // Métropole, le Casino : ce qui se pose sur les tables (roue, cartes, jetons)
  pose_roulette: [32, 22, (T) => {
    T.disque(16, 12, 13, 8, '#5a2e1c'); T.disque(16, 11, 12, 7, null, (i, j, q) => (q > 0.82 ? '#e8c860' : q < 0.12 ? '#e8c860' : (Math.floor((Math.atan2((j - 11) * 1.7, i - 16) + Math.PI) / 0.5236) % 2 ? '#c8283a' : '#1c1c24')));
    T.disque(16, 11, 2, 1.4, '#fff0a0'); T.p(22, 8, '#ffffff'); T.ligne(16, 11, 16, 5, '#e8c860');
  }],
  pose_cartes: [32, 20, (T) => {
    for (const [x, y, r] of [[5, 6, 0], [10, 4, 1], [15, 5, 0]]) { T.rect(x, y, 8, 11, '#fafaf4'); T.cadre(x, y, 8, 11, '#b8b4aa'); T.rect(x + 3, y + 4, 2, 3, r ? '#c8283a' : '#1c1c24'); T.p(x + 1, y + 1, r ? '#c8283a' : '#1c1c24'); }
    for (const [x, c] of [[24, '#c8283a'], [27, '#2a5ac8']]) { for (let k = 0; k < 4; k++) { T.rect(x - 2, 14 - k * 2, 5, 2, c); T.rect(x - 2, 14 - k * 2, 5, 1, '#ffffff90'); } }
  }],
  pose_jetons: [32, 20, (T) => {
    for (const [x, n, c] of [[5, 5, '#c8283a'], [11, 3, '#2a5ac8'], [17, 6, '#1e7a4a'], [23, 4, '#e8c860'], [28, 2, '#1c1c24']]) for (let k = 0; k < n; k++) { T.rect(x - 2, 16 - k * 2, 5, 2, c); T.rect(x - 2, 16 - k * 2, 5, 1, '#ffffffa0'); T.p(x, 17 - k * 2, '#ffffff'); }
  }],
  // Métropole, la Boutique de mode : portant chargé de robes, mannequin de couture, cabine d'essayage
  portant: [32, 44, (T) => {
    T.rect(3, 4, 2, 38, '#c8ccd4'); T.rect(27, 4, 2, 38, '#c8ccd4'); T.rect(3, 4, 26, 2, '#e8ecf2'); T.rect(1, 41, 6, 2, '#8a8e98'); T.rect(25, 41, 6, 2, '#8a8e98');
    [['#e2587a', '#f4a0b8'], ['#4a8ad0', '#9ac0f0'], ['#f0c040', '#fbe69a'], ['#6ab86a', '#b0e0a8'], ['#8a5ad0', '#c8a8f0']].forEach(([c, h], k) => {
      const x = 6 + k * 4; T.p(x + 1, 6, '#6a707c'); T.ligne(x - 1, 8, x + 1, 7, '#6a707c'); T.ligne(x + 3, 8, x + 1, 7, '#6a707c');
      T.rect(x - 1, 9, 5, 20 + (k % 2) * 5, c); T.rect(x - 1, 9, 1, 20 + (k % 2) * 5, h); T.rect(x - 1, 9, 5, 1, h);
    });
  }],
  mannequin_mode: [32, 46, (T) => {
    T.rect(15, 30, 2, 12, '#b8a8a0'); T.disque(16, 43, 6, 2, '#8a7a72'); T.disque(16, 42, 6, 1.5, '#b8a8a0');
    T.disque(16, 6, 3, 3.5, '#f0e2d2'); T.rect(15, 9, 2, 2, '#e4d2c0');
    for (let j = 11; j < 34; j++) { const w = j < 17 ? 5 : j < 20 ? 3 : 3 + Math.floor((j - 19) * 0.55); T.rect(16 - w, j, 2 * w, 1, j < 20 ? '#e2587a' : (j % 4 === 0 ? '#b83a5e' : '#d04a70')); T.p(16 - w, j, '#f4a0b8'); }
    T.rect(12, 19, 8, 1, '#e8c860'); T.p(16, 13, '#ffffff'); T.rect(11, 11, 2, 1, '#f4a0b8'); T.rect(19, 11, 2, 1, '#b83a5e');
  }],
  cabine: [32, 48, (T) => {
    T.rect(2, 2, 28, 46, '#f4ece8'); T.rect(2, 2, 28, 3, '#d8b45a'); T.rect(2, 2, 2, 46, '#d8ccc8'); T.rect(28, 2, 2, 46, '#d8ccc8'); T.rect(4, 6, 24, 1, '#c8ccd4');
    for (let i = 5; i < 27; i++) { const pli = (i - 5) % 5; T.rect(i, 8, 1, 36 - (pli === 2 ? 1 : 0), pli === 0 ? '#c05078' : pli === 2 ? '#f090b0' : '#e06890'); }
    for (let i = 6; i < 27; i += 5) T.p(i, 7, '#e8c860'); T.rect(5, 44, 22, 1, '#b83a5e');
  }],
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
/** levier d'inverseur : manche relevé à droite, ou abaissé à gauche (bas : les tapis de sa couleur tournent dans l'autre sens) */
function levier(T, c1, c2, bas = false) {
  T.rect(7, 26, 18, 12, '#3a3e48'); T.rect(7, 26, 18, 2, '#6a707c'); T.rect(5, 37, 22, 3, '#2a2e36');
  const mx = bas ? 8 : 23, my = bas ? 12 : 6;
  T.rect(12, 22, 8, 5, '#5a5e68'); T.ligne(16, 24, mx, my, '#9aa0aa'); T.ligne(bas ? 15 : 17, 24, bas ? mx - 1 : mx + 1, my, '#6a707a');
  T.disque(mx, my, 4, 4, c1); T.p(mx - 1, my - 1, c2); T.rect(9, 30, 14, 4, bas ? c2 : c1); T.rect(9, 30, 14, 1, bas ? '#ffffff' : c2);
  // sens indiqué sur le pupitre : chevrons vers la droite, ou vers la gauche une fois le levier abaissé
  for (const x of [12, 17]) { T.p(x + (bas ? 1 : 0), 31, '#1e2228'); T.p(x + (bas ? 0 : 1), 32, '#1e2228'); T.p(x + (bas ? 1 : 0), 33, '#1e2228'); }
}
/** manivelle d'un canon à vent : la poignée a tourné de q quarts de tour */
function manivelle(T, q) {
  T.rect(12, 14, 8, 20, '#6a6a76'); T.rect(12, 14, 2, 20, '#9a9aa6'); T.rect(8, 32, 16, 4, '#3a3a44');
  T.disque(16, 12, 9, 9, '#3a3a44'); T.disque(16, 12, 7, 7, '#c8c8d0'); T.disque(16, 12, 3, 3, '#3a3a44');
  const [px, py] = [[25, 6], [23, 20], [7, 18], [9, 4]][q % 4];
  T.ligne(16, 12, px, py, '#7a4a2a'); T.ligne(16, 13, px, py + 1, '#5a3418'); T.disque(px, py, 2.5, 2.5, '#c03a3a'); T.p(px - 1, py - 1, '#ff9090');
  // repère du quart de tour sur le cadran
  const [rx, ry] = [[16, 4], [24, 12], [16, 20], [8, 12]][q % 4]; T.rect(rx - 1, ry - 1, 2, 2, '#f0c040');
}
/** coche verte d'un titre validé (Salle des Marchés) */
const coche = (T, x, y) => { T.ligne(x, y + 5, x + 4, y + 9, '#7af0a8'); T.ligne(x + 4, y + 9, x + 12, y, '#7af0a8'); T.ligne(x, y + 6, x + 4, y + 10, '#3ad07a'); T.ligne(x + 4, y + 10, x + 12, y + 1, '#3ad07a'); };
/** borne de cote : pied d'acajou, plinthe de laiton, écran aux bougies vertes et rouges */
function borneCote(T, on) {
  T.rect(10, 26, 12, 16, '#5a3020'); T.rect(10, 26, 3, 16, '#7a4630'); T.rect(19, 26, 3, 16, '#3c1e14'); T.rect(7, 40, 18, 4, '#2a140c'); T.rect(7, 40, 18, 1, '#d8b45a');
  T.rect(4, 3, 24, 24, '#2a1c16'); T.cadre(4, 3, 24, 24, on ? '#3ad07a' : '#d8b45a'); T.rect(6, 5, 20, 20, on ? '#0c2a1c' : '#0c1a18');
  if (on) coche(T, 10, 10);
  else {
    for (const [x, y, h, v] of [[8, 16, 5, 1], [11, 14, 6, 0], [14, 12, 6, 1], [17, 13, 4, 0], [20, 9, 7, 1]]) { T.rect(x, y, 2, h, v ? '#3ad07a' : '#e0504a'); T.p(x, y - 1, v ? '#3ad07a' : '#e0504a'); }
    T.rect(7, 22, 18, 1, '#1c3430'); T.rect(8, 7, 6, 1, '#f0d860');
  }
  T.ligne(7, 6, 10, 6, '#ffffff60');
}
/** écran de séance : un moniteur sur pied, la courbe du jour et son horloge */
function ecranSeance(T, on) {
  T.rect(15, 28, 2, 12, '#3a3e48'); T.rect(14, 28, 1, 12, '#6a707c'); T.rect(9, 40, 14, 3, '#23262c'); T.rect(9, 40, 14, 1, '#6a707c');
  T.rect(2, 3, 28, 25, '#23262c'); T.cadre(2, 3, 28, 25, on ? '#3ad07a' : '#6a707c'); T.rect(4, 5, 24, 21, on ? '#0c2a1c' : '#101c2c');
  if (on) coche(T, 10, 10);
  else {
    for (let i = 5; i < 27; i++) T.p(i, Math.round(19 - Math.sin(i * 0.6) * 3 - (i - 5) * 0.25), '#5ac8f0');
    T.disque(22, 10, 3, 3, '#f0d860'); T.ligne(22, 10, 22, 8, '#101c2c'); T.ligne(22, 10, 24, 10, '#101c2c'); T.rect(5, 23, 22, 1, '#1c3048'); T.rect(6, 7, 8, 1, '#8aa0c0'); T.rect(6, 9, 5, 1, '#5a708e');
  }
}
/** coffre à indice : un coffre-fort à cadran, sa plaque au chiffre romain */
function coffreIndice(T, on) {
  T.rect(5, 16, 22, 24, '#4a5260'); T.rect(5, 16, 22, 2, '#8a94a4'); T.rect(5, 16, 2, 24, '#6a7484'); T.rect(25, 16, 2, 24, '#2e343e'); T.rect(4, 40, 24, 4, '#23262c'); T.rect(4, 40, 24, 1, '#5a6270');
  T.cadre(8, 19, 16, 19, on ? '#3ad07a' : '#2e343e');
  T.disque(16, 28, 5, 5, null, (i, j, q) => (on ? (q > 0.7 ? '#1e8a4c' : i < 15 ? '#7af0a8' : '#3ad07a') : (q > 0.7 ? '#a07a20' : i < 15 ? '#f6d860' : '#d0a830')));
  T.disque(16, 28, 1.5, 1.5, on ? '#0c2a1c' : '#5a4010'); T.ligne(16, 28, on ? 16 : 19, on ? 24 : 25, on ? '#0c2a1c' : '#5a4010'); T.rect(22, 26, 2, 5, '#c8ccd4');
  T.rect(10, 7, 12, 7, '#d8b45a'); T.rect(10, 7, 12, 1, '#f4dc90'); T.rect(10, 13, 12, 1, '#8a6a2a'); for (const x of [12, 15, 16, 19]) T.rect(x, 9, 1, 3, '#5a4010');
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
/** vanne de lave : [pied, reflet, socle, jante, volant, rayons, moyeu] ; ouverte = volant tourné, moyeu et conduite incandescents */
function vanneLave(T, [pied, reflet, socle, jante, volant, rayons, moyeu], ouverte) {
  if (ouverte) T.disque(16, 14, 15, 14, null, (i, j, q) => (q > 0.72 ? '#ff8a2030' : null));
  T.rect(13, 18, 6, 20, pied); T.rect(14, 18, 2, 20, reflet); T.rect(8, 36, 16, 4, socle);
  if (ouverte) { T.rect(9, 37, 14, 2, '#ff7a20'); T.rect(11, 37, 6, 1, '#ffe070'); T.rect(15, 22, 2, 14, '#ff9a30'); }
  T.disque(16, 14, 12, 12, jante); T.disque(16, 14, 10, 10, ouverte ? '#f0a040' : volant); T.disque(16, 14, 7, 7, jante);
  const a0 = ouverte ? 1.185 : 0.4;
  for (let a = 0; a < 4; a++) T.ligne(16, 14, 16 + Math.cos(a * 1.57 + a0) * 9, 14 + Math.sin(a * 1.57 + a0) * 9, ouverte ? '#ffe070' : rayons);
  T.disque(16, 14, 2.5, 2.5, ouverte ? '#ffffff' : moyeu);
}
/** statue de dragon de la Tour de Drakos ; n = orientation du pont qu'elle commande (0 : au repos, yeux rouges) */
function statuePont(T, n) {
  const lueur = ['#e05050', '#ffd040', '#50e0c0', '#c080ff'][n];
  if (n) T.disque(16, 14, 15, 14, null, (i, j, q) => (q > 0.6 ? lueur + '38' : lueur + '20'));
  T.rect(4, 38, 24, 10, '#4a4258'); T.rect(4, 38, 24, 2, '#7a7290');
  T.disque(16, 26, 10, 12, null, (i, j, q) => (q > 0.8 ? '#3a3448' : i < 14 ? '#9a90b8' : '#6e6688'));
  T.disque(16, 11, 8, 7, null, (i, j, q) => (q > 0.8 ? '#3a3448' : i < 14 ? '#aaa0c8' : '#7a7298'));
  T.ligne(10, 6, 6, 0, '#7a7298'); T.ligne(22, 6, 26, 0, '#7a7298'); T.rect(12, 9, 3, 2, lueur); T.rect(18, 9, 3, 2, lueur);
  T.ligne(6, 22, 1, 14, '#7a7298'); T.ligne(26, 22, 31, 14, '#7a7298');
  if (n) {
    // gueule ouverte sur une lueur, gemme allumée au poitrail, runes sur le socle (une par quart de tour)
    T.rect(13, 14, 6, 2, lueur); T.p(15, 16, '#ffffff'); T.p(16, 16, '#ffffff'); T.p(12, 9, '#ffffff'); T.p(18, 9, '#ffffff');
    T.disque(16, 27, 3, 3, lueur); T.p(15, 26, '#ffffff');
    for (let k = 0; k < n; k++) T.rect(9 + k * 6, 42, 3, 3, lueur);
  } else T.disque(16, 27, 2, 2, '#3a3448');
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
