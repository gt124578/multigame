// odyssee/js/world/volcan.js — le volcan de Cendrelune : le cône de roche cendrée qui domine la ville au sud, son cratère
// et sa lave, que l'on voit depuis les rues ; un sentier mène de la ville au pied des coulées (on ne le gravit pas).
// Tout est tiré d'un bruit à graine fixe (même carte dans Node et dans le navigateur).
import { T, walkable } from './tiles.js';
import { bruit } from './quartiers.js';

const FORET = (t) => t === T.TREE || t === T.PINE;

/**
 * Pose le volcan centré en (cx, cy), demi-axes rx, ry : seules la forêt et la roche deviennent volcan (jamais la ville,
 * l'eau ni un passage) ; hauteur jusqu'à `haut` ; renvoie { sommet, cases }.
 */
export function volcan(W, { cx, cy, rx, ry, haut = 10, nom = 'Volcan de Cendrelune', ville = null }) {
  const garde = (x, y) => ville && x >= ville.x - 2 && y >= ville.y - 2 && x < ville.x + ville.w + 2 && y < ville.y + ville.h + 2;
  const cases = [];
  // le rayon « réel » d'une case : ellipse déformée par un bruit lent (épaulements, coulées), et des ravines qui
  // descendent du cratère (un bruit lu le long de l'angle)
  const rayon = (x, y) => {
    const u = (x - cx) / rx, v = (y - cy) / ry, r = Math.hypot(u, v);
    const a = Math.atan2(v, u), ravine = (bruit(a * 4 + 10, r * 3, 1, 9301) - 0.5) * 0.18;
    return r * (1 + (bruit(x, y, 9, 9302) - 0.5) * 0.35) + ravine;
  };
  for (let y = Math.floor(cy - ry * 1.3); y <= cy + ry * 1.3; y++) for (let x = Math.floor(cx - rx * 1.3); x <= cx + rx * 1.3; x++) {
    if (!W.in(x, y) || garde(x, y)) continue;
    const t = W.get(x, y); if (!(FORET(t) || t === T.CAVEWALL)) continue;
    const r = rayon(x, y); if (r > 1) continue;
    // pas à côté d'un passage : la roche du pied reste à deux cases de tout ce qu'on foule
    let pres = false; for (let j = -2; j <= 2 && !pres; j++) for (let i = -2; i <= 2; i++) if (walkable(W.get(x + i, y + j))) { pres = true; break; }
    if (pres) continue;
    let h;
    if (r < 0.21) h = haut - 3;                                   // le fond du cratère
    else if (r < 0.3) h = haut;                                   // la lèvre du cratère
    else h = Math.max(1, Math.round(haut * Math.pow((1 - r) / 0.74, 0.85)));
    W.set(x, y, r < 0.17 + (bruit(x, y, 2, 9303) - 0.5) * 0.06 ? T.LAVA : T.CAVEWALL); W.setHeight(x, y, h); cases.push([x, y]);
  }
  // la zone du volcan remonte jusqu'à la ville : la forêt d'entre deux est celle de l'île (arbres morts, cendre)
  const y0 = ville ? Math.min(Math.round(cy - ry), ville.y + ville.h) : Math.round(cy - ry);
  W.zone(Math.round(cx - rx * 1.3), y0, Math.round(cx + rx * 1.3), Math.round(cy + ry * 1.3), { name: nom, music: 'volcano', theme: 'volcanic', prio: 0 });
  return { sommet: [Math.round(cx), Math.round(cy)], cases };
}
