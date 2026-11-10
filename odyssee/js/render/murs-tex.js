// odyssee/js/render/murs-tex.js — murs des intérieurs façon HeartGold / SoulSilver, à 32 px par case.
// Le mur du fond est coupé en deux : le haut (papier peint, corniche) et le bas (lambris, cimaise, plinthe) ; les murs
// latéraux et le mur du bas sont de vrais volumes coiffés d'un chaperon (le dessus du mur, bordé d'une arête claire
// côté pièce). Fenêtres posées sur le haut du mur du fond, ombre portée des murs sur le sol.
// Tuiles (atlas du décor) : murh_<style>, murb_<style>, cap_<style>, fen_<style>, plus ombre_n / ombre_o / ombre_e.
// Styles : in0…in3 (maisons, papier peint tiré de l'identifiant de la carte), center, mart, lab, gym, league, cendre.

const rgba = (h) => { const n = parseInt(h.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255]; };
function toile(draw, graine = 7) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), im = x.createImageData(32, 32), d = im.data;
  const p = (i, j, col) => {
    i = Math.round(i); j = Math.round(j); if (i < 0 || j < 0 || i > 31 || j > 31 || !col) return;
    const [r, g, b, a] = rgba(col), k = (j * 32 + i) * 4;
    if (a >= 255 || !d[k + 3]) { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a; return; }
    const t = a / 255; d[k] = d[k] * (1 - t) + r * t; d[k + 1] = d[k + 1] * (1 - t) + g * t; d[k + 2] = d[k + 2] * (1 - t) + b * t; d[k + 3] = Math.max(d[k + 3], a);
  };
  const rect = (x0, y0, w, h, col) => { for (let j = y0; j < y0 + h; j++) for (let i = x0; i < x0 + w; i++) p(i, j, col); };
  let s = graine; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  draw({ p, rect, rnd });
  x.putImageData(im, 0, 0);
  return c;
}

// palette de chaque style : papier peint (fond, motif), lambris (fond, clair, sombre), cimaise, plinthe, chaperon
const STYLES = {
  in0: { fond: '#f4ead2', motif: '#e6d6b2', motifK: 'rayures', lam: '#b88452', lamC: '#d4a06a', lamS: '#8a5c34', cim: '#6e4626', pl: '#4a2e18', cap: '#46301e', capC: '#8a603e' },
  in1: { fond: '#e4eef0', motif: '#c8dce2', motifK: 'losanges', lam: '#8aa0a8', lamC: '#aec2c8', lamS: '#62787e', cim: '#4a5c62', pl: '#33424a', cap: '#3e4e58', capC: '#7a909a' },
  in2: { fond: '#f6e4e0', motif: '#ecc8c2', motifK: 'fleurs', lam: '#a86a5a', lamC: '#c88a78', lamS: '#7e4a3c', cim: '#5e3428', pl: '#42241a', cap: '#583428', capC: '#9a6656' },
  in3: { fond: '#eef0dc', motif: '#d8dcb8', motifK: 'pois', lam: '#8a9a5a', lamC: '#a8b878', lamS: '#667440', cim: '#4c5830', pl: '#343c20', cap: '#4a5230', capC: '#86945a' },
  center: { fond: '#fbf6ee', motif: '#f2e6d8', motifK: 'uni', bande: '#f08890', bandeS: '#d05860', lam: '#e86a78', lamC: '#f8a0a8', lamS: '#b84858', cim: '#ffffff', pl: '#8a2a38', cap: '#7a2a3a', capC: '#d87888' },
  mart: { fond: '#f6f9fc', motif: '#e6eef6', motifK: 'uni', bande: '#7aa8e0', bandeS: '#4a78b8', lam: '#5a8ad0', lamC: '#8ab4ec', lamS: '#3a5a98', cim: '#ffffff', pl: '#22386a', cap: '#22386a', capC: '#6a94d0' },
  lab: { fond: '#f2f4f6', motif: '#e2e6ea', motifK: 'carreaux', lam: '#b8c0c8', lamC: '#d8dee4', lamS: '#8a929a', cim: '#6a7480', pl: '#4a525c', cap: '#5a6470', capC: '#a8b0bc' },
  gym: { fond: '#c8ccd8', motif: '#b4b8c6', motifK: 'pierres', lam: '#8a8ea0', lamC: '#a8acbe', lamS: '#6a6e80', cim: '#e0e4f0', pl: '#4a4e60', cap: '#4a4e60', capC: '#9a9eb0' },
  league: { fond: '#6c5c9c', motif: '#7c6cac', motifK: 'losanges', lam: '#4c3c7c', lamC: '#6c5c9c', lamS: '#342860', cim: '#e8c860', pl: '#241a44', cap: '#3a2c66', capC: '#a090d8' },
  cendre: { fond: '#5a4a44', motif: '#4a3c36', motifK: 'pierres', lam: '#3e322c', lamC: '#5a4a42', lamS: '#2a201c', cim: '#8a6a50', pl: '#1e1612', cap: '#2e2420', capC: '#6a5444' },
};
/** style des murs d'une carte d'intérieur (null : on garde l'ancien rendu) */
export function styleMur(m) {
  const w = m.wallStyle || 'wall_in';
  if (w === 'wall_in') { let h = 0; for (const ch of String(m.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'in' + (h % 4); }
  if (w === 'wall_mart') return m.floor === 'lab' ? 'lab' : 'mart';
  const k = w.replace('wall_', '');
  return STYLES[k] ? k : null;
}

function motif(T, S, y0, y1) {
  for (let j = y0; j < y1; j++) for (let i = 0; i < 32; i++) {
    let on = false;
    if (S.motifK === 'rayures') on = i % 8 === 0 || i % 8 === 1;
    else if (S.motifK === 'losanges') on = (Math.abs((i % 16) - 8) + Math.abs((j % 16) - 8)) === 6;
    else if (S.motifK === 'pois') on = (i % 8 === 3 && j % 8 === 3) || (i % 8 === 7 && j % 8 === 7);
    else if (S.motifK === 'carreaux') on = i % 16 === 0 || j % 16 === 0;
    else if (S.motifK === 'pierres') on = j % 8 === 0 || (i + (Math.floor(j / 8) % 2 ? 8 : 0)) % 16 === 0;
    else if (S.motifK === 'fleurs') { const a = i % 16, b = (j + (Math.floor(i / 16) % 2 ? 8 : 0)) % 16; on = (Math.abs(a - 8) + Math.abs(b - 8) <= 1) || ((a === 8) && (b === 6 || b === 10)) || ((b === 8) && (a === 6 || a === 10)); }
    T.p(i, j, on ? S.motif : S.fond);
  }
}

export function texturesMurs(putImg) {
  for (const [k, S] of Object.entries(STYLES)) {
    // haut du mur : corniche en haut, papier peint (ou bande de couleur dans les Centres et les Boutiques)
    putImg('murh_' + k, toile((T) => {
      motif(T, S, 0, 32);
      T.rect(0, 0, 32, 3, S.cap); T.rect(0, 3, 32, 1, S.capC); T.rect(0, 4, 32, 1, '#00000030');
      if (S.bande) { T.rect(0, 22, 32, 10, S.bande); T.rect(0, 22, 32, 1, S.bandeS); T.rect(0, 26, 32, 1, '#ffffff50'); }
    }));
    // bas du mur : lambris en panneaux, cimaise en haut, plinthe sombre en bas
    putImg('murb_' + k, toile((T) => {
      T.rect(0, 0, 32, 32, S.lam);
      for (const x0 of [0, 16]) { T.rect(x0 + 2, 5, 12, 21, S.lamS); T.rect(x0 + 3, 6, 10, 19, S.lam); T.rect(x0 + 3, 6, 10, 1, S.lamC); T.rect(x0 + 3, 6, 1, 19, S.lamC); }
      T.rect(0, 0, 32, 3, S.cim); T.rect(0, 3, 32, 1, S.lamS);
      T.rect(0, 27, 32, 5, S.pl); T.rect(0, 27, 32, 1, S.lamC);
    }));
    // dessus des murs : chaperon sombre bordé d'arêtes claires ; _h pour une rangée (mur du fond, muret), _v pour une colonne
    const chaperon = (T, h) => {
      T.rect(0, 0, 32, 32, S.cap);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if ((i * 7 + j * 13) % 23 === 0) T.p(i, j, S.capC + '40');
      if (h) { T.rect(0, 29, 32, 3, S.capC); T.rect(0, 0, 32, 1, '#00000040'); }
      else { T.rect(0, 0, 3, 32, S.capC); T.rect(29, 0, 3, 32, S.capC); T.rect(3, 0, 1, 32, '#00000030'); T.rect(28, 0, 1, 32, '#00000030'); }
    };
    putImg('cap_' + k, toile((T) => chaperon(T, true)));
    putImg('capv_' + k, toile((T) => chaperon(T, false)));
    // fenêtre (posée sur le haut du mur du fond), avec rideaux pour les maisons
    putImg('fen_' + k, toile((T) => {
      T.rect(5, 6, 22, 20, S.cap); T.rect(7, 8, 18, 16, '#a8d8f8'); T.rect(7, 8, 18, 6, '#c8e8ff');
      T.rect(15, 8, 2, 16, S.cap); T.rect(7, 15, 18, 2, S.cap);
      T.rect(9, 9, 3, 1, '#ffffff'); T.rect(19, 18, 3, 1, '#ffffff');
      T.rect(4, 25, 24, 2, S.capC);
      if (k.startsWith('in')) { T.rect(3, 5, 5, 20, S.motif); T.rect(24, 5, 5, 20, S.motif); T.rect(3, 5, 26, 2, S.lamS); T.rect(3, 5, 5, 20, S.lamC + '90'); T.rect(24, 5, 5, 20, S.lamC + '90'); }
    }));
  }
  // tapis des maisons (posé sous la table, 3 × 2 cases) : une bordure, un motif au centre
  for (const [k, c1, c2, c3] of [['in0', '#b84838', '#e8c060', '#8a2a20'], ['in1', '#3a6aa8', '#e8e0c8', '#24467a'], ['in2', '#7a5a9a', '#f0d8a0', '#523a70'], ['in3', '#4a8a5a', '#f0e0b0', '#2e5a3a']]) putImg('tapis_' + k, toile((T) => {
    T.rect(0, 0, 32, 32, c3); T.rect(1, 1, 30, 30, c1); T.rect(3, 3, 26, 26, c2); T.rect(4, 4, 24, 24, c1);
    for (let i = 6; i < 26; i += 4) { T.p(i, 6, c2); T.p(i, 25, c2); } for (let j = 6; j < 26; j += 4) { T.p(6, j, c2); T.p(25, j, c2); }
    for (let j = 10; j < 22; j++) for (let i = 10; i < 22; i++) if (Math.abs(i - 15.5) + Math.abs(j - 15.5) < 6) T.p(i, j, (i + j) % 2 ? c2 : c3);
  }));
  // ombres portées des murs sur le sol (nord : mur du fond ; ouest et est : murs latéraux)
  putImg('ombre_n', toile((T) => { for (let j = 0; j < 12; j++) T.rect(0, j, 32, 1, `#000000${Math.round(90 * (1 - j / 12)).toString(16).padStart(2, '0')}`); }));
  putImg('ombre_o', toile((T) => { for (let i = 0; i < 8; i++) T.rect(i, 0, 1, 32, `#000000${Math.round(60 * (1 - i / 8)).toString(16).padStart(2, '0')}`); }));
  putImg('ombre_e', toile((T) => { for (let i = 0; i < 8; i++) T.rect(31 - i, 0, 1, 32, `#000000${Math.round(60 * (1 - i / 8)).toString(16).padStart(2, '0')}`); }));
}
