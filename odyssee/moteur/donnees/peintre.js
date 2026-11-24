// odyssee/moteur/donnees/peintre.js — dessiner un grand morceau de dehors d'un seul tenant (plusieurs blocs), en
// coordonnées réelles du jeu : on remplit, on trace des rectangles et des lignes, on pose les bâtiments par leur
// porte (l'emprise vient des dimensions du vrai modèle 3D), puis on découpe en blocs de 32 × 32 pour le moteur.

import { BLOC } from '../engine/const.js';
import { bloc } from './auteur.js';

/**
 * Dimensions des vrais bâtiments de HGSS, en cases, mesurées sur leurs modèles (render/modeles3d.js lit les modèles) :
 * x et z de la boîte autour de l'origine, porte = décalage du centre de la porte par rapport à l'origine,
 * facade = position de la façade (côté sud) par rapport à l'origine.
 */
export const MODELES = {
  wk_labo: { x: [-3.75, 3.58], z: [-2.13, 2.25], porte: -2, facade: 1.9 },
  wk_hhouse: { x: [-2.88, 3.13], z: [-2.38, 2.25], porte: -1, facade: 1.6 },
  wk_h01: { x: [-2.25, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  wk_h02: { x: [-2.25, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  pc: { x: [-2.63, 3], z: [-2, 2.31], porte: 0, facade: 2 },
  kk_pc: { x: [-2.63, 3], z: [-2, 2.31], porte: 0, facade: 2 },
  fs: { x: [-2.13, 3.63], z: [-1.81, 1.38], porte: -0.5, facade: 0.72 },
  kk_fs: { x: [-2.13, 3.63], z: [-1.81, 1.38], porte: -0.5, facade: 0.72 },
  yo_h01: { x: [-2.19, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  yo_h02: { x: [-2.19, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  r30_h01: { x: [-2.25, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  kk_h01: { x: [-2.25, 2.5], z: [-1.63, 2], porte: -0.5, facade: 1.17 },
  kk_gym: { x: [-3.6, 3.76], z: [-2.5, 2.5], porte: 0, facade: 1.37 },
  kk_school: { x: [-4.69, 5.23], z: [-2.25, 2.66], porte: -1.5, facade: 1.6 },
  kk_mada: { x: [-3.25, 3.6], z: [-3.25, 4.98], porte: 0, facade: 2.3 },
  gate_a: { x: [-3, 3.25], z: [-4.26, 3.5], porte: 0, facade: 2.7 },
};

export class Peintre {
  /** (x0, y0) : coin nord-ouest en coordonnées réelles ; larg × haut en blocs */
  constructor(x0, y0, lb, hb, fond = 'T') {
    this.x0 = x0; this.y0 = y0; this.lb = lb; this.hb = hb;
    this.L = lb * BLOC; this.H = hb * BLOC;
    this.g = Array.from({ length: this.H }, () => new Array(this.L).fill(fond));
    this.decor = [];          // bâtiments et décor, coordonnées locales à la grille
  }
  dans(x, y) { return x >= 0 && y >= 0 && x < this.L && y < this.H; }
  /** une case, en coordonnées réelles */
  point(c, x, y) { x -= this.x0; y -= this.y0; if (this.dans(x, y)) this.g[y][x] = c; }
  get(x, y) { x -= this.x0; y -= this.y0; return this.dans(x, y) ? this.g[y][x] : null; }
  /** rectangle plein, bornes comprises */
  rect(c, xa, ya, xb, yb) { for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) this.point(c, x, y); return this; }
  /** remplace un caractère par un autre dans un rectangle */
  remplacer(de, vers, xa, ya, xb, yb) { for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (this.get(x, y) === de) this.point(vers, x, y); return this; }
  /**
   * Un vrai bâtiment posé par sa porte (case réelle). L'emprise (cases bloquées) vient du modèle ; la porte devient
   * une case de porte. `large: 2` : porte de deux cases (postes de garde), la case donnée est celle de gauche.
   */
  batiment(m3d, px, py, o = {}) {
    const M = MODELES[m3d];
    if (!M) throw new Error(`modèle inconnu ${m3d}`);
    const cx = px + (o.large === 2 ? 1 : 0.5);
    const ox = cx - M.porte, oz = py + 1 - M.facade;
    const xa = Math.round(ox + M.x[0]), xb = Math.round(ox + M.x[1]) - 1;
    const za = Math.round(oz + M.z[0]);
    for (let y = za; y <= py; y++) for (let x = xa; x <= xb; x++) this.point('%', x, y);
    this.point('D', px, py);
    if (o.large === 2) this.point('D', px + 1, py);
    this.decor.push({ type: 'batiment', m3d, ox: ox - this.x0, oz: oz - this.y0, x: xa - this.x0, y: za - this.y0, l: xb - xa + 1, p: py - za + 1, porte: px - xa, modele: o.modele || 'maison', rot: o.rot || 0 });
    return { xa, xb, za, zb: py };
  }
  /** bâtiment sans modèle (boîte du rendu) : emprise donnée, porte au bas */
  boite(modele, xa, ya, l, p, porte) {
    this.rect('%', xa, ya, xa + l - 1, ya + p - 1);
    if (porte !== undefined) this.point('D', xa + porte, ya + p - 1);
    this.decor.push({ type: 'batiment', modele, x: xa - this.x0, y: ya - this.y0, l, p, porte });
  }
  /** emprise bloquée sans porte, avec un modèle tourné (postes de garde est-ouest) */
  emprise(m3d, xa, ya, xb, yb, o = {}) {
    this.rect('%', xa, ya, xb, yb);
    this.decor.push({ type: 'batiment', m3d, ox: (xa + xb + 1) / 2 - this.x0 + (o.dx || 0), oz: (ya + yb + 1) / 2 - this.y0 + (o.dz || 0), x: xa - this.x0, y: ya - this.y0, l: xb - xa + 1, p: yb - ya + 1, rot: o.rot || 0, modele: o.modele || 'poste' });
  }
  /** découpe en blocs : { [nom]: bloc }, noms = « prefixe_cx_cy » ; `legende` complète celle d'auteur.js */
  blocs(prefixe, legende = {}) {
    const out = {};
    for (let by = 0; by < this.hb; by++) for (let bx = 0; bx < this.lb; bx++) {
      const plan = [];
      for (let y = 0; y < BLOC; y++) plan.push(this.g[by * BLOC + y].slice(bx * BLOC, bx * BLOC + BLOC).join(''));
      const decor = this.decor.filter((d) => {
        // un bâtiment va au bloc qui contient sa porte (ou son coin)
        const ax = d.porte !== undefined ? d.x + d.porte : d.x, ay = d.y + d.p - 1;
        return Math.floor(ax / BLOC) === bx && Math.floor(ay / BLOC) === by;
      }).map((d) => ({ ...d, x: d.x - bx * BLOC, y: d.y - by * BLOC, ox: d.ox !== undefined ? d.ox - bx * BLOC : undefined, oz: d.oz !== undefined ? d.oz - by * BLOC : undefined }));
      out[`${prefixe}_${bx}_${by}`] = bloc({ plan, legende, decor, strict: true });
    }
    return out;
  }
  /** conversion d'une case réelle en case du monde (si la grille commence au coin du monde) */
  ici(x, y) { return { x: x - this.x0, y: y - this.y0 }; }
}
