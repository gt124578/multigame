// odyssee/js/ui/battleView.js — scène de combat façon HeartGold/SoulSilver : décor pixel-art, socles, sprites, effets, HUD Nano Banana
import { shadowCanvas } from '../render/shadow.js';
import { el, esc, wait } from './ui.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { monName, expProgress } from '../core/mon.js';
import { ITEMS, canUseOn, itemName } from '../core/items.js';
import { ASSETS, loadImg } from '../assets.js';
import { TYPE_COL, TYPE_FR, STATUS_FR, hpCol, partyScreen, bagScreen } from './screens.js';
import { typeEff } from '../core/battle.js';
import { moveDesc } from '../data/moveDescriptions.js';

const BH = 192;
const TYPE_FX = {
  normal: ['#ffffff', '#f0f0d0'], fighting: ['#ffffff', '#f06040'], flying: ['#ffffff', '#c8d8ff'], poison: ['#b050c8', '#e090f0'], ground: ['#c8a050', '#8a6a30'],
  rock: ['#b0a080', '#706050'], bug: ['#a8c830', '#e0f080'], ghost: ['#705898', '#302040'], steel: ['#e0e0f0', '#a0a0b8'], fire: ['#ff9030', '#ffe060'],
  water: ['#58a0ff', '#c0e0ff'], grass: ['#58c040', '#b0f080'], electric: ['#ffe040', '#ffffff'], psychic: ['#ff70b0', '#ffc0e0'], ice: ['#a0e8ff', '#ffffff'],
  dragon: ['#7050f0', '#c0a0ff'], dark: ['#403030', '#a08070'], fairy: ['#ff9ad0', '#ffe0f0'],
};
const BALL_COL = { 'poke-ball': ['#e83838', '#f4f4f4'], 'great-ball': ['#3870e8', '#f4f4f4'], 'ultra-ball': ['#303030', '#f0c830'], 'master-ball': ['#8a3ac8', '#f4f4f4'], 'gs-ball': ['#d8a830', '#c8c8d0'] };
const BALL_SPRITE_PATHS = {
  'poke-ball': 'img/battle/poke_ball_32.png',
  'great-ball': 'img/battle/great_ball_32.png',
  'ultra-ball': 'img/battle/ultra_ball_32.png',
  'open': 'img/battle/poke_ball_open.png',
  'tilt-l': 'img/battle/poke_ball_tilt_l.png',
  'tilt-r': 'img/battle/poke_ball_tilt_r.png',
};

function tinted(img, color) {
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const ease = (t) => t * t * (3 - 2 * t);

const BOOST_NAMES = ['Atq', 'Déf', 'Atq Spé', 'Déf Spé', 'Vit', 'Préc', 'Esq'];

export class BattleView {
  constructor(game) { this.game = game; this.ui = game.ui; this.sound = game.sound; }

  /* ---------------- décor ---------------- */
  makeBg(kind, night) {
    const W = this.W, c = document.createElement('canvas'); c.width = W; c.height = BH; const x = c.getContext('2d');
    const grad = (y0, y1, a, b) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, y0, W, y1 - y0); };
    const stripes = (y0, y1, col, gap = 6) => { x.fillStyle = col; for (let y = y0; y < y1; y += gap) x.fillRect(0, y, W, 1); };
    if (kind === 'lab') {
      // labo du professeur : mur clair, bibliothèques, fenêtre bleue et carrelage blanc
      grad(0, 84, '#cfe0ee', '#eef4fa');
      x.fillStyle = '#7fb4e0'; x.fillRect(W * 0.36, 10, W * 0.28, 34); x.fillStyle = '#b8daf4'; x.fillRect(W * 0.36 + 3, 13, W * 0.28 - 6, 28);
      x.fillStyle = '#ffffff'; x.fillRect(W * 0.5 - 1, 13, 2, 28); x.fillRect(W * 0.36 + 3, 26, W * 0.28 - 6, 2);
      const books = ['#c04848', '#4870c0', '#48a060', '#d0a040', '#8058b0', '#e07848'];
      for (const bx0 of [8, W * 0.68]) {
        const bw = W * 0.26;
        x.fillStyle = '#6a4a30'; x.fillRect(bx0, 20, bw, 64); x.fillStyle = '#8a6440'; x.fillRect(bx0 + 2, 22, bw - 4, 60);
        for (const sy of [24, 44, 64]) { x.fillStyle = '#5a3c26'; x.fillRect(bx0 + 2, sy + 17, bw - 4, 2); for (let k = 0, bx = bx0 + 4; bx < bx0 + bw - 6; k++) { const w = 3 + ((k * 7 + sy) % 3); x.fillStyle = books[(k + sy) % books.length]; x.fillRect(bx, sy + 2 + ((k * 5) % 4), w, 15 - ((k * 5) % 4)); bx += w + 1; } }
      }
      x.fillStyle = '#b8c4d0'; x.fillRect(0, 84, W, 2);
      grad(86, BH, '#e6ecf2', '#fbfcfe');
      x.fillStyle = 'rgba(120,140,170,0.18)'; for (let i = 0; i < W; i += 16) x.fillRect(i, 86, 1, BH - 86); for (let y = 92; y < BH; y += 12) x.fillRect(0, y, W, 1);
    } else if (kind === 'cave') {
      grad(0, BH, '#3a2e26', '#6a5440');
      x.fillStyle = '#2a201a'; for (let i = 0; i < 9; i++) { const bx = (i * 53) % W, bw = 40 + (i * 17) % 30; x.beginPath(); x.moveTo(bx, 0); x.lineTo(bx + bw / 2, 30 + (i * 13) % 25); x.lineTo(bx + bw, 0); x.fill(); }
      stripes(110, BH, 'rgba(0,0,0,0.12)', 5);
    } else if (kind === 'indoor' || kind === 'gym' || kind === 'gym_rock' || kind === 'league' || kind === 'city' || kind === 'village') {
      const [a, b, f1, f2] = kind === 'league' ? ['#3a2c60', '#6a54a0', '#8a78c0', '#b0a0e0'] : kind === 'gym' ? ['#505868', '#8890a8', '#b8c0d0', '#e0e4ee'] : ['#c8b090', '#e0d0b0', '#e8dcc4', '#f6eee0'];
      grad(0, 80, a, b); grad(80, BH, f1, f2);
      x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < W; i += 24) x.fillRect(i, 80, 1, BH - 80);
      stripes(84, BH, 'rgba(0,0,0,0.06)', 8);
    } else if (kind === 'water') {
      grad(0, 70, night ? '#182850' : '#88c8f8', night ? '#304078' : '#d8f0ff');
      grad(70, 120, '#3878d0', '#58a0e8'); stripes(72, 120, 'rgba(255,255,255,0.35)', 7);
      grad(120, BH, '#f0dca0', '#e0c880'); stripes(122, BH, 'rgba(160,120,60,0.15)', 6);
    } else if (kind === 'snow') {
      grad(0, 74, night ? '#1a2450' : '#a8c8e8', night ? '#3a4a88' : '#eef6ff');
      x.fillStyle = night ? '#5a6a98' : '#c8d8ec'; x.beginPath(); x.moveTo(0, 74); x.lineTo(W * 0.18, 30); x.lineTo(W * 0.34, 74); x.lineTo(W * 0.5, 40); x.lineTo(W * 0.7, 74); x.lineTo(W * 0.85, 26); x.lineTo(W, 74); x.fill();
      x.fillStyle = '#ffffff'; for (const [a1, b1] of [[0.18, 30], [0.5, 40], [0.85, 26]]) { x.beginPath(); x.moveTo(W * a1 - 10, b1 + 12); x.lineTo(W * a1, b1); x.lineTo(W * a1 + 10, b1 + 12); x.fill(); }
      grad(74, BH, '#f4f8fc', '#d0deec'); stripes(76, BH, 'rgba(120,150,190,0.12)', 6);
    } else if (kind === 'volcanic') {
      grad(0, 80, '#70384a', '#e0906a'); x.fillStyle = '#4a3a40'; x.beginPath(); x.moveTo(W * 0.55, 80); x.lineTo(W * 0.72, 22); x.lineTo(W * 0.78, 24); x.lineTo(W * 0.95, 80); x.fill();
      grad(80, BH, '#9a8e88', '#7a706c'); stripes(82, BH, 'rgba(0,0,0,0.08)', 6);
    } else {
      grad(0, 74, night ? '#1a2450' : '#80c8f8', night ? '#3a4a88' : '#e0f6ff');
      if (night) { x.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % W, (i * 31) % 60, 1, 1); }
      else { x.fillStyle = 'rgba(255,255,255,0.85)'; for (const [cx, cy, r] of [[W * 0.15, 22, 10], [W * 0.2, 20, 13], [W * 0.27, 23, 9], [W * 0.66, 14, 9], [W * 0.71, 12, 12]]) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } }
      x.fillStyle = night ? '#2a5a48' : '#78b878'; x.beginPath(); x.moveTo(0, 74); for (let i = 0; i <= W; i += 8) x.lineTo(i, 60 + Math.sin(i * 0.035) * 8 + Math.sin(i * 0.11) * 3); x.lineTo(W, 74); x.fill();
      x.fillStyle = night ? '#1e4a34' : '#4a9858'; for (let i = -10; i < W; i += 11) { x.beginPath(); x.arc(i, 74, 9 + (i * 7) % 5, Math.PI, 0); x.fill(); }
      grad(74, BH, night ? '#3a7048' : '#a0e078', night ? '#2a5a38' : '#68c050'); stripes(76, BH, night ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.18)', 6);
    }
    return c;
  }
  drawPlatform(x, cx, cy, rx, ry, kind) {
    const cols = kind === 'cave' || kind === 'gym_rock' ? ['#4a3a2c', '#8a7258', '#a08a6c'] : kind === 'indoor' || kind === 'gym' || kind === 'league' || kind === 'city' ? ['#9098a8', '#d8dce8', '#f2f4f8'] : kind === 'water' ? ['#c0a060', '#f0dca0', '#fbecc0'] : kind === 'volcanic' ? ['#5a5250', '#8a8280', '#a8a09c'] : kind === 'snow' ? ['#a0b4cc', '#dce8f4', '#ffffff'] : ['#3c8a3c', '#6cc458', '#90dc78'];
    x.fillStyle = cols[0]; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
    x.fillStyle = cols[1]; x.beginPath(); x.ellipse(cx, cy - 2, rx - 3, ry - 3, 0, 0, 7); x.fill();
    x.fillStyle = cols[2]; x.beginPath(); x.ellipse(cx - rx * 0.15, cy - 4, rx * 0.55, ry * 0.4, 0, 0, 7); x.fill();
  }
  async loadBattleDecor(kind, night) {
    const bgMap = {
      cave: 'bg_cave',
      gym: 'bg_gym',
      gym_rock: 'bg_gym_rock',
      league: 'bg_league',
      indoor: 'bg_indoor',
      city: 'bg_city',
      village: 'bg_village',
      water: night ? 'bg_water_night' : 'bg_water',
      snow: night ? 'bg_snow_night' : 'bg_snow',
      volcanic: 'bg_volcanic',
    };
    // décors dessinés dans le code (pas d'image) : le labo du professeur
    const drawn = kind === 'lab';
    const bgKey = bgMap[kind] || (night ? 'bg_grass_night' : 'bg_grass');
    const platMap = {
      cave: 'cave',
      gym: 'stone',
      gym_rock: 'cave',
      league: 'stone',
      indoor: 'stone',
      lab: 'stone',
      city: 'stone',
      village: 'grass',
      water: 'water',
      snow: 'snow',
      volcanic: 'volcanic',
    };
    const platKey = platMap[kind] || (this.battle?.wild ? 'tallgrass' : 'grass');
    const ballPromises = Object.entries(BALL_SPRITE_PATHS).map(async ([k, p]) => [k, await loadImg(p)]);
    const [bgImg, platE, platP, ...ballEntries] = await Promise.all([
      drawn ? Promise.resolve(null) : loadImg(`img/battle/${bgKey}.png`),
      loadImg(`img/battle/plat_${platKey}_e.png`),
      loadImg(`img/battle/plat_${platKey}_p.png`),
      ...ballPromises,
    ]);
    this.bgImg = bgImg;
    this.platE = platE;
    this.platP = platP;
    this.ballImgs = Object.fromEntries(ballEntries);
  }

  /* ---------------- boucle d'animation ---------------- */
  frame = () => {
    if (!this.alive) return;
    const x = this.ctx, W = this.W, s = this.st;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, W, BH);
    x.save(); x.translate(Math.round(s.shakeX), Math.round(s.shakeY));
    if (this.bgImg) x.drawImage(this.bgImg, 0, 0, W, BH);
    else x.drawImage(this.bg, 0, 0);
    const eP = this.ePos(), pP = this.pPos();
    if (this.platE) {
      x.drawImage(this.platE, Math.round(eP.x + s.eSlide - this.platE.width / 2), Math.round(eP.y - this.platE.height * 0.52));
    } else {
      this.drawPlatform(x, eP.x + s.eSlide, eP.y, 58, 13, this.kind);
    }
    if (this.platP) {
      x.drawImage(this.platP, Math.round(pP.x + s.pSlide - this.platP.width / 2), Math.round(pP.y - this.platP.height * 0.48));
    } else {
      this.drawPlatform(x, pP.x + s.pSlide, pP.y, 76, 17, this.kind);
    }
    // ombres
    x.fillStyle = 'rgba(0,0,0,0.26)';
    if (s.foe.visible && s.foe.scale > 0.3) { x.beginPath(); x.ellipse(eP.x + s.eSlide + s.foe.dx, eP.y - 1, 28 * s.foe.scale, 6, 0, 0, 7); x.fill(); }
    if (s.me.visible && s.me.scale > 0.3) { x.beginPath(); x.ellipse(pP.x + s.pSlide + s.me.dx, pP.y + 4, 34 * s.me.scale, 7, 0, 0, 7); x.fill(); }
    const bob = Math.sin(performance.now() * 0.0045) * 1.2;
    const drawSpr = (o, cx, cy, idleBob = 0) => {
      if (!o.visible || !o.img) return;
      if (o.blink && Math.floor(performance.now() / 70) % 2) return;
      let img = o.img;
      if (o.white > 0.01) img = o.whiteImg || (o.whiteImg = tinted(o.img, '#ffffff'));
      if (o.dark) img = o.darkImg || (o.darkImg = tinted(o.img, '#203048'));
      const w = img.width * o.scale, h = img.height * o.scale;
      const dy = o.dy + (o.dy === 0 && o.scale === 1 ? idleBob : 0);
      x.save(); x.globalAlpha = o.alpha;
      if (o.clipY != null) { x.beginPath(); x.rect(0, 0, W, cy + o.clipY); x.clip(); }
      x.drawImage(img, Math.round(cx - w / 2 + o.dx), Math.round(cy - h + dy), Math.round(w), Math.round(h));
      if (o.white > 0.01 && o.white < 1 && o.img) { x.globalAlpha = o.alpha * (1 - o.white); x.drawImage(o.img, Math.round(cx - w / 2 + o.dx), Math.round(cy - h + dy), Math.round(w), Math.round(h)); }
      x.restore();
    };
    drawSpr(s.trainer, eP.x + s.eSlide, eP.y + 6, 0);
    drawSpr(s.foe, eP.x + s.eSlide, eP.y + 8, bob);
    drawSpr(s.me, pP.x + s.pSlide, pP.y + 18, -bob * 0.8);
    // balls
    for (const b of s.balls) this.drawBall(x, b);
    // particules
    for (const p of s.parts) {
      x.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      x.fillStyle = p.c;
      if (p.shape === 'ring') { x.strokeStyle = p.c; x.lineWidth = 2; x.beginPath(); x.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, 7); x.stroke(); }
      else if (p.shape === 'bolt') { x.strokeStyle = p.c; x.lineWidth = 2; x.beginPath(); x.moveTo(p.x, p.y); for (let k = 1; k < 5; k++) x.lineTo(p.x + (Math.random() - 0.5) * 10, p.y + k * 7); x.stroke(); }
      else if (p.shape === 'tornado') {
        x.save();
        x.strokeStyle = p.c;
        x.lineWidth = p.lw || 2;
        x.beginPath();
        x.ellipse(p.x, p.y, Math.max(1, p.r), Math.max(1, p.r * 0.32), p.tilt || 0, 0, Math.PI * 2);
        x.stroke();
        x.restore();
      }
      else if (p.shape === 'leaf') { x.save(); x.translate(p.x, p.y); x.rotate(p.a || 0); x.fillRect(-3, -1, 6, 3); x.restore(); }
      else if (p.shape === 'slash') {
        x.save(); x.strokeStyle = p.c; x.lineWidth = p.lw || 2.5;
        x.beginPath();
        const len = p.len || 16, ang = p.ang != null ? p.ang : (Math.PI / 4);
        x.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
        x.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
        x.stroke();
        x.restore();
      }
      else if (p.shape === 'crystal') {
        x.save(); x.translate(p.x, p.y); x.rotate(p.a || 0);
        x.fillStyle = p.c;
        const cs = p.r || 3;
        x.beginPath(); x.moveTo(0, -cs); x.lineTo(cs * 0.7, 0); x.lineTo(0, cs); x.lineTo(-cs * 0.7, 0); x.closePath();
        x.fill();
        x.restore();
      }
      else if (p.shape === 'flame') {
        x.save(); x.translate(p.x, p.y);
        x.fillStyle = p.c;
        x.beginPath(); x.arc(0, 0, Math.max(1, p.r), 0, Math.PI * 2); x.fill();
        x.restore();
      }
      else x.fillRect(Math.round(p.x - p.r), Math.round(p.y - p.r), Math.max(1, Math.round(p.r * 2)), Math.max(1, Math.round(p.r * 2)));
      x.globalAlpha = 1;
    }
    x.restore();
    if (s.screenFlash > 0) { x.fillStyle = `rgba(255,255,255,${s.screenFlash})`; x.fillRect(0, 0, W, BH); }
    if (s.wipe > 0) { x.fillStyle = '#000'; const h = BH / 2 * s.wipe; x.fillRect(0, 0, W, h); x.fillRect(0, BH - h, W, h); }
    // mise à jour des particules
    const dt = 1 / 60;
    for (const p of s.parts) {
      if (p.spiral) {
        p.spiralAngle = (p.spiralAngle || 0) + (p.spiralSpd || 0.2);
        p.spiralR = (p.spiralR || 0) + (p.spiralRGrow || 0);
        p.x = p.cx + Math.cos(p.spiralAngle) * p.spiralR;
      } else {
        p.x += p.vx * dt * 60;
      }
      p.y += p.vy * dt * 60;
      p.vy += (p.g || 0);
      p.life -= dt;
      if (p.grow) p.r += p.grow;
      if (p.a != null) p.a += (p.va != null ? p.va : 0.2);
    }
    s.parts = s.parts.filter((p) => p.life > 0);
    requestAnimationFrame(this.frame);
  };
  drawBall(x, b) {
    const itemKey = b.item || 'poke-ball';
    // les images inclinée / ouverte n'existent que pour la Poké Ball : les autres Balls gardent leur dessin, penché
    const propre = itemKey === 'poke-ball';
    const imgKey = b.state && propre ? b.state : itemKey;
    const img = this.ballImgs?.[imgKey] || this.ballImgs?.[itemKey] || null;
    const penche = !propre && (b.state === 'tilt-l' ? -0.45 : b.state === 'tilt-r' ? 0.45 : 0);
    if (b.groundY != null && b.groundY > b.y) {
      const dist = Math.max(0, b.groundY - b.y);
      const alpha = Math.max(0.12, 0.45 - dist * 0.0035);
      const rx = Math.max(3, 8 - dist * 0.05);
      const ry = Math.max(1.5, rx * 0.4);
      x.save();
      x.fillStyle = `rgba(0,0,0,${alpha})`;
      x.beginPath();
      x.ellipse(Math.round(b.x), Math.round(b.groundY), rx, ry, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    x.save();
    x.translate(Math.round(b.x), Math.round(b.y));
    if (b.rot || penche) x.rotate((b.rot || 0) + penche);
    const size = 18;
    if (img) {
      x.imageSmoothingEnabled = false;
      x.drawImage(img, Math.round(-size / 2), Math.round(-size / 2), size, size);
    } else {
      const [top, bot] = BALL_COL[itemKey] || BALL_COL['poke-ball'];
      x.fillStyle = '#181e28'; x.beginPath(); x.arc(0, 0, 5.5, 0, 7); x.fill();
      x.fillStyle = top; x.beginPath(); x.arc(0, 0, 4.5, Math.PI, 0); x.fill();
      x.fillStyle = bot; x.beginPath(); x.arc(0, 0, 4.5, 0, Math.PI); x.fill();
      x.fillStyle = '#181e28'; x.fillRect(-5, -0.6, 10, 1.2);
      x.fillStyle = '#fff'; x.fillRect(-1.2, -1.2, 2.4, 2.4);
    }
    x.restore();
  }
  ePos() { return { x: Math.round(this.W * 0.71), y: 86 }; }
  pPos() { return { x: Math.round(this.W * 0.26), y: 140 }; }

  tween(ms, fn) { return new Promise((res) => { const t0 = performance.now(); const step = () => { const u = Math.min(1, (performance.now() - t0) / ms); fn(u); if (u < 1) requestAnimationFrame(step); else res(); }; step(); }); }
  burst(cx, cy, cols, n = 14, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 1.6) * (0.4 + Math.random());
      this.st.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - (o.up || 0), r: o.r || 1.5 + Math.random() * 1.5, c: cols[i % cols.length], life: o.life || 0.45, max: o.life || 0.45, g: o.g || 0, shape: o.shape });
    }
  }
  sprCenter(side) { const p = side === 1 ? this.ePos() : this.pPos(); return { x: p.x, y: p.y - (side === 1 ? 30 : 36) }; }

  /* ---------------- interface HTML ---------------- */
  buildDom() {
    const r = el('div', 'battle'); this.root = r;
    const cv = el('canvas', 'bcv'); cv.width = this.W; cv.height = BH; r.appendChild(cv);
    this.ctx = cv.getContext('2d');
    r.insertAdjacentHTML('beforeend', `
      <div class="bhud foe">
        <div class="bh-head">
          <div class="bh-balls"></div>
          <div class="bh-types"></div>
        </div>
        <div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div>
        <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
        <div class="bh-caught" title="Déjà capturé"></div>
        <div class="bh-boosts"></div>
      </div>
      <div class="bhud me">
        <div class="bh-head">
          <div class="bh-balls"></div>
          <div class="bh-types"></div>
        </div>
        <div class="bh-top"><span class="bh-name"></span><span class="bh-lv"></span></div>
        <div class="bh-mid"><span class="bh-st"></span><div class="bh-hp"><b>PV</b><i><u></u></i></div></div>
        <div class="bh-bot">
          <div class="bh-exp-wrap"><b>EXP</b><div class="bh-exp"><i><u></u></i></div></div>
          <div class="bh-hpn"></div>
        </div>
        <div class="bh-boosts"></div>
      </div>
      <div class="battle-weather-badge" style="display:none"></div>
      <div class="dlg box btext"><div class="dlg-name" style="display:none"></div><div class="dlg-txt"></div><div class="dlg-arrow">▼</div></div>
      <div class="bcmd"></div>`);
    this.game.ui.root.appendChild(r);
    this.hud = { foe: r.querySelector('.bhud.foe'), me: r.querySelector('.bhud.me') };
    this.textBox = r.querySelector('.btext'); this.cmd = r.querySelector('.bcmd');
    this.weatherBadge = r.querySelector('.battle-weather-badge');
  }
  updateWeather(w) {
    if (!this.weatherBadge) this.weatherBadge = this.root?.querySelector('.battle-weather-badge');
    if (!this.weatherBadge) return;
    if (!w || w === 'none') {
      this.weatherBadge.style.display = 'none';
      this.weatherBadge.className = 'battle-weather-badge';
      return;
    }
    const W_INFO = {
      rain: { icon: '🌧️', label: 'Pluie' },
      sun: { icon: '☀️', label: 'Zénith' },
      sandstorm: { icon: '🌪️', label: 'Sable' },
      hail: { icon: '❄️', label: 'Grêle' },
    };
    const info = W_INFO[w] || { icon: '⛅', label: w };
    this.weatherBadge.innerHTML = `<span class="bwb-icon">${info.icon}</span><span class="bwb-label">${info.label}</span>`;
    this.weatherBadge.className = `battle-weather-badge ${w}`;
    this.weatherBadge.style.display = 'flex';
  }
  renderPartyBalls(side) {
    const party = this.battle?.sides?.[side]?.party || [];
    if (side === 1 && this.battle?.wild) {
      return '<span class="bh-wild-tag">SAUVAGE</span>';
    }
    return [0, 1, 2, 3, 4, 5].map((idx) => {
      const p = party[idx];
      const st = !p ? 'empty' : p.hp <= 0 ? 'ko' : p.status ? 'status' : 'ok';
      return `<img class="bh-ball" src="img/battle/ball_${st}.png" alt="">`;
    }).join('');
  }
  /** crans de stats sous la jauge : « Atq +2 », « Vit −1 »… (verts en hausse, rouges en baisse) */
  showBoosts(side) {
    const h = side === 1 ? this.hud?.foe : this.hud?.me, box = h?.querySelector('.bh-boosts'); if (!box) return;
    const st = this.boosts?.[side] || [];
    box.innerHTML = BOOST_NAMES.map((n, k) => { const c = st[k + 1] || 0; return c ? `<span class="bh-boost ${c > 0 ? 'up' : 'down'}">${n} ${c > 0 ? '+' : '−'}${Math.abs(c)}</span>` : ''; }).join('');
  }
  setHud(side, m, hp) {
    if (m && hp == null) hp = m.hp;
    const h = side === 1 ? this.hud.foe : this.hud.me; if (!m) { h.style.visibility = 'hidden'; return; }
    if (side === 1 && !this.seenInBattle?.has(m.uid || m.sp)) {
      this.seenInBattle?.add(m.uid || m.sp);
      this.game.markSeen(m.sp);
    }
    h.style.visibility = '';
    const g = m.gender === 'm' ? '<span class="g m">♂</span>' : m.gender === 'f' ? '<span class="g f">♀</span>' : '';
    const trainerTag = this.spectator && this.battle?.sides?.[side]?.name
      ? `<span class="bh-trainer-tag">${esc(this.battle.sides[side].name)} :</span> `
      : '';
    h.querySelector('.bh-name').innerHTML = trainerTag + esc(monName(m)) + g;
    h.querySelector('.bh-lv').textContent = 'N.' + m.lvl;
    const typesEl = h.querySelector('.bh-types');
    if (typesEl) {
      const isKnown = side === 0 || this.game.isSpeciesKnown(m.sp);
      if (isKnown) {
        const spTypes = SPECIES[m.sp]?.t || ['normal'];
        typesEl.innerHTML = spTypes.map((t) => `<span class="bh-type" style="--tc:${TYPE_COL[t] || '#888'}">${TYPE_FR[t] || t}</span>`).join('');
      } else {
        const count = this.game.seenCount(m.sp);
        typesEl.innerHTML = `<span class="bh-type unknown" title="Type inconnu (vu ${count}/3 - capturez-le pour révéler)">???</span>`;
      }
    }
    const ballsEl = h.querySelector('.bh-balls');
    if (ballsEl) ballsEl.innerHTML = this.renderPartyBalls(side);
    const st = h.querySelector('.bh-st'); const S = m.hp > 0 && m.status ? STATUS_FR[m.status] : null; st.textContent = S ? S[0] : ''; st.style.background = S ? S[1] : 'transparent'; st.style.display = S ? '' : 'none';
    this.setHp(side, hp, m.stats[0]);
    if (side === 0) { h.querySelector('.bh-exp u').style.width = expProgress(m, this.game.levelCap()) * 100 + '%'; }
    if (side === 1) h.querySelector('.bh-caught').classList.toggle('on', this.game.state.dex.caught.includes(m.sp) && this.battle.wild);
  }
  setHp(side, hp, max) {
    const h = side === 1 ? this.hud.foe : this.hud.me, r = Math.max(0, hp / max);
    const u = h.querySelector('.bh-hp u'); u.style.width = r * 100 + '%'; u.style.background = hpCol(r);
    if (side === 0) h.querySelector('.bh-hpn').textContent = `${Math.max(0, Math.round(hp))} / ${max}`;
  }

  async msg(text, o = {}) {
    await this.ui.typePage(this.textBox, text, { auto: o.wait ? 0 : 750 });
  }

  /* ---------------- lancement ---------------- */
  async run(battle, o = {}) {
    this.battle = battle; this.kind = o.bg || 'grass'; this.alive = true;
    this.seenInBattle = new Set();
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.boosts = null; this.showBoosts(0); this.showBoosts(1);
    this.st = { shakeX: 0, shakeY: 0, eSlide: -this.W, pSlide: this.W, screenFlash: 0, wipe: 0, parts: [], balls: [],
      foe: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 }, me: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
      trainer: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 } };
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(battle.weather);
    this.setHud(1, null); this.setHud(0, null);
    // images
    const foeSide = battle.sides[1];
    await Promise.all([
      this.loadBattleDecor(this.kind, o.night),
      this.loadSide(1),
      this.loadSide(0),
    ]);
    if (foeSide.trainer) this.st.trainer.img = await loadImg(ASSETS.trainer(foeSide.trainer.bs));
    requestAnimationFrame(this.frame);
    // Ouverture cinématographique du rideau de combat
    if (o.curtain?.open) o.curtain.open();
    else if (o.curtain?.remove) o.curtain.remove();
    // intro : les socles glissent en place
    this.st.screenFlash = 0;
    if (battle.wild) { this.st.foe.visible = true; this.st.foe.dark = true; }
    else this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    if (battle.wild) { this.st.foe.dark = false; this.sound.cry(ASSETS.cry(battle.foe.sp)); this.setHud(1, battle.foe); }
    const evs = battle.start();
    await this.play(evs);
    // boucle de tours
    while (battle.state !== 'over') {
      if (battle.state === 'switch') { await this.forcedSwitch(); continue; }
      const action = await this.chooseAction();
      if (!action) continue;
      await this.play(battle.playerAction(action));
    }
    await wait(300);
    return battle.result;
  }

  /* ---------------- mode spectateur en direct ---------------- */
  async runSpectate(specSession, o = {}) {
    const p0 = specSession.p0, p1 = specSession.p1;
    const b = {
      pvp: true,
      spectator: true,
      state: 'choose',
      weather: specSession.weather || 'none',
      weatherTurns: specSession.weatherTurns || 0,
      turn: specSession.turn || 0,
      sides: [
        {
          name: p0.name,
          trainer: { cls: 'Dresseur', name: p0.name, bs: p0.bs || 'calem', prize: 0 },
          party: p0.party || [],
          active: p0.active ?? 0,
          v: { st: p0.st ? [...p0.st] : [0, 0, 0, 0, 0, 0, 0, 0] },
        },
        {
          name: p1.name,
          trainer: { cls: 'Dresseur', name: p1.name, bs: p1.bs || 'serena', prize: 0 },
          party: p1.party || [],
          active: p1.active ?? 0,
          v: { st: p1.st ? [...p1.st] : [0, 0, 0, 0, 0, 0, 0, 0] },
        },
      ],
      act(side) {
        const s = this.sides[side];
        return s?.party?.[s.active] || null;
      },
      get me() { return this.act(0); },
      get foe() { return this.act(1); },
      stages() {
        return [this.sides[0].v.st, this.sides[1].v.st];
      },
    };

    this.battle = b;
    this.spectator = true;
    this.kind = o.bg || specSession.bg || 'grass';
    this.alive = true;
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night ?? specSession.night);
    this.boosts = [b.sides[0].v.st, b.sides[1].v.st];
    this.st = {
      shakeX: 0, shakeY: 0, eSlide: 0, pSlide: 0, screenFlash: 0, wipe: 0, parts: [], balls: [],
      foe: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
      me: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
      trainer: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
    };
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(b.weather);
    this.setHud(1, null); this.setHud(0, null);

    this.game.sound.playMusic('trainer', 0.25);

    await Promise.all([
      this.loadBattleDecor(this.kind, o.night ?? specSession.night),
      this.loadSide(1),
      this.loadSide(0),
    ]);
    requestAnimationFrame(this.frame);

    const m0 = b.act(0), m1 = b.act(1);
    if (m0 && m0.hp > 0) {
      this.st.me.visible = true;
      this.setHud(0, m0);
    }
    if (m1 && m1.hp > 0) {
      this.st.foe.visible = true;
      this.setHud(1, m1);
    }
    this.showBoosts(0);
    this.showBoosts(1);

    const banner = el('div', 'spectator-banner');
    banner.innerHTML = `
      <div class="spec-live-pill"><span class="spec-dot">●</span> EN DIRECT</div>
      <div class="spec-matchup">${esc(p0.name)} <small>vs</small> ${esc(p1.name)}</div>
      <button type="button" class="spec-leave-btn" title="Quitter (Échap)">Quitter ✕</button>
    `;
    this.root.appendChild(banner);

    let spectatorQuit = false;
    const leave = () => {
      if (spectatorQuit) return;
      spectatorQuit = true;
      specSession.leave?.();
    };
    banner.querySelector('.spec-leave-btn').onclick = leave;

    const popInput = this.game.input.push((k) => {
      if (k === 'b' || k === 'cancel') leave();
    });

    this.cmd.innerHTML = `
      <div class="spec-cmd-box">
        <div class="spec-cmd-title">👁️ MODE SPECTATEUR</div>
        <div class="spec-cmd-status">Combat entre ${esc(p0.name)} et ${esc(p1.name)}</div>
        <button type="button" class="spec-cmd-quit-btn">Quitter le combat</button>
      </div>
    `;
    this.cmd.querySelector('.spec-cmd-quit-btn').onclick = leave;

    await this.msg(`Tu observes le combat en direct entre ${p0.name} et ${p1.name} !`);

    while (!spectatorQuit && b.state !== 'over') {
      this.ui.typePage(this.textBox, `En attente du tour ${b.turn + 1} de ${p0.name} et ${p1.name}…`, { last: true });
      const msg = await specSession.waitNext();
      if (spectatorQuit) break;
      if (!msg || msg.t === 'left' || msg.t === 'timeout') {
        await this.msg("Le combat s'est arrêté ou la connexion avec l'hôte a été interrompue.");
        await wait(1200);
        break;
      }
      if (msg.t === 'spec_ev') {
        b.turn = msg.turn ?? (b.turn + 1);
        await this.playSpecEvs(msg.events);
      }
      if (msg.t === 'spec_end') {
        if (msg.events?.length) await this.playSpecEvs(msg.events);
        b.state = 'over';
        const winTxt = msg.winner ? `${msg.winner} remporte le combat !` : "Le combat est terminé !";
        await this.msg(winTxt, { wait: true });
        await wait(1800);
        break;
      }
    }

    popInput();
    this.spectator = false;
  }

  async playSpecEvs(evs) {
    if (!evs || !evs.length) return;
    for (const e of evs) {
      if (e.t === 'send' && Number.isInteger(e.side) && Number.isInteger(e.idx)) {
        if (this.battle.sides[e.side]) this.battle.sides[e.side].active = e.idx;
      } else if (e.t === 'hp' && Number.isInteger(e.side)) {
        const m = this.battle.act(e.side);
        if (m) m.hp = e.hp;
      } else if (e.t === 'faint' && Number.isInteger(e.side)) {
        const m = this.battle.act(e.side);
        if (m) m.hp = 0;
      } else if (e.t === 'status' && Number.isInteger(e.side)) {
        const m = this.battle.act(e.side);
        if (m) m.status = e.status;
      }
    }
    await this.play(evs);
  }
  /**
   * combat contre un autre joueur. `duel` fournit l'échange de choix :
   *   duel.sendAct(n, action, sum), duel.waitAct(n) → { action, sum } | { quit } | { left } | { timeout }
   *   duel.sendSwitch(n, idx),      duel.waitSwitch(n) → { idx } | { quit } | { left } | { timeout }
   *   duel.sendQuit(), duel.foeName
   */
  async runPvp(battle, duel, o = {}) {
    this.battle = battle; this.kind = o.bg || 'grass'; this.alive = true;
    this.W = Math.max(256, Math.min(420, Math.round(BH * innerWidth / innerHeight)));
    this.bg = this.makeBg(this.kind, o.night);
    this.boosts = null; this.showBoosts(0); this.showBoosts(1);
    this.st = { shakeX: 0, shakeY: 0, eSlide: -this.W, pSlide: this.W, screenFlash: 0, wipe: 0, parts: [], balls: [],
      foe: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 }, me: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 },
      trainer: { visible: false, img: null, scale: 1, alpha: 1, dx: 0, dy: 0, white: 0 } };
    this.buildDom();
    this.root.style.setProperty('--bp', (innerHeight / BH) + 'px');
    this.updateWeather(battle.weather);
    this.setHud(1, null); this.setHud(0, null);
    await Promise.all([
      this.loadBattleDecor(this.kind, o.night),
      this.loadSide(1),
      this.loadSide(0),
    ]);
    this.st.trainer.img = await loadImg(ASSETS.trainer(battle.sides[1].trainer.bs));
    requestAnimationFrame(this.frame);
    this.st.trainer.visible = true;
    await this.tween(700, (u) => { const e = ease(u); this.st.eSlide = -this.W * (1 - e); this.st.pSlide = this.W * (1 - e); });
    const startEvs = battle.start();
    await this.play(startEvs);
    duel.broadcastEvents?.(startEvs);
    const waiting = () => this.ui.typePage(this.textBox, `En attente de ${duel.foeName}…`, { last: true });
    const lost = async (r) => {
      if (r.mine) {
        const stopEvs = battle.stop('lose', 'Vous abandonnez le combat...');
        await this.play(stopEvs);
        duel.broadcastEvents?.(stopEvs, true, duel.foeName);
        return;
      }
      const why = r.quit ? `${duel.foeName} abandonne le combat !` : r.left ? `${duel.foeName} a quitté la partie.` : r.desync ? 'La connexion a mélangé le combat : il s\'arrête ici, sans vainqueur.' : `${duel.foeName} ne répond plus.`;
      const stopEvs = battle.stop(r.desync ? 'draw' : 'win', why);
      await this.play(stopEvs);
      duel.broadcastEvents?.(stopEvs, true, r.quit ? battle.sides[0].name : duel.foeName);
    };
    while (battle.state !== 'over') {
      if (battle.state === 'switch') {
        const n = battle.turn;
        let mine = null;
        if (battle.need[0]) {
          const party = battle.sides[0].party;
          mine = await partyScreen(this.game, { mode: 'pick', pickLabel: 'Envoyer', prompt: 'Envoyer quel Pokémon ?', filter: (m, i) => (m.hp <= 0 ? 'K.O.' : i === battle.sides[0].active ? 'Au combat' : null) });
          if (mine < 0 || !party[mine] || party[mine].hp <= 0) mine = party.findIndex((m) => m.hp > 0);
        }
        duel.sendSwitch(n, mine);
        if (battle.need[1]) waiting();
        const r = await duel.waitSwitch(n);
        if (r.idx === undefined) { await lost(r); break; }
        const swEvs = battle.switchBoth(mine, r.idx);
        await this.play(swEvs);
        duel.broadcastEvents?.(swEvs);
        continue;
      }
      const action = await this.chooseAction();
      if (!action) continue;
      if (action.type === 'forfeit') {
        duel.sendQuit();
        const stopEvs = battle.stop('lose', 'Vous abandonnez le combat...');
        await this.play(stopEvs);
        duel.broadcastEvents?.(stopEvs, true, duel.foeName);
        break;
      }
      const n = battle.turn + 1, sum = battle.checksum();
      duel.sendAct(n, action, sum);
      waiting();
      const r = await duel.waitAct(n);
      if (!r.action) { await lost(r); break; }
      if (r.sum !== sum) { await lost({ desync: true }); break; }
      battle.remote = r.action;
      const actEvs = battle.playerAction(action);
      await this.play(actEvs);
      const isOver = battle.state === 'over';
      duel.broadcastEvents?.(actEvs, isOver, isOver ? (battle.result === 'win' ? battle.sides[0].name : duel.foeName) : null);
    }
    await wait(300);
    return battle.result;
  }

  async loadSide(side) {
    const m = this.battle.act(side), o = side === 1 ? this.st.foe : this.st.me;
    o.img = await loadImg(side === 1 ? ASSETS.front(m.sp, m.shiny, m.shadow) : ASSETS.back(m.sp, m.shiny, m.shadow));   // Pokémon Obscur (Lugia du Sanctuaire)
    o.whiteImg = null; o.darkImg = null;
    if (!o.img) { const c = document.createElement('canvas'); c.width = c.height = 80; const x = c.getContext('2d'); x.fillStyle = TYPE_COL[SPECIES[m.sp].t[0]]; x.beginPath(); x.arc(40, 50, 24, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('?', 34, 58); o.img = c; }
  }
  close() { this.alive = false; this.root?.remove(); this.ui.closeDialog(); this.game.input.clearDirs?.(); }

  /* ---------------- choix du joueur ---------------- */
  async chooseAction() {
    const b = this.battle, me = b.me;
    const forced = b.forcedAction(0); if (forced) return { type: 'move', idx: 0 };
    for (;;) {
      this.ui.typePage(this.textBox, `Que doit faire ${monName(me)} ?`, { last: true });
      const c = await this.commandMenu();
      if (c === 0) { this.megaArmed = false; const mv = await this.moveMenu(); if (mv < 0) continue; const mega = !!this.megaArmed && b.canMega?.(0); this.megaArmed = false; return mega ? { type: 'move', idx: mv, mega: true } : { type: 'move', idx: mv }; }
      if (c === 1 && b.pvp) { await this.msg('Pas d\'objets dans un combat entre dresseurs !', { wait: true }); continue; }
      if (c === 3 && b.pvp) { if (await this.ui.yesNo('Abandonner le combat ?')) return { type: 'forfeit' }; continue; }
      if (c === 1) {
        const r = await bagScreen(this.game, { battle: true }); if (!r) continue;
        const it = ITEMS[r.item], cap = this.game.levelCap();
        if (it.ball) { if (this.game.state.party.length >= 6 && this.game.state.box.length >= 300) { await this.msg('Plus de place dans le PC !', { wait: true }); continue; } return { type: 'item', item: r.item }; }
        const target = await partyScreen(this.game, { mode: 'pick', prompt: `Utiliser ${itemName(r.item)} sur quelle créature ?`, filter: (m) => (canUseOn(r.item, m, cap) ? null : it.candy && m.lvl >= cap && m.lvl < 100 ? `Niv. max (${cap})` : 'Pas d\'effet') });
        if (target < 0) continue;
        let moveIdx = -1;
        if (it.pp) { const m = this.game.state.party[target]; moveIdx = await this.ui.list({ title: 'Quelle attaque ?', items: m.moves.map((x) => ({ label: MOVES[x.id].n, right: `${x.pp}/${MOVES[x.id].pp}` })), cls: 'psub', cancel: -1 }); if (moveIdx < 0) continue; }
        return { type: 'item', item: r.item, target, moveIdx };
      }
      if (c === 2) {
        const k = await partyScreen(this.game, { mode: 'battle', prompt: 'Choisis une créature.', filter: (m, i) => (m.hp <= 0 ? `${monName(m)} n'a plus la force de se battre !` : i === b.sides[0].active ? `${monName(m)} est déjà au combat !` : null) });
        if (k < 0) continue;
        return { type: 'switch', idx: k };
      }
      if (c === 3) {
        if (!b.wild) {
          this.sound.sfx('bump');
          await this.msg('Impossible de fuir un combat de Dresseur !', { wait: true });
          continue;
        }
        return { type: 'run' };
      }
    }
  }
  commandMenu() {
    return new Promise((resolve) => {
      const items = [
        { label: 'ATTAQUE', sub: 'Capacités', cls: 'fight', icon: 'img/battle/fight.png' },
        { label: 'SAC', sub: 'Objets & Balls', cls: 'bag', icon: 'img/hud/bag.png' },
        { label: 'ÉQUIPE', sub: 'Changer', cls: 'mon', icon: 'img/hud/team.png' },
        { label: this.battle.pvp ? 'ABANDON' : 'FUITE', sub: this.battle.pvp ? 'Forfait' : 'Quitter', cls: 'run', icon: 'img/hud/run.png' },
      ];
      this.cmd.innerHTML = `<div class="cmd-grid">${items.map((it, i) => `
        <div class="cbtn ${it.cls}" data-i="${i}">
          <img class="cbtn-ico" src="${it.icon}" alt="">
          <div class="cbtn-txt">
            <span class="cbtn-lbl">${it.label}</span>
            <span class="cbtn-sub">${it.sub}</span>
          </div>
        </div>`).join('')}</div>`;
      this.cmd.classList.add('on'); this.root.classList.add('cmdon');
      let i = this.lastCmd || 0;
      const btns = [...this.cmd.querySelectorAll('.cbtn')];
      const show = () => btns.forEach((b, k) => b.classList.toggle('sel', k === i));
      show();
      let done = false;
      const pick = (idx) => {
        if (done) return;
        done = true;
        pop();
        this.cmd.classList.remove('on'); this.root.classList.remove('cmdon');
        this.lastCmd = idx === 3 ? 0 : idx;
        this.sound.sfx('select');
        resolve(idx);
      };
      btns.forEach((b, idx) => {
        b.addEventListener('pointerenter', () => { if (i !== idx) { i = idx; this.sound.sfx('blip'); show(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); i = idx; show(); pick(idx); });
      });
      const pop = this.ui.input.push((k) => {
        if (k === 'up' || k === 'down') i ^= 2; else if (k === 'left' || k === 'right') i ^= 1;
        else if (k === 'a') { pick(i); return; }
        else if (k === 'b') { i = 3; }
        else return;
        this.sound.sfx('blip'); show();
      });
    });
  }
  moveMenu() {
    return new Promise((resolve) => {
      const m = this.battle.me;
      const foeMon = this.battle.foe;
      const foeKnown = foeMon ? this.game.isSpeciesKnown(foeMon.sp) : false;
      const foeTypes = (foeMon && foeKnown) ? (SPECIES[foeMon.sp]?.t || ['normal']) : null;
      this.cmd.innerHTML = `
        <div class="mv-desc-banner">
          <div class="mv-desc-head">
            <span class="mv-desc-name"></span>
            <span class="mv-desc-type"></span>
            <span class="mv-desc-cat"></span>
            <span class="mv-desc-pow"></span>
            <span class="mv-desc-acc"></span>
            <span class="mv-desc-pp"></span>
          </div>
          <div class="mv-desc-text"></div>
        </div>
        <div class="mv-layout">
          <div class="mv-grid">${[0, 1, 2, 3].map((k) => {
            const x = m.moves[k];
            if (!x) return '<div class="mbtn empty"><span class="mn">—</span></div>';
            const M = MOVES[x.id];
            const catIcon = `img/battle/cat_${M.c || 'physical'}.png`;
            const pwTxt = M.p ? `Puis. ${M.p}` : 'Statut';
            let effBadge = '';
            if (foeMon && (M.p || M.c !== 'status')) {
              if (foeKnown && foeTypes) {
                const eff = typeEff(M.t, foeTypes);
                if (eff === 0) effBadge = '<span class="bm-eff eff-nul">SANS EFFET</span>';
                else if (eff >= 2) effBadge = `<span class="bm-eff eff-super">SUPER EFF.${eff > 2 ? ' ×4' : ''}</span>`;
                else if (eff < 1) effBadge = `<span class="bm-eff eff-weak">PEU EFF.${eff < 0.5 ? ' ×¼' : ''}</span>`;
                // efficacité normale : rien à signaler (l'étiquette ne sert que quand elle change quelque chose)
              } else {
                const count = this.game.seenCount(foeMon.sp);
                effBadge = `<span class="bm-eff eff-unk" title="Efficacité inconnue (vu ${count}/3)">???</span>`;
              }
            }
            return `<div class="mbtn" data-i="${k}" style="--tc:${TYPE_COL[M.t]}">
              <div class="mbtn-top">
                <span class="mn">${esc(M.n)}</span>
                <div class="mbtn-top-right">
                  ${effBadge}
                  <img class="mcat" src="${catIcon}" alt="${M.c}">
                </div>
              </div>
              <div class="mbtn-bot">
                <div class="mbtn-bot-left">
                  <span class="mt">${TYPE_FR[M.t]}</span>
                  <span class="mpw">${pwTxt}</span>
                </div>
                <span class="mpp${x.pp === 0 ? ' zero' : ''}">PP ${x.pp}/${M.pp}</span>
              </div>
            </div>`;
          }).join('')}</div>
          ${this.battle.canMega?.(0) ? `<button type="button" class="mv-mega-btn" title="Méga-Évolution (touche M ou Tab)"><img src="${ASSETS.item('mega-ring')}" alt=""><span>MÉGA</span></button>` : ''}
          <button type="button" class="mv-back-btn" title="Retour (Échap / B)">
            <span class="mv-back-ico">✕</span>
            <span class="mv-back-lbl">RETOUR</span>
          </button>
        </div>`;
      this.cmd.classList.add('on', 'moves');
      this.root.classList.add('cmdon', 'moves-open');
      let i = this.lastMove || 0; if (!m.moves[i]) i = 0;
      const btns = [...this.cmd.querySelectorAll('.mbtn')];
      const backBtn = this.cmd.querySelector('.mv-back-btn');
      const descName = this.cmd.querySelector('.mv-desc-name');
      const descType = this.cmd.querySelector('.mv-desc-type');
      const descCat = this.cmd.querySelector('.mv-desc-cat');
      const descPow = this.cmd.querySelector('.mv-desc-pow');
      const descAcc = this.cmd.querySelector('.mv-desc-acc');
      const descPp = this.cmd.querySelector('.mv-desc-pp');
      const descText = this.cmd.querySelector('.mv-desc-text');
      const show = () => {
        btns.forEach((b, k) => b.classList.toggle('sel', k === i));
        backBtn?.classList.toggle('sel', i === 4);
        if (i === 4) {
          if (descName) descName.textContent = 'RETOUR ✕';
          if (descType) descType.style.display = 'none';
          if (descCat) descCat.style.display = 'none';
          if (descPow) descPow.style.display = 'none';
          if (descAcc) descAcc.style.display = 'none';
          if (descPp) descPp.style.display = 'none';
          if (descText) descText.textContent = 'Annuler et revenir au menu principal des actions (Attaque, Sac, Pokémon, Fuite).';
        } else {
          const x = m.moves[i];
          if (x) {
            const M = MOVES[x.id];
            if (descName) {
              descName.style.display = 'inline-block';
              descName.textContent = M.n;
            }
            if (descType) {
              descType.style.display = 'inline-block';
              descType.textContent = TYPE_FR[M.t];
              descType.style.background = TYPE_COL[M.t];
            }
            if (descCat) {
              descCat.style.display = 'inline-flex';
              descCat.innerHTML = `<img src="img/battle/cat_${M.c || 'physical'}.png" alt=""><span>${M.c === 'special' ? 'Spécial' : M.c === 'status' ? 'Statut' : 'Physique'}</span>`;
            }
            if (descPow) {
              descPow.style.display = 'inline-block';
              descPow.textContent = M.p ? `Puis. ${M.p}` : 'Statut';
            }
            if (descAcc) {
              descAcc.style.display = 'inline-block';
              descAcc.textContent = M.a ? `Préc. ${M.a}%` : 'Préc. —';
            }
            if (descPp) {
              descPp.style.display = 'inline-block';
              descPp.textContent = `PP ${x.pp}/${M.pp}`;
            }
            if (descText) descText.textContent = moveDesc(M);
          } else {
            if (descName) descName.textContent = 'Emplacement vide';
            if (descType) descType.style.display = 'none';
            if (descCat) descCat.style.display = 'none';
            if (descPow) descPow.style.display = 'none';
            if (descAcc) descAcc.style.display = 'none';
            if (descPp) descPp.style.display = 'none';
            if (descText) descText.textContent = 'Aucune capacité apprise sur cet emplacement.';
          }
        }
      };
      show();
      let done = false;
      const closeMenu = (idx) => {
        if (done) return;
        done = true;
        pop();
        this.cmd.classList.remove('on', 'moves');
        this.root.classList.remove('cmdon', 'moves-open');
        if (idx >= 0) {
          this.lastMove = idx;
          this.sound.sfx('select');
        } else {
          this.sound.sfx('cancel');
        }
        resolve(idx);
      };
      const confirmMove = (idx) => {
        const x = m.moves[idx];
        if (!x) return;
        if (x.pp <= 0 && this.battle.usableMoves(0).length) { this.sound.sfx('bump'); return; }
        closeMenu(idx);
      };
      btns.forEach((b, idx) => {
        if (!m.moves[idx]) return;
        b.addEventListener('pointerenter', () => { if (i !== idx) { i = idx; this.sound.sfx('blip'); show(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); i = idx; show(); confirmMove(idx); });
      });
      // Méga-Évolution : on l'arme, puis on choisit l'attaque (le Pokémon méga-évolue avant d'attaquer)
      const megaBtn = this.cmd.querySelector('.mv-mega-btn');
      const toggleMega = () => { if (!megaBtn) return; this.megaArmed = !this.megaArmed; megaBtn.classList.toggle('on', this.megaArmed); this.sound.sfx(this.megaArmed ? 'select' : 'cancel'); };
      megaBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleMega(); });
      backBtn?.addEventListener('pointerenter', () => { if (i !== 4) { i = 4; this.sound.sfx('blip'); show(); } });
      backBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(-1); });

      const pop = this.ui.input.push((k) => {
        let j = i;
        if (k === 'up') {
          if (i === 4) j = 1;
          else if (i >= 2) j = i - 2;
        } else if (k === 'down') {
          if (i === 4) j = 3;
          else if (i <= 1) j = i + 2;
        } else if (k === 'left') {
          if (i === 4) j = 1;
          else if (i % 2 === 1) j = i - 1;
        } else if (k === 'right') {
          if (i % 2 === 0) j = i + 1;
          else if (i === 1 || i === 3) j = 4;
        } else if (k === 'a') {
          if (i === 4) { closeMenu(-1); return; }
          confirmMove(i);
          return;
        } else if (k === 'b') {
          closeMenu(-1);
          return;
        } else if (k === 'menu') { toggleMega(); return; }
        else return;

        if (j === 4 || m.moves[j]) { i = j; this.sound.sfx('blip'); show(); }
      });
    });
  }
  async forcedSwitch() {
    const b = this.battle;
    const k = await partyScreen(this.game, { mode: 'pick', pickLabel: 'Envoyer', prompt: 'Envoyer quelle créature ?', filter: (m, i) => (m.hp <= 0 ? 'K.O.' : i === b.sides[0].active ? 'Au combat' : null) });
    if (k < 0) return;
    await this.play(b.playerSwitch(k));
  }

  /* ---------------- relecture des événements ---------------- */
  async play(evs) {
    for (const e of evs) {
      switch (e.t) {
        case 'msg': await this.msg(e.text, { wait: this.battle.state === 'over' && /remportez|battu|K\.O\.|perdez|attrapé|panique/.test(e.text) }); break;
        case 'send': if (this.boosts) this.boosts[e.side] = [0, 0, 0, 0, 0, 0, 0, 0]; this.showBoosts(e.side); await this.animSend(e.side); break;
        case 'recall': await this.animRecall(e.side); break;
        case 'mega': await this.animMega(e.side); break;
        case 'move': await this.animMove(e.side, e.move, e.type); break;
        case 'hit': await this.animHit(e.side, e.eff, e.crit); break;
        case 'hp': await this.animHp(e.side, e.from, e.hp, e.status); break;
        case 'status': { const m = this.battle.act(e.side); this.setHud(e.side, m); if (e.status) { this.sound.sfx('status'); const c = this.sprCenter(e.side); this.burst(c.x, c.y, [STATUS_FR[e.status]?.[1] || '#fff', '#ffffff'], 12, { r: 2 }); await wait(250); } break; }
        case 'stat': if (e.all) this.boosts = e.all; this.showBoosts(0); this.showBoosts(1); if (e.side >= 0) await this.animStat(e.side, e.up); break;
        case 'weather': this.updateWeather(e.weather); break;
        case 'gym-tension': {
          this.sound.play('gymTension');
          this.st.screenFlash = 0.6;
          await wait(180);
          break;
        }
        case 'anim': await this.animStatus(e.side, e.k); break;
        case 'faint': await this.animFaint(e.side); break;
        case 'exp': if (e.active) await this.animExp(e); break;
        case 'level': if (e.active) { const m = this.battle.me; this.hud.me.querySelector('.bh-lv').textContent = 'N.' + e.lvl; this.setHp(0, e.hp, e.after[0]); } this.sound.sfx('levelup'); await this.levelBox(e); break;
        case 'ask-learn': await this.game.askLearn(this.game.state.party[e.idx], e.move, this.textBox); break;
        case 'ball': await this.animBall(e); break;
        case 'hide': { const o = e.side === 1 ? this.st.foe : this.st.me; o.visible = !e.on; break; }
        case 'trainer-back': { this.st.trainer.visible = true; this.st.trainer.dx = 120; await this.tween(400, (u) => { this.st.trainer.dx = 120 * (1 - ease(u)); }); break; }
        case 'sfx': this.sound.sfx(e.k); break;
        case 'switch-prompt': break;
        case 'end': break;
        default: break;
      }
    }
  }

  async animSend(side) {
    const b = this.battle, m = b.act(side), o = side === 1 ? this.st.foe : this.st.me;
    await this.loadSide(side);
    this.setHud(side, m);
    if (side === 1 && this.st.trainer.visible) { await this.tween(350, (u) => { this.st.trainer.dx = 130 * ease(u); }); this.st.trainer.visible = false; this.st.trainer.dx = 0; }
    // la Ball part et s'ouvre dans un éclair blanc
    const target = side === 1 ? this.ePos() : this.pPos(), tx = target.x, ty = target.y - 18;
    const ball = { x: side === 1 ? tx : -10, y: side === 1 ? ty - 30 : 120, groundY: target.y, item: m.ball || 'poke-ball', rot: 0, state: null };
    this.st.balls.push(ball); this.sound.sfx('throw');
    const x0 = ball.x, y0 = ball.y;
    await this.tween(side === 1 ? 250 : 450, (u) => { ball.x = x0 + (tx - x0) * u; ball.y = y0 + (ty - y0) * u - Math.sin(u * Math.PI) * 40; ball.rot = u * 10; });
    ball.state = 'open';
    this.sound.sfx('poof'); this.burst(tx, ty, ['#ffffff', '#fff6a0', '#a0e0ff'], 18, { speed: 2.2 });
    await wait(40);
    this.st.balls = this.st.balls.filter((q) => q !== ball);
    o.visible = true; o.white = 1; o.scale = 0.1;
    await this.tween(260, (u) => { o.scale = 0.1 + 0.9 * ease(u); });
    this.sound.cry(ASSETS.cry(m.sp));
    await this.tween(220, (u) => { o.white = 1 - u; });
    o.white = 0;
  }
  /** Méga-Évolution : le Pokémon s'illumine dans une gerbe arc-en-ciel, puis apparaît sous sa forme Méga */
  async animMega(side) {
    const m = this.battle.act(side), o = side === 1 ? this.st.foe : this.st.me, c = this.sprCenter(side);
    this.sound.sfx('mega');
    for (let k = 0; k < 3; k++) { this.burst(c.x, c.y, ['#ff5ad0', '#ffd84a', '#5ad8ff', '#8affa0', '#ffffff'], 16, { speed: 1.6 + k * 0.6 }); await wait(160); }
    await this.tween(380, (u) => { o.white = u; o.scale = 1 + 0.12 * Math.sin(u * Math.PI); });
    await this.loadSide(side);
    this.setHud(side, m);
    this.burst(c.x, c.y, ['#ffffff', '#ffe060', '#ff7ae0', '#7ae8ff'], 30, { speed: 3 });
    await this.tween(420, (u) => { o.white = 1 - u; });
    o.white = 0; o.scale = 1;
    this.sound.cry(ASSETS.cry(m.sp));
    await wait(250);
  }
  async animRecall(side) {
    const o = side === 1 ? this.st.foe : this.st.me;
    o.white = 1; await this.tween(260, (u) => { o.scale = 1 - u * 0.9; }); o.visible = false; o.scale = 1; o.white = 0;
    this.setHud(side, null);
  }
  async animMove(side, moveId, type) {
    const M = MOVES[moveId], fx = TYPE_FX[type] || TYPE_FX.normal, from = this.sprCenter(side), to = this.sprCenter(1 - side);
    const o = side === 1 ? this.st.foe : this.st.me, dir = side === 1 ? -1 : 1;
    const selfMove = M.tg === 7 || M.c === 'status' && (M.m?.st?.every(([, c]) => c > 0) || M.m?.heal);
    if (moveId === 10001 || M?.key === 'shadow-blast' || M?.n === 'Rafale Obscure') {
      await this.animShadowBlast(side, from, to);
      return;
    }

    // --- ANIMATIONS VISUELLES AVANCÉES DES ATTAQUES MAJEURES ---
    const mKey = M?.key || '', mName = M?.n || '';
    if (['flamethrower', 'fire-blast', 'heat-wave', 'overheat', 'blast-burn', 'flare-blitz'].includes(mKey) || ['Lance-Flammes', 'Déflagration', 'Canicule', 'Surchauffe', 'Rafale Feu', 'Boutefeu'].includes(mName)) {
      await this.animFlamethrower(side, from, to, mKey === 'fire-blast' || mName === 'Déflagration');
      return;
    }
    if (['hydro-pump', 'surf', 'waterfall', 'scald', 'muddy-water', 'hydro-cannon'].includes(mKey) || ['Hydrocanon', 'Surf', 'Cascade', 'Ébullition', 'Hydroblast'].includes(mName)) {
      await this.animHydroPump(side, from, to);
      return;
    }
    if (['thunderbolt', 'thunder', 'discharge', 'zap-cannon', 'volt-switch'].includes(mKey) || ['Tonnerre', 'Fatal-Foudre', 'Coup d’Jus', 'Élecanon', 'Change-Éclair'].includes(mName)) {
      await this.animThunderbolt(side, from, to, mKey === 'thunder' || mName === 'Fatal-Foudre');
      return;
    }
    if (['earthquake', 'earth-power', 'fissure', 'bulldoze', 'magnitude'].includes(mKey) || ['Séisme', 'Telluriforce', 'Abîme', 'Piétinement', 'Ampleur'].includes(mName)) {
      await this.animEarthquake(side, from, to);
      return;
    }
    if (['ice-beam', 'blizzard', 'sheer-cold', 'freeze-dry', 'glaciate'].includes(mKey) || ['Laser Glace', 'Blizzard', 'Glaciation', 'Lyophilisation'].includes(mName)) {
      await this.animIceBeam(side, from, to, mKey === 'blizzard' || mName === 'Blizzard');
      return;
    }
    if (['psychic', 'psyshock', 'shadow-ball', 'dark-pulse', 'future-sight'].includes(mKey) || ['Psyko', 'Choc Psy', 'Ball’Ombre', 'Vibrobscur'].includes(mName)) {
      await this.animPsychicShadow(side, from, to, M?.t === 'ghost' || M?.t === 'dark');
      return;
    }
    if (['razor-leaf', 'leaf-blade', 'leaf-storm', 'petal-dance', 'frenzy-plant'].includes(mKey) || ['Tranch’Herbe', 'Lame Feuille', 'Tempête Verte', 'Danse Fleurs', 'Végé-Attak'].includes(mName)) {
      await this.animLeafBlade(side, from, to);
      return;
    }
    if (['hyper-beam', 'solar-beam', 'giga-impact', 'focus-blast'].includes(mKey) || ['Ultralaser', 'Lance-Soleil', 'Giga Impact', 'Exploforce'].includes(mName)) {
      await this.animHyperBeam(side, from, to);
      return;
    }
    if (M.c === 'physical') {
      await this.tween(130, (u) => { o.dx = dir * 14 * Math.sin(u * Math.PI / 2); o.dy = -dir * 6 * Math.sin(u * Math.PI / 2); });
      this.burst(to.x, to.y, fx, 16, { speed: 2.4, r: 2 });
      if (type === 'fighting' || type === 'normal') this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 4, grow: 1.2, shape: 'ring', c: '#ffffff', life: 0.3, max: 0.3 });
      await this.tween(140, (u) => { o.dx = dir * 14 * (1 - u); o.dy = -dir * 6 * (1 - u); });
    } else if (M.c === 'special') {
      const n = 22, dur = 520;
      await this.tween(dur, (u) => {
        const k = Math.floor(u * n);
        while ((this._emitted || 0) < k) {
          this._emitted = (this._emitted || 0) + 1;
          const t = this._emitted / n;
          const px = from.x + (to.x - from.x) * t, py = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * (type === 'water' || type === 'grass' ? 20 : 6);
          const shape = type === 'electric' ? 'bolt' : type === 'grass' ? 'leaf' : type === 'psychic' ? 'ring' : null;
          this.st.parts.push({ x: px, y: py, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 - (type === 'fire' ? 0.5 : 0), r: shape === 'ring' ? 3 : 2 + Math.random() * 2, c: fx[this._emitted % 2], life: 0.35, max: 0.35, shape, grow: shape === 'ring' ? 0.5 : 0, a: 0 });
        }
      });
      this._emitted = 0;
      this.burst(to.x, to.y, fx, 18, { speed: 2, r: 2.2 });
      if (type === 'ground' || type === 'rock') await this.shakeScreen(5, 300);
    } else {
      const c = selfMove ? from : to;
      for (let i = 0; i < 3; i++) { this.st.parts.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: 4 + i * 4, grow: 0.8, shape: 'ring', c: fx[i % 2], life: 0.45, max: 0.45 }); await wait(90); }
      this.burst(c.x, c.y, fx, 10, { speed: 1, r: 1.5, up: 0.6 });
      await wait(180);
    }
  }
  /* ---------------- ANIMATIONS VISUELLES AVANCÉES DES ATTAQUES MAJEURES ---------------- */

  async animFlamethrower(side, from, to, isBlast = false) {
    const o = side === 1 ? this.st.foe : this.st.me;
    const dir = side === 1 ? -1 : 1;
    const flameCols = ['#ffffff', '#fff340', '#ff9800', '#f44336', '#b71c1c'];

    this.sound.sfx('throw');
    await this.tween(120, (u) => { o.dx = dir * 12 * Math.sin(u * Math.PI); });

    const dur = isBlast ? 560 : 480;
    const flameCount = isBlast ? 42 : 32;
    this.sound.sfx('hitstrong');

    await this.tween(dur, (u) => {
      const emitted = Math.floor(u * flameCount);
      while ((this._fEmitted || 0) < emitted) {
        this._fEmitted = (this._fEmitted || 0) + 1;
        const progress = this._fEmitted / flameCount;
        const bx = from.x + (to.x - from.x) * progress;
        const by = (from.y - 6) + (to.y - (from.y - 6)) * progress + Math.sin(progress * Math.PI * 3) * 12;
        const spread = (Math.random() - 0.5) * (6 + progress * 16);
        const col = flameCols[Math.floor(Math.random() * flameCols.length)];
        this.st.parts.push({
          x: bx + spread,
          y: by + (Math.random() - 0.5) * 8,
          vx: (to.x - from.x) * 0.04 + (Math.random() - 0.5) * 0.8,
          vy: -0.6 - Math.random() * 0.8,
          r: 2.5 + progress * 4.5,
          grow: 0.25,
          c: col,
          shape: 'flame',
          life: 0.38,
          max: 0.38,
        });
      }
    });
    this._fEmitted = 0;

    this.st.screenFlash = 0.35;
    this.shakeScreen(isBlast ? 6 : 4, 320);
    this.burst(to.x, to.y, flameCols, isBlast ? 28 : 20, { speed: 3.2, r: 3.5 });
    for (let i = 0; i < (isBlast ? 4 : 2); i++) {
      this.st.parts.push({
        x: to.x, y: to.y,
        vx: 0, vy: 0,
        r: 6 + i * 8, grow: 2.2,
        shape: 'ring',
        c: flameCols[i % flameCols.length],
        life: 0.35, max: 0.35
      });
    }
    await wait(200);
  }

  async animHydroPump(side, from, to) {
    const waterCols = ['#e0f7ff', '#80d8ff', '#00b0ff', '#0091ea', '#ffffff'];
    this.sound.sfx('splash');
    const dur = 540;
    const waterCount = 38;

    await this.tween(dur, (u) => {
      const emitted = Math.floor(u * waterCount);
      while ((this._wEmitted || 0) < emitted) {
        this._wEmitted = (this._wEmitted || 0) + 1;
        const p = this._wEmitted / waterCount;
        const px = from.x + (to.x - from.x) * p;
        const py = (from.y - 4) + (to.y - (from.y - 4)) * p - Math.sin(p * Math.PI) * 26;
        const col = waterCols[Math.floor(Math.random() * waterCols.length)];
        this.st.parts.push({
          x: px + (Math.random() - 0.5) * 10,
          y: py + (Math.random() - 0.5) * 8,
          vx: (to.x - from.x) * 0.035,
          vy: 0.8 + Math.random() * 0.8,
          r: 2 + p * 3.8,
          grow: 0.15,
          c: col,
          life: 0.36,
          max: 0.36
        });
      }
    });
    this._wEmitted = 0;

    this.sound.sfx('splash');
    this.shakeScreen(5, 360);
    this.burst(to.x, to.y, waterCols, 26, { speed: 3.5, r: 3, up: 1.2 });
    this.st.parts.push({ x: to.x, y: to.y + 8, vx: 0, vy: 0, r: 10, grow: 2.8, shape: 'ring', c: '#80d8ff', life: 0.38, max: 0.38 });
    this.st.parts.push({ x: to.x, y: to.y + 8, vx: 0, vy: 0, r: 18, grow: 3.2, shape: 'ring', c: '#ffffff', life: 0.42, max: 0.42 });
    await wait(220);
  }

  async animThunderbolt(side, from, to, isThunder = false) {
    const elecCols = ['#ffffff', '#ffff76', '#ffea00', '#00e5ff'];
    this.st.screenFlash = -0.2;
    await wait(70);

    const strikes = isThunder ? 4 : 2;
    for (let s = 0; s < strikes; s++) {
      this.sound.sfx('bang');
      this.st.screenFlash = 0.55;
      this.shakeScreen(isThunder ? 7 : 5, 220);

      for (let k = 0; k < 3; k++) {
        this.st.parts.push({
          x: to.x + (Math.random() - 0.5) * 18,
          y: -10,
          vx: 0,
          vy: 1.8,
          r: 3,
          lw: 3,
          shape: 'bolt',
          c: elecCols[Math.floor(Math.random() * elecCols.length)],
          life: 0.28,
          max: 0.28
        });
      }

      this.burst(to.x, to.y, elecCols, 16, { speed: 3.2, r: 2.5 });
      this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 8, grow: 2.5, shape: 'ring', c: '#ffea00', life: 0.3, max: 0.3 });
      await wait(110);
    }
    await wait(140);
  }

  async animEarthquake(side, from, to) {
    const earthCols = ['#5d4037', '#8d6e63', '#a1887f', '#ffb74d', '#3e2723'];
    this.sound.sfx('hitstrong');
    this.shakeScreen(9, 580);

    for (let i = 0; i < 4; i++) {
      this.st.parts.push({
        x: to.x,
        y: to.y + 16,
        vx: 0, vy: 0,
        r: 8 + i * 12,
        grow: 3.6,
        shape: 'ring',
        c: earthCols[i % earthCols.length],
        life: 0.48,
        max: 0.48
      });
      await wait(80);
    }

    this.sound.sfx('bump');
    for (let k = 0; k < 22; k++) {
      this.st.parts.push({
        x: to.x + (Math.random() - 0.5) * 44,
        y: to.y + 14,
        vx: (Math.random() - 0.5) * 2.8,
        vy: -2.8 - Math.random() * 2.5,
        g: 0.22,
        r: 2 + Math.random() * 3,
        c: earthCols[Math.floor(Math.random() * earthCols.length)],
        life: 0.48,
        max: 0.48
      });
    }
    await wait(240);
  }

  async animIceBeam(side, from, to, isBlizzard = false) {
    const iceCols = ['#e1f5fe', '#b3e5fc', '#80deea', '#00e5ff', '#ffffff'];
    this.sound.sfx('stat');
    const dur = 460;
    const crystalCount = isBlizzard ? 36 : 26;

    await this.tween(dur, (u) => {
      const emitted = Math.floor(u * crystalCount);
      while ((this._iEmitted || 0) < emitted) {
        this._iEmitted = (this._iEmitted || 0) + 1;
        const p = this._iEmitted / crystalCount;
        const px = from.x + (to.x - from.x) * p;
        const py = from.y + (to.y - from.y) * p + (Math.random() - 0.5) * 8;
        this.st.parts.push({
          x: px,
          y: py,
          vx: (to.x - from.x) * 0.04,
          vy: (Math.random() - 0.5) * 0.6,
          r: 2.5 + Math.random() * 2.5,
          a: Math.random() * Math.PI,
          va: 0.15,
          shape: 'crystal',
          c: iceCols[Math.floor(Math.random() * iceCols.length)],
          life: 0.32,
          max: 0.32
        });
      }
    });
    this._iEmitted = 0;

    this.sound.sfx('hitweak');
    this.burst(to.x, to.y, iceCols, 24, { speed: 3.2, r: 2.8 });
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 12, grow: 2.2, shape: 'ring', c: '#80deea', life: 0.35, max: 0.35 });
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 20, grow: 2.6, shape: 'ring', c: '#ffffff', life: 0.4, max: 0.4 });
    await wait(180);
  }

  async animPsychicShadow(side, from, to, isShadow = false) {
    const cols = isShadow
      ? ['#1a052e', '#4a148c', '#7b1fa2', '#d500f9', '#ffffff']
      : ['#f3e5f5', '#e040fb', '#aa00ff', '#651fff', '#ffffff'];

    this.sound.sfx('stat');
    await this.tween(380, (u) => {
      const px = from.x + (to.x - from.x) * ease(u);
      const py = from.y + (to.y - from.y) * ease(u) - Math.sin(u * Math.PI) * 14;
      this.st.parts.push({
        x: px + (Math.random() - 0.5) * 6,
        y: py + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        r: 3 + u * 4.5,
        c: cols[Math.floor(Math.random() * cols.length)],
        life: 0.28,
        max: 0.28
      });
    });

    this.sound.sfx('poof');
    this.shakeScreen(4, 280);
    this.burst(to.x, to.y, cols, 22, { speed: 2.8, r: 3 });
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 10, grow: 2.6, shape: 'ring', c: cols[1], life: 0.38, max: 0.38 });
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 18, grow: 3.2, shape: 'ring', c: cols[3], life: 0.42, max: 0.42 });
    await wait(190);
  }

  async animLeafBlade(side, from, to) {
    const leafCols = ['#76ff03', '#00e676', '#00c853', '#1b5e20', '#ffffff'];
    this.sound.sfx('cut');

    for (let k = 0; k < 20; k++) {
      const p = k / 20;
      this.st.parts.push({
        x: from.x + (to.x - from.x) * p + (Math.random() - 0.5) * 14,
        y: from.y + (to.y - from.y) * p + Math.sin(p * Math.PI * 2) * 14,
        vx: (to.x - from.x) * 0.04,
        vy: -0.4 + Math.random() * 0.8,
        r: 3,
        a: Math.random() * Math.PI,
        va: 0.25,
        shape: 'leaf',
        c: leafCols[Math.floor(Math.random() * leafCols.length)],
        life: 0.38,
        max: 0.38
      });
    }
    await wait(180);

    this.sound.sfx('cut');
    this.shakeScreen(3, 200);
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, shape: 'slash', ang: Math.PI / 4, len: 20, lw: 3, c: '#00e676', life: 0.28, max: 0.28 });
    this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, shape: 'slash', ang: -Math.PI / 4, len: 20, lw: 3, c: '#ffffff', life: 0.28, max: 0.28 });
    this.burst(to.x, to.y, leafCols, 16, { speed: 2.5, r: 2 });
    await wait(180);
  }

  async animHyperBeam(side, from, to) {
    const o = side === 1 ? this.st.foe : this.st.me;
    const beamCols = ['#ffffff', '#ffea00', '#ff6d00', '#d50000'];

    this.sound.sfx('throw');
    await this.tween(240, (u) => {
      o.white = u * 0.6;
      const ang = Math.random() * Math.PI * 2, dist = 20 * (1 - u);
      this.st.parts.push({
        x: from.x + Math.cos(ang) * dist,
        y: from.y + Math.sin(ang) * dist,
        vx: -Math.cos(ang) * 1.5,
        vy: -Math.sin(ang) * 1.5,
        r: 2,
        c: '#ffea00',
        life: 0.22,
        max: 0.22
      });
    });

    this.sound.sfx('hitstrong');
    this.st.screenFlash = 0.65;
    this.shakeScreen(8, 480);

    for (let i = 0; i < 28; i++) {
      const p = i / 28;
      const px = from.x + (to.x - from.x) * p;
      const py = from.y + (to.y - from.y) * p;
      this.st.parts.push({
        x: px,
        y: py,
        vx: 0, vy: 0,
        r: 5 + (1 - Math.abs(p - 0.5) * 2) * 4,
        c: beamCols[i % beamCols.length],
        shape: 'flame',
        life: 0.35,
        max: 0.35
      });
    }

    this.burst(to.x, to.y, beamCols, 32, { speed: 4.2, r: 4 });
    for (let r = 0; r < 3; r++) {
      this.st.parts.push({ x: to.x, y: to.y, vx: 0, vy: 0, r: 12 + r * 10, grow: 3.5, shape: 'ring', c: beamCols[r], life: 0.42, max: 0.42 });
    }
    o.white = 0;
    await wait(260);
  }


  async animShadowBlast(side, from, to) {
    const o = side === 1 ? this.st.foe : this.st.me;
    const targetO = side === 1 ? this.st.me : this.st.foe;
    const shadowCols = ['#1a052e', '#4a148c', '#7b1fa2', '#00e5ff', '#ffffff'];

    // 1. Charge des ténèbres & élévation de Lugia Obscur
    this.sound.sfx('throw');
    await this.tween(320, (u) => {
      o.dy = -16 * ease(u);
      o.white = 0.45 * u;
      if (Math.random() < 0.75) {
        const ang = Math.random() * Math.PI * 2, dist = 24 + Math.random() * 18;
        const c = shadowCols[Math.floor(Math.random() * shadowCols.length)];
        this.st.parts.push({
          x: from.x + Math.cos(ang) * dist,
          y: (from.y - 14) + Math.sin(ang) * dist,
          vx: -Math.cos(ang) * 1.9,
          vy: -Math.sin(ang) * 1.9,
          r: 1.5 + Math.random() * 1.5,
          c,
          life: 0.32,
          max: 0.32,
        });
      }
    });

    await wait(60);

    // 2. Traînée obscure / projectile fonçant vers la cible
    this.sound.sfx('throw');
    await this.tween(150, (u) => {
      const bx = from.x + (to.x - from.x) * u;
      const by = (from.y - 14) + (to.y - (from.y - 14)) * u;
      for (let k = 0; k < 3; k++) {
        this.st.parts.push({
          x: bx + (Math.random() - 0.5) * 6,
          y: by + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          r: 2 + Math.random() * 2,
          c: shadowCols[Math.floor(Math.random() * shadowCols.length)],
          life: 0.24,
          max: 0.24,
          shape: Math.random() < 0.35 ? 'bolt' : null,
        });
      }
    });

    // 3. Déploiement de la Tornade Obscure (Cyclone tourbillonnant)
    const tornadoDur = 700;
    const startTornado = performance.now();
    let lastRing = 0;

    this.shakeScreen(3, 680);

    await this.tween(tornadoDur, (u) => {
      const elapsed = performance.now() - startTornado;
      targetO.dx = Math.sin(u * 30) * 2.5;

      // Anneaux de vortex ascendants et s'évasant
      if (elapsed - lastRing > 60) {
        lastRing = elapsed;
        const ringCol = shadowCols[Math.floor(Math.random() * shadowCols.length)];
        this.st.parts.push({
          x: to.x + (Math.random() - 0.5) * 4,
          y: to.y + 14,
          vx: 0,
          vy: -2.4 - Math.random() * 0.8,
          r: 6,
          grow: 0.72,
          tilt: (Math.random() - 0.5) * 0.25,
          lw: 2.2,
          shape: 'tornado',
          c: ringCol,
          life: 0.55,
          max: 0.55,
        });
      }

      // Éclats tourbillonnants en spirale ascendante
      for (let s = 0; s < 3; s++) {
        const spd = (0.24 + Math.random() * 0.16) * (Math.random() < 0.5 ? 1 : -1);
        this.st.parts.push({
          cx: to.x,
          x: to.x,
          y: to.y + 12 + (Math.random() - 0.5) * 8,
          spiral: true,
          spiralAngle: Math.random() * Math.PI * 2,
          spiralR: 4 + Math.random() * 6,
          spiralRGrow: 0.38 + Math.random() * 0.22,
          spiralSpd: spd,
          vx: 0,
          vy: -2.2 - Math.random() * 1.5,
          r: 1.5 + Math.random() * 2,
          c: shadowCols[Math.floor(Math.random() * shadowCols.length)],
          life: 0.48,
          max: 0.48,
        });
      }

      // Éclairs cyan et violets
      if (Math.random() < 0.35) {
        this.st.parts.push({
          x: to.x + (Math.random() - 0.5) * 18,
          y: to.y - 18 + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -1.2,
          r: 3,
          c: Math.random() < 0.5 ? '#00e5ff' : '#e040fb',
          shape: 'bolt',
          life: 0.22,
          max: 0.22,
        });
      }
    });

    targetO.dx = 0;

    // 4. Cataclysme : Flash, déflagration & ondes de choc
    this.sound.sfx('hitstrong');
    this.tween(240, (u) => { this.st.screenFlash = 0.85 * (1 - u); });

    this.st.parts.push({ x: to.x, y: to.y - 4, vx: 0, vy: 0, r: 8, grow: 3.5, shape: 'ring', c: '#ffffff', life: 0.36, max: 0.36 });
    this.st.parts.push({ x: to.x, y: to.y - 4, vx: 0, vy: 0, r: 14, grow: 2.8, shape: 'ring', c: '#00e5ff', life: 0.42, max: 0.42 });
    this.st.parts.push({ x: to.x, y: to.y - 4, vx: 0, vy: 0, r: 20, grow: 2.2, shape: 'ring', c: '#7b1fa2', life: 0.48, max: 0.48 });

    this.burst(to.x, to.y - 4, shadowCols, 38, { speed: 3.4, r: 2.6 });
    await this.shakeScreen(7, 500);

    // 5. Atterrissage de Lugia Obscur
    await this.tween(220, (u) => {
      o.dy = -16 * (1 - ease(u));
      o.white = 0.45 * (1 - u);
    });
    o.dy = 0;
    o.white = 0;
    await wait(80);
  }
  async animHit(side, eff, crit) {
    const o = side === 1 ? this.st.foe : this.st.me;
    this.sound.sfx(eff > 1 || crit ? 'hitstrong' : eff < 1 ? 'hitweak' : 'hit');
    o.blink = true; if (eff > 1 || crit) this.shakeScreen(3, 200);
    await this.tween(360, (u) => { o.dx = Math.sin(u * 30) * 3 * (1 - u); });
    o.blink = false; o.dx = 0;
  }
  async animHp(side, from, to, status) {
    const m = this.battle.act(side), max = m.stats[0];
    const d = Math.abs(to - from), dur = Math.min(1100, 300 + d / max * 900);
    if (status !== undefined && side === 0) this.setHud(0, m, from);
    await this.tween(dur, (u) => this.setHp(side, from + (to - from) * u, max));
    this.setHp(side, to, max);
    if (side === 0 && to > 0 && to / max <= 0.2 && from / max > 0.2) this.sound.sfx('status');
  }
  async animStat(side, up) {
    const c = this.sprCenter(side);
    this.sound.sfx(up ? 'stat' : 'statdown');
    for (let i = 0; i < 16; i++) this.st.parts.push({ x: c.x - 24 + Math.random() * 48, y: c.y + (up ? 20 : -24) + Math.random() * 10, vx: 0, vy: up ? -1.2 : 1.2, r: 1.5, c: up ? '#ff8870' : '#70a0ff', life: 0.5, max: 0.5 });
    await wait(450);
  }
  async animStatus(side, k) {
    const c = this.sprCenter(side), cols = { sleep: ['#c0c8ff', '#ffffff'], confused: ['#ffe060', '#ffffff'], burn: ['#ff8030', '#ffd040'], poison: ['#b050c8', '#e090f0'], para: ['#ffe040', '#ffffff'], seed: ['#58c040', '#b0f080'], protect: ['#a0e0ff', '#ffffff'] }[k] || ['#fff'];
    if (k === 'protect') { this.st.parts.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: 22, grow: 0.2, shape: 'ring', c: '#a0e0ff', life: 0.5, max: 0.5 }); }
    else if (k === 'para') this.burst(c.x, c.y, cols, 8, { shape: 'bolt', speed: 1.2 });
    else this.burst(c.x, c.y - 4, cols, 10, { speed: 0.8, up: 0.7, r: 1.8 });
    await wait(380);
  }
  async animFaint(side) {
    const o = side === 1 ? this.st.foe : this.st.me, m = this.battle.act(side);
    this.sound.cry(ASSETS.cry(m.sp)); await wait(200);
    this.sound.sfx('faint');
    o.clipY = 0;
    await this.tween(420, (u) => { o.dy = 80 * u; });
    o.visible = false; o.dy = 0; o.clipY = null;
    this.setHud(side, null);
  }
  async animExp(e) {
    const bar = this.hud.me.querySelector('.bh-exp u');
    const go = (a, b, ms) => this.tween(ms, (u) => { bar.style.width = (a + (b - a) * u) * 100 + '%'; if (Math.random() < 0.3) this.sound.sfx('exp'); });
    if (e.lv > e.lv0) { await go(e.from, 1, 500); bar.style.width = '0%'; await go(0, e.to, 400); }
    else await go(e.from, e.to, Math.max(200, (e.to - e.from) * 1200));
  }
  async levelBox(e) {
    const names = ['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse'];
    const box = el('div', 'box lvbox', names.map((n, k) => `<div><span>${n}</span><b>+${e.after[k] - e.before[k]}</b></div>`).join(''));
    this.root.appendChild(box);
    await this.msg(`${monName(this.game.state.party[e.idx])} monte au niveau ${e.lvl} !`, { wait: true });
    box.innerHTML = names.map((n, k) => `<div><span>${n}</span><b>${e.after[k]}</b></div>`).join('');
    await new Promise((res) => { const pop = this.ui.input.push((k) => { if (k === 'a' || k === 'b') { pop(); res(); } }); });
    box.remove();
  }
  async animBall(e) {
    const ep = this.ePos(), tx = ep.x, ty = ep.y - 28;
    const startX = 14, startY = 156;
    const ball = { x: startX, y: startY, groundY: ep.y + 4, item: e.item || 'poke-ball', rot: 0, state: null };
    this.st.balls.push(ball);
    this.sound.sfx('throw');

    // 1. Trajectoire parabolique aérienne avec rotation et traînée d'étincelles
    let lastSpark = 0;
    await this.tween(560, (u) => {
      ball.x = startX + (tx - startX) * u;
      ball.y = startY + (ty - startY) * u - Math.sin(u * Math.PI) * 85;
      ball.rot = u * 16;
      if (performance.now() - lastSpark > 40) {
        lastSpark = performance.now();
        this.st.parts.push({
          x: ball.x, y: ball.y,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8 + 0.3,
          r: 1.5, c: u > 0.5 ? '#ffe080' : '#ffffff', life: 0.28, max: 0.28, shape: 'ring'
        });
      }
    });

    if (e.blocked) {
      this.sound.sfx('bump');
      await this.tween(300, (u) => { ball.x = tx + 70 * u; ball.y = ty - 25 * u + 40 * u * u; ball.rot += 0.2; });
      this.st.balls = [];
      return;
    }

    // 2. Arrivée au zénith : la Poké Ball s'ouvre !
    ball.state = 'open';
    ball.rot = 0;
    this.sound.sfx('poof');

    // Cône d'aspiration et flash d'énergie blanche/rouge
    const o = this.st.foe;
    o.white = 1;
    this.burst(tx, ty + 6, ['#ffffff', '#ff9090', '#ffe0a0'], 18, { speed: 2.2, r: 2.2 });

    // Faisceau d'aspiration qui absorbe le Pokémon
    await this.tween(320, (u) => {
      o.scale = Math.max(0.01, 1 - u);
      o.dy = -(u * 18);
      if (Math.random() < 0.4) {
        this.st.parts.push({
          x: tx + (Math.random() - 0.5) * 20,
          y: ty + 12 - u * 10,
          vx: (tx - (tx + (Math.random() - 0.5) * 20)) * 0.1,
          vy: (ty - (ty + 12)) * 0.1,
          r: 2, c: '#ff5555', life: 0.2, max: 0.2
        });
      }
    });
    o.visible = false;
    o.dy = 0;
    o.scale = 1;

    // La Ball se referme
    ball.state = null;
    await wait(60);

    // 3. Chute au sol avec double rebond réaliste
    const floorY = ep.y - 2;
    const fallStartY = ball.y;
    await this.tween(240, (u) => {
      ball.y = fallStartY + (floorY - fallStartY) * (u * u);
    });
    this.sound.sfx('bump');
    this.burst(ball.x, floorY + 6, ['rgba(0,0,0,0.3)', '#c0b090'], 6, { speed: 0.8, up: 0.5, r: 1.2 });
    
    // Premier rebond
    await this.tween(160, (u) => {
      ball.y = floorY - Math.sin(u * Math.PI) * 12;
    });
    this.sound.sfx('bump');
    
    // Deuxième petit rebond
    await this.tween(110, (u) => {
      ball.y = floorY - Math.sin(u * Math.PI) * 4;
    });
    ball.y = floorY;

    // 4. Secousses avec les sprites d'inclinaison gauche/droite
    for (let i = 0; i < e.shakes; i++) {
      await wait(360);
      this.sound.sfx('shake');
      ball.state = 'tilt-l';
      ball.x = tx - 3;
      await wait(140);
      ball.state = 'tilt-r';
      ball.x = tx + 3;
      await wait(140);
      ball.state = null;
      ball.x = tx;
      this.st.parts.push({ x: tx, y: floorY + 6, vx: -0.6, vy: -0.2, r: 1.2, c: '#a09080', life: 0.25, max: 0.25 });
      this.st.parts.push({ x: tx, y: floorY + 6, vx: 0.6, vy: -0.2, r: 1.2, c: '#a09080', life: 0.25, max: 0.25 });
    }

    await wait(420);

    // 5. Résultat
    if (e.caught) {
      this.sound.sfx('shake');
      this.burst(ball.x, ball.y - 4, ['#ffe040', '#ffffff', '#ffd020'], 16, { speed: 1.6, up: 1.2, r: 2 });
      this.st.parts.push({ x: ball.x, y: ball.y - 2, vx: 0, vy: 0, r: 6, grow: 1.4, shape: 'ring', c: '#ffe040', life: 0.45, max: 0.45 });
      this.sound.sfx('caught');
      await wait(600);
      this.setHud(1, null);
    } else {
      this.sound.sfx('poof');
      ball.state = 'open';
      this.burst(ball.x, ball.y, ['#ffffff', '#fff6a0', '#ff9090'], 20, { speed: 2.2 });
      await wait(80);
      this.st.balls = [];
      o.visible = true;
      o.white = 1;
      o.scale = 0.2;
      await this.tween(240, (u) => { o.scale = 0.2 + 0.8 * ease(u); });
      await this.tween(200, (u) => { o.white = 1 - u; });
      o.white = 0;
    }
    this.st.balls = this.st.balls.filter((q) => q !== ball || e.caught);
  }
  async shakeScreen(a, ms) { await this.tween(ms, (u) => { this.st.shakeX = (Math.random() - 0.5) * a * (1 - u) * 2; this.st.shakeY = (Math.random() - 0.5) * a * (1 - u); }); this.st.shakeX = this.st.shakeY = 0; }
}
