// odyssee/moteur/engine/objets.js — objets du terrain (« field objects ») : joueur, PNJ, dresseurs, objets au sol.
//
// Un objet est toujours sur une case entière (x, y). Quand il bouge, il réserve la case d'arrivée dès le départ et
// garde celle de départ jusqu'à l'arrivée : deux objets ne peuvent jamais se croiser ni se chevaucher. Sa position
// à l'écran (px, py, pz) est interpolée pendant le pas ; le moteur, lui, ne raisonne qu'en cases.

import { DX, DY, OPPOSE, PROPS, VITESSE, MB } from './const.js';

export class ObjetTerrain {
  constructor(def, rng) {
    this.id = def.id;
    this.def = def;
    this.x = def.x; this.y = def.y; this.z = def.z ?? 0;
    this.x0 = def.x; this.y0 = def.y;          // origine (errance)
    this.dir = def.dir ?? 1;
    this.sprite = def.sprite || 'habitant';
    this.visible = true;
    this.mouvement = def.mouvement || 'fixe';
    this.rayon = def.rayon ?? 2;
    this.route = def.route || null; this.iRoute = 0;
    this.rng = rng;
    this.attente = 30 + ((rng() * 90) | 0);    // avant le prochain geste libre
    this.m = null;          // mouvement en cours
    this.file = [];         // actions de script en attente
    this.pied = false;      // alterne le pied à chaque pas (animation)
    this.bulle = null; this.tBulle = 0;
    this.px = this.x; this.py = this.y; this.pz = 0; this.saut = 0;
    this.frame = 0;
    this.gele = false;      // figé par un script (verrouiller)
    this.vitesse = VITESSE.pnj;
  }
  get bouge() { return this.m !== null; }
  /** les cases tenues par l'objet (deux pendant un pas) */
  occupe(x, y) {
    if (!this.visible) return false;
    if (this.x === x && this.y === y) return true;
    return !!this.m && this.m.vx === x && this.m.vy === y;
  }
  /** lance un mouvement d'une case (ou deux pour un saut) ; le moteur a déjà vérifié qu'il est permis */
  lancer(type, dir, duree, cases = 1) {
    this.dir = dir ?? this.dir;
    const fixe = dir == null || type === 'tour' || type === 'surplace';
    const dx = fixe ? 0 : DX[dir] * cases, dy = fixe ? 0 : DY[dir] * cases;
    this.m = { type, dir, t: 0, duree, dx: this.x, dy: this.y, vx: this.x + dx, vy: this.y + dy };
    if (type === 'pas' || type === 'saut' || type === 'glisse') this.pied = !this.pied;
  }
  /** avance d'un pas de temps ; rend true au moment où le mouvement se termine */
  avancer() {
    const m = this.m;
    if (!m) { this.px = this.x; this.py = this.y; this.saut = 0; this.frame = 0; return false; }
    m.t++;
    const k = Math.min(1, m.t / m.duree);
    if (m.type === 'surplace' || m.type === 'tour') {
      this.px = this.x; this.py = this.y;
    } else {
      this.px = m.dx + (m.vx - m.dx) * k; this.py = m.dy + (m.vy - m.dy) * k;
    }
    this.saut = m.type === 'saut' ? Math.sin(Math.PI * k) * (m.vx === m.dx && m.vy === m.dy ? 0.35 : 0.6) : 0;
    // planche HGSS : [debout, pied A, debout, pied B] ; on lève le pied pendant la première moitié du pas
    // sur la glace on glisse debout, sans faire de pas
    this.frame = m.type === 'tour' || m.type === 'glisse' || m.type === 'recul' ? 0 : (k < 0.5 ? (this.pied ? 1 : 3) : 0);
    if (m.t >= m.duree) {
      this.x = m.vx; this.y = m.vy; this.px = this.x; this.py = this.y; this.saut = 0; this.frame = 0;
      this.m = null;
      return true;
    }
    return false;
  }
}

/** objet présent sur une case (hors `sauf`) */
export function objetEn(objets, x, y, sauf = null) {
  for (const o of objets) if (o !== sauf && o.occupe(x, y)) return o;
  return null;
}

/**
 * Peut-on faire un pas de (x, y) vers `dir` ? Règles communes au joueur et aux PNJ.
 * Rend { ok, type: 'pas' | 'saut' | 'heurt', vers: [x, y], raison }.
 *   opts.surf      : l'objet est sur l'eau (il ne quitte l'eau que pour une case de terre libre : il débarque)
 *   opts.velo      : à vélo (cases interdites au vélo)
 *   opts.pnj       : un PNJ ne saute pas les rebords, ne prend ni porte ni escalier
 *   opts.objets    : liste des objets pour les collisions
 */
export function testerPas(M, o, dir, opts = {}) {
  const x = o.x, y = o.y, nx = x + DX[dir], ny = y + DY[dir];
  const heurt = (raison) => ({ ok: false, type: 'heurt', vers: [x, y], raison });
  if (!M.dedans(nx, ny)) return heurt('bord');
  const pc = M.props(nx, ny), pd = M.props(x, y);
  // rebord : on le saute dans son sens, jamais autrement ; il dépose deux cases plus loin
  if (pc.rebord !== null) {
    if (opts.pnj || opts.surf || pc.rebord !== dir) return heurt('rebord');
    const lx = nx + DX[dir], ly = ny + DY[dir];
    if (M.bloquee(lx, ly) || PROPS[M.mb(lx, ly)].surf || objetEn(opts.objets || [], lx, ly, o)) return heurt('rebord');
    return { ok: true, type: 'saut', vers: [lx, ly], cases: 2 };
  }
  if (M.bloquee(nx, ny)) return heurt('mur');
  if (objetEn(opts.objets || [], nx, ny, o)) return heurt('objet');
  // eau : il faut surfer ; en surf, la terre (libre) fait débarquer
  if (pc.surf && !opts.surf) return heurt('eau');
  if (opts.pnj && (pc.warp || pc.tapis)) return heurt('porte');
  if (opts.velo && pc.pasVelo) return heurt('velo');
  // cases bloquées dans un axe (on ne les traverse que dans l'autre)
  const axe = dir <= 1 ? 'ns' : 'eo';
  if (pd.bloque === axe || pc.bloque === axe) return heurt('sens');
  // hauteurs : même niveau, ou marches franchies dans l'axe haut / bas (un monde « à pentes » suit son relief)
  const h0 = M.hauteurCase(x, y), h1 = M.hauteurCase(nx, ny);
  if (h0 !== h1 && !M.pentes) {
    const marches = (pc.marches || pd.marches) && (dir === 0 || dir === 1) && Math.abs(h1 - h0) <= 1;
    if (!marches) return heurt('hauteur');
  }
  return { ok: true, type: 'pas', vers: [nx, ny], debarque: !!opts.surf && !pc.surf };
}

/** la case que regarde l'objet */
export const devant = (o) => [o.x + DX[o.dir], o.y + DY[o.dir]];
export { OPPOSE, MB };
