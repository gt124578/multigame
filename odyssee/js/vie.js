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

/** couche d'ambiance des grottes, dessinée par-dessus le décor (au-dessous des fenêtres du jeu) */
class AmbianceGrotte {
  constructor(game) {
    this.game = game;
    const host = game.view.renderer?.domElement;
    const c = this.c = document.createElement('canvas'); c.className = 'ow-grotte';
    if (host?.parentNode) host.insertAdjacentElement('afterend', c); else document.body.appendChild(c);
    this.gouttes = []; this.poussiere = []; this.cristaux = []; this.chauves = [];
    this.tGoutte = 1; this.tChauve = 6 + Math.random() * 8; this.dernier = null; this.tGronde = 25 + Math.random() * 30; this.cailloux = []; this.ombreFin = 0;
    for (let i = 0; i < 40; i++) this.poussiere.push({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, ph: Math.random() * 6 });
    for (let i = 0; i < 14; i++) this.cristaux.push({ x: Math.random(), y: Math.random() * 0.9, ph: Math.random() * 6, col: ['#9be7ff', '#c4a8ff', '#a8ffd8'][i % 3] });
  }
  stop() { this.c.remove(); }
  ombre(ms) { this.ombreT0 = performance.now(); this.ombreFin = this.ombreT0 + ms; }
  tick(dt) {
    const g = this.game, c = this.c, W = c.clientWidth || innerWidth, H = c.clientHeight || innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d'); x.clearRect(0, 0, W, H);
    // pas d'ambiance par-dessus un combat ou un écran plein cadre
    if (g.bv?.alive || g.ui.root.querySelector('.screen')) return;
    const t = performance.now() / 1000;
    // cristaux : petites étoiles qui s'allument et s'éteignent
    for (const k of this.cristaux) {
      const a = Math.max(0, Math.sin(t * 1.3 + k.ph)) ** 6; if (a < 0.05) continue;
      const cx = k.x * W, cy = k.y * H, r = 4 + a * 9;
      x.globalAlpha = a * 0.5; x.fillStyle = k.col; x.beginPath(); x.arc(cx, cy, r * 0.6, 0, 7); x.fill();
      x.globalAlpha = a; x.strokeStyle = '#ffffff'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r); x.stroke();
    }
    // poussière qui flotte dans la lumière
    x.fillStyle = '#ffe9c4';
    for (const d of this.poussiere) {
      d.y -= d.v * dt; d.x += Math.sin(t * 0.7 + d.ph) * 0.0006; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      x.globalAlpha = 0.3 + 0.2 * Math.sin(t * 2 + d.ph); x.fillRect(d.x * W, d.y * H, 3, 3);
    }
    // gouttes qui tombent du plafond, avec un petit plic
    this.tGoutte -= dt;
    if (this.tGoutte <= 0) { this.tGoutte = 0.35 + Math.random() * 1.1; this.gouttes.push({ x: Math.random() * W, y: Math.random() * H * 0.3, v: 0, fin: H * (0.45 + Math.random() * 0.5), plic: 0 }); }
    x.fillStyle = '#9fd4ff';
    for (const d of this.gouttes) {
      if (d.plic) { d.plic += dt; x.globalAlpha = Math.max(0, 0.6 - d.plic * 1.5); x.strokeStyle = '#9fd4ff'; x.lineWidth = 1;
        x.beginPath(); x.ellipse(d.x, d.fin, 3 + d.plic * 22, 1 + d.plic * 6, 0, 0, 7); x.stroke(); continue; }
      d.v += 900 * dt; d.y += d.v * dt;
      x.globalAlpha = 0.85; x.fillRect(d.x, d.y - 8, 3, 10);
      if (d.y >= d.fin) { d.plic = 0.001; if (Math.random() < 0.35) g.sound.sfx('goutte'); }
    }
    this.gouttes = this.gouttes.filter((d) => !d.plic || d.plic < 0.4);
    // chauves-souris : un vol dérangé de temps en temps (plus souvent quand on marche)
    this.tChauve -= dt * (g.player.move ? 1.6 : 1);
    if (this.tChauve <= 0) {
      this.tChauve = 9 + Math.random() * 12;
      const gauche = Math.random() < 0.5, y0 = H * (0.1 + Math.random() * 0.4);
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.chauves.push({ x: gauche ? -30 - i * 40 : W + 30 + i * 40, y: y0 + (Math.random() - 0.5) * 80, vx: (gauche ? 1 : -1) * (260 + Math.random() * 120), ph: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
      g.sound.sfx('chauves');
    }
    x.fillStyle = '#0a0612'; x.shadowColor = 'rgba(180,160,255,.35)'; x.shadowBlur = 6;
    for (const b of this.chauves) {
      b.x += b.vx * dt; b.y += Math.sin(t * 6 + b.ph) * 40 * dt;
      const ail = Math.sin(t * 22 + b.ph) * 11 * b.s, s = 14 * b.s;
      x.globalAlpha = 0.85; x.beginPath();
      x.moveTo(b.x, b.y); x.quadraticCurveTo(b.x - s, b.y - ail - 3, b.x - s * 1.8, b.y - ail * 0.6); x.quadraticCurveTo(b.x - s * 0.8, b.y + 1, b.x, b.y + 3);
      x.quadraticCurveTo(b.x + s * 0.8, b.y + 1, b.x + s * 1.8, b.y - ail * 0.6); x.quadraticCurveTo(b.x + s, b.y - ail - 3, b.x, b.y); x.fill();
    }
    x.shadowBlur = 0;
    this.chauves = this.chauves.filter((b) => b.x > -400 && b.x < W + 400);
    // la roche gronde : l'écran tremble et des cailloux tombent du plafond
    this.tGronde -= dt;
    if (this.tGronde <= 0 && !g.busy) {
      this.tGronde = 35 + Math.random() * 40;
      g.view.shake = 0.35; g.sound.sfx('hitstrong');
      for (let i = 0; i < 18; i++) this.cailloux.push({ x: Math.random() * W, y: -10 - Math.random() * 120, v: 100 + Math.random() * 200, s: 2 + Math.random() * 4 });
    }
    x.fillStyle = '#6b6370';
    for (const k of this.cailloux) { k.v += 800 * dt; k.y += k.v * dt; x.globalAlpha = 0.9; x.fillRect(k.x, k.y, k.s, k.s); }
    this.cailloux = this.cailloux.filter((k) => k.y < H + 20);
    // l'ombre d'un Pokémon qui va tomber du plafond, sur le joueur
    if (performance.now() < this.ombreFin) {
      const u = (performance.now() - this.ombreT0) / (this.ombreFin - this.ombreT0), q = g.view.screenPos(g.player.x, g.player.y, 0);
      if (q) { const r = c.getBoundingClientRect(); x.globalAlpha = 0.25 + u * 0.4; x.fillStyle = '#000'; x.beginPath(); x.ellipse(q.left - r.left, q.top - r.top, 6 + u * 22, 3 + u * 9, 0, 0, 7); x.fill(); }
    }
    x.globalAlpha = 1;
  }
}
