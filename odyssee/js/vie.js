// odyssee/js/vie.js — la vie du monde, autour du joueur :
//  · Pokémon des villes : quelques Pokémon en liberté dans chaque ville, choisis selon son décor (posés à la création du monde) ;
//  · habitants : ils vont plus loin dans leur quartier, et le soir les enfants et une partie des passants rentrent chez eux ;
//  · Pokémon visibles dans les hautes herbes : ils pointent le bout du nez près du joueur ; marcher dessus lance le combat ;
//  · grottes : gouttes qui tombent, poussière dans la lumière, cristaux qui scintillent, chauves-souris dérangées.
import { T } from './world/tiles.js';
import { PHRASES, enFete } from './world/faune.js';
export { addFauneVilles } from './world/faune.js';
import { SPECIES } from './data/species.js';
import { ASSETS } from './assets.js';
import { SAUVAGE } from './data/remplacants.js';
import { encAt } from './world/rencontres.js';

/** parler à un Pokémon de la ville : son cri et un petit mot */
export async function parlerFaune(game, n) {
  const sp = n?.def?.sp; if (!sp) return;
  game.sound.cry?.(ASSETS.cry(sp));
  await game.ui.say(PHRASES[n.def.phrase || 0](SPECIES[sp]?.n || 'Le Pokémon'));
}

/* ================= habitants : la journée ================= */
const ENFANTS = new Set(['enfant', 'gamin', 'fillette']);
const h32 = (a, b, s) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const nuit = (h) => h >= 21 || h < 6;
/** le soir, les enfants et une partie des passants des quartiers sont rentrés (jamais un PNJ d'histoire ni un dresseur) */
export function rentreLeSoir(def, game) {
  if (def.trainer || def.script || def.when || !/:h\d+$/.test(def.id || '') && !ENFANTS.has(def.sprite)) return false;
  if (!nuit(game.hour())) return false;
  return ENFANTS.has(def.sprite) || h32(def.x, def.y, 7) < 0.5;
}

/* ================= Pokémon des hautes herbes ================= */
const MAX_HERBE = 3;

export class Vie {
  constructor(game) { this.game = game; this.herbe = []; this.t = 0; this.nuit = null; this.grotte = null; this.seq = 0; }

  onMap(m) {
    for (const f of this.herbe) this.game.view.removeActor(f.id);
    this.herbe = [];
    this.grotteAmbiance(m.floor === 'cave');
  }

  /** la case (x, y) cache-t-elle un Pokémon visible ? */
  at(x, y) { return this.herbe.find((f) => f.x === x && f.y === y) || null; }
  remove(f) { this.game.view.removeActor(f.id); this.herbe = this.herbe.filter((g) => g !== f); }

  tick(dt) {
    const g = this.game, m = g.mapObj; if (!m) return;
    this.t += dt;
    // la nuit tombe (ou le jour se lève) : les habitants rentrent ou ressortent
    const n = nuit(g.hour());
    if (this.nuit !== n) { const avant = this.nuit; this.nuit = n; if (avant != null && m.outdoor) g.refreshNpcs?.(); }
    // la fête commence (ou se termine) : musicien, loterie et danseurs arrivent ou s'en vont
    const fe = enFete(g);
    if (this.fete !== fe) { const avant = this.fete; this.fete = fe; if (avant != null && m.outdoor) g.refreshNpcs?.(); }
    if (m.outdoor && !g.busy && !g.noEnc) this.herbeTick(dt);
    if (this.grotte) this.grotte.tick(dt);
  }

  herbeTick(dt) {
    const g = this.game, m = g.mapObj, p = g.player, v = g.view, now = performance.now();
    // ceux qui sont restés assez longtemps, ou que le joueur a semés, replongent dans l'herbe
    for (const f of [...this.herbe]) if (now > f.fin || Math.abs(f.x - p.x) > 12 || Math.abs(f.y - p.y) > 9) this.remove(f);
    // de temps en temps, un Pokémon change de touffe d'herbe en sautillant
    for (const f of this.herbe) {
      if (f.saut) {
        const u = Math.min(1, (now - f.saut.t0) / 380);
        v.place(f.a, f.saut.fx + (f.x - f.saut.fx) * u, f.saut.fy + (f.y - f.saut.fy) * u - 0.05, Math.sin(u * Math.PI) * 0.35, true);
        if (u >= 1) f.saut = null;
      } else {
        v.place(f.a, f.x, f.y - 0.05, Math.abs(Math.sin(now / 260 + f.ph)) * 0.06, true);
        if (Math.random() < dt * 0.25) {
          const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
          const tx = f.x + dx, ty = f.y + dy;
          if (this.herbeLibre(m, tx, ty)) { f.saut = { fx: f.x, fy: f.y, t0: now }; f.x = tx; f.y = ty; }
        }
      }
    }
    this.prochain = (this.prochain ?? 1.5) - dt;
    if (this.prochain > 0 || this.herbe.length >= MAX_HERBE) return;
    this.prochain = 2 + Math.random() * 3;
    // une touffe d'herbe à quelques pas du joueur, pas collée à lui
    for (let essai = 0; essai < 24; essai++) {
      const x = p.x + Math.round((Math.random() * 2 - 1) * 8), y = p.y + Math.round((Math.random() * 2 - 1) * 6);
      if (Math.abs(x - p.x) + Math.abs(y - p.y) < 3 || !this.herbeLibre(m, x, y)) continue;
      const enc = encAt(m, x, y); if (!enc?.length) continue;
      const tot = enc.reduce((a, e) => a + e[3], 0); let r = Math.random() * tot, e = enc[0];
      for (const q of enc) { r -= q[3]; if (r <= 0) { e = q; break; } }
      const sp = SAUVAGE(e[0]); if (!SPECIES[sp]) continue;
      this.apparait(sp, [sp, e[1], e[2], 1], x, y);
      return;
    }
  }

  herbeLibre(m, x, y) {
    const t = m.get(x, y);
    return (t === T.TALL || t === T.DARKTALL) && !this.at(x, y) && !this.game.occupied?.(x, y) && !(this.game.player.x === x && this.game.player.y === y);
  }

  apparait(sp, e, x, y) {
    const g = this.game, id = 'herbe:' + (++this.seq);
    const img = new Image();
    img.onload = () => {
      if (g.mapObj?.outdoor !== true || this.herbe.length >= MAX_HERBE || !this.herbeLibre(g.mapObj, x, y)) return;
      const a = g.view.imageActor(id, img, 0.62);
      const f = { id, a, sp, e, x, y, ph: Math.random() * 6, fin: performance.now() + 9000 + Math.random() * 7000, saut: { fx: x, fy: y + 0.4, t0: performance.now() } };
      this.herbe.push(f);
      g.view.place(a, x, y, 0, true);
    };
    img.src = ASSETS.icon(sp);
  }

  /** un Pokémon tombe du plafond : une ombre grossit au-dessus du joueur, puis le combat */
  async embuscade() {
    const g = this.game; g.busy = true;
    try {
      g.sound.sfx('chauves'); g.view.shake = 0.15;
      this.grotte?.ombre(700);
      await new Promise((r) => setTimeout(r, 700));
      g.sound.sfx('hit'); g.view.shake = 0.3;
      await g.ui.say('Un Pokémon sauvage tombe du plafond !', { auto: 900 });
    } finally { g.busy = false; }
  }

  /* ---------- grottes ---------- */
  grotteAmbiance(on) {
    if (on && !this.grotte) this.grotte = new AmbianceGrotte(this.game);
    if (!on && this.grotte) { this.grotte.stop(); this.grotte = null; }
  }
}

const WALK_GROTTE = new Set([T.CAVE, T.FLOOR, T.STAIRS, T.BRIDGE, T.PATH, T.SAND]);
/** couche d'ambiance des grottes, dessinée par-dessus le décor (au-dessous des fenêtres du jeu) */
class AmbianceGrotte {
  constructor(game) {
    this.game = game;
    const host = game.view.renderer?.domElement;
    const c = this.c = document.createElement('canvas'); c.className = 'ow-grotte';
    if (host?.parentNode) host.insertAdjacentElement('afterend', c); else document.body.appendChild(c);
    this.gouttes = []; this.poussiere = []; this.cristaux = []; this.chauves = [];
    this.tGoutte = 1; this.tChauve = 6 + Math.random() * 8; this.dernier = null; this.tGronde = 25 + Math.random() * 30; this.cailloux = []; this.ombreFin = 0;
    for (let i = 0; i < 26; i++) this.poussiere.push({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, ph: Math.random() * 6 });
  }
  stop() { this.c.remove(); }
  ombre(ms) { this.ombreT0 = performance.now(); this.ombreFin = this.ombreT0 + ms; }
  /** point de la carte (cases, h pixels du jeu au-dessus du sol) → pixel du jeu dans la couche, ou null hors de l'écran */
  vers(wx, wy, h = 0) {
    const q = this.game.view.screenPos(wx - 0.5, wy - 0.55, h); if (!q) return null;
    return [Math.round((q.left - this.r.left) / this.gp), Math.round((q.top - this.r.top) / this.gp)];
  }
  tick(dt) {
    // la couche est dessinée en pixels du jeu (agrandie sans lissage, comme le décor) et ses points tiennent à la carte :
    // un cristal brille sur une paroi, la poussière et les gouttes restent où elles sont quand on marche
    const g = this.game, c = this.c, v = g.view, m = g.mapObj;
    const gp = this.gp = Math.max(1, Math.round(v.pixelJeu?.() || 3)), r = this.r = c.getBoundingClientRect();
    const W = Math.ceil((c.clientWidth || innerWidth) / gp), H = Math.ceil((c.clientHeight || innerHeight) / gp);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d'); x.clearRect(0, 0, W, H);
    // pas d'ambiance par-dessus un combat ou un écran plein cadre
    if (g.bv?.alive || g.ui.root.querySelector('.screen')) return;
    const t = performance.now() / 1000, p = g.player, px = p.x, py = p.y;
    const hh = (a, b, s) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const sol = (a, b) => m.in(a, b) && WALK_GROTTE.has(m.get(a, b));
    // cristaux : une paroi sur vingt-cinq, au bord du sol, porte un éclat qui s'allume et s'éteint (croix de quelques pixels)
    for (let b = py - 8; b <= py + 8; b++) for (let a = px - 13; a <= px + 13; a++) {
      if (hh(a, b, 11) > 0.04 || !m.in(a, b) || sol(a, b) || !sol(a, b + 1)) continue;
      const al = Math.max(0, Math.sin(t * 1.3 + hh(a, b, 5) * 6.28)) ** 6; if (al < 0.08) continue;
      const q = this.vers(a + 0.2 + hh(a, b, 3) * 0.6, b + 0.95, 6 + hh(a, b, 4) * 10); if (!q) continue;
      const rr = al > 0.7 ? 2 : 1;
      x.globalAlpha = al; x.fillStyle = ['#9be7ff', '#c4a8ff', '#a8ffd8'][Math.floor(hh(a, b, 2) * 3)];
      x.fillRect(q[0] - rr, q[1], 2 * rr + 1, 1); x.fillRect(q[0], q[1] - rr, 1, 2 * rr + 1);
      x.fillStyle = '#ffffff'; x.fillRect(q[0], q[1], 1, 1);
    }
    // poussière : un pixel clair qui monte lentement, au-dessus du sol seulement
    x.fillStyle = '#ffe9c4';
    for (const d of this.poussiere) {
      d.h = (d.h ?? d.y * 40) + d.v * 900 * dt; if (d.h > 44) { d.h = 0; d.x = Math.random(); d.y = Math.random(); }
      const wx = px + 0.5 + ((d.x * 26 - px) % 26 + 26) % 26 - 13, wy = py + 0.5 + ((d.y * 18 - py) % 18 + 18) % 18 - 9;
      if (!sol(Math.floor(wx), Math.floor(wy))) continue;
      const q = this.vers(wx + Math.sin(t * 0.7 + d.ph) * 0.08, wy, d.h); if (!q) continue;
      x.globalAlpha = (0.25 + 0.2 * Math.sin(t * 2 + d.ph)) * Math.min(1, d.h / 6, (44 - d.h) / 6); x.fillRect(q[0], q[1], 1, 1);
    }
    // gouttes qui tombent du plafond sur le sol, avec un petit plic
    this.tGoutte -= dt;
    if (this.tGoutte <= 0) {
      this.tGoutte = 0.5 + Math.random() * 1.4;
      const a = px + Math.round((Math.random() * 2 - 1) * 10), b = py + Math.round((Math.random() * 2 - 1) * 6);
      if (sol(a, b)) this.gouttes.push({ wx: a + 0.2 + Math.random() * 0.6, wy: b + 0.3 + Math.random() * 0.5, h: 150, v: 0, plic: 0 });
    }
    x.fillStyle = '#9fd4ff';
    for (const d of this.gouttes) {
      if (d.plic) {
        d.plic += dt; const q = this.vers(d.wx, d.wy, 0); if (!q) continue;
        const e = 1 + Math.floor(d.plic * 10);
        x.globalAlpha = Math.max(0, 0.7 - d.plic * 1.75); x.fillRect(q[0] - e, q[1], 1, 1); x.fillRect(q[0] + e, q[1], 1, 1); if (e > 1) { x.fillRect(q[0] - e + 1, q[1] - 1, 1, 1); x.fillRect(q[0] + e - 1, q[1] - 1, 1, 1); }
        continue;
      }
      d.v += 420 * dt; d.h -= d.v * dt;
      const q = this.vers(d.wx, d.wy, Math.max(0, d.h));
      if (q) { x.globalAlpha = 0.85; x.fillRect(q[0], q[1] - 3, 1, 3); }
      if (d.h <= 0) { d.plic = 0.001; if (q && Math.random() < 0.35) g.sound.sfx('goutte'); }
    }
    this.gouttes = this.gouttes.filter((d) => !d.plic || d.plic < 0.4);
    // chauves-souris : un vol dérangé de temps en temps (plus souvent quand on marche), silhouettes de quelques pixels
    this.tChauve -= dt * (g.player.move ? 1.6 : 1);
    if (this.tChauve <= 0) {
      this.tChauve = 9 + Math.random() * 12;
      const gauche = Math.random() < 0.5, y0 = H * (0.1 + Math.random() * 0.4);
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.chauves.push({ x: gauche ? -10 - i * 14 : W + 10 + i * 14, y: y0 + (Math.random() - 0.5) * 26, vx: (gauche ? 1 : -1) * (90 + Math.random() * 40), ph: Math.random() * 6 });
      g.sound.sfx('chauves');
    }
    x.fillStyle = '#0a0612'; x.globalAlpha = 0.9;
    for (const b of this.chauves) {
      b.x += b.vx * dt; b.y += Math.sin(t * 6 + b.ph) * 13 * dt;
      const bx = Math.round(b.x), by = Math.round(b.y), haut = Math.sin(t * 22 + b.ph) > 0;
      x.fillRect(bx - 1, by, 3, 2);
      if (haut) { x.fillRect(bx - 4, by - 2, 3, 1); x.fillRect(bx + 2, by - 2, 3, 1); x.fillRect(bx - 5, by - 1, 4, 1); x.fillRect(bx + 2, by - 1, 4, 1); }
      else { x.fillRect(bx - 5, by + 1, 4, 1); x.fillRect(bx + 2, by + 1, 4, 1); x.fillRect(bx - 4, by + 2, 2, 1); x.fillRect(bx + 3, by + 2, 2, 1); }
    }
    this.chauves = this.chauves.filter((b) => b.x > -130 && b.x < W + 130);
    // la roche gronde : l'écran tremble et des cailloux tombent du plafond
    this.tGronde -= dt;
    if (this.tGronde <= 0 && !g.busy) {
      this.tGronde = 35 + Math.random() * 40;
      g.view.shake = 0.35; g.sound.sfx('hitstrong');
      for (let i = 0; i < 18; i++) this.cailloux.push({ x: Math.random() * W, y: -4 - Math.random() * 40, v: 35 + Math.random() * 70, s: 1 + Math.floor(Math.random() * 2) });
    }
    x.fillStyle = '#6b6370';
    for (const k of this.cailloux) { k.v += 270 * dt; k.y += k.v * dt; x.globalAlpha = 0.9; x.fillRect(Math.round(k.x), Math.round(k.y), k.s, k.s); }
    this.cailloux = this.cailloux.filter((k) => k.y < H + 8);
    // l'ombre d'un Pokémon qui va tomber du plafond, sur le joueur : une tache tramée qui grandit
    if (performance.now() < this.ombreFin) {
      const u = (performance.now() - this.ombreT0) / (this.ombreFin - this.ombreT0), q = this.vers(g.player.x + 0.5, g.player.y + 0.55, 0);
      if (q) { const rx = Math.round(3 + u * 8), ry = Math.round(1 + u * 3); x.globalAlpha = 0.3 + u * 0.4; x.fillStyle = '#000';
        for (let j = -ry; j <= ry; j++) { const l = Math.round(rx * Math.sqrt(1 - (j * j) / ((ry + 0.5) * (ry + 0.5)))); x.fillRect(q[0] - l, q[1] + j, 2 * l + 1, 1); } }
    }
    x.globalAlpha = 1;
  }
}
