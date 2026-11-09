// odyssee/js/render/lumieres.js — lumière du jour et de la nuit : teinte de l'heure, flaques de lumière des
// lampadaires et des portes, à la densité de l'écran.
//
// Teinte de l'heure : les couleurs du jeu sont mélangées en lumière linéaire (le rendu sort en sRGB). Une teinte
// donnée telle quelle (0,8 en rouge) ne fonce presque pas l'image (0,8 linéaire ≈ 0,9 à l'écran) : le soir ne se voyait
// pas. Les clés ci-dessous sont écrites comme on les voit à l'écran, puis passées en linéaire.
import * as THREE from 'three';

/** heure → facteur de chaque couleur, tel qu'on le voit à l'écran (aube rosée, matin doré, soir orangé, nuit bleue) */
const CLES = [
  [0, [0.42, 0.47, 0.74]],
  [4.5, [0.45, 0.49, 0.75]],
  [6, [0.8, 0.7, 0.74]],
  [7.5, [1.0, 0.93, 0.84]],
  [10, [1, 1, 1]],
  [17, [1, 1, 1]],
  [18.4, [1.0, 0.84, 0.64]],
  [19.6, [0.82, 0.6, 0.62]],
  [20.6, [0.48, 0.5, 0.76]],
  [24, [0.42, 0.47, 0.74]],
];
const lin = (v) => Math.pow(v, 2.2);

/** teinte (linéaire) de l'heure h */
export function teinteHeure(h) {
  h = ((h % 24) + 24) % 24;
  for (let i = 1; i < CLES.length; i++) if (h <= CLES[i][0]) {
    const [a, ca] = CLES[i - 1], [b, cb] = CLES[i], u = (h - a) / (b - a);
    return ca.map((v, k) => lin(v + (cb[k] - v) * u));
  }
  return CLES[0][1].map(lin);
}
/** part de nuit (0 le jour, 1 la nuit) : lampadaires, fenêtres et portes allumés au-delà de 0,5 */
export const nuitHeure = (h) => (h >= 20.2 || h < 5.5 ? 1 : h >= 18.8 ? (h - 18.8) / 1.4 : h < 6.5 ? 1 - (h - 5.5) : 0);

/** couleur des vitres allumées la nuit (multiplie le dessin de la vitre : du jaune chaud qui ressort) */
export const VITRE_NUIT = [1.7, 1.3, 0.62];

/** flaque de lumière au sol : ellipse de w × h pixels, en paliers tramés (pixel art), d'intensité i au centre */
function flaque(w, h, i) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const NIV = [0, 0.32, 0.56, 0.8, 1];   // paliers de lumière (fraction de i)
  for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
    const dx = (k + 0.5 - w / 2) / (w / 2), dy = (j + 0.5 - h / 2) / (h / 2), q = Math.sqrt(dx * dx + dy * dy);
    if (q >= 1) continue;
    const v = Math.pow(1 - q, 1.25) * (NIV.length - 1);           // lumière continue, en nombre de paliers
    const t = (BAYER[(j & 3) * 4 + (k & 3)] + 0.5) / 16;           // trame ordonnée entre deux paliers
    const n = Math.min(NIV.length - 1, Math.floor(v) + (v - Math.floor(v) > t ? 1 : 0));
    if (!n) continue;
    const o = (j * w + k) * 4;
    d[o] = 255; d[o + 1] = 206; d[o + 2] = 128; d[o + 3] = Math.round(NIV[n] * i * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.Texture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

/** géométries et matériaux partagés des lumières de nuit (une seule copie pour toute la carte) */
export class Lumieres {
  constructor() {
    const mat = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    // lampadaire : 3 × 1,7 cases ; porte : 2,2 × 1,1 cases (32 pixels par case)
    this.matLampe = mat(flaque(96, 54, 0.42)); this.geoLampe = new THREE.PlaneGeometry(3, 1.7); this.geoLampe.rotateX(-Math.PI / 2);
    // la lumière d'une porte se pose aussi sur les marches du perron (qui ont la profondeur de la façade) et sur qui
    // s'y tient : pas de test de profondeur (deux cases libres devant chaque porte, rien ne s'y dresse)
    this.matPorte = mat(flaque(70, 36, 0.34)); this.matPorte.depthTest = false; this.geoPorte = new THREE.PlaneGeometry(2.2, 1.1); this.geoPorte.rotateX(-Math.PI / 2);
  }
  /** faisceau tournant d'un phare la nuit (deux pinceaux opposés) et le halo de sa lanterne, en (x, y, z) */
  phare(x, y, z) {
    if (!this.matFaisceau) {
      // pinceau : clair à la lanterne, qui s'évase et s'éteint au loin ; bords tramés (pixel art)
      const W = 96, H = 24, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = i / W, larg = 0.12 + 0.88 * u, v = Math.abs((j + 0.5) / H - 0.5) * 2 / larg;
        if (v >= 1) continue;
        const k = (1 - u) ** 1.4 * (1 - v * v) * 0.55, t = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16;
        const n = Math.floor(k * 6 + t) / 6;
        if (n <= 0) continue;
        const o = (j * W + i) * 4; d[o] = 255; d[o + 1] = 236; d[o + 2] = 170; d[o + 3] = Math.round(n * 255);
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.Texture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      this.matFaisceau = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const geo = this.geoFaisceau = new THREE.PlaneGeometry(9, 2.2); geo.translate(4.5, 0, 0); geo.rotateX(-Math.PI / 2);
    }
    const G = new THREE.Group(); G.position.set(x, y, z); G.userData.phare = true;
    for (const a of [0, Math.PI]) { const m = new THREE.Mesh(this.geoFaisceau, this.matFaisceau); m.rotation.y = a; m.renderOrder = 6; G.add(m); }
    return G;
  }
  /** flaque sous un lampadaire dont le pied est en (x, z), au sol de hauteur y */
  lampe(x, y, z) { const m = new THREE.Mesh(this.geoLampe, this.matLampe); m.position.set(x, y + 0.02, z - 0.15); m.renderOrder = 2; return m; }
  /** lumière qui sort d'une porte (case de la porte en (x, z)), sur le seuil */
  porte(x, y, z) { const m = new THREE.Mesh(this.geoPorte, this.matPorte); m.position.set(x + 0.5, y + 0.02, z + 1.2); m.renderOrder = 2; return m; }
}
