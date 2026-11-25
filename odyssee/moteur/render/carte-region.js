// odyssee/moteur/render/carte-region.js — la carte de la région (touche C), façon Pokégear.
// Elle est tirée du monde chargé lui-même, une case = un point : eau, hautes herbes, arbres et murs, chemins ;
// les villes ressortent en rouge, le joueur clignote à sa place (dans un bâtiment : à la porte par laquelle il est entré).
// Flèches : promener le curseur (le nom du lieu s'affiche), C, B ou Échap : fermer.

import { Monde } from '../engine/carte.js';

const COUL = {
  eau: [88, 152, 224], herbes: [72, 160, 88], bloque: [40, 112, 64], sol: [168, 208, 120],
  ville: [224, 72, 80], villeSol: [248, 200, 200], route: [248, 240, 216],
};

export class CarteRegion {
  constructor(parent, T) {
    this.T = T; this.ouverte = false; this.dehors = null; this.cur = null;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;display:none;background:#101828;z-index:20;'
      + 'font:bold calc(var(--px,3px)*6) system-ui;color:#fff;';
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);image-rendering:pixelated;'
      + 'border:calc(var(--px,3px)*2) solid #e8e8f0;border-radius:calc(var(--px,3px)*3);background:#3070c0;';
    this.titre = document.createElement('div');
    this.titre.style.cssText = 'position:absolute;left:0;right:0;top:3%;text-align:center;letter-spacing:0.05em;text-shadow:0 2px 0 #000';
    this.lieu = document.createElement('div');
    this.lieu.style.cssText = 'position:absolute;left:0;right:0;bottom:4%;text-align:center;text-shadow:0 2px 0 #000';
    this.el.append(this.cv, this.titre, this.lieu);
    parent.append(this.el);
    this.fond = null;
  }
  /** à chaque image : retenir où le joueur est dehors (la carte le montre là quand il est dans un bâtiment) */
  suivre() {
    const T = this.T, j = T.joueur;
    if (T.M?.id === 'johto') this.dehors = { x: j.x, y: j.y };
  }
  /** l'image de fond : une fois, puis refaite si de nouvelles cartes du dehors sont arrivées */
  dessinerFond() {
    const T = this.T;
    if (!T.d.mondes.johto) return null;
    const n = Object.values(T.d.zones).filter((z) => !z.aCharger).length;
    if (this.fond && this.fondN === n) return this.fond;
    const M = T.M?.id === 'johto' ? T.M : new Monde(T.d, 'johto');
    this.fondN = n;
    const L = M.largeur, H = M.hauteur, sols = this.T.d.sols;
    const cv = document.createElement('canvas'); cv.width = L; cv.height = H;
    const g = cv.getContext('2d'), im = g.createImageData(L, H), d = im.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const k = (y * L + x) * 4;
      if (!M.dedans(x, y)) continue;
      const z = M.zone(x, y), s = sols[M.sol(x, y)];
      let c;
      if (!z) { d[k + 3] = 0; continue; }
      if (s === 'eau' || s === 'eau_profonde') c = COUL.eau;
      else if (M.bloquee(x, y)) c = z.ville ? COUL.ville : COUL.bloque;
      else if (s === 'hautes_herbes') c = COUL.herbes;
      else c = z.ville ? COUL.villeSol : z.route ? COUL.route : COUL.sol;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    // on recadre sur ce qui est rempli (le monde a des blocs vides sur ses bords), avec un peu de mer autour
    let x0 = L, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 4) for (let x = 0; x < L; x += 4) if (d[(y * L + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = 16; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(L, x1 + m); y1 = Math.min(H, y1 + m);
    const cr = document.createElement('canvas'); cr.width = x1 - x0; cr.height = y1 - y0;
    cr.getContext('2d').drawImage(cv, -x0, -y0);
    this.ox = x0; this.oy = y0;
    this.fond = cr; this.fondDe = M;
    return cr;
  }
  /** dans un bâtiment où l'on n'est pas entré à pied (partie reprise) : la porte qui mène dehors, à deux étages près */
  porteDehors() {
    const T = this.T, vus = new Set();
    let file = [T.zone?.id];
    for (let k = 0; k < 4 && file.length; k++) {
      const f2 = [];
      for (const id of file) {
        if (!id || vus.has(id)) continue; vus.add(id);
        for (const w of T.d.zones[id]?.warps || []) {
          if (!w.vers) continue;
          const z = T.d.zones[w.vers];
          if (T.d.mondeDeZone?.[w.vers] === 'johto' && z?.warps?.[w.n ?? 0]) { const d = z.warps[w.n ?? 0]; return { x: d.x, y: d.y }; }
          f2.push(w.vers);
        }
      }
      file = f2;
    }
    return null;
  }
  ouvrir() {
    if (!this.dehors) this.dehors = this.porteDehors();
    this.ouverte = true; this.el.style.display = 'block';
    this.titre.textContent = 'TOWN MAP';
    this.fond = null;
    this.cur = this.dehors ? { ...this.dehors } : null;
    this.dessiner(0);
  }
  fermer() { this.ouverte = false; this.el.style.display = 'none'; }
  /** flèches : le curseur avance d'un demi-bloc */
  bouger(dx, dy) {
    if (!this.cur) return;
    const M = this.fondDe; if (!M) return;
    this.cur.x = Math.max(0, Math.min(M.largeur - 1, this.cur.x + dx * 16));
    this.cur.y = Math.max(0, Math.min(M.hauteur - 1, this.cur.y + dy * 16));
  }
  dessiner(temps) {
    if (!this.ouverte) return;
    const fond = this.dessinerFond();
    if (!fond) { this.lieu.textContent = '—'; return; }
    // on cadre ce qui est rempli (le monde a des blocs vides sur ses bords)
    const boite = this.el.getBoundingClientRect();
    const k = Math.min(boite.width * 0.96 / fond.width, boite.height * 0.78 / fond.height);
    const cv = this.cv;
    if (cv.width !== fond.width) { cv.width = fond.width; cv.height = fond.height; }
    cv.style.width = fond.width * k + 'px'; cv.style.height = fond.height * k + 'px';
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(fond, 0, 0);
    const p = this.dehors;
    if (p && Math.floor(temps / 300) % 2 === 0) {
      g.fillStyle = '#ffffff'; g.fillRect(p.x - this.ox - 6, p.y - this.oy - 6, 12, 12);
      g.fillStyle = '#2050d0'; g.fillRect(p.x - this.ox - 4, p.y - this.oy - 4, 8, 8);
    }
    const c = this.cur;
    if (c) {
      g.strokeStyle = '#ffe040'; g.lineWidth = 3; g.strokeRect(c.x - this.ox - 12, c.y - this.oy - 12, 24, 24);
      const z = this.fondDe.zone(c.x, c.y);
      this.lieu.textContent = z?.nom || '';
    }
  }
}
