// odyssee/js/render/ombres.js — ombres portées au sol, dessinées à la densité de l'écran (un pixel de l'ombre = un
// pixel du jeu, comme les arbres et les personnages), et jamais deux fois plus sombres là où deux ombres se croisent.
//
// Chaque taille d'ombre a son propre dessin (une ellipse pleine, ou une bande aux bouts arrondis au pied d'un
// bâtiment), rangé à la demande dans une petite planche. Le matériau marque le gabarit (stencil) : là où une ombre est
// déjà passée, la suivante ne fonce plus le sol (les sous-bois ne font plus des damiers de rectangles sombres).
import * as THREE from 'three';

const W = 512, H = 256;
const COULEUR = [18, 28, 20], ALPHA = 0.36;

export class Ombres {
  constructor() {
    const c = this.canvas = document.createElement('canvas'); c.width = W; c.height = H;
    this.ctx = c.getContext('2d');
    this.cells = new Map(); this.x = 1; this.y = 1; this.rang = 0;
    const t = this.tex = new THREE.Texture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  }

  /** matériau des ombres (teinté par l'heure comme le reste : couleurs de sommets × teinte) */
  materiau() {
    const m = new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, depthWrite: false });
    // une seule couche d'ombre par pixel : la première posée marque le gabarit, les suivantes l'y respectent
    m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.NotEqualStencilFunc;
    m.stencilZPass = THREE.ReplaceStencilOp; m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp;
    return m;
  }

  /** coordonnées [u0, v0, u1, v1] d'une ombre de w × h pixels d'écran ; forme : 'ellipse' ou 'bande' (pied de mur) */
  uv(w, h, forme = 'ellipse') {
    w = Math.max(4, Math.min(W - 2, Math.round(w))); h = Math.max(2, Math.min(H - 2, Math.round(h)));
    const k = forme + w + 'x' + h;
    let r = this.cells.get(k);
    if (r) return r.uv;
    if (this.x + w + 1 > W) { this.x = 1; this.y += this.rang + 1; this.rang = 0; }
    if (this.y + h + 1 > H) {
      // planche pleine (ne devrait pas arriver) : l'ombre de taille la plus proche
      let best = null, bd = Infinity;
      for (const [kk, rr] of this.cells) if (kk.startsWith(forme)) { const d = Math.abs(rr.w - w) + Math.abs(rr.h - h); if (d < bd) { bd = d; best = rr; } }
      return best?.uv || [0, 0, 0, 0];
    }
    const x0 = this.x, y0 = this.y; this.x += w + 1; this.rang = Math.max(this.rang, h);
    const img = this.ctx.createImageData(w, h), d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / (w / 2), dy = (j + 0.5 - h / 2) / (h / 2);
      let dedans;
      if (forme === 'bande') {
        // bande au pied d'un mur : droite sur toute sa longueur, bouts arrondis d'un rayon d'une demi-hauteur
        const rx = Math.min(1, h / w), ax = Math.max(0, Math.abs(dx) - (1 - rx)) / rx;
        dedans = ax * ax + dy * dy <= 1;
      } else dedans = dx * dx + dy * dy <= 1;
      if (!dedans) continue;
      const o = (j * w + i) * 4;
      d[o] = COULEUR[0]; d[o + 1] = COULEUR[1]; d[o + 2] = COULEUR[2]; d[o + 3] = Math.round(ALPHA * 255);
    }
    this.ctx.putImageData(img, x0, y0);
    this.tex.needsUpdate = true;
    r = { w, h, uv: [x0 / W, y0 / H, (x0 + w) / W, (y0 + h) / H] };
    this.cells.set(k, r);
    return r.uv;
  }
}

/** taille à l'écran (en pixels) d'un rectangle de sol de dx × dz cases : une case fait 32 × 32 pixels */
export const PX_CASE = 32;
