// odyssee/js/ui/casino/commun.js — ce que partagent les tables du Casino : la scène, son titre, le compteur de jetons
import { scene, etiquette, ease, clamp, toile } from '../pixel.js';
import { esc } from '../ui.js';
import { chargerPersos, carte, dos } from './dessin.js';

export const fr = (n) => Number(n).toLocaleString('fr-FR');
/** ouvre une table : la scène en pixel art, le nom du jeu en haut à gauche, les jetons du joueur en haut à droite */
export async function ouvrir(game, cls, titre) {
  await chargerPersos();
  const T = scene(game.ui, 'casino ' + cls);
  T.game = game; T.st = game.state; T.sfx = (k) => game.ui.sound.sfx(k);
  etiquette(T, 'pxs-titre', 4, 3, esc(titre));
  const jl = etiquette(T, 'pxs-jetons', 396, 3, '');
  T.majJetons = (n = T.st.jetons) => jl.texte(`<i class="ico-jeton"></i>${fr(n)}`);
  T.majJetons();
  return T;
}
/** boutons de jetons (mise) : des pastilles rondes aux couleurs des jetons */
export const pastille = (v, extra = '') => `<span class="pastille-jeton j${v}">${v}</span>${extra}`;

/* ---------------- cartes qui glissent et se retournent ---------------- */
/** les cartes posées sur la table : chacune glisse vers sa place (et peut se retourner) ; dessine() à chaque image */
export class Cartes {
  constructor() { this.l = []; this.flip = toile(24, 34); }
  /** pose une carte c (de : point de départ, le sabot) ; o : { face, petit, delai, dur, z } */
  ajoute(c, x, y, o = {}) {
    const de = o.de || [x, y], t0 = performance.now() + (o.delai || 0);
    const sp = { c, x0: de[0], y0: de[1], x1: x, y1: y, t0, dur: o.dur ?? 280, face: o.face !== false, petit: !!o.petit, flipT: 0, eteinte: false, lumiere: false, z: o.z || 0, leve: 0 };
    this.l.push(sp); return sp;
  }
  deplace(sp, x, y, dur = 260, delai = 0) { const p = this.pos(sp, performance.now()); Object.assign(sp, { x0: p[0], y0: p[1], x1: x, y1: y, t0: performance.now() + delai, dur }); }
  retourne(sp, dur = 240) { sp.flipT = performance.now(); sp.flipDur = dur; sp.flipVers = !sp.face; }
  retire(sp) { this.l = this.l.filter((x) => x !== sp); }
  vide() { this.l = []; }
  pos(sp, now) { const p = ease.out((now - sp.t0) / sp.dur); return [sp.x0 + (sp.x1 - sp.x0) * p, sp.y0 + (sp.y1 - sp.y0) * p]; }
  /** fin de toutes les animations en cours */
  attend() { const now = performance.now(); const fin = Math.max(0, ...this.l.map((sp) => Math.max(sp.t0 + sp.dur, sp.flipT ? sp.flipT + sp.flipDur : 0) - now)); return new Promise((r) => setTimeout(r, fin + 20)); }
  dessine(g, now) {
    const [fc, fg] = this.flip;
    for (const sp of [...this.l].sort((a, b) => a.z - b.z)) {
      if (now < sp.t0) continue;
      const [x, y] = this.pos(sp, now); const yy = y - sp.leve;
      let face = sp.face, sx = 1;
      if (sp.flipT) {
        const p = clamp((now - sp.flipT) / sp.flipDur, 0, 1); sx = Math.abs(Math.cos(p * Math.PI)); face = p < 0.5 ? !sp.flipVers : sp.flipVers;
        if (p >= 1) { sp.face = sp.flipVers; sp.flipT = 0; sx = 1; face = sp.face; }
      }
      const w = sp.petit ? 16 : 24, h = sp.petit ? 22 : 34;
      if (sx < 1) {
        fg.clearRect(0, 0, 25, 35);
        if (face) carte(fg, sp.c, 0, 0, { petit: sp.petit }); else dos(fg, 0, 0, { petit: sp.petit });
        const ww = Math.max(1, Math.round(w * sx)); g.drawImage(fc, 0, 0, w, h + 1, Math.round(x + (w - ww) / 2), Math.round(yy), ww, h + 1);
      } else if (face) carte(g, sp.c, x, yy, { petit: sp.petit, eteinte: sp.eteinte, lumiere: sp.lumiere });
      else dos(g, x, yy, { petit: sp.petit });
    }
  }
}
